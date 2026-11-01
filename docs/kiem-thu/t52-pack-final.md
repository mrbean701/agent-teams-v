# t52 — Pack LẠI lần cuối tarball phát hành (drift guard)

Chạy: `node tests/t52-pack-final.mjs` (pack thật) · `node tests/t52-pack-final.mjs --analyze <runDir>` (chấm lại, không tốn quota).
Lần chạy: `packages/dsh-agent-teams/tests/tmp/t52/run-2026-10-31T19-06-58Z` — **12/12 PASS, EXITCODE=0**; `--analyze` cùng runDir: EXIT=0, cùng verdict.

## Kết quả

- **Tarball**: `tests/tmp/t52/nami-dsh-agent-teams-0.2.0-dev.0.tgz` · sha256 **5306f31bc1ad821befceb0d5cfb633156805852b12609e656e18404ba1c1bfb7** · **2 209 460 B** · **133 entry**.
- **2 lần npm pack độc lập**: cùng sha256 + cùng size + cùng 133 entry (và trùng luôn với lần chạy trước ở run-…-19-06-06Z ⇒ tất định).
- **Cổng t56**: `completed` trước khi pack và vẫn `completed` lúc pack xong (không có lần pack nào rơi vào lúc t56 đang ghi).
- **drift = 0** (10 tệp, đo trước pack và sau pack) · **drift sau boot = 0** · lib/**/*.js: 38 tệp đầu = 38 tệp cuối, 0 tệp đổi.

## Tar -tzf

`tar -tzf` (strip CRLF) đếm 133 tên = reader tự viết 133 entry; 6/6 entry bắt buộc (`package/lib/{tools,members,client,client.js.map,tool-names}.js` + `package/cordis.patch.yml`); `node_modules`=0, `package/tests`=0, `.tgz` lồng=0, `.pid`=0.

## 3 chiều 10/10 SAME (payload ↔ bản cài profile sạch ↔ nguồn)

| tệp | sha256 (12) | bytes |
|---|---|---|
| lib/tools.js | a01b1a1018cb | 194 888 |
| lib/members.js | 1562be4d527d | 99 402 |
| lib/state.js | 7b49f5ab1d46 | 56 282 |
| lib/snapshot.js | 92ecdd8759b6 | 11 687 |
| lib/index.js | 2d28e617f068 | 45 315 |
| lib/tool-names.js | e3def5db908d | 808 |
| lib/client.js | f86012517284 | 198 572 |
| lib/client.js.map | a0241ae86616 | 335 890 |
| lib/types/members.d.ts | b1ffe1544003 | 27 660 |
| package.json | 92a6404071e4 | 10 498 |

## Cài + boot

Profile sạch `C:/Users/thang/.dsh/profiles/agent-teams-pack4` (npm i --offline --legacy-peer-deps): exit 0, `isSymbolicLink=false`, realpath nằm trong profile, lock `file:`. Boot headless exit 0 trong 16 231 ms, session `session-534d437d-a63a-4993-9480-f8214779e8a5`, 4 tool_call + 4 tool_result thật:
`agent_teams_status` → "Error: you do not lead or belong to any active team yet"; `agent_teams_set_member_route`, `agent_teams_add_member`, `agent_teams_set_member_profile` → "Error: you are not leading any team yet — call agent_teams_create first" (lỗi QUYỀN ⇒ tool đã đăng ký).
**Export assert (V5-F3)**: 16/16 named export nạp được từ bản CÀI trên 5 module lõi (tools/members/state/snapshot/tool-names), gồm `setMemberProfile` và `recordAutoFallback`.
**`agent_teams_set_member_fallback`**: KHÔNG có tool riêng — **đúng thiết kế**: route dự phòng đặt qua `agent_teams_set_member_route` (tham số `fallback_provider`/`fallback_model`/`fallback_reasoning_effort`/`fallback_clear`, tools.js:1253-1256).

## Lần chạy 1 (trung thực)

`run-…-19-06-06Z`: 11/12, FAIL **C9** — lỗi của CHECKER tôi vừa viết (C9 đọc `meta.sourceAtStart/sourceAtEnd` mà main mới không còn ghi), không phải lỗi artefact: tarball hai lần chạy **cùng sha256 5306f31b…bfb7**. Đã nạp fingerprint lib/** vào C9 rồi chạy lại ⇒ 12/12.

## Giới hạn

1. peerDependencies KHÔNG được cài vào profile (chỉ có @nami/dsh-agent-teams) ⇒ boot chạy được nhờ runtime desktop cung cấp @deepseek-ai/*; cài ngoài runtime đó cần registry.
2. Bundle UI `lib/client.js` không được mở trong GUI ở profile này (chỉ chứng minh có mặt + hash khớp nguồn).
3. `npm pack` tất định trong môi trường này (mtime không đổi giữa 2 lần chạy) — không phải bảo đảm chung của npm.
4. Không publish/commit/push; không chạm profile desktop và agent-teams-pack-test/-pack2/-pack3.
