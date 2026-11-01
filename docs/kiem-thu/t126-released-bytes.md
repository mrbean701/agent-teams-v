# t126 — Bộ byte PHÁT HÀNH (dist/vong-19) cài vào profile mới rồi boot thật

Mục đích: dogfood hiện là **symlink** trỏ về nguồn (`profiles/agent-teams-test`, isSymlink=true),
nên chưa lần nào chứng minh thứ sẽ giao cho người dùng chạy được. Test này cài từ đúng
`dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz` vào một profile MỚI (`agent-teams-rel19`)
rồi boot phiên thật trên **bản copy** `team.json` của đội ERP (14 member / 107 task).

## Cách chạy

```
node tests/t126-released-bytes-boot.mjs --fresh                    # A1 + 3 boot + 2 phép đột biến A3
node tests/t126-released-bytes-boot.mjs --analyze tests/tmp/t126   # chấm lại, 0 boot
node tests/t126-released-bytes-boot.mjs --negative tests/tmp/t126  # chỉ làm lại 2 phép A3
node tests/t126-released-bytes-boot.mjs --fresh --run-dir <dir>    # chạy tiếp run dir đã có
```

## Recipe profile (một lần, đã làm; test chỉ kiểm lại, không cài lại)

1. `%USERPROFILE%/.dsh/profiles/agent-teams-rel19/package.json` theo khuôn `agent-teams-pack18`:
   name `dsh-profile-agent-teams-rel19`, 3 bundle (`dsh-base`, `dsh-headless`, `@nami/dsh-agent-teams`),
   dependency `"@nami/dsh-agent-teams": "file:E:/Project/Agent-Team/dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz"`.
2. Chép 3 tệp vỏ profile từ `agent-teams-pack18` (`cordis.yml`, `cordis.patch.yml`, `pnpm-workspace.yaml`)
   — chỉ là cấu hình provider/credentials, không phải byte plugin.
3. `npm i --offline --legacy-peer-deps --no-audit --no-fund` trong thư mục profile → `added 1 package`.

## Bảng tiêu chí và số đo thật (run tests/tmp/t126/run-2026-11-01T02-44-25-038Z)

| Mục | Tiêu chí | Kết quả | Bằng chứng thô |
| --- | --- | --- | --- |
| A1 | cài từ đúng tgz, profile mới, 13 tệp bản cài khớp bảng đóng băng | PASS | `isSymlink=false`, `version=0.2.0-dev.0`, `lockResolved=file:E:/…/dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz`, 13/13 tệp khớp |
| A2 | boot thật trên BẢN COPY in đúng 2 tiêu đề + ≥3 dòng hồ sơ removed thật | PASS | `Members (7 present + 7 removed):`, `Removed (7):`, `Tasks (107):`; 7/7 tên removed thật + 7 dòng có `opencode-go-new/minimax-m3.1-flash-free`; chuỗi cũ `active +` và `Members (N):` vắng mặt |
| A3 | đối chứng âm trên BẢN SAO: lật 1 byte tgz và 1 byte bản đã cài đều FAIL | PASS | tgz flip@1124046 → `sha256 ca0ce701… != pinned 2770fbfc…` (độ dài 2 248 092 giữ nguyên); bản cài flip@4096 → `lib/tools.js sha256 d492f9b8… != frozen e51734ba…` |
| A4 | guard t103 trên bản cài tgz + 1 lần set hợp lệ ghi bền | PASS | guard ném đúng nguyên văn `…refused: source "erp" is not one the plugin owns (valid sources: captain, http, profile); nothing was written` và sha tệp không đổi; tool ghi `Member "ha-tang-2" route is now command-code-goat/deepseek/deepseek-v4-pro, reasoning high`; `routeOverride` trên bản copy có `source:"captain"`; deep-equal 14 member / 107 task = 0 problem |
| A5 | tệp ERP thật không bị đụng | PASS | sha256 `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e` / 1 533 117 B / mtimeMs `1792817593185.6294` trước = sau |
| A6 | nguồn `packages/dsh-agent-teams` không đổi 1 byte | PASS | 13 tệp giám sát, 0 tệp đổi; 13/13 còn khớp bảng đóng băng |
| A7 | suite có `--analyze` (0 boot) + `--negative` (đúng 2 phép A3), analyze trên artifact của mình EXIT 0 | PASS | `--analyze tests/tmp/t126` in cùng verdict, EXIT 0, marker `bootsThisInvocation=0`; tổng boot thật 3/4 |
| A8 | doc ghi số đo + giới hạn | PASS | tệp này |

## 13 tệp bản CÀI so với bảng đóng băng (14 hex đầu + bytes)

```
OK  lib/tools.js                        e51734baf4693cd3  213715
OK  lib/members.js                      50f558f8b207d874  102260
OK  lib/state.js                        56664c59ff400319   57508
OK  lib/snapshot.js                     a2a87e1b0c0b34ea   13986
OK  lib/index.js                        2d28e617f0683e42   45315
OK  lib/tool-names.js                   e3def5db908dcbd5     808
OK  lib/client.js                       9da18d9971a284e9  258432
OK  lib/client.js.map                   bbf88608f54e966f  404958
OK  lib/types/members.d.ts              c53250ab41bff8c3   31769
OK  lib/types/snapshot.d.ts             962f99a7bcb18b94    7627
OK  lib/types/tools.d.ts                41cfc56576ed8ffd    7546
OK  lib/client/ActivityPanel.module.css  53ea47c6d780cd9d   51837
OK  package.json                        92a6404071e457cc   10498
```

## Ghi chú về phép đo A2

Host cắt `tool_result` dài kiểu ĐẦU+ĐUÔI (`truncated=true`, stream còn 7 419 ký tự). Khối
member và `Removed (7):` nằm ở ĐẦU nên vẫn đọc được đủ; khối này đếm được 10 dòng bắt đầu
bằng `  - `, trong đó 7 dòng là hồ sơ removed THẬT (đúng tên trong team.json, đúng route
`opencode-go-new/minimax-m3.1-flash-free`), 3 dòng còn lại là dòng task bị cắt dính vào sau.
Vì vậy cổng chấm theo HEADER và theo 7 tên removed, KHÔNG khẳng định đủ 107 dòng task.

## Giới hạn

1. Fixture là **bản copy** `tests/tmp/t126/run-*/erp-copy/.agent-teams/erp-erp/team.json` (captainSessionId
   được ghi lại theo phiên mint), không phải dữ liệu ERP thật đang chạy; tệp gốc chỉ được đọc.
2. A2 khẳng định theo header + 7 dòng removed. Không khẳng định đủ 107 dòng task, vì Host cắt stream.
3. Test không chứng minh nhánh provider chết / fallback / degrade — chỉ chứng minh render roster, guard nguồn
   ghi và một lần đổi route bền vững trên bộ byte phát hành.
4. 3 boot thật cho một lần chạy `--fresh` (trần 4). Không cài lại profile trong lúc chấm (`--analyze` = 0 boot).
5. Phép đột biến A3 chỉ chạy trên bản sao trong `tests/tmp/t126/…/negative/`, không chạm profile `agent-teams-rel19`
   và không chạm `dist/vong-19`.
6. Đường dự phòng đọc transcript (`extractStatusRender`) KHÔNG được kích hoạt trong lần chạy này — A2 đo
   trên stream 7 419 ký tự (đã bị Host cắt). Nghĩa là fallback đó chưa có bằng chứng chạy thật, và cổng chỉ
   khẳng định đúng những gì stream in ra.

## Ghi chú thêm (A3 và phạm vi bằng chứng)

- Hai phép đột biến A3 chạy trên BẢN SAO trong `tests/tmp/t126/run-*/negative/` (brief cho phép: bản sao hoặc profile nháp),
  không chạm `dist/**`, `packages/**`, cũng không chạm profile `agent-teams-rel19`. Phép (a) chạy ĐÚNG hàm kiểm của A1
  trên tệp tgz đã lật byte (cùng độ dài) nên A1 FAIL vì sai sha — không tốn thêm lượt cài profile.
- `runtimeSetup` chỉ xuất hiện sau khi một member thật sự activate, nên lần chạy này (chỉ status + một lần đổi route)
  KHÔNG chứng minh nhánh đó; route đổi xong hiệu lực ở lần member khởi động kế tiếp (text tool cũng nói đúng như vậy).
- Profile `agent-teams-rel19` là bản cài TĨNH từ tgz: sửa nguồn `packages/dsh-agent-teams/**` sẽ KHÔNG tự chảy vào profile.
  Muốn kiểm byte mới phải cài lại (hoặc đóng gói lại rồi cài), và A1 sẽ báo lệch bảng đóng băng nếu tgz đổi.
