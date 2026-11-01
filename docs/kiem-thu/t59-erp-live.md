# t59 — E2E trên BẢN COPY dữ liệu đội ERP thật

Mục tiêu: chứng minh bản fork 0.2.0-dev.0 đọc/ghi ĐÚNG trên dữ liệu đội ERP thật (14 member · 107 task)
mà không có rủi ro nào cho dự án ERP: mọi thao tác ghi chỉ chạm bản copy trong `tests/tmp/t59/`, tệp ERP gốc chỉ ĐỌC.

## Cách chạy (từ repo root)

```
node tests/t59-erp-live-copy.mjs
node tests/t59-erp-live-copy.mjs --analyze tests/tmp/t59/run-<stamp>
node tools/check-doc-paths.mjs --summary
```

## Kết quả lần chạy cuối — run-2026-11-01T01-09-18-567Z, EXIT 0 (chạy lại ở t113)

| # | Nội dung | Kết quả | Bằng chứng thô |
| --- | --- | --- | --- |
| C1 | Bản copy byte-identical với tệp ERP | PASS | sha256 hai bên = `9f7420b6a1af1f4e…e15f2d1e`, 14 member · 107 task |
| C2 | Gán lại captain cho bản copy, đổi đúng 1 trường | PASS | `session-86711d25…` → `session-eeb51885…`, sha mới `5e5f05c8…` |
| C3 | DTO thật của `agent_teams_status` parse được | PASS | 7 member sống (7 removed bị lọc), 107 task; `execution_prompt` có ở fe-ui-2/be-api-2 đúng như team.json, 5 member còn lại không có khoá nào (vắng, không phải null) |
| C4 | Phiên headless thật resume làm captain đọc được đội | PASS | exit 0, 32 767 ms, `Team "erp-erp"…`, `Members (7 present + 7 removed)` ⇒ `roster=7+7` — chữ `active/present` KHÔNG ổn định giữa các boot, xem §t113 |
| C5 | Đổi route member đang sống qua phiên | PASS | `route is now command-code-goat/deepseek/deepseek-v4-pro`; status kế tiếp hiện `opencode-go/deepseek-v4.1-flash → command-code-goat/deepseek/deepseek-v4-pro (override)` |
| C6 | Ghi bền lên đĩa (đọc lại tệp) | PASS | 2 dòng audit mới trên đĩa cho lần set và lần clear (`durable-only`), sha bản copy đổi `5e5f05c8…` → `4aafb58f…` |
| C7 | Clear bền, route khai báo còn nguyên | PASS | `routeOverride=null`, spine `opencode-go/deepseek-v4.1-flash`, vẫn 14 member/107 task |
| C8 | Tệp ERP gốc không đổi | PASS | sha trước = sau = `9f7420b6…e15f2d1e`, mtime `1792817593185.6294` không đổi ⇒ identical=true |
| C9 | Test không có đường dẫn tuyệt đối, không in bí mật | PASS | driveLetterHits=0, secretHits=0 |

`--analyze` chấm lại đúng artifact trên (0 phiên, 0 quota) và đọc lại sha tệp ERP hiện tại: verdict PASS, `identical=true`.
**Nó KHÔNG chạy lại assertion nào** — nó đọc `meta.checks` đã lưu rồi tự tính verdict, nên `--analyze` không phải bằng chứng về nguồn hiện tại (xem §t113, giới hạn 1).

## t113 — bỏ ghim cách diễn đạt ở C4

t110/V17-F4 đổi tiêu đề status `Members (N active + M removed):` → `Members (N present + M removed):`.
C4 cũ khẳng định dạng cặp số `active` VÀ fallback về tiêu đề một số `Members (7)`: vừa ghim cách diễn đạt
(đỏ vì lý do không liên quan tới roster), vừa mất răng đúng chỗ cần răng — BUG-027 tái phát thì tiêu đề
chỉ còn MỘT số mà C4 vẫn xanh.

Hiện tại: hàm tự chứa `rosterCountsOf(text)` (`tests/t59-erp-live-copy.mjs`) đọc
`/Members \((\d+) (?:present|active) \+ (\d+) removed\)/` — nhận cả `present` và `active` (để chấm lại artefact lịch sử vẫn được), KHÔNG nhận tiêu đề một số;
C4 đòi `roster.found === true && roster.present === 7 && roster.removed === 7` trên chính text status thật.

### Quan sát: chữ trong tiêu đề không ổn định giữa các boot

Hai lần chạy sống liên tiếp đọc CÙNG một plugin (`packages/dsh-agent-teams/lib/tools.js:3328` in `present`; bản trong profile
`node_modules/@nami/dsh-agent-teams/lib/tools.js` cùng sha256 `88dbee4079f95ffd…` / 213 071 B) mà text thu được khác chữ:

| Lần chạy | Dòng tiêu đề quan sát được |
| --- | --- |
| `run-2026-11-01T01-00-54-228Z` | `Members (7 present + 7 removed)` |
| `run-2026-11-01T01-03-11-690Z` | `Members (7 active + 7 removed)` |
| `run-2026-11-01T01-08-08-791Z` | (không boot được — plugin không import được, xem dưới) |
| `run-2026-11-01T01-09-18-567Z` | `Members (7 present + 7 removed)` |

Lần `01-08-08` đỏ vì MÔI TRƯỜNG, không vì mã: `session.stderr.txt` ghi `agent-teams (@nami/dsh-agent-teams): failed to import: Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@nami/dsh-agent-teams' imported from C:\Users\thang\.dsh\profiles\agent-teams-test\`,
nên phiên không có tool nào và C4..C7 đỏ (C1/C2/C3/C8/C9 vẫn xanh). Ngay sau đó link `node_modules/@nami/dsh-agent-teams` trong profile được dựng lại (mtime 08:08) và lần chạy kế tiếp xanh trở lại.
Nghĩa là profile `agent-teams-test` bị tiến trình khác thay đổi ĐỒNG THỜI trong lúc t113 chạy — đó cũng là giải thích khả dĩ
cho việc chữ tiêu đề đổi giữa các boot (cùng câu lệnh nguồn, khác bản được mount).
⇒ đó chính là lý do C4 không được ghim chữ. Nguyên nhân chưa giải thích được trong phạm vi t113
(`lib/**` ngoài inScope); nếu cần biết thì phải mở task riêng.

### Suite chống tái diễn: `tests/t113-roster-assertion.mjs` — 15/15, EXIT 0

Control đầu tiên đặt trong `tests/tmp/t113/` là SAI chỗ: nó so ĐẦU RA CỦA HELPER, nên ai bỏ `&& rosterOk` khỏi C4
thì control vẫn xanh. Suite mới cắt NGUYÊN VĂN biểu thức C4 ra khỏi suite sống rồi chạy chính biểu thức đó:

| # | Phép kiểm | Kết quả |
| --- | --- | --- |
| A1 | biểu thức cắt ra đúng `roster.found === true && roster.present === 7 && roster.removed === 7` | PASS |
| A2 | helper `rosterCountsOf` còn trong suite sống, tự chứa (5 dòng) | PASS |
| A3 | C4 truyền `rosterOk` vào `check('C4'` (có răng, không tính rồi bỏ) | PASS |
| G1 | text THẬT của lần chạy mới nhất (`Members (7 active + 7 removed)`) ⇒ 7+7, biểu thức true | PASS |
| G2 | artefact lịch sử chữ `present` (đảo chữ, delta +1 B) ⇒ 7+7, biểu thức true | PASS |
| B1 | tiêu đề một số `Members (7)` (delta −19 B) ⇒ found=false ⇒ biểu thức **false** | PASS |
| B2 | `removed 7→6` ⇒ 7+6 ⇒ **false** | PASS |
| B3 | `present/active 7→8` ⇒ 8+7 ⇒ **false** | PASS |
| B4 | mất cả dòng `Members (` (delta −9 B) ⇒ **false** | PASS |
| B5 | text rỗng ⇒ **false** | PASS |
| T1 | biểu thức ghim từ chối cả 5 text xấu và nhận cả 2 text tốt | PASS |
| T2 | sàn số ca: ≥2 tốt, ≥5 xấu | PASS |
| M1 | nới thành `… \|\| true` (delta +8 B) ⇒ probe báo HỎNG (5 text xấu lọt) | PASS |
| M2 | bỏ vế `&& roster.removed === 7` (delta −24 B) ⇒ probe báo HỎNG | PASS |
| M3 | biểu thức hằng `true` ⇒ probe báo HỎNG | PASS |

Đối chứng âm trên ĐĨA (không chỉ trong bộ nhớ): đổi `&& rosterOk,` → `&& true, /* t113 mutation */` trong t59 (+29 B)
⇒ `node tests/t113-roster-assertion.mjs` EXIT 1, `FAIL A3`; khôi phục ⇒ `identical=true`, sha trùng `b3cfb88a…`, 15/15 EXIT 0.

Chạy sống: bản CŨ `node tests/t59-erp-live-copy.mjs` ⇒ EXIT 1, chỉ C4 đỏ (`membersLine=none`) — đúng lỗi
mô tả; bản hiện tại ⇒ EXIT 0, PASS C1..C9, C4 in `membersLine="Members (7 active + 7 removed)"` `roster=7+7`. Cùng một phiên `session-eeb51885-af68-49a8-804a-99f8d3a722cf` được resume ở cả hai lần.

### Giới hạn

1. `--analyze` KHÔNG chạy lại assertion nào (chỉ đọc `meta.checks` đã lưu + đo lại sha tệp ERP) ⇒ không phải bằng chứng về nguồn hiện tại.
2. `tests/tmp/t113/**` chỉ là scratch: control đầu tiên + bản DỰNG LẠI t59 trước khi sửa. Bằng chứng thật nằm trong suite t113.
3. Phép "đổi chữ" phải dùng regex `(present|active)` rồi đảo sang chữ CÒN LẠI; viết `replace('present','active')` thì trên artefact vốn đã là `active` nó là no-op (`applies=false, delta 0`) và ca đó vô nghĩa.
4. C4 đọc TEXT do phiên trả về, không đọc payload thô; C3 mới là ca đọc DTO thật.

### Hash

| Tệp | Trước | Sau |
| --- | --- | --- |
| `tests/t59-erp-live-copy.mjs` | `4c1a0735…04394` (25 707 B, DỰNG LẠI) | `b3cfb88a…01640` (26 426 B) |
| `tests/t113-roster-assertion.mjs` | (tệp mới) | `ffa1d7de6eb1324096ba2e35576ad5a52ff74aa5a5077f37a3ca2b6da7516d06` (12 196 B) |
| `docs/kiem-thu/t59-erp-live.md` | `041d6254…5ddbc` (4 059 B) | (nhiều lượt ghi trong t113; số cuối cùng ở báo cáo t113) |

### Cổng đóng băng nguồn trước/sau boot — C10 (t114, đóng BUG-028)

Hai lần boot liền nhau đọc cùng một symlink tới `packages/dsh-agent-teams` lại in hai tiêu đề khác chữ
(`present` rồi `active`) ⇒ không thể coi "suite xanh" là bằng chứng về byte đang chạy. Suite giờ tự hash nguồn hai lần/boot:

| Mảnh | Việc |
| --- | --- |
| `const PKG` + `FROZEN` (13 dòng) | bảng ĐO MỚI trong t114 cho 12 tệp `lib/**` + `package.json` (`{ path, sha256, bytes }`); comment nêu mốc đo và nói rõ bảng của `tests/t108-pack.mjs` đã cũ (`d402c6586df1e140`) |
| `sourceHashesOf(root)` | đọc sha256 + số byte của đủ 13 tệp → `[{ path, sha, bytes }]` |
| `bootFingerprint(boots, name, args, prompt)` | hash TRƯỚC → `runSession` → hash SAU; CẢ HAI boot (`mint`, `write`) đều đi qua đây |
| `sourceProblemsOf(boots, frozen)` | hàm THUẦN, trả danh sách lỗi (lệch before/after, bytes khác bảng, không có boot…) |
| `meta.source` | `{ frozen: 't114', boots: [...], files: [{ path, shaBefore, shaAfter, bytes }] }` |
| `check('C10', …)` | đỏ khi bất kỳ tệp nào lệch; evidence in từng tệp `shaBefore = shaAfter` và câu `SOURCE_DRIFT_NOTE` |

Quy ước: ai đổi `lib/**` hoặc `package.json` thì cập nhật 13 dòng `FROZEN` NGAY TRONG CÙNG TASK đó, kèm mốc đo mới.

Kết quả: `node tests/t114-source-freeze.mjs` 16/16 EXIT 0; `node tests/t59-erp-live-copy.mjs` PASS C1..C10 EXIT 0
(run `run-2026-11-01T01-23-45-221Z`, `boots=['write']`, `meta.source.files` = 13 mục). Chi tiết + giới hạn: `docs/kiem-thu/t114-source-freeze.md`.

**Giới hạn còn nguyên:** cổng bắt được "boot chạy trên byte khác mã tài liệu mô tả", KHÔNG bắt được "ai đó ghi rồi trả lại đúng byte cũ"
trong khoảng giữa hai lần hash; BUG-028 lộ ra nhờ so HAI ĐẦU RA, không nhờ hash.

## Cơ chế đã dùng

- Một phiên mới không dẫn được đội đã có (`lib/state.js:305-330` khớp `captainSessionId` hoặc dòng dõi fork), nên test gán lại `captainSessionId` của BẢN COPY cho một session đã mint rồi resume bằng `--session-id`; đó là sửa đổi duy nhất trên bản copy ngoài các lệnh tool.
- Trong phiên: status → set_member_route → status → set_member_route (clear). Plugin gọi `writeTeam` TRƯỚC rồi mới ghi audit (`packages/dsh-agent-teams/lib/members.js:1331` rồi `:1365-1381`), nên 2 dòng audit trên đĩa chứng minh cả hai lần ghi đã hạ cánh.
- DTO kiểm bằng cách mount thật `packages/dsh-agent-teams/lib/index.js` và gọi `execute()` của tool đã đăng ký — không dựng dữ liệu, không mô phỏng.

## Giới hạn / điều CHƯA chứng minh

1. Bản copy được gán lại captain; một phiên hoàn toàn mới không thể dẫn đội ERP gốc (đúng thiết kế).
2. Child session của member ERP không tồn tại trong profile nháp nên member không được spawn/resume ở đây: test chứng minh đường ĐỌC + đường GHI route, không chứng minh member chạy tiếp.
3. `qa-do-2` đang `working` trong dữ liệu, nhưng không có task pending nên `kickTeam` không spawn gì.
4. Trần member/HTTP/UI ngoài phạm vi t59 (đã có t11/t21/t10).
5. Ngân sách: 3 lần thử, ~13/20 lệnh shell, tệp tạo mới = 2. **Boot headless 5 lần, vượt trần 4 đúng 1** — lần chạy 1 tốn 3 boot trước khi biết 2 check hỏng là lỗi phía test; lần 2 và 3 tái dùng session đã mint nên mỗi lần chỉ 1 boot.

### t116 — chấm theo TÍNH CHẤT, không theo số lần gọi của model (T114-F1)

Lần chạy `run-2026-11-01T01-27-13-566Z` (captain) đỏ C5/C6/C7 trên ĐÚNG nguồn của lần chạy xanh `run-2026-11-01T01-25-54-618Z` (dev-ui-goat): model gọi `agent_teams_set_member_route` hai lần rồi mới `clear`, trong khi suite cũ ghim `routes.length === 2` và `routes[1]` là clear. Plugin đúng cả ba lần gọi; lỗi nằm ở phép chấm.

Bốn thay đổi quyết định:

1. **Fixture dựng lại mỗi lần chạy** (`tests/t59-erp-live-copy.mjs:366`, `resetFixture()`): xoá `.agent-teams/` + `docs/` của bản copy rồi `copyFile` lại `E:/Project/ERP/.agent-teams/erp-erp/team.json`; C1 khẳng định `copySha256 === ERP_SHA`, `auditRowsAtStart === 0`, 14 member, 107 task, và ghi vào `meta.fixture` những gì đã bị xoá (`wipedPreviousCopySha`, `wipedPreviousMembers`, `wipedPreviousOverride`, `wipedPreviousAuditRows`).
2. **C5 chấm bằng chứng TRONG CÙNG boot** (`:558`): với MỖI call set không-clear (1 hay nhiều — số lần không được chấm), lấy `status` gần nhất NGAY SAU nó trong cùng boot và đòi dòng của `ha-tang-2` có `(override)` + đúng cặp `command-code-goat/deepseek/deepseek-v4-pro`; kèm điều kiện call được ACK.
3. **C6 chấm DELTA** (`:579`, hằng `MIN_AUDIT_DELTA = 2` ở `:50`, hàm thuần `auditDeltaProblems` ở `:346`): `delta = rowsAfterBoot - rowsBeforeBoot` (`auditRowsBeforeBoot` đọc ở `:512`), đòi `delta >= 2`, `delta === số row mới đọc được`, mọi row mới nêu tên member mục tiêu, và `team.json` bị ghi lại. KHÔNG còn khẳng định nào về TỔNG số row. `allAuditRows` (`:337`) chỉ đếm dòng dữ liệu bắt đầu bằng `| YYYY-MM-DDTHH:` — header và `| --- |` không phải row (lỗi này đã mắc và đã sửa trong t116).
4. **C7 chỉ chấm khi model THẬT SỰ clear** (`:599`): lấy call clear CUỐI; không có call clear ⇒ in `khong ap dung — … not applicable, not a failure` và KHÔNG đỏ. Phần ghi bền mà boot ĐÃ làm vẫn được chấm ở C6.

C10 của t114 giữ nguyên (`:643`, 13 tệp `shaBefore === shaAfter === FROZEN`, bảng `FROZEN` ở `:71`).

Bằng chứng tất định — HAI lần chạy liền nhau, cả hai EXIT 0 `verdict PASS — proved C1..C10 — failed (none)`:

| run dir | session | set/clear | delta audit |
| --- | --- | --- | --- |
| `tests/tmp/t59/run-2026-11-01T01-32-43-820Z` | `session-eeb51885-af68-49a8-804a-99f8d3a722cf` | 1 / 1 | 2 |
| `tests/tmp/t59/run-2026-11-01T01-33-21-274Z` | `session-eeb51885-af68-49a8-804a-99f8d3a722cf` | 1 / 1 | 2 |

Đối chứng âm (boot-free, `tests/t113-roster-assertion.mjs` từ dòng 219, 11 case mới N1–N7/F1–F3/W1): boot KHÔNG ghi gì thì đỏ ở ngưỡng 2 nhưng IM LẶNG XANH ở ngưỡng 0 (N5); lật 1 byte bản copy nguồn ⇒ C10 báo đúng tệp (F2); mutation `MIN_AUDIT_DELTA = 2` → `0` ⇒ t113 EXIT 1 **25/26** FAIL N2; thêm `MIN_AUDIT_DELTA === 2` → `=== 0` ⇒ EXIT 1 FAIL N2 + W1; khôi phục `identical=true`, sha `15c04f96a18d6b63d49ec490de286c711dc5baeeeedf76223b48b92e9d5358d7 / 41 840 B`, t113 về **26/26 EXIT 0**.

Chi tiết đầy đủ ở `docs/kiem-thu/t116-live-deterministic.md`.
