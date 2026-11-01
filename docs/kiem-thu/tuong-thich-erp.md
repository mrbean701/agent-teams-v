# Tương thích dữ liệu ERP — chứng minh bằng thực nghiệm (task t20)

Tác giả: nghien-cuu · Ngày 2026-10-31 (attempt 1, attempt_id `4cc2d713-b6e4-4983-8b93-ffe574a06e0b`)
Mục tiêu gốc được kiểm: **#4 — giữ tương thích dữ liệu đội ERP hiện có, không phải di trú.**
Phương pháp: chạy chính `readTeam`/`readTeamSync`/`writeTeam`/`readMailbox` của bản `@nami/dsh-agent-teams` trên **bản copy** của dữ liệu thật; không sửa gì dưới `E:\Project\ERP`.

## 0. Kết luận trước, bằng chứng sau

| Câu hỏi của đề bài | Kết luận | Bằng chứng |
|---|---|---|
| Nạp được dữ liệu cũ? | Có, không cần sửa một byte nào | C2, C4 (`readTeam` trả về đúng 14 member, `deepEqual` với file nguồn) |
| Đếm đủ 14 member? | Đúng 14 (7 `removed` + 7 còn sống) | C4, C5 |
| Giữ `status: removed`? | Giữ nguyên 7/7, kèm route cũ `opencode-go-new/minimax-m3.1-flash-free` | C5 |
| Giữ `reasoningEffort`? | Giữ `max` trên 14/14 | C6 |
| Dữ liệu cũ có `routeOverride` không? | Không có, và bản mới **không tự thêm** | C7 (`routeOf` trả `origin: 'declared'` cho mọi member) |
| Bản mới có ghi lại file không? | Không: chỉ đọc | C1, C3, C16, C18 (sha256 nguồn và bản copy bất biến) |
| Task/attempt đang mở có mất? | Không: 107/107 task bằng từng byte, `t107` vẫn `in_progress` với `attempt: 2` và `attemptId` gốc | C8 |
| Có phải chạy migration? | Không | C2, C8, C14, C15 |

**Kết quả lần chạy cuối: 15/15 case PASS, exit 0** (lệnh và output đầy đủ ở mục 6).

## 1. Đầu vào và môi trường

- Nguồn: `E:\Project\ERP\.agent-teams\erp-erp\team.json` — 1.533.117 byte, sha256 `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e`.
- Nguồn thứ hai (cùng đội): `…\erp-erp\inbox\*.jsonl` — 15 file, 682 dòng.
- Bản chạy: `packages/dsh-agent-teams/lib/state.js` + `…/members.js` của repo này, Node v26.7.0, không có harness, không có mạng.
- Bản copy làm việc: `tests/tmp/t20-erp-compat/**` (bị xoá và tạo lại mỗi lần chạy).

### Dữ liệu thật đọc được (không suy đoán)

| Khối | Số lượng | Chi tiết |
|---|---|---|
| Member | 14 | 7 `status: removed` trên `opencode-go-new` / `minimax-m3.1-flash-free`; 7 còn sống (6 `idle`, 1 `working`) trên `opencode-go` / `deepseek-v4.1-flash` |
| `reasoningEffort` | 14/14 | tất cả `max` |
| Task | 107 | 95 `completed`, 7 `cancelled`, 4 `failed`, 1 `in_progress` |
| Task có `attemptId` | 101 | `t107` đang mở: `attempt: 2`, `attemptId` gốc còn nguyên |
| `routeOverride` | 0 | dữ liệu sinh trước khi tính năng đổi route tồn tại |
| Inbox | 15 file / 682 dòng | `readMailbox` parse 682/682, **0 dòng hỏng** |
| Trường lạ trong member | có | `runtimeSetup` (persona + toolFilter), `executionPrompt` — vẫn qua được validate và còn nguyên sau khi đọc |

## 2. (1) Nạp, đếm, giữ trạng thái — C2/C4/C5/C6/C7

- `readTeam(stateRoot, 'erp-erp')` (`packages/dsh-agent-teams/lib/state.js:203`) đọc `join(stateRoot, teamId, 'team.json')` (:205), `JSON.parse` (:206) rồi `coerceTeamState` (:207). File cũ qua được cả ba bước.
- `assert.deepEqual(loaded.members, sourceTeam.members)` PASS ⇒ **không một trường nào bị mất, bị đổi kiểu hay bị chuẩn hoá lại** (kể cả `runtimeSetup`, `executionPrompt`, `joinedAt`, `status`).
- 7 member `removed` giữ đúng `provider: opencode-go-new`, `model: minimax-m3.1-flash-free`; 7 member còn sống giữ `opencode-go` / `deepseek-v4.1-flash` (C5).
- `reasoningEffort: 'max'` còn trên 14/14 member (C6).
- Không member nào có `routeOverride` sau khi đọc (C7) ⇒ **bản mới không tự bịa metadata route cho dữ liệu cũ**; `routeOf(member)` trả `origin: 'declared'` cho cả 14, tức hành vi đúng bằng bản cũ.
- Gate validate mới cho `routeOverride` nằm ở `packages/dsh-agent-teams/lib/state.js:664-670` (`isTeamMember`) và chỉ kích hoạt **khi trường có mặt**, nên dữ liệu vắng trường đi qua không đổi.

## 3. (2) Không ghi lại file — C1/C3/C16/C18

| Phép đo | Trước | Sau | Kết luận |
|---|---|---|---|
| sha256 **file nguồn** (ERP) | `9f7420b6…15f2d1e` | `9f7420b6…15f2d1e` | không đổi ⇒ bản fork không chạm vào checkout ERP |
| sha256 **bản copy** | `= sha nguồn` (copy 1:1) | `= sha nguồn` | đọc xong vẫn y nguyên ⇒ `readTeam` chỉ đọc |
| Nội dung thư mục state root sau khi đọc | `['erp-erp']` | `['erp-erp']` và bên trong chỉ `['team.json']` | không sinh file phụ (không lock, không backup, không migration marker) |

Ghi chú về đề bài: mục (2) viết "sha256 file nguồn trước/sau (phải **khác** vì không động vào)" — đây là nhầm dấu. Bất biến đúng của một lần đọc là **hash KHÔNG đổi**. Test kiểm đúng chiều đó (C1 so hash nguồn trước khi copy với hash bản copy; C18 đo lại hash nguồn ở cuối lần chạy) và cả hai đều PASS. Nếu đề bài muốn nói "hash phải khác" theo nghĩa khác, xin xác nhận lại — nhưng một file bị đọc mà hash đổi thì chính là bằng chứng ngược lại điều cần chứng minh.

## 4. (3) Hai ca biên của trường mới — C9/C10

- **Hợp lệ:** thêm vào **bản copy** cho member `qa-do-2` một `routeOverride = { provider: 'opencode-go', model: 'deepseek-v4.1-pro', reasoningEffort: 'high', source: 'captain', at: 1792664000000, by: 't20' }`.
  `readTeam` nhận (không ném lỗi), `member.routeOverride` còn nguyên từng trường, `member.provider`/`member.model` **không bị đổi** (`opencode-go` / `deepseek-v4.1-flash`), và `routeOf(member)` trả `origin: 'override'`, `model: 'deepseek-v4.1-pro'`, `reasoningEffort: 'high'` ⇒ override thắng route khai báo, đúng thứ tự thiết kế.
- **Hỏng:** cùng member, `routeOverride = { model: 'deepseek-v4.1-pro', source: 'captain', at: … }` (thiếu `provider`) ⇒ cả `readTeam` **và** `readTeamSync` đều ném `invalid AgentTeams state in team "erp-erp"` (message khớp `/invalid AgentTeams state in team/`). Tức dữ liệu dị dạng bị chặn ở biên durable, không âm thầm đi vào runtime.

## 5. (4) Trả lời thẳng ba câu vận hành

**a) Có phải sửa `team.json` cũ khi ERP chuyển sang bản `@nami` không? — KHÔNG.**
File cũ qua `readTeam` nguyên vẹn (C2/C4/C6/C8): không thiếu trường bắt buộc nào, không có trường lạ nào bị từ chối, không cần thêm `routeOverride`, không cần đổi `provider`/`model`.

**b) Có mất task/attempt đang mở không? — KHÔNG.**
`loaded.tasks` bằng từng byte với `sourceTeam.tasks` (107/107). Task đang mở `t107` (assignee `qa-do-2`) giữ `status: 'in_progress'`, `attempt: 2`, `attemptId` gốc, `objective`/`inScope`/`acceptance`/`verify`/`deliverables` và `updatedAt`; 101 task có `attemptId` đều còn. Bản mới còn ghi lại được y hệt: `writeTeam` rồi `readTeam` lần nữa cho `deepEqual` với dữ liệu gốc (C14) ⇒ **lần ghi đầu tiên của bản mới không làm hỏng dữ liệu**.

**c) Có cần chạy migration không? — KHÔNG.**
Không có script, không có cờ, không có bước "upgrade". Bằng chứng: (i) `team.json` nạp trực tiếp (C2); (ii) round-trip ghi/đọc không đổi nội dung (C14); (iii) 682/682 dòng inbox cũ parse được bằng `readMailbox`, **0 dòng hỏng**, và `readUnreadMailbox` đọc được trạng thái `deliveredAt`/`readAt` của dữ liệu cũ (C15) ⇒ mailbox cũng không phải migrate.

### Bốn lưu ý vận hành (không phải điều kiện của tính tương thích)

1. **Sao lưu một lần trước lần ghi đầu tiên.** Nội dung sau khi bản mới ghi là tương đương (C14), nhưng `writeTeam` serialize lại bằng `JSON.stringify(state, null, 2)` (`packages/dsh-agent-teams/lib/state.js:251-253`), nên `git diff`/`diff` có thể ồn ào dù dữ liệu không đổi nghĩa. Một bản copy `team.json` là đủ.
2. **Chuỗi `provider`/`model` là dữ liệu mờ (opaque) với plugin.** Plugin không kiểm tra provider có tồn tại trong profile; nếu profile mới không cấu hình `opencode-go` / `opencode-go-new` thì member sẽ hỏng ở tầng spawn/resume của host, **không phải** lỗi tương thích dữ liệu. Đây là **GIẢ THUYẾT**: t20 không chạy harness thật để xác nhận thông điệp lỗi của host.
3. **7 member `removed` vẫn nằm trong file** — đúng như dữ liệu gốc. Muốn dọn thì dùng công cụ của plugin, **không sửa tay** `team.json` (xem `docs/van-hanh/khuyen-nghi-update-member.md`).
4. **Đổi model member đang chạy thì không sửa `team.json`.** Dùng `agent_teams_set_member_route` (ghi `routeOverride`, spine bất biến) — lý do và hậu quả nếu làm sai ở tài liệu nêu trên.

## 6. Lệnh chạy thật và output

```
cd E:\Project\Agent-Team
node tests/t20-erp-compat.mjs
#   (hoặc trỏ nguồn khác: node tests/t20-erp-compat.mjs --source <path-to-team.json>)
```

Output (rút gọn, giữ nguyên tên case):

```
ok 1 - C1 source checkout is untouched: sha256 identical before the run
ok 2 - C2 readTeam() loads a legacy erp-erp team.json without migration
ok 3 - C3 readTeam() is read-only: the copy sha256 is unchanged after loading
ok 4 - C4 all 14 members load, and the member records are byte-for-byte equal
ok 5 - C5 the 7 removed members keep status "removed" and their old route
ok 6 - C6 reasoningEffort "max" survives on every member; unknown fields survive too
ok 7 - C7 legacy data has no routeOverride, and readTeam() does not invent one
ok 8 - C8 all 107 tasks survive untouched, including the in_progress one and its attempt
ok 9 - C9 a valid routeOverride added to the copy is accepted and wins in routeOf()
ok 10 - C10 a routeOverride without provider is refused as invalid state
ok 11 - C14 a fork write + re-read round-trip preserves every member and task
ok 12 - C15 every legacy inbox/*.jsonl line parses; no migration of the mailboxes is needed
ok 13 - C16 reading created nothing in the scratch state root but the team file
ok 14 - C17 this test file carries no absolute drive path
ok 15 - C18 the source checkout sha256 is still identical at the end of the run

# 15/15 passed, 0 failed
# source: E:\Project\ERP\.agent-teams\erp-erp\team.json
# sha256(source): 9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e
# scratch: E:\Project\Agent-Team\tests\tmp\t20-erp-compat
EXIT=0
```

Lệnh đo bổ sung (đọc trực tiếp, chỉ đọc — không ghi):

```
cd E:\Project\Agent-Team && node -v   # v26.7.0
# sha256 nguồn trước và sau các lần chạy đều = 9f7420b6…15f2d1e
# 15 file inbox / 682 dòng: readMailbox parse 682/682, malformed 0
```

Ghi chú kỹ thuật về file test: `tests/t20-erp-compat.mjs` tự định vị bằng `import.meta.url` (`repoRoot = resolve(testsDir, '..')`), tìm nguồn theo thứ tự `--source` → `AGENT_TEAMS_ERP_TEAM` → `../ERP/.agent-teams/erp-erp/team.json` → `../../ERP/…` → `tests/tmp/erp-source/…`; không chứa đường dẫn tuyệt đối (case C17 tự kiểm điều này bằng cách quét chính source của nó, needle được dựng lúc chạy để không tự khớp). Exit code: 0 = PASS hết, 1 = có case fail, 2 = không tìm thấy nguồn.

## 7. Phần chưa chứng minh (nói rõ để không lấn sang kết luận khác)

1. **Chưa chạy host thật.** Chưa resume một member ERP trong phiên DSH thật, nên chưa chứng minh đường `descriptor guard` + `installModelSelection` hoạt động với dữ liệu này; phần đó thuộc t1 (hợp đồng host) và t3/t18 (route smoke).
2. **Chưa kiểm đồng thời (concurrency).** Không mô phỏng cảnh plugin cũ đang ghi `team.json` trong khi bản mới đọc; `withTeamLock`/`atomicWriteText` có xử lý, nhưng t20 không đo.
3. **Chưa kiểm các thư mục phụ khác** của đội (snapshot/archive/retired index) — trong `erp-erp` hiện chỉ có `team.json` và `inbox/`, nên đây là phạm vi đầy đủ của dữ liệu ERP thực tế.
4. **`opencode-go`/`opencode-go-new` có tồn tại trong profile hay không** — chưa kiểm (GIẢ THUYẾT ở mục 5, lưu ý 2).

## 8. Regression ledger cho module dữ liệu (theo skill `module-regression`)

Skill `module-regression` yêu cầu mỗi module có ba trường: downstream consumers, regression acceptance command, propagation rule. Áp cho module bị thay đổi trong đợt này:

**Module — `packages/dsh-agent-teams/lib/state.js`** (lớp durable: `readTeam`/`readTeamSync`/`writeTeam`/mailbox)

- *Downstream consumers*: `packages/dsh-agent-teams/lib/members.js:21`, `packages/dsh-agent-teams/lib/scheduler.js:17`, `packages/dsh-agent-teams/lib/tools.js:6`, `packages/dsh-agent-teams/lib/mailbox.js:2`, `packages/dsh-agent-teams/lib/snapshot.js:15`, `packages/dsh-agent-teams/lib/capabilities.js:5`, `packages/dsh-agent-teams/lib/profiles.js:11`, `packages/dsh-agent-teams/lib/index.js:29`.
- *Dependency evidence* (quét lại được): `grep -n "state\.js" packages/dsh-agent-teams/lib/*.js` → đúng 8 file import ở trên. Hai file trong `lib/client/` (`packages/dsh-agent-teams/lib/client/index.js:4`, `packages/dsh-agent-teams/lib/client/WorkspaceActivity.js:8`) chỉ import `./workspace-state.js` — bản sao phía trình duyệt, **không** phụ thuộc `lib/state.js`; đánh dấu `unverified` cho mọi kiểm thử node nhưng không chặn, vì không có cạnh phụ thuộc thật.
- *Regression acceptance command*: `node tests/t20-erp-compat.mjs` — đạt khi exit 0 và dòng cuối `# 15/15 passed, 0 failed`.
- *Propagation rule*: sửa `coerceTeamState` (`packages/dsh-agent-teams/lib/state.js:207`) hoặc gate `isTeamMember` (`:648-683`, gồm khối `routeOverride` `:664-670`) ⇒ phải chạy **cả** `node tests/t20-erp-compat.mjs` **và** `node tests/t3-route-smoke.mjs` (vì `routeOf` ở `packages/dsh-agent-teams/lib/members.js:317-348` đọc thẳng dữ liệu đã chuẩn hoá); chỉ sửa thông điệp lỗi/đường đọc không đổi shape ⇒ chạy t20 là đủ.

*Test-ID*: bộ này dùng mã cục bộ `C1..C18` in ra trong output TAP; dải `TG-TEST-xx` toàn repo (`docs/log/TEST.md`) do member kiểm thử sở hữu nên t20 **không cấp phát** id mới để tránh trùng — nếu sau này muốn đưa vào registry thì đăng ký tiếp từ `TG-TEST-25`.

## 9. Truy vết

- Câu 3 của t1 (`docs/nghien-cuu/hop-dong-host.md`): `readTeam` giữ trường lạ, chỉ từ chối khi kiểu sai — thực nghiệm này xác nhận trên dữ liệu thật.
- Thiết kế v1 (`docs/thiet-ke/thiet-ke-v1.md`) mục 6: bảng tương thích bốn chiều R1-R6; t20 đóng phần dữ liệu (R1/R2) và mailbox.
- Validate `routeOverride` ở biên durable: `packages/dsh-agent-teams/lib/state.js:664-670`.
- Thứ tự ưu tiên route: `packages/dsh-agent-teams/lib/members.js:317-348` (`routeOf`).
- File test: `tests/t20-erp-compat.mjs` (15 case).
