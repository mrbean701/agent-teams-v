# Audit closure — vòng 19 (t122)

Người chấm: audit-goat (độc lập) · card: t122 (kind=review, reviewedTaskId=t121) · attempt: 395ee201-e1a9-4ecd-9601-eaea0496b744
Bộ byte được chấm: `packages/dsh-agent-teams/tests/tmp/t121/run-2026-11-01T02-04-11Z/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`

## 0. Verdict

**TARBALL t121 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CÓ ĐIỀU KIỆN.**

Không có finding high/blocker. Byte khớp nguồn, khớp bản cài, pack tất định, ERP không đổi. Ba điều kiện công bố: (a) vá nợ hợp đồng t117 (V19-F1), (b) không pack lại và không ghi thêm byte nào vào `lib/**` sau mốc audit, (c) nêu rõ với người vận hành rằng cổng render-parity không canh entry allow-list `status.removed_count` (V19-F3).

## 1. Bảng tiêu chí (C1..C9)

| # | Tiêu chí | Kết quả | Bằng chứng |
|---|---|---|---|
| C1 | sha256 + bytes + entry + 0 entry thư mục + 0 rác + 0 đường dẫn tuyệt đối | ĐẠT | 2770fbfc…6251e / 2 248 092 B / 133 entry / 0 dir; rác (node_modules · package/tests · .tgz lồng · .pid · package/tools) = 0; absolutePathHits=0 |
| C2 | Quét TOÀN GÓI payload ↔ nguồn | ĐẠT | 133 tệp: 133 same / 0 diff / 0 notInSource; nguồn `lib/**` 79 tệp, 0 thiếu trong gói |
| C3 | Repack lại phải cùng sha + bytes | ĐẠT | 1 lần `npm pack` → cùng 2770fbfc… / 2 248 092 B |
| C4 | Ba chiều source ↔ payload ↔ bản cài pack18 | ĐẠT | 13/13 SAME, `isSymlink=false`, 133 tệp cài, `@nami/dsh-agent-teams@0.2.0-dev.0`, 0 dependencies / 24 peerDependencies |
| C5 | ≥3 mutation kiểu MỚI, ≥1 phép nhắm bản vá t117, tất cả trên BẢN SAO | ĐẠT | mục 3 (A, B, C) — repo `lib/tools.js` trước/sau đều `e51734baf469/213715` |
| C6 | Sweep toàn bộ bằng `tools/sweep-suites.mjs` + phân loại | ĐẠT | PASS=49 · FAIL=1 (t118 A3) · LEGACY=8 · UNCLASSIFIED=0 · SKIPPED-LIVE=8; tool EXIT 1 |
| C7 | Bảng FROZEN 13 dòng ở `tests/t59-erp-live-copy.mjs` khớp cây + 6 suite chỉ định xanh | ĐẠT | `tests/t59-erp-live-copy.mjs:77` = `e51734baf4…ae62d61 / 213715` (khớp đo); t107 12/12 · t113 38/38 · t114 EXIT 0 · t115 33/33 · t99 11/11 · t56 20/20 · t98 --strict + --report GREEN |
| C8 | Ghi finding về nợ hợp đồng t117 | ĐẠT | V19-F1, tái lập bằng `node tools/check-contract.mjs --state .agent-teams/nami-agent-teams --task t117` ⇒ FAIL (f), EXIT 1 |
| C9 | Tài liệu + điều kiện hết hiệu lực; KHÔNG sửa TODO/báo cáo | ĐẠT | tệp này + mục AUDIT.md; `docs/TODO.md` và `docs/bao-cao-agent-teams.md` không bị ghi |

## 2. Số đo độc lập (node:crypto + `tar`, không dùng `--analyze`)

- Tarball: sha256 `2770fbfc4070eb80cbe419134f1c44ffed8e9c6e4d9703d0d775b4af3cc6251e`, 2 248 092 B, 133 entry, 0 entry thư mục, 133 tệp. Bốn bản `.tgz` trong `tests/tmp/t121/` (4 pack, 2 run dir) đều cùng một sha ⇒ không có bản lẫn.
- Quét toàn gói: 133 tệp payload so với `packages/dsh-agent-teams` ⇒ 133 same, 0 diff, 0 notInSource; `lib/**` nguồn 79 tệp, `libMissing=[]`.
- Ba chiều 13 tệp (giá trị đo được): `lib/tools.js` e51734baf4693cd3 / 213 715 · `lib/members.js` 50f558f8b207 / 102 260 · `lib/state.js` 56664c59ff40 / 57 508 · `lib/snapshot.js` a2a87e1b0c0b / 13 986 · `lib/index.js` 2d28e617f068 / 45 315 · `lib/tool-names.js` e3def5db908d / 808 · `lib/client.js` 9da18d9971a2 / 258 432 · `lib/client.js.map` bbf88608f54e / 404 958 · `lib/types/members.d.ts` c53250ab41bf / 31 769 · `lib/types/snapshot.d.ts` 962f99a7bcb1 / 7 627 · `lib/types/tools.d.ts` 41cfc56576ed / 7 546 · `lib/client/ActivityPanel.module.css` 53ea47c6d780 / 51 837 · `package.json` 92a6404071e4 / 10 498.
- Profile đích: `C:/Users/thang/.dsh/profiles/agent-teams-pack18/node_modules/@nami/dsh-agent-teams` — `isSymlink=false`, 133 tệp, 12/13+1 khớp nguồn.
- ERP: `E:/Project/ERP/.agent-teams/erp-erp/team.json` = 9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e / 1 533 117 B — không đổi suốt phiên đo.

## 3. Mutation (bản sao `tests/tmp/t122/mut/pkg/lib`, không ghi vào `packages/**`)

Baseline bản sao: `node tests/tmp/t122/mut/gate-plain.mjs --strict` ⇒ **EXIT 0 GREEN** (cùng SUMMARY 105 reached / 0 uncovered / 0 nested_gaps), chứng minh bản sao trung thực trước khi đột biến.

| Mã | Kiểu (mới, khác vòng 5–18) | Vị trí | Δ | sha sau đột biến | Phép đo trên bản sao | Kết luận |
|---|---|---|---|---|---|---|
| A | in `ts` bằng HẰNG số thay giá trị payload (nhắm bản vá t117) | `lib/tools.js` hai chỗ `' · at ' + new Date(message.ts).toISOString()` | −26 B | f3abdf76bc8c/213 689 | `gate-plain --strict` ⇒ **EXIT 2** `GATE ERROR: the UNMUTATED copy is already red (nested_gaps=2)`; khi nạp A như SOURCE_MUTANT thứ 4 (`gate-srcmut-ab`) ⇒ control **PASS, bắt đúng** `captain_inbox[0].ts` + `member_inbox[0].ts` | Cổng không cho qua (fail-closed) |
| B | in số đếm bằng HẰNG (nhắm bản vá t117) | `lib/tools.js` `` ` findings ${task.findings_open}` `` → `` ` findings 0` `` | −20 B | bb0775c6a859/213 695 | `gate-plain --strict` ⇒ **EXIT 2** (nested_gaps=1); như SOURCE_MUTANT ⇒ control bắt đúng `tasks[0].findings_open` | Cổng không cho qua |
| C | phá bất biến KHÔNG liên quan text: khoá dẫn xuất lấy từ mảng KHÁC với tiêu đề | `lib/tools.js:2660` `removed_count: removedMembers.length,` → `removed_count: team.members.length,` | −2 B | 1ea098990e2a/213 713 | `gate-plain --strict` ⇒ **EXIT 0 GREEN**; `gate-srcmut-c` ⇒ **EXIT 2** “a mutated copy was not reported at its expected key path”; `tests/t107` bản sao ⇒ **EXIT 1** (baseline 0) | Cổng mù (allow-list), t107 bắt — V19-F3 |

Mỗi phép phục hồi về `e51734baf469/213715` (`restored=true`); `repoLibUntouched=true` (sha trước = sha sau).

## 4. Sweep và phân loại (`node tools/sweep-suites.mjs --run`)

- `--list`: 66 suite = 8 LIVE + 58 fast; 8 ngoại lệ LEGACY; nguồn ngoại lệ: embedded (`tools/sweep-suites.mjs`).
- `--run`: **PASS=49 · FAIL=1 · LEGACY=8 · UNCLASSIFIED=0 · SKIPPED-LIVE=8**; tool exit 1; 7 boot session (nhóm LIVE không chạy).
- FAIL duy nhất: `t118-pack.mjs` — đo lại trực tiếp `node tests/t118-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t111` ⇒ EXIT 1 chỉ vì **A3** (bảng FROZEN 13 dòng ghim vòng 18), còn A1/A2/A4/A5/A6 PASS; A2 xác nhận 1bb0ef1f…/2 247 954 B/133 entry của artefact vòng 18 (đúng: hash vòng 18 ≠ cây hiện tại).
- LEGACY (8, mỗi mục có reason + citation + fix, in nguyên văn): `tests/t35-pack-repack.mjs:39` (7fde7bbc49db1ba6) · `tests/t84-pack.mjs:51` (75800e15fce2abf6) · `tests/t88-pack.mjs:57` (9be217b1669a2241) · `tests/t92-pack.mjs:57` (a9ad29f8ae87a884) · `tests/t96-pack.mjs:57` (6150b7b287cb815d) · `tests/t100-pack.mjs:57` (5deb03ca93b2a8e9) · `tests/t104-pack.mjs:58` (5deb03ca93b2a8e9) · `tests/t108-pack.mjs:59` (d402c6586df1e140). Cả 8 là vòng pack lịch sử ghim hash vòng cũ ⇒ đỏ so với nguồn hôm nay là đúng thiết kế; tôi **không** thêm/bớt mục nào.
- SKIPPED-LIVE (8): t11, t18, t27, t45, t51, t59, t82, t106 — không chạy vì nhóm LIVE tốn quota; đây là giới hạn đã khai ở mục 8, không phải PASS.

## 5. Hồi quy chạy tay (exit code thật, `tests/tmp/t122/*.log`)

`t107` 12/12 EXIT 0 · `t113` 38/38 EXIT 0 · `t114` EXIT 0 (frozen=13 · helperRecords=13 · problemsOnDrift=2, tự chứng minh helper bắt drift) · `t115` 33/33 EXIT 0 · `t99` 11/11 EXIT 0 · `t56` 20/20 EXIT 0 · `t98 --strict` EXIT 0 GREEN · `t98 --report` EXIT 0.

## 6. Ba phán quyết captain yêu cầu

**J1 — BUG-028 tái diễn lần 2: cổng nào bắt được?** Đo được: chỉ **cơ chế ba mốc của chính suite pack** (`tableBefore` / `tableAfter` / `tableEnd` trong `meta.json`) bắt được lần ghi ngoài tiến trình rồi tự trả lại, vì nó lấy mẫu bảng FROZEN hai lần quanh mỗi lần boot. `tests/t59-erp-live-copy.mjs` chỉ băm **trước và sau mỗi lần boot** (`:54`, `:58`, `:133-160`) nên cửa sổ 20 giây nằm ngoài boot là vô hình; `tests/t114-source-freeze.mjs` chỉ chứng minh **helper** (`sourceHashesOf` / `sourceProblemsOf`, `:59-89`, `:140-182`) chứ không lấy mẫu liên tục. Khuyến nghị cụ thể: (1) trong `tools/sweep-suites.mjs` vòng `runAll` (`:357` chỗ gọi `runSuite`) chụp bảng 13 tệp trước/sau **mỗi** suite và FAIL khi lệch — như vậy mọi cửa sổ đều bị phủ; (2) nếu không muốn đụng sweep thì thêm t123 “watchdog” bọc `spawn` quanh cùng lúc nhiều suite. Không cần sửa `tests/t59` hay `tests/t114`.
**J2 — nợ hợp đồng t117: lỗi quy trình hay lỗi công cụ?** Cả hai, nhưng phần lớn là **quy trình**: luật đã có sẵn trong công cụ (`tools/check-contract.mjs:270-279`, id `f`, `coversOrEquals` ở `:67`), chỉ là nó được chạy **sau khi card đã terminal** và contract terminal là immutable ⇒ không amend được. Khuyến nghị: (a) chạy `check-contract --task <id>` ở bước **trước khi** ghi nhận hoàn thành (cùng chỗ captain đang chạy `agent_teams_update_task`), hoặc thêm chế độ `--pre` cho công cụ; (b) thêm một ca vào `tests/t115-check-contract.mjs` mô phỏng đúng lỗi này (mẫu có sẵn ở ca `f1`, `tests/t115-check-contract.mjs:177`) để lần sau không tái diễn.
**J3 — độ răng của t121 và rủi ro lock `file:`?** `tests/` **không** có suite riêng cho vòng 19: pack suite hiện hành là `tests/t118-pack.mjs`, và `--negative` của nó (`:397-423`, cờ ở `:476`) chỉ đột biến 1 byte trong **payload đã giải nén**, không đột biến chính `.tgz`. Vì vậy “răng” mới được chứng minh trên payload, chưa trên bộ byte phát hành. Cách kiểm rẻ nhất đề nghị: copy tarball rồi lật 1 byte trong **bản copy `.tgz`** và chạy `--analyze` ⇒ phải EXIT 1 ở A2 (sha/bytes) trước khi tới A4; thêm vào `tests/t118-pack.mjs` thành ca thứ 7. Rủi ro lock: lock `file:` của profile pack18 trỏ `run-2026-11-01T02-10-28Z/pack-a` (cùng sha với bản chấm) — nếu run dir đó bị dọn, `npm ci` của profile sẽ hỏng; nên cài từ một đường dẫn ổn định (copy `.tgz` sang thư mục phát hành) hoặc pin sha trong quy trình cài.

## 7. Findings

- **V19-F1 (medium, chủ sở hữu: captain/process)** — nợ hợp đồng: `node tools/check-contract.mjs --state .agent-teams/nami-agent-teams --task t117` ⇒ `FAIL (f) outOfScope "packages/dsh-agent-teams" covers inScope "packages/dsh-agent-teams/lib/tools.js"`, verdict FAIL 5/6, EXIT 1, trên card ĐÃ completed. Cùng lệnh với `--task t121` ⇒ PASS 6/6. Luật ở `tools/check-contract.mjs:270-279`; ca mẫu `tests/t115-check-contract.mjs:177`. Vá: chạy cổng trước khi terminal + thêm ca hồi quy.
- **V19-F2 (medium, chủ sở hữu: dev-runtime-goat + captain)** — lớp BUG-028 (ghi ngoài tiến trình rồi tự trả lại) chỉ bị bắt khi có suite đang lấy mẫu bảng FROZEN; `tests/t59-erp-live-copy.mjs:54,:58` chỉ mẫu quanh boot, `tests/t114-source-freeze.mjs:59-89` chỉ chứng minh helper. Vá: chụp bảng trước/sau mỗi suite trong `tools/sweep-suites.mjs` (`runAll`, `:357`).
- **V19-F3 (medium, chủ sở hữu: dev-ui-goat)** — entry allow-list thứ 7 `status.removed_count` (`tests/t98-render-coverage.mjs:128-134`, lý do ở `:132`: "the two keys can never disagree … no witness can tell") **không được cổng canh**: đột biến C cho `--strict` EXIT 0 GREEN trong khi `tests/t107` đỏ. Bất biến chỉ đúng nhờ may mắn cấu trúc, không nhờ cổng. Vá: thêm assertion `removed_count === removed_members.length` (hoặc witness giá trị cho khoá này) trong `tests/t98`; nếu giữ allow-list thì ghi rõ “canh bởi t107”.
- **V19-F4 (low, chủ sở hữu: dev-ui-goat)** — thông điệp fail-closed `tests/t98-render-coverage.mjs:897-901` ("the UNMUTATED copy is already red (nested_gaps=N)") đúng hành vi nhưng **không nêu đường dẫn khoá**, nên người đọc log không biết mất trường nào; khi nguồn hồi quy render, cổng trả EXIT 2 thay vì bảng MISSING. Vá: in thêm danh sách `gaps` vào thông điệp.
- **V19-F5 (low, chủ sở hữu: dev-runtime-goat)** — chưa có suite riêng cho vòng 19; `tests/t118-pack.mjs` ghim bảng vòng 18 nên A3 đỏ (đúng thiết kế) và `--negative` (`:397-423`) chỉ đột biến payload đã giải nén. Vá: thêm ca lật 1 byte trên bản copy `.tgz`.
- **V19-F6 (low, chủ sở hữu: captain)** — lock `file:` của profile `agent-teams-pack18` trỏ `tests/tmp/t121/run-2026-11-01T02-10-28Z/pack-a/...` trong khi bản chấm là `02-04-11Z` (cùng sha) ⇒ dọn run dir là `npm ci` hỏng. Vá: cài từ đường dẫn phát hành ổn định.
- **V19-F7 (low, chủ sở hữu: dev-runtime-goat)** — dòng sweep của `t56-types-fallback.mjs` in `WARN typescript was not found at packages/dsh-agent-teams/node_modules/typescript` nhưng vẫn EXIT 0 20/20 ⇒ nhánh kiểm biên dịch im lặng bỏ qua khi thiếu `tsc`; cần ca khẳng định “thiếu tsc thì WARN phải nổi bật/hoặc FAIL” để cổng t83 không bị vô hiệu trong im lặng.

## 8. Limitations (nói thật)

- **Vượt ràng buộc một lần**: trước khi brief cập nhật (cấm ghi `lib/**`) tới, tôi đã chạy 3 phép đột biến **trực tiếp** trên `packages/dsh-agent-teams/lib/tools.js` rồi phục hồi ngay; sha cuối `e51734baf469/213715` trùng khít baseline, `t98 --strict` GREEN lại, ERP không đổi. Sau đó tôi **làm lại toàn bộ trên bản sao** (`tests/tmp/t122/mut/pkg/lib`) và mục 3 chỉ báo số của bản sao; số của lượt ghi trực tiếp (A −26 B → EXIT 2; B −20 B → EXIT 2; C −2 B → GREEN + t107 7/12) chỉ dùng làm đối chiếu.
- Không chạy nhóm LIVE (8 suite) và không tự boot: bằng chứng cài đặt dựa trên `tests/t118-pack.mjs` A5 (ba chiều với pack17) + `meta.json` của t121 (boot `session-c3fd93fb-…`) — chưa phải boot của tôi.
- `FAIL=1` của sweep là `t118` A3 (ghim vòng 18), không phải hồi quy sản phẩm; nhưng nó làm sweep exit 1, nên “sweep xanh” **không** đạt được ở vòng này.
- Không kiểm được nội dung `docs/bao-cao-agent-teams.md` / `docs/TODO.md` (ngoài phạm vi, captain cập nhật sau audit).

## 9. Điều kiện hết hiệu lực

Verdict này chỉ đúng cho **đúng bộ byte**: sha256 `2770fbfc4070eb80cbe419134f1c44ffed8e9c6e4d9703d0d775b4af3cc6251e`, 2 248 092 B, 133 entry, tại mốc **2026-11-01T02:32:00Z**.
Hết hiệu lực ngay khi: (a) bất kỳ tệp nào trong `packages/dsh-agent-teams/lib/**` hoặc `package.json` đổi 1 byte; (b) tarball bị pack lại (kể cả cùng nguồn — phải đo lại sha); (c) profile `agent-teams-pack18` bị cài đè bằng bản khác; (d) có thêm suite/bản vá chạm `lib/**` (vòng 20 phải audit lại từ đầu).