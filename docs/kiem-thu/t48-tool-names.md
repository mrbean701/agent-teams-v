# t48 — lỗ hổng quyền: `agent_teams_set_member_profile` thiếu trong TEAM_TOOL_NAMES

**Trạng thái:** XONG. `node tests/t48-tool-names.mjs` → `# 6/6 passed, 0 failed` (exit 0).

## 1. Lỗ hổng (đo được, không phải suy đoán)
`packages/dsh-agent-teams/lib/tool-names.js` là nguồn duy nhất cho 3 mặt tiếp xúc. Tool
`agent_teams_set_member_profile` (thêm ở t43) KHÔNG có trong danh sách, nên:
- `lib/capabilities.js:86` `deny: TEAM_TOOL_NAMES.filter(name => !MEMBER_TOOL_NAMES.includes(name))` **không chặn nó**
  ⇒ member tự gọi được để đổi `role`/`executionPrompt` của chính nó hoặc member khác (lỗ hổng quyền).
- `lib/index.js:155` `captainPrompt: usageSectionText(TEAM_TOOL_NAMES.join(', '), …)` ⇒ captain không được nhắc tool này.
- `lib/tool-policies.js:38` `BUILTIN_DENY_TOOLS = [...CAPTAIN_TOOL_NAMES, …]` cũng thiếu ⇒ spawn member không bị deny.

## 2. Sửa
`packages/dsh-agent-teams/lib/tool-names.js:4` — thêm `'agent_teams_set_member_profile'` ngay sau
`'agent_teams_set_member_route'` trong `TEAM_TOOL_NAMES` (giữ nguyên thứ tự nhóm quản lý member).
KHÔNG thêm vào `MEMBER_TOOL_NAMES` (:9-11 vẫn đúng 4 tool: claim_task, update_task, send_message, status).
`CAPTAIN_TOOL_NAMES` (:12) là dẫn xuất `TEAM − MEMBER` nên tự nhận tool mới; ba consumer trên cũng tự đúng
vì đều lọc từ `TEAM_TOOL_NAMES` — không phải sửa tay ở nơi nào khác.

## 3. Test mới `tests/t48-tool-names.mjs` (6 nhóm, chạy qua module THẬT)
| # | assert | đường chạy |
| 1 | ∈ `TEAM_TOOL_NAMES`, nằm NGAY SAU set_member_route, không trùng tên | import `lib/tool-names.js` |
| 2 | ∈ `CAPTAIN_TOOL_NAMES` và `CAPTAIN === TEAM − MEMBER` | import |
| 3 | ∉ `MEMBER_TOOL_NAMES`; member surface vẫn đúng 4 tool | import |
| 4 | deny list của MEMBER chứa tên đó | `installTeamCapabilities(ctx, {isPendingMember: () => true})` → bắt tham số `tools.restrict({deny})` (đúng dòng capabilities.js:86) |
| 5 | chuỗi captain prompt chứa tên đó | `apply(ctx, config)` thật → lấy section `agent-teams:usage` → gọi `text({agent: captain})` (đúng dòng index.js:155) |
| 6 | 4 tool member KHÔNG bị deny; `deny.length === CAPTAIN_TOOL_NAMES.length` | như #4 |

Không re-implement bộ lọc trong test: #4/#6 đi qua `installTeamCapabilities`, #5 đi qua `apply`.

## 4. Bằng chứng máy (exit 0 hết)
- `node tests/t48-tool-names.mjs` → `# 6/6 passed, 0 failed`
- Hồi quy: t4 `22/22 cases passed` · t43 `# 19/19` · t3 `# 18/18` · t20 `# 15/15` (dữ liệu ERP nguyên vẹn)
- `node --check lib/tool-names.js` + `node --check tests/t48-tool-names.mjs` → CHECK_OK

## 5. Giới hạn còn lại
- Đây là chặn ở tầng quyền (deny) của member; luật HTTP `/plan` và UI chưa có nhánh profile (index.js/client ngoài phạm vi t48).
- `execution_prompt` vẫn chưa lộ ra DTO `agent_teams_status` (DTO dựng tay ở `lib/tools.js`), t48 không đụng.
- Chưa chứng minh bịt lỗ hổng trên một phiên HOST SỐNG (chỉ harness in-memory + module thật).
