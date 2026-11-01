#!/usr/bin/env node
/**
 * t154 — prove the PUBLISHED byte set (vong 25 tarball) works end-to-end on the real ERP team:
 *   A1 profile agent-teams-rel25 installed from dist/vong-25/*.tgz, not a symlink, frozen hashes;
 *   A2 a real boot on a COPY of the ERP team.json renders 14 members (7 removed) / 107 tasks;
 *   A3 a route change that lands while the member is RUNNING (applied=live-and-durable);
 *   A4 a manual add_member that lands in team.json with a valid route and status;
 *   A5 the ORIGINAL ERP team.json is untouched (sha256 + bytes + mtime);
 *   A6 three modes: --fresh, --resume-live <run dir> and --analyze <run dir> (read-only gate).
 *
 * Usage:
 *   node tests/t154-released-erp-roundtrip.mjs --fresh
 *   node tests/t154-released-erp-roundtrip.mjs --resume-live tests/tmp/t154/run-...
 *   node tests/t154-released-erp-roundtrip.mjs --analyze tests/tmp/t154/run-...
 *
 * Exit codes: 0 = every check passed; 1 = a check failed; 2 = the gate cannot run (usage, missing
 * evidence) — never a silent PASS.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = await import(pathToFileURL(join(REPO, 'tools', 'test', 'lib', 'dsh-cli.mjs')).href);
const CLI = cli.DESKTOP_CLI;
const HOME = cli.DSH_HOME;
const PROFILE = 'agent-teams-rel25';
const PROFILE_DIR = join(HOME, 'profiles', PROFILE);
const INSTALLED = join(PROFILE_DIR, 'node_modules', '@nami', 'dsh-agent-teams');
const TGZ = join(REPO, 'dist', 'vong-25', 'nami-dsh-agent-teams-0.2.0-dev.0.tgz');
const TGZ_SHA = 'da2f297bd6a48c476815c24ffe0ab969a6995812faab5205ee8e6b2d43714ca8';
const TGZ_BYTES = 2248536;
const ERP_TEAM = join(REPO, '..', 'ERP', '.agent-teams', 'erp-erp', 'team.json');
const WORK_ROOT = join(REPO, 'tests', 'tmp', 't154');
const WORKSPACE = join(WORK_ROOT, 'workspace');
const STATE_TEAM = join(WORKSPACE, '.agent-teams', 'erp-erp', 'team.json');
const TEAM = 'erp-erp';
const WORKING_MEMBER = 'qa-do-2';
const NEW_MEMBER = 'kiem-thu-t154';
const PROBE_TASK = 't108';
const FROZEN = [
    ['lib/tools.js', 'e51734baf4693cd3', 213715],
    ['lib/members.js', '50f558f8b207d874', 102260],
    ['lib/state.js', '56664c59ff400319', 57508],
    ['lib/snapshot.js', 'a2a87e1b0c0b34ea', 13986],
    ['lib/index.js', '2d28e617f0683e42', 45315],
    ['lib/tool-names.js', 'e3def5db908dcbd5', 808],
    ['lib/client.js', '67d616a608c38ed3', 258925],
    ['lib/client.js.map', '718f41544f36ae51', 405694],
    ['lib/types/members.d.ts', 'c53250ab41bff8c3', 31769],
    ['lib/types/snapshot.d.ts', '962f99a7bcb18b94', 7627],
    ['lib/types/tools.d.ts', '41cfc56576ed8ffd', 7546],
    ['lib/client/ActivityPanel.module.css', '210186828966d0cf', 52180],
    ['package.json', '92a6404071e457cc', 10498],
];
const EXTRA_CLIENT = [
    ['lib/client/ActivityPanel.js', '60f44766', 64305],
    ['lib/client/WorkspaceActivity.module.css', 'c7f2d5e5', 3579],
];
const EXPECTED = [
    'Members (7 present + 7 removed):',
    'Removed (7):',
    'Tasks (107):',
    'Team id: erp-erp',
];

const checks = [];
function check(id, ok, detail, evidence) {
    checks.push({ id, ok: ok === true, detail, evidence });
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' - ' + detail);
}
function hashOf(file) {
    const buf = readFileSync(file);
    return { hex: createHash('sha256').update(buf).digest('hex'), bytes: buf.length };
}
function walkFiles(dir, base = dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) walkFiles(abs, base, out);
        else if (entry.isFile()) out.push(relative(base, abs).split(String.fromCharCode(92)).join('/'));
    }
    return out;
}

// ---------------------------------------------------------------- boot plumbing
function psQuote(value) { return "'" + String(value).split("'").join("''") + "'"; }
function runHeadless(promptText, cwd, extraArgs, timeoutMs) {
    const parts = [psQuote(CLI), '--profile', psQuote(PROFILE), '--json'].concat(extraArgs.map(psQuote)).concat(['-']);
    const command = '& ' + parts.join(' ');
    const started = Date.now();
    const run = spawnSync('powershell', ['-NoProfile', '-Command', command], {
        input: promptText, cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 128 * 1024 * 1024,
    });
    return {
        status: run.status, stdout: run.stdout ?? '', stderr: run.stderr ?? '',
        elapsedMs: Date.now() - started, command, error: run.error ? String(run.error) : undefined,
    };
}
function parseEvents(text) {
    const events = [];
    for (const line of text.split('\n')) {
        if (line.trim().startsWith('{') === false) continue;
        try { events.push(JSON.parse(line)); } catch { /* not an event */ }
    }
    return events;
}
function toolExchange(texts) {
    const events = [];
    let sessionId;
    for (const text of texts) {
        const parsed = parseEvents(text);
        for (const event of parsed) {
            events.push(event);
            if (event.type === 'session' && sessionId === undefined) sessionId = event.sessionId;
        }
    }
    const byCall = new Map();
    const list = [];
    for (const event of events) {
        if (event.type === 'tool_call') {
            const entry = { tool: event.tool, input: event.input, result: undefined };
            byCall.set(event.callId, entry);
            list.push(entry);
        }
        if (event.type === 'tool_result') {
            const entry = byCall.get(event.callId);
            if (entry !== undefined) entry.result = String(event.result ?? '');
        }
    }
    return { events, list, sessionId };
}

// ---------------------------------------------------------------- session transcript
function slugOf(target) {
    return '--' + String(target).split(':').join('/').split(String.fromCharCode(92)).join('/').split('/').filter(Boolean).join('-') + '--';
}
function readSessionTexts(sessionId, workspace) {
    const dir = join(HOME, 'sessions', slugOf(workspace), String(sessionId));
    const files = [];
    const texts = [];
    if (existsSync(dir) === false) return { dir, files, texts };
    for (const name of readdirSync(dir)) {
        if (name.endsWith('.zstd') === false) continue;
        const abs = join(dir, name);
        files.push(abs);
        const buf = readFileSync(abs);
        const starts = [];
        for (let i = 0; i + 4 <= buf.length; i += 1) {
            if (buf[i] === 0x28 && buf[i + 1] === 0xb5 && buf[i + 2] === 0x2f && buf[i + 3] === 0xfd) starts.push(i);
        }
        let text = '';
        for (let k = 0; k < starts.length; k += 1) {
            const end = k + 1 < starts.length ? starts[k + 1] : buf.length;
            try { text += zstdDecompressSync(buf.subarray(starts[k], end)).toString('utf8'); } catch { /* frame */ }
        }
        texts.push(text);
    }
    return { dir, files, texts };
}
/** The tool_result stream the Host hands the model is TRIMMED (head+tail), so the team footer can be
 *  cut off. The session transcript keeps the whole render: take the NEWEST one. */
function newestRender(texts) {
    let best;
    for (const text of texts) {
        let from = 0;
        while (true) {
            const at = text.indexOf('Members (', from);
            if (at === -1) break;
            const tail = text.slice(at);
            const end = tail.indexOf('Team id:');
            if (end !== -1) best = tail.slice(0, end + 40);
            from = at + 8;
        }
    }
    return best;
}

// ---------------------------------------------------------------- A1 profile
function checkProfile() {
    check('A1.1', existsSync(TGZ), 'tarball phat hanh ton tai', TGZ);
    const tgz = hashOf(TGZ);
    check('A1.2', tgz.hex === TGZ_SHA && tgz.bytes === TGZ_BYTES, 'tarball dung byte phat hanh vong 25',
        'sha256=' + tgz.hex + ' bytes=' + tgz.bytes);
    if (existsSync(INSTALLED) === false) {
        check('A1.3', false, 'profile ' + PROFILE + ' da cai plugin', 'KHONG thay ' + INSTALLED);
        return { installed: false };
    }
    const stat = lstatSync(INSTALLED);
    const pkg = JSON.parse(readFileSync(join(INSTALLED, 'package.json'), 'utf8'));
    check('A1.3', stat.isSymbolicLink() === false && stat.isDirectory() === true,
        'ban cai la THU MUC THAT (khong symlink toi cay nguon)',
        'isSymlink=' + stat.isSymbolicLink() + ' isDirectory=' + stat.isDirectory() + ' version=' + pkg.version
        + ' path=' + INSTALLED);
    const files = walkFiles(INSTALLED);
    const mismatched = [];
    for (const row of FROZEN) {
        const abs = join(INSTALLED, row[0]);
        if (existsSync(abs) === false) { mismatched.push(row[0] + ' MISSING'); continue; }
        const got = hashOf(abs);
        if (got.hex.slice(0, 16) !== row[1] || got.bytes !== row[2]) {
            mismatched.push(row[0] + ' ' + got.hex.slice(0, 16) + '/' + got.bytes + ' != ' + row[1] + '/' + row[2]);
        }
    }
    check('A1.4', mismatched.length === 0, '13/13 dong FROZEN khop hash + bytes trong node_modules',
        mismatched.length === 0 ? files.length + ' tep trong ban cai' : mismatched.join(' | '));
    const extraProblems = [];
    for (const row of EXTRA_CLIENT) {
        const abs = join(INSTALLED, row[0]);
        if (existsSync(abs) === false) { extraProblems.push(row[0] + ' MISSING'); continue; }
        const got = hashOf(abs);
        if (got.hex.slice(0, 8) !== row[1] || got.bytes !== row[2]) {
            extraProblems.push(row[0] + ' ' + got.hex.slice(0, 8) + '/' + got.bytes + ' != ' + row[1] + '/' + row[2]);
        }
    }
    check('A1.5', extraProblems.length === 0, '2 tep client khop hash trong ban cai',
        extraProblems.length === 0
            ? EXTRA_CLIENT.map((row) => row[0] + '=' + hashOf(join(INSTALLED, row[0])).hex.slice(0, 8) + '/' + row[2]).join(' ')
            : extraProblems.join(' | '));
    const extractRoot = join(WORK_ROOT, 'payload');
    rmSync(extractRoot, { recursive: true, force: true });
    mkdirSync(extractRoot, { recursive: true });
    const tar = spawnSync('tar', ['-xzf', TGZ, '-C', extractRoot], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const payloadRoot = join(extractRoot, 'package');
    const diff = [];
    if (tar.status !== 0 || existsSync(payloadRoot) === false) {
        diff.push('giai nen that bai: status=' + tar.status + ' ' + String(tar.stderr ?? '').slice(0, 200));
    } else {
        const payloadFiles = walkFiles(payloadRoot);
        for (const rel of payloadFiles) {
            if (hashOf(join(payloadRoot, rel)).hex !== hashOf(join(INSTALLED, rel)).hex) diff.push(rel);
        }
        if (payloadFiles.length !== files.length) diff.push('so tep lech: payload=' + payloadFiles.length + ' ban cai=' + files.length);
    }
    check('A1.6', diff.length === 0, 'moi byte trong ban cai == payload tarball (khong phai cay nguon repo)',
        diff.length === 0 ? payloadCount(files.length) : diff.slice(0, 6).join(' | ') + (diff.length > 6 ? ' (+' + (diff.length - 6) + ')' : ''));
    return { installed: true };
}
function payloadCount(n) { return n + '/' + n + ' tep giong het'; }

// ---------------------------------------------------------------- ERP original
function erpSnapshot() {
    const stat = statSync(ERP_TEAM);
    const s = hashOf(ERP_TEAM);
    return { sha: s.hex, bytes: s.bytes, mtimeMs: stat.mtimeMs };
}
function readTeamDurable() {
    if (existsSync(STATE_TEAM) === false) return undefined;
    try { return JSON.parse(readFileSync(STATE_TEAM, 'utf8')); } catch { return undefined; }
}

// ---------------------------------------------------------------- checks from artifacts
function analyse(runDir, erpBefore) {
    const meta = JSON.parse(readFileSync(join(runDir, 'run-meta.json'), 'utf8'));
    const texts = [];
    // order matters: the LAST route call in the joined stream must be the newest one
    const rankOf = (name) => {
        if (name.startsWith('boot-main')) return 0;
        const rest = name.slice('boot-live'.length);
        const digits = rest.split('.').filter((part) => part !== '' && Number.isNaN(Number(part)) === false)[0];
        return digits === undefined ? 1 : Number(digits);
    };
    const bootNames = readdirSync(runDir)
        .filter((name) => name === 'boot-main.stdout.txt' || name.startsWith('boot-live'))
        .sort((a, b) => rankOf(a) - rankOf(b));
    for (const name of bootNames) {
        if (name.endsWith('.stdout.txt')) texts.push(readFileSync(join(runDir, name), 'utf8'));
    }
    const ex = toolExchange(texts);
    const team = readTeamDurable();
    const transcript = readSessionTexts(meta.sessionId, meta.workspace);
    const render = newestRender(transcript.texts);
    const body = texts.join('\n') + '\n' + (render ?? '') + '\n' + ex.list.map((entry) => String(entry.result ?? '')).join('\n');
    const missing = EXPECTED.filter((needle) => body.includes(needle) === false);
    check('A2.1', missing.length === 0, 'render dung du lieu ERP that (14 member / 7 removed / 107 task)',
        missing.length === 0
            ? '4/4 dong render; nguon day du = transcript ' + transcript.files.length + ' tep ' + transcript.dir
            : 'THIEU: ' + missing.join(' | '));
    const bootLog = meta.boots ?? [];
    check('A2.2', bootLog.length >= 3 && bootLog.every((row) => row.status === 0),
        'boot that: so lan + thoi gian moi lan',
        bootLog.map((row) => row.label + '=' + row.elapsedMs + 'ms exit=' + row.status).join(' | ') || 'khong co boot log');
    const tools = ex.list.map((entry) => entry.tool);
    const routePos = tools.lastIndexOf('agent_teams_set_member_route');
    const statusBeforePos = routePos === -1 ? -1 : tools.slice(0, routePos).lastIndexOf('agent_teams_status');
    const statusAfterPos = routePos === -1 ? -1 : tools.indexOf('agent_teams_status', routePos);
    const routeCall = routePos === -1 ? undefined : ex.list[routePos];
    const route = routeCall?.input ?? {};
    const target = typeof route.member_name === 'string' && route.member_name !== '' ? route.member_name : WORKING_MEMBER;
    const routeText = String(routeCall?.result ?? '');
    const beforeText = statusBeforePos === -1 ? '' : String(ex.list[statusBeforePos].result ?? '');
    const afterText = statusAfterPos === -1 ? '' : String(ex.list[statusAfterPos].result ?? '');
    const lineOf = (text, from) => {
        let out = '';
        let index = 0;
        while (true) {
            const at = text.indexOf(from, index);
            if (at === -1) return out;
            const end = text.indexOf('\n', at);
            const line = text.slice(at, end === -1 ? text.length : end);
            if (line.includes('[') === true) out = line;
            index = at + from.length;
        }
    };
    const beforeLine = lineOf(beforeText, target + ' [');
    const afterLine = lineOf(afterText, target + ' [');
    check('A2.3', beforeLine.includes('working'), 'member duoc chon DANG CHAY (working) ngay truoc lenh doi route',
        beforeLine === '' ? 'khong thay dong ' + target + ' trong status ngay truoc route' : beforeLine.trim() + ' | target=' + target);
    check('A3.1', routePos !== -1 && routeText.includes('applied to the live session and saved')
        && routeText.includes(String(route.provider) + '/' + String(route.model)),
        'agent_teams_set_member_route bao applied to the LIVE session (live-and-durable)',
        'input=' + JSON.stringify(route) + ' result=' + JSON.stringify(routeText.split('\n')[0]));
    const record = team === undefined ? undefined : (team.members ?? []).find((m) => m.name === target);
    const override = record?.routeOverride;
    check('A3.2', override !== undefined && override.provider === route.provider && override.model === route.model
        && override.reasoningEffort === route.reasoning_effort && override.source === 'captain'
        && typeof override.by === 'string' && override.by === meta.sessionId,
        'routeOverride ghi BEN dung route da doi + source captain + by = session id',
        'routeOverride=' + JSON.stringify(override ?? null) + ' sessionId=' + String(meta.sessionId));
    check('A3.3', afterLine.includes('(override)') && afterLine.includes(String(route.model)),
        'status sau khi doi route in dau (override) tren dong member',
        afterLine === '' ? 'khong thay dong ' + target + ' trong status sau route' : afterLine.trim() + ' | target=' + target);
    const addCall = ex.list.find((entry) => entry.tool === 'agent_teams_add_member');
    const addText = String(addCall?.result ?? '');
    const added = team === undefined ? undefined : (team.members ?? []).find((m) => m.name === NEW_MEMBER);
    const validStatuses = ['idle', 'working', 'removed'];
    check('A4.1', addCall !== undefined && addText.includes(NEW_MEMBER), 'agent_teams_add_member duoc goi va bao member moi',
        'input=' + JSON.stringify(addCall?.input ?? null) + ' result=' + JSON.stringify(addText.split('\n')[0]));
    check('A4.2', added !== undefined && validStatuses.includes(added.status)
        && typeof added.provider === 'string' && added.provider.length > 0
        && typeof added.model === 'string' && added.model.length > 0,
        'member moi nam trong team.json voi route mac dinh + status hop le',
        'row=' + JSON.stringify({ name: added?.name, provider: added?.provider, model: added?.model, reasoningEffort: added?.reasoningEffort, status: added?.status }));
    const removedSample = team === undefined ? undefined : (team.members ?? []).find((m) => m.name === 'tai-lieu');
    check('A4.3', removedSample !== undefined && removedSample.status === 'removed',
        'ho so removed cua ERP van nguyen trong ban copy',
        'tai-lieu status=' + String(removedSample?.status) + ' route=' + String(removedSample?.provider) + '/' + String(removedSample?.model));
    const erpAfter = erpSnapshot();
    check('A5.1', erpBefore !== undefined && erpAfter.sha === erpBefore.sha && erpAfter.bytes === erpBefore.bytes
        && erpAfter.mtimeMs === erpBefore.mtimeMs,
        'tep ERP GOC khong doi (sha256 + bytes + mtime truoc == sau)',
        'before=' + JSON.stringify(erpBefore) + ' after=' + JSON.stringify(erpAfter));
    const copyDiff = existsSync(join(runDir, 'copy-diff.json'))
        ? JSON.parse(readFileSync(join(runDir, 'copy-diff.json'), 'utf8'))
        : undefined;
    check('A6.1', copyDiff !== undefined && Array.isArray(copyDiff.keys), 'ban copy chi bi rebind o cac key khai danh',
        copyDiff === undefined ? 'khong co copy-diff.json' : 'keys=' + copyDiff.keys.join(',') + ' ' + String(copyDiff.before) + ' -> ' + String(copyDiff.after));
    check('A6.2', typeof meta.sessionId === 'string' && meta.sessionId.startsWith('session-'),
        'ban copy da duoc rebind captainSessionId = session id that',
        'captainSessionId=' + String(meta.sessionId));
    return { meta };
}

// ---------------------------------------------------------------- modes
function stampNow() {
    return new Date().toISOString().replaceAll(':', '-').replace(/[.][0-9]+Z$/, '');
}
function parseCli(argv) {
    const flags = argv.filter((token) => token.startsWith('--'));
    const allowed = ['--fresh', '--resume-live', '--analyze'];
    const unknown = flags.filter((token) => allowed.includes(token) === false);
    if (unknown.length > 0) {
        console.log('FAIL usage - co khong ho tro: ' + unknown.join(' '));
        process.exit(2);
    }
    const valueOf = (name) => {
        const index = argv.indexOf(name);
        if (index === -1) return undefined;
        const value = argv[index + 1];
        if (value === undefined || value.startsWith('--')) {
            console.log('FAIL usage - ' + name + ' can mot duong dan run dir');
            process.exit(2);
        }
        return resolve(value);
    };
    const analyze = valueOf('--analyze');
    const resumeLive = valueOf('--resume-live');
    if (analyze !== undefined && resumeLive !== undefined) {
        console.log('FAIL usage - chi dung mot trong --analyze hoac --resume-live');
        process.exit(2);
    }
    return { analyze, resumeLive };
}
const ARTIFACTS = ['run-meta.json', 'boot-mint.stdout.txt', 'boot-main.stdout.txt', 'copy-diff.json', 'erp-before.json'];
function requireArtifacts(runDir, withLive) {
    if (existsSync(runDir) === false) return ['(run dir khong ton tai: ' + runDir + ')'];
    if (statSync(runDir).isDirectory() === false) return ['(khong phai thu muc: ' + runDir + ')'];
    const missing = ARTIFACTS.filter((name) => existsSync(join(runDir, name)) === false);
    if (withLive === true && readdirSync(runDir).some((name) => name.startsWith('boot-live') && name.endsWith('.stdout.txt')) === false) missing.push('boot-live*.stdout.txt');
    return missing;
}
function summarize(runDir, writeResult) {
    const summary = {
        runDir, checks, verdict: checks.every((row) => row.ok) ? 'PASS' : 'FAIL',
        proved: checks.filter((row) => row.ok).map((row) => row.id),
        unproved: checks.filter((row) => row.ok === false).map((row) => row.id),
    };
    if (writeResult === true) writeFileSync(join(runDir, 'result.json'), JSON.stringify(summary, null, 2), 'utf8');
    else console.log('# --analyze: chi doc, khong ghi result.json vao run dir');
    console.log('');
    console.log('verdict ' + summary.verdict + ' - proved ' + summary.proved.join(',') + '; unproved ' + (summary.unproved.join(',') || 'none'));
    console.log('artifacts ' + runDir);
    process.exit(summary.verdict === 'PASS' ? 0 : 1);
}

const PROMPT_MINT = 'Reply with exactly the two characters OK and nothing else.';
const PROMPT_MAIN = 'You are the captain of the existing team erp-erp in this workspace. Do the steps in order, one tool call at a time, and stop after step 8. '
    + 'STEP 1: call agent_teams_status with {}. '
    + 'STEP 2: call agent_teams_create_task with {"subject":"t154 probe: keep a member running for a route change","description":"probe only","assignee":"' + WORKING_MEMBER + '"}. '
    + 'STEP 3: call agent_teams_status with {}. '
    + 'STEP 4: call agent_teams_set_member_route with {"member_name":"' + NEW_MEMBER + '","provider":"command-code-goat","model":"deepseek/deepseek-v4-pro","reasoning_effort":"high"}. '
    + 'STEP 5: call agent_teams_status with {}. '
    + 'STEP 6: call agent_teams_add_member with {"name":"' + NEW_MEMBER + '","role":"t154 probe member"}. '
    + 'STEP 7: call agent_teams_status with {}. '
    + 'STEP 8: reply with ONE line of the form: T154 done route=<' + WORKING_MEMBER + ' route from step 5> new=<' + NEW_MEMBER + ' route from step 7>';
const PROMPT_LIVE = 'You are the captain of the existing team erp-erp in this workspace. Do the steps in order, one tool call at a time, and stop after step 6. '
    + 'STEP 1: call agent_teams_status with {}. '
    + 'STEP 2: call agent_teams_send_message with {"to":"' + NEW_MEMBER + '","content":"Report ready, then start task ' + PROBE_TASK + ' and keep working; this is a probe for a live route change."}. '
    + 'STEP 3: call agent_teams_status with {} and keep the ' + NEW_MEMBER + ' line; if that line still looks idle/unspawned, call agent_teams_status once more (at most twice) and keep the newest line. '
    + 'STEP 4: call agent_teams_set_member_route with {"member_name":"' + NEW_MEMBER + '","provider":"command-code-goat","model":"deepseek/deepseek-v4-flash-fast","reasoning_effort":"high"} - do it even though ' + NEW_MEMBER + ' is running; that is the whole point. '
    + 'STEP 5: call agent_teams_status with {}. '
    + 'STEP 6: reply with ONE line of the form: T154LIVE route=<' + NEW_MEMBER + ' route from step 5>';

async function fresh() {
    const runDir = join(WORK_ROOT, 'run-' + stampNow());
    mkdirSync(runDir, { recursive: true });
    mkdirSync(WORKSPACE, { recursive: true });
    checkProfile();
    if (existsSync(CLI) === false) {
        console.log('FAIL setup - thieu CLI: ' + CLI);
        process.exit(2);
    }
    const erpBefore = erpSnapshot();
    writeFileSync(join(runDir, 'erp-before.json'), JSON.stringify(erpBefore, null, 2), 'utf8');
    rmSync(join(WORKSPACE, '.agent-teams'), { recursive: true, force: true });
    mkdirSync(join(WORKSPACE, '.agent-teams', 'erp-erp'), { recursive: true });
    writeFileSync(STATE_TEAM, readFileSync(ERP_TEAM, 'utf8'), 'utf8');
    const boots = [];
    console.log('run dir   ' + runDir);
    console.log('workspace ' + WORKSPACE);
    console.log('boot 1 (mint a session so the copy can be rebound as its captain) ...');
    const one = runHeadless(PROMPT_MINT, WORKSPACE, [], 600000);
    writeFileSync(join(runDir, 'boot-mint.stdout.txt'), one.stdout, 'utf8');
    writeFileSync(join(runDir, 'boot-mint.stderr.txt'), one.stderr, 'utf8');
    const sessionId = toolExchange([one.stdout]).sessionId;
    boots.push({ label: 'boot-mint', status: one.status, elapsedMs: one.elapsedMs, command: one.command, sessionId });
    console.log('boot 1 exit=' + String(one.status) + ' in ' + one.elapsedMs + 'ms session=' + String(sessionId));
    if (sessionId === undefined) {
        check('A2.0', false, 'boot 1 tra ve session id', 'khong doc duoc sessionId tu boot-mint.stdout.txt');
        writeFileSync(join(runDir, 'run-meta.json'), JSON.stringify({ boots, sessionId: null, workspace: WORKSPACE }, null, 2), 'utf8');
        process.exit(1);
    }
    const copy = JSON.parse(readFileSync(STATE_TEAM, 'utf8'));
    const previousCaptain = copy.captainSessionId;
    copy.captainSessionId = sessionId;
    writeFileSync(STATE_TEAM, JSON.stringify(copy, null, 2), 'utf8');
    writeFileSync(join(runDir, 'copy-diff.json'), JSON.stringify({ keys: ['captainSessionId'], before: previousCaptain, after: sessionId }, null, 2), 'utf8');
    console.log('boot 2 (status -> create the probe task -> add_member on the real roster) ...');
    const two = runHeadless(PROMPT_MAIN, WORKSPACE, ['--session-id', sessionId], 900000);
    writeFileSync(join(runDir, 'boot-main.stdout.txt'), two.stdout, 'utf8');
    writeFileSync(join(runDir, 'boot-main.stderr.txt'), two.stderr, 'utf8');
    boots.push({ label: 'boot-main', status: two.status, elapsedMs: two.elapsedMs, command: two.command, sessionId });
    console.log('boot 2 exit=' + String(two.status) + ' in ' + two.elapsedMs + 'ms');
    writeFileSync(join(runDir, 'team-after-main.json'), existsSync(STATE_TEAM) ? readFileSync(STATE_TEAM, 'utf8') : '{}', 'utf8');
    writeFileSync(join(runDir, 'run-meta.json'), JSON.stringify({
        stamp: stampNow(), workspace: WORKSPACE, profile: PROFILE, cli: CLI,
        tgz: TGZ, tgzSha: TGZ_SHA, tgzBytes: TGZ_BYTES,
        sessionId, boots, workingMember: WORKING_MEMBER, newMember: NEW_MEMBER, teamId: TEAM,
    }, null, 2), 'utf8');
    console.log('(A3 can mot boot rieng: member phai DANG CHAY khi doi route -> chay --resume-live)');
    process.exit(2);
}

async function resumeLive(runDir) {
    const missing = requireArtifacts(runDir, false);
    if (missing.length > 0) {
        console.log('FAIL usage - --resume-live can artifact cua --fresh, thieu: ' + missing.join(', '));
        process.exit(2);
    }
    const meta = JSON.parse(readFileSync(join(runDir, 'run-meta.json'), 'utf8'));
    const erpBefore = JSON.parse(readFileSync(join(runDir, 'erp-before.json'), 'utf8'));
    console.log('boot 3 (resume ' + meta.sessionId + ': wake the member, then change its route while it runs) ...');
    const three = runHeadless(PROMPT_LIVE, meta.workspace, ['--session-id', meta.sessionId], 900000);
    const liveIndex = readdirSync(runDir).filter((name) => name.startsWith('boot-live') && name.endsWith('.stdout.txt')).length + 1;
    const liveName = 'boot-live' + (liveIndex === 1 ? '' : String(liveIndex));
    writeFileSync(join(runDir, liveName + '.stdout.txt'), three.stdout, 'utf8');
    writeFileSync(join(runDir, liveName + '.stderr.txt'), three.stderr, 'utf8');
    console.log('boot 3 exit=' + String(three.status) + ' in ' + three.elapsedMs + 'ms');
    meta.boots = (meta.boots ?? []).concat([{ label: liveName, status: three.status, elapsedMs: three.elapsedMs, command: three.command, sessionId: meta.sessionId }]);
    writeFileSync(join(runDir, 'run-meta.json'), JSON.stringify(meta, null, 2), 'utf8');
    writeFileSync(join(runDir, 'team-after.json'), existsSync(STATE_TEAM) ? readFileSync(STATE_TEAM, 'utf8') : '{}', 'utf8');
    analyse(runDir, erpBefore);
    summarize(runDir, true);
}

function analyzeMode(runDir) {
    const missing = requireArtifacts(runDir, true);
    if (missing.length > 0) {
        console.log('FAIL usage - --analyze can bang chung, thieu: ' + missing.join(', '));
        console.log('(che do nay CHI DOC: khong tao run dir, khong ghi tep nao)');
        process.exit(2);
    }
    const erpBefore = JSON.parse(readFileSync(join(runDir, 'erp-before.json'), 'utf8'));
    checkProfile();
    analyse(runDir, erpBefore);
    summarize(runDir, false);
}

const args = parseCli(process.argv.slice(2));
if (args.analyze !== undefined) analyzeMode(args.analyze);
else if (args.resumeLive !== undefined) await resumeLive(args.resumeLive);
else await fresh();
