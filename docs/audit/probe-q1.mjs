/**
 * Audit t12 / Q1 probe — cold-resume route and descriptor guard, run against the
 * plugin's REAL modules (lib/state.js, lib/members.js). Read-only: it writes only
 * into a fresh temp dir.
 *
 *   node docs/audit/probe-q1.mjs
 */
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const lib = new URL('../../packages/dsh-agent-teams/lib/', import.meta.url);
const state = await import(new URL('state.js', lib).href);
const members = await import(new URL('members.js', lib).href);

const out = [];
const say = (s) => { out.push(s); console.log(s); };

// ---- fixture: a member spawned on p1/m1, then route-switched to p2/m2
const workspace = await mkdtemp(join(tmpdir(), 'audit-q1-'));
const stateRoot = join(workspace, '.agent-teams');
await mkdir(join(stateRoot, 'team-q1'), { recursive: true });
const member = {
  id: 'child-1', name: 'alice', provider: 'p1', model: 'm1', reasoningEffort: 'low',
  joinedAt: 1, status: 'working',
  routeOverride: { provider: 'p2', model: 'm2', reasoningEffort: 'high', source: 'captain', at: 7, by: 'session-cap' },
};
const team = {
  id: 'team-q1', name: 'Q1', captainSessionId: 'sess-cap', createdAt: 1, taskSeq: 0,
  phase: 'running', members: [member], tasks: [],
};
await writeFile(join(stateRoot, 'team-q1', 'team.json'), JSON.stringify(team, null, 2));

// 1) durable read
const read = await state.readTeam(stateRoot, 'team-q1');
const rm = read.members[0];
say('READ  provider/model = ' + rm.provider + '/' + rm.model + '   routeOverride = ' + JSON.stringify(rm.routeOverride));

// 2) the real precedence function the resume path calls (lib/members.js:619-620)
say('routeOf(member) = ' + JSON.stringify(members.routeOf(rm)));

// 3) the descriptor guard predicate transcribed verbatim from lib/members.js:621
const declared = { provider: rm.provider, model: rm.model };
for (const c of [
  { label: 'descriptor = spawn-time p1/m1 (route switched after spawn)', d: { agentProvider: 'p1', agentModel: 'm1' } },
  { label: 'descriptor = new route p2/m2 (spawned after the switch)',   d: { agentProvider: 'p2', agentModel: 'm2' } },
]) {
  const mismatch = c.d.agentProvider !== declared.provider || c.d.agentModel !== declared.model;
  say('GUARD ' + c.label + ' | declared ' + declared.provider + '/' + declared.model
      + ' descriptor ' + c.d.agentProvider + '/' + c.d.agentModel + ' -> THROW=' + mismatch);
}

// 4) legacy team.json (0.1.28 shape) must still read
await mkdir(join(stateRoot, 'team-legacy'), { recursive: true });
await writeFile(join(stateRoot, 'team-legacy', 'team.json'), JSON.stringify({
  id: 'team-legacy', name: 'L', captainSessionId: 'sess-old', createdAt: 1, taskSeq: 0, phase: 'running',
  members: [{ id: 'c-legacy', name: 'bob', provider: 'p9', model: 'm9', joinedAt: 1, status: 'idle' }], tasks: [],
}, null, 2));
const legacy = await state.readTeam(stateRoot, 'team-legacy');
say('LEGACY read ok = ' + (legacy !== undefined) + '   routeOf = ' + JSON.stringify(legacy === undefined ? null : members.routeOf(legacy.members[0])));

// 5) is the promised session event type known to this harness?
let known = 'unresolved';
try {
  const dshSession = await import('@deepseek-ai/dsh-session');
  const set = dshSession.KNOWN_SESSION_EVENT_TYPES;
  known = set === undefined ? 'no KNOWN_SESSION_EVENT_TYPES export' : String(set.has('agent-teams/member-route-changed'));
} catch (error) {
  known = 'import failed: ' + String(error).split('\n')[0];
}
say('EVENT known(agent-teams/member-route-changed) = ' + known);

// 6) bundle freshness: does the shipped lib/client.js carry the current source?
const pluginRoot = lib;
const map = JSON.parse(await readFile(new URL('client.js.map', pluginRoot), 'utf8'));
const idx = map.sources.findIndex((s) => s.endsWith('client/MemberControls.js'));
const current = await readFile(new URL('client/MemberControls.js', pluginRoot), 'utf8');
const embedded = idx === -1 ? undefined : (map.sourcesContent?.[idx] ?? undefined);
say('BUNDLE sources=' + map.sources.length + ' MemberControls index=' + idx
    + ' embeddedMatchesCurrentSource=' + (embedded === current)
    + ' client.js has set_member_route=' + (await readFile(new URL('client.js', pluginRoot), 'utf8')).includes('set_member_route'));

// 7) ERP team.json roster size against the new caps (read-only)
try {
  const erp = JSON.parse(await readFile('E:/Project/ERP/.agent-teams/erp-erp/team.json', 'utf8'));
  const active = erp.members.filter((m) => m.status !== 'removed').length;
  say('ERP members total=' + erp.members.length + ' active=' + active + ' removed=' + (erp.members.length - active)
      + ' -> overCap8=' + (active > 8) + ' overCap12=' + (active > 12));
} catch (error) {
  say('ERP read failed: ' + String(error).split('\n')[0]);
}
say('PROBE DONE temp=' + workspace);
