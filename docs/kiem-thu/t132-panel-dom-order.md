# t132 — thứ tự panel: điểm vào của contract (wrapper)

Card t132 khai lệnh verify `node tests/t132-panel-dom-order.mjs --analyze tests/tmp/t132`, trong khi mail
m01773 của captain đặt tên bộ đo là `tests/t132-panel-runtime.mjs`. Tôi giữ cả hai:

- `tests/t132-panel-runtime.mjs` — toàn bộ phép đo (lớp A tĩnh, lớp B/DOM bằng `react-dom/server`, lớp B/TREE,
  3 đối chứng âm, chế độ `--analyze`). Đây là tệp chứa bằng chứng.
- `tests/t132-panel-dom-order.mjs` — wrapper mỏng: chuyển tiếp argv nguyên vẹn sang tệp trên và giữ nguyên mã thoát
  (0 = 9/9 đạt, 1 = có ca hỏng, 2 = wrapper/harness không chạy được). Không có logic đo nào bị chép đôi.

Vì vậy lệnh verify của card chạy đúng bộ đo thật, còn tên tệp mà captain yêu cầu vẫn tồn tại và tự chạy được.

Cách đọc kết quả (bảng 9 ca, số đo, giới hạn): xem `docs/kiem-thu/t132-panel-runtime.md`.
Giới hạn quan trọng nhất: **chưa** chứng minh DOM sống trong trình duyệt của GUI Host; mức đạt được là HTML do
`react-dom/server` sinh từ chính bundle đã cài, cộng cây phần tử do jsx-runtime giả ghi lại.

## Mã thoát của wrapper đã được kiểm bằng đối chứng (t133)

`tests/t133-analyze-idempotent.mjs` ca A9 chạy wrapper 3 lần và đòi đúng mã: artifact bị sửa ⇒ **1**, cờ lạ `--bogus` ⇒ **2**,
`--analyze <path không tồn tại>` ⇒ **2**. Wrapper không bao giờ biến lỗi thành 0 (nhánh `run.error`/`run.signal` cũng trả 2).
