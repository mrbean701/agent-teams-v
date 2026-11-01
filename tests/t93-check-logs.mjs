#!/usr/bin/env node
// tests/t93-check-logs.mjs — suite cho tools/check-logs.mjs (cổng bảy nhóm log bắt buộc).
//
// Chạy: node tests/t93-check-logs.mjs [--keep]
//   --keep  giữ fixture trong tests/tmp/t93-check-logs/ để soi (mặc định dọn sạch).
// Exit: 0 = mọi ca ĐẠT · 1 = có ca HỎNG.
//
// Lịch sử: t91 dựng cổng (14 ca). t95 siết chế độ hỏng captain phát hiện bằng fixture riêng
// (tests/tmp/cap91-fixture): header docs/TODO.md KHÔNG khai vòng thì cổng cũ bỏ qua phép kiểm độ mới
// trong im lặng ⇒ exit 0 cho log cũ. Nay mặc định là LỖI, bỏ qua chỉ khi có cờ --allow-missing-round
// (và khi đó vẫn cảnh báo). Suite thêm 6 ca (a9 đổi kỳ vọng + a14..a19 mới) ⇒ 20 ca.
//
// Lưu ý về a1/a2/a18 (chạy trên repo THẬT): repo có thể ĐỎ một cách hợp lệ khi vòng mới vừa mở mà log chưa
// kịp cập nhật, nên ba ca đó chấm TÍNH TRUNG THỰC của cổng (exit khớp problems của chính nó, mỗi log đỏ được
// nêu đúng tên, cờ quên-vòng không làm đổi kết quả) chứ không khẳng định "repo sạch".
//
// Mọi fixture nằm dưới tests/tmp/t93-check-logs/<stamp>/ — không đụng docs/ thật, không ghi gì ngoài tests/tmp.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const TOOL = join(REPO_ROOT, 'tools', 'check-logs.mjs')
const TEST_FILE = fileURLToPath(import.meta.url)
const TMP_ROOT = join(REPO_ROOT, 'tests', 'tmp', 't93-check-logs')
const KEEP = process.argv.includes('--keep')
const LOGS = ['BA', 'CHECK', 'TEST', 'BUG', 'HANDLE', 'AUDIT', 'ACTIVITY']

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const WORK = join(TMP_ROOT, stamp)
mkdirSync(WORK, { recursive: true })

let passed = 0
const failures = []
const notes = []

function check (id, title, ok, detail) {
    if (ok === true) {
        passed++
        console.log('ok ' + id + ' — ' + title)
    } else {
        failures.push({ id, title, detail })
        console.log('not ok ' + id + ' — ' + title + (detail === undefined ? '' : ' :: ' + detail))
    }
}

function runTool (args, cwd) {
    const result = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', cwd: cwd ?? REPO_ROOT })
    const stdout = result.stdout ?? ''
    const stderr = result.stderr ?? ''
    return { status: result.status, stdout, stderr, text: stdout + stderr }
}

function summaryOf (run) {
    return (/SUMMARY.*/.exec(run.text) ?? ['(không có SUMMARY)'])[0]
}

function numberIn (line, key) {
    const match = new RegExp(key + '=(-?\\d+)').exec(line)
    return match === null ? -1 : Number(match[1])
}

function defaultBody (name, round) {
    return ['# ' + name + ' — log giả lập', '', '## Vòng ' + round + ' — mục của vòng', '', 'Nội dung thật cho ' + name + ' ở vòng ' + round + '.', ''].join('\n')
}

// makeTree dựng một cây tối thiểu đúng layout repo: docs/TODO.md + docs/log/<7 log>.md
// todoRound: null ⇒ header KHÔNG có chữ "vòng N" nào (tái hiện đúng fixture cap91 của captain).
function makeTree (name, options) {
    const root = join(WORK, name)
    const round = options.round ?? 12
    const todoRound = Object.hasOwn(options, 'todoRound') ? options.todoRound : round
    const omit = options.omit ?? []
    const bodies = options.bodies ?? {}
    mkdirSync(join(root, 'docs', 'log'), { recursive: true })
    const header = ['# TODO — fixture cho suite t93', '', 'Cập nhật: 2026-11-01 (fixture).']
    header.push('Đếm (t1–t93): VERIFIED=93 · OPEN=0')
    if (todoRound !== null) header.push('Trạng thái: **audit vòng ' + todoRound + ' (fixture) đã chốt**')
    header.push('', '| ID | Trạng thái |', '|---|---|', '| t1 | VERIFIED |', '')
    writeFileSync(join(root, 'docs', 'TODO.md'), header.join('\n'))
    for (const logName of LOGS) {
        if (omit.includes(logName)) continue
        const body = Object.hasOwn(bodies, logName) ? bodies[logName] : defaultBody(logName, round)
        writeFileSync(join(root, 'docs', 'log', logName + '.md'), body)
    }
    return root
}

function treeHash (root) {
    const files = []
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name)
            if (entry.isDirectory()) walk(path)
            else files.push(path)
        }
    }
    walk(root)
    files.sort()
    const hash = createHash('sha256')
    for (const file of files) {
        hash.update(file.slice(root.length))
        hash.update(readFileSync(file))
    }
    return { digest: hash.digest('hex'), files: files.length }
}

// sha256 của CHỈ 7 tệp docs/log thật — dùng cho ca chỉ-đọc a19.
function realLogsHash () {
    const hash = createHash('sha256')
    for (const name of LOGS) hash.update(name).update(readFileSync(join(REPO_ROOT, 'docs', 'log', name + '.md')))
    return hash.digest('hex')
}

// ---- a1: repo THẬT — cổng phải khai ĐÚNG trạng thái của chính nó và nêu tên từng log đỏ
const repo = runTool([], REPO_ROOT)
const repoSummary = summaryOf(repo)
const repoProblems = numberIn(repoSummary, 'problems')
const repoFails = numberIn(repoSummary, 'fail')
const expectedExit = repoProblems === 0 ? 0 : 1
const failingLogs = LOGS.filter((name) => new RegExp('^FAIL ' + name + ' ', 'm').test(repo.text))
const failingNamed = failingLogs.length === repoFails && failingLogs.every((name) => repo.text.includes('docs/log/' + name + '.md'))
check('a1', 'repo thật ⇒ exit khớp problems, đúng 1 dòng SUMMARY logs=7, mỗi log đỏ được nêu đúng tên',
    repo.status === expectedExit && repoSummary.includes('logs=7') && repoFails === failingLogs.length && (repoProblems === 0 || failingNamed),
    'exit=' + repo.status + ' expected=' + expectedExit + ' đỏ=' + (failingLogs.join(',') || '(không)') + ' ' + repoSummary)
notes.push(repoSummary)
notes.push('repo state: problems=' + repoProblems + ' fail=' + repoFails + (repoProblems === 0 ? ' (7 log đang mới)' : ' — log đỏ: ' + failingLogs.join(', ')))

// ---- a2: --summary in đúng một dòng và exit khớp với problems của chính nó
const summary = runTool(['--summary'], REPO_ROOT)
const summaryLines = summary.stdout.replace(/\n$/, '').split('\n')
const summaryLine1 = summaryLines.length === 0 ? '' : summaryLines[0]
check('a2', '--summary in đúng 1 dòng bắt đầu "SUMMARY logs=7" và exit khớp problems',
    summaryLines.length === 1 && summaryLine1.startsWith('SUMMARY logs=7') && summary.status === (numberIn(summaryLine1, 'problems') === 0 ? 0 : 1),
    'lines=' + summaryLines.length + ' exit=' + summary.status + ' ' + summaryLine1)

// ---- a3: fixture ĐỦ ⇒ exit 0  (header prose 'vòng 12' + log vòng 12)
const full = makeTree('full', { round: 12 })
const fullRun = runTool(['--root', full])
check('a3', 'fixture đủ 7 log cùng vòng 12 ⇒ exit 0', fullRun.status === 0 && fullRun.text.includes('ok=7 fail=0'), 'exit=' + fullRun.status + ' ' + summaryOf(fullRun))

// ---- a4: fixture thiếu 1 log ⇒ exit 1
const missing = makeTree('missing-test', { round: 12, omit: ['TEST'] })
const missingRun = runTool(['--root', missing])
check('a4', 'fixture thiếu docs/log/TEST.md ⇒ exit 1 + nêu đúng tệp', missingRun.status === 1 && missingRun.text.includes('thiếu tệp docs/log/TEST.md'), 'exit=' + missingRun.status)

// ---- a5: fixture log RỖNG (chỉ tiêu đề) ⇒ exit 1
const emptyBody = ['# ACTIVITY', '', '## Vòng 12 — mục không có nội dung', '', '## Vòng 12 — mục thứ hai cũng trống', ''].join('\n')
const emptyLog = makeTree('empty-log', { round: 12, bodies: { ACTIVITY: emptyBody } })
const emptyRun = runTool(['--root', emptyLog])
check('a5', 'fixture log chỉ có tiêu đề ⇒ exit 1 + báo mục rỗng', emptyRun.status === 1 && emptyRun.text.includes('mục rỗng'), 'exit=' + emptyRun.status + ' ' + ((/mục rỗng[^\n]*/.exec(emptyRun.text) ?? [''])[0]))

// ---- a6: header prose 'vòng 12' + log tụt lại vòng 7 ⇒ exit 1
const stale = makeTree('stale-log', { round: 7, todoRound: 12 })
const staleRun = runTool(['--root', stale])
check('a6', 'fixture log tụt lại vòng 7 trong khi header khai vòng 12 ⇒ exit 1 + báo log cũ', staleRun.status === 1 && staleRun.text.includes('log cũ'), 'exit=' + staleRun.status + ' ' + ((/log cũ[^\n]*/.exec(staleRun.text) ?? [''])[0]))

// ---- a7: tệp log rỗng hoàn toàn ⇒ exit 1
const emptyFile = makeTree('empty-file', { round: 12, bodies: { BA: '' } })
const emptyFileRun = runTool(['--root', emptyFile])
check('a7', 'fixture docs/log/BA.md rỗng 0 byte ⇒ exit 1 + báo tệp rỗng', emptyFileRun.status === 1 && emptyFileRun.text.includes('tệp rỗng'), 'exit=' + emptyFileRun.status)

// ---- a8: log không có tiêu đề mục nào ⇒ exit 1
const noHeading = makeTree('no-heading', { round: 12, bodies: { HANDLE: 'Dòng văn bản thuần, không có tiêu đề mục nào trong tệp này.\n' } })
const noHeadingRun = runTool(['--root', noHeading])
check('a8', 'fixture log không có tiêu đề mục ⇒ exit 1', noHeadingRun.status === 1 && noHeadingRun.text.includes('không có tiêu đề mục'), 'exit=' + noHeadingRun.status)

// ---- a9 (t95 ĐỔI KỲ VỌNG): header KHÔNG khai vòng, KHÔNG cờ ⇒ LỖI, không được im lặng bỏ qua
const noRound = makeTree('no-round-header', { round: 12, todoRound: null })
const noRoundRun = runTool(['--root', noRound, '--summary'])
const noRoundSummary = summaryOf(noRoundRun)
const noRoundProblems = numberIn(noRoundSummary, 'problems')
check('a9', 'header docs/TODO.md không khai vòng, KHÔNG cờ ⇒ exit 1 + problems>=1 + nêu thiếu vòng mới nhất',
    noRoundRun.status === 1 && noRoundProblems >= 1 && noRoundSummary.includes('không khai vòng mới nhất'),
    'exit=' + noRoundRun.status + ' ' + noRoundSummary)

// ---- a10: --json đọc được bằng máy
let jsonOk = false
let jsonDetail = ''
const jsonRun = runTool(['--root', full, '--json'])
try {
    const parsed = JSON.parse(jsonRun.stdout)
    jsonOk = jsonRun.status === 0 && parsed.summary.failedLogs === 0 && parsed.header.newestRound === 12 && parsed.entries.length === 7 && parsed.header.allowMissingRound === false
    jsonDetail = 'failedLogs=' + parsed.summary.failedLogs + ' newestRound=' + parsed.header.newestRound + ' entries=' + parsed.entries.length + ' allowMissingRound=' + parsed.header.allowMissingRound
} catch (error) {
    jsonDetail = 'JSON.parse lỗi: ' + String(error)
}
check('a10', '--json trả JSON parse được, newestRound đọc từ header', jsonOk, jsonDetail)

// ---- a11: đối chứng ÂM — cây giả không có docs/ ⇒ exit 1, rồi DỌN SẠCH
const negativeRoot = join(WORK, 'negative-no-docs')
mkdirSync(join(negativeRoot, 'khong-co-gi'), { recursive: true })
const negativeRun = runTool(['--root', negativeRoot])
const negativeNamed = negativeRun.status === 1 && negativeRun.text.includes('thiếu tệp docs/TODO.md')
rmSync(negativeRoot, { recursive: true, force: true })
const negativeGone = existsSync(negativeRoot) === false
check('a11', 'đối chứng âm: cây không có docs/TODO.md ⇒ exit 1 và đã dọn sạch', negativeNamed && negativeGone, 'exit=' + negativeRun.status + ' còn tồn tại=' + existsSync(negativeRoot))

// ---- a12: công cụ chỉ ĐỌC — hash cây fixture không đổi sau khi chấm
const hashBefore = treeHash(full)
runTool(['--root', full])
const hashAfter = treeHash(full)
check('a12', 'chấm không ghi vào cây được chấm (sha256 cây trước == sau)', hashBefore.digest === hashAfter.digest && hashBefore.files === hashAfter.files, hashBefore.digest.slice(0, 12) + ' → ' + hashAfter.digest.slice(0, 12) + ' files=' + hashBefore.files)

// ---- a13: công cụ + suite không chứa đường dẫn tuyệt đối (mẫu ghép lúc chạy để không tự khớp)
const drivePattern = new RegExp('[A-Za-z]' + ':' + '[\\\\/]')
const homePattern = new RegExp('/' + 'Us' + 'ers/|' + '/' + 'ho' + 'me/')
const toolText = readFileSync(TOOL, 'utf8')
const testText = readFileSync(TEST_FILE, 'utf8')
const driveHits = (toolText.match(drivePattern) ?? []).length + (testText.match(drivePattern) ?? []).length
const homeHits = (toolText.match(homePattern) ?? []).length + (testText.match(homePattern) ?? []).length
check('a13', 'không có đường dẫn tuyệt đối trong công cụ và trong suite', driveHits === 0 && homeHits === 0, 'driveLetterHits=' + driveHits + ' homeHits=' + homeHits)

// ===== các ca của t95 (siết mặc định) =====

// ---- a14: header KHÔNG khai vòng + log ở vòng 12 ⇒ vẫn exit 1 (lỗi ở HEADER, không cứu được bằng log đúng)
const noRoundFreshRun = runTool(['--root', noRound])
const noRoundFreshSummary = summaryOf(noRoundFreshRun)
check('a14', 'header không khai vòng + log ở vòng mới nhất ⇒ exit 1 + problems>=1 (lỗi nằm ở header)',
    noRoundFreshRun.status === 1 && numberIn(noRoundFreshSummary, 'problems') >= 1 && numberIn(noRoundFreshSummary, 'fail') === 0,
    'exit=' + noRoundFreshRun.status + ' ' + noRoundFreshSummary)

// ---- a15: header không khai vòng + cờ --allow-missing-round ⇒ exit 0, warnings>=1, khai rõ đã bỏ qua
const allowRun = runTool(['--root', noRound, '--summary', '--allow-missing-round'])
const allowSummary = summaryOf(allowRun)
check('a15', 'header không khai vòng + --allow-missing-round ⇒ exit 0, problems=0, warnings>=1, summary ghi "skipped (--allow-missing-round)"',
    allowRun.status === 0 && numberIn(allowSummary, 'problems') === 0 && numberIn(allowSummary, 'warnings') >= 1 && allowSummary.includes('skipped (--allow-missing-round)'),
    'exit=' + allowRun.status + ' ' + allowSummary)

// ---- a16: TÁI HIỆN ĐÚNG fixture của captain (tests/tmp/cap91-fixture): header chỉ có 'Đếm (t1–t93)'
// (không chữ "vòng N") + 7 log đều ở vòng 7. Trước t95: exit 0 'skipped' — đúng lỗ hổng bị báo.
const cap91 = makeTree('cap91-fixture', { round: 7, todoRound: null })
const cap91Header = readFileSync(join(cap91, 'docs', 'TODO.md'), 'utf8')
const cap91HasRoundWord = /vòng|round/i.test(cap91Header.split('\n').filter((line) => /^\s*\|/.test(line) === false).join('\n'))
const cap91Run = runTool(['--root', cap91, '--summary'])
const cap91Summary = summaryOf(cap91Run)
check('a16', 'fixture cap91 (header không vòng + 7 log vòng 7) ⇒ exit 1, problems>=1, summary nêu thiếu vòng (TRƯỚC t95 là exit 0)',
    cap91HasRoundWord === false && cap91Run.status === 1 && numberIn(cap91Summary, 'problems') >= 1 && cap91Summary.includes('không khai vòng mới nhất'),
    'headerHasRoundWord=' + cap91HasRoundWord + ' exit=' + cap91Run.status + ' ' + cap91Summary)

// ---- a17: cùng fixture cap91 nhưng có cờ ⇒ exit 0 kèm cảnh báo (lối thoát tường minh, không im lặng)
const cap91AllowRun = runTool(['--root', cap91, '--summary', '--allow-missing-round'])
const cap91AllowSummary = summaryOf(cap91AllowRun)
check('a17', 'fixture cap91 + --allow-missing-round ⇒ exit 0, warnings>=1, summary ghi "skipped (--allow-missing-round)"',
    cap91AllowRun.status === 0 && numberIn(cap91AllowSummary, 'warnings') >= 1 && cap91AllowSummary.includes('skipped (--allow-missing-round)'),
    'exit=' + cap91AllowRun.status + ' ' + cap91AllowSummary)

// ---- a18: cờ allow trên repo THẬT (header có vòng) không đổi kết quả, không che trạng thái
const repoAllow = runTool(['--summary', '--allow-missing-round'], REPO_ROOT)
const repoAllowSummary = summaryOf(repoAllow)
check('a18', 'cờ --allow-missing-round trên repo thật (header CÓ vòng) ⇒ không đổi problems/exit và KHÔNG ghi "skipped (--allow-missing-round)"',
    repoAllow.status === (numberIn(repoAllowSummary, 'problems') === 0 ? 0 : 1)
    && repoAllowSummary.includes('newest_round=')
    && repoAllowSummary.includes('skipped (--allow-missing-round)') === false
    && numberIn(repoAllowSummary, 'problems') === repoProblems,
    'exit=' + repoAllow.status + ' problems=' + numberIn(repoAllowSummary, 'problems') + ' (không cờ: ' + repoProblems + ') ' + repoAllowSummary)

// ---- a19: CHỈ-ĐỌC trên 7 log THẬT — sha256 của 7 tệp docs/log/*.md trước == sau khi chạy cả 4 biến thể
let readOnlyOk = false
let readOnlyDetail = ''
for (let attempt = 1; attempt <= 3 && readOnlyOk === false; attempt++) {
    const before = realLogsHash()
    runTool([], REPO_ROOT)
    runTool(['--summary'], REPO_ROOT)
    runTool(['--root', full, '--summary'], REPO_ROOT)
    runTool(['--summary', '--allow-missing-round'], REPO_ROOT)
    const after = realLogsHash()
    readOnlyOk = before === after
    readOnlyDetail = before.slice(0, 12) + ' → ' + after.slice(0, 12) + ' @lượt ' + attempt
}
check('a19', 'chỉ-đọc: sha256 của 7 log thật trước == sau khi chạy 4 biến thể lệnh', readOnlyOk, readOnlyDetail)
notes.push('sha256 7 log thật: ' + readOnlyDetail)

// ---- a20: dọn sạch fixture (trừ khi --keep)
if (KEEP === false) rmSync(WORK, { recursive: true, force: true })
check('a20', 'fixture được dọn sạch theo mặc định (chỉ còn khi --keep)', KEEP === true || existsSync(WORK) === false, KEEP === true ? 'giữ lại do --keep' : 'đã dọn')

const total = passed + failures.length
console.log('')
for (const note of notes) console.log('số đo: ' + note)
console.log('TỔNG ' + passed + '/' + total + ' ca ĐẠT, ' + failures.length + ' HỎNG · work=' + WORK)
console.log('verdict ' + (failures.length === 0 ? 'PASS' : 'FAIL'))
console.log('EXIT ' + (failures.length === 0 ? 0 : 1))
process.exit(failures.length === 0 ? 0 : 1)
