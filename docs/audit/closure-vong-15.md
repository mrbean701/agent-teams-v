# Closure vòng 15 — chấm tarball t104 (t105)

- Auditor: `audit-goat` (độc lập, KHÔNG viết mã sản phẩm). `reviewedTaskId: 't104'` · `attempt_id: 913f058c-d77f-456a-9637-3b30b63cd7b6`.
- Mốc chấm: `2026-10-31T23:39:06Z`. Phạm vi ghi: `docs/audit/closure-vong-15.md`, `docs/log/AUDIT.md`, `tests/tmp/audit-v15/**`.
- Bối cảnh: t102 vá ĐỌC (`lib/state.js`), t103 vá GHI (`lib/members.js`), t104 pack lại. Verdict vòng 14 (t100) đã hết hiệu lực đúng như điều kiện đã ghi.

## §0 Verdict

**TARBALL t104 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CHƯA.**

Lớp mã nguồn + artifact ĐẠT: bộ byte t104 trùng khít nguồn hiện tại (131 tệp so sánh, 0 diff), 12/12 tệp đóng băng ba chiều SAME, repack tất định, cổng render `--strict` XANH (`uncovered=0 nested_gaps=0 allow_listed=6`), 57/58 suite EXIT 0 (suite đỏ duy nhất là `t84 --analyze` trên meta.json lịch sử — V15-F1), hai bản vá provenance chứng minh được bằng mutation riêng của audit. CÔNG BỐ CHƯA vì tài liệu công bố còn chờ chính mục này và còn 2 finding low phải vá (V15-F1, V15-F2).

## §1 Bảng tiêu chí

| # | Tiêu chí | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| C1 | Tự đo tarball t104 bằng `node:crypto` + `tar` (không dùng `--analyze`) | ĐẠT | §2 — sha/bytes/entry/0 dir/rác 0/13 tệp bắt buộc/self-extract OK |
| C2 | Ba chiều nguồn ↔ payload ↔ bản cài + quét TOÀN GÓI | ĐẠT | §2 — 131/131 tệp payload = nguồn; 12/12 ba chiều SAME với `agent-teams-pack15` |
| C3 | Mutation riêng của audit cho CẢ HAI bản vá provenance, kiểu khác captain | ĐẠT | §3 — M1 (đọc, `state.js`) + M2/M3/M4b (ghi, `members.js`) |
| C4 | ≥3 mutation kiểu CHƯA dùng ở vòng 5–14 | ĐẠT | §3 — 3 kiểu mới (nới biên regex · mở rộng allowlist đóng · hoán vị danh sách in trong thông điệp; thêm kiểu đổi giá trị mặc định) |
| C5 | Chạy lại toàn bộ suite + công cụ tài liệu | ĐẠT | §4 — 58 suite, 57 EXIT 0; `check-logs` problems=0 · `check-doc-paths` missing=0 · `dependency-report` problems=0 |
| C6 | ERP không đổi | ĐẠT | §2 — `9f7420b6…`/1 533 117 B/mtime cũ, đo trước và sau toàn bộ mutation |
| C7 | Hồ sơ tài liệu khớp số đo + findings + điều kiện hết hiệu lực | ĐẠT (2 finding low còn mở) | §5, §6, §7 |

## §2 Số đo tarball t104 (tự đo, `tests/tmp/audit-v15/measure.json`)

- Đường dẫn: `packages/dsh-agent-teams/tests/tmp/t104/nami-dsh-agent-teams-0.2.0-dev.0.tgz` — sha256 `771298f33c08abf6133cb4b087bd9a2c644e97a4756c46b2b997101d70d53b0d`, **2 246 406 B**, mtime `2026-10-31T23:32:02.547Z`.
- `tar -tzf` (đã strip CRLF): **133 entry**, **0 entry thư mục**, 133 tệp; 13/13 tệp bắt buộc có mặt (`package.json`, `cordis.patch.yml`, `lib/index.js`, `lib/tools.js`, `lib/members.js`, `lib/state.js`, `lib/snapshot.js`, `lib/client.js`, `lib/client.js.map`, `lib/tool-names.js`, `lib/types/members.d.ts`, `lib/types/snapshot.d.ts`, `lib/client/ActivityPanel.module.css`).
- Rác: `node_modules` 0 · `package/tests` 0 · `.tgz` lồng 0 · `.pid` 0 · `package/tools` 0 · 0 đường dẫn tuyệt đối rò trong `lib/**`.
- Giải nén + quét **toàn gói** so nguồn: 131 tệp so khớp, **0 diff · 0 notInSource**; nguồn `lib/**` 79 tệp, không tệp nào thiếu trong gói. Payload identity `@nami/dsh-agent-teams` `0.2.0-dev.0`, 0 `dependencies` / 24 `peerDependencies`.
- Ba chiều 12/12 SAME (source = payload = installed) với `C:/Users/thang/.dsh/profiles/agent-teams-pack15/node_modules/@nami/dsh-agent-teams` (`isSymlink=false`, 133 tệp, mismatch `[]`): `tools.js 5deb03ca93b2/205 239` · `members.js 50f558f8b207/102 260` · `state.js 56664c59ff40/57 508` · `snapshot.js a2a87e1b0c0b/13 986` · `index.js 2d28e617f068/45 315` · `tool-names.js e3def5db908d/808` · `client.js 9da18d9971a2/258 432` · `client.js.map bbf88608f54e/404 958` · `types/members.d.ts c53250ab41bf/31 769` · `types/snapshot.d.ts 962f99a7bcb1/7 627` · `ActivityPanel.module.css 53ea47c6d780/51 837` · `package.json 92a6404071e4/10 498`.
- Repack 1 lần: cùng sha256 + cùng bytes (`sameAsT104=true`), `sourceDriftAfterPack=[]` ⇒ pack tất định, không drift.
- ERP đối chứng: `E:/Project/ERP/.agent-teams/erp-erp/team.json` `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e` / 1 533 117 B / mtime `2026-10-24T04:53:13.185Z` — không đổi.

## §3 Mutation (4 phép; 3 kiểu mới so vòng 5–14; mọi phép phục hồi byte-identical)

| Mã | Kiểu (mới?) | Vị trí | Δ byte | sha256 trước → sau | Suite đỏ (case) | Phục hồi |
| --- | --- | --- | --- | --- | --- | --- |
| M1 | nới BIÊN của regex kiểm giá trị (MỚI) | `lib/state.js:670` `{0,63}$` → `{0,64}$` | 0 | `56664c59ff40` → `2f059a6940a9` | `tests/t102-erp-read-leniency.mjs` EXIT 1, đúng 1 case `b3` (refuse source 65 ký tự) | `56664c59ff40` identical |
| M2 | mở rộng ALLOWLIST ĐÓNG bằng giá trị lạ (MỚI) | `lib/members.js:1331` thêm `'erp'` | +7 | `50f558f8b207` → `7b6f449f099c` | `tests/t103-write-source-clamp.mjs` EXIT 1, 5 case: `a1`,`a2`,`a3`,`f1`,`e1` | identical |
| M3 | hoán vị thứ tự phần tử của danh sách IN trong thông điệp hợp đồng (MỚI) | `lib/members.js:1331` → `['profile','captain','http']` | 0 | `50f558f8b207` → `e648854613ab` | cùng suite EXIT 1, 5 case (regex `tests/t103-write-source-clamp.mjs:79` đòi đúng thứ tự `captain, http, profile`) | identical |
| M4b | đổi GIÁ TRỊ MẶC ĐỊNH của nhánh fallback (MỚI) | `lib/members.js:1340` `return 'captain'` → `return 'http'` | −3 | `50f558f8b207` → `4c93c4f5caf2` | `t103` EXIT 1, đúng 1 case `c1` (source thiếu vẫn phải mặc định `captain`) | identical |

- M4 thử đầu (`applies=0`) vì guard là 2 dòng — ghi lại để người sau không lặp; đã thay bằng M4b.
- Sau mọi phép: baseline và hậu phục hồi `t102` 17/17, `t103` 10/10, `t3` 18/18 đều EXIT 0; `t43` 19/19 xanh dưới M4b. Guard 12 tệp cuối cùng khớp bảng đóng băng của captain.
- Kiểu đã dùng ở vòng 5–14 (KHÔNG lặp lại): xoá rule CSS · `catalogRoutesOf`→`[]` · `--expect-sha256`→`if(false)` · xoá nhóm `:hover` · bỏ `source:` · `at = String(Date.now())` · strip `declaredUsable` · bỏ placeholder locale · bỏ tên tool · `last_failure`→`lastFailure` · `optional`→required · guard `if(false)` · tắt nhánh override · thêm 1 byte vào artifact · hoán vị trường spine · đảo nhánh fallback · đổi tên export · đảo graph/roster · `selectionFromMember`→`undefined` · bỏ nhánh summary · in trường allow-listed · thêm trường schema (dòng mới/cùng dòng) · render ném · `clipText`→rỗng.

## §4 Quét toàn bộ suite + công cụ tài liệu (`tests/tmp/audit-v15/sweep.json`)

- `tests/t*.mjs` trên đĩa: **58**. Đã chạy 58 = 34 plain + `t98 --strict` + 23 `--analyze`. **57 EXIT 0**, **1 EXIT 1** = `tests/t84-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t84/run-2026-10-31T21-24-44Z` báo `FAIL C22 SELF_MUTATION` (meta.json cũ thiếu khoá `selfMutation`) — V15-F1, không phải lỗi sản phẩm.
- Case đo được: `t102` 17/17 · `t103` 10/10 · `t98 --strict` GREEN (`SUMMARY tools=16 fields=110 reached=104 uncovered=0 nested_gaps=0 allow_listed=6 negative_control_applies=true`) · `t10` 48/48 · `t104-pack --analyze` EXIT 0.
- `node tools/check-logs.mjs --summary` → `logs=7 ok=7 fail=0 warnings=3 problems=0 newest_round=15 newest_task=105` (3 cảnh báo là xếp theo ID của TEST/BUG/HANDLE, không phải thiếu vòng).
- `node tools/check-doc-paths.mjs --summary` → `files=5 paths=90 paths_missing=0 links=41 links_missing=0`, EXIT 0.
- `node tools/dependency-report.mjs` → `tasks=105 realEdges=106 derivedEdges=116 waves=44 problems=0`.

## §5 Hồ sơ tài liệu

- `docs/TODO.md`: **105 hàng** `t1..t105`, **105 id duy nhất**, 0 trùng; mọi hàng đúng **6 cột** sau khi bỏ pipe escape (`\|`); header `:4` ghi `VERIFIED=98 · CANCELLED=4 (t9,t63,t64,t92) · SUPERSEDED=2 (t66→t69, t93→t96) · IN_PROGRESS=0 · OPEN=1 (t105)` — khớp thân bảng (94 VERIFIED thường + 4 in đậm = 98; 98+4+2+1 = 105). Lệch của V14-F1 đã được vá, các hàng `t87/t98/t105` đã nằm liền mạch trong bảng chính (V14-F2 vá xong).
- `docs/bao-cao-agent-teams.md` khớp số đo hiện tại: `:34-:38` hash `members.js/state.js` mới; `:49-:53` §2.3 nói ĐANG CHỜ AUDIT VÒNG 15, tarball `771298f3…` / 2 246 406 B; `:56` 133 entry; `:98` t104-pack 27/27; `:99` t102 17/17; `:100` t103 10/10; `:117` tasks=105/realEdges=106/derivedEdges=116/waves=44; `:130` `paths=90 links=41`; `:133` ghi số đo t104 là 90 đường dẫn / 41 link.
- Số cũ (`0adbc64e`, `2243224`, `0b9220ea`, `2243920`, `d7a8bce4`) chỉ còn trong các câu lịch sử (danh sách tarball cũ KHÔNG dùng) — hợp lệ, không phải trỏ nhầm bản phát hành.
- ALLOW_LIST của `tests/t98-render-coverage.mjs:93-130`: vẫn đúng 6 mục, mỗi mục có `file:dòng` + lý do thật, cổng đang `allow_listed=6` và XANH ⇒ map dòng chưa stale; cả 6 trường là duplicate-by-construction (reader đã giữ `id`/`attempt_id`; `status`/`deleted`/`applied` chỉ có một giá trị), entry `edit_plan.team_id` đã được chứng minh load-bearing ở vòng 14.

## §6 Findings

| Mã | Mức | Vấn đề | Tệp:dòng | Cách tái hiện | Chủ sở hữu / cách vá |
| --- | --- | --- | --- | --- | --- |
| V15-F1 | low | Suite `t84` đỏ khi chấm lại run lịch sử: `FAIL C22 SELF_MUTATION` vì meta.json cũ không có khoá `selfMutation` (đã chạy trước khi có cổng) | `tests/t84-pack.mjs:566-572` | `node tests/t84-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t84/run-2026-10-31T21-24-44Z` | đội pack: chạy lại `t84` live sau freeze, hoặc cho C22 in KHÔNG ÁP DỤNG khi `meta.selfMutation === undefined` |
| V15-F2 | low | Header TODO khai `IN_PROGRESS=0` trong khi card `t105` đang chạy | `docs/TODO.md:4` vs hàng `t105` `:113` | đọc 2 dòng, so trạng thái card | captain: cập nhật header khi mở/đóng vòng, hoặc bỏ hẳn số IN_PROGRESS |
| V15-F3 | info | `tools/dependency-report.mjs` ghi đè `docs/DEPENDENCIES.md` (ngoài phạm vi audit, repo không phải git nên không truy vết được) | `tools/dependency-report.mjs` | chạy lệnh rồi `git status` (không có repo) | captain: tách chế độ `--dry-run` hoặc ghi ra `tests/tmp` |
| V15-F4 | info | Event phiên `agent-teams/*` bị host bỏ khi không nhận dạng được, nên panel phải đọc đĩa | `packages/dsh-agent-teams/lib/events.js:33-40` | đọc khối `KNOWN_SESSION_EVENT_TYPES` + `return` sớm | đội plugin: xin host khai báo loại event, hoặc ghi rõ trong docs |
| V15-F5 | info | Bất đối xứng đọc/ghi provenance: đọc nhận `/^[a-z][a-z0-9:_-]{0,63}$/` còn ghi chỉ nhận 3 giá trị ⇒ `team.json` ERP có `source` lạ vẫn MỞ được nhưng plugin không bao giờ GHI LẠI được giá trị đó | `lib/state.js:670-672` vs `lib/members.js:1331` | tạo `team.json` có `durableSource: 'erp'`, đọc OK; gọi `agent_teams_set_member_route` với `source: 'erp'` ⇒ bị từ chối (thông điệp nêu 3 nguồn hợp lệ) | captain: ghi rõ giới hạn round-trip trong `docs/bao-cao-agent-teams.md` mục giới hạn |

## §7 Điều kiện hết hiệu lực

- Verdict này chỉ đúng cho **đúng bộ byte** `771298f3c08abf6133cb4b087bd9a2c644e97a4756c46b2b997101d70d53b0d` / **2 246 406 B** / **133 entry**, đo tại mốc `2026-10-31T23:39:06Z`.
- **Vô hiệu NGAY** nếu bất kỳ tệp nào trong `packages/dsh-agent-teams/lib/**` (hoặc 12 tệp đóng băng) đổi dù 1 byte sau mốc trên — đặc biệt `lib/state.js` hoặc `lib/members.js` (nguồn của hai bản vá vừa chấm) và `lib/tools.js`.
- **Vô hiệu** nếu pack lại: mọi tarball mới phải được chấm bằng một vòng audit mới, không được dùng lại verdict này.
- Không được sửa tay `t104`; người vận hành trước khi cài phải tự kiểm `sha256`, số byte và số entry như §2.

## §8 Giới hạn của lần chấm

- Không gọi provider/model thật: bằng chứng hành vi đến từ gói cài + suite + boot sẵn có của t104, không phải từ một lượt chạy LLM mới.
- Không kiểm panel Web UI bằng mắt (chỉ DTO/CSS tĩnh + cổng render `t98`).
- Mutation chứng minh suite ĐỎ đúng chỗ, không chứng minh độ phủ toàn bộ mã; các nhánh không có suite vẫn có thể sai.
- Không kiểm tính năng ngoài phạm vi 0.2.0-dev.0 (plugin chỉ chạy trên profile đã cài, không kiểm trên Host version khác).
