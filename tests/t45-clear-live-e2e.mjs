#!/usr/bin/env node
/**
 * t45 — E2E: CLEAR the route override of a member that is RUNNING (live-and-durable).
 *
 *   node tests/t45-clear-live-e2e.mjs                       # two real headless sessions
 *   node tests/t45-clear-live-e2e.mjs --analyze <dir>        # re-grade saved artifacts (no quota)
 *
 * t18 proved the SET direction on a live member; t37 proved the CLEAR direction only
 * in memory (durable write + static ordering) because liveSelections is a private Map.
 * This test closes the gap: it clears the override of a member that is working, and reads
 * the consequence from the real session transcript, the durable record and the audit log.
 *
 * Checks (one verdict each):
 *   C1  a real captain built a 2-member roster whose member starts on the DECLARED route
 *   C2  the clear hit a member that was working/running and reported the LIVE path
 *       (text form of applied=live-and-durable, cleared=true, origin=declared)
 *   C3  team.json lost routeOverride and the audit log gained a '(cleared)' row
 *   C4  the member session recorded the host model-changed notice and the next request
 *       after it ran the DECLARED route (not the removed override)
 *   C5  the open attempt survived: same attempt id, member finished THAT attempt
 *   C6  a cold process using the plugin own reader sees the declared route, no override
 *   C7  set -> clear again is idempotent: exactly 2 cleared rows, 4 rows total, no extras
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
const SESSION_STORE = join(DSH_HOME, 'storages', 'session_projcache', 'sessions');

const TEAM = 'e2e-t45clear';
const MEMBER = 'worker-a';
// The DECLARED route is the one the member is created with, and the one a clear returns to.
// It must be a route that really runs: the member keeps working after the revert.
const DECLARED = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4.1-flash' };
// The OVERRIDE must differ in provider or model (an effort-only change emits no notice).
const OVERRIDE = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4-pro' };
const AUDIT_REL = ['docs', 'log', 'MODEL-SWITCH.md'];

const argv = process.argv.slice(2);
const analyzeOnly = argv[0] === '--analyze' ? resolve(argv[1] ?? '') : undefined;

// ------------------------------------------------------------------ utilities
function psQuote(value) {
    return "'" + String(value).replaceAll("'", "''") + "'";
}
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

// ------------------------------------------------------------------ prompts (ONE line each)
const longish = 'Work in several steps and do not finish in one step: write notes.md with a 150 word outline, '
    + 'read it back, append five bullet points, read it back again, then write summary.md. Report when both files exist.';
const setArgs = '{"member_name":"' + MEMBER + '","provider":"' + OVERRIDE.provider + '","model":"' + OVERRIDE.model + '"}';
const clearArgs = '{"member_name":"' + MEMBER + '","clear":true}';

const promptOne = 'You are the captain of a test team. Execute these steps in this exact order, one tool call at a time. '
    + 'Do not ask questions, do not wait for any member, do not spawn extra agents. '
    + 'STEP 1: call agent_teams_create with exactly these arguments '
    + '{"name":"' + TEAM + '","description":"t45 E2E clear route override of a running member","approval":"automatic","plan":'
    + '{"members":['
    + '{"name":"' + MEMBER + '","role":"long task runner","provider":"' + DECLARED.provider + '","model":"' + DECLARED.model + '"},'
    + '{"name":"worker-b","role":"idle observer","provider":"' + DECLARED.provider + '","model":"' + DECLARED.model + '"}],'
    + '"tasks":[{"id":"L1","subject":"long multi-step task","description":' + JSON.stringify(longish) + ',"assignee":"' + MEMBER + '"}]}}. '
    + 'STEP 2: call agent_teams_status with {} and keep the ' + MEMBER + ' line. '
    + 'STEP 3: call agent_teams_set_member_route with exactly these arguments ' + setArgs + '. '
    + 'Do this immediately, even if ' + MEMBER + ' is still running. '
    + 'STEP 4: call agent_teams_status with {} (this lets the member take a step on the override route). '
    + 'STEP 5: call agent_teams_status with {} again. '
    + 'STEP 6: call agent_teams_set_member_route with exactly these arguments ' + clearArgs + ' — this is the CLEAR, do it while the member is still running. '
    + 'STEP 7: call agent_teams_status with {} and keep the ' + MEMBER + ' line. '
    + 'STEP 8: call agent_teams_status with {} again (this lets the member take a step on the declared route). '
    + 'STEP 9: call agent_teams_set_member_route with exactly these arguments ' + setArgs + ' (set the override again). '
    + 'STEP 10: call agent_teams_status with {}. '
    + 'STEP 11: call agent_teams_set_member_route with exactly these arguments ' + clearArgs + ' (clear it a second time). '
    + 'STEP 12: call agent_teams_status with {} repeatedly, up to eight times, until the ' + MEMBER + ' line no longer says working. '
    + 'Then reply with one single line in the form: T45 route=<' + MEMBER + ' provider/model from the last status> override=<routeOverride provider/model if the answer shows one, else none>';

const promptTwo = 'A team named ' + TEAM + ' already exists in this workspace from an earlier session. '
    + 'STEP 1: call agent_teams_status with {}. If that shows no team, call agent_teams_status with {"team_id":"' + TEAM + '"}. '
    + 'STEP 2: reply with one single line in the form: COLD route=<' + MEMBER + ' provider>/<' + MEMBER + ' model> override=<the routeOverride provider/model if the answer shows one, else none>';

// ------------------------------------------------------------------ checks
const results = [];
function check(id, ok, detail, evidence) {
    results.push({ id, ok: ok === true, detail, evidence });
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' \u2014 ' + detail);
}

// ------------------------------------------------------------------ artifacts
async function findTranscript(memberId) {
    const root = join(DSH_HOME, 'sessions');
    if (await exists(root) === false) return undefined;
    for (const slug of await readdir(root)) {
        const dir = join(root, slug, memberId);
        if (await exists(dir) === false) continue;
        for (const name of await readdir(dir)) {
            if (name.endsWith('.zstd')) return join(dir, name);
        }
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
    if (await exists(stateRoot) === false) return { team: undefined, path: undefined, files: [] };
    const files = [];
    for (const dir of await readdir(stateRoot)) {
        const candidate = join(stateRoot, dir, 'team.json');
        if (await exists(candidate)) files.push(candidate);
    }
    for (const path of files) {
        const text = await readFile(path, 'utf8');
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed.members) && parsed.members.some((m) => m.name === MEMBER)) return { team: parsed, path, files };
        } catch { /* keep looking */ }
    }
    return { team: undefined, path: files[0], files };
}
function memberOf(team) { return team?.members?.find((m) => m.name === MEMBER); }
function pickRoute(record) {
    if (!record) return undefined;
    if (record.routeOverride) return record.routeOverride;
    if (record.provider || record.model) return { provider: record.provider, model: record.model, reasoningEffort: record.reasoningEffort };
    return undefined;
}
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
/**
 * Fingerprint of the plugin code under test. The scratch profile links the working
 * tree, so a teammate writing lib/** while this run boots silently removes every
 * agent_teams_* tool from the child session. A run whose fingerprint moved is not a
 * product verdict, and this records that instead of blaming the plugin.
 */
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
/** Read the durable route through the plugin OWN code in a cold process. */
function coldRouteRead(stateRoot, teamId) {
    const candidates = [
        join(PROFILE_DIR, 'node_modules', '@nami', 'dsh-agent-teams', 'lib', 'state.js'),
        join(repoRoot, 'packages', 'dsh-agent-teams', 'lib', 'state.js'),
    ];
    const modulePath = candidates.find((path) => existsSync(path)) ?? candidates[0];
    const script = 'const m = await import(' + JSON.stringify(pathToFileURL(modulePath).href) + ');'
        + ' const team = await m.readTeam(' + JSON.stringify(stateRoot) + ', ' + JSON.stringify(teamId) + ');'
        + ' const member = team && team.members.find((x) => x.name === ' + JSON.stringify(MEMBER) + ');'
        + ' console.log(JSON.stringify({ module: ' + JSON.stringify(modulePath) + ', member: member ?? null }));';
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60000 });
    if (run.status !== 0) return { error: run.stderr || run.error };
    try { return JSON.parse(run.stdout); } catch { return { error: run.stdout }; }
}

// ------------------------------------------------------------------ analysis
async function analyse(runDir) {
    const meta = JSON.parse((await readIfExists(join(runDir, 'run-meta.json'))) || '{}');
    const out1 = await readIfExists(join(runDir, 'session1.stdout.txt'));
    const out2 = await readIfExists(join(runDir, 'session2.stdout.txt'));
    const workspace = meta.workspace;
    const exchange = toolExchange(out1);
    const teamFile = await readTeamFile(workspace);
    const team = teamFile.team;
    const memberRecord = memberOf(team);
    const routeCalls = exchange.all('agent_teams_set_member_route');
    const clearCalls = routeCalls.filter((entry) => entry.input?.clear === true);
    const setCalls = routeCalls.filter((entry) => entry.input?.clear !== true);
    const statuses = exchange.all('agent_teams_status');

    // C1 — the roster kept the DECLARED route as the starting point.
    const create = exchange.first('agent_teams_create');
    const planned = create?.input?.plan?.members?.find((m) => m.name === MEMBER);
    check('C1', planned?.provider === DECLARED.provider && planned?.model === DECLARED.model && String(create?.result ?? '').includes(TEAM),
        'agent_teams_create built a 2-member roster whose ' + MEMBER + ' starts on declared ' + routeLabel(DECLARED),
        'planned=' + routeLabel(planned) + ' result="' + String(create?.result ?? '(no create call)').split('\n')[0] + '"');

    // C2 — the clear landed on a RUNNING member and took the live path.
    const statusBefore = statuses.at(0);
    const workingBefore = new RegExp(MEMBER + '[^\\n]*working/running').test(String(statusBefore?.result ?? ''));
    const firstClear = clearCalls.at(0);
    const clearText = String(firstClear?.result ?? '');
    const liveCleared = 'override is cleared: back on its declared route ' + DECLARED.provider + '/' + DECLARED.model;
    check('C2', workingBefore && typeof memberRecord?.id === 'string' && memberRecord.id.length > 0
        && firstClear !== undefined && firstClear.input?.provider === undefined && firstClear.input?.model === undefined
        && clearText.includes(liveCleared) && clearText.includes('applied to the live session and saved')
        // The render only appends ', session <child_id>' when the runtime result carries a
        // child_id, and setMemberRoute never returns one (lib/members.js:1382-1398 has no
        // child_id field; lib/tools.js:1257 declares it, :1346 passes it through). A clear
        // therefore ends at the notice sentence. Live-ness is proven by that sentence plus
        // the audit row applied=live-and-durable (C3) and the session route flip (C4).
        && clearText.includes('(was ' + OVERRIDE.provider + '/' + OVERRIDE.model + ')'),
        'clear hit a working/running member and the tool reported the LIVE path (text form of applied=live-and-durable, cleared=true, origin=declared)',
        'status before: "' + (String(statusBefore?.result ?? '').split('\n').find((l) => l.includes(MEMBER)) ?? '(none)') + '" member.id=' + String(memberRecord?.id)
        + ' clear input=' + JSON.stringify(firstClear?.input ?? null) + ' result="' + clearText.split('\n')[0] + '"');

    // C3 — durable record lost the override; the audit log gained the (cleared) row.
    const auditPath = join(workspace, ...AUDIT_REL);
    const auditRows = parseAudit(await readIfExists(auditPath));
    const memberRows = auditRows.filter((row) => row.team === TEAM && row.member === MEMBER);
    const clearedRows = memberRows.filter((row) => row.target === '(cleared)');
    const firstCleared = clearedRows.at(0);
    check('C3', memberRecord?.routeOverride === undefined
        && memberRecord?.provider === DECLARED.provider && memberRecord?.model === DECLARED.model
        && firstCleared !== undefined && firstCleared.previous.includes(OVERRIDE.model) && firstCleared.applied === 'live-and-durable',
        'team.json lost routeOverride (route is the declared one) and the audit log has the (cleared) row',
        'team.json routeOverride=' + JSON.stringify(memberRecord?.routeOverride ?? null) + ' route=' + routeLabel(pickRoute(memberRecord))
        + ' | audit path=' + auditPath + ' cleared row=' + (firstCleared?.raw ?? '(none)'));

    // C4 — the member conversation: notice, then the next request on the DECLARED route.
    const transcriptPath = await findTranscript(String(memberRecord?.id ?? meta.memberId ?? ''));
    let transcript;
    let noticeEvent;
    let headerAfter;
    let headerBefore;
    if (transcriptPath !== undefined) {
        transcript = await readTranscriptEvents(transcriptPath);
        noticeEvent = transcript.events.find((event) => event.type === 'user/message'
            && event.data?.source?.form === 'notice'
            && JSON.stringify(event.data).includes('continues with ' + DECLARED.model));
        const headers = transcript.events.filter((event) => event.type === 'request/header');
        if (noticeEvent !== undefined) {
            headerAfter = headers.find((event) => event.seq > noticeEvent.seq);
            headerBefore = headers.filter((event) => event.seq < noticeEvent.seq).at(-1);
        }
    }
    const noticeText = noticeEvent === undefined ? '' : JSON.stringify(noticeEvent.data.content?.[0]?.text ?? '');
    const afterConfig = headerAfter?.data?.header?.config;
    const beforeConfig = headerBefore?.data?.header?.config;
    check('C4', noticeEvent !== undefined && noticeText.includes('[model changed:') && noticeText.includes(DECLARED.model) && noticeText.includes(OVERRIDE.model)
        && afterConfig?.provider === DECLARED.provider && afterConfig?.model === DECLARED.model && afterConfig.model !== OVERRIDE.model,
        'member session recorded the model-changed notice and its next request ran the DECLARED route (not the removed override)',
        transcriptPath === undefined ? 'transcript not found under ' + join(DSH_HOME, 'sessions')
            : 'path=' + transcriptPath + ' frames=' + transcript.frames + ' seq=' + String(noticeEvent?.seq) + ' notice=' + noticeText.slice(0, 180)
            + ' | request/header before=' + JSON.stringify(beforeConfig ?? null) + ' after=' + JSON.stringify(afterConfig ?? null)
            + ' (seq ' + String(headerBefore?.seq) + ' -> ' + String(headerAfter?.seq) + ')');

    // C5 — the attempt survived the clear and the member finished THAT attempt.
    const task = team?.tasks?.find((entry) => entry.assignee === MEMBER);
    const attemptBefore = new RegExp('work attempt (\\d+)').exec(String(statuses.at(0)?.result ?? ''))?.[1];
    const attemptAfter = new RegExp('work attempt (\\d+)').exec(String(statuses.at(-1)?.result ?? ''))?.[1];
    const attemptInTranscript = transcript !== undefined && task?.attemptId !== undefined && String(task.attemptId).length > 0
        && transcript.text.includes(String(task.attemptId));
    check('C5', attemptBefore === attemptAfter && attemptBefore === '1' && task?.attempt === 1 && attemptInTranscript && task?.status === 'completed',
        'the open attempt survived the clear: same attempt id, member finished exactly that attempt',
        'status attempt before=' + String(attemptBefore) + ' after=' + String(attemptAfter) + ' team.json attempt=' + String(task?.attempt)
        + ' attemptId=' + String(task?.attemptId) + ' in transcript=' + attemptInTranscript
        + ' task status=' + String(task?.status) + ' output chars=' + String(task?.output ?? '').length);

    // C6 — a cold process, using the plugin own reader, sees the declared route.
    const cold = coldRouteRead(join(workspace, '.agent-teams'), TEAM);
    const coldRoute = pickRoute(cold?.member);
    const coldSessionText = out2.trim().split('\n').at(-1) ?? '';
    check('C6', coldRoute?.provider === DECLARED.provider && coldRoute?.model === DECLARED.model && cold?.member?.routeOverride === undefined,
        'a cold process re-read the route through the plugin own state reader: declared, no override',
        'module=' + String(cold?.module) + ' route=' + routeLabel(coldRoute) + ' routeOverride=' + JSON.stringify(cold?.member?.routeOverride ?? null)
        + ' error=' + String(cold?.error ?? 'none') + ' | fresh LLM session said: "' + coldSessionText.slice(0, 140) + '"');

    // C7 — set -> clear again is idempotent and adds exactly one more cleared row.
    const secondCleared = clearedRows.at(1);
    const liveAll = clearedRows.every((row) => row.applied === 'live-and-durable');
    check('C7', setCalls.length === 2 && clearCalls.length === 2 && clearedRows.length === 2 && memberRows.length === 4 && liveAll
        && secondCleared !== undefined && secondCleared.previous.includes(OVERRIDE.model) && memberRecord?.routeOverride === undefined,
        'set -> clear a second time stayed correct: exactly 2 (cleared) rows, 4 audit rows total, no extra rows',
        'set calls=' + setCalls.length + ' clear calls=' + clearCalls.length + ' member audit rows=' + memberRows.length
        + ' cleared rows=' + clearedRows.length + ' all live=' + liveAll
        + ' | rows=' + JSON.stringify(memberRows.map((row) => row.previous + ' -> ' + row.target + ' [' + row.applied + ']')));

    const summary = {
        runDir, workspace, team: TEAM, member: MEMBER, declared: DECLARED, override: OVERRIDE,
        session1: { exit: meta.status1, sessionId: exchange.sessionId },
        session2: { exit: meta.status2 },
        teamFile: teamFile.path, transcript: transcriptPath, audit: auditPath,
        checks: results,
        verdict: results.every((entry) => entry.ok) ? 'PASS' : 'FAIL',
        proved: results.filter((entry) => entry.ok).map((entry) => entry.id),
        unproved: results.filter((entry) => entry.ok === false).map((entry) => entry.id),
    };
    await writeFile(join(runDir, 'result.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.log('');
    console.log('verdict ' + summary.verdict + ' - proved ' + summary.proved.join(',') + '; unproved ' + (summary.unproved.join(',') || 'none'));
    console.log('artifacts ' + runDir);
    return summary;
}

/** Accept either a run dir or the parent that holds stamped run dirs (newest wins). */
async function resolveRunDir(target) {
    if (await exists(join(target, 'run-meta.json'))) return target;
    if (await exists(target) === false) return undefined;
    const entries = await readdir(target, { withFileTypes: true });
    const dirs = [];
    for (const entry of entries) {
        if (entry.isDirectory() && await exists(join(target, entry.name, 'run-meta.json'))) dirs.push(entry.name);
    }
    dirs.sort();
    return dirs.length === 0 ? undefined : join(target, dirs.at(-1));
}

// ---------------------------------------------------------------------- main
async function preflight() {
    const problems = [];
    if (await exists(PROFILE_DIR) === false) problems.push('scratch profile missing: ' + PROFILE_DIR);
    else {
        const pkg = JSON.parse((await readIfExists(join(PROFILE_DIR, 'package.json'))) || '{}');
        const dep = pkg.dependencies?.['@nami/dsh-agent-teams'] ?? '';
        const bundles = pkg.dsh?.profile?.bundles ?? [];
        if (String(dep).includes('dsh-agent-teams') === false) problems.push('plugin not linked in ' + join(PROFILE_DIR, 'package.json'));
        if (bundles.includes('@nami/dsh-agent-teams') === false) problems.push('plugin not in dsh.profile.bundles of the scratch profile');
    }
    if (existsSync(CLI) === false) problems.push('desktop CLI missing: ' + CLI);
    if (await exists(SESSION_STORE) === false) problems.push('session store missing: ' + SESSION_STORE);
    return problems;
}

async function main() {
    if (analyzeOnly !== undefined) {
        const runDir = await resolveRunDir(analyzeOnly);
        if (runDir === undefined) {
            console.log('FAIL analyze \u2014 no run directory with run-meta.json under ' + analyzeOnly);
            process.exit(1);
        }
        console.log('analyzing ' + runDir);
        const summary = await analyse(runDir);
        process.exit(summary.verdict === 'PASS' ? 0 : 1);
    }
    const problems = await preflight();
    if (problems.length > 0) {
        for (const problem of problems) console.log('FAIL preflight \u2014 ' + problem);
        console.log('fix: node tools/test/test-env.mjs');
        process.exit(1);
    }
    const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\..+$/, '');
    const runDir = join(repoRoot, 'tests', 'tmp', 'e2e-t45clear', stamp);
    const workspace = join(runDir, 'workspace');
    await mkdir(workspace, { recursive: true });
    const startedAt = Date.now();
    const fingerprintBefore = await libFingerprint();
    console.log('run dir   ' + runDir);
    console.log('workspace ' + workspace);
    console.log('session 1 (create team, override, CLEAR while running, override, CLEAR again) ...');
    const one = runHeadless(promptOne, workspace, 900000);
    await writeFile(join(runDir, 'session1.stdout.txt'), one.stdout, 'utf8');
    await writeFile(join(runDir, 'session1.stderr.txt'), one.stderr, 'utf8');
    console.log('session 1 exit=' + String(one.status) + ' in ' + one.elapsedMs + 'ms');
    console.log('session 2 (fresh cold session: what a NEW process can see) ...');
    const two = runHeadless(promptTwo, workspace, 600000);
    await writeFile(join(runDir, 'session2.stdout.txt'), two.stdout, 'utf8');
    await writeFile(join(runDir, 'session2.stderr.txt'), two.stderr, 'utf8');
    console.log('session 2 exit=' + String(two.status) + ' in ' + two.elapsedMs + 'ms');
    const fingerprintAfter = await libFingerprint();
    const churn = fingerprintBefore !== fingerprintAfter;
    if (churn) {
        console.log('WARNING environment churn - packages/dsh-agent-teams/lib changed while this run was booting;');
        console.log('        the verdict below describes a tree that no longer exists, so treat a FAIL here as INVALID.');
        console.log('  before ' + fingerprintBefore);
        console.log('  after  ' + fingerprintAfter);
    }
    await writeFile(join(runDir, 'run-meta.json'), JSON.stringify({
        stamp, workspace, startedAt, finishedAt: Date.now(),
        fingerprintBefore, fingerprintAfter, churn,
        profile: PROFILE, cli: CLI, command1: one.command,
        status1: one.status, status2: two.status,
        elapsed1: one.elapsedMs, elapsed2: two.elapsedMs,
        error1: one.error, error2: two.error,
    }, null, 2), 'utf8');
    const summary = await analyse(runDir);
    if (churn) console.log('verdict is INVALID: the plugin tree moved under this run (see run-meta.json churn=true)');
    process.exit(summary.verdict === 'PASS' ? 0 : 1);
}

await main();
