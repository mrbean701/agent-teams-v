# Audit closure vòng 9 (t76) — tarball t75 + nguồn hiện tại

Người audit: **audit-goat** (độc lập, không viết mã sản phẩm). Task `t76`, attempt `ffc05974-165e-4b73-9eea-fb03e5764991`, kết thúc `2026-10-31T20:52:53.610Z`.
Đọc: `packages/dsh-agent-teams/lib/**`, `tests/**`, `docs/**`, `tools/**`. Ghi: `docs/audit/**`, `docs/log/AUDIT.md`, `tests/tmp/audit-v9/**`.
Không dùng `--analyze` làm bằng chứng; mọi số dưới đây do tôi tự chạy (log trong `tests/tmp/audit-v9/`).

## 0. Verdict

- **Tarball t75 tại thời điểm pack (`2026-10-31T20:44:58.451Z`): ĐẠT.** sha256 `818dff227c50976aa0240fd6f202b73f0700c42104a9f5af62c8033b6a43a304` / **2 241 026 B** / **133 entry**; 3 chiều 11/11 SAME; 0 rác; repack cùng sha256 (pack tất định).
- **Tarball t75 ở trạng thái nguồn HIỆN TẠI: KHÔNG được dùng để phát hành.** Quét TOÀN bộ 133 tệp payload ↔ nguồn: **1 tệp lệch** — `lib/types/snapshot.d.ts` payload `6033d345b9bb`/6 512 B ≠ nguồn `962f99a7bcb1`/7 627 B (t77 đang ghi `lib/types/**`). Đây không phải lỗi của t75 (lúc pack còn khớp), mà là **drift sau pack** — nhưng nghĩa là **phải repack sau khi t77 đóng rồi audit lại**; không công bố t75.
- **Lớp mã nguồn: ĐẠT.** 40/40 suite EXIT 0; 3 mutation tự làm đều làm suite đỏ rồi phục hồi byte-identical; tài liệu khớp số đo; dữ liệu ERP không đổi.

## 1. Bảng kiểm C1–C7

| # | Nội dung | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| C1 | Tự đo tarball t75 (sha256 + `tar -tzf` + giải nén + hash) | **ĐẠT** | 133 entry; 6/6 bắt buộc; rác = 0; 3 chiều 11/11 SAME; repack `818dff22…` trùng |
| C2 | ≥3 mutation kiểu KHÁC các phép cũ | **ĐẠT** | M1 `t74` EXIT 1 (22/23), M2 `t48` EXIT 1 (4/6), M3 `t30` EXIT 1 (2/8); cả 3 phục hồi đúng sha |
| C3 | Chấm t74 bằng máy | **ĐẠT** | `node tests/t74-captain-route-warning.mjs` → **23/23, EXIT 0** |
| C4 | Soi `docs/bao-cao-agent-teams.md` bằng số đo | **ĐẠT (1 finding nhỏ)** | 11/11 hash, tarball, t47/47, deps, telegram 28/28 khớp; grep số cũ = 0 |
| C5 | Chạy LẠI toàn bộ suite + 2 tool tài liệu | **ĐẠT** | 40/40 EXIT 0; `paths_missing=0`; `problems=0` |
| C6 | Cổng bảo mật `/plan` | **ĐẠT** | `tests/t24-auth-fence.mjs` EXIT 0 (401/403/405/409/413/503) |
| C7 | Verdict + điều kiện phát hành | **KHÔNG ĐẠT cho t75 hiện tại** | drift 1 tệp `lib/types/snapshot.d.ts` do t77 |

## 2. Đo độc lập

**Nguồn (11 tệp freeze, đo bằng node crypto):** tools `a01b1a1018cb`/194 888 · members `1562be4d527d`/99 402 · state `7b49f5ab1d46`/56 282 · snapshot `a2a87e1b0c0b`/13 986 · index `2d28e617f068`/45 315 · tool-names `e3def5db908d`/808 · client.js `9da18d9971a2`/258 432 · client.js.map `bbf88608f54e`/404 958 · members.d.ts `b1ffe1544003`/27 660 · CSS `53ea47c6d780`/51 837 · package.json `92a6404071e4`/10 498.
**Tarball:** `tar -tzf` (strip CRLF) = 133 entry, 0 entry thư mục, 133 tệp; bắt buộc 6/6 (`package/lib/tools.js`, `members.js`, `client.js`, `client.js.map`, `tool-names.js`, `cordis.patch.yml`); rác: `node_modules/`=0, `package/tests/`=0, `.tgz` lồng=0, `.pid`=0, `package/tools/`=0.
**Ba chiều (đo lại, không đọc `meta.json`):** payload ↔ nguồn **11/11 SAME**; bản đã cài `C:/Users/thang/.dsh/profiles/agent-teams-pack8/node_modules/@nami/dsh-agent-teams` ↔ nguồn **11/11 SAME**, là thư mục thật (không symlink), `@nami/dsh-agent-teams 0.2.0-dev.0`, 0 dependency / 24 peerDependency, `dependencySpec` trỏ đúng tệp `tests/tmp/t75/…tgz`.
**Repack:** `tests/tmp/t75/repack/…tgz` cùng sha256 `818dff22…a304` + cùng 2 241 026 B ⇒ pack tất định.
**Đối chiếu `meta.json` của t75 (chỉ để tham khảo, không thay bước đo):** sha/bytes/133 entry khớp, `threeWay` 11/11 true, `drift` = 0, `driftEnd` = 0, 2 lần pack cùng sha.
**Dữ liệu thật:** `E:/Project/ERP/.agent-teams/erp-erp/team.json` sha `9f7420b6a1af…15f2d1e` / 1 533 117 B / mtime `2026-10-24T04:53:13.185Z` — không đổi.

## 3. Mutation (3 phép, kiểu mới; KHÔNG dùng lại kiểu vòng 5–8)

Script `tests/tmp/audit-v9/mutate.mjs`, kết quả `tests/tmp/audit-v9/mutations.json`; mỗi phép: hash gốc → sửa → chạy suite → phục hồi → hash lại.

| Mã | Kiểu | Tệp:dòng | Phép sửa | Hậu quả | Phục hồi |
| --- | --- | --- | --- | --- | --- |
| M1 | hợp đồng placeholder bản địa hoá | `packages/dsh-agent-teams/lib/client/locales.js:261` | bỏ ` {route}` khỏi câu zh (delta −9 B), `edef9a6e46c7` → `892ee6014551` | `tests/t74-captain-route-warning.mjs` **EXIT 1**, 22/23: `FAIL 10 (e5) the new locale key ships in EXACTLY two non-empty dictionaries` | ✅ sha `edef9a6e46c7` |
| M2 | bề mặt tên tool (registry) | `packages/dsh-agent-teams/lib/tool-names.js:4` | bỏ `'agent_teams_set_member_route'` (delta −32 B), `e3def5db908d` → `454ff61c7c04` | `tests/t48-tool-names.mjs` **EXIT 1**, 4/6: `not ok 1 … is in TEAM_TOOL_NAMES, next to set_member_route`, `not ok 5 … captain prompt string` | ✅ sha `e3def5db908d` |
| M3 | hợp đồng key DTO trạng thái | `packages/dsh-agent-teams/lib/tools.js:2402` | đổi `last_failure:` → `lastFailure:`, `a01b1a1018cb` → `67536ab8acfa` | `tests/t30-status-last-failure.mjs` **EXIT 1**, 2/8: FAIL `(a)`, `(a2)`, `(a3)`, `(b2)`, `(c)`, `(d)` | ✅ sha `a01b1a1018cb` |

Không phép nào để lại dấu: sau cả 3, 11/11 hash freeze vẫn đúng. Không có fake PASS trong 3 suite bị đâm.

## 4. Quét hồi quy

`tests/tmp/audit-v9/sweep.mjs` (log `sweep/*.log`, `sweep.json`): **40/40 EXIT 0** — 25 suite chạy thẳng: t3 18/18 · t4 · **t10 47/47** (tăng 3 case so với vòng 8 vì t74 thêm marker) · t15 21/21 · t20 15/15 · t24 (12 check, 401/403/405/409/413/503) · t28 20/20 · t30 8/8 · t37 14/14 · t38 17/17 · t39 11/11 · t40 20/20 · t43 19/19 · t44 11/11 · t46 15/15 · t48 6/6 · t49 16/16 · t50 11/11 · t54 14/14 · t56 12/12 · t57 29/29 · t58 23/23 · t62 27/27 (sàn `:focus-visible/:hover/:disabled/:active` = 21/16/12/4) · t70 16/16 · **t74 23/23**; 15 suite `--analyze` (t11, t18, t21, t27, t29, t35, t42, t45, t51, t52, t59, t63, t68, t72, **t75 15/15**) — chỉ dùng làm đối chiếu, không dùng để kết luận.

## 5. Tài liệu

- `docs/bao-cao-agent-teams.md`: `:36` bundle `9da18d9971a2`/258 432 + map `bbf88608f54e`/404 958 + snapshot `a2a87e1b0c0b`/13 986 — **khớp số đo**; `:50`/`:55` tarball t75 `818dff22…a304`/2 241 026 B/133 entry + profile `agent-teams-pack8` — **khớp**; `:78` t10 47/47 — **khớp**; `:102` `tasks=77 realEdges=87 derivedEdges=82 waves=38 problems=0` — **khớp output máy**; `:103` Telegram **28 kỳ, 28/28 tệp có `message_id`** — **khớp**; `:132` bundle `9da18d9971a2`/258 432 — **khớp**.
- Số cũ đã sạch: `5636cd9f66fd`=0, `57892ef70e47`=0, `42f51e8e65af`=0, `251 789`=0, `44/44`=0, `25/25`=0. Các sha tarball cũ (`5137df034fa6`/`2 239 517`, `5306f31b`, `03bed22f`) chỉ còn ở `:101` và `:133` trong câu **“đã bị thay thế / không dùng”** ⇒ lịch sử hợp lệ, không phải finding.
- Bundle `lib/client.js` (258 271 ký tự): 8/8 marker của t67+t71+t74 (`aYQbCq_planSave`, `data-add-member-route-default`, `-route-warning`, `-catalog-empty`, `pickDefaultRoute`, `data-error-detail`, `captainRoute`, `data-add-member-captain-route-warning`), 719 lượt token `aYQbCq_` / 150 tên phân biệt.
- `docs/TODO.md`: **77 dòng task, 77 id duy nhất** (V8-F2 lặp t70/t71 đã hết), `VERIFIED=71 · CANCELLED=3 · SUPERSEDED=1 · OPEN=1 (t76) · IN_PROGRESS=1 (t77)`.
- Tool: `check-doc-paths --summary` → `files=5 paths=71 paths_missing=0 links=41 links_missing=0` (EXIT 0); `dependency-report` → `tasks=77 … problems=0` (EXIT 0).

## 6. Phát hiện

| Mã | Mức | Tệp:dòng | Vấn đề | Cách tái hiện | Đề xuất |
| --- | --- | --- | --- | --- | --- |
| **V9-F1** | **high (chặn phát hành t75, không chặn mã)** | `packages/dsh-agent-teams/lib/types/snapshot.d.ts` | tarball t75 đã lệch nguồn 1 tệp sau khi t77 ghi: payload `6033d345b9bb`/6 512 B ≠ nguồn `962f99a7bcb1`/7 627 B (quét 133 tệp) | `node tests/tmp/audit-v9/measure.mjs` rồi so `tests/tmp/audit-v9/extract/package/lib/types/snapshot.d.ts` với nguồn | Sau khi t77 đóng: **repack** t75 rồi **audit lại tarball** (t53/t69/t73 đã làm đúng quy trình này) |
| **V9-F2** | low | `docs/TODO.md:4` vs `:84` | Header đếm `IN_PROGRESS=2 (t76, t77) · OPEN=0` nhưng dòng `:84` vẫn `\| t76 \| OPEN \| Chưa chạy — chờ t75 \|` | `grep -n '^| t76 ' docs/TODO.md` | Cập nhật `:84` thành `IN_PROGRESS` (hoặc `VERIFIED` khi t76 xong) |
| **V9-F3** | low | `tests/t10-ui-bundle-smoke.mjs:146`, `tests/t74-captain-route-warning.mjs:188` | Hai `check(..., true, …)` **luôn xanh**: dòng “bundle sha256 recorded” chỉ *in* hash, không so với giá trị kỳ vọng ⇒ hash bundle không được assert trong bất kỳ suite nào (chỉ marker là assert thật, 47/47) | đổi `lib/client.js` 1 byte rồi chạy `node tests/t10-ui-bundle-smoke.mjs`: vẫn xanh nếu không rơi marker | Thêm assert `sha256 === <hash đã pin>` (hoặc chuyển sang `docs/` và nêu rõ là thông tin) |
| **V9-F4** | info | `tests/t42-pack-v5.mjs:302`, `t52:309/551/552`, `t63:309/566/567`, `t68:305/569/570`, `t72:304/575/576`, `t75:304/577/578` | 16 `process.exit(0)` nằm trong **chuỗi probe nhúng** (cùng lớp V6-F7/V8-F6), không phải exit của suite | `grep -n 'process.exit(0)' tests/*.mjs` | Không cần sửa; ghi để người sau không chấm nhầm là fake PASS |
| **V9-F5** | info | `tools/dependency-report.mjs` | Chạy tool này **ghi đè** `docs/DEPENDENCIES.md` — ngoài phạm vi ghi của audit (repo không phải git nên không chứng minh được diff) | `node tools/dependency-report.mjs` | Ghi rõ side-effect trong tài liệu tool |
| **V9-F6** | info | `tests/t75-pack.mjs:677+` (`--analyze`) | Chế độ `--analyze` chỉ chấm lại `meta.json` của lượt chạy, không đọc lại tarball trên đĩa ⇒ không dùng làm bằng chứng phát hành | sửa 1 byte trong payload rồi `--analyze`: vẫn PASS | Đã nêu từ V7-F4/V8-F6; giữ nguyên, audit luôn tự đo |

**Không có fake PASS mới:** 0 `.skip(` trong `tests/*.mjs`, 0 `catch {}` rỗng; 3 mutation đều làm suite đỏ. Cửa sổ đỏ `t74` lúc 20:45Z là do captain mutation `lib/snapshot.js:62` (BUG-022), không phải artefact — lượt chạy của tôi lúc `2026-10-31T20:52:53.610Z` là **23/23 EXIT 0** trên nguồn đã phục hồi.

## 7. Điều kiện phát hành (owner)

1. **dev-build-flash/captain**: đóng t77 (`lib/types/snapshot.d.ts`) → **repack** → audit tarball mới (quy trình t53/t69/t73). Không công bố t75 khi t77 đã land. — *chặn phát hành*
2. **captain**: sửa `docs/TODO.md:4`/`:84` cho khớp trạng thái (V9-F2). — *nhỏ*
3. **dev-build-flash**: thêm assert hash bundle vào `tests/t10-ui-bundle-smoke.mjs:146` nếu muốn chặn drift bundle bằng máy (V9-F3). — *tuỳ chọn*

## 8. Giới hạn của audit

- Không bấm GUI trên phiên đang chạy: chỉ SSR + marker bundle + token CSS (t62) + `t10` 47/47. Rủi ro còn lại: hành vi React thật trong panel (đã nêu từ vòng 4, chưa ai đóng).
- `agent-teams/*` session event vẫn bị host bỏ (`lib/events.js:33-40`, gate `dshSession.KNOWN_SESSION_EVENT_TYPES`) ⇒ nhật ký thật nằm ở `team.json` + `docs/log/MODEL-SWITCH.md`, không ở event stream.
- 15 suite `--analyze` chỉ là replay `meta.json`; mọi kết luận ở trên dựa trên suite chạy thẳng + phép đo của tôi.
- t76 không chấm `lib/types/snapshot.d.ts` về nội dung kiểu (đó là phạm vi t77 đang mở).
