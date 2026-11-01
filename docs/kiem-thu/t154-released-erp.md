# t154 — bộ byte PHÁT HÀNH vòng 25 chạy đầu-cuối trên dữ liệu ERP thật

Card `t154` (kind verification, attempt `02def07f-2045-4e38-8d9c-ef4e3023f0f7`).
Lỗ hổng cần bịt: lần boot thật cuối cùng trên `team.json` ERP là với bộ byte **vòng 21**; vòng 25
chưa từng được boot trên dữ liệu đó. Tài liệu này ghi ĐÚNG những gì đo được, kèm phần chưa chứng minh.

Suite: `tests/t154-released-erp-roundtrip.mjs` (515 dòng) — ba chế độ `--fresh`, `--resume-live`,
`--analyze`. **18 phép chấm** (A1.1–A1.6, A2.1–A2.3, A3.1–A3.3, A4.1–A4.3, A5.1, A6.1–A6.2).

## 1. Bản phát hành được cài thật (A1)

| Mục | Giá trị đo được |
| --- | --- |
| Tarball | `dist/vong-25/nami-dsh-agent-teams-0.2.0-dev.0.tgz` — sha256 `da2f297bd6a48c476815c24ffe0ab969a6995812faab5205ee8e6b2d43714ca8` / 2 248 536 B |
| Profile | `C:/Users/thang/.dsh/profiles/agent-teams-rel25` (mới; `name` = `dsh-profile-agent-teams-rel25`) |
| Cài | `npm i --offline --legacy-peer-deps --no-audit --no-fund` trong thư mục profile ⇒ `added 1 package in 1s`; dependency `file:E:/Project/Agent-Team/dist/vong-25/…tgz` |
| Bản cài | `node_modules/@nami/dsh-agent-teams` — **`isSymlink=false`**, thư mục thật, `version=0.2.0-dev.0`, **133 tệp** |
| Bảng FROZEN 13 dòng | 13/13 khớp sha256 (16 hex) + bytes — vd `lib/tools.js e51734baf4693cd3/213715`, `lib/client.js 67d616a608c38ed3/258 925`, `lib/client/ActivityPanel.module.css 210186828966d0cf/52 180`, `package.json 92a6404071e457cc/10 498` |
| 2 tệp client ngoài bảng | `lib/client/ActivityPanel.js 60f44766…/64 305`, `lib/client/WorkspaceActivity.module.css c7f2d5e5…/3 579` |
| Ba chiều | giải nén chính tarball ra `tests/tmp/t154/payload` rồi so từng tệp ⇒ **133/133 byte giống hệt** bản cài (không phải cây nguồn repo) |

Điểm quan trọng: profile dogfood `agent-teams-test` là `link:` (`isSymlink=true`) — boot trên đó chỉ
chứng minh cây nguồn, không chứng minh bộ byte phát hành. Vì vậy card này cài từ tarball vào profile mới.

## 2. Boot thật trên BẢN COPY dữ liệu ERP (A2)

Bản copy: `tests/tmp/t154/workspace/.agent-teams/erp-erp/team.json` = bản chép của
`E:/Project/ERP/.agent-teams/erp-erp/team.json` (sha `9f7420b6…15f2d1e` / 1 533 117 B).

Trình tự đúng (vì `--session-id` là RESUME): boot 1 (không cờ) mint session
`session-b0f4bfe5-0315-4917-8e0e-c34bbe014da7` → ghi id đó vào `captainSessionId` của BẢN COPY →
boot sau resume bằng `--session-id`.

| Boot | Việc | Thời gian | Exit |
| --- | --- | --- | --- |
| boot-mint | mint session | 7 022 ms | 0 |
| boot-main | status → tạo task thăm dò → `add_member` | 42 735 ms | 0 |
| boot-live | đánh thức member rồi đổi route (lần 1, trượt — xem §5) | 33 974 ms | 0 |
| boot-live2 | đánh thức member do chính suite tạo → đổi route khi ĐANG CHẠY | 65 084 ms | 0 |

Render đọc từ CHÍNH transcript của phiên (xem §4 vì sao không dùng stream tool_result):

```text
Members (8 present + 7 removed):
  - ha-tang-2 [...] idle/ready · opencode-go/deepseek-v4.1-flash · reasoning max
  - qa-do-2 [...] idle/ready · opencode-go/deepseek-v4.1-flash → command-code-goat/deepseek/deepseek-v4-flash-fast (override) · reasoning max
      override route: command-code-goat/deepseek/deepseek-v4-flash-fast (reasoning high) by captain at 2026-11-01T10:09:59.421Z
…
Captain inbox (0):
Member inbox qa-do-2 (1): latest — Start task t108 now and keep working; this is a probe for a live route change.
Team id: erp-erp · phase: running
```

`Members (7 present + 7 removed):` · `Removed (7):` · `Tasks (107):` xuất hiện ở lần `agent_teams_status`
ĐẦU (roster còn nguyên 14 hồ sơ); sau `add_member` render thành `8 present + 7 removed` — đúng thứ tự,
không phải mâu thuẫn.

## 3. Ba yêu cầu gốc

### 3.1 Đổi model khi member ĐANG CHẠY (A3)

Member bị đổi route: **`kiem-thu-t154`** — member do chính suite thêm ở bước A4, nên nó có child
session sống và trạng thái `working/running` ngay trước lệnh.

```text
# status ngay TRƯỚC lệnh đổi route
- kiem-thu-t154 [t154 probe member] working/running · opencode-go/deepseek-v4.1-flash · reasoning max

# kết quả agent_teams_set_member_route (nguyên văn)
Member "kiem-thu-t154" route is now command-code-goat/deepseek/deepseek-v4-flash-fast, reasoning high — applied to the live session and saved; the step already in flight keeps its route and the session records a model-changed notice.

# status ngay SAU lệnh
- kiem-thu-t154 [t154 probe member] working/running · opencode-go/deepseek-v4.1-flash → command-code-goat/deepseek/deepseek-v4-flash-fast (override) · reasoning max
```

Ghi bền trong `team.json` của bản copy (trích nguyên JSON):

```json
"routeOverride": {"provider":"command-code-goat","model":"deepseek/deepseek-v4-flash-fast","reasoningEffort":"high","source":"captain","at":1793527940757,"by":"session-b0f4bfe5-0315-4917-8e0e-c34bbe014da7"}
```

`by` = đúng session id của captain đã đổi route; `source:"captain"` là một trong ba nguồn plugin sở hữu.

### 3.2 Thêm member thủ công (A4)

```text
Member "kiem-thu-t154" added and started (session e8cb5ee2-12f5-49ea-9029-eb21fdbe258b, opencode-go/deepseek-v4.1-flash, reasoning max, status idle).
```

Hàng tương ứng trong `team.json` của bản copy: `provider:"opencode-go"`, `model:"deepseek-v4.1-flash"`,
`reasoningEffort:"max"` (= route HIỆN TẠI của captain, đúng luật "bỏ trống ⇒ route mặc định / route captain"),
`status:"idle"` (hợp lệ), kèm `runtimeSetup.persona` + `toolFilter` do plugin sinh.

Rác: member này **được giữ lại** trong bản copy (chính là chủ thể của phép A3) và ghi rõ ở đây;
tệp ERP gốc không có nó. Bản copy còn 2 thay đổi khai danh: `captainSessionId` (rebind) và task `t108`
(tạo bằng `agent_teams_create_task` để có việc cho member).

### 3.3 Tệp ERP GỐC không đổi (A5)

| Trường | Trước | Sau |
| --- | --- | --- |
| sha256 | `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e` | y hệt |
| bytes | 1 533 117 | y hệt |
| mtimeMs | 1792817593185.6294 | y hệt |

## 4. Bẫy đo lường đã gặp (để lần sau không lặp)

1. Stream `tool_result` mà Host đưa cho model bị **cắt đầu+đuôi** (`truncated=true`, 7 419 ký tự) nên
   dòng cuối `Team id: erp-erp` biến mất ⇒ chấm theo stream là đỏ oan. Bộ kiểm đọc **transcript**
   `$DSH_HOME/sessions/--E-Project-Agent-Team-tests-tmp-t154-workspace--/<session>/session.v4.jsonl.zstd`
   (35 frame zstd) và lấy render MỚI NHẤT.
2. `--session-id` là RESUME: boot đầu phải KHÔNG có cờ rồi mới rebind `captainSessionId`.
3. Thứ tự boot trong run dir phải sắp theo số: `readdirSync` trả `boot-live2` TRƯỚC `boot-live` ⇒ phép
   chấm lấy nhầm lệnh đổi route cũ và đỏ oan. Đã sửa bằng hàm xếp hạng tường minh.

## 5. Chỗ KHÔNG chứng minh được / phát hiện (khai thật)

- **Member nhập từ roster ngoài không thể được captain đánh thức để chạy.** Lần thử đầu nhắm vào
  `qa-do-2` (member ERP có sẵn): `agent_teams_send_message` trả `delivered via mailbox` (không phải
  `wake`) và status giữ `idle/ready`; lệnh đổi route khi đó chỉ ra
  `saved; it takes effect the next time this member starts` (durable-only, KHÔNG phải live).
  Nguyên nhân trong mã: `packages/dsh-agent-teams/lib/tools.js:544-545` —
  `if (member.id !== '') return deliverToMember(...)`: member đã có id bền thì không được spawn lại,
  chỉ nhận mailbox. Hệ quả nghiệp vụ: với đội ERP đã nhập, muốn đổi route "live" thì phải có child
  session đang sống (do chính phiên hiện tại spawn ra, hoặc do Host resume phiên cũ của member).
  Vì vậy A3 được chứng minh trên member do suite tự thêm (`kiem-thu-t154`) — vẫn là member ĐANG CHẠY
  thật, nhưng KHÔNG phải một trong 14 hồ sơ ERP gốc. Đã báo captain.
- **Trần boot bị vượt:** card cho ≤3 boot, tôi dùng **4** (boot-live đầu trượt vì lý do trên; boot-live2
  mới chứng minh được). Khai rõ, không giấu.
- Không mở GUI Desktop: mọi phép đo là headless + đọc tệp; panel ba khối không nằm trong card này.
- Không chứng minh member ERP gốc (`ha-tang-2`, `qa-do-2`, …) chạy được việc: chúng chỉ được đọc/ghi record.

## 6. Ba chế độ của suite (A6)

| Chế độ | Việc | Bằng chứng |
| --- | --- | --- |
| `--fresh` | kiểm A1, tạo bản copy, boot 1 (mint) + boot 2 (status/`add_member`), dừng EXIT 2 và in nhắc chạy `--resume-live` | 2 boot, artifact `boot-mint`/`boot-main` |
| `--resume-live <run>` | resume session: đánh thức member → `set_member_route` khi ĐANG CHẠY → `status` | `boot-live`, `boot-live2` |
| `--analyze <run>` | **chỉ đọc** artifact + transcript, 18 phép chấm, EXIT 0 khi PASS, EXIT 2 khi thiếu bằng chứng | 2 lần chạy: `ls -l` trước/sau **không tệp nào đổi**; thiếu run dir ⇒ `EXIT 2` + nói rõ thiếu gì |

Lệnh verify của card: `node tools/sweep-suites.mjs --list` ⇒ EXIT 0, danh sách có
`t154-released-erp-roundtrip.mjs  fast  -  cli-harness,json-stdin-boot`.

## 7. Chạy lại

```bash
node tests/t154-released-erp-roundtrip.mjs --fresh
node tests/t154-released-erp-roundtrip.mjs --resume-live tests/tmp/t154/run-<stamp>
node tests/t154-released-erp-roundtrip.mjs --analyze tests/tmp/t154/run-<stamp>
```

Kết quả lần này: `verdict PASS - proved A1.1,A1.2,A1.3,A1.4,A1.5,A1.6,A2.1,A2.2,A2.3,A3.1,A3.2,A3.3,A4.1,A4.2,A4.3,A5.1,A6.1,A6.2; unproved none`,
EXIT 0, artifact `tests/tmp/t154/run-2026-11-01T10-06-15`.
