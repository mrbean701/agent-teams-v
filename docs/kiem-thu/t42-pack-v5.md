# t42 — Pack lại tarball phát hành sau t37/t38/t39 (kiểm 3 chiều + boot profile sạch)

## Cách chạy

```
node tests/t42-pack-v5.mjs                                    # chạy thật (pack 2 lần + cài + boot)
node tests/t42-pack-v5.mjs --analyze tests/tmp/t42/run-<stamp> # chấm lại meta.json, KHÔNG tốn quota
```

Script `tests/t42-pack-v5.mjs` (593 dòng, tự định vị bằng `import.meta.url`). Run được chấm:
`packages/dsh-agent-teams/tests/tmp/t42/run-2026-10-31T18-39-07Z` → `9/9 checks passed, 0 failed`, EXITCODE=0.
`--analyze` trên cùng run dir → exit 0, cùng verdict.

## Artefact phát hành

`packages/dsh-agent-teams/tests/tmp/t42/nami-dsh-agent-teams-0.2.0-dev.0.tgz`
sha256 `1fe4fc5f3f1b0dffa2418bc5230f1afc8ea4f6960e0ab4be4b528ce5379daa2f`, 2 206 957 B, 133 entry.
Hai lần `npm pack` độc lập (tests/tmp/t42 và tests/tmp/t42/repack) → **cùng sha256, cùng size, cùng 133 entry**.

## Kiểm 3 chiều (payload tarball ↔ bản cài ↔ nguồn)

| tệp | sha256 (12 ký tự đầu) | bytes |
| --- | --- | --- |
| lib/tools.js | 651ce617003b | 193189 |
| lib/members.js | 8e4f7b39f20b | 96140 |
| lib/state.js | 7b49f5ab1d46 | 56282 |
| lib/snapshot.js | 92ecdd8759b6 | 11687 |
| lib/client.js | f86012517284 | 198572 |
| lib/client.js.map | a0241ae86616 | 335890 |
| package.json | 92a6404071e4 | 10498 |

7/7 SAME ở cả ba cột.

## 9 tiêu chí (đều PASS)

C1 hai lần pack cùng sha256 · C2 3 chiều 7/7 SAME · C3 6/6 entry bắt buộc (`package/lib/{tools,members,client,client.js.map,tool-names}.js` + `package/cordis.patch.yml`), 0 node_modules / 0 package/tests / 0 .tgz lồng / 0 .pid · C4 `npm i --offline --legacy-peer-deps` vào profile sạch `C:/Users/thang/.dsh/profiles/agent-teams-pack3`, không symlink, lock `file:` · C5 boot headless exit 0 (`session-aeb70089-5332-40cd-9968-3907f36bade3`, 11 013 ms), `agent_teams_status` trả `Error: you do not lead or belong to any active team yet` · C6 payload + bản cài nạp thật `lib/tool-names.js`: team=15, captain=11, đủ `add_member` + `set_member_route` · C7 boot gọi THẬT cả 2 tool mới, mỗi tool trả `Error: you are not leading any team yet — call agent_teams_create first` (lỗi QUYỀN ⇒ tool có mặt và dispatch được) · C8 5/5 module lõi của bản cài `import()` không SyntaxError · C9 drift guard: 38 tệp lib/** lúc đầu = 38 tệp lúc cuối, 0 tệp đổi.

## Trung thực về lần chạy 1 (18:30:58Z) — FAIL 5/7

Tarball `186b958a…86f12` (2 200 791 B) được pack trong lúc thành viên khác ĐANG ghi `lib/**`: plugin không import được, stderr `agent-teams (@nami/dsh-agent-teams): failed to import: SyntaxError: Unexpected identifier 'team'`, boot 0 tool_call, model trả `NEWTOOLS set_member_route=no add_member=no`. "3 chiều SAME" khi đó vô nghĩa vì ba bản chép cùng một cây đang động. Bằng chứng giữ nguyên ở `packages/dsh-agent-teams/tests/tmp/t42/broken-run-2026-10-31T18-31Z/` (2 tgz + 3 tệp cài).
Vì lần 1, script được hardening: probe parse 5 module lõi TRƯỚC khi pack (cây không parse được ⇒ `meta.aborted`, không pack) và C9 so fingerprint lib/** đầu/cuối. Lượt đạt chỉ chạy sau khi đo tĩnh 80 s liên tiếp (0 tệp đổi).

## Giới hạn

- `node --check` PASS cả 41 tệp .js của bản cài HỎNG ở lần 1 ⇒ không dùng `--check` để kết luận artefact lành; phải `import()` (C8).
- peerDependencies không được cài vào profile; boot chạy nhờ runtime desktop cấp `@deepseek-ai/*`.
- Bundle UI `lib/client.js` không mở trong GUI ở profile `agent-teams-pack3` (chỉ chứng minh tầng tool server nạp từ tarball).
- Không publish/commit; profile `desktop` và `agent-teams-pack2` không bị chạm.
- C1 chỉ đúng trên cây nguồn TĨNH; nếu `lib/**` bị ghi đồng thời, C9 FAIL thay vì âm thầm phát hành byte hỏng.
