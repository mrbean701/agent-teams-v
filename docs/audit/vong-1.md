# Audit vòng 1 — runtime, tools và control plane (task t6)

Thông tin chung
- Baseline: `@nanmicoder/dsh-agent-teams` v0.1.28 tại `C:\Users\thang\.dsh\profiles\desktop\node_modules\@nanmicoder\dsh-agent-teams`.
- Phiên bản auditee: `@nami/dsh-agent-teams` 0.2.0-dev.0 tại `E:\Project\Agent-Team\packages\dsh-agent-teams`.
- Phạm vi: `lib/members.js`, `lib/state.js`, `lib/tools.js`, `lib/tool-names.js`, `lib/index.js`, `lib/web-routes.js`.
- Tham chiếu thiết kế: `docs/thiet-ke/thiet-ke-v1.md`.

## Tóm tắt kết luận

**ĐẠT với findings cần khắc phục trước vòng 2.**

Các hành vi cốt lõi của v1 đã được cài đặt đúng:
- `routeOf` ưu tiên fallback > override > active > declared (`lib/members.js:316-348`).
- Registry selection sống cài và dọn đúng (`lib/members.js:676`, `:704`, `:718-744`).
- `setMemberRoute` ghi đĩa trước, switch RAM sau, không bao giờ sửa `provider`/`model` trực tiếp (`lib/members.js:1070-1139`).
- `spawnMember` thăng cấp route từ override vào descriptor rồi xoá override (`lib/members.js:907-921`).
- Descriptor guard giữ nguyên logic, chỉ so spine (`lib/members.js:620-622`).
- `state.js` chấp nhận team.json cũ và validate hình dạng `routeOverride` (`lib/state.js:661-670`).
- Tool `agent_teams_set_member_route` là captain-only qua `CAPTAIN_TOOL_NAMES` (`lib/tool-names.js:4`, `lib/tool-policies.js:38`).
- `/plan` xử lý `add_member`/`set_member_route` riêng, không đi qua `updateStagedPlan`, vẫn trả 409 khi lỗi (`lib/index.js:348-385`).
- `node --check` PASS trên 8 file lib.
- `tests/t3-route-smoke.mjs` 18/18 PASS, `tests/t4-control-plane-smoke.mjs` 19/19 PASS, không có case bị skip.

Tuy nhiên có 2 findings: 1 medium về provenance `by` bị thiếu, 1 low về test F2 đặt tên/Assertion sai.

## Phương pháp kiểm chứng

```bash
# 1. Kiểm tra cú pháp
cd E:/Project/Agent-Team/packages/dsh-agent-teams
node --check lib/members.js lib/state.js lib/tools.js lib/tool-names.js lib/index.js lib/web-routes.js lib/snapshot.js lib/events.js
# -> exit 0 tất cả

# 2. Chạy smoke tests
cd E:/Project/Agent-Team
node tests/t3-route-smoke.mjs       # 18/18 passed
node tests/t4-control-plane-smoke.mjs # 19/19 passed

# 3. Diff baseline vs current
diff -u C:/Users/thang/.dsh/profiles/desktop/node_modules/@nanmicoder/dsh-agent-teams/lib/members.js packages/dsh-agent-teams/lib/members.js > tests/tmp/diff-members.js.patch
diff -u .../lib/state.js ...
diff -u .../lib/tools.js ...
diff -u .../lib/index.js ...

# 4. Round-trip team.json cũ: script tests/tmp/legacy-compat.mjs tạo team.json không có routeOverride, đọc qua readTeam, ghi lại qua writeTeam -> thành công.
```

## Findings

### 1. medium — `routeOverride.by` không được ghi cho tool và HTTP (thiếu provenance actor)

- `lib/tools.js:1263-1270`: tool `agent_teams_set_member_route` gọi `runtime.setMemberRoute` với `source: 'captain'` nhưng không truyền `by`.
- `lib/index.js:374-381`: action `/plan` `set_member_route` gọi `agentTeamsRuntime.setMemberRoute` với `source: 'http'` nhưng không truyền `by`.
- `lib/members.js:1169`: chỉ ghi `by: request.by`; vì tool/HTTP không truyền nên trường này bị bỏ qua.
- `lib/members.js:1041`: audit log `appendRouteChangeAudit` nối `source:by` khi có, nếu không thì chỉ còn `source`.

Thiết kế v1 §4.1 bước 7 yêu cầu:
- tool: `by: captain.session.id`
- HTTP: `by: "web:" + sessionId`

Hệ quả: audit độc lập không thể xác định captain nào đã ra lệnh đổi route qua tool, hoặc phiên web nào đã gọi `/plan`. Đây là lỗ hổng provenance trực tiếp đi ngược mục tiêu “có audit độc lập”.

**Yêu cầu sửa:**
1. Trong `lib/tools.js:1263-1270`, thêm `by: captain.session.id` khi gọi `runtime.setMemberRoute`.
2. Trong `lib/index.js:374-381`, thêm `by: `web:${sessionId}`` khi gọi `agentTeamsRuntime.setMemberRoute`.
3. `lib/members.js:1169` đã hỗ trợ `request.by` nên không cần sửa nếu caller truyền đúng.

### 2. low — Test F2 đặt tên và assertion mâu thuẫn

- `tests/t4-control-plane-smoke.mjs:282-298`: tên test “F2 the add_member tool starts a running member when the activation hook exists” nhưng assertion kiểm tra `out.spawned !== true` (dòng 290) và comment cho rằng `activateMemberNow` chưa được export.
- Thực tế `activateMemberNow` đã được export tại `lib/members.js:961`, nên test này không thực sự kiểm tra đường start ngay lập tức như tên ghi.

Hệ quả: test tạo cảm giác sai về khả năng “add member khởi động ngay trên running team”; nếu đường activation bị hỏng về sau, test vẫn PASS.

**Yêu cầu sửa:**
- Đổi tên test thành ý nghĩa phù hợp với assertion (ví dụ “add_member keeps a running roster row unspawned when activation hook is absent”), HOẶC
- Giữ tên và sửa assertion thành `out.spawned === true`, đồng thờid thêm case riêng cho `activation=on-task` / staged để cover đường không spawn.

### 3. low — `update_member` vẫn sửa trực tiếp `provider`/`model` (rủi ro pre-existing)

- `lib/index.js:390-408`: action `update_member` trong `/plan` vẫn tạo mutation ghi đè `provider`/`model` trực tiếp trên member.
- Đây là hành vi kế thừa từ v0.1.28, không phải lỗi mới của v1, nhưng cần ghi nhận: nếu member đang chạy bị đổi route qua `update_member`, cold resume kế tiếp có thể nổ descriptor guard vì descriptor cũ không khớp `provider`/`model` mới.

**Yêu cầu sửa (không bắt buộc vòng 1):** tài liệu hoá rõ `update_member` chỉ nên dùng khi member chưa spawn; khi member đang chạy, luôn dùng `set_member_route` để tránh guard lỗi.

## Kiểm tra riêng theo checklist

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Đúng thiết kế t2 | Đạt | `routeOf` 5 nhánh đúng thứ tự, `selectionFromMember` dùng `routeOf`, `setLiveRoute` chỉ gán `.current` |
| Validate ở biên đĩa | Đạt | `readTeam`/`readTeamSync` reject routeOverride malformed (t3 case 18); `setMemberRoute` resolve+validate trước writeTeam |
| Khoá `withTeamLock` | Đạt | `setMemberRoute` dùng `withTeamLock(`team:${stateRoot}:${teamId}`)`, cùng dạng `teamLockKey` với các path khác |
| Đường lỗi | Đạt | `/plan` bắt lỗi và trả 409; `setMemberRoute` throw trước write khi model không hợp lệ |
| Quyền công cụ captain/member | Đạt | `agent_teams_set_member_route` nằm trong `CAPTAIN_TOOL_NAMES` |
| Path traversal ở /plan | Đạt | `sessionId`/`teamId` chỉ kiểm tra non-empty, không dùng làm path; `action` so sánh chính xác |
| Tương thích team.json cũ | Đạt | `legacy-compat.mjs` đọc/ghi team không `routeOverride` thành công |
| Fake-success / skip | Không phát hiện | 18/18 + 19/19, không `test.skip`/`it.skip`, assertion là thật (trừ F2 mô tả sai) |
| Không hồi quy luồng staged | Đạt | `addMemberNow` chỉ spawn khi phase !== 'staged'; `setMemberRoute` trả `durable-only` khi `member.id === ''` |

## Kết luận

**ĐÁNH GIÁ: ĐẠT** cho vòng 1 với điều kiện khắc phục finding #1 (medium) trước khi coi audit route là hoàn thiện. Finding #2 (low) nên sửa để smoke test không đánh lừa. Không có blocker hay high nào ngăn downstream.

audit-kimi  
attempt_id: 666fa326-3a44-456d-bcbb-82644dbb72d5
