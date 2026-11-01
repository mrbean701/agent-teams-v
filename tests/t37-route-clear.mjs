#!/usr/bin/env node
/**
 * t37 route-revert suite (shipped harness — lives in tests/).
 *
 *   node tests/t37-route-clear.mjs
 *
 * Self-locating: the plugin under test is resolved from this file's own URL
 * (import.meta.url), so the suite runs from any checkout and any cwd, with no
 * absolute path baked in.
 *
 * Mounts the real plugin (lib/index.js apply) against a fake ctx, then drives
 * the registered agent_teams_set_member_route tool with clear:true and proves
 * the revert path end to end:
 *   (a) set override then clear -> routeOf is back on the declared route
 *   (b) team.json after clear carries no routeOverride / fallback fields
 *   (c) the audit log gains exactly one "(cleared)" row, with the old route
 *   (d) clear on a removed / stopping member is refused, file untouched
 *   (e) clear combined with provider / model / effort is refused
 *   (f) a legacy team.json without an override still reads and clears
 *   (g) the agent_teams_status DTO after clear carries no route_override
 * plus: a degraded (fallback) member clears back to its declared route, a
 * member with no declared route cannot be cleared, the plain set path is
 * unchanged, and the disk-before-RAM ordering holds in the source.
 */
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// <repo>/tests/ -> <repo>/packages/dsh-agent-teams/lib
const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'dsh-agent-teams', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const indexMod = await import(libModule('index.js'));
const membersMod = await import(libModule('members.js'));

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---------------------------------------------------------------------------
// Fake harness: only the surfaces lib/index.js + lib/tools.js actually touch.
// ---------------------------------------------------------------------------
function makeHarness(workspace) {
    const registered = new Map();
    const effects = [];
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
            async listProviders() { return [{ id: 'p1' }, { id: 'p2' }]; },
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
    const webServer = { register() { return () => {}; } };
    const registry = { list() { return [{ title: 'ws', path: workspace }]; } };
    return { ctx, captain, registered, effects };
}

const baseConfig = () => ({
    stateDir: '.agent-teams',
    memberProvider: 'spawn',
    maxMembers: 8,
    maxManualMembers: 12,
    profiles: {},
    toolPolicies: {},
    slashCommand: false,
});

const member = (name, extra = {}) => ({ id: '', name, provider: 'p1', model: 'm1', joinedAt: 1, status: 'idle', ...extra });
const teamFixture = (id, members) => ({ id, name: id.toUpperCase(), captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members, tasks: [] });

async function seed(workspace, team) {
    const root = join(workspace, '.agent-teams', team.id);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'team.json'), JSON.stringify(team, null, 2));
}

const teamPath = (workspace, id) => join(workspace, '.agent-teams', id, 'team.json');
const teamOf = async (workspace, id) => JSON.parse(await readFile(teamPath(workspace, id), 'utf8'));
const auditOf = (workspace) => readFile(join(workspace, 'docs', 'log', 'MODEL-SWITCH.md'), 'utf8');
const routeTool = (h) => h.registered.get('agent_teams_set_member_route');

async function withTeam(fixture, fn) {
    const workspace = await mkdtemp(join(tmpdir(), 't37-'));
    try {
        const h = makeHarness(workspace);
        indexMod.apply(h.ctx, baseConfig());
        if (fixture !== undefined) await seed(workspace, fixture);
        return await fn({ workspace, h });
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

const setRoute = (h, name, provider, model, extra = {}) =>
    routeTool(h).execute({ member_name: name, provider, model, ...extra }, { agent: h.captain, signal: undefined });
const clearRoute = (h, name, extra = {}) =>
    routeTool(h).execute({ member_name: name, clear: true, ...extra }, { agent: h.captain, signal: undefined });

// ---------------------------------------------------------------------------
// (a) set override, then clear -> routeOf is the declared route again
// ---------------------------------------------------------------------------
test('a1 clear returns routeOf to the declared provider/model and reports the old route', async () => {
    await withTeam(teamFixture('team-a1', [member('alice')]), async ({ h }) => {
        const set = await setRoute(h, 'alice', 'p1', 'm3', { reasoning_effort: 'high' });
        assert.equal(set.applied, 'durable-only');
        const out = await clearRoute(h, 'alice');
        assert.equal(out.cleared, true, 'the result says it was a clear');
        assert.equal(out.provider, 'p1', 'the result names the declared route the member is back on');
        assert.equal(out.model, 'm1');
        assert.equal(out.applied, 'durable-only', 'no live child in this harness');
        assert.equal(out.previous_provider, 'p1', 'previous is the effective route BEFORE the clear');
        assert.equal(out.previous_model, 'm3');
        assert.equal(out.reasoning_effort, undefined, 'the override effort does not travel back to the declared route');
    });
});

test('a2 routeOf on the stored team.json is the declared route after clear', async () => {
    await withTeam(teamFixture('team-a2', [member('alice')]), async ({ workspace, h }) => {
        await setRoute(h, 'alice', 'p1', 'm3');
        await clearRoute(h, 'alice');
        const alice = (await teamOf(workspace, 'team-a2')).members[0];
        const route = membersMod.routeOf(alice);
        assert.equal(route.origin, 'declared');
        assert.equal(route.provider, 'p1');
        assert.equal(route.model, 'm1');
    });
});

// ---------------------------------------------------------------------------
// (b) team.json after the clear
// ---------------------------------------------------------------------------
test('b1 team.json after clear keeps no routeOverride and no fallback/active fields', async () => {
    await withTeam(teamFixture('team-b1', [member('alice')]), async ({ workspace, h }) => {
        await setRoute(h, 'alice', 'p1', 'm3');
        await clearRoute(h, 'alice');
        const alice = (await teamOf(workspace, 'team-b1')).members[0];
        assert.equal('routeOverride' in alice, false, 'the override key is gone, not blanked');
        assert.equal('fallbackActive' in alice, false);
        assert.equal('activeProvider' in alice, false);
        assert.equal('activeModel' in alice, false);
        assert.equal(alice.provider, 'p1', 'the declared spine is untouched');
        assert.equal(alice.model, 'm1');
    });
});

// ---------------------------------------------------------------------------
// (c) audit row
// ---------------------------------------------------------------------------
test('c1 the audit log gains exactly one (cleared) row, naming the cleared route', async () => {
    await withTeam(teamFixture('team-c1', [member('alice')]), async ({ workspace, h }) => {
        await setRoute(h, 'alice', 'p1', 'm3', { reasoning_effort: 'high' });
        await clearRoute(h, 'alice');
        const audit = await auditOf(workspace);
        const rows = audit.split('\n').filter((line) => line.includes('| (cleared) |'));
        assert.equal(rows.length, 1, 'exactly one clear row');
        assert.equal(rows[0].includes('| p1/m3 (high) |'), true, 'the previous route is the override: ' + rows[0]);
        assert.equal(rows[0].includes('| durable-only |'), true, rows[0]);
        assert.equal(rows[0].includes('| captain:sess-captain |'), true, rows[0]);
        assert.equal(rows[0].includes('| team-c1 | alice |'), true, rows[0]);
    });
});

// ---------------------------------------------------------------------------
// (d) removed / stopping members
// ---------------------------------------------------------------------------
test('d1 clear on a removed or stopping member is refused and the file is unchanged', async () => {
    const fixture = teamFixture('team-d1', [
        member('gone', { status: 'removed', routeOverride: { provider: 'p1', model: 'm3', source: 'captain', at: 1 } }),
        member('stopping', { stopping: true, routeOverride: { provider: 'p1', model: 'm3', source: 'captain', at: 1 } }),
    ]);
    await withTeam(fixture, async ({ workspace, h }) => {
        const before = await readFile(teamPath(workspace, 'team-d1'), 'utf8');
        await assert.rejects(() => clearRoute(h, 'gone'), /is not part of team/);
        await assert.rejects(() => clearRoute(h, 'stopping'), /is stopping/);
        const after = await readFile(teamPath(workspace, 'team-d1'), 'utf8');
        assert.equal(after, before, 'a refused clear writes nothing');
    });
});

// ---------------------------------------------------------------------------
// (e) clear mixed with a route
// ---------------------------------------------------------------------------
test('e1 clear combined with provider, model, or effort is refused instead of silently ignored', async () => {
    await withTeam(teamFixture('team-e1', [member('alice')]), async ({ workspace, h }) => {
        await setRoute(h, 'alice', 'p1', 'm3');
        const before = await readFile(teamPath(workspace, 'team-e1'), 'utf8');
        await assert.rejects(() => clearRoute(h, 'alice', { provider: 'p1' }), /clear cannot be combined/);
        await assert.rejects(() => clearRoute(h, 'alice', { model: 'm3' }), /clear cannot be combined/);
        await assert.rejects(() => clearRoute(h, 'alice', { reasoning_effort: 'high' }), /clear cannot be combined/);
        const after = await readFile(teamPath(workspace, 'team-e1'), 'utf8');
        assert.equal(after, before, 'a refused clear keeps the override on disk');
        assert.equal(JSON.parse(after).members[0].routeOverride.model, 'm3');
    });
});

test('e2 omitting provider and model without clear is refused, not silently defaulted', async () => {
    await withTeam(teamFixture('team-e2', [member('alice')]), async ({ h }) => {
        await assert.rejects(
            () => routeTool(h).execute({ member_name: 'alice' }, { agent: h.captain, signal: undefined }),
            /provider and model are required unless clear is true/,
        );
    });
});

// ---------------------------------------------------------------------------
// (f) legacy team.json
// ---------------------------------------------------------------------------
test('f1 a legacy team.json without an override still reads, and clear is a safe no-op', async () => {
    await withTeam(teamFixture('team-f1', [member('alice')]), async ({ workspace, h }) => {
        const out = await clearRoute(h, 'alice');
        assert.equal(out.cleared, true);
        assert.equal(out.provider, 'p1');
        assert.equal(out.model, 'm1');
        assert.equal(out.previous_provider, 'p1', 'nothing was overridden, so previous is the declared route');
        assert.equal(out.previous_model, 'm1');
        const alice = (await teamOf(workspace, 'team-f1')).members[0];
        assert.equal('routeOverride' in alice, false);
        assert.equal(alice.provider, 'p1');
        assert.equal(alice.model, 'm1');
    });
});

test('f2 a cleared team.json still validates on the next read (no schema drift)', async () => {
    await withTeam(teamFixture('team-f2', [member('alice')]), async ({ workspace, h }) => {
        await setRoute(h, 'alice', 'p1', 'm3');
        await clearRoute(h, 'alice');
        const status = await h.registered.get('agent_teams_status').execute({}, { agent: h.captain, signal: undefined });
        assert.equal(status.members.length, 1);
        const reread = JSON.parse(await readFile(teamPath(workspace, 'team-f2'), 'utf8'));
        assert.equal(Array.isArray(reread.members), true);
    });
});

// ---------------------------------------------------------------------------
// (g) status DTO
// ---------------------------------------------------------------------------
test('g1 status shows route_override before the clear and none after', async () => {
    await withTeam(teamFixture('team-g1', [member('alice')]), async ({ h }) => {
        const statusTool = h.registered.get('agent_teams_status');
        await setRoute(h, 'alice', 'p1', 'm3');
        const withOverride = await statusTool.execute({}, { agent: h.captain, signal: undefined });
        assert.equal(withOverride.members[0].route_override.model, 'm3', 'control: the override is visible while set');
        assert.equal(withOverride.members[0].next_route, 'p1/m3');
        await clearRoute(h, 'alice');
        const after = await statusTool.execute({}, { agent: h.captain, signal: undefined });
        assert.equal('route_override' in after.members[0], false, 'the status DTO no longer advertises an override');
        assert.equal(after.members[0].next_route, 'p1/m1', 'the next route is the declared one');
        assert.equal(after.members[0].provider, 'p1');
        assert.equal(after.members[0].model, 'm1');
        assert.equal(after.members[0].fallback_active, false);
    });
});

// ---------------------------------------------------------------------------
// Degraded member and a member with nothing to return to
// ---------------------------------------------------------------------------
test('h1 clearing a degraded member also drops the fallback record and returns to the declared route', async () => {
    const degraded = member('alice', {
        fallbackActive: true,
        activeProvider: 'p2',
        activeModel: 'm2',
        routeOverride: { provider: 'p1', model: 'm3', source: 'captain', at: 1 },
    });
    await withTeam(teamFixture('team-h1', [degraded]), async ({ workspace, h }) => {
        const out = await clearRoute(h, 'alice');
        assert.equal(out.previous_provider, 'p2', 'previous is the route actually in effect (the fallback)');
        assert.equal(out.previous_model, 'm2');
        assert.equal(out.model, 'm1');
        const alice = (await teamOf(workspace, 'team-h1')).members[0];
        assert.equal('fallbackActive' in alice, false, 'the degraded flag cannot outlive the route it described');
        assert.equal('activeProvider' in alice, false);
        assert.equal('activeModel' in alice, false);
        assert.equal(membersMod.routeOf(alice).origin, 'declared');
    });
});

test('h2 a member with no declared route is refused a clear and keeps its record', async () => {
    const legacy = { id: '', name: 'legacy', joinedAt: 1, status: 'idle', routeOverride: { provider: 'p1', model: 'm3', source: 'captain', at: 1 } };
    await withTeam(teamFixture('team-h2', [legacy]), async ({ workspace, h }) => {
        const before = await readFile(teamPath(workspace, 'team-h2'), 'utf8');
        await assert.rejects(() => clearRoute(h, 'legacy'), /has no declared provider\/model to return to/);
        assert.equal(await readFile(teamPath(workspace, 'team-h2'), 'utf8'), before);
    });
});

// ---------------------------------------------------------------------------
// Regression guards: the set path and the disk-before-RAM order
// ---------------------------------------------------------------------------
test('i1 the route-setting path without clear is unchanged (override set, spine untouched)', async () => {
    await withTeam(teamFixture('team-i1', [member('alice')]), async ({ workspace, h }) => {
        const out = await setRoute(h, 'alice', 'p1', 'm3', { reasoning_effort: 'high' });
        assert.equal(out.cleared, undefined, 'a set is not a clear');
        assert.equal(out.previous_model, 'm1');
        assert.equal(out.applied, 'durable-only');
        const alice = (await teamOf(workspace, 'team-i1')).members[0];
        assert.equal(alice.provider, 'p1', 'the spawn route is still never rewritten');
        assert.equal(alice.model, 'm1');
        assert.equal(alice.routeOverride.model, 'm3');
        assert.equal(alice.routeOverride.reasoningEffort, 'high');
    });
});

test('i2 members.js writes team.json before the live switch on the clear path', async () => {
    const source = await readFile(join(LIB, 'members.js'), 'utf8');
    const start = source.indexOf('export async function setMemberRoute');
    assert.notEqual(start, -1, 'setMemberRoute must exist');
    const body = source.slice(start, source.indexOf('export async function deliverToMember'));
    const writeAt = body.indexOf('await writeTeam(stateRoot, team);');
    const switchAt = body.indexOf('selections.setLiveRoute(member.id, modelSelection(selection))');
    assert.notEqual(writeAt, -1, 'the durable write must be in this function');
    assert.notEqual(switchAt, -1, 'the live switch must be in this function');
    assert.equal(writeAt < switchAt, true, 'disk first, RAM second — a crash between them leaves a replayable record');
    assert.equal(body.includes("request.clear === true"), true, 'the clear branch is part of the same function/transaction');
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];
for (const item of cases) {
    try {
        await item.fn();
        passed += 1;
        console.log('PASS  ' + item.name);
    }
    catch (error) {
        failures.push({ name: item.name, error });
        console.log('FAIL  ' + item.name + '\n      ' + String(error && error.message ? error.message : error));
    }
}
console.log('');
console.log('#' + ' ' + passed + '/' + cases.length + ' passed, ' + failures.length + ' failed');
if (failures.length > 0) {
    for (const item of failures) {
        console.log('FAILED: ' + item.name);
        console.log(item.error && item.error.stack ? item.error.stack : String(item.error));
    }
    process.exit(1);
}
