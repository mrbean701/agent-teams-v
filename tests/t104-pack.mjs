/**
 * Pack the release tarball for round 15 (after t102 closed the READ half of BUG-026 and t103 closed the
 * WRITE half) and prove it carries the current sources three ways: tarball payload, copy installed into a
 * clean profile, source tree. Two things are new this round and both are checked on the SHIPPED bytes:
 * C26 calls the installed setMemberRoute with source 'erp' and requires the refusal message character for
 * character, and C27 requires the boot session's agent_teams_status TEXT to carry the team identity line.
 * The V11-F3 probe fix and the in-memory SELF_MUTATION control are inherited unchanged: every probe child
 * exits non-zero when a requested named export is missing, and the control injects a name that does not
 * exist to prove the probe can fail at all.
 *
 *   node tests/t104-pack.mjs                  # gate on t103, pack x2, verify, install, boot
 *   node tests/t104-pack.mjs --analyze <dir>  # re-score + re-hash the tarball on disk, no quota
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
const packDir = join(pluginDir, 'tests', 'tmp', 't104');
const cli = await import(pathToFileURL(join(repoRoot, 'tools', 'test', 'lib', 'dsh-cli.mjs')).href);
const CLI = cli.DESKTOP_CLI;
const DSH_HOME = cli.DSH_HOME;

const TEST_PROFILE = process.env.DSH_TEST_PROFILE ?? 'agent-teams-pack15';
const SOURCE_PROFILE = process.env.DSH_SOURCE_PROFILE ?? 'agent-teams-test';
const PROFILE_DIR = join(DSH_HOME, 'profiles', TEST_PROFILE);
const SOURCE_PROFILE_DIR = join(DSH_HOME, 'profiles', SOURCE_PROFILE);
const INSTALL_REL = join('node_modules', '@nami', 'dsh-agent-teams');

// The 12 files that define the shipped behaviour. Drift is measured over this list, so a
// file that a later round rewrites cannot silently disagree with the tarball.
const FILES = [
    'lib/tools.js',
    'lib/members.js',
    'lib/state.js',
    'lib/snapshot.js',
    'lib/index.js',
    'lib/tool-names.js',
    'lib/client.js',
    'lib/client.js.map',
    'lib/types/members.d.ts',
    'lib/types/snapshot.d.ts',
    'lib/client/ActivityPanel.module.css',
    'package.json',
];
// Frozen table for round 15. Round 15 changes exactly two files: lib/state.js (t102, lenient provenance
// read) and lib/members.js (t103, write-side clamp); lib/tools.js is untouched since round 14. Every row
// was measured on disk right after t103 reported completed (tests/tmp/t104-frozen-before.json). A mismatch
// at run time means another writer touched the tree: a STOP condition, never something to paper over.
const FROZEN = {
    'lib/tools.js': '5deb03ca93b2a8e9',
    'lib/members.js': '50f558f8b207d874',
    'lib/state.js': '56664c59ff400319',
    'lib/snapshot.js': 'a2a87e1b0c0b34ea',
    'lib/index.js': '2d28e617f0683e42',
    'lib/tool-names.js': 'e3def5db908dcbd5',
    'lib/client.js': '9da18d9971a284e9',
    'lib/client.js.map': 'bbf88608f54e966f',
    'lib/types/members.d.ts': 'c53250ab41bff8c3',
    'lib/types/snapshot.d.ts': '962f99a7bcb18b94',
    'lib/client/ActivityPanel.module.css': '53ea47c6d780cd9d',
    'package.json': '92a6404071e457cc',
};
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
const NEW_TOOLS = ['agent_teams_set_member_route', 'agent_teams_add_member', 'agent_teams_set_member_profile'];

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

const bootPrompt = 'You are checking a freshly installed plugin. Do exactly these steps, in this order, once each. '
    + '1) Call the tool agent_teams_status with an empty arguments object. '
    + '2) Call agent_teams_create with arguments {"name":"t104probe","description":"edit_plan roster render probe","approval":"required","plan":{"members":[{"name":"alice","role":"researcher","provider":"opencode-go","model":"kimi-k2.7-code"},{"name":"bob","role":"qa","provider":"opencode-go","model":"deepseek-v4.1-flash"}],"tasks":[]}}. '
    + '3) Call the tool agent_teams_status AGAIN with an empty arguments object (a team now exists). '
    + '4) Call agent_teams_set_member_route with arguments {"member_name":"alice","provider":"deepseek-official","model":"deepseek-v4-pro"}. '
    + '5) Call agent_teams_set_member_profile with arguments {"member_name":"alice","execution_prompt":"probe"}. '
    + '6) Call agent_teams_add_member with arguments {"name":"probe","role":"worker"}. '
    + '7) Call agent_teams_edit_plan with arguments {"operations":[{"action":"add_task","subject":"probe task","assignee":"bob"}]}. '
    + 'A step may fail; that is expected and is part of the check: do not retry, do not fix anything, do not approve the plan. '
    + 'Then reply with a single line in this exact form and nothing else: '
    + 'STATUS err=<the exact error text of step 1, or none> NEWTOOLS set_member_route=<yes or no> add_member=<yes or no> set_member_profile=<yes or no> '
    + 'EDITPLAN err=<the exact error text of step 7, or none> (for NEWTOOLS answer whether those three names appear in the tool list you were given).';

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
            same: hashes.payload.length === 64 && hashes.payload.length === 64
                && hashes.payload === hashes.installed && hashes.installed === hashes.source,
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
        // V11-F3: the success branch used to call process.exit(0) before asserting anything, so a
        // probe that loaded NOTHING at all still read as a pass. The child now asserts the namespace
        // it received, prints a marker, and only then exits 0.
        const code = 'import(' + JSON.stringify(target) + ').then('
            + '(m) => { if (m === null || typeof m !== "object") { console.error("probe: import tra ve " + typeof m); process.exit(5); }'
            + ' console.log("loaded:" + Object.keys(m).length); process.exit(0); },'
            + ' (e) => { console.error(e.name + ": " + e.message); process.exit(e.name === "SyntaxError" ? 42 : 3); });';
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 120000 });
        return {
            module: name,
            status: result.status,
            syntaxError: result.status === 42,
            loaded: (result.stdout ?? '').includes('loaded:'),
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
    check('C2 3 chiều ' + FILES.length + '/' + FILES.length + ' SAME (payload tarball ↔ bản cài profile sạch ↔ nguồn)',
        rows.length === FILES.length && rows.every((row) => row.same),
        rows.filter((row) => row.same).length + '/' + FILES.length + ' SAME' + (rows.length === FILES.length ? '' : ' (thiếu hàng: ' + rows.length + ' tệp)'),
        rows.map((row) => row.file + ' payload=' + row.payload.slice(0, 12) + ' installed=' + row.installed.slice(0, 12) + ' source=' + row.source.slice(0, 12)).join('\n'));

    const required = meta.entries?.required ?? [];
    const forbidden = meta.entries?.forbidden ?? {};
    check('C3 tarball đủ entry bắt buộc, 0 node_modules/tests/tgz lồng',
        required.length === REQUIRED_ENTRIES.length && required.every((item) => item.present)
        && forbidden.nodeModules.length === 0 && forbidden.tests.length === 0
        && forbidden.nestedTgz.length === 0 && forbidden.pid.length === 0 && forbidden.tools.length === 0,
        required.filter((item) => item.present).length + '/' + REQUIRED_ENTRIES.length + ' bắt buộc; node_modules=' + forbidden.nodeModules.length
        + ' tests=' + forbidden.tests.length + ' tgz-lồng=' + forbidden.nestedTgz.length + ' pid=' + forbidden.pid.length
        + ' tools=' + forbidden.tools.length,
        'tar -tzf + reader: ' + String(meta.entries?.count ?? 0) + ' entry (tar ' + (meta.entries?.tarAvailable ? 'khớp reader' : 'không dùng được') + ')');

    const profile = meta.profile ?? {};
    check('C4 cài từ tarball vào profile sạch (không symlink, resolved file:)',
        meta.npm?.status === 0 && profile.lstat?.isSymbolicLink === false && profile.lstat?.isDirectory === true
        && profile.insideProfile === true && String(profile.lockResolved).startsWith('file:')
        && profile.version === '0.2.0-dev.0',
        'npm=' + meta.npm?.status + ' symlink=' + profile.lstat?.isSymbolicLink + ' dir=' + profile.lstat?.isDirectory
        + ' insideProfile=' + profile.insideProfile + ' version=' + (profile.version ?? '?')
        + ' lockResolved=' + String(profile.lockResolved).slice(0, 60),
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
    check('C6 payload + bản cài khai báo đủ ' + NEW_TOOLS.length + ' tool mới (lib/tool-names.js, nạp thật không regex)',
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
    check('C7 boot gọi THẬT được cả ' + NEW_TOOLS.length + ' tool mới (có tool_result, không phải lỗi "không có tool")',
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

    // V5-F3: a probe that only tells SyntaxError apart from other errors lets a tarball with a
    // MISSING export through. Each expected name is imported and asserted on the shipped copy.
    const exportRows = meta.exports ?? [];
    const exportTotal = Object.keys(meta.expectedExports ?? {}).reduce((sum, key) => sum + meta.expectedExports[key].length, 0);
    const exportOk = exportRows.filter((row) => row.ok === true);
    check('C10 bản CÀI export đủ tên thật (' + exportOk.length + '/' + exportTotal + ' named export)',
        exportRows.length === exportTotal && exportOk.length === exportTotal,
        exportOk.length + '/' + exportTotal + ' export nạp được'
            + (exportRows.length === exportTotal ? '' : ' (assert ' + exportRows.length + ' tên)')
            + (exportRows.filter((row) => row.ok !== true).length === 0 ? '' : ' — THIẾU: ' + exportRows.filter((row) => row.ok !== true).map((row) => row.module + ':' + row.name).join(', ')),
        exportRows.map((row) => (row.ok === true ? 'ok ' : 'MISSING ') + row.module + ' export ' + row.name + (row.error === '' ? '' : ' (' + row.error + ')')).join('\n'));

    const driftBefore = meta.driftBefore ?? {};
    const driftAfter = meta.driftAfter ?? {};
    const gateAtPack = meta.gateAtPack ?? {};
    check('C11 drift=0 trong cửa sổ pack (' + FILES.length + ' tệp, trước và sau) + cổng ' + GATE_TASK_ID + ' completed',
        Array.isArray(driftBefore.files) && driftBefore.files.length === FILES.length
        && Array.isArray(driftAfter.files) && driftAfter.files.length === FILES.length
        && (meta.drift?.drift ?? -1) === 0
        && gateAtPack.end === 'completed',
        'drift=' + (meta.drift?.drift ?? 'n/a') + ' (trước ' + (driftBefore.files?.length ?? 0) + ' tệp / sau ' + (driftAfter.files?.length ?? 0) + ' tệp)'
            + ' | ' + GATE_TASK_ID + ' lúc pack: ' + (gateAtPack.start ?? '?') + ' -> ' + (gateAtPack.end ?? '?')
            + (meta.drift?.changed?.length ? ' | đổi: ' + meta.drift.changed.join(', ') : ''),
        (driftBefore.files ?? []).map((row) => row.file + ' ' + row.sha256.slice(0, 12) + '/' + row.bytes).join('\n'));

    const driftEnd = meta.driftEnd ?? {};
    check('C12 nguồn không đổi suốt pack -> cài -> boot (artefact khớp HEAD)',
        (driftEnd.drift ?? -1) === 0,
        'drift sau boot=' + (driftEnd.drift ?? 'n/a') + (driftEnd.changed?.length ? ' | đổi: ' + driftEnd.changed.join(', ') : ''),
        '');

    const css = meta.css ?? {};
    const cardSame = meta.componentAtStart?.card !== undefined && meta.componentAtStart?.card === meta.componentAtEnd?.card;
    const workspaceSame = meta.componentAtStart?.workspace !== undefined && meta.componentAtStart?.workspace === meta.componentAtEnd?.workspace;
    check('C13 bundle trong tarball mang lại CSS: đếm aYQbCq_ >= 719 va >= 150 ten, BẰNG nguồn, có planSave',
        css.tokensPayload >= 719 && css.tokensPayload === css.tokensSource
        && css.classesPayload >= 150 && css.classesPayload === css.classesSource
        && css.payloadHasPlanSave === true,
        'token aYQbCq_: nguồn=' + (css.tokensSource ?? 'n/a') + ' payload=' + (css.tokensPayload ?? 'n/a')
            + ' | lớp phân biệt: nguồn=' + (css.classesSource ?? 'n/a') + ' payload=' + (css.classesPayload ?? 'n/a')
            + ' | stylesheet=' + (css.classesStylesheet ?? 'n/a') + ' lớp / ' + (css.stylesheetBytes ?? 'n/a') + ' B'
            + ' | planSave payload=' + css.payloadHasPlanSave + ' stylesheet=' + css.stylesheetHasPlanSave,
        'nguồn ' + (css.tokensSource ?? 0) + ' lần xuất hiện aYQbCq_ trong lib/client.js (18 lớp cũ chỉ ~90)');

    check('C14 bundle ĐÃ CÀI có panel mới (data-member-route-control, data-add-member, aYQbCq_ >= 719, planSave, card/workspace không đổi)',
        css.tokensInstalled >= 719 && css.installedHasRouteControl === true && css.installedHasAddMember === true
        && css.installedHasPlanSave === true && css.installedHasCard === true && css.installedHasWorkspace === true
        && cardSame === true && workspaceSame === true,
        'token aYQbCq_ bản cài=' + (css.tokensInstalled ?? 'n/a') + ' · data-member-route-control=' + css.installedHasRouteControl
            + ' · data-add-member=' + css.installedHasAddMember + ' · planSave=' + css.installedHasPlanSave + ' · lớp=' + (css.classesInstalled ?? 'n/a')
            + ' · card=' + css.installedHasCard + '/' + cardSame + ' workspace=' + css.installedHasWorkspace + '/' + workspaceSame,
        '');

    check('C15 bundle ĐÃ CÀI mang đủ 8/8 dấu vết t67+t71+t74 (planSave, route-default/-warning, catalog-empty, pickDefaultRoute, error-detail, captainRoute, captain-route-warning)',
        css.installedHasPlanSave === true && css.installedHasRouteWarning === true && css.installedHasDefaultRoute === true
        && css.installedHasCatalogEmpty === true && css.installedHasPickDefaultRoute === true && css.installedHasErrorDetail === true
        && css.installedHasCaptainRoute === true && css.installedHasCaptainRouteWarning === true,
        'planSave=' + css.installedHasPlanSave + ' · route-default=' + css.installedHasDefaultRoute + ' · route-warning=' + css.installedHasRouteWarning
            + ' · catalog-empty=' + css.installedHasCatalogEmpty + ' · pickDefaultRoute=' + css.installedHasPickDefaultRoute + ' · error-detail=' + css.installedHasErrorDetail
            + ' · captainRoute=' + css.installedHasCaptainRoute + ' · captain-route-warning=' + css.installedHasCaptainRouteWarning,
        '');

    const dirEntries = meta.entries?.dirEntries;
    check('C17 tarball co 0 entry THU MUC va dung 133 entry',
        Array.isArray(dirEntries) && dirEntries.length === 0
        && (meta.entries?.tarDirEntries ?? []).length === 0
        && meta.entries?.count === 133 && meta.entries?.tarNameCount === 133,
        'entry=' + (meta.entries?.count ?? '?') + ' (tar ' + (meta.entries?.tarNameCount ?? '?') + ')'
            + ' · entry thu muc reader=' + (Array.isArray(dirEntries) ? dirEntries.length : '?')
            + ' · tar=' + (meta.entries?.tarDirEntries ?? []).length,
        '');

    const frozenRows = meta.driftBefore?.files ?? [];
    const frozenMisses = Object.entries(FROZEN).filter(([file, hash]) => {
        const row = frozenRows.find((item) => item.file === file);
        return row === undefined || row.sha256.slice(0, 16) !== hash;
    }).map(([file]) => file);
    check('C18 baseline khop 12/12 bang dong bang cua captain (do NGAY truoc pack)',
        frozenRows.length === 12 && frozenMisses.length === 0,
        frozenRows.length + '/12 tep trong baseline; lech: ' + (frozenMisses.length === 0 ? 'khong' : frozenMisses.join(', ')),
        frozenRows.map((row) => row.file + ' ' + row.sha256.slice(0, 16) + '/' + row.bytes).join('\n'));

    const absHits = meta.absPaths?.hits ?? [];
    check('C19 bundle/tarball khong con duong dan tuyet doi (0 hit X:\\<ten 2+ ky tu>\\ hoac Project\\Agent-Team)',
        Array.isArray(absHits) && absHits.length === 0 && typeof meta.absPaths?.scannedRoot === 'string',
        absHits.length === 0 ? '0 hit tren toan bo lib/** trong payload' : absHits.length + ' hit: ' + absHits.slice(0, 3).join(' | '),
        String(meta.absPaths?.scannedRoot ?? ''));

    const namesInstalled = meta.toolNames ?? {};
    const wanted = ['agent_teams_set_member_route', 'agent_teams_set_member_profile'];
    const missingNames = wanted.filter((name) => !(namesInstalled.installedCaptain ?? []).includes(name)
        || !(namesInstalled.installedTeam ?? []).includes(name));
    check('C20 lib/tool-names.js BAN CAI chua ca set_member_route + set_member_profile trong TEAM va CAPTAIN',
        missingNames.length === 0 && (namesInstalled.installedTeam ?? []).includes('agent_teams_add_member'),
        'TEAM=' + (namesInstalled.installedTeam ?? []).length + ' CAPTAIN=' + (namesInstalled.installedCaptain ?? []).length
            + ' · thieu: ' + (missingNames.length === 0 ? 'khong' : missingNames.join(', '))
            + ' · add_member=' + (namesInstalled.installedTeam ?? []).includes('agent_teams_add_member'),
        '');

    const art = meta.artifactRecheck ?? meta.artifact ?? {};
    check('C21 --analyze doc lai TARBALL tren dia (sha256/bytes/entry that, khong tin meta)',
        typeof art.sha256Now === 'string' && art.sha256Now.length === 64
        && art.sha256Now === meta.tarball?.sha256 && art.bytesNow === meta.tarball?.bytes,
        'sha256=' + String(art.sha256Now ?? '').slice(0, 16) + ' bytes=' + (art.bytesNow ?? '?')
            + ' entry=' + (art.entriesNow ?? 'n/a') + ' · khop meta=' + (art.sha256Now === meta.tarball?.sha256),
        String(art.path ?? ''));

    const types = meta.shippedTypes ?? {};
    check('C16 ban cai ship khai bao kieu captainRoute (interface TeamCaptainRoute + field optional, payload = ban cai)',
        types.payloadHasInterface === true && types.payloadHasField === true
        && types.installedHasInterface === true && types.installedHasField === true
        && types.identical === true,
        'interface payload=' + types.payloadHasInterface + ' installed=' + types.installedHasInterface
            + ' · field payload=' + types.payloadHasField + ' installed=' + types.installedHasField
            + ' · payload==installed=' + types.identical + ' · ' + (types.bytes ?? '?') + ' B',
        'lib/types/snapshot.d.ts');

    const mutation = meta.selfMutation ?? {};
    const mutationCodes = mutation.exitCodes ?? [];
    check('C22 SELF_MUTATION: probe export BIET FAIL (chen 1 ten khong ton tai -> exit != 0)',
        mutation.caught === true && mutationCodes.length === Object.keys(EXPECTED_EXPORTS).length
        && mutationCodes.every((code) => typeof code === 'number' && code !== 0),
        'caught=' + mutation.caught + ' · marker=' + (mutation.marker ?? '(khong co)') + ' · exit=' + mutationCodes.join(',')
            + ' · ' + String(mutation.detail ?? ''),
        'chen marker vao want list trong BO NHO, khong cham dia');

    const driftInstall = meta.driftAfterInstall?.drift;
    check('C23 drift=0 tai 3 moc (truoc pack / ngay sau pack / sau khi cai) tren ' + FILES.length + ' tep',
        meta.drift?.drift === 0 && meta.driftEnd?.drift === 0 && driftInstall === 0,
        'truoc pack=' + (meta.drift?.drift ?? 'n/a') + ' · sau pack=' + (meta.drift?.drift ?? 'n/a')
            + ' · sau cai=' + (driftInstall ?? 'n/a'),
        'driftBetween(before, ...) tren ' + FILES.length + ' tep');

    // BUG-024 was fixed twice: structured output (t90) and then the TEXT the captain actually reads
    // (t94). A tarball that ships the first fix without the second one is a shipped half-fix, so the
    // boot session's verbatim tool_result of agent_teams_edit_plan is checked here, byte for byte.
    const editText = String(meta.boot?.editPlanText ?? '');
    const expectedRows = [
        'alice (researcher; deepseek-official/deepseek-v4-pro (override))',
        'bob (qa; opencode-go/deepseek-v4.1-flash)',
    ];
    const hasSummaryLine = editText.includes('updated atomically');
    check('C24 boot: text tool_result cua agent_teams_edit_plan in ROSTER (route hieu luc + dau (override))',
        editText !== '' && hasSummaryLine && expectedRows.every((row) => editText.includes(row)),
        'len=' + editText.length + ' summary=' + hasSummaryLine
            + ' rows=' + expectedRows.map((row) => (editText.includes(row) ? 'ok' : 'THIEU')).join(','),
        editText);

    // The create render dropped its whole Members block before t99: a captain who created a staged
    // plan could not read which members or routes it had just written. This is the second verbatim
    // text witness, taken from the same boot session.
    const createText = String(meta.boot?.createText ?? '');
    const membersBlock = /Members \(\d+\):/u.test(createText);
    const rowsInCreate = ['alice', 'bob'].every((name) => createText.includes(name));
    check('C25 boot: text tool_result cua agent_teams_create in khoi Members (render parity BUG-025)',
        createText !== '' && membersBlock && rowsInCreate,
        'len=' + createText.length + ' membersBlock=' + membersBlock + ' rows=' + (rowsInCreate ? 'ok' : 'THIEU'),
        createText);
    // BUG-026 write half, on the bytes that ship: compared character for character, because a softer
    // message ('invalid source') would read differently to an operator debugging a 422 from the ERP side.
    // exit=3 in the detail means the call did not throw at all, i.e. a foreign source would have been written.
    const EXPECTED_GUARD = 'agent-teams: route change for member "alice" refused: source "erp" is not one the plugin owns (valid sources: captain, http, profile); nothing was written';
    const guardMessage = String(meta.guard?.message ?? '');
    check('C26 ban CAI tu choi source erp dung NGUYEN VAN (BUG-026 write half, setMemberRoute tren bytes da cai)',
        meta.guard?.threw === true && guardMessage === EXPECTED_GUARD,
        'exit=' + (meta.guard?.exitCode ?? 'n/a') + ' threw=' + (meta.guard?.threw === true)
            + ' khop-nguyen-van=' + (guardMessage === EXPECTED_GUARD) + ' len=' + guardMessage.length,
        guardMessage === '' ? '(khong co message)' : guardMessage);

    // Round 14 added the team identity to the status TEXT: a captain reading the text (not the JSON) must
    // see which team it is and which phase it is in. The LAST status call is the one made after the team
    // exists; the first legitimately answers 'you do not lead ...', which is C5's witness.
    const statusTexts = meta.boot?.statusTexts ?? [];
    const lastStatusText = statusTexts.length === 0 ? '' : String(statusTexts[statusTexts.length - 1]);
    const teamLineMatch = /Team id: \S+ · phase: \S+/u.exec(lastStatusText);
    check('C27 boot: text tool_result cua agent_teams_status co dong "Team id: ... - phase: ..."',
        statusTexts.length > 1 && teamLineMatch !== null,
        'status-calls=' + statusTexts.length + ' khop=' + (teamLineMatch === null ? 'KHONG' : 'ok')
            + (teamLineMatch === null ? '' : ' -> ' + teamLineMatch[0]),
        lastStatusText);

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


// ----------------------------------------------------------- t52 gate and drift
const GATE_TASK_ID = 't103';
const GATE_MAX_MINUTES = 15;
const ATTEMPT_LIMIT = 3;
const TEAM_STATE_FILE = join(repoRoot, '.agent-teams', 'nami-agent-teams', 'team.json');

function gateTaskStatus(taskId) {
    try {
        const state = JSON.parse(readFileSync(TEAM_STATE_FILE, 'utf8'));
        const task = (state.tasks ?? []).find((item) => item.id === taskId);
        return task?.status ?? 'missing';
    }
    catch (error) {
        return 'unreadable:' + String(error?.message ?? error).slice(0, 80);
    }
}

function sleepMs(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** t56 rewrites lib/types/members.d.ts; packing before it finishes ships a declaration file
 *  that disagrees with the JS it describes. Polls the shared task ledger, never the network. */
function waitForGate(taskId, maxMinutes) {
    const deadline = Date.now() + maxMinutes * 60000;
    const history = [];
    for (;;) {
        const status = gateTaskStatus(taskId);
        history.push({ at: new Date().toISOString(), status });
        if (status === 'completed') return { ok: true, taskId, status, polls: history.length, history };
        if (Date.now() >= deadline) return { ok: false, taskId, status, polls: history.length, history };
        sleepMs(30000);
    }
}

/** sha256 + size of the 10 release files, taken at one instant. */
function driftSnapshot() {
    const files = FILES.map((rel) => {
        const path = join(pluginDir, ...rel.split('/'));
        const present = existsSync(path);
        const buffer = present ? readFileSync(path) : undefined;
        return { file: rel, sha256: buffer === undefined ? 'MISSING' : sha256(buffer), bytes: buffer?.length ?? 0 };
    });
    return { at: new Date().toISOString(), files };
}

function driftBetween(before, after) {
    const changed = before.files
        .filter((item) => {
            const now = after.files.find((other) => other.file === item.file);
            return now === undefined || now.sha256 !== item.sha256 || now.bytes !== item.bytes;
        })
        .map((item) => item.file);
    const missing = after.files.filter((item) => before.files.every((other) => other.file !== item.file)).map((item) => item.file);
    return { drift: changed.length + missing.length, changed: [...changed, ...missing] };
}

// --------------------------------------------------------------- export asserts
const EXPECTED_EXPORTS = {
    'tools.js': ['registerAgentTeamsTools'],
    'members.js': ['activateMemberNow', 'setMemberRoute', 'setMemberProfile', 'routeOf', 'recordAutoFallback',
        'isFallbackFailureCode', 'selectFallbackRoute', 'selectionFromMember'],
    'state.js': ['readTeam', 'writeTeam', 'readTeamSync'],
    'snapshot.js': ['assembleTeamSnapshot', 'collectTeamsActivity', 'collectArchivedTeamsActivity', 'memberModelRoute'],
    'tool-names.js': ['TEAM_TOOL_NAMES', 'MEMBER_TOOL_NAMES', 'CAPTAIN_TOOL_NAMES'],
};

/** Import a shipped module in a child process and ASSERT which NAMED exports exist.
 *
 *  V11-F3 (audit round 11) was this function: the child called process.exit(0) on BOTH branches, so
 *  an import that threw still looked like a clean probe and no missing export could ever fail it.
 *  The contract is now:
 *    - child exits 0 ONLY when every requested name is present,
 *    - child exits 1 when a requested name is missing (rows + 'missing named export' on stderr),
 *    - child exits 2 when the import itself threw (all rows false + the error on stderr),
 *  and the parent records 'status' on every row so score()/printVerdict can show the real exit code.
 *  extraNames injects names that do not exist; the SELF_MUTATION control uses that to prove the
 *  probe is capable of failing at all (nothing is written to disk to do it). */
function assertExports(libDir, extraNames = []) {
    const rows = [];
    for (const [file, names] of Object.entries(EXPECTED_EXPORTS)) {
        const want = names.concat(extraNames);
        const url = pathToFileURL(join(libDir, file)).href;
        const code = 'const want=' + JSON.stringify(want) + ';import(' + JSON.stringify(url) + ').then((m)=>{'
            + 'const rows=want.map((n)=>[n,typeof m[n]!=="undefined"]);'
            + 'console.log(JSON.stringify(rows));'
            + 'const missing=rows.filter((r)=>r[1]!==true).map((r)=>r[0]);'
            + 'if(missing.length>0){console.error("missing named export: "+missing.join(","));process.exit(1);}'
            + 'process.exit(0);},'
            + '(e)=>{console.error(e.name+": "+String(e.message).slice(0,140));'
            + 'console.log(JSON.stringify(want.map((n)=>[n,false])));process.exit(2);});';
        const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 120000 });
        const lastLine = (run.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
        const stderrFirst = (run.stderr ?? '').split('\n').filter(Boolean)[0] ?? '';
        let parsed;
        try {
            parsed = JSON.parse(lastLine);
        }
        catch {
            parsed = { error: 'khong doc duoc ket qua con (exit=' + run.status + '): ' + lastLine.slice(0, 120) };
        }
        if (Array.isArray(parsed)) {
            for (const pair of parsed) {
                rows.push({ module: file, name: pair[0], ok: pair[1] === true,
                    error: pair[1] === true ? '' : (stderrFirst || 'missing'), status: run.status });
            }
        }
        else {
            for (const name of names) {
                rows.push({ module: file, name, ok: false, error: parsed.error ?? 'import that bai', status: run.status });
            }
        }
    }
    return rows;
}

/** SELF_MUTATION control for V11-F3: ask the probe for one export that cannot exist. A probe that
 *  can fail must come back with a non-zero child exit on EVERY module; a probe whose child always
 *  exits 0 reports 'not caught' and the run fails. The mutation lives in memory only. */
const SELF_MUTATION_MARKER = '__t104_self_mutation_marker__';
function selfMutationProbe(libDir) {
    const rows = assertExports(libDir, [SELF_MUTATION_MARKER]);
    const markerRows = rows.filter((row) => row.name === SELF_MUTATION_MARKER);
    const exitCodes = markerRows.map((row) => row.status);
    const caught = markerRows.length > 0 && markerRows.every((row) => row.ok === false)
        && exitCodes.every((code) => typeof code === 'number' && code !== 0);
    const detail = 'marker rows=' + markerRows.length + ' ok=false=' + markerRows.filter((row) => row.ok === false).length;
    console.log('SELF_MUTATION: ' + (caught ? 'caught exit=' + exitCodes.join(',') : 'NOT caught exit=' + exitCodes.join(',') + ' (' + detail + ')'));
    return { marker: SELF_MUTATION_MARKER, caught, exitCodes, rows: markerRows, detail };
}


/** BUG-026 write half, measured on the SHIPPED bytes. The guard in lib/members.js refuses a provenance
 *  source the plugin does not own BEFORE the lock, before the durable write and before the audit row.
 *  The tool surface cannot reach it with a caller-chosen source (lib/tools.js passes 'captain' at
 *  :1327/:1435/:1513 and lib/index.js 'http'/'profile'), so the refusal is provoked through the same
 *  in-process entry point a third-party caller uses, on the INSTALLED copy, and the message is returned
 *  verbatim for C26. The child exits 0 only when the call really threw; exit 3 means nothing was refused
 *  and C26 must fail. Paths travel through the environment so no Windows path is spliced into source. */
function guardProbe(installDir, workspace) {
    const code = "import { pathToFileURL } from 'node:url';\nimport { join } from 'node:path';\nconst libDir = process.env.T104_GUARD_LIB;\nconst workspace = process.env.T104_GUARD_WS;\nconst mod = await import(pathToFileURL(join(libDir, 'members.js')).href);\nconst captain = { id: 'sess-guard', session: { header: { cwd: workspace }, append() {}, requestHeader: () => ({ config: {} }) } };\nconst selections = { isPendingMember: () => false, async withPending() {}, liveChildIds: () => [], liveRoute: () => undefined, setLiveRoute: () => false };\nconst ctx = { logger: { debug() {}, info() {}, warn() {}, error() {} }, llm: { listModels: async () => [], resolveCallConfig: async (c) => c }, agents: { get: () => undefined } };\nlet out;\ntry {\n    await mod.setMemberRoute(ctx, {}, selections, captain, '.agent-teams', 'team-guard', 'alice', { source: 'erp', provider: 'opencode-go', model: 'deepseek-v4.1-flash' });\n    out = { threw: false, message: '' };\n}\ncatch (error) {\n    out = { threw: true, message: String(error && error.message ? error.message : error) };\n}\nprocess.stdout.write(JSON.stringify(out));\nprocess.exitCode = out.threw ? 0 : 3;";
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
        encoding: 'utf8', timeout: 120000,
        env: { ...process.env, T104_GUARD_LIB: join(installDir, 'lib'), T104_GUARD_WS: workspace },
    });
    const raw = (run.stdout ?? '').trim();
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        parsed = { threw: false, message: '', parseError: (raw + (run.stderr ?? '')).slice(-300) };
    }
    return {
        exitCode: run.status,
        threw: parsed.threw === true,
        message: String(parsed.message ?? ''),
        parseError: parsed.parseError,
        stderrTail: (run.stderr ?? '').slice(-400),
    };
}
// ------------------------------------------------------------------ one attempt
/** Pack -> unpack -> install -> verify -> boot, retried while the shared source tree moves. */
function componentHashes() {
    const h = (rel) => createHash('sha256').update(readFileSync(join(pluginDir, rel))).digest('hex');
    return { card: h('lib/client/AgentTeamsCard.js'), workspace: h('lib/client/WorkspaceActivity.js') };
}

async function attemptOnce(meta, attemptNumber, workspace) {
    const before = driftSnapshot();
    meta.driftBefore = before;
    meta.sourceAtStart = libJsHashes(pluginDir);
    meta.componentAtStart = componentHashes();
    meta.sourceProbeStart = probeModules(join(pluginDir, 'lib'), CORE_MODULES);
    if (meta.sourceProbeStart.some((item) => item.syntaxError)) {
        return { ok: false, reason: 'nguồn lib/** không parse được (probe import) — không pack' };
    }

    const gateAtPackStart = gateTaskStatus(GATE_TASK_ID);
    const tgz = packFresh(meta, packDir, 'pack1');
    const tgzAgain = packFresh(meta, join(packDir, 'repack'), 'pack2');
    const after = driftSnapshot();
    meta.driftAfter = after;
    meta.gateAtPack = { start: gateAtPackStart, end: gateTaskStatus(GATE_TASK_ID) };
    meta.drift = driftBetween(before, after);
    meta.attemptsDone = attemptNumber;

    if (tgz === undefined || tgzAgain === undefined) {
        meta.tarball = { path: undefined };
        return { ok: false, reason: 'npm pack thất bại' };
    }
    const buffer = readFileSync(tgz);
    const bufferAgain = readFileSync(tgzAgain);
    const entries = readTarball(tgz);
    const entriesAgain = readTarball(tgzAgain);
    const listing = tarListing(tgz);
    meta.tarball = { name: tgz.split(sep).pop(), path: tgz, bytes: buffer.length, sha256: sha256(buffer), entryCount: entries.length };
    meta.packs = [
        { destination: 'tests/tmp/t104', name: tgz.split(sep).pop(), path: tgz, bytes: buffer.length, sha256: sha256(buffer), entryCount: entries.length },
        { destination: 'tests/tmp/t104/repack', name: tgzAgain.split(sep).pop(), path: tgzAgain, bytes: bufferAgain.length, sha256: sha256(bufferAgain), entryCount: entriesAgain.length },
    ];
    meta.entries = {
        count: entries.length,
        tarAvailable: listing.available,
        tarNameCount: listing.names.length,
        readerMatchesTar: listing.available ? listing.names.length === entries.length : undefined,
        required: REQUIRED_ENTRIES.map((name) => ({ name, present: entries.some((entry) => entry.name === name) })),
        dirEntries: entries.filter((entry) => entry.name.endsWith('/')).map((entry) => entry.name),
        tarDirEntries: listing.names.filter((name) => name.endsWith('/')),
        forbidden: {
            nodeModules: entries.filter((entry) => entry.name.includes('node_modules')).map((entry) => entry.name),
            tests: entries.filter((entry) => entry.name.startsWith('package/tests')).map((entry) => entry.name),
            nestedTgz: entries.filter((entry) => entry.name.endsWith('.tgz')).map((entry) => entry.name),
            pid: entries.filter((entry) => entry.name.endsWith('.pid')).map((entry) => entry.name),
            tools: entries.filter((entry) => entry.name.startsWith('package/tools')).map((entry) => entry.name),
        },
    };

    if (meta.drift.drift !== 0 || meta.gateAtPack.end !== 'completed') {
        return { ok: false, reason: 'cây nguồn động/cổng chưa xong trong lúc pack: drift=' + meta.drift.drift + ' ' + GATE_TASK_ID + '=' + meta.gateAtPack.end };
    }

    const payloadDir = unpackPayload(tgz, entries, meta);
    const payloadNames = await readToolNames(payloadDir);
    const installDir = installIntoCleanProfile(tgz, meta);
    meta.threeWay = hashThreeWays(payloadDir, entries, installDir);
    // Third drift milestone required by the task: the source tree must still be the one that was
    // packed after the tarball has been unpacked AND installed into a clean profile.
    meta.driftAfterInstall = driftBetween(before, driftSnapshot());
    meta.sourceAfterInstall = libJsHashes(pluginDir);
    // t77 declared captainRoute in a .d.ts that esbuild strips, so the type never reaches the
    // bundle: the only way it can travel to a user is inside the tarball itself.
    const dtsPayload = readFileSync(join(payloadDir, 'lib', 'types', 'snapshot.d.ts'), 'utf8');
    const dtsInstalled = readFileSync(join(installDir, 'lib', 'types', 'snapshot.d.ts'), 'utf8');
    meta.shippedTypes = {
        payloadHasInterface: /interface\s+TeamCaptainRoute\b/u.test(dtsPayload),
        payloadHasField: /readonly\s+captainRoute\?\s*:/u.test(dtsPayload),
        installedHasInterface: /interface\s+TeamCaptainRoute\b/u.test(dtsInstalled),
        installedHasField: /readonly\s+captainRoute\?\s*:/u.test(dtsInstalled),
        identical: dtsPayload === dtsInstalled,
        bytes: dtsInstalled.length,
    };
    meta.profile = { ...(meta.profile ?? {}), version: JSON.parse(readFileSync(join(installDir, 'package.json'), 'utf8')).version };
    // F5 (t23) was a bundle that leaked the build machine: scan the DECODED bytes, not the JSON
    // text, because a Windows path inside a .map is stored with escaped backslashes.
    const absoluteHits = [];
    const scanText = (label, value) => {
        // Three false positives taught this pattern: 'http://x' reads as 'p:/', the '\\n' escape at
        // the end of a template literal reads as 't:\\', and '\\n${contract}\\' reads as a drive path.
        // So a segment must hold at least 2 plain path chars (no $ { } \\ /) FOLLOWED by a second
        // separator - that is what a real absolute path looks like.
        const drivePath = /(?:^|[\s"'(=,:])[A-Za-z]:[\\/][A-Za-z0-9_. -]{2,}[\\/]/gu;
        const buildRoot = /Project[\\/]Agent-Team|[A-Za-z]:[\\/]Users[\\/]|[A-Za-z]:[\\/]dsh[\\/]/gu;
        const hits = [...(value.match(drivePath) ?? []), ...(value.match(buildRoot) ?? [])];
        if (hits.length > 0) absoluteHits.push(label + ' -> ' + hits.slice(0, 3).join(' '));
    };
    const walkShipped = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) { walkShipped(full); continue; }
            if (!/\.(js|css|json|txt|md|yml)$/u.test(entry.name)) continue;
            scanText(full.slice(dir.length + 1), readFileSync(full, 'utf8'));
            if (entry.name.endsWith('.map')) {
                try {
                    const map = JSON.parse(readFileSync(full, 'utf8'));
                    for (const item of map.sources ?? []) scanText(entry.name + ' sources', String(item));
                    for (const item of map.sourcesContent ?? []) scanText(entry.name + ' sourcesContent', String(item ?? ''));
                }
                catch { /* not JSON: the text scan above already covered it */ }
            }
        }
    };
    walkShipped(join(payloadDir, 'lib'));
    meta.absPaths = { hits: absoluteHits, scannedRoot: join(payloadDir, 'lib') };
    // Re-hash the tarball from disk so --analyze proves the ARTEFACT, not the metadata about it.
    meta.artifact = { path: tgz, sha256Now: sha256(buffer), bytesNow: buffer.length,
        matchesMeta: sha256(buffer) === meta.tarball.sha256 && buffer.length === meta.tarball.bytes };
    meta.expectedExports = EXPECTED_EXPORTS;
    meta.exports = assertExports(join(installDir, 'lib'));
    // V11-F3 control: prove the probe can FAIL before trusting the 19/19 above it.
    meta.selfMutation = selfMutationProbe(join(installDir, 'lib'));

    // BUG-018: a bundle whose ActivityPanel stylesheet was cut to 18 classes still boots. Counting
    // the class tokens inside the SHIPPED and INSTALLED bytes is what makes that loss visible.
    const cssTokens = (text) => (text.match(/aYQbCq_/gu) ?? []).length;
    const cssClasses = (text) => new Set(text.match(/aYQbCq_[A-Za-z0-9_-]+/gu) ?? []).size;
    const sourceClientText = readFileSync(join(pluginDir, 'lib', 'client.js'), 'utf8');
    const payloadClientText = readFileSync(join(payloadDir, 'lib', 'client.js'), 'utf8');
    const installedClientText = readFileSync(join(installDir, 'lib', 'client.js'), 'utf8');
    const sourceCssText = readFileSync(join(pluginDir, 'lib', 'client', 'ActivityPanel.module.css'), 'utf8');
    meta.css = {
        tokensSource: cssTokens(sourceClientText),
        tokensPayload: cssTokens(payloadClientText),
        tokensInstalled: cssTokens(installedClientText),
        classesSource: cssClasses(sourceClientText),
        classesPayload: cssClasses(payloadClientText),
        classesInstalled: cssClasses(installedClientText),
        classesStylesheet: new Set((sourceCssText.match(/\.aYQbCq_[A-Za-z0-9_-]+/gu) ?? []).map((item) => item.slice(1))).size,
        stylesheetBytes: sourceCssText.length,
        payloadHasPlanSave: payloadClientText.includes('aYQbCq_planSave'),
        installedHasPlanSave: installedClientText.includes('aYQbCq_planSave'),
        stylesheetHasPlanSave: /\.aYQbCq_planSave\s*\{/u.test(sourceCssText),
        installedHasRouteControl: installedClientText.includes('data-member-route-control'),
        installedHasAddMember: installedClientText.includes('data-add-member'),
        installedHasRouteWarning: installedClientText.includes('data-add-member-route-warning'),
        installedHasCatalogEmpty: installedClientText.includes('data-add-member-catalog-empty'),
        installedHasDefaultRoute: installedClientText.includes('data-add-member-route-default'),
        installedHasPickDefaultRoute: installedClientText.includes('pickDefaultRoute'),
        installedHasErrorDetail: installedClientText.includes('data-error-detail'),
        installedHasCaptainRoute: installedClientText.includes('captainRoute'),
        installedHasCaptainRouteWarning: installedClientText.includes('data-add-member-captain-route-warning'),
        installedHasFallbackBadge: installedClientText.includes('fallback'),
        installedHasCard: installedClientText.includes('data-agent-teams-card'),
        installedHasWorkspace: installedClientText.includes('data-agent-teams-workspace'),
    };
    meta.installedProbe = probeModules(join(installDir, 'lib'), CORE_MODULES);

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

    // BUG-026 write half: the guard lives in lib/members.js and is reached by every in-process caller
    // (the tools pass source 'captain', lib/index.js 'http'/'profile'), so the refusal is provoked on the
    // INSTALLED copy with a source the plugin does not own and its message is kept verbatim for C26.
    try {
        meta.guard = guardProbe(installDir, workspace);
    }
    catch (error) {
        meta.guard = { threw: false, message: '', error: String(error) };
    }

    const boot = runHeadless(bootPrompt, workspace);
    const stream = parseStream(boot.stdout);
    meta.boot = {
        command: boot.command,
        status: boot.status,
        signal: boot.signal,
        elapsedMs: boot.elapsedMs,
        sessionId: stream.sessionIds[0] ?? '',
        calls: stream.calls,
        results: Object.fromEntries(stream.results),
        stdoutTail: boot.stdout.split('\n').filter(Boolean).slice(-25).join('\n'),
        stderrTail: boot.stderr.slice(-1200),
        error: boot.error,
        eventCount: stream.events.length,
    };
    writeFileSync(join(meta.runDir, 'session.stdout.txt'), boot.stdout, 'utf8');
    writeFileSync(join(meta.runDir, 'session.stderr.txt'), boot.stderr, 'utf8');
    writeFileSync(join(meta.runDir, 'prompt.txt'), bootPrompt, 'utf8');
    // C24 reads the roster straight out of the raw stream: the model's own summary is not evidence.
    const textOf = (tool) => {
        const call = (meta.boot.calls ?? []).find((item) => item.tool === tool);
        return call === undefined ? '' : String(meta.boot.results?.[call.callId]?.result ?? '');
    };
    meta.boot.editPlanText = textOf('agent_teams_edit_plan');
    meta.boot.createText = textOf('agent_teams_create');
    // C27 needs the status TEXT of the call made AFTER the team exists, so every status result is kept in
    // call order (the first one legitimately answers 'you do not lead ...', which is C5's witness).
    meta.boot.statusTexts = (meta.boot.calls ?? []).filter((item) => item.tool === 'agent_teams_status')
        .map((item) => String(meta.boot.results?.[item.callId]?.result ?? ''));

    const end = driftSnapshot();
    meta.sourceAtEnd = libJsHashes(pluginDir);
    meta.componentAtEnd = componentHashes();
    meta.driftEnd = driftBetween(before, end);
    meta.driftEndAt = end.at;
    meta.driftEndFiles = end.files;
    return { ok: true, reason: 'pack + cài + boot xong' };
}

// ----------------------------------------------------------------------- main
async function main() {
    const argv = process.argv.slice(2);
    if (argv[0] === '--analyze') {
        let dir = resolve(argv[1] ?? '');
        // Accept either a run directory or the pack directory that holds run-* children.
        if (!existsSync(join(dir, 'meta.json'))) {
            const runs = existsSync(dir)
                ? readdirSync(dir).filter((name) => name.startsWith('run-') && existsSync(join(dir, name, 'meta.json'))).sort()
                : [];
            if (runs.length === 0) throw new Error('no meta.json in ' + dir + ' and no run-*/meta.json beneath it');
            dir = join(dir, runs[runs.length - 1]);
            console.log('analyze: dùng run mới nhất ' + dir);
        }
        const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
        const tgzPath = meta.tarball?.path ?? '';
        if (tgzPath !== '' && existsSync(tgzPath)) {
            const bytes = readFileSync(tgzPath);
            meta.artifactRecheck = { path: tgzPath, sha256Now: sha256(bytes), bytesNow: bytes.length, entriesNow: readTarball(tgzPath).length };
        }
        else {
            meta.artifactRecheck = { path: tgzPath, sha256Now: '', bytesNow: 0, entriesNow: 0 };
        }
        printVerdict(meta, score(meta), dir);
        return;
    }

    const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d+Z$/u, 'Z');
    const runDir = join(packDir, 'run-' + stamp);
    const workspace = join(runDir, 'workspace');
    mkdirSync(workspace, { recursive: true });

    const meta = { task: 't104', startedAt: new Date().toISOString(), runDir, workspace, attemptLog: [] };

    // 0. Gate: t99 is the last writer to lib/** in round 14 (it made every payload field reach the
    //    text render), so nothing may be packed before it reports completed; the gate is re-read
    //    after every pack.
    const gate = waitForGate(GATE_TASK_ID, GATE_MAX_MINUTES);
    meta.gate = { taskId: GATE_TASK_ID, ...gate };
    if (!gate.ok) {
        meta.aborted = 'cổng ' + GATE_TASK_ID + ' chưa completed sau ' + GATE_MAX_MINUTES + ' phút (status=' + gate.status + ') — KHÔNG phát hành';
        writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
        printVerdict(meta, score(meta), runDir);
        return;
    }

    // 1..n: pack only on a static tree; retry (60 s apart) while drift or the gate disagree.
    for (let attemptNumber = 1; attemptNumber <= ATTEMPT_LIMIT; attemptNumber += 1) {
        const outcome = await attemptOnce(meta, attemptNumber, workspace);
        meta.attemptLog.push({ attempt: attemptNumber, ok: outcome.ok, reason: outcome.reason, drift: meta.drift?.drift ?? null, gate: meta.gateAtPack?.end ?? null });
        writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
        if (outcome.ok && meta.drift?.drift === 0 && meta.driftEnd?.drift === 0 && meta.gateAtPack?.end === 'completed') {
            break;
        }
        const t56Now = gateTaskStatus(GATE_TASK_ID);
        if (t56Now !== 'completed') {
            meta.gate = { taskId: GATE_TASK_ID, ...(waitForGate(GATE_TASK_ID, GATE_MAX_MINUTES)) };
        }
        if (attemptNumber < ATTEMPT_LIMIT) sleepMs(60000);
    }

    if (meta.driftEnd === undefined) meta.driftEnd = { drift: -1, changed: ['chưa chạy xong'] };
    writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    printVerdict(meta, score(meta), runDir);
}

function printVerdict(meta, checks, dir) {
    const pad = (text, width) => String(text).padEnd(width, ' ');
    console.log('=== t104 pack vong 15 sau t102+t103 (BUG-026 dong ca hai nua) + guard message nguyen van + drift 3 moc ===');
    console.log('run: ' + dir);
    console.log('gate ' + GATE_TASK_ID + ': ' + (meta.gate?.status ?? '?') + ' (' + (meta.gate?.polls ?? 0) + ' lần hỏi)'
        + ' | lúc pack: ' + (meta.gateAtPack?.start ?? '?') + ' -> ' + (meta.gateAtPack?.end ?? '?'));
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
    console.log('drift=' + (meta.drift?.drift ?? 'n/a') + ' (trước pack ' + (meta.driftBefore?.files?.length ?? 0) + ' tệp, sau pack ' + (meta.driftAfter?.files?.length ?? 0) + ' tệp)'
        + ' | drift sau boot=' + (meta.driftEnd?.drift ?? 'n/a')
        + ' | drift sau cai=' + (meta.driftAfterInstall?.drift ?? 'n/a'));
    for (const round of meta.attemptLog ?? []) {
        console.log('attempt ' + round.attempt + ': ok=' + round.ok + ' drift=' + round.drift + ' gate=' + round.gate + ' — ' + round.reason);
    }
    console.log('');
    console.log(pad('file', 34) + pad('payload', 15) + pad('installed', 15) + pad('source', 15) + pad('bytes p/i/s', 22) + 'verdict');
    for (const row of meta.threeWay ?? []) {
        console.log(pad(row.file, 34) + pad(row.payload.slice(0, 12), 15) + pad(row.installed.slice(0, 12), 15) + pad(row.source.slice(0, 12), 15)
            + pad(row.bytes.payload + '/' + row.bytes.installed + '/' + row.bytes.source, 22) + (row.same ? 'SAME' : 'DIFF'));
    }
    console.log('');
    const exportRows = meta.exports ?? [];
    for (const row of exportRows) {
        console.log((row.ok === true ? 'ok   ' : 'MISS ') + (exportRows.indexOf(row) + 1) + ' export ' + row.module + ':' + row.name + (row.error === '' ? '' : ' (' + row.error + ')'));
    }
    console.log('');
    console.log('SELF_MUTATION: ' + ((meta.selfMutation?.caught === true)
        ? 'caught exit=' + (meta.selfMutation.exitCodes ?? []).join(',')
        : 'NOT caught exit=' + ((meta.selfMutation?.exitCodes ?? []).join(',') || '(khong chay)')));
    console.log('--- agent_teams_edit_plan tool_result (nguyen van) ---');
    console.log(meta.boot?.editPlanText === undefined || meta.boot?.editPlanText === '' ? '(khong co)' : meta.boot.editPlanText);
    console.log('--- het text edit_plan ---');
    console.log('--- agent_teams_create tool_result (nguyen van) ---');
    console.log(meta.boot?.createText === undefined || meta.boot?.createText === '' ? '(khong co)' : meta.boot.createText);
    console.log('--- het text create ---');
    console.log('--- agent_teams_status tool_result (nguyen van, lan goi CUOI) ---');
    const statusTextsPrint = meta.boot?.statusTexts ?? [];
    console.log(statusTextsPrint.length === 0 ? '(khong co)' : statusTextsPrint[statusTextsPrint.length - 1]);
    console.log('--- het text status ---');
    console.log('--- guard tu choi source erp tren ban CAI (nguyen van) ---');
    console.log(meta.guard?.message === undefined || meta.guard?.message === '' ? '(khong co message)' : meta.guard.message);
    console.log('--- het guard message (exit=' + (meta.guard?.exitCode ?? 'n/a') + ', threw=' + (meta.guard?.threw === true) + ') ---');
    console.log('boot: exit=' + (meta.boot?.status ?? '?') + ' session=' + (meta.boot?.sessionId || '(không thấy)') + ' calls=' + (meta.boot?.calls ?? []).map((call) => call.tool).join(','));
    console.log('shipped types: ' + JSON.stringify(meta.shippedTypes ?? {}));
    console.log('duong dan tuyet doi: ' + ((meta.absPaths?.hits ?? []).length === 0 ? '0 hit' : (meta.absPaths.hits ?? []).join(' | ')));
    console.log('artifact tren dia: ' + JSON.stringify(meta.artifactRecheck ?? meta.artifact ?? {}));
    console.log('bang dong bang: ' + ((meta.driftBefore?.files ?? []).map((row) => row.file + '=' + row.sha256.slice(0, 16)).join(' ') || '(khong do)'));
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
    console.log(failed === 0
        ? 'PASS - pack vong 15 sau t102+t103: ban CAI tu choi source erp dung nguyen van (BUG-026 write half), status text co dong Team id/phase, probe export co exit-code that + SELF_MUTATION bat duoc, drift=0 tren 12 tep o 3 moc, 2 lan pack cung sha256, 3 chieu khop nguon, ban cai chay duoc 3 tool moi.'
        : 'FAIL - xem cac dong FAIL o tren.');
    process.exitCode = failed === 0 ? 0 : 1;
}

await main();
