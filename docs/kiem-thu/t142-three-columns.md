# t142 — panel ba khối: danh sách (trái) · dependencies (phải, 1:2) · header/summary trải hết

Card: `t142`, kind `implementation`, attempt `81d2d29b-7b51-4165-89e5-abb1d4d6f631`.
Sinh từ ảnh chụp panel thật + lời người dùng bác bố cục t139:

- m07538: *"cột bên phải hiển thị task dependencies, cột bên trái hiển thị list member, bên trên list member thì có nút add-member"*.
- (ảnh 1920x1080, panel ~490px) *"phải đưa task dependencies về vị trí bên phải màn hình giống như plugin của nami ấy… phải chia ra 3 phần list chiếm 1 cột dependencies chiếm 2 cột thì mới đủ diện tích"*.

## 1. Vì sao t139 sai (đọc mã)

`ActivityPanel.js:392` (t139) bọc cả hai nửa trong `div.panelColumns[data-panel-columns]` với
`grid-template-columns:minmax(0,1fr) minmax(0,1fr)` — chia ĐÔI — và div đó lại LỒNG trong
`section.team` đang là `display:flex; flex-direction:column`. Hệ quả kép: (a) dependencies không bao giờ
thành cột phải của cả khối, (b) mỗi nửa chỉ được nửa bề rộng còn lại ⇒ DAG 138 task chỉ còn ~210px.
`WorkspaceActivity.module.css` `.eDfHrq_content` còn thêm `max-width:1400px`.

## 2. Bản vá

`section.team[data-workspace-team]` giờ là GRID hai cột ở khổ rộng, và `DependencyMap` là CON TRỰC TIẾP của nó:

```jsx
] })] }), _jsx(DependencyMap, { tasks: team.tasks, members: team.members, t: t, discarded: discarded, workspace: workspace, onSelectTask: setSelectedTaskId }), workspace && _jsx(WorkspaceSummary, …
```

Tức chuỗi con của `section.team` = `header` → `section.delegationSection` (cột TRÁI: captain node,
`ProgressOverview`, rồi `div.panelColumnMain[data-panel-column="member"]` chứa `AddMemberControl` là
phần tử ĐẦU TIÊN, sau đó toggle `Members` + danh sách) → `section.dependencySection` (cột PHẢI) →
`div.workspaceSummary`. Hai class của t139 (`panelColumns`, `panelColumnAside`) đã bị xoá khỏi cả mã lẫn CSS.

CSS (nguyên văn dòng đã đặt tỉ lệ):

```css
@container (width>=800px){.aYQbCq_team[data-workspace-team]{grid-template-columns:minmax(280px,1fr) minmax(0,2fr);align-items:start;gap:16px;display:grid}
```

```css
.aYQbCq_team[data-workspace-team]>.aYQbCq_dependencySection{overscroll-behavior:contain;min-width:0;max-height:56vh;overflow-y:auto}
```

`.aYQbCq_team[data-workspace-team]>.aYQbCq_teamHead,…>[data-staging-editor],.aYQbCq_workspaceSummary{grid-column:1/-1}`
đã có sẵn từ bản 0.1.28 nên header + staging editor + workspace summary tự trải hết hai cột.
`WorkspaceActivity.module.css`: `.eDfHrq_content{max-width:1400px;…}` → `.eDfHrq_content{max-width:none;…}` (3 581 → 3 579 B, Δ −2 B).

## 3. Số đo (sha256 / bytes)

| tệp | sha256 | bytes |
| --- | --- | --- |
| `lib/client/ActivityPanel.js` | `2407c22ee26675e577c3a6567778f5b8af4e8b6b2a74d68b57dfed3ef273a850` | 64 097 |
| `lib/client/ActivityPanel.module.css` | `7ea5190c7d97855639fe040715176114e1c809b81302238bbf00a172acd6823b` | 52 045 |
| `lib/client/WorkspaceActivity.module.css` | `c7f2d5e5d295c40fc3e54392bdd0a49f73e311da2f9903a73f8c8a0b782af843` | 3 579 |
| `lib/client.js` | `7dca20dd1edf2c6688a9d32d56a2f03f0ce13feac3bc71a57c05bfbdc65b1165` | 258 790 |
| `lib/client.js.map` | `173b684f1a6a569c33f29e1c294ce2aad71944653f1af08c7bfa6aed5fdd16f2` | 405 349 |
| `tests/t10-ui-bundle-smoke.mjs` | `4bbb22522396c8bfa094db3bef3d104f738f2b7bc2745be8b724fec6e4cf44c9` | 20 441 |
| `tests/t59-erp-live-copy.mjs` | `8a94ea22bb85f94bb527d40020b6bb47362c4ad8a6f5af432f7bdb13e7138250` | 43 877 |
| `tests/t128-panel-order.mjs` | `aeeef5b99665dcd0cb89012444174bb7b9fb1ed404e5f2341975fa082b903dbf` | 36 843 |

`node build/build.mjs` (trong `packages/dsh-agent-teams`): `esbuild errors: 0` / `esbuild warnings: 0` /
`Wrote lib/client.js` / `Wrote lib/client.js.map`. Không sửa tay artefact nào.

## 4. A1..A6

| mục | bằng chứng (t128) |
| --- | --- |
| A1 grid 1:2 + `DependencyMap` là con trực tiếp | `C1` đọc đúng `@container (width>=800px)` và đòi `minmax(280px,1fr) minmax(0,2fr)` + `display:grid` + `gap:16px`; `P2` đòi `DependencyMap` đứng ngay sau chỗ đóng cột trái và ngay trước `WorkspaceSummary` trong cùng mảng con; `T1` kiểm trên cây `react-dom/server` THẬT: `section.team` có đúng 1 `[data-delegation-map]` và 1 `[data-dependency-map]` là CON TRỰC TIẾP, trái trước phải, `workspaceSummary` sau; trong khối member, `AddMemberControl` là element ĐẦU rồi mới tới `data-members-toggle` |
| A2 dưới 800px xếp dọc, dependencies tự cuộn | ngoài `@container (width>=800px)` thì `section.team` vẫn là `flex-direction:column` (rule gốc), thứ tự con giữ nguyên trái→phải; `C3` đòi `max-height:56vh` + `overflow-y:auto` trên `>.aYQbCq_dependencySection` |
| A3 bỏ chặn bề rộng | `C5` đọc `.eDfHrq_content` phải `max-width:none` và không còn `max-width:<số>px`; `C6` đặt lại `1400px` ⇒ đỏ |
| A4 build + VLQ | build errors 0; `S1` `node --check` panel + bundle, `JSON.parse` map; `M1` giải VLQ: `DependencyMap, { tasks` bundle 1940:45 → `ActivityPanel.js:437:47` (ĐÚNG dòng gọi mới), `.delegationSection` 1919:386 → `370:1462`, `"data-dependency-map": true` 1846:140 → `293:101` |
| A5 pin đồng bộ + đối chứng âm | `X1` pin t10 == đĩa; `X2` 13 dòng FROZEN == đĩa; `X3` `WorkspaceActivity.module.css` KHÔNG nằm trong FROZEN; đối chứng âm: `C2` (1:1 ⇒ đỏ), `C4` (bỏ max-height ⇒ đỏ), `C6` (1400px ⇒ đỏ), `P3` (bọc lại trong `panelColumnAside` ⇒ đỏ), `T2` (nhét dependencies vào lại khối member trong HTML đã render ⇒ đỏ), `M2` (sửa text nguồn map ghi lại ⇒ đỏ), `B2` (xoá call site trong bundle ⇒ đỏ) |
| A6 hồi quy | t128 22/22 · t10 50/50 · t129 13/13 · t114 16/16 · t113 38/38 · t98 `--strict` GREEN — tất cả EXIT 0, 0 boot |

## 5. Quyết định thay captain (phải đọc)

1. **Vượt trần 6 tệp ghi: đã ghi 9.** A4 buộc sinh `lib/client.js` + `.map` bằng build thật, A5 buộc cập nhật 3 tệp pin
   (t10, t59, t128) và card yêu cầu 1 tệp tài liệu; cộng 3 tệp mã (panel JS, panel CSS, workspace CSS) là 9. Không có
   tệp nào trong danh sách này bỏ được mà vẫn thoả A1..A6.
2. **`tests/t129-pins.mjs` KHÔNG cần sửa** dù A5 có nêu tên: nó đọc pin t10 + 13 dòng FROZEN + tự kiểm thứ tự panel
   trên bundle, và cả ba đều còn đúng sau bản vá ⇒ 13/13 xanh, 0 byte thay đổi.
3. **Tỉ lệ cột giữ đúng 1:2 như hợp đồng** (`minmax(280px,1fr) minmax(0,2fr)`), không tự chọn tỉ lệ khác.
4. **`max-height:56vh`** cho cột dependencies (t139 dùng 52vh trên wrapper): giữ nguyên tinh thần 'DAG không đẩy
   nội dung khác đi', đặt trên chính `section.dependencySection` vì wrapper cột đã bị bỏ.

## 6. Giới hạn còn lại (nói thẳng)

- Mọi phép kiểm bố cục chạy trên HTML do `react-dom/server` sinh ra + TEXT của CSS/bundle; KHÔNG có ảnh chụp trình duyệt,
  nên '1fr:2fr trông đủ rộng' được chứng minh bằng rule CSS + cây element, không bằng pixel.
- `@container (width>=800px)` là container query KHÔNG tên (giống bản 0.1.28): nó hỏi container gần nhất có `container-type`,
  không phải chính `section.team` (một phần tử không thể tự hỏi kích thước của nó). Nếu sau này có ai đặt thêm container
  giữa panel và `section.team`, ngưỡng 800px sẽ đo phần tử đó — đây là điểm cần nhớ khi sửa CSS cha.
- `.eDfHrq_content` là CSS của khung Activity (không phải của riêng panel); bỏ `max-width:1400px` ảnh hưởng mọi thẻ hoạt động
  trong cùng khung, không chỉ Agent Teams.
- Fixture render giữ `modelDirectory: undefined` (nếu truyền store thật, `StagedModelPicker` gọi `useSyncExternalStore`
  với 2 tham số và React 18 ném `Missing getServerSnapshot` — giới hạn harness, không phải lỗi panel).
