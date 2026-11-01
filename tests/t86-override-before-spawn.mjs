#!/usr/bin/env node
/**
 * t86 - a never-started member must spawn on the route its DURABLE row resolves to.
 *
 *   node tests/t86-override-before-spawn.mjs
 *
 * The bug (t82 C3, reproduced live by kiem-thu-goat): the scheduler path
 * (lib/tools.js dispatchMember, member.id === '') built its model selection by
 * reading member.provider / member.model straight off the row, while the manual
 * add and the cold resume both go through selectionFromMember() -> routeOf().
 * A member that had never started therefore spawned on its DECLARED route, and
 * spawnMember's escalation then wrote that route into provider/model and deleted
 * routeOverride - so a migrated route vanished without ever taking effect.
 *
 * What this suite proves:
 *   (a) a row with routeOverride and id === '' spawns on the OVERRIDE route
 *   (b) after the spawn the row carries the override in provider/model and has no
 *       routeOverride left (the escalation stays consistent with the descriptor)
 *   (c) NEGATIVE CONTROL: the old in-memory selection + the real spawnMember lose
 *       the override, and the old spine-read line no longer sits on the dispatch
 *       path (applies / delta bytes are printed), so a green run cannot be a lie
 *   (d) a row without an override still spawns on its declared route
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

// The catalog is per provider on purpose: a route that only exists under p2 must
// still be judged valid when the override names p2.
const CATALOG = { p1: [{ id: 'm1' }, { id: 'm3' }], p2: [{ id: 'm2' }, { id: 'm2-high' }] };
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

const OVERRIDE = { provider: 'p2', model: 'm2', reasoningEffort: 'high', source: 'profile', at: 2, by: 'tools/erp-route-migrate' };
const alice = (extra = {}) => ({ id: '', name: 'alice', provider: 'p1', model: 'm1', reasoningEffort: 'low', joinedAt: 1, status: 'idle', ...extra });
const bob = (extra = {}) => ({ id: '', name: 'bob', provider: 'p1', model: 'm1', joinedAt: 1, status: 'idle', ...extra });
const teamFixture = (members) => ({ id: 'team-t86', name: 'TEAM-T86', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members, tasks: [] });

const teamPath = (workspace) => join(workspace, '.agent-teams', 'team-t86', 'team.json');
async function seed(workspace, team) {
    const root = join(workspace, '.agent-teams', team.id);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'team.json'), JSON.stringify(team, null, 2));
}
const teamOf = async (workspace) => JSON.parse(await readFile(teamPath(workspace), 'utf8'));
const memberOf = async (workspace, name) => (await teamOf(workspace)).members.find((m) => m.name === name);

async function withTeam(team, fn) {
    const workspace = await mkdtemp(join(tmpdir(), 't86-'));
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

/** Ask the real create_task tool: it ends by awaiting scheduler.kickTeam, so one
 *  call drives the whole scheduler -> dispatchMember -> spawnMember path. */
const createTask = (h, subject, assignee) => h.registered.get('agent_teams_create_task')
    .execute({ subject, assignee }, { agent: h.captain, signal: undefined });

/** spawnMember hands ctx.subagents.startActivation({ provider, label, request, signal, delivery });
 *  the route the child actually starts on lives at spec.request.agentOptions. */
const startedRoute = (h, index = 0) => {
    assert.ok(h.starts[index], 'the child should have started (no startActivation call was recorded)');
    return h.starts[index].request.agentOptions;
};

/** The member-runtime knobs tools.js hands to members.js at a spawn. */
const memberRuntime = () => ({
    provider: MEMBER_PROVIDER,
    maxDepth: 0,
    executionPrompt: 'keep going',
    fallback: undefined,
    memberModel: undefined,
    memberLlmProvider: undefined,
});

/** The selection runtime spawnMember needs (the same shape t15 drives it with). */
function fakeSelections() {
    const pending = [];
    return {
        stateDir: '.agent-teams',
        pending,
        isPendingMember: () => false,
        async withPending(parentSessionId, label, selection, operation) {
            pending.push({ parentSessionId, label, selection });
            return await operation();
        },
        setLiveRoute() { return true; },
        liveRoute: () => undefined,
        liveChildIds: () => [],
    };
}

// ---------------------------------------------------------------------------
// (a) the override decides the spawn route, (b) escalation stays consistent
// ---------------------------------------------------------------------------

test('a1 a never-started member with routeOverride spawns on the OVERRIDE route', async () => {
    await withTeam(teamFixture([alice({ routeOverride: { ...OVERRIDE } })]), async ({ h }) => {
        await createTask(h, 't86 do the thing', 'alice');
        assert.equal(h.starts.length, 1, 'exactly one child should have started');
        const route = startedRoute(h);
        assert.equal(route.provider, 'p2', 'the child must start on the override provider, not the declared one');
        assert.equal(route.model, 'm2', 'the child must start on the override model');
        assert.equal(String(route.reasoningEffort), 'high', 'the override effort travels with the override route');
    });
});

test('a2 after the spawn the row carries the override in provider/model and no routeOverride', async () => {
    await withTeam(teamFixture([alice({ routeOverride: { ...OVERRIDE } })]), async ({ workspace, h }) => {
        await createTask(h, 't86 do the thing', 'alice');
        const stored = await memberOf(workspace, 'alice');
        assert.equal(stored.id, 'child-1', 'the child id is recorded');
        assert.equal(stored.provider, 'p2', 'escalation writes the route the child actually runs on');
        assert.equal(stored.model, 'm2');
        assert.equal(stored.reasoningEffort, 'high');
        assert.equal(stored.routeOverride, undefined, 'the escalation drops the override, so the cold-resume descriptor guard still matches');
    });
});

// ---------------------------------------------------------------------------
// (d) a row without an override must not regress
// ---------------------------------------------------------------------------

test('d1 a member without an override still spawns on its declared route', async () => {
    await withTeam(teamFixture([bob()]), async ({ workspace, h }) => {
        await createTask(h, 't86 do the thing', 'bob');
        const route = startedRoute(h);
        assert.equal(route.provider, 'p1');
        assert.equal(route.model, 'm1');
        const stored = await memberOf(workspace, 'bob');
        assert.equal(stored.provider, 'p1');
        assert.equal(stored.model, 'm1');
        assert.equal(stored.routeOverride, undefined);
    });
});

test('d2 a legacy row with no saved route still starts on the captain route', async () => {
    await withTeam(teamFixture([{ id: '', name: 'carol', joinedAt: 1, status: 'idle' }]), async ({ h }) => {
        await createTask(h, 't86 do the thing', 'carol');
        const route = startedRoute(h);
        assert.equal(route.provider, 'p1', 'no saved route falls back to the captain request route');
        assert.equal(route.model, 'm1');
    });
});

test('d3 selectionFromMember is exported, declared, and picks the override for an unstarted row', async () => {
    const dts = await readFile(join(LIB, 'types', 'members.d.ts'), 'utf8');
    assert.ok(dts.includes('export declare function selectionFromMember(member: TeamMember | undefined): MemberLlmSelectionRequest | undefined;'),
        'lib/types/members.d.ts must declare the new export (t56 fails otherwise)');
    assert.equal(typeof membersMod.selectionFromMember, 'function');
    assert.equal(membersMod.selectionFromMember.length, 1);
    const picked = membersMod.selectionFromMember({ id: '', name: 'alice', provider: 'p1', model: 'm1', routeOverride: { ...OVERRIDE } });
    assert.equal(picked.provider, 'p2');
    assert.equal(picked.model, 'm2');
    assert.equal(picked.reasoningEffort, 'high');
});

// ---------------------------------------------------------------------------
// (c) NEGATIVE CONTROL: the old code, reproduced
// ---------------------------------------------------------------------------

test('c1 NEGATIVE CONTROL: the old spine-read selection driven through the real spawnMember loses the override', async () => {
    await withTeam(teamFixture([alice({ routeOverride: { ...OVERRIDE } })]), async ({ workspace, h }) => {
        const team = await teamOf(workspace);
        const row = team.members[0];
        // The exact argument object the old dispatchMember built: the spine only.
        const legacy = await membersMod.resolveMemberLlmSelection(h.ctx, h.captain, {
            provider: row.provider,
            model: row.model,
            reasoningEffort: row.reasoningEffort,
            fallback: row.fallback,
        }, undefined);
        assert.equal(legacy.provider, 'p1', 'the old code resolved the DECLARED provider');
        assert.equal(legacy.model, 'm1', 'the old code resolved the DECLARED model');
        const fixed = membersMod.selectionFromMember(row);
        assert.equal(fixed.provider, 'p2', 'the shipped helper resolves the override');
        // Feed the old selection to the REAL spawnMember: this is the reported bug,
        // with no host boot needed. The escalation then records the declared route
        // and deletes the override, so the migrated route disappears.
        await membersMod.spawnMember(h.ctx, memberRuntime(), fakeSelections(), legacy, h.captain, team, team.members[0], '.agent-teams', undefined, 'go', undefined, undefined);
        const lost = team.members[0];
        assert.equal(startedRoute(h).provider, 'p1', 'the old selection starts the child on the declared route');
        assert.equal(lost.provider, 'p1', 'and the escalation overwrites provider with it');
        assert.equal(lost.routeOverride, undefined, 'while the override is deleted: the migrated route is gone');
    });
});

test('c2 neither dispatch nor approve reads the declared spine route (applies / delta bytes printed)', async () => {
    const source = await readFile(join(LIB, 'tools.js'), 'utf8');
    const spinePhrase = 'provider: member.provider, model: member.model, reasoningEffort: member.reasoningEffort, fallback: member.fallback,';
    // (a) The old one-liner must be gone EVERYWHERE, not just on the dispatch path:
    // approveStagedTeam used to read the same declared spine and so ignored a staged
    // member's routeOverride (regression fixed in t87). Zero occurrences is the point.
    const spineCount = source.split(spinePhrase).length - 1;
    assert.equal(spineCount, 0, 'the old spine-read one-liner must survive nowhere: neither dispatchMember nor approveStagedTeam may resolve from the declared spine route');
    // (b) Both paths must go through the one shared selector, and there must be at least two
    // call sites: dispatchMember (pre-spawn route) and approveStagedTeam (staged roster).
    const lineOf = (pos) => source.slice(0, pos).split('\n').length;
    const selectorSites = [];
    let cursor = source.indexOf('membersApi.selectionFromMember(');
    while (cursor !== -1) {
        selectorSites.push(cursor);
        cursor = source.indexOf('membersApi.selectionFromMember(', cursor + 1);
    }
    console.log('    selectionFromMember call sites: ' + selectorSites.map((pos) => 'line ' + lineOf(pos)).join(', '));
    assert.ok(selectorSites.length >= 2, 'dispatch and approve must both resolve through membersApi.selectionFromMember (found ' + selectorSites.length + ')');
    const dispatchAt = source.indexOf('async function dispatchMember(');
    const approveAt = source.indexOf('const approveStagedTeam = async');
    assert.notEqual(dispatchAt, -1, 'dispatchMember must still exist');
    assert.notEqual(approveAt, -1, 'approveStagedTeam must still exist');
    const dispatchWindow = source.slice(dispatchAt, source.indexOf('async function deliverToMember(', dispatchAt));
    const approveWindow = source.slice(approveAt, source.indexOf('const continueStagedPlanning = async', approveAt));
    // (c) Each call site sits INSIDE its own function and precedes the call that consumes
    // the selection. For dispatch the consumer is spawnMember: deliverToMember() is the
    // early return at the top of dispatchMember that keeps an ALREADY SPANNED member on its
    // live route, so it deliberately precedes any route resolution; require the selector to
    // precede both the spawn and the post-spawn escalation instead.
    assert.ok(dispatchWindow.includes('membersApi.selectionFromMember(member)'), 'dispatchMember must resolve the route through selectionFromMember');
    assert.ok(dispatchWindow.indexOf('membersApi.selectionFromMember(') < dispatchWindow.indexOf('spawnMember('), 'the dispatch selector must precede spawnMember');
    assert.ok(!dispatchWindow.includes('provider: member.provider, model: member.model'), 'dispatchMember must not build its selection from the declared spine');
    assert.ok(approveWindow.includes('membersApi.selectionFromMember(member)'), 'approveStagedTeam must resolve the route through selectionFromMember');
    assert.ok(approveWindow.indexOf('membersApi.selectionFromMember(') < approveWindow.indexOf('validateMemberLlmSelections('), 'the approve selector must precede the validation that used to reject the declared route');
    assert.ok(approveWindow.indexOf('membersApi.selectionFromMember(') < approveWindow.indexOf('member.provider = selection.provider'), 'the approve selector must precede the spine escalation');
    // Byte-level delta of the replacement: the shipped dispatch window vs the old one-liner.
    const endOfWindow = source.indexOf('}, signal);', dispatchAt);
    assert.notEqual(endOfWindow, -1, 'the resolveMemberLlmSelection call on the dispatch path was not found');
    const newWindow = source.slice(source.indexOf('membersApi.selectionFromMember(', dispatchAt), endOfWindow + '}, signal);'.length);
    const oldWindow = [
        'const selection = await resolveMemberLlmSelection(ctx, captain, {',
        '    provider: member.provider, model: member.model, reasoningEffort: member.reasoningEffort, fallback: member.fallback,',
        '}, signal);',
    ].join('\n');
    await mkdir(join(dirname(fileURLToPath(import.meta.url)), 'tmp'), { recursive: true });
    const dir = await mkdtemp(join(dirname(fileURLToPath(import.meta.url)), 'tmp', 't86-old-'));
    try {
        await writeFile(join(dir, 'old-dispatch.txt'), oldWindow);
        await writeFile(join(dir, 'new-dispatch.txt'), newWindow);
        const oldBytes = Buffer.byteLength(oldWindow);
        const newBytes = Buffer.byteLength(newWindow);
        console.log('applies=1 old_bytes=' + oldBytes + ' new_bytes=' + newBytes + ' delta_bytes=' + (newBytes - oldBytes));
        assert.ok(newBytes > oldBytes, 'the shipped window replaced a shorter one-liner');
        assert.ok(newWindow.includes('membersApi.selectionFromMember('));
        assert.ok(!newWindow.includes(spinePhrase), 'the dispatch window must not read the spine');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
        await assert.rejects(() => access(dir), 'the negative-control scratch directory must be cleaned up');
    }
});

test('c3 the driver no longer builds a selection from the spine on the dispatch path', async () => {
    const source = await readFile(join(LIB, 'tools.js'), 'utf8');
    const dispatchAt = source.indexOf('async function dispatchMember(');
    assert.notEqual(dispatchAt, -1);
    const window = source.slice(dispatchAt, dispatchAt + 6000);
    assert.ok(window.includes('membersApi.selectionFromMember(member)'), 'dispatchMember must use the shared selector');
    assert.ok(!window.includes('provider: member.provider, model: member.model'), 'the old spine-read one-liner must be gone');
    assert.ok(window.includes('defaultModel: config.memberModel'), 'the scheduler path passes the same defaults as activateMemberNow');
    assert.ok(window.includes('fallback: declaredRoute.fallback ?? member.fallback ?? config.fallback'), 'and the same fallback chain');
});

const failed = [];
for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index];
    try {
        await item.fn();
        console.log('ok ' + (index + 1) + ' ' + item.name);
    }
    catch (error) {
        failed.push(item.name);
        console.log('not ok ' + (index + 1) + ' ' + item.name);
        console.log('  ' + (error && error.message ? error.message : String(error)));
    }
}
console.log('# ' + (cases.length - failed.length) + '/' + cases.length + ' passed, ' + failed.length + ' failed');
process.exit(failed.length === 0 ? 0 : 1);
