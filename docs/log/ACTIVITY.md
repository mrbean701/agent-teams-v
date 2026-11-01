# ACTIVITY — nhật ký hoạt động

| Thời điểm | Ai | Việc | Bằng chứng |
|---|---|---|---|
| 2026-10-31T13:12:09.265Z | captain (lead) | Đọc mã plugin v0.1.28, viết báo cáo kỹ thuật | E:\Project\Agent-Team\bao-cao-agent-teams.md (312 dòng) |
| 2026-10-31T13:12:09.265Z | captain (lead) | Tạo đội nami-agent-teams ở trạng thái staged, 7 thành viên, 13 nhiệm vụ | .agent-teams/nami-agent-teams/team.json; docs/ke-hoach-staged.md |
| 2026-10-31T13:12:09.265Z | captain (lead) | Tạo khung 7 nhóm log và quy tắc dự án | docs/log/*.md; docs/quy-tac-du-an.md |
| 2026-10-31T13:14:01.615Z | captain (lead) | Nhân bản plugin v0.1.28 thành packages/dsh-agent-teams (@nami/dsh-agent-teams 0.2.0-dev.0), giữ nguyên 129 file | packages/dsh-agent-teams; packages/PROVENANCE-v0.1.28.json |
| 2026-10-31T13:14:01.615Z | captain (lead) | Xác minh bản sao: 127/129 file trùng hash, 2 file đổi có chủ đích (package.json, cordis.patch.yml) | so khớp sha256 với PROVENANCE-v0.1.28.json |
| 2026-10-31T13:15:33.909Z | captain (lead) | Điều phối lại model 7 member theo độ khó nhiệm vụ, ghi lý do từng quyết định | docs/log/ROUTING.md |
| 2026-10-31T13:15:33.909Z | captain (lead) | Approve kế hoạch theo lệnh trực tiếp của người dùng; đội chuyển sang running | agent_teams_approve -> {status: running, members: 7, tasks: 13} |
| 2026-10-31T13:15:33.909Z | captain (lead) | Thêm 4 nhóm log theo MASTER PROMPT và bảng TODO 13 nhiệm vụ | docs/log/{MEMBER,MODEL-SWITCH,ROUTING,SKILL-EXECUTION}.md; docs/TODO.md |
| 2026-10-31T13:16:02.862Z | nghien-cuu | Bắt đầu t1, đang chạy | agent_teams_status: status=working, activity=running |
| 2026-10-31T13:16:02.862Z | dev-ui | Đã claim t9 (bundle spike), đang chạy | agent_teams_status: t9 status=claimed, member working |
| 2026-10-31T13:16:02.862Z | captain (lead) | Phát hiện không có kênh Telegram, ghi HANDLE-004 | mcp_connector_catalog(keyword=telegram) trả 0 kết quả |
| 2026-10-31T13:23:21.323Z | captain (lead) | Áp chỉ thị chi phí: member mới dùng deepseek-v4.1-flash; ghi chặn kỹ thuật đổi route khi team đang chạy | tools.js:557/566/670 (staged-only), tools.js:1208-1210 (không dùng lại được tên member) |
| 2026-10-31T13:24:05.000Z | master (điều tra) | Đọc transcript captain: kết luận "không có kênh Telegram" xuất phát từ `mcp_connector_catalog(keyword=telegram)` trả 0; kênh thật là bot DSHERPbot của dsh-im-connect, tách khỏi MCP | session-92ccafca-11d3-4c97-bde8-8f735d5a4efd; channels.json; Bot API getMe ok |
| 2026-10-31T13:24:20.000Z | master (điều tra) | Thêm `tools/telegram-report.mjs`: gửi Bot API, đọc tokenRef từ credentials, không hard-code/in token, chia tin dài, retry lỗi mạng | E:\Project\Agent-Team\tools\telegram-report.mjs |
| 2026-10-31T13:24:30.000Z | master (điều tra) | Gửi thử báo cáo end-to-end tới chat 6704329834 thành công | Bot API sendMessage ok, messageId=497 |
| 2026-10-31T13:25:13.000Z | master (điều tra) | Cập nhật quy tắc dự án và HANDLE-004: dùng script Telegram, không tra MCP catalog | docs/quy-tac-du-an.md mục 6; docs/log/HANDLE.md |
| 2026-10-31T13:37:38.000Z | master (điều tra) | Tạo kênh báo cáo riêng "Agent teams report" (`-1004360988691`), thêm bot DSHERPbot làm admin; kiểm tra getChat và gửi thử | getChat ok type=channel; sendMessage message_id=3 |
| 2026-10-31T13:38:08.679Z | master (điều tra) | Cấu hình `tools/telegram-report.config.json` trỏ kênh mới; gửi thử qua script | node tools/telegram-report.mjs -> messageId=4 |
| 2026-10-31T13:39:00.000Z | master (điều tra) | Cập nhật runbook, quy tắc, HANDLE/TODO/TEST sang kênh riêng | docs/bao-cao-telegram.md; docs/quy-tac-du-an.md; docs/log/{HANDLE,TEST}.md; docs/TODO.md |
| 2026-10-31T13:32:57.026Z | nghien-cuu | t1 COMPLETED, captain review VERIFIED | docs/nghien-cuu/hop-dong-host.md 365 dòng |
| 2026-10-31T13:32:57.026Z | kien-truc | t2 FAILED (QUOTA) rồi được reassign sang nghien-cuu | team.json t2.output |
| 2026-10-31T13:32:57.026Z | captain | Thêm dev-tools-flash khi team đang chạy, chuyển t4, gỡ dev-tools | add_member/reassign/remove_member output |
| 2026-10-31T13:41:20.089Z | captain | Gửi báo cáo kỳ 1 lên kênh Agent teams report | messageId=5, parts=1, exit 0 |
| 2026-10-31T13:42:37.920Z | captain | Người dùng yêu cầu luôn hiển thị TODO; ghi quy tắc vào quy-tac-du-an.md | — |
| 2026-10-31T13:47:04.182Z | captain | t2 VERIFIED (432 dòng, 4 neo khớp), t5 VERIFIED (tự chạy test-env + smoke đều EXIT=0) | docs/log/CHECK.md |
| 2026-10-31T13:47:04.182Z | captain | Gỡ 3 member chết route, thêm dev-runtime-flash + audit-kimi, gán lại t3,t6,t12,t13 | agent_teams_remove/add/reassign output |
| 2026-10-31T14:00:02.350Z | captain | t14 xong, tự chạy 18/18 PASS; chốt t3 VERIFIED | tests/t3-route-smoke.mjs |
| 2026-10-31T14:08:11.972Z | captain | t4 VERIFIED (19/19), mở t15 (activateMemberNow) + t16 (đưa harness vào tests/) | docs/log/CHECK.md |
| 2026-10-31T14:12:43.761Z | captain | t16 VERIFIED (chạy 19/19 từ 2 cwd khác nhau) | tests/t4-control-plane-smoke.mjs |
| 2026-10-31T14:18:41.023Z | captain | t15 VERIFIED (17/17 + 2 hồi quy); mở t17 (parity toolPolicy) | docs/log/CHECK.md |
| 2026-10-31T14:19:09.353Z | captain | Dogfood hot-switch thất bại vì phiên nạp v0.1.28 (BUG-003); chuyển sang E2E profile nháp | docs/log/MODEL-SWITCH.md |
| 2026-10-31T14:22:50.379Z | captain | t17 VERIFIED (parity grep + 21/21) | docs/log/CHECK.md |
| 2026-10-31T14:28:47.999Z | captain | nhận audit vòng 1, giao t8 (by + test F2), đổi phạm vi t7 sang tài liệu | docs/audit/vong-1.md |
| 2026-10-31T14:33:49.703Z | captain | t7 VERIFIED; xác nhận update_member không tới được member đã spawn (tools.js:573-580) | docs/van-hanh/khuyen-nghi-update-member.md |
| 2026-10-31T14:34:43.039Z | captain | t8 VERIFIED (mutation test 21/22 → 22/22); tách MODEL-SWITCH.md thành file máy đọc + notes | docs/log/CHECK.md |
| 2026-10-31T14:40:18.706Z | captain | t18 VERIFIED (tự chấm lại 9/9); chuyển khối E2E khỏi file máy đọc | docs/kiem-thu/hot-switch-e2e.md |
| 2026-10-31T14:45:11.422Z | captain | Thêm R-GRAPH + tools/dependency-report.mjs + docs/DEPENDENCIES.md; ghi MASTER-PROMPT.md chuẩn | docs/MASTER-PROMPT.md |
| 2026-10-31T14:56:28.192Z | captain | t19 VERIFIED (hash + 2 suite); mở t20 (ERP-compat) và t21 (E2E add member) | docs/audit/dong-finding-vong-1.md |
| 2026-10-31T15:03:47.064Z | captain | t20 VERIFIED (15/15, hash ERP bất biến); phát hiện brief sai dấu bất biến hash | docs/kiem-thu/tuong-thich-erp.md |
| 2026-10-31T15:09:19.752Z | captain | t21 VERIFIED (A1..A7); yêu cầu dev-ui báo cáo trạng thái t9 | docs/kiem-thu/add-member-e2e.md |

## 2026-10-31T16:17:47.015Z
- Member mới `dev-ui-goat` (command-code-goat/deepseek/deepseek-v4.1-flash, high) được thêm vào đội ĐANG CHẠY bằng `agent_teams_add_member` (dogfood lần 2).
- `agent_teams_reassign_task(t10 → dev-ui-goat)`: attempt 2, attempt_id `b95ef762-4815-4409-9f2f-a348836f27e0`.
- Ghi BUG-006 (opencode-go 429) + HANDLE-007 (playbook provider chết).

## 2026-10-31T16:18:21.756Z
- Thêm `kiem-thu-goat` (command-code-goat, high); reassign t11 → kiem-thu-goat; gỡ member chết `dev-ui` (opencode-go 429, idle, không còn task).

## 2026-10-31T16:29:13.601Z
- t10 VERIFIED (captain tự rebuild khớp hash + smoke 22/22 + browser smoke `Overall: PASS`).
- t11 tự động được scheduler gán cho `kiem-thu-goat`; captain gửi brief HTTP-E2E 8 tiêu chí.
- Thêm `audit-goat` (command-code-goat, effort max) và reassign t12 để audit vòng 2 không chết theo provider.

## 2026-10-31T16:42:22.971Z
- t11 VERIFIED: captain chấm lại artifact 11/11, xác nhận HTTP 200/409/audit/cold-read; đối chứng `members.js:722-736` + `state.js:814` để loại 2 nghi vấn sai.
- t12 tự động gán cho audit-goat; captain gửi brief 6 mục, Q1 = routeOverride sau cold resume (nghi vấn BUG-007).

## 2026-10-31T16:45:41.599Z
- CHỈ THỊ NGƯỜI DÙNG: mọi member chuyển sang deepseek v4.1 flash (model khác đốt token quá nhanh).
- Gỡ 5 member route chết/đắt, roster còn 3/3 flash; thêm mục 'CHÍNH SÁCH MODEL' vào quy-tac-du-an.md.

## 2026-10-31T16:59:42.284Z — F9: đối chiếu message_id thật của kênh Telegram
- ky-01 → messageId 5; ky-02 → 6; ky-03 → 7; ky-04 → 9 (2 phần); ky-05 → 11 (2 phần); ky-06 → 13 (2 phần). Chat `-1004360988691`. Nguồn: response thật của `node tools/telegram-report.mjs` (`{"ok":true,...}`), không phải suy đoán.

- Telegram kỳ 7 gửi thật: messageId 15 (2 phần) — audit vòng 2 + đóng F1/F2/F9 + luật flash-only.
## 2026-10-31T17:02:20.000Z — t13: bộ tài liệu vận hành (dev-ui-goat, attempt 1)
- Viết mới `docs/bao-cao-agent-teams.md` (80 dòng): báo cáo cho người dùng — 3 tính năng + neo mã + bằng chứng t18/t21/t20 + 5 giới hạn đã biết + đường đọc tiếp.
- Mở rộng `docs/van-hanh/README.md` (75 → 113 dòng): bảng 9 suite với số thật (t3 18/18, t4 22/22, t10 22/22, t15 21/21, t17 21/21, t18 9/9, t20 15/15, t21 7/7, t11 11/11) và mục 4 mới nêu 3 khoảng trống.
- Mở rộng `docs/van-hanh/di-migrate-va-rollback.md` (98 → 114 dòng): mục 6 'audit trail đọc ở đâu' (bảng MODEL-SWITCH.md / team.json / transcript member / inbox) + mục 7 thêm ca F3 (auth fence `/plan` 401·405·413 chưa có test).
- Hai phát hiện low của audit vòng 2 đã được tài liệu hoá đúng chỗ: (a) `lib/events.js:25-46` bỏ event `agent-teams/*` khi harness không khai báo ⇒ audit chuẩn = `docs/log/MODEL-SWITCH.md` + `team.json`, ghi ở mục 6 của hướng dẫn di trú; (b) F3 ghi ở mục 4.2 của README và mục 7 của hướng dẫn di trú.
- Kiểm chứng máy: 48/48 link tương đối trong 4 file tài liệu trỏ tới file có thật (0 missing), 7/7 neo mã trích dẫn tồn tại trong `packages/dsh-agent-teams/lib/*.js`.
- Sai lệch đã sửa trong lúc kiểm: file nguồn ghép chuỗi nên câu lỗi trần là `agent-teams: maxManualMembers (<n>) must be >= maxMembers (<m>)` (`lib/index.js:145-146`), không phải chuỗi liền — đã sửa lại trích dẫn trong bảng khoá cấu hình.
## 2026-10-31T17:40:00.000Z — t25: sửa 3 lỗi nội dung báo cáo người dùng (dev-ui-goat, attempt 1)
- L1 (overclaim): §1 của `docs/bao-cao-agent-teams.md` nói fork đã 'thay v0.1.28 trong profile' → sửa thành sự thật: bản viết lại đóng gói trong `packages/dsh-agent-teams`, **chưa cài vào profile nào** (BUG-003), cách cài ở §3.
- L2 (hàng test giả): bỏ hàng `tests/t17-*.mjs | 21/21` (tệp không tồn tại — `ls tests/*.mjs` chỉ có t3, t4, t10, t11, t15, t18, t20, t21, t24); bằng chứng parity toolPolicy (12 case) gộp vào hàng `tests/t15-activate-member.mjs` 21/21 ở cả báo cáo lẫn `docs/van-hanh/README.md`.
- L3 (số liệu cũ): câu '3 phát hiện hồ sơ đang được captain xử lý' → đã đóng: TODO 62 dòng/24 hàng task (VERIFIED=20), `node tools/dependency-report.mjs` = tasks=24 realEdges=22 derivedEdges=9 waves=9 problems=0, messageId Telegram 5/6/7/9/11/13/15 có trong ky-01..ky-07.
- MỚI `tools/check-doc-paths.mjs` (141 dòng): quét `tests/*.mjs`, `lib/*.js`, `docs/**`, `build/**`, `tools/**` + mọi link tương đối trong báo cáo và `docs/van-hanh/*.md`, in bảng `path | exists` rồi `link | exists`, hỗ trợ glob (`*`, `?`, `/**/`) để pattern không khớp tệp nào bị báo NO, exit 1 khi có dòng NO; `--summary` in một dòng, `--write` sinh `docs/van-hanh/kiem-tra-duong-dan.md`.
- Lần chạy đầu của chính script bắt được 2 lỗi: (1) `docs/provenance-tasks.js` — regex của script khớp `.js` trước `.json` nên cắt cụt tên tệp (đã đổi thứ tự `json|mjs|html|md|ts|js|sh`); (2) `tests/t17-*.mjs` — đúng lỗi L2. Sau khi sửa: `SUMMARY files=4 paths=44 paths_missing=0 links=39 links_missing=0`, EXIT 0, báo cáo 94 dòng (trần 95).

## 2026-10-31T17:12:21.492Z
- Telegram kỳ 8 → messageId **17** (2 phần), file `docs/bao-cao-telegram/ky-08.md`.
- t23 VERIFIED (captain tự chạy build 2 lần + parse map + Chromium), t25 VERIFIED (mutation test checker), t26 được scheduler gán cho audit-goat; đã gửi brief cảnh báo phương pháp qua `agent_teams_send_message` (message_id `eb0e65e1-3988-4b9f-8a3f-11d6e2b5ddfc`, delivered wake).

## 2026-10-31T17:17:36.546Z
- Telegram kỳ 9 (closure) → messageId **19**, 2 phần (`docs/bao-cao-telegram/ky-09.md`).
- Verdict closure: PHÁT HÀNH ĐƯỢC; N1–N4 đã sửa; DEPENDENCIES 26 task; checker paths=45 missing=0.

## 2026-10-31T17:23:10.096Z — Vòng goal 4/256: mở t27–t29
- Sửa N1–N4 (báo cáo §4, TODO đếm + hàng t27–t29, pnpm-workspace.yaml khôi phục, provenance addedInFork).
- BUG-003 hạ mức: profile nháp `agent-teams-test` là symlink tới fork hiện tại; phiên master vẫn nạp 0.1.28.
- Thêm member dev-runtime-goat (goat flash high); 3 task t27/t28/t29 (deps t26) đã được scheduler gán.
- Provenance +3 cạnh (12); `node tools/dependency-report.mjs` → tasks=29 realEdges=28 derivedEdges=12 waves=12 problems=0.
- `node tools/check-doc-paths.mjs --summary` → files=4 paths=45 links=39, 0 thiếu, EXIT=0.
- Telegram kỳ 10 gửi thật: messageId=20.


## 2026-10-31T17:48:15.232Z — Chốt t31 + t33, mở vòng t34/t35
- t31 (audit closure vòng 3) VERIFIED sau khi captain tự giải nén tarball + tự chạy lại 12 bộ kiểm: verdict **ĐÁNG CÀI từ nguồn**, **tarball t29 KHÔNG dùng được**.
- t33 (dev-ui-goat) VERIFIED: §7 tài liệu rollback + số liệu cổng đường dẫn (47 path / 40 link, 0 thiếu, EXIT 0).
- Mở **t34** (dev-ui-goat, deps t31) = V3-F4 render `lastFailure` trong panel; **t35** (dev-build-flash, deps t34) = V3-F1 pack lại tarball + kiểm 3 chiều + boot profile sạch.
- `docs/TODO.md` 35 hàng (VERIFIED=32 · CANCELLED=1 · OPEN=2) + bảng V3-F1..V3-F6; provenance 23 cạnh; `dependency-report` → tasks=35 realEdges=37 derivedEdges=23 waves=16 problems=0; `check-doc-paths` → paths=48 links=41, EXIT 0.
- Telegram kỳ 13 gửi thật: messageId=23 (`docs/bao-cao-telegram/ky-13.md`).

## 2026-10-31T17:50:40.720Z — t34 VERIFIED, t35 chạy
- dev-ui-goat xong t34 (UI `last_failure`): bundle mới `0026ac70…`/193 129 B, map `28facff2…`/326 147 B, t10 25/25.
- Captain tự đo 7/7 (build ×2 cùng hash, map JSON.parse sạch, 0 đường dẫn ổ đĩa, Chromium PASS, 4 tệp lõi đóng băng không đổi).
- Chuyển `docs/bao-cao-agent-teams.md` sang số mới (mục 2.1, hàng t10, dòng đếm).
- t35 auto-claimed bởi dev-build-flash; captain gửi brief (message_id 4f13a15f-…) kèm bảng 7 hash đóng băng + 4 điểm bắt buộc (vị trí tarball, CRLF, kiểm 3 chiều, boot thấy 2 tool).

## 2026-10-31T17:54:44.563Z — t35 VERIFIED, mở t36 (audit vòng 4)
- dev-build-flash pack lại sạch: tarball `c3e3e88a…2745`/2 191 904 B, 2 lần pack cùng hash.
- Captain tự đo 7/7 ba chiều + tự chạy analyzer; đóng **V3-F1**.
- Mở t36 (audit-goat, deps t35) = audit closure vòng 4 chốt phát hành; provenance +1 cạnh.
- Dọn thư mục giải nén tạm `packages/dsh-agent-teams/tests/tmp/cap-t35` + 2 script kiểm tạm ở `tests/tmp/`.
- Telegram kỳ 14 gửi thật: messageId=24 (`docs/bao-cao-telegram/ky-14.md`).

## 2026-10-31T18:00:13.444Z — t36 VERIFIED: vòng 4 đóng, PHÁT HÀNH ĐƯỢC
- audit-goat chấm tarball t35 + tự mutation rồi khôi phục; verdict không còn điều kiện cứng.
- Captain tự chạy lại t3 18/18 · t10 25/25 · t30 8/8 · t20 15/15 · t35 7/7; xác nhận F1 bằng mã, F4 bằng số đo.
- Ghi `packages/dsh-agent-teams/tests/tmp/t29/SUPERSEDED.md`; TODO 36 hàng ĐÓNG (VERIFIED=35 · CANCELLED=1 · IN_PROGRESS=0 · OPEN=0).
- Telegram kỳ 15 gửi thật: messageId=25 (`docs/bao-cao-telegram/ky-15.md`).

- **2026-10-31 — Dogfood GUI thật (captain)**: phát hiện `agent-teams-test` là profile headless (không có `@deepseek-ai/dsh-web-app`) ⇒ không thể "bấm panel"; dựng `agent-teams-gui` từ template `web`, nối junction tới fork, boot cổng 19488, chứng minh plugin nạp + phục vụ state 200 trong GUI sống, rồi **tắt server**. Báo cáo: `docs/kiem-thu/gui-phien-song.md`; nhật ký: `docs/log/CHECK.md`.
- **2026-10-31 — Telegram kỳ 16**: gửi THẬT `{"ok":true,"chatId":"-1004360988691","messageId":26,"parts":1}` (`docs/bao-cao-telegram/ky-16.md`).

- **2026-10-31 — Mở vòng 5 (round 5/256)**: phân tích khoảng trống sau audit vòng 4 → tạo 6 task có hợp đồng chất lượng: t37 (tool clear override, dev-runtime-goat, IN_PROGRESS), t38 (fallback per-member, dev-runtime-goat, deps t37), t39 (HTTP clear + UI revert/badge, dev-ui-goat, deps t37), t40 (công cụ đề xuất di trú ERP, kiem-thu-goat, IN_PROGRESS), t41 (pack lại tarball, dev-build-flash, deps t38,t39), t42 (audit closure vòng 5, audit-goat, deps t37–t41). Provenance thêm 11 cạnh (35 tổng); `node tools/dependency-report.mjs` → `tasks=42 realEdges=47 derivedEdges=35 waves=21 problems=0`. Gửi brief cho dev-runtime-goat (msg `baf1a489…`) và kiem-thu-goat (msg `8ca2f66c…`), cả hai `delivered: wake`.
- **2026-10-31 — Telegram kỳ 17** gửi thật: `{"ok":true,"chatId":"-1004360988691","messageId":27,"parts":1}` (file `docs/bao-cao-telegram/ky-17.md`, header đã ghi messageId). Chuỗi messageId: 5,6,7,9,11,13,15,17,19,20,21,22,23,24,25,26,27.
- **2026-10-31 — Telegram kỳ 18** gửi thật: `{"ok":true,"chatId":"-1004360988691","messageId":28,"parts":1}`. Đồng thời: t40 VERIFIED (20/20, ERP sha không đổi), t37 VERIFIED (14/14 + 2 mutation), mở t43/t44/t45; 4 task chạy song song (t38, t39, t44, t45).

## Vòng 5 — captain chấm xong 5 task + mở t46 (Telegram kỳ 19 = messageId 30)
- t37/t38/t39/t40/t44 VERIFIED bằng máy chạy + mutation test của captain (chi tiết `docs/log/CHECK.md`).
- Baseline mã mới sau t38: tools `d34ab057…`/187 049 · members `fcaf2a71…`/86 930 · state `7b49f5ab…`/56 282 · snapshot `92ecdd87…`/11 687 · index `b2f35617…`/37 560 · client.js `302aa6cf…`/195 756.
- Mở **t46** (dev-ui-goat, deps t38): HTTP `set_member_fallback`/`clear_member_fallback` + badge/dòng fallback + nút xoá fallback; brief gửi message `77dd1a34-5900-476a-8fb4-d7b0a90d53cb` (wake).
- Brief t43 gửi dev-runtime-goat message `fc730dcd-ac7b-4224-a757-21a57b927b6b` (wake).
- **BUG-012** ghi nhận: `agent_teams_edit_plan` từ chối cả batch vì task `t1` có assignee `nghien-cuu` đã removed ⇒ không nối được t46 vào deps t42; chờ vòng 6 sửa trong `lib/tools.js`.
- `node tools/dependency-report.mjs` → `tasks=46 realEdges=52 derivedEdges=40 waves=21 problems=0`.

## Kỳ 20 — chốt t43/t46/t47/t45 bằng máy chạy + mutation của captain (Telegram messageId 31)
- t45 PASS 7/7 sau khi captain tự chấm lại artifact `tests/tmp/e2e-t45clear/2026-10-31T18-35-47`.
- t43 19/19 (mutation A 14/19, B 13/19); t46 15/15 (mutation A 14/15, B 12/15); t47 t38 17/17 (captain tự revert guard ⇒ 14/17).
- Chuyển t48 từ dev-build-flash (đang chạy t41) sang dev-runtime-goat vừa rảnh; brief `04b1a072-4cdc-4917-b4c5-060a6ff4fd77`.
- Mở t49/t50/t51 từ khoảng trống member khai; sửa header TODO (xoá dòng 'Đếm (chỉ tính task t1–t36)' lỗi thời).

## Chốt t41 + t49; tách phát hành thành t52 (pack cuối) và t53 (audit tarball cuối)
- t41: 9/9 PASS nhưng captain tự đo thấy tarball lệch 3 tệp so nguồn ⇒ KHÔNG dùng để phát hành.
- Gửi audit-goat điều chỉnh phạm vi t42 (message `00928dec-e32f-49ee-a550-d97fec0c7265`): chấm MÃ NGUỒN, không kết luận trên tarball cũ.
- Gửi dev-build-flash brief t52 + audit-goat brief t53 (deps đã nối, có drift=0 bắt buộc).

## 2026-10-31T19:31:06.842Z — round 6/256 (captain)

- **Chốt vòng 5**: t52 (tarball cuối `5306f31b…bfb7`/2 209 460 B/133 entry, drift=0) + t53 (audit tarball **PHÁT HÀNH ĐƯỢC**) đã chuyển sang VERIFIED sau khi captain tự đo độc lập (hash 3 chiều 10/10 SAME).
- **DOG-02 — truy nguyên 2 nguyên nhân**: (1) Host 19387 nạp `@nanmicoder/dsh-agent-teams 0.1.28` (0 hit marker control); (2) `packages/dsh-agent-teams/lib/client/ActivityPanel.js:642-647` chỉ hiện team có `captainSessionId === current`. Hướng dẫn cũ của captain ('mở session bất kỳ trên 19488') là **SAI** — đã đính chính trong docs/TODO.md và báo cáo Telegram kỳ 24.
- **Mở vòng 6**: t57 (dev-ui-goat, brief `0d470edb-480e-47bd-8f36-9805aaec47d9`) test + tài liệu 'Thấy 2 control trong panel — 3 điều kiện'; t58 (dev-runtime-goat, brief `b0402101-860b-41c1-8080-a616023807c8`) công cụ GHI di trú route ERP có chốt an toàn; t59 (kiem-thu-goat, brief `4e8d00e9-a13a-4dd3-95d4-fa683800dbf8`) E2E trên bản copy dữ liệu ERP thật.
- **Công cụ hồ sơ**: `tools/dependency-report.mjs` nay đọc `prov.superseded` (t51 → t55) nên không còn báo động giả 'cha van failed'; `node tools/dependency-report.mjs` → tasks=59 realEdges=68 derivedEdges=62 waves=26 **problems=0**.
- **Telegram kỳ 24** = messageId **35** (chat -1004360988691, parts 1).
## Vòng 11 — BUG-023 lộ ra từ t82, vá ở t86, đóng bằng audit t85 (2026-10-31T21:1x–21:5xZ)

Bối cảnh: vòng 11 là vòng đầu tiên có **cổng biên dịch** (t83) và có một phát hiện nghiệp vụ nặng
(BUG-023) do chính bộ test của tôi (t82) bắt được, không phải do đọc mã.

| Thời điểm (UTC) | Ai | Hành động | Kết quả | Tệp liên quan |
| --- | --- | --- | --- | --- |
| 2026-10-31T21:12:51Z | kiem-thu-goat (t82) | Chạy E2E routeOverride sau khi công cụ di trú ghi route; case C3 so `request/header` của phiên con THẬT | **FAIL 5/6**: phiên con `84d85f22-f8ca-4b1b-9e59-cad16095073b` gửi `…deepseek-v4.1-flash` (route khai báo) thay vì `…v4-pro` đã di trú; `routeOverride` biến mất sau spawn | `tests/t82-erp-migrate-live.mjs`, `tests/tmp/e2e-t82/run-2026-10-31T21-12-51-903Z` |
| 2026-10-31T21:1xZ | captain | Đọc mã đối chứng, không tin báo cáo: `lib/tools.js:546-548` dựng selection từ spine, `lib/members.js:1054-1060` escalate rồi `delete routeOverride` | Kết luận **LỖI SẢN PHẨM THẬT** ⇒ mở **BUG-023** + task sửa **t86** | `docs/log/BUG.md:131`, `docs/log/CHECK.md:300-303` |
| 2026-10-31T21:2xZ | dev-runtime (t83) | Thêm cổng biên dịch `tsc` vào suite kiểu | `tsc 5.9.3` · 21 tệp `lib/types/*.d.ts` · t56 **20/20** (d18 = cổng THẬT, d20 = đối chứng âm "thiếu tsc" cố ý) | `tests/t56-types-fallback.mjs` |
| 2026-10-31T21:2xZ | dev-runtime-goat (t86) | Vá: đưa precedence về MỘT chỗ và cho nhánh spawn dùng nó | `lib/members.js:486 export function selectionFromMember(member)`; `lib/tools.js:546-560` dùng `membersApi.selectionFromMember(member) ?? {provider, model, reasoningEffort}`; khai báo mới `lib/types/members.d.ts:176`; test chặn tái diễn **8/8** | `lib/members.js` `4f818b73803d`/100 367 · `lib/tools.js` `75800e15fce2`/196 084 · `lib/types/members.d.ts` `c53250ab41bf`/31 769 · `tests/t86-override-before-spawn.mjs` |
| 2026-10-31T21:2xZ | captain | Chấm độc lập t86 + hồi quy, rồi tự mutation để chứng minh test có răng | t86 8/8 · t56 20/20 · t43 19/19 · t20 15/15 · t38 17/17 · t3 18/18, ERP `9f7420b6…15f2d1e` không đổi; mutation `routeOf({...member, routeOverride: undefined})` (+33 B) ⇒ **4/8 FAIL** rồi phục hồi byte-identical | `docs/log/BUG.md` (khối BUG-023), `docs/log/CHECK.md:304-317` |
| 2026-10-31T21:24:48Z | dev-tools (t84) | Pack vòng 11 | sha256 `220a6da96f82…37db1` / 2 242 952 B / 133 entry (bản này **bị thay thế** ở vòng 12 bởi t88) | `packages/dsh-agent-teams/tests/tmp/t84/` |
| 2026-10-31T21:5xZ | audit-goat (t85) | Audit độc lập vòng 11 (không dùng `--analyze`, tự hash/giải nén, 3 mutation kiểu mới, quét 44 suite) | **TARBALL t84 PHÁT HÀNH ĐƯỢC, CÔNG BỐ CHƯA** (V11-F1 medium: báo cáo vẫn trỏ t78); 133/133 payload = nguồn; 44 suite EXIT 0; mutation M1/M2/M3 đều làm suite đỏ rồi phục hồi byte-identical | `docs/audit/closure-vong-11.md` 79 dòng, `docs/log/AUDIT.md` |

**Quyết định của captain trong vòng 11**
- **Giữ đỏ thay vì nới assert**: t82 FAIL được giữ nguyên làm bằng chứng; không sửa test cho xanh, mà mở task sửa mã (t86).
- **Siết test t86 khi vá**: t86 không chỉ vá call-site mà còn thêm assert "spine literal trong `lib/tools.js` = 0 lần" + đếm call-site thật = 2 + neo consumer — tức bản vá phải *chứng minh* không còn đường nào đọc spine, chứ không chỉ chỗ vừa sửa.
- **Mutation phải do người KHÁC viết**: member tự mutation không tính là bằng chứng; captain tự mutation, audit tự mutation (≥3 kiểu mới mỗi vòng).

## Vòng 12 — t87 vá approve, t88 pack, t89 audit chốt PHÁT HÀNH ĐƯỢC (2026-10-31T22:0x–23:5xZ)

| Thời điểm (UTC) | Ai | Hành động | Kết quả | Tệp liên quan |
| --- | --- | --- | --- | --- |
| 2026-10-31T22:0xZ | dev-tools (t87) | Vá nhánh **approve**: plan preview của member staged đọc spine thay vì route đã ghim | `lib/tools.js:732` nay `membersApi.selectionFromMember(member) ?? {…}`; `spine literal` trong `lib/tools.js` = **0 lần**; call-site thật = **2** (553, 732; hit thứ 3 ở :727 chỉ là chữ trong comment); suite `tests/t87-approve-override.mjs` **8/8** | `lib/tools.js` `9be217b1669a`/197 372, `tests/t87-approve-override.mjs` |
| 2026-10-31T21:25:33Z | kiem-thu-goat (t82 chạy lại) | Chạy lại E2E sau bản vá t86 (cùng bộ chấm, không nới assert) | **PASS 6/6**: phiên con `cab3814f-13c6-4747-b6c1-3983eec17204` gửi `request/header = command-code-goat/deepseek/deepseek-v4-pro` = route ĐÃ DI TRÚ; `--analyze` cũng EXIT 0 | `tests/tmp/e2e-t82/run-2026-10-31T21-25-33-603Z`, `docs/kiem-thu/t82-erp-migrate-live.md` |
| 2026-10-31T22:0xZ | captain | Chấm t87 + t86, tự mutation, rồi chạy lại hồi quy rộng | t87 8/8 · t86 8/8 · t3 18/18 · t4 22/22 · t20 15/15 · t43 19/19 · t56 20/20 · t10 48/48 · t70 16/16 · t74 24/24 · t77 18/18 — EXIT 0; mutation `lib/members.js:446 overrideProvider → undefined` (+16 B) ⇒ t87 **4/8** + t86 **4/8** đỏ, phục hồi `4f818b73803d`/100 367 | `docs/log/CHECK.md:320-335` |
| 2026-10-31T22:1xZ | dev-tools (t88) | Pack vòng 12 (bản sau t87) | sha256 `0adbc64e1564b079048c465634ba9d38e9795bdfa2662269a514124524ceed2c` / **2 243 224 B** / **133 entry** / 0 entry thư mục / 0 rác; ba chiều 12/12 (nguồn ↔ payload ↔ bản cài `agent-teams-pack11`) | `packages/dsh-agent-teams/tests/tmp/t88/`, `tests/t88-pack.mjs` |
| 2026-10-31T22:2xZ | captain | Xử lý 4 findings của audit vòng 12 (xem bảng dưới) | V12-F2 header TODO 83→**85**; V12-F3 chạy lại t3/t15 rồi sửa 2 hàng báo cáo; V12-F4 **sửa MÃ** (`want` khai trước `import()`) ⇒ probe đủ tên 0 / thiếu tên 1 / module không tồn tại 2; V12-F1 **GIỮ ĐỎ** | `docs/log/CHECK.md:336-346`, `tests/t84-pack.mjs` `9046c22b2958`/62 211, `tests/t88-pack.mjs` `e09c5c88ac77`/64 122 |
| 2026-10-31T23:5xZ | audit-goat (t89) | Audit độc lập vòng 12: tự hash tarball, giải nén, quét 47 suite, 4 mutation + 1 drill artifact | **TARBALL t88 PHÁT HÀNH ĐƯỢC**; 46/47 suite EXIT 0 (lượt đỏ = V12-F1, lỗi truy vết); 133/133 payload = nguồn; ERP không đổi; verdict hết hiệu lực nếu payload đổi sau `2026-10-31T21:53:17Z` | `docs/audit/closure-vong-12.md` 72 dòng, `docs/log/AUDIT.md` |

**Quyết định của captain trong vòng 12**
- **Chấp nhận 3 kiểu mutation của audit** (đều kiểu chưa dùng ở vòng 5–11) làm bằng chứng đủ: M1 *hoán vị hai trường* khi gán vào spine, M2 *đảo nhánh fallback*, M3 *đổi tên một named export thật*; cộng M4 *sửa 1 byte trong artifact ĐÃ GIẢI NÉN* (kiểm phép so ba chiều chứ không kiểm mã nguồn).
- **Giữ đỏ V12-F1**: `--analyze` trên run cũ của t84 vẫn EXIT 1 vì meta thiếu `selfMutation` — "một artefact không mang đối chứng thì không phải bằng chứng"; chỉ làm rõ chẩn đoán, không cho qua.
- **Sửa MÃ cho V12-F4** thay vì sửa comment: comment hứa exit 2 nhưng probe exit 1 do `want` là `const` trong callback ⇒ khai lại ở scope con trước `import()`.
- **Không pack lại t88** sau khi audit chốt: pack lại sẽ tạo bộ byte khác dưới cùng tên ⇒ chính tarball đã chấm không còn tồn tại.

### Mutation của captain và của audit trong vòng 11–12 (mỗi hàng là một lần làm suite ĐỎ thật rồi phục hồi byte-identical)

| Vòng | Ai | Kiểu | Điểm sửa | Delta | Suite đỏ |
| --- | --- | --- | --- | --- | --- |
| 11 | captain | vô hiệu hoá override trong precedence | `routeOf({...member, routeOverride: undefined})` | +33 B | t86 **4/8** (a1, a2, d3, c1) |
| 11 | audit | hằng số trong doc-comment khai báo | `lib/types/members.d.ts:250 MEMBER_ROLE_MAX = 200` → `= 201` | 0 B (`c53250ab41bf`→`2a5b34558a56`) | t56 **EXIT 1** (d13) |
| 11 | audit | xoá một interface khai báo | block `export interface MemberProfileChangeResult` | −655 B | t56 **EXIT 1** (d16) |
| 11 | audit | revert một bản vá ở call-site | `lib/tools.js:553` `selectionFromMember(member)` → `undefined` | −29 B (`75800e15fce2`→`88ecd09d4a8c`) | t86 **EXIT 1** (a1, a2, c2, c3) |
| 12 | captain | vô hiệu hoá đọc override | `lib/members.js:446 const overrideProvider = member.routeOverride?.provider?.trim()` → `undefined` | +16 B | t87 **4/8** + t86 **4/8** |
| 12 | audit | hoán vị hai trường khi gán vào spine | `lib/tools.js` cặp `member.provider = …` / `member.model = …` (nhánh approve, idx 42063) | 0 B (`9be217b1669a`→`5ab6a73d6ac2`) | t87 **EXIT 1** (a1,b1,e1) + t86 **EXIT 1** (c2) |
| 12 | audit | đảo nhánh fallback | `lib/members.js:440 if (member.fallbackActive === true)` → `!== true` | 0 B (`4f818b73803d`→`f39cc73c7513`) | t37 **EXIT 1** (h1) |
| 12 | audit | đổi tên một named export thật | `lib/members.js:486 export function selectionFromMember(` → `selectionFromMemberX(` | +1 B | t86 **EXIT 1** (a1,a2,d1) + t87 **EXIT 1** (a1,a2,a3) |
| 12 | audit | sửa 1 byte trong artifact ĐÃ GIẢI NÉN | `extract-drill/package/lib/client.js` +1 byte | +1 B | phép so ba chiều: 132 same / **1 diff**; giải nén lại ⇒ 133 same / 0 diff |

**Bài học vòng 12 (lặp lần 3)**: hai lần đo của captain hỏng vì **lỗi của chính captain** (script `.mjs` dùng
`require` ⇒ `ERR_AMBIGUOUS_MODULE_SYNTAX`; tra `registerAgentTeamsTools` trong `members.js` trong khi nó ở
`lib/tools.js:505`) ⇒ quy tắc: script đo của captain luôn là `.cjs` bọc `async function main()`, và trước khi
kết luận "member sai" phải chỉ ra ĐÚNG tệp mà symbol phải nằm ở đó.

## Vòng 13 — BUG-024 (roster edit_plan đọc spine + render bỏ roster), cổng log có răng, pack t96 và audit t97 (2026-10-31T22:41:04.775Z)

| Bước | Việc | Bằng chứng đo được |
| --- | --- | --- |
| t90 | captain tự đọc mã phát hiện `lib/tools.js:1183` dựng roster bằng spine ⇒ member staged có `routeOverride` bị báo sai route | dòng spine cũ = **0 hit** sau vá; `editPlanRosterRow` dùng `selectionFromMember` |
| t90 | dev-runtime-goat vá roster + dấu nguồn gốc route | t90 **10/10**, t50 11/11, t87 8/8, t3 18/18, t20 15/15 EXIT 0 |
| t91 | kiem-thu-goat dựng cổng `tools/check-logs.mjs` + viết lại ACTIVITY/BA vòng 11–12 | trước: `ok=5 fail=2 problems=2` EXIT 1 → sau: `ok=7 fail=0 problems=0 newest_round=12` EXIT 0; suite 14/14 |
| — | captain E2E headless `session-9f394b2f`: text edit_plan **không có** dòng roster ⇒ nửa còn lại của BUG-024 | `lib/tools.js:1138` render chỉ in `value.graph` |
| t94 | dev-runtime-goat vá render (`[...value.graph, ...value.roster]`) | t94 **9/9**; E2E thật `session-1a810232` in `alice (researcher; … (override))`; mutation riêng của captain (separator) ⇒ 3/9 đỏ rồi phục hồi identical |
| t95 | kiem-thu-goat: header TODO thiếu vòng nay là LỖI (không im lặng bỏ qua) + cờ `--allow-missing-round` | suite `tests/t93-check-logs.mjs` 14→**20 ca**; lượt 1 nộp FAILED vì dữ liệu header của captain (không nới assert) |
| — | captain sửa ngữ nghĩa header ('vòng 12 ĐÃ ĐÓNG gần nhất; V13 đang mở') ⇒ cổng xanh lại | `logs=7 ok=7 fail=0 problems=0` EXIT 0; t95 **VERIFIED** attempt 2 |
| t96 | dev-build-flash pack vòng 13 | tarball `0b9220eabbc4584f…`/2 243 920 B/133 entry; captain tự đo 3 chiều **12/12 SAME** với `agent-teams-pack13`; `--analyze` **24/24** |
| t97 | audit-goat chấm độc lập, tự dựng lại bằng chứng bằng boot thật | **phát hành được**: 133/133 payload = nguồn, 3 mutation kiểu mới đều đỏ, 51/52 suite EXIT 0, ERP không đổi |
| — | findings V13: F1 header TODO còn trỏ t88 · F2 board treo t93 ⇒ `problems=1` · F3 số đường dẫn cũ · F4 `t84 --analyze` C22 | captain xử lý: header → t96; provenance `superseded {t93: t96}` ⇒ `problems=0`; báo cáo → `paths=83`; F4 ghi nhận low |

**Bài học vòng 13.** (1) Vá đúng dữ liệu chưa đủ — phải kiểm cả đường người dùng ĐỌC (text tool_result), vì `t90` xanh mà người dùng vẫn không thấy gì. (2) Một cổng mới phải được thử bằng đầu vào XẤU NHẤT mà nó định chặn; ở đây chính dữ liệu header của captain làm cổng đỏ, và cách sửa đúng là sửa dữ liệu, không thêm ngoại lệ vào cổng.
## Vòng 14 — cổng render-parity (t98) mở ra lớp lỗi BUG-025

| Việc | Ai | Kết quả thật |
| --- | --- | --- |
| Dựng cổng tĩnh đối chiếu output.schema với output.render cho 16 tool | kiem-thu-goat (t98) | definitions=16 withRender=16 · fields=110 reached=92 uncovered=9 nested_gaps=4 allow_listed=5 · EXIT 1 (đỏ là đầu ra của task) |
| Captain tự chạy lại + tự đọc mã xác nhận | lead | khớp số của member; tự xác nhận create render thiếu members (lib/tools.js:889-900), set_member_profile thiếu previous_* và execution_prompt (:1468-1473), status thiếu team_id/phase |
| Chốt thiết kế cổng 2 chế độ (--report exit 0 / --strict exit 1 / cổng hỏng exit 2) | lead | giao vào t99 vì t98 đã terminal; verify của t99 dùng --strict |
| Vá 9 trường cấp 1 + nhóm lồng status.members[].route_override.* | dev-runtime-goat (t99) | IN_PROGRESS |

Bài học: cổng đo phát hiện lỗi KHÔNG được làm verify của chính task dựng cổng — attempt 1 của t98 bị harness buộc failed chỉ vì lý do đó.

### Vòng 14 — bổ sung sau khi captain tự chấm (t100, t101 mở, t102 mở)

| Thời điểm | Chủ thể | Hành động | Kết quả |
| --- | --- | --- | --- |
| vòng 14 | captain | Tự đo tarball t100 độc lập (`node:crypto`, `tar -tzf` strip CRLF, tự giải nén, ba chiều 12 tệp, `--analyze`) | `d7a8bce4a333…c57c9b1a` / 2 245 210 B / 133 entry / 12-12 SAME / 25-25 EXIT 0 ⇒ t100 **VERIFIED** |
| vòng 14 | captain | Đẩy `docs/bao-cao-agent-teams.md` sang số vòng 14 TRƯỚC khi giao audit (14 anchor, assert `count===1`) | `paths=87 paths_missing=0 links=41 links_missing=0`; grep số cũ = 0 (trừ câu 'bị thay thế') |
| vòng 14 | captain | Probe độ bền ĐỌC trên bản copy `team.json` ERP thật (6 phép) | phát hiện **BUG-026**: `routeOverride.source='erp'` làm `readTeam` ném; trường lạ thì OK; `status='blocked_by_erp'` lỗi không nêu giá trị hợp lệ |
| vòng 14 | captain | Mở **t101** (audit vòng 14) + **t102** (BUG-026) và gửi brief cho audit-goat + dev-runtime-goat | t101 `wake` (claim được ngay), t102 `wake` nhưng bị deps t101 chặn tới khi audit xong |
| vòng 14 | captain | Gửi Telegram kỳ 34 | `messageId 45`, `parts 1` |
### Vòng 14 — sau verdict audit t101

| Chủ thể | Hành động | Kết quả |
| --- | --- | --- |
| audit-goat (t101) | Audit độc lập tarball t100 + cổng t98 | verdict **pass**, `closure-vong-14.md` 77 dòng, `AUDIT.md` 257 dòng, 4 mutation kiểu mới, 55/55 suite (54 EXIT 0) |
| captain | Vá V14-F1/F2/F3 (tài liệu) + ghi V14-F4/F6/F7/F8 là ACCEPTED | `docs/TODO.md` dựng lại: 103 hàng/6 cột/id tăng dần/0 trùng; header tính từ hàng; báo cáo `tasks=103 realEdges=104 derivedEdges=113` |
| captain | Tự phát hiện 9 hàng TODO sai số cột (t51/t55 12 ô, t95 4 ô, t98..t103 7 ô) | dựng lại từng hàng, escape `\|` trong ô, `t95` viết lại nội dung + `deps=t91` |
| captain | Cổng sau khi vá | `check-logs newest_round=14 problems=0` · `check-doc-paths paths=87 paths_missing=0 links=41` · `dependency-report problems=0` |
### Vòng 14 — tiếp (BUG-026 hai nửa + mở V15)

| Việc | Kết quả |
| --- | --- |
| t102 (đọc lenient) | `lib/state.js` `56664c59…`/57 508 B; `tests/t102-erp-read-leniency.mjs` 17/17; captain mutation −4 B ⇒ 11/17 |
| t103 (ghi chặt) | `lib/members.js` `50f558f8…`/102 260 B; `tests/t103-write-source-clamp.mjs` 10/10; captain mutation −55 B ⇒ 6/10 |
| Hợp đồng phải amend | t102 rev1 (t58 f4) + rev2 (t3 sub-case 'unknown source'); t103 rev1 (verify trỏ tệp ma) |
| Verdict vòng 14 | hết hiệu lực vì `lib/state.js` + `lib/members.js` đổi sau mốc 2026-10-31T23:14:04Z |
| Task mở | t104 (pack V15, dev-build-flash) → t105 (audit V15, audit-goat) |
| Hồ sơ | TODO 105 hàng/6 cột, `badCols=0`; `dependency-report tasks=105 realEdges=106 derivedEdges=116 problems=0` |
### Vòng 15 — t104 pack (captain tự đo)

| Việc | Kết quả |
| --- | --- |
| t104 pack V15 | `tests/tmp/t104/nami-dsh-agent-teams-0.2.0-dev.0.tgz` sha256 `771298f33c08abf6133cb4b087bd9a2c644e97a4756c46b2b997101d70d53b0d` / **2 246 406 B** / 133 entry |
| Đo độc lập của captain | 133 entry / 0 thư mục / 0 rác / 0 absolute · **3 chiều 12/12 SAME** với `agent-teams-pack15` (không symlink, `0.2.0-dev.0`) |
| Freeze 12 tệp | 12/12 khớp bảng sau t103 ⇒ không ai sửa `lib/**` sau pack |
| Gate tự chạy | `t104-pack --analyze` 27/27 · t10 48/48 · t98 `--strict` và `--report` đều GREEN · ERP `9f7420b6…`/1 533 117 B không đổi |
| Văn bản chứng minh | guard GHI của t103 ném nguyên văn `… source "erp" is not one the plugin owns (valid sources: captain, http, profile); nothing was written`; status in `Team id: t104probe · phase: staged` |
| Hồ sơ | báo cáo đẩy sang vòng 15 TRƯỚC khi giao audit (sha/bytes/pack15/hash members+state, `paths=90`) |
### Vòng 15 — audit chốt + đóng findings

| Việc | Kết quả |
| --- | --- |
| Audit vòng 15 (t105) | verdict **PHÁT HÀNH ĐƯỢC** — `docs/audit/closure-vong-15.md` 86 dòng; 131 payload 0 lệch; 4 mutation kiểu mới; 57/58 suite EXIT 0 |
| Captain kiểm hiệu lực | tarball hash khớp · `freezeDrift none` · 0 dấu vết mutation (`{0,64}`=0, `'erp'` trong `PROVENANCE_SOURCES`=0) |
| Findings | V15-F1/F3/F4 ACCEPTED có lý do · V15-F2 tự đóng khi chốt task · **V15-F5 đã thành đoạn 'Giới hạn đã biết của vòng 15' ở §2.4 báo cáo** |
| Hồ sơ | TODO 105 hàng `VERIFIED=99 · CANCELLED=4 · SUPERSEDED=2 · OPEN=0`; báo cáo §2.3 chốt 'PHÁT HÀNH ĐƯỢC (Audit t105)' |
| Telegram | kỳ 36 = messageId **47** |
### Vòng 16 — mở: chứng minh trên dữ liệu ERP THẬT

| Việc | Kết quả |
| --- | --- |
| Vì sao | vòng 15 chỉ chứng minh BỘ BYTE; mục tiêu người dùng là 'Agent Teams dùng được với ERP' ⇒ phải boot thật trên `team.json` thật |
| Dữ liệu | `E:/Project/ERP/.agent-teams/erp-erp/team.json` sha `9f7420b6…15f2d1e`/1 533 117 B/14 member/107 task — CHỈ ĐỌC, mọi thao tác trên bản copy |
| Task | **t106** (kiem-thu-goat) contract C1..C6, gồm **C5 đối chứng âm trên bản cài `agent-teams-pack14`** phải ra lỗi cũ `is not a valid member record` |
| Hồ sơ | TODO 106 hàng/6 cột `badCols=0`; `dependency-report tasks=106 realEdges=106 derivedEdges=118 problems=0` |
## Vòng 17 — audit t109 (pass có điều kiện) + mở t110/t111/t112

| Thời điểm | Việc | Kết quả đo |
| --- | --- | --- |
| vòng 17 | t109 audit vòng 17 (audit-goat, effort max) | verdict pass; `closure-vong-17.md` 86 dòng; 133/133 payload = nguồn; 13/13 ba chiều `agent-teams-pack16`; 5 mutation kiểu mới; 58/61 suite xanh |
| vòng 17 | captain tự kiểm F1 + F11 | §2.1 sửa sang `d402c6586df1…`/210 641 + thêm `lib/types/tools.d.ts 41cfc56576ed…`/7 546; `problems=0` → `problems=1` kèm lý do (grep: hash cũ 0 hit, hash mới 2 hit) |
| vòng 17 | captain đọc mã xác nhận F2 + F4 | `tests/t98-render-coverage.mjs:626-639` chỉ gate `uncovered`; `lib/tools.js:3293` in `Members (${team.members.length} active + …)` |
| vòng 17 | mở t110 (repair F2+F4+F3, dev-runtime-goat) · t111 (pack vòng 18, dev-build-flash) · t112 (audit vòng 18, audit-goat) | `dependency-report tasks=112 realEdges=110 derivedEdges=124 waves=49 problems=1` (problem cũ: t106 chờ attempt 2) |

Bài học: audit bắt được loại lỗi mà chính người viết cổng không thấy — vì người viết cổng kiểm 'cổng có bắt được lỗi tôi vừa vá không', còn audit kiểm 'cổng có bắt được lỗi KHÁC không'. Từ vòng 17 trở đi, mọi finding mức medium về *khả năng phát hiện* phải mở task repair, không được ghi vào báo cáo rồi đi tiếp.

## Vòng 18 — cổng t98 có răng thật (t110) + pack vòng 18 (t111) + t59 lộ tiêu đề cũ (t113)

| Thời điểm | Việc | Bằng chứng |
|---|---|---|
| t110 (dev-ui-goat) | Vá V17-F2/F3/F4: cổng t98 kiểm payload ↔ schema, nested value, citation ALLOW_LIST; tiêu đề đổi sang 'Members (N present + M removed):' | `lib/tools.js` 88dbee4079f95ffd / 213 071 B; t98 --strict EXIT 0 `fields=112 reached=106 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 allow_list_line_problems=0`; t107 12/12 · t99 11/11 · t56 20/20 |
| captain chấm t110 | Ba mutation riêng: (A) citation ALLOW_LIST sai ⇒ EXIT 2 GATE ERROR; (B) đổi khoá payload `removed_members` ⇒ EXIT 1 `payload_findings=2`; (C) xoá cách in `tasks[].kind` (−30 B, giữ số dòng) ⇒ EXIT 1 `nested_gaps=1` | phục hồi byte-identical sau từng phép; riêng (C) chứng minh `nested_gaps` NAY là cổng (audit vòng 17 đã chỉ ra nó bị bỏ qua) |
| t111 (dev-build-flash) | Pack vòng 18 | tarball 1bb0ef1fc83acf50… / 2 247 954 B / 133 entry / 0 dir / 0 rác; ba chiều 13/13 SAME với `agent-teams-pack17`; `--analyze` 29/29 EXIT 0 |
| captain chấm t111 | Tự hash + tự giải nén + tự chạy suite; phát hiện verify của card trỏ `tests/t111-pack.mjs` (không tồn tại) ⇒ amend rev 1 sang đường dẫn thật | threeWaySame 13/13; `installedIsSymlink=false`; lock `file:` trỏ đúng tarball t111; marker `removed_count`=3 · `removed_members`=5 · `present + `=1 · `active + `=0 |
| t113 (dev-ui-goat claim) | `tests/t59-erp-live-copy.mjs:341` vẫn ghim tiêu đề cũ ⇒ lần chạy sống kế tiếp đỏ vì lý do SAI | đang làm; dev-runtime-goat đứng yên để tránh collision (lần thứ ba trong ngày một card repair bị claim chéo) |

Bài học điều phối: brief repair phải đo `mtime` + `sha256` của tệp mục tiêu NGAY TRONG LƯỢT GỬI và ghi mốc đó vào brief; nếu không, brief mô tả trạng thái đã cũ và người nhận có thể sửa trên nền người khác.

**t113 (dev-ui-goat) — xong, captain chấm độc lập:** `tests/t59-erp-live-copy.mjs` b3cfb88a/26 426 B (bỏ nhánh fallback tiêu đề một số, helper tự chứa đọc `(?:present|active)`), suite thật `tests/t113-roster-assertion.mjs` ffa1d7de/12 196 B **15/15**, chạy sống t59 của captain PASS C1..C9 (`run-2026-11-01T01-14-20-148Z`, C4 `Members (7 present + 7 removed)`, C8 ERP identical).
Đính chính trong cùng lượt: 'chữ tiêu đề dao động' là hiệu ứng cửa sổ ghi đè (01:03:11 'active' trong khi nội dung tệp chỉ có 'present'); lần đỏ 01:08:08 là `ERR_MODULE_NOT_FOUND` do profile relink — lỗi môi trường.

**BUG-028 (phát hiện khi chấm t113):** boot sống 01:03:11Z in tiêu đề CŨ `Members (7 active + 7 removed)` trong khi nguồn hiện tại chỉ có `present`; cả hai profile đều symlink tới nguồn (`agent-teams-test` mtime 01:08:24Z, `agent-teams-gui` 01:02Z) ⇒ kết luận: có một lần ghi KHÔNG CHỦ thay `lib/tools.js` bằng bản cũ trong khoảng 01:00:54–01:03:11Z, được trả lại ở 01:04:48Z. Không ai khai nhận; repo không có log cửa sổ mutation. Mở **t114** để suite sống tự chứng minh hash nguồn trước/sau boot.

### Vòng 18 — t115 VERIFIED (cổng kiểm hợp đồng task)

| Việc | Bằng chứng |
| --- | --- |
| t115 (dev-runtime-goat) | `tools/check-contract.mjs` 13 779 B · suite 31/31 EXIT 0 · cổng PASS 6/6 trên t115/t114/t112/t106 |
| Mutation của captain | vô hiệu phép (f) +9 B ⇒ suite 30/31 `# failed: f1`; phục hồi identical |
| Luật mới | chạy cổng hợp đồng TRƯỚC khi gửi brief (exit 1 ⇒ không gửi) |
### Vòng 18 (phần 3) — audit chốt + t106 PASS + mở V19

| Việc | Kết quả đo |
| --- | --- |
| t112 audit vòng 18 | verdict PHÁT HÀNH ĐƯỢC (công bố có điều kiện); closure 102 dòng; AUDIT.md 317 dòng/26 heading đủ vòng 1–18 sau sự cố ghi đè (member tự khôi phục từ transcript) |
| t106 attempt 2 | PASS 6/6 EXIT 0, `analyze: 0 boots`, C1 in `Members (7 present + 7 removed):` + `Removed (7):` + `Tasks (107):` |
| Captain kiểm chéo tarball t111 | 13/13 payload = nguồn; sha 1bb0ef1f…6414dc38 / 2 247 954 B / 133 entry |
| Cổng hợp đồng t115 | mở rộng cho trường hợp bootstrap (deliverable tự khai) ⇒ 33/33; t118 PASS 6/6, t117 PASS 6/6 |
| Hồ sơ | TODO 118 hàng/118 id/0 sai cột; `dependency-report tasks=118 realEdges=110 derivedEdges=131 waves=50 problems=0`; `check-logs newest_round=18`; `check-doc-paths paths=96` |

Bài học: cổng tự viết cũng có lỗ hổng — nó báo FAIL (a) trên một card ĐÚNG (verify chạy chính tệp card sẽ tạo). Sửa cổng kèm 2 ca (a8 bootstrap, a9 chống miễn trừ hàng loạt) chứ không nới phép kiểm.
V19 mở: t117 (cổng render-parity khớp theo đường dẫn khoá, V18-F2/F3) · t118 (suite pack trong repo, V18-F4) · t116 (suite sống tất định, T114-F1).

## Vòng 19 — bảng đo (captain tự chạy, 2026-11-01)

| Phép đo | Lệnh | Kết quả |
|---|---|---|
| Cổng render-parity (có cổng `nested_gaps`) | `node tests/t98-render-coverage.mjs --strict` | EXIT 0 · fields=112 reached=105 uncovered=0 nested_gaps=0 payload_findings=0 allow_listed=7 · 5 control applies=true |
| Chế độ báo cáo của cùng cổng | `--report` | EXIT 0 |
| Đóng băng nguồn (BUG-028) | `node tests/t114-source-freeze.mjs` | 16/16 · frozen=13 · problemsOnDrift=2 · problemsOnBadPin=2 |
| Ca boot-free của suite sống | `node tests/t113-roster-assertion.mjs` | 38/38 |
| Hiển thị hồ sơ removed | `node tests/t107-removed-members-visible.mjs` | 12/12 |
| Parity render (không sửa t99) | `node tests/t99-render-parity.mjs` | 11/11 |
| Hợp đồng trước dispatch | `node tests/t115-check-contract.mjs` | 33/33 |
| Cổng hợp đồng trên card mới | `check-contract --task t121 / t122` | PASS 6/6 cả hai (t121 nhận 'planned by this task' cho tệp suite sẽ tạo) |
| Dependency report | `node tools/dependency-report.mjs` | tasks=122 realEdges=113 derivedEdges=135 waves=52 problems=0 |

Mutation riêng của captain cho t117: in `ts` của `member_inbox` bằng hằng (−9 B) ⇒ t98 `--strict` **EXIT 2** (`nested_gaps=1` trên chính baseline) ⇒ witness đường dẫn khoá là cổng thật; phục hồi `identical=true` `e51734ba…/213 715 B`.

## Vòng 19 (phần 2) — bảng đo t121 (captain tự chạy)

| Phép đo | Lệnh | Kết quả |
|---|---|---|
| Hash tệp nộp | `node:crypto trên 2 tệp` | t121-pack.mjs 54 370 B / 74932f39f0aa0d74… · doc 7 608 B / 0664df8fc125d129… |
| Đóng băng 13 tệp (HEAD) | `sha256 13 tệp + so bảng FROZEN` | 13/13 khớp, drift=0, `lib/tools.js e51734ba…/213 715` |
| Tarball trên đĩa | `node:crypto + tar -tzf` | sha 2770fbfc4070eb80…3cc6251e · 2 248 092 B · 133 entry · 0 dir |
| Chấm artefact | `t121-pack.mjs --analyze <run dir>` | 11/11 EXIT 0 (A9, A10, A11 đều PASS) |
| Đối chứng âm | `t121-pack.mjs --negative` | EXIT 0 · 3 kiểu mutation · clean=0 mutated=1 |
| Tái lập bằng tệp đang nộp | `t121-pack.mjs --fresh (54 370 B)` lần 2 | 11/11 EXIT 0 · cùng sha/bytes/entries |
| Bản cài profile | `sha256 13 tệp trong agent-teams-pack18` | 13/13 SAME · isSymlink=false · 0.2.0-dev.0 |
| Sự kiện ghi ngoài tiến trình | `meta.json tableBefore/tableAfter/tableEnd + mtime` | lần 1 (02:08) drift=1 `f3abdf76…/213 689 B` → tự trả lại; lần 2 (02:10) drift=0, mtime không đổi |
| Hợp đồng trước khi giao audit | `check-contract --task t122` | PASS 6/6 EXIT 0 |

## Vòng 19 (phần 2) — bảng đo captain sau verdict t122

| # | Phép đo | Kết quả |
|---|---|---|
| 1 | `node tests/t114-source-freeze.mjs` | 16/16 EXIT 0 |
| 2 | `node tests/t115-check-contract.mjs` | 33/33 EXIT 0 |
| 3 | `node tests/t113-roster-assertion.mjs` | 38/38 EXIT 0 |
| 4 | `node tests/t107-removed-members-visible.mjs` | 12/12 EXIT 0 |
| 5 | `node tests/t99-render-parity.mjs` | 11/11 EXIT 0 |
| 6 | `node tests/t56*.mjs` | 20/20 EXIT 0 (kèm WARN thiếu `tsc` — đúng V19-F7) |
| 7 | `node tests/t98-render-coverage.mjs --strict` | EXIT 0 GREEN `fields=112 reached=105 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 payload_contract_failures=0 allow_listed=7` + 5 control `applies=true` |
| 8 | Tarball vòng 19 (đo `node:crypto` + `tar -tzf`) | `2770fbfc4070eb80…3cc6251e` / 2 248 092 B / 133 entry |
| 9 | `tools/sweep-suites.mjs --run` (báo cáo audit, captain không chạy lại) | PASS=49 · FAIL=1 (t118 A3) · LEGACY=8 · UNCLASSIFIED=0 · SKIPPED-LIVE=8 |
| 10 | `node tools/check-contract.mjs --task t123/t124/t125` | PASS 6/6 cả ba (EXIT 0) |
| 11 | `node tools/dependency-report.mjs` | tasks=125 realEdges=113 derivedEdges=138 waves=53 problems=0 |
| 12 | `node tools/check-logs.mjs` | logs=7 ok=7 fail=0 warnings=2 problems=0 newest_round=19 newest_task=125 |
| 13 | `node tools/check-doc-paths.mjs` | files=5 paths=103 paths_missing=0 links=41 links_missing=0 |

## Vòng 19 (phần 3) — bảng đo ba card đóng findings

| # | Phép đo (captain tự chạy) | Kết quả |
|---|---|---|
| 1 | t115-check-contract | 43/43 EXIT 0 |
| 2 | check-contract `--task t117` plain + `--pre` | EXIT 1 cả hai, đúng (f) nguyên văn |
| 3 | check-contract `--task t121 --pre` / `--pre --nope` | EXIT 0 `PRE-TERMINAL PASS` / EXIT 2 `unknown argument` |
| 4 | mutation captain `terminalBlocked=false` (−12 B) | 42/43, `# failed: k4` |
| 5 | mutation captain `const after = before` (−43 B) | t120 19/20, `FAIL a16` |
| 6 | mutation captain `else if (false)` (−38 B) | t98 `--strict` EXIT 2 `roster invariant … unguarded` |
| 7 | sweep repo thật (`--only t56 --strict`) | exit 3 + `warnings: 1 WARN line(s)` |
| 8 | `t118 --tgz-flip` | copy `16fcef59…` cùng độ dài, A2 fails / A4 passes, originalExit 0 |
| 9 | `t118 --analyze …/t121` | `sha256Now 2770fbfc…` · 2 248 092 B · 133 entry · 13/13 same |
| 10 | byte sản phẩm sau 3 card | `lib/tools.js e51734ba/213715` · `lib/state.js 56664c59/57508` · `package.json 92a64040/10498` — KHÔNG đổi |
| 11 | đường dẫn phát hành ổn định | `dist/vong-19/…tgz` = 2 248 092 B, sha `2770fbfc…` (copy, không pack lại) |
| 12 | `docs/TODO.md` | 125 hàng / 0 sai cột / VERIFIED=119 · CANCELLED=4 · SUPERSEDED=2 |

## Vòng 19 (phần 4) — mở t126/t127: kiểm chứng bộ byte PHÁT HÀNH (nửa còn lại của V19-F6)

Lý do mở: toàn bộ 19 vòng dogfood đều nạp plugin qua **symlink tới nguồn**, nên chưa lần nào chứng minh thứ thực sự giao cho người dùng — bản cài TỪ TARBALL — nạp được và hành xử đúng. Verdict audit chỉ nói 'bộ byte khớp nguồn', không nói 'bộ byte đó cài xong thì chạy'.

- **t126** (kiem-thu-goat, kind=repair, sourceTaskId t122, findings [V19-F6]): cài `dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz` (sha `2770fbfc…`, 2 248 092 B, 133 entry) vào profile MỚI `agent-teams-rel19`, đo 13 sha trong bản cài, boot thật trên bản copy `team.json` ERP, đối chứng âm trên bản sao, kiểm `packages/**` không đổi 1 byte. Trần ≤5 tệp · ≤40 lệnh · ≤4 boot · 3 lần thử. Cổng hợp đồng PASS 6/6; brief 3 217 B đã gửi (`delivered=wake`).
- **t127** (audit-goat, kind=review, reviewedTaskId t126, deps t126): tự cài ở profile KHÁC (`agent-teams-rel19-audit`), tự đo 13 sha, boot lại 1 lần, ≥3 mutation kiểu mới trên bản sao. Cổng hợp đồng PASS 6/6 **sau amend rev 1** — verify ban đầu trỏ `tests/t126-released-bytes-boot.mjs` (tệp do chính t126 tạo) nên cổng đúng khi FAIL (a); đã chuyển lệnh đó thành acceptance B0 kèm điều kiện thời điểm thay vì nới phép kiểm.
- Hồ sơ: `docs/TODO.md` 127 hàng/0 sai cột (`VERIFIED=119 · CANCELLED=4 · SUPERSEDED=2 · IN_PROGRESS=1 · OPEN=1`); provenance +2 cạnh ⇒ `tasks=127 realEdges=114 derivedEdges=140 waves=54 problems=0`.

## Vòng 19 (phần 5) — audit bộ byte phát hành kết thúc, dừng vòng lặp theo quyết định của người dùng

| # | Hoạt động | Kết quả |
|---|---|---|
| 1 | t126 (kiem-thu-goat) cài `dist/vong-19` vào profile mới `agent-teams-rel19` + 3 boot thật | PASS A1..A8, EXIT 0 |
| 2 | Captain chấm t126 + mutation tamper-artifact | `--analyze` trên bản copy bị sửa ⇒ EXIT 1 unproved A2 |
| 3 | t127 (audit-goat) cài độc lập vào `agent-teams-rel19-audit` + boot lại 1 lần | verdict pass, không high/blocker |
| 4 | 3 mutation kiểu mới của audit (junction / lock decoy cùng sha / xoá `.d.ts`) | cả 3 đỏ A1, phục hồi xanh |
| 5 | Captain đo lại 6 phép trước khi chấp nhận | 13/13 bản cài · 13/13 nguồn · ERP không đổi |
| 6 | Findings VB-F1..VB-F5 định tuyến | F1/F2 ghi giới hạn · F3 việc mở · F4/F5 ghi nhận |
| 7 | Chốt | dừng vòng lặp, không mở V20, giữ `0.2.0-dev.0`, không commit |

## Vòng 19 (phần 6) — công bố mã nguồn lên GitHub

| # | Việc | Kết quả |
|---|---|---|
| 1 | `git init -b unity` + `.gitignore` | 385 tệp staged, 10.8 MB; tệp lớn nhất là tarball phát hành 2 248 092 B |
| 2 | Loại khỏi repo | `node_modules`, `**/tests/tmp` (316 MB), `packages/dsh-agent-teams/build`, `packages/dsh-agent-teams/tmp`, `.agent-teams`, `.dsh-acl-recovery`, `docs/nghien-cuu/scratch` |
| 3 | Quét bí mật | 367 tệp văn bản, 0 khớp mẫu (`ghp_`, `github_pat_`, `sk-`, `xoxb-`, bot token, private key, AKIA, Bearer) |
| 4 | Commit | `b3dbebba7e82e4fb1616df6b00aff1ff5610364d` |
| 5 | Push | `origin/unity` cùng sha; `git ls-tree -r origin/unity` = 385 tệp; working tree clean |
| 6 | Kiểm lại bộ byte sau commit | `dist/vong-19/…tgz` sha `2770fbfc…` / 2 248 092 B — không đổi |

## Vòng 20 — bảng đo captain trước khi giao (2026-11-01)

| Phép đo | Kết quả |
|---|---|
| `lib/client/ActivityPanel.js` | 64 004 B · bố cục cũ ở dòng 392 (`ProgressOverview`, rồi IIFE members) và 437 (`AddMemberControl` → `DependencyMap` → `WorkspaceSummary`) |
| `lib/client.js` (bundle Host nạp) | 258 432 B / 3 217 dòng · `window.__ModuleLoader__.load({ id: '@nami/dsh-agent-teams', factory })` · anchor: ProgressOverview 175 575, orderDelegationMembers 175 654, AddMemberControl 181 760, DependencyMap 181 856 |
| `lib/client.js.map` | 19 sources, `sourcesContent[2]` = nguồn `ActivityPanel.js` khớp byte |
| Toolchain | ĐÍNH CHÍNH (sau t134): CÓ pipeline thật `build/build.mjs` (esbuild 0.28.2) — tái lập `lib/client.js` byte-identical `377bcea2…`/258 432. Dòng cũ ghi 'KHÔNG có' là SAI: `tsconfig*.json`/`scripts/clean-build.mjs` vắng mặt, nhưng build.mjs tự dựng wrapper + shift mappings |
| Pin hiện tại | `tests/t10-ui-bundle-smoke.mjs` sha `9da18d99…fec7007` / 258 432 B; `tests/t59-erp-live-copy.mjs` FROZEN 13 dòng |
| Roster | 5 member goat flash đều idle; 3 task chưa terminal: t51 failed, t66 pending, t93 pending |

## Vòng 21 — bảng đo captain khi chấm t134 (vá sourcemap)

| Phép đo | Kết quả |
| --- | --- |
| `lib/client.js.map` sau t134 | `5024364fefe8b73e…` / **404 958 B** (trước `1f1d15524bcd3caa…`, CÙNG số byte) |
| `lib/client.js` sau t134 | `377bcea2394cc0ac…` / 258 432 B — KHÔNG đổi (pin t10 giữ nguyên) |
| `lib/client/ActivityPanel.js` | `9596333059c68b80…` / 64 004 B — KHÔNG đổi |
| `lib/client.js.map` của `tests/tmp/t128/before/` | 50 segment trỏ nguồn dòng 391/392; bản MỚI 78 segment ⇒ mappings ĐÃ đổi, chỉ giải VLQ mới thấy |
| Giải VLQ ĐỘC LẬP của captain (script riêng `tests/tmp/cap134-scan3.cjs`) | dòng sinh 1919 (1-based) cột 2595 → nguồn `392:177`; cột 2744 → `392:327` ⇒ khớp lời khai của member |
| `tests/t128-panel-order.mjs` | EXIT 0 · **16/16** · `mappings sha256 75443a5f…` / 114 429 ký tự / 3 212 dòng sinh |
| `tests/t10-ui-bundle-smoke.mjs` | EXIT 0 · **50/50** (pin bundle không đổi) |
| `tests/t129-pins.mjs` | EXIT 0 · **13/13** |
| `tests/t120-sweep-suites.mjs` | EXIT 0 · **23/23** · 9 LEGACY (8 pack suite cũ + `t118-pack` từ V20-F3) |
| `tests/t98-render-coverage.mjs --strict` | EXIT 0 · GREEN `fields=112 reached=105 uncovered=0 nested_gaps=0 allow_listed=7` + 6 control `applies=true` |
| Mutation MỚI của captain (trên BẢN SAO `tests/tmp/t134cap`, không đụng cây nguồn) | (1) hoán vị `sources[0]`↔`sources[1]` ⇒ EXIT 1 **FAIL M2** 15/16; (2) một neo cột nguồn 177→179, mappings VẪN 114 429 ký tự ⇒ EXIT 1 **FAIL M4** đúng nguyên văn `DependencyMap 1919:2595 -> 392:177` |
## Vòng 21 (phần 2) — captain chấm t136 + công bố bộ byte

| Phép đo (captain tự chạy) | Kết quả |
|---|---|
| Giải nén CẢ HAI tarball (`dist/vong-20/…` và `tests/tmp/t135/run-t135-b/pack-a/…`) rồi so từng entry bằng `node:crypto` | 133 tệp · **1 tệp khác**: `lib/client.js.map` `1f1d15524bcd3caa:404958` → `5024364fefe8b73e:404958` |
| `docs/audit/closure-vong-21.md` / `docs/log/AUDIT.md` | 95 dòng / 396 dòng · 35 heading · có mục 'Audit closure vòng 21' |
| `tests/t128-panel-order.mjs` | EXIT 0 · **16/16** · `mappings sha256 75443a5f…` / 114 429 ký tự |
| `tests/t107-removed-members-visible.mjs` | EXIT 0 · **13/13** |
| `tests/t113-roster-assertion.mjs` | EXIT 0 · **38/38** |
| `tests/t114-source-freeze.mjs` | EXIT 0 · **16/16** |
| `tests/t115-check-contract.mjs` | EXIT 0 · **43/43** |
| `tests/t98-render-coverage.mjs --strict` | EXIT 0 · GREEN `uncovered=0 nested_gaps=0 payload_findings=0 allow_listed=7 roster_invariant_problems=0` + 6 control `applies=true` |
| `tools/sweep-suites.mjs --run` (chạy NỀN) | `PASS=54 FAIL=0 LEGACY=9 UNCLASSIFIED=0 skipped(live)=9 WARN=0 WARN_FIXTURE=1 DRIFT=0` · tool exit 0 |
| `tools/sweep-suites.mjs --list` | `totals: 72 suite(s) = 9 LIVE + 63 fast; legacy exceptions: 9` |
| `packages/dsh-agent-teams/tests/t130-pack.mjs` (plain) | EXIT 1 đúng như audit khai: `DIFF lib/client.js.map [frozen] applies=true shaApplies=false bytesFrozen=404958 bytesActual=404958` + `FAIL  A2 frozen table 13 rows re-measured at run time` |
| Công bố | `dist/vong-21/nami-dsh-agent-teams-0.2.0-dev.0.tgz` = COPY của artefact đã chấm, `copyIdentical=true`, sha `6db464d1…` / 2 248 091 B |
| Telegram | kỳ 43 = `docs/bao-cao-telegram/ky-43.md`, gửi thật `messageId 54` |

## Vòng 21 (phần 3) — captain chấm t137 (vá 4 finding low của vòng 21)

| Phép đo (captain tự chạy) | Kết quả |
|---|---|
| 6 tệp t137 nộp, hash+bytes | KHỚP 6/6: `tools/sweep-suites.mjs` `a9dcea1cbed3ef37…`/41 915 B · `tests/t120-sweep-suites.mjs` `3efe00bd168508c9…`/29 505 B · `t130-pack.mjs` `ba3d37d3c6b9d16b…`/68 372 B · `build/build.mjs` `8c03338cac36f616…`/3 814 B · `tests/t128-panel-order.mjs` `7dd02719d98bf8a5…`/25 237 B · `docs/kiem-thu/t120-sweep-suites.md` `1e11b58eded2f1e4…`/11 299 B |
| `tests/t120-sweep-suites.mjs` | EXIT 0 · **25/25** (a25 chạy THẬT `sweep --run --only t130-pack --json` ⇒ verdict=LEGACY, ran=false, citation `:395`) |
| `tools/sweep-suites.mjs --list` | EXIT 0 · **77 suite = 10 LIVE + 67 fast, legacy 12** (trước 72 / 9 LIVE / 9 legacy) |
| `tests/t128-panel-order.mjs` | EXIT 0 · **17/17**; ca **B3** chép `package.json` + `build/` + `lib/client` vào `tests/tmp/t128/build-copy`, chạy `node <copy>/build/build.mjs` từ GỐC REPO ⇒ bundle `377bcea2…`/258 432 + map `5024364f…`/404 958 TRÙNG BYTE bản ship |
| Hồi quy | t10 50/50 · t115 43/43 · t114 16/16 · t113 38/38 · t107 13/13 · `t98 --strict` GREEN `allow_listed=7 roster_invariant_problems=0` |
| 13 tệp đóng băng | **drift 0/13**; `dist/vong-21/…tgz` vẫn `6db464d1…`/2 248 091 B ⇒ verdict vòng 21 còn hiệu lực |
| Mutation RIÊNG của captain (A) | xoá `absWorkingDir: pkgDir,` trong `build/build.mjs` (−27 B) ⇒ t128 **16/17**, `FAIL B3 — …reproduces the shipped bundle AND the shipped map byte for byte…`; phục hồi `restored=true` `8c03338cac36f616` |
| Mutation RIÊNG của captain (B) | `fixture: demonstrated ? warn : [],` → `fixture: [],` (−22 B) trong `tools/sweep-suites.mjs` ⇒ t120 đỏ **a21 + a22**; phục hồi `restored=true` `a9dcea1cbed3ef37` |
| `tools/sweep-suites.mjs --run --timeout 180000` (chạy NỀN, captain tự chạy) | EXIT 0 · `summary: PASS=55 FAIL=0 LEGACY=12 UNCLASSIFIED=0 skipped(live)=10 WARN=0 WARN_FIXTURE=1 DRIFT=0` — khớp lời khai của member |
| `tests/tmp/t128/build-copy` | đã xoá; chạy lại t128 ⇒ ca B3 TỰ DỰNG lại ⇒ 17/17 (dọn được, không phụ thuộc artefact cũ) |

## Vòng 21 (phần 2) — bảng đo cài desktop + chạy thử

| Phép đo | Kết quả |
| --- | --- |
| Bản cài `desktop/node_modules/@nami/dsh-agent-teams` | 133 tệp, `0.2.0-dev.0`, `isSymlink=false` |
| 13 tệp đóng băng của bản cài | 13/13 khớp sha256 + bytes |
| So với profile đã audit `agent-teams-pack20` | 133/133 byte-identical, 0 khác |
| Boot `--profile desktop` | exit 1 sau 491 ms — `profile "desktop" is managed exclusively by the Electron application` |
| Boot `agent-teams-desk21` trên bản copy ERP | exit 0, 30 080 ms, 25 549 B JSONL, session `session-e29be463-8449-4da4-ab22-be43182dd0e6` |
| Render ERP | `Members (7 present + 7 removed):` · `Removed (7):` · `Tasks (107):` |
| Đổi route `qa-do-2` | audit `durable-only`, `routeOverride` bền vào `team.json`, ERP gốc không đổi (`9f7420b6a1af1f4e…` / 1 533 117 B) |
| `node tests/t18-hot-switch-e2e.mjs` | verdict FAIL 6/9 — chấm lại bằng tay: sản phẩm ĐÚNG, sáu ca trượt vì team bị archive |
| Transcript member `cdca2907-44ef-…` | 42 frame, 83 event, 13 step; notice seq 19; header seq 11 `kimi-k2.7-code` → seq 20 `deepseek-v4.1-flash` (high) |
