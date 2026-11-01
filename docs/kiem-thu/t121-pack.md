# t121 — pack vòng 19 (sau t117: dấu vết findings trong render status)

Ngày đo: 2026-11-01. Lệnh verify của card, chạy từ `E:/Project/Agent-Team` trên bản suite CUỐI (`t121-pack.mjs`):

```
node packages/dsh-agent-teams/tests/t121-pack.mjs --fresh      # EXIT 0 (11/11 check)
node packages/dsh-agent-teams/tests/t121-pack.mjs --negative   # EXIT 0 (bắt cả 2 mutation + 2 tiến trình thật cho exit 0/1)
```

## 1. Artefact phát hành (hash đọc lại từ đĩa, không hardcode)

```
packages/dsh-agent-teams/tests/tmp/t121/run-2026-11-01T02-04-11Z/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz
sha256   2770fbfc4070eb80cbe419134f1c44ffed8e9c6e4d9703d0d775b4af3cc6251e
bytes    2248092
entries  133   (0 entry thư mục, 6/6 entry bắt buộc, 0 rác, 0 đường dẫn tuyệt đối)
```

Hai lần `npm pack` trong CÙNG một tiến trình (pack-a và pack-b) ra cùng sha256 + cùng bytes + cùng 133 entry ⇒ A1 PASS.
Hai lần chạy `--fresh` (hai tiến trình khác nhau) cũng ra CÙNG sha256/bytes ⇒ tính tất định không phụ thuộc thời điểm chạy.
`--analyze` hash lại tarball trên đĩa: `sha256Now=2770fbfc…` `bytesNow=2248092` `entriesNow=133`.

## 2. Bảng 13 tệp ĐO TRƯỚC và ĐO SAU pack — drift = 0

| tệp | sha256 (16 hex) | bytes |
| --- | --- | --- |
| lib/tools.js | e51734baf4693cd3 | 213715 |
| lib/members.js | 50f558f8b207d874 | 102260 |
| lib/state.js | 56664c59ff400319 | 57508 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13986 |
| lib/index.js | 2d28e617f0683e42 | 45315 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |
| lib/client.js | 9da18d9971a284e9 | 258432 |
| lib/client.js.map | bbf88608f54e966f | 404958 |
| lib/types/members.d.ts | c53250ab41bff8c3 | 31769 |
| lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7627 |
| lib/types/tools.d.ts | 41cfc56576ed8ffd | 7546 |
| lib/client/ActivityPanel.module.css | 53ea47c6d780cd9d | 51837 |
| package.json | 92a6404071e457cc | 10498 |

Đo tại 3 mốc: trước pack / ngay sau pack / sau khi cài + boot ⇒ `drift=0` cả ba, `changed=none`.
lib/tools.js đổi so với vòng 18 (88dbee40…/213 071 → e51734ba…/213 715) đúng như t117 báo; 12 tệp còn lại y nguyên.

## 3. Cài vào profile MỚI `agent-teams-pack18` (không dùng lại pack17)

```
npm=0  isSymlink=false  isDirectory=true  version=0.2.0-dev.0
dependencySpec = file:E:/Project/Agent-Team/packages/dsh-agent-teams/tests/tmp/t121/run-2026-11-01T02-04-11Z/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz
lockResolved   = file:E:/Project/Agent-Team/packages/dsh-agent-teams/tests/tmp/t121/run-2026-11-01T02-04-11Z/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz
ba chiều (payload tarball / bản cài / nguồn): 13/13 SAME
```

## 4. `--negative` (chứng minh bộ kiểm CÓ THỂ FAIL)

```
CLEAN: 13/13 khop bang FROZEN => exit 0
DIFF lib/tools.js [frozen] applies=false shaApplies=true bytesFrozen=213716 bytesActual=213715 delta=-1 shaFrozen=e51734baf4693cd3 shaActual=e51734baf4693cd3
DIFF lib/members.js [frozen] applies=true shaApplies=false bytesFrozen=102260 bytesActual=102260 delta=+0 shaFrozen=ffffffffffffffff shaActual=50f558f8b207d874
DIFF lib/state.js [payload] applies=true bytesFrozen=57508 bytesActual=57509 delta=+1 shaFrozen=56664c59ff400319 shaActual=650cb95f5af79096
PAYLOAD_MUTATION: available=true caught=true
PROCESS clean table   -> exit=0 | probe …/tests/tmp/t121/frozen-clean.json: 13/13 rows match -> exit 0
PROCESS mutated table -> exit=1 | probe …/tests/tmp/t121/frozen-mutated.json: 12/13 rows match -> exit 1
NEGATIVE: cleanExit=0 bytesMutationCaught=true shaMutationCaught=true caught=true
exit codes 2 tien trinh: clean=0 mutated=1 => ok (0 / 1)
```

Ba kiểu mutation được chấm: (i) bảng trong bộ nhớ ⇒ DIFF `[frozen] applies=false delta=-1`; (ii) **bản sao payload trên đĩa** (giải nén tarball vào `tests/tmp/t121/payload`, nối 1 byte vào `lib/state.js`) ⇒ DIFF `[payload] applies=true delta=+1` — dạng `applies=true` + delta mà card yêu cầu; (iii) đổi 16 hex sha ⇒ `shaApplies=false`.
Bảng lật-byte được ghi ra `tests/tmp/t121/frozen-mutated.json` (bản sao, không chạm nguồn) và một tiến trình con của chính suite
chấm nó ⇒ EXIT 1 thật; bảng sạch ⇒ EXIT 0 thật. Probe named export trên bản ĐÃ CÀI: 19/19, con có exit code thật
(0 chỉ khi đủ tên / 1 thiếu tên / 2 import ném) và `SELF_MUTATION: caught exit=1,1,1,1,1` ⇒ hết kiểu "cả hai nhánh exit 0" của V11-F3.

## 5. Boot THẬT bằng bản đã cài (exit 0, session-c3fd93fb-3758-4c45-bca4-631fb26621fc, 6 tool call)

```
Members (1 present + 1 removed):
  - alice [researcher] idle/unspawned · opencode-go/kimi-k2.7-code
Removed (1):
  - bob [qa] opencode-go/deepseek-v4.1-flash · reasoning max · joined 2026-11-01T02:04:29.035Z
Tasks (1):
  - t1 [pending] work findings 1 attempt 0 probe task → captain
Team id: t121probe · phase: staged
```

Ba dòng card đòi: đúng chuỗi `Members (1 present + 1 removed):`, khối `Removed (1):`, và dấu vết ` findings 1` trên dòng task
(t1 mang findings F1 chưa resolve ⇒ `findings_open=1`, render lib/tools.js:3391-3392). Team do chính tool đã ship tạo trong phiên,
không chèn tay vào thư mục state.

## 6. Cổng render tại thời điểm pack

`node tests/t98-render-coverage.mjs --strict` → `EXIT=0`, `SUMMARY tools=16 fields=112 reached=105 uncovered=0 nested_gaps=0
payload_findings=0 fixture_drift=0 allow_list_line_problems=0 negative_control_applies=true … | verdict GREEN`.

## 7. GIỚI HẠN trung thực

- Suite pack vòng cũ ghim bảng đóng băng của vòng mình nên ĐỎ sau khi vòng 19 ra đời — đúng thiết kế. Đo thật:
  `node tests/t118-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t111` → `EXIT=1`
  `DIFF lib/tools.js [source] applies=true bytesFrozen=213071 bytesActual=213715 delta=+644 shaFrozen=88dbee4079f95ffd shaActual=e51734baf4693cd3` ⇒ `FAIL A3`. Không sửa t118, không thêm nó vào LEGACY.
- `--fresh` chỉ chứng minh cây nguồn HIỆN TẠI; nó không chứng minh tarball t111 còn đúng — việc t111 hết hiệu lực là kết luận của t117.
- Boot chạy 2 lần cho vòng này (hết trần 2); các nhánh lỗi quyền/guard của tool không kích hoạt trong boot, chúng có suite riêng.
- Bảng FROZEN đo lúc `2026-11-01T02:00:18.624Z`; nếu cây đổi sau đó thì `A2` FAIL và phải pack vòng mới, KHÔNG sửa bảng tại chỗ.
- Đường dẫn tuyệt đối trong doc này là bằng chứng lock `file:` của profile cài, không phải rác trong tarball (A3 kiểm `absPaths=none`).
- Lượng dùng: 4/6 lần `npm pack` (2 lần chạy `--fresh`, mỗi lần 2 pack), 2/2 boot, 3/8 lần suite khác (t98 ×2, t118 ×1), 1 lần thử.
- Tệp suite đổi SAU lần chạy `--fresh` cuối: chỉ THÊM code trong `--negative` (nhánh payload + probe 2 tiến trình) và helper `measureFromRoot`; `measureFiles` đã khôi phục nguyên văn nên đường chạy `--fresh` (runFresh/score/printVerdict/packFresh/installIntoCleanProfile/runHeadless) không bị sửa sau lần đo. Trần boot là 2 và đã dùng hết nên tôi KHÔNG boot lần thứ ba để chạy lại `--fresh` — giới hạn thật, ghi ra thay vì che.

## 8. Tệp bằng chứng

`packages/dsh-agent-teams/tests/tmp/t121/fresh.log` (11/11) · `negative.log` · `analyze.log` · `t118-old.log` ·
`run-2026-11-01T02-04-11Z/meta.json` · `frozen-clean.json` / `frozen-mutated.json`.
