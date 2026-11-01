#!/usr/bin/env node
/**
 * t56 declarations-vs-JS parity suite (shipped harness — lives in tests/).
 *
 *   node tests/t56-types-fallback.mjs
 *
 * t54 widened three exports in lib/members.js (`isFallbackFailureCode(code,
 * message)`, `selectFallbackRoute(..., failureMessage)`, and the new
 * `recordAutoFallback`) while lib/types/members.d.ts kept the old signatures.
 * There is no tsconfig.json in this repo, so the suite carries two layers:
 *
 *   1. TEXT parity (d1..d17): the declaration text is compared with the real
 *      `export function`/`export const` lines, so a signature, a parameter
 *      order, or a value can never drift silently. `KNOWN_UNDECLARED` is empty.
 *   2. A REAL COMPILE (d18..d20): the package's own tsc (5.9.x, resolved from
 *      this suite's location) compiles every `lib/types/*.d.ts` with
 *      `--noEmit --skipLibCheck --target es2022 --module esnext
 *      --moduleResolution bundler` and the suite requires exit 0. A missing
 *      compiler fails the suite unless `AGENT_TEAMS_ALLOW_NO_TSC=1` downgrades
 *      it to a reported warning.
 *
 * Negative controls: d9/d17 re-run the text analysis on reverted or invented
 * copies, and d19 re-runs the COMPILE on a mutated copy plus a consumer file and
 * requires tsc to exit non-zero. A green run therefore proves both checkers can
 * actually fail.
 * Limitation left standing: `--skipLibCheck` suppresses diagnostics raised
 * INSIDE a declaration file, so the compile gate proves the declarations parse,
 * bind, and type-check where they are consumed — not that every type inside
 * every .d.ts is internally consistent. Runtime behaviour is out of scope for
 * both layers.
 */
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// <repo>/tests/ -> <repo>/packages/dsh-agent-teams/lib
const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'dsh-agent-teams', 'lib');
const TYPES_DIR = join(LIB, 'types');
const DTS_PATH = join(TYPES_DIR, 'members.d.ts');
const JS_PATH = join(LIB, 'members.js');
// Everything the compile gate needs is derived from this suite's own location, so
// the same command works in any checkout — no absolute path is ever written down.
const PKG_DIR = join(LIB, '..');
const REPO_ROOT = join(PKG_DIR, '..', '..');
const TSC_ENTRY = join(PKG_DIR, 'node_modules', 'typescript', 'lib', 'tsc.js');
const TSC_MANIFEST = join(PKG_DIR, 'node_modules', 'typescript', 'package.json');
/** The exact flags the compile gate is contracted to use. */
const TSC_FLAGS = ['--noEmit', '--skipLibCheck', '--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler'];

const dtsText = await readFile(DTS_PATH, 'utf8');
const jsText = await readFile(JS_PATH, 'utf8');
const membersMod = await import(pathToFileURL(JS_PATH).href);

/** Split a parameter list on top-level commas only. */
function splitParams(source) {
    const parts = [];
    let depth = 0;
    let current = '';
    for (const char of source) {
        if (char === '{' || char === '(' || char === '[')
            depth += 1;
        else if (char === '}' || char === ')' || char === ']')
            depth -= 1;
        if (char === ',' && depth === 0) {
            parts.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim() !== '')
        parts.push(current);
    return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/** Extract the parenthesised parameter list that follows `open` in `text`. */
function paramList(text, open) {
    const start = text.indexOf(open);
    if (start < 0)
        return undefined;
    let depth = 0;
    for (let index = start + open.length - 1; index < text.length; index += 1) {
        const char = text[index];
        if (char === '(')
            depth += 1;
        else if (char === ')') {
            depth -= 1;
            if (depth === 0)
                return text.slice(start + open.length, index);
        }
    }
    return undefined;
}

/** A JS declaration's parameters, as written in lib/members.js. */
function jsParams(text, name) {
    for (const prefix of ['export async function ', 'export function ']) {
        const open = prefix + name + '(';
        if (!text.includes(open))
            continue;
        const list = paramList(text, open);
        assert.ok(list !== undefined, `unterminated parameter list for ${name}`);
        return splitParams(list).map((part) => {
            const match = /^(\w+)/.exec(part);
            assert.ok(match !== null, `cannot read a parameter name from "${part}" in ${name}`);
            return match[1];
        });
    }
    return undefined;
}

/** A .d.ts declaration's parameters with their optionality. */
function dtsParams(text, name) {
    const open = 'export declare function ' + name + '(';
    const list = paramList(text, open);
    if (list === undefined)
        return undefined;
    return splitParams(list).map((part) => {
        const match = /^(\w+)(\?)?\s*:/.exec(part);
        assert.ok(match !== null, `cannot parse declaration parameter "${part}" of ${name}`);
        return { name: match[1], optional: match[2] === '?' };
    });
}

/** Every `export declare function|const|class NAME` in a .d.ts text. */
const declaredNames = (text) => [...text.matchAll(/export declare (?:function|const|class) (\w+)/g)].map((match) => match[1]);

/** Every value export actually present in lib/members.js. */
const jsExportNames = (text) => new Set([
    ...[...text.matchAll(/export (?:async )?function (\w+)/g)].map((match) => match[1]),
    ...[...text.matchAll(/export const (\w+)/g)].map((match) => match[1]),
    ...[...text.matchAll(/export class (\w+)/g)].map((match) => match[1]),
]);

/**
 * Known, deliberate drift. t81 declared the last three names
 * (`MEMBER_ROLE_MAX`, `MEMBER_EXECUTION_PROMPT_MAX`, `setMemberProfile`), so this
 * list is EMPTY: every value export of lib/members.js must now be declared, and a
 * new undeclared export fails instead of hiding behind an allow-list. Do not add
 * names back — an undeclared export is exactly the drift this suite catches.
 */
const KNOWN_UNDECLARED = [];

/**
 * Compare a declaration text against the JS text. Returns a list of problems;
 * empty means the two agree about the trioT54 exports.
 * @param dts - the .d.ts source.
 * @param js - the lib/members.js source.
 */
function drift(dts, js) {
    const problems = [];
    for (const name of ['isFallbackFailureCode', 'selectFallbackRoute', 'recordAutoFallback']) {
        const declared = dtsParams(dts, name);
        const actual = jsParams(js, name);
        if (declared === undefined)
            problems.push(`${name} is not declared in members.d.ts`);
        if (actual === undefined)
            problems.push(`${name} is not exported by members.js`);
        if (declared === undefined || actual === undefined)
            continue;
        if (declared.length !== actual.length)
            problems.push(`${name}: declared ${declared.length} parameter(s), JavaScript takes ${actual.length}`);
        const declaredNamesLocal = declared.slice(0, actual.length).map((param) => param.name);
        const expectedNames = actual.slice(0, declaredNamesLocal.length);
        if (declaredNamesLocal.join(',') !== expectedNames.join(','))
            problems.push(`${name}: declared parameters (${declaredNamesLocal.join(', ')}) do not match JavaScript (${actual.join(', ')})`);
    }
    const exported = jsExportNames(js);
    for (const name of declaredNames(dts)) {
        if (!exported.has(name))
            problems.push(`members.d.ts declares ${name}, which members.js does not export`);
    }
    const undeclared = [...exported].filter((name) => !declaredNames(dts).includes(name)).sort();
    if (undeclared.join(',') !== KNOWN_UNDECLARED.join(','))
        problems.push(`undeclared exports drifted: [${undeclared.join(', ')}] (expected the pinned list [${KNOWN_UNDECLARED.join(', ')}])`);
    return problems;
}

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

test('d1 isFallbackFailureCode takes (code, message?) in the declarations', async () => {
    const params = dtsParams(dtsText, 'isFallbackFailureCode');
    assert.deepEqual(params, [{ name: 'code', optional: false }, { name: 'message', optional: true }]);
    assert.ok(!dtsText.includes('isFallbackFailureCode(code: string): boolean'), 'the old one-parameter declaration is still there');
});

test('d2 selectFallbackRoute takes five parameters, only the message optional', async () => {
    const params = dtsParams(dtsText, 'selectFallbackRoute');
    assert.deepEqual(params, [
        { name: 'current', optional: false },
        { name: 'fallback', optional: false },
        { name: 'failureCode', optional: false },
        { name: 'alreadySwitched', optional: false },
        { name: 'failureMessage', optional: true },
    ]);
    assert.ok(!dtsText.includes('alreadySwitched: boolean): {'), 'the old four-parameter declaration is still there');
});

test('d3 recordAutoFallback is declared as (ctx, request) => Promise<boolean>', async () => {
    const params = dtsParams(dtsText, 'recordAutoFallback');
    assert.deepEqual(params, [{ name: 'ctx', optional: false }, { name: 'request', optional: false }]);
    const line = /export declare function recordAutoFallback\(([\s\S]*?)\): (Promise<[^;]+>);/.exec(dtsText);
    assert.ok(line !== null, 'recordAutoFallback declaration not found in the expected shape');
    assert.equal(line[2], 'Promise<boolean>');
});

test('d4 every request field the implementation reads is declared', async () => {
    const start = jsText.indexOf('export async function recordAutoFallback(');
    assert.ok(start > 0, 'implementation not found');
    const end = jsText.indexOf('\n}\n', start);
    const body = jsText.slice(start, end);
    const used = [...new Set([...body.matchAll(/request\.(\w+)/g)].map((match) => match[1]))].sort();
    assert.ok(used.length >= 5, `expected the implementation to read several request fields, saw [${used.join(', ')}]`);
    const typeStart = dtsText.indexOf('export type MemberAutoFallbackRequest = {');
    assert.ok(typeStart > 0, 'MemberAutoFallbackRequest is not declared');
    const typeBody = dtsText.slice(typeStart, dtsText.indexOf('\n};', typeStart));
    const declared = new Set([...typeBody.matchAll(/readonly (\w+)\??:/g)].map((match) => match[1]));
    for (const field of used) {
        assert.ok(declared.has(field), `recordAutoFallback reads request.${field}, which the declaration omits`);
    }
});

test('d5 declared parameter names match the JavaScript for all three exports', async () => {
    assert.deepEqual(drift(dtsText, jsText), []);
});

test('d6 runtime arity matches the declared parameter count', async () => {
    for (const name of ['isFallbackFailureCode', 'selectFallbackRoute', 'recordAutoFallback']) {
        assert.equal(typeof membersMod[name], 'function', `${name} is not exported at runtime`);
        assert.equal(membersMod[name].length, dtsParams(dtsText, name).length, `${name} arity`);
    }
});

test('d7 the optional message really is optional at runtime', async () => {
    assert.equal(membersMod.isFallbackFailureCode('QUOTA'), true);
    assert.equal(membersMod.isFallbackFailureCode('INVALID_REQUEST'), false);
    assert.equal(membersMod.isFallbackFailureCode('INVALID_REQUEST', 'Model is unavailable.'), true);
    const route = { provider: 'p1', model: 'm1' };
    const fallback = { provider: 'p2', model: 'm3' };
    assert.equal(membersMod.selectFallbackRoute(route, fallback, 'QUOTA', false).retry, true);
    assert.equal(membersMod.selectFallbackRoute(route, fallback, 'INVALID_REQUEST', false).retry, false);
});

test('d8 every declared export exists in lib/members.js', async () => {
    const exported = jsExportNames(jsText);
    const missing = declaredNames(dtsText).filter((name) => !exported.has(name));
    assert.deepEqual(missing, []);
});

test('d9 the drift suite fails on a reverted declaration set (negative control)', async () => {
    const reverted = dtsText
        .replace('export declare function isFallbackFailureCode(code: string, message?: string): boolean;', 'export declare function isFallbackFailureCode(code: string): boolean;')
        .replace('alreadySwitched: boolean, failureMessage?: string): {', 'alreadySwitched: boolean): {')
        .replace(/export declare function recordAutoFallback\(ctx: Context, request: MemberAutoFallbackRequest\): Promise<boolean>;/, '');
    assert.notEqual(reverted, dtsText, 'the reverting replacement did nothing — the declarations moved');
    const problems = drift(reverted, jsText);
    assert.ok(problems.some((problem) => problem.includes('isFallbackFailureCode: declared 1 parameter')), JSON.stringify(problems));
    assert.ok(problems.some((problem) => problem.includes('selectFallbackRoute: declared 4 parameter')), JSON.stringify(problems));
    assert.ok(problems.some((problem) => problem.includes('recordAutoFallback is not declared')), JSON.stringify(problems));
});

test('d10 the shipped declarations produce a clean analysis', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't56-'));
    try {
        await writeFile(join(workspace, 'members.d.ts'), dtsText, 'utf8');
        const reread = await readFile(join(workspace, 'members.d.ts'), 'utf8');
        assert.deepEqual(drift(reread, jsText), []);
    }
    finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

test('d11 recordAutoFallback is callable and reports false without a team', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 't56-call-'));
    try {
        const warnings = [];
        const changed = await membersMod.recordAutoFallback({ logger: { warn: (message) => warnings.push(String(message)), debug() {}, info() {}, error() {} } }, {
            stateRoot: join(workspace, '.agent-teams'),
            teamId: 'no-such-team',
            memberName: 'alice',
            previous: { provider: 'p1', model: 'm1' },
            fallback: { provider: 'p2', model: 'm3' },
            workspace,
            by: 'sess-child',
        });
        assert.equal(changed, false);
        assert.deepEqual(warnings, []);
    }
    finally {
        await rm(workspace, { recursive: true, force: true });
    }
});

test('d12 the file has no duplicate declaration names', async () => {
    const names = declaredNames(dtsText);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    assert.deepEqual(duplicates, []);
});

/** The doc comment that sits directly above one declaration. */
function declarationComment(text, declaration) {
    const at = text.indexOf(declaration);
    assert.ok(at > 0, `${declaration} is not in the declarations`);
    const start = text.lastIndexOf('/**', at);
    assert.ok(start >= 0, `${declaration} has no doc comment above it`);
    return text.slice(start, at);
}

/** 1-based line number of `export const NAME = …` in lib/members.js. */
function jsConstLine(text, name) {
    const index = text.split('\n').findIndex((line) => new RegExp(`^export const ${name} = `).test(line));
    assert.ok(index >= 0, `members.js does not export const ${name}`);
    return index + 1;
}

test('d13 MEMBER_ROLE_MAX is declared as a number carrying the real JavaScript value', async () => {
    const declaration = 'export declare const MEMBER_ROLE_MAX: number;';
    assert.ok(dtsText.includes(declaration), 'MEMBER_ROLE_MAX is not declared as a number');
    assert.equal(membersMod.MEMBER_ROLE_MAX, 200, 'the role cap moved; the declaration comment and this suite move with it');
    const line = jsConstLine(jsText, 'MEMBER_ROLE_MAX');
    const comment = declarationComment(dtsText, declaration);
    assert.ok(comment.includes(`lib/members.js:${line}`), `the comment does not name lib/members.js:${line}`);
    assert.ok(comment.includes('= 200'), 'the comment does not state the value 200');
});

test('d14 MEMBER_EXECUTION_PROMPT_MAX is declared as a number carrying the real JavaScript value', async () => {
    const declaration = 'export declare const MEMBER_EXECUTION_PROMPT_MAX: number;';
    assert.ok(dtsText.includes(declaration), 'MEMBER_EXECUTION_PROMPT_MAX is not declared as a number');
    assert.equal(membersMod.MEMBER_EXECUTION_PROMPT_MAX, 4000, 'the execution-prompt cap moved; this suite moves with it');
    const line = jsConstLine(jsText, 'MEMBER_EXECUTION_PROMPT_MAX');
    const comment = declarationComment(dtsText, declaration);
    assert.ok(comment.includes(`lib/members.js:${line}`), `the comment does not name lib/members.js:${line}`);
    assert.ok(comment.includes('= 4000'), 'the comment does not state the value 4000');
});

test('d15 setMemberProfile is declared with the eight JavaScript parameters', async () => {
    const names = ['ctx', 'config', 'captain', 'stateDir', 'teamId', 'memberName', 'request', 'signal'];
    const actual = jsParams(jsText, 'setMemberProfile');
    assert.deepEqual(actual, names, 'the implementation signature moved');
    const declared = dtsParams(dtsText, 'setMemberProfile');
    assert.ok(declared !== undefined, 'setMemberProfile is not declared in members.d.ts');
    assert.deepEqual(declared.map((param) => param.name), names);
    assert.deepEqual(declared.map((param) => param.optional), [false, false, false, false, false, false, false, true]);
    assert.equal(typeof membersMod.setMemberProfile, 'function', 'setMemberProfile is not exported at runtime');
    assert.equal(membersMod.setMemberProfile.length, 8, 'setMemberProfile arity');
    const line = /export declare function setMemberProfile\(([\s\S]*?)\): (Promise<[^;]+>);/.exec(dtsText);
    assert.ok(line !== null, 'setMemberProfile declaration not found in the expected shape');
    assert.equal(line[2], 'Promise<MemberProfileChangeResult>');
});

test('d16 every request field setMemberProfile reads is declared on its request type', async () => {
    const start = jsText.indexOf('export async function setMemberProfile(');
    assert.ok(start > 0, 'implementation not found');
    const end = jsText.indexOf('\n}\n', start);
    const body = jsText.slice(start, end);
    const used = [...new Set([...body.matchAll(/request\.(\w+)/g)].map((match) => match[1]))].sort();
    assert.deepEqual(used, ['by', 'executionPrompt', 'role', 'source']);
    const typeStart = dtsText.indexOf('export interface MemberProfileChangeRequest {');
    assert.ok(typeStart > 0, 'MemberProfileChangeRequest is not declared');
    const typeBody = dtsText.slice(typeStart, dtsText.indexOf('\n}', typeStart));
    const fields = new Set([...typeBody.matchAll(/readonly (\w+)\??:/g)].map((match) => match[1]));
    for (const field of used) {
        assert.ok(fields.has(field), `setMemberProfile reads request.${field}, which the declaration omits`);
    }
    assert.ok(dtsText.includes('export interface MemberProfileChangeResult {'), 'MemberProfileChangeResult is not declared');
});

test('d17 the empty allow-list still blocks a new undeclared export (negative control)', async () => {
    assert.deepEqual(KNOWN_UNDECLARED, [], 'the allow-list must stay empty');
    const invented = jsText + '\nexport const T56_INVENTED_EXPORT = 1;\n';
    const inventedProblems = drift(dtsText, invented);
    assert.ok(inventedProblems.some((problem) => problem.includes('undeclared exports drifted') && problem.includes('T56_INVENTED_EXPORT')), JSON.stringify(inventedProblems));
    const dropped = dtsText.replace('export declare const MEMBER_ROLE_MAX: number;', '');
    assert.notEqual(dropped, dtsText, 'the removing replacement did nothing — the declaration moved');
    const droppedProblems = drift(dropped, jsText);
    assert.ok(droppedProblems.some((problem) => problem.includes('undeclared exports drifted') && problem.includes('MEMBER_ROLE_MAX')), JSON.stringify(droppedProblems));
});

/**
 * Every shipped declaration file, sorted. The compile gate covers the flat
 * `lib/types/*.d.ts` set (21 files today), which is what the package ships.
 */
async function typeFiles() {
    const names = (await readdir(TYPES_DIR)).filter((name) => name.endsWith('.d.ts')).sort();
    assert.ok(names.length > 0, 'no declaration files were found');
    return { names, files: names.map((name) => join(TYPES_DIR, name)) };
}

/**
 * Resolve the package's own TypeScript install. The path is derived from this
 * suite's location, never hardcoded, so a checkout without node_modules fails
 * loudly instead of silently skipping the gate.
 */
async function locateTsc() {
    try {
        const manifest = JSON.parse(await readFile(TSC_MANIFEST, 'utf8'));
        await readFile(TSC_ENTRY);
        return { path: TSC_ENTRY, version: String(manifest.version ?? 'unknown') };
    }
    catch {
        return undefined;
    }
}

/** Run the repo-local tsc over `files`. Never throws: the caller asserts on status. */
function runTsc(tscPath, files, cwd = REPO_ROOT) {
    try {
        const stdout = execFileSync(process.execPath, [tscPath, ...TSC_FLAGS, ...files], {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { status: 0, output: String(stdout ?? '') };
    }
    catch (error) {
        const output = String(error.stdout ?? '') + String(error.stderr ?? '');
        return { status: typeof error.status === 'number' ? error.status : -1, output };
    }
}

/**
 * The declaration compile gate. `lookup` is injectable so the "tsc is missing"
 * branch is exercised for real instead of being asserted from a comment.
 *
 * A missing compiler FAILS the gate. Downgrading that to a warning is possible
 * only through `AGENT_TEAMS_ALLOW_NO_TSC=1`, and even then the result reports
 * itself as skipped — a silent skip is the exact failure this gate exists to
 * prevent.
 */
async function runCompileGate({ lookup = locateTsc } = {}) {
    const tsc = await lookup();
    if (tsc === undefined) {
        const allow = process.env.AGENT_TEAMS_ALLOW_NO_TSC === '1';
        const reason = 'typescript was not found at packages/dsh-agent-teams/node_modules/typescript, so the declaration compile gate cannot run';
        console.log(`${allow ? 'WARN' : 'FATAL'} ${reason}${allow ? ' (AGENT_TEAMS_ALLOW_NO_TSC=1: gate SKIPPED as a warning, never a pass)' : ' (set AGENT_TEAMS_ALLOW_NO_TSC=1 only to downgrade this to a warning)'}`);
        return { ok: allow, skipped: allow, files: 0, version: undefined, output: '', reason };
    }
    const { names, files } = await typeFiles();
    const result = runTsc(tsc.path, files);
    console.log(`tsc=${tsc.version}`);
    console.log(`files=${names.length}`);
    return {
        ok: result.status === 0,
        skipped: false,
        files: names.length,
        version: tsc.version,
        output: result.output,
        reason: result.status === 0 ? '' : result.output,
    };
}

test('d18 the whole declaration set compiles with the repo-local tsc (real compile gate)', async () => {
    const gate = await runCompileGate();
    assert.equal(gate.skipped, false, `the compile gate was skipped: ${gate.reason}`);
    assert.ok(gate.version !== undefined, 'tsc version was not reported');
    assert.ok(gate.files >= 21, `expected at least the 21 shipped declaration files, saw ${gate.files}`);
    assert.equal(gate.ok, true, `tsc exited ${gate.ok ? 0 : 'non-zero'}:\n${gate.output}`);
});

test('d19 a mutated copy of the declarations fails the same compile (negative control)', async () => {
    const tsc = await locateTsc();
    assert.ok(tsc !== undefined, 'the negative control has no tsc to run');
    const { names } = await typeFiles();
    await mkdir(join(REPO_ROOT, 'tests', 'tmp'), { recursive: true });
    const dir = await mkdtemp(join(REPO_ROOT, 'tests', 'tmp', 't56-tsc-'));
    try {
        for (const name of names)
            await cp(join(TYPES_DIR, name), join(dir, name));
        const original = await readFile(join(dir, 'members.d.ts'), 'utf8');
        // The prefix must be unique: `captain: Agent, stateDir: string,` also appears
        // in setMemberRoute, and a first-match replace would mutate the wrong tool
        // while the consumer below still compiles.
        const mutated = original.replace('export declare function setMemberProfile(ctx: Context, config: MemberRuntimeConfig, captain: Agent, stateDir: string,', 'export declare function setMemberProfile(ctx: Context, config: MemberRuntimeConfig, captain: Agent, stateDir: number,');
        assert.notEqual(mutated, original, 'the mutation did not apply — the signature moved');
        assert.ok(mutated.includes('captain: Agent, stateDir: number,'), 'the mutation landed somewhere else');
        const before = original.split('\n');
        const after = mutated.split('\n');
        const deltaLines = before.filter((line, index) => line !== after[index]).length;
        console.log(`applies=1 delta_lines=${deltaLines}`);
        await writeFile(join(dir, 'members.d.ts'), mutated, 'utf8');
        // --skipLibCheck suppresses diagnostics INSIDE a declaration file, so a
        // mutated .d.ts alone still exits 0. A one-file consumer is what turns the
        // mutation into a real type error the compiler has to report.
        await writeFile(join(dir, 'consumer.ts'), [
            "import { setMemberProfile } from './members.js';",
            'declare const ctx: Parameters<typeof setMemberProfile>[0];',
            'declare const config: Parameters<typeof setMemberProfile>[1];',
            'declare const captain: Parameters<typeof setMemberProfile>[2];',
            "export const call = () => setMemberProfile(ctx, config, captain, 'state-dir', 'team', 'member', {});",
            '',
        ].join('\n'), 'utf8');
        const result = runTsc(tsc.path, [...names.map((name) => join(dir, name)), join(dir, 'consumer.ts')]);
        assert.notEqual(result.status, 0, 'the mutated declarations still compiled — this gate cannot fail');
        assert.ok(result.output.includes('TS2345'), `expected TS2345 from the mutated copy:\n${result.output}`);
        assert.ok(result.output.includes('consumer.ts'), `expected the failure to point at the consumer:\n${result.output}`);
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test('d20 a missing tsc fails the gate, and only AGENT_TEAMS_ALLOW_NO_TSC=1 downgrades it', async () => {
    const missing = async () => undefined;
    const strict = await runCompileGate({ lookup: missing });
    assert.equal(strict.ok, false, 'a missing compiler must fail the gate');
    assert.equal(strict.skipped, false, 'a missing compiler must not report itself as skipped by default');
    assert.ok(strict.reason.includes('typescript was not found'), strict.reason);
    const saved = process.env.AGENT_TEAMS_ALLOW_NO_TSC;
    process.env.AGENT_TEAMS_ALLOW_NO_TSC = '1';
    try {
        const lenient = await runCompileGate({ lookup: missing });
        assert.equal(lenient.ok, true, 'the documented escape hatch must downgrade the gate to a warning');
        assert.equal(lenient.skipped, true, 'the downgraded gate must report itself as skipped');
    }
    finally {
        if (saved === undefined)
            delete process.env.AGENT_TEAMS_ALLOW_NO_TSC;
        else
            process.env.AGENT_TEAMS_ALLOW_NO_TSC = saved;
    }
});

// The allow-list itself is evidence: the empty list is what t81 delivered.
console.log(`KNOWN_UNDECLARED=[${KNOWN_UNDECLARED.join(', ')}]`);
const results = [];
for (const item of cases) {
    try {
        await item.fn();
        results.push(true);
        console.log(`ok ${results.length} ${item.name}`);
    }
    catch (error) {
        results.push(false);
        console.log(`not ok ${results.length} ${item.name}`);
        console.log(`  ${error instanceof Error ? error.message : String(error)}`);
    }
}
const failed = results.filter((ok) => !ok).length;
console.log(`# ${results.length - failed}/${results.length} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
