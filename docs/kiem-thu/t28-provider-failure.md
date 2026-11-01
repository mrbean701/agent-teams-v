# t28 — Vết lỗi provider bền (NFR-KHANG-LOI-PROVIDER-01)

Ba lần provider chết (opencode-go 429 `GoUsageLimitError`, deepseek-official `Insufficient
Balance (QUOTA)`, command-code-claude `404 PI_AI_ERROR`) trước đây chỉ để lại một member im
lặng. Nay mỗi lần như vậy ghi bền `lastFailure` vào `team.json` và đưa ra snapshot, KHÔNG tự
spawn thay thế.

## Cơ chế

1. `childCtx.on('agent/error')` (members.js:691) → `failMemberOpenAttempt` (:263).
2. Trong team lock, `providerFailureRecord` (gọi tại :296) quyết định lỗi này có phải lỗi
   provider không; nếu có thì gán `member.lastFailure`.
3. Cùng một lần ghi bền: `if (disposition === 'failed_attempt' || lastFailure !== undefined)`
   (:310) → `writeTeam`. Vết lỗi và attempt hỏng không bao giờ lệch nhau.
4. Lần spawn thành công kế tiếp xoá vết cũ (:976), nên `idle + lastFailure` = member có route
   chết dưới chân nó, không phải member vừa làm xong việc.

## Chỗ sửa

| Tệp | Dòng | Nội dung |
| --- | --- | --- |
| `lib/members.js` | 120–143 | `PROVIDER_FAILURE_MARKERS` + `isProviderFailure()` |
| `lib/members.js` | 129–168 | `MEMBER_FAILURE_MESSAGE_MAX = 300` + `providerFailureRecord()` (route lấy từ `routeOf`) |
| `lib/members.js` | 296–311 | ghi vết trong `failMemberOpenAttempt`, mở rộng điều kiện `writeTeam` |
| `lib/members.js` | 973–976 | xoá `lastFailure` khi spawn thành công |
| `lib/state.js` | 672–680 | `isTeamMember` chấp nhận trường tuỳ chọn, từ chối sai kiểu |
| `lib/snapshot.js` | 96–106 | đưa `lastFailure` ra DTO member của panel |
| `lib/types/types.d.ts` | 283, 289 | `TeamMember.lastFailure` + `TeamMemberLastFailure` |
| `lib/types/members.d.ts` | 226–247 | khai báo hai export mới |
| `lib/types/snapshot.d.ts` | 34 | `TeamActivityMember.lastFailure` |

## Cách đọc vết lỗi

- Bền: `<state>/<teamId>/team.json` → `members[].lastFailure = { code, message (≤300), at, provider, model }`.
- Panel: `assembleTeamSnapshot(...).members[].lastFailure` (cạnh `nextRoute`/`routeOrigin`).
- `agent_teams_status`: CHƯA thấy — DTO của tool dựng riêng tại `lib/tools.js:2204-2235` (không
  dùng snapshot); cần owner thêm một dòng, nằm ngoài phạm vi t28.
- Không ghi `docs/log/MODEL-SWITCH.md`: bảng đó là route CHANGE, lỗi provider không đổi route.

## Giới hạn còn lại

- Marker so khớp chuỗi: `\b404\b`/`\b429\b` khớp cả khi con số đó nằm trong nội dung khác của
  message; `LlmError.failure` không mang HTTP status thật nên không so được chính xác hơn.
- Vết cũ chỉ bị xoá bởi lần spawn sau (provider hồi phục mà member không spawn lại vẫn hiện
  vết cũ — đọc kèm `at`); `lib/client/**` ngoài phạm vi chưa render trường này, snapshot thì có.

## Kiểm máy

`node tests/t28-provider-failure.mjs` → 20/20 exit 0; hồi quy: t20 15/15, t3 18/18, t4 22/22,
t15 21/21 (đều exit 0). `node --check` sạch trên 4 tệp JS đã sửa.
