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
 * --strict that ambiguity is removed: any gate WARN means NOT green (exit 3).
 *
 * V20-F2 (t134) — a suite can PRINT a WARN without a gate having failed to run: tests/t56-types-fallback.mjs
 * case d20 exercises BOTH branches of the declaration gate, so its output carries
 * "FATAL typescript was not found ..." immediately followed by "WARN typescript was not found ...".
 * Counting that line made every green run of t56 report a warning, and --strict would refuse a green
 * tree. So the raw set is split by evidence instead of by name: a "WARN " line counts as a GATE
 * warning only when the suite printed no FATAL/ERROR line in the same run. A suite that prints a hard
 * severity is demonstrating the severity contract, not reporting a skipped gate. Nothing is hidden:
 * every raw line is still printed verbatim, tagged [fixture] when excluded, and the two counts are
 * printed separately (WARN= gate lines, WARN_FIXTURE= demonstrated lines). Only gate lines reach
 * --strict. Honest limit: if one suite both demonstrates a hard severity and truly skips a gate, its
 * WARN is not counted — the raw line is still printed, so a reader can still see it.
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
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const DEFAULT_ROOT = join(REPO_ROOT, 'tests');
const PACKAGES_ROOT = join(REPO_ROOT, 'packages');
const toPosixRel = (absolute) => relative(REPO_ROOT, absolute).split(sep).join('/');
/**
 * V21-F1: the round-21 audit found that a suite living under packages/<pkg>/tests was INVISIBLE to the
 * sweep, so packages/dsh-agent-teams/tests/t130-pack.mjs could stay red for a whole round without a row
 * saying so. Every existing packages/<pkg>/tests directory is therefore a scan root of its own, and the
 * roots that were scanned (or skipped, with the reason) are printed on every invocation.
 */
function discoverPackageTestRoots() {
    let entries;
    try {
        entries = readdirSync(PACKAGES_ROOT, { withFileTypes: true });
    } catch (error) {
        return [];
    }
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(PACKAGES_ROOT, entry.name, 'tests'))
        .filter((dir) => existsSync(dir))
        .sort((a, b) => a.localeCompare(b, 'en'));
}
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
/** A hard severity: no green run carries one, so a suite that prints it is demonstrating the contract. */
const HARD_SEVERITY_RE = /^(?:FATAL|ERROR) /u;

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
    {"suite":"t118-pack.mjs","args":[],"reason":"historical pack round: its FROZEN table and FROZEN_TARBALL pin the round-18 artefact (lib/client.js.map 1f1d1552, tarball 1bb0ef1f), so it is red against today source by design (V20-F3)","citation":"tests/t118-pack.mjs:49","fix":"round-18 artefact; the current round is checked by packages/dsh-agent-teams/tests/t130-pack.mjs (and by the next round suite); keep this one only to reproduce the round-18 tarball on a machine that still has profile agent-teams-pack17"},
    // V21-F1: the suites below live INSIDE the package (packages/dsh-agent-teams/tests) and were
    // therefore invisible to the sweep until this round. The three pack suites pin the bytes of their own
    // round, so they are red against today source by design; the round-21 suite is the one that stays green.
    {"suite":"t111-pack.mjs","args":[],"reason":"historical pack round: pins the round-18 bytes (lib/client.js.map bbf88608f54e966f, tarball 1bb0ef1f), so it is red against today source by design (V21-F1)","citation":"packages/dsh-agent-teams/tests/t111-pack.mjs:79","fix":"round-18 artefact; superseded by packages/dsh-agent-teams/tests/t135-pack.mjs (round 21); keep it to reproduce the round-18 tarball and do NOT re-pin it"},
    {"suite":"t121-pack.mjs","args":[],"reason":"historical pack round: pins the round-19 bytes (lib/client.js.map bbf88608f54e966f, tarball 2770fbfc), so it is red against today source by design (V21-F1)","citation":"packages/dsh-agent-teams/tests/t121-pack.mjs:380","fix":"round-19 artefact; superseded by packages/dsh-agent-teams/tests/t135-pack.mjs (round 21); do NOT re-pin it"},
    {"suite":"t130-pack.mjs","args":[],"reason":"historical pack round: pins the round-20 byte set (lib/client.js.map 1f1d1552, tarball d34be2af), so it is red against today source by design (V21-F1). Why LEGACY was chosen over re-pinning, and why re-pinning would be a lie, is written in the file itself","citation":"packages/dsh-agent-teams/tests/t130-pack.mjs:395","fix":"round-20 artefact; superseded by packages/dsh-agent-teams/tests/t135-pack.mjs (round 21). A re-pin would claim that round-20 bytes carry the round-21 map, and its A7 three-way check would still compare against the round-20 install (agent-teams-pack19), turning a red by design into a false green claim"},
    // Not an artefact of history: the CURRENT round-21 suite packs twice and boots a real headless
    // session, so a sweep must not spend quota on it by accident. Grouped live = still listed, still in
    // the table, skipped by default; a direct run or --include-live still executes it.
    {"suite":"t135-pack.mjs","args":[],"group":"live","reason":"current round (21) release suite: a plain run executes npm pack twice AND boots a real headless session, so it must not be swept silently; grouping it live keeps it visible in the table but skipped unless asked (V21-F1)","citation":"packages/dsh-agent-teams/tests/t135-pack.mjs:206","fix":"run it directly (node packages/dsh-agent-teams/tests/t135-pack.mjs --fresh) or pass --include-live; it must never be reclassified LEGACY while round 21 is the released set"},
    // V23-F3: the round-22/23 layout rewrote the panel, so the round-19 runtime gate and the round-22
    // pack suite pin bytes that no longer exist. They stay in the tree as history; they are not gates on
    // today bytes, and a sweep that calls them FAIL reads like a regression that is not there.
    {"suite":"t132-panel-runtime.mjs","args":[],"reason":"historical layout gate: it measures the FIVE-sibling order of the pre-t139 panel (ProgressOverview -> DependencyMap -> AddMemberControl -> member list -> WorkspaceSummary) on the INSTALLED bundle of profile agent-teams-pack19 and pins that bundle at 377bcea2/258432, so it is red against the round-23 three-block panel by design (V23-F3, audit t144)","citation":"tests/t132-panel-runtime.mjs:36","fix":"superseded for the shipped layout by tests/t128-panel-order.mjs (source order) and packages/dsh-agent-teams/tests/t143-pack.mjs A13 (byte proof on the installed bundle); keep this one to re-prove the round-19 panel on a machine that still has profile agent-teams-pack19, and never re-pin it to today bytes"},
    {"suite":"t132-panel-dom-order.mjs","args":[],"reason":"thin wrapper: it forwards argv and the exit code to tests/t132-panel-runtime.mjs, so it inherits that suite's round-19 pins and fails for the same reason (V23-F3, audit t144)","citation":"tests/t132-panel-dom-order.mjs:10","fix":"no gate of its own; the wrapper name is the card name from t132. Run t132-panel-runtime.mjs directly if the round-19 panel proof is ever needed"},
    {"suite":"t133-analyze-idempotent.mjs","args":[],"reason":"it re-runs the RECORDED round-19/20 t132 artifact at tests/tmp/t132/run-2026-11-01T04-08-52-492Z (a frozen run directory), so its A1/A12 fail as soon as the shipped bytes move on (V23-F3, audit t144)","citation":"tests/t133-analyze-idempotent.mjs:15","fix":"an idempotence proof of the t132 recorder on a byte set that no longer ships; re-record it only if the recorder itself is being changed, otherwise it proves nothing about round 23"},
    {"suite":"t140-pack.mjs","args":[],"reason":"historical pack round: pins the round-22 byte set (lib/client.js.map b1693659, tarball 62ad2275 is round 23 so it differs) and installs into profile agent-teams-pack21, so it is red against today source by design (V23-F3/F4, audit t144)","citation":"packages/dsh-agent-teams/tests/t140-pack.mjs:399","fix":"round-22 artefact; superseded by packages/dsh-agent-teams/tests/t143-pack.mjs (round 23). Do NOT re-pin it: its A19 table compare is written against the round-22 rows and a re-pin would claim the round-22 bytes carry the round-23 map"},
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
    let pack = false;
    for (const signal of LIVE_SIGNALS) {
        let hit;
        if (signal.all) hit = signal.all.every((re) => re.test(text));
        else hit = signal.re.test(text);
        if (signal.disqualifier) {
            if (hit) {
                matched.push('-' + signal.id);
                live = false;
                // V23-F3(b): a suite that runs `npm pack` builds the release AND boots a session, so it can
                // never be part of an unqualified --run: two packs plus a boot outlast the per-suite timeout
                // and spend quota. It is its own skipped group, never LEGACY and never PASS.
                if (signal.id === 'pack-runner') pack = true;
            }
            continue;
        }
        if (hit) matched.push(signal.id);
        else live = false;
    }
    return { live, pack, signals: matched };
}

function discoverSuites(root) {
    const names = readdirSync(root)
        .filter((name) => SUITE_RE.test(name))
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    return names.map((name) => ({ name, file: join(root, name), origin: 'scan', root }));
}

/**
 * Merge per-root discoveries. A basename that exists in two roots is NEVER merged away: both rows stay,
 * and both are renamed to their repo-relative path so --only and the exceptions list still address them.
 */
function mergeDiscoveries(perRoot) {
    const byName = new Map();
    const entries = [];
    const duplicates = [];
    for (const entry of perRoot) {
        const first = byName.get(entry.name);
        if (first === undefined) {
            byName.set(entry.name, entry);
            entries.push(entry);
            continue;
        }
        if (first.name === basename(first.file)) first.name = toPosixRel(first.file);
        entry.name = toPosixRel(entry.file);
        entries.push(entry);
        duplicates.push(entry.name);
    }
    return { entries, duplicates };
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
    if (path === undefined) return { entries: DEFAULT_EXCEPTIONS, origin: 'embedded (tools/sweep-suites.mjs)', problems: exceptionProblems(DEFAULT_EXCEPTIONS) };
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(list)) throw new Error('exceptions file has no entries array: ' + path);
    for (const entry of list) {
        if (typeof entry.suite !== 'string' || entry.suite.length === 0) throw new Error('exceptions entry without suite: ' + JSON.stringify(entry));
    }
    return { entries: list, origin: path, problems: exceptionProblems(list) };
}

/**
 * V23-F3: a legacy exception is a CLAIM about one suite — that it is red for a named, openable reason.
 * The claim is worth nothing without that reason and a file:line a reviewer can actually open, so both
 * are required, the citation must be file:line, and the cited line must exist. An entry that fails this
 * test does NOT whitelist its suite: the suite runs for real and the sweep cannot report green.
 */
const CITATION_RE = /^(.+):(\d+)$/u;
function exceptionProblems(entries) {
    const problems = [];
    for (const entry of entries) {
        const legacy = entry.group === undefined || entry.group === 'legacy';
        if (!legacy) continue;
        const suite = String(entry.suite ?? '(no suite)');
        const missing = [];
        if (typeof entry.reason !== 'string' || entry.reason.trim() === '') missing.push('reason');
        if (typeof entry.fix !== 'string' || entry.fix.trim() === '') missing.push('fix');
        if (typeof entry.citation !== 'string' || entry.citation.trim() === '') missing.push('citation');
        if (missing.length > 0) {
            problems.push({ suite, problem: 'missing ' + missing.join('+'), citation: typeof entry.citation === 'string' ? entry.citation : '' });
            continue;
        }
        const match = CITATION_RE.exec(entry.citation.trim());
        if (match === null) {
            problems.push({ suite, problem: 'citation is not file:line', citation: entry.citation });
            continue;
        }
        const cited = resolve(REPO_ROOT, match[1]);
        if (!existsSync(cited)) {
            problems.push({ suite, problem: 'cited file does not exist', citation: entry.citation });
            continue;
        }
        const lineCount = readFileSync(cited, 'utf8').split('\n').length;
        const line = Number(match[2]);
        if (!Number.isInteger(line) || line < 1 || line > lineCount) {
            problems.push({ suite, problem: 'cited line ' + line + ' is outside the ' + lineCount + ' lines of the cited file', citation: entry.citation });
        }
    }
    return problems;
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
        rootExplicit: false,
        extraRoots: [],
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
        if (arg === '--root' || arg === '--extra-root' || arg === '--only' || arg === '--timeout' || arg === '--exceptions' || arg === '--manifest' || arg === '--frozen-root') {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('--')) return { error: 'missing value for ' + arg };
            i += 1;
            if (arg === '--root') { opts.root = resolve(REPO_ROOT, value); opts.rootExplicit = true; }
            else if (arg === '--extra-root') opts.extraRoots.push(resolve(REPO_ROOT, value));
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

/**
 * V20-F2: split the severity lines a suite printed into GATE warnings and fixture demonstrations.
 * Returns { gate, fixture, hard, demonstrated, all } — gate is what --strict and the counters use.
 */
function classifySeverity(text) {
    const lines = String(text ?? '')
        .split(/\r?\n/u)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
    const warn = lines.filter((line) => WARN_RE.test(line));
    const hard = lines.filter((line) => HARD_SEVERITY_RE.test(line));
    const demonstrated = hard.length > 0;
    return {
        gate: demonstrated ? [] : warn,
        fixture: demonstrated ? warn : [],
        hard,
        demonstrated,
        all: lines.filter((line) => WARN_RE.test(line) || HARD_SEVERITY_RE.test(line)),
    };
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
    // V19-F7 + V20-F2: a suite that says a gate could not run must not disappear into "exit 0",
    // but a suite that PRINTS the severity contract as a fixture must not be counted as a gate.
    const severity = classifySeverity(merged);
    return {
        exitCode: result.status === null ? null : result.status,
        signal: result.signal ?? null,
        timedOut: timedOut || (result.status === null && result.signal !== null && result.signal !== undefined),
        elapsedMs,
        sessions: [...sessions],
        warnings: severity.gate,
        fixtureWarnings: severity.fixture,
        severityDemonstrated: severity.demonstrated,
        hardSeverityLines: severity.hard,
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
    let scanRoots;
    let duplicates = [];
    try {
        if (opts.manifestPath !== undefined) {
            discovered = readManifest(opts.manifestPath, opts.root);
            console.log('scan roots: manifest mode — ' + toPosixRel(opts.manifestPath) + ' names every suite, so no directory is scanned');
        } else {
            // An explicit --root replaces the whole list (fixture runs must stay deterministic); the default
            // list is the repo tests directory PLUS every packages/<pkg>/tests directory (V21-F1).
            scanRoots = opts.rootExplicit === true
                ? [opts.root, ...opts.extraRoots]
                : [...new Set([opts.root, ...discoverPackageTestRoots(), ...opts.extraRoots])];
            const perRoot = [];
            for (const dir of scanRoots) {
                if (!existsSync(dir)) continue;
                perRoot.push(...discoverSuites(dir));
            }
            const merged = mergeDiscoveries(perRoot);
            discovered = merged.entries;
            duplicates = merged.duplicates;
            console.log('scan roots (' + scanRoots.length + '): ' + scanRoots
                .map((dir) => toPosixRel(dir) + (existsSync(dir) ? '' : ' [MISSING: skipped, reported not silent]'))
                .join(' + '));
            const skipped = scanRoots.filter((dir) => !existsSync(dir));
            if (skipped.length > 0) {
                console.log('scan roots SKIPPED (' + skipped.length + '): ' + skipped.map(toPosixRel).join(', ')
                    + ' — a directory that does not exist cannot contribute a suite, and saying so is not the same as assuming it is empty');
            }
            if (duplicates.length > 0) console.log('duplicate suite basenames kept apart by repo-relative path: ' + duplicates.join(', '));
        }
    } catch (error) {
        console.error('sweep-suites: cannot read the suite list: ' + String(error.message ?? error));
        return EXIT_TOOL_BROKEN;
    }

    const bySuite = new Map();
    for (const entry of exceptions.entries) bySuite.set(basename(entry.suite), entry);
    // V23-F3: an entry that fails validation never whitelists its suite. The row keeps the reason it was
    // rejected for, so the report says WHY it is red instead of quietly listing it as LEGACY.
    const problemByName = new Map();
    for (const problem of exceptions.problems ?? []) problemByName.set(basename(problem.suite), problem);

    const rows = [];
    for (const suite of discovered) {
        const exists = existsSync(suite.file);
        const text = exists ? readFileSync(suite.file, 'utf8') : '';
        const detection = exists ? detectLive(text) : { live: false, signals: ['missing'] };
        const invalidException = problemByName.get(suite.name);
        const exception = invalidException === undefined ? bySuite.get(suite.name) : undefined;
        let group = detection.live ? 'live' : detection.pack === true ? 'pack' : 'fast';
        let override = undefined;
        if (exception !== undefined && exception.group === 'live') { group = 'live'; override = 'exception'; }
        if (exception !== undefined && exception.group === 'fast') { group = 'fast'; override = 'exception'; }
        if (exception !== undefined && exception.group === 'pack') { group = 'pack'; override = 'exception'; }
        const legacy = exception !== undefined && (exception.group === undefined || exception.group === 'legacy');
        rows.push({
            name: suite.name,
            file: suite.file,
            exists,
            origin: suite.origin,
            group,
            live: group === 'live',
            pack: group === 'pack',
            signals: detection.signals,
            override,
            legacy: legacy && invalidException === undefined,
            exception,
            invalidException,
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
    const pack = rows.filter((row) => row.group === 'pack' && row.legacy !== true);
    const fast = rows.filter((row) => row.group === 'fast');
    console.log('== suites under ' + (opts.manifestPath ?? opts.root) + ' (--list, nothing was executed) ==');
    console.log(pad('suite', 52) + pad('group', 8) + pad('legacy', 8) + 'signals');
    for (const row of rows) {
        row.verdict = row.invalidException !== undefined ? 'INVALID-EXCEPTION' : row.legacy ? 'LEGACY' : row.group === 'live' ? 'SKIPPED-LIVE' : row.group === 'pack' ? 'SKIPPED-PACK' : 'SKIPPED-LEGACY';
        console.log(pad(row.name, 42) + pad(row.group, 8) + pad(row.invalidException !== undefined ? 'INVALID' : row.legacy ? 'LEGACY' : '-', 8) + (row.signals.join(',') || '-') + (row.override ? ' [override]' : '') + (row.exists ? '' : ' [MISSING]') + (row.invalidException !== undefined ? ' [invalid exception: ' + row.invalidException.problem + ']' : ''));
    }
    console.log('');
    console.log('totals: ' + rows.length + ' suite(s) = ' + live.length + ' LIVE + ' + pack.length + ' pack + ' + fast.length + ' fast; legacy exceptions: ' + rows.filter((row) => row.legacy).length);
    if (live.length > 0) {
        console.log('LIVE group (' + live.length + '): ' + live.map((row) => row.name).join(', '));
        console.log('they boot a real session and spend quota: skipped unless --include-live');
    }
    if (pack.length > 0) {
        console.log('PACK group (' + pack.length + '): ' + pack.map((row) => row.name).join(', '));
        console.log('they run npm pack (and boot) so they cannot finish inside one sweep window: skipped unless --include-live');
    }
    console.log('exceptions source: ' + exceptions.origin);
    const listProblems = exceptions.problems ?? [];
    if (listProblems.length > 0) {
        console.log('== INVALID legacy exceptions (' + listProblems.length + ') — not whitelisted, so --list is not green ==');
        for (const problem of listProblems) console.log('  - ' + problem.suite + ': ' + problem.problem + ' | citation=' + (problem.citation || '(none)'));
    }
    if (opts.json) console.log(JSON.stringify({ mode: 'list', roots: (opts.manifestPath !== undefined ? [] : (opts.rootExplicit === true ? [opts.root, ...opts.extraRoots] : [opts.root, ...discoverPackageTestRoots(), ...opts.extraRoots])).map(toPosixRel), rows: rows.map((row) => ({ suite: row.name, file: toPosixRel(row.file), group: row.group, legacy: row.legacy, signals: row.signals, exists: row.exists, ran: false, verdict: row.verdict, exceptionProblem: row.invalidException === undefined ? null : row.invalidException.problem })), exceptionProblems: listProblems, exitCode: listProblems.length > 0 ? EXIT_REAL_FAIL : EXIT_GREEN }, null, 1));
    return listProblems.length > 0 ? EXIT_REAL_FAIL : EXIT_GREEN;
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
    const skippedPack = [];
    for (const row of rows) {
        if (row.invalidException !== undefined) {
            // V23-F3: the claim was rejected, so the suite is NOT whitelisted. It runs like any other suite
            // and its row is FAIL whatever it exits, because an unverifiable exception is never green.
            if (row.exists) {
                const outcome = runSuite(row, opts.timeoutMs);
                row.ran = true;
                row.exitCode = outcome.exitCode;
                row.tail = outcome.tail;
                row.elapsedMs = outcome.elapsedMs;
                row.sessions = outcome.sessions;
                boots += outcome.sessions.length;
            }
            row.verdict = 'FAIL';
            row.note = 'INVALID legacy exception (' + row.invalidException.problem + '; citation='
                + (row.invalidException.citation || '(none)') + '): the suite is not whitelisted, so this run cannot be green';
            continue;
        }
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
        if (row.group === 'pack' && !opts.includeLive) {
            skippedPack.push(row.name);
            row.verdict = 'SKIPPED-PACK';
            row.note = 'not executed (pack group: it runs npm pack and boots, so it outlives the per-suite timeout and spends quota); pass --include-live to run it';
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
        row.fixtureWarnings = outcome.fixtureWarnings;
        row.severityDemonstrated = outcome.severityDemonstrated;
        row.hardSeverityLines = outcome.hardSeverityLines;
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

    // ---- WARN lines (V19-F7 + V20-F2): a gate that announced it could not run must be visible, and
    // a suite that merely PRINTED the severity contract must not be counted as one.
    const warned = rows.filter((row) => (row.warnings ?? []).length > 0);
    const fixtureWarned = rows.filter((row) => (row.fixtureWarnings ?? []).length > 0);
    const warnTotal = warned.reduce((sum, row) => sum + row.warnings.length, 0);
    const fixtureWarnTotal = fixtureWarned.reduce((sum, row) => sum + row.fixtureWarnings.length, 0);
    console.log('warnings: ' + warnTotal + ' gate WARN line(s) in ' + warned.length + ' suite(s)' + (opts.strict ? ' (--strict: any gate WARN is NOT green)' : ' (default: WARN is printed, the exit code still follows the suite code)'));
    console.log('fixture warnings: ' + fixtureWarnTotal + ' WARN line(s) in ' + fixtureWarned.length + ' suite(s) — that suite also printed a FATAL/ERROR line, so it demonstrates the severity contract instead of reporting a skipped gate (V20-F2)');
    if (warned.length + fixtureWarned.length > 0) {
        console.log('== WARN lines (' + warnTotal + ' gate + ' + fixtureWarnTotal + ' fixture) — verbatim, never silently dropped ==');
        for (const row of rows) {
            const gate = row.warnings ?? [];
            const fixture = row.fixtureWarnings ?? [];
            if (gate.length + fixture.length === 0) continue;
            console.log('- ' + row.name + ' gateWarn=' + gate.length + ' fixtureWarn=' + fixture.length
                + (row.severityDemonstrated === true ? ' (printed ' + (row.hardSeverityLines ?? []).length + ' FATAL/ERROR line(s) in the same run)' : ''));
            for (const line of gate) console.log('    [gate]    | ' + line);
            for (const line of fixture) console.log('    [fixture] | ' + line);
        }
        console.log('');
    }

    const problems = exceptions.problems ?? [];
    if (problems.length > 0) {
        console.log('== INVALID legacy exceptions (' + problems.length + ') — a claim without a verifiable file:line is not an exception ==');
        for (const problem of problems) {
            console.log('  - ' + problem.suite + ': ' + problem.problem + ' | citation=' + (problem.citation || '(none)'));
        }
        console.log('  these suites are NOT whitelisted: they run, and each one is reported FAIL');
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
    if (skippedPack.length > 0) {
        console.log('skipped (pack): ' + skippedPack.length + ' suite — chung chay npm pack + boot nen khong the nam trong mot --run khong dieu kien; dung --include-live de chay: ' + skippedPack.join(', '));
    }
    const counts = {
        PASS: rows.filter((row) => row.verdict === 'PASS').length,
        FAIL: rows.filter((row) => row.verdict === 'FAIL').length,
        LEGACY: legacy.length,
        UNCLASSIFIED: rows.filter((row) => row.verdict === 'UNCLASSIFIED').length,
        SKIPPED: rows.filter((row) => row.verdict === 'SKIPPED-LIVE').length,
        PACK: rows.filter((row) => row.verdict === 'SKIPPED-PACK').length,
        WARN: warnTotal,
        WARN_FIXTURE: fixtureWarnTotal,
        DRIFT: drifted.length,
    };
    console.log('summary: PASS=' + counts.PASS + ' FAIL=' + counts.FAIL + ' LEGACY=' + counts.LEGACY + ' UNCLASSIFIED=' + counts.UNCLASSIFIED + ' skipped(live)=' + counts.SKIPPED + ' skipped(pack)=' + counts.PACK + ' WARN=' + counts.WARN + ' WARN_FIXTURE=' + counts.WARN_FIXTURE + ' DRIFT=' + counts.DRIFT);
    console.log('boot sessions executed: ' + boots + (opts.includeLive ? ' (live group was included)' : ' (live group was NOT included)'));
    const exitCode = decideExit(rows, opts);
    console.log('tool exit code: ' + exitCode + ' (0 = green, 1 = at least one FAIL, 2 = tool broken, 3 = UNCLASSIFIED only or --strict with a gate WARN line; code 3 is a local extension, still non-zero so never green)');
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
                fixtureWarnCount: (row.fixtureWarnings ?? []).length,
                fixtureWarnings: row.fixtureWarnings ?? [],
                severityDemonstrated: row.severityDemonstrated === true,
                hardSeverityLines: row.hardSeverityLines ?? [],
                sampled: row.sampled,
                drift: row.drift ?? [],
                exceptionProblem: row.invalidException === undefined ? null : row.invalidException.problem,
            })),
            counts,
            boots,
            exitCode,
        }, null, 1));
    }
    return exitCode;
}

process.exitCode = main(process.argv.slice(2));
