#!/usr/bin/env node
/**
 * t54 automatic-fallback audit suite (shipped harness — lives in tests/).
 *
 *   node tests/t54-auto-fallback-audit.mjs
 *
 * Repairs t51 C6: when a member DEGRADES ITSELF because its provider died,
 * lib/members.js used to write team.json and nothing else, so docs/log/
 * MODEL-SWITCH.md only ever showed the captain-driven switch. This suite drives
 * the exact production function the agent/request-error handler now calls —
 * members.js recordAutoFallback — against a real workspace on disk, plus the
 * pure eligibility rule it depends on.
 *
 * Deliberate deviation from the repair brief, recorded in docs/kiem-thu:
 * the audit row reports applied='live-and-durable' (NOT 'auto-fallback')
 * because t51 C6 — the acceptance this repair exists to satisfy, and a file
 * this task must not edit — asserts exactly that value; provenance stays
 * visible in the source column as `auto:<child session id>`.
 */
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// <repo>/tests/ -> <repo>/packages/dsh-agent-teams/lib
const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'dsh-agent-teams', 'lib');
const libModule = (file) => pathToFileURL(join(LIB, file)).href;
const membersMod = await import(libModule('members.js'));

const { isFallbackFailureCode, selectFallbackRoute, recordAutoFallback } = membersMod;

const cases = [];
const test = (name, fn) => cases.push({ name, fn });

const PRIMARY = { provider: 'p1', model: 'm1' };
const FALLBACK = { provider: 'p2', model: 'm3' };
const CHILD = 'sess-child-1';

const member = (name, extra = {}) => ({ id: CHILD, name, provider: 'p1', model: 'm1', joinedAt: 1, status: 'idle', ...extra });
const teamFixture = (id, members) => ({ id, name: id.toUpperCase(), captainSessionId: 'sess-captain', createdAt: 1, taskSeq: 0, phase: 'running', members, tasks: [] });

const teamPath = (workspace, id) => join(workspace, '.agent-teams', id, 'team.json');
const auditPath = (workspace) => join(workspace, 'docs', 'log', 'MODEL-SWITCH.md');

async function seed(workspace, team) {
    const root = join(workspace, '.agent-teams', team.id);
    await mkdir(root, { recursive: true });
    await writeFile(teamPath(workspace, team.id), JSON.stringify(team, null, 2));
}
const teamOf = async (workspace, id) => JSON.parse(await readFile(teamPath(workspace, id), 'utf8'));

/** Parse the audit table into records, mirroring t51's parseAudit cell mapping. */
async function auditRows(workspace) {
    let text;
    try {
        text = await readFile(auditPath(workspace), 'utf8');
    }
    catch {
        return [];
    }
    return text.split('\n')
        .filter((line) => line.startsWith('| ') && !line.startsWith('| at ') && !line.startsWith('| ---'))
        .map((line) => {
            const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
            if (cells.length < 7)
                return undefined;
            return { ts: cells[0], team: cells[1], member: cells[2], previous: cells[3], target: cells[4], applied: cells[5], source: cells[6], raw: line };
        })
        .filter((row) => row !== undefined);
}

/** A ctx with just what the audit path touches, plus a log of warnings. */
function makeCtx() {
    const warnings = [];
    return {
        warnings,
        ctx: {
            logger: { debug() {}, info() {}, warn(message) { warnings.push(String(message)); }, error() {} },
        },
    };
}

const degrade = (ctx, workspace, teamId, memberName, extra = {}) => recordAutoFallback(ctx, {
    stateRoot: join(workspace, '.agent-teams'),
    teamId,
    memberName,
    previous: PRIMARY,
    fallback: FALLBACK,
    workspace,
    by: CHILD,
    at: Date.UTC(2026, 9, 31, 19, 0, 0),
    ...extra,
});

async function withTeam(fixture, fn) {
    const workspace = await mkdtemp(join(tmpdir(), 't54-'));
    try {
        await seed(workspace, fixture);
        return await fn({ workspace });
    }
    finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

// ---------------------------------------------------------------------------
// (a)(b) one automatic degradation writes exactly one correct audit row
// ---------------------------------------------------------------------------
test('a1 one degradation appends exactly one row, applied live-and-durable', async () => {
    await withTeam(teamFixture('team-a1', [member('alice')]), async ({ workspace }) => {
        const { ctx } = makeCtx();
        const before = await auditRows(workspace);
        assert.equal(before.length, 0);
        const changed = await degrade(ctx, workspace, 'team-a1', 'alice');
        assert.equal(changed, true);
        const rows = await auditRows(workspace);
        assert.equal(rows.length, 1, 'exactly one row for one degradation');
        assert.equal(rows[0].applied, 'live-and-durable');
        assert.equal(rows[0].team, 'team-a1');
        assert.equal(rows[0].member, 'alice');
        assert.equal(rows[0].source, `auto:${CHILD}`);
        assert.equal(rows[0].ts, new Date(Date.UTC(2026, 9, 31, 19, 0, 0)).toISOString());
    });
});

test('a2 previous names the dead route, target names the fallback', async () => {
    await withTeam(teamFixture('team-a2', [member('alice')]), async ({ workspace }) => {
        const { ctx } = makeCtx();
        await degrade(ctx, workspace, 'team-a2', 'alice');
        const [row] = await auditRows(workspace);
        assert.equal(row.previous, 'p1/m1');
        assert.ok(row.target.includes('p2/m3'), `target should name the fallback, got ${row.target}`);
        assert.notEqual(row.previous, row.target);
    });
});

test('a3 the row satisfies the exact t51 C6 predicate', async () => {
    await withTeam(teamFixture('team-a3', [member('alice')]), async ({ workspace }) => {
        const { ctx } = makeCtx();
        await degrade(ctx, workspace, 'team-a3', 'alice');
        const rows = await auditRows(workspace);
        const found = rows.find((row) => row.applied === 'live-and-durable'
            && row.target.includes(FALLBACK.provider + '/' + FALLBACK.model)
            && row.previous.includes(PRIMARY.provider));
        assert.ok(found !== undefined, `no row matches t51 C6: ${JSON.stringify(rows)}`);
    });
});

test('a4 team.json spine is untouched and only the fallback flags move', async () => {
    await withTeam(teamFixture('team-a4', [member('alice')]), async ({ workspace }) => {
        const { ctx } = makeCtx();
        await degrade(ctx, workspace, 'team-a4', 'alice');
        const saved = await teamOf(workspace, 'team-a4');
        const alice = saved.members.find((item) => item.name === 'alice');
        assert.equal(alice.provider, 'p1');
        assert.equal(alice.model, 'm1');
        assert.equal(alice.fallbackActive, true);
        assert.equal(alice.activeProvider, 'p2');
        assert.equal(alice.activeModel, 'm3');
        assert.equal(alice.routeOverride, undefined);
    });
});

test('a5 every degradation appends its own row (no collapsing)', async () => {
    await withTeam(teamFixture('team-a5', [member('alice')]), async ({ workspace }) => {
        const { ctx } = makeCtx();
        await degrade(ctx, workspace, 'team-a5', 'alice');
        await degrade(ctx, workspace, 'team-a5', 'alice', { at: Date.UTC(2026, 9, 31, 19, 5, 0) });
        const rows = await auditRows(workspace);
        assert.equal(rows.length, 2);
        assert.notEqual(rows[0].ts, rows[1].ts);
    });
});

// ---------------------------------------------------------------------------
// (e) the audit copy can never break the degradation or the retry
// ---------------------------------------------------------------------------
test('a6 an unwritable audit path still persists the fallback and never throws', async () => {
    await withTeam(teamFixture('team-a6', [member('alice')]), async ({ workspace }) => {
        const { ctx, warnings } = makeCtx();
        // A regular FILE where the docs/ directory must be: mkdir fails ENOTDIR.
        await writeFile(join(workspace, 'docs'), 'not a directory', 'utf8');
        const changed = await degrade(ctx, workspace, 'team-a6', 'alice');
        assert.equal(changed, true);
        const saved = await teamOf(workspace, 'team-a6');
        const alice = saved.members.find((item) => item.name === 'alice');
        assert.equal(alice.fallbackActive, true);
        assert.equal(alice.activeProvider, 'p2');
        assert.equal(warnings.length, 1, `expected one warning, got ${JSON.stringify(warnings)}`);
        assert.ok(warnings[0].includes('MODEL-SWITCH.md'));
    });
});

test('a7 an unknown member writes nothing and reports false', async () => {
    await withTeam(teamFixture('team-a7', [member('alice')]), async ({ workspace }) => {
        const { ctx } = makeCtx();
        const text = await readFile(teamPath(workspace, 'team-a7'), 'utf8');
        const changed = await degrade(ctx, workspace, 'team-a7', 'ghost');
        assert.equal(changed, false);
        assert.equal(await readFile(teamPath(workspace, 'team-a7'), 'utf8'), text);
        assert.equal((await auditRows(workspace)).length, 0);
    });
});

test('a8 an unknown team writes nothing (no throw)', async () => {
    await withTeam(teamFixture('team-a8', [member('alice')]), async ({ workspace }) => {
        const { ctx } = makeCtx();
        assert.equal(await degrade(ctx, workspace, 'team-missing', 'alice'), false);
        assert.equal((await auditRows(workspace)).length, 0);
    });
});

// ---------------------------------------------------------------------------
// (f)(g)(h)(i)(j) eligibility rule
// ---------------------------------------------------------------------------
test('b1 the five original codes stay eligible', async () => {
    const withFallback = { retry: true, switched: true, selection: FALLBACK };
    for (const code of ['QUOTA', 'RATE_LIMIT', 'AUTH', 'MISSING_CREDENTIAL', 'NO_ADAPTER']) {
        assert.equal(isFallbackFailureCode(code), true, code);
        assert.deepEqual(selectFallbackRoute(PRIMARY, FALLBACK, code, false), withFallback, code);
    }
});

test('b2 INVALID_REQUEST + dead-route message is eligible', async () => {
    for (const message of ['400 Model is unavailable.', 'model_not_found: minimax-m3.1', 'the model does not exist', 'no such model: kimi-k3']) {
        assert.equal(isFallbackFailureCode('INVALID_REQUEST', message), true, message);
        assert.equal(selectFallbackRoute(PRIMARY, FALLBACK, 'INVALID_REQUEST', false, message).retry, true, message);
    }
});

test('b3 INVALID_REQUEST + our own bad payload is NOT eligible', async () => {
    for (const message of ['bad payload', 'prompt is empty', '400 INVALID_ARGUMENT: messages[0].role', '']) {
        assert.equal(isFallbackFailureCode('INVALID_REQUEST', message), false, message);
        assert.equal(selectFallbackRoute(PRIMARY, FALLBACK, 'INVALID_REQUEST', false, message).retry, false, message);
    }
    // A non-INVALID_REQUEST code never degrades on message alone.
    assert.equal(isFallbackFailureCode('INTERNAL', 'Model is unavailable.'), false);
    assert.equal(isFallbackFailureCode('INVALID_REQUEST', undefined), false);
});

test('b4 no fallback route means no degradation and no row', async () => {
    assert.equal(selectFallbackRoute(PRIMARY, undefined, 'QUOTA', false).retry, false);
    assert.equal(selectFallbackRoute(PRIMARY, undefined, 'INVALID_REQUEST', false, 'Model is unavailable.').retry, false);
});

test('b5 alreadySwitched means no second degradation', async () => {
    assert.deepEqual(selectFallbackRoute(FALLBACK, FALLBACK, 'QUOTA', true), { retry: false, switched: true, selection: FALLBACK });
});

// ---------------------------------------------------------------------------
// (d) the production handler still wires the retry around the audit
// ---------------------------------------------------------------------------
test('c1 the request-error handler records before it authorizes the retry', async () => {
    const source = await readFile(join(LIB, 'members.js'), 'utf8');
    const start = source.indexOf("childCtx.on('agent/request-error'");
    assert.ok(start > 0, 'handler not found');
    const handler = source.slice(start, start + 3000);
    const record = handler.indexOf('recordAutoFallback(ctx, {');
    const retry = handler.indexOf("return { kind: 'retry' };");
    // The fall-through lives just past the 3000-char window, so search the file.
    const next = source.indexOf('return next();', source.indexOf("return { kind: 'retry' };", start));
    assert.ok(record > 0, 'handler no longer calls recordAutoFallback');
    assert.ok(retry > record, 'the audit call must precede the retry it authorizes');
    assert.ok(next > retry, 'a non-retry branch must still fall through to next()');
    assert.ok(handler.includes('previous: current'), 'the row must name the route that died');
    assert.ok(handler.includes('.catch((error) => {'), 'the audit must not be able to fail the retry');
});

// ---------------------------------------------------------------------------
const results = [];
for (const item of cases) {
    try {
        await item.fn();
        results.push({ name: item.name, ok: true });
        console.log(`ok ${results.length} ${item.name}`);
    }
    catch (error) {
        results.push({ name: item.name, ok: false, error });
        console.log(`not ok ${results.length} ${item.name}`);
        console.log(`  ${error instanceof Error ? error.message : String(error)}`);
    }
}
const failed = results.filter((item) => !item.ok).length;
console.log(`# ${results.length - failed}/${results.length} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
