# t87 - approve plan resolve route từ dòng bền, không đọc spine

Phạm vi: `packages/dsh-agent-teams/lib/tools.js` (`approveStagedTeam`),
`tests/t87-approve-override.mjs` (mới), `tests/t86-override-before-spawn.mjs` (siết case c2),
tài liệu này. Không sửa `lib/members.js`, `lib/state.js`, `lib/client/**`, `tools/**`.

## 1. Lỗi

`agent_teams_set_member_route` không có guard theo phase, nên member **staged**
(`member.id === ''`) vẫn nhận được `routeOverride`. Nhưng `approveStagedTeam` lại
resolve route từ **spine** (`member.provider` / `member.model` /
`member.reasoningEffort`) rồi ghi kết quả đó trở lại spine.

Hệ quả khi người vận hành đặt route hợp lệ cho kế hoạch:

- `validateMemberLlmSelections` validate route **khai báo** thay vì route override
  ⇒ 4xx oan (`unknown member model "..." for provider "..."`) dù override có trong
  catalog;
- spine bị ghi đè bằng route khai báo, lệch với route member thực sự chạy sau khi
  spawn escalation chạy.

## 2. Cách sửa

Diff trong `approveStagedTeam` (thay vòng lặp đọc spine):

```js
const declaredRoute = membersApi.selectionFromMember(member) ?? {
    provider: member.provider,
    model: member.model,
    ...member.reasoningEffort === undefined || member.reasoningEffort === ''
        ? {}
        : { reasoningEffort: member.reasoningEffort },
};
const selection = await resolveMemberLlmSelection(ctx, captain, {
    provider: declaredRoute.provider,
    model: declaredRoute.model,
    reasoningEffort: declaredRoute.reasoningEffort,
    fallback: declaredRoute.fallback ?? member.fallback ?? config.fallback,
}, runSignal);
```

Ba điểm cố ý:

1. Ưu tiên route nằm **một chỗ**: `selectionFromMember()` (fallback > routeOverride >
   active > declared). Cùng nguồn với `dispatchMember` (t86) và `activateMemberNow`.
2. **Giữ** escalation spine (`member.provider/model/reasoningEffort = selection`) —
   dòng bền ghi route mà child sẽ khởi động.
3. **KHÔNG** xoá `routeOverride` ở approve: spawn escalation xoá sau khi child chạy
   thật, để lần kích hoạt đầu thất bại không làm mất route người vận hành đặt.

Không thêm `defaultModel` / `defaultProvider` vào lời gọi: giữ nguyên hành vi cũ cho
member không có route khai báo.

## 3. Vì sao sửa test của t86

Case c2 của `tests/t86-override-before-spawn.mjs` ghim call-site approve — chính là lỗi
t87 phải xoá. Nguyên văn assert cũ:

```js
assert.equal(occurrences, 1, 'the spine read must survive only in approveStagedTeam, not on the dispatch path');
assert.ok(dispatchAt < spineAt, 'the selector call precedes the remaining spine read (approveStagedTeam)');
```

Nó đòi chuỗi spine cũ tồn tại **đúng một lần** và lần đó nằm sau dispatch selector —
tức nó khẳng định `approveStagedTeam` vẫn đọc spine. Sau bản vá chuỗi đó còn 0 lần nên
case đỏ (`0 !== 1`). Thay vì bỏ trống, assert mới **mạnh hơn**:

- (a) chuỗi spine cũ xuất hiện **0 lần** trong `lib/tools.js` (không đường nào đọc spine);
- (b) đếm `membersApi.selectionFromMember(` **≥ 2** call-site và in số dòng từng cái
  (`line 553, line 732`);
- (c) mỗi call-site nằm trong cửa sổ hàm của nó và đứng trước lời gọi tiêu thụ selection
  (`spawnMember(` cho dispatch, `validateMemberLlmSelections(` + escalation spine cho
  approve). Ghi chú: `deliverToMember()` là early-return ở đầu `dispatchMember` giữ
  member **đã spawn** trên route sống, về thiết kế nó đứng trước mọi resolve route,
  nên assert thứ tự neo vào `spawnMember(` chứ không phải `deliverToMember()`.

| Tệp | sha256 / byte trước | sha256 / byte sau |
| --- | --- | --- |
| `tests/t86-override-before-spawn.mjs` | `a0161771…` (bản ghi t86) / 17 073 B | `150d91ab902317619392f71b04f3bffa07a49331456c58fc7eda287a053107a9` / 19 891 B |
| `tests/t87-approve-override.mjs` | (tệp mới, chưa có) | `181e742c047c964a6384a20342ac5bf81f06fa7e60cb882134191059ac168f48` / 15 175 B |

Kích thước trước của t86 được đối chiếu ngược: 19 891 B trừ chênh lệch ba lần sửa
(net của khối mới so với khối cũ) ra đúng 17 073 B, khớp bản ghi t86.

## 4. Bằng chứng

| Lệnh | Kết quả |
| --- | --- |
| `node tests/t87-approve-override.mjs` | EXIT 0 — `# 8/8 passed, 0 failed`, `verdict PASS` |
| `node tests/t86-override-before-spawn.mjs` | EXIT 0 — `# 8/8 passed, 0 failed` (in `selectionFromMember call sites: line 553, line 732`) |
| `node tests/t3-route-smoke.mjs` | EXIT 0 — 18/18 |
| `node tests/t4-control-plane-smoke.mjs` | EXIT 0 — 22/22 |
| `node tests/t20-erp-compat.mjs` | EXIT 0 — 15/15, sha256 nguồn ERP không đổi |
| `node tests/t43-member-profile.mjs` | EXIT 0 — 19/19 |
| `node tests/t56-types-fallback.mjs` | EXIT 0 — 20/20 |
| `node --check packages/dsh-agent-teams/lib/tools.js` | EXIT 0 |

Đội ERP hiện có (`.agent-teams/erp-erp/team.json` trong workspace ERP) =
`9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e` / 1 533 117 B,
không đổi.

### Mutation (mỗi lần đều khôi phục byte-identical)

| Đột biến trong `lib/tools.js` | Suite | Kết quả |
| --- | --- | --- |
| `approveStagedTeam`: `selectionFromMember(member)` → `undefined` (rơi về spine) | t87 | EXIT 1 — `# 3/8 passed, 5 failed`; a1/a2/a3/e1 đỏ với `unknown member model "m9" for provider "p1" (available: m1, m3)`, c2 đỏ với `the approve window must resolve from the durable row` |
| `dispatchMember`: `selectionFromMember(member)` → `undefined` | t86 | EXIT 1 — `# 4/8 passed, 4 failed`; c2 đỏ `dispatch and approve must both resolve through membersApi.selectionFromMember (found 1)`, c3 đỏ `dispatchMember must use the shared selector` |

Sau khi khôi phục: `sha256(lib/tools.js)` =
`9be217b1669a22415157950b6f8357d896c22e45b1612f8d5f55c1d10acaf6e0` / 197 372 B
(identical=true).

Đối chứng âm thứ ba nằm ngay trong suite t87 (case c1): dựng request kiểu cũ (spine) và
đưa qua `validateMemberLlmSelections` ⇒ ném `unknown member model "m9"`; request kiểu
mới (override p2/m2) ⇒ pass. Đây đúng là 4xx mà bản vá loại bỏ.

## 5. Giới hạn còn lại (nói thẳng)

- Approve chỉ resolve route; nó **không** spawn. Member staged chỉ chạy route override
  khi spawn thật, và chỉ lúc đó `routeOverride` mới bị xoá.
- Test chạy trên harness giả (`ctx.llm` catalog tĩnh: p1 = m1,m3 · p2 = m2), không boot
  Harness thật; `requestHeader()` của captain được stub là `p1/m1`.
- t86 và t87 đều đọc văn bản `lib/tools.js`; một refactor đổi tên
  `selectionFromMember`/`spawnMember` trong `tools.js` sẽ làm đỏ cả hai suite (cố ý —
  đó là cổng chống quay lại đọc spine), nhưng phải sửa test cùng lúc với refactor.
