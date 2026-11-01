# t86 — Member chưa từng spawn bỏ qua routeOverride

## 1. Lỗi (tái hiện thật, không phải suy đoán)

Trên đội ERP sau di trú route, một member CHƯA từng spawn (`member.id === ''`) được captain giao việc
qua AGENT TEAMS scheduler thì phiên con chạy bằng route KHAI BÁO, không phải route đã override:

- member `be-api-2` có `routeOverride = command-code-goat/deepseek/deepseek-v4-pro (high)`
- child `84d85f22-f8ca-4b1b-9e59-cad16095073b` gửi `request/header` = `command-code-goat/deepseek/deepseek-v4.1-flash`

Hệ quả nặng hơn: ngay sau spawn, escalation ghi route vừa chạy vào `provider/model` rồi
`delete member.routeOverride` ⇒ route đã di trú BIẾN MẤT ở lần chạy đầu tiên, không còn dấu vết để lần sau dùng lại.

## 2. Nguyên nhân

lib/tools.js nhánh `member.id === ''` của `dispatchMember` tự dựng request chọn model
bằng cách đọc thẳng dòng bền:

```
{ provider: member.provider, model: member.model, reasoningEffort: member.reasoningEffort, fallback: member.fallback }
```

Trong khi hai đường spawn còn lại (thêm member thủ công, cold resume) đều đi qua
`selectionFromMember()` → `routeOf()`, nơi precedence `fallback > override > active > declared`
nằm MỘT CHỖ. Scheduler là đường duy nhất không đi qua đó ⇒ override bị bỏ qua.

## 3. Cách sửa

1. lib/members.js: `selectionFromMember` từ hàm nội bộ thành `export function` (kèm JSDoc nêu rõ
   mọi đường spawn phải đi qua đây, precedence chỉ nằm ở `routeOf`).
2. lib/tools.js: nhánh chưa có id dựng `declaredRoute = membersApi.selectionFromMember(member) ?? { provider, model, ...effort }`
   rồi gọi `resolveMemberLlmSelection` với đúng bộ tham số như `activateMemberNow`
   (`defaultModel: config.memberModel`, `defaultProvider: config.memberLlmProvider`,
   `fallback: declaredRoute.fallback ?? member.fallback ?? config.fallback`).
3. lib/types/members.d.ts: khai báo `selectionFromMember` (nếu thiếu, cổng biên dịch t56 đỏ).
4. KHÔNG chạm escalation: nó vẫn ghi `provider/model` = route con đang chạy và xoá `routeOverride`
   để descriptor guard ở cold resume (lib/members.js:757-759) còn so khớp.

## 4. Diff tóm tắt

| Tệp | Thay đổi |
| --- | --- |
| packages/dsh-agent-teams/lib/members.js | `function selectionFromMember` → `export function` + JSDoc (+16 dòng ⇒ `MEMBER_ROLE_MAX` sang dòng 1219, `MEMBER_EXECUTION_PROMPT_MAX` dòng 1221) |
| packages/dsh-agent-teams/lib/tools.js | `dispatchMember` nhánh `member.id === ''`: one-liner đọc spine → khối `declaredRoute` + resolve 6 tham số |
| packages/dsh-agent-teams/lib/types/members.d.ts | khai báo `selectionFromMember`; cập nhật số dòng trong comment 2 hằng số (1219/1221) |
| tests/t86-override-before-spawn.mjs | MỚI, 8 case |
| docs/kiem-thu/t86-override-before-spawn.md | tệp này |

## 5. Bằng chứng

- `node tests/t86-override-before-spawn.mjs` ⇒ `# 8/8 passed, 0 failed` EXIT=0
  (a1 spawn route = override; a2 escalation ghi override vào provider/model và gỡ routeOverride;
   d1/d2 member không override vẫn declared; d3 d.ts khai báo + arity; c1/c2/c3 đối chứng âm)
- ĐỐI CHỨNG ÂM (tái hiện mã cũ): đưa request CŨ vào `resolveMemberLlmSelection` thật rồi cho
  `spawnMember` thật chạy ⇒ con khởi động `p1/m1` và override bị xoá (c1 PASS).
  Đo byte: `applies=1 old_bytes=197 new_bytes=832 delta_bytes=635`.
- MUTATION (sửa lib/tools.js về đúng one-liner cũ, chạy lại rồi khôi phục): `# 4/8 passed, 4 failed` EXIT=1
  — a1 `'p1' !== 'p2'`, a2 `'p1' !== 'p2'`, c2 `2 !== 1`, c3 mất `selectionFromMember`.
  Khôi phục xong: sha256 75800e15fce2abf68ad410116f4ae076e281bdbb343f7104afd9dd83d143244d / 196084 B, identical=true.
- Sửa t56 đi kèm: vì members.js dài thêm 16 dòng, comment 2 hằng số trong members.d.ts phải nêu 1219/1221 —
  chính case d13/d14 của t56 canh số dòng thật nên lần chạy đầu đỏ (`the comment does not name lib/members.js:1219`), sửa xong xanh.
- Hồi quy EXIT=0: t56 `# 20/20` (`tsc=5.9.3`, `files=21`), t43 `# 19/19`,
  t20 ERP sha256 không đổi (9f7420b6…), t38 `# 17/17`, t3-route-smoke `# 18/18`.

## 6. Rà 4 call site đọc spine còn lại

| Vị trí | Kết luận | Lý do |
| --- | --- | --- |
| lib/tools.js:594 `updatePlanBatch` nhánh `update_member` | ĐÚNG, không sửa | đọc `mutation.*` do owner gõ trong plan editor, không phải dòng bền |
| lib/tools.js:707 `approveStagedTeam` | KHÔNG đúng nguyên tắc nhưng KHÔNG phải đường spawn | chỉ validate + ghi lại trước khi chuyển running; spawn xảy ra sau ở `dispatchMember`; không xoá `routeOverride` nên không mất route |
| lib/tools.js:2657 dựng đội từ profile | ĐÚNG | đọc `template.*` từ profile/config, dòng bền chưa tồn tại |
| lib/tools.js:2949 `addMemberNow` | ĐÚNG | đọc `request.*` của lệnh thêm member; dòng bền sinh ra từ chính selection đó |

## 7. Giới hạn còn lại (nói thẳng)

- `approveStagedTeam` vẫn chỉ thấy route spine: nếu một member staged có `routeOverride`, bản xem
  trước plan hiển thị route khai báo còn con sẽ chạy route override (sau fix này override thắng ở spawn).
  Không sửa trong t86 (ngoài phạm vi đường spawn chưa-có-id) — cần task riêng nếu muốn plan editor phản ánh override.
- `setLiveRoute` KHÔNG re-seed route của một phiên con ĐANG chạy: override đặt sau khi spawn chỉ có
  hiệu lực từ lần kích hoạt sau (hành vi sẵn có, không thuộc t86).
- Suite chạy bằng harness in-process (không boot host thật); bằng chứng host thật là e2e của kiem-thu-goat
  (child 84d85f22…) đo TRƯỚC khi sửa.
