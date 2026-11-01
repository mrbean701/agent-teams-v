# Dùng Agent Teams với đội ERP — hướng dẫn cho người vận hành

Áp dụng cho: `@nami/dsh-agent-teams` **0.2.0-dev.0**, bộ byte phát hành **vòng 23** (t143, audit t144).
Đối tượng: người vận hành đội ERP trên DSH Desktop — không cần đọc mã nguồn plugin.
Mọi khẳng định dưới đây đều có nguồn: hoặc mã trong `packages/dsh-agent-teams/lib`, hoặc một tài liệu
đo trong `docs/kiem-thu`. Chỗ nào CHƯA chứng minh được thì ghi rõ ở mục 5.

## Mục lục

1. [Cài & kiểm bộ byte phát hành](#1-cài--kiểm-bộ-byte-phát-hành)
2. [Mở panel và đọc panel ba khối](#2-mở-panel-và-đọc-panel-ba-khối)
3. [Ba tác vụ chính](#3-ba-tác-vụ-chính)
   - [3.1 Đổi model khi member ĐANG CHẠY](#31-đổi-model-khi-member-đang-chạy)
   - [3.2 Thêm member thủ công](#32-thêm-member-thủ-công)
   - [3.3 team.json của ERP: 7 hồ sơ removed, trường lạ, giới hạn ghi](#33-teamjson-của-erp-7-hồ-sơ-removed-trường-lạ-giới-hạn-ghi)
4. [Xử lý sự cố thường gặp](#4-xử-lý-sự-cố-thường-gặp)
5. [Đã chứng minh / chưa chứng minh](#5-đã-chứng-minh--chưa-chứng-minh)
6. [Đọc tiếp](#6-đọc-tiếp)

---

## 1. Cài & kiểm bộ byte phát hành

Bộ byte hiện hành nằm ở `dist/vong-23/nami-dsh-agent-teams-0.2.0-dev.0.tgz`:

| Thuộc tính | Giá trị | Nguồn |
| --- | --- | --- |
| sha256 | `62ad22758a405a9ad1c9e380b91a2ea5aef830e0a66a9a0bad2fde74f6c1d308` | báo cáo §2.3/§2.4; audit t144 đo lại độc lập |
| kích thước | 2 248 300 B | như trên |
| số entry | 133 tệp / 0 entry thư mục | như trên |
| version | `0.2.0-dev.0` (chưa publish npm) | báo cáo §2.3 |

**Vì sao phải kiểm sha256 trước khi cài:** các vòng trước dùng CÙNG tên tệp. Vòng 22
(`b65f60fd…`) đã bị audit bác bằng finding **V22-F0 (high)** — bố cục panel chia 1:1 làm hai cột
bị bóp; thư mục đó nay có `dist/vong-22/DO-NOT-PUBLISH.txt`. Chỉ vòng 23 là bản được công bố.

Bốn lệnh kiểm (đã chạy thật trên máy này, output là số đo thật):

```bash
cd E:/Project/Agent-Team

# (1) sha256 + số byte
node -e "const c=require('node:crypto'),f=require('node:fs');const b=f.readFileSync('dist/vong-23/nami-dsh-agent-teams-0.2.0-dev.0.tgz');console.log(c.createHash('sha256').update(b).digest('hex'),b.length)"
# 62ad22758a405a9ad1c9e380b91a2ea5aef830e0a66a9a0bad2fde74f6c1d308 2248300

# (2) số entry trong gói
tar -tzf dist/vong-23/nami-dsh-agent-teams-0.2.0-dev.0.tgz | wc -l
# 133

# (3) bản ĐÃ CÀI phải là thư mục thật (không symlink) + đúng version
node -e "const f=require('node:fs');const p='C:/Users/thang/.dsh/profiles/desktop/node_modules/@nami/dsh-agent-teams';console.log('isSymlink='+f.lstatSync(p).isSymbolicLink(),'version='+JSON.parse(f.readFileSync(p+'/package.json','utf8')).version)"
# isSymlink=false version=0.2.0-dev.0

# (4) một tệp trong bảng đóng băng phải khớp (lib/tools.js: e51734ba… / 213 715 B)
node -e "const c=require('node:crypto'),f=require('node:fs');const b=f.readFileSync('C:/Users/thang/.dsh/profiles/desktop/node_modules/@nami/dsh-agent-teams/lib/tools.js');console.log(c.createHash('sha256').update(b).digest('hex').slice(0,16),b.length)"
# e51734baf4693cd3 213715
```

`isSymlink=false` là mốc quan trọng: profile dogfood `agent-teams-test` cài bằng `link:` nên
`isSymlink=true` — chạy trên đó KHÔNG chứng minh gì về bộ byte phát hành (đó là lý do tồn tại
`docs/kiem-thu/t126-released-bytes.md`, nơi cài từ tarball vào profile mới rồi boot thật).

**Cài vào một profile** (chạy trong thư mục profile):

```bash
npm i --offline --legacy-peer-deps dist/vong-23/nami-dsh-agent-teams-0.2.0-dev.0.tgz
```

Lệnh cài tham chiếu này lấy từ báo cáo §2.3 (đường dẫn phát hành ổn định, đã sửa V19-F6).
Sau khi cài, mở app DeepSeek Harness và bấm **Ctrl+R** để nạp lại giao diện — không cần
khởi động lại cứng (báo cáo §2.3; `docs/bao-cao-telegram/ky-46.md:16`).

## 2. Mở panel và đọc panel ba khối

Panel AgentTeams là panel phụ của app (nút **Activity panel**, chuỗi `activity.panelButton` trong
`packages/dsh-agent-teams/lib/client/locales.js:293`; tiêu đề `activity.title`). Panel tự mở khi
team đang sống, hoặc bạn bấm nút đó.

**Điều kiện bắt buộc:** panel chỉ hiện team của **session đang chọn**. Bộ lọc là
`team.captainSessionId === current` (`packages/dsh-agent-teams/lib/client/ActivityPanel.js:644`).
Hệ quả thực dụng: mở session khác ⇒ panel rỗng dù team vẫn tồn tại. Nếu panel trống, hãy quay lại
đúng session đã tạo team. Khoá bằng máy: `tests/t57-panel-session-gate.mjs` 29/29
(`docs/kiem-thu/t57-panel-session-gate.md`).

**Bố cục ba khối** (bản vòng 23, dựng ở t142 — `docs/kiem-thu/t142-three-columns.md`):

| Khối | Nội dung | Vị trí |
| --- | --- | --- |
| Trái | `Add member` (form thêm member) là phần tử ĐẦU TIÊN, rồi toggle `Members`, rồi danh sách member | cột trái `section.delegationSection` |
| Phải | `Task dependencies` (DAG task) | cột phải `section.dependencySection` |
| Trải hết | header team, staging editor, workspace summary | `grid-column: 1/-1` |

CSS đặt tỉ lệ **1:2** cho hai cột khi panel đủ rộng:

```css
@container (width>=800px){ ... [data-workspace-team]{grid-template-columns:minmax(280px,1fr) minmax(0,2fr);align-items:start;gap:16px;display:grid} }
... [data-workspace-team]>.dependencySection{overscroll-behavior:contain;min-width:0;max-height:56vh;overflow-y:auto}
```

Nghĩa là: cột trái tối thiểu 280px rồi chia 1 phần, cột phải nhận 2 phần (đủ chỗ cho DAG 100+ task),
và cột phải cao tối đa **56vh** rồi tự cuộn — danh sách member không bị DAG đẩy xuống đáy nữa.
Ảnh chụp panel thật: `docs/kiem-thu/desktop-vong-23-three-columns.png` và
`docs/kiem-thu/desktop-vong-23-panel-crop.png`.

Dấu hiệu bạn đang nạp bản CŨ (vòng 22 bị bác): hai cột chia ĐÔI (1:1) và task dependencies bị bóp
trong ~490px. Kiểm lại sha bản cài theo mục 1.

## 3. Ba tác vụ chính

### 3.1 Đổi model khi member ĐANG CHẠY

Đây là tính năng gốc của bản viết lại: **đổi route của một member đang chạy mà không mất việc**.
Không cần dừng team, không cần xoá member.

**Cách nói với captain** (khẩu lệnh — model sẽ gọi tool hộ bạn):

```text
Đổi model của qa-do-2 sang command-code-goat/deepseek/deepseek-v4-pro, reasoning high.
Nó đang chạy thì vẫn đổi, đừng dừng việc đang làm.
```

**Tool captain gọi:** `agent_teams_set_member_route` (`packages/dsh-agent-teams/lib/tools.js:1333`).
Tham số: `member_name` (bắt buộc), `provider`, `model`, `reasoning_effort`, `clear`,
`fallback_provider`/`fallback_model`/`fallback_reasoning_effort`/`fallback_clear` (:1336-1344).

**Thông điệp trả về khi member đang chạy** (nguyên văn từ render, `lib/tools.js:1372-1381`):

```text
Member "<tên>" route is now <provider>/<model>, reasoning <effort> — applied to the live session and saved; the step already in flight keeps its route and the session records a model-changed notice
```

Diễn giải: bước ĐANG chạy giữ route cũ cho trọn vẹn (không mất việc), **bước kế tiếp** dùng route mới,
và phiên của member ghi một notice `[model changed: …]`. Chứng minh đầu-cuối bằng phiên thật:
`docs/kiem-thu/t18-hot-switch.md` (notice ở seq 19, `request/header` seq 11 = route cũ, seq 20 =
route mới, task giữ nguyên attempt). Bộ kiểm: `tests/t18-hot-switch-e2e.mjs`.

**Ghi bền:** `team.json` của workspace nhận thêm
`routeOverride {provider, model, reasoningEffort, source: "captain", at, by}` trên member đó, và
workspace có thêm một hàng audit trong `docs/log/MODEL-SWITCH.md`
(số đo thật: `docs/kiem-thu/desktop-vong-21.md` §3.2). Kiểm bằng lệnh:

```bash
node -e "const fs=require('node:fs');const j=JSON.parse(fs.readFileSync('E:/Project/ERP/.agent-teams/erp-erp/team.json','utf8'));const m=j.members.find(x=>x.name==='qa-do-2');console.log('route='+m.provider+'/'+m.model,'override='+JSON.stringify(m.routeOverride??null))"
# đo trên dữ liệu ERP thật hiện nay: route=opencode-go/deepseek-v4.1-flash override=null
```

**Trả về route khai báo:** gọi cùng tool với `clear=true` (không truyền provider/model). Trộn hai dạng
sẽ bị từ chối nguyên văn: `agent_teams_set_member_route: clear cannot be combined with provider, model,
or reasoning_effort — clear returns the member to its declared route, so pass only member_name and clear`
(`lib/tools.js:1395`).

### 3.2 Thêm member thủ công

**Khẩu lệnh:** `Thêm member ten-la "be-api-3", role gõ backend, dùng route mặc định.`

**Tool:** `agent_teams_add_member` (`lib/tools.js:1270`). Trường **bắt buộc: `name`** (:1273).
Các trường còn lại: `role`, `provider`, `model`, `reasoning_effort`, `executionPrompt`, `tool_policy`,
`activation`.

**Route mặc định khi bạn bỏ trống:** plugin lấy route cấu hình của deployment
(`memberLlmProvider`/`memberModel`), hoặc route HIỆN TẠI của captain nếu không cấu hình
(`lib/tools.js:1275-1276`). `reasoning_effort` chỉ được thừa kế khi provider/model không đổi;
đổi route thì lấy mặc định của model đích (:1277).

**Ba dạng trả về** (`lib/tools.js:1305-1309`):

| Tình huống | Câu trả về |
| --- | --- |
| Team đang ở giai đoạn lập kế hoạch | `Member "<tên>" added to the staged roster (<p>/<m>); no child was spawned.` |
| Team đang chạy, spawn ngay | `Member "<tên>" added and started (session <id>, <p>/<m>, reasoning <e>, status <status>).` |
| `activation: on-task` | `Member "<tên>" added (<id> hoặc "starts with its first ready task", <p>/<m>, …).` |

**Ba lỗi hay gặp** (nguyên văn, `lib/tools.js:3112-3118`):

- `member name "<tên>" is reserved for the captain` — tên dành riêng cho captain.
- `member name "<tên>" has already been used in team "<team>"` — tên đã dùng (kể cả member đã `removed`).
- `team "<team>" is at its manual member cap (<N>)` — chạm trần thêm tay (`maxManualMembers`, mặc định 12 — `lib/index.js:103`).

Thêm member vào team ĐANG CHẠY thì child session khởi động ngay (`activation` mặc định `immediate`),
trừ khi team còn `staged` (:3155).

### 3.3 team.json của ERP: 7 hồ sơ removed, trường lạ, giới hạn ghi

Đội ERP thật: `E:/Project/ERP/.agent-teams/erp-erp/team.json` — 14 member trong đó **7 `status: removed`**
và **107 task** (đo lại hôm nay: `members=14 removed=7 tasks=107`). Lệnh kiểm:

```bash
node -e "const fs=require('node:fs');const j=JSON.parse(fs.readFileSync('E:/Project/ERP/.agent-teams/erp-erp/team.json','utf8'));console.log('members='+j.members.length,'removed='+j.members.filter(m=>m.status==='removed').length,'tasks='+j.tasks.length)"
# members=14 removed=7 tasks=107
```

**7 hồ sơ `removed` KHÔNG bị ẩn.** `agent_teams_status` in cả hai nhóm:

```text
Members (7 present + 7 removed):
Removed (7):
Tasks (107):
```

(số đo: `docs/kiem-thu/t106-erp-live-roundtrip.md` mục C1; bản vá hiển thị:
`docs/kiem-thu/t107-removed-members-visible.md`.) Vì sao quan trọng: hồ sơ `removed` vẫn giữ
`runtimeSetup.persona` + `toolFilter` + `joinedAt` — dấu vết để biết ai từng làm gì, và bản cũ
(trước t107) làm rơi đúng các trường này.

**Trường lạ của hệ ngoài vẫn ĐỌC được.** Ví dụ `routeOverride.source: "erp"` — giá trị không nằm
trong 3 nguồn của plugin — vẫn nạp bình thường, vì chiều ĐỌC chỉ kiểm hình dạng token
(`PROVENANCE_SOURCE_PATTERN` trong `packages/dsh-agent-teams/lib/state.js`); trước bản vá
BUG-026, một giá trị lạ làm CHẾT CẢ ĐỘI (`docs/kiem-thu/t102-erp-read-leniency.md` §1-§3).

**Chiều GHI thì CHẶT: chỉ 3 giá trị `captain | http | profile`.** Ghi nguồn khác bị từ chối
**trước khi** ghi byte nào và trước khi ghi audit row (`lib/members.js:1331`, `:1351`), nguyên văn:

```text
agent-teams: route change for member "alice" refused: source "erp" is not one the plugin owns (valid sources: captain, http, profile); nothing was written
```

Bản mới **không tự thêm** `routeOverride` khi chỉ đọc dữ liệu ERP (0/14 member có `routeOverride`;
`routeOf` trả `origin: "declared"`) — số đo: `docs/kiem-thu/tuong-thich-erp.md` mục 0 (C7).

### 3.4 Giới hạn quan trọng: hồ sơ ERP có `id` bền thì đổi route chỉ là *durable-only*

Đội ERP có **14 hồ sơ member đã có `id`** (trường `id` trong `team.json`). Với các hồ sơ này plugin **không spawn phiên mới**: mọi tin nhắn đi qua mailbox, và `agent_teams_set_member_route` chỉ ghi `routeOverride` để **áp dụng ở lần start kế tiếp** — công cụ trả nguyên văn `… saved; it takes effect the next time this member starts`.

Nguyên nhân trong mã (đoạn quyết định): `packages/dsh-agent-teams/lib/tools.js:544-545`
```js
if (member.id !== '')
    return deliverToMember(ctx, captain, member.id, text, signal, mode);
```
Tức: **có `id` bền ⇒ không spawn lại**, chỉ giao qua mailbox.

**Hệ quả bạn cần biết trước khi bấm:**
- Nếu member đó **đang có phiên sống** (do chính phiên captain hiện tại spawn), đổi route **áp dụng NGAY** cho phiên đó — bằng chứng t154: `Member "kiem-thu-t154" route is now … applied to the live session and saved`.
- Nếu member chỉ tồn tại trong `team.json` (không có phiên sống), đổi route là **durable-only**: `status` vẫn có thể hiển thị `working` (trạng thái trong tệp) nhưng **không có gì đang chạy**; hiệu lực chỉ tới khi member đó được start.
- Vì vậy, muốn 'đổi model cho thành viên ERP có hiệu lực tức thì', cần cơ chế **start-on-demand** (spawn phiên cho hồ sơ đã có `id`). Cơ chế này **chưa có** trong bản vòng 25 — đang được đánh giá ở card `t155` (đề xuất làm dạng **opt-in**, mặc định giữ nguyên hành vi hiện tại để không tự spawn ngoài ý muốn).

**Cách kiểm nhanh trên dữ liệu thật** (bản copy, không đụng tệp gốc): xem mục 5 của `docs/kiem-thu/t154-released-erp.md` — ở đó có nguyên văn cả lần thử nhắm `qa-do-2` trả `delivered via mailbox` và `status` giữ `idle/ready`.
## 4. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân (đo được) | Cách xử |
| --- | --- | --- |
| `error: profile "desktop" is managed exclusively by the Electron application` khi chạy CLI | profile `desktop` do Electron quản lý; CLI không boot được nó | chạy thử headless trên profile SAO (`docs/kiem-thu/desktop-vong-21.md` §2); dùng thật thì thao tác trong app |
| Thấy tool Agent Teams trùng tên / hành vi lạ | `@nanmicoder/dsh-agent-teams@0.1.28` vẫn nằm trong `package.json` của profile `desktop` nhưng KHÔNG nằm trong `dsh.profile.bundles` nên không được nạp | kiểm `dsh.profile.bundles` có `@nami/dsh-agent-teams`; nếu thấy tool trùng tên thì xoá dependency 0.1.28 |
| Panel trống dù đã cài bản mới | panel lọc theo session: chỉ hiện team có `captainSessionId === current` | mở ĐÚNG session đã tạo team (hoặc tạo team mới trong session hiện tại) |
| `dsh: session "<uuid>" does not exist; omit --session-id to start a new Session` | `--session-id` là **RESUME** phiên có sẵn, không phải đặt id cho phiên mới | bỏ `--session-id` khi muốn phiên mới (`docs/kiem-thu/moi-truong.md:136`) |
| Panel chia hai cột bằng nhau, dependencies bị bóp | đang nạp bản vòng 22 (bị bác V22-F0) | cài lại đúng tarball vòng 23 rồi `Ctrl+R` (mục 1) |
| `Members (<N>)` không thấy hồ sơ `removed` | bản cài trước bản vá t107 | cài bản vòng 23 (đã có `removed_count`/`removed_members`) |
| Vừa cài xong, giao diện không đổi | GUI chưa nạp lại bundle | bấm `Ctrl+R` trong app |

## 5. Đã chứng minh / chưa chứng minh

| Khẳng định | Trạng thái | Citation |
| --- | --- | --- |
| Đổi model khi member ĐANG CHẠY có hiệu lực ở bước kế tiếp và ghi bền `routeOverride` | **ĐÃ chứng minh** bằng phiên thật | `docs/kiem-thu/t18-hot-switch.md` (notice seq 19; header seq 11 → 20; PASS 9/9 sau khi vá bộ kiểm) |
| Bộ kiểm t18 tự chứng minh (9/9) và 4 đối chứng âm đỏ đúng chỗ | **ĐÃ chứng minh** | `docs/kiem-thu/t18-hot-switch.md` (N1..N4) |
| Bộ byte phát hành cài được và nạp được từ TARBALL (không phải symlink) | **ĐÃ chứng minh** | `docs/kiem-thu/t126-released-bytes.md` (isSymlink=false, 13/13 bảng đóng băng, boot thật) |
| 14 member / 7 removed / 107 task của ERP đọc và render đúng | **ĐÃ chứng minh** | `docs/kiem-thu/t106-erp-live-roundtrip.md` (C1..C6); `docs/kiem-thu/desktop-vong-21.md` §3.1 |
| Trường lạ `routeOverride.source` của hệ ngoài đọc được, ghi thì bị chặn | **ĐÃ chứng minh** | `docs/kiem-thu/t102-erp-read-leniency.md`; `lib/members.js:1331`/`:1344` |
| Bố cục panel 1:2 với `max-height:56vh` có thật trong byte phát hành | **ĐÃ chứng minh** ở mức byte/SSR | `docs/kiem-thu/t142-three-columns.md`; audit t144 đo `minmax(280px,1fr) minmax(0,2fr)` trong bundle đã cài |
| DOM sống trong trình duyệt của GUI Host (Chromium thật, kéo giãn panel) | **CHƯA chứng minh** — Host kiểm soát phiên GUI, repo không điều khiển được; chỉ có ẢNH chụp | ảnh `docs/kiem-thu/desktop-vong-23-three-columns.png` không phải phép đo tự động |
| Mọi model đều gọi đúng tool khi bạn ra khẩu lệnh | **CHƯA chứng minh** — phụ thuộc model captain; tài liệu chỉ bảo đảm TOOL tồn tại + ngữ nghĩa | `packages/dsh-agent-teams/lib/tool-names.js` (16 tool); `lib/tools.js:1270`, `:1333` |
| `Ctrl+R` đủ để nạp lại GUI | **ĐÃ quan sát**, chưa có phép đo tự động | báo cáo §2.3; `docs/bao-cao-telegram/ky-46.md:16` |

## 6. Đọc tiếp

- Tổng quan tính năng + trạng thái phát hành: `docs/bao-cao-agent-teams.md` §2.2-§2.4.
- Tương thích dữ liệu ERP (không phải di trú): `docs/kiem-thu/tuong-thich-erp.md`.
- Đổi model khi đang chạy — chi tiết đo: `docs/kiem-thu/t18-hot-switch.md`.
- Bộ byte phát hành — cách kiểm đầy đủ: `docs/kiem-thu/t126-released-bytes.md`.
- Panel ba khối — vì sao đổi từ 1:1 sang 1:2: `docs/kiem-thu/t142-three-columns.md`.
- Môi trường chạy thử headless + bẫy `--session-id`: `docs/kiem-thu/moi-truong.md`.
- Cách tôi kiểm chính tài liệu này (lệnh nào chạy thật, lệnh nào chỉ đọc mã):
  `docs/kiem-thu/t147-doc-erp.md`.
