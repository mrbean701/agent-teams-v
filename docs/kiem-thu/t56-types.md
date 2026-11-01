# t56 — Đồng bộ khai báo TypeScript với JavaScript sau t54

## 1. Vì sao phải có t56

t54 đổi ba thứ trong `lib/members.js` (thêm tham số `message` cho `isFallbackFailureCode`, thêm
`failureMessage` cho `selectFallbackRoute`, thêm hẳn `recordAutoFallback`) nhưng
`lib/types/members.d.ts` vẫn giữ chữ ký cũ. Repo **không có `tsconfig.json`** nên không có bước
`tsc` nào đối chiếu hai bên — `.d.ts` là tài liệu viết tay, lệch bao lâu cũng không ai báo.
Hệ quả thật: người viết mã theo khai báo sẽ gọi `isFallbackFailureCode(code)` một tham số và mất
đúng nhánh t54 mở ra (`INVALID_REQUEST` + "Model is unavailable."), tức fallback tự tụt im lặng.

## 2. Cơ chế kiểm (test đọc TEXT, không cần tsc)

`tests/t56-types-fallback.mjs` đọc nguyên văn hai tệp rồi so chữ ký:

- `jsParams()` bắt `export (async )?function <tên>(` … `)` trong `lib/members.js`, tách tham số
  theo dấu phẩy ở mức ngoài cùng (bỏ qua `{}`/`()`/`[]` lồng nhau).
- `dtsParams()` bắt `export declare function <tên>(` trong `.d.ts`, đọc cả dấu `?` để biết tham số
  có tuỳ chọn hay không.
- `drift(dts, js)` trả danh sách lỗi: sai số lượng, lệch tên, khai báo một hàm JS không export,
  hoặc export JS chưa khai. Test dùng CHÍNH `drift()` cho cả ca âm (n1) nên một lần xanh có nghĩa.

## 3. Chỗ sửa

| Tệp | Dòng | Nội dung |
| --- | --- | --- |
| `packages/dsh-agent-teams/lib/types/members.d.ts` | 250 | `isFallbackFailureCode(code: string, message?: string): boolean` (JS: `lib/members.js:121`) |
| nt | 274-288 | `selectFallbackRoute(..., alreadySwitched: boolean, failureMessage?: string)` — 5 tham số (JS: `lib/members.js:129`) |
| nt | 292-315 | `export type MemberAutoFallbackRequest` — `stateRoot/teamId/memberName/previous/fallback/workspace/by?/at?` |
| nt | 325 | `recordAutoFallback(ctx: Context, request: MemberAutoFallbackRequest): Promise<boolean>` (JS: `lib/members.js:389`) |
| `tests/t56-types-fallback.mjs` | 1-295 | 12 case d1-d12; `KNOWN_UNDECLARED` :120; `drift()` :128 |
| `docs/kiem-thu/t56-types.md` | — | tệp này |

Không sửa một tệp `.js` nào: `packages/dsh-agent-teams/lib/members.js` giữ nguyên
sha256 `1562be4d527ddb02…` / 99 402 B — đúng hash sau khi t54 khôi phục mutation.

## 4. Cách đọc kết quả

`node tests/t56-types-fallback.mjs` in từng dòng `ok <n> <tên case>` rồi `# N/M passed, K failed`,
exit 0 khi K = 0. Ca d9 (âm bản) tự viết lại bản khai báo CŨ vào bộ nhớ và đòi `drift()` báo đúng
ba lỗi, nên test không thể "xanh giả" nếu ai đó làm hỏng bộ so.

## 5. Giới hạn còn lại

1. `KNOWN_UNDECLARED` (:120) ghim 3 export có từ t43 mà `.d.ts` chưa khai: `MEMBER_ROLE_MAX`,
   `MEMBER_EXECUTION_PROMPT_MAX`, `setMemberProfile`. t56 chỉ sở hữu phần t54 nên chưa khai chúng —
   nhưng danh sách bị GHIM: export mới chưa khai, hoặc khai một trong ba mà không cập nhật danh sách, đều FAIL.
2. Test so CHỮ KÝ và kiểu đối tượng; nó không kiểm kiểu bên trong thân hàm (không có `tsc`).
3. Chỉ phủ `lib/types/members.d.ts`. Các `.d.ts` khác (types.js, snapshot, tools) vẫn viết tay, chưa có bộ so.
