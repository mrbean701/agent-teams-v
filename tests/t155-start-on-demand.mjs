#!/usr/bin/env node
// t155 — start-on-demand (OPT-IN) for a member whose durable id outlived its session.
//
// The problem this pins down: every roster row written by an earlier Host run keeps its
// `id`, and `dispatchMember` answers such a row with `deliverToMember` (tools.js:544-545)
// instead of starting it. So a route change on the ERP roster is `durable-only`: the file
// says the member runs on the new model, no session runs at all, and the operator reads that
// as 'the change did nothing'. `start_if_needed` is the opt-in that closes that gap without
// touching the default path.
//
// Run: node tests/t155-start-on-demand.mjs   (no Host boot: the subagent provider is stubbed)
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const LIB = join(REPO_ROOT, 'packages', 'dsh-agent-teams', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const indexMod = await import(libModule('index.js'));
const DTS = join(LIB, 'types', 'tools.d.ts');
const ERP_TEAM = 'E:/Project/ERP/.agent-teams/erp-erp/team.json';

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

const CATALOG = { p1: [{ id: 'm1' }], p2: [{ id: 'm2' }, { id: 'm2-high' }] };
const MEMBER_PROVIDER = 'spawn';
const NEW_ROUTE = { provider: 'p2', model: 'm2', reasoningEffort: 'high' };

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
        ctx: { tools: { view: () => ({ restrictableNames: new Set(['agent_teams_claim_task', 'subagent', 'send_message']) }) } },
    };
    let childSeq = 0;
    // The Host keeps live children addressable by id; startMemberOnDemandNow asks this
    // registry before starting anything, so a stub that always answers undefined would
    // make the double-spawn guard untestable.
    const liveChildren = new Set();
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        tools: { register(def) { registered.set(def.name, def); } },
        agents: {
            get(id) {
                if (id === 'sess-captain') return captain;
                return liveChildren.has(id) ? { id, status: 'working' } : undefined;
            },
            list() { return []; },
        },
        subagents: {
            followup() { return Promise.resolve('msg-legacy'); },
            [Symbol.for('dsh.subagent.deliverPrompt')]() { return Promise.resolve('deliver'); },
            sendMessage() { return Promise.resolve('msg-send'); },
            startActivation(spec) {
                starts.push(spec);
                childSeq += 1;
                const childId = 'child-' + childSeq;
                liveChildren.add(childId);
                return Promise.resolve({ childId, result: Promise.resolve({ text: 'ok' }) });
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

const DORMANT = { id: 'dead-session-1', name: 'alice', provider: 'p1', model: 'm1', joinedAt: 1, status: 'idle' };
const teamFixture = (members, extra = {}) => ({
    id: 'team-t155',
    name: 'TEAM-T155',
    captainSessionId: 'sess-captain',
    createdAt: 1,
    taskSeq: 0,
    phase: 'running',
    members,
    tasks: [],
    ...extra,
});

async function withTeam(team, fn) {
    const workspace = await mkdtemp(join(tmpdir(), 't155-'));
    try {
        const h = makeHarness(workspace);
        indexMod.apply(h.ctx, baseConfig());
        const root = join(workspace, '.agent-teams', team.id);
        await mkdir(root, { recursive: true });
        await writeFile(join(root, 'team.json'), JSON.stringify(team, null, 2));
        return await fn({ workspace, h, teamPath: join(root, 'team.json') });
    }
    finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

const teamOf = async (teamPath) => JSON.parse(await readFile(teamPath, 'utf8'));
const memberOf = async (teamPath, name) => (await teamOf(teamPath)).members.find((m) => m.name === name);
/** Call the REAL tool; `start_if_needed` is the only thing that varies between cases. */
async function setRoute(h, args, signal) {
    const def = h.registered.get('agent_teams_set_member_route');
    assert.ok(def, 'agent_teams_set_member_route must be registered');
    const value = await def.execute({ member_name: 'alice', ...args }, { agent: h.captain, signal });
    return { value, text: def.output.render({}, value)[0].text };
}
const startedRoute = (h, index = 0) => {
    assert.ok(h.starts[index], 'expected one startActivation call, none was recorded');
    return h.starts[index].request.agentOptions;
};

// ------------------------------------------------------------------ A1: the surface
test('a1 start_if_needed is a boolean parameter of the tool and is NOT required (default false)', async () => {
    await withTeam(teamFixture([{ ...DORMANT }]), async ({ h }) => {
        const def = h.registered.get('agent_teams_set_member_route');
        const schema = def.parameters;
        const param = schema.properties.start_if_needed;
        assert.ok(param, 'the tool must declare start_if_needed (declared: ' + Object.keys(schema.properties).join(', ') + ')');
        assert.equal(param.type, 'boolean');
        assert.equal((schema.required ?? []).includes('start_if_needed'), false, 'the flag must be optional so an old call keeps its behaviour');
        assert.match(param.description, /Default false/);
    });
});

test('a2 the type surface declares the flag, the runtime bridge and the result shape', async () => {
    const dts = await readFile(DTS, 'utf8');
    assert.match(dts, /startIfNeeded\?: boolean;/);
    assert.match(dts, /startMemberOnDemand\(captain: Agent/);
    assert.match(dts, /export interface MemberStartOnDemandResult \{/);
    assert.match(dts, /readonly started: boolean;/);
});

// ------------------------------------------------------------------ A1 negative: no flag, no spawn
test('a3 DEFAULT (no flag): a dormant member is durable-only — no session starts and the answer is the old one', async () => {
    await withTeam(teamFixture([{ ...DORMANT }]), async ({ h, teamPath }) => {
        const { value, text } = await setRoute(h, { provider: 'p2', model: 'm2' });
        assert.equal(h.starts.length, 0, 'the default path must not start anything');
        assert.equal(value.started, undefined, 'no start outcome on a call that did not ask to start');
        assert.equal(value.applied, 'durable-only');
        assert.match(text, /— saved; it takes effect the next time this member starts\.$/);
        assert.doesNotMatch(text, /started it now|was NOT started/);
        const member = await memberOf(teamPath, 'alice');
        assert.equal(member.routeOverride.provider, 'p2');
        assert.equal(member.id, 'dead-session-1', 'the stale id is untouched by the default path');
    });
});

// ------------------------------------------------------------------ A2: the flag starts it
test('a4 FLAG: the dormant member starts on the route just set, and the answer names the session', async () => {
    await withTeam(teamFixture([{ ...DORMANT }]), async ({ h, teamPath }) => {
        const { value, text } = await setRoute(h, { provider: 'p2', model: 'm2', reasoning_effort: 'high', start_if_needed: true });
        assert.equal(h.starts.length, 1, 'exactly one session should start');
        const route = startedRoute(h);
        assert.equal(route.provider, 'p2', 'the child must start on the override route, not the declared one');
        assert.equal(route.model, 'm2');
        assert.equal(route.reasoningEffort, 'high');
        assert.equal(value.started, true);
        assert.equal(value.child_id, 'child-1');
        assert.equal(value.applied, 'live-and-durable');
        assert.match(text, /route is now p2\/m2, reasoning high/);
        assert.match(text, /session child-1/);
        assert.match(text, /started it now on this route/);
        const member = await memberOf(teamPath, 'alice');
        assert.equal(member.id, 'child-1', 'the durable row now names the live session');
    });
});

test('a5 a member that already has a live session is not started a second time', async () => {
    await withTeam(teamFixture([{ ...DORMANT }]), async ({ h, teamPath }) => {
        await setRoute(h, { provider: 'p2', model: 'm2', reasoning_effort: 'high', start_if_needed: true });
        const second = await setRoute(h, { provider: 'p2', model: 'm2', reasoning_effort: 'high', start_if_needed: true });
        assert.equal(h.starts.length, 1, 'the second call must NOT open a second session');
        assert.equal(second.value.started, false);
        assert.match(second.text, /already has a live session \(child-1\)/);
        assert.equal((await memberOf(teamPath, 'alice')).id, 'child-1');
    });
});

test('a6 two CONCURRENT flag calls produce exactly one session (withTeamLock serialises them)', async () => {
    await withTeam(teamFixture([{ ...DORMANT }]), async ({ h }) => {
        const results = await Promise.all([
            setRoute(h, { provider: 'p2', model: 'm2', start_if_needed: true }),
            setRoute(h, { provider: 'p2', model: 'm2', start_if_needed: true }),
        ]);
        assert.equal(h.starts.length, 1, 'a race must not open two sessions, got ' + h.starts.length);
        const startedCount = results.filter((r) => r.value.started === true).length;
        const refusedCount = results.filter((r) => r.value.started === false).length;
        assert.equal(startedCount, 1, 'exactly one call reports that it started the member');
        assert.equal(refusedCount, 1, 'the other call reports the refusal (already live)');
    });
});

// ------------------------------------------------------------------ A5: guards
const guardCase = (title, members, extra, expected) => test(title, async () => {
    await withTeam(teamFixture(members, extra), async ({ h, teamPath }) => {
        const { value, text } = await setRoute(h, { provider: 'p2', model: 'm2', start_if_needed: true });
        assert.equal(h.starts.length, 0, 'a guard must refuse the start');
        assert.equal(value.started, false);
        assert.match(text, expected);
        const member = await memberOf(teamPath, 'alice');
        assert.equal(member.routeOverride.provider, 'p2', 'the route change itself still lands');
    });
});
guardCase('a7 halted team: no start, and the answer says why', [{ ...DORMANT }], { halted: true }, /is halted; resume it before starting a member/);
guardCase('a8 staged team: no start, and the answer says why', [{ ...DORMANT }], { phase: 'staged' }, /is still staged; members start only after approval/);
test('a9 stopping member: refused before the flag, verbatim, and nothing starts', async () => {
    await withTeam(teamFixture([{ ...DORMANT, stopping: true }]), async ({ h }) => {
        await assert.rejects(
            () => setRoute(h, { provider: 'p2', model: 'm2', start_if_needed: true }),
            /agent-teams: member "alice" is stopping; its route cannot be changed/,
        );
        assert.equal(h.starts.length, 0, 'nothing may start for a stopping member');
    });
});

// ------------------------------------------------------------------ A3: the ERP roster, on a COPY
test('a10 ERP copy: a working row with a durable id starts on the new route; the ORIGINAL team.json is untouched', async () => {
    const before = await stat(ERP_TEAM);
    const beforeBytes = await readFile(ERP_TEAM);
    const beforeSha = createHash('sha256').update(beforeBytes).digest('hex');
    const roster = JSON.parse(beforeBytes.toString('utf8'));
    assert.equal(roster.members.length, 14, 'the ERP roster has 14 rows');
    assert.equal(roster.members.filter((m) => m.status === 'removed').length, 7, '7 of them are removed');
    const target = roster.members.find((m) => m.name === 'qa-do-2');
    assert.ok(target && target.id !== '' && target.status === 'working', 'qa-do-2 is a live-status row with a durable id');
    const workspace = await mkdtemp(join(tmpdir(), 't155-erp-'));
    try {
        const h = makeHarness(workspace);
        indexMod.apply(h.ctx, baseConfig());
        const root = join(workspace, '.agent-teams', roster.id);
        await mkdir(root, { recursive: true });
        const copyPath = join(root, 'team.json');
        // Only the ROSTER is borrowed: the copied team has to name this test's captain,
        // otherwise the captain gate refuses the call before the flag is ever read.
        await writeFile(copyPath, JSON.stringify({ ...roster, captainSessionId: 'sess-captain' }, null, 2));
        const def = h.registered.get('agent_teams_set_member_route');
        const value = await def.execute({ member_name: 'qa-do-2', provider: 'p2', model: 'm2', reasoning_effort: 'high', start_if_needed: true }, { agent: h.captain, signal: undefined });
        const text = def.output.render({}, value)[0].text;
        assert.equal(value.started, true, 'the ERP row must actually start: ' + text);
        assert.equal(h.starts.length, 1);
        const route = startedRoute(h);
        assert.equal(route.provider + '/' + route.model, 'p2/m2', 'started on the NEW route');
        const after = await memberOf(copyPath, 'qa-do-2');
        assert.equal(after.id, value.child_id, 'the copy now carries the new session id');
        // spawnMember ESCALATES the override into provider/model and drops routeOverride —
        // documented in members.js:1078 and the activateMemberNow docstring: a leftover
        // override under a live descriptor makes the cold-resume guard reject the resume.
        assert.equal(after.provider + '/' + after.model, 'p2/m2', 'the escalation records the live route durably');
        assert.equal(after.routeOverride, undefined, 'the override is promoted, not left behind');
        assert.equal(after.status, 'working', 'the row keeps reporting the status it had');
        const afterBytes = await readFile(ERP_TEAM);
        const afterStat = await stat(ERP_TEAM);
        assert.equal(createHash('sha256').update(afterBytes).digest('hex'), beforeSha, 'the ERP ORIGINAL must not change');
        assert.equal(afterBytes.length, beforeBytes.length);
        assert.equal(afterStat.mtimeMs, before.mtimeMs, 'not even the mtime may move');
    }
    finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

test('a11 the flag is what makes the difference: the same ERP row without it stays durable-only', async () => {
    const roster = JSON.parse((await readFile(ERP_TEAM, 'utf8')));
    const workspace = await mkdtemp(join(tmpdir(), 't155-erp2-'));
    try {
        const h = makeHarness(workspace);
        indexMod.apply(h.ctx, baseConfig());
        const root = join(workspace, '.agent-teams', roster.id);
        await mkdir(root, { recursive: true });
        const copyPath = join(root, 'team.json');
        await writeFile(copyPath, JSON.stringify({ ...roster, captainSessionId: 'sess-captain' }, null, 2));
        const def = h.registered.get('agent_teams_set_member_route');
        const value = await def.execute({ member_name: 'qa-do-2', provider: 'p2', model: 'm2' }, { agent: h.captain, signal: undefined });
        assert.equal(h.starts.length, 0, 'without the flag nothing starts');
        assert.equal(value.applied, 'durable-only');
        const after = await memberOf(copyPath, 'qa-do-2');
        assert.equal(after.id, '0e39bbeb-1e88-4f4a-84a4-8617bfd67771', 'the durable id is untouched');
        assert.equal(after.routeOverride.source, 'captain');
        assert.equal(after.routeOverride.provider + '/' + after.routeOverride.model, 'p2/m2');
    }
    finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

let failures = 0;
for (const entry of cases) {
    try {
        await entry.fn();
        console.log('PASS ' + entry.name);
    }
    catch (error) {
        failures += 1;
        console.log('FAIL ' + entry.name);
        console.log('      ' + String(error && error.message ? error.message : error).split('\n').slice(0, 6).join(' | '));
    }
}
console.log('');
console.log('# ' + (cases.length - failures) + '/' + cases.length + ' passed, ' + failures + ' failed');
process.exit(failures === 0 ? 0 : 1);
