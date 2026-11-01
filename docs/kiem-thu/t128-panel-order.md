# t128 — thứ tự khối trong panel AgentTeams: DependencyMap → AddMemberControl → danh sách member

Yêu cầu người dùng: 'DependencyMap về vị trí cũ + form add-member ngay trên list member'.
Mảng `children` của panel đổi từ

    [ ...header, ProgressOverview, (members IIFE), AddMemberControl, DependencyMap, workspace && WorkspaceSummary ]

thành

    [ ...header, ProgressOverview, DependencyMap, AddMemberControl, (members IIFE), workspace && WorkspaceSummary ]

## 1. Vì sao phải sửa TAY ba tệp

`lib/client/ActivityPanel.js` là NGUỒN, nhưng Host thật nạp `./client` = `lib/client.js` (bundle đã build).
Repo KHÔNG có toolchain để build lại: không `tsconfig.json`/`tsconfig.client.json`, không config tsdown,
`scripts/clean-build.mjs` và `scripts/git-artifacts.mjs` không tồn tại. Vì vậy một bản sửa chỉ ở nguồn sẽ
KHÔNG tới được người dùng, và một bản sửa chỉ ở bundle sẽ mất ở lần build sau. Ba tệp phải đồng bộ:

| tệp | vai trò | sha256 TRƯỚC | sha256 SAU | bytes |
| --- | --- | --- | --- | --- |
| `packages/dsh-agent-teams/lib/client/ActivityPanel.js` | nguồn | `d35b5f3fc39c48541125a0afaaba02c60a671d0088b82a82e8bf7980a43f7408` | `9596333059c68b80a2f627b53a8d5a4d6d99e99d84c2ba39c94f70720ff57f54` | 64 004 |
| `packages/dsh-agent-teams/lib/client.js` | bundle Host nạp | `9da18d9971a284e936d709db592da6cedcdf1afa960fff282d7a1c802fec7007` | `377bcea2394cc0ac3dd69b7c1dba05b56e90b0d5db9a1b565840e057bc0cb47d` | 258 432 |
| `packages/dsh-agent-teams/lib/client.js.map` | sourcemap (`sourcesContent[2]`) | `bbf88608f54e966fdb42cf0c8297b81e46d198870ce87b002c6a54f8cf6e5dae` | `1f1d15524bcd3caa4ae3f39247558550736f32ac151f9908cbb15c88a260dd81` | 404 958 |

Số byte của cả ba tệp KHÔNG đổi (64 004 / 258 432 / 404 958) — đây là phép DỜI, không phải viết thêm.

## 2. Ba dòng anchor (trước → sau)

**Nguồn, dòng 392** (chỗ chèn):

    TRƯỚC: ...] }), _jsx(ProgressOverview, { team: team, t: t, discarded: discarded }), (() => {
    SAU  : ...] }), _jsx(ProgressOverview, { team: team, t: t, discarded: discarded }),
                 _jsx(DependencyMap, { tasks: team.tasks, members: team.members, t: t, discarded: discarded,
                                      workspace: workspace, onSelectTask: setSelectedTaskId }),
                 _jsx(AddMemberControl, { team: team, modelDirectory: modelDirectory, t: t, historic: historic,
                                          stopped: stopped }), (() => {

**Nguồn, dòng 437** (chỗ bỏ):

    TRƯỚC: })()] }), _jsx(AddMemberControl, { ... }), _jsx(DependencyMap, { ... }), workspace && _jsx(WorkspaceSummary, { ... })] }), _jsx(Modal, { ...
    SAU  : })()] }), workspace && _jsx(WorkspaceSummary, { ... })] }), _jsx(Modal, { ...

**Bundle, dòng 1919 và 1940** (cùng phép, call site minified):

    TRƯỚC 1919: (0, import_jsx_runtime5.jsx)(ProgressOverview, { team, t, discarded }), (() => {
    SAU   1919: (0, import_jsx_runtime5.jsx)(ProgressOverview, { team, t, discarded }),
                (0, import_jsx_runtime5.jsx)(DependencyMap, { tasks: team.tasks, members: team.members, t, discarded,
                                               workspace, onSelectTask: setSelectedTaskId }),
                (0, import_jsx_runtime5.jsx)(AddMemberControl, { team, modelDirectory, t, historic, stopped }), (() => {

    TRƯỚC 1940:   })()] }), (0, ...)(AddMemberControl, { ... }), (0, ...)(DependencyMap, { ... }), workspace && (0, ...)(WorkspaceSummary, { ... })] }), ...
    SAU   1940:   })()] }), workspace && (0, ...)(WorkspaceSummary, { ... })] }), ...

Props, điều kiện `workspace &&`, thứ tự các khối khác và CSS: KHÔNG đổi một byte nào khác (ca D1/D2/D3 dưới đây chứng minh).

## 3. Sourcemap

`sources[2] === '../lib/client/ActivityPanel.js'` và trước t128 `sourcesContent[2]` TRÙNG BYTE với tệp nguồn.
Cách cập nhật: `JSON.parse` → gán `sourcesContent[2] = <nguồn mới>` → `JSON.stringify(map)` (không khoảng trắng).
Đã kiểm trước khi sửa rằng `JSON.stringify(JSON.parse(tệp))` cho ra CHUỖI Y HỆT tệp gốc (401 142 ký tự),
nên chỉ đúng một literal đổi; `version`, `sources`, `mappings` (114 429 ký tự) và `names` (44) giữ nguyên.

## 4. Bộ kiểm `tests/t128-panel-order.mjs` — 14 ca, EXIT 0

| ca | nội dung | kết quả thật |
| --- | --- | --- |
| P1 | nguồn: DependencyMap < AddMemberControl < orderDelegationMembers | `{dependency:33145, addMember:33295, members:33475, workspace:41339}` |
| P2 | ProgressOverview vẫn đứng trước, và mọi anchor đã dời nằm trước `workspace && _jsx(WorkspaceSummary` | PASS |
| P3 | mỗi call site còn ĐÚNG MỘT lần trong nguồn (là dời, không phải copy) | `DependencyMap=1 AddMemberControl=1` |
| B1 | bundle: cùng quan hệ thứ tự | `{dependency:175618, addMember:175767, members:175899, workspace:181976}` |
| B2 | bundle: mỗi call site đúng một lần | `DependencyMap=1 AddMemberControl=1 WorkspaceSummary=1` |
| M1 | map: `sources[2]` đúng + `sourcesContent[2] === ` nguồn nguyên văn + thứ tự nguồn/bundle đồng ý | `contentMatches:true` |
| M2 | `mappings`/`names`/`version`/`sources` không đổi so với bản `before/` | `mappings same=true names same=true version=3` |
| D1 | diff nguồn so với `before/` = ĐÚNG 2 dòng, đúng số 392 và 437, số dòng giữ 825 | `changed lines=[392,437]` |
| D2 | diff bundle so với `before/` = ĐÚNG 2 dòng, số dòng giữ 3217 | `changed lines=[1919,1940]` |
| D3 | chỉ ba tệp đổi; `sourcesContent` các vị trí khác 0 đổi | `other changed=[]` |
| **N1** | **đối chứng âm 1**: bản sao thứ tự CŨ trong `tests/tmp/t128/before/` chạy đúng predicate ⇒ ĐỎ | `source: DependencyMap is not before AddMemberControl (41189 vs 41073)`, `source: AddMemberControl is not before the member list (41073 vs 33209)` |
| **N2** | **đối chứng âm 2**: nguồn MỚI + bundle CŨ (`tests/tmp/t128/neg2/`) ⇒ predicate đồng bộ ĐỎ | `source order is the NEW one but the bundle order is the OLD one — the shipped bundle disagrees with its source` |
| M3 | đối chứng 2b: cùng cặp đó nhưng chỉ chấm nguồn thì VẪN XANH ⇒ N2 không thừa | `source alone is green while the bundle is still old` |
| C1 | `node --check` cho hai tệp JS (EXIT 0) và map hợp lệ theo `JSON.parse` | `{panel:ok, client.js:ok, map:{via:'JSON.parse', sources:19, mappings:114429}}` |

Ghi chú: `node --check` từ chối đuôi `.map` (`ERR_UNKNOWN_FILE_EXTENSION`) nên map được kiểm theo đúng bản chất của nó là JSON — nếu không, ca C1 sẽ đỏ vì lý do công cụ chứ không vì nội dung.

## 5. Giới hạn

1. Không có lần chạy Host/giao diện thật nào trong t128: bộ kiểm chứng minh THỨ TỰ MÃ và tính đồng bộ ba tệp,
   không chứng minh ảnh render. Muốn thấy pixel phải mở panel trong Host.
2. `tests/tmp/t128/before/` là bản chụp ba tệp TRƯỚC khi sửa, dùng làm mốc cho D1–D3 và N1; đây là scratch —
   nếu thư mục đó bị xoá thì ba ca đó đỏ vì thiếu mốc (đúng ý: không có mốc thì không có bằng chứng diff).
3. Bản sửa bundle là sửa TAY. Lần build kế tiếp (nếu có toolchain) sẽ sinh lại `lib/client.js` + map từ nguồn —
   khi đó thứ tự đúng vẫn được giữ vì nguồn đã đúng; nhưng `tests/tmp/t128/before/` sẽ thành mốc cũ và D1–D3
   cần được làm mới theo quy ước 'ai đổi lib/** thì cập nhật mốc trong cùng task'.
## 6. t145 — hai phép kiểm mới: CSS NHÚNG ↔ CSS nguồn, và anchor cho segment của call site

Audit vòng 23 (`docs/audit/closure-vong-23.md`, V23-F1/F2) đo được hai khoảng mù trong bộ kiểm này.
Cả hai đều là 'phép kiểm có thật nhưng không phủ đúng chỗ', nên cách vá là THÊM phép kiểm trực tiếp
và một đối chứng âm cho mỗi phép — không nới phép nào đang có.

### 6.1 C7/C8 — stylesheet NHÚNG trong bundle (V23-F1)

Trước t145: mọi phép kiểm CSS đọc TỆP `lib/client/ActivityPanel.module.css`, còn cây render dựng từ
NGUỒN. Nhưng Host nạp `lib/client.js`, và bundle đó mang một BẢN SAO thứ hai của stylesheet dưới dạng
một chuỗi dài nhúng trong mã. Bản sao đó không có assertion ngữ nghĩa nào.

Bằng chứng của audit (tái hiện được): đổi `minmax(0,2fr)` → `minmax(0,1fr)` CHỈ trong CSS nhúng ⇒
`t10` 49/50, `t128` 19/22, và cả ba FAIL là `B3`/`X1`/`X2` — tức chỉ có 'build lại không trùng byte' và
'pin sai' lên tiếng. Re-pin xong thì tất cả xanh trở lại, dù tỉ lệ cột đã sai. Đó là phép kiểm đo BẢN
SẮC của tệp, không đo Ý NGHĨA của layout.

Cách vá — so NGỮ NGHĨA, không so chuỗi thô: trích declaration `grid-template-columns` của rule
`[data-workspace-team]` trong khối `@container (width>=800px)` từ CẢ HAI nguồn, chuẩn hoá khoảng
trắng rồi so. Hai bản được phép khác nhau về định dạng, không được khác về con số:

```
gridDeclarationOf(cssText) -> giá trị declaration đã chuẩn hoá (hoặc '')
embeddedCssProblems(bundleText, cssText) -> danh sách problem, mỗi problem mang KEY PATH đầy đủ
```

| ca | khẳng định | số đo thật |
| --- | --- | --- |
| C7 | declaration của rule trong CSS NHÚNG bằng declaration trong `ActivityPanel.module.css` | `embedded="minmax(280px,1fr) minmax(0,2fr)" file="minmax(280px,1fr) minmax(0,2fr)"` |
| C8 | bản nhúng TỰ nó giữ layout 1 : 2 (hai track `minmax`, sàn 280px, `display:grid`, `gap:16px`) — để bản nhúng cũ không nấp sau phép kiểm tệp | PASS với `grid-template-columns:minmax(280px,1fr) minmax(0,2fr);align-items:start;gap:16px;display:grid` |
| C9 | đối chứng âm (a): CHỈ sửa bản nhúng, `.module.css` nguyên byte ⇒ C7 ĐỎ | `copy=tests/tmp/t145/embedded-only/client.js applies=true delta=0 B` + thông điệp dưới đây |
| C10 | đối chứng âm (b): CHỈ sửa `.module.css` ⇒ C7 cũng ĐỎ (so HAI CHIỀU, không mặc định tin bundle) | `copy=tests/tmp/t145/css-only/ActivityPanel.module.css applies=true delta=0 B` |

NGUYÊN VĂN thông điệp FAIL của C7 khi đốt biến (C9 — chỉ CSS nhúng đổi, `delta=0 B` vì `1fr`→`2fr` cùng
độ dài, đúng kiểu đột biến mà so-byte không thấy):

```
bundle lib/client.js (inlined stylesheet) :: @container (width>=800px) > .aYQbCq_team[data-workspace-team] > grid-template-columns = "minmax(280px,1fr) minmax(0,1fr)" but lib/client/ActivityPanel.module.css declares "minmax(280px,1fr) minmax(0,2fr)" — the two copies of the stylesheet disagree, so the shipped panel is laid out by a ratio nobody reviewed
```

Chiều ngược lại (C10) in đúng cùng thông điệp với hai giá trị đảo chỗ, nên người đọc biết NGAY bản nào
lệch. `delta=0 B` ở cả hai ca là lý do phép kiểm này phải tồn tại: đột biến không đổi số byte.

### 6.2 M3/M4 — anchor cho segment của call site (V23-F2)

Trước t145: `MAPPING_ANCHORS` có ba mục, và mục cho call site dùng needle `DependencyMap, { tasks`.
Nhưng segment của bản đồ nguồn KHÔNG bắt đầu ở đó: trên `client.js:1940` có segment `gen=40 → 437:42`
(bản nguồn `_jsx(`) phủ dấu `(` mở lời gọi, và một segment RIÊNG `gen=45 → 437:47` phủ chính
`DependencyMap, { tasks`. Vì `originAt()` lấy segment CUỐI có `genCol <= column`, phép thử tại cột 45
không bao giờ chạm tới segment của dấu `(`. Audit vòng 23 dịch segment đó đi một cột ⇒ `M1` vẫn XANH.

Cách vá: thêm anchor thứ tư `{ needle: '(DependencyMap, { tasks', expect: '_jsx(DependencyMap, { tasks', maxLead: 6 }`
và cho `mappingProbe()` trả thêm `segmentGenCol` + `lead` (khoảng cách từ đầu segment tới cột được thử).
`maxLead` là phần chống 'ăn may': một segment chỉ TÌNH CỜ phủ vị trí đó (bắt đầu quá xa) không thoả anchor.

| ca | khẳng định | số đo thật |
| --- | --- | --- |
| M3 | segment phủ dấu `(` của call site trỏ về đúng lời gọi trong nguồn | `bundle=1940:44 -> ActivityPanel.js:437:42`, `snippet="_jsx(DependencyMap, { tasks"`, `segmentStartsAt=40 lead=4` |
| M4 | đối chứng âm: dịch ĐÚNG segment đó 1 cột ⇒ M3 ĐỎ, còn anchor CŨ (`M1`) vẫn XANH | `segment@40 srcCol 42->43` · `paren(now) … 437:43 snippet="jsx(DependencyMap, { tasks:" segmentStartsAt=40 lead=4` · `old M1(now) bundle=1940:45 -> 437:47` |

M4 xanh ở vế thứ hai chính là bằng chứng khoảng mù có thật: cùng một đột biến, anchor cũ KHÔNG thấy gì.
Đột biến chạy trên bản sao `decoded` trong bộ nhớ (map trên đĩa không bị ghi), và segment bị dịch được
xác định bằng chính `originAt` — không hard-code chỉ số mảng.

### 6.3 Số ca và hồi quy

| | trước t145 | sau t145 |
| --- | --- | --- |
| `node tests/t128-panel-order.mjs` | 22 ca, EXIT 0 | **28 ca, EXIT 0** (thêm C7, C8, C9, C10, M3, M4) |
| `node tests/t10-ui-bundle-smoke.mjs` | 50/50 | 50/50, EXIT 0 |
| `node tests/t129-pins.mjs` | 13/13 | 13/13, EXIT 0 |

0 boot: không suite sống nào được chạy. `B3` (build lại trên bản sao `tests/tmp/t142/build-copy`) vẫn
chạy như cũ — đó là build trong tiến trình, không phải boot Host.

### 6.4 `lib/**` không đổi byte (drift 0/13)

Bảng FROZEN 13 dòng đọc lại từ `tests/t59-erp-live-copy.mjs` rồi đo bằng `node:crypto`: 13/13 SAME,
`drift=0/13`. Cây `lib/**`: 79 tệp, 1 811 191 B, `lib_tree_sha256=fa08e18a2a17b1ea5d67792e8393ad7583fb41cd1b3fcec46a8abaed25120dec`.
mtime mới nhất dưới `lib/**` + `package.json` là `2026-11-01T07:20:19.654Z`
(`lib/client/ActivityPanel.module.css`), trong khi tệp bộ kiểm này được ghi lúc `2026-11-01T07:59:13Z` —
không có lần ghi nào vào `lib/**` trong task này. Bản sao dùng cho đối chứng âm nằm ở
`tests/tmp/t145/{embedded-only,css-only}` và chỉ chứa bản sao tệp, không liên quan `lib/**`.

### 6.5 Giới hạn của hai phép kiểm mới

1. **C7 so MỘT declaration.** Nó chứng minh tỉ lệ cột của hai bản sao khớp nhau; nó không chứng minh
   toàn bộ stylesheet nhúng khớp tệp. Muốn thế phải so cả khối — và khi đó mọi khác biệt định dạng của
   bộ build sẽ thành đỏ oan. `C8` bù phần layout quan trọng nhất, không bù toàn bộ.
2. **C7 không thay `B3`.** `B3` chứng minh bundle là SẢN PHẨM của build; C7 chứng minh hai bản sao đồng ý
   về tỉ lệ. Một bản build sai ở nguồn CSS sẽ làm cả hai cùng sai — lúc đó `C1` (1 : 2 trên tệp) mới là
   phép bắt.
3. **M3 phụ thuộc hình dạng bundle hiện tại** (`gen=40`/`gen=45` trên dòng 1940). Nếu esbuild đổi cách
   phát segment, `lead` có thể vượt `maxLead` và M3 đỏ dù bản đồ vẫn đúng về nghĩa. Cách xử lý đúng khi đó
   là đo lại rồi nâng `maxLead` kèm lý do, KHÔNG bỏ `maxLead` (bỏ là mất phần chống ăn may).
4. **Doc này mục 1–5 là bản ghi t128** (14 ca, bundle `377bcea2…`/258 432 B). Bundle hiện tại đã được
   các task sau build lại (`7dca20dd1edf2c66…`/258 790 B) và bộ kiểm đã lớn hơn nhiều; số trong mục 1–5
   là LỊCH SỬ, số trong mục 6 là hiện tại.
