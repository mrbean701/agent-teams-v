# Audit closure vòng 14 — tarball t100 + cổng render parity (t98/t99)

- Auditor: `audit-goat` (độc lập, không viết mã sản phẩm), attempt `70cc0447-5f1a-41f6-a5a4-3d83454f4895`, reviewed task **t100**.
- Mốc chấm: `2026-10-31T23:13:50.852Z`. Mọi số dưới đây do tôi tự đo bằng `node:crypto` + `tar -tzf` + tự giải nén; **không** dùng `--analyze` làm bằng chứng.

## §0 Verdict

**TARBALL t100 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CÓ ĐIỀU KIỆN** (điều kiện ở §7). Bộ byte: sha256 `d7a8bce4a333170bb304cc7d07fbcd5979091c976e314c82225eb4bcb57c9b1a` / **2 245 210 B** / **133 entry**.
Cổng `tests/t98-render-coverage.mjs` giữ nguyên RĂNG (6 phép ở §3, gồm 1 phép của tôi chứng minh ngoại lệ `edit_plan.team_id` là load-bearing đúng 1 trường). Không có blocker/high; 3 lệch tài liệu (V14-F1..F3) phải vá trước khi công bố.

## §1 Bảng C1..C7

| # | Nội dung | Kết quả | Bằng chứng (số đo của tôi) |
|---|---|---|---|
| C1 | Tự đo tarball | ĐẠT | sha `d7a8bce4…c57c9b1a`, 2 245 210 B, mtime `2026-10-31T23:04:46.599Z`; `tar -tzf` 133 entry / 0 entry thư mục / 133 tệp; rác 0 (node_modules 0, package/tests 0, .tgz lồng 0, .pid 0, tools 0); 13/13 tệp bắt buộc; `tar -xzf` exit 0; repack cùng sha + cùng bytes |
| C2 | Ba chiều 12/12 | ĐẠT | `sha == payload == installed` cho cả 12 tệp; profile `agent-teams-pack14` KHÔNG symlink, 133 tệp, `@nami/dsh-agent-teams` 0.2.0-dev.0, 0 dependencies / 24 peerDependencies, mismatches 0 |
| C3 | Quét toàn gói payload↔nguồn | ĐẠT | 133 same / 0 diff / 0 notInSource / 0 sourceMissing; nguồn `lib/**` 79 tệp, 0 tệp lib thiếu trong gói |
| C4 | Cổng t98 còn răng | ĐẠT | 6 phép ở §3: 2 phép của tôi trên bản sao + baseline; stale map và mất entry ALLOW đều đỏ đúng chế độ |
| C5 | ≥3 mutation kiểu MỚI | ĐẠT | 4 phép ở §4 (M1/M2b/M3/M4), mỗi phép có applies + delta byte + sha trước/sau + suite đỏ + phục hồi byte-identical |
| C6 | Toàn bộ suite + 3 công cụ tài liệu | ĐẠT phần lớn | 55 tệp `tests/t*.mjs` có trên đĩa, 55 chạy: 54 exit 0, 1 exit 1 (`t84-pack --analyze`, V14-F6). `check-logs` `problems=0 newest_round=14 newest_task=102`; `check-doc-paths` `files=5 paths=87 paths_missing=0 links=41 links_missing=0`; `dependency-report` `tasks=102 realEdges=103 derivedEdges=112 waves=44 problems=0` |
| C7 | Dữ liệu thật + tài liệu | ĐẠT / có lệch | ERP `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e` / 1 533 117 B không đổi (đo trước và sau toàn bộ mutation); docs lệch 3 chỗ ⇒ V14-F1..F3 |

## §2 Cổng t98 — bằng chứng còn răng (không tin script của member)

| # | Phép | Kết quả đo |
|---|---|---|
| 1 | `node tests/t98-render-coverage.mjs` | EXIT 0, `SUMMARY tools=16 fields=110 reached=104 uncovered=0 nested_gaps=0 allow_listed=6 negative_control_applies=true`, verdict GREEN |
| 2 | `--strict` | EXIT 0, cùng SUMMARY, `mode: --strict — EXIT 1 while a top-level field never reaches the text` |
| 3 | `--report --strict` | EXIT 2 `GATE ERROR: --report and --strict ask for opposite verdicts; pass one` |
| 4 | `--bogus` | EXIT 2 `GATE ERROR: unknown argument(s) ["--bogus"]` |
| 5 | Bản sao `gate-copy-stale.mjs`, `RENDER_LINES.agent_teams_status 2431→2432` | EXIT 2 ở **cả hai** chế độ: `GATE ERROR: stale RENDER_LINES map — agent_teams_status@2432` |
| 6 | Bản sao `gate-copy-noallow.mjs`, xoá 6 dòng entry `edit_plan.team_id` của ALLOW_LIST | `--strict` EXIT 1 `uncovered=1 allow_listed=5` + `MISSING agent_teams_edit_plan.team_id — lib/tools.js:1142 — severity low`; report EXIT 0 cùng SUMMARY ⇒ entry đúng là thứ duy nhất giữ cổng xanh cho trường này |

Bản sao phải patch 2 dòng tự định vị đường dẫn: `const REPO_ROOT = join(HERE…` → đường dẫn tuyệt đối repo, và `const TOOLS_URL = new URL(…` → `file:///…/lib/tools.js` (cổng dùng `import.meta.url`).

## §3/§4 Mutation nguồn (4 kiểu CHƯA dùng ở vòng 5–13, phục hồi byte-identical)

Baseline trước mọi phép: `lib/tools.js` `5deb03ca93b2a8e9…` / 205 239 B; gate `--strict` GREEN; t94 9/9, t99 11/11, t86 8/8, t87 8/8, t37 14/14 exit 0.

| M | Kiểu (mới) | Anchor | ΔB | sha trước → sau | Suite đỏ (số case) | Phục hồi |
|---|---|---|---|---|---|---|
| M1 | In một trường đang nằm trong ALLOW_LIST ra text | `lib/tools.js:1151` | +29 | `5deb03ca93b2` → `3e72bc85b0e7` | **t94 EXIT 1 6/9** (`d1`, `g1`, `i1` — 3 case so NGUYÊN VĂN) + **t99 EXIT 1 10/11** (`a5`); cổng `--strict` VẪN GREEN `uncovered=0` | `5deb03ca93b2` identical |
| M2 | Thêm trường vào `output.schema` mà không in, nhưng chèn trên DÒNG MỚI | `lib/tools.js:2670` | +67 | `5deb03ca93b2` → `395708224bc8` | CẢ 2 chế độ **EXIT 2**: `GATE ERROR: stale RENDER_LINES map — agent_teams_delete@2670` | identical |
| M2b | Cùng kiểu nhưng GIỮ NGUYÊN số dòng | `lib/tools.js:879` | +47 | `5deb03ca93b2` → `3613adffb92c` | `--strict` **EXIT 1**, `fields 110→111 uncovered=1` + `MISSING agent_teams_create.archived — lib/tools.js:889 — severity low`; report EXIT 0 | identical → `--strict` GREEN lại |
| M3 | Làm `render` NÉM lỗi, giữ nguyên số dòng | `lib/tools.js:1151` | +16 | `5deb03ca93b2` → `27d3403bc60b` | CẢ 2 chế độ **EXIT 2**: `GATE ERROR: agent_teams_edit_plan render threw on its own schema: render threw on the generated fixture` | identical |
| M4 | Cho `clipText` trả chuỗi rỗng | `lib/tools.js:3211` | +11 | `5deb03ca93b2` → `c24044977d58` | `--strict` **EXIT 1**: `reached 104→100 uncovered=2 nested_gaps=2` + `MISSING agent_teams_set_member_profile.execution_prompt` (high) và `previous_execution_prompt` (medium) | identical |

Ghi chú trung thực: M2 mất 1 lượt rồi tôi thay bằng M2b (vẫn tính 4 phép); M2 vẫn là bằng chứng phụ rằng guard stale-map sống. Sau mỗi phép tôi chạy lại `--strict` ⇒ GREEN.

## §5 Suite + công cụ tài liệu (đo bằng exit code)

- `55` tệp `tests/t*.mjs` trên đĩa, chạy đủ `55`: 31 plain + 1 `--strict` (t98) + 23 `--analyze`; **54 exit 0**, **1 exit 1** = `t84-pack --analyze …/t84/run-2026-10-31T21-24-44Z` (`FAIL C22 SELF_MUTATION`, meta.json cũ thiếu `selfMutation` — V14-F6).
- Case đã đo khớp báo cáo: t3 18/18 · t4 22/22 · t10 48/48 · t15 21/21 · t20 15/15 · t24 12/12 · t28 20/20 · t30 8/8 · t37 14/14 · t38 17/17 · t39 11/11 · t40 20/20 · t43 19/19 · t44 11/11 · t46 15/15 · t48 6/6 · t49 16/16 · t50 11/11 · t54 14/14 · t56 20/20 · t57 29/29 · t58 23/23 · t62 27/27 (sàn `21/16/12/4`) · t70 16/16 · t74 24/24 · t77 18/18 · t86 8/8 · t87 8/8 · t90 10/10 · t94 9/9 · t99 11/11 · t98 `--strict` GREEN · t93 PASS.
- `t100-pack --analyze` EXIT 0 (C24/C25 chấm text `create` + `edit_plan`), `t96-pack` EXIT 0, các e2e `--analyze` còn lại EXIT 0.
- Công cụ: `check-logs` `logs=7 ok=7 fail=0 warnings=3 problems=0 newest_round=14 newest_task=102`; `check-doc-paths` `paths=87 paths_missing=0 links=41 links_missing=0`; `dependency-report` `tasks=102 realEdges=103 derivedEdges=112 waves=44 problems=0`.
- Drift guard cuối: đo lại toàn bộ sau khi hết mutation + sweep ⇒ `SAME_AS_FIRST=true` (tarball, 12 tệp ba chiều, ERP).

## §6 Findings

| ID | Mức | File:dòng | Vấn đề + cách tái hiện | Chủ sở hữu |
|---|---|---|---|---|
| V14-F1 | low | `docs/TODO.md:4` | Header đếm `VERIFIED=93` nhưng thân bảng đo được **94** VERIFIED; 94 + 4 CANCELLED + 2 SUPERSEDED + 2 OPEN = 102 = đủ `t1..t102`, 0 id trùng. Tái hiện: đếm hàng `^\| t\d+ \|` trong cả tệp. | captain |
| V14-F2 | low | `docs/TODO.md:131-150` | 16 hàng `t87..t102` (6 cột) bị dán vào bảng `## Dogfood trong phiên sống` mà header `:133` chỉ có 4 cột (`| ID | Trạng thái | Nội dung | Bằng chứng |`); bảng task chính dừng ở `t85`, còn `t86`/`t77` nằm lẻ ở `:93-94`. Hệ quả: parser/người đọc bảng chính bỏ sót 16 task. | captain |
| V14-F3 | low | `docs/bao-cao-agent-teams.md:113-115` | Số liệu cũ hơn thực tế 1 task: ghi TODO `101 hàng`, `tasks=101 realEdges=102 derivedEdges=110`; đo nay **102 / 103 / 112** (t102 mở sau lượt cập nhật). Telegram `34 kỳ` thì ĐÚNG (34 tệp). | captain |
| V14-F4 | low | `tests/t98-render-coverage.mjs:69-86` | `RENDER_LINES` ghim theo SỐ DÒNG nên mọi sửa đổi làm dịch dòng trong `lib/tools.js` đều biến cổng thành EXIT 2 (`stale RENDER_LINES map`) trước khi chấm coverage — fail-closed (không thể xanh im lặng) nhưng phải cập nhật tay map sau mỗi vá. Tái hiện: M2 ở §4. | dev-runtime-goat |
| V14-F5 | info | `tests/t98-render-coverage.mjs:93-130` | 6 entry ALLOW_LIST đều có `file:dòng` + lý do thật; entry `agent_teams_edit_plan.team_id` đã được tôi chứng minh LOAD-BEARING (xoá entry ⇒ `--strict` EXIT 1 đúng 1 trường; in trường ⇒ t94 đỏ 3 case byte-exact). Chấp nhận được: ngoại lệ có căn cứ, không phải lỗ để lách. | dev-runtime-goat |
| V14-F6 | info | `packages/dsh-agent-teams/tests/tmp/t84/…/meta.json` | `t84-pack --analyze` EXIT 1 vì meta.json sinh TRƯỚC bản vá probe `selfMutation` (C22 đỏ). Chỉ ảnh hưởng replay thư mục cũ; t96/t100 live có `selfMutation`. Cùng lớp V12-F1/V13-F4. | dev-build-flash |
| V14-F7 | info | `tools/dependency-report.mjs` | Chạy nó ghi đè `docs/DEPENDENCIES.md` (ngoài phạm vi audit, repo không phải git nên không chứng minh được diff). | captain |
| V14-F8 | info | `lib/events.js:33-40` | Sự kiện `agent-teams/*` vẫn bị host bỏ (`dshSession.KNOWN_SESSION_EVENT_TYPES`); nhật ký thật = `team.json routeOverride` + `docs/log/MODEL-SWITCH.md`. Không đổi so các vòng trước. | captain |

## §7 Điều kiện công bố + điều kiện hết hiệu lực + giới hạn

1. Verdict đúng cho **đúng bộ byte** `d7a8bce4a333170bb304cc7d07fbcd5979091c976e314c82225eb4bcb57c9b1a` / 2 245 210 B / 133 entry, và chỉ đến mốc `2026-10-31T23:13:50.852Z`. **Không pack lại sau mốc này**; pack lại ⇒ cần vòng 15.
2. Trước khi cài: tự kiểm `sha256` + `2 245 210 B` + `133 entry` (đừng tin tên tệp — các vòng trước có 6 tarball cùng tên).
3. Captain phải vá **V14-F1..F3** (tài liệu) trước khi công bố; V14-F4..F8 không chặn cài.
4. **t102 (BUG-026) đang MỞ** và sẽ sửa `lib/state.js` (đọc LENIENT `routeOverride.source` lạ) ⇒ verdict này **hết hiệu lực ngay khi t102 merge**; phải pack + audit vòng 15 trước khi phát hành bản cuối.
5. Giới hạn của audit: không bấm GUI thật (UI chỉ kiểm qua bundle + CSS + 48 check t10); không thử cài trên máy Windows khác; `--analyze` không được dùng làm bằng chứng; không kiểm được `docs/TODO.md` ở mức "đúng nguồn máy" vì tôi không gọi `agent_teams_status`.
