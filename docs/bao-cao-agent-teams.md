# Báo cáo: @nami/dsh-agent-teams 0.2.0-dev.0 — bản viết lại plugin Agent Teams

Báo cáo cho người dùng và người vận hành. **Mọi con số dưới đây được đo lại trong phiên t60 (2026-10-31)** bằng
`node crypto` cho sha256 và bằng cách chạy thật từng suite; số nào chưa đo lại trong t60 thì ghi rõ ngày đo.
Tài liệu chi tiết: [docs/van-hanh/README.md](van-hanh/README.md).

## 1. Tóm tắt

Bản viết lại `@nami/dsh-agent-teams` 0.2.0-dev.0 đóng gói sẵn trong `packages/dsh-agent-teams` — **chưa cài vào
profile desktop** (BUG-003 đóng một phần: profile nháp `agent-teams-test` đã nạp bản fork, phiên master vẫn nạp
`@nanmicoder/dsh-agent-teams` v0.1.28 — BUG-017). Cách cài: §3. Bản này giữ nguyên định dạng dữ liệu đội và thêm ba khả năng:

1. **Đổi model cho member ĐANG CHẠY** — không cần dừng đội, không mất attempt đang mở.
2. **Thêm member thủ công khi đội đang chạy** — qua tool, qua HTTP `/plan`, hoặc qua UI.
3. **Đọc thẳng dữ liệu đội ERP hiện có** — không cần di trú, không ghi lại file.

Kèm theo: audit đổi route độc lập trên đĩa, và log đủ 11 nhóm theo quy tắc dự án.

## 2. Ba tính năng: dùng thế nào và đã chứng minh bằng gì

| Tính năng | Dùng | Bằng chứng |
|---|---|---|
| Đổi route member đang chạy | tool `agent_teams_set_member_route` (`lib/tools.js:1245`), hoặc HTTP `POST /plugins/dsh-agent-teams/plan` `action: set_member_route` (`lib/index.js:369`) | t18 9/9: notice `[model changed: …]`, `request/header` kế tiếp dùng model mới, attempt không mất, đọc lạnh vẫn đúng; t11 HTTP 200 thật (số liệu ngày 2026-10-31) |
| Thêm member khi đội chạy | tool `agent_teams_add_member` / HTTP `action: add_member` / UI nút **Add member** | t21 7/7 (spawn thật, task chạy, trần, trùng tên); t11 HTTP 200 + 409 + 409 (số liệu ngày 2026-10-31) |
| Biết member chết vì provider | không cần làm gì: đọc `agent_teams_status` — member có `last_failure` (`code`, `message`, `at`, `provider`, `model`) | t28 20/20 (ghi bền `members[].lastFailure`, mutation test 20/20 → 10/20) + t30 8/8 (DTO tool captain đọc, mutation 8/8 → 4/8) — số liệu ngày 2026-10-31 |
| Tương thích dữ liệu ERP | không làm gì: cài lên là chạy | t20 15/15 trên `team.json` thật 1 533 117 B: 14 member, 107 task, inbox 682 dòng, sha256 nguồn không đổi (số liệu ngày 2026-10-31) |

Cơ chế then chốt (để người đọc biết vì sao an toàn): đổi route **không** ghi `provider`/`model` của member
mà ghi một object `routeOverride` có metadata (`source`, `at`, `by`). Guard descriptor của host
(`lib/members.js:742`) chỉ so spine khai báo với descriptor, nên đường này không bao giờ làm
lần cold resume kế tiếp nổ. Đường cũ — `update_member` ghi thẳng spine — chỉ an toàn khi member **chưa spawn**
và hiện bị chặn bằng mã ở `lib/tools.js:584`.

### 2.1 Môi trường dogfood (hash đo lại ở t131/vòng 20, sau khi đổi thứ tự panel ở t128 — witness theo đường dẫn khoá)
`C:\Users\thang\.dsh\profiles\agent-teams-test\node_modules\@nami\dsh-agent-teams` là **symlink** tới `packages/dsh-agent-teams`;
`lib/tools.js` sha256 `e51734baf469…`/**213 715 B**, `lib/types/tools.d.ts` `41cfc56576ed…`/7 546 B, `lib/snapshot.js` `a2a87e1b0c0b…`/13 986 B, `lib/client.js` `377bcea2394c…`/258 432 B, `lib/client.js.map` `1f1d15524bcd…`/404 958 B,
`lib/client/ActivityPanel.module.css` `53ea47c6d780…`/51 837 B (**141 lớp**),
`lib/members.js` `50f558f8b207…`/**102 260 B**, `lib/state.js` `56664c59ff40…`/**57 508 B**, `lib/types/members.d.ts` `c53250ab41bf…`/31 769 B,
`lib/index.js` `2d28e617f068…`/45 315 B, `package.json` `92a6404071e4…`/10 498 B =
`@nami/dsh-agent-teams` 0.2.0-dev.0, `lib/tool-names.js` có `agent_teams_set_member_route` + `agent_teams_add_member` +
`agent_teams_set_member_profile`, `cordis.patch.yml` của profile trỏ `@nami`. Tức bản fork HIỆN TẠI đã nằm trong một profile thật và đã được boot thật ở t18/t11.

### 2.2 Panel AgentTeams: 2 control chỉ hiện khi 3 điều kiện cùng đúng

Người dùng báo "không thấy 2 control trong panel" — hành vi là ĐÚNG thiết kế, hai nguyên nhân độc lập: profile nạp bundle cũ và panel gắn với session tạo team. Đúng thứ tự: (1) Host nạp **bundle fork** `@nami/dsh-agent-teams` 0.2.0-dev.0, không phải `@nanmicoder` 0.1.28 (bundle cũ 0 hit `data-member-route`/`set_member_route`/`add_member`); (2) session đang chọn phải **chính** `captainSessionId` của team — panel lọc `team.captainSessionId === current` (`lib/client/ActivityPanel.js:644`), session khác ⇒ panel rỗng; (3) panel phải đang mở (tự mở khi team live, hoặc bấm nút "Activity panel", `lib/client/locales.js:32` / `:288`).

Đường dogfood đúng: đổi profile desktop sang fork → khởi động lại Host → **mở lại đúng session đã tạo team** (hoặc tạo team mới trong session mới). Khoá bằng máy: `tests/t57-panel-session-gate.mjs` 29/29 (đo lại t60). Chi tiết: [docs/van-hanh/di-migrate-va-rollback.md](van-hanh/di-migrate-va-rollback.md) mục 4.1.

### 2.3 Tarball phát hành — **t130 (vòng 20)** `d34be2af347ea625…4b63cc39` / 2 248 088 B / 133 entry — verdict audit vòng 20 (t131): **PHÁT HÀNH ĐƯỢC, CÔNG BỐ CÓ ĐIỀU KIỆN**; t121 (vòng 19) ĐÃ HẾT HIỆU LỰC vì t128 đổi `lib/client.js`/`lib/client.js.map`/`lib/client/ActivityPanel.js` (thứ tự panel); chưa publish/commit (giữ `0.2.0-dev.0`)
Cài tham chiếu (đường dẫn PHÁT HÀNH ỔN ĐỊNH, đã sửa V19-F6 — không dùng run dir tạm): `npm i --offline --legacy-peer-deps dist/vong-20/nami-dsh-agent-teams-0.2.0-dev.0.tgz`;
**kiểm sha256 `d34be2af347ea625a5d108f88ca4207dafb53beb59984c775269b1344b63cc39` và 2 248 088 B trước khi cài** (§2.4 cảnh báo các tarball cũ cùng tên; lock `file:` của profile cài nên trỏ một đường dẫn phát hành ổn định — xem V19-F6).
Bằng chứng (captain tự đo bằng `node:crypto` + `tar`, và audit t122 đo lại độc lập trên đúng bộ byte này): `tar -tzf` strip CRLF **133 entry / 0 entry thư mục / 0 rác / 0 đường dẫn tuyệt đối**; quét TOÀN GÓI **133/133 payload = nguồn (0 diff, 0 notInSource)**, `lib/**` nguồn 79 tệp 0 thiếu; **3 chiều 13/13 SAME** (nguồn ↔ payload ↔ bản cài `agent-teams-pack18`, không symlink, `0.2.0-dev.0`); repack **CÙNG sha256 + bytes**; `tests/t121-pack.mjs --analyze` **11/11 EXIT 0** (19/19 export, `SELF_MUTATION caught=1,1,1,1,1`, `t98 --strict` GREEN tại thời điểm pack, drift 0/13); boot trên bản ĐÃ CÀI in `Members (1 present + 1 removed):` + `Removed (1):`; ERP `9f7420b6…15f2d1e` / 1 533 117 B không đổi; sweep `tools/sweep-suites.mjs --run` = **PASS=49 · FAIL=1 (t118 A3, ghim bảng vòng 18 — đúng thiết kế) · LEGACY=8 · UNCLASSIFIED=0 · SKIPPED-LIVE=8**.

Verdict: audit vòng 19 (t122) kết luận **PHÁT HÀNH ĐƯỢC — công bố có điều kiện** (`docs/audit/closure-vong-19.md` 83 dòng, `docs/log/AUDIT.md` 332 dòng/28 heading; KHÔNG có finding high/blocker). Ba phép thử thật trên bản sao: (A) in `ts` của inbox bằng HẰNG (−26 B) ⇒ `--strict` **EXIT 2** fail-closed, nạp làm SOURCE_MUTANT thì control bắt đúng `captain_inbox[0].ts` + `member_inbox[0].ts`; (B) `` ` findings ${task.findings_open}` `` → `` ` findings 0` `` (−20 B) ⇒ EXIT 2, control bắt `tasks[0].findings_open`; (C) `removed_count: team.members.length` (−2 B) ⇒ `--strict` **GREEN** nhưng `tests/t107` EXIT 1 ⇒ lộ **V19-F3**: allow-list thứ 7 chưa được cổng canh. Điều kiện công bố: (a) vá nợ hợp đồng t117 (V19-F1), (b) không pack lại và không ghi thêm byte nào vào `lib/**`, (c) nói rõ với người vận hành rằng cổng render-parity không canh entry allow-list đó. Hết hiệu lực ngay khi `lib/**`/`package.json` đổi 1 byte, tarball bị pack lại, hoặc `agent-teams-pack18` bị cài đè.

Findings vòng 19: **V19-F1 medium** (nợ hợp đồng t117: `check-contract --task t117` FAIL (f) trên card đã terminal — lỗi QUY TRÌNH, luật đã có nhưng chạy quá muộn) · **V19-F2 medium** (lớp BUG-028: chỉ suite pack có ba mốc `tableBefore/tableAfter/tableEnd` bắt được ghi-ngoài-tiến-trình; `t59` chỉ lấy mẫu quanh boot) · **V19-F3 medium** (allow-list `status.removed_count` không được cổng canh) · **V19-F4/F5/F6/F7 low** (thông điệp fail-closed thiếu key path; chưa có suite riêng vòng 19 + `--negative` chỉ đột biến payload đã giải nén; lock `file:` trỏ run dir tạm; `t56` in WARN thiếu `tsc` mà vẫn xanh). Đã mở **t123** (F1), **t124** (F2/F5/F7), **t125** (F3/F4) — cả ba KHÔNG chạm `lib/**`/`package.json` nên verdict vòng 19 còn hiệu lực nếu chúng giữ đúng ranh giới.
**Trạng thái xử lý findings vòng 19 (đóng bằng đo, không bằng lời) — cả 7 mục đã có kết luận:**
- **V19-F1 CLOSED** (t123, dev-runtime-goat): `tools/check-contract.mjs` 16 130 B/`a40fbde1…` thêm `--pre` (cùng 6 phép, cùng ngữ nghĩa, cùng exit 0/1/2; khác duy nhất tiêu đề `contract gate [PRE-TERMINAL]` + hai dòng kết luận + JSON `mode/preTerminal/terminalBlocked/terminalConclusion`), suite `tests/t115-check-contract.mjs` **43/43** (33 ca cũ + k1..k10). Luật (f) KHÔNG bị nới: `--task t117` và `--task t117 --pre` đều EXIT 1 đúng (f) nguyên văn; `--task t121 --pre` EXIT 0 `PRE-TERMINAL PASS`. Captain mutation riêng: `terminalBlocked: failed.length > 0` → `false` (−12 B) ⇒ 42/43 (`# failed: k4`). Nợ của bản thân card t117 vẫn còn (contract terminal là immutable) — nay có cổng chặn tái diễn.
- **V19-F2 CLOSED** (t124, dev-build-flash): `tools/sweep-suites.mjs` 31 165 B/`efdb7da4…` chụp bảng 13 tệp TRƯỚC/SAU **mỗi** suite, lệch ⇒ row FAIL + sha/bytes/delta + mục `== FROZEN DRIFT (N suite) ==`; cờ `--frozen-root`, và thiếu gốc khi đã nêu ⇒ exit 2 `cannot claim green`. Trên repo thật: `frozen sampling: 13 files … hashed before AND after every executed suite` + `1/1 sampled · drift suites=0`. Captain mutation riêng (phá chính phép lấy mẫu): `const after = sampling ? frozenSnapshot(frozenRoot) : undefined;` → `const after = before;` (−43 B) ⇒ **19/20, FAIL a16** ⇒ phép lấy mẫu là load-bearing.
- **V19-F3 CLOSED** (t125, dev-ui-goat): `tests/t98-render-coverage.mjs` 69 983 B/`2b6ff259…` thêm bất biến `removed_count === removed_members.length` trên payload THẬT + text render (block `ROSTER INVARIANT`), entry allow-list thứ 7 nay in `GUARDED BY (t125 / V19-F3)` và có **NEGATIVE CONTROL 6** chạy trong chính lần `--strict` (mutant −2 B ⇒ findings=1 exit 1, nêu đúng `agent_teams_status.removed_count`). Captain mutation riêng (phá CHÍNH bộ kiểm): `else if (typeof count !== 'number' || count !== size)` → `else if (false)` (−38 B) ⇒ **EXIT 2** `GATE ERROR: the roster invariant cannot see a removed_count taken from the live roster, so the allow-list entry is unguarded` ⇒ cưỡng chế fail-closed.
- **V19-F4 CLOSED** (t125): `unmutatedCopyRedMessage(gaps)` in danh sách đường dẫn khoá; cổng tự chạy nó với fixture 2 path mỗi lần (`(F4) … names every key path: true`).
- **V19-F5 CLOSED** (t124): `tests/t118-pack.mjs` 33 268 B/`30aeaa73…` re-pin vòng 19 + cờ `--tgz-flip`: bản copy lật 1 byte tại offset 8 giữ nguyên độ dài (`copy sha256 16fcef596433…`) ⇒ `analyze(copy) exit=1 · A2 fails=true · A4 passes=true`, bản gốc `originalExit=0` ⇒ chặn đúng ở A2 chứ không ở A4.
- **V19-F6 CLOSED** (captain + t126 + t127): đã tạo đường dẫn phát hành ỔN ĐỊNH `dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz` — **cùng sha `2770fbfc4070eb80…3cc6251e` / 2 248 092 B** (copy, KHÔNG pack lại) và đã đổi lệnh cài trong báo cáo sang đường dẫn này. Còn lại: profile `agent-teams-pack18` vẫn giữ lock `file:` trỏ run dir tạm ⇒ khi bàn giao/cài cho phiên thật PHẢI cài từ `dist/vong-19/`.
- **V19-F7 CLOSED** (t124): sweep đếm + in nguyên văn mọi dòng `^WARN` (`== WARN lines (N) — verbatim, never silently dropped ==`, `warnings: 1 WARN line(s) in 1 suite(s)`); `--strict` ⇒ **exit 3** (`--only t56 --strict` đo thật). Ghi nhận nuance đã chấp nhận: dưới `--strict`, DÒNG của suite vẫn hiện verdict `PASS` (đó là exit code của chính suite) còn WARN nằm ở cột riêng + exit 3 của công cụ — hai chiều thông tin, không phải mâu thuẫn.

**Sau khi đóng 4 finding, `lib/**` và `package.json` KHÔNG đổi byte nào** (`lib/tools.js` `e51734baf4693cd30f4c86aaf577afb58f8afef39788588d900a93621ae62d61`/213 715 · `lib/state.js` `56664c59ff400319…`/57 508 · `package.json` `92a6404071e457cc…`/10 498) ⇒ verdict phát hành vòng 19 vẫn còn hiệu lực; `docs/TODO.md` nay 125 hàng, `VERIFIED=119 · CANCELLED=4 · SUPERSEDED=2`, không còn card mở.

**ĐÃ CHỨNG MINH BỘ BYTE PHÁT HÀNH CHẠY ĐƯỢC (t126 + audit độc lập t127) — vòng 19 khép kín.**

Trước t126, toàn bộ 19 vòng dogfood nạp plugin qua **symlink tới nguồn**, nên chưa lần nào chứng minh thứ thực sự giao cho người dùng — bản cài TỪ TARBALL — nạp được. t126 cài `dist/vong-19/…tgz` vào profile MỚI `agent-teams-rel19`, t127 cài lại độc lập vào `agent-teams-rel19-audit`; cả hai **`isSymlink=false`**, `0.2.0-dev.0`, lock `file:` trỏ đúng `dist/vong-19/…tgz`, và **13/13 tệp trong BẢN CÀI khớp bảng đóng băng** (không chỉ source). Boot thật trên bản copy `team.json` ERP in nguyên văn `Members (7 present + 7 removed):` · `Removed (7):` · `Tasks (107):` · footer `Team id: erp-erp · phase: running`; audit t127 đo render 49 177 ký tự và **24 793 ký tự đầu TRÙNG TUYỆT ĐỐI** với render của t126. ERP `9f7420b6…`/1 533 117 B và 13 tệp nguồn không đổi một byte ⇒ **verdict vòng 19 vẫn còn hiệu lực**.

Mutation của captain trên chính bộ kiểm (khác chiều member — member lật byte `.tgz`/bản cài): tamper **artifact** (đổi `Members (7 present + 7 removed):` → `… active …` trong `boot-status.stdout.txt` của BẢN COPY run dir) ⇒ `--analyze` **EXIT 1** `verdict FAIL — unproved A2`. Mutation của audit t127 (3 kiểu mới, đều trên bản sao, đã phục hồi xanh): junction bản cài ⇒ `installed package IS a symlink (dogfood, not release bytes)`; lock trỏ decoy **cùng sha** ở thư mục khác ⇒ `lock resolved … does not point at dist/vong-19`; xoá `lib/types/tools.d.ts` ⇒ FAIL có thông điệp, không crash.

**Findings của audit bộ byte phát hành (t127) — đã định tuyến hết, không bỏ rơi:**
- **VB-F1 medium — ĐÃ GHI THÀNH GIỚI HẠN CỦA BÁO CÁO:** render `agent_teams_status` **không tái lập byte-exact** giữa hai phiên trên cùng dữ liệu — lệch 8 ký tự trong blob `Supplemental observations` của task `t4` (`lib/tools.js:3380`, chuỗi ghép thẳng `task.supplemental_evidence`), dù hai bản copy chỉ khác 2 trường volatile mà chính t126 khai (`$.members[8].status`, `$.tasks[106].updatedAt`). Hệ quả thực dụng: **không được ghim golden theo toàn văn render**; muốn so sánh thì so theo HEADER + dòng đã chọn, hoặc chấm lại bằng boot thật nếu `lib/tools.js:3328/:3373/:3376/:3380` đổi.
- **VB-F2 low — ĐÃ GHI:** A1 khẳng định **ĐƯỜNG DẪN** phát hành chứ không chỉ hash (`tests/t126-released-bytes-boot.mjs:307`) ⇒ **không chép artefact sang chỗ khác** rồi cài, nếu chép thì A1 sẽ đỏ đúng như thiết kế (và đó là lý do đường dẫn `dist/vong-19/` phải ổn định).
- **VB-F3 medium — ĐÃ GHI + CHUYỂN THÀNH VIỆC MỞ BÀN GIAO (chưa vá):** `--analyze` chấm **trạng thái SỐNG** — `evaluate()` (`tests/t126-released-bytes-boot.mjs:567-586`) luôn đo lại artefact + cây bản cài + profile và **không đọc `artifact.json`**, nên một verdict `--analyze` cũ **không** chứng minh profile tại thời điểm chạy (bản sao cổng trỏ profile mới của audit vẫn PASS trên run dir của t126). Đề xuất đã ghi nhận: lưu ảnh chụp `realpath` + 13 hash vào `artifact.json` và **EXIT 2 fail-closed** khi thiếu. Việc này sửa `tests/**` nên **không ảnh hưởng verdict phát hành**; chưa làm vì đã chốt dừng vòng lặp.
- **VB-F4/F5 info:** phép `present→active` không chạy lại trên boot (trần 2 boot đã dùng cho B2; captain đã làm phép tương đương và audit chấm gián tiếp qua A2/B0); luật (a) của `check-contract` là **kiểm tồn tại** — audit t127 tự tái lập `FAIL (a)` trên card t127 ở mốc `createdAt 02:37:44.869Z` < mtime suite `02:44:09.242Z` và **đồng ý** với cách captain xử lý (chuyển lệnh đó thành acceptance B0), KHÔNG thêm miễn trừ cho 'tệp do dependency tạo' vì sẽ mở đường cho verify trang trí.

**Điều kiện hết hiệu lực của kết luận bộ byte phát hành:** artefact bị pack lại hoặc di chuyển khỏi `dist/vong-19/`; bất kỳ tệp nào trong 13 tệp đóng băng đổi; hoặc có task sửa `lib/**` sau mốc `2026-11-01T03:05:21Z`. Phần render phải chấm lại **bằng boot thật** nếu `lib/tools.js:3328/:3373/:3376/:3380` đổi.
**ĐÍNH CHÍNH sự cố 02:08:18Z (BUG-028 lần 2).** Trước đây ghi là 'ghi không chủ, không ai khai nhận'. Nay xác định bằng số đo trùng khít: audit-goat (t122) tự khai ở closure §8 rằng trước khi brief cấm ghi `lib/**` tới, họ đã chạy 3 mutation TRỰC TIẾP trên `packages/dsh-agent-teams/lib/tools.js`; mutation A của họ có delta **−26 B** và sha `f3abdf76bc8c/213 689` — TRÙNG KHÍT `tableAfter` mà suite pack của captain ghi trong run `run-2026-11-01T02-08-00Z`. Nghĩa là: va chạm hai tiến trình member trên cùng cây nguồn, không phải bí ẩn môi trường. Luật rút ra: card mutation/audit phải mang câu 'mọi phép đột biến chạy trên BẢN SAO' ngay trong `acceptance`, và captain không chạy song song suite đang lấy mẫu cây nguồn khi member đang đo.

### 2.3.1 Công bố mã nguồn — repo GitHub, nhánh `unity`

- Repo: `https://github.com/mrbean701/agent-teams-v` · nhánh **`unity`** · commit đầu `b3dbebba7e82e4fb1616df6b00aff1ff5610364d` (385 tệp, 10.8 MB).
- Bộ byte phát hành vào commit rồi tính lại vẫn khớp: `dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz` sha `2770fbfc4070eb80…3cc6251e` / 2 248 092 B.
- KHÔNG đưa lên repo: `node_modules/`, `**/tests/tmp/` (316 MB artefact), `packages/dsh-agent-teams/build/` (output build — `package.json` trỏ `main`/`exports` vào `lib/`), `packages/dsh-agent-teams/tmp/` (prototype cũ), `.agent-teams/` (state runtime dogfood), `.dsh-acl-recovery/`, `docs/nghien-cuu/scratch/` (bản sao mã nguồn host).
- Quét bí mật trước khi commit: 367 tệp văn bản, **0 khớp** `ghp_`/`github_pat_`/`sk-`/`xoxb-`/bot token/private key/AKIA/Bearer.
- Version KHÔNG đổi (`0.2.0-dev.0`) ⇒ verdict vòng 19 còn hiệu lực **tại thời điểm commit đó** — nay đã HẾT hiệu lực vì vòng 20 đổi `lib/client.js`/`lib/client.js.map`/`lib/client/ActivityPanel.js` (thứ tự panel).

### 2.4 Chi tiết tarball phát hành — vòng 20 hiện hành (t130); t111 (vòng 18) và t121 (vòng 19) là bản CŨ
`packages/dsh-agent-teams/tests/tmp/t111/nami-dsh-agent-teams-0.2.0-dev.0.tgz` — **vòng 18**, sha256 `1bb0ef1fc83a…6414dc38`, **2 247 954 B**, **133 entry / 0 entry thư mục / 0 rác / 0 absolute**, ba chiều **13/13 SAME** với nguồn và bản cài `agent-teams-pack17` (không symlink, `0.2.0-dev.0`, lock `file:`), 2 lần pack CÙNG sha + bytes, drift 0/13 ở 3 mốc; `tests/t111-pack.mjs --analyze` **29/29 EXIT 0**; boot trên bản ĐÃ CÀI in `Members (1 present + 1 removed):` + `Removed (1):`. Bản cài có `removed_count`=3 · `removed_members`=5 · `present + `=1 · `active + `=0.

`packages/dsh-agent-teams/tests/tmp/t130/run-2026-11-01T03-59-18Z/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz` (và bản sao đường phát hành ổn định `dist/vong-20/nami-dsh-agent-teams-0.2.0-dev.0.tgz`, copy KHÔNG pack lại) — **vòng 20**, sha256 `d34be2af347ea625a5d108f88ca4207dafb53beb59984c775269b1344b63cc39`, **2 248 088 B**, **133 entry / 0 entry thư mục / 0 rác / 0 đường dẫn tuyệt đối**, ba chiều **14/14 SAME** (13 tệp đóng băng + `lib/client/ActivityPanel.js`) với bản cài `agent-teams-pack19` (`isSymlink=false`, `0.2.0-dev.0`, lock `file:` trỏ đúng tarball này), repack 2 tiến trình riêng ⇒ cùng sha + bytes, payload **133/133 = nguồn (0 diff)**, `tests/t130-pack.mjs --analyze` **15/15 EXIT 0**, boot trên bản ĐÃ CÀI in `Members (1 present + 1 removed):` + `Removed (1):` + `Team id: t130probe · phase: staged`.

Điểm khác biệt của vòng 20: **thứ tự panel đổi** — `ProgressOverview → DependencyMap (task dependencies) → AddMemberControl (form thêm member) → danh sách member → Workspace`. Thay đổi nằm ở 3 tệp: `lib/client/ActivityPanel.js` `9596333059c68b80…`/64 004 B, `lib/client.js` `377bcea2394cc0ac…`/258 432 B, `lib/client.js.map` `1f1d15524bcd3caa…`/404 958 B (cả ba GIỮ NGUYÊN số byte — đây là phép quay khối). Chứng minh 3 lớp: tĩnh trên bản đã cài (`DependencyMap@175647` < `AddMemberControl@175796` < `orderDelegationMembers@175899`), DOM thật do `react-dom/server` render từ chính bundle (`data-dependency-map@2587` < `data-add-member@5168` < `data-members-toggle@5403`), và cây phần tử; 3 đối chứng âm (bundle cũ `git show HEAD`, đảo call site, xoá marker) đều đỏ đúng nguyên văn (t132 · `tests/t132-panel-runtime.mjs` 9/9 EXIT 0).

**Giới hạn đã biết của vòng 20 — V20-F1 (medium, CHƯA vá):** `mappings` của `lib/client.js.map` KHÔNG được sinh lại (giống tuyệt đối bản tiền sửa, 114 429 ký tự) trong khi `sourcesContent[2]` đã đổi `d35b5f3f…`→`95963330…` ⇒ sourcemap CHỈ ĐÚNG NỘI DUNG, SAI VỊ TRÍ CỘT trong vùng đã quay. Không ảnh hưởng runtime (map chỉ dùng khi debug); muốn hết phải dựng lại pipeline build (esbuild/tsdown/typescript đã có trong `node_modules`, thiếu config) rồi pack + audit LẠI. Xem t134.

`packages/dsh-agent-teams/tests/tmp/t121/run-2026-11-01T02-04-11Z/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz` — **vòng 19**, sha256 `2770fbfc4070…3cc6251e`, **2 248 092 B**, **133 entry / 0 entry thư mục** (captain tự đo bằng `node:crypto` + `tar -tzf`), ba chiều **13/13 SAME** với nguồn và bản cài `agent-teams-pack18` (không symlink, `0.2.0-dev.0`), 2 lần pack CÙNG sha + bytes trong cùng tiến trình, captain chạy lại `--fresh` bằng CHÍNH tệp 54 370 B ⇒ **11/11 EXIT 0** cùng sha; `--negative` EXIT 0 (3 kiểu mutation, 2 tiến trình thật cho exit 0/1); boot trên bản ĐÃ CÀI in `Members (1 present + 1 removed):` + `Removed (1):` + dấu vết `  - t1 [pending] work findings 1 attempt 0 probe task → captain` + `Team id: t121probe · phase: staged`. Bản cài còn marker `findings_open` và ` · at ISO` của inbox (đúng bản vá t117). Sự cố đã định tuyến: **BUG-028 tái diễn lần 2** lúc `2026-11-01T02:08:18Z` (xem `docs/log/BUG.md`) — một lần ghi ngoài tiến trình vào `lib/tools.js` (213 689 B, −26 B) rồi tự trả lại đúng byte; lần chạy lại sạch `drift 0/0`.
| `tests/t113-roster-assertion.mjs` | 15/15 (suite THẬT: cắt NGUYÊN VĂN `const rosterOk = roster.found === true && roster.present === 7 && roster.removed === 7;` từ `tests/t59-erp-live-copy.mjs`, chạy bản đột biến của biểu thức và của phép nối vào `check('C4', …)`): A1 biểu thức cắt ra khớp nguyên văn · A2 helper `/Members \((\d+) (?:present|active) \+ (\d+) removed\)/` tự chứa · A3 khoá `&& rosterOk` đã nối vào C4 · B1..B5 rosterOk=false với tiêu đề một số / removed 7→6 / present 7→8 / mất dòng / rỗng · M1 thêm `\|\| true` M2 bỏ vế removed M3 hằng `true` ⇒ đều `teeth=false` · G1 text thật 7+7 ⇒ true · G2 đọc được artefact lịch sử còn chữ `active` | t113, EXIT=0 (captain chạy lại) |
| `tests/t114-source-freeze.mjs` | **16/16 EXIT 0** — cắt 2 helper (`sourceHashesOf`, `sourceProblemsOf`) từ suite sống t59; captain tự mutation: đổi 1 ký tự hex sha `lib/tools.js` trong bảng `FROZEN` 13 dòng (delta 0 B) ⇒ **EXIT 1, 13/16** kèm `evidence: note="nguồn đã bị ghi trong lúc suite chạy — bảng đóng băng phải được cập nhật trong CHÍNH task đổi lib/**`; phục hồi `identical=true` 70bc42437eed1eea/34 662 B | t114, EXIT=0 (captain chạy lại) |
| `tests/t59-erp-live-copy.mjs` (live) | **PASS C1..C10** ở `run-2026-11-01T01-14-20-148Z` (captain) và `run-2026-11-01T01-25-54-618Z` (member) — C4 `membersLine="Members (7 present + 7 removed)"` roster 7+7, C8 ERP `identical=true` `9f7420b6…e15f2d1e`/1 533 117 B; **NHƯNG chạy lại 80 giây sau (`run-…T01-27-13-566Z`) ra FAIL C5,C6,C7** vì model gọi `set_member_route` 2 lần rồi `clear` ⇒ suite chấm theo SỐ LẦN GỌI, chưa tất định — **T114-F1 đang sửa ở t116**; riêng C10 (đóng băng 13 tệp nguồn) PASS ở cả ba lần với `drift 0` | t116 (đang sửa) |
| `tests/t106-erp-live-roundtrip.mjs` (live ERP thật) | **PASS 6/6 EXIT 0** (`--analyze`, 0 boot) trên artifact `tests/tmp/t106/run-2026-11-01T01-28-19-638Z`: C1 text thật `Members (7 present + 7 removed):` · `Removed (7):` · `Tasks (107):`; C5 in đối chứng âm bản cài cũ `agent-teams-pack14` ⇒ `members[2] is not a valid member record`; C6 ERP sha/bytes/mtime identical. Member tự sửa 2 lỗi ĐO của chính suite (render ĐẦU TIÊN vs mới nhất; resumable `--fresh`) | t106, EXIT=0 (captain chấm) |
| `tools/check-contract.mjs` (t115) | cổng hợp đồng 6 phép, **PASS 6/6 EXIT 0** trên ledger thật cho t115/t114/t112/t106; bắt được lỗi thật của captain (`tests/t111-pack.mjs` → nearest `packages/dsh-agent-teams/tests/t111-pack.mjs`, t103 → `tests/t43-member-profile.mjs`) |
| `tests/t115-check-contract.mjs` | **33/33 EXIT 0** — gọi CLI thật qua `spawnSync`; mutation riêng của captain (vô hiệu phép (f), +9 B) ⇒ EXIT 1 `30/31 # failed: f1`; 2 ca mới a8/a9 cho trường hợp bootstrap (verify chạy chính tệp card sẽ tạo) — thêm sau khi cổng báo FAIL (a) trên card t118 |
**Giới hạn đã biết của vòng 15 (V15-F5, audit t105)** — đọc và ghi CỐ Ý bất đối xứng: chiều ĐỌC chỉ kiểm HÌNH DẠNG provenance (`lib/state.js` `PROVENANCE_SOURCE_PATTERN = /^[a-z][a-z0-9:_-]{0,63}$/u`, tối đa 64 ký tự), chiều GHI chỉ nhận đúng 3 giá trị `captain|http|profile` (`lib/members.js` `PROVENANCE_SOURCES`). Hệ quả: `source` là TOKEN MÔ TẢ, không phải khoá tin cậy; `by`/`at` không được kiểm; `tools/erp-route-migrate.mjs` hard-code `profile`. **Cập nhật sau t107**: trên `team.json` ERP thật hiện **0/14 member có `routeOverride`** — thứ từng bị payload làm rơi là `runtimeSetup` (persona 4 073 ký tự + `toolFilter` deny 10 tool) và `joinedAt`, nay đã hiện trong `status` qua `removed_members` (BUG-027).
Các tarball cũ **KHÔNG dùng**: t100 (`d7a8bce4…`/2 245 210 B — trước BUG-026 cả hai nửa), t104 (`771298f3…`/2 246 406 B — trước bản vá cổng t98 của t110), t108 (`0cb3fdfe…`/2 247 534 B — trước V17-F4 `active`→`present`), t29 (`ac84c73a…`), t35 (`c3e3e88a…`), t41/t42 (`1fe4fc5f…`, lệch nguồn), t52 (`5306f31b…bfb7`, thiếu bản vá CSS t67), t68 (`03bed22f…f99e`, thiếu D1 của t71), t72 (`5137df03…c8ac`, trước t74/t77) **và t75 (`818dff22…a304`, lệch `lib/types/snapshot.d.ts` do t77)** — cùng tên tệp nên luôn kiểm sha256 trước khi cài.

## 3. Cài đặt

~~~
cd E:/Project/Agent-Team && node tools/test/test-env.mjs        # dựng/kiểm profile nháp, exit 0 = PASS
# cài vào một profile (không dùng profile desktop cho thao tác plugin):
powershell -NoProfile -Command "& '<cli>' plugin --profile <profile> add link:E:/Project/Agent-Team/packages/dsh-agent-teams"
node tools/test/smoke-team.mjs                                   # PASS C1..C3
~~~

Sau khi cài **phải mở phiên mới**: tool surface của một phiên chốt lúc khởi động, phiên cũ vẫn chạy
v0.1.28 và sẽ báo `agent_teams_set_member_route is not a function` (BUG-003/BUG-017). Checklist dogfood 11 bước:
[docs/van-hanh/di-migrate-va-rollback.md](van-hanh/di-migrate-va-rollback.md) mục 4. Rollback: cùng file, mục 5.

## 4. Trạng thái kiểm thử (chạy lại được)

Mười hai suite dưới đây **chạy lại trong t60**, mỗi dòng là `node tests/<tệp> … ; echo EXIT=$?`:

| Suite | Kết quả | Đo |
|---|---|---|
| `tests/t4-control-plane-smoke.mjs` | 22/22 | t60, EXIT=0 |
| `tests/t10-ui-bundle-smoke.mjs` | 50/50 (bundle sha256 `377bcea2394c…` / 258 432 B, assert bằng `EXPECTED_BUNDLE_SHA256` + 2 phép thứ tự panel của t129) | t129, EXIT=0 |
| `tests/t24-auth-fence.mjs` | 12/12 (401/403/503, 405 + body rỗng, 413 ở biên 1 000 000 B) | t60, EXIT=0 |
| `tests/t37-route-clear.mjs` | 14/14 | t60, EXIT=0 |
| `tests/t38-member-fallback.mjs` | 17/17 | t60, EXIT=0 |
| `tests/t43-member-profile.mjs` | 19/19 | t60, EXIT=0 |
| `tests/t46-plan-fallback-http.mjs` | 15/15 | t60, EXIT=0 |
| `tests/t49-profile-http-dto.mjs` | 16/16 | t60, EXIT=0 |
| `tests/t50-edit-plan-removed-assignee.mjs` | 11/11 | t60, EXIT=0 |
| `tests/t54-auto-fallback-audit.mjs` | 14/14 | t60, EXIT=0 |
| `tests/t56-types-fallback.mjs` | 20/20 (cổng `tsc` 5.9.3 trên 21 tệp `lib/types/*.d.ts` + đối chứng âm) | t83, EXIT=0 |
| `tests/t57-panel-session-gate.mjs` | 29/29 | t60, EXIT=0 |
| `tests/t62-css-completeness.mjs` | 27/27 (sàn biến thể `:focus-visible 21 · :hover 16 · :disabled 12 · :active 4`) | t70, EXIT=0 |
| `tests/t70-addmember-default-route.mjs` | 16/16 (preselect route trong catalog) | t71, EXIT=0 |
| `tests/t74-captain-route-warning.mjs` | 24/24 (assert marker `captainRoute` + `data-add-member-captain-route-warning`) | t80, EXIT=0 |
| `tests/t77-types-captain-route.mjs` | 18/18 (khai báo kiểu `TeamCaptainRoute`) | t77, EXIT=0 |
| `tests/t87-approve-override.mjs` | 8/8 (approve plan resolve route qua `selectionFromMember`) | t87, EXIT=0 |
| `tests/t98-render-coverage.mjs` | 2 chế độ: mặc định in findings rồi EXIT 0, `--strict` EXIT 1 khi còn trường payload không tới được text, cổng hỏng EXIT 2 — hiện `tools=16 fields=110 reached=104 uncovered=0` GREEN | t99, EXIT=0 |
| `tests/t99-render-parity.mjs` | 11/11 (text `create` in khối `Members (N):`, `set_member_profile` in prompt + `previous *`, `status` in `Team id`/`phase`/route override/last failure) | t99, EXIT=0 |
| `tests/t100-pack.mjs --analyze` | 25/25 (drift=0 12 tệp ở 3 mốc, 133 entry, C24+C25 chấm text `edit_plan` + khối `Members` của `create`, tự hash tarball trên đĩa) | t100, EXIT=0 |
| `tests/t104-pack.mjs --analyze` | 27/27 (drift=0 12 tệp ở 3 mốc, 133 entry, chấm NGUYÊN VĂN guard message của t103 + dòng `Team id:`/`phase:` của t99, probe 19 export trên bản cài + `SELF_MUTATION: caught exit=1,1,1,1,1`, tự hash tarball trên đĩa) | t104, EXIT=0 |
| `tests/t102-erp-read-leniency.mjs` | 17/17 (đọc `team.json` ERP: source provenance theo regex lenient, status/kind/verdict lỗi kèm danh sách hợp lệ) | t102, EXIT=0 |
| `tests/t103-write-source-clamp.mjs` | 10/10 (guard GHI: source lạ NÉM trước khi ghi đĩa + trước audit row, `nothing was written`) | t103, EXIT=0 |
| `tests/t98-render-coverage.mjs --strict` (vòng 18) | EXIT 0 `tools=16 fields=112 reached=106 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 allow_list_line_problems=0`; ba mutation của captain chứng minh cổng có răng: citation ALLOW_LIST sai ⇒ EXIT 2, đổi khoá payload ⇒ `payload_findings=2`, xoá cách in `tasks[].kind` (giữ số dòng) ⇒ `nested_gaps=1` | t110, EXIT=0 |
| `tests/t98-render-coverage.mjs --strict` (vòng 19) | EXIT 0 `tools=16 fields=112 reached=105 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 payload_contract_failures=0 allow_listed=7 allow_list_line_problems=0` + 5 đối chứng `applies=true` | t117, EXIT=0 |
| `tests/t113-roster-assertion.mjs` | 38/38 (26 ca cũ + 12 mới: S1, C5-O1..O5, C5-ORDER, C7-a/b/c, R1, R2 — ghim thứ tự 'status NGAY SAU set' và 3 nhánh C7) | t119, EXIT=0 |
| `tests/t114-source-freeze.mjs` | 16/16 (FROZEN 13 dòng ghim `e51734ba…/213 715`; bắt được ghi nguồn trước/sau boot) | t117 + t119, EXIT=0 |
| `packages/dsh-agent-teams/tests/t121-pack.mjs` | `--analyze` **11/11 EXIT 0** (A9 19/19 export + SELF_MUTATION caught; A10 `t98 --strict` GREEN tại thời điểm pack; A11 drift=0) · `--negative` EXIT 0 (3 kiểu mutation, 2 tiến trình thật exit 0/1) · `--fresh` do captain chạy lại bằng chính tệp 54 370 B ⇒ 11/11 EXIT 0, `sha256Now=2770fbfc… bytesNow=2248092 entriesNow=133` | t121, EXIT=0 |
| `tests/t120-sweep-suites.mjs` + `tools/sweep-suites.mjs` | 15/15; `--list` `66 suite(s) = 8 LIVE + 58 fast; legacy exceptions: 8`; `--run --only t9` EXIT 0 `PASS=5 FAIL=0 LEGACY=2 UNCLASSIFIED=0`, 0 boot | t120, EXIT=0 |
| `tests/t111-pack.mjs --analyze` | 29/29 (pack vòng 18: 133 entry / 0 dir, ba chiều 13/13 với `agent-teams-pack17`, tự hash tarball trên đĩa, boot in `Members (1 present + 1 removed):`) | t111, EXIT=0 |
| `tests/t96-pack.mjs --analyze` | 24/24 (drift=0 cho 12 tệp, 133 entry, C24 chấm text roster của `agent_teams_edit_plan`, tự hash tarball trên đĩa, `SELF_MUTATION: caught exit=1,1,1,1,1`) | t96, EXIT=0 |
| `tests/t90-edit-plan-roster-route.mjs` | 10/10 (roster `edit_plan` theo route HIỆU LỰC) | t96, EXIT=0 |
| `tests/t94-edit-plan-roster-render.mjs` | 9/9 (text tool in roster + dấu `(override)`) | t96, EXIT=0 |
| `tests/t93-check-logs.mjs` | 20/20 (cổng log: header TODO thiếu vòng = LỖI; cờ `--allow-missing-round`) | t95, EXIT=0 |
| `tests/t86-override-before-spawn.mjs` | 8/8 (spawn tôn trọng `routeOverride` — vá BUG-023) | t86, EXIT=0 |
| `tests/t3-route-smoke.mjs` | 18/18 | t89, EXIT=0 |
| `tests/t15-activate-member.mjs` | 21/21 (gồm 12 case parity toolPolicy; không có suite `t17` riêng) | t89, EXIT=0 |
| `tests/t18-hot-switch-e2e.mjs --analyze` | 9/9 | t73, EXIT=0 |
| `tests/t20-erp-compat.mjs` | 15/15 | t73, EXIT=0 |
| `tests/t21-add-member-e2e.mjs` | 7/7 | t73, EXIT=0 |
| `tests/t11-http-e2e.mjs --analyze` | 11/11 | t73, EXIT=0 |

Audit mã nguồn vòng 5 (`docs/audit/closure-vong-5.md`, t42): verdict **ĐẠT cho MÃ NGUỒN**, 0 phát hiện blocker/high/medium. Audit vòng 6–9 (`closure-vong-6.md` t61, `closure-vong-7.md` t69, `closure-vong-8.md` t73, `closure-vong-9.md` t76) đều chốt tarball cua vòng đó rồi bị thay ở vòng sau. **Audit vòng 10 (`docs/audit/closure-vong-10.md`, t79) chốt: TARBALL t78 PHÁT HÀNH ĐƯỢC** — 12/12 ba chiều SAME, quét cả 133 tệp payload ↔ nguồn 0 lệch (đóng V9-F1), 4 mutation riêng của audit đều đỏ rồi phục hồi byte-identical, 42/42 suite EXIT 0 (số của vòng 10), ERP `9f7420b6…`/1 533 117 B không đổi; finding còn lại chỉ là tài liệu (V10-F1 high) và đã sửa trong cùng lượt. **Audit vòng 11 (`docs/audit/closure-vong-11.md`, t85) chốt: TARBALL t84 PHÁT HÀNH ĐƯỢC** — 12/12 ba chiều SAME và quét cả 133 tệp payload ↔ nguồn 0 lệch, 3 mutation riêng của audit (sửa hằng số trong doc-comment `=200`→`=201`, xoá `interface MemberProfileChangeResult`, revert call-site `tools.js:553`) đều đỏ rồi phục hồi byte-identical, 44/44 suite EXIT 0, ERP không đổi; V11-F1 (tài liệu) sửa trong cùng lượt. Vòng 11 có vì **một BUG THẬT**: t86 vá nhánh spawn bỏ qua `routeOverride`, chứng minh bằng t82 đảo FAIL→PASS (C3) trên CÙNG bộ chấm. **Audit vòng 12 (`docs/audit/closure-vong-12.md`, t89) CHỐT: TARBALL t88 PHÁT HÀNH ĐƯỢC** — quét 133/133 tệp payload = nguồn 0 lệch, 4 mutation kiểu mới đều đỏ rồi phục hồi byte-identical, 47 suite → 46 EXIT 0, ERP không đổi; điều kiện: `lib/**` hoặc payload đổi sau 2026-10-31T21:53:17Z thì verdict vô hiệu.
**Audit vòng 15 (`docs/audit/closure-vong-15.md`, t105) chốt: TARBALL t104 PHÁT HÀNH ĐƯỢC** — 131 tệp payload = nguồn (0 diff/0 notInSource), 12/12 ba chiều với `agent-teams-pack15`, 4 mutation kiểu mới (M1 regex provenance `{0,63}`→`{0,64}` Δ0 B ⇒ t102 case b3 65 ký tự đỏ; M2 thêm `'erp'` vào `PROVENANCE_SOURCES` +7 B ⇒ t103 5 case đỏ; M3 hoán vị danh sách ⇒ t103 5 case; M4b `'captain'`→`'http'` −3 B ⇒ t103 case c1), 57/58 suite EXIT 0, ERP không đổi. *(Audit vòng 14 (t101) đã chốt tarball t100 nhưng verdict đó HẾT hiệu lực khi t102/t103 đổi `lib/**`.)*

Số liệu hồ sơ: TODO **125 hàng task**
`tasks=125 realEdges=113 derivedEdges=138 waves=53 problems=0` (problem duy nhất trước đó — t107 completed dưới cha `t106` còn `failed` — đã về 0 sau khi t106 chạy lại attempt 2 và PASS)
Telegram: `docs/bao-cao-telegram/` có **42 kỳ**, **cả 42 tệp ghi message id gửi thật** (`message_id` hoặc `messageId`) (ky-42=53, ky-41=52, ky-40=51, ky-39=50, ky-38=49, ky-37=48, ky-36=47, ky-01=5, ky-02=6, ky-03=7, ky-04=9, ky-05=11, ky-06=13, ky-07=15, ky-08=17, ky-09=19, ky-10=20, ky-11=21, ky-12=22, ky-13=23, ky-14=24, ky-15=25, ky-16=26, ky-17=27, ky-18=28, ky-19=30, ky-20=31, ky-21=32, ky-22=33, ky-23=34, ky-24=35, ky-25=36, ky-26=37, ky-27=38, ky-28=39, ky-29=40, ky-30=41, ky-31=42, ky-32=43, ky-33=44, ky-34=45, ky-35=46).

### 4.2 Kiểm tra đường dẫn (chống tái diễn)

Script `tools/check-doc-paths.mjs` quét mọi đường dẫn dạng `tests/*.mjs`, `lib/*.js`, `docs/**`, `build/**`,
`tools/**` và mọi link tương đối được nhắc trong `docs/bao-cao-agent-teams.md` + `docs/van-hanh/*.md`; in bảng
`path | exists` rồi `link | exists`, **exit 1** nếu có dòng `NO` (glob `*`/`?` cũng được kiểm: một pattern không khớp tệp nào
bị báo `NO`, nên hàng suite giả không lọt được nữa). Bảng đầy đủ (số đo sau t25, chưa làm mới):
[kiem-tra-duong-dan.md](van-hanh/kiem-tra-duong-dan.md). Output thật của lần chạy cuối trong t60:

~~~
$ node tools/check-doc-paths.mjs --summary
SUMMARY files=5 paths=96 paths_missing=0 links=41 links_missing=0
EXIT 0
~~~
(số đo t117/t120: **105 đường dẫn / 41 link** — `check-doc-paths --summary` chạy lại sau t114/t115/t116; bảng chi tiết trong `kiem-tra-duong-dan.md` vẫn là ảnh chụp ngày 2026-10-31 sau t25, chưa làm mới.)

## 5. Giới hạn đã biết (không giấu)

- **Audit trail không nằm trong session event.** `appendTeamEvent` (`lib/events.js:26`) bỏ mọi event
  `agent-teams/*` mà harness chưa khai báo trong `KNOWN_SESSION_EVENT_TYPES` (`:33`) (`:34-40`). Nguồn chuẩn là
  `<workspace>/docs/log/MODEL-SWITCH.md` (máy đọc) + `team.json` + transcript **của member**.
- **Auth fence của `/plan` đã được kiểm nhưng chỉ ở phía plugin**: t24 12/12 chứng minh `401`/`403`/`503`
  (Connection chưa bind), `409` (captain chưa gắn), `405` kèm body rỗng, `413` ở biên 1 000 000 B; fence chạy
  TRƯỚC method check (`lib/index.js:275`). Chưa kiểm ruột Connection của host (token/cookie/CSRF), TLS,
  origin, replay.
- **Rollback ngược ĐÃ chạy thật**: t27 drill 0.2.x → 0.1.28 → 0.2.x trong profile nháp, 4 bước có cách kiểm từng bước
  (tài liệu di trú mục 5). Vẫn nên sao lưu `team.json` trước khi bật bản mới.
- **`last_failure` ĐÃ hiện trên panel**: t28 ghi bền + t30 phát trong tool + t34 render `data-member-failure` trong
  `lib/client/MemberControls.js`; bundle phát hành `377bcea2394c…`/258 432 B đã chứa control này.
- **Tarball cũ đã bỏ**: t29/t35/t41/t42, t52 (`5306f31b…bfb7` — thiếu bản vá CSS t67), t68 (`03bed22f…f99e` — thiếu D1 của t71), t72 (`5137df03…c8ac` — trước t74/t77), t100 (`d7a8bce4…` — trước BUG-026 đọc+ghi), t84 (`220a6da9…37db1` — trước vá t87 approve/routeOverride), t78 (`cb234b08…7d6e50` — trước bản vá BUG-023) t88 (`0adbc64e…ceed2c` — trước vá BUG-024 của t90/t94) và t96 (`0b9220eabbc4…172c9e70` — trước vá render parity của t99) không dùng để phát hành; bản hiện hành là **t100** (`d7a8bce4a333…c57c9b1a`, 2 245 210 B, 133 entry) — **chờ audit vòng 14 (t101)**.
- **Panel đã được tự kiểm trên phiên SỐNG** (`docs/kiem-thu/dog-03-panel-live.md`, DOG-03): đổi route → `POST /plan` 200 + `routeOverride` `source:http` trong `team.json` + audit row; khôi phục route → 200 + row `(cleared)`; thêm member → 200 + member mới `declared` route trong catalog. Không cần người bấm.
- **UI**: bundle đã nạp được trong Chromium thật (`build/test-load.html` → `Overall: PASS`, console rỗng) và
  cả 2 control đã được **bấm thử trên GUI sống** (DOG-03: đổi route, khôi phục route, thêm member — đều `POST /plan` 200).
- **Dogfood trong phiên master** vẫn treo: BUG-003 đóng một phần (môi trường đã chứng minh), BUG-017 phiên master vẫn
  nạp 0.1.28; toàn bộ bằng chứng E2E hiện có là trên profile nháp.

## 6. Đọc tiếp

- Mục lục tài liệu + quy tắc đổi route: [docs/van-hanh/README.md](van-hanh/README.md)
- Di trú, dogfood, rollback: [docs/van-hanh/di-migrate-va-rollback.md](van-hanh/di-migrate-va-rollback.md)
- `update_member` vs `set_member_route`: [docs/van-hanh/khuyen-nghi-update-member.md](van-hanh/khuyen-nghi-update-member.md)
- Thiết kế: [docs/thiet-ke/thiet-ke-v1.md](thiet-ke/thiet-ke-v1.md) · Audit: [docs/audit/closure-vong-5.md](audit/closure-vong-5.md)
- Bản phân tích plugin GỐC v0.1.28 (báo cáo đầu tiên): [docs/bao-cao-plugin-v0.1.28.md](bao-cao-plugin-v0.1.28.md)
- Trạng thái dự án: [docs/TODO.md](TODO.md)
