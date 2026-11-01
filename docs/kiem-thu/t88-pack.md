# t88 — Pack vòng 12 + vá V11-F3 (probe con luôn exit 0)

Mục tiêu: sinh lại tarball phát hành sau `t87` (approve-override) và làm cho probe export
có khả năng FAIL thật (audit finding V11-F3). Nguồn: `tests/t88-pack.mjs` (kế thừa `tests/t84-pack.mjs`).

## Cách chạy

```
node tests/t88-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t88   # chấm lại, không tốn quota
node tests/t88-pack.mjs                                                     # cổng t87 + pack 2 lần + cài + boot
```

## V11-F3 — vá và bằng chứng

Trước: probe con dùng `process.exit(0)` ở CẢ nhánh `then` và nhánh `catch` của `import()`.
Chứng minh bằng chính đoạn code cũ (`tests/tmp/t88/old-probe-demo.mjs`, chạy trên bản đã cài):
`OLD probe exit=0 rows=[["TEAM_TOOL_NAMES",true],["__t88_self_mutation_marker__",false]]`
⇒ hỏi một export KHÔNG tồn tại vẫn exit 0: probe không thể fail.
Sau: con exit 0 chỉ khi đủ mọi tên, exit 1 khi thiếu tên (in `missing named export`), exit 2 khi import ném lỗi;
mỗi hàng ghi `status` thật của tiến trình con. `SELF_MUTATION` chèn marker không tồn tại vào want list
trong BỘ NHỚ (không chạm đĩa) ⇒ `SELF_MUTATION: caught exit=1,1,1,1,1` (check C22).
Hồi quy sớm (không pack, chạy trên lib đã cài của profile cũ): `clean probe: 19/19 exports present; child exits=0`
rồi `MUTATION_JSON {"caught":true,"exitCodes":[1,1,1,1,1]}`.

## Số đo lượt chạy (run-2026-10-31T21-53-09Z, 23/23 check, EXIT=0)

- Tarball `packages/dsh-agent-teams/tests/tmp/t88/nami-dsh-agent-teams-0.2.0-dev.0.tgz`
  sha256 `0adbc64e1564b079048c465634ba9d38e9795bdfa2662269a514124524ceed2c`, 2 243 224 B, 133 entry;
  2 lần `npm pack` độc lập CÙNG sha256+size. `--analyze` đọc lại từ đĩa: sha256/bytes/133 entry khớp meta, EXIT=0.
- Ba chiều 12/12 SAME (payload `.tgz` ↔ bản cài `agent-teams-pack11` ↔ nguồn); bản cài không symlink,
  `package-lock` resolved `file:`, version `0.2.0-dev.0`. Drift=0 ở 3 mốc (trước pack / ngay sau pack / sau khi cài).
- `tar -tzf` (strip CRLF): 133 entry, 0 entry thư mục, 6/6 tệp bắt buộc, 0 rác (`node_modules`, `package/tests`,
  `.tgz` lồng, `.pid`, `tools`). Bảng đóng băng 12 tệp khớp 12/12; chỉ `lib/tools.js` đổi so với t84 (t87).
- Probe export trên bản ĐÃ CÀI: 19/19 named export (superset của 16 tên brief yêu cầu), gồm
  `registerAgentTeamsTools`, `activateMemberNow`, `setMemberRoute`, `setMemberProfile`, `recordAutoFallback`,
  `selectionFromMember`; `CAPTAIN_TOOL_NAMES` chứa `agent_teams_set_member_route` + `agent_teams_set_member_profile`.
- Boot headless EXIT=0, session `session-7d83ca8d-1c32-4d72-91c5-a41a2292ecb7`, gọi THẬT 4 tool
  (`agent_teams_status`, `set_member_route`, `add_member`, `set_member_profile`) — lỗi quyền, không phải "no such tool".
- Hồi quy EXIT=0: t10 48/48 · t56 20/20 · t70 16/16 · t74 24/24 · t77 18/18 · t86 8/8 · t87 8/8.

## Giới hạn
- Peer dependencies không được cài vào profile sạch; boot chạy được vì runtime desktop cấp `@deepseek-ai/*`.
- Bundle UI chưa mở trong GUI thật ở profile `agent-teams-pack11`; chỉ kiểm bằng chuỗi dấu vết trong bytes đã cài.
- `C21` in `entry=n/a` trong lượt chạy trực tiếp (chỉ `--analyze` mới đếm lại entry từ đĩa).
- Không publish, không commit/push; profile desktop và `agent-teams-pack2..10` không bị chạm. Dùng 2 lần pack, 1 boot.
