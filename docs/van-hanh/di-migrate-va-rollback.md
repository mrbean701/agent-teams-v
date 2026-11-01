# Di trú, dogfood và rollback — @nanmicoder/dsh-agent-teams v0.1.28 → @nami/dsh-agent-teams 0.2.x

Task t13. Căn cứ: [moi-truong.md](../kiem-thu/moi-truong.md) (lệnh cài đã chạy thật, exit 0),
[tuong-thich-erp.md](../kiem-thu/tuong-thich-erp.md) (t20, 15/15), [BUG.md](../log/BUG.md) (BUG-003, BUG-005),
`packages/dsh-agent-teams/package.json` (`"name": "@nami/dsh-agent-teams", "version": "0.2.0-dev.0"`).

## 1. Cái gì đổi, cái gì phải giữ

| Hạng mục | v0.1.28 | v0.2.x | Ghi chú |
|---|---|---|---|
| Tên gói / loader id | `@nanmicoder/dsh-agent-teams` | `@nami/dsh-agent-teams` | hai gói khác nhau, cài song song được |
| `TEAM_TAB_ID` (id tab sidebar) | `@nanmicoder/dsh-agent-teams/activity` | **GIỮ NGUYÊN** `@nanmicoder/dsh-agent-teams/activity` | cố ý (BUG-005); bundle hard-code chuỗi này |
| Khoá cấu hình cũ (`stateDir`, `maxMembers`, `memberProvider`, `toolPolicies`, …) | có | giữ nguyên, mọi khoá mới đều có default | `lib/index.js:96-108` |
| Khoá mới | — | `maxManualMembers` (default 12) | `lib/index.js:103`; nếu đặt tay phải `>= maxMembers`, nếu không, mount ném lỗi ngay: `agent-teams: maxManualMembers (<n>) must be >= maxMembers (<m>)` — chuỗi ghép từ `lib/index.js:146` (`:145` là điều kiện) |
| `team.json` | schema cũ | **đọc được, không cần di trú** | xem mục 2 |
| Tool mới | — | `agent_teams_set_member_route`, `agent_teams_add_member` | chỉ có sau khi cài + **mở phiên mới** (BUG-003) |
| HTTP action mới | — | `/plan` `add_member`, `set_member_route` | `lib/index.js:348-385` |

## 2. Dữ liệu đội cũ: KHÔNG cần di trú (đã chứng minh)

- `readTeam`/`readTeamSync` của bản mới đọc nguyên `E:\Project\ERP\.agent-teams\erp-erp\team.json`
  (1 533 117 B): đủ **14 member** (7 `removed` + 7 sống), `reasoningEffort: max` 14/14, **107 task**
  (101 có `attemptId`; `t107` vẫn `in_progress` `attempt: 2` với `attemptId` gốc), inbox 15 file /
  682 dòng parse 682/682, 0 dòng hỏng.
- Bản mới **không ghi** file: sha256 nguồn và bản copy bất biến qua 15 case (`tests/t20-erp-compat`).
- Dữ liệu cũ **không có** `routeOverride` và bản mới **không tự thêm** (`routeOf` trả `origin: 'declared'`).
- Trường lạ `runtimeSetup`, `executionPrompt` qua được validate và còn nguyên ⇒ schema mới chấp nhận
  dữ liệu do bản cũ sinh ra.
- Chạy lại: `node tests/t20-erp-compat.mjs` (PASS 15/15 — không sửa gì dưới `E:\Project\ERP`).

**Kết luận:** cài bản mới lên đội ERP hiện có là **thay plugin, không phải migrate dữ liệu**.

## 3. Cài / chuyển (profile nháp trước, luôn luôn)

```
# 0) chuẩn bị profile nháp riêng (tạo từ template headless, vá credentials + route)
cd E:/Project/Agent-Team && node tools/test/test-env.mjs        # exit 0 = PASS (5/5 row)

# 1) cài fork (đường link, không copy)
powershell -NoProfile -Command "& 'C:/Users/thang/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd' plugin --profile agent-teams-test add link:E:/Project/Agent-Team/packages/dsh-agent-teams"
#    → exit 0; profile tự thêm @nami/dsh-agent-teams vào dsh.profile.bundles

# 2) xác nhận đã mount
node tools/test/test-env.mjs                                     # PASS row agent-teams mounted
node tools/test/smoke-team.mjs                                   # PASS C1..C3 (team.json sinh ra)

# 3) smoke nhanh bundle UI
cd packages/dsh-agent-teams && node build/build.mjs && node --check lib/client.js
```

Bẫy đã gặp thật (đừng đoán lại): gọi `dsh.cmd` **trực tiếp từ MSYS2 bash** chết vì đường dẫn có dấu
cách — phải qua `powershell -NoProfile -Command "& '<cli>' <args>"`; profile desktop **bị CLI từ chối**
thao tác plugin (`rejectElectronProfile`) nên mọi thao tác cài/gỡ phải làm trên profile nháp.
Chi tiết + output nguyên văn: [moi-truong.md](../kiem-thu/moi-truong.md) §3-§5.

## 4. Checklist dogfood sau khi cài (BUG-003: phiên cũ vẫn nạp v0.1.28)

BUG-003 ghi: `agent_teams_set_member_route is not a function` trên phiên master **không phải lỗi mã** —
phiên đó nạp bản 0.1.28 đã cài, fork chưa mount. Tool surface của một phiên **chốt lúc khởi động**, nên
sau khi cài BẮT BUỘC mở **phiên mới**. Checklist, mỗi dòng một bằng chứng:

1. [ ] `dsh plugin --profile <p> list` thấy `@nami/dsh-agent-teams`; `--dump-config` có row `- id: agent-teams`.
2. [ ] Mở **phiên mới** trong profile đó; `agent_teams_status` chạy được (chứng tỏ plugin đã mount).
3. [ ] Danh sách tool có `agent_teams_set_member_route` và `agent_teams_add_member` — nếu thiếu: dừng, phiên vẫn là bản cũ (BUG-003), mở phiên khác chứ **đừng** gọi lại nhiều lần.
4. [ ] Đổi route một member **đang chạy**: kết quả phải nói `live-and-durable` (cùng tiến trình) hoặc `durable-only` (khác tiến trình — đúng bản chất, không phải lỗi; xem t11 §caveat).
5. [ ] `team.json` của đội có `routeOverride {provider, model, reasoningEffort, source, at, by}`; `provider`/`model` của member **không đổi**.
6. [ ] `docs/log/MODEL-SWITCH.md` (trong workspace của đội) có thêm đúng 1 dòng bảng; cột nguồn dạng `captain:…` hoặc `http:web:…`.
7. [ ] Transcript member có notice `[model changed: assistant turns above this point were generated by …; the session continues with …]` **và** `request/header` kế tiếp dùng model mới (t18 C6/C7).
8. [ ] Attempt đang mở không mất: task vẫn `attempt`/`attemptId` cũ (t18 C8).
9. [ ] `add_member` khi đội đang chạy: member mới `status=idle`; trùng tên → lỗi `member name "…" has already been used`; vượt trần → `… is at its manual member cap (n)` (t21, t11).
10. [ ] UI: tab `AgentTeams` mở được, có hàng `Route` từng member + nút `Add member`; panel staged vẫn như cũ (t10 22/22). Không thấy 2 control ⇒ điều kiện 1/2/3 ở **4.1**, không phải lỗi mã.
11. [ ] Đọc lạnh: tiến trình thứ hai `import lib/state.js` → `readTeam()` trả route mới (t18 C9).

Mục 4 và 9 là hai chỗ BUG-003 từng làm mất thời gian: **không** kết luận "plugin hỏng" khi thực ra phiên chưa nạp bản mới.

### 4.1 Thấy 2 control trong panel — 3 điều kiện

Hai control người dùng cần là **hàng chọn route của từng member** (`data-member-route-control`) và **nút Add member** (`data-add-member`). Chúng chỉ hiện khi CẢ BA điều kiện sau cùng đúng, xếp theo đúng thứ tự nên kiểm:

1. **Host phải nạp bundle FORK.** Profile phải trỏ `@nami/dsh-agent-teams` 0.2.0-dev.0. Bundle cũ `@nanmicoder/dsh-agent-teams` 0.1.28 **không có control nào**. Kiểm: `lib/client.js` của bundle đang nạp phải chứa `data-member-route-control`, `data-add-member`, `set_member_route`, `add_member` — 0 hit nghĩa là vẫn 0.1.28 (xem mục 3 và BUG-003).
2. **Session đang chọn phải là CHÍNH `captainSessionId` của team.** Panel lọc `team.captainSessionId === current` (`lib/client/ActivityPanel.js:642-647`, comment "Teams follow the current session"); `current === undefined` (chưa chọn phiên) ⇒ 0 team. Mở session khác ⇒ panel RỖNG — đúng thiết kế, **không** phải lỗi. Team `nami-agent-teams` giữ `captainSessionId` = `session-92ccafca-11d3-4c97-bde8-8f735d5a4efd` ở khoá `captainSessionId` trong `team.json` của workspace đội.
3. **Panel AgentTeams phải đang mở.** Panel tự mở khi một team live xuất hiện sau lượt khôi phục; hoặc bấm nút "Activity panel" (khoá `activity.panelButton`, `lib/client/locales.js:32` zh / `:288` en). Panel đóng thì không control nào hiện dù điều kiện 1 và 2 đã đúng.

Đường dogfood ĐÚNG: đổi profile `desktop` sang fork → khởi động lại Host → **mở lại đúng session đã tạo team** (hoặc tạo team mới ngay trong session mới). Hướng dẫn cũ "mở session bất kỳ trên cổng 19488" là SAI vì điều kiện 2.

Khoá bằng máy: `node tests/t57-panel-session-gate.mjs` (29 case) cắt thẳng biểu thức lọc từ `ActivityPanel.js` và chạy trên fixture, nên bỏ lọc `captainSessionId` là test FAIL.

## 5. Rollback về bản cũ (đã chạy thật — t27, profile nháp)

Quy trình dưới đây là **cái đã làm được**, không phải đề xuất: t27 chạy thật `0.2.0-dev.0 → 0.1.28 →` 0.2.0-dev.0
trong profile nháp `agent-teams-test`, 3 lần boot thật, 16/16 check PASS ([t27-rollback.md](../kiem-thu/t27-rollback.md),
tái lập bằng `node tests/t27-rollback.mjs`). Rollback **offline được, không cần registry**: máy có sẵn bản 0.1.28
trong `profiles/desktop/node_modules/@nanmicoder/dsh-agent-teams` nên chỉ cần copy.

Trước khi rollback: **sao lưu** `<workspace>/.agent-teams/<team>/team.json` + `inbox/*.jsonl` **và** `package.json` của
profile (bước 3 sửa chính tệp này).

### 5.1 Bốn bước, mỗi bước kèm cách kiểm

| # | làm gì (thao tác tệp, không cần pnpm) | kiểm bằng gì |
|---|---|---|
| 1 | Bỏ **symlink** `node_modules/@nami/dsh-agent-teams` của profile (`fs.rmSync` lên link) | `fs.lstat(link).isSymbolicLink === false`; đã đo: xoá link **không** xoá mã fork — `lib/tools.js` của fork còn nguyên |
| 2 | Copy bản cũ từ chỗ có sẵn: `fs.cpSync('<DSH_HOME>/profiles/desktop/node_modules/@nanmicoder/dsh-agent-teams' → '<profile>/node_modules/@nanmicoder/dsh-agent-teams', {recursive:true})` | `lstat.isSymbolicLink === false` (copy thật) + `package.json` bản copy = `@nanmicoder/dsh-agent-teams@0.1.28` |
| 3 | Sửa **manifest profile** `<profile>/package.json`: `dependencies = {"@nanmicoder/dsh-agent-teams": "0.1.28"}`; `dsh.profile.bundles = [dsh-base, dsh-headless, "@nanmicoder/dsh-agent-teams"]` (gỡ `@nami/dsh-agent-teams`) | `<dsh.cmd> --profile <p> --dump-config` → row bundle `name: '@nanmicoder/dsh-agent-teams'`; **không tốn quota** |
| 4 | Mở phiên mới trong **workspace của đội** rồi gọi `agent_teams_create` với **đúng tên đội cũ** | phải bị từ chối `team id "…" is taken by another captain — pick a different team name`; `sha256(team.json)` trước = sau; boot 0.1.28 = **39 tool / 14 `agent_teams_*`**, **không** có `agent_teams_set_member_route` |

Lấy lại 0.2.x sau khi rollback: trả `dependencies`/`bundles` về `@nami/dsh-agent-teams` và cài lại link bằng
**junction** (xem 5.2), rồi mở phiên mới → boot **40 tool / 15 `agent_teams_*`**, `set_member_route` có lại.

### 5.2 Bốn cạm bẫy đã đo được (đừng làm theo cách cũ)

- **`dsh plugin --profile <p> remove|add …` là pnpm passthrough.** `dsh plugin --help` in "manage a profile's
  plugins by forwarding the remaining arguments to pnpm in the profile directory": `remove` gỡ **cả bản ghi dependency**
  (không chỉ bỏ symlink) và `add` **cần registry npm** — nên câu lệnh cũ vừa thừa vừa hỏng khi offline. Dùng bốn
  bước ở 5.1; nếu vẫn dùng pnpm thì phải sửa manifest lại như bước 3.
- **`cordis.patch.yml` phải khớp tên package.** Bản 0.1.28 mang `name: '@nanmicoder/dsh-agent-teams'`; để
  `@nami/…` thì plugin **không nạp**. Kiểm bằng `--dump-config` (bước 3), đừng đoán.
- **Windows: `fs.symlinkSync(…, 'dir')` → `EPERM`.** Dùng `'junction'`; kiểm lại bằng
  `lstat.isSymbolicLink === true` và `realpath` trỏ về thư mục fork.
- **`agent_teams_status` ở phiên mới trả `Error: you do not lead or belong to any active team yet`** — đo
  giống nhau từng chữ ở **cả** 0.1.28 lẫn 0.2.0-dev.0, tức **bình thường**, không phải lỗi rollback. Cách kiểm
  đúng là bước 4.

### 5.3 `team.json` của bản mới: 0.1.28 đọc được, không phá một byte

Đã đo (S6): 0.1.28 boot trên đúng `team.json` do 0.2.0 ghi **có `routeOverride`**, đọc được, và
`sha256(team.json)` = `20f5c16689f8e38e` **trước = sau**. Vì vậy **không cần** khôi phục backup cũng không cần
xoá tay `routeOverride` trước khi mở bản cũ — nhưng vẫn nên sao lưu trước khi rollback. Quay lại 0.2.x thì
`routeOverride` còn nguyên nên route đã đổi vẫn hiệu lực.
Nhắc lại: sửa tay `team.json` là đúng thứ guard `lib/members.js:621` canh — chỉ xoá `routeOverride`,
**không** đụng `provider`/`model`. Rollback không cần chạm `E:\Project\ERP` lần nào.

## 6. Sau khi chuyển: audit trail đọc ở đâu (đừng đọc session event)

`appendTeamEvent` (`lib/events.js:25-46`) **bỏ toàn bộ** event `agent-teams/*` khi harness hiện tại
không khai báo type trong `KNOWN_SESSION_EVENT_TYPES` —
`const known = dshSession.KNOWN_SESSION_EVENT_TYPES;` (`:32`), `if (known?.has(type) !== true) { … return; }` (`:33-39`).
Vì thế sau khi chuyển sang 0.2.x, đừng kết luận "không có audit" chỉ vì transcript captain không có event:

| Bằng chứng | Đường dẫn | Ghi chú |
|---|---|---|
| Audit đổi route | `<workspace>/docs/log/MODEL-SWITCH.md` | file MÁY ĐỌC, 1 dòng bảng/lần đổi; văn xuôi sang `MODEL-SWITCH-notes.md` |
| Trạng thái đội | `<workspace>/.agent-teams/<team>/team.json` | `routeOverride` + `provider`/`model` + task/attempt |
| Hội thoại member | transcript của member | notice `[model changed: …]` + `request/header` kế tiếp (host ghi) |
| Hộp thư | `<workspace>/.agent-teams/<team>/inbox/*.jsonl` | parse 682/682 dòng trên dữ liệu ERP thật |

Đây chính là lý do t18/t11 chấm bằng `MODEL-SWITCH.md` + `team.json` thay vì session event.

## 7. Chưa kiểm được
- ~~Hồi quy ngược 0.2.x → 0.1.28 trên cùng `team.json`~~ — **ĐÃ CHẠY và ĐẠT** (t27; mục 5.3): 0.1.28 boot trên đúng `team.json` do 0.2.0 ghi (có `routeOverride`), đọc được, sha256 không đổi, và quay lại 0.2.0 thì lấy lại đủ tool.
  Còn chưa kiểm (theo chính t27 §5): rollback từ bản cài bằng tarball, rollback nhiều profile cùng lúc, và chiều ngược lại — 0.1.28 ghi dữ liệu rồi 0.2.0 đọc.
- Cài trên profile desktop thật: bị `rejectElectronProfile` chặn từ CLI; chưa ai thử qua UI.
- Auth fence của `/plan`: **đã kiểm ở phía plugin** — `tests/t24-auth-fence.mjs` **12/12**, EXIT 0: `401` `{"error":"unauthorized"}`,
  `403` `forbidden`, `503` `authentication unavailable` khi Connection chưa bind, `409` khi captain chưa gắn, `405` kèm **body rỗng**
  (`lib/index.js:275-279`, phủ cả `GET` lẫn `DELETE`), `413` ở biên `1 000 000 B` (`lib/web-routes.js:36-37`), và fence chạy **trước** method
  check (GET bị từ chối trả `401` chứ không phải `405`). **CHƯA phủ** (phần F3 còn lại): ruột Connection của host (token/cookie/CSRF),
  TLS, kiểm origin, và replay. Vẫn nên coi route `/plan` là nội bộ profile.
- Dogfood trong phiên master (BUG-003) vẫn OPEN; bằng chứng hiện có là profile nháp (t11, t18, t21).
