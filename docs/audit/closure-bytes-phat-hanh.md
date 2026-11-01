# Closure audit — bộ byte phát hành `dist/vong-19` (t127)

Mốc chấm: 2026-11-01T03:05:21Z (xem mục 9). Người chấm: audit-goat (độc lập, không phải người viết mã).
Đối tượng: `dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz` — bộ byte được tuyên bố là bản phát hành vòng 19 (t121), do t126 đóng gói đường dẫn và kiểm bằng cổng `tests/t126-released-bytes-boot.mjs`.

## 0. Verdict

**BỘ BYTE PHÁT HÀNH `dist/vong-19` PHÁT HÀNH ĐƯỢC — CÔNG BỐ CÓ ĐIỀU KIỆN.**

- Không có finding high/blocker. Artefact tự khớp bảng đóng băng, bản cài trong profile mới khớp 13/13 tệp, render `agent_teams_status` trên dữ liệu ERP thật in đúng hai tiêu đề mới.
- Điều kiện công bố: (a) dùng đúng đường dẫn `dist/vong-19/…tgz`, không chép artefact sang chỗ khác (VB-F2); (b) người vận hành tự kiểm sha256 + byte trước khi cài; (c) verdict hết hiệu lực ngay khi bất kỳ tệp nào của `dist/vong-19` hoặc `packages/dsh-agent-teams/lib/**` đổi sau mốc ở mục 9.
- Sửa trước khi công bố: VB-F1 (tài liệu người dùng chưa nêu giới hạn render không tái lập byte-exact) và VB-F3 (ghi rõ `--analyze` chấm trạng thái SỐNG, không chấm ảnh chụp run dir).

## 1. Bảng hạng mục

| Mã | Nội dung | Kết quả | Bằng chứng |
| --- | --- | --- | --- |
| B0 | chạy lại cổng của t126 ở chế độ `--analyze` | ĐẠT — EXIT 0, `verdict PASS — proved A1..A8 — unproved (none)`, 0 boot | `tests/tmp/b0-t126.log` (58 dòng) |
| B1 | tự cài artefact vào profile MỚI rồi đo 13 tệp | ĐẠT — profile `agent-teams-rel19-audit` (không tồn tại trước lượt này), không symlink, lock trỏ `dist/vong-19`, 13/13 SAME, 133 tệp | `tests/tmp/t127/b1-install.json` |
| B2 | boot thật, đọc render `agent_teams_status` trên bản sao `team.json` ERP | ĐẠT — hai tiêu đề nguyên văn, 7/7 hồ sơ removed, footer `Team id: erp-erp · phase: running`; 24 793 ký tự đầu trùng tuyệt đối với render t126; lệch 8 ký tự (VB-F1) | `tests/tmp/t127/b2b-full-status.txt` (49 177 ký tự) |
| B3 | ≥3 phép đột biến kiểu mới trên bản sao/profile nháp | ĐẠT — 3/3 làm cổng ĐỎ ở A1, phục hồi xong cổng xanh lại | `tests/tmp/t127/b3-mutations.json` + 3 log `gate-m*.log` |
| B4 | hồi quy 6 suite sau khi phục hồi | ĐẠT — 6/6 EXIT 0, cây nguồn 33 206 tệp không đổi tệp nào | `tests/tmp/t127/b4-regression.json` |
| B5 | chấm cơ chế verify của hợp đồng (câu hỏi quy trình của captain) | ĐẠT về kết luận: cách chuyển verify thành acceptance B0 là ĐÚNG; đề xuất giữ nguyên luật (VB-F5) | mục 6 + `tests/tmp/t127/b5-contract.log` |

## 2. Số đo artefact (tự đo bằng `node:crypto` + `tar`, không dùng `--analyze`)

- `dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz` sha256 `2770fbfc4070eb80cbe419134f1c44ffed8e9c6e4d9703d0d775b4af3cc6251e` · **2 248 092 byte** · `tar -tzf` **133 entry**, **0 entry thư mục**, 0 rác (`node_modules`, `package/tests/`, `.tgz` lồng, `.pid`, `package/tools/`).
- payload ↔ nguồn `packages/dsh-agent-teams/lib/**`: 13 tệp đóng băng SAME tuyệt đối (bảng dưới), bản cài trong profile mới cũng SAME 13/13 ⇒ ba chiều nguồn = payload = bản cài.
- `package.json` trong gói: `@nami/dsh-agent-teams` `0.2.0-dev.0`, 0 `dependencies`, 24 `peerDependencies` (không đóng gói phụ thuộc).

| Tệp | sha256 (16 hex) | byte |
| --- | --- | --- |
| `lib/tools.js` | `e51734baf4693cd3` | 213 715 |
| `lib/members.js` | `50f558f8b207d874` | 102 260 |
| `lib/state.js` | `56664c59ff400319` | 57 508 |
| `lib/snapshot.js` | `a2a87e1b0c0b34ea` | 13 986 |
| `lib/index.js` | `2d28e617f0683e42` | 45 315 |
| `lib/tool-names.js` | `e3def5db908dcbd5` | 808 |
| `lib/client.js` | `9da18d9971a284e9` | 258 432 |
| `lib/client.js.map` | `bbf88608f54e966f` | 404 958 |
| `lib/types/members.d.ts` | `c53250ab41bff8c3` | 31 769 |
| `lib/types/snapshot.d.ts` | `962f99a7bcb18b94` | 7 627 |
| `lib/types/tools.d.ts` | `41cfc56576ed8ffd` | 7 546 |
| `lib/client/ActivityPanel.module.css` | `53ea47c6d780cd9d` | 51 837 |
| `package.json` | `92a6404071e457cc` | 10 498 |

- Profile `C:/Users/thang/.dsh/profiles/agent-teams-rel19-audit`: `isSymlink=false`, `version=0.2.0-dev.0`, `lockResolved=file:E:/Project/Agent-Team/dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz`, 133 tệp cài, 13/13 khớp bảng trên. Profile do tôi tạo trong lượt này từ artefact, KHÔNG dùng lại profile `agent-teams-rel19` của t126.
- ERP: `E:/Project/ERP/.agent-teams/erp-erp/team.json` `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e` / 1 533 117 B / `mtimeMs` 1792817593185.6294 — KHÔNG đổi trước và sau toàn bộ lượt, kể cả sau 2 lần boot (mọi boot chạy trên bản sao trong `tests/tmp/t127/boot-ws`).

## 3. B2 — boot thật và render

- boot #2 (boot quyết định): `dsh --profile agent-teams-rel19-audit`, EXIT 0, 174 558 ms, session `session-41579c35-158b-46e2-8614-8aeda1b4001f`, gọi `agent_teams_status` trên bản sao dữ liệu ERP đã rebind captain (bản copy chưa rebind thì tool trả `you do not lead or belong to any active team yet` — boot #1, 13 991 ms).
- Text tool trả 7 419 ký tự ở luồng sự kiện (bị cắt ở ~8 192 B) nên tôi đọc transcript để lấy ĐẦY ĐỦ 49 177 ký tự. Header nguyên văn: `Members (7 present + 7 removed):` · `Removed (7):` · `Tasks (107):`; footer `Team id: erp-erp · phase: running`.
- Đối chứng chéo với render của chính t126 (`session-b15f431e-817a-4d51-b46b-f69e5985fd73`, 49 169 ký tự): **24 793 ký tự đầu TRÙNG TUYỆT ĐỐI** (trọn khối Members + Removed + header Tasks). Toàn bộ khác biệt: 8 ký tự nằm trong blob `Supplemental observations (original verdict unchanged)` của task t4 (`lib/tools.js:3380`) — bản của tôi in literal `\n`, bản t126 in newline thật. Dữ liệu hai bản copy chỉ khác 2 trường volatile mà chính suite t126 khai (`$.members[8].status` idle↔working, `$.tasks[106].updatedAt`) ⇒ VB-F1.
- Không còn dấu tích của tiêu đề cũ: không có `active + `, không có dạng một số `Members (N):`.

## 4. B3 — ba phép đột biến (kiểu mới, không lặp vòng 5–19)

Bản sao dùng để đột biến: `tests/tmp/t127/gate-copy.mjs` (bản sao cổng t126, chỉ sửa 2 dòng đường dẫn `:23` `REPO` và `:29` `PROFILE`) + profile nháp của tôi; baseline `--analyze` EXIT 0 `PASS A1..A8`.

| Mã | Kiểu | Đột biến | Cổng bắt | Exit + thông điệp |
| --- | --- | --- | --- | --- |
| M1 | đổi DANH TÍNH bản cài | thay `node_modules/@nami/dsh-agent-teams` bằng junction tới `packages/dsh-agent-teams` | A1 | EXIT 1 · `installed package IS a symlink (dogfood, not release bytes)` |
| M2 | lock trỏ tệp KHÁC nhưng CÙNG BYTE | chép artefact ra `tests/tmp/t127/decoy/rel19-copy.tgz` (sha trùng khít), sửa lock sang đó | A1 | EXIT 1 · `lock resolved file:E:/…/tests/tmp/t127/decoy/rel19-copy.tgz does not point at dist/vong-19` |
| M3 | mất một tệp trong bản cài | xoá `lib/types/tools.d.ts` khỏi `node_modules` | A1 | EXIT 1 · `BAD lib/types/tools.d.ts undefined undefined` + `lib/types/tools.d.ts is missing`, không crash |

Cả ba đều phục hồi (cây bản cài + `pnpm-lock.yaml` không đổi), chạy lại cổng: EXIT 0 `PASS A1..A8`. Phép M2 chứng minh cổng khẳng định ĐƯỜNG DẪN phát hành chứ không chỉ hash — xem VB-F2.

## 5. B4 — hồi quy và bất động cây nguồn

- `tests/t126-released-bytes-boot.mjs --analyze` trên run dir t126: EXIT 0 · `PASS proved A1..A8`.
- `tests/t98-render-coverage.mjs --strict`: EXIT 0 · `SUMMARY tools=16 fields=112 reached=105 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 payload_contract_failures=0 allow_listed=7 allow_list_line_problems=0`.
- `tests/t107-…` 13/13 · `tests/t113-…` 38/38 · `tests/t114-…` 16/16 (`frozen=13 helperRecords=13 problemsOnDrift=2`) · `tests/t115-…` 43/43 · `tests/t120-…` EXIT 0. Sáu suite, tất cả EXIT 0.
- Cây `packages/dsh-agent-teams`: 33 206 tệp trước = 33 206 tệp sau, `changed []` (so sha256 từng tệp) ⇒ đột biến không rò vào nguồn.

## 6. B5 — phán quyết về cơ chế verify của hợp đồng

- `tools/check-contract.mjs` mục (a) `verify targets exist` chỉ kiểm TỒN TẠI tệp, không chạy lệnh (`:173-205 checkVerifyFiles`); nhánh miễn trừ `planned by this task` chỉ đọc `task.deliverables` (`:165-171 plannedByTask`).
- Card t127 tạo lúc `2026-11-01T02:37:44.869Z`, còn `tests/t126-released-bytes-boot.mjs` có mtime `2026-11-01T02:44:09.242Z` (41 110 B) ⇒ lúc dispatch, verify trỏ tệp CHƯA tồn tại. Tái lập trên bản sao ledger: `node tools/check-contract.mjs --state tests/tmp/t127/state --task t127` ⇒ EXIT 1, `FAIL (a) verify targets exist — missing: tests/t126-released-bytes-boot-ghost.mjs — nearest real file: tests/t126-released-bytes-boot.mjs`, 5/6 mục.
- Kết luận: việc captain biến lệnh đó thành acceptance **B0** (chạy cổng `--analyze` sau khi t126 xong) là cách đúng. Cổng không chạy lệnh, nên một `verify` trỏ tệp do dependency tạo = 0 tín hiệu. Đề xuất: GIỮ NGUYÊN luật hiện tại; nếu tương lai cần verify trễ thì phải là khai báo tường minh (ví dụ `verifyDeferred`) kèm kiểm chéo task dependency đã `completed` và có đường dẫn đó trong `changedPaths` — không mở đường cho verify trang trí.

## 7. Findings

- **VB-F1 — medium — render `agent_teams_status` không tái lập byte-exact giữa hai phiên trên cùng dữ liệu.** Hai bản copy chỉ khác 2 trường volatile (suite t126 tự khai), vậy mà text cuối khác 8 ký tự trong blob `Supplemental observations (original verdict unchanged)` của task t4: bản tôi in literal `\n`, bản t126 in newline thật. Chủ sở hữu: dev-runtime-goat (`packages/dsh-agent-teams/lib/tools.js:3380` — chuỗi `const evidence = task.supplemental_evidence ? …` ghép thẳng `task.supplemental_evidence`, không chuẩn hoá escape). Tái hiện: so `tests/tmp/t127/b2b-full-status.txt` với `tests/tmp/t127/b2-t126-status.txt`, ký tự lệch đầu tiên ở offset 24 793. Ảnh hưởng: không sai nội dung, nhưng mọi test golden theo byte trên TOÀN VĂN render là không an toàn; test chỉ nên ghim phần đầu/khối ổn định.
- **VB-F2 — low — A1 khẳng định ĐƯỜNG DẪN phát hành, không chỉ byte.** Decoy cùng sha256/byte nhưng khác thư mục vẫn bị A1 bắt (`tests/t126-released-bytes-boot.mjs:307`). Đây là thiết kế đúng cho bản phát hành, nhưng hệ quả cần ghi vào tài liệu: chép artefact sang chỗ khác rồi cài từ đó ⇒ cổng ĐỎ dù byte đúng; và ngược lại, mỗi vòng phát hành phải sửa hằng `dist/vong-NN` trong cổng. Chủ sở hữu: người làm cổng phát hành kế tiếp.
- **VB-F3 — medium — `--analyze` của cổng chấm trạng thái SỐNG, không chấm ảnh chụp run dir.** `evaluate()` (`tests/t126-released-bytes-boot.mjs:567-586`) luôn đo lại `checkArtifact(TGZ)` + `checkInstalledTree(PROFILE_INSTALLED())` + `profileChecks(dshHome)`; `artifact.json` do lần chạy FRESH ghi ra KHÔNG được đọc ở chế độ analyze. Bằng chứng: bản sao cổng của tôi trỏ profile mới `agent-teams-rel19-audit` vẫn `--analyze` run dir của t126 và ra EXIT 0 `PASS A1..A8`. Hệ quả: (i) verdict analyze cũ KHÔNG chứng minh profile tại thời điểm run; (ii) profile bị trỏ lại chỗ khác về sau sẽ làm analyze đỏ, đúng như V19-F6 đã gặp. Đề xuất: ghi ảnh chụp (realpath + 13 hash bản cài) vào `artifact.json` và đối chiếu ảnh chụp ↔ sống khi analyze; thiếu ảnh chụp ⇒ EXIT 2 fail-closed. Chủ sở hữu: dev-runtime-goat + captain.
- **VB-F4 — info — không chạy lại phép (c) `present` → `active` trong bản cài.** Trần 2 boot của lượt này đã dùng hết cho B2 (boot #1 hỏng rebind, boot #2 quyết định) và captain đã tự làm phép đột biến tương đương trên artefact. Vì vậy tôi KHÔNG khai phép đó là bằng chứng của mình; lớp lỗi này được chấm gián tiếp qua chuỗi A2 (đọc `snap-01` + text boot) và qua B0.
- **VB-F5 — info — luật (a) của `check-contract` là kiểm tồn tại, không phải kiểm chạy.** Xem mục 6; khuyến nghị giữ nguyên và không thêm cơ chế miễn trừ cho tệp do dependency tạo.

## 8. Giới hạn của lượt chấm

- Chỉ 2 boot (trần của captain); không chấm được phép (c) ở B3 (VB-F4).
- Không kiểm trên Windows khác/máy khác; đường dẫn tuyệt đối `E:/…` và `C:/Users/thang/.dsh` là môi trường của lượt này.
- Không chấm được hành vi của panel Web UI (render DTO status/snapshot là đường khác với text tool; vòng 19 đã ghi nhận DTO vẫn trả spine thay vì route hiệu lực).
- Không chấm `dist/` như một kho phát hành nhiều vòng: chỉ chấm đúng một tệp `dist/vong-19/…tgz` + profile cài từ nó.

## 9. Điều kiện hết hiệu lực

- Verdict gắn với ĐÚNG bộ byte `2770fbfc4070eb80cbe419134f1c44ffed8e9c6e4d9703d0d775b4af3cc6251e` / 2 248 092 B / 133 entry tại `dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz`, mốc chấm `2026-11-01T03:05:21Z`.
- Hết hiệu lực ngay khi: tệp artefact bị pack lại/di chuyển/đổi tên; bất kỳ tệp nào trong 13 tệp đóng băng ở mục 2 đổi trong nguồn; hoặc có task mới sửa `packages/dsh-agent-teams/lib/**` sau mốc trên.
- Hết hiệu lực riêng cho phần render: mọi thay đổi vào `lib/tools.js` phần dựng text status (mốc neo `lib/tools.js:3328`, `:3373`, `:3376`) phải được chấm lại bằng boot thật trên dữ liệu ERP.