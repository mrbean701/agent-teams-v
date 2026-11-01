#!/usr/bin/env node
// tests/t82-erp-migrate-live.mjs — t82: prove that a routeOverride written by
// tools/erp-route-migrate.mjs (source 'profile') governs the NEXT REAL turn of a
// member child session, and that the negative control (before migration) used the
// member's own declared route instead.
//
// Self-locating: CLI, profile and $DSH_HOME come from tools/test/lib/dsh-cli.mjs.
// Live mode boots 3 headless sessions of the draft profile (never the desktop
// profile) inside tests/tmp/e2e-t82/run-<stamp>/{ws-a,ws-b}. --analyze re-scores a
// finished run from its artifacts and boots nothing.
//
// C1 fixture layout + 4 distinct routes present in the running catalog
// C2 migrate --apply EXIT 0, successor routeOverride has all 6 fields (source 'profile')
// C3 child of the migrated member sends its request with the MIGRATED route
// C4 negative control: before migration the child used its own declared route (different)
// C5 the real ERP team.json keeps its sha256 and size (read-only proof)
// C6 docs/kiem-thu/t82-erp-migrate-live.md holds the C table, the boot count and the limits
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cli = await import(pathToFileURL(join(repoRoot, 'tools', 'test', 'lib', 'dsh-cli.mjs')).href);

const CLI = cli.DESKTOP_CLI;
const DSH_HOME = cli.DSH_HOME;
const PROFILE = cli.TEST_PROFILE;
const RUN_ROOT = join(repoRoot, 'tests', 'tmp', 'e2e-t82');
const MIGRATE = join(repoRoot, 'tools', 'erp-route-migrate.mjs');
const DOC = join(repoRoot, 'docs', 'kiem-thu', 't82-erp-migrate-live.md');
const PROFILE_PATCH = join(DSH_HOME, 'profiles', PROFILE, 'cordis.patch.yml');
const ERP_TEAM = resolve(repoRoot, '..', 'ERP', '.agent-teams', 'erp-erp', 'team.json');
const ERP_SHA = '9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e';
const ERP_SIZE = 1533117;
const DOC_MAX_LINES = 80;

const TEAM = 'e2e-t82';
const P = 'command-code-goat';
const ALPHA = { provider: P, model: 'deepseek/deepseek-v4-pro', reasoningEffort: 'high' };
const ALPHA2 = { provider: P, model: 'deepseek/deepseek-v4.1-flash', reasoningEffort: 'high' };
const BETA = { provider: P, model: 'deepseek/deepseek-v4-flash', reasoningEffort: 'high' };
const BETA2 = { provider: P, model: 'deepseek/deepseek-v4-flash-fast', reasoningEffort: 'high' };
const ROUTES = [ALPHA, ALPHA2, BETA, BETA2];
const MEMBERS = [
    { name: 'alpha', role: 'engineer', route: ALPHA },
    { name: 'alpha-2', role: 'engineer', route: ALPHA2 },
    { name: 'beta', role: 'qa', route: BETA },
    { name: 'beta-2', role: 'qa', route: BETA2 },
];
const TARGET = 'alpha-2';
const PROBE_TASK = 'Reply with the single word done. Do not use any tool.';

function psQuote(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }

function runHeadless(promptText, cwd, extraArgs = [], timeoutMs = 900000) {
    const args = ['--profile', PROFILE, '--json', ...extraArgs, '-'];
    const command = '& ' + psQuote(CLI) + ' ' + args.map(psQuote).join(' ') + '; exit $LASTEXITCODE';
    const startedAt = Date.now();
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd, input: promptText, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return {
        command: 'powershell -NoProfile -Command "' + command + '"  < stdin(' + promptText.length + ' chars)',
        status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '',
        error: result.error === undefined ? undefined : String(result.error),
        elapsedMs: Date.now() - startedAt,
    };
}

async function exists(path) { try { await stat(path); return true; } catch { return false; } }
async function sha256Of(path) {
    const buf = await readFile(path);
    return { sha256: createHash('sha256').update(buf).digest('hex'), size: buf.length, mtimeMs: (await stat(path)).mtimeMs };
}
function parseEvents(text) {
    const events = [];
    for (const line of text.split('\n')) {
        if (line.trim().startsWith('{') === false) continue;
        try { events.push(JSON.parse(line)); } catch { /* partial line */ }
    }
    return events;
}
function toolExchange(stdout) {
    const calls = new Map();
    for (const event of parseEvents(stdout)) {
        if (event.type === 'tool_call') calls.set(event.callId, { tool: event.tool, input: event.input, result: '', status: undefined });
        if (event.type === 'tool_result') {
            const entry = calls.get(event.callId) ?? { tool: '?', input: undefined };
            entry.result = typeof event.result === 'string' ? event.result : JSON.stringify(event.result ?? '');
            entry.status = event.status;
            calls.set(event.callId, entry);
        }
    }
    return [...calls.values()];
}
function finalText(stdout) {
    const finals = parseEvents(stdout).filter((e) => e.type === 'final');
    return finals.length === 0 ? '' : String(finals[finals.length - 1].text ?? '');
}
function sessionEventId(stdout) {
    const ev = parseEvents(stdout).find((e) => e.type === 'session');
    return ev === undefined ? undefined : ev.sessionId;
}
function routeOf(record) {
    if (record === undefined || record === null) return undefined;
    return { provider: record.provider, model: record.model, reasoningEffort: record.reasoningEffort };
}
function label(route) {
    if (route === undefined) return '(none)';
    return route.provider + '/' + route.model + (route.reasoningEffort ? ' (' + route.reasoningEffort + ')' : '');
}
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function readTeam(workspace) {
    const stateRoot = join(workspace, '.agent-teams');
    const dirs = (await exists(stateRoot)) ? await readdir(stateRoot) : [];
    const files = [];
    for (const dir of dirs) {
        const candidate = join(stateRoot, dir, 'team.json');
        if (await exists(candidate)) files.push({ dir, path: candidate });
    }
    for (const file of files) {
        const parsed = await readJson(file.path);
        if (parsed && Array.isArray(parsed.members)) return { team: parsed, path: file.path, dir: file.dir, files: files.map((f) => f.path) };
    }
    return { team: undefined, path: undefined, dir: undefined, files: files.map((f) => f.path) };
}
function memberNamed(team, name) { return team?.members?.find((m) => m.name === name); }

// ---- child transcripts: multi-frame zstd, so scan the frame magic and inflate each frame
async function findTranscript(sessionId) {
    if (sessionId === undefined || sessionId === '') return undefined;
    const root = join(DSH_HOME, 'sessions');
    if (await exists(root) === false) return undefined;
    for (const slug of await readdir(root)) {
        const dir = join(root, slug, sessionId);
        if (await exists(dir) === false) continue;
        for (const name of await readdir(dir)) if (name.endsWith('.zstd')) return join(dir, name);
    }
    return undefined;
}
async function readTranscript(path) {
    const raw = await readFile(path);
    const magic = [0x28, 0xb5, 0x2f, 0xfd];
    const offsets = [];
    for (let i = 0; i <= raw.length - 4; i += 1) {
        if (raw[i] === magic[0] && raw[i + 1] === magic[1] && raw[i + 2] === magic[2] && raw[i + 3] === magic[3]) offsets.push(i);
    }
    let text = '';
    for (let k = 0; k < offsets.length; k += 1) {
        const slice = raw.subarray(offsets[k], k + 1 < offsets.length ? offsets[k + 1] : raw.length);
        try { text += zstdDecompressSync(slice).toString('utf8'); } catch { /* frame flushed mid-write */ }
    }
    return { events: parseEvents(text), frames: offsets.length, bytes: raw.length };
}
// Collect every {provider, model} pair that exists anywhere inside one event.
function routePairs(event) {
    const found = [];
    const walk = (node, depth) => {
        if (node === null || typeof node !== 'object' || depth > 6) return;
        if (typeof node.provider === 'string' && typeof node.model === 'string') found.push({ provider: node.provider, model: node.model });
        for (const value of Object.values(node)) walk(value, depth + 1);
    };
    walk(event, 0);
    return found;
}
function headerPairs(transcript) {
    const pairs = [];
    for (const event of transcript.events) {
        if (event.type !== 'request/header') continue;
        for (const pair of routePairs(event)) pairs.push(pair);
    }
    return pairs;
}

// ------------------------------------------------------------------ live steps
const checks = [];
function check(id, ok, detail, evidence) {
    checks.push({ id, ok: ok === true, detail, evidence });
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' \u2014 ' + detail);
}

function planArg() {
    const members = MEMBERS.map((m) => ({ name: m.name, role: m.role, provider: m.route.provider, model: m.route.model, reasoning_effort: m.route.reasoningEffort }));
    return JSON.stringify({ name: TEAM, description: 't82 migrate routeOverride live proof', approval: 'automatic', plan: { members, tasks: [] } });
}
const createArgs = planArg();
const removeArgs = (name) => JSON.stringify({ name });
const taskArgs = JSON.stringify({ subject: 't82 route probe', description: PROBE_TASK, assignee: TARGET });

const promptA = 'You are the captain of a test team. Execute these steps in this exact order, one tool call at a time. '
    + 'Do not ask questions, do not edit files. '
    + 'STEP 1: call agent_teams_create with exactly these arguments ' + createArgs + '. '
    + 'STEP 2: call agent_teams_remove_member with exactly ' + removeArgs('alpha') + '. '
    + 'STEP 3: call agent_teams_remove_member with exactly ' + removeArgs('beta') + '. '
    + 'STEP 4: call agent_teams_create_task with exactly ' + taskArgs + '. '
    + 'STEP 5: call agent_teams_status with {} and keep the ' + TARGET + ' line. '
    + 'STEP 6: call agent_teams_status with {} again. '
    + 'STEP 7: call agent_teams_status with {} repeatedly, up to ten times, until the ' + TARGET + ' line no longer says working. '
    + 'Then reply with one single line: T82A target=<provider/model shown for ' + TARGET + '>';

const promptB = 'You are the captain of a test team. Execute these steps in this exact order, one tool call at a time. '
    + 'Do not ask questions, do not edit files. '
    + 'STEP 1: call agent_teams_create with exactly these arguments ' + createArgs + '. '
    + 'STEP 2: call agent_teams_remove_member with exactly ' + removeArgs('alpha') + '. '
    + 'STEP 3: call agent_teams_remove_member with exactly ' + removeArgs('beta') + '. '
    + 'Then reply with one single line: T82B created';

const promptC = 'A team named ' + TEAM + ' already exists in this workspace and you lead it. '
    + 'Do not ask questions, do not edit files. '
    + 'STEP 1: call agent_teams_create_task with exactly ' + taskArgs + '. '
    + 'STEP 2: call agent_teams_status with {} and keep the ' + TARGET + ' line. '
    + 'STEP 3: call agent_teams_status with {} again. '
    + 'STEP 4: call agent_teams_status with {} repeatedly, up to ten times, until the ' + TARGET + ' line no longer says working. '
    + 'Then reply with one single line: T82C target=<provider/model shown for ' + TARGET + '>';

function stampNow() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

async function runLive() {
    const stamp = stampNow();
    const runDir = join(RUN_ROOT, 'run-' + stamp);
    const wsA = join(runDir, 'ws-a');
    const wsB = join(runDir, 'ws-b');
    await mkdir(wsA, { recursive: true });
    await mkdir(wsB, { recursive: true });
    const meta = { stamp, runDir, wsA, wsB, profile: PROFILE, boots: [], migrate: undefined, erp: {} };

    // --- C5 before: the real ERP file is only ever read
    meta.erp.before = await sha256Of(ERP_TEAM);

    // --- boot A1: undeclared (pre-migration) behaviour of the target member
    const bootA = runHeadless(promptA, wsA);
    await writeFile(join(runDir, 'sessionA1.stdout.txt'), bootA.stdout, 'utf8');
    await writeFile(join(runDir, 'sessionA1.stderr.txt'), bootA.stderr, 'utf8');
    const teamAAfter = await readTeam(wsA);
    if (teamAAfter.path !== undefined) await writeFile(join(runDir, 'teamA.json'), JSON.stringify(teamAAfter.team, null, 2), 'utf8');
    const memberA = gov(teamAAfter.team, TARGET);
    meta.boots.push({ id: 'A1', cwd: wsA, exit: bootA.status, elapsedMs: bootA.elapsedMs, sessionId: sessionEventId(bootA.stdout), finalText: finalText(bootA.stdout), childId: memberA?.id ?? '' });

    // --- boot B1: a second workspace whose team record becomes the migration fixture
    const bootB = runHeadless(promptB, wsB);
    await writeFile(join(runDir, 'sessionB1.stdout.txt'), bootB.stdout, 'utf8');
    await writeFile(join(runDir, 'sessionB1.stderr.txt'), bootB.stderr, 'utf8');
    const captainB = sessionEventId(bootB.stdout);
    const teamBBefore = await readTeam(wsB);
    if (teamBBefore.path !== undefined) await writeFile(join(runDir, 'teamB-before.json'), JSON.stringify(teamBBefore.team, null, 2), 'utf8');
    meta.boots.push({ id: 'B1', cwd: wsB, exit: bootB.status, elapsedMs: bootB.elapsedMs, sessionId: captainB, finalText: finalText(bootB.stdout), childId: '' });

    // --- migrate the COPY in ws-b (never the real ERP file)
    if (teamBBefore.path !== undefined) {
        const before = await sha256Of(teamBBefore.path);
        const backup = join(runDir, 'backup-b.json');
        const migrate = spawnSync(process.execPath, [MIGRATE, '--team', teamBBefore.path, '--apply', '--backup', backup,
            '--expect-sha256', before.sha256, '--by', 't82'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
        await writeFile(join(runDir, 'migrate-stdout.txt'), migrate.stdout ?? '', 'utf8');
        await writeFile(join(runDir, 'migrate-stderr.txt'), migrate.stderr ?? '', 'utf8');
        const after = await sha256Of(teamBBefore.path);
        meta.migrate = { exit: migrate.status, command: 'node tools/erp-route-migrate.mjs --team <ws-b team.json> --apply --backup <runDir>/backup-b.json --expect-sha256 <sha> --by t82', shaBefore: before.sha256, shaAfter: after.sha256, backupCreated: await exists(backup) };
        const teamBAfterMigrate = await readTeam(wsB);
        if (teamBAfterMigrate.path !== undefined) await writeFile(join(runDir, 'teamB-after-migrate.json'), JSON.stringify(teamBAfterMigrate.team, null, 2), 'utf8');
    } else {
        meta.migrate = { exit: null, note: 'ws-b team.json not found; migration skipped' };
    }

    // --- boot B2: resume the same captain session, then the migrated member must spawn
    const bootC = runHeadless(promptC, wsB, captainB === undefined ? [] : ['--session-id', captainB]);
    await writeFile(join(runDir, 'sessionB2.stdout.txt'), bootC.stdout, 'utf8');
    await writeFile(join(runDir, 'sessionB2.stderr.txt'), bootC.stderr, 'utf8');
    const teamBFinal = await readTeam(wsB);
    if (teamBFinal.path !== undefined) await writeFile(join(runDir, 'teamB-after-b2.json'), JSON.stringify(teamBFinal.team, null, 2), 'utf8');
    const memberB = gov(teamBFinal.team, TARGET);
    meta.boots.push({ id: 'B2', cwd: wsB, exit: bootC.status, elapsedMs: bootC.elapsedMs, sessionId: sessionEventId(bootC.stdout), finalText: finalText(bootC.stdout), childId: memberB?.id ?? '', resumedFrom: captainB ?? '' });

    // --- child transcripts (the real proof of which route the child used)
    const childA = meta.boots[0].childId;
    const childB = meta.boots[2].childId;
    const transcriptA = await findTranscript(childA);
    const transcriptB = await findTranscript(childB);
    const headersA = transcriptA === undefined ? [] : headerPairs(await readTranscript(transcriptA));
    const headersB = transcriptB === undefined ? [] : headerPairs(await readTranscript(transcriptB));
    await writeFile(join(runDir, 'childA-headers.json'), JSON.stringify({ childId: childA, transcript: transcriptA, pairs: headersA }, null, 2), 'utf8');
    await writeFile(join(runDir, 'childB-headers.json'), JSON.stringify({ childId: childB, transcript: transcriptB, pairs: headersB }, null, 2), 'utf8');
    meta.children = { childA, childB, transcriptA, transcriptB };

    // --- C5 after
    meta.erp.after = await sha256Of(ERP_TEAM);
    await writeFile(join(runDir, 'erp-before.json'), JSON.stringify(meta.erp.before, null, 2), 'utf8');
    await writeFile(join(runDir, 'erp-after.json'), JSON.stringify(meta.erp.after, null, 2), 'utf8');
    await writeFile(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    return runDir;
}

function gov(team, name) {
    return team?.members?.find((m) => m.name === name);
}

// ------------------------------------------------------------------ scoring (works live and from --analyze)
async function evaluate(runDir) {
    const meta = await readJson(join(runDir, 'meta.json'));
    const boots = Array.isArray(meta.boots) ? meta.boots : [];
    const bootCount = boots.length;
    const results = [];
    const record = (id, ok, detail, evidence) => { results.push({ id, ok: ok === true, detail, evidence }); };

    // C1 — fixture layout of the plugin's own state dir + four distinct catalog routes
    const teamA = await readJson(join(runDir, 'teamA.json'));
    const teamDir = join(meta.wsA, '.agent-teams', TEAM, 'team.json');
    const layoutOk = existsSync(teamDir);
    const patchText = existsSync(PROFILE_PATCH) ? await readFile(PROFILE_PATCH, 'utf8') : '';
    const catalogMissing = ROUTES.filter((r) => patchText.includes(r.model) === false || patchText.includes(r.provider) === false).map(label);
    const distinct = new Set(ROUTES.map((r) => r.provider + '/' + r.model)).size === 4;
    const pairRecords = ['alpha', 'alpha-2', 'beta', 'beta-2'].map((n) => {
        const m = memberNamed(teamA, n);
        return { name: n, status: m?.status, route: label(routeOf(m)) };
    });
    const statusOk = pairRecords.every((p) => p.status === 'removed' || p.status === 'idle' || p.status === 'working');
    const removedOk = memberNamed(teamA, 'alpha')?.status === 'removed' && memberNamed(teamA, 'beta')?.status === 'removed';
    const c1 = layoutOk && catalogMissing.length === 0 && distinct && statusOk && removedOk;
    record('C1', c1, c1
        ? 'fixture at <ws-a>/.agent-teams/' + TEAM + '/team.json with 2 pairs (alpha/alpha-2, beta/beta-2), 4 distinct routes, all in the running catalog'
        : 'layout=' + layoutOk + ' catalogMissing=' + JSON.stringify(catalogMissing) + ' distinct=' + distinct + ' removedBases=' + removedOk,
        { teamPath: teamDir, pairRecords, catalogMissing, distinct });

    // C2 — migrate --apply on the COPY: exit 0, successor override carries all six fields
    const migrate = meta.migrate ?? {};
    const migrateOut = await readFile(join(runDir, 'migrate-stdout.txt'), 'utf8').catch(() => '');
    const teamBAfter = await readJson(join(runDir, 'teamB-after-migrate.json')).catch(() => undefined);
    const migratedMember = memberNamed(teamBAfter, TARGET);
    const override = migratedMember?.routeOverride;
    const sixKeys = ['provider', 'model', 'reasoningEffort', 'source', 'at', 'by'];
    const missingKeys = override === undefined ? sixKeys : sixKeys.filter((k) => Object.hasOwn(override, k) === false);
    const overrideOk = override !== undefined && missingKeys.length === 0
        && override.provider === ALPHA.provider && override.model === ALPHA.model && override.source === 'profile'
        && typeof override.at === 'number' && String(override.by) === 't82';
    const pairsPrinted = migrateOut.includes('alpha-2') && migrateOut.includes('beta-2');
    const c2 = migrate.exit === 0 && overrideOk && pairsPrinted;
    record('C2', c2, c2
        ? 'migrate --apply EXIT 0; ' + TARGET + ' routeOverride = ' + label(routeOf(override)) + ' source="profile" by="t82" at=' + override.at + '; pair table printed'
        : 'exit=' + migrate.exit + ' override=' + JSON.stringify(override ?? null) + ' missingKeys=' + JSON.stringify(missingKeys) + ' pairsPrinted=' + pairsPrinted,
        { command: migrate.command, exit: migrate.exit, routeOverride: override ?? null, shaBefore: migrate.shaBefore, shaAfter: migrate.shaAfter, pairsPrinted });

    // C3 — the migrated member's real child session sent its request on the migrated route
    const childB = await readJson(join(runDir, 'childB-headers.json')).catch(() => ({ pairs: [] }));
    const bFirst = childB.pairs?.[0];
    const c3 = bFirst !== undefined && bFirst.provider === ALPHA.provider && bFirst.model === ALPHA.model && bFirst.model !== ALPHA2.model;
    record('C3', c3, c3
        ? 'child ' + childB.childId + ' request/header = ' + bFirst.provider + '/' + bFirst.model + ' = the MIGRATED route (declared was ' + ALPHA2.model + ')'
        : 'childId=' + (childB.childId || '(none)') + ' firstHeader=' + JSON.stringify(bFirst ?? null) + ' pairs=' + JSON.stringify(childB.pairs ?? []).slice(0, 400),
        { childId: childB.childId, transcript: childB.transcript, firstHeader: bFirst ?? null, pairs: (childB.pairs ?? []).slice(0, 4) });

    // C4 — negative control: before migration the same member used its own declared route
    const childA = await readJson(join(runDir, 'childA-headers.json')).catch(() => ({ pairs: [] }));
    const aFirst = childA.pairs?.[0];
    const c4 = aFirst !== undefined && aFirst.model === ALPHA2.model && aFirst.model !== ALPHA.model;
    record('C4', c4, c4
        ? 'pre-migration child ' + childA.childId + ' request/header = ' + aFirst.provider + '/' + aFirst.model + ' = its declared route, different from the migrated one'
        : 'childId=' + (childA.childId || '(none)') + ' firstHeader=' + JSON.stringify(aFirst ?? null),
        { childId: childA.childId, transcript: childA.transcript, firstHeader: aFirst ?? null });

    // C5 — the real ERP record was never written
    const before = meta.erp?.before ?? {};
    const after = meta.erp?.after ?? {};
    const c5 = before.sha256 === ERP_SHA && after.sha256 === ERP_SHA && before.size === ERP_SIZE && after.size === ERP_SIZE
        && before.mtimeMs === after.mtimeMs;
    record('C5', c5, c5
        ? 'real ERP team.json identical: sha256 ' + ERP_SHA + ', ' + ERP_SIZE + ' B, mtime unchanged'
        : 'before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after),
        { path: ERP_TEAM, before, after, expectedSha: ERP_SHA, expectedSize: ERP_SIZE });

    // C6 — the report exists and carries the table, the boot count and the limits
    const docText = existsSync(DOC) ? await readFile(DOC, 'utf8') : '';
    const docLines = docText === '' ? 0 : docText.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length;
    const ids = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
    const missingIds = ids.filter((id) => docText.includes(id) === false);
    const c6 = docText !== '' && docLines <= DOC_MAX_LINES && missingIds.length === 0
        && docText.includes('tests/tmp/e2e-t82') && /boot/i.test(docText);
    record('C6', c6, c6
        ? 'docs/kiem-thu/t82-erp-migrate-live.md ' + docLines + ' lines (<= ' + DOC_MAX_LINES + '), table C1..C6, artifact dir and boot count recorded'
        : 'docLines=' + docLines + ' missingIds=' + JSON.stringify(missingIds) + ' hasArtifactDir=' + docText.includes('tests/tmp/e2e-t82') + ' hasBoot=' + /boot/i.test(docText),
        { doc: DOC, lines: docLines, limit: DOC_MAX_LINES, missingIds });

    console.log('');
    for (const item of results) console.log((item.ok ? 'PASS ' : 'FAIL ') + item.id + ' \u2014 ' + item.detail);
    const proved = results.filter((r) => r.ok).map((r) => r.id);
    const failed = results.filter((r) => r.ok === false).map((r) => r.id);
    console.log('');
    console.log('verdict ' + (failed.length === 0 ? 'PASS' : 'FAIL') + ' \u2014 proved ' + proved.join(',') + ' \u2014 unproved ' + (failed.length === 0 ? '(none)' : failed.join(',')));
    console.log('boots used by this run: ' + bootCount + ' (' + boots.map((b) => b.id + ':' + (b.childId || 'captain-only')).join(', ') + ')');
    console.log('artifact dir: ' + runDir);
    await writeFile(join(runDir, 'checks.json'), JSON.stringify({ results, proved, failed, bootCount }, null, 2), 'utf8');
    return { results, failed, bootCount };
}

async function resolveRunDir(target) {
    const direct = join(target, 'meta.json');
    if (existsSync(direct)) return target;
    const abs = resolve(repoRoot, target);
    if (existsSync(join(abs, 'meta.json'))) return abs;
    const base = existsSync(abs) ? abs : RUN_ROOT;
    if (existsSync(base) === false) return undefined;
    const runs = (await readdir(base)).filter((n) => n.startsWith('run-')).sort();
    if (runs.length === 0) return undefined;
    return join(base, runs[runs.length - 1]);
}

async function main() {
    const argv = process.argv.slice(2);
    const analyzeIndex = argv.indexOf('--analyze');
    if (analyzeIndex >= 0) {
        const target = argv[analyzeIndex + 1] ?? RUN_ROOT;
        const runDir = await resolveRunDir(target);
        if (runDir === undefined) { console.error('no run dir under ' + target); process.exit(2); }
        console.log('analysing ' + runDir);
        const verdict = await evaluate(runDir);
        console.log('EXIT ' + (verdict.failed.length === 0 ? 0 : 1));
        process.exit(verdict.failed.length === 0 ? 0 : 1);
    }
    if (existsSync(CLI) === false) { console.error('desktop CLI not found: ' + CLI); process.exit(2); }
    if (existsSync(MIGRATE) === false) { console.error('migrate tool not found: ' + MIGRATE); process.exit(2); }
    if (existsSync(join(cli.profileDir, 'node_modules', '@nami', 'dsh-agent-teams', 'package.json')) === false) {
        // the plugin must be linked into the draft profile, otherwise no agent_teams_* tool exists
        console.error('plugin not installed in profile ' + PROFILE + ': ' + cli.profileDir);
        process.exit(2);
    }
    const runDir = await runLive();
    console.log('run dir ' + runDir);
    const verdict = await evaluate(runDir);
    console.log('EXIT ' + (verdict.failed.length === 0 ? 0 : 1));
    process.exit(verdict.failed.length === 0 ? 0 : 1);
}

await main();
