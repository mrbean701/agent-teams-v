# Audit vòng 2 — bảo mật, tương thích, hồi quy (t12)

Người audit: **audit-goat** (độc lập, không viết mã sản phẩm) · attempt `4d8973db-68f7-420b-917a-35546fa0dce4`
Ngày: 2026-10-31 · Đối tượng: `packages/dsh-agent-teams` (@nami/dsh-agent-teams 0.2.0-dev.0, fork của @nanmicoder/dsh-agent-teams 0.1.28)
Vùng đọc: `packages/dsh-agent-teams/lib/**`, `tests/**`, `docs/**`. Vùng ghi: `docs/audit/**`, `docs/log/AUDIT.md`. Không sửa `lib/**`, `tests/**`.

## 0. Kết luận trước (đọc 30 giây)

**KHÔNG ĐẠT toàn phần** — nhưng **không có phát hiện blocker/high nào ở lớp mã**.

- Lớp mã (đổi route member đang chạy · thêm member thủ công · tương thích ERP · quyền tool/route HTTP · đa ngôn ngữ · build client · không che lỗi): **ĐẠT**, 0 hồi quy, mọi test xanh khi tôi tự chạy.
- Lớp hồ sơ đóng dự án: **CHƯA** — 3 điều kiện của mục 11 (§7 MASTER) chưa có bằng chứng: **#8** DEPENDENCIES.md khớp thực tế, **#9** TODO khớp 100%, **#11** báo cáo Telegram tổng kết đã gửi thật.
- Vì vậy tôi không thể ký ĐẠT: ký ĐẠT lúc này đúng là kiểu "PASS giả" mà chính vòng audit này phải săn.

Điều kiện chuyển ĐẠT (làm xong là đóng được): **F1, F2, F9** (mục 5). Sáu phát hiện còn lại (F3–F8, F10) là mức low/medium về độ phủ và vệ sinh build, không chặn phát hành.

## 1. Cách hiểu "mục 11 của MASTER TASK"

Trong repo không có tệp nào có "mục 11" cho MASTER TASK (đã grep: chỉ `docs/ke-hoach-staged.md:39` trích lại đề bài, và `docs/thiet-ke/thiet-ke-v1.md:389` là "## 11. Quyết định đã chốt" của tài liệu thiết kế). Tôi đọc **mục 11 = 11 điều kiện hoàn thành ở `docs/MASTER-PROMPT.md` §7 (dòng 63-65)**, và đối chiếu từng điều bằng dẫn chứng máy chạy. Cách đọc này được nêu rõ để captain bác nếu ý định khác.

## 2. Phương pháp và giới hạn

- Tự chạy lại **6 bộ test của người khác** bằng tay (không tin báo cáo), và **chấm lại 2 artifact E2E** bằng chính bộ phân tích của tác giả chúng:
  `node tests/{t3,t4,t10,t15,t20,t21}.mjs` → exit 0 hết; `t18 --analyze` → 9/9; `t11 --analyze` → 11/11.
- Viết 2 probe độc lập, import **đúng module thật** của plugin (`lib/state.js`, `lib/members.js`): `docs/audit/probe-q1.mjs` (cold-resume + guard) và `docs/audit/probe-erp.mjs` (tương thích team.json ERP thật).
- Đọc mã từng dòng cho 5 nhóm rủi ro: route/guard, quyền tool, route HTTP + auth fence, UI client, log/audit.
- Giới hạn: không cài npm, không commit, không chạm profile desktop; không mở phiên thật mới cho t18/t11 (chấm lại artifact + đọc harness để xác định tính thật); trần 3 lần thử/30 lệnh — dùng 21 lệnh.

## 3. Mười một điều kiện của mục 11 — đối chiếu bằng dẫn chứng

| # | Điều kiện (MASTER §7) | Kết quả | Dẫn chứng (máy chạy) |
|---|---|---|---|
| 1 | Đủ 5 mục tiêu gốc | **ĐẠT** (NFR chi phí còn 1 phần, đã ghi BUG-003) | `package.json:2-3` name=@nami/dsh-agent-teams 0.2.0-dev.0; `cordis.patch.yml:15` trỏ tên mới; tool `agent_teams_set_member_route` (`tool-names.js:4`); add_member (`tools.js:2740`, `index.js:348-367`); ERP compat (mục 4); route flash: `tests/tmp/e2e-t11http/.../teamA.json` |
| 2 | Cài và chạy được trong profile nháp | **ĐẠT** | `C:\\Users\\thang\\.dsh\\profiles\\agent-teams-test\\package.json:5` = `link:E:/Project/Agent-Team/packages/dsh-agent-teams`; `:9-13` bundles có @nami/dsh-agent-teams; t18/t11 artifacts có session thật exit 0 |
| 3 | Đổi route member ĐANG CHẠY, E2E thật | **ĐẠT** | `node tests/t18-hot-switch-e2e.mjs --analyze tests/tmp/e2e-hotswitch/2026-10-31T14-34-11` → exit 0, PASS C1–C9 (C7: request sau notice dùng route mới); t11 X1 = `applied=live-and-durable` |
| 4 | Thêm member thủ công: tool + HTTP + UI | **ĐẠT** | tool: t21 A1–A7 (7/7, exit 0); HTTP: t11 C7a/C7b/C7c (200 · 409 trùng tên · 409 vượt trần); UI: t10 22/22 SSR từ bundle thật (`data-add-member-form`, `name="memberName"`) |
| 5 | Tương thích team.json ERP cũ | **ĐẠT** | t20 15/15 (sha256 nguồn không đổi `9f7420b6a1af…`); probe riêng: 14 member / 7 active / 0 routeOverride, `readTeam` để nguyên bytes, override hợp lệ đọc lại đúng, override sai (`source:'evil'`) bị từ chối |
| 6 | Toàn bộ test xanh, không case skip | **ĐẠT** | 8 tệp trong `tests/`; tôi tự chạy 6 → exit 0 (18/18, 22/22, 22/22, 21/21, 15/15, 7/7); 2 E2E chấm lại → 9/9 và 11/11; grep `.skip|only(|process.exit(0)` = 0 hit |
| 7 | Audit vòng cuối ĐẠT, findings đã đóng | **CHƯA** | vòng 1 đóng 3/3 (`docs/audit/dong-finding-vong-1.md`), nhưng vòng 2 này chưa thể ký ĐẠT vì #8/#9/#11 |
| 8 | DEPENDENCIES.md khớp thực tế | **CHƯA** | `docs/DEPENDENCIES.md:5` sinh lúc 15:42:36Z, vẫn ghi t10 "⬜ claimed", t11 "⬜ pending", t22 in_progress trong khi cả ba đã VERIFIED → **F2** |
| 9 | TODO khớp thực tế 100% | **CHƯA** | `docs/TODO.md:5` "VERIFIED=18" nhưng đếm hàng bảng thực tế = **19**; `:23` ghi t15 17/17 trong khi suite in 21/21; `:30` ghi hash bundle 2dc9436e… trong khi `lib/client.js` hiện tại sha256 `01aadd77…` → **F1** |
| 10 | Log đủ 11 nhóm | **ĐẠT** | `docs/log/` có đủ 12 tệp: BA, CHECK, TEST, BUG, HANDLE, AUDIT, ACTIVITY, MEMBER, MODEL-SWITCH, ROUTING, SKILL-EXECUTION + MODEL-SWITCH-notes (75 dòng). Lưu ý F10: MODEL-SWITCH.md trong repo chỉ có header, 0 hàng dữ liệu |
| 11 | Báo cáo Telegram tổng kết đã gửi thật | **CHƯA** | chỉ có messageId của lần thử kênh: `docs/log/TEST.md:7-9` (497/3/4), `docs/log/HANDLE.md:10` (messageId=5). `docs/bao-cao-telegram/ky-01..06.md` là bản nháp, không kèm message_id → **F9** |

## 4. Trả lời sáu câu hỏi của captain

### Q1 — routeOverride có sống qua cold resume không? Guard có ném không?
**Trả lời: route MỚI thắng, không mất tính năng, guard KHÔNG ném** — với điều kiện member không bị ghi đè `provider/model` sau khi đã spawn.

Guard so **descriptor của child** với **`member.provider/model` khai báo**, KHÔNG so với route hiệu lực:
```
lib/members.js:619  const durableMember = team.members.find(member => member.name === memberName);
lib/members.js:620  selection = selectionFromMember(durableMember);   // đọc override ⇒ route để bind
lib/members.js:621  if (selection !== undefined && (descriptor.agentProvider !== durableMember?.provider || descriptor.agentModel !== durableMember?.model)) {
lib/members.js:622      throw new Error('agent-teams: saved model route for member "' + memberName + '" does not match its subagent descriptor');
```
`setMemberRoute` cố ý **không** ghi `provider/model` (chỉ ghi `routeOverride`, `lib/members.js:1128-1141`), nên `:621` vẫn cân bằng và resume bind route override qua `:620` → `selectionRef` (`:676-678`).

Thực nghiệm (`node docs/audit/probe-q1.mjs`, exit 0):
```
READ  provider/model = p1/m1   routeOverride = {"provider":"p2","model":"m2","reasoningEffort":"high","source":"captain","at":7,"by":"session-cap"}
routeOf(member) = {"provider":"p2","model":"m2","reasoningEffort":"high","origin":"override"}
GUARD descriptor = spawn-time p1/m1 | declared p1/m1 -> THROW=false
GUARD descriptor = new route p2/m2 | declared p1/m1 -> THROW=true
LEGACY read ok = true  routeOf = {"provider":"p9","model":"m9","origin":"declared"}
```
- Nhánh `THROW=false` là nhánh thật khi resume: descriptor của child đã spawn mang route lúc spawn (p1/m1) và `provider/model` khai báo chưa bị `set_member_route` đụng tới.
- Nhánh `THROW=true` chỉ xảy ra khi có ai đó **ghi `provider/model` của member đã spawn** — tức `update_member`. Đường này bị chặn ở hai lớp: `lib/tools.js:573-575` (đội running chỉ cho `update_task`) và `lib/tools.js:579-580` (`if (member.id !== '') throw ... was already spawned`). ⇒ rủi ro của vòng 1 (F3) đã đóng **bằng mã**, không chỉ bằng tài liệu.
- `spawnMember` thăng cấp route vào `provider/model` rồi `delete member.routeOverride` (`lib/members.js:919-925`) để lần resume sau không lệch; người gọi ghi đĩa ngay sau đó (`lib/tools.js:539-542`, `:2810-2813`).
⇒ **BUG-007 của captain: KHÔNG phải lỗi. Đề nghị đóng kèm probe này.**

### Q2 — t11 có tự chứng minh điều nó khai không?
**Có, ở mức một HTTP thật đi vào handler đã ship.** `tests/t11-http-e2e.mjs:293-312` import `lib/index.js`, gọi `apply(ctx, config)`, lấy route `/plugins/dsh-agent-teams/plan` từ registry rồi phục vụ bằng `node:http` `createServer`; `:314-327` `postPlan()` dùng `fetch` thật tới `http://127.0.0.1:<port>/plugins/dsh-agent-teams/plan`. Không phải gọi thẳng handler.
C5 không chỉ assert chuỗi notice: bộ phân tích in `PASS C5 — member transcript holds the host notice [model changed: ...] and the next request/header uses command-code-goat/...` (chạy lại `--analyze` hôm nay: 11/11 PASS, exit 0).
**Giới hạn phải nói rõ:** harness thay host bằng stub, và `connection` gate được stub cho **luôn cho qua** (`:272`) ⇒ t11 **không** chứng minh nhánh từ chối 401/403/503 (xem F3).

### Q3 — săn PASS giả
Đã rà 8 bộ: **không có case skip, không có in PASS khô, không có mock tự viết trả PASS**.
- `grep -rn ".skip|only(|process.exit(0)|FIXME|TODO|not implemented" tests/` → 0 hit.
- Harness trung thực ở chỗ khó nhất: `tests/t21-add-member-e2e.mjs:183-185` stub `startActivation` trả `childId`, nhưng `:338-347` **bắt buộc** hoặc `spawned=true`, hoặc `spawned=false` **kèm `member.spawnError`** — nếu im lặng thì A2 FAIL; `:393-419` đọc file `http.json` thật và kiểm cả 200 + roster + 4xx trùng tên.
- `tests/t20-erp-compat.mjs` băm lại chính tệp ERP thật trước/sau (C18) — không thể PASS nếu plugin ghi đè dữ liệu.
- Điểm yếu còn lại (không phải PASS giả, nhưng là assert giòn): nhiều assert là so khớp chuỗi trong text tool (vd `/added and started \\(session /` ở t21:334) ⇒ đổi câu chữ sẽ làm đỏ một tính năng đúng. Mức **low**, không chặn.

### Q4 — soát UI mới và hồi quy `modelDirectory`
- Xử lý 409/500: `lib/client/MemberControls.js:50-67` đọc `body.error` khi `!response.ok`, fallback `HTTP <status>`; lỗi hiện ở `Notice` với `role="alert"`/`aria-live="assertive"` (`:88-92`). Không nuốt lỗi: chỉ có `catch {}` ở `:65` (bỏ qua lỗi parse body lỗi — vô hại) và `resolveModelDirectory` catch→`undefined` (`:43-48`) là degrade có chủ đích.
- Refresh snapshot: **không** gọi refresh sau khi đổi route, nhưng không cần — panel poll `/plugins/dsh-agent-teams/state` mỗi 1 s (`lib/client/activity-monitor.js:101` `ACTIVITY_POLL_MS = 1000`, `:110`, `:147`). Snapshot host **có** mang `routeOverride/nextRoute/routeOrigin` (`lib/snapshot.js:77-92`) nên cặp "spine → route mới" và `data-route-source` hiện được thật, không chỉ trong test SSR.
- Validate trước khi POST (AddMemberControl `:157-218`): chặn `busy` và tên rỗng (`t('addMember.nameRequired')`); **không** validate cặp provider/model trước khi gửi — nhưng chỉ gửi cặp khi **cả hai** cùng có (`:189`), và host validate + trả 409 (`index.js:348-367`, `tools.js:2770-2792`) rồi UI hiện message. Chấp nhận được.
- Hồi quy `ActivityPanel.js:820`: truyền `modelDirectory` cho mọi team là **an toàn**. `StagedModelPicker` tự gọi `directory.load()` (`lib/client/StagingPlanEditor.js:179,215`), còn khi `undefined` thì control degrade sang text (`MemberControls.js:144-146`). Không nhánh nào giả định "chỉ staged mới có modelDirectory": `TeamSection` chỉ chuyển tiếp (`:319,425,437`); nhánh `historic` vẫn `readOnly` (`MemberControls.js:110`).
- Đa ngôn ngữ: 23 khoá mới có đủ 2 ngôn ngữ (zh `locales.js:223-245`, en `:466-488`) — tôi đếm khớp từng khoá.

### Q5 — team.json ERP 14 member (7 removed) có vượt trần không?
**Không.** Trần đếm theo `status !== 'removed'`: `lib/tools.js:2767-2769` `fresh.members.filter((candidate) => candidate.status !== 'removed').length >= cap`; `cap = config.maxManualMembers ?? config.maxMembers` (`:2754`); mặc định `maxManualMembers` = 12 (`lib/index.js:103`) và bị ép `>= maxMembers` (`:145-146`).
Đo thật (`node docs/audit/probe-erp.mjs`): `ERP team {"members":14,"active":7,"tasks":107}`, `statuses {"removed":7,"idle":6,"working":1}` ⇒ `active 7 >= cap 12 -> false`, **headroom 5**. Thêm 1 member là 8, vẫn dưới 8? — lưu ý: `maxMembers` chỉ áp cho roster lập kế hoạch; `add_member` dùng `maxManualMembers` (12). Nếu ERP sau này duyệt quá 12 người sống, `add_member` sẽ trả 409 `manual member cap (12)` — hành vi đúng, cần ghi vào hướng dẫn di trú (t13).

### Q6 — phán 2 tồn đọng của t11
**(i) `live-and-durable` qua HTTP mới chứng minh bằng lập luận cấu trúc — CHẤP NHẬN ĐƯỢC.** Lý do: handler `/plan` chỉ nhận khi captain session **đang attach trong chính tiến trình đó** (`lib/index.js:297-302`, `ctx.agents.get(sessionId)` undefined → 409), và registry live là process-local (`lib/members.js:545,677,722-736`). Khi tiến trình không sở hữu child, hàm trả `applied='durable-only'` (`:1145-1148`) — tức **response không bao giờ khai quá sự thật**; t11 quan sát đúng `durable-only`. Chi phí spike để ép cùng-tiến-trình: 1–2 h + 1 phiên thật, lợi ích thấp. **Không mở spike.**
**(ii) spawn thật qua HTTP chưa chứng minh — CHẤP NHẬN CÓ CAVEAT, không bắt buộc spike.** Đường spawn đã được chứng minh ở lớp tool (t21 A2/A3: `spawned=true` trên đội running), còn HTTP chỉ khác lớp vận chuyển; trần và validate nằm cùng một hàm `addMemberNow` (`tools.js:2740-2830`). Rủi ro thật nếu bỏ qua: một lỗi chỉ xuất hiện khi webServer và session cùng tiến trình (ví dụ `kick`/scheduler undefined) — đúng loại lỗi t4 từng bắt (`scheduler is not defined`). Nếu muốn đóng hẳn: **1 lượt dogfood trên profile desktop** (POST `/plan` `add_member` với `activation=immediate`, đọc `spawned`/`member_id`) ≈ 30–45 phút, không sửa mã. Đề xuất: mở **t23** tuỳ chọn, không chặn phát hành.

## 5. Phát hiện còn lại

| ID | Mức | Nội dung | file:dòng | Cách tái hiện | Đề xuất sửa |
|---|---|---|---|---|---|
| **F1** | medium | TODO lệch thực tế (điều kiện #9): header đếm VERIFIED=18 nhưng có 19 hàng VERIFIED; t15 ghi 17/17 trong khi suite 21/21; t22 ghi hash bundle cũ | `docs/TODO.md:5`, `:23`, `:30` | `grep -c "^| t" docs/TODO.md` và đếm hàng chứa `| VERIFIED |` → 19; `node tests/t15-activate-member.mjs` in 21/21; `sha256sum packages/dsh-agent-teams/lib/client.js` → 01aadd77… | Sinh lại phần "Đếm" bằng lệnh (không đếm tay), cập nhật 3 hàng dẫn chứng |
| **F2** | medium | DEPENDENCIES.md cũ so với trạng thái task (điều kiện #8): t10 claimed, t11 pending, t22 in_progress dù đã VERIFIED | `docs/DEPENDENCIES.md:5` (sinh 15:42:36Z) + các node t10/t11/t22 trong sơ đồ | `node tools/dependency-report.mjs` sinh lại rồi diff | Chạy lại generator **sau khi t12 đóng**, thêm bước CI/checklist "regenerate trước khi giao" |
| **F3** | medium | Chưa có test nào chứng minh auth fence của `/plan`: mọi harness stub `connection` cho luôn qua, nên 401/403/503 và 405/413 không được phủ | `tests/t11-http-e2e.mjs:272`, `tests/t21-add-member-e2e.mjs:202`, `tests/t4-control-plane-smoke.mjs:82`; mã: `lib/index.js:186,271-279`, `lib/web-routes.js:9-60,62-85` | grep `requestRejection|401|403|503|405|413` trong `tests/*.mjs` → chỉ có stub trả `undefined` | Thêm 3 case: gate trả `{status:401}` ⇒ 401 + **không** ghi team.json; `GET /plan` ⇒ 405; body >1 MB ⇒ 413 |
| **F4** | low | Source map của bundle bị cũ: thiếu `client/MemberControls.js`, nhúng bản `ActivityPanel.js` cũ (63 668 B so với 63 930 B trên đĩa) | `packages/dsh-agent-teams/lib/client.js.map` (mtime 20:24) vs `lib/client.js` (23:28) | `node -e "const m=JSON.parse(require('fs').readFileSync('lib/client.js.map'));console.log(m.sources.length, m.sources.includes('../lib/client/MemberControls.js'))"` → 18, false | Build lại kèm sourcemap sau lần sửa nguồn cuối, hoặc bỏ map khỏi gói |
| **F5** | low | Bundle nhúng đường dẫn tuyệt đối của máy build (comment css-module) ⇒ không tái lập byte trên máy khác | `lib/client.js:502`, `:559`, `:2136` (`// css-module:E:\\Project\\Agent-Team\\packages\\...`) | `grep -nE "E:\\\\|/e/Project" packages/dsh-agent-teams/lib/client.js` | Đặt tên module css tương đối trong build, hoặc strip comment khi phát hành |
| **F6** | low | Tên định danh chưa đổi hết sau khi fork: hằng plugin vẫn là `@nanmicoder/dsh-agent-teams`, tab id UI vẫn namespace cũ | `lib/harness-compat.js:69` (dùng ở `:129` cho wrapper legacy), `lib/client/WorkspaceActivity.js:13` (`TEAM_TAB_ID`, dùng ở `lib/client/index.js:41,55`) | đọc 3 dòng trên; grep `nanmicoder` trong `lib/**` | Quyết định rõ: hoặc đổi kèm migration khoá UI đã lưu, hoặc ghi vào README/DEPENDENCIES là **cố ý** giữ để không mất trạng thái panel |
| **F7** | low | Mọi event `agent-teams/*` bị host bỏ: gate `KNOWN_SESSION_EVENT_TYPES` không chứa type nào của plugin (đo: 62 type, 0 type agent-teams) ⇒ "bản sao máy đọc" trong thiết kế §2.6 không tồn tại trên host này | `lib/events.js:26-47`; thiết kế: `docs/thiet-ke/thiet-ke-v1.md` §2.6 | `cd packages/dsh-agent-teams && node --input-type=module -e "const m=await import('@deepseek-ai/dsh-session');const s=m.KNOWN_SESSION_EVENT_TYPES;console.log(s.has('agent-teams/member-route-changed'), s.size)"` → `false 62` | Ghi rõ trong tài liệu là best-effort (đã có comment trong `MODEL-SWITCH.md`), hoặc thôi hứa event; test chỉ nên assert bản ghi bền (file) |
| **F8** | low | Ghi audit là best-effort: lỗi ghi chỉ `logger.warn`, tool vẫn trả thành công ⇒ audit có thể mất mà người gọi không biết | `lib/members.js:1035-1054` (catch ở `:1051-1053`) | đọc mã; thử workspace read-only sẽ thấy chỉ có dòng warn trong log host | Trả thêm `audit_written: true/false` trong kết quả tool và `/plan` để caller biết |
| **F9** | medium | Điều kiện #11 chưa có bằng chứng: 6 báo cáo kỳ là bản nháp, không kèm `message_id`; chỉ có messageId của lần thử kênh | `docs/bao-cao-telegram/ky-01..06.md`; bằng chứng gửi duy nhất: `docs/log/TEST.md:7-9`, `docs/log/HANDLE.md:10` | `grep -rn "messageId\|message_id" docs/bao-cao-telegram*` → không có trong các kỳ | Gửi báo cáo tổng kết rồi ghi `message_id` + thời điểm vào `docs/log/ACTIVITY.md` |
| **F10** | info | `docs/log/MODEL-SWITCH.md` trong repo chỉ có header, 0 hàng: hàm audit ghi vào `<workspace>/docs/log`, mà mọi E2E chạy trong workspace tạm | `lib/members.js:1008,1037`; `docs/log/MODEL-SWITCH.md:1-10` | `wc -l docs/log/MODEL-SWITCH.md` → 10; hàng thật nằm trong `tests/tmp/e2e-hotswitch/.../docs/log/MODEL-SWITCH.md` và `tests/tmp/e2e-t11http/.../audit-after.txt` | Ghi 1 hàng đối chứng (kèm đường dẫn artifact) vào `MODEL-SWITCH-notes.md`; hoặc dogfood 1 lần đổi route ngay trong workspace dự án |

## 6. Những chỗ tôi đã cố tình KHÔNG kết luận

- **Không** kết luận ĐẠT cho #8/#9/#11 (dù mã không liên quan) — đúng luật "không có PASS khi chưa có lệnh + exit code + artifact".
- **Không** coi báo cáo của t4/t10/t11/t18/t21 là bằng chứng: tôi chạy lại 6 suite + chấm lại 2 artifact bằng tay.
- **Không** coi "16 test xanh" là đủ cho auth fence — chưa có test nào chạm nhánh từ chối (F3).
- **Không** sửa một dòng nào trong `lib/**` hay `tests/**`; hai probe đặt trong `docs/audit/` và chỉ đọc dữ liệu.

## 7. Phụ lục — lệnh đã chạy trong lượt audit này

| # | Lệnh | Kết quả |
|---|---|---|
| 1 | `node docs/audit/probe-q1.mjs` | exit 0; in routeOf + 2 nhánh guard + legacy + bundle + ERP cap |
| 2 | `cd packages/dsh-agent-teams && node --input-type=module -e "const m=await import('@deepseek-ai/dsh-session'); ..."` | `has agent-teams/member-route-changed = false size 62` |
| 3 | `node -e "JSON.parse(fs.readFileSync('lib/client.js.map'))" ...` | 18 sources, không có MemberControls |
| 4 | `for f in tests/t3,t4,t10,t15,t20,t21 ...; do node $f; echo EXIT=$?; done` | 18/18, 22/22, 22/22, 21/21, 15/15, 7/7 — tất cả EXIT=0 |
| 5 | `node tests/t18-hot-switch-e2e.mjs --analyze tests/tmp/e2e-hotswitch/2026-10-31T14-34-11` | exit 0, PASS C1–C9, unproved none |
| 6 | `node tests/t11-http-e2e.mjs --analyze tests/tmp/e2e-t11http/2026-10-31T16-36-54-566Z` | exit 0, PASS C1..C8 (11 checks, 0 failed) |
| 7 | `node docs/audit/probe-erp.mjs` | ERP 14/7 active, bytes không đổi, override đọc đúng, override sai bị từ chối |
| 8 | `node -e "sha256(lib/client.js)"` | `01aadd7743a5a9bec10cd069e499cef24c75faefa1ba80792f04bb55fe307178` / 191 298 B |
| 9 | `grep -rn "TODO\|FIXME\|not implemented" packages/dsh-agent-teams/lib` | 0 hit trong mã nguồn |
| 10 | `grep -nE "E:\\\\|/e/Project" packages/dsh-agent-teams/lib/client.js` | 3 hit (F5) |

Bằng chứng thô của các lần chạy nằm ở `.audit-t12/*.log` (log từng suite) và `tests/tmp/` (artifact E2E do người khác tạo, tôi chỉ chấm lại).
