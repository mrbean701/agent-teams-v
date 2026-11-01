#!/usr/bin/env node
/**
 * t128 — the AgentTeams panel must render DependencyMap, then AddMemberControl, then the
 * member list, and the three shipped artefacts must agree about it.
 *
 * The three files cannot drift apart silently: lib/client/ActivityPanel.js is the SOURCE,
 * lib/client.js is the BUNDLE the Host really loads (there is no build toolchain in this repo),
 * and lib/client.js.map carries the source verbatim in sourcesContent[2]. Every case below is
 * boot-free and reads the real files; the two negative controls run the SAME predicates on
 * copies under tests/tmp/t128 and must go red there.
 *
 * Run from the repo root: node tests/t128-panel-order.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = dirname(HERE);
const PKG = join(REPO_ROOT, 'packages', 'dsh-agent-teams');
const PANEL = join(PKG, 'lib', 'client', 'ActivityPanel.js');
const BUNDLE = join(PKG, 'lib', 'client.js');
const MAP = join(PKG, 'lib', 'client.js.map');
const BEFORE = join(REPO_ROOT, 'tests', 'tmp', 't128', 'before');
const NEG2 = join(REPO_ROOT, 'tests', 'tmp', 't128', 'neg2');

const SOURCE_ANCHORS = {
    dependency: '_jsx(DependencyMap, {',
    addMember: '_jsx(AddMemberControl, {',
    members: 'orderDelegationMembers',
    workspace: 'workspace && _jsx(WorkspaceSummary',
};
const BUNDLE_ANCHORS = {
    dependency: '(0, import_jsx_runtime5.jsx)(DependencyMap, {',
    addMember: '(0, import_jsx_runtime5.jsx)(AddMemberControl, {',
    members: 'orderDelegationMembers',
    workspace: 'workspace && (0, import_jsx_runtime5.jsx)(WorkspaceSummary',
};

let failures = 0;
const results = [];
function check(id, name, ok, detail) {
    const line = (ok ? 'PASS ' : 'FAIL ') + id + ' — ' + name;
    results.push({ id, ok });
    if (!ok) failures += 1;
    console.log(line);
    if (detail !== undefined) console.log('      evidence: ' + detail);
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Order of the three anchors inside ONE artefact, as problems (empty when correct). */
function orderProblems(text, anchors, label) {
    const problems = [];
    const at = {};
    for (const [key, needle] of Object.entries(anchors)) {
        const first = text.indexOf(needle);
        const hits = text.split(needle).length - 1;
        at[key] = first;
        if (first < 0) problems.push(label + ': anchor ' + key + ' is missing (' + JSON.stringify(needle) + ')');
        if (key !== 'members' && hits > 1) problems.push(label + ': anchor ' + key + ' appears ' + hits + ' times — a moved call site was left behind');
    }
    if (problems.length > 0) return problems;
    if (anchors.members !== undefined) {
        // The LAST occurrence, not the first: the member list anchor is the use inside the members
        // IIFE (an import/definition sits earlier). Anchoring it at the DependencyMap would make an
        // OLD-order artefact report "anchor missing" instead of the real ordering problem.
        const membersAt = text.lastIndexOf(anchors.members);
        at.members = membersAt;
        if (membersAt < 0) problems.push(label + ': the member list anchor is not after the dependency map');
    }
    if (problems.length === 0) {
        if (!(at.dependency < at.addMember)) problems.push(label + ': DependencyMap is not before AddMemberControl (' + at.dependency + ' vs ' + at.addMember + ')');
        if (!(at.addMember < at.members)) problems.push(label + ': AddMemberControl is not before the member list (' + at.addMember + ' vs ' + at.members + ')');
        if (!(at.members < at.workspace)) problems.push(label + ': the member list is not before the WorkspaceSummary guard (' + at.members + ' vs ' + at.workspace + ')');
        if (!(at.dependency < at.workspace)) problems.push(label + ': DependencyMap is not before the WorkspaceSummary guard');
    }
    return problems;
}

/** The three artefacts must agree: source text, bundle call order, map content. */
function syncProblems(source, bundle, map, label) {
    const problems = [];
    if (map.sources[2] !== '../lib/client/ActivityPanel.js') problems.push(label + ': sources[2] is ' + JSON.stringify(map.sources[2]) + ', expected ../lib/client/ActivityPanel.js');
    if (map.sourcesContent[2] !== source) problems.push(label + ': sourcesContent[2] differs from the panel source (' + map.sourcesContent[2].length + ' vs ' + source.length + ' chars)');
    const sourceOk = orderProblems(source, SOURCE_ANCHORS, 'source').length === 0;
    const bundleOk = orderProblems(bundle, BUNDLE_ANCHORS, 'bundle').length === 0;
    if (sourceOk !== bundleOk) problems.push(label + ': source order is ' + (sourceOk ? 'the NEW one' : 'the OLD one') + ' but the bundle order is ' + (bundleOk ? 'the NEW one' : 'the OLD one') + ' — the shipped bundle disagrees with its source');
    return problems;
}

const panel = readFileSync(PANEL, 'utf8');
const bundle = readFileSync(BUNDLE, 'utf8');
const mapRaw = readFileSync(MAP, 'utf8');
const map = JSON.parse(mapRaw);
const before = {
    panel: readFileSync(join(BEFORE, 'ActivityPanel.js'), 'utf8'),
    bundle: readFileSync(join(BEFORE, 'client.js'), 'utf8'),
    mapRaw: readFileSync(join(BEFORE, 'client.js.map'), 'utf8'),
};
const beforeMap = JSON.parse(before.mapRaw);

check('P1', 'the panel source renders DependencyMap, then AddMemberControl, then the member list',
    orderProblems(panel, SOURCE_ANCHORS, 'source').length === 0,
    JSON.stringify({ dependency: panel.indexOf(SOURCE_ANCHORS.dependency), addMember: panel.indexOf(SOURCE_ANCHORS.addMember), members: panel.indexOf(SOURCE_ANCHORS.members, panel.indexOf(SOURCE_ANCHORS.dependency)), workspace: panel.indexOf(SOURCE_ANCHORS.workspace) }));

const panelProgress = panel.indexOf('_jsx(ProgressOverview, {');
check('P2', 'the panel still renders ProgressOverview first, and every moved anchor sits before the WorkspaceSummary guard',
    panelProgress >= 0 && panelProgress < panel.indexOf(SOURCE_ANCHORS.dependency) && panel.indexOf(SOURCE_ANCHORS.addMember) < panel.indexOf(SOURCE_ANCHORS.workspace),
    'progress=' + panelProgress + ' dependency=' + panel.indexOf(SOURCE_ANCHORS.dependency) + ' workspace=' + panel.indexOf(SOURCE_ANCHORS.workspace));

check('P3', 'each moved call site survives exactly once in the panel (a move, not a copy)',
    panel.split(SOURCE_ANCHORS.dependency).length - 1 === 1 && panel.split(SOURCE_ANCHORS.addMember).length - 1 === 1,
    'DependencyMap=' + (panel.split(SOURCE_ANCHORS.dependency).length - 1) + ' AddMemberControl=' + (panel.split(SOURCE_ANCHORS.addMember).length - 1));

const bundleProblems = orderProblems(bundle, BUNDLE_ANCHORS, 'bundle');
check('B1', 'the shipped bundle lib/client.js (what the Host loads) carries the same order',
    bundleProblems.length === 0,
    JSON.stringify({ problems: bundleProblems, dependency: bundle.indexOf(BUNDLE_ANCHORS.dependency), addMember: bundle.indexOf(BUNDLE_ANCHORS.addMember), members: bundle.indexOf(BUNDLE_ANCHORS.members, bundle.indexOf(BUNDLE_ANCHORS.dependency)), workspace: bundle.indexOf(BUNDLE_ANCHORS.workspace) }));

check('B2', 'the bundle keeps both call sites exactly once, so nothing renders twice',
    bundle.split(BUNDLE_ANCHORS.dependency).length - 1 === 1 && bundle.split(BUNDLE_ANCHORS.addMember).length - 1 === 1 && bundle.split(BUNDLE_ANCHORS.workspace).length - 1 === 1,
    'DependencyMap=' + (bundle.split(BUNDLE_ANCHORS.dependency).length - 1) + ' AddMemberControl=' + (bundle.split(BUNDLE_ANCHORS.addMember).length - 1) + ' WorkspaceSummary=' + (bundle.split(BUNDLE_ANCHORS.workspace).length - 1));

check('M1', 'the sourcemap still names ../lib/client/ActivityPanel.js as sources[2] and carries the panel verbatim',
    syncProblems(panel, bundle, map, 'tree').length === 0,
    JSON.stringify({ problems: syncProblems(panel, bundle, map, 'tree'), sources2: map.sources[2], contentMatches: map.sourcesContent[2] === panel, mapSha: sha256(mapRaw).slice(0, 16) }));

check('M2', 'mappings, names and version are untouched (only sourcesContent[2] may differ)',
    map.mappings === beforeMap.mappings && JSON.stringify(map.names) === JSON.stringify(beforeMap.names) && map.version === beforeMap.version && JSON.stringify(map.sources) === JSON.stringify(beforeMap.sources),
    'mappings same=' + (map.mappings === beforeMap.mappings) + ' names same=' + (JSON.stringify(map.names) === JSON.stringify(beforeMap.names)) + ' version=' + map.version);

const panelBefore = before.panel.split('\n');
const panelNow = panel.split('\n');
const panelChanged = [];
for (let i = 0; i < Math.max(panelBefore.length, panelNow.length); i += 1) if (panelBefore[i] !== panelNow[i]) panelChanged.push(i + 1);
check('D1', 'the panel diff against the recorded before/ copy is exactly the two call-site lines (392 and 437)',
    panelChanged.length === 2 && panelChanged.includes(392) && panelChanged.includes(437) && panelBefore.length === panelNow.length,
    'changed lines=' + JSON.stringify(panelChanged) + ' lineCount ' + panelBefore.length + ' -> ' + panelNow.length);

const bundleBefore = before.bundle.split('\n');
const bundleNow = bundle.split('\n');
const bundleChanged = [];
for (let i = 0; i < Math.max(bundleBefore.length, bundleNow.length); i += 1) if (bundleBefore[i] !== bundleNow[i]) bundleChanged.push(i + 1);
check('D2', 'the bundle diff against the recorded before/ copy is only the two call-site lines',
    bundleChanged.length === 2 && bundleBefore.length === bundleNow.length,
    'changed lines=' + JSON.stringify(bundleChanged) + ' lineCount ' + bundleBefore.length + ' -> ' + bundleNow.length);

const otherChanged = [];
if (map.sourcesContent.length !== beforeMap.sourcesContent.length) otherChanged.push('sourcesContent length');
for (let i = 0; i < map.sourcesContent.length; i += 1) {
    if (i === 2) continue;
    if (map.sourcesContent[i] !== beforeMap.sourcesContent[i]) otherChanged.push('sourcesContent[' + i + ']');
}
check('D3', 'no other artefact moved: exactly three files differ from the recorded before/ copies (panel, bundle, map)',
    otherChanged.length === 0 && panel !== before.panel && bundle !== before.bundle && mapRaw !== before.mapRaw,
    'other changed=' + JSON.stringify(otherChanged) + ' panel changed=' + (panel !== before.panel) + ' bundle changed=' + (bundle !== before.bundle) + ' map changed=' + (mapRaw !== before.mapRaw));

// ---- NEGATIVE CONTROL 1: the OLD order must fail the very same predicate
const oldOrder = orderProblems(before.panel, SOURCE_ANCHORS, 'source');
check('N1', 'negative control 1 — the before/ copy (old order) fails the source predicate: the probe has teeth',
    oldOrder.length > 0 && oldOrder.some((problem) => problem.includes('DependencyMap is not before AddMemberControl')),
    'problems=' + JSON.stringify(oldOrder));

// ---- NEGATIVE CONTROL 2: new source + OLD bundle must fail the sync predicate
rmSync(NEG2, { recursive: true, force: true });
mkdirSync(NEG2, { recursive: true });
writeFileSync(join(NEG2, 'ActivityPanel.js'), panel, 'utf8');
writeFileSync(join(NEG2, 'client.js'), before.bundle, 'utf8');
const neg2Sync = syncProblems(readFileSync(join(NEG2, 'ActivityPanel.js'), 'utf8'), readFileSync(join(NEG2, 'client.js'), 'utf8'), map, 'neg2');
check('N2', 'negative control 2 — a new source paired with the OLD bundle fails the sync predicate: the two halves cannot drift apart',
    neg2Sync.length > 0 && neg2Sync.some((problem) => problem.includes('the shipped bundle disagrees with its source')),
    'problems=' + JSON.stringify(neg2Sync));

check('M3', 'negative control 2b — the same mismatch is invisible to the source-only predicate (so N2 is not redundant)',
    orderProblems(readFileSync(join(NEG2, 'ActivityPanel.js'), 'utf8'), SOURCE_ANCHORS, 'neg2').length === 0
        && orderProblems(readFileSync(join(NEG2, 'client.js'), 'utf8'), BUNDLE_ANCHORS, 'neg2').length > 0,
    'source alone is green while the bundle is still old');

const syntax = [];
for (const file of [PANEL, BUNDLE]) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
        syntax.push({ file: file.slice(REPO_ROOT.length + 1), ok: true });
    } catch (error) {
        syntax.push({ file: file.slice(REPO_ROOT.length + 1), ok: false, detail: String(error.stderr ?? error.message).slice(0, 300) });
    }
}
// node --check refuses the .map extension, so the map is validated as what it is: JSON.
try {
    const parsed = JSON.parse(readFileSync(MAP, 'utf8'));
    syntax.push({ file: 'lib/client.js.map', ok: true, via: 'JSON.parse', sources: parsed.sources.length, mappings: parsed.mappings.length });
} catch (error) {
    syntax.push({ file: 'lib/client.js.map', ok: false, detail: String(error.message).slice(0, 300) });
}
check('C1', 'the two JavaScript artefacts pass node --check and the sourcemap parses as JSON (a moved call must stay valid JavaScript and valid JSON)',
    syntax.every((entry) => entry.ok === true),
    JSON.stringify(syntax));

console.log('');
console.log('# panel sha256 ' + sha256(panel) + ' / ' + Buffer.byteLength(panel) + ' B');
console.log('# bundle sha256 ' + sha256(bundle) + ' / ' + Buffer.byteLength(bundle) + ' B');
console.log('# map    sha256 ' + sha256(mapRaw) + ' / ' + Buffer.byteLength(mapRaw) + ' B');
console.log('# ' + (results.length - failures) + '/' + results.length + ' passed, ' + failures + ' failed');
process.exit(failures === 0 ? 0 : 1);