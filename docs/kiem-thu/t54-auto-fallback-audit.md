# t54 — audit cho lần member TỰ TỤT fallback (C6 của t51)

## Cơ chế
`agent/request-error` của member thấy lỗi provider ⇒ `selectFallbackRoute` quyết định retry ⇒
nay ghi bền team.json **rồi** append 1 row vào `docs/log/MODEL-SWITCH.md` (cùng hàm audit mà
đường captain `set_member_route` dùng) ⇒ captain/panel đọc lại được, KHÔNG cần session event
(harness bỏ mọi event `agent-teams/*`, `lib/events.js:26-47`).

## Chỗ sửa (packages/dsh-agent-teams/lib/members.js)
| dòng | nội dung |
| --- | --- |
| 121 | `isFallbackFailureCode(code, message)` — 5 mã cũ giữ nguyên; `INVALID_REQUEST` chỉ tính khi message khớp `Model is unavailable\|model_not_found\|does not exist\|no such model` |
| 129 | `selectFallbackRoute(..., failureMessage)` — truyền message xuống luật trên |
| 366 | `updateFallbackState(...)` — bỏ tham số `ctx` chết (`void ctx;`), trả `true/false` để chỉ audit cái đã ghi thật |
| 389 | `recordAutoFallback(ctx, request)` — ghi bền TRƯỚC, audit SAU, audit lỗi chỉ `logger.warn` |
| 804-829 | handler chụp `current` (route vừa chết) TRƯỚC khi gán `selectionRef.current`, truyền `payload.failure.message`, gọi `recordAutoFallback` với `by: child.id`, rồi mới `return { kind: 'retry' }` |

## Đọc vết lỗi
`<workspace>/docs/log/MODEL-SWITCH.md`, cột `source` = `auto:<child session id>` là lần tự tụt:

```
| 2026-10-31T18:59:07.382Z | e2e-t51fallback | worker-a | cline/moonshotai/kimi-k3 | command-code-goat/deepseek/deepseek-v4.1-flash | live-and-durable | auto:1fc32613-95e2-48bc-b87e-0dde3a387a9a |
```

team.json giữ spine `provider/model` (`cline/moonshotai/kimi-k3`) + `fallbackActive=true`,
`activeProvider/activeModel` = route đang chạy.

## Sai lệch so với brief (đã báo captain)
Brief yêu cầu `applied: 'auto-fallback'`, nhưng t51 C6 (không được sửa) assert đúng
`applied === 'live-and-durable'`, và lần tụt này thật sự live (request lỗi được retry trên route
mới, mọi step sau chạy trên đó). Chọn `live-and-durable` + giữ provenance ở cột source `auto:`.

## Kiểm chứng (exit code thật)
- `node tests/t54-auto-fallback-audit.mjs` → `# 14/14 passed, 0 failed` EXIT=0.
- `node tests/t51-fallback-live-e2e.mjs` → `verdict PASS - proved C1..C6` EXIT=0 (profile nháp
  `agent-teams-test`, captain session `session-4b73a579-c0c2-4e99-ad39-41be4856e829`, 41.3 s);
  `--analyze tests/tmp/e2e-t51fallback/2026-10-31T18-58-54-196Z` → PASS C1..C6 EXIT=0.
- Hồi quy: t38 17/17 · t37 14/14 · t43 19/19 · t46 15/15 · t3 18/18 · t20 15/15 · `node --check` OK.
- Mutation tự làm: đổi `applied` về `'auto-fallback'` ⇒ `# 12/14 passed, 2 failed` (a1, a3) EXIT=1;
  khôi phục ⇒ sha256 `1562be4d…e1009` / 99 402 B identical, 14/14 lại.

## Giới hạn còn lại
- Không sửa `lib/types/members.d.ts` (ngoài phạm vi t54): khai báo vẫn là
  `isFallbackFailureCode(code: string)` / `selectFallbackRoute` 4 tham số ⇒ lệch với JS (không
  consumer TS nào trong repo gọi 2 tham số nên chưa vỡ).
- Row chỉ chứng minh "đã tụt", không nói member có hồi phục về route gốc hay không.
- Audit vẫn best-effort: nếu thư mục không ghi được thì mất row (team.json vẫn đúng, đã có case a6).
