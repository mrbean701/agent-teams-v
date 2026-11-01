#!/usr/bin/env node
/**
 * t21 — E2E: add a manual member to a RUNNING team, in a real captain session.
 *
 *   node tests/t21-add-member-e2e.mjs                  # run the real session(s)
 *   node tests/t21-add-member-e2e.mjs --analyze <dir>  # re-score saved artifacts, no quota
 *
 * Checks (each prints PASS/FAIL with its raw evidence):
 *   A1 a real captain session creates a 1-member team, it leaves the staged phase
 *      and the member is spawned (real child session id) and given its task
 *   A2 while the team is running, agent_teams_add_member adds a second member and
 *      reports the spawn outcome honestly (spawned=true with a session id, or
 *      spawned=false WITH a spawnError in team.json - never asserted blindly)
 *   A3 team.json carries the new member: status not 'removed', the exact requested
 *      route, and a real id when the spawn succeeded
 *   A4 the new member actually receives a task (attempt opened / status moved)
 *   A5 the manual-member cap is enforced: one add past the cap is refused with a
 *      message naming the cap, and no row is written
 *   A6 a duplicate member name is refused, and the roster still holds one row
 *   A7 the real HTTP /plan route (action add_member), served by node http.Server and
 *      driven by fetch, creates the member; a duplicate is refused there too
 *
 * The profile is the scratch profile agent-teams-test (never the desktop profile).
 * The cap is lowered for THIS RUN ONLY with the launcher's --patch overlay, so no
 * profile file is edited and the check can prove the cap is real.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cli = await import(pathToFileURL(join(repoRoot, 'tools', 'test', 'lib', 'dsh-cli.mjs')).href);
const PROFILE = process.env.DSH_TEST_PROFILE ?? 'agent-teams-test';
const CLI = cli.DESKTOP_CLI;
const DSH_HOME = cli.DSH_HOME;
const PROFILE_DIR = join(DSH_HOME, 'profiles', PROFILE);
const LIB = join(repoRoot, 'packages', 'dsh-agent-teams', 'lib');

const TEAM = 'e2e-addmember';
const CAP = 2;
const ROUTE_A = { provider: 'opencode-go', model: 'kimi-k2.7-code' };
const ROUTE_B = { provider: 'opencode-go', model: 'deepseek-v4.1-flash', effort: 'high' };

const argv = process.argv.slice(2);
const analyzeOnly = argv[0] === '--analyze' ? resolve(argv[1] ?? '') : undefined;

// ---------------------------------------------------------------- utilities
function psQuote(value) {
    return "'" + String(value).replaceAll("'", "''") + "'";
}

/** One headless session. The task text travels on stdin ('-') so no prompt
 *  character can be mangled by PowerShell or Windows argv quoting. */
function runHeadless(promptText, cwd, extraArgs, timeoutMs) {
    const parts = [psQuote(CLI), psQuote('--profile'), psQuote(PROFILE)];
    for (const arg of extraArgs ?? []) parts.push(psQuote(arg));
    parts.push(psQuote('--json'), psQuote('-'));
    const command = '& ' + parts.join(' ') + '; exit $LASTEXITCODE';
    const startedAt = Date.now();
    const result = spawnSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd, input: promptText, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return {
        command,
        status: result.status,
        signal: result.signal,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        error: result.error === undefined ? undefined : String(result.error),
        elapsedMs: Date.now() - startedAt,
    };
}

const exists = (path) => {
    try { statSync(path); return true; } catch { return false; }
};

const readJsonFile = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** Parse the headless --json stream into tool exchanges (call + result text). */
function parseStream(text) {
    const events = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') === false) continue;
        try { events.push(JSON.parse(trimmed)); } catch { /* not an event line */ }
    }
    const calls = [];
    const results = new Map();
    let final;
    for (const event of events) {
        if (event.type === 'tool_call' && typeof event.tool === 'string') {
            calls.push({ callId: event.callId, tool: event.tool, input: event.input });
        } else if (event.type === 'tool_result') {
            const text = typeof event.result === 'string' ? event.result : JSON.stringify(event.result ?? '');
            results.set(event.callId, { status: event.status, result: text });
        } else if (event.type === 'final') {
            final = event;
        }
    }
    const exchanges = calls.map((call) => {
        const hit = results.get(call.callId);
        return { tool: call.tool, input: call.input, status: hit === undefined ? undefined : hit.status, result: hit === undefined ? '' : hit.result };
    });
    return { events, calls, exchanges, final };
}

function teamFile(workspace) {
    const stateRoot = join(workspace, '.agent-teams');
    if (exists(stateRoot) === false) return { team: undefined, path: undefined, files: [] };
    const files = [];
    for (const dir of readdirSync(stateRoot)) {
        const candidate = join(stateRoot, dir, 'team.json');
        if (exists(candidate)) files.push(candidate);
    }
    for (const path of files) {
        try {
            const parsed = readJsonFile(path);
            if (Array.isArray(parsed.members)) return { team: parsed, path, files };
        } catch { /* keep looking */ }
    }
    return { team: undefined, path: files[0], files };
}

const memberOf = (team, name) => (team === undefined ? undefined : team.members.find((m) => m.name === name));

function sleep(ms) {
    return new Promise((done) => setTimeout(done, ms));
}

// ---------------------------------------------------------------- prompts
const STEPS = [
    'STEP 1 — call agent_teams_create with {"name":"' + TEAM + '","description":"t21 E2E manual member on a running team",'
        + '"approval":"automatic","plan":{"members":[{"name":"worker-a","role":"long task runner","provider":"' + ROUTE_A.provider + '","model":"' + ROUTE_A.model + '"}],'
        + '"tasks":[{"id":"T1","subject":"write notes.md","description":"Work in several steps and do not finish in one step: write notes.md with a 150 word outline of manual member onboarding, read it back, then append a five bullet summary.","assignee":"worker-a"}]}} .',
    'STEP 2 — call agent_teams_status and note in your own words whether worker-a is running and whether T1 is claimed.',
    'STEP 3 — call agent_teams_add_member with {"name":"worker-b","role":"second manual member","provider":"' + ROUTE_B.provider + '","model":"' + ROUTE_B.model + '","reasoning_effort":"' + ROUTE_B.effort + '","activation":"immediate"} . Report the exact tool output text, including any wording about a session or about whether it was started. Do NOT retry this call if it fails.',
    'STEP 4 — call agent_teams_create_task with {"subject":"write member-b.md","description":"Write member-b.md containing the single line MANUAL_MEMBER_OK, then read it back.","assignee":"worker-b"} .',
    'STEP 5 — call agent_teams_add_member again but with the name "worker-a" (a name the team already uses) and note the rejection text verbatim.',
    'STEP 6 — call agent_teams_add_member with {"name":"worker-c","role":"past the cap","provider":"' + ROUTE_B.provider + '","model":"' + ROUTE_B.model + '"} and note the rejection text verbatim.',
    'STEP 7 — call agent_teams_status once more and report worker-b status plus the current state of the member-b task.',
    'STEP 8 — reply with one line only: ADDMEMBER_DONE <the worker-b member id from STEP 3, or NONE>.',
];
const promptOne = STEPS.join(' ');

// ------------------------------------------------- HTTP /plan (real socket)
/** Mount the real plugin against a synthetic host, serve the REAL /plan route
 *  on a real node http.Server, and drive it with real fetch calls.
 *  Documented limitation: the headless profile boots without a webServer
 *  service, so this route cannot be registered inside the real session; the
 *  handler under test is still the shipped one, the socket is real. */
async function httpPlanCheck(runDir) {
    const libModule = (file) => pathToFileURL(join(LIB, file)).href;
    const indexMod = await import(libModule('index.js'));
    const workspace = join(runDir, 'http-workspace');
    mkdirSync(join(workspace, '.agent-teams', 'team-http'), { recursive: true });

    const registered = new Map();
    const routes = new Map();
    const effects = [];
    const captain = {
        id: 'sess-captain',
        session: {
            id: 'sess-captain',
            header: { cwd: workspace },
            append() {},
            requestHeader: () => ({ config: { provider: ROUTE_A.provider, model: ROUTE_A.model } }),
        },
    };
    const webServer = { register(route) { routes.set(route.path, route); return () => {}; } };
    const registry = { list() { return [{ title: 'ws', path: workspace }]; } };
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        tools: { register(def) { registered.set(def.name, def); } },
        agents: { get(id) { return id === 'sess-captain' ? captain : undefined; }, list() { return []; } },
        subagents: {
            followup() { return Promise.resolve('msg-legacy'); },
            [Symbol.for('dsh.subagent.deliverPrompt')]() { return Promise.resolve('deliver'); },
            sendMessage() { return Promise.resolve('msg-send'); },
            startActivation() {
                return Promise.resolve({ childId: 'child-http', result: Promise.resolve({ text: 'ok' }) });
            },
            getProvider() { return { id: 'spawn', defaultModel: ROUTE_A.model }; },
            list() { return []; },
            interrupt() {},
        },
        llm: {
            async listModels() { return [{ id: ROUTE_A.model }, { id: ROUTE_B.model }]; },
            async listProviders() { return [{ id: ROUTE_A.provider }]; },
            async resolveCallConfig(config) { return config; },
        },
        on() { return () => {}; },
        inject() {},
        systemPrompt: { section() {} },
        effect(fn) { effects.push(fn()); },
        get(name) {
            if (name === 'webServer' || name === 'httpServer') return webServer;
            if (name === 'workspaceRegistry' || name === 'workspace') return registry;
            if (name === 'connection') return { requestRejection() { return undefined; } };
            return undefined;
        },
    };
    const config = {
        stateDir: '.agent-teams',
        memberProvider: 'spawn',
        maxMembers: CAP,
        maxManualMembers: CAP,
        profiles: {},
        toolPolicies: {},
        slashCommand: false,
    };
    indexMod.apply(ctx, config);

    const teamPath = join(workspace, '.agent-teams', 'team-http', 'team.json');
    writeFileSync(teamPath, JSON.stringify({
        id: 'team-http',
        name: 'HTTP',
        captainSessionId: 'sess-captain',
        createdAt: 1,
        taskSeq: 0,
        phase: 'running',
        members: [{ id: '', name: 'alice', provider: ROUTE_A.provider, model: ROUTE_A.model, joinedAt: 1, status: 'idle' }],
        tasks: [],
    }, null, 2));

    const route = routes.get('/plugins/dsh-agent-teams/plan');
    if (route === undefined) {
        return { ok: false, reason: '/plan route did not register against the synthetic host', routes: [...routes.keys()] };
    }

    const server = createServer((req, res) => {
        if (req.method === 'POST' && req.url.startsWith('/plugins/dsh-agent-teams/plan')) {
            route.handler(req, res);
            return;
        }
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('no route');
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const port = server.address().port;
    const post = async (payload) => {
        const response = await fetch('http://127.0.0.1:' + port + '/plugins/dsh-agent-teams/plan', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const text = await response.text();
        let body;
        try { body = JSON.parse(text); } catch { body = undefined; }
        return { status: response.status, body, text };
    };

    const added = await post({
        sessionId: 'sess-captain',
        teamId: 'team-http',
        action: 'add_member',
        memberName: 'bob',
        provider: ROUTE_B.provider,
        model: ROUTE_B.model,
        reasoningEffort: ROUTE_B.effort,
        activation: 'immediate',
    });
    const duplicate = await post({
        sessionId: 'sess-captain',
        teamId: 'team-http',
        action: 'add_member',
        memberName: 'bob',
        provider: ROUTE_B.provider,
        model: ROUTE_B.model,
    });
    const roster = JSON.parse(readFileSync(teamPath, 'utf8'));
    await new Promise((done) => server.close(done));
    return {
        ok: true,
        port,
        url: 'http://127.0.0.1:' + port + '/plugins/dsh-agent-teams/plan',
        added,
        duplicate,
        roster: roster.members.map((m) => ({ id: m.id, name: m.name, status: m.status, provider: m.provider, model: m.model, reasoningEffort: m.reasoningEffort, spawnError: m.spawnError === undefined ? null : String(m.spawnError).split('\n')[0] })),
        tools: [...registered.keys()].length,
    };
}

// ---------------------------------------------------------------- analysis
async function analyse(runDir) {
    const checks = [];
    const check = (id, ok, detail, evidence) => {
        const passed = ok === true;
        checks.push({ id, ok: passed, detail, evidence });
        console.log((passed ? 'PASS ' : 'FAIL ') + id + '  ' + detail + (evidence === undefined ? '' : '\n       evidence: ' + evidence));
    };
    const short = (value, limit = 700) => {
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        return text === undefined ? '(undefined)' : (text.length > limit ? text.slice(0, limit) + ' …' : text);
    };

    const stdoutPath = join(runDir, 'session1.stdout.txt');
    const metaPath = join(runDir, 'run-meta.json');
    const meta = exists(metaPath) ? readJsonFile(metaPath) : undefined;
    if (exists(stdoutPath) === false) {
        check('A1', false, 'no session output in ' + runDir, 'session1.stdout.txt missing');
        for (const id of ['A2', 'A3', 'A4', 'A5', 'A6', 'A7']) check(id, false, 'not evaluated: no session output');
        return { checks, ok: false };
    }

    const stream = parseStream(readFileSync(stdoutPath, 'utf8'));
    const workspace = meta === undefined ? join(runDir, 'workspace') : meta.workspace;
    const found = teamFile(workspace);
    const team = found.team;

    // ---- A1: real team, left the staged phase, member spawned with its task
    const workerA = memberOf(team, 'worker-a');
    const taskT1 = team === undefined ? undefined : (team.tasks ?? []).find((t) => t.id === 't1' || t.id === 'T1');
    const a1 = team !== undefined
        && String(team.phase ?? 'running') !== 'staged'
        && team.halted !== true
        && workerA !== undefined
        && typeof workerA.id === 'string' && workerA.id !== ''
        && taskT1 !== undefined
        && (((taskT1.attemptId ?? '') !== '') || (taskT1.attempt ?? 0) >= 1 || ['claimed', 'working', 'in_progress', 'completed'].includes(taskT1.status));
    check('A1', a1,
        'real captain session created team "' + (team === undefined ? '?' : team.name) + '", phase=' + (team === undefined ? '?' : String(team.phase ?? 'running'))
            + ', worker-a id=' + (workerA === undefined ? '?' : (workerA.id === '' ? '(empty)' : workerA.id))
            + ', task t1=' + (taskT1 === undefined ? '(missing)' : (taskT1.status + '/attempt ' + (taskT1.attempt ?? 0))),
        'team.json ' + String(found.path) + ' :: phase=' + (team === undefined ? '?' : team.phase) + ' members=' + (team === undefined ? '?' : JSON.stringify(team.members.map((m) => ({ name: m.name, id: m.id, status: m.status })))));

    // ---- A2: add_member on the running team, spawned reported honestly
    const adds = stream.exchanges.filter((e) => e.tool === 'agent_teams_add_member');
    const addB = adds.find((e) => String(e.input?.name ?? '').toLowerCase() === 'worker-b');
    const addBText = addB === undefined ? '' : addB.result;
    const spawnedTrue = /added and started \(session /.test(addBText);
    const spawnedFalse = spawnedTrue === false && /added \(/.test(addBText);
    const memberB = memberOf(team, 'worker-b');
    const spawnError = memberB === undefined ? undefined : memberB.spawnError;
    let a2 = addB !== undefined && (spawnedTrue || spawnedFalse);
    let a2Detail = 'no agent_teams_add_member call for worker-b was made';
    if (addB !== undefined && spawnedTrue) {
        a2Detail = 'add_member reported spawned=true for a team that was already running';
    } else if (addB !== undefined && spawnedFalse) {
        const honest = typeof spawnError === 'string' && spawnError !== '';
        a2 = a2 && honest;
        a2Detail = honest
            ? 'add_member reported spawned=false and team.json carries member.spawnError (honest degradation)'
            : 'add_member reported spawned=false but team.json has NO spawnError, so the failure reason is lost';
    }
    check('A2', a2, a2Detail + '; rejected calls on the running team: ' + String(adds.length)
        + '; spawned=' + (spawnedTrue ? 'true' : (spawnedFalse ? 'false' : 'unknown')),
        'tool_result(' + String(addB?.status) + '): ' + short(addBText) + ' | spawnError=' + short(spawnError ?? '(none)', 200));

    // ---- A3: durable roster row and route
    const a3 = memberB !== undefined
        && memberB.status !== 'removed'
        && memberB.provider === ROUTE_B.provider
        && memberB.model === ROUTE_B.model
        && (spawnedTrue ? (typeof memberB.id === 'string' && memberB.id !== '') : true);
    check('A3', a3,
        'team.json holds worker-b (status=' + (memberB === undefined ? '(missing)' : memberB.status)
            + ', route=' + (memberB === undefined ? '?' : memberB.provider + '/' + memberB.model + (memberB.reasoningEffort ? ' (' + memberB.reasoningEffort + ')' : ''))
            + ', id=' + (memberB === undefined ? '?' : (memberB.id === '' ? '(empty)' : memberB.id)) + ')',
        short(memberB ?? { note: 'member-b not in roster', roster: team === undefined ? undefined : team.members.map((m) => m.name) }, 500));

    // ---- A4: the new member received a task
    const tasksForB = team === undefined ? [] : (team.tasks ?? []).filter((t) => t.assignee === 'worker-b');
    const a4 = tasksForB.some((t) => ((t.attemptId ?? '') !== '') || (t.attempt ?? 0) >= 1
        || ['claimed', 'working', 'in_progress', 'completed'].includes(t.status));
    check('A4', a4,
        'task assigned to worker-b reached the member: ' + (tasksForB.length === 0 ? 'no task assignee=worker-b in team.json' : tasksForB.map((t) => (t.id + '=' + t.status + '/attempt ' + (t.attempt ?? 0))).join(', ')),
        short(tasksForB, 700));

    // ---- A5: cap enforced
    const addC = adds.find((e) => String(e.input?.name ?? '').toLowerCase() === 'worker-c');
    const addCText = addC === undefined ? '' : addC.result;
    const capMentioned = /manual member cap/.test(addCText) && new RegExp('\\(\\s*' + CAP + '\\s*\\)').test(addCText);
    const memberC = memberOf(team, 'worker-c');
    const a5 = addC !== undefined && capMentioned && memberC === undefined;
    check('A5', a5,
        'the add beyond the cap (=' + CAP + ') was refused with the cap in the message and wrote no row'
            + (addC === undefined ? ' — but no add_member call for worker-c was made' : ''),
        'tool_result: ' + short(addCText) + ' | worker-c in roster: ' + (memberC === undefined ? 'no' : 'YES'));

    // ---- A6: duplicate name refused
    const dupAdds = adds.filter((e) => String(e.input?.name ?? '').toLowerCase() === 'worker-a');
    const dupAdd = dupAdds.find((e) => /has already been used in team/.test(e.result));
    const workerACount = team === undefined ? 0 : team.members.filter((m) => String(m.name).toLowerCase() === 'worker-a').length;
    const a6 = dupAdd !== undefined && workerACount === 1;
    check('A6', a6,
        'duplicate name refused (' + (dupAdd === undefined ? 'no rejection text found' : 'message names the name and the team') + ') and the roster still holds ' + workerACount + ' row(s) for worker-a',
        'tool_result: ' + short(dupAdd === undefined ? (dupAdds.map((e) => e.result).join(' | ') || '(no duplicate attempt)') : dupAdd.result));

    // ---- A7: real HTTP /plan
    const httpPath = join(runDir, 'http.json');
    let httpResult = exists(httpPath) ? readJsonFile(httpPath) : undefined;
    const addedBody = httpResult === undefined || httpResult.ok !== true ? undefined : httpResult.added.body;
    const bobRow = httpResult === undefined ? undefined : (httpResult.roster ?? []).find((m) => m.name === 'bob');
    const rosterOk = bobRow !== undefined && bobRow.status !== 'removed'
        && bobRow.provider === ROUTE_B.provider && bobRow.model === ROUTE_B.model;
    const createdOverHttp = httpResult !== undefined && httpResult.ok === true
        && httpResult.added.status === 200 && addedBody?.ok === true && rosterOk;
    const spawnedOverHttp = addedBody === undefined ? undefined : addedBody.spawned === true;
    const httpSpawnHonest = spawnedOverHttp === true
        ? (typeof addedBody.member_id === 'string' && addedBody.member_id !== '')
        : (bobRow !== undefined && typeof bobRow.spawnError === 'string' && bobRow.spawnError !== '');
    const dupRefused = httpResult !== undefined && httpResult.ok === true
        && httpResult.duplicate.status >= 400
        && /already been used in team/.test(String(httpResult.duplicate.text ?? ''));
    check('A7', createdOverHttp && httpSpawnHonest && dupRefused,
        'real HTTP POST to the shipped /plan route created the member ('
            + (createdOverHttp ? 'status 200, ok:true, roster row present' : 'FAILED: no 200 + roster row')
            + ', spawned=' + (spawnedOverHttp === true ? 'true with a member id' : (spawnedOverHttp === false ? 'false WITH spawnError recorded (honest degradation of the synthetic host)' : 'unknown'))
            + (dupRefused ? '), duplicate refused with 4xx' : '), duplicate NOT refused'),
        httpResult === undefined ? 'http.json missing' : short({
            url: httpResult.url,
            added: { status: httpResult.added.status, body: httpResult.added.body },
            duplicate: { status: httpResult.duplicate.status, text: String(httpResult.duplicate.text).slice(0, 200) },
            roster: httpResult.roster,
            note: 'synthetic host: the headless profile registers no webServer service, so /plan cannot be mounted inside the real session; the handler is the shipped one and the socket is real',
        }, 1400));
    const ok = checks.every((c) => c.ok === true);
    writeFileSync(join(runDir, 'result.json'), JSON.stringify({
        runDir,
        profile: PROFILE,
        team: TEAM,
        cap: CAP,
        session: meta === undefined ? undefined : meta.session,
        checks,
        verdict: ok ? 'PASS' : 'FAIL',
        proved: checks.filter((c) => c.ok).map((c) => c.id),
        unproved: checks.filter((c) => c.ok === false).map((c) => c.id),
    }, null, 2));
    console.log('');
    console.log((ok ? 'verdict PASS' : 'verdict FAIL') + ' — proved ' + (checks.filter((c) => c.ok).map((c) => c.id).join(',') || 'none')
        + '; unproved ' + (checks.filter((c) => c.ok === false).map((c) => c.id).join(',') || 'none'));
    return { checks, ok };
}

// ---------------------------------------------------------------- preflight
async function preflight(runDir) {
    const pkgPath = join(PROFILE_DIR, 'package.json');
    if (exists(pkgPath) === false) {
        throw new Error('scratch profile "' + PROFILE + '" is missing (' + pkgPath + '); run: node tools/test/test-env.mjs');
    }
    const pkg = readJsonFile(pkgPath);
    const depKey = '@nami/dsh-agent-teams';
    const dependency = (pkg.dependencies ?? {})[depKey];
    const bundles = Array.isArray(pkg.dsh?.profile?.bundles) ? pkg.dsh.profile.bundles : [];
    if (dependency === undefined || bundles.includes(depKey) === false) {
        throw new Error('the scratch profile does not mount the fork: dependency=' + String(dependency) + ' bundles=' + JSON.stringify(bundles) + '; run: node tools/test/test-env.mjs');
    }
    const capsPath = join(runDir, 'caps.yml');
    writeFileSync(capsPath, [
        '# t21 run-only overlay: shrink the member caps for THIS invocation only.',
        '# Nothing here is written into the profile, and the desktop profile is never touched.',
        '- id: agent-teams',
        '  config:',
        '    stateDir: .agent-teams',
        '    memberProvider: spawn',
        '    maxMembers: ' + CAP,
        '    maxManualMembers: ' + CAP,
        '',
    ].join('\n'));
    const dump = cli.runDsh(['--profile', PROFILE, '--patch', capsPath, '--dump-config'], { cwd: repoRoot, timeoutMs: 240000 });
    const row = cli.extractRow(dump.stdout, 'agent-teams');
    writeFileSync(join(runDir, 'dump-caps.txt'), dump.stdout + '\n=== stderr ===\n' + dump.stderr);
    const overlayApplied = new RegExp('maxManualMembers: ' + CAP).test(String(row)) && new RegExp('maxMembers: ' + CAP).test(String(row));
    if (overlayApplied === false) {
        throw new Error('the --patch overlay did not reach the agent-teams config row: ' + String(row).slice(0, 400));
    }
    return { dependency, bundles, capsPath, overlayApplied, dumpStatus: dump.status, row: String(row).trim() };
}

// ---------------------------------------------------------------- main
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

async function main() {
    if (analyzeOnly !== undefined) {
        const { ok } = await analyse(analyzeOnly);
        process.exit(ok ? 0 : 1);
    }
    const startedAt = Date.now();
    const runDir = join(here, 'tmp', 'e2e-addmember', stamp());
    const workspace = join(runDir, 'workspace');
    mkdirSync(workspace, { recursive: true });
    console.log('# t21 add-member E2E — profile ' + PROFILE + ', cap ' + CAP + ', run dir ' + runDir);

    const pre = await preflight(runDir);
    console.log('preflight: profile mounts ' + pre.dependency + ', --patch overlay applied (maxMembers=' + CAP + ', maxManualMembers=' + CAP + ')');

    console.log('session 1: real headless captain session (create -> add member -> duplicate -> cap) …');
    const session = runHeadless(promptOne, workspace, ['--patch', pre.capsPath], 1500000);
    writeFileSync(join(runDir, 'session1.stdout.txt'), session.stdout);
    writeFileSync(join(runDir, 'session1.stderr.txt'), session.stderr);
    console.log('session 1: exit=' + String(session.status) + ' in ' + session.elapsedMs + ' ms');
    if (session.status !== 0) {
        console.log('session 1 stderr: ' + session.stderr.slice(-1200));
    }

    // A4 depends on the new member picking work up after the captain's turn:
    // give the durable record a bounded window to move, and record what we saw.
    let polledMs = 0;
    const pollLimit = 120000;
    for (;;) {
        const now = teamFile(workspace).team;
        const tasksForB = now === undefined ? [] : (now.tasks ?? []).filter((t) => t.assignee === 'worker-b');
        const moved = tasksForB.some((t) => ((t.attemptId ?? '') !== '') || (t.attempt ?? 0) >= 1
            || ['claimed', 'working', 'in_progress', 'completed'].includes(t.status));
        if (moved || polledMs >= pollLimit) break;
        await sleep(5000);
        polledMs += 5000;
    }

    console.log('HTTP /plan: serving the shipped route on a real socket …');
    let httpResult;
    try {
        httpResult = await httpPlanCheck(runDir);
    } catch (error) {
        httpResult = { ok: false, reason: String(error && error.stack ? error.stack : error) };
    }
    writeFileSync(join(runDir, 'http.json'), JSON.stringify(httpResult, null, 2));

    const meta = {
        startedAt,
        finishedAt: Date.now(),
        runDir,
        workspace,
        profile: PROFILE,
        profileDir: PROFILE_DIR,
        cli: CLI,
        team: TEAM,
        cap: CAP,
        routes: { workerA: ROUTE_A, workerB: ROUTE_B },
        preflight: { dependency: pre.dependency, bundles: pre.bundles, overlayApplied: pre.overlayApplied, dumpStatus: pre.dumpStatus },
        session: {
            command: session.command,
            status: session.status,
            signal: session.signal ?? null,
            elapsedMs: session.elapsedMs,
            stderrTail: session.stderr.slice(-2000),
        },
        poll: { limitMs: pollLimit, polledMs },
        http: httpResult.ok === true ? { url: httpResult.url, tools: httpResult.tools } : { error: httpResult.reason },
    };
    writeFileSync(join(runDir, 'run-meta.json'), JSON.stringify(meta, null, 2));

    const { ok } = await analyse(runDir);
    console.log('artifacts: ' + runDir);
    process.exit(ok ? 0 : 1);
}

await main();
