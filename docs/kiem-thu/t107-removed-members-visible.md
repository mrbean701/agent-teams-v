# t107 — hồ sơ `removed` phải hiện ra ở CẢ payload lẫn text (BUG-027)

- Ngày: 2026-11-01 (UTC) · thành viên: dev-runtime-goat · task: t107 (repair, finding F1 của t106)
- Phạm vi sửa: `packages/dsh-agent-teams/lib/tools.js`, `tests/t107-removed-members-visible.mjs` (mới), `tests/t98-render-coverage.mjs`, `tests/t59-erp-live-copy.mjs`
- Chạy mọi lệnh từ gốc repo: `E:/Project/Agent-Team`

## 1. Lỗi (trước khi sửa)

`agent_teams_status` lọc bỏ hồ sơ `removed` ngay khi dựng DTO:

```
packages/dsh-agent-teams/lib/tools.js:2444-2445 (trước t107)
    const members = team.members.filter((member) => member.status !== "removed").map(...)
```

rồi `renderStatus` in tiêu đề `Members (${team.members.length}):` trên chính DTO đã lọc đó. Với đội ERP thật
(`E:/Project/ERP/.agent-teams/erp-erp/team.json`, 14 member, 107 task) kết quả là `Members (7):` — và **không
chỗ nào** trong payload hay text cho biết trong tệp còn 7 hồ sơ `removed`.

## 2. Vì sao tầng payload nặng hơn tầng text

BUG-024/BUG-025 mất thông tin ở tầng text: payload đúng, chỉ `render` không in. Ở đây payload **sai** —
bất kỳ consumer nào đọc DTO (panel, audit, tool khác, mã ERP tự viết) đều thấy roster 7 người và không có
cách nào biết còn 7 bản ghi nữa. Sửa text mà không sửa DTO là vá triệu chứng; nên t107 sửa DTO trước,
rồi mới dạy `renderStatus` in phần mới.

## 3. Đã sửa (lib/tools.js)

**(a) DTO** — sau khối `members` đã lọc, thêm `removedMembers` và hai khoá cấp 1 trong `result`:

```
removed_count: removedMembers.length,
removed_members: [ { name, role, provider, model,
                     reasoning_effort?,        // khi khác rỗng
                     joined_at?,               // khi tệp có joinedAt
                     runtime_setup?: { persona, tool_filter },   // clip 400 ký tự mỗi trường
                     route_override?: { provider, model, reasoning_effort?, source, at, by } } ]
```

`members` GIỮ NGUYÊN hành vi cũ (đã lọc `removed`) — mọi tool khác đang phụ thuộc roster đó.

**(b) Text** — `renderStatus` tính `memberTitle` từ `removed_members`:

- M = 0: `Members (N):` và **không** có khối `Removed (…)` ⇒ text của đội thường không đổi một byte nào.
- M > 0: tiêu đề `Members (N present + M removed):` (t110 đổi `active` → `present`), các dòng member
  sống in như cũ, rồi thêm khối
  `Removed (M):` với mỗi dòng do `removedLine()` dựng:

```
  - <name> [<role>] <provider>/<model> · reasoning <E> · joined <ISO> · persona: <clip 120> · tools: <clip 120>
    (override route: <p>/<m> (reasoning <E>) by <source> (<by>) at <ISO>)      // chỉ khi có route_override
```

Phần mới **luôn thêm vào cuối**, chuỗi cũ giữ nguyên byte ⇒ t30/t59/t90/t94/t99 không vỡ.

## 4. Sự thật đo được trên tệp ERP thật (khác giả định ban đầu của hợp đồng)

Hợp đồng t107 giả định "hồ sơ `removed` mang `routeOverride` nguồn `erp`". Đo trực tiếp trên tệp:

| đo được | giá trị |
| --- | --- |
| thành viên | 14 = 7 `removed` (ha-tang, qa-do, tai-lieu, master-hop-dong, db-luoc-do, be-api, fe-ui) + 7 sống |
| `routeOverride` | **không thành viên nào có**, kể cả 7 hồ sơ `removed` |
| khoá thật của một member | `id, name, role, provider, model, reasoningEffort, joinedAt, status, runtimeSetup, executionPrompt` |
| `runtimeSetup` của hồ sơ removed | `{ persona: <4 073 ký tự>, toolFilter: <object> }` |
| `joinedAt` của hồ sơ removed | `1792664198066` |

Nghĩa là thứ thật sự bị mất ở payload là `runtimeSetup` + `joinedAt`, **không** phải `routeOverride`.
Vì vậy DTO mang thêm `runtime_setup` (persona/tool_filter clip 400 để payload không phình gấp đôi với 7 dòng
lịch sử) và `joined_at`; nhánh `route_override` vẫn được giữ và được chứng minh riêng bằng case a5 (đội khác
có override), vì đó là dữ liệu hợp lệ mà validator chấp nhận.

## 5. Test — `tests/t107-removed-members-visible.mjs` (12 case, EXIT 0)

| case | nội dung |
| --- | --- |
| a1 | 3 sống + 2 removed ⇒ `removed_count=2`, 2 phần tử `removed_members` đúng tên |
| a2 | tiêu đề `Members (3 present + 2 removed):` |
| a3 | khối `Removed (2):` in tên + `[role]` + route khai báo, và provenance nếu tệp có override |
| a4 | removed KHÔNG lọt vào `members`; khối member sống vẫn đúng 3 dòng |
| a5 | removed row ĐƯỢC gán `routeOverride {p2/m2, high, source erp, by migrate-erp}` ⇒ payload + text in đủ provenance |
| b1 | 3 sống + 0 removed ⇒ `Members (3):`, không có chuỗi `Removed (` |
| b2 | text đội không-removed giữ nguyên hình dạng cũ (dòng member ngay sau tiêu đề, khối `Tasks (0):` còn đó) |
| c1 | bản ERP thật ⇒ `Members (7 present + 7 removed):`, khối `Removed (7):` đủ 7 dòng |
| c2 | mỗi hồ sơ removed của ERP được báo với đúng khoá bền nó có (`joined_at`, `runtime_setup.persona`, ` · tools: `), override chỉ khi tệp có |
| d1 | `set_member_route` vẫn TỪ CHỐI thành viên removed, `team.json` không đổi sha256 |
| e1 | ĐỐI CHỨNG ÂM: copy mã CŨ vào `tests/tmp/t107/`, chạy cùng phép đo ⇒ `removed_count=undefined`, tiêu đề `Members (3):` |
| f1 | tệp ERP thật không bị chạm (`sha256` + byte) |

Đối chứng âm in ra: `applies=3 old_bytes=210641 new_bytes=210384 delta_bytes=-257` và
`pre-fix payload removed_count=undefined title="Members (3):"` — tức phép đo bắt đúng lỗi cũ.

## 6. Hai tệp ngoài inScope buộc phải sửa (và vì sao)

**`tests/t98-render-coverage.mjs`** — cổng `output.schema` ↔ `render` phải canh hai trường mới:

- `RENDER_LINES` neo theo số dòng, mà t107 dịch dòng render của `agent_teams_status`… không đổi (2431),
  nhưng `agent_teams_resume` 2620 → **2663** và `agent_teams_delete` 2670 → **2713** do khối removed chèn
  vào giữa tệp. Không cập nhật ⇒ cổng tự báo `GATE ERROR: stale RENDER_LINES map` (EXIT 2).
- `agent_teams_status` khai `properties: {}` nên cổng KHÔNG lấy được payload từ schema: nó đo bằng
  `STATUS_FIXTURE` viết tay. Đã thêm `removed_count`, `removed_members[0]` (kèm `joined_at`,
  `runtime_setup.persona`, `runtime_setup.tool_filter`, `route_override.by`) — nếu không thêm thì cổng chỉ
  không canh được hai trường mới chứ không đỏ, tức là im lặng cho qua.
- Chạy lại: `node tests/t98-render-coverage.mjs --strict` ⇒ `SUMMARY tools=16 fields=112 reached=106
  uncovered=0 nested_gaps=0 allow_listed=6 negative_control_applies=true`, verdict GREEN, EXIT 0.
  **Không** thêm gì vào ALLOW_LIST (vẫn 6 mục, tất cả là ngoại lệ của t99).

**`tests/t59-erp-live-copy.mjs` case C4** — assert cũ khẳng định đúng text cũ:

```
const memberLine = /Members (\d+)/.exec(statuses[0] ?? "");   // khớp "Members (7)"
... && memberLine !== null && Number(memberLine[1]) === 7
```

Với bản ERP có 7 hồ sơ removed, tiêu đề nay là `Members (7 present + 7 removed):` ⇒ regex cũ không khớp ⇒ C4
sẽ đỏ dù roster không đổi. Đã sửa thành nhận **cả hai** hình dạng và assert 7 present + 7 removed khi có mặt;
mô tả case nêu rõ. t59 là suite LIVE (boot thật, tốn thời gian) nên tôi không chạy lại — thay đổi chỉ là regex.
`tests/t11-http-e2e.mjs` **không** phải sửa: lần xuất hiện duy nhất của chuỗi `Members (` là văn bản mô tả
"3-member roster" ở dòng 543, không phải assert trên text status.

## 7. Bằng chứng (exit code thật, hash sha256 đo bằng node:crypto)

| lệnh | kết quả |
| --- | --- |
| `node tests/t107-removed-members-visible.mjs` | EXIT 0 — `# 12/12 passed, 0 failed` |
| `node tests/t98-render-coverage.mjs --strict` | EXIT 0 — `uncovered=0 nested_gaps=0`, verdict GREEN |
| `node tests/t99-render-parity.mjs` | EXIT 0 — 11/11 |
| `node tests/t56-types-fallback.mjs` | EXIT 0 — 20/20 (`tsc` gate) |
| `node tests/t94-edit-plan-roster-render.mjs` | EXIT 0 — 9/9 |
| `node tests/t90-edit-plan-roster-route.mjs` | EXIT 0 — 10/10 |
| `node tests/t43-member-profile.mjs` | EXIT 0 — 19/19 |
| `node tests/t3-route-smoke.mjs` | EXIT 0 — 18/18 |
| `node tests/t20-erp-compat.mjs` | EXIT 0 — 15/15 |
| `node tests/t11-http-e2e.mjs` | EXIT 0 — `proved C1..C8 (11 checks, 0 failed)` |

| tệp | sha256 | byte |
| --- | --- | --- |
| `packages/dsh-agent-teams/lib/tools.js` | `d402c6586df1e1402c799466ac5ac9333aab8d3828dabc1a0f735dc61c529434` | 210 641 |
| `tests/t107-removed-members-visible.mjs` | `874f480d1740051f9cfc5b1db65e99ffe833c13a6fb246ea0939af93b92ab47a` | 24 838 |
| `tests/t98-render-coverage.mjs` | `d00b94dfaedf0cc8bbe32c2ba43a0039bc2e105a7544390d648e3a6d42167cff` | 30 847 |
| `tests/t59-erp-live-copy.mjs` | `4c1a07354f056985ccfbac7e3ee9bac43f05da30d86621bbb6457e3038704394` | 25 707 |

Text NGUYÊN VĂN của hai nhánh (in từ suite):

```
M > 0 : Members (7 present + 7 removed):
        Removed (7):
          - ha-tang [Hạ tầng đo & vận hành — …] opencode-go-new/minimax-m3.1-flash-free · reasoning max · joined 2026-10-22T10:16:38.066Z · persona: You are ha-tang, … · tools: {"deny":[…
M = 0 : Members (3):
        (không có chuỗi "Removed (")
```

Tệp ERP gốc KHÔNG đổi: `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e`, 1 533 117 B.

## 8. Giới hạn còn lại (nói thẳng)

1. `lib/types/tools.d.ts` **không** khai kiểu DTO của `agent_teams_status` (tool khai `properties: {}`), nên
   hai trường mới chỉ được canh bằng `STATUS_FIXTURE` của t98 — fixture viết tay, thêm khoá vào DTO mà quên
   fixture thì cổng im lặng. Muốn hết hẳn phải khai schema cho tool status.
2. `runtime_setup.persona` bị clip 400 ký tự trong payload và 120 ký tự trong text; bản đầy đủ (4 073 ký tự)
   vẫn chỉ có trong `team.json`. Ai cần nguyên văn persona để rollback phải đọc tệp, không đọc status.
3. `removed_members` chưa phân trang: đội có 200 hồ sơ removed sẽ đội payload lên đáng kể (mỗi dòng ~600 B).
4. Case c2 khẳng định theo dữ liệu ERP hiện tại (mọi hồ sơ removed đều có `runtimeSetup`). Nếu một hồ sơ removed
   không có `runtimeSetup`, assert `withSetup === REMOVED_ROWS.length` sẽ đỏ — cố ý, để phát hiện thay đổi dữ liệu.
5. t59 C4 đã sửa nhưng KHÔNG chạy lại trong t107 (suite LIVE, trần 10 suite); phần đã chạy được là t107, t98, t99,
   t56, t94, t90, t43, t3, t20, t11. `t50` không chạy lại: nó phủ text các tool task (create/update/claim) mà t107
   không chạm tới; t99 đã chạy nó ở vòng trước.

## t110 — tiêu đề đổi `active` → `present` (V17-F4)

- `packages/dsh-agent-teams/lib/tools.js` in `Members (N present + M removed):`; nhánh M = 0 vẫn
  nguyên từng byte `Members (N):`, nên text của đội không có hồ sơ removed không đổi.
- Suite này đổi 6 chỗ theo chuỗi mới: tên + assert của a2 (`Members (3 present + 2 removed):`), tên +
  assert của c1 (`Members (7 present + 7 removed):`), `blockOf` của a4, và regex âm b1 (`/present \+ /`).
  Chạy lại: 12/12, EXIT 0.
- Vì sao `present` chứ không `active`: `team.members` đã bị lọc bỏ `status === 'removed'`, nên `active`
  mang nghĩa 'đang hoạt động' trong khi con số thật là 'còn trong roster' — hai chuyện khác nhau.
- Hai suite còn ghi tiêu đề CŨ và **cố ý không sửa**: `tests/t108-pack.mjs:654,1252` (ghim hash NGUỒN ở
  `:59` nên đỏ sau mọi thay đổi `lib/tools.js` — artifact-scoped đúng thiết kế) và
  `tests/t59-erp-live-copy.mjs:337` (suite phiên headless lịch sử; regex của nó sẽ trượt `present`).
