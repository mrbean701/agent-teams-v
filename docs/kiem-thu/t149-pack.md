# t149 — pack vòng 24 (cột dependencies cao BẰNG cột member, biến `--member-column-height`)

Suite: **packages/dsh-agent-teams/tests/t149-pack.mjs** (chép khuôn `t143-pack.mjs`; KHÔNG sửa t143/t140).
Bốn chế độ: `--fresh [runDir]` · `--pack-once <dir>` · `--negative` · `--analyze <dir> [tgz]`.

## Vì sao có vòng 24
t148 làm cột **Task dependencies** cao bằng cột member và co giãn theo form Add member bằng biến CSS `--member-column-height` (giá trị do `ResizeObserver` đo trên cột trái). Đây là vòng ĐẦU TIÊN bản phát hành có cơ chế ĐO CHIỀU CAO ở client, nên phép kiểm byte phải chứng minh cơ chế đó thật sự nằm trong bản cài, không chỉ trong nguồn.
Ba dòng bảng 13 đổi (giá trị cũ → mới):

| tệp | vòng 23 | vòng 24 |
|---|---|---|
| `lib/client.js` | 7dca20dd… / 258 790 | **44911f22… / 260 704** |
| `lib/client.js.map` | 173b684f… / 405 349 | **a6b7d7b7… / 408 920** |
| `lib/client/ActivityPanel.module.css` | 7ea5190c… / 52 045 | **b6d8a2f5… / 52 216** |

Tệp thứ 14 của bảng ba chiều: `lib/client/ActivityPanel.js` 2407c22e… → **247d3e3b… / 66 382**. `lib/client/WorkspaceActivity.module.css` **KHÔNG đổi** vòng này (`c7f2d5e5… / 3 579 B`) — in ra ở dòng `extra (khong trong FROZEN)` để chứng minh. 10 dòng còn lại của bảng 13 nguyên byte.

## Artefact phát hành vòng 24
`packages/dsh-agent-teams/tests/tmp/t149/run-t149-a/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`

- sha256 **f6a967544e0e65f3939fe6889e67f468f530e0597364ad38f3d37195930702c5**
- bytes **2 250 084** · entries **133** · entry thư mục **0** · required 6/6 · rác 0 · đường dẫn tuyệt đối 0
- pack-b do **tiến trình con riêng** (`--pack-once`) sinh: cùng sha256 / bytes / 133 entry
- `--analyze` đọc lại tarball trên đĩa: `sha256Now=f6a96754…` `bytesNow=2250084` `entriesNow=133`

## Bảng FROZEN 13 dòng — ĐO MỚI lúc chạy
| tệp | sha256 (16) | bytes |
|---|---|---|
| lib/tools.js | e51734baf4693cd3 | 213 715 |
| lib/members.js | 50f558f8b207d874 | 102 260 |
| lib/state.js | 56664c59ff400319 | 57 508 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13 986 |
| lib/index.js | 2d28e617f0683e42 | 45 315 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |
| **lib/client.js** | **44911f22c6431523** | **260 704** |
| **lib/client.js.map** | **a6b7d7b7ec4c4528** | **408 920** |
| lib/types/members.d.ts | c53250ab41bff8c3 | 31 769 |
| lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7 627 |
| lib/types/tools.d.ts | 41cfc56576ed8ffd | 7 546 |
| **lib/client/ActivityPanel.module.css** | **b6d8a2f53b80afb6** | **52 216** |
| package.json | 92a6404071e457cc | 10 498 |

A19 đối chiếu với bảng vòng 23 (`FROZEN_ROUND23` nhúng trong suite, chỉ để chứng minh DÒNG NÀO đã đổi): đúng **3 dòng** đổi, 10 dòng nguyên. Một dòng thứ tư xê dịch là điều kiện DỪNG.

## Ba chiều 14/14 SAME (profile MỚI `agent-teams-pack23`)
13 dòng đóng băng + `lib/client/ActivityPanel.js`; payload = bản cài = nguồn, **14/14 SAME**. `npm=0`, `isSymlink=false`, `isDirectory=true`, version `0.2.0-dev.0`, lock `file:E:/…/tests/tmp/t149/run-t149-a/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`. Quét TOÀN payload: **133/133** entry khớp nguồn, 0 diff, 0 bỏ qua. 19/19 named export + SELF_MUTATION caught.

## A5 — bốn phép byte trong `lib/client.js` của BẢN ĐÃ CÀI
| phép | kết quả |
|---|---|
| (a) `--member-column-height` | **count=3, byte offset 79 304** |
| (a) `height:var(--member-column-height,auto)` | count=1, byte offset 79 293 |
| (b) `max-height:var(--member-column-height,56vh)` | count=1, byte offset 79 333 |
| (c) `data-panel-columns` / `panelColumns` / `panelColumnAside` | **0 / 0 / 0** (bố cục ba khối không quay lại) |
| (d) `DependencyMap, {` | count=1, **byte offset 184 216**, siblingClose=true, wrapped=false, sourceSibling=true |
| (giữ) grid 1:2 `minmax(280px,1fr) minmax(0,2fr)` | count=1, byte offset 76 534 |
| (giữ) `[data-workspace-team]` | count=1, byte offset 173 938 |

Đoạn trích cấu trúc quanh call site (nguyên văn, ~200 ký tự trước; chú ý `columnHeight:` đã có trong props):

```
}) })] })] }, member.id || member.name);
    })] })] });
  })()] })] }), (0, import_jsx_runtime5.jsx)(DependencyMap, { tasks: team.tasks, members: team.members, t, discarded, workspace, onSelectTask: setSelectedTaskId, columnHeight: memberCol…
```

(d) vẫn đúng nghĩa "sibling": call site đứng NGAY SAU `}), ` (đóng element trước), giữa hai thứ chỉ có wrapper `(0, import_jsx_runtimeN.jsx)(` (`siblingClose=true`), KHÔNG có `children: [` chen vào (`wrapped=false`), và nguồn `ActivityPanel.js` có cùng một dòng `] })] }), _jsx(DependencyMap, {` (`sourceSibling=true`).

## Boot thật trên bản ĐÃ CÀI (1 lần)
`exit=0` · `session-63a54b79-4e5f-4fbe-a946-c16466ce73b1` · 6 tool call. Nguyên văn:

```
Members (1 present + 1 removed):
  - alice [researcher] idle/unspawned · opencode-go/kimi-k2.7-code
Removed (1):
  - bob [qa] opencode-go/deepseek-v4.1-flash · reasoning max · joined 2026-11-01T08:54:33.749Z
Tasks (1):
  - t1 [pending] work findings 1 attempt 0 probe task → captain
Team id: t149probe · phase: staged
```

## Đối chứng âm `--negative` (EXIT 0 = mọi nhánh đều bắt)
- bảng sạch 13/13 ⇒ tiến trình con exit 0; bảng đột biến ⇒ exit 1
- lật bytes `lib/tools.js` +1 trong bảng (trong bộ nhớ): `DIFF … applies=false delta=-1`
- lật 1 byte **bản sao payload** đã giải nén: `DIFF … [payload] applies=true delta=+1`
- đổi sha `lib/members.js` → `ffffffffffffffff`: `shaApplies=false`
- lật 1 byte trên **BẢN COPY .tgz** (offset 5, trong MTIME): `--analyze` trên bản copy **EXIT 1** tại A4 (`sha256Now=a2e479aa…`), bản gốc **EXIT 0**; tổng bytes lệch 0 nhưng sha đổi

## Drift và lan can (cùng lần chạy)
- drift 13 tệp: **sau pack = 0/13**, **sau cài + boot = 0/13**
- `tests/t98-render-coverage.mjs --strict` EXIT 0 GREEN (reached=105, uncovered=0)
- `tests/t10-ui-bundle-smoke.mjs` EXIT 0 · `tests/t128-panel-order.mjs` EXIT 0 · `tests/t129-pins.mjs` EXIT 0
- `node tools/sweep-suites.mjs --list` EXIT 0: `totals: 80 suite(s) = 10 LIVE + 10 pack + 47 fast; legacy exceptions: 16`; `t149-pack.mjs` nằm trong nhóm PACK (mặc định không chạy vì nó pack + boot)

## Suite pack cũ SẼ ĐỎ vì ghim hash nguồn (đúng thiết kế, không sửa)
15 mục LEGACY trong verdict, thêm `packages/dsh-agent-teams/tests/t143-pack.mjs:406` ghim `lib/client.js.map 173b684f1a6a569c` (bảng vòng 23). Muốn audit artefact vòng 24 thì dùng chính `t149-pack.mjs`.

## Giới hạn (trung thực)
- 2 pack (2 tiến trình), 1 boot, 4 suite khác, 1 lần thử.
- Bảng FROZEN sinh bằng ĐO tại HEAD ngay trước khi chạy, không copy bảng vòng 23; ba dòng đổi được in kèm giá trị cũ → mới.
- `lib/client/WorkspaceActivity.module.css` ngoài bảng 13 và ngoài 14 dòng ba chiều theo contract; nó được in riêng (sha c7f2d5e5…, không đổi) và phủ bởi phép quét payload.
- Kiểm byte chứng minh cơ chế `--member-column-height` và bố cục ba khối NẰM TRONG bản phát hành; nó không chứng minh bằng nhau về pixel — phép đo pixel thuộc t148 (Chromium của host).