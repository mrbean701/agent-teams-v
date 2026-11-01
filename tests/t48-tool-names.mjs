#!/usr/bin/env node
/**
 * t48 — the captain-only profile tool must be in the shared name list.
 *
 *   node tests/t48-tool-names.mjs
 *
 * lib/tool-names.js is the single source of truth for three separate surfaces, so
 * a tool that is missing from TEAM_TOOL_NAMES is silently open to members:
 *   - lib/capabilities.js:86  deny: TEAM_TOOL_NAMES.filter(name => !MEMBER_TOOL_NAMES.includes(name))
 *   - lib/index.js:155        captainPrompt: usageSectionText(TEAM_TOOL_NAMES.join(', '), ...)
 *   - lib/tool-policies.js    BUILTIN_DENY_TOOLS / spawn deny composition
 * Before t48 agent_teams_set_member_profile was in NONE of them: a member could
 * rewrite its own (or another member's) role/executionPrompt, and the captain was
 * never told the tool existed. The asserts below are driven through the real
 * modules (installTeamCapabilities, apply) rather than a re-implementation of the
 * filter, so a future refactor of that line is caught here.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// <repo>/tests/ -> <repo>/packages/dsh-agent-teams/lib
const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'dsh-agent-teams', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const names = await import(libModule('tool-names.js'));
const indexMod = await import(libModule('index.js'));
const capabilitiesMod = await import(libModule('capabilities.js'));

const TARGET = 'agent_teams_set_member_profile';
const MEMBER_TOOLS = ['agent_teams_claim_task', 'agent_teams_update_task', 'agent_teams_send_message', 'agent_teams_status'];

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---------------------------------------------------------------------------
// The deny list, captured from the real attach path (capabilities.js:86).
// isPendingMember:() => true makes attach() take the member branch without
// touching disk, which is exactly the branch that calls tools.restrict.
// ---------------------------------------------------------------------------
async function denyOfMember() {
    const workspace = await mkdtemp(join(tmpdir(), 't48-'));
    const agent = {
        id: 'sess-member',
        session: { id: 'sess-member', header: { cwd: workspace }, append() {} },
        ctx: {
            tools: { restrict(policy) { restricCalls.push(policy); return () => {}; } },
            effect(fn) { return fn(); },
        },
    };
    const restricCalls = [];
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        agents: { list() { return [agent]; }, get() { return agent; } },
        systemPrompt: { section() {} },
        effect() {},
        on() { return () => {}; },
        inject() {},
    };
    try {
        capabilitiesMod.installTeamCapabilities(ctx, {
            stateDir: '.agent-teams',
            isPendingMember: () => true,
            order: 117,
            captainPrompt: () => 'stub captain prompt',
        });
    }
    finally {
        await rm(workspace, { recursive: true, force: true });
    }
    assert.equal(restricCalls.length, 1, 'a member attaches once and is restricted once');
    return restricCalls[0].deny ?? [];
}

// ---------------------------------------------------------------------------
// 1-3: the name lists themselves
// ---------------------------------------------------------------------------
test('1 the profile tool is in TEAM_TOOL_NAMES, next to set_member_route', () => {
    assert.ok(names.TEAM_TOOL_NAMES.includes(TARGET), TARGET + ' must be a team tool');
    const route = names.TEAM_TOOL_NAMES.indexOf('agent_teams_set_member_route');
    assert.equal(names.TEAM_TOOL_NAMES.indexOf(TARGET), route + 1, 'kept beside its sibling in the member-management group');
    assert.equal(new Set(names.TEAM_TOOL_NAMES).size, names.TEAM_TOOL_NAMES.length, 'no duplicate names');
});

test('2 the profile tool is in CAPTAIN_TOOL_NAMES', () => {
    assert.ok(names.CAPTAIN_TOOL_NAMES.includes(TARGET));
    assert.deepEqual(names.CAPTAIN_TOOL_NAMES, names.TEAM_TOOL_NAMES.filter((name) => !names.MEMBER_TOOL_NAMES.includes(name)),
        'CAPTAIN_TOOL_NAMES stays derived, not hand-written');
});

test('3 the profile tool is NOT a member tool', () => {
    assert.equal(names.MEMBER_TOOL_NAMES.includes(TARGET), false);
    assert.deepEqual([...names.MEMBER_TOOL_NAMES], MEMBER_TOOLS, 'the member surface is unchanged: exactly four tools');
});

// ---------------------------------------------------------------------------
// 4-6: the two consumers that made this a permission hole
// ---------------------------------------------------------------------------
test('4 the member deny list built by capabilities.js:86 contains the profile tool', async () => {
    const deny = await denyOfMember();
    assert.ok(deny.includes(TARGET), 'a member must not be able to rewrite role/executionPrompt: ' + deny.join(', '));
});

test('5 the captain prompt string built at index.js:155 names the profile tool', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't48-'));
    const sections = [];
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
        tools: { register() {} },
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
        llm: { listModels: async () => [{ id: 'm1' }], listProviders: async () => [{ id: 'p1' }], resolveCallConfig: async (c) => c },
        systemPrompt: { section(def) { sections.push(def); } },
        effect() {},
        on() { return () => {}; },
        inject() {},
        get() { return undefined; },
    };
    try {
        indexMod.apply(ctx, {
            stateDir: '.agent-teams', memberProvider: 'spawn', maxMembers: 8, maxManualMembers: 12,
            profiles: {}, toolPolicies: {}, slashCommand: false,
        });
    }
    finally {
        await rm(workspace, { recursive: true, force: true });
    }
    const usage = sections.find((section) => section.name === 'agent-teams:usage');
    assert.ok(usage !== undefined, 'the captain usage section is registered');
    const text = usage.text({ agent: captain });
    assert.ok(text.includes(TARGET), 'the captain prompt must name the tool: ' + text.slice(-400));
    assert.ok(text.includes('agent_teams_set_member_route'), 'control: the sibling tool is named too');
});

test('6 the four member tools are not denied', async () => {
    const deny = await denyOfMember();
    for (const name of MEMBER_TOOLS) {
        assert.equal(deny.includes(name), false, name + ' is a member tool and must stay callable');
    }
    assert.equal(deny.length, names.CAPTAIN_TOOL_NAMES.length, 'the deny list is exactly the captain surface');
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
