# t143 — pack vòng 23 (panel BA KHỐI, dependencies 1:2)

Suite: **packages/dsh-agent-teams/tests/t143-pack.mjs** (chép khuôn t140-pack.mjs; KHÔNG sửa t140 và các suite pack cũ).
Bốn chế độ: `--fresh [runDir]` (mặc định) · `--pack-once <dir>` · `--negative` · `--analyze <dir> [tgz]`.

## Vì sao có vòng 23
t142 thay bố cục hai cột của vòng 22 bằng BA KHỐI (cột trái = delegation + add-member + list member, cột phải = DependencyMap, tỉ lệ 1:2); audit t141 đã bác vòng 22 bằng V22-F0 (high). Năm tệp phát hành đổi:

- `lib/client.js` 7dca20dd105e54ae / **258 790 B** (vòng 22: d91354cb / 259 417)
- `lib/client.js.map` 173b684f1a6a569c / **405 349 B** (vòng 22: b1693659 / 406 099)
- `lib/client/ActivityPanel.module.css` 7ea5190c7d978556 / **52 045 B** (vòng 22: 9eee05f2 / 52 290)
- `lib/client/ActivityPanel.js` 2407c22ee26675e5 / 64 097 B (tệp thứ 14 của bảng ba chiều)
- `lib/client/WorkspaceActivity.module.css` c7f2d5e5d295c40f / 3 579 B (báo riêng, ngoài bảng 13 và ngoài 14)

## Artefact phát hành vòng 23
`packages/dsh-agent-teams/tests/tmp/t143/run-t143-b/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`

- sha256 **62ad22758a405a9ad1c9e380b91a2ea5aef830e0a66a9a0bad2fde74f6c1d308**
- bytes **2 248 300** · entries **133** · entry thư mục **0** · required 6/6 · rác 0 · đường dẫn tuyệt đối 0
- pack-b do **tiến trình con riêng** (`--pack-once`) sinh: cùng sha256 / cùng bytes / cùng 133 entry
- `--analyze` đọc lại tarball trên đĩa: sha256Now=62ad2275… bytesNow=2248300 entriesNow=133 (không hardcode)

## Bảng FROZEN 13 dòng — ĐO MỚI lúc 2026-11-01T07:24:58.051Z
| tệp | sha256 (16) | bytes |
|---|---|---|
| lib/tools.js | e51734baf4693cd3 | 213 715 |
| lib/members.js | 50f558f8b207d874 | 102 260 |
| lib/state.js | 56664c59ff400319 | 57 508 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13 986 |
| lib/index.js | 2d28e617f0683e42 | 45 315 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |
| **lib/client.js** | **7dca20dd1edf2c66** | **258 790** |
| **lib/client.js.map** | **173b684f1a6a569c** | **405 349** |
| lib/types/members.d.ts | c53250ab41bff8c3 | 31 769 |
| lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7 627 |
| lib/types/tools.d.ts | 41cfc56576ed8ffd | 7 546 |
| **lib/client/ActivityPanel.module.css** | **7ea5190c7d978556** | **52 045** |
| package.json | 92a6404071e457cc | 10 498 |

A19 đối chiếu với bảng vòng 22 (`FROZEN_ROUND22` nhúng trong suite, chỉ để chứng minh DÒNG NÀO đã đổi): đúng **3 dòng** đổi, 10 dòng nguyên. Một dòng thứ tư xê dịch là điều kiện DỪNG, không phải chuyện để sửa bảng.

## Ba chiều 14/14 SAME (profile MỚI agent-teams-pack22)
13 dòng đóng băng + `lib/client/ActivityPanel.js`; payload = bản cài = nguồn, **14/14 SAME**. `npm=0`, `isSymlink=false`, `isDirectory=true`, version `0.2.0-dev.0`, lock `file:E:/…/tests/tmp/t143/run-t143-b/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`. Quét TOÀN payload: 133/133 entry khớp nguồn, 0 diff, 0 bỏ qua. 19/19 named export + SELF_MUTATION caught.

## A5 — bằng chứng BYTE trong `lib/client.js` của BẢN ĐÃ CÀI
| phép kiểm | kết quả |
|---|---|
| có `minmax(280px,1fr) minmax(0,2fr)` | **count=1, byte offset 76 534** |
| có selector `[data-workspace-team]` | count=1, byte offset 172 121 |
| `data-panel-columns` | **count=0** (biến mất) |
| `panelColumns` | **count=0** |
| `panelColumnAside` | **count=0** |
| `DependencyMap` call site | count=1, **byte offset 182 377**, siblingClose=true, wrapped=false |
| nguồn `ActivityPanel.js` / `ActivityPanel.module.css` | cả ba marker trên = x0 ở cả hai tệp (sourceSibling=true) |

Đoạn trích cấu trúc quanh call site (nguyên văn từ bundle đã cài, ~200 ký tự trước):

```
}) })] })] }, member.id || member.name);
    })] })] });
  })()] })] }), (0, import_jsx_runtime5.jsx)(DependencyMap, { tasks: team.tasks, members: team.members, t, discarded, workspace, onSelectTask: setSelectedTaskId }), workspace && (0, imp…
```

Cách chứng minh "sibling" chứ không phải "con của div bọc cột": (a) trong bundle, call site đứng NGAY SAU `}), ` (đóng element trước) và giữa hai thứ chỉ có wrapper `(0, import_jsx_runtimeN.jsx)(` — tức `siblingClose=true`; (b) KHÔNG có `children: [` chen vào — `wrapped=false`; (c) trong NGUỒN, cùng một dòng `] })] }), _jsx(DependencyMap, {` xác nhận cùng quan hệ. Cả ba điều kiện phải cùng đúng thì `ok=true`.

## Boot thật trên bản ĐÃ CÀI (1 lần)
`exit=0` · `session-3845d8dc-b9c8-40aa-95d9-a4eb2cb3a6c7` · 6 tool call (create → remove_member → status → edit_plan → update_task(findings) → status):

```
Members (1 present + 1 removed):
  - alice [researcher] idle/unspawned · opencode-go/kimi-k2.7-code
Removed (1):
  - bob [qa] opencode-go/deepseek-v4.1-flash · reasoning max · joined 2026-11-01T07:27:47.985Z
Tasks (1):
  - t1 [pending] work findings 1 attempt 0 probe task → captain
Team id: t143probe · phase: staged
```

## Đối chứng âm `--negative` (EXIT 0 nghĩa là MỌI nhánh đều bắt)
- bảng sạch 13/13 ⇒ tiến trình con exit 0; bảng đột biến ⇒ exit 1
- lật **bytes** `lib/tools.js` +1 trong bảng: `DIFF … applies=false delta=-1`
- lật 1 byte **bản sao payload** đã giải nén: `DIFF lib/state.js [payload] applies=true delta=+1` (sha 56664c59 → 650cb95f)
- đổi **sha** `lib/members.js` thành `ffffffffffffffff`: `shaApplies=false`
- lật 1 byte trên **BẢN COPY .tgz** (offset 5, trong MTIME; file vẫn giải nén được): `--analyze` trên bản copy **EXIT 1** tại A4 (`sha256Now=f74e6006…`), bản gốc **EXIT 0**; tổng bytes lệch 0 nhưng sha đổi

## Drift và lan can (cùng lần chạy)
- drift 13 tệp: **sau pack = 0/13**, **sau cài + boot = 0/13**
- `tests/t98-render-coverage.mjs --strict` EXIT 0 GREEN (reached=105, uncovered=0)
- `tests/t10-ui-bundle-smoke.mjs` 50/50 · `tests/t128-panel-order.mjs` 22/22 · `tests/t129-pins.mjs` 13/13
- `node tools/sweep-suites.mjs --list` EXIT 0: 79 suite = 10 LIVE + 69 fast, legacy 12; có dòng `packages/dsh-agent-teams/tests/t143-pack.mjs`

## Suite pack cũ SẼ ĐỎ vì ghim hash nguồn (đúng thiết kế, không sửa)
14 mục, mới nhất vòng 23 nêu thêm `packages/dsh-agent-teams/tests/t140-pack.mjs:399` ghim `lib/client.js.map b1693659959056b0` (bảng vòng 22). Muốn audit artefact vòng 23 thì dùng chính `t143-pack.mjs`.

## Giới hạn (trung thực)
- 4 lần pack (2 lần chạy `--fresh` × 2 pack), 2 boot, 8 lượt suite khác, 1 lần thử (attempt 1).
- Lần chạy `--fresh` ĐẦU (run-t143-a) có A13 ĐỎ vì regex dò call site của tôi sai (`jsx)(DependencyMap` cần hai dấu ngoặc); đã sửa sang neo `DependencyMap, {` + luật siblingClose/wrapped, rồi chạy lại `--fresh` (run-t143-b, 20/20). Log cả hai còn trong `logs/`.
- `--analyze` nay đo LẠI layout trên profile đã cài (không dùng số cũ trong meta.json).
- Kiểm bố cục ở mức byte chứng minh thứ tự/cấu trúc nhúng trong bundle phát hành; nó không chứng minh CSS hiển thị đúng trên màn hình — việc đó thuộc t128/t10 và ảnh chụp giao diện.
- `lib/client/WorkspaceActivity.module.css` (tệp thứ 5 đổi) nằm ngoài bảng 13 và ngoài 14 dòng ba chiều theo đúng contract; nó được phủ bởi phép quét toàn payload (133/133 khớp nguồn).