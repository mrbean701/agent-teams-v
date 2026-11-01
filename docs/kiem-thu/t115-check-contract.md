# t115 — cổng kiểm hợp đồng task TRƯỚC khi dispatch

## 1. Vì sao có cổng này

Trong 18 vòng audit, cùng một lớp lỗi của captain lặp lại hai dạng, cả hai đều phát hiện được bằng máy trước khi giao việc:

| Dạng lỗi | Ca thật | Hậu quả đo được |
|---|---|---|
| verify trỏ tệp KHÔNG tồn tại | t74 (tệp ma), t103 `tests/t43-set-member-profile.mjs`, t111 `tests/t111-pack.mjs` (sai thư mục, tệp thật ở `packages/dsh-agent-teams/tests/`) | task đã làm xong vẫn kẹt `in_progress` vì lệnh verify không bao giờ chạy được |
| card tạo KHÔNG có assignee | t110, t113, t114 (5 lần trong một ngày) | member claim chéo, brief tới tay người không giữ card, hai người cùng ghi một tệp |

Cổng chỉ đọc **ledger (team.json) + hệ tệp**. Nó KHÔNG chạy lệnh verify, nên PASS ở đây nghĩa là *hợp đồng thi hành được*, không phải *việc đã đúng*.

## 2. Cách dùng

```
node tools/check-contract.mjs --state <dir> --task <id> [--json] [--pre]
```

| exit | nghĩa |
|---|---|
| 0 | mọi phép PASS |
| 1 | có ít nhất một FAIL |
| 2 | đầu vào không đọc được: thiếu `--state`/`--task`, tham số lạ, không có `team.json`, JSON hỏng, hoặc task id không tồn tại |

`--state` nhận đường dẫn tương đối (tính từ thư mục đang đứng, sau đó thử tiếp từ repo root) hoặc tuyệt đối. Đường dẫn trong `verify` được tính từ repo root, trừ khi lệnh có tiền tố `cd <dir> &&` thì tính từ `<dir>`.

## 3. Sáu phép kiểm

| id | kiểm gì | FAIL khi | ví dụ thông điệp |
|---|---|---|---|
| (a) | mỗi lệnh `node <path>` trong `verify` phải trỏ tệp TỒN TẠI | thiếu tệp | `missing: tests/t111-pack.mjs — nearest real file: packages/dsh-agent-teams/tests/t111-pack.mjs` |
| (b) | card phải có chủ | `assignee` rỗng hoặc toàn khoảng trắng | `card ở pool chung — member sẽ claim chéo (set assignee when the card is created, then brief that member only)` |
| (c) | trường bắt buộc theo kind | `review` thiếu `reviewedTaskId`; `repair` thiếu `sourceTaskId`; `implementation` không có `verify`; `kind` rỗng | `kind=repair requires sourceTaskId: which finding it repairs` |
| (d) | `inScope` không rỗng và không chứa đường dẫn tuyệt đối | rỗng, hoặc có `E:/`, `C:/`, `/`, `\\` | `inScope contains an absolute path: E:/Project/ERP/x.json (paths are workspace-relative POSIX)` |
| (e) | mọi `deliverables` phải nằm trong `inScope` | có deliverable ngoài scope | `deliverable outside inScope: tools/other.mjs` |
| (f) | `outOfScope` không được BAO TRÙM một `inScope` | `outOfScope` là thư mục cha của một mục inScope | `outOfScope "tests" covers inScope "tests/x.mjs"` |

Phép (a) có gợi ý: khi tệp thiếu, cổng quét `packages/*/tests/` rồi `tests/` (bỏ qua `node_modules`, `.git`, `tmp`, `build`) và in tối đa 3 đường dẫn gần đúng — khớp tên trước, sau đó theo điểm giống tên (tiền tố chung + token chung). Đây chính là thứ đã bắt được `tests/t43-set-member-profile.mjs` → `t43-member-profile.mjs` và `tests/t111-pack.mjs` → `packages/dsh-agent-teams/tests/t111-pack.mjs`.

## 4. Bằng chứng cổng có răng — `tests/t115-check-contract.mjs`

43 case (33 ca của bản gốc + 10 ca `k1–k10` thêm ở t123), `EXIT 0` (`# 43/43 passed, 0 failed`). Fixture thật trong `tests/tmp/t115/<ca>/team.json`, mỗi ca assert **exit code + nội dung dòng FAIL**, không chỉ in:

| nhóm | case | nội dung |
|---|---|---|
| hợp đồng tốt | g1, g2 | exit 0, verdict PASS, đủ 6 phép và tất cả `true` |
| (a) | a1–a7 | thiếu tệp ⇒ exit 1 + tên tệp; gợi ý tên gần đúng; tệp thật ⇒ PASS; tiền tố `cd ... &&`; cờ đứng trước đường dẫn (`node --check`); lệnh không phải `node` ⇒ bỏ qua chứ không FAIL |
| (b) | b1–b3 | rỗng và toàn khoảng trắng ⇒ exit 1, thông điệp nguyên văn `card ở pool chung — member sẽ claim chéo` |
| (c) | c1–c4 | review thiếu `reviewedTaskId`, repair thiếu `sourceTaskId`, implementation không có verify; và ca review ĐỦ trường phải PASS |
| (d) | d1, d2 | inScope rỗng; inScope tuyệt đối |
| (e) | e1, e2 | deliverable ngoài scope; deliverable nằm TRONG thư mục inScope thì hợp lệ |
| (f) | f1, f2 | `tests` bao `tests/x.mjs` ⇒ FAIL; hai thư mục anh em (`docs/log` vs `docs/kiem-thu`) ⇒ PASS |
| exit 2 | h1–h4 | thiếu state dir, task id lạ, JSON hỏng, tham số lạ |
| ledger thật | i1, i2 | chạy trên `.agent-teams/nami-agent-teams` cho t115 và t114 |
| đối chứng âm | j1–j3 | xem dưới |
| t117-like + `--pre` | k1–k10 | xem §6 |

### Đối chứng âm (j1–j3)

Suite sao `tools/check-contract.mjs` sang `tests/tmp/t115/negative/tool-no-verify-check.mjs` và sửa ĐÚNG hai chỗ:

- `ok: verifyFailures.length === 0` → `ok: true` (vô hiệu phép (a));
- `const REPO_ROOT = resolve(HERE, '..');` → đường dẫn repo tuyệt đối (để bản copy chạy được từ `tests/tmp`, không phải để đổi hành vi).

In ra: `applies=2 anchor_verdict=1 anchor_root=1 delta_bytes=-17`. Kết quả: bản thật trả `exit 1` trên fixture thiếu tệp, bản bị vô hiệu trả `exit 0` và in `PASS (a) verify targets exist` cho chính fixture đó ⇒ phép (a) là thứ QUYẾT ĐỊNH kết quả, không phải trang trí. `anchor_*` = 1 chứng minh phép thay khớp duy nhất một lần, tức đột biến không phải no-op.

## 5. Chạy trên ledger THẬT

```
node tools/check-contract.mjs --state .agent-teams/nami-agent-teams --task t115
```

Kết quả tại thời điểm viết tài liệu này: `t115` → `verdict PASS — 6/6 checks passed`, `EXIT 0`; `t114` → `verdict PASS — 6/6 checks passed`, `EXIT 0`.

Một chi tiết đáng ghi: khi cổng mới có `tools/check-contract.mjs` mà `tests/t115-check-contract.mjs` CHƯA được viết, chính cổng báo `FAIL (a) — missing: tests/t115-check-contract.mjs`, `EXIT 1`. Đó là ca thật đầu tiên nó bắt được: hợp đồng của chính t115 lúc đó chưa thi hành được. Sau khi tệp suite tồn tại thì PASS.

## 6. `--pre` và luật chạy TRƯỚC terminal

**Vì sao có chế độ này.** Audit vòng 19 (V19-F1) kết luận nợ hợp đồng của card `t117` KHÔNG phải lỗi của phép (f): phép (f) đã đúng và đã có sẵn từ t115. Đó là lỗi QUY TRÌNH — cổng chỉ được chạy SAU khi card đã `completed`, mà contract của một card terminal là bất biến, nên FAIL không còn sửa được. Một phép kiểm chỉ chạy được sau khi hỏng thì không phải phép kiểm.

```
node tools/check-contract.mjs --state <dir> --task <id> --pre
```

`--pre` chạy ĐÚNG sáu phép, ĐÚNG ngữ nghĩa và trả ĐÚNG exit code như chế độ thường (0/1/2). Nó **không nới phép nào, không thêm miễn trừ, không đổi (f)**. Khác biệt duy nhất là câu nói về THỜI ĐIỂM gọi:

| | chế độ thường | `--pre` |
|---|---|---|
| tiêu đề | `contract gate — task t121 · …` | `contract gate [PRE-TERMINAL] — task t121 · …` |
| sau dòng verdict, khi FAIL | (không có) | `PRE-TERMINAL FAIL — recording completion for t117 now would freeze a FAILED contract (a terminal card is immutable) — repair (f) first, then re-run this gate until it exits 0` và `PRE-TERMINAL: do NOT record completion yet — fix (f), then re-run: node tools/check-contract.mjs --state <dir> --task t117 --pre` |
| sau dòng verdict, khi PASS | (không có) | `PRE-TERMINAL PASS — recording completion for t121 is legal right now — the contract would stay PASS` |
| `--json` | `mode: "normal"`, `preTerminal: false` | `mode: "pre"`, `preTerminal: true` |

Cả hai chế độ đều mang trong JSON: `terminalBlocked` (boolean — `true` khi có ít nhất một phép FAIL) và `terminalConclusion` (câu kết luận), nên script có thể chặn `update_task` bằng `terminalBlocked === true` mà không phải parse text.

**LUẬT:** chạy `--pre` TRƯỚC khi captain ghi `completed` (hoặc chế độ thường khi card chưa terminal); `exit 1` = KHÔNG được ghi hoàn thành, phải sửa hợp đồng trước. Đo thật trên ledger ngay trước khi viết mục này:

| lệnh | kết quả nguyên văn |
|---|---|
| `--task t117 --pre` | `FAIL (f) outOfScope "packages/dsh-agent-teams" covers inScope "packages/dsh-agent-teams/lib/tools.js"`, `verdict FAIL — 5/6 checks passed — failed: (f)`, `EXIT 1` — đúng như audit đo, và VẪN FAIL sau khi thêm `--pre` (luật không bị nới để card cũ qua) |
| `--task t121 --pre` | `verdict PASS — 6/6 checks passed`, `PRE-TERMINAL PASS — recording completion for t121 is legal right now — the contract would stay PASS`, `EXIT 0` |

**Ca hồi quy (k1–k10, trong `tests/t115-check-contract.mjs`)** — fixture `tests/tmp/t115/t117-like/team.json` dựng đúng hình dạng card t117 (`inScope: packages/dsh-agent-teams/lib/tools.js` nằm TRONG `outOfScope: packages/dsh-agent-teams`):

| case | khẳng định | số đo |
|---|---|---|
| k1 | card kiểu t117 FAIL (f) và nêu cả hai đường dẫn | `exit=1 detail=outOfScope "packages/dsh-agent-teams" covers inScope "packages/dsh-agent-teams/lib/tools.js"` |
| k2 | card t117 THẬT trên ledger vẫn FAIL (f) — luật không bị nới | `exit=1`, cùng detail |
| k3 | `--pre` cho cùng exit code, cùng verdict, cùng tập phép FAIL như chế độ thường | `pre_exit=1 normal_exit=1 failed_pre=f failed_normal=f` |
| k4 | JSON của `--pre` mang `mode=pre`, `preTerminal=true`, `terminalBlocked=true` | `mode=pre preTerminal=true terminalBlocked=true` |
| k5 | text `--pre` nói rõ terminal bây giờ sẽ đóng băng cái FAIL và nêu phép (f) | `PRE-TERMINAL: do NOT record completion yet — fix (f)` + `a terminal card is immutable` |
| k6 | `--pre` trên card TỐT vẫn 0/PASS với đủ 6 phép — không phải cổng thứ hai, dễ hơn | `pre_exit=0 checks=a:true,b:true,c:true,d:true,e:true,f:true` |
| k7 | `--pre` trên card tốt in `PRE-TERMINAL PASS …` | `exit=0` |
| k8 | `--pre` không nuốt tham số lạ | `--pre --nope` ⇒ `exit=2`, `unknown argument` |
| k9, k10 | đối chứng âm 2: anchor `const ok = clashes.length === 0;` là DUY NHẤT; vô hiệu (f) thì card kiểu t117 PASS | `anchor_overlap=1`, `real_exit=1 mutant_exit=0`, `applies=1 delta_bytes=-10` |

k9/k10 là phần chứng minh (f) có răng TRÊN CHÍNH hình dạng t117: nếu (f) chỉ là trang trí thì bản bị vô hiệu vẫn sẽ FAIL, và ca k1 sẽ không nói gì về luật.

## 7. Giới hạn (nói thẳng)

1. **Không chứng minh lệnh verify sẽ PASS.** Cổng chỉ `stat` tệp, không chạy lệnh. Một tệp tồn tại nhưng suite đỏ vẫn qua cổng — đó là việc của lúc chấm, không phải lúc dispatch.
2. **Chỉ đọc `team.json` của một state dir.** Nó không kiểm tính nhất quán giữa các card (ví dụ hai card cùng ghi một tệp), không kiểm `dependencies` có thật hay không, không kiểm limits/ngân sách trong `description`.
3. **Gợi ý tên là heuristic**, quét tối đa 5 tầng dưới `packages/*/tests/` và `tests/`, bỏ qua `tmp`/`build`/`node_modules`. Tệp nằm ngoài hai gốc đó sẽ không được gợi ý.
4. **`kind` không nằm trong danh sách đã biết thì chỉ bị chặn khi rỗng.** Cổng không từ chối `kind` lạ vì schema của plugin còn có thể mở rộng.
5. **Phép (e) chỉ có nghĩa khi card khai `deliverables`.** Card không khai gì thì (e) PASS kèm ghi chú `no deliverables declared` — hợp đồng không nêu thì không có gì để đối chiếu.
6. **Cổng không thay được luật 'đo lại mtime+sha tệp mục tiêu ngay trong lượt gửi brief'.** Nó bắt được hợp đồng không thi hành được và card vô chủ; nó không biết tệp đã bị người khác sửa sau khi brief viết ra.
7. **`--pre` KHÔNG phải cổng thứ hai.** Nó không thêm phép, không nới phép, không có danh sách miễn trừ và không có nhánh bỏ qua: một card FAIL ở chế độ thường thì `--pre` FAIL y hệt (case k3 so cả exit code lẫn tập phép FAIL; k6 chứng minh chiều ngược lại — card tốt vẫn 0/PASS với đủ 6 phép). Toàn bộ khác biệt nằm ở câu chữ về thời điểm và ở hai khoá JSON `preTerminal`/`terminalBlocked`.
8. **`--pre` không tự thi hành luật.** Cổng chỉ đọc ledger và `stat` tệp: nó không chạy lệnh verify nên không biết suite xanh hay đỏ, và nó không ngăn được người ghi `completed` mà không chạy nó. Giá trị của `--pre` là biến 'kiểm sau khi hỏng' thành 'kiểm trước khi hỏng' — với điều kiện nó thật sự được chạy trước.

## 8. Tệp liên quan

| tệp | vai trò |
|---|---|
| `tools/check-contract.mjs` | cổng, CLI 6 phép + `--json` + `--pre` |
| `tests/t115-check-contract.mjs` | 43 case + 2 đối chứng âm, fixture trong `tests/tmp/t115/` |
| `docs/kiem-thu/t115-check-contract.md` | tài liệu này |
