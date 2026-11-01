#!/usr/bin/env node
/**
 * t77 declarations-vs-payload parity suite for captainRoute.
 *
 *   node tests/t77-types-captain-route.mjs
 *
 * t74 added captainRoute to the team snapshot payload (lib/snapshot.js) but
 * lib/types/snapshot.d.ts kept the old shape, so the hand-maintained type drifted
 * away from the object the panel actually receives. Nothing type-checks these
 * declarations in this repo (there is no tsconfig.json and no node_modules), so
 * this suite compares the declaration TEXT against the real implementation and,
 * separately, against the object assembleTeamSnapshot returns at runtime.
 *
 * Negative controls (n1..n5) re-run the same analysis on broken copies of the
 * declaration or the implementation and require each to be rejected, so a green
 * run proves the checker can actually fail.
 */
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// <repo>/tests/ -> <repo>/packages/dsh-agent-teams/lib
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(REPO, 'packages', 'dsh-agent-teams', 'lib');
const DTS_PATH = join(LIB, 'types', 'snapshot.d.ts');
const JS_PATH = join(LIB, 'snapshot.js');
const BUNDLE_PATH = join(LIB, 'client.js');

const dtsText = await readFile(DTS_PATH, 'utf8');
const jsText = await readFile(JS_PATH, 'utf8');
const bundleText = await readFile(BUNDLE_PATH, 'utf8');
const snapshotMod = await import(pathToFileURL(JS_PATH).href);

// ---------------------------------------------------------------------------
// Text helpers: brace matching, field extraction, implementation inspection.
// ---------------------------------------------------------------------------
/** The body of "export interface NAME {" (without the outer braces). */
function interfaceBlock(text, name) {
    const open = text.indexOf('export interface ' + name + ' {');
    if (open < 0)
        return undefined;
    const start = text.indexOf('{', open);
    let depth = 0;
    for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (char === '{')
            depth += 1;
        else if (char === '}') {
            depth -= 1;
            if (depth === 0)
                return text.slice(start + 1, index);
        }
    }
    return undefined;
}

/** Every "readonly name?: type" field of an interface body, in source order. */
function fieldsOf(body) {
    return [...body.matchAll(/(readonly\s+)?(\w+)(\?)?\s*:/g)]
        .map((match) => ({ readonly: match[1] !== undefined, name: match[2], optional: match[3] === '?' }));
}

/** The body of the function "function name(", from its "{" to the matching "}". */
function functionBody(text, name) {
    const start = text.indexOf('function ' + name + '(');
    if (start < 0)
        return undefined;
    const open = text.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < text.length; index += 1) {
        const char = text[index];
        if (char === '{')
            depth += 1;
        else if (char === '}') {
            depth -= 1;
            if (depth === 0)
                return text.slice(open, index + 1);
        }
    }
    return undefined;
}

/**
 * The keys of the object literal declaredCaptainRoute returns: the shorthand
 * mandatory ones (provider, model) and the conditionally spread one
 * (reasoningEffort), read from whatever JS text is supplied.
 * @param js - the lib/snapshot.js source.
 * @returns { mandatory: string[], conditional: string[], literal: string }
 */
function implKeys(js) {
    const body = functionBody(js, 'declaredCaptainRoute');
    assert.ok(body !== undefined, 'declaredCaptainRoute is missing from lib/snapshot.js');
    const returnAt = body.lastIndexOf('return {');
    assert.ok(returnAt > 0, 'declaredCaptainRoute no longer returns an object literal');
    const literal = body.slice(returnAt);
    const mandatory = [...literal.matchAll(/(?:^|[{,\s])(\w+),\s*$/gm)].map((match) => match[1]);
    const conditional = [...literal.matchAll(/\.\.\.[\s\S]*?\?\s*\{\}\s*:\s*\{\s*(\w+)\s*\}/g)].map((match) => match[1]);
    return { mandatory: [...new Set(mandatory)], conditional: [...new Set(conditional)], literal };
}

/**
 * Compare the declarations with the implementation. Returns a list of problems;
 * empty means the two agree about captainRoute.
 * @param dts - the snapshot.d.ts source.
 * @param js - the lib/snapshot.js source.
 * @returns { string[] } problems
 */
function drift(dts, js) {
    const problems = [];
    const payloadBody = interfaceBlock(dts, 'TeamActivitySnapshot');
    if (payloadBody === undefined) {
        problems.push('TeamActivitySnapshot is not declared in snapshot.d.ts');
        return problems;
    }
    const field = fieldsOf(payloadBody).find((entry) => entry.name === 'captainRoute');
    if (field === undefined) {
        problems.push('TeamActivitySnapshot does not declare captainRoute');
        return problems;
    }
    if (!field.optional)
        problems.push('captainRoute must be optional: the key is ABSENT when the captain declares no route');
    const declaredType = /readonly\s+captainRoute\??\s*:\s*(\w+)/.exec(payloadBody);
    if (declaredType === null)
        problems.push('cannot read the declared type of captainRoute');
    const typeName = declaredType === null ? undefined : declaredType[1];
    const routeBody = typeName === undefined ? undefined : interfaceBlock(dts, typeName);
    if (routeBody === undefined) {
        problems.push('the declared captainRoute type ' + String(typeName) + ' is not an interface in snapshot.d.ts');
        return problems;
    }
    const routeFields = fieldsOf(routeBody);
    if (routeFields.some((entry) => !entry.readonly))
        problems.push('every ' + String(typeName) + ' field must be readonly');
    const declaredRequired = routeFields.filter((entry) => !entry.optional).map((entry) => entry.name).sort();
    const declaredOptional = routeFields.filter((entry) => entry.optional).map((entry) => entry.name).sort();
    const impl = implKeys(js);
    const implMandatory = impl.mandatory.slice().sort();
    const implConditional = impl.conditional.slice().sort();
    if (declaredRequired.join(',') !== implMandatory.join(','))
        problems.push('declared required keys [' + declaredRequired.join(', ') + '] do not match the implementation [' + implMandatory.join(', ') + ']');
    if (declaredOptional.join(',') !== implConditional.join(','))
        problems.push('declared optional keys [' + declaredOptional.join(', ') + '] do not match the conditional spread [' + implConditional.join(', ') + ']');
    const payloadOrder = [...payloadBody.matchAll(/readonly (\w+)\??\s*:/g)].map((match) => match[1]);
    if (payloadOrder[payloadOrder.indexOf('captainSessionId') + 1] !== 'captainRoute')
        problems.push('captainRoute is declared out of payload order (expected right after captainSessionId)');
    return problems;
}

// ---------------------------------------------------------------------------
// Runtime harness: the real assembleTeamSnapshot over a fake context.
// ---------------------------------------------------------------------------
function makeCtx(captain) {
    return {
        logger: { debug() { }, info() { }, warn() { }, error() { } },
        agents: { get(id) { return id === 'sess-captain' ? captain : undefined; }, list() { return []; } },
        subagents: { list() { return []; }, getProvider() { return { id: 'spawn', defaultModel: 'm1' }; } },
        llm: { async listModels() { return [{ id: 'm1' }]; }, async listProviders() { return [{ id: 'p1' }]; } },
        on() { return () => { }; },
    };
}
const captainWith = (header, options) => ({
    id: 'sess-captain',
    options: options ?? {},
    session: { id: 'sess-captain', header: { cwd: REPO }, requestHeader: () => ({ config: header }) },
});
const teamState = (captainSessionId) => ({
    id: 'team-t77',
    name: 't77',
    captainSessionId: captainSessionId ?? 'sess-captain',
    phase: 'running',
    members: [{ id: '', name: 'worker-a', status: 'idle', provider: 'p1', model: 'm1' }],
    tasks: [],
});

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// ---------------------------------------------------------------------------
// Declarations: shape, naming, optionality, and order.
// ---------------------------------------------------------------------------
test('a1 snapshot.d.ts declares captainRoute on TeamActivitySnapshot as optional', async () => {
    const body = interfaceBlock(dtsText, 'TeamActivitySnapshot');
    assert.ok(body !== undefined, 'TeamActivitySnapshot is not declared');
    assert.match(body, /readonly\s+captainRoute\?:\s*TeamCaptainRoute;/, 'the optional captainRoute field is missing');
    assert.ok(!/readonly\s+captainRoute:\s*TeamCaptainRoute;/.test(body), 'a REQUIRED captainRoute would contradict the payload, which omits the key');
});

test('a2 TeamCaptainRoute declares provider/model required and reasoningEffort optional', async () => {
    const body = interfaceBlock(dtsText, 'TeamCaptainRoute');
    assert.ok(body !== undefined, 'TeamCaptainRoute interface is missing');
    assert.match(body, /readonly\s+provider:\s*string;/, 'provider must be a required string');
    assert.match(body, /readonly\s+model:\s*string;/, 'model must be a required string');
    assert.match(body, /readonly\s+reasoningEffort\?:\s*string;/, 'reasoningEffort must be an optional string');
});

test('a3 the doc comment records the absent-vs-empty semantics', async () => {
    const at = dtsText.indexOf('readonly captainRoute?');
    assert.ok(at > 0, 'the field is missing');
    const before = dtsText.slice(Math.max(0, at - 800), at);
    assert.match(before, /ABSENT/, 'the comment must say the key is absent');
    assert.match(before, /empty object/i, 'the comment must rule out an empty object');
});

test('a4 the declarations agree with the implementation (no drift)', async () => {
    assert.deepEqual(drift(dtsText, jsText), []);
});

test('a5 captainRoute is declared immediately after captainSessionId, matching the payload', async () => {
    const body = interfaceBlock(dtsText, 'TeamActivitySnapshot');
    const order = [...body.matchAll(/readonly (\w+)\??:/g)].map((match) => match[1]);
    assert.ok(order.indexOf('captainSessionId') >= 0, 'captainSessionId is not declared');
    assert.equal(order[order.indexOf('captainSessionId') + 1], 'captainRoute');
});

test('a6 snapshot.d.ts has no duplicate declaration names', async () => {
    const names = [...dtsText.matchAll(/export (?:interface|type|declare function|declare const) (\w+)/g)].map((match) => match[1]);
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    assert.deepEqual(duplicates, []);
});

test('a7 the declaration file is erased at build time, so no bundle rebuild is owed', async () => {
    assert.ok(!bundleText.includes('types/snapshot'), 'lib/client.js references the type module, so a rebuild would be owed');
    assert.ok(!jsText.includes('types/snapshot.d.ts'), 'lib/snapshot.js imports the .d.ts at runtime');
});

// ---------------------------------------------------------------------------
// Runtime: every key the payload emits is declared, required keys always appear,
// and the key stays ABSENT where the declaration promises it can be.
// ---------------------------------------------------------------------------
test('b1 a declared route carries exactly provider+model+reasoningEffort', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 't77-'));
    try {
        const snapshot = await snapshotMod.assembleTeamSnapshot(makeCtx(captainWith({ provider: 'p9', model: 'm9', reasoningEffort: 'high' })), stateRoot, REPO, teamState());
        assert.deepEqual(snapshot.captainRoute, { provider: 'p9', model: 'm9', reasoningEffort: 'high' });
    }
    finally {
        await rm(stateRoot, { recursive: true, force: true });
    }
});

test('b2 every key the payload emits is declared in TeamCaptainRoute', async () => {
    const routeFields = fieldsOf(interfaceBlock(dtsText, 'TeamCaptainRoute')).map((entry) => entry.name);
    const stateRoot = await mkdtemp(join(tmpdir(), 't77-'));
    try {
        const route = (await snapshotMod.assembleTeamSnapshot(makeCtx(captainWith({ provider: 'p9', model: 'm9', reasoningEffort: 'low' })), stateRoot, REPO, teamState())).captainRoute;
        const undeclared = Object.keys(route).filter((key) => !routeFields.includes(key));
        assert.deepEqual(undeclared, [], 'payload keys missing from the declaration: ' + undeclared.join(', '));
    }
    finally {
        await rm(stateRoot, { recursive: true, force: true });
    }
});

test('b3 the required declared keys are present whenever the key is published', async () => {
    const required = fieldsOf(interfaceBlock(dtsText, 'TeamCaptainRoute')).filter((entry) => !entry.optional).map((entry) => entry.name);
    const stateRoot = await mkdtemp(join(tmpdir(), 't77-'));
    try {
        const route = (await snapshotMod.assembleTeamSnapshot(makeCtx(captainWith({}, { provider: 'p7', model: 'm7' })), stateRoot, REPO, teamState())).captainRoute;
        for (const key of required)
            assert.ok(typeof route[key] === 'string' && route[key] !== '', 'required key ' + key + ' is not a non-empty string: ' + JSON.stringify(route));
    }
    finally {
        await rm(stateRoot, { recursive: true, force: true });
    }
});

test('b4 reasoningEffort is absent (not empty) when the header does not declare one', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 't77-'));
    try {
        const route = (await snapshotMod.assembleTeamSnapshot(makeCtx(captainWith({ provider: 'p1', model: 'm2', reasoningEffort: '   ' })), stateRoot, REPO, teamState())).captainRoute;
        assert.deepEqual(route, { provider: 'p1', model: 'm2' });
        assert.ok(!('reasoningEffort' in route), 'a blank reasoningEffort must be omitted, matching the declared optional key');
    }
    finally {
        await rm(stateRoot, { recursive: true, force: true });
    }
});

test('b5 the key is ABSENT where the declaration says it can be', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 't77-'));
    try {
        const noService = await snapshotMod.assembleTeamSnapshot({ logger: { debug() { }, info() { }, warn() { }, error() { } } }, stateRoot, REPO, teamState());
        const unknown = await snapshotMod.assembleTeamSnapshot(makeCtx(undefined), stateRoot, REPO, teamState('sess-gone'));
        const half = await snapshotMod.assembleTeamSnapshot(makeCtx(captainWith({ provider: 'p9', model: '' })), stateRoot, REPO, teamState());
        const noCaptain = await snapshotMod.assembleTeamSnapshot(makeCtx(captainWith({ provider: 'p9', model: 'm9' })), stateRoot, REPO, teamState(''));
        for (const snapshot of [noService, unknown, half, noCaptain])
            assert.ok(!('captainRoute' in snapshot), 'the key was published as ' + JSON.stringify(snapshot.captainRoute));
    }
    finally {
        await rm(stateRoot, { recursive: true, force: true });
    }
});

test('b6 the payload survives a JSON round trip unchanged (the panel reads JSON)', async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), 't77-'));
    try {
        const snapshot = await snapshotMod.assembleTeamSnapshot(makeCtx(captainWith({ provider: 'p3', model: 'm4', reasoningEffort: 'medium' })), stateRoot, REPO, teamState());
        assert.deepEqual(JSON.parse(JSON.stringify(snapshot)).captainRoute, snapshot.captainRoute);
    }
    finally {
        await rm(stateRoot, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------------------
// Negative controls: the same analysis must reject broken declarations.
// ---------------------------------------------------------------------------
test('n1 a declaration without captainRoute is rejected', async () => {
    const field = /readonly captainRoute\?: TeamCaptainRoute;/;
    assert.ok(field.test(dtsText), 'the field moved, so the negative control is blind');
    const reverted = dtsText.replace(field, '');
    const problems = drift(reverted, jsText);
    assert.ok(problems.some((problem) => problem.includes('does not declare captainRoute')), JSON.stringify(problems));
});

test('n2 a REQUIRED captainRoute is rejected', async () => {
    const required = dtsText.replace('readonly captainRoute?: TeamCaptainRoute;', 'readonly captainRoute: TeamCaptainRoute;');
    assert.notEqual(required, dtsText, 'the replacement did nothing');
    const problems = drift(required, jsText);
    assert.ok(problems.some((problem) => problem.includes('must be optional')), JSON.stringify(problems));
});

test('n3 dropping the optional reasoningEffort is rejected', async () => {
    const line = /    \/\*\* Present only when the header declares one; absent \(never [^\n]*\n    readonly reasoningEffort\?: string;\n/;
    assert.ok(line.test(dtsText), 'the optional field moved, so the negative control is blind');
    const noEffort = dtsText.replace(line, '');
    const problems = drift(noEffort, jsText);
    assert.ok(problems.some((problem) => problem.includes('declared optional keys')), JSON.stringify(problems));
});

test('n4 a renamed declaration type is rejected', async () => {
    const renamed = dtsText.replace(/readonly captainRoute\?: TeamCaptainRoute;/, 'readonly captainRoute?: CaptainRoute;');
    assert.notEqual(renamed, dtsText, 'the replacement did nothing');
    const problems = drift(renamed, jsText);
    assert.ok(problems.some((problem) => problem.includes('is not an interface')), JSON.stringify(problems));
});

test('n5 the implementation really is the source of truth (a fabricated key is rejected)', async () => {
    const fabricated = jsText.replace("reasoningEffort === '' ? {} : { reasoningEffort }", "reasoningEffort === '' ? {} : { reasoningEffort, effortSource: 'x' }");
    assert.notEqual(fabricated, jsText, 'the fabrication did nothing - the implementation moved');
    const problems = drift(dtsText, fabricated);
    assert.ok(problems.some((problem) => problem.includes('do not match the conditional spread')), JSON.stringify(problems));
});

// ---------------------------------------------------------------------------
const results = [];
for (const item of cases) {
    try {
        await item.fn();
        results.push(true);
        console.log('ok ' + results.length + ' ' + item.name);
    }
    catch (error) {
        results.push(false);
        console.log('not ok ' + results.length + ' ' + item.name);
        console.log('  ' + (error instanceof Error ? error.message : String(error)));
    }
}
const failed = results.filter((ok) => !ok).length;
console.log('# ' + (results.length - failed) + '/' + results.length + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
