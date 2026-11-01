# t99 — Vá các trường payload KHÔNG tới được text render (lớp BUG-025)

Task t99 (kind implementation), tiếp sau cổng tĩnh của t98. Lớp lỗi: payload của tool ĐÚNG (schema
khai đủ, DTO trả đủ) nhưng `output.render` — thứ duy nhất captain/member thật sự đọc trong
`tool_result` — không in ra, nên người đọc không thấy. Không suite nào trước t98 đối chiếu
`output.schema` ↔ `output.render`, đó là lý do 13 vòng audit trước bỏ lọt.

## 1. Chín trường cấp 1 — trước/sau

| # | trường | trước | cách vá (tệp:dòng) | case t99 |
|---|--------|-------|--------------------|----------|
| 1 | `create.members` | text chỉ có tên đội + task, KHÔNG có roster ⇒ captain đọc kế hoạch mà không thấy member mình vừa tạo | `lib/tools.js:889-901` thêm khối `Members (N):` + mỗi member `name (role; provider/model[, reasoning X]; status S[; policy P]; id I)` | a1 |
| 2 | `create.profile` | không in | `lib/tools.js:889-901` dòng `Profile: …` | a2 |
| 3 | `create.task_planning` | không in | như trên, dòng `Task planning: …` | a2 |
| 4 | `edit_plan.team_id` | không in | **KHÔNG in — đưa vào ALLOW_LIST của cổng** (xem mục 3) | a5 |
| 5 | `set_member_profile.execution_prompt` | chỉ thấy chữ "changed" | `lib/tools.js:1479-1490`: ` — execution prompt: ` + clip 400 ký tự | a3 |
| 6 | `set_member_profile.previous_role` | không in ⇒ không hoàn tác được | cùng khối: dòng `  previous role: …` | a3 |
| 7 | `set_member_profile.previous_execution_prompt` | không in | cùng khối: `  previous execution prompt: …` (chuỗi rỗng in `(empty)`) | a3 |
| 8 | `status.team_id` | không in | `renderStatus` thêm dòng cuối `Team id: … · phase: …` | a6 |
| 9 | `status.phase` | không in ⇒ đọc status mà không biết staged/running | cùng dòng cuối | a6 |

Ba trường cũ (#2,#3,#4 của `status`) đều đi qua `function clipText(text, max)` mới thêm
(`lib/tools.js`, ngay trước `renderStatus`) để prompt 4 000 ký tự không làm ngập văn bản.

## 2. Bốn nhóm LỒNG — nay không còn nhóm nào thiếu

| nhóm | trước | sau |
|------|-------|-----|
| `status.members[].execution_prompt` | không in | dòng `prompt: …` (clip 400) |
| `.active_provider/.active_model` | không in | dòng `active route: AP/AM` |
| `.fallback.*` | không in | dòng `fallback route: p/m[ (reasoning E)]` |
| `.route_override.*` | chỉ in dấu ` (override)`, KHÔNG in route nào | dòng `override route: p/m[ (reasoning E)] by SOURCE at ISO` |
| `.last_failure.*` | không in | dòng `last failure: CODE — msg[ (p/m)][ at ISO]` |
| `status.tasks[].attempt_id` | không in (chỉ có số attempt) | `attempt N (attempt_id ID)` — đúng thứ `update_task` cần |
| `status.coverage[].evidence` | không in | ` — evidence: …` sau mỗi dòng coverage |
| `create.tasks[].status/.kind` | không in | `; status=… ; kind=…` cuối dòng task |

Thứ tự in là THÊM VÀO CUỐI (`  - <dòng cũ>` + các dòng chi tiết thụt 6 dấu cách), nên mọi assert
theo tiền tố của suite cũ (t30, t59) vẫn xanh.

## 3. Một quyết định phạm vi: `edit_plan.team_id` KHÔNG in

Brief yêu cầu vá `edit_plan.team_id` (`lib/tools.js:1136`). Đo được: in thêm dòng `team_id: …` làm
**3 case của `tests/t94-edit-plan-roster-render.mjs` đỏ** (d1, g1, i1 so NGUYÊN VĂN cả text; t94 nằm
ngoài inScope của t99 và không được sửa). Vì vậy trường này được khai trong `ALLOW_LIST` của cổng
(`tests/t98-render-coverage.mjs`, mục `agent_teams_edit_plan.team_id`, kèm `file:line` + lý do) đúng
như hợp đồng cho phép: "trường nào không nên in thì bỏ khỏi cổng kèm lý do file:dòng". Lý do ghi trong
cổng: công cụ chỉ sửa được đội của chính người gọi nên id trùng danh tính đã biết, và t94 khoá nguyên
văn text này. Đây là chỗ DUY NHẤT trong 9 trường không in được — đã khai trong output của task.

## 4. Cổng t98 nay có 2 chế độ

    node tests/t98-render-coverage.mjs             # BÁO CÁO: in đủ SUMMARY + findings, EXIT 0
    node tests/t98-render-coverage.mjs --report     # như trên, gọi tên chế độ
    node tests/t98-render-coverage.mjs --strict     # CỔNG: EXIT 1 khi uncovered>0, EXIT 0 khi sạch
    node tests/t98-render-coverage.mjs --bogus      # EXIT 2: "GATE ERROR: unknown argument(s) …"
    node tests/t98-render-coverage.mjs --report --strict   # EXIT 2: hai kết luận ngược nhau

Cổng hỏng (cờ lạ, số definition ≠ 16, map dòng render cũ, đối chứng âm không bắt được, render ném)
⇒ **EXIT 2 ở CẢ HAI chế độ**. Mỗi lần chạy in một dòng `mode: …`. `RENDER_LINES` đã cập nhật theo
dòng mới sau khi vá (create 889, edit_plan 1142, approve 1254, add_member 1303, set_member_route
1366, set_member_profile 1479, remove_member 1542, create_task 1630, reassign_task 1766, claim_task
1901, update_task 2071, amend_task 2240, send_message 2317, status 2431, resume 2620, delete 2670).

## 5. Số đo

| lần chạy | SUMMARY |
|----------|---------|
| trước vá (t98) | `tools=16 fields=110 reached=92 uncovered=9 nested_gaps=4 allow_listed=5`, verdict RED, EXIT 1 |
| sau vá, chế độ báo cáo | `reached=104 uncovered=0 nested_gaps=0 allow_listed=6`, verdict GREEN, **EXIT 0** |
| sau vá, `--strict` | như trên, **EXIT 0** |
| cờ lạ `--bogus` | GATE ERROR, **EXIT 2** |

## 6. Suite mới: `tests/t99-render-parity.mjs` — 11/11

Capture định nghĩa THẬT của 16 tool từ `lib/tools.js` bằng stub context (đúng cách cổng t98 làm),
gọi `output.render({}, payload)` với payload GIỐNG THẬT (route `command-code-goat/deepseek/…`,
prompt, override có `source`/`at`), rồi assert từng token phải đọc được:

- a1 roster của `create` (name/id/role/route/effort/status/policy, cả member chưa spawn);
- a2 `Profile`/`Task planning`/`status=kind=` của task seed;
- a3 prompt + previous role + previous prompt của `set_member_profile`;
- a4 câu cũ của `set_member_profile` **nguyên văn từng byte** khi không có previous ⇒ vá kiểu "in thêm";
- a5 `edit_plan` giữ nguyên text (khoá hợp đồng với t94) + assert trường được khai trong ALLOW_LIST;
- a6/a7/a8/a9 identity, prompt, active/fallback/override route, last failure, attempt_id, evidence;
- a10 **đối chứng âm trong bộ nhớ**: bọc render để xoá `members` ⇒ chính phép kiểm đó ĐỎ
  (`applies=1 dropped=members delta_bytes=228`); render phát hành không bị chạm;
- **mutation trên tệp thật** (sao lưu `tests/tmp/t99-tools.bak`): xoá đúng dòng in roster ⇒
  `applies=1 old_bytes=205239 new_bytes=204776 delta_bytes=-463` ⇒ suite `# 8/11 passed, 3 failed`
  EXIT=1 (a1, a10, a11 đỏ); khôi phục `identical=true sha256=5deb03ca93b2a8e9141fef887c7012866f2d96694bf810d23ef1806ec128a78d`
  / 205 239 B;
- a11 chạy thật cổng t98 năm lần: mặc định EXIT 0, `--report` EXIT 0, `--strict` EXIT 0,
  `--bogus` EXIT 2, `--report --strict` EXIT 2.

## 7. Hồi quy (EXIT 0)

t94 9/9 · t90 10/10 · t50 11/11 · t87 8/8 · t86 8/8 · t10 `TOTAL 48 checks, 48 passed` · t43 19/19 ·
t3 18/18 · t4 22/22 · t20 15/15 · t30 8/8 · t38 17/17 · t37 14/14 · t70 16/16 · t74 24/24 · t56 20/20 ·
`node --check` trên `lib/tools.js` + 2 tệp test OK.

## 8. Giới hạn còn lại (nói thẳng)

1. Cổng chỉ chấm **trường cấp 1** là điều kiện đỏ; nhóm lồng được báo cáo (nay 0 nhóm thiếu nhưng
   fixture vẫn là dữ liệu tổng hợp, không phải payload thật của một phiên).
2. "Tới được text" nghĩa là ĐỌC ĐƯỢC, không phải "in đủ": prompt dài bị cắt 400 ký tự + `…`,
   message lỗi provider cắt 200 — chủ ý, để một prompt 4 000 ký tự không ngập dòng status.
3. `edit_plan.team_id` vẫn không có trong text (mục 3) — muốn có thì phải sửa `tests/t94` trước.
4. Văn bản status dài thêm tối đa ~6 dòng/member; đây là chi phí token thật, đã đo trong t99 log.
5. `presentationMeta` và UI Web không được đo ở đây.
