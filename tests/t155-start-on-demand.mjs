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
import { readFile, writeFile, mkdir, mkdtemp, rm, stat, cp } from 'node:fs/promises';
import { existsSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
// t159: the library root is overridable so the SAME suite can be pointed at a modified
// COPY (tests/tmp/t159/lib-nolock) — that is how the negative control below proves the
// race case really is guarded by withTeamLock instead of passing for free.
const LIB = process.env.T155_LIB ?? join(REPO_ROOT, 'packages', 'dsh-agent-teams', 'lib');
const ONLY_RACE = process.env.T155_ONLY_RACE === '1';
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const indexMod = await import(libModule('index.js'));
const DTS = join(LIB, 'types', 'tools.d.ts');
const ERP_TEAM = 'E:/Project/ERP/.agent-teams/erp-erp/team.json';

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

const CATALOG = { p1: [{ id: 'm1' }], p2: [{ id: 'm2' }, { id: 'm2-high' }] };
const MEMBER_PROVIDER = 'spawn';
const NEW_ROUTE = { provider: 'p2', model: 'm2', reasoningEffort: 'high' };

/**
 * `raceWindowMs` widens the REAL critical section without touching lib/**: the delay sits in
 * a collaborator the plugin awaits INSIDE the lock (route resolution through ctx.llm), which
 * is exactly what a slow catalog lookup does in production. Two callers then overlap inside
 * the same section instead of racing only on the microsecond between two awaits.
 */
function makeHarness(workspace, options = {}) {
    const registered = new Map();
    const starts = [];
    const delay = async () => {
        if (options.raceWindowMs === undefined) return;
        await new Promise((resolve) => setTimeout(resolve, options.raceWindowMs));
    };
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
            async startActivation(spec) {
                // The window lives HERE on purpose: starting a session is the slow step of the
                // critical section (a real spawn takes hundreds of ms), and it happens AFTER the
                // live check while the durable row still carries the stale id. Two callers that
                // are not serialised therefore both pass the check and both spawn.
                await delay();
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

async function withTeam(team, fn, options = {}) {
    const workspace = await mkdtemp(join(tmpdir(), 't155-'));
    try {
        const h = makeHarness(workspace, options);
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

// ------------------------------------------------------------------ t159 (V26-F1): the lock must be OBSERVABLE
// The old race case (a6) had no window: two calls overlapped only between two awaits, so it passed
// even with withTeamLock removed (audit v158 had to inject a 40 ms sleep to make it red). A gate that
// cannot fail is not a gate, so a12 runs the same race with 40 ms of route resolution INSIDE the
// critical section, and a13 proves the difference on a COPY with the lock deleted.
// The window the ORIGINAL tree is raced with. The negative control turns it off in the child run
// because the copy carries its own, wider window INSIDE the critical section (like audit v158 did).
const RACE_WINDOW_MS = Number(process.env.T155_WINDOW ?? 40);
// Set by a12 when the REAL tree passed its race. a14 asserts it, so 'green on the original' is a
// checked fact in the same process rather than an assumption about the earlier line of output.
let realTreeRacePassed = false;
test('a12 RACE with a real window: 40ms of route resolution inside the critical section ⇒ exactly ONE session', async () => {
    await withTeam(teamFixture([{ ...DORMANT }]), async ({ h }) => {
        const results = await Promise.all([
            setRoute(h, { provider: 'p2', model: 'm2', start_if_needed: true }),
            setRoute(h, { provider: 'p2', model: 'm2', start_if_needed: true }),
        ]);
        console.log('      race window=' + RACE_WINDOW_MS + 'ms starts=' + h.starts.length + ' started=' + JSON.stringify(results.map((entry) => entry.value.started))
            + ' refused=' + JSON.stringify(results.map((entry) => entry.value.start_refused ?? null)));
        assert.equal(h.starts.length, 1, 'withTeamLock must serialise the two overlapping calls: got ' + h.starts.length + ' sessions (2 would mean the lock is gone); answers=' + JSON.stringify(results.map((entry) => entry.value)));
        const started = results.filter((entry) => entry.value.started === true).length;
        assert.equal(started, 1, 'exactly one call reports that it started the member, got ' + started + ' (' + JSON.stringify(results.map((entry) => entry.value.started)) + ')');
    }, { raceWindowMs: RACE_WINDOW_MS });
    realTreeRacePassed = true;
});

// ------------------------------------------------------------------ the two guards, measured
// Removing withTeamLock does NOT by itself produce two sessions: members.js keeps a SECOND,
// independent mutex (the pending selection key, members.js:893-907) that refuses a concurrent
// start with 'member model selection is already pending'. a13 measures exactly that, so the tree
// cannot claim the lock is the only thing standing between a race and a duplicate session; a14
// removes BOTH guards and demands two sessions — which is what makes the race case non-vacuous.
async function copyLibWith(dir, name, patches) {
    const target = join(dir, name);
    await rm(target, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    await cp(LIB, target, { recursive: true });
    const modulesLink = join(dir, 'node_modules');
    if (!existsSync(modulesLink)) {
        symlinkSync(join(REPO_ROOT, 'packages', 'dsh-agent-teams', 'node_modules'), modulesLink, 'junction');
    }
    for (const patch of patches) {
        const file = join(target, patch.file);
        const before = await readFile(file, 'utf8');
        const hits = before.split(patch.from).length - 1;
        assert.equal(hits, 1, 'patch ' + patch.name + ' must hit exactly once in ' + patch.file + ', hit ' + hits);
        await writeFile(file, before.replace(patch.from, patch.to));
    }
    return target;
}
const LOCK_FROM = 'return await withTeamLock(teamLockKey(root, request.teamId), async () => {';
const LOCK_TO = 'return await (async () => {';
const LOCK_TAIL_FROM = '    });' + String.fromCharCode(10) + '}' + String.fromCharCode(10) + 'function currentMemberRoute(';
const LOCK_TAIL_TO = '    })();' + String.fromCharCode(10) + '}' + String.fromCharCode(10) + 'function currentMemberRoute(';
/**
 * Run THIS file against a given library copy, race case only.
 *
 * `windowMs` decides WHICH guard is under observation, instead of leaving the outcome to filesystem
 * timing. With the harness window ON (a13) the first spawn is still in flight when the second
 * arrives, so the pending guard (members.js:893-907) refuses it — deterministic. With the window
 * OFF and BOTH guards gone (a14) the copy's own 80 ms pause lets two sessions through. Measured the
 * hard way: the same lockless copy produced one session in one run and two in the next, which is
 * why the window is pinned per case.
 */
function runRaceOnCopy(libDir, windowMs) {
    const run = spawnSync(process.execPath, [join(HERE, 't155-start-on-demand.mjs')], {
        env: { ...process.env, T155_LIB: libDir, T155_ONLY_RACE: '1', T155_WINDOW: String(windowMs) },
        encoding: 'utf8',
        timeout: 180000,
    });
    return { status: run.status, output: String(run.stdout ?? '') + String(run.stderr ?? '') };
}

test('a13 CORRECT EXPECTATION: removing withTeamLock alone STILL yields ONE session — the SECOND guard (withPending, lib/members.js:893-907) holds, so this case PASSES only by proving that guard refused the second start', async () => {
    const dir = join(REPO_ROOT, 'tests', 'tmp', 't160');
    const target = await copyLibWith(dir, 'lib-nolock', [
        { name: 'remove withTeamLock', file: 'tools.js', from: LOCK_FROM, to: LOCK_TO },
        { name: 'close the IIFE', file: 'tools.js', from: LOCK_TAIL_FROM, to: LOCK_TAIL_TO },
        // Audit v158's mutation shape: a pause inside the critical section, so both callers get
        // past the live check before either of them can write the row.
        { name: 'pause after readTeam', file: 'tools.js', from: '        const team = await readTeam(root, request.teamId);', to: '        const team = await readTeam(root, request.teamId);' + String.fromCharCode(10) + '        await new Promise((resolve) => setTimeout(resolve, 80));' },
    ]);
    const run = runRaceOnCopy(target, 40);
    assert.equal(run.status, 0, 'the lockless copy must still pass a12 while the pending guard stands, got exit ' + run.status + ' :: ' + run.output.slice(0, 500));
    assert.match(run.output, /starts=1/, 'exactly one session is recorded on the lockless copy, got: ' + run.output.slice(0, 400));
    // The point of a13 is not 'the copy is green' but WHICH guard kept it green. The child prints
    // the refusal it received; it must name the pending selection key, i.e. the second mutex.
    assert.match(run.output, /already pending/, 'the refusal must come from the SECOND guard (withPending: "member model selection is already pending"), not from anything else, got: ' + run.output.slice(0, 600));
    console.log('      lockless copy: exit=' + run.status
        + ' :: ' + (run.output.match(/starts=\d+ started=\[[^\]]*\] refused=\[[^\]]*\]/) ?? [''])[0]
        + ' => the second guard (withPending, lib/members.js:893-907) is what kept it at one session');
});

test('a14 NEGATIVE CONTROL: with BOTH guards gone the same race opens TWO sessions — red on the copy, green on the original tree', async () => {
    const dir = join(REPO_ROOT, 'tests', 'tmp', 't160');
    assert.equal(realTreeRacePassed, true, 'a12 must already have passed on the REAL tree in this run; the negative control is meaningless otherwise');
    const target = await copyLibWith(dir, 'lib-both', [
        { name: 'remove withTeamLock', file: 'tools.js', from: LOCK_FROM, to: LOCK_TO },
        { name: 'close the IIFE', file: 'tools.js', from: LOCK_TAIL_FROM, to: LOCK_TAIL_TO },
        { name: 'pause after readTeam', file: 'tools.js', from: '        const team = await readTeam(root, request.teamId);', to: '        const team = await readTeam(root, request.teamId);' + String.fromCharCode(10) + '        await new Promise((resolve) => setTimeout(resolve, 80));' },
        // The second guard: the pending selection key that refuses a concurrent start.
        { name: 'drop the pending guard', file: 'members.js', from: '            if (pending.has(key)) {', to: '            if (false && pending.has(key)) {' },
    ]);
    const run = runRaceOnCopy(target, 0);
    assert.equal(run.status, 1, 'with both guards gone the race case MUST fail, got exit ' + run.status + ' :: ' + run.output.slice(0, 500));
    assert.match(run.output, /FAIL a12/, 'the failing case must be a12, got: ' + run.output.slice(0, 400));
    assert.match(run.output, /got 2 sessions/, 'the failure must name the two sessions, got: ' + run.output.slice(0, 600));
    assert.match(run.output, /starts=2/, 'the child must record exactly two starts, got: ' + run.output.slice(0, 600));
    console.log('      both guards gone: exit=' + run.status + ' (original tree: PASS a12, realTreeRacePassed=true) :: '
        + (run.output.match(/got 2 sessions[^|]*/) ?? [''])[0].slice(0, 160));
});
let failures = 0;
// The negative control re-runs THIS file against a lockless copy; it must run only the race case,
// otherwise the child would recurse into a13 forever.
const selected = ONLY_RACE ? cases.filter((entry) => entry.name.startsWith('a12')) : cases;
for (const entry of selected) {
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
console.log('# ' + (selected.length - failures) + '/' + selected.length + ' passed, ' + failures + ' failed');
process.exit(failures === 0 ? 0 : 1);