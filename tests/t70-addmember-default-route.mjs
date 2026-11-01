// t70 (DOG-03 D1): the manual 'Add one member' form must open on a route that
// the host catalog REALLY serves, must flag a route it does not serve, and must
// report a 4xx with the ACTION to take instead of repeating the server sentence.
//
// The suite is deliberately behavioural where it can be: the pure helpers live
// in MemberControls.js and are sliced out of the source and evaluated here, so a
// broken default-route picker fails without needing a browser or React.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const pkg = path.join(repo, 'packages', 'dsh-agent-teams');
const CONTROLS = path.join(pkg, 'lib', 'client', 'MemberControls.js');
const LOCALES = path.join(pkg, 'lib', 'client', 'locales.js');
const BUNDLE = path.join(pkg, 'lib', 'client.js');

const PURE = ['catalogRoutesOf', 'blankRoute', 'defaultCatalogRoute', 'catalogHasRoute', 'catalogSnapshotOf', 'subscribeCatalog', 'pickDefaultRoute'];

let total = 0;
let failed = 0;
function check(name, ok, detail) {
  total += 1;
  if (ok) console.log('ok ' + total + ' ' + name + (detail ? ' - ' + detail : ''));
  else { failed += 1; console.log('FAIL ' + total + ' ' + name + (detail ? ' - ' + detail : '')); }
}

// Slice `export function name(...) { ... }` out of the module text by brace depth.
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

const controls = fs.readFileSync(CONTROLS, 'utf8');
const locales = fs.readFileSync(LOCALES, 'utf8');
const bundle = fs.readFileSync(BUNDLE, 'utf8');

const pieces = PURE.map((name) => ({ name, src: sliceFunction(controls, name) }));
const missingSlices = pieces.filter((piece) => piece.src === undefined).map((piece) => piece.name);
check('every pure catalog helper is exported and sliceable', missingSlices.length === 0, missingSlices.length ? 'missing: ' + missingSlices.join(' ') : pieces.length + ' helpers');

const sandbox = pieces.every((piece) => piece.src !== undefined)
  ? new Function(pieces.map((piece) => piece.src).join('\n') + '\nreturn { ' + PURE.join(', ') + ' };')()
  : {};
const { pickDefaultRoute, catalogRoutesOf, blankRoute, catalogHasRoute, catalogSnapshotOf } = sandbox;
const ready = typeof pickDefaultRoute === 'function';
check('helpers evaluate outside React', ready, ready ? 'pickDefaultRoute() callable' : 'not evaluable');

const CATALOG = [
  { provider: 'p1', model: 'm1' },
  { provider: 'p1', model: 'm2' },
  { provider: 'p2', model: 'm3' },
];
const snapshot = { status: 'ready', groups: [
  { id: 'p1', name: 'P1', models: [{ id: 'm1' }, { id: 'm2' }] },
  { id: 'p2', name: 'P2', models: [{ id: 'm3' }] },
] };

const declaredInCatalog = ready ? pickDefaultRoute(CATALOG, { provider: 'p2', model: 'm3' }) : {};
check('a declared route the catalog serves is preselected', declaredInCatalog.route !== undefined && declaredInCatalog.route.provider === 'p2' && declaredInCatalog.route.model === 'm3' && declaredInCatalog.warning === false && declaredInCatalog.source === 'declared', JSON.stringify(declaredInCatalog));

// The exact D1 shape: 'opencode-go/deepseek-v4.1-flash' is NOT served here.
const declaredForeign = ready ? pickDefaultRoute(CATALOG, { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }) : {};
check('a declared route outside the catalog falls back to the FIRST catalog entry and warns', declaredForeign.route !== undefined && declaredForeign.route.provider === 'p1' && declaredForeign.route.model === 'm1' && declaredForeign.warning === true && declaredForeign.source === 'catalog', JSON.stringify(declaredForeign));

const emptyPick = ready ? pickDefaultRoute([], { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }) : {};
check('an EMPTY catalog picks nothing and still warns (negative case)', emptyPick.route === undefined && emptyPick.warning === true && emptyPick.source === 'empty-catalog', JSON.stringify(emptyPick));

const noDeclared = ready ? pickDefaultRoute(CATALOG, undefined) : {};
check('an untouched form (no declared route) starts on the first catalog entry without a warning', noDeclared.route !== undefined && noDeclared.route.provider === 'p1' && noDeclared.route.model === 'm1' && noDeclared.warning === false, JSON.stringify(noDeclared));

const cases = [[CATALOG, 'list'], [snapshot, 'snapshot'], [[{ provider: 'only', model: 'solo' }], 'single']];
const preselects = ready ? cases.map((entry) => ({ name: entry[1], catalog: entry[0], pick: pickDefaultRoute(entry[0], { provider: 'ghost', model: 'nope' }) })) : [];
// pickDefaultRoute accepts a bare route list OR a directory snapshot, so the
// membership check flattens both shapes the same way the form does.
function routeList(state) {
  if (Array.isArray(state)) return state.filter((route) => route && typeof route.provider === 'string' && typeof route.model === 'string');
  return catalogRoutesOf(state);
}
const allInCatalog = preselects.length === 3 && preselects.every((entry) => entry.pick.route !== undefined
  && routeList(entry.catalog).some((route) => route.provider === entry.pick.route.provider && route.model === entry.pick.route.model));
check('every preselected route is really inside the catalog it came from', allInCatalog, preselects.map((entry) => entry.name + '=' + (entry.pick.route ? entry.pick.route.provider + '/' + entry.pick.route.model : 'none')).join(' '));

const corrupt = ready ? catalogRoutesOf({ groups: [
  { id: 'p1', models: [{ id: 'm1' }, { id: '' }, {}, null] },
  { id: '', models: [{ id: 'm9' }] },
  { id: 'p3' },
  null,
] }) : [];
check('catalogRoutesOf drops half-formed entries instead of throwing', corrupt.length === 1 && corrupt[0].provider === 'p1' && corrupt[0].model === 'm1', JSON.stringify(corrupt));

const blanks = ready ? [blankRoute({ provider: '', model: '' }), blankRoute({ provider: 'p1', model: '' }), blankRoute({ provider: 'p1', model: 'm1' }), blankRoute(undefined)] : [];
check('blankRoute treats a half-filled route as blank', blanks[0] === true && blanks[1] === true && blanks[2] === false && blanks[3] === true, JSON.stringify(blanks));

const hostileDirectory = { store: { getSnapshot() { throw new Error('boom'); } } };
const snaps = ready ? [catalogSnapshotOf(undefined), catalogSnapshotOf({}), catalogSnapshotOf(hostileDirectory), catalogSnapshotOf({ store: { getSnapshot: () => snapshot } })] : [];
check('catalogSnapshotOf degrades to undefined on an absent or hostile service', snaps[0] === undefined && snaps[1] === undefined && snaps[2] === undefined && snaps[3] === snapshot, JSON.stringify(snaps.map((s) => (s === undefined ? 'none' : 'snapshot'))));

// Wiring: the form must actually use the picker, the warning and the action text.
const addMemberStart = controls.indexOf('export function AddMemberControl(');
const addMemberBody = addMemberStart < 0 ? '' : controls.slice(addMemberStart);
check('the form adopts a catalog route through pickDefaultRoute + directory.load', addMemberBody.includes('pickDefaultRoute(') && addMemberBody.includes('modelDirectory.load?.()') && addMemberBody.includes('subscribeCatalog(modelDirectory, adopt)'), addMemberStart < 0 ? 'AddMemberControl missing' : 'wiring present');
check('a route outside the catalog renders an inline warning instead of a silent 409', addMemberBody.includes('data-add-member-route-warning') && addMemberBody.includes('addMember.routeUnavailable') && addMemberBody.includes('data-add-member-catalog-empty'), 'markers present');
check('a failed submit reports the ACTION and keeps the raw server string as detail', addMemberBody.includes('addMember.failedAction') && addMemberBody.includes("detail: t('addMember.failed'"), 'action + detail');
check('Notice renders the raw string in a secondary detail and in title', /title: detail/.test(controls) && controls.includes('"data-error-detail": true'), 'Notice detail');

const KEYS = ['addMember.routeDefault', 'addMember.routeUnavailable', 'addMember.catalogEmpty', 'addMember.failedAction'];
const localeRows = KEYS.map((key) => {
  const hits = [...locales.matchAll(new RegExp("'" + key.replace(/\./g, '\\.') + "':\\s*'([^']*)'", 'g'))].map((m) => m[1]);
  return { key, hits };
});
const localeBad = localeRows.filter((row) => row.hits.length !== 2 || row.hits.some((text) => text.trim() === ''));
check('every new locale key ships in EXACTLY two non-empty dictionaries (zh + en)', localeBad.length === 0, localeBad.length ? localeBad.map((row) => row.key + ':' + row.hits.length).join(' ') : localeRows.map((row) => row.key + ':2').join(' '));
check('the rebuilt bundle carries the new form markers', bundle.includes('addMember.failedAction') && bundle.includes('data-add-member-route-warning') && bundle.includes('pickDefaultRoute'), 'bundle markers');

console.log('');
console.log('# ' + (total - failed) + '/' + total + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);