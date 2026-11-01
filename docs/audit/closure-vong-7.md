# Audit closure vòng 7 — t62/t67 (CSS + planSave) · t65 (vá V6-F1) · t68 (tarball mới)

Người audit: **audit-goat** (độc lập, không viết mã t62/t65/t67/t68) · attempt `02c057e9-e416-459d-9088-9e0ed3042146` · 2026-10-31T20:15:52.424Z
Phạm vi: `docs/audit/**` + `docs/log/AUDIT.md` + `tests/tmp/audit-v7/**`. Mã nguồn chỉ ĐỌC, trừ 4 mutation TẠM THỜI đã khôi phục byte-identical (§3).

## 0. Verdict

**TARBALL t68: PHÁT HÀNH ĐƯỢC** — sha256 `03bed22f4bb2c7f0ada8bf16eeddf189047035795177bce54ed2abd3853fd99e`, **2 232 556 B**, **133 entry** (tự đọc tar, không tin `--analyze`); 3 chiều 11/11 SAME; 0 tệp cấm; bản CÀI trong profile `agent-teams-pack6` byte-identical với nguồn.
**CÔNG BỐ CHO NGƯỜI DÙNG: CHƯA** — vì **V7-F1 (high)**: `docs/bao-cao-agent-teams.md` vẫn chỉ cài tarball **t52** `5306f31b…bfb7` / 2 209 460 B với bundle `f8601251…` / 198 572 B — bản **không có `planSave`**; kèm **V7-F3 (low)**: `docs/TODO.md:76` còn `t68 | OPEN`.

## 1. Đối chiếu C1–C7

| Mục | Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|---|
| C1 | Tự sha256 + `tar -tzf` tarball t68 TRÊN ĐĨA | **ĐẠT** | `03bed22f…d99e` / 2 232 556 B / 133 entry; bản `repack/` **cùng sha256** ⇒ pack xác định; 12/12 entry bắt buộc có; cấm: node_modules 0, `package/tests/` 0, `.tgz` lồng 0, `.pid` 0, `package/tools/` 0. |
| C2 | Tự giải nén, hash 11 tệp vs nguồn (3 chiều) | **ĐẠT** | 11/11 SAME (tools `a01b1a1018cb`/194 888 · members `1562be4d527d`/99 402 · state `7b49f5ab1d46`/56 282 · snapshot `92ecdd8759b6`/11 687 · index `2d28e617f068`/45 315 · tool-names `e3def5db908d`/808 · client.js `42f51e8e65af`/251 789 · map `3b85de13f43e`/391 373 · members.d.ts `b1ffe1544003`/27 660 · ActivityPanel.module.css `53ea47c6d780`/51 837 · package.json `92a6404071e4`/10 498). |
| C3 | Đếm `aYQbCq_` ≥ 140 + có `planSave` trong bundle **ĐÃ CÀI** | **ĐẠT** | Bản cài `C:/Users/thang/.dsh/profiles/agent-teams-pack6/node_modules/@nami/dsh-agent-teams`: client.js sha `42f51e8e…` = nguồn, **719 lượt** token / **150 tên phân biệt**, có `aYQbCq_planSave`, `data-add-member`, `data-member-route-control`; CSS cài sha `53ea47c6…` = nguồn, 141 lớp, `planSave:disabled` có mặt; `lib/tools.js` cài = `a01b1a1018cb`. |
| C4 | Mutation (a) xoá RULE NHÓM chứa lớp đang dùng | **ĐẠT một nửa — xem V7-F2** | (a1) xoá rule nhóm 6 selector `:focus-visible` (`.aYQbCq_badge,.iconButton,.memberRow,.membersToggle,.sectionToggleTitle,.dagNode`) ⇒ t62 **vẫn 17/17 PASS** (lỗ hổng). (a2) xoá rule nhóm `.badgeCount,.memberCount,.teamStats,.stageLabel,.taskId` ⇒ t62 **EXIT 1**, `FAIL 2 … 138 classes`, `FAIL 5 … missing: badgeCount`. |
| C5 | Mutation (b) bỏ `source` ⇒ t58 đỏ | **ĐẠT** | Bỏ `source: ROUTE_SOURCE,` (`tools/erp-route-migrate.mjs:361`, sha `0d1711945ec7`/21 351 B → `0d84ba7415d6`) ⇒ t58 **EXIT 1**, `# 13/23 passed`, đỏ đúng `f1 ROUND-TRIP` + `f2 CASE ÂM`. Khôi phục sha trùng. |
| C6 | Mutation (c) `at` thành chuỗi ⇒ readTeam từ chối | **ĐẠT** | `at = String(Date.now())` (sha `7e1971993b9c`) ⇒ t58 **EXIT 1** `# 13/23`; probe riêng `tests/tmp/audit-v7/probe-boundary.mjs`: `at` chuỗi ⇒ `invalid AgentTeams state in team "erp-erp": members[7] is not a valid member record`, `at` số + `source` hợp lệ ⇒ đọc được 14 member. |
| C7 | Chạy lại toàn bộ suite | **ĐẠT** | 23 suite thuần **EXIT 0** (log `tests/tmp/audit-v7/sweep/*.log`), 12 suite `--analyze` **EXIT 0** (§5). |

## 2. Tự đo thay vì tin `--analyze`
| Phép đo | Kết quả |
|---|---|
| sha256 tarball t68 (đọc byte trên đĩa) | `03bed22f4bb2c7f0ada8bf16eeddf189047035795177bce54ed2abd3853fd99e` |
| size / entry | 2 232 556 B / 133 (khớp `meta` của t68 ⇒ không drift) |
| hai lần pack độc lập | `tests/tmp/t68/…tgz` và `tests/tmp/t68/repack/…tgz` **cùng sha256 + cùng size** |
| 3 chiều payload vs nguồn | 11/11 SAME, 0 mismatch |
| bản CÀI | `@nami/dsh-agent-teams 0.2.0-dev.0`, 0 dependency, 24 peer; `lib/index.js` nạp thật trong node: 5 named export (`Config, apply, inject, name, usageSectionText`) |
| 11 hash đóng băng của nguồn | 11/11 khớp (sha + byte) |
| `tools/erp-route-migrate.mjs` | `0d1711945ec7…` / 21 351 B; tự gọi `readTeam(stateRoot, teamId)` sau khi ghi (`:394-395`), `ROUTE_SOURCE = 'profile'` |

## 3. Mutation tự làm (khác cách captain yêu cầu ở điểm nào)
| # | Tệp:neo | Sửa | Phản ứng | Phục hồi |
|---|---|---|---|---|
| A1 | `lib/client/ActivityPanel.module.css` — rule nhóm 6 selector `:focus-visible` (277 B) | xoá cả rule | t62 **17/17 PASS** ⇒ **lỗ hổng V7-F2** | sha `53ea47c6…` trùng |
| A2 | cùng tệp — rule nhóm `.badgeCount,.memberCount,.teamStats,.stageLabel,.taskId` (125 B) | xoá cả rule | t62 **EXIT 1**: `FAIL 2 prefixed classes >= 139 — 138 classes`, `FAIL 5 … missing: badgeCount` | sha trùng |
| B | `tools/erp-route-migrate.mjs:361` | bỏ `source: ROUTE_SOURCE,` | t58 **EXIT 1** `13/23`, đỏ `f1`+`f2` | sha `0d171194…` trùng |
| C | `tools/erp-route-migrate.mjs:353` | `at = String(Date.now())` | t58 **EXIT 1** `13/23` + probe biên từ chối | sha trùng |

## 4. Probe biên bền (độc lập với công cụ, `tests/tmp/audit-v7/probe-boundary.mjs`)
| Hình dạng `routeOverride` | `readTeamSync` | Ghi chú |
|---|---|---|
| `{provider, model, source:'profile', at:<số>, by}` | **nhận**, 14 member | đúng hình dạng `tools/erp-route-migrate.mjs` ghi ⇒ **V6-F1 đã đóng thật** |
| `at` là **chuỗi** | **từ chối** `members[7] is not a valid member record` | biên bền là thật, không phải lời khai |
| thiếu `source` | **từ chối** | như trên |
| `source:'tool'` (ngoài union) | **từ chối** | muốn dùng `'tool'` phải sửa `lib/state.js:675` — t65 chọn `'profile'` là đúng, không phải sửa lib |
| legacy: **không có** `routeOverride` | **nhận**, 14 member | tương thích dữ liệu ERP cũ giữ nguyên |

`E:/Project/ERP/.agent-teams/erp-erp/team.json` sau toàn bộ probe: sha `9f7420b6…15f2d1e` / 1 533 117 B **không đổi** (mọi phép ghi rơi vào `tests/tmp/audit-v7/boundary/`).

## 5. Suite chạy lại
- **23 suite thuần, tất cả EXIT 0**: t3 18/18 · t4 22/22 · t10 **40/40** · t15 21/21 · t20 15/15 · t24 12/12 · t28 20/20 · t30 8/8 · t37 14/14 · t38 17/17 · t39 11/11 · t40 20/20 · t43 19/19 · t44 11/11 · t46 15/15 · t48 6/6 · t49 16/16 · t50 11/11 · t54 14/14 · t56 12/12 · t57 29/29 · **t58 23/23** · **t62 17/17**.
- **12 suite `--analyze` EXIT 0**: t68 (drift=0 trên 11 tệp, 2 lần pack cùng sha256, bundle ≥141 lớp + planSave) · t63 · t52 · t59 (`proved C1..C9`) · t11 · t18 · t21 · t35 · t42 · t45 · t51 · t27 (16/16).

## 6. Phát hiện
**V7-F1 · high · báo cáo người dùng chỉ cài bản CŨ (thiếu `planSave`)**
- `docs/bao-cao-agent-teams.md:36` (bundle `f86012517284…`/198 572 B), `:49` (`5306f31bc1ad…bfb7` + 2 209 460 B), `:53`, `:75`, `:95-96`, `:127-128` — toàn bộ vẫn là **t52**.
- Đo thật bản phát hành hiện tại: t68 `03bed22f…d99e` / 2 232 556 B, bundle `42f51e8e…` / 251 789 B, CSS `53ea47c6…` / 51 837 B. Tarball t52 **không chứa** CSS `planSave` (CSS trong t52 là 50 992 B) ⇒ người dùng làm theo báo cáo sẽ cài lại đúng lỗi t67 vừa vá.
- Tái hiện: `grep -n '5306f31b\|f8601251\|198 572\|2 209 460' docs/bao-cao-agent-teams.md` → 8 dòng; `grep -n '03bed22f\|42f51e8e' docs/bao-cao-agent-teams.md` → 0 dòng.
- Đề nghị: cập nhật §3/§4 (sha, size, entry, số lớp CSS, số case t62 17/17) + câu "tarball cũ không dùng để phát hành" như vòng 5 đã làm.

**V7-F2 · medium · t62 không bắt được mất RULE BIẾN THỂ (state variant)**
- Mutation A1 xoá cả rule nhóm `.aYQbCq_badge:focus-visible,.iconButton:focus-visible,.memberRow:focus-visible,.membersToggle:focus-visible,.sectionToggleTitle:focus-visible,.dagNode:focus-visible{outline:…}` — t62 vẫn `# 17/17 passed`: bộ test chỉ kiểm **tên lớp có mặt ở đâu đó** + một check riêng cho `planSave:disabled`, nên mọi biến thể `:hover/:focus-visible/:disabled` của lớp khác có thể biến mất mà không ai báo.
- Đây là cùng lớp lỗi đã gây ra sự cố CSS gốc (panel mất style) nhưng ở mức biến thể; rủi ro thấp hơn (chỉ mất outline/hover), nên xếp medium chứ không blocker.
- Đề nghị: thêm vào `tests/t62-css-completeness.mjs` phép đếm **số rule theo từng hậu tố** (`:hover`, `:focus-visible`, `:disabled`, `:active`) cho các lớp đang dùng, sàn theo số đo hiện tại (ví dụ `:focus-visible` ≥ 6), hoặc bật `CSS_BYTES_MIN` lên 51 500 B.

**V7-F3 · low · `docs/TODO.md:76` còn `| t68 | OPEN |`** trong khi t68 đã XONG (14/14, tarball đã đo). Cùng file, t62/t65/t67 đã `VERIFIED` (dòng 70/73/75) ⇒ chỉ sót 1 dòng.

**V7-F4 · info · suite pack chỉ chấm lại `meta`** khi chạy `--analyze` (t68 `:428,:431` đọc `meta.exports`): tôi không dùng `--analyze` làm bằng chứng, mà tự hash/tar (bảng §2). Cùng lớp đã ghi ở vòng 3/5.

**V7-F5 · info · con số "16/16 named export"** của t68 là **17 tên kỳ vọng trên 4 module** (`EXPECTED_EXPORTS` tại `tests/t68-pack-css.mjs:555-558`), không phải "`lib/index.js` có 16 export" — tôi nạp bản cài và thấy `lib/index.js` có đúng 5 export. Câu chữ trong `docs/kiem-thu/t68-pack-css.md` nên ghi rõ "4 module" để người đọc sau không hiểu sai.

## 7. Giới hạn của audit này
- Không bấm GUI thật trong phiên sống (vẫn là khoảng trống đã biết; bằng chứng UI = SSR/bundle harness `t10` 40/40 + hash bản cài trùng nguồn).
- Không boot lại profile `agent-teams-pack6` (tốn quota): thay bằng chứng minh **byte**: client.js/CSS/tools.js bản cài = nguồn, và `lib/index.js` nạp thật trong node.
- 4 suite pack chỉ chạy `--analyze` (V7-F4); không `npm publish`, không commit; không sửa `lib/**`, `build/**`.
- Số lệnh shell đã dùng: 14/30 · mutation: 4 · attempt: 1/3.

## 8. Điều kiện để công bố
1. **V7-F1** (bắt buộc) — cập nhật `docs/bao-cao-agent-teams.md` sang t68 `03bed22f…` / 2 232 556 B / 133 entry, bundle `42f51e8e…` / 251 789 B, CSS `53ea47c6…` / 51 837 B; owner: người viết báo cáo.
2. **V7-F3** (bắt buộc) — `docs/TODO.md:76` → `VERIFIED` kèm kết quả t68; owner: thư ký hồ sơ.
3. **V7-F2** (nên làm, không chặn phát hành) — thêm sàn rule biến thể vào t62; owner: test.
4. Sau khi sửa 1–2: **không pack lại** trừ khi `lib/**` đổi; nếu đổi, chạy lại t68 rồi audit lại tarball (quy tắc từ t53).
