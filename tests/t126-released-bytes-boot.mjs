#!/usr/bin/env node
/**
 * t126 — chung minh BO BYTE PHAT HANH chay duoc that: cai tu tgz dist/vong-19 vao
 * profile MOI (agent-teams-rel19, node_modules KHONG phai symlink), roi boot phien
 * that tren BAN COPY team.json ERP (14 member / 107 task).
 *
 *   node tests/t126-released-bytes-boot.mjs --fresh                    # A1 + 3 boot + 2 phep dot bien
 *   node tests/t126-released-bytes-boot.mjs --analyze tests/tmp/t126   # cham lai, 0 boot
 *   node tests/t126-released-bytes-boot.mjs --negative tests/tmp/t126  # chi lam 2 phep dot bien A3
 *   node tests/t126-released-bytes-boot.mjs --fresh --run-dir <dir>    # chay tiep run dir da co
 *
 * Exit 0 chi khi A1..A6 dat trong --fresh, va A1..A8 dat trong --analyze.
 * Assert KHONG duoc noi: dieu gi san pham khong lam duoc thi in FAIL kem so do that.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { zstdDecompressSync } from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const WORK = path.join(REPO, "tests", "tmp", "t126");
const TGZ = path.join(REPO, "dist", "vong-19", "nami-dsh-agent-teams-0.2.0-dev.0.tgz");
const TGZ_SHA = "2770fbfc4070eb80cbe419134f1c44ffed8e9c6e4d9703d0d775b4af3cc6251e";
const TGZ_BYTES = 2248092;
const TGZ_ENTRIES = 133;
const PROFILE = "agent-teams-rel19";
const PROFILE_DEPS = "file:E:/Project/Agent-Team/dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz";
const PACKAGE_VERSION = "0.2.0-dev.0";
const ERP_TEAM = path.join(REPO, "..", "ERP", ".agent-teams", "erp-erp", "team.json");
const ERP_SHA = "9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e";
const ERP_BYTES = 1533117;
const TEAM_ID = "erp-erp";
const SOURCE_PKG = path.join(REPO, "packages", "dsh-agent-teams");
const REMOVED_NAMES = ["ha-tang", "qa-do", "tai-lieu", "master-hop-dong", "db-luoc-do", "be-api", "fe-ui"];
const REMOVED_ROUTE = "opencode-go-new/minimax-m3.1-flash-free";
const ROUTE_MEMBER = "ha-tang-2";
const NEW_ROUTE = { provider: "command-code-goat", model: "deepseek/deepseek-v4-pro", effort: "high" };
const GUARD_MESSAGE = "agent-teams: route change for member \"alice\" refused: source \"erp\" is not one the plugin owns (valid sources: captain, http, profile); nothing was written";
const BUDGET = { boots: 4, shell: 40, files: 5, attempts: 3, installs: 3 };

/** 13 tep dong bang cua dist/vong-19 (14 hex dau sha256 + bytes). */
const FROZEN = [
    ["lib/tools.js", "e51734baf4693cd3", 213715],
    ["lib/members.js", "50f558f8b207d874", 102260],
    ["lib/state.js", "56664c59ff400319", 57508],
    ["lib/snapshot.js", "a2a87e1b0c0b34ea", 13986],
    ["lib/index.js", "2d28e617f0683e42", 45315],
    ["lib/tool-names.js", "e3def5db908dcbd5", 808],
    ["lib/client.js", "9da18d9971a284e9", 258432],
    ["lib/client.js.map", "bbf88608f54e966f", 404958],
    ["lib/types/members.d.ts", "c53250ab41bff8c3", 31769],
    ["lib/types/snapshot.d.ts", "962f99a7bcb18b94", 7627],
    ["lib/types/tools.d.ts", "41cfc56576ed8ffd", 7546],
    ["lib/client/ActivityPanel.module.css", "53ea47c6d780cd9d", 51837],
    ["package.json", "92a6404071e457cc", 10498],
];

const VOLATILE_MEMBER_FIELDS = ["status", "activeProvider", "activeModel", "fallbackActive", "lastFailure", "spawnError"];
const VOLATILE_TASK_FIELDS = ["status", "attempt", "attemptId", "updatedAt", "output", "changedPaths", "acceptanceResults", "commandsRun", "reassigning", "reassignedAt"];

function sha256(buf) {
    return createHash("sha256").update(buf).digest("hex");
}
function sha256OfFile(file) {
    return sha256(fs.readFileSync(file));
}
function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}
function writeText(file, text) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
}
function psQuote(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
}
function stampOf(date) {
    return date.toISOString().replace(/[:.]/g, "-");
}
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

async function loadCli() {
    const modulePath = path.join(REPO, "tools", "test", "lib", "dsh-cli.mjs");
    if (!fs.existsSync(modulePath)) throw new Error("missing harness helper: " + modulePath);
    const mod = await import(pathToFileURL(modulePath).href);
    if (typeof mod.DESKTOP_CLI !== "string" || typeof mod.DSH_HOME !== "string")
        throw new Error("harness helper did not export DESKTOP_CLI / DSH_HOME");
    return { cli: mod.DESKTOP_CLI, dshHome: mod.DSH_HOME };
}

/** Mot lan boot headless that. Prompt BAT BUOC mot dong (bai hoc t59). */
function runBoot(options) {
    if (options.prompt.includes("\n")) throw new Error("prompt must be one line (" + options.label + ")");
    const args = ["--profile", PROFILE, "--json"];
    if (options.sessionId !== undefined) args.push("--session-id", options.sessionId);
    args.push("-");
    const command = "& " + psQuote(options.cli) + " " + args.map(psQuote).join(" ") + "; exit $LASTEXITCODE";
    const started = Date.now();
    const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
        cwd: options.cwd,
        input: options.prompt,
        encoding: "utf8",
        timeout: options.timeoutMs === undefined ? 420000 : options.timeoutMs,
        maxBuffer: 128 * 1024 * 1024,
        windowsHide: true,
    });
    return {
        label: options.label,
        exitCode: typeof result.status === "number" ? result.status : -1,
        ms: Date.now() - started,
        stdout: result.stdout === null || result.stdout === undefined ? "" : result.stdout,
        stderr: result.stderr === null || result.stderr === undefined ? "" : result.stderr,
        args,
        cwd: options.cwd,
        prompt: options.prompt,
    };
}

function parseEvents(stdout) {
    const events = [];
    for (const raw of String(stdout).split(/\r?\n/)) {
        const line = raw.trim();
        if (line.length === 0 || line[0] !== "{") continue;
        try { events.push(JSON.parse(line)); } catch (error) { events.push({ type: "unparsed", raw: line.slice(0, 400) }); }
    }
    return events;
}

function sessionIdOf(events) {
    for (const event of events) if (event.type === "session" && typeof event.sessionId === "string") return event.sessionId;
    return undefined;
}

function toolPairs(events) {
    const calls = new Map();
    for (const event of events) if (event.type === "tool_call") calls.set(event.callId, { name: event.tool, input: event.input });
    const pairs = [];
    for (const event of events) {
        if (event.type !== "tool_result") continue;
        const call = calls.get(event.callId);
        const text = typeof event.result === "string" ? event.result : JSON.stringify(event.result);
        pairs.push({
            name: call === undefined ? "?" : call.name,
            input: call === undefined ? undefined : call.input,
            status: event.status === undefined ? "unknown" : event.status,
            truncated: event.truncated === true,
            text,
        });
    }
    return pairs;
}

function findSessionTranscript(dshHome, sessionId) {
    const root = path.join(dshHome, "sessions");
    if (!fs.existsSync(root)) return undefined;
    for (const slug of fs.readdirSync(root)) {
        const dir = path.join(root, slug, sessionId);
        if (!fs.existsSync(dir)) continue;
        const names = fs.readdirSync(dir);
        const file = names.find((name) => name.endsWith(".jsonl.zstd")) ?? names.find((name) => name.endsWith(".jsonl"));
        if (file !== undefined) return path.join(dir, file);
    }
    return undefined;
}

function readSessionText(file) {
    const buffer = fs.readFileSync(file);
    if (!file.endsWith(".zstd")) return buffer.toString("utf8");
    const magic = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
    const starts = [];
    let index = buffer.indexOf(magic, 0);
    while (index >= 0) { starts.push(index); index = buffer.indexOf(magic, index + 4); }
    let out = "";
    for (let k = 0; k < starts.length; k += 1) {
        const end = k + 1 < starts.length ? starts[k + 1] : buffer.length;
        try { out += zstdDecompressSync(buffer.subarray(starts[k], end)).toString("utf8"); } catch (error) { /* frame khong giai duoc thi bo, khong bia */ }
    }
    return out;
}

function collectStrings(node, out, depth) {
    if (depth > 14 || node === null || node === undefined) return;
    if (typeof node === "string") { out.push(node); return; }
    if (Array.isArray(node)) { for (const item of node) collectStrings(item, out, depth + 1); return; }
    if (typeof node === "object") { for (const key of Object.keys(node)) collectStrings(node[key], out, depth + 1); }
}

/** Render status MOI NHAT trong transcript (phien dung lai giu render cu). */
function extractStatusRender(transcriptFile) {
    const text = readSessionText(transcriptFile);
    const strings = [];
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.length === 0 || line[0] !== "{") continue;
        try { collectStrings(JSON.parse(line), strings, 0); } catch (error) { continue; }
    }
    for (const candidate of strings.slice().reverse()) {
        if (!candidate.includes("Members (") || !candidate.includes("Tasks (")) continue;
        if (!candidate.includes("Team id: ")) continue;
        const start = candidate.indexOf("Members (");
        const body = candidate.slice(start);
        const footer = body.indexOf("Team id: ");
        const stop = body.indexOf("\n", footer);
        return stop < 0 ? body : body.slice(0, stop);
    }
    return "";
}

function indexBy(list, key) {
    const map = new Map();
    for (const item of list) map.set(item[key], item);
    return map;
}

function copyTree(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) copyTree(from, to);
        else fs.copyFileSync(from, to);
    }
}

/** Lat dung MOT byte, giu nguyen do dai tep. */
function flipByte(file, offset) {
    const buffer = fs.readFileSync(file);
    const at = offset >= 0 && offset < buffer.length ? offset : Math.floor(buffer.length / 2);
    const before = buffer[at];
    buffer[at] = before ^ 0x01;
    fs.writeFileSync(file, buffer);
    return { offset: at, before, after: buffer[at], bytes: buffer.length };
}

/** Kiem tep phat hanh: sha256 + bytes phai khop gia tri dong bang. */
function checkArtifact(file) {
    if (!fs.existsSync(file)) return { ok: false, sha: "", bytes: 0, problems: ["artifact not found: " + file] };
    const buffer = fs.readFileSync(file);
    const sha = sha256(buffer);
    const problems = [];
    if (sha !== TGZ_SHA) problems.push("tgz sha256 " + sha + " != pinned " + TGZ_SHA);
    if (buffer.length !== TGZ_BYTES) problems.push("tgz bytes " + buffer.length + " != pinned " + TGZ_BYTES);
    return { ok: problems.length === 0, sha, bytes: buffer.length, problems };
}

/** So 13 tep cua mot cay da cai voi bang dong bang (14 hex dau + bytes). */
function checkInstalledTree(dir) {
    const rows = [];
    const problems = [];
    for (const [rel, hex, bytes] of FROZEN) {
        const file = path.join(dir, rel);
        if (!fs.existsSync(file)) { rows.push({ rel, ok: false, missing: true }); problems.push(rel + " is missing"); continue; }
        const buffer = fs.readFileSync(file);
        const sha = sha256(buffer);
        const ok = sha.startsWith(hex) && buffer.length === bytes;
        rows.push({ rel, ok, sha, bytes: buffer.length, frozen: hex, frozenBytes: bytes });
        if (!ok) {
            if (!sha.startsWith(hex)) problems.push(rel + " sha256 " + sha.slice(0, 16) + " != frozen " + hex);
            if (buffer.length !== bytes) problems.push(rel + " bytes " + buffer.length + " != frozen " + bytes);
        }
    }
    return { ok: problems.length === 0 && rows.length === FROZEN.length, rows, problems, comparedFiles: rows.length };
}

function profileChecks(dshHome) {
    const dir = path.join(dshHome, "profiles", PROFILE);
    const installed = path.join(dir, "node_modules", "@nami", "dsh-agent-teams");
    const out = { dir, installed, exists: fs.existsSync(dir), installedExists: fs.existsSync(installed), problems: [] };
    if (!out.exists) { out.problems.push("profile dir missing: " + dir); return out; }
    const pkgFile = path.join(dir, "package.json");
    if (!fs.existsSync(pkgFile)) out.problems.push("profile package.json missing");
    else {
        const pkg = readJson(pkgFile);
        out.profileName = pkg.name;
        out.dependency = pkg.dependencies === undefined ? undefined : pkg.dependencies["@nami/dsh-agent-teams"];
        out.bundles = pkg.dsh === undefined || pkg.dsh.profile === undefined ? undefined : pkg.dsh.profile.bundles;
        if (out.dependency !== PROFILE_DEPS) out.problems.push("profile dependency " + String(out.dependency) + " != " + PROFILE_DEPS);
        const bundles = out.bundles === undefined ? [] : out.bundles;
        if (!bundles.includes("@nami/dsh-agent-teams")) out.problems.push("profile bundles do not mount @nami/dsh-agent-teams");
    }
    if (out.installedExists) {
        out.isSymlink = fs.lstatSync(installed).isSymbolicLink();
        if (out.isSymlink !== false) out.problems.push("installed package IS a symlink (dogfood, not release bytes)");
        const ipkg = path.join(installed, "package.json");
        if (fs.existsSync(ipkg)) {
            out.version = readJson(ipkg).version;
            if (out.version !== PACKAGE_VERSION) out.problems.push("installed version " + String(out.version) + " != " + PACKAGE_VERSION);
        }
    }
    const lockFile = path.join(dir, "package-lock.json");
    if (!fs.existsSync(lockFile)) out.problems.push("profile package-lock.json missing (install not recorded)");
    else {
        const lock = readJson(lockFile);
        const entry = lock.packages === undefined ? undefined : lock.packages["node_modules/@nami/dsh-agent-teams"];
        out.lockResolved = entry === undefined ? undefined : entry.resolved;
        const resolved = String(out.lockResolved);
        if (!resolved.startsWith("file:") || !resolved.includes("dist/vong-19"))
            out.problems.push("lock resolved " + resolved + " does not point at dist/vong-19");
    }
    return out;
}

/** sha256 + bytes + mtime cua tep du lieu ERP THAT (chi doc). */
function erpMeta() {
    if (!fs.existsSync(ERP_TEAM)) return { exists: false };
    const stat = fs.statSync(ERP_TEAM);
    const buffer = fs.readFileSync(ERP_TEAM);
    return { exists: true, sha256: sha256(buffer), bytes: buffer.length, mtimeMs: stat.mtimeMs };
}

/** 13 tep nguon trong packages/dsh-agent-teams (A6: khong duoc doi 1 byte). */
function sourceMeta() {
    const rows = [];
    for (const [rel] of FROZEN) {
        const file = path.join(SOURCE_PKG, rel);
        if (!fs.existsSync(file)) { rows.push({ rel, missing: true }); continue; }
        const buffer = fs.readFileSync(file);
        rows.push({ rel, sha256: sha256(buffer), bytes: buffer.length });
    }
    return { rows };
}

function diffRecords(before, after, key, allowFields, perRecordAllow) {
    const problems = [];
    const left = indexBy(before, key);
    const right = indexBy(after, key);
    for (const name of left.keys()) if (!right.has(name)) problems.push(key + "=" + name + " disappeared");
    for (const name of right.keys()) if (!left.has(name)) problems.push(key + "=" + name + " appeared");
    for (const name of left.keys()) {
        if (!right.has(name)) continue;
        const l = clone(left.get(name));
        const r = clone(right.get(name));
        const drop = allowFields.slice();
        const extra = perRecordAllow === undefined ? [] : perRecordAllow(name);
        for (const field of drop.concat(extra)) { delete l[field]; delete r[field]; }
        const lk = Object.keys(l).sort().join(",");
        const rk = Object.keys(r).sort().join(",");
        if (lk !== rk) problems.push(key + "=" + name + " key set differs: [" + lk + "] vs [" + rk + "]");
        if (JSON.stringify(l) !== JSON.stringify(r)) problems.push(key + "=" + name + " values differ");
    }
    return problems;
}

/** Cham A2 tren text status that. */
function scoreStatusText(text, removedNames) {
    const lines = String(text).split(/\r?\n/);
    const checks = {};
    checks.memberHeader = text.includes("Members (7 present + 7 removed):");
    checks.removedHeader = text.includes("Removed (7):");
    checks.tasksHeader = text.includes("Tasks (107):");
    checks.legacyActiveWordingAbsent = text.includes(" active + ") === false;
    checks.legacySingleHeaderAbsent = /^Members \(\d+\):$/m.test(text) === false;
    const start = lines.findIndex((line) => line.trim() === "Removed (7):");
    const block = start < 0 ? [] : lines.slice(start + 1).filter((line) => line.startsWith("  - "));
    checks.removedLines = block.length;
    checks.namedRealRemoved = block.filter((line) => removedNames.some((name) => line.startsWith("  - " + name + " ["))).length;
    checks.routedLines = block.filter((line) => line.includes(REMOVED_ROUTE)).length;
    checks.ok = checks.memberHeader && checks.removedHeader && checks.tasksHeader && checks.legacyActiveWordingAbsent
        && checks.legacySingleHeaderAbsent && checks.removedLines >= 3 && checks.namedRealRemoved >= 3 && checks.routedLines >= 3;
    return checks;
}

/** A4 nua thu nhat: guard t103 tren BAN CAI TGZ (trong tien trinh, 0 boot). */
async function runGuard(copyWs, teamFile) {
    const membersPath = path.join(PROFILE_INSTALLED(), "lib", "members.js");
    const out = { membersPath, exists: fs.existsSync(membersPath), threw: false, message: "", exact: false, teamShaBefore: "", teamShaAfter: "" };
    if (!out.exists) { out.problems = ["installed lib/members.js is missing"]; return out; }
    const mod = await import(pathToFileURL(membersPath).href);
    if (typeof mod.setMemberRoute !== "function") { out.problems = ["installed lib/members.js does not export setMemberRoute"]; return out; }
    const captain = { session: { header: { cwd: copyWs } }, options: { provider: NEW_ROUTE.provider, model: NEW_ROUTE.model } };
    const selections = { setLiveRoute: () => false };
    out.teamShaBefore = sha256OfFile(teamFile);
    try {
        await mod.setMemberRoute({}, { stateDir: ".agent-teams" }, selections, captain, ".agent-teams", TEAM_ID, "alice",
            { provider: NEW_ROUTE.provider, model: NEW_ROUTE.model, source: "erp" }, undefined);
    } catch (error) {
        out.threw = true;
        out.message = String(error === null || error === undefined ? "" : (error.message === undefined ? error : error.message));
    }
    out.teamShaAfter = sha256OfFile(teamFile);
    out.exact = out.message === GUARD_MESSAGE;
    out.nothingWritten = out.teamShaBefore === out.teamShaAfter;
    out.ok = out.threw && out.exact && out.nothingWritten;
    out.problems = out.ok ? [] : ["threw=" + String(out.threw) + " exact=" + String(out.exact) + " nothingWritten=" + String(out.nothingWritten)];
    return out;
}

/** A3: hai phep dot bien tren BAN SAO trong tests/tmp/t126 (khong dung profile that). */
function runNegatives(runDir) {
    const negDir = path.join(runDir, "negative");
    fs.mkdirSync(negDir, { recursive: true });
    const tgzDir = path.join(negDir, "tgz-flip");
    fs.mkdirSync(tgzDir, { recursive: true });
    const tgzCopy = path.join(tgzDir, "nami-dsh-agent-teams-0.2.0-dev.0.tgz");
    fs.copyFileSync(TGZ, tgzCopy);
    const flipA = flipByte(tgzCopy, Math.floor(TGZ_BYTES / 2));
    const tgzCheck = checkArtifact(tgzCopy);
    const a = {
        copy: path.relative(REPO, tgzCopy),
        flip: flipA,
        sha: tgzCheck.sha,
        bytes: tgzCheck.bytes,
        problems: tgzCheck.problems,
        failedAsRequired: tgzCheck.ok === false && tgzCheck.problems.some((line) => line.includes("sha256")),
    };
    const instDir = path.join(negDir, "installed-flip");
    fs.rmSync(instDir, { recursive: true, force: true });
    copyTree(PROFILE_INSTALLED(), path.join(instDir, "dsh-agent-teams"));
    const flipB = flipByte(path.join(instDir, "dsh-agent-teams", "lib", "tools.js"), 4096);
    const instCheck = checkInstalledTree(path.join(instDir, "dsh-agent-teams"));
    const b = {
        copy: path.relative(REPO, instDir),
        flip: flipB,
        problems: instCheck.problems,
        failedAsRequired: instCheck.ok === false && instCheck.problems.some((line) => line.startsWith("lib/tools.js") && line.includes("sha256")),
    };
    const result = { at: new Date().toISOString(), a, b, ok: a.failedAsRequired && b.failedAsRequired };
    writeJson(path.join(runDir, "negative.json"), result);
    return result;
}

function PROFILE_INSTALLED() {
    return path.join(PROFILE_DIR_OF(), "node_modules", "@nami", "dsh-agent-teams");
}

function PROFILE_DIR_OF() {
    return path.join(CLI_HOME(), "profiles", PROFILE);
}

function CLI_HOME() {
    if (EFFECTIVE_DSH_HOME !== "") return EFFECTIVE_DSH_HOME;
    return process.env.DSH_TEST_HOME ?? path.join(process.env.USERPROFILE ?? "C:/Users/thang", ".dsh");
}

/** Chay that: A1 (kiem ban cai) + ban copy ERP + 3 boot + guard + 2 phep dot bien. */
async function runFresh(runDir, ctx) {
    fs.mkdirSync(runDir, { recursive: true });
    const copyWs = path.join(runDir, "erp-copy");
    const teamFile = path.join(copyWs, ".agent-teams", TEAM_ID, "team.json");
    const bootLog = [];
    let bootsThisInvocation = 0;
    const priorMetaPath = path.join(runDir, "run-meta.json");
    const priorBoots = fs.existsSync(priorMetaPath) ? (readJson(priorMetaPath).bootsTotalReal ?? 0) : 0;

    writeJson(path.join(runDir, "erp-meta.json"), erpMeta());
    writeJson(path.join(runDir, "source-meta.json"), sourceMeta());
    writeJson(path.join(runDir, "artifact.json"), {
        at: new Date().toISOString(),
        tgz: path.relative(REPO, TGZ),
        artifact: checkArtifact(TGZ),
        installed: checkInstalledTree(PROFILE_INSTALLED()),
        profile: profileChecks(CLI_HOME()),
    });

    fs.mkdirSync(path.dirname(teamFile), { recursive: true });
    if (!fs.existsSync(path.join(runDir, "snap-01-copy-as-copied.json"))) {
        fs.copyFileSync(ERP_TEAM, teamFile);
        writeJson(path.join(runDir, "snap-01-copy-as-copied.json"), readJson(teamFile));
    } else if (!fs.existsSync(teamFile)) {
        writeJson(teamFile, readJson(path.join(runDir, "snap-01-copy-as-copied.json")));
    }

    // boot 1 — mint mot phien de biet sessionId, roi ghi no lam captain cua BAN COPY.
    const mintOut = path.join(runDir, "boot-mint.stdout.txt");
    if (!fs.existsSync(mintOut)) {
        const mint = runBoot({ label: "mint", cwd: copyWs, cli: ctx.cli, prompt: "Khong goi tool nao. Tra loi dung mot dong: OK" });
        bootsThisInvocation += 1;
        writeText(mintOut, mint.stdout);
        writeText(path.join(runDir, "boot-mint.stderr.txt"), mint.stderr);
        writeJson(path.join(runDir, "boot-mint.meta.json"), { exitCode: mint.exitCode, ms: mint.ms, cwd: mint.cwd, args: mint.args, prompt: mint.prompt });
        bootLog.push({ label: "mint", exitCode: mint.exitCode, ms: mint.ms, fresh: true });
    }
    const mintEvents = parseEvents(fs.readFileSync(mintOut, "utf8"));
    const sessionId = sessionIdOf(mintEvents);
    if (sessionId === undefined) throw new Error("boot mint did not report a sessionId — run dir giu nguyen de chan doan");
    writeText(path.join(runDir, "session-id.txt"), sessionId + "\n");
    const bound = readJson(path.join(runDir, "snap-01-copy-as-copied.json"));
    bound.captainSessionId = sessionId;
    writeJson(path.join(runDir, "case-01-bound.json"), bound);
    writeJson(teamFile, bound);

    // boot 2 — status that tren BAN COPY (A2).
    const statusOut = path.join(runDir, "boot-status.stdout.txt");
    if (!fs.existsSync(statusOut)) {
        const status = runBoot({ label: "status", cwd: copyWs, cli: ctx.cli, sessionId, prompt: "Goi tool agent_teams_status mot lan, roi dan nguyen van ket qua, khong tom tat." });
        bootsThisInvocation += 1;
        writeText(statusOut, status.stdout);
        writeText(path.join(runDir, "boot-status.stderr.txt"), status.stderr);
        writeJson(path.join(runDir, "boot-status.meta.json"), { exitCode: status.exitCode, ms: status.ms, cwd: status.cwd, args: status.args, prompt: status.prompt });
        bootLog.push({ label: "status", exitCode: status.exitCode, ms: status.ms, fresh: true });
    }

    // boot 3 — set_member_route that qua tool tren BAN COPY (A4 nua thu hai).
    const afterRoute = path.join(runDir, "snap-03-after-route.json");
    if (!fs.existsSync(afterRoute)) {
        writeJson(path.join(runDir, "snap-02-before-route.json"), readJson(teamFile));
        const routePrompt = "Goi tool agent_teams_set_member_route voi member_name ha-tang-2, provider command-code-goat, model deepseek/deepseek-v4-pro, reasoning_effort high. Chi goi mot lan, roi tra loi ngan.";
        const route = runBoot({ label: "route", cwd: copyWs, cli: ctx.cli, sessionId, prompt: routePrompt });
        bootsThisInvocation += 1;
        writeText(path.join(runDir, "boot-route.stdout.txt"), route.stdout);
        writeText(path.join(runDir, "boot-route.stderr.txt"), route.stderr);
        writeJson(path.join(runDir, "boot-route.meta.json"), { exitCode: route.exitCode, ms: route.ms, cwd: route.cwd, args: route.args, prompt: route.prompt });
        bootLog.push({ label: "route", exitCode: route.exitCode, ms: route.ms, fresh: true });
        writeJson(afterRoute, readJson(teamFile));
    }

    writeJson(path.join(runDir, "guard.json"), await runGuard(copyWs, teamFile));
    runNegatives(runDir);

    writeJson(priorMetaPath, {
        at: new Date().toISOString(),
        runDir: path.relative(REPO, runDir),
        profile: PROFILE,
        bootsThisInvocation,
        bootsPrior: priorBoots,
        bootsTotalReal: priorBoots + bootsThisInvocation,
        bootLog,
    });
    return { runDir, bootsThisInvocation };
}

function pickKey(list, names) {
    const first = list === undefined || list.length === 0 ? undefined : list[0];
    if (first === undefined) return names[0];
    for (const name of names) if (Object.prototype.hasOwnProperty.call(first, name)) return name;
    return names[0];
}

function resolveRunDir(target) {
    if (!fs.existsSync(target)) throw new Error("run dir not found: " + target);
    if (fs.existsSync(path.join(target, "run-meta.json"))) return target;
    const runs = fs.readdirSync(target).filter((name) => name.startsWith("run-")).sort();
    if (runs.length === 0) throw new Error("no run-* directory inside " + target);
    return path.join(target, runs[runs.length - 1]);
}

function liveStatusText(runDir, dshHome) {
    const out = path.join(runDir, "boot-status.stdout.txt");
    if (fs.existsSync(out)) {
        const pairs = toolPairs(parseEvents(fs.readFileSync(out, "utf8")));
        for (const pair of pairs) {
            if (pair.name !== "agent_teams_status") continue;
            if (pair.text.includes("Members (") && pair.text.includes("Tasks (")) return { text: pair.text, source: "boot-status stream", truncated: pair.truncated };
        }
    }
    const sidFile = path.join(runDir, "session-id.txt");
    if (fs.existsSync(sidFile)) {
        const sessionId = fs.readFileSync(sidFile, "utf8").trim();
        const transcript = findSessionTranscript(dshHome, sessionId);
        if (transcript !== undefined) {
            const render = extractStatusRender(transcript);
            if (render.length > 0) return { text: render, source: "transcript render (moi nhat)", truncated: false };
        }
    }
    return { text: "", source: "none", truncated: false };
}

/** Cham A1..A6 (fresh) hoac A1..A8 (analyze) tu artifact + so do live. */
function evaluate(runDir, mode) {
    const results = [];
    const dshHome = CLI_HOME();
    const ctx = {};

    // A1
    const artifact = checkArtifact(TGZ);
    const installed = checkInstalledTree(PROFILE_INSTALLED());
    const profile = profileChecks(dshHome);
    const a1Problems = artifact.problems.concat(installed.problems, profile.problems);
    results.push({
        id: "A1", title: "cai tu tgz phat hanh vao profile moi, 13 tep ban cai khop bang dong bang",
        passed: a1Problems.length === 0,
        detail: [
            "tgz " + path.relative(REPO, TGZ) + " sha256=" + artifact.sha + " bytes=" + artifact.bytes + " (pinned " + TGZ_SHA.slice(0, 16) + "/" + TGZ_BYTES + ")",
            "profile " + profile.dir + " isSymlink=" + String(profile.isSymlink) + " version=" + String(profile.version) + " lockResolved=" + String(profile.lockResolved),
            "compared " + installed.comparedFiles + "/" + FROZEN.length + " installed files",
        ].concat(installed.rows.map((row) => "  " + (row.ok ? "OK " : "BAD") + " " + row.rel + " " + String(row.sha).slice(0, 16) + " " + row.bytes)),
        problems: a1Problems,
    });

    // A2
    const snap1 = readJson(path.join(runDir, "snap-01-copy-as-copied.json"));
    const removedNames = snap1.members.filter((member) => member.status === "removed").map((member) => member.name);
    const status = liveStatusText(runDir, dshHome);
    const statusScore = scoreStatusText(status.text, removedNames);
    results.push({
        id: "A2", title: "boot that tren BAN COPY in dung 2 tieu de + >=3 dong ho so removed that",
        passed: statusScore.ok,
        detail: [
            "nguon text: " + status.source + " (truncated=" + String(status.truncated) + ", " + status.text.length + " ky tu)",
            "Members (7 present + 7 removed): " + String(statusScore.memberHeader) + " · Removed (7): " + String(statusScore.removedHeader)
                + " · Tasks (107): " + String(statusScore.tasksHeader),
            "dong removed=" + statusScore.removedLines + " · ten THAT=" + statusScore.namedRealRemoved + " · co route " + REMOVED_ROUTE + "=" + statusScore.routedLines,
            "chu cu vang mat: active-removed=" + String(statusScore.legacyActiveWordingAbsent) + " single-count=" + String(statusScore.legacySingleHeaderAbsent),
        ],
        problems: statusScore.ok ? [] : ["status text khong dat day du phep do (xem chi tiet ben tren)"],
    });

    // A3
    const negFile = path.join(runDir, "negative.json");
    const negative = fs.existsSync(negFile) ? readJson(negFile) : undefined;
    results.push({
        id: "A3", title: "doi chung am tren BAN SAO: lat 1 byte tgz va lat 1 byte ban da cai deu FAIL dung cho",
        passed: negative !== undefined && negative.ok === true,
        detail: negative === undefined ? ["negative.json chua co (chay --negative)"] : [
            "(a) " + negative.a.copy + " flip@offset " + negative.a.flip.offset + " sha=" + String(negative.a.sha).slice(0, 16) + " bytes=" + negative.a.bytes + " => " + negative.a.problems.join("; "),
            "(b) " + negative.b.copy + " flip@offset " + negative.b.flip.offset + " => " + negative.b.problems.slice(0, 2).join("; "),
        ],
        problems: negative !== undefined && negative.ok === true ? [] : ["mot trong hai phep dot bien khong bi bat"],
    });

    // A4
    const guardFile = path.join(runDir, "guard.json");
    const guard = fs.existsSync(guardFile) ? readJson(guardFile) : undefined;
    const beforeRoute = readJson(path.join(runDir, "snap-02-before-route.json"));
    const afterRoute = readJson(path.join(runDir, "snap-03-after-route.json"));
    const taskKey = pickKey(afterRoute.tasks, ["id", "task_id"]);
    const memberProblems = diffRecords(beforeRoute.members, afterRoute.members, "name", VOLATILE_MEMBER_FIELDS,
        (name) => (name === ROUTE_MEMBER ? ["routeOverride"] : []));
    const taskProblems = diffRecords(beforeRoute.tasks, afterRoute.tasks, taskKey, VOLATILE_TASK_FIELDS, () => []);
    const rerouted = afterRoute.members.find((member) => member.name === ROUTE_MEMBER);
    const route = rerouted === undefined ? undefined : rerouted.routeOverride;
    const routeOk = route !== undefined && route.provider === NEW_ROUTE.provider && route.model === NEW_ROUTE.model
        && route.reasoningEffort === NEW_ROUTE.effort && route.source === "captain" && typeof route.at === "number";
    const routePairs = fs.existsSync(path.join(runDir, "boot-route.stdout.txt"))
        ? toolPairs(parseEvents(fs.readFileSync(path.join(runDir, "boot-route.stdout.txt"), "utf8"))) : [];
    const routePair = routePairs.find((pair) => pair.name === "agent_teams_set_member_route");
    const routeTextOk = routePair !== undefined
        && routePair.text.includes("is now " + NEW_ROUTE.provider + "/" + NEW_ROUTE.model)
        && routePair.text.includes("reasoning " + NEW_ROUTE.effort);
    const a4Problems = [];
    if (guard === undefined || guard.ok !== true) a4Problems.push("guard t103 khong dat (xem guard.json)");
    if (memberProblems.length > 0) a4Problems.push("members khac ngoai 2 truong runtime: " + memberProblems.slice(0, 2).join(" | "));
    if (taskProblems.length > 0) a4Problems.push("tasks khac ngoai truong runtime: " + taskProblems.slice(0, 2).join(" | "));
    if (routeOk !== true) a4Problems.push("routeOverride tren ban copy khong dung: " + JSON.stringify(route));
    if (routeTextOk !== true) a4Problems.push("text tool set_member_route khong xac nhan route moi");
    results.push({
        id: "A4", title: "guard t103 tren ban cai tgz + 1 lan set hop le ghi ben (source captain) khong mat du lieu",
        passed: a4Problems.length === 0,
        detail: [
            "guard message khop nguyen van=" + String(guard === undefined ? "?" : guard.exact) + " · khong ghi byte nao=" + String(guard === undefined ? "?" : guard.nothingWritten),
            "set_member_route tool text: " + String(routePair === undefined ? "(khong co)" : routePair.text.replace(/\s+/g, " ").slice(0, 180)),
            "routeOverride tren BAN COPY: " + JSON.stringify(route),
            "deep-equal: members=" + memberProblems.length + " problem · tasks=" + taskProblems.length + " problem (14 member / " + afterRoute.tasks.length + " task)",
        ],
        problems: a4Problems,
    });

    // A5
    const erpRecorded = readJson(path.join(runDir, "erp-meta.json"));
    const erpNow = erpMeta();
    const a5Ok = erpRecorded.sha256 === erpNow.sha256 && erpRecorded.bytes === erpNow.bytes && erpRecorded.mtimeMs === erpNow.mtimeMs
        && erpRecorded.sha256 === ERP_SHA && erpRecorded.bytes === ERP_BYTES;
    results.push({
        id: "A5", title: "tep ERP that khong bi dung toi (sha256 / bytes / mtime giu nguyen)",
        passed: a5Ok,
        detail: ["luc chay: " + erpRecorded.sha256 + " " + erpRecorded.bytes + " B mtimeMs=" + erpRecorded.mtimeMs,
            "bay gio: " + erpNow.sha256 + " " + erpNow.bytes + " B mtimeMs=" + erpNow.mtimeMs],
        problems: a5Ok ? [] : ["tep ERP goc da bi thay doi"],
    });

    // A6
    const sourceRecorded = readJson(path.join(runDir, "source-meta.json"));
    const sourceNow = sourceMeta();
    const a6Problems = [];
    for (let i = 0; i < sourceRecorded.rows.length; i += 1) {
        const left = sourceRecorded.rows[i];
        const right = sourceNow.rows[i];
        if (left.sha256 !== right.sha256 || left.bytes !== right.bytes) a6Problems.push(left.rel + " changed during the run");
    }
    const sourceMatchesFrozen = FROZEN.filter(([rel, hex]) => {
        const row = sourceNow.rows.find((candidate) => candidate.rel === rel);
        return row !== undefined && typeof row.sha256 === "string" && row.sha256.startsWith(hex);
    }).length;
    results.push({
        id: "A6", title: "nguon packages/dsh-agent-teams khong doi 1 byte trong luc chay",
        passed: a6Problems.length === 0,
        detail: ["so tep giam sat: " + sourceNow.rows.length + " · khop bang dong bang (thong tin): " + sourceMatchesFrozen + "/" + FROZEN.length],
        problems: a6Problems,
    });

    // A7 + A8 chi co nghia khi chay --analyze.
    const markerFile = path.join(runDir, "analyze.marker.json");
    const marker = fs.existsSync(markerFile) ? readJson(markerFile) : undefined;
    const runMeta = readJson(path.join(runDir, "run-meta.json"));
    results.push({
        id: "A7", title: "suite co --analyze (0 boot) va --negative (dung 2 phep A3), analyze tren artifact cua minh EXIT 0",
        passed: mode === "analyze" && marker !== undefined && marker.bootsThisInvocation === 0
            && negative !== undefined && negative.ok === true && runMeta.bootsTotalReal <= BUDGET.boots,
        detail: ["analyze marker: " + (marker === undefined ? "chua co" : "bootsThisInvocation=" + marker.bootsThisInvocation)
            + " · negative.ok=" + String(negative === undefined ? "?" : negative.ok)
            + " · boot that da dung=" + runMeta.bootsTotalReal + "/" + BUDGET.boots],
        problems: [],
    });
    const docFile = path.join(REPO, "docs", "kiem-thu", "t126-released-bytes.md");
    const docText = fs.existsSync(docFile) ? fs.readFileSync(docFile, "utf8") : "";
    const docTokens = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"].filter((token) => docText.includes(token));
    results.push({
        id: "A8", title: "doc ghi so do + gioi han",
        passed: docTokens.length === 8 && (docText.includes("Giới hạn") || docText.includes("Gioi han")),
        detail: ["doc " + path.relative(REPO, docFile) + " " + docText.length + " ky tu · token A1..A8: " + docTokens.length + "/8"],
        problems: docTokens.length === 8 ? [] : ["doc thieu muc " + ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"].filter((token) => !docText.includes(token)).join(",")],
    });
    return { results, ctx };
}

function report(runDir, mode) {
    const { results } = evaluate(runDir, mode);
    const scope = mode === "analyze" ? results : results.filter((item) => Number(item.id.slice(1)) <= 6);
    for (const item of scope) {
        console.log("");
        console.log("# " + item.id + " " + item.title);
        console.log("  " + (item.passed ? "PASS" : "FAIL"));
        for (const line of item.detail) console.log("  " + line);
        for (const line of item.problems) console.log("  ! " + line);
    }
    const proved = scope.filter((item) => item.passed).map((item) => item.id);
    const unproved = scope.filter((item) => item.passed === false).map((item) => item.id);
    console.log("");
    if (mode !== "analyze") console.log("A7/A8 chi cham trong che do --analyze (chay: node tests/t126-released-bytes-boot.mjs --analyze tests/tmp/t126).");
    console.log("verdict " + (unproved.length === 0 ? "PASS" : "FAIL") + " — proved " + (proved.length === 0 ? "(none)" : proved.join(","))
        + " — unproved " + (unproved.length === 0 ? "(none)" : unproved.join(",")));
    writeJson(path.join(runDir, "analysis.json"), { at: new Date().toISOString(), mode, results, proved, unproved });
    return unproved.length === 0;
}

async function main() {
    const argv = process.argv.slice(2);
    const value = (flag) => {
        const index = argv.indexOf(flag);
        if (index < 0) return undefined;
        const next = argv[index + 1];
        return next === undefined || next.startsWith("--") ? undefined : next;
    };
    const mode = argv.includes("--analyze") ? "analyze" : (argv.includes("--negative") ? "negative" : "fresh");
    const target = value("--analyze") ?? value("--negative") ?? WORK;
    const ctx = await loadCli();
    EFFECTIVE_DSH_HOME = ctx.dshHome;
    if (mode === "fresh") {
        const runDir = value("--run-dir") ?? path.join(WORK, "run-" + stampOf(new Date()));
        const info = await runFresh(runDir, ctx);
        console.log("run dir: " + path.relative(REPO, info.runDir) + " · boot that trong lan nay: " + info.bootsThisInvocation);
        process.exit(report(info.runDir, "fresh") ? 0 : 1);
    }
    const runDir = resolveRunDir(target);
    if (mode === "negative") {
        const result = runNegatives(runDir);
        console.log("negative ok=" + String(result.ok) + "\n  (a) " + result.a.problems.join("; ") + "\n  (b) " + result.b.problems.slice(0, 2).join("; "));
        process.exit(result.ok ? 0 : 1);
    }
    writeJson(path.join(runDir, "analyze.marker.json"), { at: new Date().toISOString(), bootsThisInvocation: 0, argv: argv.slice() });
    console.log("analyze: " + path.relative(REPO, runDir) + " (0 boot, chi doc artifact)");
    process.exit(report(runDir, "analyze") ? 0 : 1);
}

let EFFECTIVE_DSH_HOME = "";

main().catch((error) => {
    console.log("SUITE ERROR: " + String(error === null || error === undefined ? "" : (error.stack === undefined ? error : error.stack)));
    process.exit(2);
});
