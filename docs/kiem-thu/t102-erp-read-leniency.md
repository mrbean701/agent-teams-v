# t102 — BUG-026: provenance lạ KHÔNG được làm chết cả đội (đọc LENIENT, ghi CHẶT)

Suite: `node tests/t102-erp-read-leniency.mjs` (chạy từ gốc repo).
Tệp sửa: `packages/dsh-agent-teams/lib/state.js`, `tests/t102-erp-read-leniency.mjs` (mới), `tests/t58-erp-migrate.mjs` (case f4), `tests/t3-route-smoke.mjs` (case 18, sub-case source), doc này, `docs/log/BUG.md`.

## 1. Triệu chứng và cách tái hiện

Trên BẢN COPY của `E:/Project/ERP/.agent-teams/erp-erp/team.json` (14 member / 107 task), chỉ cần một trường provenance của hệ ngoài:

```js
members[5].routeOverride = { provider: 'command-code-goat', model: 'deepseek/deepseek-v4-pro', source: 'erp', at: Date.now(), by: 'erp-tool' };
```

⇒ `readTeam` ném `invalid AgentTeams state in team "erp-erp": members[5] is not a valid member record` ⇒ MỌI tool của plugin chết, vì mọi đường đọc đều đi qua `readTeam`.

Đối chứng bất đối xứng (trước khi vá): trường LẠ nằm ngoài validator thì đọc bình thường — `members[2].erpStage`, `tasks[3].erpTicket`, `erpOrgUnit` top-level đều OK. Tức: thêm TRƯỜNG thì được, một GIÁ TRỊ enum do hệ khác ghi thì phá cả đội.

## 2. Nguyên nhân

`lib/state.js` — `isTeamMember` khai union ĐÓNG cho `routeOverride.source` (`=== 'captain' || === 'http' || === 'profile'`), nên mọi giá trị khác rơi vào nhánh "member record không hợp lệ" và cả tệp đội bị từ chối. Cùng lớp với V6-F1 (thiếu `source` cũng làm chết đội), khác chiều: thiếu thì chết, và một giá trị lạ cũng chết.

## 3. Cách sửa (packages/dsh-agent-teams/lib/state.js)

Thêm ngay trước validator member một khối có JSDoc nêu rõ hợp đồng "đọc LENIENT / ghi CHẶT":

```js
const PROVENANCE_SOURCE_PATTERN = /^[a-z][a-z0-9:_-]{0,63}$/u;
function isProvenanceSource(value) {
    return typeof value === 'string' && PROVENANCE_SOURCE_PATTERN.test(value);
}
```

Thay union đóng bằng `&& isProvenanceSource(value['routeOverride']['source'])`. Giá trị được giữ NGUYÊN VĂN: không chuẩn hoá, không ghi đè thay người dùng; `readTeam` và `readTeamSync` dùng chung validator nên cả hai đều lenient.

Ba thông điệp lỗi task nay nêu giá trị hợp lệ — nguồn là CHÍNH mảng validator `statuses` trong `describeTaskDefect` cộng `TERMINAL_TASK_STATUSES`, `TASK_KINDS`, `REVIEW_VERDICTS` từ `lib/types.js` (KHÔNG thêm export mới):

| Trường | Thông điệp sau khi vá |
| --- | --- |
| status | `status "blocked_by_erp" is invalid; valid statuses: pending, claimed, in_progress, completed, failed, cancelled (terminal: completed, failed, cancelled)` |
| kind | `kind "erp_task" is invalid; valid kinds: requirements, implementation, verification, review, repair, integration, work` |
| verdict | `verdict "erp_ok" is invalid; valid verdicts: pass, needs_revision, reject` |

Validator task KHÔNG bị nới: trạng thái lạ vẫn làm `readTeam` ném (không thể lập lịch), chỉ khác là người vận hành biết phải sửa thành gì.

## 4. Ranh giới ĐỌC / GHI

| Đường | Luật |
| --- | --- |
| ĐỌC (`isTeamMember`) | chuỗi khớp `/^[a-z][a-z0-9:_-]{0,63}$/u` ⇒ chấp nhận, giữ nguyên văn (`erp`, `migration`, `script`, `profile:v2`, tối đa 64 ký tự) |
| ĐỌC (từ chối) | rỗng, không phải chuỗi, quá 64 ký tự, chữ HOA, có dấu cách |
| GHI qua tool (`agent_teams_set_member_route`) | `lib/tools.js` hard-code `source: 'captain'` (dòng 1327, 1435, 1513); schema tool KHÔNG có tham số `source` |
| GHI qua công cụ di trú | `tools/erp-route-migrate.mjs:58` `const ROUTE_SOURCE = 'profile';` |

## 5. Chín nhóm case và số đo thật

`node tests/t102-erp-read-leniency.mjs` ⇒ **EXIT 0**, `# 17/17 passed, 0 failed`.

| Nhóm (contract) | Case | Chứng minh |
| --- | --- | --- |
| (a) source lạ hợp lệ đọc được, `routeOf` vẫn dùng override | a1 `erp` · a2 `migration` · a3 `profile:v2` · a4 biên 64 ký tự | bản copy ERP 14 member / 107 task; `member.routeOverride` deep-equal với bản ghi trên đĩa, `source` nguyên văn, `routeOf(member).origin === 'override'`, route = `p2/m2` |
| (b) hình dạng source không hợp lệ vẫn bị TỪ CHỐI | b1 `''` · b2 `123` · b3 65 ký tự · b4 `Erp` · b5 `erp tool` | ném `members[i] is not a valid member record` |
| (c) round-trip nguyên văn | c1 | `readTeam → writeTeam → readTeam` giữ `profile:v2`; member/task không mất |
| (d) trường lạ ngoài validator | d1 | `members[2].erpStage`, `tasks[3].erpTicket`, `erpOrgUnit` vẫn đọc được và còn nguyên |
| (e) thông điệp hành động được | e1 status · e2 kind · e3 verdict | message khớp danh sách lấy từ `lib/state.js` + `lib/types.js` |
| (f) ĐỐI CHỨNG ÂM thật | f1 | copy `lib/` sang `tests/tmp`, khôi phục union đóng trong bộ nhớ ⇒ trên ĐÚNG byte mà bản vá đọc được, bản cũ ném `members[0] is not a valid member record`; in `applies=1 old_bytes=57484 new_bytes=57609 delta_bytes=125` |
| (g) đường GHI công khai vẫn chặn | g1 | chạy tool THẬT qua harness với `source:'erp'` ⇒ bản ghi bền `{"provider":"p2","model":"m2","source":"captain","at":…,"by":"sess-captain"}`; neo văn bản `lib/tools.js` 1327/1435/1513 và `erp-route-migrate.mjs` `ROUTE_SOURCE = 'profile'` |
| (h) tệp ERP gốc chỉ đọc | h1 | `sha256=9f7420b6…15f2d1e` / 1 533 117 B / 14 member / 107 task |
| (i) hồi quy | 7 suite ngoài | xem §7 |

## 6. Vì sao t58-f4 và t3-"unknown source" phải viết lại (ĐỔI CHỖ, KHÔNG NỚI)

Cả hai chỗ đều khẳng định đúng cái union vừa được gỡ:

- `tests/t58-erp-migrate.mjs` **f4** cũ: `routeOverride.source = 'script'` ⇒ `assert.rejects(readTeam, /is not a valid member record/)`.
- `tests/t3-route-smoke.mjs` **case 18** sub-case cũ: `'unknown source': { provider:'p3', model:'m3', source:'bogus', at:5 }` ⇒ kỳ vọng cả `readTeam` và `readTeamSync` ném.

`script` và `bogus` đều KHỚP `/^[a-z][a-z0-9:_-]{0,63}$/u`, nên dưới luật mới chúng phải đọc được. Đây là **đổi chỗ đặt phép kiểm, không phải nới**: f4 nay khẳng định điều ngược lại (đọc được + round-trip nguyên văn), sub-case của t3 chuyển sang nhóm HÌNH DẠNG (`''`, `123`, 65 ký tự, `Erp`) và GIỮ NGUYÊN 4 sub-case kia cùng cả vế `readTeamSync`; năng lực bắt lỗi chuyển sang t102 (b1–b5 + đối chứng âm f1). Số case không đổi: t58 **23/23**, t3 **18/18**.

## 7. Bảng lệnh · EXIT · số case thật (chạy từ `E:/Project/Agent-Team`)

| Lệnh | EXIT | Số case thật |
| --- | --- | --- |
| `node tests/t102-erp-read-leniency.mjs` | 0 | `# 17/17 passed, 0 failed` |
| `node tests/t58-erp-migrate.mjs` | 0 | `# 23/23 passed, 0 failed` |
| `node tests/t3-route-smoke.mjs` | 0 | `# 18/18 passed, 0 failed` |
| `node tests/t38-member-fallback.mjs` | 0 | `# 17/17 passed, 0 failed` |
| `node tests/t37-route-clear.mjs` | 0 | `# 14/14 passed, 0 failed` |
| `node tests/t43-member-profile.mjs` | 0 | `# 19/19 passed, 0 failed` |
| `node tests/t20-erp-compat.mjs` | 0 | `# 15/15 passed, 0 failed` (nguồn ERP `sha256=9f7420b6…15f2d1e`) |
| `node tests/t4-control-plane-smoke.mjs` | 0 | `22/22 cases passed` |
| `node --check packages/dsh-agent-teams/lib/state.js` | 0 | — |

`t59`/`t82` KHÔNG chạy lại: hai suite đó cần boot session thật (`subagents.startActivation` + lượt model), tốn thời gian và không chạm validator đọc `state.js`; nhánh chúng phủ (`routeOf`/override sống) đã có t37 14/14 và t38 17/17.

## 8. Giới hạn còn lại (nói thẳng)

1. **Nửa GHI chưa đóng** — `lib/members.js` `setMemberRoute` lấy `request.source ?? 'captain'` mà KHÔNG kiểm giá trị (và `setMemberProfile` tương tự). Tool và công cụ di trú đều hard-code giá trị hợp lệ nên đường công khai đã chặn (chứng minh ở g1), nhưng ai gọi thẳng API đó vẫn ghi được `source` lạ. Việc này đã tách sang **t103** (`lib/members.js` bị cấm trong lượt t102).
2. **`source` là TOKEN, không phải enum**: đọc chỉ kiểm hình dạng. Một hệ ngoài ghi `source:'totally-made-up'` vẫn đọc được — đó là chủ ý (provenance của hệ khác không được giết đội), nhưng nghĩa là `source` KHÔNG dùng được làm khoá tin cậy khi quyết định gì.
3. **Chữ HOA không được chấp nhận**: `'ERP'` bị từ chối (pattern bắt đầu bằng `[a-z]`), cũng như `'erp tool'` (dấu cách). Hệ ngoài phải ghi theo dạng khớp pattern — cần biết trước khi viết migration.
4. **`severity` vẫn chưa nêu danh sách hợp lệ** (`severity "x" is invalid`), khác với status/kind/verdict. Chưa sửa để giữ phạm vi; ghi nhận là khoảng trống nhất quán.

## 9. Mốc tệp

| Tệp | sha256 / byte |
| --- | --- |
| `packages/dsh-agent-teams/lib/state.js` (sau vá) | `56664c59ff40031989afe32d5d733e3e84d02904f21149314d98d0f49c443485` / 57 508 B |
| `packages/dsh-agent-teams/lib/state.js` (trước vá, baseline audit) | `7b49f5ab1d467b812813eb72bc87d90d54c97d0397ef2531f7baaacf6c9069fd` / 56 282 B |
| `tests/t102-erp-read-leniency.mjs` | `afb600c7a04af8734f93648193657035d9f99dca2180d552e294593ea9cd2b2a` / 19 299 B |
| `tests/t58-erp-migrate.mjs` (sau khi sửa f4) | `80b9209f1465edda80942e5cb576581fe38a7372900cee00f55c0d87deb0a3e8` / 22 913 B |
| `tests/t3-route-smoke.mjs` (sau khi sửa case 18) | `e50f0ea44e4101bee5cf05e1da86eef4adfc828d40d901bbe7b2d7c80f31c624` / 13 858 B |
| `E:/Project/ERP/.agent-teams/erp-erp/team.json` | `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e` / 1 533 117 B (KHÔNG đổi) |
