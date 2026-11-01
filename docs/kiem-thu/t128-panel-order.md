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
