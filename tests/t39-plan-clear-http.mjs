#!/usr/bin/env node
/**
 * t39 — /plan clear_member_route over a REAL socket + REAL fetch.
 *
 *   node tests/t39-plan-clear-http.mjs
 *
 * The panel's restore button posts `action: 'clear_member_route'`; this suite
 * mounts the real plugin (lib/index.js apply) on a real node http.Server and
 * drives it with real fetch calls, asserting verbatim status + snake_case body:
 *
 *   200 + cleared/previous/route on a member that carries an override
 *   200 again: clearing twice is not an error, the declared route stays
 *   409 unknown member / 409 stopping member / 409 missing memberName
 *   405 method fence and 404 unknown team are unchanged
 *   401 from the Connection gate, and the durable record survives the refusal
 *
 * Self-locating: the plugin is resolved from this file's own URL, the workspace
 * is a fresh dir under the OS temp root. No absolute path is baked in.
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
const TEAM = 'team-t39';

// ------------------------------------------------------------------ harness
/** Mount the real plugin. gateMode decides what the Connection service answers. */
function makeHarness(workspace, gateMode) {
    const registered = new Map();
    const routes = new Map();
    const captain = {
        id: CAPTAIN,
        session: { id: CAPTAIN, header: { cwd: workspace }, append() {}, requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }) },
    };
    const webServer = { register(route) { routes.set(route.path, route); return () => {}; } };
    const registry = { list() { return [{ title: 'ws', path: workspace }]; } };
    const connection = gateMode === 'absent' ? undefined : { requestRejection() { return gateMode === 'permissive' ? undefined : gateMode; } };
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
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
    return { ctx, routes, registered };
}

function baseConfig() {
    return { stateDir: '.agent-teams', memberProvider: 'spawn', maxMembers: 8, maxManualMembers: 12, profiles: {}, toolPolicies: {}, slashCommand: false };
}

/** Mount the real plugin and serve its real registered handler on a real socket. */
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
    return { port: server.address().port, close: () => new Promise((done) => server.close(() => done())) };
}

const member = (name, extra = {}) => ({ id: '', name, provider: 'p1', model: 'm1', joinedAt: 1, status: 'idle', ...extra });

async function seed(workspace, members) {
    const root = join(workspace, '.agent-teams', TEAM);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'team.json'), JSON.stringify({
        id: TEAM, name: 'T39', captainSessionId: CAPTAIN, createdAt: 1, taskSeq: 0, phase: 'running', members, tasks: [],
    }, null, 2));
}

const teamOnDisk = async (workspace) => JSON.parse(await readFile(join(workspace, '.agent-teams', TEAM, 'team.json'), 'utf8'));

/** One real HTTP round trip through global fetch. */
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

const clear = (port, body) => post(port, { sessionId: CAPTAIN, teamId: TEAM, action: 'clear_member_route', ...body });

// ------------------------------------------------------------------- checks
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
    const runDir = join(dirname(fileURLToPath(import.meta.url)), 'tmp', 'e2e-t39', stamp);
    await mkdir(runDir, { recursive: true });
    const workspace = await mkdtemp(join(tmpdir(), 't39-ws-'));
    await seed(workspace, [
        member('alice', { routeOverride: { provider: 'p2', model: 'm2', source: 'captain', at: 1 } }),
        member('bob', { stopping: true }),
        member('carol'),
    ]);
    const A = await mountAndServe(workspace, 'permissive');
    console.log('mounted ' + PLAN_PATH + ' on http://127.0.0.1:' + A.port + ' (workspace ' + workspace + ')');

    const a1 = await clear(A.port, { memberName: 'alice' });
    check('A1', 'clear on a member with an override -> 200, cleared/previous/route in snake_case',
        a1.status === 200
        && a1.json?.ok === true
        && a1.json?.cleared === true
        && a1.json?.previous?.provider === 'p2' && a1.json?.previous?.model === 'm2' && a1.json?.previous?.origin === 'override'
        && a1.json?.route?.provider === 'p1' && a1.json?.route?.model === 'm1'
        && a1.json?.origin === 'declared'
        && a1.json?.source === 'http'
        && a1.json?.applied === 'durable-only',
        show(a1));

    const afterA1 = await teamOnDisk(workspace);
    const alice = afterA1.members.find((m) => m.name === 'alice');
    check('A2', 'team.json lost routeOverride and kept the declared spine unchanged',
        alice.routeOverride === undefined && alice.provider === 'p1' && alice.model === 'm1',
        'alice=' + JSON.stringify(alice));

    const a3 = await clear(A.port, { memberName: 'alice' });
    check('A3', 'clearing twice is not an error: 200, previous origin is now declared, route unchanged',
        a3.status === 200 && a3.json?.cleared === true && a3.json?.previous?.origin === 'declared'
        && a3.json?.route?.provider === 'p1' && a3.json?.route?.model === 'm1',
        show(a3));

    const b1 = await clear(A.port, { memberName: 'ghost' });
    check('B1', 'unknown member -> 409 with the runtime message naming it',
        b1.status === 409 && typeof b1.json?.error === 'string' && b1.json.error.includes('ghost'), show(b1));

    const b2 = await clear(A.port, { memberName: 'bob' });
    check('B2', 'stopping member -> 409 with the stopping message',
        b2.status === 409 && typeof b2.json?.error === 'string' && b2.json.error.includes('is stopping'), show(b2));

    const b3 = await clear(A.port, {});
    check('B3', 'missing memberName -> 409 with the field message',
        b3.status === 409 && b3.json?.error === 'memberName is required', show(b3));

    const b4 = await clear(A.port, { memberName: 'carol', provider: 'p1', model: 'm3' });
    const carolOnDisk = (await teamOnDisk(workspace)).members.find((m) => m.name === 'carol');
    check('B4', 'a clear that also names a route -> 409 ambiguous request, carol is left untouched',
        b4.status === 409 && typeof b4.json?.error === 'string' && b4.json.error.includes('takes no provider')
        && carolOnDisk.routeOverride === undefined,
        show(b4) + ' carol=' + JSON.stringify(carolOnDisk));

    const c1 = await post(A.port, undefined, 'GET');
    check('C1', 'GET ' + PLAN_PATH + ' -> 405 with allow: POST and an empty body',
        c1.status === 405 && c1.allow === 'POST' && c1.text === '', show(c1));

    const c2 = await post(A.port, { sessionId: CAPTAIN, teamId: 'other-team', action: 'clear_member_route', memberName: 'alice' });
    check('C2', 'unknown team -> 404, unchanged by this task', c2.status === 404, show(c2));

    // The audit trail is a workspace file, independent of session events.
    const auditText = await readFile(join(workspace, 'docs', 'log', 'MODEL-SWITCH.md'), 'utf8');
    const rows = auditText.split('\n').filter((line) => line.includes('(cleared)'));
    const aliceRows = rows.filter((line) => line.includes('| alice |'));
    check('D1', 'the workspace audit log records one (cleared) row per successful revert, with http provenance',
        rows.length === 2
        && aliceRows.length === 2
        && rows.every((line) => line.includes('http:web:' + CAPTAIN))
        && aliceRows[0].includes('p2/m2')
        && rows.every((line) => !line.includes('| carol |')),
        'rows=' + JSON.stringify(rows));

    await A.close();

    const before401 = await readFile(join(workspace, '.agent-teams', TEAM, 'team.json'), 'utf8');
    const B = await mountAndServe(workspace, 401);
    const g1 = await clear(B.port, { memberName: 'alice' });
    check('E1', 'Connection gate 401 still answers before the handler and the durable record is untouched',
        g1.status === 401 && (await readFile(join(workspace, '.agent-teams', TEAM, 'team.json'), 'utf8')) === before401,
        show(g1));
    await B.close();

    await writeFile(join(runDir, 'team-after.json'), await readFile(join(workspace, '.agent-teams', TEAM, 'team.json'), 'utf8'));
    await writeFile(join(runDir, 'responses.json'), JSON.stringify({ a1, a3, b1, b2, b3, b4, c1, c2, g1 }, null, 2));
    await rm(workspace, { recursive: true, force: true });

    console.log('');
    console.log('# ' + (results.length - failures) + '/' + results.length + ' passed, ' + failures + ' failed');
    console.log('artifacts: ' + runDir);
    process.exit(failures === 0 ? 0 : 1);
}

await main();
