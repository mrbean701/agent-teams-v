# t62 — Khôi phục CSS panel (139/139 lớp gốc) + test chống tái diễn

## 1. Triệu chứng và nguyên nhân đo được
Bản fork render panel KHÔNG có CSS. Đo trước khi sửa: `lib/client/ActivityPanel.js` đọc **100** khoá `css.*`,
còn `lib/client/ActivityPanel.module.css` chỉ định nghĩa **18** lớp `aYQbCq_*` trong 3 946 B ⇒ **84 khoá** trả về
`undefined`, tức phần lớn panel mất style (không phải toàn bộ: 18 lớp còn sống nên panel hiện dở dang).

Nguồn khôi phục: bundle gốc 0.1.28 đã cài trong profile desktop
`C:\Users\thang\.dsh\profiles\desktop\node_modules\@nanmicoder\dsh-agent-teams\lib\client.js` (249 792 B).
Trong đó CSS của panel nằm nguyên vẹn ở `const css$1 = "..."` (vùng `//#region \0dsh-css:.../ActivityPanel.module.css.mjs`).
Giải mã = **50 936 B / đúng 139 lớp `aYQbCq_*`** — cùng tiền tố hash với bản fork, nên mọi khoá `css.*` của
`ActivityPanel.js` vẫn khớp (tiền tố `aYQbCq_` phụ thuộc tên tệp, không phụ thuộc nội dung).
18 lớp của bản fork cũ là **bản cắt** của khối gốc: so từng rule `.aYQbCq_badge{...}`, `.aYQbCq_panelHead{...}`
thì byte giống nhau, và không có lớp nào của fork mà bản gốc thiếu ⇒ khôi phục nguyên khối là an toàn.

## 2. Đã làm (2 tệp nguồn, 1 test, 2 artefact sinh tự động)
| Tệp | Thay đổi |
| --- | --- |
| `packages/dsh-agent-teams/lib/client/ActivityPanel.module.css` | thay 3 946 B/18 lớp bằng khối 0.1.28 (50 936 B/139 lớp) + 1 lớp mới `.aYQbCq_archivedWrap` ⇒ **50 992 B / 140 lớp** / 181 khoá mapping; sha256 `9651f407e5660750e6990e60121c157aab1cfafc5c1b556e2e31de6438a9b199` |
| `tests/t62-css-completeness.mjs` | MỚI, 14 check tĩnh (xem §3) |
| `packages/dsh-agent-teams/lib/client.js` | build lại; sha256 `5e16722088bfc70fcb40e544d9b13e37cd68458a38c5224bb557f59e3085c0d1` / **250 901 B** (trước: `f86012517284…` / 198 572 B) |
| `packages/dsh-agent-teams/lib/client.js.map` | build lại; `390d3207373a43eefffa16c76df72d03849d8b7854bd8c3c699efddfa90f779c` / 390 459 B (trước `a0241ae86616…` / 335 890 B) |

`archivedWrap` là khoá `css.*` DUY NHẤT mà khối gốc không có (bản fork thêm nhánh member đã lưu trữ;
`ActivityPanel.js:820` dùng `className: css.archivedWrap` bọc `archiveLabel` + `TeamSection`). Contract cho phép
allow-list 1 khoá; tôi chọn **định nghĩa nó** (`.aYQbCq_archivedWrap{flex-direction:column;display:flex}`, chỉ bố cục,
không đổi màu/độ đậm) nên allow-list thực tế = **0 khoá thiếu**, mạnh hơn yêu cầu.

## 3. Bằng chứng chạy thật
`node tests/t62-css-completeness.mjs` ⇒ **14/14 passed, 0 failed, EXIT=0**:
- 1 css bytes >= 50000 — 50 992 B
- 2 prefixed classes >= 139 — 140 lớp
- 3 css keys found — 100 khoá; 4 **every css.* key is defined — missing: none**
- 5 mapping keys >= 180 — 181; 6 `archivedWrap` → `aYQbCq_archivedWrap`
- 7 bundle carries the restored CSS >= 55 000 B — **57 646 B trong 3 literal** (tổng 3 module CSS, khớp 59 510 B thô của 0.1.28)
- 8 bundle keeps 3 `typeof document` injection blocks — 3; 9 bundle có `aYQbCq_archivedWrap`; 10 không có lớp `undefined`
- 11 M1 cắt 1 rule dùng thật ⇒ key `taskDetail*` mất; 12 M2 cắt CSS còn 12 000 B ⇒ còn 53 lớp < 139;
- 13 M3 bundle không có payload CSS ⇒ 0 B < 55 000; 14 M4 text không đột biến vẫn qua mọi sàn.

**Mutation trên TỆP THẬT** (không chỉ trong bộ nhớ): xoá đúng rule `.aYQbCq_emptyHint{...}` (106 B) khỏi CSS ⇒
`FAIL 4 every css.* key is defined — missing: emptyHint`, `# 12/14 passed, 2 failed`, **EXIT=1**; khôi phục từ bản sao ⇒
sha256 trùng lại `9651f407e566…b199` (byte-identical) và về **14/14 EXIT=0**.

Build: `node build/build.mjs` chạy **2 lần** liên tiếp, cả hai `esbuild errors: 0 / warnings: 0`, EXIT 0, và cho
**cùng** sha256 ở cả `lib/client.js` lẫn `lib/client.js.map`. `node --check lib/client.js` EXIT 0.
`JSON.parse(lib/client.js.map)` ⇒ `sources 19`, `sourcesContent` null 0, đường dẫn ổ đĩa 0, có `ActivityPanel.module.css`.
Chromium thật, `build/test-load.html`: `Overall: PASS`, `inject contents: [uiConversation, slots, sessions, locale, modelDirectories, …]`, console **0 entry**.

Hồi quy: `node tests/t10-ui-bundle-smoke.mjs` ⇒ **40/40 PASS EXIT=0**; `node tests/t57-panel-session-gate.mjs` ⇒ **29/29 PASS EXIT=0**.
`TEAM_TAB_ID` không đổi (`@nanmicoder/dsh-agent-teams/activity`), loader id vẫn `@nami/dsh-agent-teams`.

## 4. Giới hạn (không giấu)
- Test là **tĩnh**: nó chứng minh lớp nào được định nghĩa và CSS có nằm trong bundle, KHÔNG chứng minh giao diện đẹp.
- Chromium chỉ nạp `build/test-load.html` (harness của bundle), chưa mở panel trong GUI thật của Host.
- `WorkspaceActivity.module.css` (15 lớp) và `AgentTeamsCard.module.css` (16 lớp) ngoài scope t62, giữ nguyên.
- Khối CSS khôi phục là bản minified 0.1.28; nếu sau này panel cần thuộc tính mới thì phải sửa trực tiếp tệp này.
## 5. V7-F2 — sàn biến thể trạng thái (t70)
Audit vòng 7 (t69) bắt được lỗ hổng thật: xoá **cả rule nhóm 6 selector** `:focus-visible` của
`ActivityPanel.module.css` mà suite t62 **vẫn 17/17 PASS**. Lý do: suite chỉ kiểm (i) tên lớp có mặt trong
tệp CSS/mapping và (ii) riêng `planSave` có `:disabled` — không có phép đếm nào cho hover/focus/
disabled/active, nên mất một trạng thái style là im lặng.

### 5.1 Số đo thật của tệp hiện tại (51 837 B, 399 block `selector{body}`)
Mỗi selector chứa đúng 1 lớp `aYQbCq_*` nên số selector = số lượt lớp. Bảng đầy đủ 22 lớp có trạng thái
được suite in ra ở khối `# stateFloor — class | :focus-visible | :hover | :disabled | :active`; tổng cột:

| biến thể | số lượt đo được | sàn khoá cứng |
| --- | --- | --- |
| `:focus-visible` | 21 | 21 |
| `:hover` | 16 | 16 |
| `:disabled` | 12 | 12 |
| `:active` | 4 | 4 |
| tổng | **53** | 53 |

Sàn = chính số đo, nên mọi rule trạng thái bị xoá đều làm cột tương ứng tụt dưới sàn.

### 5.2 Đã thêm vào `tests/t62-css-completeness.mjs` (17 → 27 check)
- `stateCountsOf(cssText)` → `{ per, totals }`: với mỗi selector, chọn biến thể ĐẦU TIÊN khớp trong
  `STATE_ORDER = [':focus-visible', ':hover', ':disabled', ':active']` rồi cộng **mọi** lớp `aYQbCq_*` mà
  selector đó nhắc tới (một nhóm 6 selector `:focus-visible` ⇒ +6 vào cột focus).
- `stateFloorBreaks(totals)` → danh sách cột dưới sàn (dạng `':focus-visible 15 < 21'`).
- check 13–18: bảng stateFloor in ra + 4 assert theo cột + 1 assert gộp + 1 assert "có ít nhất 1 lượt mỗi biến thể".
- check 19: `css bytes >= 51837`; hằng `CSS_BYTES_MIN` nâng 50 000 → 51 500, thêm hằng
  `CSS_BYTES_EXACT_MIN = 51837`.
- check 25 `M-FOCUS`: xoá rule nhóm CHỈ `:focus-visible` **trong bộ nhớ** — `applies: true`,
  `removed 6 selectors, delta 277 B`, focus-visible 21 → 15 ⇒ FAIL `:focus-visible 15 < 21`.
- check 26 `M-DISABLED`: xoá đúng rule `.aYQbCq_planSave:disabled{...}` — `applies: true`,
  `delta 136 B`, disabled 12 → 11 ⇒ FAIL.
- check 27 `M-FLOOR`: text không đột biến vẫn qua cả 4 sàn (`:focus-visible=21/21 :hover=16/16 :disabled=12/12 :active=4/4`).

### 5.3 Chứng minh bằng ĐĨA (không chỉ bộ nhớ)
| bước | sha256 | byte | kết quả suite |
| --- | --- | --- | --- |
| trước | `53ea47c6d780cd9d67fbbab497d3cc302934a8aa16a1ed4ad7ff811442109c16` | 51 837 | 27/27 EXIT=0 |
| đã xoá 1 rule nhóm 6 selector `:focus-visible` (delta 277 B) | `138c1956b7b1403c1e9385252401841e2bdb955e184f12d169311540cfd6c8df` | 51 560 | **23/27 EXIT=1** |
| khôi phục byte-identical (`identical=true`) | `53ea47c6d780cd9d67fbbab497d3cc302934a8aa16a1ed4ad7ff811442109c16` | 51 837 | 27/27 EXIT=0 |

4 dòng FAIL khi đĩa bị đột biến (đọc từ log thật):

```
FAIL 14 state floor :focus-visible >= 21 — 15 rule slots
FAIL 18 no state variant column falls under its floor — :focus-visible 15 < 21
FAIL 19 css bytes >= 51837 — 51560 B
FAIL 27 M-FLOOR unmutated text clears every state floor — :focus-visible=15/21 :hover=16/16 :disabled=12/12 :active=4/4
```

### 5.4 Cách chạy lại
Từ repo root `E:/Project/Agent-Team`:

```
node tests/t62-css-completeness.mjs      # 27/27, EXIT=0, in bảng stateFloor + 3 mutation
node tests/t10-ui-bundle-smoke.mjs       # 40/40, EXIT=0 (hồi quy bundle UI)
```

Lặp lại phép đột biến trên đĩa: chép `packages/dsh-agent-teams/lib/client/ActivityPanel.module.css` ra chỗ khác,
xoá một rule nhóm chỉ `:focus-visible`, chạy suite (phải EXIT=1), rồi chép lại bản gốc và kiểm sha256
`53ea47c6d780cd9d…` trước khi chạy lại (phải EXIT=0).