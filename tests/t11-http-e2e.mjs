#!/usr/bin/env node
/**
 * t11 — HTTP acceptance of the running-team control plane, on the scratch profile.
 *
 *   node tests/t11-http-e2e.mjs                      # run the real session + real HTTP
 *   node tests/t11-http-e2e.mjs --analyze <runDir>    # re-verdict saved artifacts (no session)
 *
 * Phase A runs a REAL headless captain session in the draft profile on a temp
 * workspace: it creates team "t11http" (worker-a long task, worker-b idle) on the
 * live route, then switches worker-a with the TOOL path, which is the ONLY way to
 * prove the live consequence (notice + next request on the new model) because a
 * headless profile never mounts webServer/workspaceRegistry, so /plan cannot exist
 * inside that process (lib/index.js:182-187).
 *
 * Phase B mounts the REAL plugin (lib/index.js apply) against that REAL team
 * directory with the t4/t21 fake ctx, and drives the panel's own HTTP endpoint
 * through a REAL node http.Server and REAL fetch. That is the route the panel
 * (t10) actually posts to; nothing is stubbed in the HTTP layer itself.
 *
 * Self-locating: CLI, profile and DSH_HOME come from tools/test/lib/dsh-cli.mjs;
 * the plugin comes from this file's own URL; the workspace is a fresh dir under
 * tests/tmp. No absolute path is baked in.
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cli = await import(pathToFileURL(join(repoRoot, 'tools', 'test', 'lib', 'dsh-cli.mjs')).href);
const LIB = join(repoRoot, 'packages', 'dsh-agent-teams', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;

const PROFILE = process.env.DSH_TEST_PROFILE ?? cli.TEST_PROFILE;
const CLI = cli.DESKTOP_CLI;
const DSH_HOME = cli.DSH_HOME;

const TEAM = 't11http';
const MEMBER = 'worker-a';
const IDLE = 'worker-b';
const NEWBIE = 'worker-c';
const OVER_CAP = 'worker-d';
// The only route known alive in this environment (opencode-go is dead: BUG-006).
const LIVE = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4.1-flash', effort: 'high' };
const SWITCH = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4-pro', effort: 'high' };
const PLAN_PATH = '/plugins/dsh-agent-teams/plan';

const argv = process.argv.slice(2);
const analyzeDir = argv[0] === '--analyze' ? resolve(argv[1] ?? '') : undefined;

// ---------------------------------------------------------------- utilities
function psQuote(value) {
    return "'" + String(value).replaceAll("'", "''") + "'";
}
async function exists(path) {
    try { await stat(path); return true; } catch { return false; }
}
function routeLabel(route) {
    if (route === undefined || route === null) return '(none)';
    const effort = route.reasoningEffort === undefined || route.reasoningEffort === null ? '' : ' (' + route.reasoningEffort + ')';
    return route.provider + '/' + route.model + effort;
}
function pickRoute(record) {
    if (!record) return undefined;
    if (record.routeOverride) return record.routeOverride;
    if (record.provider || record.model) return { provider: record.provider, model: record.model, reasoningEffort: record.reasoningEffort };
    return undefined;
}
function saveText(dir, name, text) {
    return writeFile(join(dir, name), text, 'utf8');
}
function saveJson(dir, name, value) {
    return writeFile(join(dir, name), JSON.stringify(value, null, 2), 'utf8');
}
async function readIfExists(path, fallback) {
    return (await exists(path)) ? readFile(path, 'utf8') : (fallback ?? '');
}
async function readJsonIf(path) {
    const text = await readIfExists(path, '');
    if (text === '') return undefined;
    try { return JSON.parse(text); } catch { return undefined; }
}

/** Run one headless session; the prompt travels on stdin so Windows argv quoting
 *  cannot mangle it (and it must stay a single line: the CLI cuts at a newline). */
function runSession(promptText, cwd, timeoutMs = 900000) {
    const command = '& ' + psQuote(CLI) + ' ' + psQuote('--profile') + ' ' + psQuote(PROFILE)
        + ' ' + psQuote('--json') + ' ' + psQuote('-') + '; exit $LASTEXITCODE';
    const startedAt = Date.now();
    const result = spawnSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd, input: promptText, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return {
        command: 'powershell -NoProfile -Command "' + command + '"  < stdin(' + promptText.length + ' chars)',
        status: result.status,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        error: result.error === undefined ? undefined : String(result.error),
        elapsedMs: Date.now() - startedAt,
    };
}

/** Every object reachable inside one parsed NDJSON line. */
function walk(value, visit) {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const item of value) walk(item, visit); return; }
    visit(value);
    for (const key of Object.keys(value)) walk(value[key], visit);
}
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
function toolExchange(outText) {
    const { events } = parseStream(outText);
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
        first: (name) => list.find((entry) => entry.tool === name),
        all: (name) => list.filter((entry) => entry.tool === name),
        final: events.filter((event) => event.type === 'final').map((event) => event.text).join('\n'),
        sessionId: events.find((event) => event.type === 'session')?.sessionId,
    };
}

/** The real team record on disk: <workspace>/.agent-teams/<id>/team.json */
async function readTeamFile(workspace, teamName) {
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
            if (Array.isArray(parsed.members) && (parsed.name === teamName || parsed.id === teamName
                || parsed.members.some((m) => m.name === MEMBER))) {
                return { team: parsed, path, files };
            }
        } catch { /* keep looking */ }
    }
    return { team: undefined, path: files[0], files };
}

/** The member's own transcript: $DSH_HOME/sessions/<cwd-slug>/<sessionId>/*.zstd */
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
/** One zstd frame per flush: walk the frame magic instead of decompressing once. */
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
        try { text += zstdDecompressSync(slice).toString('utf8'); } catch { /* frame cut by the next flush */ }
    }
    return { text, frames: offsets.length };
}

/** Read the durable route through the plugin OWN code in a second, cold process. */
function coldRouteRead(stateRoot, teamId) {
    const modulePath = join(LIB, 'state.js');
    const script = 'const m = await import(' + JSON.stringify(pathToFileURL(modulePath).href) + ');'
        + ' const team = await m.readTeam(' + JSON.stringify(stateRoot) + ', ' + JSON.stringify(teamId) + ');'
        + ' console.log(JSON.stringify({ team: team === undefined ? null : {'
        + ' id: team.id, name: team.name, phase: team.phase, members: team.members.map((x) => ({'
        + ' name: x.name, id: x.id, status: x.status, provider: x.provider, model: x.model, routeOverride: x.routeOverride ?? null })) } }));';
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 60000 });
    if (run.status !== 0) return { error: (run.stderr || '') + String(run.error ?? '') };
    try { return JSON.parse(run.stdout); } catch { return { error: run.stdout }; }
}

// ---------------------------------------------------------------- fake ctx
/** Only the surfaces lib/index.js + lib/tools.js + lib/members.js touch, and the
 *  catalog mirrors the real provider/model ids the session declares. */
function makeHarness(workspace, captainId) {
    const registered = new Map();
    const routes = new Map();
    const catalog = [LIVE.model, SWITCH.model, 'deepseek/deepseek-v4.1-flash-fast'];
    const providerRow = { id: LIVE.provider, name: LIVE.provider, models: catalog.map((id) => ({ id, model: id, name: id })) };
    const captain = {
        id: captainId,
        session: {
            id: captainId,
            header: { cwd: workspace },
            append() {},
            requestHeader: () => ({ config: { provider: LIVE.provider, model: LIVE.model } }),
        },
    };
    const webServer = { register(route) { routes.set(route.path, route); return () => {}; } };
    const registry = { list() { return [{ title: 'ws', path: workspace }]; } };
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        tools: { register(def) { registered.set(def.name, def); } },
        agents: { get(id) { return id === captainId ? captain : undefined; }, list() { return []; } },
        subagents: {
            followup() { return Promise.resolve('msg-legacy'); },
            [Symbol.for('dsh.subagent.deliverPrompt')]() { return Promise.resolve('deliver'); },
            sendMessage() { return Promise.resolve('msg-send'); },
            startActivation() {
                // Honest: this process owns no agent runtime, so it cannot start a
                // child session. The plugin is expected to surface that as spawnError.
                return Promise.reject(new Error('t11 harness: no agent runtime in this HTTP-only process'));
            },
            getProvider() { return { id: 'spawn', defaultModel: LIVE.model }; },
            list() { return []; },
            interrupt() {},
        },
        llm: {
            async listModels(arg) {
                const all = catalog.map((id) => ({ id, model: id, provider: LIVE.provider }));
                if (arg && typeof arg.provider === 'string') return all.filter((row) => row.provider === arg.provider);
                return all;
            },
            async listProviders() { return [providerRow]; },
            async resolveCallConfig(config) { return config; },
        },
        on() { return () => {}; },
        inject() {},
        systemPrompt: { section() {} },
        effect(fn) { try { fn(); } catch { /* harness */ } },
        get(name) {
            if (name === 'webServer' || name === 'httpServer') return webServer;
            if (name === 'workspaceRegistry' || name === 'workspace') return registry;
            if (name === 'connection') return { requestRejection() { return undefined; } };
            return undefined;
        },
    };
    return { ctx, captain, registered, routes };
}

function buildConfig(extra) {
    return {
        stateDir: '.agent-teams',
        memberProvider: 'spawn',
        maxMembers: 8,
        maxManualMembers: 12,
        profiles: {},
        toolPolicies: {},
        slashCommand: false,
        ...(extra ?? {}),
    };
}

/** Mount the real plugin, serve its registered routes over a REAL http server. */
async function mountAndServe(workspace, captainId, extra) {
    const indexMod = await import(libModule('index.js'));
    const h = makeHarness(workspace, captainId);
    indexMod.apply(h.ctx, buildConfig(extra));
    const route = h.routes.get(PLAN_PATH);
    if (route === undefined) throw new Error('no ' + PLAN_PATH + ' route registered; ctx mount refused it');
    const server = createServer((req, res) => {
        void Promise.resolve()
            .then(() => route.handler(req, res))
            .catch((error) => { try { res.writeHead(500, { 'content-type': 'text/plain' }); res.end('harness: ' + String(error)); } catch { /* sent */ } });
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    const port = server.address().port;
    return {
        port,
        routes: [...h.routes.keys()],
        tools: [...h.registered.keys()],
        close: () => new Promise((done) => server.close(() => done())),
    };
}

async function postPlan(port, payload) {
    const url = 'http://127.0.0.1:' + port + PLAN_PATH;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    console.log('POST ' + PLAN_PATH + ' ' + JSON.stringify(payload));
    console.log('  -> HTTP ' + response.status + ' ' + text);
    return { status: response.status, text, json };
}

// ---------------------------------------------------------------- prompt
const longish = 'Work in several steps and do not finish in one step: write notes.md with a 120 word outline, '
    + 'read it back, append five bullet points, read it back again, then write summary.md. Report when both files exist.';
const promptOne = 'You are the captain of a test team. Execute these four steps in this exact order, one tool call at a time. '
    + 'Do not ask questions, do not wait for any member, do not spawn extra agents. '
    + 'STEP 1: call agent_teams_create with exactly these arguments '
    + '{"name":"' + TEAM + '","description":"t11 HTTP acceptance team","approval":"automatic","plan":'
    + '{"members":['
    + '{"name":"' + MEMBER + '","role":"long task runner","provider":"' + LIVE.provider + '","model":"' + LIVE.model + '"},'
    + '{"name":"' + IDLE + '","role":"idle observer","provider":"' + LIVE.provider + '","model":"' + LIVE.model + '"}],'
    + '"tasks":[{"id":"L1","subject":"long multi-step task","description":' + JSON.stringify(longish) + ',"assignee":"' + MEMBER + '"}]}}. '
    + 'STEP 2: call agent_teams_status with {} and keep the ' + MEMBER + ' line from the answer. '
    + 'STEP 3: call agent_teams_set_member_route with exactly these arguments '
    + '{"member_name":"' + MEMBER + '","provider":"' + SWITCH.provider + '","model":"' + SWITCH.model + '","reasoning_effort":"' + SWITCH.effort + '"}. '
    + 'Do this immediately, even if ' + MEMBER + ' is still running: that is the whole point of this test. '
    + 'STEP 4: call agent_teams_status with {} again. '
    + 'Then reply with one single line in the form: T11DONE applied=<applied value from step 3> now=<member provider/model from step 4>';

// ---------------------------------------------------------------- phase A
async function phaseRun(runDir) {
    const meta = { startedAt: new Date().toISOString(), profile: PROFILE, cli: CLI, workspace: join(runDir, 'workspace'), liveRoute: LIVE, switchRoute: SWITCH, team: TEAM };
    await mkdir(meta.workspace, { recursive: true });
    console.log('profile   : ' + PROFILE + ' (' + CLI + ')');
    console.log('workspace : ' + meta.workspace);

    console.log('\n=== PHASE A: real headless captain session (tool path on the live member) ===');
    const session = runSession(promptOne, meta.workspace);
    await saveText(runDir, 'session.stdout.txt', session.stdout);
    await saveText(runDir, 'session.stderr.txt', session.stderr);
    await saveJson(runDir, 'session.meta.json', { command: session.command, status: session.status, error: session.error, elapsedMs: session.elapsedMs });
    console.log('session: exit=' + session.status + ' elapsed=' + Math.round(session.elapsedMs / 1000) + 's stdout=' + session.stdout.length + 'B stderr=' + session.stderr.length + 'B');
    const exchange = toolExchange(session.stdout);
    meta.captainSessionId = exchange.sessionId;
    console.log('captain session id: ' + meta.captainSessionId);
    console.log('tools used        : ' + [...new Set(exchange.list.map((e) => e.tool))].join(', '));
    console.log('final answer      : ' + exchange.final.split('\n').slice(-1)[0]);

    const teamFileA = await readTeamFile(meta.workspace, TEAM);
    if (teamFileA.team === undefined) throw new Error('no team.json was written under the workspace; session failed');
    meta.teamId = teamFileA.team.id;
    meta.teamPath = teamFileA.path;
    meta.stateRoot = join(meta.workspace, '.agent-teams');
    await saveJson(runDir, 'teamA.json', teamFileA.team);
    await saveJson(runDir, 'meta.json', meta);
    console.log('team.json         : ' + teamFileA.path);

    // The tool-path live consequence: notice + the next request header in the
    // member's transcript. Saved so --analyze can re-verdict without a session.
    const memberA = teamFileA.team.members.find((m) => m.name === MEMBER);
    const transcriptPath = memberA === undefined || !memberA.id ? undefined : await findTranscript(memberA.id);
    let transcript = { path: transcriptPath, found: false, notice: undefined, beforeHeader: undefined, afterHeader: undefined, frames: 0 };
    if (transcriptPath !== undefined) {
        const parsed = await readTranscriptEvents(transcriptPath);
        const lines = parsed.text.split('\n').filter((line) => line.trim().startsWith('{'));
        transcript.frames = parsed.frames;
        transcript.eventLines = lines.length;
        const noticeIndex = lines.findIndex((line) => line.includes('model changed:'));
        if (noticeIndex >= 0) {
            transcript.found = true;
            transcript.notice = lines[noticeIndex].slice(0, 600);
            for (let i = noticeIndex - 1; i >= 0; i -= 1) {
                if (lines[i].includes(LIVE.model)) { transcript.beforeHeader = lines[i].slice(0, 600); break; }
            }
            for (let i = noticeIndex + 1; i < lines.length; i += 1) {
                if (lines[i].includes(SWITCH.model)) { transcript.afterHeader = lines[i].slice(0, 600); break; }
            }
        }
    }
    await saveJson(runDir, 'transcript.json', transcript);
    console.log('transcript        : ' + (transcriptPath ?? '(not found)') + ' frames=' + transcript.frames + ' notice=' + (transcript.found ? 'FOUND' : 'MISSING'));

    const auditPath = join(meta.workspace, 'docs', 'log', 'MODEL-SWITCH.md');
    await saveText(runDir, 'audit-before.txt', await readIfExists(auditPath, ''));

    console.log('\n=== PHASE B1: real HTTP /plan against that real team ===');
    const server1 = await mountAndServe(meta.workspace, meta.captainSessionId);
    await saveJson(runDir, 'mount1.json', { port: server1.port, routes: server1.routes, hasSetMemberRouteTool: server1.tools.includes('agent_teams_set_member_route') });
    console.log('mounted routes: ' + server1.routes.join(', ') + ' | http://127.0.0.1:' + server1.port + PLAN_PATH);
    try {
        const routeA = await postPlan(server1.port, { sessionId: meta.captainSessionId, action: 'set_member_route', teamId: meta.teamId, memberName: MEMBER, provider: LIVE.provider, model: LIVE.model, reasoningEffort: LIVE.effort });
        await saveJson(runDir, 'plan-set-route-a.json', routeA);
        const routeB = await postPlan(server1.port, { sessionId: meta.captainSessionId, action: 'set_member_route', teamId: meta.teamId, memberName: IDLE, provider: LIVE.provider, model: LIVE.model, reasoningEffort: LIVE.effort });
        await saveJson(runDir, 'plan-set-route-b.json', routeB);

        const teamFileB = await readTeamFile(meta.workspace, TEAM);
        await saveJson(runDir, 'teamB.json', teamFileB.team);
        await saveText(runDir, 'audit-after.txt', await readIfExists(auditPath, ''));

        const added = await postPlan(server1.port, { sessionId: meta.captainSessionId, action: 'add_member', teamId: meta.teamId, memberName: NEWBIE, role: 'http added', provider: LIVE.provider, model: LIVE.model, reasoningEffort: LIVE.effort });
        await saveJson(runDir, 'plan-add-member.json', added);
        await saveJson(runDir, 'teamC.json', (await readTeamFile(meta.workspace, TEAM)).team);
        const duplicate = await postPlan(server1.port, { sessionId: meta.captainSessionId, action: 'add_member', teamId: meta.teamId, memberName: NEWBIE, role: 'http added again', provider: LIVE.provider, model: LIVE.model });
        await saveJson(runDir, 'plan-add-duplicate.json', duplicate);
    } finally {
        await server1.close();
    }

    console.log('\n=== PHASE B2: manual cap over the same HTTP route (maxManualMembers 3) ===');
    const server2 = await mountAndServe(meta.workspace, meta.captainSessionId, { maxMembers: 2, maxManualMembers: 3 });
    try {
        const overCap = await postPlan(server2.port, { sessionId: meta.captainSessionId, action: 'add_member', teamId: meta.teamId, memberName: OVER_CAP, role: 'over cap', provider: LIVE.provider, model: LIVE.model });
        await saveJson(runDir, 'plan-add-over-cap.json', overCap);
    } finally {
        await server2.close();
    }

    console.log('\n=== PHASE C: second COLD process reads the state back ===');
    const cold = coldRouteRead(meta.stateRoot, meta.teamId);
    await saveJson(runDir, 'cold.json', cold);
    console.log(JSON.stringify(cold).slice(0, 800));
    return runDir;
}

// ---------------------------------------------------------------- verdicts
const results = [];
function check(id, ok, detail, evidence) {
    results.push({ id, ok: ok === true, detail, evidence });
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' — ' + detail);
    if (evidence !== undefined) console.log('     evidence: ' + String(evidence).replace(/\n/g, ' | ').slice(0, 900));
}

async function analyse(runDir) {
    results.length = 0;
    const meta = await readJsonIf(join(runDir, 'meta.json'));
    if (meta === undefined) throw new Error('no meta.json in ' + runDir + ': not a t11 run dir');
    const out = await readIfExists(join(runDir, 'session.stdout.txt'), '');
    const teamA = await readJsonIf(join(runDir, 'teamA.json'));
    const teamB = await readJsonIf(join(runDir, 'teamB.json'));
    const teamC = await readJsonIf(join(runDir, 'teamC.json'));
    const transcript = await readJsonIf(join(runDir, 'transcript.json'));
    const auditBefore = await readIfExists(join(runDir, 'audit-before.txt'), '');
    const auditAfter = await readIfExists(join(runDir, 'audit-after.txt'), '');
    const routeA = await readJsonIf(join(runDir, 'plan-set-route-a.json'));
    const routeB = await readJsonIf(join(runDir, 'plan-set-route-b.json'));
    const added = await readJsonIf(join(runDir, 'plan-add-member.json'));
    const duplicate = await readJsonIf(join(runDir, 'plan-add-duplicate.json'));
    const overCap = await readJsonIf(join(runDir, 'plan-add-over-cap.json'));
    const cold = await readJsonIf(join(runDir, 'cold.json'));
    const exchange = toolExchange(out);

    // C1 — a REAL session built the team, roster keeps the declared route.
    const create = exchange.first('agent_teams_create');
    const planned = create?.input?.plan?.members ?? [];
    const memberA = teamA?.members?.find((m) => m.name === MEMBER);
    const memberB = teamA?.members?.find((m) => m.name === IDLE);
    check('C1', planned.length >= 2
        && planned.every((m) => m.provider === LIVE.provider && m.model === LIVE.model)
        && memberA !== undefined && memberA.provider === LIVE.provider && memberA.model === LIVE.model
        && memberB !== undefined && memberB.provider === LIVE.provider && memberB.model === LIVE.model,
        'real captain session in profile ' + meta.profile + ' created team ' + (teamA?.name ?? '?') + ' whose roster keeps the declared initial route ' + routeLabel(LIVE),
        'create.input.plan.members=' + JSON.stringify(planned.map((m) => m.name + '=' + m.provider + '/' + m.model))
        + ' team.json head: ' + (await readIfExists(join(runDir, 'teamA.json'), '')).slice(0, 220));

    // X1 — the tool path switched a RUNNING member live (this is what makes C5 possible).
    const routeCall = exchange.first('agent_teams_set_member_route');
    const routeText = String(routeCall?.result ?? '');
    check('X1', routeCall !== undefined && routeText.includes('applied to the live session and saved'),
        'tool path: agent_teams_set_member_route applied to the LIVE child session (applied=live-and-durable)',
        'input=' + JSON.stringify(routeCall?.input ?? null) + ' result=' + routeText.split('\n')[0]);

    // C2 — the panel's own HTTP action returned 200 with a real body.
    const okA = routeA?.status === 200 && routeA?.json?.ok === true
        && routeA.json.provider === LIVE.provider && routeA.json.model === LIVE.model;
    const okB = routeB?.status === 200 && routeB?.json?.ok === true
        && routeB.json.provider === LIVE.provider && routeB.json.model === LIVE.model;
    check('C2', okA && okB,
        'POST ' + PLAN_PATH + ' {action:set_member_route} returned HTTP 200 for both members of the real team',
        'A: HTTP ' + routeA?.status + ' ' + routeA?.text + ' || B: HTTP ' + routeB?.status + ' ' + routeB?.text);

    // C3 — the durable record carries the new override.
    const overrideA = teamB?.members?.find((m) => m.name === MEMBER)?.routeOverride;
    const overrideB = teamB?.members?.find((m) => m.name === IDLE)?.routeOverride;
    check('C3', overrideA?.provider === LIVE.provider && overrideA?.model === LIVE.model
        && typeof overrideA?.by === 'string' && overrideA.by.startsWith('web:')
        && overrideA?.source === 'http'
        && overrideB?.provider === LIVE.provider && overrideB?.model === LIVE.model,
        'team.json after the HTTP call carries a new routeOverride (provider/model/effort/by/source) for both members',
        'worker-a=' + JSON.stringify(overrideA) + ' worker-b=' + JSON.stringify(overrideB));

    // C4 — the machine audit log gained one row per switch.
    const beforeSet = new Set(auditBefore.split(/\r?\n/).filter((line) => line.trim() !== ''));
    const addedRows = auditAfter.split(/\r?\n/).filter((line) => line.trim() !== '' && beforeSet.has(line) === false);
    check('C4', addedRows.length === 2
        && addedRows.some((row) => row.includes(MEMBER) && row.includes(LIVE.model))
        && addedRows.some((row) => row.includes(IDLE) && row.includes(LIVE.model)),
        'docs/log/MODEL-SWITCH.md gained exactly one audit row per HTTP switch (appendRouteChangeAudit)',
        'new rows: ' + JSON.stringify(addedRows));

    // C5 — the member noticed the change and its NEXT request used the new model.
    check('C5', transcript?.found === true
        && typeof transcript.afterHeader === 'string' && transcript.afterHeader.includes(SWITCH.model),
        'member transcript holds the host notice [model changed: ...] and the next request/header uses ' + SWITCH.provider + '/' + SWITCH.model,
        'notice=' + transcript?.notice + ' || header before switch=' + transcript?.beforeHeader + ' || header after notice=' + transcript?.afterHeader);

    // C6 — the open attempt survived the HTTP switch.
    const tasksA = JSON.stringify(teamA?.tasks ?? []);
    const tasksB = JSON.stringify(teamB?.tasks ?? []);
    const idA = memberA?.id;
    const idB = teamB?.members?.find((m) => m.name === MEMBER)?.id;
    const attemptOf = (team) => (team?.tasks ?? []).map((t) => t.id + ':' + (t.attempt ?? '-') + ':' + (t.attemptId ?? '-')).join(',');
    check('C6', tasksA === tasksB && typeof idA === 'string' && idA !== '' && idA === idB,
        'the member open attempt and child session id are unchanged across the HTTP route change',
        'member.id before/after=' + idA + '/' + idB + ' tasks before=' + attemptOf(teamA) + ' after=' + attemptOf(teamB));

    // C7 — add_member over HTTP: 200 + roster row, duplicate 409, cap 409.
    const newbie = teamC?.members?.find((m) => m.name === NEWBIE);
    check('C7a', added?.status === 200 && added?.json?.ok === true && newbie !== undefined,
        'POST {action:add_member} returned HTTP 200 and the roster gained the member',
        'HTTP ' + added?.status + ' ' + added?.text + ' || roster=' + JSON.stringify((teamC?.members ?? []).map((m) => m.name))
        + ' || spawned=' + String(added?.json?.spawned) + ' spawnError=' + JSON.stringify(added?.json?.spawnError ?? added?.json?.error ?? null));
    check('C7b', duplicate?.status === 409 && /already/i.test(String(duplicate?.text ?? '')),
        'the same member name twice returns HTTP 409 with a verbatim message',
        'HTTP ' + duplicate?.status + ' ' + duplicate?.text);
    check('C7c', overCap?.status === 409 && /cap/i.test(String(overCap?.text ?? '')),
        'crossing maxManualMembers (3 over a 3-member roster) returns HTTP 409 with a verbatim message',
        'HTTP ' + overCap?.status + ' ' + overCap?.text);

    // C8 — a second cold process reads route and roster back.
    const coldMembers = cold?.team?.members ?? [];
    const coldA = coldMembers.find((m) => m.name === MEMBER);
    check('C8', cold?.team !== null && coldMembers.length === (teamC?.members?.length ?? -1)
        && coldA?.routeOverride?.provider === LIVE.provider && coldA?.routeOverride?.model === LIVE.model,
        'a second COLD node process importing the plugin own lib/state.js reads back the same roster and the new route',
        'cold members=' + JSON.stringify(coldMembers.map((m) => m.name + '=' + (m.routeOverride ? m.routeOverride.provider + '/' + m.routeOverride.model : m.provider + '/' + m.model)))
        + ' || written roster=' + JSON.stringify((teamC?.members ?? []).map((m) => m.name)));

    const failed = results.filter((entry) => entry.ok === false);
    console.log('\n--- t11 verdict table (' + runDir + ') ---');
    for (const entry of results) console.log((entry.ok ? 'PASS' : 'FAIL') + '  ' + entry.id + '  ' + entry.detail.slice(0, 110));
    console.log(failed.length === 0
        ? '\nPASS — proved C1..C8 (' + results.length + ' checks, 0 failed)'
        : '\nFAIL — ' + failed.length + ' of ' + results.length + ' checks failed: ' + failed.map((entry) => entry.id).join(', '));
    return failed.length === 0;
}

// ---------------------------------------------------------------- main
async function main() {
    if (analyzeDir !== undefined) {
        const ok = await analyse(analyzeDir);
        process.exit(ok ? 0 : 1);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const runDir = join(repoRoot, 'tests', 'tmp', 'e2e-t11http', stamp);
    await mkdir(runDir, { recursive: true });
    console.log('run dir   : ' + runDir);
    await phaseRun(runDir);
    const ok = await analyse(runDir);
    console.log('artifacts : ' + runDir + ' (re-verdict with: node tests/t11-http-e2e.mjs --analyze <dir>)');
    process.exit(ok ? 0 : 1);
}

await main();
