# t100 — Pack vòng 14 (sau t98 + t99): render parity, drift 3 mốc, probe exit-code thật

Chạy từ `E:/Project/Agent-Team`. Suite `tests/t100-pack.mjs` (kế thừa `tests/t96-pack.mjs`):
`node tests/t100-pack.mjs` (cổng t99 → pack ×2 → 3 chiều → cài → boot) và
`node tests/t100-pack.mjs --analyze <dir>` (chấm lại + HASH LẠI tarball trên đĩa, không tốn quota).
## 1. Artefact

| mục | giá trị |
| --- | --- |
| tarball | `packages/dsh-agent-teams/tests/tmp/t100/nami-dsh-agent-teams-0.2.0-dev.0.tgz` |
| sha256 | `d7a8bce4a333170bb304cc7d07fbcd5979091c976e314c82225eb4bcb57c9b1a` |
| bytes | 2 245 210 |
| entry | 133 (tar -tzf strip CRLF: 133, entry thư mục 0, bắt buộc 6/6, rác 0) |
| 2 lần pack | cùng sha256 + cùng bytes (`tests/tmp/t100` và `tests/tmp/t100/repack`) |
| run dir | `packages/dsh-agent-teams/tests/tmp/t100/run-2026-10-31T23-04-42Z` |
| profile | `C:/Users/thang/.dsh/profiles/agent-teams-pack14` (không symlink, 0.2.0-dev.0, lock `file:`) |

## 2. Ba chiều 12/12 SAME (nguồn ↔ payload .tgz ↔ bản cài) — prefix sha256/bytes

tools.js 5deb03ca93b2/205 239 · members.js 4f818b73803d/100 367 · state.js 7b49f5ab1d46/56 282 ·
snapshot.js a2a87e1b0c0b/13 986 · index.js 2d28e617f068/45 315 · tool-names.js e3def5db908d/808 ·
client.js 9da18d9971a2/258 432 · client.js.map bbf88608f54e/404 958 · members.d.ts c53250ab41bf/31 769 ·
snapshot.d.ts 962f99a7bcb1/7 627 · ActivityPanel.module.css 53ea47c6d780/51 837 · package.json 92a6404071e4/10 498.
drift=0 tại 3 mốc (trước pack / ngay sau pack / sau khi cài); C18 baseline khớp bảng đóng băng của
captain 12/12; nguồn `lib/**` (38 tệp) không đổi trong suốt lượt (C9).

## 3. Render parity — text NGUYÊN VĂN từ boot thật (session-d3abaea9-8a43-4ecd-9f67-8c2584fa4310)

`agent_teams_edit_plan`:
```
Staged plan updated atomically (3 members, 1 tasks, 0 dependencies). No members were spawned and no tasks were scheduled.
alice (researcher; deepseek-official/deepseek-v4-pro (override))
bob (qa; opencode-go/deepseek-v4.1-flash)
probe (worker; opencode-go/deepseek-v4.1-flash)
```
`agent_teams_create` (C25 — khối Members từng bị bỏ khỏi text trước t99): `Members (2):` + route từng
member (len=463, membersBlock=true, rows=ok).

## 4. Kết quả

25/25 check PASS, `RUN_EXIT=0`; `--analyze` EXIT=0 (sha256Now `d7a8bce4a333170b`, bytesNow 2 245 210,
matchesMeta=true). SELF_MUTATION caught `exit=1,1,1,1,1`; probe bản CÀI 19/19 named export.
Hồi quy EXIT=0: t98 mặc định VÀ `--strict` (GREEN, 110 field/104 reached/0 uncovered) · t99 11/11 ·
t10 48/48 · t56 20/20 · t94 9/9.
## 5. Giới hạn

- peerDependencies không cài vào profile (boot dựa vào runtime desktop cấp `@deepseek-ai/*`).
- Bundle `lib/client.js` đã cài kiểm bằng chuỗi dấu vết (C13/C14/C15), KHÔNG mở GUI thật.
- C24/C25 phụ thuộc câu chữ do plugin render; đổi text sẽ làm check đỏ dù artefact vẫn đúng.
- Không publish/commit/push; profile desktop và pack9..pack13 không bị chạm.
