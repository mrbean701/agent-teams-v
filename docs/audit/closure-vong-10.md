# Audit closure vòng 10 — tarball t78 (`@nami/dsh-agent-teams` 0.2.0-dev.0)

Người chấm: audit-goat (độc lập, không viết mã sản phẩm) · task t79 · attempt `41015421-8553-4707-bc19-ece26e8f5589` · 2026-10-31T21:02:17.906Z
Mọi số dưới đây do tôi tự đo trên đĩa (node `crypto`/`fs`, `tar -tzf`), **không** dùng `--analyze` làm bằng chứng. Log: `tests/tmp/audit-v10/`.

## 0. Verdict

**TARBALL t78 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CHƯA.** Lớp mã và tarball ĐẠT: 0 blocker/high/medium trong mã, 42/42 suite EXIT 0, 4 mutation riêng đều làm suite đỏ rồi phục hồi byte-identical, 12/12 tệp payload = bản cài = nguồn, toàn bộ 133 tệp payload trùng nguồn, 0 rác.
Điều kiện công bố duy nhất còn lại là **tài liệu** (V10-F1 high): `docs/bao-cao-agent-teams.md` vẫn chỉ người vận hành kiểm sha256 của tarball **t75** đã bị t78 thay thế. Không có lỗi mã nào bị chặn.

## 1. Bảng kiểm C1..C7

| # | Nội dung | Kết quả | Bằng chứng |
|---|---|---|---|
| C1 | tarball t78 đo độc lập: sha256, byte, entry, rác, tệp bắt buộc | ĐẠT | `cb234b085f5c…7d6e50` / 2 241 383 B / 133 entry / 0 thư mục; 7/7 tệp bắt buộc (gồm `lib/types/snapshot.d.ts`); node_modules=0, `package/tests`=0, `.tgz` lồng=0, `.pid`=0, `package/tools`=0; repack cùng sha256+size |
| C2 | ba chiều payload ↔ bản cài `agent-teams-pack9` ↔ nguồn | ĐẠT | 12/12 SAME ở cả ba chiều; **toàn bộ** 133 tệp payload so với nguồn: 0 lệch, 0 tệp chỉ có trong tarball; bản cài là thư mục thật (`lstat.isSymbolicLink=false`), 0 dependency / 24 peer |
| C3 | chấm t77 bằng máy | ĐẠT | `node tests/t77-types-captain-route.mjs` → EXIT=0 `# 18/18 passed, 0 failed`; kèm t74 24/24, t10 48/48 |
| C4 | ≥3 mutation kiểu MỚI, phục hồi byte-identical | ĐẠT | M1..M4 ở §3, mỗi ca EXIT=1 rồi khôi phục đúng sha gốc; drift sau mutation = 0 |
| C5 | toàn bộ suite + công cụ tài liệu | ĐẠT | 42/42 EXIT 0 (26 pure + 16 `--analyze` có artifact thật); `check-doc-paths --summary` → `files=5 paths=71 paths_missing=0 links=41 links_missing=0`; `dependency-report` → `tasks=80 realEdges=90 derivedEdges=85 waves=40 problems=0` |
| C6 | rà tài liệu khớp số đo, grep số cũ = 0 | **KHÔNG ĐẠT** | V10-F1: `818dff22` xuất hiện 4 lần (:50, :55, :101, :133) như thể là bản phát hành hiện hành; `47/47` (:78) trong khi đo được 48/48; `tasks=77` (:102) trong khi đo được 80; V10-F2 telegram 28 vs 29 |
| C7 | verdict + findings | ĐẠT | tài liệu này + entry trong `docs/log/AUDIT.md` |

## 2. Số đo của tôi (không qua `--analyze`)

Nguồn (`packages/dsh-agent-teams`), 12 tệp:
`lib/tools.js` `a01b1a1018cb`/194 888 · `lib/members.js` `1562be4d527d`/99 402 · `lib/state.js` `7b49f5ab1d46`/56 282 · `lib/snapshot.js` `a2a87e1b0c0b`/13 986 · `lib/index.js` `2d28e617f068`/45 315 · `lib/tool-names.js` `e3def5db908d`/808 · `lib/client.js` `9da18d9971a2`/258 432 · `lib/client.js.map` `bbf88608f54e`/404 958 · `lib/types/members.d.ts` `b1ffe1544003`/27 660 · `lib/types/snapshot.d.ts` `962f99a7bcb1`/7 627 · `lib/client/ActivityPanel.module.css` `53ea47c6d780`/51 837 · `package.json` `92a6404071e4`/10 498.
Khớp đúng bảng đóng băng của captain (12/12) và khớp `meta.json` cửa t78 (`threeWay` 12/12, `drift=0` trước/sau pack).

Tarball: `packages/dsh-agent-teams/tests/tmp/t78/nami-dsh-agent-teams-0.2.0-dev.0.tgz` — sha256 `cb234b085f5c304938ddfbd8f66affd2c614b9f48d78da2e1c22bf893a7d6e50`, **2 241 383 B**, **133 entry**, mtime `2026-10-31T20:55:37Z`; `repack/` cùng sha256 + cùng size (pack tất định). Tarball cũ đều bị thay thế: t75 `818dff22…`/2 241 026 B, t72 `5137df03…`/2 239 517 B, t68 `03bed22f…`, t52 `5306f31b…`.
Bản cài `C:/Users/thang/.dsh/profiles/agent-teams-pack9/node_modules/@nami/dsh-agent-teams`: 12/12 SAME (không phải symlink), `version 0.2.0-dev.0`.
`E:/Project/ERP/.agent-teams/erp-erp/team.json`: `9f7420b6a1af…15f2d1e` / 1 533 117 B / mtime `2026-10-24T04:53:13Z` — không đổi trước và sau toàn bộ lượt chấm.

## 3. Bốn mutation kiểu mới (đều đỏ, đều phục hồi byte-identical)

| Mã | Kiểu (chưa từng dùng trong các vòng trước) | Trước → sau | Suite | Kết quả |
|---|---|---|---|---|
| M1 | bỏ tính optional của khai báo: `readonly captainRoute?:` → `readonly captainRoute:` tại `lib/types/snapshot.d.ts:108` | `962f99a7bcb1`/7 627 → `6b7f82e71527`/7 626 (−1 B) | `t77-types-captain-route.mjs` | **EXIT=1**, 12/18: `not ok 1 a1 … optional`, `not ok 4 a4 declarations agree with the implementation`, `not ok 15 n2 a REQUIRED captainRoute is rejected` |
| M2 | bỏ guard nửa route: `lib/snapshot.js:63` `if (provider === '' \|\| model === '')` → `if (false)` | `a2a87e1b0c0b`/13 986 → `526f2d9afde7`/13 960 (−26 B) | t77 + `t74-captain-route-warning.mjs` | **EXIT=1** cả hai: `not ok 12 b5 the key is ABSENT where the declaration says it can be`; `FAIL 18 (f7) a HALF-declared route is not published as a usable one - absent for provider-only` |
| M3 | đảo thứ tự ưu tiên route: vô hiệu nhánh override trong `routeOf` (`lib/members.js:448`) | `1562be4d527d`/99 402 → `ff189bb0b5b2`/99 411 (+9 B) | `t3-route-smoke.mjs` + `t37-route-clear.mjs` | **EXIT=1** cả hai: `not ok 2 routeOf: override beats active once the fallback flag is cleared`, `not ok 8 currentMemberRoute: a cold member resolves routeOverride`; t37 `FAIL a1/c1/g1` (16/18) |
| M4 | ghim danh tính bundle (đóng V9-F3): thêm 1 byte vào `lib/client.js` | `9da18d9971a2`/258 432 → `3f468bbcb8ef`/258 433 | `t10-ui-bundle-smoke.mjs` | **EXIT=1**, 47/48: `FAIL bundle identity matches the pinned sha256 + bytes :: sha256 3f468bbc… != 9da18d99…; bytes 258433 != 258432` ⇒ ghim của t80 **có tác dụng thật**, không còn là assert luôn-xanh |

Mỗi ca: sao lưu → sửa → chạy suite → `fs.copyFileSync` phục hồi → so sha: **khôi phục identical 4/4** (M1 `962f99a7bcb1`, M2 `a2a87e1b0c0b`, M3 `1562be4d527d`, M4 `9da18d9971a2`). Đo lại sau cùng: 12/12 nguồn không đổi, tarball t78 cùng sha256, ba chiều 12/12 SAME, ERP không đổi.

## 4. Quét toàn bộ suite (EXIT đọc trực tiếp, không pipe)

26 suite pure — tất cả EXIT 0: t3 18/18 · t4 22/22 · t10 48/48 · t15 21/21 · t20 15/15 · t24 12/12 · t28 20/20 · t30 8/8 · t37 14/14 · t38 17/17 · t39 11/11 · t40 20/20 · t43 19/19 · t44 11/11 · t46 15/15 · t48 6/6 · t49 16/16 · t50 11/11 · t54 14/14 · t56 12/12 · t57 29/29 · t58 23/23 · t62 27/27 · t70 16/16 · t74 24/24 · t77 18/18.
16 suite `--analyze` (chỉ gọi lại artifact đã có, KHÔNG tính là bằng chứng mới) — tất cả EXIT 0: t11 (PASS C1..C8) · t18 (C1..C9, unproved none) · t21 (A1..A7) · t27 (16/16) · t29 · t35 7/7 · t42 9/9 · t45 (C1..C7) · t51 (C1..C6) · t52 12/12 · t59 · t63 14/14 · t68 14/14 · t72 15/15 · t75 · t78 16/16.
Quét fake PASS trên 42 tệp `tests/*.mjs`: 0 `.skip(`, 0 `catch {}` rỗng. Các chuỗi `process.exit(0)` nằm trong probe nhúng của suite pack (t42/t52/t63/t68/t72/t75/t78) — cùng lớp V9-F4, là probe tự chạy chứ không phải nhánh bỏ qua.

## 5. Findings

| ID | Mức | Vị trí | Vấn đề | Tái hiện | Cách sửa |
|---|---|---|---|---|---|
| V10-F1 | **high** | `docs/bao-cao-agent-teams.md:50, :55, :101, :133` | Bản phát hành hiện hành vẫn được ghi là **t75** `818dff22…a304` / 2 241 026 B, trong khi bản đúng là **t78** `cb234b08…7d6e50` / 2 241 383 B; §4 thiếu hàng t77/t78/t80; `:78` ghi t10 `47/47` (đo được 48/48 sau khi t80 ghim hash); `:102` ghi `tasks=77` (đo được 80). Người vận hành làm theo §2.3 sẽ kiểm sai sha256. | `grep -c 818dff22 docs/bao-cao-agent-teams.md` → 4; `grep -n "47/47\|tasks=77"` → :78, :102 | dev-ui-goat cập nhật §2.3/§2.4/§2.5 + §3 + §4 + :101/:133 sang t78, thêm hàng t77 (18/18) và t80 (ghim hash), sửa t10 48/48 và `tasks=80`; giữ t75 trong danh sách đã-bị-thay-thế |
| V10-F2 | low | `docs/bao-cao-agent-teams.md:103` | Ghi “28 kỳ, cả 28 tệp ghi `message_id`”; thực tế `docs/bao-cao-telegram/` có **29** tệp (ky-01..ky-29), **28** tệp có id, `ky-29.md` không có dòng id nào. | `node -e` đếm `readdirSync` + regex `message_?id` → `29 28` | Sửa thành “29 tệp, 28 tệp có `message_id`, ky-29 là ghi chú nội bộ chưa gửi” — hoặc gửi nốt kỳ 29 rồi cập nhật |
| V10-F3 | low | `docs/TODO.md:4` vs hàng `t79` trong bảng | Header ghi `IN_PROGRESS=1 (t79) · OPEN=0` nhưng hàng t79 trong bảng vẫn ở trạng thái `OPEN`; đếm theo cột trạng thái ra `OPEN=1`. | đếm cột 2 của các hàng `| tNN |` → `OPEN=1` | dev-ui-goat đổi hàng t79 sang `IN_PROGRESS` (hoặc `VERIFIED` sau khi tôi đóng) và chạy lại đếm header |
| V10-F4 | info | `docs/TODO.md:4` vs bảng task của host | Header `CANCELLED=3 (t9, t63, t64)`, nhưng bo mạch đếm `completed=75, failed=1 (t51), cancelled=2 (t63, t64), pending=1 (t66)`. t51 bị bo mạch ghi `failed` (attempt 1 FAIL **thật và có bằng chứng**, C6 là khuyết điểm sản phẩm) trong khi TODO ghi `VERIFIED` — hàng TODO :59 giải thích đúng (lượt 1 FAIL đúng ⇒ t54 sửa ⇒ nay PASS C1..C6), nên **không phải PASS giả**; chỉ là cách gộp trạng thái khác nhau. | `agent_teams_status` đếm theo `status`; so hàng :59 | Ghi chú một dòng ở header TODO rằng cột CANCELLED gộp cả lượt FAIL-đúng-đã-sửa; không cần sửa mã |
| V10-F5 | info | `tests/t27-rollback.mjs --analyze` | `--analyze` phát lại **văn bản của lượt chạy cũ**: in `DOC SAI muc 5 buoc 1/2/3` và `muc 7 … chua chay`, trong khi `docs/van-hanh/di-migrate-va-rollback.md` §5/§5.2 đã được viết lại đúng (4 bước thao tác tệp; cảnh báo `dsh plugin` là pnpm passthrough và `add` cần registry) và §7 đã ghi “ĐÃ CHẠY và ĐẠT (t27)”. Đọc `--analyze` như verdict tài liệu tươi là sai. | `node tests/t27-rollback.mjs --analyze tests/tmp/e2e-t27rollback/2026-10-31T17-30-13-440Z` → in `DOC SAI …`, EXIT=0 | Không sửa gì; khi chấm tài liệu phải chạy live hoặc đọc trực tiếp tệp (vòng này tôi đọc trực tiếp :88-:122, :149-:151) |
| V10-F6 | info | artifact của `tests/t21-add-member-e2e.mjs` | Chính suite khai trong bằng chứng: “synthetic host: the headless profile registers no webServer service, so /plan cannot be mounted inside the real session; the handler is the shipped one and the socket is real” ⇒ A6/A7 chứng minh **handler + socket thật**, không chứng minh route `/plan` được mount trong Host thật. | `node tests/t21-add-member-e2e.mjs --analyze tests/tmp/e2e-addmember/2026-10-31T17-10-25` | Giữ nguyên; muốn chứng minh mount thật thì phải boot Host có `webServer` (task riêng, không phải audit này) |
| V10-F7 | info | `tools/dependency-report.mjs` | Như các vòng trước: công cụ này **ghi đè** `docs/DEPENDENCIES.md` (ngoài phạm vi ghi của audit); repo không phải git working tree nên không chứng minh được nội dung trước/sau. Tôi chạy vì C5 yêu cầu và ghi lại đây. | `node tools/dependency-report.mjs` → `wrote docs\DEPENDENCIES.md ; tasks=80 … problems=0` | Không sửa; nếu muốn audit không ghi ra ngoài phạm vi thì thêm cờ `--dry-run` |

## 6. Giới hạn của audit này

- Không chấm lại nội dung `--analyze`: 16 suite đó chỉ được ghi nhận EXIT=0, không dùng làm bằng chứng cho bất kỳ kết luận nào ở §0.
- Các chứng minh E2E (đổi route khi member chạy, thêm member qua HTTP, fallback tự động) đến từ artifact **có sẵn**; tôi chỉ chạy lại `--analyze`, không boot Host mới (hạn mức 30 lệnh, không dùng quota).
- V10-F6 (mount `/plan` trong Host thật) và V10-F5 (t27 phải chạy live mới chấm được tài liệu) là hai điểm mù đã biết, không phải phát hiện mới.
- Không mutation nào trên `tests/**`, `build/**`, `docs/TODO.md`; 4 mutation chỉ chạm `lib/**` và đều phục hồi byte-identical (sha ở §3).

## 7. Điều kiện phát hành (còn lại)

1. **dev-ui-goat**: sửa V10-F1 (bốn vị trí + §4 + :102), V10-F2, V10-F3. Sau đó **không pack lại**, không đổi `lib/**` → tarball t78 `cb234b08…` vẫn là bản đã chấm.
2. **captain**: xác nhận tarball t78 vẫn `cb234b08…`/2 241 383 B/133 entry ngay trước khi cài (lệnh kiểm nằm ở `docs/bao-cao-agent-teams.md` §2.3 sau khi sửa).
3. Nếu ai đó buộc phải sửa `lib/**` sau vòng này: **phải repack + audit lại** — t78 mất hiệu lực.
