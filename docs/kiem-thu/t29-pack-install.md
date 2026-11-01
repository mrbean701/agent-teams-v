# t29 — đóng gói `npm pack` + cài từ tarball vào profile sạch + boot

Mục tiêu: chứng minh **artifact phát hành** (`.tgz`) dùng được, không chỉ thư mục nguồn.
Trước t29, mọi bằng chứng E2E đều chạy trên profile `agent-teams-test` có `link:E:/...` trỏ thẳng vào repo.

## Cách chạy
```
node tests/t29-pack-install.mjs                      # pack (nếu chưa có) -> tạo profile sạch -> npm i .tgz -> boot -> chấm
node tests/t29-pack-install.mjs --analyze <dir>      # chấm lại artifact đã lưu, không mở phiên, không đốt quota
```
Script tự định vị (`import.meta.url`); không có đường dẫn tuyệt đối của máy nào trong mã (trừ spec `file:` ghi vào profile).

## Các bước nó làm
1. `npm pack --pack-destination tests/tmp/t29` trong `packages/dsh-agent-teams` (chạy được **offline**, `package.json` không có `prepack`/`prepare`).
2. Đọc tarball bằng bộ đọc ustar tự viết (gunzip + header 512B): liệt kê entry, bắt buộc/ cấm, sha256, sha256 của `package/lib/tools.js`.
3. Tạo profile **sạch** `C:\Users\thang\.dsh\profiles\agent-teams-pack-test`: copy `cordis.yml`/`pnpm-workspace.yaml`/`cordis.patch.yml` từ `agent-teams-test`, viết `package.json` với dep `file:<tgz>`, rồi `npm i --offline --no-audit --no-fund --legacy-peer-deps <tgz>`.
4. Boot headless thật: `dsh.cmd --profile agent-teams-pack-test --json -`, task một dòng: tạo đội 1 member `solo` rồi gọi `agent_teams_set_member_route`.
5. Chấm C1..C5 từ dữ liệu đã lưu (`meta.json`, `session1.stdout.txt`, `team.json`, `docs/log/MODEL-SWITCH.md`) ⇒ `--analyze` cho cùng verdict.

## Kết quả (artifact `tests/tmp/t29/run-2026-10-31T17-25-29`, chạy từ profile đã bị xoá ⇒ cài lại từ đầu)
| # | Tiêu chí | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| C1 | có .tgz thật | ĐẠT | `nami-dsh-agent-teams-0.2.0-dev.0.tgz` 2 188 799 B, sha256 `ac84c73a94d20507381723cafed4cb10923cd30104a424f08bf86469c7fbfdd7`, **133 entry** |
| C2 | đủ 6 tệp bắt buộc, không có node_modules/tests | ĐẠT | `package/lib/{tools,members,client,client.js.map,tool-names}.js` + `package/cordis.patch.yml` PRESENT; `node_modules` hit = 0; `^package/tests` hit = 0; 79 entry dưới `package/lib/` |
| C3 | cài từ tarball, KHÔNG symlink, boot exit 0 | ĐẠT | `lstat.isSymbolicLink=false`, `isDirectory=true`, realpath `C:\Users\thang\.dsh\profiles\agent-teams-pack-test\node_modules\@nami\dsh-agent-teams` (nằm trong profile), spec `file:E:/Project/Agent-Team/packages/dsh-agent-teams/tests/tmp/t29/nami-dsh-agent-teams-0.2.0-dev.0.tgz`; `lib/tools.js` đã cài sha256 `f1e06dea1738e822…c61b` **bằng đúng** sha256 của tệp trong tarball; boot exit 0 (10 463 ms) |
| C4 | tool mới chạy trong profile cài từ tarball | ĐẠT | tool_call `agent_teams_set_member_route` → tool_result nguyên văn: `Member "solo" route is now opencode-go/deepseek-v4.1-flash, reasoning high — saved; it takes effect the next time this member starts.`; `team.json` `routeOverride{provider:opencode-go, model:deepseek-v4.1-flash, reasoningEffort:high, source:"captain", by:"session-f425ec9b-…"}`; audit row: `\| 2026-10-31T17:25:39.472Z \| packtest \| solo \| opencode-go/kimi-k2.7-code \| opencode-go/deepseek-v4.1-flash (high) \| durable-only \| captain:session-f425ec9b-… \|` |
| C5 | giới hạn được nêu rõ | ĐẠT | `npm` chạy `--offline` (status 0, `added 1 package in 1s`) ⇒ không cần registry/mạng; 4 giới hạn ghi trong `meta.json` |

Verdict: **PASS — proved C1,C2,C3,C4,C5; unproved none** (exit 0). Chấm lại bằng `--analyze` trên cùng dir: exit 0, cùng verdict.

## Giới hạn đã biết (trung thực)
- **peerDependencies KHÔNG được cài vào profile**: `node_modules` của profile chỉ có `@nami/dsh-agent-teams`. Boot vẫn chạy vì runtime desktop cấp `@deepseek-ai/*` (giống mọi bundle khác của profile). Một người dùng cài bằng `npm i` ngoài runtime đó sẽ phải tự thoả peer deps.
- Test dùng `--legacy-peer-deps`; nếu bỏ cờ này, `npm i --offline` sẽ cố tải peer từ registry và **hỏng khi offline**.
- Tarball chứa `package/lib/git-artifact-stamp.json` và `release-notes/` — không kiểm nội dung hai thứ này.
- Boot chỉ chứng minh **tool server** nạp được từ tarball; `lib/client.js` (bundle UI) chưa được kiểm trong GUI sống ở profile này.
- Không publish, không commit; profile test là profile nháp, không đụng profile `desktop`.
