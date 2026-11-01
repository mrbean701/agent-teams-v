# Audit closure vòng 23 (t144) — bộ byte panel ba khối 1:2

- Card: t144 · kind=review · round 23 · reviewedTaskId t143 · attempt_id fd80dbdf-3569-4016-ab8b-4b94851e4bda
- Người chấm: audit-goat (độc lập, KHÔNG dùng --analyze của t143 làm bằng chứng)
- Mốc verdict: 2026-11-01T14:52:00.000Z · Bộ byte: sha256 62ad22758a405a9ad1c9e380b91a2ea5aef830e0a66a9a0bad2fde74f6c1d308 / 2 248 300 B / 133 entry

## 0. Verdict

**TARBALL VÒNG 23 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CÓ ĐIỀU KIỆN.** Không có finding high/blocker. Bộ byte đã phát cho người dùng (profile desktop) khớp tuyệt đối với bản tôi tự đo: 6 bản .tgz cùng sha (4 bản trong 2 run dir t143 + dist/vong-23 + snapshot audit), payload 133/133 tệp trùng nguồn, ba chiều 15/15 với profile do audit tự cài, repack 2 tiến trình ra đúng cùng sha và cùng số byte. Bố cục ba khối 1:2 có mặt thật trong byte phát hành: `minmax(280px,1fr) minmax(0,2fr)` x1, các dấu hiệu bố cục 1:1 của vòng 22 (data-panel-columns/panelColumns/panelColumnAside) = 0, và DependencyMap là sibling trực tiếp trong section.team[data-workspace-team].
Điều kiện kèm theo: các finding V23-F1..V23-F4 (không chặn phát hành, nhưng phải xử lý trước vòng pack kế tiếp).

## 1. B1 — tự đo artefact

| Hạng mục | Số đo |
| --- | --- |
| sha256 / bytes | 62ad22758a405a9ad1c9e380b91a2ea5aef830e0a66a9a0bad2fde74f6c1d308 / 2 248 300 |
| 6 bản cùng sha | run-t143-a/pack-a · run-t143-a/pack-b · run-t143-b/pack-a · run-t143-b/pack-b · dist/vong-23/…tgz · tests/tmp/t144/artifact/vong-23.tgz |
| tar -tzf | 133 entry / 0 entry thư mục / rác 0 (node_modules, package/tests, .tgz lồng, .pid, package/tools) |
| payload vs nguồn | 133 tệp: 133 same / 0 diff / 0 notInSource |
| lib/** nguồn | 79 tệp, missingInTarball = [] |
| đường dẫn tuyệt đối rò | 0 tệp |
| FROZEN 13/13 | source = payload (xem bảng dưới) |
| package.json trong gói | @nami/dsh-agent-teams 0.2.0-dev.0 · 0 dependencies / 24 peerDependencies |
| ERP (đối chứng, không đổi) | E:/Project/ERP/.agent-teams/erp-erp/team.json 9f7420b6a1af1f4e…/1 533 117 B |

13 dòng đóng băng (sha16/bytes, source = payload = installed): tools.js e51734baf4693cd3/213 715 · members.js 50f558f8b207d874/102 260 · state.js 56664c59ff400319/57 508 · snapshot.js a2a87e1b0c0b34ea/13 986 · index.js 2d28e617f0683e42/45 315 · tool-names.js e3def5db908dcbd5/808 · client.js 7dca20dd1edf2c66/258 790 · client.js.map 173b684f1a6a569c/405 349 · types/members.d.ts c53250ab41bff8c3/31 769 · types/snapshot.d.ts 962f99a7bcb18b94/7 627 · types/tools.d.ts 41cfc56576ed8ffd/7 546 · ActivityPanel.module.css 7ea5190c7d978556/52 045 · package.json 92a6404071e457cc/10 498. Ngoài bảng 13: lib/client/ActivityPanel.js 2407c22ee26675e5/64 097 · lib/client/WorkspaceActivity.module.css c7f2d5e5d295c40f/3 579.

## 2. B2 — repack + ba chiều

- Repack 2 tiến trình riêng (tests/tmp/t144/repack-a, repack-b, đều `npm pack` trong packages/dsh-agent-teams): cả hai ra 62ad22758a405a9a…/2 248 300 B, trùng artefact (sameShaBoth=true, sameAsArtifact=true).
- Profile do audit tự cài (không phải profile của t143): C:/Users/thang/.dsh/profiles/agent-teams-rel23-audit, dependency `file:E:/Project/Agent-Team/tests/tmp/t144/artifact/vong-23.tgz`, lock resolved đúng artefact đó, isSymlink=false, 133 tệp trong bản cài, version 0.2.0-dev.0, 0 dependencies / 24 peerDependencies.
- Ba chiều 15/15 SAME (13 FROZEN + ActivityPanel.js + WorkspaceActivity.module.css). Không có tệp nào chỉ khớp hai chiều.

## 3. B4 — byte bố cục trong lib/client.js giải nén từ tarball

| Phép kiểm | Kết quả |
| --- | --- |
| `minmax(280px,1fr) minmax(0,2fr)` | 1 lần (`grid-template-columns:minmax(280px,1fr) minmax(0,2fr);`, trong `@container (width>=800px)` cho `.aYQbCq_team[data-workspace-team]`, offset ký tự 76 366) |
| `data-panel-columns` | 0 |
| `panelColumns` | 0 |
| `panelColumnAside` | 0 |
| `panelColumnMain` | 4 (rule CSS @78 858; bảng class @85 268/@85 294; JSX cột trái @175 915 `div className panelColumnMain "data-panel-column": "member"`) |
| DependencyMap | offset ký tự 182 187 (captain đo 182 377 byte — cùng call site, khác hệ quy chiếu), ngữ cảnh `}), (0, import_jsx_runtime5.jsx)(DependencyMap, { tasks: …, onSelectTask: setSelectedTaskId }), workspace && …WorkspaceSummary` |
| sibling? | CÓ: section.team[data-workspace-team] @171 959 có children [header, cột trái (div data-panel-column=member), DependencyMap, workspace summary]; DependencyMap không bị bọc thêm div |

## 4. B3 — mutation (chỉ trên BẢN SAO tests/tmp/t144/pkg, phục hồi từ pristine, final 7dca20dd1edf2c66/258 790)

| # | Kiểu | sha16/bytes mutant | Cổng đỏ (nguyên văn) |
| --- | --- | --- | --- |
| M1 | CSS NHÚNG trong bundle: `minmax(280px,1fr) minmax(0,2fr)` → `…minmax(0,1fr)` (tệp .module.css nguyên vẹn) | 5df3d7d81c1c542b/258 790 (delta 0 B) | t10 49/50 `FAIL bundle identity matches the pinned sha256 + bytes :: sha256 5df3d7d8… != 7dca20dd…`; t128 19/22 với đúng 3 FAIL: `FAIL B3 — running build/build.mjs on a COPY of the package reproduces the shipped bundle AND map byte for byte, so this layout is a build product and not a hand edit`, `FAIL X1 …`, `FAIL X2 …`; t129 2 FAIL (pin). ⇒ CÓ cổng đỏ (B3), nên KHÔNG phải finding high |
| M2 | sourcemap: dịch segment BAO PHỦ vị trí `(` của call site DependencyMap (gen 1940:16) đi 1 cột | 173b684f1a6a569c/405 349 (delta 0 B) | t128 20/22: chỉ `FAIL B3`, `FAIL X2` — M1 mapping VẪN PASS ⇒ anchor không phủ segment call-site (V23-F2) |
| M2b | sourcemap: dịch segment BAO PHỦ chữ `DependencyMap` (gen 1940:45) từ cột nguồn 47 xuống 40 | 173b684f1a6a569c/405 349 (delta 0 B) | t128 18/22: `FAIL M1 — decoding the SHIPPED mappings lands on the NEW dependency call site (ActivityPanel.js line 437) and on the left cell, so the map describes this layout instead of the old one` + `FAIL M2 — negative control …` + B3 + X2; dòng đo `# mapping: DependencyMap call site bundle=1940:45 -> ../lib/client/ActivityPanel.js:437:40 snippet=", _jsx(DependencyMap, "` |
| M3 | bọc DependencyMap trong một div ở bundle (phá quan hệ sibling/direct child) | 55641ccf2a0099c0/258 841 (delta +51 B, node --check ok) | t10 49/50 (chỉ hash); t128 17/22 (M1/M2 mapping + B3/X1/X2); t129 3 FAIL |

Baseline bản sao trước mọi phép: t10 50/50 · t128 22/22 (B3 build-copy PASS: bundle 258 790 B, map 405 349 B) · t129 13/13. Sau mọi phép: final 7dca20dd1edf2c66/258 790 = pristine; KHÔNG ghi byte nào vào packages/dsh-agent-teams/** hay dist/**.
Kết luận về khoảng mù mà vòng 22 nêu (tests/t128-panel-order.mjs:441-455 chỉ soi TỆP CSS): **có thật nhưng đã được chặn gián tiếp** — bản CSS nhúng trong bundle không có phép kiểm ngữ nghĩa riêng, song B3 (dựng lại build trên bản sao rồi so byte với bundle+map đang phát) đỏ ngay khi bundle bị sửa tay, còn hash pin của t10/t129 đỏ trước cả B3. Vì vậy đây là V23-F1 medium (thiếu lớp kiểm trực tiếp), không phải high.

## 5. B5 — sweep và 7 suite bắt buộc

`node tools/sweep-suites.mjs --run` (tests/tmp/t144/sweep-run.log): **PASS=53 FAIL=4 LEGACY=12 UNCLASSIFIED=0 skipped(live)=10 WARN=0 WARN_FIXTURE=1 DRIFT=0**, tool exit 1. `node tools/sweep-suites.mjs --list`: 79 suite = 10 LIVE + 69 fast; 12 legacy exception (embedded). frozen sampling: 57/57 suite đã chạy được lấy mẫu 13 tệp trước/sau, drift suites=0.
4 suite đỏ — cả 4 đều là CỔNG LỊCH SỬ chưa phân loại, KHÔNG phải hồi quy trên bộ byte vòng 23:
- tests/t132-panel-runtime.mjs (:4-6 ghim thứ tự 5 sibling cũ `ProgressOverview -> DependencyMap -> AddMemberControl -> …`; :36 ghim thẳng bundle của profile `agent-teams-pack19`) — bố cục đã đổi có chủ ý ở t142/t143.
- tests/t132-panel-dom-order.mjs — chỉ là wrapper chuyển tiếp sang t132-panel-runtime.mjs.
- packages/dsh-agent-teams/tests/t140-pack.mjs (:2 round 22; :41 TEST_PROFILE agent-teams-pack21; :390-391 bảng FROZEN round 22) — đã bị t143-pack thay.
- tests/t133-analyze-idempotent.mjs (:15 chạy lại artifact tests/tmp/t132/run-2026-11-01T04-08-52-492Z) — FAIL A1 và A12 với `proved C2,C3,C4,C5,C6,C7,C8,C9 — unproved C1`, tức nó đỏ vì t132 cũ, không vì artefact vòng 23.
7 suite bắt buộc trên REPO THẬT đều EXIT 0: t10 50/50 · t128 22/22 · t129 13/13 · t113 38/38 · t114 16/16 (frozen=13, helperRecords=13, problemsOnDrift=2, problemsOnBadPin=2) · t115 43/43 · t98 --strict GREEN (SUMMARY tools=16 fields=112 reached=105 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 payload_contract_failures=0 allow_listed=7 allow_list_line_problems=0 roster_invariant_problems=0).

## 6. Findings

- **V23-F1 (medium)** — Phép kiểm tỉ lệ chỉ soi TỆP CSS, bản CSS nhúng trong lib/client.js không có phép kiểm ngữ nghĩa trực tiếp. tests/t128-panel-order.mjs:42 (`const css = fs.readFileSync(PANEL_CSS, …)`) và :427-448 (`gridProblems`/C1/C2 chỉ nhận cssText từ tệp đó); bản nhúng nằm trong lib/client.js (offset 76 366 của bản giải nén). Tái hiện: tests/tmp/t144/mutate.mjs phép M1 — đổi tỉ lệ CHỈ trong bundle, tệp CSS nguyên vẹn ⇒ sau khi re-pin hash, t10 50/50 xanh và t128 chỉ còn B3/X1/X2 đỏ. Đề xuất: thêm một phép kiểm byte-level “CSS nhúng trong bundle == rule tương ứng trong tệp .module.css” kèm đối chứng âm (cùng kiểu t128 đang làm với sourcesContent).
- **V23-F2 (low)** — tests/t128-panel-order.mjs:492-496 chỉ có 3 MAPPING_ANCHORS; segment call-site (gen 1940:16) không được anchor nào phủ ⇒ dịch 1 cột ở đó sống sót (M2), chỉ khi dịch segment định danh (1940:45) cổng mới đỏ (M2b). Đề xuất: thêm anchor cho chính dấu `(` của call site.
- **V23-F3 (medium)** — Bảng sweep `PASS=53 FAIL=4` dễ bị đọc thành 4 hồi quy, trong khi 3 suite (t132-panel-runtime, t132-panel-dom-order, t140-pack) đã lỗi thời theo thiết kế mà CHƯA được chuyển LEGACY kèm citation; suite thứ tư (t133) đỏ theo chúng. Đề xuất: thêm 3 mục LEGACY vào DEFAULT_EXCEPTIONS của tools/sweep-suites.mjs kèm citation dòng như 12 mục hiện có (tôi không sửa tools/** vì ngoài phạm vi).
- **V23-F4 (low)** — tests/t133-analyze-idempotent.mjs:15 ghim artifact t132 cũ, nên A1/A12 sẽ đỏ vĩnh viễn cho tới khi t132 được cập nhật; đề xuất trỏ về artifact vòng hiện hành hoặc chuyển LEGACY.
- **V23-F5 (info)** — Captain đo DependencyMap ở byte 182 377, audit đo 182 187 ký tự: cùng call site, khác hệ quy chiếu (UTF-8 byte vs code unit); khi trích “byte” cần nói rõ hệ.
- **V23-F6 (info)** — `panelColumnMain` còn 4 lần trong bản phát hành (CSS + JSX cột trái). Không phải lỗi (tên class chỉ còn dùng cho cột trái), ghi lại để tránh nhầm với dấu hiệu 1:1 của vòng 22.

## 7. Điều kiện hết hiệu lực

Verdict này gắn với ĐÚNG bộ byte sha256 62ad22758a405a9ad1c9e380b91a2ea5aef830e0a66a9a0bad2fde74f6c1d308 / 2 248 300 B / 133 entry, mốc 2026-11-01T14:52:00.000Z. Hết hiệu lực khi: (a) artefact được pack lại, di chuyển hoặc đổi 1 byte; (b) packages/dsh-agent-teams/lib/** hoặc package.json đổi 1 byte (kể cả sửa tay lib/client.js hay lib/client.js.map); (c) profile cài (desktop, agent-teams-rel23-audit) bị cài đè hoặc trỏ nơi khác. Riêng bố cục panel phải chấm lại bằng t10 + t128 + t129 nếu ActivityPanel.js, ActivityPanel.module.css hoặc vùng CSS grid trong lib/client.js đổi.

## 8. Limitations (tự khai)

- Lượt chạy suite: **22** so trần ≤12 (baseline 4 lượt, mutation 8 lượt, 1 lượt làm lại M2 sau khi phát hiện dịch nhầm segment, 7 suite bắt buộc, 2 lượt t133 để lấy nguyên văn). Lệnh shell ~10/30. Boot thật 0/2. Repack 2. Mutation 4 (trần ≥3 kiểu mới, không lặp kiểu của t139/t140/t141).
- Tôi KHÔNG chạy `t143-pack.mjs --analyze`; mọi số ở trên là tự đo (node:crypto + tar + npm pack + node build/build.mjs trong bản sao).
- Mọi phép ghi chỉ trong tests/tmp/t144; không ghi packages/dsh-agent-teams/**, build/**, tools/**, dist/**, tests/** ngoài tests/tmp/t144.
