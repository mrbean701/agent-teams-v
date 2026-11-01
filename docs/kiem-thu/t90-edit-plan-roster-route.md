# t90 - roster của edit_plan phải hiện route HIỆU LỰC (BUG-024)

Phạm vi: `packages/dsh-agent-teams/lib/tools.js` (`editPlanRosterRow` + dòng roster của
`agent_teams_edit_plan`), `tests/t90-edit-plan-roster-route.mjs` (mới), `docs/log/BUG.md`
(mục BUG-024), tài liệu này. Không sửa `lib/members.js`, `lib/state.js`, `lib/snapshot.js`,
`lib/index.js`, `lib/client/**`, `package.json`, `tools/**`.

## 1. Lỗi

`agent_teams_edit_plan` dựng roster bằng spine khai báo:

```js
roster: updated.members.map((member) => `${member.name} (${member.role || 'member'}; ${member.provider ?? ''}/${member.model ?? ''})`),
```

(`lib/tools.js:1183` trước sửa). Member **staged** (`id === ''`) vẫn mang được
`routeOverride` (`setMemberRoute` không guard theo phase) và từ t87 `approveStagedTeam`
khởi động member bằng `membersApi.selectionFromMember(member)`. Hệ quả: captain đọc roster
thấy `p1/m9`, duyệt kế hoạch, rồi member chạy `p2/m2` — cùng một lỗi gốc với BUG-023 nhưng ở
đường HIỂN THỊ.

## 2. Cách sửa

Thêm một renderer dùng chung (`lib/tools.js:1059-1088`):

```js
function editPlanRosterRow(member) {
    const declaredRoute = `${member.provider ?? ''}/${member.model ?? ''}`;
    const selection = membersApi.selectionFromMember(member);
    if (typeof selection?.provider !== 'string' || typeof selection.model !== 'string' || selection.provider === '' || selection.model === '')
        return `${member.name} (${member.role || 'member'}; ${declaredRoute})`;
    const route = `${selection.provider}/${selection.model}`;
    if (route === declaredRoute)
        return `${member.name} (${member.role || 'member'}; ${route})`;
    const origin = membersApi.routeOf(member)?.origin;
    const marker = origin === 'fallback' ? ' (fallback)' : origin === 'active' ? ' (active)' : ' (override)';
    return `${member.name} (${member.role || 'member'}; ${route}${marker})`;
}
```

và dòng roster của `agent_teams_edit_plan` (`lib/tools.js:1195`) thành:

```js
roster: updated.members.map(editPlanRosterRow),
```

Quy ước:

| Tình huống | Chuỗi |
|---|---|
| member không override | `alice (researcher; p1/m1)` — GIỐNG HỆT bản cũ |
| có `routeOverride` | `alice (researcher; p2/m2 (override))` |
| `fallbackActive` (fallback > override) | `alice (researcher; p3/m4 (fallback))` |
| dòng cũ còn `activeProvider`/`activeModel` | `alice (researcher; p3/m4 (active))` |
| removed / không route | `gone (dev; /)` — hiển thị an toàn, không throw |

Spine chỉ còn được đọc cho 2 việc: so sánh để quyết định dấu, và dòng của member KHÔNG có
route nào. Precedence fallback > override > active > declared vẫn nằm MỘT CHỖ ở
`lib/members.js routeOf`; roster chỉ tiêu thụ `selectionFromMember`.

## 3. Bằng chứng

- `node tests/t90-edit-plan-roster-route.mjs` ⇒ `# 10/10 passed, 0 failed`, EXIT=0,
  `verdict PASS - the edit_plan roster follows the effective route (BUG-024 closed)`.
  10 case: a1 (định dạng cũ), b1 (override + dấu), c1 (precedence fallback > override),
  c2 (dòng `active` cũ), d1 (roster hỗn hợp giữ thứ tự), e1 (ĐỐI CHỨNG ÂM trong bộ nhớ),
  f1 (removed / thiếu route), g1 (mã nguồn không còn dòng cũ), h1 + i1 (chạy tool THẬT trên
  team staged, có và không có override).
- Đối chứng âm e1 chạy HOÀN TOÀN trong bộ nhớ: công thức cũ tái hiện bằng hàm
  `oldRosterRow` trả `alice (researcher; p1/m9)` cho đúng fixture của lỗi, khác chuỗi mới,
  và renderer mới được chứng minh gọi `selectionFromMember` đúng 1 lần/dòng
  (bản cũ: 0 lần). Không ghi tệp nào.
- Mutation (chạy ngoài suite, sau đó khôi phục): đảo dòng roster về mã cũ
  ⇒ `applies=1 original_bytes=199180 mutated_bytes=199268 delta_bytes=88`;
  suite ⇒ `# 8/10 passed, 2 failed` EXIT=1 (g1 "the pre-fix roster line must be gone",
  h1 actual `alice (researcher; p1/m9)`); khôi phục ⇒ `identical=true`
  sha256 `a9ad29f8ae87a884a78f100312f0f45f6650747fe594272067951401d709b275` / 199 180 B
  và suite lại `10/10`.
- Hồi quy (EXIT thật, chạy từ `E:/Project/Agent-Team`): `t87-approve-override` 8/8 EXIT=0 ·
  `t86-override-before-spawn` 8/8 EXIT=0 · `t43-member-profile` 19/19 EXIT=0 ·
  `t50-edit-plan-removed-assignee` 11/11 EXIT=0 · `t3-route-smoke` 18/18 EXIT=0.
- `node --check` trên `lib/tools.js` và suite: OK.

## 4. Hash `lib/tools.js`

| | sha256 | bytes |
|---|---|---|
| TRƯỚC (dựng lại: đảo đúng dòng của t90) | `40ee19d8d1c13cd951eb3994fcf123c6a7fdede05d2da1675f2356e82b2be48a` | 199 268 |
| SAU | `a9ad29f8ae87a884a78f100312f0f45f6650747fe594272067951401d709b275` | 199 180 |

Bản "TRƯỚC" được dựng bằng cách đảo đúng một dòng của t90 trên bản hiện tại (đó cũng chính
là bản dùng cho mutation), vì tệp đã bị sửa trước khi kịp đo hash gốc.

## 5. Giới hạn còn lại (nói thẳng)

1. `roster` chỉ để HIỂN THỊ: `team.json` không đổi. Case h1 assert spine vẫn `p1/m9` sau
   `edit_plan`; chỉ dòng hiển thị theo override.
2. Suy giảm THẬT xuống provider dự phòng vẫn phải chạy qua `agent/request-error` +
   `recordAutoFallback` (t54) — suite này không chứng minh đường đó, chỉ chứng minh chuỗi
   hiển thị đọc đúng precedence.
3. DTO `agent_teams_status` và `assembleTeamSnapshot` vẫn trả `provider`/`model` là spine;
   chúng đã có `next_route` / `route_origin` / `route_override` riêng, nhưng chưa có dấu
   `(override)` trong cùng một dòng như roster — ngoài phạm vi t90.
4. `render` của `agent_teams_edit_plan` chỉ in `graph`, KHÔNG in `roster`, nên Web UI chưa
   thấy dấu `(override)`; muốn thấy phải sửa `render` (task riêng).
5. `editPlanRosterRow` là hàm trong closure `apply()`, không export; muốn test thuần phải
   cắt theo độ sâu ngoặc (như suite đang làm) — nếu tương lai có nhu cầu dùng lại, nên export
   từ `lib/members.js` thay vì cắt chuỗi.
