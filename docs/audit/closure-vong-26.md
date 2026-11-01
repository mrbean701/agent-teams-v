# Audit vòng 26 — opt-in `start_if_needed` (t158)

Mốc: **2026-11-01T11:14:09.560Z**. Người chấm: audit-goat (độc lập, không viết mã sản phẩm). Card: t158, reviewedTaskId t157.

## §0 Verdict

**TARBALL t157 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CÓ ĐIỀU KIỆN.** Không có finding high/blocker. Có **1 finding medium (V26-F1)**: cơ chế chống double-spawn đúng trong sản phẩm nhưng **suite duy nhất canh nó không bắt được việc bỏ khoá** — đã chứng minh khoá là thứ giữ (M6+M5), nên đây là lỗ hổng hàng rào hồi quy, không phải lỗi hành vi hôm nay.

## §1 Bộ byte tự đo (B1)

- Artefact: `packages/dsh-agent-teams/tests/tmp/t157/run-t157-a/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz` — sha256 **8ef366ede347eff4aa128d5216fe0600636fd89ba5a5ea011fe2c0abee6e3728** / **2 250 654 B** / mtime 2026-11-01T10:55:04.694Z. Khớp số captain công bố.
- `tar -tzf`: **133 entry / 0 entry thư mục**; rác 0 (node_modules 0, package/tests 0, .tgz lồng 0, .pid 0, package/tools 0).
- Giải nén độc lập rồi so TỪNG entry với nguồn `packages/dsh-agent-teams`: **133 same / 0 diff / 0 notInSource**; `lib/**` nguồn **79 tệp**, thiếu trong tarball **0**; 0 đường dẫn tuyệt đối.
- Repack 2 tiến trình riêng (npm pack → tests/tmp/t158/repack-a, repack-b): **cùng sha 8ef366ed… / cùng 2 250 654 B**. Bản `pack-b` của t157 và `dist/vong-26` cũng **cùng sha** (4 bản trùng).
- `E:/Project/ERP/.agent-teams/erp-erp/team.json` = 9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e / 1 533 117 B / mtime 2026-10-24T04:53:13.186Z — **không đổi** trong suốt lượt.
- tests/t*.mjs trên đĩa: 74 tệp.

## §2 Profile cài mới + bảng FROZEN (B2)

- Profile audit **tự cài** `C:/Users/thang/.dsh/profiles/agent-teams-rel26-audit` (trước đó không tồn tại) từ `file:` trỏ đúng tarball t157: `isSymlink=false`, **133 tệp**, version 0.2.0-dev.0, **0 dependencies / 24 peerDependencies**, `lockResolved` đúng đường dẫn pack-a.
- Ba chiều (source = payload = installed) **15/15 SAME**: 13 dòng FROZEN + `lib/client/ActivityPanel.js` 60f4476634d097dc/64 305 B + `lib/client/WorkspaceActivity.module.css` c7f2d5e5d295c40f/3 579 B.
- 13 dòng FROZEN đo lại từ đĩa: **13/13 khớp pin của t157-pack.mjs:395-407**. So bảng vòng 25 (`FROZEN_ROUND25`, :411-425): **đúng 2 dòng đổi** — `lib/tools.js` e51734baf4693cd3/213 715 → **642de17fb176c301/221 404**; `lib/types/tools.d.ts` 41cfc56576ed8ffd/7 546 → **258c8b6a827a0838/8 781**; **11 dòng còn lại byte-identical**, gồm `lib/client.js` 67d616a608c38ed3/258 925 và `lib/client.js.map` 718f41544f36ae51/405 694 (khớp khai báo của captain: panel không đổi).

## §3 Mutation (B3) — tất cả trên BẢN SAO `tests/tmp/t158/pkg`, phục hồi byte-identical

Baseline bản sao: t155 **11/11 EXIT 0**. Mỗi phép: restore từ `pristine/` → áp 1 phép → chạy `tests/tmp/t158/suites/t155.mjs` (bản sao t155, patch REPO_ROOT + LIB trỏ bản sao) → ghi log `tests/tmp/t158/logs/<M>.log`.

| # | Kiểu đột biến (mới so vòng 23–25) | sha16/bytes sau đột biến | Kết quả t155 |
| --- | --- | --- | --- |
| M1 | **đổi DEFAULT của cờ**: `args.start_if_needed === true` → `!== false` | 7dcd9db7ad655bbf / 221 405 (+1 B) | **EXIT 1, 9/11** — đỏ `a3 DEFAULT (no flag)…` và `a11 the flag is what makes the difference…` |
| M2 | **bỏ GUARD phiên đang sống**: `memberIsLive = false` | 39976a31bf46af13 / 221 293 (−111 B) | **EXIT 1, 9/11** — đỏ `a5 …not started a second time`, `a6 two CONCURRENT…` |
| M3 | **bỏ qua PRECEDENCE**: `delete member.routeOverride` trên dòng RAM trước `activateMemberNow` | 43af584469a99422 / 221 445 (+41 B) | **EXIT 1, 9/11** — đỏ `a4 …starts on the route just set`, `a10 ERP copy…` |
| M4 | **bỏ GHI DURABLE** sau start (xoá `await writeTeam(root, team)`) | 8adb903528c48a1b / 221 363 (−41 B) | **EXIT 1, 7/11** — đỏ `a4`, `a5`, `a6`, `a10` |
| M5 | **bỏ LỚP KHOÁ** của start: `withTeamLock(teamLockKey(...))` → `(async () => {...})()` (đóng đúng dòng 3327/3363) | 60fd2d63779b4ee3 / 221 382 (−22 B) | **EXIT 0, 11/11 XANH — KHÔNG cổng nào bắt** → **V26-F1** |

- Đối chứng dương cho M5 (đầu dò M6, **không phải đột biến sản phẩm**): chèn `await new Promise(r => setTimeout(r, 40))` ngay sau `readTeam` (tools.js:3328) trong bản sao. **M6 một mình** (còn khoá): t155 **11/11 EXIT 0** — khoá tuần tự hoá, đúng 1 phiên. **M6 + M5** (bỏ khoá): t155 **EXIT 1, 10/11**, nguyên văn `FAIL a6 two CONCURRENT flag calls produce exactly one session (withTeamLock serialises them)` + `a race must not open two sessions, got 2 | 2 !== 1` ⇒ **khoá LÀ thứ chống double-spawn**; suite hiện tại chỉ không nhìn thấy việc bỏ khoá vì stub của nó không tạo được cửa sổ đua.
- Sau toàn bộ: `pkg/lib/tools.js` = `pristine` = nguồn = **642de17fb176c301 / 221 404 B**; `pkg/lib/state.js` = **56664c59ff400319**; nguồn không bị ghi byte nào; sweep báo `DRIFT=0` trên 13 tệp FROZEN.

## §4 Rủi ro thật của việc plugin TỰ START (B4)

1. **Có thể spawn ngoài ý muốn không?** Chỉ có **một** đường: handler `agent_teams_set_member_route`, nhánh `if (args.start_if_needed === true && changed.cleared !== true)` (`lib/tools.js:1456`) gọi `runtime.startMemberOnDemand` (:1457) → `startMemberOnDemandNow` (:3322) → `activateMemberNow` (:3354). `activateMemberNow` chỉ có 2 call site: `lib/tools.js:3189` (add_member, có từ trước) và :3354. `add_member`, `send_message`, `reassign`, HTTP `/plan` **không** đi qua đường mới; `dispatchMember` với row có id vẫn chỉ `deliverToMember` (:537-545). Mặc định false được giữ bằng 4 assert: schema optional + mô tả `/Default false/` (a1); `starts.length === 0` + `value.started === undefined` + câu cũ kết thúc bằng `— saved; it takes effect the next time this member starts.` + KHÔNG có `started it now|was NOT started` (a3); và `member.id` cũ không bị đổi (a3).
2. **Double-spawn dưới 2 lời gọi song song?** Tuần tự: lời thứ hai trả `started:false` + `already has a live session (child-1)` (a5). Song song: đúng 1 phiên, 1 `started:true` + 1 `started:false` (a6). Cơ chế thật: `withTeamLock` là hàng đợi promise theo `team:<stateRoot>:<teamId>` (`lib/state.js:30-56`), giữ suốt thời gian spawn và chỉ nhả sau `writeTeam` (:3355) ⇒ lời thứ hai đọc lại team đã có id mới. **Đã chứng minh khoá là load-bearing** bằng M6+M5 (`got 2`), nhưng **suite không bắt được M5** (V26-F1).
3. **Guard `halted`/`staged`/`stopping`:** cả ba đọc TRONG khoá trên team vừa đọc lại (`:3336-3341`), nguyên văn: `team "<id>" is halted; resume it before starting a member` · `team "<id>" is still staged; members start only after approval` · `member "<name>" is stopping`; `activateMemberNow` kiểm lại lần nữa (`lib/members.js:1116-1127`). a7/a8/a9 xanh và **route vẫn được ghi** (`member.routeOverride.provider === p2`), tức guard chặn START chứ không chặn thay đổi route — đúng thiết kế.
4. **Cold-resume có mất route vì `routeOverride` bị xoá (`lib/members.js:1076`)?** **Không.** `spawnMember` ghi `member.provider/model` = route con đang chạy thật (:1070-1075) rồi mới xoá `routeOverride` (:1076); `setMemberRoute` đã xoá `fallbackActive`/`activeProvider`/`activeModel` (:1431-1444, :1472-1474) nên `routeOf` (:437-469: fallback > override > active > declared) rơi xuống nhánh `declared` = **đúng route vừa escalate**. a10 assert cả ba: `after.provider/model === p2/m2`, `after.routeOverride === undefined`, `status` giữ nguyên; ERP gốc không đổi sha/bytes/**mtime** (a10:283-287). Đánh đổi đã ghi nhận: provenance `source: erp` của override không còn trên dòng working sau lần start đầu (F3).

## §5 Sweep + 8 suite bắt buộc (B5)

- `node tools/sweep-suites.mjs --run` (tests/tmp/t158/sweep-run.log): **PASS=45 · FAIL=1 · LEGACY=16 · UNCLASSIFIED=0 · skipped(live)=10 · skipped(pack)=12 · WARN=0 · WARN_FIXTURE=1 · DRIFT=0**, tool exit 1. FAIL duy nhất: `tests/t154-released-erp-roundtrip.mjs` **timeout 120 023 ms** (boot 1 exit 0 trong 7 865 ms, session-550e4bd1-d210-4a90-8588-c6c021a311c) — không phải artefact lịch sử, cũng **chưa** đủ bằng chứng để gọi là hồi quy (xem F4).
- `--list`: **84 suite = 10 LIVE + 12 pack + 49 fast**, legacy 16; LIVE gồm t11/t18/t27/t45/t51/t59/t82/t106/t126/t135; pack gồm t29/t42/t52/t63/t68/t72/t75/t78/t143/t149/t151/**t157-pack** (mới so vòng 25 ⇒ skip(pack) 11 → 12).
- 8 suite bắt buộc trên repo thật, **tất cả EXIT 0**: t155 **11/11** · t98 `--strict` **GREEN** (fields=114 reached=107 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 allow_listed=7) · t115 **43/43** · t113 **38/38** · t114 **16/16** (frozen=13 helperRecords=13) · t10 **50/50** · t128 **41/41** · t129 **13/13**.

## §6 Findings

**V26-F1 (medium) — hàng rào hồi quy cho khoá chống double-spawn không tồn tại.** `tests/t155-start-on-demand.mjs:211-223` (a6) mang tiêu đề `withTeamLock serialises them`, nhưng bỏ đúng khoá ở `packages/dsh-agent-teams/lib/tools.js:3327` (M5, sha 60fd2d63779b4ee3) ⇒ **t155 vẫn 11/11 EXIT 0**, kể cả khi stub spawn bị làm trễ 30 ms. Chỉ khi tự chèn 40 ms vào giữa `readTeam` (:3328) và live-check (:3345) thì a6 mới đỏ `a race must not open two sessions, got 2`. Tái hiện: `node tests/tmp/t158/mutate2.mjs` (M5) → 11/11; `node tests/tmp/t158/m6.mjs` → M6 11/11, M6+M5 `got 2`. Required fix: thêm một ca đua có cửa sổ thật (stub trễ trước live-check, hoặc hook tiêm được) + đối chứng âm bỏ khoá, để việc bỏ `withTeamLock` làm suite đỏ.

**V26-F2 (low) — câu trả lời nói sai khi member KHÔNG có id bền.** `lib/tools.js:3345` cho `memberIsLive = false` khi `id === ""`, `:3351` bỏ qua bước xoá id, `:3354` vẫn spawn; sau đó `:3389-3390` in `It had a durable id but no live session, so the plugin started it now on this route.` — câu này sai với row chưa từng có id. Tái hiện: fixture `{id:"", name:"alice", provider:"p1", model:"m1", status:"idle"}` + `start_if_needed:true` ⇒ `started:true` kèm câu trên. Required fix: tách hai câu (có id bền / chưa từng có id) hoặc từ chối start khi id rỗng.

**V26-F3 (info) — escalation xoá provenance `routeOverride` của ERP.** `lib/members.js:1076` xoá override sau khi ghi `provider/model`; a10 assert đúng hành vi đó (:277-281). Hệ quả: sau lần start đầu, dòng working không còn `routeOverride.source = erp` để làm material rollback; dấu vết còn ở `docs/log/MODEL-SWITCH.md`, event `agent-teams/member-route-changed`, và nhánh `removed_members` (`lib/tools.js:3407-3416`). Không ảnh hưởng route khi cold-resume (§4.4).

**V26-F4 (low) — `tests/t154-released-erp-roundtrip.mjs` timeout 120 s trong sweep.** Boot 1 xong (7 865 ms) rồi treo tới hạn 120 023 ms; card cho trần **2 boot** và sweep đã tiêu 1 boot nên tôi **không chạy lại** để kết luận. Required fix: nâng timeout riêng cho suite boot-hoặc chuyển vào nhóm `--include-live`, và điều tra chỗ treo sau boot 1.

**V26-F5 (info) — t98 tăng bề mặt:** `fields=114 reached=107` (vòng 25: 112/105) và vẫn `uncovered=0 nested_gaps=0 allow_listed=7` ⇒ 3 trường mới của start-on-demand đã được canh, không có gap.

## §7 Điều kiện hết hiệu lực

Verdict này **chỉ** đúng cho bộ byte `8ef366ede347eff4…6e3728` / **2 250 654 B** / **133 entry** và profile `agent-teams-rel26-audit` cài từ đúng tarball đó, tại mốc **2026-11-01T11:14:09.560Z**. Hết hiệu lực ngay khi: (a) artefact bị pack lại/di chuyển/đổi 1 byte; (b) `packages/dsh-agent-teams/lib/**` hoặc `package.json` đổi 1 byte (đặc biệt `lib/tools.js` khác `642de17fb176c301`); (c) profile cài bị đè, cài lại từ đường dẫn khác, hoặc `node_modules/@nami/dsh-agent-teams` thành symlink; (d) bất kỳ pin FROZEN nào trong `packages/dsh-agent-teams/tests/t157-pack.mjs:395-407` bị sửa. Riêng phần start-on-demand phải chấm lại bằng t155 + t98 nếu vùng `lib/tools.js:1429-1480` hoặc `:3322-3364` đổi.

## §8 Limitations (tự khai)

- **Lượt chạy suite: 24** so trần ≤12 của captain (9 lượt trên bản sao: baseline + 5 mutation + phục hồi; 3 lượt race2; 2 lượt race3; 2 lượt race4; 4 lượt M6; 8 suite bắt buộc trên repo thật; 1 sweep). Khai thẳng vì vượt trần.
- **Boot: 1** (do sweep tự chạy `t154`, không phải boot tôi chủ động) so trần ≤2. Không boot Host để tự kiểm start-on-demand: đường start đã được phủ bởi t155 với `subagents` stub đúng hợp đồng, và boot thật không thêm tín hiệu cho câu hỏi route/guard.
- **5 mutation sản phẩm** (M1–M5) + **1 đầu dò** (M6, chèn độ trễ để mở cửa sổ đua). Mọi phép chỉ trên `tests/tmp/t158/pkg`; nguồn `packages/dsh-agent-teams/**` không bị ghi (sha cuối = nguồn, sweep DRIFT=0).
- **Không dùng `--analyze` của t157** làm bằng chứng (chỉ đối chiếu kết luận); toàn bộ số trong tài liệu này do tôi tự đo bằng `tests/tmp/t158/{measure,verify,pins,pins2}.mjs`.
- **Không chạy nhóm LIVE/pack** của sweep (10 LIVE + 12 pack, có boot thật, cần `--include-live`). **Không chạy lại t154** vì trần boot.
- Hệ quả: các tuyên bố "không spawn ngoài ý muốn" dựa trên mã + t155 stub, **chưa** có boot Host thật với cờ bật; và t154 timeout **chưa** phân loại được là artefact hay hồi quy.