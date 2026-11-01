#!/usr/bin/env node
// tools/check-logs.mjs — cổng kiểm bảy nhóm log bắt buộc của repo (không phụ thuộc đường dẫn tuyệt đối).
//
// Bài toán: không có công cụ nào phát hiện "log cũ" (log không cập nhật theo vòng mới nhất) nên
// tình trạng ACTIVITY/BA tụt lại sau các vòng 11–12 đã tái diễn nhiều lần. Công cụ này chấm 7 log
// bắt buộc của goal §6: BA, CHECK, TEST, BUG, HANDLE, AUDIT, ACTIVITY.
//
// Mỗi log phải: (1) tồn tại và có nội dung, (2) có >= 1 tiêu đề mục (## trở xuống), (3) không có mục
// rỗng (tiêu đề mà bên dưới không có dòng nội dung nào), và (4) nếu log được xếp MỤC THEO VÒNG thì
// phải nhắc tới vòng mới nhất khai trong header của docs/TODO.md — số vòng KHÔNG hardcode, đọc từ
// header mỗi lần chạy.
//
// Header KHÔNG khai vòng thì mặc định là LỖI (exit 1). Lý do (t95): bản đầu bỏ qua phép kiểm độ mới
// trong im lặng, nên chỉ cần quên khai vòng trong header là log cũ đi qua tự do — đúng chế độ hỏng mà
// công cụ này sinh ra để chặn (captain phát hiện bằng fixture tests/tmp/cap91-fixture). Muốn bỏ qua
// phép kiểm đó một cách TƯỜNG MINH thì phải dùng cờ --allow-missing-round: khi đó exit 0 nhưng có
// cảnh báo và dòng summary ghi rõ 'skipped (--allow-missing-round)'.
//
// Dùng:
//   node tools/check-logs.mjs                       # chấm repo hiện tại, exit 0/1
//   node tools/check-logs.mjs --summary             # in đúng 1 dòng đếm
//   node tools/check-logs.mjs --root <dir>          # chấm một cây khác (dùng cho fixture trong test)
//   node tools/check-logs.mjs --json                # in JSON để máy đọc
//
// Exit: 0 = tất cả ĐẠT (có thể kèm cảnh báo) · 1 = có ít nhất một lỗi · 2 = lỗi dùng công cụ.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Log được xếp MỤC THEO VÒNG thì phải phủ vòng mới nhất; log xếp theo ID (BUG-###, TG-TEST-##, bảng
// xử lý) chỉ được CẢNH BÁO khi tụt vòng, vì lý do tụt của chúng không phải "thiếu mục vòng" mà là
// "không dùng từ vựng vòng" — muốn chặn hẳn thì phải sửa chính các log đó (ngoài phạm vi công cụ này).
const LOGS = [
    { name: 'BA', roundIndexed: true },
    { name: 'CHECK', roundIndexed: true },
    { name: 'TEST', roundIndexed: false },
    { name: 'BUG', roundIndexed: false },
    { name: 'HANDLE', roundIndexed: false },
    { name: 'AUDIT', roundIndexed: true },
    { name: 'ACTIVITY', roundIndexed: true },
]

const ROUND_RE = /(?:vòng|round)\s*(\d+)/gi
const COUNT_RE = /Đếm\s*\(t1\s*[–\-—]\s*t(\d+)\)/i

function usage () {
    return [
        'Dùng: node tools/check-logs.mjs [--root <dir>] [--summary] [--json] [--allow-missing-round]',
        '  --root <dir>             cây cần chấm (mặc định: gốc repo chứa tools/check-logs.mjs)',
        '  --summary                in đúng một dòng đếm',
        '  --json                   in JSON',
        '  --allow-missing-round    bỏ qua phép kiểm độ mới khi header docs/TODO.md không khai vòng',
        '                           (mặc định thiếu vòng là LỖI; chỉ dùng cờ khi thật sự chưa có vòng để khai)',
    ].join('\n')
}

function parseArgs (argv) {
    const out = { root: REPO_ROOT, summary: false, json: false, allowMissingRound: false }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--root') {
            const value = argv[++i]
            if (value === undefined) throw new Error('--root cần một tham số')
            out.root = resolve(value)
        } else if (arg === '--summary') out.summary = true
        else if (arg === '--json') out.json = true
        else if (arg === '--allow-missing-round') out.allowMissingRound = true
        else if (arg === '--help' || arg === '-h') out.help = true
        else throw new Error('tham số lạ: ' + arg)
    }
    return out
}

function readText (path) {
    try {
        return readFileSync(path, 'utf8')
    } catch {
        return undefined
    }
}

function lines (text) {
    return text.replace(/\r\n/g, '\n').split('\n')
}

function roundMarkers (text) {
    const found = []
    let match
    ROUND_RE.lastIndex = 0
    while ((match = ROUND_RE.exec(text)) !== null) found.push(Number(match[1]))
    return found
}

// Header của docs/TODO.md = các dòng trước hàng bảng đầu tiên. Số vòng mới nhất được ĐỌC từ đây mỗi
// lần chạy (không hardcode) để vòng sau tự động được kiểm mà không phải sửa công cụ.
function readTodoHeader (root) {
    const path = join(root, 'docs', 'TODO.md')
    const text = readText(path)
    if (text === undefined) return { path, missing: true }
    const all = lines(text)
    const header = []
    for (const line of all) {
        if (/^\s*\|/.test(line)) break
        header.push(line)
    }
    const headerText = header.join('\n')
    const rounds = roundMarkers(headerText)
    const countMatch = COUNT_RE.exec(headerText)
    return {
        path,
        missing: false,
        rounds,
        newestRound: rounds.length === 0 ? null : Math.max(...rounds),
        newestTask: countMatch === null ? null : Number(countMatch[1]),
        headerLines: header.length,
    }
}

// Mục rỗng = tiêu đề cấp >= 2 mà toàn bộ phần thân (tới tiêu đề kế tiếp, bất kể cấp) không có dòng
// nào có nội dung. Tiêu đề cấp 1 là tiêu đề tệp nên không chấm.
function isHeadingLine (line) {
    let i = 0
    while (i < line.length && line[i] === '#') i++
    if (i < 1 || i > 6) return false
    const code = line.charCodeAt(i)
    return code === 32 || code === 9
}

// Mục rỗng = tiêu đề cấp >= 2 mà phần thân không có chữ VÀ không có mục con.
function inspectSections (text) {
    const all = lines(text)
    const headings = []
    all.forEach((line, index) => {
        if (isHeadingLine(line) === false) return
        let level = 0
        while (line[level] === '#') level++
        headings.push({ index, level, text: line.slice(level).trim() })
    })
    const empties = []
    let sectionCount = 0
    for (let k = 0; k < headings.length; k++) {
        const heading = headings[k]
        if (heading.level < 2) continue
        sectionCount++
        const body = []
        for (let j = heading.index + 1; j < all.length; j++) {
            if (isHeadingLine(all[j])) break
            body.push(all[j])
        }
        const hasBody = body.filter((line) => line.trim() !== '').length > 0
        const next = headings[k + 1]
        const hasSubsection = next !== undefined && next.level > heading.level
        if (hasBody === false && hasSubsection === false) empties.push(heading.text)
    }
    return { headings: headings.length, sectionCount, empties }
}
function checkLog (root, spec, newestRound) {
    const relative = 'docs/log/' + spec.name + '.md'
    const path = join(root, 'docs', 'log', spec.name + '.md')
    const entry = { name: spec.name, file: relative, roundIndexed: spec.roundIndexed, problems: [], warnings: [], lines: 0, sections: 0, newestRoundInLog: null, emptySections: [] }
    if (existsSync(path) === false) {
        entry.problems.push('thiếu tệp ' + relative)
        return entry
    }
    const text = readText(path)
    if (text === undefined) {
        entry.problems.push('không đọc được ' + relative)
        return entry
    }
    entry.lines = lines(text).length
    if (text.trim() === '') {
        entry.problems.push(relative + ': tệp rỗng')
        return entry
    }
    const sections = inspectSections(text)
    entry.sections = sections.sectionCount
    entry.emptySections = sections.empties
    if (sections.headings === 0) entry.problems.push(relative + ': không có tiêu đề mục nào')
    else if (sections.sectionCount === 0) entry.problems.push(relative + ': không có tiêu đề mục cấp >= 2')
    if (sections.empties.length > 0) entry.problems.push(relative + ': ' + sections.empties.length + ' mục rỗng (' + sections.empties.slice(0, 3).map((s) => '"' + s + '"').join(', ') + ')')
    const roundsInLog = roundMarkers(text)
    entry.newestRoundInLog = roundsInLog.length === 0 ? null : Math.max(...roundsInLog)
    if (newestRound !== null && entry.newestRoundInLog !== null && entry.newestRoundInLog < newestRound) {
        const message = relative + ': log cũ — mới nhất chỉ tới vòng ' + entry.newestRoundInLog + ', trong khi header docs/TODO.md khai vòng ' + newestRound
        if (spec.roundIndexed) entry.problems.push(message)
        else entry.warnings.push(message + ' (log xếp theo ID nên chỉ cảnh báo)')
    } else if (newestRound !== null && entry.newestRoundInLog === null && spec.roundIndexed) {
        entry.problems.push(relative + ': log cũ — không nhắc tới vòng ' + newestRound + ' nào')
    }
    return entry
}

function run (args) {
    const header = readTodoHeader(args.root)
    const entries = []
    const headerProblems = []
    const headerWarnings = []
    let roundCheck
    let checkRound = null
    if (header.missing === true) {
        headerProblems.push('thiếu tệp docs/TODO.md (không đọc được header để biết vòng mới nhất)')
        roundCheck = 'newest_round=missing (không đọc được docs/TODO.md)'
    } else if (header.newestRound === null) {
        // Header không khai vòng: ĐÂY LÀ LỖI theo mặc định (t95). Im lặng bỏ qua phép kiểm độ mới
        // nghĩa là chỉ cần quên khai vòng trong header là log cũ đi qua tự do, nên muốn bỏ qua phải
        // nói rõ bằng cờ --allow-missing-round; khi đó vẫn ghi cảnh báo ở cả summary và output.
        if (args.allowMissingRound === true) {
            headerWarnings.push('header docs/TODO.md không khai vòng mới nhất — phép kiểm độ mới đã bị BỎ QUA vì có cờ --allow-missing-round')
            roundCheck = 'skipped (--allow-missing-round)'
        } else {
            headerProblems.push('header docs/TODO.md không khai vòng mới nhất (không có "vòng N"/"round N" nào trong header) — khai vòng trong header, hoặc dùng cờ --allow-missing-round nếu thật sự muốn bỏ qua phép kiểm độ mới')
            roundCheck = 'newest_round=missing (header docs/TODO.md không khai vòng mới nhất)'
        }
    } else {
        roundCheck = 'newest_round=' + header.newestRound
        checkRound = header.newestRound
    }
    for (const spec of LOGS) entries.push(checkLog(args.root, spec, checkRound))

    const problems = headerProblems.length + entries.reduce((sum, entry) => sum + entry.problems.length, 0)
    const warnings = headerWarnings.length + entries.reduce((sum, entry) => sum + entry.warnings.length, 0)
    const failedLogs = entries.filter((entry) => entry.problems.length > 0).length

    const summaryLine = 'SUMMARY logs=' + LOGS.length + ' ok=' + (LOGS.length - failedLogs) + ' fail=' + failedLogs
        + ' warnings=' + warnings + ' problems=' + problems + ' ' + roundCheck
        + (header.newestTask === null ? '' : ' newest_task=' + header.newestTask)

    if (args.json === true) {
        return {
            exit: problems === 0 ? 0 : 1,
            text: JSON.stringify({ root: args.root, header: { missing: header.missing === true, newestRound: header.newestRound ?? null, newestTask: header.newestTask ?? null, headerLines: header.headerLines ?? 0, allowMissingRound: args.allowMissingRound === true }, summary: { logs: LOGS.length, failedLogs, warnings, problems, allowMissingRound: args.allowMissingRound === true }, headerProblems, headerWarnings, entries }, null, 1),
            summaryLine,
        }
    }
    if (args.summary === true) {
        return { exit: problems === 0 ? 0 : 1, text: summaryLine, summaryLine }
    }
    const out = ['check-logs — ' + args.root, 'header docs/TODO.md: ' + roundCheck + (header.newestTask === null ? '' : ' · newest_task=' + header.newestTask)]
    for (const problem of headerProblems) out.push('FAIL header: ' + problem)
    for (const warning of headerWarnings) out.push('WARN header: ' + warning)
    for (const entry of entries) {
        const state = entry.problems.length === 0 ? 'OK  ' : 'FAIL'
        const detail = entry.lines + ' dòng · ' + entry.sections + ' mục' + (entry.newestRoundInLog === null ? ' · không nhắc vòng nào' : ' · vòng mới nhất trong log ' + entry.newestRoundInLog)
        out.push(state + ' ' + entry.name.padEnd(9, ' ') + detail)
        for (const problem of entry.problems) out.push('       ✗ ' + problem)
        for (const warning of entry.warnings) out.push('       ! ' + warning)
    }
    out.push(summaryLine)
    return { exit: problems === 0 ? 0 : 1, text: out.join('\n'), summaryLine }
}

function main () {
    let args
    try {
        args = parseArgs(process.argv.slice(2))
    } catch (error) {
        process.stderr.write(String(error instanceof Error ? error.message : error) + '\n' + usage() + '\n')
        process.exitCode = 2
        return
    }
    if (args.help === true) {
        process.stdout.write(usage() + '\n')
        return
    }
    const result = run(args)
    process.stdout.write(result.text + '\n')
    process.exitCode = result.exit
}

main()
