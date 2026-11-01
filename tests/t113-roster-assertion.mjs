#!/usr/bin/env node
/**
 * t113 — the roster assertion of C4 in tests/t59-erp-live-copy.mjs must keep its teeth.
 *
 * Why this suite exists: the first version of the t113 repair put its negative control in
 * tests/tmp/t113/, i.e. in scratch. That proved the HELPER (rosterCountsOf) still reads a
 * mutated title as 'not 7 + 7', but it never proved the ASSERTION of C4. Anyone could delete
 * '&& rosterOk' from C4's check() call, or widen the expression to '|| true', and the scratch
 * control would stay green while the live suite had lost its teeth.
 *
 * So this file slices the VERBATIM expression C4 evaluates straight out of the live suite and
 * runs it, not the helper's output: 'const rosterOk = roster.found === true
 * && roster.present === 7 && roster.removed === 7;'. It then asserts rosterOk === false for
 * every mutated title, and it proves the probe itself has teeth by widening the sliced
 * expression ('|| true', one conjunct dropped) and requiring that THIS suite then reports
 * broken. Exit 0 when everything holds, exit 1 otherwise.
 *
 * Run from the repo root: node tests/t113-roster-assertion.mjs
 */
import { readFileSync, existsSync, readdirSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, rm, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);
// t119: normally the real live suite. T113_SUITE_OVERRIDE points this suite at a COPY under
// tests/tmp/t119 — the only way to prove C5's ORDER relation fails when the relation is broken,
// without ever editing the live suite itself (it is out of scope for this repair).
const SUITE = typeof process.env.T113_SUITE_OVERRIDE === 'string' && process.env.T113_SUITE_OVERRIDE.length > 0
    ? resolve(process.env.T113_SUITE_OVERRIDE)
    : join(REPO_ROOT, 'tests', 't59-erp-live-copy.mjs');
const RUNS = join(REPO_ROOT, 'tests', 'tmp', 't59');

const EXPR_LINE = 'const rosterOk = roster.found === true && roster.present === 7 && roster.removed === 7;';
const WIRED = /check\('C4'[\s\S]{0,1200}?&&\s*(rosterOk)\b/u;
const GOOD_FLOOR = 2;
const BAD_FLOOR = 5;
const BAD_CASES = 5;

let failures = 0;
let total = 0;
function check(id, name, ok, detail) {
    total += 1;
    const line = (ok ? 'PASS ' : 'FAIL ') + id + ' — ' + name + (detail === undefined ? '' : '\n      evidence: ' + detail);
    console.log(line);
    if (!ok) failures += 1;
}

function sliceFunction(text, name) {
    const start = text.indexOf('function ' + name + '(');
    if (start < 0) return undefined;
    let depth = 0;
    for (let i = text.indexOf('{', start); i < text.length; i += 1) {
        const ch = text[i];
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(start, i + 1);
        }
    }
    return undefined;
}

const source = readFileSync(SUITE, 'utf8');
const helperSrc = sliceFunction(source, 'rosterCountsOf');
const rosterCountsOf = helperSrc === undefined ? undefined : new Function('return (' + helperSrc + ')')();

// the expression is SLICED out of the live suite, never retyped here
const exprAt = source.indexOf(EXPR_LINE);
const exprBody = exprAt < 0
    ? undefined
    : source.slice(exprAt + 'const rosterOk = '.length, exprAt + EXPR_LINE.length - 1);

function mutant(text, from, to) {
    const hits = text.split(from).length - 1;
    const next = text.split(from).join(to);
    return { next, applies: hits > 0, deltaBytes: Buffer.byteLength(next) - Buffer.byteLength(text), hits };
}

// real evidence first: the newest live run of t59, if it is still on disk
let realText;
let realRun;
if (existsSync(RUNS)) {
    const dirs = readdirSync(RUNS).filter((name) => name.startsWith('run-')).sort();
    for (const name of dirs.reverse()) {
        const metaPath = join(RUNS, name, 'meta.json');
        if (!existsSync(metaPath)) continue;
        const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
        const statuses = meta?.session?.texts?.statuses;
        if (Array.isArray(statuses) && typeof statuses[0] === 'string' && statuses[0].length > 0) {
            realText = statuses[0];
            realRun = name;
            break;
        }
    }
}

function flipSpelling(text) {
    const m = /Members \((\d+) (present|active) \+ (\d+) removed\)/u.exec(text);
    if (m === null) return { next: text, applies: false, deltaBytes: 0 };
    const other = m[2] === 'present' ? 'active' : 'present';
    const next = text.slice(0, m.index) + 'Members (' + m[1] + ' ' + other + ' + ' + m[3] + ' removed)' + text.slice(m.index + m[0].length);
    return { next, applies: true, deltaBytes: Buffer.byteLength(next) - Buffer.byteLength(text) };
}

/** One place for every title mutation, so no case depends on which spelling the live run used. */
function titleMutation(text, kind) {
    const m = /Members \((\d+) (present|active) \+ (\d+) removed\)/u.exec(text);
    const rebuild = (present, removed) => (m === null
        ? text
        : text.slice(0, m.index) + 'Members (' + present + ' ' + m[2] + ' + ' + removed + ' removed)' + text.slice(m.index + m[0].length));
    let next = text;
    if (kind === 'single-count') next = m === null ? text : text.slice(0, m.index) + 'Members (7)' + text.slice(m.index + m[0].length);
    else if (kind === 'removed-6') next = m === null ? text : rebuild(m[1], '6');
    else if (kind === 'present-8') next = m === null ? text : rebuild('8', m[3]);
    return { next, applies: m !== null, deltaBytes: Buffer.byteLength(next) - Buffer.byteLength(text) };
}

const REAL_TITLE = realText === undefined
    ? 'Team "erp-erp" — đội thực thi\nMembers (7 present + 7 removed):\nmọi thứ khác'
    : realText;

check('A1', 'C4 still evaluates the pinned expression (sliced verbatim out of tests/t59-erp-live-copy.mjs)',
    exprAt >= 0 && exprBody === 'roster.found === true && roster.present === 7 && roster.removed === 7',
    'exprAt=' + exprAt + ' exprLength=' + String(exprBody === undefined ? 'n/a' : exprBody.length) + ' bytes');
check('A2', 'the roster helper is still in the live suite and still self-contained',
    typeof rosterCountsOf === 'function',
    'helperSrc=' + (helperSrc === undefined ? 'missing' : helperSrc.split('\n').length + ' lines'));
check('A3', 'C4 passes rosterOk to check() — the assertion is wired, not computed and dropped',
    WIRED.test(source) && !/check\('C4'[\s\S]{0,1200}?,\s*true\s*\)/u.test(source),
    'wiring=' + String(WIRED.test(source)) + ' expression=' + JSON.stringify(WIRED.exec(source)?.[1] ?? null));

if (typeof rosterCountsOf !== 'function' || exprBody === undefined) {
    console.log('');
    console.log('# ' + (total - failures) + '/' + total + ' passed, ' + failures + ' failed — cannot continue without the helper and the expression');
    process.exit(1);
}

const evaluate = new Function('roster', 'return (' + exprBody + ');');
const cases = [];
function addCase(id, name, text, expectRoster) {
    const roster = rosterCountsOf(text);
    const expr = evaluate(roster);
    cases.push({ id, name, roster, expr, expectRoster, text });
    return { roster, expr };
}

// good side: the real captured title and the legacy spelling must both pass
const good1 = addCase('G1', 'real captured title from the newest live run (' + String(realRun ?? 'synthetic fallback') + ')', REAL_TITLE, true);
check('G1', 'the real captured status text parses as 7 present + 7 removed and C4 evaluates true',
    good1.roster.found === true && good1.roster.present === 7 && good1.roster.removed === 7 && good1.expr === true,
    'roster=' + good1.roster.present + '+' + good1.roster.removed + ' expr=' + String(good1.expr) + ' line=' + JSON.stringify(good1.roster.line) + ' run=' + String(realRun ?? 'n/a'));
const legacy = flipSpelling(REAL_TITLE);
const good2 = addCase('G2', 'legacy spelling "active" (historical artefact)', legacy.next, true);
check('G2', 'a historical "Members (7 active + 7 removed)" artefact is still readable (applies=' + String(legacy.applies) + ', delta ' + legacy.deltaBytes + ' B)',
    legacy.applies === true && good2.roster.present === 7 && good2.roster.removed === 7 && good2.expr === true,
    'applies=' + String(legacy.applies) + ' delta=' + legacy.deltaBytes + ' B roster=' + good2.roster.present + '+' + good2.roster.removed);

// bad side: every mutation must make the SLICED EXPRESSION false
const bad = [
    { id: 'B1', why: 'single-count title (BUG-027 regressed)', kind: 'single-count' },
    { id: 'B2', why: 'removed 7 -> 6', kind: 'removed-6' },
    { id: 'B3', why: 'present/active 7 -> 8', kind: 'present-8' },
    { id: 'B4', why: 'the Members line is gone', kind: 'line-gone' },
    { id: 'B5', why: 'empty text', kind: 'empty' },
];
for (const item of bad) {
    const mutation = item.kind === 'line-gone'
        ? mutant(REAL_TITLE, '\nMembers (', '\n')
        : item.kind === 'empty'
            ? { next: '', applies: true, deltaBytes: -Buffer.byteLength(REAL_TITLE) }
            : titleMutation(REAL_TITLE, item.kind);
    const roster = rosterCountsOf(mutation.next);
    const expr = evaluate(roster);
    check(item.id, 'C4 evaluates FALSE when ' + item.why + ' (applies=' + String(mutation.applies) + ')',
        mutation.applies === true && expr === false,
        'applies=' + String(mutation.applies) + ' delta=' + mutation.deltaBytes + ' B roster=' + String(roster.present) + '+' + String(roster.removed) + ' expr=' + String(expr));
}
// teeth of THIS probe: a widened expression must be reported broken
function teethOf(body) {
    const fn = new Function('roster', 'return (' + body + ');');
    const badAccepts = [];
    const goodRejects = [];
    const badTexts = [
        titleMutation(REAL_TITLE, 'single-count').next,
        titleMutation(REAL_TITLE, 'removed-6').next,
        titleMutation(REAL_TITLE, 'present-8').next,
        mutant(REAL_TITLE, '\nMembers (', '\n').next,
        '',
    ];
    for (const text of badTexts) {
        if (fn(rosterCountsOf(text)) !== false) badAccepts.push(JSON.stringify(text.slice(-48)));
    }
    for (const text of [REAL_TITLE, legacy.next === REAL_TITLE ? REAL_TITLE : legacy.next]) {
        if (fn(rosterCountsOf(text)) !== true) goodRejects.push(JSON.stringify(text.slice(-40)));
    }
    return { teeth: badAccepts.length === 0 && goodRejects.length === 0, badAccepts, goodRejects };
}
const realTeeth = teethOf(exprBody);
check('T1', 'the pinned expression rejects all ' + BAD_FLOOR + ' bad texts and accepts both good ones',
    realTeeth.teeth === true, 'badAccepts=' + realTeeth.badAccepts.length + ' goodRejects=' + realTeeth.goodRejects.length);
check('T2', 'floor: at least ' + GOOD_FLOOR + ' good texts and ' + BAD_FLOOR + ' bad texts were exercised',
    (2 >= GOOD_FLOOR) && (bad.length >= BAD_FLOOR), 'good=2 bad=' + bad.length);

const widened = mutant(exprBody, 'roster.removed === 7', 'roster.removed === 7 || true');
const widenedTeeth = widened.applies ? teethOf(widened.next) : { teeth: true, badAccepts: [], goodRejects: [] };
check('M1', 'if C4 were widened with "|| true" this probe reports broken (applies=' + String(widened.applies) + ', delta ' + widened.deltaBytes + ' B)',
    widened.applies === true && widenedTeeth.teeth === false,
    'applies=' + String(widened.applies) + ' teeth=' + String(widenedTeeth.teeth) + ' badAccepts=' + widenedTeeth.badAccepts.length);
// dropping the removed-count conjunct is a real loosening: 'removed 7 -> 6' would then pass
const dropped = mutant(exprBody, ' && roster.removed === 7', '');
const droppedTeeth = dropped.applies ? teethOf(dropped.next) : { teeth: true, badAccepts: [], goodRejects: [] };
check('M2', 'if the removed-count conjunct were dropped this probe reports broken (applies=' + String(dropped.applies) + ', delta ' + dropped.deltaBytes + ' B)',
    dropped.applies === true && droppedTeeth.teeth === false,
    'applies=' + String(dropped.applies) + ' teeth=' + String(droppedTeeth.teeth) + ' goodRejects=' + droppedTeeth.goodRejects.length);
const constant = mutant(exprBody, exprBody, 'true');
check('M3', 'a constant "true" expression is reported broken (applies=' + String(constant.applies) + ')',
    constant.applies === true && teethOf('true').teeth === false, 'teeth=' + String(teethOf('true').teeth));


// ---------------------------------------------------------------------------
// t116 controls — C6 and C10 must be decided by the PROPERTY, never by how many
// times the model happened to call a tool. Every case below is boot-free: it slices
// the real helper out of the live suite and runs it.
// ---------------------------------------------------------------------------
const PKG = join(REPO_ROOT, 'packages', 'dsh-agent-teams');
const frozenAt = source.indexOf('const FROZEN = [');
const frozenEnd = frozenAt < 0 ? -1 : source.indexOf('];', frozenAt);
const frozenList = frozenAt < 0 || frozenEnd < 0
    ? undefined
    : new Function('return ' + source.slice(frozenAt + 'const FROZEN = '.length, frozenEnd + 1))();
const deltaPin = source.match(/const MIN_AUDIT_DELTA = (\d+);/u);
const MIN_AUDIT_DELTA_PIN = Number(deltaPin === null ? NaN : deltaPin[1]);

const helperOf = (name) => sliceFunction(source, name);
const allAuditRowsSrc = helperOf('allAuditRows');
const auditDeltaProblemsSrc = helperOf('auditDeltaProblems');
const sourceProblemsOfSrc = helperOf('sourceProblemsOf');
// sliceFunction returns from 'function <name>(' on, so an async helper loses its modifier here
const sourceHashesOfSrc = helperOf('sourceHashesOf') === undefined
    ? undefined
    : (source.includes('async function sourceHashesOf(') ? 'async ' : '') + helperOf('sourceHashesOf');
// each helper is rebuilt in a scope that declares ONLY the globals the live suite gives it
const buildHelper = (body, names, args) => new Function(names.join(', '), body)(...args);
const allAuditRows = allAuditRowsSrc === undefined
    ? undefined
    : new Function('return (' + allAuditRowsSrc + ');')();
const auditDeltaProblems = auditDeltaProblemsSrc === undefined
    ? undefined
    : buildHelper('const MIN_AUDIT_DELTA = PIN; return (' + auditDeltaProblemsSrc + ');',
        ['PIN'], [MIN_AUDIT_DELTA_PIN]);
const sourceProblemsOf = sourceProblemsOfSrc === undefined
    ? undefined
    : new Function('return (' + sourceProblemsOfSrc + ');')();
const sourceHashesOf = sourceHashesOfSrc === undefined || frozenList === undefined
    ? undefined
    : buildHelper('return (' + sourceHashesOfSrc + ');', ['FROZEN', 'PKG', 'join', 'readFile', 'createHash'],
        [frozenList, PKG, join, readFile, createHash]);

const AUDIT_HEADER = '| at (UTC) | team | member | previous | route | applied | source |';
const AUDIT_SEP = '| --- | --- | --- | --- | --- | --- | --- |';
const ROW = (member, stamp) => '| ' + stamp + ' | erp-erp | ' + member
    + ' | opencode-go/deepseek-v4.1-flash (max) | command-code-goat/deepseek/deepseek-v4-pro (high)'
    + ' | durable-only | captain:session-x |';
const ROW_A = ROW('ha-tang-2', '2026-11-01T01:32:08.355Z');
const ROW_B = ROW('ha-tang-2', '2026-11-01T01:32:18.405Z');
const ROW_OTHER = ROW('backend-1', '2026-11-01T01:32:30.000Z');

check('N1', 'the frozen table C10 scores against is still the pinned 13-row table',
    Array.isArray(frozenList) === true && frozenList.length === 13
        && frozenList.every((entry) => /^[0-9a-f]{64}$/u.test(entry.sha256) && entry.bytes > 0 && typeof entry.path === 'string'),
    'entries=' + (frozenList === undefined ? 'table not found' : frozenList.length));
check('N2', 'the C6 threshold is still pinned to 2 in the source (a relaxed 0 fails here as well as at C6)',
    MIN_AUDIT_DELTA_PIN === 2, 'MIN_AUDIT_DELTA=' + String(MIN_AUDIT_DELTA_PIN));
check('N3', 'the table header and the |---| separator are NOT counted as audit rows',
    allAuditRows !== undefined
        && allAuditRows(AUDIT_HEADER + '\n' + AUDIT_SEP).length === 0
        && allAuditRows(AUDIT_HEADER + '\n' + AUDIT_SEP + '\n' + ROW_A + '\n' + ROW_B).length === 2,
    'header-only=' + JSON.stringify(allAuditRows === undefined ? 'helper not found' : allAuditRows(AUDIT_HEADER + '\n' + AUDIT_SEP).length));

const normal = auditDeltaProblems === undefined ? undefined : auditDeltaProblems(2, [ROW_A, ROW_B], 'ha-tang-2', 2);
check('N4', 'a normal boot (one set + one clear, delta 2, both rows naming the target) reports no problem',
    Array.isArray(normal) && normal.length === 0 && auditDeltaProblems(2, [ROW_A, ROW_B], 'ha-tang-2').length === 0,
    'problems=' + JSON.stringify(normal));
const idle = auditDeltaProblems === undefined ? undefined : auditDeltaProblems(0, [], 'ha-tang-2', 2);
const relaxed = auditDeltaProblems === undefined ? undefined : auditDeltaProblems(0, [], 'ha-tang-2', 0);
check('N5', 'a boot that wrote NOTHING is red at the pinned threshold and silently green at 0 — the threshold decides',
    Array.isArray(idle) && idle.length > 0 && Array.isArray(relaxed) && relaxed.length === 0,
    'idleProblems=' + JSON.stringify(idle) + ' relaxedProblems=' + JSON.stringify(relaxed));
const foreign = auditDeltaProblems === undefined ? undefined : auditDeltaProblems(2, [ROW_A, ROW_OTHER], 'ha-tang-2', 2);
const mismatch = auditDeltaProblems === undefined ? undefined : auditDeltaProblems(3, [ROW_A, ROW_B], 'ha-tang-2', 2);
check('N6', 'a new row naming another member, and a delta that disagrees with the rows read, are both reported',
    Array.isArray(foreign) && foreign.some((entry) => entry.includes('does not name ha-tang-2'))
        && Array.isArray(mismatch) && mismatch.some((entry) => entry.includes('does not match')),
    'foreign=' + JSON.stringify(foreign) + ' mismatch=' + JSON.stringify(mismatch));

// real evidence: the newest live run must have scored its own audit delta this way
let liveAudit;
try {
    const runMeta = readFileSync(join(RUNS, realRun, 'meta.json'), 'utf8');
    liveAudit = JSON.parse(runMeta).copy.audit;
} catch (error) {
    liveAudit = undefined;
}
check('N7', 'the newest live run scored C6 on a real delta, and every new row named the target member',
    liveAudit !== undefined && liveAudit.delta === liveAudit.rowsAfterBoot - liveAudit.rowsBeforeBoot
        && liveAudit.delta >= liveAudit.minDelta && liveAudit.minDelta === 2
        && Array.isArray(liveAudit.newRows) && liveAudit.newRows.length === liveAudit.delta
        && liveAudit.newRows.every((row) => row.split('|').map((cell) => cell.trim()).includes('ha-tang-2')),
    'live audit=' + JSON.stringify(liveAudit === undefined ? 'no live run meta on disk' : liveAudit.delta + ' rows naming ' + 'ha-tang-2'));

// C10 control, still boot-free: flip ONE byte of a COPY of the shipped source
const COPY_SRC = join(REPO_ROOT, 'tests', 'tmp', 't116', 'src');
if (frozenList !== undefined && sourceHashesOf !== undefined && sourceProblemsOf !== undefined) {
    rmSync(COPY_SRC, { recursive: true, force: true });
    for (const entry of frozenList) {
        mkdirSync(join(COPY_SRC, dirname(entry.path)), { recursive: true });
        copyFileSync(join(PKG, entry.path), join(COPY_SRC, entry.path));
    }
}
const pristine = sourceHashesOf === undefined ? undefined : await sourceHashesOf(COPY_SRC);
// the table used by F1..F3 is derived from THIS copy, so these cases prove the C10 mechanism
// instead of re-failing when an unrelated task changes packages/dsh-agent-teams/lib/**. N1 is
// the case that pins the real 13-row table.
const localFrozen = pristine === undefined ? undefined : pristine.map((entry) => ({ path: entry.path, sha256: entry.sha, bytes: entry.bytes }));
const cleanProblems = sourceProblemsOf === undefined || pristine === undefined
    ? undefined
    : sourceProblemsOf([{ name: 'copy', before: pristine, after: pristine }], localFrozen);
check('F1', 'an untouched copy of all 13 shipped files raises no C10 problem',
    Array.isArray(cleanProblems) && cleanProblems.length === 0 && Array.isArray(pristine) && pristine.length === 13,
    'files=' + (pristine === undefined ? 'helper not found' : pristine.length) + ' problems=' + JSON.stringify(cleanProblems));

const copyTools = join(COPY_SRC, 'lib', 'tools.js');
const original = readFileSync(copyTools);
const flipped = Buffer.from(original);
flipped[100] = flipped[100] === 0x41 ? 0x42 : 0x41;
writeFileSync(copyTools, flipped);
const drifted = sourceHashesOf === undefined ? undefined : await sourceHashesOf(COPY_SRC);
const driftProblems = sourceProblemsOf === undefined || pristine === undefined || drifted === undefined
    ? undefined
    : sourceProblemsOf([{ name: 'copy', before: pristine, after: drifted }], localFrozen);
check('F2', 'one flipped byte in the COPY (same length, so the sha branch decides) is reported for that exact file',
    Array.isArray(driftProblems) && driftProblems.length > 0
        && /^lib\/tools\.js: before [0-9a-f]{64} after [0-9a-f]{64}$/u.test(driftProblems[0])
        && driftProblems.every((entry) => entry.startsWith('lib/tools.js'))
        && drifted[0].bytes === pristine[0].bytes,
    'problems=' + JSON.stringify(driftProblems) + ' bytes ' + (drifted === undefined ? '?' : drifted[0].bytes) + ' vs ' + (pristine === undefined ? '?' : pristine[0].bytes));
const wrongPin = sourceProblemsOf === undefined || drifted === undefined
    ? undefined
    : sourceProblemsOf([{ name: 'copy', before: drifted, after: drifted }], localFrozen);
check('F3', 'a boot that READ drifted source is reported against the frozen table too (the other direction of C10)',
    Array.isArray(wrongPin) && wrongPin.some((entry) => entry.includes('!= frozen')),
    'problems=' + JSON.stringify(wrongPin === undefined ? 'helper not found' : wrongPin.slice(0, 2)));
writeFileSync(copyTools, original);

const c6Gate = source.slice(source.indexOf("check('C6'"), source.indexOf("check('C6'") + 1200);
const c10Gate = source.slice(source.indexOf("check('C10'"), source.indexOf("check('C10'") + 1200);
check('W1', 'the live suite still wires both helpers into its own gates (C6 threshold + C10 source problems)',
    c6Gate.includes('deltaProblems.length === 0') && c6Gate.includes('MIN_AUDIT_DELTA === 2')
        && c10Gate.includes('sourceProblems.length === 0') && c10Gate.includes('sourceBoots.length > 0'),
    'c6 wired=' + String(c6Gate.includes('deltaProblems.length === 0')) + ' c10 wired=' + String(c10Gate.includes('sourceProblems.length === 0')));


// ---------------------------------------------------------------------------
// t119 / CAP116-F1 — the t116 repair is only a CLAIM unless the boot-free half
// enforces the RELATIONSHIPS, not just the evidence being present: a status must
// come AFTER each set inside the same boot, C7 must say 'not applicable' when no
// clear happened, and resetFixture must actually wipe leftover state.
// Every case below runs code sliced VERBATIM out of the live suite.
// ---------------------------------------------------------------------------
const regionOf = (startNeedle, endNeedle) => {
    const start = source.indexOf(startNeedle);
    if (start < 0) return undefined;
    const end = source.indexOf(endNeedle, start);
    if (end < 0) return undefined;
    return source.slice(start, end + endNeedle.length);
};
const SET_ENTRY = "x.list.slice(i + 1).find((later) => later.tool === 'agent_teams_status')";
const SET_ENTRY_MUTANT = "x.list.filter((later) => later.tool === 'agent_teams_status').slice(-1)[0]";

const C5_END = 'meta.session.setCalls = setCalls;';
const c5Region = regionOf('const setCalls = [];', C5_END);
const T119_TARGET = 'ha-tang-2';
const T119_OVERRIDE = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4-pro', reasoning_effort: 'high' };

/** Runs the REAL C5 loop (sliced verbatim) over a synthetic tool-call list. */
const deriveC5 = (region) => new Function('x', 'TARGET_MEMBER', 'OVERRIDE',
    region.replace(C5_END, 'return { setCalls, setProblems };'));
const c5Of = (list, region = c5Region) => {
    const fn = deriveC5(region);
    return fn === undefined ? undefined : fn.call(null, { list }, T119_TARGET, T119_OVERRIDE);
};
const OVERRIDE_LINE = '- ha-tang-2 [vùng hạ tầng] idle/ready · opencode-go/deepseek-v4.1-flash → command-code-goat/deepseek/deepseek-v4-pro (override) · reasoning high';
const PLAIN_LINE = '- ha-tang-2 [vùng hạ tầng] idle/ready · opencode-go/deepseek-v4.1-flash · reasoning max';
const setCall = (ack = true) => ({ tool: 'agent_teams_set_member_route', input: { member_name: T119_TARGET },
    result: ack
        ? 'Member "ha-tang-2" route is now command-code-goat/deepseek/deepseek-v4-pro (reasoning high) — saved; it takes effect the next time it runs.'
        : 'Member "ha-tang-2" was not changed: pass provider/model.' });
const statusCall = (line) => ({ tool: 'agent_teams_status', input: {}, result: 'Team "erp-erp"\n' + line });

const o1 = c5Of([setCall(), statusCall(OVERRIDE_LINE)]);
check('C5-O1', 'a status right AFTER the set confirms the override (no problem)',
    o1 !== undefined && o1.setCalls.length === 1 && o1.setProblems.length === 0,
    'setCalls=' + (o1 === undefined ? 'derivation missing' : o1.setCalls.length) + ' problems=' + JSON.stringify(o1?.setProblems));
const o2 = c5Of([statusCall(OVERRIDE_LINE), setCall()]);
check('C5-O2', 'a status that appeared BEFORE the set can NOT confirm it: only a status AFTER the set counts',
    o2 !== undefined && o2.setCalls.length === 1 && o2.setProblems.length === 1,
    'problems=' + JSON.stringify(o2?.setProblems));
const o3 = c5Of([setCall(), statusCall(OVERRIDE_LINE), setCall()]);
check('C5-O3', 'a last set with NO status after it is a problem, even when an earlier set was confirmed',
    o3 !== undefined && o3.setCalls.length === 2 && o3.setProblems.length === 1,
    'setCalls=' + (o3 === undefined ? '?' : o3.setCalls.length) + ' problems=' + JSON.stringify(o3?.setProblems));
const o4 = c5Of([setCall(), statusCall(PLAIN_LINE)]);
check('C5-O4', 'a status after the set that does NOT render the override is a problem',
    o4 !== undefined && o4.setProblems.length === 1,
    'problems=' + JSON.stringify(o4?.setProblems));
const o5 = c5Of([setCall(false), statusCall(OVERRIDE_LINE)]);
check('C5-O5', 'a set that was NOT acknowledged is a problem even when a later status shows the override',
    o5 !== undefined && o5.setProblems.length === 1,
    'problems=' + JSON.stringify(o5?.setProblems));

// the captain's own mutation: take the LAST status of the whole boot instead of the next one
const mutantRegion = c5Region === undefined ? undefined : c5Region.replace(SET_ENTRY, SET_ENTRY_MUTANT);
const mutantApplies = c5Region !== undefined && mutantRegion !== c5Region;
const mutantDelta = mutantApplies ? Buffer.byteLength(mutantRegion) - Buffer.byteLength(c5Region) : 0;
const mutantO2 = mutantApplies ? c5Of([statusCall(OVERRIDE_LINE), setCall()], mutantRegion) : undefined;
const realO2 = c5Of([statusCall(OVERRIDE_LINE), setCall()]);
check('C5-ORDER', 'if the C5 loop took the LAST status of the boot instead of the NEXT one (the captain mutation), the pre-set fixture would silently pass — so this probe has teeth',
    mutantApplies === true && realO2 !== undefined && realO2.setProblems.length === 1
        && mutantO2 !== undefined && mutantO2.setProblems.length === 0,
    'applies=' + String(mutantApplies) + ' delta=' + mutantDelta + ' B realProblems=' + JSON.stringify(realO2?.setProblems) + ' mutantProblems=' + JSON.stringify(mutantO2?.setProblems));

// ---- C7: the 'not applicable' branch must be a PASS, and a wrong final state must FAIL
const C7_END = 'meta.session.clearCalls = clearCalls.length;';
const c7Region = regionOf('const declared = clearTarget === undefined', C7_END);
const c7GateMatch = source.match(/clearCall === undefined \? true : finalStateProblems\.length === 0/u);
const c7GateOf = c7GateMatch === null ? undefined : new Function('clearCall', 'finalStateProblems', 'return (' + c7GateMatch[0] + ');');
const deriveC7 = (list, clearTarget, afterClear) => {
    const fn = new Function('x', 'clearTarget', 'afterClear', 'TARGET_MEMBER',
        c7Region.replace(C7_END, 'return { declared, clearCalls, clearCall, finalStateProblems };'));
    return fn({ list }, clearTarget, afterClear, T119_TARGET);
};
const memberRow = (name, provider, model, override) => {
    const row = { name, provider, model, reasoningEffort: 'high', joinedAt: 1, status: 'idle' };
    if (override !== undefined) row.routeOverride = override;
    return row;
};
const CLEARED_MEMBER = memberRow(T119_TARGET, 'opencode-go', 'deepseek-v4.1-flash', undefined);
const keptMembers = [CLEARED_MEMBER];
for (let i = 1; i < 14; i += 1) keptMembers.push(memberRow('member-' + i, 'p1', 'm1', undefined));
const afterClearFixture = { members: keptMembers, tasks: new Array(107).fill({ id: 't' }) };
const clearCallEntry = (answer) => ({ tool: 'agent_teams_set_member_route', input: { member_name: T119_TARGET, clear: true }, result: answer });
const GOOD_ANSWER = 'Member "ha-tang-2" override is cleared: back on its declared route opencode-go/deepseek-v4.1-flash, reasoning high (was command-code-goat/deepseek/deepseek-v4-pro) — saved.';
const BAD_ANSWER = 'Member "ha-tang-2" override is cleared: back on its declared route some-other-provider/some-other-model — saved.';

const c7a = deriveC7([setCall(), statusCall(OVERRIDE_LINE)], CLEARED_MEMBER, afterClearFixture);
check('C7-a', 'a boot that made NO clear call is scored "not applicable" — a PASS, never a failure',
    c7a !== undefined && c7a.clearCall === undefined && c7GateOf(c7a.clearCall, c7a.finalStateProblems) === true
        && source.includes('not applicable, not a failure'),
    'clearCalls=' + (c7a === undefined ? '?' : c7a.clearCalls.length) + ' gate=' + String(c7a === undefined ? '?' : c7GateOf(c7a.clearCall, c7a.finalStateProblems)));
const c7b = deriveC7([setCall(), clearCallEntry(BAD_ANSWER)], CLEARED_MEMBER, afterClearFixture);
check('C7-b', 'a clear whose answer does NOT name the declared route is a FAIL',
    c7b !== undefined && c7b.clearCall !== undefined && c7b.finalStateProblems.length === 1
        && c7GateOf(c7b.clearCall, c7b.finalStateProblems) === false,
    'problems=' + JSON.stringify(c7b?.finalStateProblems) + ' gate=' + String(c7b === undefined ? '?' : c7GateOf(c7b.clearCall, c7b.finalStateProblems)));
const c7c = deriveC7([setCall(), clearCallEntry(GOOD_ANSWER)], CLEARED_MEMBER, afterClearFixture);
const staledFixture = { members: keptMembers.map((row) => (row.name === T119_TARGET ? { ...row, routeOverride: { provider: 'p', model: 'm' } } : row)), tasks: afterClearFixture.tasks };
const c7stale = deriveC7([setCall(), clearCallEntry(GOOD_ANSWER)], staledFixture.members.find((row) => row.name === T119_TARGET), staledFixture);
check('C7-c', 'a clear with the declared route in the answer and no routeOverride left on disk PASSES; leaving routeOverride behind FAILS',
    c7c !== undefined && c7c.finalStateProblems.length === 0 && c7GateOf(c7c.clearCall, c7c.finalStateProblems) === true
        && c7stale !== undefined && c7stale.finalStateProblems.length === 1 && c7GateOf(c7stale.clearCall, c7stale.finalStateProblems) === false,
    'good=' + JSON.stringify(c7c?.finalStateProblems) + ' gate=' + String(c7c === undefined ? '?' : c7GateOf(c7c.clearCall, c7c.finalStateProblems)) + ' staleProblems=' + JSON.stringify(c7stale?.finalStateProblems));

// ---- resetFixture: run the REAL function against a scratch fixture, not the live one
const rfRaw = sliceFunction(source, 'resetFixture');
const rfSrc = rfRaw === undefined ? undefined : (source.includes('async function resetFixture(') ? 'async ' + rfRaw : rfRaw);
const sliceAsync = (name, names, args) => {
    const raw = sliceFunction(source, name);
    if (raw === undefined) return undefined;
    const src = source.includes('async function ' + name + '(') ? 'async ' + raw : raw;
    return new Function(names.join(', '), 'return (' + src + ');')(...args);
};
const t119join = join;
const rfHash = sliceAsync('hashFile', ['createHash', 'readFile'], [createHash, readFile]);
const rfReadJson = sliceAsync('readJson', ['readFile'], [readFile]);
const rfReadIfExists = sliceAsync('readIfExists', ['existsSync', 'readFile'], [existsSync, readFile]);
const RF_ROOT = join(REPO_ROOT, 'tests', 'tmp', 't119', 'fixture');
const RF_WORK = join(RF_ROOT, 'work');
const RF_COPY = join(RF_WORK, '.agent-teams', 'erp-erp', 'team.json');
const RF_AUDIT = join(RF_WORK, 'docs', 'log', 'MODEL-SWITCH.md');
const RF_ERP = join(RF_ROOT, 'erp-source.json');
const FRESH_ERP = JSON.stringify({ teamId: 'erp-erp', members: [memberRow('fresh', 'p1', 'm1')], tasks: [] }, null, 2);
const STALE_COPY = JSON.stringify({
    teamId: 'erp-erp',
    members: [memberRow('a', 'p1', 'm1'), memberRow('b', 'p1', 'm1'), memberRow(T119_TARGET, 'p1', 'm1', { provider: 'x', model: 'y', source: 'captain', at: 1 })],
    tasks: [],
}, null, 2);
const STALE_AUDIT = ['# MODEL-SWITCH', '', '| at (UTC) | team | member | previous | route | applied | source |', '| --- | --- | --- | --- | --- | --- | --- |',
    ROW(T119_TARGET, '2026-11-01T00:00:01.000Z'), ROW(T119_TARGET, '2026-11-01T00:00:02.000Z')].join('\n');
rmSync(RF_ROOT, { recursive: true, force: true });
mkdirSync(dirname(RF_AUDIT), { recursive: true });
mkdirSync(dirname(RF_COPY), { recursive: true });
writeFileSync(RF_ERP, FRESH_ERP, 'utf8');
writeFileSync(RF_COPY, STALE_COPY, 'utf8');
writeFileSync(RF_AUDIT, STALE_AUDIT, 'utf8');
const rfFactory = rfSrc === undefined
    ? undefined
    : new Function('COPY', 'hashFile', 'readJson', 'TARGET_MEMBER', 'allAuditRows', 'readIfExists', 'AUDIT', 'WORK', 'COPY_DIR', 'ERP_TEAM', 'existsSync', 'rm', 'mkdir', 'copyFile', 'join',
        rfSrc + '\nreturn resetFixture;');
const resetFixture = rfFactory === undefined
    ? undefined
    : rfFactory(RF_COPY, rfHash, rfReadJson, T119_TARGET, allAuditRows, rfReadIfExists, RF_AUDIT, RF_WORK, dirname(RF_COPY), RF_ERP, existsSync, rm, mkdir, copyFile, t119join);
const staleAuditRows = allAuditRows(STALE_AUDIT).length;
const seededSha = createHash('sha256').update(STALE_COPY).digest('hex');
let rf;
try {
    rf = await resetFixture();
} catch (error) {
    rf = { error: String(error && error.message ? error.message : error) };
}
check('S1', 'the C5 loop, the C7 block and resetFixture were all found verbatim in the live suite this run read',
    c5Region !== undefined && c5Region.includes('slice(i + 1)') && c5Region.includes('setProblems')
        && c7Region !== undefined && c7Region.includes('finalStateProblems')
        && rfSrc !== undefined && rfSrc.includes('auditRowsAtStart'),
    'c5=' + String(c5Region !== undefined) + ' c7=' + String(c7Region !== undefined) + ' resetFixture=' + String(rfSrc !== undefined) + ' suite=' + SUITE);

check('R1', 'resetFixture WIPES the leftover copy and records exactly what it threw away (previousSha / previousMembers / previousOverride / previousAuditRows)',
    rf !== undefined && rf.error === undefined && rf.previousSha === seededSha && rf.previousMembers === 3
        && rf.previousOverride !== null && rf.previousOverride !== undefined && rf.previousAuditRows === staleAuditRows,
    'result=' + JSON.stringify(rf) + ' seededSha=' + seededSha + ' staleAuditRows=' + staleAuditRows);
const freshSha = createHash('sha256').update(FRESH_ERP).digest('hex');
const copyAfter = existsSync(RF_COPY) ? readFileSync(RF_COPY, 'utf8') : '';
check('R2', 'after the wipe the copy IS the fresh ERP source byte for byte and the old audit trail starts EMPTY (auditRowsAtStart === 0)',
    rf !== undefined && rf.error === undefined && rf.copySha === freshSha && rf.auditRowsAtStart === 0
        && rf.copyExists === true && copyAfter === FRESH_ERP
        && allAuditRows(existsSync(RF_AUDIT) ? readFileSync(RF_AUDIT, 'utf8') : '').length === 0,
    'copySha=' + String(rf?.copySha) + ' freshSha=' + freshSha + ' auditRowsAtStart=' + String(rf?.auditRowsAtStart) + ' copyExact=' + String(copyAfter === FRESH_ERP));

console.log('');
console.log('# run=' + String(realRun ?? 'no live run on disk (synthetic text used for the good case)') + ' helper=' + helperSrc.split('\n').length + ' lines expr=' + exprBody);
console.log('# ' + (total - failures) + '/' + total + ' passed, ' + failures + ' failed');
process.exit(failures === 0 ? 0 : 1);
