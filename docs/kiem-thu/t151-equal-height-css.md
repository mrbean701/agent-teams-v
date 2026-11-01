# t150 — hai cột bằng nhau bằng CSS, không phụ thuộc thời điểm JS (thay cơ chế của t148)

Card `t150` (subject ghi t151 là lỗi của captain — ledger cấp id t150), attempt `5a157df9-41ab-4cac-b0d8-7861f5683f53`.

## 1. Vì sao t148 sai TRÊN APP THẬT

t148 đo cột trái bằng `ResizeObserver` trong `useLayoutEffect(..., [])` rồi gán `--member-column-height`.
Trên app (bộ byte vòng 24, 1080px): cột trái bắt đầu y≈187 và kéo quá đáy, cột phải cùng y≈187 nhưng kết thúc
có bo góc ở y≈1040 ⇒ lệch ~170px. Nguyên nhân: effect chạy đúng một lần khi `memberColumnRef.current` còn `null`,
`observeColumnHeight(null, …)` trả `null`, deps `[]` nên không bao giờ chạy lại ⇒ biến không được gán ⇒ `height:auto`
⇒ cột phải cao theo nội dung DAG. Cơ chế đúng nhưng PHỤ THUỘC THỜI ĐIỂM ⇒ bỏ hẳn.

## 2. Cơ chế mới (CSS-only, nguyên văn)

DOM không đổi (card vẫn là CON TRỰC TIẾP của `section.team[data-workspace-team]`, đúng như t142 đã pin):

```html
<section class="aYQbCq_team" data-workspace-team="true">
  <header class="aYQbCq_teamHead">…</header>
  <section class="aYQbCq_delegationSection" data-delegation-map="true">…</section>   <!-- CỘT TRÁI -->
  <section class="aYQbCq_dependencySection" data-dependency-map="true">…</section> <!-- CỘT PHẢI -->
  <div class="aYQbCq_workspaceSummary">…</div>
</section>
```

```css
/* rule gốc, mọi khổ: card tự cuộn, và là fallback cho chế độ hẹp */
.aYQbCq_team[data-workspace-team]>.aYQbCq_dependencySection{overscroll-behavior:contain;min-width:0;max-height:56vh;overflow-y:auto}

/* khối rộng (đặt ở CUỐI tệp) — không đo, không JS */
@container (width>=800px){.aYQbCq_team[data-workspace-team]>.aYQbCq_dependencySection{align-self:stretch;contain:size;max-height:none}}
```

**Vì sao chiều cao HÀNG do cột TRÁI quyết định:** `contain:size` (size containment) làm chiều cao nội tại của card
bằng 0 khi trình duyệt tính kích thước hàng — nội dung DAG 36 802px không còn đóng góp gì vào hàng. Hàng grid vì thế
chỉ còn được quyết định bởi `section.delegationSection` (cột trái: captain + ProgressOverview + add-member + danh sách).
`align-self:stretch` kéo card cao đúng bằng hàng đó; `max-height:none` bỏ trần 56vh trong khối rộng để card khớp cả khi
cột trái cao hơn viewport; `overflow-y:auto` (từ rule gốc) giữ DAG cuộn NỘI BỘ. Form Add member mở/đóng chỉ làm cột trái
đổi chiều cao ⇒ hàng đổi ⇒ card đổi theo, cùng một nhịp vẽ, không có bước đo nào có thể trượt.

**Vì sao không dùng đúng thẻ `height:0` + card `position:absolute; inset:0` như gợi ý:** một ô `height:0` là
containing block của card tuyệt đối, nên `inset:0` cho card cao 0px — phải thêm một lớp nữa để ô đó vẫn được kéo cao
(ví dụ `contain:size` trên ô + card `height:100%`). `contain:size` đặt thẳng trên card cho cùng kết quả với ít bước hơn
và không cần thêm node/z-index. Đây là chỗ tôi quyết định khác gợi ý (ghi để captain chấm).

## 3. ĐO THẬT (Chromium của host, viewport 1280×800 ⇒ 56vh = 448px)

Trang: `tests/tmp/t148/page.html` (giữ tên cũ; builder `tests/tmp/t148/build-page.mjs` + `entry.js`) — nạp
CHÍNH `lib/client.js` đã build (bundle `ActivityPanel.js` qua esbuild cho browser, class thật `aYQbCq_*`) + CSS thật,
mount `TeamSection` bằng `createRoot` + `flushSync`, đọc `getBoundingClientRect()`. KHÔNG chèn số.

| ca | cột TRÁI `[data-delegation-map]` | cột PHẢI `[data-dependency-map]` | delta | ghi chú |
| --- | --- | --- | --- | --- |
| rộng 1200px, form ĐÓNG (40 task, 3 member) | 935.33 px | 935.33 px | **0.00 px** | cùng hàng; `footerGap` 16px |
| rộng 1200px, form MỞ | 1257.86 px | 1257.86 px | **0.00 px** | trái +322.53, phải +322.53 |
| hẹp 700px, form ĐÓNG | 718.59 px | 448 px | −270.59 px | xếp DỌC (`sameRow=false`), phải = 56vh đúng chủ ý |
| hẹp 700px, form MỞ | 1041.13 px | 448 px | −593.12 px | vẫn dọc, vẫn 56vh |
| 400 task, 1 member (DAG khổng lồ) | 490.17 px | 490.17 px | **0.00 px** | DAG cuộn nội bộ (đo ở t148: `dagViewport` 36 802px/293px) |
| **cột trái cao hơn viewport** (30 member) | 4701.94 px | 4701.94 px | **0.00 px** | `max-height:none` ⇒ KHÔNG bị cắt ở 56vh, `footerGap` 16px ⇒ không tràn đè footer |

## 4. A1..A6

| mục | bằng chứng |
| --- | --- |
| A1 cơ chế không phụ thuộc JS | §2 (CSS nguyên văn) + bảng §3 (delta 0.00 ở mọi ca rộng) + t128 `H3` (rule rộng có `contain:size` + `align-self:stretch` + `max-height:none`, rule gốc giữ `56vh` + `overflow-y:auto`) |
| A2 đo bằng bundle đã build | bảng §3: rộng/đóng delta 0.00, rộng/mở delta 0.00, hẹp 700 = 448 (56vh) và `sameRow=false` |
| A3 cột trái cao hơn viewport | ca 30 member: 4701.94 / 4701.94, delta 0.00, `footerGap` 16px (footer nằm dưới, không bị đè), không kẹt ở 448 |
| A4 wiring cũ | xoá hẳn: `memberColumnHeight`, `memberColumnRef`, `observeColumnHeight`, `observedColumnHeight`, `--member-column-height` không còn trong panel lẫn bundle; t128 `H1` (âm) + `H2` (đối chứng âm: chèn lại ⇒ đỏ) |
| A5 pin + đối chứng âm | t10 = `67d616a6…`/258 925; t59 3 dòng FROZEN (client.js, map, CSS) = `67d616a6…`, `718f4154…`, `21018682…`; t128 `H4` 4 phép phá: bỏ `contain:size` (−13 B), đặt lại trần 56vh trong khối rộng (0 B), bỏ `align-self:stretch` (−19 B), bỏ trần fallback hẹp (−16 B) ⇒ cả 4 đều ĐỎ |
| A6 hồi quy | t128 33/33 · t10 50/50 · t129 13/13 · t113 38/38 · t114 16/16 · t98 `--strict` GREEN — tất cả EXIT 0, 0 boot |

## 5. Không chứng minh được / giới hạn (nói thẳng)

- Số đo §3 là Chromium của host trên trang tự dựng (viewport 1280×800), KHÔNG phải app desktop 1080px; cơ chế thì độc lập
  kích thước (delta 0 ở cả 4701px), nhưng con số tuyệt đối trên app sẽ khác.
- Lý do 'ô `height:0` + `inset:0` cho card 0px' là SUY LUẬN THEO SPEC CSS (containing block), tôi KHÔNG dựng phép đo riêng cho
  biến thể đó; nếu captain muốn bằng chứng cho nhánh này thì cần thêm 1 trang đo.
- `contain:size` cần trình duyệt hỗ trợ size containment (Chromium ≥52, Firefox ≥69, Safari ≥15.4). Nếu thiếu, card quay về
  `height:auto` + trần 56vh (rule gốc) — không sập, chỉ không bằng nhau.
- Chưa đo trên app thật sau khi cài vòng 25 (0 boot theo trần card); cần captain cài + `Ctrl+R` rồi đo lại như §1.
