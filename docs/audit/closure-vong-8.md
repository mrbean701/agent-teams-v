# Audit closure vòng 8 — tarball t72 (`@nami/dsh-agent-teams` 0.2.0-dev.0)

**Auditor**: `audit-goat` — độc lập, không viết mã sản phẩm. **Task** t73 · **attempt** `76112114-97ba-47d5-97e6-22e0f8589690`.
**Thời điểm**: 2026-11-01 (giờ máy). **Đọc**: `packages/dsh-agent-teams/{lib,tests,tools}`, `docs/**`, profile cài `agent-teams-pack7`, `E:/Project/ERP`. **Ghi**: `docs/audit/**`, `docs/log/AUDIT.md`, `tests/tmp/audit-v8/**`.
**Mốc bị chấm**: `packages/dsh-agent-teams/tests/tmp/t72/nami-dsh-agent-teams-0.2.0-dev.0.tgz`.

## 0. Kết luận

**TARBALL t72 — PHÁT HÀNH ĐƯỢC. CÔNG BỐ — CHƯA.**

Mã nguồn và artefact sạch (0 blocker/high về mã). Bốn chỗ tài liệu còn trỏ bản cũ hoặc ghi số cũ (`V8-F1`…`V8-F4`) đủ để người vận hành cài nhầm `t68`, nên phải sửa trước khi công bố. Trả lời dứt khoát cho captain: **t72 dùng được cho ERP ngay sau khi sửa `docs/bao-cao-agent-teams.md:132-133`**; không có lỗi mã nào bị chặn.

## 1. Đối chiếu 6 việc captain yêu cầu

| Mã | Việc | Kết quả | Bằng chứng (tự đo, không tin `--analyze`) |
|---|---|---|---|
| C1 | Hình dạng tarball t72 | **ĐẠT** | sha256 `5137df03…c8ac`, **2 239 517 B**, **133 entry**; 12/12 tệp bắt buộc; forbidden `node_modules`=0 · `package/tests`=0 · `.tgz` lồng=0 · `.pid`=0 · `package/tools/`=0; 3 chiều 11/11 SAME |
| C2 | Mutation CỦA TÔI (≥2, khác 3 kiểu của captain) | **ĐẠT (4/4)** | §3: M1 `t62` EXIT 1 (6 FAIL) · M2 `t70` EXIT 1 (14/16) · M3 `t58` EXIT 1 (22/23) · M4 `t62` EXIT 1; cả 4 khôi phục byte-identical |
| C3 | ERP thật không bị chạm | **ĐẠT** | `E:/Project/ERP/.agent-teams/erp-erp/team.json` sha `9f7420b6a1af…15f2d1e`, 1 533 117 B, mtime `2026-10-24T04:53:13.185Z` |
| C4 | Chạy lại TOÀN BỘ suite + 2 tool tài liệu | **ĐẠT** | 38/38 EXIT 0 (§4); `paths_missing=0`; `problems=0` |
| C5 | Rà `docs/bao-cao-agent-teams.md` | **KHÔNG ĐẠT một phần** | 4 phát hiện `V8-F1..V8-F4` (§5); phần còn lại khớp đúng số tôi đo |
| C6 | Drift guard sau mutation | **ĐẠT** | 11/11 hash đóng băng khớp; tarball t72 đo lại y nguyên `5137df03…`/2 239 517 B |

## 2. Tự đo

- **Nguồn 11/11 khớp bảng đóng băng**: `lib/tools.js` `a01b1a1018cb`/194 888 · `lib/members.js` `1562be4d527d`/99 402 · `lib/state.js` `7b49f5ab1d46`/56 282 · `lib/snapshot.js` `92ecdd8759b6`/11 687 · `lib/index.js` `2d28e617f068`/45 315 · `lib/tool-names.js` `e3def5db908d`/808 · `lib/client.js` `5636cd9f66fd`/257 459 · `lib/client.js.map` `57892ef70e47`/403 287 · `lib/types/members.d.ts` `b1ffe1544003`/27 660 · `lib/client/ActivityPanel.module.css` `53ea47c6d780`/51 837 · `package.json` `92a6404071e4`/10 498.
- **Tarball**: parser tar tự viết → 133 entry = 133 tệp payload; 11/11 payload SAME với nguồn (`tests/tmp/audit-v8/measure.json`).
- **Bản cài thật `C:/Users/thang/.dsh/profiles/agent-teams-pack7/node_modules/@nami/dsh-agent-teams`**: `client.js` `5636cd9f66fd`/257 459 · CSS `53ea47c6d780`/51 837 · `tools.js` `a01b1a1018cb` · `MemberControls.js` `4a2959bce7da`/28 351 · `index.js` `2d28e617f068` · `package.json` `92a6404071e4` — trùng nguồn; `0` dependencies, 24 peerDependencies.
- **Bundle**: 257 298 ký tự, 719 lần token `aYQbCq_`, 150 tên lớp phân biệt, đủ 6/6 dấu vết t67+t71 (`aYQbCq_planSave`, `data-add-member-route-warning`, `data-add-member-route-default`, `data-add-member-catalog-empty`, `pickDefaultRoute`, `data-error-detail`). **CSS**: 51 837 B, 141 lớp, rule `.planSave:disabled{…}` 136 B còn nguyên.
- **Nuance đếm CSS (nói rõ để chấm lại không ra số khác)**: `t62` đếm mỗi selector MỘT lần theo biến thể khớp đầu tiên trong `STATE_ORDER` → sàn `:focus-visible`/`:hover`/`:disabled`/`:active` = `21/16/12/4`. Đếm chuỗi thô ra `21/16/18/10` vì `:disabled` còn nằm trong `:not(:disabled)` (15 lần `:not(` trong tệp) và `:active` nằm trong selector ghép. Sàn là **theo selector**, không theo số lần xuất hiện văn bản.

## 3. Bốn mutation của tôi (khác cả 3 kiểu captain đã làm)

| Mã | Sửa gì | sha sau sửa / delta | Suite | Kết quả đo |
|---|---|---|---|---|
| M1 | Xoá rule ĐƠN `.aYQbCq_planSave:disabled{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-tertiary);cursor:not-allowed}` (136 B) | `773539dd8afc` / 51 701 B (−136) | `t62` | **EXIT 1**, 6 FAIL: `FAIL 8 planSave … MISSING :disabled` · `FAIL 16 state floor :disabled >= 12 — 11 rule slots` · `FAIL 18 … :disabled 11 < 12` · `FAIL 19 css bytes >= 51837 — 51701 B` · `FAIL 26 M-DISABLED … applies: false` · `FAIL 27 M-FLOOR :disabled=11/12` |
| M2 | `lib/client/MemberControls.js` (~:92): `Array.isArray(state.groups) ? state.groups : []` → `false ? state.groups : []` | `cd3af21cb89f` (−22) | `t70` | **EXIT 1**, `FAIL 7 every preselected route is really inside the catalog it came from` + `FAIL 8 catalogRoutesOf drops half-formed entries instead of throwing - []`, `14/16 passed` |
| M3 | `tools/erp-route-migrate.mjs`: `if (shaBefore !== options.expectSha) {` → `if (false) {` | `607af79f1ae1` (−26) | `t58` | **EXIT 1**, `not ok 6 c1 sha lech --expect-sha256: exit 2, khong ghi, khong tao backup`, `22/23 passed` |
| M4 | Xoá nhóm `:hover` HAI selector `.aYQbCq_planSectionToggle:hover,.aYQbCq_planCardHeader:hover{background:color-mix(…)}` | `f0af572f50c4` / 51 686 B (−151) | `t62` | **EXIT 1**, `FAIL 15 state floor :hover >= 16 — 14 rule slots` · `FAIL 18 … :hover 14 < 16` · `FAIL 19 … 51686 B` · `FAIL 27 … :hover=14/16` |

Khôi phục: cả 4 lần `sha` trùng bản gốc (`ActivityPanel.module.css` `53ea47c6d780` · `MemberControls.js` `4a2959bce7da` · `erp-route-migrate.mjs` `0d1711945ec7`). Chi tiết JSON: `tests/tmp/audit-v8/mutations.json` và `tests/tmp/audit-v8/m1-m4-full.json`. Không phép nào của tôi trùng 3 phép của captain (nhóm `:focus-visible`, rule đơn `:hover` 87 B, vế `routes.some(...)` 102 B).

## 4. Quét hồi quy + tool tài liệu

- **38/38 suite EXIT 0** (`tests/tmp/audit-v8/sweep.json`, log từng suite trong `sweep/*.log`).
- 24 suite chạy thẳng: `t3` 18/18 · `t4` · `t10` **44/44** · `t15` 21/21 · `t20` 15/15 · `t24` 12/12 · `t28` 20/20 · `t30` 8/8 · `t37` 14/14 · `t38` 17/17 · `t39` 11/11 · `t40` 20/20 · `t43` 19/19 · `t44` 11/11 · `t46` 15/15 · `t48` 6/6 · `t49` 16/16 · `t50` 11/11 · `t54` 14/14 · `t56` 12/12 · `t57` 29/29 · `t58` 23/23 · `t62` 27/27 · `t70` 16/16.
- 14 suite `--analyze` (brief cấm pack/publish): `t11` PASS C1..C8 · `t18` C8/C9 · `t21` A6/A7 · `t27` C4b/C4c · `t29` C4 · `t35` 7/7 · `t42` 9/9 · `t45` C6/C7 · `t51` C5/C6 · `t52` 12/12 · `t59` PASS C1..C9 · `t63` 14/14 · `t68` 14/14 · `t72` 15/15 (C15 6/6 dấu vết t67+t71).
- `node tools/check-doc-paths.mjs --summary` → `SUMMARY files=5 paths=70 paths_missing=0 links=41 links_missing=0`, EXIT 0.
- `node tools/dependency-report.mjs` → `tasks=74 realEdges=84 derivedEdges=79 waves=36 problems=0`, EXIT 0. **Caveat (`V8-F5`)**: tool này GHI LẠI `docs/DEPENDENCIES.md`, nằm ngoài phạm vi ghi của tôi; repo không phải git nên không chứng minh được diff — báo cáo trung thực, không coi là hành vi đúng.

## 5. Phát hiện

| ID | Mức | Vị trí | Vấn đề | Tái hiện | Đề xuất |
|---|---|---|---|---|---|
| **V8-F1** | **high** | `docs/bao-cao-agent-teams.md:133` (và `:132`) | §5 ghi **bản đúng là t68 (03bed22f…f99e, 2 232 556 B)**, mâu thuẫn trực tiếp với §2.4 `:56` (t68 KHÔNG dùng, đã bị t72 thay) và `:36` (bundle hiện hành `5636cd9f66fd`/257 459). `:132` còn gọi `42f51e8e65af…`/251 789 B là bundle phát hành | `node -e` in 4 dòng 36/56/132/133 | Sửa `:132-133` trỏ `t72` + bundle `5636cd9f66fd`/257 459; giữ t68 trong danh sách bỏ |
| **V8-F2** | **medium** | `docs/TODO.md:126-127` (so `:78-79`), header `:4` | 76 hàng nhưng chỉ **74 id duy nhất**: t70/t71 bị lặp (bản `IN_PROGRESS`/`OPEN` cũ nằm sau bảng DOG); header ghi `IN_PROGRESS=1 (t73) · OPEN=1 (t74)` nhưng thân có **OPEN=3** (`:81` t73, `:82` t74, `:127` t71) và **IN_PROGRESS=1** (`:126` t70); `:81` còn để t73 `OPEN` dù task board đang `in_progress` | `grep -c` trên `^| t` ra 76, cắt cột id ra 74 | Xoá `:126-127`; header = `VERIFIED=69 · CANCELLED=3 · SUPERSEDED=1 · IN_PROGRESS=0 · OPEN=1 (t74)` |
| **V8-F3** | **low** | `docs/bao-cao-agent-teams.md:103` | Ghi Telegram **25 kỳ, cả 25 tệp ghi `message_id`**; thư mục nay có **26 tệp** (`ky-26` = `message_id 37`, sinh sau khi báo cáo viết) | `ls docs/bao-cao-telegram/ky-*.md | wc -l` → 26 | Cập nhật 26 kỳ + id 37. Đã kiểm lại: **26/26 tệp đều có id** (5,6,7,9,11,13,15,17,19,20,21,22,23,24,25,26,27,28,30,31,32,33,34,35,36,37) — không tệp nào thiếu |
| **V8-F4** | **low** | `docs/bao-cao-agent-teams.md:94-97` | 4 dòng ghi chưa chạy lại; tôi vừa chạy đúng 4 suite đó: `t18 --analyze` C8/C9, `t20` 15/15, `t21 --analyze` A6/A7, `t11 --analyze` 11/11, tất cả EXIT 0 | §4 sweep | Đổi thành đã chạy lại 2026-11-01 (t73) |
| **V8-F5** | info | `tools/dependency-report.mjs` | Tool ghi đè `docs/DEPENDENCIES.md` (ngoài phạm vi người chấm); cùng lớp `V6-F5`. Không phải lỗi sản phẩm nhưng làm nhiễu vùng ghi | chạy tool rồi `stat` tệp | Ghi rõ trong doc hoặc thêm cờ `--dry-run` |
| **V8-F6** | info | `tests/t62-css-completeness.mjs` (`M-DISABLED`, `M-FLOOR`) | Khi tệp CSS trên đĩa đã mất rule, 2 check mutation trong bộ nhớ báo `applies: false, delta 0 B` ⇒ không cộng thêm bằng chứng (đã có `FAIL 8/16/18/19` bắt được). Không phải fake PASS, chỉ nhãn gây hiểu | M1 ở §3 | Đổi nhãn thành bản sao đĩa, hoặc bỏ 2 check khi tệp đã đỏ |

**Không có fake PASS mới**: 4 mutation của tôi đều làm suite đỏ; `tests/*.mjs` có 0 `.skip(` và 0 `catch {}` rỗng (đo lại vòng này); các `process.exit(0)` còn lại chỉ nằm trong chuỗi probe nhúng (`tests/t42-pack-v5.mjs:302`, `tests/t52-pack-final.mjs:309,551,552`) — cùng lớp info đã ghi ở vòng trước.

## 6. Giới hạn của audit này

1. Không bấm UI trên phiên đang chạy (chỉ SSR + marker + token bundle); hành vi click thật vẫn dựa vào `docs/kiem-thu/dog-03-panel-live.md`.
2. `agent-teams/*` session event vẫn bị host bỏ (`lib/events.js:33-40`); sổ audit thật = `team.json.routeOverride` + `docs/log/MODEL-SWITCH.md`.
3. 14 suite `--analyze` chấm lại `meta.json` của lần chạy trước (brief cấm pack/live-boot); tarball chỉ chấm **bản t72 đã có**, không chấm khả năng pack lại — tính tất định đã chứng minh ở t35/t52.
4. 24 peerDependencies do host cấp, không kiểm được từ trong tarball.
5. `tools/dependency-report.mjs` ghi ra ngoài phạm vi (§4) — nếu ai thấy `docs/DEPENDENCIES.md` đổi thì đó là tool, không phải tôi sửa tay.

## 7. Điều kiện công bố (kèm owner)

1. **dev-ui-goat** — `docs/bao-cao-agent-teams.md:132-133`: trỏ `t72` (`5137df03…c8ac`, 2 239 517 B, 133 entry) + bundle `5636cd9f66fd`/257 459 (`V8-F1`).
2. **dev-ui-goat** — xoá `docs/TODO.md:126-127`, sửa header `:4` theo số thật, cập nhật hàng t73 khi task đóng (`V8-F2`).
3. **captain** — `:103` 26 kỳ / `message_id 37` (`V8-F3`) và `:94-97` đã chạy lại 2026-11-01 (`V8-F4`).

Không điều kiện nào chạm mã nguồn, tarball, `package.json` hay profile cài ⇒ **sửa 3 dòng tài liệu là đủ để công bố t72**.
