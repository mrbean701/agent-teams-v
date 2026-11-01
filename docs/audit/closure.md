# Audit closure (t26) — xác nhận F1–F5/L1–L3 và verdict phát hành

Người audit: **audit-goat** (độc lập; không viết mã trong t23/t24/t25) · attempt `d774b859-2b5c-4c44-bd1c-f565042c402c` · 2026-10-31
Vùng ghi: `docs/audit/**`, `docs/log/AUDIT.md`, `tests/tmp/**`. Không sửa `lib/**`, `build/**`, `tests/t*.mjs`, `docs/TODO.md`.
Script dùng lại được: `tests/tmp/audit-c1/probe.mjs` (bundle+map), `tests/tmp/audit-c2/count.mjs` (TODO), `tests/tmp/audit-c5/prov.mjs` (provenance), `tests/tmp/audit-c3/mutate.mjs` (thử phá checker), log suite ở `tests/tmp/audit-c4/*.log`.

## 1. Verdict

**PHÁT HÀNH ĐƯỢC** (dev build `0.2.0-dev.0`) — không còn phát hiện nào ở lớp mã/kiểm thử; 8/8 finding cũ đã đóng bằng máy chạy.
**Hai việc hồ sơ phải sửa trước khi giao cho người dùng** (không phải lỗi mã): **N1** báo cáo người dùng còn hash bundle cũ + thiếu hàng t24; **N2** `docs/DEPENDENCIES.md` sinh lúc 16:59:42Z còn thiếu t25/t26 (sẽ hết stale sau khi chạy lại generator lần cuối).
Điều kiện còn lại của sản phẩm (đã ghi trong tài liệu, không phải finding): **chưa dogfood trong một phiên thật** vì BUG-003 (profile desktop vẫn nạp 0.1.28), và t24 chưa kiểm **ruột auth nội bộ của host** (chỉ kiểm hợp đồng `requestRejection`).

## 2. Bảng đóng finding

| Finding | Đã đóng? | Bằng chứng máy chạy |
|---|---|---|
| **F1** TODO lệch số | **ĐÓNG** | `node tests/tmp/audit-c2/count.mjs` → `TASK_ROWS 26`, `BY_STATUS {"VERIFIED":23,"CANCELLED":1,"REVIEW":1,"IN_PROGRESS":1}`; header `docs/TODO.md:5` = VERIFIED=23 · CANCELLED=1 · REVIEW=1; t15 = 21/21 (`t15 EXIT=0`); hash mới nằm ở hàng t23 `docs/TODO.md:32`. Dư: split IN_PROGRESS/OPEN lệch 1 (→ **N2**) |
| **F2** DEPENDENCIES cũ | **ĐÓNG** (nội dung) | `docs/DEPENDENCIES.md:5` "Sinh lúc 2026-10-31T16:59:42.380Z · 24 task / 14 member"; grep `claimed|pending` chỉ còn 1 dòng = chú giải định dạng, **0 hàng trạng thái sai**; danh sách id có t20–t24, thiếu t25/t26 (sinh trước khi 2 task đó tồn tại) → chỉ còn stale thời điểm |
| **F3** chưa test auth fence /plan | **ĐÓNG** | `node tests/t24-auth-fence.mjs` → **EXIT=0, 12/12**: C1/C1b GET+DELETE → 405; C2 body 1 000 096 B → 413; C2b 900 049 B → 400; C5 gate reject → 401; C9 → 403; C10 unbound → 503; C6 fence chạy TRƯỚC method check (GET bị từ chối → 401, không phải 405); C4 gate được hỏi đúng 1 lần/request; C7 `/state` cũng sau fence |
| **F4** source map cũ | **ĐÓNG** | `node tests/tmp/audit-c1/probe.mjs` → `MAP sources 19 MemberControlsIndex 12 sourcesContentLen 12884`, `MAP_MC_CONTENT_EQUALS_SOURCE true`; map `70cb6e90…` / 322 244 B; build lần 2 vẫn cùng hash |
| **F5** bundle nhúng đường dẫn ổ đĩa | **ĐÓNG** | `ABS_PATH_HITS 0 []` trên `lib/client.js`; JSON.parse map → `badSources=0`, `sourcesContentWithDrivePath=0`; chỉ còn 3 comment tương đối: `// css-module:lib/client/{AgentTeamsCard,ActivityPanel,WorkspaceActivity}.module.css` |
| **L1** overclaim "đã cài" | **ĐÓNG** | `docs/bao-cao-agent-teams.md:8` "đóng gói sẵn trong `packages/dsh-agent-teams` — **chưa cài vào profile nào** (đó chính là BUG-003…)"; grep `đã cài` trong docs báo cáo = 0 |
| **L2** hàng test `t17` giả | **ĐÓNG** | `ls tests/*.mjs` → 8 suite, **không có t17**; báo cáo chỉ nhắc t17 dưới dạng phủ định: `docs/bao-cao-agent-teams.md:52` "không có suite `t17` riêng" (parity 12 case gộp vào hàng t15) |
| **L3** số liệu cũ + Telegram | **ĐÓNG** | `docs/bao-cao-telegram/ky-01..07.md`: `message_id: 5/6/7/9/11/13/15` (chat -1004360988691, gửi thật qua `tools/telegram-report.mjs`); TODO 26 hàng ≥ 24 |

## 3. Kết quả C1–C6 (lệnh thật, output trích)

**C1 — t23:** chạy `node build/build.mjs` **hai lần**:
`FILE lib/client.js d28532e722c076d6f5ce94c7b1fcd924e9b86e2e8782bf6d41c633be3145cc91 191153` (giống hệt sau cả 2 lần, và giống baseline trước khi build ⇒ build là no-op trên đầu ra)
`FILE lib/client.js.map 70cb6e908543dc8a1e7f54a0e5fcea05113f6fe17441741982f3ddc39d4c4841 322244` · `build/client.js.map 8412f1dd… 327637` (không đổi) · `node --check lib/client.js` → `NODE_CHECK_OK` · `node tests/t10-ui-bundle-smoke.mjs` → `TOTAL 22 checks, 22 passed, 0 failed`, EXIT=0.
Quét theo cảnh báo phương pháp: văn bản thô `client.js` 0 hit; **map đọc qua `JSON.parse`** — `sources` 0 phần tử chứa ký tự ổ đĩa, `sourcesContent` 0 hit.

**C2 — t25:** (a) báo cáo không còn claim đã cài (dẫn chứng L1 ở §2); (b) `TODO` 26 hàng, đếm khớp header trừ split IN_PROGRESS/OPEN; (c) `DEPENDENCIES` 24 task/14 member tại 16:59:42Z, 0 hàng trạng thái sai; (d) Telegram id thật 7 kỳ.

**C3 — thử phá `tools/check-doc-paths.mjs`** (chèn vào đúng tệp được quét, rồi khôi phục):
```
DOC_SHA_BEFORE=d4fb1a5a5f7f55c93ea8272ea07722f6fa1b303180261137b5d338be293d0b32
baseline  EXIT=0  NO_LINES=0  SUMMARY files=4 paths=44 paths_missing=0 links=39 links_missing=0
mutated   EXIT=1  NO_LINES=2  SUMMARY files=4 paths=45 paths_missing=1 links=40 links_missing=1
    tests/t26-khong-ton-tai.mjs | NO
    docs/bao-cao-agent-teams.md -> khong-ton-tai-t26.md | NO
RESTORED_SHA=d4fb1a5a…d0b32 IDENTICAL=true
restored  EXIT=0  NO_LINES=0
VERDICT_C3 PASS (mutation-sensitive, restored byte-identical)
```
⇒ checker không phải PASS giả: nó bắt **cả** đường dẫn inline **và** link markdown hỏng, và tệp báo cáo đã được khôi phục byte-identical (sha256 trùng bản gốc).

**C4 — chạy lại toàn bộ suite ship kèm** (đều EXIT=0, log `tests/tmp/audit-c4/*.log`):

| Suite | Kết quả | Suite | Kết quả |
|---|---|---|---|
| t3-route-smoke | 18/18 | t20-erp-compat | 15/15 (sha256 nguồn ERP `9f7420b6…` không đổi) |
| t4-control-plane-smoke | 22/22 | t21-add-member-e2e | PASS A1–A7, unproved none |
| t10-ui-bundle-smoke | 22/22 | t24-auth-fence | 12/12 |
| t15-activate-member | 21/21 | t18 `--analyze` | PASS C1–C9, unproved none |
| t11 `--analyze` | PASS C1–C8 (11 checks, 0 failed) | | |

**C5 — provenance `packages/PROVENANCE-v0.1.28.json`** (129 tệp ghi, đối chiếu sha256 từng tệp):
`SAME=107 CHANGED=22 MISSING=0`. 22 tệp đổi chia đúng 4 nhóm chủ ý:
(1) danh tính fork — `package.json`, `cordis.patch.yml`;
(2) artefact build — `lib/client.js`, `lib/client.js.map`;
(3) mã/kiểu cho 2 tính năng + UI — `lib/members.js`, `lib/state.js`, `lib/tools.js`, `lib/index.js`, `lib/snapshot.js`, `lib/tool-names.js`, `lib/client/{ActivityPanel,WorkspaceActivity,StagingPlanEditor,locales}.js`, 6 tệp `lib/types/*.d.ts`;
(4) **`pnpm-workspace.yaml`** — không nằm trong danh sách dự kiến và không tài liệu nào nhắc (→ **N3**).
Tệp mới ngoài provenance trong `lib/**`: **4** — `lib/client/MemberControls.js` (đúng chủ ý, UI mới) + 3 `*.module.css`; provenance ghi **0 tệp .css** ⇒ phạm vi băm không phủ CSS (→ **N4**).

**C6 — tên/phiên bản:** `package.json:2-3` `"@nami/dsh-agent-teams"` / `"0.2.0-dev.0"`; `cordis.patch.yml:11` `- id: agent-teams`, `:15` `name: '@nami/dsh-agent-teams'` (khớp package.json); `lib/harness-compat.js:69` và `lib/client/WorkspaceActivity.js:13` **vẫn** `@nanmicoder/…` — đúng như F6 (giữ có chủ ý để không mất khoá UI đã lưu + wrapper legacy); nếu chúng bị đổi thì mới là hồi quy.

## 4. Phát hiện mới (không chặn phát hành)

| ID | Mức | Nội dung | file:dòng | Cách tái hiện | Đề xuất |
|---|---|---|---|---|---|
| **N1** | low | Bảng kiểm thử trong báo cáo người dùng còn số cũ: ghi bundle sha256 `01aadd77…f178` / 191 298 B, trong khi bản phát hành là `d28532e7…cc91` / 191 153 B; bảng cũng **thiếu hàng t24** (auth fence 12/12) dù suite đã ship | `docs/bao-cao-agent-teams.md:51` (và bảng §4 thiếu t24) | `node tests/tmp/audit-c1/probe.mjs` → d28532e7…/191153; `node tests/t24-auth-fence.mjs` → 12/12 | Thay hash bằng d28532e7… hoặc bỏ hash khỏi hàng t10; thêm hàng `tests/t24-auth-fence.mjs | 12/12` |
| **N2** | low | Header TODO đếm split sai: ghi `IN_PROGRESS=0 · OPEN=1 (t26)` nhưng hàng t26 có trạng thái IN_PROGRESS (tổng 26 vẫn đúng) | `docs/TODO.md:5` vs hàng `t26` | `node tests/tmp/audit-c2/count.mjs` → `IN_PROGRESS:1` | Cho generator đếm theo cột trạng thái thay vì viết tay |
| **N3** | low | `pnpm-workspace.yaml` bị đổi so với 0.1.28 (pin `@deepseek-ai/dsh*` = 0.2.1-rc.2) nhưng không có trong danh sách thay đổi dự kiến và không tài liệu nào nhắc | `packages/dsh-agent-teams/pnpm-workspace.yaml`; provenance ghi sha `e0abb26a…` vs hiện tại `66b864d8…` | `node tests/tmp/audit-c5/prov.mjs` → dòng `pnpm-workspace.yaml 66b864d8 vs e0abb26a` | Ghi 1 dòng vào `docs/DEPENDENCIES.md` hoặc `README` lý do pin, hoặc khôi phục bản upstream nếu không cần |
| **N4** | info | Provenance băm 129 tệp nhưng **0 tệp `.css`**, nên 3 CSS module hiện có không thể đối chiếu "có đổi hay không"; nếu CSS hồi quy thì provenance không phát hiện được | `packages/PROVENANCE-v0.1.28.json` (`files` không có `.css`) | `node -e "const p=require('./packages/PROVENANCE-v0.1.28.json');console.log(Object.keys(p.files).filter(f=>f.endsWith('.css')).length)"` → 0 | Nếu muốn provenance làm hàng rào đầy đủ: băm lại toàn bộ (gồm `.css`), hoặc ghi rõ phạm vi loại trừ |

## 5. Kết luận

Lớp mã: **ĐẠT** — F3 (auth fence) và F4/F5 (build/bundle) đã đóng bằng test thật do tôi tự chạy; 9 suite/11 nhóm kiểm đều EXIT=0; không phát hiện PASS giả nào trong 3 task vừa rồi (checker có mutation test riêng, chạy đúng 2 chiều).
Lớp hồ sơ: còn **N1 + N2** (sửa trong 1 lượt, ~10 phút) và **chạy lại `node tools/dependency-report.mjs`** sau khi t26 đóng — xong là đủ điều kiện giao.
Giới hạn phải nói khi giao: chưa dogfood trong phiên thật (BUG-003), chưa kiểm ruột auth nội bộ của host, rollback `0.2.x → 0.1.28` chưa chạy.
