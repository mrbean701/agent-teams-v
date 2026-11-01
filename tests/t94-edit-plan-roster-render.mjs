#!/usr/bin/env node
/**
 * t94 - the edit_plan TOOL TEXT must print the roster, not only the structured payload.
 *
 *   node tests/t94-edit-plan-roster-render.mjs
 *
 * BUG-024 first fix (t90) made the structured `roster` carry the EFFECTIVE route of
 * every member, but the render still built its text as
 *   `${summary}\n${value.graph.join('\n')}`
 * and dropped `value.roster`. A real headless boot proved it: session
 * session-9f394b2f-cd8a-4b99-8725-bbe39d93b670 got back only
 *   "Staged plan updated atomically (2 members, 0 tasks, 0 dependencies). No members
 *    were spawned and no tasks were scheduled."
 * for a plan whose alice carried a routeOverride - no roster line at all, so the
 * captain reading the tool text still could not see the effective route.
 *
 * Cases: (a) the summary line stays char-for-char; (b) an override member prints its
 * route plus the marker; (c) a member without a difference keeps the old format;
 * (d) roster lines follow the graph in `updated.members` order; (e) the graph is still
 * there; (f) NEGATIVE CONTROL in memory - the old graph-only render has no roster line;
 * (g) an empty body adds no blank line; (h) the old expression is gone from the source;
 * (i) replay of the headless E2E fixture through the real tool.
 */
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'dsh-agent-teams', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const indexMod = await import(libModule('index.js'));
const TOOLS_PATH = join(LIB, 'tools.js');
const toolsSource = await readFile(TOOLS_PATH, 'utf8');

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

/** The pre-t94 renderer, verbatim: this is the negative control's subject. */
const summaryOf = (value) => `${value.status === 'staged' ? 'Staged plan' : 'Pending task graph'} updated atomically (${value.members} members, ${value.tasks} tasks, ${value.dependencies} dependencies). ${value.status === 'staged' ? 'No members were spawned and no tasks were scheduled.' : 'The scheduler will dispatch any newly ready work.'}`;
const oldRenderText = (value) => `${summaryOf(value)}\n${value.graph.join('\n')}`;

const CATALOG = { p1: [{ id: 'm1' }, { id: 'm3' }], p2: [{ id: 'm2' }], p3: [{ id: 'm4' }] };
const MEMBER_PROVIDER = 'spawn';
const OVERRIDE = { provider: 'p2', model: 'm2', reasoningEffort: 'high', source: 'captain', at: 5, by: 'sess-captain' };
const member = (name, extra = {}) => ({
    id: '',
    name,
    role: 'researcher',
    provider: 'p1',
    model: 'm1',
    joinedAt: 1,
    status: 'idle',
    ...extra,
});

function makeHarness(workspace) {
    const registered = new Map();
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
            startActivation() {
                childSeq += 1;
                return Promise.resolve({ childId: 'child-' + childSeq, result: Promise.resolve({ text: 'ok' }) });
            },
            getProvider(name) { return name === MEMBER_PROVIDER ? { id: MEMBER_PROVIDER, name: MEMBER_PROVIDER, prepareContinuable() {} } : undefined; },
            list() { return [MEMBER_PROVIDER]; },
            interrupt() {},
        },
        llm: {
            async listModels(provider) { return CATALOG[provider] ?? []; },
            async listProviders() { return [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]; },
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

const baseConfig = () => ({
    stateDir: '.agent-teams',
    memberProvider: MEMBER_PROVIDER,
    maxMembers: 8,
    maxManualMembers: 12,
    profiles: {},
    toolPolicies: {},
    slashCommand: false,
});

const stagedTeam = (members, tasks) => ({
    id: 'team-t94',
    name: 'TEAM-T94',
    captainSessionId: 'sess-captain',
    createdAt: 1,
    taskSeq: 2,
    phase: 'staged',
    planReviewState: 'awaiting_review',
    members,
    tasks: tasks ?? [{ id: 't1', subject: 'draft the plan', assignee: members[0].name, status: 'pending', dependencies: [], kind: 'work', attempt: 0, createdAt: 1, updatedAt: 1 }],
});

async function withTeam(team, fn) {
    const workspace = await mkdtemp(join(tmpdir(), 't94-'));
    try {
        const h = makeHarness(workspace);
        indexMod.apply(h.ctx, baseConfig());
        const root = join(workspace, '.agent-teams', team.id);
        await mkdir(root, { recursive: true });
        await writeFile(join(root, 'team.json'), JSON.stringify(team, null, 2));
        return await fn({ workspace, h });
    }
    finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

/** Run the real tool, then the real render, and return both. */
async function runEditPlan(h, operations) {
    const def = h.registered.get('agent_teams_edit_plan');
    const value = await def.execute({ operations }, { agent: h.captain, signal: undefined });
    const parts = def.output.render({ operations }, value);
    assert.equal(parts.length, 1, 'the render must produce exactly one text part');
    assert.equal(parts[0].type, 'text');
    return { value, text: parts[0].text, lines: parts[0].text.split('\n') };
}

const THREE = () => [
    member('alice', { routeOverride: { ...OVERRIDE }, model: 'm9' }),
    member('bob', { role: 'engineer', provider: 'p1', model: 'm3' }),
    member('carol', { fallbackActive: true, activeProvider: 'p3', activeModel: 'm4', fallback: { provider: 'p3', model: 'm4' } }),
];

test('a1 the summary line is char-for-char what it was before', async () => {
    await withTeam(stagedTeam(THREE()), async ({ h }) => {
        const { value, lines } = await runEditPlan(h, [{ action: 'update_task', task_id: 't1', description: 'tighten' }]);
        assert.equal(lines[0], summaryOf(value), 'the first line must be the unchanged summary');
        assert.ok(!lines[0].includes('alice'), 'the summary carries no roster');
        console.log('    summary: ' + lines[0]);
    });
});

test('b1 an override member prints its effective route plus the marker', async () => {
    await withTeam(stagedTeam(THREE()), async ({ h }) => {
        const { text, lines } = await runEditPlan(h, [{ action: 'update_task', task_id: 't1', description: 'tighten' }]);
        assert.ok(lines.includes('alice (researcher; p2/m2 (override))'), 'override line missing from the tool text');
        assert.ok(!text.includes('alice (researcher; p1/m9)'), 'the declared spine must not be printed for alice');
        assert.ok(lines.includes('carol (researcher; p3/m4 (fallback))'), 'fallback line missing');
        console.log('    override row in TEXT: alice (researcher; p2/m2 (override))');
    });
});

test('c1 a member without a difference keeps the old "name (role; provider/model)" format', async () => {
    await withTeam(stagedTeam(THREE()), async ({ h }) => {
        const { lines } = await runEditPlan(h, [{ action: 'update_task', task_id: 't1', description: 'tighten' }]);
        assert.ok(lines.includes('bob (engineer; p1/m3)'), 'a declared member must keep the exact old format');
        assert.ok(!lines.some((line) => line.startsWith('bob (') && line.includes('(override)')), 'bob must not be marked');
        console.log('    plain row in TEXT: bob (engineer; p1/m3)');
    });
});

test('d1 roster lines follow the graph in updated.members order', async () => {
    await withTeam(stagedTeam(THREE()), async ({ h }) => {
        const { value, lines } = await runEditPlan(h, [{ action: 'update_task', task_id: 't1', description: 'tighten' }]);
        assert.equal(value.roster.length, 3);
        const positions = value.roster.map((row) => lines.indexOf(row));
        assert.ok(positions.every((position) => position > 0), 'every roster line must appear in the text');
        assert.deepEqual([...positions].sort((left, right) => left - right), positions, 'roster lines must keep updated.members order');
        const lastGraph = lines.indexOf(value.graph[value.graph.length - 1]);
        assert.ok(positions[0] > lastGraph, 'the roster must start after the graph');
        assert.equal(lines.length, 1 + value.graph.length + value.roster.length, 'no extra lines besides summary + graph + roster');
        console.log('    line order: ' + lines.map((line, index) => index + ':' + line.slice(0, 34)).join(' | '));
    });
});

test('e1 the graph is still printed', async () => {
    await withTeam(stagedTeam(THREE()), async ({ h }) => {
        const { value, lines } = await runEditPlan(h, [{ action: 'update_task', task_id: 't1', description: 'tighten' }]);
        assert.ok(value.graph.length > 0);
        for (const row of value.graph)
            assert.ok(lines.includes(row), 'a graph row went missing: ' + row);
        assert.ok(lines.length > 1 + value.graph.length, 'roster lines must be present besides the graph');
        console.log('    graph rows kept: ' + value.graph.length);
    });
});

test('f1 NEGATIVE CONTROL in memory - the old graph-only render carries no roster line', async () => {
    await withTeam(stagedTeam(THREE()), async ({ h }) => {
        const { value, text } = await runEditPlan(h, [{ action: 'update_task', task_id: 't1', description: 'tighten' }]);
        const old = oldRenderText(value);
        assert.equal(old, summaryOf(value) + '\n' + value.graph.join('\n'), 'the control must be the pre-t94 expression verbatim');
        assert.ok(!old.includes('alice ('), 'the old render must NOT contain the alice roster line: that is the bug');
        assert.ok(!old.includes('(override)'));
        assert.notEqual(text, old);
        for (const row of value.roster)
            assert.ok(!old.includes(row), 'no roster row may leak into the old text');
        console.log('    applies=1 (in memory only, no file written) old_bytes=' + Buffer.byteLength(old) + ' new_bytes=' + Buffer.byteLength(text) + ' delta_bytes=' + (Buffer.byteLength(text) - Buffer.byteLength(old)) + ' starts_identical=' + text.startsWith(old));
    });
});

test('g1 an empty body adds no blank line and no trailing newline', async () => {
    await withTeam(stagedTeam([member('solo')]), async ({ h }) => {
        const tool = h.registered.get('agent_teams_edit_plan');
        const empty = { status: 'staged', members: 0, tasks: 0, dependencies: 0, roster: [], graph: [] };
        const text = tool.output.render({}, empty)[0].text;
        assert.equal(text, summaryOf(empty), 'an empty body must be the summary alone');
        assert.ok(!text.includes('\n\n'), 'no double newline');
        assert.ok(!text.endsWith('\n'), 'no trailing newline');
        const withRoster = { ...empty, members: 2, roster: ['alice (researcher; p1/m1)', 'bob (engineer; p1/m3)'] };
        const rosterText = tool.output.render({}, withRoster)[0].text;
        assert.equal(rosterText, summaryOf(withRoster) + '\n' + withRoster.roster.join('\n'));
        assert.ok(!rosterText.includes('\n\n'));
        assert.ok(!rosterText.endsWith('\n'));
        console.log('    empty body bytes=' + Buffer.byteLength(text) + ' · graph-less roster body ok');
    });
});

test('h1 the pre-t94 expression is gone from lib/tools.js', async () => {
    const oldExpression = "\n${value.graph.join('\\n')}";
    assert.equal(toolsSource.split(oldExpression).length - 1, 0, 'the graph-only text expression must be gone');
    const window = toolsSource.slice(toolsSource.indexOf("name: 'agent_teams_edit_plan'"));
    const renderWindow = window.slice(window.indexOf('render:'), window.indexOf('async execute'));
    assert.ok(renderWindow.includes('value.roster'), 'the render must consume the roster');
    assert.ok(/body\.join\(/.test(renderWindow), 'the render must join graph + roster into one body');
    assert.ok(renderWindow.includes('...value.graph, ...value.roster'), 'the body is graph first, then roster');
    console.log('    render window consumes value.roster and joins one body');
});

test('i1 replay of the headless E2E fixture through the real tool', async () => {
    await withTeam(stagedTeam([
        member('alice', { model: 'm9', routeOverride: { ...OVERRIDE } }),
        member('bob', { role: 'engineer', provider: 'p1', model: 'm3' }),
    ], []), async ({ h }) => {
        const { value, text, lines } = await runEditPlan(h, [{ action: 'update_member', member_name: 'bob', role: 'qa' }]);
        assert.equal(value.members, 2);
        assert.equal(value.tasks, 0);
        assert.equal(lines[0], 'Staged plan updated atomically (2 members, 0 tasks, 0 dependencies). No members were spawned and no tasks were scheduled.', 'the E2E summary must not change');
        assert.deepEqual(text, lines[0] + '\n' + [
            'alice (researcher; p2/m2 (override))',
            'bob (qa; p1/m3)',
        ].join('\n'));
        console.log('    E2E text now carries the roster:\n      ' + text.split('\n').join('\n      '));
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
console.log(failed === 0 ? 'verdict PASS - the edit_plan tool TEXT prints the effective roster (BUG-024, second fix)' : 'verdict FAIL - ' + failed + ' case(s) red');
process.exit(failed === 0 ? 0 : 1);
