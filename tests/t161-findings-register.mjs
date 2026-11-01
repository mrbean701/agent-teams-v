#!/usr/bin/env node
// t161/t162 — cổng sổ đăng ký finding: chứng minh sổ KHỚP tài liệu + nguồn báo cáo luật chặt + các đối chứng âm đều đỏ.
// Chạy trên BẢN SAO trong tests/tmp/t161/cases (không sửa sổ thật). Run: node tests/t161-findings-register.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const TOOL = path.join(REPO, "tools", "check-findings.mjs");
const AUDIT_DIR = path.join(REPO, "docs", "audit");
const REAL_REGISTER = path.join(AUDIT_DIR, "findings-register.md");
const REAL_LOG = path.join(REPO, "docs", "log", "AUDIT.md");
const REAL_REPORT = path.join(REPO, "docs", "bao-cao-agent-teams.md");
const TMP = path.join(REPO, "tests", "tmp", "t161", "cases");

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const run = (args) => { const r = spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8", cwd: REPO, timeout: 120000 }); return { code: r.status, out: (r.stdout || "") + (r.stderr || ""), stdout: r.stdout || "" }; };
const freshRoot = (label) => {
  const root = path.join(TMP, label);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "docs", "audit"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs", "log"), { recursive: true });
  for (const name of fs.readdirSync(AUDIT_DIR)) if (/^closure.*\.md$/u.test(name)) fs.copyFileSync(path.join(AUDIT_DIR, name), path.join(root, "docs", "audit", name));
  fs.copyFileSync(REAL_REGISTER, path.join(root, "docs", "audit", "findings-register.md"));
  fs.copyFileSync(REAL_LOG, path.join(root, "docs", "log", "AUDIT.md"));
  fs.copyFileSync(REAL_REPORT, path.join(root, "docs", "bao-cao-agent-teams.md"));
  return root;
};
const regPath = (root) => path.join(root, "docs", "audit", "findings-register.md");
const reportPath = (root) => path.join(root, "docs", "bao-cao-agent-teams.md");
const linesOf = (root) => fs.readFileSync(regPath(root), "utf8").split(/\r?\n/u);
const save = (root, lines) => fs.writeFileSync(regPath(root), lines.join("\n"));
const isRow = (line) => /^\|\s*(?:V\d+|VB)-F\d+\s*\|/u.test(line.trim());
const cells = (line) => line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((c) => c.trim());
const mapRows = (lines, fn) => lines.map((line) => (isRow(line) ? fn(line) : line));
const dump = (c) => "| " + c.join(" | ") + " |";

test("a1 the real register is green and covers the whole history", () => {
  const r = run([]);
  assert.equal(r.code, 0, "gate must exit 0: " + r.out.slice(-500));
  const m = /SUMMARY idsInClosures=(\d+) idsInAuditLog=(\d+) idsOnlyInAuditLog=(\d+) unionTotal=(\d+) rows=(\d+) missing=(\d+) extra=(\d+) duplicates=(\d+) badStatus=(\d+)/u.exec(r.out);
  assert.ok(m, "SUMMARY must carry the required counters");
  assert.equal(m[6], "0"); assert.equal(m[7], "0"); assert.equal(m[8], "0"); assert.equal(m[9], "0");
  assert.equal(m[4], m[5], "unionTotal == rows");
  assert.match(r.out, /missingInClosures=0 missingInAuditLog=0/u);
  assert.ok(Number(m[4]) > 100, "union covers the whole audit history: " + m[4]);
});

test("a2 both sources are read: 11 ids are auditlog-only (V22-F0 + V3-F1..F6 + V5-F1..F4)", () => {
  const p = JSON.parse(run(["--json"]).stdout);
  assert.equal(p.ok, true);
  assert.equal(p.unionTotal, p.rows);
  assert.equal(p.idsOnlyInAuditLogCount, 11);
  assert.ok(p.idsInClosures > 100 && p.idsInAuditLog > 100);
  assert.equal(p.closed + p.open + p.accepted + p.superseded, p.rows);
});

test("a3 --json is valid JSON with the same numbers as SUMMARY", () => {
  const p = JSON.parse(run(["--json"]).stdout);
  const m = /unionTotal=(\d+) rows=(\d+)/u.exec(run([]).out);
  assert.equal(String(p.unionTotal), m[1]); assert.equal(String(p.rows), m[2]); assert.equal(p.problems, 0);
  assert.ok(Array.isArray(p.missing) && Array.isArray(p.extra));
});

test("a4 --strict blocks while OPEN rows remain, and an all-closed copy passes", () => {
  const strict = run(["--strict"]);
  assert.equal(strict.code, 1); assert.match(strict.out, /STRICT-BLOCK open=\d+/u);
  const root = freshRoot("all-closed");
  save(root, mapRows(linesOf(root), (line) => { const c = cells(line); if (c[4] !== "OPEN") return line; c[4] = "CLOSED"; c[5] = "t000"; c[6] = "docs/audit/findings-register.md:1"; return dump(c); }));
  const green = run(["--strict", "--root", root]);
  assert.equal(green.code, 0, "all-closed copy must pass --strict: " + green.out.slice(-300));
});

test("a5 NEGATIVE missing row: deleting a row fails exit 1 and names the id", () => {
  const root = freshRoot("missing-row");
  const lines = linesOf(root);
  const idx = lines.findIndex((line) => isRow(line));
  const victim = cells(lines[idx])[0];
  lines.splice(idx, 1); save(root, lines);
  const r = run(["--root", root]);
  assert.equal(r.code, 1);
  assert.ok(r.out.includes("MISSING"), "must print MISSING: " + r.out.slice(0, 300));
  assert.ok(r.out.includes(victim), "must name " + victim);
});

test("a6 NEGATIVE extra id: a row the docs never mention fails exit 1", () => {
  const root = freshRoot("extra-row");
  const lines = linesOf(root);
  lines.push("| V99-F1 | 99 | low | fake row injected by t161 | OPEN | — | không tìm thấy bằng chứng đóng | closure |");
  save(root, lines);
  const r = run(["--root", root]);
  assert.equal(r.code, 1); assert.match(r.out, /EXTRA \(in register, not in docs\): V99-F1/u);
});

test("a7 NEGATIVE CLOSED without evidence: blank bằng chứng fails exit 1", () => {
  const root = freshRoot("closed-no-evidence");
  save(root, mapRows(linesOf(root), (line) => { const c = cells(line); if (c[4] !== "CLOSED") return line; c[6] = ""; return dump(c); }));
  const r = run(["--root", root]);
  assert.equal(r.code, 1); assert.match(r.out, /CLOSED WITHOUT /u);
});

test("a8 NEGATIVE bad status: REVIEW is not one of the four allowed values", () => {
  const root = freshRoot("bad-status");
  save(root, mapRows(linesOf(root), (line) => { const c = cells(line); c[4] = "REVIEW"; return dump(c); }));
  const r = run(["--root", root]);
  assert.equal(r.code, 1); assert.match(r.out, /BAD STATUS: (?:V\d+|VB)-F\d+ = REVIEW/u);
});

test("a9 NEGATIVE duplicate row: the same id twice fails exit 1", () => {
  const root = freshRoot("duplicate-row");
  const lines = linesOf(root);
  lines.push(lines.find((line) => isRow(line))); save(root, lines);
  const r = run(["--root", root]);
  assert.equal(r.code, 1); assert.match(r.out, /DUPLICATE: (?:V\d+|VB)-F\d+ x2/u);
});

test("a10 NEGATIVE bad columns: a 7-cell row fails exit 1", () => {
  const root = freshRoot("bad-columns");
  save(root, mapRows(linesOf(root), (line) => { const c = cells(line); c.pop(); return dump(c); }));
  const r = run(["--root", root]);
  assert.equal(r.code, 1); assert.match(r.out, /ROW PROBLEM \(badColumns\): expected 8 columns, got 7/u);
});

test("a11 NEGATIVE bad source: nguồn must be closure / auditlog / cả hai", () => {
  const root = freshRoot("bad-source");
  save(root, mapRows(linesOf(root), (line) => { const c = cells(line); c[7] = "unknown"; return dump(c); }));
  const r = run(["--root", root]);
  assert.equal(r.code, 1); assert.match(r.out, /BAD SOURCE: /u);
});

test("a12 GATE BROKEN: unknown CLI flag exits 2", () => {
  const r = run(["--nope"]);
  assert.equal(r.code, 2); assert.match(r.out, /GATE ERROR: unknown argument: --nope/u);
});

test("a13 GATE BROKEN: missing register exits 2", () => {
  const root = freshRoot("no-register");
  fs.rmSync(regPath(root));
  const r = run(["--root", root]);
  assert.equal(r.code, 2); assert.match(r.out, /GATE ERROR: register not found/u);
});

test("a14 GATE BROKEN: a corpus with no finding id exits 2", () => {
  const root = freshRoot("empty-corpus");
  for (const name of fs.readdirSync(path.join(root, "docs", "audit"))) if (/^closure.*\.md$/u.test(name)) fs.writeFileSync(path.join(root, "docs", "audit", name), "# empty\n");
  fs.writeFileSync(path.join(root, "docs", "log", "AUDIT.md"), "# empty\n");
  const r = run(["--root", root]);
  assert.equal(r.code, 2); assert.match(r.out, /GATE ERROR: the docs corpus yielded no finding id at all/u);
});

test("a15 the register states its own limit (agreement, not content)", () => {
  const text = fs.readFileSync(REAL_REGISTER, "utf8");
  assert.match(text, /sổ KHỚP TÀI LIỆU/u);
  assert.match(text, /KHÔNG.*chứng minh nội dung từng hàng đúng/u);
  assert.match(text, /captain spot-check/u);
});

test("a16 the register opens with 'Đọc sổ này thế nào' and states what OPEN means", () => {
  const lines = fs.readFileSync(REAL_REGISTER, "utf8").split(/\r?\n/u);
  const title = lines.findIndex((line) => /^#\s+/u.test(line));
  const head = lines.findIndex((line) => /^##\s+Đọc sổ này thế nào\s*$/u.test(line));
  const table = lines.findIndex((line) => /^\|\s*id\s*\|/u.test(line.trim()));
  assert.equal(title, 0, "the title must be line 1, got " + title);
  assert.ok(head > title && head < table, "the section must sit between the title and the table");
  assert.equal(lines.slice(title + 1, head).filter((line) => /^##\s+/u.test(line)).length, 0, "no other heading may come first");
  const section = lines.slice(head, table).join("\n");
  assert.ok(section.includes("OPEN = chưa có câu ghi nhận đóng trong tài liệu, KHÔNG phải lỗi còn tồn tại"), "must state the OPEN meaning verbatim");
  for (const status of ["CLOSED", "OPEN", "ACCEPTED", "SUPERSEDED"]) assert.ok(section.includes(status), "must define " + status);
  assert.match(section, /Số liệu hiện tại: \*\*\d+\*\* hàng/u, "must carry the current counts");
});

test("a17 every OPEN row carries the honest suffix (no row claims a closure it lacks)", () => {
  const rows = fs.readFileSync(REAL_REGISTER, "utf8").split(/\r?\n/u).filter(isRow).map(cells);
  const open = rows.filter((c) => c[4] === "OPEN");
  assert.ok(open.length > 0, "the history still has OPEN rows");
  for (const c of open) assert.ok(c[6].includes("(không có câu đóng trong tài liệu)"), c[0] + " must carry the suffix: " + c[6]);
  assert.ok(open.every((c) => !c[6].startsWith("không tìm thấy bằng chứng đóng |")), "the old wording must be gone");
});

test("a18 POSITIVE report source: a short CLOSED line turns an OPEN row red", () => {
  const root = freshRoot("report-positive");
  fs.appendFileSync(reportPath(root), "\n- V19-F1 CLOSED (t123) — synthetic control line for the t162 gate.\n");
  const r = run(["--root", root]);
  assert.equal(r.code, 1, "the gate must read the new source: " + r.out.slice(0, 400));
  assert.match(r.out, /REPORT CLOSED-SENTENCE NOT HONOURED: V19-F1 is OPEN/u);
  const p = JSON.parse(run(["--root", root, "--json"]).stdout);
  assert.equal(p.idsWithClosureSentenceReport, 3, "two real sentences + the injected one");
  assert.ok(p.reportNotClosed.some((bad) => bad.id === "V19-F1"));
});

test("a19 NEGATIVE long line: >400 chars that only names an id is NOT a closure", () => {
  const root = freshRoot("report-too-long");
  const long = "- V19-F1 CLOSED (t123) — " + "x".repeat(420);
  assert.ok(long.length > 400, "control line must exceed the 400-char rule: " + long.length);
  fs.appendFileSync(reportPath(root), "\n" + long + "\n");
  const r = run(["--root", root]);
  assert.equal(r.code, 0, "a >400-char line must never count as a closure sentence: " + r.out.slice(-400));
  const p = JSON.parse(run(["--root", root, "--json"]).stdout);
  assert.equal(p.idsWithClosureSentenceReport, 2, "only the two short lines count");
});

test("a20 NEGATIVE missing section: deleting 'Đọc sổ này thế nào' turns the gate red", () => {
  const root = freshRoot("no-howto");
  const lines = linesOf(root);
  const start = lines.findIndex((line) => /^##\s+Đọc sổ này thế nào\s*$/u.test(line));
  assert.ok(start > 0, "the real register has the section");
  const end = lines.findIndex((line, i) => i > start && /^##\s+/u.test(line));
  assert.ok(end > start, "the section ends at the next heading");
  lines.splice(start, end - start); save(root, lines);
  const r = run(["--root", root]);
  assert.equal(r.code, 1);
  assert.match(r.out, /HOW TO READ \(howToRead\): missing section/u);
});

const results = [];
for (const c of cases) { try { await c.fn(); results.push({ name: c.name, ok: true }); } catch (e) { results.push({ name: c.name, ok: false, error: e && e.message ? e.message : String(e) }); } }
for (const r of results) console.log((r.ok ? "PASS " : "FAIL ") + r.name + (r.ok ? "" : " :: " + r.error));
const failed = results.filter((r) => !r.ok).length;
console.log("# " + (results.length - failed) + "/" + results.length + " passed, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);