#!/usr/bin/env node
// Sinh docs/DEPENDENCIES.md tu team.json + docs/provenance-tasks.json.
// DAG cua doi khong giu duoc quan he hoi to (edit_plan tu choi task da start),
// nen do thi that duoc ve tu 2 nguon: canh that trong team.json + canh provenance (net dut).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const argOf = (name, fallback) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const teamDir = path.resolve(repoRoot, argOf('team', '.agent-teams/nami-agent-teams'));
const outFile = path.resolve(repoRoot, argOf('out', 'docs/DEPENDENCIES.md'));
const provFile = path.resolve(repoRoot, 'docs/provenance-tasks.json');

const team = JSON.parse(fs.readFileSync(path.join(teamDir, 'team.json'), 'utf8'));
const prov = fs.existsSync(provFile) ? JSON.parse(fs.readFileSync(provFile, 'utf8')) : { edges: [] };
const tasks = team.tasks;
const byId = new Map(tasks.map(t => [t.id, t]));
const statusOf = t => t.status || 'pending';
// Mot task da FAIL co the duoc thay the boi task sua/xac nhan (khai trong prov.superseded).
// Trong do thi provenance, canh tro toi task da bi thay the phai doc trang thai CUA BAN THAY THE,
// neu khong se bao dong gia "cha van failed" cho mot nhanh da duoc xu ly.
const supersededBy = prov.superseded || {};
const effectiveStatusOf = (t) => {
    const seenIds = new Set();
    let cur = t;
    while (cur && supersededBy[cur.id] && !seenIds.has(cur.id)) {
        seenIds.add(cur.id);
        const next = byId.get(supersededBy[cur.id]);
        if (!next) break;
        cur = next;
    }
    return statusOf(cur);
};
const ICON = { completed: '\u2705', in_progress: '\uD83D\uDD04', pending: '\u2B1C', failed: '\u274C', cancelled: '\u26D4' };
const icon = s => ICON[s] || ICON.pending;
const assigneeOf = t => t.assignee || '\u2014';

const realEdges = [];
for (const t of tasks) for (const d of t.dependencies || []) realEdges.push({ from: d, to: t.id, kind: 'dag' });
const derivedEdges = (prov.edges || []).filter(e => byId.has(e.from) && byId.has(e.to));
const ghostEdges = (prov.edges || []).filter(e => !byId.has(e.from) || !byId.has(e.to));
const parentsOf = new Map();
for (const e of [...realEdges, ...derivedEdges]) { if (!parentsOf.has(e.to)) parentsOf.set(e.to, []); parentsOf.get(e.to).push(e); }

const problems = [];
const seen = new Set();
const dfs = (id, stack) => {
  if (stack.includes(id)) { problems.push('CHU TRINH: ' + [...stack.slice(stack.indexOf(id)), id].join(' -> ')); return; }
  if (seen.has(id)) return;
  seen.add(id);
  for (const e of parentsOf.get(id) || []) dfs(e.from, [...stack, id]);
};
for (const t of tasks) dfs(t.id, []);
for (const e of ghostEdges) problems.push('provenance tro toi task khong ton tai: ' + e.from + ' -> ' + e.to);
for (const t of tasks) if (statusOf(t) === 'completed') for (const e of parentsOf.get(t.id) || []) {
  const par = byId.get(e.from);
  if (par && effectiveStatusOf(par) !== 'completed') problems.push(t.id + ' da completed nhung cha ' + par.id + ' van ' + statusOf(par) + ' (' + e.kind + ')');
}

const waveOf = new Map();
const wave = (id, guard) => {
  if (waveOf.has(id)) return waveOf.get(id);
  guard = guard || new Set();
  if (guard.has(id)) return 0;
  guard.add(id);
  const parents = (parentsOf.get(id) || []).map(e => e.from);
  const w = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(x => wave(x, guard)));
  waveOf.set(id, w);
  return w;
};
for (const t of tasks) wave(t.id);
const waves = [];
for (const t of tasks) { const w = waveOf.get(t.id); (waves[w] = waves[w] || []).push(t); }

const label = t => t.id + '<br/>' + icon(statusOf(t)) + ' ' + statusOf(t) + '<br/>' + assigneeOf(t);
const gl = [];
gl.push('flowchart LR');
waves.forEach((group, w) => {
  gl.push('  subgraph W' + w + '["Song ' + w + '"]');
  gl.push('    direction TB');
  for (const t of group) gl.push('    ' + t.id + '["' + label(t) + '"]');
  gl.push('  end');
});
for (const e of realEdges) if (byId.has(e.from)) gl.push('  ' + e.from + ' --> ' + e.to);
for (const e of derivedEdges) gl.push('  ' + e.from + ' -.->|' + e.kind + '| ' + e.to);

const md = [];
const F = '```';
md.push('# DEPENDENCIES \u2014 do thi phu thuoc cua doi ' + team.name);
md.push('');
md.push('> File sinh tu dong boi `node tools/dependency-report.mjs`. KHONG sua tay: sua du lieu goc roi chay lai.');
md.push('> Nguon: `.agent-teams/' + team.name + '/team.json` (canh that) + `docs/provenance-tasks.json` (canh provenance).');
md.push('> Sinh luc: ' + new Date().toISOString() + ' \u00b7 pha doi: **' + team.phase + '** \u00b7 ' + tasks.length + ' task / ' + team.members.length + ' member.');
md.push('');
md.push('## 1. Cach doc');
md.push('');
md.push('| Ky hieu | Nghia |');
md.push('| --- | --- |');
md.push('| `-->` | Phu thuoc THAT trong DAG cua doi (tool va scheduler cung thay) |');
md.push('| `-.->` + nhan | Quan he provenance: task nay sinh ra tu task kia. DAG khong giu duoc vi `agent_teams_edit_plan` tu choi task da start |');
md.push('| \u2705 / \uD83D\uDD04 / \u2B1C / \u274C | completed / in_progress / pending / failed |');
md.push('| Song N | Muc toi thieu cua do thi: moi task chi phu thuoc task o song nho hon |');
md.push('');
md.push(F + 'mermaid');
md.push(gl.join('\n'));
md.push(F);
md.push('');
md.push('## 2. Bang theo song (thu tu thi cong)');
md.push('');
md.push('| Song | Task | Trang thai | Member | Phu thuoc that | Sinh tu (provenance) |');
md.push('| --- | --- | --- | --- | --- | --- |');
waves.forEach((group, w) => {
  group.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  for (const t of group) {
    const real = (t.dependencies || []).slice().sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join(', ') || '\u2014';
    const der = (parentsOf.get(t.id) || []).filter(e => e.kind !== 'dag').map(e => e.from + ' (' + e.kind + ')').join(', ') || '\u2014';
    md.push('| ' + w + ' | ' + t.id + ' | ' + icon(statusOf(t)) + ' ' + statusOf(t) + ' | ' + assigneeOf(t) + ' | ' + real + ' | ' + der + ' |');
  }
});
md.push('');
md.push('## 3. Kiem tra tinh hop le');
md.push('');
if (problems.length === 0) md.push('Khong phat hien van de: khong chu trinh, khong canh treo, khong task nao completed khi cha chua xong.');
else { md.push('| Van de |'); md.push('| --- |'); for (const x of problems) md.push('| ' + x + ' |'); }
md.push('');
md.push('## 4. Quy tac cap nhat');
md.push('');
md.push('1. Task tiep noi MOI phai tao bang `agent_teams_create_task` **co truyen `dependencies`** cua task goc.');
md.push('2. Neu task goc da start (khong them deps hoi to duoc), ghi canh provenance vao `docs/provenance-tasks.json` roi chay lai script.');
md.push('3. Chay lai script truoc moi bao cao tien do; bang song trong bao cao phai khop file nay.');

fs.writeFileSync(outFile, md.join('\n') + '\n', 'utf8');
console.log('wrote ' + path.relative(repoRoot, outFile) + ' | tasks=' + tasks.length + ' realEdges=' + realEdges.length + ' derivedEdges=' + derivedEdges.length + ' waves=' + waves.length + ' problems=' + problems.length);
for (const x of problems) console.log('  PROBLEM: ' + x);
