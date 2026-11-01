# t22 — Chạy build thật: dựng lại bundle client là KHA THI + TÁI LẬP

Người làm: dev-tools-flash · 2026-10-31 · task t22 (rework của t9). Không cài npm, không sửa `lib/client/*.js`,
chỉ ghi `lib/client.js` **qua** `build/build.mjs`, `build/client.js` (script tự ghi), `tests/tmp/t22/**`, `docs/kiem-thu/**`.

## Đính chính t9

t9 kết luận `KHONG KHA THI` là **SAI**. Nguyên nhân gốc: em chỉ kiểm
`app.asar/dsh/node_modules` (không tồn tại) và `npm root -g` (chỉ 3 gói), **chưa bao giờ chạy `ls node_modules`
trong `packages/dsh-agent-teams`**, rồi suy ra "không có bundler". Thực tế:

```
packages/dsh-agent-teams/node_modules  →  esbuild 0.28.2, tsdown 0.22.2, typescript, react 18.3.1,
                                          react-dom, lightningcss, @deepseek-ai/* (0.2.1-rc.2)
packages/dsh-agent-teams/build/        →  build.mjs, css-module-plugin.mjs, css-module-plugin.js, client.js, client.js.map
```

Suy luận sai kiểu "thiếu bằng chứng ⇒ kết luận phủ định" — đã sửa bằng thực nghiệm dưới đây.

## Bảng bước chạy

| Bước | Lệnh | Exit | sha256 / số đo | Ghi chú |
|---|---|---|---|---|
| 1. Sao lưu | `cp lib/client.js tests/tmp/t22/client.js.orig` | 0 | `2dc9436e…4bdd`, 177 333 B | bản đang chạy được; hash khớp bản gốc |
| 2. Build lần 1 | `cd packages/dsh-agent-teams && node build/build.mjs` | **0** | `2dc9436e…4bdd`, 177 333 B | stdout: `esbuild errors: 0` / `warnings: 0` / `Wrote lib/client.js` |
| 3. Cấu trúc gói | `node --check build/client.js` | **0** | — | `CHECK_RAW_OK` (payload chưa bọc là JS hợp lệ) |
| 4. Parity nội dung | `grep -o` trên bundle mới vs bản gốc | 0 | — | mọi literal khớp (xem dưới) |
| 5. Build lần 2 | `node build/build.mjs` | **0** | `2dc9436e…4bdd`, 177 333 B | **hash giống hệt lần 1 ⇒ deterministic** |
| 6. So size | `stat` | 0 | 177 333 vs 177 333 → **+0.00 %** | payload thô `build/client.js` 177 060 B + wrapper 273 B |

Chi tiết bước 3 (kiểm từng mẫu trên `lib/client.js` mới):

```
FIRST_LINE = window.__ModuleLoader__.load({                        → true
HAS id: "@nami/dsh-agent-teams"                                     → true
HAS factory: (require) => {                                         → true
HAS return module.exports;                                          → true
HAS //# sourceMappingURL=client.js.map                              → true
TAIL = …return module.exports;\n  }\n});\n//# sourceMappingURL=client.js.map
```

## Bước 4 — parity, kèm 2 điểm phải nói rõ (không im lặng)

| Literal | bundle mới | bản gốc | Kết luận |
|---|---|---|---|
| `@nanmicoder/dsh-agent-teams/activity` (TEAM_TAB_ID) | 1 | 1 | khớp — **nhưng giá trị thật là `@nanmicoder/…`**, không phải `@nami/…` như đề bài giả định |
| `@nami/dsh-agent-teams` (id trong wrapper) | 1 | 1 | khớp (lấy từ `pkg.name`) |
| `conversation.chat.node` | 2 | 2 | khớp |
| `agentTeamsCardDefinition` | 2 | 2 | khớp |
| `workspace.activity`, `teamChatEntry` | 0 | 0 | có mặt ở 0 chỗ trong **cả hai** bản ⇒ không phải mất do build |
| `exports.` (đếm chuỗi con) | 0 | 0 | **giải thích**: esbuild CJS dùng `__export(exports, { … })` + `__defProp`, không sinh `exports.x =` ⇒ đếm `exports.` = 0 ở cả hai bản, không phải sai lệch |

Bằng chứng mạnh nhất cho parity: `lib/client.js` sau build **byte-identical** với bản gốc (cùng sha256), nên mọi
khác biệt nội dung là 0 tuyệt đối — bản gốc trên đĩa chính là sản phẩm của đúng script này.

Khoá đăng ký còn đủ (mẫu chuỗi trong bundle): `"plan.failed"` 9, `"workspace.focus"` 7, `"workspace.title"` 5,
`"workspace.inbox"` 5, `"task.status.notRun"` 5, `"team.stop"` 4, `"team.stats.completed"` 4, `"task.status.claimed"` 4.

## KẾT LUẬN

**KHA THI + TAI LAP** — `node build/build.mjs` chạy exit 0 (esbuild errors: 0), sinh `lib/client.js` 177 333 B,
cấu trúc `window.__ModuleLoader__.load({ id, factory })` đúng chuẩn, payload `build/client.js` qua `node --check`,
và **hai lần build cho cùng một sha256** (`2dc9436e…4bdd`) — trùng luôn bản gốc đang chạy.

**Quy trình build lại sau mỗi lần sửa UI client (cho t10):**

```
# sửa lib/client/*.js (KHÔNG sửa lib/client.js — file đó do build sinh)
cd packages/dsh-agent-teams && node build/build.mjs     # ~15 ms
node --check build/client.js                            # payload hợp lệ
node -e "…sha256 lib/client.js…"                         # ghi hash mới vào log
```

## Rủi ro khi thay bundle

- **Không có typecheck trong đường build**: `build.mjs` chỉ bundle, không chạy `tsc`; lỗi kiểu/thiếu export chỉ lộ
  khi panel chạy thật ⇒ phải có bước kiểm literal/parity như trên sau mỗi lần sửa, và test UI thật (t10).
- **Không có ai khoá `lib/client.js`**: file sinh tự động nhưng đang được sửa tay/ghi đè dễ dàng; sửa trực tiếp
  `lib/client.js` sẽ bị lần build kế tiếp xoá sạch ⇒ quy ước: chỉ sửa `lib/client/*.js`.
- **Bundle là điểm mù kiểm thử**: harness hiện có (t3/t4) không nạp bundle client, nên build hỏng vẫn "xanh" các test
  khác; cần một smoke load `lib/client.js` (kiểm wrapper + `__ModuleLoader__.load` được gọi) trong CI.
