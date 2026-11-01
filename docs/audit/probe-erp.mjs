import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const LIB = new URL('../../packages/dsh-agent-teams/lib/', import.meta.url);
const state = await import(pathToFileURL(join(LIB.pathname.replace(/^\//, ''), 'state.js')).href);
const members = await import(pathToFileURL(join(LIB.pathname.replace(/^\//, ''), 'members.js')).href);

const ERP = 'E:/Project/ERP/.agent-teams/erp-erp/team.json';
const raw = readFileSync(ERP);
const sha0 = createHash('sha256').update(raw).digest('hex');
const root = mkdtempSync(join(tmpdir(), 'audit-erp-'));
mkdirSync(join(root, '.agent-teams', 'erp-erp'), { recursive: true });
writeFileSync(join(root, '.agent-teams', 'erp-erp', 'team.json'), raw);
const team = await state.readTeam(join(root, '.agent-teams'), 'erp-erp');
const shaAfterRead = createHash('sha256').update(readFileSync(join(root, '.agent-teams', 'erp-erp', 'team.json'))).digest('hex');
const active = team.members.filter((m) => m.status !== 'removed');
console.log('ERP team', JSON.stringify({ id: team.id, phase: team.phase, members: team.members.length, active: active.length, tasks: team.tasks.length }));
console.log('statuses', JSON.stringify(team.members.reduce((a, m) => (a[m.status] = (a[m.status] || 0) + 1, a), {})));
console.log('overrides present on legacy file =', team.members.filter((m) => m.routeOverride !== undefined).length);
console.log('readTeam left bytes identical =', shaAfterRead === sha0, 'sha', sha0.slice(0, 16));
console.log('routes (declared):', JSON.stringify(active.map((m) => m.name + '=' + m.provider + '/' + m.model + '#' + (m.status))));
// cap arithmetic for add_member: the plugin counts non-removed rows
const cap = 12;
console.log('cap check: active', active.length, '>= cap', cap, '->', active.length >= cap, '| headroom', cap - active.length);
// now inject one durable override on a real member and prove cold read resolves it
const clone = JSON.parse(JSON.stringify(team));
const first = clone.members.find((m) => m.status !== 'removed');
first.routeOverride = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4.1-flash', reasoningEffort: 'high', source: 'captain', at: Date.now(), by: 'audit:probe-erp' };
writeFileSync(join(root, '.agent-teams', 'erp-erp', 'team.json'), JSON.stringify(clone, null, 2));
const team2 = await state.readTeam(join(root, '.agent-teams'), 'erp-erp');
const target = team2.members.find((m) => m.name === first.name);
console.log('override read back =', JSON.stringify(target.routeOverride));
console.log('routeOf after override =', JSON.stringify(members.routeOf(target)));
console.log('declared spine untouched =', target.provider + '/' + target.model);
// malformed override must be rejected at the durable boundary
const bad = JSON.parse(JSON.stringify(clone));
bad.members[0].routeOverride = { provider: 'p', model: 'm', source: 'evil', at: 1 };
writeFileSync(join(root, '.agent-teams', 'erp-erp', 'team.json'), JSON.stringify(bad, null, 2));
let rejected = false;
try { await state.readTeam(join(root, '.agent-teams'), 'erp-erp'); } catch { rejected = true; }
console.log('malformed override rejected by readTeam =', rejected);
rmSync(root, { recursive: true, force: true });
console.log('PROBE-ERP DONE');
