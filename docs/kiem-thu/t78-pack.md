# t78 — Pack tarball vòng 10 (sau t77 `captainRoute`)

Đóng gói lại artefact phát hành vì t77 thêm `TeamCaptainRoute` + `captainRoute?` vào `lib/types/snapshot.d.ts`, nên tarball t75 `818dff22…a304` không còn khớp nguồn. Danh sách ba chiều nay là **12 tệp** (thêm `lib/types/snapshot.d.ts`).

## Cách chạy

```
node tests/t78-pack.mjs                  # cổng t76 -> pack x2 -> cài profile sạch -> boot
node tests/t78-pack.mjs --analyze <dir>  # chấm lại artefact đã có, không tốn quota
```

## Kết quả (exit code đọc trực tiếp, không suy diễn)

| lần | lệnh | exit | ghi chú |
|---|---|---|---|
| 1 | `node tests/t78-pack.mjs` (qua pipe) | 0 theo `16/16 checks passed, 0 failed` | exit của pipeline bị `tail` che ⇒ chấm lại bằng `--analyze` |
| 2 | `node tests/t78-pack.mjs > log; echo EXIT=$?` | **EXIT=0** | chạy đầy đủ lần hai, cùng sha256 |
| 3 | `node tests/t78-pack.mjs --analyze …/run-2026-10-31T20-54-44Z` | **EXIT=0** | 16/16, chấm lại miễn quota |

## Tarball

- `packages/dsh-agent-teams/tests/tmp/t78/nami-dsh-agent-teams-0.2.0-dev.0.tgz`
- sha256 `cb234b085f5c304938ddfbd8f66affd2c614b9f48d78da2e1c22bf893a7d6e50` · **2 241 383 B** · **133 entry**
- **4 lần npm pack độc lập** (2 lần × 2 lượt chạy) → CÙNG sha256, cùng bytes, cùng số entry.
- `tar -tzf` (strip CRLF): 6/6 entry bắt buộc, **0** `node_modules`, **0** `package/tests`, **0** `.tgz` lồng, **0** `.pid`.

## Ba chiều 12/12 SAME (payload ↔ bản cài ↔ nguồn)

`tools.js a01b1a1018cb/194 888` · `members.js 1562be4d527d/99 402` · `state.js 7b49f5ab1d46/56 282` · `snapshot.js a2a87e1b0c0b/13 986` · `index.js 2d28e617f068/45 315` · `tool-names.js e3def5db908d/808` · `client.js 9da18d9971a284/258 432` · `client.js.map bbf88608f54e/404 958` · `types/members.d.ts b1ffe1544003/27 660` · `types/snapshot.d.ts 962f99a7bcb1/7 627` · `client/ActivityPanel.module.css 53ea47c6d780/51 837` · `package.json 92a6404071e4/10 498`.

Drift **0** ở cả ba mốc (trước pack / sau pack / sau boot) cho 12 tệp, và **38 tệp `lib/**/*.js`** đứng yên suốt lượt (C9). Cổng `t76` = completed lúc bắt đầu và lúc kết thúc pack.

## Cài + boot

- Profile sạch **`agent-teams-pack9`**: `npm i --offline --no-audit --no-fund --legacy-peer-deps` → 0; `lstat.isSymbolicLink=false`; `realpath` nằm trong profile; lock `file:…`; **version `0.2.0-dev.0`**.
- Probe `import()` bản **đã cài**: **16/16** named export (thêm t56/t74: `setMemberProfile`, `recordAutoFallback`, `memberModelRoute`).
- Bundle bản cài: `data-member-route-control` ✓, `data-add-member` ✓, 8/8 dấu vết t67+t71+t74 ✓, **719 token `aYQbCq_` / 150 tên / 141 lớp** (bằng nguồn) ✓, `planSave` ✓.
- Boot headless **exit 0**, `session-2c55ad43-…` (lượt 1) và `session-1267671e-…` (lượt 2): gọi thật `agent_teams_status` / `set_member_route` / `add_member` / `set_member_profile`, tất cả có `tool_result` (lỗi QUYỀN, không phải lỗi thiếu tool).
- **C16 mới**: bản cài ship `lib/types/snapshot.d.ts` với `interface TeamCaptainRoute` + `readonly captainRoute?:` — payload == bản cài (7 621 B). Đây là thứ duy nhất mang khai báo kiểu tới người dùng, vì esbuild strip `.d.ts` khỏi bundle.

## Giới hạn

- `peerDependencies` không được cài vào profile ⇒ chứng minh đăng ký tool là qua boot headless + `lib/tool-names.js`, không phải cold-import cả plugin bên ngoài desktop runtime.
- Bundle UI không được mở trong GUI ở profile này; phần CSS/`data-*` chỉ kiểm bằng đếm chuỗi trong bytes đã cài.
- Chưa publish/commit; `agent-teams-pack9` là profile nháp, đã xoá và tạo lại trong lượt chạy.