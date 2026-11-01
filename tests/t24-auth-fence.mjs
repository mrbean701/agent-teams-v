#!/usr/bin/env node
/**
 * t24 — authentication fence + 405/413 on the panel's plan endpoint.
 *
 *   node tests/t24-auth-fence.mjs
 *
 * Audit round 2 finding F3 said the auth fence of
 * `POST /plugins/dsh-agent-teams/plan` was never exercised: t11 stubbed the
 * Connection gate (tests/t11-http-e2e.mjs:272 returns undefined) so only the
 * honest path was measured. This file mounts the REAL plugin (lib/index.js
 * apply) with a fake ctx and drives the REAL registered handler through a REAL
 * node http.Server over a real socket, asserting verbatim status + headers +
 * body for the three unproven paths:
 *
 *   1. method fence        -> 405 (lib/index.js:275-279)
 *   2. body size fence      -> 413 (lib/web-routes.js:9,36-37 via lib/index.js:284-288)
 *   3. connection gate      -> 401 / 403 / 503 (lib/web-routes.js:62-83)
 *
 * The fence is installed by authenticatedWebRoutes (lib/index.js:186), so it
 * wraps every /plugins/dsh-agent-teams/* route; the /state route is checked too.
 *
 * Self-locating: the plugin comes from this file's own URL, the workspace is a
 * fresh dir under tests/tmp. No absolute path is baked in.
 */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const LIB = join(repoRoot, 'packages', 'dsh-agent-teams', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;

const PLAN_PATH = '/plugins/dsh-agent-teams/plan';
const STATE_PATH = '/plugins/dsh-agent-teams/state';
const CAPTAIN = 'session-t24-captain';
const BODY_CAP = 1_000_000; // lib/web-routes.js:9 default maxBytes

// ------------------------------------------------------------------ harness
/**
 * Mount the real plugin. `gateMode` decides what the Connection service
 * reports: 'permissive' (t11's stub), 401, 403, or 'absent' (no Connection
 * service bound at all, the assembly-failure branch).
 */
function makeHarness(workspace, gateMode) {
    const registered = new Map();
    const routes = new Map();
    const gateCalls = [];
    const captain = {
        id: CAPTAIN,
        session: {
            id: CAPTAIN,
            header: { cwd: workspace },
            append() {},
            requestHeader: () => ({ config: { provider: 'command-code-goat', model: 'deepseek/deepseek-v4.1-flash' } }),
        },
    };
    const webServer = { register(route) { routes.set(route.path, route); return () => {}; } };
    const registry = { list() { return [{ title: 'ws', path: workspace }]; } };
    const connection = gateMode === 'absent'
        ? undefined
        : {
            requestRejection(req) {
                gateCalls.push({ method: req.method, url: req.url });
                return gateMode === 'permissive' ? undefined : gateMode;
            },
        };
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        tools: { register(def) { registered.set(def.name, def); } },
        agents: { get(id) { return id === CAPTAIN ? captain : undefined; }, list() { return []; } },
        subagents: {
            followup() { return Promise.resolve('msg-legacy'); },
            [Symbol.for('dsh.subagent.deliverPrompt')]() { return Promise.resolve('deliver'); },
            sendMessage() { return Promise.resolve('msg-send'); },
            startActivation() { return Promise.reject(new Error('t24 harness: no agent runtime in this HTTP-only process')); },
            getProvider() { return { id: 'spawn', defaultModel: 'deepseek/deepseek-v4.1-flash' }; },
            list() { return []; },
            interrupt() {},
        },
        llm: {
            async listModels() { return [{ id: 'deepseek/deepseek-v4.1-flash', model: 'deepseek/deepseek-v4.1-flash', provider: 'command-code-goat' }]; },
            async listProviders() { return [{ id: 'command-code-goat', name: 'command-code-goat', models: [{ id: 'deepseek/deepseek-v4.1-flash', model: 'deepseek/deepseek-v4.1-flash' }] }]; },
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
    return { ctx, routes, registered, gateCalls };
}

function buildConfig() {
    return {
        stateDir: '.agent-teams',
        memberProvider: 'spawn',
        maxMembers: 8,
        maxManualMembers: 12,
        profiles: {},
        toolPolicies: {},
        slashCommand: false,
    };
}

/** Mount the real plugin and serve its real registered handler on a real socket. */
async function mountAndServe(workspace, gateMode) {
    const indexMod = await import(libModule('index.js'));
    const h = makeHarness(workspace, gateMode);
    indexMod.apply(h.ctx, buildConfig());
    const route = h.routes.get(PLAN_PATH);
    if (route === undefined) throw new Error('no ' + PLAN_PATH + ' route registered; ctx mount refused it');
    const server = createServer((req, res) => {
        void Promise.resolve()
            .then(() => route.handler(req, res))
            .catch((error) => { try { res.writeHead(500, { 'content-type': 'text/plain' }); res.end('harness: ' + String(error)); } catch { /* sent */ } });
    });
    await new Promise((done) => server.listen(0, '127.0.0.1', done));
    return {
        port: server.address().port,
        routes: [...h.routes.keys()],
        tools: [...h.registered.keys()],
        gateCalls: h.gateCalls,
        gateMode,
        close: () => new Promise((done) => server.close(() => done())),
    };
}

/** One real HTTP round trip over a real TCP socket; records the raw response. */
function call(port, { method = 'POST', path = PLAN_PATH, headers = {}, body }) {
    const payload = body === undefined ? undefined : Buffer.from(body, 'utf8');
    return new Promise((done) => {
        const req = httpRequest({
            host: '127.0.0.1',
            port,
            method,
            path,
            headers: {
                ...payload === undefined ? {} : { 'content-length': String(payload.length), 'content-type': 'application/json' },
                ...headers,
            },
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => done({
                method, path,
                status: res.statusCode,
                headers: res.headers,
                text: Buffer.concat(chunks).toString('utf8'),
                error: undefined,
            }));
        });
        req.on('error', (error) => done({ method, path, status: 0, headers: {}, text: '', error: String(error) }));
        if (payload !== undefined) {
            // Stream in 64 KiB slices so an over-cap body really crosses the cap.
            let offset = 0;
            const pump = () => {
                while (offset < payload.length) {
                    const slice = payload.subarray(offset, Math.min(offset + 65_536, payload.length));
                    offset += slice.length;
                    if (!req.write(slice)) { req.once('drain', pump); return; }
                }
                req.end();
            };
            pump();
        } else {
            req.end();
        }
    });
}

// ------------------------------------------------------------------ checks
const results = [];
function check(id, claim, ok, evidence) {
    results.push({ id, claim, status: ok ? 'PASS' : 'FAIL', evidence });
    console.log((ok ? 'PASS ' : 'FAIL ') + id + ' — ' + claim);
    console.log('      ' + evidence);
}
function jsonOf(res) {
    try { return JSON.parse(res.text); } catch { return undefined; }
}
function show(res) {
    const allow = res.headers.allow === undefined ? '' : ' allow=' + JSON.stringify(res.headers.allow);
    const ctype = res.headers['content-type'] === undefined ? '' : ' type=' + JSON.stringify(res.headers['content-type']);
    return 'HTTP ' + res.status + allow + ctype + ' body=' + JSON.stringify(res.text);
}

async function main() {
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const runDir = join(here, 'tmp', 'e2e-t24auth', stamp);
    await mkdir(runDir, { recursive: true });
    const workspace = await mkdtemp(join(tmpdir(), 't24-ws-'));
    const cases = [];

    // ---- server A: permissive gate (the honest path t11 measured), fence still installed
    const A = await mountAndServe(workspace, 'permissive');
    console.log('mounted routes: ' + A.routes.join(', ') + ' | http://127.0.0.1:' + A.port);
    // Every request below must consult the gate exactly once; counted, not guessed.
    let aRequests = 0;

    const a1 = await call(A.port, { method: 'GET' });
    aRequests += 1;
    cases.push({ server: 'permissive', ...a1 });
    check('C1', 'GET ' + PLAN_PATH + ' -> 405 (method fence)',
        a1.status === 405 && a1.headers.allow === 'POST' && a1.text === '',
        show(a1) + ' (verbatim: allow header present, body empty)');

    const a1b = await call(A.port, { method: 'DELETE' });
    aRequests += 1;
    cases.push({ server: 'permissive', ...a1b });
    check('C1b', 'DELETE ' + PLAN_PATH + ' -> 405 (same fence, not only GET)',
        a1b.status === 405 && a1b.headers.allow === 'POST',
        show(a1b));

    // exactly one byte over the 1 MB cap: the body is streamed, so the cap is hit mid-flight
    const over = JSON.stringify({ sessionId: CAPTAIN, teamId: 'x', action: 'add_member', memberName: 'y', pad: 'a'.repeat(BODY_CAP) });
    const a2 = await call(A.port, { body: over });
    aRequests += 1;
    cases.push({ server: 'permissive', bytes: Buffer.byteLength(over), ...a2 });
    check('C2', 'POST body of ' + Buffer.byteLength(over) + ' B (> ' + BODY_CAP + ') -> 413 with a JSON error body',
        a2.status === 413 && jsonOf(a2)?.error === 'request body is too large',
        show(a2) + ' body_error=' + JSON.stringify(jsonOf(a2)?.error));

    // under the cap: the body IS read and parsed, so the 413 boundary is the cap and not something smaller
    const under = JSON.stringify({ sessionId: '', teamId: '', action: '', pad: 'a'.repeat(900_000) });
    const a2b = await call(A.port, { body: under });
    aRequests += 1;
    cases.push({ server: 'permissive', bytes: Buffer.byteLength(under), ...a2b });
    check('C2b', 'POST body of ' + Buffer.byteLength(under) + ' B (under the cap) is read, not capped -> 400 field error',
        a2b.status === 400 && jsonOf(a2b)?.error === 'sessionId, teamId, and action are required',
        show(a2b));

    // the fence is not blanket-blocking: a fenced-through request reaches the handler body
    const a3 = await call(A.port, { body: JSON.stringify({ sessionId: 'session-not-attached', teamId: 'x', action: 'add_member', memberName: 'y' }) });
    aRequests += 1;
    cases.push({ server: 'permissive', ...a3 });
    check('C3', 'permissive gate + unknown session -> 409, i.e. the request passed the fence into the handler',
        a3.status === 409 && jsonOf(a3)?.error === 'captain session is not attached',
        show(a3));

    check('C4', 'permissive gate was consulted exactly once per request (' + A.gateCalls.length + '/' + aRequests + ') — the fence really wraps the handler',
        A.gateCalls.length === aRequests,
        'gate calls: ' + JSON.stringify(A.gateCalls.map((g) => g.method)) + ' for ' + aRequests + ' requests');
    await A.close();

    // ---- server B: Connection rejects with 401
    const B = await mountAndServe(workspace, 401);
    const b1 = await call(B.port, { body: JSON.stringify({ sessionId: CAPTAIN, teamId: 'x', action: 'add_member', memberName: 'y' }) });
    cases.push({ server: '401', ...b1 });
    check('C5', 'gate rejection 401 -> status 401 + {"error":"unauthorized"} (lib/web-routes.js:77-78)',
        b1.status === 401 && jsonOf(b1)?.error === 'unauthorized' && b1.headers['content-type'] === 'application/json; charset=utf-8',
        show(b1));

    const b2 = await call(B.port, { method: 'GET' });
    cases.push({ server: '401', ...b2 });
    check('C6', 'fence runs BEFORE the method check: rejected GET is 401, not 405',
        b2.status === 401 && jsonOf(b2)?.error === 'unauthorized',
        show(b2));

    const b3 = await call(B.port, { path: STATE_PATH, method: 'GET' });
    cases.push({ server: '401', ...b3 });
    check('C7', 'the read-only /state route is behind the same fence -> 401',
        b3.status === 401 && jsonOf(b3)?.error === 'unauthorized',
        show(b3));

    check('C8', 'gate was consulted for all 3 rejected requests (' + B.gateCalls.length + ')',
        B.gateCalls.length === 3,
        'gate calls: ' + JSON.stringify(B.gateCalls.map((g) => g.method + ' ' + g.url)));
    await B.close();

    // ---- server C: Connection rejects with 403
    const C = await mountAndServe(workspace, 403);
    const c1 = await call(C.port, { body: JSON.stringify({ sessionId: CAPTAIN, teamId: 'x', action: 'add_member', memberName: 'y' }) });
    cases.push({ server: '403', ...c1 });
    check('C9', 'gate rejection 403 -> status 403 + {"error":"forbidden"}',
        c1.status === 403 && jsonOf(c1)?.error === 'forbidden',
        show(c1));
    await C.close();

    // ---- server D: no Connection service bound at all (assembly failure)
    const D = await mountAndServe(workspace, 'absent');
    const d1 = await call(D.port, { body: JSON.stringify({ sessionId: CAPTAIN, teamId: 'x', action: 'add_member', memberName: 'y' }) });
    cases.push({ server: 'absent', ...d1 });
    check('C10', 'unbound Connection -> 503 + {"error":"authentication unavailable"}, never an unauthenticated mutation',
        d1.status === 503 && jsonOf(d1)?.error === 'authentication unavailable',
        show(d1));
    await D.close();

    // ------------------------------------------------------------------ report
    const failed = results.filter((row) => row.status === 'FAIL');
    await writeFile(join(runDir, 'cases.json'), JSON.stringify({ runDir, workspace, bodyCap: BODY_CAP, results, cases }, null, 2), 'utf8');
    console.log('');
    console.log('TOTAL ' + results.length + ' checks, ' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
    console.log('artifacts: ' + runDir);
    if (failed.length > 0) {
        console.log('FAILED: ' + failed.map((row) => row.id).join(', '));
        process.exitCode = 1;
    }
}

await main();
