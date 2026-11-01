# t18 — kiểm LIVE hot-switch route của member đang chạy (bộ kiểm đã vá)

Mục tiêu: `tests/t18-hot-switch-e2e.mjs` phải chấm ĐÚNG sản phẩm kể cả khi captain tự
kết thúc và archive team (`agent_teams_delete`) trong cùng phiên, trước khi analysis chạy.

## Ba lỗi của bộ kiểm cũ (đo được trên artifact `tests/tmp/e2e-hotswitch/2026-11-01T05-56-13`)

1. `promptOne` không cấm `agent_teams_delete`, nên model tự gọi thêm bước đó; tệp
   `.agent-teams/e2e-hotswitch/team.json` biến mất (chỉ còn bản trong `.agent-teams/archive/`).
2. `readTeamFile` chỉ tìm `.agent-teams/<team>/team.json` ⇒ `team`/`memberRecord` undefined ⇒
   `findTranscript(memberRecord.id)` không chạy ⇒ C6/C7/C8 trượt theo (C2 trượt ở vế id).
3. C4/C9 đọc đường dẫn sống nên đỏ oan dù bản ARCHIVE có đủ
   `routeOverride {provider opencode-go, model deepseek-v4.1-flash, reasoningEffort high, source captain}`.

## Đã sửa (chỉ trong tệp test, không chạm `packages/**`)

- A1 `promptOne` thêm câu: `NEVER call agent_teams_delete or archive the team ...`.
  `readTeamFile` quét LIVE trước, rồi `.agent-teams/archive/<team>/team.json`, rồi
  `.agent-teams/archive/*/team.json`; trả `{team, path, files, source}` và in
  `[t138] roster doc tu ARCHIVE (live da bi don): <path>` khi phải dùng bản archive.
  C4 in kèm `doc tu: LIVE|ARCHIVE <path>`, C9 chọn stateRoot theo `teamFile.source`.
- A2 member id KHÔNG lấy từ team.json sống: `resolveMemberId` đọc kết quả
  `agent_teams_create` (dòng `- worker-a (... id <uuid>)`), fallback roster (live/archive).
  C2 in `member id=<uuid> qua <nguồn>`.
- A3 `findTranscript(memberId, workspace)` trả `{path, tried, how}`: thử slug suy từ workspace
  trước, rồi mọi slug, rồi đối chiếu nội dung; thiếu transcript ⇒ C6/C7 in
  `KHONG tim thay transcript ... da thu: <mọi đường dẫn đã thử>`.
- C8 siết lại: `attempt trước === attempt sau` VÀ `attemptId` của team record xuất hiện
  trong transcript của member (bỏ nhánh dễ dãi `claimAttemptId !== undefined`).
- CLI fail-closed: cờ lạ ⇒ EXIT 2, `--analyze|--negative` thiếu giá trị ⇒ EXIT 2,
  hai cờ cùng lúc ⇒ EXIT 2. `--analyze` không ghi `result.json` vào artifact.

## Cách chạy

```
node tests/t18-hot-switch-e2e.mjs --analyze tests/tmp/e2e-hotswitch/2026-11-01T05-56-13
node tests/t18-hot-switch-e2e.mjs --negative tests/tmp/e2e-hotswitch/2026-11-01T05-56-13
node tests/t18-hot-switch-e2e.mjs            # LIVE: 2 phiên thật, ~2-4 phút
```

## Kết quả đo (máy này, profile `agent-teams-test`)

| Mục | Nội dung | Kết quả |
| --- | --- | --- |
| A1 | prompt cấm archive/delete + fallback đọc archive, in rõ nguồn | ĐẠT — `[t138] roster doc tu ARCHIVE (live da bi don): ...\.agent-teams\archive\e2e-hotswitch\team.json` |
| A2 | member id độc lập team.json sống | ĐẠT — id `cdca2907-44ef-4934-9ff6-8e70ae227569` lấy từ result `agent_teams_create` |
| A3 | thiếu transcript ⇒ FAIL nêu đường dẫn đã thử | ĐẠT — ca N4: `red=C6,C7,C8`, evidence có `da thu: ` |
| A4 | `--analyze` trên artifact thật ⇒ 9/9 | ĐẠT — `verdict PASS - proved C1..C9; unproved none`, EXIT 0 |
| A5 | 3 phép đối chứng âm trên BẢN SAO trong `tests/tmp/t138` | ĐẠT — N1/N2/N3 (xem bảng dưới) |
| A6 | chạy LIVE lại | xem mục cuối |

`--analyze` in nguyên văn (rút gọn phần chú thích):

```
PASS C1 — agent_teams_create built a 2-member roster whose worker-a starts on opencode-go/kimi-k2.7-code
PASS C2 — member was working/running (spawned child session) when the route changed
PASS C3 — agent_teams_set_member_route reported applied to the LIVE session (text form of applied=live-and-durable)
PASS C4 — team.json records the new route for worker-a
PASS C5 — audit log gained the route-change row written by appendRouteChangeAudit
PASS C6 — member conversation carries the host model-changed notice
PASS C7 — the FIRST request after the notice ran the new route (previous request ran the old one)
PASS C8 — member kept its open attempt across the switch and finished that same attempt
PASS C9 — a cold process (no live session) re-read the route through the plugin own state reader
verdict PASS - proved C1,C2,C3,C4,C5,C6,C7,C8,C9; unproved none
```

## Đối chứng âm (A5) — mỗi ca chạy trên bản copy riêng, artifact gốc không bị sửa

| Ca | Đột biến | Kỳ vọng | Đo được |
| --- | --- | --- | --- |
| N1 | xoá event `[model changed: ...]` khỏi transcript | C6, C7 ĐỎ | `red=C6,C7 green=C1,C3,C5` ĐẠT |
| N2 | đổi provider/model của `request/header` SAU notice về route cũ | C7 ĐỎ | `red=C7 green=C6,C8` ĐẠT |
| N3 | xoá `attemptId` khỏi transcript | C8 ĐỎ | `red=C8 green=C6,C7` ĐẠT |
| N4 | member id không tồn tại ⇒ không có transcript | C6,C7,C8 ĐỎ + nêu đường dẫn đã thử | `red=C6,C7,C8`, `evidence_missed=none` ĐẠT |

Artifact đối chứng: `tests/tmp/t138/<stamp>/{N1..N4}/run` + `negative-controls.json`;
bản gốc `tests/tmp/e2e-hotswitch/2026-11-01T05-56-13` giữ nguyên (chỉ đọc).

## Giới hạn đã biết

- Bộ kiểm chỉ chấm trên transcript/mã nguồn, KHÔNG chứng minh UI desktop render gì.
- Nếu captain archive team bằng tay TRƯỚC khi bộ kiểm kịp chụp roster thì chỉ còn bản archive;
  bộ kiểm đọc bản đó và in rõ nguồn, không coi là PASS ngầm.
- Bước đối chiếu nội dung khi tìm transcript (fallback cuối) khớp theo chuỗi member id: một id
  giả có thể trùng với văn bản ở transcript khác, nên đối chứng âm dùng id ngẫu nhiên
  (`ffffffff-ffff-4fff-bfff-<timestamp>`), không dùng id toàn số 0.
- Mọi phép đối chứng âm ghi trong `tests/tmp/t138`; tệp tạm `tests/tmp/t138-*.txt` là log của
  các lần chạy tay trên máy này, không phải một phần của bộ kiểm.

## A6 — lần chạy LIVE lại (máy này, 2026-11-01)

`node tests/t18-hot-switch-e2e.mjs` ⇒ **EXIT 0**, `verdict PASS - proved C1..C9; unproved none`.
Artifact: `tests/tmp/e2e-hotswitch/2026-11-01T06-14-27` (session1 exit=1 sau 114 765 ms,
session2 exit=0 sau 51 363 ms — mã thoát của phiên headless KHÔNG phải kết luận của bộ kiểm,
kết luận nằm ở 9 phép chấm C1..C9 chạy trên artifact).

- Lần này model KHÔNG gọi `agent_teams_delete`: 5 tool call là `agent_teams_create,
  agent_teams_status, agent_teams_set_member_route, agent_teams_status, agent_teams_status`;
  `.agent-teams/e2e-hotswitch/team.json` còn nguyên ⇒ `result.json` ghi
  `teamFileSource=live`, `memberIdSource=agent_teams_create result`, `transcriptHow=slug workspace`.
- Chạy lại `--analyze` trên chính artifact mới này cũng PASS 9/9 (0 boot) — bộ kiểm không
  phụ thuộc artifact cũ.
- Đường lui archive vẫn được kiểm bằng artifact cũ `2026-11-01T05-56-13` (bản bị archive),
  nên cả hai nhánh LIVE và ARCHIVE đều có bằng chứng.
