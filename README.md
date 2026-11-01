# @nami/dsh-agent-teams — Agent Teams cho DSH Harness

Plugin orchestration đa agent cho DeepSeek Harness: một **captain** (agent đang chạy) điều phối nhiều **member** chạy song song, mỗi member một phiên thật, có hợp đồng công việc, cổng chất lượng, hộp thư, audit trail và panel UI trong app.

Bản này là **fork viết lại** của `@nanmicoder/dsh-agent-teams@0.1.28`, giữ tương thích dữ liệu `team.json` của ERP và bổ sung: **đổi model cho member đang chạy**, **thêm member thủ công từ UI**, **payload status đầy đủ** (kể cả hồ sơ member đã xoá), **panel ba khối**.

| | |
|---|---|
| Gói | `@nami/dsh-agent-teams` · version `0.2.0-dev.0` · license MIT |
| Bộ byte phát hành | `dist/vong-26/nami-dsh-agent-teams-0.2.0-dev.0.tgz` |
| sha256 | `8ef366ede347eff4aa128d5216fe0600636fd89ba5a5ea011fe2c0abee6e3728` |
| Kích thước | 2 250 654 B · 133 entry (0 entry thư mục) |
| Kênh phân phối | GitHub Releases `vong-26` (không publish npm) |
| Verdict audit | PASS — "công bố có điều kiện", mốc `2026-11-01T11:14:09.560Z` |

## 1. Cài đặt

```bash
# 1) tải từ release (hoặc dùng bản local trong dist/vong-26/)
curl -L -o agent-teams.tgz \
  https://github.com/mrbean701/agent-teams-v/releases/download/vong-26/nami-dsh-agent-teams-0.2.0-dev.0.tgz

# 2) kiểm byte TRƯỚC khi cài — mọi tarball đều cùng tên, chỉ khác nội dung
node -e "const c=require('node:crypto'),f=require('node:fs');console.log(c.createHash('sha256').update(f.readFileSync('agent-teams.tgz')).digest('hex'))"
# kỳ vọng: 8ef366ede347eff4aa128d5216fe0600636fd89ba5a5ea011fe2c0abee6e3728

# 3) cài vào một profile DSH
cd C:/Users/<ban>/.dsh/profiles/<profile>
npm i --offline --legacy-peer-deps ../../agent-teams.tgz
```

Profile phải bật bundle trong `package.json`:

```json
{ "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@nami/dsh-agent-teams"] } } }
```

Sau khi đổi plugin, **khởi động lại app** thì GUI mới nạp bundle mới (panel là mã client đóng gói trong `lib/client.js`).

### Chạy thử không cần app

```bash
dsh --profile <profile> --json -   # headless một lượt, in JSONL ra stdout
```

`--profile desktop` bị app Electron quản lý riêng, CLI sẽ từ chối — dùng một profile sao để test.

## 2. Tính năng

### 2.1 Vòng đời team

- **Tạo team** ở hai chế độ: `automatic` (chạy ngay) hoặc `approval=required` (hai pha: roster + DAG nằm chờ, người dùng duyệt trong Web rồi `approve` mới spawn member).
- **Sửa kế hoạch nguyên tử** (`edit_plan`): một batch có thứ tự gồm `add_task` / `update_task` / `remove_task` / `update_member` / `remove_member` / `add_member`; sai một phép là **không phép nào** được ghi.
- **Tạm dừng / tiếp tục** (`resume` phải kèm lý do; không tái tạo task đã huỷ) và **kết thúc** (`delete`: ngắt member, đưa task về archive, giữ lịch sử).
- Trạng thái team: `staged` → `running` → `halted` (halt do lỗi/huỷ) → `deleted` (archive).

### 2.2 Member

- **Thêm member** (`add_member`): chọn `provider`/`model`, `reasoning_effort`, `tool_policy`, `executionPrompt` riêng; `activation` = `immediate` (spawn ngay) hoặc `on-task` (chờ task đầu tiên).
- **Xoá member an toàn** (`remove_member`): thu hồi attempt đang chạy, đưa task chưa xong về pool chung, ngắt phiên, đánh dấu `removed` — **hồ sơ vẫn còn** trong dữ liệu và vẫn hiện ở khối `Removed (N)` của status.
- **Đổi persona/role khi đang chạy** (`set_member_profile`): merge từng trường; thay đổi ghi vào `team.json` trước, có hiệu lực từ lần kích hoạt kế tiếp, **không cắt ngang** bước đang chạy; mỗi thay đổi ghi một dòng vào `docs/log/MEMBER-PROFILE.md`.
- **Đổi model khi member ĐANG CHẠY** (`set_member_route`) — tính năng chính của bản fork:
  - phiên đang chạy: bước kế tiếp dùng route mới, phiên ghi notice `[model changed: ...]`, **không mất việc đang làm**;
  - member chưa có phiên (`id` rỗng, ví dụ hồ sơ ERP): chỉ ghi **durable-only** + gửi qua hộp thư;
  - `start_if_needed: true` (opt-in, mặc định **false**) ⇒ **khởi động phiên ngay** theo route vừa đặt và trả về session id — đây là đường biến "đổi route" thành "đổi route VÀ chạy";
  - `fallback_provider`/`fallback_model`/`fallback_reasoning_effort`: route dự phòng khi provider chính chết; `fallback_clear` để bỏ;
  - `clear: true`: xoá override, member về route khai báo ban đầu;
  - route được **giữ qua cold resume** (ghi provider/model vào hồ sơ trước khi xoá override).
- **Đổi model của cả đội theo lô**: mỗi member một lời gọi; route được kiểm theo catalog của provider trước khi lưu.

### 2.3 Task, hợp đồng chất lượng và cổng review

- **Bảy loại task**: `work` (mặc định, không cổng), `requirements`, `implementation`, `verification`, `review`, `repair`, `integration`.
- **Hợp đồng bắt buộc** cho loại chất lượng: `objective`, `acceptance[]`, `inScope[]`, `outOfScope[]`; riêng `implementation`/`repair` phải có `verify[]` (lệnh chạy được); `review` phải trỏ `reviewedTaskId`; `repair` phải trỏ `sourceTaskId` (+ `sourceFindingIds`).
- **Nhận việc**: `claim_task` trả `attempt_id`; mọi cập nhật phải kèm `attempt_id` đó — attempt cũ bị thu hồi thì lệnh ghi bị từ chối (chống hai người ghi đè nhau).
- **Giao lại / tiếp quản**: `reassign_task` (retry, đổi người, hoặc captain tự làm) — attempt cũ bị revoke **trước** khi member cũ bị ngắt.
- **Nộp kết quả có bằng chứng**: `update_task` nhận `status`, `verdict` (`pass`/`needs_revision`/`reject`), `findings[]` (id, severity, problem, requiredFix, file, line), `acceptanceResults[]` (từng tiêu chí PASS/FAIL + bằng chứng), `commandsRun[]` (lệnh, exit code, output), `changedPaths[]`.
- **Kết quả terminal là bất biến**: vẫn có thể **bổ sung** `acceptanceResults`/`commandsRun`/`evidence_note` dưới dạng bằng chứng có ghi nguồn, nhưng **không đổi được verdict**.
- **Sửa hợp đồng có kiểm soát** (`amend_task`, chỉ captain): thay objective/acceptance/verify/inScope/outOfScope khi hợp đồng gốc bất khả thi; mọi lần sửa ghi vào `revisions` kèm giá trị cũ + lý do; **bị từ chối** khi task đã có review/requirements phán quyết.
- **Phụ thuộc**: task chỉ claim được khi mọi `dependencies` đã `completed`; `dependency-report` kiểm DAG và phát hiện task "completed dưới cha failed".
- **Hai hàng rào đồng thời**: `withTeamLock` (khoá ghi `team.json`) và `withPending` (chặn hai lần đổi route chồng nhau: `member model selection is already pending`). Bỏ **một** hàng rào vẫn an toàn; bỏ **cả hai** mới sinh hai phiên — bộ test `tests/t155` canh đúng **cặp** này.

### 2.4 Giao tiếp

- `send_message`: captain → member (guidance giữa lượt), member → captain (báo cáo), member ↔ member. Người nhận đang chạy nhận ở ranh giới bước kế tiếp; người nhận idle sẽ được đánh thức; tin nhắn **bền** trong hộp thư tới khi đọc.
- Hộp thư hiện trong status: `Captain inbox (N)` / `Member inbox (N)`, mỗi dòng `- [from] nội dung · at <ISO>`.

### 2.5 Quan sát: status, payload và panel

- `status` trả **snapshot đầy đủ**: team (id, name, phase, halted, escalated, loop_state), members (kể cả route hiện tại/override/fallback/last failure), tasks (attempt, attempt_id, findings_open, dependencies, output, evidence), hộp thư, coverage/delivery.
- **Hồ sơ member đã xoá không bị bỏ**: payload có `removed_count` + `removed_members[]` (kèm `runtime_setup`/`joined_at`/`route_override`) và text render có tiêu đề `Members (7 present + 7 removed):` + khối `Removed (7):`.
- **Panel trong app** (bố cục ba khối, từ vòng 23):

```
┌──────────────────────────────────────────────────────────────┐
│ header: team, phase, nút thu gọn                              │
├───────────────────────────┬──────────────────────────────────┤
│ cột TRÁI (member)         │ cột PHẢI (dependency)            │
│  captain (route)          │  DependencyMap: DAG task         │
│  ProgressOverview         │  (cuộn riêng, ngang + dọc)       │
│  [ + Add member ]  ← trên │                                  │
│  danh sách member         │                                  │
│  members toggle/tree      │                                  │
├───────────────────────────┴──────────────────────────────────┤
│ WorkspaceSummary (tuỳ chọn)                                   │
└──────────────────────────────────────────────────────────────┘
```

  - Nút **Add member** nằm **ngay trên** danh sách member, form mở tại chỗ (name, role, provider, model, reasoning effort).
  - Màn hẹp: `@container (width <= 560px)` xếp dọc; màn rộng: `@container (width >= 800px)` hai cột `minmax(280px,1fr) / minmax(0,2fr)`.
  - **Hai cột cao bằng nhau** bằng CSS thuần: `align-self: stretch; contain: size` trên cột phải, để chiều cao hàng do cột trái quyết định (không dùng `ResizeObserver`).
  - Cột phải cuộn riêng (`max-height: 56vh; overflow-y: auto`) nên DAG 138 task không đẩy list member ra khỏi màn hình.

### 2.6 Bền vững, lưu trữ và audit trail

- Dữ liệu team nằm ở `<workspace>/.agent-teams/<team>/team.json` (một tệp, JSON, ghi nguyên tử qua khoá `withTeamLock`).
- `delete` **không xoá dữ liệu**: chuyển sang `.agent-teams/archive/<team>/team.json` + ghi lịch sử hoạt động; đọc archive vẫn hiện trong panel.
- **Audit trail đổi model**: mỗi lần đổi route ghi một dòng vào `docs/log/MODEL-SWITCH.md` (from → to, nguồn, người đổi, kết quả `applied to the live session and saved` / `durable-only` / `refused`).
- **Snapshot** (`lib/snapshot.js`): tổng hợp trạng thái nhiều team (đang chạy + archive) cho panel: task hiện tại của từng member, route khai báo vs route đang dùng.
- **Event** `agent-teams/*` phát qua session event stream (host có thể chọn bỏ qua; panel đọc snapshot trực tiếp nên không phụ thuộc event).

### 2.7 Tương thích `team.json` của ERP

Đây là ràng buộc cứng: dữ liệu ERP thật (14 member / 107 task, 7 hồ sơ `removed`) **phải đọc được nguyên trạng**.

- **Chiều ĐỌC rộng**: trường lạ được bỏ qua; `provenance.source` chỉ cần đúng **hình dạng** (`/^[a-z][a-z0-9:_-]{0,63}$/u`) nên `source: 'erp'` đọc bình thường. Trước bản vá, **một** giá trị lạ làm cả 16 tool chết (`members[5] is not a valid member record`) — đã ghi ở `docs/log/BUG.md` BUG-026.
- **Chiều GHI chặt**: plugin chỉ ghi `source` thuộc `captain | http | profile`; giá trị khác bị từ chối **trước khi** vào khoá, kèm thông điệp nêu danh sách hợp lệ và "nothing was written".
- **Không mất dữ liệu khi render**: `runtime_setup` (persona + tool filter) và `joined_at` của hồ sơ đã xoá vẫn đi vào status.
- Bản copy để test luôn là **bản sao**: suite live chứng minh sha/bytes/mtime của `team.json` ERP **không đổi** sau khi chạy.

### 2.8 An toàn khi vận hành

- Guard chặn `start_if_needed` khi team `halted`, `staged`, hoặc member đang `stopping`.
- Mặc định `start_if_needed = false` được bảo vệ bằng 4 assert trong `tests/t155`.
- Mọi lệnh ghi kiểm `attempt_id`; lệnh tới muộn sau khi reassign bị từ chối.
- `check-contract` chặn brief sai **trước khi gửi**: verify trỏ tệp không tồn tại, card không có owner, review thiếu `reviewedTaskId`, `outOfScope` bao trùm `inScope`, deliverable nằm ngoài `inScope`.

## 3. Mười sáu tool

| Tool | Việc |
|---|---|
| `agent_teams_create` | Tạo team (+ `plan` roster & DAG nguyên tử, `approval: automatic \| required`) |
| `agent_teams_approve` | Duyệt & chạy kế hoạch đang chờ |
| `agent_teams_edit_plan` | Sửa roster/DAG theo batch nguyên tử |
| `agent_teams_add_member` | Thêm member (route, effort, tool policy, prompt, activation) |
| `agent_teams_remove_member` | Xoá member an toàn (giữ hồ sơ) |
| `agent_teams_set_member_route` | Đổi model đang chạy / route dự phòng / `start_if_needed` / `clear` |
| `agent_teams_set_member_profile` | Đổi role + execution prompt |
| `agent_teams_create_task` | Tạo task (7 kind; hợp đồng + phụ thuộc + người làm) |
| `agent_teams_claim_task` | Member nhận task của mình, lấy `attempt_id` |
| `agent_teams_update_task` | Cập nhật tiến độ / nộp bằng chứng / verdict / findings |
| `agent_teams_amend_task` | Captain sửa hợp đồng (có revisions ledger) |
| `agent_teams_reassign_task` | Retry / đổi người / captain tiếp quản |
| `agent_teams_send_message` | Nhắn captain ↔ member (bền, đánh thức người idle) |
| `agent_teams_status` | Snapshot đầy đủ + text render cho người đọc |
| `agent_teams_resume` | Tiếp tục team bị halt (kèm lý do) |
| `agent_teams_delete` | Kết thúc & archive team |

## 4. Cổng kiểm và bộ test

```bash
node tools/check-contract.mjs --state .agent-teams/<team> --task <id>   # hợp đồng task trước khi gửi brief
node tools/check-findings.mjs                                          # sổ finding khớp tài liệu audit
node tools/sweep-suites.mjs --list                                     # phân loại suite (LIVE/LEGACY)
node tools/sweep-suites.mjs --run                                      # chạy toàn bộ suite nhanh + bắt drift nguồn
node tools/dependency-report.mjs                                       # DAG task + sóng thực thi
node tools/check-logs.mjs                                              # 7 nhóm log có đủ mục theo vòng
node tools/check-doc-paths.mjs                                         # mọi đường dẫn trong tài liệu phải tồn tại
node tools/telegram-report.mjs --file <f> --silent                     # gửi báo cáo Telegram
```

Bộ test: **75 suite** trong `tests/` (9 LIVE · 8 pack · 49 nhanh, 12 ngoại lệ LEGACY có citation) + **10 suite** trong `packages/dsh-agent-teams/tests/` — `sweep-suites --list` báo tổng **85 suite**. Nhóm quan trọng:

| Suite | Canh điều gì |
|---|---|
| `tests/t98-render-coverage.mjs` | Mọi trường trong payload có mặt trong text render; witness theo **đường dẫn khoá**; `--strict` là cổng |
| `tests/t128-panel-order.mjs` | Bố cục panel (nguồn ↔ bundle ↔ sourcemap) + `contain: size` + parity CSS nhúng và module |
| `tests/t129-pins.mjs` | Pin sha/bytes của bundle trong `t10` khớp thực tế |
| `tests/t113-roster-assertion.mjs` | Tiêu đề `present + removed` đúng số, đúng thứ tự |
| `tests/t114-source-freeze.mjs` | 13 tệp `lib/**` không bị ghi trong lúc suite chạy |
| `tests/t115-check-contract.mjs` | Cổng hợp đồng (43 ca, gồm `--pre`) |
| `tests/t155-start-on-demand.mjs` | `start_if_needed`: 14 ca, gồm 2 hàng rào đồng thời |
| `tests/t59-erp-live-copy.mjs` | Boot thật trên bản sao ERP, chứng minh nguồn không đổi |
| `tests/t154-released-erp-roundtrip.mjs` | Cài từ tarball phát hành rồi boot ERP đầu-cuối (`--analyze` chấm lại bằng chứng) |

## 5. Build và phát triển

```bash
node build/build.mjs            # sinh lại lib/client.js + lib/client.js.map bằng esbuild 0.28.2
node --check lib/tools.js       # kiểm cú pháp
```

- UI viết trong `lib/client/ActivityPanel.js` (và các module con), **bundle `lib/client.js` + sourcemap là artefact sinh ra** — sửa UI thì phải chạy `build/build.mjs`, **không sửa tay bundle**. Sourcemap phải được sinh lại cùng bundle; bản sửa tay từng làm lệch cột (`mappings` cũ trỏ `392:179` thay vì `392:177`).
- `esbuild` chụp cwd lúc import: luôn đặt `absWorkingDir` (đã sửa trong `build/build.mjs`), nếu không đường dẫn trong comment bundle sai và bundle lệch byte.
- Mã host: `lib/tools.js` (16 tool + render), `lib/members.js` (spawn/route/mutex), `lib/state.js` (schema đọc/ghi `team.json`), `lib/quality-gates.js` (hợp đồng + scope), `lib/snapshot.js`, `lib/mailbox.js`, `lib/scheduler.js`, `lib/profiles.js`, `lib/web-routes.js`.

## 6. Quy trình phát hành

1. Sửa mã → cập nhật bảng đóng băng 13 tệp trong `tests/t59-erp-live-copy.mjs` **trong cùng task đã ghi `lib/**`**.
2. Chạy `sweep-suites --run` (kỳ vọng `FAIL=0`, riêng suite pack của vòng trước đỏ theo thiết kế → phải khai LEGACY kèm citation).
3. Pack bằng suite pack của vòng (`--fresh` hai lần cho **cùng sha + bytes**), analyze, rồi audit độc lập bằng một member khác: tự hash, giải nén so **từng entry**, repack, và ≥3 mutation trên **bản sao**.
4. Công bố: copy nguyên bản đã audit vào `dist/vong-N/` (**không pack lại**), tạo GitHub Release, tải lại từ URL và băm để chứng minh trùng.
5. Verdict audit gắn với **đúng bộ byte** đó; `lib/**` hoặc `package.json` đổi 1 byte là verdict hết hiệu lực.

## 7. Giới hạn đã biết

- `render` của `status` **không byte-exact** giữa hai phiên trên cùng dữ liệu (lệch ở blob `supplemental_evidence`) ⇒ đừng ghim golden theo toàn văn.
- Member có `id` bền mà không có phiên sống thì `set_member_route` chỉ **durable-only** (trừ khi dùng `start_if_needed`).
- Version giữ `0.2.0-dev.0`; **không publish npm** — phân phối qua GitHub Releases.
- Finding mức low chưa vá: `V26-F2` (sweep bắt nhầm `WARN` do test in), `V26-F3` (suite pack vòng cũ cần LEGACY citation), `V26-F5` (con số t98 tăng theo bề mặt tool), `V21-F1`/`V21-F5`.
- Sổ finding: xem `docs/audit/findings-register.md` — `OPEN` nghĩa là **không có câu ghi nhận đóng trong tài liệu**, không phải "lỗi còn tồn tại".

## 8. Cấu trúc repo

| Thư mục | Nội dung |
|---|---|
| `packages/dsh-agent-teams/` | mã plugin (host + client), `build/` pipeline esbuild, `tests/` suite của package |
| `tests/` | 75 suite kiểm chứng (`sweep-suites`) + `tests/tmp/` artefact của từng vòng |
| `tools/` | 8 cổng kiểm và tiện ích (bảng ở mục 4) |
| `docs/` | báo cáo chính, `docs/audit/` closure từng vòng + sổ finding, `docs/log/` 7 nhóm log, `docs/kiem-thu/`, `docs/huong-dan/`, `docs/bao-cao-telegram/` |
| `dist/` | tarball đã audit của từng vòng (`vong-19` … `vong-26`) |

## 9. Đọc thêm

1. `docs/bao-cao-agent-teams.md` — báo cáo tổng: bộ byte, bằng chứng, findings, điều kiện hết hiệu lực.
2. `docs/huong-dan/dung-voi-erp.md` — cài đặt và vận hành với dữ liệu ERP thật.
3. `docs/audit/findings-register.md` — sổ toàn bộ finding 26 vòng audit + trạng thái.
4. `docs/log/BUG.md` — các lỗi thật đã bắt: BUG-024 (payload đúng nhưng text bỏ sót trường), BUG-026 (một trường lạ làm cả 16 tool chết), BUG-027 (payload rơi hồ sơ `removed`), BUG-028 (nguồn bị ghi trong lúc suite chạy), BUG-029 (`.gitignore` nuốt pipeline build).
5. `docs/TODO.md` — 161 task dogfood với số đo từng task.

## 10. License

MIT.
