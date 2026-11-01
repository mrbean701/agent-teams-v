# t120 — quét toàn bộ suite và phân loại (sweep-suites), + F2/F7 của vòng 19

Công cụ `tools/sweep-suites.mjs` · suite kiểm công cụ `tests/t120-sweep-suites.mjs` (20 ca) · fixture `tests/tmp/t120/`.
CLI: `--list` (mặc định, không chạy gì) · `--run [--only a,b] [--timeout ms] [--include-live] [--run-legacy] [--strict] [--frozen-root dir] [--exceptions f.json] [--manifest f.json] [--json]`.
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
## `--list` trên repo (EXIT 0)
```
totals: 66 suite(s) = 8 LIVE + 58 fast; legacy exceptions: 8
LIVE group (8): t11-http-e2e, t18-hot-switch-e2e, t27-rollback, t45-clear-live-e2e, t51-fallback-live-e2e,
               t59-erp-live-copy, t82-erp-migrate-live, t106-erp-live-roundtrip  (mỗi tên đều in kèm signal)
```
LIVE nhận diện bằng dấu hiệu máy đọc trong tệp: `cli-harness` (`DESKTOP_CLI|dsh-cli.mjs`) + `powershell-spawn` + `json-stdin-boot` (`--json` và `-`),
loại nếu có `pack-runner` (`npm.cmd`) hoặc `patch-caps` (`--patch`). Không hardcode danh sách: cột signal in ra từng suite.
Nhóm này là SUPERSET 6 tên card nêu — thêm `t27-rollback` và `t51-fallback-live-e2e` (cả hai có đủ 3 dấu hiệu boot).
## 20 ca của suite kiểm công cụ (EXIT 0 · `20/20 cases: 20 passed, 0 failed`)

a1–a15 (giữ nguyên từ t120 gốc): PASS/FAIL/UNCLASSIFIED · timeout · exception LEGACY không được chạy · near-miss · `--list` không chạy gì · `--only` · tệp thiếu · exit 2 khi tham số/ngoại lệ/root hỏng · hai đối chứng âm (sửa fixture, xoá ngoại lệ) · nhóm LIVE · repo thật 66 suite · ghi đè nhóm có lý do.
a16–a20 (mới cho vòng 19):

| Ca | Chứng minh | Bằng chứng |
|---|---|---|
| a16 | F2: fixture ghi 1 byte vào **bản sao** `tests/tmp/t120/frozen-copy/lib/state.js` ⇒ sweep FAIL, nêu đúng tệp + hai sha | `verdict=FAIL drift={"file":"lib/state.js","before":"7200385de0806a06","after":"9d618ebe2068046a","bytesBefore":57509,"bytesAfter":57510}` `toolExit=1` `realStateUnchanged=true` |
| a17 | F2 đối chứng: fixture không ghi ⇒ PASS, `drift=[]`, `sampled=true`, exit 0 (lấy mẫu theo CỬA SỔ, không ghim bảng) | `toolExit=0` |
| a18 | F7 mặc định: `warnCount=1`, in nguyên văn, exit vẫn 0 | `listed=true` |
| a19 | F7 `--strict`: có WARN ⇒ KHÔNG xanh | `toolExit=3` `explained=true` |
| a20 | Không phá hành vi cũ: `--list` vẫn đúng 8 LEGACY, không chạy gì | `legacyRows=8` `listExit=0` |

## LEGACY nhúng sẵn (8 — pack suite ghim hash vòng cũ, đỏ theo thiết kế)
`t35-pack-repack:39` · `t84-pack:51` · `t88-pack:57` · `t92-pack:57` · `t96-pack:57` · `t100-pack:57` · `t104-pack:58` · `t108-pack:59`.
KHÔNG đưa `t118-pack` vào ngoại lệ: nó kiểm artefact đang phát hành — đỏ của nó là tín hiệu thật.
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
