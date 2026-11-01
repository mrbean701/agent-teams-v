# t94 — render của `agent_teams_edit_plan` phải IN roster (route hiệu lực) ra văn bản tool

Vá lần 2 của **BUG-024**. Người thực hiện: dev-runtime-goat (attempt `b35f3103-5ab9-40f4-bfc3-88ff7329b8e4`).
Phạm vi: `packages/dsh-agent-teams/lib/tools.js`, `tests/t94-edit-plan-roster-render.mjs`, `docs/log/BUG.md`, tài liệu này.

## 1. Lỗi và bằng chứng E2E thật

t90 đã đưa route HIỆU LỰC vào `roster` của structured output, nhưng `render` của tool chỉ in
`${value.graph.join('\n')}` — bỏ `value.roster`. Trên đường người dùng thật, captain đọc VĂN BẢN
tool nên không thấy gì thay đổi.

Bằng chứng headless của captain (profile `agent-teams-test`, session
`session-9f394b2f-cd8a-4b99-8725-bbe39d93b670`, cwd `E:/Project/Agent-Team`), team staged 2 member
(alice có `routeOverride` deepseek-official/deepseek-v4-pro, bob engineer→qa), tool_result cũ nguyên văn:

    Staged plan updated atomically (2 members, 0 tasks, 0 dependencies). No members were spawned and no tasks were scheduled.

Không một dòng roster nào ⇒ mục tiêu của BUG-024 chưa đạt trên đường người dùng thật.

## 2. Sửa gì

`packages/dsh-agent-teams/lib/tools.js:1136-1147` (khối `output.render` của `agent_teams_edit_plan`):

- `const summary = …` — giữ NGUYÊN 100% chuỗi tóm tắt cũ (cùng biểu thức template, cùng dấu câu).
- `const body = [...value.graph, ...value.roster];` — graph trước, roster sau, đúng thứ tự `updated.members`.
- `return [{ type: 'text', text: body.length === 0 ? summary : `${summary}\n${body.join('\n')}` }];`
  ⇒ body rỗng (team không task, không member) thì KHÔNG có `\n` thừa, cũng không có dòng trống cuối.

Không đụng `editPlanRosterRow` (t90) — định dạng từng dòng roster vẫn do hàm đó quyết định, kể cả dấu
` (override)` / ` (fallback)` / ` (active)`.

## 3. Bài học công cụ: `render` nằm TRONG `output`

`defineTool` của `@deepseek-ai/dsh-tools` (bản 0.2 trong `packages/dsh-agent-teams/node_modules`) đọc
`const userRender = options.output.render;` và expose `tool.output.render(args, value)`; đối tượng
registry-ready chỉ có `{ name, description, parameters, output: { schema, render }, execute }`.
Lần chạy đầu của suite đỏ 0/9 vì gọi `def.render(...)` / `tool.render(...)` — phải gọi `def.output.render(...)`.

## 4. Bộ test `tests/t94-edit-plan-roster-render.mjs` (9 case, EXIT=0)

| Case | Kiểm gì |
| --- | --- |
| a1 | câu tóm tắt trong văn bản GIỐNG TỪNG KÝ TỰ chuỗi cũ |
| b1 | alice có `routeOverride` ⇒ text có dòng `alice (researcher; p2/m2 (override))` |
| c1 | bob không lệch ⇒ giữ đúng định dạng cũ `bob (engineer; p1/m3)` |
| d1 | thứ tự dòng = thứ tự `updated.members` (alice, bob, carol) và nằm SAU graph |
| e1 | phần graph vẫn còn (không bị roster thay thế) |
| f1 | ĐỐI CHỨNG ÂM trong bộ nhớ: render CŨ (chỉ graph) không chứa dòng roster (`applies=1 old_bytes=149 new_bytes=245 delta_bytes=96`) |
| g1 | body rỗng ⇒ không có `\n\n`, không có dòng trống thừa, không có newline cuối |
| h1 | biểu thức cũ đã biến mất khỏi `lib/tools.js`; khối render dùng `value.roster` và `body.join(` |
| i1 | replay đúng fixture E2E của captain qua tool THẬT (2 member, 0 task, update_member bob role qa) |

Text cuối của i1:

    Staged plan updated atomically (2 members, 0 tasks, 0 dependencies). No members were spawned and no tasks were scheduled.
    alice (researcher; p2/m2 (override))
    bob (qa; p1/m3)

## 5. Mutation chứng minh test có răng

Đổi `const body = [...value.graph, ...value.roster];` → `const body = [...value.graph];`
(khôi phục từ `tests/tmp/t94-tools.bak`):

- `applies=1 old_bytes=199872 new_bytes=199855 delta_bytes=-17 starts_identical=true`
- suite: `# 1/9 passed, 8 failed`, EXIT=1 (chỉ còn a1 xanh vì summary không đổi).
- khôi phục: `identical=true sha256=6150b7b287cb815dad7902ec316b900a5b4c318fea17bbe86696fc1e04d8b137 bytes=199872` (độ dài hash 64).

## 6. Hồi quy (EXIT thật, chạy từ `E:/Project/Agent-Team`)

| Suite | Kết quả |
| --- | --- |
| `tests/t94-edit-plan-roster-render.mjs` | EXIT=0 — `# 9/9 passed, 0 failed` |
| `tests/t90-edit-plan-roster-route.mjs` | EXIT=0 — `# 10/10 passed, 0 failed` |
| `tests/t50-edit-plan-removed-assignee.mjs` | EXIT=0 — `# 11/11 passed, 0 failed` |
| `tests/t87-approve-override.mjs` | EXIT=0 — `# 8/8 passed, 0 failed` |
| `tests/t43-member-profile.mjs` | EXIT=0 — `# 19/19 passed, 0 failed` |
| `tests/t10-ui-bundle-smoke.mjs` | EXIT=0 — `TOTAL 48 checks, 48 passed, 0 failed` |
| `node --check packages/dsh-agent-teams/lib/tools.js` | NODE_CHECK_OK |

## 7. Giới hạn còn lại (nói thẳng)

1. Văn bản render chỉ gồm: câu tóm tắt + các dòng graph + các dòng roster. Không in `team_id`, `status` hay số member riêng — người đọc muốn số liệu chi tiết vẫn phải xem structured output.
2. Dòng roster vẫn là HIỂN THỊ: `team.json` không đổi, spine `member.provider`/`member.model` vẫn là route khai báo (giới hạn (1) của t90 giữ nguyên).
3. DTO `agent_teams_status` và snapshot vẫn trả `provider`/`model` là spine (chúng có `next_route`/`route_origin`/`route_override` riêng) — ngoài phạm vi t94.
4. Hash "TRƯỚC" của `lib/tools.js` (`a9ad29f8…`/199 180 B) là số đo của t90, KHÔNG tái tạo được byte-identical: repo không có VCS và bản cũ không còn; đã thử 2 tổ hợp ứng viên cho khối render cũ (199 168 B và 199 173 B) đều không khớp nên không dùng chúng. Hash "SAU" đo trực tiếp và có assert độ dài 64.
5. Suite chứng minh VĂN BẢN tool, không chứng minh đường Web UI: panel vẫn đọc snapshot/DTO, nơi route hiệu lực đã có ở `next_route`/`route_origin` (t90) — muốn panel hiện dấu `(override)` cần task riêng.
