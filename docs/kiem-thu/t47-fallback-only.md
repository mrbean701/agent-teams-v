# t47 — bịt lỗ hổng phủ test "fallback-only" của t38

**Trạng thái:** XONG. `node tests/t38-member-fallback.mjs` → `# 17/17 passed, 0 failed` (exit 0).

## 1. Lỗ hổng
Suite t38 (14 case) chỉ thử fallback khi ĐI KÈM provider/model, nên dạng lời gọi "chỉ đổi fallback"
của `agent_teams_set_member_route` không có case nào. Guard ở `packages/dsh-agent-teams/lib/members.js:1363`
từng là `else if (!fallbackClearing) {` — thiếu `!wantsFallback` — nên mọi lời gọi fallback-only ném
`agent-teams: member "…" was not changed: pass provider/model, clear, fallback_provider with fallback_model, or fallback_clear`
(HTTP 409 ở t46) mà contract t38 vẫn xanh.

## 2. Đã thêm (tests/t38-member-fallback.mjs, nhóm (a))
- **a5** fallback-only: không ném, `member.fallback` ghi bền, KHÔNG tạo `routeOverride`, `provider`/`model`
  khai báo (p1/m1) nguyên vẹn; kết quả vẫn báo route đang hiệu lực p1/m1.
- **a6** fallback-only kèm `fallback_reasoning_effort: high` → lưu `{provider, model, reasoningEffort}` cùng cặp, spine không đổi.
- **a7** fallback-only trên member ĐÃ có `routeOverride` → override cũ giữ NGUYÊN (`deepEqual` cả object), `previous_model` = m3.
- Helper mới `setFallback()` (tests/t38-member-fallback.mjs:128) gọi tool KHÔNG kèm provider/model · số case: **14 → 17**.

## 3. Phép mutation (tự chứng minh độ phủ)
Guard đúng: `lib/members.js:1363` = `else if (!fallbackClearing && !wantsFallback) {`.

| lần đo | guard | kết quả |
| --- | --- | --- |
| trước | đúng | `# 17/17 passed, 0 failed` · exit 0 |
| mutation | `else if (!fallbackClearing) {` | `# 14/17 passed, 3 failed` · exit 1 — a5, a6, a7 FAIL, mỗi case ném `… was not changed: pass provider/model, clear, fallback_provider with fallback_model, or fallback_clear` |
| khôi phục | đúng | `# 17/17 passed, 0 failed` · exit 0 |

Hash `packages/dsh-agent-teams/lib/members.js` (sha256 / bytes):
- TRƯỚC mutation: `8e4f7b39f20be5ca80953372f4a35fd45ac03f107c5023cb20a7c77a31dd44f3` / 96 140 · SAU khôi phục: cùng hash / cùng byte → **giống hệt**.

## 4. Ghi chú phạm vi (không để thay đổi ẩn)
Guard `lib/members.js:1363` đã được sửa trong **t43** (`!fallbackClearing` → `!fallbackClearing && !wantsFallback`),
tức NGOÀI phạm vi "profile tool" của t43, sau báo cáo blocker của dev-ui-goat (t46). Đã khai trong output t43 + doc này.
t47 chỉ thêm test + doc: **hash trên chứng minh không sửa thêm dòng mã nào**.

## 5. Giới hạn còn lại
- Fallback bền chỉ được seed lại ở lần spawn KẾ TIẾP (`setLiveRoute` chỉ mang provider/model/reasoningEffort) —
  child đang chạy chưa nhận fallback mới (giới hạn đã biết từ t38).
- Suite dùng harness in-memory (mount `lib/index.js` với ctx giả), không đi qua HTTP /plan (lib/index.js ngoài phạm vi).
- Mutation chỉ chứng minh guard hiện tại; thêm nhánh xử lý thứ tư thì phải thêm case tương ứng.
