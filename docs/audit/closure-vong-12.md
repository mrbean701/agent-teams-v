# Audit closure vòng 12 — tarball t88 + vá probe V11-F3 (t89)

Người chấm: audit-goat (độc lập, không viết mã plugin) · attempt 69c8787f-325d-4a36-931b-325b2f5b7fad · 2026-10-31/11-01.
Đối tượng: `packages/dsh-agent-teams/tests/tmp/t88/nami-dsh-agent-teams-0.2.0-dev.0.tgz` + toàn bộ nguồn hiện tại (reviewed task t88, vá t87 + probe V11-F3).
Phạm vi ghi: `docs/audit/**`, `docs/log/AUDIT.md`, `tests/tmp/**`. `lib/**` chỉ mutation tạm, phục hồi byte-identical; không sửa `tools/**`, `docs/TODO.md`, `E:/Project/ERP/**`.

## 0. Verdict

**TARBALL t88: PHÁT HÀNH ĐƯỢC.** Điều kiện công bố: 2 chỉnh tài liệu nhỏ (V12-F2, V12-F3) — không chặn cài, chỉ chặn thông cáo.

- Gói + mã sạch: 133/133 tệp payload **bằng đúng** nguồn (0 lệch, 0 tệp chỉ-có-trong-gói, 0 tệp nguồn thiếu trong gói), 12/12 tệp then chốt khớp cả ba chiều (nguồn ↔ payload ↔ bản cài `agent-teams-pack11`), 0 rác, 0 entry thư mục, repack cùng sha256.
- 47 suite: **46/47 EXIT 0**; lượt đỏ duy nhất là `tests/t84-pack.mjs --analyze` — suite bị vá sau lượt chạy nên meta của chính nó thiếu trường mới (**V12-F1 medium**, lỗi truy vết, không phải lỗi sản phẩm).
- Không có fake PASS mới: 3 mutation kiểu mới + 1 drill artifact đều làm suite đỏ thật rồi được phục hồi byte-identical (§3); probe export của `tests/t84-pack.mjs` và `tests/t88-pack.mjs` đỏ đúng khi thiếu 1 named export (§1 C3).

## 1. Bảng yêu cầu C1..C7

| # | Yêu cầu | Kết quả | Bằng chứng (scratch `tests/tmp/audit-v12/`) |
|---|---|---|---|
| C1 | Tự hash/tar/giải nén, không dùng `--analyze` | ĐẠT | sha256 `0adbc64e1564b079048c465634ba9d38e9795bdfa2662269a514124524ceed2c` / **2 243 224 B** / **133 entry** / **0 entry thư mục**; repack cùng sha+size; rác `node_modules`/`package/tests`/`.tgz` lồng/`.pid`/`package/tools` đều 0 — `measure.json` |
| C2 | Ba chiều 12/12 nguồn ↔ payload ↔ bản cài | ĐẠT | payload ↔ nguồn: 133 tệp, same=133, diff=0, notInSource=0, sourceMissing=0; `agent-teams-pack11` không symlink, 0.2.0-dev.0, 0 dependency / 24 peer, 12/12 SAME — `measure.json` |
| C3 | Chứng minh probe export giờ đỏ khi thiếu 1 named export | ĐẠT | Trích **chính đoạn probe đã ship** từ `tests/t84-pack.mjs:673` (608 B) và `tests/t88-pack.mjs:689`; đủ tên ⇒ exit **0**; thiếu `__audit_v12_missing_export__` ⇒ exit **1**, stderr `missing named export: …`; module không tồn tại ⇒ exit **1** — `probe-t84.json`, `probe.log` |
| C4 | ≥3 mutation kiểu mới, phục hồi byte-identical | ĐẠT | M1/M2/M3 + drill artifact (§3); mọi sha sau phục hồi trùng đúng sha gốc — `mutations.json`, `mutation-m1.json`, `artifact-drill.json` |
| C5 | Chạy lại toàn bộ suite + công cụ tài liệu | ĐẠT (có giải thích) | 46/47 EXIT 0 (`sweep.json`); `check-doc-paths --summary` → `files=5 paths=79 paths_missing=0 links=41 links_missing=0`; `dependency-report` → `tasks=89 realEdges=93 derivedEdges=97 waves=44 problems=0`; lượt đỏ = V12-F1 |
| C6 | ERP không bị chạm | ĐẠT | `E:/Project/ERP/.agent-teams/erp-erp/team.json` sha `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e` / 1 533 117 B / mtime `2026-10-24T04:53:13.185Z` — đo trước và sau toàn bộ lượt chấm |
| C7 | Verdict + V12-F* + điều kiện hết hiệu lực | ĐẠT | §0, §5, §6 tài liệu này + mục mới trong `docs/log/AUDIT.md` |

## 2. Đo độc lập (không dùng số của member, không dùng `--analyze`)

- Tarball: sha256 `0adbc64e…524ceed2c`, **2 243 224 B**, `tar -tzf` **133 entry, 0 entry thư mục**. Tệp `.tgz` duy nhất còn lại trong `tests/tmp/t88` là bản repack và **cùng sha256 + cùng size** ⇒ npm pack tất định.
- 12 tệp then chốt (payload = nguồn = bản cài): `lib/tools.js` `9be217b1669a`/197 372 · `lib/members.js` `4f818b73803d`/100 367 · `lib/state.js` `7b49f5ab1d46`/56 282 · `lib/snapshot.js` `a2a87e1b0c0b`/13 986 · `lib/index.js` `2d28e617f068`/45 315 · `lib/tool-names.js` `e3def5db908d`/808 · `lib/client.js` `9da18d9971a2`/258 432 · `lib/client.js.map` `bbf88608f54e`/404 958 · `lib/types/members.d.ts` `c53250ab41bf`/31 769 · `lib/types/snapshot.d.ts` `962f99a7bcb1`/7 627 · `lib/client/ActivityPanel.module.css` `53ea47c6d780`/51 837 · `package.json` `92a6404071e4`/10 498.
- Đo lại lần hai sau **toàn bộ** mutation + sweep: 12/12 vẫn đúng bảng đóng băng, tarball vẫn `0adbc64e…`/2 243 224 B, ERP vẫn `9f7420b6…` ⇒ `DRIFT_GUARD PASS` (`measure2.json`).
- Tĩnh: 47 tệp `tests/*.mjs` — 0 `.skip(`, 0 `catch {}` rỗng, **27** chỗ `process.exit(0)` đều nằm trong payload probe con nhúng trong chuỗi (t42:302, t52:309/551/552, t63:309/566/567, t68:305/569/570, t72:304/575/576, t75:304/577/578, t78:305/590/591, t84:321/326/659/678, t88:327/332/675/694) ⇒ không phải PASS giả.

## 3. Mutation kiểu mới (mỗi ca in applies + delta byte, chạy suite, phục hồi)

| Mã | Kiểu (chưa dùng ở vòng 5–11) | Tệp:dòng | Delta | sha trước → sau | Suite đỏ |
|---|---|---|---|---|---|
| M1 | **Hoán vị hai trường** khi gán vào spine | `lib/tools.js` cặp dòng `member.provider = selection.provider;` / `member.model = selection.model;` (lần xuất hiện **cuối** = nhánh approve, idx 42063, cách nhau 54 B) | 0 B | `9be217b1669a` → `5ab6a73d6ac2` | `t87` EXIT 1 (a1, b1, e1); `t86` EXIT 1 (c2) |
| M2 | **Đảo nhánh fallback** | `lib/members.js:440` `if (member.fallbackActive === true) {` → `!== true` | 0 B | `4f818b73803d` → `f39cc73c7513` | `t37` EXIT 1 (`FAIL h1 …`) |
| M3 | **Đổi tên một named export thật** | `lib/members.js:486` `export function selectionFromMember(` → `selectionFromMemberX(` | +1 B | `4f818b73803d` → `e323b4b9805f` | `t86` EXIT 1 (a1,a2,d1); `t87` EXIT 1 (a1,a2,a3) |
| M4 | **Sửa 1 byte trong artifact ĐÃ GIẢI NÉN** (không phải nguồn) | `extract-drill/package/lib/client.js` thêm 1 byte | +1 B | payload `645bc31a930a`/258 433 | Phép so ba chiều: 132 same / **1 diff** (`lib/client.js`); giải nén lại ⇒ 133 same / 0 diff |

Baseline trước mutation (chạy thật): `t87` 8/8 · `t86` 8/8 · `t38` 17/17 · `t37` 14/14 · `t54` 14/14, đều EXIT 0. Sau khi phục hồi: y hệt, và mọi sha phục hồi **trùng đúng** sha gốc (`RESTORE_ALL_IDENTICAL=true`).

## 4. Quét hồi quy: 47 suite

- **29 pure / 18 `--analyze`**, tổng **46 EXIT 0**. Các mốc: t10 48/48 · t24 12/12 · t37 14/14 · t38 17/17 · t56 20/20 · t57 29/29 · t62 27/27 (sàn `:focus-visible 21 · :hover 16 · :disabled 12 · :active 4`) · t74 24/24 · t86 8/8 · t87 8/8 · t58 23/23 · t88 `--analyze` 23/23 · t59 `--analyze` PASS C1..C9.
- Hai suite E2E chạy **live** (không artifact): `t18` EXIT 0 (98 s, `verdict PASS — proved C1..C9`) và `t82` EXIT 0 (77 s) — bằng chứng mới, không đọc lại meta.
- Hai lượt đỏ: (a) `t21 --analyze` — **tôi** truyền nhầm thư mục con `…/2026-10-31T22-03-15/workspace/.agent-teams/e2e-addmember/inbox` (do sweep tự dò), chạy lại đúng `tests/tmp/e2e-addmember/2026-10-31T17-10-25` ⇒ **EXIT 0**, `verdict PASS — proved A1..A7`; (b) `t84 --analyze` ⇒ **V12-F1**.
- Công cụ tài liệu: `check-doc-paths --summary` `files=5 paths=79 paths_missing=0 links=41 links_missing=0` EXIT 0; `dependency-report` `tasks=89 realEdges=93 derivedEdges=97 waves=44 problems=0` EXIT 0.

## 5. Phát hiện

- **V12-F1 (medium, truy vết — không phải lỗi sản phẩm):** `tests/t84-pack.mjs` được vá V11-F3 **sau** các lượt chạy của chính nó, nên 3 `meta.json` của t84 (`run-2026-10-31T21-16-54Z`, `21-18-23Z`, `21-24-44Z`) đều 38 khóa và **không có `selfMutation`** ⇒ kiểm tra `C22` (`tests/t84-pack.mjs:566-572`) FAIL: `node tests/t84-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t84/run-2026-10-31T21-24-44Z` → **EXIT 1**. Trên artifact cũ hơn còn đỏ thêm C18/C19/C21 (`18/22`) vì nguồn đã đi tiếp. Probe live thì đỏ **đúng** (C3). **Fix:** chạy lại `node tests/t84-pack.mjs` một lượt sau quyết định freeze để sinh meta có `selfMutation`, hoặc cho C22 in `không áp dụng` khi `meta.selfMutation === undefined` thay vì FAIL.
- **V12-F2 (low, tài liệu):** `docs/TODO.md:4` ghi `VERIFIED=83` nhưng thân bảng đo được **84** hàng VERIFIED (+3 CANCELLED +1 SUPERSEDED +1 OPEN = 89 = tổng). Lệch 1, do header không cập nhật sau khi t88 chuyển VERIFIED. **Fix:** sửa header thành 84.
- **V12-F3 (low, tài liệu):** `docs/bao-cao-agent-teams.md:97-98` vẫn ghi `t3`/`t15` là `chưa chạy lại trong t60` / `2026-10-31 (chưa chạy lại)` trong khi vòng 11 và vòng 12 đã chạy lại: t3 18/18, t15 21/21, EXIT 0 (`sweep.json`). **Fix:** đổi cột Đo thành `t89, EXIT=0`.
- **V12-F4 (low):** `tests/t88-pack.mjs:679-681` (và bản sao ở `tests/t84-pack.mjs:679`) hứa `child exits 2 when the import itself threw`, đo thật là **exit 1**: nhánh `(e) => … process.exit(2)` có tham chiếu `want` khai báo bằng `const` **bên trong** callback thành công ⇒ `ReferenceError: want is not defined` ném trước `process.exit(2)`. Vẫn non-zero nên không fake PASS, nhưng hợp đồng trong comment sai. **Fix:** khai báo `want` ngoài callback, hoặc sửa comment thành `non-zero`.
- **V12-F5 (info):** `--analyze` vẫn chỉ chấm lại `meta.json`; t88 đã tự hash tarball trên đĩa (`C21`) nên tốt hơn vòng 11, nhưng không thay được bằng chứng chạy live.
- **V12-F6 (info):** `tools/dependency-report.mjs` **ghi đè** `docs/DEPENDENCIES.md` — ngoài phạm vi ghi của audit; repo không phải git nên không chứng minh được diff (đã tự khai, cùng lớp V6-F5/V11-F5).

## 6. Điều kiện hiệu lực của verdict

- Đúng cho **bộ byte** t88: `0adbc64e1564b079048c465634ba9d38e9795bdfa2662269a514124524ceed2c` / **2 243 224 B** / **133 entry**. `lib/**` hay bất kỳ tệp payload nào đổi sau mốc `2026-10-31T21:53:17Z` ⇒ verdict **hết hiệu lực**, phải pack lại và audit lại.
- **Không pack lại t88.** Người vận hành tự kiểm sha256 + size + 133 entry trước khi cài (`npm i --offline --legacy-peer-deps …`).
- V12-F1/F2/F3 thuộc suite + tài liệu, **không chặn cài**; V12-F2/F3 nên sửa trước khi gửi thông cáo.

## 7. Giới hạn của audit

- Không boot Host mới để tiết kiệm quota; E2E dùng lại artifact hoặc chạy live suite sẵn có (t18, t82 EXIT 0).
- Không bấm GUI trên phiên sống — bằng chứng GUI là `docs/kiem-thu/dog-03-panel-live.md` của member, không phải của tôi.
- `peerDependencies` (24) do host cấp, không registry; `agent-teams/*` session event vẫn bị host bỏ (`lib/events.js:33-40`) ⇒ audit trail thật là `team.json routeOverride` + `docs/log/MODEL-SWITCH.md`.
- Số lệnh dùng: 16/40 · mutation: 4/5 · attempt 1/3.
