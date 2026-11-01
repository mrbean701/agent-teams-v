#!/usr/bin/env node
/**
 * t46 — /plan set_member_fallback + clear_member_fallback over a REAL socket.
 *
 *   node tests/t46-plan-fallback-http.mjs
 *
 * The panel writes the per-member fallback route through two dedicated
 * actions; this suite mounts the real plugin (lib/index.js apply) on a real
 * http.Server and drives it with real fetch calls:
 *
 *   200 set (fallback.provider/model in snake_case), overwrite, clear
 *   409 missing half / mixed set+clear / unknown member / stopping member
 *   404 unknown team, 405 method fence with an empty body
 *   the workspace audit log gains a (fallback ...) row
 *   team.json gains member.fallback while the declared spine is untouched
 *   401 from the Connection gate, and the durable record survives it
 *
 * Self-locating: the plugin is resolved from this file's own URL, the
 * workspace is a fresh dir under the OS temp root.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'dsh-agent-teams', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const indexMod = await import(libModule('index.js'));

const PLAN_PATH = '/plugins/dsh-agent-teams/plan';
const CAPTAIN = 'sess-captain';
const TEAM = 'team-t46';

function makeHarness(workspace, gateMode) {
    const warnings = [];
    const routes = new Map();
    const registered = new Map();
    const captain = {
        id: CAPTAIN,
        session: { id: CAPTAIN, header: { cwd: workspace }, append() {}, requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }) },
    };
    const webServer = { register(route) { routes.set(route.path, route); return () => {}; } };
    const registry = { list() { return [{ title: 'ws', path: workspace }]; } };
    const connection = gateMode === 'absent' ? undefined : { requestRejection() { return gateMode === 'permissive' ? undefined : gateMode; } };
    const ctx = {
        logger: { debug() {}, info() {}, warn(...parts) { warnings.push(parts.map(String).join(' ')); }, error() {} },
        tools: { register(def) { registered.set(def.name, def); } },
        agents: { get(id) { return id === CAPTAIN ? captain : undefined; }, list() { return []; } },
        subagents: {
            followup() { return Promise.resolve('msg-legacy'); },
            [Symbol.for('dsh.subagent.deliverPrompt')]() { return Promise.resolve('deliver'); },
            sendMessage() { return Promise.resolve('msg-send'); },
            startActivation() { return Promise.resolve({ childId: 'child-1', result: Promise.resolve({ text: 'ok' }) }); },
            getProvider() { return { id: 'spawn', defaultModel: 'm1' }; },
            list() { return []; },
            interrupt() {},
        },
        llm: {
            async listModels() { return [{ id: 'm1' }, { id: 'm3' }]; },
            async listProviders() { return [{ id: 'p1' }]; },
            async resolveCallConfig(config) { return config; },
        },
        on() { return () => {}; },
        inject() {},
        systemPrompt: { section() {} },
        effect(fn) { try { fn(); } catch { /* harness */ } },
        get(name) {
            if (name === 'webServer' || name === 'httpServer') return webServer;
            if (name === 'workspaceRegistry' || name === 'workspace') return registry;
            if (name === 'connection') return connection;
            return undefined;
        },
    };
    return { ctx, routes, registered, warnings };
}

function baseConfig() {
    return { stateDir: '.agent-teams', memberProvider: 'spawn', maxMembers: 8, maxManualMembers: 12, profiles: {}, toolPolicies: {}, slashCommand: false };
}

async function mountAndServe(workspace, gateMode) {
    const h = makeHarness(workspace, gateMode);
    indexMod.apply(h.ctx, baseConfig());
    const route = h.routes.get(PLAN_PATH);
    if (route === undefined) throw new Error('no ' + PLAN_PATH + ' route registered; ctx mount refused it');
    const server = createServer((req, res) => {
        void Promise.resolve().then(() => route.handler(req, res)).catch((error) => {
            try { res.writeHead(500, { 'content-type': 'text/plain' }); res.end('harness: ' + String(error)); } catch { /* sent */ }
        });
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    return { port: server.address().port, warnings: h.warnings, close: () => new Promise((done) => server.close(() => done())) };
}

const member = (name, extra = {}) => ({ id: '', name, provider: 'p1', model: 'm1', joinedAt: 1, status: 'idle', ...extra });

async function seed(workspace, members) {
    const root = join(workspace, '.agent-teams', TEAM);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'team.json'), JSON.stringify({
        id: TEAM, name: 'T46', captainSessionId: CAPTAIN, createdAt: 1, taskSeq: 0, phase: 'running', members, tasks: [],
    }, null, 2));
}

const teamOnDisk = async (workspace) => JSON.parse(await readFile(join(workspace, '.agent-teams', TEAM, 'team.json'), 'utf8'));
const teamBytes = (workspace) => readFile(join(workspace, '.agent-teams', TEAM, 'team.json'), 'utf8');

async function post(port, payload, method = 'POST') {
    const response = await fetch('http://127.0.0.1:' + port + PLAN_PATH, {
        method,
        headers: payload === undefined ? {} : { 'content-type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await response.text();
    let json;
    try { json = text === '' ? undefined : JSON.parse(text); } catch { json = undefined; }
    return { status: response.status, allow: response.headers.get('allow'), text, json };
}

const setFallback = (port, body) => post(port, { sessionId: CAPTAIN, teamId: TEAM, action: 'set_member_fallback', ...body });
const clearFallback = (port, body) => post(port, { sessionId: CAPTAIN, teamId: TEAM, action: 'clear_member_fallback', ...body });

const results = [];
let failures = 0;
function check(id, claim, ok, evidence) {
    if (!ok) failures += 1;
    results.push({ id, ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + id + ' — ' + claim);
    console.log('      ' + evidence);
}
const show = (res) => 'HTTP ' + res.status + (res.allow === null ? '' : ' allow=' + JSON.stringify(res.allow)) + ' body=' + JSON.stringify(res.text);

async function main() {
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const runDir = join(dirname(fileURLToPath(import.meta.url)), 'tmp', 'e2e-t46', stamp);
    await mkdir(runDir, { recursive: true });
    const workspace = await mkdtemp(join(tmpdir(), 't46-ws-'));
    await seed(workspace, [member('alice'), member('bob', { stopping: true }), member('carol')]);
    const A = await mountAndServe(workspace, 'permissive');
    console.log('mounted ' + PLAN_PATH + ' on http://127.0.0.1:' + A.port + ' (workspace ' + workspace + ')');

    const a1 = await setFallback(A.port, { memberName: 'alice', fallbackProvider: 'p1', fallbackModel: 'm3' });
    check('A1', 'set -> 200 with fallback.provider/model in snake_case',
        a1.status === 200 && a1.json?.ok === true
        && a1.json?.fallback?.provider === 'p1' && a1.json?.fallback?.model === 'm3'
        && a1.json?.fallback_cleared === undefined
        && a1.json?.source === 'http',
        show(a1));

    const afterA1 = await teamOnDisk(workspace);
    const alice = afterA1.members.find((m) => m.name === 'alice');
    check('A2', 'team.json records member.fallback while the declared spine is untouched',
        alice.fallback?.provider === 'p1' && alice.fallback?.model === 'm3'
        && alice.provider === 'p1' && alice.model === 'm1' && alice.routeOverride === undefined,
        'alice=' + JSON.stringify(alice));

    const a3 = await setFallback(A.port, { memberName: 'alice', fallbackProvider: 'p1', fallbackModel: 'm3', fallbackReasoningEffort: 'high' });
    const alice3 = (await teamOnDisk(workspace)).members.find((m) => m.name === 'alice');
    check('A3', 'setting it again with an effort overwrites in place and reports the effort',
        a3.status === 200 && a3.json?.fallback?.reasoning_effort === 'high'
        && alice3.fallback?.reasoningEffort === 'high' && alice3.model === 'm1',
        show(a3) + ' alice=' + JSON.stringify(alice3.fallback));

    const b1 = await setFallback(A.port, { memberName: 'carol', fallbackModel: 'm3' });
    check('B1', 'half a pair (model without provider) -> 409 and carol is not changed',
        b1.status === 409 && typeof b1.json?.error === 'string' && b1.json.error.includes('both required')
        && (await teamOnDisk(workspace)).members.find((m) => m.name === 'carol').fallback === undefined,
        show(b1));

    const b2 = await setFallback(A.port, { memberName: 'carol', fallbackProvider: 'p1', fallbackModel: 'm3', fallback_clear: true });
    check('B2', 'mixing set and clear in one request -> 409 naming clear_member_fallback',
        b2.status === 409 && typeof b2.json?.error === 'string' && b2.json.error.includes('clear_member_fallback')
        && (await teamOnDisk(workspace)).members.find((m) => m.name === 'carol').fallback === undefined,
        show(b2));

    const b3 = await setFallback(A.port, { memberName: 'ghost', fallbackProvider: 'p1', fallbackModel: 'm3' });
    check('B3', 'unknown member -> 409 naming it',
        b3.status === 409 && typeof b3.json?.error === 'string' && b3.json.error.includes('ghost'), show(b3));

    const b4 = await setFallback(A.port, { memberName: 'bob', fallbackProvider: 'p1', fallbackModel: 'm3' });
    check('B4', 'stopping member -> 409 with the stopping message',
        b4.status === 409 && typeof b4.json?.error === 'string' && b4.json.error.includes('is stopping'), show(b4));

    const b5 = await setFallback(A.port, { fallbackProvider: 'p1', fallbackModel: 'm3' });
    const b6 = await clearFallback(A.port, {});
    check('B5', 'missing memberName -> 409 on both fallback actions',
        b5.status === 409 && b5.json?.error === 'memberName is required'
        && b6.status === 409 && b6.json?.error === 'memberName is required',
        show(b5) + ' | ' + show(b6));

    const b7 = await clearFallback(A.port, { memberName: 'carol', fallbackProvider: 'p1' });
    check('B6', 'a clear that names a fallback half -> 409 ambiguous request',
        b7.status === 409 && typeof b7.json?.error === 'string' && b7.json.error.includes('takes no fallbackProvider'),
        show(b7));

    const c1 = await post(A.port, { sessionId: CAPTAIN, teamId: 'other-team', action: 'set_member_fallback', memberName: 'alice', fallbackProvider: 'p1', fallbackModel: 'm3' });
    check('C1', 'unknown team -> 404', c1.status === 404, show(c1));

    const c2 = await post(A.port, undefined, 'GET');
    check('C2', 'GET ' + PLAN_PATH + ' -> 405 with allow: POST and an empty body',
        c2.status === 405 && c2.allow === 'POST' && c2.text === '', show(c2));

    console.log('plugin warnings: ' + JSON.stringify(A.warnings));
    const auditText = await readFile(join(workspace, 'docs', 'log', 'MODEL-SWITCH.md'), 'utf8');
    const rows = auditText.split('\n').filter((line) => line.includes('(fallback'));
    const aliceRows = rows.filter((line) => line.includes('| alice |'));
    check('D1', 'the workspace audit log records a (fallback ...) row per write, with http provenance',
        rows.length === 2 && aliceRows.length === 2
        && rows.every((line) => line.includes('http:web:' + CAPTAIN))
        && rows.every((line) => line.includes('p1/m3')),
        'rows=' + JSON.stringify(rows));

    const e1 = await clearFallback(A.port, { memberName: 'alice' });
    const aliceE = (await teamOnDisk(workspace)).members.find((m) => m.name === 'alice');
    check('E1', 'clear -> 200 fallback_cleared:true and team.json loses member.fallback only',
        e1.status === 200 && e1.json?.ok === true && e1.json?.fallback_cleared === true
        && aliceE.fallback === undefined && aliceE.provider === 'p1' && aliceE.model === 'm1',
        show(e1) + ' alice=' + JSON.stringify(aliceE));

    const e2 = await clearFallback(A.port, { memberName: 'alice' });
    check('E2', 'clearing twice is not an error: 200 again',
        e2.status === 200 && e2.json?.fallback_cleared === true, show(e2));

    await A.close();

    const before401 = await teamBytes(workspace);
    const B = await mountAndServe(workspace, 401);
    const g1 = await setFallback(B.port, { memberName: 'carol', fallbackProvider: 'p1', fallbackModel: 'm3' });
    check('F1', 'Connection gate 401 answers before the handler and the durable record is untouched',
        g1.status === 401 && (await teamBytes(workspace)) === before401, show(g1));
    await B.close();

    await writeFile(join(runDir, 'team-after.json'), await teamBytes(workspace));
    await writeFile(join(runDir, 'responses.json'), JSON.stringify({ a1, a3, b1, b2, b3, b4, b5, b6, b7, c1, c2, e1, e2, g1 }, null, 2));
    await rm(workspace, { recursive: true, force: true });

    console.log('');
    console.log('# ' + (results.length - failures) + '/' + results.length + ' passed, ' + failures + ' failed');
    console.log('artifacts: ' + runDir);
    process.exit(failures === 0 ? 0 : 1);
}

await main();
