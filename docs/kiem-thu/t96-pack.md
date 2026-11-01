# t96 — Pack vòng 13 (sau t94: render `agent_teams_edit_plan` in roster)

dev-build-flash · card t96 (attempt 1) · suite `tests/t96-pack.mjs` (sinh từ `tests/t92-pack.mjs`) · gate `t94.status === 'completed'` (poll 30 s, trần 15 phút, đọc lại sau MỖI lần pack).

    node tests/t96-pack.mjs                                   # gate -> pack x2 -> verify -> cài -> boot
    node tests/t96-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t96   # chấm lại + HASH LẠI tarball trên đĩa

## Artefact
`packages/dsh-agent-teams/tests/tmp/t96/nami-dsh-agent-teams-0.2.0-dev.0.tgz`
sha256 `0b9220eabbc4584fc3c4d925816bfc54f80989eaca0d62fee4940a54172c9e70` · **2 243 920 B** · **133 entry** · 2 lần `npm pack` độc lập CÙNG hash (`0b9220eabbc4584f`/`0b9220eabbc4584f`, bytes 2243920/2243920, entry 133/133).
run dir `tests/tmp/t96/run-2026-10-31T22-28-47Z` · log `tests/tmp/t96-run1.log`, `tests/tmp/t96-analyze.log` · 2 lần pack được nhận (trần 4), không lần nào bị loại.

## Ba chiều 12/12 SAME (nguồn ↔ payload .tgz ↔ bản cài `agent-teams-pack13`)
| tệp | sha256 (16) | bytes |  | tệp | sha256 (16) | bytes |
|---|---|---|---|---|---|---|
| lib/tools.js | 6150b7b287cb815d | 199 872 |  | lib/client.js | 9da18d9971a284e9 | 258 432 |
| lib/members.js | 4f818b73803da02a | 100 367 |  | lib/client.js.map | bbf88608f54e966f | 404 958 |
| lib/state.js | 7b49f5ab1d467b81 | 56 282 |  | lib/types/members.d.ts | c53250ab41bff8c3 | 31 769 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13 986 |  | lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7 627 |
| lib/index.js | 2d28e617f0683e42 | 45 315 |  | lib/client/ActivityPanel.module.css | 53ea47c6d780cd9d | 51 837 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |  | package.json | 92a6404071e457cc | 10 498 |

`lib/tools.js` = bản t94 (`6150b7b2…`/199 872 B); 11 tệp còn lại y bảng captain ⇒ baseline ngay trước pack **MISMATCHES=0** (`tests/tmp/t96/frozen-after-t94.json`). Drift **=0** ở 3 mốc: trước pack / ngay sau pack / sau khi cài (C11, C12, C23). Hash đo bằng `node:crypto`, ASSERT độ dài 64 trước khi in SAME.

## tar -tzf (đã strip CRLF)
133 entry · 0 entry thư mục · 6/6 tệp bắt buộc (`package/lib/{tools,members,client,client.js.map,tool-names}.js`, `package/cordis.patch.yml`) · 0 rác (node_modules=0, package/tests=0, .tgz lồng=0, .pid=0, tools=0) · 0 đường dẫn tuyệt đối trong toàn bộ `lib/**` (C3, C17, C19).

## Boot thật + text `agent_teams_edit_plan` nguyên văn (C24)
Session `session-6bfdf0cf-cf78-4084-bea1-ba037fa3f1c8`, exit 0, 6 tool call thật: `agent_teams_status`, `agent_teams_create` (staged, approval=required), `set_member_route` (alice → `deepseek-official/deepseek-v4-pro`), `set_member_profile`, `add_member`, `edit_plan`.
```
Staged plan updated atomically (3 members, 1 tasks, 0 dependencies). No members were spawned and no tasks were scheduled.
t1: probe task -> bob
alice (researcher; deepseek-official/deepseek-v4-pro (override))
bob (qa; opencode-go/deepseek-v4.1-flash)
probe (worker; opencode-go/deepseek-v4.1-flash)
```
Tức là roster đã ra VĂN BẢN (vá lần 2 của BUG-024), route hiển thị là route HIỆU LỰC và dấu `(override)` có mặt; 2 dòng kia không dấu ⇒ format cũ giữ nguyên byte.

## Probe trên bản ĐÃ CÀI
19/19 named export nạp thật từ `node_modules/@nami/dsh-agent-teams/lib` (gồm `selectionFromMember`, `recordAutoFallback`, `setMemberProfile`); exit 0 CHỈ khi đủ hết. `tool-names.js` bản cài: TEAM=16, CAPTAIN=12, có `set_member_route` + `set_member_profile` + `add_member`. Bundle bản cài 8/8 dấu vết (`data-member-route-control`, `data-add-member`, `aYQbCq_planSave`, `-route-default`, `-route-warning`, `-catalog-empty`, `pickDefaultRoute`, `data-error-detail`, `captainRoute`); CSS 719 token `aYQbCq_`/150 tên/141 lớp = nguồn. **SELF_MUTATION**: `caught=true`, exit `1,1,1,1,1`.

## Cài + kết quả
Profile mới `C:/Users/thang/.dsh/profiles/agent-teams-pack13`: `npm i --offline --legacy-peer-deps <tgz>` exit 0, KHÔNG symlink, version `0.2.0-dev.0`, lock `resolved file:…t96/…tgz`.
`24/24 checks passed, 0 failed` · EXIT=0 · `--analyze` EXIT=0 (tự hash tarball trên đĩa: `sha256Now=0b9220eabbc4584f`, `bytesNow=2243920`, `matchesMeta=true`). Hồi quy EXIT=0: t10 48/48 · t56 20/20 · t94 9/9 · t90 10/10 · t87 8/8.

## Giới hạn
peerDependencies không được cài vào profile (boot dựa vào runtime desktop cấp `@deepseek-ai/*`); bundle UI kiểm bằng chuỗi/CSS trong tệp, chưa mở GUI trên profile này; C24 khẳng định đúng 2 dòng roster + summary, không khẳng định thứ tự mọi dòng; entry chỉ đếm lại từ đĩa ở `--analyze`; không publish/commit/push.
