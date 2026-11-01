#!/usr/bin/env node
/**
 * Route smoke suite for the Agent Teams model-switch feature (task t3 / t14).
 *
 * Run from the repository root with one command:
 *
 *   node tests/t3-route-smoke.mjs
 *
 * It exercises the runtime surface a captain route change touches, with no
 * harness and no network:
 *   - routeOf()            precedence: fallback > override > active > declared
 *   - currentMemberRoute() live selection beats the durable record; a cold
 *                          resume falls back to routeOverride
 *   - setMemberRoute()     validate -> write team.json -> switch RAM, in that
 *                          order, never rewriting provider/model
 *   - state.js gate        readTeam()/readTeamSync() accept a valid
 *                          routeOverride and reject every malformed shape
 *
 * Exit code 0 means every case passed; 1 means at least one failed.
 */
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const pluginRoot = new URL('../packages/dsh-agent-teams/lib/', import.meta.url);
const membersMod = await import(new URL('members.js', pluginRoot).href);
const stateMod = await import(new URL('state.js', pluginRoot).href);
const { routeOf, currentMemberRoute, setMemberRoute } = membersMod;

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const legacy = { name: 'c', joinedAt: 1, status: 'idle' };
const declared = { id: '', name: 'bob', provider: 'p1', model: 'm1', reasoningEffort: 'low', joinedAt: 1, status: 'idle' };
const activeMember = { ...declared, id: 'child-1', activeProvider: 'p2', activeModel: 'm2' };
const overrideRoute = { provider: 'p3', model: 'm3', reasoningEffort: 'high', source: 'captain', at: 7 };

const stateDir = '.agent-teams';
const workspace = await mkdtemp(join(tmpdir(), 't3-route-smoke-'));
const stateRoot = join(workspace, stateDir);
const teamFile = join(stateRoot, 'team-t3', 'team.json');
await mkdir(join(stateRoot, 'team-t3'), { recursive: true });

const memberRec = () => ({ id: '', name: 'alice', provider: 'p1', model: 'm1', reasoningEffort: 'low', joinedAt: 1, status: 'idle' });
const baseTeam = (member) => ({
  id: 'team-t3', name: 'Team T3', captainSessionId: 'sess-captain',
  createdAt: 1, taskSeq: 0, phase: 'running', members: [member], tasks: [],
});
const writeTeamJson = (member) => writeFile(teamFile, JSON.stringify(baseTeam(member), null, 2));
const readTeamJson = async () => JSON.parse(await readFile(teamFile, 'utf8'));

const ctx = {
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  llm: {
    listModels: async () => [{ id: 'm1' }, { id: 'm3' }],
    resolveCallConfig: async (config) => config,
  },
  agents: { get: () => undefined },
};
const captain = {
  id: 'sess-captain',
  session: {
    header: { cwd: workspace },
    append() {},
    requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }),
  },
};

const liveCalls = [];
const diskAtSwitch = [];
let liveIds = new Set();
const selections = {
  isPendingMember: () => false,
  async withPending() {},
  liveChildIds: () => [...liveIds],
  liveRoute: () => undefined,
  setLiveRoute(id, selection) {
    liveCalls.push([id, selection]);
    // Capture the file *as the switch enters*, so a later case can prove the
    // durable write happened first.
    diskAtSwitch.push(readTeamJson);
    return liveIds.has(id);
  },
};

// ---------------------------------------------------------------------------
// routeOf: one precedence order, five branches
// ---------------------------------------------------------------------------
test('routeOf: fallbackActive + active route beats override and declared', () => {
  const member = { ...activeMember, provider: 'p1', model: 'm1', fallbackActive: true, routeOverride: overrideRoute };
  assert.deepEqual(routeOf(member), { provider: 'p2', model: 'm2', origin: 'fallback' });
});

test('routeOf: override beats active once the fallback flag is cleared', () => {
  const member = { ...activeMember, routeOverride: overrideRoute, fallbackActive: false };
  assert.deepEqual(routeOf(member), { provider: 'p3', model: 'm3', reasoningEffort: 'high', origin: 'override' });
});

test('routeOf: active wins when no override exists', () => {
  const member = { ...activeMember, fallbackActive: false };
  assert.deepEqual(routeOf(member), { provider: 'p2', model: 'm2', reasoningEffort: 'low', origin: 'active' });
});

test('routeOf: declared provider/model is the last durable route', () => {
  assert.deepEqual(routeOf(declared), { provider: 'p1', model: 'm1', reasoningEffort: 'low', origin: 'declared' });
});

test('routeOf: a legacy member with no route at all yields undefined', () => {
  assert.equal(routeOf(legacy), undefined);
  assert.equal(routeOf(undefined), undefined);
});

test('routeOf: a dangling fallbackActive flag does not hide the declared route', () => {
  const member = { id: 'x', name: 'd', provider: 'p1', model: 'm1', reasoningEffort: 'low', fallbackActive: true, joinedAt: 1, status: 'idle' };
  assert.deepEqual(routeOf(member), { provider: 'p1', model: 'm1', origin: 'declared' });
});

// ---------------------------------------------------------------------------
// currentMemberRoute: live bridge first, durable record second
// ---------------------------------------------------------------------------
test('currentMemberRoute: a live selection wins and reports origin "live"', () => {
  const live = { liveRoute: (id) => (id === 'child-1' ? { provider: 'live-p', model: 'live-m' } : undefined) };
  assert.deepEqual(currentMemberRoute(live, { ...activeMember, routeOverride: overrideRoute }), {
    provider: 'live-p', model: 'live-m', origin: 'live', live: true,
  });
});

test('currentMemberRoute: a cold member (no live ref) resolves routeOverride', () => {
  const cold = { liveRoute: () => undefined };
  assert.deepEqual(currentMemberRoute(cold, { ...activeMember, routeOverride: overrideRoute, fallbackActive: false }), {
    provider: 'p3', model: 'm3', reasoningEffort: 'high', origin: 'override', live: false,
  });
});

// ---------------------------------------------------------------------------
// setMemberRoute: durable write, RAM switch, refusal paths, audit
// ---------------------------------------------------------------------------
test('setMemberRoute: a member without a child session is durable-only (snake_case result)', async () => {
  await writeTeamJson(memberRec());
  const result = await setMemberRoute(ctx, {}, selections, captain, stateDir, 'team-t3', 'alice',
    { provider: 'p3', model: 'm3', source: 'captain', by: 'captain-1' });
  assert.equal(result.applied, 'durable-only');
  assert.equal(result.origin, 'override');
  assert.equal(result.team_id, 'team-t3');
  assert.equal(result.member_name, 'alice');
  assert.deepEqual(result.previous, { provider: 'p1', model: 'm1', origin: 'declared' });
  assert.equal(liveCalls.length, 0);
});

test('setMemberRoute: writes routeOverride to team.json and never rewrites provider/model', async () => {
  const member = (await readTeamJson()).members[0];
  assert.equal(member.provider, 'p1');
  assert.equal(member.model, 'm1');
  assert.equal(member.routeOverride.provider, 'p3');
  assert.equal(member.routeOverride.model, 'm3');
  assert.equal(member.routeOverride.source, 'captain');
  assert.equal(member.routeOverride.by, 'captain-1');
  assert.equal(typeof member.routeOverride.at, 'number');
});

test('setMemberRoute: a running member switches live and durably, reporting the fallback it replaced', async () => {
  liveCalls.length = 0;
  await writeTeamJson({ ...memberRec(), id: 'child-1', fallbackActive: true, activeProvider: 'p2', activeModel: 'm2' });
  liveIds = new Set(['child-1']);
  const result = await setMemberRoute(ctx, {}, selections, captain, stateDir, 'team-t3', 'alice',
    { provider: 'p3', model: 'm3', source: 'http' });
  assert.equal(result.applied, 'live-and-durable');
  assert.deepEqual(result.previous, { provider: 'p2', model: 'm2', origin: 'fallback' });
  assert.deepEqual(liveCalls.at(-1), ['child-1', { provider: 'p3', model: 'm3' }]);
});

test('setMemberRoute: team.json is already written when the live switch runs (disk before RAM)', async () => {
  // setLiveRoute captured readTeamJson() as it entered, so this is the file at
  // the exact moment the RAM switch happened.
  const onDisk = await diskAtSwitch.at(-1)();
  assert.deepEqual(onDisk.members[0].routeOverride, {
    provider: 'p3', model: 'm3', source: 'http', at: onDisk.members[0].routeOverride.at,
  });
  assert.equal(onDisk.members[0].provider, 'p1');
  assert.equal(onDisk.members[0].model, 'm1');
});

test('setMemberRoute: clears fallbackActive, activeProvider and activeModel', async () => {
  const member = (await readTeamJson()).members[0];
  assert.equal(member.fallbackActive, undefined);
  assert.equal(member.activeProvider, undefined);
  assert.equal(member.activeModel, undefined);
});

test('setMemberRoute: refuses a stopping member, a removed member and an unknown model, leaving the file untouched', async () => {
  await writeTeamJson({ ...memberRec(), stopping: true });
  await assert.rejects(
    () => setMemberRoute(ctx, {}, selections, captain, stateDir, 'team-t3', 'alice', { provider: 'p3', model: 'm3' }),
    /is stopping; its route cannot be changed/,
  );
  await writeTeamJson({ ...memberRec(), status: 'removed' });
  await assert.rejects(
    () => setMemberRoute(ctx, {}, selections, captain, stateDir, 'team-t3', 'alice', { provider: 'p3', model: 'm3' }),
    /is not part of team/,
  );
  await writeTeamJson(memberRec());
  await assert.rejects(
    () => setMemberRoute(ctx, {}, selections, captain, stateDir, 'team-t3', 'alice', { provider: 'p1', model: 'nope' }),
    /unknown member model "nope"/,
  );
  assert.equal((await readTeamJson()).members[0].routeOverride, undefined);
});

test('setMemberRoute: appends one audit row per accepted change to docs/log/MODEL-SWITCH.md', async () => {
  const audit = await readFile(join(workspace, 'docs', 'log', 'MODEL-SWITCH.md'), 'utf8');
  const rows = audit.split('\n').filter((line) => /^\|\s*20/.test(line));
  assert.equal(rows.length, 2);
  assert.match(rows[1], /\| alice \| p2\/m2 \| p3\/m3 \| live-and-durable \| http \|/);
});

// ---------------------------------------------------------------------------
// state.js durable gate: the new optional field must stay optional
// ---------------------------------------------------------------------------
test('readTeam: accepts a member carrying a valid routeOverride', async () => {
  await writeTeamJson({ ...memberRec(), routeOverride: { provider: 'p3', model: 'm3', source: 'captain', at: 5, by: 'captain-1' } });
  const team = await stateMod.readTeam(stateRoot, 'team-t3');
  assert.equal(team.members[0].routeOverride.model, 'm3');
});

test('readTeam: still accepts a legacy member with no routeOverride', async () => {
  await writeTeamJson(memberRec());
  const team = await stateMod.readTeam(stateRoot, 'team-t3');
  assert.equal(team.members[0].routeOverride, undefined);
});

test('readTeam/readTeamSync: reject every malformed routeOverride', async () => {
  // t102/BUG-026: 'source' KHONG con la enum dong {captain,http,profile}. Mot he ngoai ghi
  // provenance (vi du 'erp', 'migration', 'script') phai DOC DUOC, khong duoc lam chet ca doi.
  // Phan "source" o day vi vay chi con kiem HINH DANG (rong / khong phai chuoi / qua 64 ky tu /
  // chu HOA); nang luc bat loi khong mat, no doi cho sang tests/t102-erp-read-leniency.mjs
  // (b1-b5 + doi chung am f1) va tests/t58-erp-migrate.mjs f4.
  const badOverrides = {
    'blank provider': { provider: '   ', model: 'm3', source: 'captain', at: 5 },
    'blank model': { provider: 'p3', model: ' ', source: 'captain', at: 5 },
    'source blank': { provider: 'p3', model: 'm3', source: '', at: 5 },
    'source not a string': { provider: 'p3', model: 'm3', source: 123, at: 5 },
    'source too long (65 chars)': { provider: 'p3', model: 'm3', source: 'a' + 'b'.repeat(64), at: 5 },
    'source uppercase': { provider: 'p3', model: 'm3', source: 'Erp', at: 5 },
    'at not finite': { provider: 'p3', model: 'm3', source: 'captain', at: 'x' },
    'by not a string': { provider: 'p3', model: 'm3', source: 'captain', at: 5, by: 7 },
  };
  for (const [label, routeOverride] of Object.entries(badOverrides)) {
    await writeTeamJson({ ...memberRec(), routeOverride });
    let asyncMessage;
    try {
      await stateMod.readTeam(stateRoot, 'team-t3');
    } catch (error) {
      asyncMessage = error.message;
    }
    assert.match(String(asyncMessage), /invalid AgentTeams state in team/, label);
    let syncMessage;
    try {
      stateMod.readTeamSync(stateRoot, 'team-t3');
    } catch (error) {
      syncMessage = error.message;
    }
    assert.match(String(syncMessage), /invalid AgentTeams state in team/, label);
  }
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
let failed = 0;
let index = 0;
for (const { name, fn } of cases) {
  index += 1;
  try {
    await fn();
    console.log(`ok ${index} - ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`not ok ${index} - ${name}`);
    console.log(String(error?.stack ?? error).split('\n').map((line) => `    ${line}`).join('\n'));
  }
}
console.log('');
console.log(`# ${index - failed}/${index} passed, ${failed} failed`);
console.log(`# temp workspace: ${workspace}`);
process.exit(failed === 0 ? 0 : 1);
