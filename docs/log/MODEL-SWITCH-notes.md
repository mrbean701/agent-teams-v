# MODEL-SWITCH — ghi chú văn xuôi của captain

Quy tắc: `docs/log/MODEL-SWITCH.md` là file MÁY ĐỌC do plugin `@nami/dsh-agent-teams` ghi (appendRouteChangeAudit, `lib/members.js:1035-1054`, header `lib/members.js:1010-1020`). Captain KHÔNG viết văn xuôi vào đó nữa — mọi ghi chú nằm ở file này.
Lý do (dev-tools-flash phát hiện ở t8, captain xác nhận): plugin append DÒNG BẢNG markdown vào file, nối vào tài liệu văn xuôi thì sẽ thành rác giữa tài liệu.

---

# MODEL SWITCH — lịch sử đổi model của member

Bảng này ghi cả hai loại: đổi model do captain điều phối (chức năng cần xây) và đổi model do fallback tự động của plugin.

| Thời điểm | Team | Member | Từ | Sang | Ai khởi phát | Xác minh sau đổi |
|---|---|---|---|---|---|---|
| 2026-10-31T13:15:33.909Z | nami-agent-teams | (toàn bộ 7 member) | opencode-go/deepseek-v4.1-flash (kế thừa lúc tạo đội) | theo bảng docs/log/ROUTING.md | captain, qua agent_teams_edit_plan khi đội còn staged | edit_plan trả roster mới có provider/model mới trước khi approve |

Ghi chú: từ nay việc đổi model của member đang chạy sẽ do chức năng mới (set_member_route) thực hiện và phải ghi vào bảng này kèm xác minh thật, không ghi khi mới đổi cấu hình.
## 2026-10-31T13:23:21.323Z — Chặn kỹ thuật: vì sao chưa thể đổi model của member đang chạy
1. Không có đường đổi route khi team đang chạy, cả tool lẫn HTTP:
   - `lib/tools.js:557` `const updatePlanBatch = async (captain, teamId, mutations, signal, allowPendingEdits = false) => {` gọi `requireStagedTeam(fresh)` ngay tại `lib/tools.js:566`.
   - `lib/tools.js:670` `const updateStagedPlanBatch = (captain, teamId, mutations, signal) => (updatePlanBatch(captain, teamId, mutations, signal));` — route Web `/plan` dùng lại đúng hàm này, nên cũng bị chặn.
   - `requireStagedTeam` (`lib/tools.js:140`) ném: `team "<name>" is already running; its plan can no longer be edited`.
2. Đường duy nhất còn lại là remove_member + add_member, nhưng KHÔNG dùng lại được tên cũ:
   - `lib/tools.js:1208-1210`: `if (fresh.members.some((candidate) => sanitizeKey(candidate.name) === memberKey)) { throw new Error(\`member name "${args.name}" has already been used in team "${fresh.name}"\`); }` — lọc theo MỌI trạng thái, kể cả `removed`.
   - Hệ quả: đổi model cho 1 member đang chạy buộc phải đẻ tên mới (`...-2`), đúng kiểu `E:\Project\ERP\.agent-teams\erp-erp\team.json` (7 gốc `removed` + 7 bản `-2`) mà dự án này phải xoá bỏ.
3. Trần member khi thêm mới: `lib/tools.js:1211-1212` tính `members.filter(c => c.status !== 'removed').length >= config.maxMembers` (mặc định 8) — churn remove+add vẫn lọt trần nhưng làm bẩn lịch sử đội.
4. Quyết định: KHÔNG churn. Giữ 4 route đắt cho t2/t3/t4 (3 task khó nhất, chưa chạy), chuyển toàn bộ sang flash ngay khi có `set_member_route`.
## 2026-10-31T13:32:57.026Z — Ca dogfood thật: thêm member trên team ĐANG CHẠY
- `agent_teams_add_member({name:'dev-tools-flash', provider:'opencode-go', model:'deepseek-v4.1-flash', reasoning_effort:'high'})` → trả `{member_name:'dev-tools-flash', status:'idle', phase:'running'}` ⇒ đường thêm member thủ công khi chạy **đã có sẵn ở 0.1.28** và chạy được; phần còn thiếu chỉ là UI và action `/plan`.
- Sau đó `agent_teams_reassign_task(t4 → dev-tools-flash)` thành công; `remove_member(dev-tools)` trả `requeued_tasks:['t8']`.
- Đối chiếu điều phải xoá bỏ: muốn ĐỔI MODEL cho kien-truc/dev-tools thì vẫn không có cách nào ngoài đẻ tên mới (`tools.js:1208-1210`) — chính là chi phí mà `set_member_route` phải triệt tiêu.
## 2026-10-31T13:47:04.182Z — Quyết định thiết kế của captain cho 3 câu hỏi t2
- (a) D6: `lib/snapshot.js`, `lib/events.js`, `lib/event-types.js`, `types/*.d.ts` giao cho dev-runtime-flash; zone chốt ghi ở `docs/quy-tac-du-an.md`.
- (b) Audit: ghi CẢ event `agent-teams/member-route-changed` (máy đọc) VÀ append `docs/log/MODEL-SWITCH.md` bước 10 (người đọc).
- (c) Tên tool chốt: `agent_teams_set_member_route`.
- Bất biến giữ nguyên: không sửa guard `lib/members.js:557`; `routeOverride` chỉ ghi thêm; khi spawn thăng cấp rồi delete `routeOverride`; member đang chạy chỉ đặt `selectionRef.current`, không đặt `.assembled`.

## 2026-10-31T14:19:09.353Z — Ca dogfood đầu tiên: KHÔNG chạy được trên phiên master hiện tại
- Lệnh: `agent_teams_set_member_route({member_name:'dev-ui', provider:'opencode-go', model:'deepseek-v4.1-flash', reasoning_effort:'high'})`
- Kết quả: **ERROR: `tools.agent_teams_set_member_route is not a function`** — không phải lỗi logic của tính năng.
- Trạng thái route TRƯỚC (đọc bằng `agent_teams_status`): `nghien-cuu=opencode-go/deepseek-v4.1-flash | dev-ui=opencode-go/kimi-k2.7-code | kiem-thu=opencode-go/deepseek-v4.1-flash | dev-tools-flash=opencode-go/deepseek-v4.1-flash | dev-runtime-flash=opencode-go/deepseek-v4.1-flash | audit-kimi=opencode-go/kimi-k2.7-code`.
- Nguyên nhân: phiên master này nạp plugin **@nanmicoder/dsh-agent-teams v0.1.28** từ `C:\Users\thang\.dsh\profiles\desktop\node_modules\...`, không nạp bản fork `packages/dsh-agent-teams` (@nami 0.2.0-dev.0). Tool mới chỉ tồn tại trong mã fork + test harness mount nó, nên catalog tool của master không có.
- Hệ quả cho NFR-CHI-PHI-01: không thể chuyển đội đang chạy sang flash bằng tool MỚI trong phiên này. Hai đường hợp lệ: (a) E2E hot-switch chạy trong profile nháp `agent-teams-test` với plugin fork được mount (task t11), (b) người dùng cài `@nami/dsh-agent-teams` vào profile desktop rồi mở phiên mới — chỉ khi đó mới dogfood được trên chính đội này. CẤM dùng lại đường vá tay `E:\Project\ERP\tools\session\chan-doan-doi-model.ps1`.
- Ghi nhận là phát hiện tích hợp thật (không phải test hỏng): tính năng đúng trong harness, chưa được nạp trong phiên sống.

## 2026-10-31T14:32:39.000Z — t8: audit vòng 1 finding #1 (provenance `by`) đã đóng
- Thiếu sót trước đó: cả tool lẫn `/plan` gọi `setMemberRoute` mà không truyền `by`, nên `lib/members.js` chỉ ghi được `source` và dòng audit không nói được **phiên nào** đã ra lệnh đổi route.
- Sửa: `lib/tools.js:1271` → `by: captain.session.id`; `lib/index.js:382` → `by: 'web:' + sessionId`. Không sửa `lib/members.js` (chỉ cần caller truyền đúng).
- Dạng dòng audit sau khi sửa (cột cuối = `source:by`): `| at (UTC) | team | member | previous | route | applied | captain:<sessionId> |` và với HTTP: `| http:web:<sessionId> |`.
- Xác minh: H1 (tool) và H2 (/plan) trong `tests/t4-control-plane-smoke.mjs` assert cả `routeOverride.by` trên `team.json` và dòng audit trong `docs/log/MODEL-SWITCH.md` của workspace; mutation test (xoá 2 dòng `by`) làm H1/H2 FAIL 20/22 rồi khôi phục 22/22 — xem docs/log/TEST.md TG-TEST-18..20.
- Rủi ro cần captain biết: `appendRouteChangeAudit` (`lib/members.js`) ghi vào `<workspace>/docs/log/MODEL-SWITCH.md` với header bảng riêng, còn file này trong repo là log văn xuôi do captain biên tập ⇒ khi chạy thật trên workspace này, dòng audit sẽ được nối vào giữa tài liệu với định dạng khác. Cần dev-runtime quyết định: đổi đường dẫn file máy đọc (ví dụ `docs/log/MODEL-SWITCH.jsonl`) hoặc để captain chuyển file này hẳn sang dạng bảng.



---

# Dẫn lại bằng chứng E2E (chuyển từ MODEL-SWITCH.md theo quy tắc file máy đọc)

## Bằng chứng E2E độc lập cho cơ chế đổi route (t18, không phải plugin ghi)

Mục này KHÔNG phải một dòng audit của plugin — bảng trên là append-only do
`appendRouteChangeAudit` ghi. Đây là bản dẫn lại row mà plugin đã ghi trong một
phiên THẬT (member **đang chạy**) khi chạy `tests/t18-hot-switch-e2e.mjs`, để người
audit thấy đúng định dạng và đúng đường đi của row.

- Lần chạy: `2026-10-31T14:34:11` — `node tests/t18-hot-switch-e2e.mjs` → exit 0, 9/9 check PASS.
- Nơi plugin thực sự ghi: `<workspace>/docs/log/MODEL-SWITCH.md` — `appendRouteChangeAudit`
  dùng `join(workspace, ...ROUTE_AUDIT_PATH)` (`lib/members.js:1032-1060`, `ROUTE_AUDIT_PATH`
  ở `lib/members.js:1008`), nên row chỉ rơi vào file NÀY khi workspace của phiên chính là repo.
  Trong E2E, workspace là thư mục tạm `tests/tmp/e2e-hotswitch/2026-10-31T14-34-11/workspace`.
- Row nguyên văn do plugin ghi:

  `| 2026-10-31T14:34:23.271Z | e2e-hotswitch | worker-a | opencode-go/kimi-k2.7-code | opencode-go/deepseek-v4.1-flash (high) | live-and-durable | captain:session-7ac539e0-7408-408f-adec-9b020af62a72 |`

- Chi tiết bằng chứng (transcript, `request/header` trước/sau, attempt không mất, cold read):
  `docs/kiem-thu/hot-switch-e2e.md` §4; log lệnh/kết quả: `docs/log/TEST.md` TG-TEST-24.
