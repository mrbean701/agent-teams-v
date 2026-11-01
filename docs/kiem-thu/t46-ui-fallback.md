# t46 — HTTP + UI cho route dự phòng (fallback) của từng member

Trạng thái: ĐẠT (chờ captain chấm). Phạm vi đã chạm: `lib/index.js`, `lib/client/MemberControls.js`, `lib/client/locales.js`, `lib/client.js` (chỉ qua build), `tests/t10-ui-bundle-smoke.mjs`, `tests/t46-plan-fallback-http.mjs` (mới), `docs/kiem-thu/t46-ui-fallback.md`.

## 1. Hợp đồng
- Member có HAI route: route chính (spine `provider/model` + `routeOverride`) và route dự phòng (`member.fallback`).
- `set_member_fallback` chỉ ghi route dự phòng, KHÔNG đụng spine: spine đổi là việc của `set_member_route` (t39/t45).
- Panel phải nói được member đang CHẠY route nào (badge) và đang có dự phòng nào (hàng phụ + nút xoá).

## 2. Phía HTTP — `packages/dsh-agent-teams/lib/index.js`
- `:425` nhánh `set_member_fallback`: đòi `memberName` (:432), từ chối `fallback_clear` (:436), đòi đủ cặp (:439 `'fallbackProvider and fallbackModel are both required; a fallback route needs both halves'`), gọi `setMemberRoute(captain, {teamId, memberName, fallbackProvider, fallbackModel, fallbackReasoningEffort, by: 'web:' + sessionId, source: 'http'})`.
- `:465` nhánh `clear_member_fallback`: từ chối khi payload kèm nửa cặp (:473 `'clear_member_fallback takes no fallbackProvider, fallbackModel, or fallbackReasoningEffort; use set_member_fallback to install one'`), gọi `setMemberRoute(..., {fallbackClear: true, by, source: 'http'})`, trả `{ok, fallback_cleared: true}`.
- Không nới lỏng nhánh nào đã có: `set_member_route` (:369-388) và `clear_member_route` (:389-424) giữ nguyên; fence 401/403/405/413 của `lib/web-routes.js` chạy trước handler (case C2/F1 chứng minh).
- Ghi bền do runtime lo (t38): `member.fallback = {provider, model, reasoningEffort?}`; audit `docs/log/MODEL-SWITCH.md` nhận một dòng `(fallback ...)` mỗi lần ghi, provenance `http:web:<captainSessionId>` (case D1).

## 3. Phía UI — `lib/client/MemberControls.js`
- `:109 memberFallback(member)`: bỏ record thiếu/sai kiểu/thiếu một nửa cặp (dữ liệu cũ hoặc hỏng không làm vỡ panel), trả `{route, reasoningEffort}` với `route = provider + '/' + model`.
- `:126 routeBadgeOf(member)`: thứ tự ưu tiên `override > fallback-active > fallback > declared > active` — member ĐANG chạy route dự phòng phải khác member chỉ KHAI route dự phòng.
- `:283-286` badge dùng `badgeKey` (`data-route-badge`); `:292` hàng phụ `data-member-fallback-route` in `t('member.route.fallback', {route})`; `:295` nút `data-member-fallback-clear` (ẩn khi readOnly/không có fallback).
- `:262 clearFallback()` POST `clear_member_fallback` lên `/plugins/dsh-agent-teams/plan`; 409 hiện nguyên văn qua `Notice` (tone error ⇒ `role=alert`).
- `lib/client/locales.js`: 5 khoá mỗi ngôn ngữ — zh :237-241, en :493-497 (`member.route.origin.fallback-active`, `member.route.fallback`, `member.route.fallbackClear`, `member.route.fallbackCleared`, `member.route.fallbackClearFailed`).

## 4. Kiểm thử
- `tests/t46-plan-fallback-http.mjs` (mới, harness thật: mount plugin + http.Server + fetch thật, workspace mkdtemp; seed alice/bob(stopping)/carol): **15/15 passed, exit 0**.
  A1 set 200 · A2 team.json có `member.fallback` + spine `p1/m1` không đổi + `routeOverride` undefined · A3 set lại kèm effort ghi đè tại chỗ · B1 nửa cặp 409 · B2 trộn set+clear 409 · B3 member lạ 409 · B4 stopping 409 · B5 thiếu memberName 409 (cả hai action) · B6 clear kèm nửa cặp 409 · C1 team lạ 404 · C2 GET 405 + body rỗng · D1 audit 2 dòng `(fallback` · E1/E2 clear 200 + idempotent · F1 gate 401 chặn trước handler, team.json nguyên vẹn.
- `tests/t10-ui-bundle-smoke.mjs`: **40/40 checks** (thêm 3 mẫu member degraded/withFallback/corruptFallback, 4 marker bundle, 5 check SSR: badge fallback-active thắng badge fallback, badge fallback cho member chỉ khai, text `fallback: p1/m3`, 2 hàng fallback (record nửa cặp bị bỏ), 2 nút xoá).
- Hồi quy: t39 11/11 · t38 14/14 · t4 22/22 · t24 12/12 · t3 18/18 — tất cả exit 0.

## 5. Bằng chứng máy chạy
- Build: `cd packages/dsh-agent-teams && node build/build.mjs` hai lần liên tiếp, exit 0 cả hai, esbuild errors 0 / warnings 0.
- `lib/client.js` sha256 `f86012517284a33cf3ca3bd226056edc84943283c22a128428e5d6019564dac6` / 198 572 B; `lib/client.js.map` `a0241ae8661641c1f3bdc349990e210c29879c017c3681b0cafc4cd7210327b4` / 335 890 B (hai lần trùng hash ⇒ build tất định).
- `node --check lib/client.js` OK; map `JSON.parse`: 19 sources, 0 đường dẫn ổ đĩa, có `MemberControls`; `TEAM_TAB_ID` vẫn `'@nanmicoder/dsh-agent-teams/activity'` (1 hit).
- Chromium thật, `packages/dsh-agent-teams/build/test-load.html`: `Overall: PASS`, inject contents `["uiConversation","slots","sessions","locale","modelDirectories","layout"]`, console 0 entry.

## 6. Giới hạn đã biết
- Chưa click trong GUI sống: nhánh `StagedModelPicker` không SSR được (`useSyncExternalStore` 2 tham số, không có `getServerSnapshot`) nên chỉ kiểm ở mức chuỗi trong bundle.
- Chưa có E2E "member đang chạy bị lỗi → tự chuyển route dự phòng → panel đổi badge": t46 chỉ chứng minh đường GHI và đường HIỂN THỊ; chiều chuyển live do t45/t38 phủ ở tầng runtime.
- File `lib/client.js` là sản phẩm sinh — mọi sửa tay đều mất ở lần build sau.

## 7. Lỗi chặn phát hiện ngoài phạm vi t46 (đã đóng)
Lời gọi CHỈ fallback từng bị 409: `lib/members.js:1363` (bản cũ) là `else if (!fallbackClearing) {`, thiếu `!wantsFallback`. tests/t38 vẫn 14/14 xanh vì MỌI case của nó truyền kèm `provider/model` (dòng 133, 151, 173, 187, 298) — lỗ hổng fallback-only lọt contract. Đã báo dev-runtime-goat (chủ `lib/**` cho t43), người này sửa thành `else if (!fallbackClearing && !wantsFallback) {` và probe `tests/tmp/t43-fallback-only.mjs` cho kết quả spine `p1/m1` / fallback `p2/m3` / `routeOverride: undefined`. Sau đó t46 mới xanh toàn bộ.
