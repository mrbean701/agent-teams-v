# DOG-04 — Cảnh báo "route khai báo của captain ngoài catalog" trên panel SỐNG (t74)

Đo trên instance fork `http://127.0.0.1:19488` (profile `agent-teams-gui`, junction tới `packages/dsh-agent-teams`), Host khởi động LẠI sau t74 để nạp bundle mới.

## 1. Chuẩn bị
- Host cũ (bundle trước t74) bị `job_kill`; khởi động lại: `dsh.cmd --profile agent-teams-gui --port 19488 --host 127.0.0.1 --no-open` → job `win-bash-2e8022c986dc423c`, token mới lấy từ stdout (không ghi vào tài liệu).
- Đăng nhập: `GET /?token=…` → 303 + cookie `dsh-auth-…`; sau đó `GET /` = 200.
- Mở workspace `Agent-Team` → session `Create GUI dogfood team fixture` (captain `session-28c28ee0-1efa-414d-a9ad-653cfe0abce1`, team `gui-dogfood` 3 member) → nút `View team` → panel `Team workspace`.

## 2. Kết quả đo (DOM thật, không suy đoán)
- Bấm `Add member` (ref 633) → form "Add one member manually" mở.
- Picker của form đọc: `Choose member model, currently DeepSeek-V4.1-Flash, reasoning effort High`; dòng phụ `Route: deepseek-official/deepseek-flash` ⇒ preselect lấy từ CATALOG, không phải route khai báo.
- Dòng cảnh báo (nguyên văn, locale en):
  - `The captain declares opencode-go/deepseek-v4.1-flash, which is not in the current catalog; a catalog model was chosen instead`
  - `Picked from the catalog automatically; change it if needed`
- Nghĩa là `captainRoute` đã xuống payload (snapshot đọc `captain.session.requestHeader()?.config` của session captain) và form dùng nó để so với catalog — đúng mục tiêu t74.
- Panel: 3 thẻ member (`alice` bị override `DeepSeek-V4-Pro` + nút `Restore declared route`; `bob` `declared`; `carolccaarrooll` `declared`), không có lỗi CSS.
- Mạng: 84 request, **0 mã 4xx/5xx**. Console: **1 entry** — `[deepseek-account] account read failed` (lỗi của Host về tài khoản, không liên quan plugin).

## 3. Giới hạn
- Chưa bấm submit trong form này (form đang mở, chưa gửi `add_member`) — lần submit thành công đã ghi ở DOG-03.
- Cảnh báo chỉ hiện khi route khai báo của captain KHÔNG có trong catalog; nếu captain khai route nằm trong catalog thì form preselect đúng route đó và KHÔNG có cảnh báo (nhánh này phủ bằng máy ở `tests/t74-captain-route-warning.mjs`, ca (a)).
