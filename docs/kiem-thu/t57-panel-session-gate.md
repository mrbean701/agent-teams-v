# t57 — điều kiện hiển thị 2 control trong panel, khoá bằng máy

Trạng thái: ĐẠT (chờ captain chấm). Tệp: `tests/t57-panel-session-gate.mjs` (mới, 115 dòng) + `docs/kiem-thu/t57-panel-session-gate.md` (tệp này).
Không sửa mã: hành vi panel là ĐÚNG thiết kế. `lib/**`, `build/**`, `lib/client.js` chỉ được ĐỌC.

## 1. Câu hỏi cần trả lời bằng máy
"Vì sao không thấy 2 control trong panel?" — hai nguyên nhân ĐỘC LẬP, trước đây phải đo bằng tay:
1. profile đang nạp `@nanmicoder/dsh-agent-teams` 0.1.28, bundle đó không có control nào;
2. panel chỉ hiện team có `captainSessionId` TRÙNG session đang chọn (`packages/dsh-agent-teams/lib/client/ActivityPanel.js:642-647`).

## 2. Cách suite khoá điều kiện lọc (không chép lại logic)
`deriveGate()` cắt ĐÚNG biểu thức `visibleTeams` ra khỏi `ActivityPanel.js` (từ `const visibleTeams = useMemo(` tới `, [teams, current]);`), đổi arrow 0 tham số thành `(current, teams)`, rồi `new Function` chạy nó trên fixture. Nếu ai bỏ điều kiện lọc trong mã, việc cắt chuỗi hoặc kết quả sẽ đổi ⇒ test FAIL. Đây là **assertion ở mức văn bản nguồn + thực thi biểu thức thật**, KHÔNG render DOM (không có jsdom/React runtime trong suite).

Mutation chứng minh tính "sống": M1 sửa `() => (current === undefined ? [] : …)` thành `false ? []` ⇒ gate dẫn xuất để lọt team không có session; M2 sửa `teams.filter((team) => team.captainSessionId === current)` thành `filter(() => true)` ⇒ trả cả 3 team. Cả hai ca âm đều lật đúng chiều, rồi N5/M2c xác nhận gate THẬT vẫn lọc.

## 3. 29 case
| Nhóm | Case | Nội dung |
| --- | --- | --- |
| Dương | P1 | `current === captainSessionId` ⇒ hiện team |
| Dương | P2 | 2 team cùng session ⇒ hiện cả 2, giữ thứ tự |
| Dương | P3 | trộn 4 team ⇒ chỉ 2 team của session hiện tại |
| **Âm** | N1 | chỉ team session khác ⇒ rỗng |
| **Âm** | N2 | `current === undefined` ⇒ rỗng dù có team live |
| **Âm** | N3 | roster rỗng ⇒ rỗng |
| Âm | N4 | `current === ''` chỉ khớp team có `captainSessionId === ''` (gate là so sánh `undefined` nghiêm ngặt) |
| **Âm** | N5 | team thiếu `captainSessionId` + `current` undefined ⇒ rỗng |
| Mutation | M1/M1b/M2/M2b/M2c | 2 ca sửa mã trong bộ nhớ + 1 ca xác nhận gate thật |
| Bundle | B-×6 | `lib/client.js` chứa `data-agent-teams-activity`, `data-member-route-control`, `data-add-member`, `set_member_route`, `add_member`, `/plugins/dsh-agent-teams/plan` |
| Nguồn | S-×5 | `MemberControls.js` post đúng 2 action; panel inject `MemberRouteControl` + `AddMemberControl`; panel render `data-agent-teams-activity` |
| i18n | L-×3 | `action.openActivityPanel`, `activity.panelButton`, `activity.title` có ĐÚNG 2 lần (zh + en) |
| Tự kiểm | R1/R2 | suite không chứa đường dẫn tuyệt đối, đường dẫn đi qua `import.meta.url` |

## 4. Chạy
~~~
cd E:/Project/Agent-Team && node tests/t57-panel-session-gate.mjs
# 29/29 passed, 0 failed   EXIT=0
~~~

## 5. Giới hạn
- Không render React/DOM: chỉ khẳng định điều kiện lọc + marker trong bundle. Việc panel thật sự vẽ hàng `Route`/nút `Add member` vẫn do `tests/t10-ui-bundle-smoke.mjs` (SSR) và Chromium `build/test-load.html` phủ.
- Gate đọc `current` từ session đang chọn của Host; suite dựng fixture chứ không mở GUI thật.
- 0.1.28 không kiểm ở đây (bundle cũ không nằm trong repo) — điều kiện 1 chỉ được khẳng định qua marker của bundle hiện tại.
