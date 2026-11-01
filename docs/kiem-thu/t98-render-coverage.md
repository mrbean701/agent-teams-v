# t98 — Cổng tĩnh: payload mọi tool có tới được text render?

Task t98 (kind implementation). Mục tiêu: chứng minh (hoặc bác bỏ) rằng mọi trường cấp 1 trong payload
của 16 tool `agent_teams_*` đều tới được text mà model đọc trong `tool_result` — nửa thứ hai của
BUG-024. Task này **chỉ đo**, không sửa mã sản phẩm (t99 sẽ vá).

## Cách chạy

    node tests/t98-render-coverage.mjs             # chế độ BÁO CÁO (mặc định = --report), EXIT 0
    node tests/t98-render-coverage.mjs --report     # chính chế độ trên, gọi tên rõ ràng
    node tests/t98-render-coverage.mjs --strict     # chế độ CỔNG: EXIT 1 khi còn trường cấp 1 thiếu

Chỉ nhận `--report` và `--strict`; cờ lạ, hoặc cả hai cờ cùng lúc (hai kết luận ngược nhau) ⇒
`GATE ERROR` + EXIT 2 (một cổng bị gọi sai không bao giờ được tính là pass). Mỗi lần chạy in một dòng `mode: …` để người đọc biết đang ở chế độ nào.

Mã thoát: ở **cả hai** chế độ, `2` = cổng không chạy được (cờ lạ, số definition ≠ 16, map dòng
render đã cũ, đối chứng âm không bắt được, hoặc render ném lỗi trên schema của chính nó). Chỉ khác
nhau ở phần kết luận: chế độ báo cáo luôn trả `0` (bản thân báo cáo là đầu ra của task t98), còn
`--strict` trả `1` khi còn trường cấp 1 **không bao giờ** tới được text.

## Cách đo (không grep chuỗi, không đọc source bằng mắt)

1. Stub context (đủ `subagents` cho `lib/harness-compat.js:170`, đủ `llm`/`agents` để đăng ký) rồi gọi
   thật `registerAgentTeamsTools` (`packages/dsh-agent-teams/lib/tools.js:505`); cổng assert **đúng 16**
   definition có `output.render`.
2. Sinh fixture từ `output.schema`: string `ZQ<tên-trường>`, number = 4200 + hash(tên) % 600 (để hai
   trường số không trùng token), boolean `true`, array object ⇒ `[object con]`.
   `agent_teams_status` khai TƯỜNG MINH 22 property (t110/V17-F2), nên fixture của nó là MAP TAY
   khớp đúng 22 khoá cấp 1 của DTO thật, kèm nested của `members[]`/`tasks[]`/`coverage[]`.
   Từ t110 cổng còn so schema với **payload THẬT** (mục "t110" ở cuối tệp), nên một khoá bị bỏ khỏi
   DTO mà fixture vẫn còn sẽ bị bắt.
3. Gọi `render({}, payload)` thật và chấm từng trường cấp 1: sentinel có mặt ⇒ `rendered`; boolean đổi
   giá trị mà text đổi ⇒ `branch`; chuỗi trạng thái không in nguyên văn nhưng đổi giá trị làm text đổi ⇒
   `branch`; có mặt một phần ⇒ `partial` (chỉ báo cáo).
4. **Witness set** (vì phần lớn render ở đây rẽ nhánh theo giá trị): mọi boolean = true, mọi boolean =
   false (đệ quy, nên `delivery.ok=false` cũng có mặt), từng boolean đảo riêng, và với chuỗi chưa thấy
   thì thử 16 từ trạng thái (`staged`, `running`, `live-and-durable`, `durable-only`, `resumed`, `already_running`, …).
   Nhờ vậy không báo oan `phase`, `applied`, `fallback_provider` như một fixture đơn sẽ làm.
5. **Đối chứng âm** in-memory: bọc `agent_teams_create_task` bằng bản xoá 1 trường rồi chấm lại; cổng phải
   báo thiếu **đúng tên trường đó**. Không vá render thật.
6. `ALLOW_LIST` chỉ nhận trường mà in ra là SAI hoặc TRÙNG LẶP, mỗi mục kèm `file:dòng` + lý do; cổng
   từ chối chạy nếu ai đó allow-list cả một tool.

## Bảng 16 tool (lần chạy thật)

| # | tool | schema fields | rendered | branch | allowed | partial | MISSING |
|---|------|--------------:|---------:|-------:|--------:|--------:|--------:|
| 1 | agent_teams_create | 9 | 7 | 1 | 1 | 0 | 0 |
| 2 | agent_teams_edit_plan | 7 | 5 | 1 | 1 | 0 | 0 |
| 3 | agent_teams_approve | 4 | 3 | 0 | 1 | 0 | 0 |
| 4 | agent_teams_add_member | 9 | 7 | 2 | 0 | 0 | 0 |
| 5 | agent_teams_set_member_route | 13 | 10 | 3 | 0 | 0 | 0 |
| 6 | agent_teams_set_member_profile | 7 | 6 | 0 | 1 | 0 | 0 |
| 7 | agent_teams_remove_member | 3 | 3 | 0 | 0 | 0 | 0 |
| 8 | agent_teams_create_task | 5 | 5 | 0 | 0 | 0 | 0 |
| 9 | agent_teams_reassign_task | 6 | 6 | 0 | 0 | 0 | 0 |
| 10 | agent_teams_claim_task | 6 | 6 | 0 | 0 | 0 | 0 |
| 11 | agent_teams_update_task | 7 | 6 | 0 | 1 | 0 | 0 |
| 12 | agent_teams_amend_task | 5 | 5 | 0 | 0 | 0 | 0 |
| 13 | agent_teams_send_message | 4 | 4 | 0 | 0 | 0 | 0 |
| 14 | agent_teams_status | 22 | 19 | 3 | 0 | 0 | 0 |
| 15 | agent_teams_resume | 3 | 2 | 1 | 0 | 0 | 0 |
| 16 | agent_teams_delete | 2 | 1 | 0 | 1 | 0 | 0 |

Bảng trên là số đo của lần chạy **t110** (sau t99 + t107), không phải của t98: bản t98 đo
fields=110 reached=92 uncovered=9 nested_gaps=4 allow_listed=5. Số đo đầy đủ sau bản vá nằm ở mục
"Chạy lại sau t99" và "t110".

## Trường THẬT SỰ THIẾU (cổng đỏ của t98 — t99 đã vá hết, xem cột cuối)

| trường | render | mức | hệ quả cho người đọc |
|--------|--------|-----|----------------------|
| agent_teams_create.members | lib/tools.js:889 | high | đội vừa tạo có member nào, route nào, trạng thái nào — không thấy |
| agent_teams_create.profile | lib/tools.js:889 | medium | không biết profile/protocol đã áp |
| agent_teams_create.task_planning | lib/tools.js:889 | medium | không biết chế độ lập kế hoạch |
| agent_teams_edit_plan.team_id | lib/tools.js:1142 | low | **chuyển sang ALLOW_LIST** (t94 khoá nguyên văn text này) |
| agent_teams_set_member_profile.execution_prompt | lib/tools.js:1506 | high | không đọc lại được prompt vừa đặt (chỉ thấy "changed") — **t99 in** |
| agent_teams_set_member_profile.previous_role | lib/tools.js:1506 | medium | không thấy giá trị cũ để hoàn tác — **t99 in** |
| agent_teams_set_member_profile.previous_execution_prompt | lib/tools.js:1506 | medium | không thấy prompt cũ để hoàn tác — **t99 in** |
| agent_teams_status.team_id | lib/tools.js:2493 | low | thiếu id khi tên đội trùng — **t99 in** |
| agent_teams_status.phase | lib/tools.js:2493 | medium | không phân biệt staged/running từ status — **t99 in** |

Thiếu **lồng** (in ra để báo cáo, không phải điều kiện đỏ): `status.members[].last_failure.*`,
`.fallback.*`, `.route_override.*` (chỉ hiện dấu ` (override)` chứ không hiện route nào), `.active_provider/.active_model`,
`.execution_prompt`, `status.tasks[].attempt_id`, `status.coverage[].evidence`, `create.tasks[].status/.kind`.

Ba trường `agent_teams_create.*` ở trên cũng đã được t99 in (profile, task_planning, cả roster).

## ALLOW_LIST (7 mục, kèm lý do trùng lặp; mục thứ 7 thêm ở t117)

| trường | căn cứ | lý do |
|--------|--------|-------|
| create.captain_session_id | lib/tools.js:889-901 | người đọc CHÍNH là session đó; id được phát lại qua presentationMeta (:899-911) |
| approve.status | lib/tools.js:1254-1258 | DTO chỉ có một giá trị "running"; câu "approved and running" đã nói đúng điều đó |
| set_member_profile.applied | lib/tools.js:1506-1515 | lần gọi này luôn durable-only (lib/members.js:1660); text đã nói "saved; takes effect next start" |
| update_task.attempt_id | lib/tools.js:2098-2101 | caller vừa truyền attempt_id; claim_task/reassign_task mới là chỗ phải in lại (:1887, :1752) |
| edit_plan.team_id | lib/tools.js:1142-1152 | công cụ chỉ sửa được đội của chính người gọi nên id trùng danh tính đã biết; `tests/t94-edit-plan-roster-render.mjs:259` khoá nguyên văn text (thêm dòng `team_id` làm đỏ 3 case của t94 — suite ngoài phạm vi t99) |
| delete.deleted | lib/tools.js:2775-2778 | DTO chỉ trả true; câu "ended and archived" đã nêu kết cục, cờ không phân biệt gì |
| status.removed_count | lib/tools.js:2493-3428 | **dẫn xuất**: DTO đặt `removed_count = removedMembers.length` (lib/tools.js:2687) và tiêu đề roster in CHÍNH số đó từ cùng mảng (lib/tools.js:3428) ⇒ hai khoá không thể lệch nhau, không witness nào phân biệt nổi; in thêm là in cùng một số hai lần (t117) |

## Đối chứng âm (chứng minh cổng không xanh im lặng)

Bọc render `agent_teams_create_task` để xoá một trường (thử lần lượt các trường chuỗi, dừng ở trường
đầu tiên cho delta byte ≠ 0): `applies=true — dropped field "status" … the gate reported missing=["status"]`,
delta bytes `-1 (93 → 94)`, text đột biến in kèm. Cổng trả `2` nếu đối chứng âm không bắt được.

## Chạy lại (attempt 2) — số đo không đổi

Chạy lại trên working tree hiện tại: `packages/dsh-agent-teams/lib/tools.js` 199 872 B, mtime
`2026-10-31T22:35:20Z`. Kết quả **giống hệt** lần 1: `captured: definitions=16 withRender=16`,
`SUMMARY tools=16 fields=110 reached=92 uncovered=9 nested_gaps=4 allow_listed=5 negative_control_applies=true`,
`verdict RED`, EXIT 1, cùng 9 trường thiếu và cùng đối chứng âm `applies=true` (dropped "status",
delta bytes −1). Nghĩa là **chưa có bản vá nào** cho các render này trong lib/** — cổng đang chấm đúng
trạng thái sản phẩm, không phải trạng thái tệp test.

## Chạy lại sau t99 (bản vá render) — cổng nay XANH

Sau khi t99 vá các render (xem `docs/kiem-thu/t99-render-parity.md`), chạy lại trên cùng working tree:

    node tests/t98-render-coverage.mjs             # EXIT 0, mode: report
    node tests/t98-render-coverage.mjs --strict     # EXIT 0, mode: --strict
    node tests/t98-render-coverage.mjs --bogus      # EXIT 2, GATE ERROR: unknown argument

Số đo mới: `SUMMARY tools=16 fields=110 reached=104 uncovered=0 nested_gaps=0 allow_listed=6
negative_control_applies=true`, `verdict GREEN — every top-level field of every tool reaches its
text render`. So với t98: `uncovered 9 → 0`, `nested_gaps 4 → 0`, `allow_listed 5 → 6` (thêm
`edit_plan.team_id` với lý do ở bảng trên).

## t110 — V17-F2/F3: ba cổng mới (payload thật, nested gaps, dòng ALLOW_LIST)

Bối cảnh: audit vòng 17 (`docs/audit/closure-vong-17.md`) dựng phép **M1b** — xoá `removed_count` khỏi
DTO `agent_teams_status` mà GIỮ NGUYÊN SỐ DÒNG (+16 B) — thì `t107` đỏ nhưng `t98 --strict` **vẫn xanh**:
cổng cũ chỉ so fixture tự viết với render, nên nó không bao giờ thấy một khoá DTO biến mất.

Đã thêm (t110):
1. **F2a — nested_gaps thành cổng.** `verdictOf(totals, strict)` gộp bốn nguồn (`uncovered`,
   `nestedGaps`, `payload`, `allowList`); có vi phạm ⇒ `--strict` EXIT 1 (chế độ báo cáo vẫn 0).
2. **F2b — hợp đồng HAI CHIỀU schema ↔ payload THẬT.** `realStatusPayload()` dựng `team.json` tối thiểu
   trong `mkdtemp` dưới `tests/tmp/t110/`, đăng ký **tool thật** rồi `execute` `agent_teams_status` với
   captain giả; `payloadKeyProblems()` báo cả *khoá khai báo mà payload không có* lẫn *khoá payload không
   khai báo*. `STATUS_FIXTURE` cũng được so với schema (`fixture_drift`). Seed sai ⇒ `GATE ERROR` EXIT 2
   chứ không xanh im lặng.
3. **F3 — dòng ALLOW_LIST kiểm bằng máy.** `allowListLineProblems()` đòi khoảng `lib/tools.js:a-b` trong
   `ALLOW_LIST` phải CHỨA dòng render của `RENDER_LINES`; in bảng `ALLOW_LIST LINE AUDIT` (`ok`/`LIES`),
   lệch ⇒ `GATE ERROR` EXIT 2. Đã sửa `delete.deleted` từ `:2670-2673` (sai) về `:2748-2751` (render thật).

Số đo mới (`node tests/t98-render-coverage.mjs --strict`, EXIT 0):

    SUMMARY tools=16 fields=112 reached=106 uncovered=0 nested_gaps=0 payload_findings=0
            fixture_drift=0 allow_listed=6 allow_list_line_problems=0
            negative_control_applies=true payload_control_applies=true nested_control_applies=true
    verdict GREEN — every top-level field reaches its text render, no nested value is lost,
            and output.schema agrees with the real payload

Đối chứng âm 2 (payload, chỉ trong bộ nhớ): `applies=true — dropping removed_count from the payload
produced 1 finding(s)`, delta `-18 B`, `PAYLOAD agent_teams_status.removed_count — declared in
output.schema, absent from the payload the tool returned`, `--strict would exit 1`.

Đối chứng âm 3 (nested, đúng phép M4clip của audit): `applies=true — stripping
agent_teams_create.members[0].member_name raised nested_gaps to 1, so --strict exits 1`.

**Tái hiện M1b trên đĩa** (kịch bản audit, giữ nguyên số dòng): thay đúng một lần
`removed_count: removedMembers.length,` bằng `/* audit-v17 removed_count dropped, line preserved */`
(213 071 → 213 087 B, +16 B) ⇒ `t98 --strict` **EXIT 1** với `PAYLOAD agent_teams_status.removed_count —
declared in output.schema, absent from the payload the tool returned` và `verdict RED … payload_findings=1`;
`t107` cũng EXIT 1 (7/12). Khôi phục byte-identical (`sha256 88dbee4079f9…0f08`, 213 071 B). Phép **M1**
(xoá hẳn dòng) KHÔNG dùng làm bằng chứng: nó làm `RENDER_LINES` cũ ⇒ EXIT 2, tức cổng dừng vì map lệch
chứ không vì hợp đồng payload.

Giới hạn của ba cổng này:

1. So hai chiều chỉ ở **cấp 1** của `agent_teams_status`; giá trị lồng không được so với schema.
2. Payload thật lấy từ một seed 2 member (1 live + 1 removed). Nhánh DTO chỉ xuất hiện với dữ liệu khác
   (member staged, mailbox có thư, coverage có evidence) **không** được phủ.
3. `tests/t108-pack.mjs:654,1252` và `tests/t59-erp-live-copy.mjs:337` vẫn ghi tiêu đề cũ
   `Members (N active + M removed):` và **cố ý để nguyên byte**: t108-pack ghim hash NGUỒN
   (`tests/t108-pack.mjs:59`) nên nó đỏ sau MỌI thay đổi `lib/tools.js` (artifact-scoped đúng thiết kế),
   còn t59 là suite phiên headless lịch sử. Hệ quả đã biết: regex
   `/Members \((\d+) active \+ (\d+) removed\)/` trong t59 sẽ trượt tiêu đề mới `present`.

## Giới hạn (điều cổng này KHÔNG chứng minh)

1. Từ t110 cả **trường cấp 1** và **giá trị lồng** đều là điều kiện đỏ ở `--strict` (mục "t110");
   giá trị lồng vẫn chỉ đo trên fixture tổng hợp, nên một tổ hợp nhánh lồng mà fixture không chạm tới
   thì không được phủ.
2. Fixture là dữ liệu TỔNG HỢP, không phải payload thật của một phiên; render phụ thuộc trạng thái
   ngoài payload (file trên đĩa, session store) sẽ bị chấm theo nhánh mà fixture chạm tới.
3. Danh sách 16 từ trạng thái là cố định; một render rẽ nhánh trên giá trị lạ sẽ bị coi là THIẾU.
4. Không đo `presentationMeta`, không đo nội dung UI web, không đo `tool_result` thật trong một phiên.
5. Cổng chạy trên working tree đang được agent khác sửa; map dòng được tự kiểm (`render:` tại đúng
   dòng) nên nếu ai đó di chuyển render, cổng dừng với exit 2 chứ không chỉ sai dòng.
6. Không được nới `ALLOW_LIST` để làm cổng xanh: mỗi mục phải chỉ ra được vì sao in ra là trùng lặp.

## t117 — witness theo ĐƯỜNG DẪN KHOÁ (V18-F2) + vá 3 lỗ render thật

Bối cảnh: audit vòng 18 dựng phép **F2** — bỏ vế in `removed_members[].joined_at` khỏi `removedLine()` — thì
`tests/t107-removed-members-visible.mjs` đỏ nhưng `t98 --strict` **vẫn xanh**. Nguyên nhân: witness cũ chấm theo
**giá trị** (sentinel của lá có xuất hiện ở đâu trong union các text hay không), nên một lá bị bỏ in vẫn khớp nhờ
một lá/định dạng khác trong cùng đoạn text. t117 đổi witness sang **đường dẫn khoá**: mỗi lá được đột biến
RIÊNG tại đúng vị trí của nó, và chỉ được tính là "printed" khi text ĐỔI vì đột biến đó.

Cơ chế mới (trong `tests/t98-render-coverage.mjs`): `leafRecords(value, path, segments, out)` duyệt payload
thành danh sách lá kèm `path`/`segments`; `setAtPath(node, segments, value)` + `mutatedLeafValue(record, index)`
(number ⇒ `500000 + index*7`, string ⇒ token + `#t117`) đột biến đúng một lá; `witnessPayloads(base)` vẫn giữ
bộ witness cũ (`allTrue`/`allFalse`/`flip:<field>`) nhưng mỗi witness được đo bằng `nestedLeavesOf(...)`;
`legacyUnprintedPaths(records, union)` giữ lại witness GIÁ TRỊ cũ, chỉ để tái hiện V18-F2 trong đối chứng âm.
Kết quả `partial` nay mang `unprinted` = **danh sách đường dẫn khoá** (ví dụ `tasks[0].findings_open`) thay vì
một con số. `nestedGapControl` cũng đổi: không cắt token khỏi text (vô nghĩa khi matcher quyết bằng ablation) mà
PIN lá về hằng số (`setAtPath(...)`) rồi đòi cổng báo gap ĐÚNG `leaf.path`. F3: `payload_findings` chỉ còn MỘT
nghĩa/một số, tách thêm `fixture_drift` và `payload_contract_failures`.

### Cổng đỏ đã bắt được 4 lỗ render THẬT trong `packages/dsh-agent-teams/lib/tools.js`

| lỗ | đường dẫn khoá | cách xử lý |
|----|----------------|-----------|
| dòng task không in số finding đang mở | `agent_teams_status.tasks[0].findings_open` | **vá**: in `findings N` khi > 0 (renderStatus) |
| hộp thư captain mất mốc thời gian | `agent_teams_status.captain_inbox[0].ts` | **vá**: in ` · at <ISO>` khi `ts` là số |
| hộp thư member mất mốc thời gian | `agent_teams_status.member_inbox[0].ts` | **vá**: như trên |
| `removed_count` chỉ tới text qua tiêu đề | `agent_teams_status.removed_count` | **ALLOW_LIST** (mục 7, dẫn xuất — xem bảng trên) |

Không đổi số dòng TRƯỚC các mốc `RENDER_LINES` ⇒ map vẫn đúng (`status` 2466, `resume` 2698, `delete` 2748);
cổng tự kiểm (`render:` tại đúng dòng) chạy xanh nên map hợp lệ. `lib/tools.js`: 213 071 B
(`sha256 88dbee4079f95ffd374bf00519397a2c3ae3f5393675792a8f6debc0f8930f08`) → 213 715 B
(`sha256 e51734baf4693cd30f4c86aaf577afb58f8afef39788588d900a93621ae62d61`). 12 tệp payload còn lại KHÔNG bị ghi.

### Đối chứng âm 4 (chạy trên BẢN SAO, `packages/**` không bao giờ bị ghi bởi phép đột biến)

`SOURCE_MUTANTS` gồm 3 phép, mỗi phép khai số lần khớp và đường dẫn khoá kỳ vọng; `loadCopy(index, mutate)` copy
`lib/` sang `tests/tmp/t117/src-<i>/pkg/lib`, symlink `node_modules`, vá, rồi import kèm query cache-bust; mỗi
bản được chấm HAI lần: witness giá trị cũ (`legacyGaps`) và witness đường dẫn mới (`gaps`). Số đo thật:

    (0) UNMUTATED copy: nested_gaps=0 -> --strict exit=0
    mutant (1 removal(s)): the joined_at print in removedLine — 213715 -> 213674 bytes
      (B) legacy VALUE-token witness: nested_gaps=0 -> exit=0   [V18-F2 reproduced: the old witness is blind]
      (A) KEY-PATH witness:            nested_gaps=1 -> exit=1   MISSING agent_teams_status.removed_members[0].joined_at
    mutant (1 removal(s)): the findings_open print on the task line — 213715 -> 213724
      (B) 0 -> exit 0 / (A) nested_gaps=1 -> exit=1   MISSING agent_teams_status.tasks[0].findings_open
    mutant (2 removal(s)): the inbox timestamp prints (captain + member) — 213715 -> 213733
      (B) 0 -> exit 0 / (A) nested_gaps=2 -> exit=1   MISSING agent_teams_status.captain_inbox[0].ts
                                                      MISSING agent_teams_status.member_inbox[0].ts

Đối chứng âm 5 (không báo oan): xoá 3 khoá TUỲ CHỌN khỏi fixture copy
(`members.0.reasoning_effort`, `removed_members.0.reasoning_effort`, `removed_members.0.route_override.reasoning_effort`)
⇒ `nested_gaps=0 -> --strict exit=0` [không báo động].

### Số đo sau bản vá

    node tests/t98-render-coverage.mjs --strict   # EXIT 0
    node tests/t98-render-coverage.mjs --report   # EXIT 0

    SUMMARY tools=16 fields=112 reached=105 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0
            payload_contract_failures=0 allow_listed=7 allow_list_line_problems=0
            negative_control_applies=true payload_control_applies=true nested_control_applies=true
            source_copy_control_applies=true optional_key_control_applies=true
    verdict GREEN — every top-level field reaches its text render, no nested value is lost,
            and output.schema agrees with the real payload

Hồi quy (exit thật): `tests/t107-removed-members-visible.mjs` 12/12 · `tests/t99-render-parity.mjs` 11/11
(tự xanh sau khi cổng xanh, KHÔNG sửa t99) · `tests/t56-types-fallback.mjs` 20/20 (`tsc=5.9.3`, `files=21`) ·
`tests/t94-edit-plan-roster-render.mjs` 9/9 · `node --check` trên `lib/tools.js` và trên cổng = 0.

### Giới hạn còn lại của cổng (nói thẳng)

1. Witness chỉ chấm những lá **có mặt trong payload fixture** (và trong `STATUS_FIXTURE` của status). Một lá
   vắng hẳn khỏi payload — hoặc một khoá lồng mà fixture không dựng — không được đo; hợp đồng hai chiều ở t110
   chỉ so **cấp 1** của `agent_teams_status`.
2. Đột biến theo cặp `find/replace` phải khớp ĐÚNG số lần khai báo; một bản vá đổi câu chữ render (không đổi
   số dòng) làm `hits` lệch ⇒ cổng `GATE ERROR` EXIT 2 chứ không xanh im lặng — nhưng người sửa phải cập nhật
   `SOURCE_MUTANTS` cùng lúc với `RENDER_LINES`.
3. Đối chứng âm 4 chạy cổng 4 lần (bản sạch + 3 mutant) ⇒ chi phí thời gian của một lần `--strict` tăng khoảng 4×.
4. `lib/tools.js` đã đổi trong t117 ⇒ **verdict audit vòng 18 hết hiệu lực**; phải pack vòng 19 + audit vòng 19
   trước khi công bố.
5. Bảng đóng băng của t114 (`FROZEN` trong `tests/t59-erp-live-copy.mjs`) phải được cập nhật trong CHÍNH task ghi
   `lib/**` — quy ước này do t114 đặt ra và t117 đã theo (xem mục t117 rev 2).

### t125 / V19-F3+F4 — allow-list thứ 7 được CANH, và gaps có tên (bản vá round 19)

**Lỗ hổng đã đóng.** Đột biến C của audit vòng 19 chạy trên BẢN SAO: `lib/tools.js:2660`
`removed_count: removedMembers.length,` → `removed_count: team.members.length,` (**−2 B**, sha `1ea098990e2a` / 213 713 B)
⇒ `--strict` vẫn EXIT 0 GREEN trong khi `tests/t107` EXIT 1. Entry allow-list thứ 7
(`agent_teams_status.removed_count`) không có witness nào phân biệt được — không phép lật payload nào đổi được text,
vì DTO lấy cả hai khoá từ CÙNG một mảng và tiêu đề roster in đúng độ dài mảng đó.

**Cách vá (hai lớp).**

1. **Bất biến được assert, không được tin** — `ROSTER_INVARIANT = agent_teams_status.removed_count === agent_teams_status.removed_members.length`,
   kiểm bằng `rosterInvariantProblems(payload, renderedText)` trên payload THẬT **và** trên text render thật:
   `removed_members` không phải array · `removed_count` ≠ độ dài · payload đếm N>0 mà text không in `"N removed"` ·
   payload đếm 0 mà text không in `Members (`. In ra block riêng:

       ROSTER INVARIANT (t125 / V19-F3 …):
         agent_teams_status.removed_count === agent_teams_status.removed_members.length — findings=0 (removed_count=1, removed_members=1)

   `realStatusPayload` giờ trả `{ payload, text, error }` để cổng chấm được cả hai nửa của thứ người đọc nhận.
2. **Đối chứng âm 6 trên BẢN SAO** (`tests/tmp/t125/src-roster-{baseline,mutant}` — không bao giờ ghi `packages/`):
   copy sạch ⇒ `--strict exit=0`; copy đột biến ⇒ `--strict exit=1` và thông điệp nêu đúng khoá:

       mutant (applies=1, 213715 -> 213713 bytes, delta -2 B): removed_count=2 removed_members=1 -> roster findings=1 -> --strict exit=1
       ROSTER agent_teams_status.removed_count — is 2 but agent_teams_status.removed_members carries 1 entry(ies)
                                                                       (agent_teams_status.removed_count === agent_teams_status.removed_members.length)

   Nếu control không áp dụng được (`applies !== 1`, delta ≠ −2 B, baseline exit ≠ 0, mutant exit ≠ 1, hoặc không nêu khoá)
   thì cổng tự `GATE ERROR` EXIT 2 — không có đường xanh im lặng. `verdictOf` vì thế có thêm một nhánh `roster`,
   và `--strict`/RED/GREEN đều in `roster_invariant_problems`.

**Entry allow-list thứ 7 vẫn GIỮ (7, không giảm còn 6) — và đây là lý do.** Gỡ nó thì `removed_count` thành `uncovered`
mà không witness nào cứu được; giữ nó thì phải nói rõ ai canh. Bảng giờ có trường `guardedBy` (chuỗi literal, không tham chiếu
`ROSTER_INVARIANT` vì bảng dựng trước hằng đó ⇒ TDZ `ReferenceError`) và block allow-list in thêm:

       GUARDED BY (t125 / V19-F3): agent_teams_status.removed_count === agent_teams_status.removed_members.length,
       asserted on the real payload AND on the rendered roster title (ROSTER INVARIANT block), plus NEGATIVE CONTROL 6 …
       and tests/t107-removed-members-visible.mjs (t125 / V19-F3)

**V19-F4 — gaps có tên.** Thông điệp fail-closed cũ chỉ in `nested_gaps=N`. Giờ `unmutatedCopyRedMessage(gaps)` trả
`the UNMUTATED copy is already red (nested_gaps=N): agent_teams_status.<path>, … — so a red mutant would prove nothing`,
và chính cổng tự chạy nó với fixture 2 đường dẫn mỗi lần (sai ⇒ GATE ERROR EXIT 2):

       (F4) fail-closed message exercised with a 2-path fixture — names every key path: true

**tests/t107 thêm ca a1b** (`removed_count === removed_members.length` + tiêu đề in đúng số đó) ⇒ 12 → 13 case,
để hai cổng không cùng mù.

### Số đo sau bản vá t125

    node tests/t98-render-coverage.mjs --strict   # EXIT 0
    node tests/t107-removed-members-visible.mjs   # EXIT 0, 13/13
    node tests/t99-render-parity.mjs              # EXIT 0, 11/11
    node tests/t113-roster-assertion.mjs          # EXIT 0, 38/38

    SUMMARY tools=16 fields=112 reached=105 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0
            payload_contract_failures=0 allow_listed=7 allow_list_line_problems=0
            negative_control_applies=true payload_control_applies=true nested_control_applies=true
            source_copy_control_applies=true optional_key_control_applies=true
            roster_invariant_problems=0 roster_control_applies=true roster_mutant_exit=1
    verdict GREEN — every top-level field reaches its text render, no nested value is lost,
            output.schema agrees with the real payload, and removed_count matches removed_members

`reached` 106 → 105 không phải hồi quy: entry thứ 7 (`removed_count`) đã chuyển từ `reached` sang `allow_listed`
ở một bản trước t125, và 105 + 7 = 112 = tổng số field. `packages/dsh-agent-teams/lib/tools.js` KHÔNG bị ghi trong
t125 (sha `e51734baf4693cd30f4c86aaf577afb58f8afef39788588d900a93621ae62d61` / 213 715 B trước và sau).

Giới hạn của bản vá này, nói thẳng: (a) đối chứng âm 6 chỉ chứng minh cổng bắt được đúng MỘT dạng lệch (`removed_count`
lấy từ roster sống); một dạng lệch khác — ví dụ tiêu đề roster in một số khác `removed_members.length` — do nhánh text
của `rosterInvariantProblems` canh, nhưng không có đối chứng âm riêng; (b) fixture F4 là 2 đường dẫn TỔNG HỢP đưa vào
đúng hàm dựng thông điệp, chưa phải một baseline đỏ thật (muốn thế phải cố ý làm hỏng `lib/`); (c) `removed_members`
lồng sâu hơn 1 cấp vẫn ngoài tầm hợp đồng hai chiều của t110.
## t156 — đo lại toàn bộ dòng sau khi t155 đổi `lib/tools.js`

`t155` thêm tham số `start_if_needed`, hook sau `setMemberRoute`, hàm `startMemberOnDemandNow()` và nhánh
câu trả lời mới, nên **12 dòng render bị dời** và ba citation trong `ALLOW_LIST` không còn trùm dòng render
của chính nó. Cả hai đều bị cổng tự phát hiện (`GATE ERROR: stale RENDER_LINES map`, rồi
`GATE ERROR: ALLOW_LIST citation does not point at the render it excuses`) — đúng thiết kế: map cũ thì
cổng không chấm gì thay vì chấm sai.

Số ĐO LẠI bằng máy (`grep` dòng `name: 'agent_teams_*'` rồi tìm dòng `render:` kế tiếp), không chép tay:

| tool | cũ | mới | | tool | cũ | mới |
|---|---|---|---|---|---|---|
| create | 889 | 889 (không đổi) | | claim_task | 1901 | 1928 |
| edit_plan | 1142 | 1142 (không đổi) | | update_task | 2071 | 2098 |
| approve | 1254 | 1254 (không đổi) | | amend_task | 2240 | 2267 |
| add_member | 1303 | 1303 (không đổi) | | send_message | 2317 | 2344 |
| set_member_route | 1366 | 1369 | | status | 2466 | 2493 |
| set_member_profile | 1479 | 1506 | | resume | 2698 | 2725 |
| remove_member | 1542 | 1569 | | delete | 2748 | 2775 |
| create_task | 1630 | 1657 | | reassign_task | 1766 | 1793 |

Citation `ALLOW_LIST` đo lại theo dòng render mới: `set_member_profile.applied` `:1479-1490` →
`:1506-1515`, `update_task.attempt_id` `:2071-2074` → `:2098-2101`, `delete.deleted` `:2748-2751` →
`:2775-2778`, và `status.removed_count` `:2466-3329` → `:2493-3428` (range phải TRÙM dòng render của chính
nó; con số dẫn xuất `removed_count = removedMembers.length` nay ở `:2687`, tiêu đề roster in số đó ở `:3428`).
Bảng 16 dòng ở trên đã cập nhật theo cùng số đo. Các mục t117 phía trên là BẢN GHI lịch sử, giữ nguyên.
