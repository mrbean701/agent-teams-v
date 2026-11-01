# t84 — Pack vòng 11 (sau t81/t83; cổng t83+t86; t86 đổi nhánh scheduler)

Chạy: `node tests/t84-pack.mjs` (pack ×2 → giải nén → cài profile sạch → 3 chiều → probe export → boot) và
`node tests/t84-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t84` (chấm lại, KHÔNG tốn quota). Suite tự dừng
nếu nguồn `lib/**` không parse được, cổng task chưa completed, hoặc drift ≠ 0; nó không tự sửa gì.

## Artefact phát hành
`packages/dsh-agent-teams/tests/tmp/t84/nami-dsh-agent-teams-0.2.0-dev.0.tgz`
- sha256 `220a6da96f82113013040d02db8bd9039dce891eccf5a5bb20e313c62be37db1` · 2 242 952 B · 133 entry · 0 entry thư mục
- 2 lần `npm pack` độc lập (t84 và t84/repack) cho CÙNG sha256 + cùng size + cùng số entry
- run dir `tests/tmp/t84/run-2026-10-31T21-24-44Z` · log `tests/tmp/t84-run3.log` · **EXIT=0, 21/21 check PASS**

## Bảng 3 chiều 12/12 SAME (payload tarball ↔ bản cài ↔ nguồn)
| tệp | sha256 (12) | bytes |
|---|---|---|
| lib/tools.js | 75800e15fce2 | 196 084 |
| lib/members.js | 4f818b73803d | 100 367 |
| lib/state.js | 7b49f5ab1d46 | 56 282 |
| lib/snapshot.js | a2a87e1b0c0b | 13 986 |
| lib/index.js | 2d28e617f068 | 45 315 |
| lib/tool-names.js | e3def5db908d | 808 |
| lib/client.js | 9da18d9971a2 | 258 432 |
| lib/client.js.map | bbf88608f54e | 404 958 |
| lib/types/members.d.ts | c53250ab41bf | 31 769 |
| lib/types/snapshot.d.ts | 962f99a7bcb1 | 7 627 |
| lib/client/ActivityPanel.module.css | 53ea47c6d780 | 51 837 |
| package.json | 92a6404071e4 | 10 498 |

## Bằng chứng từng mục
- Cổng: `t83=completed` + `t86=completed`, đọc trước VÀ sau mỗi lần pack; hash 12 tệp bằng `node:crypto`, ASSERT chuỗi
  64 ký tự trước khi in SAME; drift trước pack = 0, sau pack = 0, sau boot = 0.
- Cài `npm i --offline --no-audit --no-fund --legacy-peer-deps <tgz>` vào profile MỚI `agent-teams-pack10`:
  `lstat.isSymbolicLink=false`, realpath trong profile, package-lock ghi `file:`.
- `tar -tzf` (strip CRLF): 133 entry, 0 entry thư mục, 6/6 tệp bắt buộc, 0 node_modules / 0 package-tests / 0 .tgz lồng / 0 .pid.
- Probe export trên bản ĐÃ CÀI: **19/19** named export nạp thật, gồm `members.js export selectionFromMember` và
  `tool-names.js export CAPTAIN_TOOL_NAMES` (log `tests/tmp/t84-exports.log`). Trong lượt pack C10 assert 18 tên;
  `selectionFromMember` thêm vào danh sách NGAY SAU đó và chứng minh riêng bằng probe trên cùng bản cài (không pack lại),
  nên `--analyze` vẫn 21/21 trên đúng artefact này.
- Boot thật headless (profile pack10): **exit 0**, `session-5897b833-05a0-4c43-8b93-0f5510f51e60`, gọi 4 tool thật
  `agent_teams_status`, `agent_teams_set_member_route`, `agent_teams_add_member`, `agent_teams_set_member_profile`
  (lỗi quyền 'you are not leading any team yet' ⇒ tool đăng ký và dispatch được).
- Bundle trong tarball mang lại CSS: 719 token `aYQbCq_`, 150 tên lớp, 141 lớp, có `planSave`; bản cài có
  `data-member-route-control`, `data-add-member`, 8/8 dấu vết t67+t71+t74.
- Hồi quy từ `E:/Project/Agent-Team` (EXIT thật): t10 `48/48` = 0 · t56 `20/20` = 0 · t70 `16/16` = 0.
- `--analyze` đọc lại TARBALL trên đĩa (sha256/bytes/entry thật), không tin meta: EXIT=0, 21/21.

## Trung thực về các lượt trước
- Lượt 1–2 (21:16Z, 21:18Z) pack bản TRƯỚC t86: `7e152b16d071…` / 2 242 144 B, cùng hash, 20/21 PASS — C19 FAIL do
  CHÍNH CHECKER: regex thô `[A-Za-z]:[\\/]` bắt `http://x` (thành `p:/`) và escape `\\n` cuối template literal (thành
  `s:\\`, `t:\\`); vá lần 1 còn sót `t:\\n${contract}\\`; vá lần 2 đòi tên ≥2 ký tự đường dẫn thuần (không `$ { } \\ /`)
  + dấu phân cách THỨ HAI ⇒ 0 hit. Mã plugin không đổi.
- t86 làm lệch 3 tệp (tools.js, members.js, members.d.ts) ⇒ lượt 3 đo lại 12 tệp và pack lại từ đầu.
- Số lần pack của task = 6 (4 lượt trước t86 bị cổng vô hiệu hoá, 2 lượt sau t86 là bản phát hành) — vượt trần 4, ghi
  trung thực; boot thật = 3, lần thử = 3.

## Giới hạn
- `peerDependencies` không cài được (không registry) ⇒ boot sống nhờ runtime desktop cấp `@deepseek-ai/*`; bundle UI
  của tarball chưa mở trong GUI ở profile này. Chưa publish/commit/push; tarball nằm trong `tests/tmp/t84`.
## V12-F1 / V12-F4 — chấm lại run lịch sử (audit vòng 12)

- `--analyze` trên **run cũ của t84** (`tests/tmp/t84/run-2026-10-31T21-24-44Z`, sinh TRƯỚC bản vá V11-F3) trả **EXIT 1** với `C22 SELF_MUTATION` và dòng chi tiết nay ghi rõ lý do: *meta.json của run này sinh TRƯỚC bản vá V11-F3 nên không có trường `selfMutation`*. Đây là hành vi ĐÚNG (một artefact không mang đối chứng thì không phải bằng chứng), không phải lỗi sản phẩm; muốn có C22 xanh thì chạy suite trên một run MỚI, không sửa run lịch sử.
- `V12-F4`: comment hứa `exit 2` khi import ném lỗi nhưng đo thật ra `exit 1`, vì handler tham chiếu `want` khai `const` TRONG callback thành công ⇒ ReferenceError. Đã sửa MÃ (không sửa comment): `want` nay khai ở scope con TRƯỚC lời gọi `import()`; captain đo lại ba nhánh trên bản đã sửa: đủ tên ⇒ **0**, thiếu tên ⇒ **1** (`missing named export: …`), module không tồn tại ⇒ **2**.
- Hai tệp bị sửa đều là TEST (`tests/t84-pack.mjs`, `tests/t88-pack.mjs`) nên KHÔNG nằm trong payload phát hành (`package/tests` = 0 entry) ⇒ verdict t89 cho tarball t88 vẫn nguyên hiệu lực; tarball t88 vẫn `0adbc64e…ceed2c`/2 243 224 B/133 entry.