#!/usr/bin/env node
/**
 * t87 - approve must resolve a staged member's route the same way a spawn does.
 *
 *   node tests/t87-approve-override.mjs
 *
 * The bug: approveStagedTeam (lib/tools.js) resolved every staged member's route
 * from the SPINE (member.provider / member.model / member.reasoningEffort) and
 * then wrote that resolution back into the spine, while setMemberRoute has no
 * phase guard - a STAGED member (id === '') can carry a routeOverride. So an
 * operator who set a valid route for the plan got:
 *   - a 4xx from validateMemberLlmSelections, because the DECLARED route (not the
 *     override) was validated, and
 *   - a spine overwritten with the declared route, disagreeing with what the
 *     member will actually run on once the spawn escalation runs.
 *
 * Cases: (a) override member with a declared route outside the catalog approves;
 *        (b) routeOverride survives approve (the spawn owns that deletion);
 *        (c) roster/tasks are preserved; (d) a member without an override still
 *        approves on its declared route; (e) blank confirmation still refused and
 *        team.json untouched; (f) NEGATIVE CONTROL: the old spine request makes
 *        the validator reject this very fixture; (g) the spine read is gone from
 *        the approve window (applies / delta bytes printed, scratch removed);
 *        (h) a mixed roster resolves each member on its own route.
 */
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'dsh-agent-teams', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const indexMod = await import(libModule('index.js'));
const membersMod = await import(libModule('members.js'));

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

const CATALOG = { p1: [{ id: 'm1' }, { id: 'm3' }], p2: [{ id: 'm2' }] };
const MEMBER_PROVIDER = 'spawn';

function makeHarness(workspace) {
    const registered = new Map();
    const starts = [];
    const captain = {
        id: 'sess-captain',
        options: { provider: 'p1', model: 'm1' },
        session: {
            id: 'sess-captain',
            header: { cwd: workspace },
            append() {},
            requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }),
        },
        ctx: { tools: { view: () => ({ restrictableNames: new Set(['agent_teams_claim_task', 'agent_teams_send_message', 'subagent', 'send_message']) }) } },
        followup() { return 'followup'; },
        cancel() {},
    };
    let childSeq = 0;
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        tools: { register(def) { registered.set(def.name, def); } },
        agents: { get(id) { return id === 'sess-captain' ? captain : undefined; }, list() { return []; } },
        subagents: {
            followup() { return Promise.resolve('msg-legacy'); },
            [Symbol.for('dsh.subagent.deliverPrompt')]() { return Promise.resolve('deliver'); },
            sendMessage() { return Promise.resolve('msg-send'); },
            startActivation(spec) {
                starts.push(spec);
                childSeq += 1;
                return Promise.resolve({ childId: 'child-' + childSeq, result: Promise.resolve({ text: 'ok' }) });
            },
            getProvider(name) { return name === MEMBER_PROVIDER ? { id: MEMBER_PROVIDER, name: MEMBER_PROVIDER, prepareContinuable() {} } : undefined; },
            list() { return [MEMBER_PROVIDER]; },
            interrupt() {},
        },
        llm: {
            async listModels(provider) { return CATALOG[provider] ?? []; },
            async listProviders() { return [{ id: 'p1' }, { id: 'p2' }]; },
            async resolveCallConfig(config) { return config; },
        },
        on() { return () => {}; },
        inject() {},
        systemPrompt: { section() {} },
        effect() {},
        get() { return undefined; },
    };
    return { ctx, captain, registered, starts };
}

const baseConfig = () => ({
    stateDir: '.agent-teams',
    memberProvider: MEMBER_PROVIDER,
    maxMembers: 8,
    maxManualMembers: 12,
    profiles: {},
    toolPolicies: {},
    slashCommand: false,
});

/** The operator's valid route for a plan whose DECLARED route is outside the catalog. */
const OVERRIDE = { provider: 'p2', model: 'm2', reasoningEffort: 'high', source: 'captain', at: 5, by: 'sess-captain' };

const stagedMember = (name, extra = {}) => ({
    id: '',
    name,
    provider: 'p1',
    model: 'm9',
    joinedAt: 1,
    status: 'idle',
    ...extra,
});

/** t0 is cancelled, t1 depends on it: the post-approval kick finds nothing ready, so
 *  the scheduler never spawns and this suite observes exactly what approve wrote. */
const tasksFor = (name) => [
    { id: 't0', subject: 'superseded setup', assignee: name, status: 'cancelled', dependencies: [], kind: 'work', attempt: 0, createdAt: 1, updatedAt: 1 },
    { id: 't1', subject: 'ship it', assignee: name, status: 'pending', dependencies: ['t0'], kind: 'work', attempt: 0, createdAt: 1, updatedAt: 1 },
];
const stagedTeam = (members) => ({
    id: 'team-t87',
    name: 'TEAM-T87',
    captainSessionId: 'sess-captain',
    createdAt: 1,
    taskSeq: 2,
    phase: 'staged',
    planReviewState: 'awaiting_review',
    members,
    tasks: tasksFor(members[0].name),
});

const teamPath = (workspace) => join(workspace, '.agent-teams', 'team-t87', 'team.json');
async function seed(workspace, team) {
    const root = join(workspace, '.agent-teams', team.id);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'team.json'), JSON.stringify(team, null, 2));
}
const teamOf = async (workspace) => JSON.parse(await readFile(teamPath(workspace), 'utf8'));
const memberOf = async (workspace, name) => (await teamOf(workspace)).members.find((m) => m.name === name);

async function withTeam(team, fn) {
    const workspace = await mkdtemp(join(tmpdir(), 't87-'));
    try {
        const h = makeHarness(workspace);
        indexMod.apply(h.ctx, baseConfig());
        await seed(workspace, team);
        return await fn({ workspace, h });
    }
    finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

const approve = (h, text = 'ship it') => h.registered.get('agent_teams_approve')
    .execute({ confirmation: text }, { agent: h.captain, signal: undefined });
/** The one read of the spine that the fix removed, kept verbatim for the byte delta. */
const OLD_APPROVE_RESOLVE = [
    '            const selection = await resolveMemberLlmSelection(ctx, captain, {',
    '                provider: member.provider,',
    '                model: member.model,',
    '                reasoningEffort: member.reasoningEffort,',
    '                fallback: member.fallback ?? config.fallback,',
    '            }, runSignal);',].join('\n');

test('a1 approve succeeds on a member whose declared route is outside the catalog (override wins)', async () => {
    await withTeam(stagedTeam([stagedMember('alice', { routeOverride: { ...OVERRIDE } })]), async ({ workspace, h }) => {
        const before = await teamOf(workspace);
        assert.equal(before.phase, 'staged');
        const result = await approve(h);
        assert.equal(result.status, 'running');
        assert.equal(result.team_id, 'team-t87');
        const after = await teamOf(workspace);
        assert.equal(after.phase, 'running');
        assert.equal(after.planReviewState, undefined);
        const alice = after.members.find((m) => m.name === 'alice');
        assert.equal(alice.provider, 'p2', 'spine provider must be the OVERRIDE provider');
        assert.equal(alice.model, 'm2', 'spine model must be the OVERRIDE model');
        assert.equal(alice.reasoningEffort, 'high');
        assert.equal(h.starts.length, 0, 'the fixture must not be spawnable, otherwise the spawn eats the override');
        console.log('    spine= ' + alice.provider + '/' + alice.model + ' (' + alice.reasoningEffort + ') declared was p1/m9');
    });
});

test('a2 approve keeps routeOverride — the spawn escalation owns that deletion', async () => {
    await withTeam(stagedTeam([stagedMember('alice', { routeOverride: { ...OVERRIDE } })]), async ({ workspace, h }) => {
        await approve(h);
        const alice = await memberOf(workspace, 'alice');
        assert.deepEqual({ ...alice.routeOverride }, { ...OVERRIDE });
        console.log('    routeOverride survived: ' + alice.routeOverride.provider + '/' + alice.routeOverride.model + ' source=' + alice.routeOverride.source);
    });
});

test('a3 approve loses no member and no task', async () => {
    await withTeam(stagedTeam([
        stagedMember('alice', { routeOverride: { ...OVERRIDE } }),
        stagedMember('bob', { provider: 'p1', model: 'm3' }),
    ]), async ({ workspace, h }) => {
        const before = await teamOf(workspace);
        await approve(h);
        const after = await teamOf(workspace);
        assert.deepEqual(after.members.map((m) => m.name).sort(), before.members.map((m) => m.name).sort());
        assert.deepEqual(after.tasks.map((t) => t.id).sort(), before.tasks.map((t) => t.id).sort());
        assert.equal(after.tasks.filter((t) => t.status === 'cancelled').length, 1);
        assert.equal(after.tasks.filter((t) => t.status === 'pending').length, 1);
        assert.equal(after.taskSeq, before.taskSeq);
    });
});

test('b1 a member without an override still approves on its declared route', async () => {
    await withTeam(stagedTeam([stagedMember('bob', { provider: 'p1', model: 'm3' })]), async ({ workspace, h }) => {
        const result = await approve(h);
        assert.equal(result.status, 'running');
        const bob = await memberOf(workspace, 'bob');
        assert.equal(bob.provider, 'p1');
        assert.equal(bob.model, 'm3');
        assert.equal(bob.routeOverride, undefined);
        console.log('    declared route preserved: ' + bob.provider + '/' + bob.model);
    });
});

test('b2 blank confirmation is refused and team.json is byte-identical', async () => {
    await withTeam(stagedTeam([stagedMember('alice', { routeOverride: { ...OVERRIDE } })]), async ({ workspace, h }) => {
        const before = await readFile(teamPath(workspace), 'utf8');
        await assert.rejects(() => approve(h, '   '), /explicit user approval text is required/);
        const after = await readFile(teamPath(workspace), 'utf8');
        assert.equal(after, before, 'a refused approve must not touch team.json');
        const team = JSON.parse(after);
        assert.equal(team.phase, 'staged');
    });
});

test('c1 NEGATIVE CONTROL — the old spine request is rejected on this very fixture', async () => {
    await withTeam(stagedTeam([stagedMember('alice', { routeOverride: { ...OVERRIDE } })]), async ({ h }) => {
        const oldSelection = await membersMod.resolveMemberLlmSelection(h.ctx, h.captain, {
            provider: 'p1',
            model: 'm9',
            reasoningEffort: undefined,
            fallback: undefined,
        }, undefined);
        await assert.rejects(
            () => membersMod.validateMemberLlmSelections(h.ctx, [oldSelection], undefined),
            /unknown member model "m9" for provider "p1"/,
            'the OLD request (declared route) must be rejected: this is the 4xx the fix removes',
        );
        const fixedSelection = await membersMod.resolveMemberLlmSelection(h.ctx, h.captain, {
            provider: 'p2',
            model: 'm2',
            reasoningEffort: 'high',
        }, undefined);
        await membersMod.validateMemberLlmSelections(h.ctx, [fixedSelection], undefined);
        assert.equal(fixedSelection.provider, 'p2');
        assert.equal(fixedSelection.model, 'm2');
        console.log('    old request => rejected (unknown member model "m9"); fixed request => accepted');
    });
});

test('c2 the approve window reads selectionFromMember and no longer the spine', async () => {
    const source = await readFile(join(LIB, 'tools.js'), 'utf8');
    const anchor = source.indexOf('const approveStagedTeam = async');
    assert.ok(anchor > 0, 'approveStagedTeam must exist in tools.js');
    const window = source.slice(anchor, anchor + 3000);
    assert.ok(window.includes('membersApi.selectionFromMember(member)'), 'the approve window must resolve from the durable row');
    assert.ok(window.includes('Do NOT drop routeOverride'), 'the reason not to clear the override must be documented');
    assert.equal(source.split(OLD_APPROVE_RESOLVE).length - 1, 0, 'the old spine resolve must be gone from tools.js');
    const fixedBlock = window.slice(window.indexOf('const declaredRoute'), window.indexOf('const selection ='));
    const scratch = join(dirname(fileURLToPath(import.meta.url)), 'tmp', 't87');
    await mkdir(scratch, { recursive: true });
    try {
        await writeFile(join(scratch, 'approve-old.txt'), OLD_APPROVE_RESOLVE);
        await writeFile(join(scratch, 'approve-new.txt'), fixedBlock);
        const oldBytes = Buffer.byteLength(OLD_APPROVE_RESOLVE);
        const newBytes = Buffer.byteLength(fixedBlock);
        assert.ok(newBytes > 0);
        console.log('    applies=1 old_bytes=' + oldBytes + ' new_bytes=' + newBytes + ' delta_bytes=' + (newBytes - oldBytes));
        assert.ok(newBytes > oldBytes, 'the fix adds the durable-row comment, it must be longer than the one-liner');
    }
    finally {
        await rm(scratch, { recursive: true, force: true });
    }
});

test('e1 a mixed roster resolves each member on its own route', async () => {
    await withTeam(stagedTeam([
        stagedMember('alice', { routeOverride: { ...OVERRIDE } }),
        stagedMember('bob', { provider: 'p1', model: 'm3' }),
    ]), async ({ workspace, h }) => {
        await approve(h);
        const alice = await memberOf(workspace, 'alice');
        const bob = await memberOf(workspace, 'bob');
        assert.equal(alice.provider + '/' + alice.model, 'p2/m2', 'alice must ride the override');
        assert.equal(bob.provider + '/' + bob.model, 'p1/m3', 'bob must ride the declared route');
        assert.equal(bob.routeOverride, undefined);
        console.log('    alice=p2/m2 bob=p1/m3');
    });
});

let failed = 0;
for (const [index, item] of cases.entries()) {
    try {
        await item.fn();
        console.log('ok ' + (index + 1) + ' ' + item.name);
    }
    catch (error) {
        failed += 1;
        console.log('not ok ' + (index + 1) + ' ' + item.name);
        console.log('    ' + String(error && error.message ? error.message : error).split('\n').join('\n    '));
    }
}
console.log('');
console.log('# ' + (cases.length - failed) + '/' + cases.length + ' passed, ' + failed + ' failed');
console.log(failed === 0 ? 'verdict PASS - approve resolves every staged member from its durable row' : 'verdict FAIL - ' + failed + ' case(s) red');
process.exit(failed === 0 ? 0 : 1);
