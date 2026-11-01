#!/usr/bin/env node
/**
 * t50 editable-graph scoping suite (BUG-012).
 *
 *   node tests/t50-edit-plan-removed-assignee.mjs
 *
 * Self-locating: the plugin under test is resolved from this file's own URL, so
 * the suite runs from any checkout and any cwd.
 *
 * BUG-012: validateStagedGraph walked EVERY task of the team, so a running team
 * that once removed a member could never edit any pending task again — the old
 * task still carried the removed assignee. The fix scopes the per-task checks
 * (subject / assignee / dependency) to the batch actually edited, while cycle
 * detection keeps walking the whole graph and approval keeps the full scan.
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

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

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
            [Symbol.for('dsh.subagent.deliverPrompt')]() { return Promise.resolve('deliver'); },
            sendMessage() { return Promise.resolve('msg-send'); },
            startActivation() { return Promise.resolve({ childId: 'child-1', result: Promise.resolve({ text: 'ok' }) }); },
            getProvider() { return { id: 'spawn', defaultModel: 'm1' }; },
            list() { return []; },
            interrupt() {},
        },
        llm: {
            async listModels() { return [{ id: 'm1' }, { id: 'm3' }]; },
            async listProviders() { return [{ id: 'p1' }, { id: 'p2' }]; },
            async resolveCallConfig(config) { return config; },
        },
        on() { return () => {}; },
        inject() {},
        systemPrompt: { section() {} },
        effect() {},
        get(name) {
            if (name === 'webServer' || name === 'httpServer') return { register() { return () => {}; } };
            if (name === 'workspaceRegistry' || name === 'workspace') return { list() { return [{ title: 'ws', path: workspace }]; } };
            if (name === 'connection') return { requestRejection() { return undefined; } };
            return undefined;
        },
    };
    return { ctx, captain, registered };
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
/** 'gone' is a member this team used to have: removed, but its old task remains. */
const roster = () => [member('alice'), member('gone', { status: 'removed' })];
const task = (id, extra = {}) => ({
    id, subject: `task ${id}`, status: 'pending', dependencies: [], attempt: 0, kind: 'work', createdAt: 1, updatedAt: 1, ...extra,
});
/** The BUG-012 shape: t1 still assigns the removed member, t2/t6 are editable. */
const bugTasks = () => [
    task('t1', { subject: 'owned by a removed member', assignee: 'gone' }),
    task('t2', { subject: 'editable target', assignee: 'alice' }),
    task('t3', { subject: 'already started', assignee: 'alice', status: 'in_progress', attempt: 1 }),
    task('t6', { subject: 'second editable target', assignee: 'alice' }),
];
const teamFixture = (id, phase, tasks, members = roster()) => ({
    id, name: id.toUpperCase(), captainSessionId: 'sess-captain', createdAt: 1,
    taskSeq: tasks.length, phase, members, tasks,
});

const teamPath = (workspace, id) => join(workspace, '.agent-teams', id, 'team.json');
const teamOf = async (workspace, id) => JSON.parse(await readFile(teamPath(workspace, id), 'utf8'));
const rawOf = (workspace, id) => readFile(teamPath(workspace, id));

async function withTeam(fixture, fn) {
    const workspace = await mkdtemp(join(tmpdir(), 't50-'));
    try {
        const h = makeHarness(workspace);
        indexMod.apply(h.ctx, baseConfig());
        const root = join(workspace, '.agent-teams', fixture.id);
        await mkdir(root, { recursive: true });
        await writeFile(join(root, 'team.json'), JSON.stringify(fixture, null, 2));
        return await fn({ workspace, h });
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

const editPlan = (h, operations) => h.registered.get('agent_teams_edit_plan')
    .execute({ operations }, { agent: h.captain, signal: undefined });
const approve = (h) => h.registered.get('agent_teams_approve')
    .execute({ confirmation: 'approved' }, { agent: h.captain, signal: undefined });
const status = (h) => h.registered.get('agent_teams_status')
    .execute({}, { agent: h.captain, signal: undefined });

// ---------------------------------------------------------------------------
// 1. dependency edit on one pending task survives a removed assignee elsewhere
// ---------------------------------------------------------------------------
test('b1 a dependency edit on one pending task is accepted although t1 assigns a removed member', async () => {
    await withTeam(teamFixture('team-b1', 'running', bugTasks()), async ({ workspace, h }) => {
        const out = await editPlan(h, [{ action: 'update_task', task_id: 't2', dependencies: ['t6'] }]);
        assert.equal(out.status, 'running');
        const saved = await teamOf(workspace, 'team-b1');
        assert.deepEqual(saved.tasks.find(t => t.id === 't2').dependencies, ['t6']);
        // the untouched stale task is preserved verbatim, not repaired behind our back
        assert.equal(saved.tasks.find(t => t.id === 't1').assignee, 'gone');
    });
});

// ---------------------------------------------------------------------------
// 2. subject edit, and two edited tasks in one atomic batch
// ---------------------------------------------------------------------------
test('b2 subject and description edits are accepted, including a two-task batch', async () => {
    await withTeam(teamFixture('team-b2', 'running', bugTasks()), async ({ workspace, h }) => {
        await editPlan(h, [{ action: 'update_task', task_id: 't2', subject: 'renamed target' }]);
        await editPlan(h, [
            { action: 'update_task', task_id: 't2', assignee: 'alice', subject: 'renamed target' },
            { action: 'update_task', task_id: 't6', description: 'second pass' },
        ]);
        const saved = await teamOf(workspace, 'team-b2');
        assert.equal(saved.tasks.find(t => t.id === 't2').subject, 'renamed target');
        assert.equal(saved.tasks.find(t => t.id === 't6').description, 'second pass');
    });
});

// ---------------------------------------------------------------------------
// 3. the batch's own assignee is still validated
// ---------------------------------------------------------------------------
test('b3 assigning a removed member in the batch is still refused and the file is untouched', async () => {
    await withTeam(teamFixture('team-b3', 'running', bugTasks()), async ({ workspace, h }) => {
        const before = await rawOf(workspace, 'team-b3');
        await assert.rejects(
            () => editPlan(h, [{ action: 'update_task', task_id: 't2', assignee: 'gone' }]),
            /assignee "gone" is not an active member/,
        );
        assert.deepEqual(await rawOf(workspace, 'team-b3'), before);
    });
});

// ---------------------------------------------------------------------------
// 4. the cycle check still walks the whole graph (t4 sits outside the batch)
// ---------------------------------------------------------------------------
test('b4 a dependency edit that closes a cycle through an unedited task is refused', async () => {
    const tasks = [...bugTasks(), task('t4', { subject: 'downstream', assignee: 'alice', dependencies: ['t2'] })];
    await withTeam(teamFixture('team-b4', 'running', tasks), async ({ workspace, h }) => {
        const before = await rawOf(workspace, 'team-b4');
        await assert.rejects(
            () => editPlan(h, [{ action: 'update_task', task_id: 't2', dependencies: ['t4'] }]),
            /cycle at "t2"/,
        );
        assert.deepEqual(await rawOf(workspace, 'team-b4'), before);
    });
});

// ---------------------------------------------------------------------------
// 5. a started task is still not editable
// ---------------------------------------------------------------------------
test('b5 a started task is still refused and the file is untouched', async () => {
    await withTeam(teamFixture('team-b5', 'running', bugTasks()), async ({ workspace, h }) => {
        const before = await rawOf(workspace, 'team-b5');
        await assert.rejects(
            () => editPlan(h, [{ action: 'update_task', task_id: 't3', subject: 'too late' }]),
            /has already started and cannot be edited/,
        );
        assert.deepEqual(await rawOf(workspace, 'team-b5'), before);
    });
});

// ---------------------------------------------------------------------------
// 6. approval keeps the full scan: a removed assignee still blocks it
// ---------------------------------------------------------------------------
test('b6 approve still refuses a plan whose task assigns a removed member', async () => {
    await withTeam(teamFixture('team-b6', 'staged', bugTasks()), async ({ workspace, h }) => {
        const before = await rawOf(workspace, 'team-b6');
        await assert.rejects(() => approve(h), /assignee "gone" is not an active member/);
        assert.deepEqual(await rawOf(workspace, 'team-b6'), before);
    });
});

// ---------------------------------------------------------------------------
// 7. roster edits on a running team are still staged-only
// ---------------------------------------------------------------------------
test('b7 update_member on a running team is still refused', async () => {
    await withTeam(teamFixture('team-b7', 'running', bugTasks()), async ({ workspace, h }) => {
        const before = await rawOf(workspace, 'team-b7');
        await assert.rejects(
            () => editPlan(h, [{ action: 'update_member', member_name: 'alice', role: 'reviewer' }]),
            /a running team only permits update_task edits/,
        );
        assert.deepEqual(await rawOf(workspace, 'team-b7'), before);
    });
});

// ---------------------------------------------------------------------------
// 8. the staged edit path keeps the full scan -> same data, different verdict
//    (this is the "before" behaviour the bug was reported against)
// ---------------------------------------------------------------------------
test('b8 the same edit on a STAGED team still fails, proving the scope is the running path only', async () => {
    await withTeam(teamFixture('team-b8', 'staged', bugTasks()), async ({ workspace, h }) => {
        const before = await rawOf(workspace, 'team-b8');
        await assert.rejects(
            () => editPlan(h, [{ action: 'update_task', task_id: 't2', dependencies: ['t6'] }]),
            /assignee "gone" is not an active member/,
        );
        assert.deepEqual(await rawOf(workspace, 'team-b8'), before);
        // and the identical edit on the running twin is accepted (b1)
    });
});

// ---------------------------------------------------------------------------
// 9. a team without a removed assignee keeps working exactly as before
// ---------------------------------------------------------------------------
test('b9 a clean running team still edits normally and status reports the graph', async () => {
    const tasks = [task('t2', { subject: 'a', assignee: 'alice' }), task('t6', { subject: 'b', assignee: 'alice' })];
    await withTeam(teamFixture('team-b9', 'running', tasks, [member('alice')]), async ({ workspace, h }) => {
        await editPlan(h, [{ action: 'update_task', task_id: 't6', dependencies: ['t2'] }]);
        const saved = await teamOf(workspace, 'team-b9');
        assert.deepEqual(saved.tasks.find(t => t.id === 't6').dependencies, ['t2']);
        const dto = await status(h);
        assert.deepEqual(dto.tasks.map(t => t.id).sort(), ['t2', 't6']);
    });
});

// ---------------------------------------------------------------------------
// 10. a dependency on an unknown task inside the batch is still refused
// ---------------------------------------------------------------------------
test('b10 an unknown dependency inside the batch is still refused and the file is untouched', async () => {
    await withTeam(teamFixture('team-b10', 'running', bugTasks()), async ({ workspace, h }) => {
        const before = await rawOf(workspace, 'team-b10');
        await assert.rejects(
            () => editPlan(h, [{ action: 'update_task', task_id: 't2', dependencies: ['t99'] }]),
            /depends on unknown task "t99"/,
        );
        assert.deepEqual(await rawOf(workspace, 'team-b10'), before);
    });
});

// ---------------------------------------------------------------------------
// 11. the cycle check is global: a cycle between two UNEDITED tasks still blocks
// ---------------------------------------------------------------------------
test('b11 a cycle that sits entirely outside the batch is still detected', async () => {
    const tasks = [
        ...bugTasks(),
        task('t7', { subject: 'cyclic a', assignee: 'alice', dependencies: ['t8'] }),
        task('t8', { subject: 'cyclic b', assignee: 'alice', dependencies: ['t7'] }),
    ];
    await withTeam(teamFixture('team-b11', 'running', tasks), async ({ workspace, h }) => {
        const before = await rawOf(workspace, 'team-b11');
        await assert.rejects(
            () => editPlan(h, [{ action: 'update_task', task_id: 't2', dependencies: ['t6'] }]),
            /cycle at "t\d+"/,
        );
        assert.deepEqual(await rawOf(workspace, 'team-b11'), before);
    });
});

let failed = 0;
for (const c of cases) {
    try {
        await c.fn();
        console.log(`ok   - ${c.name}`);
    } catch (error) {
        failed += 1;
        console.log(`FAIL - ${c.name}: ${error.message}`);
    }
}
console.log(`# ${cases.length - failed}/${cases.length} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
