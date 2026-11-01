#!/usr/bin/env node
// tests/t129-pins.mjs — the two pin tables must describe the bytes on disk, and the panel
// order inside the shipped bundle must be the order t128 established.
//
// Why a second suite instead of trusting t10 and t114: t10 asserts its OWN pin inside a
// process that also boots the module loader, so a stale pin there is reported as one failed
// check among ~40; t114 reads the SAME FROZEN table but only inside a live-boot run (0 boot
// here). Neither one can answer the question a reviewer actually asks after an artifact
// change — 'did BOTH tables move, and would they go red if they had not?' This suite answers
// it without spawning a boot, and it carries the negative controls that prove the answer.
//
// It never imports tests/t10-ui-bundle-smoke.mjs or tests/t59-erp-live-copy.mjs: both have
// side effects (t10 boots the bundle, t59 spawns a live session). It PARSES their pin
// constants out of the source text, then measures the files itself with node:crypto — so a
// typo'd pin is caught by comparing text against disk, not by re-running the other suites.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const pkgDir = path.join(repoRoot, 'packages', 'dsh-agent-teams');
const t10Path = path.join(here, 't10-ui-bundle-smoke.mjs');
const t59Path = path.join(here, 't59-erp-live-copy.mjs');

const results = [];
let failures = 0;
function check(name, ok, detail) {
    results.push({ name, ok, detail });
    if (!ok) failures += 1;
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

function sha256Of(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}
function measured(relativePath) {
    const full = path.join(pkgDir, relativePath);
    return { path: relativePath, sha256: sha256Of(full), bytes: fs.statSync(full).size };
}
// The single comparison both tables are judged by. Returns the problems instead of a boolean
// so a red run says WHICH half drifted (sha, bytes, or both).
function pinProblems(expected, actual) {
    const problems = [];
    if (expected.sha256 !== actual.sha256) problems.push(expected.path + ': sha256 ' + actual.sha256 + ' != pinned ' + expected.sha256);
    if (expected.bytes !== actual.bytes) problems.push(expected.path + ': bytes ' + actual.bytes + ' != pinned ' + expected.bytes);
    return problems;
}

// ---------------------------------------------------------------- pins held by t10
const t10Source = fs.readFileSync(t10Path, 'utf8');
// Exactly one literal of each: if a second appears, this parser would silently take the first.
function pinnedLiteral(source, constant, pattern) {
    const matches = [...source.matchAll(new RegExp('const ' + constant + ' = ' + pattern, 'g'))];
    return { count: matches.length, value: matches.length === 1 ? matches[0][1] : undefined };
}
const bundleSha = pinnedLiteral(t10Source, 'EXPECTED_BUNDLE_SHA256', "'([0-9a-f]{64})'")
const bundleBytes = pinnedLiteral(t10Source, 'EXPECTED_BUNDLE_BYTES', '(\\d+)')
check('t10 declares EXPECTED_BUNDLE_SHA256 exactly once', bundleSha.count === 1, 'count=' + bundleSha.count);
check('t10 declares EXPECTED_BUNDLE_BYTES exactly once', bundleBytes.count === 1, 'count=' + bundleBytes.count);

const bundleOnDisk = measured('lib/client.js');
const t10Pin = { path: 'lib/client.js', sha256: bundleSha.value, bytes: Number(bundleBytes.value) };
const t10Problems = pinProblems(t10Pin, bundleOnDisk);
check('t10 pin matches lib/client.js on disk', t10Problems.length === 0,
    t10Problems.length === 0
        ? t10Pin.sha256 + ' / ' + t10Pin.bytes + ' B'
        : t10Problems.join('; ') + ' -- rebuild the bundle then re-measure, or fix the pin');

// The pre-t128 values. Kept as literals on purpose: this is the ONLY record in the tree of
// what the pins were before the panel was reordered, and a regression to them must be red.
const PRE_T128_BUNDLE = {
    sha256: '9da18d9971a284e936d709db592da6cedcdf1afa960fff282d7a1c802fec7007',
    bytes: 258432,
};
const staleProblems = pinProblems({ ...bundleOnDisk, sha256: PRE_T128_BUNDLE.sha256 }, bundleOnDisk);
check('a stale (pre-t128) pin would be rejected by the same comparison', staleProblems.length === 1 && staleProblems[0].includes('!= pinned ' + PRE_T128_BUNDLE.sha256),
    'applies: ' + staleProblems.length + ' problem(s): ' + staleProblems.join('; '));
const byteProblems = pinProblems({ ...bundleOnDisk, bytes: bundleOnDisk.bytes + 1 }, bundleOnDisk);
check('a wrong byte count would be rejected even with the right sha', byteProblems.length === 1 && byteProblems[0].includes('bytes'),
    'applies: ' + byteProblems.length + ' problem(s): ' + byteProblems.join('; '));

// ---------------------------------------------------------------- pins held by t59
const t59Source = fs.readFileSync(t59Path, 'utf8');
const frozenBlock = t59Source.slice(t59Source.indexOf('const FROZEN = ['), t59Source.indexOf('];', t59Source.indexOf('const FROZEN = [')));
const frozenRows = [...frozenBlock.matchAll(/\{ path: '([^']+)', sha256: '([0-9a-f]{64})', bytes: (\d+) \}/g)]
        .map((match) => ({ path: match[1], sha256: match[2], bytes: Number(match[3]) }));
// The complete list, in order. Hardcoded: if the table grows or shrinks, this suite says so
// instead of measuring whatever happens to be there and calling it complete.
const EXPECTED_PATHS = [
    'lib/tools.js', 'lib/members.js', 'lib/state.js', 'lib/snapshot.js', 'lib/index.js',
    'lib/tool-names.js', 'lib/client.js', 'lib/client.js.map', 'lib/types/members.d.ts',
    'lib/types/snapshot.d.ts', 'lib/types/tools.d.ts', 'lib/client/ActivityPanel.module.css',
    'package.json',
];
check('t59 FROZEN has exactly 13 rows', frozenRows.length === 13, 'rows=' + frozenRows.length);
const tablePaths = frozenRows.map((row) => row.path).join(',');
check('t59 FROZEN names exactly the 13 frozen files, in order', tablePaths === EXPECTED_PATHS.join(','),
    tablePaths === EXPECTED_PATHS.join(',') ? EXPECTED_PATHS.length + ' paths' : 'got [' + tablePaths + '] want [' + EXPECTED_PATHS.join(',') + ']');

// Every row measured against disk. A drift in ANY row is one failed check naming the row.
const rowProblems = [];
for (const row of frozenRows) {
    const actual = measured(row.path);
    rowProblems.push(...pinProblems(row, actual));
}
check('every t59 FROZEN row matches its file on disk', rowProblems.length === 0,
    rowProblems.length === 0 ? frozenRows.length + ' rows verified' : rowProblems.join('; '));

// Anti false-green: the row loop above cannot catch a table that was shortened, because it
// only measures rows that still exist. This replays the SAME comparison over a table with the
// last row removed and demands a problem — proving the completeness check is load-bearing.
function tableProblems(rows) {
    const problems = [];
    if (rows.length !== EXPECTED_PATHS.length) problems.push('table has ' + rows.length + ' rows, expected ' + EXPECTED_PATHS.length);
    for (const row of rows) problems.push(...pinProblems(row, measured(row.path)));
    return problems;
}
const truncatedRows = frozenRows.slice(0, -1);
const truncatedProblems = tableProblems(truncatedRows);
check('a table truncated to ' + truncatedRows.length + ' rows is rejected (anti false-green)',
    truncatedProblems.some((problem) => problem.includes('expected ' + EXPECTED_PATHS.length)),
    'applies: ' + truncatedProblems.length + ' problem(s): ' + truncatedProblems.join('; '));
const staleRows = frozenRows.map((row) => (row.path === 'lib/client.js' ? { ...row, sha256: PRE_T128_BUNDLE.sha256 } : row));
const staleRowProblems = tableProblems(staleRows);
check('a stale lib/client.js row is rejected by the same table comparison',
    staleRowProblems.length === 1 && staleRowProblems[0].includes('lib/client.js'),
    'applies: ' + staleRowProblems.length + ' problem(s): ' + staleRowProblems.join('; '));

// Both tables must agree: updating one and forgetting the other is exactly the failure that
// leaves t10 green while t114 red (or the reverse) for a reason nobody expects.
const frozenClientRow = frozenRows.find((row) => row.path === 'lib/client.js');
check('t10 pin and the FROZEN lib/client.js row carry the same sha256 + bytes',
    frozenClientRow !== undefined && frozenClientRow.sha256 === t10Pin.sha256 && frozenClientRow.bytes === t10Pin.bytes,
    frozenClientRow === undefined ? 'FROZEN has no lib/client.js row' : frozenClientRow.sha256 + '/' + frozenClientRow.bytes + ' vs t10 ' + t10Pin.sha256 + '/' + t10Pin.bytes);

// ---------------------------------------------------------------- panel order in the bundle
const bundleSource = fs.readFileSync(path.join(pkgDir, 'lib', 'client.js'), 'utf8');
// t139 replaced the t128 single column with two columns: the member column (AddMemberControl
// then the member list) comes FIRST, the DependencyMap column AFTER it. The negative control
// below uses the rejected t128 order, so this table still has teeth.
const PANEL_ORDER = [
    ['AddMemberControl above the member list', 'AddMemberControl, { team'],
    ['the member list (orderDelegationMembers call)', 'orderDelegationMembers(team.members, team.tasks)'],
    ['DependencyMap in the right-hand column', 'DependencyMap, { tasks'],
];
function orderProblems(text) {
    const problems = [];
    const seen = [];
    for (const [label, marker] of PANEL_ORDER) {
        const count = text.split(marker).length - 1;
        if (count !== 1) problems.push(label + ': ' + JSON.stringify(marker) + ' occurs ' + count + 'x, expected exactly 1');
        seen.push({ label, index: text.indexOf(marker) });
    }
    for (let i = 1; i < seen.length; i += 1) {
        const prev = seen[i - 1];
        const cur = seen[i];
        if (prev.index === -1 || cur.index === -1) continue;
        if (!(prev.index < cur.index)) problems.push(prev.label + ' @' + prev.index + ' must precede ' + cur.label + ' @' + cur.index);
    }
    return problems;
}
const realOrderProblems = orderProblems(bundleSource);
check('panel order in the shipped bundle (t139): AddMemberControl < member list < DependencyMap',
    realOrderProblems.length === 0,
    realOrderProblems.length === 0
        ? PANEL_ORDER.map((entry) => entry[1] + '@' + bundleSource.indexOf(entry[1])).join(' < ')
        : realOrderProblems.join('; '));
const oldOrder = [PANEL_ORDER[2][1], PANEL_ORDER[0][1], PANEL_ORDER[1][1]].join('\n');
const oldOrderProblems = orderProblems(oldOrder);
check('the rejected t128 order fails the same order check',
    oldOrderProblems.length > 0 && oldOrderProblems.every((problem) => problem.includes('must precede')),
    'applies: ' + oldOrderProblems.length + ' problem(s): ' + oldOrderProblems.join('; '));

console.log('');
console.log('# ' + results.length + '/' + results.length + ' passed, ' + failures + ' failed');
process.exit(failures === 0 ? 0 : 1);
