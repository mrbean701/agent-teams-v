# t106 — E2E sống trên dữ liệu đội ERP thật (bản copy)

Mục tiêu: chứng minh Agent Teams **dùng được với ERP** ở mức đầu-cuối, bằng boot headless THẬT trên
BẢN COPY của `E:/Project/ERP/.agent-teams/erp-erp/team.json` (14 member / 107 task), kèm đối chứng âm
bằng bản cài cũ `agent-teams-pack14`. Tệp ERP thật chỉ được ĐỌC.

## Cách chạy

```bash
node tests/t106-erp-live-roundtrip.mjs                            # chấm lại từ artifact mới nhất (0 boot)
node tests/t106-erp-live-roundtrip.mjs --analyze tests/tmp/t106   # chấm lại, 0 boot
node tests/t106-erp-live-roundtrip.mjs --fresh                    # ép chạy boot mới vào run dir mới
node tests/t106-erp-live-roundtrip.mjs --run-dir <dir> --reuse-run <dọn>  # đo lại 1 phần, mượn artifact cũ
```

Suite **resumable** (trần boot là bộ đếm cứng): lệnh trần thấy artifact cũ thì chấm lại thay vì boot lại,
và in rõ `resume: …`; `--fresh` mới tạo boot mới. Artifact của lượt này:
`tests/tmp/t106/run-2026-11-01T01-28-19-638Z/` (`run-meta.json`, `erp-meta.json`, `carried-over.json`,
`boot-c1.stdout.txt`, `c1-full-text.txt`, `snap-01..04*.json`, `c5-old|new.json`, `analysis.json`,
`analyze-attempt2.txt`, `verify1.txt`, `verify2.txt`).

## Kết quả (attempt 2, mã hiện tại `lib/tools.js` sha256 `88dbee40…930f08` / 213 071 B)

`verdict PASS — proved C1,C2,C3,C4,C5,C6 — unproved (none)` · `EXIT=0` · boot **6/6** (dùng hết trần).

| # | Tiêu chí | Kết quả | Bằng chứng thô |
| --- | --- | --- | --- |
| C1 | status đếm đủ 14 member (7 present + 7 removed) / 107 task | PASS | boot mới: `Members (7 present + 7 removed):` · `Removed (7):` · 7/7 dòng removed khớp tên+vai+route thật (`ha-tang`, `qa-do`, `tai-lieu`, `master-hop-dong`, `db-luoc-do`, `be-api`, `fe-ui` @ `opencode-go-new/minimax-m3.1-flash-free`) · `Tasks (107)` · đối chứng âm: không còn `N active + M removed`, không còn `Members (N):` |
| C2 | routeOverride `source:'erp'` + trường lạ vẫn đọc được, in `override route:` | PASS | `- ha-tang-2 […] → command-code-goat/deepseek/deepseek-v4-flash-fast (override)` + `override route: … by erp at 2026-10-31T23:47:18.370Z`; không ném `is not a valid member record` |
| C3 | set_member_route ghi `source:'captain'`, giữ 100% trường ERP-only | PASS | `Member "ha-tang-2" route is now command-code-goat/deepseek/deepseek-v4-pro, reasoning high — saved…`; tệp `source:"captain"`, at `1793490661533`; deep-equal 14 member + 107 task **0 problem**, key set **0 problem**; ERP-only còn nguyên (profileSeedId 13 task, supplementalEvidence 83, runtimeSetup 14) |
| C4 | roster in `(override)` đúng member, không đụng task ERP | PASS | `member-a (engineer; command-code-goat/deepseek/deepseek-v4-pro) (override)`; đội ERP vẫn 14 member / 107 task |
| C5 | đối chứng âm trên `agent-teams-pack14` | PASS | cùng tệp, cùng `readTeam`: bản cũ → `invalid AgentTeams state in team "erp-erp": members[2] is not a valid member record`; bản hiện tại → `{ok:true,members:14,tasks:107}` |
| C6 | sha256 tệp ERP thật không đổi | PASS | before = after = `9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e`, 1 533 117 B, mtime không đổi, `identical=true` |

## Lỗi đã vá giữa hai lượt (vì sao C1 đỏ ở attempt 1 rồi xanh)

`lib/tools.js` lọc `status !== 'removed'` khỏi DTO nên attempt 1 chỉ in `Members (7):` — captain đọc status
không biết còn 7 hồ sơ removed trong tệp ERP. Bản vá (t107/BUG-027) thêm `removed_count` + `removed_members[]`
và in `Members (P present + R removed):` + khối `Removed (M):` (mỗi dòng `name [role] provider/model · reasoning ·
joined · persona · tools`). C1 giờ chấm đúng hình dạng đó và **từ chối** cả tiêu đề cũ lẫn tiêu đề một số đếm.

## Ghi chú đo lường (tái dùng, đừng lặp lại sai)

- Host cắt `tool_result` dài theo kiểu **đầu + đuôi** (`truncated=true`): stream 7 470 ký tự vẫn giữ đủ phần
  member + khối `Removed (7):` (chúng nằm ở ĐẦU) và 3 dòng task; vì vậy **số task chấm theo header** `Tasks (107)`,
  không bao giờ chấm theo số dòng task in ra. Đừng assert "107 dòng task trong text".
- Transcript `$DSH_HOME/sessions/<slug>/<session>/session.v4.jsonl.zstd` (nhiều frame zstd, magic `28 b5 2f fd`)
  chứa NHIỀU render khi phiên được dùng lại: `extractStatusRender` phải lấy render **mới nhất** (duyệt ngược),
  nếu lấy cái đầu tiên sẽ chấm bằng văn bản của lần chạy trước (đúng cái bẫy đã làm C1 đỏ oan 1 lượt).
- `runtimeSetup` chỉ được ghi lúc ACTIVATE ⇒ member chưa activate không có `persona`, không phải lỗi.
- Boot dùng profile nháp `agent-teams-test`; mọi boot là `spawnSync` đồng bộ nên không để lại tiến trình nền.

## Giới hạn (điều CHƯA chứng minh được)

1. Chỉ MỘT member được ghi route bằng tool thật (`ha-tang-2`); 13 member còn lại chỉ được chứng minh "không bị đổi"
   (deep-equal + key set).
2. Số dòng task in ra không đếm được vì host cắt head+tail (đã nêu trên); chỉ chứng minh header đếm 107.
3. Chỉ chạy trên profile nháp liên kết working tree; bản đóng gói (`build/`) không được boot.
4. Trần boot của cả task đã dùng hết 6/6 (3 boot lượt 1 + 2 boot lượt 1 chạy tiếp + 1 boot C1 lượt 2) ⇒ không còn
   ngân sách boot cho lượt sau; muốn đo lại phải xin thêm trần.
