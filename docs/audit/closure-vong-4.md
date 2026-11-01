# Audit closure vòng 4 (t36) — chốt phát hành tarball t35

Người audit: **audit-goat** (độc lập) · attempt `7609d54c-af27-4e80-8e2c-f6c3b9e3cf79` · 2026-10-31
CODE FREEZE tôi tự đo lại sau khi làm mọi thứ dưới đây — **7/7 khớp**: `lib/tools.js 7fde7bbc…`/179 184 · `lib/members.js affd3bf9…`/77 228 · `lib/state.js 3bdbbf7d…`/55 938 · `lib/snapshot.js b0799634…`/10 994 · `lib/client.js 0026ac70…`/193 129 · `lib/client.js.map 28facff2…`/326 147 · `package.json 92a64040…`/10 498. Không có writer khác trong suốt phiên.

## 1. Verdict

**PHÁT HÀNH ĐƯỢC** cho bản `0.2.0-dev.0` đóng gói trong tarball t35 (`c3e3e88a…2745`, 2 191 904 B, 133 entry). Không có finding mức blocker/high. Điều kiện phát hành: **không có điều kiện cứng nào còn lại** — việc duy nhất là khi cài phải kiểm sha256 đúng `c3e3e88a…2745` (vì trong repo vẫn còn tarball cũ t29 — F4). Bốn điểm còn lại là info/low, ghi ở §7.

## 2. C1 — tarball t35 vs nguồn: **7/7 SAME** (tôi đo cả hai phía, không chép bảng của captain)

Tarball: `packages/dsh-agent-teams/tests/tmp/t35/nami-dsh-agent-teams-0.2.0-dev.0.tgz` — `sha256 c3e3e88a77131e19d7b9bc2ed6828097986bb959db660607f368d12ce2a42745`, 2 191 904 B, **133 entry** (`tar -tzf` sau khi bỏ `\r` CRLF).
Giải nén vào `tests/tmp/t36/extract` rồi hash **payload ↔ nguồn**:

| Tệp | payload | nguồn | |
|---|---|---|---|
| `lib/tools.js` | `7fde7bbc49db` 179 184 | `7fde7bbc49db` 179 184 | SAME |
| `lib/members.js` | `affd3bf99c59` 77 228 | `affd3bf99c59` 77 228 | SAME |
| `lib/state.js` | `3bdbbf7d8f4e` 55 938 | `3bdbbf7d8f4e` 55 938 | SAME |
| `lib/snapshot.js` | `b0799634615c` 10 994 | `b0799634615c` 10 994 | SAME |
| `lib/client.js` | `0026ac70a5fc` 193 129 | `0026ac70a5fc` 193 129 | SAME |
| `lib/client.js.map` | `28facff2641a` 326 147 | `28facff2641a` 326 147 | SAME |
| `package.json` | `92a6404071e4` 10 498 | `92a6404071e4` 10 498 | SAME |

Entry bắt buộc **6/6 PRESENT** (`package/lib/{tools,members,client,client.js.map,tool-names}.js`, `package/cordis.patch.yml`); cấm **0/0/0/0** (`node_modules`, `package/tests`, `.tgz` lồng, `.pid`).

## 3. C2 — t34 (UI `last_failure`) và bundle: ĐẠT

- `node tests/t10-ui-bundle-smoke.mjs` → **EXIT=0, 25/25** (`TOTAL 25 checks, 25 passed, 0 failed`), gồm 22 case cũ (không hồi quy) + 3 case mới về hàng lỗi.
- **Tự dựng lại bundle** (`node build/build.mjs`, esbuild errors 0 / warnings 0): cặp hash **trước → sau y hệt**
  `client.js 0026ac70a5fcdfa4…2d89 / 193 129 B` → `0026ac70a5fcdfa4…2d89 / 193 129 B`;
  `client.js.map 28facff2641a75b2…a032 / 326 147 B` → `28facff2641a75b2…a032 / 326 147 B` ⇒ build là **no-op**, không sửa byte nào trong `packages/**` (tôi vẫn backup bản cũ ở `tests/tmp/t36/backup/` trước khi build đề phòng).
- `node --check lib/client.js` → `NODE_CHECK_OK`.
- `JSON.parse(lib/client.js.map)`: **19 sources**, `badSources=0`, `sourcesContentWithDrivePath=0` (regex `[A-Za-z]:[\\/]` trên cả `sources` và `sourcesContent`); `sourcesContent` **có** `data-member-failure` và `MemberFailureNotice`.
- Đối chiếu từng entry với đĩa: **16/19 byte-equal tuyệt đối**, trong đó `lib/client/MemberControls.js` (`idx=12`, 15 258 B) và `ActivityPanel.js` (63 975 B) khớp đúng byte; 3 entry **NEQ** đều là `css-module:…module.css` (mapLen 4 801 vs 3 946; 3 674 vs 3 073; 4 059 vs 3 581) — đúng bản chất vì esbuild nhúng CSS thành JS module.

## 4. C3 — chạy lại toàn bộ suite + săn PASS giả

| Suite | exit | Kết quả | Suite | exit | Kết quả |
|---|---|---|---|---|---|
| `t3-route-smoke` | 0 | 18/18 | `t24-auth-fence` | 0 | 12/12 |
| `t4-control-plane-smoke` | 0 | 22/22 | `t28-provider-failure` | 0 | 20/20 |
| `t10-ui-bundle-smoke` | 0 | 25/25 | `t30-status-last-failure` | 0 | 8/8 |
| `t15-activate-member` | 0 | 21/21 | `t27 --analyze` | 0 | PASS 16/16 |
| `t20-erp-compat` | 0 | 15/15 (sha nguồn ERP `9f7420b6…`) | `t29 --analyze` | 0 | PASS C1–C5, unproved none |
| `t35 --analyze` | 0 | PASS 7/7 | | | |

**11/11 suite EXIT=0**, log từng suite ở `tests/tmp/t36/*.log`. Quét PASS giả trên toàn bộ `tests/*.mjs` (14 tệp): `.skip(` **0**, `catch { }` rỗng **0**, `process.exit(0)` đứng riêng **0**, `TODO/FIXME` **0**; các hit `=== undefined` là guard `throw` thật, không phải assert luôn-đúng.
**Suite KHÔNG chứng minh được điều nó tuyên bố** (nói thẳng): (i) `t27 --analyze` chấm artifact cũ `2026-10-31T17-30-13-440Z`, không nói gì về bản hiện tại; (ii) `t29 --analyze` chấm tarball cũ `ac84c73a…`/2 188 799 B — **không phải** t35 (`c3e3e88a…`), nên nó chỉ chứng minh *quy trình* pack/cài/boot, không chứng minh artifact mới; (iii) `t35 --analyze` đọc `meta.json` đã ghi và gọi `score(meta)` (`tests/t35-pack-repack.mjs:273,377`) ⇒ **không tự phát hiện tarball trên đĩa bị thay sau đó**; vì vậy tôi mới tự đo hash ở §2 thay vì tin `--analyze`.

## 5. C4 — hồ sơ

- `docs/TODO.md`: **36 hàng, 36 id duy nhất, 0 trùng**; cột `Trạng thái` = `VERIFIED 34 · CANCELLED 1 (t9) · IN_PROGRESS 1 (t36)` — **khớp đúng header dòng 5** (`VERIFIED=34 · CANCELLED=1 · IN_PROGRESS=1 · OPEN=0 · REVIEW=0`); 0 hàng thiếu cột bằng chứng (tối thiểu 10 ký tự).
- `node tools/dependency-report.mjs` → `tasks=36 realEdges=38 derivedEdges=24 waves=17 problems=0`, EXIT 0; `docs/DEPENDENCIES.md` trong repo sinh lúc `2026-10-31T17:54:44Z` với **36 task / 15 member** ⇒ khớp bản tôi vừa sinh (chỉ khác timestamp).
- `node tools/check-doc-paths.mjs --summary` → `files=4 paths=48 paths_missing=0 links=41 links_missing=0`, **EXIT 0** (chạy 2 lần, cùng số ⇒ không phải nhiễu).

## 6. C5 — mutation test của chính tôi trên kiểm tra cốt lõi của t35

Sửa bản sao artifact: `cp -r …/t35/run-2026-10-31T17-52-10Z tests/tmp/t36/mutated-run`, rồi trong `mutated-run/meta.json` đặt `threeWay[0].payload='000…0'` (64 số 0) + `same=false` cho hàng `lib/tools.js`; sha256 file meta đổi `2fa5562a…` → `0f5fcded…`.
Kết quả: `node tests/t35-pack-repack.mjs --analyze tests/tmp/t36/mutated-run` → **EXIT=1**, `FAIL C1 7/7 tệp SAME`, `FAIL C2 payload lib/tools.js = hash công bố`, `5/7 checks passed, 2 failed` ⇒ bộ chấm **phân biệt thật**, không in PASS vô điều kiện.
Khôi phục: `cp` bản gốc đè lên bản sao ⇒ `RESTORED_SHA=2fa5562afc91fdf5…` **trùng tuyệt đối** `ORIG_META_SHA` (`RESTORED_IDENTICAL=true`); chạy lại trên artifact gốc → **EXIT=0, 7/7 PASS**.

## 7. Điều kiện còn lại + rủi ro tồn đọng khi cài vào ERP

1. **Không có điều kiện cứng.** Chỉ cần kiểm sha256 `c3e3e88a…2745` khi cài (xem F4 về tarball cũ còn trong repo).
2. **Rủi ro 1 — chưa ai bấm GUI thật trong phiên sống**: bằng chứng UI là SSR + bundle harness (`t10` 25/25) + Chromium trên `build/test-load.html`; chưa có thao tác tay trên panel trong một đội đang chạy có member chết provider. Đây là khoảng trống bằng chứng, không phải lỗi đã biết.
3. **Rủi ro 2 — peerDependencies không được cài**: `package.json` khai 24 peer, **tất cả** `peerDependenciesMeta.optional=true`; profile sạch `agent-teams-pack2` **không có** `node_modules/@deepseek-ai` mà boot vẫn exit 0 ⇒ host tự cấp. Khi cài nơi khác phải có host DSH ≥ bản tương thích và dùng `npm i --legacy-peer-deps <tgz>` như t29/t35 đã làm.
4. **Rủi ro 3 — event `agent-teams/*` bị host bỏ**: `lib/events.js:33-40` chỉ ghi khi `dshSession.KNOWN_SESSION_EVENT_TYPES.has(type)`; harness hiện tại **0 hit** `agent-teams/member` ⇒ nhật ký phiên KHÔNG có vết đổi route. Audit trail thật = `team.json` (`routeOverride`) + `docs/log/MODEL-SWITCH.md`. Phải nói rõ với người vận hành ERP.
5. **Rủi ro 4 — rollback Windows**: `dsh plugin` là pnpm passthrough, rollback cần chép tay từ `profiles/desktop/node_modules/@nanmicoder/dsh-agent-teams` (offline) hoặc registry; quy trình ở `docs/van-hanh/di-migrate-va-rollback.md` đã đúng sau t33.

## 8. Phát hiện (không chặn phát hành)

| ID | Mức | Nội dung | file:dòng | Tái hiện |
|---|---|---|---|---|
| F1 | info | `--analyze` chấm `meta.json` đã ghi, không đọc lại đĩa ⇒ PASS của `t29/t35 --analyze` không bao hàm "tarball hiện tại còn mới"; phải đo hash trực tiếp | `tests/t35-pack-repack.mjs:273` (`score(meta)`), `:377` (`printVerdict(meta, score(meta), dir)`) | sửa hash trong bản sao `meta.json` (§6) — bộ chấm FAIL; nhưng thay tarball trên đĩa thì nó không biết |
| F2 | info | `sourcesContent` của 3 entry `css-module:` dài hơn tệp `.css` trên đĩa (4 801 vs 3 946 …) — đúng thiết kế esbuild, nhưng câu "sourcesContent = byte trên đĩa" trong `docs/kiem-thu/t34-ui-last-failure.md` chỉ đúng cho nguồn JS | `lib/client.js.map`; `docs/kiem-thu/t34-ui-last-failure.md` | so từng entry như §3 |
| F3 | low | `package.json` 24 peer nhưng toàn bộ optional; người cài ngoài DSH dễ hiểu nhầm là "thiếu phụ thuộc" | `package.json` (`peerDependencies`/`peerDependenciesMeta`) | `node -e` đọc `peerDependenciesMeta`; profile sạch không có `@deepseek-ai` |
| F4 | low | Repo còn **tarball cũ t29** (`ac84c73a…`, 2 188 799 B) nằm cạnh tarball phát hành t35 (`c3e3e88a…`) ⇒ nguy cơ cài nhầm bản thiếu t34 | `packages/dsh-agent-teams/tests/tmp/t29/*.tgz` | `node -e` đọc `sha256` hai tệp; `t29/run-…/meta.json` ghi `ac84c73a…` |

**Kết luận một câu**: tarball t35 là bản đầu tiên hội đủ cả ba chiều payload = bản cài = nguồn, cài được vào profile sạch và boot gọi thật được 2 tool mới — **đủ điều kiện cài cho dự án ERP**, kèm 4 lưu ý vận hành ở §7 và việc kiểm sha256 khi cài.
