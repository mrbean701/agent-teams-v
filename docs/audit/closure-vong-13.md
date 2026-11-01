# Audit closure vòng 13 (t97) — chấm tarball t96 · render roster `edit_plan` (BUG-024) · cổng log

Người chấm: **audit-goat** (độc lập, không viết mã) · attempt `10fa6b31-e3a0-4f3c-a56e-4abc3564ab03` · 2026-10-31T22:38:49.370Z
Đối tượng: `packages/dsh-agent-teams/tests/tmp/t96/nami-dsh-agent-teams-0.2.0-dev.0.tgz` + nguồn hiện tại của `packages/dsh-agent-teams`.
Không dùng `--analyze` làm bằng chứng chính: mọi số dưới đây do audit tự đo bằng `node:crypto`, `tar -tzf`, giải nén và so từng tệp; script + JSON nằm ở `tests/tmp/audit-v13/`.

## §0. Verdict

**TARBALL t96 PHÁT HÀNH ĐƯỢC** — bộ byte trong gói khớp nguồn 133/133, khớp bản cài `agent-teams-pack13` 12/12, tái lập được bằng `npm pack` (cùng sha256), và 52/52 suite chạy thật đều xanh.
**CÔNG BỐ CHƯA** — còn 2 việc tài liệu/bảng task phải sửa trước khi phát: V13-F1 (`docs/TODO.md:4` còn trỏ tarball t88) và V13-F2 (bảng task còn treo `t93` khiến `dependency-report` ra `problems=1`). Không có phát hiện blocker/high nào trong mã.

Verdict gắn với bộ byte: 12 tệp đóng băng ở §2. **Hết hiệu lực** nếu `packages/dsh-agent-teams/lib/**`, `package.json` hoặc `cordis.patch.yml` đổi sau mốc pack `2026-10-31T22:28:51.740Z`, hoặc nếu ai pack lại (gói tên `t96` mới không còn là gói đã chấm).

## §1. Bảng C1..C8

| # | Việc phải chấm | Kết quả | Bằng chứng (tự đo) |
|---|---|---|---|
| C1 | Tarball: sha256, bytes, entry, 0 entry thư mục, tệp bắt buộc, rác | ĐẠT | `0b9220ea…c9e70` / 2 243 920 B · 133 entry / 0 dir · 13/13 tệp bắt buộc · rác 0 (node_modules 0, package/tests 0, .tgz lồng 0, .pid 0, package/tools 0) · `tests/tmp/audit-v13/measure.json` |
| C2 | 3 chiều nguồn ↔ payload ↔ bản cài, và quét **toàn bộ** tệp trong gói | ĐẠT | payload↔nguồn **133 same / 0 diff / 0 notInSource**; 12/12 ba chiều SAME với `C:/Users/thang/.dsh/profiles/agent-teams-pack13/node_modules/@nami/dsh-agent-teams` (không symlink, 0 dep / 24 peer) |
| C3 | Dựng lại bằng chứng render roster bằng tool THẬT | ĐẠT | boot `dsh.cmd --profile agent-teams-test` exit 0, session `session-386d4853-…`, text `agent_teams_edit_plan` in `alice (researcher; deepseek-official/deepseek-v4-pro (override))` (§3) |
| C4 | ≥3 mutation kiểu **chưa dùng** ở vòng 5–12 | ĐẠT | M1/M2/M3 (§4), mỗi phép đỏ đúng suite, phục hồi byte-identical |
| C5 | Chạy lại toàn bộ suite + cổng tài liệu | ĐẠT (có 1 cảnh báo cũ) | 51/52 suite exit 0, 1 suite `--analyze` cũ của `t84` exit 1 ở C22 (V13-F4) (§5); `check-doc-paths --summary` `files=5 paths=83 paths_missing=0 links=41 links_missing=0`; `check-logs --summary` exit 0 `problems=0`; `dependency-report` exit 0 nhưng `problems=1` (V13-F2) |
| C6 | Dữ liệu ERP không bị chạm | ĐẠT | `E:/Project/ERP/.agent-teams/erp-erp/team.json` `9f7420b6a1af…15f2d1e` / 1 533 117 B / mtime `2026-10-24T04:53:13.186Z` — y hệt trước và sau mọi mutation |
| C7 | `docs/bao-cao-agent-teams.md` khớp số đo; grep số cũ = 0 | ĐẠT (1 số lịch sử tự khai) | `:36,:38,:39,:50-:56` khớp đúng hash/bytes/entry hiện tại; `9be217b1`=0, `2243224`=0, `paths=65/71/75`=0 trong bao-cao; `0adbc64e` chỉ còn ở `:53` và `:140` dưới nhãn **bị thay thế** (lịch sử, hợp lệ); `:125` còn số cũ 78 đường dẫn — tự khai là ảnh chụp t85 (V13-F3) |
| C8 | Verdict + findings + điều kiện hết hiệu lực | ĐẠT | §0, §8, §9 |

## §2. Số đo độc lập

Tarball t96 (`measure.mjs`): sha256 `0b9220eabbc4584fc3c4d925816bfc54f80989eaca0d62fee4940a54172c9e70`, `2 243 920 B`, mtime `2026-10-31T22:28:51.740Z` — mới hơn mọi tệp nguồn (tệp nguồn mới nhất `lib/tools.js` `2026-10-31T22:26:14Z`), tức gói được pack sau bản vá t94.
`npm pack` lại vào `tests/tmp/audit-v13/repack/` cho **cùng sha256 + cùng size** (`sameAsT96=true`) ⇒ pack tất định.
12 tệp đóng băng (đo lại sau toàn bộ mutation, khớp bảng của captain):
- `lib/tools.js` `6150b7b287cb…`/199 872 B · `lib/members.js` `4f818b73803d…`/100 367 B · `lib/state.js` `7b49f5ab1d46…`/56 282 B
- `lib/snapshot.js` `a2a87e1b0c0b…`/13 986 B · `lib/index.js` `2d28e617f068…`/45 315 B · `lib/tool-names.js` `e3def5db908d…`/808 B
- `lib/client.js` `9da18d9971a2…`/258 432 B · `lib/client.js.map` `bbf88608f54e…`/404 958 B · `lib/client/ActivityPanel.module.css` `53ea47c6d780…`/51 837 B
- `lib/types/members.d.ts` `c53250ab41bf…`/31 769 B · `lib/types/snapshot.d.ts` `962f99a7bcb1…`/7 627 B · `package.json` `92a6404071e4…`/10 498 B
Nguồn `lib/**` có 79 tệp; 0 tệp nguồn thiếu trong gói. Bản cài pack13 có 133 tệp, `name @nami/dsh-agent-teams`, `version 0.2.0-dev.0`.
Kiểm lại lời khai `docs/bao-cao-agent-teams.md:35` (profile agent-teams-test là symlink): **ĐÚNG** — `lstat().isSymbolicLink()=true`, realpath trỏ `E:\Project\Agent-Team\packages\dsh-agent-teams`; `package.json` của profile khai `link:` nên boot chạy đúng nguồn hiện tại.

## §3. Boot thật — BUG-024 đóng trên đường tool

Lệnh: `dsh.cmd --profile agent-teams-test --json -` (prompt qua stdin), cwd `tests/tmp/audit-v13/boot-ws`; exit 0 sau 12 368 ms, **session mới** `session-386d4853-acd9-4e48-a45a-88f0cbcaeca0` (không dùng lại session của member).
Ba tool gọi thật, theo thứ tự: `agent_teams_create` → `agent_teams_set_member_route` → `agent_teams_edit_plan`, cả ba `completed`. `set_member_route` trả: “Member “alice” route is now deepseek-official/deepseek-v4-pro, reasoning high — saved; it takes effect the next time this member starts.”
Text **nguyên văn** của `agent_teams_edit_plan` (250 B, 4 dòng):
```
Staged plan updated atomically (2 members, 1 tasks, 0 dependencies). No members were spawned and no tasks were scheduled.
t1: probe task -> bob
alice (researcher; deepseek-official/deepseek-v4-pro (override))
bob (qa; opencode-go/deepseek-v4.1-flash)
```
`team.json` sau đó có `routeOverride {provider deepseek-official, model deepseek-v4-pro, reasoningEffort high, source captain, at 1793486002830, by session-386d4853-…}` trong khi spine khai báo của alice vẫn `opencode-go/kimi-k2.7-code`; `declaredLeak=false` ⇒ dòng roster là route HIỆU LỰC, không phải spine ⇒ t94 (và t90 trước đó) đóng đúng BUG-024, tái lập độc lập với bằng chứng của member.

## §4. Mutation của audit (3 phép, kiểu chưa dùng ở vòng 5–12)

| Mã | Kiểu | Tệp:chỗ sửa | Δ byte | sha trước → sau | Suite đỏ | Phục hồi |
|---|---|---|---|---|---|---|
| M1 | Đảo thứ tự hai nguồn trong mảng văn bản của `render` | `lib/tools.js` `const body = [...value.graph, ...value.roster]` → `[...value.roster, ...value.graph]` | 0 | `6150b7b287cb` → `abba894daebb` | `t94` EXIT 1 (7/9): `not ok 4 d1 roster lines follow the graph in updated.members order`, `not ok 8 h1 the pre-t94 expression is gone` — `t90` vẫn 10/10 | sha `6150b7b287cb` identical=true |
| M2 | Ép hàm dùng chung trả `undefined` | `lib/members.js` thêm `return undefined;` ngay đầu `export function selectionFromMember(member) {` | +22 | `4f818b73803d` → `eafd401a166f` | `t86` EXIT 1 (4/8: a1,a2,d3,c1) · `t90` EXIT 1 (4/10) · `t94` EXIT 1 (7/9) | sha `4f818b73803d` identical=true |
| M3 | Bỏ nhánh tóm tắt trong điều kiện của `render` | `lib/tools.js` `body.length === 0 ? summary :` → `body.length === 0 ? “” :` | −5 | `6150b7b287cb` → `a161319fa4e4` | `t94` EXIT 1 (8/9): `not ok 7 g1 an empty body adds no blank line and no trailing newline` — `t90`/`t50` vẫn xanh | sha `6150b7b287cb` identical=true |

Cả ba phép đều `applies=1` (in ra số lần khớp trước khi ghi) và đều được phục hồi từ bản sao trong `tests/tmp/audit-v13/backup/`, xác nhận bằng sha256 **và** số byte. Sau phục hồi: `t94` 9/9, `t90` 10/10, `t86` 8/8 — xanh lại. Guard đóng băng sau cùng: 12/12 khớp §2, tarball vẫn `0b9220ea`/2 243 920 B, ERP không đổi.

## §5. Hồi quy: 52/52 suite chạy thật

`sweep.mjs` chạy từng tệp `tests/*.mjs` bằng node thật, ghi exit code từng suite (`sweep.json`): **31 suite thuần + 21 suite `--analyze`** ⇒ **51/52 exit 0**; duy nhất `t84-pack --analyze` exit 1 ở C22 (run cũ sinh trước bản vá, V13-F4).
Điểm nhấn: `t3` 18/18 · `t4` 22/22 · `t10` 48/48 · `t15` 21/21 · `t20` 15/15 (hash ERP khớp) · `t24` 12/12 · `t28` 20/20 · `t30` 8/8 · `t37` 14/14 · `t38` 17/17 · `t39` 11/11 · `t40` 20/20 · `t43` 19/19 · `t44` 11/11 · `t46` 15/15 · `t48` 6/6 · `t49` 16/16 · `t50` 11/11 · `t54` 14/14 · `t56` 20/20 · `t57` 29/29 · `t58` 23/23 · `t62` 27/27 (sàn `:focus-visible 21 · :hover 16 · :disabled 12 · :active 4`) · `t70` 16/16 · `t74` 24/24 · `t77` 18/18 · `t86` 8/8 · `t87` 8/8 · `t90` 10/10 · `t93` **20/20** · `t94` 9/9; `--analyze`: `t96` **24/24** · `t88`/`t92` drift=0 · `t84` EXIT 1 ở C22 (V13-F4) · `t11` C1..C8 (11 checks) · `t18` **C1..C9** · `t21` **A1..A7** · `t27` C4c · `t29` C5 · `t35` C7 · `t42` C9 · `t45` C7 · `t51` C6 · `t52` drift=0 · `t59` PASS · `t63`/`t68`/`t72`/`t75`/`t78` marker+d.ts · `t82` C6.
Minh bạch: lượt sweep đầu tự dò thư mục artifact và trỏ nhầm vào `<run>/workspace` cho `t18`/`t21` nên hai suite đỏ (lỗi của script audit, không phải của sản phẩm); chạy lại với đúng run dir (`tests/tmp/e2e-hotswitch/2026-10-31T14-34-11`, `tests/tmp/e2e-addmember/2026-10-31T17-10-25`) ⇒ **exit 0**, `proved C1..C9` và `proved A1..A7`.
Quét tĩnh 52 tệp `tests/*.mjs`: 0 `.skip(`, 0 `catch {}` rỗng; các chuỗi `process.exit(0)` chỉ nằm trong payload probe nhúng (t42/t52/t63/t68/t72/t75/t78/t84/t88/t92/t96) — không phải đường thoát của suite.

## §6. Cổng log `tools/check-logs.mjs`

A. Header `docs/TODO.md` **không** khai vòng ⇒ exit 1, `SUMMARY logs=7 ok=7 fail=0 warnings=0 problems=1 newest_round=missing`.
B. Thêm `--allow-missing-round` ⇒ exit 0, `warnings=1`, ghi rõ `skipped (--allow-missing-round)`.
C. Header khai vòng 13 + log vòng 13 ⇒ exit 0, `newest_round=13`.
D. Giữ nguyên log vòng 13 nhưng header khai vòng 77 ⇒ exit 1, `problems=4` ⇒ vòng được đọc từ header, **không hardcode**, phép kiểm độ mới sống.
E. Mục rỗng trong `BA.md` ⇒ exit 1, `problems=1`.
R. Repo thật (verify command `node tools/check-logs.mjs --summary`) ⇒ exit 0, `logs=7 ok=7 fail=0 warnings=3 problems=0 newest_round=12 newest_task=97`; 3 cảnh báo là do TEST/BUG/HANDLE xếp theo ID (vòng 2/7/3) chứ không phải thiếu vòng. Lưu ý hệ quả: cổng chỉ đỏ khi log **cũ hơn** header (`tools/check-logs.mjs:186-188`), nên hôm nay header 12 qua; **khi V13-F1 sửa header thành 13 thì `BA.md` và `ACTIVITY.md` (đang dừng ở vòng 12) sẽ đỏ** nếu không thêm mục vòng 13 (`CHECK.md` đã có, `AUDIT.md` có mục này).

## §7. Tài liệu & bảng task

`docs/bao-cao-agent-teams.md` (154 dòng) khớp số đo hiện tại ở các điểm người vận hành đọc: `:36-:39` hash/bytes `tools.js 6150b7b287cb/199 872`, `members.js 4f818b73803d/100 367`, `client.js 9da18d9971a2/258 432`, `map bbf88608f54e/404 958`, CSS `53ea47c6d780/51 837` (141 lớp); `:49-:56` §2.3/§2.4 trỏ đúng tarball t96 `0b9220ea…`/2 243 920 B/133 entry và ghi rõ “ĐANG CHỜ AUDIT VÒNG 13”; `:95-:105` bảng case khớp từng con số audit đo lại (t93 20/20, t96 24/24, t18 9/9, t21 7/7, t11 11/11, …); `:108-:109` 97 hàng TODO + `tasks=97 realEdges=99 derivedEdges=106 waves=44`; `:110` 32 kỳ Telegram — đếm lại: 32 tệp, **32/32 có message id**.
`docs/TODO.md`: **97 hàng, 97 id, 0 trùng** (đếm bằng regex trên thân bảng); trạng thái đo được `VERIFIED=90 · CANCELLED=4 · SUPERSEDED=2 (t66→t69, t93→t96) · OPEN=1 (t97)` — khớp dòng đếm `:4`. Riêng **con trỏ tarball trong `:4` còn trỏ t88** (V13-F1).
`tools/dependency-report.mjs` exit 0 nhưng `problems=1`: “t96 da completed nhung cha t93 van pending (pack)” — bảng task còn treo `t93` ở `pending` trong khi `docs/TODO.md:141` đã ghi `SUPERSEDED → t96` (V13-F2). Lưu ý: chạy tool này **ghi đè** `docs/DEPENDENCIES.md` (ngoài phạm vi ghi của audit) — V13-F5.

## §8. Findings

| ID | Mức | Vấn đề | Tệp:dòng | Cách tái hiện | Chủ sở hữu / cách sửa |
|---|---|---|---|---|---|
| V13-F1 | medium | Con trỏ phát hành trong header TODO còn trỏ tarball t88 (`0adbc64e…`/2 243 224 B) và còn câu “vòng 12 là vòng ĐÃ ĐÓNG gần nhất”, trong khi thân bảng `:144` đã ghi t96 VERIFIED. Người vận hành đọc dòng 4 sẽ cài bản **thiếu vá BUG-024** (t90/t94). | `docs/TODO.md:4` | `node -e “…”` đọc dòng 4 so với `:144`; hoặc `grep 0adbc64e docs/TODO.md` | dev-ui-goat/captain: trỏ t96 + ghi “chờ verdict vòng 13”, sau verdict này trỏ t96 là bản phát hành; **đổi header sang 13 thì phải thêm mục vòng 13 cho `docs/log/BA.md` + `docs/log/ACTIVITY.md`** kẻo cổng log đỏ |
| V13-F2 | medium | Bảng task còn treo `t93` ở `pending` dù con `t96` đã completed ⇒ cổng sức khoẻ tài liệu hết `problems=0`. | board `t93` (không phải tệp) `/ docs/TODO.md:141` | `node tools/dependency-report.mjs` ⇒ `problems=1`, dòng `PROBLEM: t96 da completed nhung cha t93 van pending (pack)` | captain: đánh dấu t93 `SUPERSEDED`/`cancelled` trên board rồi chạy lại tool |
| V13-F3 | low | Số đo đường dẫn trong báo cáo còn là ảnh chụp t85: ghi “78 đường dẫn / 41 link”, đo hiện tại `paths=83 links=41` (tool tự khai “chưa làm mới”). | `docs/bao-cao-agent-teams.md:125` | `node tools/check-doc-paths.mjs --summary` ⇒ `files=5 paths=83 paths_missing=0 links=41 links_missing=0` | dev-ui-goat: cập nhật số hoặc bỏ con số khỏi câu |
| V13-F4 | low | `t84-pack.mjs --analyze` trên chính 3 run cũ của nó vẫn exit 1 ở C22 (`SELF_MUTATION`) vì 3 `meta.json` sinh **trước** bản vá V11-F3 (thiếu khoá `selfMutation`). Không phải lỗi sản phẩm; t84 đã bị t96 thay thế. | `packages/dsh-agent-teams/tests/tmp/t84/run-*/meta.json` + `tests/t84-pack.mjs` (C22) | `node tests/t84-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t84/run-2026-10-31T21-24-44Z` ⇒ EXIT 1 | dev-build: chạy lại t84 live, hoặc cho C22 in “không áp dụng” khi `meta.selfMutation === undefined` (đề xuất từ vòng 12, chưa làm) |
| V13-F5 | info | `tools/dependency-report.mjs` ghi đè `docs/DEPENDENCIES.md` — ngoài phạm vi ghi của audit; repo không phải git nên không chứng minh được nội dung không đổi. | `tools/dependency-report.mjs` | chạy tool rồi `git status` ⇒ `fatal: not a git repository` | giữ nguyên; coi là công cụ sinh tài liệu, không phải cổng chỉ-đọc |
| V13-F6 | info | Session event `agent-teams/*` vẫn bị host bỏ (`KNOWN_SESSION_EVENT_TYPES` không khai) ⇒ audit trail thật là `team.json` + `docs/log/MODEL-SWITCH.md`, không phải transcript. | `lib/events.js:33-40` | đọc `lib/events.js` + `git`-less grep `KNOWN_SESSION_EVENT_TYPES` | ngoài tầm vá của plugin (phụ thuộc host); đã ghi trong báo cáo §5 |

## §9. Giới hạn của lượt audit này

1. Không bấm GUI sống (không có Chromium trong lượt này); bằng chứng UI là `t10` 48/48 + `t62` 27/27 + bundle 141 lớp, và bằng chứng tool là boot headless thật ở §3.
2. `--analyze` của các suite pack chỉ **chấm lại** `meta.json` do member ghi; audit chỉ dùng nó làm corroboration, mọi số chính đều tự đo từ đĩa.
3. Mutation chỉ chạm `lib/tools.js` + `lib/members.js` (2 tệp trong 12 tệp đóng băng); 10 tệp còn lại chỉ được đo hash, không bị sửa thử.
4. 24 `peerDependencies` do host cấp — audit không kiểm phiên bản host thật (`agent-teams-test` chỉ là profile nháp).
5. Verdict này chấm **mã + gói**, không chấm việc công bố (Telegram/khoá tarball) — việc đó thuộc V13-F1/V13-F2.

## §10. Điều kiện hết hiệu lực

- Bất kỳ tệp nào trong 12 tệp đóng băng (§2) đổi ⇒ phải pack lại + audit lại.
- Có `npm pack` mới sau `2026-10-31T22:28:51.740Z` ⇒ gói tên `t96` không còn là gói đã chấm (dù cùng tên tệp, phải so sha256).
- `tools/check-logs.mjs` đổi logic đọc vòng ⇒ mục §6 phải chạy lại.
- Verdict chỉ áp cho `@nami/dsh-agent-teams 0.2.0-dev.0`; mọi bản `0.2.0` chính thức cần audit riêng.
