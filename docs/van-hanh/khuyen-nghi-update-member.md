# Khuyến nghị vận hành — đổi route của member: `update_member` hay `agent_teams_set_member_route`?

Tác giả: nghien-cuu (task t7, phạm vi đã đổi theo chỉ đạo captain). Ngày 2026-10-31.
Căn cứ: phát hiện LOW #3 trong `docs/audit/vong-1.md:80-85`; ràng buộc I2 trong `docs/thiet-ke/thiet-ke-v1.md` mục 9; hợp đồng descriptor trong `docs/nghien-cuu/hop-dong-host.md` (t1, Q2).
**Vị thế tài liệu:** đây là khuyến nghị vận hành, **không** phải nguồn chân lý về thiết kế; nguồn chân lý thiết kế là `docs/thiet-ke/thiet-ke-v1.md`, bằng chứng audit là `docs/audit/vong-1.md`.
Đối tượng đọc: người vận hành đội và người viết UI/HTTP gọi `/plan`.

**Kết luận một dòng:** `update_member` là thao tác sửa *spine* (route phiên sẽ mở với) và chỉ đúng khi member **chưa spawn**; với member **đã/đang chạy** phải dùng `agent_teams_set_member_route`, vì ghi thẳng `provider`/`model` của một member đã spawn sẽ làm lần cold resume kế tiếp nổ descriptor guard.

## (a) `update_member` ghi gì, và vì sao chỉ an toàn khi member chưa spawn

**Đường đi của một lệnh `update_member`:

- HTTP `/plan` dựng mutation: `lib/index.js:390-408` — bắt buộc `memberName`+`provider`+`model` (:391-394), rồi đóng gói `provider` (:398) và `model` (:399) vào mutation (kèm `role`, `reasoningEffort`, `executionPrompt`, `tool_policy` tuỳ chọn).
- Mutation được áp trong `lib/tools.js:576-600`, nhánh `update_member`:
  - `member.provider = selection.provider` — `lib/tools.js:588`
  - `member.model = selection.model` — `lib/tools.js:589`
  - `member.reasoningEffort = selection.reasoningEffort` — `lib/tools.js:590`
- Đây là ghi **trực tiếp vào spine**: ba field `provider`/`model`/`reasoningEffort` chính là route mà `spawnMember` đưa vào `agentOptions` để mở phiên con (`lib/members.js:897-903`) và cũng là giá trị host ghi vào subagent descriptor. `update_member` **không** ghi `routeOverride`, **không** đụng descriptor, **không** gọi `setLiveRoute`, **không** ghi log `MODEL-SWITCH.md`.

**Khi nào nó chạy được — và khi nào bị chặn:**

| Tình huống | Hành vi | Bằng chứng |
|---|---|---|
| Member đã spawn (`member.id !== ""`) | Từ chối: `staged member "<name>" was already spawned` | `lib/tools.js:579-580` |
| Team đang `running` (không staged) và mutation ≠ `update_task` | Từ chối toàn bộ: `a running team only permits update_task edits to pending, never-started tasks; roster and removal edits require a staged plan` | `lib/tools.js:573-574` |
| Team `staged` | Cho phép, vì mọi member còn `id === ""` | `lib/tools.js:568-570` |
| Tool `agent_teams_edit_plan` gọi với `allowPendingEdits = true` | Cờ này chỉ bỏ qua `requireStagedTeam` (:569-570), **không** bỏ qua chốt :573-574 | `lib/tools.js:1117` |
| `approveStagedTeam` khi chuyển `staged → running` | Cũng ghi `member.provider/model/reasoningEffort` (:693-695), nhưng lúc đó mọi member đều `id === ""` nên không sinh descriptor lệch | `lib/tools.js:688-696` |

Vì vậy phát biểu chính xác là: **`update_member` chỉ an toàn khi member chưa spawn**, và trên thực tế mọi đường được hỗ trợ đều đã chặn nó với member đã spawn (bảng trên). Đây là lý do kỹ thuật, không phải quy ước tuỳ ý: descriptor không thể sửa sau khi ghi (host fold lấy event descriptor **đầu tiên** — t1 Q2), nên spine phải bất biến sau spawn (ràng buộc I2 của thiết kế).

## (b) Với member đã/đang chạy, luôn dùng `agent_teams_set_member_route`

| Muốn gì | Dùng gì | Vì sao |
|---|---|---|
| Đổi route của member **đang chạy**, có hiệu lực từ lượt kế tiếp | tool `agent_teams_set_member_route` (`lib/tools.js:1226-1282`; gọi nghiệp vụ ở `:1263-1270`) | chỉ ghi `routeOverride` + switch `selection.current`, không đụng spine; host tự sinh notice `[model changed: ...]` ở step sau |
| Đổi route qua HTTP | `/plan` action `set_member_route` (`lib/index.js:369-385`) | cùng một nghiệp vụ `setMemberRoute`, nên cùng bất biến |
| Đổi route của thành viên **chưa spawn** (vẫn là hàng roster) | `agent_teams_set_member_route` (trả `applied = "durable-only"`) | giữ spine bất biến; route mới được thăng cấp vào spine đúng lúc spawn (`lib/members.js:911-925`) |
| Sửa vai trò / prompt / tool policy của thành viên **chưa spawn** | `update_member` (hoặc `agent_teams_edit_plan`) | không có descriptor nào để lệch |
| Đổi route của member **đã spawn** bằng `update_member` | **Không được** — sẽ bị từ chối (`lib/tools.js:579-580`, `:573-574`) | nếu bị vượt qua bằng cách khác, xem (c) |

Quyền: `agent_teams_set_member_route` nằm trong `TEAM_TOOL_NAMES` (`lib/tool-names.js:4`) nên tự động thuộc `CAPTAIN_TOOL_NAMES` và tự vào `BUILTIN_DENY_TOOLS` của member (`lib/tool-policies.js:38`) — chỉ captain gọi được.

Nghiệp vụ duy nhất, ở `lib/members.js:1101-1192`, theo đúng thứ tự: resolve+validate route trước mọi ghi (`:1117-1125`) → `previous = routeOf(member)` (`:1126`) → ghi `member.routeOverride` (`:1128-1135`) → xoá `fallbackActive`/`activeProvider`/`activeModel` (`:1139-1141`) → `writeTeam` (`:1142`) → **sau đó** mới `setLiveRoute` (`:1145`) → trả `applied` (`:1146`). Không có dòng nào ghi `provider`/`model`.

Thêm một khác biệt vận hành quan trọng: chỉ `set_member_route` ghi audit. `appendRouteChangeAudit` (`lib/members.js:1035-1054`) nối thêm một dòng vào `docs/log/MODEL-SWITCH.md` (`ROUTE_AUDIT_PATH` ở `:1008`). `update_member` không để lại dấu vết nào ⇒ nếu dùng `update_member` để đổi route, audit độc lập sẽ không thấy gì.

## (c) Hậu quả cụ thể nếu làm sai: ghi thẳng `provider`/`model` của một member ĐÃ spawn

1. Descriptor của member đã được ghi lúc spawn, từ chính route trong `agentOptions` (`lib/members.js:897-903`) ⇒ `descriptor.agentProvider`/`agentModel` = route lúc mở phiên.
2. Mọi lần cold resume (sau reload plugin hoặc sau khi process mất phiên) đều đi qua guard:

       if (selection !== undefined && (descriptor.agentProvider !== durableMember?.provider || descriptor.agentModel !== durableMember?.model)) {
           throw new Error(`agent-teams: saved model route for member "${memberName}" does not match its subagent descriptor`);
       }

   — `lib/members.js:621` (điều kiện) và `:622` (thông điệp).
3. Nếu `provider`/`model` bị đổi trong khi descriptor giữ route cũ, guard ném lỗi và **member đó không resume được nữa**: mọi lượt sau đều chết ngay ở bước dựng setup phiên con. Trạng thái trên đĩa vẫn "trông đúng" (`team.json` hợp lệ, `status: idle`), panel không báo lỗi, nên sự cố chỉ lộ ra khi member được đánh thức — lúc đó thông báo duy nhất là chuỗi `saved model route for member ... does not match its subagent descriptor`.
4. Cách duy nhất để thoát là sửa `team.json` đưa `provider`/`model` về đúng route trong descriptor (hoặc xoá member đó) — tức là đúng việc mà `set_member_route` đã tránh được từ đầu.

**Đường nào thực sự chạm được lỗi này (nói rõ để không hoang mang thừa):**

- Qua tool/HTTP của plugin: **không có**, vì `lib/tools.js:579-580` và `:573-574` chặn (đã kiểm bằng bảng ở (a)). Đây là phần làm dịu mức độ của phát hiện LOW #3: rủi ro không nằm ở thao tác thường ngày mà ở các đường vòng dưới đây.
- Sửa `team.json` bằng tay hoặc script ngoài plugin (kể cả migration tự viết).
- Một bản fork/đoạn mã khác ghi thẳng `member.provider = ...` cho member đã spawn.
- Tương lai thêm code path mới ghi `provider`/`model` mà quên chốt `member.id === ""`.

**Một hậu quả phụ dễ gặp hơn (không nổ guard, nhưng gây hiểu sai):** `update_member` trên một hàng roster **chưa spawn mà đã có `routeOverride`** sẽ ghi đè spine, trong khi `routeOf` vẫn trả nhánh `override` (`lib/members.js:326-331`). Lúc member spawn, `spawnMember` thăng cấp `routeOverride` vào `provider`/`model` rồi `delete member.routeOverride` (`lib/members.js:919-925`) ⇒ giá trị vừa ghi bởi `update_member` bị bỏ im lặng, và panel hiển thị một spine không phải route sẽ chạy. Muốn đổi route của hàng roster chưa spawn thì dùng `set_member_route` để chỉ có một nguồn sự thật.

## Quy tắc vận hành (checklist)

1. Member đã có `id` (đã từng spawn) ⇒ chỉ dùng `agent_teams_set_member_route` (hoặc `/plan` `set_member_route`). Không dùng `update_member` cho route.
2. Member chưa spawn và chưa có `routeOverride` ⇒ `update_member` dùng được để đặt route ban đầu; nếu đã có `routeOverride` thì dùng `set_member_route`.
3. Không bao giờ sửa `provider`/`model` trực tiếp trong `team.json` của một member đã spawn.
4. Sau khi đổi route, kiểm chứng bằng mắt: spine (`provider`/`model`) phải giữ nguyên, `routeOverride.provider/model` là route mới, và `docs/log/MODEL-SWITCH.md` có thêm đúng một dòng.
5. Nếu thấy `saved model route for member ... does not match its subagent descriptor`, dừng lại: đối chiếu `provider`/`model` trong `team.json` với route trong descriptor của phiên con, không "sửa cho khớp" bằng cách đổi descriptor (không thể) và không nới lỏng guard ở `lib/members.js:621`.

## Cách kiểm chứng lại tài liệu này (không cần chạy plugin)

- `grep -n "was already spawned" packages/dsh-agent-teams/lib/tools.js` → kỳ vọng 2 dòng (`:580`, `:647`).
- `grep -n "does not match its subagent descriptor" packages/dsh-agent-teams/lib/members.js` → kỳ vọng 1 dòng (`:622`).
- `grep -n "member.model = selection.model" packages/dsh-agent-teams/lib/tools.js` → kỳ vọng 2 dòng (`:589`, `:694`) — hai chỗ duy nhất ghi spine, cả hai đều sau chốt `member.id === ""` hoặc trong team staged.
- `grep -n "ROUTE_AUDIT_PATH" packages/dsh-agent-teams/lib/members.js` → `:1008` (đường dẫn log) và `:1037`, `:1047`, `:1052`.
- `grep -n "agent_teams_set_member_route" packages/dsh-agent-teams/lib/tool-names.js packages/dsh-agent-teams/lib/tools.js` → tên tool ở `tool-names.js:4`, đăng ký ở `tools.js` (tool block `:1226-1282`).

## Truy vết

- Phát hiện gốc: `docs/audit/vong-1.md:80-85` (LOW #3 — `update_member` sửa trực tiếp `provider`/`model`).
- Ràng buộc thiết kế: `docs/thiet-ke/thiet-ke-v1.md` mục 9 (descriptor guard KHÔNG SỬA; I2 — `setMemberRoute` không ghi `provider`/`model`; thăng cấp route lúc spawn).
- Cơ chế host: `docs/nghien-cuu/hop-dong-host.md` Q2 (descriptor version 3, fold lấy event đầu tiên ⇒ không thể sửa descriptor sau khi ghi).
