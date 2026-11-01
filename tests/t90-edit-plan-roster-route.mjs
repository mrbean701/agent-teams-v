#!/usr/bin/env node
/**
 * t90 - the edit_plan roster must show the EFFECTIVE route, not the declared spine.
 *
 *   node tests/t90-edit-plan-roster-route.mjs
 *
 * BUG-024: agent_teams_edit_plan built its roster with
 *   `${member.name} (${member.role || 'member'}; ${member.provider ?? ''}/${member.model ?? ''})`
 * - the DECLARED spine (lib/tools.js:1183 before this fix). A staged member
 * (id === '') may already carry a captain-declared routeOverride, and since t87 the
 * approve path starts that member from membersApi.selectionFromMember(member). So the
 * captain read one route back from edit_plan and the run then used another.
 *
 * The fix renders the row from selectionFromMember (precedence fallback > override >
 * active > declared, all of it living in lib/members.js routeOf) and marks a route
 * that differs from the declared spine; a row without a difference keeps the exact
 * pre-fix format so existing readers do not break.
 *
 * Cases: (a) declared member => old format; (b) override member => override route +
 * marker; (c) precedence fallback > override, and a legacy 'active' row; (d) mixed
 * roster keeps its order; (e) NEGATIVE CONTROL in memory: the old spine formula
 * returns a different string for this very fixture and never calls the selector;
 * (f) removed / route-less members render safely; (g) the source no longer carries the
 * old roster line (applies / delta bytes printed); (h,i) end-to-end through the
 * registered agent_teams_edit_plan tool, with and without an override.
 */
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'dsh-agent-teams', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const indexMod = await import(libModule('index.js'));
const membersMod = await import(libModule('members.js'));
const TOOLS_PATH = join(LIB, 'tools.js');
const toolsSource = await readFile(TOOLS_PATH, 'utf8');

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

/** The line this bug is about, kept verbatim so the suite can prove it is gone. */
const OLD_ROSTER_LINE = "roster: updated.members.map((member) => `${member.name} (${member.role || 'member'}; ${member.provider ?? ''}/${member.model ?? ''})`),";

/** The pre-fix renderer, reproduced in memory: this is the negative control's subject. */
const oldRosterRow = (member) => `${member.name} (${member.role || 'member'}; ${member.provider ?? ''}/${member.model ?? ''})`;

/** Slice one function declaration out of a source file by brace depth. */
function sliceFunction(source, header) {
    const start = source.indexOf(header);
    assert.ok(start >= 0, 'missing declaration: ' + header);
    let depth = 0;
    let seen = false;
    for (let index = start; index < source.length; index += 1) {
        const char = source[index];
        if (char === '{') {
            depth += 1;
            seen = true;
        }
        else if (char === '}') {
            depth -= 1;
            if (seen && depth === 0)
                return source.slice(start, index + 1);
        }
    }
    throw new Error('unbalanced declaration: ' + header);
}

const helperSource = sliceFunction(toolsSource, 'function editPlanRosterRow(member) {');
// Evaluated in memory with the REAL members module as membersApi: no disk write and no
// copy of the precedence logic, so the cases run the shipped selector.
const editPlanRosterRow = new Function('membersApi', helperSource + '\nreturn editPlanRosterRow;')(membersMod);

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

test('a1 a member without an override renders exactly the pre-fix string', () => {
    for (const row of [member('alice'), member('bob', { role: '' }), member('carol', { role: 'dev', provider: 'p1', model: 'm3' })]) {
        assert.equal(editPlanRosterRow(row), oldRosterRow(row), 'a row without an override must stay byte-identical');
    }
    assert.equal(editPlanRosterRow(member('alice')), 'alice (researcher; p1/m1)');
    assert.equal(editPlanRosterRow(member('bob', { role: '' })), 'bob (member; p1/m1)');
    console.log('    declared rows unchanged: alice (researcher; p1/m1) · bob (member; p1/m1)');
});

test('b1 a member with a routeOverride renders the override route plus a marker', () => {
    const row = member('alice', { model: 'm9', routeOverride: { ...OVERRIDE } });
    const rendered = editPlanRosterRow(row);
    assert.equal(rendered, 'alice (researcher; p2/m2 (override))');
    assert.notEqual(rendered, oldRosterRow(row), 'the old formula answers p1/m9 here: that is the bug');
    console.log('    override row: ' + rendered + ' (declared was p1/m9)');
});

test('c1 precedence fallback > override: an active fallback wins and is labelled', () => {
    const row = member('alice', {
        model: 'm9',
        routeOverride: { ...OVERRIDE },
        fallbackActive: true,
        activeProvider: 'p3',
        activeModel: 'm4',
        fallback: { provider: 'p3', model: 'm4' },
    });
    const rendered = editPlanRosterRow(row);
    assert.equal(rendered, 'alice (researcher; p3/m4 (fallback))');
    console.log('    fallback beats override: ' + rendered);
});

test('c2 a legacy row whose live route is active-only is labelled (active)', () => {
    const row = member('alice', { model: 'm9', activeProvider: 'p3', activeModel: 'm4' });
    assert.equal(editPlanRosterRow(row), 'alice (researcher; p3/m4 (active))');
    console.log('    active row: alice (researcher; p3/m4 (active))');
});

test('d1 a mixed roster keeps its order and renders each member on its own route', () => {
    const rows = [
        member('alice', { model: 'm9', routeOverride: { ...OVERRIDE } }),
        member('bob', { provider: 'p1', model: 'm3' }),
        member('carol', { fallbackActive: true, activeProvider: 'p3', activeModel: 'm4', fallback: { provider: 'p3', model: 'm4' } }),
    ];
    assert.deepEqual(rows.map(editPlanRosterRow), [
        'alice (researcher; p2/m2 (override))',
        'bob (researcher; p1/m3)',
        'carol (researcher; p3/m4 (fallback))',
    ]);
    console.log('    mixed roster: ' + rows.map(editPlanRosterRow).join(' · '));
});

test('e1 NEGATIVE CONTROL in memory: the old spine formula disagrees on this fixture', () => {
    const row = member('alice', { model: 'm9', routeOverride: { ...OVERRIDE } });
    const old = oldRosterRow(row);
    const fixed = editPlanRosterRow(row);
    assert.notEqual(fixed, old, 'the fix must answer a different string than the old formula');
    assert.equal(old, 'alice (researcher; p1/m9)');
    // The old formula never asks the durable row anything; the new one cannot work
    // without the selector, which is what makes this control meaningful.
    let selectorCalls = 0;
    const spy = { ...membersMod, selectionFromMember: (value) => { selectorCalls += 1; return membersMod.selectionFromMember(value); } };
    const spied = new Function('membersApi', helperSource + '\nreturn editPlanRosterRow;')(spy);
    assert.equal(spied(row), fixed);
    assert.equal(selectorCalls, 1, 'the renderer must call selectionFromMember exactly once per row');
    assert.ok(!oldRosterRow.toString().includes('selectionFromMember'), 'the old formula is spine-only by construction');
    console.log('    applies=1 (in memory only, no file written) old="' + old + '" new="' + fixed + '" delta_bytes=' + (Buffer.byteLength(fixed) - Buffer.byteLength(old)));
});

test('f1 removed and route-less members still render safely', () => {
    const removed = { id: 'child-9', name: 'gone', role: 'dev', joinedAt: 1, status: 'removed' };
    assert.equal(editPlanRosterRow(removed), 'gone (dev; /)');
    assert.equal(editPlanRosterRow(removed), oldRosterRow(removed));
    const halfRoute = { id: '', name: 'half', joinedAt: 1, status: 'idle', provider: 'p1' };
    assert.equal(editPlanRosterRow(halfRoute), oldRosterRow(halfRoute));
    const blankRoute = member('blank', { provider: '', model: '' });
    assert.equal(editPlanRosterRow(blankRoute), 'blank (researcher; /)');
    console.log('    safe rows: ' + [removed, halfRoute, blankRoute].map(editPlanRosterRow).join(' · '));
});

test('g1 tools.js renders the roster through the selector and no longer through the spine', () => {
    const occurrences = toolsSource.split(OLD_ROSTER_LINE).length - 1;
    assert.equal(occurrences, 0, 'the pre-fix roster line must be gone from lib/tools.js');
    assert.ok(toolsSource.includes('roster: updated.members.map(editPlanRosterRow)'), 'edit_plan must map through the renderer');
    const editPlan = toolsSource.slice(toolsSource.indexOf("name: 'agent_teams_edit_plan'"));
    const window = editPlan.slice(0, editPlan.indexOf("name: 'agent_teams_approve'"));
    assert.ok(window.includes('roster: updated.members.map(editPlanRosterRow)'), 'the roster must be rendered by the shared helper');
    assert.equal(window.split('member.provider ?? ').length - 1, 0, 'the edit_plan window must not touch the spine for display');
    assert.ok(helperSource.includes('membersApi.selectionFromMember(member)'), 'the renderer must resolve from the durable row');
    const delta = Buffer.byteLength(helperSource) - Buffer.byteLength(OLD_ROSTER_LINE);
    assert.ok(delta > 0);
    console.log('    applies=1 old_bytes=' + Buffer.byteLength(OLD_ROSTER_LINE) + ' new_bytes=' + Buffer.byteLength(helperSource) + ' delta_bytes=' + delta);
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

const stagedTeam = (members) => ({
    id: 'team-t90',
    name: 'TEAM-T90',
    captainSessionId: 'sess-captain',
    createdAt: 1,
    taskSeq: 2,
    phase: 'staged',
    planReviewState: 'awaiting_review',
    members,
    tasks: [
        { id: 't1', subject: 'draft the plan', assignee: members[0].name, status: 'pending', dependencies: [], kind: 'work', attempt: 0, createdAt: 1, updatedAt: 1 },
    ],
});

const teamPath = (workspace) => join(workspace, '.agent-teams', 'team-t90', 'team.json');
async function withTeam(team, fn) {
    const workspace = await mkdtemp(join(tmpdir(), 't90-'));
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

const editPlan = (h, operations) => h.registered.get('agent_teams_edit_plan')
    .execute({ operations }, { agent: h.captain, signal: undefined });

test('h1 end-to-end: the edit_plan tool answers the override route for a staged member', async () => {
    await withTeam(stagedTeam([
        member('alice', { model: 'm9', routeOverride: { ...OVERRIDE } }),
        member('bob', { role: 'dev', provider: 'p1', model: 'm3' }),
    ]), async ({ workspace, h }) => {
        const result = await editPlan(h, [{ action: 'update_task', task_id: 't1', description: 'tighten the wording' }]);
        assert.equal(result.status, 'staged');
        assert.deepEqual(result.roster, [
            'alice (researcher; p2/m2 (override))',
            'bob (dev; p1/m3)',
        ]);
        assert.equal(result.roster[1], 'bob (dev; p1/m3)', 'a member without an override keeps the old format');
        const saved = JSON.parse(await readFile(teamPath(workspace), 'utf8'));
        assert.equal(saved.members[0].routeOverride.provider + '/' + saved.members[0].routeOverride.model, 'p2/m2', 'the row must be unchanged on disk');
        assert.equal(saved.members[0].provider + '/' + saved.members[0].model, 'p1/m9', 'the spine stays declared: only the display follows the effective route');
        console.log('    tool roster: ' + result.roster.join(' · '));
    });
});

test('i1 end-to-end: without any override every row equals the pre-fix format', async () => {
    await withTeam(stagedTeam([
        member('alice'),
        member('bob', { role: 'dev', provider: 'p2', model: 'm2' }),
    ]), async ({ h }) => {
        const result = await editPlan(h, [{ action: 'update_task', task_id: 't1', description: 'no route change' }]);
        const expected = ['alice (researcher; p1/m1)', 'bob (dev; p2/m2)'];
        assert.deepEqual(result.roster, expected);
        assert.deepEqual(result.roster, [member('alice'), member('bob', { role: 'dev', provider: 'p2', model: 'm2' })].map(oldRosterRow), 'unchanged rows must match the old formula exactly');
        console.log('    tool roster: ' + result.roster.join(' · '));
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
console.log(failed === 0 ? 'verdict PASS - the edit_plan roster follows the effective route (BUG-024 closed)' : 'verdict FAIL - ' + failed + ' case(s) red');
process.exit(failed === 0 ? 0 : 1);
