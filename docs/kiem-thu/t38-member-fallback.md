# t38 — fallback route per-member qua `agent_teams_set_member_route`

**Trạng thái:** PASS (attempt 1). Suite: `node tests/t38-member-fallback.mjs` → 14/14, exit 0.

## Cơ chế

`member.fallback` là một *tuyên bố bền* trong `team.json`: route member tụt xuống khi route chính chết
(`selectFallbackRoute`, `agent/request-error`). Nó khác `fallbackActive` — cờ *đã tụt thật sự*. Cả hai
được surface riêng. Không dùng session event: host bỏ mọi event `agent-teams/*` (F7), nên bằng chứng bền
là `team.json` + một hàng `docs/log/MODEL-SWITCH.md`.

## Chỗ sửa

| Tệp:dòng | Nội dung |
| --- | --- |
| `lib/members.js:1208-1245` | Nhận `fallback_provider`/`fallback_model`/`fallback_reasoning_effort`/`fallback_clear`; cấm trộn clear với cặp; cấm nửa cặp; cấm rỗng; resolve + `validateMemberLlmSelections` (catalog) **trước mọi ghi** |
| `lib/members.js:1215,1280,1305` | `wantsPrimary` tách nhánh: đổi route / clear / **chỉ đổi fallback** (không tự cài override) |
| `lib/members.js:1319-1328` | Ghi `member.fallback` trong **cùng** lần `writeTeam` với override; `fallback_clear` ⇒ `delete` |
| `lib/members.js:1351-1352,1374-1377,1394-1403` | Event + audit + kết quả snake_case mang quyết định fallback |
| `lib/members.js:1122-1125` | Hàng audit: cột đích thành `p1/m3 (fallback p1/m1)` / `(fallback cleared)`; giữ nguyên 7 cột |
| `lib/state.js:648-655,691` | `isMemberFallback`: provider/model phải non-empty string, effort optional; **thiếu trường vẫn đọc được** |
| `lib/snapshot.js:80-91` | Snapshot member có `fallback` |
| `lib/tools.js:1235-1238,1252-1255` | 4 tham số + 4 khoá output + câu render |
| `lib/tools.js:1284-1307` | Guard: `fallback_clear` không trộn cặp; nửa cặp bị chặn; lời gọi **chỉ fallback** không đòi provider/model |
| `lib/tools.js:2290-2300` | DTO `agent_teams_status` có `fallback: {provider, model, reasoning_effort?}` (DTO dựng riêng, không qua snapshot — bài học t30) |
| `lib/tools.js:2964-2967` | Wrapper runtime chuyển tiếp `fallback*` (HTTP + captain dùng chung một đường) |

## Cách đọc vết

- Captain: `agent_teams_status` → mỗi member có `fallback`; `fallback_active: true` nghĩa là **đang** chạy fallback.
- Người đọc/audit: `docs/log/MODEL-SWITCH.md`, cột "route mới" có hậu tố `(fallback …)` hoặc `(fallback cleared)`.
- Máy đọc: `team.json` → `members[].fallback` (đọc qua `readTeam`; sai kiểu bị từ chối).

## Bất biến đã kiểm

- `tests/t20-erp-compat.mjs` 15/15, exit 0; sha256 tệp ERP thật `9f7420b6…3e15f2d1e` không đổi.
- Legacy `team.json` không có `fallback` vẫn đọc (d1); `{provider:'  ',model:'m3'}`, `{model:'m3'}`,
  `reasoningEffort: 7` bị `readTeam`/`readTeamSync` từ chối (d3).
- Hồi quy: t3 18/18, t4 22/22, t28 20/20, t30 8/8, t37 14/14 — tất cả exit 0.

## Giới hạn còn lại

- Fallback **bền** chỉ được seed lại ở lần spawn kế tiếp: `selections.setLiveRoute` chỉ mang
  provider/model/reasoningEffort, nên một child đang chạy **không** nhận fallback mới cho tới khi khởi động lại.
- HTTP `/plan` chưa có nhánh `fallback_*` (index.js ngoài phạm vi t38) — hiện chỉ tool captain đi được.
- Chưa có test live hai provider thật: suite chứng minh *ghi bền + surface*, không chứng minh *tự tụt* (t37/t38
  không bật `agent/request-error` thật).
