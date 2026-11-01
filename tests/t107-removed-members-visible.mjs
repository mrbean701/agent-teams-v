#!/usr/bin/env node
// t107 — BUG-027. `agent_teams_status` used to DROP every 'removed' member row from its
// payload (lib/tools.js filtered `.filter((member) => member.status !== 'removed')` into
// both the DTO and the text), so a team whose history lives in removed records — the real
// ERP team is 14 members = 7 removed + 7 live, 107 tasks — reported `Members (7)` and
// nothing else. A removed row is durable history: MEASURED on the real file, no row carries a
// routeOverride at all, but every removed row keeps runtimeSetup (a 4 000-character persona and
// its tool filter) and joinedAt, and a team whose rows DO carry a routeOverride reports that too
// (case a5). So this was information lost at the PAYLOAD layer, which is worse than
// BUG-024/BUG-025 (text only).
//
// What this suite proves:
//   a* 3 live + 2 removed  => removed_count/removed_members in the payload, both counts in
//      the title, a Removed block with the route provenance, and removed rows OUT of members;
//   b* 3 live + 0 removed  => the OLD text byte for byte (title `Members (3):`, no Removed
//      block), so an ordinary team does not change;
//   c* the real ERP copy   => 7 live + 7 removed, Removed (7): with the durable fields the file
//      really carries (runtimeSetup persona + tool filter, joinedAt) printed for every row;
//   d* a removed member is still NOT addressable (the old refusal is intact, nothing written);
//   e* NEGATIVE CONTROL: the pre-fix code dropped into tests/tmp/t107/ gives `Members (3)`
//      and no removed_count at all;
//   f* the real ERP team.json is untouched.
// Run from the repo root: node tests/t107-removed-members-visible.mjs

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, symlinkSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(REPO, 'packages', 'dsh-agent-teams');
const LIB = join(PKG, 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const stateMod = await import(libModule('state.js'));
const toolsMod = await import(libModule('tools.js'));
const { writeTeam } = stateMod;

const ERP_TEAM = join(REPO, '..', 'ERP', '.agent-teams', 'erp-erp', 'team.json');
const ERP_SHA256 = '9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e';
const ERP_BYTES = 1533117;
const TEAM_ID = 'team-t107';
const TMP_ROOT = join(REPO, 'tests', 'tmp', 't107');
const STATE_DIR = '.agent-teams';
const BASE_CONFIG = { stateDir: STATE_DIR, memberProvider: 'spawn', maxMembers: 8, maxManualMembers: 12, profiles: {}, toolPolicies: {} };
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const erpRaw = readFileSync(ERP_TEAM);
const ERP = JSON.parse(erpRaw.toString('utf8'));
const LIVE_ROWS = ERP.members.filter((member) => member.status !== 'removed');
const REMOVED_ROWS = ERP.members.filter((member) => member.status === 'removed');

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

/** Captain/session shape this tool chain requires (t87/t98 shape). */
function makeCaptain(dir) {
    return {
        id: 'sess-captain',
        options: { provider: 'p1', model: 'm1' },
        session: {
            header: { cwd: dir },
            append() {},
            requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }),
        },
    };
}

/** The subagent runtime shape lib/harness-compat.js accepts (t98 lesson). */
function memberRuntime() {
    const runtime = {
        followup() { return Promise.resolve('stub'); },
        sendMessage() { return Promise.resolve('stub'); },
        startActivation() { return Promise.reject(new Error('t107: no agent runtime in this suite')); },
        getProvider() { return { id: 'spawn' }; },
        list() { return []; },
        interrupt() {},
    };
    runtime[Symbol.for('dsh.subagent.deliverPrompt')] = () => Promise.resolve('deliver');
    runtime[Symbol.for('dsh.subagent.queuePrompt')] = () => Promise.resolve('queue');
    return runtime;
}

function stubContext(captain, registered) {
    const noop = () => {};
    return {
        logger: { debug: noop, info: noop, warn: noop, error: noop },
        tools: { register: (definition) => { registered.set(definition.name, definition); } },
        agents: { get: (id) => (id === captain.id ? captain : undefined), list: () => [] },
        subagents: memberRuntime(),
        llm: {
            async listModels() { return []; },
            async listProviders() { return []; },
            async resolveCallConfig(config) { return config; },
        },
        on() { return noop; },
        inject: noop,
        systemPrompt: { section: noop },
        effect(fn) { try { fn(); } catch { /* stub */ } },
    };
}

/** Register the real tools against a stub context; returns the name -> definition map. */
function registerTools(captain, toolsUrl) {
    const registered = new Map();
    const context = stubContext(captain, registered);
    // index.js also wires the web surface and needs ctx.get/inject, so this suite registers
    // the tool module directly — the same function index.js calls (t98 does the same).
    const module = toolsUrl === undefined ? toolsMod : toolsUrl.module;
    module.registerAgentTeamsTools(context, BASE_CONFIG);
    return registered;
}

async function openSpace(tag) {
    await mkdir(TMP_ROOT, { recursive: true });
    const dir = await mkdtemp(join(TMP_ROOT, tag + '-'));
    const stateRoot = join(dir, STATE_DIR);
    return { dir, stateRoot };
}

/** Write a team whose rows are copies of REAL ERP rows, so every record stays validator-legal. */
async function seedTeam(space, { live, removed, tasks = [] }) {
    const clone = (row) => JSON.parse(JSON.stringify(row));
    const team = {
        ...clone(ERP),
        id: TEAM_ID,
        name: 'Team ' + TEAM_ID,
        captainSessionId: 'sess-captain',
        members: [...live.map(clone), ...removed.map(clone)],
        tasks: tasks.map(clone),
        messageCount: 0,
    };
    await mkdir(join(space.stateRoot, TEAM_ID), { recursive: true });
    await writeTeam(space.stateRoot, team);
    return team;
}

async function statusOf(space, registered) {
    const captain = makeCaptain(space.dir);
    const definition = registered.get('agent_teams_status');
    const value = await definition.execute({}, { agent: captain, signal: undefined });
    const parts = definition.output.render({}, value);
    const text = parts.map((part) => String(part.text ?? '')).join('\n');
    return { value, text };
}

const lines_of = (text) => text.split('\n');
const titleLine = (text) => lines_of(text).find((line) => line.startsWith('Members (')) ?? '';
const blockOf = (text, header) => {
    const all = lines_of(text);
    const start = all.findIndex((line) => line === header);
    if (start < 0) return [];
    const out = [];
    for (let index = start + 1; index < all.length; index += 1) {
        const line = all[index];
        if (line.startsWith('  - ')) { out.push(line); continue; }
        // A live row carries indented detail lines (prompt / routes / failure) that belong to
        // the row above; only a column-0 header ends the block.
        if (line.startsWith('      ')) continue;
        break;
    }
    return out;
};

const registered = registerTools(makeCaptain(REPO));
assert.ok(registered.size >= 16, 'the plugin must register its tools, captured ' + registered.size);

// ---------------------------------------------------------------------------
// a* — 3 live + 2 removed
// ---------------------------------------------------------------------------
const LIVE3 = LIVE_ROWS.slice(0, 3);
const REMOVED2 = REMOVED_ROWS.slice(0, 2);

test('a1 the payload reports removed_count=2 and two removed_members rows', async () => {
    const space = await openSpace('a1');
    try {
        await seedTeam(space, { live: LIVE3, removed: REMOVED2 });
        const { value } = await statusOf(space, registered);
        assert.equal(value.removed_count, 2, 'removed_count must be the number of removed rows');
        assert.equal(Array.isArray(value.removed_members), true, 'removed_members must be an array');
        assert.equal(value.removed_members.length, 2);
        assert.deepEqual(value.removed_members.map((row) => row.name), REMOVED2.map((row) => row.name));
        for (const row of value.removed_members) {
            assert.equal(typeof row.role, 'string');
            assert.equal(typeof row.provider, 'string');
            assert.equal(typeof row.model, 'string');
        }
        console.log('    removed_count=' + value.removed_count + ' names=' + JSON.stringify(value.removed_members.map((row) => row.name)));
    } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('a1b the roster invariant holds: removed_count === removed_members.length, and the title prints that number (t125 / V19-F3)', async () => {
    const space = await openSpace('a1b');
    try {
        await seedTeam(space, { live: LIVE3, removed: REMOVED2 });
        const { value, text } = await statusOf(space, registered);
        assert.equal(value.removed_count, value.removed_members.length, 'removed_count must equal the number of removed_members rows — the derivation tests/t98 now enforces');
        assert.ok(text.includes(value.removed_count + ' removed'), 'the rendered title must print the same number the payload counts, got ' + JSON.stringify(titleLine(text)));
        console.log('    removed_count=' + value.removed_count + ' removed_members=' + value.removed_members.length + ' title=' + JSON.stringify(titleLine(text)));
    } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('a2 the title names both counts: Members (3 present + 2 removed):', async () => {
    const space = await openSpace('a2');
    try {
        await seedTeam(space, { live: LIVE3, removed: REMOVED2 });
        const { text } = await statusOf(space, registered);
        assert.equal(titleLine(text), 'Members (3 present + 2 removed):');
        console.log('    title=' + JSON.stringify(titleLine(text)));
    } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('a3 the Removed (2): block prints each name, its role and its override provenance', async () => {
    const space = await openSpace('a3');
    try {
        await seedTeam(space, { live: LIVE3, removed: REMOVED2 });
        const { text } = await statusOf(space, registered);
        const block = blockOf(text, 'Removed (2):');
        assert.equal(block.length, 2, 'the Removed block must carry one line per removed row');
        for (const row of REMOVED2) {
            const line = block.find((entry) => entry.includes(row.name));
            assert.ok(line !== undefined, 'the Removed block must name ' + row.name);
            assert.ok(line.includes('[' + row.role + ']'), 'the line must show the role of ' + row.name);
            assert.ok(line.includes(String(row.provider) + '/' + String(row.model)), 'the line must show the declared route of ' + row.name);
            if (row.routeOverride !== undefined) {
                assert.ok(/override route: \S+\/\S+/u.test(line), 'the line must show the override route of ' + row.name + ': ' + line);
                assert.ok(line.includes('by ' + row.routeOverride.source), 'the line must name the override source');
                assert.ok(line.includes(new Date(row.routeOverride.at).toISOString()), 'the line must print the override timestamp');
            }
        }
        console.log('    block=' + JSON.stringify(block, null, 0).slice(0, 400));
    } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('a4 removed rows stay OUT of members (every other tool depends on that roster)', async () => {
    const space = await openSpace('a4');
    try {
        await seedTeam(space, { live: LIVE3, removed: REMOVED2 });
        const { value, text } = await statusOf(space, registered);
        assert.equal(value.members.length, 3, 'members must carry the three live rows only');
        const names = value.members.map((row) => row.name);
        for (const row of REMOVED2) assert.equal(names.includes(row.name), false, 'members must not carry ' + row.name);
        assert.equal(value.removed_members.length, 2, 'the removed rows must still be reported beside the roster');
        const liveBlock = blockOf(text, 'Members (3 present + 2 removed):');
        assert.equal(liveBlock.length, 3, 'the live block under the title must list exactly 3 rows');
        console.log('    members=' + value.members.length + ' removed=' + value.removed_members.length + ' liveBlock=' + liveBlock.length);
    } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('a5 a removed row that DOES carry a route override prints its whole provenance', async () => {
    const space = await openSpace('a5');
    try {
        const overridden = JSON.parse(JSON.stringify(REMOVED2[0]));
        overridden.routeOverride = { provider: 'p2', model: 'm2', reasoningEffort: 'high', source: 'erp', at: 1700000000000, by: 'migrate-erp' };
        await seedTeam(space, { live: LIVE3, removed: [overridden] });
        const { value, text } = await statusOf(space, registered);
        const row = value.removed_members.find((entry) => entry.name === overridden.name);
        assert.ok(row !== undefined, 'the payload must report ' + overridden.name);
        assert.deepEqual(row.route_override, { provider: 'p2', model: 'm2', reasoning_effort: 'high', source: 'erp', at: 1700000000000, by: 'migrate-erp' });
        const line = blockOf(text, 'Removed (1):').find((entry) => entry.includes(overridden.name));
        assert.ok(line !== undefined, 'the Removed block must print ' + overridden.name);
        assert.equal(line.includes('(override route: p2/m2 (reasoning high) by erp (migrate-erp) at ' + new Date(1700000000000).toISOString() + ')'), true, 'the line must print the override provenance: ' + line);
        console.log('    line=' + JSON.stringify(line));
    } finally { await rm(space.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// b* — 3 live + 0 removed keeps the OLD text
// ---------------------------------------------------------------------------
test('b1 a team with no removed rows keeps Members (3): and prints no Removed block', async () => {
    const space = await openSpace('b1');
    try {
        await seedTeam(space, { live: LIVE3, removed: [] });
        const { value, text } = await statusOf(space, registered);
        assert.equal(value.removed_count, 0);
        assert.deepEqual(value.removed_members, []);
        assert.equal(titleLine(text), 'Members (3):');
        assert.equal(text.includes('Removed ('), false, 'an ordinary team must not grow a Removed block');
        assert.equal(/present \+ /u.test(text), false, 'an ordinary team must not grow a two-count title');
        console.log('    title=' + JSON.stringify(titleLine(text)) + ' hasRemovedBlock=' + text.includes('Removed ('));
    } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('b2 the whole text of a no-removed team is byte-identical to the pre-t107 shape', async () => {
    const space = await openSpace('b2');
    try {
        await seedTeam(space, { live: LIVE3, removed: [] });
        const { text } = await statusOf(space, registered);
        const all = lines_of(text);
        const titleIndex = all.findIndex((line) => line.startsWith('Members ('));
        assert.ok(titleIndex >= 0, 'the text must carry a Members title');
        assert.equal(all[titleIndex], 'Members (3):');
        assert.equal(all[titleIndex + 1].startsWith('  - '), true, 'the live rows must follow the title directly');
        assert.equal(all.filter((line) => line === 'Tasks (0):').length, 1, 'the Tasks block must still follow the roster');
        console.log('    titleLine=' + JSON.stringify(all[titleIndex]) + ' next=' + JSON.stringify(all[titleIndex + 1].slice(0, 60)));
    } finally { await rm(space.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// c* — the real ERP shape: 7 live + 7 removed
// ---------------------------------------------------------------------------
test('c1 the real ERP roster reports 7 present + 7 removed instead of only Members (7)', async () => {
    const space = await openSpace('c1');
    try {
        await seedTeam(space, { live: LIVE_ROWS, removed: REMOVED_ROWS });
        const { value, text } = await statusOf(space, registered);
        assert.equal(value.members.length, 7, 'the ERP file carries 7 live members');
        assert.equal(value.removed_count, 7, 'the ERP file carries 7 removed members');
        assert.equal(titleLine(text), 'Members (7 present + 7 removed):');
        assert.equal(blockOf(text, 'Removed (7):').length, 7);
        console.log('    live=' + value.members.length + ' removed=' + value.removed_count + ' title=' + JSON.stringify(titleLine(text)));
    } finally { await rm(space.dir, { recursive: true, force: true }); }
});

test('c2 every ERP removed row is reported with the durable fields the file really carries', async () => {
    const space = await openSpace('c2');
    try {
        await seedTeam(space, { live: LIVE_ROWS, removed: REMOVED_ROWS });
        const { value, text } = await statusOf(space, registered);
        assert.equal(value.removed_members.length, REMOVED_ROWS.length);
        const block = blockOf(text, 'Removed (' + value.removed_count + '):');
        let withSetup = 0;
        let withOverride = 0;
        for (const fileRow of REMOVED_ROWS) {
            const row = value.removed_members.find((entry) => entry.name === fileRow.name);
            assert.ok(row !== undefined, 'the payload must report removed row ' + fileRow.name);
            const line = block.find((entry) => entry.includes(fileRow.name));
            assert.ok(line !== undefined, 'the Removed block must print ' + fileRow.name);
            if (fileRow.joinedAt !== undefined) {
                assert.equal(row.joined_at, fileRow.joinedAt, 'joined_at must survive for ' + fileRow.name);
                assert.ok(line.includes(new Date(fileRow.joinedAt).toISOString()), 'the line must print the join time of ' + fileRow.name + ': ' + line);
            }
            if (fileRow.runtimeSetup !== undefined && typeof fileRow.runtimeSetup.persona === 'string') {
                withSetup += 1;
                assert.equal(row.runtime_setup.persona.startsWith(fileRow.runtimeSetup.persona.slice(0, 60)), true, 'runtime_setup.persona must survive for ' + fileRow.name);
                assert.equal(line.includes(' · persona: '), true, 'the line must print the persona of ' + fileRow.name);
                assert.equal(line.includes(' · tools: '), true, 'the line must print the tool filter of ' + fileRow.name);
            }
            if (fileRow.routeOverride !== undefined) {
                withOverride += 1;
                assert.equal(row.route_override.source, fileRow.routeOverride.source, 'the override source must survive for ' + fileRow.name);
                assert.equal(line.includes('by ' + fileRow.routeOverride.source), true, 'the line must name the override source of ' + fileRow.name);
            }
        }
        // MEASURED (t107): the real file carries no routeOverride on any row; what it does carry on
        // every removed row is runtimeSetup + joinedAt, and that is what the payload used to drop.
        assert.equal(withSetup, REMOVED_ROWS.length, 'every ERP removed row must keep its runtimeSetup');
        console.log('    rows=' + value.removed_members.length + ' withSetup=' + withSetup + ' withOverride=' + withOverride + ' fileOverrides=' + REMOVED_ROWS.filter((row) => row.routeOverride !== undefined).length);
    } finally { await rm(space.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// d* — a removed member is still not addressable
// ---------------------------------------------------------------------------
test('d1 set_member_route still refuses a removed member and writes nothing', async () => {
    const space = await openSpace('d1');
    try {
        await seedTeam(space, { live: LIVE3, removed: REMOVED2 });
        const path = join(space.stateRoot, TEAM_ID, 'team.json');
        const before = await readFile(path);
        const captain = makeCaptain(space.dir);
        const target = REMOVED2[0].name;
        let message = '';
        await assert.rejects(
            () => registered.get('agent_teams_set_member_route').execute(
                { member_name: target, provider: 'p2', model: 'm2' },
                { agent: captain, signal: undefined },
            ),
            (error) => { message = String(error?.message ?? error); return true; },
        );
        const after = await readFile(path);
        assert.equal(sha256(after), sha256(before), 'a refused call must not write team.json');
        assert.equal(message.includes(target) || /removed/u.test(message), true, 'the refusal must identify the member or say removed: ' + message);
        console.log('    refused=' + JSON.stringify(message.slice(0, 200)));
        console.log('    team.json bytes before=' + before.length + ' after=' + after.length);
    } finally { await rm(space.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// e* — NEGATIVE CONTROL: the pre-fix code
// ---------------------------------------------------------------------------
test('e1 NEGATIVE CONTROL: the pre-fix code reports Members (3) and no removed_count', async () => {
    const dir = await openSpace('e1');
    const copy = join(dir.dir, 'old');
    try {
        cpSync(LIB, join(copy, 'lib'), { recursive: true });
        symlinkSync(join(PKG, 'node_modules'), join(copy, 'node_modules'), 'junction');
        const target = join(copy, 'lib', 'tools.js');
        const original = readFileSync(target, 'utf8');
        const revert = [
            [
                '                removed_count: removedMembers.length,\n                removed_members: removedMembers,\n',
                '',
            ],
            [
                '        memberTitle,\n',
                '        `Members (${team.members.length}):`,\n',
            ],
            [
                "        ...removedMembers.length === 0 ? [] : [\n            `Removed (${removedMembers.length}):`,\n            ...removedMembers.map((member) => removedLine(member)),\n        ],\n",
                '',
            ],
        ];
        let text = original;
        let applies = 0;
        for (const [from, to] of revert) {
            const next = text.replace(from, to);
            if (next !== text) applies += 1;
            text = next;
        }
        assert.equal(applies, revert.length, 'every pre-fix edit must be reproducible on the copy (applied ' + applies + '/' + revert.length + ')');
        await writeFile(target, text);
        const module = await import(pathToFileURL(target).href + '?t107=' + Date.now());
        const oldRegistered = registerTools(makeCaptain(dir.dir), { module });
        await seedTeam(dir, { live: LIVE3, removed: REMOVED2 });
        const { value, text: rendered } = await statusOf(dir, oldRegistered);
        assert.equal(value.removed_count, undefined, 'the pre-fix payload must carry no removed_count');
        assert.equal(value.removed_members, undefined, 'the pre-fix payload must carry no removed_members');
        assert.equal(titleLine(rendered), 'Members (3):', 'the pre-fix text must report only the live count');
        assert.equal(rendered.includes('Removed ('), false);
        console.log('    applies=' + applies + ' old_bytes=' + Buffer.byteLength(original, 'utf8') + ' new_bytes=' + Buffer.byteLength(text, 'utf8') + ' delta_bytes=' + (Buffer.byteLength(text, 'utf8') - Buffer.byteLength(original, 'utf8')));
        console.log('    pre-fix payload removed_count=' + String(value.removed_count) + ' title=' + JSON.stringify(titleLine(rendered)));
    } finally { await rm(dir.dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// f* — the real ERP file is read-only input
// ---------------------------------------------------------------------------
test('f1 the real ERP team.json is untouched', async () => {
    const raw = readFileSync(ERP_TEAM);
    assert.equal(sha256(raw), ERP_SHA256, 'the ERP file must not change');
    assert.equal(raw.length, ERP_BYTES);
    console.log('    erp sha256=' + sha256(raw) + ' bytes=' + raw.length);
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------
let failed = 0;
for (const [index, entry] of cases.entries()) {
    try {
        await entry.fn();
        console.log('ok ' + (index + 1) + ' ' + entry.name);
    } catch (error) {
        failed += 1;
        console.log('not ok ' + (index + 1) + ' ' + entry.name);
        console.log('    ' + String(error?.message ?? error).split('\n').join('\n    '));
    }
}
console.log('');
console.log('# ' + (cases.length - failed) + '/' + cases.length + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
