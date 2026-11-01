# t75 — Pack tarball vòng 9 (sau t74 captainRoute)

Mục tiêu: sinh lại artefact phát hành sau khi t74 đổi `lib/snapshot.js` + `lib/client/**` và chứng minh ba chiều khớp tuyệt đối.

```
cd packages/dsh-agent-teams && node tests/t75-pack.mjs
node tests/t75-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t75   # chấm lại, không tốn quota
```

## Artefact

| mục | giá trị |
|---|---|
| tarball | `packages/dsh-agent-teams/tests/tmp/t75/nami-dsh-agent-teams-0.2.0-dev.0.tgz` |
| sha256 / byte / entry | `818dff227c50976aa0240fd6f202b73f0700c42104a9f5af62c8033b6a43a304` / 2 241 026 / 133 |
| 2 lần pack (lần 1 + repack) | cùng sha256, cùng size, cùng số entry |
| run dir | `tests/tmp/t75/run-2026-10-31T20-44-54Z` |
| profile cài | `C:/Users/thang/.dsh/profiles/agent-teams-pack8` — không symlink, lock `file:…t75/…tgz` |

## 15 check PASS (EXIT=0)

| # | tiêu chí | bằng chứng |
|---|---|---|
| C1 | 2 lần pack tất định | 818dff22…/2 241 026/133 cả hai |
| C2 | 3 chiều 11/11 SAME | payload = bản cài = nguồn, mismatches 0 |
| C3 | tar -tzf strip CRLF | 133 tên tar = 133 entry tự đọc; 6/6 entry bắt buộc; node_modules/tests/.tgz/.pid = 0 |
| C4 | cài profile sạch | `npm i --offline --legacy-peer-deps` exit 0 "added 1 package in 2s", isSymbolicLink=false, lock `file:` |
| C5 | boot headless | exit 0, 18 705 ms, `session-a21dc037-62cc-44bd-9d5d-680aa923cf7b` |
| C6 | tool-names payload = bản cài | TEAM 15 / CAPTAIN 11 / MEMBER 4, có set_member_route, add_member, set_member_profile |
| C7 | boot gọi THẬT 4 tool | 4 tool_call + 4 tool_result (status, set_member_route, add_member, set_member_profile) — lỗi QUYỀN, không phải "no such tool" |
| C8 | 5 module lõi import() thật | không SyntaxError |
| C9 | `lib/**/*.js` đứng yên trong lượt | 38 tệp, drift 0 |
| C10 | export assert trên bản cài | 16/16 named export |
| C11 | drift=0 + gate t74 completed | trước pack, sau pack, sau boot đều 0 (11 tệp) — dùng cho cả C9 |
| C13–C15 | bundle đã cài: CSS + 8 dấu vết | 719 token `aYQbCq_`, 150 tên, 141 lớp, `planSave`, `data-add-member-route-*`, `pickDefaultRoute`, `data-error-detail`, `captainRoute`, `data-add-member-captain-route-warning` |

Ba chiều 11/11: `tools a01b1a1018cb/194888 · members 1562be4d527d/99402 · state 7b49f5ab1d46/56282 · snapshot a2a87e1b0c0b/13986 · index 2d28e617f068/45315 · tool-names e3def5db908d/808 · client.js 9da18d9971a2/258432 · client.js.map bbf88608f54e/404958 · members.d.ts b1ffe1544003/27660 · ActivityPanel.module.css 53ea47c6d780/51837 · package.json 92a6404071e4/10498`

## Verify hợp đồng

`node tests/t10-ui-bundle-smoke.mjs` → 0 (47/47) · `node tests/t70-addmember-default-route.mjs` → 0 (16/16) · `node tests/t74-captain-route-warning.mjs` → 0 (23/23).

## Trung thực về một lần đỏ

Lần chạy t74 ĐẦU TIÊN sau pack trả 21/23 (FAIL (f1) "the snapshot reads the SAME two places", (f4) "captain declaring nothing in the header falls back to its options"). Điều tra: 8 lần chạy lại liên tiếp đều 23/23 EXIT=0; không tệp `lib/**` nào đổi sau 20:45:25Z (pack đóng 20:45:02Z, snapshot.js mtime 20:45:25.978Z); phép so quyết định — 11 tệp sống vs `meta.threeWay` → `POST_PACK_MISMATCHES=0`, tarball chứa đúng byte hiện hành (snapshot.js a2a87e1b/13986 ở cả ba nơi). Kết luận: cửa sổ đó có writer đồng thời (mutation/restore kiểu audit) chạm `lib/snapshot.js`; suite t74 đọc nguồn sống không retry nên đỏ. Không phải lỗi artefact, không cần repack.

## Giới hạn đã biết

- peerDependencies không được cài vào profile; boot chạy được nhờ runtime desktop cấp `@deepseek-ai/*`. Boot chứng minh tool server nạp từ tarball; bundle UI chỉ kiểm bằng chuỗi/SSR, không mở GUI trong profile pack8.
- Không publish, không commit/push; không chạm profile desktop, pack6, pack7.
