// t102 — BUG-026. Proves three things on a COPY of the real ERP team.json
// (14 members / 107 tasks):
//   1. READ is lenient: a foreign-but-well-formed routeOverride.source no longer kills the team.
//   2. READ still refuses empty / non-string / over-64-character provenance.
//   3. Task status / kind / verdict errors now name the values that are valid.
// Plus: the public WRITE path still stores only a known source, the round trip keeps the
// foreign source verbatim, unknown foreign fields stay readable, the negative control
// (the old closed union) reproduces the defect, and the real ERP file is untouched.
// Run from the repo root: node tests/t102-erp-read-leniency.mjs

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(REPO, 'packages', 'dsh-agent-teams');
const LIB = join(PKG, 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const stateMod = await import(libModule('state.js'));
const membersMod = await import(libModule('members.js'));
const indexMod = await import(libModule('index.js'));
const { readTeam, writeTeam } = stateMod;
const { routeOf } = membersMod;
const typesMod = await import(libModule('types.js'));

const ERP_TEAM = join(REPO, '..', 'ERP', '.agent-teams', 'erp-erp', 'team.json');
const ERP_SHA256 = '9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e';
const ERP_BYTES = 1533117;
const TEAM_ID = 'erp-erp';
const TMP_ROOT = join(REPO, 'tests', 'tmp', 't102');
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const LENIENT_LINE = "            && isProvenanceSource(value['routeOverride']['source'])";

const erpRaw = readFileSync(ERP_TEAM);
const ERP_TEMPLATE = JSON.parse(erpRaw.toString('utf8'));

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

/** The ERP member whose durable row carries no live fallback, so routeOf() reads the override. */
function overrideTarget(team) {
    const index = team.members.findIndex((member) => member.fallbackActive !== true);
    assert.ok(index >= 0, 'the ERP fixture must have at least one member without a live fallback');
    return index;
}

async function workspace(tag) {
    await mkdir(TMP_ROOT, { recursive: true });
    const dir = await mkdtemp(join(TMP_ROOT, tag + '-'));
    const stateRoot = join(dir, 'state');
    const teamDir = join(stateRoot, TEAM_ID);
    await mkdir(teamDir, { recursive: true });
    const path = join(teamDir, 'team.json');
    return { dir, stateRoot, path };
}

/** A fresh copy of the real ERP team.json, optionally mutated, written where readTeam looks. */
async function erpFixture(tag, mutate) {
    const space = await workspace(tag);
    const team = JSON.parse(JSON.stringify(ERP_TEMPLATE));
    if (mutate !== undefined)
        mutate(team);
    await writeFile(space.path, JSON.stringify(team, null, 2));
    return { ...space, team };
}

const withOverride = (team, source, index = overrideTarget(team)) => {
    team.members[index].routeOverride = {
        provider: 'p2',
        model: 'm2',
        reasoningEffort: 'high',
        source,
        at: 1700000000000,
        by: 'erp-tool',
    };
    return index;
};

/** Run fn on a copy of the fixture with a foreign source, and always clean up. */
async function withErp(tag, mutate, fn) {
    const fixture = await erpFixture(tag, mutate);
    try {
        return await fn(fixture);
    }
    finally {
        await rm(fixture.dir, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------------------
// READ is lenient
// ---------------------------------------------------------------------------

for (const [id, source] of [['a1', 'erp'], ['a2', 'migration'], ['a3', 'profile:v2']]) {
    test(`${id} readTeam accepts routeOverride.source "${source}" verbatim and routeOf still uses the override`, async () => {
        let index = -1;
        await withErp(id, (team) => { index = withOverride(team, source); }, async ({ stateRoot, path, team }) => {
            const loaded = await readTeam(stateRoot, TEAM_ID);
            const member = loaded.members[index];
            assert.deepEqual(member.routeOverride, team.members[index].routeOverride, 'the override must survive the read byte for byte');
            assert.equal(member.routeOverride.source, source, 'source must stay verbatim, never normalised');
            const route = routeOf(member);
            assert.equal(route.origin, 'override', 'routeOf must still report the override origin');
            assert.equal(route.provider, 'p2');
            assert.equal(route.model, 'm2');
            console.log(`    members=${loaded.members.length} tasks=${loaded.tasks.length} members[${index}].routeOverride.source=${JSON.stringify(member.routeOverride.source)} routeOrigin=${route.origin} route=${route.provider}/${route.model}`);
            console.log('    bytes on disk before read=' + (await readFile(path)).length);
        });
    });
}

test('a4 a 64-character source sits exactly on the accepted boundary', async () => {
    const source = 'a' + 'b'.repeat(63);
    assert.equal(source.length, 64);
    let index = -1;
    await withErp('a4', (team) => { index = withOverride(team, source); }, async ({ stateRoot }) => {
        const loaded = await readTeam(stateRoot, TEAM_ID);
        assert.equal(loaded.members[index].routeOverride.source, source);
        console.log(`    members[${index}].routeOverride.source length=${source.length} accepted`);
    });
});

// ---------------------------------------------------------------------------
// READ still refuses invalid provenance
// ---------------------------------------------------------------------------

const INVALID_SOURCES = [
    ['b1', '', 'empty string'],
    ['b2', 123, 'number instead of a string'],
    ['b3', 'a' + 'b'.repeat(64), '65 characters'],
    ['b4', 'Erp', 'uppercase first letter'],
    ['b5', 'erp tool', 'space inside'],
];

for (const [id, source, why] of INVALID_SOURCES) {
    test(`${id} readTeam still refuses source ${JSON.stringify(source)} (${why})`, async () => {
        let index = -1;
        await withErp(id, (team) => { index = withOverride(team, source); }, async ({ stateRoot }) => {
            await assert.rejects(
                () => readTeam(stateRoot, TEAM_ID),
                new RegExp('members\\[' + index + '\\] is not a valid member record'),
            );
            console.log(`    members[${index}].routeOverride.source=${JSON.stringify(source)} refused with members[${index}] is not a valid member record`);
        });
    });
}

// ---------------------------------------------------------------------------
// Round trip + foreign fields
// ---------------------------------------------------------------------------

test('c1 readTeam -> writeTeam -> readTeam keeps a foreign source verbatim', async () => {
    let index = -1;
    await withErp('c1', (team) => { index = withOverride(team, 'profile:v2'); }, async ({ stateRoot }) => {
        const first = await readTeam(stateRoot, TEAM_ID);
        await writeTeam(stateRoot, first);
        const second = await readTeam(stateRoot, TEAM_ID);
        assert.equal(second.members[index].routeOverride.source, 'profile:v2');
        assert.deepEqual(second.members[index].routeOverride, first.members[index].routeOverride);
        assert.equal(second.members.length, first.members.length);
        assert.equal(second.tasks.length, first.tasks.length);
        console.log(`    round trip members=${second.members.length} tasks=${second.tasks.length} source=${JSON.stringify(second.members[index].routeOverride.source)}`);
    });
});

test('d1 unknown fields outside the validator (member, task, team) stay readable and untouched', async () => {
    await withErp('d1', (team) => {
        team.members[2].erpStage = 'handover';
        team.tasks[3].erpTicket = 'ERP-4711';
        team.erpOrgUnit = 'KHO-VT';
    }, async ({ stateRoot }) => {
        const loaded = await readTeam(stateRoot, TEAM_ID);
        assert.equal(loaded.members[2].erpStage, 'handover');
        assert.equal(loaded.tasks[3].erpTicket, 'ERP-4711');
        assert.equal(loaded.erpOrgUnit, 'KHO-VT');
        console.log(`    erpStage=${loaded.members[2].erpStage} erpTicket=${loaded.tasks[3].erpTicket} erpOrgUnit=${loaded.erpOrgUnit}`);
    });
});

// ---------------------------------------------------------------------------
// Actionable messages
// ---------------------------------------------------------------------------

test('e1 an unknown task status names every valid status and the terminal subset', async () => {
    await withErp('e1', (team) => { team.tasks[4].status = 'blocked_by_erp'; }, async ({ stateRoot }) => {
        await assert.rejects(() => readTeam(stateRoot, TEAM_ID), (error) => {
            const message = String(error?.message ?? error);
            assert.match(message, /valid statuses: pending, claimed, in_progress, completed, failed, cancelled/);
            assert.match(message, /terminal: completed, failed, cancelled/);
            assert.match(message, /"blocked_by_erp"/);
            console.log('    message=' + message.split(': ').slice(-1)[0]);
            return true;
        });
    });
});

test('e2 an unknown task kind names every valid kind', async () => {
    await withErp('e2', (team) => { team.tasks[4].kind = 'erp_task'; }, async ({ stateRoot }) => {
        await assert.rejects(() => readTeam(stateRoot, TEAM_ID), (error) => {
            const message = String(error?.message ?? error);
            assert.match(message, new RegExp('valid kinds: ' + typesMod.TASK_KINDS.join(', ')),
                'the message must list TASK_KINDS in the order lib/types.js declares');
            console.log('    message=' + message.split(': ').slice(-1)[0]);
            return true;
        });
    });
});

test('e3 an unknown task verdict names every valid verdict', async () => {
    await withErp('e3', (team) => { team.tasks[4].verdict = 'erp_ok'; }, async ({ stateRoot }) => {
        await assert.rejects(() => readTeam(stateRoot, TEAM_ID), (error) => {
            const message = String(error?.message ?? error);
            assert.match(message, /valid verdicts: pass, needs_revision, reject/);
            console.log('    message=' + message.split(': ').slice(-1)[0]);
            return true;
        });
    });
});

// ---------------------------------------------------------------------------
// Negative control: put the closed union back and the same file dies again
// ---------------------------------------------------------------------------

const OLD_UNION = [
    "            && (value['routeOverride']['source'] === 'captain'",
    "                || value['routeOverride']['source'] === 'http'",
    "                || value['routeOverride']['source'] === 'profile')",
].join('\n');

test('f1 negative control: the closed union makes the same team.json unreadable again', async () => {
    const space = await workspace('f1');
    try {
        const libCopy = join(space.dir, 'lib');
        cpSync(LIB, libCopy, { recursive: true });
        const statePath = join(libCopy, 'state.js');
        const before = await readFile(statePath, 'utf8');
        assert.equal(before.split(LENIENT_LINE).length - 1, 1, 'the lenient line must appear exactly once in lib/state.js');
        const after = before.replace(LENIENT_LINE, OLD_UNION);
        assert.notEqual(after, before, 'the mutation must change the copied validator');
        await writeFile(statePath, after);
        const mutant = await import(pathToFileURL(statePath).href + '?v=' + Date.now());

        const team = JSON.parse(JSON.stringify(ERP_TEMPLATE));
        const index = withOverride(team, 'erp');
        await writeFile(space.path, JSON.stringify(team, null, 2));

        const healthy = await readTeam(space.stateRoot, TEAM_ID);
        assert.equal(healthy.members[index].routeOverride.source, 'erp', 'the fixed validator reads the same bytes');
        await assert.rejects(
            () => mutant.readTeam(space.stateRoot, TEAM_ID),
            new RegExp('members\\[' + index + '\\] is not a valid member record'),
            'the old union must reject what the fix accepts',
        );
        console.log(`    applies=1 old_bytes=${before.length} new_bytes=${after.length} delta_bytes=${after.length - before.length} members[${index}] accepted=fix rejected=closed-union`);
    }
    finally {
        await rm(space.dir, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------------------
// WRITE stays tight
// ---------------------------------------------------------------------------

const CATALOG = { p1: [{ id: 'm1' }, { id: 'm3' }], p2: [{ id: 'm2' }] };
const MEMBER_PROVIDER = 'spawn';

function makeHarness(workspacePath) {
    const registered = new Map();
    const captain = {
        id: 'sess-captain',
        options: { provider: 'p1', model: 'm1' },
        session: {
            id: 'sess-captain',
            header: { cwd: workspacePath },
            append() {},
            requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }),
        },
        ctx: { tools: { view: () => ({ restrictableNames: new Set(['agent_teams_claim_task', 'agent_teams_send_message', 'subagent', 'send_message']) }) } },
        followup() { return 'followup'; },
        cancel() {},
    };
    const ctx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        tools: { register(def) { registered.set(def.name, def); } },
        agents: { get(id) { return id === 'sess-captain' ? captain : undefined; }, list() { return []; } },
        subagents: {
            followup() { return Promise.resolve('msg-legacy'); },
            [Symbol.for('dsh.subagent.deliverPrompt')]() { return Promise.resolve('deliver'); },
            sendMessage() { return Promise.resolve('msg-send'); },
            startActivation() { return Promise.resolve({ childId: 'child-1', result: Promise.resolve({ text: 'ok' }) }); },
            getProvider(name) { return name === MEMBER_PROVIDER ? { id: MEMBER_PROVIDER, name: MEMBER_PROVIDER, prepareContinuable() {} } : undefined; },
            list() { return [MEMBER_PROVIDER]; },
            interrupt() {},
        },
        llm: {
            async listModels(provider) { return CATALOG[provider] ?? []; },
            async listProviders() { return [{ id: 'p1' }, { id: 'p2' }]; },
            async resolveCallConfig(config) { return config; },
        },
        on() { return () => {}; },
        inject() {},
        systemPrompt: { section() {} },
        effect() {},
        get() { return undefined; },
    };
    return { ctx, captain, registered };
}

const baseConfig = () => ({
    stateDir: '.agent-teams',
    memberProvider: MEMBER_PROVIDER,
    maxMembers: 8,
    maxManualMembers: 12,
    profiles: {},
    toolPolicies: {},
    slashCommand: false,
});

test('g1 the public write path cannot persist a foreign source, and the write sites are known', async () => {
    const workspacePath = await mkdtemp(join(await (async () => {
        await mkdir(TMP_ROOT, { recursive: true });
        return TMP_ROOT;
    })(), 'g1-'));
    try {
        const harness = makeHarness(workspacePath);
        indexMod.apply(harness.ctx, baseConfig());
        const teamDir = join(workspacePath, '.agent-teams', 'team-t102');
        await mkdir(teamDir, { recursive: true });
        const team = {
            id: 'team-t102', name: 'TEAM-T102', captainSessionId: 'sess-captain',
            createdAt: 1, taskSeq: 1, phase: 'running',
            members: [{ id: 'child-1', name: 'alice', provider: 'p1', model: 'm1', joinedAt: 1, status: 'idle' }],
            tasks: [],
        };
        await writeFile(join(teamDir, 'team.json'), JSON.stringify(team, null, 2));

        let outcome = 'accepted';
        try {
            await harness.registered.get('agent_teams_set_member_route').execute(
                { member_name: 'alice', provider: 'p2', model: 'm2', source: 'erp' },
                { agent: harness.captain, signal: undefined },
            );
        }
        catch (error) {
            outcome = 'refused (' + String(error?.message ?? error).split('\n')[0] + ')';
        }
        const durable = JSON.parse(await readFile(join(teamDir, 'team.json'), 'utf8'));
        const stored = durable.members.find((member) => member.name === 'alice');
        assert.notEqual(stored.routeOverride?.source, 'erp', 'the public write path must never persist source="erp"');
        if (outcome === 'accepted')
            assert.equal(stored.routeOverride.source, 'captain', 'a known source is what the tool writes');
        console.log('    tool outcome=' + outcome);
        console.log('    durable routeOverride=' + JSON.stringify(stored.routeOverride ?? null));

        const toolsText = await readFile(join(LIB, 'tools.js'), 'utf8');
        const lines = toolsText.split('\n');
        const writeSites = lines
            .map((line, index) => (line.includes("source: 'captain',") ? index + 1 : 0))
            .filter((lineNumber) => lineNumber > 0);
        assert.ok(writeSites.length >= 2, 'the plugin write sites must still hard-code a known source');
        console.log('    lib/tools.js source:\'captain\' write sites at lines ' + writeSites.join(', '));
        const migrate = await readFile(join(REPO, 'tools', 'erp-route-migrate.mjs'), 'utf8');
        assert.match(migrate, /const ROUTE_SOURCE = 'profile';/);
        console.log("    tools/erp-route-migrate.mjs ROUTE_SOURCE='profile'");
    }
    finally {
        await rm(workspacePath, { recursive: true, force: true });
    }
});

// ---------------------------------------------------------------------------
// The real ERP file is only ever read
// ---------------------------------------------------------------------------

test('h1 the real ERP team.json is unchanged by this suite', async () => {
    const raw = readFileSync(ERP_TEAM);
    assert.equal(sha256(raw), ERP_SHA256);
    assert.equal(raw.length, ERP_BYTES);
    console.log(`    ERP team.json sha256=${sha256(raw)} bytes=${raw.length} members=${ERP_TEMPLATE.members.length} tasks=${ERP_TEMPLATE.tasks.length} (read only)`);
});

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let failed = 0;
let passed = 0;
for (const [index, item] of cases.entries()) {
    try {
        await item.fn();
        passed += 1;
        console.log(`ok ${index + 1} ${item.name}`);
    }
    catch (error) {
        failed += 1;
        console.log(`not ok ${index + 1} ${item.name}`);
        console.log('  ' + String(error?.stack ?? error).split('\n').slice(0, 6).join('\n  '));
    }
}
console.log(`# ${passed}/${cases.length} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
