# t74 — route KHAI BÁO của captain xuống panel (cảnh báo "ngoài catalog" hiện thật)

## 1. Vì sao
t71 đã có hàm thuần `pickDefaultRoute(catalog, declaredRoute)` và form Add member preselect
entry đầu catalog, nên lỗi 409 của D1 hết. Nhưng payload team snapshot KHÔNG mang route khai
báo của captain ⇒ trong GUI `declaredRoute === undefined` ⇒ nhánh `warning: true` không bao
giờ chạy. t74 nối đúng sợi dây còn thiếu.

## 2. Nguồn route khai báo (không tự chế)
Host resolve route của member mới tại `packages/dsh-agent-teams/lib/members.js:543-545`
(`resolveMemberLlmSelection`):

    const current = captain.session.requestHeader()?.config;
    const currentProvider = current?.provider ?? captain.options.provider;
    const currentModel = current?.model ?? captain.options.model;

`lib/snapshot.js` đọc ĐÚNG hai chỗ đó qua `ctx.agents.get(state.captainSessionId)`
(hàm nội bộ `declaredCaptainRoute`, không export). Ca (f0)/(f1) của suite khoá lại việc này:
sửa nguồn bên members.js mà không sửa snapshot.js là suite đỏ.

## 3. Đã đổi
- `lib/snapshot.js`: thêm `captainRoute: { provider, model, reasoningEffort? }` vào object team,
  ngay sau `captainSessionId`. Thiếu dữ liệu ⇒ BỎ KHOÁ (không ghi object rỗng): `agents` vắng,
  session không còn sống, provider/model khai báo thiếu một nửa.
- `lib/client/MemberControls.js`: `declaredRoute = team.captainRoute`; cả hai chỗ gọi picker
  (render đầu + `adopt()` lúc catalog load) đều truyền nó; hint "đã tự chọn" bị ẩn khi
  `defaultPick.source === 'declared'`; cảnh báo mới `data-add-member-captain-route-warning`
  NÊU TÊN route khai báo bị thiếu.
- `lib/client/locales.js`: khoá `addMember.captainRouteOutside` ở đúng 2 từ điển (zh + en).
- `lib/client.js` + `.map`: chỉ sinh bằng `node build/build.mjs`.
- `tests/t74-captain-route-warning.mjs` (mới, 23 case) và 3 marker mới trong
  `tests/t10-ui-bundle-smoke.mjs` (44 → 47 check).

## 4. Bằng chứng (chạy từ E:/Project/Agent-Team)
| lệnh | exit | kết quả |
| --- | --- | --- |
| `node tests/t74-captain-route-warning.mjs` | 0 | `# 23/23 passed, 0 failed` |
| `node tests/t70-addmember-default-route.mjs` | 0 | `# 16/16 passed, 0 failed` |
| `node tests/t10-ui-bundle-smoke.mjs` | 0 | `TOTAL 47 checks, 47 passed, 0 failed` |
| `node tests/t3-route-smoke.mjs` | 0 | `# 18/18 passed, 0 failed` |
| `node tests/t4-control-plane-smoke.mjs` | 0 | `22/22 cases passed` |
| `node tests/t20-erp-compat.mjs` | 0 | `# 15/15 passed, 0 failed`, ERP sha256 `9f7420b6…e15f2d1e` / 1 533 117 B không đổi |
| `node build/build.mjs` ×2 | 0 0 | client.js `9da18d9971a284e9…fec7007` / 258 432 B, map `bbf88608f54e966f…cf6e5dae` / 404 958 B — HAI LẦN GIỐNG NHAU, 19 sources, 0 đường dẫn ổ đĩa |
| `node --check` snapshot/MemberControls/locales/client.js | 0 | cú pháp sạch |

Case âm trong bộ nhớ (g1/g2): đổi `if (declaredUsable)` → `if (false)` (delta 9 byte) làm ca (a)
rơi từ `source='declared'` xuống `source='catalog'` + `warning=true` ⇒ suite không xanh rỗng.

## 5. Chưa làm / giới hạn (nói thẳng)
- CHƯA chạy GUI: bằng chứng là payload + mã nguồn form + marker trong bundle, không phải ảnh chụp panel.
- `lib/types/snapshot.d.ts` chưa khai báo `captainRoute` — ngoài inScope của t74, cần việc riêng.
- Team đã archive hoặc session captain đã chết ⇒ payload KHÔNG có khoá, panel rơi về hành vi cũ
  (chọn entry đầu, không cảnh báo) — đúng thiết kế, nhưng nghĩa là cảnh báo chỉ hiện khi captain còn sống.
- Route khai báo chỉ để CẢNH BÁO và preselect; quyền quyết định route vẫn ở routeOverride/config như cũ.
