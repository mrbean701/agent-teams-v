# t148 — cột Task dependencies cao BẰNG cột member và co giãn theo form Add member

Card `t148`, attempt `d17ee18b-f2be-4fb7-b9a4-dcd3ce3a2f97`.
Yêu cầu người dùng (m08276): *"cột dependencies phải dài bằng cột list member và khi mở form add-member thì cột
dependencies cũng sẽ dài ra tương tự khi đóng lại thì tự động thu gọn để đồng bộ với list member"*.

## 1. Wiring (nguyên văn, `packages/dsh-agent-teams/lib/client/ActivityPanel.js`)

```js
export function observedColumnHeight(entry) {
    if (entry === undefined || entry === null) return null;
    const border = entry.borderBoxSize;
    const borderSize = Array.isArray(border) ? border[0] : border;
    let raw = NaN;
    if (borderSize !== undefined && borderSize !== null && typeof borderSize.blockSize === 'number') raw = borderSize.blockSize;
    else if (entry.contentRect !== undefined && entry.contentRect !== null && typeof entry.contentRect.height === 'number') raw = entry.contentRect.height;
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const rounded = Math.round(raw);
    return rounded > 0 ? rounded : null;
}
export function observeColumnHeight(node, apply) {
    const Observer = typeof ResizeObserver === 'undefined' ? undefined : ResizeObserver;
    if (node === undefined || node === null || typeof node.getBoundingClientRect !== 'function') return null;
    if (typeof Observer !== 'function' || typeof apply !== 'function') return null;
    const observer = new Observer((entries) => {
        for (const entry of entries) {
            const height = observedColumnHeight(entry);
            if (height !== null) apply(height);
        }
    });
    observer.observe(node);
    return () => { observer.disconnect(); };
}
```

Trong `TeamSection`:

```js
const [memberColumnHeight, setMemberColumnHeight] = useState(0);
const memberColumnRef = useRef(null);
useLayoutEffect(() => {
    const disconnect = observeColumnHeight(memberColumnRef.current, setMemberColumnHeight);
    return disconnect === null ? undefined : disconnect;
}, []);
// ... cột trái: _jsxs("section", { ref: memberColumnRef, className: css.delegationSection, … })
// ... cột phải: _jsx(DependencyMap, { …, columnHeight: memberColumnHeight > 0 ? memberColumnHeight + 'px' : undefined })
// ... trong DependencyMap: style: columnHeight === undefined ? undefined : { '--member-column-height': columnHeight }
```

CSS (`ActivityPanel.module.css`, khối mới ở CUỐI tệp để không bị rule gốc đè):

```css
@container (width>=800px){.aYQbCq_team[data-workspace-team]>.aYQbCq_dependencySection{height:var(--member-column-height,auto);max-height:var(--member-column-height,56vh)}}
```

Rule gốc giữ nguyên: `.aYQbCq_team[data-workspace-team]>.aYQbCq_dependencySection{…max-height:56vh;overflow-y:auto}` — đó là
**fallback** khi chưa đo được (SSR, hoặc panel rời dưới 800px).

## 2. ĐO THẬT (bắt buộc cho A1)

Cách đo: dựng `tests/tmp/t148/entry.js` + `build-page.mjs` — esbuild bundle chính`ActivityPanel.js` **đã build** cho
trình duyệt (stub CSS trả đúng tiền tố class thật `aYQbCq_*`, stub primitives), nhúng CSS THẬT của
`ActivityPanel.module.css` + `WorkspaceActivity.module.css` vào một trang HTML, mount `TeamSection` bằng
`createRoot` + `flushSync` trong 3 khung: 1200px (rộng), 700px (hẹp), 1200px + 400 task. Đo bằng
`getBoundingClientRect()` và `scrollHeight/clientHeight`, đọc kết quả qua `console.log`. Trình duyệt: Chromium của host,
viewport 1280×800 ⇒ `56vh = 448px`.

| cảnh | cột TRÁI `[data-delegation-map]` | cột PHẢI `[data-dependency-map]` | lệch | ghi chú |
| --- | --- | --- | --- | --- |
| rộng 1200px, form ĐÓNG | 777.33 px | 777 px | −0.33 px | hai cột cùng hàng (`leftTop=rightTop=34`, `rightLeft=411`) |
| rộng 1200px, form MỞ | 1099.86 px | 1100 px | +0.14 px | cả hai cùng tăng: trái +322.53, phải +323 |
| hẹp 700px, form ĐÓNG | 670.59 px | 448 px | −222.59 px | xếp DỌC: `rightTop=1861 > leftTop=1177`, phải chạm trần 56vh |
| hẹp 700px, form MỞ | 993.13 px | 448 px | −545.12 px | vẫn dọc, trần 56vh giữ nguyên (đúng thiết kế) |
| rộng + DAG 400 task (1 member) | 490.17 px | 490 px | −0.17 px | `dagViewport` scrollHeight **36 802** px trong clientHeight **293** px ⇒ cuộn NỘI BỘ; 1600 node DAG |

Biến CSS đo được trên chính `section.dependencySection`: `--member-column-height: 777px` (đóng) / `1244px` (mở, cảnh 3 member)
⇒ state → style → CSS chạy đúng vòng. `pageScrollBefore=3580 → pageScrollAfter=4226`: trang cao thêm đúng phần
cột TRÁI cao thêm khi mở form, không phải do cột phải.

## 3. A1..A6

| mục | bằng chứng |
| --- | --- |
| A1 bằng chiều cao THỰC + động | bảng §2: lệch ≤0.33 px khi đóng, ≤0.14 px khi mở; mở form trái +322.53 px và phải +323 px (cùng một nhịp) |
| A2 cuộn nội bộ, không đẩy cột trái | DAG 400 task: `dagViewport` scrollHeight 36 802 px / clientHeight 293 px (`overflow-y:auto` từ rule gốc); cột trái vẫn 490.17 px ⇒ cột phải KHÔNG kéo cột trái cao lên |
| A3 hẹp 700px + panel rời | hẹp: xếp DỌC (`rightTop` sau `leftTop`), không có `height` hiệu lực (khối `@container (width>=800px)` không khớp) ⇒ giữ `max-height:56vh` + `overflow-y:auto`; panel rời (không có container tổ tiên) cũng KHÔNG khớp khối rộng vì `.aYQbCq_team[data-workspace-team]{container:none}` ⇒ flex column như cũ |
| A4 build + map | `node build/build.mjs` (trong `packages/dsh-agent-teams`): `esbuild errors: 0` / `esbuild warnings: 0`; `node --check` panel + bundle OK; `JSON.parse` map OK; t128 M1 giải VLQ vẫn trỏ đúng dòng call site (chi tiết trong log t128) |
| A5 pin đồng bộ + đối chứng âm | t10 pin + 3 dòng FROZEN (client.js, map, CSS) cập nhật (t128 X1/X2 đỏ trước khi re-pin, xanh sau); t128 thêm H1 (wiring), H3 (helper CHẠY THẬT), H4 (CSS var + fallback), H6 (SSR không height); đối chứng âm H2 (bỏ wiring ⇒ đỏ), H5 (bỏ fallback ⇒ đỏ) |
| A6 hồi quy + fallback SSR | t128 34/34 · t10 50/50 · t129 13/13 · t113 38/38 · t114 16/16 · t98 `--strict` GREEN, tất cả EXIT 0, 0 boot; fallback: SSR ⇒ `section` không có attribute `style` (H6 in nguyên thẻ), `observedColumnHeight` trả `null` cho 0/NaN/thiếu (H3: `{"zero":null,"nan":null,"nothing":null,"empty":null}`) ⇒ không bao giờ `height:0`/`NaNpx` |

## 4. Quyết định thay captain

1. **Đặt rule đồng bộ ở CUỐI tệp, không phải trong khối `@container` giữa tệp.** Đo lần đầu cho cột phải 448 px = đúng `56vh`:
   rule gốc `.aYQbCq_team[…]>.aYQbCq_dependencySection{…max-height:56vh}` có CÙNG độ đặc hiệu và đứng SAU, nên `max-height:56vh`
   thắng `max-height:var(…)`. Khối `@container` mới ở cuối tệp sửa đúng thứ tự đó — số đo trước/sau: 448 px → 921 px → 777 px.
2. **Trần `56vh` giữ lại nhưng chỉ khi CHƯA đo được.** Rule rộng dùng `max-height:var(--member-column-height,56vh)`:
   có biến ⇒ trần = chính chiều cao cột trái (bằng nhau tuyệt đối, kể cả khi cột trái cao hơn 56vh);
   không có biến ⇒ `56vh` như cũ (SSR/panel rời).
3. **Vượt trần 6 tệp ghi — đã ghi 8**: 2 tệp mã + 2 artefact build (bắt buộc bởi A4) + 2 tệp pin (A5) + 1 tệp test + 1 docs.

## 5. Giới hạn / chưa chứng minh được (nói thẳng)

- Số đo §2 chạy trong **Chromium của host** (viewport 1280×800) trên một trang HTML tự dựng, KHÔNG phải app desktop thật;
  app có thể có container/khung khác nên con số tuyệt đối sẽ khác, nhưng cơ chế (trái đổi ⇒ phải đổi theo, lệch ≤0.33 px) là như nhau.
- Chưa đo được trường hợp cột trái CAO HƠN viewport (khi đó `max-height` = chính chiều cao trái, trang cao thêm đúng phần
  cột trái vốn đã cao) — suy ra từ rule, chưa có ảnh đo.
- `ResizeObserver` bắn bất đồng bộ: nếu trình duyệt không bao giờ bắn (tab ẩn), cột phải giữ fallback `56vh` — chấp nhận được,
  không có `height:0`.
- Mốc phụ thuộc: 3 khối `@container (width>=800px)` là container query KHÔNG tên nên nó hỏi container gần nhất có
  `container-type`; trong Activity, tổ tiên đó là `.eDfHrq_root` (`container:eDfHrq_team-workspace/inline-size`).
