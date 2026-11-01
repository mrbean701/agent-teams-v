#!/usr/bin/env node
/**
 * t57 — the panel's session gate, locked by machine.
 *
 * Why: the user reported "I cannot see the two controls in the panel" and the answer
 * was two independent causes — the desktop profile still loads @nanmicoder/dsh-agent-teams
 * 0.1.28 (a bundle with no route/add-member control at all), and the panel only lists
 * teams whose captainSessionId equals the CURRENTLY SELECTED session
 * (packages/dsh-agent-teams/lib/client/ActivityPanel.js:642-647). This suite turns both
 * facts into assertions that fail when the code changes.
 *
 * Nature of the gate cases: they do NOT re-implement the filter. They slice the real
 * expression out of ActivityPanel.js (the visibleTeams useMemo body), turn it into a
 * function with the same two free variables, and run it on fixtures. M1/M2 then mutate
 * that same slice in memory and show the derived function follows the mutation, so a
 * future edit that drops the captainSessionId filter fails here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PKG = fileURLToPath(new URL('../packages/dsh-agent-teams/', import.meta.url));
const panelSrc = readFileSync(PKG + 'lib/client/ActivityPanel.js', 'utf8');
const controlsSrc = readFileSync(PKG + 'lib/client/MemberControls.js', 'utf8');
const localesSrc = readFileSync(PKG + 'lib/client/locales.js', 'utf8');
const bundleSrc = readFileSync(PKG + 'lib/client.js', 'utf8');

const GATE_ANCHOR = 'const visibleTeams = useMemo(';
const GATE_DEPS = ', [teams, current]);';

/** Slice the real visibleTeams body out of the panel source and close over (current, teams). */
function deriveGate(src) {
    const at = src.indexOf(GATE_ANCHOR);
    if (at < 0) throw new Error('ActivityPanel.js: visibleTeams useMemo no longer exists');
    const tail = src.slice(at + GATE_ANCHOR.length);
    const end = tail.indexOf(GATE_DEPS);
    if (end < 0) throw new Error('ActivityPanel.js: visibleTeams dependency list [teams, current] no longer exists');
    const body = tail.slice(0, end).trim();
    const rewritten = body.replace(/\(\)\s*=>/, '(current, teams) =>');
    if (rewritten === body) throw new Error('ActivityPanel.js: visibleTeams body is no longer a zero-argument arrow function');
    return new Function('current', 'teams', 'return (' + rewritten + ')(current, teams);');
}

const gate = deriveGate(panelSrc);

// Fixtures. Two teams share one captain session; two belong to other sessions.
const A = { teamId: 't-a', captainSessionId: 'sess-1' };
const B = { teamId: 't-b', captainSessionId: 'sess-1' };
const C = { teamId: 't-c', captainSessionId: 'sess-2' };
const D = { teamId: 't-d', captainSessionId: 'sess-3' };
const ids = (rows) => rows.map((row) => row.teamId).join(',');

let passed = 0;
const failures = [];
function check(id, label, ok, detail) {
    if (ok) { passed += 1; console.log('PASS ' + id + ' ' + label + (detail === undefined ? '' : ' | ' + detail)); }
    else { failures.push(id); console.log('FAIL ' + id + ' ' + label + (detail === undefined ? '' : ' | ' + detail)); }
}
function eq(id, label, actual, expected) {
    check(id, label, actual === expected, 'got ' + JSON.stringify(actual) + ' want ' + JSON.stringify(expected));
}

// ---------------------------------------------------------------- gate: positive
eq('P1', 'current === captainSessionId shows the team', ids(gate('sess-1', [A])), 't-a');
eq('P2', 'every team of the current session shows, order preserved', ids(gate('sess-1', [A, B])), 't-a,t-b');
eq('P3', 'other sessions are dropped while the match survives', ids(gate('sess-1', [A, C, B, D])), 't-a,t-b');

// ---------------------------------------------------------------- gate: negative
eq('N1', 'different captainSessionId alone shows nothing', ids(gate('sess-2', [A, B])), '');
eq('N2', 'current undefined shows nothing even with live teams', ids(gate(undefined, [A, B, C])), '');
eq('N3', 'empty roster shows nothing', ids(gate('sess-1', [])), '');
// The gate is a strict undefined check, so an empty-string session is a real key:
const E = { teamId: 't-e', captainSessionId: '' };
eq('N4', 'empty-string current matches only an empty-string captainSessionId', ids(gate('', [A, E])), 't-e');

// ------------------------------------------------- derived-from-source proof (M)
const mutatedUndefined = panelSrc.replace('() => (current === undefined ? [] : teams.filter(', '() => (false ? [] : teams.filter(');
check('M1', 'mutation of the undefined guard is visible to the derived gate', mutatedUndefined !== panelSrc);
const gateM1 = deriveGate(mutatedUndefined);
const F = { teamId: 't-f', captainSessionId: undefined };
eq('M1b', 'mutated gate leaks a session-less team when current is undefined (real gate: N5)', ids(gateM1(undefined, [A, F])), 't-f');
eq('N5', 'the real gate drops a session-less team when current is undefined', ids(gate(undefined, [A, F])), '');
const mutatedFilter = panelSrc.replace('teams.filter((team) => team.captainSessionId === current)', 'teams.filter((team) => true)');
check('M2', 'mutation of the captainSessionId filter is visible to the derived gate', mutatedFilter !== panelSrc);
const gateM2 = deriveGate(mutatedFilter);
eq('M2b', 'mutated gate stops filtering by session', ids(gateM2('sess-1', [A, C, D])), 't-a,t-c,t-d');
eq('M2c', 'the real gate still filters the same fixtures', ids(gate('sess-1', [A, C, D])), 't-a');

// --------------------------------------------------- shipped bundle carries the controls
for (const marker of ['data-agent-teams-activity', 'data-member-route-control', 'data-add-member', 'set_member_route', 'add_member']) {
    check('B-' + marker, 'lib/client.js contains ' + marker, bundleSrc.includes(marker));
}
check('B-plan-url', 'lib/client.js contains the plugin /plan route', bundleSrc.includes('/plugins/dsh-agent-teams/plan'));

// --------------------------------------------------- source keeps the wiring, not just markup
check('S-route-action', "MemberControls.js posts action 'set_member_route'", controlsSrc.includes("action: 'set_member_route'"));
check('S-add-action', "MemberControls.js posts action 'add_member'", controlsSrc.includes("action: 'add_member'"));
check('S-route-injected', 'panel injects MemberRouteControl into the member row', panelSrc.includes('MemberRouteControl'));
check('S-add-injected', 'panel injects AddMemberControl', panelSrc.includes('AddMemberControl'));
check('S-panel-marker', 'panel renders data-agent-teams-activity', panelSrc.includes('"data-agent-teams-activity"'));

// --------------------------------------------------- the open-panel affordance exists in both locales
const count = (hay, needle) => hay.split(needle).length - 1;
for (const key of ['action.openActivityPanel', 'activity.panelButton', 'activity.title']) {
    eq('L-' + key, key + ' present in both shipped locales', count(localesSrc, "'" + key + "':"), 2);
}

// --------------------------------------------------- this suite stays relocatable
const selfSrc = readFileSync(fileURLToPath(import.meta.url), 'utf8');
check('R1', 'no absolute disk path in this suite', !/[A-Za-z]:\\Users\\|[A-Za-z]:\\Project\\/.test(selfSrc));
check('R2', 'paths resolve through import.meta.url', selfSrc.includes('import.meta.url'));

const total = passed + failures.length;
console.log('');
console.log('# ' + passed + '/' + total + ' passed, ' + failures.length + ' failed' + (failures.length === 0 ? '' : ' [' + failures.join(' ') + ']'));
process.exit(failures.length === 0 ? 0 : 1);
