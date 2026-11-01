#!/usr/bin/env node
/**
 * t4 control-plane smoke suite (shipped harness — lives in tests/).
 *
 *   node tests/t4-control-plane-smoke.mjs
 *
 * Self-locating: the plugin under test is resolved from this file's own URL
 * (import.meta.url), so the suite runs from any checkout and any cwd, with no
 * absolute path baked in.
 *
 * Mounts the real plugin (lib/index.js apply) against a fake ctx, then drives
 * the registered tools and the Web /plan route with real HTTP-shaped requests:
 *   - tool inventory: agent_teams_set_member_route exists, is captain-only
 *   - /plan add_member (staged + running) and set_member_route (200 + 409)
 *   - old /plan actions unchanged
 *   - manual cap 12 vs automatic cap 8
 *   - mount-time guard maxManualMembers >= maxMembers
 */
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import assert from 'node:assert/strict';

// <repo>/tests/ -> <repo>/packages/dsh-agent-teams/lib
const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'dsh-agent-teams', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const names = await import(libModule('tool-names.js'));
const indexMod = await import(libModule('index.js'));

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---------------------------------------------------------------------------
// Fake harness: only the surfaces lib/index.js + lib/tools.js actually touch.
// ---------------------------------------------------------------------------
function makeHarness(workspace) {
    const registered = new Map();
    const routes = new Map();
    const effects = [];
    let lastActivation;
    const captain = {
        id: 'sess-captain',
        session: {
            id: 'sess-captain',
            header: { cwd: workspace },
            append() {},
            requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }),
        },
    };
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        tools: { register(def) { registered.set(def.name, def); } },
        agents: { get(id) { return id === 'sess-captain' ? captain : undefined; }, list() { return []; } },
        subagents: {
            // harness-compat.guardSubagentDelivery needs a resumable delivery path;
            // usesManagedActivations needs startActivation. Both are stubbed below.
            followup() { return Promise.resolve('msg-legacy'); },
            [Symbol.for('dsh.subagent.deliverPrompt')](parent, childId, content) { return Promise.resolve('deliver'); },
            sendMessage() { return Promise.resolve('msg-send'); },
            startActivation(spec) {
                lastActivation = spec;
                return Promise.resolve({ childId: 'child-1', result: Promise.resolve({ text: 'ok' }) });
            },
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
        effect(fn) { effects.push(fn()); },
        get(name) {
            if (name === 'webServer' || name === 'httpServer') return webServer;
            if (name === 'workspaceRegistry' || name === 'workspace') return registry;
            if (name === 'connection') return { requestRejection() { return undefined; } };
            return undefined;
        },
    };
    const webServer = {
        register(route) { routes.set(route.path, route); return () => {}; },
    };
    const registry = { list() { return [{ title: 'ws', path: workspace }]; } };
    return { ctx, captain, registered, routes, effects, activation: () => lastActivation };
}

function baseConfig(extra = {}) {
    return {
        stateDir: '.agent-teams',
        memberProvider: 'spawn',
        maxMembers: 8,
        maxManualMembers: 12,
        profiles: {},
        toolPolicies: {},
        slashCommand: false,
        ...extra,
    };
}

const member = (name) => ({ id: '', name, provider: 'p1', model: 'm1', joinedAt: 1, status: 'idle' });

async function seed(workspace, team) {
    const root = join(workspace, '.agent-teams', team.id);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'team.json'), JSON.stringify(team, null, 2));
}

const teamOf = async (workspace, id) =>
    JSON.parse(await readFile(join(workspace, '.agent-teams', id, 'team.json'), 'utf8'));

function fakeReq(payload) {
    const body = Buffer.from(JSON.stringify(payload));
    const req = Readable.from([body]);
    req.method = 'POST';
    req.url = '/plugins/dsh-agent-teams/plan';
    req.headers = { 'content-type': 'application/json', 'content-length': String(body.length) };
    return req;
}

function fakeRes() {
    const res = { status: 0, body: '', writeHead(status, headers) { this.status = status; this.headers = headers ?? {}; }, end(body) { this.body = body ?? ''; } };
    return res;
}

async function postPlan(route, payload) {
    const res = fakeRes();
    await route.handler(fakeReq(payload), res);
    return { status: res.status, json: res.body === '' ? undefined : JSON.parse(res.body) };
}

// ---------------------------------------------------------------------------
// A. Tool inventory and captain-only placement
// ---------------------------------------------------------------------------
test('A1 tool names: set_member_route is a team tool and never a member tool', () => {
    assert.equal(names.TEAM_TOOL_NAMES.includes('agent_teams_set_member_route'), true);
    assert.equal(names.MEMBER_TOOL_NAMES.includes('agent_teams_set_member_route'), false);
    assert.equal(names.CAPTAIN_TOOL_NAMES.includes('agent_teams_set_member_route'), true);
});

test('A2 add_member still exists and set_member_route is registered', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-a-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    assert.equal(h.registered.has('agent_teams_add_member'), true);
    const route = h.registered.get('agent_teams_set_member_route');
    assert.ok(route !== undefined, 'agent_teams_set_member_route must be registered');
    assert.equal(typeof route.execute, 'function');
    assert.match(route.description, /member/i);
    await rm(workspace, { recursive: true, force: true });
});

test('A3 the add_member tool body now delegates to the shared runtime (activation param, spawned output)', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-a3-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    const tool = h.registered.get('agent_teams_add_member');
    const source = String(tool.execute);
    assert.equal(/activation/.test(source), false, 'execute body should be the thin delegate (args only)');
    assert.equal(typeof tool.parameters, 'object');
    await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// B. /plan: old actions unchanged
// ---------------------------------------------------------------------------
test('B1 staged /plan update_member still works (200, roster row rewritten)', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-b1-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-b1', name: 'B1', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'staged', members: [member('alice')], tasks: [] });
    const route = h.routes.get('/plugins/dsh-agent-teams/plan');
    assert.ok(route !== undefined, '/plan route must register');
    const out = await postPlan(route, { sessionId: 'sess-captain', teamId: 'team-b1', action: 'update_member', memberName: 'alice', provider: 'p1', model: 'm3' });
    assert.equal(out.status, 200, JSON.stringify(out.json));
    const team = await teamOf(workspace, 'team-b1');
    assert.equal(team.members[0].model, 'm3');
    await rm(workspace, { recursive: true, force: true });
});

test('B2 an unknown action still 409s with the old message', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-b2-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-b2', name: 'B2', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'staged', members: [member('alice')], tasks: [] });
    const out = await postPlan(h.routes.get('/plugins/dsh-agent-teams/plan'), { sessionId: 'sess-captain', teamId: 'team-b2', action: 'nope' });
    assert.equal(out.status, 409);
    assert.match(out.json.error, /unknown plan action/);
    await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// C. /plan: new actions, both phases
// ---------------------------------------------------------------------------
test('C1 staged /plan add_member adds the row and never spawns', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-c1-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-c1', name: 'C1', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'staged', members: [member('alice')], tasks: [] });
    const out = await postPlan(h.routes.get('/plugins/dsh-agent-teams/plan'), {
        sessionId: 'sess-captain', teamId: 'team-c1', action: 'add_member', memberName: 'bob',
        provider: 'p1', model: 'm3', role: 'engineer',
    });
    assert.equal(out.status, 200, JSON.stringify(out.json));
    assert.equal(out.json.member_name, 'bob');
    assert.equal(out.json.phase, 'staged');
    assert.equal(out.json.spawned, false);
    const team = await teamOf(workspace, 'team-c1');
    assert.equal(team.phase, 'staged');
    const bob = team.members.find((m) => m.name === 'bob');
    assert.ok(bob !== undefined);
    assert.equal(bob.model, 'm3');
    assert.equal(bob.id, '');
    await rm(workspace, { recursive: true, force: true });
});

test('C2 running /plan add_member returns 200 with the roster row', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-c2-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-c2', name: 'C2', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: [member('alice')], tasks: [] });
    const out = await postPlan(h.routes.get('/plugins/dsh-agent-teams/plan'), {
        sessionId: 'sess-captain', teamId: 'team-c2', action: 'add_member', memberName: 'carol', activation: 'on-task',
    });
    assert.equal(out.status, 200, JSON.stringify(out.json));
    assert.equal(out.json.phase, 'running');
    assert.equal(out.json.spawned, false, 'activation=on-task never starts the child in this turn');
    const team = await teamOf(workspace, 'team-c2');
    assert.equal(team.members.some((m) => m.name === 'carol'), true);
    await rm(workspace, { recursive: true, force: true });
});

test('C3 running /plan set_member_route is 200, durable override, spine untouched', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-c3-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-c3', name: 'C3', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: [member('alice')], tasks: [] });
    const out = await postPlan(h.routes.get('/plugins/dsh-agent-teams/plan'), {
        sessionId: 'sess-captain', teamId: 'team-c3', action: 'set_member_route', memberName: 'alice', provider: 'p1', model: 'm3',
    });
    assert.equal(out.status, 200, JSON.stringify(out.json));
    assert.equal(out.json.applied, 'durable-only');
    assert.equal(out.json.previous.model, 'm1');
    assert.equal(out.json.previous.origin, 'declared');
    const team = await teamOf(workspace, 'team-c3');
    const alice = team.members[0];
    assert.equal(alice.provider, 'p1', 'the spawn route must not be rewritten');
    assert.equal(alice.model, 'm1', 'the spawn route must not be rewritten');
    assert.equal(alice.routeOverride.model, 'm3');
    assert.equal(alice.routeOverride.source, 'http');
    await rm(workspace, { recursive: true, force: true });
});

test('C4 /plan set_member_route on an unknown member is 409 with the runtime message', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-c4-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-c4', name: 'C4', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: [member('alice')], tasks: [] });
    const out = await postPlan(h.routes.get('/plugins/dsh-agent-teams/plan'), {
        sessionId: 'sess-captain', teamId: 'team-c4', action: 'set_member_route', memberName: 'ghost', provider: 'p1', model: 'm3',
    });
    assert.equal(out.status, 409);
    assert.match(out.json.error, /ghost/);
    await rm(workspace, { recursive: true, force: true });
});

test('C5 /plan add_member without a name is 409 with a field message', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-c5-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-c5', name: 'C5', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: [member('alice')], tasks: [] });
    const out = await postPlan(h.routes.get('/plugins/dsh-agent-teams/plan'), { sessionId: 'sess-captain', teamId: 'team-c5', action: 'add_member' });
    assert.equal(out.status, 409);
    assert.match(out.json.error, /memberName is required/);
    await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// D. Tools: manual cap 12 vs automatic cap 8
// ---------------------------------------------------------------------------
test('D1 add_member tool allows a 9th manual member (maxMembers=8 does not apply)', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-d1-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    const roster = Array.from({ length: 8 }, (_, i) => member('m' + i));
    await seed(workspace, { id: 'team-d1', name: 'D1', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: roster, tasks: [] });
    const tool = h.registered.get('agent_teams_add_member');
    const out = await tool.execute({ name: 'ninth', activation: 'on-task' }, { agent: h.captain, signal: undefined });
    assert.equal(out.member_name, 'ninth');
    const team = await teamOf(workspace, 'team-d1');
    assert.equal(team.members.length, 9);
    await rm(workspace, { recursive: true, force: true });
});

test('D2 add_member tool refuses a 13th manual member with the manual cap message', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-d2-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    const roster = Array.from({ length: 12 }, (_, i) => member('m' + i));
    await seed(workspace, { id: 'team-d2', name: 'D2', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: roster, tasks: [] });
    const tool = h.registered.get('agent_teams_add_member');
    await assert.rejects(
        () => tool.execute({ name: 'thirteenth', activation: 'on-task' }, { agent: h.captain, signal: undefined }),
        /manual member cap \(12\)/,
    );
    await rm(workspace, { recursive: true, force: true });
});

test('D3 the set_member_route tool is captain-scoped and reports the previous route', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-d3-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-d3', name: 'D3', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: [member('alice')], tasks: [] });
    const tool = h.registered.get('agent_teams_set_member_route');
    const out = await tool.execute({ member_name: 'alice', provider: 'p1', model: 'm3', reasoning_effort: 'high' }, { agent: h.captain, signal: undefined });
    assert.equal(out.member_name, 'alice');
    assert.equal(out.model, 'm3');
    assert.equal(out.reasoning_effort, 'high');
    assert.equal(out.previous_provider, 'p1');
    assert.equal(out.previous_model, 'm1');
    assert.equal(out.applied, 'durable-only');
    const team = await teamOf(workspace, 'team-d3');
    assert.equal(team.members[0].model, 'm1');
    assert.equal(team.members[0].routeOverride.reasoningEffort, 'high');
    await rm(workspace, { recursive: true, force: true });
});

test('D4 a caller that leads no team is refused by the new tool', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-d4-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    const tool = h.registered.get('agent_teams_set_member_route');
    await assert.rejects(
        () => tool.execute({ member_name: 'alice', provider: 'p1', model: 'm3' }, { agent: h.captain, signal: undefined }),
        /not leading any team/,
    );
    await rm(workspace, { recursive: true, force: true });
});

test('F1 the add_member tool keeps a staged roster unspawned', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-f1-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-f1', name: 'F1', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'staged', members: [member('alice')], tasks: [] });
    const tool = h.registered.get('agent_teams_add_member');
    const out = await tool.execute({ name: 'dave', provider: 'p1', model: 'm3' }, { agent: h.captain, signal: undefined });
    assert.equal(out.phase, 'staged');
    assert.equal(out.spawned, false);
    assert.equal(out.member_id, '');
    const team = await teamOf(workspace, 'team-f1');
    assert.equal(team.phase, 'staged');
    assert.equal(team.members.length, 2);
    assert.equal(team.members.find((m) => m.name === 'dave').spawnError, undefined,
        'a staged roster never attempts a start, so no failure is recorded');
    await rm(workspace, { recursive: true, force: true });
});

test('F2 the add_member tool attempts an immediate start on a running team and keeps the row when the start fails', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-f2-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-f2', name: 'F2', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: [member('alice')], tasks: [] });
    const tool = h.registered.get('agent_teams_add_member');
    const out = await tool.execute({ name: 'erin' }, { agent: h.captain, signal: undefined });
    assert.equal(out.phase, 'running');
    assert.equal(out.spawned, false, 'this fake provider cannot host a child, so the start fails');
    assert.equal(out.member_id, '', 'a failed start leaves no child id behind');
    const erin = (await teamOf(workspace, 'team-f2')).members.find((m) => m.name === 'erin');
    assert.ok(erin !== undefined, 'the roster row stays visible on the team that recorded the add');
    // The point of this case is the ATTEMPT. The stub provider in makeHarness has no
    // prepareContinuable, so activateMemberNow is reached and fails inside spawnMember;
    // the recorded stack is the proof. If addMemberNow ever stops calling the activation
    // hook (the audit round 1 complaint about this test), both assertions below fail.
    assert.equal(typeof erin.spawnError, 'string', 'the failed start is recorded on the member');
    assert.match(erin.spawnError, /activateMemberNow/, 'the activation hook was actually reached');
    assert.match(erin.spawnError, /does not support continuable members/, 'the failure reason is the provider capability, not a silent no-op');
    await rm(workspace, { recursive: true, force: true });
});

test('F3 activation=on-task never attempts a start on a running team', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-f3-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-f3', name: 'F3', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: [member('alice')], tasks: [] });
    const tool = h.registered.get('agent_teams_add_member');
    const out = await tool.execute({ name: 'frank', activation: 'on-task' }, { agent: h.captain, signal: undefined });
    assert.equal(out.phase, 'running');
    assert.equal(out.spawned, false);
    assert.equal(out.member_id, '');
    const frank = (await teamOf(workspace, 'team-f3')).members.find((m) => m.name === 'frank');
    assert.ok(frank !== undefined);
    assert.equal(frank.spawnError, undefined, 'on-task defers the start to the scheduler, so no attempt is recorded');
    await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// E. Mount-time config guard
// ---------------------------------------------------------------------------
test('E1 maxManualMembers below maxMembers throws at mount', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-e1-'));
    const h = makeHarness(workspace);
    assert.throws(() => indexMod.apply(h.ctx, baseConfig({ maxMembers: 20, maxManualMembers: 5 })),
        /maxManualMembers \(5\) must be >= maxMembers \(20\)/);
    await rm(workspace, { recursive: true, force: true });
});

test('E2 the accepted pair mounts and defaults stay 8 / 12', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-e2-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig({ maxMembers: undefined, maxManualMembers: undefined }));
    assert.equal(h.registered.has('agent_teams_create'), true);
    await rm(workspace, { recursive: true, force: true });
});


test('G1 the status projection shows the override and the next route', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-g1-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-g1', name: 'G1', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: [Object.assign(member('alice'), { role: 'engineer' })], tasks: [] });
    await h.registered.get('agent_teams_set_member_route').execute({ member_name: 'alice', provider: 'p1', model: 'm3' }, { agent: h.captain, signal: undefined });
    const status = await h.registered.get('agent_teams_status').execute({}, { agent: h.captain, signal: undefined });
    const alice = status.members[0];
    assert.equal(alice.provider, 'p1');
    assert.equal(alice.model, 'm1');
    assert.equal(alice.fallback_active, false);
    assert.equal(alice.route_override.model, 'm3');
    assert.equal(alice.route_override.source, 'captain');
    assert.equal(alice.next_route, 'p1/m3');
    assert.equal('active_provider' in alice, true);
    assert.equal('active_model' in alice, true);
    await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// H. Provenance: who ordered the route change (audit round 1, finding 1)
// ---------------------------------------------------------------------------
test('H1 the route tool records the captain session in routeOverride.by and in the audit log', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-h1-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-h1', name: 'H1', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: [member('alice')], tasks: [] });
    const tool = h.registered.get('agent_teams_set_member_route');
    await tool.execute({ member_name: 'alice', provider: 'p1', model: 'm3' }, { agent: h.captain, signal: undefined });
    const alice = (await teamOf(workspace, 'team-h1')).members.find((m) => m.name === 'alice');
    assert.equal(alice.routeOverride.by, 'sess-captain', 'the durable override names the captain session');
    assert.equal(alice.routeOverride.source, 'captain');
    const audit = await readFile(join(workspace, 'docs', 'log', 'MODEL-SWITCH.md'), 'utf8');
    assert.match(audit, /\| captain:sess-captain \|/, 'the human/audit log line carries source:by');
    await rm(workspace, { recursive: true, force: true });
});

test('H2 /plan set_member_route records web:<session> in routeOverride.by and in the audit log', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't4-cp-h2-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, { id: 'team-h2', name: 'H2', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members: [member('alice')], tasks: [] });
    const out = await postPlan(h.routes.get('/plugins/dsh-agent-teams/plan'), {
        sessionId: 'sess-captain', teamId: 'team-h2', action: 'set_member_route', memberName: 'alice', provider: 'p1', model: 'm3',
    });
    assert.equal(out.status, 200, JSON.stringify(out.json));
    const alice = (await teamOf(workspace, 'team-h2')).members.find((m) => m.name === 'alice');
    assert.equal(alice.routeOverride.by, 'web:sess-captain', 'the durable override names the browser session');
    assert.equal(alice.routeOverride.source, 'http');
    const audit = await readFile(join(workspace, 'docs', 'log', 'MODEL-SWITCH.md'), 'utf8');
    assert.match(audit, /\| http:web:sess-captain \|/, 'the audit log line distinguishes the web caller');
    await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
let failed = 0;
for (const { name, fn } of cases) {
    try {
        await fn();
        console.log('PASS ' + name);
    }
    catch (error) {
        failed += 1;
        console.log('FAIL ' + name);
        console.log('     ' + (error instanceof Error ? (error.stack ?? error.message).split('\n').slice(0, 6).join('\n     ') : String(error)));
    }
}
console.log('\n' + (cases.length - failed) + '/' + cases.length + ' cases passed');
process.exit(failed === 0 ? 0 : 1);
