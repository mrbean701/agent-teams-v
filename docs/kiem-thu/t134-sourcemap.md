# t134 — V20-F1/F2/F3: sourcemap đúng cột, WARN của cổng, t118 về LEGACY

Ngày: 2026-11-01 · Attempt: 63d8a36f-ade1-4c89-8ec9-6a0f9d49e5a4 · Model: flash
Phạm vi: `packages/dsh-agent-teams/lib/client.js.map`, `tests/t128-panel-order.mjs`,
`tests/t120-sweep-suites.mjs`, `tests/t59-erp-live-copy.mjs`, `tools/sweep-suites.mjs`,
tài liệu này. KHÔNG chạm `lib/tools.js`, `lib/members.js`, `lib/state.js`, `docs/TODO.md`, `docs/log`, `E:/Project/ERP`.

## V20-F1 — map ship bị lệch cột (đã vá bằng cách SINH LẠI, không sửa tay)

`lib/client.js.map` phát hành ở vòng 20 (`1f1d1552…` / 404 958 B) có `mappings` cũ: nội dung
`sourcesContent[2]` đã đổi (t128) nhưng mappings thì không, nên mọi segment của vùng panel trỏ lệch.
Bộ giải VLQ tự viết (`tests/tmp/t134/probe-map.mjs`) đọc thẳng bundle offset, dựng lại cột/dòng sinh,
rồi tra segment cuối có `genCol <= col` để lấy (nguồn, dòng, cột):

| identifier trong bundle | vị trí bundle | map CŨ (1f1d1552) | map MỚI (5024364f) |
| --- | --- | --- | --- |
| `DependencyMap` | 175 647 → line 1919 col 2595 | 392:179 `pendencyMap, ` ❌ | 392:177 `DependencyMap` ✅ |
| `AddMemberControl` | 175 796 → line 1919 col 2744 | 392:179 `pendencyMap, { t` ❌ | 392:327 `AddMemberControl` ✅ |
| `orderDelegationMembers` | 1920:27 | 393:55 ✅ | 393:55 ✅ |

Map cũ sai đúng chỗ: cả hai identifier rơi vào cột 179 của dòng nguồn 392 (giữa `dependencyMap` destructuring)
thay vì 177 / 327. Hai map **cùng 404 958 B** nên so byte hay sha không thấy — chỉ giải VLQ mới thấy.
Đó cũng là honest limit của mọi cổng chỉ so hash: hash của `client.js` không đổi (`377bcea2…`).

Cách sinh lại (pipeline thật, không hand-edit): `cd packages/dsh-agent-teams && node build/build.mjs`.
Kết quả: `lib/client.js` **tái lập byte-identical** `377bcea2394cc0ac…` / 258 432 B (nên pin t10 giữ nguyên);
`lib/client.js.map` đổi thành `5024364fefe8b73efc14579d9b202013ce700147424d4b084836e38ee91a418e` / 404 958 B,
`mappings` dài đúng 114 429 ký tự, 3 212 dòng sinh, 21 354 segment, sha `mappings` `75443a5f…` (cũ `b6fd506a…`).
Hai tệp trung gian `build/client.js` / `build/client.js.map` (không ship) đã phục hồi nguyên byte ⇒ net change chỉ là `.map`.

## A2 — ca mới trong `tests/t128-panel-order.mjs` (16 ca, EXIT 0)

- `M2` viết lại: bất biến cũ 'mappings untouched' là SAI; nay đòi `mappings` **khác** bản `tests/tmp/t128/before/`,
  cùng độ dài 114 429 ký tự.
- `M4` ba probe xanh: mỗi identifier trỏ đúng chính nó trong `sourcesContent[2]`.
- `N3` đối chứng âm: nạp map CŨ ⇒ cả `DependencyMap` lẫn `AddMemberControl` về 392:179 (`ok=false`)
  trong khi byte length vẫn 404 958 ⇒ ca này **ĐỎ trên map cũ, XANH trên map mới** đúng yêu cầu.

## V20-F2 — WARN do test tự in không còn bị tính là WARN của cổng

`tests/t56-types-fallback.mjs:435-441` in `${allow ? WARN : FATAL} …`; ca `d20` chạy **cả hai** nhánh nên log có
1 dòng `FATAL` và 1 dòng `WARN` cùng lý do. `WARN_RE = /^WARN /u` cũ đếm cả dòng đó ⇒ cổng báo WARN giả.

Vá: thêm `HARD_SEVERITY_RE = /^(?:FATAL|ERROR) /u` và `classifySeverity()` — dòng WARN là **WARN của cổng**
chỉ khi trong CÙNG lượt chạy không có dòng FATAL/ERROR nào (suite tự diễn lại hợp đồng severity thì là `[fixture]`).
Dòng bị loại **vẫn in nguyên văn** với thẻ `[fixture] |`, không bị bỏ im lặng; báo cáo tách
`warnings: N gate WARN line(s)` và `fixture warnings: M`; `summary` thêm `WARN=… WARN_FIXTURE=…`; `--strict` chỉ đỏ theo gate WARN.

Trước/sau trên cùng lệnh `node tools/sweep-suites.mjs --run --only t56`:
trước `warnings: 1 WARN line(s) in 1 suite(s)` / `WARN=1` → sau `warnings: 0 gate WARN line(s) in 0 suite(s)`,
`fixture warnings: 1 WARN line(s) in 1 suite(s)`, `WARN=0 WARN_FIXTURE=1`, EXIT 0.
Honest limit: suite vừa diễn severity vừa thật sự bỏ qua gate thì WARN của nó không được đếm là gate (dòng thô vẫn in).
`tests/t120-sweep-suites.mjs` nay 23 ca (thêm a21/a22/a23, sửa a18/a19/a20), EXIT 0 23/23.

## V20-F3 — `tests/t118-pack.mjs` về LEGACY

`DEFAULT_EXCEPTIONS` nay 9 mục: 8 pack suite cũ + `tests/t118-pack.mjs` với citation `tests/t118-pack.mjs:49`,
reason: bảng FROZEN/FROZEN_TARBALL ghim artefact vòng 18 (`lib/client.js.map 1f1d1552`, tarball `1bb0ef1f`),
fix: dùng `packages/dsh-agent-teams/tests/t130-pack.mjs` (vòng hiện hành) hoặc profile `agent-teams-pack17`.
`node tools/sweep-suites.mjs --list` EXIT 0: `72 suite(s) = 9 LIVE + 63 fast; legacy exceptions: 9`.
`--run --only t118-pack` EXIT 0: LEGACY, `ran=false`, in citation — sweep không còn FAIL vì nó.

## A6 — drift 13 tệp FROZEN (đo trước và sau t134, `tests/tmp/t134/drift.mjs`)

`drift=1/13`. Chỉ `lib/client.js.map` đổi (`1f1d15524bcd3caa…` → `5024364fefe8b73e…`, cùng 404 958 B).
12 tệp còn lại SAME nguyên byte: tools.js `e51734ba…`/213 715 · members.js `50f558f8…`/102 260 ·
state.js `56664c59…`/57 508 · snapshot.js `a2a87e1b…`/13 986 · index.js `2d28e617…`/45 315 ·
tool-names.js `e3def5db…`/808 · client.js `377bcea2…`/258 432 · members.d.ts `c53250ab…`/31 769 ·
snapshot.d.ts `962f99a7…`/7 627 · tools.d.ts `41cfc565…`/7 546 · ActivityPanel.module.css `53ea47c6…`/51 837 ·
package.json `92a64040…`/10 498.

Bảng cần cập nhật ở card pack kế tiếp (KHÔNG sửa trong t134, ngoài inScope):
`packages/dsh-agent-teams/tests/t130-pack.mjs:383` ghim `lib/client.js.map 1f1d15524bcd3caa`/404 958 ⇒ phải re-pin `5024364fefe8b73e`.
`tests/t126-released-bytes-boot.mjs:53` ghim `['lib/client.js.map', 'bbf88608f54e966f', 404958]` (bản vòng 19) ⇒ cần card riêng.
`tests/t59-erp-live-copy.mjs` đã re-pin ĐÚNG một dòng (12 dòng còn lại nguyên byte) ⇒ `tests/t129-pins.mjs` 13/13.

## Exit code từng lệnh (đo bằng `cmd >log 2>&1; echo EXIT=$?`, không qua pipe)

| lệnh | EXIT | kết quả |
| --- | --- | --- |
| `node tests/t128-panel-order.mjs` (verify) | 0 | 16/16 |
| `node tests/t10-ui-bundle-smoke.mjs` (verify) | 0 | 50/50 |
| `node tests/t120-sweep-suites.mjs` (verify) | 0 | 23/23 |
| `node tests/t129-pins.mjs` | 0 | 13/13 |
| `node tests/t98-render-coverage.mjs --strict` | 0 | GREEN, reached=105, uncovered=0 |
| `node tests/t56-types-fallback.mjs` | 0 | 20/20 |
| `node tools/sweep-suites.mjs --list` | 0 | 72 suite = 9 LIVE + 63 fast, 9 LEGACY |
| `node tools/sweep-suites.mjs --run --only t56` | 0 | WARN=0, WARN_FIXTURE=1 |
| `node tests/t59-erp-live-copy.mjs` | 0 | 10/10, session-eeb51885-af68-49a8-804a-99f8d3a722cf, ERP team.json byte-identical |

## Giới hạn trung thực

- Cổng parity/hash KHÔNG bắt được defect này: `client.js` và độ dài `.map` đều không đổi. Chỉ boot + giải VLQ bắt được.
- `--only` của sweep là khớp CHUỖI CON: `--only fake-warn` khớp cả fixture `t120-fake-warn-fixture.mjs`
  (đã sửa ca a18/a19 sang `fake-warn.mjs`); người dùng phải lọc đủ hẹp.
- `tests/t118-pack.mjs` và các pack suite vòng cũ VẪN đỏ khi chạy thẳng — đúng thiết kế (chúng ghim artefact lịch sử).
- Chưa có cổng tự động nào kiểm 'map phải khớp nguồn' cho MỌI lần build; t128 chỉ kiểm 3 anchor panel.
