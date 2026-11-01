# t111 — Pack vòng 18 (sau t110: tiêu đề "Members (N present + M removed)" + cổng t98 mạnh hơn)

Người: dev-build-flash · suite "packages/dsh-agent-teams/tests/t111-pack.mjs" (29 check) · profile cài mới "agent-teams-pack17" · 2026-11-01

## Lệnh
- "node packages/dsh-agent-teams/tests/t111-pack.mjs" → EXIT=0, 29/29 PASS (một lượt, không phải chấm lại)
- "node packages/dsh-agent-teams/tests/t111-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t111" → EXIT=0

## Artefact
- tarball "packages/dsh-agent-teams/tests/tmp/t111/nami-dsh-agent-teams-0.2.0-dev.0.tgz"
- sha256 "1bb0ef1fc83acf50a4c9e4f361605352a76c6ed2deca3d9bfe52403a6414dc38" · 2 247 954 B · 133 entry · 0 entry thư mục
- 2 lần npm pack độc lập (tests/tmp/t111 và tests/tmp/t111/repack): CÙNG sha256 + CÙNG bytes + CÙNG 133 entry. Không có lần pack nào bị loại.
- run dir "tests/tmp/t111/run-2026-11-01T00-57-41Z" · log "tests/tmp/t111-run1.log"
- Cổng: t110 "completed" lúc pack (1 lần hỏi) và "completed -> completed" suốt cửa sổ pack; cổng nội dung "present + "=1 / "active + "=0 kiểm trong script.

## Ba chiều 13/13 SAME (nguồn ↔ payload .tgz ↔ bản cài) · drift=0 ở 3 mốc (trước pack / ngay sau pack / sau khi cài)
| tệp | sha256 (16) | bytes |
|---|---|---|
| lib/tools.js | 88dbee4079f95ffd | 213071 |
| lib/members.js | 50f558f8b207d874 | 102260 |
| lib/state.js | 56664c59ff400319 | 57508 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13986 |
| lib/index.js | 2d28e617f0683e42 | 45315 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |
| lib/client.js | 9da18d9971a284e9 | 258432 |
| lib/client.js.map | bbf88608f54e966f | 404958 |
| lib/types/members.d.ts | c53250ab41bff8c3 | 31769 |
| lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7627 |
| lib/types/tools.d.ts | 41cfc56576ed8ffd | 7546 |
| lib/client/ActivityPanel.module.css | 53ea47c6d780cd9d | 51837 |
| package.json | 92a6404071e457cc | 10498 |
Nguồn số: tôi tự đo trên đĩa ngay sau khi t110 completed, đối chiếu khớp artefacts t110 tự báo (tools.js 88dbee40…/213 071 B).

## Cài + boot (bản ĐÃ CÀI)
- profile "agent-teams-pack17": npm exit 0 · symlink=false · dir=true · version 0.2.0-dev.0
- lock resolve ĐÚNG tarball vòng này: "file:E:/Project/Agent-Team/packages/dsh-agent-teams/tests/tmp/t111/nami-dsh-agent-teams-0.2.0-dev.0.tgz"
- boot headless exit 0 · "session-20afa79d-73e4-4b27-b40c-0cdfdb646054" · 8 tool_call thật
- C28 nguyên văn: "Members (1 present + 1 removed):" + "Removed (1):" + dòng "  - bob [qa] opencode-go/deepseek-v4.1-flash · reasoning max · joined 2026-11-01T00:58:08.571Z"
- Ghi chú in kèm: member đó CHƯA activate nên không có persona/tools ("member.runtimeSetup" chỉ ghi lúc ACTIVATE, "lib/members.js:1078"); nhân chứng persona/tools nằm ở "tests/t107-removed-members-visible.mjs" (12/12).
- C29 trên lib/tools.js bản cài: removed_count=3 · removed_members=5 · "function removedLine("=1 · "member.runtime_setup.persona"=2
- Khác: C26 guard source "erp" nguyên văn (154 ký tự) · C27 "Team id: t111probe · phase: staged" · C19 0 đường dẫn tuyệt đối · C22 SELF_MUTATION caught (exit=1,1,1,1,1) · C21 tarball trên đĩa khớp meta.

## Hồi quy (EXIT=0, số case thật)
t107-removed-members-visible 12/12 · t10-ui-bundle-smoke 48/48 · t56-types-fallback 20/20 · t98 render-coverage MẶC ĐỊNH và --strict đều GREEN (tools=16 fields=112 reached=106 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0).

## Giới hạn
- "tests/t108-pack.mjs --analyze tests/tmp/t108" vẫn xanh 29/29 vì --analyze chấm lại SỐ ĐO ĐÃ GHI của artefact cũ, không đọc nguồn sống; một lượt chạy MỚI của t108 sẽ đỏ (ghim hash nguồn cũ) — đúng thiết kế, tôi KHÔNG chạy lại để khỏi ghi đè tarball lịch sử.
- Vẫn chưa publish/commit/push; không chạm profile desktop hay pack≤16.
