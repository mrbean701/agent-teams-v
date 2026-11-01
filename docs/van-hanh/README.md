# Vận hành @nami/dsh-agent-teams — mục lục tài liệu và quy tắc đổi route

Cập nhật: 2026-10-31 (task t13, attempt 1, attempt_id `87967ebc-c510-4eda-84c8-2cfb0c00ad70`).
Đây là **cửa vào** cho người vận hành. Trạng thái dự án không nằm ở tài liệu này mà ở
[docs/TODO.md](../TODO.md) và [.agent-teams/nami-agent-teams/team.json](../../.agent-teams/nami-agent-teams/team.json)
(quy tắc "nguồn sự thật nằm trong file": [docs/quy-tac-du-an.md](../quy-tac-du-an.md) §5).

## 1. Quy tắc một dòng (đọc trước khi làm gì khác)

> Member **chưa spawn** → sửa route bằng `update_member`. Member **đang chạy** → luôn dùng
> `agent_teams_set_member_route` (hoặc UI/HTTP `action: "set_member_route"`). Không có ngoại lệ.

## 2. Vì sao (neo mã, không phải niềm tin)

| Sự thật | Neo đã đọc lại |
|---|---|
| `update_member` ghi thẳng `provider`/`model` vào hàng roster (spine) — không ghi `routeOverride`, không phát notice, không ghi audit | `lib/index.js:399-408` (nhánh dựng mutation; thiếu field → `memberName, provider, and model are required` :403) |
| Nhánh áp mutation ghi đè spine | `lib/tools.js:588-590` |
| Chặn thật khi team đang chạy: "a running team only permits update_task edits…" | `lib/tools.js:573-574` |
| Chặn thật khi member đã spawn: "staged member \"<name>\" was already spawned" | `lib/tools.js:579-580` |
| Guard descriptor chỉ so **spine** với descriptor, nên `set_member_route` (không ghi spine) không bao giờ làm nó nổ | `lib/members.js:621-622` (`saved model route for member "…" does not match its subagent descriptor`) |
| `set_member_route` chỉ ghi `routeOverride` + `selectionRef.current` | `lib/tools.js:1226-1282`, `lib/members.js:1128-1141` |

**Rủi ro còn lại, nói thẳng:** chốt `lib/tools.js:573-580` nằm ở tầng *áp mutation*, không phải ở
schema `team.json`. Ai **sửa tay `team.json`** đổi `provider`/`model` của một member đã có `id`
sẽ đi vòng qua cả hai chốt đó, và lần cold resume kế tiếp sẽ nổ guard `lib/members.js:621` với
`agent-teams: saved model route for member "…" does not match its subagent descriptor`.
Đã kiểm bằng probe độc lập: [docs/audit/probe-q1.mjs](../audit/probe-q1.mjs) — `routeOf` trả
`origin: 'override'`, guard trên spine khai báo `THROW=false`. Chi tiết đầy đủ ở
[khuyen-nghi-update-member.md](khuyen-nghi-update-member.md) (t7, 92 dòng).

## 3. Mục lục tài liệu đã sinh ra

### 3.1 Chuẩn mực và kế hoạch
- [docs/MASTER-PROMPT.md](../MASTER-PROMPT.md) — 11 điều kiện hoàn thành MASTER TASK (§7), quy tắc log (§4), báo cáo (§5).
- [docs/quy-tac-du-an.md](../quy-tac-du-an.md) — bảy nhóm log bắt buộc (§3), chính sách model, cấm chạm ERP/profile desktop.
- [docs/ke-hoach-staged.md](../ke-hoach-staged.md) — kế hoạch staged gốc, 13 nhiệm vụ.
- [docs/TODO.md](../TODO.md) — **bảng trạng thái chuẩn** (VERIFIED/OPEN/…, provenance t14-t22, quyết định đang ràng buộc).
- [docs/DEPENDENCIES.md](../DEPENDENCIES.md) + [docs/provenance-tasks.json](../provenance-tasks.json) — DAG và nguồn gốc task phụ (`node tools/dependency-report.mjs`).

### 3.2 Nghiên cứu và thiết kế
- [docs/nghien-cuu/hop-dong-host.md](../nghien-cuu/hop-dong-host.md) — hợp đồng host 0.2.1-rc.5: model-selection 3 hook, descriptor version 3, notice `[model changed: …]`.
- [docs/thiet-ke/thiet-ke-v1.md](../thiet-ke/thiet-ke-v1.md) — thiết kế v1: `routeOverride` là object có metadata, 11 bước `setMemberRoute`, trần 8/12, tương thích ngược 4 chiều.

### 3.3 Audit (người làm ≠ người audit)
- [docs/audit/vong-1.md](../audit/vong-1.md) · [vong-2.md](../audit/vong-2.md) · [dong-finding-vong-1.md](../audit/dong-finding-vong-1.md)
- Probe độc lập: [probe-q1.mjs](../audit/probe-q1.mjs) (cold resume), [probe-erp.mjs](../audit/probe-erp.mjs) (bytes ERP không đổi).

### 3.4 Kiểm thử (bằng chứng máy chạy được)
- [moi-truong.md](../kiem-thu/moi-truong.md) — profile nháp `agent-teams-test`, `tools/test/test-env.mjs`, `smoke-team.mjs`.
- [t9-bundle-kha-thi.md](../kiem-thu/t9-bundle-kha-thi.md) · [t22-build-bundle.md](../kiem-thu/t22-build-bundle.md) — lịch sử build bundle, `node build/build.mjs`.
- [t10-ui.md](../kiem-thu/t10-ui.md) — UI chọn route + form thêm member (22/22).
- [t11-http-e2e.md](../kiem-thu/t11-http-e2e.md) — HTTP `/plan` thật, 11 check.
- [add-member-e2e.md](../kiem-thu/add-member-e2e.md) · [hot-switch-e2e.md](../kiem-thu/hot-switch-e2e.md) — thêm member khi đội chạy, đổi route member đang chạy.
- [tuong-thich-erp.md](../kiem-thu/tuong-thich-erp.md) — 15/15 case với `team.json` ERP thật (1 533 117 B).
- Script chạy lại (mọi script tự định vị, đều có `--analyze` để chấm lại artifact miễn quota):

  | Suite | Kết quả hiện tại | Loại |
  |---|---|---|
  | `tests/t3-route-smoke.mjs` | 18/18 | routeOverride + cold resume |
  | `tests/t4-control-plane-smoke.mjs` | 22/22 | tool + HTTP /plan |
  | `tests/t10-ui-bundle-smoke.mjs` | 22/22 | bundle UI (sha256 01aadd77…f178 / 191 298 B) |
  | `tests/t15-activate-member.mjs` | 21/21 | spawned=true + 12 case parity toolPolicy (không có suite `t17` riêng) |
  | `tests/t18-hot-switch-e2e.mjs --analyze` | 9/9 | E2E đổi route member đang chạy |
  | `tests/t20-erp-compat.mjs` | 15/15 | team.json ERP thật |
  | `tests/t21-add-member-e2e.mjs` | 7/7 | E2E thêm member khi đội chạy |
  | `tests/t11-http-e2e.mjs --analyze` | 11/11 | HTTP acceptance C1..C8 |

### 3.5 Vận hành (thư mục này)
- [README.md](README.md) — tài liệu này.
- [khuyen-nghi-update-member.md](khuyen-nghi-update-member.md) — phân tích sâu `update_member` vs `set_member_route` (t7).
- [di-migrate-va-rollback.md](di-migrate-va-rollback.md) — cài/chuyển từ `@nanmicoder/dsh-agent-teams` v0.1.28 sang `@nami/dsh-agent-teams` 0.2.x, checklist dogfood, rollback.

### 3.6 Log và báo cáo
- Bảy nhóm log bắt buộc ([quy-tac-du-an.md](../quy-tac-du-an.md) §3): `BA.md`, `CHECK.md`, `TEST.md`, `BUG.md`, `HANDLE.md`, `AUDIT.md`, `ACTIVITY.md`.
- Bốn nhóm bổ sung ([MASTER-PROMPT.md](../MASTER-PROMPT.md) §4): `MEMBER.md`, `MODEL-SWITCH.md`, `ROUTING.md`, `SKILL-EXECUTION.md` — cộng `MODEL-SWITCH-notes.md`;
  tổng 11 nhóm + 1 file ghi chú, đều trong [docs/log/](../log/). **`MODEL-SWITCH.md` là file MÁY ĐỌC**
  (header + dòng bảng do `appendRouteChangeAudit` ghi) — văn xuôi phải vào `MODEL-SWITCH-notes.md`.
- Báo cáo Telegram: [docs/bao-cao-telegram.md](../bao-cao-telegram.md) (runbook, chat `-1004360988691`),
  mẫu 6 mục [docs/mau-bao-cao-telegram.md](../mau-bao-cao-telegram.md), 6 kỳ đã gửi [ky-01…ky-06](../bao-cao-telegram/),
  script `node tools/telegram-report.mjs --file <file>`.

## 4. Ba khoảng trống đã biết — và cách đối xử cho đúng

### 4.1 Audit trail chuẩn KHÔNG phải session event (`lib/events.js:25-46`)
`appendTeamEvent` bỏ **mọi** event `agent-teams/*` khi harness không khai báo type đó trong
`KNOWN_SESSION_EVENT_TYPES`: `const known = dshSession.KNOWN_SESSION_EVENT_TYPES;` (`:32`) rồi
`if (known?.has(type) !== true) { … return; }` (`:33-39`, chỉ ghi một dòng `ctx.logger.debug`).
Hệ quả vận hành: **đừng** đi tìm dấu vết đổi route trong session log/transcript của captain — có thể
không có. Nguồn chuẩn là:

1. `<workspace>/docs/log/MODEL-SWITCH.md` — file MÁY ĐỌC, mỗi lần đổi route thêm 1 dòng bảng (`appendRouteChangeAudit`);
2. `<workspace>/.agent-teams/<team>/team.json` — `routeOverride` trên member + trạng thái task/attempt;
3. transcript **của member** (notice `[model changed: …]` và `request/header` kế tiếp) — thuộc host, không thuộc plugin.

Disk state là nguồn chân lý cho panel và cho người vận hành (comment trong `lib/events.js:26-31` nói đúng vậy).

### 4.2 Route `/plugins/dsh-agent-teams/plan`: auth fence 401 và 405/413 CHƯA có test (F3)
Mã **có** nhánh `405` khi `req.method !== 'POST'` (`lib/index.js:275-279`) và `400` khi thiếu
`sessionId/teamId/action` (`:288-293`, cộng `RequestBodyError.status` cho body hỏng), nhưng **không**
có test nào phủ các mã đó: t11 chỉ chứng minh `200` và `409`. Không tìm thấy nhánh `401` nào ở tầng
plugin — nghĩa là nếu webServer có chặn thì **chưa ai chứng minh**, và ngược lại cũng chưa ai chứng minh
route mở. Chưa có số đo giới hạn kích thước body (`413`). Cách đối xử: coi route này là **chỉ dùng
trong profile tin cậy**, đừng expose ra mạng.

### 4.3 Rollback ngược chưa có bằng chứng
0.2.x đã ghi `routeOverride` rồi mở lại bằng 0.1.28 thì chưa ai chạy; xem mục 5 của
[di-migrate-va-rollback.md](di-migrate-va-rollback.md). Ngoài ra dogfood trong phiên master vẫn treo vì
BUG-003 (phiên đang nạp v0.1.28); bằng chứng thay thế là t11/t18/t21 trên profile nháp.

Phần hồ sơ do audit vòng 2 nêu (F1 TODO lệch số, F2 DEPENDENCIES cũ, F9 Telegram thiếu message_id) thuộc
captain, không thuộc tài liệu này.
