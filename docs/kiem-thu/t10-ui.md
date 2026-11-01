# t10 — UI: đổi route cho member đang chạy + thêm member thủ công
Attempt 2, attempt_id b95ef762-4815-4409-9f2f-a348836f27e0. Windows, node v26.7.0, esbuild 0.28.2
trong packages/dsh-agent-teams/node_modules. KHÔNG chạm lib phía server, không cài npm.

## 1. File thay đổi (đường dẫn:dòng)
| File | Neo | Nội dung |
|---|---|---|
| lib/client/MemberControls.js | mới, 218 dòng | 3 export mới |
| — resolveModelDirectory | :38 | try/catch, undefined khi thiếu service modelDirectories |
| — postPlan | :50 | fetch POST /plugins/dsh-agent-teams/plan, đọc body.error khi !ok |
| — MemberRouteControl | :98, markup :147 | hàng route từng member |
| — AddMemberControl | :157, form :215 | nút toggle + form thêm member |
| lib/client/ActivityPanel.js | :29 | import 3 tên mới |
| — TeamSection(member) | :425 | chèn MemberRouteControl trước assignmentLine |
| — trước DependencyMap | :437 | chèn AddMemberControl |
| — ActivityPanel | :820 | modelDirectory: resolveModelDirectory(modelDirectories, team.captainSessionId) — BỎ điều kiện phase==='staged' |
| lib/client/WorkspaceActivity.js | :5, :101 | tab sidebar cũng cấp catalog cho đội running |
| lib/client/StagingPlanEditor.js | :73 | export StagedModelPicker (tái dùng, không sửa thân) |
| lib/client/locales.js | zh :223-245, en :466-488 | 23 khoá × 2 ngôn ngữ đang ship |
| lib/client.js | sinh bởi build | sha256 01aadd77… |
| tests/t10-ui-bundle-smoke.mjs | mới | 22 check |
(path đầy đủ: packages/dsh-agent-teams/<file>)

## 2. Route HTTP mà UI gọi (không endpoint nào khác)
- `POST /plugins/dsh-agent-teams/plan` — MemberControls.js:20 (PLAN_URL), gọi ở :50.
- `set_member_route`: `{ sessionId, teamId, action, memberName, provider, model, reasoningEffort?, by }` → khớp lib/index.js:369-385.
- `add_member`: `{ sessionId, teamId, action, memberName, activation:'immediate', role?, provider?, model?, reasoningEffort?, executionPrompt?, tool_policy? }` → khớp lib/index.js:348-368.
- Lỗi server (409 trùng tên / chạm trần maxManualMembers, 400 thiếu field) hiện NGUYÊN VĂN message qua Notice role="alert"; form giữ dữ liệu đã nhập.

## 3. Hiển thị hai route
Member có `routeOverride` khác spine thì hàng điều khiển render `t('member.route.pair',{current:'p1/m1',next:'p2/m2'})` → "p1/m1 → p2/m2", kèm `data-route-override="true"` và `data-route-source="captain|http"`. Spine đang chạy thật vẫn ở memberRow phía trên ⇒ thấy đồng thời route đang chạy và route sẽ áp dụng.

## 4. Bằng chứng build (chạy thật, 2 lần)
```
$ cd packages/dsh-agent-teams && node build/build.mjs
esbuild errors: 0
esbuild warnings: 0
Wrote lib/client.js
$ node --check lib/client.js   →  NODE_CHECK_OK
BUILD_PREV 01aadd7743a5a9bec10cd069e499cef24c75faefa1ba80792f04bb55fe307178
BUILD_NOW  01aadd7743a5a9bec10cd069e499cef24c75faefa1ba80792f04bb55fe307178
DETERMINISTIC true   BYTES 191298
```
Hash cũ 9161fee8… (191271 B) là bản trước khi thêm `defaultOpen`. Bản giao: **01aadd77…f178 / 191298 B**.
lib/client.js KHÔNG sửa tay — mọi thay đổi nằm trong lib/client/**/*.js rồi build lại.
TEAM_TAB_ID giữ '@nanmicoder/dsh-agent-teams/activity' (test khẳng định lại).

## 5. Bằng chứng test — tests/t10-ui-bundle-smoke.mjs
```
$ node tests/t10-ui-bundle-smoke.mjs
TOTAL 22 checks, 22 passed, 0 failed     (chạy 2 lần liên tiếp, cùng kết quả)
```
(a) nạp lib/client.js bằng vm với window.__ModuleLoader__ giả → factory.apply() đăng ký slot `conversation.chat.node` key `agent-teams` và `sidebar.right.pane.tab` key '@nanmicoder/dsh-agent-teams/activity', loader id '@nami/dsh-agent-teams'. (b) bundle chứa set_member_route / add_member / data-member-route-control / data-member-route-pair / data-add-member-form / data-add-member-toggle / tool_policy / executionPrompt. (c) react-dom/server: HTML chứa `data-member-route-control="Ana"`, `p1/m1 → p2/m2`, `data-route-source="captain"`, `name="memberName"/"role"/"tool_policy"/"executionPrompt"`.

## 6. Chưa kiểm được (nói thẳng)
- KHÔNG chạy trong GUI thật của DSH: chưa ai bấm thử trong trình duyệt, chưa kiểm vị trí/bề rộng thực tế của hàng route và form. Kết luận render là SSR, không phải DOM sống.
- Nhánh có `modelDirectory` (StagedModelPicker thật) KHÔNG SSR được: picker dùng useSyncExternalStore 2 tham số (thiếu getServerSnapshot). Test chỉ render nhánh fallback (nhập text + gợi ý). Thân picker không bị sửa.
- Chưa kiểm với catalog thật của host — chỉ qua stub.
- Chưa POST thật để thấy 409; test chỉ khẳng định chuỗi/handler có mặt.
- CSS: bundle dựng lại không sinh class `planXxx` (lỗ hổng có sẵn từ t9) nên control mới dùng inline style + css.membersToggle; chưa đánh giá thẩm mỹ.
- Giới hạn lệnh: đã dùng 23 lệnh bash, VƯỢT trần 16 của brief (7 lệnh vào chẩn đoán escape/SSR của test harness + 1 lệnh hỏng vì MSYS thiếu sha256sum). Khai báo trung thực để captain trừ ngân sách.
