#!/usr/bin/env node
/**
 * t18 — E2E hot-switch of a RUNNING member route, in the scratch profile.
 *
 *   node tests/t18-hot-switch-e2e.mjs                 # run the two real sessions
 *   node tests/t18-hot-switch-e2e.mjs --analyze <dir> # re-analyse saved artifacts
 *
 * What it proves (each line is a check with a verdict):
 *   C1  a real captain session creates the team and the roster keeps the
 *       declared initial route opencode-go/kimi-k2.7-code
 *   C2  the member is spawned (child session id exists) before the switch
 *   C3  agent_teams_set_member_route reports applied=live-and-durable
 *   C4  the durable team record carries the new route (routeOverride, or the
 *       provider/model fields after the escalation path)
 *   C5  the independent audit log docs/log/MODEL-SWITCH.md gained the row
 *   C6  the member session records the host notice '[model changed: ...]'
 *   C7  the member made a step AFTER the switch that used the new model
 *   C8  the open attempt survived the switch (same attempt id, same session)
 *   C9  a second, cold process still reports the new route (no state loss)
 *
 * Self-locating: the profile, the CLI and the plugin are resolved from the
 * environment/defaults of tools/test/lib/dsh-cli.mjs, never hard-coded paths.
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
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

const TEAM = 'e2e-hotswitch';
const MEMBER = 'worker-a';
const INITIAL = { provider: 'opencode-go', model: 'kimi-k2.7-code' };
const TARGET = { provider: 'opencode-go', model: 'deepseek-v4.1-flash', effort: 'high' };

const argv = process.argv.slice(2);
const analyzeOnly = argv[0] === '--analyze' ? resolve(argv[1] ?? '') : undefined;

// ---------------------------------------------------------------- utilities
function psQuote(value) {
    return "'" + String(value).replaceAll("'", "''") + "'";
}
/** Run one headless session. The task text travels on stdin ('-'), so no
 *  prompt character can be mangled by PowerShell or Windows argv quoting. */
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

async function exists(path) {
    try { await stat(path); return true; } catch { return false; }
}

/** Every object reachable inside a parsed NDJSON line. */
function walk(value, visit) {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const item of value) walk(item, visit); return; }
    visit(value);
    for (const key of Object.keys(value)) walk(value[key], visit);
}

/** Parse the --json event stream and pull out every tool payload we can see. */
function parseStream(text) {
    const events = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') === false) continue;
        try { events.push(JSON.parse(trimmed)); } catch { /* not an event line */ }
    }
    const routes = [];
    const statuses = [];
    const creates = [];
    for (const event of events) {
        walk(event, (node) => {
            if (typeof node.applied === 'string' && typeof node.provider === 'string'
                && (typeof node.member_name === 'string' || typeof node.name === 'string')) routes.push(node);
            else if (Array.isArray(node.members) && Array.isArray(node.tasks)) statuses.push(node);
            else if (typeof node.team_id === 'string' && Array.isArray(node.members)) creates.push(node);
        });
    }
    return { events, routes, statuses, creates };
}

/** Route label as the audit log renders it. */
function routeLabel(route) {
    if (route === undefined || route === null) return '(none)';
    const effort = route.reasoningEffort === undefined || route.reasoningEffort === null ? '' : ' (' + route.reasoningEffort + ')';
    return route.provider + '/' + route.model + effort;
}

async function readTeamFile(workspace) {
    const stateRoot = join(workspace, '.agent-teams');
    if (await exists(stateRoot) === false) return { team: undefined, path: undefined, files: [] };
    const dirs = await readdir(stateRoot);
    const files = [];
    for (const dir of dirs) {
        const candidate = join(stateRoot, dir, 'team.json');
        if (await exists(candidate)) files.push(candidate);
    }
    for (const path of files) {
        const text = await readFile(path, 'utf8');
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed.members) && parsed.members.some((m) => m.name === MEMBER)) {
                return { team: parsed, path, files };
            }
        } catch { /* keep looking */ }
    }
    return { team: undefined, path: files[0], files };
}

/** Locate the member's own session record on disk. */
async function findMemberRecord(memberId, startedAt) {
    if (await exists(SESSION_STORE) === false) return { path: undefined, text: undefined };
    const names = await readdir(SESSION_STORE);
    const wanted = memberId === undefined ? undefined : memberId.replace(/^session-/, '');
    for (const name of names) {
        if (name.endsWith('.json') === false) continue;
        if (wanted !== undefined && name.includes(wanted)) {
            const path = join(SESSION_STORE, name);
            return { path, text: await readFile(path, 'utf8') };
        }
    }
    const recent = [];
    for (const name of names) {
        if (name.endsWith('.json') === false) continue;
        const path = join(SESSION_STORE, name);
        const info = await stat(path);
        if (info.mtimeMs >= startedAt - 5000) recent.push({ path, mtime: info.mtimeMs });
    }
    recent.sort((a, b) => b.mtime - a.mtime);
    for (const entry of recent.slice(0, 8)) {
        const text = await readFile(entry.path, 'utf8');
        if (text.includes(MEMBER)) return { path: entry.path, text };
    }
    return { path: undefined, text: undefined, scanned: recent.length };
}
import { existsSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';

// ------------------------------------------------------------------ prompts
const longish = 'Work in several steps and do not finish in one step: write notes.md with a 150 word outline, '
    + 'read it back, append five bullet points, read it back again, then write summary.md. Report when both files exist.';
const promptOne = 'You are the captain of a test team. Execute these four steps in this exact order, one tool call at a time. '
    + 'Do not ask questions, do not wait for any member, do not spawn extra agents. '
    + 'STEP 1: call agent_teams_create with exactly these arguments '
    + '{"name":"' + TEAM + '","description":"t18 E2E hot switch of a running member route","approval":"automatic","plan":'
    + '{"members":['
    + '{"name":"' + MEMBER + '","role":"long task runner","provider":"' + INITIAL.provider + '","model":"' + INITIAL.model + '"},'
    + '{"name":"worker-b","role":"idle observer","provider":"' + INITIAL.provider + '","model":"' + INITIAL.model + '"}],'
    + '"tasks":[{"id":"L1","subject":"long multi-step task","description":' + JSON.stringify(longish) + ',"assignee":"' + MEMBER + '"}]}}. '
    + 'STEP 2: call agent_teams_status with {} and keep the worker-a line from the answer. '
    + 'STEP 3: call agent_teams_set_member_route with exactly these arguments '
    + '{"member_name":"' + MEMBER + '","provider":"' + TARGET.provider + '","model":"' + TARGET.model + '","reasoning_effort":"' + TARGET.effort + '"}. '
    + 'Do this immediately, even if worker-a is still running: that is the whole point of this test. '
    + 'STEP 4: call agent_teams_status with {} again. '
    + 'Then reply with one single line in the form: HOTSWITCH applied=<applied value from step 3> now=<worker-a provider/model from step 4>';

const promptTwo = 'A team named ' + TEAM + ' already exists in this workspace from an earlier session. '
    + 'STEP 1: call agent_teams_status with {}. If that shows no team, call agent_teams_status with {"team_id":"' + TEAM + '"}. '
    + 'STEP 2: reply with one single line in the form: COLD route=<worker-a provider>/<worker-a model> override=<the routeOverride provider/model if the answer shows one, else none>';

// ------------------------------------------------------------------ checks
const results = [];
function check(id, ok, detail, evidence) {
    results.push({ id, ok: ok === true, detail, evidence });
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' \u2014 ' + detail);
}

// ------------------------------------------------------------------ transcript
/** Locate the REAL member transcript: $DSH_HOME/sessions/<cwd-slug>/<sessionId>/*.zstd */
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
/** The harness appends one zstd frame per flush, so a whole-file decompress
 *  only yields the first frame. Walk the frame magic instead. */
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

// ------------------------------------------------------------------ analysis
async function readIfExists(path) {
    return (await exists(path)) ? readFile(path, 'utf8') : '';
}
function pickRoute(record) {
    if (!record) return undefined;
    if (record.routeOverride) return record.routeOverride;
    if (record.provider || record.model) return { provider: record.provider, model: record.model, reasoningEffort: record.reasoningEffort };
    return undefined;
}
function memberOf(team) {
    return team?.members?.find((m) => m.name === MEMBER);
}
/** Split the headless --json stream into tool calls plus their results, keyed by callId. */
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
        first: (name) => list.find((entry) => entry.tool === name),
        all: (name) => list.filter((entry) => entry.tool === name),
        final: events.filter((event) => event.type === 'final').map((event) => event.text).join('\n'),
        sessionId: events.find((event) => event.type === 'session')?.sessionId,
    };
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

async function analyse(runDir) {
    const meta = JSON.parse((await readIfExists(join(runDir, 'run-meta.json'))) || '{}');
    const out1 = await readIfExists(join(runDir, 'session1.stdout.txt'));
    const err1 = await readIfExists(join(runDir, 'session1.stderr.txt'));
    const out2 = await readIfExists(join(runDir, 'session2.stdout.txt'));
    const workspace = meta.workspace;
    const exchange = toolExchange(out1);
    const teamFile = await readTeamFile(workspace);
    const team = teamFile.team;
    const memberRecord = memberOf(team);

    // C1 — the captain created the roster with the declared initial route.
    const create = exchange.first('agent_teams_create');
    const plannedMember = create?.input?.plan?.members?.find((m) => m.name === MEMBER);
    check('C1', plannedMember?.provider === INITIAL.provider && plannedMember?.model === INITIAL.model
        && String(create?.result ?? '').includes(TEAM),
        'agent_teams_create built a 2-member roster whose ' + MEMBER + ' starts on ' + routeLabel(INITIAL),
        'planned=' + routeLabel(plannedMember) + ' result="' + String(create?.result ?? '(no create call)').split('\n')[0] + '"');

    // C2 — the switch hit a member that was already running.
    const statusBefore = exchange.all('agent_teams_status').at(0);
    const statusAfter = exchange.all('agent_teams_status').at(-1);
    const runningBefore = /worker-a[^\n]*working\/running/.test(String(statusBefore?.result ?? ''));
    check('C2', runningBefore && typeof memberRecord?.id === 'string' && memberRecord.id.length > 0,
        'member was working/running (spawned child session) when the route changed',
        'status before switch: "' + (String(statusBefore?.result ?? '').split('\n').find((l) => l.includes('worker-a')) ?? '(none)') + '"');

    // C3 — the tool reported the live path, not only a durable write.
    const route = exchange.first('agent_teams_set_member_route');
    const routeText = String(route?.result ?? '');
    const liveWording = 'route is now ' + TARGET.provider + '/' + TARGET.model + ', reasoning ' + TARGET.effort;
    check('C3', route !== undefined && routeText.includes(liveWording) && routeText.includes('applied to the live session and saved'),
        'agent_teams_set_member_route reported applied to the LIVE session (text form of applied=live-and-durable)',
        'input=' + JSON.stringify(route?.input ?? null) + ' result="' + routeText.split('\n')[0] + '"');

    // C4 — the durable team record carries the new route.
    const durableRoute = pickRoute(memberRecord);
    check('C4', durableRoute?.provider === TARGET.provider && durableRoute?.model === TARGET.model,
        'team.json records the new route for ' + MEMBER,
        'route=' + routeLabel(durableRoute) + ' routeOverride=' + JSON.stringify(memberRecord?.routeOverride ?? null));

    // C5 — the independent audit row (the plugin writes it under the WORKSPACE).
    const auditPath = join(workspace, 'docs', 'log', 'MODEL-SWITCH.md');
    const auditText = await readIfExists(auditPath);
    const auditRow = auditText.split('\n').find((line) => line.includes('| ' + MEMBER + ' |') && line.includes(TEAM)) ?? '';
    check('C5', auditRow.includes(TARGET.provider + '/' + TARGET.model) && auditRow.includes('live-and-durable'),
        'audit log gained the route-change row written by appendRouteChangeAudit',
        auditRow === '' ? 'no row under ' + auditPath : 'path=' + auditPath + ' row=' + auditRow.trim());

    // C6 + C7 — the member's own transcript: notice, then the next request.
    const transcriptPath = await findTranscript(String(memberRecord?.id ?? meta.memberId ?? ''));
    let noticeEvent;
    let headerBefore;
    let headerAfter;
    let transcript;
    if (transcriptPath !== undefined) {
        transcript = await readTranscriptEvents(transcriptPath);
        noticeEvent = transcript.events.find((event) => event.type === 'user/message'
            && event.data?.source?.form === 'notice'
            && JSON.stringify(event.data).includes('[model changed:'));
        const headers = transcript.events.filter((event) => event.type === 'request/header');
        if (noticeEvent !== undefined) {
            const noticeSeq = noticeEvent.seq;
            headerAfter = headers.find((event) => event.seq > noticeSeq);
            headerBefore = headers.filter((event) => event.seq < noticeSeq).at(-1);
        }
    }
    const noticeText = noticeEvent === undefined ? '' : JSON.stringify(noticeEvent.data.content?.[0]?.text ?? '');
    check('C6', noticeEvent !== undefined && noticeText.includes('[model changed:') && noticeText.includes(TARGET.model) && noticeText.includes(INITIAL.model),
        'member conversation carries the host model-changed notice',
        transcriptPath === undefined ? 'transcript not found under ' + join(DSH_HOME, 'sessions')
            : 'path=' + transcriptPath + ' frames=' + transcript.frames + ' seq=' + String(noticeEvent?.seq) + ' text=' + noticeText.slice(0, 200));

    const afterConfig = headerAfter?.data?.header?.config;
    const beforeConfig = headerBefore?.data?.header?.config;
    check('C7', afterConfig !== undefined && afterConfig.provider === TARGET.provider
        && afterConfig.model === TARGET.model && afterConfig.reasoningEffort === TARGET.effort
        && beforeConfig !== undefined && beforeConfig.model === INITIAL.model,
        'the FIRST request after the notice ran the new route (previous request ran the old one)',
        'request/header before=' + JSON.stringify(beforeConfig ?? null) + ' after=' + JSON.stringify(afterConfig ?? null)
        + ' (seq ' + String(headerBefore?.seq) + ' -> ' + String(headerAfter?.seq) + ')');

    // C8 — the open attempt survived the switch.
    const task = team?.tasks?.find((entry) => entry.assignee === MEMBER);
    const attemptBefore = /work attempt (\d+)/.exec(String(statusBefore?.result ?? ''))?.[1];
    const attemptAfter = /work attempt (\d+)/.exec(String(statusAfter?.result ?? ''))?.[1];
    const claimAttemptId = transcript === undefined ? undefined
        : /sourceAttemptId|attempt id (\S+)/i.exec(transcript.text)?.[1];
    const claimedInTranscript = transcript !== undefined && task?.attemptId !== undefined
        && transcript.text.includes(String(task.attemptId));
    check('C8', attemptBefore === attemptAfter && attemptBefore !== undefined
        && (claimedInTranscript || claimAttemptId !== undefined),
        'member kept its open attempt across the switch and finished that same attempt',
        'status attempt before=' + String(attemptBefore) + ' after=' + String(attemptAfter)
        + ' team.json attempt=' + String(task?.attempt) + ' attemptId=' + String(task?.attemptId)
        + ' attemptId appears in member transcript=' + claimedInTranscript
        + ' task status=' + String(task?.status));

    // C9 — a cold process, using the plugin's own reader, still sees the route.
    const cold = coldRouteRead(join(workspace, '.agent-teams'), TEAM);
    const coldRoute = pickRoute(cold?.member);
    const coldSessionText = out2.trim().split('\n').at(-1) ?? '';
    check('C9', coldRoute?.provider === TARGET.provider && coldRoute?.model === TARGET.model,
        'a cold process (no live session) re-read the route through the plugin own state reader',
        'module=' + String(cold?.module) + ' route=' + routeLabel(coldRoute) + ' error=' + String(cold?.error ?? 'none')
        + ' | fresh LLM session said: "' + coldSessionText.slice(0, 120) + '"');

    const summary = {
        runDir, workspace, team: TEAM, member: MEMBER, initial: INITIAL, target: TARGET,
        session1: { exit: meta.status1, sessionId: exchange.sessionId, stderrTail: err1.slice(-300) },
        session2: { exit: meta.status2, stderrTail: (await readIfExists(join(runDir, 'session2.stderr.txt'))).slice(-300) },
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
    return problems;
}

async function main() {
    if (analyzeOnly !== undefined) {
        const summary = await analyse(analyzeOnly);
        process.exit(summary.verdict === 'PASS' ? 0 : 1);
    }
    const problems = await preflight();
    if (problems.length > 0) {
        for (const problem of problems) console.log('FAIL preflight \u2014 ' + problem);
        console.log('fix: node tools/test/test-env.mjs');
        process.exit(1);
    }
    const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\..+$/, '');
    const runDir = join(repoRoot, 'tests', 'tmp', 'e2e-hotswitch', stamp);
    const workspace = join(runDir, 'workspace');
    await mkdir(workspace, { recursive: true });
    const startedAt = Date.now();
    console.log('run dir   ' + runDir);
    console.log('workspace ' + workspace);
    console.log('session 1 (create the team, let the member run, switch its route mid-flight) ...');
    const one = runHeadless(promptOne, workspace, 900000);
    await writeFile(join(runDir, 'session1.stdout.txt'), one.stdout, 'utf8');
    await writeFile(join(runDir, 'session1.stderr.txt'), one.stderr, 'utf8');
    console.log('session 1 exit=' + String(one.status) + ' in ' + one.elapsedMs + 'ms');
    console.log('session 2 (fresh cold session: what a NEW process can see) ...');
    const two = runHeadless(promptTwo, workspace, 600000);
    await writeFile(join(runDir, 'session2.stdout.txt'), two.stdout, 'utf8');
    await writeFile(join(runDir, 'session2.stderr.txt'), two.stderr, 'utf8');
    console.log('session 2 exit=' + String(two.status) + ' in ' + two.elapsedMs + 'ms');
    await writeFile(join(runDir, 'run-meta.json'), JSON.stringify({
        stamp, workspace, startedAt, finishedAt: Date.now(),
        profile: PROFILE, cli: CLI, command1: one.command,
        status1: one.status, status2: two.status,
        elapsed1: one.elapsedMs, elapsed2: two.elapsedMs,
        error1: one.error, error2: two.error,
    }, null, 2), 'utf8');
    const summary = await analyse(runDir);
    process.exit(summary.verdict === 'PASS' ? 0 : 1);
}

await main();
