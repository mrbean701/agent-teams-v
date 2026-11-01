# t140 — pack vòng 22 (panel HAI CỘT: cột member trước cột dependency)

Suite: `packages/dsh-agent-teams/tests/t140-pack.mjs` (chép khuôn `t135-pack.mjs`, **không sửa** tệp đó).
Ba chế độ: `--fresh [runDir]` (mặc định) · `--analyze <dir> [tgz]` · `--negative` (+ `--pack-once <dir>`, `--negative-probe <table>` cho tiến trình con).

## Vì sao có vòng 22
t139 đổi BỐ CỤC panel thành hai cột (yêu cầu người dùng m07538) ⇒ `lib/client.js` (377bcea2…/258 432 → **d91354cb…/259 417**), `lib/client.js.map` (5024364f…/404 958 → **b1693659…/406 099**), `lib/client/ActivityPanel.module.css` (53ea47c6…/51 837 → **9eee05f2…/52 290**), `lib/client/ActivityPanel.js` (→ e4332052…/64 279). Verdict vòng 21 (t135/t136) hết hiệu lực nên phải pack + audit lại trước khi công bố.

## Artefact phát hành vòng 22
`packages/dsh-agent-teams/tests/tmp/t140/run-t140-a/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`

- sha256 `b65f60fd28b4a6eda10afbdb63fdbfb1a88ab58fe0a970bc8c68180cd4f5f9c1`
- bytes **2 248 542** · entries **133** · entry thư mục **0** · rác 0 · đường dẫn tuyệt đối 0 · required 6/6
- pack-b do **tiến trình con riêng** (`--pack-once`) sinh: cùng sha256, cùng bytes, cùng 133 entry ⇒ tất định giữa hai tiến trình
- `--analyze` đọc lại tarball trên đĩa: `sha256Now=b65f60fd…` `bytesNow=2248542` `entriesNow=133` (không hardcode)

## Bảng FROZEN 13 dòng — ĐO MỚI lúc chạy (2026-11-01T06:40:38.548Z)
| tệp | sha256 (16) | bytes |
|---|---|---|
| lib/tools.js | e51734baf4693cd3 | 213 715 |
| lib/members.js | 50f558f8b207d874 | 102 260 |
| lib/state.js | 56664c59ff400319 | 57 508 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13 986 |
| lib/index.js | 2d28e617f0683e42 | 45 315 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |
| **lib/client.js** | **d91354cb105e54ae** | **259 417** |
| **lib/client.js.map** | **b1693659959056b0** | **406 099** |
| lib/types/members.d.ts | c53250ab41bff8c3 | 31 769 |
| lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7 627 |
| lib/types/tools.d.ts | 41cfc56576ed8ffd | 7 546 |
| **lib/client/ActivityPanel.module.css** | **9eee05f27d4b5240** | **52 290** |
| package.json | 92a6404071e457cc | 10 498 |

A19 canh đúng ba dòng đổi so với bảng vòng 21 (`client.js`, `client.js.map`, `ActivityPanel.module.css`) và **10 dòng còn lại nguyên** — nếu một dòng thứ tư xê dịch thì đó là điều kiện DỪNG, không phải chuyện để sửa bảng.

## Ba chiều 14/14 SAME (profile MỚI `agent-teams-pack21`)
13 tệp đóng băng **+ `lib/client/ActivityPanel.js`** (nguồn panel có mặt trong tarball nên phải so): payload = bản cài = nguồn, 14/14 SAME. `npm=0`, `isSymlink=false`, `isDirectory=true`, version `0.2.0-dev.0`, lock `file:E:/…/tests/tmp/t140/run-t140-a/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`.

## Kiểm bố cục panel ở mức BYTE của bản ĐÃ CÀI (A13 — lần đầu bản phát hành đổi bố cục)
Trong `lib/client.js` của bản cài, tính **byte offset** (không phải char index — bản bundle có ký tự đa byte):

- `data-panel-columns` (grid) @ **176 450** (x1)
- `data-panel-column: "member"` @ **176 578** (x1)
- `data-panel-column: "dependency"` @ **182 918** (x1)
⇒ member đứng TRƯỚC dependency, cách nhau **6 340 byte**; `ok=true`, `memberBeforeDependency=true`, bundle 259 417 B.

Marker được nhận diện theo **hình dạng thuộc tính** (regex trên `data-panel-column…`), không theo tên JSX call site, nên đổi tên component không thể biến phép kiểm thành no-op. Đối chứng ngược: `node packages/dsh-agent-teams/tests/tmp/t140/paneltest.mjs` (cùng đoạn mã, chạy trên cây nguồn) và một `indexOf` độc lập trên Buffer cho đúng 176 578.

## Boot thật trên bản ĐÃ CÀI (1 lần)
`exit=0` · `session-288a9c92-527e-4c9f-8548-84f84b4c4fb2` · 6 tool call: create → remove_member → status → edit_plan → update_task(findings) → status.
Nguyên văn khối roster:

```
Members (1 present + 1 removed):
  - alice [researcher] idle/unspawned · opencode-go/kimi-k2.7-code
      active route: /
Removed (1):
  - bob [qa] opencode-go/deepseek-v4.1-flash · reasoning max · joined 2026-11-01T06:42:20.376Z
Tasks (1):
  - t1 [pending] work findings 1 attempt 0 probe task → captain
Team id: t140probe · phase: staged
```

## Đối chứng âm `--negative` (EXIT 0 nghĩa là MỌI nhánh đều bắt được)
- bảng sạch: 13/13 khớp ⇒ tiến trình con `exit 0`
- lật **bytes** của `lib/tools.js` trong bảng: `DIFF … [frozen] applies=false delta=-1`
- lật 1 byte trên **bản sao payload** đã giải nén: `DIFF lib/state.js [payload] applies=true delta=+1`
- đổi **sha** của `lib/members.js`: `DIFF … shaApplies=false`
- lật 1 byte trên **BẢN COPY `.tgz`** (offset 5, trong MTIME; file vẫn giải nén được): `--analyze` trên bản copy **EXIT 1** tại `A4 artifact re-hashed from disk` (`sha256Now=c394c850…`), bản gốc **EXIT 0**; tổng bytes lệch 0 nhưng sha đổi
- hai tiến trình thật cho bảng sạch/bảng đột biến: exit **0 / 1**

## Lan can đi kèm (cùng lần chạy)
`tests/t98-render-coverage.mjs --strict` EXIT 0 GREEN (reached=105, uncovered=0) · `tests/t10-ui-bundle-smoke.mjs` 50/50 · `tests/t128-panel-order.mjs` 24/24 (có ca B3 build trên bản sao) · `tests/t129-pins.mjs` 13/13.

## Suite pack cũ SẼ ĐỎ vì ghim hash nguồn (đúng thiết kế, không sửa)
14 suite, trong đó vòng mới nhất được nêu tên: `packages/dsh-agent-teams/tests/t135-pack.mjs:399` ghim `lib/client.js.map 5024364fefe8b73e` (bảng vòng 21). Ai muốn audit artefact vòng 22 thì dùng chính `t140-pack.mjs`; muốn tái lập artefact vòng 21 thì cần cây byte vòng 21 + profile `agent-teams-pack20`.

## Giới hạn (trung thực)
- 2 lần pack (A + tiến trình con B), 1 boot, 4 suite khác, 1 lần thử.
- `--fresh` chạy trên đúng bộ byte đang phát hành; bảng FROZEN sinh bằng đo tại HEAD, không copy bảng vòng 21.
- Kiểm bố cục ở mức byte chứng minh THỨ TỰ nhúng trong bundle phát hành; nó không chứng minh CSS hiển thị đúng — việc đó thuộc t128/t10 và ảnh chụp giao diện.
- `tests/tmp/t128/build-copy` (scratch của ca B3) nằm ngoài inScope nên chưa dọn.