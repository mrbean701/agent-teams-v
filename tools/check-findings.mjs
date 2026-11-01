#!/usr/bin/env node
// tools/check-findings.mjs — cổng kiểm SỔ ĐĂNG KÝ FINDING (docs/audit/findings-register.md).
//
// Nguồn id (theo card t161): HỢP của `docs/audit/closure*.md` và `docs/log/AUDIT.md`,
// quét bằng regex \b(?:V\d+|VB)-F\d+\b. Sổ phải có ĐÚNG một hàng cho mỗi id, đủ 8 cột,
// trạng thái hợp lệ, và mọi hàng CLOSED phải có `đóng bởi` + `bằng chứng` khác rỗng.
//
// Exit: 0 = xanh · 1 = vi phạm · 2 = cổng hỏng (thiếu tệp / không quét được id / CLI sai).
// Nguồn thứ ba (card t162): `docs/bao-cao-agent-teams.md` với LUẬT CHẶT — một id chỉ được coi là
// CÓ CÂU ĐÓNG khi TRÊN CÙNG MỘT DÒNG có (a) chính id, (b) từ khoá đóng (CLOSED / ĐÃ ĐÓNG / đã đóng /
// đã vá và đã phát hành), (c) dòng NGẮN hơn 400 ký tự. Dòng ≥400 ký tự KHÔNG tính (lưới chống
// CLOSED giả kiểu ô bảng nhồi nhiều id). Mọi id có câu đóng hợp lệ phải CLOSED và cột bằng chứng
// phải trích nguyên văn câu đó kèm con trỏ docs/bao-cao-agent-teams.md:<dòng>.
//
// Cờ: --report (mặc định) · --strict (OPEN > 0 ⇒ exit 1) · --json · --root · --register · --audit-log
//     · --closure-dir · --report-file
//
// GIỚI HẠN: cổng chỉ chứng minh SỔ KHỚP TÀI LIỆU (tập id, cột, trạng thái, bằng chứng khác rỗng).
// Nó KHÔNG chứng minh nội dung từng hàng đúng, và không chứng minh hàng CLOSED thực sự đã đóng.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "..");
const ID_RE = /\b(?:V\d+|VB)-F\d+\b/gu;
const STATUSES = new Set(["CLOSED", "OPEN", "ACCEPTED", "SUPERSEDED"]);
const SOURCES = new Set(["closure", "auditlog", "cả hai"]);
const COLUMNS = ["id", "vòng", "severity", "vấn đề", "trạng thái", "đóng bởi", "bằng chứng", "nguồn"];
const REPORT_REL = "docs/bao-cao-agent-teams.md";
const CLOSE_WINDOW = 80; // luật KHOẢNG CÁCH (t163): từ khoá đóng phải nằm trong 80 ký tự NGAY SAU id
const CLOSE_STRICT = /(?:CLOSED|ĐÃ ĐÓNG|đã đóng|đã vá và đã phát hành)/u;
const OPEN_SUFFIX = "(không có câu đóng trong tài liệu)";
const OPEN_SENTENCE = "OPEN = chưa có câu ghi nhận đóng trong tài liệu, KHÔNG phải lỗi còn tồn tại";
const HOWTO_HEADING = /^##\s+Đọc sổ này thế nào\s*$/u;

function die(message, detail) {
  console.error("GATE ERROR: " + message);
  if (detail !== undefined) console.error(detail);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = { mode: "report", json: false, root: DEFAULT_ROOT, register: null, auditLog: null, closureDir: null, reportFile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--report") { opts.mode = "report"; continue; }
    if (arg === "--strict") { opts.mode = "strict"; continue; }
    if (arg === "--json") { opts.json = true; continue; }
    if (arg === "--root" || arg === "--register" || arg === "--audit-log" || arg === "--closure-dir" || arg === "--report-file") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) die("missing value for " + arg);
      if (arg === "--root") opts.root = path.resolve(value);
      if (arg === "--register") opts.register = path.resolve(value);
      if (arg === "--audit-log") opts.auditLog = path.resolve(value);
      if (arg === "--closure-dir") opts.closureDir = path.resolve(value);
      if (arg === "--report-file") opts.reportFile = path.resolve(value);
      i += 1;
      continue;
    }
    die("unknown argument: " + arg + " (allowed: --report, --strict, --json, --root, --register, --audit-log, --closure-dir, --report-file)");
  }
  opts.register = opts.register || path.join(opts.root, "docs", "audit", "findings-register.md");
  opts.auditLog = opts.auditLog || path.join(opts.root, "docs", "log", "AUDIT.md");
  opts.closureDir = opts.closureDir || path.join(opts.root, "docs", "audit");
  opts.reportFile = opts.reportFile || path.join(opts.root, ...REPORT_REL.split("/"));
  return opts;
}

function collectIds(filePath, into) {
  const text = fs.readFileSync(filePath, "utf8");
  const found = text.match(ID_RE);
  const ids = found === null ? [] : [...new Set(found)];
  for (const id of ids) into.add(id);
  return ids.length;
}

function scanDocs(opts) {
  if (!fs.existsSync(opts.closureDir)) die("closure directory not found: " + opts.closureDir);
  const closureFiles = fs.readdirSync(opts.closureDir).filter((name) => /^closure.*\.md$/u.test(name)).sort();
  if (closureFiles.length === 0) die("no closure*.md found under " + opts.closureDir);
  const closureIds = new Set();
  for (const name of closureFiles) collectIds(path.join(opts.closureDir, name), closureIds);
  if (!fs.existsSync(opts.auditLog)) die("audit log not found: " + opts.auditLog);
  const logIds = new Set();
  collectIds(opts.auditLog, logIds);
  if (closureIds.size === 0 && logIds.size === 0) die("the docs corpus yielded no finding id at all");
  const union = new Set([...closureIds, ...logIds]);
  const onlyLog = [...logIds].filter((id) => !closureIds.has(id)).sort();
  return { closureFiles: closureFiles.length, closureIds, logIds, union, onlyLog };
}

// Luật KHOẢNG CÁCH (t163): một dòng là CÓ CÂU ĐÓNG cho id X khi trong 80 ký tự NGAY SAU X
// có một từ khoá đóng. KHÔNG còn điều kiện độ dài dòng ⇒ dòng 700 ký tự vẫn tính nếu từ khoá
// đứng sát id; ngược lại, dòng liệt kê nhiều id rồi mới tới từ khoá chỉ tính các id đủ gần.
function sentencesIn(file) {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  fs.readFileSync(file, "utf8").split(/\r?\n/u).forEach((line, i) => {
    ID_RE.lastIndex = 0;
    let match;
    while ((match = ID_RE.exec(line)) !== null) {
      const id = match[0];
      const window = line.slice(match.index + id.length, match.index + id.length + CLOSE_WINDOW);
      if (!CLOSE_STRICT.test(window)) continue;
      const distance = window.search(CLOSE_STRICT);
      const previous = out.get(id);
      if (previous === undefined || distance < previous.distance) out.set(id, { line: i + 1, text: line.trim(), distance });
    }
  });
  return out;
}

function scanSentences(opts, docs) {
  if (!fs.existsSync(opts.reportFile)) die("report file not found: " + opts.reportFile);
  const closureSentences = new Map();
  for (const name of fs.readdirSync(opts.closureDir).filter((n) => /^closure.*\.md$/u.test(n)).sort()) {
    for (const [id, hit] of sentencesIn(path.join(opts.closureDir, name))) if (!closureSentences.has(id)) closureSentences.set(id, { ...hit, file: name });
  }
  const auditSentences = sentencesIn(opts.auditLog);
  const reportSentences = sentencesIn(opts.reportFile);
  let maxDistanceUsed = 0;
  // số in ra là max của NGUỒN BÁO CÁO (nguồn mà luật khoảng cách sinh ra để chấm); closure/AUDIT.md cũng dùng cùng luật nhưng không nằm trong số này.
  for (const hit of reportSentences.values()) if (hit.distance > maxDistanceUsed) maxDistanceUsed = hit.distance;
  return { closureSentences, auditSentences, reportSentences, closureFiles: docs.closureFiles, maxDistanceUsed };
}

// Mục "Đọc sổ này thế nào" phải nằm NGAY SAU tiêu đề, trước bảng, và nói đủ 4 trạng thái.
function checkHowToRead(opts) {
  const lines = fs.readFileSync(opts.register, "utf8").split(/\r?\n/u);
  const titleIdx = lines.findIndex((line) => /^#\s+/u.test(line));
  const headingIdx = lines.findIndex((line) => HOWTO_HEADING.test(line));
  const tableIdx = lines.findIndex((line) => /^\|\s*id\s*\|/u.test(line.trim()));
  const where = opts.register;
  if (titleIdx < 0) return [{ kind: "howToRead", where, detail: "register has no # title line" }];
  if (headingIdx < 0) return [{ kind: "howToRead", where, detail: "missing section \"## Đọc sổ này thế nào\"" }];
  if (headingIdx < titleIdx) return [{ kind: "howToRead", where, detail: "the section sits above the title" }];
  if (tableIdx >= 0 && headingIdx > tableIdx) return [{ kind: "howToRead", where, detail: "the section sits below the findings table" }];
  const between = lines.slice(titleIdx + 1, headingIdx).filter((line) => /^##\s+/u.test(line));
  if (between.length) return [{ kind: "howToRead", where, detail: "another ## heading (" + between[0].trim() + ") comes before the section" }];
  const section = lines.slice(headingIdx, tableIdx < 0 ? lines.length : tableIdx).join("\n");
  const problems = [];
  if (!section.includes(OPEN_SENTENCE)) problems.push({ kind: "howToRead", where, detail: "missing the sentence: " + OPEN_SENTENCE });
  for (const status of STATUSES) if (!section.includes(status)) problems.push({ kind: "howToRead", where, detail: "does not define status " + status });
  if (!section.includes("Số liệu hiện tại")) problems.push({ kind: "howToRead", where, detail: "does not carry the current counts" });
  return problems;
}

function parseRegister(opts) {
  if (!fs.existsSync(opts.register)) die("register not found: " + opts.register);
  const lines = fs.readFileSync(opts.register, "utf8").split(/\r?\n/u);
  const rows = [];
  const problems = [];
  let inTable = false;
  let headerSeen = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) continue;
    const cells = line.replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((cell) => cell.trim());
    if (!headerSeen) {
      if (cells[0] === "id" && cells[cells.length - 1] === "nguồn") headerSeen = true;
      continue;
    }
    if (/^[-: ]+$/u.test(cells.join(""))) continue;
    // any row-shaped line counts, wherever it sits in the document
    if (!/^(?:V\d+|VB)-F\d+$/u.test(cells[0])) continue;
    const where = opts.register + ":" + (i + 1);
    if (cells.length !== COLUMNS.length) {
      problems.push({ kind: "badColumns", where, detail: "expected " + COLUMNS.length + " columns, got " + cells.length });
      continue;
    }
    rows.push({
      id: cells[0], vong: cells[1], severity: cells[2], problem: cells[3],
      status: cells[4], closedBy: cells[5], evidence: cells[6], source: cells[7], where,
    });
  }
  if (!headerSeen) die("register has no findings table header (id | vòng | ... | nguồn): " + opts.register);
  return { rows, problems };
}

function evaluate(opts) {
  const docs = scanDocs(opts);
  const { rows, problems } = parseRegister(opts);
  const sentences = scanSentences(opts, docs);
  const howToRead = checkHowToRead(opts);
  const rowProblems = [...problems];
  const seen = new Map();
  const duplicates = [];
  const badStatus = [];
  const badSource = [];
  const closedMissingEvidence = [];
  const badEvidenceShape = [];
  const EVIDENCE_SHAPE = /(?:\.md:\d+)|(?:task t\d+)|(?:t\d+ \(completed\))/u;
  for (const row of rows) {
    if (!/^(?:V\d+|VB)-F\d+$/u.test(row.id)) { rowProblems.push({ kind: "badId", where: row.where, detail: row.id }); continue; }
    seen.set(row.id, (seen.get(row.id) || 0) + 1);
    if (!STATUSES.has(row.status)) badStatus.push({ id: row.id, status: row.status, where: row.where });
    if (!SOURCES.has(row.source)) badSource.push({ id: row.id, source: row.source, where: row.where });
    if (row.status === "CLOSED") {
      const noBy = row.closedBy === "" || row.closedBy === "—" || row.closedBy === "-";
      const noEv = row.evidence === "" || row.evidence === "—" || row.evidence === "-";
      if (noBy || noEv) closedMissingEvidence.push({ id: row.id, missing: [noBy ? "đóng bởi" : null, noEv ? "bằng chứng" : null].filter(Boolean).join("+"), where: row.where });
      else if (!EVIDENCE_SHAPE.test(row.evidence)) badEvidenceShape.push({ id: row.id, evidence: row.evidence, where: row.where });
    }
    if (row.problem.length > 200) rowProblems.push({ kind: "problemTooLong", where: row.where, detail: row.problem.length + " chars" });
  }
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const reportNotClosed = [];
  for (const id of [...sentences.reportSentences.keys()].sort()) {
    const hit = sentences.reportSentences.get(id);
    const row = rowById.get(id);
    if (!row) { reportNotClosed.push({ id, status: "(no row in register)", where: opts.reportFile + ":" + hit.line }); continue; }
    const pointsAtReport = row.evidence.includes("bao-cao-agent-teams.md");
    if (row.status !== "CLOSED" || !pointsAtReport) reportNotClosed.push({ id, status: row.status, where: row.where });
  }
  const openMissingSuffix = rows.filter((row) => row.status === "OPEN" && !row.evidence.includes(OPEN_SUFFIX)).map((row) => ({ id: row.id, where: row.where }));
  for (const [id, count] of seen) if (count > 1) duplicates.push({ id, count });
  const registerIds = new Set(rows.map((row) => row.id));
  const missing = [...docs.union].filter((id) => !registerIds.has(id)).sort();
  const extra = [...registerIds].filter((id) => !docs.union.has(id)).sort();
  const missingInClosures = [...docs.closureIds].filter((id) => !registerIds.has(id)).sort();
  const missingInAuditLog = [...docs.logIds].filter((id) => !registerIds.has(id)).sort();
  const extraVsClosures = [...registerIds].filter((id) => !docs.closureIds.has(id)).sort();
  const extraVsAuditLog = [...registerIds].filter((id) => !docs.logIds.has(id)).sort();
  const counts = { CLOSED: 0, OPEN: 0, ACCEPTED: 0, SUPERSEDED: 0 };
  for (const row of rows) if (STATUSES.has(row.status)) counts[row.status] += 1;
  const problemsTotal = missing.length + extra.length + duplicates.length + badStatus.length + badSource.length + closedMissingEvidence.length + badEvidenceShape.length + rowProblems.length + reportNotClosed.length + openMissingSuffix.length + howToRead.length;
  return {
    docs, rows, missing, extra, missingInClosures, missingInAuditLog, extraVsClosures, extraVsAuditLog, duplicates, badStatus, badSource, closedMissingEvidence, badEvidenceShape, rowProblems, counts, problemsTotal,
    reportNotClosed, openMissingSuffix, howToRead, sentences,
    idsWithClosureWithin80Closures: sentences.closureSentences.size,
    idsWithClosureWithin80AuditLog: sentences.auditSentences.size,
    idsWithClosureWithin80Report: sentences.reportSentences.size,
    maxDistanceUsed: sentences.maxDistanceUsed,
    idsInClosures: docs.closureIds.size, idsInAuditLog: docs.logIds.size, idsOnlyInAuditLog: docs.onlyLog, unionTotal: docs.union.size,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const state = evaluate(opts);
  const ok = state.problemsTotal === 0 && (opts.mode === "strict" ? state.counts.OPEN === 0 : true);
  if (opts.json) {
    const payload = {
      ok, mode: opts.mode,
      register: opts.register, closureFiles: state.docs.closureFiles,
      idsInClosures: state.idsInClosures, idsInAuditLog: state.idsInAuditLog, idsOnlyInAuditLog: state.idsOnlyInAuditLog, idsOnlyInAuditLogCount: state.idsOnlyInAuditLog.length, unionTotal: state.unionTotal,
      rows: state.rows.length, missing: state.missing, extra: state.extra, missingInClosures: state.missingInClosures, missingInAuditLog: state.missingInAuditLog, extraVsClosures: state.extraVsClosures, extraVsAuditLog: state.extraVsAuditLog, duplicates: state.duplicates, badStatus: state.badStatus,
      badSource: state.badSource, closedMissingEvidence: state.closedMissingEvidence, badEvidenceShape: state.badEvidenceShape, rowProblems: state.rowProblems,
      idsWithClosureWithin80Closures: state.idsWithClosureWithin80Closures, idsWithClosureWithin80AuditLog: state.idsWithClosureWithin80AuditLog, idsWithClosureWithin80Report: state.idsWithClosureWithin80Report, maxDistanceUsed: state.maxDistanceUsed, maxDistanceRule: CLOSE_WINDOW,
      reportNotClosed: state.reportNotClosed, openMissingSuffix: state.openMissingSuffix, howToRead: state.howToRead, reportFile: opts.reportFile,
      closed: state.counts.CLOSED, open: state.counts.OPEN, accepted: state.counts.ACCEPTED, superseded: state.counts.SUPERSEDED,
      problems: state.problemsTotal, strictOpenBlocks: opts.mode === "strict" && state.counts.OPEN > 0,
    };
    console.log(JSON.stringify(payload, null, 2));
  } else {
    if (state.missing.length) console.log("MISSING (in docs, not in register): " + state.missing.join(", "));
    if (state.extra.length) console.log("EXTRA (in register, not in docs): " + state.extra.join(", "));
    for (const dup of state.duplicates) console.log("DUPLICATE: " + dup.id + " x" + dup.count);
    for (const bad of state.badStatus) console.log("BAD STATUS: " + bad.id + " = " + bad.status + " @ " + bad.where);
    for (const bad of state.badSource) console.log("BAD SOURCE: " + bad.id + " = " + bad.source + " @ " + bad.where);
    for (const bad of state.closedMissingEvidence) console.log("CLOSED WITHOUT " + bad.missing + ": " + bad.id + " @ " + bad.where);
    for (const bad of state.badEvidenceShape) console.log("CLOSED EVIDENCE SHAPE: " + bad.id + " = " + bad.evidence + " @ " + bad.where);
    for (const bad of state.rowProblems) console.log("ROW PROBLEM (" + bad.kind + "): " + bad.detail + " @ " + bad.where);
    for (const bad of state.reportNotClosed) console.log("REPORT CLOSED-SENTENCE NOT HONOURED: " + bad.id + " is " + bad.status + " @ " + bad.where);
    for (const bad of state.openMissingSuffix) console.log("OPEN ROW WITHOUT SUFFIX " + OPEN_SUFFIX + ": " + bad.id + " @ " + bad.where);
    for (const bad of state.howToRead) console.log("HOW TO READ (" + bad.kind + "): " + bad.detail + " @ " + bad.where);
    console.log("SUMMARY idsInClosures=" + state.idsInClosures + " idsInAuditLog=" + state.idsInAuditLog
      + " idsOnlyInAuditLog=" + state.idsOnlyInAuditLog.length + " unionTotal=" + state.unionTotal
      + " rows=" + state.rows.length + " missing=" + state.missing.length + " extra=" + state.extra.length
      + " duplicates=" + state.duplicates.length + " badStatus=" + state.badStatus.length + " badSource=" + state.badSource.length
      + " closedMissingEvidence=" + state.closedMissingEvidence.length + " badEvidenceShape=" + state.badEvidenceShape.length + " badRows=" + state.rowProblems.length
      + " closed=" + state.counts.CLOSED + " open=" + state.counts.OPEN + " accepted=" + state.counts.ACCEPTED
      + " superseded=" + state.counts.SUPERSEDED + " missingInClosures=" + state.missingInClosures.length + " missingInAuditLog=" + state.missingInAuditLog.length
      + " extraVsClosures=" + state.extraVsClosures.length + " extraVsAuditLog=" + state.extraVsAuditLog.length
      + " idsWithClosureWithin80Closures=" + state.idsWithClosureWithin80Closures
      + " idsWithClosureWithin80AuditLog=" + state.idsWithClosureWithin80AuditLog
      + " idsWithClosureWithin80Report=" + state.idsWithClosureWithin80Report
      + " maxDistanceUsed=" + state.maxDistanceUsed
      + " reportRowsStillOpen=" + state.reportNotClosed.length
      + " openMissingSuffix=" + state.openMissingSuffix.length + " howToReadProblems=" + state.howToRead.length
      + " problems=" + state.problemsTotal
      + (opts.mode === "strict" && state.counts.OPEN > 0 ? " STRICT-BLOCK open=" + state.counts.OPEN : ""));
  }
  process.exit(ok ? 0 : 1);
}

main();