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
 * V20-F1 (t134): M2 used to assert "mappings are untouched", which held only while nobody
 * regenerated the bundle. The shipped map had been produced from sourcesContent[2] as it stood
 * BEFORE the two call sites moved, so with the SAME 404 958 bytes and the SAME sources it
 * pointed 2 columns (DependencyMap) and 148 columns (AddMemberControl) away from the code it
 * claimed to describe. A byte count or a sha256 cannot see that; decoding the base64 VLQ
 * segments can. M4 and N3 below do exactly that.
 *
 * Run from the repo root: node tests/t128-panel-order.mjs
 */
import { cpSync, readFileSync, writeFileSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
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

// ---------------------------------------------------------------- V20-F1: base64 VLQ decoding
// The map is JSON, but its meaning lives in "mappings": ';' separates generated lines, ','
// separates segments, and each segment is a run of base64 VLQ deltas (generated column, source
// index, source line, source column [, name index]) relative to the previous segment. Neither a
// byte count nor a sha256 of the map can tell a stale map from a regenerated one: t134 measured
// the SAME 404 958 B and the SAME sourcesContent with segments 2 and 148 columns off.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** One VLQ segment -> the array of signed deltas it encodes. */
function vlqFields(segment) {
    const out = [];
    let value = 0;
    let shift = 0;
    for (const ch of segment) {
        const digit = B64.indexOf(ch);
        if (digit < 0) throw new Error('bad base64 VLQ character ' + JSON.stringify(ch));
        value += (digit & 31) << shift;
        if ((digit & 32) !== 0) {
            shift += 5;
            continue;
        }
        const negative = (value & 1) === 1;
        const magnitude = value >>> 1;
        out.push(negative ? -magnitude : magnitude);
        value = 0;
        shift = 0;
    }
    return out;
}

/** The whole mappings string -> one array of absolute segments per generated line. */
function decodeMappings(mappings) {
    if (typeof mappings !== 'string') throw new Error('mappings is not a string');
    const decoded = [];
    let srcIdx = 0;
    let srcLine = 0;
    let srcCol = 0;
    let nameIdx = 0;
    for (const group of mappings.split(';')) {
        const segments = [];
        let genCol = 0;
        if (group.length > 0) {
            for (const raw of group.split(',')) {
                if (raw.length === 0) continue;
                const fields = vlqFields(raw);
                genCol += fields[0];
                if (fields.length >= 4) {
                    srcIdx += fields[1];
                    srcLine += fields[2];
                    srcCol += fields[3];
                    if (fields.length >= 5) nameIdx += fields[4];
                    segments.push({ genCol, srcIdx, srcLine, srcCol, nameIdx });
                } else {
                    segments.push({ genCol, srcIdx: -1, srcLine: -1, srcCol: -1, nameIdx: -1 });
                }
            }
        }
        decoded.push(segments);
    }
    return decoded;
}

// A literal newline cannot appear inside this file's string constants without confusing the
// reader, so it is spelled once here.
const NEWLINE = String.fromCharCode(10);

/** Offset inside a text -> 1-based line and 0-based column (the units a sourcemap uses). */
function posOf(text, offset) {
    const before = text.slice(0, offset);
    const line = before.split(NEWLINE).length;
    const column = offset - (before.lastIndexOf(NEWLINE) + 1);
    return { line, column };
}

/** The segment that governs a generated position: the last one at or before that column. */
function originAt(decoded, line1, column) {
    const segments = decoded[line1 - 1] ?? [];
    let found = null;
    for (const seg of segments) if (seg.genCol <= column && seg.srcIdx !== -1) found = seg;
    return found;
}

/** Where does the map say the identifier at this bundle anchor came from? */
function mappingProbe(decoded, bundleText, sourceLines, anchor) {
    const callAt = bundleText.indexOf(anchor.call);
    if (callAt < 0) return { name: anchor.name, ok: false, reason: 'bundle call anchor missing' };
    const at = bundleText.indexOf(anchor.ident, callAt);
    if (at < 0) return { name: anchor.name, ok: false, reason: 'bundle identifier missing' };
    const pos = posOf(bundleText, at);
    const origin = originAt(decoded, pos.line, pos.column);
    if (origin === null) return { name: anchor.name, bundleLine: pos.line, bundleColumn: pos.column, ok: false, reason: 'no segment covers this position' };
    const lineText = sourceLines[origin.srcLine] ?? '';
    const identAtOrigin = lineText.slice(origin.srcCol, origin.srcCol + anchor.ident.length);
    return {
        name: anchor.name,
        bundleLine: pos.line,
        bundleColumn: pos.column,
        sourceLine: origin.srcLine + 1,
        sourceColumn: origin.srcCol,
        identAtOrigin,
        ok: identAtOrigin === anchor.ident,
    };
}

const MAPPING_ANCHORS = [
    { name: 'DependencyMap', call: '(0, import_jsx_runtime5.jsx)(DependencyMap, {', ident: 'DependencyMap' },
    { name: 'AddMemberControl', call: '(0, import_jsx_runtime5.jsx)(AddMemberControl, {', ident: 'AddMemberControl' },
    { name: 'orderDelegationMembers', call: 'orderDelegationMembers(team.members', ident: 'orderDelegationMembers' },
];

const describeProbe = (probe) => probe.name + ' bundle=' + probe.bundleLine + ':' + probe.bundleColumn
    + ' -> source=' + (probe.sourceLine ?? '?') + ':' + (probe.sourceColumn ?? '?')
    + ' identAtOrigin=' + JSON.stringify(probe.identAtOrigin ?? probe.reason ?? '') + ' ok=' + probe.ok;

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

// V20-F1 (t134): the mappings MUST be regenerated whenever sourcesContent[2] changes. The old
// invariant ("mappings untouched") blessed a map whose sourcesContent said the new code while every
// segment still pointed at columns of the old code — inside the same 404 958 bytes.
check('M2', 'V20-F1: the mappings belong to the CURRENT source, so they differ from the recorded before/ map (equal mappings after a source edit would mean a stale map)',
    map.mappings !== beforeMap.mappings && typeof map.mappings === 'string' && map.mappings.length === beforeMap.mappings.length
        && JSON.stringify(map.names) === JSON.stringify(beforeMap.names) && map.version === beforeMap.version
        && JSON.stringify(map.sources) === JSON.stringify(beforeMap.sources),
    'mappingsDiffer=' + (map.mappings !== beforeMap.mappings) + ' mappingsLen now=' + map.mappings.length + ' before=' + beforeMap.mappings.length
        + ' mappingsSha now=' + sha256(map.mappings).slice(0, 16) + ' before=' + sha256(beforeMap.mappings).slice(0, 16)
        + ' namesSame=' + (JSON.stringify(map.names) === JSON.stringify(beforeMap.names)) + ' version=' + map.version);

// ---------------------------------------------------------------- V20-F1 decoded columns
const decodedNow = decodeMappings(map.mappings);
const decodedBefore = decodeMappings(beforeMap.mappings);
const sourceLines = panel.split(NEWLINE);
const probesNow = MAPPING_ANCHORS.map((anchor) => mappingProbe(decodedNow, bundle, sourceLines, anchor));
const probesBefore = MAPPING_ANCHORS.map((anchor) => mappingProbe(decodedBefore, bundle, sourceLines, anchor));
for (const probe of probesNow) console.log('# mapping (shipped): ' + describeProbe(probe));
for (const probe of probesBefore) console.log('# mapping (before/): ' + describeProbe(probe));

check('M4', 'V20-F1: decoding the SHIPPED mappings lands exactly on the identifier it describes (DependencyMap 1919:2595 -> 392:177, AddMemberControl 1919:2744 -> 392:327, orderDelegationMembers 1920:27 -> 393:55)',
    probesNow.length === MAPPING_ANCHORS.length && probesNow.every((probe) => probe.ok === true) && decodedNow.length > 3000,
    probesNow.map(describeProbe).join(' | ') + ' | decodedLines=' + decodedNow.length);

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

// ---- NEGATIVE CONTROL 3 (V20-F1): the SAME decoder on the OLD map must land on the wrong column.
// This is the case that proves M4 has teeth: the before/ map is byte-for-byte the same LENGTH as the
// shipped one and carries the same sourcesContent, so every check that compares bytes or hashes is
// green on it. Only the decoded columns show that it describes code that has moved.
check('N3', 'V20-F1 negative control — decoding the before/ map lands on the WRONG column for both moved call sites (392:179, inside "pendencyMap"), and the two maps have the same byte length so a byte comparison cannot tell them apart',
    probesBefore.filter((probe) => probe.ok === false).length === 2
        && probesBefore.filter((probe) => probe.sourceColumn === 179).length === 2
        && probesBefore.filter((probe) => probe.sourceColumn === 179).every((probe) => probe.sourceLine === 392)
        && Buffer.byteLength(before.mapRaw) === Buffer.byteLength(mapRaw),
    probesBefore.map(describeProbe).join(' | ') + ' | map bytes ' + Buffer.byteLength(before.mapRaw) + ' vs ' + Buffer.byteLength(mapRaw));

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

// --------------------------------------------------- V21-F3: is the shipped map a BUILD product?
// The decoded columns of M4 are only evidence if lib/client.js.map really comes out of build/build.mjs.
// So the build is run here on a COPY of the package, started from the repo root: the copy's bundle and map
// must be byte-identical to the shipped ones. A hand-edited map, or one left over from an older source,
// cannot survive this -- it is the only case that ties the mappings to the pipeline that is meant to make
// them. lib/** is never written: the copy lives under tests/tmp/t128/build-copy.
// Which gates see the stale map 1f1d1552...? M2 and M4 here (decoded columns), tests/t129-pins.mjs (byte
// pin), packages/dsh-agent-teams/tests/t130-pack.mjs A2 and tests/t135-pack.mjs A2 (frozen table diff).
// A byte COUNT and a sha256 of the whole file cannot: the two maps are the same 404 958 bytes.
const BUILD_COPY = join(REPO_ROOT, 'tests', 'tmp', 't128', 'build-copy');

function buildOnCopy() {
    const report = { copy: BUILD_COPY.slice(REPO_ROOT.length + 1), cwd: '<repo root> (not the package)', ok: false };
    rmSync(BUILD_COPY, { recursive: true, force: true });
    mkdirSync(join(BUILD_COPY, 'build'), { recursive: true });
    cpSync(join(PKG, 'package.json'), join(BUILD_COPY, 'package.json'));
    for (const name of ['build.mjs', 'css-module-plugin.mjs']) cpSync(join(PKG, 'build', name), join(BUILD_COPY, 'build', name));
    cpSync(join(PKG, 'lib', 'client'), join(BUILD_COPY, 'lib', 'client'), { recursive: true });
    try {
        symlinkSync(join(PKG, 'node_modules'), join(BUILD_COPY, 'node_modules'), 'junction');
    } catch (error) {
        report.reason = 'could not link node_modules (esbuild): ' + String(error.message);
        return report;
    }
    try {
        execFileSync(process.execPath, [join(BUILD_COPY, 'build', 'build.mjs')], { cwd: REPO_ROOT, stdio: 'pipe', timeout: 240000 });
    } catch (error) {
        report.reason = 'build failed: ' + String(error.stderr ?? error.message).slice(0, 400);
        return report;
    }
    const builtBundle = readFileSync(join(BUILD_COPY, 'lib', 'client.js'), 'utf8');
    const builtMapRaw = readFileSync(join(BUILD_COPY, 'lib', 'client.js.map'), 'utf8');
    report.bundleSha = sha256(builtBundle).slice(0, 16) + '/' + Buffer.byteLength(builtBundle);
    report.mapSha = sha256(builtMapRaw).slice(0, 16) + '/' + Buffer.byteLength(builtMapRaw);
    report.bundleMatches = builtBundle === bundle;
    report.mapMatches = builtMapRaw === mapRaw;
    report.ok = report.bundleMatches === true && report.mapMatches === true;
    return report;
}

const buildReport = buildOnCopy();
check('B3', 'V21-F3: build/build.mjs run on a COPY from the repo root reproduces the shipped bundle AND the shipped map byte for byte, so the mappings M4 decodes are a build product rather than an artefact carried forward by hand',
    buildReport.ok === true,
    JSON.stringify(buildReport));

console.log('');
console.log('# panel sha256 ' + sha256(panel) + ' / ' + Buffer.byteLength(panel) + ' B');
console.log('# bundle sha256 ' + sha256(bundle) + ' / ' + Buffer.byteLength(bundle) + ' B');
console.log('# map    sha256 ' + sha256(mapRaw) + ' / ' + Buffer.byteLength(mapRaw) + ' B');
console.log('# map    mappings sha256 ' + sha256(map.mappings) + ' / ' + map.mappings.length + ' chars / ' + decodedNow.length + ' generated lines');
console.log('# ' + (results.length - failures) + '/' + results.length + ' passed, ' + failures + ' failed');
process.exit(failures === 0 ? 0 : 1);