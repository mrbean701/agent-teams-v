#!/usr/bin/env node
/**
 * t38 per-member fallback route suite (shipped harness — lives in tests/).
 *
 *   node tests/t38-member-fallback.mjs
 *
 * Mounts the real plugin (lib/index.js apply) against a fake ctx and drives the
 * registered agent_teams_set_member_route tool, proving the fallback path:
 *   (a) fallback_provider+fallback_model set the durable member.fallback route
 *       (validated against the provider catalog) without touching the override —
 *       and a FALLBACK-ONLY call (no provider/model at all) must be accepted:
 *       that shape is what lib/members.js:1363 once refused with nothing failing
 *       here (t47 closed the hole, cases a5-a7)
 *   (b) fallback_clear removes it and leaves the primary route alone
 *   (c) a half pair / effort-only / fallback_clear+pair / unknown or empty
 *       model are refused and leave team.json byte-identical
 *   (d) lib/state.js accepts a valid fallback, rejects a malformed one, and a
 *       legacy team.json (no fallback key) still reads — the hard invariant
 *   (e) the snapshot AND the separately-assembled agent_teams_status DTO both
 *       surface the fallback (lesson t30: the DTO is not built from the snapshot)
 * No session event is used anywhere: the host drops every agent-teams/* event.
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
const stateMod = await import(libModule('state.js'));
const snapshotMod = await import(libModule('snapshot.js'));

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
            // The catalog gate: m1 and m3 exist, nothing else does.
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
const teamText = (workspace, id) => readFile(teamPath(workspace, id), 'utf8');
const auditOf = (workspace) => readFile(join(workspace, 'docs', 'log', 'MODEL-SWITCH.md'), 'utf8');
const routeTool = (h) => h.registered.get('agent_teams_set_member_route');
const statusTool = (h) => h.registered.get('agent_teams_status');

async function withTeam(fixture, fn) {
    const workspace = await mkdtemp(join(tmpdir(), 't38-'));
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
// The third call shape: move ONLY the fallback. No provider/model/effort, so a
// guard that requires a primary route would refuse it (that was the t38 hole —
// lib/members.js:1363 once threw here and nothing in this suite noticed).
const setFallback = (h, name, extra = {}) =>
    routeTool(h).execute({ member_name: name, ...extra }, { agent: h.captain, signal: undefined });

// ---------------------------------------------------------------------------
// (a) the fallback route is set, validated, and durable
// ---------------------------------------------------------------------------
test('a1 fallback pair is saved beside the override, primary route untouched', async () => {
    await withTeam(teamFixture('team-a1', [member('alice')]), async ({ workspace, h }) => {
        const out = await setRoute(h, 'alice', 'p1', 'm3', { fallback_provider: 'p1', fallback_model: 'm1' });
        assert.equal(out.provider, 'p1');
        assert.equal(out.model, 'm3');
        assert.equal(out.fallback_provider, 'p1');
        assert.equal(out.fallback_model, 'm1');
        assert.equal('fallback_cleared' in out, false);
        const alice = (await teamOf(workspace, 'team-a1')).members[0];
        assert.deepEqual(alice.fallback, { provider: 'p1', model: 'm1' });
        assert.equal(alice.routeOverride.model, 'm3', 'control: the primary override is still there');
        // The declared route is never rewritten: it is the subagent descriptor route.
        assert.equal(alice.provider, 'p1');
        assert.equal(alice.model, 'm1');
    });
});

test('a2 fallback reasoning effort is stored and reported', async () => {
    await withTeam(teamFixture('team-a2', [member('alice')]), async ({ workspace, h }) => {
        const out = await setRoute(h, 'alice', 'p1', 'm3', {
            fallback_provider: 'p2', fallback_model: 'm3', fallback_reasoning_effort: 'high',
        });
        assert.equal(out.fallback_reasoning_effort, 'high');
        const alice = (await teamOf(workspace, 'team-a2')).members[0];
        assert.deepEqual(alice.fallback, { provider: 'p2', model: 'm3', reasoningEffort: 'high' });
    });
});

test('a3 a plain route change keeps an existing fallback and never invents one', async () => {
    const withFallback = member('alice', { fallback: { provider: 'p2', model: 'm3' } });
    await withTeam(teamFixture('team-a3', [withFallback, member('bob')]), async ({ workspace, h }) => {
        const kept = await setRoute(h, 'alice', 'p1', 'm3');
        assert.equal('fallback_provider' in kept, false, 'no fallback argument means no fallback in the result');
        assert.deepEqual((await teamOf(workspace, 'team-a3')).members[0].fallback, { provider: 'p2', model: 'm3' });
        await setRoute(h, 'bob', 'p1', 'm3');
        const bob = (await teamOf(workspace, 'team-a3')).members[1];
        assert.equal('fallback' in bob, false, 'a member with no fallback and no argument gains none');
    });
});

test('a4 the audit row names the fallback without changing the table shape', async () => {
    await withTeam(teamFixture('team-a4', [member('alice')]), async ({ workspace, h }) => {
        await setRoute(h, 'alice', 'p1', 'm3', { fallback_provider: 'p1', fallback_model: 'm1' });
        const audit = await auditOf(workspace);
        const row = audit.split('\n').filter((line) => line.includes('alice') && line.includes('/'));
        assert.equal(row.length, 1);
        assert.ok(row[0].includes('(fallback p1/m1)'), 'the fallback is visible to a human reading the log: ' + row[0]);
        assert.equal(row[0].split('|').length, 9, 'header pipe + 7 columns keeps the table parseable');
    });
});

// A fallback-only call is its own request shape: provider/model are optional,
// the override must NOT be invented, and the declared spine is not rewritten.
test('a5 fallback-only saves the fallback without inventing an override', async () => {
    await withTeam(teamFixture('team-a5', [member('alice')]), async ({ workspace, h }) => {
        const out = await setFallback(h, 'alice', { fallback_provider: 'p2', fallback_model: 'm3' });
        assert.equal(out.fallback_provider, 'p2');
        assert.equal(out.fallback_model, 'm3');
        assert.equal('fallback_cleared' in out, false);
        // The result still reports the route in effect, so nobody has to infer it.
        assert.equal(out.provider, 'p1');
        assert.equal(out.model, 'm1');
        const alice = (await teamOf(workspace, 'team-a5')).members[0];
        assert.deepEqual(alice.fallback, { provider: 'p2', model: 'm3' });
        assert.equal('routeOverride' in alice, false, 'fallback-only must not create an override');
        assert.equal(alice.provider, 'p1', 'the declared provider is the subagent descriptor: never rewritten');
        assert.equal(alice.model, 'm1');
    });
});

test('a6 fallback-only stores the effort and leaves the spine alone', async () => {
    await withTeam(teamFixture('team-a6', [member('alice')]), async ({ workspace, h }) => {
        const out = await setFallback(h, 'alice', {
            fallback_provider: 'p2', fallback_model: 'm3', fallback_reasoning_effort: 'high',
        });
        assert.equal(out.fallback_reasoning_effort, 'high');
        assert.equal(out.model, 'm1');
        const alice = (await teamOf(workspace, 'team-a6')).members[0];
        assert.deepEqual(alice.fallback, { provider: 'p2', model: 'm3', reasoningEffort: 'high' });
        assert.equal('routeOverride' in alice, false);
        assert.equal(alice.model, 'm1');
    });
});

test('a7 fallback-only on a re-routed member keeps the existing override', async () => {
    const rerouted = member('alice', { routeOverride: { provider: 'p1', model: 'm3', source: 'captain', at: 5 } });
    await withTeam(teamFixture('team-a7', [rerouted]), async ({ workspace, h }) => {
        const out = await setFallback(h, 'alice', { fallback_provider: 'p2', fallback_model: 'm1' });
        assert.equal(out.model, 'm3', 'the override still governs the route now in effect');
        assert.equal(out.previous_model, 'm3');
        const alice = (await teamOf(workspace, 'team-a7')).members[0];
        assert.deepEqual(alice.fallback, { provider: 'p2', model: 'm1' });
        assert.deepEqual(alice.routeOverride, { provider: 'p1', model: 'm3', source: 'captain', at: 5 },
            'a fallback-only change must not delete or rewrite the override');
        assert.equal(alice.model, 'm1');
    });
});

// ---------------------------------------------------------------------------
// (b) clearing the fallback
// ---------------------------------------------------------------------------
test('b1 fallback_clear removes the fallback and leaves the override in place', async () => {
    await withTeam(teamFixture('team-b1', [member('alice')]), async ({ workspace, h }) => {
        await setRoute(h, 'alice', 'p1', 'm3', { fallback_provider: 'p2', fallback_model: 'm3' });
        const out = await routeTool(h).execute({ member_name: 'alice', fallback_clear: true }, { agent: h.captain, signal: undefined });
        assert.equal(out.fallback_cleared, true);
        assert.equal(out.fallback_provider, undefined);
        // The fallback clear does not touch the primary route: the member is
        // still on the captain override it was re-routed to (p1/m3), which is
        // what the result must report as the route in effect.
        assert.equal(out.model, 'm3', 'the primary route is untouched by a fallback clear');
        assert.equal(out.previous_model, 'm3');
        const alice = (await teamOf(workspace, 'team-b1')).members[0];
        assert.equal('fallback' in alice, false);
        assert.equal(alice.routeOverride.model, 'm3', 'control: the primary override survives');
        assert.ok((await auditOf(workspace)).includes('(fallback cleared)'));
    });
});

test('b2 fallback clear and a fallback pair in one call are refused', async () => {
    await withTeam(teamFixture('team-b2', [member('alice')]), async ({ workspace, h }) => {
        const before = await teamText(workspace, 'team-b2');
        await assert.rejects(
            () => routeTool(h).execute({ member_name: 'alice', fallback_clear: true, fallback_provider: 'p1', fallback_model: 'm1' }, { agent: h.captain, signal: undefined }),
            /fallback_clear cannot be combined/,
        );
        assert.equal(await teamText(workspace, 'team-b2'), before);
    });
});

// ---------------------------------------------------------------------------
// (c) refusals: a half route never reaches the durable record
// ---------------------------------------------------------------------------
test('c1 a half fallback pair is refused and the file is untouched', async () => {
    await withTeam(teamFixture('team-c1', [member('alice')]), async ({ workspace, h }) => {
        const before = await teamText(workspace, 'team-c1');
        for (const extra of [{ fallback_provider: 'p1' }, { fallback_model: 'm3' }, { fallback_reasoning_effort: 'high' }]) {
            await assert.rejects(() => setRoute(h, 'alice', 'p1', 'm3', extra), /needs both fallback_provider and fallback_model/);
        }
        assert.equal(await teamText(workspace, 'team-c1'), before);
    });
});

test('c2 an unknown fallback model fails the catalog gate before any write', async () => {
    await withTeam(teamFixture('team-c2', [member('alice')]), async ({ workspace, h }) => {
        const before = await teamText(workspace, 'team-c2');
        await assert.rejects(
            () => setRoute(h, 'alice', 'p1', 'm3', { fallback_provider: 'p1', fallback_model: 'm9' }),
            /unknown member model "m9" for provider "p1"/,
        );
        assert.equal(await teamText(workspace, 'team-c2'), before, 'a rejected fallback must not half-write the override either');
    });
});

test('c3 an empty fallback provider or model is refused', async () => {
    await withTeam(teamFixture('team-c3', [member('alice')]), async ({ workspace, h }) => {
        const before = await teamText(workspace, 'team-c3');
        await assert.rejects(() => setRoute(h, 'alice', 'p1', 'm3', { fallback_provider: '  ', fallback_model: 'm3' }), /fallback_provider must be a non-empty/);
        await assert.rejects(() => setRoute(h, 'alice', 'p1', 'm3', { fallback_provider: 'p1', fallback_model: ' ' }), /fallback_model must be a non-empty/);
        assert.equal(await teamText(workspace, 'team-c3'), before);
    });
});

// ---------------------------------------------------------------------------
// (d) lib/state.js: compat forwards, malformed rejected (the hard invariant)
// ---------------------------------------------------------------------------
test('d1 a legacy team.json without a fallback key still reads', async () => {
    const legacy = member('legacy');
    await withTeam(teamFixture('team-d1', [legacy]), async ({ workspace }) => {
        const root = join(workspace, '.agent-teams');
        const back = await stateMod.readTeam(root, 'team-d1');
        assert.equal('fallback' in back.members[0], false);
        assert.equal('fallback' in stateMod.readTeamSync(root, 'team-d1').members[0], false);
    });
});

test('d2 a valid fallback is accepted by readTeam', async () => {
    const good = member('alice', { fallback: { provider: 'p2', model: 'm3', reasoningEffort: 'low' } });
    await withTeam(teamFixture('team-d2', [good]), async ({ workspace }) => {
        const back = await stateMod.readTeam(join(workspace, '.agent-teams'), 'team-d2');
        assert.deepEqual(back.members[0].fallback, { provider: 'p2', model: 'm3', reasoningEffort: 'low' });
    });
});

test('d3 a malformed fallback is rejected at the durable boundary', async () => {
    for (const bad of [
        { provider: 'p2', model: 3 },
        { provider: '  ', model: 'm3' },
        { model: 'm3' },
        { provider: 'p2', model: 'm3', reasoningEffort: 7 },
    ]) {
        await withTeam(teamFixture('team-d3', [member('alice', { fallback: bad })]), async ({ workspace }) => {
            const root = join(workspace, '.agent-teams');
            await assert.rejects(() => stateMod.readTeam(root, 'team-d3'), /invalid AgentTeams state in team/);
            assert.throws(() => stateMod.readTeamSync(root, 'team-d3'), /invalid AgentTeams state in team/);
        });
    }
});

// ---------------------------------------------------------------------------
// (e) both surfaces: the snapshot AND the separately assembled status DTO
// ---------------------------------------------------------------------------
test('e1 assembleTeamSnapshot surfaces the fallback', async () => {
    const alice = member('alice', { fallback: { provider: 'p2', model: 'm3', reasoningEffort: 'high' } });
    await withTeam(teamFixture('team-e1', [alice, member('bob')]), async ({ workspace, h }) => {
        const team = await teamOf(workspace, 'team-e1');
        const snapshot = await snapshotMod.assembleTeamSnapshot(h.ctx, join(workspace, '.agent-teams'), 'ws-t38', team);
        assert.deepEqual(snapshot.members[0].fallback, { provider: 'p2', model: 'm3', reasoningEffort: 'high' });
        assert.equal('fallback' in snapshot.members[1], false);
    });
});

test('e2 the agent_teams_status DTO surfaces the fallback and drops it on clear', async () => {
    await withTeam(teamFixture('team-e2', [member('alice')]), async ({ h }) => {
        await setRoute(h, 'alice', 'p1', 'm3', { fallback_provider: 'p2', fallback_model: 'm3', fallback_reasoning_effort: 'low' });
        const before = await statusTool(h).execute({}, { agent: h.captain, signal: undefined });
        assert.deepEqual(before.members[0].fallback, { provider: 'p2', model: 'm3', reasoning_effort: 'low' });
        await routeTool(h).execute({ member_name: 'alice', fallback_clear: true }, { agent: h.captain, signal: undefined });
        const after = await statusTool(h).execute({}, { agent: h.captain, signal: undefined });
        assert.equal('fallback' in after.members[0], false);
        assert.equal(after.members[0].next_route, 'p1/m3', 'the primary override still governs the next route');
    });
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
let failed = 0;
let index = 0;
for (const item of cases) {
    index += 1;
    try {
        await item.fn();
        console.log('ok ' + index + ' - ' + item.name);
    }
    catch (error) {
        failed += 1;
        console.log('not ok ' + index + ' - ' + item.name);
        const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
        console.log(detail.split('\n').map((line) => '  ' + line).join('\n'));
    }
}
console.log('# ' + (index - failed) + '/' + index + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
