# MASTER PROMPT — dự án viết lại plugin Agent Teams (@nami/dsh-agent-teams)

> Hiệu lực: đây là bản chuẩn của MASTER TASK. Mọi phiên mới PHẢI đọc file này TRƯỚC khi lập kế hoạch.
> Trạng thái dự án sống trong file workspace, KHÔNG trong trí nhớ hội thoại: `docs/TODO.md`, `docs/DEPENDENCIES.md`, `docs/log/*`, `packages/dsh-agent-teams`, `.agent-teams/nami-agent-teams/team.json`.
> Cập nhật lần cuối: 2026-10-31T14:45:03.292Z

## 0. Mục tiêu gốc (không được diễn giải lại)

1. Viết lại plugin **@nanmicoder/dsh-agent-teams** (bản ERP đang dùng, v0.1.28) thành bản riêng **@nami/dsh-agent-teams**.
2. Thêm tính năng **đổi model của member ĐANG CHẠY** (không remove+add, không mất attempt đang mở).
3. Thêm tính năng **thêm member thủ công** khi đội đang chạy (tool + HTTP + UI).
4. Giữ tương thích với đội `erp-erp` của dự án ERP (team.json cũ đọc được, không di trú dữ liệu).
5. Ưu tiên `opencode-go/deepseek-v4.1-flash` cho member để tối ưu chi phí; route đắt chỉ dùng khi thật cần.

## 1. Vòng lặp bắt buộc

ANALYZE → PLAN → SPAWN/DELEGATE → EXECUTE → CHECK → AUDIT → FIX → INTEGRATE → REPORT, lặp cho tới khi **MASTER TASK hoàn thành** hoặc người dùng dừng.
Không được dừng chỉ vì: vừa xong một task nhỏ, một member vừa xong, TODO tạm trống, build xanh, hay một vòng test sạch.

## 2. TODO và quan hệ phụ thuộc (R-GRAPH) — BẮT BUỘC

**R-GRAPH-1 · Mọi task phải khai báo cha.** Task tiếp nối tạo bằng `agent_teams_create_task` PHẢI truyền `dependencies` của task gốc. Không được để trống khi có quan hệ cha–con: DAG của đội là nguồn duy nhất mà scheduler và người dùng cùng thấy.

**R-GRAPH-2 · Khi không thể khai báo trong DAG thì phải khai báo bằng dữ liệu.** `agent_teams_edit_plan` từ chối sửa task đã start (`has already started and cannot be edited`), nên quan hệ hồi tố phải ghi vào `docs/provenance-tasks.json` với `from`, `to`, `kind` (rework | follow-up | proof | audit-closure) và `why` bằng chứng cụ thể.

**R-GRAPH-3 · Đồ thị phải được sinh tự động, không vẽ tay.** Trước MỌI báo cáo tiến độ: chạy `node tools/dependency-report.mjs` → cập nhật `docs/DEPENDENCIES.md` (mermaid + bảng theo sóng + kiểm tra hợp lệ). Báo cáo chỉ được coi là hợp lệ khi bảng sóng trong báo cáo khớp file vừa sinh.

**R-GRAPH-4 · Cách trình bày cho người dùng.** Trong mọi báo cáo phải có:
- (a) **bảng theo sóng**: cột Sóng | Task | Trạng thái | Member | Phụ thuộc thật | Sinh từ (provenance) — sắp xếp theo sóng tăng dần, cùng sóng thì theo id;
- (b) **đồ thị mermaid** của `docs/DEPENDENCIES.md` (cạnh thật liền nét, cạnh provenance nét đứt có nhãn lý do);
- (c) **không được** chỉ liệt kê phẳng danh sách task, và không được ẩn dòng nào;
- (d) nói rõ task nào đang chặn task nào nếu có task đang chờ.

**R-GRAPH-5 · Kiểm tra hợp lệ là tự động, không phải tự tin.** Script phải báo: chu trình, cạnh trỏ tới task không tồn tại, và task đã `completed` nhưng cha chưa `completed`. Nếu báo lỗi thì phải xử lý hoặc nêu rõ trong báo cáo với mã lỗi tương ứng.

**R-GRAPH-6 · TODO luôn hiển thị.** Mọi tin nhắn của master phải hiển thị TODO đầy đủ (đủ dòng, đủ trạng thái), cấm ẩn hay gộp dòng. Trạng thái hợp lệ: OPEN / IN_PROGRESS / BLOCKED / REVIEW / FIXED / VERIFIED / DONE / CANCELLED — FIXED, VERIFIED, DONE không được dùng thay nhau.

## 3. Kiểm chứng (chống fake-success)

- Không PASS nếu không chạy thật. Không nhận "test đã pass" mà không có lệnh + exit code + đường dẫn artifact.
- Bằng chứng phải **tái lập được**: test nằm trong `tests/`, không có đường dẫn tuyệt đối, và phải **fail** nếu tính năng bị gỡ (mutation test). Đã từng phát hiện case PASS giả vì test tự nhận `spawned` sai — xem `docs/log/CHECK.md`.
- Reviewer **khác** implementer. Sửa lỗi audit xong phải có người khác xác nhận đóng (t19 là ví dụ chuẩn).
- Mọi tuyên bố phải gắn file:dòng. Không tin báo cáo của member khi chưa tự chạy lại lệnh rẻ nhất.

## 4. Log (11 nhóm)

`docs/log/`: BA, CHECK, TEST, BUG, HANDLE, AUDIT, ACTIVITY, MEMBER, MODEL-SWITCH, ROUTING, SKILL-EXECUTION.
`docs/log/MODEL-SWITCH.md` là **file máy đọc** (header + dòng bảng do `appendRouteChangeAudit` ghi) — văn xuôi, dẫn giải, bằng chứng đi vào `MODEL-SWITCH-notes.md`.

## 5. Báo cáo

- Telegram qua `node tools/telegram-report.mjs --file <file> [--silent]` (chat -1004360988691), mẫu 6 mục trong `docs/mau-bao-cao-telegram.md`.
- Báo cáo định kỳ dùng `--silent`; báo cáo mốc quan trọng thì không.
- Không báo "đã gửi" khi lệnh trả lỗi; không đưa secret vào báo cáo.

## 6. An toàn và phạm vi

- Không commit/push/publish/deploy production khi chưa được phép.
- Không sửa `E:\Project\ERP` và không sửa profile desktop `C:\Users\thang\.dsh\profiles\desktop` (đó là môi trường người dùng đang chạy).
- Không xoá dữ liệu; trước thay đổi lớn phải nêu rủi ro + đường lùi.
- Không giấu bug/blocker; mỗi bug một mã BUG-nnn trong `docs/log/BUG.md` kèm cách xử lý.

## 7. Điều kiện hoàn thành MASTER TASK

Chỉ tuyên bố xong khi ĐỦ: (1) đủ 5 mục tiêu gốc; (2) `@nami/dsh-agent-teams` cài và chạy được trong profile nháp; (3) đổi route member đang chạy chứng minh bằng E2E thật; (4) thêm member thủ công chạy được cả tool, HTTP và UI; (5) ERP-compat kiểm bằng team.json cũ; (6) toàn bộ test xanh, không case skip; (7) audit vòng cuối ĐẠT và findings đã đóng; (8) `docs/DEPENDENCIES.md` khớp thực tế, không lỗi hợp lệ; (9) TODO khớp thực tế 100%; (10) log đầy đủ 11 nhóm; (11) báo cáo Telegram tổng kết đã gửi thật.

## 8. Cấm

Cấm tuyên bố hoàn thành dựa trên báo cáo member mà không tự kiểm; cấm sửa test cho khớp hành vi sai; cấm vá tay `team.json` để né tool; cấm bỏ trống `dependencies` rồi giải thích bằng văn xuôi; cấm tạo goal tự động ngoài yêu cầu người dùng; cấm churn member (remove+add) để đổi route khi đã có tool.
