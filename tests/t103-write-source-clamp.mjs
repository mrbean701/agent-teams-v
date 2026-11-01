// t103 — BUG-026 write half. proves that the WRITE side only accepts the three
// provenance sources the plugin owns (captain / http / profile), that an unknown
// source is refused BEFORE the durable write and BEFORE the audit row, and that the
// guard really has teeth (negative control: the pre-fix line writes 'erp').
// Run from the repo root: node tests/t103-write-source-clamp.mjs

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, symlinkSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(REPO, 'packages', 'dsh-agent-teams');
const LIB = join(PKG, 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const membersMod = await import(libModule('members.js'));
const stateMod = await import(libModule('state.js'));
const indexMod = await import(libModule('index.js'));
const { setMemberRoute, setMemberProfile } = membersMod;
const { readTeam } = stateMod;

const MEMBERS_JS = join(LIB, 'members.js');
const TMP_ROOT = join(REPO, 'tests', 'tmp', 't103');
const stateDir = '.agent-teams';
const teamId = 'team-t103';
const memberName = 'alice';
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

const workspace = await mkdtemp(join(tmpdir(), 't103-write-source-'));
const stateRoot = join(workspace, stateDir);
const teamFile = join(stateRoot, teamId, 'team.json');
const routeAudit = join(workspace, 'docs', 'log', 'MODEL-SWITCH.md');
const profileAudit = join(workspace, 'docs', 'log', 'MEMBER-PROFILE.md');
await mkdir(join(stateRoot, teamId), { recursive: true });

const memberRec = () => ({ id: '', name: memberName, provider: 'p1', model: 'm1', reasoningEffort: 'low', joinedAt: 1, status: 'idle' });
const baseTeam = (member) => ({
    id: teamId, name: 'Team T103', captainSessionId: 'sess-captain',
    createdAt: 1, taskSeq: 0, phase: 'running', members: [member], tasks: [],
});
const seed = (member = memberRec()) => writeFile(teamFile, JSON.stringify(baseTeam(member), null, 2));
const teamBytes = () => readFileSync(teamFile);
const teamSha = () => sha256(teamBytes());
const teamOf = async () => JSON.parse(await readFile(teamFile, 'utf8'));
const memberOf = async () => (await teamOf()).members[0];

const ctx = {
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    llm: { listModels: async () => [{ id: 'm1' }, { id: 'm3' }], resolveCallConfig: async (config) => config },
    agents: { get: () => undefined },
};
const captain = {
    id: 'sess-captain',
    session: { header: { cwd: workspace }, append() {}, requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }) },
};
const selections = {
    isPendingMember: () => false,
    async withPending() {},
    liveChildIds: () => [],
    liveRoute: () => undefined,
    setLiveRoute: () => false,
};

const route = (extra) => ({ provider: 'p3', model: 'm3', ...extra });
const callRoute = (request) => setMemberRoute(ctx, {}, selections, captain, stateDir, teamId, memberName, request);
const callProfile = (request) => setMemberProfile(ctx, {}, captain, stateDir, teamId, memberName, request, undefined);

const auditRows = (path) => (existsSync(path)
    ? readFileSync(path, 'utf8').split('\n').filter((line) => line.startsWith('| 20'))
    : []);
// The route table has 7 columns, the profile table 6: the source column index differs.
const auditSources = (path, column = 7) => auditRows(path).map((line) => line.split('|')[column].trim());
const REFUSAL = /is not one the plugin owns \(valid sources: captain, http, profile\); nothing was written/;

// ---------------------------------------------------------------------------
// (a) an unknown source is refused before the disk and before the audit
// ---------------------------------------------------------------------------
for (const [id, source] of [['a1', 'erp'], ['a2', 'script'], ['a3', 123]]) {
    test(id + ' setMemberRoute refuses source ' + JSON.stringify(source) + ' before any write', async () => {
        await seed();
        const before = teamSha();
        const rowsBefore = auditRows(routeAudit).length;
        await assert.rejects(() => callRoute(route({ source })), REFUSAL,
            'the clamp must refuse ' + JSON.stringify(source));
        assert.equal(teamSha(), before, 'team.json must stay byte-identical');
        assert.equal(auditRows(routeAudit).length, rowsBefore, 'no audit row may be appended');
        assert.equal((await memberOf()).routeOverride, undefined, 'no durable override may land');
        console.log('    source=' + JSON.stringify(source) + ' sha=' + before.slice(0, 12) + ' audit_rows=' + rowsBefore + ' unchanged');
    });
}

// ---------------------------------------------------------------------------
// (b) the three owned sources are accepted and land in the audit column
// ---------------------------------------------------------------------------
for (const [id, source] of [['b1', 'captain'], ['b2', 'http'], ['b3', 'profile']]) {
    test(id + " setMemberRoute accepts source '" + source + "' and the audit row names it", async () => {
        await seed();
        const result = await callRoute(route({ source }));
        assert.equal(result.applied, 'durable-only');
        assert.equal((await memberOf()).routeOverride.source, source);
        const sources = auditSources(routeAudit);
        assert.equal(sources.at(-1), source, 'the audit column must carry exactly ' + source);
        console.log('    source=' + source + ' durable=' + (await memberOf()).routeOverride.source + ' audit_rows=' + sources.length + ' audit_col8=' + sources.at(-1));
    });
}

test('c1 an omitted source still defaults to captain', async () => {
    await seed();
    await callRoute(route({}));
    assert.equal((await memberOf()).routeOverride.source, 'captain');
    assert.equal(auditSources(routeAudit).at(-1), 'captain');
    console.log('    omitted source -> durable=captain audit_col8=' + auditSources(routeAudit).at(-1));
});

test('f1 setMemberProfile carries the same clamp (same file, same write path)', async () => {
    await seed();
    const before = teamSha();
    await assert.rejects(() => callProfile({ role: 'qa', source: 'erp' }), REFUSAL);
    assert.equal(teamSha(), before, 'team.json must stay byte-identical');
    assert.equal(auditRows(profileAudit).length, 0, 'no MEMBER-PROFILE.md row may be appended');
    const applied = await callProfile({ role: 'qa', source: 'profile' });
    assert.equal(applied.source, 'profile');
    assert.equal(auditSources(profileAudit, 6).at(-1), 'profile');
    console.log('    source=erp refused (no audit row) · source=profile accepted, audit_col6=' + auditSources(profileAudit, 6).at(-1));
});

// ---------------------------------------------------------------------------
// (d) no public path can write a foreign source
// ---------------------------------------------------------------------------
function makeToolHarness() {
    const registered = new Map();
    const cap = {
        id: 'sess-captain',
        options: { provider: 'p1', model: 'm1' },
        session: { id: 'sess-captain', header: { cwd: workspace }, append() {}, requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }) },
        ctx: { tools: { view: () => ({ restrictableNames: new Set(['agent_teams_claim_task', 'agent_teams_send_message', 'subagent', 'send_message']) }) } },
        followup() { return 'followup'; },
        cancel() {},
    };
    const toolCtx = {
        logger: { debug() {}, info() {}, warn() {}, error() {} },
        tools: { register(def) { registered.set(def.name, def); } },
        agents: { get(id) { return id === 'sess-captain' ? cap : undefined; }, list() { return []; } },
        subagents: {
            followup() { return Promise.resolve('msg'); },
            [Symbol.for('dsh.subagent.deliverPrompt')]() { return Promise.resolve('deliver'); },
            sendMessage() { return Promise.resolve('msg'); },
            startActivation() { return Promise.resolve({ childId: 'child-1', result: Promise.resolve({ text: 'ok' }) }); },
            getProvider(name) { return name === 'spawn' ? { id: 'spawn', name: 'spawn', prepareContinuable() {} } : undefined; },
            list() { return ['spawn']; },
            interrupt() {},
        },
        llm: {
            async listModels(provider) { return provider === 'p3' ? [{ id: 'm3' }] : [{ id: 'm1' }]; },
            async listProviders() { return [{ id: 'p1' }, { id: 'p3' }]; },
            async resolveCallConfig(config) { return config; },
        },
        on() { return () => {}; },
        inject() {},
        systemPrompt: { section() {} },
        effect() {},
        get() { return undefined; },
    };
    return { ctx: toolCtx, captain: cap, registered };
}

test('d1 the real tool cannot write a foreign source, and every public write site hard-codes an owned one', async () => {
    await seed();
    const harness = makeToolHarness();
    indexMod.apply(harness.ctx, {
        stateDir, memberProvider: 'spawn', maxMembers: 8, maxManualMembers: 12,
        profiles: {}, toolPolicies: {}, slashCommand: false,
    });
    let outcome = 'accepted';
    try {
        await harness.registered.get('agent_teams_set_member_route').execute(
            { member_name: memberName, provider: 'p3', model: 'm3', source: 'erp' },
            { agent: harness.captain, signal: undefined },
        );
    }
    catch (error) {
        outcome = 'refused (' + String(error?.message ?? error).split('\n')[0] + ')';
    }
    const durable = await memberOf();
    assert.notEqual(durable.routeOverride?.source, 'erp', 'the tool must never persist source="erp"');
    if (outcome === 'accepted')
        assert.equal(durable.routeOverride.source, 'captain', 'the tool hard-codes captain');
    const toolsLines = readFileSync(join(LIB, 'tools.js'), 'utf8').split('\n');
    const toolSites = toolsLines.map((line, index) => (line.includes("source: 'captain',") ? index + 1 : 0)).filter((n) => n > 0);
    assert.ok(toolSites.length >= 3, 'tools.js must still hard-code source: captain at every write site');
    const indexLines = readFileSync(join(LIB, 'index.js'), 'utf8').split('\n');
    const httpSites = indexLines.map((line, index) => (line.includes("source: 'http',") ? index + 1 : 0)).filter((n) => n > 0);
    assert.ok(httpSites.length >= 5, 'the HTTP surface must still hard-code source: http');
    const migrate = readFileSync(join(REPO, 'tools', 'erp-route-migrate.mjs'), 'utf8');
    assert.match(migrate, /const ROUTE_SOURCE = 'profile';/);
    console.log('    tool outcome=' + outcome + ' durable=' + JSON.stringify(durable.routeOverride ?? null));
    console.log("    write sites: lib/tools.js captain at " + toolSites.join(', ') + ' · lib/index.js http at ' + httpSites.join(', ') + " · migrate ROUTE_SOURCE='profile'");
});

// ---------------------------------------------------------------------------
// (e) negative control: the pre-fix line really writes a foreign source
// ---------------------------------------------------------------------------
const NEW_LINE = '    const source = resolveProvenanceSource(request.source, `route change for member "${memberName}"`);';

test('e1 negative control: with the guard removed the same call WRITES source="erp"', async () => {
    await mkdir(TMP_ROOT, { recursive: true });
    const dir = await mkdtemp(join(TMP_ROOT, 'e1-'));
    try {
        // The copy needs the package node_modules for the bare @deepseek-ai imports;
        // a directory junction is enough and keeps the copy self-contained.
        const libCopy = join(dir, 'lib');
        cpSync(LIB, libCopy, { recursive: true });
        symlinkSync(join(PKG, 'node_modules'), join(dir, 'node_modules'), 'junction');
        const membersCopy = join(libCopy, 'members.js');
        const before = await readFile(membersCopy, 'utf8');
        assert.equal(before.split(NEW_LINE).length - 1, 1, 'the guard line must appear exactly once');
        const after = before.replace(NEW_LINE, "    const source = request.source ?? 'captain';");
        assert.notEqual(after, before, 'the mutation must change the copied source');
        await writeFile(membersCopy, after);
        const mutant = await import(pathToFileURL(membersCopy).href + '?v=' + Date.now());

        const mutantWorkspace = join(dir, 'workspace');
        const mutantTeamDir = join(mutantWorkspace, stateDir, teamId);
        await mkdir(mutantTeamDir, { recursive: true });
        const teamPath = join(mutantTeamDir, 'team.json');
        await writeFile(teamPath, JSON.stringify(baseTeam(memberRec()), null, 2));
        const mutantCaptain = { ...captain, session: { ...captain.session, header: { cwd: mutantWorkspace } } };

        // Fix first, same bytes: refused.
        await assert.rejects(() => callRoute(route({ source: 'erp' })), REFUSAL);
        // Old code, same call: accepted and written.
        const written = await mutant.setMemberRoute(ctx, {}, selections, mutantCaptain, stateDir, teamId, memberName, route({ source: 'erp' }));
        assert.equal(written.applied, 'durable-only');
        const durable = JSON.parse(await readFile(teamPath, 'utf8')).members[0];
        assert.equal(durable.routeOverride.source, 'erp', 'the pre-fix code must write the foreign source');
        const audit = await readFile(join(mutantWorkspace, 'docs', 'log', 'MODEL-SWITCH.md'), 'utf8');
        assert.match(audit, /\| erp \|$|\| erp\s*\|/m, 'the pre-fix code must also write an audit row naming it');
        console.log('    applies=1 old_bytes=' + before.length + ' new_bytes=' + after.length
            + ' delta_bytes=' + (after.length - before.length)
            + ' durable_source=' + JSON.stringify(durable.routeOverride.source)
            + ' audit_row_written=true');
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
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
        console.log('ok ' + (index + 1) + ' ' + item.name);
    }
    catch (error) {
        failed += 1;
        console.log('not ok ' + (index + 1) + ' ' + item.name);
        console.log('  ' + String(error?.stack ?? error).split('\n').slice(0, 7).join('\n  '));
    }
}
console.log('# ' + passed + '/' + cases.length + ' passed, ' + failed + ' failed');
try { await rm(workspace, { recursive: true, force: true }); } catch {}
process.exit(failed === 0 ? 0 : 1);
