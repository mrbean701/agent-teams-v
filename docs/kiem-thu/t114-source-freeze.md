# t114 — cổng đóng băng nguồn trước/sau boot sống (đóng BUG-028)

Mục tiêu: suite sống `tests/t59-erp-live-copy.mjs` phải TỰ CHỨNG MINH rằng boot headless chạy trên đúng byte mã nguồn mà tài liệu mô tả —
trước và sau mỗi boot — thay vì chỉ in một hash ra cho người đọc tin.

## 1. Cửa sổ BUG-028 (vì sao cần cổng này)

Hai lần chạy sống liền nhau đọc CÙNG một profile (symlink tới `packages/dsh-agent-teams`) lại in hai tiêu đề khác nhau:

| Thời điểm (UTC) | Tiêu đề phiên trả về | Ghi chú |
| --- | --- | --- |
| 2026-11-01T00:xx | `Members (7 present + 7 removed)` | khớp mã `lib/tools.js:3328` |
| 2026-11-01T01:03:11Z | `Members (7 active + 7 removed)` | chữ CŨ, không có trong cây |
| 2026-11-01T01:04:48Z | `lib/tools.js` được ghi lại (213 071 B, `88dbee4079f95ffd…`) | mtime của tệp DUY NHẤT trong `lib/` đổi |
| 2026-11-01T01:09:18Z | `Members (7 present + 7 removed)` | xanh trở lại |

Kết luận điều tra (captain, m01694): cả hai profile dogfood là symlink vào cùng thư mục nguồn, nên một boot chỉ có thể đọc nội dung CŨ
nếu chính `lib/tools.js` đã bị một tiến trình KHÔNG CHỦ ghi bằng bản cũ trong cửa sổ 01:00:54–01:03:11Z rồi trả lại byte mới lúc 01:04:48Z.
Không tìm được tiến trình nào trong nhật ký của tôi; sự cố được ghi thành BUG-028 (medium) với hai bài học:

1. Assertion phải đọc được artefact LỊCH SỬ ⇒ regex `(?:present|active)` trong C4 là đúng, nhưng lý do là "đọc được bản ghi cũ", KHÔNG phải "sản phẩm dao động".
2. `ERR_MODULE_NOT_FOUND: Cannot find package '@nami/dsh-agent-teams'` ở lần chạy 01:08:08Z là lỗi MÔI TRƯỜNG (profile bị relink đồng thời), không phải lỗi plugin.

## 2. Cổng chạy thế nào

| Mảnh | Ở đâu | Việc |
| --- | --- | --- |
| `FROZEN` (13 dòng) | `tests/t59-erp-live-copy.mjs`, ngay sau `const PKG` | bảng ĐO MỚI trong t114: `{ path, sha256, bytes }` cho 12 tệp `lib/**` + `package.json` |
| `sourceHashesOf(root)` | cùng tệp | đọc sha256 + số byte của đủ 13 tệp, trả `[{ path, sha, bytes }]` |
| `bootFingerprint(boots, name, args, prompt)` | cùng tệp | hash TRƯỚC → chạy `runSession` → hash SAU, push `{ name, before, after }` |
| `sourceProblemsOf(boots, frozen)` | cùng tệp (hàm THUẦN) | trả danh sách lỗi: lệch before/after, bytes khác bảng, lần đọc đầu/cuối khác bảng, không ghi hash, không có boot nào |
| `meta.source` | `tests/tmp/t59/run-*/meta.json` | `{ frozen: 't114', boots: [...], files: [{ path, shaBefore, shaAfter, bytes }] }` |
| `check('C10', …)` | cùng tệp | ĐỎ nếu bất kỳ tệp nào lệch; evidence in từng tệp `shaBefore = shaAfter` |

Câu báo lỗi cố định khi lệch (`SOURCE_DRIFT_NOTE`):

> nguồn đã bị ghi trong lúc suite chạy — bảng đóng băng phải được cập nhật trong CHÍNH task đổi lib/**

## 3. Quy ước cập nhật bảng

Bảng `FROZEN` KHÔNG phải bảng của `tests/t108-pack.mjs`. Bảng đó ghim `lib/tools.js: d402c6586df1e140` — một cây CŨ hơn
(hiện tại `88dbee4079f95ffd`) và là artefact-scoped: nó cố tình đỏ khi nguồn đổi, nên không dùng làm mốc cho suite sống.

Quy ước: **ai đổi `lib/**` hoặc `package.json` thì cập nhật 13 dòng trong `FROZEN` NGAY TRONG CÙNG TASK đó**,
kèm mốc đo mới trong comment đầu bảng. Không có bước này thì mọi lần chạy t59 sau đó sẽ đỏ ở C10 vì lý do hợp lệ nhưng gây nhiễu.

## 4. Bằng chứng (máy chạy)

| Lệnh | Kết quả |
| --- | --- |
| `node tests/t114-source-freeze.mjs` | 16/16, EXIT 0 |
| `node tests/t59-erp-live-copy.mjs` | PASS C1..C10, EXIT 0, run `run-2026-11-01T01-23-45-221Z`, boots=`['write']` |

Suite tĩnh `tests/t114-source-freeze.mjs` cắt chính các hàm trên ra khỏi t59 rồi chạy thật, gồm cả đối chứng âm:

| # | Phép kiểm | Kết quả |
| --- | --- | --- |
| A1 | bảng FROZEN đúng 13 dòng, 64 hex, bytes > 0, path duy nhất | PASS |
| A2 | `sourceHashesOf` trả đúng 13 record trên cây thật | PASS |
| A3 | mọi dòng frozen trùng số đo trực tiếp trên cây | PASS |
| A4 | regex-parse bảng == đọc trực tiếp (0 drift, không hardcode lần hai) | PASS |
| B1 | copy 13 tệp vào `tests/tmp/t114/tree` là byte-faithful | PASS |
| B2 | lật 1 byte ⇒ sha đổi, in CẢ HAI sha | PASS |
| B3 | `sourceProblemsOf` báo lệch (applies=true, delta 0 B) | PASS |
| B4 | bỏ 1 byte ⇒ applies=true, delta = −1 B | PASS |
| E1 | pin sai 1 hex ⇒ bị từ chối; bảng nguyên vẹn ⇒ 0 problem | PASS |
| E1b | pin `bytes+1` ⇒ delta = +1 B, bị từ chối | PASS |
| E2 | không có boot / thiếu 1 tệp ⇒ bị từ chối | PASS |
| C1 | thiếu `lib/index.js` ⇒ ENOENT nêu tên tệp | PASS |
| W1 | cả boot `mint` lẫn `write` đều qua `bootFingerprint` | PASS |
| W2 | C10 được nuôi bởi `sourceProblemsOf(sourceBoots, FROZEN)` và có cổng + câu drift note | PASS |
| W3 | boolean của C10 có răng: `[]+1boot=true`, `['drift']+1boot=false`, `[]+0boot=false` | PASS |
| W4 | câu drift note đúng nguyên văn hợp đồng | PASS |

## 5. Giới hạn — điều cổng này KHÔNG chứng minh

1. Cổng bắt được "boot chạy trên byte KHÁC mã mà tài liệu mô tả". Nó **KHÔNG** bắt được "ai đó ghi rồi trả lại ĐÚNG byte cũ" trong
   khoảng giữa hai lần đọc: cả before lẫn after đều trùng bảng nên C10 xanh. BUG-028 chỉ lộ ra vì hai boot LIỀN NHAU in hai tiêu đề khác nhau —
   tức nhờ so sánh ĐẦU RA, không nhờ hash.
2. Cửa sổ quan sát là "trước boot / sau boot", không phải "trong lúc boot": ghi xen giữa hai lần hash trong cùng một boot là vô hình.
3. `--analyze` chỉ đọc `meta.checks` đã lưu và đo lại sha tệp ERP; nó KHÔNG đọc lại cây nguồn, nên không phải bằng chứng về nguồn hiện tại.
4. Trần: 3 boot sống; t114 dùng 2 (một cho lần chạy giữa, một cho lần xác nhận cuối). Mọi phép thử lệch dùng BẢN COPY trong `tests/tmp/t114`, không sửa `packages/dsh-agent-teams/**`.