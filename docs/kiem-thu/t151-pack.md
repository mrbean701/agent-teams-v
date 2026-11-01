# t151 — pack vòng 25 (cột dependencies bằng cột member bằng CSS thuần: `contain:size`)

Suite: **packages/dsh-agent-teams/tests/t151-pack.mjs** (chép khuôn `t149-pack.mjs`; KHÔNG sửa t149/t143/t140).
Bốn chế độ: `--fresh [runDir]` · `--pack-once <dir>` · `--negative` · `--analyze <dir> [tgz]`.

## Vì sao có vòng 25
t148 đo chiều cao bằng JS (`ResizeObserver` + biến `--member-column-height`) và **hỏng trên app thật**; t150 bỏ hẳn cơ chế đó và thay bằng **đúng một rule CSS**: card dependencies là grid item có `contain:size` nên không đóng góp chiều cao cho hàng grid, `align-self:stretch` kéo nó cao đúng bằng hàng (hàng do cột TRÁI quyết định), `max-height:none` bỏ trần 56vh trong khối rộng, còn `overflow-y:auto` của rule gốc giữ DAG cuộn nội bộ. Không đo, không JS, không phụ thuộc thời điểm.

Ba dòng bảng 13 đổi (cũ → mới):

| tệp | vòng 24 | vòng 25 |
|---|---|---|
| `lib/client.js` | 44911f22… / 260 704 | **67d616a6… / 258 925** |
| `lib/client.js.map` | a6b7d7b7… / 408 920 | **718f4154… / 405 694** |
| `lib/client/ActivityPanel.module.css` | b6d8a2f5… / 52 216 | **21018682… / 52 180** |

Tệp thứ 14 của bảng ba chiều: `lib/client/ActivityPanel.js` 247d3e3b… → **60f44766… / 64 305** (toàn bộ wiring `ResizeObserver` đã bị xoá). `lib/client/WorkspaceActivity.module.css` **KHÔNG đổi** (`c7f2d5e5… / 3 579 B`) — in riêng ở dòng `extra (khong trong FROZEN)` làm bằng chứng. 10 dòng còn lại của bảng 13 nguyên byte.

## Artefact phát hành vòng 25
`packages/dsh-agent-teams/tests/tmp/t151/run-t151-a/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`

- sha256 **da2f297bd6a48c476815c24ffe0ab969a6995812faab5205ee8e6b2d43714ca8**
- bytes **2 248 536** · entries **133** · entry thư mục **0** · required 6/6 · rác 0 · đường dẫn tuyệt đối 0
- pack-b do **tiến trình con riêng** (`--pack-once`) sinh: cùng sha256 / bytes / 133 entry
- `--analyze` đọc lại tarball trên đĩa: `sha256Now=da2f297b…` `bytesNow=2248536` `entriesNow=133`

## Bảng FROZEN 13 dòng — ĐO MỚI lúc chạy
| tệp | sha256 (16) | bytes |
|---|---|---|
| lib/tools.js | e51734baf4693cd3 | 213 715 |
| lib/members.js | 50f558f8b207d874 | 102 260 |
| lib/state.js | 56664c59ff400319 | 57 508 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13 986 |
| lib/index.js | 2d28e617f0683e42 | 45 315 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |
| **lib/client.js** | **67d616a608c38ed3** | **258 925** |
| **lib/client.js.map** | **718f41544f36ae51** | **405 694** |
| lib/types/members.d.ts | c53250ab41bff8c3 | 31 769 |
| lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7 627 |
| lib/types/tools.d.ts | 41cfc56576ed8ffd | 7 546 |
| **lib/client/ActivityPanel.module.css** | **210186828966d0cf** | **52 180** |
| package.json | 92a6404071e457cc | 10 498 |

A19 đối chiếu `FROZEN_ROUND24` (nhúng trong suite, chỉ để chứng minh DÒNG NÀO đã đổi): đúng **3 dòng** đổi, 10 dòng nguyên.

## Ba chiều 14/14 SAME (profile MỚI `agent-teams-pack24`)
13 dòng đóng băng + `lib/client/ActivityPanel.js`; payload = bản cài = nguồn, **14/14 SAME**. `npm=0`, `isSymlink=false`, `isDirectory=true`, version `0.2.0-dev.0`, lock `file:E:/…/tests/tmp/t151/run-t151-a/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`. Quét TOÀN payload **133/133** entry khớp nguồn, 0 diff, 0 bỏ qua. 19/19 named export + SELF_MUTATION caught.

## A5 — bốn phép byte trong `lib/client.js` của BẢN ĐÃ CÀI
| phép | kết quả |
|---|---|
| (a) `contain:size` | **count=1, byte offset 79 312** — và nằm TRONG khối `@container (width>=800px)` (opener @ 79 061, không có `}` xen giữa ⇒ `clean=true`) |
| (a) `align-self:stretch` | count=2, byte offset 76 899 |
| (b) `max-height:56vh` (fallback hẹp) | **count=1, byte offset 79 175** — VẪN còn |
| (c) `--member-column-height` / `observeColumnHeight` / `memberColumnRef` | **0 / 0 / 0** (wiring JS cũ xoá sạch; nguồn `ActivityPanel.js` cũng 0/0/0) |
| (d) `data-panel-columns` / `panelColumns` / `panelColumnAside` | **0 / 0 / 0** (bố cục ba khối không quay lại) |
| (d) `DependencyMap, {` | count=1, **byte offset 182 512**, siblingClose=true, wrapped=false, sourceSibling=true |
| (giữ) grid 1:2 `minmax(280px,1fr) minmax(0,2fr)` | count=1, byte offset 76 534 |

Trích ~120 ký tự quanh `contain:size` (nguyên văn từ bundle đã cài) để thấy nó ở đúng khối rộng:

```
…orkspace-team]>.aYQbCq_dependencySection{align-self:stretch;contain:size;max-height:none}}`;
if (typeof document !== "undefined") { const style = document.createElement("style"); …
```

## Boot thật trên bản ĐÃ CÀI (1 lần)
`exit=0` · `session-581487de-30a7-4886-a984-ba8af3721cb4` · 6 tool call. Nguyên văn:

```
Members (1 present + 1 removed):
  - alice [researcher] idle/unspawned · opencode-go/kimi-k2.7-code
Removed (1):
  - bob [qa] opencode-go/deepseek-v4.1-flash · reasoning max · joined 2026-11-01T09:20:02.410Z
Tasks (1):
  - t1 [pending] work findings 1 attempt 0 probe task → captain
Team id: t151probe · phase: staged
```

## Đối chứng âm `--negative` (EXIT 0 = mọi nhánh đều bắt)
- bảng sạch 13/13 ⇒ tiến trình con exit 0; bảng đột biến ⇒ exit 1
- lật bytes trong bảng (trong bộ nhớ) ⇒ `applies=false delta=-1`; lật 1 byte **bản sao payload** ⇒ `applies=true delta=+1`; đổi sha ⇒ `shaApplies=false`
- lật 1 byte trên **BẢN COPY .tgz** (offset 5, trong MTIME): `--analyze` trên bản copy **EXIT 1** tại A4 (`sha256Now=a066f45e…`), bản gốc **EXIT 0**; tổng bytes lệch 0 nhưng sha đổi

## Drift và lan can (cùng lần chạy)
- drift 13 tệp: **sau pack = 0/13**, **sau cài + boot = 0/13**
- `tests/t98-render-coverage.mjs --strict` EXIT 0 GREEN (reached=105, uncovered=0)
- `tests/t10-ui-bundle-smoke.mjs` EXIT 0 · `tests/t128-panel-order.mjs` EXIT 0 · `tests/t129-pins.mjs` EXIT 0
- `node tools/sweep-suites.mjs --list` EXIT 0: `totals: 81 suite(s) = 10 LIVE + 11 pack + 47 fast; legacy exceptions: 16`; `t151-pack.mjs` thuộc nhóm PACK (mặc định không chạy vì nó pack + boot)

## Suite pack cũ SẼ ĐỎ vì ghim hash nguồn (đúng thiết kế, không sửa)
16 mục LEGACY, thêm `packages/dsh-agent-teams/tests/t149-pack.mjs:405` ghim `lib/client.js.map a6b7d7b7ec4c4528` (bảng vòng 24). Muốn audit artefact vòng 25 thì dùng chính `t151-pack.mjs`.

## Giới hạn (trung thực)
- 2 pack (2 tiến trình), 1 boot, 4 suite khác, 1 lần thử.
- Bảng FROZEN sinh bằng ĐO tại HEAD ngay trước khi chạy; ba dòng đổi in kèm giá trị cũ → mới.
- `lib/client/WorkspaceActivity.module.css` ngoài bảng 13 và ngoài 14 dòng ba chiều theo contract; in riêng (sha c7f2d5e5…, không đổi) và phủ bởi phép quét payload.
- Kiểm byte chứng minh CƠ CHẾ (`contain:size` trong khối rộng + fallback 56vh + không còn wiring JS) nằm trong bản phát hành; nó không chứng minh bằng nhau về pixel — phép đo pixel thuộc t150 (Chromium host).
- `t128-panel-order.mjs` (đã đổi ở t150, 52 473 B) không nằm trong bảng 13 cũng không nằm trong 14 dòng ba chiều; nó được chạy như lan can (EXIT 0) chứ không được so byte.