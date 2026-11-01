// t74: the captain's DECLARED route must reach the activity panel.
//
// WHY: t71 shipped the pure picker pickDefaultRoute(catalog, declaredRoute) and
// the Add-member form preselects a catalog entry, so the 409 of DOG-03 D1 is
// gone. But the team snapshot payload carried NO declared captain route, so in
// the GUI declaredRoute was always undefined and the 'declaration outside the
// catalog' warning could never render. This suite pins both halves:
//   * lib/snapshot.js carries captainRoute, taken from the SAME source the host
//     resolves a member route from (members.js resolveMemberLlmSelection:
//     captain.session.requestHeader().config, falling back to captain.options),
//     and omits the key entirely when the captain is unreachable;
//   * lib/client/MemberControls.js feeds team.captainRoute into pickDefaultRoute
//     and renders the named warning when the catalog does not serve it.
// Nothing here claims a browser run: the payload and the form source are checked
// directly, the bundle markers are checked by tests/t10-ui-bundle-smoke.mjs.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const LIB = path.join(repo, 'packages', 'dsh-agent-teams', 'lib');
const CONTROLS = path.join(LIB, 'client', 'MemberControls.js');
const LOCALES = path.join(LIB, 'client', 'locales.js');
const BUNDLE = path.join(LIB, 'client.js');

const snapshotMod = await import(pathToFileURL(path.join(LIB, 'snapshot.js')).href);
const membersSource = fs.readFileSync(path.join(LIB, 'members.js'), 'utf8');
const controls = fs.readFileSync(CONTROLS, 'utf8');
const locales = fs.readFileSync(LOCALES, 'utf8');
const bundle = fs.readFileSync(BUNDLE, 'utf8');
const snapshotSource = fs.readFileSync(path.join(LIB, 'snapshot.js'), 'utf8');

let total = 0;
let failed = 0;
function check(name, ok, detail) {
  total += 1;
  if (ok) console.log('ok ' + total + ' ' + name + (detail ? ' - ' + detail : ''));
  else { failed += 1; console.log('FAIL ' + total + ' ' + name + (detail ? ' - ' + detail : '')); }
}

// ---------------------------------------------------------------------------
// 1. The pure picker, sliced out of the form and evaluated without React.
// ---------------------------------------------------------------------------
function sliceFunction(text, name) {
  const start = text.indexOf('export function ' + name + '(');
  if (start < 0) return undefined;
  const open = text.indexOf('{', start);
  if (open < 0) return undefined;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1).replace(/^export /, '');
    }
  }
  return undefined;
}
function sandboxOf(pickSrc) {
  const catalogSrc = sliceFunction(controls, 'catalogRoutesOf');
  if (pickSrc === undefined || catalogSrc === undefined) return undefined;
  try {
    return new Function(catalogSrc + '\n' + pickSrc + '\nreturn pickDefaultRoute;')();
  } catch {
    return undefined;
  }
}

const pickSrc = sliceFunction(controls, 'pickDefaultRoute');
const pick = sandboxOf(pickSrc);
check('pickDefaultRoute is exported and evaluable outside React', typeof pick === 'function', typeof pick === 'function' ? 'callable' : 'not evaluable');

const CATALOG = [
  { provider: 'p1', model: 'm1' },
  { provider: 'p1', model: 'm2' },
  { provider: 'p2', model: 'm3' },
];

// (a) captainRoute the catalog serves => preselect EXACTLY it, source 'declared'.
const inCatalog = typeof pick === 'function' ? pick(CATALOG, { provider: 'p2', model: 'm3' }) : {};
check('(a) a captain route the catalog serves is preselected as declared', inCatalog.source === 'declared' && inCatalog.warning === false && inCatalog.route !== undefined && inCatalog.route.provider === 'p2' && inCatalog.route.model === 'm3', JSON.stringify(inCatalog));

// (b) captainRoute outside the catalog => first catalog entry + warning true.
const outside = typeof pick === 'function' ? pick(CATALOG, { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }) : {};
check('(b) a captain route outside the catalog selects the first catalog entry AND warns', outside.warning === true && outside.source === 'catalog' && outside.route !== undefined && outside.route.provider === 'p1' && outside.route.model === 'm1', JSON.stringify(outside));

// (c) no captainRoute (an older payload / an unreachable captain) => unchanged.
const absent = typeof pick === 'function' ? pick(CATALOG, undefined) : {};
check('(c) an absent captain route keeps the pre-t74 behaviour (first entry, no warning)', absent.warning === false && absent.source === 'catalog' && absent.route !== undefined && absent.route.provider === 'p1', JSON.stringify(absent));

// (d) reasoningEffort: 'default' unless the declaration names one.
const efforts = typeof pick === 'function'
  ? [pick(CATALOG, { provider: 'p2', model: 'm3' }), pick(CATALOG, { provider: 'p2', model: 'm3', reasoningEffort: 'high' })]
  : [];
check('(d) reasoningEffort defaults to "default" and travels when declared', efforts.length === 2 && efforts[0].route.reasoningEffort === 'default' && efforts[1].route.reasoningEffort === 'high', efforts.map((p) => p.route && p.route.reasoningEffort).join(' '));

// ---------------------------------------------------------------------------
// 2. The form wiring: team.captainRoute reaches the picker and the warning.
// ---------------------------------------------------------------------------
const addMemberStart = controls.indexOf('export function AddMemberControl(');
const addMemberBody = addMemberStart < 0 ? '' : controls.slice(addMemberStart);
check('(e1) the form reads the declared route off the team payload', addMemberBody.includes('team.captainRoute'), addMemberStart < 0 ? 'AddMemberControl missing' : 'team.captainRoute read');
check('(e2) BOTH pick sites pass the declared route (initial render + catalog adopt)', addMemberBody.includes('pickDefaultRoute(catalogState, declaredRoute)') && addMemberBody.includes('pickDefaultRoute(catalogSnapshotOf(modelDirectory), declaredRoute)'), 'both call sites wired');
check('(e3) the warning renders with its own marker and NAMES the declared route', addMemberBody.includes('data-add-member-captain-route-warning') && addMemberBody.includes("t('addMember.captainRouteOutside', { route: declaredRouteText })"), 'named warning present');
check('(e4) a declared pick no longer shows the "picked automatically" hint', /defaultPick\.source === 'declared'/.test(addMemberBody) && addMemberBody.indexOf("defaultPick.source === 'declared'") < addMemberBody.indexOf('addMember.routeDefault'), 'hint suppressed for declared');

const KEY = 'addMember.captainRouteOutside';
const hits = [...locales.matchAll(new RegExp("'" + KEY.replace(/\./g, '\\.') + "':\\s*'([^']*)'", 'g'))].map((m) => m[1]);
check('(e5) the new locale key ships in EXACTLY two non-empty dictionaries (zh + en)', hits.length === 2 && hits.every((text) => text.trim() !== '' && text.includes('{route}')), hits.length + ' dictionaries');

// ---------------------------------------------------------------------------
// 3. The server payload: captainRoute from the same source the host uses.
// ---------------------------------------------------------------------------
const membersRouteSource = membersSource.indexOf('captain.session.requestHeader()') >= 0
  && membersSource.includes('captain.options.provider')
  && membersSource.includes('captain.options.model');
check('(f0) the host resolves a member route from requestHeader().config then captain.options', membersRouteSource, 'members.js source of truth located');
check('(f1) the snapshot reads the SAME two places (no invented source)', snapshotSource.includes('requestHeader?.()') && snapshotSource.includes('captain.options?.provider') && snapshotSource.includes('captain.options?.model'), 'mirror of members.js');

function makeCtx(captain) {
  return {
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    agents: { get(id) { return id === 'sess-captain' ? captain : undefined; }, list() { return []; } },
    subagents: { list() { return []; }, getProvider() { return { id: 'spawn', defaultModel: 'm1' }; } },
    llm: { async listModels() { return [{ id: 'm1' }]; }, async listProviders() { return [{ id: 'p1' }]; } },
    on() { return () => {}; },
  };
}
const captainWith = (header, options) => ({
  id: 'sess-captain',
  options: options ?? {},
  session: { id: 'sess-captain', header: { cwd: repo }, requestHeader: () => ({ config: header }) },
});
const teamState = (captainSessionId) => ({
  id: 'team-t74',
  name: 't74',
  captainSessionId: captainSessionId ?? 'sess-captain',
  phase: 'running',
  members: [{ id: '', name: 'worker-a', status: 'idle', provider: 'p1', model: 'm1' }],
  tasks: [],
});

const stateRoot = await mkdtemp(path.join(tmpdir(), 't74-'));
try {
  const declared = await snapshotMod.assembleTeamSnapshot(makeCtx(captainWith({ provider: 'p9', model: 'm9', reasoningEffort: 'high' })), stateRoot, repo, teamState());
  check('(f2) the snapshot carries the captain route verbatim', JSON.stringify(declared.captainRoute) === JSON.stringify({ provider: 'p9', model: 'm9', reasoningEffort: 'high' }), JSON.stringify(declared.captainRoute));
  check('(f3) the payload survives a JSON round trip unchanged', JSON.stringify(JSON.parse(JSON.stringify(declared)).captainRoute) === JSON.stringify(declared.captainRoute), 'round trip');

  const viaOptions = await snapshotMod.assembleTeamSnapshot(makeCtx(captainWith({}, { provider: 'p7', model: 'm7' })), stateRoot, repo, teamState());
  check('(f4) a captain declaring nothing in the header falls back to its options', JSON.stringify(viaOptions.captainRoute) === JSON.stringify({ provider: 'p7', model: 'm7' }), JSON.stringify(viaOptions.captainRoute));

  const noService = await snapshotMod.assembleTeamSnapshot({ logger: { warn() {}, debug() {}, info() {}, error() {} } }, stateRoot, repo, teamState());
  check('(f5) an absent agents service OMITS the key (not an empty object)', !('captainRoute' in noService), 'keys: ' + Object.keys(noService).length);

  const unknownSession = await snapshotMod.assembleTeamSnapshot(makeCtx(undefined), stateRoot, repo, teamState('sess-gone'));
  check('(f6) an unreachable captain session omits the key', !('captainRoute' in unknownSession) && unknownSession.captainSessionId === 'sess-gone', 'absent for sess-gone');

  const halfRoute = await snapshotMod.assembleTeamSnapshot(makeCtx(captainWith({ provider: 'p9', model: '' })), stateRoot, repo, teamState());
  check('(f7) a HALF-declared route is not published as a usable one', !('captainRoute' in halfRoute), 'absent for provider-only');

  const withRoute = Object.keys(declared);
  const without = Object.keys(unknownSession);
  const delta = withRoute.filter((key) => !without.includes(key));
  const lost = without.filter((key) => !withRoute.includes(key));
  check('(f8) the change is additive: exactly one extra key, nothing removed', delta.length === 1 && delta[0] === 'captainRoute' && lost.length === 0, 'adds: ' + delta.join(',') + ' loses: ' + (lost.join(',') || 'none'));
  check('(f9) the old shape is intact (workspace/teamId/name/captainSessionId/phase/members/tasks/messageCount/captainInbox)', ['workspace', 'teamId', 'name', 'captainSessionId', 'phase', 'members', 'tasks', 'messageCount', 'captainInbox'].every((key) => without.includes(key)), 'legacy keys present');
} finally {
  await rm(stateRoot, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 4. Negative control: break the picker in memory and watch the suite's own
//    first case fail, so a green run cannot be a green nothing.
// ---------------------------------------------------------------------------
const mutatedSrc = pickSrc === undefined ? undefined : pickSrc.replace('if (declaredUsable) {', 'if (false) {');
const mutated = sandboxOf(mutatedSrc);
const mutatedResult = typeof mutated === 'function' ? mutated(CATALOG, { provider: 'p2', model: 'm3' }) : {};
const applies = mutatedSrc !== undefined && mutatedSrc !== pickSrc;
check('(g1) mutation applies in memory and the declared case collapses to a catalog pick', applies && mutatedResult.source === 'catalog' && mutatedResult.warning === true, 'applies: ' + (pickSrc === undefined || mutatedSrc === undefined ? 'n/a' : Math.abs(mutatedSrc.length - pickSrc.length)) + ' bytes delta');
check('(g2) that mutation really contradicts case (a)', mutatedResult.source !== inCatalog.source, 'mutated source=' + mutatedResult.source + ' vs live=' + inCatalog.source);

// t80 (V9-F3): this used to RECORD the two markers and pass unconditionally.
// It now asserts them, so a bundle built before t74 turns red in this suite too.
const BUNDLE_MARKERS = ['captainRoute', 'data-add-member-captain-route-warning'];
const missingMarkers = BUNDLE_MARKERS.filter((marker) => !bundle.includes(marker));
check('(g3) the shipped bundle carries both captain-route markers', missingMarkers.length === 0,
  missingMarkers.length === 0 ? BUNDLE_MARKERS.join(' + ') + ' present' : 'missing: ' + missingMarkers.join(' ') + ' -- rebuild with `node build/build.mjs` from packages/dsh-agent-teams');
// (g4) negative control in memory: strip the warning marker from a copy and the
// same assertion must fail, so a green (g3) cannot be a green nothing.
const bundleWithoutMarker = bundle.split('data-add-member-captain-route-warning').join('');
const mutatedMissing = BUNDLE_MARKERS.filter((marker) => !bundleWithoutMarker.includes(marker));
check('(g4) mutation: dropping the warning marker from a copy fails that assertion',
  bundleWithoutMarker !== bundle && mutatedMissing.includes('data-add-member-captain-route-warning'),
  'applies: ' + (bundleWithoutMarker !== bundle) + ', delta ' + (bundle.length - bundleWithoutMarker.length) + ' bytes, missing: ' + (mutatedMissing.join(' ') || 'none'));

console.log('');
console.log('# ' + (total - failed) + '/' + total + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
