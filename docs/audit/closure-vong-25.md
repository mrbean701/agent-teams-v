# Audit closure vòng 25 (t152) — equal-height bằng CSS thuần (contain:size)

- Card: t152 · kind=review · round 25 · reviewedTaskId t151 · attempt_id 7cc9fc9d-8ef9-44d5-ad7f-e31e34194577
- Người chấm: audit-goat (độc lập; KHÔNG chạy `t151-pack.mjs --analyze` một lần nào)
- Mốc verdict: 2026-11-01T16:58:00.000Z · Bộ byte: sha256 da2f297bd6a48c476815c24ffe0ab969a6995812faab5205ee8e6b2d43714ca8 / 2 248 536 B / 133 entry

## 0. Verdict

**TARBALL VÒNG 25 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CÓ ĐIỀU KIỆN.** Không finding high/blocker. Cơ chế equal-height bằng CSS thuần có mặt thật trong byte phát hành và chạy đúng trong Chromium trên chính CSS phát hành (đo DOM thật: cột trái/phải bằng nhau ở 3/4 kịch bản, DAG vẫn cuộn nội bộ, nội dung không bị cắt). Điều kiện: V25-F1 (medium) và V25-F2 (medium) phải xử lý trước vòng pack kế tiếp — cả hai là lỗ hổng CỔNG, không phải lỗi của bộ byte này.

## 1. B1 — tự đo artefact

| Hạng mục | Số đo |
| --- | --- |
| sha256 / bytes | da2f297bd6a48c476815c24ffe0ab969a6995812faab5205ee8e6b2d43714ca8 / 2 248 536 |
| bản sao cùng sha | t151/run-t151-a/pack-a, pack-b, dist/vong-25/…tgz, snapshot tests/tmp/t152/artifact/vong-25.tgz |
| tar -tzf | 133 entry / 0 entry thư mục / rác 0 |
| payload vs nguồn | 133 tệp: 133 same / 0 diff / 0 notInSource |
| lib/** | 79 tệp nguồn, 0 thiếu trong gói |
| đường dẫn tuyệt đối rò | 0 |
| ba chiều (15 tệp) | 15/15 SAME |
| package.json trong gói | @nami/dsh-agent-teams 0.2.0-dev.0 · 0 dependencies / 24 peerDependencies |
| ERP đối chứng | E:/Project/ERP/.agent-teams/erp-erp/team.json 9f7420b6a1af1f4e…/1 533 117 B không đổi |

15 dòng đóng băng (sha16/bytes, source = payload = installed): tools.js e51734baf4693cd3/213 715 · members.js 50f558f8b207d874/102 260 · state.js 56664c59ff400319/57 508 · snapshot.js a2a87e1b0c0b34ea/13 986 · index.js 2d28e617f0683e42/45 315 · tool-names.js e3def5db908dcbd5/808 · **client.js 67d616a608c38ed3/258 925** · **client.js.map 718f41544f36ae51/405 694** · types/members.d.ts c53250ab41bff8c3/31 769 · types/snapshot.d.ts 962f99a7bcb18b94/7 627 · types/tools.d.ts 41cfc56576ed8ffd/7 546 · **ActivityPanel.module.css 210186828966d0cf/52 180** · package.json 92a6404071e457cc/10 498 · ActivityPanel.js 60f4476634d097dc/64 305 · WorkspaceActivity.module.css c7f2d5e5d295c40f/3 579.

## 2. B2 — repack + ba chiều

- Repack 2 tiến trình riêng (tests/tmp/t152/repack-a, repack-b): cả hai da2f297b…4ca8 / 2 248 536 B = artefact (sameShaBoth=true, sameAsArtifact=true).
- Profile audit tự cài: C:/Users/thang/.dsh/profiles/agent-teams-rel25-audit, dependency `file:…/tests/tmp/t152/artifact/vong-25.tgz`, lockResolved đúng artefact, isSymlink=false, 133 tệp cài, version 0.2.0-dev.0, 0 deps / 24 peer.
- Ba chiều 15/15 SAME (13 FROZEN + ActivityPanel.js + WorkspaceActivity.module.css).

## 3. B4 — đánh giá RỦI RO của `contain:size` (đo DOM thật, không suy đoán)

Bằng chứng byte (CSS nhúng trong lib/client.js, giải nén từ tarball): rule gốc `.aYQbCq_team[data-workspace-team]>.aYQbCq_dependencySection{overscroll-behavior:contain;min-width:0;max-height:56vh;overflow-y:auto}`; rule rộng trong `@container (width>=800px)` = `{align-self:stretch;contain:size;max-height:none}`; card có `padding:18px`, `border:1px`, `box-sizing:border-box`; container gần nhất là `.eDfHrq_root{container:eDfHrq_team-workspace/inline-size}` (WorkspaceActivity.module.css). Wiring cũ đã xoá thật: `--member-column-height`=0, `memberColumnHeight`=0, `observeColumnHeight`=0, `memberColumnRef`=0; 2 chỗ `ResizeObserver` còn lại là overlay đo bong bóng chat (biến `overlay`), KHÔNG phải cột member.

Đo bằng Chromium thật (tests/tmp/t152/probe2.html nạp đúng 2 tệp CSS phát hành + markup 3 khối, container 1000px ⇒ `@container (width>=800px)` khớp):

| Kịch bản | left | right | lệch đáy | overflowY | clientH/scrollH | cuộn được |
| --- | --- | --- | --- | --- | --- | --- |
| list 3 hàng | 84,0 | 84,0 | 0,0 | auto | 82 / 95 | tới 13,0 |
| list 40 hàng | 1231,0 | 1231,0 | 0,0 | auto | 1229 / 1229 | không cần (card cao theo cột trái, trang cuộn) |
| 1 hàng (cột trái rất thấp) | 22,0 | 38,0 | **+16,0** | auto | 36 / 95 | tới 59,0 |
| font 24px (zoom) | 111,0 | 111,0 | 0,0 | auto | 109 / 109 | không cần |

Kết luận B4: (1) **không bị cắt** — `overflow-y:auto` của rule gốc vẫn hiệu lực vì rule rộng chỉ đặt `max-height:none`, không đụng overflow; ở cột trái thấp 22px, DAG vẫn cuộn tới đáy (scrollH 95 > clientH 36, cuộn tới 59,0) và phần tử cuối vẫn nằm trong vùng cuộn. (2) **giới hạn cơ chế**: `contain:size` làm chiều cao “rỗng” của card = padding 18×2 + border 1×2 = 38px, nên khi cột trái < 38px thì card phải cao hơn đáy cột trái đúng 16px — trong app thật cột trái luôn có header + delegation cell nên không lộ, nhưng đây là biên của cơ chế. (3) **zoom/font lớn**: cột trái cao lên thì card cao theo (111/111 tại font 24px), không cắt. (4) **a11y/keyboard**: vùng cuộn tự nhận focus khi TRÀN (focusable=true ở ca 84px và 38px; false khi nội dung vừa) và có `aria-label=dependency` — không thấy mất truy cập bàn phím; **screen reader: CHƯA KIỂM ĐƯỢC**. (5) trình duyệt cũ không hỗ trợ `contain:size` sẽ bỏ qua khai báo ⇒ card cao theo nội dung (mất cân bằng, không cắt) — **chưa kiểm được trên trình duyệt cũ**.

## 4. B3 — mutation (chỉ trên BẢN SAO tests/tmp/t152/pkg; phục hồi byte-identical, final 67d616a608c38ed3/258 925)

| # | Kiểu | sha16/bytes mutant | Kết quả cổng (nguyên văn) |
| --- | --- | --- | --- |
| M1 (bắt buộc a) | `contain:size` → `contain:none` CHỈ trong CSS nhúng của bundle | 7b574fc7069e2f1a/258 925 (delta 0) | t10 49/50 `FAIL bundle identity matches the pinned sha256 + bytes :: sha256 7b574fc7… != 67d616a6…`; t128 **30/33** với đúng 3 FAIL: `FAIL B3 — running build/build.mjs on a COPY of the package reproduces the shipped bundle AND map byte for byte, so this layout is a build product and not a hand edit`, `FAIL X1 …`, `FAIL X2 …`; t129 2 FAIL (pin). **H3/C7/C8 vẫn XANH** ⇒ xem V25-F1 |
| M2 (bắt buộc b) | chèn lại wiring đã xoá vào bundle: `data-dependency-map: true, style: { --member-column-height: 512 }, children: [` | f918c86c94c2a143/258 967 (delta +42, node --check ok) | t128 **29/33**: `FAIL H1 — A4: the measured-height wiring is GONE from the panel AND the shipped bundle (no state, no ref, no observer helper, no CSS variable), so equal height cannot depend on a measurement landing at the right moment` + `evidence: the bundle still carries --member-column-height`; kèm B3/X1/X2; t10 49/50 (hash). ⇒ cổng H1 bắt đúng việc wiring bị xoá |
| M3 (bắt buộc c, kiểu mới) | thêm `;overflow:hidden` vào rule rộng ở CẢ tệp CSS nguồn rồi rebuild (`node build/build.mjs`) — thay đổi “hợp nguồn”, không phải sửa tay lệch | 6252eb32ba7ecee3/258 941 | t128 **31/33**, chỉ còn `FAIL X1 …` và `FAIL X2 …` (pin của repo thật — mọi thay đổi hợp lệ đều đỏ hai ca này); H1–H5, C7, C8, B3 **đều XANH**; t10 49/50 chỉ vì hash. ⇒ **không cổng nào canh khả năng cuộn/không cắt của card DAG** (V25-F2) |

Baseline bản sao trước mutation: t10 50/50 · t128 33/33 · t129 13/13. Không ghi byte nào vào packages/dsh-agent-teams/**, dist/**, tools/**, tests/** ngoài tests/tmp/t152.

## 5. B5 — sweep + 7 suite bắt buộc

`node tools/sweep-suites.mjs --run`: **PASS=44 FAIL=0 LEGACY=16 UNCLASSIFIED=0 skipped(live)=10 skipped(pack)=11 WARN=0 WARN_FIXTURE=1 DRIFT=0**, tool exit **0** (xanh); frozen sampling 44/44 suite, drift 0. `--list`: 81 suite = 10 LIVE + 11 PACK + 47 fast; legacy 16.
Đáng chú ý: t120 a26 **PASS** với tiêu đề “V23-F3: ngoai le LEGACY THIEU citation …” ⇒ finding V23-F3 của vòng 23 đã được xử lý (LEGACY nay có citation; t132-panel-runtime, t132-panel-dom-order, t133, t140-pack đã được chuyển LEGACY). Vòng này không có FAIL nào để phân loại.
7 suite bắt buộc trên repo thật đều EXIT 0: t10 50/50 · t128 33/33 · t129 13/13 · t113 38/38 · t114 16/16 (frozen=13, helperRecords=13, problemsOnDrift=2, problemsOnBadPin=2) · t115 43/43 · t98 --strict GREEN (SUMMARY tools=16 fields=112 reached=105 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 allow_listed=7 roster_invariant_problems=0).

## 6. Findings

- **V25-F1 (medium)** — Cơ chế equal-height không có phép kiểm ngữ nghĩa trên BẢN NHÚNG: `embeddedCssProblems` chỉ so DUY NHẤT `grid-template-columns` (tests/t128-panel-order.mjs:499-521, C7 :523, C8 :529), còn `equalHeightProblems` (:609-623) chạy trên `css` = TỆP `ActivityPanel.module.css` (:42/:622), không chạy trên bundle. Tái hiện: M1 — `contain:size`→`contain:none` chỉ trong bundle ⇒ H3/C7/C8 xanh, chỉ hash/B3/pin đỏ. Đề xuất: mở rộng so sánh hai chiều sang các declaration `contain`, `align-self`, `max-height` của rule rộng (cùng kiểu `gridDeclarationOf`), kèm đối chứng âm chỉ-sửa-bundle.
- **V25-F2 (medium)** — Không cổng nào canh khả năng CUỘN/không CẮT của card DAG ở chế độ rộng: `equalHeightProblems` chỉ đòi `overflow-y:auto` ở rule GỐC (tests/t128-panel-order.mjs:619), nên rule rộng có thể override `overflow:hidden` mà mọi cổng ngữ nghĩa vẫn xanh. Tái hiện: M3 (thêm `overflow:hidden` hợp nguồn + rebuild) ⇒ t128 31/33, chỉ X1/X2 đỏ (pin), t10 chỉ hash. Đề xuất: assert rule rộng KHÔNG chứa `overflow:hidden`/`overflow:clip` và giữ `overflow-y:auto`.
- **V25-F3 (low)** — Giới hạn của `contain:size`: chiều cao “rỗng” của card = 38px (padding 18×2 + border 1×2), nên khi cột trái < 38px, card phải cao hơn đáy cột trái đúng 16px (đo: left 22,0 / right 38,0 / delta +16,0). Trong app thật không lộ (cột trái luôn có header + delegation cell). Đề xuất: ghi chú trong tài liệu cơ chế, hoặc test “cột trái tối thiểu 38px”.
- **V25-F4 (info)** — A11y/keyboard: vùng cuộn tự focusable khi tràn (probe: focusable=true ở 84px và 38px, false khi vừa), `aria-label=dependency` có mặt ⇒ không mất truy cập bàn phím; **screen reader chưa kiểm được**.
- **V25-F5 (info)** — `contain:size` cần Chromium 52+/Firefox 69+/Safari 15.4+; trình duyệt cũ bỏ qua khai báo ⇒ card cao theo nội dung (mất cân bằng, KHÔNG cắt). Chưa kiểm được trên trình duyệt cũ.
- **V25-F6 (info)** — Ảnh xác nhận trực quan của captain (docs/kiem-thu/desktop-vong-25-*.png) khớp với đo DOM thật ở kịch bản thường; riêng ca “cột trái rất thấp” ảnh không phủ, nên kết luận dựa trên probe (tests/tmp/t152/probe2.html) chứ không dựa ảnh.

## 7. Điều kiện hết hiệu lực

Verdict gắn với ĐÚNG bộ byte sha256 da2f297bd6a48c476815c24ffe0ab969a6995812faab5205ee8e6b2d43714ca8 / 2 248 536 B / 133 entry, mốc 2026-11-01T16:58:00.000Z. Hết hiệu lực khi: (a) artefact pack lại / di chuyển / đổi 1 byte; (b) packages/dsh-agent-teams/lib/** hoặc package.json đổi 1 byte (kể cả sửa tay client.js/client.js.map/ActivityPanel.module.css); (c) profile cài bị đè hoặc trỏ nơi khác. Riêng cơ chế equal-height phải chấm lại bằng t10 + t128 + t129 nếu ActivityPanel.module.css, vùng `@container (width>=800px)` trong lib/client.js, hoặc lib/client/ActivityPanel.js đổi.

## 8. Limitations (tự khai)

- Lượt chạy suite: **18** so trần ≤12 (baseline 3 + M1 3 + M2 2 + M3 2 + 1 lượt chạy lại M2 để lấy dòng `evidence:` nguyên văn + 7 suite bắt buộc). Lệnh shell ~12/30. Boot thật 0/2 (phần DOM đo bằng Chromium trên file HTML tĩnh — không phải app Host). 2 repack. Mutation 3 kiểu mới (contain:size, re-insert wiring, overflow:hidden hợp nguồn).
- KHÔNG chạy `t151-pack.mjs --analyze`; mọi số là tự đo (node:crypto, tar, npm pack, node build/build.mjs, Chromium qua browser tool).
- B4: layout đo trong trang HTML tĩnh nạp đúng CSS phát hành + markup mô phỏng 3 khối với container 1000px; KHÔNG phải app Host thật, và không có dữ liệu ERP 107 task. Chưa kiểm được screen reader và trình duyệt cũ.
