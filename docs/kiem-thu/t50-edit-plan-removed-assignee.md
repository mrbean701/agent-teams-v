# t50 — BUG-012: edit_plan chặn cả batch vì assignee cũ đã removed

## 1. Cơ chế lỗi
`validateStagedGraph` quét MỌI task của đội. Đội nào từng gỡ member thì task cũ vẫn mang
assignee đã removed ⇒ mọi batch `agent_teams_edit_plan` (kể cả sửa task không liên quan)
đều ném `task "<id>" assignee "<name>" is not an active member`.

## 2. Chỗ sửa (packages/dsh-agent-teams/lib/tools.js)
- :219-228 `function validateStagedGraph(team, requireRunnable, options = {})` — thêm tham số tuỳ chọn.
- :235 `const onlyTaskIds = options.onlyTaskIds === undefined ? undefined : new Set(options.onlyTaskIds);`
- :237-238 trong vòng lặp task: `if (onlyTaskIds !== undefined && !onlyTaskIds.has(task.id)) continue;`
  ⇒ chỉ chủ đề / assignee / phụ thuộc của task trong batch được kiểm.
- :588 `const editedTaskIds = new Set();` (đặt trong `updatePlanBatch`), :629 (update_task), :637-638 (add_task).
- :673 `validateStagedGraph(fresh, false, staged ? {} : { onlyTaskIds: editedTaskIds });`
  ⇒ đội đang chạy: quét batch; plan staged: quét toàn bộ như cũ.
- KHÔNG đổi: kiểm chu trình :245-260 vẫn duyệt `for (const task of team.tasks) visit(task.id);`;
  :704 `validateStagedGraph(fresh, true);` (approve) vẫn quét toàn bộ; guard task-đã-start :615-616.

## 3. Trước / sau bằng lệnh thật
Trước (mutation tạm đưa về quét toàn bộ: `validateStagedGraph(fresh, false, {});`):
`node tests/t50-edit-plan-removed-assignee.mjs` → exit 1, `# 6/10 passed, 4 failed`,
b1/b2/b4/b10 FAIL với đúng `task "t1" assignee "gone" is not an active member`.
Sau (bản đã sửa): exit 0, `# 11/11 passed, 0 failed` — b1/b2 (sửa phụ thuộc + subject của task
pending khác) qua, b3 (gán member removed) / b4+b11 (chu trình) / b5 (task đã start) / b6
(approve) / b7 (update_member) / b8 (plan staged) / b10 (phụ thuộc lạ) vẫn bị từ chối.

## 4. Bộ test tests/t50-edit-plan-removed-assignee.mjs (11 case)
b1 phụ thuộc task khác OK dù t1 assignee removed · b2 subject + batch 2 task · b3 chặn assignee removed ·
b4 chu trình qua task ngoài batch · b5 task đã start · b6 approve · b7 update_member ·
b8 cùng dữ liệu trên team STAGED vẫn lỗi (chứng minh phạm vi chỉ ở đường running) ·
b9 đội sạch vẫn sửa bình thường + status DTO · b10 phụ thuộc không tồn tại · b11 chu trình nằm hoàn toàn ngoài batch.
Mọi case bị từ chối đều so BYTE team.json trước/sau.

## 5. Tự chứng minh suite không phải pass rỗng (mutation)
- Bỏ phạm vi (`{}`): 6/10 → 4 FAIL (b1,b2,b4,b10).
- Khoanh cả kiểm chu trình vào batch: 10/11 → b11 FAIL "Missing expected rejection".
- Khôi phục: sha256 lib/tools.js = a01b1a1018cb32d628ff88282d4066b97ec6aa0ab2a95dfe708902ef447bdb72 / 194 888 B (y hệt trước mutation), suite 11/11.

## 6. Hồi quy (exit 0 hết)
t4 22/22 · t3 18/18 · t20 15/15 (dữ liệu ERP nguyên vẹn) · t37 14/14 · t43 19/19 · t46 15/15 · node --check OK.

## 7. Giới hạn còn lại
- Batch vẫn phải khai đủ trường của task đó; task cũ có assignee removed KHÔNG tự được sửa hộ.
- Chưa có lệnh dọn assignee mồ côi hàng loạt (ngoài phạm vi t50).
- HTTP /plan không có action edit_task: đường sửa task vẫn chỉ qua tool captain.
