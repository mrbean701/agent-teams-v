#!/usr/bin/env node
/**
 * tools/sweep-suites.mjs — run the test suites once and CLASSIFY the result, mechanically.
 *
 * Why this exists: every audit round (14 so far) had to run every tests/t*.mjs by hand and then
 * decide by memory which red suites were real defects and which were artefacts of history
 * (a pack suite pinned to the source hashes of an older round always goes red once lib/ moves).
 * That judgement was made in prose, so it could not be reviewed. This tool makes it mechanical:
 *
 *   node tools/sweep-suites.mjs --list      list every suite, group it, run NOTHING
 *   node tools/sweep-suites.mjs --run       run the FAST group (timeout per suite, default 120 s)
 *   node tools/sweep-suites.mjs --run --include-live    also run the LIVE group (real boots)
 *   node tools/sweep-suites.mjs --run --only t11        only suites whose name contains "t11"
 *
 * CLASSIFICATION (one row per suite)
 *   PASS          suite exited 0
 *   FAIL          suite exited 1, or was killed by the timeout
 *   LEGACY        suite matches an entry of the exceptions list; NOT executed by default.
 *                 Every entry carries suite + args + reason + a file:line citation + a fix, and
 *                 the whole entry is printed verbatim, so the excuse is reviewable.
 *   UNCLASSIFIED  suite exited with anything else (2, 3, ... or a signal), or could not be run
 *                 at all (file missing). It is NEVER counted as green and never silently dropped.
 *
 * TOOL EXIT CODE
 *   0  no FAIL and no UNCLASSIFIED (LEGACY and skipped groups are allowed)
 *   1  at least one FAIL
 *   2  the tool itself is broken: no suite found, exceptions/manifest unreadable, bad argument
 *   3  at least one UNCLASSIFIED and no FAIL (the card requires "not zero, not green")
 *      ALSO returned when --strict is on and any suite printed a WARN line (a gate that
 *      announced it could not run is not green; see WARNINGS below)
 *
 * FROZEN SAMPLING (V19-F2) — the 13 release files (12 lib/** + package.json) are hashed BEFORE
 * and AFTER every executed suite. A difference means the source tree was written WHILE that suite
 * ran (the BUG-028 class: another process writes a file and restores the exact bytes), which is
 * invisible to any check that only samples around its own boot. A drift is reported per file with
 * both sha256 values and the byte delta, and it makes the suite FAIL — never merely a note.
 * The sampled root defaults to packages/dsh-agent-teams and can be pointed at a COPY with
 * --frozen-root, which is how the negative control proves the sampling works without touching the
 * real tree.
 *
 * WARNINGS (V19-F7) — every output line of a suite that starts with "WARN " is collected, counted
 * and printed verbatim under "== WARN lines". A suite that exits 0 while announcing that a gate
 * could not run (for example "WARN typescript was not found ... so the declaration compile gate
 * cannot run") is still classified PASS by rule, because the rule only reads the exit code; with
 * --strict that ambiguity is removed: any WARN means NOT green (exit 3). The default stays
 * exactly as before for the 8 LEGACY pack suites.
 *
 * LIVE vs FAST — detected from machine-readable evidence, never from a hard-coded name list.
 * A suite is LIVE when ALL of the following hold in its text:
 *   (L1) it references the desktop CLI harness (DESKTOP_CLI or dsh-cli.mjs)
 *   (L2) it spawns powershell.exe (the only way the harness boots a real session)
 *   (L3) it passes --json and reads the prompt from stdin ('-') to that CLI
 *   (L4) it does NOT drive npm pack (pack suites reference the CLI only to boot one smoke session)
 *   (L5) it does NOT pass --patch (capability-file suites boot a session with extra plumbing)
 * The matched signal names are printed per suite, so the grouping can be audited line by line and
 * overridden by a declared, reasoned entry in the exceptions file ({"suite": ..., "group": ...}).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const DEFAULT_ROOT = join(REPO_ROOT, 'tests');
const DEFAULT_TIMEOUT_MS = 120000;

const EXIT_GREEN = 0;
const EXIT_REAL_FAIL = 1;
const EXIT_TOOL_BROKEN = 2;
const EXIT_UNCLASSIFIED = 3;

const SUITE_RE = /^t\d+.*\.mjs$/;

/** The release table: 12 lib/** files + package.json. Same 13 rows every pack suite pins. */
const FROZEN_FILES = [
    'lib/tools.js',
    'lib/members.js',
    'lib/state.js',
    'lib/snapshot.js',
    'lib/index.js',
    'lib/tool-names.js',
    'lib/client.js',
    'lib/client.js.map',
    'lib/types/members.d.ts',
    'lib/types/snapshot.d.ts',
    'lib/types/tools.d.ts',
    'lib/client/ActivityPanel.module.css',
    'package.json',
];
const DEFAULT_FROZEN_ROOT = join(REPO_ROOT, 'packages', 'dsh-agent-teams');
/** A suite that announces a gate could not run prints exactly this prefix. */
const WARN_RE = /^WARN /u;

/** Embedded exceptions: artefacts of history that stay red by design. Overridden by --exceptions. */
const DEFAULT_EXCEPTIONS = [
    {"suite":"t35-pack-repack.mjs","args":[],"reason":"historical pack round: pins EXPECTED_TOOLS_SHA256 = 7fde7bbc49db1ba6 (round-3 tools.js), so it is red against today source by design","citation":"tests/t35-pack-repack.mjs:39","fix":"round-3 artefact; superseded by the shipped round-18 tarball; verify the shipped artefact with tests/t118-pack.mjs instead of re-running this round"},
    {"suite":"t84-pack.mjs","args":[],"reason":"historical pack round: pins FROZEN lib/tools.js = 75800e15fce2abf6 (round-11 table), so it is red against today source by design","citation":"tests/t84-pack.mjs:51","fix":"round-11 artefact; its meta also lacks the selfMutation field; verify the shipped artefact with tests/t118-pack.mjs instead of re-running this round"},
    {"suite":"t88-pack.mjs","args":[],"reason":"historical pack round: pins FROZEN lib/tools.js = 9be217b1669a2241 (round-12 table), so it is red against today source by design","citation":"tests/t88-pack.mjs:57","fix":"round-12 artefact; verify the shipped artefact with tests/t118-pack.mjs instead of re-running this round"},
    {"suite":"t92-pack.mjs","args":[],"reason":"historical pack round: pins FROZEN lib/tools.js = a9ad29f8ae87a884 (round-13 held run), so it is red against today source by design","citation":"tests/t92-pack.mjs:57","fix":"round-13 held artefact; the released round-13 tarball came from t96; verify the shipped artefact with tests/t118-pack.mjs instead of re-running this round"},
    {"suite":"t96-pack.mjs","args":[],"reason":"historical pack round: pins FROZEN lib/tools.js = 6150b7b287cb815d (round-13 table), so it is red against today source by design","citation":"tests/t96-pack.mjs:57","fix":"round-13 artefact; verify the shipped artefact with tests/t118-pack.mjs instead of re-running this round"},
    {"suite":"t100-pack.mjs","args":[],"reason":"historical pack round: pins FROZEN lib/tools.js = 5deb03ca93b2a8e9 (round-14 table), so it is red against today source by design","citation":"tests/t100-pack.mjs:57","fix":"round-14 artefact; verify the shipped artefact with tests/t118-pack.mjs instead of re-running this round"},
    {"suite":"t104-pack.mjs","args":[],"reason":"historical pack round: pins FROZEN lib/tools.js = 5deb03ca93b2a8e9 (round-15 table), so it is red against today source by design","citation":"tests/t104-pack.mjs:58","fix":"round-15 artefact; verify the shipped artefact with tests/t118-pack.mjs instead of re-running this round"},
    {"suite":"t108-pack.mjs","args":[],"reason":"historical pack round: pins FROZEN lib/tools.js = d402c6586df1e140 (round-17 table), so it is red against today source by design","citation":"tests/t108-pack.mjs:59","fix":"round-17 artefact; verify the shipped artefact with tests/t118-pack.mjs instead of re-running this round"},
];

const LIVE_SIGNALS = [
    { id: 'cli-harness', re: /DESKTOP_CLI|dsh-cli\.mjs/ },
    { id: 'powershell-spawn', re: /powershell\.exe/i },
    { id: 'json-stdin-boot', all: [/['"]--json['"]/, /['"]-['"]/] },
    { id: 'pack-runner', re: /npm\.cmd|spawnSync\(\s*['"]npm['"]/, disqualifier: true },
    { id: 'patch-caps', re: /['"]--patch['"]/, disqualifier: true },
];

function pad(value, width) {
    const text = String(value);
    return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function truncate(value, width) {
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text.length <= width ? text : text.slice(0, Math.max(0, width - 3)) + '...';
}

function tailLines(text, count) {
    return String(text ?? '')
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .slice(-count);
}

function detectLive(text) {
    const matched = [];
    let live = true;
    for (const signal of LIVE_SIGNALS) {
        let hit;
        if (signal.all) hit = signal.all.every((re) => re.test(text));
        else hit = signal.re.test(text);
        if (signal.disqualifier) {
            if (hit) {
                matched.push('-' + signal.id);
                live = false;
            }
            continue;
        }
        if (hit) matched.push(signal.id);
        else live = false;
    }
    return { live, signals: matched };
}

function discoverSuites(root) {
    const names = readdirSync(root)
        .filter((name) => SUITE_RE.test(name))
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    return names.map((name) => ({ name, file: join(root, name), origin: 'scan' }));
}

function readManifest(path, root) {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.suites;
    if (!Array.isArray(list) || list.length === 0) throw new Error('manifest has no suites array: ' + path);
    return list.map((entry) => {
        const rel = typeof entry === 'string' ? entry : entry.suite;
        if (typeof rel !== 'string' || rel.length === 0) throw new Error('manifest entry without a suite name: ' + JSON.stringify(entry));
        const declared = typeof entry === 'object' && typeof entry.file === 'string' ? entry.file : rel;
        // A declared suite is resolved against --root first, then against the repo root, so a manifest that
        // sits next to its fixtures can name them by basename. A name that resolves to neither stays MISSING
        // and is reported as UNCLASSIFIED -- never dropped, never green.
        const fromRoot = join(root, declared);
        const file = existsSync(fromRoot) ? fromRoot : resolve(REPO_ROOT, declared);
        return { name: basename(rel), file: resolve(REPO_ROOT, file), origin: 'manifest' };
    });
}

function loadExceptions(path) {
    if (path === undefined) return { entries: DEFAULT_EXCEPTIONS, origin: 'embedded (tools/sweep-suites.mjs)' };
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(list)) throw new Error('exceptions file has no entries array: ' + path);
    for (const entry of list) {
        if (typeof entry.suite !== 'string' || entry.suite.length === 0) throw new Error('exceptions entry without suite: ' + JSON.stringify(entry));
        const legacy = entry.group === undefined || entry.group === 'legacy';
        if (legacy && (typeof entry.reason !== 'string' || typeof entry.citation !== 'string')) {
            throw new Error('legacy exception needs reason + citation: ' + entry.suite);
        }
    }
    return { entries: list, origin: path };
}

function parseArgs(argv) {
    const opts = {
        list: false,
        run: false,
        includeLive: false,
        runLegacy: false,
        json: false,
        strict: false,
        root: DEFAULT_ROOT,
        frozenRoot: DEFAULT_FROZEN_ROOT,
        frozenRootExplicit: false,
        only: [],
        timeoutMs: DEFAULT_TIMEOUT_MS,
        exceptionsPath: undefined,
        manifestPath: undefined,
        help: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--list') { opts.list = true; continue; }
        if (arg === '--run') { opts.run = true; continue; }
        if (arg === '--include-live') { opts.includeLive = true; continue; }
        if (arg === '--run-legacy') { opts.runLegacy = true; continue; }
        if (arg === '--json') { opts.json = true; continue; }
        if (arg === '--strict') { opts.strict = true; continue; }
        if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
        if (arg === '--root' || arg === '--only' || arg === '--timeout' || arg === '--exceptions' || arg === '--manifest' || arg === '--frozen-root') {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('--')) return { error: 'missing value for ' + arg };
            i += 1;
            if (arg === '--root') opts.root = resolve(REPO_ROOT, value);
            else if (arg === '--frozen-root') { opts.frozenRoot = resolve(REPO_ROOT, value); opts.frozenRootExplicit = true; }
            else if (arg === '--only') opts.only = value.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
            else if (arg === '--timeout') {
                const ms = Number(value);
                if (!Number.isFinite(ms) || ms <= 0) return { error: 'bad --timeout value: ' + value };
                opts.timeoutMs = ms;
            } else if (arg === '--exceptions') opts.exceptionsPath = resolve(REPO_ROOT, value);
            else opts.manifestPath = resolve(REPO_ROOT, value);
            continue;
        }
        return { error: 'unknown argument: ' + arg };
    }
    if (opts.list && opts.run) return { error: 'use either --list or --run, not both' };
    if (!opts.list && !opts.run) opts.list = true;
    return opts;
}

function runSuite(row, timeoutMs) {
    const started = Date.now();
    const result = spawnSync(process.execPath, [row.file, ...row.args], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 64 * 1024 * 1024,
        env: process.env,
    });
    const elapsedMs = Date.now() - started;
    const timedOut = result.error !== undefined && result.error !== null && /ETIMEDOUT|timed? out/i.test(String(result.error.message ?? result.error));
    const stdout = result.stdout ?? '';
    const stderr = result.stderr ?? '';
    const merged = (stdout + '\n' + stderr).trim();
    const sessions = new Set((merged.match(/session-[0-9a-f]{8}/gu) ?? []).map((id) => id));
    // V19-F7: a suite that says a gate could not run must not disappear into "exit 0".
    const warnings = merged
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => WARN_RE.test(line));
    return {
        exitCode: result.status === null ? null : result.status,
        signal: result.signal ?? null,
        timedOut: timedOut || (result.status === null && result.signal !== null && result.signal !== undefined),
        elapsedMs,
        sessions: [...sessions],
        warnings,
        tail: tailLines(merged, 3),
    };
}

// ------------------------------------------------------------- frozen sampling
/** Snapshot the 13 release files: relative path -> {sha256, bytes}, or null when the file is absent. */
function frozenSnapshot(root) {
    const snapshot = { root, at: new Date().toISOString(), files: {} };
    for (const rel of FROZEN_FILES) {
        const abs = join(root, ...rel.split('/'));
        try {
            const buffer = readFileSync(abs);
            snapshot.files[rel] = { sha256: createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length };
        } catch {
            snapshot.files[rel] = null;
        }
    }
    return snapshot;
}

/** Compare two snapshots of the same root. Missing on both sides counts as unchanged. */
function driftBetween(before, after) {
    const drift = [];
    for (const rel of FROZEN_FILES) {
        const was = before.files[rel];
        const isNow = after.files[rel];
        const same = was === null || isNow === null
            ? was === isNow
            : was.sha256 === isNow.sha256 && was.bytes === isNow.bytes;
        if (same) continue;
        drift.push({
            file: rel,
            shaBefore: was === null ? 'MISSING' : was.sha256,
            shaAfter: isNow === null ? 'MISSING' : isNow.sha256,
            bytesBefore: was === null ? 0 : was.bytes,
            bytesAfter: isNow === null ? 0 : isNow.bytes,
        });
    }
    return drift;
}

function driftText(item) {
    const delta = item.bytesAfter - item.bytesBefore;
    return item.file + ' shaBefore=' + item.shaBefore.slice(0, 16) + ' shaAfter=' + item.shaAfter.slice(0, 16)
        + ' bytesBefore=' + item.bytesBefore + ' bytesAfter=' + item.bytesAfter
        + ' delta=' + (delta >= 0 ? '+' + delta : String(delta));
}

function classify(row, outcome, afterRun) {
    if (row.group === 'legacy') return 'LEGACY';
    if (!row.exists) return 'UNCLASSIFIED';
    if (!afterRun) return row.group === 'live' ? 'SKIPPED-LIVE' : 'SKIPPED-LEGACY';
    if (outcome.timedOut) return 'UNCLASSIFIED-timeout-candidate';
    return 'pending';
}

function decideExit(rows, opts) {
    if (rows.some((row) => row.verdict === 'FAIL')) return EXIT_REAL_FAIL;
    if (rows.some((row) => row.verdict === 'UNCLASSIFIED')) return EXIT_UNCLASSIFIED;
    // V19-F7: --strict refuses to call a suite green while it announces that a gate could not run.
    if (opts !== undefined && opts.strict === true && rows.some((row) => (row.warnings ?? []).length > 0)) return EXIT_UNCLASSIFIED;
    return EXIT_GREEN;
}

function main(argv) {
    const opts = parseArgs(argv);
    if (opts.error !== undefined) {
        console.error('sweep-suites: ' + opts.error);
        console.error('usage: node tools/sweep-suites.mjs [--list|--run] [--include-live] [--only a,b] [--timeout ms] [--root dir] [--frozen-root dir] [--strict] [--exceptions file] [--manifest file] [--json]');
        return EXIT_TOOL_BROKEN;
    }
    if (opts.help) {
        console.log('node tools/sweep-suites.mjs --list | --run [--include-live] [--only t11] [--timeout 120000] [--frozen-root dir] [--strict] [--json]');
        return EXIT_GREEN;
    }

    let exceptions;
    try {
        exceptions = loadExceptions(opts.exceptionsPath);
    } catch (error) {
        console.error('sweep-suites: exceptions list unreadable: ' + String(error.message ?? error));
        return EXIT_TOOL_BROKEN;
    }

    let discovered;
    try {
        discovered = opts.manifestPath === undefined ? discoverSuites(opts.root) : readManifest(opts.manifestPath, opts.root);
    } catch (error) {
        console.error('sweep-suites: cannot read the suite list: ' + String(error.message ?? error));
        return EXIT_TOOL_BROKEN;
    }

    const bySuite = new Map();
    for (const entry of exceptions.entries) bySuite.set(basename(entry.suite), entry);

    const rows = [];
    for (const suite of discovered) {
        const exists = existsSync(suite.file);
        const text = exists ? readFileSync(suite.file, 'utf8') : '';
        const detection = exists ? detectLive(text) : { live: false, signals: ['missing'] };
        const exception = bySuite.get(suite.name);
        let group = detection.live ? 'live' : 'fast';
        let override = undefined;
        if (exception !== undefined && exception.group === 'live') { group = 'live'; override = 'exception'; }
        if (exception !== undefined && exception.group === 'fast') { group = 'fast'; override = 'exception'; }
        const legacy = exception !== undefined && (exception.group === undefined || exception.group === 'legacy');
        rows.push({
            name: suite.name,
            file: suite.file,
            exists,
            origin: suite.origin,
            group: group === 'live' ? 'live' : 'fast',
            live: group === 'live',
            signals: detection.signals,
            override,
            legacy,
            exception,
            args: legacy && Array.isArray(exception.args) ? exception.args : [],
            ran: false,
            exitCode: null,
            verdict: 'pending',
            tail: [],
            elapsedMs: 0,
            sessions: [],
            warnings: [],
            drift: [],
            sampled: false,
            note: '',
        });
    }

    const only = opts.only.map((part) => part.toLowerCase());
    const scoped = only.length === 0 ? rows : rows.filter((row) => only.some((part) => row.name.toLowerCase().includes(part)));
    const considered = opts.manifestPath === undefined ? scoped : scoped;
    if (considered.length === 0) {
        console.error('sweep-suites: no suite found' + (only.length ? ' for --only ' + opts.only.join(',') : '') + ' under ' + (opts.manifestPath ?? opts.root));
        return EXIT_TOOL_BROKEN;
    }

    if (opts.list) {
        return printList(considered, opts, exceptions);
    }
    return runAll(considered, opts, exceptions);
}

function printList(rows, opts, exceptions) {
    const live = rows.filter((row) => row.group === 'live');
    const fast = rows.filter((row) => row.group === 'fast');
    console.log('== suites under ' + (opts.manifestPath ?? opts.root) + ' (--list, nothing was executed) ==');
    console.log(pad('suite', 42) + pad('group', 8) + pad('legacy', 8) + 'signals');
    for (const row of rows) {
        row.verdict = row.legacy ? 'LEGACY' : row.group === 'live' ? 'SKIPPED-LIVE' : 'SKIPPED-LEGACY';
        console.log(pad(row.name, 42) + pad(row.group, 8) + pad(row.legacy ? 'LEGACY' : '-', 8) + (row.signals.join(',') || '-') + (row.override ? ' [override]' : '') + (row.exists ? '' : ' [MISSING]'));
    }
    console.log('');
    console.log('totals: ' + rows.length + ' suite(s) = ' + live.length + ' LIVE + ' + fast.length + ' fast; legacy exceptions: ' + rows.filter((row) => row.legacy).length);
    if (live.length > 0) {
        console.log('LIVE group (' + live.length + '): ' + live.map((row) => row.name).join(', '));
        console.log('they boot a real session and spend quota: skipped unless --include-live');
    }
    console.log('exceptions source: ' + exceptions.origin);
    if (opts.json) console.log(JSON.stringify({ mode: 'list', rows: rows.map((row) => ({ suite: row.name, group: row.group, legacy: row.legacy, signals: row.signals, exists: row.exists, ran: false, verdict: row.verdict })), exitCode: EXIT_GREEN }, null, 1));
    return EXIT_GREEN;
}

function runAll(rows, opts, exceptions) {
    console.log('== sweep: ' + rows.length + ' suite(s) considered, timeout ' + opts.timeoutMs + ' ms per suite ==');
    const frozenRoot = opts.frozenRoot;
    const sampling = existsSync(frozenRoot);
    if (!sampling) {
        if (opts.frozenRootExplicit === true) {
            console.error('sweep-suites: --frozen-root does not exist: ' + frozenRoot + ' (frozen sampling cannot run, so the sweep refuses to claim green)');
            return EXIT_TOOL_BROKEN;
        }
        console.log('frozen sampling: SKIPPED — root missing (' + frozenRoot + '); nothing is sampled, so a tree write cannot be seen');
    } else {
        console.log('frozen sampling: ' + FROZEN_FILES.length + ' files under ' + frozenRoot + ', hashed before AND after every executed suite');
    }
    let boots = 0;
    let samples = 0;
    const skippedLive = [];
    for (const row of rows) {
        if (row.legacy && !opts.runLegacy) {
            row.verdict = 'LEGACY';
            row.note = 'not executed (legacy exception)';
            continue;
        }
        if (row.group === 'live' && !opts.includeLive) {
            skippedLive.push(row.name);
            row.verdict = 'SKIPPED-LIVE';
            row.note = 'not executed (live group)';
            continue;
        }
        if (!row.exists) {
            row.verdict = 'UNCLASSIFIED';
            row.note = 'suite file missing: ' + row.file;
            continue;
        }
        const before = sampling ? frozenSnapshot(frozenRoot) : undefined;
        const outcome = runSuite(row, opts.timeoutMs);
        const after = sampling ? frozenSnapshot(frozenRoot) : undefined;
        row.sampled = sampling;
        if (before !== undefined && after !== undefined) {
            samples += 1;
            row.drift = driftBetween(before, after);
        }
        row.ran = true;
        row.exitCode = outcome.exitCode;
        row.tail = outcome.tail;
        row.elapsedMs = outcome.elapsedMs;
        row.sessions = outcome.sessions;
        row.warnings = outcome.warnings;
        boots += outcome.sessions.length;
        if (row.drift.length > 0) {
            const what = 'frozen source was WRITTEN while this suite ran: ' + row.drift.map(driftText).join(' ; ');
            if (!row.legacy) {
                row.verdict = 'FAIL';
                row.note = what;
                continue;
            }
            row.note = what;
            row.verdict = 'LEGACY';
            continue;
        }
        if (row.legacy) {
            row.verdict = 'LEGACY';
            row.note = 'executed with --run-legacy; still LEGACY (exit ' + String(outcome.exitCode) + ')';
            continue;
        }
        if (outcome.timedOut) {
            row.verdict = 'FAIL';
            row.note = 'timeout after ' + opts.timeoutMs + ' ms';
            continue;
        }
        if (outcome.exitCode === 0) { row.verdict = 'PASS'; continue; }
        if (outcome.exitCode === 1) { row.verdict = 'FAIL'; row.note = 'exit 1'; continue; }
        row.verdict = 'UNCLASSIFIED';
        row.note = 'exit ' + String(outcome.exitCode) + (outcome.signal ? ' signal ' + outcome.signal : '') + ' — neither 0 nor 1, so it is not classified as green or red by rule';
    }

    console.log('');
    console.log(pad('suite', 42) + pad('exit', 7) + pad('class', 15) + pad('ms', 8) + 'last trace');
    for (const row of rows) {
        const exitText = row.ran ? (row.exitCode === null ? 'signal' : String(row.exitCode)) : '-';
        const trace = row.tail.length === 0 ? (row.note || '-') : row.tail.join(' | ');
        console.log(pad(row.name, 42) + pad(exitText, 7) + pad(row.verdict, 15) + pad(row.ran ? String(row.elapsedMs) : '-', 8) + truncate(trace, 150));
        if (row.note !== '' && row.ran) console.log(pad('', 42) + 'note: ' + row.note);
    }
    console.log('');

    // ---- frozen drift (V19-F2): printed even when 0, so "nothing moved" is itself evidence
    const drifted = rows.filter((row) => (row.drift ?? []).length > 0);
    if (drifted.length > 0) {
        console.log('== FROZEN DRIFT (' + drifted.length + ' suite) — the source was written while the suite ran ==');
        for (const row of drifted) {
            for (const item of row.drift) console.log('  ' + row.name + '  ' + driftText(item));
        }
        console.log('');
    }
    console.log('frozen sampling: ' + samples + '/' + rows.filter((row) => row.ran).length + ' executed suite(s) sampled around the run · drift suites=' + drifted.length);

    // ---- WARN lines (V19-F7): a gate that announced it could not run must be visible
    const warned = rows.filter((row) => (row.warnings ?? []).length > 0);
    const warnTotal = warned.reduce((sum, row) => sum + row.warnings.length, 0);
    console.log('warnings: ' + warnTotal + ' WARN line(s) in ' + warned.length + ' suite(s)' + (opts.strict ? ' (--strict: any WARN is NOT green)' : ' (default: WARN is printed, the exit code still follows the suite code)'));
    if (warned.length > 0) {
        console.log('== WARN lines (' + warnTotal + ') — verbatim, never silently dropped ==');
        for (const row of warned) {
            console.log('- ' + row.name + ' warnCount=' + row.warnings.length);
            for (const line of row.warnings) console.log('    | ' + line);
        }
        console.log('');
    }

    const legacy = rows.filter((row) => row.verdict === 'LEGACY');
    if (legacy.length > 0) {
        console.log('== LEGACY exceptions (' + legacy.length + ') — printed verbatim, not green ==');
        for (const row of legacy) {
            const entry = row.exception;
            console.log('- ' + row.name + ' args=' + JSON.stringify(Array.isArray(entry.args) ? entry.args : []) + ' [' + (row.ran ? 'executed' : 'skipped') + ']');
            console.log('    reason:   ' + (entry.reason ?? '(none)'));
            console.log('    citation: ' + (entry.citation ?? '(none)'));
            console.log('    fix:      ' + (entry.fix ?? '(none)'));
        }
        console.log('');
    }
    if (skippedLive.length > 0) {
        console.log('skipped (live): ' + skippedLive.length + ' suite — dung --include-live de chay: ' + skippedLive.join(', '));
    }
    const counts = {
        PASS: rows.filter((row) => row.verdict === 'PASS').length,
        FAIL: rows.filter((row) => row.verdict === 'FAIL').length,
        LEGACY: legacy.length,
        UNCLASSIFIED: rows.filter((row) => row.verdict === 'UNCLASSIFIED').length,
        SKIPPED: rows.filter((row) => row.verdict === 'SKIPPED-LIVE').length,
        WARN: warnTotal,
        DRIFT: drifted.length,
    };
    console.log('summary: PASS=' + counts.PASS + ' FAIL=' + counts.FAIL + ' LEGACY=' + counts.LEGACY + ' UNCLASSIFIED=' + counts.UNCLASSIFIED + ' skipped(live)=' + counts.SKIPPED + ' WARN=' + counts.WARN + ' DRIFT=' + counts.DRIFT);
    console.log('boot sessions executed: ' + boots + (opts.includeLive ? ' (live group was included)' : ' (live group was NOT included)'));
    const exitCode = decideExit(rows, opts);
    console.log('tool exit code: ' + exitCode + ' (0 = green, 1 = at least one FAIL, 2 = tool broken, 3 = UNCLASSIFIED only or --strict with a WARN line; code 3 is a local extension, still non-zero so never green)');
    console.log('exceptions source: ' + exceptions.origin);
    if (opts.json) {
        console.log(JSON.stringify({
            mode: 'run',
            timeoutMs: opts.timeoutMs,
            includeLive: opts.includeLive,
            strict: opts.strict,
            frozenRoot,
            samples,
            rows: rows.map((row) => ({
                suite: row.name,
                group: row.group,
                ran: row.ran,
                exitCode: row.exitCode,
                verdict: row.verdict,
                note: row.note,
                tail: row.tail,
                sessions: row.sessions,
                elapsedMs: row.elapsedMs,
                warnCount: (row.warnings ?? []).length,
                warnings: row.warnings ?? [],
                sampled: row.sampled,
                drift: row.drift ?? [],
            })),
            counts,
            boots,
            exitCode,
        }, null, 1));
    }
    return exitCode;
}

process.exitCode = main(process.argv.slice(2));
