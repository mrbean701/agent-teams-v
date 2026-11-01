# t49 — `execution_prompt` trong DTO status + HTTP action `set_member_profile`

Trạng thái: ĐẠT (chờ captain chấm). Phạm vi chạm: `lib/tools.js`, `lib/index.js` (in-scope), `tests/t49-profile-http-dto.mjs` (mới), `docs/kiem-thu/t49-profile-http-dto.md` (tệp này — docs/** không nằm trong inScope của ledger nên khai ở output).
Không chạm `lib/members.js` (t47 giữ), `lib/client*`, `build/**`.

## 1. Vì sao cần
`agent_teams_set_member_profile` (t43) chỉ đi được từ phiên captain: captain đọc `agent_teams_status` không thấy prompt từng member (DTO dựng tay, có `role` nhưng thiếu `execution_prompt`), và panel không có đường HTTP nào đặt role/prompt. t49 đóng cả hai lỗ.

## 2. Chỗ sửa
| Tệp:dòng | Nội dung |
| --- | --- |
| `lib/tools.js:2347-2353` | DTO member thêm `execution_prompt` **chỉ khi** `member.executionPrompt` là chuỗi khác rỗng: `...typeof member.executionPrompt !== 'string' || member.executionPrompt.trim() === '' ? {} : { execution_prompt: member.executionPrompt }`. Không bao giờ ghi `null`, cùng luật với `last_failure` (:2390+) và `route_override` (:2376+). Cơ chế lọc DTO theo quyền giữ nguyên — chỉ thêm trường. |
| `lib/index.js:489-521` | Action MỚI `set_member_profile` trong route `/plugins/dsh-agent-teams/plan`: đòi `memberName` (:495-496), chuỗi rỗng/blank coi như không hỏi (:498-505), cả hai trống ⇒ `throw 'set_member_profile needs role, executionPrompt, or both'` (:506), gọi `agentTeamsRuntime.setMemberProfile(captain, {teamId, memberName, role?, executionPrompt?, by: 'web:' + sessionId, source: 'http'})` (:507-514), trả 200 `{ok, member_name, role?, execution_prompt?, applied}` (:516-521). |
| `lib/index.js:522` | Dòng `const dependencies = …` của nhánh staged-plan nằm ngay sau ⇒ mọi action cũ (`update_member`, `add_task`, `update_task`, `remove_task`, `move_task`, `set_member_route`, `clear_member_route`, `set_member_fallback`, `clear_member_fallback`) KHÔNG bị nới lỏng. |

Lỗi trong try ⇒ 409 (`lib/index.js:563-566`); team lạ ⇒ 404 (`:307`); fence 401/403 chạy trước handler (`lib/web-routes.js:36-37`); 405 + body rỗng (`lib/index.js:275-279`) — tất cả KHÔNG đổi.

## 3. Kiểm thử `tests/t49-profile-http-dto.mjs` (mới, 254 dòng)
Harness thật: mount `lib/index.js` qua `apply()` + `http.Server` + `fetch` thật, workspace temp, seed `alice` (đã có child `child-alice`), `bob` (`stopping: true`), `carol`; DTO đọc bằng cách gọi chính tool `agent_teams_status` đã đăng ký trong cùng harness.
**16/16 passed, 0 failed, exit 0.**

| Case | Nội dung |
| --- | --- |
| A1 | 200 đặt role cho member ĐANG có child session; spine p1/m1 và `id` không đổi |
| A2 | 200 đặt prompt một mình, role cũ giữ nguyên |
| A3 | 200 đặt cả hai trong một lời gọi |
| B1/B2 | không đổi gì ⇒ 409; chuỗi blank ⇒ 409 |
| B3/B4 | member lạ ⇒ 409 naming it; `stopping` ⇒ 409 `is stopping` |
| B5 | thiếu `memberName` ⇒ 409 |
| B6 | role 201 ký tự ⇒ 409 `the cap is 200`, alice giữ role cũ |
| C1/C2 | team lạ ⇒ 404; `GET` ⇒ 405 `allow: POST` + body rỗng |
| D1/D2/D3 | DTO có `execution_prompt` khi member có; bob KHÔNG có khoá này (liệt kê 12 khoá đều không chứa); `role` phản ánh hồ sơ đã ghi |
| E1 | 3 dòng `MEMBER-PROFILE.md` mới, provenance `http:web:sess-captain` |
| F1 | gate 401 trả trước handler, `team.json` nguyên byte |

**Mutation test (tự kiểm chứng suite)**: đổi `: { execution_prompt: member.executionPrompt }` thành `: {}` ⇒ t49 tụt còn **15/16, FAIL D1**; khôi phục ⇒ sha256 `lib/tools.js` **trùng lại** (de6a012431bf0040…) và t49 về 16/16. Suite bắt được hồi quy thật.

## 4. Hồi quy (exit 0 hết)
`t43 19/19` · `t4 22/22` · `t24 12/12` · `t46 15/15` · `t10 40/40` · `t37 14/14`.

## 5. Giới hạn đã biết
- Panel CHƯA có form sửa hồ sơ: t49 chỉ mở đường HTTP + DTO, chưa thêm nút trong `lib/client/**` (ngoài inScope, và contract nói badge không bắt buộc).
- Chưa có case E2E "đổi prompt → member nhận ở lượt kế tiếp": t43 đã chứng minh hiệu lực `durable-only` ở tầng tool; t49 chỉ chứng minh đường ghi qua HTTP và hình dạng DTO.
- `executionPrompt` không bị cắt âm thầm: quá 4000 ký tự ⇒ 409 (t43), t49 chỉ kiểm trần role 200.
