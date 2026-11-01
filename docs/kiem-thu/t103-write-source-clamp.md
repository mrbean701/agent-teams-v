# t103 — BUG-026 nửa GHI: chỉ 3 nguồn do plugin sở hữu được ghi vào provenance

Suite: `node tests/t103-write-source-clamp.mjs` (chạy từ gốc repo).
Tệp sửa: `packages/dsh-agent-teams/lib/members.js`, `tests/t103-write-source-clamp.mjs` (mới), doc này, `docs/log/BUG.md`.

## 1. Lỗ hổng

`lib/members.js` lấy provenance bằng `const source = request.source ?? 'captain';` — KHÔNG kiểm giá trị — ở hai chỗ:

| Hàm | Dòng (trước vá) | Hậu quả nếu caller truyền `source:'erp'` |
| --- | --- | --- |
| `setMemberRoute` | `:1323` | `routeOverride.source='erp'` vào `team.json` + một dòng `docs/log/MODEL-SWITCH.md` mang `erp` |
| `setMemberProfile` | `:1583` | cùng lớp: dòng `docs/log/MEMBER-PROFILE.md` mang `erp` |

Đường công khai hôm nay đều hard-code giá trị hợp lệ, nên lỗ chỉ mở với caller nội bộ/tương lai. Nhưng provenance chỉ có nghĩa khi người ta tin được nó: một `source` mà bất kỳ ai cũng ghi được thì tệ hơn không có `source`. Đây là nửa còn lại của BUG-026 — nửa ĐỌC đã mở có chủ ý ở t102 (`state.js` `isProvenanceSource`), nửa GHI phải đóng lại cho cân.

## 2. Cách sửa (packages/dsh-agent-teams/lib/members.js)

Thêm ngay trước `setMemberRoute` một khối có JSDoc nêu rõ lý do, và một hàm resolve dùng chung cho cả hai đường ghi:

```js
const PROVENANCE_SOURCES = ['captain', 'http', 'profile'];
function resolveProvenanceSource(source, what) {
    if (source === undefined)
        return 'captain';
    if (typeof source === 'string' && PROVENANCE_SOURCES.includes(source))
        return source;
    const shown = typeof source === 'string' ? JSON.stringify(source) : `${typeof source} ${String(source)}`;
    throw new Error(`agent-teams: ${what} refused: source ${shown} is not one the plugin owns (valid sources: ${PROVENANCE_SOURCES.join(', ')}); nothing was written`);
}
```

Gọi ở `setMemberRoute` (dòng 1351, TRƯỚC `withTeamLock`) và ở `setMemberProfile` (dòng 1613, TRƯỚC mọi write). Vì resolve chạy trước lock/read/write, một `source` lạ không mở khoá, không đọc đội, không ghi `team.json`, không thêm dòng audit nào — `team.json` giữ nguyên từng byte.

Thông điệp lỗi (nguyên văn, `what` = `route change for member "alice"` / `profile change for member "alice"`):

```text
agent-teams: route change for member "alice" refused: source "erp" is not one the plugin owns (valid sources: captain, http, profile); nothing was written
```

Phần `; nothing was written` là chủ ý: người vận hành phải biết call này KHÔNG có tác dụng phụ nào.

Mở rộng so với yêu cầu ban đầu: `setMemberProfile` được vá LUÔN trong cùng task (cùng tệp, cùng đường ghi, cùng lớp lỗi) — nếu chỉ vá `setMemberRoute` thì nửa GHI vẫn hở đúng một cửa.

## 3. Bảng caller trong repo

| Caller | Giá trị `source` | Còn hợp lệ? |
| --- | --- | --- |
| `lib/tools.js:1327` (`agent_teams_add_member`) | `'captain'` | hợp lệ |
| `lib/tools.js:1435` (`agent_teams_set_member_route`) | `'captain'` | hợp lệ |
| `lib/tools.js:1513` (`agent_teams_set_member_profile`) | `'captain'` | hợp lệ |
| `lib/index.js:363` / `:383` / `:408` / `:447` / `:479` (HTTP route) | `'http'` | hợp lệ |
| `lib/index.js:513` (HTTP profile) | `'http'` | hợp lệ |
| `tools/erp-route-migrate.mjs:58` (`ROUTE_SOURCE`) | `'profile'` | hợp lệ |
| `tests/t3-route-smoke.mjs:146` | `'captain'` | hợp lệ |
| `tests/t3-route-smoke.mjs:171` | `'http'` | hợp lệ |
| `tests/t3-route-smoke.mjs:198` / `:203` / `:208` | (không truyền) | hợp lệ — mặc định `captain` |
| `tests/t37-route-clear.mjs`, `tests/t43-member-profile.mjs` | (không truyền) | hợp lệ |
| `tests/t102-erp-read-leniency.mjs:344` | `'erp'` — nhưng qua TOOL, không qua `setMemberRoute` | KHÔNG lọt: tool hard-code `captain`, t102 g1 + t103 d1 chứng minh bản ghi bền là `captain` |
| t15/t20/t28/t30/t39/t86/t87/t90/t94/t99/t10/t98… | dựng `routeOverride` TRỰC TIẾP trên đĩa, không gọi `setMemberRoute` | không đi qua clamp (đúng: đó là fixture dữ liệu ĐỌC) |

Không có test nào đang truyền giá trị lạ qua đường ghi, nên không phải sửa test nào. Kiểm bằng số: `grep -c "source: 'captain'" lib/tools.js` = **3**, `grep -c "source: 'http'" lib/index.js` = **6** — không đổi sau khi thêm guard.

`lib/types/members.d.ts` (CHỈ ĐỌC, không sửa) đã khai đúng union này từ trước: `source?: 'captain' | 'http' | 'profile'` ở `:203` và `:267`. Tức bản khai báo kiểu vốn đã đúng, chỉ có mã JS không thi hành nó — sau t103 hai bên khớp nhau. Thêm một nguồn mới sau này phải sửa CẢ `PROVENANCE_SOURCES` lẫn hai dòng `.d.ts` đó.

## 4. Mười case và số đo thật

`node tests/t103-write-source-clamp.mjs` ⇒ **EXIT 0**, `# 10/10 passed, 0 failed`.

| Case | Chứng minh (in ra thật) |
| --- | --- |
| a1 `'erp'` | ném đúng thông điệp; `team.json` sha256 không đổi; `audit_rows=0` |
| a2 `'script'` | như a1 — chứng minh chuỗi KHỚP regex đọc lenient của t102 vẫn bị chặn ở đường GHI |
| a3 `123` (không phải chuỗi) | như a1 |
| b1 `'captain'` | `durable=captain`, `audit_col8=captain` |
| b2 `'http'` | `durable=http`, `audit_col8=http` |
| b3 `'profile'` | `durable=profile`, `audit_col8=profile` |
| c1 không truyền | `durable=captain`, `audit_col8=captain` (mặc định giữ nguyên) |
| f1 `setMemberProfile` | `erp` ⇒ ném + không dòng `MEMBER-PROFILE.md` nào; `profile` ⇒ `audit_col6=profile` |
| d1 tool THẬT | chạy `agent_teams_set_member_route` với `source:'erp'` ⇒ outcome `accepted`, bản ghi bền `{"provider":"p3","model":"m3","source":"captain",…}` — không lọt |
| e1 ĐỐI CHỨNG ÂM | xem §5 |

Số đo byte-identical cho nhóm (a): fixture `team.json` sha256 `707bf248a29a…` giống nhau trước/sau cả 3 lần bị từ chối, và số dòng `MODEL-SWITCH.md` đứng nguyên `0`.

## 5. Đối chứng âm (bằng chứng guard có răng)

Case e1 copy `lib/` sang `tests/tmp/t103/e1-*/`, thêm một junction `node_modules` → `packages/dsh-agent-teams/node_modules` (để các import `@deepseek-ai/*` phân giải được trong bản copy), thay ĐÚNG một dòng guard bằng mã cũ `const source = request.source ?? 'captain';`, rồi import bản copy và gọi cùng một request:

```text
applies=1 old_bytes=102175 new_bytes=102120 delta_bytes=-55 durable_source="erp" audit_row_written=true
```

Bản đã vá, cùng byte dữ liệu, cùng request ⇒ NÉM và không ghi gì (a1). Bản copy bỏ guard ⇒ GHI `routeOverride.source='erp'` và cả dòng audit — đúng triệu chứng của BUG-026 nửa GHI. Thư mục copy bị xoá trong `finally`.

## 6. Hồi quy — lệnh · EXIT · số case THẬT

| Lệnh | EXIT | Số case thật |
| --- | --- | --- |
| `node tests/t103-write-source-clamp.mjs` | 0 | `# 10/10 passed, 0 failed` |
| `node tests/t43-member-profile.mjs` | 0 | `# 19/19 passed, 0 failed` |
| `node tests/t37-route-clear.mjs` | 0 | `# 14/14 passed, 0 failed` |
| `node tests/t38-member-fallback.mjs` | 0 | `# 17/17 passed, 0 failed` |
| `node tests/t58-erp-migrate.mjs` | 0 | `# 23/23 passed, 0 failed` |
| `node tests/t102-erp-read-leniency.mjs` | 0 | `# 17/17 passed, 0 failed` |
| `node tests/t3-route-smoke.mjs` | 0 | `# 18/18 passed, 0 failed` |
| `node tests/t56-types-fallback.mjs` | 0 | `# 20/20 passed, 0 failed` (comment dòng trong `.d.ts` vẫn khớp members.js) |
| `node --check packages/dsh-agent-teams/lib/members.js` | 0 | — |

`tests/t45-clear-live-e2e.mjs` KHÔNG chạy (live, cần boot session thật). Đã ĐỌC: nó không truyền `source` — chỉ đọc cột 8 của bảng `MODEL-SWITCH` (`source: cells[7]`) và so `event.data?.source?.form === 'notice'`, nên clamp không ảnh hưởng. `t82` cũng không chạy: live/boot thật, không đi qua `setMemberRoute`.

Ghi chú hồ sơ: **ledger verify #2 ghi sai tên tệp** (`node tests/t43-set-member-profile.mjs` — tệp đó chưa bao giờ tồn tại); captain đã `amend_task` sửa về `tests/t43-member-profile.mjs` và thêm t102 + t3 vào verify. Không tạo forwarder.

## 7. Giới hạn còn lại (nói thẳng)

1. **Ghi chặt / đọc lỏng là cặp có chủ ý**: `state.js` vẫn ĐỌC được `source:'erp'` (t102), nay chỉ plugin mới không GHI được giá trị lạ. Ai sửa `team.json` bằng tay hoặc bằng công cụ ngoài vẫn ghi được `erp` — và điều đó là cần thiết để đội ERP không chết. Vì vậy `source` là TOKEN mô tả, KHÔNG phải khoá tin cậy.
2. **`by` và `at` không bị kiểm**: `request.by` là chuỗi tuỳ ý, `at` là `Date.now()` do plugin tự đặt. Caller nội bộ vẫn có thể ghi `by:'tools/erp-route-migrate'` giả — ngoài phạm vi t103, cần thì mở task riêng.
3. **Hai nơi phải cùng sửa**: `PROVENANCE_SOURCES` trong `lib/members.js` và union `'captain' | 'http' | 'profile'` trong `lib/types/members.d.ts:203`/`:267`. Hiện khớp; thêm nguồn mới mà quên một bên thì `.d.ts` và runtime lệch nhau (t56 không bắt được vì đó là kiểu, không phải giá trị).
4. **Chỉ đường ghi của members.js**: các validator đọc (`lib/state.js`) giữ nguyên luật lenient; `tools/erp-route-migrate.mjs` tự hard-code `'profile'`, không gọi qua guard này — nếu sau này nó cho phép `--source` thì phải đi qua cùng một luật.

## 8. Mốc tệp

| Tệp | sha256 / byte |
| --- | --- |
| `packages/dsh-agent-teams/lib/members.js` (sau vá) | `50f558f8b207d874d3d8052373b2dafc93cfe9ae54100ae03a4a7ed9f8bf1661` / 102 260 B |
| `packages/dsh-agent-teams/lib/members.js` (trước vá, mốc pack vòng 14) | `4f818b73803d…` / 100 367 B |
| `tests/t103-write-source-clamp.mjs` | `b8d544840179c1a2b68b92a0e35bda360429066451362986427ef483a52519a7` / 15 019 B |
| fixture `team.json` (mọi case a) | `707bf248a29a…` — không đổi qua 3 lần bị từ chối |
