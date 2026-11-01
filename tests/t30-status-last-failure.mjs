#!/usr/bin/env node
/**
 * `agent_teams_status` last_failure projection (task t31 / NFR-KHANG-LOI-PROVIDER-01).
 *
 * Run from the repository root:
 *
 *   node tests/t31-status-last-failure.mjs
 *
 * t28 writes the provider death durably (`members[].lastFailure` in team.json)
 * and surfaces it on the panel snapshot, but the tool a captain reads every day
 * builds its own member DTO in lib/tools.js. This suite pins that projection:
 *   (a) a member with a recorded failure reports `last_failure` with all five
 *       keys and the stored values;
 *   (b) a member without one has no `last_failure` key at all (not null, not {});
 *   (c) the pre-existing DTO keys are unchanged: route_override, next_route and
 *       spawn_error still come through beside the new one;
 *   (d) the snapshot still renders as text and still stringifies.
 *
 * Exit code 0 means every case passed; 1 means at least one failed.
 */
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const LIB = fileURLToPath(new URL('../packages/dsh-agent-teams/lib/', import.meta.url));
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const indexMod = await import(libModule('index.js'));

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---------------------------------------------------------------------------
// Fake harness: only the surfaces lib/index.js + lib/tools.js actually touch.
// ---------------------------------------------------------------------------
function makeHarness(workspace) {
    const registered = new Map();
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
            [Symbol.for('dsh.subagent.deliverPrompt')](parent, childId, content) { return Promise.resolve('deliver'); },
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
        effect() {},
        get() { return undefined; },
    };
    return { ctx, captain, registered };
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

async function seed(workspace, team) {
    const root = join(workspace, '.agent-teams', team.id);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'team.json'), JSON.stringify(team, null, 2));
}

const member = (name, over = {}) => ({ id: '', name, provider: 'p1', model: 'm1', joinedAt: 1, status: 'idle', ...over });

// The exact shape members.js writes: code, message (<=300), at, provider, model.
const FAILURE = Object.freeze({
    code: 'QUOTA',
    message: 'Insufficient Balance (QUOTA)',
    at: 1793464000000,
    provider: 'opencode-go',
    model: 'kimi-k2.7-code',
});

/** Mount the plugin on a fresh workspace and return the status tool + captain. */
async function mountWith(team) {
    const workspace = await mkdtemp(join(tmpdir(), 't31-status-'));
    const h = makeHarness(workspace);
    indexMod.apply(h.ctx, baseConfig());
    await seed(workspace, team);
    const status = h.registered.get('agent_teams_status');
    assert.equal(typeof status.execute, 'function', 'agent_teams_status must be registered');
    const run = async () => status.execute({}, { agent: h.captain, signal: undefined });
    return { workspace, def: status, run };
}

const teamOf = (members) => ({
    id: 'team-t31', name: 'T31', captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members, tasks: [],
});

// ---------------------------------------------------------------------------
// (a) a recorded provider death is reported, with every key intact
// ---------------------------------------------------------------------------
test('(a) a member with lastFailure reports last_failure with all five keys', async () => {
    const { workspace, run } = await mountWith(teamOf([member('worker-a', { lastFailure: { ...FAILURE } })]));
    const status = await run();
    const a = status.members[0];
    assert.notEqual(a.last_failure, undefined, 'last_failure must be present');
    assert.deepEqual(a.last_failure, {
        code: 'QUOTA',
        message: 'Insufficient Balance (QUOTA)',
        at: 1793464000000,
        provider: 'opencode-go',
        model: 'kimi-k2.7-code',
    });
    assert.equal(Object.keys(a.last_failure).length, 5);
    await rm(workspace, { recursive: true, force: true });
});

test('(a2) an optional provider/model left out reads as empty string, never undefined', async () => {
    const bare = { code: 'RATE_LIMIT', message: 'slow down', at: 42 };
    const { workspace, run } = await mountWith(teamOf([member('worker-a', { lastFailure: bare })]));
    const a = (await run()).members[0];
    assert.deepEqual(a.last_failure, { code: 'RATE_LIMIT', message: 'slow down', at: 42, provider: '', model: '' });
    await rm(workspace, { recursive: true, force: true });
});

test('(a3) the value survives the durable round-trip through team.json', async () => {
    const { workspace, run } = await mountWith(teamOf([member('worker-a', { lastFailure: { ...FAILURE } })]));
    const a = (await run()).members[0];
    assert.equal(a.last_failure.message, FAILURE.message);
    assert.equal(a.last_failure.at, FAILURE.at);
    assert.equal(a.last_failure.provider, FAILURE.provider);
    assert.equal(a.last_failure.model, FAILURE.model);
    await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// (b) a healthy member gains no key at all
// ---------------------------------------------------------------------------
test('(b) a member without lastFailure has no last_failure key', async () => {
    const { workspace, run } = await mountWith(teamOf([member('worker-b')]));
    const b = (await run()).members[0];
    assert.equal('last_failure' in b, false, 'a healthy member must not carry last_failure');
    assert.equal(JSON.stringify(b).includes('last_failure'), false);
    await rm(workspace, { recursive: true, force: true });
});

test('(b2) one failing member does not add the key to its healthy neighbour', async () => {
    const { workspace, run } = await mountWith(teamOf([
        member('worker-a', { lastFailure: { ...FAILURE } }),
        member('worker-b'),
    ]));
    const [a, b] = (await run()).members;
    assert.equal('last_failure' in a, true);
    assert.equal('last_failure' in b, false);
    await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// (c) the pre-existing DTO keys are untouched
// ---------------------------------------------------------------------------
test('(c) route_override, next_route and spawn_error still come through beside last_failure', async () => {
    const failing = member('worker-a', {
        id: 'child-a',
        routeOverride: { provider: 'p1', model: 'm3', reasoningEffort: 'high', source: 'captain', at: 7, by: 'sess-captain' },
        spawnError: 'agent-teams: start failed (quota)',
        lastFailure: { ...FAILURE },
    });
    const { workspace, run } = await mountWith(teamOf([failing]));
    const a = (await run()).members[0];
    assert.equal(a.route_override.model, 'm3');
    assert.equal(a.route_override.reasoning_effort, 'high');
    assert.equal(a.route_override.source, 'captain');
    assert.equal(a.route_override.at, 7);
    assert.equal(a.next_route, 'p1/m3');
    assert.equal(a.spawn_error, 'agent-teams: start failed (quota)');
    assert.equal(a.last_failure.code, 'QUOTA');
    assert.equal(a.name, 'worker-a');
    assert.equal(a.status, 'idle');
    assert.equal(a.provider, 'p1');
    assert.equal(a.model, 'm1');
    assert.equal(a.fallback_active, false);
    await rm(workspace, { recursive: true, force: true });
});

test('(c2) the healthy-member DTO is exactly the old key set', async () => {
    const { workspace, run } = await mountWith(teamOf([member('worker-b')]));
    const b = (await run()).members[0];
    const keys = Object.keys(b).sort();
    // The exact set agent_teams_status reported before this patch (next_route is
    // present even without an override: it is the declared route).
    assert.deepEqual(keys, [
        'active_model', 'active_provider', 'activity', 'fallback_active', 'model', 'name',
        'next_route', 'provider', 'reasoning_effort', 'role', 'status', 'tool_policy',
    ]);
    await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// (d) the snapshot still renders and still stringifies
// ---------------------------------------------------------------------------
test('(d) the status snapshot still renders as text and still stringifies', async () => {
    const { workspace, def, run } = await mountWith(teamOf([member('worker-a', { lastFailure: { ...FAILURE } })]));
    const status = await run();
    const rendered = def.output.render({}, status);
    assert.equal(Array.isArray(rendered), true);
    const text = rendered.map((part) => part.text).join('\n');
    assert.equal(text.includes('worker-a'), true);
    assert.equal(text.includes('Team "T31"'), true);
    assert.equal(text.includes('lastFailure') || text.includes('[object Object]'), false);
    const json = JSON.stringify(status);
    assert.equal(JSON.parse(json).members[0].last_failure.code, 'QUOTA');
    await rm(workspace, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
let failed = 0;
for (const item of cases) {
    try {
        await item.fn();
        console.log('PASS  ' + item.name);
    }
    catch (error) {
        failed += 1;
        console.log('FAIL  ' + item.name);
        console.log('      ' + String(error && error.message ? error.message : error).split('\n').join('\n      '));
    }
}
console.log('');
console.log('TOTAL ' + cases.length + ' checks, ' + (cases.length - failed) + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
