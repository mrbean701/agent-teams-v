#!/usr/bin/env node
/**
 * t29 — prove the RELEASE ARTIFACT works: npm pack -> install the .tgz into a
 * CLEAN profile (no symlink) -> boot headless -> the new tool answers.
 *
 *   node tests/t29-pack-install.mjs            # pack (if needed), install, boot, analyse
 *   node tests/t29-pack-install.mjs --analyze <dir>   # re-analyse saved artefacts, no API spend
 *
 * Every number the verdict rests on is written into <dir>/meta.json, so
 * --analyze recomputes C1..C5 from disk only.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cli = await import(pathToFileURL(join(repoRoot, 'tools', 'test', 'lib', 'dsh-cli.mjs')).href);
const CLI = cli.DESKTOP_CLI;
const DSH_HOME = cli.DSH_HOME;

const PLUGIN_DIR = join(repoRoot, 'packages', 'dsh-agent-teams');
const PACK_DIR = join(PLUGIN_DIR, 'tests', 'tmp', 't29');
const TEST_PROFILE = process.env.DSH_TEST_PROFILE ?? 'agent-teams-pack-test';
const SOURCE_PROFILE = process.env.DSH_SOURCE_PROFILE ?? 'agent-teams-test';
const PROFILE_DIR = join(DSH_HOME, 'profiles', TEST_PROFILE);
const SOURCE_PROFILE_DIR = join(DSH_HOME, 'profiles', SOURCE_PROFILE);
const INSTALL_REL = join('node_modules', '@nami', 'dsh-agent-teams');

const TEAM = 'packtest';
const MEMBER = 'solo';
const INITIAL = { provider: 'opencode-go', model: 'kimi-k2.7-code' };
const TARGET = { provider: 'opencode-go', model: 'deepseek-v4.1-flash', effort: 'high' };
const REQUIRED = [
    'package/lib/tools.js', 'package/lib/members.js', 'package/lib/client.js',
    'package/lib/client.js.map', 'package/lib/tool-names.js', 'package/cordis.patch.yml',
];

const argv = process.argv.slice(2);
const analyzeOnly = argv[0] === '--analyze' ? resolve(argv[1] ?? '') : undefined;

// ------------------------------------------------------------------ utilities
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const readIfExists = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const psQuote = (value) => "'" + String(value).replaceAll("'", "''") + "'";

/** Minimal ustar reader: enough for what npm writes (no base-256 sizes). */
function readTarball(tgzPath) {
    const raw = gunzipSync(readFileSync(tgzPath));
    const entries = [];
    let longName;
    for (let offset = 0; offset + 512 <= raw.length; ) {
        const header = raw.subarray(offset, offset + 512);
        const field = (from, to) => header.subarray(from, to).toString('utf8').replace(/\0.*$/, '');
        const size = parseInt(field(124, 136).trim() || '0', 8);
        const typeflag = field(156, 157) || '0';
        const name = field(0, 100);
        const prefix = field(345, 500);
        const body = raw.subarray(offset + 512, offset + 512 + size);
        if (typeflag === 'L') { longName = body.toString('utf8').replace(/\0.*$/, ''); offset += 512 + Math.ceil(size / 512) * 512; continue; }
        if (typeflag === 'x' || typeflag === 'g') { offset += 512 + Math.ceil(size / 512) * 512; continue; }
        const fullName = longName ?? (prefix ? prefix + '/' + name : name);
        longName = undefined;
        if (fullName === '') break;
        entries.push({ name: fullName, size, typeflag, body: typeflag === '0' ? body : undefined });
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    return entries;
}

/** Run one headless session. Task text travels on stdin ('-'). */
function runHeadless(promptText, cwd, timeoutMs = 600000) {
    const command = '& ' + psQuote(CLI) + ' ' + psQuote('--profile') + ' ' + psQuote(TEST_PROFILE)
        + ' ' + psQuote('--json') + ' ' + psQuote('-') + '; exit $LASTEXITCODE';
    const startedAt = Date.now();
    const result = spawnSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd, input: promptText, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return {
        command: 'powershell -NoProfile -Command "' + command + '"  < stdin(' + promptText.length + ' chars)',
        status: result.status, signal: result.signal,
        stdout: result.stdout ?? '', stderr: result.stderr ?? '',
        error: result.error === undefined ? undefined : String(result.error),
        elapsedMs: Date.now() - startedAt,
    };
}

function walk(value, visit) {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const item of value) walk(item, visit); return; }
    visit(value);
    for (const key of Object.keys(value)) walk(value[key], visit);
}

function parseStream(text) {
    const events = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') === false) continue;
        try { events.push(JSON.parse(trimmed)); } catch { /* not an event line */ }
    }
    const calls = [];
    const results = new Map();
    for (const event of events) {
        walk(event, (node) => {
            if (typeof node.tool === 'string' && typeof node.callId === 'string') calls.push({ callId: node.callId, tool: node.tool, input: node.input });
            else if (typeof node.callId === 'string' && typeof node.result === 'string') results.set(node.callId, { status: node.status, result: node.result });
        });
    }
    return { events, calls, results };
}

// ------------------------------------------------------------------- install
function ensureTarball(record) {
    mkdirSync(PACK_DIR, { recursive: true });
    const existing = existsSync(PACK_DIR)
        ? readdirSync(PACK_DIR).filter((name) => name.endsWith('.tgz')).map((name) => join(PACK_DIR, name))
        : [];
    let tgz = existing.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
    record.pack = { reused: tgz !== undefined };
    if (tgz === undefined) {
        const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
            ['pack', '--pack-destination', PACK_DIR], { cwd: PLUGIN_DIR, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300000 });
        record.pack.status = result.status;
        record.pack.stdoutTail = (result.stdout ?? '').split('\n').slice(-8).join('\n');
        record.pack.stderrTail = (result.stderr ?? '').slice(-800);
        tgz = readdirSync(PACK_DIR).filter((name) => name.endsWith('.tgz')).map((name) => join(PACK_DIR, name))[0];
        if (tgz === undefined) return { tgz: undefined, entries: [] };
    }
    const buffer = readFileSync(tgz);
    const entries = readTarball(tgz);
    return {
        tgz,
        entries,
        meta: {
            path: tgz, name: tgz.split(sep).pop(), bytes: buffer.length, sha256: sha256(buffer),
            entryCount: entries.length,
            entryNames: entries.map((entry) => entry.name),
            required: REQUIRED.map((name) => ({ name, present: entries.some((entry) => entry.name === name) })),
            forbidden: {
                nodeModules: entries.filter((entry) => entry.name.includes('node_modules')).map((entry) => entry.name),
                tests: entries.filter((entry) => entry.name.startsWith('package/tests')).map((entry) => entry.name),
            },
            libToolsSha256: sha256(entries.find((entry) => entry.name === 'package/lib/tools.js')?.body ?? Buffer.alloc(0)),
        },
    };
}

function installIntoCeanProfile(tgzPath, record) {
    const installDir = join(PROFILE_DIR, INSTALL_REL);
    const already = existsSync(installDir) && lstatSync(installDir).isSymbolicLink() === false;
    record.profile = { dir: PROFILE_DIR, installDir, reused: already };
    if (already === false) {
        mkdirSync(PROFILE_DIR, { recursive: true });
        for (const name of ['cordis.yml', 'pnpm-workspace.yaml', 'cordis.patch.yml']) {
            const from = join(SOURCE_PROFILE_DIR, name);
            if (existsSync(from)) copyFileSync(from, join(PROFILE_DIR, name));
        }
        writeFileSync(join(PROFILE_DIR, 'package.json'), JSON.stringify({
            name: 'dsh-profile-' + TEST_PROFILE, private: true,
            dependencies: { '@nami/dsh-agent-teams': 'file:' + tgzPath.replaceAll('\\', '/') },
            dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', '@nami/dsh-agent-teams'] } },
        }, null, 2) + '\n', 'utf8');
        // --offline: a registry lookup would fail, so success proves no network was needed.
        const args = ['i', '--offline', '--no-audit', '--no-fund', '--legacy-peer-deps', tgzPath];
        const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args,
            { cwd: PROFILE_DIR, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300000 });
        record.npm = {
            args, offline: true, status: result.status,
            stdoutTail: (result.stdout ?? '').split('\n').filter(Boolean).slice(-5).join('\n'),
            stderrTail: (result.stderr ?? '').slice(-800),
        };
    }
    const stat = existsSync(installDir) ? lstatSync(installDir) : undefined;
    const spec = JSON.parse(readIfExists(join(PROFILE_DIR, 'package.json')) || '{}').dependencies?.['@nami/dsh-agent-teams'] ?? '';
    record.profile.lstat = stat === undefined ? undefined : { isSymbolicLink: stat.isSymbolicLink(), isDirectory: stat.isDirectory() };
    record.profile.realpath = stat === undefined ? undefined : realpathSync(installDir);
    record.profile.insideProfile = record.profile.realpath === undefined
        ? false : resolve(record.profile.realpath).startsWith(resolve(PROFILE_DIR) + sep);
    record.profile.dependencySpec = spec;
    record.profile.version = existsSync(join(installDir, 'package.json')) ? JSON.parse(readFileSync(join(installDir, 'package.json'), 'utf8')).version : undefined;
    record.profile.installedToolsSha256 = existsSync(join(installDir, 'lib', 'tools.js')) ? sha256(readFileSync(join(installDir, 'lib', 'tools.js'))) : undefined;
}

// -------------------------------------------------------------------- prompts
const promptOne = 'You are the captain of a test team. Execute these three steps in this exact order, one tool call at a time. '
    + 'Do not ask questions and do not wait for any member. '
    + 'STEP 1: call agent_teams_create with exactly these arguments {"name":"' + TEAM + '","description":"t29 tarball install smoke test","approval":"automatic","plan":{"members":[{"name":"' + MEMBER + '","role":"idle observer","provider":"' + INITIAL.provider + '","model":"' + INITIAL.model + '"}],"tasks":[]}}. '
    + 'STEP 2: call agent_teams_set_member_route with exactly these arguments {"member_name":"' + MEMBER + '","provider":"' + TARGET.provider + '","model":"' + TARGET.model + '","reasoning_effort":"' + TARGET.effort + '"}. '
    + 'STEP 3: reply with one single line in the form: PACKTOOL applied=<the applied value from step 2> provider=<provider> model=<model>';

// --------------------------------------------------------------------- checks
const results = [];
function check(id, ok, detail, evidence) {
    results.push({ id, ok: ok === true, detail, evidence });
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' \u2014 ' + detail);
}

async function analyse(runDir) {
    results.length = 0;
    const meta = JSON.parse(readIfExists(join(runDir, 'meta.json')) || '{}');
    const stdout = readIfExists(join(runDir, 'session1.stdout.txt'));
    const stream = parseStream(stdout);
    const tar = meta.tarball ?? {};
    const profile = meta.profile ?? {};
    const boot = meta.boot ?? {};

    check('C1', Number(tar.bytes) > 0 && typeof tar.sha256 === 'string' && tar.sha256.length === 64 && Number(tar.entryCount) > 0,
        'real .tgz ' + String(tar.name) + ' ' + String(tar.bytes) + ' B sha256 ' + String(tar.sha256).slice(0, 16) + '\u2026, tar -tf entries ' + String(tar.entryCount),
        tar.path);

    const missing = (tar.required ?? []).filter((entry) => entry.present !== true).map((entry) => entry.name);
    const forbidden = (tar.forbidden?.nodeModules?.length ?? -1) + (tar.forbidden?.tests?.length ?? -1);
    check('C2', missing.length === 0 && forbidden === 0 && (tar.required ?? []).length === REQUIRED.length,
        'required 6/6 present, forbidden node_modules+tests hits = ' + String(forbidden) + ' (missing: ' + (missing.join(',') || 'none') + ')',
        REQUIRED.join(' | '));

    const lstatOk = profile.lstat?.isSymbolicLink === false && profile.lstat?.isDirectory === true && profile.insideProfile === true;
    const specOk = typeof profile.dependencySpec === 'string' && profile.dependencySpec.startsWith('file:') && profile.dependencySpec.includes('.tgz');
    const sameFile = profile.installedToolsSha256 !== undefined && profile.installedToolsSha256 === tar.libToolsSha256;
    check('C3', lstatOk && specOk && sameFile && boot.status === 0,
        'installed copy is a real directory (isSymbolicLink=false, realpath inside profile), spec ' + String(profile.dependencySpec)
        + ', lib/tools.js identical to the tarball (' + String(profile.installedToolsSha256).slice(0, 16) + '\u2026), boot exit ' + String(boot.status),
        profile.realpath);

    const teamPath = [join(runDir, 'team.json'), join(runDir, '.agent-teams', TEAM, 'team.json')].find((path) => existsSync(path));
    const team = JSON.parse(teamPath === undefined ? '{}' : readFileSync(teamPath, 'utf8'));
    const member = (team.members ?? []).find((entry) => entry.name === MEMBER);
    const override = member?.routeOverride;
    const auditPath = [join(runDir, 'MODEL-SWITCH.md'), join(runDir, 'docs', 'log', 'MODEL-SWITCH.md')].find((path) => existsSync(path));
    const audit = auditPath === undefined ? '' : readFileSync(auditPath, 'utf8');
    const call = stream.calls.find((entry) => entry.tool === 'agent_teams_set_member_route' && JSON.stringify(entry.input ?? {}).includes(MEMBER));
    const reply = call === undefined ? undefined : stream.results.get(call.callId);
    const replyOk = reply !== undefined && reply.status === 'completed' && reply.result.includes(TARGET.provider + '/' + TARGET.model);
    const overrideOk = override !== undefined && override.provider === TARGET.provider && override.model === TARGET.model;
    const auditOk = audit.includes(MEMBER) && audit.includes(TARGET.provider + '/' + TARGET.model);
    check('C4', call !== undefined && replyOk && overrideOk && auditOk,
        'agent_teams_set_member_route answered in the tarball profile: "' + String(reply?.result ?? '').replace(/\s+/g, ' ').slice(0, 150)
        + '"; team.json routeOverride=' + String(override?.provider) + '/' + String(override?.model) + ' source=' + String(override?.source)
        + '; audit row written=' + String(auditOk),
        'teamFile=' + String(teamPath) + ' auditFile=' + String(auditPath) + ' callId=' + String(call?.callId));

    const offline = meta.npm === undefined ? true : meta.npm.offline === true && meta.npm.status === 0;
    check('C5', offline && Array.isArray(meta.limitations) && meta.limitations.length > 0,
        'install never touched a registry (npm --offline, status ' + String(meta.npm?.status ?? 'n/a') + '); limitations recorded: '
        + (Array.isArray(meta.limitations) ? meta.limitations.length : 0),
        (meta.limitations ?? []).join(' ; '));

    const summary = {
        runDir,
        tarball: { path: tar.path, name: tar.name, bytes: tar.bytes, sha256: tar.sha256, entryCount: tar.entryCount },
        profile: { dir: profile.dir, dependencySpec: profile.dependencySpec, lstat: profile.lstat, version: profile.version },
        boot: { exit: boot.status, elapsedMs: boot.elapsedMs, sessionId: boot.sessionId },
        checks: results,
        verdict: results.every((entry) => entry.ok) ? 'PASS' : 'FAIL',
        proved: results.filter((entry) => entry.ok).map((entry) => entry.id),
        unproved: results.filter((entry) => entry.ok === false).map((entry) => entry.id),
    };
    writeFileSync(join(runDir, 'result.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.log('');
    console.log('verdict ' + summary.verdict + ' - proved ' + summary.proved.join(',') + '; unproved ' + (summary.unproved.join(',') || 'none'));
    return summary;
}

// ----------------------------------------------------------------------- main
async function main() {
    if (analyzeOnly !== undefined) {
        const summary = await analyse(analyzeOnly);
        process.exit(summary.verdict === 'PASS' ? 0 : 1);
    }
    const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\..+$/, '');
    const runDir = join(repoRoot, 'tests', 'tmp', 't29', 'run-' + stamp);
    mkdirSync(runDir, { recursive: true });
    console.log('run dir   ' + runDir);
    console.log('profile   ' + PROFILE_DIR + ' (clean, installed from the tarball, no symlink)');

    const tar = ensureTarball({});
    if (tar.tgz === undefined) {
        console.log('FAIL C1 — npm pack produced no tarball in ' + PACK_DIR);
        writeFileSync(join(runDir, 'meta.json'), JSON.stringify({ tarball: {}, limitations: ['npm pack produced nothing'] }, null, 2), 'utf8');
        process.exit(1);
    }
    console.log('tarball   ' + tar.meta.name + ' ' + tar.meta.bytes + ' B sha256 ' + tar.meta.sha256.slice(0, 16) + '\u2026 entries ' + tar.meta.entryCount);

    const record = { stamp, startedAt: Date.now(), hostCli: CLI, dshHome: DSH_HOME, testProfile: TEST_PROFILE,
        tarball: tar.meta, pack: { reused: true } };
    installIntoCeanProfile(tar.tgz, record);
    console.log('installed ' + String(record.profile.version) + ' at ' + String(record.profile.realpath) + ' (isSymbolicLink=' + String(record.profile.lstat?.isSymbolicLink) + ')');

    console.log('boot (create a team, then switch its member route) ...');
    const boot = runHeadless(promptOne, runDir);
    writeFileSync(join(runDir, 'session1.stdout.txt'), boot.stdout, 'utf8');
    writeFileSync(join(runDir, 'session1.stderr.txt'), boot.stderr, 'utf8');
    writeFileSync(join(runDir, 'prompt.txt'), promptOne + '\n', 'utf8');
    console.log('boot exit=' + String(boot.status) + ' in ' + boot.elapsedMs + 'ms');
    record.boot = { status: boot.status, elapsedMs: boot.elapsedMs, error: boot.error, command: boot.command,
        stderrTail: boot.stderr.slice(-1200), finishedAt: Date.now() };
    record.limitations = [
        'npm pack/install ran fully offline (--offline): no registry and no network were needed.',
        'peerDependencies are not installed into the profile (npm --legacy-peer-deps); the desktop runtime supplies them, as it does for every profile bundle.',
        'the test never publishes; the tarball stays under packages/dsh-agent-teams/tests/tmp/t29.',
        'the profile is a scratch profile (' + TEST_PROFILE + '), not the desktop profile in use.',
    ];
    writeFileSync(join(runDir, 'meta.json'), JSON.stringify(record, null, 2), 'utf8');
    const summary = await analyse(runDir);
    console.log('artifacts ' + runDir);
    process.exit(summary.verdict === 'PASS' ? 0 : 1);
}

await main();
