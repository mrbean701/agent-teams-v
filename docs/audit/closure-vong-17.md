# Audit closure vòng 17 — chấm tarball t108 + bản vá removed-visibility (BUG-027)

**Người chấm**: audit-goat (độc lập, không viết mã sản phẩm) · **Task**: t109 · **attempt**: 2407b0d6-34fa-4126-aa91-a0c4e8f2e757 · **Mốc chấm**: 2026-11-01T00:41:11.537Z
**Đối tượng**: `packages/dsh-agent-teams/tests/tmp/t108/nami-dsh-agent-teams-0.2.0-dev.0.tgz` + bản vá `lib/tools.js` của t107 (status in hồ sơ `removed` ở cả payload lẫn text).

## §0. Verdict

**TARBALL t108 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CÓ ĐIỀU KIỆN.**
- Lớp mã nguồn + payload + bản cài: ĐẠT. Không có phát hiện high/blocker nào trong `lib/**`.
- Điều kiện công bố: vá `docs/bao-cao-agent-teams.md` §2.1 (V17-F1) và thêm ghi chú cổng t98 là *một nửa* của bằng chứng payload (V17-F2) TRƯỚC khi người vận hành dùng §2.3.

## §1. Bảng tiêu chí

| # | Tiêu chí | Kết quả | Bằng chứng (đo của tôi) |
|---|---|---|---|
| C1 | Tự hash + tar + giải nén + ba chiều 13 tệp, repack cùng sha/bytes, đếm lại `tests/t*.mjs` | ĐẠT | sha256 `0cb3fdfe…cfd63f18` · 2 247 534 B · 133 entry / 0 entry thư mục · 14/14 tệp bắt buộc · rác 0 · 0 đường dẫn tuyệt đối · quét toàn gói 133/133 payload=nguồn · 13/13 SAME với `agent-teams-pack16` (không symlink) · repack cùng sha+bytes · `tests/t*.mjs` trên đĩa = **61** |
| C2 | ≥1 mutation nhắm bản vá t107 | ĐẠT | M1/M1b/M2/M3/M4b — xem §3; mỗi phép làm t107 đỏ đúng các case nghiệp vụ, phục hồi byte-identical |
| C3 | ≥3 mutation kiểu CHƯA dùng ở vòng 5–16 | ĐẠT | 5 kiểu mới: xoá khoá khỏi object DTO · giữ nguyên số dòng khi xoá · đổi hằng sentinel nhánh văn bản · bỏ bộ lọc roster khỏi DTO · đổi định dạng giá trị in (ISO→epoch) |
| C4 | Toàn bộ `tests/t*.mjs` + 3 công cụ tài liệu + ERP | ĐẠT (có 2 suite đỏ do artefact cũ, xem §4) | 61 tệp: 56 EXIT 0 trong sweep, t107 12/12, t108 `--analyze` 29/29; t35 + t84 đỏ vì ghim/artefact cũ; t106 không đo được (quá 6 phút, đã dừng) |
| C5 | Rà `docs/bao-cao-agent-teams.md` + `docs/TODO.md` khớp số đo | ĐẠT một phần | TODO 109 hàng / 109 id / 6 cột đúng, header 101+4+2+1+1 = 109 khớp thân; bao-cao §2.3/§2.4/§5/§6 khớp, **nhưng §2.1 còn hash cũ** ⇒ V17-F1 |
| C6 | Chấm lại 6 mục ALLOW_LIST của cổng t98 | ĐẠT (1 anchor stale) | 6/6 vẫn là duplicate-by-construction, không mục nào che trường người vận hành cần; `delete.deleted` ghi `:2670-2673` trong khi render delete ở **2713** ⇒ V17-F3 |
| C7 | Verdict + `V17-F*` + điều kiện hết hiệu lực có mốc thời gian | ĐẠT | §0, §3, §6, §7 |

## §2. Số đo độc lập (node:crypto + tar, KHÔNG dùng `--analyze`)

- Tarball: `0cb3fdfe255c55e54b84b167f0eff24ee123fd9270396d239d5eaa11cfd63f18` / **2 247 534 B** / **133 entry** / **0** entry thư mục; `tar -xzf` OK; rác `node_modules`=0, `package/tests`=0, `.tgz` lồng=0, `.pid`=0, `package/tools`=0, đường dẫn tuyệt đối trong `lib/**`=0.
- Quét **toàn gói**: 133 tệp payload ↔ nguồn = 133 same / 0 diff / 0 notInSource; nguồn `lib/**` 79 tệp, không tệp nào thiếu trong gói.
- Ba chiều 13 tệp (`nguồn` = `payload` = `agent-teams-pack16`): tools.js `d402c6586df1`/210 641 · members.js `50f558f8b207`/102 260 · state.js `56664c59ff40`/57 508 · snapshot.js `a2a87e1b0c0b`/13 986 · index.js `2d28e617f068`/45 315 · tool-names.js `e3def5db908d`/808 · client.js `9da18d9971a2`/258 432 · client.js.map `bbf88608f54e`/404 958 · types/members.d.ts `c53250ab41bf`/31 769 · types/snapshot.d.ts `962f99a7bcb1`/7 627 · types/tools.d.ts `41cfc56576ed`/7 546 · ActivityPanel.module.css `53ea47c6d780`/51 837 · package.json `92a6404071e4`/10 498.
- Bản cài `C:/Users/thang/.dsh/profiles/agent-teams-pack16/node_modules/@nami/dsh-agent-teams`: `isSymlink=false`, `0.2.0-dev.0`, 133 tệp, 0 dependencies / 24 peerDependencies, mismatches 0.
- Repack 1 lần bằng `npm pack` vào `tests/tmp/audit-v17/repack`: **cùng sha256 + cùng bytes** ⇒ đóng gói tất định.
- Đối chứng ERP: `E:/Project/ERP/.agent-teams/erp-erp/team.json` = `9f7420b6a1af…15f2d1e` / 1 533 117 B / mtime `2026-10-24T04:53:13.186Z` — không đổi suốt lượt chấm (đo trước và sau toàn bộ mutation).

## §3. Mutation (5 kiểu mới; mọi phép phục hồi **byte-identical**, sha cuối `d402c6586df1`)

| # | Kiểu (mới so với vòng 5–16) | Điểm sửa | Δ byte / sha | Suite đỏ |
|---|---|---|---|---|
| M1 | xoá một khoá khỏi object DTO payload (xoá dòng) | `lib/tools.js` `removed_count: removedMembers.length,` | −54 B · `396222871147` | t107 EXIT 1 (a1,b1,c1,c2,e1) · t98 EXIT 2 *stale RENDER_LINES map* (dời dòng) |
| M1b | **giữ nguyên số dòng** khi xoá khoá DTO (thay bằng comment) | nt | +16 B · `50c490d790e1` | t107 EXIT 1 (a1,b1,c1,c2,e1) · **t98 `--strict` VẪN GREEN** ⇒ V17-F2 |
| M2 | đổi hằng sentinel nhánh phát khối văn bản (0 → −1 để M=0 vẫn in `Removed`) | `lib/tools.js` `removedMembers.length === 0 ? [] : [` | +1 B · `a16328e1f224` | t107 EXIT 1 (b1 byte-identical của team thường, e1) · t98 GREEN |
| M3 | bỏ bộ lọc roster khỏi pipeline DTO (hồ sơ removed lọt vào `members`) | `lib/tools.js` `.filter((member) => member.status !== 'removed')` | −65 B · `1bcf19f02832` | t107 EXIT 1 (a2,a4,c1,e1) · t98 EXIT 2 stale map |
| M4b | đổi định dạng giá trị in (ISO → epoch ms) | `lib/tools.js` `new Date(member.joined_at).toISOString()` | +4 B · `1fd3478347ce` | t107 EXIT 1 đúng 1 case (c2) · t98 GREEN |

- Phép thử phụ **M4clip** (cắt `clipText(persona, 120)` → `8`, −2 B, sha `f6348263453d`): **không suite nào đỏ**, nhưng `t98 --strict` in `reached 106→105`, `nested_gaps 0→1` và vẫn EXIT 0 ⇒ `nested_gaps` không phải cổng (V17-F2).
- Baseline trước/sau mọi phép: t107 **12/12** EXIT 0; `t98 --strict` GREEN (`tools=16 fields=112 reached=106 uncovered=0 nested_gaps=0 allow_listed=6`); t10 48/48.

## §4. Sweep toàn bộ suite (đo bằng exit code thật)

- `tests/t*.mjs` trên đĩa: **61**. Sweep tự dò: **58** suite có kết quả — **56 EXIT 0**, 2 EXIT 1 (`t35-pack-repack` chạy plain, `t84-pack --analyze`), `unclassified=[]`.
- Chạy bù bằng tay: `t107-removed-members-visible.mjs` **12/12 EXIT 0**; `t108-pack.mjs --analyze …/t108` **29/29 EXIT 0** (PASS: in nguyên văn tiêu đề `Members (N active + M removed):` + khối `Removed (M):` trên bản CÀI, probe export có exit-code thật, `SELF_MUTATION` bắt được, drift=0 trên 13 tệp ở 3 mốc).
- **t106-erp-live-roundtrip.mjs** chạy >6 phút trong sweep và bị dừng (suite không có timeout nội bộ) ⇒ không có kết quả; t106 vốn đã `FAILED (attempt 1)` trên board, đây KHÔNG phải bằng chứng sản phẩm hỏng (V17-F10).
- Sweep đỏ `t35` + `t84` là artefact cũ, không phải hồi quy: t84 `--analyze` thiếu `selfMutation` trong meta (C22); t35 ghim `EXPECTED_TOOLS_SHA256='7fde7bbc…'` ở `tests/t35-pack-repack.mjs:39` nên **không chế độ nào** qua được hôm nay — plain 6/7 (C2 'nguồn đã đổi'), `--analyze` artefact gốc 5/7 (C6/C7 thiếu 2 tool mới) ⇒ V17-F5. Sweep của tôi còn phân loại nhầm `t35-pack-repack.mjs` là *plain* (regex chỉ bắt `-pack.mjs`) và chạy plain đã **sinh thêm 2 run dir** `run-2026-11-01T00-28-07Z`, `run-2026-11-01T00-38-59Z` — đã khai báo, không xoá.
- Công cụ tài liệu (chạy sau khi ghi tài liệu): `check-logs --summary`, `check-doc-paths --summary`, `dependency-report` — kết quả ở §5.

## §5. Kết quả công cụ tài liệu + rà tài liệu

- `check-logs --summary` ⇒ `logs=7 ok=7 fail=0 warnings=3 problems=0 newest_round=16 newest_task=109` EXIT 0 (16 = vòng ĐÃ ĐÓNG gần nhất, đúng luật cổng; vòng 17 chưa đóng).
- `check-doc-paths --summary` ⇒ `files=5 paths=91 paths_missing=0 links=41 links_missing=0` EXIT 0 (thêm 1 đường dẫn so với 90 của vòng trước, chính là tệp này).
- `dependency-report` ⇒ `tasks=109 realEdges=108 derivedEdges=121 waves=46 **problems=1**` với `PROBLEM: t107 da completed nhung cha t106 van failed (repair)` ⇒ V17-F11.
- `docs/TODO.md`: **109 hàng t1…t109**, **109 id duy nhất**, 0 trùng, mọi hàng **đúng 6 cột**; header `:4` = `VERIFIED=101 · CANCELLED=4 · SUPERSEDED=2 · FAILED=1 (t106) · IN_PROGRESS=1 (t109) · OPEN=0` ⇒ 101+4+2+1+1 = 109 khớp thân bảng; header trỏ tarball t108 và ghi rõ 'CHƯA có verdict, verdict vòng 15 đã HẾT hiệu lực' ⇒ **trung thực**.
- `docs/bao-cao-agent-teams.md` (164 dòng): §2.3 'ĐANG CHỜ AUDIT VÒNG 17' + sha `0cb3fdfe…`/2 247 534 B; §2.4 chi tiết t108 + giới hạn V15-F5; §5 `tasks=109 realEdges=108 derivedEdges=121 waves=46 problems=0`; `paths=90 links=41`; §2.9 danh sách tarball cũ đã bỏ — khớp số đo của tôi, TRỪ §2.1 (V17-F1).

## §6. Phát hiện

**V17-F1 (medium — chủ sở hữu: dev-ui-goat, `docs/bao-cao-agent-teams.md`)** — §2.1 'Môi trường dogfood (hash đo lại ở t104…)' ở dòng 36 vẫn ghi `lib/tools.js` = `5deb03ca93b2…`/**205 239 B** trong khi bản hiện hành là `d402c6586df1…`/**210 641 B**, và **không** liệt kê `lib/types/tools.d.ts` `41cfc56576ed…`/7 546 B. Tái hiện: `grep -n '5deb03ca' docs/bao-cao-agent-teams.md` ⇒ dòng 36; so với `sha256(packages/dsh-agent-teams/lib/tools.js)`. Hậu quả: người vận hành đối chiếu môi trường dogfood sẽ thấy lệch sau t107. Vá: cập nhật bảng hash §2.1 theo bảng 13 dòng của vòng 17.
**V17-F2 (medium — dev-runtime-goat, `tests/t98-render-coverage.mjs`)** — cổng parity **mù với hồi quy ở tầng payload** khi số dòng không đổi: M1b xoá khoá `removed_count` khỏi DTO (payload mất dữ liệu) ⇒ `t98 --strict` EXIT 0 GREEN, chỉ t107 bắt. Cùng gốc: `nested_gaps` được đo và in nhưng **không bao giờ** làm cổng đỏ (`tests/t98-render-coverage.mjs:632-637` chỉ thoát 1 khi `gateFailures.length > 0`); M4clip cho `reached 106→105, nested_gaps 0→1` mà vẫn EXIT 0. Tái hiện: chạy M1b (script `tests/tmp/audit-v17/mutate.mjs`) rồi `node tests/t98-render-coverage.mjs --strict`. Kết luận hợp đồng: **t98 GREEN không phải bằng chứng payload đúng — phải có suite theo tool (như t107) song hành**.
**V17-F3 (low — dev-runtime-goat)** — `ALLOW_LIST` entry `agent_teams_delete.deleted` ghi `file: 'lib/tools.js:2670-2673'` (`tests/t98-render-coverage.mjs:119-123`) nhưng sau t107 render `delete` nằm ở **2713** (2663 là `agent_teams_resume`); 5 mục còn lại đúng (create 889, approve 1254, edit_plan 1142, set_member_profile 1479, update_task 2071). Cổng không kiểm anchor ⇒ vẫn `allow_listed=6`. Vá: cập nhật dòng + thêm kiểm anchor vào cổng.
**V17-F4 (low — dev-runtime-goat, `lib/tools.js:3292-3294`)** — tiêu đề `Members (${team.members.length} active + ${removedMembers.length} removed):` gọi mọi hồ sơ KHÔNG phải `removed` là 'active', kể cả `idle`. Trên team.json ERP thật: 14 hồ sơ = 7 removed + **6 idle + 1 working** ⇒ câu in ra là `Members (7 active + 7 removed)` dù chỉ **1** đang chạy. Không sai dữ liệu, sai NHÃN. Vá: `Members (7 + 7 removed)` hoặc đếm theo `status`.
**V17-F5 (low — dev-build-flash, `tests/t35-pack-repack.mjs`)** — suite ghim `EXPECTED_TOOLS_SHA256 = '7fde7bbc49db…'` (dòng 39) và `score()` C2 đòi `payload === source === pin` ⇒ hôm nay **không chế độ nào xanh**: plain `6/7 EXIT 1` ('nguồn đã đổi — cần captain công bố lại'), `--analyze` artefact gốc `5/7 EXIT 1` (C6/C7 thiếu 2 tool mới); chạy plain còn **sinh run dir mới**. Tái hiện: `node tests/t35-pack-repack.mjs`. Vá: đánh dấu SUPERSEDED (như t42/t52) hoặc thêm cờ 'era artifact, chỉ chấm C1–C5'.
**V17-F6 (info)** — `t84-pack --analyze` vẫn FAIL C22 vì `meta.json` cũ thiếu `selfMutation` (lặp V12-F1/V13-F4/V14-F6): không phải lỗi sản phẩm, nhưng làm sweep luôn có 1 đỏ.
**V17-F7 (info)** — `tools/dependency-report.mjs` vẫn ghi đè `docs/DEPENDENCIES.md` (ngoài phạm vi audit; repo không phải git nên không truy vết được diff).
**V17-F8 (info)** — sự kiện `agent-teams/*` của session vẫn bị host bỏ tại `lib/events.js:33-40` (lặp từ vòng 11).
**V17-F9 (info)** — `RENDER_LINES` ghim **số dòng khởi đầu** của 16 render: mọi phép chèn/xoá dòng làm cổng EXIT 2 'stale map' (M1, M3) — fail-closed, chấp nhận được, nhưng là chi phí bảo trì đã biết (lặp V14-F4).
**V17-F10 (info — kiem-thu-goat)** — `tests/t106-erp-live-roundtrip.mjs` không có timeout nội bộ; chạy trần vượt 6 phút nên tôi phải dừng. Đề nghị thêm `--timeout` hoặc ghi rõ 'live, không chạy trong sweep'.

**V17-F11 (low — captain, board)** — `node tools/dependency-report.mjs` báo `problems=1`: `t107 da completed nhung cha t106 van failed (repair)` ⇒ cây phụ thuộc còn một repair đã xong treo dưới cha `FAILED`; đồng thời `docs/bao-cao-agent-teams.md:118` vẫn ghi `problems=0` (số đo lúc viết). Tái hiện: `node tools/dependency-report.mjs`. Vá: đóng/đánh dấu lại t106 sau t107 rồi cập nhật số trong báo cáo.

## §7. Chấm BUG-027 và giới hạn

- Mục **'ĐÍNH CHÍNH TIỀN ĐỀ'** trong `docs/log/BUG.md:209-215` **đủ trung thực**: nêu đúng giả thuyết sai của captain (‘hồ sơ removed mang `routeOverride` nguồn erp’), nêu phép đo bác bỏ (**0/14** member có `routeOverride`), liệt kê khoá thật (`runtimeSetup {persona 4 073 ký tự, toolFilter deny[10]}`, `joinedAt`), chỉ đúng dòng gây lỗi (`lib/tools.js:2444-2445`), và tự khai giới hạn. Không giấu việc captain sai. Chỉ thiếu: chưa ghi ai đo lại (t107) và chưa cross-ref nhãn 'active' (V17-F4).
- Giới hạn đã biết, KHÔNG phải phát hiện mới: dòng `Removed` trên boot t108 không có persona/tools vì `member.runtimeSetup` chỉ ghi lúc ACTIVATE (`lib/members.js:1078`) và bob trong boot chưa activate; nhân chứng persona/tools là t107 12/12 + marker `ZQremoved_members_runtime_setup_*` trong `STATUS_FIXTURE` (`tests/t98-render-coverage.mjs:192-210`) nên cổng thật sự chạm 2 trường này.

## §8. Điều kiện hết hiệu lực

- Verdict này chỉ đúng cho **đúng bộ byte** `0cb3fdfe…cfd63f18` / 2 247 534 B / 133 entry, chấm lúc **2026-11-01T00:41:11.537Z**.
- **Hết hiệu lực ngay** nếu: (a) bất kỳ tệp nào trong `packages/dsh-agent-teams/lib/**` đổi sau mốc trên; (b) pack lại (kể cả cùng nguồn — sha phải được đo lại); (c) có task sửa `render`/`types` mà `tests/t98` không được khai trong inScope (luật hợp đồng của t107).
- Không được publish t108 nếu chưa vá V17-F1 (tài liệu §2.1) và chưa thêm cảnh báo V17-F2 vào hợp đồng cổng.
