/**
 * t10 UI bundle smoke test.
 *
 * Three independent checks against the SHIPPED artifacts:
 *  1. lib/client.js loads through a fake window.__ModuleLoader__ and its factory
 *     registers the panel slots (conversation.chat.node key `agent-teams`, and
 *     the right-pane tab that must keep TEAM_TAB_ID).
 *  2. The bundle carries the new control code (set_member_route / add_member
 *     POST actions and their DOM hooks).
 *  3. The new controls render to real HTML through react-dom/server, including
 *     the two-route pair shown when a member carries a routeOverride.
 *
 * Run: node tests/t10-ui-bundle-smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const pkgDir = path.join(repoRoot, 'packages', 'dsh-agent-teams');
const bundlePath = path.join(pkgDir, 'lib', 'client.js');

// t80 (audit vong 9, V9-F3): the old check only RECORDED the bundle hash, so a
// stale or half-built lib/client.js passed silently. The identity of the shipped
// bundle is pinned here and ASSERTED below. Both values come from the artifact
// produced by `node build/build.mjs` inside packages/dsh-agent-teams.
// t139: re-measured after the panel was re-laid out into two columns (member column left with
// add-member on top, dependency map right); the bundle grew by the wrapper div plus its class
// names. Measured with node:crypto over the file bytes, not copied from t59's FROZEN table.
const EXPECTED_BUNDLE_SHA256 = '67d616a608c38ed37aae64e53c95442ed0f1f906e2ccf41a5f661f8ea4ab10c0';
const EXPECTED_BUNDLE_BYTES = 258925;

let failures = 0;
const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail });
    if (!ok) failures += 1;
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail === undefined ? '' : ' :: ' + detail));
}

const source = fs.readFileSync(bundlePath, 'utf8');

// ---------------------------------------------------------------- check 1
const react = await import(pathToFileURL(path.join(pkgDir, 'node_modules', 'react', 'index.js')).href)
    .catch(() => import('react'));
const jsxRuntime = await import(pathToFileURL(path.join(pkgDir, 'node_modules', 'react', 'jsx-runtime.js')).href)
    .catch(() => import('react/jsx-runtime'));
const primitivesStub = { Menu: () => null, Modal: () => null, Tooltip: () => null };
const requires = {
    'react': react,
    'react/jsx-runtime': jsxRuntime,
    '@deepseek-ai/dsh-client-ui-primitives': primitivesStub,
};

let registration;
const loaderHost = {};
loaderHost.__ModuleLoader__ = { load: (value) => { registration = value; } };
loaderHost.window = loaderHost;
const sandbox = vm.createContext({
    window: loaderHost,
    __ModuleLoader__: loaderHost.__ModuleLoader__,
    console,
    setTimeout,
    clearTimeout,
    performance,
    fetch: () => Promise.reject(new Error('no network in smoke test')),
});
vm.runInContext(source, sandbox, { filename: 'lib/client.js' });
check('bundle calls window.__ModuleLoader__.load', registration !== undefined);
check('loader id is @nami/dsh-agent-teams', registration?.id === '@nami/dsh-agent-teams', String(registration?.id));

const registered = [];
const slots = {
    inject: (name, callback) => callback(slots),
    register: (definition, component) => {
        registered.push({ slot: definition?.name ?? '', key: definition?.key ?? definition?.id ?? '', component });
        return () => undefined;
    },
};
const native = {
    effect: (run) => run(),
    locale: { bind: () => (key) => key },
    sidebarRightTabs: { register: () => () => undefined },
    sidebarRight: {},
    slots,
    modelDirectories: { directoryFor: () => undefined },
};
const ctx = {
    effect: (run) => run(),
    locale: { register: (namespace, dictionaries) => ({ namespace, dictionaries }) },
    inject: (services, callback) => callback(native),
    slots,
    get: () => undefined,
    sessions: { list: () => [] },
    layout: {},
    modelDirectories: native.modelDirectories,
    uiConversation: { events: { register: () => undefined } },
    logger: { warn: () => undefined, error: () => undefined },
};

const mod = registration.factory((name) => {
    if (requires[name] === undefined)
        throw new Error('unexpected external require: ' + name);
    return requires[name];
});
check('factory exports apply()', typeof mod.apply === 'function');
check('factory exports inject list', Array.isArray(mod.inject), JSON.stringify(mod.inject));

let applyError = '';
try {
    mod.apply(ctx);
}
catch (error) {
    applyError = error instanceof Error ? error.message : String(error);
}
check('apply() runs against a stub ctx', applyError === '', applyError);
const nodeSlot = registered.find((entry) => entry.slot === 'conversation.chat.node');
check('registers conversation.chat.node key agent-teams', nodeSlot?.key === 'agent-teams', JSON.stringify(nodeSlot?.key));
const tabSlot = registered.find((entry) => entry.slot === 'sidebar.right.pane.tab');
check('right pane tab keeps TEAM_TAB_ID', tabSlot?.key === '@nanmicoder/dsh-agent-teams/activity', JSON.stringify(tabSlot?.key));

// ---------------------------------------------------------------- check 2
for (const marker of [
    'set_member_route',
    'add_member',
    'data-member-route-control',
    'data-member-route-pair',
    'data-add-member-form',
    'data-add-member-toggle',
    'clear_member_route',
    'data-member-route-clear',
    'data-route-badge',
    'clear_member_fallback',
    'data-member-fallback-route',
    'data-member-fallback-clear',
    'tool_policy',
    'executionPrompt',
    // t71 / DOG-03 D1: the form must open on a catalog route and warn instead
    // of letting the server answer 409 after a click.
    'pickDefaultRoute',
    'data-add-member-route-warning',
    'data-add-member-catalog-empty',
    'addMember.failedAction',
    // t74: the captain's DECLARED route must reach the panel, the picker must
    // use it, and the warning must name it when the catalog does not serve it.
    'captainRoute',
    'data-add-member-captain-route-warning',
    'addMember.captainRouteOutside',
]) {
    check('bundle carries ' + marker, source.includes(marker));
}
function bundleHashProblems(text, expected) {
    const want = expected === undefined ? { sha256: EXPECTED_BUNDLE_SHA256, bytes: EXPECTED_BUNDLE_BYTES } : expected;
    const problems = [];
    const actualSha = crypto.createHash('sha256').update(text, 'utf8').digest('hex');
    const actualBytes = Buffer.byteLength(text);
    if (actualSha !== want.sha256) problems.push('sha256 ' + actualSha + ' != ' + want.sha256);
    if (actualBytes !== want.bytes) problems.push('bytes ' + actualBytes + ' != ' + want.bytes);
    return problems;
}
const REBUILD_HINT = ' -- rebuild with `node build/build.mjs` from packages/dsh-agent-teams, then update EXPECTED_BUNDLE_SHA256 / EXPECTED_BUNDLE_BYTES';
const hashProblems = bundleHashProblems(source);
check('bundle identity matches the pinned sha256 + bytes', hashProblems.length === 0,
    hashProblems.length === 0 ? EXPECTED_BUNDLE_SHA256 + ' / ' + EXPECTED_BUNDLE_BYTES + 'B' : hashProblems.join('; ') + REBUILD_HINT);
// Negative control in memory: one appended byte must break the same assertion,
// so this check cannot pass by construction.
const hashMutated = source + '\n';
const hashMutatedProblems = bundleHashProblems(hashMutated);
check('mutation: one appended byte breaks the pinned identity', hashMutatedProblems.length > 0 && hashMutated !== source,
    'applies: ' + (hashMutated !== source) + ', delta ' + (Buffer.byteLength(hashMutated) - Buffer.byteLength(source)) + ' B, problems: ' + hashMutatedProblems.join('; '));

// ---------------------------------------------------------------- check 2b (t129)
// The pin above catches 'the bundle is not the artifact I measured'. It cannot catch
// 'the artifact is measured but its parts sit in the wrong order': the same bytes
// could be pinned while the panel reads wrong. t139 replaced the t128 single column
// (DependencyMap above the members IIFE, which pushed the member list off screen)
// with two columns: AddMemberControl then the member list on the LEFT, DependencyMap
// on the RIGHT. So the left column must appear BEFORE the right column in the bundle,
// with an in-memory negative control built from the rejected t128 order.
const PANEL_ORDER = [
    ['AddMemberControl above the member list', 'AddMemberControl, { team'],
    ['the member list (orderDelegationMembers call)', 'orderDelegationMembers(team.members, team.tasks)'],
    ['DependencyMap in the right-hand column', 'DependencyMap, { tasks'],
];
function panelOrderProblems(text) {
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
        if (!(prev.index < cur.index)) {
            problems.push(prev.label + ' @' + prev.index + ' must precede ' + cur.label + ' @' + cur.index);
        }
    }
    return problems;
}
const orderProblems = panelOrderProblems(source);
check('panel order (t139): AddMemberControl < member list < DependencyMap — the member column renders before the dependency column', orderProblems.length === 0,
    orderProblems.length === 0
        ? PANEL_ORDER.map((entry) => entry[1] + '@' + source.indexOf(entry[1])).join(' < ')
        : orderProblems.join('; '));
// Negative control in memory: the REJECTED t128 order (DependencyMap first, the member
// column after it) must fail the SAME predicate, otherwise the check above could only
// ever pass by construction.
const oldOrderSource = [PANEL_ORDER[2][1], PANEL_ORDER[0][1], PANEL_ORDER[1][1]].join('\n');
const oldOrderProblems = panelOrderProblems(oldOrderSource);
check('mutation: the rejected t128 order fails the same order check',
    oldOrderProblems.length > 0 && oldOrderProblems.every((problem) => problem.includes('must precede')),
    'applies: ' + (oldOrderSource !== source) + ', problems: ' + oldOrderProblems.join('; '));

// ---------------------------------------------------------------- check 3
const requireFromPkg = createRequire(path.join(pkgDir, 'package.json'));
const esbuild = requireFromPkg('esbuild');

const harness = `
import { jsx, jsxs } from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { AddMemberControl, MemberFailureNotice, MemberRouteControl } from './lib/client/MemberControls.js';

const dictionary = {
  'member.route.title': 'Route',
  'member.route.pair': '{current} → {next}',
  'member.route.override': 'Override from {source}',
  'member.route.saved': 'Route saved',
  'member.route.failed': 'Route change failed: {message}',
  'member.route.none': 'Not set',
  'member.route.noCatalog': '(no catalog)',
  'member.route.origin.override': 'override',
  'member.route.origin.declared': 'declared',
  'member.route.clear': 'Restore declared route',
  'member.route.cleared': 'Declared route restored',
  'member.route.clearFailed': 'Restore failed: {message}',
  'member.route.origin.fallback-active': 'fallback active',
  'member.route.fallback': 'fallback: {route}',
  'member.route.fallbackClear': 'Clear fallback',
  'member.route.fallbackCleared': 'Fallback route cleared',
  'member.route.fallbackClearFailed': 'Clear fallback failed: {message}',
  'member.failure.title': 'Provider failure',
  'addMember.toggle': 'Add member',
  'addMember.close': 'Close',
  'addMember.title': 'Add one member manually',
  'addMember.name': 'Member name',
  'addMember.role': 'Role',
  'addMember.route': 'Model route (optional)',
  'addMember.routeInherit': 'Leave empty to inherit',
  'addMember.noCatalog': '(no catalog)',
  'addMember.prompt': 'Execution prompt (optional)',
  'addMember.toolPolicy': 'Tool policy id (optional)',
  'addMember.toolPolicyHint': 'Leave empty for default',
  'addMember.submit': 'Add member',
  'addMember.saving': 'Adding',
  'addMember.addedNamed': 'Member {name} added',
  'addMember.failed': 'Add failed: {message}',
  'addMember.nameRequired': 'Enter a member name',
};
const t = (key, values) => String(dictionary[key] ?? key).replace(/\\{(\\w+)\\}/g, (_m, name) => (values && name in values ? String(values[name]) : ''));
const directory = {
  load: async () => undefined,
  store: {
    subscribe: () => () => undefined,
    getSnapshot: () => ({ status: 'ready', groups: [], failures: [], error: undefined }),
    // Server rendering needs a third reader; the browser path never calls it.
    getServerSnapshot: () => ({ status: 'ready', groups: [], failures: [], error: undefined }),
  },
};
const team = { teamId: 'team-1', captainSessionId: 'session-1', members: [], tasks: [] };
const member = {
  id: 'child-1', name: 'Ana', role: 'dev', status: 'running', activity: 'idle',
  provider: 'p1', model: 'm1', reasoningEffort: '', nextRoute: 'p2/m2', routeOrigin: 'override',
  routeOverride: { provider: 'p2', model: 'm2', reasoningEffort: 'high', source: 'captain', at: 1700000000000, by: 'web:session-1' },
};
// A member whose route died under it carries the durable record the host
// snapshot surfaces; a healthy member carries no record at all, and a corrupt
// one (empty code) must be skipped instead of breaking the row.
const failing = { ...member, name: 'Bo', lastFailure: { code: 'QUOTA', message: 'insufficient balance', at: 1700000000000, provider: 'p0', model: 'm0' } };
const healthy = { ...member, name: 'Cy' };
const corrupt = { ...member, name: 'Di', lastFailure: { code: '   ', at: 'not-a-number' } };
// A member on its declared route has nothing to revert: no override, so the
// badge says declared and the restore button must not render at all.
const declaredOnly = { ...member, name: 'Eve', routeOrigin: 'declared', routeOverride: undefined, nextRoute: 'p1/m1' };
// A member that has ALREADY degraded reports origin 'fallback' plus the flag;
// a member that merely DECLARED a fallback keeps running its own route, so the
// badge must distinguish the two or the panel lies about which one is live.
const degraded = { ...member, name: 'Fay', routeOrigin: 'fallback', fallbackActive: true, fallback: { provider: 'p1', model: 'm3', reasoningEffort: 'low' } };
const withFallback = { ...member, name: 'Gil', routeOrigin: 'declared', routeOverride: undefined, nextRoute: 'p1/m1', fallback: { provider: 'p1', model: 'm3' } };
const corruptFallback = { ...member, name: 'Hal', routeOrigin: 'declared', routeOverride: undefined, fallback: { provider: 'p1' } };
const html = renderToStaticMarkup(jsxs('div', { id: 'root', children: [
  // The catalog picker reads the host directory through useSyncExternalStore with
  // only (subscribe, getSnapshot); React's server renderer requires a third
  // getServerSnapshot reader it does not pass. So the SSR check exercises the
  // no-catalog fallback branch, and the picker itself stays browser-only.
  jsx(MemberRouteControl, { team, member, modelDirectory: undefined, t }),
  jsx(MemberRouteControl, { team, member: declaredOnly, modelDirectory: undefined, t }),
  jsx(MemberRouteControl, { team, member: degraded, modelDirectory: undefined, t }),
  jsx(MemberRouteControl, { team, member: withFallback, modelDirectory: undefined, t }),
  jsx(MemberRouteControl, { team, member: corruptFallback, modelDirectory: undefined, t }),
  jsx(AddMemberControl, { team, modelDirectory: undefined, t, defaultOpen: true }),
  jsx(MemberFailureNotice, { member: failing, t }),
  jsx(MemberFailureNotice, { member: healthy, t }),
  jsx(MemberFailureNotice, { member: corrupt, t }),
] }));
export default html;
`;
const cssStub = {
    name: 'css-stub',
    setup(build) {
        build.onResolve({ filter: /\.module\.css$/ }, (args) => ({ path: args.path, namespace: 'css-stub' }));
        build.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => ({
            contents: 'export default new Proxy({}, { get: (_target, name) => (typeof name === "string" ? "css-" + name : undefined) });',
            loader: 'js',
        }));
        build.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitives', namespace: 'stub' }));
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'export const Menu = () => null; export const Modal = () => null; export const Tooltip = () => null;',
            loader: 'js',
        }));
    },
};
const built = await esbuild.build({
    stdin: { contents: harness, resolveDir: pkgDir, loader: 'js' },
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
    plugins: [cssStub],
});
const harnessPath = path.join(here, 't10-harness.tmp.cjs');
fs.writeFileSync(harnessPath, built.outputFiles[0].text);
let html = '';
let renderError = '';
try {
    html = requireFromPkg(harnessPath).default;
}
catch (error) {
    renderError = error instanceof Error ? error.message : String(error);
}
finally {
    fs.rmSync(harnessPath, { force: true });
}
check('react-dom/server rendered the new controls', renderError === '' && html.length > 0, renderError);
check('renders the member route control', html.includes('data-member-route-control="Ana"'), '');
// React's server renderer separates adjacent text nodes with <!-- --> markers.
const text = html.replace(/<!-- -->/g, '');
console.log('EVIDENCE route control html: ' + html.slice(html.indexOf('data-member-route-control'), html.indexOf('data-member-route-control') + 640));
check('shows both routes on override', text.includes('p1/m1 → p2/m2'), '');
check('shows the override source', html.includes('data-route-source="captain"'), '');
check('renders the add-member form', html.includes('data-add-member-form="true"') || html.includes('data-add-member-form'), '');
const clearButtons = (html.match(/data-member-route-clear="/g) ?? []).length;
check('route badge names the origin (override)', html.includes('data-route-badge="override"'), '');
check('override row offers the restore button', html.includes('data-member-route-clear="Ana"'), '');
check('declared row shows the declared badge', html.includes('data-route-badge="declared"'), '');
// The base member and the degraded one both carry a routeOverride, so both offer
// restore; the declared / declared+fallback / corrupt rows must not.
check('restore button appears only on rows that carry an override', clearButtons === 2, String(clearButtons));
const fallbackRows = (html.match(/data-member-fallback-route="/g) ?? []).length;
const fallbackClearButtons = (html.match(/data-member-fallback-clear="/g) ?? []).length;
check('degraded member shows the fallback-active badge (it outranks the fallback one)', html.includes('data-route-badge="fallback-active"'), '');
check('a declared fallback alone shows the fallback badge', html.includes('data-route-badge="fallback"'), '');
check('fallback row names provider/model', text.includes('fallback: p1/m3'), '');
check('two members carry a fallback row; the half-record is skipped', fallbackRows === 2, String(fallbackRows));
check('each real fallback row offers its clear button', fallbackClearButtons === 2, String(fallbackClearButtons));
const failureRows = (html.match(/data-member-failure="/g) ?? []).length;
check('renders the provider failure notice', html.includes('data-member-failure="QUOTA"'), '');
check('failure notice shows code, instant and the dead route', text.includes('QUOTA \u00b7 2023-11-14 22:13Z \u00b7 p0/m0'), '');
check('healthy and corrupt members add no failure row', failureRows === 1, String(failureRows));
check('form carries memberName/tool_policy/executionPrompt',
    html.includes('name="memberName"') && html.includes('name="tool_policy"') && html.includes('name="executionPrompt"'), '');

console.log('');
console.log('TOTAL ' + results.length + ' checks, ' + (results.length - failures) + ' passed, ' + failures + ' failed');
process.exit(failures === 0 ? 0 : 1);
