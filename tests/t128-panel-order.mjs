// t128 (rewritten for t142) — the Agent Teams panel is three blocks:
//   LEFT  : the delegation cell (captain + progress + add-member + Members toggle + member list)
//   RIGHT : the task dependency map, as a DIRECT child of section.team so it becomes its own column
//   FULL  : the header and the workspace summary span both columns
// t139 nested both halves inside ONE div.panelColumns (1fr/1fr) inside a flex-column section, which is
// exactly what the user rejected: the DAG got ~210px. The assertions below are structural (rendered
// tree, source text, stylesheet, sourcemap) and every one of them ships with an in-memory negative
// control that puts the dependency map BACK inside a column wrapper and expects RED.
//
// Run: node tests/t128-panel-order.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..');
const PKG = path.join(REPO_ROOT, 'packages', 'dsh-agent-teams');
const PANEL = path.join(PKG, 'lib', 'client', 'ActivityPanel.js');
const PANEL_CSS = path.join(PKG, 'lib', 'client', 'ActivityPanel.module.css');
const WA_CSS = path.join(PKG, 'lib', 'client', 'WorkspaceActivity.module.css');
const BUNDLE = path.join(PKG, 'lib', 'client.js');
const MAP = path.join(PKG, 'lib', 'client.js.map');
const T10 = path.join(REPO_ROOT, 'tests', 't10-ui-bundle-smoke.mjs');
const T59 = path.join(REPO_ROOT, 'tests', 't59-erp-live-copy.mjs');
const TMP = path.join(REPO_ROOT, 'tests', 'tmp', 't142');
const BUILD_COPY = path.join(TMP, 'build-copy');
const NEWLINE = String.fromCharCode(10);

let failures = 0;
const results = [];
function check(id, title, ok, evidence) {
    results.push({ id, ok });
    if (!ok) failures += 1;
    console.log((ok ? 'PASS ' : 'FAIL ') + id + ' — ' + title);
    if (evidence !== undefined) console.log('      evidence: ' + evidence);
}
const hits = (text, needle) => text.split(needle).length - 1;

const panel = fs.readFileSync(PANEL, 'utf8');
const css = fs.readFileSync(PANEL_CSS, 'utf8');
const waCss = fs.readFileSync(WA_CSS, 'utf8');
const bundle = fs.readFileSync(BUNDLE, 'utf8');
const mapJson = JSON.parse(fs.readFileSync(MAP, 'utf8'));

// ------------------------------------------------------------------ static markup -> shallow tree
const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'param', 'track', 'wbr']);
function parseTree(html) {
    const root = { tag: '#root', attrs: '', children: [], parent: null };
    const stack = [root];
    let match;
    TAG_RE.lastIndex = 0;
    while ((match = TAG_RE.exec(html)) !== null) {
        const [, closing, tag, attrs, selfClose] = match;
        if (closing === '/') {
            if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop();
            continue;
        }
        const node = { tag, attrs, children: [], parent: stack[stack.length - 1] };
        stack[stack.length - 1].children.push(node);
        if (selfClose !== '/' && !VOID_TAGS.has(tag)) stack.push(node);
    }
    return root;
}
function walk(node, visit) { visit(node); for (const child of node.children) walk(child, visit); }
function findAll(root, pred) { const found = []; walk(root, (node) => { if (pred(node)) found.push(node); }); return found; }
const hasAttr = (node, name) => new RegExp('\\s' + name + '(=|\\s|$)').test(node.attrs);
const attrValue = (node, name) => { const found = node.attrs.match(new RegExp('\\s' + name + '="([^"]*)"')); return found === null ? undefined : found[1]; };
const elements = (node) => node.children.filter((child) => child.tag !== '#text');
const classOf = (node) => (attrValue(node, 'class') || '').split(' ').filter((name) => name !== '');
const label = (node) => node.tag + (classOf(node).length > 0 ? '.' + classOf(node)[0] : '') + (hasAttr(node, 'data-dependency-map') ? '[DEP]' : '') + (hasAttr(node, 'data-delegation-map') ? '[LEFT]' : '');
function chainOf(node) { const chain = []; let cur = node; while (cur !== null && cur.tag !== '#root') { chain.unshift(label(cur)); cur = cur.parent; } return chain; }


// ---------------------------------------------------------------- base64 VLQ decoding (V20-F1)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function vlqFields(segment) {
    const out = [];
    let value = 0;
    let shift = 0;
    for (const ch of segment) {
        const digit = B64.indexOf(ch);
        if (digit < 0) throw new Error('bad base64 VLQ character ' + JSON.stringify(ch));
        value += (digit & 31) << shift;
        if ((digit & 32) !== 0) { shift += 5; continue; }
        const negative = (value & 1) === 1;
        const magnitude = value >>> 1;
        out.push(negative ? -magnitude : magnitude);
        value = 0;
        shift = 0;
    }
    return out;
}

function decodeMappings(mappings) {
    const decoded = [];
    let srcIdx = 0; let srcLine = 0; let srcCol = 0;
    for (const group of mappings.split(';')) {
        const segments = [];
        let genCol = 0;
        if (group.length > 0) {
            for (const raw of group.split(',')) {
                if (raw.length === 0) continue;
                const fields = vlqFields(raw);
                genCol += fields[0];
                if (fields.length >= 4) {
                    srcIdx += fields[1]; srcLine += fields[2]; srcCol += fields[3];
                    segments.push({ genCol, srcIdx, srcLine, srcCol });
                } else {
                    segments.push({ genCol, srcIdx: -1, srcLine: -1, srcCol: -1 });
                }
            }
        }
        decoded.push(segments);
    }
    return decoded;
}
const posOf = (text, offset) => {
    const before = text.slice(0, offset);
    return { line: before.split(NEWLINE).length, column: offset - (before.lastIndexOf(NEWLINE) + 1) };
};
function originAt(decoded, line1, column) {
    const segments = decoded[line1 - 1] || [];
    let found = null;
    for (const seg of segments) if (seg.genCol <= column && seg.srcIdx !== -1) found = seg;
    return found;
}

function mappingProbe(decoded, bundleText, mapValue, anchor) {
    const at = bundleText.indexOf(anchor.needle);
    if (at < 0) return { name: anchor.name, ok: false, reason: 'bundle needle missing: ' + JSON.stringify(anchor.needle) };
    const pos = posOf(bundleText, at);
    const origin = originAt(decoded, pos.line, pos.column);
    if (origin === null) return { name: anchor.name, bundleLine: pos.line, bundleColumn: pos.column, ok: false, reason: 'no segment covers this position' };
    const sourceContent = mapValue.sourcesContent[origin.srcIdx] || '';
    const lineText = sourceContent.split(NEWLINE)[origin.srcLine] || '';
    const snippet = lineText.slice(origin.srcCol, origin.srcCol + anchor.expect.length);
    // lead = how far the covering segment starts BEFORE the probed column. t145 needs it: two
    // segments can cover one needle, and only the one that starts at the needle is the claim.
    const lead = pos.column - origin.genCol;
    const withinLead = anchor.maxLead === undefined || lead <= anchor.maxLead;
    return {
        name: anchor.name,
        bundleLine: pos.line,
        bundleColumn: pos.column,
        segmentGenCol: origin.genCol,
        lead,
        source: mapValue.sources[origin.srcIdx],
        sourceLine: origin.srcLine + 1,
        sourceColumn: origin.srcCol,
        snippet,
        ok: snippet === anchor.expect && snippet !== '' && withinLead,
    };
}
const describeProbe = (probe) => probe.ok
    ? probe.name + ' bundle=' + probe.bundleLine + ':' + probe.bundleColumn + ' -> ' + probe.source + ':' + probe.sourceLine + ':' + probe.sourceColumn
    : probe.name + ' bundle=' + probe.bundleLine + ':' + probe.bundleColumn + ' -> ' + (probe.source || '?') + ':' + probe.sourceLine + ':' + probe.sourceColumn + ' snippet=' + JSON.stringify(probe.snippet || '') + (probe.lead === undefined ? '' : ' segmentStartsAt=' + probe.segmentGenCol + ' lead=' + probe.lead) + (probe.reason ? ' (' + probe.reason + ')' : '');

/** The declaration body of the FIRST flat rule whose selector list contains this selector verbatim. */
function ruleFor(cssText, selector) {
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = rule.exec(cssText)) !== null) {
        const selectorList = match[1].split(',').map((part) => part.trim());
        if (selectorList.includes(selector)) return match[2];
    }
    return '';
}


// ---------------------------------------------------------------- the panel SOURCE shape
const SOURCE_ANCHORS = [
    ['the section.team wrapper', 'className: css.team,'],
    ['the LEFT delegation cell', 'css.delegationSection'],
    ['ProgressOverview', '_jsx(ProgressOverview, {'],
    ['the member block', 'css.panelColumnMain'],
    ['AddMemberControl', '_jsx(AddMemberControl, {'],
    ['the member list (orderDelegationMembers)', 'orderDelegationMembers(team.members, team.tasks)'],
    ['DependencyMap', '_jsx(DependencyMap, {'],
    ['WorkspaceSummary', 'workspace && _jsx(WorkspaceSummary'],
];
function sourceOrderProblems(text, anchors = SOURCE_ANCHORS) {
    const problems = [];
    const seen = [];
    for (const [name, needle] of anchors) {
        const count = hits(text, needle);
        if (count !== 1) problems.push(name + ': ' + JSON.stringify(needle) + ' occurs ' + count + 'x, expected exactly 1');
        seen.push({ name, index: text.indexOf(needle) });
    }
    for (let i = 1; i < seen.length; i += 1) {
        const prev = seen[i - 1];
        const cur = seen[i];
        if (prev.index === -1 || cur.index === -1) continue;
        if (!(prev.index < cur.index)) problems.push(prev.name + ' @' + prev.index + ' must precede ' + cur.name + ' @' + cur.index);
    }
    return problems;
}

/** The dependency map must be a SIBLING of the left cell and of the workspace summary.
 * A column wrapper (the rejected t139 shape) closes the element list and opens a div instead. */
function dependencySiblingProblems(text) {
    const problems = [];
    const marker = '_jsx(DependencyMap, {';
    const at = text.indexOf(marker);
    if (at < 0) return ['the panel source has no DependencyMap call'];
    const before = text.slice(Math.max(0, at - 48), at);
    const after = text.slice(at);
    if (!before.trimEnd().endsWith('] }),')) problems.push('DependencyMap is not preceded by the close of the left cell: ' + JSON.stringify(before));
    if (after.indexOf('}), workspace && _jsx(WorkspaceSummary') < 0) problems.push('DependencyMap is not followed directly by the workspace summary in the same children array');
    if (text.indexOf('css.panelColumnAside') >= 0) problems.push('the panel still wraps a cell in css.panelColumnAside');
    if (text.indexOf('css.panelColumns') >= 0) problems.push('the panel still nests both halves in css.panelColumns');
    return problems;
}
function wrapDependencyAgain(text) {
    const marker = '_jsx(DependencyMap, {';
    const at = text.indexOf(marker);
    if (at < 0) return text;
    const closeAfter = text.indexOf('}), workspace &&', at);
    if (closeAfter < 0) return text;
    const inner = text.slice(at, closeAfter);
    return text.slice(0, at) + '_jsx("div", { className: css.panelColumnAside, children: ' + inner + ' })' + text.slice(closeAfter);
}
const sourceOrder = sourceOrderProblems(panel);
check('P1', 'the panel source is three blocks: section.team -> LEFT delegation cell (progress, member block: AddMemberControl then Members toggle + list) -> DependencyMap -> WorkspaceSummary',
    sourceOrder.length === 0,
    sourceOrder.length === 0
        ? SOURCE_ANCHORS.map(([, needle]) => needle + '@' + panel.indexOf(needle)).join(' < ')
        : sourceOrder.join('; '));
const siblingProblems = dependencySiblingProblems(panel);
check('P2', 'DependencyMap is a DIRECT child of section.team — no column div wraps it, and the workspace summary follows it in the same children array',
    siblingProblems.length === 0, siblingProblems.join('; ') || 'sibling of the left cell and of the workspace summary');
const wrappedText = wrapDependencyAgain(panel);
const wrappedProblems = dependencySiblingProblems(wrappedText);
check('P3', 'negative control — putting DependencyMap back inside a column wrapper fails the SAME predicate (the structural assertion has teeth)',
    wrappedText !== panel && wrappedProblems.length > 0 && hits(wrappedText, 'css.panelColumnAside') === 1,
    'applies=' + (wrappedText !== panel) + ' delta=' + (Buffer.byteLength(wrappedText) - Buffer.byteLength(panel)) + ' B problems=' + JSON.stringify(wrappedProblems));

// ---------------------------------------------------------------- the shipped bundle carries the same shape
const BUNDLE_ANCHORS = [
    ['AddMemberControl', 'AddMemberControl, {'],
    ['the member list', 'orderDelegationMembers(team.members, team.tasks)'],
    ['DependencyMap', 'DependencyMap, { tasks'],
];
const bundleOrder = sourceOrderProblems(bundle, BUNDLE_ANCHORS);
check('B1', 'the shipped bundle lib/client.js (what the Host really loads) keeps the member column before the dependency column, each call site exactly once',
    bundleOrder.length === 0 && hits(bundle, 'panelColumnAside') === 0,
    (bundleOrder.join('; ') || BUNDLE_ANCHORS.map(([, needle]) => needle + '@' + bundle.indexOf(needle)).join(' < ')) + ' panelColumnAside=' + hits(bundle, 'panelColumnAside'));
const flatBundle = bundle.split('DependencyMap, { tasks').join('DependencyMap, {');
const flatProblems = sourceOrderProblems(flatBundle, BUNDLE_ANCHORS);
check('B2', 'negative control — mangling the dependency call site in the bundle text makes B1 red while the source stays green',
    flatProblems.length > 0,
    'applies=true delta=' + (Buffer.byteLength(flatBundle) - Buffer.byteLength(bundle)) + ' B problems=' + JSON.stringify(flatProblems));


// ---------------------------------------------------------------- render the SHIPPED panel and read the tree
const SSR_INPUT = path.join(TMP, 'ssr-entry.js');
const SSR_OUT = path.join(TMP, 'ssr-bundle.cjs');
const CSS_STUB = 'export default new Proxy({}, { get: (_t, name) => "css-" + String(name) })';
const PRIMITIVES_STUB = 'export const Menu = () => null; export const Modal = () => null; export const Tooltip = () => null; export const Button = () => null; export default new Proxy({}, { get: () => () => null });';
function ssrEntrySource() {
    return [
        "import { jsx } from 'react/jsx-runtime';",
        "import { renderToStaticMarkup } from 'react-dom/server';",
        "import { TeamSection } from './lib/client/ActivityPanel.js';",
        "const t = (key, values) => {",
        "    let out = String(key);",
        "    if (values && typeof values === 'object') for (const [k, v] of Object.entries(values)) out = out.split('{' + k + '}').join(String(v));",
        "    return out;",
        "};",
        "const team = {",
        "    teamId: 'team-1', captainSessionId: 'session-1',",
        "    members: [{ id: 'child-1', name: 'Ana', role: 'dev', status: 'running', activity: 'idle', provider: 'p1', model: 'm1', reasoningEffort: '', nextRoute: 'p1/m1', routeOrigin: 'declared' }],",
        "    tasks: [",
        "        { id: 't1', subject: 'First task', status: 'running', state: 'running', assignee: 'Ana', dependencies: [], attempt: 1 },",
        "        { id: 't2', subject: 'Second', status: 'blocked', state: 'blocked', assignee: 'Ana', dependencies: ['t1'], attempt: 1 },",
        "    ],",
        "    profile: { name: 'captain' },",
        "    stats: { completed: 1, members: 1, messages: 0 },",
        "    captainInbox: [],",
        "    removedMembers: [],",
        "    messages: [],",
        "};",
        "const html = renderToStaticMarkup(jsx(TeamSection, { team: team, modelDirectory: undefined, onContinuePlanning: () => {}, onDiscarded: () => {}, onNavigate: () => {}, t: t, historic: false, workspace: true }));",
        "process.stdout.write(html);",
    ].join(NEWLINE);
}
async function renderPanel() {
    fs.mkdirSync(TMP, { recursive: true });
    fs.writeFileSync(SSR_INPUT, ssrEntrySource(), 'utf8');
    const requireFromPkg = createRequire(path.join(PKG, 'package.json'));
    const esbuild = requireFromPkg('esbuild');
    const plugin = {
        name: 't142-stubs',
        setup(build) {
            build.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'css-stub', namespace: 't142-css' }));
            build.onLoad({ filter: /.*/, namespace: 't142-css' }, () => ({ contents: CSS_STUB, loader: 'js' }));
            build.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitives-stub', namespace: 't142-prim' }));
            build.onLoad({ filter: /.*/, namespace: 't142-prim' }, () => ({ contents: PRIMITIVES_STUB, loader: 'js' }));
        },
    };
    const built = await esbuild.build({
        stdin: { contents: fs.readFileSync(SSR_INPUT, 'utf8'), resolveDir: PKG, loader: 'js', sourcefile: 't142-ssr-entry.js' },
        bundle: true, write: false, format: 'cjs', platform: 'node', target: 'node20', logLevel: 'silent', plugins: [plugin],
    });
    built.outputFiles.forEach((file) => fs.writeFileSync(SSR_OUT, file.text));
    return execFileSync(process.execPath, [SSR_OUT], { stdio: 'pipe', timeout: 180000 }).toString('utf8');
}
/** Everything the three-block layout promises about the RENDERED tree, as problems. */
function treeProblems(html) {
    const problems = [];
    const tree = parseTree(html);
    const teams = findAll(tree, (node) => node.tag === 'section' && hasAttr(node, 'data-workspace-team'));
    if (teams.length !== 1) { problems.push('expected exactly 1 section[data-workspace-team], found ' + teams.length); return problems; }
    const team = teams[0];
    const kids = elements(team);
    if (kids.length === 0 || kids[0].tag !== 'header') problems.push('the first direct child of section.team is ' + (kids[0] ? label(kids[0]) : 'nothing') + ', expected the header');
    const lefts = kids.filter((node) => hasAttr(node, 'data-delegation-map'));
    const deps = kids.filter((node) => hasAttr(node, 'data-dependency-map'));
    if (lefts.length !== 1) problems.push('expected the LEFT delegation cell as a DIRECT child of section.team, found ' + lefts.length);
    if (deps.length !== 1) problems.push('expected the DependencyMap as a DIRECT child of section.team, found ' + deps.length);
    if (lefts.length === 1 && deps.length === 1 && !(kids.indexOf(lefts[0]) < kids.indexOf(deps[0]))) {
        problems.push('the deployment cell @' + kids.indexOf(lefts[0]) + ' must precede the dependency map @' + kids.indexOf(deps[0]));
    }
    const summaries = kids.filter((node) => classOf(node).some((name) => name.indexOf('workspaceSummary') >= 0));
    if (summaries.length !== 1) problems.push('expected the workspace summary as a DIRECT child of section.team, found ' + summaries.length);
    if (summaries.length === 1 && deps.length === 1 && !(kids.indexOf(deps[0]) < kids.indexOf(summaries[0]))) {
        problems.push('the dependency map must precede the workspace summary');
    }
    if (lefts.length === 1) {
        const blocks = findAll(lefts[0], (node) => attrValue(node, 'data-panel-column') === 'member');
        if (blocks.length !== 1) problems.push('the member block is not inside the left cell, found ' + blocks.length);
        else {
            const blockKids = elements(blocks[0]);
            const first = blockKids[0];
            if (!first || !hasAttr(first, 'data-add-member')) problems.push('AddMemberControl is not the FIRST element of the member block (' + (first ? label(first) : 'empty') + ')');
            const toggleAt = html.indexOf('data-members-toggle');
            const addAt = html.indexOf('data-add-member');
            if (addAt < 0 || toggleAt < 0 || !(addAt < toggleAt)) problems.push('the Members toggle must come AFTER the add-member control (add=' + addAt + ' toggle=' + toggleAt + ')');
            const list = findAll(blocks[0], (node) => classOf(node).some((name) => name.indexOf('delegationTree') >= 0 || name.indexOf('membersList') >= 0));
            if (list.length === 0) problems.push('the member list is not inside the member block');
        }
        const progress = findAll(lefts[0], (node) => classOf(node).some((name) => name.indexOf('progressSummary') >= 0));
        if (progress.length === 0) problems.push('ProgressOverview is not inside the left cell');
    }
    if (deps.length === 1 && deps[0].parent !== team) problems.push('the dependency map is nested at ' + chainOf(deps[0]).join(' > '));
    return problems;
}
/** Negative control: put the dependency map BACK inside the member block (the rejected t139 shape). */
function matchingClose(html, start, tag) {
    const open = '<' + tag;
    const close = '</' + tag + '>';
    let depth = 1;
    let i = start + open.length;
    while (i < html.length) {
        const nextOpen = html.indexOf(open, i);
        const nextClose = html.indexOf(close, i);
        if (nextClose < 0) return html.length;
        if (nextOpen >= 0 && nextOpen < nextClose) { depth += 1; i = nextOpen + open.length; continue; }
        depth -= 1;
        if (depth === 0) return nextClose + close.length;
        i = nextClose + close.length;
    }
    return html.length;
}
function nestDependencyBack(html) {
    const start = html.indexOf('<section class="css-dependencySection"');
    if (start < 0) return html;
    const end = matchingClose(html, start, 'section');
    const block = html.slice(start, end);
    const without = html.slice(0, start) + html.slice(end);
    const anchor = without.indexOf('<div class="css-panelColumnMain"');
    if (anchor < 0) return html;
    const insertAt = without.indexOf('>', anchor) + 1;
    return without.slice(0, insertAt) + block + without.slice(insertAt);
}
let rendered = '';
let renderError = '';
try {
    rendered = await renderPanel();
} catch (error) {
    renderError = String(error.stderr || error.message).slice(0, 700);
}
if (rendered !== '') fs.writeFileSync(path.join(TMP, 'rendered.html'), rendered, 'utf8');
check('T0', 'react-dom/server renders TeamSection from the SHIPPED panel source without throwing', renderError === '' && rendered.length > 0,
    renderError === '' ? 'html ' + Buffer.byteLength(rendered) + ' B' : renderError);
const treeNow = renderError === '' ? treeProblems(rendered) : ['render failed'];
check('T1', 'the rendered tree is three blocks: header, then LEFT delegation cell and RIGHT dependency map as DIRECT children of section.team (left first), then the workspace summary',
    treeNow.length === 0, JSON.stringify(treeNow));
const nested = renderError === '' ? nestDependencyBack(rendered) : rendered;
const nestedProblems = renderError === '' ? treeProblems(nested) : ['render failed'];
check('T2', 'negative control — moving the dependency map back INSIDE the member block fails the SAME tree predicate (the rendered assertions have teeth)',
    nested !== rendered && nestedProblems.length > 0,
    'applies=' + (nested !== rendered) + ' delta=' + (nested.length - rendered.length) + ' B problems=' + JSON.stringify(nestedProblems));


// ---------------------------------------------------------------- the stylesheet must lay out 1 : 2
const GRID_HEADER = '@container (width>=800px){';
const TEAM_SELECTOR = '.aYQbCq_team[data-workspace-team]';
const DEP_CHILD_SELECTOR = '.aYQbCq_team[data-workspace-team]>.aYQbCq_dependencySection';
const REGEX_SPECIALS = '.*+?^$()[]{}|' + String.fromCharCode(92);
function escapeRegExp(text) {
    let out = '';
    for (const ch of text) out += REGEX_SPECIALS.indexOf(ch) >= 0 ? String.fromCharCode(92) + ch : ch;
    return out;
}
function blockAt(text, header) {
    const at = text.indexOf(header);
    if (at < 0) return '';
    let depth = 0;
    for (let i = at + header.length - 1; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(at + header.length, i);
        }
    }
    return '';
}
function ratioOf(body) {
    const match = body.match(/grid-template-columns:minmax\((\d+)(?:px)?,\s*([\d.]+)fr\)\s+minmax\((\d+)(?:px)?,\s*([\d.]+)fr\)/);
    if (match === null) return null;
    return { leftMin: Number(match[1]), leftFr: Number(match[2]), rightMin: Number(match[3]), rightFr: Number(match[4]) };
}
function gridBody(cssText) {
    const block = blockAt(cssText, GRID_HEADER);
    if (block === '') return '';
    const rule = block.match(new RegExp(escapeRegExp(TEAM_SELECTOR) + '\\{([^}]*)\\}'));
    return rule === null ? '' : rule[1];
}
function gridProblems(cssText) {
    const problems = [];
    const block = blockAt(cssText, GRID_HEADER);
    if (block === '') return ['the stylesheet has no ' + JSON.stringify(GRID_HEADER) + ' block, so the wide layout is never a grid'];
    const body = gridBody(cssText);
    if (body === '') return ['the wide-layout block does not size ' + TEAM_SELECTOR];
    if (!/display:\s*grid/.test(body)) problems.push('the wide layout is not a grid: ' + body);
    const ratio = ratioOf(body);
    if (ratio === null) problems.push('grid-template-columns is not two minmax() tracks: ' + body);
    else {
        if (ratio.leftMin < 260) problems.push('the member column can shrink to ' + ratio.leftMin + 'px, below the 260px floor');
        if (ratio.rightFr !== ratio.leftFr * 2) problems.push('the column ratio is ' + ratio.leftFr + ' : ' + ratio.rightFr + ', expected 1 : 2 (the dependency map gets two parts)');
    }
    if (!/gap:\s*16px/.test(body)) problems.push('the wide-layout gap is not 16px: ' + body);
    return problems;
}
const gridNow = gridProblems(css);
check('C1', 'the wide layout is a 1 : 2 grid — the member column keeps a 280px floor and the dependency map gets two parts (NOT the rejected 1 : 1)',
    gridNow.length === 0, gridNow.join('; ') || gridBody(css));
const halfRatioCss = css.replace('minmax(280px,1fr) minmax(0,2fr)', 'minmax(280px,1fr) minmax(0,1fr)');
const halfRatioProblems = gridProblems(halfRatioCss);
check('C2', 'negative control — putting the columns back to 1 : 1 (the rejected t139 split) fails the SAME stylesheet predicate',
    halfRatioCss !== css && halfRatioProblems.length > 0,
    'applies=' + (halfRatioCss !== css) + ' delta=' + (Buffer.byteLength(halfRatioCss) - Buffer.byteLength(css)) + ' B problems=' + JSON.stringify(halfRatioProblems));
function dependencyCssProblems(cssText) {
    const problems = [];
    const body = ruleFor(cssText, DEP_CHILD_SELECTOR);
    if (body === '') return ['the stylesheet has no rule for ' + DEP_CHILD_SELECTOR];
    if (!/max-height:\s*\d+vh/.test(body)) problems.push('the dependency column has no viewport max-height: ' + body);
    if (!/overflow-y:\s*auto/.test(body)) problems.push('the dependency column does not scroll internally: ' + body);
    return problems;
}
const dependencyCss = dependencyCssProblems(css);
check('C3', 'the dependency column caps its own height and scrolls internally, so a 138-task graph cannot push anything else around (and still stacks under 800px)',
    dependencyCss.length === 0, dependencyCss.join('; ') || ruleFor(css, DEP_CHILD_SELECTOR));
const noCapCss = css.replace('max-height:56vh;', '');
const noCapProblems = dependencyCssProblems(noCapCss);
check('C4', 'negative control — deleting the height cap from the dependency column rule makes C3 red',
    noCapCss !== css && noCapProblems.length > 0,
    'applies=' + (noCapCss !== css) + ' delta=' + (Buffer.byteLength(noCapCss) - Buffer.byteLength(css)) + ' B problems=' + JSON.stringify(noCapProblems));
function widthProblems(cssText) {
    const body = ruleFor(cssText, '.eDfHrq_content');
    if (body === '') return ['WorkspaceActivity.module.css has no .eDfHrq_content rule'];
    const problems = [];
    if (!/max-width:\s*none/.test(body)) problems.push('the workspace content still caps its width: ' + body);
    if (/max-width:\s*\d+px/.test(body)) problems.push('the workspace content still carries a pixel max-width: ' + body);
    return problems;
}
const widthNow = widthProblems(waCss);
check('C5', 'the workspace content no longer caps its width (.eDfHrq_content max-width:none), so the panel can use the whole column',
    widthNow.length === 0, widthNow.join('; ') || ruleFor(waCss, '.eDfHrq_content'));
const cappedCss = waCss.replace('max-width:none', 'max-width:1400px');
check('C6', 'negative control — restoring the 1400px cap makes C5 red',
    cappedCss !== waCss && widthProblems(cappedCss).length > 0,
    'applies=' + (cappedCss !== waCss) + ' delta=' + (Buffer.byteLength(cappedCss) - Buffer.byteLength(waCss)) + ' B problems=' + JSON.stringify(widthProblems(cappedCss)));


// ---------------------------------------------------------------- CSS NHÚNG vs CSS nguồn (V23-F1)
// Every stylesheet check above reads the FILE lib/client/ActivityPanel.module.css. The bundle the
// Host really loads carries a SECOND copy of that stylesheet, inlined as one long string. Until
// t145 nothing asserted anything about it: audit vòng 23 changed minmax(0,2fr) -> minmax(0,1fr)
// inside the embedded copy ONLY and this suite stayed green except for the rebuild/pin checks
// (B3/X1/X2) — i.e. the only thing that noticed was byte identity, not the layout claim. The two
// copies are compared as a DECLARATION (whitespace normalised), not as raw text, because that is
// the claim that matters: the column ratio the user sees, not the formatting of the file.
const EMBEDDED_DECL = 'grid-template-columns';
function gridDeclarationOf(cssText) {
    const body = gridBody(cssText);
    const match = body.match(new RegExp(EMBEDDED_DECL + '\\s*:\\s*([^;]+)'));
    return match === null ? '' : match[1].replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim();
}
/** The key path is printed with every problem: which of the two copies, and where in it. */
// GRID_HEADER ends with '{' for indexing purposes; strip it so the key path reads like CSS.
const EMBEDDED_KEY_PATH = 'bundle lib/client.js (inlined stylesheet) :: ' + GRID_HEADER.slice(0, -1) + ' > ' + TEAM_SELECTOR + ' > ' + EMBEDDED_DECL;
function embeddedCssProblems(bundleText, cssText) {
    const problems = [];
    if (blockAt(bundleText, GRID_HEADER) === '') {
        problems.push('the inlined stylesheet inside the bundle has no ' + JSON.stringify(GRID_HEADER) + ' block at all, so the shipped panel never becomes a grid');
    }
    const embedded = gridDeclarationOf(bundleText);
    const declared = gridDeclarationOf(cssText);
    if (declared === '') problems.push('lib/client/ActivityPanel.module.css declares no ' + EMBEDDED_DECL + ' for ' + TEAM_SELECTOR + ', so there is nothing to compare against');
    if (embedded === '') {
        problems.push(EMBEDDED_KEY_PATH + ': the inlined rule carries no ' + EMBEDDED_DECL + ' (the source file declares ' + JSON.stringify(declared) + ')');
    } else if (declared !== '' && embedded !== declared) {
        problems.push(EMBEDDED_KEY_PATH + ' = ' + JSON.stringify(embedded) + ' but lib/client/ActivityPanel.module.css declares ' + JSON.stringify(declared) + ' — the two copies of the stylesheet disagree, so the shipped panel is laid out by a ratio nobody reviewed');
    }
    return problems;
}
const embeddedNow = embeddedCssProblems(bundle, css);
check('C7', 'the stylesheet INLINED in the shipped bundle declares the SAME grid-template-columns for [data-workspace-team] as lib/client/ActivityPanel.module.css (semantic compare, whitespace-normalised)',
    embeddedNow.length === 0,
    embeddedNow.length === 0
        ? 'embedded=' + JSON.stringify(gridDeclarationOf(bundle)) + ' file=' + JSON.stringify(gridDeclarationOf(css))
        : embeddedNow.join('; '));
const embeddedLayout = gridProblems(bundle);
check('C8', 'the inlined copy keeps the 1 : 2 wide layout on its own (two minmax tracks, 280px floor, display:grid, 16px gap), so a stale inline copy cannot hide behind the file checks',
    embeddedLayout.length === 0, embeddedLayout.join('; ') || gridBody(bundle));

// A2 — two-way negative control, each on a COPY under tests/tmp/t145 (lib/** is never written).
// (a) ONLY the inlined copy changes; the .module.css file stays byte-identical.
const EMB_ONLY_COPY = path.join(REPO_ROOT, 'tests', 'tmp', 't145', 'embedded-only');
const CSS_ONLY_COPY = path.join(REPO_ROOT, 'tests', 'tmp', 't145', 'css-only');
fs.mkdirSync(EMB_ONLY_COPY, { recursive: true });
fs.mkdirSync(CSS_ONLY_COPY, { recursive: true });
const RATIO = 'minmax(280px,1fr) minmax(0,2fr)';
const HALF_RATIO = 'minmax(280px,1fr) minmax(0,1fr)';
// hits() over the whole bundle: the ratio must appear exactly once, otherwise the mutation below
// would edit an unintended copy and the control would prove nothing.
if (hits(bundle, RATIO) !== 1 || hits(css, RATIO) !== 1) {
    throw new Error('t128 C9/C10 expect exactly one ' + JSON.stringify(RATIO) + ' in the bundle and in the file; got ' + hits(bundle, RATIO) + ' and ' + hits(css, RATIO));
}
const embOnlyPath = path.join(EMB_ONLY_COPY, 'client.js');
const cssOnlyPath = path.join(CSS_ONLY_COPY, 'ActivityPanel.module.css');
fs.writeFileSync(embOnlyPath, bundle.replace(RATIO, HALF_RATIO));
fs.writeFileSync(cssOnlyPath, css.replace(RATIO, HALF_RATIO));
const embOnlyText = fs.readFileSync(embOnlyPath, 'utf8');
const cssOnlyText = fs.readFileSync(cssOnlyPath, 'utf8');
const embOnlyProblems = embeddedCssProblems(embOnlyText, css);
check('C9', 'negative control — changing ONLY the inlined copy (1 : 2 -> 1 : 1) makes C7 red while the .module.css file is byte-identical',
    embOnlyProblems.length > 0 && css === fs.readFileSync(PANEL_CSS, 'utf8'),
    'copy=' + embOnlyPath.slice(REPO_ROOT.length + 1) + ' applies=' + (embOnlyText !== bundle) + ' delta=' + (Buffer.byteLength(embOnlyText) - Buffer.byteLength(bundle)) + ' B problems=' + JSON.stringify(embOnlyProblems));
const cssOnlyProblems = embeddedCssProblems(bundle, cssOnlyText);
check('C10', 'negative control — changing ONLY lib/client/ActivityPanel.module.css makes C7 red too, so the comparison is two-way and neither copy is trusted by default',
    cssOnlyProblems.length > 0 && bundle === fs.readFileSync(BUNDLE, 'utf8'),
    'copy=' + cssOnlyPath.slice(REPO_ROOT.length + 1) + ' applies=' + (cssOnlyText !== css) + ' delta=' + (Buffer.byteLength(cssOnlyText) - Buffer.byteLength(css)) + ' B problems=' + JSON.stringify(cssOnlyProblems));

// ---------------------------------------------------------------- sourcemap truth (V20-F1)
const decoded = decodeMappings(mapJson.mappings);
const panelIdx = mapJson.sources.indexOf('../lib/client/ActivityPanel.js');
const depLine = panel.slice(0, panel.indexOf('_jsx(DependencyMap, {')).split(NEWLINE).length;
const leftLine = panel.slice(0, panel.indexOf('css.delegationSection')).split(NEWLINE).length;
check('M0', 'the map names ../lib/client/ActivityPanel.js and carries the panel byte for byte',
    panelIdx >= 0 && mapJson.sourcesContent[panelIdx] === panel,
    'sources[panel]=' + panelIdx + ' carried=' + (panelIdx >= 0 && mapJson.sourcesContent[panelIdx] === panel) + ' decodedLines=' + decoded.length);
const MAPPING_ANCHORS = [
    { name: 'DependencyMap call site', needle: 'DependencyMap, { tasks', expect: 'DependencyMap, { tasks', line: depLine },
    { name: 'the LEFT delegation cell', needle: '.delegationSection', expect: 'css.delegationSection', line: leftLine },
    { name: 'data-dependency-map', needle: '"data-dependency-map": true', expect: '"data-dependency-map": true' },
    // t145 (V23-F2): the needle above starts INSIDE the call (`DependencyMap, { tasks`), which is a
    // DIFFERENT segment from the one covering the `(` that opens the call. Audit vòng 23 shifted the
    // segment at the paren by one column and M1 stayed green, so that segment was never probed.
    // `maxLead` pins it: the covering segment must start within 6 columns of the paren, so a
    // segment that merely happens to overlap the position cannot satisfy this anchor.
    { name: 'the paren that opens the DependencyMap call', needle: '(DependencyMap, { tasks', expect: '_jsx(DependencyMap, { tasks', maxLead: 6 },
];
const probes = MAPPING_ANCHORS.map((anchor) => mappingProbe(decoded, bundle, mapJson, anchor));
for (const probe of probes) console.log('# mapping: ' + describeProbe(probe));
check('M1', 'decoding the SHIPPED mappings lands on the NEW dependency call site (ActivityPanel.js line ' + depLine + ') and on the left cell, so the map describes this layout instead of the old one',
    probes.every((probe) => probe.ok === true) && decoded.length > 3000
    && probes[0].sourceLine === depLine && probes[1].sourceLine === leftLine,
    probes.map(describeProbe).join(' | ') + ' | expected dependency line=' + depLine + ' left line=' + leftLine + ' decodedLines=' + decoded.length);
const mangledMap = JSON.parse(JSON.stringify(mapJson));
const mangledBefore = mangledMap.sourcesContent[panelIdx];
mangledMap.sourcesContent[panelIdx] = mangledBefore.split('css.delegationSection').join('css.delegationSectioz');
const mangledReds = MAPPING_ANCHORS.map((anchor) => mappingProbe(decoded, bundle, mangledMap, anchor)).filter((probe) => probe.ok === false);
check('M2', 'negative control — rewriting the source text the map RECORDS makes exactly the affected probe red, so M1 measures the mappings rather than a string match',
    mangledReds.length === 1 && mangledReds[0].name === 'the LEFT delegation cell' && mangledMap.sourcesContent[panelIdx].length === mangledBefore.length,
    'red=' + mangledReds.length + ' (' + mangledReds.map(describeProbe).join(' | ') + ') delta=' + (mangledMap.sourcesContent[panelIdx].length - mangledBefore.length) + ' B');
// t145 (V23-F2): the call-site paren has its own segment, so it needs its own assertion. Without
// M3 the anchor set only proves `DependencyMap, { tasks` resolves; shifting the segment that
// covers the `(` by one column left M1 green in audit vòng 23.
const parenProbe = probes[MAPPING_ANCHORS.length - 1];
check('M3', 'the mapping segment covering the paren that opens the DependencyMap call resolves to the source call itself (' + JSON.stringify(MAPPING_ANCHORS[MAPPING_ANCHORS.length - 1].expect) + '), not merely to the identifier inside it',
    parenProbe.ok === true && parenProbe.lead <= 6,
    describeProbe(parenProbe) + ' expect=' + JSON.stringify(parenProbe.snippet));
// Negative control: shift THAT segment one column inside a decoded COPY of the map (the shipped
// map file is never written). The old anchor must stay green — that is what proves the new anchor
// covers a segment the old anchor set never probed.
const callPos = posOf(bundle, bundle.indexOf('(DependencyMap, { tasks'));
const shiftedDecoded = decoded.map((segments) => segments.map((segment) => ({ ...segment })));
const callLineSegments = shiftedDecoded[callPos.line - 1];
let callSegmentIdx = -1;
for (let i = 0; i < callLineSegments.length; i += 1) if (callLineSegments[i].genCol <= callPos.column) callSegmentIdx = i;
const callSegmentBefore = callSegmentIdx >= 0 ? { ...callLineSegments[callSegmentIdx] } : null;
if (callSegmentIdx >= 0) callLineSegments[callSegmentIdx].srcCol += 1;
const shiftedParen = mappingProbe(shiftedDecoded, bundle, mapJson, MAPPING_ANCHORS[MAPPING_ANCHORS.length - 1]);
const shiftedInside = mappingProbe(shiftedDecoded, bundle, mapJson, MAPPING_ANCHORS[0]);
check('M4', 'negative control — shifting the paren segment one column makes M3 red while the old M1 anchor stays green (the new anchor covers a segment the old set never probed)',
    callSegmentBefore !== null && callSegmentBefore.srcCol + 1 === callLineSegments[callSegmentIdx].srcCol
    && shiftedParen.ok === false && shiftedInside.ok === true,
    'segment@' + (callSegmentBefore === null ? '?' : callSegmentBefore.genCol) + ' srcCol ' + (callSegmentBefore === null ? '?' : callSegmentBefore.srcCol) + '->' + (callSegmentIdx >= 0 ? callLineSegments[callSegmentIdx].srcCol : '?')
    + ' | paren(now)=' + describeProbe(shiftedParen) + ' | old M1(now)=' + describeProbe(shiftedInside));

// ---------------------------------------------------------------- syntax
const syntax = [];
for (const file of [PANEL, BUNDLE]) {
    try {
        execFileSync(process.execPath, ['--check', file], { stdio: 'pipe', timeout: 120000 });
        syntax.push({ file: path.basename(file), ok: true, via: 'node --check' });
    } catch (error) {
        syntax.push({ file: path.basename(file), ok: false, detail: String(error.stderr || error.message).slice(0, 300) });
    }
}
try {
    const parsed = JSON.parse(fs.readFileSync(MAP, 'utf8'));
    syntax.push({ file: 'lib/client.js.map', ok: true, via: 'JSON.parse', sources: parsed.sources.length, mappings: parsed.mappings.length });
} catch (error) {
    syntax.push({ file: 'lib/client.js.map', ok: false, detail: String(error.message).slice(0, 300) });
}
check('S1', 'the panel, the bundle and the map all parse (node --check twice, JSON.parse once)',
    syntax.every((entry) => entry.ok === true), JSON.stringify(syntax));

// ---------------------------------------------------------------- is the bundle a BUILD product?
const BUILD_ENTRIES = ['lib', 'build', 'package.json'];
async function buildOnCopy() {
    const report = { copy: BUILD_COPY.slice(REPO_ROOT.length + 1), ok: false };
    fs.rmSync(BUILD_COPY, { recursive: true, force: true });
    fs.mkdirSync(BUILD_COPY, { recursive: true });
    for (const entry of BUILD_ENTRIES) {
        const from = path.join(PKG, entry);
        const to = path.join(BUILD_COPY, entry);
        if (fs.statSync(from).isDirectory()) fs.cpSync(from, to, { recursive: true });
        else fs.copyFileSync(from, to);
    }
    fs.symlinkSync(path.join(PKG, 'node_modules'), path.join(BUILD_COPY, 'node_modules'), 'junction');
    const log = execFileSync(process.execPath, [path.join(BUILD_COPY, 'build', 'build.mjs')], { cwd: BUILD_COPY, stdio: 'pipe', timeout: 300000 }).toString('utf8');
    const copiedBundle = fs.readFileSync(path.join(BUILD_COPY, 'lib', 'client.js'));
    const copiedMap = fs.readFileSync(path.join(BUILD_COPY, 'lib', 'client.js.map'));
    const shippedBundle = fs.readFileSync(BUNDLE);
    const shippedMap = fs.readFileSync(MAP);
    report.bundle = { matches: Buffer.compare(copiedBundle, shippedBundle) === 0, bytes: copiedBundle.length };
    report.map = { matches: Buffer.compare(copiedMap, shippedMap) === 0, bytes: copiedMap.length };
    report.buildLog = (log.match(/esbuild errors: \d+ /g) || []).join(' ').trim();
    report.ok = report.bundle.matches && report.map.matches;
    return report;
}
let buildReport = { ok: false, reason: 'not run' };
try { buildReport = await buildOnCopy(); } catch (error) { buildReport = { ok: false, reason: String(error.stderr || error.message).slice(0, 400) }; }
check('B3', 'running build/build.mjs on a COPY of the package reproduces the shipped bundle AND map byte for byte, so this layout is a build product and not a hand edit',
    buildReport.ok === true, JSON.stringify(buildReport));

// ---------------------------------------------------------------- pins must move with the layout
const { createHash } = await import('node:crypto');
const t10Source = fs.readFileSync(T10, 'utf8');
const pinnedSha = (t10Source.match(/EXPECTED_BUNDLE_SHA256\s*=\s*'([0-9a-f]{64})'/) || [])[1];
const pinnedBytes = Number((t10Source.match(/EXPECTED_BUNDLE_BYTES\s*=\s*(\d+)/) || [])[1]);
const diskSha = createHash('sha256').update(fs.readFileSync(BUNDLE)).digest('hex');
const diskBytes = fs.statSync(BUNDLE).size;
check('X1', 'the identity pinned in tests/t10-ui-bundle-smoke.mjs is the bundle on disk (a rebuilt layout must re-pin in the same task)',
    pinnedSha === diskSha && pinnedBytes === diskBytes,
    'pinned=' + pinnedSha + '/' + pinnedBytes + ' disk=' + diskSha + '/' + diskBytes);
const frozenSource = fs.readFileSync(T59, 'utf8');
const frozenRows = [...frozenSource.matchAll(/\{ path: '([^']+)', sha256: '([0-9a-f]{64})', bytes: (\d+) \}/g)]
    .map((match) => ({ path: match[1], sha256: match[2], bytes: Number(match[3]) }));
const frozenProblems = [];
for (const row of frozenRows) {
    const file = path.join(PKG, row.path);
    if (!fs.existsSync(file)) { frozenProblems.push(row.path + ': missing on disk'); continue; }
    const bytes = fs.readFileSync(file);
    const sha = createHash('sha256').update(bytes).digest('hex');
    if (sha !== row.sha256 || bytes.length !== row.bytes) frozenProblems.push(row.path + ': sha256 ' + sha + '/' + bytes.length + ' != pinned ' + row.sha256 + '/' + row.bytes);
}
check('X2', 'every FROZEN row in tests/t59-erp-live-copy.mjs matches the file on disk — the three rows a layout change touches are re-pinned here',
    frozenRows.length === 13 && frozenProblems.length === 0,
    frozenRows.length + ' rows; ' + (frozenProblems.join('; ') || 'all match'));
check('X3', 'the workspace stylesheet changed for A3 (lib/client/WorkspaceActivity.module.css) is deliberately NOT one of the 13 FROZEN rows',
    frozenRows.every((row) => row.path !== 'lib/client/WorkspaceActivity.module.css'),
    'frozen paths=' + frozenRows.map((row) => row.path).join(','));

console.log('');
console.log('# bundle sha256 ' + diskSha + ' / ' + diskBytes + ' B');
console.log('# css    sha256 ' + createHash('sha256').update(fs.readFileSync(PANEL_CSS)).digest('hex') + ' / ' + fs.statSync(PANEL_CSS).size + ' B');
console.log('# map    sha256 ' + createHash('sha256').update(fs.readFileSync(MAP)).digest('hex') + ' / ' + fs.statSync(MAP).size + ' B');
console.log('# ' + results.filter((entry) => entry.ok).length + '/' + results.length + ' passed, ' + failures + ' failed');
process.exit(failures === 0 ? 0 : 1);
