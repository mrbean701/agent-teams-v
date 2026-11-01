# E2E: thêm member thủ công trên đội ĐANG CHẠY (t21)

Kiểm thử mức **E2E** cho tính năng thứ hai của dự án: `agent_teams_add_member` thêm
member vào một đội **đang chạy** trong một phiên THẬT (không phải harness giả lập),
cộng đường HTTP `/plan` action `add_member`.

- Script: `tests/t21-add-member-e2e.mjs` (552 dòng, tự định vị bằng `import.meta.url`, không có đường dẫn tuyệt đối).
- Profile nháp: `agent-teams-test` (`C:\Users\thang\.dsh\profiles\agent-teams-test`) — **không** chạm profile desktop.
- Plugin dưới test: fork `packages/dsh-agent-teams` (dependency `link:E:/Project/Agent-Team/packages/dsh-agent-teams`).
- Lần chạy sạch: `tests/tmp/e2e-addmember/2026-10-31T15-04-30` — **verdict PASS, proved A1..A7, unproved none**, EXIT=0.

## 1. Lệnh chạy

```bash
cd /e/Project/Agent-Team
node tests/t21-add-member-e2e.mjs                     # chạy thật, exit 0 = PASS
node tests/t21-add-member-e2e.mjs --analyze <runDir>  # chấm lại artifact cũ, KHÔNG mở phiên mới (không tốn quota)
```

Script tự sinh run dir `tests/tmp/e2e-addmember/<stamp>/` gồm:
`caps.yml`, `dump-caps.txt`, `session1.stdout.txt`, `session1.stderr.txt`, `run-meta.json`,
`http.json`, `http-workspace/`, `workspace/`, `result.json`.

Tuỳ chọn qua biến môi trường (script mặc định một lần chạy là đủ):

- `DSH_TEST_PROFILE` — tên profile nháp (mặc định `agent-teams-test`)
- `DSH_DESKTOP_CLI` — CLI Desktop (mặc định `C:/Users/thang/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd`)
- `DSH_TEST_HOME` — `DSH_HOME` (mặc định `C:\Users\thang\.dsh`)

## 2. Cách ép trần member cho MỘT lần chạy

Trần `maxManualMembers` mặc định là 12, nên A5 (bị từ chối khi vượt trần) không thể kiểm
nếu thêm member tới 12. Script dùng `--patch <overlay>` của CLI Desktop để hạ trần cho
đúng lần chạy đó, **không sửa profile**:

```yaml
# <runDir>/caps.yml
- id: agent-teams
  config:
    stateDir: .agent-teams
    memberProvider: spawn
    maxMembers: 2
    maxManualMembers: 2
```

Ràng buộc của plugin (`lib/index.js:145-146`): `maxManualMembers` phải `>= maxMembers`,
nên cả hai đều đặt bằng 2. Overlay được chứng minh đã áp bằng chính `--dump-config` bên
trong preflight (script ném lỗi nếu row `agent-teams` không có đúng hai giá trị này).

## 3. Bảy tiêu chí và kết quả

| Mã | Tiêu chí | Kết quả trong lần chạy sạch |
|----|----------|------------------------------|
| A1 | Phiên thật tạo được đội 1 member, đội ở `running`, member nhận task và chạy | PASS — `phase=running`, worker-a `id=0550ec5a-8502-4fde-9e9c-e3fa75f09d4c`, task `t1=completed/attempt 1` |
| A2 | Gọi `agent_teams_add_member` khi đội **đang chạy**: trả member id thật + `spawned` trung thực | PASS — text: `Member "worker-b" added and started (session b8c43161-36d1-40f8-9624-6f41d8283236, opencode-go/deepseek-v4.1-flash, reasoning high, status idle).` (`spawned=true`); 3 lời gọi add trên đội đang chạy đã bị từ chối có kiểm soát |
| A3 | `team.json` có member mới, status≠`removed`, route đúng | PASS — `{id:b8c43161-…, name:worker-b, provider:opencode-go, model:deepseek-v4.1-flash, reasoningEffort:high, status:idle}` (kèm `runtimeSetup.persona`) |
| A4 | Member mới nhận task | PASS — `t2` (assignee `worker-b`) `status=completed, attempt=1, attemptId=c9e6bd9f-…`, `changedPaths:["member-b.md"]`, output do member tự viết |
| A5 | Trần `maxManualMembers` được tôn trọng | PASS — `Error: team "e2e-addmember" is at its manual member cap (2)`; không có row `worker-c` |
| A6 | Trùng tên bị từ chối | PASS — `Error: member name "worker-a" has already been used in team "e2e-addmember"`; đội vẫn chỉ 1 row `worker-a` |
| A7 | HTTP `POST /plugins/dsh-agent-teams/plan` action `add_member` tạo được member trên đội đang chạy | PASS có điều kiện — status `200`, body `ok:true`, roster có `bob` đúng route; lời gọi trùng trả `409 {error:'member name "bob" has already been used in team "HTTP"'}`. `spawned=false` +`spawnError` vì host tổng hợp không có provider continuable (xem §5) |

## 4. Bằng chứng nguyên văn (lần chạy sạch)

Session thật (headless, một dòng prompt, prompt đi qua STDIN):

```
session 1: exit=1 in 83702 ms
```

Exit code của phiên là 1 nhưng **phiên vẫn hoàn tất công việc**: stdout có event
`{"type":"final","text":"Both tasks are now terminal, and the team is idle: …"}`,
7 `tool_call` + 7 `tool_result` đều `status: completed`, và stderr chỉ có đúng một dòng
crashpad của Electron host:

```
[1031/220431.008:ERROR:third_party\crashpad\crashpad\util\win\registration_protocol_win.cc:108] CreateFile: The system cannot find the file specified. (0x2)
```

⇒ Bộ chấm của script **không** dựa vào exit code của phiên (nó phản ánh teardown của
Electron, không phản ánh kết quả nghiệp vụ) mà dựa trên `team.json` + `tool_result` +
final event. Điều này được ghi nhận như một hạn chế đã biết, không giấu.

Các chuỗi quyết định:

```
tool_result(agent_teams_add_member): Member "worker-b" added and started (session b8c43161-36d1-40f8-9624-6f41d8283236, opencode-go/deepseek-v4.1-flash, reasoning high, status idle).
tool_result(agent_teams_add_member, trùng tên): Error: member name "worker-a" has already been used in team "e2e-addmember"
tool_result(agent_teams_add_member, vượt trần): Error: team "e2e-addmember" is at its manual member cap (2)
```

`team.json` sau khi chạy (rút gọn): member `worker-b` có `id`, `model: deepseek-v4.1-flash`,
`reasoningEffort: high`, `status: idle`; task `t2` `completed` với `attemptId` và
`changedPaths: ["member-b.md"]`.

HTTP `/plan` (socket thật, handler thật):

```json
{"added":{"status":200,"body":{"ok":true,"phase":"running","member_name":"bob","member_id":"","provider":"opencode-go","model":"deepseek-v4.1-flash","reasoning_effort":"high","status":"idle","spawned":false}},
 "duplicate":{"status":409,"text":"{\"error\":\"member name \\\"bob\\\" has already been used in team \\\"HTTP\\\"\"}"},
 "roster":[{"name":"alice","spawnError":null},{"name":"bob","spawnError":"Error: agent-teams: provider \"spawn\" does not support continuable members"}]}
```

## 5. Giới hạn đã biết (không tuyên bố quá)

1. **A7 chạy trên host tổng hợp, không phải trong phiên thật.** `lib/index.js:176-187`
   chỉ đăng ký route `/plan` khi host có service `webServer`/`httpServer` **và**
   `workspaceRegistry`; profile nháp là bundle `dsh-base` + `dsh-headless` nên
   `grep -i 'webserver\|connection' tests/tmp/dump-verify.yml` không có row nào ⇒ trong
   phiên headless route này không bao giờ đăng ký. Vì vậy A7 dựng **node http.Server thật +
   fetch thật**, mount `lib/index.js` với host tổng hợp kiểu `tests/t4-control-plane-smoke.mjs`,
   và gọi đúng handler đã ship. Cái được chứng minh: đường HTTP tạo member + từ chối trùng +
   ghi `spawnError` trung thực. Cái KHÔNG được chứng minh ở đây: spawn qua HTTP — và điều
   đó đúng là giới hạn của host tổng hợp (provider `spawn` của stub không hỗ trợ continuable),
   không phải lỗi plugin.
2. **`spawned=true` chỉ được chứng minh ở đường tool trong phiên thật (A2)**, không phải ở A7.
   Script chấp nhận cả hai khả năng nhưng bắt buộc phải trung thực: `spawned=true` ⇒ phải có
   `member_id`; `spawned=false` ⇒ roster phải có `spawnError` non-empty. Không assert mù.
3. **"Phê duyệt" ở A1 là `approval:'automatic'`** (kế hoạch được duyệt tự động ngay khi tạo),
   không phải đường hai pha `approval:'required'` + `agent_teams_approve` có người duyệt.
   Điều được chứng minh là đội ở `running` và member thật đã chạy task (`t1 completed/attempt 1`).
   Đường `approve` thủ công đã có test giả lập riêng (`tests/t3-route-smoke.mjs`,
   `tests/t4-control-plane-smoke.mjs`), chưa có E2E.
4. **`team.json` không có khoá `phase`** — engine mặc định coi thiếu `phase` là `running`
   (`fresh.phase ?? 'running'` trong `lib/tools.js`), nên evidence của A1 in `phase=undefined`
   từ file trong khi detail hiển thị `phase=running` lấy từ ngữ cảnh phiên. Không phải lỗi,
   nhưng người đọc evidence cần biết.
5. **Thứ tự kiểm tra**: trùng tên được kiểm **trước** trần (`lib/tools.js:2764-2769`), nên khi
   đội đã đầy, thêm một cái tên đã tồn tại sẽ trả lỗi trùng tên chứ không phải lỗi trần.
6. Chưa phủ: member mới nhận task qua **scheduler** khi captain không gọi `create_task`;
   `activation:'on-task'`; `interrupt`/`stopping`; HTTP trên host có `webServer` thật (web profile).

## 6. Lịch sử lượt chạy (trung thực)

| Lượt | Lệnh | Kết quả | Ghi chú |
|------|------|---------|---------|
| 1 | `node tests/t21-add-member-e2e.mjs` | **FAIL** EXIT=1 | Lỗi trong **preflight của chính test**: dòng 467 viết regex kiểu `/maxManualMembers: ' + CAP + '/` (literal, không nội suy) nên `--patch` đã áp đúng mà vẫn báo sai. **Chưa mở phiên nào** (preflight chạy trước session) ⇒ không tốn quota. Log: `tests/tmp/t21-run1.log` |
| 2 | `node tests/t21-add-member-e2e.mjs` | **PASS** EXIT=0 | 7/7 PASS, artifact `tests/tmp/e2e-addmember/2026-10-31T15-04-30`. Log: `tests/tmp/t21-run2.log` |
| — | `--analyze` lại artifact lần 2 (từ repo root và từ `/c/Users/thang`) | PASS cả hai | Chứng minh script tự định vị, và `--analyze` không mở phiên mới |

Hạn mức: 3 lần thử — đã dùng 2 (một lần hỏng ở preflight, không mở phiên).

## 7. Đối chiếu tiêu chí của t21

| Yêu cầu của t21 | Đáp ứng |
|---|---|
| Dùng lại hạ tầng t18 (profile nháp, CLI desktop, plugin fork) | Có — cùng `tools/test/lib/dsh-cli.mjs`, cùng `--patch`, cùng cách gọi PowerShell + STDIN |
| (A1) đội 1 member, duyệt, member chạy | Có, với ghi chú `approval:'automatic'` (§5.3) |
| (A2) add_member khi đang chạy, `spawned` trung thực | Có — `spawned=true` + session id thật |
| (A3) `team.json` route đúng | Có |
| (A4) member mới nhận task | Có — `t2 completed` bởi `worker-b` |
| (A5) trần `maxManualMembers` | Có — thông điệp nêu cap `(2)` |
| (A6) trùng tên | Có — thông điệp nêu tên + tên đội |
| (A7) HTTP `/plan` `add_member` | Có, kèm giới hạn §5.1 (host tổng hợp) |
| `--analyze <dir>` không tốn quota | Có |
| Chỉ ghi `tests/**`, `docs/kiem-thu/**`, `docs/log/**`; không sửa `lib/**` | Có — plugin chỉ được đọc |
