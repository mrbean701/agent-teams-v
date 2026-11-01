# t133 — Bộ đo t132 có thật sự chỉ-đọc và fail-closed?

Sửa 2 finding của chính bộ đo vừa viết cho t132 (T132-F1, T132-F2) và chứng minh bằng phép đo lặp lại được.
Không sửa `packages/**`, `tools/**`, `dist/**`; mọi phép thử đột biến đều trên **bản sao** trong `tests/tmp/t133/`.
`tests/tmp/t132/**` là **chỉ đọc** — đó chính là artifact phải nguyên vẹn.

## Cách chạy

```
node tests/t133-analyze-idempotent.mjs                 # 12 ca, 0 boot, ghi tests/tmp/t133/run-<stamp>/
node tests/t132-panel-runtime.mjs --analyze tests/tmp/t132   # lệnh verify của card t132 (phải PASS 9/9, EXIT 0)
```

Exit 0 = 12/12 ca đạt. Số boot Host đã dùng: **0** (trần của card là 0).

## Hai lỗ đã vá (nguyên nhân, không chỉ triệu chứng)

**F1 — `--analyze` ghi đè artifact đang chấm.** Mã cũ luôn `fs.writeFileSync` `results.json` và `run-meta.json`, nên lần chấm
sau đọc lại chính kết quả vừa được ghi: artifact bị sửa tay sẽ được lần chấm trước TỰ CHỮA ⇒ FAIL không tái lập được.
Nay toàn bộ phép ghi đi qua `emit_(file, content)`, chỉ ghi khi `WRITE_ARTIFACTS === true` (chế độ fresh).
Chế độ `--analyze`: không `mkdir`, không ghi, `analyze.marker.json` bị bỏ hẳn, và bundle cũ (`old-client.js`) được lấy
**trong bộ nhớ** từ `git show HEAD` thay vì ghi ra `tests/tmp/t132/`.

**F2 — CLI fail-open.** Mã cũ: cờ lạ ⇒ chạy run mới + EXIT 0; `--analyze <thư mục không có results.json>` ⇒ lặng lẽ chấm run
mới nhất; và C9 coi artifact không đọc được là ĐẠT. Nay có `parseCli` + `resolveAnalyzeTarget` fail-closed, chạy **trước**
mọi `mkdir`/ghi: cờ lạ, `--analyze` thiếu giá trị, `--analyze --strict` (chồng cờ), đường dẫn không tồn tại ⇒ **EXIT 2** kèm
thông điệp nêu đúng đường dẫn. C9 nay đòi đọc được `results.json` và đúng `domPlain.order.measured`, thiếu là KHÔNG ĐẠT.

## 12 ca và số đo thật (`tests/tmp/t133/run-2026-11-01T04-17-37-055Z`)

| Ca | Nội dung | Số đo thật |
| --- | --- | --- |
| A1 | `--analyze` trên artifact THẬT: PASS 9/9, EXIT 0, không ghi kết quả | `verdict PASS — proved C1..C9 — unproved (none)`; dòng cuối `ghi results.json: KHONG (che do --analyze chi doc)` |
| A2 | **F1:** sha256 + bytes + mtime của MỌI tệp trong `tests/tmp/t132` không đổi sau 2 lần chấm | `tep=40 run-dir truoc=4 sau=4 · khong tep nao doi (idempotent)` |
| A3 | **F1:** artifact bị đảo index (`DependencyMap 2587 ↔ AddMemberControl 5168`) ⇒ chấm HAI lần liên tiếp | lần 1 `exit=1 verdict FAIL — proved C1..C8 — unproved C9`; lần 2 y hệt; sha `65dcc762ec0a` không đổi qua 2 lần |
| A4 | **F2:** `--bogus` ⇒ EXIT 2, không sinh run mới | `exit=2`, stderr `co khong ho tro: --bogus`, run-dir 4/4, tệp đổi=0 |
| A5 | **F2:** `--analyze` thiếu giá trị | `exit=2`, `--analyze thieu gia tri (can duong dan run-dir)`, tệp đổi=0 |
| A6 | **F2:** `--analyze --strict` (chồng cờ) | `exit=2`, `--analyze thieu gia tri: gap co --strict thay vi duong dan` |
| A7 | **F2:** `--analyze <path không tồn tại>` | `exit=2`, `duong dan khong ton tai: tests/tmp/t133/khong-ton-tai-… (-> E:\…\khong-ton-tai-…)` |
| A8 | **F2:** `--strict` trên thư mục chứa nhiều run-dir | `exit=2`, `--strict: tests/tmp/t132 chua 4 run-dir — hay tro thang vao run-dir can cham` |
| A9 | wrapper `tests/t132-panel-dom-order.mjs` giữ NGUYÊN mã thoát | tampered ⇒ **1**, `--bogus` ⇒ **2**, path sai ⇒ **2** (không nhánh nào thành 0) |
| A10 | 3 đối chứng âm cũ vẫn đỏ đúng văn bản | C6 `must precede` · C7 `must precede` · C8 `missing DependencyMap (needle data-dependency-map)` |
| A11 | `node --check` 2 tệp `.mjs` | cả hai `exit=0` |
| A12 | hồi quy cuối: artifact THẬT vẫn PASS 9/9 EXIT 0 và vẫn không bị ghi | `tep doi sau ca phien=0` |

Đo lặp lại được: lần chạy thứ hai của cả bộ (sau khi sửa một dòng lỗi cú pháp trong chính test) cho cùng 12/12 và cùng bộ số đo.

## Quyết định cần captain biết (xung đột trong hợp đồng)

Card yêu cầu `--analyze <thư mục không có results.json>` ⇒ EXIT 2, nhưng **lệnh verify của chính card** là
`--analyze tests/tmp/t132` — một thư mục cha chỉ chứa 4 `run-*`, tức đúng trường hợp đó. Hai yêu cầu không thể cùng đúng.
Cách xử lý đã chọn (thu hẹp phạm vi fail-closed, không nới phép kiểm nào):

1. Đường dẫn **không tồn tại / không phải thư mục / không có `results.json` và cũng không có `run-*` nào** ⇒ EXIT 2.
2. Thư mục cha **có** `run-*` ⇒ chấp nhận, nhưng in rõ `container 4 run-dir -> moi nhat <rel>` để không ai tưởng nó chấm bừa.
3. Thêm cờ `--strict` để từ chối đúng trường hợp (2) — ai cần fail-closed tuyệt đối thì dùng cờ này.
   Đo thật khi chạy lệnh verify của card: `--analyze tests/tmp/t132` in ra
   `container 4 run-dir -> moi nhat tests/tmp/t132/run-2026-11-01T04-11-07-844Z` và chấm run đó (PASS 9/9, EXIT 0).
   Run mới nhất này chính là thư mục rác do lỗi fail-open CŨ sinh ra — nó cũng đạt 9/9, nên không che giấu hỏng hóc nào.

## Giới hạn

1. Idempotent được chứng minh cho **artifact t132** trên máy này (đường dẫn profile đã cài tuyệt đối). Máy khác phải cài lại
   bộ byte t130 rồi mới chạy được; C1 của bộ đo t132 sẽ đỏ nếu bundle bị thay.
2. A2/A12 chứng minh **không tệp nào bị ghi**, không chứng minh 'không có syscall ghi' ở mức hệ điều hành (không dùng strace).
3. Bộ đo vẫn dùng SSR (`react-dom/server`) + stub-hooks, **không** phải DOM sống trong GUI Host — giới hạn này giữ nguyên từ t132.
4. `tests/tmp/t132/analyze.marker.json` là tệp rác do mã CŨ sinh ra trước bản vá; nó được giữ nguyên (không xoá) và cũng
   không bị ghi nữa — vì `tests/tmp/t132/**` nằm ngoài phạm vi được sửa của task này.
5. Trần shell của card là ≤30 lệnh, đã dùng 7; trần tệp ghi ≤5, đã dùng đúng 5.
