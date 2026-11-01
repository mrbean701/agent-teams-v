# Báo cáo: plugin @nanmicoder/dsh-agent-teams v0.1.28

Cập nhật lần cuối: 31/10/2026. Người đọc: session leader dự án ERP (E:\Project\ERP).
Mục tiêu của báo cáo: đọc plugin mà đội ERP đang dùng để chuẩn bị viết một bản mới có hai tính năng — (1) đổi model khi member đang chạy, (2) thêm member thủ công.
Phạm vi đọc: toàn bộ gói đã cài tại C:\Users\thang\.dsh\profiles\desktop\node_modules\@nanmicoder\dsh-agent-teams, trạng thái đội erp-erp đang chạy, và script vận hành của ERP.

## 0. TL;DR

1. Gói plugin là ESM JS đọc được 100%, kèm 32 file .d.ts; riêng client còn có sourcemap nhúng sourcesContent đủ 15 module. Fork được ngay, không phải dịch ngược. Nhưng gói KHÔNG có mã TS gốc và KHÔNG có cấu hình build — muốn sửa UI phải tự dựng build hoặc vá bundle 249KB.
2. Hai tính năng cần thêm hiện KHÔNG có ở lớp lệnh và lớp giao diện, nhưng hạ tầng đã sẵn: đổi model lúc chạy chính là cơ chế đường fallback đang dùng (members.js:616-642 + installModelSelection của host); thêm member lúc chạy thì công cụ agent_teams_add_member đã làm được (tools.js:1159-1262).
3. Bốn nút chặn thật sự: (a) requireStagedTeam chặn mọi đường sửa danh sách khi đội đã chạy; (b) /plan chỉ có updateStagedPlan, không có cửa cho đội đang chạy; (c) selectionRef đang sống nằm trong closure của member, không có bảng tra; (d) UI chỉ cấp model directory cho đội staged.
4. Đội ERP là bằng chứng trực tiếp: 14 member, 7 bản gốc đã bị removed và 7 bản thêm tay mang hậu tố -2, tất cả reasoningEffort max; kèm script chan-doan-doi-model.ps1 hướng dẫn đúng quy trình thay máu này.
5. Khuyến nghị: fork gói hiện tại, thêm routeOverride kiểu additive, một registry selection sống, và tách logic add_member thành runtime dùng chung cho cả tool và Web. Không viết lại từ đầu.
6. Cảnh báo thời điểm: erp-erp đang running, qa-do-2 đang làm t107. Không thay plugin trong profile desktop khi đội đang chạy.

## 1. Vị trí và đóng gói

### 1.1 Đường dẫn và phiên bản

- C:\Users\thang\.dsh\profiles\desktop\node_modules\@nanmicoder\dsh-agent-teams — phiên bản 0.1.28, bản duy nhất trên máy.
- E:\Project\ERP không có node_modules và không giữ bản cục bộ: đội ERP dùng chính plugin trong profile desktop.
- package.json: main lib/index.js; exports "." (types lib/types/index.d.ts, default lib/index.js), "./client" (lib/client.js, types lib/types/client/index.d.ts), "./cordis.patch.yml", "./package.json".
- engines: node ^22.19.0 || >=24, dsh >=0.1.2-alpha.2. Peer: 26 gói @deepseek-ai/* đều khai báo "*", @deepseek-ai/cordis ^4.0.2, react ^18.2.0.

### 1.2 Thành phần trong gói

- lib/: 23 module .js (index, state, tools, scheduler, members, mailbox, snapshot, quality-gates, lineage, profiles, capabilities, artifacts, events, event-types, tool-names, tool-policies, web-routes, workspace-audit, harness-compat, command, types...) + thư mục client/ (15 module) + thư mục types/ (32 .d.ts) + client.js (249KB, đã bundle) + client.js.map.
- client.js.map có khoá: version, file, names, sources, sourcesContent, mappings; 15 sources kèm sourcesContent đầy đủ (1.6KB đến 11KB mỗi file) — dựng lại được mã client.
- lib/git-artifact-stamp.json: schema 1, source 2410f05a..., output 53a636ad... (dấu build, không phải URL kho upstream).
- Gói KHÔNG kèm script build, tsconfig, hay mã TS gốc; scripts/ chỉ có doctor.mjs, compatibility.mjs, legacy-session-source-repair.mjs.

### 1.3 Host nạp plugin thế nào

- cordis.patch.yml (1102 ký tự): insert id agent-teams, name @nanmicoder/dsh-agent-teams, config stateDir .agent-teams, memberProvider spawn. Cài bằng dsh plugin --profile <tên> add <gói>.
- Cấu hình hợp lệ nằm ở index.js:46-141: fallback route (46, 65, 70, 78), stateDir mặc định .agent-teams (60), memberModel (62), memberLlmProvider (63), maxMembers z.natural().min(1).default(8) (100); giá trị dùng thật tại 121-141, trong đó maxMembers ?? 8 ở 128.

### 1.4 Bề mặt tương thích host

- harness-compat.js tự nhận ba thế hệ API tạo member: startActivation (delivery parent) → startContinuable → start; usesManagedActivations(runtime) quyết định có restore persona/toolFilter hay không; guardSubagentCreation bọc cả ba hàm tạo.
- Ghim ký hiệu: Symbol.for(dsh.subagent.queuePrompt) và Symbol.for(dsh.subagent.deliverPrompt) cho hai thế hệ host khác nhau.
- Bản mới phải giữ nguyên adapter này, nếu không sẽ vỡ khi host đổi tiếp.

## 2. Kiến trúc

### 2.1 Bản đồ module

- index.js — entry: schema cấu hình, đăng ký 14 tool, web route /plan (khoảng 300-408) và /art (412 trở đi), card factory cho panel, lắp runtime.
- state.js — đọc/ghi team.json dưới khoá, validate thành viên tại 648-673.
- tools.js — 14 handler; gate staged tại 140-146; add_member 1160, remove_member 1264, edit_plan 999.
- scheduler.js — kickTeam (207), kickMember (221), cap nội dung phụ thuộc 2000 và 12000 ky tu, assignmentPrompt dựng đề bài; doc đầu file mô tả luật park member.
- members.js — installMemberSelectionRuntime (479-668): admission gate 501-513, chọn route khi activate 550-560, xử lý lượt lỗi 561-608, selectionRef 612-613, fallback listener 616-642, bridge withPending 644-667; đẩy báo cáo về captain 262-274.
- mailbox.js — hộp thư jsonl, giao/nhận/ack.
- snapshot.js — dữ liệu cho panel: memberModelRoute 24-32, route từng member 68-70.
- tool-names.js — TEAM_TOOL_NAMES 14 tên, MEMBER_TOOL_NAMES 4 tên, CAPTAIN_TOOL_NAMES 10 tên.
- tool-policies.js — BUILTIN_DENY_TOOLS và resolveMemberToolFilter (deny không bao giờ rỗng).
- Còn lại: quality-gates.js, lineage.js, profiles.js, capabilities.js, artifacts.js, events.js, event-types.js, web-routes.js, workspace-audit.js, command.js.

### 2.2 Vòng đời một đội

- create: nếu approval required thì phase staged, chưa spawn ai.
- approve: index.js:303-321 gọi approveStagedTeam rồi steer một thông điệp vào captain (wrap try/catch vì phê duyệt đã ghi xong).
- running: scheduler tick, mỗi lần đúng một claim nguyên tử rồi đánh thức member tương ứng.
- member làm việc, báo cáo qua send_message hoặc mailbox, cập nhật task; tick kế tiếp xét task mới sẵn sàng.
- Member ngồi không mà còn giữ attempt mở thì bị park; chỉ reassign tường minh mới xoay tua; retry tự động chỉ dành cho cold recovery (doc đầu scheduler.js).

### 2.3 Dữ liệu bền

- Vị trí: <workspace>/.agent-teams/<teamId>/team.json và inbox/*.jsonl.
- Đội: name, id, phase, halted, captainSessionId, taskSeq, members[], tasks[], profile snapshot.
- Member (state.js:648-673): id, name, role?, stopping?, provider?, model?, reasoningEffort?, activeProvider?, activeModel?, spawnError?, executionPrompt?, fallback?{provider,model}, fallbackActive?, toolPolicy?, toolFilter?{allow?,deny}, runtimeSetup?{persona,toolFilter}, joinedAt, status (idle | working | removed).
- Validate là chặn cứng ở biên đĩa: một trường sai kiểu là cả team.json bị coi không hợp lệ.

### 2.4 Control plane Web

- POST /plugins/dsh-agent-teams/plan với các action: approve (index.js:303), continue (323), discard (329), update_member (339, bắt buộc memberName + provider + model), update_task (359), add_task (376), remove_task (391); khác thì unknown plan action (396).
- Mọi action sửa đều đi qua updateStagedPlan (399) rồi trả 200 với phase/members/tasks; lỗi trả 409. Vì đi qua updateStagedPlan nên đội đang chạy luôn bị từ chối.
- Ảnh mascot qua allowlist cứng ART_ALLOWLIST (412-420, 15 file PNG).

### 2.5 Client

- StagingPlanEditor.js: mutatePlan (21-38) POST lên /plugins/dsh-agent-teams/plan và hiện body.error.
- StagedModelPicker (71-217) đọc model directory chính thức của host: useSyncExternalStore(directory.store.subscribe, directory.store.getSnapshot) (72), flatten state.groups, directory.load() (177, 213), route mới mặc định reasoningEffort default.
- StagedMemberEditor (219-292) gửi update_member; StagingPlanEditor (373-480) gửi update_task, add_task, remove_task.
- ActivityPanel.js: TeamSection (318); tới 819 chỉ truyền modelDirectory khi phase staged. client.js:3467 lặp lại đúng điều kiện đó với modelDirectories.directoryFor(captainSessionId).
- locales.js đã có các khoá plan.model.* (ví dụ plan.model.currentUnavailable, plan.model.partialFailure) — chuỗi mới phải thêm đủ mọi ngôn ngữ đang ship.
- Panel ĐÃ nhận provider/model/reasoningEffort từng member qua snapshot.js:68-70; thiếu chỉ là nút chọn route.

### 2.6 Mười bốn công cụ

| Công cụ | Dòng trong tools.js | Chạy được khi đội đang chạy |
| --- | --- | --- |
| agent_teams_create | 784 | — |
| agent_teams_edit_plan | 999 | Không (gate staged) |
| agent_teams_approve | 1128 | — |
| agent_teams_add_member | 1160 | Có |
| agent_teams_remove_member | 1264 | Có |
| agent_teams_create_task | 1324 | Có |
| agent_teams_reassign_task | 1483 | Có |
| agent_teams_claim_task | 1619 | Member |
| agent_teams_update_task | 1727 | Member |
| agent_teams_amend_task | 1954 | Có |
| agent_teams_send_message | 2034 | Member và captain |
| agent_teams_status | 2163 | Member |
| agent_teams_resume | 2294 | — |
| agent_teams_delete | 2347 | — |

## 3. Cơ chế khoá route của member

### 3.1 Bốn lớp khoá

- Lớp 1 (ghi bền): member.provider/model là route danh nghĩa; activeProvider/activeModel/fallbackActive là route đang dùng sau fallback. Chỉ members.js đọc các trường này (296-297, 302, 307); state.js chỉ validate (656-664). Mọi chỗ hiển thị đọc provider/model (snapshot.js:68-70, chuỗi render ở tools.js:1125).
- Lớp 2 (descriptor guard khi resume): members.js:550-560 lấy selection từ pending (spawn mới) hoặc selectionFromMember đọc team.json đồng bộ; nếu descriptor.agentProvider/agentModel khác member.provider/model thì throw "agent-teams: saved model route for member ... does not match its subagent descriptor" (557-558). Descriptor do host ghi lúc tạo và không sửa được — nên sửa provider/model trong team.json là tự bắn vào chân.
- Lớp 3 (selection sống): members.js:612-613 tạo selectionRef {current, assembled} rồi installModelSelection(childCtx, selectionRef); import ở members.js:14 từ @deepseek-ai/dsh-agent. Ref chỉ sống trong closure của hook — không có bảng tra, không có API ngoài.
- Lớp 4 (admission gate): members.js:501-513 hook agent/pre-step (prepend) đọc lại team.json dưới withTeamLock, trả reject nếu captainSessionId lệch, phase staged, team halted, member không còn hoặc khác id/name, đã removed, đang stopping, hoặc có task của member đang reassigning.

### 3.2 installModelSelection của host làm gì

File: C:\Users\thang\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-agent\lib\types\model-selection.js (95 dòng). Ba hook:

1. system-prompt/assemble: chụp selected = current, gọi next(), ghi selection.assembled = selected, rồi trả assembled với variables.provider/model đã ghi đè.
2. agent/request: lấy resolved = await next(), dùng selected = assembled, bỏ reasoningEffort thừa hưởng, trả provider/model/effort của selected.
3. agent/pre-step: nếu route hiện tại khác requestHeader().config thì chèn một user message bền: [model changed: assistant turns above this point were generated by <from>; the session continues with <to>].

Hệ quả cần nhớ khi viết bản mới:

- Đổi current chỉ ăn từ lần assemble kế tiếp; đổi cả current và assembled mới ép ngay request đang chạy (đường fallback làm đúng như vậy).
- Member được thông báo đổi model miễn phí, không phải tự dựng thông điệp.
- Ép effort undefined là xoá effort thừa hưởng — chỉ làm khi thật sự muốn về mặc định của model mới.

### 3.3 Đường fallback chính là đổi model lúc chạy

- members.js:616-642: nghe agent/request-error, gọi selectFallbackRoute(selectionRef.current, fallback, payload.failure.code).
- Nếu quyết định retry: selectionRef.current = selection và selectionRef.assembled = selection (624, 628), updateFallbackState ghi activeProvider/activeModel/fallbackActive = true (275-289), trả { kind: retry }.
- Vậy cơ chế user muốn đã tồn tại và đã được kiểm chứng trong production; thiếu ba thứ: kích hoạt bằng tay, ghi bền có chủ đích, và cửa vào từ tool hoặc Web.

### 3.4 Vì sao không được tái dùng cờ fallbackActive

members.js:300-302 cố ý bỏ reasoningEffort khi fallbackActive (effort id thuộc model gốc, comment ghi rõ). Nếu dùng lại cờ này cho thao tác đổi model tay thì cold resume sẽ mất effort; với ERP (mọi member effort max) đó là tụt chất lượng âm thầm, không ai thấy.

## 4. Hiện trạng hai tính năng và bằng chứng từ ERP

### 4.1 Đổi model khi member đang chạy — chưa có

- requireStagedTeam (tools.js:140-146) được gọi ở 566, 678, 716, 741, 756; edit_plan lại gọi updatePlanBatch (1113) — mọi đường sửa danh sách đều bị chặn khi đội đã chạy.
- Web: update_member (index.js:339-357) đi qua updateStagedPlan (399) nên cùng bị chặn.
- UI: modelDirectory chỉ cấp khi staged (ActivityPanel.js:819, client.js:3467) nên panel của đội đang chạy không có nút chọn route.

### 4.2 Thêm member thủ công — công cụ có, cửa vào không

- tools.js:1159-1262 đã chạy được khi đội running: kiểm tên, chặn trùng tên, chặn trần theo số member còn sống (1211-1213), resolve route (1214-1221), validate route (1236), ghi team.json (1237-1244), rồi scheduler.kickMember (1258) và đọc lại team.json để trả id thật (1259-1260).
- Nhưng /plan không có action add_member và runtime chỉ phơi updateStagedPlan, nên UI không gọi được. Logic nằm trọn trong handler, chưa tách thành hàm runtime dùng chung.
- Trần: maxMembers mặc định 8 (index.js:100, 128), đếm theo status !== removed (1211) nên member đã removed không chiếm chỗ.

### 4.3 Bằng chứng từ dự án ERP

- E:\Project\ERP\.agent-teams\erp-erp\team.json: 14 member. Bảy bản gốc status removed trên route opencode-go-new/minimax-m3.1-flash-free (ha-tang, qa-do, tai-lieu, master-hop-dong, db-luoc-do, be-api, fe-ui). Bảy bản kế nhiệm thêm hậu tố -2 trên route opencode-go/deepseek-v4.1-flash (ha-tang-2, qa-do-2, master-hop-dong-2, tai-lieu-2, fe-ui-2, be-api-2, db-luoc-do-2). Tất cả reasoningEffort max. qa-do-2 đang working trên t107.
- Hậu quả thấy được: role của member gốc mô tả vùng sở hữu file bằng tiếng Việt (ví dụ Hạ tầng đo và vận hành — vùng tools/dev/**, tools/backup/**, tools/tunnel/**, ERP/erp-db/docker/**); các bản -2 của fe-ui, be-api, db-luoc-do chỉ còn role engineer vì thêm tay — quyền sở hữu vùng file nhạt đi đúng lúc cần nhất.
- Lịch sử task cho thấy chi phí thay máu: t46-t49, t55, t77, t78 cancelled; t52, t61, t64, t67 failed.
- E:\Project\ERP\tools\session\chan-doan-doi-model.ps1 (105 dòng) là quy trình thủ công 6 bước: kiểm route bằng automation_list; remove_member từng thành viên sai route; add_member cho thành viên mới (không truyền provider/model, trần đội 8); reassign_task; bàn giao bằng send_message; ghi sổ .sessions/plans/master.md và báo Telegram. Header ghi rõ: script CHỈ ĐỌC, chỉ captain gọi được các công cụ agent_teams_*.
- Kết luận: bản mới phải làm cho quy trình 6 bước này thành thừa, chứ không chỉ thêm một nút.

## 5. Thiết kế cho bản mới

### 5.1 Nguyên tắc

- Additive: chỉ thêm trường tuỳ chọn vào team.json; đội erp-erp hiện có phải đọc được mà không cần migration.
- Giữ nguyên 14 tên công cụ và chữ ký của chúng (tool-names.js tự ghi là hợp đồng ổn định); chỉ thêm công cụ mới.
- Giữ nguyên adapter harness-compat.js cho ba thế hệ API tạo member.
- Mọi ghi team.json phải nằm trong withTeamLock; mọi thay đổi route phải qua validateMemberLlmSelections trước khi ghi.
- Không sửa provider/model đã ghi của member, để descriptor guard (members.js:557-558) không bao giờ bị kích hoạt.

### 5.2 Phương án A (khuyến nghị) — routeOverride cộng registry sống

- Dữ liệu: member.routeOverride = { provider, model, reasoningEffort?, source: manual hoặc fallback, updatedAt, by }.
- Registry: const liveSelections = new Map() trong installMemberSelectionRuntime, đăng ký ở members.js:612 với khoá teamId + ký tự NUL + memberName, xoá trong disposer 637-642.
- selectionFromMember (members.js:293-309) đọc theo thứ tự: routeOverride, rồi activeProvider/activeModel khi fallbackActive, rồi provider/model; effort đi theo đúng nguồn đã chọn.
- Setter: setMemberRoute(stateRoot, teamId, memberName, selection, ctx) chạy trong withTeamLock, validate route, ghi routeOverride, rồi nếu có ref sống thì gán cả current và assembled. Trả ba trạng thái: applied-live (member đang chạy), saved-for-resume (member idle hoặc cold), unknown-member.
- Descriptor guard giữ nguyên tuyệt đối, vì provider/model bất biến.

### 5.3 Phương án B — provider/model là route mong muốn

- Thêm descriptorProvider/descriptorModel ghi lúc spawn; guard ở 557-558 so descriptor với hai trường đó thay vì provider/model.
- Ưu: mô hình dữ liệu chỉ còn một khái niệm route, hiển thị tự nhiên, không phải giải thích hai route.
- Nhược: phải chuyển đổi cho mọi team.json cũ (thiếu descriptor* thì tạm so với provider/model), phải sửa guard, và mọi nơi đang đọc provider/model (snapshot, chuỗi render, prompt) sẽ hiểu sai trong giai đoạn chuyển tiếp.

### 5.4 So sánh và khuyến nghị

| Tiêu chí | Phương án A | Phương án B |
| --- | --- | --- |
| Số file phải sửa | 5 đến 6 | 8 đến 10 |
| Migration dữ liệu | Không | Có, phải viết nhánh tương thích |
| Rủi ro vỡ descriptor guard | Không | Có |
| Độ sạch mô hình dữ liệu | Trung bình, phải hiển thị hai route | Cao |

Chọn A. Panel hiển thị dạng: đang chạy <route override> (danh nghĩa <provider/model>) để người vận hành không nhầm.

### 5.5 Danh sách thay đổi theo lớp

| Vị trí | Việc phải làm | Tiêu chí nghiệm thu |
| --- | --- | --- |
| members.js:479 | Thêm liveSelections Map và hàm tra cứu nội bộ | Tra được ref theo teamId + tên member |
| members.js:612 | Đăng ký ref vào Map ngay sau khi tạo; disposer 637-642 xoá | Không rò rỉ khi member bị remove |
| members.js:293-309 | selectionFromMember ưu tiên routeOverride, giữ nguyên luật bỏ effort khi fallbackActive | Resume đúng route mới sau khởi động lại |
| members.js:275-289 | Thêm setMemberRoute ghi bền, tách khỏi updateFallbackState | team.json có routeOverride, không đụng fallbackActive |
| state.js:648-673 | Validate kiểu routeOverride (provider và model chuỗi không rỗng, reasoningEffort tuỳ chọn, source thuộc manual hoặc fallback, updatedAt là số) | team.json hợp lệ đọc lại được, ghi rác bị từ chối |
| tools.js (cạnh 1160) | Công cụ mới agent_teams_set_member_route { name, provider, model, reasoningEffort? } | Captain đổi route bằng lệnh, trả về trạng thái áp dụng |
| tool-names.js | Thêm tên mới vào TEAM_TOOL_NAMES, không vào MEMBER_TOOL_NAMES | Member không gọi được công cụ của captain |
| tools.js:1159-1262 | Tách thân handler thành runtime.addMember, handler chỉ parse và gọi | Một cài đặt, hai cửa vào |
| index.js:335-398 | Thêm action add_member và set_member_route, gọi thẳng runtime (không qua updateStagedPlan) | HTTP trả 200 khi đội đang chạy |
| index.js:399 | Giữ nguyên nhánh cũ cho các action sửa kế hoạch | Không hồi quy luồng staged |
| ActivityPanel.js:819 và client.js:3467 | Cấp modelDirectory cả khi running; thêm hàng chọn route từng member và nút thêm thành viên | Panel đội đang chạy có nút chọn route |
| StagingPlanEditor.js | Tái dùng StagedModelPicker qua component mới cho member đang chạy, không sửa luồng staged | Chọn route không ảnh hưởng composer của captain |
| locales.js | Thêm khoá cho route và thêm thành viên ở mọi ngôn ngữ đang ship | Không hiện khoá thô |
| lib/types/*.d.ts | Cập nhật khai báo kiểu | Không lệch API |

### 5.6 Thêm member thủ công

1. Chuyển toàn bộ logic hiện có của tools.js:1159-1262 vào runtime.addMember(captain, teamId, input): kiểm tên, chặn trùng, chặn trần, resolve route, validate route, ghi team.json, rồi kickMember.
2. Công cụ và route /plan cùng gọi runtime.addMember, nên hành vi không thể lệch nhau.
3. UI: form năm trường (tên, role, route, executionPrompt, tool_policy); route dùng lại StagedModelPicker.
4. Trần: tách làm hai giá trị cấu hình — giữ maxMembers 8 cho luồng tự động, thêm trần riêng cho thao tác tay (ví dụ 12). Không hardcode, phải đọc từ schema như index.js:100 hiện nay.
5. Đội staged thì không spawn, chỉ ghi vào kế hoạch; đội running thì kickMember ngay, đúng như nhánh running của tools.js:1258.

### 5.7 Hợp đồng dữ liệu mẫu (phương án A)

{
  id: m-12,
  name: qa-do-2,
  role: QA và kiểm thử,
  provider: opencode-go,
  model: deepseek-v4.1-flash,
  reasoningEffort: max,
  routeOverride: { provider: opencode-go, model: kimi-k2, reasoningEffort: high, source: manual, updatedAt: 1792700000000, by: captain },
  fallbackActive: false,
  status: working
}

Đọc theo thứ tự routeOverride rồi provider/model; xoá routeOverride là quay về route danh nghĩa mà không cần spawn lại.

## 6. Rủi ro và bẫy

1. Admission gate (members.js:501-513): nếu thao tác đổi route vô tình đụng cờ halted, phase, stopping hoặc reassigning thì member bị reject ở bước kế tiếp và lượt làm việc mất.
2. Descriptor guard (members.js:557-558): chỉ phương án A tránh được; sửa provider/model trên đĩa là member chết khi resume.
3. runtimeSetup thiếu thì ném lỗi ở members.js:525 (refusing an unrestricted resume): mọi thay đổi luồng spawn hay resume phải giữ việc ghi runtimeSetup { persona, toolFilter }.
4. assembled và current: chỉ set current thì thay đổi trễ một bước; muốn ăn ngay trong lúc request đang chạy phải set cả hai như 624 và 628.
5. withTeamLock: ghi team.json ngoài khoá sẽ đè mất cập nhật của scheduler; mọi setter phải nằm trong khoá.
6. state.js validate: thêm trường mà không khai báo kiểu sẽ khiến team.json bị coi không hợp lệ và cả đội dừng.
7. Bundle client: muốn có nút phải build lại client.js; gói không kèm cấu hình build nên phải tự dựng (esbuild) hoặc vá bundle 249KB. Đây là việc lớn nhất của phần UI, nên tách thành giai đoạn riêng.
8. Đa ngôn ngữ: thiếu khoá locales thì panel hiện khoá thô.
9. .d.ts viết tay: quên cập nhật là API công bố lệch với mã chạy.
10. Tương thích host: engines dsh >=0.1.2-alpha.2 và 26 peer "*" là lời hứa rất rộng; giữ adapter harness-compat.js nguyên vẹn.
11. Trùng tên công cụ: cài song song bản cũ và bản mới trong cùng profile sẽ đăng ký trùng agent_teams_*; phải đổi tiền tố hoặc cài ở profile khác.
12. Đội ERP đang chạy: reload plugin khi qa-do-2 đang làm t107 có thể làm mất selectionRef sống của member (disposer dọn sạch), đẩy member về cold resume giữa lượt.

## 7. Kế hoạch thi công

| Bước | Việc | Nghiệm thu |
| --- | --- | --- |
| 1 | Dựng bản fork chạy được: copy gói sang E:\Project\Agent-Team\packages\, đổi tên gói, giữ nguyên mã | Cài vào profile nháp, tạo được đội một member, status trả đúng |
| 2 | Registry selection sống và setMemberRoute ở lớp runtime (chưa có UI) | Captain đổi route: team.json có routeOverride; member đang chạy nhận thông điệp model changed |
| 3 | Bền hoá và cold resume | Đổi route, khởi động lại host, member resume đúng route mới, không ném lỗi descriptor mismatch |
| 4 | addMember thành runtime dùng chung và action /plan | Thêm member lúc running từ cả công cụ và HTTP; member mới có session thật và nhận task |
| 5 | Nới trần theo cấu hình | Thêm được member thứ 9 khi trần tay là 12; luồng tự động vẫn dừng ở 8 |
| 6 | UI: hàng chọn route và form thêm member, kèm build lại client.js | Trên bản sao đội ERP ở workspace nháp, đổi route hiện ngay không cần reload trang |
| 7 | Di trú | Chạy song song trên workspace nháp 1 đến 2 ngày, hoàn tất một task end-to-end bằng route mới, rồi mới cân nhắc thay cho profile desktop |

## 8. Việc cần chốt trước khi viết mã

1. Định danh gói: fork giữ tên @nanmicoder/dsh-agent-teams để thay thế tại chỗ, hay đặt tên mới để chạy song song?
2. Phạm vi giai đoạn 1: tự dựng build cho client ngay, hay chỉ làm tool và để captain đổi route bằng lệnh trước?
3. Trần member: giữ 8 cho mọi luồng, hay thêm trần tay riêng (ví dụ 12)?
4. Dữ liệu: bắt buộc tương thích ngược với team.json cũ, không migration, đúng không?

## Phụ lục A — Bảng dẫn chứng

| Dẫn chứng | Nội dung |
| --- | --- |
| tools.js:140-146 | requireStagedTeam ném lỗi khi đội đã chạy |
| tools.js:566, 678, 716, 741, 756 | Năm chỗ gọi gate staged |
| tools.js:1113 | edit_plan gọi updatePlanBatch |
| tools.js:1159-1262 | add_member chạy được khi running, chặn trần ở 1211-1213, kickMember ở 1258 |
| tools.js:1263-1322 | remove_member thu hồi task, stop activation, kickTeam |
| members.js:479-668 | Toàn bộ runtime chọn model của member |
| members.js:501-513 | Admission gate theo từng bước |
| members.js:550-560 | Chọn route khi activate, guard descriptor ở 557-558 |
| members.js:612-613 | selectionRef và installModelSelection |
| members.js:616-642 | Nghe request-error, chuyển fallback, retry |
| members.js:275-289 | updateFallbackState ghi activeProvider/activeModel/fallbackActive |
| members.js:293-309 | selectionFromMember và luật bỏ effort khi fallbackActive (300-302) |
| members.js:644-667 | Bridge withPending dùng cho spawn mới |
| state.js:648-673 | Validate member ở biên đĩa |
| index.js:46-141 | Schema cấu hình, maxMembers mặc định 8 ở 100 và 128 |
| index.js:303-334 | approve, continue, discard |
| index.js:335-399 | update_member và các action sửa kế hoạch, tất cả qua updateStagedPlan |
| index.js:412-420 | Allowlist ảnh mascot |
| scheduler.js:207, 221 | kickTeam và kickMember |
| snapshot.js:24-32, 68-70 | Route từng member gửi cho panel |
| client/ActivityPanel.js:819 | modelDirectory chỉ khi staged |
| client.js:3467 | Điều kiện staged lặp lại trong bundle |
| client/StagingPlanEditor.js:21-38, 71-217 | mutatePlan và StagedModelPicker |
| model-selection.js (host, 95 dòng) | Ba hook và thông điệp model changed |
| harness-compat.js | Ba thế hệ API tạo member |
| ERP\.agent-teams\erp-erp\team.json | 14 member, 7 removed, 7 bản -2, effort max, qa-do-2 working t107 |
| ERP\tools\session\chan-doan-doi-model.ps1 | Quy trình thay model thủ công 6 bước |

## Phụ lục B — Điều chưa xác minh, phải kiểm khi viết mã

1. readTeam có giữ trường lạ trong member hay lọc bỏ — quyết định có phải sửa state.js ngay từ bước 2 hay không.
2. sourcesContent trong client.js.map là JS đã transform, không phải TSX gốc; phải thử dựng lại bundle trước khi hứa hạn cho phần UI.
3. Reload plugin có dispose selectionRef của member đang chạy hay không — ảnh hưởng trực tiếp tới đội erp-erp đang chạy t107.
4. Nên nhồi thêm action vào route /plan hiện có hay mở route riêng — quyết định sau khi đọc web-routes.js.
