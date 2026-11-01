# Quy tắc dự án — bản viết lại plugin Agent Teams

Sinh ra từ MASTER TASK của người dùng (/agent-teams). Mọi thành viên phải đọc file này trước khi làm.

## 1. Vùng sở hữu (không giẫm file của nhau)
- nghien-cuu: docs/nghien-cuu/**
- kien-truc: docs/thiet-ke/**, docs/** (trừ các vùng của người khác)
- dev-runtime: packages/dsh-agent-teams/lib/members.js, lib/state.js, lib/types/members.d.ts, lib/types/state.d.ts
- dev-tools: packages/dsh-agent-teams/lib/tools.js, lib/tool-names.js, lib/index.js, lib/web-routes.js, lib/types/tools.d.ts
- dev-ui: packages/dsh-agent-teams/lib/client/**, lib/client.js, lib/locales.js, build/**, docs/client/**
- kiem-thu: tests/**, tools/test/**, docs/kiem-thu/**
- audit: chỉ đọc lib/**; ghi docs/audit/**
- Cấm sửa ngoài vùng. Cần sửa file của người khác thì báo captain, không tự sửa.

## 2. Giới hạn chung
- Số lần thử mỗi task: tối đa 3 (1 lần đầu + 2 lần làm lại). Hết 3 lần vẫn hỏng thì báo BLOCKED kèm bằng chứng.
- Cấm: git commit/push, publish npm, deploy, xoá dữ liệu, sửa E:\Project\ERP, đụng profile desktop khi đang kiểm thử.
- Chỉ dùng profile nháp cho kiểm thử; profile desktop chỉ để đọc bản gốc v0.1.28 làm tham chiếu.
- Không bao giờ ghi PASS/PASSED khi chưa chạy thật. Không có log hình thức.

## 3. Bảy nhóm log bắt buộc (docs/log/)
- BA.md — phân tích yêu cầu, phạm vi, quyết định nghiệp vụ.
- CHECK.md — checklist kiểm tra từng mốc, kèm bằng chứng.
- TEST.md — mỗi lần chạy test: lệnh, kết quả, PASS/FAIL/BLOCKED.
- BUG.md — lỗi phát hiện: mã BUG-n, mức độ, file:line, trạng thái.
- HANDLE.md — cách xử lý/khắc phục tạm, và cách xoá bỏ nó sau này.
- AUDIT.md — kết luận audit từng vòng, người audit khác người làm.
- ACTIVITY.md — nhật ký tuần tự: ai làm gì, lúc nào.

## 4. TODO
Trạng thái hợp lệ: OPEN, IN_PROGRESS, BLOCKED, REVIEW, FIXED, VERIFIED, DONE, CANCELLED. FIXED (đã sửa), VERIFIED (đã kiểm chứng) và DONE (đã xong, đã tích hợp) không được dùng thay nhau.

## 5. Nguồn sự thật
Trạng thái dự án nằm trong file, không nằm trong trí nhớ phiên: .agent-teams/nami-agent-teams/team.json, docs/ke-hoach-staged.md, docs/log/**, mã nguồn. Khi khôi phục phiên phải đọc lại các file này trước khi lập kế hoạch.

## 6. Báo cáo Telegram
- Kênh báo cáo riêng: **Agent teams report** — chat ID `-1004360988691` (type `channel`), bot **DSHERPbot** (`id 8834673623`) là admin có quyền đăng bài. Chat DM cũ `6704329834` chỉ là dự phòng.
- **Không tìm Telegram trong `mcp_connector_catalog`**: catalog MCP không có connector Telegram. Kết quả 0 ở đó không có nghĩa là không có kênh.
- Gửi báo cáo:
  - `node tools/telegram-report.mjs --text "Nội dung"`
  - `node tools/telegram-report.mjs --file <đường-dẫn>`
  - hoặc pipe qua stdin.
  - Báo cáo định kỳ thêm `--silent` để không đổ chuông; chỉ blocker/mốc lớn mới bật thông báo.
- Cấu hình mặc định nằm ở `tools/telegram-report.config.json` (chat `-1004360988691`). Thứ tự ưu tiên: tham số dòng lệnh > biến môi trường > file cấu hình > mặc định.
- Script đọc tokenRef `im_connect_telegram_erp_token` từ `~/.dsh/.credentials.yaml`, không in token, tự chia tin dài >4000 ký tự và thử lại 3 lần khi lỗi mạng.
- Nội dung theo cấu trúc mục 7.2 của MASTER TASK; gửi ở các mốc mục 7.1, không spam.
- Lỗi `fetch failed`: kiểm tra mạng rồi thử lại. Lỗi 400/401/403 là lỗi cấu hình, sửa cấu hình chứ không thử lại vô ích.

## Quy tắc hiển thị TODO (người dùng yêu cầu 2026-10-31T13:42:37.920Z)
- Master **luôn** hiển thị bảng TODO đầy đủ trong MỌI tin nhắn, kể cả tin ngắn, tin xác nhận, tin báo lỗi.
- Không được tự tắt, ẩn, thu gọn hay xoá danh sách todo; danh sách phải sống suốt dự án và chỉ đổi TRẠNG THÁI.
- Mỗi lần trạng thái đổi phải cập nhật đồng thời: `todo_write`, `docs/TODO.md`, và bảng trong tin nhắn Telegram.
- Cấm gộp nhiều task thành một dòng để rút gọn bảng.

## Bảng zone chốt sau D6 (design v1)
- dev-runtime-flash: lib/members.js, lib/scheduler.js, lib/state.js, lib/harness-compat.js, lib/snapshot.js, lib/events.js, lib/event-types.js, types/*.d.ts (trừ event-types.d.ts do chính member này khai báo).
- dev-tools-flash: lib/tools.js, lib/index.js.
- dev-ui: lib/client.js, lib/client/**, assets/** (chỉ sau khi t9 chứng minh dựng lại được bundle).
- audit-kimi: không sửa mã nguồn, chỉ ghi docs/log/AUDIT.md.

## Ghi log đổi route (thêm 2026-10-31T14:34:43.039Z)
- `docs/log/MODEL-SWITCH.md` là file MÁY ĐỌC do plugin ghi (bảng markdown, header cố định `lib/members.js:1010-1020`, dòng dữ liệu `:1049`). Cấm con người/agent viết văn xuôi vào file này.
- Ghi chú, ca kiểm, giải thích ⇒ `docs/log/MODEL-SWITCH-notes.md`.
- Lý do: append của plugin không biết cấu trúc văn xuôi, sẽ chèn dòng bảng vào giữa tài liệu.

## R-GRAPH — quan hệ phụ thuộc phải nhìn thấy được (bổ sung 2026-10-31T14:45:03.292Z)

Mọi task tạo mới phải truyền `dependencies`; quan hệ hồi tố ghi vào `docs/provenance-tasks.json`; trước mỗi báo cáo chạy `node tools/dependency-report.mjs` để sinh `docs/DEPENDENCIES.md` (mermaid + bảng sóng + kiểm tra chu trình/cạnh treo/cha chưa xong). Báo cáo chỉ hợp lệ khi bảng sóng khớp file vừa sinh, và phải hiển thị đủ: sóng, task, trạng thái, member, phụ thuộc thật, "sinh từ" (provenance). Chi tiết trong `docs/MASTER-PROMPT.md` mục 2.

## CHÍNH SÁCH MODEL (bắt buộc, cập nhật 2026-10-31T16:45:41.599Z)
- MỌI member phải chạy `command-code-goat/deepseek/deepseek-v4.1-flash`, `reasoningEffort: high`.
- CẤM dùng route khác cho member: `opencode-go/*` (429 hết hạn mức), `command-code-claude/*` (404), `deepseek-official/*` (QUOTA), `opencode-go/kimi-k2.7-code`, `deepseek-official/deepseek-v4-pro` — lý do: đốt token nhanh (chỉ thị người dùng).
- Ngoại lệ duy nhất: `reasoningEffort: max` cho task audit độc lập, và phải được ghi rõ trong brief của task đó.
- Khi thêm member mới: LUÔN truyền tường minh `provider` + `model` + `reasoning_effort`; không dựa vào default.
- Khi QoS provider chết: theo HANDLE-007 (thêm member route sống, KHÔNG dùng lại tên cũ, reassign task, chỉ remove khi hết task) — không đổi sang model đắt để 'chữa cháy'.
