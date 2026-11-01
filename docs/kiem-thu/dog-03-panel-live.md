# DOG-03 — Tự kiểm panel trên phiên SỐNG (bằng browser, không nhờ người bấm)

Ngày: 2026-10-31 · Người chạy: captain · Instance: `http://127.0.0.1:19488` (profile `agent-teams-gui`, junction → `packages/dsh-agent-teams`, boot job `win-bash-79d3d0baeee84f3a`).

## 0. Cách dựng phiên có đội (không gõ composer)
`agent_teams_create` được gọi từ một phiên **headless** (profile `agent-teams-test`, prompt 1 tool call), tạo đội fixture `gui-dogfood`, captain `session-28c28ee0-1efa-414d-a9ad-653cfe0abce1`, 2 member `alice`/`bob`. Phiên này nằm trong store chung của workspace `E:/Project/Agent-Team` nên Host 19488 mở được từ danh sách session — **đúng điều kiện `captainSessionId === current session`** của `ActivityPanel.js:642-647`.

## 1. Panel render đúng CSS (sau t62 + t67)
| Bằng chứng | Số đo |
|---|---|
| Thẻ đội trong transcript | `gui-dogfood` · `2 members` · nút `View team` |
| Panel mở | heading `AgentTeams` / `Team workspace`, section `Members 2`, `Captain inbox` |
| Thẻ member | hộp **471×145** mỗi thẻ; avatar 40×40; `ROUTE` + control **232×38** |
| Control route (alice) | accessible name `Choose member model, currently deepseek-v4.1-flash, reasoning effort max` |
| Badge | `declared`; dòng phụ `opencode-go/deepseek-v4.1-flash (not in the current catalog)` |
| Vòng tiến độ | `0/0 completed`, ring 132×132 |
⇒ Không còn hiện tượng dính chữ / ảnh phóng to / hàng member không giãn cách của lần chụp trước.

## 2. Đổi route bằng UI thật
- Bấm control route → menu `Model` / `Reasoning effort` → chọn `DeepSeek-V4-Pro`.
- `POST /plugins/dsh-agent-teams/plan` → **200** (`@1793477717351`).
- Hàng alice đổi thành `DeepSeek-V4-Pro / High`, dòng `opencode-go/deepseek-v4.1-flash → deepseek-official/deepseek-v4-pro`, nhãn `Override from http`, badge **override**, hiện nút `Restore declared route`, toast `Route saved; the member uses it from the next step`.
- `team.json` (`sha256 fe10548b64257bb8`/2 595 B ở trạng thái cuối) ghi: `alice.routeOverride = { provider: "deepseek-official", model: "deepseek-v4-pro", reasoningEffort: "high", source: "http", at: 1793477620030, by: "web:session-28c28ee0-1efa-414d-a9ad-653cfe0abce1" }`.
- `docs/log/MODEL-SWITCH.md`: `| 2026-10-31T20:13:40.030Z | gui-dogfood | alice | opencode-go/deepseek-v4.1-flash (max) | deepseek-official/deepseek-v4-pro (high) | durable-only | http:web:session-28c28ee0-… |`.

## 3. Khôi phục route gốc bằng UI thật
- Bấm `Restore declared route` → `POST /plan` **200**; hàng alice về `deepseek-v4.1-flash / max`, badge **declared**, toast `Declared route restored; the next step uses it`.
- Audit: `| 2026-10-31T20:13:58.728Z | gui-dogfood | alice | deepseek-official/deepseek-v4-pro (high) | (cleared) | durable-only | http:web:session-28c28ee0-… |`.

## 4. Thêm member thủ công bằng UI thật
- Bấm `Add member` → form `Add one member manually` với `Member name`, `Role`, picker route, `Execution prompt`, `Tool policy id`; form **giữ giá trị gõ vào** (khác composer của Host — xem D2).
- Lần 1 để route mặc định (kế thừa route captain) → `POST /plan` **409**, toast `Add member failed: cannot use the member LLM route "opencode-go/deepseek-v4.1-flash"…` ⇒ **D1**.
- Lần 2 chọn model trong catalog hiện có (`DeepSeek-V4-Pro`) → picker hiện `currently DeepSeek-V4-Pro, reasoning effort High` → submit → `POST /plan` **200** (`@1793477778165`), toast `Member carolccaarrooll added`.
- Kết quả: thẻ đội `3 members`; `team.json.members` = `alice | researcher | opencode-go/deepseek-v4.1-flash | OVR deepseek-official/deepseek-v4-pro src=http`, `bob | engineer | declared`, `carolccaarrooll | reviewer | deepseek-official/deepseek-v4-pro | declared`.

## 5. Kết luận + khuyết điểm phát hiện
- **DOG-02 ĐẠT**: cả 2 control (đổi route + thêm member) render đúng CSS và chạy end-to-end qua `/plan`, ghi bền `team.json` + audit row; xác nhận bằng máy, không cần người bấm.
- **D1 (UX, mở t70)**: form thêm member mặc định "kế thừa route captain" ⇒ nếu route khai báo của captain không có trong catalog của Host thì trả 409 với thông điệp khó hiểu; nên mặc định chọn route có trong catalog (hoặc bắt buộc chọn) và nói rõ.
- **D2 (giới hạn automation, không phải lỗi sản phẩm)**: `browser_type` + `browser_press` cùng lúc làm ký tự bị nhân đôi (`carolccaarrooll` = "carol" + "ccaarrooll"); chỉ dùng `browser_type` cho input của form.
- **Giới hạn**: member fixture không được spawn (không có task) nên chưa chứng minh đường "áp route cho member ĐANG CHẠY" (đã có t45 cho đường đó); phiên fixture do headless tạo, không phải phiên người dùng gõ.
