# t116 — suite sống `tests/t59-erp-live-copy.mjs` phải TẤT ĐỊNH

Đóng T114-F1 (audit vòng 14, finding của captain). Không phải lỗi sản phẩm: plugin đúng ở cả ba lần gọi.

## 1. Vì sao

Hai lần chạy cách nhau 80 giây, cùng nguồn (13/13 tệp `drift 0`), cùng session `session-eeb51885-af68-49a8-804a-99f8d3a722cf`, cho hai kết luận ngược nhau:

| run | ai chạy | tool call của model | kết quả |
| --- | --- | --- | --- |
| `run-2026-11-01T01-25-54-618Z` | dev-ui-goat | 4 | PASS C1..C10 |
| `run-2026-11-01T01-27-13-566Z` | captain | 6 (set, set, clear) | FAIL C5, C6, C7 |

Suite cũ chấm **số lần gọi**: `routes.length === 2`, `newRows.length === 2`, `routes[1]` là clear. Model gọi `set_member_route` hai lần rồi mới `clear` ⇒ 3 audit row và clear là `routes[2]` ⇒ đỏ dù nghiệp vụ đúng. Một suite như vậy không dùng được làm bằng chứng phát hành. Ngoài ra fixture `tests/tmp/t59/` sống qua các lần chạy nên lần sau thừa hưởng trạng thái lần trước.

## 2. Năm thay đổi trong suite

| việc | neo |
| --- | --- |
| `MIN_AUDIT_DELTA = 2` — ngưỡng là hằng, không phải con số rải trong gate | `tests/t59-erp-live-copy.mjs:50` |
| `allAuditRows(text)` — chỉ đếm DÒNG DỮ LIỆU (`/^\\| \\d{4}-\\d{2}-\\d{2}T/`), header và `\| --- \|` không phải row | `tests/t59-erp-live-copy.mjs:337` |
| `auditDeltaProblems(delta, newRows, target, minDelta)` — hàm THUẦN, minDelta là THAM SỐ để chứng minh ngưỡng quyết định | `tests/t59-erp-live-copy.mjs:346` |
| `resetFixture()` — xoá `.agent-teams/` + `docs/` của bản copy rồi copy lại `E:/Project/ERP/.agent-teams/erp-erp/team.json`, ghi lại thứ đã xoá | `tests/t59-erp-live-copy.mjs:366` |
| `auditRowsBeforeBoot` đọc TRƯỚC boot để C6 chấm delta | `tests/t59-erp-live-copy.mjs:512` |

Ngữ nghĩa mới của bốn check:

| check | cũ | mới |
| --- | --- | --- |
| C1 | copy tồn tại | copy được DỰNG LẠI mỗi lần chạy: `copySha256 === ERP_SHA`, `auditRowsAtStart === 0`, 14 member, 107 task |
| C5 | `routes.length === 2` | mỗi lần **set không-clear** (1 hay nhiều) phải được ACK và `status` NGAY SAU ĐÓ trong cùng boot phải render override của `ha-tang-2` |
| C6 | `newRows.length === 2`, tổng row cố định | **DELTA**: `delta >= MIN_AUDIT_DELTA`, `delta === rowsAfterBoot - rowsBeforeBoot`, mọi row mới nêu tên member, `team.json` bị ghi lại; KHÔNG khẳng định tổng row |
| C7 | `routes[1]` là clear | chỉ chấm khi boot **THẬT SỰ** gọi clear (lấy call clear CUỐI); không gọi ⇒ in `not applicable, not a failure` |
| C10 | (t114) | giữ NGUYÊN: 13 tệp, `shaBefore === shaAfter === FROZEN` |

## 3. Bằng chứng tất định — HAI lần chạy liền nhau

| run dir | exit | verdict |
| --- | --- | --- |
| `tests/tmp/t59/run-2026-11-01T01-32-43-820Z` | 0 | `PASS — proved C1,C2,C3,C4,C5,C6,C7,C8,C9,C10 — failed (none)` |
| `tests/tmp/t59/run-2026-11-01T01-33-21-274Z` | 0 | `PASS — proved C1,C2,C3,C4,C5,C6,C7,C8,C9,C10 — failed (none)` |

Số đo của lần thứ hai (`meta.json`): `fixture.copySha256 = 9f7420b6a1af1f4e… == ERP`, `wipedPreviousCopySha = 1793c87c9be59eae…`, `auditRowsAtStart = 0`, `copy.audit = { rowsBeforeBoot: 0, rowsAfterBoot: 2, delta: 2, minDelta: 2 }`, `session.setCalls = 1`, `session.clearCalls = 1`, `source.boots = ['write']`, `source.files = 13`, C7 `problems=[]` với câu ACK `override is cleared: back on its declared route opencode-go/deepseek-v4.1-flash`.

Hai lần ĐỎ đầu tiên là lỗi của chính bản sửa này, ghi lại để không ai đọc nhầm là hồi quy sản phẩm:

| run dir | exit | lý do |
| --- | --- | --- |
| `run-2026-11-01T01-31-23-759Z` | 1 | chỉ C6: `allAuditRows` đếm cả header + `\| --- \|` ⇒ `delta = 4` và 2 "row mới" không nêu tên member |
| `run-2026-11-01T01-31-55-053Z` | 1 | y hệt (đã sửa predicate ở `:337`, xem §2) |

## 4. Đối chứng âm (không dùng thêm boot nào)

15 case cũ của `tests/t113-roster-assertion.mjs` giữ nguyên (roster C4), thêm **11 case** mới (§t113 kể từ dòng 219) — tất cả đều BOOT-FREE: cắt hàm thật ra khỏi suite sống rồi chạy.

| case | chứng minh |
| --- | --- |
| N1 | bảng `FROZEN` vẫn 13 dòng, sha 64 hex, bytes > 0 |
| N2 | `MIN_AUDIT_DELTA` vẫn đọc ra 2 |
| N3 | header + separator KHÔNG bị đếm là row (đúng lỗi đã mắc) |
| N4 | boot bình thường (delta 2, cả 2 row nêu tên) không có problem nào |
| N5 | boot KHÔNG ghi gì: đỏ ở ngưỡng 2, im lặng xanh ở ngưỡng 0 ⇒ ngưỡng là thứ quyết định |
| N6 | row nêu member khác, và delta lệch số row đọc được, đều bị báo |
| N7 | `meta.json` của lần chạy THẬT mới nhất: `delta === rowsAfterBoot - rowsBeforeBoot = 2`, mọi row mới nêu `ha-tang-2` |
| F1 | bản copy nguyên vẹn 13 tệp ⇒ 0 problem của C10 |
| F2 | lật 1 BYTE trong bản copy `tests/tmp/t116/src/lib/tools.js` (cùng độ dài ⇒ nhánh sha quyết định) ⇒ báo đúng `lib/tools.js: before … after …` |
| F3 | boot ĐỌC nguồn đã lệch cũng bị báo so với bảng đóng băng (chiều còn lại của C10) |
| W1 | hai gate vẫn nối đúng helper: C6 có `deltaProblems.length === 0` + `MIN_AUDIT_DELTA === 2`, C10 có `sourceProblems.length === 0` + `sourceBoots.length > 0` |

Mutation trên chính suite sống (không boot, có sao lưu + khôi phục byte-identical):

| mutation | kết quả t113 |
| --- | --- |
| A: `const MIN_AUDIT_DELTA = 2;` → `= 0;` | **EXIT 1, 25/26** — FAIL N2 |
| B: A + `MIN_AUDIT_DELTA === 2` → `=== 0` trong gate C6 | **EXIT 1, 25/26** — FAIL N2 + W1 |
| khôi phục | `identical=true`, sha256 `15c04f96a18d6b63d49ec490de286c711dc5baeeeedf76223b48b92e9d5358d7 / 41 840 B`, t113 **26/26 EXIT 0** |

## 5. Kỷ luật và giới hạn

4 boot sống (trần 4) · 1 lần thử (trần 3) · 20 lệnh shell (trần 25) · 4 tệp viết tay · không npm, không commit, không pack, không chạm `packages/dsh-agent-teams/**`.

Tệp sau t116:

| tệp | sha256 / bytes |
| --- | --- |
| `tests/t59-erp-live-copy.mjs` | `15c04f96a18d6b63d49ec490de286c711dc5baeeeedf76223b48b92e9d5358d7 / 41 840 B` |
| `tests/t113-roster-assertion.mjs` | `925b852ad2c44ba1188c5da165ba1ea1b18d654d22a986679ff08643a1abc18f / 21 993 B` (26 case) |

GIỚI HẠN — đọc trước khi trích dẫn làm bằng chứng:

1. Tất định được chứng minh bằng **2** lần chạy liền, không phải N lần; model vẫn có thể chọn chuỗi gọi khác (không set gì, hoặc chỉ set) — nay mỗi chuỗi đó vẫn chấm đúng (C5 chấp nhận 1..n, C7 không áp dụng), nhưng chưa có lần chạy THẬT nào rơi vào nhánh `clearCalls = 0`.
2. `--analyze` của suite chỉ đọc `meta.checks` đã lưu, KHÔNG chạy lại assertion nào (đã ghi từ t113).
3. C6 vẫn cần plugin ghi audit row; nếu plugin ngừng ghi thì C6 đỏ — đó là hành vi mong muốn, không phải bất định.
4. `tests/tmp/**` là scratch: đối chứng F2 lật byte trên BẢN COPY, không bao giờ trên nguồn ship.

## 6. t119 / CAP116-F1 — ba tính chất của bản vá t116 nay có ca boot-free (và có RĂNG khi bị phá)

Captain chấm t116 và tìm ra một lỗ hổng thật: mutation **quan hệ thứ tự** không bị bắt. Đổi trong vòng lặp C5

```js
const nextStatus = x.list.slice(i + 1).find((later) => later.tool === 'agent_teams_status');
// thành
const nextStatus = x.list.filter((later) => later.tool === 'agent_teams_status').slice(-1)[0];
```

thì status CUỐI của cả boot có thể 'xác nhận' một lệnh set xảy ra SAU nó — đúng lớp lỗi t116 muốn diệt — mà `tests/t113-roster-assertion.mjs` vẫn 26/26 xanh. Cùng lớp với V18-F2: bằng chứng khớp được, QUAN HỆ thì không được thi hành.

### 6.1 Cách vá: cắt NGUYÊN VĂN rồi chạy, không chép lại logic

`tests/t113-roster-assertion.mjs` cắt ba vùng mã thật ra khỏi suite sống và chạy chúng:

| vùng | mốc cắt | hàm dựng ra |
| --- | --- | --- |
| vòng lặp C5 + `setProblems` | `const setCalls = [];` … `meta.session.setCalls = setCalls;` | `deriveC5(region)` — gọi với `x = { list }` |
| khối C7 | `const declared = clearTarget === undefined` … `meta.session.clearCalls = clearCalls.length;` | `deriveC7(list, clearTarget, afterClear)` |
| `resetFixture` | `async function resetFixture()` | factory nhận 15 biến tự do (`COPY`, `hashFile`, `readJson`, `TARGET_MEMBER`, `allAuditRows`, `readIfExists`, `AUDIT`, `WORK`, `COPY_DIR`, `ERP_TEAM`, `existsSync`, `rm`, `mkdir`, `copyFile`, `join`) |

Gate `clearCall === undefined ? true : finalStateProblems.length === 0` cũng được CẮT bằng regex từ nguồn, không chép lại.

### 6.2 Mười hai ca mới (t113: 26 → **38**)

| ca | chứng minh | kết quả |
| --- | --- | --- |
| S1 | ba vùng mã cắt được nguyên văn từ suite mà lần chạy này đọc | `c5=true c7=true resetFixture=true` |
| C5-O1 | status NGAY SAU set ⇒ không problem | `setCalls=1 problems=[]` |
| C5-O2 | chỉ có status TRƯỚC set ⇒ problem | `overrideInNextStatus=false` |
| C5-O3 | set cuối không có status sau ⇒ problem, dù set trước đã được xác nhận | `setCalls=2 problems=1` |
| C5-O4 | status sau set nhưng KHÔNG render override ⇒ problem | `line="… opencode-go/deepseek-v4.1-flash · reasoning max"` |
| C5-O5 | set không được ACK ⇒ problem, dù status sau có override | `acknowledged=false` |
| C5-ORDER | chính phép của captain, chạy trong bộ nhớ: `applies=true delta=2 B`, fixture tiền-set ĐỎ với mã thật (`realProblems=1`) và XANH với mã mutant (`mutantProblems=[]`) | PASS |
| C7-a | boot KHÔNG clear ⇒ `not applicable`, gate = true | `clearCalls=0 gate=true` |
| C7-b | clear nhưng câu trả lời không nêu route khai báo ⇒ FAIL | `gate=false` + problem nêu nguyên văn câu trả lời |
| C7-c | clear + status đúng ⇒ PASS; còn `routeOverride` trên đĩa ⇒ FAIL | `good=[] gate=true`, `staleProblems=["team.json still carries routeOverride …"]` |
| R1 | `resetFixture` XOÁ leftover và ghi lại đúng thứ đã xoá | seed: copy 3 member + routeOverride + 2 audit row ⇒ `previousSha=c188f9bf…`, `previousMembers=3`, `previousOverride={provider:'x',…}`, `previousAuditRows=2` |
| R2 | sau khi xoá, bản copy LÀ nguồn ERP mới từng byte và audit bắt đầu RỖNG | `copySha === freshSha = c75f5c2f…`, `auditRowsAtStart=0`, `copyExact=true` |

`resetFixture` chạy THẬT (không phải khẳng định cấu trúc) trên fixture tổng hợp ở `tests/tmp/t119/fixture/`; giới hạn duy nhất là nó chạy với bản `hashFile`/`readJson`/`readIfExists`/`allAuditRows` cắt từ chính suite, không phải bản trong module đang chạy.

### 6.3 Đối chứng âm bắt buộc (exit của HAI bản)

`tests/tmp/t119/make-mutant.mjs` tạo **bản sao** của suite sống với đúng phép của captain (suite thật KHÔNG bị sửa):

| | sha256 / bytes | exit t113 |
| --- | --- | --- |
| nguồn `tests/t59-erp-live-copy.mjs` | `15c04f96a18d6b63d49ec490de286c711dc5baeeeedf76223b48b92e9d5358d7 / 41 840 B` | **0** — 38/38 |
| mutant `tests/tmp/t119/t59-mutant.mjs` | `3657e14c05cb7e22d97d4547bc3c8c415dcb69bd84458a3d17bdaf11f8f43d65 / 41 842 B` (+2 B, đúng 1 dòng đổi) | **1** — 34/38, FAIL `C5-O2`, `C5-O3`, `C5-ORDER`, `S1` |

Chạy mutant: `T113_SUITE_OVERRIDE=tests/tmp/t119/t59-mutant.mjs node tests/t113-roster-assertion.mjs`.

### 6.4 Một điều chỉnh trong lúc làm (và vì sao nó trung thực hơn)

Ba ca F1–F3 (t116) trước đây so bản copy với bảng `FROZEN` — bảng đó ghim `packages/dsh-agent-teams/lib/tools.js`. Trong lúc t119 đang làm, một task khác đã ghi `lib/tools.js` (`mtime 2026-11-01T01:43:42.566Z`, `e51734ba… / 213 715 B` ≠ `88dbee40… / 213 071 B` trong bảng), nên F1 đỏ **vì lý do không liên quan**. F1–F3 nay dựng bảng pin **từ chính bản copy** (cơ chế của C10), còn ca `N1` mới là ca ghim bảng thật 13 dòng. Nhờ vậy F1–F3 đo đúng thứ chúng định đo.

### 6.5 Giới hạn

1. `tests/t59-erp-live-copy.mjs` KHÔNG bị sửa (sha `15c04f96…` trước và sau t119); mọi phép thử dùng bản sao trong `tests/tmp/t119`.
2. Các ca boot-free chứng minh LOGIC chấm là đúng và có răng; chúng không thay được một lần chạy sống (không boot nào được chạy trong t119).
3. `C7-b` chỉ phá phần 'câu trả lời không nêu route khai báo'; các nhánh còn lại của khối C7 (spine sai, roster/tasks đổi) được `C7-c` phủ ở dạng `routeOverride` còn sót, không phủ riêng từng nhánh.
