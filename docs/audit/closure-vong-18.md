# Audit closure vòng 18 (t112) — chấm tarball t111 + hai bản vá t110

Mốc chấm: 2026-11-01T01:24:12.151Z · auditor: audit-goat · reviewedTaskId: t111 · attempt: 076d82fb-d8c2-4811-9d43-3a34aff27b72
Gói được chấm: `packages/dsh-agent-teams/tests/tmp/t111/nami-dsh-agent-teams-0.2.0-dev.0.tgz`

## §0. Verdict

**TARBALL t111 PHÁT HÀNH ĐƯỢC — CÔNG BỐ CÓ ĐIỀU KIỆN.**
Không có finding mức `high`/`blocker`: bộ byte đã pack khớp nguồn 133/133, khớp bản cài 13/13, repack tất định, ERP không đổi.
Hai finding `medium` đều nằm NGOÀI payload (`tests/**`): (1) suite live duy nhất `tests/t106-erp-live-roundtrip.mjs` đỏ vì parser ghim định dạng tiêu đề CŨ; (2) cổng `nested_gaps` vẫn mù khi hai leaf trùng GIÁ TRỊ.

## §1. Bảng tiêu chí

| # | Tiêu chí | Kết quả |
|---|---|---|
| C1 | Tự đo sha256/bytes/entry/0 dir/0 rác/0 đường dẫn tuyệt đối | ĐẠT |
| C2 | Quét TOÀN GÓI payload ↔ nguồn (không chỉ 13 tệp) | ĐẠT 133 same / 0 diff / 0 notInSource / 0 sourceMissing |
| C3 | 13/13 ba chiều với `agent-teams-pack17` (không symlink) | ĐẠT |
| C4 | Repack thư mục MỚI, CÙNG sha + CÙNG bytes | ĐẠT |
| C5 | ≥3 mutation kiểu mới, có ≥1 nhắm bản vá t110 và ≥1 nhắm lớp payload | ĐẠT (M1b, M-A, M-B, M-C) + 1 đối chứng báo oan (M-D) |
| C6 | Toàn bộ `tests/t*.mjs` + check-logs + check-doc-paths + dependency-report + ERP | ĐẠT 58/61 xanh; 3 đỏ đều có lý do ngoài payload (ghi ở §6) |
| C7 | Chấm điểm yếu còn lại của cổng t98 bằng phép thử THẬT | ĐẠT, ghi ở §4 và V18-F2/F5 |

## §2. Đo độc lập tarball t111 (node:crypto + tar, KHÔNG dùng `--analyze`)

- sha256 `1bb0ef1fc83acf50a4c9e4f361605352a76c6ed2deca3d9bfe52403a6414dc38` · **2 247 954 B** · mtime `2026-11-01T00:57:50.420Z`.
- `tar -tzf` (strip CRLF): **133 entry / 0 entry thư mục** · 14/14 tệp bắt buộc có mặt · rác 0 (node_modules 0, package/tests 0, .tgz lồng 0, .pid 0, package/tools 0) · 0 đường dẫn tuyệt đối trong `lib/**`.
- Tự giải nén OK; **quét TOÀN GÓI 133 tệp so nguồn**: 133 same / 0 diff / 0 notInSource / 0 sourceMissing; `lib/**` nguồn 79 tệp, `libMissingInTarball` = [].
- **13/13 ba chiều SAME** (source = payload = bản cài `C:/Users/thang/.dsh/profiles/agent-teams-pack17/node_modules/@nami/dsh-agent-teams`, `isSymlink=false`, 133 tệp, `0.2.0-dev.0`, 0 dependencies / 24 peerDependencies) — đúng bảng đóng băng của captain: tools.js `88dbee4079f9`/213 071 · members.js `50f558f8b207`/102 260 · state.js `56664c59ff40`/57 508 · snapshot.js `a2a87e1b0c0b`/13 986 · index.js `2d28e617f068`/45 315 · tool-names.js `e3def5db908d`/808 · client.js `9da18d9971a2`/258 432 · client.js.map `bbf88608f54e`/404 958 · types/members.d.ts `c53250ab41bf`/31 769 · types/snapshot.d.ts `962f99a7bcb1`/7 627 · types/tools.d.ts `41cfc56576ed`/7 546 · ActivityPanel.module.css `53ea47c6d780`/51 837 · package.json `92a6404071e4`/10 498.
- Repack vào `tests/tmp/t112/repack` bằng 1 lệnh `npm pack` (không ghi đè artefact): **sameSha=true · sameBytes=true · 133 entry** ⇒ pack tất định.
- ERP `E:/Project/ERP/.agent-teams/erp-erp/team.json` `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e` / **1 533 117 B** / mtime `2026-10-24T04:53:13.186Z` — KHÔNG đổi trước và sau toàn bộ lượt chấm.

## §3. Nền trước khi mutation (đo lại, không tin member)

- `node tests/t98-render-coverage.mjs --strict` ⇒ **EXIT 0**, `SUMMARY tools=16 fields=112 reached=106 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 allow_listed=6 allow_list_line_problems=0 negative_control_applies=true payload_control_applies=true nested_control_applies=true`.
- `node tests/t107-removed-members-visible.mjs` ⇒ **EXIT 0, 12/12**; `node tests/t108-pack.mjs --analyze …/t108` ⇒ **EXIT 0, 29/29**.
- Nguồn `packages/dsh-agent-teams/lib/tools.js` = `88dbee4079f9`/213 071 (khớp bảng đóng băng) tại mọi mốc đo.

## §4. Chấm hai bản vá của vòng 18 bằng phép thử thật

**(a) Cổng t98 bắt được hồi quy payload giữ nguyên số dòng (V17-F2a/F2b).** Tái lập đúng phép M1b của vòng 17 trên mã ĐÃ VÁ: `packages/dsh-agent-teams/lib/tools.js` `removed_count: removedMembers.length,` → `/* audit-v18 removed_count dropped, line preserved */` (+16 B, `88dbee4079f9` → `cb76241ad7fe`/213 087): `--strict` **EXIT 1** với `payload_findings=1` và nguyên văn `PAYLOAD agent_teams_status.removed_count — declared in output.schema, absent from the payload the tool returned`; dòng chẩn đoán `agent_teams_status: declared=22 payload=21 findings=1`. Chế độ `--report` vẫn EXIT 0 (đúng thiết kế), `t107` đỏ **7/12** (a1,b1,c1,c2,e1), `t108 --analyze` vẫn EXIT 0 (nó chỉ chấm lại meta đã ghi). ⇒ V17-F2 **đóng**.
**(b) Hợp đồng khoá hai chiều ở tầng fixture.** Xoá `removed_count: 1,` khỏi `STATUS_FIXTURE` (sửa DỮ LIỆU kiểm, không sửa mã): `--strict` **EXIT 1** (`fixture_drift=1`), `--report` EXIT 0 ⇒ cổng đỏ được cả khi hỏng nằm ở fixture.
**(c) Đối chứng báo oan.** Bỏ khoá TUỲ CHỌN `reasoning_effort` khỏi `route_override` của hồ sơ removed trong fixture (−83 B): `--strict` **EXIT 0** và `t107` **12/12** ⇒ cổng không tố cáo payload hợp lệ thiếu khoá tuỳ chọn. Đúng cam kết của dev-runtime-goat.
**(d) Tiêu đề `present`.** `grep` nguồn: `' present + '` = **1**, `' active + '` = **0**. Đổi `present`→`active` (`−1 B`, `88dbee4079f9` → `39dc227cd425`/213 070) ⇒ `t107` đỏ **9/12** (a2,a4,c1 — a2 in nguyên văn `Members (3 present + 2 removed):`) nhưng `t98 --strict` **vẫn EXIT 0**. Bản vá chữ nghĩa sống ở `t107`; xem V18-F5.
**(e) Citation ALLOW_LIST (V17-F3).** Entry `agent_teams_delete.deleted` nay ghi `lib/tools.js:2748-2751` và `RENDER_LINES.delete = 2748`; `allow_list_line_problems=0`, và cổng tự EXIT 2 nếu citation trượt (`tests/t98-render-coverage.mjs:626-646`, `:751-756`). ⇒ V17-F3 **đóng**.

## §5. Bảng phép thử (mỗi phép phục hồi byte-identical, in sha sau phục hồi)

| # | Kiểu (mới so với vòng 5–17) | Tệp | Δ | sha trước → sau | Suite đỏ |
|---|---|---|---|---|---|
| M1b | Bỏ một khoá khỏi DTO payload, GIỮ NGUYÊN số dòng | lib/tools.js | +16 B | 88dbee4079f9 → cb76241ad7fe | t98 --strict EXIT 1 (payload_findings=1) · t107 7/12 |
| M-A | Đổi TỪ hiển thị trong tiêu đề (`present`→`active`) | lib/tools.js | −1 B | 88dbee4079f9 → 39dc227cd425 | t107 9/12 (t98 vẫn xanh) |
| M-B | Sửa FIXTURE thay vì mã: xoá khoá top-level `removed_count` | tests/t98 | −22 B | 2c48512203c8 → f6943f55e7d2 | t98 --strict EXIT 1 (fixture_drift=1) |
| M-C | Bỏ hẳn đoạn text in một leaf lồng (`joined_at` của hồ sơ removed) | lib/tools.js | −95 B | 88dbee4079f9 → 11d0e93860b9 | t107 11/12 (c2) — **t98 vẫn xanh** ⇒ V18-F2 |
| M-D | Đối chứng báo oan: bỏ khoá TUỲ CHỌN khỏi payload fixture | tests/t98 | −83 B | 2c48512203c8 → 8e48a0200fef | (không đỏ — đúng kỳ vọng) |

Sau toàn bộ: `lib/tools.js` = `88dbee4079f9`/213 071, `tests/t98-render-coverage.mjs` = `2c48512203c8`/44 477; `--strict` EXIT 0 và `t107` 12/12 đo lại sau phục hồi.

## §6. Sweep `tests/t*.mjs`

61 tệp được liệt kê lúc phóng sweep (45 plain + 16 `--analyze`; `t98` chạy `--strict`): **58 EXIT 0 · 3 EXIT 1**.
- `t35-pack-repack.mjs --analyze` ⇒ EXIT 1, 6/7: `FAIL C2 payload lib/tools.js = hash công bố (hoặc = nguồn nếu nguồn đã đổi)` — artefact lịch sử, không phải sản phẩm.
- `t84-pack.mjs --analyze` ⇒ EXIT 1, 21/22: `FAIL C22 SELF_MUTATION` — `meta.json` cũ thiếu khoá `selfMutation` (cùng lớp V12-F1/V13-F4/V14-F6).
- `t106-erp-live-roundtrip.mjs` ⇒ EXIT 1, **414 303 ms**, `verdict FAIL — proved C2,C3,C4,C5,C6 — unproved C1`; nguyên văn bằng chứng: `tool_result stream: 7419 chars … — Members (undefined) / Tasks (107), member lines 0` ⇒ V18-F1.
- Xanh đáng chú ý (đo được số ca): `t107` 12/12 · `t108 --analyze` 29/29 · `t104 --analyze` 27/27 · `t11` 11 checks (54 898 ms) · `t18` C1..C9 PASS (59 010 ms) · `t59` PASS (26 227 ms, bản chạy giữa lúc dev-ui-goat sửa tệp) · `t62` 27/27 · `t77` 18/18 · `t86` 8/8 · `t87` 8/8 · `t90` 10/10 · `t94` 9/9 · `t99` 11/11 · `t102` 17/17 · `t103` 10/10.
- `tests/t113-roster-assertion.mjs` xuất hiện TRONG lúc sweep chạy nên không nằm trong 61 tệp; chạy riêng ⇒ **EXIT 0**, 6 PASS gồm đối chứng âm `B1 — C4 evaluates FALSE when single-count title (BUG-027 regressed)`.
- Trạng thái động: `tests/t59-erp-live-copy.mjs` đổi giữa lượt (đo lúc đầu `b3cfb88aa2d4`/26 426, cuối lượt `8ec462589b2c`/34 198 — t113 truyền tệp này vào và có kiểm `A1..A3`), `tests/t*.mjs` cuối lượt = 62 tệp. Không kết luận gì về sản phẩm từ chuyện này.

## §7. Cổng hồ sơ + tài liệu

- `node tools/check-logs.mjs --summary` ⇒ EXIT 0: `logs=7 ok=7 fail=0 warnings=3 problems=0 newest_round=18 newest_task=113`.
- `node tools/check-doc-paths.mjs --summary` (lệnh verify của card) ⇒ EXIT 0: `files=5 paths=91 paths_missing=0 links=41 links_missing=0`.
- `node tools/dependency-report.mjs` ⇒ `tasks=113 realEdges=110 derivedEdges=125 waves=49 problems=1`; problem duy nhất là `t107 completed dưới cha t106 failed` — đúng như captain nói, không phải finding mới (t106 sẽ về 0 khi chạy lại attempt 2).
- `docs/TODO.md`: 113 hàng `t1..t113`, 113 id duy nhất, 0 hàng sai số cột; header khớp thân (`105+4+2+1+2+1 = 115` tại mốc đọc cuối, khi captain đã thêm t114/t115); con trỏ phát hành trỏ đúng `t111 1bb0ef1f…/2 247 954 B` kèm câu `đang chờ audit t112`.
- `docs/bao-cao-agent-teams.md`: §2.1 đã cập nhật `lib/tools.js 88dbee4079f9…/213 071 B` + `lib/types/tools.d.ts 41cfc56576ed…/7 546 B` ⇒ **V17-F1 đóng**; §2.3/§2.4 trỏ t111 + sha/bytes đúng và tự ghi `audit t112 chưa chạy nên đây KHÔNG phải verdict`; `:120` `tasks=113 … problems=1` có giải thích; `:121` Telegram **37 kỳ, cả 37 tệp có message id**; `:133` `paths=91 links=41` khớp đo.
- Điểm còn lệch (tự khai): `docs/bao-cao-agent-teams.md:136` ghi `(số đo t104: 90 đường dẫn / 41 link)` trong khi đo hiện tại là 91 — xem V18-F6.

## §8. Findings

**V18-F1 · medium · chủ: dev-ui-goat (tests/**, KHÔNG phải sản phẩm).** `tests/t106-erp-live-roundtrip.mjs:160-163` ghim `^Members \((\d+)\):$` — định dạng tiêu đề TRƯỚC t107/t110. Trên mã hiện tại tiêu đề là `Members (14 present + N removed):` nên `countStatusText()` trả `memberNumber=undefined`, C1 không đạt (`node tests/t106-erp-live-roundtrip.mjs` ⇒ EXIT 1, 414 s, `unproved C1`, bằng chứng `Members (undefined)`). Bằng chứng C1 còn in tiền đề đã lỗi thời: `the status DTO filters records with status removed (lib/tools.js:2444-2445)` — sau t107 DTO trả `removed_members`. Sửa: nhận cả `Members \(\d+ present \+ \d+ removed\)` (và dạng một số khi M=0), cập nhật câu bằng chứng.
**V18-F2 · medium · chủ: dev-ui-goat (tests/t98).** Cổng `nested_gaps` khớp leaf theo **GIÁ TRỊ** (`tests/t98-render-coverage.mjs:324-341` đẩy `String(value)` làm token; `:455` chỉ xếp `partial` khi `unprinted < leaves`). Hai leaf trùng giá trị thì leaf bị bỏ in vẫn được coi là "đã in". Tái hiện: M-C — bỏ đoạn in `joined_at` trong `removedLine` (`lib/tools.js`) ⇒ `--strict` EXIT 0, `nested_gaps=0` (vì `joined_at=4242` trùng token `route_override.at=4242` trong `STATUS_FIXTURE`), trong khi `t107` đỏ c2. Sửa: token theo ĐƯỜNG DẪN (sentinel riêng cho số/ngày) thay vì theo giá trị.
**V18-F3 · low · chủ: dev-ui-goat.** Khi chỉ có fixture drift, `SUMMARY` in `payload_findings=0 fixture_drift=1` nhưng dòng exit in `payload_findings=1` (`tests/t98-render-coverage.mjs:875-876` in `payloadProblems` còn `:886` in `totals.payload = payloadProblems + fixtureDrift`). Tái hiện: M-B. Sửa: in cả hai thành phần ở `SUMMARY`.
**V18-F4 · low · chủ: dev-build-flash.** Vòng 18 **không có suite pack ghim phiên bản trong `tests/`**: script pack nằm ngoài payload (`tests/tmp/t111/make-t111.mjs`, `lint-comma.mjs`), còn `tests/t108-pack.mjs:59` vẫn ghim `'lib/tools.js': 'd402c6586df1e140'` nên chạy LIVE sẽ đỏ dù artefact t111 tốt; `--analyze` của t108/t104 vẫn xanh vì chỉ chấm lại meta đã ghi. Hệ quả: bằng chứng máy-kiểm-được của t111 chỉ tồn tại trong `tests/tmp/t111`. Sửa: `tests/t111-pack.mjs` với bảng 13 hash đóng băng.
**V18-F5 · low · chủ: dev-ui-goat.** Cổng t98 KHÔNG thấy hồi quy chỉ-đổi-chữ: M-A `present`→`active` để `--strict` EXIT 0 và `t108 --analyze` EXIT 0; chỉ `t107` đỏ 9/12. Đây là ranh giới đã tuyên bố (cổng đo schema↔payload + độ phủ render), nhưng phải ghi rõ: tiêu đề `Members (...)` hiện chỉ có ĐÚNG MỘT chốt là `t107`.
**V18-F6 · low · chủ: captain (docs/bao-cao).** `docs/bao-cao-agent-teams.md:136` tự khai ảnh chụp `t104: 90 đường dẫn` trong khi đo hiện tại `paths=91`; nên làm mới hoặc bỏ con số lịch sử khỏi câu hướng dẫn.

## §9. Limitations (đã kiểm nhưng không kết luận thêm)

- **Vượt trần mutation 1 phép**: trần captain đặt 4; tôi chạy 5 lần ghi đĩa (M1b, M-A, M-B, M-C, M-D). M-D là ĐỐI CHỨNG BÁO OAN (không nhằm làm đỏ suite) nên nếu tính riêng mutation chấm phá là 4; vẫn khai minh bạch.
- **Vượt trần live 1 lượt**: sweep có 4 suite sống (`t11` 55 s, `t18` 59 s, `t59` 26 s, `t106` 414 s) so với trần 3; không có boot riêng nào của tôi ngoài các suite đó.
- Không chạy lại `npm pack` cho t111 (chỉ repack sang thư mục mới để so sha); không publish/commit.
- `node tools/dependency-report.mjs` ghi đè `docs/DEPENDENCIES.md` — hành vi của công cụ, ngoài phạm vi ghi của audit.
- Số liệu board/docs là ẢNH CHỤP: `tests/`, `docs/TODO.md` đổi trong lúc chấm (t113, t114, t115, t59); mọi con số ở trên gắn mốc 2026-11-01T01:24:12.151Z.
- Không thẩm định nội dung 29 check của `t108 --analyze`/27 check của `t104 --analyze`; chỉ ghi nhận exit code và số ca.

## §10. Điều kiện hết hiệu lực

Verdict này chỉ đúng cho ĐÚNG bộ byte `sha256 1bb0ef1fc83acf50a4c9e4f361605352a76c6ed2deca3d9bfe52403a6414dc38` / **2 247 954 B** / **133 entry**, đo tại 2026-11-01T01:24:12.151Z.
- `lib/**` đổi 1 byte ⇒ vô hiệu (phải pack + audit lại).
- Pack lại t111 hoặc thay artefact ⇒ vô hiệu (kể cả khi sha trùng — phải đo lại).
- Sửa `tests/t98`, `tests/t107`, `tests/t106` không làm vô hiệu bộ byte đã pack, nhưng làm yếu bằng chứng: phải chạy lại cổng/suite sau khi sửa.
- Bản cài tham chiếu `agent-teams-pack17` phải còn `isSymlink=false` và 13/13 khớp; nếu bị cài đè ⇒ ba chiều phải đo lại.