#!/usr/bin/env node
/**
 * t43 member-profile suite (shipped harness — lives beside the package).
 *
 *   node packages/dsh-agent-teams/tests/t43-member-profile.mjs
 *   node tests/t43-member-profile.mjs            (repo-root forwarder)
 *
 * Self-locating: the plugin under test is resolved from this file's own URL
 * (import.meta.url), so the suite runs from any checkout and any cwd, with no
 * absolute path baked in.
 *
 * Mounts the real plugin (lib/index.js apply) against a fake ctx, then drives
 * the registered agent_teams_set_member_profile tool and proves the edit path
 * end to end:
 *   (a) role only / execution prompt only / merge of the two
 *   (b) an empty call, a blank field and both caps are REFUSED, file untouched
 *   (c) the caps accept exactly 200 and exactly 4000 characters
 *   (d) a removed or stopping member is refused, file untouched
 *   (e) a legacy team.json without role/executionPrompt still reads and edits
 *   (f) an invalid record is still refused by lib/state.js readTeam
 *   (g) exactly ONE audit row per call in docs/log/MEMBER-PROFILE.md
 *   (h) the durable write happens BEFORE the in-memory record is updated
 *   (i) a running member is never interrupted or restarted by a profile edit
 *   (j) the status DTO reports the new role (the RAM copy really changed)
 */
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// <pkg>/tests/ -> <pkg>/lib
const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const indexMod = await import(libModule('index.js'));
const stateMod = await import(libModule('state.js'));

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---------------------------------------------------------------------------
// Fake harness: only the surfaces lib/index.js + lib/tools.js actually touch.
// ---------------------------------------------------------------------------
function makeHarness(workspace) {
    const registered = new Map();
    const interrupts = [];
    const starts = [];
    const captain = {
        id: 'sess-captain',
        session: {
            id: 'sess-captain',
            header: { cwd: workspace },
            append() {},
            requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }),
        },
    };
    const webServer = { register() { return () => {}; } };
    const registry = { list() { return [{ title: 'ws', path: workspace }]; } };
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        tools: { register(def) { registered.set(def.name, def); } },
        agents: { get(id) { return id === 'sess-captain' ? captain : undefined; }, list() { return []; } },
        subagents: {
            followup() { return Promise.resolve('msg-legacy'); },
            [Symbol.for('dsh.subagent.deliverPrompt')]() { return Promise.resolve('deliver'); },
            sendMessage() { return Promise.resolve('msg-send'); },
            startActivation(input) { starts.push(input); return Promise.resolve({ childId: 'child-1', result: Promise.resolve({ text: 'ok' }) }); },
            getProvider() { return { id: 'spawn', defaultModel: 'm1' }; },
            list() { return []; },
            interrupt(id) { interrupts.push(id); },
        },
        llm: {
            async listModels() { return [{ id: 'm1' }, { id: 'm3' }]; },
            async listProviders() { return [{ id: 'p1' }, { id: 'p2' }]; },
            async resolveCallConfig(config) { return config; },
        },
        on() { return () => {}; },
        inject() {},
        systemPrompt: { section() {} },
        effect(fn) { fn(); },
        get(name) {
            if (name === 'webServer' || name === 'httpServer') return webServer;
            if (name === 'workspaceRegistry' || name === 'workspace') return registry;
            if (name === 'connection') return { requestRejection() { return undefined; } };
            return undefined;
        },
    };
    return { ctx, captain, registered, interrupts, starts };
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
const teamFixture = (id, members) => ({ id, name: id.toUpperCase(), captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members, tasks: [] });

async function seed(workspace, team) {
    const root = join(workspace, '.agent-teams', team.id);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, 'team.json'), JSON.stringify(team, null, 2));
}

const teamPath = (workspace, id) => join(workspace, '.agent-teams', id, 'team.json');
const teamOf = async (workspace, id) => JSON.parse(await readFile(teamPath(workspace, id), 'utf8'));
const teamBytes = async (workspace, id) => readFile(teamPath(workspace, id), 'utf8');
const profileAuditOf = (workspace) => readFile(join(workspace, 'docs', 'log', 'MEMBER-PROFILE.md'), 'utf8');
const profileTool = (h) => h.registered.get('agent_teams_set_member_profile');

async function withTeam(fixture, fn) {
    const workspace = await mkdtemp(join(tmpdir(), 't43-'));
    try {
        const h = makeHarness(workspace);
        indexMod.apply(h.ctx, baseConfig());
        if (fixture !== undefined) await seed(workspace, fixture);
        return await fn({ workspace, h });
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

const setProfile = (h, name, args) =>
    profileTool(h).execute({ member_name: name, ...args }, { agent: h.captain, signal: undefined });

// ---------------------------------------------------------------------------
// (a) the three shapes: role only, prompt only, merge
// ---------------------------------------------------------------------------
test('a1 role only: reported, written to team.json, and visible in the status DTO', async () => {
    await withTeam(teamFixture('team-a1', [member('alice')]), async ({ h, workspace }) => {
        const value = await setProfile(h, 'alice', { role: 'researcher' });
        assert.equal(value.member_name, 'alice');
        assert.equal(value.role, 'researcher');
        assert.deepEqual(value.changed, ['role']);
        assert.equal(value.applied, 'durable-only');
        assert.equal(value.execution_prompt, undefined);
        const saved = await teamOf(workspace, 'team-a1');
        assert.equal(saved.members[0].role, 'researcher', 'the durable record carries the new role');
        const status = await h.registered.get('agent_teams_status').execute({}, { agent: h.captain, signal: undefined });
        assert.equal(status.members[0].role, 'researcher', 'the in-memory record was updated after the write');
    });
});

test('a2 execution prompt only: stored as executionPrompt and echoed as execution_prompt', async () => {
    await withTeam(teamFixture('team-a2', [member('alice')]), async ({ h, workspace }) => {
        const value = await setProfile(h, 'alice', { execution_prompt: '  review the diff first  ' });
        assert.equal(value.execution_prompt, 'review the diff first', 'the stored prompt is trimmed');
        assert.deepEqual(value.changed, ['executionPrompt']);
        assert.equal(value.role, undefined);
        const saved = await teamOf(workspace, 'team-a2');
        assert.equal(saved.members[0].executionPrompt, 'review the diff first');
        assert.equal(saved.members[0].role, undefined, 'the omitted field is not invented');
    });
});

test('a3 merge: a second call that omits a field keeps its current value', async () => {
    await withTeam(teamFixture('team-a3', [member('alice', { role: 'engineer' })]), async ({ h, workspace }) => {
        const first = await setProfile(h, 'alice', { execution_prompt: 'write the test first' });
        assert.equal(first.previous_role, undefined, 'role was not part of this change');
        const second = await setProfile(h, 'alice', { role: 'reviewer' });
        assert.deepEqual(second.changed, ['role']);
        assert.equal(second.previous_role, 'engineer');
        assert.equal(second.previous_execution_prompt, undefined, 'a half this call did not touch reports no "previous" value');
        const saved = await teamOf(workspace, 'team-a3');
        assert.equal(saved.members[0].role, 'reviewer');
        assert.equal(saved.members[0].executionPrompt, 'write the test first');
    });
});

// ---------------------------------------------------------------------------
// (b) refusals: empty call, blank field, both caps — file untouched
// ---------------------------------------------------------------------------
test('b1 an empty call is refused and team.json is untouched', async () => {
    await withTeam(teamFixture('team-b1', [member('alice', { role: 'engineer' })]), async ({ h, workspace }) => {
        const before = await teamBytes(workspace, 'team-b1');
        await assert.rejects(() => setProfile(h, 'alice', {}), /need at least one field/);
        assert.equal(await teamBytes(workspace, 'team-b1'), before, 'a refused call writes nothing');
    });
});

test('b2 blank fields are "not passed" and cannot erase a profile', async () => {
    await withTeam(teamFixture('team-b2', [member('alice', { role: 'engineer', executionPrompt: 'keep me' })]), async ({ h, workspace }) => {
        const before = await teamBytes(workspace, 'team-b2');
        await assert.rejects(() => setProfile(h, 'alice', { role: '   ', execution_prompt: '\t ' }), /need at least one field/);
        assert.equal(await teamBytes(workspace, 'team-b2'), before);
    });
});

test('b3 a role over the cap is refused, not truncated', async () => {
    await withTeam(teamFixture('team-b3', [member('alice')]), async ({ h, workspace }) => {
        const before = await teamBytes(workspace, 'team-b3');
        await assert.rejects(() => setProfile(h, 'alice', { role: 'r'.repeat(201) }), /cap is 200/);
        assert.equal(await teamBytes(workspace, 'team-b3'), before);
        const saved = await teamOf(workspace, 'team-b3');
        assert.equal(saved.members[0].role, undefined, 'the over-cap value never lands in the record');
    });
});

test('b4 an execution prompt over the cap is refused, not truncated', async () => {
    await withTeam(teamFixture('team-b4', [member('alice')]), async ({ h, workspace }) => {
        const before = await teamBytes(workspace, 'team-b4');
        await assert.rejects(() => setProfile(h, 'alice', { execution_prompt: 'p'.repeat(4001) }), /cap is 4000/);
        assert.equal(await teamBytes(workspace, 'team-b4'), before);
    });
});

test('b5 exactly 200 and exactly 4000 characters are accepted (the caps are inclusive)', async () => {
    await withTeam(teamFixture('team-b5', [member('alice')]), async ({ h, workspace }) => {
        const role = 'r'.repeat(200);
        const prompt = 'p'.repeat(4000);
        const value = await setProfile(h, 'alice', { role, execution_prompt: prompt });
        assert.equal(value.role, role);
        assert.equal(value.execution_prompt.length, 4000);
        const saved = await teamOf(workspace, 'team-b5');
        assert.equal(saved.members[0].role.length, 200);
        assert.equal(saved.members[0].executionPrompt.length, 4000);
    });
});

// ---------------------------------------------------------------------------
// (c) refused targets: removed member, stopping member, unknown member
// ---------------------------------------------------------------------------
test('c1 a removed member is refused and the file is untouched', async () => {
    await withTeam(teamFixture('team-c1', [member('alice', { status: 'removed' })]), async ({ h, workspace }) => {
        const before = await teamBytes(workspace, 'team-c1');
        await assert.rejects(() => setProfile(h, 'alice', { role: 'x' }), /is not part of team/);
        assert.equal(await teamBytes(workspace, 'team-c1'), before);
    });
});

test('c2 a stopping member is refused and the file is untouched', async () => {
    await withTeam(teamFixture('team-c2', [member('alice', { stopping: true })]), async ({ h, workspace }) => {
        const before = await teamBytes(workspace, 'team-c2');
        await assert.rejects(() => setProfile(h, 'alice', { role: 'x' }), /is stopping/);
        assert.equal(await teamBytes(workspace, 'team-c2'), before);
    });
});

test('c3 an unknown member is refused', async () => {
    await withTeam(teamFixture('team-c3', [member('alice')]), async ({ h }) => {
        await assert.rejects(() => setProfile(h, 'nobody', { role: 'x' }), /is not part of team/);
    });
});

test('c4 a team_id that is not the caller team is refused', async () => {
    await withTeam(teamFixture('team-c4', [member('alice')]), async ({ h, workspace }) => {
        const before = await teamBytes(workspace, 'team-c4');
        await assert.rejects(() => profileTool(h).execute({ team_id: 'someone-else', member_name: 'alice', role: 'x' }, { agent: h.captain, signal: undefined }), /is not the caller team/);
        assert.equal(await teamBytes(workspace, 'team-c4'), before);
        const ok = await profileTool(h).execute({ team_id: 'team-c4', member_name: 'alice', role: 'ok' }, { agent: h.captain, signal: undefined });
        assert.equal(ok.role, 'ok', 'the caller own team_id is accepted');
    });
});

// ---------------------------------------------------------------------------
// (d) legacy records still read; invalid records still fail
// ---------------------------------------------------------------------------
test('d1 a legacy team.json without role/executionPrompt reads and edits', async () => {
    const legacy = teamFixture('team-d1', [{ id: '', name: 'alice', provider: 'p1', model: 'm1', joinedAt: 1, status: 'idle' }]);
    await withTeam(legacy, async ({ h, workspace }) => {
        const value = await setProfile(h, 'alice', { role: 'engineer', execution_prompt: 'ship it' });
        assert.equal(value.previous_role, undefined);
        assert.equal(value.previous_execution_prompt, undefined);
        const saved = await teamOf(workspace, 'team-d1');
        assert.equal(saved.members[0].role, 'engineer');
        assert.equal(saved.members[0].executionPrompt, 'ship it');
    });
});

test('d2 a record whose executionPrompt is not a string is still refused by readTeam', async () => {
    const broken = teamFixture('team-d2', [member('alice', { executionPrompt: 42 })]);
    await withTeam(broken, async ({ workspace }) => {
        const root = join(workspace, '.agent-teams');
        await assert.rejects(() => stateMod.readTeam(root, 'team-d2'), /invalid AgentTeams state in team/);
    });
});

// ---------------------------------------------------------------------------
// (e) the audit log: one row per call, header created on demand
// ---------------------------------------------------------------------------
test('e1 one call appends exactly one row and creates the header', async () => {
    await withTeam(teamFixture('team-e1', [member('alice', { role: 'engineer' })]), async ({ h, workspace }) => {
        await setProfile(h, 'alice', { role: 'reviewer' });
        const text = await profileAuditOf(workspace);
        assert.match(text, /\| at \(UTC\) \| team \| member \| role \| executionPrompt \| source \|/, 'the header names the columns');
        const rows = text.split('\n').filter((line) => /^\| \d{4}-/.test(line));
        assert.equal(rows.length, 1, 'exactly one data row for one call');
        assert.match(rows[0], /\| team-e1 \| alice \| engineer → reviewer \| \(unchanged\) \| captain:sess-captain \|/);
    });
});

test('e2 a second call appends a second row and says which half is unchanged', async () => {
    await withTeam(teamFixture('team-e2', [member('alice')]), async ({ h, workspace }) => {
        await setProfile(h, 'alice', { role: 'engineer' });
        await setProfile(h, 'alice', { execution_prompt: 'abcd' });
        const rows = (await profileAuditOf(workspace)).split('\n').filter((line) => /^\| \d{4}-/.test(line));
        assert.equal(rows.length, 2);
        assert.match(rows[1], /\| \(unchanged\) \| 0 → 4 chars \|/, 'the prompt column measures old and new length');
    });
});

// ---------------------------------------------------------------------------
// (f) ordering and the "never interrupt" promise
// ---------------------------------------------------------------------------
test('f1 the durable write happens before the in-memory record is updated', async () => {
    const source = await readFile(join(LIB, 'members.js'), 'utf8');
    const start = source.indexOf('export async function setMemberProfile');
    assert.ok(start > 0, 'lib/members.js exports setMemberProfile');
    const body = source.slice(start, source.indexOf('export async function', start + 10));
    const write = body.indexOf('await writeTeam(stateRoot,');
    const ram = body.indexOf('Object.assign(member, next)');
    assert.ok(write > 0 && ram > 0, 'both steps are present');
    assert.ok(write < ram, 'team.json is written before the in-memory record changes');
});

test('f2 editing a running member never interrupts or restarts it', async () => {
    await withTeam(teamFixture('team-f2', [member('alice', { id: 'child-9', status: 'working' })]), async ({ h }) => {
        await setProfile(h, 'alice', { execution_prompt: 'next turn please' });
        assert.deepEqual(h.interrupts, [], 'no interrupt was issued');
        assert.deepEqual(h.starts, [], 'no activation was started');
    });
});

// ---------------------------------------------------------------------------
// (g) the tool surface itself
// ---------------------------------------------------------------------------
test('g1 the tool is registered as a captain tool with the three parameters', async () => {
    await withTeam(undefined, async ({ h }) => {
        const tool = profileTool(h);
        assert.ok(tool !== undefined, 'agent_teams_set_member_profile is registered');
        const properties = tool.parameters.properties;
        assert.ok(properties.member_name !== undefined, 'member_name is a parameter');
        assert.ok(properties.team_id !== undefined, 'team_id is an optional parameter');
        assert.ok(properties.role !== undefined, 'role is a parameter');
        assert.ok(properties.execution_prompt !== undefined, 'execution_prompt is a parameter');
        assert.equal(tool.parameters.required.includes('member_name'), true);
        assert.equal(tool.output.schema.additionalProperties, false);
        const text = tool.output.render({}, { member_name: 'alice', changed: ['role'], role: 'x', applied: 'durable-only' });
        assert.match(text[0].text, /next time this member starts/, 'the render promises no live restart');
    });
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
let failed = 0;
for (const testCase of cases) {
    try {
        await testCase.fn();
        console.log('PASS ' + testCase.name);
    }
    catch (error) {
        failed += 1;
        console.log('FAIL ' + testCase.name + ' :: ' + (error && error.message ? error.message : String(error)));
    }
}
console.log('# ' + (cases.length - failed) + '/' + cases.length + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
