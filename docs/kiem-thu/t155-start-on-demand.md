# t155 — start-on-demand (OPT-IN) cho hồ sơ member có `id` bền

Task `t155` (kind=implementation, attempt `6e0e21d8-4e9f-45f6-94a9-801cd59a13b0`), nối tiếp phát hiện của
`t154`: 14 hồ sơ member trong `team.json` ERP đều có `id` bền, nên `dispatchMember`
(`lib/tools.js:544-545`) không bao giờ spawn lại chúng — đổi route chỉ ghi `routeOverride`, người vận
hành thấy 'đổi model mà không có hiệu lực'.

## 1. Cơ chế

Cờ opt-in `start_if_needed` (boolean, **mặc định false**) trên `agent_teams_set_member_route`.
Khi `true` và hồ sơ có `id` bền nhưng KHÔNG có phiên sống:

1. route mới được ghi như cũ (`setMemberRoute`, một lần `writeTeam`);
2. plugin start phiên qua **đúng đường spawn dùng chung** — `activateMemberNow` trong
   `lib/members.js`, cùng hàm `add_member` dùng — nên precedence `fallback > override > active >
   declared` vẫn do `routeOf()` quyết định (bài học t86: đọc thẳng `provider/model` làm mất
   `routeOverride`), rồi `spawnMember` escalate route đó vào `provider`/`model`;
3. câu trả lời nêu route vừa áp + session id, cộng một câu nói rõ nó vừa được start.

Không có cờ ⇒ nhánh mới KHÔNG chạy: câu trả lời giữ nguyên từng chữ
(`— saved; it takes effect the next time this member starts.`).

### Thay đổi thực tế

| tệp | thay đổi |
| --- | --- |
| `lib/tools.js` | thêm tham số `start_if_needed`; hook sau `setMemberRoute`; hàm `startMemberOnDemandNow()`; runtime bridge `startMemberOnDemand`; 2 khoá output `started`/`start_refused` + 2 nhánh câu trả lời |
| `lib/types/tools.d.ts` | `MemberRouteChangeInput.startIfNeeded?`, `MemberStartOnDemandResult`, `AgentTeamsRuntime.startMemberOnDemand()` |
| `lib/members.js` | **KHÔNG đổi** — `activateMemberNow` đã đúng hình dạng cần (hàm này mutate dòng, không tự ghi `team.json`; caller giữ khoá và ghi) |
| `lib/client.js`, `lib/client.js.map` | **KHÔNG đổi** — bundle là mã CLIENT (panel), không chứa schema công cụ của server, nên thêm tham số không đụng bundle. Đo lại: `67d616a608c3…`/258 925 B và `718f41544f36…`/405 694 B, y nguyên |

### Guard (theo thứ tự, TẤT CẢ trong `withTeamLock`, đọc lại `team.json` tươi)

| điều kiện | trả lời (nguyên văn) |
| --- | --- |
| team không tồn tại | `team "<id>" was not found` |
| không phải captain của đội | `only the captain of team "<id>" can start a member` |
| member không có / đã `removed` | `member "<tên>" is not part of team "<id>"` |
| `team.halted === true` | `team "<id>" is halted; resume it before starting a member` |
| `team.phase === 'staged'` | `team "<id>" is still staged; members start only after approval` |
| `member.stopping === true` | `member "<tên>" is stopping` |
| member đã có phiên sống | `member "<tên>" already has a live session (<id>), so the route was applied to it instead of starting a second one` |
| start ném lỗi | `could not start member "<tên>": <message>` — **không** ghi đè `team.json` (hàm spawn chỉ mutate RAM) |

'Phiên sống' có HAI nhân chứng độc lập, một trong hai là đủ: `memberSelections.liveChildIds()`
(registry mà `spawnMember` điền) và `ctx.agents.get(member.id)` (registry agent của Host).
Chỉ khi CẢ HAI trả lời 'không' thì `id` mới bị coi là mồ côi và bị xoá **trong RAM** trước khi start
— dòng bền chỉ được thay bằng id mới ở lần `writeTeam` cuối.

Chống double-spawn có hai lớp: `withTeamLock` (cùng khoá đường spawn hiện tại) tuần tự hoá hai lời
gọi, và lời gọi thứ hai đọc lại team đã mang id mới ⇒ thấy 'live' ⇒ từ chối.

## 2. Bộ kiểm `tests/t155-start-on-demand.mjs` — 11 ca, EXIT 0

Không boot Host: harness của `t86` (stub `ctx.subagents.startActivation` đếm số lần start, route thật
nằm ở `spec.request.agentOptions`), chạy trên `indexMod.apply` + `team.json` seed trong thư mục tạm.

| ca | khẳng định | số đo |
| --- | --- | --- |
| a1 | `start_if_needed` là boolean và **không** nằm trong `required` | `properties` có khoá, `required[]` không chứa nó |
| a2 | `.d.ts` khai `startIfNeeded?`, `startMemberOnDemand(`, `MemberStartOnDemandResult` | PASS |
| a3 | **mặc định**: hồ sơ mồ côi + KHÔNG cờ ⇒ 0 start, `applied='durable-only'`, câu trả lời cũ nguyên văn, `id` cũ không bị đụng | `starts=0` |
| a4 | có cờ ⇒ đúng 1 phiên, route = route VỪA ĐẶT (`p2/m2` + effort `high`, không phải declared `p1/m1`), trả lời có `session child-1` | `starts=1`, `applied='live-and-durable'` |
| a5 | gọi lần hai (đã live) ⇒ KHÔNG mở phiên thứ hai, trả lời `already has a live session (child-1)` | `starts=1` |
| a6 | **hai lời gọi SONG SONG** ⇒ đúng 1 phiên; một lời `started=true`, một lời `started=false` | `starts=1`, 1 + 1 |
| a7 | team `halted` ⇒ 0 start + câu từ chối nguyên văn; route vẫn được ghi | `starts=0` |
| a8 | team `staged` ⇒ 0 start + câu từ chối nguyên văn | `starts=0` |
| a9 | member `stopping` ⇒ bị từ chối NGAY ở `setMemberRoute` (guard cũ, trước cả cờ), 0 start | `assert.rejects /is stopping; its route cannot be changed/` |
| a10 | **bản copy `team.json` ERP**: 14 hồ sơ / 7 `removed`; chọn `qa-do-2` (`working`, id bền) + cờ ⇒ start trên `p2/m2`, dòng copy mang id phiên mới; **tệp ERP GỐC** không đổi sha/bytes/mtime | `erp sha 9f7420b6…`/1 533 117 B/mtime 1792817593185.6294 trước = sau |
| a11 | cùng hồ sơ ERP **không** cờ ⇒ 0 start, `durable-only`, id gốc nguyên, `routeOverride{source:'captain', provider:'p2'}` trong tệp | `starts=0` |

### Phát hiện phải khai: `routeOverride` KHÔNG còn sau khi start

A3 của hợp đồng đòi sau khi start thấy `routeOverride{source:'captain'}` trong tệp. **A3 vì thế KHÔNG
ĐẠT đúng như viết** (t155 đã nộp FAILED với finding F2) — không phải vì cơ chế sai, mà vì vế đó
không thể đúng cùng lúc với một lần start thành công. Cụ thể: **không thể**: `spawnMember` escalate override vào `provider`/`model` rồi `delete member.routeOverride`
(`lib/members.js:1078`), và docstring của `activateMemberNow` giải thích vì sao — một override còn sót
dưới descriptor đang chạy sẽ làm guard cold-resume từ chối chính lần resume kế tiếp.

Vậy sau một lần start, bằng chứng bền là: `provider`/`model` = route mới (a10 assert), `id` = phiên
mới, và dòng audit `MODEL-SWITCH.md` mang `source='captain'` (ghi trong `setMemberRoute`, không phụ
thuộc spawn). Ca a11 chứng minh chiều ngược lại: KHÔNG cờ thì `routeOverride` nằm nguyên trong tệp.

## 3. Hồi quy — HAI CỔNG ĐỎ vì tệp ghim NGOÀI inScope

| lệnh | exit | kết quả |
| --- | --- | --- |
| `node tests/t155-start-on-demand.mjs` | 0 | `# 11/11 passed, 0 failed` |
| `node tests/t115-check-contract.mjs` | 0 | `# 43/43 passed` |
| `node tests/t113-roster-assertion.mjs` | 0 | `# 38/38 passed` |
| `node tests/t107-removed-members-visible.mjs` | 0 | `# 13/13 passed` |
| `node tests/t114-source-freeze.mjs` | **1** | `# 11/16 passed, 5 failed` — A3, A4, B2, B4, E1 |
| `node tests/t99-render-parity.mjs` | **1** | `# 10/11 passed` (a11 chạy cổng t98 và đòi exit 0) |
| `node tests/t98-render-coverage.mjs --strict` | **2** | `GATE ERROR: stale RENDER_LINES map — agent_teams_set_member_route@1366, …` |

Nguyên nhân DUY NHẤT: hai bảng ghim do HAI tệp NGOÀI inScope của t155 nắm giữ, và cả hai đều ghim
theo nội dung `packages/dsh-agent-teams/lib/**` mà t155 buộc phải sửa:

1. `tests/t59-erp-live-copy.mjs` — `FROZEN` 13 dòng ⇒ t114 đỏ. Hai dòng lệch:
   `lib/tools.js` `e51734baf469…`/213 715 → **`642de17fb176…`/221 404**;
   `lib/types/tools.d.ts` `41cfc56576ed…`/7 546 → **`258c8b6a827a…`/8 781**. 11 dòng còn lại SAME.
2. `tests/t98-render-coverage.mjs` — `RENDER_LINES` 16 dòng ⇒ cổng EXIT 2 (tự bảo vệ: map cũ thì
   không chấm gì cả). 12 dòng phải dời (4 dòng đầu không đổi):

```
set_member_route 1366 -> 1369    set_member_profile 1479 -> 1506   remove_member 1542 -> 1569
create_task      1630 -> 1657    reassign_task      1766 -> 1793   claim_task    1901 -> 1928
update_task      2071 -> 2098    amend_task         2240 -> 2267   send_message  2317 -> 2344
status           2466 -> 2493    resume             2698 -> 2725   delete        2748 -> 2775
(create 889, edit_plan 1142, approve 1254, add_member 1303: KHÔNG đổi)
```

Đây đúng là quy ước mà chính `t114`/`t117` đã đặt ra: *ai ghi `lib/**` thì cập nhật bảng ghim trong
CHÍNH task đó*, vì để sang task khác là để lại một cây đỏ vì lý do không liên quan. t155 bị cấm chạm
hai tệp đó, nên **không thể** đạt A6 trong phạm vi được giao — báo lên thay vì nới phép kiểm, và
cũng không tạo tệp thay thế để lách.

## 4. Giới hạn

1. **0 boot.** Toàn bộ bằng chứng đến từ harness stub: `startActivation` trả `childId` giả, nên
   'phiên sống' ở đây là 'plugin đã gọi đúng đường spawn với đúng route và ghi đúng id'. Một phiên
   THẬT (mint/main/live) là việc của `t154` và của một lần boot có Host — chưa chạy trong t155.
2. **`ctx.agents.get()` là nhân chứng thứ hai** cho 'còn sống'. Nếu một Host không giữ child đã
   chết trong registry đó, một id chết sẽ bị coi là sống và lần start bị từ chối — chế độ hỏng AN
   TOÀN (không spawn trùng), không phải hỏng im lặng.
3. **`routeOverride` mất sau start** là hành vi có chủ đích của `spawnMember` (mục 2), nên bất kỳ
   công cụ nào đọc `routeOverride` để suy ra 'ai đã đặt route' phải đọc thêm `provider`/`model` và
   dòng audit.
4. **Bundle không đổi** vì schema công cụ là phía server; nếu về sau panel hiển thị cờ này thì
   `lib/client/**` phải build lại và bảng FROZEN của `t59` lại phải cập nhật CÙNG task.
