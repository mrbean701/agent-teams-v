# t104 — pack vòng 15 (sau t102 lenient-read + t103 write-clamp)

Chạy từ `E:/Project/Agent-Team`. Artefact sinh bởi `node tests/t104-pack.mjs` (chấm lại: `--analyze <dir>`, không tốn quota).

## Tarball phát hành

| tệp | sha256 | bytes | entry |
| --- | --- | --- | --- |
| `packages/dsh-agent-teams/tests/tmp/t104/nami-dsh-agent-teams-0.2.0-dev.0.tgz` | `771298f33c08abf6133cb4b087bd9a2c644e97a4756c46b2b997101d70d53b0d` | 2 246 406 | 133 |

Hai lần `npm pack` độc lập (`tests/tmp/t104` và `tests/tmp/t104/repack`) cho CÙNG sha256, cùng bytes, cùng 133 entry.
Run dir: `packages/dsh-agent-teams/tests/tmp/t104/run-2026-10-31T23-31-54Z`; log `tests/tmp/t104-run1.log`.

## Ba chiều 12/12 SAME (nguồn ↔ payload .tgz ↔ bản cài `agent-teams-pack15`)

| tệp | sha256 (16 đầu) | bytes |
| --- | --- | --- |
| lib/tools.js | 5deb03ca93b2a8e9 | 205 239 |
| lib/members.js | 50f558f8b207d874 | 102 260 |
| lib/state.js | 56664c59ff400319 | 57 508 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13 986 |
| lib/index.js | 2d28e617f0683e42 | 45 315 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |
| lib/client.js | 9da18d9971a284e9 | 258 432 |
| lib/client.js.map | bbf88608f54e966f | 404 958 |
| lib/types/members.d.ts | c53250ab41bff8c3 | 31 769 |
| lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7 627 |
| lib/client/ActivityPanel.module.css | 53ea47c6d780cd9d | 51 837 |
| package.json | 92a6404071e457cc | 10 498 |

drift = 0 ở cả 3 mốc (trước pack / ngay sau pack / sau khi cài); 27/27 check PASS, EXIT=0.

## Hai bằng chứng NGUYÊN VĂN trên bản ĐÃ CÀI

- guard write (`setMemberRoute(..., {source:'erp'})`, exit=0, threw=true, khớp từng ký tự):
  `agent-teams: route change for member "alice" refused: source "erp" is not one the plugin owns (valid sources: captain, http, profile); nothing was written`
- `agent_teams_status` lần gọi CUỐI (sau create) chứa dòng `Team id: t104probe · phase: staged`.

Boot: exit 0, `session-a3007654-6abc-4923-917b-baaebc7eda59`, 7 tool call thật (status, create, status, set_member_route, set_member_profile, add_member, edit_plan).
Hồi quy EXIT=0: t103 10/10 · t102 17/17 · t58 23/23 · t3 18/18 · t10 48/48 · t56 20/20 · t98 `--report` GREEN · t98 `--strict` GREEN (tools=16 fields=110 reached=104 uncovered=0).

## Giới hạn / trung thực

1. C26 gọi THẲNG `setMemberRoute` của bản cài qua `node --input-type=module -e` (biến môi trường `T104_GUARD_LIB`/`T104_GUARD_WS`), vì tool surface luôn truyền source `captain`/`http`/`profile` — không có đường nào từ tool để chọn source `erp`. Đối chứng âm: preflight `tests/tmp/t104-preflight-guard.mjs` cho thấy bản cài cũ (pack14, trước t103) ném `team "team-guard" was not found` ⇒ guard là hành vi MỚI của t103.
2. `--analyze` tự hash lại `.tgz` trên đĩa (sha256/bytes khớp meta); entry bị in `n/a` trong lượt chạy trực tiếp vì chỉ chế độ `--analyze` mới đếm lại entry từ đĩa.
3. Lần chạy hồi quy ĐẦU tiên tôi gọi hai tên suite TỰ ĐOÁN (`tests/t102-lenient-provenance.mjs`, `tests/t58-state-roundtrip.mjs`) ⇒ MODULE_NOT_FOUND, EXIT=1. Tên thật là `tests/t102-erp-read-leniency.mjs` và `tests/t58-erp-migrate.mjs`; chạy lại đúng tên mới xanh. Không có suite nào đỏ vì mã nguồn.
4. Không publish, không commit/push; không chạm profile desktop hay pack14. Bundle UI trong tarball chỉ được kiểm bằng grep dấu vết + token CSS, không mở GUI trên profile pack15.

Sinh bởi dev-build-flash (build) — task t104, attempt ec373564-40b0-4c9a-b040-9d3f9a84b213.
