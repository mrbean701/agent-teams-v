# t9 — Spike: có dựng lại được bundle client `lib/client.js`?

Người làm: dev-tools-flash · 2026-10-31 · chỉ đọc + ghi `docs/kiem-thu/**` · không cài npm, không sửa `lib/**` · 4 lệnh node/ls.

## (a) `lib/client.js.map` — bao nhiêu module có `sourcesContent`?

```
MAP sources=18 sourcesContent=18 nulls=0
```

18/18 có nội dung: **15 module JS** + **3 module CSS ảo** (`css-module:...module.css`).
15 JS: index, WorkspaceActivity, ActivityPanel, icons, session-navigation, activity-model, activity-monitor,
artwork, AgentTeamsCard, StagingPlanEditor, panel-geometry, workspace-state, TeamChatEntry,
agent-teams-card-definition, locales.

**Phát hiện quyết định — không phải "dựng lại" gì từ sourcemap**, so từng byte với đĩa:

```
sourcesContent byte-identical to disk: 15/18
diffs: 3 × css-module (map 3674/4801/4059 vs .css 3073/3946/3581)
```

15/15 module JS trong map **giống hệt** `lib/client/*.js` đang có. Chỉ 3 entry CSS khác, vì map lưu module ảo
css-module (CSS + bảng hash tên class), không phải `.css` thô. Nguyên liệu nguồn còn nguyên; cái thiếu là bundler.

## (b) External cần thiết — đúng 3

```
HEAD specifiers=["react/jsx-runtime","react","@deepseek-ai/dsh-client-ui-primitives"]
```

Các module nội bộ import đuôi `.js` tường minh (`from "./WorkspaceActivity.js"`) ⇒ đã là ESM đã biên dịch,
không còn JSX thô (7 file gọi `_jsx(...)`, 0 file `React.createElement`) ⇒ không cần TS/JSX transform.
Đầu ra gốc là **CJS bọc cho module loader DSH**:
`window.__ModuleLoader__.load({ id: "@nami/dsh-agent-teams", factory: (require) => { var module = {exports:{}}; ...

## (c) Bundler cục bộ — KHÔNG CÓ

```
DIR MISSING: ...\DeepSeek Harness\resources\app.asar\dsh\node_modules
esbuild=none  rollup=none  tsup=none  vite=none
npm root -g -> @deepseek-ai, open-computer-use, pnpm   (không có bundler)
package.json devDeps: esbuild ^0.28.2, tsdown 0.22.2, lightningcss ^1.33.0, typescript ^5.9.3  — CHƯA cài
```

`node_modules` của app.asar không tồn tại; `packages/dsh-agent-teams` không có `node_modules`; và nguồn build
cũng đã biến mất: `src/client` → không tồn tại, `tsconfig.client.json`/`tsdown.config.*` → không tồn tại.
⇒ `pnpm build` (`tsc -p tsconfig.client.json && tsdown`) không chạy được **ngay cả khi** có bundler: thiếu input TS.

## (d) KẾT LUẬN

**KHONG KHA THI** — không có esbuild/rollup/tsup/vite nào chạy được (app.asar không có node_modules, global không có,
plugin chưa cài devDeps), đồng thời nguồn build TS (`src/client/**`, `tsconfig.client.json`, `tsdown.config.*`)
không còn trong checkout; chỉ còn `lib/client/*.js` đã biên dịch + `lib/client.js` đã bundle.
Điều kiện lật ngược (nếu captain đổi ràng buộc): cài **một** devDep cục bộ `esbuild` trong `packages/dsh-agent-teams`
(không vào profile) ⇒ 15 JS + 3 CSS là đủ, chỉ cần ~25 dòng script: format `cjs`, banner
`window.__ModuleLoader__.load({...factory:(require)=>...})`, 3 external ở (b), css-module plugin tái tạo đúng hash tên class.

## (e) Phương án UI không cần build lại bundle

- **Trang điều khiển do plugin tự phục vụ**: thêm route HTML/JS trong `lib/web-routes.js` (hạ tầng route đã có)
  trả trang thuần `fetch + JSON` gọi endpoint sẵn có — không phụ thuộc bundle, không cần react.
- **Module client thứ hai nạp qua `window.__ModuleLoader__`**: factory hiện tại là `(require) => {...}`, nên
  `lib/client-extra.js` cùng định dạng đăng ký thêm tab/panel mà không phải chạm `lib/client.js`.
- **Đổi hành vi, giữ UI**: tính năng mới (đổi route, thêm member) đã có công cụ + action HTTP; panel hiện tại vẫn
  hiển thị đúng vì đọc projection từ server ⇒ hoàn thiện đường HTTP trước, coi UI là việc sau.

## Lệnh đã chạy (tái lập)

1. `node -e` đếm `sourcesContent` + quét specifier 200 dòng đầu `lib/client.js` + `ls app.asar/.../node_modules | grep -Ei 'esbuild|rollup|tsup|vite|webpack|babel|swc'`
2. `ls -d app.asar/dsh/node_modules`; `command -v esbuild rollup tsup vite npx npm node`; `node -e require('./package.json')`
3. `ls -d src/client`; `ls tsconfig.client.json tsdown.config.*`; `ls -la lib/client.js lib/client.js.map lib/client`; `npm root -g`
4. `node -e` so byte map↔đĩa (15/18 identical) + đếm `_jsx(`/`createElement(` + 8 dòng đầu `lib/client/index.js`
