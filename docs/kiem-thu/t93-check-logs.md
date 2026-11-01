# t93/t91/t95 — cổng kiểm bảy nhóm log bắt buộc (`tools/check-logs.mjs`)

Vì sao có tệp này: goal §6 đòi **bảy nhóm log** (BA, CHECK, TEST, BUG, HANDLE, AUDIT, ACTIVITY) luôn phản ánh
vòng mới nhất. Không có công cụ nào phát hiện "log cũ" nên ACTIVITY và BA đã tụt hẳn khỏi vòng 11–12 mà không ai
biết. Công cụ này biến "log cũ" từ một thứ phải tự nhớ thành một cổng chấm được; suite `tests/t93-check-logs.mjs`
chứng minh cổng đỏ đúng chỗ — và t95 là lần siết lại chính cổng đó sau khi captain tìm ra một chế độ hỏng.

## Cách dùng

```
node tools/check-logs.mjs                              # chấm repo hiện tại: exit 0/1, in từng log
node tools/check-logs.mjs --summary                    # đúng MỘT dòng đếm
node tools/check-logs.mjs --root <dir>                 # chấm một cây khác (fixture trong test dùng cái này)
node tools/check-logs.mjs --json                       # JSON cho máy đọc
node tools/check-logs.mjs --allow-missing-round        # bỏ qua phép kiểm độ mới khi header KHÔNG khai vòng
node tests/t93-check-logs.mjs                          # suite 20 ca; --keep để giữ fixture
```

Exit: **0** = không có lỗi (có thể kèm cảnh báo) · **1** = ít nhất một lỗi · **2** = lỗi dùng công cụ.
Công cụ **chỉ đọc**: ca a12 (sha256 cả cây fixture) và a19 (sha256 của 7 log thật) chứng minh trước == sau.

## Bốn phép kiểm cho mỗi log

1. **Tồn tại** — thiếu tệp là lỗi (nêu đúng đường dẫn tương đối).
2. **Có tiêu đề mục** — phải có ít nhất một tiêu đề cấp ≥ 2; tệp rỗng 0 byte là lỗi riêng.
3. **Không có mục rỗng** — mục rỗng = tiêu đề cấp ≥ 2 mà phần thân **không có chữ VÀ không có mục con**.
4. **Không phải log cũ** — số vòng mới nhất **đọc từ header `docs/TODO.md` mỗi lần chạy** (`Đếm (t1–tNN)` + mọi
   `vòng N` / `round N` trong header, tới hàng bảng đầu tiên), **không hardcode** ⇒ vòng sau tự động được kiểm.

## t95 — phát hiện của captain và lý do đổi mặc định

Captain tự dựng fixture riêng `tests/tmp/cap91-fixture`: header chỉ có `Đếm (t1–t93)` (**không có chữ "vòng N"**)
và 7 log đều ở vòng 7. Bản đầu của cổng trả `ok=7 fail=0 problems=0 skipped (header không khai vòng)` **EXIT 0** —
tức cổng **bỏ qua phép kiểm độ mới trong im lặng**: chỉ cần quên khai vòng trong header là log cũ đi qua tự do.
Đây đúng là chế độ hỏng mà công cụ sinh ra để chặn, nên mặc định đã đổi thành **LỖI**; bỏ qua chỉ khi có cờ
**`--allow-missing-round`** (tường minh, và khi đó vẫn cảnh báo + summary ghi rõ `skipped (--allow-missing-round)`).

Đo thật trên đúng fixture cap91 (fixture dựng lại trong suite dưới `tests/tmp/t93-check-logs/<stamp>/`, tự dọn):

| Lệnh | Kết quả đo được | Exit |
| --- | --- | --- |
| `--root <cap91> --summary` | `SUMMARY logs=7 ok=7 fail=0 warnings=0 problems=1 newest_round=missing (header docs/TODO.md không khai vòng mới nhất) newest_task=93` | **1** |
| `--root <cap91> --summary --allow-missing-round` | `SUMMARY logs=7 ok=7 fail=0 warnings=1 problems=0 skipped (--allow-missing-round) newest_task=93` | **0** |
| `--root <cap91>` (full) | dòng `FAIL header: header docs/TODO.md không khai vòng mới nhất (không có "vòng N"/"round N" nào trong header) — khai vòng trong header, hoặc dùng cờ --allow-missing-round nếu thật sự muốn bỏ qua phép kiểm độ mới` + `WARN header: …` khi có cờ | 1 / 0 |

Bốn tình huống của hợp đồng (đo thật, fixture trong `tests/tmp/**`, đã dọn sạch):

| Header | Log | Kết quả | Exit |
| --- | --- | --- | --- |
| prose `audit vòng 12` | vòng 7 (cũ) | `ok=3 fail=4 warnings=3 problems=4 newest_round=12` — báo `log cũ` cho BA/CHECK/AUDIT/ACTIVITY | **1** |
| prose `audit vòng 12` | vòng 12 | `ok=7 fail=0 warnings=0 problems=0 newest_round=12` | **0** |
| **không có vòng** | vòng 12 (mới) | `ok=7 fail=0 warnings=0 problems=1 newest_round=missing (…)` — lỗi nằm ở **header**, không cứu được bằng log đúng | **1** |
| **không có vòng** + `--allow-missing-round` | vòng 12 | `warnings=1 problems=0 skipped (--allow-missing-round)` | **0** |

## Trạng thái repo thật (lượt 1 đỏ vì dữ liệu, lượt 2 xanh)

Lượt chạy đầu (attempt 1) cổng đỏ trên repo: `SUMMARY logs=7 ok=4 fail=3 warnings=3 problems=3 newest_round=13
newest_task=95`, **EXIT 1** — header `docs/TODO.md:4` khi đó khai "vòng 13 ĐANG MỞ" trong khi **BA, AUDIT, ACTIVITY**
mới tới vòng 12. Cổng đỏ **đúng**, và ba log đó nằm ngoài inScope của t95 (brief cấm sửa `docs/log/**`) nên đây là
việc dữ liệu phải chuyển cho chủ vòng 13 — không phải lỗi công cụ. Captain xử lý ở phía DỮ LIỆU bằng cách sửa ngữ nghĩa
header (`vòng 12 là vòng ĐÃ ĐÓNG gần nhất; V13 đang mở: t94 → t96 pack → t97 audit` — chữ `V13` không khớp regex
`vòng N`), **không nới phép kiểm nào**: cổng vẫn đòi 7 log phủ vòng mới nhất đã đóng.

Đo lại ở lượt 2: `node tools/check-logs.mjs --summary` ⇒ `SUMMARY logs=7 ok=7 fail=0 warnings=3 problems=0
newest_round=12 newest_task=95`, **EXIT 0**; `node tests/t93-check-logs.mjs` ⇒ `TỔNG 20/20 ca ĐẠT, 0 HỎNG`, **EXIT 0**.
Vì một cổng như vậy có thể đỏ **hợp lệ** trong khoảng giữa "header đã khai vòng mới" và "log đã viết xong vòng mới",
ca a1/a2/a18 (chạy trên repo thật) chấm **tính trung thực của cổng** (exit khớp `problems` của chính nó, mỗi log đỏ
nêu đúng tên, cờ quên-vòng không làm đổi kết quả) thay vì khẳng định "repo sạch" — **captain đã xác nhận chấp nhận**
cách chấm này (finding F2 của t95), nên không cần đổi assert.

## Số đo 7 log (đo lúc t91, 2026-10-31T22:19Z — khi repo còn ở vòng 12)

| Log | Dòng | Mục (cấp ≥2) | Vòng mới nhất trong log | Kết luận |
| --- | --- | --- | --- | --- |
| BA | 99 | 14 | 12 | OK ở vòng 12 (trước t91: vòng 5 ⇒ FAIL) |
| CHECK | 347 | 37 | 12 | OK ở vòng 12 |
| TEST | 95 | 2 | 2 | OK + **cảnh báo** (xếp theo `TG-TEST-##`) |
| BUG | 155 | 20 | 7 | OK + **cảnh báo** (xếp theo `BUG-###`) |
| HANDLE | 62 | 8 | 3 | OK + **cảnh báo** (bảng xử lý theo ID) |
| AUDIT | 226 | 19 | 12 | OK ở vòng 12 |
| ACTIVITY | 216 | 22 | 12 | OK ở vòng 12 (trước t91: vòng 6 ⇒ FAIL) |

## Suite `tests/t93-check-logs.mjs` — 20 ca, EXIT 0

| Ca | Nội dung | Kỳ vọng |
| --- | --- | --- |
| a1 | repo thật | exit khớp `problems`, đúng 1 dòng `SUMMARY logs=7`, mỗi log đỏ nêu đúng tên |
| a2 | `--summary` trên repo | đúng 1 dòng, bắt đầu `SUMMARY logs=7`, exit khớp `problems` |
| a3 | fixture đủ 7 log cùng vòng 12 | exit 0 |
| a4 | **thiếu** `docs/log/TEST.md` | exit 1 + `thiếu tệp docs/log/TEST.md` |
| a5 | log **chỉ có tiêu đề** | exit 1 + `mục rỗng` |
| a6 | header vòng 12 + log vòng 7 | exit 1 + `log cũ` |
| a7 | `BA.md` rỗng 0 byte | exit 1 + `tệp rỗng` |
| a8 | log không có tiêu đề mục | exit 1 + `không có tiêu đề mục` |
| a9 | header **không khai vòng**, KHÔNG cờ (**t95 đổi kỳ vọng**) | exit 1 + `problems>=1` + nêu thiếu vòng mới nhất |
| a10 | `--json` | parse được, `newestRound=12`, `entries=7`, `allowMissingRound=false` |
| a11 | đối chứng **âm**: cây không có `docs/TODO.md` | exit 1 + đã **dọn sạch** |
| a12 | công cụ chỉ đọc | sha256 cả cây fixture trước == sau |
| a13 | không có đường dẫn tuyệt đối trong công cụ + suite | 0 hit (mẫu ghép lúc chạy) |
| a14 | header không vòng + log vòng **mới nhất** | exit 1 + `problems>=1`, `fail=0` (lỗi ở header) |
| a15 | header không vòng + `--allow-missing-round` | exit 0, `problems=0`, `warnings>=1`, `skipped (--allow-missing-round)` |
| a16 | **đúng fixture cap91** (header không vòng + 7 log vòng 7) | exit 1 + `problems>=1` + nêu thiếu vòng (trước t95: exit 0) |
| a17 | cap91 + `--allow-missing-round` | exit 0 + `warnings>=1` + `skipped (--allow-missing-round)` |
| a18 | cờ allow trên repo thật (header **có** vòng) | không đổi `problems`/exit, không ghi `skipped` |
| a19 | chỉ-đọc trên **7 log thật** | sha256 trước == sau khi chạy 4 biến thể lệnh (`f99183fdc6a7` cả hai) |
| a20 | dọn fixture theo mặc định | `tests/tmp/t93-check-logs/<stamp>` không còn |

## Giới hạn (đã biết, chưa vá)

- **TEST / BUG / HANDLE không dùng từ vựng "vòng"**: chúng xếp theo ID (`TG-TEST-##`, `BUG-###`, bảng xử lý) nên
  cổng chỉ **cảnh báo** chứ không FAIL. Muốn chặn hẳn phải sửa chính ba log đó (ngoài inScope) hoặc đổi cách xếp mục.
- **Cổng đỏ giữa hai mốc "header đã khai vòng mới" và "log đã viết xong vòng mới"** — đúng thiết kế (nó là lý do
  t95 tồn tại), nhưng nghĩa là `node tools/check-logs.mjs` trên repo sẽ đỏ trong lúc một vòng đang mở.
- Phép kiểm "mục rỗng" **không bóc code fence**: tiêu đề viết trong khối ``` vẫn bị tính là tiêu đề.
- Cổng chấm **cấu trúc + độ mới theo vòng**, không chấm nội dung đúng/sai của từng hàng (việc đó là của CHECK/AUDIT).
- Chưa nối vào runner: hiện là lệnh chạy tay; muốn thành hồi quy thì phải gọi trong sweep (ngoài inScope).
