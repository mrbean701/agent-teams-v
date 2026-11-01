#!/usr/bin/env node
/**
 * t40 — test cho tools/erp-route-proposal.mjs (cong cu CHI DOC de xuat di tru route).
 *
 * Cach ly: moi case phan tich chay tren BAN COPY trong tests/tmp/t40/.
 * Dung MOT case chay tren tep that E:/.../ERP/.agent-teams/erp-erp/team.json va khang dinh
 * sha256 truoc == sau (bat bien: cong cu chi doc, khong duoc ghi).
 *
 * Chay: node tests/t40-erp-proposal.mjs
 */
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const TOOL = join(REPO_ROOT, 'tools', 'erp-route-proposal.mjs');
const TMP = join(REPO_ROOT, 'tests', 'tmp', 't40');
// Doi ERP nam canh repo nay; khong dung duong dan tuyet doi.
const ERP_TEAM = resolve(REPO_ROOT, '..', 'ERP', '.agent-teams', 'erp-erp', 'team.json');

const results = [];
function check(id, ok, detail) {
    results.push({ id, ok: ok === true, detail: String(detail ?? '') });
    console.log((ok === true ? 'PASS' : 'FAIL') + ' ' + id + ' — ' + String(detail ?? ''));
}
function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}
function run(args) {
    const child = spawnSync(process.execPath, [TOOL, ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
    return { code: child.status, out: child.stdout ?? '', err: child.stderr ?? '' };
}
function expectedPairs(team) {
    const byName = new Map(team.members.map((m) => [m.name, m]));
    let count = 0;
    for (const member of team.members) {
        if (member.status === 'removed') continue;
        const match = /^(.+)-(\d+)$/.exec(String(member.name));
        if (match === null) continue;
        if (Number(match[2]) < 2) continue;
        const base = byName.get(match[1]);
        if (base !== undefined && base.status === 'removed') count += 1;
    }
    return count;
}

mkdirSync(TMP, { recursive: true });

// ---------- Case A: ban copy cua team ERP that ----------
const copyPath = join(TMP, 'team-erp.json');
copyFileSync(ERP_TEAM, copyPath);
const copyBefore = readFileSync(copyPath);
const copyHashBefore = sha256(copyBefore);
const copyTeam = JSON.parse(copyBefore.toString('utf8'));
const pairsWanted = expectedPairs(copyTeam);

const a = run(['--team', copyPath]);
check('A1 copy exit 0', a.code === 0, 'exit=' + a.code + ' stderr=' + a.err.trim().slice(0, 200));
check('A2 copy identical = true', a.out.includes('identical = true'), 'dong identical: ' + (a.out.split('\n').find((l) => l.startsWith('identical')) ?? '(khong co)'));
const hashBeforeLine = a.out.split('\n').find((l) => l.startsWith('sha256 before')) ?? '';
const hashAfterLine = a.out.split('\n').find((l) => l.startsWith('sha256 after')) ?? '';
const hashBeforeValue = hashBeforeLine.replace('sha256 before = ', '').trim();
const hashAfterValue = hashAfterLine.replace('sha256 after  = ', '').trim();
check('A3 copy hai dong sha256 bang nhau', hashBeforeValue.length === 64 && hashBeforeValue === hashAfterValue, hashBeforeValue.slice(0, 16) + ' == ' + hashAfterValue.slice(0, 16));
check('A4 copy co dong thong ke cap', a.out.includes('cap de xuat duoc: ' + pairsWanted), 'mong doi cap de xuat duoc: ' + pairsWanted);
check('A5 copy >= 3 cap', pairsWanted >= 3, 'so cap = ' + pairsWanted);
const ajson = run(['--team', copyPath, '--json']);
let ajsonData = null;
try { ajsonData = JSON.parse(ajson.out); } catch (error) { ajsonData = null; }
check('A6 copy --json parse duoc va du cap', ajson.code === 0 && ajsonData !== null && ajsonData.pairs.length === pairsWanted,
    'exit=' + ajson.code + ' pairs=' + (ajsonData === null ? 'unparsable' : ajsonData.pairs.length));
check('A7 sau khi phan tich, sha256 tep copy KHONG doi', sha256(readFileSync(copyPath)) === copyHashBefore, 'sha256=' + copyHashBefore.slice(0, 16));

// ---------- Case B: tep ERP THAT (bat bien chi doc) ----------
const realBefore = readFileSync(ERP_TEAM);
const realHashBefore = sha256(realBefore);
const realStatBefore = statSync(ERP_TEAM);
const b = run(['--team', ERP_TEAM]);
const realAfter = readFileSync(ERP_TEAM);
const realHashAfter = sha256(realAfter);
const realStatAfter = statSync(ERP_TEAM);
check('B1 tep ERP that: exit 0', b.code === 0, 'exit=' + b.code + ' stderr=' + b.err.trim().slice(0, 200));
check('B2 tep ERP that: identical = true', b.out.includes('identical = true'), (b.out.split('\n').find((l) => l.startsWith('identical')) ?? '(khong co)'));
check('B3 sha256 tep ERP that truoc == sau (do chinh test do)', realHashBefore === realHashAfter && realStatBefore.size === realStatAfter.size,
    realHashBefore + ' / size ' + realStatBefore.size + ' -> ' + realHashAfter + ' / size ' + realStatAfter.size);
check('B4 tep ERP that: khong doi mtime', realStatBefore.mtimeMs === realStatAfter.mtimeMs, 'mtimeMs ' + realStatBefore.mtimeMs + ' -> ' + realStatAfter.mtimeMs);
const bjson = run(['--team', ERP_TEAM, '--json']);
let bjsonData = null;
try { bjsonData = JSON.parse(bjson.out); } catch (error) { bjsonData = null; }
check('B5 tep ERP that: >= 3 cap va khop voi ban copy', bjsonData !== null && bjsonData.pairs.length >= 3 && bjsonData.pairs.length === pairsWanted,
    'cap tren tep that = ' + (bjsonData === null ? 'unparsable' : bjsonData.pairs.length));

// ---------- Case C: fixture tong hop co member le ----------
const syntheticPath = join(TMP, 'team-synthetic.json');
const synthetic = {
    id: 'synthetic', name: 'Doi kiem thu tong hop', phase: 'running', captainSessionId: 'session-synthetic',
    members: [
        { name: 'captain', id: 'cap', role: 'captain', status: 'working', provider: 'p', model: 'm' },
        { name: 'z', id: 'z-1', role: 'engineer', status: 'removed', provider: 'p', model: 'm-old' },
        { name: 'z-2', id: 'z-2', role: 'engineer', status: 'idle', provider: 'p', model: 'm-new', reasoningEffort: 'high' },
        { name: 'x-2', id: 'x-2', role: 'qa', status: 'idle', provider: 'p', model: 'm-x' },
        { name: 'y', id: 'y-1', role: 'qa', status: 'removed', provider: 'p', model: 'm-y' },
    ],
    tasks: {
        0: { id: '0', subject: 'dang mo', status: 'in_progress', assignee: 'z-2' },
        1: { id: '1', subject: 'xong', status: 'completed', assignee: 'z' },
    },
};
writeFileSync(syntheticPath, JSON.stringify(synthetic, null, 2));
const synHashBefore = sha256(readFileSync(syntheticPath));
const c = run(['--team', syntheticPath]);
check('C1 fixture le: exit 0', c.code === 0, 'exit=' + c.code);
check('C2 fixture le: 1 cap, 2 member khong suy ra duoc', c.out.includes('cap de xuat duoc: 1') && c.out.includes('member khong suy ra duoc cap: 2'),
    (c.out.split('\n').filter((l) => l.startsWith('- cap de xuat') || l.startsWith('- member khong suy ra')).join(' | ')));
check('C3 fixture le: canh bao neu ten x-2 va y', c.out.includes('x-2') && c.out.includes('y ['),
    'co x-2=' + c.out.includes('x-2') + ' co y=' + c.out.includes('- y ['));
check('C4 fixture le: canh bao task dang mo cua z-2', c.out.includes('dang giu 1 task chua ket thuc'), 'co canh bao task mo = ' + c.out.includes('task chua ket thuc'));
check('C5 fixture le: tep khong doi', sha256(readFileSync(syntheticPath)) === synHashBefore, 'sha256=' + synHashBefore.slice(0, 16));

// ---------- Case D: bang chung tinh — ma nguon chi doc ----------
const source = readFileSync(TOOL, 'utf8');
const forbidden = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'renameSync', 'openSync', 'createWriteStream', 'copyFileSync'];
const found = forbidden.filter((name) => source.includes(name));
check('D1 ma nguon khong goi API ghi nao', found.length === 0, found.length === 0 ? 'khong thay ' + forbidden.join('/') : 'THAY: ' + found.join(', '));
check('D2 ma nguon khong co duong dan tuyet doi kieu o dia', /[A-Za-z]:[\\/]/.test(source) === false, 'regex o dia = ' + /[A-Za-z]:[\\/]/.test(source));
const help = run(['--help']);
check('D3 --help exit 0 va noi ro CHI DOC', help.code === 0 && help.out.includes('CHI DOC'), 'exit=' + help.code);

const failed = results.filter((item) => item.ok !== true);
console.log('');
console.log('TOTAL ' + results.length + ' checks, ' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed');
if (failed.length > 0) console.log('FAILED: ' + failed.map((item) => item.id).join(', '));
process.exitCode = failed.length === 0 ? 0 : 1;
