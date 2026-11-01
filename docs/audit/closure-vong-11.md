# Audit closure vòng 11 — tarball t84 + cổng biên dịch t83 (t85)

Người chấm: audit-goat (độc lập, không viết mã plugin) · attempt fe7bb7f0-328a-416c-bec5-94aacf52d98b · 2026-10-31.
Đối tượng: `packages/dsh-agent-teams/tests/tmp/t84/nami-dsh-agent-teams-0.2.0-dev.0.tgz` (reviewed task t84) và cổng `tsc --noEmit` do t83 thêm vào `tests/t56-types-fallback.mjs`.
Phạm vi ghi: `docs/audit/**`, `docs/log/AUDIT.md`, `tests/tmp/**`. Không sửa `lib/**` (chỉ mutation tạm, phục hồi byte-identical), không sửa `tools/**`, `docs/TODO.md`, `docs/bao-cao-agent-teams.md`, không chạm `E:/Project/ERP`. Không publish/commit/push.

## 0. Verdict

**TARBALL t84: PHÁT HÀNH ĐƯỢC. CÔNG BỐ CHƯA.**

- Lớp mã + tarball sạch: 133/133 tệp payload **bằng đúng** nguồn hiện tại (0 lệch, 0 tệp chỉ-có-trong-gói, 0 tệp nguồn thiếu trong gói), 12 tệp then chốt khớp cả ba chiều (payload ↔ bản cài `agent-teams-pack10` ↔ nguồn), tarball chứa **đúng bản sau t86** (mtime gói 21:24:48Z > `lib/members.js` 21:24:29Z), 27/27 suite thuần + 17/17 suite `--analyze` EXIT 0, 3 mutation riêng đều làm suite đỏ rồi phục hồi byte-identical.
- Thứ duy nhất chặn **công bố** là tài liệu: `docs/bao-cao-agent-teams.md` vẫn chỉ người vận hành cài **t78** (bản thiếu vá BUG-023) và còn trích hash trước t86 — **V11-F1 (medium với hồ sơ t84, chặn công bố)**. Đây là lỗi tài liệu, không phải lỗi t84, nên không cần pack lại (pack lại sẽ làm verdict này hết hiệu lực).
- Kỷ luật: member dùng **6 lượt pack** trong khi trần là 4 — **V11-F2 (medium)**, đã tự khai; hậu quả đo được là tên tệp phát hành từng trỏ vào bản trước t86 (`7e152b16…`), nhưng bản đó **không còn trên đĩa** và bản chốt thì đúng nguồn.

## 1. Đối chiếu tiêu chí (C1..C7)

| # | Tiêu chí | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| C1 | Tự hash tarball t84 bằng `node:crypto`, không dùng `--analyze` | ĐẠT | `220a6da96f82113013040d02db8bd9039dce891eccf5a5bb20e313c62be37db1` / **2 242 952 B** / **133 entry** / **0 entry thư mục**; `tests/tmp/audit-v11/measure.json` |
| C2 | Tự `tar -tzf` đếm entry, tự giải nén, tự hash ≥12 tệp payload ↔ nguồn | ĐẠT | `tar -tzf` (strip CRLF) 133 dòng; 12/12 tệp bắt buộc SAME; **quét cả 133 tệp**: same=133 diff=0 notInSource=0 sourceMissing=0 |
| C3 | Tự kiểm cổng biên dịch t83, tự tạo 1 lỗi kiểu thật, độc lập đối chứng âm của member | ĐẠT | tsc 5.9.3 / 21 tệp `lib/types/*.d.ts` → exit 0; bản copy ở `tests/tmp/audit-v11/typecopy`: sạch exit 0, sau mutation bỏ tham số `signal` → **exit 2, TS2554** tại `consumer.ts`, dọn sạch, `lib/types` không đổi sha |
| C4 | ≥3 mutation kiểu khác vòng 5–10 (và khác 2 kiểu của captain vòng 11), in applies + delta, suite đỏ, phục hồi byte-identical | ĐẠT | M1 doc-comment literal (`= 200`→`= 201`, delta **0 B**, `c53250ab41bf`→`2a5b34558a56`) ⇒ t56 EXIT 1 (d13); M2 xoá interface `MemberProfileChangeResult` (−655 B) ⇒ t56 EXIT 1 (d16); M3 revert call-site `membersApi.selectionFromMember(member)`→`undefined` (−29 B, `75800e15fce2`→`88ecd09d4a8c`) ⇒ t86 EXIT 1 (a1/a2/c2/c3). Phục hồi identical 3/3 |
| C5 | Chạy lại toàn bộ suite, ghi exit code thật; 0 `.skip(`, 0 `catch {}` rỗng | ĐẠT | **44 suite: 27 pure + 17 analyze, tất cả EXIT 0**; 45 tệp `tests/*.mjs`: 0 `.skip(`, 0 `catch {}` rỗng |
| C6 | Đối chứng ERP không đổi | ĐẠT | `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e` / **1 533 117 B** / mtime `2026-10-24T04:53:13.185Z`, đo trước và sau toàn bộ lượt chấm |
| C7 | Verdict + `V11-F*` có mức độ, `≤110 dòng`, cập nhật `docs/log/AUDIT.md`, nêu điều kiện hết hiệu lực | ĐẠT | tệp này + mục “Audit closure vòng 11 (t85)” trong `docs/log/AUDIT.md`; điều kiện ở §6 |

## 2. Đo độc lập tarball t84

- sha256 `220a6da96f82113013040d02db8bd9039dce891eccf5a5bb20e313c62be37db1`, **2 242 952 B**, 133 entry, 0 entry thư mục; `tests/tmp/t84/repack/…` **cùng sha256 + cùng size** (pack tất định).
- Rác: `node_modules` 0 · `package/tests/` 0 · `.tgz` lồng 0 · `.pid` 0 · `package/tools/` 0.
- 12 tệp bắt buộc (payload = nguồn): `lib/tools.js 75800e15fce2/196 084` · `lib/members.js 4f818b73803d/100 367` · `lib/state.js 7b49f5ab1d46/56 282` · `lib/snapshot.js a2a87e1b0c0b/13 986` · `lib/index.js 2d28e617f068/45 315` · `lib/tool-names.js e3def5db908d/808` · `lib/client.js 9da18d9971a2/258 432` · `lib/client.js.map bbf88608f54e/404 958` · `lib/types/members.d.ts c53250ab41bf/31 769` · `lib/types/snapshot.d.ts 962f99a7bcb1/7 627` · `lib/client/ActivityPanel.module.css 53ea47c6d780/51 837` · `package.json 92a6404071e4/10 498`.
- **Quét toàn gói**: 133/133 tệp payload có bản nguồn tương ứng và **bằng byte**; `SOURCE_MISSING_FROM_PAYLOAD=[]`. Đây là bằng chứng đóng lớp lỗi V9-F1 (drift toàn gói) cho bộ byte này.
- Bản cài tham chiếu `C:/Users/thang/.dsh/profiles/agent-teams-pack10/node_modules/@nami/dsh-agent-teams`: `lstat.isSymbolicLink=false`, 12/12 tệp **SAME** với nguồn (0 dependency, 24 `peerDependencies`).
- Thứ tự thời gian (chứng minh gói là **bản sau t86**): tarball `2026-10-31T21:24:48.636Z` > `lib/members.js 21:24:29.259Z` > `lib/types/members.d.ts 21:22:40.830Z` > `lib/tools.js 21:22:05.033Z`.
- Tarball rác mà captain cảnh báo (`7e152b16d071…` / 2 242 144 B): **không tồn tại** trong 26 tệp `.tgz` quét được dưới `tests/tmp` và `packages/dsh-agent-teams/tests/tmp`; chỉ có t84 (và repack cùng hash).

## 3. Ba mutation kiểu mới (đều phục hồi byte-identical)

| Mã | Kiểu (mới) | Tệp/dòng | Delta | Suite | Kết quả |
| --- | --- | --- | --- | --- | --- |
| M1 | sửa **hằng số trong doc-comment khai báo** | `lib/types/members.d.ts:250` `MEMBER_ROLE_MAX = 200;` → `= 201;` | 0 B (`c53250ab41bf`→`2a5b34558a56`) | `t56` | **EXIT 1**, `not ok 13 d13` |
| M2 | **xoá một interface khai báo** | `lib/types/members.d.ts` block `export interface MemberProfileChangeResult` | −655 B | `t56` | **EXIT 1**, `not ok 16 d16` |
| M3 | **revert một bản vá ở call-site** | `lib/tools.js:553` `membersApi.selectionFromMember(member)` → `undefined` | −29 B (`75800e15fce2`→`88ecd09d4a8c`) | `t86` | **EXIT 1**, `a1`, `a2`, `c2`, `c3` |

- Đường cơ sở trước mutation: `t56` **20/20 EXIT 0**, `t86` **8/8 EXIT 0**; sau khi phục hồi: `t56` 20/20, `t86` 8/8, sha 3 tệp trở lại **đúng** `75800e15fce2` / `4f818b73803d` / `c53250ab41bf`.
- M3 đáng chú ý: nó làm đỏ **cả case chạy thật** (`a1` member chưa từng spawn phải spawn bằng route override), không chỉ case so văn bản — tức bản vá BUG-023 của t86 có răng, không phải assert trang trí.
- M1 delta **0 byte** (200→201 cùng độ dài) nên delta byte một mình không đủ; sha256 trước/sau khác nhau là bằng chứng thay đổi thật.

## 4. Cổng biên dịch t83 — kiểm độc lập

- `node tests/t56-types-fallback.mjs` → `tsc=5.9.3`, `files=21`, `# 20/20 passed` (d18 cổng thật, d19 đối chứng âm của member, d20 nhánh thiếu tsc).
- Tôi chạy **tsc trực tiếp** (không qua suite): `node packages/dsh-agent-teams/node_modules/typescript/lib/tsc.js --noEmit --skipLibCheck --target es2022 --module esnext --moduleResolution bundler lib/types/*.d.ts` → **EXIT 0**.
- Lỗi kiểu do **tôi** tạo, khác kiểu của member (member dùng sai kiểu tham số ⇒ TS2345): copy 21 tệp sang `tests/tmp/audit-v11/typecopy`, copy sạch → EXIT 0; bỏ hẳn tham số `signal` khỏi khai báo `setMemberProfile` rồi thêm `consumer.ts` gọi 8 tham số ⇒ **EXIT 2**, `consumer.ts(7,106): error TS2554: Expected 7 arguments, but got 8.` Dọn thư mục copy, `lib/types/*.d.ts` **không đổi sha** (0 tệp thay đổi).
- Giới hạn đứng nguyên (t56 tự khai): `--skipLibCheck` nuốt chẩn đoán **bên trong** tệp khai báo, nên cổng chứng minh “khai báo parse + bind + đúng khi bị tiêu thụ”, không chứng minh mọi kiểu nội bộ nhất quán; hành vi runtime nằm ngoài cổng.

## 5. Quét hồi quy + t82 (chiều FAIL → PASS do mã)

- **27 suite thuần EXIT 0**: t3 18/18 · t4 22/22 · t10 **48/48** · t15 21/21 · t20 15/15 · t24 12/12 · t28 20/20 · t30 8/8 · t37 14/14 · t38 17/17 · t39 11/11 · t40 20/20 · t43 19/19 · t44 11/11 · t46 15/15 · t48 6/6 · t49 16/16 · t50 11/11 · t54 14/14 · t56 **20/20** · t57 29/29 · t58 23/23 · t62 27/27 (sàn `:focus-visible 21 · :hover 16 · :disabled 12 · :active 4`) · t70 16/16 · t74 24/24 · t77 18/18 · **t86 8/8**.
- **17 suite `--analyze` EXIT 0**: t11 (C1..C8, 11 check) · t18 (C1..C9) · t21 (A1..A7) · t27 (16/16) · t29 (C1..C5) · t35 (7/7) · t42 (9/9) · t45 (C1..C7) · t51 (C1..C6) · t52 (12/12) · t59 (C1..C9) · t63 (14/14) · t68 (14/14) · t72 (15/15) · t75 (15/15) · t78 (16/16) · **t84 (21/21, drift=0 trên 12 tệp, 3 chiều khớp, boot gọi 3 tool)**.
- **t82 hai artifact, cùng một bộ chấm**: `run-2026-10-31T21-12-51-903Z` → **EXIT 1 (FAIL C3)**; `run-2026-10-31T21-25-33-603Z` → **EXIT 0 (PASS 6/6)**. Vì mã chấm không đổi, chiều FAIL→PASS đến từ bản vá t86 (child thật `cab3814f-…`), không phải từ nới lỏng tiêu chí.
- Quét tĩnh 45 tệp `tests/*.mjs`: **0 `.skip(`**, **0 `catch {}` rỗng**; 8 tệp có chuỗi `process.exit(0)` nhưng tất cả nằm **trong payload chuỗi** của probe con (`t42:302`, `t52:309/:551/:552`, `t63`, `t68`, `t72`, `t75`, `t78`, `t84`), không phải cổng exit của suite.
- Công cụ tài liệu: `node tools/check-doc-paths.mjs --summary` → `files=5 paths=75 paths_missing=0 links=41 links_missing=0`, **EXIT 0**.

## 6. Findings

- **V11-F1 (medium, tài liệu — chặn CÔNG BỐ, không phải lỗi t84)**: `docs/bao-cao-agent-teams.md` vẫn chỉ bản **t78** và hash **trước t86**. Vị trí: `:36` (`tools.js 194 888`, `members.js 99 402`), `:38`, `:49-:56` (§2.3/§2.4 = t78 `cb234b08…`, 2 241 383 B), `:101`, `:116` (`paths=65`), `:134` (“bản đúng hiện hành là t78”). Số đo hiện tại: `tools.js 75800e15fce2/196 084`, `members.js 4f818b73803d/100 367`, `types/members.d.ts c53250ab41bf/31 769`, `paths=75`. Hệ quả thật: người vận hành làm theo §2.3 sẽ **cài t78** — bản **thiếu vá BUG-023** (scheduler bỏ qua `routeOverride`) và lệch nguồn ở 3 tệp.
- **V11-F2 (medium, kỷ luật)**: member pack **6 lần** trong khi trần là 4 (`docs/kiem-thu/t84-pack.md:53` tự khai). Hệ quả đo được: tồn tại tên tệp phát hành từng trỏ vào bản **trước** t86 (`7e152b16d071…`/2 242 144 B); bản đó **không còn trên đĩa**, và bản chốt đúng nguồn nên không có byte sai nào được phát hành. Đề nghị: trần pack tính theo **số lần ghi ra tên tệp phát hành**, hoặc bắt buộc đổi tên mỗi lượt pack (`…-run<N>.tgz`) để không bao giờ có hai bộ byte sau một cái tên.
- **V11-F3 (info)**: `--analyze` chỉ chấm lại `meta.json` do lượt chạy ghi ra; nó không tự dựng lại bằng chứng. t82 hai artifact cho thấy phép so vẫn có răng, nhưng “analyze PASS” không thay được một lượt chạy thật.
- **V11-F4 (info)**: 8 chuỗi `process.exit(0)` trong probe con (mục §5) — nếu ai đó grep thô sẽ tưởng suite tự exit 0; đây là payload, không phải cổng.
- **V11-F5 (info, đứng nguyên từ vòng trước)**: `agent-teams/*` session event vẫn bị host bỏ (`lib/events.js:33-40`); audit trail thật là `team.json routeOverride` + `docs/log/MODEL-SWITCH.md`.
- **V11-F6 (info)**: `tests/t27-rollback.mjs --analyze` phát lại văn bản lượt chạy cũ (“DOC SAI muc 5”, “muc 7 chua chay”) trong khi tài liệu đã đúng — đọc artifact phải kèm mốc thời gian.

## 7. Điều kiện hiệu lực (verdict hết hiệu lực khi nào)

1. Verdict này **chỉ đúng cho bộ byte** `220a6da96f82…37db1` / 2 242 952 B / 133 entry, đo lúc 2026-10-31T21:2x Z. **Nếu `lib/**` đổi sau mốc chấm, verdict hết hiệu lực** — phải pack lại rồi audit lại (đúng quy ước các vòng trước).
2. **Không pack lại** t84: pack lại tạo bộ byte khác dưới cùng tên ⇒ chính tarball đã chấm không còn tồn tại.
3. Trước khi cài, người vận hành **tự kiểm sha256 + size + số entry** (2 242 952 B / 133) — không tin tài liệu (xem V11-F1).
4. Trước khi **công bố**: sửa V11-F1 trong `docs/bao-cao-agent-teams.md` (người viết: dev-ui-goat) và cập nhật `docs/TODO.md` hàng t85; hai việc này không đụng `lib/**` nên không làm hết hiệu lực verdict.
5. Ba hạn chế đứng nguyên: chưa bấm GUI trên phiên sống, `peerDependencies` do host cấp (không registry), rollback Windows phải copy tay.
