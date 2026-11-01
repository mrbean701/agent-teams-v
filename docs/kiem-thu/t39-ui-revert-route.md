# t39 — HTTP `clear_member_route` + nút khôi phục route gốc trong panel

Task: t39 (owner dev-ui-goat, attempt 1). Trạng thái: XONG, tự chạy bằng chứng bên dưới.

## 1. Cơ chế

Member có hai route: **spine** (`provider`/`model` trong `team.json`, cũng là route mà descriptor guard
`lib/members.js:620-622` đối chiếu ở cold resume) và **override** (`routeOverride`, do captain/browser đặt).
t37 đã cho phép XOÁ override qua tool; t39 mở cùng đường đó cho trình duyệt và cho người dùng thấy
route đang chạy đến từ đâu.

- HTTP: `POST /plugins/dsh-agent-teams/plan` nhận thêm `action: 'clear_member_route'` với `{ teamId, memberName }`,
  gọi `agentTeamsRuntime.setMemberRoute(captain, { teamId, memberName, clear: true, by: 'web:'+sessionId, source: 'http' })`
  rồi trả 200 kèm body snake_case `{ ok, cleared: true, previous:{provider,model,origin}, route:{provider,model}, origin:'declared', applied, source }`.
  Đây là **action riêng**, `set_member_route` không bị nới lỏng (vẫn đòi provider+model).
- Một yêu cầu clear mà còn kèm `provider`/`model`/`reasoningEffort` bị trả 409 (mơ hồ: không biết lệnh nào thắng).
  409 cho member lạ, member `stopping === true`, thiếu `memberName`; 405/413/401/403 giữ nguyên fence hiện có.
- UI: hàng member hiện badge nguồn route (`declared`/`override`/`fallback`/`active`) lấy từ trường
  `routeOrigin` của snapshot (`lib/snapshot.js:92`, đã có từ trước — t39 không phải sửa server snapshot),
  và nút “Restore declared route” chỉ render khi member thật sự có `routeOverride` và hàng không read-only.
- i18n: 7 khoá mới × 2 ngôn ngữ (zh + en); không hard-code tiếng Việt trong UI.

## 2. Chỗ sửa (file:dòng)

| Tệp | Neo | Nội dung |
| --- | --- | --- |
| `packages/dsh-agent-teams/lib/index.js` | `:389` | `if (action === 'clear_member_route')` — nhánh mới sau `set_member_route` |
| | `:401-402` | từ chối yêu cầu clear kèm route (`clear_member_route takes no provider, model, or reasoningEffort…`) |
| | `:403-425` | gọi runtime rồi trả body snake_case (`cleared`, `previous`, `route`) |
| `packages/dsh-agent-teams/lib/client/MemberControls.js` | `:27-28` | style `ORIGIN_BADGE`, `REVERT_BUTTON` (inline, không cần css-module mới) |
| | `:100` | `routeOriginOf(member)` — chỉ nhận 4 origin đã biết, lạ/thiếu ⇒ không badge |
| | `:203-221` | `revert()` POST `clear_member_route`; 409 hiện nguyên văn qua `Notice` (tone error ⇒ `role=alert`) |
| | `:224-231` | `badge` + `revertButton` (null khi không có override hoặc read-only) |
| `packages/dsh-agent-teams/lib/client/locales.js` | `:230-236` (zh), `:481-487` (en) | `member.route.origin.*`, `member.route.clear`, `member.route.cleared`, `member.route.clearFailed` |
| `packages/dsh-agent-teams/lib/client.js` + `.map` | sinh tự động | CHỈ qua `node build/build.mjs`, không sửa tay |
| `tests/t39-plan-clear-http.mjs` | mới, 11 case | http.Server thật + `fetch` thật |
| `tests/t10-ui-bundle-smoke.mjs` | check 2 + check 3 | thêm marker bundle + 4 case SSR (badge/override, nút restore, badge declared, không nút) |

## 3. Bằng chứng (chạy thật)

- `node tests/t39-plan-clear-http.mjs` → **11/11 passed, 0 failed**, exit 0. Case: A1 clear 200 đúng shape,
  A2 `team.json` mất `routeOverride` và spine `p1/m1` không đổi, A3 clear lần hai vẫn 200 (`previous.origin=declared`),
  B1 member lạ 409, B2 member stopping 409, B3 thiếu `memberName` 409, B4 clear kèm route 409 + carol không bị chạm,
  C1 GET 405 `allow: POST` body rỗng, C2 team lạ 404, D1 log kiểm toán `docs/log/MODEL-SWITCH.md` có đúng 2 dòng
  `(cleared)` với `http:web:<session>` và không có dòng nào cho carol, E1 gate 401 chặn trước handler và `team.json` nguyên vẹn.
- `node tests/t10-ui-bundle-smoke.mjs` → **TOTAL 32 checks, 32 passed, 0 failed** (trước t39 là 25; +7: 3 marker bundle, 4 case SSR).
- `node build/build.mjs` hai lần liên tiếp: `lib/client.js` sha256 `302aa6cf3d6f2dcf3338b8000364104feff9fb796f166d695f8cb67e5f202143`
  / 195 756 B (giống nhau cả hai lần); `lib/client.js.map` `e51020e23ec6d72fc6010754b8c26078768b9c42c04e47e72a3ba283ae2b3765` / 330 671 B
  (trước t39: `0026ac70…2d89` / 193 129 B, map `28facff2…5a032` / 326 147 B).
- `node --check packages/dsh-agent-teams/lib/client.js` → exit 0. Map: 19 sources, `sourcesContent` 19/19, **0 đường dẫn ổ đĩa**,
  có `MemberControls` trong `sources`.
- Chromium thật mở `packages/dsh-agent-teams/build/test-load.html` → “Overall: PASS”, console **0 entry**,
  inject contents `[uiConversation, slots, sessions, locale, modelDirectories, layout]`.
- Hồi quy: `tests/t4-control-plane-smoke.mjs` 22/22, `tests/t37-route-clear.mjs` 14/14, `tests/t3-route-smoke.mjs` 18/18.
- `TEAM_TAB_ID` vẫn `@nanmicoder/dsh-agent-teams/activity` (grep 1 hit trong bundle; test t10 khoá cứng giá trị này).

## 4. Giới hạn / chưa phủ

- Chưa bấm thử trong GUI sống: phần SSR trong t10 render đúng markup nhưng không có click thật; `StagedModelPicker`
  vẫn không SSR được (`useSyncExternalStore` 2 tham số) nên nhánh có catalog chỉ kiểm ở mức chuỗi trong bundle.
- Chưa có E2E “member đang chạy thật → bấm restore → step kế tiếp đổi route”: đường runtime đã kiểm ở t37/t18,
  đường HTTP kiểm ở t39 trên team ghi trên đĩa (member chưa có child session, nên `applied = durable-only`).
- Badge phụ thuộc trường `routeOrigin` của snapshot; một host cũ không gửi trường này sẽ chỉ hiện route, không badge (không lỗi).
