# t147 — cách kiểm chính tài liệu `docs/huong-dan/dung-voi-erp.md`

Card `t147` (kind implementation, attempt `2fc078ee-07cd-4ae0-8669-071c85fbdf46`).
Mục đích: ghi lại ĐÚNG những gì đã chạy để kiểm tài liệu hướng dẫn, và những gì chỉ đọc mã —
để người sau không đọc tài liệu như một bộ số đo tự động.

## 1. Lệnh trong tài liệu: đã chạy thật hay chưa

Trần của card là **0 boot**, nên mọi phép kiểm đều là đọc tệp / chạy lệnh cục bộ (không phiên LLM).

| Lệnh trong tài liệu (mục) | Đã chạy? | Output thật đo được |
| --- | --- | --- |
| `node -e … createHash(…tgz)` (§1.1) | CÓ | `62ad22758a405a9ad1c9e380b91a2ea5aef830e0a66a9a0bad2fde74f6c1d308 2248300` |
| `tar -tzf … | wc -l` (§1.2) | CÓ | `133` |
| `node -e … lstatSync(profile desktop)/version` (§1.3) | CÓ | `isSymlink=false version=0.2.0-dev.0` |
| `node -e … createHash(lib/tools.js của bản cài)` (§1.4) | CÓ | `e51734baf4693cd3 213715` (khớp bảng đóng băng) |
| `npm i --offline --legacy-peer-deps dist/vong-23/…tgz` (§1) | **KHÔNG chạy ở card này** — trần 0 boot/không cài; lệnh này đã chạy thật ở t126 (`added 1 package`, xem `docs/kiem-thu/t126-released-bytes.md`) | — |
| `node -e … đọc `qa-do-2`.routeOverride (§3.1) | CÓ | `route=opencode-go/deepseek-v4.1-flash override=null` |
| `node -e … đếm members/removed/tasks (§3.3) | CÓ | `members=14 removed=7 tasks=107` |

Ghi chú trung thực: lệnh `npm i` trong tài liệu KHÔNG được tôi chạy lại trong card này; nó được
dẫn nguyên văn từ `docs/bao-cao-agent-teams.md` §2.3 và đã được đo ở t126. Nếu người dùng chạy
trong profile riêng thì kết quả mong đợi là `added 1 package`.

## 2. Đường dẫn trong tài liệu: tự kiểm bằng máy

Đã trích mọi chuỗi dạng `docs/…`, `packages/…`, `tests/…`, `dist/…`, `E:/Project/ERP/…` từ tài liệu
và kiểm tồn tại trên đĩa (đường dẫn plugin thử thêm gốc `packages/dsh-agent-teams/`):

```text
paths checked 29
missing: none
```

Hai glob (`lib/**`, `docs/kiem-thu/**`) đã được đổi thành thư mục thật (`lib`, `docs/kiem-thu`) để
phép kiểm "mọi đường dẫn đều tồn tại" đúng theo nghĩa đen.

## 3. Số đo độc lập của tôi (dùng để viết tài liệu)

| Việc | Kết quả |
| --- | --- |
| `dist/vong-23/…tgz` sha256 + bytes | `62ad2275…c1d308` / 2 248 300 B (khớp báo cáo §2.4) |
| `dist/vong-23/` chỉ có 1 tarball + `RELEASE.txt`; `dist/vong-22/` có `DO-NOT-PUBLISH.txt` | đúng (cơ sở cho cảnh báo "kiểm sha trước khi cài") |
| Profile `desktop`: `node_modules/@nami/dsh-agent-teams` | `isSymlink=false`, `0.2.0-dev.0`, **133 tệp** (đếm đệ quy), `lib/tools.js` `e51734ba…`/213 715, `lib/client/ActivityPanel.js` `2407c22e…`/64 097, `WorkspaceActivity.module.css` `c7f2d5e5…`/3 579 |
| `package.json` của profile `desktop` | dependency `@nami/dsh-agent-teams` trỏ `file:E:/Project/Agent-Team/dist/vong-23/…tgz`; `@nanmicoder/dsh-agent-teams` vẫn còn `0.1.28`; `dsh.profile.bundles` CÓ `@nami/dsh-agent-teams` và KHÔNG có `@nanmicoder` |
| `E:/Project/ERP/.agent-teams/erp-erp/team.json` | 14 member / 7 `removed` / 107 task / phase `running` / **0** member có `routeOverride` |
| Ảnh panel | `docs/kiem-thu/desktop-vong-23-three-columns.png` + `desktop-vong-23-panel-crop.png` tồn tại |

## 4. Những chỗ chỉ ĐỌC MÃ (không chạy được trong card này)

- Thông điệp tool (`Member "…" route is now …`, `applied to the live session and saved`, các lỗi
  `reserved for the captain` / `has already been used` / `manual member cap`, `clear cannot be combined`):
  trích nguyên văn từ `packages/dsh-agent-teams/lib/tools.js` (:1270-1309, :1333-1395, :3112-3118) —
  KHÔNG gọi tool thật (0 boot, và tool cần captain thật).
- Lỗi provenance `… is not one the plugin owns (valid sources: captain, http, profile); nothing was written`:
  trích từ `packages/dsh-agent-teams/lib/members.js:1344` (nguồn là template literal `${what}`/`${shown}`);
  ví dụ `"alice"`/`"erp"` là của card A3 trong hợp đồng t147.
- CSS `1:2` + `max-height:56vh`: trích từ `docs/kiem-thu/t142-three-columns.md` §2 (đo trên byte phát hành)
  và audit t144; KHÔNG tự mở GUI để đo (Host kiểm soát phiên GUI).
- `Ctrl+R`: trích từ báo cáo §2.3 và `docs/bao-cao-telegram/ky-46.md:16` — quan sát của captain,
  không phải phép đo tự động; tài liệu đã ghi rõ ở mục 5.
- `error: profile "desktop" is managed exclusively by the Electron application` và
  `dsh: session "<uuid>" does not exist; omit --session-id to start a new Session`: trích từ
  `docs/kiem-thu/desktop-vong-21.md` §2 và `docs/kiem-thu/moi-truong.md:136` — không chạy lại vì
  trần 0 boot (mỗi lệnh là một lần khởi động CLI).

## 5. Quyết định trong lúc viết (báo lại captain)

1. Mail brief nhắc `docs/kiem-thu/desktop-vong-23.md` — tệp này **không tồn tại**; trong
   `docs/kiem-thu` chỉ có `desktop-vong-21.md` và hai ảnh `desktop-vong-23-*.png`. Tôi dùng
   `desktop-vong-21.md` (số đo boot trên bản copy ERP) + ảnh vòng 23, và ghi rõ nguồn trong tài liệu.
2. Tạo thư mục mới `docs/huong-dan/` (chưa từng có) — chỉ chứa tệp trong inScope.
3. `tools/check-doc-paths.mjs` chỉ quét `docs/bao-cao-agent-teams.md` và `docs/van-hanh/*.md`,
   KHÔNG quét `docs/huong-dan/` ⇒ lệnh verify vẫn EXIT 0 nhưng không chứng minh gì cho tài liệu mới;
   vì vậy tôi tự kiểm đường dẫn bằng script ở mục 2 (đó mới là bằng chứng cho A1).

## 6. Bàn giao (số đo trên byte cuối)

| Tệp | sha256 | bytes | dòng |
| --- | --- | --- | --- |
| `docs/huong-dan/dung-voi-erp.md` | `f54a570de6d1c3acf2042c7f4e8e9104d50837434e62ebe560607dddde592628` | 17466 | 256 |
| `docs/kiem-thu/t147-doc-erp.md` | (tệp này — hash tự tham chiếu, xem báo cáo gửi captain) | — | — |

`node tools/check-doc-paths.mjs` ⇒ EXIT 0, `SUMMARY files=5 paths=114 paths_missing=0 links=41 links_missing=0`.
