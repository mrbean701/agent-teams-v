#!/usr/bin/env node
/**
 * ERP compatibility proof (task t20).
 *
 * Run from the repository root:
 *
 *   node tests/t20-erp-compat.mjs
 *   node tests/t20-erp-compat.mjs --source <path-to-a-team.json>
 *
 * It proves, with the fork's own readTeam()/routeOf() and no harness, that a
 * team.json written by the older plugin loads unchanged: same members, same
 * statuses, same reasoningEffort, same tasks (including the open one), no
 * routeOverride invented, and the file is only read, never rewritten. It then
 * exercises the two edges of the new field: a valid routeOverride is accepted,
 * a malformed one is refused as invalid state.
 *
 * The source path is discovered by default (a sibling ERP checkout) or passed
 * with --source; nothing is hard-coded, and nothing under the source checkout
 * is ever written. Exit code 0 = every case passed, 1 = a case failed,
 * 2 = the source team.json could not be found.
 */
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const testsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testsDir, '..');
const pluginLib = new URL('../packages/dsh-agent-teams/lib/', import.meta.url);
const { readTeam, readTeamSync, writeTeam, readMailbox, readUnreadMailbox } = await import(new URL('state.js', pluginLib).href);
const { routeOf } = await import(new URL('members.js', pluginLib).href);

const TEAM_ID = 'erp-erp';

// ---------------------------------------------------------------------------
// Source discovery
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flagValue = (flag) => {
  const at = argv.indexOf(flag);
  return at >= 0 ? argv[at + 1] : undefined;
};
const candidates = [];
const explicit = flagValue('--source');
if (explicit !== undefined) candidates.push(resolve(explicit));
else if ((process.env.AGENT_TEAMS_ERP_TEAM ?? '') !== '') candidates.push(resolve(process.env.AGENT_TEAMS_ERP_TEAM));
else {
  candidates.push(resolve(repoRoot, '..', 'ERP', '.agent-teams', TEAM_ID, 'team.json'));
  candidates.push(resolve(repoRoot, '..', '..', 'ERP', '.agent-teams', TEAM_ID, 'team.json'));
  candidates.push(resolve(repoRoot, 'tests', 'tmp', 'erp-source', TEAM_ID, 'team.json'));
}

let sourcePath;
for (const candidate of candidates) {
  try {
    await readFile(candidate);
    sourcePath = candidate;
    break;
  } catch { /* try the next candidate */ }
}
if (sourcePath === undefined) {
  console.error('# no team.json found; tried:');
  for (const candidate of candidates) console.error(`#   ${candidate}`);
  console.error('# pass one explicitly: node tests/t20-erp-compat.mjs --source <path>');
  process.exit(2);
}

const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');

// The source hash is taken BEFORE anything else touches the disk, and compared
// again by the last case: the proof that this run never wrote to the checkout.
const sourceShaBefore = await sha256(sourcePath);
const sourceRaw = await readFile(sourcePath, 'utf8');
const sourceTeam = JSON.parse(sourceRaw);

// ---------------------------------------------------------------------------
// Scratch copy (tests/tmp only)
// ---------------------------------------------------------------------------
const scratch = resolve(testsDir, 'tmp', 't20-erp-compat');
await rm(scratch, { recursive: true, force: true });
const readOnlyRoot = join(scratch, 'read-only');
const readOnlyTeamDir = join(readOnlyRoot, TEAM_ID);
await mkdir(readOnlyTeamDir, { recursive: true });
const copyPath = join(readOnlyTeamDir, 'team.json');
await copyFile(sourcePath, copyPath);
const copyShaBefore = await sha256(copyPath);

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---------------------------------------------------------------------------
// C1-C3: the copy is byte-identical, readTeam loads it, and reading does not rewrite it
// ---------------------------------------------------------------------------
test('C1 source checkout is untouched: sha256 identical before the run', async () => {
  assert.equal(copyShaBefore, sourceShaBefore);
});

let loaded;
test('C2 readTeam() loads a legacy erp-erp team.json without migration', async () => {
  loaded = await readTeam(readOnlyRoot, TEAM_ID);
  assert.notEqual(loaded, undefined);
  assert.equal(loaded.id, TEAM_ID);
  assert.equal(loaded.name, sourceTeam.name);
  assert.equal(loaded.phase, sourceTeam.phase);
  assert.equal(loaded.captainSessionId, sourceTeam.captainSessionId);
});

test('C3 readTeam() is read-only: the copy sha256 is unchanged after loading', async () => {
  assert.equal(await sha256(copyPath), copyShaBefore);
});

// ---------------------------------------------------------------------------
// C4-C6: the loaded record is lossless — members, statuses, effort, unknown fields
// ---------------------------------------------------------------------------
test('C4 all 14 members load, and the member records are byte-for-byte equal', async () => {
  assert.equal(loaded.members.length, 14);
  assert.equal(loaded.members.length, sourceTeam.members.length);
  assert.deepEqual(loaded.members, sourceTeam.members);
});

test('C5 the 7 removed members keep status "removed" and their old route', async () => {
  const removed = loaded.members.filter((member) => member.status === 'removed');
  assert.equal(removed.length, 7);
  for (const member of removed) {
    assert.equal(member.provider, 'opencode-go-new');
    assert.equal(member.model, 'minimax-m3.1-flash-free');
  }
  const live = loaded.members.filter((member) => member.status !== 'removed');
  assert.equal(live.length, 7);
  for (const member of live) {
    assert.equal(member.provider, 'opencode-go');
    assert.equal(member.model, 'deepseek-v4.1-flash');
  }
});

test('C6 reasoningEffort "max" survives on every member; unknown fields survive too', async () => {
  for (const member of loaded.members) assert.equal(member.reasoningEffort, 'max');
  const withRuntimeSetup = loaded.members.filter((member) => member.runtimeSetup !== undefined);
  assert.equal(withRuntimeSetup.length, sourceTeam.members.filter((m) => m.runtimeSetup !== undefined).length);
  assert.ok(withRuntimeSetup.length > 0, 'expected legacy runtimeSetup records');
});

test('C7 legacy data has no routeOverride, and readTeam() does not invent one', async () => {
  assert.equal(loaded.members.filter((member) => 'routeOverride' in member).length, 0);
  assert.equal(sourceTeam.members.filter((member) => 'routeOverride' in member).length, 0);
  for (const member of loaded.members) assert.equal(routeOf(member).origin, 'declared');
});

// ---------------------------------------------------------------------------
// C8: the whole task ledger survives, including the open task
// ---------------------------------------------------------------------------
test('C8 all 107 tasks survive untouched, including the in_progress one and its attempt', async () => {
  assert.equal(sourceTeam.tasks.length, 107);
  assert.equal(loaded.tasks.length, 107);
  assert.deepEqual(loaded.tasks, sourceTeam.tasks);
  const open = loaded.tasks.filter((task) => task.status === 'in_progress');
  assert.equal(open.length, 1);
  assert.equal(open[0].id, 't107');
  assert.equal(open[0].assignee, 'qa-do-2');
  assert.equal(open[0].attemptId, sourceTeam.tasks.find((task) => task.id === 't107').attemptId);
});

// ---------------------------------------------------------------------------
// C9-C10: the new field's two edges, both on a scratch copy
// ---------------------------------------------------------------------------
const overrideTeam = JSON.parse(sourceRaw);
const overrideTarget = overrideTeam.members.find((member) => member.name === 'qa-do-2');
assert.notEqual(overrideTarget, undefined, 'fixture: expected member qa-do-2 in the legacy record');
const overrideRoute = { provider: 'opencode-go', model: 'deepseek-v4.1-pro', reasoningEffort: 'high', source: 'captain', at: 1792664000000, by: 't20' };
overrideTarget.routeOverride = overrideRoute;

test('C9 a valid routeOverride added to the copy is accepted and wins in routeOf()', async () => {
  const root = join(scratch, 'override-ok');
  const dir = join(root, TEAM_ID);
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'team.json');
  await writeFile(path, JSON.stringify(overrideTeam, null, 2), 'utf8');
  const team = await readTeam(root, TEAM_ID);
  const member = team.members.find((entry) => entry.name === 'qa-do-2');
  assert.deepEqual(member.routeOverride, overrideRoute);
  assert.equal(member.provider, 'opencode-go', 'the spine must stay untouched');
  assert.equal(member.model, 'deepseek-v4.1-flash', 'the spine must stay untouched');
  const route = routeOf(member);
  assert.equal(route.origin, 'override');
  assert.equal(route.model, 'deepseek-v4.1-pro');
  assert.equal(route.reasoningEffort, 'high');
});

test('C10 a routeOverride without provider is refused as invalid state', async () => {
  const broken = JSON.parse(sourceRaw);
  const target = broken.members.find((member) => member.name === 'qa-do-2');
  target.routeOverride = { model: 'deepseek-v4.1-pro', source: 'captain', at: 1792664000000 };
  const root = join(scratch, 'override-bad');
  const dir = join(root, TEAM_ID);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'team.json'), JSON.stringify(broken, null, 2), 'utf8');
  let asyncMessage;
  try {
    await readTeam(root, TEAM_ID);
  } catch (error) {
    asyncMessage = error.message;
  }
  assert.match(String(asyncMessage), /invalid AgentTeams state in team/, 'readTeam must refuse the record');
  let syncMessage;
  try {
    readTeamSync(root, TEAM_ID);
  } catch (error) {
    syncMessage = error.message;
  }
  assert.match(String(syncMessage), /invalid AgentTeams state in team/, 'readTeamSync must refuse the record');
});

// ---------------------------------------------------------------------------
// C14-C15: the fork's own writer and the legacy mailboxes
// ---------------------------------------------------------------------------
test('C14 a fork write + re-read round-trip preserves every member and task', async () => {
  const root = join(scratch, 'round-trip');
  await mkdir(join(root, TEAM_ID), { recursive: true });
  await writeTeam(root, loaded);
  const again = await readTeam(root, TEAM_ID);
  assert.notEqual(again, undefined);
  assert.deepEqual(again.members, sourceTeam.members);
  assert.deepEqual(again.tasks, sourceTeam.tasks);
  assert.equal(again.phase, sourceTeam.phase);
});

test('C15 every legacy inbox/*.jsonl line parses; no migration of the mailboxes is needed', async () => {
  const root = join(scratch, 'full');
  const dir = join(root, TEAM_ID);
  const sourceInbox = join(dirname(sourcePath), 'inbox');
  const names = await readdir(sourceInbox);
  assert.ok(names.length > 0, 'expected legacy inbox files');
  await mkdir(join(dir, 'inbox'), { recursive: true });
  await copyFile(sourcePath, join(dir, 'team.json'));
  for (const name of names) await copyFile(join(sourceInbox, name), join(dir, 'inbox', name));
  let total = 0;
  for (const key of ['captain', 'qa-do-2', 'be-api']) {
    const malformed = [];
    const messages = await readMailbox(root, TEAM_ID, key, (line, error) => malformed.push(`${line}: ${error.message}`));
    assert.deepEqual(malformed, [], `malformed lines in the ${key} mailbox`);
    for (const message of messages) {
      assert.equal(typeof message.id, 'string');
      assert.equal(typeof message.from, 'string');
      assert.equal(message.to, key);
      assert.equal(typeof message.content, 'string');
      assert.equal(typeof message.ts, 'number');
    }
    const unread = await readUnreadMailbox(root, TEAM_ID, key);
    assert.ok(unread.length <= messages.length);
    total += messages.length;
  }
  assert.ok(total >= 300, `expected a few hundred legacy messages, saw ${total}`);
});

// ---------------------------------------------------------------------------
// C16-C18: hygiene of the proof itself
// ---------------------------------------------------------------------------
test('C16 reading created nothing in the scratch state root but the team file', async () => {
  assert.deepEqual(await readdir(readOnlyRoot), [TEAM_ID]);
  assert.deepEqual(await readdir(readOnlyTeamDir), ['team.json']);
});

test('C17 this test file carries no absolute drive path', async () => {
  const self = await readFile(fileURLToPath(import.meta.url), 'utf8');
  assert.equal(/[A-Za-z]:[\/]/.test(self), false, 'found a drive-letter path in the test file');
  // Built at run time on purpose: the needle must not be what it searches for.
  const sep = String.fromCharCode(92);
  const userDir = `${sep}${sep}Users${sep}${sep}`;
  assert.equal(self.includes(userDir), false, 'found an absolute user path in the test file');
  const checkout = ['', 'Project', ''].join('/');
  assert.equal(self.includes(checkout), false, 'found an absolute checkout path in the test file');
});

test('C18 the source checkout sha256 is still identical at the end of the run', async () => {
  assert.equal(await sha256(sourcePath), sourceShaBefore);
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
console.log(`# source: ${sourcePath}`);
console.log(`# sha256(source): ${sourceShaBefore}`);
console.log(`# scratch: ${scratch}`);
process.exit(failed === 0 ? 0 : 1);
