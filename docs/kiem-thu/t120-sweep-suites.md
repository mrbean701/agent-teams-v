# t120 — quét toàn bộ suite và phân loại (sweep-suites) — F2/F7 vòng 19, V21-F1/F3/F4/F5 vòng 21

Công cụ `tools/sweep-suites.mjs` · suite kiểm công cụ `tests/t120-sweep-suites.mjs` (25 ca) · fixture `tests/tmp/t120/`.
CLI: `--list` (mặc định, không chạy gì) · `--run [--only a,b] [--timeout ms] [--include-live] [--run-legacy] [--strict] [--frozen-root dir] [--root dir] [--extra-root dir] [--exceptions f.json] [--manifest f.json] [--json]`.
Exit code công cụ: 0 = không FAIL và không UNCLASSIFIED và (nếu `--strict`) không WARN · 1 = có FAIL · 2 = công cụ hỏng · 3 = CHỈ có UNCLASSIFIED, hoặc `--strict` gặp WARN (mã 3 là phần MỞ RỘNG; khác 0 nên không bao giờ là xanh).
## V19-F2 — lấy mẫu bảng 13 tệp TRƯỚC và SAU **mỗi** suite

Vòng 19 chứng minh chỉ cơ chế ba mốc của suite pack bắt được lớp BUG-028 (một tiến trình khác ghi `lib/tools.js` rồi trả lại đúng byte): `tests/t59-erp-live-copy.mjs:54,:58,:133-160` chỉ lấy mẫu quanh mỗi lần boot,
`tests/t114-source-freeze.mjs:59-89,:140-182` chỉ chứng minh helper ⇒ cửa sổ nằm ngoài boot là VÔ HÌNH. Nay `runAll` bọc mỗi lần gọi `runSuite` bằng `frozenSnapshot()` trước/sau:
13 tệp (12 `lib/**` + `package.json`) dưới `packages/dsh-agent-teams`; lệch ⇒ row thành `FAIL` với note `frozen source was WRITTEN while this suite ran: …` và dòng
`DIFF`-kiểu `lib/tools.js shaBefore=… shaAfter=… bytesBefore=… bytesAfter=… delta=±N`. Output có mục `== FROZEN DRIFT (N suite) ==`, dòng `frozen sampling: X/Y executed suite(s) sampled … drift suites=N`, summary thêm `DRIFT=…`.
`--frozen-root` đổi gốc lấy mẫu; gốc không tồn tại mà cờ được nêu ⇒ exit 2 (`cannot claim green`), không nêu cờ mà thiếu ⇒ in `frozen sampling: SKIPPED` (không im lặng).
## V19-F7 — WARN không còn bị im lặng

Mọi dòng khớp `^WARN ` trong output suite được đếm (`warnCount`) và in NGUYÊN VĂN ở mục `== WARN lines (N) — verbatim, never silently dropped ==`.
Mặc định: WARN **không** đổi exit code (giữ hành vi cũ, 8 LEGACY vẫn exit 0). `--strict`: có WARN ⇒ exit 3.
Đối chứng trên repo thật (`tests/tmp/t124/sweep-t56-strict.log`, EXIT 3):
```
t56-types-fallback.mjs   0 PASS  2067   WARN typescript was not found at packages/dsh-agent-teams/node_modules/typescript, so the declaration compile gate cannot run …
frozen sampling: 1/1 executed suite(s) sampled around the run · drift suites=0
warnings: 1 WARN line(s) in 1 suite(s) (--strict: any WARN is NOT green)
- t56-types-fallback.mjs warnCount=1
    | WARN typescript was not found at packages/dsh-agent-teams/node_modules/typescript, so the declaration compile gate cannot run (AGENT_TEAMS_ALLOW_NO_TSC=1: gate SKIPPED as a warning, never a pass)
summary: PASS=1 FAIL=0 LEGACY=0 UNCLASSIFIED=0 skipped(live)=0 WARN=1 DRIFT=0   → tool exit code: 3
```
## V21-F1 — gốc quét: suite trong `packages/*/tests` không được vô hình

Vòng 21 phát hiện `tools/sweep-suites.mjs` chỉ quét `tests/` ở gốc repo, nên `t111-pack`, `t121-pack`, `t130-pack`, `t135-pack` **không có dòng nào** trong bảng — một suite đỏ suốt một vòng mà không ai thấy.
Nay gốc mặc định = `tests` + mỗi `packages/<pkg>/tests` (`discoverPackageTestRoots()`), in `scan roots (N): …`; gốc không tồn tại in `scan roots SKIPPED (N): …` thay vì im lặng.
`--root` nêu tường minh ⇒ danh sách gốc thay thế TOÀN BỘ (giữ fixture test tất định); `--extra-root <dir>` thêm gốc ngoài. Trùng basename KHÔNG bị gộp: cả hai giữ, đổi tên thành đường dẫn repo-relative và in `duplicate suite basenames kept apart by repo-relative path: …`. JSON `--list` thêm `roots[]` và `file` cho từng row.

## V21-F5 — `WARN` của cổng khác `WARN_FIXTURE` của chính test

`WARN` = dòng `^WARN ` do CỔNG phát ra ⇒ có ý nghĩa trạng thái: vào `warnCount`, in nguyên văn, `--strict` ⇒ exit 3.
`WARN_FIXTURE` = dòng `^WARN ` do **chính suite** in ra để mô tả một nhánh nó đang thử. Luật nhận diện: cùng phần thân (sau tiền tố) đã xuất hiện dưới tiền tố khác (`FATAL`/`ERROR`) trong cùng lượt chạy. Không vào `warnCount`, không làm `--strict` đỏ; vẫn in nguyên văn với thẻ `[fixture]` và đếm riêng `WARN_FIXTURE=` trong summary.
Lý do phải tách: `tests/t56-types-fallback.mjs:435-441` cố ý chạy **cả hai** nhánh của cổng typescript ⇒ output có `FATAL typescript was not found…` rồi `WARN typescript was not found…` cùng lý do; gộp lại thì `--strict` đỏ vĩnh viễn vì một fixture tự mô tả, không phải vì cổng hỏng.

## V21-F3/F4 — chứng minh map là sản phẩm của build

`packages/dsh-agent-teams/build/build.mjs` neo gốc gói vào chính module (`pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')`), `process.chdir(pkgDir)`, và truyền `absWorkingDir: pkgDir` cho esbuild.
Đo được: `chdir` một mình KHÔNG đủ — esbuild chụp cwd gốc lúc import, nên comment `// <path>` vẫn theo cwd người gọi và bundle lệch **322 byte** khi chạy từ thư mục khác (`cfc89a55…/258 754` thay vì `377bcea2…/258 432`, map thì vẫn đúng). Sau khi thêm `absWorkingDir`, build từ `tests/tmp/t137/foreign-cwd` cho ĐÚNG `377bcea2394cc0ac/258 432` + `5024364fefe8b73e/404 958` — trùng byte bản ship.
`tests/t128-panel-order.mjs` ca **B3** chạy build trên BẢN SAO (`tests/tmp/t128/build-copy`, junction `node_modules`) từ gốc repo và đòi bundle + map trùng byte bản ship ⇒ mappings mà M4/N3 giải mã là sản phẩm của pipeline, không phải thứ chép tay.
## `--list` trên repo (EXIT 0)
```
scan roots (2): tests + packages/dsh-agent-teams/tests
totals: 77 suite(s) = 10 LIVE + 67 fast; legacy exceptions: 12
LIVE group (10): t11-http-e2e, t18-hot-switch-e2e, t27-rollback, t45-clear-live-e2e, t51-fallback-live-e2e,
               t59-erp-live-copy, t82-erp-migrate-live, t106-erp-live-roundtrip,
               packages/dsh-agent-teams/tests/t135-pack.mjs  (mỗi tên đều in kèm signal)
```
LIVE nhận diện bằng dấu hiệu máy đọc trong tệp: `cli-harness` (`DESKTOP_CLI|dsh-cli.mjs`) + `powershell-spawn` + `json-stdin-boot` (`--json` và `-`),
loại nếu có `pack-runner` (`npm.cmd`) hoặc `patch-caps` (`--patch`). Không hardcode danh sách: cột signal in ra từng suite.
Nhóm này là SUPERSET 6 tên card nêu — thêm `t27-rollback` và `t51-fallback-live-e2e` (cả hai có đủ 3 dấu hiệu boot).
## 25 ca của suite kiểm công cụ (EXIT 0 · `25/25 cases: 25 passed, 0 failed`)

a1–a15 (giữ nguyên từ t120 gốc): PASS/FAIL/UNCLASSIFIED · timeout · exception LEGACY không được chạy · near-miss · `--list` không chạy gì · `--only` · tệp thiếu · exit 2 khi tham số/ngoại lệ/root hỏng · hai đối chứng âm (sửa fixture, xoá ngoại lệ) · nhóm LIVE · repo thật 66 suite · ghi đè nhóm có lý do.
a16–a20 (mới cho vòng 19):

| Ca | Chứng minh | Bằng chứng |
|---|---|---|
| a16 | F2: fixture ghi 1 byte vào **bản sao** `tests/tmp/t120/frozen-copy/lib/state.js` ⇒ sweep FAIL, nêu đúng tệp + hai sha | `verdict=FAIL drift={"file":"lib/state.js","before":"7200385de0806a06","after":"9d618ebe2068046a","bytesBefore":57509,"bytesAfter":57510}` `toolExit=1` `realStateUnchanged=true` |
| a17 | F2 đối chứng: fixture không ghi ⇒ PASS, `drift=[]`, `sampled=true`, exit 0 (lấy mẫu theo CỬA SỔ, không ghim bảng) | `toolExit=0` |
| a18 | F7 mặc định: `warnCount=1`, in nguyên văn, exit vẫn 0 | `listed=true` |
| a19 | F7 `--strict`: có WARN ⇒ KHÔNG xanh | `toolExit=3` `explained=true` |
| a20 | Không phá hành vi cũ: `--list` đúng 12 LEGACY, không chạy gì | `legacyRows=12` `listExit=0` |
| a24 | V21-F1: `--list` công bố gốc quét; suite trong package hiện ra | `roots=["tests","packages/dsh-agent-teams/tests"]` `rows=77` `packFile="packages/dsh-agent-teams/tests/t130-pack.mjs"` |
| a25 | V21-F1: `t130-pack.mjs` rơi vào LEGACY chứ không FAIL, `ran=false`, kèm citation `:395` | `verdict=LEGACY ran=false toolExit=0` |

## LEGACY nhúng sẵn (12 — pack suite ghim hash vòng cũ, đỏ theo thiết kế)
`t35-pack-repack:39` · `t84-pack:51` · `t88-pack:57` · `t92-pack:57` · `t96-pack:57` · `t100-pack:57` · `t104-pack:58` · `t108-pack:59` ·
`t118-pack:49` (V20-F3) · `packages/dsh-agent-teams/tests/t111-pack.mjs:79` (V21-F1) · `packages/dsh-agent-teams/tests/t121-pack.mjs:380` · `packages/dsh-agent-teams/tests/t130-pack.mjs:395`.
`t118-pack` vào LEGACY từ V20-F3 vì nó ghim artefact vòng 18 — **bản kiểm artefact ĐANG phát hành là suite pack của vòng hiện hành** (nay: `packages/dsh-agent-teams/tests/t135-pack.mjs`), và suite đó nằm trong nhóm LIVE chứ không LEGACY.
`t130-pack.mjs` chọn LEGACY thay vì re-pin: xem lý do ghi ngay trong tệp đó (re-pin sẽ tuyên bố byte vòng 20 mang map vòng 21, và A7 vẫn so với bản cài vòng 20 nên vẫn đỏ).
## Trạng thái t118 sau t124
`node tests/t118-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t121` nay EXIT 0 (bảng FROZEN đã re-pin vòng 19: `lib/tools.js e51734baf4693cd3…`/213 715).
Đối chứng âm của tính chất artefact-scoped: `--analyze …/tests/tmp/t111` (vòng 18) vẫn EXIT 1 với `DIFF lib/tools.js [source] applies=true bytesFrozen=213071 bytesActual=213715 delta=+644` — đúng, vì artefact cũ không còn khớp cây nguồn.
## Giới hạn trung thực
1. Timeout chỉ bắt suite TREO; suite đúng nhưng chậm hơn ngưỡng cũng bị FAIL(timeout).
2. Nhận diện LIVE là heuristic văn bản — suite mới viết kiểu khác có thể bị xếp nhầm vào nhóm nhanh.
3. LEGACY do người khai; công cụ không tự biết 'đỏ theo thiết kế' — re-pin bảng thì phải xoá mục đó khỏi danh sách.
4. Lấy mẫu F2 chỉ phủ 13 tệp đóng băng; tệp khác trong `lib/**` bị ghi trong lúc suite chạy vẫn không bị bắt.
5. Lấy mẫu là hai lần đọc trên cùng tiến trình sweep: cửa sổ hở đúng khoảng giữa `frozenSnapshot` và `spawn`, không phải toàn thời gian tuyệt đối.
6. t120 KHÔNG chạy toàn bộ 58 suite nhanh (để dành cho audit): mỗi lần chạy `--run` chỉ chọn nhóm nhỏ, 0 boot.
7. a16 dùng BẢN SAO trong `tests/tmp/t120/frozen-copy`; a13 chạy toàn bộ fixture nên bản sao đã tăng 1 byte trước a16 — ca này chỉ so `bytesAfter = bytesBefore + 1`, không giả định bản sao nguyên vẹn.
8. `WARN_FIXTURE` là phép suy luận theo phần thân dòng: một WARN CỦA CỔNG mà thân trùng với một FATAL/ERROR trong cùng suite sẽ bị xếp vào fixture (đánh đổi có chủ ý để `t56` không đỏ vĩnh viễn).
9. Gốc quét tự phát hiện chỉ đi đúng một cấp `packages/*/tests`; suite nằm sâu hơn phải khai bằng `--extra-root`.
