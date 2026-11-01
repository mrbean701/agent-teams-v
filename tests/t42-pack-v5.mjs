#!/usr/bin/env node
/**
 * Pack the RELEASE tarball again after t37/t38/t39 and prove it carries the current
 * sources (task t42). Three ways: tarball payload, copy installed into a clean
 * profile, source tree. Determinism: npm pack runs TWICE and must agree on sha256.
 *
 *   node tests/t42-pack-v5.mjs                  # pack x2, verify, install, boot
 *   node tests/t42-pack-v5.mjs --analyze <dir>  # re-score an existing run, no quota
 *
 * Why: the previously published tarball c3e3e88a...2745 predates the route-revert
 * (t37), per-member fallback (t38) and the clear_member_route HTTP action (t39),
 * so four core files inside it are older than the sources on disk.
 *
 * Exit code 0 means every check passed; 1 means at least one failed.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const pluginDir = join(repoRoot, 'packages', 'dsh-agent-teams');
const packDir = join(pluginDir, 'tests', 'tmp', 't42');
const cli = await import(pathToFileURL(join(repoRoot, 'tools', 'test', 'lib', 'dsh-cli.mjs')).href);
const CLI = cli.DESKTOP_CLI;
const DSH_HOME = cli.DSH_HOME;

const TEST_PROFILE = process.env.DSH_TEST_PROFILE ?? 'agent-teams-pack3';
const SOURCE_PROFILE = process.env.DSH_SOURCE_PROFILE ?? 'agent-teams-test';
const PROFILE_DIR = join(DSH_HOME, 'profiles', TEST_PROFILE);
const SOURCE_PROFILE_DIR = join(DSH_HOME, 'profiles', SOURCE_PROFILE);
const INSTALL_REL = join('node_modules', '@nami', 'dsh-agent-teams');

const FILES = [
    'lib/tools.js',
    'lib/members.js',
    'lib/state.js',
    'lib/snapshot.js',
    'lib/client.js',
    'lib/client.js.map',
    'package.json',
];
const REQUIRED_ENTRIES = [
    'package/lib/tools.js',
    'package/lib/members.js',
    'package/lib/client.js',
    'package/lib/client.js.map',
    'package/lib/tool-names.js',
    'package/cordis.patch.yml',
];
// The modules the desktop runtime imports first; a syntax error in any of them means the
// tarball ships bytes that cannot load at all (found on 2026-10-31T18:31Z while another
// member was rewriting lib/**: the pack captured a half-written tree).
const CORE_MODULES = ['index.js', 'tools.js', 'members.js', 'scheduler.js', 'snapshot.js'];
const NEW_TOOLS = ['agent_teams_set_member_route', 'agent_teams_add_member'];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const readIfExists = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const short = (buffer) => sha256(buffer).slice(0, 12);

// ------------------------------------------------------------------ tar reader
/** Minimal ustar reader: enough for what npm writes (no base-256 sizes). */
function readTarball(tgzPath) {
    const raw = gunzipSync(readFileSync(tgzPath));
    const entries = [];
    let longName;
    for (let offset = 0; offset + 512 <= raw.length;) {
        const header = raw.subarray(offset, offset + 512);
        const field = (from, to) => header.subarray(from, to).toString('utf8').replace(/\0.*$/u, '');
        const size = parseInt(field(124, 136).trim() || '0', 8);
        const typeflag = field(156, 157) || '0';
        const name = field(0, 100);
        const prefix = field(345, 500);
        const body = raw.subarray(offset + 512, offset + 512 + size);
        if (typeflag === 'L') {
            longName = body.toString('utf8').replace(/\0.*$/u, '');
            offset += 512 + Math.ceil(size / 512) * 512;
            continue;
        }
        if (typeflag === 'x' || typeflag === 'g') {
            offset += 512 + Math.ceil(size / 512) * 512;
            continue;
        }
        const fullName = longName ?? (prefix ? prefix + '/' + name : name);
        longName = undefined;
        if (fullName === '') break;
        entries.push({ name: fullName, size, typeflag, body: typeflag === '0' ? body : undefined });
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    return entries;
}

// ----------------------------------------------------------------------- pack
/** Pack the current tree into destDir. Each call is a full, independent npm pack:
 *  the only *.tgz removed is the one already sitting in that same destination, so
 *  pack #1 (the artefact we ship) survives pack #2 (the determinism probe). */
function packFresh(record, destDir, recordKey) {
    mkdirSync(destDir, { recursive: true });
    for (const name of readdirSync(destDir)) {
        if (name.endsWith('.tgz')) rmSync(join(destDir, name), { force: true });
    }
    const relative = destDir === packDir ? '.' : destDir.slice(packDir.length + 1);
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['pack', '--pack-destination', destDir],
        { cwd: pluginDir, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300000 });
    record[recordKey] = {
        command: 'npm pack --pack-destination packages/dsh-agent-teams/tests/tmp/t42' + (relative === '.' ? '' : '/' + relative),
        destination: destDir,
        status: result.status,
        stdoutTail: (result.stdout ?? '').split('\n').filter(Boolean).slice(-6).join('\n'),
        stderrTail: (result.stderr ?? '').slice(-800),
    };
    const names = readdirSync(destDir).filter((name) => name.endsWith('.tgz'));
    if (names.length !== 1) return undefined;
    return join(destDir, names[0]);
}

function unpackPayload(tgzPath, entries, record) {
    const payloadDir = join(packDir, 'payload');
    rmSync(payloadDir, { recursive: true, force: true });
    for (const entry of entries) {
        if (entry.body === undefined) continue;
        // Strip npm's 'package/' prefix: the payload dir then mirrors the installed package,
        // so the same relative paths (lib/tool-names.js) can be imported from both.
        const rel = entry.name.replace(/^package\//u, '');
        if (rel === entry.name) continue;
        const target = join(payloadDir, ...rel.split('/'));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, entry.body);
    }
    record.payloadDir = payloadDir;
    return payloadDir;
}

// -------------------------------------------------------------------- install
function installIntoCleanProfile(tgzPath, record) {
    const installDir = join(PROFILE_DIR, INSTALL_REL);
    rmSync(PROFILE_DIR, { recursive: true, force: true });
    mkdirSync(PROFILE_DIR, { recursive: true });
    for (const name of ['cordis.yml', 'pnpm-workspace.yaml', 'cordis.patch.yml']) {
        const from = join(SOURCE_PROFILE_DIR, name);
        if (existsSync(from)) copyFileSync(from, join(PROFILE_DIR, name));
    }
    writeFileSync(join(PROFILE_DIR, 'package.json'), JSON.stringify({
        name: 'dsh-profile-' + TEST_PROFILE,
        private: true,
        dependencies: { '@nami/dsh-agent-teams': 'file:' + tgzPath.replaceAll('\\', '/') },
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', '@nami/dsh-agent-teams'] } },
    }, null, 2) + '\n', 'utf8');
    // --offline: any registry lookup would fail, so success proves no network was needed.
    const args = ['i', '--offline', '--no-audit', '--no-fund', '--legacy-peer-deps', tgzPath];
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args,
        { cwd: PROFILE_DIR, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300000 });
    record.npm = {
        args: args.map((item) => item.replaceAll(tgzPath, '<tarball>')),
        status: result.status,
        stdoutTail: (result.stdout ?? '').split('\n').filter(Boolean).slice(-4).join('\n'),
        stderrTail: (result.stderr ?? '').slice(-800),
    };
    const stat = existsSync(installDir) ? lstatSync(installDir) : undefined;
    const lock = JSON.parse(readIfExists(join(PROFILE_DIR, 'package-lock.json')) || '{}');
    const locked = lock.packages?.['node_modules/@nami/dsh-agent-teams'];
    record.profile = {
        dir: PROFILE_DIR,
        installDir,
        lstat: stat === undefined ? undefined : { isSymbolicLink: stat.isSymbolicLink(), isDirectory: stat.isDirectory() },
        realpath: stat === undefined ? undefined : realpathSync(installDir),
        insideProfile: stat === undefined ? false : resolve(realpathSync(installDir)).startsWith(resolve(PROFILE_DIR) + sep),
        dependencySpec: JSON.parse(readIfExists(join(PROFILE_DIR, 'package.json')) || '{}').dependencies?.['@nami/dsh-agent-teams'] ?? '',
        lockResolved: locked?.resolved ?? '',
        version: existsSync(join(installDir, 'package.json')) ? JSON.parse(readFileSync(join(installDir, 'package.json'), 'utf8')).version : undefined,
    };
    return installDir;
}

// ----------------------------------------------------------------------- boot
function psQuote(value) {
    return "'" + String(value).replaceAll("'", "''") + "'";
}

/** One headless session; the task text travels on stdin ('-'). */
function runHeadless(promptText, cwd, timeoutMs = 600000) {
    const command = '& ' + psQuote(CLI) + ' ' + psQuote('--profile') + ' ' + psQuote(TEST_PROFILE)
        + ' ' + psQuote('--json') + ' ' + psQuote('-') + '; exit $LASTEXITCODE';
    const startedAt = Date.now();
    const result = spawnSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd, input: promptText, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return {
        command: 'powershell -NoProfile -Command "<desktop cli> --profile ' + TEST_PROFILE + ' --json -" < stdin(' + promptText.length + ' chars)',
        status: result.status,
        signal: result.signal,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        error: result.error === undefined ? undefined : String(result.error),
        elapsedMs: Date.now() - startedAt,
    };
}

function walk(value, visit) {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
        for (const item of value) walk(item, visit);
        return;
    }
    visit(value);
    for (const key of Object.keys(value)) walk(value[key], visit);
}

function parseStream(text) {
    const events = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') === false) continue;
        try {
            events.push(JSON.parse(trimmed));
        }
        catch {
            // not an event line
        }
    }
    const calls = [];
    const results = new Map();
    const sessionIds = new Set();
    for (const event of events) {
        walk(event, (node) => {
            if (typeof node.sessionId === 'string' && node.sessionId !== '') sessionIds.add(node.sessionId);
            if (typeof node.session_id === 'string' && node.session_id !== '') sessionIds.add(node.session_id);
            if (typeof node.tool === 'string' && typeof node.callId === 'string') calls.push({ callId: node.callId, tool: node.tool });
            else if (typeof node.callId === 'string' && typeof node.result === 'string') results.set(node.callId, { status: node.status, result: node.result });
        });
    }
    return { events, calls, results, sessionIds: [...sessionIds] };
}

const bootPrompt = 'You are checking a freshly installed plugin. Do exactly these steps. '
    + '1) Call the tool agent_teams_status with an empty arguments object. '
    + '2) Call agent_teams_set_member_route with arguments {"member_name":"probe","provider":"probe","model":"probe"}. '
    + '3) Call agent_teams_add_member with arguments {"name":"probe","role":"worker"}. '
    + 'Errors are expected and are the point: do not retry, do not fix anything, do not create a team. '
    + 'Then reply with a single line in this exact form and nothing else: '
    + 'STATUS err=<the exact error text of step 1, or none> NEWTOOLS set_member_route=<yes or no> add_member=<yes or no> '
    + '(for NEWTOOLS answer whether those two names appear in the tool list you were given).';

// ------------------------------------------------------------------ verifying
function hashThreeWays(tgzDir, entries, installDir) {
    const payload = new Map(entries.filter((entry) => entry.name.startsWith('package/') && entry.body !== undefined)
        .map((entry) => [entry.name.slice('package/'.length), entry.body]));
    return FILES.map((rel) => {
        const fromPayload = payload.get(rel);
        const installedPath = join(installDir, ...rel.split('/'));
        const fromInstalled = existsSync(installedPath) ? readFileSync(installedPath) : undefined;
        const sourcePath = join(pluginDir, ...rel.split('/'));
        const fromSource = existsSync(sourcePath) ? readFileSync(sourcePath) : undefined;
        const hashes = {
            payload: fromPayload === undefined ? 'MISSING' : sha256(fromPayload),
            installed: fromInstalled === undefined ? 'MISSING' : sha256(fromInstalled),
            source: fromSource === undefined ? 'MISSING' : sha256(fromSource),
        };
        return {
            file: rel,
            ...hashes,
            bytes: { payload: fromPayload?.length ?? 0, installed: fromInstalled?.length ?? 0, source: fromSource?.length ?? 0 },
            same: hashes.payload === hashes.installed && hashes.installed === hashes.source,
        };
    });
}

function tarListing(tgzPath) {
    const result = spawnSync('tar', ['-tzf', tgzPath], { encoding: 'utf8', timeout: 120000 });
    if (result.status !== 0 || typeof result.stdout !== 'string') return { available: false, names: [] };
    // Windows tar writes CRLF: strip the carriage return before comparing (t29 lesson).
    return { available: true, names: result.stdout.split('\n').map((line) => line.replace(/\r$/u, '')).filter(Boolean) };
}

/** sha256 of every .js under <packageDir>/lib: the fingerprint of the source state. */
function libJsHashes(packageDir) {
    const root = join(packageDir, 'lib');
    const out = {};
    const visit = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) { visit(full); continue; }
            if (!full.endsWith('.js')) continue;
            out[full.slice(root.length + 1).replaceAll(sep, '/')] = sha256(readFileSync(full));
        }
    };
    if (existsSync(root)) visit(root);
    return out;
}

/** Import each module in its own process. Exit 42 marks a SyntaxError, which is the only
 *  failure that means the SHIPPED BYTES are broken: resolution errors (missing peer deps
 *  such as react or @deepseek-ai/*) and runtime errors are expected in a bare profile. */
function probeModules(libDir, modules) {
    return modules.map((name) => {
        const target = pathToFileURL(join(libDir, name)).href;
        const code = 'import(' + JSON.stringify(target) + ').then('
            + '() => process.exit(0),'
            + ' (e) => { console.error(e.name + ": " + e.message); process.exit(e.name === "SyntaxError" ? 42 : 3); });';
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 120000 });
        return {
            module: name,
            status: result.status,
            syntaxError: result.status === 42,
            message: (result.stderr ?? '').split('\n').filter(Boolean)[0] ?? '',
        };
    });
}

function score(meta) {
    const checks = [];
    const check = (id, ok, detail, evidence) => checks.push({ id, ok, detail, evidence: evidence ?? '' });

    const packs = meta.packs ?? [];
    const samePacks = packs.length === 2 && packs.every((item) => item.sha256 === packs[0].sha256)
        && packs[0].bytes === packs[1].bytes && packs[0].entryCount === packs[1].entryCount
        && packs[0].sha256 !== undefined && packs[0].sha256 !== '';
    check('C1 2 lần npm pack độc lập cho CÙNG sha256 (+ cùng size, cùng số entry)',
        samePacks,
        packs.length + ' lần pack; sha256 ' + (packs[0]?.sha256 ?? 'MISSING').slice(0, 16) + ' / ' + (packs[1]?.sha256 ?? 'MISSING').slice(0, 16)
            + ' | bytes ' + (packs[0]?.bytes ?? 0) + ' / ' + (packs[1]?.bytes ?? 0)
            + ' | entry ' + (packs[0]?.entryCount ?? 0) + ' / ' + (packs[1]?.entryCount ?? 0)
            + (packs.length === 2 && !samePacks ? ' => npm pack KHÔNG tất định trong lần chạy này (ghi nhận trung thực, không sửa tay)' : ''),
        packs.map((item) => item.destination + ' -> ' + item.name + ' sha256=' + item.sha256).join('\n'));

    const rows = meta.threeWay ?? [];
    check('C2 3 chiều 7/7 SAME (payload tarball ↔ bản cài profile sạch ↔ nguồn)',
        rows.length === 7 && rows.every((row) => row.same),
        rows.filter((row) => row.same).length + '/7 SAME' + (rows.length === 7 ? '' : ' (thiếu hàng: ' + rows.length + ' tệp)'),
        rows.map((row) => row.file + ' payload=' + row.payload.slice(0, 12) + ' installed=' + row.installed.slice(0, 12) + ' source=' + row.source.slice(0, 12)).join('\n'));

    const required = meta.entries?.required ?? [];
    const forbidden = meta.entries?.forbidden ?? {};
    check('C3 tarball đủ entry bắt buộc, 0 node_modules/tests/tgz lồng',
        required.length === REQUIRED_ENTRIES.length && required.every((item) => item.present)
        && forbidden.nodeModules.length === 0 && forbidden.tests.length === 0
        && forbidden.nestedTgz.length === 0 && forbidden.pid.length === 0,
        required.filter((item) => item.present).length + '/' + REQUIRED_ENTRIES.length + ' bắt buộc; node_modules=' + forbidden.nodeModules.length
        + ' tests=' + forbidden.tests.length + ' tgz-lồng=' + forbidden.nestedTgz.length + ' pid=' + forbidden.pid.length,
        'tar -tzf + reader: ' + String(meta.entries?.count ?? 0) + ' entry (tar ' + (meta.entries?.tarAvailable ? 'khớp reader' : 'không dùng được') + ')');

    const profile = meta.profile ?? {};
    check('C4 cài từ tarball vào profile sạch (không symlink, resolved file:)',
        meta.npm?.status === 0 && profile.lstat?.isSymbolicLink === false && profile.lstat?.isDirectory === true
        && profile.insideProfile === true && String(profile.lockResolved).startsWith('file:'),
        'npm=' + meta.npm?.status + ' symlink=' + profile.lstat?.isSymbolicLink + ' dir=' + profile.lstat?.isDirectory
        + ' insideProfile=' + profile.insideProfile + ' lockResolved=' + String(profile.lockResolved).slice(0, 60),
        profile.realpath ?? '');

    const boot = meta.boot ?? {};
    const calledNames = (boot.calls ?? []).map((call) => call.tool);
    const statusCalled = calledNames.includes('agent_teams_status');
    const statusResult = (boot.calls ?? []).filter((call) => call.tool === 'agent_teams_status')
        .map((call) => boot.results?.[call.callId]?.result ?? '').join('\n');
    check('C5 boot headless exit 0 + gọi được agent_teams_status',
        boot.status === 0 && boot.sessionId !== '' && statusCalled
        && (statusResult.includes('you do not lead') || statusResult.includes('do not lead or belong')),
        'exit=' + boot.status + ' session=' + (boot.sessionId || '(không thấy)') + ' status-call=' + statusCalled
        + ' lỗi-bình-thường=' + (statusResult.includes('do not lead') ? true : false),
        String(statusResult).slice(0, 300));

    const names = meta.toolNames ?? {};
    const sameNames = JSON.stringify(names.payloadTeam) === JSON.stringify(names.installedTeam)
        && JSON.stringify(names.payloadCaptain) === JSON.stringify(names.installedCaptain);
    check('C6 payload + bản cài khai báo đủ 2 tool mới (lib/tool-names.js, nạp thật không regex)',
        sameNames
        && names.payloadTeam?.includes('agent_teams_add_member') === true
        && names.payloadCaptain?.includes('agent_teams_set_member_route') === true
        && names.installedCaptain?.includes('agent_teams_set_member_route') === true,
        'payload team=' + (names.payloadTeam?.length ?? 0) + ' captain=' + (names.payloadCaptain?.length ?? 0)
        + ' installed team=' + (names.installedTeam?.length ?? 0) + ' captain=' + (names.installedCaptain?.length ?? 0)
        + ' | add_member=' + names.payloadTeam?.includes('agent_teams_add_member')
        + ' set_member_route=' + names.payloadCaptain?.includes('agent_teams_set_member_route'),
        NEW_TOOLS.join(', '));

    // A tool that was never registered cannot produce a tool_result at all: the runtime
    // answers with a "no such tool" style error, which is what makes the event pair evidence.
    const bootCalls = boot.calls ?? [];
    const notRegistered = /not found|no such tool|unknown tool|not available|does not exist|not registered/iu;
    const dispatched = NEW_TOOLS.map((tool) => {
        const call = bootCalls.find((item) => item.tool === tool);
        const result = call === undefined ? undefined : boot.results?.[call.callId];
        return {
            tool,
            called: call !== undefined,
            answered: result !== undefined,
            resultText: String(result?.result ?? '').slice(0, 200),
            looksMissing: notRegistered.test(String(result?.result ?? '')),
        };
    });
    check('C7 boot gọi THẬT được cả 2 tool mới (có tool_result, không phải lỗi "không có tool")',
        dispatched.every((item) => item.called && item.answered && item.looksMissing === false),
        dispatched.map((item) => item.tool + ': called=' + item.called + ' answered=' + item.answered + ' looksMissing=' + item.looksMissing).join('; '),
        dispatched.map((item) => item.tool + ' -> ' + item.resultText).join('\n'));

    // The tarball is the release artefact: bytes that cannot even be imported must never
    // travel to a user, and a tree that moved mid-run makes every SAME above ambiguous.
    const installedProbe = meta.installedProbe ?? [];
    const brokenShipped = installedProbe.filter((item) => item.syntaxError);
    check('C8 bản cài parse được: 5 module lõi không SyntaxError',
        installedProbe.length === CORE_MODULES.length && brokenShipped.length === 0 && meta.aborted === undefined,
        (installedProbe.length - brokenShipped.length) + '/' + CORE_MODULES.length + ' module nạp được'
            + (brokenShipped.length === 0 ? '' : ' — HỎNG: ' + brokenShipped.map((item) => item.module + ' (' + item.message + ')').join('; '))
            + (meta.aborted === undefined ? '' : ' | đã dừng: ' + meta.aborted),
        installedProbe.map((item) => item.module + ' -> ' + (item.syntaxError ? 'SYNTAX ' + item.message : 'nạp được (exit ' + item.status + ')')).join('\n'));

    const startHashes = meta.sourceAtStart ?? {};
    const endHashes = meta.sourceAtEnd ?? {};
    const startKeys = Object.keys(startHashes).sort();
    const endKeys = Object.keys(endHashes).sort();
    const drifted = startKeys.filter((file) => startHashes[file] !== endHashes[file])
        .concat(endKeys.filter((file) => startHashes[file] === undefined));
    check('C9 nguồn lib/** không đổi trong suốt lượt chạy (drift guard)',
        startKeys.length > 0 && startKeys.length === endKeys.length && drifted.length === 0,
        startKeys.length + ' tệp lúc đầu / ' + endKeys.length + ' tệp lúc cuối; đổi giữa chừng: ' + drifted.length
            + (drifted.length === 0 ? '' : ' -> ' + drifted.slice(0, 8).join(', ') + ' (pack KHÔNG đại diện nguồn hiện tại)'),
        startKeys.length + ' fingerprint');

    return checks;
}

// ------------------------------------------------------------------- analysis
/** lib/tool-names.js is data-only (no bare imports), so both copies can be imported directly.
 *  CAPTAIN_TOOL_NAMES is derived by a .filter() call, which is why importing beats pattern-matching text. */
async function readToolNames(packageDir) {
    const mod = await import(pathToFileURL(join(packageDir, 'lib', 'tool-names.js')).href);
    return {
        team: [...(mod.TEAM_TOOL_NAMES ?? [])],
        captain: [...(mod.CAPTAIN_TOOL_NAMES ?? [])],
        member: [...(mod.MEMBER_TOOL_NAMES ?? [])],
    };
}

// ----------------------------------------------------------------------- main
async function main() {
    const argv = process.argv.slice(2);
    if (argv[0] === '--analyze') {
        const dir = resolve(argv[1] ?? '');
        const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
        printVerdict(meta, score(meta), dir);
        return;
    }

    const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d+Z$/u, 'Z');
    const runDir = join(packDir, 'run-' + stamp);
    const workspace = join(runDir, 'workspace');
    mkdirSync(workspace, { recursive: true });

    const meta = { task: 't42', startedAt: new Date().toISOString(), runDir, workspace };

    // 0. lib/** is shared with the other members and was being rewritten while this task
    //    ran, so the tree is fingerprinted before and after: a SAME claim is only honest if
    //    all three copies describe ONE source state. A tree that does not even load is not
    //    packed at all (the 2026-10-31T18:31Z run shipped a half-written tree that way).
    meta.sourceAtStart = libJsHashes(pluginDir);
    meta.sourceProbeStart = probeModules(join(pluginDir, 'lib'), CORE_MODULES);
    if (meta.sourceProbeStart.some((item) => item.syntaxError)) {
        meta.aborted = 'nguon lib/** dang KHONG parse duoc — khong pack de tranh phat hanh byte hong';
        writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
        printVerdict(meta, score(meta), runDir);
        return;
    }

    // 1. pack the current tree TWICE (determinism is a claim until two runs agree)
    const tgz = packFresh(meta, packDir, 'pack1');
    const tgzAgain = packFresh(meta, join(packDir, 'repack'), 'pack2');
    if (tgz === undefined || tgzAgain === undefined) {
        meta.tarball = { path: undefined };
        writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
        printVerdict(meta, score(meta), runDir);
        return;
    }
    const buffer = readFileSync(tgz);
    const bufferAgain = readFileSync(tgzAgain);
    const entries = readTarball(tgz);
    const entriesAgain = readTarball(tgzAgain);
    const listing = tarListing(tgz);
    meta.tarball = { name: tgz.split(sep).pop(), path: tgz, bytes: buffer.length, sha256: sha256(buffer), entryCount: entries.length };
    meta.packs = [
        { destination: 'tests/tmp/t42', name: tgz.split(sep).pop(), path: tgz, bytes: buffer.length, sha256: sha256(buffer), entryCount: entries.length },
        { destination: 'tests/tmp/t42/repack', name: tgzAgain.split(sep).pop(), path: tgzAgain, bytes: bufferAgain.length, sha256: sha256(bufferAgain), entryCount: entriesAgain.length },
    ];
    meta.entries = {
        count: entries.length,
        tarAvailable: listing.available,
        tarNameCount: listing.names.length,
        readerMatchesTar: listing.available ? listing.names.length === entries.length : undefined,
        required: REQUIRED_ENTRIES.map((name) => ({ name, present: entries.some((entry) => entry.name === name) })),
        forbidden: {
            nodeModules: entries.filter((entry) => entry.name.includes('node_modules')).map((entry) => entry.name),
            tests: entries.filter((entry) => entry.name.startsWith('package/tests')).map((entry) => entry.name),
            nestedTgz: entries.filter((entry) => entry.name.endsWith('.tgz')).map((entry) => entry.name),
            pid: entries.filter((entry) => entry.name.endsWith('.pid')).map((entry) => entry.name),
        },
    };

    // 2. payload on disk + tool names declared inside the packaged artefact
    const payloadDir = unpackPayload(tgz, entries, meta);
    const payloadNames = await readToolNames(payloadDir);

    // 3. install into a clean profile
    const installDir = installIntoCleanProfile(tgz, meta);

    // 4. three-way hashes
    meta.threeWay = hashThreeWays(payloadDir, entries, installDir);

    meta.sourceAtEnd = libJsHashes(pluginDir);
    meta.installedProbe = probeModules(join(installDir, 'lib'), CORE_MODULES);

    // 5. tool names on the installed copy    // 5. tool names on the installed copy (data-only module: importable without peers)
    let installedNames = { team: [], captain: [], member: [] };
    try {
        installedNames = await readToolNames(installDir);
    }
    catch (error) {
        meta.toolNamesError = String(error);
    }
    meta.memberCount = payloadNames.member.length;
    meta.toolNames = {
        payloadTeam: payloadNames.team,
        payloadCaptain: payloadNames.captain,
        installedTeam: installedNames.team,
        installedCaptain: installedNames.captain,
    };

    // 6. boot the clean profile headless
    const boot = runHeadless(bootPrompt, workspace);
    const stream = parseStream(boot.stdout);
    const sessionId = stream.sessionIds[0] ?? '';
    meta.boot = {
        command: boot.command,
        status: boot.status,
        signal: boot.signal,
        elapsedMs: boot.elapsedMs,
        sessionId,
        calls: stream.calls,
        results: Object.fromEntries(stream.results),
        stdoutTail: boot.stdout.split('\n').filter(Boolean).slice(-25).join('\n'),
        stderrTail: boot.stderr.slice(-1200),
        error: boot.error,
        eventCount: stream.events.length,
    };
    writeFileSync(join(runDir, 'session.stdout.txt'), boot.stdout, 'utf8');
    writeFileSync(join(runDir, 'session.stderr.txt'), boot.stderr, 'utf8');
    writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    writeFileSync(join(runDir, 'prompt.txt'), bootPrompt, 'utf8');

    printVerdict(meta, score(meta), runDir);
}

function printVerdict(meta, checks, dir) {
    const pad = (text, width) => String(text).padEnd(width, ' ');
    console.log('=== t42 pack lai (sau t37/t38/t39) + three-way verify ===');
    console.log('run: ' + dir);
    for (const item of meta.packs ?? []) {
        console.log('pack: ' + item.destination + ' -> ' + item.name + '  sha256=' + item.sha256 + '  bytes=' + item.bytes + '  entries=' + item.entryCount);
    }
    const packsNow = meta.packs ?? [];
    if (packsNow.length === 2) {
        console.log('pack determinism: ' + (packsNow[0].sha256 === packsNow[1].sha256 ? 'SAME sha256 across 2 runs' : 'DIFFERENT sha256 (xem C1)'));
    }
    if (meta.tarball?.name !== undefined) {
        console.log('tarball: ' + meta.tarball.name + '  sha256=' + meta.tarball.sha256 + '  bytes=' + meta.tarball.bytes + '  entries=' + meta.tarball.entryCount);
    }
    console.log('');
    console.log(pad('file', 22) + pad('payload', 15) + pad('installed', 15) + pad('source', 15) + pad('bytes p/i/s', 20) + 'verdict');
    for (const row of meta.threeWay ?? []) {
        console.log(pad(row.file, 22) + pad(row.payload.slice(0, 12), 15) + pad(row.installed.slice(0, 12), 15) + pad(row.source.slice(0, 12), 15)
            + pad(row.bytes.payload + '/' + row.bytes.installed + '/' + row.bytes.source, 20) + (row.same ? 'SAME' : 'DIFF'));
    }
    console.log('');
    console.log('boot: exit=' + (meta.boot?.status ?? '?') + ' session=' + (meta.boot?.sessionId || '(không thấy)') + ' calls=' + (meta.boot?.calls ?? []).map((call) => call.tool).join(','));
    console.log('source: ' + Object.keys(meta.sourceAtStart ?? {}).length + ' tệp lúc đầu / ' + Object.keys(meta.sourceAtEnd ?? {}).length + ' tệp lúc cuối');
    console.log('shipped modules: ' + (meta.installedProbe ?? []).map((item) => item.module + '=' + (item.syntaxError ? 'SYNTAX' : 'ok')).join(' '));
    console.log('');
    let failed = 0;
    for (const item of checks) {
        if (item.ok !== true) failed += 1;
        console.log((item.ok ? 'PASS  ' : 'FAIL  ') + item.id);
        console.log('      ' + item.detail);
    }
    console.log('');
    console.log(checks.length - failed + '/' + checks.length + ' checks passed, ' + failed + ' failed');
    console.log(failed === 0 ? 'PASS - 2 lan pack cung sha256, tarball khop nguon o ca ba chieu, cai duoc vao profile sach agent-teams-pack3 va boot goi duoc 2 tool moi.' : 'FAIL - xem các dòng FAIL ở trên.');
    process.exitCode = failed === 0 ? 0 : 1;
}

await main();
