#!/usr/bin/env node
/**
 * tests/t115-check-contract.mjs — proves tools/check-contract.mjs has teeth.
 *
 * The gate is a PRE-DISPATCH check, so it is only worth having if it goes RED on the two contract
 * defects that actually happened in 18 rounds: a verify command pointing at a file that does not
 * exist, and a card created without an assignee. Every case below therefore builds a FIXTURE state
 * dir under tests/tmp/t115 and asserts BOTH the exit code and the FAIL line the gate printed.
 *
 * The last case is the negative control: it copies the tool, neuters check (a) so it can never
 * FAIL, and then asserts that the neutered copy returns 0 where the real tool returns 1 — which is
 * what makes (a) load-bearing rather than decorative. applies/delta bytes are printed.
 *
 *   node tests/t115-check-contract.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const TOOL = join(REPO, 'tools', 'check-contract.mjs');
const WORK = join(HERE, 'tmp', 't115');
const LEDGER = join(REPO, '.agent-teams', 'nami-agent-teams');

let passed = 0;
const failures = [];
function record(name, condition, evidence) {
    if (condition === true) {
        passed += 1;
        console.log('ok   ' + name);
    } else {
        failures.push(name);
        console.log('FAIL ' + name + ' — ' + String(evidence ?? ''));
    }
    if (evidence !== undefined && condition === true) console.log('       ' + evidence);
}

function runGate(tool, stateDir, taskId, extra = []) {
    const res = spawnSync(process.execPath, [tool, '--state', stateDir, '--task', taskId].concat(extra), { cwd: REPO, encoding: 'utf8' });
    return { code: res.status, out: String(res.stdout ?? ''), err: String(res.stderr ?? '') };
}

function gateJson(stateDir, taskId) {
    const run = runGate(TOOL, stateDir, taskId, ['--json']);
    let report = undefined;
    try {
        report = JSON.parse(run.out);
    } catch {
        report = undefined;
    }
    return { run, report };
}

function checkOf(report, id) {
    return (report?.checks ?? []).find((entry) => entry.id === id);
}

function fixture(caseName, tasks) {
    const dir = join(WORK, caseName);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'team.json'), JSON.stringify({ id: 'fixture-' + caseName, name: 'fixture', members: [], tasks }, null, 2), 'utf8');
    return dir;
}

function task(overrides = {}) {
    return Object.assign({
        id: 'tx',
        subject: 'fixture card',
        status: 'todo',
        assignee: 'dev-runtime-goat',
        kind: 'implementation',
        dependencies: [],
        inScope: ['tests/t115-check-contract.mjs'],
        outOfScope: ['packages/dsh-agent-teams'],
        deliverables: ['tests/t115-check-contract.mjs'],
        verify: ['node tests/t115-check-contract.mjs'],
    }, overrides);
}
// ---------------------------------------------------------------- the good contract
const goodDir = fixture('good', [task()]);
const good = gateJson(goodDir, 'tx');
record('g1 a well-formed card exits 0 with verdict PASS', good.run.code === 0 && good.report?.verdict === 'PASS', 'exit=' + good.run.code + ' verdict=' + good.report?.verdict);
record('g2 all six checks are reported and all pass', (good.report?.checks ?? []).length === 6 && (good.report?.checks ?? []).every((entry) => entry.ok === true), 'ids=' + (good.report?.checks ?? []).map((entry) => entry.id + ':' + entry.ok).join(','));

// ---------------------------------------------------------------- (a) verify targets exist
const missingDir = fixture('missing-verify', [task({ verify: ['node tests/t111-pack.mjs'] })]);
const missing = gateJson(missingDir, 'tx');
const missingCheck = checkOf(missing.report, 'a');
record('a1 a verify command pointing at a missing file exits 1', missing.run.code === 1 && missingCheck?.ok === false, 'exit=' + missing.run.code + ' detail=' + String(missingCheck?.detail).slice(0, 160));
record('a2 the FAIL line names the path that does not exist', String(missingCheck?.detail ?? '').includes('missing: tests/t111-pack.mjs'), 'detail=' + String(missingCheck?.detail).slice(0, 160));

const nearDir = fixture('near-miss', [task({ verify: ['node tests/t43-set-member-profile.mjs'] })]);
const near = gateJson(nearDir, 'tx');
const nearCheck = checkOf(near.report, 'a');
record('a3 a near-miss path gets the real file suggested', near.run.code === 1 && String(nearCheck?.detail ?? '').includes('nearest real file') && String(nearCheck?.detail ?? '').includes('t43-member-profile.mjs'), 'detail=' + String(nearCheck?.detail).slice(0, 200));

const existsDir = fixture('exists-verify', [task({ verify: ['node tests/t43-member-profile.mjs'] })]);
const exists = gateJson(existsDir, 'tx');
record('a4 a verify command pointing at a real file passes', exists.run.code === 0 && checkOf(exists.report, 'a')?.ok === true, 'detail=' + String(checkOf(exists.report, 'a')?.detail));

const cdDir = fixture('cd-prefix', [task({ verify: ['cd packages/dsh-agent-teams && node build/build.mjs'] })]);
const cd = gateJson(cdDir, 'tx');
record('a5 a cd-prefixed command resolves relative to the cd directory', cd.run.code === 0 && checkOf(cd.report, 'a')?.ok === true, 'detail=' + String(checkOf(cd.report, 'a')?.detail));

const flagDir = fixture('flag-first', [task({ verify: ['node --check tools/check-contract.mjs'] })]);
const flag = gateJson(flagDir, 'tx');
record('a6 a leading flag is skipped before the path', flag.run.code === 0 && checkOf(flag.report, 'a')?.ok === true, 'detail=' + String(checkOf(flag.report, 'a')?.detail));

// the bootstrapping case: a card whose verify runs the very file the card will create. Before the
// plannedByTask() rule this FAILED check (a) on t118 — a real card, not a typo. The second half of
// the pair is what keeps the rule honest: a path that is NOT declared as a deliverable still fails.
// The fixture target MUST be a name that never exists on disk: it used to be 'tests/t118-pack.mjs',
// which card t118 then created, so the exemption stopped applying (exists: …) and a8 went red on a
// correct deliverable (t118 caught this: fixture depended on a file being ABSENT). 't118b-planned-only'
// keeps the rule testable forever and is not a waiver of anything — a9 still requires a real failure.
const plannedDir = fixture('planned-verify', [task({
    inScope: ['tests/t118b-planned-only.mjs', 'tests/tmp/t118'],
    deliverables: ['tests/t118b-planned-only.mjs'],
    verify: ['node tests/t118b-planned-only.mjs --analyze tests/tmp/t118'],
})]);
const planned = gateJson(plannedDir, 'tx');
record('a8 a verify target the card declares as its own deliverable passes as planned', planned.run.code === 0 && String(checkOf(planned.report, 'a')?.detail ?? '').includes('planned by this task'), 'exit=' + planned.run.code + ' detail=' + String(checkOf(planned.report, 'a')?.detail).slice(0, 200));
const plannedTypoDir = fixture('planned-typo', [task({
    inScope: ['tests/t118-pack.mjs', 'tests/tmp/t118'],
    deliverables: ['tests/t118-pack.mjs'],
    verify: ['node tests/t999-typo.mjs'],
})]);
const plannedTypo = gateJson(plannedTypoDir, 'tx');
record('a9 an undeclared missing path still fails — the exemption is not a blanket waiver', plannedTypo.run.code === 1 && String(checkOf(plannedTypo.report, 'a')?.detail ?? '').includes('missing: tests/t999-typo.mjs'), 'exit=' + plannedTypo.run.code + ' detail=' + String(checkOf(plannedTypo.report, 'a')?.detail).slice(0, 160));
const shellDir = fixture('non-node', [task({ verify: ['powershell -NoProfile -Command "exit 0"'] })]);
const shell = gateJson(shellDir, 'tx');
record('a7 a non-node command is skipped, not failed', shell.run.code === 0 && String(checkOf(shell.report, 'a')?.detail ?? '').includes('skipped'), 'detail=' + String(checkOf(shell.report, 'a')?.detail).slice(0, 160));

// ---------------------------------------------------------------- (b) assignee
const poolDir = fixture('no-assignee', [task({ assignee: '' })]);
const pool = gateJson(poolDir, 'tx');
const poolCheck = checkOf(pool.report, 'b');
record('b1 an empty assignee exits 1', pool.run.code === 1 && poolCheck?.ok === false, 'exit=' + pool.run.code);
record('b2 the reason names the cross-claim risk verbatim', String(poolCheck?.detail ?? '').includes('card ở pool chung — member sẽ claim chéo'), 'detail=' + String(poolCheck?.detail));
const blankDir = fixture('blank-assignee', [task({ assignee: '   ' })]);
record('b3 a whitespace-only assignee is empty too', runGate(TOOL, blankDir, 'tx').code === 1, 'exit=' + runGate(TOOL, blankDir, 'tx').code);

// ---------------------------------------------------------------- (c) kind requirements
const reviewBadDir = fixture('review-no-target', [task({ kind: 'review', verify: [] })]);
const reviewBad = gateJson(reviewBadDir, 'tx');
record('c1 kind=review without reviewedTaskId fails', reviewBad.run.code === 1 && String(checkOf(reviewBad.report, 'c')?.detail ?? '').includes('reviewedTaskId'), 'detail=' + String(checkOf(reviewBad.report, 'c')?.detail));
const reviewGoodDir = fixture('review-with-target', [task({ kind: 'review', reviewedTaskId: 't100' })]);
record('c2 kind=review with reviewedTaskId passes', gateJson(reviewGoodDir, 'tx').run.code === 0, 'exit=0 expected');
const repairBadDir = fixture('repair-no-source', [task({ kind: 'repair' })]);
const repairBad = gateJson(repairBadDir, 'tx');
record('c3 kind=repair without sourceTaskId fails', repairBad.run.code === 1 && String(checkOf(repairBad.report, 'c')?.detail ?? '').includes('sourceTaskId'), 'detail=' + String(checkOf(repairBad.report, 'c')?.detail));
const implNoVerifyDir = fixture('impl-no-verify', [task({ verify: [] })]);
const implNoVerify = gateJson(implNoVerifyDir, 'tx');
record('c4 kind=implementation with no verify command fails', implNoVerify.run.code === 1 && String(checkOf(implNoVerify.report, 'c')?.detail ?? '').includes('at least one verify'), 'detail=' + String(checkOf(implNoVerify.report, 'c')?.detail));

// ---------------------------------------------------------------- (d) inScope shape
const emptyScopeDir = fixture('empty-scope', [task({ inScope: [], deliverables: [] })]);
const emptyScope = gateJson(emptyScopeDir, 'tx');
record('d1 an empty inScope fails', emptyScope.run.code === 1 && String(checkOf(emptyScope.report, 'd')?.detail ?? '').includes('inScope is empty'), 'detail=' + String(checkOf(emptyScope.report, 'd')?.detail));
const absScopeDir = fixture('absolute-scope', [task({ inScope: ['E:/Project/ERP/x.json'], deliverables: [] })]);
const absScope = gateJson(absScopeDir, 'tx');
record('d2 an absolute path in inScope fails', absScope.run.code === 1 && String(checkOf(absScope.report, 'd')?.detail ?? '').includes('absolute path'), 'detail=' + String(checkOf(absScope.report, 'd')?.detail));

// ---------------------------------------------------------------- (e) deliverables inside inScope
const outsideDir = fixture('deliverable-outside', [task({ deliverables: ['tools/other.mjs'] })]);
const outside = gateJson(outsideDir, 'tx');
record('e1 a deliverable outside inScope fails', outside.run.code === 1 && String(checkOf(outside.report, 'e')?.detail ?? '').includes('deliverable outside inScope'), 'detail=' + String(checkOf(outside.report, 'e')?.detail).slice(0, 160));
const dirScopeDir = fixture('deliverable-in-dir', [task({ inScope: ['tests/tmp/t115'], deliverables: ['tests/tmp/t115/nested/x.mjs'], verify: ['node tests/t115-check-contract.mjs'] })]);
record('e2 a deliverable inside an inScope directory passes', gateJson(dirScopeDir, 'tx').run.code === 0, 'exit=0 expected');

// ---------------------------------------------------------------- (f) outOfScope coverage
const coverDir = fixture('scope-overlap', [task({ inScope: ['tests/x.mjs'], outOfScope: ['tests'], deliverables: ['tests/x.mjs'], verify: ['node tests/t115-check-contract.mjs'] })]);
const cover = gateJson(coverDir, 'tx');
record('f1 an outOfScope that covers an inScope entry fails', cover.run.code === 1 && String(checkOf(cover.report, 'f')?.detail ?? '').includes('covers inScope'), 'detail=' + String(checkOf(cover.report, 'f')?.detail));
const noCoverDir = fixture('scope-no-overlap', [task({ inScope: ['docs/kiem-thu/a.md'], outOfScope: ['docs/log'], deliverables: ['docs/kiem-thu/a.md'] })]);
record('f2 sibling directories do not collide', gateJson(noCoverDir, 'tx').run.code === 0, 'exit=0 expected');
// ---------------------------------------------------------------- exit 2: the input itself is unreadable
const noState = runGate(TOOL, join(WORK, 'does-not-exist'), 'tx');
record('h1 a missing state dir exits 2', noState.code === 2 && noState.err.includes('GATE ERROR') && noState.err.includes('no team.json'), 'exit=' + noState.code + ' err=' + noState.err.trim().split('\n')[0]);
const unknownTask = runGate(TOOL, goodDir, 't9999');
record('h2 an unknown task id exits 2', unknownTask.code === 2 && unknownTask.err.includes('does not exist'), 'exit=' + unknownTask.code + ' err=' + unknownTask.err.trim().split('\n')[0].slice(0, 120));
const brokenDir = fixture('broken-json', []);
writeFileSync(join(brokenDir, 'team.json'), '{ not json', 'utf8');
const broken = runGate(TOOL, brokenDir, 'tx');
record('h3 malformed team.json exits 2', broken.code === 2 && broken.err.includes('not valid JSON'), 'exit=' + broken.code + ' err=' + broken.err.trim().split('\n')[0].slice(0, 120));
const bogusArg = runGate(TOOL, goodDir, 'tx', ['--bogus']);
record('h4 an unknown argument exits 2 instead of silently ignoring it', bogusArg.code === 2 && bogusArg.err.includes('unknown argument'), 'exit=' + bogusArg.code + ' err=' + bogusArg.err.trim().split('\n')[0]);

// ---------------------------------------------------------------- the tool runs on the REAL ledger
const real115 = gateJson(LEDGER, 't115');
record('i1 the real t115 contract PASSES 6/6', real115.run.code === 0 && real115.report?.verdict === 'PASS', 'exit=' + real115.run.code + ' checks=' + (real115.report?.checks ?? []).map((entry) => entry.id + ':' + entry.ok).join(','));
const real114 = runGate(TOOL, LEDGER, 't114');
record('i2 the real t114 contract yields a verdict (0 or 1, printed for the captain)', real114.code === 0 || real114.code === 1, 'exit=' + real114.code + ' firstLine=' + real114.out.split('\n')[0]);
console.log('       real-ledger t114 exit=' + real114.code);
for (const line of real114.out.split('\n')) {
    if (line.startsWith('FAIL ') || line.startsWith('pass ') || line.startsWith('PASS ') || line.startsWith('verdict ')) console.log('       ' + line);
}

// ---------------------------------------------------------------- negative control: neuter (a) and watch the outcome change
const source = readFileSync(TOOL, 'utf8');
const anchorVerdict = 'ok: verifyFailures.length === 0';
const anchorRoot = "const REPO_ROOT = resolve(HERE, '..');";
const anchorVerdictCount = source.split(anchorVerdict).length - 1;
const anchorRootCount = source.split(anchorRoot).length - 1;
const negativeDir = join(WORK, 'negative');
rmSync(negativeDir, { recursive: true, force: true });
mkdirSync(negativeDir, { recursive: true });
const mutantPath = join(negativeDir, 'tool-no-verify-check.mjs');
let mutant = source;
mutant = mutant.replace(anchorVerdict, 'ok: true');
mutant = mutant.replace(anchorRoot, 'const REPO_ROOT = ' + JSON.stringify(REPO) + ';');
const applies = (mutant !== source ? 1 : 0) + (mutant.split(anchorRoot).length - 1 === 0 ? 1 : 0);
const deltaBytes = Buffer.byteLength(mutant) - Buffer.byteLength(source);
writeFileSync(mutantPath, mutant, 'utf8');
const realOnA1 = runGate(TOOL, missingDir, 'tx');
const mutantOnA1 = runGate(mutantPath, missingDir, 'tx');
console.log('       negative control: applies=' + applies + ' anchor_verdict=' + anchorVerdictCount + ' anchor_root=' + anchorRootCount + ' delta_bytes=' + deltaBytes);
record('j1 the anchors are unique, so the mutation is not a no-op', anchorVerdictCount === 1 && anchorRootCount === 1 && applies === 2 && deltaBytes !== 0, 'applies=' + applies + ' delta_bytes=' + deltaBytes);
record('j2 with check (a) neutered the gate PASSES the bad contract it used to catch', mutantOnA1.code === 0 && realOnA1.code === 1, 'real_exit=' + realOnA1.code + ' mutant_exit=' + mutantOnA1.code);
record('j3 the mutated copy still prints PASS for (a) on the missing-file fixture', mutantOnA1.out.includes('PASS (a) verify targets exist'), 'mutant first lines=' + mutantOnA1.out.split('\n').slice(0, 2).join(' / '));


// ---------------------------------------------------------------- t117-like card: inScope INSIDE outOfScope
// Audit round 19 found this defect on card t117, but only AFTER the card was completed — a terminal
// contract is immutable, so the FAIL could never be repaired. These cases keep both halves alive:
// the shape still fails, and --pre reports that same failure BEFORE the card goes terminal.
const nestedDir = fixture('t117-like', [task({
    kind: 'repair',
    sourceTaskId: 't112',
    inScope: ['packages/dsh-agent-teams/lib/tools.js', 'tests/tmp/t123'],
    outOfScope: ['packages/dsh-agent-teams'],
    deliverables: ['packages/dsh-agent-teams/lib/tools.js'],
    verify: ['node tools/check-contract.mjs --state x --task tx'],
})]);
const nested = gateJson(nestedDir, 'tx');
const nestedCheck = checkOf(nested.report, 'f');
record('k1 a card whose inScope sits inside outOfScope fails, naming both paths', nested.run.code === 1
    && nestedCheck?.ok === false
    && String(nestedCheck?.detail ?? '').includes('covers inScope')
    && String(nestedCheck?.detail ?? '').includes('packages/dsh-agent-teams/lib/tools.js'),
'exit=' + nested.run.code + ' detail=' + String(nestedCheck?.detail).slice(0, 200));
const real117 = gateJson(LEDGER, 't117');
const real117Check = checkOf(real117.report, 'f');
record('k2 the REAL t117 card still fails (f) — the law was not loosened to make it pass', real117.run.code === 1
    && real117Check?.ok === false
    && String(real117Check?.detail ?? '').includes('outOfScope "packages/dsh-agent-teams" covers inScope "packages/dsh-agent-teams/lib/tools.js"'),
'exit=' + real117.run.code + ' detail=' + String(real117Check?.detail).slice(0, 200));

// ---------------------------------------------------------------- --pre: same conclusion, earlier moment
function gateJsonPre(stateDir, taskId) {
    const run = runGate(TOOL, stateDir, taskId, ['--json', '--pre']);
    let report = undefined;
    try {
        report = JSON.parse(run.out);
    } catch {
        report = undefined;
    }
    return { run, report };
}
const nestedPre = gateJsonPre(nestedDir, 'tx');
const idsOf = (report) => (report?.checks ?? []).filter((entry) => entry.ok !== true).map((entry) => entry.id).join(',');
record('k3 --pre reaches the same verdict and the same failing checks as the normal mode', nestedPre.run.code === nested.run.code
    && nestedPre.report?.verdict === nested.report?.verdict
    && idsOf(nestedPre.report) === idsOf(nested.report)
    && idsOf(nested.report) === 'f',
'pre_exit=' + nestedPre.run.code + ' normal_exit=' + nested.run.code + ' pre_verdict=' + nestedPre.report?.verdict + ' normal_verdict=' + nested.report?.verdict + ' failed_pre=' + idsOf(nestedPre.report) + ' failed_normal=' + idsOf(nested.report));
record('k4 --pre marks the report as pre-terminal and blocks completion when a check fails', nestedPre.report?.mode === 'pre'
    && nestedPre.report?.preTerminal === true
    && nestedPre.report?.terminalBlocked === true,
'mode=' + nestedPre.report?.mode + ' preTerminal=' + nestedPre.report?.preTerminal + ' terminalBlocked=' + nestedPre.report?.terminalBlocked);
const nestedPreText = runGate(TOOL, nestedDir, 'tx', ['--pre']);
record('k5 --pre prints that going terminal now would freeze the failure and names the check', nestedPreText.code === 1
    && nestedPreText.out.includes('contract gate [PRE-TERMINAL]')
    && nestedPreText.out.includes('PRE-TERMINAL: do NOT record completion yet — fix (f)')
    && nestedPreText.out.includes('a terminal card is immutable'),
'exit=' + nestedPreText.code + ' lastLines=' + nestedPreText.out.split('\n').filter((line) => line.startsWith('PRE-TERMINAL')).join(' / ').slice(0, 240));
const goodPre = gateJsonPre(goodDir, 'tx');
const goodNormal = gateJson(goodDir, 'tx');
record('k6 --pre on a good card stays 0/PASS — it is not a second, gentler gate', goodPre.run.code === 0
    && goodPre.report?.verdict === 'PASS'
    && (goodPre.report?.checks ?? []).length === 6
    && (goodPre.report?.checks ?? []).every((entry) => entry.ok === true)
    && goodPre.report?.terminalBlocked === false
    && goodNormal.run.code === 0,
'pre_exit=' + goodPre.run.code + ' checks=' + (goodPre.report?.checks ?? []).map((entry) => entry.id + ':' + entry.ok).join(','));
const goodPreText = runGate(TOOL, goodDir, 'tx', ['--pre']);
record('k7 --pre on a good card says completion is legal right now', goodPreText.code === 0
    && goodPreText.out.includes('PRE-TERMINAL PASS — recording completion for tx is legal right now'),
'exit=' + goodPreText.code + ' preLine=' + String(goodPreText.out.split('\n').find((line) => line.startsWith('PRE-TERMINAL PASS'))).slice(0, 160));
const preBogus = runGate(TOOL, goodDir, 'tx', ['--pre', '--nope']);
record('k8 --pre does not swallow unknown arguments', preBogus.code === 2 && preBogus.err.includes('unknown argument'), 'exit=' + preBogus.code);

// ---------------------------------------------------------------- negative control 2: neuter (f)
// The t117 defect is the one (f) exists for, so (f) must be load-bearing on THIS fixture: neutering
// check (f) has to turn the k1 verdict from FAIL to PASS, or k1 proves nothing about the law.
const anchorOverlap = 'const ok = clashes.length === 0;';
const anchorOverlapCount = source.split(anchorOverlap).length - 1;
const overlapDir = join(WORK, 'negative-overlap');
rmSync(overlapDir, { recursive: true, force: true });
mkdirSync(overlapDir, { recursive: true });
const overlapPath = join(overlapDir, 'tool-no-overlap-check.mjs');
let overlapMutant = source;
overlapMutant = overlapMutant.replace(anchorOverlap, 'const ok = true;');
overlapMutant = overlapMutant.replace(anchorRoot, 'const REPO_ROOT = ' + JSON.stringify(REPO) + ';');
writeFileSync(overlapPath, overlapMutant, 'utf8');
const realOnNested = runGate(TOOL, nestedDir, 'tx', ['--pre']);
const mutantOnNested = runGate(overlapPath, nestedDir, 'tx', ['--pre']);
console.log('       negative control 2: applies=' + (overlapMutant.split(anchorOverlap).length - 1 === 0 ? 1 : 0) + ' anchor_overlap=' + anchorOverlapCount + ' delta_bytes=' + (Buffer.byteLength(overlapMutant) - Buffer.byteLength(source)));
record('k9 the (f) anchor is unique, so that mutation is not a no-op', anchorOverlapCount === 1, 'anchor_overlap=' + anchorOverlapCount);
record('k10 neutering (f) makes the t117-like card PASS — (f) is load-bearing, not decorative', realOnNested.code === 1 && mutantOnNested.code === 0, 'real_exit=' + realOnNested.code + ' mutant_exit=' + mutantOnNested.code);
console.log('');
console.log('# ' + passed + '/' + (passed + failures.length) + ' passed, ' + failures.length + ' failed');
if (failures.length > 0) console.log('# failed: ' + failures.join(', '));
process.exit(failures.length === 0 ? 0 : 1);
