# t157 — pack vòng 26 (opt-in `start_if_needed` + `startMemberOnDemandNow`)

Suite: **packages/dsh-agent-teams/tests/t157-pack.mjs** (chép khuôn `t151-pack.mjs`; KHÔNG sửa t151/t149/t143/t140).
Bốn chế độ: `--fresh [runDir]` · `--pack-once <dir>` · `--negative` · `--analyze <dir> [tgz]`.

## Vì sao có vòng 26
t155 thêm **opt-in** `start_if_needed` (mặc định `false` ⇒ hành vi cũ nguyên văn) cho `agent_teams_set_member_route`, kèm helper `startMemberOnDemandNow()`; t156 cập nhật bảng ghim 12 dòng render + bảng FROZEN của `tests/t59-erp-live-copy.mjs`. Cây nguồn đã xanh (t98 GREEN, t114 16/16, t99 11/11, t155 11/11, t115 43/43, t113 38/38, t107 13/13) nên phải pack lại.

Hai dòng bảng 13 đổi (cũ → mới), 11 dòng còn lại NGUYÊN byte — gồm cả bundle client:

| tệp | vòng 25 | vòng 26 |
|---|---|---|
| `lib/tools.js` | e51734ba… / 213 715 | **642de17fb176c301… / 221 404** |
| `lib/types/tools.d.ts` | 41cfc565… / 7 546 | **258c8b6a827a0838… / 8 781** |
| `lib/client.js` | 67d616a6… / 258 925 | 67d616a6… / 258 925 (**không đổi**) |
| `lib/client.js.map` | 718f4154… / 405 694 | 718f4154… / 405 694 (**không đổi**) |

## Artefact phát hành vòng 26
`packages/dsh-agent-teams/tests/tmp/t157/run-t157-a/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`

- sha256 **8ef366ede347eff4aa128d5216fe0600636fd89ba5a5ea011fe2c0abee6e3728**
- bytes **2 250 654** · entries **133** · entry thư mục **0** · required 6/6 · rác 0 · đường dẫn tuyệt đối 0
- pack-b do **tiến trình con riêng** (`--pack-once`) sinh: cùng sha256 / bytes / 133 entry
- `--analyze` đọc lại tarball trên đĩa: `sha256Now=8ef366ed…` `bytesNow=2250654` `entriesNow=133`

## Bảng FROZEN 13 dòng — ĐO MỚI lúc chạy
| tệp | sha256 (16) | bytes |
|---|---|---|
| **lib/tools.js** | **642de17fb176c301** | **221 404** |
| lib/members.js | 50f558f8b207d874 | 102 260 |
| lib/state.js | 56664c59ff400319 | 57 508 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13 986 |
| lib/index.js | 2d28e617f0683e42 | 45 315 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |
| lib/client.js | 67d616a608c38ed3 | 258 925 |
| lib/client.js.map | 718f41544f36ae51 | 405 694 |
| lib/types/members.d.ts | c53250ab41bff8c3 | 31 769 |
| lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7 627 |
| **lib/types/tools.d.ts** | **258c8b6a827a0838** | **8 781** |
| lib/client/ActivityPanel.module.css | 210186828966d0cf | 52 180 |
| package.json | 92a6404071e457cc | 10 498 |

A19 đối chiếu `FROZEN_ROUND25` (nhúng trong suite): **đúng 2 dòng đổi** — `lib/tools.js` và `lib/types/tools.d.ts` — 11 dòng nguyên, và verdict in thêm dòng so sánh trực tiếp:

```
so vong 25: doi 2 dong [lib/tools.js, lib/types/tools.d.ts]
             nguyen 11 dong, trong do lib/client.js=67d616a608c38ed3/258925 va lib/client.js.map=718f41544f36ae51/405694 (bundle client KHONG doi)
```

## Ba chiều 14/14 SAME (profile MỚI `agent-teams-pack25`)
13 dòng đóng băng + `lib/client/ActivityPanel.js` (60f44766… / 64 305 B); payload = bản cài = nguồn, **14/14 SAME**. `npm=0`, `isSymlink=false`, `isDirectory=true`, version `0.2.0-dev.0`, lock `file:E:/…/tests/tmp/t157/run-t157-a/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`. Quét TOÀN payload **133/133** entry khớp nguồn, 0 diff, 0 bỏ qua. 19/19 named export + SELF_MUTATION caught.

## A5 — bốn phép byte trên bản ĐÃ CÀI
| phép | kết quả |
|---|---|
| (a) `start_if_needed` trong `lib/tools.js` | **count=4, byte offset 83 501** — nằm trong schema của `agent_teams_set_member_route` (xem excerpt) |
| (b) `startMemberOnDemandNow` | **count=2, byte offset 180 533** |
| (c) `lib/client.js` giống vòng 25 | **67d616a608c38ed3 / 258 925 B** (in ở dòng `so vong 25` + bảng ba chiều + FROZEN) |
| (d) bố cục vòng 25 không quay lại | `data-panel-columns`/`panelColumns`/`panelColumnAside` = **0/0/0**; `contain:size` **count=1 @byte 79 312**, nằm trong khối `@container (width>=800px)` (opener @79 061, `clean=true`); `DependencyMap` @182 512 siblingClose=true, sourceSibling=true |

Excerpt ~120 ký tự quanh `start_if_needed` (nguyên văn từ `lib/tools.js` bản cài):

```
…llback_model, or fallback_reasoning_effort.' },
            start_if_needed: { type: 'boolean', description: 'Set true to START this member now when it owns a durable id but has …
```

## Boot thật trên bản ĐÃ CÀI (1 lần)
`exit=0` · `session-9681232f-9e01-495a-b5dc-f448ad6a13a1` · 6 tool call. Nguyên văn:

```
Members (1 present + 1 removed):
  - alice [researcher] idle/unspawned · opencode-go/kimi-k2.7-code
Removed (1):
  - bob [qa] opencode-go/deepseek-v4.1-flash · reasoning max · joined 2026-11-01T10:55:19.229Z
Tasks (1):
  - t1 [pending] work findings 1 attempt 0 probe task → captain
Team id: t157probe · phase: staged
```

## Đối chứng âm `--negative` (EXIT 0 = mọi nhánh đều bắt)
- bảng sạch 13/13 ⇒ tiến trình con exit 0; bảng đột biến ⇒ exit 1
- lật bytes trong bảng ⇒ `applies=false delta=-1`; lật 1 byte **bản sao payload** ⇒ `applies=true delta=+1`; đổi sha ⇒ `shaApplies=false`
- lật 1 byte **BẢN COPY .tgz** (offset 5, trong MTIME): `--analyze` trên bản copy **EXIT 1** tại A4 (`sha256Now=61b421dc…`), bản gốc **EXIT 0**

## Drift và lan can (cùng lần chạy)
- drift 13 tệp: **sau pack = 0/13**, **sau cài + boot = 0/13**
- `tests/t98-render-coverage.mjs --strict` EXIT 0 GREEN (`fields=114 reached=107 uncovered=0`, khớp bảng ghim t156)
- `tests/t10-ui-bundle-smoke.mjs` EXIT 0 · `tests/t128-panel-order.mjs` EXIT 0 · `tests/t129-pins.mjs` EXIT 0
- `node tools/sweep-suites.mjs --list` EXIT 0: `totals: 84 suite(s) = 10 LIVE + 12 pack + 49 fast; legacy exceptions: 16`

## Suite pack cũ SẼ ĐỎ vì ghim hash nguồn (đúng thiết kế, không sửa)
17 mục LEGACY, thêm `packages/dsh-agent-teams/tests/t151-pack.mjs:405` ghim `lib/client.js.map 718f41544f36ae51` (bảng vòng 25). Muốn audit artefact vòng 26 thì dùng chính `t157-pack.mjs`.

## Giới hạn (trung thực)
- 2 pack (2 tiến trình), 1 boot, 4 suite khác, 1 lần thử.
- Bảng FROZEN sinh bằng ĐO tại HEAD ngay trước khi chạy; hai dòng đổi in kèm giá trị cũ → mới, và verdict in thêm dòng so sánh bảng.
- `lib/client/WorkspaceActivity.module.css` ngoài bảng 13 và ngoài 14 dòng ba chiều theo contract; in riêng (c7f2d5e5…, không đổi) và phủ bởi phép quét payload.
- Kiểm byte chứng minh cơ chế opt-in NẰM TRONG bản phát hành (`start_if_needed` trong schema + helper), không chứng minh hành vi runtime của nó — việc đó thuộc t155 (11/11) và t98.
- A21 mới kiểm `lib/tools.js` bản cài; nó đọc đúng tệp đã cài chứ không đọc cây nguồn.