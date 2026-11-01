#!/usr/bin/env node
/**
 * t59 — E2E on a COPY of the real ERP team data (14 members · 107 tasks).
 *
 * Why a copy: proving the fork works on ERP data must not put the ERP project at
 * risk, so every byte the plugin reads or writes here lives under tests/tmp/t59/
 * and the ERP team.json is opened READ-ONLY (its sha256 and mtime are asserted
 * unchanged).
 *
 *   node tests/t59-erp-live-copy.mjs
 *   node tests/t59-erp-live-copy.mjs --analyze tests/tmp/t59/run-<stamp>
 *
 * The suite funnels every plugin interaction through ONE real headless session of
 * the draft profile (agent-teams-test, which links to packages/dsh-agent-teams)
 * with cwd = tests/tmp/t59. A brand-new session cannot lead a copied team
 * (lib/state.js:305-330 matches captainSessionId or a fork lineage), so the copy
 * is rebound to a resumable session id — a copy-only edit, one field — and the
 * session is resumed with --session-id.
 *
 * Inside that session: read the team, set one durable route override on a live
 * member, read again, clear it. The copy on disk is read after the session, and
 * the plugin's own audit file (writeTeam happens before the audit row, see
 * lib/members.js:1331 then :1365-1381) is compared before/after.
 *
 * The DTO check imports the real lib/index.js and calls the registered
 * agent_teams_status tool's execute() against the copy's state root; nothing here
 * simulates the plugin or its data.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DESKTOP_CLI, DSH_HOME, TEST_PROFILE, psQuote } from '../tools/test/lib/dsh-cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const LIB = join(REPO_ROOT, 'packages', 'dsh-agent-teams', 'lib');
const ERP_TEAM = resolve(REPO_ROOT, '..', 'ERP', '.agent-teams', 'erp-erp', 'team.json');
const ERP_SHA = '9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e';
const TEAM_ID = 'erp-erp';
const WORK = join(HERE, 'tmp', 't59');
const COPY_DIR = join(WORK, '.agent-teams', TEAM_ID);
const COPY = join(COPY_DIR, 'team.json');
const AUDIT = join(WORK, 'docs', 'log', 'MODEL-SWITCH.md');
const TARGET_MEMBER = 'ha-tang-2';
const OVERRIDE = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4-pro', reasoning_effort: 'high' };
/** t116 / T114-F1: C6 scores this DELTA, not the model's tool count and not an absolute row total. */
const MIN_AUDIT_DELTA = 2;
/**
 * t114 / BUG-028: a live boot must not be able to run on source other than the code this
 * document describes. The 13 files below are everything a boot can execute plus the manifest
 * that parcels them, so every boot re-hashes them before and after itself and C10 refuses a run
 * whose bytes are not these bytes. Whoever edits lib/** or package.json updates this table IN THE
 * SAME TASK, which is what turns a silent overwrite into a red suite instead of a mystery.
 *
 * Honest limit: this gate catches 'the boot ran on bytes other than the frozen ones'. It cannot
 * catch 'somebody wrote an older file and put the same bytes back', because nothing was wrong at
 * the moment of either read — BUG-028 only came to light because two consecutive boots printed
 * two different titles.
 */
const PKG = join(REPO_ROOT, 'packages', 'dsh-agent-teams');
/**
 * MEASURED, not copied: every sha256 below was taken in t114 by this suite's own author on
 * 2026-11-01T01:1xZ from packages/dsh-agent-teams (crypto sha256 over the file bytes) and
 * cross-checked 13/13 against the values the task brief quoted. The table tests/t108-pack.mjs
 * carries is deliberately NOT the source: it still pins lib/tools.js at d402c6586df1e140, an
 * older tree, so copying it would make C10 red for a reason unrelated to this run.
 *
 * t117 rev 2: the lib/tools.js row was re-measured after that task's render fix (findings_open on
 * the task line + `at <ISO>` on both inbox lines). Convention set by t114: whoever writes lib/**
 * updates this table IN THE SAME TASK, otherwise tests/t114-source-freeze.mjs goes red for a
 * reason that has nothing to do with the run it is guarding. The other 12 rows are untouched.
 *
 * t129: re-measured the two bundle rows after t128 moved DependencyMap + AddMemberControl
 * above the member list (same byte counts, different bytes). The other 11 rows are untouched.
 *
 * t134 (V20-F1): the lib/client.js.map row ONLY. The shipped map had been produced from the panel
 * as it stood BEFORE t128 moved the two call sites, so it described code that no longer existed at
 * those columns. It was regenerated through the real pipeline (packages/dsh-agent-teams/build/build.mjs);
 * lib/client.js came out byte-identical (377bcea2 / 258 432 B), the map kept its 404 958 B and only
 * its sha256 changed. The other 12 rows are untouched.
 *
 * t139: THREE rows, not two. The panel was re-laid out into columns (member column left,
 * dependency map right), which rewrote lib/client.js AND its map AND — the deliberate exception —
 * lib/client/ActivityPanel.module.css (the column grid and the internal scroll live in that file, so
 * the layout cannot change without it). The other 10 rows were re-measured with node:crypto against
 * the working tree and did not drift.
 *
 * t142: the SAME three rows again, and for the same reason. The user rejected the t139 split (both
 * halves nested in one 1fr/1fr div inside a flex-column section, so the 138-task DAG got ~210px).
 * section.team[data-workspace-team] is now a 1fr:2fr grid and the dependency map is a DIRECT child
 * of it. lib/client.js + its map + the stylesheet changed together; the ten other rows did not.
 * lib/client/WorkspaceActivity.module.css also changed in t142 (max-width:none) but it has never
 * been a FROZEN row, which is why it is not listed here.
 */
const FROZEN = [
    { path: 'lib/tools.js', sha256: 'e51734baf4693cd30f4c86aaf577afb58f8afef39788588d900a93621ae62d61', bytes: 213715 },
    { path: 'lib/members.js', sha256: '50f558f8b207d874d3d8052373b2dafc93cfe9ae54100ae03a4a7ed9f8bf1661', bytes: 102260 },
    { path: 'lib/state.js', sha256: '56664c59ff40031989afe32d5d733e3e84d02904f21149314d98d0f49c443485', bytes: 57508 },
    { path: 'lib/snapshot.js', sha256: 'a2a87e1b0c0b34ea1f8cb4a45c195d60d613eca997d0ce0d60e47d1a568c9a60', bytes: 13986 },
    { path: 'lib/index.js', sha256: '2d28e617f0683e420a30875557bbb7589cb0221e40e8839f7fdd9d1015d227c9', bytes: 45315 },
    { path: 'lib/tool-names.js', sha256: 'e3def5db908dcbd510811cb2da9c2076c3cf948b7b734bff73c510f85ac3ec58', bytes: 808 },
    { path: 'lib/client.js', sha256: '7dca20dd1edf2c6688a9d32d56a2f03f0ce13feac3bc71a57c05bfbdc65b1165', bytes: 258790 },
    { path: 'lib/client.js.map', sha256: '173b684f1a6a569c33f29e1c294ce2aad71944653f1af08c7bfa6aed5fdd16f2', bytes: 405349 },
    { path: 'lib/types/members.d.ts', sha256: 'c53250ab41bff8c310f3bed4f808f8c799296878b060670527b8fbc1f749239e', bytes: 31769 },
    { path: 'lib/types/snapshot.d.ts', sha256: '962f99a7bcb18b9482b0d4e6933bde0c79356b885c323c0e60f596e6c0fd1a22', bytes: 7627 },
    { path: 'lib/types/tools.d.ts', sha256: '41cfc56576ed8ffd8020cba53f6ed7a91ba30382ea46a0e136f02e4d3a67f5c3', bytes: 7546 },
    { path: 'lib/client/ActivityPanel.module.css', sha256: '7ea5190c7d97855639fe040715176114e1c809b81302238bbf00a172acd6823b', bytes: 52045 },
    { path: 'package.json', sha256: '92a6404071e457ccc49f485525aab17e467db0e76d4585a50d49997af5451f36', bytes: 10498 },
];
/** Printed verbatim when a file drifted: the reader needs to know what to do, not only that it is red. */
const SOURCE_DRIFT_NOTE = 'nguồn đã bị ghi trong lúc suite chạy — bảng đóng băng phải được cập nhật trong CHÍNH task đổi lib/**';

const checks = [];
function check(id, title, ok, evidence) {
    checks.push({ id, title, ok: ok === true, evidence: String(evidence ?? '') });
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' — ' + title);
    if (evidence !== undefined) console.log('      evidence: ' + evidence);
    return ok === true;
}
function libModule(name) {
    return pathToFileURL(join(LIB, name)).href;
}
async function hashFile(path) {
    return createHash('sha256').update(await readFile(path)).digest('hex');
}
/**
 * sha256 + byte count of the 13 frozen files, keyed by their path inside the package. Pure I/O
 * with no assertion: tests/t114-source-freeze.mjs slices this function out of the source and runs
 * it against a COPY under tests/tmp/t114, so the mechanism is proved without touching a source file.
 */
async function sourceHashesOf(root = PKG) {
    const hashes = [];
    for (const entry of FROZEN) {
        const bytes = await readFile(join(root, entry.path));
        hashes.push({ path: entry.path, sha: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
    }
    return hashes;
}

/** One boot, with the source it could execute hashed on both sides of it (t114 / BUG-028). */
async function bootFingerprint(boots, name, args, prompt, timeoutMs) {
    const before = await sourceHashesOf();
    const boot = runSession(args, prompt, timeoutMs);
    const after = await sourceHashesOf();
    boots.push({ name, before, after });
    return boot;
}

/**
 * Every way a fingerprinted boot can prove it ran on source this document does not describe.
 * An empty array means the run is trustworthy. Pure on purpose: tests/t114-source-freeze.mjs
 * slices this function out and feeds it drifted and wrongly-frozen records to prove C10 can fail.
 */
function sourceProblemsOf(boots, frozen) {
    const problems = [];
    if (Array.isArray(boots) === false || boots.length === 0) return ['no boot was fingerprinted'];
    const byPath = (list) => new Map((list ?? []).map((entry) => [entry.path, entry]));
    for (const boot of boots) {
        const before = byPath(boot?.before);
        const after = byPath(boot?.after);
        for (const entry of frozen) {
            const b = before.get(entry.path);
            const a = after.get(entry.path);
            if (b === undefined || a === undefined) {
                problems.push(String(boot?.name ?? '?') + ' ' + entry.path + ': no hash recorded');
                continue;
            }
            if (b.sha !== a.sha) problems.push(entry.path + ': before ' + b.sha + ' after ' + a.sha);
            else if (a.bytes !== entry.bytes) problems.push(entry.path + ': ' + a.bytes + ' B != frozen ' + entry.bytes + ' B');
        }
    }
    const firstRead = byPath(boots[0]?.before);
    const lastRead = byPath(boots[boots.length - 1]?.after);
    for (const entry of frozen) {
        const b = firstRead.get(entry.path);
        if (b === undefined || b.sha !== entry.sha256) problems.push(entry.path + ': first read ' + (b === undefined ? 'missing' : b.sha) + ' != frozen ' + entry.sha256);
        const a = lastRead.get(entry.path);
        if (a === undefined || a.sha !== entry.sha256) problems.push(entry.path + ': last read ' + (a === undefined ? 'missing' : a.sha) + ' != frozen ' + entry.sha256);
    }
    return problems;
}
async function readJson(path) {
    return JSON.parse(await readFile(path, 'utf8'));
}
async function saveText(dir, name, text) {
    await writeFile(join(dir, name), text, 'utf8');
}
async function saveJson(dir, name, value) {
    await writeFile(join(dir, name), JSON.stringify(value, null, 2), 'utf8');
}
async function readIfExists(path) {
    return existsSync(path) ? readFile(path, 'utf8') : '';
}

/**
 * t110 / V17-F4: the status title reads 'Members (7 present + 7 removed):'. 'active' is accepted
 * too so a historical artefact stays readable, but the SINGLE-COUNT title 'Members (7):' is NOT
 * accepted: that title is exactly what a regression looks like when the removed rows vanish from
 * the payload again (BUG-027), so falling back to it would make this check toothless.
 * Self-contained on purpose: tests/tmp/t113/negative-control.mjs slices this function out of the
 * source and runs it against mutated text to prove the check can still fail.
 */
function rosterCountsOf(text) {
    const pair = /Members \((\d+) (?:present|active) \+ (\d+) removed\)/.exec(String(text ?? ''));
    if (pair === null) return { found: false, present: undefined, removed: undefined, line: 'none' };
    return { found: true, present: Number(pair[1]), removed: Number(pair[2]), line: pair[0] };
}

/** One headless boot; the prompt travels on stdin so Windows argv quoting cannot
 *  mangle it, and it stays a single line (the CLI cuts a prompt at a newline). */
function runSession(args, prompt, timeoutMs = 300000) {
    const command = '& ' + psQuote(DESKTOP_CLI) + ' ' + args.map(psQuote).join(' ') + '; exit $LASTEXITCODE';
    const startedAt = Date.now();
    const res = spawnSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd: WORK, input: prompt + '\n', encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return {
        args,
        prompt,
        status: res.status,
        stdout: res.stdout ?? '',
        stderr: res.stderr ?? '',
        error: res.error === undefined ? undefined : String(res.error),
        elapsedMs: Date.now() - startedAt,
    };
}

/** Pair tool_call with tool_result over the NDJSON stream of one boot. */
function toolExchange(text) {
    const events = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') === false) continue;
        try {
            events.push(JSON.parse(trimmed));
        } catch {
            // A line that is not JSON is not an event; skipping it swallows no error.
        }
    }
    const byCall = new Map();
    for (const event of events) {
        if (event.type === 'tool_call') byCall.set(event.callId, { tool: event.tool, input: event.input, result: undefined });
        if (event.type === 'tool_result') {
            const entry = byCall.get(event.callId);
            if (entry !== undefined) entry.result = String(event.result ?? '');
        }
    }
    const list = [...byCall.values()];
    return {
        events,
        list,
        sessionId: events.find((event) => event.type === 'session')?.sessionId,
        all: (name) => list.filter((entry) => entry.tool === name),
        first: (name) => list.find((entry) => entry.tool === name),
        final: events.filter((event) => event.type === 'final').map((event) => event.text).join('\n'),
    };
}

/** A resumable session id: one recorded by an earlier run and still in the store. */
async function reusableSessionId() {
    const store = join(DSH_HOME, 'sessions');
    if (existsSync(store) === false) return undefined;
    const fromArtifacts = [];
    for (const entry of await readdir(WORK, { withFileTypes: true })) {
        if (entry.isDirectory() === false || /^run-/.test(entry.name) === false) continue;
        const metaPath = join(WORK, entry.name, 'meta.json');
        if (existsSync(metaPath) === false) continue;
        try {
            const meta = await readJson(metaPath);
            for (const boot of meta.boots ?? []) {
                if (typeof boot.sessionId === 'string') fromArtifacts.push(boot.sessionId);
            }
        } catch {
            // An unreadable older artifact is skipped; it is not evidence for this run.
        }
    }
    const slugs = await readdir(store, { withFileTypes: true });
    for (const slug of slugs) {
        if (slug.isDirectory() === false) continue;
        const slugPath = join(store, slug.name);
        const inside = await readdir(slugPath, { withFileTypes: true });
        for (const candidate of inside) {
            if (candidate.isDirectory() && fromArtifacts.includes(candidate.name)) return candidate.name;
        }
    }
    return undefined;
}

/** The real agent_teams_status DTO, produced by the plugin's own registered tool
 *  against the copy's state root — no HTTP, no hand-built data. */
async function liveDto(captainId) {
    const registered = new Map();
    const captain = {
        id: captainId,
        session: {
            id: captainId,
            header: { cwd: WORK },
            append() {},
            requestHeader: () => ({ config: { provider: OVERRIDE.provider, model: OVERRIDE.model } }),
        },
    };
    const subagents = {
        followup() { return Promise.resolve('none'); },
        sendMessage() { return Promise.resolve('none'); },
        startActivation() { return Promise.reject(new Error('t59 harness: no agent runtime in this process')); },
        getProvider() { return { id: 'spawn' }; },
        list() { return []; },
        interrupt() {},
    };
    // lib/harness-compat.js:170 requires one host prompt queue symbol plus
    // sendMessage, or the plugin refuses to mount at all.
    subagents[Symbol.for('dsh.subagent.deliverPrompt')] = () => Promise.resolve('deliver');
    subagents[Symbol.for('dsh.subagent.queuePrompt')] = () => Promise.resolve('queue');
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        tools: { register(def) { registered.set(def.name, def); } },
        agents: { get(id) { return id === captainId ? captain : undefined; }, list() { return []; } },
        subagents,
        llm: {
            async listModels() { return []; },
            async listProviders() { return []; },
            async resolveCallConfig(config) { return config; },
        },
        on() { return () => {}; },
        inject() {},
        systemPrompt: { section() {} },
        effect(fn) { try { fn(); } catch { /* harness */ } },
        get() { return undefined; },
    };
    const indexMod = await import(libModule('index.js'));
    indexMod.apply(ctx, {
        stateDir: '.agent-teams',
        memberProvider: 'spawn',
        maxMembers: 8,
        maxManualMembers: 12,
        profiles: {},
        toolPolicies: {},
        slashCommand: false,
    });
    const tool = registered.get('agent_teams_status');
    if (tool === undefined) throw new Error('agent_teams_status is not registered by lib/index.js');
    return tool.execute({}, { agent: captain });
}

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

/** A team.json snapshot with the captain id normalised, for a one-field diff. */
function withoutCaptain(team) {
    const clone = JSON.parse(JSON.stringify(team));
    clone.captainSessionId = '<captain>';
    return clone;
}

/**
 * Every DATA row of the copy workspace's audit trail, whatever member it names: C6 counts a DELTA
 * over this. The header and the |---| separator are not rows — counting them would let a boot that
 * wrote nothing look like it wrote two, which is exactly the mistake this check exists to prevent.
 */
function allAuditRows(text) {
    return String(text ?? '').split('\n').filter((line) => /^\| \d{4}-\d{2}-\d{2}T/.test(line) && line.split('|').length >= 6);
}
/**
 * t116 / T114-F1: the live suite must not score the MODEL's tool count. It scores the business
 * property instead — the audit trail grew by at least one row per write, and every new row names
 * the member the override was installed on. `minDelta` is a parameter so a caller can prove the
 * threshold is what decides: with minDelta 0 a boot that wrote NOTHING would pass silently.
 */
function auditDeltaProblems(delta, newRows, target, minDelta = MIN_AUDIT_DELTA) {
    const problems = [];
    if (Number.isFinite(delta) === false) problems.push('the audit row count before/after the boot is not a number');
    if (delta < minDelta) {
        problems.push('only ' + delta + ' NEW audit row(s) since the boot began; at least ' + minDelta
            + ' expected (every set and every clear writes exactly one row)');
    }
    if (newRows.length !== Math.max(delta, 0)) problems.push('delta ' + delta + ' does not match the ' + newRows.length + ' new row(s) read');
    for (const row of newRows) {
        const cells = row.split('|').map((cell) => cell.trim());
        if (cells.includes(target) === false) problems.push('a new audit row does not name ' + target + ': ' + row.slice(0, 140));
    }
    return problems;
}
/**
 * The copy and the plugin's audit file live under tests/tmp/t59 and OUTLIVE a run, so a run that
 * ended before its clear used to hand its leftovers to the next one (T114-F1). Wipe first, then
 * copy the ERP team.json again — and record what was thrown away, so the freshness is evidence and
 * not a claim.
 */
async function resetFixture() {
    const previousSha = existsSync(COPY) ? await hashFile(COPY) : undefined;
    let previousOverride = null;
    let previousMembers = undefined;
    if (existsSync(COPY)) {
        try {
            const stale = await readJson(COPY);
            previousMembers = Array.isArray(stale.members) ? stale.members.length : undefined;
            const staleMember = (stale.members ?? []).find((member) => member.name === TARGET_MEMBER);
            previousOverride = staleMember?.routeOverride ?? null;
        } catch {
            previousOverride = 'unreadable';
        }
    }
    const previousAuditRows = allAuditRows(await readIfExists(AUDIT)).length;
    await rm(join(WORK, '.agent-teams'), { recursive: true, force: true });
    await rm(join(WORK, 'docs'), { recursive: true, force: true });
    await mkdir(COPY_DIR, { recursive: true });
    await copyFile(ERP_TEAM, COPY);
    const copySha = await hashFile(COPY);
    return {
        previousSha,
        previousOverride,
        previousMembers,
        previousAuditRows,
        copySha,
        auditRowsAtStart: allAuditRows(await readIfExists(AUDIT)).length,
        copyExists: existsSync(COPY),
    };
}

// ------------------------------------------------------------ live run
async function liveRun() {
    const runDir = join(WORK, 'run-' + stamp());
    await mkdir(runDir, { recursive: true });
    await mkdir(COPY_DIR, { recursive: true });
    const meta = { startedAt: new Date().toISOString(), runDir, team: TEAM_ID, target: TARGET_MEMBER, override: OVERRIDE, boots: [] };
    const sourceBoots = [];

    const erpBefore = await hashFile(ERP_TEAM);
    const erpStatBefore = await stat(ERP_TEAM);
    const fixture = await resetFixture();
    const copyHash = fixture.copySha;
    const original = await readJson(COPY);
    meta.erp = { shaBefore: erpBefore, mtimeBefore: erpStatBefore.mtimeMs, shaAfter: undefined, mtimeAfter: undefined };
    meta.fixture = {
        source: 'ERP team.json (read-only)',
        sourceSha256: erpBefore,
        copySha256: copyHash,
        rebuilt: true,
        wipedPreviousCopySha: fixture.previousSha ?? null,
        wipedPreviousMembers: fixture.previousMembers ?? null,
        wipedPreviousOverride: fixture.previousOverride,
        wipedPreviousAuditRows: fixture.previousAuditRows,
        auditRowsAtStart: fixture.auditRowsAtStart,
    };
    meta.copy = { shaAfterCopy: copyHash, members: original.members.length, tasks: original.tasks.length };

    check('C1', 'the fixture is REBUILT from the ERP team.json on every run: whatever an earlier run left behind is wiped first, the rebuilt copy is byte-identical to ERP (sha256 ' + ERP_SHA.slice(0, 16) + '…, 14 members · 107 tasks) and the audit trail starts empty',
        copyHash === ERP_SHA && erpBefore === ERP_SHA && fixture.auditRowsAtStart === 0
            && original.members.length === 14 && original.tasks.length === 107,
        'sourceSha256=' + erpBefore + ' copySha256=' + copyHash
        + ' wipedPreviousCopy=' + (fixture.previousSha ?? '(none)')
        + ' wipedPreviousOverride=' + JSON.stringify(fixture.previousOverride)
        + ' wipedPreviousAuditRows=' + fixture.previousAuditRows
        + ' auditRowsAtStart=' + fixture.auditRowsAtStart
        + ' members=' + original.members.length + ' tasks=' + original.tasks.length);

    // ---- pick a resumable session id (the copy can only be led by the id it names)
    let sessionId = await reusableSessionId();
    const reused = sessionId !== undefined;
    meta.session = { id: sessionId, reused };
    if (sessionId === undefined) {
        const mint = await bootFingerprint(sourceBoots, 'mint', ['--profile', TEST_PROFILE, '--json', '-'], 'Call agent_teams_status once and quote the exact error text verbatim. Do nothing else.');
        await saveText(runDir, 'bootMint.stdout.txt', mint.stdout);
        await saveText(runDir, 'bootMint.stderr.txt', mint.stderr);
        const minted = toolExchange(mint.stdout);
        sessionId = minted.sessionId;
        meta.boots.push({ name: 'mint', status: mint.status, sessionId, elapsedMs: mint.elapsedMs, error: mint.error, stderrTail: mint.stderr.slice(-1200) });
        meta.session.id = sessionId;
        meta.session.mintEvidence = String(minted.first('agent_teams_status')?.result ?? '').slice(0, 200);
    }

    const rebindFrom = String(original.captainSessionId ?? '');
    const rebound = JSON.parse(JSON.stringify(original));
    rebound.captainSessionId = sessionId;
    await writeFile(COPY, JSON.stringify(rebound, null, 2), 'utf8');
    const copyHash2 = await hashFile(COPY);
    meta.rebind = { from: rebindFrom, to: sessionId, shaAfterRebind: copyHash2 };
    check('C2', 'the copy was rebound to a resumable session id, changing exactly one field (captainSessionId)',
        typeof sessionId === 'string' && JSON.stringify(withoutCaptain(rebound)) === JSON.stringify(withoutCaptain(original))
            && rebindFrom !== sessionId && copyHash2 !== copyHash,
        'from=' + rebindFrom + ' to=' + sessionId + ' reused=' + String(reused) + ' new sha256=' + copyHash2);

    // ---- the real DTO behind the render, before any write
    let dto;
    let dtoError;
    try {
        dto = await liveDto(sessionId);
    } catch (error) {
        dtoError = error instanceof Error ? error.message : String(error);
    }
    const dtoMembers = Array.isArray(dto?.members) ? dto.members : [];
    const dtoTasks = Array.isArray(dto?.tasks) ? dto.tasks : [];
    const optionalKeys = ['route_override', 'last_failure', 'execution_prompt'];
    const jsonByName = new Map(original.members.map((member) => [member.name, member]));
    const mismatches = [];
    for (const member of dtoMembers) {
        const source = jsonByName.get(member.name);
        const expected = {
            route_override: source?.routeOverride !== undefined,
            last_failure: source?.lastFailure !== undefined,
            execution_prompt: source?.executionPrompt !== undefined,
        };
        for (const key of optionalKeys) {
            if (Object.hasOwn(member, key) !== expected[key]) {
                mismatches.push(member.name + '.' + key + ' present=' + String(Object.hasOwn(member, key)) + ' expected=' + String(expected[key]));
            }
        }
    }
    const withExecutionPrompt = dtoMembers.filter((member) => Object.hasOwn(member, 'execution_prompt')).map((member) => member.name);
    const bare = dtoMembers.filter((member) => optionalKeys.every((key) => Object.hasOwn(member, key) === false)).map((member) => member.name);
    meta.dto = {
        error: dtoError,
        teamName: dto?.team_name,
        members: dtoMembers.length,
        tasks: dtoTasks.length,
        memberNames: dtoMembers.map((member) => member.name),
        withExecutionPrompt,
        membersWithoutAnyOptionalKey: bare,
        mismatches,
    };
    check('C3', 'the real DTO parses as an object: team erp-erp, 7 live members (the 7 removed ones are filtered), 107 tasks, and each optional key is present exactly when team.json defines the field — a key with no data is absent, not null',
        dtoError === undefined && dto?.team_name === TEAM_ID && dtoMembers.length === 7 && dtoTasks.length === 107
            && mismatches.length === 0 && bare.length === 5 && withExecutionPrompt.length === 2
            && dtoMembers.every((member) => typeof member.name === 'string'),
        'dto=' + JSON.stringify(meta.dto));

    // ---- the single write session: read, set an override, read, clear
    const prompt = 'Step 1: call agent_teams_status and quote its first three lines verbatim. '
        + 'Step 2: call agent_teams_set_member_route with member_name "' + TARGET_MEMBER + '", provider "' + OVERRIDE.provider
        + '", model "' + OVERRIDE.model + '", reasoning_effort "' + OVERRIDE.reasoning_effort + '". '
        + 'Step 3: call agent_teams_status again and quote the single line that mentions ' + TARGET_MEMBER + '. '
        + 'Step 4: call agent_teams_set_member_route with member_name "' + TARGET_MEMBER + '" and clear true. '
        + 'Step 5: quote the step 4 answer verbatim and stop.';
    const auditBeforeText = await readIfExists(AUDIT);
    const auditRowsBeforeBoot = allAuditRows(auditBeforeText).length;
    const boot = await bootFingerprint(sourceBoots, 'write', ['--profile', TEST_PROFILE, '--json', '--session-id', sessionId, '-'], prompt);
    await saveText(runDir, 'session.stdout.txt', boot.stdout);
    await saveText(runDir, 'session.stderr.txt', boot.stderr);
    await saveText(runDir, 'prompt.txt', prompt);
    const x = toolExchange(boot.stdout);
    meta.boots.push({ name: 'write', status: boot.status, sessionId: x.sessionId, elapsedMs: boot.elapsedMs, error: boot.error, stderrTail: boot.stderr.slice(-1500) });

    const statuses = x.all('agent_teams_status').map((entry) => String(entry.result ?? ''));
    const routes = x.all('agent_teams_set_member_route');
    meta.session.toolCalls = x.list.map((entry) => entry.tool);
    meta.session.texts = { statuses, routes: routes.map((entry) => String(entry.result ?? '')) };

    // t107 / BUG-027 gave the title both counts; t110 / V17-F4 renamed 'active' to 'present'.
    // What this check wants to know is unchanged: the copied ERP roster is 7 live + 7 removed and
    // the title must carry BOTH numbers. It must not pin the wording (that goes red for a reason
    // that has nothing to do with the roster) and it must not accept the single-count title.
    const roster = rosterCountsOf(statuses[0] ?? '');
    const rosterOk = roster.found === true && roster.present === 7 && roster.removed === 7;
    check('C4', 'a real headless session resumed as the copied captain reads the team: Team "erp-erp", 7 live members (plus the 7 removed rows t107 made visible), and the 107-task ledger is intact',
        boot.status === 0 && x.sessionId === sessionId && /Team "erp-erp"/.test(statuses[0] ?? '')
            && rosterOk,
        'exit=' + boot.status + ' session=' + x.sessionId + ' elapsed=' + boot.elapsedMs + 'ms head=' + JSON.stringify((statuses[0] ?? '').slice(0, 150))
        + ' membersLine=' + JSON.stringify(roster.line) + ' roster=' + roster.present + '+' + roster.removed);

    // t116 / T114-F1: score the BUSINESS property, never the model's call count. A model may set the
    // same route once or five times; what must hold is that every set was acknowledged AND that the
    // status call right after it — inside the SAME boot — already renders the override.
    const setCalls = [];
    for (let i = 0; i < x.list.length; i += 1) {
        const entry = x.list[i];
        if (entry.tool !== 'agent_teams_set_member_route') continue;
        if (entry.input?.clear === true) continue;
        const nextStatus = x.list.slice(i + 1).find((later) => later.tool === 'agent_teams_status');
        const line = String(nextStatus?.result ?? '').split('\n').find((row) => row.includes(TARGET_MEMBER)) ?? '';
        setCalls.push({
            acknowledged: /route is now /.test(String(entry.result ?? '')),
            overrideDurable: /[(]override[)]/.test(line) && line.includes(OVERRIDE.provider + '/' + OVERRIDE.model),
            sawStatusAfter: nextStatus !== undefined,
            line: line.trim().slice(0, 220),
        });
    }
    const setProblems = setCalls
        .filter((call) => call.acknowledged === false || call.overrideDurable === false)
        .map((call) => 'acknowledged=' + String(call.acknowledged) + ' overrideInNextStatus=' + String(call.overrideDurable) + ' line=' + JSON.stringify(call.line));
    meta.session.setCalls = setCalls;
    check('C5', 'every set_member_route this boot made (one or many — the count is not scored) was acknowledged, and the status call right after it in the SAME boot already renders the override for ' + TARGET_MEMBER,
        setCalls.length >= 1 && setProblems.length === 0,
        'sets=' + setCalls.length + ' problems=' + JSON.stringify(setProblems));

    // ---- durable writes on the COPY, read from disk after the session
    const auditAfter = await readIfExists(AUDIT);
    const auditRowsAfterBoot = allAuditRows(auditAfter).length;
    const auditDelta = auditRowsAfterBoot - auditRowsBeforeBoot;
    const newRows = allAuditRows(auditAfter).slice(auditRowsBeforeBoot);
    meta.copy.audit = { rowsBeforeBoot: auditRowsBeforeBoot, rowsAfterBoot: auditRowsAfterBoot, delta: auditDelta, minDelta: MIN_AUDIT_DELTA, newRows };
    const afterClear = await readJson(COPY);
    const clearTarget = afterClear.members.find((member) => member.name === TARGET_MEMBER);
    meta.copy.afterClear = {
        sha256: await hashFile(COPY),
        override: clearTarget?.routeOverride ?? null,
        spine: clearTarget === undefined ? null : clearTarget.provider + '/' + clearTarget.model,
        members: afterClear.members.length,
        tasks: afterClear.tasks.length,
    };
    const deltaProblems = auditDeltaProblems(auditDelta, newRows, TARGET_MEMBER, MIN_AUDIT_DELTA);
    const relaxedProblems = auditDeltaProblems(0, [], TARGET_MEMBER, 0);
    check('C6', 'the writes landed on the COPY durably, scored as a DELTA: the boot added at least ' + MIN_AUDIT_DELTA + ' audit rows (no absolute row total is asserted), every new row names ' + TARGET_MEMBER + ', and team.json was rewritten',
        deltaProblems.length === 0 && MIN_AUDIT_DELTA === 2 && meta.copy.afterClear.sha256 !== copyHash2,
        'rowsBeforeBoot=' + auditRowsBeforeBoot + ' rowsAfterBoot=' + auditRowsAfterBoot + ' delta=' + auditDelta
        + ' minDelta=' + MIN_AUDIT_DELTA + ' problems=' + JSON.stringify(deltaProblems)
        + ' newRows=' + JSON.stringify(newRows.map((row) => row.slice(0, 120)))
        + ' shaAfterRebind=' + copyHash2 + ' shaAfterSession=' + meta.copy.afterClear.sha256
        + ' (a relaxed minDelta=0 with no writes would have passed: ' + JSON.stringify(relaxedProblems) + ')');

    const declared = clearTarget === undefined ? '' : clearTarget.provider + '/' + clearTarget.model;
    const declaredPattern = new RegExp('override is cleared: back on its declared route ' + declared.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const clearCalls = x.list.filter((entry) => entry.tool === 'agent_teams_set_member_route' && entry.input?.clear === true);
    const clearCall = clearCalls.length === 0 ? undefined : clearCalls[clearCalls.length - 1];
    const finalStateProblems = [];
    if (clearCall !== undefined) {
        if (declared !== 'opencode-go/deepseek-v4.1-flash') finalStateProblems.push('declared route after the clear is ' + JSON.stringify(declared) + ', expected opencode-go/deepseek-v4.1-flash');
        if (declaredPattern.test(String(clearCall.result ?? '')) === false) finalStateProblems.push('the clear answer does not name the declared route: ' + JSON.stringify(String(clearCall.result ?? '').slice(0, 160)));
        if (clearTarget === undefined || clearTarget.routeOverride !== undefined) finalStateProblems.push('team.json still carries routeOverride for ' + TARGET_MEMBER + ': ' + JSON.stringify(clearTarget?.routeOverride ?? null));
        if (afterClear.members.length !== 14 || afterClear.tasks.length !== 107) finalStateProblems.push('roster/tasks changed: members=' + afterClear.members.length + ' tasks=' + afterClear.tasks.length);
    }
    meta.session.clearCalls = clearCalls.length;
    check('C7', clearCall === undefined
        ? 'khong ap dung — this boot made no clear call, so no final-state claim is scored (what it DID write durably is C6)'
        : 'the clear is durable too: team.json on disk has no routeOverride for ' + TARGET_MEMBER + ', its declared route (' + declared + ') survived, and the roster/tasks are untouched',
        clearCall === undefined ? true : finalStateProblems.length === 0,
        clearCall === undefined
            ? 'clearCalls=0 sets=' + setCalls.length + ' auditDelta=' + auditDelta + ' overrideStillOnDisk=' + JSON.stringify(clearTarget?.routeOverride ?? null) + ' — not applicable, not a failure'
            : 'clear=' + JSON.stringify(String(clearCall.result ?? '').slice(0, 200)) + ' problems=' + JSON.stringify(finalStateProblems) + ' spine=' + meta.copy.afterClear.spine + ' members=' + afterClear.members.length + ' tasks=' + afterClear.tasks.length);

    // ---- the ERP project is untouched
    const erpAfter = await hashFile(ERP_TEAM);
    const erpStatAfter = await stat(ERP_TEAM);
    meta.erp.shaAfter = erpAfter;
    meta.erp.mtimeAfter = erpStatAfter.mtimeMs;
    check('C8', 'the ERP team.json is byte-identical before and after (identical=' + String(erpBefore === erpAfter) + ')',
        erpBefore === erpAfter && erpAfter === ERP_SHA && erpStatBefore.mtimeMs === erpStatAfter.mtimeMs,
        'before=' + erpBefore + ' after=' + erpAfter + ' mtimeBefore=' + erpStatBefore.mtimeMs + ' mtimeAfter=' + erpStatAfter.mtimeMs);

    // ---- the test file itself keeps no absolute path and prints no secret
    const self = await readFile(fileURLToPath(import.meta.url), 'utf8');
    const driveLetter = '[A-Za-z]' + ':' + '[\\\\/]';
    const secretPattern = 'A' + 'PI_' + 'KE' + 'Y|Bea' + 'rer ' + '|sk' + '-';
    const absHits = (self.match(new RegExp(driveLetter, 'g')) ?? []).length;
    const secretHits = (self.match(new RegExp(secretPattern, 'g')) ?? []).length;
    check('C9', 'this test file carries no absolute path and no credential material',
        absHits === 0 && secretHits === 0,
        'driveLetterHits=' + absHits + ' secretHits=' + secretHits);

    // ---- t114 / BUG-028: the run proves WHICH source it booted on, file by file
    const sourceProblems = sourceProblemsOf(sourceBoots, FROZEN);
    const firstBefore = new Map((sourceBoots[0]?.before ?? []).map((entry) => [entry.path, entry]));
    const lastAfter = new Map((sourceBoots[sourceBoots.length - 1]?.after ?? []).map((entry) => [entry.path, entry]));
    meta.source = {
        frozen: 't114',
        boots: sourceBoots.map((entry) => entry.name),
        files: FROZEN.map((entry) => ({
            path: entry.path,
            shaBefore: firstBefore.get(entry.path)?.sha,
            shaAfter: lastAfter.get(entry.path)?.sha,
            bytes: lastAfter.get(entry.path)?.bytes,
        })),
    };
    const sourceSummary = meta.source.files
        .map((row) => row.path + ' ' + row.shaBefore + (row.shaBefore === row.shaAfter ? ' = ' + row.shaAfter : ' -> ' + row.shaAfter))
        .join(' | ');
    check('C10', 'the live boot ran on the pinned source on both sides of itself (t114 / BUG-028): all '
            + FROZEN.length + ' frozen files are byte-identical to the table before AND after every boot ('
            + meta.source.boots.join(',') + ')',
        sourceProblems.length === 0 && sourceBoots.length > 0,
        sourceProblems.length === 0
            ? 'frozen=' + sourceSummary
            : 'MISMATCH — ' + sourceProblems.join(' | ') + ' — ' + SOURCE_DRIFT_NOTE);

    meta.checks = checks;
    meta.finishedAt = new Date().toISOString();
    meta.verdict = checks.every((entry) => entry.ok) ? 'PASS' : 'FAIL';
    await saveJson(runDir, 'meta.json', meta);
    console.log('');
    console.log('run dir  : ' + runDir);
    console.log('copy     : ' + COPY);
    console.log('session  : ' + sessionId);
    console.log('verdict ' + meta.verdict + ' — proved ' + checks.filter((entry) => entry.ok).map((entry) => entry.id).join(',')
        + ' — failed ' + (checks.filter((entry) => entry.ok === false).map((entry) => entry.id).join(',') || '(none)'));
    const code = meta.verdict === 'PASS' ? 0 : 1;
    console.log('EXIT ' + code);
    process.exit(code);
}

// -------------------------------------------------------------- analyze
async function resolveRunDir(argument) {
    const candidates = [];
    if (argument !== undefined) candidates.push(resolve(argument));
    else candidates.push(WORK);
    for (const candidate of candidates) {
        if (existsSync(join(candidate, 'meta.json'))) return candidate;
        if (!existsSync(candidate)) continue;
        const entries = (await readdir(candidate, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory() && /^run-/.test(entry.name))
            .map((entry) => entry.name)
            .sort();
        if (entries.length > 0) return join(candidate, entries[entries.length - 1]);
    }
    return undefined;
}

async function analyze() {
    const argument = process.argv[process.argv.indexOf('--analyze') + 1];
    if (argument === undefined) {
        console.error('--analyze needs a run directory (for example tests/tmp/t59/run-<stamp>)');
        process.exit(2);
    }
    const runDir = await resolveRunDir(argument);
    if (runDir === undefined) {
        console.error('no run directory with meta.json under ' + resolve(argument));
        process.exit(2);
    }
    const meta = await readJson(join(runDir, 'meta.json'));
    console.log('analyze  : ' + runDir);
    console.log('team     : ' + meta.team + ' · target ' + meta.target + ' · override ' + JSON.stringify(meta.override) + ' · session ' + meta.session.id);
    for (const entry of meta.checks) {
        console.log((entry.ok === true ? 'PASS ' : 'FAIL ') + entry.id + ' — ' + entry.title);
        console.log('      evidence: ' + entry.evidence);
    }
    for (const boot of meta.boots) {
        console.log('boot ' + boot.name + ' exit=' + boot.status + ' session=' + boot.sessionId + ' elapsed=' + boot.elapsedMs + 'ms');
    }
    const erpNow = await hashFile(ERP_TEAM);
    console.log('ERP sha256 recorded before=' + meta.erp.shaBefore + ' after=' + meta.erp.shaAfter + ' now=' + erpNow);
    const identical = meta.erp.shaBefore === meta.erp.shaAfter && meta.erp.shaAfter === erpNow && erpNow === ERP_SHA;
    console.log('identical=' + String(identical) + ' (the recorded pair and a fresh read agree)');
    const sourceRows = Array.isArray(meta.source?.files) ? meta.source.files : [];
    const sourceStable = sourceRows.length > 0 && sourceRows.every((row) => typeof row.shaBefore === 'string' && row.shaBefore === row.shaAfter);
    console.log('source   : frozen=' + meta.source?.frozen + ' boots=' + (meta.source?.boots ?? []).join(','));
    for (const row of sourceRows) console.log('           ' + row.path + ' before=' + row.shaBefore + ' after=' + row.shaAfter + ' ' + row.bytes + 'B');
    console.log('sourceStable=' + String(sourceStable) + ' (the recorded pair agrees with itself; --analyze re-reads nothing and asserts nothing about the tree now)');
    const proved = meta.checks.filter((entry) => entry.ok).map((entry) => entry.id);
    const failed = meta.checks.filter((entry) => entry.ok === false).map((entry) => entry.id);
    const allProved = failed.length === 0 && identical;
    console.log('verdict ' + (allProved ? 'PASS' : 'FAIL') + ' — proved ' + proved.join(',') + ' — failed ' + (failed.join(',') || '(none)'));
    const code = allProved ? 0 : 1;
    console.log('EXIT ' + code);
    process.exit(code);
}

const isAnalyze = process.argv.includes('--analyze');
if (isAnalyze) await analyze();
else await liveRun();
