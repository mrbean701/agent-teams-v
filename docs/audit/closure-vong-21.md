# Audit closure vòng 21 (t136) — chấm bộ byte sourcemap đúng

- Card: t136 (kind=review, reviewedTaskId t135, round 21) · người chấm: audit-goat · attempt 1beae654-e69b-433a-af9d-2bf287d397b4
- Mốc chấm: `2026-11-01T04:54:09.155Z` · bộ byte được chấm: `packages/dsh-agent-teams/tests/tmp/t135/run-t135-b/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`

## 0. Verdict — TARBALL VÒNG 21 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CÓ ĐIỀU KIỆN

Không có finding high/blocker. V20-F1 (sourcemap có nội dung mới nhưng `mappings` cũ) ĐÃ ĐÓNG bằng bằng chứng độc lập: bản đồ trong gói khớp **byte-for-byte** với bản dựng lại từ nguồn bằng `packages/dsh-agent-teams/build/build.mjs` (esbuild), và chỉ 762/21 354 segment đổi, toàn bộ nằm trong dải dòng sinh 1919–1941 (đúng vùng panel bị quay). Ba finding còn lại là low/info về tài liệu và phạm vi cổng, không chặn phát hành.

## 1. Số đo độc lập (`tests/tmp/t136/measure.mjs` → `measure.json`)

| Hạng mục | Số đo của audit (tự đo, không chép của t135/captain) |
|---|---|
| sha256 / bytes | `6db464d19428d9f9993a175b36062f9ece95065a68b3477bc660370bb9f2a0c4` / **2 248 091 B** / mtime 2026-11-01T04:36:45.984Z |
| `tar -tzf` | **133 entry**, **0** entry thư mục (`/`), 0 rác (node_modules · package/tests · .tgz lồng · .pid · package/tools) |
| Quét toàn payload | 133 tệp: **133 same / 0 diff / 0 notInSource**; nguồn `lib/**` 79 tệp: **missingInTarball []** |
| Ba chiều 13 tệp FROZEN | **13/13 SAME** (source = payload = profile `agent-teams-pack20`), isSymlink=false, 133 tệp, 0 dependencies / 24 peerDependencies |
| Repack | 2 tiến trình riêng (`repack-a`, `repack-b`) đều ra **đúng sha + đúng bytes**; t135 còn 2 run dir độc lập (`run-t135-a`, `run-t135-b`) cùng sha |
| ERP | `E:/Project/ERP/.agent-teams/erp-erp/team.json` `9f7420b6a1af…` / 1 533 117 B — KHÔNG đổi trong suốt lượt |

Hash chốt: `lib/tools.js` e51734baf4693cd3/213 715 · `members.js` 50f558f8b207d874/102 260 · `state.js` 56664c59ff400319/57 508 · `snapshot.js` a2a87e1b0c0b34ea/13 986 · `index.js` 2d28e617f0683e42/45 315 · `tool-names.js` e3def5db908dcbd5/808 · `client.js` **377bcea2394cc0ac/258 432** · `client.js.map` **5024364fefe8b73e/404 958** · `types/members.d.ts` c53250ab41bff8c3/31 769 · `types/snapshot.d.ts` 962f99a7bcb18b94/7 627 · `types/tools.d.ts` 41cfc56576ed8ffd/7 546 · `ActivityPanel.module.css` 53ea47c6d780cd9d/51 837 · `package.json` 92a6404071e457cc/10 498.

## 2. B1/C1 — so bộ byte vòng 21 với vòng 20 (`dist/vong-20` = d34be2af…/2 248 088 B)

Giải nén hai bên vào `tests/tmp/t136/cmp20` và `cmp21`: 133 vs 133 entry, `onlyInRound20 []`, `onlyInRound21 []`, **đúng 1 tệp khác: `lib/client.js.map` 1f1d15524bcd3caa/404 958 → 5024364fefe8b73e/404 958**; `lib/client.js` giống tuyệt đối. Tarball nặng hơn 3 B chỉ vì map nén khác. ⇒ Không có entry ngoài dự kiến (điều kiện finding high của brief: KHÔNG xảy ra).

## 3. B2/C2 — tự giải VLQ (`tests/tmp/t136/probe.mjs`, codec tự viết, không dùng thư viện)

Bundle `lib/client.js` (offset tính trên tệp thật): `175618` '(' → sinh 1919:2566 → nguồn **392:169**; `175646` '(' → 1919:2594 → **392:172**; **`175647` 'D' của `DependencyMap` → 1919:2595 → 392:177**; `175795` '(' → 1919:2743 → **392:322**; **`175796` 'A' của `AddMemberControl` → 1919:2744 → 392:327**; `175899` `orderDelegationMembers` → 1920:27 → 393:55.
Đối chiếu nguồn `lib/client/ActivityPanel.js:392`: cột 172/177/322/327 đúng là `_jsx`/`DependencyMap`/`_jsx`/`AddMemberControl`. Map vòng 20 trả cả hai về **392:179** (`identAtOrigin "pendencyMap, "` / `"pendencyMap, { t"`) ⇒ sai vị trí đúng như V20-F1 mô tả.
Phân bố khác biệt: `mappings` hiện hành sha256 `75443a5fa7607de6…` (114 429 ký tự, 21 354 segment, 3 212 dòng sinh) ≠ map cũ `b6fd506ae128272c…`; **762 segment khác, min/max dòng sinh 1919–1941**, histogram 1910-1919:30 · 1920-1929:192 · 1930-1939:509 · 1940-1949:31 ⇒ mọi thay đổi nằm trong đúng vùng panel bị quay, phần còn lại của map giống tuyệt đối.

## 4. B2b — chứng minh nguồn gốc map bằng DỰNG LẠI (phép mạnh nhất của vòng)

Copy nguồn `packages/dsh-agent-teams/{lib,build,package.json}` sang `tests/tmp/t136/buildcheck` + junction `node_modules`, chạy `node build/build.mjs` (esbuild + `css-module-plugin`, ghi `lib/client.js` + `lib/client.js.map`):

- `lib/client.js` dựng lại = **377bcea2394cc0ac / 258 432 B** — TRÙNG byte với tệp trong gói (`bundleIdentical=true`).
- `lib/client.js.map` dựng lại = **5024364fefe8b73e / 404 958 B** — TRÙNG byte với tệp trong gói (`mapIdentical=true`), `mappings` sha `75443a5fa7607de6…`, `sources[2]="../lib/client/ActivityPanel.js"`, `sourcesContent[2]` sha `9596333059c68b80` (= đúng tệp panel hiện hành).
⇒ Bản đồ trong gói **là sản phẩm của pipeline thật**, không phải sửa tay; rủi ro "bundle sửa tay" của vòng 20 hết hiệu lực về mặt sourcemap. Repo KHÔNG bị ghi: sau khi dựng, `lib/client.js` vẫn 377bcea2, `lib/client.js.map` vẫn 5024364f.

## 5. B3/C3 — `t130-pack.mjs` ghim map CŨ ⇒ đỏ vĩnh viễn

`packages/dsh-agent-teams/tests/t130-pack.mjs:383` ghim `'lib/client.js.map': { sha16: '1f1d15524bcd3caa', bytes: 404958 }`. Chạy plain: **EXIT 1**, nguyên văn `FAIL  A2 frozen table 13 rows re-measured at run time` + `12/13 rows match (measured 2026-11-01T03:05:41.902Z) | DIFF lib/client.js.map [frozen] applies=true shaApplies=false bytesFrozen=404958 bytesActual=404958 delta=+0 shaFrozen=1f1d15524bcd3caa shaActual=5024364fefe8b73e`; các A3/A4/A5/A6/A7/A8 vẫn PASS.
Vì t134 đã sinh lại map, suite này ĐỎ VĨNH VIỄN. ĐỀ XUẤT (không sửa — `tools/**` và `packages/**` ngoài quyền ghi của audit): thêm `t130-pack.mjs` vào LEGACY của `tools/sweep-suites.mjs` kèm citation `packages/dsh-agent-teams/tests/t130-pack.mjs:383`, hoặc cập nhật pin sang 5024364f ở vòng sau.

## 6. B4 — 4 phép đột biến (chỉ trên bản sao `tests/tmp/t136/pkg`; mọi phép phục hồi byte-identical, `repoUntouched`=true)

| # | Kiểu (mới) | Tệp/dòng gốc | delta | sha sau | Suite đỏ & nguyên văn |
|---|---|---|---|---|---|
| M1 | Đặt lại ARTEFACT CŨ cùng số byte nhưng sai ngữ nghĩa | `lib/client.js.map` ← map vòng 19 (1f1d1552, 404 958 B) | 0 B | 1f1d15524bcd3caa | t128 EXIT 1: `FAIL M2 — V20-F1: the mappings belong to the CURRENT source, so they differ from the recorded before/ map…` · `FAIL M4 — V20-F1: decoding the SHIPPED mappings lands exactly on the identifier it describes (… 392:177, … 392:327, … 393:55)` |
| M2 | Hoán vị 2 call site trong BUNDLE (mỗi mảnh cắt trọn element, `) , ` giữ nguyên) | `lib/client.js` vùng 175 647–175 898 | 0 B | d78b099ab8a044c8 | t10 EXIT 1: `FAIL panel order: DependencyMap < AddMemberControl < member list :: DependencyMap above the member list @175743 must precede AddMemberControl above the member list @175647` + `FAIL bundle identity matches the pinned sha256 + bytes :: sha256 d78b099a… != 377bcea2…` + `TOTAL 50 checks, 48 passed, 2 failed` |
| M3 | Sửa 1 segment VLQ trong `mappings` giữ NGUYÊN độ dài chuỗi | `lib/client.js.map` segment của 1919:2595 | 0 B | b3549a76d9dff29a | t128 EXIT 1: `# 15/16 passed, 1 failed` + `# mapping (shipped): DependencyMap bundle=1919:2595 -> source=392:176 identAtOrigin="(DependencyMa" ok=false` (lệch lan các segment sau trên cùng dòng: 392:326, 393:54) |
| M4 | Đổi NHÃN `sources[2]` thành tệp không tồn tại (cùng độ dài) | `lib/client.js.map` `sources[2]` | 0 B | c4a0f37e9317f056 | t128 EXIT 1 với 2 lỗi độc lập: `FAIL M1 — the sourcemap still names ../lib/client/ActivityPanel.js as sources[2] and carries the panel verbatim` + `FAIL M2 — V20-F1: …` |

Cổng nào bắt gì: t128 bắt M1/M3/M4 (kể cả khi delta 0 B và chuỗi dài bằng nhau); t10 bắt M2 **bằng hai đường độc lập** (hash pin + cổng thứ tự tự đếm offset) — nên phép hoán vị không thể lọt chỉ vì ai đó cập nhật pin. t10 MÙ với M1/M3/M4 (chỉ đọc bundle), t128 KHÔNG kiểm pin sha tarball — hai cổng bù nhau, không thay nhau.
Hai lỗi HARNESS của chính audit (khai thẳng, không dùng làm bằng chứng): (1) runner truyền `t128-M1` làm tên tệp ⇒ `Cannot find module …/suites/t128-M1.mjs` (4 phép đầu đỏ giả vì MODULE_NOT_FOUND), sửa bằng `name.split('-')[0]`; (2) lần đầu M2 cắt giữa biểu thức (marker thiếu tiền tố `(0, `) ⇒ bundle sai cú pháp, t10 chết ở `vm.Script` (`SyntaxError`), sửa bằng cách cắt trọn element.

## 7. B5 — sweep (`node tools/sweep-suites.mjs --run` → `tests/tmp/t136/sweep-run.log`)

`summary: PASS=54 FAIL=0 LEGACY=9 UNCLASSIFIED=0 skipped(live)=9 WARN=0 WARN_FIXTURE=1 DRIFT=0` · tool exit **0** · `boot sessions executed: 7` · exceptions source: embedded. 54+9+9 = 72 = đúng số `tests/t*.mjs` trên đĩa ⇒ **FAIL=0, không có hồi quy thật**. 9 LEGACY đều kèm citation + lý do artefact lịch sử (t35:39, t84:51, t88:57, t92:57, t96:57, t100:57, t104:58, t108:59, t118:49 — dòng cuối đã cập nhật theo V20-F3).

## 8. B6 — 8 suite audit TỰ CHẠY trên repo thật

| Suite | Kết quả |
|---|---|
| `tests/t10-ui-bundle-smoke.mjs` | EXIT 0 — `TOTAL 50 checks, 50 passed, 0 failed` |
| `tests/t128-panel-order.mjs` | EXIT 0 — `# 16/16 passed, 0 failed` |
| `tests/t129-pins.mjs` | EXIT 0 — `# 13/13 passed, 0 failed` |
| `tests/t98-render-coverage.mjs --strict` | EXIT 0 — `SUMMARY tools=16 fields=112 reached=105 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 payload_contract_failures=0 allow_listed=7 allow_list_line_problems=0 payload_control_applies=true source_copy_control_applies=true roster_invariant_problems=0` + `verdict GREEN` |
| `tests/t107-removed-members-visible.mjs` | EXIT 0 — `# 13/13 passed, 0 failed` (có `ok 13 f1 the real ERP team.json is untouched`, sha 9f7420b6…) |
| `tests/t113-roster-assertion.mjs` | EXIT 0 — `# 38/38 passed, 0 failed` (roster.present=7, removed=7) |
| `tests/t114-source-freeze.mjs` | EXIT 0 — `# 16/16 passed` · `frozen=13 · helperRecords=13 · problemsOnDrift=2 · problemsOnBadPin=2` |
| `tests/t115-check-contract.mjs` | EXIT 0 (g1 exit=0 verdict=PASS; a2/i2 đúng) |

## 9. Findings vòng 21

- **V21-F1 (low, nhiễu cổng)** — `packages/dsh-agent-teams/tests/t130-pack.mjs:383` ghim `lib/client.js.map` 1f1d1552 trong khi nguồn là 5024364f ⇒ suite vòng 20 ĐỎ VĨNH VIỄN; tệ hơn, `tools/sweep-suites.mjs` chỉ quét `tests/t*.mjs` ở gốc repo (72 tệp) nên **suite pack nằm trong `packages/dsh-agent-teams/tests/` không bao giờ xuất hiện trong bảng sweep** — cổng đỏ này vô hình với cổng chất lượng. Tái hiện: `node packages/dsh-agent-teams/tests/t130-pack.mjs` → EXIT 1, dòng `DIFF lib/client.js.map [frozen] … shaFrozen=1f1d15524bcd3caa shaActual=5024364fefe8b73e`. Đề xuất: LEGACY + citation, và/hoặc mở phạm vi sweep sang `packages/*/tests`.
- **V21-F2 (low, tài liệu)** — `docs/bao-cao-agent-teams.md:36` (bảng "môi trường dogfood") vẫn ghi `lib/client.js.map` `1f1d15524bcd…`/404 958 B, trong khi bản hiện hành là `5024364fefe8b73e`/404 958 B (đổi ở t134); cùng lớp V17-F1. Tái hiện: `grep -n 1f1d1552 docs/bao-cao-agent-teams.md`.
- **V21-F3 (low, độ mạnh cổng)** — không cổng nào chứng minh `mappings` do build sinh: `tests/t128-panel-order.mjs:255-261` chỉ đòi "mappings ≠ bản before/ + cùng độ dài + names/version/sources bằng nhau", nên một bản sửa tay **đúng cột** trong vùng khác sẽ lọt. Vòng này tôi phải tự dựng lại (`§4`) mới chứng minh được nguồn gốc. Đề xuất (không chặn): thêm bước "rebuild trong bản sao rồi so sha" vào suite pack của vòng, coi là acceptance hạng nặng.
- **V21-F4 (info, thông điệp)** — `tests/t10-ui-bundle-smoke.mjs` khuyên `rebuild with node build/build.mjs from packages/dsh-agent-teams`; `build/build.mjs:6` dùng `process.cwd()` nên chạy từ sai thư mục sẽ ghi bản dựng vào chỗ khác. Không sai, chỉ dễ sẩy — nên nói rõ "cd packages/dsh-agent-teams" trong thông điệp.
- **V21-F5 (info, cổng)** — sweep có thêm bộ đếm `WARN_FIXTURE=1`; cổng vẫn exit 0 nên không ảnh hưởng, nhưng cần ghi vào docs công cụ để người đọc không nhầm là "có cảnh báo bị bỏ qua".

## 10. Điều kiện hết hiệu lực (verdict gắn với đúng bộ byte)

- Mốc: `2026-11-01T04:54:09.155Z` · tarball `6db464d19428d9f9…f2a0c4` / **2 248 091 B** / **133 entry**.
- Verdict HẾT hiệu lực ngay khi: (a) artefact bị pack lại, di chuyển hay đổi 1 byte; (b) bất kỳ tệp nào trong 13 tệp FROZEN đổi 1 byte — đặc biệt **`lib/client.js` 377bcea2394cc0ac/258 432** hoặc **`lib/client.js.map` 5024364fefe8b73e/404 958** (kể cả sửa tay hay dựng lại bằng esbuild phiên bản khác); (c) `packages/dsh-agent-teams/build/build.mjs` hoặc `build/css-module-plugin.mjs` đổi (vì §4 dựa vào chúng); (d) `lib/client/ActivityPanel.js` đổi (sourcesContent[2] phải khớp); (e) profile `agent-teams-pack20` bị cài đè/trỏ sang đường dẫn khác.
- Riêng phần panel: mọi thay đổi `lib/client/ActivityPanel.js:392` hoặc vùng bundle offset 173 533–181 976 phải chấm lại bằng `t10 + t128 + t129`, cộng thêm phép dựng lại ở §4.

## 11. Limitations tự khai

- Trần "lượt chạy suite ≤12" của brief bị VƯỢT: 2 baseline (t10, t128) + 4 phép đột biến + 4 lần chạy lại sau khi sửa lỗi harness + 1 lần chạy lại M2 + 8 suite bắt buộc = **19 lượt**. Nguyên nhân: (i) 4 phép đầu đỏ giả vì lỗi tên tệp trong runner của tôi, (ii) M2 cắt sai biên element. Không lượt nào trong số đó là bằng chứng sản phẩm sai; số liệu dùng để chấm là các lượt sạch ở §6–§8.
- Hai phép đo của tôi bị đỏ giả vì gọi SAI TÊN TỆP (`tests/t107-removed-visibility.mjs`, `tests/t113-add-member.mjs` — tên thật là `t107-removed-members-visible.mjs`, `t113-roster-assertion.mjs`), đã chạy lại đúng và xanh.
- Không chạy lại phép tamper `--analyze` của captain (brief cấm lặp) và **không chạy boot nào** (0/2 trần): thứ tự panel và render đã được chứng minh bằng suy luận mã (children là mảng, `jsxs` render theo mảng) + t10/t128/t129 + dựng lại §4.
- Mutation chỉ trên bản sao; cây nguồn `packages/dsh-agent-teams/lib` được đo lại sau mỗi phép (`repoUntouched` = true, sha cuối 377bcea2/5024364f).
