#!/usr/bin/env node
/**
 * t15 — a manual add starts the member inside the same turn.
 *
 * Run from the repository root:
 *
 *   node tests/t15-activate-member.mjs
 */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const libRoot = new URL('../packages/dsh-agent-teams/lib/', import.meta.url);
const membersApi = await import(new URL('members.js', libRoot).href);
const membersSource = await readFile(new URL('members.js', libRoot), 'utf8');
const toolsSource = await readFile(new URL('tools.js', libRoot), 'utf8');
const policiesApi = await import(new URL('tool-policies.js', libRoot).href);

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

const START_PROVIDER = 'subagent-spawn';
const WORKSPACE = '/workspace/not-read';
const CATALOG = { p1: [{ id: 'm1' }, { id: 'm3' }], p2: [{ id: 'm2' }], p3: [{ id: 'm3' }] };

function makeHost(options = {}) {
    const starts = [];
    let attempts = 0;
    const runtime = {
        getProvider: (name) => (name === START_PROVIDER ? { name, prepareContinuable: () => undefined } : undefined),
        list: () => [START_PROVIDER],
        startActivation: async (spec) => {
            attempts += 1;
            if (options.failFirst !== undefined && attempts === 1)
                throw options.failFirst;
            if (options.failAlways !== undefined)
                throw options.failAlways;
            starts.push(spec);
            return { childId: 'child-' + attempts, result: Promise.resolve(undefined) };
        },
    };
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        llm: {
            listModels: async (provider) => CATALOG[provider] ?? [],
            resolveCallConfig: async (config) => config,
        },
        subagents: runtime,
    };
    return { ctx, starts, attempts: () => attempts };
}

function makeCaptain() {
    return {
        id: 'sess-captain',
        options: { provider: 'p1', model: 'm1' },
        session: { header: { cwd: WORKSPACE }, requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }) },
        ctx: { tools: { view: () => ({ restrictableNames: new Set(['agent_teams_claim_task', 'agent_teams_send_message', 'subagent', 'send_message']) }) } },
    };
}

function makeSelections() {
    const pending = [];
    const live = new Map();
    return {
        stateDir: '.agent-teams',
        pending,
        live,
        isPendingMember: () => false,
        async withPending(parentSessionId, label, selection, operation, setup) {
            pending.push({ parentSessionId, label, selection, setup });
            return await operation();
        },
        setLiveRoute(agentId, selection) {
            live.set(agentId, selection);
            return true;
        },
        liveRoute: (agentId) => live.get(agentId),
        liveChildIds: () => [...live.keys()],
    };
}

const makeTeam = () => ({
    id: 'team-t15',
    name: 'Team T15',
    description: 'prove the manual add starts its member',
    captainSessionId: 'sess-captain',
    createdAt: 1,
    taskSeq: 0,
    phase: 'running',
    members: [],
    tasks: [],
});
const makeMember = (over = {}) => ({ id: '', name: 'alice', provider: 'p1', model: 'm1', reasoningEffort: 'low', joinedAt: 1, status: 'idle', ...over });
/**
 * The knobs tools.js hands the runtime hook. `toolPolicies` is deliberately
 * absent by default: that is the older-host shape, where a policy member must
 * still fail loud. A case that needs the table passes it explicitly.
 */
const runtimeConfig = (over = {}) => ({ provider: START_PROVIDER, maxDepth: 0, executionPrompt: 'keep going', fallback: undefined, memberModel: undefined, memberLlmProvider: undefined, ...over });

/** Balanced text inside the parentheses that follow a marker that ends with '('. */
function callArguments(source, marker) {
    const at = source.indexOf(marker);
    assert.notEqual(at, -1, 'call site not found: ' + marker);
    let depth = 0;
    let out = '';
    for (let index = at + marker.length - 1; index < source.length; index += 1) {
        const ch = source[index];
        if (ch === '(') {
            depth += 1;
            if (depth === 1)
                continue;
        }
        if (ch === ')') {
            depth -= 1;
            if (depth === 0)
                return out;
        }
        out += ch;
    }
    throw new Error('unbalanced parentheses after ' + marker);
}

/** Split one argument/parameter list on top-level commas. */
function splitTopLevel(list) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const ch of list) {
        if (ch === '(' || ch === '[' || ch === '{')
            depth += 1;
        else if (ch === ')' || ch === ']' || ch === '}')
            depth -= 1;
        if (ch === ',' && depth === 0) {
            parts.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim() !== '')
        parts.push(current.trim());
    return parts;
}

/** The body of one exported function declaration, found by brace matching. */
function functionBody(source, marker) {
    const at = source.indexOf(marker);
    assert.notEqual(at, -1, 'function not found: ' + marker);
    const open = source.indexOf('{', at + marker.length);
    assert.notEqual(open, -1, 'opening brace not found for ' + marker);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '{')
            depth += 1;
        else if (source[index] === '}') {
            depth -= 1;
            if (depth === 0)
                return source.slice(open, index + 1);
        }
    }
    throw new Error('unbalanced braces for ' + marker);
}

test('members.js exports activateMemberNow as a function', () => {
    assert.equal(typeof membersApi.activateMemberNow, 'function');
});

test('membersFunction resolves the hook instead of undefined', () => {
    // Exactly the expression tools.js:2724-2727 evaluates.
    const candidate = membersApi['activateMemberNow'];
    const resolved = typeof candidate === 'function' ? candidate : undefined;
    assert.equal(typeof resolved, 'function', 'the manual add falls back to the scheduler without this');
});

test('tools.js calls the hook in the signature parameter order', () => {
    const params = splitTopLevel(/export async function activateMemberNow\(([^)]*)\)/.exec(membersSource)[1]);
    const args = splitTopLevel(callArguments(toolsSource, 'await activateMemberNow('));
    const expected = [
        ['ctx', 'ctx'],
        ['config', 'memberRuntime(config)'],
        ['selections', 'memberSelections'],
        ['captain', 'captain'],
        ['team', 'fresh'],
        ['member', 'member'],
        ['resolvedFilter', 'member.toolFilter'],
        ['initialPrompt', 'memberWelcome(fresh, member.name)'],
        ['signal', 'signal'],
    ];
    assert.deepEqual(params, expected.map(([param]) => param));
    assert.deepEqual(args, expected.map(([, arg]) => arg));
});

test('tools.js marks spawned=true only after the awaited hook', () => {
    const callAt = toolsSource.indexOf('await activateMemberNow(');
    const flagAt = toolsSource.indexOf('spawned = true;', callAt);
    assert.notEqual(flagAt, -1, 'spawned = true must follow the hook call');
    assert.ok(callAt < flagAt);
    assert.ok(toolsSource.indexOf('catch (error) {', callAt) !== -1, 'a thrown start must land in spawnError');
    assert.match(toolsSource, /if \(created\.spawned !== true\) \{\n\s*if \(typeof kick === 'function'\)\n\s*await kick\(/);
    assert.match(toolsSource, /\n\s*spawned,\n\s*\};/);
});

test('activateMemberNow never writes the team itself', () => {
    const body = functionBody(membersSource, 'export async function activateMemberNow(');
    assert.ok(!body.includes('writeTeam('), 'the caller owns the durable write');
    assert.ok(!body.includes('withTeamLock('), 'the caller already holds the team lock');
});

test('tools.js memberRuntime hands the policy table to the runtime', () => {
    // The hook can only compute the owner-safe subset when it receives the
    // table, so the one field tools.js:2713-2716 adds is part of the contract.
    const body = functionBody(toolsSource, 'function memberRuntime(config)');
    assert.ok(body.includes('toolPolicies: config.toolPolicies'), 'memberRuntime must forward the configured policies');
});

test('an already started row is reported unchanged, with no second start', async () => {
    const host = makeHost();
    const member = makeMember({ id: 'child-existing' });
    const id = await membersApi.activateMemberNow(host.ctx, runtimeConfig(), makeSelections(), makeCaptain(), makeTeam(), member, undefined, 'welcome', undefined);
    assert.equal(id, 'child-existing');
    assert.equal(host.attempts(), 0);
    assert.deepEqual(host.starts, []);
});

test('a manual add fills member.id and starts exactly one child', async () => {
    const host = makeHost();
    const member = makeMember();
    const captain = makeCaptain();
    const selections = makeSelections();
    const id = await membersApi.activateMemberNow(host.ctx, runtimeConfig(), selections, captain, makeTeam(), member, undefined, 'welcome text', undefined);
    assert.equal(id, 'child-1');
    assert.equal(member.id, 'child-1');
    assert.equal(host.starts.length, 1);
    const started = host.starts[0];
    assert.equal(started.provider, START_PROVIDER);
    assert.equal(started.label, 'agent-teams:team-t15:alice');
    assert.equal(started.request.parent, captain);
    assert.equal(started.request.prompt[0].text, 'welcome text');
    assert.equal(started.request.agentOptions.provider, 'p1');
    assert.equal(started.request.agentOptions.model, 'm1');
    assert.equal(String(started.request.agentOptions.reasoningEffort), 'low');
    // A managed activation applies the filter through the durable runtime setup.
    assert.ok(member.runtimeSetup.toolFilter.deny.includes('send_message'));
    assert.equal(started.request.toolFilter, undefined, 'the managed path moves persona/filter out of the request');
    assert.equal(selections.pending[0].selection.provider, 'p1');
});

test('the member persona names this team state directory', async () => {
    const host = makeHost();
    const member = makeMember();
    await membersApi.activateMemberNow(host.ctx, runtimeConfig(), makeSelections(), makeCaptain(), makeTeam(), member, undefined, undefined, undefined);
    assert.ok(member.runtimeSetup !== undefined);
    assert.match(member.runtimeSetup.persona, /\.agent-teams\/team-t15\//);
    assert.match(member.runtimeSetup.persona, /Team goal: prove the manual add starts its member/);
});

test('a declared override decides the start route and is escalated away', async () => {
    const host = makeHost();
    const member = makeMember({ routeOverride: { provider: 'p3', model: 'm3', reasoningEffort: 'high', source: 'captain', at: 5 } });
    await membersApi.activateMemberNow(host.ctx, runtimeConfig(), makeSelections(), makeCaptain(), makeTeam(), member, undefined, undefined, undefined);
    assert.equal(host.starts[0].request.agentOptions.provider, 'p3');
    assert.equal(host.starts[0].request.agentOptions.model, 'm3');
    assert.equal(String(host.starts[0].request.agentOptions.reasoningEffort), 'high');
    // spawnMember escalates the override into the descriptor route and drops it:
    // a leftover override would fail the cold-resume descriptor guard.
    assert.equal(member.provider, 'p3');
    assert.equal(member.model, 'm3');
    assert.equal(member.reasoningEffort, 'high');
    assert.equal('routeOverride' in member, false);
});

test('an active fallback outranks an override and drops its effort', async () => {
    const host = makeHost();
    const member = makeMember({
        fallbackActive: true,
        activeProvider: 'p2',
        activeModel: 'm2',
        routeOverride: { provider: 'p3', model: 'm3', reasoningEffort: 'high', source: 'captain', at: 5 },
    });
    await membersApi.activateMemberNow(host.ctx, runtimeConfig(), makeSelections(), makeCaptain(), makeTeam(), member, undefined, undefined, undefined);
    const started = host.starts[0].request.agentOptions;
    assert.equal(started.provider, 'p2');
    assert.equal(started.model, 'm2');
    assert.equal(started.reasoningEffort, undefined, 'an effort id of the primary route must not travel to the fallback');
});

test('a failed start throws and leaves the row without a child id', async () => {
    const host = makeHost({ failAlways: new Error('spawn refused by the host') });
    const member = makeMember();
    await assert.rejects(
        membersApi.activateMemberNow(host.ctx, runtimeConfig(), makeSelections(), makeCaptain(), makeTeam(), member, undefined, undefined, undefined),
        /spawn refused by the host/,
    );
    assert.equal(member.id, '', 'tools.js records spawnError for the row that stayed unstarted');
    assert.equal(member.status, 'idle');
});

test('a policy member relaxes the same deny names as the scheduler path', async () => {
    // tools.js memberRelaxableDeny is the scheduler path this hook must match.
    // The identical expression in both files is what makes the two agree on
    // "same input, same relaxable set" without duplicating the helper logic.
    const sameCall = /memberSpawnRelaxableDeny\(optionalToolPolicy\(config\.toolPolicies, member\.toolPolicy\), true\)/;
    assert.match(toolsSource, sameCall, 'the scheduler path changed: re-derive the hook against it');
    assert.match(membersSource, sameCall, 'the manual add must compute the same owner-safe subset');

    const table = { restricted: { deny: ['send_message'] } };
    const expected = policiesApi.memberSpawnRelaxableDeny(policiesApi.optionalToolPolicy(table, 'restricted'), true);
    assert.ok(expected.includes('subagent'), 'a built-in depth entry the owner did not declare stays relaxable');
    assert.equal(expected.includes('send_message'), false, 'an owner-declared deny name is never relaxable');

    // The host names the offending tool: the relaxable name is dropped and the
    // start retried — exactly what the scheduler path does for the same input.
    const unknownTool = new Error('tools.restrict() names unknown global tool "subagent"; known global tools: agent_teams_claim_task');
    const host = makeHost({ failFirst: unknownTool });
    const member = makeMember({ toolPolicy: 'restricted', toolFilter: { deny: ['send_message', 'subagent'] } });
    const id = await membersApi.activateMemberNow(host.ctx, runtimeConfig({ toolPolicies: table }), makeSelections(), makeCaptain(), makeTeam(), member, member.toolFilter, undefined, undefined);
    assert.equal(id, 'child-2', 'the retry starts the member the first attempt could not');
    assert.equal(host.attempts(), 2);
    assert.ok(member.toolFilter.deny.includes('send_message'), 'the owner-declared deny survives the retry');
    assert.equal(member.toolFilter.deny.includes('subagent'), false, 'only the built-in name the host rejected is dropped');
});

test('an owner-declared deny name is never relaxed by the retry', async () => {
    const unknownTool = new Error('tools.restrict() names unknown global tool "send_message"; known global tools: agent_teams_claim_task');
    const host = makeHost({ failFirst: unknownTool });
    const table = { restricted: { deny: ['send_message'] } };
    const member = makeMember({ toolPolicy: 'restricted', toolFilter: { deny: ['send_message', 'subagent'] } });
    await assert.rejects(
        membersApi.activateMemberNow(host.ctx, runtimeConfig({ toolPolicies: table }), makeSelections(), makeCaptain(), makeTeam(), member, member.toolFilter, undefined, undefined),
        /unknown global tool/,
    );
    assert.equal(host.attempts(), 1, 'a policy that cannot be applied fails loud instead of drifting');
    assert.equal(member.id, '');
});

test('a selected policy id the deployment no longer declares relaxes nothing', async () => {
    const unknownTool = new Error('tools.restrict() names unknown global tool "subagent"; known global tools: agent_teams_claim_task');
    const host = makeHost({ failFirst: unknownTool });
    // optionalToolPolicy returns undefined for an id this table no longer holds,
    // so memberSpawnRelaxableDeny(policy, true) yields an empty set: fail loud.
    const member = makeMember({ toolPolicy: 'gone', toolFilter: { deny: ['subagent'] } });
    await assert.rejects(
        membersApi.activateMemberNow(host.ctx, runtimeConfig({ toolPolicies: {} }), makeSelections(), makeCaptain(), makeTeam(), member, member.toolFilter, undefined, undefined),
        /unknown global tool/,
    );
    assert.equal(host.attempts(), 1);
    assert.equal(member.id, '');
});

test('a runtime without the policy table keeps the fail-loud default', async () => {
    const unknownTool = new Error('tools.restrict() names unknown global tool "subagent"; known global tools: agent_teams_claim_task');
    const host = makeHost({ failFirst: unknownTool });
    const member = makeMember({ toolPolicy: 'restricted', toolFilter: { deny: ['subagent'] } });
    await assert.rejects(
        // runtimeConfig() carries no toolPolicies: the owner-safe subset cannot
        // be proven, so the hook must not relax anything.
        membersApi.activateMemberNow(host.ctx, runtimeConfig(), makeSelections(), makeCaptain(), makeTeam(), member, member.toolFilter, undefined, undefined),
        /unknown global tool/,
    );
    assert.equal(host.attempts(), 1);
    assert.equal(member.id, '');
});

test('a member without a policy keeps the built-in lenient retry', async () => {
    const unknownTool = new Error('tools.restrict() names unknown global tool "subagent"; known global tools: agent_teams_claim_task');
    const host = makeHost({ failFirst: unknownTool });
    const member = makeMember();
    const id = await membersApi.activateMemberNow(host.ctx, runtimeConfig(), makeSelections(), makeCaptain(), makeTeam(), member, undefined, undefined, undefined);
    assert.equal(id, 'child-2');
    assert.equal(host.attempts(), 2);
    assert.equal(member.id, 'child-2');
});

test('an ineligible row or team is refused before any start', async () => {
    const hostile = [
        ['removed member', makeMember({ status: 'removed' }), makeTeam(), /was removed/],
        ['stopping member', makeMember({ stopping: true }), makeTeam(), /is stopping/],
        ['halted team', makeMember(), { ...makeTeam(), halted: true }, /is halted/],
        ['staged team', makeMember(), { ...makeTeam(), phase: 'staged' }, /still staged/],
    ];
    for (const [label, member, team, pattern] of hostile) {
        const host = makeHost();
        await assert.rejects(
            membersApi.activateMemberNow(host.ctx, runtimeConfig(), makeSelections(), makeCaptain(), team, member, undefined, undefined, undefined),
            pattern,
            label,
        );
        assert.equal(host.attempts(), 0, label + ': no child may be created');
    }
});

/** The add_member decision itself (tools.js:2794-2845), replayed verbatim. */
async function replayAddMember(api, host, selections, captain, team, member) {
    let spawned = false;
    const activateMemberNow = typeof api['activateMemberNow'] === 'function' ? api['activateMemberNow'] : undefined;
    if (activateMemberNow !== undefined) {
        await activateMemberNow(host.ctx, runtimeConfig(), selections, captain, team, member, member.toolFilter, 'welcome', undefined);
        spawned = true;
    }
    return { spawned, member_id: member.id, status: member.status };
}

test('add_member now reports spawned=true for a running team', async () => {
    const host = makeHost();
    const member = makeMember();
    const created = await replayAddMember(membersApi, host, makeSelections(), makeCaptain(), makeTeam(), member);
    assert.equal(created.spawned, true);
    assert.equal(created.member_id, 'child-1');
    assert.equal(host.starts.length, 1);
});

test('without the export the same replay reports spawned=false (fallback kept)', async () => {
    const host = makeHost();
    const member = makeMember();
    const created = await replayAddMember({}, host, makeSelections(), makeCaptain(), makeTeam(), member);
    assert.equal(created.spawned, false);
    assert.equal(created.member_id, '');
    assert.equal(host.attempts(), 0);
});

test('a thrown start keeps spawned=false so the scheduler kick still runs', async () => {
    const host = makeHost({ failAlways: new Error('no provider') });
    const member = makeMember();
    let spawned = false;
    try {
        await membersApi.activateMemberNow(host.ctx, runtimeConfig(), makeSelections(), makeCaptain(), makeTeam(), member, undefined, undefined, undefined);
        spawned = true;
    }
    catch (error) {
        member.spawnError = String(error);
    }
    assert.equal(spawned, false);
    assert.match(member.spawnError, /no provider/);
    assert.equal(member.id, '');
});

let failed = 0;
let index = 0;
for (const { name, fn } of cases) {
    index += 1;
    try {
        await fn();
        console.log('ok ' + index + ' - ' + name);
    }
    catch (error) {
        failed += 1;
        console.log('not ok ' + index + ' - ' + name);
        console.log(String(error && error.stack ? error.stack : error).split('\n').map((line) => '    ' + line).join('\n'));
    }
}
console.log('');
console.log('# ' + (index - failed) + '/' + index + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
