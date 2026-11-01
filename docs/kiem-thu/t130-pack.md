# t130 — pack vòng 20 (bundle UI mới: thứ tự panel đã đổi)

Card: t130 · kind implementation · assignee dev-build-flash · attempt 2c496303-f7f2-43a2-9062-f7ece547830e
Suite: `packages/dsh-agent-teams/tests/t130-pack.mjs` (67 151 B, sha256 `c7126deb67235d2a55c1add6949df7cba510edd29212aab01be2d3287fde3a0d`, 1 045 dòng, `node --check` EXIT 0).
Chep khuon tu `tests/t121-pack.mjs` (KHONG sua t121) roi patch 3 che do: `--fresh` (mac dinh) · `--negative` · `--analyze <run dir> [tgzOverride]`.

## 1. Artefact phát hành (vòng 20)

| trường | giá trị |
| --- | --- |
| tarball | `packages/dsh-agent-teams/tests/tmp/t130/run-2026-11-01T03-59-18Z/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz` |
| sha256 | `d34be2af347ea625a5d108f88ca4207dafb53beb59984c775269b1344b63cc39` |
| bytes | 2 248 088 |
| entry | 133 (0 entry thư mục) |
| 2 lần pack | `pack-a` + `pack-b` trong CÙNG tiến trình: SAME sha256/bytes/entry; lần `--fresh` thứ hai (tiến trình khác, `run-2026-11-01T03-58-03Z`) cũng ra đúng sha này ⇒ tất định |

Vòng 19 (`tests/tmp/t121` sha `2770fbfc…` / 2 248 092 B) ĐÃ HẾT HIỆU LỰC.

## 2. Bảng FROZEN 13 dòng (đo mới trong t130, KHÔNG copy t121)

`FROZEN_MEASURED_AT = 2026-11-01T03:05:41.902Z` — A2 đo lại lúc chạy: **13/13 rows match**.

| tệp | sha256 (16 hex đầu) | bytes |
| --- | --- | --- |
| lib/tools.js | e51734baf4693cd3 | 213 715 |
| lib/members.js | 50f558f8b207d874 | 102 260 |
| lib/state.js | 56664c59ff400319 | 57 508 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13 986 |
| lib/index.js | 2d28e617f0683e42 | 45 315 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |
| lib/client.js | **377bcea2394cc0ac** (MỚI) | 258 432 |
| lib/client.js.map | **1f1d15524bcd3caa** (MỚI) | 404 958 |
| lib/types/members.d.ts | c53250ab41bff8c3 | 31 769 |
| lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7 627 |
| lib/types/tools.d.ts | 41cfc56576ed8ffd | 7 546 |
| lib/client/ActivityPanel.module.css | 53ea47c6d780cd9d | 51 837 |
| package.json | 92a6404071e457cc | 10 498 |

Drift trên đúng 13 tệp này: **0** ở cả 3 mốc (trước pack / ngay sau pack / sau cài + boot); A5 và A11 in `drift=0 changed=none`.

## 3. Tarball ↔ bản cài ↔ nguồn

Profile MỚI `C:/Users/thang/.dsh/profiles/agent-teams-pack19` (khuôn chép từ `agent-teams-pack18`, 3 bundle base/headless/@nami/dsh-agent-teams).
A6: `npm=0 isSymlink=false isDirectory=true version=0.2.0-dev.0`.
`dependencySpec` = `lockResolved` = `file:E:/Project/Agent-Team/packages/dsh-agent-teams/tests/tmp/t130/run-2026-11-01T03-59-18Z/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`.
A7: ba chiều **13/13 SAME**.
A3: `total=133 dirEntries=0 requiredMissing=none junk=none absPaths=none`.
A12: quét TOÀN BỘ payload — `fileEntries=133 compared=133 skipped=0 diff=none` (so sha từng entry với cây nguồn).
A14: `lib/client.js` source=377bcea2394cc0ac/258432 = installed=377bcea2394cc0ac/258432 `same=true`; `lib/client.js.map` source=1f1d15524bcd3caa/404958 = installed `same=true`.
Hash ngoài FROZEN (không ghim, chỉ báo): `lib/client/ActivityPanel.js` sha256 `9596333059c68b80a2f627b53a8d5a4d6d99e99d84c2ba39c94f70720ff57f54` / 64 004 B.

## 4. Boot thật trên bản ĐÃ CÀI (1 lần, ≤2)

`exit=0`, `session-ad79c9fb-7772-4ae5-81e8-cda6215b1a89`, 6 tool call (create → remove_member → status → edit_plan → update_task findings → status). Nguyên văn:

- `Members (1 present + 1 removed):`
- `Removed (1):`
- `  - bob [qa] opencode-go/deepseek-v4.1-flash · reasoning max · joined 2026-11-01T03:58:24.185Z` (không có persona/tools vì member chưa activate — `lib/members.js:1078`)
- `  - t1 [pending] work findings 1 attempt 0 probe task → captain`
- `Team id: t130probe · phase: staged`

## 5. Bằng chứng bundle MỚI (thứ tự panel)

Đọc `lib/client.js` của **BẢN CÀI**: `DependencyMap@175646` (x1) < `AddMemberControl@175795` (x1) < lời gọi `orderDelegationMembers(team.members, team.tasks)@175899` (x2) ⇒ A13 `ok=true`. Đối chứng âm trong suite: thứ tự TRƯỚC t128 bị chính phép kiểm đó từ chối (`DependencyMap above the member list @74 must precede AddMemberControl above the member list @0`).

## 6. Đối chứng âm (`--negative`, EXIT 0)

- bảng sạch: `13/13 khop => exit 0`; lật 1 byte của `lib/tools.js` trong bảng ⇒ `DIFF … applies=false delta=-1`.
- đổi 16 hex sha của `lib/members.js` ⇒ `DIFF … shaApplies=false`.
- lật 1 byte trên **BẢN SAO payload** (`tests/tmp/t130/payload`) ⇒ `DIFF lib/state.js [payload] applies=true bytesFrozen=57508 bytesActual=57509 delta=+1`.
- lật 1 byte trên **BẢN COPY .tgz** (offset 5, gzip MTIME) ⇒ `TGZ_FLIP copyExit=1 originalExit=0 caught=true bytesSame=true sha=d34be2af347ea625 -> 29e7254a20e5ab36`; con in `FAIL  A4 … sha256Now=29e7254a…`, bản gốc `--analyze` vẫn EXIT 0.
- hai tiến trình thật: bảng sạch `exit=0` (13/13) / bảng đột biến `exit=1` (12/13).

## 7. `--analyze` (lệnh verify của card)

`node packages/dsh-agent-teams/tests/t130-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t130` ⇒ **EXIT 0, 15/15 check**, hash lại tarball trên đĩa mỗi lần: `sha256Now=d34be2af… bytesNow=2248088 entriesNow=133`.

## 8. Trạng thái lúc pack

`tests/t98-render-coverage.mjs --strict` EXIT 0 GREEN (tools=16 fields=112 reached=105 uncovered=0 nested_gaps=0 roster_invariant_problems=0) · `tests/t10-ui-bundle-smoke.mjs` EXIT 0 (13/13, ghim đúng sha client.js vòng 20) · `tests/t129-pins.mjs` EXIT 0.

## 9. Giới hạn trung thực

- `tests/t118-pack.mjs`, `tests/t121-pack.mjs`, `tests/t108-pack.mjs` **sẽ ĐỎ** vì ghim hash nguồn vòng cũ (client.js đã đổi). Đúng thiết kế, KHÔNG sửa, không thêm vào LEGACY.
- Lượt `--negative` đầu crash `ReferenceError: newestPackTgz is not defined` (thiếu helper); đã thêm helper rồi chạy lại ⇒ EXIT 0. Log lượt hỏng không giữ lại, đây là khai báo.
- `--fresh` lượt 1 chạy trên byte suite 67 151 B trước khi thêm helper `newestPackTgz`; lượt 2 và `--analyze` chạy trên byte CUỐI (cùng sha `c7126deb…`) — thay đổi là additive, chỉ dùng cho `--negative`.
- Trần: 4/6 lần pack · 2/2 boot · 1/3 lần thử.
