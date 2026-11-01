# Môi trường kiểm thử cho @nami/dsh-agent-teams (nhiệm vụ t5)

Trạng thái: **PASS** — profile nháp dựng được, cài lại được, và smoke mở một phiên captain
headless tạo đội 1 member rồi đọc team.json chạy thật **2 lần PASS** (2026-10-31).

Người sửa: member kiem-thu. Vùng được phép: tests/**, tools/test/**, docs/kiem-thu/**,
profile nháp agent-teams-test. **Không** sửa lib/**, **không** dùng E:\Project\ERP,
**không** ghi vào profile desktop (chỉ đọc làm tham chiếu).

## 1. Thành phần

| Thành phần | Đường dẫn | Vai trò |
|---|---|---|
| Profile nháp | C:\Users\thang\.dsh\profiles\agent-teams-test | phiên DSH riêng, tách khỏi profile desktop |
| Script dựng/cài lại | tools/test/test-env.mjs | tạo profile từ template headless, link fork, vá model route, xác nhận bằng --dump-config |
| Script smoke | tools/test/smoke-team.mjs | mở 1 phiên captain headless → agent_teams_create (1 member) → đọc <workspace>/.agent-teams/<team>/team.json |
| Helper dùng chung | tools/test/lib/dsh-cli.mjs | gọi đúng CLI desktop **qua PowerShell**, tách row YAML, báo PASS/FAIL |
| Vật chứng sinh ra | tests/tmp/dump-*.yml, tests/tmp/dump-*.stderr.txt, tests/tmp/smoke-run/<stamp>/ | dump cấu hình + stdout/stderr phiên + result.json |

## 2. Điều kiện trước khi chạy

1. DSH Desktop đã cài; CLI **đúng** là CLI của Desktop host (0.2.1-rc.5):
   C:\Users\thang\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd
   (đổi được bằng biến DSH_DESKTOP_CLI). **Không** dùng dsh trên PATH — bản đó là 0.2.0-rc.2 (npm global).
2. node ≥ 22 (đã chạy: node v26.7.0).
3. Có credential model: %USERPROFILE%\.dsh\.credentials.yaml (đã thấy refs DEEPSEEK_API_KEY,
   OPENCODE_API_KEY, …). Không cần export env: script bật row credentials để service đọc file này.
4. Có profile desktop với row provider để mượn (chỉ đọc):
   %USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml (row llm-pi-ai + agent-default-model).
   Đổi bằng DSH_TEST_PATCH_SOURCE.
5. Chạy từ gốc repo E:\Project\Agent-Team. Repo này **không** có .gitignore, vật chứng nằm ở
   tests/tmp/** (xem mục 7 để dọn).

## 3. Hai lệnh chính — copy là chạy

~~~
cd E:/Project/Agent-Team
node tools/test/test-env.mjs      # dựng/cài lại profile nháp; exit 0 = PASS
node tools/test/smoke-team.mjs    # smoke 1 phiên captain + đội 1 member; exit 0 = PASS
~~~

Tùy chọn:

~~~
node tools/test/test-env.mjs --force-patch        # ghi lại cordis.patch.yml của profile nháp
node tools/test/test-env.mjs --no-borrow-model    # chỉ bật credentials, không mượn row provider
node tools/test/smoke-team.mjs --team smoke2      # đổi tên đội (id đội = tên đã sanitize)
node tools/test/smoke-team.mjs --workspace tests/tmp/smoke-fixed
node tools/test/smoke-team.mjs --profile agent-teams-test --timeout-ms 600000
~~~

Biến môi trường: DSH_DESKTOP_CLI, DSH_TEST_HOME, DSH_TEST_PROFILE, DSH_TEST_PATCH_SOURCE.

## 4. Kết quả chạy thật (nguyên văn, 2026-10-31)

### 4.1 node tools/test/test-env.mjs → exit 0

~~~
--- desktop CLI is installed
    CLI: C:/Users/thang/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd
    exit=0 stdout="0.2.1-rc.5" stderr=""
--- draft profile exists or is created from the shipped headless template
    reusing profile C:\Users\thang\.dsh\profiles\agent-teams-test (bundles: @deepseek-ai/dsh-base, @deepseek-ai/dsh-headless, @nami/dsh-agent-teams)
--- fork linked into profile (@nami/dsh-agent-teams)
    already linked: link:E:/Project/Agent-Team/packages/dsh-agent-teams
--- profile cordis.patch.yml carries credentials + model route rows
    wrote C:\Users\thang\.dsh\profiles\agent-teams-test\cordis.patch.yml (12 lines, rows: credentials, llm-pi-ai, agent-default-model)
--- --dump-config shows the plugin row and a usable model route
    exit=0 lines=857 dump=E:\Project\Agent-Team\tests\tmp\dump-verify.yml
    stderr (1 line(s)):
      dsh: [C:\Users\thang\.dsh\cordis.patch.yml] patch: entry "locale" not found
PASS  row agent-teams mounted
PASS  row agent-teams declares stateDir .agent-teams
PASS  row credentials enabled
PASS  row llm-pi-ai declares providers
PASS  row agent-default-model pins a provider
=== summary: PASS (0 failing step(s)) ===
~~~

Lần dựng profile đầu tiên (chạy tay trước khi có script) đã cho:
dsh --profile agent-teams-test --from-default-profile headless --dump-config → exit 0, 382 dòng,
stderr duy nhất patch: entry "locale" not found; rồi
dsh plugin --profile agent-teams-test add link:E:/Project/Agent-Team/packages/dsh-agent-teams → exit 0,
profile tự thêm @nami/dsh-agent-teams vào dsh.profile.bundles (kèm [WARN] rằng peerDependencies của
package link không resolve từ node_modules đích — chấp nhận được cho test, không ảnh hưởng mount).

### 4.2 node tools/test/smoke-team.mjs → exit 0, verdict PASS

~~~
workspace : E:\Project\Agent-Team\tests\tmp\smoke-run\2026-10-31T13-42-14-816Z
profile   : agent-teams-test
team      : smoke1
mode      : --json run events, session id minted by the host
exit=0
{"type":"session","sessionId":"session-05cc5834-b2c3-47f5-9452-44e82d82feff","cwd":"…\\2026-10-31T13-42-14-816Z"}
{"type":"tool_call","callId":"call_1f2260f074214dd98f0e2411","tool":"agent_teams_create","input":{"name":"smoke1","description":"smoke: one member, staged plan","approval":"required","plan":{"members":[{"name":"worker-1","role":"smoke member"}],"tasks":[]}}}
{"type":"tool_result","status":"completed","result":"Team \"smoke1\" plan created under E:\\Project\\Agent-Team\\tests\\tmp\\smoke-run\\2026-10-31T13-42-14-816Z\\.agent-teams\\smoke1. It is staged: …"}
{"type":"tool_result","status":"completed","result":"Team \"smoke1\" — smoke: one member, staged plan [blocked]\n… Members (1):\n  - worker-1 [smoke member] idle/unspawned · opencode-go/deepseek-v4.1-flash · reasoning max\nTasks (0): …"}
{"type":"final","text":"SMOKE_DONE smoke1"}
state root: E:\Project\Agent-Team\tests\tmp\smoke-run\2026-10-31T13-42-14-816Z\.agent-teams (exists)
  …\.agent-teams\smoke1\team.json
PASS  C1 team.json written under <workspace>/.agent-teams/ — 1 file(s)
PASS  C2 team.json parses and carries an id — id=smoke1 phase=staged
PASS  C3 exactly one member in the roster — worker-1/idle
=== smoke verdict: PASS ===
~~~

team.json đọc lại được (đoạn đầu):

~~~json
{
  "name": "smoke1", "id": "smoke1", "description": "smoke: one member, staged plan",
  "captainSessionId": "session-05cc5834-b2c3-47f5-9452-44e82d82feff",
  "phase": "staged", "planReviewState": "awaiting_review",
  "members": [{ "id": "", "name": "worker-1", "role": "smoke member",
    "provider": "opencode-go", "model": "deepseek-v4.1-flash", "reasoningEffort": "max",
    "status": "idle" }],
  "tasks": [], "taskSeq": 0
}
~~~

Lần lặp lại có tham số (node tools/test/smoke-team.mjs --team smoke2) → exit 0:
id=smoke2 phase=staged, worker-1/idle, SMOKE_DONE smoke2, session session-f07e0898-fd48-4f52-ab0b-3294cbd099e6.
Tức smoke **chạy lại được** và **không phụ thuộc tên đội**.

## 5. Bẫy môi trường đã gặp thật (bắt buộc biết trước khi tự gõ lệnh)

1. **Không gọi dsh.cmd trực tiếp từ MSYS2 bash.** Một phiên đầy đủ chết ngay:
   exit=1, stdout rỗng, stderr nguyên văn
   'C:\Users\thang\AppData\Local\Programs\DeepSeek' is not recognized as an internal or external command, operable program or batch file.
   Lỗi **lặp lại cả với profile headless shipped** (nên không phải do plugin của ta), trong khi
   --version/--help/--dump-config/plugin add từ bash vẫn chạy tốt. Cùng lệnh qua PowerShell thì OK.
   → tools/test/lib/dsh-cli.mjs bọc powershell.exe -NoProfile -Command "& '<cli>' <args>; exit $LASTEXITCODE".
   Gọi tay thì dùng đúng dạng:
   powershell -NoProfile -Command "& 'C:/Users/thang/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd' --profile agent-teams-test 'task'"
2. **--session-id chỉ trỏ phiên ĐÃ tồn tại**: dsh: session "<id>" does not exist; omit --session-id to start a new Session.
   Smoke vì vậy bỏ --session-id, dùng --json rồi đọc sessionId từ event stream.
3. **Task của headless phải là MỘT dòng.** Prompt nhiều dòng bị cắt tại newline đầu tiên (model chỉ thấy
   dòng 1 và trả lời "the step list is empty"). Đã sửa bằng join(' ').
4. **Trong win_bash đừng dùng lệnh timeout** — trúng timeout.exe của Windows
   (ERROR: Invalid syntax. Default option is not allowed more than '1' time(s).); dùng timeoutMs.
5. **Template headless không có route model**: row credentials bị disabled: true, row llm-pi-ai
   không có providers, agent-default-model trỏ deepseek-official. Boot chết:
   dsh: MISSING_CREDENTIAL: llm-deepseek: no API key for provider route "deepseek-official"; store DEEPSEEK_API_KEY through the credentials service …
   test-env.mjs vá bằng cordis.patch.yml của profile nháp (bật credentials, mượn row llm-pi-ai
   + agent-default-model từ profile desktop, đọc-chỉ).
6. **Profile desktop bị CLI từ chối** cho thao tác plugin management (rejectElectronProfile) — mọi thao tác
   cài/gỡ plugin phải làm trên profile nháp.
7. Smoke cố ý dùng approval: "required": đội ở pha staged, **không spawn member**, nên smoke rẻ và không
   leo thang sang việc spawn thật (đó là phạm vi test khác). Trong phiên headless cả agent_teams_create và
   agent_teams_status đều có mặt — xác nhận tool surface thật, không suy đoán từ YAML.

## 6. Lịch sử lỗi của chính script (trung thực, 3 lần chạy smoke)

| # | Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|---|
| 1 | exit=1, stderr dsh: session "917f788a-…" does not exist; omit --session-id to start a new Session, C1–C3 FAIL | script truyền --session-id cho phiên mới | bỏ --session-id, thêm --json + đọc sessionId từ event |
| 2 | exit=0 nhưng model trả lời "the step list in your message is empty", C1–C3 FAIL | prompt nhiều dòng bị cắt tại newline | prompt thành 1 dòng (join(' ')) |
| 3 | exit=0, C1–C3 PASS, SMOKE_DONE smoke1 | — | PASS; lặp lại với --team smoke2 cũng PASS |

## 7. Giới hạn đã biết / chưa làm

- Smoke chỉ phủ **một** nhánh: tạo đội staged 1 member rồi đọc team.json. **Chưa** phủ: spawn member thật,
  đổi model khi member đang chạy, thêm member thủ công vào đội đang chạy, tương thích dữ liệu đội ERP,
  audit log 7 nhóm — đây là các test của nhiệm vụ khác (t5 chỉ dựng môi trường).
- Không có credential ⇒ smoke FAIL với MISSING_CREDENTIAL; đó là **hành vi đúng của môi trường**, không phải lỗi plugin.
- Profile nháp mượn nguyên row llm-pi-ai + agent-default-model từ profile desktop; nếu file đó đổi/không còn row,
  test-env.mjs FAIL rõ ràng (MISSING row "- id: llm-pi-ai" in …).
- Phiên headless in thêm stderr của Chromium crashpad
  (CreateFile: The system cannot find the file specified. (0x2)) — vô hại, không ảnh hưởng kết quả.
- Vật chứng tích luỹ trong tests/tmp/ (repo không có .gitignore). Dọn:
  rm -rf tests/tmp/smoke-run tests/tmp/dump-*.yml tests/tmp/dump-*.stderr.txt
- Không có bước nào ghi vào E:\Project\ERP, không ghi vào profile desktop, không git commit/push.

## 8. Đối chiếu tiêu chí nhiệm vụ t5

| Tiêu chí | Bằng chứng |
|---|---|
| Profile nháp riêng | C:\Users\thang\.dsh\profiles\agent-teams-test (mục 4.1, dump tests/tmp/dump-verify.yml) |
| Cài fork từ packages/dsh-agent-teams | dependencies."@nami/dsh-agent-teams" = link:E:/Project/Agent-Team/packages/dsh-agent-teams; row - id: agent-teams trong dump |
| Script cài lại nhanh | node tools/test/test-env.mjs → exit 0, mục 4.1 |
| Script smoke: phiên captain tối thiểu, đội 1 member, đọc team.json | node tools/test/smoke-team.mjs → PASS x2 (smoke1, smoke2), mục 4.2 |
| Người khác chạy lại chỉ bằng copy lệnh | mục 3 (2 lệnh + biến môi trường + tùy chọn) |
| Không ghi PASS khống | mục 6 ghi cả 2 lần FAIL nguyên văn; verdict do C1–C3 trên file thật, không do lời model |
| Không sửa lib/** | chỉ đọc packages/dsh-agent-teams/lib/{tool-names.js,tools.js} |

### 4.3 Kiểm chứng mã thoát thật (không đo qua pipe)

Hai lần chạy ở mục 4.1/4.2 được đo lại mã thoát bằng cách chuyển toàn bộ output ra file rồi đọc $?
(không đo qua tail/grep, vì $? khi đó là của tail/grep — đây là chỗ dễ ghi PASS khống):

~~~
cd E:/Project/Agent-Team
node tools/test/test-env.mjs > tests/tmp/run-env.log 2>&1; echo "test-env EXIT=$?"
#   test-env EXIT=0   (log: tests/tmp/run-env.log, 5/5 PASS row, summary: PASS)
node tools/test/smoke-team.mjs --team smoke3 > tests/tmp/run-smoke3.log 2>&1; echo "smoke EXIT=$?"
#   smoke EXIT=0      workspace tests/tmp/smoke-run/2026-10-31T13-45-07-092Z
#                     session-24bc4e0b-18e5-41e9-a201-09a538d7c7b0, id=smoke3 phase=staged,
#                     C1–C3 PASS, SMOKE_DONE smoke3
~~~

Tổng cộng: 3 lần smoke PASS (smoke1, smoke2, smoke3) — mỗi lần một workspace mới, không dùng lại state cũ.
