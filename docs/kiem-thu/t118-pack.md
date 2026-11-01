# t118 — suite pack nằm trong repo (`tests/t118-pack.mjs`), ghim artefact vòng 19

Finding V18-F4 (low): vòng 18 không có suite pack nào trong `tests/` — script pack của t111 chỉ nằm ở
`packages/dsh-agent-teams/tests/tmp/t111`, nên artefact phát hành chỉ còn `meta.json` làm bằng chứng.
t124 (V19-F5) bổ sung: `--negative` cũ chỉ đột biến payload ĐÃ GIẢI NÉN, chưa bao giờ đột biến chính `.tgz`.

## Một lệnh kiểm lại bản phát hành

    node tests/t118-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t121

Chế độ khác:

    node tests/t118-pack.mjs                 # mặc định = --analyze thư mục artefact t121 (vòng 19)
    node tests/t118-pack.mjs --fresh         # 2 lần npm pack vào thư mục MỚI, so sha256/bytes/entry
    node tests/t118-pack.mjs --negative      # (a) payload giải nén +1 byte · (b) lật byte trong .tgz
    node tests/t118-pack.mjs --tgz-flip      # chỉ nhánh (b), in TGZ-FLIP caught=… copyExit=1 originalExit=0
    node tests/t118-pack.mjs --compare-packs <a.tgz> <b.tgz>   # in tên entry lệch giữa 2 gói

`--analyze` nhận: file `.tgz`, thư mục chứa `.tgz` (tự đệ quy ≤4 cấp, chọn mtime mới nhất), hoặc thư mục payload đã giải nén (có `lib/`).
Exit 0 = mọi check đạt; exit 1 = có check hỏng, kèm dòng `DIFF <tệp> applies=true … delta=±N`.

## V19-F5 — đột biến chính `.tgz` (mới ở t124)

`runTgzFlip()` copy tarball phát hành vào `tests/tmp/t124/tgz-flip/` rồi lật **1 byte tại offset 8** (trường MTIME của header gzip):
nén giải ra y nguyên payload nên đây là phép thử đúng nghĩa "file phát hành bị sửa sau khi pack".
Sau đó suite spawn lại CHÍNH NÓ với `--analyze <bản copy>` và đòi: exit 1, `FAIL A2` xuất hiện TRƯỚC `PASS A4`, độ dài tệp không đổi, sha256 đã đổi, payload giải nén vẫn giống hệt, và bản gốc vẫn `ok=true`.
`analyse()` đọc RAW BYTES trước và bọc `readTarball` trong try/catch, nên `.tgz` méo không làm sập checker mà thành `FAIL A2 … tar unreadable`.

## Bảng đóng băng 13 tệp (re-pin vòng 19)

Đo MỚI trong t124 (`FROZEN_MEASURED_AT 2026-11-01T02:24:41.236Z`) bằng `node:crypto` trên bytes thật của
`packages/dsh-agent-teams/**`, rồi đối chiếu payload trong tarball và bản cài `agent-teams-pack18`.
`lib/tools.js` = `e51734baf4693cd3…` / 213 715 B (bảng cũ ghim `88dbee4079f95ffd`/213 071 của vòng 18 — đã bị t117 thay).
13 tệp: 12 tệp `lib/**` + `package.json`. Nguồn số: chính tệp nguồn trên đĩa, không đọc `meta.json`.

## Kết quả đo (t124, log trong `tests/tmp/t124/`)

| Phép | Lệnh | Exit | Số đo |
|---|---|---|---|
| artefact vòng 19 | `--analyze …/tests/tmp/t121` | 0 | `sha256Now 2770fbfc4070eb80…` · `bytesNow 2248092` · `entriesNow 133` · 6/6 check · 13/13 SAME ba chiều (`agent-teams-pack18`) |
| đột biến `.tgz` | `--tgz-flip` | 0 | bản copy: `FAIL A2` + `PASS A4`, `copyExit=1`, `originalExit=0`, cùng độ dài, sha đổi, payload giống hệt |
| payload +1 byte | `--negative` nhánh (a) | 0 | `DIFF lib/state.js [payload] applies=true bytesFrozen=57508 bytesActual=57509 delta=+1` |
| thiếu bản cài | `DSH_TEST_PROFILE=…-missing --analyze …` | **1** | `FAIL A5 … the three-way check cannot be skipped` |

## Giới hạn

- Kiểm bytes/entry/hash; KHÔNG chạy plugin, không boot runtime (việc đó thuộc suite pack của vòng).
- Ba chiều cần profile `agent-teams-pack18` có sẵn; máy khác phải cài lại trước, nếu không A5 FAIL (đúng thiết kế).
- `--fresh` dùng `npm pack` tại chỗ ⇒ 2 lượt pack mỗi lần chạy; kết quả ghi vào `tests/tmp/t118/fresh-<stamp>/`.
- Bảng đóng băng ghim NGUỒN vòng 19: task sau sửa `lib/**` sẽ làm `--analyze` đỏ cho tới khi re-pin — đúng thiết kế (đối chứng âm của t124: artefact vòng 18 `1bb0ef1f…` nay đỏ vì `lib/tools.js` đã đổi).
- `--tgz-flip` ghi vào `tests/tmp/t124/tgz-flip` (đổi bằng `T124_FLIP_DIR`); phép lật byte chỉ tác động BẢN COPY, không đụng tarball phát hành.
