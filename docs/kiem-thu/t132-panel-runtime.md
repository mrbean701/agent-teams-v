# t132 — Thứ tự panel THẬT của bundle đã cài (bộ byte phát hành vòng 20)

Câu hỏi: bản người dùng cài (`agent-teams-pack19`) có render đúng thứ tự mới
ProgressOverview → DependencyMap → AddMemberControl → danh sách member → WorkspaceSummary (khi có workspace),
hay chỉ là thứ tự chuỗi trong tệp nguồn?

Trả lời ngắn: đúng ở cả ba lớp đo — tĩnh (A), DOM thật do `react-dom/server` sinh ra (B/DOM), và cây phần tử
do jsx-runtime giả ghi lại (B/TREE). Ba đối chứng âm đều đỏ: bundle cũ vòng 19, bản sao đảo 2 call site, bản sao xoá 1 marker.

## Cách chạy

```
node tests/t132-panel-runtime.mjs                             # do mới, ghi tests/tmp/t132/run-<stamp>/
node tests/t132-panel-runtime.mjs --analyze <run-dir>         # CHỈ ĐỌC artifact, 0 boot, không ghi byte nào
node tests/t132-panel-runtime.mjs --analyze <dir> --strict    # từ chối thư mục chứa nhiều run-dir (fail-closed)
node tests/t132-panel-dom-order.mjs --analyze <run-dir>       # wrapper = lệnh verify của card t132
```

Exit 0 = 9/9 ca đạt; 1 = có ca hỏng; **2 = lỗi dùng CLI hoặc harness** (cờ lạ, thiếu giá trị, đường dẫn sai, SSR ném) —
và ở cả ba trường hợp lỗi **không ghi đĩa**. Số boot thật của mọi chế độ: **0** (trần của card là ≤2 boot; không cần dùng).
Chi tiết bản siết CLI + chứng minh chỉ-đọc: `docs/kiem-thu/t133-analyze-idempotent.md`.

## Phương pháp — ba lớp, không lớp nào đọc chuỗi mã để kết luận

**Lớp A (tĩnh, trên bản ĐÃ CÀI).** Đọc `lib/client.js` của profile `agent-teams-pack19`, tìm 5 call site
anh em trong `TeamSection` với needle là chính mã gọi thật của bundle (esbuild giữ shorthand props):
`ProgressOverview, { team, t, discarded }` · `DependencyMap, { tasks: team.tasks` · `AddMemberControl, { team, modelDirectory` ·
`orderDelegationMembers(team.members, team.tasks)` · `WorkspaceSummary, { team, t, discarded }`.
Mỗi needle phải xuất hiện ĐÚNG 1 lần và theo đúng thứ tự tăng dần của offset.

**Lớp B/DOM (runtime thật).** Nạp bundle bằng vm với shim `window.__ModuleLoader__` để bắt factory,
stub externals `react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-primitives`; inject MỘT dòng vào
bản sao trong bộ nhớ để lấy `TeamSection` (bundle không export component), rồi
`renderToStaticMarkup(createElement(TeamSection, props))` với team fixture 3 member + 2 task.
Không so chuỗi mã: HTML sinh ra được tìm 4 (hoặc 5) **data-attribute marker** và bắt buộc offset tăng dần:
`data-progress-summary` → `data-dependency-map` → `data-add-member=` → `data-members-toggle` → `data-total=`.

**Lớp B/TREE (danh tính component).** Lần render thứ ba dùng jsx-runtime giả ghi `{type, props, children}` rồi
serialize cây, nên đọc được thứ tự theo **component** (`<ProgressOverview` → `<DependencyMap` → `<AddMemberControl`
→ `data-members-toggle=true` → `<WorkspaceSummary`) chứ không phụ thuộc tên class CSS module (class trong bundle là hash).

## Kết quả 9 ca (số đo của `tests/tmp/t132/run-2026-11-01T04-08-52-492Z`, 9/9 đạt, EXIT 0)

| Ca | Nội dung | Số đo thật |
| --- | --- | --- |
| C1 | bundle đã cài = đúng bộ byte phát hành t130 và = tệp nguồn | sha256 `377bcea2394cc0ac3dd69b7c1dba05b56e90b0d5db9a1b565840e057bc0cb47d` / 258 432 B |
| C2 | lớp A: 5 call site trong bundle đã cài đúng thứ tự | 5/5 needle duy nhất: `ProgressOverview@175575 < DependencyMap@175647 < AddMemberControl@175796 < orderDelegationMembers@175899 < WorkspaceSummary@182018` |
| C3 | lớp B/DOM, workspace=false | `ProgressOverview@1945 < DependencyMap@2587 < AddMemberControl@5168 < member list@5403` (html 13 480 ký tự, 12 dòng member, 3/3 tên member ana/bob/cleo) |
| C4 | lớp B/DOM, workspace=true | `ProgressOverview@1972 < DependencyMap@2614 < AddMemberControl@5285 < member list@5519 < WorkspaceSummary@13835` |
| C5 | lớp B/TREE, workspace=true | `<ProgressOverview@1208 < <DependencyMap@1264 < <AddMemberControl@1329 < data-members-toggle@1492 < <WorkspaceSummary@6484` (cây 6 678 ký tự) |
| C6 | đối chứng âm: bundle CŨ vòng 19 (`git show HEAD`, sha `9da18d99…`) phải đỏ | DOM: `DependencyMap @10894 must precede AddMemberControl @10661` + `AddMemberControl @10661 must precede member list @2589`; TREE: `DependencyMap @6419 must precede AddMemberControl @6350` |
| C7 | đối chứng âm: bản sao đảo 2 call site phải đỏ | mutation applies (byte delta 0), DOM: `DependencyMap @2754 must precede AddMemberControl @2521` |
| C8 | đối chứng âm: xoá 1 marker DOM phải báo thiếu | `missing DependencyMap (needle data-dependency-map)` |
| C9 | không ghi byte nào vào bundle + doc đủ token + chế độ `--analyze` 0 boot | installed unchanged=true, source unchanged=true, 9/9 token |

Artifact mỗi lần chạy: `dom-plain.html`, `dom-workspace.html`, `tree-workspace.txt`, `old-dom-plain.html`,
`old-order-problems.txt`, `swap-order-problems.txt`, `missing-marker-problems.txt`, `results.json`, `run-meta.json`.
Thư mục: `tests/tmp/t132/run-<stamp>/`. **Chế độ `--analyze` không ghi một byte nào** (từ t133: cả `old-client.js`
cũng chỉ nằm trong bộ nhớ, và `analyze.marker.json` đã bị bỏ hẳn).

## Giới hạn (phải đọc cùng bảng trên)

1. **Chưa chứng minh DOM thật trong trình duyệt của GUI Host.** Không có ca nào mở GUI và đọc node sống;
   mức gần nhất đạt được trong sandbox là HTML do `react-dom/server` sinh từ chính bundle đã cài. Đây là
   bằng chứng cấu trúc render, không phải bằng chứng pixel/DOM runtime có state thật của người dùng.
2. **C4/C5 dùng stub-hooks**, không phải React state thật: `WorkspaceSummary` đọc `team.captainInbox` và nổ với
   `Cannot read properties of undefined (reading length)` khi render bằng React thật trong môi trường này, nên
   nhánh workspace được đo bằng useState/useMemo/useCallback giả. Vì vậy C4/C5 chứng minh THỨ TỰ, không chứng minh
   hành vi tương tác (bấm mở danh sách member).
3. **Lấy được component bằng cách inject 1 dòng vào bản sao trong bộ nhớ** (bundle không export `TeamSection`).
   Không có byte nào trên đĩa bị ghi: C9 đo sha256 bundle nguồn và bundle đã cài trước/sau đều không đổi.
4. Phép đo phụ thuộc **đường dẫn tuyệt đối của profile đã cài** (`C:/Users/thang/.dsh/profiles/agent-teams-pack19`);
   máy khác phải cài lại bộ byte t130 rồi mới chạy được, và C1 sẽ đỏ nếu bundle bị thay.
5. `data-total=` là marker duy nhất của `WorkspaceSummary` (component này không có data-attr ở root); nếu bản sau
   đổi marker đó thì C4 báo thiếu — đó là phát hiện, không phải nhiễu.
6. Trần của card là ≤2 boot; lần chạy này dùng **0 boot**, nên phần "hành vi khi Host thật nạp bundle" vẫn nằm ngoài phạm vi.

## t133 — bộ đo đã được siết: chỉ-đọc và fail-closed

Hai lỗ của chính bộ đo này (finding T132-F1/F2) đã được vá; bằng chứng 12/12 ca nằm ở
`tests/t133-analyze-idempotent.mjs` + `docs/kiem-thu/t133-analyze-idempotent.md`.

- **F1 (F1 = `--analyze` không idempotent):** trước đây chế độ chấm lại vẫn `fs.writeFileSync` `results.json`/`run-meta.json`
  vào chính artifact đang chấm ⇒ artifact bị lần chấm trước TỰ CHỮA, FAIL không tái lập được. Nay mọi phép ghi đi qua
  `emit_()` chỉ bật ở chế độ fresh (`WRITE_ARTIFACTS`), `--analyze` là chỉ-đọc tuyệt đối.
  Đo thật: 40 tệp trong `tests/tmp/t132` có sha256 + bytes + mtime **không đổi** sau 2 lần chấm liên tiếp.
- **F2 (CLI fail-open):** `--bogus` từng sinh một run mới và EXIT 0; `--analyze <thư mục không có results.json>` từng
  lặng lẽ chấm run mới nhất. Nay: cờ lạ / thiếu giá trị / chồng cờ / đường dẫn không tồn tại ⇒ **EXIT 2, không mkdir, không ghi**,
  thông điệp nêu đúng đường dẫn. Thư mục cha chứa nhiều `run-*` vẫn được nhận (in rõ `container N run-dir -> moi nhat <rel>`)
  để giữ lệnh verify của card; cờ `--strict` từ chối đúng trường hợp đó.
- **C9 siết lại:** thiếu `results.json` hoặc thiếu `domPlain.order.measured` nay là **KHÔNG ĐẠT** (trước đây rơi vào
  nhánh fail-open). Artifact bị sửa index thứ tự ⇒ `verdict FAIL — unproved C9`, EXIT 1 ở CẢ HAI lần chấm liên tiếp.
