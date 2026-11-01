# t139 — bố cục hai cột của panel Agent Teams (cột member + nút add-member bên trái, task dependencies bên phải)

Card: `t139`, kind `implementation`, attempt `cea19a8c-3e60-49b4-b885-759405092f82`.
Sinh từ phản hồi trực tiếp của người dùng sau khi bố cục t128 lên app:

- (m07538) *"cột bên phải hiển thị task dependencies, cột bên trái hiển thị list member, bên trên list member thì có nút add-member"*.
- (m07553, kèm ảnh chụp app) *"nhìn xem bây giờ agent teams mất cả cột list member và nút add-member rồi"*.

## 1. Nguyên nhân (đọc mã, không đoán)

`packages/dsh-agent-teams/lib/client/ActivityPanel.js:392` (bản t128) là MỘT dãy phẳng trong `children` của section:

```
ProgressOverview, DependencyMap, AddMemberControl, (khối IIFE: toggle + delegationTree), workspace && WorkspaceSummary
```

Board thật có 138 task ⇒ `DependencyMap` cao vượt màn hình và đẩy `AddMemberControl` + list member xuống dưới đáy;
người dùng chỉ còn thấy tiêu đề 'Task dependencies'. CSS củng cố lỗi: `.aYQbCq_team` là flex column,
`.aYQbCq_dependencySection` là flex column, còn `.aYQbCq_dagViewport` CHỈ có `overflow-x:auto` — không giới hạn
chiều cao, nên DAG dài bao nhiêu thì section cao bấy nhiêu.

## 2. Bản vá

`ActivityPanel.js` (825 dòng, cùng số dòng): `ProgressOverview`, rồi `_jsxs("div", { className: css.panelColumns, "data-panel-columns": true, children: [ left, right ] })`, rồi `workspace && WorkspaceSummary`.

- cột TRÁI `css.panelColumnMain` / `data-panel-column="member"`: `AddMemberControl` là element ĐẦU, sau đó là toggle + `delegationTree` (list member).
- cột PHẢI `css.panelColumnAside` / `data-panel-column="dependency"`: `DependencyMap`.

`ActivityPanel.module.css` (nối vào CUỐI tệp, tệp vốn chỉ một dòng):

```css
.aYQbCq_panelColumns{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start;gap:12px;display:grid}
.aYQbCq_panelColumnMain{flex-direction:column;gap:9px;min-width:0;display:flex}
.aYQbCq_panelColumnAside{overscroll-behavior:contain;scrollbar-width:thin;flex-direction:column;gap:7px;min-width:0;max-height:52vh;display:flex;overflow-y:auto}
@container aYQbCq_agent-team (width<=560px){.aYQbCq_panelColumns{grid-template-columns:minmax(0,1fr)}}
```

Container query chứ không media query: `.aYQbCq_team` đã khai `container:aYQbCq_agent-team/inline-size`, nên bề rộng
được hỏi là bề rộng PANEL (panel hẹp trong sidebar vẫn xếp dọc dù cửa sổ rộng). `max-height:52vh` + `overflow-y:auto`
trên cột phải là chốt chặn tái phát: DAG 138 task cuộn trong cột của nó, không đẩy cột trái đi đâu được.

Bundle sinh bằng pipeline thật (`node build/build.mjs` trong `packages/dsh-agent-teams`), KHÔNG sửa tay:
`esbuild errors: 0 / esbuild warnings: 0 / Wrote lib/client.js / Wrote lib/client.js.map`.

## 3. Số đo (sha256 / bytes)

| tệp | sha256 | bytes |
| --- | --- | --- |
| `packages/dsh-agent-teams/lib/client/ActivityPanel.js` | `e4332052577375602786820c84a46dd3bbee8451a691270fb87f2c97841b30fb` | 64 279 |
| `packages/dsh-agent-teams/lib/client/ActivityPanel.module.css` | `9eee05f27d4b5240644dffc232c821710bb49c2af2716e43bea844223d357701` | 52 290 |
| `packages/dsh-agent-teams/lib/client.js` | `d91354cb105e54ae4a5488f68564f00d1062cf6fb4d640dd8dedc4fa3a795591` | 259 417 |
| `packages/dsh-agent-teams/lib/client.js.map` | `b1693659959056b0746627c1729c1835f2852148d517ff50a8ce9d35fda2df8d` | 406 099 |
| `tests/t10-ui-bundle-smoke.mjs` | `543d1fb24852e52e7896dd85f83f6b36a6552bc532fb0a992bcd8951848443d1` | 20 441 |
| `tests/t128-panel-order.mjs` | `5b59e285fd75306b8070d3b56b8928618fd29b3f800e101324a19df9f56824fd` | 36 650 |
| `tests/t129-pins.mjs` | `fafe5c99e5428cdc75a17487611ebd29253ae70d64fc147d77d28622b85fbed3` | 11 063 |
| `tests/t59-erp-live-copy.mjs` | `600c1d1cc8200f7048188c54c3af9fb6f6040266f38f1329a06ad7d49a262dc1` | 43 430 |

## 4. Kết quả A1..A6

| mục | bằng chứng |
| --- | --- |
| A1 hai cột đúng thứ tự | `t128` S0..S4 PASS trên cây react-dom/server THẬT: grid @2236, member column @2292, `data-add-member` @2357, `data-members-toggle` @2582, aside @5662, `data-dependency-map` @5795, `css-dagViewport` @6590, ProgressOverview @1672, WorkspaceSummary @8971 |
| A2 xếp dọc khi panel hẹp | `t128` C1 PASS: đọc đúng rule `@container aYQbCq_agent-team (width<=560px)` và đòi `grid-template-columns:minmax(0,1fr)`; không có media query nào trong 4 rule mới |
| A3 cột phải tự giới hạn chiều cao | `t128` C2 PASS: rule `.aYQbCq_panelColumnAside` có `max-height:52vh` + `overflow-y:auto`; C3 (đối chứng âm) xoá `max-height:52vh;` khỏi chính rule đó ⇒ đỏ, delta −16 B |
| A4 build lại + sourcemap | build EXIT 0; `node --check` cho panel + bundle; `JSON.parse` map OK (19 sources, mappings 114 689 ký tự, 3 212 dòng đã giải); `t128` M1 giải VLQ: `"data-add-member": team.teamId` bundle 1457:48 → `../lib/client/MemberControls.js:529:27`; `"data-dependency-map": true` bundle 1846:140 → `ActivityPanel.js:293:101`; `css.panelColumns` 1919:2637 → `ActivityPanel.js:392:198`; `css.panelColumnAside` 1940:82 → `437:63` |
| A5 pin t10 + FROZEN | `t10` X1/`t129` X2: pin `d91354cb…`/259 417 khớp đĩa và khớp dòng FROZEN `lib/client.js`; `t128` X2 kiểm cả `lib/client.js.map` và `lib/client/ActivityPanel.module.css` |
| A6 sáu suite | `t128` 24/24 · `t10` 50/50 · `t129-pins` 13/13 · `t114-source-freeze` 16/16 · `t113-roster-assertion` 38/38 · `t98-render-coverage --strict` GREEN — tất cả EXIT 0 |

## 5. Hai quyết định thay captain (phải đọc)

1. **Đổi DÒNG FROZEN thứ ba.** Hợp đồng chỉ cho đổi 2 dòng (`lib/client.js` + `lib/client.js.map`), nhưng A2/A3
   buộc phải sửa `ActivityPanel.module.css`, mà bảng FROZEN của `tests/t59-erp-live-copy.mjs` ghép mọi dòng với đĩa ⇒
   phải đổi luôn dòng `lib/client/ActivityPanel.module.css`. 10 dòng còn lại đo lại KHÔNG drift. Đây là ngoại lệ có chủ ý,
   đã ghi comment ngay trên bảng.
2. **Sửa `tests/t129-pins.mjs` (ngoài danh sách inScope).** A6 đòi `t129-pins` EXIT 0, nhưng t129 đang ghim đúng bố cục
   t128 bị người dùng bác (`DependencyMap < AddMemberControl < member list`). Giữ nguyên thì cổng đỏ vĩnh viễn vì một bố cục
   đã bị loại; nới kỳ vọng thì mất răng. Cách đã làm: đảo CHIỀU kỳ vọng sang bố cục mới và giữ nguyên đối chứng âm — nhưng đối
   chứng âm giờ dùng chính thứ tự t128 bị loại, nên nếu ai quay lại bố cục cũ thì đỏ. Cùng phép đảo đã làm trong `tests/t10`.

## 6. Giới hạn còn lại (nói thẳng)

- Phép kiểm bố cục chạy trên HTML do `react-dom/server` sinh ra và trên TEXT bundle; nó KHÔNG đo bề rộng thật trong trình duyệt,
  nên 'cột phải cuộn nội bộ' được chứng minh bằng sự tồn tại + răng của rule CSS (`max-height:52vh` + `overflow-y:auto`), không bằng ảnh chụp.
- Fixture render phải giữ `modelDirectory: undefined`: nếu truyền store thật, `StagedModelPicker` gọi `useSyncExternalStore`
  với 2 tham số và React 18 ném `Missing getServerSnapshot, which is required for server-rendered content`. Đó là giới hạn của harness, không phải lỗi panel.
- `t128` dùng stub cho `*.module.css` và `@deepseek-ai/dsh-client-ui-primitives` khi bundle để render, nên cây element đúng nhưng
  class là `css-<tên>`; thứ tự cột được khẳng định trên `data-panel-column`, không phụ thuộc tên class thật.
- Đối chứng âm M2 không dựa vào 'dịch 3 cột' (esbuild map đủ thô để phép dịch +3 vẫn trúng cùng segment — đo được `shift+3 red=0`),
  mà sửa CHÍNH nội dung nguồn mà map ghi lại (`css.panelColumns` → `css.panelColumnz`, cùng độ dài ⇒ mọi vị trí giải mã giữ nguyên) ⇒ đỏ đúng 1 probe.
