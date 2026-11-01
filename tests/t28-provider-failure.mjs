#!/usr/bin/env node
/**
 * Provider-failure durability suite (task t28 / NFR-KHANG-LOI-PROVIDER-01).
 *
 * Run from the repository root with one command:
 *
 *   node tests/t28-provider-failure.mjs
 *
 * Three provider deaths — opencode-go 429 "GoUsageLimitError",
 * deepseek-official "Insufficient Balance (QUOTA)" and command-code-claude
 * "404 PI_AI_ERROR" — used to reach the captain only as a member that went
 * quiet. This suite pins the durable trace that fixes it:
 *   - isProviderFailure()      recognises a provider death and rejects a turn bug
 *   - providerFailureRecord()  names the route that died, clips the message
 *   - failMemberOpenAttempt()  writes member.lastFailure in team.json, in the
 *                              same durable write as the failed attempt, and
 *                              records nothing for a non-provider failure
 *   - state.js gate            a legacy team.json (no lastFailure) still reads;
 *                              a malformed lastFailure is rejected
 *   - assembleTeamSnapshot()   surfaces lastFailure on the panel member row
 *
 * Exit code 0 means every case passed; 1 means at least one failed.
 */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const pluginRoot = new URL('../packages/dsh-agent-teams/lib/', import.meta.url);
const membersMod = await import(new URL('members.js', pluginRoot).href);
const stateMod = await import(new URL('state.js', pluginRoot).href);
const snapshotMod = await import(new URL('snapshot.js', pluginRoot).href);
const {
    isProviderFailure, providerFailureRecord, failMemberOpenAttempt, MEMBER_FAILURE_MESSAGE_MAX,
} = membersMod;
const { readTeam, readTeamSync, writeTeam } = stateMod;
const { assembleTeamSnapshot } = snapshotMod;

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const workspace = await mkdtemp(join(tmpdir(), 't28-provider-failure-'));
const stateRoot = join(workspace, '.agent-teams');
const teamId = 'team-t28';
const teamFile = join(stateRoot, teamId, 'team.json');
await mkdir(join(stateRoot, teamId), { recursive: true });

const memberRec = (over = {}) => ({
    id: 'child-a',
    name: 'worker-a',
    provider: 'command-code-goat',
    model: 'deepseek/deepseek-v4-flash',
    reasoningEffort: 'high',
    joinedAt: 1,
    status: 'idle',
    ...over,
});
const teamRec = (members, tasks = []) => ({
    id: teamId,
    name: 'Team T28',
    captainSessionId: 'sess-captain',
    createdAt: 1,
    taskSeq: 1,
    phase: 'running',
    members,
    tasks,
});
const writeTeamJson = async (team) => writeTeam(stateRoot, team);
const readTeamJson = async () => JSON.parse(await readFile(teamFile, 'utf8'));

const ctx = {
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    // No live agents: every member turn is observed as not running, and no
    // captain is resident, which is the cold state this trace exists for.
    agents: { get: () => undefined },
};
const memberSession = { id: 'sess-member-a', append() {} };
const observedFor = (task) => ({ captainSessionId: 'sess-captain', memberId: 'child-a', task });

const quotaFailure = { code: 'QUOTA', message: 'Insufficient Balance (QUOTA)' };

// ---------------------------------------------------------------------------
// isProviderFailure: the three recorded production deaths, and a turn bug
// ---------------------------------------------------------------------------
test('isProviderFailure: opencode-go 429 GoUsageLimitError', () => {
    assert.equal(isProviderFailure({ code: 'QUOTA', message: 'GoUsageLimitError: too many requests (429)' }), true);
});

test('isProviderFailure: deepseek-official Insufficient Balance (QUOTA)', () => {
    assert.equal(isProviderFailure(quotaFailure), true);
});

test('isProviderFailure: command-code-claude 404 PI_AI_ERROR', () => {
    assert.equal(isProviderFailure({ code: 'UNKNOWN', message: 'PI_AI_ERROR: 404 no such upstream model' }), true);
});

test('isProviderFailure: a throttled account is the same class of death', () => {
    assert.equal(isProviderFailure({ code: 'RATE_LIMIT', message: 'slow down' }), true);
});

test('isProviderFailure: a turn bug is not a provider failure', () => {
    assert.equal(isProviderFailure({ code: 'UNKNOWN', message: "Cannot read properties of undefined (reading 'id')" }), false);
    assert.equal(isProviderFailure(new TypeError('x is not a function')), false);
});

test('isProviderFailure: nothing to judge yields false', () => {
    assert.equal(isProviderFailure(undefined), false);
    assert.equal(isProviderFailure({}), false);
    assert.equal(isProviderFailure({ code: '   ', message: '  ' }), false);
});

// ---------------------------------------------------------------------------
// providerFailureRecord: the route that died, small enough to keep durably
// ---------------------------------------------------------------------------
test('providerFailureRecord: names the route that actually died', () => {
    const dying = memberRec({
        routeOverride: { provider: 'opencode-go', model: 'go-fast', reasoningEffort: 'low', source: 'captain', at: 5 },
    });
    const record = providerFailureRecord(dying, quotaFailure, 1234);
    assert.deepEqual(record, {
        code: 'QUOTA', message: 'Insufficient Balance (QUOTA)', at: 1234, provider: 'opencode-go', model: 'go-fast',
    });
});

test('providerFailureRecord: clips a huge provider message to the durable budget', () => {
    const record = providerFailureRecord(memberRec(), { code: 'QUOTA', message: 'x'.repeat(1200) }, 7);
    assert.equal(record.message.length, MEMBER_FAILURE_MESSAGE_MAX);
    assert.ok(record.message.endsWith('…'));
    assert.equal(MEMBER_FAILURE_MESSAGE_MAX, 300);
});

test('providerFailureRecord: no trace for a non-provider failure', () => {
    assert.equal(providerFailureRecord(memberRec(), { code: 'UNKNOWN', message: 'boom' }, 1), undefined);
});

test('providerFailureRecord: no trace without a member to hang it on', () => {
    assert.equal(providerFailureRecord(undefined, quotaFailure, 1), undefined);
});

test('providerFailureRecord: a legacy member with no route keeps an empty route', () => {
    const record = providerFailureRecord({ id: 'child-b', name: 'worker-b', joinedAt: 1, status: 'idle' }, quotaFailure, 9);
    assert.equal(record.provider, '');
    assert.equal(record.model, '');
});

// ---------------------------------------------------------------------------
// failMemberOpenAttempt: the durable write, in team.json
// ---------------------------------------------------------------------------
test('failMemberOpenAttempt: records lastFailure with the failed attempt', async () => {
    const task = { id: 't-1', subject: 'work', assignee: 'worker-a', status: 'claimed', attemptId: 'attempt-1', dependencies: [], createdAt: 1, updatedAt: 1 };
    await writeTeamJson(teamRec([memberRec()], [task]));
    const recorded = await failMemberOpenAttempt(ctx, stateRoot, teamId, 'worker-a', quotaFailure, { session: memberSession, id: 'sess-member-a' }, observedFor({ id: 't-1', attemptId: 'attempt-1' }));
    assert.equal(recorded, true);
    const onDisk = await readTeamJson();
    assert.equal(onDisk.tasks[0].status, 'failed');
    assert.deepEqual(Object.keys(onDisk.members[0].lastFailure).sort(), ['at', 'code', 'message', 'model', 'provider']);
    assert.equal(onDisk.members[0].lastFailure.code, 'QUOTA');
    assert.equal(onDisk.members[0].lastFailure.message, 'Insufficient Balance (QUOTA)');
    assert.equal(onDisk.members[0].lastFailure.provider, 'command-code-goat');
    assert.equal(onDisk.members[0].lastFailure.model, 'deepseek/deepseek-v4-flash');
    assert.ok(Number.isFinite(onDisk.members[0].lastFailure.at) && onDisk.members[0].lastFailure.at > 0);
});

test('failMemberOpenAttempt: the state gate reads back the trace it wrote', async () => {
    const back = await readTeam(stateRoot, teamId);
    assert.equal(back.members[0].lastFailure.code, 'QUOTA');
    assert.equal(readTeamSync(stateRoot, teamId).members[0].lastFailure.code, 'QUOTA');
});

test('failMemberOpenAttempt: a provider death is recorded even with no open attempt', async () => {
    await writeTeamJson(teamRec([memberRec()], [{ id: 't-0', subject: 'done', assignee: 'worker-a', status: 'completed', dependencies: [], createdAt: 1, updatedAt: 1 }]));
    const recorded = await failMemberOpenAttempt(ctx, stateRoot, teamId, 'worker-a', quotaFailure, { session: memberSession }, observedFor(undefined));
    assert.equal(recorded, true);
    const onDisk = await readTeamJson();
    assert.equal(onDisk.members[0].lastFailure.code, 'QUOTA');
    assert.equal(onDisk.tasks[0].status, 'completed');
});

test('failMemberOpenAttempt: a non-provider failure records no trace', async () => {
    await writeTeamJson(teamRec([memberRec()]));
    const recorded = await failMemberOpenAttempt(ctx, stateRoot, teamId, 'worker-a', { code: 'UNKNOWN', message: 'a bug inside the turn' }, { session: memberSession }, observedFor(undefined));
    assert.equal(recorded, true);
    const onDisk = await readTeamJson();
    assert.equal('lastFailure' in onDisk.members[0], false);
});

// ---------------------------------------------------------------------------
// state.js gate: compatibility forwards, strictness where it protects the audit
// ---------------------------------------------------------------------------
const rawTeam = (member) => JSON.stringify(teamRec([member]), null, 2);

test('state gate: a team.json written before lastFailure existed still reads', async () => {
    const legacy = memberRec();
    delete legacy.lastFailure;
    await writeFile(teamFile, rawTeam(legacy));
    const asyncRead = await readTeam(stateRoot, teamId);
    assert.equal('lastFailure' in asyncRead.members[0], false);
    assert.equal('lastFailure' in readTeamSync(stateRoot, teamId).members[0], false);
});

test('state gate: a lastFailure of the wrong shape is rejected', async () => {
    await writeFile(teamFile, rawTeam(memberRec({ lastFailure: 'QUOTA' })));
    await assert.rejects(() => readTeam(stateRoot, teamId), /invalid AgentTeams state in team/);
    assert.throws(() => readTeamSync(stateRoot, teamId), /invalid AgentTeams state in team/);
});

test('state gate: a mistyped field inside lastFailure is rejected', async () => {
    await writeFile(teamFile, rawTeam(memberRec({ lastFailure: { code: 'QUOTA', message: 42, at: 1 } })));
    await assert.rejects(() => readTeam(stateRoot, teamId), /invalid AgentTeams state in team/);
    await writeFile(teamFile, rawTeam(memberRec({ lastFailure: { code: 'QUOTA', message: 'x' } })));
    await assert.rejects(() => readTeam(stateRoot, teamId), /invalid AgentTeams state in team/);
});

// ---------------------------------------------------------------------------
// snapshot: what the panel and status surface can actually see
// ---------------------------------------------------------------------------
test('snapshot: lastFailure reaches the panel member row', async () => {
    const trace = { code: 'QUOTA', message: 'Insufficient Balance (QUOTA)', at: 99, provider: 'opencode-go', model: 'go-fast' };
    const team = teamRec([memberRec({ lastFailure: trace })]);
    await writeTeamJson(team);
    const snapshot = await assembleTeamSnapshot(ctx, stateRoot, 'ws-t28', team);
    assert.deepEqual(snapshot.members[0].lastFailure, trace);
});

test('snapshot: a member without a trace has no lastFailure key', async () => {
    const team = teamRec([memberRec()]);
    await writeTeamJson(team);
    const snapshot = await assembleTeamSnapshot(ctx, stateRoot, 'ws-t28', team);
    assert.equal('lastFailure' in snapshot.members[0], false);
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
