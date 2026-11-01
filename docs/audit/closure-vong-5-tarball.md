# Audit tarball phát hành CUỐI (t53) — chấm tarball của t52

- **Auditor**: audit-goat (độc lập). Attempt `05668dc6-ce3c-48e8-99e2-a222b0a87c66`. Thời điểm 2026-10-31T19:12–19:25Z.
- **Đối tượng**: `packages/dsh-agent-teams/tests/tmp/t52/nami-dsh-agent-teams-0.2.0-dev.0.tgz` (t52 pack trên cây tĩnh).
- **VERDICT: PHÁT HÀNH ĐƯỢC** — sha256 `5306f31bc1ad821befceb0d5cfb633156805852b12609e656e18404ba1c1bfb7`, **2 209 460 B**, **133 entry**, 10/10 payload khớp nguồn.
- Công cụ đo của tôi (không dùng meta): `tests/tmp/audit-t53/measure.mjs`, `mutate3.mjs`, `mutate2.mjs` + `*.json` kết quả thô.

## E1 — Tự đo tarball trên đĩa

| mục | kết quả |
|---|---|
| sha256 | `5306f31bc1ad…bfb7` |
| size / mtime | 2 209 460 B / `2026-10-31T19:07:01.931Z` |
| entry (`tar -tzf`, cắt CRLF) | **133** (mẫu: `package/LICENSE`, `package/lib/client/ActivityPanel.module.css`, …) |
| 6 entry bắt buộc | **0 thiếu**: `package/lib/{tools,members,client}.js`, `client.js.map`, `tool-names.js`, `package/cordis.patch.yml` |
| cấm | `node_modules`=0 · `package/tests`=0 · `.tgz/.tar.gz` lồng=0 · `.pid`=0 |

## E2 — 10/10 payload ↔ nguồn hiện tại (tự giải nén `tests/tmp/audit-t53/extract`, hash lại)

| tệp | payload = nguồn | byte |
|---|---|---|
| lib/tools.js | `a01b1a1018cb…` | 194 888 |
| lib/members.js | `1562be4d527d…` | 99 402 |
| lib/state.js | `7b49f5ab1d46…` | 56 282 |
| lib/snapshot.js | `92ecdd8759b6…` | 11 687 |
| lib/index.js | `2d28e617f068…` | 45 315 |
| lib/tool-names.js | `e3def5db908d…` | 808 |
| lib/client.js | `f86012517284…` | 198 572 |
| lib/client.js.map | `a0241ae86616…` | 335 890 |
| lib/types/members.d.ts | `b1ffe1544003…` | 27 660 |
| package.json | `92a6404071e4…` | 10 498 |

**10/10 SAME, 0 DIFF** — yêu cầu "9/9" đạt và vượt (tôi chấm cả 10 tệp phát hành).

## E3 — Mutation: bộ chấm có thật hay chỉ diễn lại?

- **A (sửa byte trong bản giải nén)**: thêm `/*audit-t53 mutation*/` vào `extract/package/lib/tool-names.js` ⇒ hash đổi `e3def5db908dcbd5` → `2eb2565e8a04de51`; **phép đo trực tiếp của tôi bắt ngay**: 9/10 SAME, DIFF đúng `lib/tool-names.js`.
- **A' (`--analyze` của t52 trên chính cây vừa bị sửa)**: **exit 0, vẫn "PASS"** ⇒ `--analyze` chỉ `JSON.parse(meta.json)` rồi `score(meta)` (`tests/t52-pack-final.mjs:677-681`), **không đọc đĩa** ⇒ nó không thể phát hiện tarball bị sửa sau khi pack. (Đây là **F1**, low — giới hạn công cụ, không phải lỗi tarball.)
- **B (làm sai chính đầu vào của bộ chấm, trên bản copy)**: đặt `threeWay[i].same=false` ⇒ `FAIL C2` exit 1; nhét `node_modules` vào `entries.forbidden` ⇒ `FAIL C3` exit 1; đặt `drift.drift=1` ⇒ `FAIL C11` exit 1; bản sạch ⇒ `PASS` exit 0. Vậy **các check C2/C3/C11 là sống**, không phải assert luôn-đúng — chỉ có chế độ `--analyze` là phát lại.
- **Khôi phục**: giải nén lại đúng 1 tệp từ tgz ⇒ `e3def5db908dcbd5`, trùng bản gốc; so lại 10/10 SAME.

## E4 — Hồi quy trên mã nguồn HEAD (tarball phải khớp HEAD)

- `node tests/t3-route-smoke.mjs` ⇒ **exit 0, `18/18 passed, 0 failed`**.
- `node tests/t10-ui-bundle-smoke.mjs` ⇒ **exit 0, `TOTAL 40 checks, 40 passed, 0 failed`**.

## E5 — Danh tính gói

- `package.json` payload = nguồn: `name "@nami/dsh-agent-teams"`, `version "0.2.0-dev.0"`.
- `cordis.patch.yml` payload **byte-identical** nguồn; `id: agent-teams` (dòng 11), `name: '@nami/dsh-agent-teams'` (dòng 15).

## Phát hiện & kết luận

| id | mức | nội dung | dẫn chứng |
|---|---|---|---|
| F1 | low (công cụ) | `--analyze` của t52 phát lại `meta.json`, không hash lại tarball ⇒ không phát hiện được tarball bị thay sau khi pack. Chính sách đúng: **luôn hash trực tiếp artifact** như file này làm. | `tests/t52-pack-final.mjs:677-681`; thí nghiệm A' ở E3 |

**PHÁT HÀNH ĐƯỢC**: tarball `5306f31b…bfb7` / 2 209 460 B / 133 entry, khớp nguồn HEAD 10/10, đủ entry, sạch tệp cấm, boot/export đã được t52 chứng minh và tôi chấm độc lập phần byte. Điều kiện duy nhất: **không pack lại sau thời điểm này** — nếu `lib/**` đổi, phải chạy lại t52 rồi audit lại (hash sẽ khác). Không publish/commit trong phạm vi audit này.

