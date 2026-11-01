# HANDLE — xử lý tạm và cách xoá bỏ

| Mã | Xử lý tạm | Vì sao chưa bỏ được | Điều kiện xoá bỏ |
|---|---|---|---|
| HANDLE-001 | Quy trình tay 6 bước trong E:\Project\ERP\tools\session\chan-doan-doi-model.ps1 để đổi model khi đội đang chạy | Bản v0.1.28 khoá route 4 lớp, không có API đổi runtime | Khi bản mới có set_member_route chạy được E2E (nhiệm vụ t11) |
| HANDLE-002 | Team.json của ERP có 7 member 'removed' + 7 member '-2' thay thế | Hệ quả của HANDLE-001 | Sau khi bản mới ổn định, viết hướng dẫn gộp (nhiệm vụ t13) |
| HANDLE-003 | Đội staged chưa được duyệt nên chưa spawn được member; trong lúc chờ, captain làm phần tích hợp không thuộc vùng của member (nhân bản gói, ghi chứng tích, log) | Quyền duyệt kế hoạch thuộc người dùng, phải duyệt bằng lượt riêng trên Web hoặc bằng lệnh rõ ràng | Khi người dùng duyệt trên Web hoặc trả lời cho phép captain duyệt |
| HANDLE-004 | Báo cáo Telegram dùng bot DSHERPbot của plugin dsh-im-connect qua `tools/telegram-report.mjs`; đích mặc định là kênh riêng **Agent teams report** (`-1004360988691`), DM `6704329834` chỉ dự phòng. Không tra MCP catalog để tìm Telegram. | Catalog MCP không có connector Telegram (đúng thiết kế); kênh thật là im-connect, tách khỏi MCP. Script là cầu nối tạm. | Khi bản `@nami/dsh-agent-teams` có kênh báo cáo tích hợp, hoặc có MCP connector Telegram chính thức |
| HANDLE-005 | `rg` không truy cập được trong `app.asar` (`IO error ... os error 3`), dù `fs` của Node đọc bình thường | asar là archive, Electron patch `fs` chứ ripgrep thì không | Khi kiểm tra source host phải dùng `fs.readdirSync` + `readFileSync` như CHECK.md 2026-10-31T13:32:57.026Z |
| HANDLE-004 (ĐÃ GIẢI QUYẾT 2026-10-31T13:41:20.089Z) | Trước đó kết luận sai "không có kênh Telegram" vì chỉ tra MCP connector | Kênh thật là chat -1004360988691 qua `tools/telegram-report.mjs` + token `im_connect_telegram_erp_token`, KHÔNG phải MCP connector | Dùng script; bằng chứng gửi: messageId=5 |
| 2026-10-31T14:40:18.706Z | HANDLE-006 | Phiên LLM lạnh KHÔNG thấy đội (`agent_teams_status` báo không thuộc team) | Đã xác nhận ở t18 | Mọi kiểm chứng 'sau cold start' phải đọc team.json qua `readTeam`, không tạo phiên mới rồi hỏi tool |

## 2026-10-31T16:17:29.340Z — HANDLE-007: playbook khi provider chết giữa chừng
- Dấu hiệu: member failed với `code QUOTA` / `404` / `Insufficient Balance`; master tự đổi model (notice `[model changed: ...]`).
- Bước 1: `agent_teams_status` xác định member nào chết, task nào `failed`.
- Bước 2: `agent_teams_add_member` tạo member mới trên route còn sống (đã kiểm bằng `automation_list`), KHÔNG dùng lại tên member cũ (bị chặn `has already been used`).
- Bước 3: `agent_teams_reassign_task` chuyển task sang member mới; ghi BUG log kèm mã lỗi nguyên văn.
- Bước 4: chỉ `remove_member` khi member cũ không còn task; nếu trần member (8) chạm, gỡ trước khi thêm.
- Bước 5: nếu master cũng đổi model, ghi nhận trong CHECK log vì hành vi có thể khác.

## 2026-10-31T17:11:22.018Z — HOUSEKEEP: xoá `build/spike-dsh.pid`
- Tệp rác còn lại từ spike cũ (mtime 2026-10-31 20:42, cũ hơn `build/build.mjs` 00:05; `grep -rn 'spike-dsh'` toàn workspace = 0 tham chiếu) — không phải sản phẩm của t23.

## 2026-10-31T17:17:11.578Z — N3/N4 sau audit closure
- N3: `packages/dsh-agent-teams/pnpm-workspace.yaml` bị pnpm ghi placeholder `esbuild: set this to true or false` (không phải YAML hợp lệ) ⇒ khôi phục nguyên bản từ `C:\\Users\\thang\\.dsh\\profiles\\desktop\\node_modules\\@nanmicoder\\dsh-agent-teams`; sha256 khớp nguồn = true.
- N4: `packages/PROVENANCE-v0.1.28.json` thêm khoá `addedInFork` liệt kê 7 tệp mới (MemberControls.js, 3 .module.css, build/build.mjs, css-module-plugin.mjs, test-load.html) để audit C5 không coi là 'tệp lạ'.

## 2026-10-31T17:28:15.812Z — HANDLE: so khớp output `tar -tzf` trên Windows phải strip CR
- Lần kiểm t29 đầu tiên của captain báo "6/6 MISSING" trong khi tarball đủ tệp: `tar -tzf ... > list.txt` ghi ra **CRLF**, nên `L.includes('package/lib/tools.js')` trượt. Sửa bằng `.map(s=>s.replace(/\r$/,''))` → 6/6 OK.
- Bài học: mọi so khớp chuỗi với output công cụ shell trên Windows phải strip `\r` trước; nếu không sẽ tự tạo ra FAIL giả rồi kết luận sai về member.
## 2026-10-31T17:38:08.000Z — HANDLE-008: rollback offline theo số đo thật của t27
- Bối cảnh: t27 đã chạy THẬT rollback `0.2.0-dev.0 → 0.1.28 → 0.2.0-dev.0` trong profile nháp `agent-teams-test` (3 lần boot thật, 16/16 check PASS, `docs/kiem-thu/t27-rollback.md`) và phát hiện mục 5 của `docs/van-hanh/di-migrate-va-rollback.md` SAI cả 3 bước + THIẾU 3 bước.
- SAI 1: `dsh plugin --profile <p> remove|add …` là **pnpm passthrough** (`--help`: forwarding the remaining arguments to pnpm in the profile directory) ⇒ `remove` gỡ **cả bản ghi dependency** chứ không chỉ bỏ symlink, `add` **cần registry npm**. Rollback offline phải làm ở mức TỆP: (1) rm symlink `node_modules/@nami/dsh-agent-teams` (đo được: xoá link KHÔNG xoá mã fork); (2) `fs.cpSync` bản 0.1.28 từ `profiles/desktop/node_modules/@nanmicoder/dsh-agent-teams`; (3) sửa manifest profile (`dependencies` + `dsh.profile.bundles`).
- SAI 2: thiếu cảnh báo `cordis.patch.yml` của 0.1.28 mang `name: '@nanmicoder/dsh-agent-teams'` — để `@nami/…` thì plugin không nạp; kiểm bằng `--dump-config` (không tốn quota).
- SAI 3: 'mở phiên MỚI rồi kiểm `agent_teams_status` chạy' là SAI — phiên mới không phải captain nên tool trả `Error: you do not lead or belong to any active team yet` ở **cả** 0.1.28 lẫn 0.2.0-dev.0 (đo giống nhau từng chữ). Cách kiểm đúng: `agent_teams_create` với đúng tên đội cũ PHẢI bị từ chối `team id "…" is taken by another captain`, kèm `sha256(team.json)` trước = sau.
- THIẾU khác: Windows `fs.symlinkSync(…, 'dir')` → `EPERM`, phải dùng `'junction'`.
- Đã sửa tài liệu: §5 thành 5.1 (bảng 4 bước, mỗi bước có cột 'kiểm bằng gì'), 5.2 (bốn cạm bẫy đã đo), 5.3 (`team.json` tương thích ngược: 0.1.28 đọc được file 0.2.0 ghi có `routeOverride`, sha256 `20f5c16689f8e38e` trước = sau); §7 gạch câu 'hồi quy ngược — chưa chạy' → ĐÃ CHẠY và ĐẠT, còn treo 3 nhánh (tarball, nhiều profile, chiều 0.1.28 → 0.2.0).
- Cổng tài liệu sau khi sửa: `node tools/check-doc-paths.mjs --summary` → `files=4 paths=46 paths_missing=0 links=40 links_missing=0`, EXIT 0 (trước t32: 44/39).
- CÒN TREO ngoài phạm vi t32: con số dán trong `docs/bao-cao-agent-teams.md` §4.5 và ảnh chụp `docs/van-hanh/kiem-tra-duong-dan.md` vẫn là 44/39 của t25 ⇒ cần chạy `node tools/check-doc-paths.mjs --write` và sửa 1 dòng trong báo cáo cho khớp 46/40.

## 2026-10-31T17:42:58.000Z — HANDLE-008 (ĐÃ SỬA, t33): ảnh chụp cổng đường dẫn + mục 4.5 báo cáo
- TRƯỚC (sau t32): §4.5 của `docs/bao-cao-agent-teams.md` và ảnh chụp `docs/van-hanh/kiem-tra-duong-dan.md` vẫn ghi số của t25 (`paths=44 links=39`) trong khi cổng thật lúc đó là 46/40 — đúng phần 'còn treo' mà HANDLE-008 trước đã báo.
- NAY (t33): chạy `node tools/check-doc-paths.mjs --write` → ảnh chụp mới 100 dòng; số thật sau khi thêm bằng chứng t24 là **paths=47 links=40 paths_missing=0 links_missing=0, EXIT 0**; §4.5 đã cập nhật đúng 47/40 (cả câu 'Bảng đầy đủ …' và khối `--summary`).
- Cùng lượt: §7 `docs/van-hanh/di-migrate-va-rollback.md` hết câu sai 'Auth fence của /plan: không có test cho 401 và 405/413' — t24 (`tests/t24-auth-fence.mjs` 12/12) đã phủ 401/403/503/409/405 (body rỗng) /413 ở biên 1 000 000 B và fence chạy TRƯỚC method check; phần CHƯA phủ nay ghi đúng là ruột Connection của host (token/cookie/CSRF), TLS, origin, replay.

### HANDLE-009 — Dọn rác repo root (từ F6 của audit vòng 3) + lưu trữ báo cáo v0.1.28
- Đã xoá: `%SystemDrive%/` (3 tệp/987 712 B — cây thư mục rác do một script nội suy biến môi trường không đúng), symlink hỏng `ProjectAgent-Team.dsh-testprofilesagent-teams-testnode_modules` (đích không tồn tại), `.audit-t12/` (6 tệp/12 167 B), `.dsh-test/` (116 421 tệp/1 836 729 659 B ≈ 1,8 GB — DSH home nháp của các lần test cũ).
- Kiểm trước khi xoá: `grep -rl "\\.dsh-test\\b" tools tests docs` → 0 tệp mã tham chiếu; các tài liệu chỉ NHẮC tên trong biên bản audit nên không ảnh hưởng.
- Báo cáo phân tích plugin gốc (312 dòng, v0.1.28) chuyển `bao-cao-agent-teams.md` (root) → `docs/bao-cao-plugin-v0.1.28.md`, và thêm một dòng trỏ tới trong mục 6 của `docs/bao-cao-agent-teams.md` để người đọc không lạc giữa hai báo cáo.

- **HANDLE-010 — automation không gõ được vào composer của Web GUI**: `browser_type` + `browser_press` trên `div[role=textbox].GRgSLq_input` đều vô hiệu (click hoạt động). Hệ quả: không thể tạo session/điền form bằng automation trong phiên này ⇒ mọi test cần "bấm form" phải do người làm hoặc phải có API. Ghi tại `docs/kiem-thu/gui-phien-song.md` §8.

### HANDLE-011 — Mẫu brief của captain trỏ sai thư mục test (SỬA TỪ NAY)

Hai member độc lập (dev-ui-goat ở t46, và trước đó một phần ở t39) phải tự sửa đường dẫn vì brief của captain ghi `packages/dsh-agent-teams/tests/*.mjs`, trong khi **gói `packages/dsh-agent-teams` KHÔNG có thư mục `tests/` chứa suite dự án** — mọi suite (`t3`,`t4`,`t10`,`t24`,`t37`,`t38`,`t39`,`t43`,`t46`…) nằm ở `E:/Project/Agent-Team/tests/`.

Riêng `packages/dsh-agent-teams/tests/` chỉ chứa `tmp/` (artifact tạm của các lần pack/boot).

Quy tắc từ nay khi viết `inScope`/`deliverables` cho task có test: `tests/<ten>.mjs` (gốc repo). Chỉ dùng `packages/dsh-agent-teams/tests/tmp/**` cho artifact.

Hệ quả đã thấy: `changedPaths` của member không khai được tệp test thật (vì ngoài literal inScope) ⇒ hồ sơ phải đọc thêm phần chữ trong báo cáo, không chỉ `changedPaths`.
