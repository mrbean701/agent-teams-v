#!/usr/bin/env node
/**
 * t106 — E2E trên DỮ LIỆU ĐỘI ERP THẬT (chỉ đọc tệp thật, mọi thao tác trên BẢN COPY).
 *
 * Chứng minh Agent Teams dùng được với dữ liệu ERP thật ở mức ĐẦU-CUỐI: boot phiên
 * headless thật, đọc 14 member / 107 task, đọc được routeOverride có source ERp-only
 * và trường lạ, ghi được route (source chuyển thành captain) mà KHÔNG mất trường
 * ERP-only nào, in roster có dấu (override), đối chứng âm bằng bản cài cũ
 * agent-teams-pack14 (phải ra 'is not a valid member record'), và tệp ERP thật
 * không đổi sha256.
 *
 *   node tests/t106-erp-live-roundtrip.mjs
 *   node tests/t106-erp-live-roundtrip.mjs --analyze tests/tmp/t106
 *
 * Exit 0 chỉ khi C1..C6 đều PASS. Assert KHÔNG được nới: điều nào sản phẩm không
 * làm được thì in FAIL kèm số đo thật.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const WORK = path.join(REPO, 'tests', 'tmp', 't106');
const ERP_TEAM = path.join(REPO, '..', 'ERP', '.agent-teams', 'erp-erp', 'team.json');
const ERP_SHA = '9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e';
const ERP_BYTES = 1533117;
const TEAM_ID = 'erp-erp';
const PROFILE = 'agent-teams-test';
const LIVE_MEMBER = 'ha-tang-2';
const REMOVED_MEMBER = 'tai-lieu';
const INJECT_REMOVED_ROUTE = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4-pro' };
const INJECT_LIVE_ROUTE = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4-flash-fast' };
const NEW_ROUTE = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4-pro', reasoning_effort: 'high' };
const BUDGET = { boots: 6, shell: 30, files: 4, attempts: 3 };

function sha256(buf) {
    return createHash('sha256').update(buf).digest('hex');
}
function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}
function psQuote(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
}
function stampOf(date) {
    return date.toISOString().replace(/[:.]/g, '-');
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
function stable(value) {
    return JSON.stringify(value);
}
function indexBy(list, key) {
    const map = new Map();
    for (const item of list) map.set(item[key], item);
    return map;
}

async function loadCli() {
    const modulePath = path.join(REPO, 'tools', 'test', 'lib', 'dsh-cli.mjs');
    if (!fs.existsSync(modulePath)) throw new Error('missing harness helper: ' + modulePath);
    const mod = await import(pathToFileURL(modulePath).href);
    if (typeof mod.DESKTOP_CLI !== 'string' || typeof mod.DSH_HOME !== 'string')
        throw new Error('harness helper did not export DESKTOP_CLI / DSH_HOME');
    return { cli: mod.DESKTOP_CLI, dshHome: mod.DSH_HOME };
}

/** One real headless boot. Prompt MUST be a single line (t59 lesson). */
function runBoot(options) {
    if (options.prompt.includes('\n')) throw new Error('prompt must be one line (' + options.label + ')');
    const args = ['--profile', PROFILE, '--json'];
    if (options.sessionId !== undefined) args.push('--session-id', options.sessionId);
    args.push('-');
    const command = '& ' + psQuote(options.cli) + ' ' + args.map(psQuote).join(' ') + '; exit $LASTEXITCODE';
    const started = Date.now();
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
        cwd: options.cwd,
        input: options.prompt,
        encoding: 'utf8',
        timeout: options.timeoutMs === undefined ? 300000 : options.timeoutMs,
        maxBuffer: 128 * 1024 * 1024,
        windowsHide: true,
    });
    const ms = Date.now() - started;
    return {
        label: options.label,
        exitCode: typeof result.status === 'number' ? result.status : -1,
        signal: result.signal === null ? undefined : result.signal,
        ms,
        stdout: result.stdout === null ? '' : result.stdout,
        stderr: result.stderr === null ? '' : result.stderr,
        args,
        cwd: options.cwd,
        prompt: options.prompt,
    };
}

function parseEvents(stdout) {
    const events = [];
    for (const raw of String(stdout).split(/\r?\n/)) {
        const line = raw.trim();
        if (line.length === 0 || line[0] !== '{') continue;
        try {
            events.push(JSON.parse(line));
        } catch (error) {
            events.push({ type: 'unparsed', raw: line.slice(0, 400) });
        }
    }
    return events;
}

function sessionIdOf(events) {
    for (const event of events) if (event.type === 'session' && typeof event.sessionId === 'string') return event.sessionId;
    return undefined;
}

/** Pair tool_call with tool_result by callId; keep the rendered text verbatim. */
function toolPairs(events) {
    const calls = new Map();
    for (const event of events) {
        if (event.type === 'tool_call') calls.set(event.callId, { name: event.tool, input: event.input });
    }
    const pairs = [];
    for (const event of events) {
        if (event.type !== 'tool_result') continue;
        const call = calls.get(event.callId);
        const text = typeof event.result === 'string' ? event.result : JSON.stringify(event.result);
        pairs.push({
            name: call === undefined ? '?' : call.name,
            input: call === undefined ? undefined : call.input,
            status: event.status === undefined ? 'unknown' : event.status,
            truncated: event.truncated === true,
            error: text.trimStart().startsWith('Error:'),
            text: text,
        });
    }
    return pairs;
}

function statusPair(pairs) {
    for (const pair of pairs) {
        if (pair.name !== 'agent_teams_status') continue;
        if (pair.text.includes('Members (') && pair.text.includes('Tasks (')) return pair;
    }
    return undefined;
}

function countStatusText(text) {
    const lines = String(text).split(/\r?\n/);
    const memberHeaderIndex = lines.findIndex((line) => /^Members \(\d+( present \+ \d+ removed)?\):$/.test(line));
    const activeHeaderIndex = lines.findIndex((line) => /^Members \(\d+ active \+ \d+ removed\):$/.test(line));
    const taskHeaderIndex = lines.findIndex((line) => /^Tasks \(\d+\):$/.test(line));
    const removedHeaderIndex = lines.findIndex((line) => /^Removed \(\d+\):$/.test(line));
    // The status text has two titles now (t107/BUG-027): the two-count one names the
    // removed records, the legacy single count hides them. Both are parsed so the gate
    // can tell which one the product printed instead of silently accepting either.
    let presentNumber;
    let removedNumber;
    let singleNumber;
    if (memberHeaderIndex >= 0) {
        const split = /^Members \((\d+) present \+ (\d+) removed\):$/.exec(lines[memberHeaderIndex]);
        if (split === null) {
            singleNumber = Number(/^Members \((\d+)\):$/.exec(lines[memberHeaderIndex])[1]);
        } else {
            presentNumber = Number(split[1]);
            removedNumber = Number(split[2]);
        }
    }
    const removedHeaderNumber = removedHeaderIndex < 0 ? undefined : Number(/^Removed \((\d+)\):$/.exec(lines[removedHeaderIndex])[1]);
    const memberEnd = removedHeaderIndex > memberHeaderIndex && removedHeaderIndex >= 0
        ? removedHeaderIndex
        : (taskHeaderIndex > memberHeaderIndex && taskHeaderIndex >= 0 ? taskHeaderIndex : lines.length);
    const memberLines = memberHeaderIndex < 0 ? [] : lines.slice(memberHeaderIndex + 1, memberEnd).filter((line) => /^  - \S+ \[/.test(line));
    const removedEnd = taskHeaderIndex > removedHeaderIndex && taskHeaderIndex >= 0 ? taskHeaderIndex : lines.length;
    const removedLines = removedHeaderIndex < 0 ? [] : lines.slice(removedHeaderIndex + 1, removedEnd).filter((line) => /^  - \S+ \[/.test(line));
    const taskNumber = taskHeaderIndex < 0 ? undefined : Number(/^Tasks \((\d+)\):$/.exec(lines[taskHeaderIndex])[1]);
    const taskLines = taskHeaderIndex < 0 ? [] : lines.slice(taskHeaderIndex + 1).filter((line) => /^  - \S+ \[[a-z_]+\]/.test(line));
    return { presentNumber, removedNumber, singleNumber, activeWording: activeHeaderIndex >= 0, removedHeaderNumber, memberLines, removedLines, taskNumber, taskLines, lines };
}

/** Locate the session transcript for a session id under $DSH_HOME/sessions/<slug>/<id>/. */
function findSessionTranscript(dshHome, sessionId) {
    const root = path.join(dshHome, 'sessions');
    if (!fs.existsSync(root)) return undefined;
    for (const slug of fs.readdirSync(root)) {
        const dir = path.join(root, slug, sessionId);
        if (!fs.existsSync(dir)) continue;
        const names = fs.readdirSync(dir);
        const file = names.find((name) => name.endsWith('.jsonl.zstd')) ?? names.find((name) => name.endsWith('.jsonl'));
        if (file !== undefined) return path.join(dir, file);
    }
    return undefined;
}

/** Read a multi-frame zstd session log (each frame carries its own magic header). */
function readSessionText(file) {
    const buffer = fs.readFileSync(file);
    if (!file.endsWith('.zstd')) return buffer.toString('utf8');
    const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
    const starts = [];
    let index = buffer.indexOf(magic, 0);
    while (index >= 0) {
        starts.push(index);
        index = buffer.indexOf(magic, index + 4);
    }
    let out = '';
    for (let k = 0; k < starts.length; k += 1) {
        const end = k + 1 < starts.length ? starts[k + 1] : buffer.length;
        try {
            out += zstdDecompressSync(buffer.subarray(starts[k], end)).toString('utf8');
        } catch (error) {
            // A frame the current zstd build cannot decode is skipped, never faked.
        }
    }
    return out;
}

function collectStrings(node, out, depth) {
    if (depth > 14 || node === null || node === undefined) return;
    if (typeof node === 'string') {
        out.push(node);
        return;
    }
    if (Array.isArray(node)) {
        for (const item of node) collectStrings(item, out, depth + 1);
        return;
    }
    if (typeof node === 'object') for (const value of Object.values(node)) collectStrings(value, out, depth + 1);
}

/**
 * The CLI stream clips a long tool_result (event.truncated = true), so the only place
 * the complete status render survives is the session transcript. This pulls the first
 * COMPLETE render (one that ends with the "Team id: ..." footer) out of it.
 */
function extractStatusRender(transcriptFile) {
    const text = readSessionText(transcriptFile);
    const strings = [];
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.length === 0 || line[0] !== '{') continue;
        try {
            collectStrings(JSON.parse(line), strings, 0);
        } catch (error) {
            continue;
        }
    }
    // Walk backwards: a session that was resumed across invocations holds renders from
    // earlier code too, and the NEWEST complete render is the one this run produced.
    for (const candidate of strings.slice().reverse()) {
        if (!candidate.includes('Members (') || !candidate.includes('Tasks (')) continue;
        if (!candidate.includes('Team id: ')) continue;
        const start = candidate.indexOf('Members (');
        const body = candidate.slice(start);
        const footer = body.indexOf('Team id: ');
        const stop = body.indexOf('\n', footer);
        return stop < 0 ? body : body.slice(0, stop);
    }
    return '';
}

/** Fields the runtime legitimately rewrites at boot (scheduler reconcile, activity). */
const VOLATILE_MEMBER_FIELDS = ['status', 'activeProvider', 'activeModel', 'fallbackActive', 'lastFailure', 'spawnError'];
const VOLATILE_TASK_FIELDS = ['status', 'attempt', 'attemptId', 'updatedAt', 'output', 'changedPaths', 'acceptanceResults', 'commandsRun', 'reassigning', 'reassignedAt'];

function allowedVolatile(beforeList, key, fields) {
    const allow = new Set();
    for (const record of beforeList) for (const field of fields) allow.add(record[key] + '.' + field);
    return allow;
}

function volatileReport(beforeList, afterList, key, fields) {
    const report = [];
    const before = indexBy(beforeList, key);
    const after = indexBy(afterList, key);
    for (const [name, record] of before) {
        const current = after.get(name);
        if (current === undefined) continue;
        for (const field of fields) {
            if (stable(record[field]) === stable(current[field])) continue;
            report.push(name + '.' + field + ': ' + stable(record[field]).slice(0, 70) + ' -> ' + stable(current[field]).slice(0, 70));
        }
    }
    return report;
}

/** Key sets must stay identical: losing or gaining a stored field is data loss. */
function keySetProblems(beforeList, afterList, key) {
    const problems = [];
    const before = indexBy(beforeList, key);
    const after = indexBy(afterList, key);
    for (const [name, record] of before) {
        const current = after.get(name);
        if (current === undefined) continue;
        const a = Object.keys(record).sort().join(',');
        const b = Object.keys(current).sort().join(',');
        if (a !== b) problems.push(name + ' key set changed: [' + a + '] -> [' + b + ']');
    }
    return problems;
}
function probeRead(libDir, teamFile, runDir) {
    const probeFile = path.join(runDir, 'probe-read.mjs');
    if (!fs.existsSync(probeFile)) {
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(probeFile, [
            "import path from 'node:path';",
            "import { pathToFileURL } from 'node:url';",
            'const libDir = process.argv[2];',
            'const teamFile = process.argv[3];',
            'const stateRoot = path.dirname(path.dirname(teamFile));',
            'const teamId = path.basename(path.dirname(teamFile));',
            'try {',
            "    const mod = await import(pathToFileURL(path.join(libDir, 'state.js')).href);",
            '    const team = await mod.readTeam(stateRoot, teamId);',
            '    console.log(JSON.stringify({ ok: true, members: team.members.length, tasks: team.tasks.length, source: team.members.map((m) => m.routeOverride === undefined ? null : m.routeOverride.source) }));',
            '} catch (error) {',
            '    console.log(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }));',
            '}',
        ].join('\n') + '\n');
    }
    const result = spawnSync(process.execPath, [probeFile, libDir, teamFile], { encoding: 'utf8', timeout: 120000 });
    const text = String(result.stdout === null ? '' : result.stdout).trim();
    let parsed;
    try {
        parsed = JSON.parse(text.split(/\r?\n/).filter((line) => line.trim().startsWith('{')).pop());
    } catch (error) {
        parsed = { ok: false, error: 'probe output unparseable: ' + text.slice(0, 300) + String(result.stderr === null ? '' : result.stderr).slice(0, 300) };
    }
    return { exitCode: typeof result.status === 'number' ? result.status : -1, ...parsed };
}

function diffRecords(beforeList, afterList, key, allowKeys) {
    const problems = [];
    const before = indexBy(beforeList, key);
    const after = indexBy(afterList, key);
    for (const [name, record] of before) {
        const current = after.get(name);
        if (current === undefined) {
            problems.push(name + ': record disappeared from the durable file');
            continue;
        }
        for (const field of Object.keys(record)) {
            if (allowKeys !== undefined && allowKeys.has(name + '.' + field)) continue;
            if (stable(current[field]) !== stable(record[field]))
                problems.push(name + '.' + field + ': ' + stable(record[field]).slice(0, 90) + ' -> ' + stable(current[field]).slice(0, 90));
        }
    }
    return problems;
}

function buildPrepared(pristine, sessionId, injectedAt) {
    const prepared = clone(pristine);
    prepared.captainSessionId = sessionId;
    const removedIndex = 2;
    prepared.members[removedIndex].routeOverride = {
        provider: INJECT_REMOVED_ROUTE.provider,
        model: INJECT_REMOVED_ROUTE.model,
        source: 'erp',
        at: injectedAt,
        by: 'erp-tool',
    };
    prepared.members[removedIndex].erpStage = 'review';
    const liveIndex = prepared.members.findIndex((member) => member.name === LIVE_MEMBER);
    if (liveIndex < 0) throw new Error('member ' + LIVE_MEMBER + ' not found in the ERP copy');
    prepared.members[liveIndex].routeOverride = {
        provider: INJECT_LIVE_ROUTE.provider,
        model: INJECT_LIVE_ROUTE.model,
        source: 'erp',
        at: injectedAt,
        by: 'erp-tool',
    };
    return prepared;
}

/**
 * Runs (or resumes) the real boots. Resumable on purpose: a boot killed by an outer
 * deadline must not force a full re-run, because the boot budget is a hard cap.
 */
function prepare(runDir, erpMeta, resume, opts) {
    const reuseRun = opts === undefined || opts.reuseRun === undefined ? undefined : path.resolve(REPO, opts.reuseRun);
    // A re-measure that must not re-run the earlier boots inherits the session, the
    // workspace (the captain session is bound to that directory) and the C2..C6 artifacts
    // from a donor run dir. Everything inherited is listed in carried-over.json so no
    // artifact can be mistaken for something this invocation produced.
    const donorWs = reuseRun !== undefined && fs.existsSync(path.join(reuseRun, 'ws')) ? path.join(reuseRun, 'ws') : undefined;
    const ws = donorWs === undefined ? path.join(runDir, 'ws') : donorWs;
    const stateRoot = path.join(ws, '.agent-teams');
    const copyPath = path.join(stateRoot, TEAM_ID, 'team.json');
    fs.mkdirSync(path.dirname(copyPath), { recursive: true });
    fs.mkdirSync(ws, { recursive: true });
    const has = (name) => fs.existsSync(path.join(runDir, name));
    const logs = [];
    let bootsThisRun = 0;
    const reused = [];
    const carried = [];
    if (reuseRun !== undefined) {
        for (const name of ['boot-mint.stdout.txt', 'boot-mint.stderr.txt', 'snap-01-pristine-bound.json', 'snap-02-prepared-erp.json', 'snap-03-after-c3.json', 'snap-04-after-c4.json', 'boot-c3.stdout.txt', 'boot-c3.stderr.txt', 'boot-c4.stdout.txt', 'boot-c4.stderr.txt', 'boots-prior.json', 'c5-old.json', 'c5-new.json']) {
            const from = path.join(reuseRun, name);
            if (!fs.existsSync(from) || has(name)) continue;
            fs.copyFileSync(from, path.join(runDir, name));
            carried.push({ file: name, from: path.relative(REPO, reuseRun).split(path.sep).join('/') });
        }
    }

    // ---- session: mint once, reuse on resume --------------------------------
    let sessionId;
    if (resume && has('boot-mint.stdout.txt')) {
        sessionId = sessionIdOf(parseEvents(fs.readFileSync(path.join(runDir, 'boot-mint.stdout.txt'), 'utf8')));
        if (sessionId !== undefined) reused.push('mint');
    }
    if (sessionId === undefined) {
        if (!fs.existsSync(copyPath)) fs.writeFileSync(copyPath, erpMeta.buffer);
        const mint = runBoot({
            label: 'mint',
            cwd: ws,
            prompt: 'Gọi công cụ agent_teams_status, sau đó in một dòng duy nhất T106-MINT-DONE.',
            cli: erpMeta.cli,
        });
        bootsThisRun += 1;
        const mintEvents = parseEvents(mint.stdout);
        sessionId = sessionIdOf(mintEvents);
        fs.writeFileSync(path.join(runDir, 'boot-mint.stdout.txt'), mint.stdout);
        fs.writeFileSync(path.join(runDir, 'boot-mint.stderr.txt'), mint.stderr);
        const mintPairs = toolPairs(mintEvents);
        logs.push({ boot: 'mint', exitCode: mint.exitCode, ms: mint.ms, sessionId, tools: mintPairs.map((pair) => ({ name: pair.name, error: pair.error, text: pair.text.slice(0, 400) })) });
        if (sessionId === undefined) throw new Error('boot mint returned no session id; cannot bind the copy to a real session');
    }

    // ---- snapshots: pristine-bound and ERP-style prepared -------------------
    const pristine = JSON.parse(erpMeta.buffer.toString('utf8'));
    const pristineBound = has('snap-01-pristine-bound.json')
        ? readJson(path.join(runDir, 'snap-01-pristine-bound.json'))
        : (() => { const bound = clone(pristine); bound.captainSessionId = sessionId; writeJson(path.join(runDir, 'snap-01-pristine-bound.json'), bound); return bound; })();
    const prepared = has('snap-02-prepared-erp.json')
        ? readJson(path.join(runDir, 'snap-02-prepared-erp.json'))
        : (() => { const built = buildPrepared(pristine, sessionId, Date.now()); writeJson(path.join(runDir, 'snap-02-prepared-erp.json'), built); return built; })();

    // ---- C1 boot: status on the pristine ERP data (must run BEFORE injection)
    if (resume && has('boot-c1.stdout.txt')) {
        reused.push('c1');
    } else {
        // Re-measuring on the current code runs the single boot on the prepared copy: the
        // present/removed counts are unchanged by the injection (asserted against the fixture
        // below) and the injected override lets the same text re-prove C2.
        writeJson(copyPath, reuseRun === undefined ? pristineBound : prepared);
        const c1 = runBoot({
            label: 'c1',
            cwd: ws,
            sessionId,
            cli: erpMeta.cli,
            prompt: 'Gọi công cụ agent_teams_status đúng một lần, rồi in nguyên văn toàn bộ kết quả công cụ đó vào câu trả lời cuối, kết thúc bằng dòng T106-C1-DONE.',
        });
        bootsThisRun += 1;
        fs.writeFileSync(path.join(runDir, 'boot-c1.stdout.txt'), c1.stdout);
        fs.writeFileSync(path.join(runDir, 'boot-c1.stderr.txt'), c1.stderr);
        const c1Pairs = toolPairs(parseEvents(c1.stdout));
        logs.push({ boot: 'c1', exitCode: c1.exitCode, ms: c1.ms, sessionId, tools: c1Pairs.map((pair) => ({ name: pair.name, error: pair.error, text: pair.text.slice(0, 400) })) });
    }

    // The stream clips long tool_results, so keep the complete c1 render from the
    // transcript; this costs no boot (file read only).
    const c1FullFile = path.join(runDir, 'c1-full-text.txt');
    if (!fs.existsSync(c1FullFile)) {
        const transcript = findSessionTranscript(erpMeta.dshHome, sessionId);
        if (transcript !== undefined) {
            const render = extractStatusRender(transcript);
            fs.writeFileSync(c1FullFile, render);
            logs.push({ boot: 'c1-transcript-extract', transcript: path.relative(REPO, transcript).split(path.sep).join('/'), renderChars: render.length });
        }
    }
    // ---- C2 + C3 boot: ERP-style records must read, then one durable write --
    if (resume && has('snap-03-after-c3.json')) {
        reused.push('c3');
    } else {
        writeJson(copyPath, prepared);
        const c3 = runBoot({
            label: 'c3',
            cwd: ws,
            sessionId,
            cli: erpMeta.cli,
            prompt: 'Gọi agent_teams_status đúng một lần và in nguyên văn kết quả; sau đó gọi agent_teams_set_member_route với member_name "' + LIVE_MEMBER + '", provider "' + NEW_ROUTE.provider + '", model "' + NEW_ROUTE.model + '", reasoning_effort "' + NEW_ROUTE.reasoning_effort + '" và in nguyên văn kết quả; sau đó gọi agent_teams_status lần nữa và in nguyên văn kết quả; kết thúc bằng dòng T106-C3-DONE.',
        });
        bootsThisRun += 1;
        fs.writeFileSync(path.join(runDir, 'boot-c3.stdout.txt'), c3.stdout);
        fs.writeFileSync(path.join(runDir, 'boot-c3.stderr.txt'), c3.stderr);
        const c3Pairs = toolPairs(parseEvents(c3.stdout));
        logs.push({ boot: 'c3', exitCode: c3.exitCode, ms: c3.ms, sessionId, tools: c3Pairs.map((pair) => ({ name: pair.name, error: pair.error, text: pair.text.slice(0, 600) })) });
        writeJson(path.join(runDir, 'snap-03-after-c3.json'), readJson(copyPath));
    }

    // ---- C4 boot: roster with (override) on a staged team -------------------
    if (resume && has('snap-04-after-c4.json')) {
        reused.push('c4');
    } else {
        const ws2 = path.join(runDir, 'ws2');
        fs.mkdirSync(ws2, { recursive: true });
        const c4 = runBoot({
            label: 'c4',
            cwd: ws2,
            cli: erpMeta.cli,
            prompt: 'Gọi agent_teams_create với name "t106-roster", approval "required", plan gồm members [{"name":"member-a","role":"engineer","provider":"command-code-goat","model":"deepseek/deepseek-v4.1-flash"},{"name":"member-b","role":"engineer","provider":"command-code-goat","model":"deepseek/deepseek-v4-flash"}] và tasks [{"id":"p1","subject":"probe","assignee":"member-b"}]; sau đó gọi agent_teams_set_member_route cho member-a với provider "command-code-goat", model "' + NEW_ROUTE.model + '", reasoning_effort "high"; sau đó gọi agent_teams_edit_plan với operations [{"action":"add_task","subject":"t106 roster probe"}]; in nguyên văn kết quả của cả ba công cụ, rồi in dòng T106-C4-DONE.',
        });
        bootsThisRun += 1;
        fs.writeFileSync(path.join(runDir, 'boot-c4.stdout.txt'), c4.stdout);
        fs.writeFileSync(path.join(runDir, 'boot-c4.stderr.txt'), c4.stderr);
        const c4Pairs = toolPairs(parseEvents(c4.stdout));
        logs.push({ boot: 'c4', exitCode: c4.exitCode, ms: c4.ms, sessionId: sessionIdOf(parseEvents(c4.stdout)), tools: c4Pairs.map((pair) => ({ name: pair.name, error: pair.error, text: pair.text.slice(0, 500) })) });
        writeJson(path.join(runDir, 'snap-04-after-c4.json'), readJson(copyPath));
    }

    // ---- C5: negative control on the OLD install, same file, same call ------
    const c5Root = path.join(runDir, 'c5', '.agent-teams');
    const c5File = path.join(c5Root, TEAM_ID, 'team.json');
    writeJson(c5File, prepared);
    const pack14Lib = path.join(erpMeta.dshHome, 'profiles', 'agent-teams-pack14', 'node_modules', '@nami', 'dsh-agent-teams', 'lib');
    const currentLib = path.join(REPO, 'packages', 'dsh-agent-teams', 'lib');
    const c5Old = probeRead(pack14Lib, c5File, runDir);
    const c5New = probeRead(currentLib, c5File, runDir);
    writeJson(path.join(runDir, 'c5-old.json'), { lib: pack14Lib, result: c5Old });
    writeJson(path.join(runDir, 'c5-new.json'), { lib: currentLib, result: c5New });

    writeJson(path.join(runDir, 'carried-over.json'), { donor: reuseRun === undefined ? null : path.relative(REPO, reuseRun).split(path.sep).join('/'), files: carried });
    if (carried.length > 0) reused.push('carried:' + String(carried.length) + ' files');
    return { sessionId, prepared, bootsThisRun, shellCommands: bootsThisRun + 2, logs, reused, carried, ws: path.relative(REPO, ws).split(path.sep).join('/') };
}

function evaluate(runDir) {
    const results = [];
    const push = (id, title, ok, evidence) => results.push({ id, title, ok, evidence: evidence.filter((line) => line !== undefined) });
    const prepared = readJson(path.join(runDir, 'snap-02-prepared-erp.json'));
    const pristineBound = readJson(path.join(runDir, 'snap-01-pristine-bound.json'));
    const afterC3 = readJson(path.join(runDir, 'snap-03-after-c3.json'));
    const afterC4 = readJson(path.join(runDir, 'snap-04-after-c4.json'));
    const c5Old = readJson(path.join(runDir, 'c5-old.json'));
    const c5New = readJson(path.join(runDir, 'c5-new.json'));
    const erpMeta = readJson(path.join(runDir, 'erp-meta.json'));
    const meta = readJson(path.join(runDir, 'run-meta.json'));
    // Boot bookkeeping lives in meta.bootLog for this invocation and in meta.boots for
    // older runs; a reused boot is not in bootLog, so report it as reused rather than
    // inventing numbers.
    const bootOf = (label) => {
        if (Array.isArray(meta.bootLog)) {
            const found = meta.bootLog.find((entry) => entry.boot === label);
            if (found !== undefined) return found;
        }
        if (meta.boots !== undefined && meta.boots[label] !== undefined) return meta.boots[label];
        return { exitCode: 'reused', ms: 'previous invocation', sessionId: meta.sessionId };
    };

    function readPairs(file) {
        const text = fs.readFileSync(path.join(runDir, file), 'utf8');
        return toolPairs(parseEvents(text));
    }
    const c1Pairs = readPairs('boot-c1.stdout.txt');
    const c3Pairs = readPairs('boot-c3.stdout.txt');
    const c4Pairs = readPairs('boot-c4.stdout.txt');

    // ---- C1 -----------------------------------------------------------------
    // t106 attempt 2 (captain order): the product was fixed to print
    // 'Members (P present + R removed):' plus a 'Removed (M):' block (t107/BUG-027).
    // The gate is tightened to that shape and derives every expectation from the ERP
    // copy itself: no member name, role or route is hardcoded here.
    const c1Title = 'boot thật + agent_teams_status đếm đủ 14 member (7 present + 7 removed) / 107 task trong text';
    const c1Status = statusPair(c1Pairs);
    const fullTextFile = path.join(runDir, 'c1-full-text.txt');
    let fullText = fs.existsSync(fullTextFile) ? fs.readFileSync(fullTextFile, 'utf8') : '';
    // The stream clips long tool_results, so the complete render is recovered from the
    // session transcript when it was not already cached (file read only — 0 boots).
    if (fullText === '' && meta.sessionId !== undefined) {
        const dshHome = process.env.DSH_HOME === undefined || process.env.DSH_HOME === '' ? path.join(os.homedir(), '.dsh') : process.env.DSH_HOME;
        const transcript = findSessionTranscript(dshHome, String(meta.sessionId));
        if (transcript !== undefined) {
            const render = extractStatusRender(transcript);
            if (render !== '') {
                fs.writeFileSync(fullTextFile, render);
                fullText = render;
            }
        }
    }
    const fixturePresent = pristineBound.members.filter((member) => member.status !== 'removed');
    const fixtureRemoved = pristineBound.members.filter((member) => member.status === 'removed');
    const fixtureTotal = pristineBound.members.length;
    if (c1Status === undefined) {
        push('C1', c1Title, false, ['no parsed agent_teams_status text in boot-c1.stdout.txt']);
    } else {
        const streamCounted = countStatusText(c1Status.text);
        const fullCounted = fullText === '' ? undefined : countStatusText(fullText);
        // The fresh boot's own text is the primary evidence. A cached/transcript render is only
        // a fallback: a resumed session keeps renders from earlier invocations (older code), so
        // a stale render must never outrank the text this boot just produced.
        const streamHasTwoCountTitle = streamCounted.presentNumber !== undefined;
        const sourceLabel = streamHasTwoCountTitle
            ? 'fresh tool_result stream (' + String(c1Status.text.length) + ' chars, truncated=' + String(c1Status.truncated === true) + ')'
            : (fullCounted === undefined ? 'fresh tool_result stream' : 'complete render from the session transcript (' + String(fullText.length) + ' chars)');
        const counted = streamHasTwoCountTitle ? streamCounted : (fullCounted === undefined ? streamCounted : fullCounted);
        const titleOk = counted.presentNumber === fixturePresent.length
            && counted.removedNumber === fixtureRemoved.length
            && counted.presentNumber + counted.removedNumber === fixtureTotal;
        // Negative control 1: the previous wording ('N active + M removed') must be gone.
        const activeWordingGone = counted.activeWording === false && streamCounted.activeWording === false;
        // Negative control 2: a legacy single count ('Members (N):') is a FAIL even when N is
        // 14, because the captain still cannot tell which records are removed.
        const noLegacySingleCount = counted.singleNumber === undefined && streamCounted.singleNumber === undefined;
        const removedBlockOk = counted.removedHeaderNumber === fixtureRemoved.length
            && counted.removedLines.length === fixtureRemoved.length;
        // Every removed record must be printed with its real name, role and route.
        const removedLineProblems = [];
        for (const member of fixtureRemoved) {
            const prefix = '  - ' + member.name + ' [' + (member.role || 'no role') + '] ' + member.provider + '/' + member.model;
            const line = counted.removedLines.find((candidate) => candidate.startsWith('  - ' + member.name + ' ['));
            if (line === undefined) {
                removedLineProblems.push(member.name + ': no line in the Removed block');
            } else if (!line.startsWith(prefix)) {
                removedLineProblems.push(member.name + ': expected prefix "' + prefix + '" got "' + line.slice(0, 120) + '"');
            }
        }
        const presentLinesOk = counted.memberLines.length === fixturePresent.length;
        // The host clips a long tool_result head+tail, so the task COUNT is scored from the
        // header line (always in the head) and never from a per-task line count.
        const taskOk = counted.taskNumber === 107 && streamCounted.taskNumber === 107;
        const c1Boot = bootOf('c1');
        const titleLine = counted.lines.find((line) => /^Members \(/.test(line)) || '(missing)';
        push('C1', c1Title, titleOk && activeWordingGone && noLegacySingleCount && removedBlockOk && presentLinesOk && taskOk && removedLineProblems.length === 0, [
            'session ' + String(c1Boot.sessionId === undefined ? meta.sessionId : c1Boot.sessionId) + ' (boot c1, exit ' + String(c1Boot.exitCode) + ', ' + String(c1Boot.ms) + ' ms)',
            'fixture from the ERP file: ' + String(fixtureTotal) + ' member = ' + String(fixturePresent.length) + ' present + ' + String(fixtureRemoved.length) + ' removed, ' + String(pristineBound.tasks.length) + ' task (names/roles/routes below come from this fixture, not from the test)',
            'title line (from the ' + sourceLabel + '): ' + titleLine.trim(),
            'present lines ' + String(counted.memberLines.length) + '/' + String(fixturePresent.length) + ' · Removed header ' + String(counted.removedHeaderNumber) + '/' + String(fixtureRemoved.length) + ' · removed lines ' + String(counted.removedLines.length) + '/' + String(fixtureRemoved.length),
            'Removed block (first 4 lines): ' + counted.removedLines.slice(0, 4).map((line) => line.trim()).join(' | ').slice(0, 400),
            'removed lines matching the real record (name + role + provider/model): ' + String(fixtureRemoved.length - removedLineProblems.length) + '/' + String(fixtureRemoved.length) + (removedLineProblems.length === 0 ? '' : ' — ' + removedLineProblems.slice(0, 3).join(' ; ')),
            'negative control — old wording "N active + M removed" present: ' + String(!activeWordingGone) + ' (must be false) · legacy single count "Members (N):" present: ' + String(!noLegacySingleCount) + ' (must be false)',
            'task half: header Tasks (' + String(counted.taskNumber) + ') in ' + (streamHasTwoCountTitle ? 'the same fresh stream' : 'the complete render') + '; only ' + String(counted.taskLines.length) + ' per-task lines survive the host head+tail clip, so per-task line counting is not asserted',
        ]);
    }

    // ---- C2 -----------------------------------------------------------------
    // Preference order: the freshest status text that carries an override route wins, so a
    // re-measure of C1 on the current code also re-proves C2 on the current code; the older
    // carried-over boot is used only when the fresh text does not show an override.
    const c1StatusForC2 = statusPair(c1Pairs);
    const c2FromC1 = c1StatusForC2 !== undefined && c1StatusForC2.text.includes('override route: ');
    const c2Status = c2FromC1 ? c1StatusForC2 : statusPair(c3Pairs);
    const c2EvidenceFile = c2FromC1 ? 'boot-c1.stdout.txt (current code)' : 'boot-c3.stdout.txt (carried over)';
    if (c2Status === undefined) {
        push('C2', 'ERP-style routeOverride (source erp) + unknown field read without throwing, text prints override route', false, ['no agent_teams_status text in boot-c3.stdout.txt']);
    } else {
        const lines = c2Status.text.split(/\r?\n/);
        const liveIndex = lines.findIndex((line) => line.includes('  - ' + LIVE_MEMBER + ' ['));
        const liveLine = liveIndex < 0 ? '' : lines[liveIndex];
        const detail = liveIndex < 0 ? '' : lines.slice(liveIndex + 1, liveIndex + 6).join('\n');
        const showsOverrideRoute = detail.includes('override route: ' + INJECT_LIVE_ROUTE.provider + '/' + INJECT_LIVE_ROUTE.model);
        const showsSource = detail.includes('by erp');
        const showsMarker = liveLine.includes('(override)');
        const noThrow = c2Status.error === false && !c2Status.text.includes('is not a valid member record');
        const removedInjectedVisible = c2Status.text.split(/\r?\n/).some((line) => line.includes('  - ' + REMOVED_MEMBER + ' ['));
        push('C2', 'ERP-style routeOverride (source erp) + unknown field read without throwing, text prints override route', noThrow && showsOverrideRoute && showsSource && showsMarker, [
            'status call error=' + String(c2Status.error) + ' (no "is not a valid member record")',
            'member line: ' + liveLine.trim().slice(0, 120),
            'detail: ' + detail.split('\n').map((line) => line.trim()).filter((line) => line !== '').join(' / ').slice(0, 200),
            'override route printed: ' + String(showsOverrideRoute) + ' · provenance "by erp": ' + String(showsSource) + ' · marker (override): ' + String(showsMarker),
            'source: ' + c2EvidenceFile,
            'injected record on members[2] (' + REMOVED_MEMBER + ', status removed) appears in this status text: ' + String(removedInjectedVisible) + ' — C1 scores the removed block on the current code (a carried-over boot predates the t107 fix)',
        ]);
    }

    // ---- C3 -----------------------------------------------------------------
    const setPair = c3Pairs.find((pair) => pair.name === 'agent_teams_set_member_route');
    // Strict deep-equal over EVERY stored field, except the two honest exceptions:
    // the one routeOverride this boot legitimately rewrote, and the runtime bookkeeping
    // fields the scheduler rewrites at boot (listed explicitly, reported, never assumed).
    const memberAllow = allowedVolatile(prepared.members, 'name', VOLATILE_MEMBER_FIELDS);
    memberAllow.add(LIVE_MEMBER + '.routeOverride');
    const taskAllow = allowedVolatile(prepared.tasks, 'id', VOLATILE_TASK_FIELDS);
    const memberProblems = diffRecords(prepared.members, afterC3.members, 'name', memberAllow);
    const taskProblems = diffRecords(prepared.tasks, afterC3.tasks, 'id', taskAllow);
    const memberKeyProblems = keySetProblems(prepared.members, afterC3.members, 'name');
    const taskKeyProblems = keySetProblems(prepared.tasks, afterC3.tasks, 'id');
    const memberVolatile = volatileReport(prepared.members, afterC3.members, 'name', VOLATILE_MEMBER_FIELDS);
    const taskVolatile = volatileReport(prepared.tasks, afterC3.tasks, 'id', VOLATILE_TASK_FIELDS);
    const topBefore = clone(prepared);
    const topAfter = clone(afterC3);
    delete topBefore.members;
    delete topAfter.members;
    delete topBefore.tasks;
    delete topAfter.tasks;
    const topProblems = [];
    for (const field of Object.keys(topBefore)) {
        if (stable(topAfter[field]) !== stable(topBefore[field])) topProblems.push('team.' + field + ' changed');
    }
    const liveAfter = afterC3.members.find((member) => member.name === LIVE_MEMBER);
    const removedAfter = afterC3.members.find((member) => member.name === REMOVED_MEMBER);
    const sourceIsCaptain = liveAfter !== undefined && liveAfter.routeOverride !== undefined && liveAfter.routeOverride.source === 'captain';
    const erpFieldKept = removedAfter !== undefined && removedAfter.erpStage === 'review' && removedAfter.routeOverride !== undefined && removedAfter.routeOverride.source === 'erp';
    const erpOnlyChecks = [];
    for (const member of afterC3.members) {
        if (member.runtimeSetup === undefined) erpOnlyChecks.push(member.name + ' lost runtimeSetup');
        if (member.joinedAt === undefined) erpOnlyChecks.push(member.name + ' lost joinedAt');
    }
    for (const task of afterC3.tasks) {
        if (task.createdAt === undefined) erpOnlyChecks.push(task.id + ' lost createdAt');
        if (task.updatedAt === undefined) erpOnlyChecks.push(task.id + ' lost updatedAt');
        if (task.profileSeedId !== undefined && task.profileSeedId === '') erpOnlyChecks.push(task.id + ' lost profileSeedId');
    }
    const seedCount = afterC3.tasks.filter((task) => task.profileSeedId !== undefined).length;
    const evidenceCount = afterC3.tasks.filter((task) => task.supplementalEvidence !== undefined).length;
    push('C3', 'set_member_route writes source=captain and keeps 100% ERP-only fields of 14 members + 107 tasks (deep-equal)', sourceIsCaptain && erpFieldKept && memberProblems.length === 0 && taskProblems.length === 0 && memberKeyProblems.length === 0 && taskKeyProblems.length === 0 && topProblems.length === 0 && erpOnlyChecks.length === 0 && setPair !== undefined && setPair.error === false, [
        'tool text: ' + (setPair === undefined ? 'missing' : setPair.text.trim().slice(0, 180)),
        'durable routeOverride of ' + LIVE_MEMBER + ': ' + JSON.stringify(liveAfter === undefined ? null : liveAfter.routeOverride),
        'source became captain: ' + String(sourceIsCaptain),
        'record of ' + REMOVED_MEMBER + ' (members[2]) kept ERP provenance + unknown field: ' + String(erpFieldKept) + ' -> ' + JSON.stringify(removedAfter === undefined ? null : { routeOverride: removedAfter.routeOverride, erpStage: removedAfter.erpStage }),
        'deep-equal over all non-volatile member fields (' + String(prepared.members.length) + ' records): ' + String(memberProblems.length) + ' problem(s)' + (memberProblems.length === 0 ? '' : ' — ' + memberProblems.slice(0, 5).join(' ; ')),
        'deep-equal over all non-volatile task fields (' + String(prepared.tasks.length) + ' records): ' + String(taskProblems.length) + ' problem(s)' + (taskProblems.length === 0 ? '' : ' — ' + taskProblems.slice(0, 5).join(' ; ')),
        'key sets unchanged (a lost or invented field is data loss): members ' + String(memberKeyProblems.length) + ' problem(s), tasks ' + String(taskKeyProblems.length) + ' problem(s)' + (memberKeyProblems.length + taskKeyProblems.length === 0 ? '' : ' — ' + memberKeyProblems.concat(taskKeyProblems).slice(0, 5).join(' ; ')),
        'deep-equal team top-level: ' + String(topProblems.length) + ' problem(s)' + (topProblems.length === 0 ? '' : ' — ' + topProblems.join(' ; ')),
        'ERP-only presence: profileSeedId on ' + String(seedCount) + ' tasks, supplementalEvidence on ' + String(evidenceCount) + ' tasks, runtimeSetup on 14 members: ' + String(erpOnlyChecks.length === 0) + (erpOnlyChecks.length === 0 ? '' : ' — ' + erpOnlyChecks.slice(0, 5).join(' ; ')),
        'runtime bookkeeping rewritten at boot (allowed by name, not by surprise): members [' + (memberVolatile.length === 0 ? 'none' : memberVolatile.join(' ; ')) + '] tasks [' + (taskVolatile.length === 0 ? 'none' : taskVolatile.join(' ; ')) + ']',
    ]);

    // ---- C4 -----------------------------------------------------------------
    const editPair = c4Pairs.find((pair) => pair.name === 'agent_teams_edit_plan');
    const createPair = c4Pairs.find((pair) => pair.name === 'agent_teams_create');
    const rosterOverride = editPair === undefined ? false : /member-a \(.*\(override\)\)/.test(editPair.text);
    const rosterMemberB = editPair === undefined ? false : /member-b \(/.test(editPair.text) && !/member-b \(.*\(override\)\)/.test(editPair.text);
    const tasksUntouched = stable(afterC4.tasks) === stable(afterC3.tasks) && afterC4.tasks.length === 107;
    push('C4', 'roster in text prints (override) at the right member, ERP 107 tasks untouched', rosterOverride && rosterMemberB && tasksUntouched && editPair !== undefined && editPair.error === false, [
        'create: ' + (createPair === undefined ? 'missing' : createPair.text.trim().split('\n')[0].slice(0, 140)),
        'edit_plan: ' + (editPair === undefined ? 'missing' : editPair.text.trim().split('\n').slice(0, 3).join(' / ').slice(0, 220)),
        'roster line with (override) at member-a: ' + String(rosterOverride) + ' · member-b printed without the marker: ' + String(rosterMemberB),
        'ERP copy tasks after boot c4: ' + String(afterC4.tasks.length) + ' (deep-equal with post-C3 tasks: ' + String(tasksUntouched) + ')',
    ]);

    // ---- C5 -----------------------------------------------------------------
    const oldResult = c5Old.result;
    const newResult = c5New.result;
    const oldSawError = oldResult.ok === false && typeof oldResult.error === 'string' && oldResult.error.includes('is not a valid member record');
    const newRead = newResult.ok === true && newResult.members === 14 && newResult.tasks === 107;
    push('C5', 'negative control on the OLD install agent-teams-pack14 raises the old "is not a valid member record"', oldSawError && newRead, [
        'old lib: ' + c5Old.lib,
        'old result: ' + JSON.stringify(oldResult).slice(0, 260),
        'new lib: ' + c5New.lib,
        'new result: ' + JSON.stringify({ ok: newResult.ok, members: newResult.members, tasks: newResult.tasks }).slice(0, 200),
        'same file, same readTeam call — only the installed code differs',
    ]);

    // ---- C6 -----------------------------------------------------------------
    const sameBytes = erpMeta.shaBefore === erpMeta.shaAfter && erpMeta.bytesBefore === erpMeta.bytesAfter && erpMeta.mtimeBefore === erpMeta.mtimeAfter;
    push('C6', 'ERP team.json sha256 unchanged after the whole run', erpMeta.shaBefore === ERP_SHA && erpMeta.shaAfter === ERP_SHA && sameBytes, [
        'sha256 before ' + erpMeta.shaBefore + ' / after ' + erpMeta.shaAfter,
        'bytes before ' + String(erpMeta.bytesBefore) + ' / after ' + String(erpMeta.bytesAfter) + ' (expected ' + String(ERP_BYTES) + ')',
        'mtimeMs unchanged: ' + String(erpMeta.mtimeBefore === erpMeta.mtimeAfter) + ' · identical=' + String(sameBytes),
    ]);

    return results;
}

function printResults(runDir, results) {
    console.log('run dir: ' + path.relative(REPO, runDir).split(path.sep).join('/'));
    for (const result of results) {
        console.log('# ' + result.id + ' ' + (result.ok ? 'PASS' : 'FAIL') + ' — ' + result.title);
        for (const line of result.evidence) console.log('    ' + line);
    }
    const proved = results.filter((result) => result.ok).map((result) => result.id);
    const unproved = results.filter((result) => !result.ok).map((result) => result.id);
    console.log('');
    console.log('verdict ' + (unproved.length === 0 ? 'PASS' : 'FAIL') + ' — proved ' + (proved.length === 0 ? '(none)' : proved.join(',')) + ' — unproved ' + (unproved.length === 0 ? '(none)' : unproved.join(',')));
    return unproved.length === 0;
}

function resolveRunDir(target, analyze) {
    const resolved = path.resolve(REPO, target);
    if (!fs.existsSync(resolved)) return undefined;
    if (fs.existsSync(path.join(resolved, 'run-meta.json'))) return resolved;
    const children = fs.readdirSync(resolved)
        .filter((name) => name.startsWith('run-'))
        .map((name) => path.join(resolved, name))
        .filter((dir) => fs.existsSync(path.join(dir, 'run-meta.json')))
        .sort();
    if (children.length === 0) return undefined;
    return analyze ? children[children.length - 1] : children[children.length - 1];
}

async function main() {
    const args = process.argv.slice(2);
    const analyzeIndex = args.indexOf('--analyze');
    const runDirIndex = args.indexOf('--run-dir');
    const reuseIndex = args.indexOf('--reuse-run');
    const reuseRun = reuseIndex >= 0 && args[reuseIndex + 1] !== undefined ? args[reuseIndex + 1] : undefined;

    if (analyzeIndex >= 0) {
        const target = args[analyzeIndex + 1] === undefined ? path.join('tests', 'tmp', 't106') : args[analyzeIndex + 1];
        const runDir = resolveRunDir(target, true);
        if (runDir === undefined) {
            console.log('no run artifacts under ' + target + ' (0 boots spent)');
            process.exit(2);
        }
        const results = evaluate(runDir);
        const allPassed = printResults(runDir, results);
        console.log('analyze: 0 boots (scored from artifacts only)');
        process.exit(allPassed ? 0 : 1);
    }

    if (!fs.existsSync(ERP_TEAM)) {
        console.log('missing ERP team file: ' + ERP_TEAM);
        process.exit(2);
    }
    const erpBuffer = fs.readFileSync(ERP_TEAM);
    const erpStat = fs.statSync(ERP_TEAM);
    const shaBefore = sha256(erpBuffer);
    const cli = await loadCli();
    const startedAt = new Date();
    // A bare invocation reuses the newest run dir that already holds artifacts instead of
    // booting again: the boot budget is a hard cap, so re-scoring must not cost boots.
    // Pass --fresh to force new boots into a new run dir.
    const fresh = args.includes('--fresh');
    const latestRunDir = fresh ? undefined : resolveRunDir(WORK, true);
    const resume = runDirIndex >= 0 || latestRunDir !== undefined;
    const runDir = runDirIndex >= 0
        ? path.resolve(REPO, args[runDirIndex + 1])
        : (latestRunDir === undefined ? path.join(WORK, 'run-' + stampOf(startedAt)) : latestRunDir);
    if (runDirIndex < 0 && latestRunDir !== undefined) console.log('resume: ' + path.relative(REPO, runDir) + ' (existing artifacts; pass --fresh to force new boots)');
    fs.mkdirSync(runDir, { recursive: true });

    const preparedLog = prepare(runDir, {
        buffer: erpBuffer,
        cli: cli.cli,
        dshHome: cli.dshHome,
    }, resume, { reuseRun });
    if (!fs.existsSync(path.join(runDir, 'snap-00-copy-as-read.json'))) {
        fs.writeFileSync(path.join(runDir, 'snap-00-copy-as-read.json'), JSON.stringify(JSON.parse(erpBuffer.toString('utf8')), null, 2) + '\n');
    }

    const erpAfterBuffer = fs.readFileSync(ERP_TEAM);
    const erpAfterStat = fs.statSync(ERP_TEAM);
    writeJson(path.join(runDir, 'erp-meta.json'), {
        teamFile: path.relative(REPO, ERP_TEAM).split(path.sep).join('/'),
        shaBefore,
        bytesBefore: erpBuffer.length,
        mtimeBefore: erpStat.mtimeMs,
        shaAfter: sha256(erpAfterBuffer),
        bytesAfter: erpAfterBuffer.length,
        mtimeAfter: erpAfterStat.mtimeMs,
        expectedSha: ERP_SHA,
    });

    const priorFile = path.join(runDir, 'boots-prior.json');
    const prior = fs.existsSync(priorFile) ? readJson(priorFile) : { count: 0, detail: 'no earlier invocation recorded' };
    const total = (Number(prior.count) || 0) + preparedLog.bootsThisRun;
    writeJson(path.join(runDir, 'run-meta.json'), {
        task: 't106',
        stamp: path.basename(runDir).replace(/^run-/, ''),
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        profile: PROFILE,
        sessionId: preparedLog.sessionId,
        bootsThisInvocation: preparedLog.bootsThisRun,
        bootsPrior: prior,
        bootsTotalReal: total,
        bootBudget: BUDGET.boots,
        reusedBoots: preparedLog.reused,
        shellCommandsThisInvocation: preparedLog.shellCommands,
        budget: BUDGET,
        bootLog: preparedLog.logs,
        reuseRun: reuseRun === undefined ? null : reuseRun,
        workspace: preparedLog.ws,
        carriedOver: preparedLog.carried,
        artifacts: fs.readdirSync(runDir).sort(),
    });
    const results = evaluate(runDir);
    writeJson(path.join(runDir, 'analysis.json'), { verdict: results.every((result) => result.ok) ? 'PASS' : 'FAIL', results });
    const allPassed = printResults(runDir, results);
    console.log('boots: this invocation ' + String(preparedLog.bootsThisRun) + ' · prior ' + String(prior.count) + ' · total real ' + String(total) + '/' + String(BUDGET.boots) + ' · reused: ' + (preparedLog.reused.length === 0 ? '(none)' : preparedLog.reused.join(',')));
    console.log('shell commands this invocation: ' + String(preparedLog.shellCommands) + '/' + String(BUDGET.shell) + ' · files written: 2/' + String(BUDGET.files));
    process.exit(allPassed ? 0 : 1);
}

await main();
