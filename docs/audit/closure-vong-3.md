# Audit closure vòng 3 (t31) — t27/t28/t29/t30 và verdict phát hành lần 2

Người audit: **audit-goat** (độc lập) · attempt `aab0ef60-93d2-4b6c-b1e9-b6586634c387` · 2026-10-31
CODE FREEZE đo lại: `lib/tools.js 7fde7bbc…3617` (179184 B) · `lib/members.js affd3bf9…f16d9` (77228 B) · `lib/state.js 3bdbbf7d…60631` (55938 B) · `lib/snapshot.js b0799634…29e533` (10994 B) · `lib/client.js d28532e7…45cc91` (191153 B) · `lib/client.js.map 70cb6e90…4c4841` (322244 B) · `package.json 92a64040…451f36` — **7/7 khớp hash captain gửi, không có writer khác**.
Phạm vi ghi: `docs/audit/closure-vong-3.md`, `docs/log/AUDIT.md`. Không sửa mã nguồn, `docs/TODO.md`, `.agent-teams/**`, profile desktop; không npm pack/publish.

## 1. Verdict

**Mã nguồn hiện tại: ĐẠT — đáng cài cho ERP.** **Artifact phát hành (tarball t29): KHÔNG ĐẠT — chưa dùng được.**
Cụ thể: cài ERP bằng đường **link/nguồn** `packages/dsh-agent-teams` thì dùng được ngay hôm nay; cài bằng tarball `tests/tmp/t29/nami-dsh-agent-teams-0.2.0-dev.0.tgz` thì **thiếu 2 tính năng đã đóng** (t28 vết lỗi provider, t30 `last_failure` trong `agent_teams_status`) vì tarball đóng băng ở `lib/tools.js f1e06dea…` trước t30 (C3).
⇒ **Có 1 điều kiện cứng trước khi phát hành**: `npm pack` lại + cài lại + boot kiểm. Không phải sửa mã.

## 2. C1 — t27 rollback drill: ĐẠT (đối chứng độc lập, không chạy lại boot)

`node tests/t27-rollback.mjs --analyze tests/tmp/e2e-t27rollback/2026-10-31T17-30-13-440Z` → **exit 0, 16/16 PASS**. Hai artifact cũ hơn (17-26-53, 17-28-52) ra exit 1 vì tiêu chí C5a lúc đó kỳ vọng sai; bản 17-30 là bản duy nhất đúng và **captain cũng đã tự chạy ra cùng kết quả** — không phải tôi tin lời.
Tôi đọc thẳng artifact (không qua `--analyze`) để kiểm 3 khẳng định then chốt:

| Khẳng định của t27 | Tôi đo lại trên artifact | Kết quả |
|---|---|---|
| 0.1.28 boot có 39 tool, KHÔNG có `agent_teams_set_member_route`; 0.2.0 có 40 tool, CÓ | `bootA.json` toolCount=40 set_member_route=true agent_teams=15 · `bootB.json` toolCount=39 set_member_route=**false** agent_teams=14 · `bootC.json` 40/true/15, cả 3 `exitCode=0` | ĐÚNG |
| 0.1.28 đọc được `team.json` do 0.2.0 ghi (có `routeOverride`) và không đổi một byte | `sha256(teamA.json)=sha256(teamAfterB.json)=20f5c16689f8e38e`, deep-equal JSON true; `routeOverride={provider:command-code-goat, model:deepseek/deepseek-v4.1-flash, source:captain, by:session-48118d85…}` trong khi `provider/model` khai báo vẫn `opencode-go` | ĐÚNG |
| Profile `agent-teams-test` sau drill: symlink → fork, manifest chỉ có `@nami`, `@nanmicoder` chỉ còn thư mục rỗng | `dependencies={"@nami/dsh-agent-teams":"link:E:/…/packages/dsh-agent-teams"}`, `bundles=[dsh-base,dsh-headless,@nami/dsh-agent-teams]`, `@nami` `isSymbolicLink=true` readlink→fork, `@nanmicoder` dir rỗng `[]` | ĐÚNG |

Ba điểm t27 nói tài liệu SAI — tôi kiểm độc lập, **cả ba đều đúng**:
(a) `dsh plugin --help` in nguyên văn "forwarding the remaining arguments to pnpm in the profile directory … add <pkg>, remove <pkg>" ⇒ `dsh plugin --profile <p> remove …` **là pnpm remove**, không phải lệnh gỡ bundle chuyên dụng.
(b) vì (a), bước `add @nanmicoder/dsh-agent-teams@0.1.28` cần registry; máy này rollback **offline** được vì đã có sẵn bản cũ tại `C:/Users/thang/.dsh/profiles/desktop/node_modules/@nanmicoder/dsh-agent-teams/package.json` (tôi chỉ `ls`, không sửa gì trong profile desktop).
(c) phiên MỚI trong workspace không phải captain ⇒ `agent_teams_status` trả `Error: you do not lead or belong to any active team yet` ở **cả** 0.1.28 (`bootB.streamResults`) lẫn 0.2.0 (`bootC.replyText`) — lỗi này **không do rollback**.
Tình trạng tài liệu lúc tôi chấm: `docs/van-hanh/di-migrate-va-rollback.md` **đã được t32 sửa** (mtime 2026-11-01T00:37:53+0700 = 17:37Z, 12 864 B): §5 nay là 4 bước thao tác tệp + offline copy + `--dump-config`, §7 gạch bỏ dòng "chưa chạy". **Còn 1 câu stale** → F1.

## 3. C2 — t28 + t30 (vết lỗi provider): ĐẠT

`node tests/t28-provider-failure.mjs` → **exit 0, 20/20** · `node tests/t30-status-last-failure.mjs` → **exit 0, 8/8**.
Đọc mã xác nhận DTO: `lib/tools.js:2237-2245` spread `last_failure` **ngay sau** `spawn_error` (:2233); các khoá cũ nguyên vẹn `name/role/provider/model/reasoning_effort/tool_policy/status/activity/active_provider/active_model/fallback_active` (:2212-2222) + `route_override` (:2223-2231) + `next_route` (:2232). Không đổi tên, không đổi kiểu khoá cũ.
**Mutation test tôi tự làm** (chứng minh suite không PASS giả): sửa `lib/tools.js:2237` `...member.lastFailure === undefined ? {} : {` → `...(member.lastFailure === undefined || true) ? {} : {` rồi chạy lại t30 → **exit 1, 2/8 PASS (6 fail)**, các lỗi đúng bản chất (`Cannot read properties of undefined (reading 'code')`, `false !== true`). Khôi phục từ bản backup: `sha256=7fde7bbc…3617` **trùng tuyệt đối** bản trước khi phá, chạy lại t30 → 8/8 exit 0. Không có thay đổi nào còn lại trong mã.

## 4. C3 — tarball t29 đã LỆCH mã hiện tại: PHẢI PACK LẠI

Hash 3 chiều (tarball ↔ bản đã cài ở profile `agent-teams-pack-test` ↔ nguồn hiện tại):

| Tệp | tarball t29 | đã cài trong pack-test | nguồn hiện tại | |
|---|---|---|---|---|
| `lib/tools.js` | `f1e06dea1738` 178 475 B | `f1e06dea1738` | **`7fde7bbc49db` 179 184 B** | LỆCH (t30) |
| `lib/members.js` | `9095fb8cdb15` 73 920 B | `9095fb8cdb15` | **`affd3bf99c59` 77 228 B** | LỆCH (t28) |
| `lib/state.js` | `d6ff2d32b51f` 55 303 B | `d6ff2d32b51f` | **`3bdbbf7d8f4e` 55 938 B** | LỆCH (t28) |
| `lib/snapshot.js` | `8050449e1541` 10 319 B | `8050449e1541` | **`b0799634615c` 10 994 B** | LỆCH (t28) |
| `lib/client.js` / `.map` | `d28532e722c0` / `70cb6e908543` | giống | giống | KHỚP |
| `package.json` | `92a6404071e4` | giống | giống | KHỚP |

⇒ Tarball và bản đã cài **khớp nhau nhưng cùng cũ**; 4 tệp lõi đã đổi sau khi pack. `t29 --analyze` vẫn PASS vì nó chấm artifact của lần chạy cũ, **không chấm tính thời sự của tarball** (đây là lý do phải có C3 chứ không tin t29).
Lệnh phát hành lại (chủ artifact chạy, không phải audit):
```
cd packages/dsh-agent-teams && npm pack --pack-destination tests/tmp/t29-repack
# kiểm 3 chiều sau khi pack:
#  1) sha256(tệp .tgz)            -> ghi vào TODO/báo cáo
#  2) tar -xzf <tgz> -C /tmp/x && sha256(/tmp/x/package/lib/tools.js) == sha256(lib/tools.js)  (7 tệp ở bảng trên)
#  3) cài vào profile sạch rồi boot: toolCount=40, có agent_teams_set_member_route, agent_teams_status trả last_failure khi member chết
```

## 5. C4 — chạy lại toàn bộ suite (tự chạy, exit code thật)

| Suite | exit | Kết quả | Suite | exit | Kết quả |
|---|---|---|---|---|---|
| t3-route-smoke | 0 | 18/18 | t24-auth-fence | 0 | 12/12 |
| t4-control-plane-smoke | 0 | (không in verdict, exit 0) | t28-provider-failure | 0 | 20/20 |
| t10-ui-bundle-smoke | 0 | 22/22 | t30-status-last-failure | 0 | 8/8 |
| t15-activate-member | 0 | 21/21 | t27 `--analyze` | 0 | PASS 16/16 |
| t20-erp-compat | 0 | 15/15 | t29 `--analyze` | 0 | PASS C1–C5, unproved none |
| t11 `--analyze` | 0 | PASS C1–C8 (11 check) | t18 `--analyze` | 0 | PASS C1–C9 |
| t21 `--analyze` | 0 | PASS A1–A7 | | | |

**13 suite/13 exit 0.** Không tìm thấy `.skip(`, `process.exit(0)`, `catch { }` rỗng hay TODO/FIXME trong 4 suite mới (grep 0 hit).

## 6. C5 — hồ sơ

- `docs/TODO.md`: **32 hàng, 32 id duy nhất, 0 trùng**; thực tế `VERIFIED=29 · CANCELLED=1 (t9) · IN_PROGRESS=2 (t31,t32)` = 32. Header dòng 5 ghi `VERIFIED=28` ⇒ **lệch 1** → F2.
- `node tools/dependency-report.mjs --out tests/tmp/t31-audit/DEPENDENCIES.md` → `tasks=32 realEdges=34 derivedEdges=17 waves=14 problems=0`, exit 0; nội dung: "Khong phat hien van de: khong chu trinh, khong canh treo…". (Tôi ghi ra `tests/tmp` để không đụng tệp ngoài phạm vi.)
- `node tools/check-doc-paths.mjs --summary` → `files=4 paths=46 paths_missing=0 links=40 links_missing=0`, exit 0. (Con số nhảy so với vòng trước vì dev-ui-goat đang sửa `docs/van-hanh/*.md` song song — nhiễu đồng thời, không phải defect; chạy 2 lần cùng kết quả.)

## 7. Phát hiện

| ID | Mức | Nội dung | file:dòng | Tái hiện |
|---|---|---|---|---|
| **F1** | blocker-phát-hành | Tarball `nami-dsh-agent-teams-0.2.0-dev.0.tgz` cũ hơn mã 4 tệp lõi ⇒ cài từ tarball là cài bản **thiếu t28+t30** | `tests/tmp/t29/*.tgz` vs `lib/{tools,members,state,snapshot}.js` | bảng §4; `tar -xzf <tgz> -C /tmp/x && sha256sum /tmp/x/package/lib/tools.js` ≠ `7fde7bbc…` |
| **F2** | low | `docs/TODO.md:5` header `VERIFIED=28` trong khi hàng thật 29 (32 hàng, không trùng) | `docs/TODO.md:5` | `node -e` đếm cột status: VERIFIED 29 / CANCELLED 1 / IN_PROGRESS 2 |
| **F3** | low | Runbook §7 còn câu "Auth fence của `/plan`: **không** có test cho `401` và `405`/`413`" — sai: `tests/t24-auth-fence.mjs` 12/12 đã phủ 401/403/405/413/409/503 | `docs/van-hanh/di-migrate-va-rollback.md:141` | `node tests/t24-auth-fence.mjs` → 12/12 exit 0 |
| **F4** | medium | UI **không** hiển thị vết lỗi provider: `lastFailure` 0 hit trong `lib/client/**` và 0 hit trong `lib/client.js`; NFR-KHANG-LOI-PROVIDER-01 mới đóng ở tầng tool, captain thấy nhưng panel thì không | `lib/client/{ActivityPanel,MemberControls}.js`, `lib/client.js` | `grep -rc "lastFailure\|last_failure" lib/client/*.js lib/client.js` → 0 |
| **F5** | info | `exports vẫn PASS 16/16 dù có 3 dòng "DOC SAI"`: mã chấm chỉ tính `rows`, dòng doc in riêng | `tests/t27-rollback.mjs:553-556` | đọc `analyse()`; `ok = rows.length>0 && rows.every(c=>c.ok)` |
| **F6** | info | Rác trong repo root: thư mục `%SystemDrive%/` và `ProjectAgent-Team.dsh-testprofilesagent-teams-testnode_modules` (31/10 21:51) — dấu vết lệnh shell nội suy biến hỏng | `E:/Project/Agent-Team/%SystemDrive%`, `…/ProjectAgent-Team.dsh-testprofiles…` | `ls -la '%SystemDrive%'` |

## 8. Điều kiện phát hành (ai làm gì)

1. **repack** (F1) — dev-build/captain: `npm pack` lại, kiểm 3 chiều theo lệnh §4, cập nhật hash mới vào `TODO` + báo cáo, rồi cài + boot 1 lần vào profile sạch (`agent_teams_status` phải trả `last_failure` khi member chết ⇒ chứng minh tarball mới thật sự có t28/t30).
2. **UI `last_failure`** (F4) — dev-ui: thêm hàng cảnh báo trong panel member (đọc `last_failure` từ snapshot/DTO), hoặc ghi rõ trong tài liệu là "chỉ thấy qua tool" và đóng NFR ở mức đó.
3. **docs** (F2, F3) — chủ `docs/TODO.md` (không phải audit): sửa 1 số ở header; xoá/gạch câu stale ở runbook §7.
4. **Dogfood phiên sống** vẫn OPEN (BUG-003): bằng chứng hiện có đều từ profile nháp (`agent-teams-test`, `agent-teams-pack-test`) — trước khi cài lên máy ERP thật, phải có 1 phiên thật với `agent_teams_set_member_route` trả `live-and-durable`.
5. **Dọn rác** (F6): xoá 2 thư mục ở repo root, kiểm script nào sinh ra (`grep -rn "SystemDrive" tools tests`).

**Trả lời trực tiếp câu captain hỏi:** bản `0.2.0-dev.0` **đáng cài cho ERP ngay nếu cài từ nguồn/link**; **chưa đáng nếu phát hành bằng tarball t29** — chỉ cần pack lại (ước tính 10 phút, không sửa mã) là đủ điều kiện cứng cuối cùng. Không có PASS giả ở 13 suite tôi tự chạy; hai điểm cần cảnh giác đã ghi là F5 (t27 PASS không bao hàm doc đúng) và F1 (t29 PASS không bao hàm tarball còn mới).
