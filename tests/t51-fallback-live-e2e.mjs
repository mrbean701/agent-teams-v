#!/usr/bin/env node
/**
 * t51 — E2E: a member DEGRADES to its fallback route by itself when its own provider
 * dies mid-turn (no captain, no tool call, no manual retry).
 *
 *   node tests/t51-fallback-live-e2e.mjs                    # one real headless session
 *   node tests/t51-fallback-live-e2e.mjs --analyze <dir>     # re-grade saved artifacts
 *
 * Why opencode-go is the primary route: it is really dead in this environment
 * (docs/log/BUG.md BUG-006: '429 GoUsageLimitError: Go usage limit exceeded (code QUOTA)'),
 * so the failure is a REAL provider failure, not a simulated one. The fallback route is
 * the live command-code-goat route, so the member must keep working after the switch.
 *
 * Checks (one verdict each):
 *   C1  a request error carrying a PROVIDER_FAILURE_MARKERS token really happened
 *   C2  the effective route is the fallback, routeOf(...).origin === 'fallback'
 *   C3  the member continued on the fallback and finished its task
 *   C4  team.json records fallbackActive + activeProvider + activeModel
 *   C5  agent_teams_status reports the current route as the fallback
 *   C6  the audit log carries a row for the degradation itself
 *
 * Self-locating: profile, CLI and plugin come from tools/test/lib/dsh-cli.mjs.
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { zstdDecompressSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cli = await import(pathToFileURL(join(repoRoot, 'tools', 'test', 'lib', 'dsh-cli.mjs')).href);
const PROFILE = process.env.DSH_TEST_PROFILE ?? 'agent-teams-test';
const CLI = cli.DESKTOP_CLI;
const DSH_HOME = cli.DSH_HOME;
const PROFILE_DIR = join(DSH_HOME, 'profiles', PROFILE);
const RUN_ROOT = join(repoRoot, 'tests', 'tmp', 'e2e-t51fallback');

const TEAM = 'e2e-t51fallback';
const MEMBER = 'worker-a';
// The primary route we expect to be dead (t40 ERP data still carries it) and the live route
// the member must degrade to. Round 1 used opencode-go/kimi-k2.7-code, which turned out to
// ANSWER normally on 2026-10-31T18:45Z, so it can no longer prove a degradation.
const PRIMARY = { provider: 'cline', model: 'moonshotai/kimi-k3' };
const FALLBACK = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4.1-flash' };
const AUDIT_REL = ['docs', 'log', 'MODEL-SWITCH.md'];
// Mirrors lib/members.js:102 FALLBACK_FAILURE_CODES.
const FALLBACK_CODES = ['QUOTA', 'RATE_LIMIT', 'AUTH', 'MISSING_CREDENTIAL', 'NO_ADAPTER'];
// Mirrors lib/members.js:120-128 PROVIDER_FAILURE_MARKERS.
const MARKERS = [/QUOTA/i, /RATE_LIMIT/i, /\b429\b/, /\b404\b/, /PI_AI_ERROR/i, /Insufficient\s+Balance/i, /GoUsageLimitError/i];
const markerOf = (text) => {
    for (const re of MARKERS) { const hit = text.match(re); if (hit !== null) return hit[0]; }
    return undefined;
};

const argv = process.argv.slice(2);
const analyzeOnly = argv[0] === '--analyze' ? resolve(argv[1] ?? '') : undefined;

// ------------------------------------------------------------------ utilities
function psQuote(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function runHeadless(promptText, cwd, timeoutMs = 900000) {
    const command = '& ' + psQuote(CLI) + ' ' + psQuote('--profile') + ' ' + psQuote(PROFILE)
        + ' ' + psQuote('--json') + ' ' + psQuote('-') + '; exit $LASTEXITCODE';
    const startedAt = Date.now();
    const result = spawnSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd, input: promptText, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return {
        command: 'powershell -NoProfile -Command "' + command + '"  < stdin(' + promptText.length + ' chars)',
        status: result.status, signal: result.signal,
        stdout: result.stdout ?? '', stderr: result.stderr ?? '',
        error: result.error === undefined ? undefined : String(result.error),
        elapsedMs: Date.now() - startedAt,
    };
}
async function exists(path) { try { await stat(path); return true; } catch { return false; } }
async function readIfExists(path) { return (await exists(path)) ? readFile(path, 'utf8') : ''; }
function routeLabel(route) {
    if (route === undefined || route === null) return '(none)';
    const effort = route.reasoningEffort === undefined || route.reasoningEffort === null ? '' : ' (' + route.reasoningEffort + ')';
    return route.provider + '/' + route.model + effort;
}
async function latestRunDir(root) {
    let names = [];
    try { names = await readdir(root); } catch { return undefined; }
    const stamps = [];
    for (const name of names) { if (await exists(join(root, name, 'run-meta.json'))) stamps.push(name); }
    stamps.sort();
    return stamps.length === 0 ? undefined : join(root, stamps[stamps.length - 1]);
}
async function resolveRunDir(target) {
    if (target === undefined) return latestRunDir(RUN_ROOT);
    if (await exists(join(target, 'run-meta.json'))) return target;
    return latestRunDir(target);
}

// ------------------------------------------------------------------ prompts (ONE line each)
const taskBody = 'Prove the member survives a dead provider: write handoff.md with a numbered plan of five steps, read it back, append one line saying the member is still alive, read it back, then reply with the single word DONE.';
const promptOne = 'You are the captain of a test team. Execute these steps in this exact order, one tool call at a time. '
    + 'Do not ask questions, do not wait for any member, do not spawn extra agents. '
    + 'STEP 1: call agent_teams_create with exactly these arguments '
    + JSON.stringify({ name: TEAM, description: 't51 E2E automatic provider fallback', approval: 'automatic' }) + '. '
    + 'STEP 2: call agent_teams_add_member with exactly these arguments '
    + JSON.stringify({ name: MEMBER, role: 'fallback runner', provider: PRIMARY.provider, model: PRIMARY.model, activation: 'on-task' })
    + '. This member must NOT have started yet. '
    + 'STEP 3: call agent_teams_set_member_route with exactly these arguments '
    + JSON.stringify({ member_name: MEMBER, fallback_provider: FALLBACK.provider, fallback_model: FALLBACK.model })
    + '. This installs the fallback route before the member ever runs. '
    + 'STEP 4: call agent_teams_create_task with exactly these arguments '
    + JSON.stringify({ subject: 't51 fallback probe task', description: taskBody, assignee: MEMBER })
    + '. This starts the member on its dead provider. '
    + 'STEP 5 onwards: call agent_teams_status with {} repeatedly, up to twelve times, waiting about ten seconds between calls. '
    + 'Stop early only when the ' + MEMBER + ' line no longer says working AND the task line says completed. '
    + 'Keep every status answer. '
    + 'Then reply with one single line in the form: T51 member=<the last ' + MEMBER + ' line from agent_teams_status> task=<the last task line>';

// ------------------------------------------------------------------ checks
const results = [];
function check(id, ok, detail, evidence) {
    results.push({ id, ok: ok === true, detail, evidence: String(evidence ?? '') });
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' \u2014 ' + detail);
    if (evidence !== undefined && String(evidence) !== '') console.log('      evidence: ' + String(evidence).slice(0, 600));
}

// ------------------------------------------------------------------ artifacts
async function findTranscript(memberId) {
    const root = join(DSH_HOME, 'sessions');
    if (await exists(root) === false) return undefined;
    for (const slug of await readdir(root)) {
        const dir = join(root, slug, memberId);
        if (await exists(dir) === false) continue;
        for (const name of await readdir(dir)) { if (name.endsWith('.zstd')) return join(dir, name); }
    }
    return undefined;
}
async function readTranscriptEvents(path) {
    const raw = await readFile(path);
    const magic = [0x28, 0xb5, 0x2f, 0xfd];
    const offsets = [];
    for (let i = 0; i <= raw.length - 4; i += 1) {
        if (raw[i] === magic[0] && raw[i + 1] === magic[1] && raw[i + 2] === magic[2] && raw[i + 3] === magic[3]) offsets.push(i);
    }
    let text = '';
    for (let k = 0; k < offsets.length; k += 1) {
        const slice = raw.subarray(offsets[k], k + 1 < offsets.length ? offsets[k + 1] : raw.length);
        try { text += zstdDecompressSync(slice).toString('utf8'); } catch { /* frame cut short by the next flush */ }
    }
    const events = [];
    for (const line of text.split('\n')) {
        if (line.startsWith('{') === false) continue;
        try { events.push(JSON.parse(line)); } catch { /* partial line */ }
    }
    return { text, events, frames: offsets.length };
}
async function readTeamFile(workspace) {
    const stateRoot = join(workspace, '.agent-teams');
    if (await exists(stateRoot) === false) return { team: undefined, path: undefined, stateRoot };
    for (const dir of await readdir(stateRoot)) {
        const candidate = join(stateRoot, dir, 'team.json');
        if (await exists(candidate) === false) continue;
        try {
            const parsed = JSON.parse(await readFile(candidate, 'utf8'));
            if (Array.isArray(parsed.members) && parsed.members.some((m) => m.name === MEMBER)) {
                return { team: parsed, path: candidate, stateRoot };
            }
        } catch { /* keep looking */ }
    }
    return { team: undefined, path: undefined, stateRoot };
}
function memberOf(team) { return team?.members?.find((m) => m.name === MEMBER); }
function toolExchange(outText) {
    const events = [];
    for (const line of outText.split('\n')) {
        if (line.trim().startsWith('{') === false) continue;
        try { events.push(JSON.parse(line)); } catch { /* not an event */ }
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
        all: (name) => list.filter((entry) => entry.tool === name),
        first: (name) => list.find((entry) => entry.tool === name),
        final: events.filter((event) => event.type === 'final').map((event) => event.text).join('\n'),
        sessionId: events.find((event) => event.type === 'session')?.sessionId,
    };
}
/** Parse the append-only audit table into rows (header and separator dropped). */
function parseAudit(text) {
    const rows = [];
    for (const line of text.split('\n')) {
        if (line.startsWith('|') === false) continue;
        const cells = line.split('|').map((cell) => cell.trim());
        if (cells.length < 9) continue;
        const row = { ts: cells[1], team: cells[2], member: cells[3], previous: cells[4], target: cells[5], applied: cells[6], source: cells[7], raw: line.trim() };
        if (row.member === 'member' || row.ts === 'time' || row.ts.startsWith('---')) continue;
        rows.push(row);
    }
    return rows;
}
/** Fingerprint of the plugin under test: the scratch profile links this working tree. */
async function libFingerprint() {
    const root = join(repoRoot, 'packages', 'dsh-agent-teams', 'lib');
    const parts = [];
    for (const name of (await readdir(root)).sort()) {
        if (name.endsWith('.js') === false) continue;
        const info = await stat(join(root, name));
        parts.push(name + ':' + Math.round(info.mtimeMs) + ':' + info.size);
    }
    return parts.join('|');
}
/** Read the durable route through the plugin OWN code in a cold process (routeOf). */
function coldRouteRead(stateRoot, teamId) {
    const libDirs = [
        join(PROFILE_DIR, 'node_modules', '@nami', 'dsh-agent-teams', 'lib'),
        join(repoRoot, 'packages', 'dsh-agent-teams', 'lib'),
    ];
    const libDir = libDirs.find((dir) => existsSync(join(dir, 'members.js'))) ?? libDirs[1];
    const script = 'const s = await import(' + JSON.stringify(pathToFileURL(join(libDir, 'state.js')).href) + ');'
        + ' const m = await import(' + JSON.stringify(pathToFileURL(join(libDir, 'members.js')).href) + ');'
        + ' const team = await s.readTeam(' + JSON.stringify(stateRoot) + ', ' + JSON.stringify(teamId) + ');'
        + ' const member = team && team.members.find((x) => x.name === ' + JSON.stringify(MEMBER) + ');'
        + ' const route = member === undefined ? null : (m.routeOf(member) ?? null);'
        + ' console.log(JSON.stringify({ lib: ' + JSON.stringify(libDir) + ', route, member: member ?? null }));';
    const run = spawnSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60000 });
    if (run.status !== 0) return { error: (run.stderr || run.error || '').slice(0, 400) };
    try { return JSON.parse(run.stdout); } catch { return { error: String(run.stdout).slice(0, 400) }; }
}

// ------------------------------------------------------------------ analysis
async function analyse(runDir) {
    const meta = JSON.parse((await readIfExists(join(runDir, 'run-meta.json'))) || '{}');
    const out1 = await readIfExists(join(runDir, 'session1.stdout.txt'));
    const workspace = meta.workspace;
    const exchange = toolExchange(out1);
    const teamFile = workspace === undefined ? { team: undefined, stateRoot: undefined } : await readTeamFile(workspace);
    const team = teamFile.team;
    const memberRecord = memberOf(team);
    const create = exchange.first('agent_teams_create');
    const add = exchange.first('agent_teams_add_member');
    const install = exchange.first('agent_teams_set_member_route');
    const createTask = exchange.first('agent_teams_create_task');
    const statuses = exchange.all('agent_teams_status');
    const transcriptPath = memberRecord?.id ? await findTranscript(memberRecord.id) : undefined;
    const transcript = transcriptPath === undefined ? { text: '', events: [], frames: 0 } : await readTranscriptEvents(transcriptPath);
    const auditText = workspace === undefined ? '' : await readIfExists(join(workspace, ...AUDIT_REL));
    const auditRows = parseAudit(auditText).filter((row) => row.member === MEMBER);
    const lastStatus = [...statuses].reverse().find((entry) => String(entry.result ?? '').includes(MEMBER));
    const lastStatusText = String(lastStatus?.result ?? '');
    const task = team?.tasks?.find((item) => item.assignee === MEMBER);
    const cold = teamFile.stateRoot === undefined || team === undefined ? { error: 'no team.json' } : coldRouteRead(teamFile.stateRoot, team.teamId ?? team.id ?? TEAM);
    const analysis = { runDir, workspace, createOk: create !== undefined, addOk: add !== undefined, installOk: install !== undefined, createTaskOk: createTask !== undefined, transcriptPath, frames: transcript.frames, statusCount: statuses.length, auditRows: auditRows.map((row) => row.raw), cold };

    // Diagnostics: did the primary route answer at all? (request/header config + a later turn)
    const hits = [];
    transcript.events.forEach((event, index) => {
        const text = JSON.stringify(event);
        const token = markerOf(text);
        if (token !== undefined) hits.push({ index, type: String(event.type ?? ''), token, snippet: text.slice(0, 240) });
    });
    const lastFailure = memberRecord?.lastFailure;
    const lastFailureToken = lastFailure === undefined ? undefined : markerOf(JSON.stringify(lastFailure));
    // The degradation gate is keyed on the failure CODE (lib/members.js:102), so a code hit counts
    // too: MISSING_CREDENTIAL and AUTH carry no textual marker at all.
    const codeHits = [];
    for (const [index, event] of transcript.events.entries()) {
        const text = JSON.stringify(event);
        for (const code of FALLBACK_CODES) {
            if (text.includes('"' + code + '"')) codeHits.push({ index, code, type: String(event.type ?? ''), snippet: text.slice(0, 400) });
        }
    }
    const lastFailureCode = lastFailure === undefined ? undefined : String(lastFailure.code ?? '');
    check('C1', hits.length > 0 || codeHits.length > 0 || FALLBACK_CODES.includes(lastFailureCode),
        'the member request really failed: a provider failure code in FALLBACK_FAILURE_CODES (members.js:102) or a PROVIDER_FAILURE_MARKERS token (members.js:120-128) on ' + routeLabel(PRIMARY),
        hits.length > 0
            ? 'marker event #' + hits[0].index + ' type=' + hits[0].type + ' token=' + hits[0].token + ' :: ' + hits[0].snippet
            : codeHits.length > 0
                ? 'code event #' + codeHits[0].index + ' type=' + codeHits[0].type + ' code=' + codeHits[0].code + ' :: ' + codeHits[0].snippet
                : 'no failure code in ' + transcript.events.length + ' transcript events; member.lastFailure=' + JSON.stringify(lastFailure ?? null).slice(0, 240));

    // Diagnostics: what the member session really did (kept in the artifact either way).
    const typeHistogram = {};
    for (const event of transcript.events) { const name = String(event.type ?? '?'); typeHistogram[name] = (typeHistogram[name] ?? 0) + 1; }
    const headerConfig = (event) => event?.data?.header?.config ?? null;
    const primaryHeader = transcript.events.find((event) => String(event.type).includes('request/header')
        && JSON.stringify(headerConfig(event) ?? {}).includes(PRIMARY.model));
    const fallbackHeader = transcript.events.find((event) => String(event.type).includes('request/header')
        && JSON.stringify(headerConfig(event) ?? {}).includes(FALLBACK.model));
    analysis.diagnostics = {
        transcriptTypes: typeHistogram,
        primaryHeaderConfig: headerConfig(primaryHeader),
        fallbackHeaderConfig: headerConfig(fallbackHeader),
        captainAddMember: String(add?.result ?? '(no add_member call)').slice(0, 400),
        captainSetRoute: String(install?.result ?? '(no set_member_route call)').slice(0, 400),
        captainCreateTask: String(createTask?.result ?? '(no create_task call)').slice(0, 400),
        providerFailureMarkersSeen: hits.map((hit) => hit.token),
        failureCodesSeen: codeHits.map((hit) => hit.code),
        memberLastFailure: lastFailure ?? null,
        memberStatus: memberRecord?.status ?? null,
        taskStatus: task?.status ?? null,
    };
    console.log('diag      : member request header=' + JSON.stringify(analysis.diagnostics.primaryHeaderConfig)
        + '  fallback header=' + JSON.stringify(analysis.diagnostics.fallbackHeaderConfig));
    console.log('diag      : add_member=' + analysis.diagnostics.captainAddMember.slice(0, 200));
    console.log('diag      : create_task=' + analysis.diagnostics.captainCreateTask.slice(0, 200));

    // C2 — the effective route is the fallback, per the plugin own routeOf.
    const coldRoute = cold?.route;
    const liveFallback = coldRoute !== undefined && coldRoute !== null && coldRoute.provider === FALLBACK.provider
        && coldRoute.model === FALLBACK.model && coldRoute.origin === 'fallback';
    check('C2', liveFallback,
        'routeOf(member) reports the fallback route with origin \'fallback\' (members.js:379-411); the task text calls this origin fallbackActive',
        'route=' + routeLabel(coldRoute) + ' origin=' + (coldRoute?.origin ?? '(none)') + ' via ' + String(cold?.lib ?? cold?.error ?? '(no cold read)'));

    // C3 — the member continued on the fallback and finished its task.
    const modelEvents = transcript.events.map((event, index) => ({ index, type: String(event.type ?? ''), text: JSON.stringify(event) }));
    const primarySeen = modelEvents.filter((event) => event.text.includes(PRIMARY.model));
    const fallbackRequest = modelEvents.filter((event) => event.type.includes('request') && event.text.includes(FALLBACK.model));
    const continued = primarySeen.length > 0 && fallbackRequest.length > 0
        && fallbackRequest[fallbackRequest.length - 1].index > primarySeen[0].index;
    const finished = task?.status === 'completed';
    check('C3', continued && finished,
        'the member continued on the fallback route and completed its task (not a dead turn)',
        'primary events=' + primarySeen.length + ' first=' + (primarySeen[0]?.index ?? '(none)') + ':' + (primarySeen[0]?.type ?? '')
        + ' fallback request events=' + fallbackRequest.length + ' last=' + (fallbackRequest.at(-1)?.index ?? '(none)') + ':' + (fallbackRequest.at(-1)?.type ?? '')
        + ' task.status=' + String(task?.status ?? '(none)') + ' member.status=' + String(memberRecord?.status ?? '(none)'));

    // C4 — the durable record.
    const durable = memberRecord?.fallbackActive === true
        && memberRecord?.activeProvider === FALLBACK.provider && memberRecord?.activeModel === FALLBACK.model;
    check('C4', durable,
        'team.json carries fallbackActive + activeProvider + activeModel naming the fallback route',
        'fallbackActive=' + String(memberRecord?.fallbackActive) + ' activeProvider=' + String(memberRecord?.activeProvider)
        + ' activeModel=' + String(memberRecord?.activeModel) + ' spine=' + String(memberRecord?.provider) + '/' + String(memberRecord?.model));

    // C5 — the status surface.
    const statusShowsFallback = lastStatusText.includes(FALLBACK.provider + '/' + FALLBACK.model)
        && lastStatusText.includes('(fallback)') && lastStatusText.includes(MEMBER);
    const memberLine = lastStatusText.split('\n').find((line) => line.includes(MEMBER) && line.trim().startsWith('-')) ?? '';
    check('C5', statusShowsFallback,
        'agent_teams_status reports the current route as the fallback (tools.js:3107-3112)',
        'line=' + memberLine.trim().slice(0, 300));

    // C6 — the audit trail of the degradation itself.
    const degradationRow = auditRows.find((row) => row.applied === 'live-and-durable'
        && row.target.includes(FALLBACK.provider + '/' + FALLBACK.model) && row.previous.includes(PRIMARY.provider));
    check('C6', degradationRow !== undefined,
        'docs/log/MODEL-SWITCH.md carries a row for the automatic degradation (previous=' + routeLabel(PRIMARY) + ' -> ' + routeLabel(FALLBACK) + ', live-and-durable)',
        auditRows.length === 0 ? 'audit file has no row for ' + MEMBER : auditRows.map((row) => row.raw).join(' || ').slice(0, 600));

    const proved = results.filter((item) => item.ok).map((item) => item.id);
    const failed = results.filter((item) => item.ok !== true).map((item) => item.id);
    analysis.results = results;
    acceptAnalysis(analysis);
    console.log('');
    console.log('run dir   : ' + runDir);
    console.log('workspace : ' + String(workspace));
    console.log('captain   : ' + String(exchange.sessionId ?? '(none)') + '  exit=' + String(meta.session?.status ?? '(analyze only)') + '  elapsed=' + String(meta.session?.elapsedMs ?? '?') + 'ms');
    console.log('member    : ' + String(memberRecord?.name ?? '(none)') + ' id=' + String(memberRecord?.id ?? '(none)') + ' status=' + String(memberRecord?.status ?? '(none)') + ' activity=' + String(memberRecord?.activity ?? '?'));
    console.log('durable   : spine=' + String(memberRecord?.provider) + '/' + String(memberRecord?.model) + ' fallbackActive=' + String(memberRecord?.fallbackActive) + ' active=' + String(memberRecord?.activeProvider) + '/' + String(memberRecord?.activeModel));
    console.log('routeOf   : ' + routeLabel(coldRoute) + ' origin=' + String(coldRoute?.origin ?? '(none)'));
    console.log('audit     : ' + String(auditRows.length) + ' row(s) for ' + MEMBER);
    console.log('');
    console.log('verdict ' + (failed.length === 0 ? 'PASS' : 'FAIL') + ' - proved ' + (proved.join(',') || '(none)') + ' - unproved ' + (failed.join(',') || '(none)'));
    await writeFile(join(runDir, 'analysis.json'), JSON.stringify(analysis, null, 2), 'utf8');
    return failed.length === 0;
}
function acceptAnalysis(analysis) { void analysis; }

// ------------------------------------------------------------------ run
async function runOnce() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const runDir = join(RUN_ROOT, stamp);
    const workspace = join(runDir, 'workspace');
    await mkdir(workspace, { recursive: true });
    const before = await libFingerprint();
    console.log('profile : ' + PROFILE);
    console.log('workspace: ' + workspace);
    console.log('primary : ' + routeLabel(PRIMARY) + '   fallback: ' + routeLabel(FALLBACK));
    console.log('running one real headless captain session ...');
    const session = runHeadless(promptOne, workspace);
    const after = await libFingerprint();
    await writeFile(join(runDir, 'session1.stdout.txt'), session.stdout, 'utf8');
    await writeFile(join(runDir, 'session1.stderr.txt'), session.stderr, 'utf8');
    const meta = {
        stamp, workspace, team: TEAM, member: MEMBER, primary: PRIMARY, fallback: FALLBACK,
        profile: PROFILE,
        session: { status: session.status, error: session.error, elapsedMs: session.elapsedMs, command: session.command, chars: session.stdout.length },
        churn: before !== after,
        fingerprintBefore: before,
        fingerprintAfter: after,
    };
    await writeFile(join(runDir, 'run-meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    console.log('captain session exit=' + String(session.status) + ' in ' + session.elapsedMs + 'ms' + (meta.churn ? '  [WARNING lib/** changed during the run]' : ''));
    if (meta.churn) console.log('WARNING: the plugin working tree moved while the session booted; a missing agent_teams_* tool is not a product verdict here.');
    const ok = await analyse(runDir);
    process.exitCode = ok === true ? 0 : 1;
}

if (analyzeOnly === undefined) {
    await runOnce();
} else {
    const runDir = await resolveRunDir(analyzeOnly);
    if (runDir === undefined) { console.log('no run directory with run-meta.json under ' + String(analyzeOnly)); process.exitCode = 2; }
    else { const ok = await analyse(runDir); process.exitCode = ok === true ? 0 : 1; }
}
