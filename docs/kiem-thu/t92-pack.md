# t92 — Pack vòng 13 (sau t90 vá BUG-024) + probe export có exit-code thật

dev-build-flash · card t92 (attempt 1) · suite `tests/t92-pack.mjs` (sinh từ `tests/t88-pack.mjs`) · gate `t90.status === 'completed'` trong `.agent-teams/nami-agent-teams/team.json` (poll 30 s, trần 15 phút, đọc lại sau MỖI lần pack).

    node tests/t92-pack.mjs                                   # gate -> pack x2 -> verify -> cài -> boot
    node tests/t92-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t92   # chấm lại + HASH LẠI tarball trên đĩa

## Artefact
`packages/dsh-agent-teams/tests/tmp/t92/nami-dsh-agent-teams-0.2.0-dev.0.tgz`
sha256 `c3f9598620ba5f9077217566ac1e7f23e1dc7e708ae5983f5d447a4d701d3cb9` · **2 243 703 B** · **133 entry** · 2 lần `npm pack` độc lập CÙNG hash (`c3f9598620ba5f90`/`c3f9598620ba5f90`, bytes 2243703/2243703, entry 133/133).
run dir `tests/tmp/t92/run-2026-10-31T22-19-33Z` · log `tests/tmp/t92-run1.log`, `tests/tmp/t92-analyze.log` · 1 lần pack được nhận (trần 4), không lần nào bị loại.

## Ba chiều 12/12 SAME (nguồn ↔ payload .tgz ↔ bản cài `agent-teams-pack12`)
| tệp | sha256 (16) | bytes |  | tệp | sha256 (16) | bytes |
|---|---|---|---|---|---|---|
| lib/tools.js | a9ad29f8ae87a884 | 199 180 |  | lib/client.js | 9da18d9971a284e9 | 258 432 |
| lib/members.js | 4f818b73803da02a | 100 367 |  | lib/client.js.map | bbf88608f54e966f | 404 958 |
| lib/state.js | 7b49f5ab1d467b81 | 56 282 |  | lib/types/members.d.ts | c53250ab41bff8c3 | 31 769 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13 986 |  | lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7 627 |
| lib/index.js | 2d28e617f0683e42 | 45 315 |  | lib/client/ActivityPanel.module.css | 53ea47c6d780cd9d | 51 837 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |  | package.json | 92a6404071e457cc | 10 498 |

`lib/tools.js` là tệp t90 ghi (`a9ad29f8…`/199 180 B, trước đó `9be217b1…`/197 372 B); 11 tệp còn lại khớp bảng captain ⇒ baseline ngay trước pack **MISMATCHES=0**. Drift **=0** ở 3 mốc: trước pack / ngay sau pack / sau khi cài (C11, C12, C23). Hash đo bằng `node:crypto`, ASSERT độ dài 64 ký tự trước khi in SAME.

## tar -tzf (đã strip CRLF)
133 entry · 0 entry thư mục · 6/6 tệp bắt buộc (`package/lib/{tools,members,client,client.js.map,tool-names}.js`, `package/cordis.patch.yml`) · 0 rác (node_modules=0, package/tests=0, .tgz lồng=0, .pid=0, tools=0) · 0 đường dẫn tuyệt đối trong toàn bộ `lib/**` (C3, C17, C19).

## Probe trên bản ĐÃ CÀI + SELF_MUTATION
- 19/19 named export nạp thật từ `node_modules/@nami/dsh-agent-teams/lib` (gồm `selectionFromMember`, `recordAutoFallback`, `setMemberProfile`, `isFallbackFailureCode`, `selectFallbackRoute`); exit 0 CHỈ khi đủ hết (1 = thiếu tên, 2 = import ném lỗi).
- `lib/tool-names.js` bản cài: TEAM=16, CAPTAIN=12, có `agent_teams_set_member_route` + `agent_teams_set_member_profile` + `add_member` (C6, C20).
- Bundle bản cài 9/9 dấu vết: `data-member-route-control`, `data-add-member`, `aYQbCq_planSave`, `-route-default`, `-route-warning`, `-catalog-empty`, `pickDefaultRoute`, `data-error-detail`, `captainRoute` (C14, C15); CSS 719 token `aYQbCq_`/150 tên/141 lớp, bằng nguồn (C13).
- **SELF_MUTATION**: `caught=true`, marker `__t92_self_mutation_marker__`, exit `1,1,1,1,1` — probe thật sự bắt được thiếu tên (C22, vá V11-F3).

## Cài + boot + kết quả
Profile mới `C:/Users/thang/.dsh/profiles/agent-teams-pack12`: `npm i --offline --legacy-peer-deps <tgz>` exit 0, KHÔNG symlink, version `0.2.0-dev.0`, lock `resolved file:…t92/…tgz`. Boot headless exit 0, `session-ea73ef71-f328-4a9d-a02a-4928c38ab146`, gọi THẬT 4 tool: `agent_teams_status` (lỗi bình thường 'not leading any team'), `set_member_route`, `add_member`, `set_member_profile` (lỗi QUYỀN, không phải 'no such tool').
`23/23 checks passed, 0 failed` · EXIT=0 · `--analyze` EXIT=0 (tự hash tarball trên đĩa: `sha256Now=c3f9598620ba5f90`, `bytesNow=2243703`, `matchesMeta=true`). Hồi quy EXIT=0: t10 48/48 · t56 20/20 · t90 10/10 · t87 8/8.

## Giới hạn
peerDependencies không được cài vào profile (boot dựa vào runtime desktop cấp `@deepseek-ai/*`); bundle UI chỉ kiểm bằng chuỗi/CSS trong tệp, chưa mở GUI trên profile này; entry chỉ đếm lại từ đĩa ở chế độ `--analyze`; không publish/commit/push.
