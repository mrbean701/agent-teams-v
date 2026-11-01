# t37 — Đường KHÔI PHỤC route gốc (xoá `routeOverride`)

Trước t37, `agent_teams_set_member_route` chỉ ĐẶT override. Một khi captain đổi route, route
khai báo trong `team.json` không có đường quay lại. Nay tool nhận `clear: true`: xoá override,
ghi `team.json` trước, rồi mới chuyển route RAM của child đang sống.

## Cơ chế

1. `clear: true` → xoá `routeOverride`, `fallbackActive`, `activeProvider`, `activeModel`
   (members.js:1201-1226). Việc xoá chỉ chạy SAU khi đã kiểm member còn route khai báo để
   quay về; không có route khai báo thì từ chối và tệp không đổi.
2. `const previous = routeOf(member)` chụp TRƯỚC mọi thay đổi (members.js:1197), nên kết quả
   trả về `previous` đúng là route đang có hiệu lực — kể cả khi member đang chạy trên fallback.
3. `await writeTeam(...)` (members.js:1254) RỒI `selections.setLiveRoute(...)` (:1257): đĩa
   trước, RAM sau. Chết giữa hai bước thì tệp vẫn là nguồn sự thật, lần resume sau đọc ra route
   khai báo.
4. Audit: một hàng mới trong `<workspace>/docs/log/MODEL-SWITCH.md` với cột route mới =
   `(cleared)` (members.js:1117), `applied` = `live-and-durable` hoặc `durable-only`.
   Event `agent-teams/member-route-changed` mang thêm cờ `cleared: true` (members.js:1271).
5. Trộn `clear` với `provider`/`model`/`reasoning_effort` bị từ chối rõ ràng ở cả hai lớp
   (members.js:1192-1194 và tools.js execute) thay vì im lặng bỏ qua.

## Chỗ sửa

| Tệp | Dòng | Nội dung |
| --- | --- | --- |
| `lib/members.js` | 1117 | cột route mới của audit = `(cleared)` khi record có cờ |
| `lib/members.js` | 1191-1194 | `clearing` + từ chối trộn clear với provider/model/effort |
| `lib/members.js` | 1197-1198 | chụp `previous` + `at` trước mọi mutation |
| `lib/members.js` | 1201-1226 | nhánh clear: kiểm route khai báo → xoá 4 trường → `selectionFromMember` |
| `lib/members.js` | 1227-1250 | nhánh đặt route giữ nguyên hành vi cũ |
| `lib/members.js` | 1254, 1257 | `writeTeam` rồi `setLiveRoute` (đĩa trước RAM) |
| `lib/members.js` | 1271, 1292, 1308-1309 | cờ `cleared` trong event, audit record, kết quả; `origin` = `declared` |
| `lib/tools.js` | 1231 | tham số `clear` (provider/model không còn bắt buộc) |
| `lib/tools.js` | 1247, 1254-1255 | `cleared` trong output schema + một dòng render riêng |
| `lib/tools.js` | 1283, 1299 | guard execute + chuyển cờ xuống runtime |
| `lib/tools.js` | 2905 | wrapper `setMemberRoute` chuyển tiếp `clear` |

## Cách đọc kết quả

```
agent_teams_set_member_route { member_name: "worker-a", clear: true }
→ Member "worker-a" override is cleared: back on its declared route command-code-goat/... (was ...)
```

DTO trả về giữ nguyên bộ khoá của nhánh đặt route và thêm `cleared: true`; `previous_provider`
/`previous_model` là route hiệu lực TRƯỚC khi xoá. Trạng thái đội: `route_override` biến mất
khỏi DTO member, `next_route` trỏ về route khai báo. Vết audit: hàng cuối trong
`docs/log/MODEL-SWITCH.md` có cột route mới `(cleared)`.

## Giới hạn còn lại

- **HTTP/Web UI chưa clear được**: `lib/index.js:369-392` (handler `/plan`
  `set_member_route`) vẫn bắt buộc `provider`+`model` và không chuyển cờ `clear`; cần sửa
  `index.js` + `lib/client/**` — ngoài phạm vi t37.
- **Nửa "live" không test được bằng harness in-memory**: `liveSelections` là Map private
  (members.js:784) nên test chỉ thấy `applied: 'durable-only'`; thứ tự đĩa-trước-RAM được
  chứng minh tĩnh bằng case i2 (so index hai lệnh trong thân `setMemberRoute`).
- **`lib/types/*.d.ts` chưa khai báo `clear`** — ngoài phạm vi, sẽ lệch tài liệu kiểu.

## Bằng chứng

`node tests/t37-route-clear.mjs` → `# 14/14 passed, 0 failed` (a1,a2,b1,c1,d1,e1,e2,f1,f2,
g1,h1,h2,i1,i2). Hồi quy: t3 18/18, t4 22/22, t28 20/20, t30 8/8 — tất cả exit 0.
