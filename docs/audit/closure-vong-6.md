# Audit closure vòng 6 — t57 (panel gate) · t58 (công cụ ghi ERP) · t59 (E2E bản copy) · t60 (báo cáo)

Người audit: **audit-goat** (độc lập, không viết mã t57–t60) · attempt `246695dc-402a-4060-a751-40c006bc1112` · 2026-10-31T19:49:14.013Z
Phạm vi ghi: `docs/audit/**` + `docs/log/AUDIT.md` + `tests/tmp/t61/**`. Mã nguồn/tool/test chỉ ĐỌC, trừ mutation TẠM THỜI đã khôi phục byte-identical (bảng §2).

## 0. Verdict

**CHƯA PHÁT HÀNH ĐƯỢC** — vì **V6-F1 (blocker)**: công cụ `tools/erp-route-migrate.mjs` (bước GHI của quy trình di trú ERP, `docs/van-hanh/de-xuat-di-tru-erp.md` §5) ghi `routeOverride` **thiếu `source`/`at`**, đúng hai trường mà biên bền của plugin bắt buộc — nên sau khi chạy `--apply`, **mọi tool AgentTeams từ chối đọc `team.json`** của đội ERP.

Phần **mã plugin KHÔNG có hồi quy**: 10/10 hash đóng băng SAME, 32 suite exit 0, tarball t52 **không chứa `tools/`** (tar: `package/tools/` = 0 entry) ⇒ **riêng tarball t52 vẫn cài được**; thứ chưa giao được là công cụ di trú + tài liệu §5 + suite t58 đang khoá hình dạng sai.

## 1. Đối chiếu C1–C7

| Mục | Yêu cầu của brief | Kết quả | Bằng chứng (máy chạy) |
|---|---|---|---|
| C1 | t57: chốt panel, tự mutation, phục hồi byte-identical | **ĐẠT** | `node tests/t57-panel-session-gate.mjs` → EXIT 0, `# 29/29 passed, 0 failed`. Mutation A: `ActivityPanel.js` `() => (current === undefined ? [] : teams.filter(` → `() => (false ? [] : teams.filter(` (sha `d35b5f3f…f7408` → `8bd4f2fb…345e4`) ⇒ **EXIT 1**, 2 FAIL: `M1 mutation of the undefined guard is visible…`, `N5 … got 't-f' want ''`; khôi phục → sha trùng tuyệt đối (`IDENTICAL=true`), suite xanh lại. Chốt không phải PASS giả: test cắt **thân useMemo thật** khỏi nguồn (`tests/t57-panel-session-gate.mjs:26-38`). |
| C2 | t58: mỗi chốt an toàn phải đỏ khi bị phá; dry-run không ghi byte, không in đường dẫn tuyệt đối | **ĐẠT (chốt an toàn)** — nhưng hình dạng ghi hỏng, xem V6-F1 | `node tests/t58-erp-migrate.mjs` → EXIT 0, `# 18/18 passed, 0 failed`. Mutation B (`tools/erp-route-migrate.mjs:311` `if (existsSync(options.backup) === true)` → `if (false)`) ⇒ **EXIT 1**, `not ok 17 e3 backup khong bi ghi de…`, `# 17/18`; khôi phục sha `b28775a8…e667d99a` trùng. Probe riêng `tests/tmp/t61/probe-migrate.mjs` trên BẢN COPY: dry-run `detected 7 / changed 7`, sha trước = sau, chỉ có `team.json` trong thư mục, `absPathInOutput=false`; `--apply` thiếu `--backup` ⇒ exit 2 + sha không đổi; thiếu `--expect-sha256` ⇒ exit 2, **không tạo backup**; apply đủ ⇒ exit 0, backup byte-identical, sha `9f7420b6…` → `783fad97…`, chỉ 3 khoá `model/provider/reasoningEffort`. |
| C3 | t59: bản copy chạy được, tệp ERP thật không đổi 1 byte | **ĐẠT** | `node tests/t59-erp-live-copy.mjs --analyze tests/tmp/t59/run-2026-10-31T19-39-04-827Z` → EXIT 0, `verdict PASS — proved C1..C9`, `identical=true`. Tôi không tin meta: tự hash `tests/tmp/t59/.agent-teams/erp-erp/team.json` = `4aafb58f…18fe1` / 1 533 022 B, **0 routeOverride** còn lại (khớp `meta.copy.afterClear`); ERP thật `9f7420b6…15f2d1e` **trước = sau** trong probe của tôi (sha, mtime, size, danh sách tệp). t59 chỉ có đường ĐỌC ERP (`tests/t59-erp-live-copy.mjs:234-236,381-382,452`). |
| C4 | Báo cáo t60: hash + số case + grep số cũ | **ĐẠT, 1 sai số** (V6-F3) | 10/10 hash khớp báo cáo: tools `a01b1a1018cb`/194 888 · members `1562be4d527d`/99 402 · state `7b49f5ab1d46`/56 282 · snapshot `92ecdd8759b6`/11 687 · index `2d28e617f068`/45 315 · tool-names `e3def5db908d`/808 · client `f86012517284`/198 572 · map `a0241ae86616`/335 890 · types/members.d.ts `b1ffe1544003`/27 660 · package.json `92a6404071e4`/10 498 = `@nami/dsh-agent-teams 0.2.0-dev.0`; tarball t52 `5306f31b…bfb7` / 2 209 460 B. Số case khớp **14/14** dòng (t4 22/22, t10 40/40, t24 12/12, t37 14/14, t38 17/17, t43 19/19, t46 15/15, t49 16/16, t50 11/11, t54 14/14, t56 12/12, t57 29/29, t3 18/18, t15 21/21). Grep 6 số cũ: **0 hit** trong `docs/bao-cao-agent-teams.md` + `docs/van-hanh/**` (8 tệp). |
| C5 | Chạy lại TẤT CẢ suite + hồ sơ | **ĐẠT** | 22 suite thuần **EXIT 0** (t3, t4, t10, t15, t20, t24, t28, t30, t37–t40, t43, t44, t46, t48–t50, t54, t56, t57, t58; log `tests/tmp/t61/sweep/*.log`); 10 suite `--analyze` **EXIT 0** (t11 11 checks · t18 C1..C9 · t21 A1..A7 · t27 16/16 · t29 C1..C5 · t35 3 chiều · t42 repack · t52 `drift=0` · t45 C1..C7 · t51 C1..C6). `check-doc-paths --summary` → `files=5 paths=65 paths_missing=0 links=41 links_missing=0`, EXIT 0. `dependency-report` → `tasks=61 realEdges=71 derivedEdges=66 waves=27 problems=0`. Quét `tests/*.mjs`: `.skip(` = 0, `catch {}` rỗng = 0. |
| C6 | Rà công cụ: chỉ ghi routeOverride, không ghi khi thiếu cờ | **ĐẠT (đúng câu hỏi)** + V6-F1 | Đọc mã: mọi phép ghi nằm sau `if (options.apply === true)` **và** sau 3 chốt (`--backup`, `--expect-sha256`, sha khớp) — `tools/erp-route-migrate.mjs:296-316`; dry-run chỉ `readFileSync`; khoá ghi duy nhất là `member.routeOverride` (`:326`) với `WRITE_KEYS` (`:43`); ghi qua tệp tạm + `rename`; deep-diff trước khi ghi; backup cũ bị từ chối (`:311-313`). Nhưng nội dung `routeOverride` **không hợp lệ** với người đọc — V6-F1. |
| C7 | Verdict phát hành + điều kiện | **CHƯA PHÁT HÀNH ĐƯỢC** | §0 + §3 + §5. |

## 2. Ba mutation tự làm (không tin lời khai), đều khôi phục byte-identical

| # | Tệp:neo | Sửa thành | Phản ứng của suite | Phục hồi |
|---|---|---|---|---|
| A | `packages/dsh-agent-teams/lib/client/ActivityPanel.js` visibleTeams guard | `(false ? [] : …)` | `t57` **EXIT 1**, FAIL `M1` + `N5` | sha `d35b5f3f…f7408`, `IDENTICAL=true` |
| B | `tools/erp-route-migrate.mjs:311` chốt backup cũ | `if (false) {` | `t58` **EXIT 1**, `not ok 17 e3`, 17/18 | sha `b28775a8…e667d99a`, `IDENTICAL=true` |
| C | `tools/erp-route-migrate.mjs:326` hình dạng ghi | thêm `source='profile'`, `at=Date.now()` | `t58` **EXIT 1**, `not ok 11 d1` + `not ok 13 d3`, 16/18 ⇒ suite **từ chối bản vá đúng** | sha trùng, `IDENTICAL=true` |

Mutation C không phải phá hoại: nó chứng minh **V6-F2** — bộ test đang khoá đúng cái hình dạng mà plugin từ chối.

## 3. Phát hiện

**V6-F1 · blocker · công cụ di trú ghi ra tệp mà plugin không đọc được**
- Vị trí: `tools/erp-route-migrate.mjs:43` (`const WRITE_KEYS = ['provider', 'model', 'reasoningEffort'];`) và `:326` (`byName.get(item.targetName).routeOverride = { ...item.nextRoute };`) ↔ `packages/dsh-agent-teams/lib/state.js:671-677` — biên bền **bắt buộc** `routeOverride.source ∈ {captain,http,profile}` (`:675`) và `isFiniteNumber(routeOverride.at)` (`:676`); thiếu ⇒ `isTeamMember` false ⇒ `readTeam`/`readTeamSync` ném ở `lib/state.js:209`.
- Tái hiện (một lệnh, chỉ ghi trong `tests/tmp/t61/`): `node tests/tmp/t61/probe-migrate.mjs` → `pluginReadMigrated: {ok:false, message:'invalid AgentTeams state in team erp-erp: members[7] is not a valid member record'}`, trong khi bản đối chứng **cùng tệp + `source='profile'`, `at`** → `{ok:true, members:14}`. Tức: chỉ cần chạy §5 của tài liệu trên dữ liệu thật là **toàn bộ tool AgentTeams của đội ERP chết** (cả đọc lẫn ghi), phải sửa tay 7 member mới cứu được.
- Hình dạng ĐÚNG đã có sẵn trong plugin: `lib/members.js:1417-1424` (`source` ở `:1421`, `at` ở `:1422`, `by` tuỳ chọn).
- Đề nghị sửa (chọn 1): (a) ghi `source='profile'` + `at: Date.now()` (+ `by` tuỳ chọn) — không phải sửa `lib/**`; (b) thêm `'tool'` vào union ở `lib/state.js:675` rồi ghi `source='tool'` — rõ nguồn gốc hơn nhưng phải sửa mã + `.d.ts` + test types. Kèm sửa `docs/van-hanh/de-xuat-di-tru-erp.md:90` (đang nói chỉ ghi 3 khoá).
- Ước lượng: ~10 dòng mã + 1 dòng tài liệu + 1 case test.

**V6-F2 · high · suite t58 khoá hình dạng sai, nên bản vá đúng sẽ làm nó đỏ**
- Vị trí: `tests/t58-erp-migrate.mjs:25` (`const DESIRED = { provider, model, reasoningEffort }` — không `source`/`at`), `:212`, `:238` (`assert.deepEqual(routeOverride, DESIRED)`).
- Không case nào chạy bản đã di trú qua biên bền thật (`lib/state.js`), nên 18/18 vẫn xanh dù kết quả không dùng được. Mutation C ở §2 là bằng chứng: thêm `source/at` (bản vá đúng) ⇒ `d1` + `d3` đỏ.
- Đề nghị: `DESIRED` thêm `source`/`at` (so khớp `source` + `typeof at === 'number'`), thêm case `z2` `readTeamSync(copyDir,'erp-erp')` không ném + `routeOf(member)` trả route mới.

**V6-F3 · low · báo cáo người dùng đếm thiếu tệp Telegram**
- `docs/bao-cao-agent-teams.md:96-98` viết *24 kỳ, 13 tệp còn ghi `messageId` gửi thật (ky-08=17 … ky-24=35)*. Đo thật: 24 tệp, **21 tệp có `messageId`** (ky-01=5, 02=6, 03=7, 04=9, 05=11, 06=13, 07=15, 08=17, 09=19, 10=20, 13=23, 14=24, 15=25, 16=26, 17=27, 18=28, 19=30, 20=31, 21=32, 22=33, 24=35); chỉ ky-11, ky-12, ky-23 không có ⇒ **thiếu 8**. Sửa 13 → 21 (hướng sai là thiếu, không phải thổi phồng).

**V6-F4 · info · số cũ còn trong hồ sơ lịch sử**: `docs/audit/closure-vong-3.md`, `docs/audit/closure-vong-4.md`, và các hàng kết quả `docs/TODO.md:38,39,40,42,43,44,53,68` vẫn nhắc `7fde7bbc`/`0026ac70`/`25/25`/`179 184`/`193 129`/`28facff2`. Đó là **ảnh chụp tại thời điểm**, giữ nguyên là đúng; C4 của brief nên hiểu là '0 hit trong tài liệu người dùng + vận hành' (đã đạt).

**V6-F5 · low · chạy `tools/dependency-report.mjs` là một phép GHI**: nó in `wrote docs/DEPENDENCIES.md` — nằm ngoài phạm vi ghi của audit này (brief bắt buộc chạy nên tôi chạy, và khai báo ở đây). Repo **không phải git repo** (`git status` → `fatal: not a git repository`) nên không thể chứng minh nội dung không đổi. Đề nghị: thêm `--check`/`--out <tệp>` để chạy kiểm mà không ghi.

**V6-F6 · info · suite pack chỉ chấm lại artifact**: t29/t35/t42/t52 chạy `--analyze` (brief cấm `pack`), nên chúng **không** được thực thi end-to-end trong vòng này.

**V6-F7 · info · `process.exit(0)` nằm trong chuỗi probe nhúng**: `tests/t42-pack-v5.mjs:302`, `tests/t52-pack-final.mjs:309,:551,:552` — là script con in JSON rồi thoát, suite đọc stdout; cùng lớp với t42-F3 (không phải đường thoát-0-để-PASS của suite).

## 4. Những gì tôi tự đo thay vì tin `--analyze`
- Tự `tar -tzf` tarball t52: **133 entry**, `node_modules|package/tests/|.tgz|.pid` = **0**, `package/tools/` = **0** ⇒ công cụ di trú **không** nằm trong gói phát hành; 9 entry payload bắt buộc đều có.
- Tự hash 10 tệp nguồn (bảng C4) và tarball (`5306f31b…`/2 209 460 B) — không dùng meta của t52/t53.
- Tự hash bản copy t59 (`4aafb58f…`) + đối chiếu `meta.copy.afterClear`, và tự hash ERP thật trước/sau.
- Tự đo probe migrate (12 phép đo ở C2) — t58 không có chế độ `--analyze`.

## 5. Giới hạn của audit này
- Không bấm GUI thật trong phiên sống (khoảng trống đã biết; bằng chứng UI vẫn là SSR + bundle harness `t10` 40/40).
- Không chạy `--apply` trên `team.json` ERP thật — chỉ trên bản copy byte-identical; V6-F1 vì thế là suy luận-tới-hệ-quả nhưng đo trên đúng byte của tệp thật.
- Không chạy end-to-end 4 suite pack (V6-F6); không có git để chứng minh `docs/DEPENDENCIES.md` không đổi nội dung (V6-F5).
- Số lệnh shell đã dùng: 10/30; mutation: 3/4; attempt: 1/3.

## 6. Điều kiện chuyển sang PHÁT HÀNH ĐƯỢC
1. **V6-F1** — công cụ ghi kèm `source` + `at` (`tools/erp-route-migrate.mjs:43,:326`) và sửa `docs/van-hanh/de-xuat-di-tru-erp.md:90` (owner: người giữ `tools/**` + docs vận hành).
2. **V6-F2** — `tests/t58-erp-migrate.mjs` khoá hình dạng ĐÚNG + thêm case round-trip qua `lib/state.js` (owner: test).
3. **Audit lại 2 mục trên** bằng một mutation mới: thêm lại `source/at` phải làm t58 **xanh**, bỏ `source` phải làm nó **đỏ**.
4. **V6-F3** (không chặn) — sửa 13 → 21 trong báo cáo.

*Tarball t52 không chứa `tools/` nên không phải pack lại vì V6-F1; nếu `lib/**` đổi vì bất kỳ lý do gì thì phải chạy lại t52 rồi audit tarball (quy tắc từ t53: không pack lại sau mốc 19:07:01Z).*
