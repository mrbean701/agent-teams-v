# t35 — Đóng gói lại tarball phát hành + kiểm 3 chiều + boot profile sạch

Mục tiêu: tarball t29 CŨ hơn mã nguồn (t28 thêm provider-failure trace, t30 thêm `last_failure` vào DTO `agent_teams_status`), nên 4 tệp lõi trong artefact không còn là bản đang chạy. Task này đóng gói lại và chứng minh CÙNG một bộ byte đi qua ba nơi: payload trong tarball → bản cài trong profile sạch → cây nguồn.

## Cách chạy
```
node tests/t35-pack-repack.mjs                  # pack + verify + cài + boot (tốn 1 phiên)
node tests/t35-pack-repack.mjs --analyze <dir>  # chấm lại meta.json trên đĩa, 0 quota
```

Script tự định vị (`import.meta.url`), không có đường dẫn tuyệt đối. Nó `npm pack` trong `packages/dsh-agent-teams` với `--pack-destination tests/tmp/t35`, xoá `*.tgz` cũ trước khi pack, đọc tarball bằng bộ đọc ustar tối thiểu (xử lý `L`/`x`/`g`) rồi đối chiếu `tar -tzf` (bỏ `\r` do Windows sinh CRLF), cài vào profile MỚI `agent-teams-pack2` bằng `npm i --offline` (0 mạng), và chạy headless `--profile agent-teams-pack2 --json -`.

## Kết quả lần chạy đóng (run-2026-10-31T17-52-10Z, exit 0)

Tarball: `nami-dsh-agent-teams-0.2.0-dev.0.tgz` — sha256 `c3e3e88a77131e19d7b9bc2ed6828097986bb959db660607f368d12ce2a42745`, 2191904 B, 133 entry (= đúng 133 tên `tar -tzf` đọc được). Hai lần `npm pack` độc lập (run-2026-10-31T17-51-00Z và run-2026-10-31T17-52-10Z) cho CÙNG sha256.

| tệp | payload | installed | source | byte | |
|---|---|---|---|---|---|
| lib/tools.js | 7fde7bbc49db | 7fde7bbc49db | 7fde7bbc49db | 179184 | SAME |
| lib/members.js | affd3bf99c59 | affd3bf99c59 | affd3bf99c59 | 77228 | SAME |
| lib/state.js | 3bdbbf7d8f4e | 3bdbbf7d8f4e | 3bdbbf7d8f4e | 55938 | SAME |
| lib/snapshot.js | b0799634615c | b0799634615c | b0799634615c | 10994 | SAME |
| lib/client.js | 0026ac70a5fc | 0026ac70a5fc | 0026ac70a5fc | 193129 | SAME |
| lib/client.js.map | 28facff2641a | 28facff2641a | 28facff2641a | 326147 | SAME |
| package.json | 92a6404071e4 | 92a6404071e4 | 92a6404071e4 | 10498 | SAME |

7/7 SAME. Bản cài: `lstat.isSymbolicLink=false`, `realpath=C:\Users\thang\.dsh\profiles\agent-teams-pack2\node_modules\@nami\dsh-agent-teams`, `package-lock.json` → `resolved=file:E:/Project/Agent-Team/.../tests/tm...`; npm exit 0.

## Bảy tiêu chí (7/7 PASS)
| id | nội dung | bằng chứng |
|---|---|---|
| C1 | 7/7 tệp SAME ở cả ba chiều | bảng trên |
| C2 | payload `lib/tools.js` = hash công bố = nguồn | 7fde7bbc49db (khớp tuyệt đối) |
| C3 | đủ 6 entry bắt buộc, 0 cấm | `package/lib/{tools,members,client,client.js.map,tool-names}.js` + `package/cordis.patch.yml`; node_modules=0, package/tests=0, tgz lồng=0, .pid=0 |
| C4 | cài từ tarball vào profile sạch | npm=0, không symlink, resolved `file:` |
| C5 | boot headless exit 0, gọi được `agent_teams_status` | phiên `session-7faaab9c-615e-4786-a9d0-7f2c09734989`, trả `Error: you do not lead or belong to any active team yet` |
| C6 | payload + bản cài khai báo đủ 2 tool mới | nạp THẬT `lib/tool-names.js` (không regex) từ cả hai bản: team=15, captain=11 mỗi bên, có `agent_teams_add_member` + `agent_teams_set_member_route` |
| C7 | boot gọi THẬT được cả 2 tool mới | 3 tool_call + 3 tool_result: `set_member_route`/`add_member` → `Error: you are not leading any team yet — call agent_teams_create first` (lỗi quyền, KHÔNG phải "không có tool") |

## Trung thực về lần 1 (run-2026-10-31T17-51-00Z): FAIL C6 do CHECKER, không do plugin

Lần 1 báo `payload team=0 captain=0` dù bản cài 15 tool. Hai lỗi của chính script: (a) `unpackPayload` ghi nguyên tiền tố npm `package/` nên đọc nhầm `payload/lib/...` (đúng phải là `payload/package/lib/...`); (b) đoán tên tool bằng regex trên text, nhưng `CAPTAIN_TOOL_NAMES` được SINH RA bằng `.filter()` chứ không phải danh sách literal, nên regex luôn ra rỗng. Đã sửa: bỏ tiền tố `package/` khi giải nén và `import()` mô-đun `tool-names.js` (data-only, không import gói ngoài) từ cả payload lẫn bản cài; đồng thời thêm C7 vì tên tool trong danh sách chưa chứng minh runtime đăng ký được. Tarball và mã plugin KHÔNG đổi giữa hai lần chạy (cùng sha256).

## Giới hạn đã biết

1. `peerDependencies` không được cài vào profile (`node_modules` chỉ có `@nami/dsh-agent-teams`) — boot chạy được vì runtime desktop cấp sẵn `@deepseek-ai/*`; cài ngoài runtime đó, hoặc bỏ `--legacy-peer-deps`, sẽ cần registry và hỏng khi offline.
2. C5/C7 chứng minh phía TOOL server nạp từ tarball; bundle UI `lib/client.js` trong profile này KHÔNG được mở trong GUI thật (chỉ kiểm bằng hash + t10/t22 trước đó).
3. C7 dựa vào việc runtime trả lỗi quyền thay vì lỗi "không có tool"; nếu harness đổi định dạng lỗi thì mẫu `not found|no such tool|...` phải cập nhật.
4. Không publish, không commit/push; profile desktop và `agent-teams-pack-test` giữ nguyên làm mốc cũ.
