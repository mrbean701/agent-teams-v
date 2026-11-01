// t133 — chung minh bo do t132 la CHI-DOC (T132-F1) va FAIL-CLOSED (T132-F2).
// Moi ca deu do bang tien trinh that (spawnSync process.execPath). 0 boot Host.
// Chay: node tests/t133-analyze-idempotent.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);
const SUITE = path.join(HERE, 't132-panel-runtime.mjs');
const WRAPPER = path.join(HERE, 't132-panel-dom-order.mjs');
const CONTAINER = path.join(HERE, 'tmp', 't132');
const REAL = path.join(CONTAINER, 'run-2026-11-01T04-08-52-492Z');
const WORK = path.join(HERE, 'tmp', 't133');
const NL = String.fromCharCode(10);

const results = [];
let failures = 0;

function check(id, title, ok, detail) {
    results.push({ id, title, ok: ok === true, detail });
    if (ok !== true) failures += 1;
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' ' + title + ' :: ' + detail);
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function walk(dir, base, out) {
    const root = base === undefined ? dir : base;
    const acc = out === undefined ? [] : out;
    fs.readdirSync(dir).sort().forEach((entry) => {
        const full = path.join(dir, entry);
        const stat = fs.lstatSync(full);
        if (stat.isDirectory() === true) {
            walk(full, root, acc);
        } else {
            acc.push({ rel: path.relative(root, full).split(path.sep).join('/'), file: full, stat });
        }
    });
    return acc;
}

function snapshot(dir) {
    const map = {};
    walk(dir).forEach((entry) => {
        map[entry.rel] = {
            sha256: sha256(fs.readFileSync(entry.file)),
            bytes: entry.stat.size,
            mtimeMs: entry.stat.mtimeMs,
        };
    });
    return map;
}

function diffSnapshots(before, after) {
    const problems = [];
    Object.keys(before).forEach((key) => {
        if (after[key] === undefined) {
            problems.push('mat tep ' + key);
            return;
        }
        const a = before[key];
        const b = after[key];
        if (a.sha256 !== b.sha256) problems.push('sha doi ' + key + ' ' + a.sha256.slice(0, 12) + ' -> ' + b.sha256.slice(0, 12));
        if (a.bytes !== b.bytes) problems.push('bytes doi ' + key + ' ' + a.bytes + ' -> ' + b.bytes);
        if (a.mtimeMs !== b.mtimeMs) problems.push('mtime doi ' + key);
    });
    Object.keys(after).forEach((key) => {
        if (before[key] === undefined) problems.push('tep moi ' + key);
    });
    return problems;
}

function runNode(script, args) {
    const run = spawnSync(process.execPath, [script].concat(args), { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300000 });
    return { status: run.status, stdout: run.stdout === null ? '' : run.stdout, stderr: run.stderr === null ? '' : run.stderr };
}

function analyse(target) {
    return runNode(SUITE, ['--analyze', target]);
}

function verdictOf(stdout) {
    const line = stdout.split(NL).filter((row) => row.startsWith('verdict ')).pop();
    return line === undefined ? '(khong co dong verdict)' : line;
}

function lineOf(stdout, id) {
    const line = stdout.split(NL).filter((row) => row.startsWith('PASS ' + id + ' ') || row.startsWith('FAIL ' + id + ' ')).shift();
    return line === undefined ? '(khong co dong ' + id + ')' : line;
}

function runDirs() {
    return fs.readdirSync(CONTAINER).filter((entry) => entry.startsWith('run-')).sort();
}

function copyDir(from, to) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
}

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function main() {
    fs.mkdirSync(WORK, { recursive: true });
    const workDir = path.join(WORK, 'run-' + stamp());
    fs.mkdirSync(workDir, { recursive: true });
    console.log('# t133 — bo do t132 co chi-doc va fail-closed khong? artifact goc: ' + path.relative(REPO, REAL).split(path.sep).join('/'));
    console.log('# work: ' + path.relative(REPO, workDir).split(path.sep).join('/'));

    // ---------------------------------------------------------------- A1
    const containerBefore = snapshot(CONTAINER);
    const runsBefore = runDirs();
    const first = analyse(REAL);
    const firstVerdict = verdictOf(first.stdout);
    const firstOk = first.status === 0 && firstVerdict.indexOf('verdict PASS') === 0 && firstVerdict.indexOf('unproved (none)') > 0;
    check('A1', '--analyze tren artifact THAT: PASS 9/9, EXIT 0, khong ghi results.json', firstOk && first.stdout.indexOf('ghi results.json: KHONG') > 0,
        'exit=' + first.status + ' :: ' + firstVerdict + ' :: ' + (first.stdout.split(NL).filter((row) => row.startsWith('artifact: ')).pop() || '(khong co dong artifact)'));
    fs.writeFileSync(path.join(workDir, 'a1-analyze-real.stdout.txt'), first.stdout + NL + '--- stderr ---' + NL + first.stderr);

    // ---------------------------------------------------------------- A2
    const second = analyse(REAL);
    const containerAfter = snapshot(CONTAINER);
    const containerDiff = diffSnapshots(containerBefore, containerAfter);
    const runsAfter = runDirs();
    check('A2', 'F1: --analyze CHI DOC — sha256/bytes/mtime MOI tep trong tests/tmp/t132 khong doi sau 2 lan cham', containerDiff.length === 0 && runsAfter.length === runsBefore.length && second.status === 0,
        'tep=' + String(Object.keys(containerBefore).length) + ' run-dir truoc=' + String(runsBefore.length) + ' sau=' + String(runsAfter.length)
            + ' :: ' + (containerDiff.length === 0 ? 'khong tep nao doi (idempotent)' : containerDiff.slice(0, 6).join(' | ')));
    fs.writeFileSync(path.join(workDir, 'a2-container-diff.json'), JSON.stringify({ before: containerBefore, after: containerAfter, diff: containerDiff, runDirsBefore: runsBefore, runDirsAfter: runsAfter }, null, 2));

    // ---------------------------------------------------------------- A3
    const tampered = path.join(workDir, 'tampered-artifact');
    copyDir(REAL, tampered);
    const tamperedFile = path.join(tampered, 'results.json');
    const stored = JSON.parse(fs.readFileSync(tamperedFile, 'utf8'));
    const measured = stored.domPlain.order.measured;
    const iDep = measured.findIndex((entry) => entry.label === 'DependencyMap');
    const iAdd = measured.findIndex((entry) => entry.label === 'AddMemberControl');
    let tamperNote = 'khong tim thay cap DependencyMap/AddMemberControl';
    let tamperedSha = 'none';
    if (iDep >= 0 && iAdd >= 0) {
        const held = measured[iDep].index;
        measured[iDep].index = measured[iAdd].index;
        measured[iAdd].index = held;
        fs.writeFileSync(tamperedFile, JSON.stringify(stored, null, 2));
        tamperedSha = sha256(fs.readFileSync(tamperedFile));
        tamperNote = 'index DependencyMap=' + String(measured[iDep].index) + ' AddMemberControl=' + String(measured[iAdd].index) + ' sha ' + tamperedSha.slice(0, 12);
    }
    const tamperRun1 = analyse(tampered);
    const afterRun1 = sha256(fs.readFileSync(tamperedFile));
    const tamperRun2 = analyse(tampered);
    const afterRun2 = sha256(fs.readFileSync(tamperedFile));
    const v1 = verdictOf(tamperRun1.stdout);
    const v2 = verdictOf(tamperRun2.stdout);
    const tamperOk = tamperRun1.status === 1 && tamperRun2.status === 1
        && v1.indexOf('verdict FAIL') === 0 && v2.indexOf('verdict FAIL') === 0
        && v1.indexOf('unproved C9') > 0 && v2.indexOf('unproved C9') > 0
        && afterRun1 === tamperedSha && afterRun2 === tamperedSha;
    check('A3', 'F1: artifact bi sua index => --analyze HAI lan lien tiep deu FAIL voi unproved C9 va EXIT 1 (khong tu chua)', tamperOk,
        tamperNote + ' :: lan1 exit=' + String(tamperRun1.status) + ' ' + v1 + ' :: lan2 exit=' + String(tamperRun2.status) + ' ' + v2
            + ' :: sha sau 2 lan ' + afterRun2.slice(0, 12) + ' (' + (afterRun2 === tamperedSha ? 'khong doi' : 'DA BI GHI DE') + ')');
    fs.writeFileSync(path.join(workDir, 'a3-tampered.stdout.txt'), '=== lan 1 ===' + NL + tamperRun1.stdout + NL + '=== lan 2 ===' + NL + tamperRun2.stdout);

    // ---------------------------------------------------------------- A4/A5/A6/A7/A8 fail-closed
    const abuses = [
        { id: 'A4', args: ['--bogus'], needle: 'co khong ho tro: --bogus', title: 'F2: co la --bogus => EXIT 2, khong sinh run moi' },
        { id: 'A5', args: ['--analyze'], needle: '--analyze thieu gia tri', title: 'F2: --analyze thieu gia tri => EXIT 2' },
        { id: 'A6', args: ['--analyze', '--strict'], needle: 'gap co --strict thay vi duong dan', title: 'F2: --analyze --strict (chong co) => EXIT 2' },
        { id: 'A7', args: ['--analyze', 'tests/tmp/t133/khong-ton-tai-' + stamp()], needle: 'duong dan khong ton tai', title: 'F2: --analyze <path khong ton tai> => EXIT 2, thong diep neu duong dan' },
        { id: 'A8', args: ['--analyze', 'tests/tmp/t132', '--strict'], needle: 'run-dir', title: 'F2: --strict tren thu muc chua nhieu run-dir => EXIT 2 (fail-closed)' },
    ];
    const abuseLog = {};
    abuses.forEach((item) => {
        const before = runDirs();
        const beforeSnap = snapshot(CONTAINER);
        const out = runNode(SUITE, item.args);
        const after = runDirs();
        const afterSnap = snapshot(CONTAINER);
        const diff = diffSnapshots(beforeSnap, afterSnap);
        const ok = out.status === 2 && out.stderr.indexOf(item.needle) >= 0 && after.length === before.length && diff.length === 0;
        const messageLine = out.stderr.split(NL).filter((row) => row.trim().length > 0).slice(0, 1).join(' ');
        check(item.id, item.title + ' + khong ghi dia', ok,
            'exit=' + String(out.status) + ' :: needle [' + item.needle + '] ' + (out.stderr.indexOf(item.needle) >= 0 ? 'co' : 'THIEU')
                + ' :: run-dir ' + String(before.length) + '/' + String(after.length) + ' :: tep doi=' + String(diff.length) + ' :: ' + messageLine);
        abuseLog[item.id] = { args: item.args, exit: out.status, stderr: out.stderr, stdout: out.stdout, diff };
    });
    fs.writeFileSync(path.join(workDir, 'a4-a8-abuse.json'), JSON.stringify(abuseLog, null, 2));

    // ---------------------------------------------------------------- A9 wrapper passthrough
    const wTampered = runNode(WRAPPER, ['--analyze', path.relative(REPO, tampered).split(path.sep).join('/')]);
    const wBogus = runNode(WRAPPER, ['--bogus']);
    const wMissing = runNode(WRAPPER, ['--analyze', 'tests/tmp/t133/khong-ton-tai-wrapper']);
    const wrapperOk = wTampered.status === 1 && wBogus.status === 2 && wMissing.status === 2;
    check('A9', 'wrapper mang nguyen ma thoat (FAIL=>1, loi dung=>2), khong doi ma thanh 0', wrapperOk,
        'tampered exit=' + String(wTampered.status) + ' (can 1) · --bogus exit=' + String(wBogus.status) + ' (can 2) · path sai exit=' + String(wMissing.status) + ' (can 2)');

    // ---------------------------------------------------------------- A10 ba doi chung am cu
    const c6 = lineOf(first.stdout, 'C6');
    const c7 = lineOf(first.stdout, 'C7');
    const c8 = lineOf(first.stdout, 'C8');
    const negOk = c6.indexOf('PASS C6') === 0 && c6.indexOf('must precede') > 0
        && c7.indexOf('PASS C7') === 0 && c7.indexOf('must precede') > 0
        && c8.indexOf('PASS C8') === 0 && c8.indexOf('missing DependencyMap') > 0;
    check('A10', 'hoi quy: 3 doi chung am cu (bundle CU / dao call site / xoa marker) van DO dung van ban', negOk,
        'C6 ' + (c6.indexOf('PASS C6') === 0 && c6.indexOf('must precede') > 0 ? 'do' : 'KHONG do') + ' · C7 ' + (c7.indexOf('must precede') > 0 ? 'do' : 'KHONG do') + ' · C8 ' + (c8.indexOf('missing DependencyMap') > 0 ? 'do' : 'KHONG do'));

    // ---------------------------------------------------------------- A11 node --check
    const check1 = spawnSync(process.execPath, ['--check', SUITE], { encoding: 'utf8' });
    const check2 = spawnSync(process.execPath, ['--check', WRAPPER], { encoding: 'utf8' });
    check('A11', 'node --check 2 tep .mjs deu sach', check1.status === 0 && check2.status === 0,
        't132-panel-runtime.mjs exit=' + String(check1.status) + ' · t132-panel-dom-order.mjs exit=' + String(check2.status));

    // ---------------------------------------------------------------- A12 hoi quy cuoi
    const last = analyse(REAL);
    const containerFinal = snapshot(CONTAINER);
    const finalDiff = diffSnapshots(containerBefore, containerFinal);
    check('A12', 'hoi quy cuoi: artifact THAT van PASS 9/9 EXIT 0 va van khong bi ghi sau toan bo pha thu', last.status === 0 && verdictOf(last.stdout).indexOf('verdict PASS') === 0 && finalDiff.length === 0,
        'exit=' + String(last.status) + ' :: ' + verdictOf(last.stdout) + ' :: tep doi sau ca phien=' + String(finalDiff.length));

    fs.writeFileSync(path.join(workDir, 't133-results.json'), JSON.stringify({ work: path.relative(REPO, workDir).split(path.sep).join('/'), results }, null, 2));
    console.log('');
    console.log('TONG ' + String(results.filter((row) => row.ok === true).length) + '/' + String(results.length) + ' ca DAT · hong ' + String(failures) + ' · work=' + path.relative(REPO, workDir).split(path.sep).join('/'));
    console.log('verdict ' + (failures === 0 ? 'PASS' : 'FAIL') + ' — ' + (failures === 0 ? 'bo do t132 chi-doc va fail-closed' : 'con ca hong'));
    process.exit(failures === 0 ? 0 : 1);
}

main();