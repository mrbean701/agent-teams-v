# Báo cáo Telegram — runbook

## Kênh thật
- Kênh báo cáo chính: **Agent teams report** — chat ID `-1004360988691` (type `channel`).
- Bot: **DSHERPbot** (`id 8834673623`), do plugin `@michengai/dsh-im-connect` quản lý; bot là admin có quyền **Post Messages**.
- Chat DM cũ: `6704329834` — chỉ dùng dự phòng.
- Token: khóa `im_connect_telegram_erp_token` trong `C:\Users\thang\.dsh\.credentials.yaml`.
- Đây **không phải** MCP connector. `mcp_connector_catalog` không có Telegram; đừng dùng nó để kết luận "không có kênh".

## Cấu hình mặc định
File `tools/telegram-report.config.json`:

```json
{
  "chat": "-1004360988691",
  "tokenRef": "im_connect_telegram_erp_token"
}
```

Thứ tự ưu tiên: tham số dòng lệnh > biến môi trường (`DSH_TELEGRAM_CHAT_ID`, `DSH_TELEGRAM_TOKEN_REF`) > file cấu hình > mặc định trong script.

## Gửi báo cáo
```powershell
# Báo cáo định kỳ — không đổ chuông
node tools/telegram-report.mjs --silent --text "[AGENT-TEAMS PROJECT REPORT] ..."

# Nội dung dài (khuyến nghị): soạn file rồi gửi
node tools/telegram-report.mjs --file docs/bao-cao-ky-1.md

# Blocker/mốc lớn — bật thông báo
node tools/telegram-report.mjs --file docs/bao-cao-blocker.md

# Pipe
Get-Content docs/bao-cao-ky-1.md -Raw | node tools/telegram-report.mjs
```

Tùy chọn hữu ích:
- `--chat <id>` — đổi chat đích (mặc định lấy từ config).
- `--token-ref <tên>` — đổi khóa token trong credentials.
- `--parse-mode HTML` — gửi HTML (mặc định plain text).
- `--silent` — gửi không thông báo (dùng cho báo cáo định kỳ).
- `--dry-run` — in payload, không gửi.
- `--timeout 25`, `--retries 3` — timeout mỗi lần và số lần thử lại.

Kết quả thành công:
```json
{"ok":true,"chatId":"-1004360988691","messageId":4,"parts":1}
```

## Xử lý lỗi
| Lỗi | Nghĩa | Cách xử lý |
|---|---|---|
| `fetch failed` | Mạng tới `api.telegram.org` chập chờn (từng thấy trong gateway.log) | Thử lại; kiểm tra DNS/TCP 443. Script đã tự retry 3 lần |
| `400 Bad Request: message text is empty` | Body rỗng/encoding sai | Dùng `--file` hoặc pipe stdin; không nhồi JSON qua dòng lệnh PowerShell |
| `400 Bad Request: chat not found` | Sai chat ID / bot chưa vào kênh | Kiểm tra ID `-100...`; thêm bot làm admin kênh |
| `401 Unauthorized` | Token sai/hết hiệu lực | Kiểm tra `im_connect_telegram_erp_token` |
| `403 Forbidden: bot is not a member` | Bot chưa được thêm vào kênh | Thêm `@DSHERPbot` làm admin, bật Post Messages |
| `429 Too Many Requests` | Gửi quá nhanh | Chờ theo `retry_after`; script tự retry |

## Bằng chứng đã kiểm chứng
- 2026-10-31T13:37Z: `getChat` kênh `-1004360988691` trả `ok:true`, `type=channel`, title `Agent teams report`; gửi thử `message_id=3`.
- 2026-10-31T13:38Z: script đọc config và gửi qua kênh mới thành công, `messageId=4`.
- 2026-10-31T13:24Z: gửi end-to-end qua DM cũ thành công, `messageId=497` (dự phòng).
- Bot API `getMe` trả `ok:true` cho `DSHERPbot`; `getWebhookInfo` không có webhook, `pending_update_count=0`.
- Gateway log chỉ có lỗi polling gián đoạn `fetch failed`, không có lỗi token.

## Bằng chứng do phiên captain ghi lại
- 2026-10-31T13:41:20.089Z: gửi kỳ 1 qua script → `{"ok":true,"chatId":"-1004360988691","messageId":5,"parts":1}` (lệnh `node tools/telegram-report.mjs --file docs/bao-cao-telegram/ky-01.md --silent`, exit 0, node v26.7.0).
