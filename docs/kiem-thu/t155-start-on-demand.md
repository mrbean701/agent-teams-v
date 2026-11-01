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
## 5. t159 — V26-F1: cổng giờ ĐO được cửa sổ đua, và sự thật về hai hàng rào

Audit vòng 26 (`t158`) đo được: bỏ `withTeamLock` quanh `startMemberOnDemandNow` thì bộ kiểm này
vẫn 11/11 xanh, nên cổng chưa canh được khoá chống double-spawn. t159 vá đúng khoảng mù đó — nhưng
kết quả đo lại nói một điều KHÁC với giả định của audit, và điều đó quan trọng hơn bản vá:
**`withTeamLock` không phải hàng rào duy nhất.**

### 5.1 Cửa sổ đua thật, không cần chèn gì vào `lib/**`

Cửa sổ nằm ở chỗ chậm thật của vùng tới hạn: `startActivation` của provider stub chờ **40 ms** trước
khi trả `childId` (một lần spawn thật mất hàng trăm ms). Vì `spawnMember` chỉ ghi dòng bền SAU khi
spawn xong, hai lời gọi không được tuần tự hoá sẽ cùng vượt qua phép kiểm 'đã có phiên sống' trong
lúc dòng trên đĩa vẫn mang `id` cũ. Bật/tắt bằng `raceWindowMs` của harness (`T155_WINDOW`).

Ca `a12` (cửa sổ 40 ms, hai lời gọi `Promise.all`) — trên cây THẬT:

```
race window=40ms starts=1 started=[false,true]
PASS a12 RACE with a real window: 40ms of route resolution inside the critical section ⇒ exactly ONE session
```

### 5.2 Đối chứng âm — và phát hiện: bỏ khoá KHÔNG ra 2 phiên

Bản sao `tests/tmp/t159/lib-nolock` bỏ `withTeamLock` (đổi `withTeamLock(key, async () => {` thành IIFE
`(async () => {…})()` — phải gọi, nếu không `await` trả về chính hàm; lỗi này đã mắc một lần khi dựng
đối chứng và biểu hiện là `starts=0` chứ không phải 2) **và** chèn 80 ms ngay sau `readTeam`, đúng
hình dạng đột biến của audit. Chạy lại CHÍNH bộ kiểm này trên bản sao (`T155_LIB=… T155_ONLY_RACE=1
T155_WINDOW=0`):

```
lockless copy: exit=0 :: starts=1 started=[true,false]
```

Vẫn đúng MỘT phiên. Nguyên nhân đo được: `members.js` giữ một mutex THỨ HAI, độc lập — khoá lựa chọn
đang chờ (`withPending`, `lib/members.js:893-907`, ném `member model selection is already pending`) —
nên lời gọi thứ hai không thể spawn song song dù team lock đã bị bỏ. Ca `a13` ghim đúng sự thật đó,
thay vì ghim một kỳ vọng sai.

### 5.3 Đối chứng âm thật: bỏ CẢ HAI hàng rào ⇒ 2 phiên, và ca đua đỏ ĐÚNG LÝ DO

`tests/tmp/t159/lib-both` bỏ `withTeamLock` + chèn 80 ms + vô hiệu `withPending`
(`if (false && pending.has(key))`). Kết quả nguyên văn:

```
both guards gone: exit=1 :: got 2 sessions (2 would mean the lock is gone); answers=[{…"applied":"live-and-durable"…},{…}]
```

Ca `a14` assert ba điều: exit của bộ kiểm con = 1, dòng `FAIL a12` xuất hiện, và thông điệp chứa
`got 2 sessions` — tức ca đua đỏ vì ĐÚNG hiện tượng (hai phiên), không phải vì lỗi kỹ thuật. Đây là
bằng chứng ca đua không rỗng nghĩa: nó phân biệt được 'có hàng rào' với 'không có hàng rào'.

### 5.4 Trạng thái V26-F1

- **Khoảng mù đã đóng**: trước t159 không ca nào có cửa sổ thật, nên bỏ khoá không làm gì đỏ. Nay
  `a12` chạy trong cửa sổ thật, và `a13`/`a14` chứng minh cả hai chiều của hiện tượng.
- **Đính chính kết luận của audit**: 'bỏ `withTeamLock` ⇒ 2 phiên' KHÔNG đúng trên mã hiện tại —
  hàng rào thứ hai (`withPending`) chặn việc đó. Vì vậy A2 của card t159 (đòi bản sao bỏ khoá phải
  ĐỎ với `got 2 sessions`) **không đạt theo nguyên văn**; t159 nộp FAILED với finding để captain quyết
  (nhận cặp a13+a14 thay cho A2, hoặc yêu cầu một dạng đối chứng khác).
- **Hệ quả cho người đọc mã**: đừng gỡ `withTeamLock` coi là 'dư' — nó vẫn là hàng rào đúng cho mọi
  đường khác đi qua cùng khoá; nhưng nếu chỉ kiểm nó thì bạn chưa kiểm toàn bộ cơ chế chống trùng.
## 6. t160 — ĐÍNH CHÍNH: hai hàng rào, và V26-F1 đóng theo nghĩa nào

Mục 5 ghi lại việc t159 phát hiện tiền đề của audit vòng 26 sai. t160 chốt lại thành một mục đọc
được độc lập, để hồ sơ không còn câu 'bỏ `withTeamLock` là ra 2 phiên' mà không kèm đính chính.

### 6.1 Hai hàng rào độc lập

| # | hàng rào | ở đâu | nó chặn cái gì | khi bị gỡ |
|---|---|---|---|---|
| 1 | `withTeamLock(teamLockKey(...))` | `lib/tools.js:3327` (quanh `startMemberOnDemandNow`) | tuần tự hoá HAI lời gọi trên cùng đội: lời thứ hai đọc lại `team.json` đã có `id` phiên mới và từ chối | lời thứ hai vẫn vào được vùng tới hạn |
| 2 | khoá selection đang chờ (`withPending`) | `lib/members.js:893-907` | chặn HAI lần spawn song song cho cùng (captain, label): ném `member model selection is already pending for …` | hai lần spawn có thể cùng chạy |

Hai hàng rào không thay thế nhau về mặt thiết kế, nhưng trên đường `start-on-demand` thì hàng rào 2
phủ đúng cửa sổ mà hàng rào 1 bỏ trống, nên **bỏ một cái vẫn còn một cái**:

```
lockless copy: exit=0 :: starts=1 started=[false,true]
   refused=["could not start member \"alice\": member model selection is already pending for \"agent-teams:team-t155:alice\"", null]
```

Thông điệp trên là BẰNG CHỨNG, không phải suy đoán: nó nêu đúng hàng rào 2 đã từ chối, kèm khoá
`agent-teams:team-t155:alice`. Vì vậy ca `a13` **PASS khi vẫn còn 1 phiên**, và câu hỏi của nó là
'hàng rào nào giữ được', không phải 'bản sao có xanh không'.

### 6.2 Ca nào canh cái gì

| ca | chạy trên | canh điều gì | kết quả thật |
|---|---|---|---|
| `a12` | cây THẬT | cửa sổ đua 40 ms trong `startActivation`: **CẢ HAI** hàng rào đứng ⇒ đúng 1 phiên | `starts=1 started=[false,true]`, lời thứ hai bị từ chối vì 'already has a live session (child-1)' |
| `a13` | bản sao bỏ hàng rào 1 (`tests/tmp/t160/lib-nolock`) + 80 ms sau `readTeam` | mất hàng rào 1 ⇒ hàng rào 2 vẫn giữ, và câu từ chối phải NÊU TÊN nó (`already pending`) | PASS, `starts=1`, refused = `member model selection is already pending for …` |
| `a14` | bản sao bỏ CẢ HAI (`tests/tmp/t160/lib-both`) | mất cả hai ⇒ 2 phiên, và `a12` đỏ ĐÚNG lý do | exit=1, `FAIL a12`, `got 2 sessions`; đồng thời assert `realTreeRacePassed === true` từ `a12` trong cùng tiến trình |

`a14` là ca duy nhất trả lời được câu 'cổng này có thật sự canh được chống trùng không': nó cần
CHỨNG MINH DƯƠNG (bỏ hàng rào ⇒ 2 phiên) chứ không chỉ 'mọi thứ xanh'.

### 6.3 V26-F1 ĐÃ ĐÓNG — theo nghĩa nào

- **Đóng**: cổng giờ canh cả CẶP hàng rào và canh được chúng một cách QUAN SÁT ĐƯỢC — bỏ hàng rào 1
  thì ca a13 nói rõ hàng rào 2 đã cứu; bỏ cả hai thì a14 đòi 2 phiên và `a12` đỏ.
- **KHÔNG đóng theo nghĩa cũ** (và không bao giờ đóng được): 'bỏ `withTeamLock` một mình là đỏ'. Trên
  mã hiện tại điều đó không xảy ra, nên một card đòi đúng điều đó là card sai tiền đề. A2 của t159 vì
  thế đã nộp FAILED — đúng, và t160 thay nó bằng cặp a13+a14.
- **Điều kiện để kết luận này còn đúng**: nếu ai đó gỡ/bỏ `withPending` (hoặc đổi khoá của nó thành
  per-call), thì a13 sẽ ĐỎ — đó là tín hiệu đúng, vì lúc đó chỉ còn một hàng rào và cần ghi lại
  quyết định trong cùng task.
- **Giới hạn**: cả ba ca chạy trên harness stub (0 boot), nên chúng chứng minh THỨ TỰ và SỰ TỪ CHỐI
  của plugin, không chứng minh một phiên thật chạy. Việc đó thuộc về boot thật (t154).
### 6.4 Vì sao mỗi ca ghim CỬA SỔ riêng (đo được, không phải sở thích)

Lần chạy đầu sau khi sửa kỳ vọng a13 cho kết quả KHÔNG ỔN ĐỊNH: cùng một bản sao bỏ hàng rào 1,
lần thì `starts=1` (hàng rào 2 từ chối), lần thì `starts=2` (hàng rào 2 chưa kịp giữ). Đó chính là
bản chất của việc mất một hàng rào: kết quả phụ thuộc timing, nên một ca chỉ khẳng định 'phải ra 1'
sẽ là ca FLAKY — tệ hơn không có ca, vì nó dạy người đọc tin vào một kết quả ngẫu nhiên.

Cách chốt: mỗi ca tự chọn cửa sổ để QUAN SÁT ĐÚNG hàng rào mà nó nói tới.

| ca | `T155_WINDOW` | vì sao | kết quả ổn định |
|---|---|---|---|
| `a13` | 40 ms | spawn của lời gọi đầu còn đang chờ khi lời gọi thứ hai tới ⇒ hàng rào 2 chắc chắn có mặt để từ chối | 3 lần chạy liên tiếp: `starts=1`, refused = `member model selection is already pending for …` |
| `a14` | 0 | hàng rào 2 đã bị vô hiệu ⇒ không cần cửa sổ ngoài; chỉ cần độ trễ 80 ms trong mã bản sao để cả hai cùng qua phép kiểm | 3 lần: exit=1, `FAIL a12`, `got 2 sessions`, `starts=2` |

Kết luận cho hồ sơ: **V26-F1 đóng** ở nghĩa 'cổng canh được CẢ CẶP hàng rào, và canh được một cách
quan sát được' — `a12` (cả hai đứng), `a13` (chỉ hàng rào 2 đứng, nêu đúng tên), `a14` (không hàng
rào nào ⇒ 2 phiên, ca đua đỏ). Nó KHÔNG đóng ở nghĩa 'bỏ `withTeamLock` là đỏ', vì đo được điều đó
không xảy ra và còn phụ thuộc timing; card nào đòi đúng vế đó là card sai tiền đề.
