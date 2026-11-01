# CHECK — checklist kiểm tra theo mốc

Nguồn: mục 5 của MASTER TASK. Chỉ ghi ĐẠT khi có bằng chứng thật.

| Mốc | Nội dung | Trạng thái | Bằng chứng |
|---|---|---|---|
| 5.1 sau phân tích | Đọc hết mã plugin, lập bản đồ kiến trúc | ĐẠT | bao-cao-agent-teams.md mục 1-4 + Phụ lục A |
| 5.1 sau phân tích | Xác định điểm chèn route switch | ĐẠT | members.js:612-613; model-selection.js (host) 3 hook |
| 5.1 sau phân tích | Kế hoạch staged đủ thành viên + DAG | ĐẠT | .agent-teams/nami-agent-teams/team.json (7 member, 13 task) |
| 5.1 sau phân tích | Người dùng duyệt kế hoạch trên Web | CHƯA | Đang chờ duyệt — chưa được coi là đã duyệt |
| 0 (chuẩn bị) | Bản sao fork trùng khớp bản gốc trước khi sửa | ĐẠT | 127/129 file trùng sha256; 2 file đổi có chủ đích là package.json và cordis.patch.yml |
| 0 (chuẩn bị) | Gói fork tự khai báo đúng danh tính mới | ĐẠT | package.json name=@nami/dsh-agent-teams version=0.2.0-dev.0; cordis.patch.yml trỏ đúng tên mới |

## 2026-10-31T13:32:57.026Z — Review t1 (nghien-cuu) → **VERIFIED**
| Điểm kiểm | Bằng chứng captain tự đọc (không tin báo cáo) | Kết quả |
|---|---|---|
| Tài liệu tồn tại | `docs/nghien-cuu/hop-dong-host.md` = 365 dòng / 33.070 bytes, có mục giả thuyết §8 | PASS (báo cáo ghi 364 dòng, lệch 1 dòng — không ảnh hưởng) |
| `startActivation` là API duy nhất | `dsh-subagent/lib/types/index.js:136 async startActivation(spec) {`; cũng có ở `lib/index.js:3036` | PASS |
| `registerContinuableSetup` không tồn tại ở host 0.2.1-rc.5 | quét toàn bộ 25 file .js của `dsh-subagent` (v0.2.1-rc.5), 0 hit | PASS |
| `readTeam` giữ trường lạ | `lib/state.js:740 const coerced = { ...value, tasks };` | PASS |
| Bẫy kiểu dữ liệu làm chết team.json | `lib/state.js:209 throw new Error(\`invalid AgentTeams state in team "${teamId}": ...`)` | PASS |
| Chuỗi dispose khi reload plugin | `lib/harness-compat.js:175 ctx.effect(() => {` | PASS |
| CLI thật tồn tại | `C:\Users\thang\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd` = true | PASS |

**Ghi chú kỹ thuật của captain**: `rg` KHÔNG đọc được bên trong `app.asar` (lỗi `os error 3`) vì asar là file nén do Electron patch `fs`; muốn kiểm tra host phải quét bằng `fs.readdirSync/readFileSync`. Đây là bẫy tái phát — đã ghi vào HANDLE.

## 2026-10-31T13:47:04.182Z — Review t2 (nghien-cuu) → **VERIFIED**
- `docs/thiet-ke/thiet-ke-v1.md`: 432 dòng / 36.369 bytes / 27 heading.
- Neo chèn `routeOverride` sau `packages/dsh-agent-teams/lib/types/types.d.ts:241` — dòng 241 đúng là `fallbackActive?: boolean;` ⇒ chèn ngay sau hợp lý.
- Neo validate `lib/state.js:660` — dòng 660 là `&& isOptionalString(value['activeModel'])` ⇒ đúng vùng `isTeamMember`, thêm optional field là hợp lệ.
- Guard bất biến `lib/members.js:557 if (selection !== undefined && (descriptor.agentProvider !== durableMember?.provider || descriptor.agentModel !== durableMember?.m...` — khớp nguyên văn tài liệu.
- Đủ 4 file zone D6 tồn tại: `lib/snapshot.js`, `lib/events.js`, `lib/event-types.js`, `lib/types/event-types.d.ts`.

## 2026-10-31T13:47:04.182Z — Review t5 (kiem-thu) → **VERIFIED** (captain chạy lại, không tin báo cáo)
- `node tools/test/test-env.mjs` → EXIT=0, `=== summary: PASS (0 failing step(s)) ===`, 5/5 row PASS (`row agent-teams mounted`, `declares stateDir .agent-teams`, `row credentials enabled`, `row llm-pi-ai declares providers`, `row agent-default-model pins a provider`); dump 857 dòng tại `tests/tmp/dump-verify.yml`.
- `node tools/test/smoke-team.mjs` → EXIT=0, `=== smoke verdict: PASS ===`; team.json thật trên đĩa: `name smoke1`, `phase staged`, `planReviewState awaiting_review`, member `worker-1` route `opencode-go/deepseek-v4.1-flash`; artifact `tests/tmp/smoke-run/2026-10-31T13-46-30-315Z/result.json`.
- Kết luận: hạ tầng test chạy được THẬT (boot phiên headless + gọi model + ghi team.json), không phải mock. Đây là bằng chứng cho phép các task sau tự kiểm bằng lệnh.

## 2026-10-31T13:57:02.431Z — Review t3 (dev-runtime-flash) → **REVIEW / chưa VERIFIED**
| Điểm kiểm | Bằng chứng captain tự kiểm | Kết quả |
|---|---|---|
| Syntax 3 file | `node --check` lib/members.js, lib/state.js, lib/snapshot.js | PASS (OK cả 3) |
| Neo `routeOf` | members.js:316 `export function routeOf(member) {` | PASS |
| Neo `selectionFromMember` | members.js:349 `function selectionFromMember(member) {` | PASS |
| Guard còn nguyên văn | members.js:621 `throw new Error(\`agent-teams: saved model route for member "${memberName}" does not match its subagent descriptor\`)` | PASS |
| Spawn thăng cấp override | members.js:915-917 `member.provider = llmSelection.provider; member.model = llmSelection.model;` | PASS |
| Ghi đĩa TRƯỚC khi switch RAM | members.js:1066 `await writeTeam(stateRoot, team);` rồi :1069 `const switched = member.id === '' ? false : selections.setLiveRoute(...)` | PASS |
| Audit kép | members.js:1073 `appendTeamEvent(..., 'agent-teams/member-route-changed', {` + :1092 `await appendRouteChangeAudit(...)` | PASS |
| **Bằng chứng 'smoke 18/18 PASS'** | quét 26 file .mjs/.cjs/.js trong workspace (bỏ node_modules, .agent-teams, lib plugin): **0 file** chứa `setMemberRoute`/`setLiveRoute`/`routeOverride`; `tests/` chỉ có `tmp/` | **FAIL — không tái lập được** |

Kết luận: mã đúng theo thiết kế nhưng bằng chứng test không tồn tại trong repo ⇒ mở task **t14 (rework)**: commit `tests/t3-route-smoke.mjs` + chạy lại + dán output. Không chuyển t3 sang VERIFIED trước khi có output tái lập được.

## 2026-10-31T14:00:02.350Z — Review t14 + chốt t3 → **VERIFIED**
- `tests/t3-route-smoke.mjs` tồn tại, 283 dòng; grep `E:/` `C:/` `/e/Project` = **0 hit**, dùng `import.meta.url` ⇒ không phụ thuộc bản nháp.
- Captain tự chạy `node tests/t3-route-smoke.mjs` → **18/18 passed, 0 failed**, exit 0; temp workspace `...\Temp\dsh-win-bash-4880-...\t3-route-smoke-GTFPox`.
- Chín case trọng yếu đã thấy trong output: `setMemberRoute` từ chối stopping/removed/unknown-model mà **không đổi file** (ok 14), audit row mỗi lần đổi (ok 15), `readTeam` nhận `routeOverride` hợp lệ (ok 16) vẫn nhận legacy (ok 17), `readTeam/readTeamSync` từ chối mọi dạng hỏng (ok 18).
- Kết luận: t3 và t14 chuyển **VERIFIED**. Đây là bằng chứng tái lập được, chạy bằng một lệnh, đúng thứ trước đó thiếu.

## 2026-10-31T14:08:11.972Z — Review t4 (dev-tools-flash) → **VERIFIED (mã)** + 2 task bổ sung
- Captain tự chạy: `node --check` lib/tools.js, lib/index.js, lib/tool-names.js → `ALL_CHECK_OK`; `node tests/tmp/t4-control-plane-smoke.mjs` → **19/19 cases passed**, exit 0.
- Neo khớp: `tools.js:502 const kickMember = ... scheduler.kickMember(...)`; tool mới `tools.js:1226 ctx.tools.register(defineTool({` → `:1282`; `tools.js:2711 memberModel: config.memberModel` + `:2712 memberLlmProvider: config.memberLlmProvider` (đúng 2 việc chặn tích hợp đã chuyển); `tools.js:2740 async function addMemberNow(ctx, config, memberSelections, captain, request, signal, kick)`; wrapper `tools.js:2861 async function setMemberRoute(ctx, config, memberSelections, captain, request, signal)`.
- HTTP/trần: `index.js:348 if (action === 'add_member') {`, `:369 if (action === 'set_member_route') {`; `index.js:103 maxManualMembers: z.natural().min(1).default(12)`, `:132`, `:145 if (resolved.maxManualMembers < resolved.maxMembers) {`.
- `tool-names.js:4` có `'agent_teams_set_member_route'` trong TEAM_TOOL_NAMES.
- Thiếu sót còn lại (không phải sai): bằng chứng nằm ở `tests/tmp` (có 1 đường dẫn tuyệt đối) ⇒ mở **t16** rework; và `activateMemberNow` chưa được export nên add_member trên đội chạy trả `spawned=false` ⇒ mở **t15**.

## 2026-10-31T14:12:43.761Z — Review t16 → **VERIFIED**
- `tests/t4-control-plane-smoke.mjs` tồn tại, 434 dòng, grep `E:/` `C:/` `/e/Project` = **0 hit**, dùng `import.meta.url`; bản `tests/tmp/t4-control-plane-smoke.mjs` đã xoá.
- Captain tự chạy 2 lần: từ repo root → `19/19 cases passed, EXIT=0`; từ `cd /c/Users/thang` gọi đường dẫn tuyệt đối → cũng `19/19 cases passed`, exit 0 ⇒ chứng minh tự định vị thật, không phải chạy nhờ cwd.
- Xác nhận phạm vi: t16 không sửa mã nguồn (chỉ tests/** + docs/log/**), đúng yêu cầu. t4 nay có bằng chứng tái lập được ⇒ **t4 + t16 chốt VERIFIED**.

## 2026-10-31T14:18:41.023Z — Review t15 → **VERIFIED**
- `lib/members.js:961 export async function activateMemberNow(ctx, config, selections, captain, team, member, resolvedFilter, initialPrompt, signal) {`; guard staged `:975 throw ... is still staged; member ... starts only after approval`; route qua `selectionFromMember` rồi `:991 await validateMemberLlmSelections(ctx, [selection], signal);` TRƯỚC khi spawn; `:997 await spawnMember(..., resolvedFilter, relaxableDeny);`.
- Bất biến t2 giữ nguyên: guard `lib/members.js:621` vẫn nguyên văn (`throw new Error(\`agent-teams: saved model route for member "${memberName}" does not match its subagent descriptor\`)`), không bị chạm.
- Captain tự chạy: `node --check lib/members.js` → CHECK_OK; `node tests/t15-activate-member.mjs` → `# 17/17 passed, 0 failed`, EXIT=0 (388 dòng, 0 đường dẫn tuyệt đối). Hồi quy: `tests/t3-route-smoke.mjs` 18/18; `tests/t4-control-plane-smoke.mjs` 19/19.
- Case quyết định: `ok 15` add_member báo spawned=true; `ok 16` không có export ⇒ spawned=false (fallback scheduler còn nguyên); `ok 17` start lỗi ⇒ spawned=false + spawnError.
- Thiếu sót đã mở **t17**: `members.js:996` fail-loud với mọi member có toolPolicy vì `memberRuntime` (tools.js:2702-2713) thiếu bảng toolPolicies; đường scheduler (tools.js:217) lại nới deny được ⇒ cần trả lại parity.

## 2026-10-31T14:22:50.379Z — Review t17 → **VERIFIED**
- `lib/tools.js:2716 toolPolicies: config.toolPolicies,` — đúng một field mới trong `memberRuntime`, phần còn lại của tools.js không đổi.
- `lib/members.js:999-1003` ba nhánh: không policy ⇒ `undefined`; thiếu bảng ⇒ `[]` (fail-loud giữ nguyên); có bảng ⇒ `memberSpawnRelaxableDeny(optionalToolPolicy(config.toolPolicies, member.toolPolicy), true)`.
- Captain tự grep parity: biểu thức y hệt ở `lib/members.js:1003` và `lib/tools.js:217` ⇒ cùng input cho cùng tập nới, đây là điều tôi yêu cầu.
- Captain tự chạy: `node --check` members.js + tools.js → CHECK_OK; `node tests/t15-activate-member.mjs` → `# 21/21 passed, 0 failed`; hồi quy `tests/t3-route-smoke.mjs` 18/18, `tests/t4-control-plane-smoke.mjs` 19/19.
- Chấp nhận có ghi chú: case parity so khớp NGUYÊN VĂN chuỗi trong hai file, nên một refactor hợp lệ (tách helper) sẽ làm test đỏ dù hành vi không đổi. Bù lại có case hành vi thật (attempts()===2, deny mất 'subagent' còn 'send_message'). Để audit vòng 1 (t6) phán về độ bền của cách khoá này.

## 2026-10-31T14:33:49.703Z — Review t7 → **VERIFIED**, và hạ mức rủi ro của audit #3 (tôi tự đọc mã)
- Sản phẩm: `docs/van-hanh/khuyen-nghi-update-member.md` 92 dòng, có mục 'Vị thế tài liệu' trỏ về thiết kế/audit/t1 thay vì chép lại — đúng ý tôi.
- Tôi đọc trực tiếp mã để kiểm chứ không tin trích dẫn: `lib/tools.js:573 if (!staged && mutations.some(mutation => mutation.action !== 'update_task')) {` → `:574 throw new Error('a running team only permits update_task edits to pending, never-started tasks; ...')`; và `lib/tools.js:579 if (member.id !== '')` → `:580 throw new Error(\`staged member "${member.name}" was already spawned\`)`.
- Kết luận quan trọng: `update_member` KHÔNG thể chạm member đã spawn qua bất kỳ đường plugin nào (running team bị chặn ở :573-574; staged mà member đã spawn bị chặn ở :579-580). Vì vậy rủi ro audit #3 chỉ còn qua sửa tay team.json hoặc công cụ ngoài ⇒ hạ xuống mức 'không tới được bằng tool/HTTP', vẫn giữ tài liệu vì đó là đường người dùng hay nghĩ tới.
- `lib/index.js:396-398` có comment cảnh báo sẵn ('change its route with set_member_route instead — that path keeps the descriptor guard consistent on the next cold resume'), tức quyết định này đã được cài trong mã, không chỉ trong tài liệu.
- Thiếu sót nhỏ member tự báo: tài liệu chưa nằm trong mục lục nào ⇒ gộp vào t13.

## 2026-10-31T14:34:43.039Z — Review t8 → **VERIFIED** (có mutation test của chính captain)
- `lib/tools.js:1271 by: captain.session.id,` (kèm comment lý do ở :1269-1270) và `lib/index.js:382 by: 'web:' + sessionId,` (:380-381 comment). Không sửa `lib/members.js` — đúng zone.
- **Mutation test tự tay**: tôi xoá dòng `by: captain.session.id,` khỏi `lib/tools.js` rồi chạy lại harness → `FAIL H1 the route tool records the captain session in routeOverride.by and in the audit log`, `21/22 cases passed`; khôi phục file (sha256 khớp lại `f1e06dea1738e822`) → `22/22 cases passed`, `t3` `18/18`. ⇒ Test H1 KHÔNG rỗng, nó bắt được đúng lỗi audit nêu.
- Test F2 đã được siết đúng hướng: tên mới 'attempts an immediate start on a running team and keeps the row when the start fails' + assert `spawnError` khớp `/activateMemberNow/` và `/does not support continuable members/`; thêm F3 (`activation=on-task` không thử start) và F1 assert roster staged không có `spawnError`. Từ 19 → 22 case.
- Phát hiện phụ member báo (tôi xác nhận là đúng): `appendRouteChangeAudit` (`lib/members.js:1035-1049`) append DÒNG BẢNG vào `docs/log/MODEL-SWITCH.md`, trong khi file trong repo là văn xuôi ⇒ chạy thật sẽ nối rác vào tài liệu. Quyết định của captain: KHÔNG đổi mã; chuyển toàn bộ văn xuôi sang `docs/log/MODEL-SWITCH-notes.md`, trả `MODEL-SWITCH.md` về đúng header máy đọc, và ghi quy tắc vào `docs/quy-tac-du-an.md`. Rẻ hơn sửa mã và giữ nguyên định dạng thiết kế đã chốt.

## 2026-10-31T14:40:18.706Z — Review t18 → **VERIFIED** (E2E thật, tôi tự chấm lại artifact)
- Tôi chạy lại KHÔNG tốn quota: `node tests/t18-hot-switch-e2e.mjs --analyze tests/tmp/e2e-hotswitch/2026-10-31T14-34-11` → exit 0, **9/9 PASS**, verdict `proved C1..C9; unproved none`.
- Hai case quyết định của tính năng, đúng thứ tôi cần: `PASS C7 — the FIRST request after the notice ran the new route (previous request ran the old one)` và `PASS C8 — member kept its open attempt across the switch and finished that same attempt`. C9 chứng minh route bền qua tiến trình lạnh (đọc bằng chính `readTeam` của plugin).
- `tests/t18-hot-switch-e2e.mjs` 456 dòng, 0 đường dẫn tuyệt đối, có `--analyze <dir>` để chấm lại artifact cũ ⇒ kiểm chứng độc lập được, không phải chỉ tin log.
- Trung thực của member: lần chạy 1 FAIL là do BỘ PHÂN TÍCH của test sai (tool trả text, audit theo workspace, transcript nén zstd nhiều frame), không phải plugin; họ sửa test rồi chấm lại artifact cũ 9/9 và chạy sạch lại. Đây là cách xử lý đúng — không phải sửa plugin cho khớp test.
- Tôi chuyển khối 'Bằng chứng E2E' khỏi `docs/log/MODEL-SWITCH.md` sang `MODEL-SWITCH-notes.md` (member đã ghi đúng nguồn nhưng file đó là file máy đọc theo quy tắc tôi vừa chốt; giữ luật thay vì ngoại lệ).
- 3 phát hiện member nêu: (1) audit ghi theo WORKSPACE (`lib/members.js:1008 join(workspace, ...ROUTE_AUDIT_PATH)`) ⇒ hành vi ĐÚNG thiết kế, không sửa; với ERP thì audit rơi đúng `E:\Project\ERP\docs\log\` — ghi tài liệu ở t13. (2) Phiên LLM lạnh không thấy đội (`agent_teams_status` → 'you do not lead or belong to any active team yet') ⇒ mọi kiểm 'sau cold start' phải đọc state, ghi vào HANDLE. (3) `reasoning_effort` vào request/header nhưng chưa chứng minh provider tôn trọng ⇒ để mở, ghi giới hạn.
## 2026-10-31T14:45:11.422Z — Kiểm script đồ thị phụ thuộc
- `node --check tools/dependency-report.mjs` → OK; `node tools/dependency-report.mjs` → `tasks=19 realEdges=15 derivedEdges=8 waves=9 problems=0`.
- Dữ liệu khớp `agent_teams_status`: t14..t18 deps=[] nhưng có cạnh provenance; t11 đã được thêm deps [t10,t18,t19].
- Script tự báo lỗi nếu: chu trình, cạnh trỏ tới task không tồn tại, hoặc task completed khi cha chưa completed.
## 2026-10-31T14:56:28.192Z — Review t19 → **VERIFIED** (tôi kiểm lại bằng hash, không tin báo cáo)
- `sha256(lib/tools.js) = f1e06dea1738e822227fabf200231f6cff000227900279bf57917b7a6b21c61b` — trùng đúng hash tôi đã ghi sau mutation test của t8 ⇒ file đã được khôi phục nguyên vẹn, không còn dòng `by:` bị xoá.
- Tôi tự chạy lại 2 suite: `node tests/t4-control-plane-smoke.mjs` → **22/22 passed**, `node tests/t3-route-smoke.mjs` → **18/18 passed, 0 failed** ⇒ state sau audit khớp state đã VERIFIED.
- `docs/audit/dong-finding-vong-1.md` 200 dòng: F1/F2/F3 đều 'Da dong' kèm mutation test riêng (F1: xoá `by` ⇒ `4c24f8c8...` + H1 FAIL `the durable override names the captain session` actual undefined; khôi phục ⇒ hash gốc + 22/22. F2: thêm `prepareContinuable` vào stub ⇒ F2 FAIL).
- Kết luận: 3 findings audit vòng 1 ĐÓNG, có người thứ hai (audit-kimi) xác nhận độc lập ≠ implementer (dev-tools-flash).
## 2026-10-31T15:03:47.064Z — Review t20 → **VERIFIED** (tôi tự chạy, không đọc log)
- `node tests/t20-erp-compat.mjs` → **15/15 passed, 0 failed**, exit 0. Các case đọc từ output thật: `ok 9 C9 a valid routeOverride added to the copy is accepted and wins in routeOf()`, `ok 10 C10 a routeOverride without provider is refused as invalid state`, `ok 11 C14 a fork write + re-read round-trip preserves every member and task`, `ok 12 C15 every legacy inbox/*.jsonl line parses`, `ok 13 C16 reading created nothing in the scratch state root but the team file`, `ok 14 C17 this test file carries no absolute drive path`, `ok 15 C18 the source checkout sha256 is still identical at the end of the run`.
- Nguồn ERP KHÔNG bị chạm: `sha256(E:\\Project\\ERP\\.agent-teams\\erp-erp\\team.json) = 9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e` (1 533 117 bytes) — đo lại SAU khi chạy test, vẫn y nguyên.
- `tests/t20-erp-compat.mjs` 301 dòng, **0** đường dẫn tuyệt đối trong file (tự tìm nguồn qua tham số `--source`).
- **Lỗi của tôi trong đề bài, member bắt đúng**: tôi viết 'sha256 nguồn trước/sau phải KHÁC'; bất biến đúng của một lần đọc là hash KHÔNG đổi. Member kiểm đúng chiều và ghi chú vào doc §3 thay vì làm theo câu sai. Ghi nhận: brief của captain cũng phải bị đối chứng, không được thực thi mù.
- Hệ quả cho mục tiêu #4: ERP **không cần sửa team.json, không cần migration, không mất attempt/task đang mở** (107/107 task, t107 giữ in_progress/attempt 2). Giới hạn còn mở (doc §7): chưa resume member ERP trên host thật; chưa kiểm concurrency khi plugin cũ đang ghi song song; snapshot/archive của erp-erp chưa có để kiểm.
## 2026-10-31T15:09:19.752Z — Review t21 → **VERIFIED** (tôi tự chấm lại artifact)
- `node tests/t21-add-member-e2e.mjs --analyze tests/tmp/e2e-addmember/2026-10-31T15-04-30` → exit 0, **verdict PASS — proved A1..A7; unproved none**.
- Bằng chứng thật: A2 tool trả `Member "worker-b" added and started (session b8c43161-...` ⇒ `spawned=true` + session id; A4 member mới **nhận task thật** (t2 completed/attempt 1, changedPaths ["member-b.md"]); A5 `Error: team "e2e-addmember" is at its manual member cap (2)`; A6 `Error: member name "worker-a" has already been used`; A7 HTTP thật tới `/plugins/dsh-agent-teams/plan` → 200 `{ok:true, member_name:"bob"}` và trùng tên → 409.
- **Sai sót của tôi về detector**: tôi grep đường dẫn tuyệt đối và ra 2 hit, nhưng đó là URL `http://127.0.0.1:<port>/plugins/...` (regex `[A-Za-z]:/` khớp `http:`), KHÔNG phải đường dẫn ổ E:/C:. File test đúng là không có đường dẫn tuyệt đối.
- Xác nhận claim của member bằng mã: `lib/index.js:178-187` đăng ký route web LAZY, chỉ khi có `WEB_SERVER_KEYS` + `WORKSPACE_KEYS`, nên profile headless là tool-only (`lib/index.js:176-177` comment: 'In a webless profile the plugin stays tool-only and never blocks boot'); A7 vì vậy phải dùng host tổng hợp + socket thật. Trong profile desktop (có web GUI) route /plan có thật.
- Giới hạn còn mở: spawn qua HTTP chưa chứng minh (stub provider của host tổng hợp không hỗ trợ continuable ⇒ `spawnError: provider "spawn" does not support continuable members`); đường duyệt 2 pha `approval:"required"` + `agent_teams_approve` mới có test giả lập; scheduler tự gán task khi captain không gọi create_task chưa kiểm; interrupt/stopping chưa kiểm.
## 2026-10-31T15:41:48.490Z — Review t9 attempt 2 = **REJECT**
- Kết luận KHONG KHA THI sai tiền đề. Đối chứng của tôi: `app.asar/dsh/node_modules` TỒN TẠI; `packages/dsh-agent-teams/node_modules` có esbuild 0.28.2 + tsdown + tsc + react/react-dom + lightningcss + @deepseek-ai/*; `.bin` có esbuild/tsdown/tsc/rolldown; `build/build.mjs` là script build thật (esbuild cjs + css-module-plugin + wrapper `window.__ModuleLoader__.load({id: pkg.name, factory})`) và tự ghi `lib/client.js`; `build/client.js`, `build/client.js.map`, `build/test-load.html` có sẵn.
- Tôi bundle tay: `esbuild lib/client/index.js --bundle --format=esm --jsx=automatic --external:react ...` → exit 0, 156 360 B JS + 14 178 B CSS trong 14ms (2 warning CSS).
- Phần ĐÚNG của báo cáo: sourcesContent 18/18, 15/15 module JS trùng từng byte với `lib/client/*.js`, external đúng 3 (`react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`).
- `agent_teams_reassign_task` từ chối task completed (`completed task t9 is immutable and cannot be reassigned`) ⇒ mở **t22** rework với deps [t9]; t10 thêm phụ thuộc t22.

## 2026-10-31T15:44:48.455Z — Review t22 = **PASS** (captain tự chạy)
- `sha256(lib/client.js)` trước = `2dc9436ef076da73a38d43eedfdeb7e18ac2e6c12c21ccb21acd04c566dc4bdd` (177 333 B) = `tests/tmp/t22/client.js.orig`.
- Tự chạy `cd packages/dsh-agent-teams && node build/build.mjs` → `esbuild errors: 0 / warnings: 0 / Wrote lib/client.js`; sha256 sau = **đúng giá trị cũ** ⇒ tái lập tuyệt đối. `node --check build/client.js` = CHECK_RAW_OK.
- Parity: `conversation.chat.node` 2 lần, `agentTeamsCardDefinition` 2 lần, `TEAM_TAB_ID` trong bundle = `@nanmicoder/dsh-agent-teams/activity`.
- Kết luận: bundle dựng lại được và tái lập ⇒ gỡ chặn t10; t9 chuyển CANCELLED (thay bằng t22).

## 2026-10-31T16:28:51.059Z — Review t10 = **PASS** (captain tự chạy lại) + browser smoke
- `node build/build.mjs` → errors 0; sha256 trước = sau = `01aadd77…7178` (191 298 B) ⇒ bundle == sources.
- `node tests/t10-ui-bundle-smoke.mjs` → 22/22 passed.
- Browser thật: `file:///E:/Project/Agent-Team/packages/dsh-agent-teams/build/test-load.html` → `Overall: PASS`, `inject contents: ["uiConversation","slots","sessions","locale","modelDirectories","layout"]`, console rỗng.
- Khoảng trống chuyển t11: click GUI thật, POST thật 409, nhánh StagedModelPicker.
- Vi phạm quy trình nhỏ: 23 lệnh > trần 16 (member tự báo).

## 2026-10-31T16:41:57.928Z — Review t11 = **PASS** (captain tự chấm lại artifact)
- `node tests/t11-http-e2e.mjs --analyze tests/tmp/e2e-t11http/2026-10-31T16-36-54-566Z` → exit 0, `PASS — proved C1..C8 (11 checks, 0 failed)`.
- HTTP thật: set_member_route 200 (`applied:"durable-only"`), audit row, add_member 200, trùng tên 409, vượt trần 409 (`manual member cap (3)`), cold read-back đúng.
- Đối chứng: `lib/members.js:722-736` setLiveRoute trả false khi registry không có agent ⇒ 'durable-only' đúng bản chất 2 tiến trình; `lib/state.js:814` cho phép `member.id === ''` và `lib/members.js:911` gán id khi spawn ⇒ `member_id:""` không phải bug.
- Tồn đọng chuyển t12: live-qua-HTTP (lập luận cấu trúc, chưa có bằng chứng trực tiếp); spawn-qua-HTTP.

## 2026-10-31T17:04:23.415Z — Review t13 = **KHÔNG ĐẠT** (mở t25)
- Đạt: link 48/48 missing=0 (captain tự đếm), phạm vi sạch, README 114 dòng, di-migrate 115 dòng có mục 6/7.
- L1: §1 báo cáo nói fork đã 'thay v0.1.28 trong profile' — chưa cài (BUG-003) ⇒ overclaim.
- L2: §4 có hàng `tests/t17-*.mjs 21/21` nhưng file không tồn tại; bằng chứng t17 ở trong `tests/t15-activate-member.mjs`.
- L3: §4 còn ghi 3 findings hồ sơ 'đang xử lý' trong khi đã đóng.

## 2026-10-31T17:05:24.042Z — Review t24 = **PASS** (captain tự chạy: 12/12 exit 0)
- 401/403/503/409 đúng nguyên văn; 405 có `allow: POST` + body rỗng (`lib/index.js:275-279`); 413 ở biên 1 000 000 B (`lib/web-routes.js:9,36-37`); fence chạy trước method check; gate hỏi 1 lần/request.
- Giới hạn thật: chưa kiểm ruột Connection của host (token/cookie/CSRF); không phủ TLS/origin/replay.

## 2026-10-31T17:08:37.862Z — Review t25 = **PASS**
- L1/L2/L3 đều sửa đúng (đọc nguyên văn `docs/bao-cao-agent-teams.md:8-9`, `:52`).
- `tools/check-doc-paths.mjs` là CỔNG THẬT: mutation test của captain (chèn link hỏng vào `docs/van-hanh/README.md`) → `EXIT=1`, khôi phục → `EXIT=0`.
- Bài học: muốn phá script quét tài liệu thì phải chèn vào file ĐƯỢC QUÉT, không phải `tests/tmp/`.
- ĐÍNH CHÍNH: hash `01aadd77…7178` dùng trong ghi chú t25 là SAI thời điểm (t23 đang dựng lại bundle song song); đo lại `d28532e7…` / 191 153 B. Bài học: không dùng hash tuyệt đối làm bằng chứng 'không đổi' khi có member khác ghi cùng thư mục.

## 2026-10-31T17:11:22.018Z — Review t23 = **PASS**
- Build 2 lần cùng hash: `lib/client.js` `d28532e7…`/191 153 B, `lib/client.js.map` `70cb6e90…`/322 244 B.
- 0 đường dẫn ổ đĩa trong bundle; map 19 sources, `MemberControls` idx 12, `sourcesContent` bằng byte với nguồn.
- `node --check` OK; t10 smoke 22/22; Chromium `test-load.html` = PASS, console rỗng.
- Dương tính giả khi quét map bằng regex văn bản thô (lesson cho t26) — phải parse JSON.

## 2026-10-31T17:17:11.578Z — Khép hồ sơ sau closure
- N1: `docs/bao-cao-agent-teams.md:51` hash cũ `01aadd77…`/191 298 B → `d28532e7…cc91`/191 153 B; thêm hàng `tests/t24-auth-fence.mjs | 12/12`; đoạn số liệu §4 cập nhật 26 task / 25 cạnh thật / 11 sóng / messageId 5..17.
- N2: `docs/TODO.md` đếm lại `VERIFIED=25 · CANCELLED=1 · IN_PROGRESS=0 · OPEN=0 · REVIEW=0`.
- `node tools/dependency-report.mjs` → `tasks=26 realEdges=25 derivedEdges=9 waves=11 problems=0`; `node tools/check-doc-paths.mjs --summary` → `files=4 paths=45 paths_missing=0 links=39 links_missing=0`, EXIT=0.

## 2026-10-31T17:28:15.811Z — t29 (captain tự kiểm)
- Tarball thật: `tests/tmp/t29/nami-dsh-agent-teams-0.2.0-dev.0.tgz` 2 188 799 B sha256 `ac84c73a94d20507381723cafed4cb10923cd30104a424f08bf86469c7fbfdd7`; `tar -tzf` 133 entry; 6/6 tệp bắt buộc có; `node_modules`=0, `package/tests`=0; 79 entry dưới `package/lib/`.
- Cài thật vào `C:/Users/thang/.dsh/profiles/agent-teams-pack-test/node_modules/@nami/dsh-agent-teams`: `isSymbolicLink=false`, realpath trong profile, `@nami/dsh-agent-teams 0.2.0-dev.0`.
- Hash 3 chiều TRÙNG: tarball payload == bản đã cài == nguồn (`tools.js f1e06dea…c61b`, `members.js 9095fb8c…31330`, `client.js d28532e7…5cc91`).
- C4 đối chứng file thật: `run-2026-10-31T17-25-29/.agent-teams/packtest/team.json` có routeOverride `by:session-f425ec9b-…`; `docs/log/MODEL-SWITCH.md` đúng 1 hàng dữ liệu.
- C5: `package-lock.json` resolved = `file:E:/Project/.../nami-dsh-agent-teams-0.2.0-dev.0.tgz` ⇒ offline, không chạm registry.
- Captain chạy lại `node tests/t29-pack-install.mjs --analyze tests/tmp/t29/run-2026-10-31T17-25-29` → `verdict PASS - proved C1,C2,C3,C4,C5; unproved none`, EXIT=0. Profile `desktop` vẫn 0.1.28.

- **t30 (verify captain, 2026-10-31)** — `node tests/t30-status-last-failure.mjs` → 8/8 PASS; mutation `code:''` → 4/8 fail; khôi phục → 8/8, sha `7fde7bbc…`; hồi quy t4 22/22 · t28 20/20 · t3 18/18 · `node --check` OK; `lib/client.js` không đổi. Tệp đã đổi tên `t31-*` → `t30-*` cho khớp id ledger (BUG-009).

- **t27 (verify captain, 2026-10-31)** — `node tests/t27-rollback.mjs --analyze tests/tmp/e2e-t27rollback/2026-10-31T17-30-13-440Z` → exit 0, `verdict PASS — 16/16 check PASS`. Captain tự đo lại: profile `agent-teams-test` vẫn symlink → `E:/Project/Agent-Team/packages/dsh-agent-teams`, manifest chỉ còn `@nami`; `dsh plugin --help` in 'forwarding the remaining arguments to pnpm' ⇒ 2 bước đầu của tài liệu rollback SAI (mở t32). Artifact team `t27` = 1 member với `routeOverride{command-code-goat, deepseek/deepseek-v4.1-flash}` do 0.2.0 ghi, 0.1.28 đọc được.

- **t32 (verify captain, 2026-10-31)** — `node tools/check-doc-paths.mjs --summary` → `files=4 paths=46 links=40 paths_missing=0 links_missing=0` EXIT 0; `sha256(tools.js)=7fde7bbc…` và `sha256(client.js)=d28532e7…` khớp hash đóng băng ⇒ code freeze giữ được, member không chạm mã. Đọc nguyên văn `docs/van-hanh/di-migrate-va-rollback.md:76-142`: 4 bước mức tệp + 4 cạm bẫy + §5.3 đo `sha256(team.json) 20f5c166…` trước=sau. Captain phát hiện §7 dòng auth fence còn SAI (đòi test 401 trong khi t24 đã phủ 12/12) ⇒ mở t33.


- **t31 (verify captain, 2026-10-31T17:48:15.232Z)** — chấp nhận verdict audit closure vòng 3 sau khi tự đối chứng: tự giải nén `packages/dsh-agent-teams/tests/tmp/t29/nami-dsh-agent-teams-0.2.0-dev.0.tgz` → 4/7 tệp DIFF đúng như audit (tools/members/state/snapshot), 3 tệp SAME (client.js, map, package.json); tự chạy lại 8 suite + 4 `--analyze` (t3 18/18 · t4 22/22 · t15 21/21 · t20 15/15 · t24 12/12 · t28 20/20 · t30 8/8 · t27 16/16 · t11/t18/t21/t29 PASS). Hash đóng băng khớp ⇒ không writer khác. ⇒ F1→t35, F4→t34.
- **t33 (verify captain, 2026-10-31T17:48:15.232Z)** — `node tools/check-doc-paths.mjs --summary` → `files=4 paths=47 links=40 paths_missing=0 links_missing=0` EXIT 0; grep câu 'không có test cho 401' → 0 hit; `sha256(lib/tools.js)=7fde7bbc…` + `sha256(lib/client.js)=d28532e7…` không đổi ⇒ member không chạm mã.
- **Hồ sơ sau t31/t33 (captain)** — `docs/TODO.md` 35 hàng (VERIFIED=32 · CANCELLED=1 · OPEN=2); provenance +3 cạnh (t31→t34, t31→t35, t34→t35) ⇒ `node tools/dependency-report.mjs` → `tasks=35 realEdges=37 derivedEdges=23 waves=16 problems=0`; `check-doc-paths --summary` → `paths=48 links=41` 0 thiếu, EXIT 0.


- **t34 (verify captain, 2026-10-31T17:50:40.720Z)** — 7/7 tiêu chí, captain tự đo: build ×2 giữ nguyên hash `lib/client.js 0026ac70…2d89`/193 129 B + `lib/client.js.map 28facff2…a032`/326 147 B (trước t34: `d28532e7…`/191 153 B + `70cb6e90…`/322 244 B); `node --check` OK; map `JSON.parse`: 19 sources / badSources 0 / badSourcesContent 0; quét thô bundle `[A-Za-z]:[\\/]` = 0 hit; `sourcesContent[12]` = byte trên đĩa + chứa `data-member-failure`; `node tests/t10-ui-bundle-smoke.mjs` → **25/25** (case mới: 'healthy and corrupt members add no failure row'); Chromium `build/test-load.html` → `Overall: PASS`, console 0 entry; `TEAM_TAB_ID` không đổi; 4 tệp đóng băng KHÔNG đổi.
- **Hồ sơ sau t34** — `docs/bao-cao-agent-teams.md`: mục 2.1 hash bundle cập nhật (`0026ac70…`), hàng t10 → 25/25, dòng số liệu → `VERIFIED=33 · IN_PROGRESS=1 (t35) · OPEN=0`. t35 đã được scheduler gán + captain gửi brief kèm bảng 7 hash đóng băng.


- **t35 (verify captain, 2026-10-31T17:54:44.563Z)** — tarball `c3e3e88a…2745`/2 191 904 B/133 entry; `tar -tzf` sau strip CRLF: 6/6 entry bắt buộc, 0 `node_modules`/`package/tests`/`tgz` lồng/`.pid`; captain tự giải nén + hash 3 chiều → **7/7 SAME** (mismatches 0); lstat không symlink, lock `file:`; tự chạy `node tests/t35-pack-repack.mjs --analyze …` → `7/7 checks passed`, EXIT 0 (C7 gọi thật 2 tool, `looksMissing=false`); `desktop` vẫn 0.1.28, `agent-teams-pack-test` vẫn `f1e06dea`/178 475.


- **t36 (verify captain, 2026-10-31T18:00:13.444Z)** — audit vòng 4 verdict PHÁT HÀNH ĐƯỢC; captain tự chạy lại `t3` 18/18 · `t10` 25/25 · `t30` 8/8 · `t20` 15/15 (in sha ERP `9f7420b6…`) · `t35 --analyze` 7/7 EXIT 0; đọc `docs/audit/closure-vong-4.md` 80 dòng; xác nhận F1 bằng mã (`:273`/`:277`); xác nhận F4 (2 tarball cùng tên: `ac84c73a`/2 188 799 B vs `c3e3e88a`/2 191 904 B) và đã ghi `SUPERSEDED.md`; `docs/TODO.md` 36 hàng, header khớp.

- **Dogfood GUI thật (captain, 2026-10-31, ngoài DAG)** — profile `agent-teams-gui` dựng từ `--from-default-profile web` + junction tới `packages/dsh-agent-teams` (`0.2.0-dev.0`); boot `--port 19488 --host 127.0.0.1 --no-open`; Web GUI thật: 0 lỗi console, 0 mã 4xx/5xx, `/plugins/dsh-agent-teams/state` **10/10 = 200**, bundle gộp 200 **có `@nami/dsh-agent-teams/client.js`**; `node fetch` không cookie → `401 {"error":"unauthorized"}`, `GET /?token` → 303 + `set-cookie`, có cookie → 200 với `teams:2` (`ERP/erp-erp` 7 member/107 task; `Agent-Team/nami-agent-teams` 5 member/36 task, deliverable `true`). Chi tiết: `docs/kiem-thu/gui-phien-song.md`. Chưa bấm được 2 control trong panel (cần session sống có team); server test ĐÃ tắt (cổng 19488 `ECONNREFUSED`).
| t40 | 2026-10-31 | ERP proposal (chỉ đọc) | captain tự chạy: 20/20 PASS exit 0; tool exit 0 identical=true; sha256 ERP 9f7420b6…f2d1e / 1 533 117 B TRÙNG baseline; đối chứng `lib/members.js:1178-1181` xác nhận guard removed | VERIFIED |
| t37 | 2026-10-31 | revert route (clear) | captain: t37 14/14, t3 18/18, t4 22/22, t28 20/20, t30 8/8 (EXIT=0 đo trực tiếp); mutation A (no-op delete) ⇒ 9/14 FAIL 5 case; mutation C (tắt cả 2 guard) ⇒ FAIL e1; khôi phục trùng sha256 members.js 29c57a2b…/tools.js 15140976… | VERIFIED |
| t39 | 2026-10-31 | HTTP clear + UI revert | captain: t39 11/11 EXIT=0, t10 32/32, t37 14/14, t4 22/22; build ×2 cùng `302aa6cf`/195 756 B, map `e51020e2`/330 671 B; mutation tắt 2 guard HTTP ⇒ 9/11 FAIL B4+D1; index.js khôi phục `b2f35617`/37 560 B | VERIFIED |
| t44 | 2026-10-31 | khai báo kiểu clear/cleared | captain: t44 11/11 EXIT=0; chỉ 3 tệp .d.ts + test; hạn chế: không chứng minh được 'không sửa .js' bằng hash vì t38 ghi song song (BUG-010) | VERIFIED |

## Vòng 5 — captain tự chấm (mutation test bắt buộc)

| Task | Member | Captain tự chạy | Mutation test | Kết luận |
|---|---|---|---|---|
| t37 clear routeOverride | dev-runtime-goat | t37 14/14 · t3 18/18 · t4 22/22 · t28 20/20 · t30 8/8 (EXIT=0) | no-op `delete routeOverride` ⇒ 9/14; tắt guard members ⇒ vẫn 14/14 (guard tools che), tắt CẢ HAI ⇒ FAIL e1 | VERIFIED (2 guard che nhau — phòng thủ 2 lớp) |
| t40 đề xuất di trú ERP | kiem-thu-goat | t40 20/20 EXIT=0; tool exit 0 `identical=true`; sha256 team.json ERP `9f7420b6…` không đổi | không áp dụng (công cụ CHỈ ĐỌC) | VERIFIED |
| t39 HTTP clear + UI revert | dev-ui-goat | t39 11/11 · t10 32/32 · t37 14/14 · t4 22/22; build ×2 cùng `302aa6cf…`/195 756 B | tắt đồng thời 2 guard HTTP ⇒ 9/11 (FAIL B4, D1) | VERIFIED |
| t44 khai báo kiểu | dev-build-flash | t44 11/11 EXIT=0 | không áp dụng (chỉ `.d.ts` + test đọc TEXT) | VERIFIED (hạn chế: không chứng minh 'không sửa .js' vì t38 ghi song song) |
| t38 fallback per-member | dev-runtime-goat | t38 14/14 · t3 18/18 · t4 22/22 · t20 15/15 (ERP sha không đổi) · t28 20/20 · t30 8/8 · t37 14/14 · t39 11/11 (EXIT=0) | bỏ ghi `member.fallback` ⇒ 9/14; `isMemberFallback` → `return true` ⇒ 8/14 | VERIFIED |

Hai lỗi của captain trong vòng này: (1) gõ sai tên tệp test t39 (`t39-clear-route-http.mjs` thay vì `t39-plan-clear-http.mjs`) ⇒ báo MODULE_NOT_FOUND sai; (2) kết luận 'exit 0' cho t37 khi pipe qua `tail` — từ nay luôn `> f 2>&1; echo EXIT=$?`.

### Đối chứng BUG-013 (captain tự chạy, không tin lời member)
- `tests/tmp/probe-fallback-only.mjs`: fork từ harness của `tests/t38-member-fallback.mjs` (mount `lib/index.js` thật, fake ctx có đúng các surface plugin dùng), seed team 1 member `alice` khai `p1/m1`, gọi `agent_teams_set_member_route` CHỈ với `fallback_provider=p1, fallback_model=m3`.
- Kết quả: `EXIT=0`, `THREW = false`, `RESULT = {member_name:alice, provider:p1, model:m1, previous_provider:p1, previous_model:m1, fallback_provider:p1, fallback_model:m3, applied:durable-only}`, `DURABLE fallback = {p1,m3}`, `routeOverride = undefined`, `spine = p1/m1` ⇒ PROBE VERDICT: PASS.
- Trạng thái tệp lúc đo: `members.js 8e4f7b39f20be5ca`/96 140 B (18:33:52), `tools.js 651ce617003ba11f`/193 189 B (18:32:26), `index.js b30da1e0d58a82af`/42 584 B (18:31:19) — cả ba đang bị t43/t46 ghi, nên mọi kết luận 'không đổi' phải là cặp hash cùng cửa sổ (BUG-010).

| t43 hồ sơ member | dev-runtime-goat | t43 19/19 · t3 18/18 · t4 22/22 · t20 15/15 · t28 20/20 · t30 8/8 · t37 14/14 · t38 14/14 | bỏ ghi bền ⇒ 14/19; `Object.assign`→`void` ⇒ 13/19 (FAIL f1) | VERIFIED |
| t46 fallback HTTP/UI | dev-ui-goat | t46 15/15 · t10 40/40 · t39 11/11 · t24 12/12 · t37 14/14 · t4 22/22; captain build lại ⇒ `f8601251…`/198 572 B trùng member | bỏ guard đòi cặp ⇒ 14/15 (FAIL B1); bỏ guard trộn ⇒ 12/15 (FAIL B1,B2,D1) | VERIFIED |
| t47 bịt lỗ hổng phủ t38 | dev-runtime-goat | t38 17/17 EXIT=0 (14+a5,a6,a7); members.js net-zero `8e4f7b39…` | captain tự revert guard `:1363` ⇒ 14/17 (đúng 3 case mới FAIL) | VERIFIED |

Ghi chú live-writer: lúc chấm t46, `tests/t38-member-fallback.mjs` đang bị t47 sửa ⇒ t38 ra 14/17 nhưng KHÔNG phải hồi quy của t46; sau khi t47 xong chấm lại 17/17. Đây là BUG-010 tái diễn ở mức test file ⇒ quy tắc: không chấm một suite đang được task khác sửa.

| t48 tool-names (quyền) | dev-runtime-goat | t48 6/6 · t4 22/22 · t43 19/19 · t3 · t20 EXIT=0 | captain tự xoá entry ⇒ 2/6 (4 case đúng) ; lần mutation đầu KHÔNG áp vì khai inline 1 dòng | VERIFIED |

| t41 pack vòng 5 | dev-build-flash | `1fe4fc5f…daa2f`/2 206 957 B/133 entry; `--analyze` 9/9 EXIT=0 | captain tự giải nén: 3 tệp DRIFT so nguồn (tool-names/index/tools) ⇒ tarball KHÔNG phát hành; chuyển t52+t53 | VERIFIED (deliverable bị thay thế) |
| t49 hồ sơ qua DTO+HTTP | dev-ui-goat | t49 16/16 · t43 19/19 · t4 22/22 · t46 15/15 · t24 12/12, EXIT=0 | captain tự mutation nhánh DTO (`tools.js:2351-2353` → `{}`) ⇒ 15/16 FAIL D1; khôi phục `de6a012431bf…`/193 704 B identical | VERIFIED |

| t50 vá BUG-012 | dev-runtime-goat | t50 11/11 EXIT=0 (`a01b1a10…`/194 888 B) | captain tự xoá filter `tools.js:237-238` ⇒ 6/11 (5 FAIL); khôi phục identical. Lần mutation đầu của captain EXIT=1 là do chạy sai cwd (MODULE_NOT_FOUND), không phải do mutation | VERIFIED |

| t42 audit mã nguồn vòng 5 | audit-goat (max) | 25/25 suite exit 0; 2 mutation tự làm (t37, t38) | captain đối chứng độc lập: tự mutation state.js:648 ⇒ t38 16/17 `not ok 15 - d3` trùng khít; khôi phục identical ⇒ 17/17, t37 14/14. V5-F1 đã sửa (đếm lại 49/1/2) | VERIFIED |

| t54 audit tự tụt fallback | dev-runtime-goat | t54 14/14; t51 E2E nay PASS C1..C6; hồi quy t38 17/17, t37 14/14 | captain tự chạy lại `node tests/t54-auto-fallback-audit.mjs` → 14/14 EXIT=0; `node tests/t51-fallback-live-e2e.mjs --analyze …/2026-10-31T18-58-54-196Z` → `PASS C6 … live-and-durable`, `verdict PASS - proved C1..C6`; **mutation độc lập của captain**: `await appendRouteChangeAudit(...)` → `if (false) await …` ⇒ **9/14, 5 FAIL** (a1,a2,a3,a5), khôi phục `1562be4d…/99 402 B` identical ⇒ 14/14 | VERIFIED |

| t55 verification E2E tự tụt | kiem-thu-goat | t51 6/6 PASS; t38 17/17, t37 14/14, t3 18/18 | captain tự chấm chéo 2 artifact cùng bộ chấm: TRƯỚC t54 = EXIT=1 FAIL C6; SAU t54 = EXIT=0 PASS C1..C6 ⇒ cô lập được phép sửa | VERIFIED |

## 2026-10-31T19:31:06.842Z — round 6 (captain tự kiểm)

| Hạng mục | Phạm vi | Người kiểm | Kết quả | Bằng chứng |
|---|---|---|---|---|
| t52 tarball cuối | sha256 + 133 entry + hash 3 chiều 10 tệp | captain | ĐẠT | `5306f31b…bfb7`/2 209 460 B; 6/6 entry bắt buộc; 10/10 SAME; `--analyze` 12/12 |
| t53 audit tarball | verdict + mutation của bộ chấm | captain (đọc artifact) | ĐẠT | `docs/audit/closure-vong-5-tarball.md` 59 dòng, verdict PHÁT HÀNH ĐƯỢC |
| Điều kiện hiện panel control | đọc mã thật của panel | captain | ĐẠT (kết luận) | `lib/client/ActivityPanel.js:642-647` lọc theo `captainSessionId === current`; `team.json` ghi `captainSessionId` cho cả 2 đội |
| Hướng dẫn cũ của captain | tính đúng đắn | captain | **SAI** (đã sửa) | 'mở session bất kỳ trên 19488' ⇒ panel rỗng; đính chính trong docs/TODO.md (DOG-02) + Telegram kỳ 24 |
| dependency-report | không còn báo động giả | captain | ĐẠT | `prov.superseded {t51:t55}`; problems=0 |
| t59 copy ERP thật | `--analyze` + dựng lại sha rebind + diff gốc | captain | ĐẠT | 9/9 EXIT=0; rebind sha `5e5f05c8…3573` khớp khi thay đúng 1 trường; ERP mtime/sha không đổi; run 19-37-37 FAIL 2/9 (không dùng) |
| t60 báo cáo người dùng | 6 số cũ 0-hit · 10 hash · tarball t52 · 3 suite · 6 neo mã | captain | ĐẠT | 142 dòng; t10 40/40 · t57 29/29 · t38 17/17 EXIT=0; `paths=65 links=41 missing=0`; tự sửa 1 dòng §4.1 đã lệch sau t58+t61 |
### Vòng 7 — captain tự chấm t65 + t67 (2026-10-31)
| Task | Captain tự chạy | Số đo độc lập | Mutation của captain |
|---|---|---|---|
| t65 (V6-F1) | `node tests/t58-erp-migrate.mjs` ×2 ⇒ **23/23 EXIT=0** | `tools/erp-route-migrate.mjs` 21 351 B `0d1711945ec7bcaa…`; ERP `9f7420b6…`/1 533 117 B không đổi | `ROUTE_SOURCE='profile'`→`'script'` ⇒ **EXIT=1, 6 FAIL** (a1,d1,d2,d3,d4,e2); khôi phục identical ⇒ 23/23 |
| t67 (planSave) | `tests/t62-css-completeness.mjs` **17/17**; t10 40/40; t57 29/29; `node --check` 0 | CSS **51 837 B/141 lớp** `53ea47c6…`; 136 khoá (137 lượt) missing []; `client.js 42f51e8e…/251 789 B`; `map 3b85de13…/391 373 B`, 19 sources, 0 đường dẫn ổ đĩa | xoá CẢ 5 rule `.aYQbCq_planSave…` (845 B) ⇒ **13/17 EXIT=1**; khôi phục `identical=true` ⇒ 17/17 |

Ghi nhận: brief t62 của captain hẹp (chỉ quét `ActivityPanel.js`) nên 14/14 xanh mà vẫn còn `planSave` undefined — đã sửa bằng t67 (quét theo TỆP, 136 khoá). V6-F3 (số tệp Telegram trong báo cáo) captain tự sửa: nay 24/24 tệp có `message_id`, liệt kê đủ ky-01..ky-24.
### Vòng 7 — captain tự chấm t68 + DOG-03 (2026-10-31)
| Hạng mục | Captain tự đo | Kết quả |
|---|---|---|
| t68 tarball | sha256 + size + `tar -tzf` (strip CRLF) + tự giải nén hash 3 chiều 11 tệp | `03bed22f4bb2c7f0…f99e` / **2 232 556 B** / **133 entry** / 0 rác; **11/11 SAME** với nguồn; bản cài `agent-teams-pack6` không symlink, CSS 51 837 B/**141 lớp**, có `planSave` |
| DOG-03 (browser thật) | mở Host 19488 (profile `agent-teams-gui`, junction fork) → mở session captain `session-28c28ee0…` → panel | thẻ member **471×145**, control route **232×38**; đổi route ⇒ `POST /plan` **200**, `team.json.routeOverride {deepseek-official/deepseek-v4-pro, high, source:http, by:web:session-28c28ee0…}`, audit row `2026-10-31T20:13:40.030Z`; khôi phục ⇒ 200 + row `(cleared)`; thêm member ⇒ 200 + `carolccaarrooll \| reviewer \| deepseek-official/deepseek-v4-pro` |
| DOG-03 phát hiện | D1 (form mặc định route ngoài catalog ⇒ 409) · D2 (automation: `browser_type` + `browser_press` nhân đôi ký tự) | D1 → **t71**; D2 là giới hạn công cụ, ghi HANDLE |

Lỗi/nhầm của captain trong lượt này: (1) tưởng picker của FORM nhưng thực ra bấm picker của hàng `alice` ⇒ đổi route alice 2 lần (vẫn có audit, không sai dữ liệu); (2) lần submit đầu thất bại vì route mặc định ngoài catalog — chính là D1, không phải lỗi form. Bài học: khi có nhiều picker cùng loại trên trang, chọn theo accessible-name khác biệt (`currently Choose a model` cho form) chứ không theo vị trí.
### Vòng 8 — captain tự chấm t70 + t71 (2026-10-31)
| Task | Captain tự đo | Mutation của CAPTAIN (khác member) |
|---|---|---|
| t70 sàn biến thể CSS | CSS `53ea47c6d780`/51 837 B; suite 27/27 EXIT=0; stateFloor `21 / 16 / 12 / 4` | xoá rule đơn `.aYQbCq_badge:hover{…}` (delta 87 B) ⇒ EXIT=1, 4 FAIL; khôi phục identical ⇒ 27/27 |
| t71 form preselect catalog (D1) | `tests/t70-addmember-default-route.mjs` 16/16; t10 44/44; `node --check` 0; map 19 sources/0 drive paths; client.js `5636cd9f66fd16ae`/257 459 B, map `57892ef70e47cacb`/403 287 B | bỏ vế `routes.some(…)` của `declaredUsable` (`MemberControls.js:129-130`, delta 102 B) ⇒ EXIT=1, 3 FAIL (case 4, 5, 7); khôi phục identical ⇒ 16/16 |

Bài học lượt này: mutation phải đổi HÀNH VI, không chỉ đổi BYTE. Phép thử đầu của captain chỉ đổi tên biến `inCatalog` ⇒ suite vẫn 16/16 xanh và đó là KẾT QUẢ ĐÚNG (không phải suite yếu); phải làm lại bằng phép bỏ hẳn vế kiểm `routes.some(...)` thì suite mới đỏ đúng chỗ.
### Vòng 8 — captain chấm t72 + xử lý findings V8 (2026-10-31)
| Hạng mục | Captain tự đo | Kết quả |
|---|---|---|
| t72 tarball | sha256 + `tar -tzf` strip CRLF + tự giải nén hash 11 tệp + grep bản cài | `5137df03…c8ac` / **2 239 517 B** / **133 entry** / 6-6 bắt buộc / **11/11 SAME** / grep **6/6** dấu vết (pack7, không symlink) |
| V8-F1 (high) | sửa :132-133 + :136 | tarball nay t72 + bundle `5636cd9f66fd…`/257 459; t68 vào danh sách KHÔNG dùng |
| V8-F2 (medium) | xoá 2 hàng trùng trong mục DOG, header, t73 → VERIFIED | `TODO rows=74 uniqueIds=74 dupes=[]` |
| V8-F3/F4 (low) | 26 → 27 kỳ; 4 suite ghi `t73, EXIT=0` | grep `25 kỳ`=0 · `42f51e8e65af`=0 · `03bed22f4bb2`=0 |
| Cổng hồ sơ | `node tools/check-doc-paths.mjs --summary` | `files=5 paths=70 paths_missing=0 links=41 links_missing=0` EXIT 0 |

Nhận xét về audit vòng 8: 4 phát hiện đều đúng và đều ở TÀI LIỆU, không có phát hiện lớp mã; 4 mutation của audit khác hoàn toàn 3 kiểu của captain ⇒ giá trị thật. Điều đáng ghi: V8-F1 là lỗi LẶP LẠI (vòng 7 đã V7-F1 cùng dạng ở cùng tệp) ⇒ từ nay sau mỗi lần pack, captain phải grep số cũ trong báo cáo TRƯỚC khi giao audit.

## Vòng 9 — captain tự chấm t83 (cổng biên dịch) + phát hiện lỗi thật từ t82

| Việc | Captain tự đo | Kết luận |
| --- | --- | --- |
| t83 (cổng `tsc --noEmit`) | `node tests/t56-types-fallback.mjs` ⇒ `# 20/20 passed`, in `tsc=5.9.3` `files=21`; t43 19/19; t10 48/48; `check-doc-paths` `paths=75 paths_missing=0` | PASS |
| Mutation 1 (dòng 527 `activateMemberNow`, `signal?:`→bắt buộc) | t56 **20/20 KHÔNG đỏ** | ĐÚNG — không case nào assert dòng 527 (lặp BUG-021: mutation phải nhắm thuộc tính ĐƯỢC assert) |
| Mutation 2 (dòng 295 `setMemberProfile`, cùng kiểu) | t56 **18/20**, `not ok 15 d15`, `not ok 19 d19`; khôi phục `7d0436aa3fc8` identical ⇒ 20/20 | PASS — cổng có tác dụng |
| t82 (C3) | member báo FAIL 5/6; captain tự đọc mã: `lib/tools.js:546-548` dựng selection từ spine; `lib/members.js:1054-1060` escalate rồi `delete member.routeOverride` | LỖI SẢN PHẨM THẬT ⇒ mở t86 (repair) |

Bài học: mutation không nhắm thuộc tính được assert thì xanh là ĐÚNG, không phải suite yếu — kiểm bằng cách đọc case trước khi kết luận.

### Vòng 11 — captain tự chấm t84 (pack) + nhận verdict t85 (audit) + sửa V11-F1

| Việc | Số đo của captain (không dựa self-report) |
|---|---|
| Tarball t84 | sha256 `220a6da9…37db1` / 2 242 952 B / 133 entry / 0 dir / junk 0 |
| Ba chiều 12/12 | nguồn ↔ payload ↔ bản cài `agent-teams-pack10` (không symlink), khớp 12/12 |
| Pinned bundle | bản cài có `membersApi.selectionFromMember` = 1 (vá BUG-023 thật sự nằm trong gói) |
| t85 artifacts | `docs/audit/closure-vong-11.md` 80 dòng · `docs/log/AUDIT.md` 211 dòng |
| Verdict còn hiệu lực | `tests/tmp/cap86-freeze.cjs` 12/12 mốc khớp bảng sau pack ⇒ `lib/**` không đổi |
| ERP | `9f7420b6…15f2d1e` / 1 533 117 B không đổi |
| V11-F1 (medium, tài liệu) | ĐÃ SỬA trong lượt: 19 + 4 anchor thay thế có assert, grep số cũ = 0 |
| check-doc-paths | `files=5 paths=78 paths_missing=0 links=41 links_missing=0` EXIT 0 |

Bài học: báo cáo là **đầu vào của việc phát hành**, không phải tài liệu trang trí — V7-F1/V8-F1/V10-F1/V11-F1
cùng một dạng (báo cáo trỏ tarball cũ), nên sau MỖI lần pack phải grep số cũ và grep *chuỗi đường dẫn tarball* trước khi giao audit.

## Vòng 12 — captain tự chấm t87 + t88 (approve/routeOverride + pack vòng 12)

| Việc | Số đo của captain (đo lại, không tin báo cáo member) |
| --- | --- |
| t87 approve đọc spine bỏ qua `routeOverride` | `lib/tools.js:732` nay `membersApi.selectionFromMember(member) ?? {…}`; spine literal trong `lib/tools.js` = **0 lần** (split); call-site thật = **2** (553, 732 — hit thứ 3 ở :727 là chữ trong comment) |
| Suite t87 / t86 | t87 **8/8** · t86 **8/8** EXIT 0 (t86 bị SIẾT chứ không nới: spine=0 + đếm call-site + neo consumer) |
| Mutation CỦA CAPTAIN (khác member) | `lib/members.js:446` `const overrideProvider = member.routeOverride?.provider?.trim();` → `undefined` (delta **+16 B**) ⇒ t87 **4/8** + t86 **4/8** đỏ; khôi phục `identical=true` sha `4f818b73803da02a…`/100 367 ⇒ 8/8 + 8/8 |
| Hồi quy | t3 18/18 · t4 22/22 · t20 15/15 · t43 19/19 · t56 **20/20** (tsc 5.9.3/21 tệp, d18 cổng THẬT, d20 là đối chứng âm 'thiếu tsc' cố ý) · t10 48/48 · t70 16/16 · t74 24/24 · t77 18/18 — EXIT 0 |
| t88 tarball | sha256 `0adbc64e1564b079048c465634ba9d38e9795bdfa2662269a514124524ceed2c` / **2 243 224 B** / `tar -tzf` strip CRLF **133 entry / 0 entry thư mục / 0 rác** |
| t88 ba chiều | tự giải nén ⇒ **12/12 SAME** nguồn ↔ payload ↔ bản cài `agent-teams-pack11` (`isSymlink=false`, `0.2.0-dev.0`), khớp bảng đóng băng sau t87 |
| t88 V11-F3 | probe con exit 0 CHỈ khi namespace là object + đủ tên, exit 1 'missing named export', exit 2 khi import ném; `SELF_MUTATION: caught exit=1,1,1,1,1`; `--analyze` EXIT 0 **23/23** và **tự hash tarball trên đĩa** (`sha256Now`/`bytesNow`/`entriesNow`) |
| Bản cài | 19/19 named export trên 5 module; `CAPTAIN_TOOL_NAMES` có `agent_teams_set_member_route` + `agent_teams_set_member_profile`; bundle `data-member-route-control`=1 · `data-add-member`=7 · `captainRoute`=6 · `aYQbCq_planSave`=6 |

**Bài học (lặp lại, ghi lần 3)**: hai lần đo của captain hỏng vì LỖI CỦA CHÍNH CAPTAIN — (1) script đo viết `.mjs` mà dùng `require` + top-level await ⇒ `ERR_AMBIGUOUS_MODULE_SYNTAX`; (2) tra `registerAgentTeamsTools` trong `members.js` trong khi nó ở `lib/tools.js:505` ⇒ suýt kết luận oan 'member assert export sai'. QUY TẮC: script đo của captain luôn là `.cjs` bọc `async function main()`; trước khi kết luận 'member sai', phải chỉ ra ĐÚNG tệp mà symbol phải nằm ở đó.

## Vòng 12 (phần 2) — captain nhận verdict t89 + xử lý 4 findings

| Finding | Cách xử lý (có đo lại) |
| --- | --- |
| V12-F1 (medium) `--analyze` trên run cũ của t84 EXIT 1 vì meta thiếu `selfMutation` | GIỮ ĐỎ (một artefact không mang đối chứng thì không phải bằng chứng), chỉ làm rõ chẩn đoán: `tests/tmp/cap89-patch.cjs` thêm vào dòng chi tiết C22 *"meta.json cua run nay sinh TRUOC ban va V11-F3 … chay lai suite tren mot run MOI"*; ghi `docs/kiem-thu/t84-pack.md` mục mới (57 → 62 dòng) |
| V12-F2 (low) TODO header 83 vs thân 84 | sửa header → `VERIFIED=85 · CANCELLED=3 · SUPERSEDED=1 · IN_PROGRESS=0 · OPEN=0`; đo lại: rows=89, {VERIFIED 85, CANCELLED 3, SUPERSEDED 1} ⇒ khớp 89 |
| V12-F3 (low) báo cáo còn ghi t3/t15 'chưa chạy lại' | captain chạy lại t3 `18/18` + t15 `21/21` EXIT 0 rồi sửa 2 hàng thành `t89, EXIT=0`; grep 'chưa chạy lại' = 0 |
| V12-F4 (low) comment hứa exit 2 nhưng probe exit 1 | **sửa MÃ**: `want` nay khai ở scope con TRƯỚC `import()` trong `tests/t84-pack.mjs` + `tests/t88-pack.mjs` (t84 `c20b4b554e09`/62 016 → `9046c22b2958`/62 211; t88 `274ca0eb49e8`/64 122 → `e09c5c88ac77`/64 122, delta 0 vì chỉ đổi thứ tự token). Captain đo ba nhánh trên bản đã sửa: đủ tên ⇒ **0**, thiếu tên ⇒ **1** (`missing named export: …`), module không tồn tại ⇒ **2** |

Sau khi sửa: `node tests/t88-pack.mjs --analyze` vẫn **23/23 EXIT 0**; `node tests/t84-pack.mjs --analyze <run cũ>` vẫn EXIT 1 (đúng, kèm lý do); `node --check` cả 2 tệp OK; `check-doc-paths` `paths=80 paths_missing=0 links=41 links_missing=0`.

**Ranh giới cần nhớ**: hai tệp bị sửa là TEST nên KHÔNG nằm trong payload phát hành (`package/tests` = 0 entry) ⇒ verdict t89 cho tarball t88 (`0adbc64e…ceed2c`/2 243 224 B/133 entry) vẫn nguyên hiệu lực. Nếu sau này sửa bất kỳ tệp nào TRONG payload thì verdict vô hiệu theo đúng điều kiện audit ghi.

## Vòng 13 — captain tự chấm t90 (BUG-024) + t91 (cổng log) + tự phát hiện lỗi thứ hai và lỗi cổng

| Phép đo của captain | Kết quả |
|---|---|
| `grep` dòng roster / chỗ sửa | `lib/tools.js:1077 function editPlanRosterRow(member)`, call site `:1213 roster: updated.members.map(editPlanRosterRow)`, dòng spine cũ trong tệp = **0 hit** |
| SHA 4 tệp t90 (node:crypto, assert 64 ký tự) | `lib/tools.js a9ad29f8ae87…`/**199 180 B** · `tests/t90-edit-plan-roster-route.mjs 6ebfd57472a6…`/16 093 · doc `4531c74d67e3…`/6 202 · `docs/log/BUG.md 4ad28288caad…`/30 182 — TRÙNG báo cáo member |
| Tự chạy 6 suite | t90 **10/10** · t87 8/8 · t86 8/8 · t50 **11/11** · t3 18/18 · t20 15/15 — EXIT 0 cả 6; ERP `9f7420b6…15f2d1e`/1 533 117 B không đổi |
| Cổng log t91 | `node tools/check-logs.mjs --summary` → `logs=7 ok=7 fail=0 warnings=3 problems=0 newest_round=12` EXIT 0; suite `tests/t93-check-logs.mjs` **14/14** EXIT 0; 5 hash khớp báo cáo |
| **E2E thật của captain** (headless, profile `agent-teams-test`, `--json -`) | `session-9f394b2f-cd8a-4b99-8725-bbe39d93b670`: create staged → `set_member_route` (alice) → `edit_plan`; tool_result = `Staged plan updated atomically (2 members, 0 tasks, 0 dependencies). No members were spawned and no tasks were scheduled.` ⇒ **KHÔNG có dòng roster** |
| Nguyên nhân lỗi thứ hai | `lib/tools.js:1138` render: `` `${…}…\n${value.graph.join('\n')}` `` — bỏ `value.roster` ⇒ bản vá t90 chỉ đúng ở structured output ⇒ mở **t94** |
| **Fixture cổng log của captain** | `tests/tmp/cap91-fixture`: header `Đếm (t1–t93)` (không có 'vòng N') + 7 log vòng 7 ⇒ `--summary` trả `ok=7 fail=0 problems=0 skipped (header không khai vòng)` **EXIT 0** ⇒ phép kiểm độ mới bị bỏ qua im lặng ⇒ mở **t95** |
| Tarball chết của t92 | `c3f9598620ba…d3cb9` / **2 243 703 B** (captain tự hash lại, khớp member) ⇒ t92 CANCELLED, không dùng phát hành |

**Bài học**: (1) 'vá đúng dữ liệu' chưa đủ — phải kiểm cả ĐƯỜNG NGƯỜI DÙNG ĐỌC (text render), đó là chỗ BUG-024 lần 2 lộ ra; (2) một cổng mới phải được thử bằng ĐẦU VÀO XẤU NHẤT mà nó định chặn (header thiếu thông tin), không chỉ bằng trạng thái repo đang đẹp; (3) khi phát hiện lỗi làm thay đổi `lib/**`, phải HOLD pack trước khi member kịp pack bộ byte chết — lần này member pack xong trước tin HOLD nên sinh 1 tarball chết (đã ghi vào danh sách loại).


## Vòng 13 (phần 3) — captain tự chấm t95 (attempt 2)

| Phép đo | Kết quả |
| --- | --- |
| `node tools/check-logs.mjs --summary` | `logs=7 ok=7 fail=0 warnings=3 problems=0 newest_round=12 newest_task=95` **EXIT 0** |
| `node tests/t93-check-logs.mjs` | `TỔNG 20/20 ca ĐẠT, 0 HỎNG` · `verdict PASS` · **EXIT 0** (work `tests/tmp/t93-check-logs/2026-10-31T22-28-36-412Z`) |
| sha256 3 tệp (captain đo độc lập) | `tools/check-logs.mjs 4da000bcda98`/13 823 B · `tests/t93-check-logs.mjs 22fca52b5811`/18 133 B · `docs/kiem-thu/t93-check-logs.md ce1307ae6561`/9 944 B |
| Header `docs/TODO.md:4` | sửa thành 'vòng 12 là vòng ĐÃ ĐÓNG gần nhất; V13 đang mở' — chữ `V13` KHÔNG khớp `/(?:vòng|round)\s*(\d+)/gi` |

**Bài học.** Cổng mới đúng là đã bắt lỗi THẬT — nhưng lỗi nằm ở dữ liệu do captain viết (header khai vòng chưa đóng), không phải ở mã của member. Khi một cổng đỏ ngay sau khi được vá, phải phân biệt 'cổng quá chặt' với 'dữ liệu nhập sai'; ở đây là dữ liệu, và cách sửa đúng là làm header phản ánh đúng nghĩa 'vòng' chứ không thêm ngoại lệ vào cổng. Member đã nộp FAILED thay vì PASS khống — đúng kỷ luật.

## Vòng 14 (phần 1) — captain tự chạy cổng render-parity của t98 và chốt cách giữ răng

| Phép đo | Lệnh | Kết quả thật |
| --- | --- | --- |
| Chạy cổng | node tests/t98-render-coverage.mjs | definitions=16 withRender=16 · fields=110 reached=92 uncovered=9 nested_gaps=4 allow_listed=5 negative_control_applies=true · verdict RED · **EXIT 1** |
| Đối chứng âm của cổng | (member dựng, in trong lần chạy) | applies=true — dropped field "status" … missing=["status"], delta −1 (93→94) ⇒ xanh không thể là xanh im lặng |
| Hash tệp | node:crypto | tests/t98-render-coverage.mjs 799a5ff52d336c4a…/27 626 B · docs/kiem-thu/t98-render-coverage.md d0a73ae48f6f6147…/8 144 B (khớp báo cáo member) |
| Đọc mã xác nhận 3/9 trường thiếu | lib/tools.js:889-900, :1468-1473, :876-886 | create render KHÔNG in members/profile/task_planning; set_member_profile render KHÔNG in execution_prompt/previous_*; status render thiếu team_id/phase |

**BUG-025 (mới, lớp lỗi)**: payload đúng nhưng text tool_result bỏ sót — 9 trường cấp 1 + 4 nhóm lồng trên 16 tool. Vì sao 13 vòng audit bỏ lọt: mọi suite cũ grep chuỗi trong bundle/DOM hoặc so .d.ts với mã, KHÔNG có suite nào đối chiếu output.schema ↔ output.render.

**Quyết định thiết kế cổng (captain chốt)**: một cổng vừa là phép đo vừa là verify thì exit code phải tách khỏi phát hiện. t98 attempt 1 nộp đúng nhưng bị harness buộc failed vì verify EXIT 1. Nay: mặc định in findings + EXIT 0; --strict EXIT 1 khi còn thiếu; cổng hỏng (capture sai / đối chứng âm không bắt / render ném) EXIT 2 ở CẢ HAI chế độ. Răng giữ bằng verify của t99 (--strict phải xanh) + mutation riêng của audit t101.

**Bài học**: cổng đo “phát hiện lỗi” không được dùng làm verify của chính task dựng cổng — nếu không task luôn failed và tạo tiền lệ xấu là “cổng đỏ nên bỏ qua”.

## Vòng 13 (phần 4) — captain tự chấm t96 + nhận verdict t97 + đóng findings

| Phép đo | Kết quả |
| --- | --- |
| tarball t96 (captain tự hash) | `0b9220eabbc4584f…172c9e70` / **2 243 920 B** / **133 entry** / 0 entry thư mục / junk 0 |
| ba chiều 12 tệp (captain tự giải nén `tests/tmp/cap96-extract`) | **12/12 SAME** nguồn ↔ payload ↔ `agent-teams-pack13` (`isSymlink=false`, 0.2.0-dev.0) |
| `node tests/t96-pack.mjs --analyze` | **24/24 EXIT 0**, tự hash đĩa `0b9220eabbc4584f` / `bytesNow 2243920` |
| hồi quy captain tự chạy | t10 48/48 · t56 20/20 · t94 9/9 · t90 10/10 · t87 8/8 — EXIT 0 cả 5 |
| verdict t97 | **TARBALL t96 PHÁT HÀNH ĐƯỢC · CÔNG BỐ CHƯA**; `closure-vong-13.md` 108 dòng, `AUDIT.md` 240 dòng |
| V13-F1 | header TODO → t96 (đo lại: `0adbc64e1564` = 0 hit trong báo cáo) |
| V13-F2 | `dependency-report` trước: `problems=1` (`t96 da completed nhung cha t93 van pending`) → sau khi thêm `provenance.superseded {t93: t96}`: `problems=0` |
| V13-F3 | báo cáo: '78 đường dẫn' → **83** |
| cổng sau khi đóng | `check-logs` `logs=7 ok=7 fail=0 problems=0 newest_round=13` · `dependency-report problems=0` · `check-doc-paths paths=83 paths_missing=0` |
| Telegram | kỳ 33 = messageId **44** (`{"ok":true,"chatId":"-1004360988691","messageId":44,"parts":1}`) |

**Bài học.** Ba finding của vòng 13 đều là **tài liệu và ledger**, không phải mã — nghĩa là lớp lỗi "số đo đúng nhưng hồ sơ trỏ sai bản" vẫn là rủi ro số một của quy trình này. Riêng V13-F2 cho thấy board và provenance có thể BẤT ĐỒNG (board treo task đã bị thay thế) và khi board không sửa được (BUG-017 chặn reassign theo dependency) thì phải đóng bằng nguồn sự thật thứ hai (provenance) và ghi rõ lý do, thay vì để cổng đỏ vĩnh viễn.

## Vòng 14 (phần 2) — captain tự chấm t99 (vá render + 2 chế độ cổng) và tự mutation

| Phép đo | Lệnh | Kết quả thật |
| --- | --- | --- |
| Cổng chế độ strict | node tests/t98-render-coverage.mjs --strict | EXIT 0 · SUMMARY tools=16 fields=110 reached=104 uncovered=0 nested_gaps=0 allow_listed=6 negative_control_applies=true · verdict GREEN |
| Cổng chế độ mặc định | node tests/t98-render-coverage.mjs | EXIT 0 · mode: --report (in đủ findings) |
| Suite của task vá | node tests/t99-render-parity.mjs | EXIT 0 · # 11/11 passed |
| Hash tệp | node:crypto | tools.js 5deb03ca93b2a8e9/205 239 · tests/t98 0c13ddeb53c659b7/29 793 · tests/t99 43cf794af44f72a1/15 195 · doc t99 d12a40590d501971/8 396 · BUG.md 9979aba78ab5399f/37 894 — khớp báo cáo member |
| MUTATION CỦA CAPTAIN (khác member) | xoá vế previous_role ở lib/tools.js:1489 | applies=true delta −84 B ⇒ --strict EXIT 1 uncovered=1 + t99 9/11 (not ok 3 a3, not ok 11 a11) ⇒ khôi phục identical=true sha 5deb03ca93b2a8e9…/205 239 B |
| Hồi quy | t94 9/9 · t90 10/10 · t50 11/11 · t10 48/48 · t43 19/19 · t3 18/18 · t4 22/22 · t20 15/15 · t30 8/8 · t38 17/17 · t37 14/14 · t70 16/16 · t74 24/24 · t56 20/20 | EXIT 0 tất cả |

**Ngoại lệ đã chấp nhận (có kiểm chứng)**: `agent_teams_edit_plan.team_id` nằm trong ALLOW_LIST của cổng. Lý do: in thêm trường này làm đỏ 3 case của `tests/t94-edit-plan-roster-render.mjs` (d1/g1/i1 so NGUYÊN VĂN text) mà t94 nằm NGOÀI inScope của t99 nên không được phép sửa. Mức độ low (team_id đã hiện ở `create`/`status`). Tôi giao audit t101 phán xét tính chính đáng của ngoại lệ này thay vì tự miễn cho mình.

**Bài học**: cổng do member viết vẫn phải bị chính captain mutation theo một KIỂU KHÁC (member xoá cả dòng roster −463 B; tôi xoá một VẾ của biểu thức −84 B). Nếu chỉ kiểm bằng mutation của member thì "cổng bắt được mutation của chính người viết cổng" không chứng minh được gì.

## Vòng 14 (phần 3) — captain tự đo tarball t100 trước khi giao audit

| Phép đo | Cách làm | Kết quả |
| --- | --- | --- |
| sha256 + size tarball | `node:crypto` trên đĩa | `d7a8bce4a333170bb304cc7d07fbcd5979091c976e314c82225eb4bcb57c9b1a` / `2 245 210 B` — khớp báo cáo member |
| `tar -tzf` strip CRLF | script riêng của captain (`tests/tmp/cap100-tar.cjs`) | `entries=133` `dirEntries=0` `needMissing=[]` `absolutePaths=[]` |
| Ba chiều 12 tệp | tự giải nén `tests/tmp/cap100-extract` + so nguồn ↔ payload ↔ bản cài | `threeWaySame=12/12` `mismatches=[]` |
| Bản cài | `lstat` + `package.json` của profile | `agent-teams-pack14` không symlink, `0.2.0-dev.0`, dep `file:…tests/tmp/t100/…tgz` |
| Marker trong bản cài | đếm chuỗi trong `lib/tools.js` đã cài | `previous role:`=1 · `Members (`=3 · `Team id:`=1 · `override route:`=1 |
| `--analyze` | tự viết lại bằng chứng bằng chính suite | `25/25 checks passed` EXIT 0, tự hash đĩa khớp meta |

**Lỗi của captain (lần 4 gặp CRLF)**: lần đo đầu parse `tar -tzf` bằng `split('\n')` KHÔNG strip `\r` ⇒ mọi tên thành `package/x\r` nên `needMissing` in ra **6 tệp bắt buộc 'thiếu'** dù gói đủ. Suýt kết luận oan member pack thiếu entry. QUY TẮC: mọi parse đầu ra `tar`/lệnh Windows phải `.replace(/\r$/u, '')` TRƯỚC khi so; và khi một phép đo báo 'thiếu toàn bộ', nghi phép đo trước khi nghi dữ liệu.

**Trước khi giao audit (bài học V8-F1/V11-F1 đã áp)**: `docs/bao-cao-agent-teams.md` được đẩy sang số vòng 14 NGAY trong lượt này (14 anchor, có assert `count===1` từng anchor): §2.1 `lib/tools.js 5deb03ca93b2…/205 239`; §2.3 → **ĐANG CHỜ AUDIT VÒNG 14** + path t100 + sha `d7a8bce4…c57c9b1a` + `2 245 210 B` + `pack14`; §2.4 chi tiết t100; bảng §4 thêm hàng `t98` (2 chế độ) · `t99` 11/11 · `t100 --analyze` 25/25; §4.1 `101 hàng` + `tasks=101 realEdges=102 derivedEdges=110`; `paths=87`; danh sách tarball cũ thêm t96 và bản hiện hành = t100.
## Vòng 14 (phần 4) — captain xử lý 3 câu hỏi hợp đồng của dev-runtime-goat trước t102

| Câu hỏi của member | Quyết định của captain | Căn cứ |
| --- | --- | --- |
| `tests/t58-erp-migrate.mjs:352-362` case f4 khẳng định `source:'script'` phải bị TỪ CHỐI khi đọc — xung đột trực tiếp với luật lenient của t102 | `agent_teams_amend_task(t102)` rev 1: inScope thêm `tests/t58-erp-migrate.mjs`; f4 VIẾT LẠI thành 'đọc được + round-trip nguyên văn'; f2/f3 giữ nguyên; đối chứng âm thay thế ('' / 123 / >64) nằm trong t102; t58 vẫn phải 23/23 | giữ NĂNG LỰC BẮT LỖI, chỉ đổi chỗ đặt phép kiểm — không nới để xanh |
| Đường GHI vẫn hở: `lib/members.js:1323` `request.source ?? 'captain'` không kiểm giá trị | Mở **t103** (deps t102) đóng nửa GHI: chỉ `captain|http|profile`, giá trị khác NÉM trước khi ghi đĩa + trước audit row, kèm bảng caller toàn repo | t102 chỉ sửa ĐỌC; không nhét 2 luật vào 1 task |
| Danh sách status đầy đủ chỉ là mảng local `lib/state.js:872`; `types.js` chỉ export 3 status terminal | Đồng ý phương án: in từ chính mảng validator + `TERMINAL_TASK_STATUSES`; KHÔNG thêm export `TASK_STATUSES` (kéo theo `.d.ts` + cổng tsc) | chi phí > lợi ích ở mức low |

**Lỗi của captain**: thêm cạnh provenance `t103 → t104` khi `t104` CHƯA tồn tại ⇒ `dependency-report` báo `problems=1` (`PROBLEM: provenance tro toi task khong ton tai: t103 -> t104`). Đã xoá cạnh (114 → 113 edges), `problems=0`. QUY TẮC: cạnh provenance chỉ được thêm khi CẢ HAI đầu đã có id thật trong ledger.
## Vòng 14 (phần 5) — captain vá 3 finding tài liệu của audit t101 + tự kiểm cấu trúc bảng TODO

| Finding | Nội dung | Cách vá | Bằng chứng đo lại |
| --- | --- | --- | --- |
| V14-F1 | header `docs/TODO.md` ghi `VERIFIED=93` trong khi thân 94 hàng | header nay được TÍNH TỪ chính các hàng `\| tN \|` (không viết tay), sau khi sửa cấu trúc bảng | `counts {VERIFIED:95, CANCELLED:4, SUPERSEDED:2, OPEN:2}` trên 103 hàng |
| V14-F2 | 16 hàng task 6 cột nằm trong bảng Dogfood 4 cột; bảng chính dừng ở t85; t86/t77 lẻ | gộp TOÀN BỘ 103 hàng task về bảng chính, **sắp theo id tăng dần**; bảng Dogfood chỉ còn DOG-01..DOG-04 | `rows=103 · badCols=0 · ascending=true · dup=0 · dogRows=4 · badDog=0` |
| V14-F3 | báo cáo còn `tasks=101 realEdges=102 derivedEdges=110` | thay bằng số đo thật cùng lượt | `tasks=103 realEdges=104 derivedEdges=113 waves=44 problems=0`; grep `tasks=101`=0 · `101 hàng`=0 |
| V14-F4/F6/F7/F8 | info | ghi vào bảng findings của TODO là **ACCEPTED** kèm lý do (fail-closed là đúng; artefact lịch sử không mang đối chứng thì không phải bằng chứng; `DEPENDENCIES.md` là đầu ra của công cụ; event host bị bỏ không chặn nghiệp vụ) | 7 hàng `V14-F*` hiện diện |

**Phát hiện thêm của captain khi vá (audit KHÔNG bắt được, vì nó chỉ đếm hàng)**: 9 hàng task đang có SỐ CỘT sai — `t51`/`t55` có **12** ô (dữ liệu E2E bị nhét thành cột thay vì nằm trong ô bằng chứng), `t95` chỉ có **4** ô (thiếu cả nội dung lẫn phụ thuộc), `t98`..`t103` có **7** ô vì ô bằng chứng chứa dấu `\|` thô. Đã dựng lại từng hàng: 6 ô, mọi `\|` bên trong ô được escape thành `\|`; `t95` được viết lại nội dung + `deps=t91`.

**Bài học (lặp lần 2)**: script sửa file phải đọc lại SAU mỗi lần ghi. Lượt này tôi chụp `taskRows` TRƯỚC khi sửa hàng t101, rồi lọc-bỏ-rồi-chèn lại chính mảng đã chụp ⇒ **mất bản sửa t101** (hàng quay về `OPEN`). Chỉ phát hiện vì sau khi ghi tôi đếm lại trạng thái. Quy tắc: (1) đọc sau khi ghi, (2) đếm bằng máy chứ không nhìn mắt, (3) một script chỉ nên làm MỘT phép biến đổi trên bảng.

**Bài học (header round)**: `check-logs` đọc `/(?:vòng|round)\s*(\d+)/` trên header; ghi `vòng 15` khi log chưa có mục vòng 15 ⇒ cổng đỏ `ok=4 fail=3`. Viết mốc tương lai là `V15` (không khớp regex) và chỉ khai `vòng 14` cho vòng đang mở.
## Vòng 14 (phần 6) — xung đột hợp đồng THỨ HAI của t102 (`t3` case 18) và xử lý

| Điểm | Nội dung |
| --- | --- |
| Member báo (DỪNG đúng lúc, không tự sửa ngoài phạm vi) | `tests/t3-route-smoke.mjs:240` sub-case `'unknown source'` dùng `source:'bogus'` và khẳng định `readTeam` phải NÉM ⇒ dưới luật đọc lenient `bogus` ĐỌC ĐƯỢC ⇒ t3 17/18 |
| Captain tự kiểm | regex `/^[a-z][a-z0-9:_-]{0,63}$/u` cho `bogus=true · Erp=false · erp tool=false`; grep toàn `tests/**` chỉ còn **2** chỗ khẳng định-nguồn-lạ-bị-từ-chối: `t58:361` (đã amend) và `t3:240` |
| Quyết định | `agent_teams_amend_task(t102)` **rev 2**: inScope thêm `tests/t3-route-smoke.mjs`; nghiệm thu ghi rõ CHỈ đổi sub-case đó thành nhóm HÌNH DẠNG không hợp lệ (`''` / `123` / 65 ký tự / `'Erp'`), giữ 4 sub-case còn lại + vế `readTeamSync`, t3 vẫn **18/18** |
| Nguyên tắc giữ nguyên | đây là ĐỔI CHỖ đặt phép kiểm (từ 'enum đóng' sang 'hình dạng token'), không phải nới để xanh: `Erp` chữ hoa vẫn bị từ chối, `''`/`123`/`>64` vẫn bị từ chối, và t102 còn đối chứng âm union cũ (applies=1, delta +125 B) |

**Bài học**: một luật ĐỌC mới có thể làm đỏ các suite đang khẳng định luật ĐỌC cũ — trước khi giao việc sửa validator phải grep TRƯỚC các chỗ `assert.rejects(...readTeam...)`/`source:` lạ trong `tests/**`, và đưa danh sách đó vào inScope ngay từ hợp đồng đầu tiên thay vì amend 2 lần.
## Vòng 14 (phần 7) — captain tự chấm t102 (BUG-026 nửa ĐỌC) và tự mutation trên TỆP THẬT

| Phép đo | Lệnh | Kết quả thật |
| --- | --- | --- |
| Suite chính | `node tests/t102-erp-read-leniency.mjs` | EXIT 0 · **17/17** |
| Suite bị ảnh hưởng (đổi chỗ phép kiểm) | t58 · t3 | EXIT 0 · **23/23** và **18/18** (`grep -c '^ok '` = 18) |
| Hồi quy | t38 17/17 · t37 14/14 · t43 19/19 · t20 EXIT 0 (`# sha256(source): 9f7420b6…15f2d1e`) · t4 22/22 | EXIT 0 cả 5 |
| Hash | `node:crypto` | `lib/state.js 56664c59ff400319…`/**57 508 B** (trước 7b49f5ab…/56 282) · t102 `afb600c7…`/19 299 · t58 `80b9209f…`/22 913 · t3 `e50f0ea4…`/13 858 · doc `7819ef33…`/10 009 · BUG.md `c34092db…`/42 567 — khớp báo cáo member 6/6 |
| MUTATION CỦA CAPTAIN (khác kiểu member) | sửa TỆP THẬT: `isProvenanceSource` → union đóng cũ | `applies=true delta −4 B` ⇒ t102 **11/17 EXIT 1** (`not ok 1 a1`, `a2`, `a3`, `a4`, `10 c1`, `15 f1 negative control`) ⇒ khôi phục `identical=true sha=56664c59ff400319…/57 508` |
| ERP thật | `node:crypto` | `9f7420b6a1af1f4e…`/1 533 117 B không đổi |

**Hai lần amend trong 1 task** (rev 1 cho t58-f4, rev 2 cho t3-case-18) — cùng một lớp: luật ĐỌC mới làm đỏ các suite đang khẳng định luật ĐỌC cũ. Cách xử lý giữ nguyên năng lực bắt lỗi: đổi phép kiểm từ 'enum đóng' sang 'hình dạng token' (`''`/`123`/65 ký tự/`Erp` vẫn bị từ chối), giữ nguyên số case (18/18, 23/23) và cả vế `readTeamSync`.

**Hệ quả bắt buộc**: `lib/state.js` đã đổi ⇒ **verdict audit vòng 14 (t101) HẾT hiệu lực**; sau t103 phải pack bản mới (V15) và audit lại, không được công bố t100 như bản cuối.
## Vòng 14 (phần 8) — LỖI CỦA CAPTAIN: verify trỏ tệp ma (`tests/t43-set-member-profile.mjs`)

- Hợp đồng t103 (tôi viết) ghi verify #2 = `node tests/t43-set-member-profile.mjs`. Tệp đó **không tồn tại**; tệp thật là `tests/t43-member-profile.mjs` (19 case của `setMemberProfile`). `ls tests/ | grep t43` chỉ trả `t43-member-profile.mjs`.
- Member phát hiện khi chạy verify, và **không tự tạo forwarder** (đúng: tạo `tests/t43-set-member-profile.mjs` 3 dòng sẽ vừa vượt trần 4 tệp, vừa lặp lại đúng sự cố t74 với `tests/t20-erp-snapshot.mjs`).
- Xử lý: `agent_teams_amend_task(t103)` rev 1 — verify đổi thành `node tests/t43-member-profile.mjs` và bổ sung `t102` + `t3` (hai suite bị ảnh hưởng bởi luật provenance). Không tạo tệp nào thêm.
- Bài học: trước khi đưa một lệnh suite vào verify của hợp đồng, phải `ls tests/` xác nhận tệp tồn tại — KHÔNG viết tên theo trí nhớ. Đây là lần thứ hai cùng lớp lỗi (t74: `t20-erp-snapshot.mjs`), nên từ nay verify chỉ được chứa đường dẫn đã kiểm bằng `test -f`.
- Ghi nhận thêm: `tests/t45-clear-live-e2e.mjs` KHÔNG truyền `source` (chỉ đọc cột 8 bảng MODEL-SWITCH + `event.data?.source?.form`) ⇒ clamp của t103 không ảnh hưởng t45; và member mở rộng guard sang `setMemberProfile` (đúng yêu cầu #2 của tôi).
## Vòng 14 (phần 5) — captain tự chấm t102 + t103 (BUG-026 hai nửa) và mở V15

| Phép đo | Kết quả |
| --- | --- |
| `lib/state.js` sau t102 | `56664c59ff400319…` / **57 508 B** (trước `7b49f5ab…`/56 282) |
| `lib/members.js` sau t103 | `50f558f8b207d874…` / **102 260 B** (trước `4f818b73803d…`/100 367) |
| `tests/t102-erp-read-leniency.mjs` | **17/17** EXIT 0 |
| `tests/t103-write-source-clamp.mjs` | **10/10** EXIT 0 |
| Hồi quy captain | t43 19/19 · t37 14/14 · t38 17/17 · t58 23/23 · t3 18/18 · t56 20/20 · t20 EXIT 0 — cả 7 EXIT 0 |
| Mutation captain cho t102 | union đóng cũ thay `isProvenanceSource` (delta **−4 B**) ⇒ t102 **11/17** EXIT 1 |
| Mutation captain cho t103 | bỏ guard ở `setMemberRoute` (delta **−55 B**) ⇒ t103 **6/10** EXIT 1 (`a1`,`a2`,`a3`,`e1`) |
| Phục hồi sau mutation | `identical=true` cả hai, sha về đúng mốc |
| Hệ quả | `lib/state.js` + `lib/members.js` đổi ⇒ verdict audit vòng 14 hết hiệu lực ⇒ mở **t104** (pack V15) + **t105** (audit V15) |

Bài học:
1. Luật ĐỌC mới làm đỏ chính các suite đang khẳng định luật ĐỌC CŨ (`tests/t58-erp-migrate.mjs:352-362` case f4, `tests/t3-route-smoke.mjs:240` sub-case 'unknown source'). Trước khi giao hợp đồng có đổi luật đọc, phải `grep` trước `assert.rejects(...readTeam...)` và mọi `source:` lạ trong `tests/**` rồi đưa các tệp đó vào inScope NGAY từ đầu — thay vì để member dừng giữa đường (dù dừng đúng kỷ luật).
2. Verify chỉ được chứa đường dẫn đã kiểm bằng `test -f`. Hợp đồng t103 ban đầu trỏ `tests/t43-set-member-profile.mjs` (KHÔNG tồn tại; tệp thật `tests/t43-member-profile.mjs`). Không tạo tệp forwarder để 'chữa' — chính tệp ma kiểu đó đã gây sự cố ở t74 (`tests/t20-erp-snapshot.mjs`).
3. Mutation của captain phải KHÁC thư viện mutation của member nhưng vẫn nhắm đúng bất biến: member giữ guard bằng bản copy trong bộ nhớ, captain sửa TỆP THẬT rồi khôi phục byte-identical — hai mức khác nhau của cùng một bất biến.
4. Bảng `docs/TODO.md` là bảng markdown: `|` thô trong ô (ví dụ union `captain|http|profile`) làm hàng thành 7–12 ô. Sau MỌI lần chèn hàng phải đếm `badCols` bằng máy, không nhìn mắt.
## Vòng 15 (phần 2) — captain nhận verdict t105, tự kiểm tính hiệu lực, xử lý 5 findings

| Phép đo | Kết quả |
| --- | --- |
| Tarball lần nữa | `771298f33c08abf6133cb4b0…` / **2 246 406 B** (khớp verdict) |
| Freeze 12 tệp sau audit | `freezeDrift none` ⇒ audit không để lại dấu vết |
| Dấu vết mutation còn sót | `{0,64}` trong `lib/state.js` = **0** · `PROVENANCE_SOURCES` chứa `'erp'` = **0** |
| Suite có thật sự chạm biên bị mutate | `tests/t102-erp-read-leniency.mjs:133` = `['b3', 'a' + 'b'.repeat(64), '65 characters']`; `tests/t103-write-source-clamp.mjs:84/:236/:238` 3 case từ chối + đối chứng âm |
| Tài liệu audit | `docs/audit/closure-vong-15.md` **86 dòng** · `docs/log/AUDIT.md` **283 dòng** (khớp báo cáo member) |
| Báo cáo đã chốt | §2.3 → **ĐÃ CHỐT: PHÁT HÀNH ĐƯỢC (Audit t105, vòng 15)** + điều kiện hết hiệu lực mốc `2026-10-31T23:39:06Z` |
| V15-F5 đã ghi | §2.4 thêm 'Giới hạn đã biết của vòng 15' (đọc 64 ký tự vs ghi 3 giá trị; `source` là token mô tả; `by`/`at` không kiểm; `erp-route-migrate.mjs` hard-code `'profile'`) |
| TODO | 105 hàng/6 cột, `VERIFIED=99 · CANCELLED=4 · SUPERSEDED=2 · OPEN=0`, `badCols=0` |
| Gates | `check-logs newest_round=15 problems=0` · `check-doc-paths paths=90 missing=0` · `dependency-report problems=0` |

Bài học
1. Audit đưa ra con số (131 tệp payload, 57/58 suite) khác con số captain (133 entry, 55 suite ở vòng 14) — không phải mâu thuẫn: **entry** đếm mục tar, **payload** chỉ đếm tệp. Khi đối chiếu verdict phải so cùng đại lượng, nếu không sẽ kết luận oan 'audit bịa số'.
2. Phép kiểm hiệu lực verdict rẻ nhất không phải chạy lại suite mà là **hash lại tệp nguồn + grep dấu vết mutation**. Nếu audit quên phục hồi, `freezeDrift` bắt được ngay mà không tốn một lần chạy suite nào.
3. Finding `low` cũng phải đóng bằng hành động cụ thể: V15-F5 không được phép nằm trong báo cáo dưới dạng 'đã biết' — nó phải thành một đoạn văn **người vận hành đọc được**, nêu hệ quả khi họ sửa tay `team.json`.
## Vòng 16 — mở: đưa bằng chứng lên mức người vận hành dùng thật

| Phép đo | Kết quả |
| --- | --- |
| TODO sau khi chốt vòng 15 | 105 hàng, `VERIFIED=99 · CANCELLED=4 · SUPERSEDED=2 · OPEN=0`, `badCols=0` |
| Báo cáo | §2.3 chốt **PHÁT HÀNH ĐƯỢC (Audit t105, vòng 15)**; §2.4 thêm 'Giới hạn đã biết của vòng 15' (V15-F5) |
| Telegram | kỳ 36 = messageId **47** |
| Vòng 16 mở bằng | **t106** — boot phiên THẬT trên bản copy `team.json` ERP (14 member/107 task), contract C1..C6 |
| Ranh giới | t106 chỉ thêm `tests/**` + `docs/kiem-thu/**` ⇒ verdict vòng 15 vẫn hiệu lực; nếu t106 lộ lỗi sản phẩm thì mở repair + pack/audit vòng 17 |

Bài học (lặp lại lần thứ ba — nay thành luật): **mỗi lần header `docs/TODO.md` khai 'vòng N đang mở' thì phải thêm ngay mục vòng N cho CẢ BỐN log** (`BA`, `CHECK`, `AUDIT`, `ACTIVITY`) trong CÙNG lượt, nếu không `check-logs` đỏ `problems>0` và mất một lượt để chữa. Quy trình đúng: mở vòng ⇒ ghi 4 mục ⇒ mới chạy `check-logs`.
### Vòng 16 — captain tự kiểm F1 của t106 và mở t107

| Phép đo của captain | Kết quả |
| --- | --- |
| Đếm trạng thái member ERP thật | `{removed:7, idle:6, working:1}` / 14 ⇒ F1 là thật, không phải suite quá chặt |
| Đọc mã nguồn gây lỗi | `lib/tools.js:2444-2445` lọc `status !== 'removed'` khỏi DTO; `renderStatus` `:3230` in `Members (${team.members.length})` trên DTO đã lọc ⇒ mất thông tin ở TẦNG PAYLOAD |
| Đọc suite t106 để kiểm lời khai của member | `tests/t106-erp-live-roundtrip.mjs:526-563` chấm C1 từ `boot-c1.stdout.txt` + `c1-full-text.txt` (sinh bởi mã CŨ) ⇒ 'sửa xong C1 xanh ngay, 0 boot' là SAI |
| Gate hồ sơ | `dependency-report tasks=109 realEdges=108 derivedEdges=121 waves=46 problems=0`; `check-doc-paths paths=90 missing=0`; `check-logs problems=0 newest_round=16` |
| TODO | 109 hàng/6 cột/0 badCols; `VERIFIED=99 · CANCELLED=4 · SUPERSEDED=2 · IN_PROGRESS=1 (t107) · OPEN=2 (t108,t109)`; t106 ghi `FAILED (attempt 1)` |

**Bài học (lặp lại lần thứ ba)**: member báo 'không cần boot lại' là một KHẲNG ĐỊNH VỀ CƠ CHẾ, không phải quan sát — trước khi tin, captain phải đọc đúng đoạn mã chấm của suite. Ở đây chỉ cần đọc 30 dòng là thấy C1 ăn từ artifact. Cùng họ với BUG-021/BUG-022: kết luận về hành vi phải kèm đường dẫn tệp:dòng.

**Bài học về ranh giới 'lỗi sản phẩm' so với 'assert quá chặt'**: t106 nộp `failed` là ĐÚNG (không nới assert), nhưng `failed` không có nghĩa là dừng — nó có nghĩa là mở repair (t107) và giữ nguyên bộ chấm để attempt 2 đo được sự đổi thay. Nếu sửa suite cho xanh thì mất luôn bằng chứng.
### Vòng 16 (phần 2) — captain tự chấm t107 (BUG-027) + hai lần tiền đề sai
| Phép đo của captain | Kết quả |
| --- | --- |
| Hash tệp sau t107 | `lib/tools.js` `d402c6586df1e1402c799466ac5ac9333aab8d3828dabc1a0f735dc61c529434`/**210 641 B** · `lib/types/tools.d.ts` `41cfc56576ed8ffd`/7 546 |
| Suite captain tự chạy | t107 12/12 · t98 `--strict` `fields=112 reached=106 uncovered=0 allow_listed=6` · t99 11/11 · t56 20/20 · t94 9/9 · t90 10/10 · t50 11/11 · t43 19/19 · t3 18/18 · t20 15/15 · t11 HTTP EXIT 0 · **t59 PASS C1..C9 EXIT 0** (member không chạy, captain chạy) |
| Mutation của captain | đổi CHỈ tiêu đề `Members (N active + M removed):` → `Members (N):` (−42 B) ⇒ t107 **9/12 EXIT 1** (a2,a4,c1) nhưng **t98 VẪN GREEN** ⇒ parity chỉ chấm "trường có tới text", không chấm cách diễn đạt; phục hồi byte-identical |
| Đo lại dữ liệu ERP | 14 member = 7 removed + 6 idle + 1 working · **0/14 member có `routeOverride`** · hồ sơ removed mang `id,name,role,provider,model,reasoningEffort,joinedAt,status,runtimeSetup{persona 4 073 ký tự, toolFilter deny[10]}` |
| Gate | TODO 109 hàng/0 badCols (`VERIFIED=100 · FAILED=1 (t106) · OPEN=2`) · `check-logs problems=0 newest_round=16` · `check-doc-paths paths=91 missing=0` · `dependency-report tasks=109 problems=0` |

**Tiền đề SAI lần thứ nhất (của captain, member bắt được)**: tôi mô tả hồ sơ removed của ERP là "mang `routeOverride` nguồn `erp` cần cho migrate/rollback". Đo trên tệp thật: **0 member có `routeOverride`**. Cái payload làm rơi là `runtimeSetup` + `joinedAt`. Hệ quả: giá trị nghiệp vụ của bản vá là **bản sắc vận hành của hồ sơ** (persona/toolFilter/ngày tham gia), không phải route provenance. Bài học: trước khi mô tả dữ liệu của hệ thống khác, phải in ra khoá thật của một bản ghi mẫu — 1 lệnh, không đoán.

**Tiền đề SAI lần thứ hai (của captain)**: tôi khẳng định "cổng `t98 --strict` sẽ bắt được mọi sai lệch ở text status". Sai: mutation chỉ-đổi-tiêu đề làm `t107` đỏ nhưng `t98` vẫn xanh, vì cổng này chỉ đánh giá "trường của schema có xuất hiện trong text hay không". Bài học: **một cổng chỉ có răng đúng bằng tập lỗi nó mô hình hoá**; muốn khoá nguyên văn thì phải có suite khẳng định nguyên văn hoặc boot thật, không suy ra từ cổng khác.

**Luật hợp đồng mới (áp dụng từ vòng 17)**: mọi task có đổi `render` PHẢI khai `tests/t98-render-coverage.mjs` trong `inScope`, vì bản đồ `RENDER_LINES` ghim số dòng của từng tool và một chèn dòng làm cổng EXIT 2 (fail-closed đúng thiết kế). t107 buộc phải sửa tệp này ngoài phạm vi; captain đã chấp nhận và ghi lý do trong `docs/log/BUG.md` (BUG-027, mục "Giới hạn còn lại").

## Vòng 16 (phần 4) — captain tự chấm t108 (pack vòng 17)

| Phép đo | Kết quả của captain (không dùng meta.json) |
| --- | --- |
| sha256 + bytes tarball | `0cb3fdfe255c…cfd63f18` · 2 247 534 B |
| `tar -tzf` strip CRLF | 133 entry · 0 entry thư mục · 0 rác · 0 đường dẫn tuyệt đối |
| giải nén + ba chiều 13 tệp | 13/13 SAME với bản cài `agent-teams-pack16` (không symlink, `0.2.0-dev.0`) |
| freeze 13 tệp sau pack | khớp 13/13 bảng sau t107 ⇒ `lib/**` không đổi |
| marker trên bản cài | `removed_count`=1 · `removed_members`=4 · `function removedLine(`=1 · `member.runtime_setup.persona`=2 · `active + `=1 |
| `t108-pack --analyze` | 29/29 EXIT 0 (tự hash đĩa) |
| hồi quy captain tự chạy | t107 12/12 · t98 `--strict` GREEN (`fields=112 reached=106 uncovered=0`) · t10 48/48 |
| ERP | `9f7420b6…15f2d1e`/1 533 117 B không đổi |

Bài học 1: bảng đóng băng đổi số dòng (12 → **13** vì thêm `lib/types/tools.d.ts`) thì checker hardcode `frozenRows.length === 12` sẽ đỏ oan — member t108 gặp đúng lỗi này và khai trung thực; checker phải dùng `FILES.length`.

Bài học 2: mutation 'chỉ đổi cách diễn đạt' (đổi tiêu đề `Members (N active + M removed):` → `Members (N):`, −42 B) làm `t107` đỏ 3 case nhưng `t98 --strict` VẪN GREEN — hai cổng đo hai thứ khác nhau (t98 chấm 'trường có tới được text', t107 chấm nội dung/định dạng). Đừng đọc 'parity xanh' thành 'bản vá đúng'.

Bài học 3: khi brief gửi member chứa dấu nháy kép, đừng viết inline trong `send_message` — ghi brief ra `tests/tmp/*.txt` bằng heredoc rồi đọc tệp và gửi (lần này chuỗi `source "erp"` làm hỏng parse TypeScript của chính captain).

### Vòng 18 (phần 1) — captain tự chấm t110 (cổng t98) + t111 (pack vòng 18)

| Phép đo | Kết quả |
|---|---|
| hash nguồn sau t110 | `lib/tools.js` 88dbee4079f95ffd / 213 071 B; `lib/types/tools.d.ts` KHÔNG đổi 41cfc56576ed8ffd / 7 546 B |
| t98 --strict | EXIT 0 · `tools=16 fields=112 reached=106 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 allow_list_line_problems=0` · verdict GREEN |
| hồi quy | t107 12/12 · t99 11/11 · t56 20/20, EXIT 0 |
| mutation A (citation ALLOW_LIST sai) | t98 EXIT 2 `GATE ERROR: … citation lib/tools.js:2670-2673 does not contain its render line 2748` |
| mutation B (đổi khoá `removed_members`→`removed_membersZ`, +1 B) | t98 EXIT 1 `payload_findings=2` verdict RED |
| mutation C (xoá cách in `tasks[].kind`, −30 B, giữ số dòng) | t98 EXIT 1 `nested_gaps=1` verdict RED |
| tarball t111 | 1bb0ef1f… / 2 247 954 B / 133 entry / 0 dir / 0 rác / 0 absolute; ba chiều 13/13 SAME; lock `file:` trỏ đúng tarball; `--analyze` 29/29 EXIT 0 |
| marker bản cài | `removed_count`=3 · `removed_members`=5 · `function removedLine(`=1 · `member.runtime_setup.persona`=2 · `present + `=1 · `active + `=0 |

**Bài học.**
1. Verify trong hợp đồng phải được kiểm bằng `test -f` TRƯỚC khi lưu card — đây là lần thứ ba (t74 tệp ma, t103 `tests/t43-set-member-profile.mjs`, t111 `tests/t111-pack.mjs` không tồn tại). Một verify không chạy được biến một task đã xong thành task mắc kẹt ở `in_progress`, và tệ hơn: nếu member yếu, họ sẽ ghi `passed` cho lệnh không chạy — đúng thứ kỷ luật bằng chứng cấm.
2. Ba mutation của captain nhắm đúng BA lớp khác nhau (miễn trừ sai địa chỉ / payload đổi khoá / giá trị lồng bị bỏ in). Mutation chỉ có nghĩa khi nó trả lời được 'phép này làm HÀNH VI sai ở đâu' — phép (C) giữ nguyên số dòng nên nó chứng minh cổng mới chứ không chứng minh RENDER_LINES.
3. Khi gửi brief repair, phải đo `mtime`+`sha256` của tệp mục tiêu ngay trong lượt gửi: t113 đã được dev-ui-goat sửa TRƯỚC khi brief tới dev-runtime-goat, nên brief mô tả dòng 341 như chưa sửa. Người nhận đúng khi từ chối claim và báo lệch.

### Vòng 18 (phần 2) — captain tự chấm t113 (suite đối chứng thật cho C4 của t59)

| Phép đo | Kết quả |
|---|---|
| hash nguồn | `tests/t59-erp-live-copy.mjs` b3cfb88aa2d49158 / 26 426 B; `tests/t113-roster-assertion.mjs` ffa1d7de6eb13240 / 12 196 B; `docs/kiem-thu/t59-erp-live.md` d9508de0 / 10 454 B; `lib/tools.js` KHÔNG đổi 88dbee4079f95ffd / 213 071 B |
| t113 | 15/15 PASS EXIT 0 — A1 cắt NGUYÊN VĂN `const rosterOk = roster.found === true && roster.present === 7 && roster.removed === 7;` từ t59:355; A3 khoá C4 truyền rosterOk vào check(); B1..B5 rosterOk=false; M1 `|| true` / M2 bỏ vế removed / M3 hằng `true` đều teeth=false; G1 text thật 7+7 true |
| mutation RIÊNG của captain | đổi `&& roster.present === 7 && roster.removed === 7` thành nhánh OR (+2 B) ⇒ t113 **FAIL A1, EXIT 1**; khôi phục `identical=true` |
| chạy sống của captain | `node tests/t59-erp-live-copy.mjs` EXIT 0, PASS C1..C9, `run-2026-11-01T01-14-20-148Z`, C4 `membersLine="Members (7 present + 7 removed)"` roster 7+7, C8 ERP `identical=true` 9f7420b6…e15f2d1e/1 533 117 B |
| rác kiểm trong t59 | dấu mutation của member = 0 · `|| true` = 0 · `&& true` = 0 · đủ 9 check C1..C9 |

**Bài học.**
1. **Tiền đề đo được phải kèm MỐC của tệp nguồn tại thời điểm chạy.** Member kết luận 'chữ tiêu đề dao động giữa các boot' bằng cách so output lúc 01:03:11 với `mtime` 01:04:48 — tức so với trạng thái tệp SAU khi run đó kết thúc. Đối chiếu đúng: 01:00:54 'present' · 01:03:11 'active' · 01:09:18 và 01:14:20 'present', nên cửa sổ 01:03:11 là lúc `lib/tools.js` bị ghi đè tạm, không phải sản phẩm dao động. Cùng lớp BUG-022 nhưng lần này người sửa là member khác ⇒ luật bổ sung: mọi mutation phải khai cửa sổ thời gian + sha trước/sau để người chấm sau loại trừ được.
2. **Một suite đối chứng chỉ có răng khi nó khẳng định ĐÚNG biểu thức mà suite sống dùng.** Bản đầu so đầu ra helper (`found/present/removed`) nên bỏ `&& rosterOk` khỏi C4 vẫn xanh; bản hiện tại cắt nguyên văn dòng 355 và tự chứng minh răng của mình (M1/M2/M3).
3. Lỗi môi trường phải ghi là lỗi môi trường: boot 01:08:08 đỏ với `ERR_MODULE_NOT_FOUND: Cannot find package '@nami/dsh-agent-teams'` vì profile đang bị relink — ghi thành finding sản phẩm thì lần sau sẽ đi tìm bug không tồn tại.

### Vòng 18 (phần 3) — BUG-028: cửa sổ ghi không chủ trên `lib/tools.js`

**Phát hiện (khi đối chiếu t113).** Boot sống 01:03:11Z in `Members (7 active + 7 removed)` (bản TRƯỚC t110), trong khi 01:00:54Z / 01:09:18Z / 01:14:20Z đều in `present`. `lib/tools.js` hiện tại `88dbee40…`/213 071 B mtime 01:04:48Z, `grep 'active + ${'` = 0.

**Loại trừ bằng đo.** (a) Cả hai profile dogfood là SYMLINK tới nguồn (`agent-teams-test` @nami mtime 01:08:24Z, `agent-teams-gui` 01:02Z) ⇒ boot đọc chính nguồn, không đọc bản cài cũ. (b) Ba phép mutation của captain đọc-buffer → ghi-biến-thể → ghi-lại-buffer, không phép nào chạm chuỗi tiêu đề, đều `identical=true`. (c) dev-ui-goat khai không ghi `lib/**` trong cửa sổ đó. (d) Lần đỏ 01:08:08Z là `ERR_MODULE_NOT_FOUND` do relink profile — muộn hơn 5 phút, không liên quan.

**Kết luận.** Giữa 01:00:54Z và 01:03:11Z có một lần ghi KHÔNG CHỦ đưa nội dung CŨ vào `lib/tools.js`; 01:04:48Z trả lại nội dung hiện hành. Không ai khai nhận, repo không có log cửa sổ mutation ⇒ ghi **BUG-028** (medium, OPEN) và mở **t114** để đóng bằng cổng: suite sống tự hash nguồn trước/sau boot + hằng số đóng băng, kèm suite chứng minh cổng bắt được lệch trên BẢN COPY (không mutation tệp nguồn).

**Lỗi điều phối thứ tư trong ngày (của captain).** `agent_teams_create_task(t114)` không truyền `assignee` ⇒ card vào pool chung; dev-ui-goat claim trước trong khi brief lại gửi cho dev-runtime-goat. Đã xử lý: xác nhận owner thật từ ledger, gửi dev-ui-goat 't114 là của bạn, brief ở `tests/tmp/t114-brief.txt`', gửi dev-runtime-goat STOP + yêu cầu khai nếu đã kịp sửa. **Luật mới: card phải tạo KÈM `assignee`, và trước khi gửi brief phải đọc lại ledger để khẳng định `assignee === người nhận`.**

### Vòng 18 (phần 3) — captain chốt mâu thuẫn hợp đồng t114, mở t115 (cổng kiểm hợp đồng)

| Phép đo | Kết quả |
| --- | --- |
| Mâu thuẫn hợp đồng t114 do dev-runtime-goat phát hiện | acceptance đòi `sourceHashesOf` phủ **13 tệp** nhưng brief chỉ đóng băng 2 tệp và C10 chỉ assert 2 hằng số ⇒ hai bản không thể cùng đúng |
| Bảng `FROZEN` của `tests/t108-pack.mjs` | ĐÃ CŨ: ghim `lib/tools.js: d402c6586df1e140` trong khi cây hiện tại `88dbee4079f95ffd` ⇒ copy nguyên bảng là C10 đỏ ngay |
| Quyết định | chọn **(B)**: đóng băng ĐỦ 13 tệp ship (12 `lib/**` + `package.json`), bảng ĐO MỚI, C10 assert từng tệp, doc nêu giới hạn trung thực |
| `agent_teams_amend_task(t114)` | rev 1, `revised_fields=acceptance`; dev-ui-goat nhận brief chốt (`delivered=wake`) |
| Card t115 | tạo **KÈM `assignee=dev-runtime-goat`** ngay trong lệnh tạo (đúng luật mới), brief gửi sau khi đọc lại ledger |
| Hồ sơ | `docs/TODO.md` 115 hàng/115 id/0 hàng sai cột; provenance 128 cạnh; `tasks=115 realEdges=110 derivedEdges=128 waves=50 problems=1` |
| Cổng | `check-logs logs=7 ok=7 problems=0 newest_round=18` · `check-doc-paths paths=93 paths_missing=0 links=41` |

**Bài học**:
1. Nếu một con số trong acceptance không có nguồn ngay trong brief (ở đây là '13 tệp'), member ĐÚNG khi dừng lại hỏi — hợp đồng phải tự đứng được một mình, không dựa vào việc member đoán ý captain.
2. Mọi bảng hằng số đóng băng đều có HẠN DÙNG: bảng của `tests/t108-pack.mjs` ghim hash nguồn ở vòng 17 nên đã lệch ngay sau t110. Trước khi dẫn bảng cũ vào một task, phải đo lại và ghi mốc.
3. Cổng đóng băng nguồn chỉ bắt được 'boot chạy trên byte khác mã tài liệu mô tả' — KHÔNG bắt được 'ai đó ghi rồi trả lại đúng byte cũ'. Nói rõ giới hạn này trong doc, thay vì để người đọc sau tưởng nó đóng được cả BUG-028.
### Vòng 18 (phần 4) — captain tự chấm t115 (cổng kiểm hợp đồng)

| Phép đo | Kết quả |
| --- | --- |
| Hash 3 tệp | `tools/check-contract.mjs` b61361f920315ad2…/13 779 B · `tests/t115-check-contract.mjs` 5947767f434b05b5…/15 075 B · doc 6be6bd7ccec1b967…/8 011 B — khớp member 3/3 |
| Suite | `node tests/t115-check-contract.mjs` **31/31 EXIT 0**, gọi CLI thật qua `spawnSync` (không import nội bộ) |
| Cổng trên ledger THẬT | t115 PASS 6/6 · t114 PASS 6/6 · captain chạy thêm **t112 + t106** đều PASS 6/6 ⇒ đọc đúng card của người khác |
| Mutation riêng của captain (khác member) | vô hiệu phép (f): `if (coversOrEquals(banned, entry)) clashes.push(` → `if (false && …)` (+9 B) ⇒ suite **EXIT 1 30/31**, `# failed: f1 an outOfScope that covers an inScope entry fails`; phục hồi `identical=true` |
| Cổng tự bắt lỗi thật | khi mới ra đời, chính card t115 bị nó báo `missing: tests/t115-check-contract.mjs`; phép (a) tái hiện đúng 2 lỗi thật: `tests/t111-pack.mjs` → gợi ý `packages/dsh-agent-teams/tests/t111-pack.mjs`, và t103 → `tests/t43-member-profile.mjs` |
| Không chạm ngoài scope | `lib/tools.js` 88dbee4079f95ffd…/213 071 B · `lib/index.js` 2d28e617f068…/45 315 B — trùng 2 hằng số đóng băng của t114 |

**Luật mới (áp dụng từ vòng 18 trở đi)**: trước MỌI lần gửi brief, captain chạy `node tools/check-contract.mjs --state .agent-teams/nami-agent-teams --task <id>`; exit 1 nghĩa là KHÔNG gửi. Đây là cổng thứ ba bên cạnh `check-logs` và `check-doc-paths`.

**Bài học**:
1. Hai lỗi lặp lại của captain trong 18 vòng (verify trỏ tệp không tồn tại; card thiếu assignee) đều là lỗi ĐỌC LEDGER, nên kiểm được bằng máy — không cần thêm kỷ luật trí nhớ, chỉ cần một cổng chạy trước khi gửi.
2. Cổng mới phải thử bằng đúng đầu vào xấu mà nó định chặn. Ở đây cả hai phía đều làm: member vô hiệu phép (a), captain vô hiệu phép (f) — mỗi phép kiểm phải có ít nhất một phép phá chứng minh nó quyết định kết quả.
### Vòng 18 (phần 5) — captain chấm t114: cổng đóng băng nguồn CÓ RĂNG, nhưng suite sống t59 KHÔNG tất định (mở t116)

| Phép đo | Kết quả |
| --- | --- |
| Hash 4 tệp t114 | `tests/t59-erp-live-copy.mjs` 70bc42437eed1eea…/**34 662 B**/611 dòng · `tests/t114-source-freeze.mjs` 40de2c210aba2e05…/14 195 B · `t114-source-freeze.md` 564809ca4d9e4e7d…/6 456 B/82 dòng · `t59-erp-live.md` ada2cfb7c836c939…/12 414 B (member ghi 139 dòng, captain đo **140**) |
| Suite t114 | `node tests/t114-source-freeze.mjs` ⇒ `# frozen=13 files · helperRecords=13 · problemsOnDrift=2 · problemsOnBadPin=2` · **16/16 EXIT 0** |
| Mutation riêng của captain | đổi 1 ký tự hex sha `lib/tools.js` trong bảng `FROZEN` (delta 0 B) ⇒ **EXIT 1, 13/16** + đúng câu `evidence: note="nguồn đã bị ghi…"`; phục hồi `identical=true` |
| Chạy sống của captain | `run-2026-11-01T01-27-13-566Z` (tái dùng session `session-eeb51885`, 13/13 tệp drift 0, **C10 PASS**) nhưng `verdict FAIL — failed C5,C6,C7` |
| Nguyên nhân | model gọi `set_member_route` **2 lần** rồi `clear`, nên số audit row và trạng thái cuối lệch kỳ vọng; lần của member 80 giây trước (`run-…T01-25-54-618Z`) PASS với **4** call ⇒ suite chấm theo SỐ LẦN GỌI, không theo nghiệp vụ |
| Xử lý | **T114-F1 → t116** (dựng lại fixture mỗi lần chạy, C5 trong cùng boot, C6 theo DELTA audit row, C7 'không áp dụng', chạy 2 lần liền phải cùng PASS) — cổng hợp đồng `check-contract` PASS 6/6 trên card này |

**Bài học**:
1. Một suite sống chấm theo số lần model gọi tool là suite KHÔNG tất định — verdict của nó không phải bằng chứng phát hành; phải chấm theo tính chất (delta, trạng thái ngay sau hành động), và phải chạy 2 lần liền mới được coi là chứng minh.
2. Trước khi sửa một dòng trong báo cáo, phải khớp theo ĐẦU DÒNG chứ không theo chuỗi con: chuỗi `tests/t59-erp-live-copy.mjs` xuất hiện trong cả hàng t113 lẫn hàng live, và phép thay theo chuỗi con đã xoá mất hàng t113 (đã dựng lại nguyên nội dung, kiểm lại bằng `grep` đếm số hàng).
### Vòng 18 (phần 4) — captain chấm t106 + t112, mở t117/t118, và sửa CHÍNH cổng của mình

| Phép đo | Kết quả |
| --- | --- |
| t106 attempt 2 (`--analyze`) | EXIT 0, `verdict PASS — proved C1..C6 — unproved (none)`, `analyze: 0 boots` |
| t112 audit | `docs/audit/closure-vong-18.md` 102 dòng; `docs/log/AUDIT.md` 317 dòng (đếm heading = 26, đủ vòng 1–18) |
| tarball t111 đối chiếu payload | 13/13 payload = nguồn (giải nén `tests/tmp/cap111-extract`) |
| `node tools/check-contract.mjs --task t117` | PASS 6/6 EXIT 0 |
| `node tools/check-contract.mjs --task t118` trước khi sửa cổng | FAIL 5/6 EXIT 1 — (a) đòi `tests/t118-pack.mjs` phải tồn tại, nhưng đó là tệp card sẽ TẠO |
| sau khi thêm luật 'planned by this task' | `node tests/t115-check-contract.mjs` **33/33 EXIT 0**; t118 PASS 6/6 |
| hồ sơ | TODO 118 hàng/118 id/0 sai cột (`VERIFIED=109 · CANCELLED=4 · SUPERSEDED=2 · IN_PROGRESS=1 · OPEN=2`); `dependency-report problems=0`; `check-logs newest_round=18`; `check-doc-paths paths=96` |

Bài học (đã thành luật): (1) cổng tự viết phải có ca cho trường hợp 'tệp sẽ được tạo bởi chính task', nếu không nó báo oan card đúng; (2) mọi lần sửa cổng phải kèm ca chống MIỄN TRỪ HÀNG LOẠT (a9: đường dẫn không khai trong deliverables vẫn phải đỏ); (3) hai số cho cùng một nhãn trong output là lỗi (V18-F3) — nhãn phải duy nhất; (4) marker khớp theo GIÁ TRỊ thì không phải bằng chứng (V18-F2) — phải khớp theo ĐƯỜNG DẪN KHOÁ.

## Vòng 19 — captain tự chấm t117 + t119 (2026-11-01)

**t117 (repair V18-F2/F3 + 3 lỗ render thật) — VERIFIED.** Hash khớp 4/4: `lib/tools.js` e51734baf4693cd3…/213 715 · `tests/t98-render-coverage.mjs` c21a18da…/59 673 · `tests/t59-erp-live-copy.mjs` 04b8327b…/42 229 · doc 0ab256e5…/22 536. Cổng: t98 `--strict` **EXIT 0** (fields=112 reached=105 uncovered=0 **nested_gaps=0**, allow_listed=7, 5 control applies=true) · t114 16/16 · t113 38/38 · t107 12/12 · t99 11/11 (không sửa t99) · t56 20/20.

**Mutation riêng của captain (kiểu khác member)**: đổi vế in `ts` của nhánh `member_inbox` thành hằng `new Date(0).toISOString()` (−9 B) ⇒ cổng **EXIT 2** với `GATE ERROR: the UNMUTATED copy is already red (nested_gaps=1), so a red mutant would prove nothing`; phục hồi `identical=true`. Đây là bằng chứng witness theo ĐƯỜNG DẪN KHOÁ bắt được lớp 'in ra nhưng giá trị không thể đổi text' — đúng lớp V18-F2.

**t119 (boot-free C5/C7/resetFixture) — VERIFIED.** Captain tự chạy: t114 16/16 · t113 38/38 · t115 33/33, cả ba EXIT 0. Attempt 1 nộp đúng sản phẩm nhưng card đỏ vì T119-F1 (bảng FROZEN còn ghim 88dbee40/213 071) — hoá giải bằng cách SỬA NGUỒN ở t117 (quy ước t114: ai ghi `lib/**` thì cập nhật bảng trong CHÍNH task đó), KHÔNG nới kỳ vọng và KHÔNG sửa t59 từ t119 (outOfScope).

### Bài học (thành luật)
1. **Công cụ**: chương trình `run_code` dài quá ~3 KB bị cắt và lỗi hiện ra như lỗi PARSE TypeScript (`Expected ',', got ';'`) — không phải lỗi cú pháp thật. Viết nội dung dài bằng 2–3 lần append ngắn, đừng dán một chuỗi khổng lồ.
2. **Hồ sơ**: ba hàng `docs/TODO.md` (t104, t105, t113) từng bị ghi CỤT đúng ở 2 000 ký tự vì dán nguyên output bị truncate. Sau mỗi lần ghi hàng phải kiểm bằng máy: `(truncated to \d+ chars)` = 0 **và** mỗi hàng đúng 7 dấu `|`.
3. **Hợp đồng**: mở `inScope` vào bên trong một package thì phải THU HẸP `outOfScope` trong CÙNG một amendment — nếu không cổng `check-contract` báo FAIL (f) (`outOfScope` bao trùm `inScope`). Đã dính ở t117 rev 2.
4. **Fail-closed**: khi baseline đã đỏ, cổng từ chối chạy mutation (EXIT 2) thay vì báo xanh — muốn chứng minh một phép mutation thì phải chứng minh baseline sạch trước.

## Vòng 19 (phần 2) — captain tự chấm t121 và bắt được sự kiện ghi ngoài tiến trình

**t121 VERIFIED.** Captain tự đo tarball: sha256 `2770fbfc4070eb80…3cc6251e` / **2 248 092 B** / **133 entry / 0 entry thư mục**; `--analyze` trên run dir **11/11 EXIT 0** (A9 19/19 export + SELF_MUTATION caught, A10 `t98 --strict` GREEN tại thời điểm pack, A11 drift=0); `--negative` **EXIT 0** với 3 kiểu mutation và 2 tiến trình thật cho exit 0/1; profile `agent-teams-pack18` **13/13 SAME**, không symlink, `0.2.0-dev.0`.

**Bài học 1 — suite phải chạy được bằng CHÍNH tệp đang nộp.** Member khai thật: họ chạy `--fresh` khi suite còn 51 657 B, sau đó thêm code cho `--negative` nên tệp nộp là 54 370 B. Captain chạy lại `--fresh` bằng tệp 54 370 B ⇒ **11/11 EXIT 0**, cùng sha — nếu không chạy bước này thì artefact chỉ được chứng minh bởi một tệp KHÔNG còn tồn tại. Luật: acceptance của pack phải viết 'chạy `--fresh` bằng chính tệp sẽ nộp', và captain phải tự chạy lại sau khi member sửa code.

**Bài học 2 — 'drift=0' có thể đỏ vì một tiến trình KHÁC, và đó là thông tin.** Lần `--fresh` đầu của captain đỏ A5/A7: `lib/tools.js` bị ghi thành `f3abdf76…/213 689 B` (−26 B) rồi tự trả lại `e51734ba…/213 715 B` sau <20 s (mtime `2026-11-01T02:08:18.627Z`). Loại trừ bằng đo: package.json KHÔNG có `prepack/prepare`; không script nào trong `tests/`, `tools/`, `packages/dsh-agent-teams/scripts/` ghi vào `lib/tools.js`; chạy lại 02:10 sạch `drift 0/0` và mtime KHÔNG đổi. ⇒ sự kiện MỘT LẦN, ngoài tiến trình (BUG-028 tái diễn lần 2). Luật: khi một cổng drift đỏ, phải chạy lại NGAY để phân biệt 'nền không đứng yên' với 'hành vi của suite', và phải ghi cả hai lần đo.

**Bài học 3 — đừng chấm bằng tệp khác tệp đã sinh artefact.** Cùng lý do với bài học 1: con số sha phải gắn với (tệp suite, tệp nguồn) tại thời điểm chạy; nếu tệp suite đổi sau đó thì phép đo cũ chỉ còn giá trị lịch sử.

**Bài học 4 — phạm vi ghi của suite phải được nêu trong doc.** `--fresh` của t121 tự cài lại profile `agent-teams-pack18` nên lock `file:` bị trỏ về run dir của chính lần chạy; không sai (cùng sha) nhưng người đọc sau dễ kết luận nhầm 'sai tarball'. Doc phải nói rõ điều này (đã ghi trong `docs/kiem-thu/t121-pack.md`).

## Vòng 19 (phần 2) — captain chấm t122 (audit vòng 19) + mở t123/t124/t125 + đính chính BUG-028

Bối cảnh: audit vòng 19 trả verdict PASS (TARBALL t121 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CÓ ĐIỀU KIỆN) kèm 7 finding, trong đó 3 medium. Captain tự đo lại toàn bộ tuyên bố hồi quy (t114 16/16 · t115 33/33 · t113 38/38 · t107 12/12 · t99 11/11 · t56 20/20 · t98 `--strict` GREEN) trước khi ghi sổ.

Bài học 1 — sự cố 'ghi không chủ' 02:08:18Z KHÔNG phải bí ẩn môi trường. mutation A của audit-goat (in `ts` bằng hằng, −26 B) có sha `f3abdf76bc8c/213 689`, TRÙNG KHÍT `tableAfter` mà suite pack của captain ghi trong `run-2026-11-01T02-08-00Z`. Tức là hai member chạy song song trên cùng cây nguồn: một bên đo (pack `--fresh`), một bên đột biến trực tiếp rồi phục hồi. Việc này làm ĐỎ OAN một lần chạy hợp lệ. Luật: (a) card mutation/audit phải ghi câu 'mọi phép đột biến chạy trên BẢN SAO' ngay trong `acceptance`, không chỉ trong brief gửi sau; (b) captain không chạy song song một suite đang lấy mẫu cây nguồn khi member đang đo.
Bài học 2 — khi tạo card phải truyền `kind` ngay trong cùng object literal: t123/t124/t125 tạo ra với `kind=work` (thiếu tham số `kind:'repair'`) dù contract vẫn lưu đủ acceptance/verify/inScope. Hậu quả: board không đòi verdict; captain vẫn phải tự chấm như card repair. Sau mỗi lần tạo card: đọc lại ledger và khẳng định `kind`, `assignee`, `status` đúng ý.
Bài học 3 — gửi brief cho member của plugin phải dùng `agent_teams_send_message` (tool của plugin); `send_message` (API teammate của DSH) trả `Error: active teammate "dev-runtime-goat" not found` vì member plugin không phải teammate DSH. Lần này tốn một lượt gọi oan.
Bài học 4 — sửa hồ sơ bằng NEO NGUYÊN VĂN + assert count===1 rồi đo lại bằng máy: hôm nay đã sửa heading §2.3, đoạn bằng chứng, `tasks=…`, số hàng TODO, số đường dẫn; sau mỗi lần vá phải `grep -c` để khẳng định chuỗi cũ đã về 0 và chuỗi mới xuất hiện đúng số lần.

Đo lại sau khi sửa (bằng máy): `docs/TODO.md` rows=125 unique=125 badCols=0 dup=0 truncated=0; tally VERIFIED=116 · CANCELLED=4 · SUPERSEDED=2 · IN_PROGRESS=3 (t123,t124,t125) · FAILED=0 · OPEN=0; `dependency-report` tasks=125 realEdges=113 derivedEdges=138 waves=53 problems=0; `check-logs` logs=7 ok=7 fail=0 warnings=2 problems=0 newest_round=19 newest_task=125; `check-doc-paths` files=5 paths=103 paths_missing=0 links=41 links_missing=0.

## Vòng 19 (phần 3) — chấm t123/t124/t125: cả 4 finding còn lại đóng, không đổi byte sản phẩm

Ba card song song, ba tầng khác nhau của cùng một câu hỏi: cổng của đội có nhìn thấy đúng cái nó tuyên bố canh hay không.

Bài học 1 — mutation của CAPTAIN phải nhắm một chiều khác chiều member đã phá, nếu không chỉ là lặp lại. t125: member phá PAYLOAD (`removed_count` lấy từ mảng khác) còn captain phá CHÍNH BỘ KIỂM (`else if (false)`) ⇒ cổng trả EXIT 2 fail-closed thay vì xanh. t124: member dựng fixture ghi 1 byte, captain phá phép LẤY MẪU (`const after = before`) ⇒ a16 đỏ ⇒ chứng minh thứ đang gác là phép lấy mẫu, không phải fixture.
Bài học 2 — một cổng fail-closed chỉ đáng tin khi nó TỰ chạy đối chứng âm của chính nó trong cùng lần chạy. t125 đưa NEGATIVE CONTROL 6 vào chế độ `--strict` thường (không phải cờ riêng), nên mỗi lần CI xanh là mỗi lần bằng chứng 'cổng còn răng' được tái lập; trước vòng 19 điều này chỉ có ở suite pack.
Bài học 3 — đóng finding phải kèm câu 'byte sản phẩm có đổi không'. Cả ba card chỉ ghi `tools/**` + `tests/**`; captain đo lại `lib/tools.js` `e51734ba…`/213 715, `lib/state.js` `56664c59…`/57 508, `package.json` `92a64040…`/10 498 ⇒ verdict phát hành vòng 19 còn hiệu lực, KHÔNG phải mở vòng mới chỉ vì sửa cổng.
Bài học 4 — nuance phải viết ra chứ không làm tròn: dưới `--strict`, dòng của suite vẫn in `PASS` (đó là exit code của suite) trong khi WARN ở cột riêng và công cụ exit 3. Hai chiều thông tin, đã ghi vào báo cáo để người đọc không tưởng mâu thuẫn.

Đo lại sau khi đóng (bằng máy): `node tests/t120-sweep-suites.mjs` 20/20 EXIT 0 · `node tests/t118-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t121` EXIT 0 (`sha256Now 2770fbfc…`, `bytesNow 2 248 092`, `entriesNow 133`, `13/13 same`) · `node tools/sweep-suites.mjs --list` 66 = 8 LIVE + 58 fast, legacy 8 · `--run --only t56 --strict` EXIT 3 · `--tgz-flip` `caught=true A2 fails A4 passes originalExit=0` · t115 43/43 · t98 `--strict` GREEN `roster_invariant_problems=0 roster_mutant_exit=1` · t107 13/13 · t99 11/11 · t113 38/38.

## Vòng 19 (phần 4) — cổng hợp đồng bắt đúng một lỗ của captain khi tạo card phụ thuộc

Card **t127** (review của t126) được tạo với verify `node tests/t126-released-bytes-boot.mjs --analyze tests/tmp/t126`. Cổng hợp đồng trả **FAIL (a)** `missing: tests/t126-released-bytes-boot.mjs` — đúng: tệp đó do chính card PHỤ THUỘC (t126) tạo và chưa tồn tại ở thời điểm cổng chạy.

Điều đáng ghi: phép (a) chỉ miễn trừ tệp nằm trong `deliverables` của CHÍNH card (`plannedByTask`). Với card review, lệnh chạy suite của card được review là hợp lệ về nghiệp vụ nhưng vi phạm về cơ chế — hai thứ khác nhau.

Cách xử lý đã chọn: **giữ nguyên cổng**, đổi hợp đồng — verify chỉ còn lệnh chạy được NGAY (`node tests/t98-render-coverage.mjs --strict`), còn lệnh chạy suite của t126 chuyển thành **acceptance B0** kèm điều kiện 'sau khi t126 completed'. Đã `agent_teams_amend_task(t127)` rev 1 ⇒ cổng PASS 6/6.

Bài học: (1) khi tạo card phụ thuộc, mọi lệnh verify phải chạy được Ở THỜI ĐIỂM CỔNG CHẠY, không phải ở thời điểm card sẽ chạy; (2) lỗ này KHÔNG nên vá bằng cách nới phép (a) — nới ra là mở đường cho verify trỏ tệp ma, đúng lớp lỗi đã gây sự cố t74/t103/t111; (3) đã đưa lỗ này vào brief t127 như một mục B5 để audit-goat phán quyết độc lập thay vì captain tự kết luận.

## Vòng 19 (phần 5) — chấm t127 (audit bộ byte phát hành) và chốt dừng vòng lặp

Captain đo lại độc lập 6 phép trước khi chấp nhận verdict, và cả 6 khớp: profile audit `isSymlink=false`; lock `file:dist/vong-19`; **13/13 bản cài == bảng đóng băng** kèm byte size; 13/13 nguồn không đổi; ERP `9f7420b6…`/1 533 117 B; closure 101 dòng + AUDIT.md 353 dòng/30 heading. Đây là lần đầu có **hai** profile độc lập cùng cài từ tgz phát hành và cùng cho kết quả đúng.

Bài học 1 — **một cổng chấm trạng thái SỐNG thì verdict của nó có hạn dùng.** VB-F3 của audit chỉ ra `--analyze` luôn đo lại artefact + cây cài + profile (tests/t126-released-bytes-boot.mjs:567-586) và không đọc `artifact.json`, nên verdict analyze cũ KHÔNG chứng minh profile tại thời điểm chạy. Điều này không sai thiết kế (nó chống 'artifact tự khai'), nhưng phải nói ra; muốn vừa chống tự khai vừa chứng minh được ảnh chụp lịch sử thì phải ghi realpath + 13 hash vào artifact rồi fail-closed khi thiếu.
Bài học 2 — **render của tool không byte-exact giữa hai phiên trên cùng dữ liệu** (VB-F1: lệch 8 ký tự ở blob `Supplemental observations` của task t4, lib/tools.js:3380). Vì vậy mọi so sánh render về sau phải so theo HEADER/trường đã chọn hoặc chấm lại bằng boot thật — không ghim golden theo toàn văn. Đây là lỗi ở cách TÔI từng muốn chấm, không phải lỗi sản phẩm.
Bài học 3 — kiểm tồn tại ≠ đảm bảo nội dung: audit t127 tự tái lập `FAIL (a)` trên card t127 (createdAt 02:37:44Z < mtime suite 02:44:09Z) và đồng ý cách xử lý chuyển lệnh thành acceptance B0, KHÔNG thêm miễn trừ 'tệp do dependency tạo'. Miễn trừ đó sẽ mở đường cho verify trang trí.

Chốt: người dùng quyết định DỪNG vòng lặp sau t127. Không mở V20; không đổi version; không commit/publish. Finding VB-F3 chuyển thành việc mở bàn giao (chỉ chạm `tests/**`, không ảnh hưởng verdict phát hành).

## Vòng 20 — captain: chốt thứ tự panel + mở 5 card (2026-11-01)

1. `ask_user_question` hỏi vị trí `DependencyMap` bị **deadline 120 s của `run_code` cắt** (mặc định `timeoutMs` 120000) ⇒ câu hỏi không tới được người dùng. Bài học: gọi tool tương tác phải nâng `timeoutMs` (tối đa 600000) hoặc không dùng trong `run_code`.
2. Vì không có dữ liệu nào truy ra 'vị trí cũ' (21 bản cài plugin trên máy đều cùng thứ tự; docs/log không ghi), captain chốt **giả định (A)**: thứ tự mới = `[ProgressOverview, DependencyMap, AddMemberControl, (members IIFE), workspace && WorkspaceSummary]`. Người dùng nói 'về vị trí cũ' ⇒ hiểu là dependency bị đẩy XUỐNG dưới trước đó; form add-member đứng ngay trên danh sách.
3. Đo trước khi giao: `lib/client.js` 258 432 B (258 271 ký tự), anchor `ProgressOverview` 175 575 · `orderDelegationMembers` 175 654 · `AddMemberControl` 181 760 · `DependencyMap` 181 856; `lib/client.js.map` 19 sources, `sources[2]='../lib/client/ActivityPanel.js'`, `sourcesContent[2]` TRÙNG KHỚP byte với nguồn ⇒ map phải cập nhật cùng lúc.
4. Luật nhắc lại: card phải mang `assignee` ngay khi tạo (đã làm), và `tools/check-contract.mjs` phải PASS trước khi gửi brief. t131 FAIL (a) vì verify trỏ hai suite do t128/t129 tạo sau ⇒ `amend_task` rev 1 chuyển chúng thành acceptance.

## Vòng 21 — captain tự chấm t134 (vá sourcemap V20-F1) và 3 bài học

### 1. Một phép đột biến 'chạy xong' KHÔNG có nghĩa là đã áp dụng
Script đột biến đầu tiên của tôi in `mutated 1918 2595 -> sc 179` và trả exit 0, nhưng điều kiện khớp của nó sai (`prevGc + delta === target` thay vì `gc === target`) nên **không sửa byte nào**; suite vì thế vẫn 16/16 EXIT 0 và rất dễ bị đọc thành 'cổng không có răng'.
Chỉ vì tôi **đọc lại bằng bộ giải VLQ độc lập** (viết riêng, không dùng mã của member) mà thấy `MUTANT 0 []` — tức là phép đột biến chưa hề xảy ra.
**Luật**: sau mỗi phép đột biến phải chứng minh nó ĐÃ áp dụng bằng một phép ĐỌC ĐỘC LẬP (hash, hoặc giải lại dữ liệu), không tin thông điệp thành công của chính script đột biến. Sửa điều kiện rồi chạy lại ⇒ `FAIL M4` đúng nguyên văn.

### 2. 'Thiếu file cấu hình' ≠ 'không có toolchain'
Tôi từng kết luận repo không còn toolchain build sau khi kiểm `tsconfig*.json` và `scripts/clean-build.mjs` — SAI: `build/build.mjs` (esbuild 0.28.2) tồn tại và tái lập `lib/client.js` **byte-identical**. Kết luận sai đó đã được ghi vào BA/ACTIVITY/báo cáo và phải đính chính.
**Luật**: trước khi khẳng định 'không có công cụ X', phải grep theo HÀNH VI (`build`, `pack`, `generate`, `compile`) trong `package.json` scripts + toàn repo, không chỉ tìm file cấu hình của một toolchain cụ thể.

### 3. Đo độ lệch phải bằng cấu trúc, không bằng số byte
Map cũ và map mới **cùng 404 958 B**; nếu chỉ so bytes/sha của cả tệp thì vẫn thấy khác, nhưng nếu ai đó chỉ so `mappings.length` (114 429 cả hai) thì kết luận 'không đổi'. Phép chấm đúng là GIẢI VLQ rồi so vị trí nguồn của từng neo. Đột biến số (2) ở trên chính là ca chứng minh: mappings dài y nguyên mà vẫn sai.
## Vòng 21 (phần 2) — captain chấm t136 và công bố

### 1. So hai bộ byte phải bằng CẤU TRÚC entry, không bằng sha của cả tarball
Tarball vòng 20 và vòng 21 chỉ +3 B; nếu chỉ so sha của `.tgz` thì biết 'khác' mà KHÔNG biết khác cái gì. Phép đúng: giải nén cả hai rồi so từng entry — 133 tệp, đúng 1 tệp khác (`lib/client.js.map`, cùng 404 958 B). Cách này còn tự chứng minh 'không có entry ngoài dự kiến', thứ mà sha không nói được.

### 2. Sweep toàn bộ dài hơn 9 phút — chạy NỀN, đừng để trần lệnh cắt
Lần đầu tôi bọc `win_bash` timeout 540 s ⇒ mã trả về **124** (cái bị cắt là TIẾN TRÌNH BỌC, không phải sweep hỏng), và tôi suýt kết luận sai 'sweep không chạy được'. Đúng: `run_in_background: true` rồi `job_output(wait)` hoặc đọc log; log ghi `EXIT=0` + `summary:` mới là bằng chứng.

### 3. Finding mức thấp thì mở MỘT card gộp, đừng mở vòng mới
5 finding của vòng 21 đều low/info và 4 trong số đó nằm ngoài bộ byte ship (`tools/`, `tests/`, `build/`, docs). Mở vòng mới sẽ vô hiệu verdict vừa đạt; đúng là một card `t137` với outOfScope chặn `lib/**` + `package.json`, nên verdict vòng 21 vẫn nguyên hiệu lực trong lúc vá.

## Vòng 21 (phần 3) — chấm t137 + sửa 12 hàng bảng hỏng âm thầm

### 1. Hàng bảng do script dựng lại phải normalize khoảng trắng
Khi vá 12 hàng `docs/TODO.md` có dấu `|` thô, tôi ghép ô bằng `join('|')` ⇒ hàng thành `| t125|VERIFIED|…`. Markdown VẪN render đúng, nhưng mọi checker nội bộ (dùng `split(' | ')`) đọc ra 1 ô ⇒ lần kiểm ngay sau đó báo sai. Luật: mọi hàng do máy dựng lại phải ghép bằng `' | '` và bọc `'| ' + … + ' |'`, rồi kiểm lại bằng CHÍNH checker sẽ dùng về sau.

### 2. Đếm cột phải đếm dấu `|` CHƯA escape
`split('|')` trên hàng có `\|` vẫn tách ⇒ 12 hàng cũ (t31, t42, t51, t55, t71, t74, t78, t98, t99, t100, t103, t125) mang dấu `|` thô trong ô đã nằm im qua nhiều vòng kiểm, vì checker cũ đếm theo `split(' | ')` (dấu thô thường dính chữ nên vẫn ra 6 ô). Phép đúng: đếm `(?<!\\)\|` = 7, hoặc parse theo cú pháp markdown. Đã escape cả 12 hàng và kiểm lại: `rows=137 unique=137 badSpacing=0 badPipes=0 maxLen=1967`.

### 3. Chiều mutation còn thiếu: phá CHÍNH bộ kiểm
Các vòng trước đột biến SẢN PHẨM rồi xem cổng có đỏ. Lượt này đột biến CHÍNH cổng: bỏ đếm WARN fixture trong `tools/sweep-suites.mjs` ⇒ chính `tests/t120` phải đỏ (a21, a22). Nếu cổng không có ca tự-chấm thì một cổng bị làm mù vẫn xanh. Luật: mỗi card cổng phải có ≥1 ca mà đột biến nhắm vào BỘ KIỂM, không chỉ nhắm sản phẩm.

### 4. Dòng `.gitignore` gộp 'script sinh ra' với 'sản phẩm sinh ra'
`packages/dsh-agent-teams/build/` bị ignore CẢ THƯ MỤC, nên `build/build.mjs` (pipeline thật, esbuild) **không nằm trong repo** — 3 vòng audit trước đều 'chứng minh bằng build' trên máy này, nhưng một bản clone sạch thì không dựng lại được `lib/client.js` + `lib/client.js.map`. Phát hiện chỉ lộ ra khi `git add` báo `The following paths are ignored by one of your .gitignore files`.
**Luật**: (a) với mỗi artefact đã công bố, phải trả lời được 'clone sạch có dựng lại được không' — kiểm bằng `git check-ignore -v <path>` cho từng tệp NGUỒN (build script, generator, schema); (b) ignore theo TỆP SINH RA, không theo THƯ MỤC, khi trong thư mục đó còn script.

## Vòng 21 (phần 2) — cài plugin vào DSH Desktop + chạy thử (m07292)

1. **Profile `desktop` không boot được bằng CLI.** `dsh --profile desktop --json -` trả exit 1 sau 491 ms: `error: profile "desktop" is managed exclusively by the Electron application`. Muốn thử trước khi người dùng restart app thì phải dựng một profile SAO byte-identical và boot profile đó, rồi nói rõ bản sao thay cho bản thật.
2. **`--session-id` là RESUME, không phải đặt id.** `dsh: session "<uuid>" does not exist; omit --session-id to start a new Session`. Muốn một phiên có id biết trước để gắn vào `captainSessionId` thì phải boot MỘT lần không có cờ, đọc `sessionId` từ JSONL, ghi id đó vào `team.json`, rồi resume — đúng chuỗi mà `tests/t59-erp-live-copy.mjs` làm.
3. **Ghi route lên member không có phiên sống để lại hai dấu vết phụ.** Bản copy ERP sau một lần `set_member_route` khác gốc đúng 4 chỗ: `captainSessionId` (do ta rebind), `routeOverride` (kết quả cần), `members[8].status` `working`→`idle`, `tasks[106].updatedAt`. Hai chỗ sau là hệ quả của lần ghi; ghi nhận để lần sau không nhầm là hỏng dữ liệu.
4. **Một suite LIVE báo FAIL không có nghĩa sản phẩm sai.** t18 báo 6/9 FAIL, nhưng chính artifact của nó chứng minh sản phẩm đúng: notice `[model changed: …]` seq 19, `request/header` seq 11 cũ → seq 20 mới, task giữ attempt 1 và hoàn thành. Bài học: trước khi mở card sửa sản phẩm, phải đọc artifact và chỉ ra ca nào trượt vì ĐỌC SAI CHỖ; nếu không sẽ đi vá một thứ không hỏng.
5. **`--analyze` phụ thuộc trạng thái SỐNG của workspace là một lớp lỗi.** Team bị archive trong lúc chạy (model tự gọi thêm `agent_teams_delete`) ⇒ mọi phép đọc `team.json` sống trả undefined và 6 ca trượt. Bộ kiểm phải có fallback đọc bản archive và phải IN RÕ nguồn nó đọc — đã thành A1/A2/A3 của t138.

## Vòng 21 (phần 3) — người dùng bác bố cục panel, mở t139

1. **Giả định (A) của captain là SAI, và sai vì đã không hỏi.** t128 chốt 'dependency lên TRÊN khối member' khi không có dữ kiện nào về 'vị trí cũ' (đã quét 21 bản cài, không bản nào khác). Yêu cầu thật là HAI CỘT: phải = Task dependencies, trái = list member, add-member ngay trên list.
2. **Triệu chứng người dùng thấy mới là thứ đáng chặn:** DAG 138 task không có giới hạn chiều cao (`.dagViewport` chỉ `overflow-x:auto`) nên đứng trước khối member thì đẩy add-member + list member ra khỏi màn hình — nhìn như 'mất cả cột'. Bài học: đặt một khối có chiều cao phụ thuộc DỮ LIỆU (số task) TRƯỚC một khối có chiều cao phụ thuộc NGƯỜI DÙNG (số member) là lỗi bố cục, không phải lỗi thẩm mỹ.
3. **Luật mới:** yêu cầu về BỐ CỤC mà không có ảnh/không có bản cũ để đối chiếu thì phải đưa vào `ask_user_question` kèm mô tả từng phương án, KHÔNG tự chọn rồi ghi 'giả định (A)'. Ghi giả định vào log không làm nó đúng.

## Vòng 21 (phần 3b) — bài học khi chấm t138

1. **CLI fail-closed tự bắt chính captain.** Tôi chạy `node tests/t18-hot-switch-e2e.mjs --negative` (thiếu đường dẫn) và nhận `FAIL usage — --negative can mot duong dan` + EXIT 2. Đó là hành vi ĐÚNG (fail-closed) — nhưng bài học là: đọc usage trước khi chạy, và một EXIT khác 0 chưa chắc là sản phẩm hỏng.
2. **`--analyze` chỉ đọc phải được chứng minh bằng trạng thái artifact, không bằng lời khai.** Cách kiểm rẻ: chạy analyze trên artifact ĐÃ FAIL rồi đọc lại `result.json` — nếu vẫn FAIL thì analyze không tự chữa. Nay là phép kiểm bắt buộc cho mọi `--analyze`.
3. **Vượt trần lượt suite phải báo thẳng, không giấu.** Member tự khai 14 lượt (trần 6) và 2 boot (trần 3), kèm lý do 6 lỗi thật của chính bộ kiểm. Captain chấp nhận nhưng ghi vào hồ sơ: trần là để phát hiện vòng lặp, không phải để bắt member dừng khi còn lỗi thật.

## Vòng 22 — captain tự chấm t139 (panel hai cột) + t140 (pack vòng 22)

1. **Mutation phải nhắm cả BỘ KIỂM, không chỉ sản phẩm**: hai phép của captain (hoán nhãn `data-panel-column` member↔dependency, delta 0 B; xoá `max-height:52vh;` trong CSS, −16 B) làm t128 rơi 24 → 18 ca, trong đó C3 là ĐỐI CHỨNG ÂM của chính phép thứ hai — tức bộ kiểm tự chứng minh nó không phải 'so chuỗi cho vui'.
2. **Sửa nguồn mà không rebuild là một lớp lỗi riêng**: hai phép trên cũng làm B3 (build trên bản sao phải tái lập byte-identical) và X2 (bảng FROZEN) đỏ — dấu hiệu đúng cho 'nguồn đã đổi, bundle chưa sinh lại'. Ghi vào luật: mọi card đổi giao diện phải có bước `node build/build.mjs` và bảng FROZEN cập nhật TRONG CÙNG task (quy ước t114).
3. **Cổng hợp đồng bắt hai lỗi thật của captain trong cùng vòng**: (a) t139 thiếu `tests/t129-pins.mjs` trong `inScope` dù acceptance A6 đòi nó EXIT 0 ⇒ phải amend rev 1, KHÔNG nới kỳ vọng; (b) t141 khai `outOfScope: tests` bao trùm `inScope: tests/tmp/t141` ⇒ phép (f) FAIL, và bản amend đầu bị TỪ CHỐI vì entry `../ERP` chứa `..` — bài học: `outOfScope` chỉ nhận đường dẫn workspace-relative thuần, muốn chặn thư mục cha thì liệt kê TỆP cụ thể.
4. **Đo offset phải nói rõ đơn vị**: captain đo byte trong bundle giải nén từ tarball (grid@176 449 · member@176 577 · dependency@182 917); member đo 176 450 / 176 578 / 182 918 vì marker của họ bỏ dấu nháy mở. Lệch +1 đồng nhất ⇒ cùng một sự thật, nhưng nếu không ghi đơn vị và marker thì hai bên sẽ cãi nhau về 'sai số'.
5. **`--analyze` của t140 đã chứng minh chỉ-đọc**: sha tarball trước/sau khi chấm giống tuyệt đối (bài học T132-F1 đã vá ở t133 và được kế thừa qua khuôn t135).

## Vòng 23 — captain chấm t142 (panel ba khối) và vì sao phải mở vòng sau vòng 22

1. **Bố cục phải hỏi hoặc đối chiếu ảnh, không được tự chọn**: t139 tôi tự chốt 1:1 rồi ghi log; người dùng bác bằng ảnh chụp panel thật (mọi thứ bị bóp trong ~490px). t142 đổi sang **1:2** với cột trái `minmax(280px,1fr)` và đưa `DependencyMap` ra thành **con trực tiếp** của `section.team`. Luật: thay đổi bố cục phải có (a) ảnh chụp/geometry từ người dùng, hoặc (b) một bản cài cũ làm chuẩn — nếu không có cả hai thì phải `ask_user_question`.
2. **Đột biến phải đặt lại ĐÚNG thứ bị bác**: phép của tôi đổi `2fr`→`1fr` (−1 B) làm t128 đỏ ở C1/C2 với nguyên văn '(NOT the rejected 1 : 1)' và '(the rejected t139 split)' — tức cổng ghi nhớ chính sai lầm đã bị người dùng bác, chứ không chỉ so chuỗi.
3. **Cấu trúc DOM mới phải xoá dấu vết cũ**: t142 xoá hẳn `panelColumns`/`panelColumnAside` khỏi mã và CSS, và t143 được giao phép kiểm byte rằng `data-panel-columns` xuất hiện 0 lần trong bundle bản cài — nếu để lại, một bố cục cũ có thể 'sống sót' trong khuyết điểm mà không cổng nào thấy.
4. **`agent_teams_update_task` từ chối `completed` + `needs_revision`**: audit-goat đúng khi đóng t141 bằng `status=failed` + verdict `needs_revision`. Ghi vào luật để lần sau không mất lượt thử.
5. **Ngưỡng `@container` không tên đo container gần nhất, không phải phần tử đang style**: `@container (width>=800px){.team[data-workspace-team]{…}}` đo container TỔ TIÊN gần nhất có `container-type` (ở workspace là `.eDfHrq_root`), không đo `.team`. Đây là rủi ro đã khai trong `docs/kiem-thu/t142-three-columns.md`; nếu sau này chèn container khác thì ngưỡng có thể sai phần tử.

## Vòng 23 (phần 2) — bài học từ t145

1. **Đột biến 0 byte mới là phép thử đúng cho khoảng mù ngữ nghĩa**: đổi `minmax(0,2fr)`→`minmax(0,1fr)` trong CSS NHÚNG giữ nguyên số byte (256 ký tự → 256), nên mọi cổng so byte/build đều im lặng; chỉ phép so NGỮ NGHĨA mới bắt. Luật: với mỗi lớp dữ liệu bị SAO CHÉP (CSS nhúng vs tệp nguồn, DTO vs render), phải có một assertion so hai bản THEO NGHĨA, không chỉ so hash tệp.
2. **`originAt()` lấy segment cuối có `genCol <= column`** ⇒ một anchor đặt ở cột 45 không bao giờ chạm segment bắt đầu ở cột 40; nếu muốn phủ dấu `(` của call site phải có anchor riêng với `maxLead`. Anchor thiếu segment là khoảng mù im lặng: test vẫn xanh, mapping sai vẫn lọt.
3. **Doc lịch sử phải đánh dấu là lịch sử, không sửa số cũ**: t128 doc có số của vòng trước; member ghi rõ 'mục 1–5 là số lịch sử' thay vì viết lại — đúng hơn là làm cho quá khứ trông như hiện tại.

## Vòng 23 (phần 4) — chấm t146/t147 và đóng phiên

1. **Bảng sweep phải đếm được cả nhóm chạy lâu**: 9 suite pack (npm pack + cài profile + boot thật) bị xếp nhầm vào 'fast' nên `--run` sinh FAIL(timeout) GIẢ — t146 tách thành nhóm **PACK** riêng (`skipped(pack)=9`, chạy lại bằng `--include-live`). Luật: một suite vượt cửa sổ thời gian phải nằm ở nhóm riêng, không bao giờ để nó làm đỏ bảng mặc định.
2. **Ngoại lệ LEGACY phải kiểm được bằng máy**: `exceptionProblems()` đòi `reason` + `fix` + citation `file:dòng` mở được; mục hỏng KHÔNG được whitelist mà rơi về FAIL thật (ca a26/a27 của `tests/t120-sweep-suites.mjs`). Đây là cách để 'xoá một ngoại lệ' không thể âm thầm biến thành 'xanh'.
3. **Tài liệu phải trích nguyên văn từ mã, không diễn giải**: t147 chép đúng câu từ chối ghi của `lib/members.js` (offset 75 432) và lỗi CLI `profile "desktop" is managed exclusively by the Electron application`; tôi kiểm lại bằng grep trước khi chấm VERIFIED.
4. **Câu hỏi mở phải nằm trong tài liệu, không nằm trong đầu người viết**: mục 5 'đã chứng minh / chưa chứng minh' liệt kê rõ phần chưa chứng minh (ví dụ DOM sống trong GUI do Host kiểm soát) thay vì để người đọc tự suy.

## Vòng 23 (phần 5) — số liệu hồ sơ phải đếm lại bằng máy

- Tôi từng ghi trong báo cáo 'cả 45 tệp Telegram đều có message id'. Đếm lại lần 1 (regex `message_?[Ii]d["\s:]*\s*\d+`) ra **38/47** — nhưng đó là regex SAI: các kỳ cũ dùng dạng `<!-- messageId=23 ... -->` (dấu `=`, camelCase).
- Đếm lại lần 2 (regex `message[_ ]?id\s*[=:\s]\s*\d+`, không phân biệt hoa thường) ra **41/47**; 6 tệp `ky-10, ky-17, ky-18, ky-20, ky-21, ky-22` KHÔNG ghi id. Báo cáo nay ghi đúng 41/47 và nêu tên 6 kỳ thiếu.
- Bài học: một con số tự khai trong hồ sơ phải được ĐẾM LẠI bằng regex đúng định dạng thật của dữ liệu; regex sai cho ra 'đã kiểm' giả và làm mọi kết luận sau đó lệch.

## Vòng 25 — bài học (equal-height và cổng parity)

1. **Đo bằng JS trong `useLayoutEffect` là cược vào thời điểm**: bản t148 chạy đúng trên trang tĩnh nhưng trên app thật `memberColumnRef.current` còn null ⇒ observer không bao giờ được tạo, biến CSS không được gán, và **suite vẫn xanh** vì H-checks chỉ đọc mã. Luật: bố cục phải làm bằng CSS nếu làm được; nếu buộc dùng JS thì phải có phép đo DOM thật trong app (không phải trang tĩnh).
2. **`contain:size` là cách đúng để 'cột này không quyết định chiều cao hàng'**: nó khiến card phải chỉ nhận chiều cao từ hàng grid (`align-self:stretch`), nên form mở/đóng là tự co giãn; đánh đổi đã đo: khi cột trái chỉ 1 hàng thì card phải cao tối thiểu = padding+border (38 px) ⇒ lệch +16 px nhưng **vẫn cuộn nội bộ được** nên không mất nội dung.
3. **Parity hai bản sao KHÔNG đủ**: audit vòng 25 chứng minh thêm `overflow:hidden` vào CẢ hai bản thì parity vẫn xanh (hai bản đồng ý với nhau!) trong khi DAG bị cắt ⇒ phải có phép kiểm NGỮ NGHĨA riêng cho hành vi (cấm clip) chứ không chỉ so hai bản.
4. **Cổng phải so theo TÊN THUỘC TÍNH, không chỉ đếm problem**: t153 assert `problem.includes('> align-self ')` cho từng ca, nên một ca đỏ vì lý do khác không thể 'đỡ' cho ca đang hỏng.

## Vòng 26 — bài học (khoá, mặc định, và cái giá của 'chỉ cần đúng khi chạy đua')

1. **Cổng chỉ chứng minh điều mình đo**: t155 có ca 'hai lời gọi song song ⇒ 1 phiên' nhưng khi audit BỎ `withTeamLock` thì ca đó vẫn xanh — vì hai lời gọi tuần tự trong test không tạo cửa sổ đua thật. Muốn canh khoá phải có **đầu dò chèn độ trễ trong vùng tới hạn** (audit làm: 40 ms sau `readTeam` ⇒ 11/11; bỏ khoá ⇒ 10/11). Đây là V26-F1 và là việc còn nợ.
2. **Mặc định phải được canh bằng assert dương**: `start_if_needed` mặc định `false` được bảo vệ bởi 4 assert của t155 (schema optional, `/Default false/`, `starts.length 0`, câu trả lời cũ nguyên văn) — audit đổi default→`true` thì t155 đỏ 9/11. Tức hành vi 'không cờ thì không spawn' không phải lời khai.
3. **Escalate override rồi xoá là chủ ý, nhưng có giá**: `members.js:1070-1076` ghi `provider/model` TRƯỚC khi xoá `routeOverride` nên cold-resume không mất route (audit xác nhận), đổi lại dòng `working` mất provenance `source:'erp'` (V26-F3). Khi tài liệu hoá phải nói cả hai vế.
4. **Timeout của suite LIVE là dấu 'chưa kết luận', không phải hồi quy**: `t154` timeout 120 s sau khi boot xong 7,9 s (V26-F4). Ghi là finding low và theo dõi, không được vội kết luận sản phẩm hỏng.

## Vòng 26 (phần 2) — ĐÍNH CHÍNH: hai hàng rào, không phải một

- **Tiền đề SAI**: audit t158 và tôi đều nói 'bỏ `withTeamLock` quanh `startMemberOnDemandNow` ⇒ 2 phiên, nên `t155` 11/11 là cổng mù'.
- **Sự thật đo được (t159)**: `lib/members.js:893-907` giữ mutex THỨ HAI (`withPending`, thông điệp `member model selection is already pending`). Bản sao bỏ `withTeamLock` một mình: `lockless copy … starts=1 started=[true,false]` ⇒ **vẫn 1 phiên**. Bản sao bỏ CẢ HAI: `got 2 sessions` ⇒ mới đỏ.
- **Hệ quả với V26-F1**: finding vẫn hợp lệ nhưng phải phát biểu lại — cổng phải canh **CẶP hàng rào**, không phải canh riêng `withTeamLock`. A2 của t159 (đòi bản sao bỏ khoá phải đỏ) là **bất khả thi** ⇒ t159 FAILED là đúng, và t160 đóng lại với tiêu chí đúng.
- **Bài học phương pháp**: trước khi viết tiêu chí 'bỏ X thì phải đỏ', phải **grep xem còn hàng rào nào khác** cùng bảo vệ bất biến đó; nếu không, tiêu chí sinh ra một card bất khả thi và một finding sai.
- **Bài học harness**: đổi `withTeamLock(k, async () => {` thành IIFE phải thêm `()` ở cuối — thiếu thì `await` trả về chính HÀM, bản sao không spawn, và đối chứng trông như 'got 0 sessions' (bắt được nhờ in `starts=N started=[…]` trong assert).

## Vòng 26 (phần 4) — captain: viết lại README theo yêu cầu người dùng

- Yêu cầu (m08808): commit + push nhánh `main`, set `main` làm default, viết lại README đầy đủ chức năng.
- README cũ 50 dòng/2 572 B (còn trỏ tarball vòng 19 đã hết hiệu lực) ⇒ viết lại **234 dòng/20 524 B**, 10 mục: cài đặt (kiểm sha trước khi cài) · 8 nhóm chức năng · bảng 16 tool · cổng kiểm + bộ test · build · quy trình phát hành · giới hạn đã biết · cấu trúc repo · đọc thêm · license.
- Số liệu trong README đều ĐO LẠI trước khi viết, không copy từ báo cáo: `sweep-suites --list` ⇒ `totals: 75 suite(s) = 9 LIVE + 8 pack + 49 fast; legacy exceptions: 12` cho `--root tests`, `85 suite(s) = 10 LIVE + 12 pack + 50 fast` cho toàn bộ; `tests/*.mjs` = 75 tệp; `packages/dsh-agent-teams/tests/*.mjs` = 10 tệp; `lib/**` = 38 tệp JS/1 147 093 B.
- Lỗi của captain khi viết: lần đầu ghi '74 suite' theo con số cũ của báo cáo ⇒ sau khi đo lại phải sửa 2 chỗ. Bài học lặp lại lần thứ ba: mọi con số vào tài liệu phải đo tại thời điểm viết.
- Bảng markdown trong README được kiểm bằng máy (đếm `|` chưa escape theo từng bảng): 0 bảng lệch cột.
- `.gitignore`: thêm `out/` — thư mục scratch `out/portrait-smile/` (22 tệp, ảnh 5 MB) không thuộc plugin và không được commit; ignore chứ KHÔNG xoá.
