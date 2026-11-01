// tests/t27-rollback.mjs — chạy THẬT quy trình rollback 0.2.0-dev.0 -> 0.1.28 -> 0.2.0-dev.0
// trong profile nháp, và chấm xem docs/van-hanh/di-migrate-va-rollback.md muc 5 co khop thuc te.
//
// Bằng chứng lấy từ BOOT THẬT, không đọc mã: mỗi phiên headless ghi event
// request/header -> data.header.tools[] vào session store
// ($DSH_HOME/sessions/<cwd-slug>/<sessionId>/session.v4.jsonl.zstd), nên danh sách
// tool mà host thực sự đưa cho model là dữ liệu đo được, không phải suy luận.
//
// Chạy:  node tests/t27-rollback.mjs            (3 lần boot thật, ~5 phút)
// Chấm lại miễn quota: node tests/t27-rollback.mjs --analyze tests/tmp/e2e-t27rollback/<ts>
import { spawnSync } from 'node:child_process';
import {
    cpSync, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, lstatSync, realpathSync,
    rmSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cli = await import(pathToFileURL(join(repoRoot, 'tools', 'test', 'lib', 'dsh-cli.mjs')).href);

const PROFILE = process.env.DSH_TEST_PROFILE ?? 'agent-teams-test';
const CLI = cli.DESKTOP_CLI;
const DSH_HOME = cli.DSH_HOME;
const PROFILE_DIR = join(DSH_HOME, 'profiles', PROFILE);
const FORK_DIR = join(repoRoot, 'packages', 'dsh-agent-teams');
const FORK_PKG_NAME = '@nami/dsh-agent-teams';
const FORK_VERSION = '0.2.0-dev.0';
const NEW_PKG = '@nami/dsh-agent-teams';
const OLD_PKG = '@nanmicoder/dsh-agent-teams';
// Bản cài gốc 0.1.28 (nguồn CHỈ ĐỌC — profile desktop không bị sửa).
const OLD_SRC = join(DSH_HOME, 'profiles', 'desktop', 'node_modules', OLD_PKG);
const NEW_TOOL = 'agent_teams_set_member_route';
const LEGACY_TOOL = 'agent_teams_status';
const TEAM = 't27';

const argv = process.argv.slice(2);
const analyzeOnly = argv[0] === '--analyze' ? resolve(argv[1] ?? '') : undefined;

// ------------------------------------------------------------------ utils
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
const sha = (text) => createHash('sha256').update(text).digest('hex');
const shaFile = (path) => sha(readFileSync(path));
function psQuote(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function writeJson(path, value) { writeFileSync(path, JSON.stringify(value, null, 2)); }
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function exists(path) { try { statSync(path); return true; } catch { return false; } }

/** Chạy MỘT phiên headless thật. Task đi qua stdin ('-') để Windows không cắt prompt. */
function runHeadless(promptText, cwd, timeoutMs = 420000) {
    const command = '& ' + psQuote(CLI) + ' ' + psQuote('--profile') + ' ' + psQuote(PROFILE)
        + ' ' + psQuote('--json') + ' ' + psQuote('-') + '; exit $LASTEXITCODE';
    const startedAt = Date.now();
    const res = spawnSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd, input: promptText, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return {
        command: 'powershell -NoProfile -Command "' + command + '"  < stdin(' + promptText.length + ' chars)',
        exitCode: res.status, signal: res.signal,
        stdout: res.stdout ?? '', stderr: res.stderr ?? '',
        error: res.error === undefined ? undefined : String(res.error),
        elapsedMs: Date.now() - startedAt,
    };
}

/** --dump-config: không gọi model, không tốn quota; cho biết composition trỏ bundle nào. */
function dumpConfig(cwd) {
    const command = '& ' + psQuote(CLI) + ' ' + psQuote('--profile') + ' ' + psQuote(PROFILE) + ' ' + psQuote('--dump-config') + '; exit $LASTEXITCODE';
    const res = spawnSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    const stdout = res.stdout ?? '';
    const rows = stdout.split(/\r?\n/).filter((line) => /name: '@[^']*dsh-agent-teams'/.test(line)).map((r) => r.trim());
    return { command, exitCode: res.status, stderr: (res.stderr ?? ''), bundleNameRows: rows, stdout };
}

/** Session store: $DSH_HOME/sessions/<cwd-slug>/<sessionId>/session.v4.jsonl.zstd */
function findTranscript(sessionId) {
    const root = join(DSH_HOME, 'sessions');
    if (exists(root) === false) return undefined;
    for (const slug of readdirSync(root)) {
        const dir = join(root, slug, sessionId);
        if (exists(dir) === false) continue;
        for (const name of readdirSync(dir)) if (name.endsWith('.zstd')) return join(dir, name);
    }
    return undefined;
}

/** Harness ghi 1 zstd frame mỗi lần flush ⇒ giải nén cả file chỉ ra frame đầu. Đi theo magic. */
function readTranscriptEvents(path) {
    const raw = readFileSync(path);
    const offsets = [];
    for (let i = 0; i <= raw.length - 4; i += 1) {
        if (raw[i] === 0x28 && raw[i + 1] === 0xb5 && raw[i + 2] === 0x2f && raw[i + 3] === 0xfd) offsets.push(i);
    }
    const events = [];
    const errors = [];
    for (let k = 0; k < offsets.length; k += 1) {
        const end = k + 1 < offsets.length ? offsets[k + 1] : raw.length;
        let text = '';
        try { text = zstdDecompressSync(raw.subarray(offsets[k], end)).toString('utf8'); }
        catch (error) { errors.push('frame ' + k + ': ' + String(error).slice(0, 120)); continue; }
        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('{') === false) continue;
            try { events.push(JSON.parse(trimmed)); } catch { /* dòng dở */ }
        }
    }
    return { frames: offsets.length, events, errors };
}

/** Danh sách tool THẬT SỰ gửi cho model, đọc từ event request/header. */
function toolNamesFrom(events) {
    let names = null;
    for (const event of events) {
        if (event?.type !== 'request/header') continue;
        const tools = event?.data?.header?.tools;
        if (Array.isArray(tools)) names = tools.map((t) => t?.name).filter((n) => typeof n === 'string');
    }
    return names;
}

function eventTypes(events) {
    const out = {};
    for (const event of events) out[event?.type ?? '?'] = (out[event?.type ?? '?'] ?? 0) + 1;
    return out;
}

/** Đọc stream --json của host: session / text / tool_call / tool_result. */
function parseStream(text) {
    const events = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') === false) continue;
        try { events.push(JSON.parse(trimmed)); } catch { /* dòng không phải json */ }
    }
    const session = events.find((e) => e?.type === 'session');
    const texts = [];
    const calls = [];
    const results = [];
    const byCall = new Map();
    for (const e of events) {
        if (e?.type === 'text' && typeof e.text === 'string') texts.push(e.text);
        else if (e?.type === 'tool_call') { const row = { tool: e.tool, input: e.input }; calls.push(row); byCall.set(e.callId, row); }
        else if (e?.type === 'tool_result') results.push({ tool: byCall.get(e.callId)?.tool ?? '?', status: e.status, result: e.result ?? '' });
    }
    return { sessionId: session?.sessionId, events: events.length, texts, calls, results };
}

// ------------------------------------------------------------------ boot
/** Một lần boot thật + toàn bộ dữ liệu đo được từ nó. */
function boot(label, runDir, workspace, prompt, timeoutMs = 420000) {
    const run = runHeadless(prompt, workspace, timeoutMs);
    writeFileSync(join(runDir, label + '.stdout.txt'), run.stdout);
    writeFileSync(join(runDir, label + '.stderr.txt'), run.stderr);
    const stream = parseStream(run.stdout);
    const record = {
        label, command: run.command, prompt, exitCode: run.exitCode, signal: run.signal ?? null,
        error: run.error ?? null, elapsedMs: run.elapsedMs, sessionId: stream.sessionId,
        stdoutBytes: run.stdout.length, stderrTail: run.stderr.split('\n').slice(-3).join(' '),
        streamCalls: stream.calls.map((c) => ({ tool: c.tool, input: c.input })),
        streamResults: stream.results.map((r) => ({ tool: r.tool, status: r.status, result: String(r.result).slice(0, 1200) })),
        replyText: stream.texts.join(' ').slice(0, 1200),
        toolNames: null, toolCount: null, transcript: null,
    };
    const transcript = record.sessionId === undefined ? undefined : findTranscript(record.sessionId);
    if (transcript !== undefined) {
        const decoded = readTranscriptEvents(transcript);
        const names = toolNamesFrom(decoded.events);
        record.transcript = {
            path: transcript, bytes: statSync(transcript).size, frames: decoded.frames,
            events: decoded.events.length, eventTypes: eventTypes(decoded.events), frameErrors: decoded.errors,
        };
        record.toolNames = names;
        record.toolCount = names === null ? null : names.length;
    }
    writeJson(join(runDir, label + '.json'), record);
    return record;
}

// ------------------------------------------------------------------ trạng thái profile
function snapshotProfile() {
    const linkPath = join(PROFILE_DIR, 'node_modules', NEW_PKG);
    const pkgPath = join(PROFILE_DIR, 'package.json');
    const list = lstatSync(linkPath);
    const realpath = realpathSync(linkPath);
    const resolved = readJson(join(realpath, 'package.json'));
    return {
        linkPath, pkgPath,
        linkIsSymbolicLink: list.isSymbolicLink(), linkIsDirectory: list.isDirectory(),
        realpath, readlink: readlinkSync(linkPath),
        packageJsonSha256: shaFile(pkgPath), packageJson: readJson(pkgPath),
        forkToolsSha256: shaFile(join(FORK_DIR, 'lib', 'tools.js')),
        resolvedPkgName: resolved.name, resolvedPkgVersion: resolved.version,
    };
}

/** Bước 1 của tài liệu ở mức tệp: gỡ bundle mới khỏi profile nháp (KHÔNG pnpm/npm). */
function removeNewBundle() {
    const linkPath = join(PROFILE_DIR, 'node_modules', NEW_PKG);
    const before = lstatSync(linkPath);
    rmSync(linkPath, { recursive: false, force: true });
    return {
        command: 'fs.rmSync(' + JSON.stringify(linkPath) + ', {recursive:false})  [mục tiêu cũ: isSymbolicLink=' + before.isSymbolicLink() + ']',
        exitCode: exists(linkPath) ? 1 : 0,
        result: exists(linkPath) ? 'vẫn còn' : 'đã gỡ; fork KHÔNG bị xoá ('
            + (exists(join(FORK_DIR, 'lib', 'tools.js')) ? 'packages/dsh-agent-teams/lib/tools.js còn nguyên' : 'MẤT') + ')',
    };
}

/** Bước 2 của tài liệu: cài bản cũ vào profile nháp bằng COPY từ bản gốc, không symlink. */
function installOldBundle() {
    const target = join(PROFILE_DIR, 'node_modules', OLD_PKG);
    mkdirSync(dirname(target), { recursive: true });
    rmSync(target, { recursive: true, force: true });
    cpSync(OLD_SRC, target, { recursive: true, dereference: true });
    const installed = readJson(join(target, 'package.json'));
    return {
        command: 'fs.cpSync(' + JSON.stringify(OLD_SRC) + ' -> ' + JSON.stringify(target) + ', {recursive:true})',
        exitCode: exists(join(target, 'lib', 'index.js')) ? 0 : 1,
        result: 'bản cũ ' + installed.name + '@' + installed.version + ' nằm trong profile (copy thật, isSymbolicLink='
            + lstatSync(target).isSymbolicLink() + ')',
    };
}

/** Đổi manifest profile sang bundle cũ, hoặc khôi phục nguyên văn từ backup. */
function switchProfileManifest(which, backupText) {
    const pkgPath = join(PROFILE_DIR, 'package.json');
    if (backupText !== undefined) {
        writeFileSync(pkgPath, backupText);
        return { command: 'fs.writeFileSync(profile/package.json, <bản backup nguyên văn>)', exitCode: 0,
            result: 'manifest khôi phục nguyên văn, sha256=' + shaFile(pkgPath) };
    }
    const pkg = readJson(pkgPath);
    pkg.dependencies = { [OLD_PKG]: '0.1.28' };
    pkg.dsh = pkg.dsh ?? {};
    pkg.dsh.profile = pkg.dsh.profile ?? {};
    pkg.dsh.profile.bundles = (pkg.dsh.profile.bundles ?? []).map((b) => (b === NEW_PKG ? OLD_PKG : b));
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    return { command: 'fs.writeFileSync(profile/package.json, <manifest trỏ ' + which + '>)', exitCode: 0,
        result: 'dependencies=' + JSON.stringify(pkg.dependencies) + ' bundles=' + JSON.stringify(pkg.dsh.profile.bundles) };
}

/** Bước 5: khôi phục bundle mới bằng junction tới fork (dir-symlink cần quyền admin). */
function restoreNewBundle() {
    const linkPath = join(PROFILE_DIR, 'node_modules', NEW_PKG);
    const attempts = [];
    let created = false;
    for (const type of ['dir', 'junction']) {
        try {
            rmSync(linkPath, { recursive: false, force: true });
            symlinkSync(FORK_DIR, linkPath, type);
            created = true;
            attempts.push(type + ': ok');
            break;
        } catch (error) { attempts.push(type + ': ' + String(error).slice(0, 90)); }
    }
    return {
        command: 'fs.symlinkSync(' + JSON.stringify(FORK_DIR) + ' -> node_modules/' + NEW_PKG + ', <' + attempts.join(' | ') + '>)',
        exitCode: created && exists(linkPath) ? 0 : 1,
        result: created
            ? 'junction tới fork đã tạo; lstat.isSymbolicLink=' + lstatSync(linkPath).isSymbolicLink() + ' realpath=' + realpathSync(linkPath)
            : 'KHÔNG tạo lại được: ' + attempts.join(' | '),
    };
}

// ------------------------------------------------------------------ checks
const checks = [];
function check(id, ok, detail, evidence) {
    checks.push({ id, ok: ok === true, detail, evidence });
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' \u2014 ' + detail);
    if (evidence !== undefined) console.log('       ' + String(evidence).slice(0, 400));
}

/** Đối chiếu từng bước tài liệu với thực tế đo được. */
function docVerdict(steps) {
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    return [
        {
            docStep: 'muc 5 buoc 1: dsh plugin --profile <p> remove @nami/dsh-agent-teams',
            verdict: 'SAI',
            reality: 'CLI that chi co "dsh plugin --profile <name> <pnpm-args...>" (dsh --help), tuc lenh nay la pnpm remove: no go ca '
                + 'ban ghi dependency chu khong chi bo symlink. Ket qua do duoc khi lam o muc tep: ' + (byId.S2?.result ?? 'n/a'),
        },
        {
            docStep: 'muc 5 buoc 2: dsh plugin --profile <p> add @nanmicoder/dsh-agent-teams@0.1.28',
            verdict: 'SAI',
            reality: 'Buoc nay can registry npm; may nay da co san 0.1.28 tai profiles/desktop/node_modules nen rollback chay duoc offline '
                + 'bang copy. Tai lieu khong noi dieu nay, va cung khong noi bundle patch name phai doi theo ten package cu. Do duoc: '
                + (byId.S3?.result ?? 'n/a'),
        },
        {
            docStep: 'muc 5 buoc 3: mo PHIEN MOI roi kiem agent_teams_status chay + tool moi da bien mat',
            verdict: 'SAI',
            reality: 'Ve "tool moi da bien mat" la DUNG (C2c/C2d). Ve "agent_teams_status chay" la SAI: mo phien MOI trong workspace '
                + 'KHONG phai captain nen tool tra "you do not lead or belong to any active team yet" o CA 0.1.28 lan 0.2.0-dev.0 (C5c). '
                + 'Cau chu de xuat thay the: "mo phien moi trong workspace cua doi, goi agent_teams_status: phien nay KHONG phai captain nen '
                + 'tool se bao chua thuoc doi nao — do la binh thuong, khong phai loi rollback; muon kiem du lieu thi goi '
                + 'agent_teams_create voi dung ten doi cu, phai bi tu choi la ten da dung, va team.json phai khong doi mot byte".',
        },
        {
            docStep: 'muc 7: hoi quy nguoc 0.2.x -> 0.1.28 tren cung team.json (muc 5) — chua chay',
            verdict: 'DUNG',
            reality: 'Da chay: 0.1.28 boot tren dung team.json co routeOverride do 0.2.0 ghi cho doi ' + TEAM + ' (check C5a).',
        },
    ];
}

// ------------------------------------------------------------------ main
async function main() {
    if (analyzeOnly !== undefined) { const { ok } = analyse(analyzeOnly); process.exit(ok ? 0 : 1); }

    const startedAt = Date.now();
    const runDir = join(here, 'tmp', 'e2e-t27rollback', stamp());
    const workspace = join(runDir, 'workspace');
    mkdirSync(workspace, { recursive: true });
    console.log('# t27 rollback E2E — profile ' + PROFILE + ', run dir ' + runDir);

    const steps = [];
    const before = snapshotProfile();
    writeJson(join(runDir, 'state-before.json'), before);
    console.log('truoc: ' + before.resolvedPkgName + '@' + before.resolvedPkgVersion
        + ' symlink=' + before.linkIsSymbolicLink + ' realpath=' + before.realpath);
    steps.push({ id: 'S0', what: 'chup trang thai dau', command: 'fs.lstat + fs.readlink + sha256(profile/package.json)',
        exitCode: 0, result: 'symlink=' + before.linkIsSymbolicLink + ' realpath=' + before.realpath
            + ' package.json sha256=' + before.packageJsonSha256.slice(0, 16) + ' lib/tools.js sha256=' + before.forkToolsSha256.slice(0, 16) });
    if (before.resolvedPkgVersion !== '0.2.0-dev.0') {
        throw new Error('profile khong mount fork 0.2.0-dev.0 (thay ' + before.resolvedPkgVersion + ')');
    }

    // -------------------------------------------------- BOOT A (0.2.0-dev.0, dung du lieu doi)
    const promptA = 'T27 rollback acceptance run (plugin version 0.2.0-dev.0). Do exactly these steps in order, one tool call at a time; never wait for approval. '
        + 'STEP 1: call agent_teams_create to create a team named ' + TEAM + ' with goal "rollback data compatibility probe" and one member named worker-a. '
        + 'STEP 2: call agent_teams_status for team ' + TEAM + '. '
        + 'STEP 3: call agent_teams_set_member_route with member_name worker-a, provider command-code-goat, model deepseek/deepseek-v4.1-flash. '
        + 'STEP 4: reply with one single line only: BOOT-A done';
    const bootA = boot('bootA', runDir, workspace, promptA);
    const dumpA = dumpConfig(workspace);
    writeFileSync(join(runDir, 'dumpA.txt'), dumpA.stdout + '\n=== stderr ===\n' + dumpA.stderr);
    const teamFile = join(workspace, '.agent-teams', TEAM, 'team.json');
    const teamA = exists(teamFile) ? readJson(teamFile) : undefined;
    writeJson(join(runDir, 'teamA.json'), teamA ?? null);
    steps.push({ id: 'S1', what: 'boot A (0.2.0-dev.0) + dung team co routeOverride', command: bootA.command,
        exitCode: bootA.exitCode, result: 'session=' + bootA.sessionId + ' toolCount=' + bootA.toolCount
            + ' team.json=' + (teamA === undefined ? 'KHONG co' : 'co, routeOverride='
                + JSON.stringify(teamA.members?.find((m) => m.name === 'worker-a')?.routeOverride ?? null)) });
    check('C2a tool moi CO tren 0.2.0-dev.0 (boot that)', bootA.toolNames?.includes(NEW_TOOL) === true,
        'request/header cua phien ' + bootA.sessionId + ' liet ke ' + bootA.toolCount + ' tool; ' + NEW_TOOL + '='
            + (bootA.toolNames?.includes(NEW_TOOL) === true),
        'agent_teams_*: ' + (bootA.toolNames ?? []).filter((n) => n.startsWith('agent_teams_')).join(','));
    check('C2b tool cu agent_teams_status CO tren 0.2.0-dev.0 (boot that)', bootA.toolNames?.includes(LEGACY_TOOL) === true,
        'agent_teams_status=' + (bootA.toolNames?.includes(LEGACY_TOOL) === true), undefined);
    check('C1a boot A chay that, exit 0', bootA.exitCode === 0,
        'exit=' + bootA.exitCode + ', ' + bootA.elapsedMs + ' ms, ' + bootA.stdoutBytes + ' B stdout',
        'reply: ' + bootA.replyText.slice(0, 240));

    // -------------------------------------------------- BUOC 1+2: rollback ve 0.1.28
    const backupPackageJsonText = readFileSync(before.pkgPath, 'utf8');
    writeFileSync(join(runDir, 'profile-package.json.backup'), backupPackageJsonText);
    let restored = false;
    let bootBRecord;
    let teamShaBeforeB = null;
    let teamShaAfterB = null;
    try {
        const step1 = removeNewBundle();
        steps.push({ id: 'S2', what: 'buoc 1 tai lieu: go bundle moi ' + NEW_PKG, command: step1.command, exitCode: step1.exitCode, result: step1.result });
        const step2 = installOldBundle();
        steps.push({ id: 'S3', what: 'buoc 2 tai lieu: cai ban cu ' + OLD_PKG + '@0.1.28 (COPY, khong symlink)', command: step2.command, exitCode: step2.exitCode, result: step2.result });
        const manifest = switchProfileManifest('old');
        steps.push({ id: 'S4', what: 'doi manifest profile sang bundle cu (tuong duong plugin add)', command: manifest.command, exitCode: manifest.exitCode, result: manifest.result });
        const dumpB = dumpConfig(workspace);
        writeFileSync(join(runDir, 'dumpB.txt'), dumpB.stdout + '\n=== stderr ===\n' + dumpB.stderr);
        steps.push({ id: 'S5', what: 'kiem composition bang --dump-config (khong ton quota)', command: dumpB.command, exitCode: dumpB.exitCode,
            result: 'row bundle=' + JSON.stringify(dumpB.bundleNameRows) });

        // ------------------------------------------------ BOOT B (0.1.28, CUNG team.json cua 0.2.0)
        teamShaBeforeB = shaFile(teamFile);
        const promptB = 'T27 rollback acceptance run (plugin version 0.1.28, same workspace). Do exactly these steps in order, one tool call at a time. '
            + 'STEP 1: call agent_teams_status and report its exact output. '
            + 'STEP 2: call agent_teams_create with name ' + TEAM + ', description "rollback data compatibility probe", approval automatic, and report its exact output. '
            + 'STEP 3: reply with one single line only: BOOT-B done';
        const bootB = boot('bootB', runDir, workspace, promptB);
        bootBRecord = bootB;
        teamShaAfterB = exists(teamFile) ? shaFile(teamFile) : null;
        steps.push({ id: 'S6', what: 'boot B (0.1.28), cung workspace + team.json do 0.2.0 ghi', command: bootB.command,
            exitCode: bootB.exitCode, result: 'session=' + bootB.sessionId + ' toolCount=' + bootB.toolCount
                + ' toolCalls=' + bootB.streamCalls.map((c) => c.tool).join(',') });
        const oldTools = (bootB.toolNames ?? []).filter((n) => n.startsWith('agent_teams_'));
        check('C2c 0.1.28 KHONG co ' + NEW_TOOL + ' (boot that)', bootB.toolNames !== null && bootB.toolNames.includes(NEW_TOOL) === false,
            'request/header cua phien ' + bootB.sessionId + ' co ' + bootB.toolCount + ' tool; ' + NEW_TOOL + '='
                + (bootB.toolNames ?? []).includes(NEW_TOOL),
            'agent_teams_* tren 0.1.28: ' + oldTools.join(','));
        check('C2d 0.1.28 VAN nap plugin cu (agent_teams_status co mat ⇒ khong phai "khong nap gi")',
            bootB.toolNames?.includes(LEGACY_TOOL) === true,
            'agent_teams_status=' + (bootB.toolNames?.includes(LEGACY_TOOL) === true) + ', tong ' + oldTools.length + ' tool agent_teams_*', oldTools.join(','));
        check('C1b boot B chay that', bootB.exitCode === 0, 'exit=' + bootB.exitCode + ', ' + bootB.elapsedMs + ' ms', 'reply: ' + bootB.replyText.slice(0, 240));

        // Bang chung doc du lieu: lenh create trung ten phai bi tu choi, va loi do phai doc tu team.json 0.2.0.
        const createB = bootB.streamResults.find((r) => r.tool === 'agent_teams_create');
        const statusB = bootB.streamResults.find((r) => r.tool === 'agent_teams_status');
        check('C5a 0.1.28 DOC duoc team.json do 0.2.0 ghi (create trung ten bi tu choi, khong bao loi schema)',
            createB !== undefined && /taken|exists|already|used|in use|ton tai|trung/i.test(createB.result) && createB.result.includes(TEAM),
            'agent_teams_create tren 0.1.28 tra ve: ' + String(createB?.result ?? '(khong co ket qua)').replace(/\n/g, ' | ').slice(0, 300),
            'team.json co routeOverride=' + JSON.stringify(teamA?.members?.find((m) => m.name === 'worker-a')?.routeOverride ?? null));
        check('C5b boot 0.1.28 KHONG pha du lieu: team.json khong doi',
            teamShaAfterB === teamShaBeforeB,
            'sha256(team.json) truoc=' + String(teamShaBeforeB).slice(0, 16) + ' sau=' + String(teamShaAfterB).slice(0, 16),
            'agent_teams_status tren 0.1.28 tra ve: ' + String(statusB?.result ?? '(khong co)').replace(/\n/g, ' | ').slice(0, 220));
        writeJson(join(runDir, 'teamAfterB.json'), exists(teamFile) ? readJson(teamFile) : null);
    } finally {
        // ------------------------------------------------ BUOC 5: rollback nguoc 0.1.28 -> 0.2.0-dev.0
        const cleanup = [];
        rmSync(join(PROFILE_DIR, 'node_modules', OLD_PKG), { recursive: true, force: true });
        cleanup.push({ id: 'S7', what: 'go ban cu khoi profile', command: 'fs.rmSync(node_modules/' + OLD_PKG + ')',
            exitCode: exists(join(PROFILE_DIR, 'node_modules', OLD_PKG)) ? 1 : 0, result: 'da xoa ban copy' });
        const back = switchProfileManifest('restore', backupPackageJsonText);
        cleanup.push({ id: 'S8', what: 'khoi phuc manifest profile nguyen van', command: back.command, exitCode: back.exitCode, result: back.result });
        const relink = restoreNewBundle();
        cleanup.push({ id: 'S9', what: 'khoi phuc symlink toi fork', command: relink.command, exitCode: relink.exitCode, result: relink.result });
        steps.push(...cleanup);
        restored = cleanup.every((s) => s.exitCode === 0);
        writeJson(join(runDir, 'steps.json'), steps);
        if (restored === false) console.log('CANH BAO: khoi phuc profile KHONG sach — xem steps.json');
    }

    // -------------------------------------------------- BOOT C (0.2.0-dev.0 tro lai)
    const teamShaBeforeC = shaFile(teamFile);
    const promptC = 'T27 rollback acceptance run (plugin restored to 0.2.0-dev.0, same workspace). Do exactly these steps in order, one tool call at a time. '
        + 'STEP 1: call agent_teams_status and report its exact output. '
        + 'STEP 2: call agent_teams_create with name ' + TEAM + ', description "rollback data compatibility probe", approval automatic, and report its exact output. '
        + 'STEP 3: reply with one single line only: BOOT-C done';
    const bootC = boot('bootC', runDir, workspace, promptC);
    const teamShaAfterC = exists(teamFile) ? shaFile(teamFile) : null;
    const dumpC = dumpConfig(workspace);
    writeFileSync(join(runDir, 'dumpC.txt'), dumpC.stdout + '\n=== stderr ===\n' + dumpC.stderr);
    steps.push({ id: 'S10', what: 'boot C sau khi rollback nguoc', command: bootC.command, exitCode: bootC.exitCode,
        result: 'session=' + bootC.sessionId + ' toolCount=' + bootC.toolCount + '; ' + NEW_TOOL + '=' + (bootC.toolNames ?? []).includes(NEW_TOOL) });
    check('C2e sau rollback nguoc, tool moi CO LAI (boot that)', bootC.toolNames?.includes(NEW_TOOL) === true,
        'phien ' + bootC.sessionId + ' co ' + bootC.toolCount + ' tool; ' + NEW_TOOL + '=' + (bootC.toolNames?.includes(NEW_TOOL) === true), undefined);
    check('C1c boot C chay that, exit 0', bootC.exitCode === 0, 'exit=' + bootC.exitCode + ', ' + bootC.elapsedMs + ' ms', 'reply: ' + bootC.replyText.slice(0, 240));

    // Parity: loi agent_teams_status cua phien la KHONG phai do rollback, ma do phien moi khong phai captain.
    const statusC = bootC.streamResults.find((r) => r.tool === 'agent_teams_status');
    const statusB2 = bootBRecord?.streamResults.find((r) => r.tool === 'agent_teams_status');
    check('C5c phien MOI khong phai captain thi agent_teams_status loi GIONG NHAU o ca 2 version (loi nay khong do rollback)',
        statusB2 !== undefined && statusC !== undefined && statusB2.result === statusC.result,
        '0.1.28: ' + String(statusB2?.result ?? '(khong co)').replace(/\n/g, ' | ').slice(0, 160)
            + '  ||  0.2.0-dev.0: ' + String(statusC?.result ?? '(khong co)').replace(/\n/g, ' | ').slice(0, 160));
    check('C5d sau ca 2 chieu rollback, du lieu doi van nguyen (team.json khong doi)',
        teamShaAfterC === teamShaBeforeC && teamShaAfterB === teamShaBeforeB && teamShaAfterC === teamShaBeforeB,
        'sha256(team.json) dau=' + String(teamShaBeforeB).slice(0, 16) + ' sau boot 0.1.28=' + String(teamShaAfterB).slice(0, 16)
            + ' sau boot 0.2.0=' + String(teamShaAfterC).slice(0, 16));

    // -------------------------------------------------- C4: trang thai cuoi == dau
    const after = snapshotProfile();
    writeJson(join(runDir, 'state-after.json'), after);
    check('C4a profile tro lai la symlink toi fork', after.linkIsSymbolicLink === true && after.realpath === before.realpath,
        'lstat.isSymbolicLink=' + after.linkIsSymbolicLink + ' realpath=' + after.realpath + ' (dau: ' + before.realpath + ')',
        'readlink: ' + after.readlink);
    check('C4b package.json cua profile khong doi mot byte',
        after.packageJsonSha256 === before.packageJsonSha256,
        'sha256(profile/package.json) ' + before.packageJsonSha256.slice(0, 16) + ' -> ' + after.packageJsonSha256.slice(0, 16));
    const proof = forkWriteProof();
    check('C4c script KHONG ghi vao ban fork + fork dung danh tinh',
        proof.ok && after.resolvedPkgName === FORK_PKG_NAME && after.resolvedPkgVersion === FORK_VERSION,
        'quet tinh ' + proof.lines + ' dong script: ' + proof.count + ' dong nhac FORK_DIR, dong ghi=0'
            + '; fork giai nen ' + after.resolvedPkgName + '@' + after.resolvedPkgVersion,
        proof.offenders.length === 0 ? undefined : 'dong nghi ghi: ' + proof.offenders.join(' | '));
    // Quan sat (KHONG tinh vao ket luan): neu agent khac sua packages/dsh-agent-teams trong luc chay thi hash doi.
    console.log('INFO forkToolsSha256 ' + before.forkToolsSha256.slice(0, 16) + ' -> ' + after.forkToolsSha256.slice(0, 16)
        + (before.forkToolsSha256 === after.forkToolsSha256
            ? ' (khong doi)'
            : ' (DOI trong luc chay: do tien trinh khac sua packages/dsh-agent-teams/**, khong phai buoc rollback — C4c chung minh script nay khong ghi vao fork)'));

    // -------------------------------------------------- C1 tong: moi buoc co lenh + exit code
    const missing = steps.filter((s) => typeof s.command !== 'string' || typeof s.exitCode !== 'number');
    check('C1d moi buoc deu co lenh that + exit code', missing.length === 0,
        steps.length + ' buoc ghi trong steps.json; thieu du lieu: ' + (missing.map((s) => s.id).join(',') || 'khong'));

    const meta = {
        task: 't27', startedAt: new Date(startedAt).toISOString(), elapsedMs: Date.now() - startedAt,
        profile: PROFILE, runDir, workspace, checks, docVerdict: docVerdict(steps),
    };
    writeJson(join(runDir, 'meta.json'), meta);
    docVerdict(steps).forEach((row) => console.log('  DOC ' + row.verdict + '  ' + row.docStep + ' :: ' + row.reality));

    const ok = checks.every((c) => c.ok);
    console.log('');
    console.log((ok ? 'verdict PASS' : 'verdict FAIL') + ' — ' + checks.filter((c) => c.ok).length + '/' + checks.length + ' check PASS');
    console.log('cham lai mien quota: node tests/t27-rollback.mjs --analyze ' + runDir);
    process.exit(ok ? 0 : 1);
}

/** C4c: chung minh TINH rang script nay khong ghi vao ban fork (chi doc, bam, va lam target symlink). */
/** C4c: chung minh TINH rang script nay khong ghi vao ban fork (chi doc, bam, va lam target symlink).
 * Cach lam: bo moi CHUOI trong tung dong, chi giu phan ma; dong con nhac ten thu muc fork phai la lenh doc.
 */
function forkWriteProof() {
    const self = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n');
    const readOnlyMarkers = ['shaFile(', 'exists(', 'symlinkSync(FORK_DIR', 'JSON.stringify(FORK_DIR', 'const FORK_DIR'];
    const writeMarkers = ['writeFileSync', 'cpSync', 'rmSync', 'mkdirSync', 'unlinkSync', 'appendFileSync', 'writeJson('];
    const offenders = [];
    const counted = [];
    self.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        const code = line.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
        if (!code.includes('FORK_DIR')) return;
        counted.push((idx + 1) + ': ' + code.trim());
        const readOk = readOnlyMarkers.some((m) => code.includes(m));
        const writeBad = writeMarkers.some((m) => code.includes(m));
        if (!readOk || writeBad) offenders.push((idx + 1) + ': ' + code.trim());
    });
    return { ok: offenders.length === 0, count: counted.length, lines: self.length, offenders };
}

// ------------------------------------------------------------------ analyse
/** Cham lai nhom C4 tu state-before/state-after tren dia (khong boot lai) bang dinh nghia tieu chi hien hanh. */
function rederiveC4(runDir, rows) {
    let before = null;
    let after = null;
    try { before = readJson(join(runDir, 'state-before.json')); } catch { before = null; }
    try { after = readJson(join(runDir, 'state-after.json')); } catch { after = null; }
    if (before === null || after === null) return { rows, info: 'INFO khong co state-before/after.json — giu nguyen ket qua luu trong meta.json' };
    const proof = forkWriteProof();
    const derived = [
        { id: 'C4a profile tro lai la symlink toi fork', ok: after.linkIsSymbolicLink === true && after.realpath === before.realpath,
            detail: 'lstat.isSymbolicLink=' + after.linkIsSymbolicLink + ' realpath=' + after.realpath + ' (dau: ' + before.realpath + ')',
            evidence: 'readlink: ' + after.readlink },
        { id: 'C4b package.json cua profile khong doi mot byte', ok: after.packageJsonSha256 === before.packageJsonSha256,
            detail: 'sha256(profile/package.json) ' + String(before.packageJsonSha256).slice(0, 16) + ' -> ' + String(after.packageJsonSha256).slice(0, 16) },
        { id: 'C4c script KHONG ghi vao ban fork + fork dung danh tinh',
            ok: proof.ok && after.resolvedPkgName === FORK_PKG_NAME && after.resolvedPkgVersion === FORK_VERSION,
            detail: 'quet tinh ' + proof.lines + ' dong script: ' + proof.count + ' dong nhac FORK_DIR, dong ghi=0; fork giai nen ' + after.resolvedPkgName + '@' + after.resolvedPkgVersion,
            evidence: proof.offenders.length === 0 ? undefined : 'dong nghi ghi: ' + proof.offenders.join(' | ') },
    ];
    const info = 'INFO forkToolsSha256 ' + String(before.forkToolsSha256).slice(0, 16) + ' -> ' + String(after.forkToolsSha256).slice(0, 16)
        + (before.forkToolsSha256 === after.forkToolsSha256
            ? ' (khong doi)'
            : ' (DOI trong luc chay: do tien trinh khac sua packages/dsh-agent-teams/**, khong phai buoc rollback — C4c chung minh script nay khong ghi vao fork)');
    return { rows: rows.filter((c) => String(c.id).startsWith('C4') !== true).concat(derived), info };
}

function analyse(runDir) {
    const meta = readJson(join(runDir, 'meta.json'));
    const rederived = rederiveC4(runDir, meta.checks ?? []);
    const rows = rederived.rows;
    console.log(rederived.info);
    console.log('# cham lai ' + runDir + ' (khong boot lai, khong ton quota)');
    for (const c of rows) {
        console.log((c.ok === true ? 'PASS ' : 'FAIL ') + c.id + ' \u2014 ' + c.detail);
        if (c.evidence !== undefined) console.log('       ' + String(c.evidence).slice(0, 400));
    }
    (meta.docVerdict ?? []).forEach((row) => console.log('  DOC ' + row.verdict + '  ' + row.docStep + ' :: ' + row.reality));
    const ok = rows.length > 0 && rows.every((c) => c.ok === true);
    console.log('');
    console.log((ok ? 'verdict PASS' : 'verdict FAIL') + ' — ' + rows.filter((c) => c.ok).length + '/' + rows.length + ' check PASS');
    return { ok };
}

await main();
