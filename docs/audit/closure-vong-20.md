# Closure audit vòng 20 — bộ byte `d34be2af…` (t131)

Mốc chấm: 2026-11-01T04:13:54Z. Người chấm: audit-goat (độc lập, không viết mã sản phẩm).
Đối tượng: `packages/dsh-agent-teams/tests/tmp/t130/run-2026-11-01T03-59-18Z/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz` — bản tuyên bố phát hành vòng 20 (bundle đổi thứ tự panel).

## 0. Verdict

**TARBALL VÒNG 20 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CÓ ĐIỀU KIỆN.** Không finding high/blocker.

- Bộ byte tự khớp: sha256 `d34be2af347ea625a5d108f88ca4207dafb53beb59984c775269b1344b63cc39` / **2 248 088 B** / 133 entry / 0 entry thư mục; payload 133/133 khớp nguồn; ba chiều 13/13 với profile `agent-teams-pack19`; repack 2 lần (2 tiến trình) ra đúng cùng sha + bytes.
- Panel: đọc mã bundle xác nhận mảng `children` 5 phần tử theo đúng thứ tự `captainNode` → `ProgressOverview` → `DependencyMap` → `AddMemberControl` → IIFE danh sách member, và `WorkspaceSummary` nối sau bằng `workspace && …` ⇒ Host nạp bundle sẽ render đúng thứ tự thiết kế.
- Điều kiện công bố: (a) sửa/khai V20-F1 (sourcemap đã cũ) và V20-F4 (tài liệu người dùng còn số cũ) trước khi phát hành; (b) dùng đúng đường dẫn artefact, không chép sang chỗ khác; (c) verdict hết hiệu lực theo mục 7.

## 1. Bảng hạng mục

| Mã | Nội dung | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| C1 | đo độc lập sha256/bytes/entry của tarball t130 | ĐẠT — `d34be2af…3cc39` / 2 248 088 B / 133 entry / 0 dir / 0 rác (node_modules, package/tests, .tgz lồng, .pid, package/tools) | `tests/tmp/t131/measure.json` |
| C2 | quét TOÀN payload vs nguồn + ba chiều với bản cài + repack | ĐẠT — payload 133 same / 0 diff / 0 notInSource, `lib/**` 79 tệp không thiếu; 13/13 SAME ba chiều; repack ×2 cùng sha+bytes | `measure.json`, `repack.json`, `repack2/` |
| C3 | ≥3 mutation KIỂU MỚI trên BẢN SAO, ≥1 nhắm thứ tự panel, ≥1 nhắm bản vá t117 | ĐẠT — 4 phép, baseline XANH trước khi đột biến, mọi phép phục hồi byte-identical (nguồn không ghi byte nào) | `mutations.json`, `m1-t10.log`, `m1-t128.log`, `m4-t99.log` |
| C4 | đánh giá rủi ro SỬA TAY bundle (a)(b)(c) | ĐẠT — (a) đồng bộ thật; (b) `mappings` KHÔNG đổi ⇒ map cũ (V20-F1); (c) thứ tự children = thứ tự render (đọc mã) | `bundle-risk.mjs`, `map-verify.mjs`, `children.mjs` |
| C5 | sweep bằng tool chính thức + phân loại | ĐẠT — 69 suite: PASS=51 · FAIL=1 (t118 A5, artefact lịch sử) · LEGACY=8 · UNCLASSIFIED=0 · SKIPPED-LIVE=9 · WARN=1 · DRIFT=0 | `tests/tmp/t131/sweep-run.log` |
| C6 | tự chạy các suite trọng yếu | ĐẠT — t3 18/18 · t10 50/50 · t56 EXIT 0 · t99 11/11 · t107 13/13 · t113 EXIT 0 · t114 16/16 · t115 6/6 · t128 14/14 · t129 EXIT 0 · t98 `--strict` EXIT 0 | `suites-v20.json` |
| C7 | dữ liệu ERP không bị đụng | ĐẠT — `9f7420b6a1af1f4e…` / 1 533 117 B / mtime 2026-10-24T04:53:13.185Z, không đổi cả lượt (0 boot, 0 install profile) | `measure.json` |
| C8 | tài liệu: closure + mục AUDIT.md + điều kiện hết hiệu lực | ĐẠT — tệp này + mục `## Audit closure vòng 20 (t131)` | `docs/log/AUDIT.md` |

## 2. Số đo artefact (node:crypto + tar, không dùng `--analyze` làm bằng chứng)

- `sha256 d34be2af347ea625a5d108f88ca4207dafb53beb59984c775269b1344b63cc39` · `2 248 088 B` · mtime `2026-11-01T04:59Z` · `tar -tzf` 133 entry / 0 entry thư mục / rác 0.
- Repack: lần 1 trong tiến trình đo (`repack/`) và lần 2 trong tiến trình riêng (`repack2/`) đều ra ĐÚNG sha + bytes của artefact ⇒ tất định trên máy này.
- Bản cài: `C:/Users/thang/.dsh/profiles/agent-teams-pack19` — `isSymlink=false`, 133 tệp, version `0.2.0-dev.0`, 0 `dependencies` / 24 `peerDependencies`, `lockResolved` trỏ đúng `…/run-2026-11-01T03-59-18Z/pack-a/…tgz`.

| Tệp | sha256 (16 hex) | byte |
| --- | --- | --- |
| `lib/tools.js` | `e51734baf4693cd3` | 213 715 |
| `lib/members.js` | `50f558f8b207d874` | 102 260 |
| `lib/state.js` | `56664c59ff400319` | 57 508 |
| `lib/snapshot.js` | `a2a87e1b0c0b34ea` | 13 986 |
| `lib/index.js` | `2d28e617f0683e42` | 45 315 |
| `lib/tool-names.js` | `e3def5db908dcbd5` | 808 |
| `lib/client.js` | `377bcea2394cc0ac` | 258 432 |
| `lib/client.js.map` | `1f1d15524bcd3caa` | 404 958 |
| `lib/types/members.d.ts` | `c53250ab41bff8c3` | 31 769 |
| `lib/types/snapshot.d.ts` | `962f99a7bcb18b94` | 7 627 |
| `lib/types/tools.d.ts` | `41cfc56576ed8ffd` | 7 546 |
| `lib/client/ActivityPanel.module.css` | `53ea47c6d780cd9d` | 51 837 |
| `package.json` | `92a6404071e457cc` | 10 498 |

Ngoài bảng đóng băng: `lib/client/ActivityPanel.js` `9596333059c68b80` / 64 004 B (nguồn panel — bằng đúng `sourcesContent[2]` của map).

## 3. Bốn phép đột biến (tất cả trên BẢN SAO `tests/tmp/t131/pkg`, phục hồi byte-identical)

Baseline trước khi đột biến: t10 EXIT 0, t128 EXIT 0, t99 EXIT 0. Sau khi phục hồi: cả ba EXIT 0 lại; `SOURCE_UNCHANGED {bundle,panel,map,tools}` = true (so sha16 với nguồn).

| Mã | Kiểu (mới) | Đột biến | Suite đỏ | Exit + nguyên văn |
| --- | --- | --- | --- | --- |
| M1 | hoán vị hai call site trong BUNDLE | đổi chỗ khối `DependencyMap` (149 B) và `AddMemberControl` (chỉ bundle; source+map không đụng), delta 0 B, sha `d78b099ab8a044c8` | t10, t128 | `FAIL panel order: … DependencyMap above the member list @175743 must precede AddMemberControl above the member list @175647`; t10 còn `FAIL bundle identity … sha256 d78b099a… != 377bcea2…`; t128 `FAIL B1 — the shipped bundle lib/client.js (what the Host loads) carries the same order` |
| M2 | source-only drift | đổi 1 ký tự trong **nguồn** panel `ActivityPanel` → `ActivityPaneI` (bundle+map không đụng), delta 0 B | t128 | `FAIL M1 — the sourcemap still names ../lib/client/ActivityPanel.js as sources[2] and carries the panel verbatim` + `FAIL D1 — the panel diff against the recorded before/ copy is exactly the two call-site lines (392 and 437)`; **t10 EXIT 0 (50/50)** ⇒ suite mức bundle mù với drift nguồn, chỉ cổng đồng bộ t128 bắt |
| M3 | 1 byte chỉ trong `sourcesContent[2]` | lật 1 ký tự ở `sourcesContent[2]` (source+bundle không đụng), delta 0 B | t128 | `FAIL M1 — … carries the panel verbatim` |
| M4 | bản vá t117 ĐỌC SAI NGUỒN | `lib/tools.js:3391` `task.findings_open` → `task.findings.length` (đếm cả finding đã resolved), +4 B | t99 | `not ok 7 a7 — status prints the execution prompt, the active route, the fallback and the override with its provenance` … `# 7/11 passed, 4 failed` — ĐỎ nhưng **không** phải vì findings (xem mục 8) |

## 4. Rủi ro SỬA TAY bundle (không có toolchain sinh lại)

- **(a) source ↔ bundle ↔ `sourcesContent[2]` đồng bộ thật?** CÓ cho source↔map: `sourcesContent[2]` sha16 `9596333059c68b80` = `lib/client/ActivityPanel.js` sha16, 64 004 B. Nhưng đường **source ↔ bundle** không có cổng sinh lại: t128 chỉ so chuỗi anchor + `sourcesContent`, t10 chỉ ghim hash; nếu ai sửa bundle mà giữ anchor và cập nhật `sourcesContent` thì hai cổng vẫn xanh.
- **(b) ba tệp cùng số byte — có gì lẽ ra phải đổi mà không đổi?** CÓ. Phép sửa là **phép quay cùng độ dài**: khối nguồn 8 189 B (IIFE `orderDelegationMembers`) đổi chỗ với khối `DependencyMap`+`AddMemberControl`, khối bundle 6 352 B tương ứng ⇒ tổng byte (258 432 / 404 958 / 64 004) và số dòng (3 217 / 3 217 / 825) không đổi. Nhưng `mappings` của map **giống tuyệt đối** bản trước khi sửa (114 429 ký tự, so với map `bbf88608…` trong profile `agent-teams-pack18`), trong khi `sourcesContent[2]` đã đổi `d35b5f3f…` → `95963330…` ⇒ **map không được sinh lại**: tại offset sinh 175 800 (trong props `AddMemberControl`) map vẫn trả về nguồn `392:179` (vị trí gọi `DependencyMap`), và trên dòng nguồn 392 không có segment nào vượt cột 179 trong khi nguồn mới đặt `AddMemberControl` ở cột 322 và IIFE ở cột 438 ⇒ V20-F1.
- **(c) thứ tự con trong `children` có thật là thứ tự render?** CÓ — đọc mã: mảng `children` ngoài cùng của panel có đúng 5 phần tử: 1) `div` captainNode, 2) `ProgressOverview`, 3) `DependencyMap`, 4) `AddMemberControl`, 5) IIFE danh sách member; `WorkspaceSummary` không nằm trong mảng mà nối sau bằng `workspace && …`. `jsx/jsxs` nhận mảng con và React render theo đúng thứ tự mảng, không có bước sắp xếp nào trong bundle ⇒ thứ tự khai báo = thứ tự hiển thị.
- **Đề xuất**: dựng lại pipeline build trong repo. Các gói cần thiết ĐÃ có trong `packages/dsh-agent-teams/node_modules` (`esbuild`, `tsdown`, `typescript`, `lightningcss`) — thiếu chỉ là config (`tsconfig.json`, `tsdown.config`, `scripts/clean-build.mjs`). Cho tới khi có pipeline: mọi phép sửa tay phải kèm (i) lý do độ dài bất biến, (ii) sinh lại `mappings` hoặc khai thẳng map cũ, (iii) chạy t10 + t128 + t129.

## 5. Sweep và hồi quy

- `node tools/sweep-suites.mjs --run`: 69 suite xét, **PASS=51 · FAIL=1 · LEGACY=8 · UNCLASSIFIED=0 · SKIPPED-LIVE=9 · WARN=1 · DRIFT=0**, tool EXIT 1 (vì có FAIL).
- FAIL duy nhất `tests/t118-pack.mjs` (292 ms): A5 ba chiều so với bản cài `agent-teams-pack18` — profile đó là bản vòng 19, nên FAIL là **artefact lịch sử** (suite của vòng 19 ghim profile vòng 19), không phải hồi quy; suite của vòng này là `t130-pack`. Đề nghị chuyển t118 sang LEGACY có citation.
- LEGACY=8 kèm citation: `tests/t35-pack-repack.mjs:39` · `t84-pack.mjs:51` · `t88-pack.mjs:57` · `t92-pack.mjs:57` · `t96-pack.mjs:57` · `t100-pack.mjs:57` · `t104-pack.mjs:58` · `t108-pack.mjs:59` (ghim sha cũ).
- WARN duy nhất: `tests/t56-types-fallback.mjs` in `WARN typescript was not found …` — đây là **dòng do chính ca d20 in ra để chứng minh nhánh downgrade**, không phải cổng bị bỏ: cổng thật d18 đã chạy `tsc` (EXIT 0). Bộ thu WARN của sweep bắt nhầm ⇒ V20-F2.
- Tự chạy: t3 18/18 · t10 50/50 · t56 EXIT 0 · t99 11/11 · t107 13/13 · t113 EXIT 0 · t114 16/16 (`frozen=13 helperRecords=13 problemsOnDrift=2`) · t115 `verdict PASS — 6/6` · t128 14/14 · t129 EXIT 0 (`DependencyMap, { tasks@175647 < AddMemberControl, { team@175796 < orderDelegationMembers(team.members, team.tasks)@175899`) · t98 `--strict` EXIT 0.

## 6. Findings

- **V20-F1 — medium — sourcemap KHÔNG được sinh lại sau phép sửa tay.** `mappings` (`lib/client.js.map`, 114 429 ký tự) giống tuyệt đối bản tiền sửa trong khi `sourcesContent[2]` đã đổi; tại offset sinh 175 800 (props `AddMemberControl`) map trả về nguồn `392:179` (chỗ gọi `DependencyMap`). Ảnh hưởng: chỉ công cụ debug/source-map (Host không đọc map để render), nhưng map đang NÓI SAI về bản phát hành. Chủ sở hữu: dev-ui-goat + dev-runtime-goat. Tái hiện: `node tests/tmp/t131/map-verify.mjs`, `node tests/tmp/t131/old-vs-new.mjs`.
- **V20-F2 — low — sweep bắt nhầm WARN do test tự in.** `tools/sweep-suites.mjs:262` (`WARN_RE = /^WARN /u`) thu mọi dòng `WARN ` trong stdout của suite, kể cả dòng do ca d20 của `tests/t56-types-fallback.mjs:440` in ra để chứng minh nhánh downgrade ⇒ báo '1 suite WARN' dù cổng `tsc` thật đã chạy. Đề nghị: chỉ thu WARN do cổng phát ra (vd. tiền tố riêng `WARN-GATE `) hoặc ghi rõ trong báo cáo sweep. Chủ sở hữu: dev-build-flash (t124).
- **V20-F3 — low — `tests/t118-pack.mjs` đỏ vì ghim profile vòng trước.** A5 so ba chiều với `agent-teams-pack18`; sau vòng 20 nguồn đổi nên A5 FAIL dù artefact đúng. Đây là artefact lịch sử, nhưng sweep đang xếp FAIL ⇒ mỗi vòng lại có 1 FAIL 'quen thuộc'. Đề nghị: chuyển sang LEGACY có citation như 8 suite pack khác. Chủ sở hữu: dev-build-flash.
- **V20-F4 — low — tài liệu người dùng còn số cũ của vòng 19.** `docs/bao-cao-agent-teams.md:36` (§2.1 dogfood) vẫn ghi `lib/client.js 9da18d9971a2…/258 432` và `lib/client.js.map bbf88608f54e…/404 958`; `:124` bảng suite ghi t10 48/48 với bundle `9da18d99…` (số đo thật: 50/50, bundle `377bcea2…`); `:51` vẫn là đường phát hành `2770fbfc…`/2 248 092 B (vòng 19) chứ chưa nêu `d34be2af…`/2 248 088 B. Chủ sở hữu: captain + dev-ui-goat, sau khi verdict này có hiệu lực.
- **V20-F5 — info — nợ quy trình của card t130.** Tiêu đề mục 4 của `docs/kiem-thu/t130-pack.md` ghi 'Boot thật trên bản ĐÃ CÀI (1 lần, ≤2)' nhưng chính mục giới hạn cuối tệp ghi '2/2 boot' ⇒ đọc nhanh dễ hiểu sai là 1 boot. Đề nghị sửa tiêu đề thành '2 lần', không đổi nội dung.
- **V20-F6 — info — bộ đo của card kiểm thử bị 'tự chữa' (captain đã mở t133).** Captain báo `--analyze` ghi đè `results.json`/`run-meta.json` của artefact đang chấm và CLI fail-open (`--bogus` EXIT 0, `--analyze <path thiếu results.json>` lặng lẽ dùng run mới nhất). Không ảnh hưởng bộ byte vòng 20 và tôi KHÔNG dùng `--analyze` của t130 làm bằng chứng (mọi số ở mục 2 do `tests/tmp/t131/measure.mjs` đo lại), nhưng nếu cơ chế này còn thì mọi verdict sau này dựa trên `--analyze` đều yếu.
- **V20-F7 — info — `t98 --strict` vẫn ghim số dòng render.** Chèn/xoá 1 dòng trong `lib/tools.js` làm cổng EXIT 2 `stale RENDER_LINES map` thay vì báo lệch nội dung; đây là fail-closed đúng thiết kế, ghi lại để người sửa không hoảng.

## 7. Điều kiện hết hiệu lực

- Verdict gắn với ĐÚNG bộ byte `d34be2af347ea625a5d108f88ca4207dafb53beb59984c775269b1344b63cc39` / 2 248 088 B / 133 entry tại đường dẫn nêu trên, mốc `2026-11-01T04:13:54Z`.
- Hết hiệu lực ngay khi: (i) bất kỳ tệp nào của artefact bị pack lại, di chuyển hay đổi 1 byte; (ii) `packages/dsh-agent-teams/lib/**` hoặc `packages/dsh-agent-teams/package.json` đổi 1 byte (kể cả sửa tay client.js/client.js.map); (iii) profile cài `agent-teams-pack19` bị cài đè hoặc trỏ sang đường dẫn khác.
- Riêng phần panel: mọi thay đổi vào thứ tự `children` (`lib/client/ActivityPanel.js:392`, `lib/client.js` vùng offset 173 533–181 976) phải chấm lại bằng t10 + t128 + t129.

## 8. Giới hạn của lượt chấm

- Trần đã dùng: 4 phép đột biến (mỗi phép 1 lần ghi tệp bản sao, phục hồi ngay) · 2 lần repack · 0 boot mới (dùng số đo boot của t130 + đọc mã) · 0 lần cài profile mới · 2 tệp tài liệu.
- **M4 không chứng minh được bản vá t117 có răng**: t99 đỏ ở a7–a9 (so chuỗi status), không có ca nào so `findings`; `m4-t99.log` không có dòng nào chứa 'finding'. Vì vậy tôi KHÔNG dùng M4 làm bằng chứng 'bản vá t117 được canh'; muốn có bằng chứng thật cần một ca trong t98/t107 so `findings ${n}` với `findings_open` của payload.
- Không kiểm trên máy khác; đường dẫn `E:/`, `C:/Users/thang/.dsh` là môi trường của lượt này.
- Không chấm hành vi DOM thật của panel (card t132 đang làm); lượt này chỉ đọc mã bundle + render server-side của t10.