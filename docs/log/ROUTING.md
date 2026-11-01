# ROUTING — quyết định chọn model cho từng member

Nguyên tắc: model theo độ khó thật của nhiệm vụ, không dùng một model cho tất cả; provider của auditor phải khác provider của người viết mã để kiểm tra độc lập.

| Thời điểm | Member | Provider/model | Effort | Lý do |
|---|---|---|---|---|
| 2026-10-31T13:15:33.909Z | nghien-cuu | opencode-go/deepseek-v4.1-flash | high | Nhiệm vụ read-only, chủ yếu grep/đọc file; cần nhanh và rẻ, không cần suy luận sâu |
| 2026-10-31T13:15:33.909Z | kien-truc | deepseek-official/deepseek-v4-pro | max | Hợp đồng dữ liệu và tương thích ngược là chỗ sai một ly hỏng cả dây chuyền; cần suy luận sâu trên provider chính thức |
| 2026-10-31T13:15:33.909Z | dev-runtime | command-code-claude/claude-opus-5 | max | Phần khó nhất: registry selection sống, khoá đồng thời, đường resume; ưu tiên năng lực agentic coding |
| 2026-10-31T13:15:33.909Z | dev-tools | deepseek-official/deepseek-v4-pro | max | Sửa file lớn (tools.js 164KB), nhiều nhánh lỗi và kiểm tra quyền |
| 2026-10-31T13:15:33.909Z | dev-ui | opencode-go/kimi-k2.7-code | high | Model chuyên code, chi phí thấp hơn; UI có spike bundle làm chốt chặn |
| 2026-10-31T13:15:33.909Z | kiem-thu | opencode-go/deepseek-v4.1-flash | high | Viết script và chạy lệnh theo kịch bản, ít suy luận mở |
| 2026-10-31T13:15:33.909Z | audit | command-code-claude/claude-opus-5 | max | Kiểm tra độc lập: khác provider với dev-runtime? KHÔNG — dev-runtime cũng dùng command-code-claude, nên tính độc lập chỉ dựa vào việc auditor là member khác và không sửa mã; rủi ro trùng điểm mù được ghi nhận, sẽ đổi provider cho audit nếu vòng 1 bỏ sót lỗi thật |
## Chỉ thị chi phí của người dùng (2026-10-31T13:23:21.323Z)
- Người dùng yêu cầu: "ưu tiên deepseek v4.1 flash cho member để tối ưu chi phí".
- Chính sách áp dụng ngay: MỌI member thêm mới từ thời điểm này dùng `opencode-go/deepseek-v4.1-flash` (effort `high`), trừ khi task cần deep reasoning và đã ghi lý do.
- Không thể đổi route của 4 member đắt (kien-truc, dev-runtime, dev-tools, audit) NGAY LÚC NÀY: xem MODEL-SWITCH.md mục "Chặn kỹ thuật". Đổi route sẽ làm được ngay khi t4 (set_member_route) hoàn thành.
- Kế hoạch: ngay sau khi t7/t8 xong và t11 chạy được, dùng chính tool mới để chuyển toàn bộ 7 member sang deepseek-v4.1-flash — vừa tối ưu chi phí, vừa là ca dogfood/acceptance thật cho tính năng.

## 2026-10-31T16:45:41.599Z — Quy hoạch lại toàn bộ member về DeepSeek V4.1 Flash (chỉ thị người dùng: model khác đốt token quá nhanh)
- Đã GỠ 5 member nằm trên route chết/đắt: `nghien-cuu`, `kiem-thu`, `dev-tools-flash`, `dev-runtime-flash` (opencode-go/deepseek-v4.1-flash — 429), `audit-kimi` (opencode-go/kimi-k2.7-code). `agent_teams_remove_member` trả `requeued_tasks: []` cho cả 5 (không mất task).
- Roster còn sống: `dev-ui-goat`, `kiem-thu-goat`, `audit-goat` — tất cả `command-code-goat/deepseek/deepseek-v4.1-flash` (high/high/max). Không còn member nào trên route khác.
- Từ nay: member mới chỉ `command-code-goat/deepseek/deepseek-v4.1-flash`; effort `max` chỉ cho audit.
