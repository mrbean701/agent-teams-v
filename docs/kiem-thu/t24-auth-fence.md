# t24 — Auth fence + 405/413 của `/plugins/dsh-agent-teams/plan` (audit vòng 2, F3)

F3: t11 stub connection gate (`tests/t11-http-e2e.mjs:272` trả `undefined`) nên chưa từng đo nhánh từ chối. Tệp này đo đúng 3 nhánh chưa biết: **method fence**, **trần body**, **connection gate**.

Chạy: `node tests/t24-auth-fence.mjs` — **12 check / 0 FAIL, exit 0**; chạy 2 lần liền (`tests/tmp/e2e-t24auth/2026-10-31T17-01-21-622Z`, `...17-01-28-802Z`) cùng 12/12.

Thiết kế: mount plugin THẬT (`lib/index.js` `apply`) với ctx giả, phục vụ **handler thật** qua `node:http` `createServer` trên `127.0.0.1:0`, client là `node:http` request thật (socket thật) — không stub tầng HTTP. Gate tham số hoá 4 chế độ: `permissive` / `401` / `403` / `absent`.

| # | Tiêu chí | Kết quả | Bằng chứng nguyên văn |
|---|---|---|---|
| C1 | `GET /plan` → 405 | **PASS** | `HTTP 405 allow="POST" body=""` |
| C1b | `DELETE /plan` → 405 (không chỉ GET) | **PASS** | `HTTP 405 allow="POST" body=""` |
| C2 | body 1 000 096 B (> trần 1 000 000) → 413 | **PASS** | `HTTP 413 type="application/json; charset=utf-8" body="{\"error\":\"request body is too large\"}"` |
| C2b | body 900 049 B (dưới trần) được đọc, không bị cắt → 400 | **PASS** | `HTTP 400 body="{\"error\":\"sessionId, teamId, and action are required\"}"` ⇒ trần đúng là 1e6, không phải nhỏ hơn |
| C3 | gate permissive + session lạ → 409 (đi qua được fence vào handler) | **PASS** | `HTTP 409 body="{\"error\":\"captain session is not attached\"}"` |
| C4 | gate được hỏi đúng 1 lần/request | **PASS** | `gate calls: ["GET","DELETE","POST","POST","POST"] for 5 requests` |
| C5 | gate từ chối 401 | **PASS** | `HTTP 401 type="application/json; charset=utf-8" body="{\"error\":\"unauthorized\"}"` |
| C6 | fence chạy TRƯỚC method check: GET bị từ chối → 401, không phải 405 | **PASS** | `HTTP 401 body="{\"error\":\"unauthorized\"}"` |
| C7 | route đọc `/state` nằm sau cùng fence → 401 | **PASS** | `HTTP 401 body="{\"error\":\"unauthorized\"}"` |
| C8 | gate được hỏi cho cả 3 request bị từ chối | **PASS** | `["POST /plan","GET /plan","GET /state"]` |
| C9 | gate từ chối 403 | **PASS** | `HTTP 403 body="{\"error\":\"forbidden\"}"` |
| C10 | Connection chưa bind (`ctx.get('connection') === undefined`) → 503, không có mutation vô chủ | **PASS** | `HTTP 503 body="{\"error\":\"authentication unavailable\"}"` |

## Status theo 3 tiêu chí của task

- **405**: PASS — `lib/index.js:275-279` `res.writeHead(405, { allow: 'POST', 'cache-control': 'no-store' })`, body **rỗng có chủ ý** (`res.end()` không tham số), assert nguyên văn cả header `allow`.
- **413**: PASS — trần thật là `maxBytes = 1_000_000` mặc định của `readJsonRequest` (`lib/web-routes.js:9,36-37`); plugin KHÔNG truyền `maxBytes` nên trần = 1e6; vượt → 413 `request body is too large`, dưới → body được parse bình thường (C2b chứng minh biên).
- **Connection gate**: PASS — 401 → `{"error":"unauthorized"}`, 403 → `{"error":"forbidden"}`, thiếu service → 503 `{"error":"authentication unavailable"}`; mapping ở `lib/web-routes.js:71-79`, fence lắp ở `lib/index.js:186` nên phủ **mọi** route `/plugins/dsh-agent-teams/*`.

## Giới hạn thật (không tô hồng)

1. Gate ở đây là **hợp đồng** `connection.requestRejection(req)`; t24 không kiểm ruột Connection của host (token/cookie/CSRF) — nó kiểm plugin phản ứng đúng với từng status. Status khác 401/503 sẽ được echo nguyên số kèm body `forbidden` (`web-routes.js:77-78`), đúng như mã.
2. Không phủ TLS/origin/replay; `/plan` không tự kiểm CSRF, nó dựa hoàn toàn vào fence này.
3. Không sửa `lib/**`; không có đường dẫn tuyệt đối trong test (`grep -nE "'[A-Za-z]:[\\/]"` exit 1 = 0 match; grep rộng chỉ trúng `http://` ở dòng 205, không phải đường dẫn; `grep "Users/|/home/"` exit 1), tự định vị bằng `import.meta.url`.
4. Lượt 1 FAIL C4 do **test đếm sai** (5 request, assert 4) — đã sửa thành đếm động; lượt 2 và 3 PASS 12/12.
