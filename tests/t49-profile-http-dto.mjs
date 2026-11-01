#!/usr/bin/env node
/**
 * t49 — /plan set_member_profile + execution_prompt in the agent_teams_status DTO.
 *
 *   node tests/t49-profile-http-dto.mjs
 *
 * The profile of a member (role / execution prompt) was reachable only from the
 * captain's own tool (t43). This suite mounts the real plugin (lib/index.js apply)
 * on a real http.Server and drives it with real fetch calls, then reads the DTO the
 * captain actually gets from agent_teams_status in the same harness:
 *
 *   200 role, 200 prompt, 200 both      409 both empty / unknown member / stopping / no memberName
 *   404 unknown team, 405 method fence   401 Connection gate before the handler
 *   team.json carries role + executionPrompt and the declared spine is untouched
 *   the workspace audit log gains a row per accepted change
 *   the DTO reports execution_prompt ONLY when the member carries one
 *
 * Self-locating: the plugin is resolved from this file's own URL, the workspace is
 * a fresh dir under the OS temp root.
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
const TEAM = 'team-t49';

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
    return { ctx, routes, registered, warnings, captain };
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
    return {
        port: server.address().port,
        warnings: h.warnings,
        registered: h.registered,
        captain: h.captain,
        close: () => new Promise((done) => server.close(() => done())),
    };
}

const member = (name, extra = {}) => ({ id: 'child-' + name, name, provider: 'p1', model: 'm1', joinedAt: 1, status: 'idle', ...extra });

async function seed(workspace, members) {
    const root = join(workspace, '.agent-teams', TEAM);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'team.json'), JSON.stringify({
        id: TEAM, name: 'T49', captainSessionId: CAPTAIN, createdAt: 1, taskSeq: 0, phase: 'running', members, tasks: [],
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

const setProfile = (port, body) => post(port, { sessionId: CAPTAIN, teamId: TEAM, action: 'set_member_profile', ...body });

const results = [];
let failures = 0;
function check(id, claim, ok, evidence) {
    if (!ok) failures += 1;
    results.push({ id, ok });
    console.log((ok ? 'PASS ' : 'FAIL ') + id + ' — ' + claim);
    console.log('      ' + evidence);
}
const show = (res) => 'HTTP ' + res.status + (res.allow === null ? '' : ' allow=' + JSON.stringify(res.allow)) + ' body=' + JSON.stringify(res.text);

async function statusDto(harness) {
    const tool = harness.registered.get('agent_teams_status');
    if (tool === undefined) throw new Error('agent_teams_status was not registered');
    return tool.execute({}, { agent: harness.captain, signal: undefined });
}
const rowOf = (dto, name) => (dto.members ?? []).find((row) => row.name === name);

async function main() {
    const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const runDir = join(dirname(fileURLToPath(import.meta.url)), 'tmp', 'e2e-t49', stamp);
    await mkdir(runDir, { recursive: true });
    const workspace = await mkdtemp(join(tmpdir(), 't49-ws-'));
    await seed(workspace, [member('alice'), member('bob', { stopping: true }), member('carol')]);
    const A = await mountAndServe(workspace, 'permissive');
    console.log('mounted ' + PLAN_PATH + ' on http://127.0.0.1:' + A.port + ' (workspace ' + workspace + ')');

    const a1 = await setProfile(A.port, { memberName: 'alice', role: 'researcher' });
    const alice1 = (await teamOnDisk(workspace)).members.find((m) => m.name === 'alice');
    check('A1', '200 sets role on a member that already owns a child session',
        a1.status === 200 && a1.json?.ok === true && a1.json?.role === 'researcher'
        && a1.json?.execution_prompt === undefined && alice1.role === 'researcher'
        && alice1.provider === 'p1' && alice1.model === 'm1' && alice1.id === 'child-alice',
        show(a1) + ' alice=' + JSON.stringify({ role: alice1.role, id: alice1.id }));

    const a2 = await setProfile(A.port, { memberName: 'alice', executionPrompt: 'Export the ERP ledger and report the row count.' });
    const alice2 = (await teamOnDisk(workspace)).members.find((m) => m.name === 'alice');
    check('A2', '200 sets executionPrompt alone and keeps the role it already had',
        a2.status === 200 && a2.json?.execution_prompt === 'Export the ERP ledger and report the row count.'
        && a2.json?.role === undefined && alice2.executionPrompt === 'Export the ERP ledger and report the row count.'
        && alice2.role === 'researcher' && alice2.provider === 'p1' && alice2.model === 'm1',
        show(a2));

    const a3 = await setProfile(A.port, { memberName: 'carol', role: 'qa', executionPrompt: 'Verify the export twice.' });
    const carol = (await teamOnDisk(workspace)).members.find((m) => m.name === 'carol');
    check('A3', '200 sets both halves in one call',
        a3.status === 200 && a3.json?.role === 'qa' && a3.json?.execution_prompt === 'Verify the export twice.'
        && carol.role === 'qa' && carol.executionPrompt === 'Verify the export twice.',
        show(a3));

    const b1 = await setProfile(A.port, { memberName: 'alice' });
    check('B1', 'a call that changes nothing -> 409 instead of a silent no-op',
        b1.status === 409 && typeof b1.json?.error === 'string' && b1.json.error.includes('need'), show(b1));

    const b2 = await setProfile(A.port, { memberName: 'alice', role: '   ', executionPrompt: '' });
    check('B2', 'blank strings count as not asked -> 409',
        b2.status === 409 && typeof b2.json?.error === 'string' && b2.json.error.includes('need'), show(b2));

    const b3 = await setProfile(A.port, { memberName: 'ghost', role: 'x' });
    check('B3', 'unknown member -> 409 naming it',
        b3.status === 409 && typeof b3.json?.error === 'string' && b3.json.error.includes('ghost'), show(b3));

    const b4 = await setProfile(A.port, { memberName: 'bob', role: 'x' });
    check('B4', 'stopping member -> 409 with the stopping message',
        b4.status === 409 && typeof b4.json?.error === 'string' && b4.json.error.includes('is stopping'), show(b4));

    const b5 = await setProfile(A.port, { role: 'x' });
    check('B5', 'missing memberName -> 409',
        b5.status === 409 && b5.json?.error === 'memberName is required', show(b5));

    const b6 = await setProfile(A.port, { memberName: 'alice', role: 'x'.repeat(201) });
    const aliceB6 = (await teamOnDisk(workspace)).members.find((m) => m.name === 'alice');
    check('B6', 'a role over the 200 character cap -> 409 and alice keeps the old role',
        b6.status === 409 && typeof b6.json?.error === 'string' && b6.json.error.includes('200')
        && aliceB6.role === 'researcher', show(b6));

    const c1 = await post(A.port, { sessionId: CAPTAIN, teamId: 'other-team', action: 'set_member_profile', memberName: 'alice', role: 'x' });
    check('C1', 'unknown team -> 404', c1.status === 404, show(c1));

    const c2 = await post(A.port, undefined, 'GET');
    check('C2', 'GET ' + PLAN_PATH + ' -> 405 with allow: POST and an empty body',
        c2.status === 405 && c2.allow === 'POST' && c2.text === '', show(c2));

    const dto = await statusDto(A);
    const aliceRow = rowOf(dto, 'alice');
    const carolRow = rowOf(dto, 'carol');
    check('D1', 'the DTO reports execution_prompt for a member that carries one',
        aliceRow?.execution_prompt === 'Export the ERP ledger and report the row count.'
        && carolRow?.execution_prompt === 'Verify the export twice.', 
        'alice=' + JSON.stringify(aliceRow?.execution_prompt));

    check('D2', 'a member with no prompt reports NO execution_prompt key at all (never null)',
        aliceRow !== undefined && Object.prototype.hasOwnProperty.call(rowOf(dto, 'bob') ?? {}, 'execution_prompt') === false,
        'bob row keys=' + JSON.stringify(Object.keys(rowOf(dto, 'bob') ?? {})));

    check('D3', 'the DTO role field follows the stored profile',
        aliceRow?.role === 'researcher' && carolRow?.role === 'qa',
        'alice.role=' + JSON.stringify(aliceRow?.role) + ' carol.role=' + JSON.stringify(carolRow?.role));

    console.log('plugin warnings: ' + JSON.stringify(A.warnings));
    const auditPath = join(workspace, 'docs', 'log', 'MEMBER-PROFILE.md');
    const auditText = await readFile(auditPath, 'utf8');
    const rows = auditText.split('\n').filter((line) => line.includes('http:web:' + CAPTAIN));
    check('E1', 'every accepted change appends one MEMBER-PROFILE.md row with http provenance',
        rows.length === 3 && rows.some((line) => line.includes('alice')) && rows.some((line) => line.includes('carol')),
        'rows=' + JSON.stringify(rows));

    await A.close();

    const before401 = await teamBytes(workspace);
    const B = await mountAndServe(workspace, 401);
    const f1 = await setProfile(B.port, { memberName: 'carol', role: 'x' });
    check('F1', 'Connection gate 401 answers before the handler and the durable record is untouched',
        f1.status === 401 && (await teamBytes(workspace)) === before401, show(f1));
    await B.close();

    await writeFile(join(runDir, 'team-after.json'), await teamBytes(workspace));
    await writeFile(join(runDir, 'responses.json'), JSON.stringify({ a1, a2, a3, b1, b2, b3, b4, b5, b6, c1, c2, f1 }, null, 2));
    await rm(workspace, { recursive: true, force: true });

    console.log('');
    console.log('# ' + (results.length - failures) + '/' + results.length + ' passed, ' + failures + ' failed');
    console.log('artifacts: ' + runDir);
    process.exit(failures === 0 ? 0 : 1);
}

await main();
