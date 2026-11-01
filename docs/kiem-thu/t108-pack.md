# t108 — Pack vòng 17 (sau t107: BUG-027 hồ sơ removed hiện trong text status)

Người: dev-build-flash · suite "tests/t108-pack.mjs" (29 check) · profile cài "agent-teams-pack16" · 2026-11-01

## Lệnh
- "node tests/t108-pack.mjs" → EXIT=1 (đúng 1 FAIL là lỗi của checker, xem mục "Trung thực")
- "node tests/t108-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t108" → EXIT=0, 29/29 PASS
- "node packages/dsh-agent-teams/tests/tmp/t108/drift-check.mjs" → EXIT=0, CAPTAIN_TABLE_MISMATCHES 0/13

## Artefact
- tarball "packages/dsh-agent-teams/tests/tmp/t108/nami-dsh-agent-teams-0.2.0-dev.0.tgz"
- sha256 "0cb3fdfe255c55e54b84b167f0eff24ee123fd9270396d239d5eaa11cfd63f18" · 2 247 534 B · 133 entry (0 entry thư mục)
- 2 lần npm pack độc lập: cùng sha256 + cùng bytes + cùng 133 entry ("tests/tmp/t108" và "tests/tmp/t108/repack")
- run dir "tests/tmp/t108/run-2026-11-01T00-15-14Z" · log "tests/tmp/t108-run1.log", "tests/tmp/t108-analyze.log"
- boot headless exit 0 · "session-04143385-6147-4556-8e7b-cda65f172581" · 8 tool_call thật (status, create, remove_member, status, set_member_route, set_member_profile, add_member, edit_plan)

## Ba chiều 13/13 SAME (nguồn ↔ payload .tgz ↔ bản cài) · drift=0 ở 3 mốc (trước pack / ngay sau pack / sau khi cài)
| tệp | sha256 (16) | bytes |
|---|---|---|
| lib/tools.js | d402c6586df1e140 | 210641 |
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

## Bằng chứng nghiệp vụ trên BẢN ĐÃ CÀI
- C28 (nguyên văn, boot mới): tiêu đề "Members (1 active + 1 removed):" + khối "Removed (1):"
- dòng Removed in ra: "  - bob [qa] opencode-go/deepseek-v4.1-flash · reasoning max · joined 2026-11-01T00:15:41.047Z"
- C29 trong "lib/tools.js" bản cài: removed_count=1 · removed_members=4 · "function removedLine("=1 · "member.runtime_setup.persona"=2
- C26 "setMemberRoute" trên bytes đã cài từ chối source 'erp' ĐÚNG NGUYÊN VĂN câu captain đưa (154 ký tự)
- C27 text status có "Team id: t108probe · phase: staged" · C22 SELF_MUTATION bắt được (exit=1,1,1,1,1) · C19 0 đường dẫn tuyệt đối

## Trung thực
- Lượt đầy đủ đầu tiên EXIT=1, đúng 1 FAIL: C18 đòi "frozenRows.length === 12" trong khi bảng captain là 13 dòng (thêm lib/types/tools.d.ts). Lỗi CHECKER; artefact không đổi byte nào.
- Sau khi vá C18 (dùng FILES.length), in thêm evidence của C28/C29 và sửa câu PASS "12 tệp"→"13 tệp", tôi chấm lại bằng "--analyze" (miễn quota) trên ĐÚNG tarball đó → 29/29. Ba thay đổi này không chạm phép đo nào.

## Hồi quy (EXIT=0, số case thật)
t107-removed-members-visible 12/12 · t103-write-source-clamp 10/10 · t102-erp-read-leniency 17/17 · t98 mặc định và --strict GREEN (tools=16 fields=112 reached=106 uncovered=0) · t58-erp-migrate 23/23 · t3-route-smoke 18/18 · t10-ui-bundle-smoke 48/48 · t56-types-fallback 20/20

## Giới hạn
- Dòng Removed của boot KHÔNG có persona/tools: "member.runtimeSetup" chỉ được ghi lúc ACTIVATE ("lib/members.js:1078") nên member chưa activate (bob) không có. Nhân chứng persona/tools lấy từ "tests/t107-removed-members-visible.mjs" (12/12, dòng ha-tang có "persona: …" + tools deny[] trên team.json ERP thật) + marker persona_clip trong bytes ship.
- Chưa publish/commit/push; không chạm profile desktop hay các profile pack≤15.
