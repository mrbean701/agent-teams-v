# t77 — Khai báo kiểu captainRoute trong lib/types/snapshot.d.ts

t74 thêm `captainRoute` vào payload snapshot (`lib/snapshot.js`), nhưng `lib/types/snapshot.d.ts` vẫn giữ hình dạng cũ ⇒ kiểu tay lệch payload. Repo không có tsconfig.json và không có node_modules nên không tsc nào bắt được drift này.

## Đã khai

- `lib/types/snapshot.d.ts`: interface mới `TeamCaptainRoute` — `provider: string`, `model: string` (bắt buộc), `reasoningEffort?: string` (tuỳ chọn, vắng khi header không khai); kèm doc ghi rõ nguồn dữ liệu (`captain.session.requestHeader().config`, fallback `captain.options`, khớp `resolveMemberLlmSelection` của lib/members.js).
- `TeamActivitySnapshot.captainRoute?: TeamCaptainRoute` đặt NGAY SAU `captainSessionId` (đúng thứ tự payload), doc nói rõ khoá VẮNG — không phải object rỗng — khi captain không xác định.

Không sửa `lib/snapshot.js`, không sửa `lib/client/**`, không sinh lại bundle (tệp .d.ts bị xoá lúc build: suite có case a7 chứng minh `lib/client.js` không tham chiếu `types/snapshot`).

## Suite mới: tests/t77-types-captain-route.mjs (18 case)

| nhóm | nội dung |
|---|---|
| a1–a3 | khai đúng: field optional + kiểu `TeamCaptainRoute`, 3 trường đúng optionality, doc ghi "ABSENT"/"empty object" |
| a4 | `drift()` đọc TEXT: khoá bắt buộc khai báo == khoá shorthand của `declaredCaptainRoute`, khoá tuỳ chọn == nhánh spread `{ reasoningEffort }` |
| a5–a6 | thứ tự field khớp payload; không trùng tên khai báo |
| a7 | .d.ts bị xoá lúc build ⇒ không nợ lần rebuild bundle nào |
| b1–b6 | chạy `assembleTeamSnapshot` THẬT: route 3 khoá, mọi khoá payload đều được khai, khoá bắt buộc luôn có, `reasoningEffort` vắng khi rỗng, khoá VẮNG ở 4 cảnh thiếu captain, JSON round-trip |
| n1–n5 | đối chứng âm: bỏ field ⇒ bị bắt; field thành bắt buộc ⇒ bị bắt; bỏ `reasoningEffort` ⇒ bị bắt; đổi tên kiểu ⇒ bị bắt; thêm khoá giả trong implementation ⇒ bị bắt |

## Bằng chứng (exit code đọc trực tiếp)

- `node --check tests/t77-types-captain-route.mjs` → SYNTAX_OK
- `node tests/t77-types-captain-route.mjs` → **EXIT=0**, `# 18/18 passed, 0 failed`
- hồi quy: `tests/t74-captain-route-warning.mjs` **0** (23/23) · `tests/t10-ui-bundle-smoke.mjs` **0** (47/47) · `tests/t70-addmember-default-route.mjs` **0** (16/16) · `tests/t56-types-fallback.mjs` **0** (12/12)
- `grep -rn TeamCaptainRoute lib --include=*.d.ts` → chỉ `lib/types/snapshot.d.ts` (khai báo + tham chiếu)

## Giới hạn

- Không chạy được `tsc` (repo không có node_modules/tsconfig) ⇒ suite so TEXT + hành vi runtime, không kiểu-hoá thật.
- Chưa đóng gói lại tarball: việc này thuộc một lượt pack sau (tarball t75 phát hành trước bản sửa .d.ts này).
