# t67 — Nốt `planSave` + quét CSS ra toàn bộ component client

## 1. Lỗ vẫn còn sau t62
t62 khôi phục 140 lớp nhưng chỉ đối chiếu `ActivityPanel.js` (100 khoá). Quét lại MỌI tệp import
`./ActivityPanel.module.css` trong `lib/client/`:
| Tệp | Khoá `css.*` |
| --- | --- |
| `ActivityPanel.js` | 100 |
| `MemberControls.js` | 2 (`membersToggle`, `planSave`) |
| `StagingPlanEditor.js` | 35 (`plan*`) |
Tổng lượt dùng = **137**, nhưng `membersToggle` được CẢ `ActivityPanel.js` và `MemberControls.js` dùng ⇒ khoá PHÂN BIỆT = **136**.
Trước khi sửa chỉ thiếu đúng **1**: `planSave` — nút `type=submit` của form thêm member (`MemberControls.js:372`,
`disabled: busy || name.trim() === ''`), nên nút 'Lưu' vẫn mất style dù panel đã có CSS trở lại.

## 2. Đã làm
`ActivityPanel.module.css` += 5 rule `.aYQbCq_planSave…` **845 B**, theo đúng ngôn ngữ thiết kế sẵn có (chỉ biến `--dsw-*`,
không màu mới): nền `--dsw-alias-state-business-primary`, chữ `--dsw-alias-label-primary-inverted` (giống
`.aYQbCq_memberInitial`), `border-radius:7px` + `min-height:28px` + `font-size:10.5px` (giống `.aYQbCq_teamStopButton`/
`.aYQbCq_membersToggle`), hover bằng `color-mix(... 88%, var(--dsw-alias-bg-base))` như các rule khác, `:active` scale .97,
`:focus-visible` outline như mọi control, và **`:disabled`** = `--dsw-alias-button-ghost-active-fill` +
`--dsw-alias-label-tertiary` + `cursor:not-allowed`.
`tests/t62-css-completeness.mjs`: tự DÒN tệp (không hard-code) — `importersOf()` đọc `lib/client/*.js`, giữ tệp nào có
`./ActivityPanel.module.css`; `keysByFileOf()` gom khoá theo tệp + union + số lượt dùng; check mới in
`ActivityPanel.js:100 MemberControls.js:2 StagingPlanEditor.js:35`. Thêm check `planSave` có `:disabled`, check bundle chứa
`aYQbCq_planSave`, và **M1b** cắt `planSave` trong bộ nhớ (có `applies:` + delta byte để một lần replace rỗng không thể
giả PASS). Các check cũ giữ nguyên: ≥139 lớp, sàn byte CSS, 3 khối `typeof document`, M1/M2/M3/M4.

## 3. Bằng chứng (chạy thật)
| Artefact | Trước | Sau |
| --- | --- | --- |
| `lib/client/ActivityPanel.module.css` | 50 992 B · `9651f407e566…b199` · 140 lớp · 181 mapping | **51 837 B** · `53ea47c6d780cd9d67fbbab497d3cc302934a8aa16a1ed4ad7ff811442109c16` · **141 lớp** · 183 mapping |
| `lib/client.js` | 250 901 B · `5e16722088bf…c0d1` | **251 789 B** · `42f51e8e65af57d268c4c0a2292102f8e3b1c58b7e3ca8b6042229d041371eae` |
| `lib/client.js.map` | 390 459 B · `390d3207373a…779c` | **391 373 B** · `3b85de13f43e62deaa182b5f0202fafeb37f16a9e451e0fffb426fcb498b3c22` |
`node tests/t62-css-completeness.mjs` ⇒ **17/17 passed, EXIT=0**: 51 837 B; 141 lớp; 3 importer; **136 khoá (137 lượt dùng)**;
**missing: none**; 183 mapping; `planSave` + `:disabled` có; bundle **57 646 B CSS / 3 literal**; **3** khối `typeof document`;
M1 `taskDetail*` mất; **M1b `applies: true, delta 845 B, missing: planSave`**; M2 53 lớp; M3 0 B; M4 qua.
**Mutation trên TỆP THẬT**: xoá cả 5 rule `.aYQbCq_planSave…` (`applies: true, delta 845 B`) ⇒ `FAIL 5 … missing: planSave`,
`FAIL 8`, `# 13/17 passed, 4 failed`, **EXIT=1**; khôi phục ⇒ sha256 `53ea47c6d780…9c16` **trùng tuyệt đối** và **17/17 EXIT=0**.
Build `node build/build.mjs` **2 lần**: `esbuild errors: 0 / warnings: 0`, cả hai cho CÙNG sha256 ở client.js và client.js.map;
`node --check lib/client.js` EXIT 0; `JSON.parse` map ⇒ **19 sources**, `sourcesContent` null 0, **0 đường dẫn ổ đĩa**, có `ActivityPanel.module.css`.
Hồi quy: `tests/t10-ui-bundle-smoke.mjs` **40/40 EXIT 0** · `tests/t57-panel-session-gate.mjs` **29/29 EXIT 0**.

## 4. Giới hạn
Test vẫn là TĨNH: chứng minh lớp được định nghĩa + CSS nằm trong bundle, KHÔNG chứng minh nút trông đúng; chưa click thử
trong GUI Host. `MembersControls.js`/`StagingPlanEditor.js` ngoài scope nên không sửa (chỉ đọc để lấy khoá).