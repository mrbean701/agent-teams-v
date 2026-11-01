# E2E hot-switch — đổi route của member ĐANG CHẠY (t18)

Trạng thái: **PASS** — chạy thật 2 lần (lần 1 FAIL do bộ phân tích của chính test, lần 2 PASS end-to-end).
Script: `tests/t18-hot-switch-e2e.mjs` (455 dòng, mức **E2E**: phiên captain thật + member thật + tool thật).

## 1. Mục đích

Chứng minh `agent_teams_set_member_route` đổi được route của một member **đang chạy** trong một phiên THẬT
(profile nháp `agent-teams-test`, không phải profile desktop), và ghi lại **mọi hậu quả quan sát được**:
request kế tiếp dùng model mới, notice trong hội thoại member, `team.json`, audit row, và attempt đang mở
không bị mất.

Bối cảnh: master không dogfood được bằng chính phiên đang nạp plugin cũ v0.1.28 (BUG-003 trong `docs/log/BUG.md`),
nên bằng chứng phải lấy từ một phiên headless mới do script mở.

## 2. Chạy lại (copy là chạy)

```bash
cd /e/Project/Agent-Team
node tools/test/test-env.mjs          # 1) dựng/vá profile nháp agent-teams-test (idempotent)
node tests/t18-hot-switch-e2e.mjs     # 2) E2E: exit 0 = PASS, exit 1 = có check FAIL
```

Phân tích lại artifact đã lưu mà **không tốn thêm phiên/quota**:

```bash
node tests/t18-hot-switch-e2e.mjs --analyze tests/tmp/e2e-hotswitch/<stamp>
```

Yêu cầu môi trường: CLI Desktop `0.2.1-rc.5` (định vị qua `tools/test/lib/dsh-cli.mjs`, override bằng
`DSH_DESKTOP_CLI`), `$DSH_HOME` chứa profile `agent-teams-test` đã link `E:/Project/Agent-Team/packages/dsh-agent-teams`.
Script tự kiểm preflight (profile + dependency + bundles + CLI) và in `fix: node tools/test/test-env.mjs` nếu thiếu.

## 3. Script chấm gì (C1..C9)

| ID | Điều kiện | Bằng chứng lấy từ đâu |
|---|---|---|
| C1 | `agent_teams_create` dựng roster 2 member, worker-a khởi đầu `opencode-go/kimi-k2.7-code` | input của tool call trong stream `--json` của phiên captain |
| C2 | Lúc đổi route, member **đang chạy** (đã spawn child session) | result của `agent_teams_status` trước khi đổi (`working/running`) + `member.id` trong `team.json` |
| C3 | Tool báo đã áp lên phiên SỐNG, không chỉ ghi đĩa | result text chứa `route is now opencode-go/deepseek-v4.1-flash, reasoning high` và `applied to the live session and saved` |
| C4 | Route bền vững trong `team.json` | `member.routeOverride = {provider, model, reasoningEffort, source:"captain"}` |
| C5 | Audit row độc lập | `<workspace>/docs/log/MODEL-SWITCH.md` có row đúng format, cột `applied` = `live-and-durable` |
| C6 | Hội thoại member có notice của host | transcript thật của member: event `user/message` với `source.form="notice"`, text `[model changed: …]` |
| C7 | **Request ĐẦU TIÊN sau notice** chạy model mới (và request trước đó chạy model cũ) | hai event `request/header` trong transcript: `data.header.config` trước/sau |
| C8 | Member KHÔNG mất attempt đang mở và hoàn thành đúng attempt đó | `work attempt N` giống nhau ở status trước/sau + `task.attemptId` trong `team.json` xuất hiện trong transcript member |
| C9 | Tiến trình LẠNH vẫn thấy route mới | `spawnSync(node, ['-e', 'import readTeam…'])` nạp chính `lib/state.js` của plugin trong profile nháp |

Mã thoát: 0 chỉ khi cả C1..C9 PASS; kết quả chi tiết ghi vào `result.json` trong thư mục artifact
(`checks[]`, `proved`, `unproved`, `verdict`).

## 4. Bằng chứng lần chạy PASS

Artifact: `tests/tmp/e2e-hotswitch/2026-10-31T14-34-11` — `EXIT=0`, tổng 9/9 PASS.

```
PASS C1 — agent_teams_create built a 2-member roster whose worker-a starts on opencode-go/kimi-k2.7-code
PASS C2 — member was working/running (spawned child session) when the route changed
PASS C3 — agent_teams_set_member_route reported applied to the LIVE session (text form of applied=live-and-durable)
PASS C4 — team.json records the new route for worker-a
PASS C5 — audit log gained the route-change row written by appendRouteChangeAudit
PASS C6 — member conversation carries the host model-changed notice
PASS C7 — the FIRST request after the notice ran the new route (previous request ran the old one)
PASS C8 — member kept its open attempt across the switch and finished that same attempt
PASS C9 — a cold process (no live session) re-read the route through the plugin own state reader

verdict PASS - proved C1,C2,C3,C4,C5,C6,C7,C8,C9; unproved none
```

Chi tiết thô (đọc từ artifact, không phải từ lời model):

- Phiên captain: `session-7ac539e0-7408-408f-adec-9b020af62a72`, exit 0, 61 206 ms.
- Member worker-a: `603289ce-2b57-4920-95ee-2175a0499226`; worker-b vẫn `idle`/`unspawned` (đúng thiết kế: chỉ member có task mới spawn).
- Status TRƯỚC khi đổi: `- worker-a [long task runner] working/running · opencode-go/kimi-k2.7-code`
- Status SAU khi đổi: `- worker-a [long task runner] working/running · opencode-go/kimi-k2.7-code → opencode-go/deepseek-v4.1-flash (override)`
- Kết luận của captain trong phiên: `HOTSWITCH applied=opencode-go/deepseek-v4.1-flash now=opencode-go/deepseek-v4.1-flash (override; session opened as opencode-go/kimi-k2.7-code, in-flight step kept its route)`
- `team.json` (`<workspace>/.agent-teams/e2e-hotswitch/team.json`):
  `routeOverride = {"provider":"opencode-go","model":"deepseek-v4.1-flash","reasoningEffort":"high","source":"captain","at":1793457263271,"by":"session-7ac539e0-7408-408f-adec-9b020af62a72"}`
- Task `t1`: `status=completed`, `attempt=1`, `attemptId=76cff6d6-a83a-4f06-95b4-8950283e6e88` — chính attempt mở lúc đổi route, hoàn thành sau khi đổi.
- Audit row do plugin ghi (`<workspace>/docs/log/MODEL-SWITCH.md`), nguyên văn:
  `| 2026-10-31T14:34:23.271Z | e2e-hotswitch | worker-a | opencode-go/kimi-k2.7-code | opencode-go/deepseek-v4.1-flash (high) | live-and-durable | captain:session-7ac539e0-7408-408f-adec-9b020af62a72 |`
- Transcript member (`C:\Users\thang\.dsh\sessions\--E-Project-Agent-Team-tests-tmp-e2e-hotswitch-2026-10-31T14-34-11-workspace--\603289ce-2b57-4920-95ee-2175a0499226\session.v4.jsonl.zstd`,
  45 zstd frame, 90 event): notice ở `seq 19` —
  `"[model changed: assistant turns above this point were generated by kimi-k2.7-code; the session continues with deepseek-v4.1-flash]"`
- `request/header` trong cùng transcript — trước: `{"seq":11,"cfg":{"provider":"opencode-go","model":"kimi-k2.7-code"}}`,
  sau: `{"seq":20,"cfg":{"provider":"opencode-go","model":"deepseek-v4.1-flash","reasoningEffort":"high"}}`
  ⇒ request kế tiếp sau notice (seq 20 > 19) đã dùng model mới, effort `high`.
- Member chạy tiếp 14 `step/start` sau khi đổi và tự viết `notes.md` + `summary.md` trong workspace ⇒ đổi route giữa đường không làm chết lượt chạy.
- C9: tiến trình node lạnh nạp `<profile>/node_modules/@nami/dsh-agent-teams/lib/state.js` và `readTeam(stateRoot,'e2e-hotswitch')` trả `routeOverride` = route mới ⇒ state bền, không mất sau cold start.

## 5. Lịch sử chạy (trung thực, kể cả lần sai)

| Lần | Thời điểm | Kết quả | Ghi chú |
|---|---|---|---|
| 1 | 2026-10-31T14-26-05 | **FAIL** (verdict FAIL, proved C1,C2,C4) | Tính năng chạy ĐÚNG; **bộ phân tích của test sai**: (a) `agent_teams_set_member_route` trả **text**, không trả object `{applied}`; (b) audit row ghi vào **workspace**, không phải repo; (c) transcript không nằm trong `storages/session_projcache` mà ở `$DSH_HOME/sessions/<cwd-slug>/<sessionId>/session.v4.jsonl.zstd`. Đã sửa bộ phân tích, không sửa `lib/**`. |
| — | 2026-10-31T14:2x | PASS (re-analyse) | `--analyze` trên artifact lần 1 sau khi sửa: 9/9 PASS ⇒ chứng minh lỗi ở test, không ở plugin, và không phải tốn thêm phiên. |
| 2 | 2026-10-31T14-34-11 | **PASS** | Chạy sạch end-to-end bằng một lệnh: exit 0, 9/9 PASS. |

## 6. Phát hiện cần captain biết

1. **Audit ghi theo workspace, không theo repo.** `lib/members.js:1032-1060` dùng `join(workspace, ...ROUTE_AUDIT_PATH)`
   với `ROUTE_AUDIT_PATH = ['docs','log','MODEL-SWITCH.md']` (`lib/members.js:1008`). Hệ quả: trong đội chạy ở
   workspace thật thì row rơi đúng `docs/log/MODEL-SWITCH.md` của repo đó; trong E2E workspace tạm thì row rơi vào
   workspace tạm. Đây là hành vi đúng theo thiết kế nhưng **phải nói rõ** khi ai đó tìm row trong repo và không thấy.
2. **Phiên LLM lạnh không quan sát được đội.** `agent_teams_status` trả `Error: you do not lead or belong to any
   active team yet` (`requireParticipantTeam`). Vì vậy C9 chứng minh bằng **tiến trình lạnh đọc state qua chính mã
   plugin**, không bằng phiên LLM mới. Đừng dựa vào một phiên mới để kiểm route.
3. **Effort `high` được chấp nhận** cho `opencode-go/deepseek-v4.1-flash` dù catalog desktop chỉ khai
   `reasoningEfforts` cho gpt-5.6-luna / mimo-v2.6* / qwen3.8*; effort đi thẳng vào `request/header` như prompt
   mong đợi. Chưa kiểm provider có thực sự hạ/tăng effort hay bỏ qua.
4. **Transcript là zstd nhiều frame nối tiếp**; `zstdDecompressSync` cả file chỉ ra frame đầu (312 B). Muốn đọc đủ
   phải quét magic `28 B5 2F FD` rồi giải từng frame (script đã làm, 45 frame → 90 event).

## 7. Giới hạn / chưa phủ

- Chưa quay được **request trên dây** của provider; bằng chứng "request kế tiếp dùng model mới" là `request/header`
  do host ghi trong transcript (đúng lớp quyết định route), không phải log HTTP.
- Chưa kiểm **dispose/reload plugin trong tiến trình host đang chạy** (chỉ chứng minh cold read ở tiến trình mới).
- `worker-b` cố ý không có task nên không kiểm được "đổi route khi member đang ở giữa một step" (step in-flight);
  lần chạy này đổi route khi member đang ở giữa turn nhiều step (14 step/start) và step kế đã dùng route mới.
- Chưa kiểm route khi member `stopping` (nhánh throw của `setMemberRoute`) — thuộc unit test t15, không phải E2E.

## 8. Đối chiếu tiêu chí t18

| Yêu cầu | Kết quả |
|---|---|
| Cài/mount fork vào profile nháp, không đụng desktop | PASS — preflight đọc `<profile>/package.json`: dependency `link:E:/Project/Agent-Team/packages/dsh-agent-teams` + bundle `@nami/dsh-agent-teams` |
| Team 2 member, route đầu `opencode-go/kimi-k2.7-code` | PASS — C1 |
| Giao task dài để member chạy thật | PASS — task `L1` → `t1`, member viết `notes.md`/`summary.md`, 14 step |
| Giữa lúc chạy đổi sang `opencode-go/deepseek-v4.1-flash` high | PASS — C3 (`reasoning high`) |
| Request kế tiếp dùng model mới | PASS — C7 (`request/header` seq 11 → seq 20) |
| Notice `[model changed: …]` trong hội thoại member | PASS — C6 (`seq 19`) |
| `team.json` có `routeOverride`/thăng cấp route | PASS — C4 |
| Audit row trong `docs/log/MODEL-SWITCH.md` | PASS có điều kiện — plugin ghi vào `<workspace>/docs/log/MODEL-SWITCH.md`; row nguyên văn ở §4 và được dẫn lại trong `docs/log/MODEL-SWITCH.md` của repo |
| Member KHÔNG mất attempt đang mở | PASS — C8 (`attemptId=76cff6d6-…` trước/sau như nhau, task completed) |
| Reload (dispose) rồi route vẫn đúng | PASS một phần — C9 cold process đọc lại qua plugin; chưa test dispose trong tiến trình sống |
| Script tái lập trong `tests/` | PASS — `tests/t18-hot-switch-e2e.mjs`, tự định vị bằng `import.meta.url`, không có đường dẫn tuyệt đối tới repo |
