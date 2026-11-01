#!/usr/bin/env node
/**
 * t44 — the type declarations must describe the revert flag that the code already has.
 *
 *   node tests/t44-types-clear.mjs
 *
 * Text-only on purpose: this is a .d.ts contract, and the acceptance is that the
 * declarations agree with the real behaviour in lib/members.js. So every claim is
 * read as text from the declaration files and cross-checked against regexes over
 * the implementation (no import: importing lib/members.js needs peer packages that
 * this repository does not install).
 *
 * Exit 0 = every case passed.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(here, '..', 'packages', 'dsh-agent-teams');
const typesDir = join(pluginDir, 'lib', 'types');
const read = (rel) => readFileSync(join(pluginDir, ...rel.split('/')), 'utf8');

const membersDts = read('lib/types/members.d.ts');
const typesDts = read('lib/types/types.d.ts');
const snapshotDts = read('lib/types/snapshot.d.ts');
const membersJs = read('lib/members.js');

/** Slice one "export interface X { ... }" body out of a declaration file. */
function blockAfter(text, marker) {
    const start = text.indexOf(marker);
    if (start === -1) return '';
    const end = text.indexOf('\n}', start);
    return end === -1 ? text.slice(start) : text.slice(start, end);
}

const requestBlock = blockAfter(membersDts, 'export interface MemberRouteChangeRequest {');
const resultBlock = blockAfter(membersDts, 'export interface MemberRouteChangeResult {');

/** The comment block that sits immediately above a declaration line. */
function commentAbove(text, needle, lines = 20) {
    const all = text.split('\n');
    const index = all.findIndex((line) => line.includes(needle));
    if (index === -1) return '';
    return all.slice(Math.max(0, index - lines), index + 1).join('\n');
}

const typesRouteNotes = commentAbove(typesDts, 'routeOverride?: TeamRouteOverride;', 25);
const snapshotRouteNotes = commentAbove(snapshotDts, 'readonly routeOverride?: TeamRouteOverride;', 20);

const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok, detail });

// ---------------------------------------------------- (a) the revert flag pair
check('a1: MemberRouteChangeRequest khai clear?: boolean',
    /clear\?: boolean;/u.test(requestBlock),
    requestBlock === '' ? 'KHONG tim thay interface MemberRouteChangeRequest' : 'thay: ' + (/clear\?: boolean;/u.exec(requestBlock)?.[0] ?? '(khong co)'));

check('a2: comment noi clear KHONG di kem provider/model/reasoningEffort (va bi tu choi neu tron)',
    /mutually exclusive/iu.test(requestBlock)
    && /provider/iu.test(requestBlock) && /model/iu.test(requestBlock) && /reasoningEffort/iu.test(requestBlock)
    && /rejected|refuse/iu.test(requestBlock),
    'mutually-exclusive=' + /mutually exclusive/iu.test(requestBlock) + ' rejected=' + /rejected|refuse/iu.test(requestBlock));

check('a3: MemberRouteChangeResult khai cleared?: boolean',
    /cleared\?: boolean;/u.test(resultBlock),
    resultBlock === '' ? 'KHONG tim thay interface MemberRouteChangeResult' : 'thay: ' + (/cleared\?: boolean;/u.exec(resultBlock)?.[0] ?? '(khong co)'));

check('a4: comment noi clear thi origin la declared',
    /declared/u.test(commentAbove(membersDts, 'readonly cleared?: boolean;', 6))
    || /declared/u.test(commentAbove(membersDts, 'readonly origin: string;', 8)),
    'origin-comment=' + JSON.stringify(commentAbove(membersDts, 'readonly origin: string;', 8).trim().slice(0, 160)));

// ---------------------------------------- (b) the four fields a revert deletes
const fourFields = ['routeOverride', 'fallbackActive', 'activeProvider', 'activeModel'];
check('b1: types.d.ts ghi ro clear XOA ca 4 truong routeOverride/fallbackActive/activeProvider/activeModel',
    /clear: true|route revert|revert/iu.test(typesRouteNotes)
    && fourFields.every((field) => typesRouteNotes.includes(field)),
    'thieu: ' + JSON.stringify(fourFields.filter((field) => typesRouteNotes.includes(field) === false)) + ' | ngu canh=' + JSON.stringify(typesRouteNotes.trim().slice(0, 200)));

check('b2: snapshot.d.ts cung ghi revert cho 4 truong cua snapshot',
    /revert|clear: true/iu.test(snapshotRouteNotes)
    && fourFields.filter((field) => snapshotRouteNotes.includes(field)).length >= 4,
    'khop=' + fourFields.filter((field) => snapshotRouteNotes.includes(field)).join(','));

// ---------------------------- (c) the declarations against the real behaviour
check('c1: lib/members.js that su co nhanh clear: request.clear === true + xoa du 4 truong',
    /request\.clear === true/u.test(membersJs)
    && fourFields.every((field) => new RegExp('delete member\\.' + field + ';', 'u').test(membersJs)),
    'request.clear=' + /request\.clear === true/u.test(membersJs)
    + ' delete=' + JSON.stringify(fourFields.map((field) => field + ':' + new RegExp('delete member\\.' + field + ';', 'u').test(membersJs))));

check('c2: lib/members.js tu choi tron clear voi route, va tra cleared + origin declared',
    /clear cannot be combined with provider, model, or reasoning effort/u.test(membersJs)
    && /\.\.\.clearing \? \{ cleared: true \}/u.test(membersJs)
    && /origin: clearing \? 'declared' : 'override'/u.test(membersJs),
    'throw=' + /clear cannot be combined/u.test(membersJs) + ' cleared=' + /\.\.\.clearing \? \{ cleared: true \}/u.test(membersJs)
    + ' origin=' + /origin: clearing \? 'declared' : 'override'/u.test(membersJs));

// ------------ (d) no declaration contradicts the code by demanding a route to clear
const dtsFiles = readdirSync(typesDir, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith('.d.ts'))
    .map((entry) => join(typesDir, entry));
const wrongClaim = /clear[^.\n]{0,90}require[sd]?\s+(?:a\s+)?provider|provider[^.\n]{0,60}required[^.\n]{0,60}clear/iu;
const offenders = dtsFiles.filter((file) => wrongClaim.test(readFileSync(file, 'utf8')));
check('d1: khong tep .d.ts nao tuyen bo "clear requires provider"',
    offenders.length === 0,
    offenders.length === 0 ? dtsFiles.length + ' tep .d.ts da quet, 0 tuyen bo sai' : 'pham: ' + offenders.join(', '));

check('d2: request giu provider/model tuy chon (clear khong can route)',
    /provider\?: string;/u.test(requestBlock) && /model\?: string;/u.test(requestBlock),
    'provider?=' + /provider\?: string;/u.test(requestBlock) + ' model?=' + /model\?: string;/u.test(requestBlock));

check('d3: 3 tep khai bao doc duoc, khong rong, con giu truong routeOverride',
    membersDts.length > 0 && typesDts.length > 0 && snapshotDts.length > 0
    && typesDts.includes('routeOverride?: TeamRouteOverride;') && snapshotDts.includes('readonly routeOverride?: TeamRouteOverride;'),
    'members=' + membersDts.length + 'B types=' + typesDts.length + 'B snapshot=' + snapshotDts.length + 'B');

const failed = checks.filter((item) => item.ok !== true);
for (const item of checks) {
    console.log((item.ok ? 'PASS  ' : 'FAIL  ') + item.id);
    console.log('      ' + item.detail);
}
console.log('');
console.log('# ' + (checks.length - failed.length) + '/' + checks.length + ' passed, ' + failed.length + ' failed');
process.exitCode = failed.length === 0 && checks.length >= 6 ? 0 : 1;
