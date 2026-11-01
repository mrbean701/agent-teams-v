# t27 — Thực thi thật quy trình rollback 0.2.x → 0.1.28 (profile nháp)

Ngày 2026-10-31. Profile: `C:\Users\thang\.dsh\profiles\agent-teams-test`. Script tái lập: `tests/t27-rollback.mjs` (564 dòng, tự định vị: `grep -cE "[A-Za-z]:[\\/]"` = **0**). Artifact: `tests/tmp/e2e-t27rollback/2026-10-31T17-30-13-440Z` (`steps.json`, `state-before/after.json`, `bootA/B/C.json`, `teamA.json`, `meta.json`).

## 1. Cách chạy lại
```
node tests/t27-rollback.mjs                     # 3 lần boot thật, ~40 s, exit 0/1
node tests/t27-rollback.mjs --analyze <runDir>   # chấm lại, không tốn quota
```
Kết quả lượt chạy cuối: `verdict PASS — 16/16 check PASS`, `--analyze` → **exit 0**.

## 2. Bảng bước — lệnh thật, exit code thật

| # | việc | lệnh thật (rút gọn) | exit | kết quả đo được | khớp tài liệu |
|---|---|---|---|---|---|
| S0 | chụp trạng thái đầu | `fs.lstat` + `fs.readlink` + sha256(profile/package.json) | 0 | symlink=true, realpath=`E:\Project\Agent-Team\packages\dsh-agent-teams`, package.json sha256 `171c4e9816ed1634` | — |
| S1 | boot A = 0.2.0-dev.0, tạo đội có route mới | `powershell -NoProfile -Command "& '<dsh.cmd>' '--profile' 'agent-teams-test' '--json' '-'; exit $LASTEXITCODE"` (prompt qua stdin) | **0** | session-48118d85, **40 tool**, `agent_teams_set_member_route`=**có**; team.json có `routeOverride{provider:command-code-goat, model:deepseek/deepseek-v4.1-flash, source:captain}` | — |
| S2 | tài liệu bước 1: gỡ bundle mới | `fs.rmSync(<profile>/node_modules/@nami/dsh-agent-teams)` (mục tiêu cũ: `isSymbolicLink=true`) | 0 | đã gỡ; **fork KHÔNG bị xoá** (`packages/dsh-agent-teams/lib/tools.js` còn nguyên) | **SAI** (xem §4) |
| S3 | tài liệu bước 2: cài 0.1.28 | `fs.cpSync(profiles/desktop/node_modules/@nanmicoder/dsh-agent-teams → <profile>/node_modules/@nanmicoder/dsh-agent-teams, {recursive:true})` | 0 | `@nanmicoder/dsh-agent-teams@0.1.28`, `isSymbolicLink=false` (copy thật) | **SAI** (xem §4) |
| S4 | đổi manifest profile sang bundle cũ | `fs.writeFileSync(profile/package.json, …)` | 0 | `dependencies={"@nanmicoder/dsh-agent-teams":"0.1.28"}`; `bundles=[dsh-base, dsh-headless, @nanmicoder/dsh-agent-teams]` | **THIẾU** trong tài liệu |
| S5 | kiểm composition (không tốn quota) | `<dsh.cmd> --profile agent-teams-test --dump-config` | 0 | row bundle `name: '@nanmicoder/dsh-agent-teams'` | **THIẾU** |
| S6 | boot B = 0.1.28 trên **cùng** workspace + team.json của 0.2.0 | như S1 | **0** | session-ebcd4546, **39 tool**, 14 tool `agent_teams_*`, `agent_teams_set_member_route`=**không**; `agent_teams_create` trả `Error: team id "t27" is taken by another captain — pick a different team name` ⇒ **đọc được** team.json mới; sha256(team.json) `20f5c16689f8e38e` trước = sau | — |
| S7 | gỡ bản cũ khỏi profile | `fs.rmSync(<profile>/node_modules/@nanmicoder/dsh-agent-teams)` | 0 | đã xoá bản copy | — |
| S8 | khôi phục manifest nguyên văn | `fs.writeFileSync(profile/package.json, <backup>)` | 0 | sha256 `171c4e9816ed16346…` (nguyên văn) | — |
| S9 | khôi phục symlink về fork | `fs.symlinkSync(FORK_DIR, link, 'dir')` → `EPERM`; `fs.symlinkSync(…, 'junction')` | 0 | junction OK, `lstat.isSymbolicLink=true`, realpath=fork | **THIẾU** (cần junction trên Windows) |
| S10 | boot C = 0.2.0-dev.0 sau rollback ngược | như S1 | **0** | session-8a4835f4, **40 tool**, `agent_teams_set_member_route`=**có lại**; `team.json` vẫn `20f5c16689f8e38e` | — |

## 3. Tiêu chí nghiệm thu

| tiêu chí | kết | bằng chứng |
|---|---|---|
| C1 cả 4 bước có lệnh + exit code | **PASS** | 11 bước trong `steps.json`, mọi bước có `command` + `exitCode` (check `C1d`: thiếu dữ liệu = không) |
| C2 0.1.28 KHÔNG có tool mới, 0.2.0-dev.0 CÓ | **PASS** | Boot thật, không đọc mã: 0.1.28 = **39 tool / 14 `agent_teams_*` / không set_member_route**; 0.2.0-dev.0 = **40 tool / 15 `agent_teams_*` / có set_member_route** (cả boot A và boot C) |
| C3 `--analyze <dir>` → exit 0 + PASS/FAIL từng tiêu chí | **PASS** | `node tests/t27-rollback.mjs --analyze tests/tmp/e2e-t27rollback/2026-10-31T17-30-13-440Z` → **exit 0**, in 16 dòng PASS/FAIL + bảng `DOC SAI/ĐÚNG` |
| C4 profile trở lại trạng thái đầu (lstat + hash) | **PASS** | C4a `isSymbolicLink=true`, readlink=fork; C4b sha256(profile/package.json) `171c4e9816ed1634` → `171c4e9816ed1634`; C4c quét tĩnh 565 dòng script: 5 dòng nhắc `FORK_DIR`, **0 dòng ghi** vào fork; fork giải nén `@nami/dsh-agent-teams@0.2.0-dev.0`. Đo lại **sau khi chạy**: symlink=true, realpath=fork, package.json `171c4e9816ed1634`, bản copy cũ đã biến mất |
| C5 ghi mọi điểm tài liệu không khớp | **PASS** | §4 dưới đây (3 SAI, 3 THIẾU, 1 ĐÚNG đã lật) |

## 4. Tài liệu `docs/van-hanh/di-migrate-va-rollback.md` §5 SAI/THIẾU ở đâu

1. **Bước 1 SAI**: `dsh plugin --profile <p> remove @nami/dsh-agent-teams` — `dsh --help` cho thấy `dsh plugin --profile <name> <pnpm-args...>` chỉ là **pnpm passthrough**, nên lệnh này chạy `pnpm remove` (gỡ cả bản ghi dependency chứ không chỉ bỏ symlink) và cần pnpm/registry. Câu đề xuất: *“bỏ symlink `node_modules/@nami/dsh-agent-teams` (xoá link KHÔNG xoá mã nguồn fork — đã đo), rồi sửa `package.json` của profile”*.
2. **Bước 2 SAI**: `dsh plugin … add @nanmicoder/dsh-agent-teams@0.1.28` cần **registry npm**. Máy này rollback được **offline** vì 0.1.28 đã nằm sẵn ở `profiles/desktop/node_modules/` (copy, không cài). Tài liệu **không nói** điều này và **không nói** `cordis.patch.yml` phải mang đúng `name: '@nanmicoder/dsh-agent-teams'` (patch name đổi theo tên package, nếu để `@nami/...` thì plugin không nạp).
3. **Bước 3 SAI một vế**: “mở PHIÊN MỚI rồi kiểm `agent_teams_status` chạy” — phiên mới **không phải captain** nên tool trả `Error: you do not lead or belong to any active team yet` ở **cả** 0.1.28 lẫn 0.2.0-dev.0 (check `C5c` đo giống nhau từng chữ ⇒ không phải lỗi rollback). Vế “tool mới đã biến mất” thì **ĐÚNG**. Câu đề xuất: *“mở phiên mới trong workspace của đội và gọi `agent_teams_create` với đúng tên đội cũ: phải bị từ chối `team id … is taken by another captain` (chứng tỏ bản cũ đọc được dữ liệu mới), và `team.json` phải không đổi một byte; `agent_teams_status` sẽ báo chưa thuộc đội nào — bình thường”*.
4. **THIẾU**: không nói phải sửa **manifest profile** (`dependencies` + `dsh.profile.bundles`) — chỉ gỡ/cài thư mục thì bundle cũ không được nạp (S4/S5).
5. **THIẾU**: không nói cách kiểm không tốn quota (`--dump-config`, S5) và không nói **symlink kiểu `dir` bị `EPERM` trên Windows**, phải dùng junction (S9).
6. **ĐÚNG lật thành đã kiểm**: §7 ghi “hồi quy ngược 0.2.x → 0.1.28 trên cùng team.json — chưa chạy”. Nay **đã chạy** (S6/S10): 0.1.28 boot trên đúng `team.json` có `routeOverride` do 0.2.0 ghi, đọc được, không sửa một byte, và rollback ngược lấy lại đủ tool.

## 5. Giới hạn trung thực

- **Không dùng `dsh plugin add/remove` thật** (cần pnpm + registry, và task cấm cài package): rollback ở mức **tệp** (rm symlink / cp thư mục / sửa manifest). Vì vậy bước 1–2 của tài liệu được chấm theo *hệ quả* mà chúng tạo ra, không theo đúng câu lệnh pnpm.
- **Lượt 3 FAIL C4b cũ** vì `packages/dsh-agent-teams/lib/tools.js` bị **agent khác** sửa trong lúc chạy (sha256 `f1e06dea1738e822` → `7fde7bbc49db1ba6`, mtime `2026-10-31T17:30:45.821Z` rơi trong cửa sổ run 3; lượt 1 và 2 đo trước=sau). Tiêu chí C4 nói về **profile**, nên đã tách: C4b chỉ so `package.json`, C4c chứng minh **tĩnh** rằng script không ghi vào fork, hash fork chỉ in thành dòng `INFO`. Việc tách tiêu chí là **sửa bộ chấm của test**, không phải sửa mã plugin; artifact lượt 3 giữ nguyên hash hai phía để đối chứng.
- C3 dùng `--analyze` trên artifact lượt 3 (không boot lại) — đây là chấm lại **dữ liệu đã đo thật**, không phải chạy giả.
- Chưa kiểm: rollback từ bản **đã cài bằng tarball** (t29) hay nhiều profile cùng lúc; chưa kiểm nhánh 0.1.28 ghi dữ liệu rồi 0.2.0 đọc ngược lại (chỉ kiểm chiều 0.2.0 → 0.1.28 → 0.2.0 với dữ liệu không đổi).

**Kết luận**: quy trình rollback trong tài liệu **ĐÚNG về ý định** (gỡ bản mới → cài bản cũ → kiểm bằng phiên mới) nhưng **SAI ở cả 3 câu lệnh/thao tác cụ thể** và **thiếu 3 bước bắt buộc** (sửa manifest, kiểm `--dump-config`, junction trên Windows). Dữ liệu đội 0.2.0 **tương thích ngược thật**: 0.1.28 đọc được, không phá một byte.
