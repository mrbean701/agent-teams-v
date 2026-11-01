# t129 — pin bundle (t10) + bảng FROZEN (t59) sau khi đổi thứ tự panel

Task `t129` (kind=implementation, attempt `bccc6cff-1c9d-4ed9-b698-2366b013a43d`, deps `t128`).
Card này KHÔNG đổi `lib/**` — nó chỉ sửa hai bảng ghim cho khớp byte mà `t128` đã tạo ra, rồi
thêm một phép kiểm để lần sau việc đó không phải làm bằng tay.

## 1. Vì sao có task này

`t128` dời `DependencyMap` + `AddMemberControl` lên TRÊN danh sách member. Phép dời giữ nguyên
SỐ BYTE của cả ba tệp (`lib/client/ActivityPanel.js`, `lib/client.js`, `lib/client.js.map`) nhưng
đổi NỘI DUNG — nên hai con số ghim theo byte trở thành sai trong khi nhìn bằng `wc -c` thì
không thấy gì lạ:

| nơi ghim | ghim cái gì | vì sao sai sau t128 |
|---|---|---|
| `tests/t10-ui-bundle-smoke.mjs` | `EXPECTED_BUNDLE_SHA256` + `EXPECTED_BUNDLE_BYTES` của `lib/client.js` | sha đổi, bytes không đổi ⇒ nếu chỉ so byte thì phép kiểm này sẽ XANH GIẢ |
| `tests/t59-erp-live-copy.mjs` | bảng `FROZEN` 13 dòng (12 tệp `lib/**` + `package.json`) | 2 dòng (`lib/client.js`, `lib/client.js.map`) lệch với đĩa ⇒ `t114-source-freeze` đỏ vì lý do không liên quan lần chạy |

Hai bảng nằm ở hai suite khác nhau, do hai đường khác nhau đọc (`t10` tự so, `t114` đọc bảng của
`t59`). Sửa một bảng mà quên bảng kia là trạng thái xấu nhất: một suite xanh, một suite đỏ, và
người đọc không biết cái nào đúng. Vì vậy task này làm cả hai, rồi thêm `tests/t129-pins.mjs`
để câu hỏi "hai bảng có khớp nhau và có khớp đĩa không" trả lời được bằng máy, không cần boot.

## 2. Số đo (node:crypto + `fs.statSync`; máy này không có `sha256sum`)

| tệp | TRƯỚC | SAU |
|---|---|---|
| `packages/dsh-agent-teams/lib/client.js` | `9da18d9971a284e936d709db592da6cedcdf1afa960fff282d7a1c802fec7007` / 258 432 B | `377bcea2394cc0ac3dd69b7c1dba05b56e90b0d5db9a1b565840e057bc0cb47d` / 258 432 B |
| `packages/dsh-agent-teams/lib/client.js.map` | `bbf88608f54e966fdb42cf0c8297b81e46d198870ce87b002c6a54f8cf6e5dae` / 404 958 B | `1f1d15524bcd3caa4ae3f39247558550736f32ac151f9908cbb15c88a260dd81` / 404 958 B |
| `packages/dsh-agent-teams/lib/client/ActivityPanel.js` (nguồn, KHÔNG nằm trong FROZEN) | — | `9596333059c68b80a2f627b53a8d5a4d6d99e99d84c2ba39c94f70720ff57f54` / 64 004 B |

Bytes giống nhau ở cả hai tệp bundle — đó chính là lý do phải ghim sha chứ không chỉ ghim byte.

## 3. `tests/t10-ui-bundle-smoke.mjs` — pin mới + phép kiểm THỨ TỰ

Pin được thay bằng số đo mới (bytes giữ `258432`), giữ nguyên `REBUILD_HINT` sẵn có. Thêm khối
`check 2b` với ba anchor và một đối chứng âm:

```
PANEL_ORDER = [
  'DependencyMap, { tasks'                                   -> bundle @175 647
  'AddMemberControl, { team'                                 -> bundle @175 796
  'orderDelegationMembers(team.members, team.tasks)'          -> bundle @175 899   (call site)
]
```

- Anchor thứ ba là LỜI GỌI, không phải khai báo hàm: `orderDelegationMembers` xuất hiện hai lần
  trong bundle (`@6282` là `function orderDelegationMembers(members, tasks)`, `@175899` là lời
  gọi). Chọn nhầm lần đầu sẽ làm phép so thứ tự vô nghĩa — nên marker ở đây chứa cả tham số,
  và `panelOrderProblems()` đòi mỗi marker xuất hiện ĐÚNG MỘT lần, sai số lượng ⇒ đỏ.
- Phép kiểm đòi `indexOf(marker[i-1]) < indexOf(marker[i])` cho cả hai cặp, và in offset thật
  khi xanh: `DependencyMap, { tasks@175647 < AddMemberControl, { team@175796 < orderDelegationMembers(team.members, team.tasks)@175899`.
- Đối chứng âm TRONG BỘ NHỚ, không sinh tệp: dựng `oldOrderSource` bằng ba marker theo thứ tự
  CŨ (`AddMemberControl` → `orderDelegationMembers` → `DependencyMap`) rồi chạy ĐÚNG hàm đó,
  đòi ít nhất một problem và mọi problem phải là loại `must precede` (tức đỏ vì THỨ TỰ, không
  phải vì đếm marker) ⇒ `applies: 1 problem(s): DependencyMap above the member list @74 must
  precede AddMemberControl above the member list @0`.

Vì sao vẫn cần phép kiểm này khi đã ghim sha: sha trả lời "bundle có phải artifact tôi đo
không"; nó KHÔNG trả lời "artifact đó có xếp panel đúng thứ tự không". Một bản `t128` làm sai
thứ tự nhưng được đo lại rồi ghim sẽ có pin hoàn toàn hợp lệ và vẫn sai về hành vi.

## 4. `tests/t59-erp-live-copy.mjs` — đúng 2 dòng FROZEN

| dòng | TRƯỚC | SAU |
|---|---|---|
| `lib/client.js` | `9da18d9971a284e9…` / 258 432 | `377bcea2394cc0ac…` / 258 432 |
| `lib/client.js.map` | `bbf88608f54e966f…` / 404 958 | `1f1d15524bcd3caa…` / 404 958 |

11 dòng còn lại KHÔNG đổi một byte (đo lại ngay trước khi nộp, xem mục 6): `lib/tools.js`
`e51734ba…`/213 715 · `lib/members.js` `50f558f8…`/102 260 · `lib/state.js` `56664c59…`/57 508 ·
`lib/snapshot.js` `a2a87e1b…`/13 986 · `lib/index.js` `2d28e617…`/45 315 · `lib/tool-names.js`
`e3def5db…`/808 · `lib/types/members.d.ts` `c53250ab…`/31 769 · `lib/types/snapshot.d.ts`
`962f99a7…`/7 627 · `lib/types/tools.d.ts` `41cfc565…`/7 546 · `lib/client/ActivityPanel.module.css`
`53ea47c6…`/51 837 · `package.json` `92a64040…`/10 498. Thêm một khối comment ngay trên bảng ghi
lại việc đo lại (theo đúng quy ước `t117 rev 2` mà chính bảng này đã đặt ra).

## 5. `tests/t129-pins.mjs` — 13 ca, EXIT 0

Suite KHÔNG import hai suite kia (cả hai đều có tác dụng phụ: `t10` boot bundle qua `vm` +
`esbuild`, `t59` spawn một phiên sống). Nó ĐỌC các hằng ghim ra khỏi source text rồi tự đo tệp
bằng `node:crypto`: nhờ vậy một con số gõ sai bị bắt bằng so-sánh-với-đĩa, không bằng cách chạy
lại suite khác.

| case | khẳng định | số đo |
|---|---|---|
| 1, 2 | `t10` khai `EXPECTED_BUNDLE_SHA256` / `EXPECTED_BUNDLE_BYTES` đúng MỘT lần (nếu hai literal thì parser sẽ lặng lẽ lấy cái đầu) | `count=1 / count=1` |
| 3 | pin `t10` khớp `lib/client.js` trên đĩa | `377bcea2…` / 258 432 B |
| 4 | pin CŨ (`9da18d99…`) bị CÙNG phép so từ chối | `applies: 1 problem(s): … sha256 377bcea2… != pinned 9da18d99…` |
| 5 | sai BYTE (258 433) vẫn bị bắt dù sha đúng | `applies: 1 problem(s): … bytes 258432 != pinned 258433` |
| 6 | bảng FROZEN có ĐÚNG 13 dòng | `rows=13` |
| 7 | bảng FROZEN nêu ĐÚNG 13 đường dẫn, đúng thứ tự (danh sách kỳ vọng hard-code, không suy từ bảng) | `13 paths` |
| 8 | mọi dòng FROZEN khớp tệp trên đĩa | `13 rows verified` |
| 9 | bảng bị RÚT còn 12 dòng bị từ chối (chống xanh giả: vòng lặp đo chỉ đo dòng còn tồn tại) | `applies: 1 problem(s): table has 12 rows, expected 13` |
| 10 | dòng `lib/client.js` mang sha CŨ bị CÙNG phép so bảng từ chối | `applies: 1 problem(s): lib/client.js: … != pinned 9da18d99…` |
| 11 | pin `t10` và dòng FROZEN `lib/client.js` mang CÙNG sha + bytes (sửa một quên một ⇒ đỏ) | `377bcea2…/258432 vs t10 377bcea2…/258432` |
| 12 | thứ tự panel trong bundle đúng | `DependencyMap, { tasks@175647 < AddMemberControl, { team@175796 < orderDelegationMembers(team.members, team.tasks)@175899` |
| 13 | thứ tự CŨ đỏ trên cùng phép kiểm | `applies: 1 problem(s): DependencyMap above the member list @74 must precede AddMemberControl above the member list @0` |

Ca 9 và ca 13 là hai chỗ dễ xanh giả nhất, nên cả hai đều dựng đầu vào SAI ngay trong bộ nhớ và
đòi chính hàm đang dùng phải báo lỗi — không có nhánh `if` riêng cho đối chứng.

## 6. Hồi quy (0 boot — không chạy suite sống nào)

| lệnh | exit | số đo |
|---|---|---|
| `node tests/t10-ui-bundle-smoke.mjs` | 0 | `TOTAL 50 checks, 50 passed, 0 failed` (48 ca cũ + 2 ca thứ tự) |
| `node tests/t129-pins.mjs` | 0 | `# 13/13 passed, 0 failed` |
| `node tests/t114-source-freeze.mjs` | 0 | `# 16/16 passed, 0 failed`, `# frozen=13 files · helperRecords=13 · problemsOnDrift=2 · problemsOnBadPin=2` |
| `node tests/t113-roster-assertion.mjs` | 0 | `# 38/38 passed, 0 failed` |
| `node tests/t115-check-contract.mjs` | 0 | `# 43/43 passed, 0 failed` (brief ghi 33 — bản thật đã 43 từ `t123`) |
| `node tests/t107-removed-members-visible.mjs` | 0 | `# 13/13 passed, 0 failed` (brief ghi 12 — bản thật đã 13) |
| `node tests/t99-render-parity.mjs` | 0 | `# 11/11 passed, 0 failed` |
| `node tests/t98-render-coverage.mjs --strict` | 0 | `verdict GREEN`, `uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 payload_contract_failures=0 allow_listed=7`, `roster_invariant_problems=0 roster_control_applies=true roster_mutant_exit=1` |

Tệp đã ghi (4): `tests/t10-ui-bundle-smoke.mjs`, `tests/t59-erp-live-copy.mjs`,
`tests/t129-pins.mjs`, `docs/kiem-thu/t129-pins.md`. Log nằm trong `tests/tmp/t129/**`.

## 7. Giới hạn (nói thẳng)

1. **Pin là ảnh chụp, không phải chứng minh.** `t10` + `t129` chỉ nói "byte trên đĩa đúng bằng
   byte đã đo". Chúng không nói bundle đó CHẠY đúng — phần đó là `TOTAL 50 checks` của `t10`
   (render thật qua `react-dom/server`), và `t129` không thay thế được nó.
2. **Phép kiểm thứ tự đọc TEXT của bundle, không đọc JSX.** Nó bắt được thứ tự ở mức call site;
   nó không bắt được việc hai component bị đặt trong hai nhánh `if` khác nhau mà text vẫn theo
   thứ tự. Muốn chắc phải render (đúng những gì `t10` làm).
3. **`t129` chỉ canh HAI bảng này.** `tests/t108-pack.mjs` giữ bảng riêng đã cũ (`lib/tools.js`
   `d402c6586df1e140`) — nếu nó đỏ thì đó là chuyện của nó, không phải lỗi của task này, và
   sửa nó nằm ngoài inScope.
4. **Số ca trong brief có thể lệch số thật** (`t115` 33→43, `t107` 12→13) vì các task khác đã
   thêm ca sau khi brief viết. Ghi lại đúng số đo được, không sửa suite cho khớp brief.
