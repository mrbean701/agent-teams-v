# t30 — `last_failure` trong output `agent_teams_status`

Vá nốt NFR-KHANG-LOI-PROVIDER-01 ở tầng captain: t28 ghi bền `members[].lastFailure` vào team.json + surface trong `lib/snapshot.js`, nhưng tool captain đọc hằng ngày dựng DTO riêng ở `lib/tools.js` nên vết lỗi không hiện ra.

## Cách chạy (suite tự định vị, harness in-memory, 0 quota, không cần profile)

```
node tests/t30-status-last-failure.mjs && node --check packages/dsh-agent-teams/lib/tools.js
node tests/t4-control-plane-smoke.mjs && node tests/t28-provider-failure.mjs && node tests/t3-route-smoke.mjs
```

## DTO đã sửa — `lib/tools.js:2233-2244` (handler `agent_teams_status`)

Spread `...member.lastFailure === undefined ? {} : { last_failure: { code, message, at,
provider: ?? '', model: ?? '' } }` chèn ngay sau `spawn_error` (`:2232`), cùng khuôn
`route_override`. Member chưa có vết lỗi KHÔNG có khoá `last_failure` (không `null`, không
`{}`); 0 khoá cũ bị đổi tên hay kiểu.

## Kết quả thật (exit code lấy trực tiếp, không qua pipe)

| lệnh | exit | kết quả |
|---|---|---|
| `node --check lib/tools.js` | 0 | hợp lệ |
| `node tests/t30-status-last-failure.mjs` | 0 | TOTAL 8 checks, 8 passed, 0 failed |
| `node tests/t4-control-plane-smoke.mjs` | 0 | 22/22 cases passed |
| `node tests/t28-provider-failure.mjs` | 0 | 20/20 passed, 0 failed |
| `node tests/t3-route-smoke.mjs` | 0 | 18/18 passed, 0 failed |

8 case t30: (a) đủ 5 khoá trị đúng; (a2) provider/model thiếu → `''`; (a3) sống qua round-trip
team.json; (b) member lành KHÔNG có khoá; (b2) member hỏng không lây khoá sang hàng xóm;
(c) `route_override`/`next_route`/`spawn_error` vẫn đủ; (c2) bộ khoá member lành đúng bằng
bộ khoá cũ; (d) vẫn render text + `JSON.stringify` không vỡ.

## Giới hạn còn lại

- Panel/UI **chưa** hiện vết lỗi: `lib/client.js` KHÔNG được dựng lại trong task này (brief
  cấm), nên bundle đang phát hành vẫn là bản cũ; `renderStatus` cũng chưa in dòng lỗi.
- Không chạy lại E2E thật (t18/t11): thay đổi chỉ thêm một khoá đọc từ state đã có bằng chứng
  ở t28. Không dùng `git` (0 lệnh git), không `npm install`.
