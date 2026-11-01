// t62 + t67: the activity panel CSS must stay complete for EVERY client module
// that renders with it, not just ActivityPanel.js. The fork once shipped a
// truncated ActivityPanel.module.css (18 of 139 classes), so 84 of the 100 keys
// ActivityPanel.js reads resolved to undefined and the panel rendered unstyled.
// t67 added the second half: MemberControls.js (form 'add member') and
// StagingPlanEditor.js import the same module css, so a key used only there could
// still be undefined (css.planSave was, which left the save button unstyled).
// This suite is static on purpose: it fails the moment one class used by any
// importer disappears from the CSS, or one CSS block disappears from the bundle.
// t70 (audit vong 7, V7-F2): a name-only scan was blind to STATE VARIANTS — the
// whole 6-selector :focus-visible group of ActivityPanel.module.css could be
// deleted while this suite stayed 17/17. The stateFloor section below counts
// hover / focus-visible / disabled / active rules per class and freezes the
// measured totals as floors, so losing one styled state turns the suite red.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const pkg = path.join(repo, 'packages', 'dsh-agent-teams');
const CLIENT = path.join(pkg, 'lib', 'client');
const CSS = path.join(CLIENT, 'ActivityPanel.module.css');
const BUNDLE = path.join(pkg, 'lib', 'client.js');

const CSS_MODULE = './ActivityPanel.module.css';
const CLASS_MIN = 139;
const CSS_BYTES_MIN = 51500;
const CSS_BYTES_EXACT_MIN = 51837;
const BUNDLE_CSS_MIN = 55000;
// Measured on the shipped module css (51 837 B, 399 blocks, one class per
// selector) then frozen; see docs/kiem-thu/t62-css-restore.md for the run that
// produced these numbers.
const STATE_ORDER = [':focus-visible', ':hover', ':disabled', ':active'];
const STATE_FLOORS = { ':focus-visible': 21, ':hover': 16, ':disabled': 12, ':active': 4 };
const INJECT_BLOCKS = 3;
const KEY_MIN = 136;
const KEY_SLOTS = 137;
const PREFIX = 'aYQbCq_';

let total = 0;
let failed = 0;
function check(name, ok, detail) {
  total += 1;
  if (ok) { console.log('ok ' + total + ' ' + name + (detail ? ' — ' + detail : '')); }
  else { failed += 1; console.log('FAIL ' + total + ' ' + name + (detail ? ' — ' + detail : '')); }
}

// Same mapping rule the build plugin (build/css-module-plugin.mjs) applies:
// a class already carrying a prefix maps its local name after the last underscore.
export function mappingOf(cssText) {
  const names = [...cssText.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
  const mapping = {};
  for (const name of names) {
    if (name.includes('_')) { mapping[name.split('_').pop()] = name; } else { mapping[name] = name; }
  }
  return mapping;
}

export function cssKeysOf(jsText) {
  return [...new Set([...jsText.matchAll(/\bcss\.([A-Za-z0-9_$]+)/g)].map((m) => m[1]))].sort();
}

export function prefixedClasses(cssText) {
  return [...new Set([...cssText.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]).filter((c) => c.startsWith(PREFIX)))];
}

// Every client module that imports the shared module css is a consumer, and the
// list is discovered rather than hard coded so a new importer cannot be missed.
export function importersOf(dir, cssModule = CSS_MODULE) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ file: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }))
    .filter((entry) => entry.text.includes(cssModule));
}

export function keysByFileOf(importers) {
  const byFile = {};
  const union = new Set();
  let slots = 0;
  for (const entry of importers) {
    const keys = cssKeysOf(entry.text);
    if (keys.length === 0) { continue; }
    byFile[entry.file] = keys;
    keys.forEach((k) => union.add(k));
    slots += keys.length;
  }
  return { byFile, union: [...union].sort(), slots };
}

// esbuild emits the css-module payload as `const css = <literal>`; the build
// plugin writes a template literal, and a hand-written test must not assume the
// quote character, so both template and quoted literals are scanned.
export function cssLiteralsOf(bundleText) {
  const out = [];
  let i = 0;
  while (i < bundleText.length) {
    const open = bundleText[i];
    if (open !== '"' && open !== "'" && open !== '`') { i += 1; continue; }
    let j = i + 1;
    let text = '';
    while (j < bundleText.length) {
      const ch = bundleText[j];
      if (ch === '\\') { text += bundleText[j + 1] || ''; j += 2; continue; }
      if (ch === open) { break; }
      text += ch; j += 1;
    }
    if (text.length > 1000 && text.includes('{') && text.includes('}')) { out.push(text); }
    i = j + 1;
  }
  return out;
}

export function analyze(cssText, importers, bundleText) {
  const mapping = mappingOf(cssText);
  const { byFile, union, slots } = keysByFileOf(importers);
  const classes = prefixedClasses(cssText);
  const missing = union.filter((k) => mapping[k] === undefined);
  const literals = cssLiteralsOf(bundleText);
  const bundleCssBytes = literals.reduce((n, s) => n + Buffer.byteLength(s), 0);
  const injections = (bundleText.match(/typeof document/g) || []).length;
  return { mapping, byFile, keys: union, slots, classes, missing, bundleCssBytes, injections, literals: literals.length };
}
// t70: count how many rule slots each prefixed class contributes under each
// state variant. A selector list entry counts every class it mentions, so a
// group such as '.aYQbCq_badge:focus-visible,.aYQbCq_iconButton:focus-visible{..}'
// adds 2 to the focus-visible column, which is exactly what a deletion removes.
export function stateCountsOf(cssText) {
  const per = {};
  const totals = {};
  for (const s of STATE_ORDER) { totals[s] = 0; }
  for (const block of cssText.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const raw of block[1].split(',')) {
      const sel = raw.trim();
      const state = STATE_ORDER.find((s) => sel.includes(s));
      if (state === undefined) { continue; }
      for (const m of sel.matchAll(/\.(aYQbCq_[A-Za-z0-9_-]*)/g)) {
        if (per[m[1]] === undefined) { per[m[1]] = {}; for (const s of STATE_ORDER) { per[m[1]][s] = 0; } }
        per[m[1]][state] += 1;
        totals[state] += 1;
      }
    }
  }
  return { per, totals };
}

export function stateFloorBreaks(totals, floors = STATE_FLOORS) {
  return STATE_ORDER.filter((s) => (totals[s] || 0) < floors[s]).map((s) => s + ' ' + (totals[s] || 0) + ' < ' + floors[s]);
}

// M-FOCUS reproduces the vong-7 mutation: drop one rule group whose selectors are
// ALL :focus-visible. Pure string surgery, never touches the file on disk.
export function removeFocusGroup(cssText) {
  for (const m of cssText.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim()).filter((s) => s !== '');
    if (selectors.length < 2) { continue; }
    if (!selectors.every((s) => s.includes(':focus-visible'))) { continue; }
    const text = cssText.slice(0, m.index) + cssText.slice(m.index + m[0].length);
    return { text, removed: selectors.length, delta: Buffer.byteLength(cssText) - Buffer.byteLength(text) };
  }
  return { text: cssText, removed: 0, delta: 0 };
}

export function removePlanSaveDisabled(cssText) {
  const text = cssText.replace(/\.aYQbCq_planSave:disabled\{[^}]*\}/g, '');
  return { text, delta: Buffer.byteLength(cssText) - Buffer.byteLength(text) };
}

const cssText = fs.readFileSync(CSS, 'utf8');
const importers = importersOf(CLIENT);
const bundleText = fs.readFileSync(BUNDLE, 'utf8');
const a = analyze(cssText, importers, bundleText);
const planSaveRule = /\.aYQbCq_planSave:disabled\{[^}]*\}/.exec(cssText);

check('css bytes >= ' + CSS_BYTES_MIN, Buffer.byteLength(cssText) >= CSS_BYTES_MIN, Buffer.byteLength(cssText) + ' B');
check('prefixed classes >= ' + CLASS_MIN, a.classes.length >= CLASS_MIN, a.classes.length + ' classes');
check('every importer of ' + CSS_MODULE + ' is scanned', Object.keys(a.byFile).length >= 3, Object.keys(a.byFile).map((f) => f + ':' + a.byFile[f].length).join(' '));
check('distinct css.* keys >= ' + KEY_MIN, a.keys.length >= KEY_MIN, a.keys.length + ' keys (' + a.slots + ' usage slots across ' + Object.keys(a.byFile).length + ' files; membersToggle is used by 2 so slots run 1 higher)');
check('every css.* key of every importer is defined in the module css', a.missing.length === 0, a.missing.length ? 'missing: ' + a.missing.join(' ') : 'missing: none');
check('mapping keys >= 180', Object.keys(a.mapping).length >= 180, Object.keys(a.mapping).length + ' mapping keys');
check('archivedWrap (fork-only key) is defined', a.mapping.archivedWrap === 'aYQbCq_archivedWrap', String(a.mapping.archivedWrap));
check('planSave (add-member submit) is defined with a disabled state', a.mapping.planSave === 'aYQbCq_planSave' && planSaveRule !== null, String(a.mapping.planSave) + (planSaveRule ? ' + .aYQbCq_planSave:disabled' : ' MISSING :disabled'));
check('bundle carries the restored CSS (>= ' + BUNDLE_CSS_MIN + ' B)', a.bundleCssBytes >= BUNDLE_CSS_MIN, a.bundleCssBytes + ' B in ' + a.literals + ' literals');
check('bundle keeps ' + INJECT_BLOCKS + ' style injection blocks', a.injections === INJECT_BLOCKS, a.injections + ' blocks');
check('bundle has the restored classes aYQbCq_archivedWrap + aYQbCq_planSave', bundleText.includes('aYQbCq_archivedWrap') && bundleText.includes('aYQbCq_planSave'));
check('no literal undefined class leaked into css', !/\.[A-Za-z0-9_-]*undefined/.test(cssText));

// t70 stateFloor: print the measured table (class x 4 state variants) and lock
// the column totals as floors. Without this, deleting a styled state is silent.
const st = stateCountsOf(cssText);
const stateRows = Object.keys(st.per).filter((c) => STATE_ORDER.some((s) => st.per[c][s] > 0)).sort();
console.log('');
console.log('# stateFloor — class | ' + STATE_ORDER.join(' | '));
for (const c of stateRows) { console.log('#   ' + c + ' | ' + STATE_ORDER.map((s) => st.per[c][s]).join(' | ')); }
console.log('#   TOTAL | ' + STATE_ORDER.map((s) => st.totals[s]).join(' | '));
console.log('#   FLOOR | ' + STATE_ORDER.map((s) => STATE_FLOORS[s]).join(' | '));
console.log('');
check('stateFloor measured at least one rule slot per state variant', STATE_ORDER.every((s) => st.totals[s] > 0), stateRows.length + ' classes; ' + STATE_ORDER.map((s) => s + '=' + st.totals[s]).join(' '));
for (const s of STATE_ORDER) {
  check('state floor ' + s + ' >= ' + STATE_FLOORS[s], st.totals[s] >= STATE_FLOORS[s], st.totals[s] + ' rule slots');
}
check('no state variant column falls under its floor', stateFloorBreaks(st.totals).length === 0, stateFloorBreaks(st.totals).join(' ') || 'all 4 columns at or above floor');
check('css bytes >= ' + CSS_BYTES_EXACT_MIN, Buffer.byteLength(cssText) >= CSS_BYTES_EXACT_MIN, Buffer.byteLength(cssText) + ' B');
// M1: cut one class ActivityPanel.js really uses, the suite must notice.
const cutRule = new RegExp('\\.aYQbCq_taskDetail[^{]*{[^}]*}', 'g');
const cutCss = cssText.replace(cutRule, '');
const m1 = analyze(cutCss, importers, bundleText);
check('M1 removing one ActivityPanel class makes the key missing', cutCss !== cssText && m1.missing.includes('taskDetail'), m1.missing.join(' ') || 'none');
// M1b: cut the class only a secondary importer uses (the t67 regression).
const planSaveRuleRe = /\.aYQbCq_planSave(?![A-Za-z0-9_-])[^{}]*\{[^{}]*\}/g;
const cutPlan = cssText.replace(planSaveRuleRe, '');
const m1b = analyze(cutPlan, importers, bundleText);
check('M1b removing planSave makes MemberControls\' key missing', Buffer.byteLength(cssText) - Buffer.byteLength(cutPlan) > 0 && m1b.missing.includes('planSave'), 'applies: ' + (Buffer.byteLength(cssText) - Buffer.byteLength(cutPlan) > 0) + ', delta ' + (Buffer.byteLength(cssText) - Buffer.byteLength(cutPlan)) + ' B, missing: ' + (m1b.missing.join(' ') || 'none'));
// M2: halve the css, the class floor must trip.
const m2 = analyze(cssText.slice(0, 12000), importers, bundleText);
check('M2 truncated css falls under the class floor', m2.classes.length < CLASS_MIN, m2.classes.length + ' classes');
// M3: a bundle built without the css payloads must trip the size check.
const m3 = analyze(cssText, importers, bundleText.slice(0, 1000));
check('M3 bundle losing the css literals falls under the byte floor', m3.bundleCssBytes < BUNDLE_CSS_MIN, m3.bundleCssBytes + ' B');
// M4: the same analyser on the untouched text passes again (mutation was in memory).
check('M4 unmutated text still passes every floor', a.classes.length >= CLASS_MIN && a.missing.length === 0 && a.bundleCssBytes >= BUNDLE_CSS_MIN);
// M-FOCUS: the vong-7 mutation itself — a whole :focus-visible rule group gone.
const mFocus = removeFocusGroup(cssText);
const mFocusTotals = stateCountsOf(mFocus.text).totals;
const mFocusBreaks = stateFloorBreaks(mFocusTotals);
check('M-FOCUS deleting one :focus-visible rule group trips the focus floor', mFocus.delta > 0 && mFocusBreaks.some((b) => b.startsWith(':focus-visible')), 'applies: ' + (mFocus.delta > 0) + ', removed ' + mFocus.removed + ' selectors, delta ' + mFocus.delta + ' B, focus-visible ' + st.totals[':focus-visible'] + ' -> ' + mFocusTotals[':focus-visible']);
// M-DISABLED: only the planSave disabled rule goes away.
const mDisabled = removePlanSaveDisabled(cssText);
const mDisabledTotals = stateCountsOf(mDisabled.text).totals;
const mDisabledBreaks = stateFloorBreaks(mDisabledTotals);
check('M-DISABLED deleting .aYQbCq_planSave:disabled trips the disabled floor', mDisabled.delta > 0 && mDisabledBreaks.some((b) => b.startsWith(':disabled')), 'applies: ' + (mDisabled.delta > 0) + ', delta ' + mDisabled.delta + ' B, disabled ' + st.totals[':disabled'] + ' -> ' + mDisabledTotals[':disabled']);
// M-FLOOR: the untouched text still clears every state floor.
check('M-FLOOR unmutated text clears every state floor', stateFloorBreaks(st.totals).length === 0 && st.totals[':focus-visible'] === STATE_FLOORS[':focus-visible'], STATE_ORDER.map((s) => s + '=' + st.totals[s] + '/' + STATE_FLOORS[s]).join(' '));

console.log('');
console.log('# ' + (total - failed) + '/' + total + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);