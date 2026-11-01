# BUG — lỗi phát hiện

| Mã | Mức độ | Mô tả | Nơi | Trạng thái |
|---|---|---|---|---|
| BUG-001 | thấp | Tạo đội dạng staged bị từ chối nếu một nhiệm vụ trong kế hoạch không có người nhận: `profile task "t13" is missing an assignee` | công cụ agent_teams_create | FIXED — đã gán kien-truc cho t13; bài học: nhiệm vụ seed bắt buộc có assignee |

## BUG-001 (2026-10-31T13:32:57.026Z) — Provider deepseek-official hết số dư, làm chết task đang chạy
- Hiện tượng: t2 thất bại, output: `Insufficient Balance (request_id: df7df9f9-13f8-46ce-bfb8-2b43707f83b6) (code QUOTA)`; member kien-truc về `idle/ready`, attempt 1 mất.
- Nguyên nhân: route `deepseek-official/deepseek-v4-pro` không còn số dư. Member này do kế hoạch staged chỉ định trước khi biết.
- Ảnh hưởng: kien-truc (t2, t13) và dev-tools (t4, t8) đều nằm trên provider chết → 2/7 member không dùng được.
- Xử lý: (1) reassign t2 → nghien-cuu (opencode-go/deepseek-v4.1-flash, attempt 2); (2) `add_member` **khi team đang chạy** tạo `dev-tools-flash` (opencode-go/deepseek-v4.1-flash high) — đây là ca dogfood thành công cho tính năng thêm member thủ công; (3) reassign t4 → dev-tools-flash; (4) remove_member dev-tools (requeue t8).
- Phòng tái phát: từ nay mọi member mới dùng `opencode-go/*`; route `deepseek-official` bị đánh dấu KHÔNG KHẢ DỤNG trong ROUTING.md.

## BUG-002 (2026-10-31T13:47:04.182Z) — Provider command-code-claude trả 404
- Hiện tượng: t3 thất bại, output `404 404 Not found. Check the docs for available routes. (code PI_AI_ERROR)`; member dev-runtime về idle, mất attempt 1.
- Phạm vi: dev-runtime (t3,t7) và audit (t6,t12) đều nằm trên `command-code-claude/claude-opus-5` ⇒ cùng chết.
- Xử lý: gỡ 3 member chết route (dev-runtime, audit, kien-truc — cả 3 đều không còn provider khả dụng), thêm `dev-runtime-flash` (opencode-go/deepseek-v4.1-flash high) và `audit-kimi` (opencode-go/kimi-k2.7-code high — khác model với 2 dev để giữ tính độc lập), gán lại t3,t6,t12,t13.
- Bài học: đã tiêu 2 attempt (t2, t3) chỉ vì route chết. Từ nay mọi member mới chỉ dùng `opencode-go/*`; `deepseek-official` và `command-code-claude` bị đánh dấu KHÔNG KHẢ DỤNG.
| 2026-10-31T14:19:09.353Z | BUG-003 | `agent_teams_set_member_route is not a function` trên phiên master | Không phải lỗi mã: phiên nạp v0.1.28 đã cài, fork chưa được mount | OPEN | Cần cài fork vào profile + phiên mới, hoặc E2E ở profile nháp (t11) |
| 2026-10-31T15:41:48.490Z | BUG-004 | t9 attempt 2 kết luận 'KHONG KHA THI' dựa trên tiền đề SAI: khai `node_modules` và bundler 'không tồn tại', trong khi `packages/dsh-agent-teams/node_modules` có esbuild 0.28.2/tsdown 0.22.2/react 18 và `build/build.mjs` (48 dòng) là script build thật tự bọc `window.__ModuleLoader__.load`. Captain tự chạy esbuild tay: 156 360 B trong 14ms. | Mở t22 rework: bắt chạy `node build/build.mjs`, chứng minh tái lập, khôi phục nếu fail. Bài học: phải kiểm 'không tồn tại' bằng cách LIỆT KÊ thư mục, không suy từ một đường dẫn không thấy. |
| 2026-10-31T15:44:48.455Z | BUG-005 | Brief của captain ghi `TEAM_TAB_ID` là `@nami/dsh-agent-teams/activity` (SAI) — giá trị thật trong `lib/client/WorkspaceActivity.js:12` và bundle là `@nanmicoder/dsh-agent-teams/activity`, cố ý giữ tên gói 0.1.x. Member t22 phát hiện và báo lại thay vì sửa theo brief. | Giữ nguyên `@nanmicoder/...`; khi nào build được bundle + có quyết định đổi định danh mới đổi đồng thời cả hai nơi. Bài học: brief về hằng số phải đọc từ file trước khi viết. |
| 2026-10-31T16:17:29.340Z | BUG-006 | Toàn bộ member opencode-go chết: `429 GoUsageLimitError: Go usage limit exceeded (code QUOTA)` (dev-ui chết giữa t10, t10 failed). Phiên master cũng bị host tự chuyển sang `command-code-goat/deepseek/deepseek-v4.1-flash`. | Thêm member mới `dev-ui-goat` trên route còn sống, reassign t10. Message riêng: các member opencode-go khác (nghien-cuu, kiem-thu, dev-tools-flash, dev-runtime-flash, audit-kimi) sẽ được thay dần bằng route sống khi cần. |

## 2026-10-31T17:08:51.382Z — BUG-008 (quy trình, của captain)
- Mô tả: trong biên bản review t25 tôi khẳng định `lib/client.js` 'không đổi' bằng cách so với hash `01aadd77…7178` đo từ lượt trước, trong khi `dev-build-flash` đang chạy t23 dựng lại đúng file đó.
- Hậu quả: một câu sai trong hồ sơ (đã đính chính); nếu không phát hiện sẽ thành 'bằng chứng' sai trong audit closure.
- Bài học: bằng chứng 'không đổi' phải là cặp (hash trước, hash sau) đo trong CÙNG một cửa sổ không có writer khác; khi có member khác đang ghi cùng cây thư mục thì phải nêu rõ điều kiện đó hoặc dùng bằng chứng khác (danh sách file thay đổi theo mtime).

## 2026-10-31T17:19:20.209Z — BUG-003 hạ mức: môi trường dogfood đã sẵn bản fork HIỆN TẠI
- Kiểm trực tiếp `C:\Users\thang\.dsh\profiles\agent-teams-test\node_modules\@nami\dsh-agent-teams`: là **symlink** tới `E:\Project\Agent-Team\packages\dsh-agent-teams` (tạo ở t18/t21), nội dung khớp byte: `lib/tools.js` sha256 `f1e06dea1738…` (bản đã có `by:`), `lib/members.js` `9095fb8cdb15…`, `lib/client.js` `d28532e722c0…`/191 153 B, `lib/client.js.map` `70cb6e908543…`, `package.json` `@nami/dsh-agent-teams` 0.2.0-dev.0; `lib/tool-names.js` chứa `agent_teams_set_member_route`; `cordis.patch.yml` của profile nháp trỏ `@nami/dsh-agent-teams`.
- Hệ quả: hạ tầng dogfood KHÔNG thiếu — t18 (hot-switch 9/9) và t11 (HTTP 11/11) đã boot thật trong chính profile này với bản fork hiện tại. Phần chưa đóng duy nhất là **phiên master đang chạy** (Host nạp profile `desktop`, trong đó `node_modules\@nanmicoder\dsh-agent-teams` = 0.1.28) — muốn đổi phải khởi động lại Host/phiên mới trên profile nháp, việc này cần người dùng quyết định.
- Trạng thái mới: BUG-003 = **ĐÓNG MỘT PHẦN (môi trường đã chứng minh; chỉ còn phiên sống)**.

## BUG-009 — 2026-10-31T17:30:24.411Z — captain đặt số thứ tự task bằng tay (đã đóng)
- HIỆN TƯỢNG: tạo task với subject `t31 — Surface lastFailure...` nhưng ledger cấp id **t30**; lần tạo tiếp theo xin `dependencies:["t31"]` bị từ chối `dependency "t31" does not exist`.
- NGUYÊN NHÂN: captain tự đoán số kế tiếp thay vì đọc id do ledger cấp (id tăng theo ledger, không theo subject).
- XỬ LÝ: dùng id thật `t30` cho task vá DTO; task audit closure được tạo lại và nhận id thật **t31**; brief của t31 ghi rõ 'chấm theo id, đừng theo subject'.
- BÀI HỌC: id công việc là dữ liệu của hệ thống — phải lấy từ `agent_teams_status`/`create_task` trả về, không suy ra.

### BUG-010 — Captain sửa mã nguồn trong lúc member đang chạy suite so hash (2026-10-31)
- Hiện tượng: t27 lượt chạy thứ 3 FAIL check C4b vì `packages/dsh-agent-teams/lib/tools.js` đổi `f1e06dea1738e822…` → `7fde7bbc49db1ba6…` (mtime `2026-10-31T17:30:45.821Z`) nằm ĐÚNG trong cửa sổ chạy — chính là lúc captain mutation-test t30 rồi khôi phục.
- Không phải lỗi plugin, không phải lỗi member: member đã tách `C4b` (package.json byte-identical) khỏi `C4c` (chứng minh TĨNH script không ghi vào fork: 5 dòng nhắc `FORK_DIR`, 0 dòng ghi) và in hash thành dòng INFO giữ nguyên hai phía.
- Bài học (cho captain, không phải member): (a) KHÔNG sửa mã nguồn trong lúc member đang chạy suite so hash, dù chỉ mutation-test có khôi phục; (b) mọi bằng chứng 'không đổi' phải là cặp (trước, sau) trong cùng cửa sổ, hoặc hash cố định đã công bố trong brief; (c) nếu buộc phải sửa thì phải báo trước cho member đang chạy.
- Cùng họ với BUG-008 (lần đó captain khẳng định 'không đổi' mà không đo).

- **BUG-009 (tái diễn lần 2, 2026-10-31)** — captain tạo task pack tarball với subject mở đầu "t42 —" nhưng ledger cấp id **t41**; task audit sau đó nhận id **t42**. Hệ quả: subject của t41 lệch nhãn so với id (gây nhầm khi đọc log). Không sửa được subject vì `agent_teams_edit_plan` từ chối cả batch do một member cũ `nghien-cuu` không còn active (`task "t1" assignee "nghien-cuu" is not an active member`). Quy tắc giữ nguyên: **luôn đọc id từ ledger trả về**, không suy từ số mình đặt; subject chỉ là nhãn, ghi chú lệch nhãn vào TODO.
- **BUG-011 (nghi vấn của t44, chưa tái hiện)** — t44 báo `lib/tools.js:1231` mô tả sai ('when clear is true or omitted, provider and model are required'); tại thời điểm captain chấm, dòng này đã ghi đúng 'Required unless clear is true' và KHÔNG còn chuỗi 'or omitted' trong toàn package (grep 0 hit) — nhiều khả năng t38 đã viết lại khối đó. Trạng thái: CHỜ KIỂM LẠI sau khi t38 xong; nếu còn thì mở task sửa câu chữ. Bài học lặp lại của BUG-010: đọc mã của người khác ĐANG chạy là đọc ảnh chụp giữa chừng.

### BUG-012 — `agent_teams_edit_plan` chặn CẢ batch vì task cũ có assignee đã removed (OPEN)

Triệu chứng (tái diễn nhiều lần, gồm hôm nay khi thêm `t46` vào deps `t42`): `agent_teams_edit_plan({operations:[{action:'update_task', task_id:'t42', dependencies:[…,'t46']}]})` trả `task "t1" assignee "nghien-cuu" is not an active member`.

Nguyên nhân: bước validate của batch duyệt MỌI task trong team, kể cả task không nằm trong `operations`; `nghien-cuu` là member đã bị `remove_member` từ vòng 2 (đội còn 5 member goat flash) nên không còn là active member ⇒ cả batch bị từ chối vĩnh viễn trên mọi đội đã từng gỡ member.

Hệ quả thật: không thể sửa subject/description/dependencies của bất kỳ task pending nào trên đội đã gỡ member; BUG-009 (nhãn subject lệch id) không thể sửa được nữa.

Đề xuất sửa (cho vòng 6, vùng `lib/tools.js`): validate assignee chỉ cho các task XUẤT HIỆN trong `operations`, hoặc bỏ hẳn kiểm assignee khi task không đổi assignee.

Dấu vết: `docs/log/BUG.md` (mục này), `docs/TODO.md` hàng BUG-012; mọi lần batch bị từ chối đều đã ghi trong `docs/log/ACTIVITY.md`.
### BUG-013 — t38 có LỖ HỔNG PHỦ TEST: fallback-only chưa từng được thử (CLOSED bằng t47)

Phát hiện bởi `dev-ui-goat` khi làm t46 (báo cáo m00021…) — không phải bởi captain, và đây là bài học về chất lượng brief của captain.

Triệu chứng member báo: `setMemberRoute` chỉ với `fallbackProvider`+`fallbackModel` (không provider/model) bị từ chối `409 agent-teams: member "alice" was not changed: pass provider/model, clear, …` từ guard `packages/dsh-agent-teams/lib/members.js:1363` khi guard còn là `else if (!fallbackClearing) {` (thiếu `!wantsFallback`).

Gốc rễ: `tests/t38-member-fallback.mjs` (14 case) KHÔNG có case fallback-only nào — mọi case set fallback đều truyền kèm `p1/m3` (grep `fallback-only` = 0 hit). Vì vậy guard sai lọt contract t38, dù t38 tự khai 'wantsPrimary split để lời gọi CHỈ fallback không tự cài override'.

Trạng thái hiện tại (captain tự đo): `lib/members.js:1363` ĐÃ là `else if (!fallbackClearing && !wantsFallback) {`; probe độc lập `tests/tmp/probe-fallback-only.mjs` (harness t38, mount `lib/index.js` thật) EXIT=0 — `THREW=false`, `routeOverride=undefined`, `spine=p1/m1`, `fallback={p1,m3}`.

Việc còn lại: **t47** (dev-runtime-goat, deps t43) thêm ≥3 case fallback-only vào suite t38 + tự mutation revert guard để chứng minh độ phủ, và PHẢI khai báo nếu trong t43 đã sửa guard này (thay đổi ẩn trong lần ghi của member khác là điều cấm).

Bài học cho captain: khi một task tự khai 'đã tách nhánh X để lời gọi chỉ-X hoạt động', phải đòi ĐÚNG một case 'chỉ-X' trong suite — nếu không thì tuyên bố đó là chưa được chứng minh.

## BUG-014 — mutation test KHÔNG áp được mà vẫn đọc là 'suite không bắt' (lỗi của captain, đã tự bắt)
- **Triệu chứng**: khi chấm t48, tôi chạy mutation bằng `s.replace("  'agent_teams_set_member_profile',\n", "")`. Tệp `lib/tool-names.js` khai tên INLINE trên MỘT dòng (`'…set_member_route', '…set_member_profile',`) nên chuỗi không khớp, tệp KHÔNG đổi; t48 vẫn 6/6 và tôi suýt kết luận 'suite không phát hiện được mutation'.
- **Bắt được nhờ**: in cờ `mutation applies: <bool>` ngay sau khi ghi tệp (giá trị thật = `false`).
- **Sửa**: mutation lần 2 nhắm đúng chuỗi inline ⇒ xoá entry ⇒ `2/6 passed, 4 failed` (đúng 4 case TEAM/CAPTAIN/deny/prompt), khôi phục sha256 identical ⇒ 6/6.
- **QUY TẮC MỚI (áp cho mọi mutation test từ nay)**: (1) sau khi ghi, phải assert `mutated !== original` và in ra; (2) nếu `false` thì DỪNG, không đọc kết quả suite; (3) sau khôi phục phải in `identical=true` kèm sha256.

## BUG-012 — ĐÃ SỬA (t50)
- `lib/tools.js:219-228` `validateStagedGraph(team, requireRunnable, options = {})`; `:235` `onlyTaskIds`; `:237-238` bỏ qua task ngoài batch; `:588/:629/:637-638` gom `editedTaskIds`; `:673` truyền `staged ? {} : { onlyTaskIds: editedTaskIds }`. Kiểm chu trình (`:245-260`) và `approve` (`:704`) vẫn quét TOÀN BỘ đồ thị.
- Captain verify: t50 11/11, mutation xoá filter ⇒ 6/11, khôi phục identical.

### BUG-015 — nhánh TỰ TỤT fallback không để lại dấu vết audit (do t51 phát hiện)
- **Triệu chứng**: member tự tụt sang fallback route khi request lỗi provider, nhưng `docs/log/MODEL-SWITCH.md` KHÔNG có row nào cho lần tụt.
- **Nguyên nhân (tôi tự đọc mã)**: `lib/members.js:339-353 updateFallbackState()` ghi `activeProvider/activeModel/fallbackActive` + `writeTeam` rồi `void ctx;` — KHÔNG gọi `appendRouteChangeAudit`; hàm này chỉ được gọi ở `lib/members.js:1423` (trong `setMemberRoute`).
- **Hệ quả**: nhóm log MODEL-SWITCH thiếu sự kiện quan trọng nhất trong vận hành (provider chết ⇒ member đổi route mà không ai gọi tool); trái mục tiêu 'đủ bảy nhóm log' của MASTER TASK.
- **Xử lý**: mở `t54` (repair, dev-runtime-goat) + `t55` (verification). Sẽ đóng khi t55 chứng minh được row thật trong E2E.
- **Bài học**: 'ghi bền team.json' KHÔNG đồng nghĩa 'có audit trail' — mỗi đường đổi route phải tự chứng minh bằng một test đọc file log.

### BUG-016 — `FALLBACK_FAILURE_CODES` bỏ sót 'route đã chết' kiểu INVALID_REQUEST
- `lib/members.js:102` `FALLBACK_FAILURE_CODES = new Set(['QUOTA','RATE_LIMIT','AUTH','MISSING_CREDENTIAL','NO_ADAPTER'])`; provider trả `INVALID_REQUEST` + `Model is unavailable.` (opencode-go-new/minimax-m3.1-flash-free) ⇒ KHÔNG tụt, member CHẾT hẳn.
- **Xử lý**: gộp vào `t54` với luật HẸP — chỉ `INVALID_REQUEST` có message khớp `/Model is unavailable|model_not_found|does not exist|no such model/i` mới đáng tụt; `INVALID_REQUEST` khác (payload sai) vẫn không tụt.

### BUG-017 — phiên master vẫn nạp plugin 0.1.28 nên bản vá t50 không dùng được (BUG-003 tái diễn)
- **Hiện tượng**: `agent_teams_edit_plan({operations:[{action:'update_task', task_id:'t52', dependencies:[...,'t56']}]})` → `task "t1" assignee "nghien-cuu" is not an active member`, dù t50 đã vá đúng lỗi này (`lib/tools.js:235`/`:237-238` `onlyTaskIds`) và suite t50 11/11 xanh.
- **Nguyên nhân**: tool tôi gọi trong phiên master do profile `desktop` cung cấp = `@nanmicoder/dsh-agent-teams` **0.1.28** (chưa có bản vá); fork `@nami/dsh-agent-teams` 0.2.0-dev.0 chỉ được nạp trong profile nháp.
- **Hệ quả**: từ phiên master KHÔNG nối được deps hồi tố cho task pending trên đội đã gỡ member; phải dùng ràng buộc văn bản trong brief + kiểm bằng tay.
- **Xử lý tạm**: gửi ràng buộc cho t52 (chờ t56 completed rồi mới pack; `lib/types/members.d.ts` vào danh sách `drift=0`) thay vì sửa DAG.
- **Đóng hẳn khi**: Host khởi động lại bằng profile có fork (việc của người dùng — DOG-02).
### BUG-018 — CSS của ActivityPanel bị cắt mất 121/139 lớp ⇒ panel/workspace render KHÔNG có style (lỗi NGƯỜI DÙNG thấy)
- **Họ phát hiện**: người dùng (m03128) gửi screenshot panel 'Team workspace' trên `127.0.0.1:19488` — text dính nhau (`nami-agent-teams5 members59/61 completed0 messages`), ảnh cá voi khổng lồ, hàng member không giãn cách. Người dùng hiểu là 'viết lại cả UX/UI' — KHÔNG phải: mã UI vẫn là bản fork của Nami, nhưng tệp CSS bị cắt.
- **Số đo (captain)**: `packages/dsh-agent-teams/lib/client/ActivityPanel.js` dùng **100 khoá `css.*`**; `packages/dsh-agent-teams/lib/client/ActivityPanel.module.css` chỉ định nghĩa **18 lớp** (`3 946 B`) ⇒ **84 khoá ra `className=undefined`**. Khối CSS gốc 0.1.28 trong `C:/Users/thang/.dsh/profiles/desktop/node_modules/@nanmicoder/dsh-agent-teams/lib/client.js` = **59 510 B / 139 lớp** prefix `aYQbCq_` ⇒ thiếu **121 lớp**. Hai module khác ĐẦY ĐỦ (`WorkspaceActivity.module.css` 8/8, `AgentTeamsCard.module.css` 13/13) ⇒ chỉ ActivityPanel bị cắt.
- **Không phải lỗi cơ chế nạp**: bundle vẫn có đủ 3 khối `if (typeof document !== "undefined")` + `createElement("style")` như bản gốc; `build/css-module-plugin.mjs` sinh `style.textContent = css` + `export default {local: mangled}`.
- **Hệ quả phát hành**: tarball `5306f31b…bfb7` (t52, đã được t53 audit PHÁT HÀNH ĐƯỢC) CŨNG mang lỗi này ⇒ **mọi tarball trước t63 KHÔNG được dùng**.
- **Lỗ hổng test (nhận của captain)**: t10/t57/t62 chỉ kiểm DOM marker + chuỗi trong bundle, KHÔNG kiểm 'mọi khoá `css.*` có trong CSS' ⇒ 13 vòng audit + 6 lần captain VERIFIED (t34/t46/t60…) đều không bắt được.
- **Xử lý**: mở `t62` (dev-ui-goat, deps t61) — khôi phục đủ CSS từ khối gốc + `tests/t62-css-completeness.mjs` chặn tái diễn; sau đó `t63` pack lại + `t64` audit vòng 7.
- **Bài học**: test UI phải đối chiếu HAI PHÍA (khoá JS ↔ lớp CSS), không chỉ tìm chuỗi trong bundle; và mọi tệp `.module.css` nhập từ bản gốc phải được so số lớp với bản gốc ngay khi tạo.
### BUG-019 — captain làm mutation SAI HAI LẦN liên tiếp khi chấm t62 (suýt kết luận 'suite không bắt')
- Lần 1: script mutation ghi backup vào `/tmp/ap.orig.css`. Trong node trên Windows `/tmp` = `E:\tmp` (không tồn tại) ⇒ `ENOENT` ném ra TRƯỚC khi sửa tệp; nhưng lệnh bash vẫn in `MUT_EXIT=0` (vì t62 chạy trên tệp CHƯA sửa và xanh) ⇒ nếu không kiểm lại sẽ kết luận oan 't62 không bắt mutation'.
- Lần 2: regex `\.aYQbCq_<class>\{[^}]*\}` không khớp vì CSS minify dùng selector NHÓM (`.aYQbCq_badgeCount,.aYQbCq_memberCount,…{font-variant-numeric:tabular-nums}`) ⇒ `ruleBytes 0`, mutation không áp.
- Lần 3 (đúng): xoá NGUYÊN rule nhóm chứa lớp đang dùng ⇒ t62 **EXIT=1, 10/14, 4 failed**; khôi phục ⇒ sha256 `9651f407…b199` trùng tuyệt đối + 14/14.
- **Quy tắc bổ sung (gộp với BUG-014)**: mọi mutation phải (a) in `applies: true` và delta byte > 0, (b) dùng đường dẫn tạm TRONG repo (`tests/tmp/…`), (c) đọc exit code của CHÍNH bước mutation, (d) sau khôi phục in `identical=true` + sha256.
- Ghi nhận thêm: t62 xanh 14/14 nhưng vẫn còn 1 khoá `planSave` (MemberControls.js) undefined — vì test chỉ quét `ActivityPanel.js`; đã mở t67 để mở phép quét ra toàn bộ `lib/client/*.js`.
### BUG-020 — `agent_teams_edit_plan` vẫn chặn batch vì member đã gỡ (BUG-009/017 lần 3)
- Triệu chứng (2026-10-31): `agent_teams_edit_plan({operations:[{action:'update_task', task_id:'t71', subject:'t71 — …'}]})` → `task "t1" assignee "nghien-cuu" is not an active member` ⇒ KHÔNG sửa được nhãn subject, dù bản vá t50 đã có trong mã nguồn.
- Nguyên nhân: **phiên master đang chạy plugin 0.1.28** (profile `desktop`) chứ không phải fork; bản vá `lib/tools.js:219-238` (onlyTaskIds) chỉ có hiệu lực khi Host nạp fork.
- Hệ quả hồ sơ: subject của task id **t71** vẫn mang nhãn captain đặt là `t70b`; TODO đã ghi rõ để không nhầm.
- Đóng hẳn khi: Host khởi động lại bằng profile có fork (DOG-02/đường B) — cùng điều kiện với BUG-017.
### BUG-021 — captain làm mutation KHÔNG NGỮ NGHĨA rồi suýt kết luận 'suite yếu'
- Chuyện: khi chấm t71, phép đột biến đầu của captain chỉ đổi tên biến (`inCatalog` → `inCatalogX`) + chèn 1 khoá lạ vào object; suite vẫn **16/16 PASS**. Nếu đọc vội thì sẽ kết luận 'suite không bắt được lỗi' — SAI: phép đột biến đó không đổi hành vi.
- Phép đột biến ĐÚNG (làm lại): bỏ vế `&& routes.some((entry) => …)` khỏi `declaredUsable` (`lib/client/MemberControls.js:129-130`, delta **102 B**) ⇒ **EXIT=1, 3 FAIL** (case 4, 5, 7); khôi phục `identical=true` ⇒ 16/16.
- QUY TẮC (thêm vào bộ luật mutation): trước khi kết luận, phải trả lời được 'phép đột biến này làm HÀNH VI sai ở đâu?'. Nếu chỉ đổi tên/định dạng ⇒ vứt, làm phép khác. Ghi `applies` + delta byte là điều kiện CẦN, chưa ĐỦ.

## BUG-022 — cửa sổ mutation của captain làm member đọc phải trạng thái đỏ (dạng lặp của BUG-010)
- **Hiện tượng**: t75 chạy `node tests/t74-captain-route-warning.mjs` ngay sau pack → **21/23 EXIT=1**, FAIL đúng `(f1) the snapshot reads the SAME two places` + `(f4) a captain declaring nothing in the header falls back to its options`; 8 lần sau liền 23/23.
- **Nguyên nhân**: CHÍNH CAPTAIN mutation `lib/snapshot.js:62` (bỏ `|| trimmedText(captain.options?.model)`, delta −39 B) đúng cửa sổ đó — cùng 2 ca, cùng 21/23. t74 đọc NGUỒN SỐNG (`import()` + `readFileSync`), không retry, nên đọc trúng bản đang bị phá.
- **Bài học**: không mutation trên tệp mà member đang chạy suite; bằng chứng 'không đổi' phải là cặp (trước, sau) trong cùng cửa sổ không có writer khác. Member khai trung thực + tự chứng minh artefact đúng bằng `POST_PACK_MISMATCHES=0` — hành vi đúng.
- **Trạng thái**: ĐÓNG (không phải lỗi sản phẩm; đã ghi evidence_note t75).

## BUG-023 (2026-10-31T21:1x UTC) — Member CHƯA từng spawn bỏ qua `routeOverride` ⇒ di trú route ERP mất tác dụng ngay lần chạy đầu

- **Mức độ**: CAO (đường ghi di trú của cả đội ERP trở thành vô hiệu một cách im lặng).
- **Phát hiện bởi**: t82 (kiem-thu-goat), case C3 của suite `tests/t82-erp-migrate-live.mjs` — verdict `FAIL 5/6`, không nới assert.
- **Bằng chứng**: sau `tools/erp-route-migrate.mjs --apply`, dòng `alpha-2` có `routeOverride = command-code-goat/deepseek/deepseek-v4-pro (high)`; phiên con thật `84d85f22-f8ca-4b1b-9e59-cad16095073b` lại gửi `request/header = command-code-goat/deepseek/deepseek-v4.1-flash` (route KHAI BÁO) và `routeOverride` biến mất khỏi `team.json` sau spawn.
- **Nguyên nhân**: `packages/dsh-agent-teams/lib/tools.js:546-548` (nay `:553`) — nhánh `member.id === ''` của `dispatchMember` dựng `resolveMemberLlmSelection` từ spine `member.provider/model/reasoningEffort`, không đi qua `routeOf()` (`lib/members.js:437-469`, nơi precedence fallback > override > active > declared nằm MỘT CHỖ); sau spawn `lib/members.js:1054-1060` escalate chính selection đó vào `provider/model` rồi `delete member.routeOverride`. Đường thủ công `activateMemberNow` (`lib/members.js:1112-1124`) dùng `selectionFromMember` nên t18/t45/t59 vẫn xanh — lỗ hổng chỉ ở nhánh spawn-từ-scheduler với member chưa từng spawn.
- **Sửa** (t86, dev-runtime-goat): `lib/members.js:486 export function selectionFromMember(member)`; `lib/tools.js:546-560` dùng `membersApi.selectionFromMember(member) ?? {provider,model,reasoningEffort}` + `defaultModel/defaultProvider/fallback` y như `activateMemberNow`; `lib/types/members.d.ts:176` khai báo mới (t56 cổng biên dịch canh). Test chặn tái diễn: `tests/t86-override-before-spawn.mjs` **8/8** (có đối chứng âm tái hiện mã cũ trong `tests/tmp`).
- **Captain tự chấm**: t86 8/8 · t56 20/20 · t43 19/19 · t20 15/15 (ERP `9f7420b6…15f2d1e` không đổi) · t38 17/17 · t3 18/18; mutation `routeOf({...member, routeOverride: undefined})` (+33 B) ⇒ **4/8** FAIL a1/a2/d3/c1 rồi khôi phục byte-identical.
- **Hash sau sửa**: `lib/tools.js 75800e15fce2abf6…`/196 084 · `lib/members.js 4f818b73803da02a…`/100 367 · `lib/types/members.d.ts c53250ab41bff8c3…`/31 769.
- **Còn lại (giới hạn đã khai)**: `approveStagedTeam` (`lib/tools.js:707`) vẫn đọc spine ⇒ plan preview của member staged KHÔNG phản ánh `routeOverride`; `setLiveRoute` không re-seed route của con ĐANG chạy (đó là chủ ý — live route do selection sống quyết định).
- **Trạng thái**: ĐÓNG phần spawn-từ-scheduler (t86). Phần plan-preview mở thành việc riêng nếu người dùng muốn.

## BUG-024 (2026-10-31T22:2x UTC) — roster của `agent_teams_edit_plan` đọc SPINE, không đọc route HIỆU LỰC

- **Mức độ**: TRUNG BÌNH-CAO (không làm chết đội, nhưng captain/người dùng bị dẫn sai đúng lúc duyệt kế hoạch).
- **Hiện tượng**: member staged (`id === ''`) mang `routeOverride = p2/m2`; `agent_teams_edit_plan` trả `roster: ["alice (researcher; p1/m9)"]` — tức route KHAI BÁO — trong khi `agent_teams_approve` từ t87 sẽ khởi động member trên p2/m2. Captain đọc roster để duyệt kế hoạch ⇒ duyệt một route, chạy một route khác.
- **Tái hiện**: `tests/t90-edit-plan-roster-route.mjs` case h1 (team staged, alice có `routeOverride`, gọi tool thật `agent_teams_edit_plan`) — trước sửa roster trả `p1/m9`, sau sửa trả `p2/m2 (override)`.
- **Nguyên nhân gốc**: `packages/dsh-agent-teams/lib/tools.js:1183` — `roster: updated.members.map((member) => \`${member.name} (${member.role || 'member'}; ${member.provider ?? ''}/${member.model ?? ''})\`)` đọc trực tiếp spine `member.provider`/`member.model`. Precedence fallback > override > active > declared chỉ tồn tại ở `lib/members.js routeOf` (bọc bởi `selectionFromMember`), mà roster không đi qua đó. Đây là dạng lặp của BUG-023 ở một call site KHÁC: t86 sửa `dispatchMember`, t87 sửa `approveStagedTeam`, còn đường HIỂN THỊ thì bị bỏ sót.
- **Sửa** (t90, dev-runtime-goat): thêm `function editPlanRosterRow(member)` (`lib/tools.js:1059-1088`) render route từ `membersApi.selectionFromMember(member)`; khi route hiệu lực KHÁC spine thì gắn dấu ` (override)` / ` (fallback)` / ` (active)` theo `membersApi.routeOf(member).origin`; khi không khác (hoặc member không có route nào) thì chuỗi GIỐNG HỆT bản cũ nên reader cũ không vỡ. `lib/tools.js:1195` (dòng roster của `agent_teams_edit_plan`) nay là `roster: updated.members.map(editPlanRosterRow)`. Spine chỉ còn được đọc cho 2 việc: so sánh để quyết định dấu, và dòng của member KHÔNG có route (hiển thị an toàn).
- **Test chặn tái diễn**: `tests/t90-edit-plan-roster-route.mjs` — **10/10 EXIT=0**, gồm đối chứng âm trong bộ nhớ (công thức cũ trả `p1/m9` cho đúng fixture của lỗi, và bị đếm là 0 lần gọi `selectionFromMember`), case c1 chứng minh precedence fallback > override, case h1/i1 chạy tool THẬT.
- **Mutation chứng minh**: đảo đúng 1 dòng về mã cũ (`applies=1`, `delta_bytes=88`) ⇒ **8/10, EXIT=1**, FAIL `g1` (dòng cũ còn trong tệp) + `h1` (`alice (researcher; p1/m9)`); khôi phục `identical=true`.
- **Hash**: TRƯỚC `lib/tools.js` sha256 `40ee19d8d1c13cd951eb3994fcf123c6a7fdede05d2da1675f2356e82b2be48a` / 199 268 B (đo bằng cách dựng lại tệp: đảo đúng dòng của t90 trên bản hiện tại — chính là bản dùng cho mutation); SAU `a9ad29f8ae87a884a78f100312f0f45f6650747fe594272067951401d709b275` / 199 180 B.
- **Còn lại (giới hạn đã khai)**: (1) `roster` chỉ để HIỂN THỊ — `team.json` không đổi (case h1 assert spine vẫn `p1/m9`, chỉ dòng hiển thị theo override); (2) DTO `agent_teams_status` và snapshot vẫn trả `provider`/`model` là spine (chúng đã có `next_route`/`route_origin`/`route_override` riêng — ngoài phạm vi t90); (3) `render` của `agent_teams_edit_plan` chỉ in `graph`, không in `roster`, nên Web UI chưa thấy dấu `(override)` — cần task riêng nếu người dùng muốn.
- **Trạng thái**: ĐÓNG (t90), vá lần 2 (t94) bên dưới.

### Vá lần 2 (t94) — render của tool phải IN roster ra văn bản

- **Vì sao cần**: bản vá t90 chỉ đặt route hiệu lực vào `roster` của STRUCTURED output. `render` của tool (khối `output.render` trong `packages/dsh-agent-teams/lib/tools.js`) in `${value.graph.join('\n')}` và BỎ `value.roster`, nên trên đường người dùng thật (captain đọc văn bản tool) không thấy thay đổi nào.
- **Bằng chứng E2E headless** (profile `agent-teams-test`, session `session-9f394b2f-cd8a-4b99-8725-bbe39d93b670`, cwd `E:/Project/Agent-Team`): gọi thật `agent_teams_edit_plan` trên team staged 2 member (alice có `routeOverride` deepseek-official/deepseek-v4-pro, bob engineer→qa, 0 task) ⇒ tool_result NGUYÊN VĂN (chuỗi cũ): `Staged plan updated atomically (2 members, 0 tasks, 0 dependencies). No members were spawned and no tasks were scheduled.` — không một dòng roster nào.
- **Sửa** (t94, dev-runtime-goat): `packages/dsh-agent-teams/lib/tools.js:1136-1147` — `const summary = …` giữ nguyên từng ký tự chuỗi tóm tắt cũ; `const body = [...value.graph, ...value.roster];` (graph trước, roster sau, đúng thứ tự `updated.members`); trả `body.length === 0 ? summary : `${summary}\n${body.join('\n')}`` ⇒ body rỗng không sinh dòng trống thừa. `editPlanRosterRow` (t90) không đổi.
- **Test chặn tái diễn**: `tests/t94-edit-plan-roster-render.mjs` — **9/9 EXIT=0**; case i1 replay đúng fixture E2E trên qua tool THẬT và in ra text cuối `alice (researcher; p2/m2 (override))` + `bob (qa; p1/m3)`; case f1 là đối chứng âm trong bộ nhớ (render CŨ chỉ graph ⇒ 0 dòng roster, `applies=1 old_bytes=149 new_bytes=245 delta_bytes=96`); case h1 chứng minh biểu thức cũ đã biến mất khỏi tệp.
- **Mutation chứng minh**: đổi `body` về `[...value.graph]` (`applies=1`, `delta_bytes=-17`) ⇒ **1/9, EXIT=1** (8 case đỏ, i1 mất 2 dòng roster); khôi phục `identical=true`, `sha256=6150b7b287cb815dad7902ec316b900a5b4c318fea17bbe86696fc1e04d8b137`, 199 872 B.
- **Hash `lib/tools.js`**: TRƯỚC `a9ad29f8ae87a884a78f100312f0f45f6650747fe594272067951401d709b275` / 199 180 B (số đo của t90; KHÔNG tái tạo được byte-identical vì repo không có VCS — đã thử 2 tổ hợp ứng viên cho khối render cũ, lệch 12 B và 7 B nên không dùng); SAU `6150b7b287cb815dad7902ec316b900a5b4c318fea17bbe86696fc1e04d8b137` / 199 872 B (+692 B, toàn bộ nằm trong khối render 1136-1147).
- **Hồi quy EXIT=0**: t90 10/10 · t50 11/11 · t87 8/8 · t43 19/19 · t10 `TOTAL 48 checks, 48 passed` · `node --check` OK.
- **Còn lại**: text render chỉ gồm summary + graph + roster (không có `team_id`/`status`); dòng roster vẫn là HIỂN THỊ, `team.json` không đổi (giới hạn (1) của t90 giữ nguyên); DTO `agent_teams_status`/snapshot vẫn trả spine (giới hạn (2) giữ nguyên); panel Web UI vẫn đọc DTO nên chưa thấy dấu `(override)` — giới hạn (3) nay ĐÓNG trên đường văn bản tool, còn mở trên đường panel.
- **Trạng thái**: mục (3) của BUG-024 ĐÓNG (t94).

## BUG-025 (2026-11-01 UTC) — payload ĐÚNG nhưng text render KHÔNG in: 9 trường cấp 1 + 4 nhóm lồng

- **Mức độ**: CAO trên đường người dùng thật (captain/member chỉ đọc `tool_result` dạng văn bản; trường không in = không tồn tại với người đọc).
- **Phát hiện bởi**: t98 (cổng tĩnh `tests/t98-render-coverage.mjs`) — SUMMARY `tools=16 fields=110 reached=92 uncovered=9 nested_gaps=4 allow_listed=5`, verdict RED.
- **Vì sao 13 vòng audit bỏ lọt**: mọi suite cũ assert trên **structured output** (`result.roster`, `result.members`, DTO) hoặc trên vài chuỗi cụ thể của text; KHÔNG suite nào đối chiếu `output.schema` ↔ `output.render`. Payload đúng nên audit "payload đúng" vẫn xanh, còn người đọc thì thiếu thông tin. t90/t94 chỉ vá đúng MỘT tool (`edit_plan` roster) nên lỗi tưởng đã đóng.
- **Chín trường cấp 1 thiếu**: `create.members` (high) · `create.profile` (medium) · `create.task_planning` (medium) · `edit_plan.team_id` (low) · `set_member_profile.execution_prompt` (high) · `set_member_profile.previous_role` (medium) · `set_member_profile.previous_execution_prompt` (medium) · `status.team_id` (low) · `status.phase` (medium).
- **Bốn nhóm lồng thiếu**: `status.members[].execution_prompt` · `.active_provider/.active_model` · `.fallback.*` · `.route_override.*` (text chỉ in dấu ` (override)`, không in route nào — nửa còn lại đúng lớp BUG-024) · `.last_failure.*` · `status.tasks[].attempt_id` (chính là handle `update_task` cần) · `status.coverage[].evidence` · `create.tasks[].status/.kind`.
- **Sửa** (t99, dev-runtime-goat): `packages/dsh-agent-teams/lib/tools.js` — `create` render thêm khối `Profile:`, `Task planning:`, `Members (N):` + task `status=`/`kind=` (:889-901); `set_member_profile` render thêm ` — execution prompt: …` + 2 dòng `previous …` (:1479-1490); helper mới `function clipText(text, max)` ngay trước `renderStatus`; `renderStatus` thêm dòng cuối `Team id: … · phase: …`, chi tiết member (`prompt`, `active route`, `fallback route`, `override route … by SOURCE at ISO`, `last failure: CODE — msg (p/m)`) và `attempt_id`/`evidence` (:2431+). Tất cả THÊM VÀO CUỐI, không đổi chuỗi cũ ⇒ reader/assert cũ không vỡ.
- **Cổng nay 2 chế độ** (yêu cầu của t99): `node tests/t98-render-coverage.mjs` = báo cáo, in đủ findings, **EXIT 0**; `--strict` = **EXIT 1** khi `uncovered>0`, EXIT 0 khi sạch; cổng hỏng (cờ lạ, số definition ≠ 16, map dòng cũ, đối chứng âm không bắt, render ném) ⇒ **EXIT 2 ở cả hai chế độ**; in một dòng `mode: …`. `RENDER_LINES` cập nhật theo dòng mới.
- **Sau sửa**: `SUMMARY tools=16 fields=110 reached=104 uncovered=0 nested_gaps=0 allow_listed=6 negative_control_applies=true`, verdict GREEN, report EXIT 0, `--strict` EXIT 0, `--bogus` EXIT 2.
- **Test chặn tái diễn**: `tests/t99-render-parity.mjs` **11/11 EXIT=0** — capture definition THẬT, payload giống thật, đối chứng âm trong bộ nhớ (`applies=1 dropped=members delta_bytes=228`), **mutation trên tệp thật** (xoá dòng in roster: `applies=1 delta_bytes=-463` ⇒ `# 8/11 passed, 3 failed` EXIT=1 ⇒ khôi phục `identical=true` sha256 `5deb03ca…`/205 239 B) và các lần chạy thật cổng t98 (mặc định, `--report`, `--strict` EXIT 0; `--bogus`, `--report --strict` EXIT 2).
- **Hồi quy EXIT=0**: t94 9/9 · t90 10/10 · t50 11/11 · t87 8/8 · t86 8/8 · t10 48/48 · t43 19/19 · t3 18/18 · t4 22/22 · t20 15/15 · t30 8/8 · t38 17/17 · t37 14/14 · t70 16/16 · t74 24/24 · t56 20/20.
- **Ngoại lệ đã khai**: `edit_plan.team_id` KHÔNG in được — `tests/t94-edit-plan-roster-render.mjs` (ngoài inScope t99) so NGUYÊN VĂN text ở 3 case; trường này được khai trong ALLOW_LIST của cổng kèm `file:line` + lý do, đúng luật "trường không nên in thì bỏ khỏi cổng kèm lý do".
- **Còn lại (giới hạn đã khai)**: cổng chỉ chấm trường cấp 1 là điều kiện đỏ; giá trị dài bị cắt (prompt 400, message lỗi 200 ký tự) là chủ ý; `presentationMeta`/UI Web không đo ở đây.
- **Trạng thái**: ĐÓNG (t99) trên đường văn bản tool; `edit_plan.team_id` mở lại nếu người dùng cho phép sửa t94.

## BUG-026 — `routeOverride.source` lạ làm `readTeam` NÉM: một giá trị provenance của hệ ngoài giết cả đội ERP (medium, OPEN — t102)

- **Phát hiện**: captain tự probe độ bền ĐỌC trên BẢN COPY `E:/Project/ERP/.agent-teams/erp-erp/team.json` (14 member / 107 task), script `tests/tmp/cap102-strict.cjs`.
- **Tái hiện**: thêm `members[5].routeOverride = { provider:'command-code-goat', model:'deepseek/deepseek-v4-pro', source:'erp', at:Date.now(), by:'erp-tool' }` ⇒ `readTeam` ném `invalid AgentTeams state in team "erp-erp": members[5] is not a valid member record` ⇒ MỌI tool của plugin chết (mọi đường đều qua `readTeam`).
- **Đối chứng (bất đối xứng)**: trường LẠ không nằm trong validator thì ĐỌC BÌNH THƯỜNG — `members[2].erpStage='review'` OK, `tasks[3].erpTicket='ERP-42'` OK, `erpOrgUnit='hanoi'` top-level OK; `routeOverride` thiếu `by` cũng OK (`by` là optional). Tức: thêm TRƯỜNG thì được, còn một GIÁ TRỊ enum do hệ khác ghi thì phá cả đội.
- **Nguyên nhân**: `packages/dsh-agent-teams/lib/state.js:675` (trong `function isTeamMember`, `:662-680`) khai union ĐÓNG `source === 'captain' | 'http' | 'profile'`; lỗi ném ra ở `:825`. Cùng lớp với V6-F1 (thiếu `source` cũng làm chết đội) — chỉ khác chiều.
- **Liên quan**: `tasks[4].status='blocked_by_erp'` ⇒ `task "t5": status "blocked_by_erp" is invalid` (`lib/state.js:874`) — chuỗi lỗi KHÔNG nêu giá trị hợp lệ nên người vận hành ERP không biết sửa gì.
- **Ảnh hưởng tới MASTER TASK**: mục tiêu là tương thích `team.json` ERP; nếu công cụ di trú/đồng bộ của ERP ghi `source` riêng thì bản fork từ chối mở đội ⇒ không đạt yêu cầu tương thích.
- **Hướng khắc phục (đã giao t102)**: đọc chấp nhận chuỗi provenance khớp `/^[a-z][a-z0-9:_-]{0,63}$/u` và giữ NGUYÊN VĂN; đường GHI của plugin vẫn chỉ 3 giá trị; lỗi task status/kind/verdict in kèm danh sách hợp lệ; suite `tests/t102-erp-read-leniency.mjs` ≥10 case trên bản copy ERP.
- **VÁ NỬA ĐỌC (t102) — ĐÓNG**: `packages/dsh-agent-teams/lib/state.js` (56664c59…/57 508 B) thay union đóng bằng `PROVENANCE_SOURCE_PATTERN = /^[a-z][a-z0-9:_-]{0,63}$/u` + `isProvenanceSource(value)` (JSDoc nêu rõ "đọc LENIENT / ghi CHẶT": hệ ngoài ghi provenance không được làm chết đội); giá trị giữ NGUYÊN VĂN, `readTeam` và `readTeamSync` dùng chung validator. `''` / `123` / 65 ký tự / `Erp` / `erp tool` vẫn bị TỪ CHỐI. Thông điệp task status/kind/verdict nay nêu giá trị hợp lệ (statuses = chính mảng validator + `TERMINAL_TASK_STATUSES`; kind/verdict = `TASK_KINDS`/`REVIEW_VERDICTS`; KHÔNG thêm export vào `lib/types.js`).
- **HAI PHÉP KIỂM PHẢI ĐỔI CHỖ, KHÔNG NỚI**: `tests/t58-erp-migrate.mjs` case f4 (`source='script'`) và `tests/t3-route-smoke.mjs` case 18 sub-case `'unknown source'` (`source='bogus'`) cùng khẳng định `readTeam` TỪ CHỐI source ngoài union — chính là union vừa gỡ; cả `script` và `bogus` đều khớp pattern lenient nên dưới luật mới PHẢI đọc được. Nay f4 khẳng định điều ngược lại (đọc được + round-trip nguyên văn), t3 sub-case chuyển sang nhóm HÌNH DẠNG (`''` / `123` / 65 ký tự / `Erp`) và GIỮ NGUYÊN 4 sub-case kia cùng cả vế `readTeamSync`; năng lực bắt lỗi chuyển sang `tests/t102-erp-read-leniency.mjs` (b1–b5 + đối chứng âm f1). Số case không đổi: t58 23/23, t3 18/18.
- **Bằng chứng (t102)**: `node tests/t102-erp-read-leniency.mjs` EXIT 0 `# 17/17`; đối chứng âm f1 `applies=1 old_bytes=57484 new_bytes=57609 delta_bytes=125` (union cũ ném trên ĐÚNG byte mà bản vá đọc được); g1 chạy tool THẬT ⇒ bản ghi bền `"source":"captain"` (neo `lib/tools.js` 1327/1435/1513, `tools/erp-route-migrate.mjs:58` `ROUTE_SOURCE='profile'`); tệp ERP gốc `9f7420b6…15f2d1e` / 1 533 117 B KHÔNG đổi. Hồi quy EXIT 0: t58 23/23 · t3 18/18 · t38 17/17 · t37 14/14 · t43 19/19 · t20 15/15 · t4 22/22.
- **VÁ NỬA GHI (t103) — ĐÓNG**: `packages/dsh-agent-teams/lib/members.js` (50f558f8…/102 260 B; trước vá 4f818b73…/100 367 B) thêm `PROVENANCE_SOURCES = ['captain', 'http', 'profile']` + `resolveProvenanceSource(source, what)` (JSDoc nêu lý do: provenance chỉ có nghĩa khi plugin là chủ duy nhất của đường ghi), gọi ở `setMemberRoute` dòng 1351 (TRƯỚC `withTeamLock`) và ở `setMemberProfile` dòng 1613 (TRƯỚC mọi write). `source` lạ ⇒ ném `agent-teams: <what> refused: source "x" is not one the plugin owns (valid sources: captain, http, profile); nothing was written` — trước lock, trước `team.json`, trước dòng audit. `undefined` ⇒ `'captain'` như cũ.
- **Vì sao vá cả `setMemberProfile`**: cùng tệp, cùng lớp lỗi, cùng đường ghi; chỉ vá `setMemberRoute` thì nửa GHI vẫn hở đúng một cửa (captain đã đồng ý mở rộng trong t103).
- **Bằng chứng (t103)**: `node tests/t103-write-source-clamp.mjs` EXIT 0 `# 10/10`; nhóm (a) `'erp'`/`'script'`/`123` ⇒ ném + fixture `team.json` sha256 `707bf248a29a…` KHÔNG đổi + số dòng `MODEL-SWITCH.md` vẫn 0; (b) `captain`/`http`/`profile` ghi được với cột 8 audit đúng giá trị; (c) thiếu source ⇒ `captain`; (d) tool THẬT với `source:'erp'` ⇒ bản ghi bền `"source":"captain"`, và `grep -c "source: 'captain'" lib/tools.js` = 3 / `grep -c "source: 'http'" lib/index.js` = 6 không đổi; (e) ĐỐI CHỨNG ÂM trên bản copy `lib/` bỏ guard ⇒ `applies=1 old_bytes=102175 new_bytes=102120 delta_bytes=-55 durable_source="erp" audit_row_written=true`. Hồi quy EXIT 0: t43 19/19 · t37 14/14 · t38 17/17 · t58 23/23 · t102 17/17 · t3 18/18 · t56 20/20.
- **Khớp kiểu**: `lib/types/members.d.ts:203`/`:267` đã khai `source?: 'captain' | 'http' | 'profile'` từ trước — t103 làm mã JS thi hành đúng bản khai đó (không sửa `.d.ts`).
- **Giới hạn còn lại**: (1) đọc vẫn lenient có chủ ý (t102) ⇒ `source` là TOKEN mô tả, không phải khoá tin cậy, và người sửa `team.json` bằng tay vẫn ghi được giá trị lạ; (2) `by`/`at` không kiểm — caller nội bộ vẫn ghi được `by` giả; (3) thêm nguồn mới phải sửa CẢ `PROVENANCE_SOURCES` lẫn union trong `.d.ts`; (4) `tools/erp-route-migrate.mjs` tự hard-code `'profile'`, không đi qua guard này.
- **Trạng thái**: BUG-026 ĐÓNG cả hai nửa — ĐỌC (t102) và GHI (t103).
## BUG-027 — agent_teams_status bỏ HẲN hồ sơ `removed` khỏi payload (không chỉ thiếu ở text)

**Mức**: high (mất dữ liệu ở tầng payload) · **Trạng thái**: FIXED ở t107 · **Phát hiện**: t106 (boot thật trên bản copy `team.json` ERP)

### Triệu chứng đo được
`E:/Project/ERP/.agent-teams/erp-erp/team.json` (sha `9f7420b6a1af1f4e3f7b41c3…`/1 533 117 B) có **14 member = 7 `removed` + 6 `idle` + 1 `working`**, 107 task. Captain gọi `agent_teams_status` chỉ đọc `Members (7)`; không có chỗ nào cho biết còn 7 hồ sơ `removed` trong tệp.

### ĐÍNH CHÍNH TIỀN ĐỀ (captain sai, member đo lại đúng)
Giả thuyết ban đầu của captain: "hồ sơ removed mang `routeOverride` nguồn `erp` cần cho migrate/rollback". **SAI**: đo trên tệp thật, **0/14 member có `routeOverride`**. Khoá thật của hồ sơ removed là `id,name,role,provider,model,reasoningEffort,joinedAt,status,runtimeSetup`; `runtimeSetup = { persona (4 073 ký tự), toolFilter { deny: [10 tool cấm] } }`. Vậy thứ payload làm rơi là **`runtimeSetup` + `joinedAt`** (bản sắc vận hành của hồ sơ), không phải route provenance. Hệ quả thiết kế: payload mới vẫn giữ nhánh `route_override` (case a5 chứng minh riêng) nhưng giá trị nghiệp vụ thật nằm ở runtimeSetup/joinedAt.

### Nguyên nhân
- `packages/dsh-agent-teams/lib/tools.js:2444-2445`: `.filter((member) => member.status !== 'removed')` chạy **trước khi dựng DTO** ⇒ hồ sơ removed không tồn tại trong payload.
- `renderStatus` in `Members (${team.members.length}):` trên chính DTO đã lọc ⇒ text chỉ còn 7.

Khác họ với BUG-024/BUG-025 (chỉ mất ở tầng text): ở đây **payload mất dữ liệu**, nên mọi đường đọc (text, JSON của tool, HTTP) đều mù.

### Cách sửa (t107)
- DTO status thêm `removed_count` (number) + `removed_members` (mảng; mỗi hàng `name/role/provider/model/reasoning_effort?/joined_at?/runtime_setup?{persona,tool_filter}/route_override?{provider,model,reasoning_effort?,source,at,by}`). `members` GIỮ NGUYÊN bộ lọc removed (mọi tool khác phụ thuộc).
- `renderStatus`: M>0 ⇒ tiêu đề `Members (N active + M removed):` + khối `Removed (M):` (mỗi dòng: tên [role] provider/model · reasoning · joined ISO · persona · tools · override provenance); **M=0 ⇒ text giữ nguyên từng byte**, không có khối Removed.
- `lib/types/tools.d.ts` `41cfc56576ed8ffd`/7 546 B cập nhật theo; `lib/tools.js` `d402c6586df1e1402c799466ac5ac9333aab8d3828dabc1a0f735dc61c529434`/**210 641 B**.

### Bằng chứng (captain tự chạy lại, EXIT thật)
t107 **12/12** · t98 `--strict` GREEN `tools=16 fields=112 reached=106 uncovered=0 nested_gaps=0 allow_listed=6` · t99 11/11 · t56 20/20 · t94 9/9 · t90 10/10 · t50 11/11 · t43 19/19 · t3 18/18 · t20 15/15 (in `sha256(source): 9f7420b6…15f2d1e`) · t11 HTTP E2E EXIT 0 (`set_member_route` → HTTP 200, `source:"http"`).
Đối chứng âm của member (e1): mã CŨ trong `tests/tmp/t107` ⇒ `applies=3 delta_bytes=-257`, `removed_count=undefined`, tiêu đề `Members (3):`.

### Mutation của captain (bài học mới)
Đổi CHỈ tiêu đề (`Members (N active + M removed):` → `Members (N):`, delta **−42 B**) ⇒ `tests/t107-removed-members-visible.mjs` **9/12 EXIT 1** (`a2`, `a4`, `c1`) nhưng **`t98 --strict` VẪN GREEN**. Kết luận: cổng parity chỉ chấm "trường có tới được text hay không", KHÔNG chấm cách diễn đạt ⇒ muốn bắt lỗi tiêu đề phải có suite khẳng định nguyên văn hoặc boot thật. Phục hồi `identical=true` sha `d402c658…`/210 641.

### Giới hạn còn lại
- `removed_members` KHÔNG phân trang (~600 B/hàng); persona cắt 400 ký tự trong payload, 120 trong text; toàn văn chỉ có trong `team.json`.
- Tiêu đề `Members (N …)` là **đếm theo DTO**, không phải đếm hồ sơ trong tệp nếu tương lai có bộ lọc khác.
- `tests/t98-render-coverage.mjs` phải sửa NGOÀI phạm vi t107 (bản đồ `RENDER_LINES` dời 2620→2663 và 2670→2713, `STATUS_FIXTURE` thêm 5 trường); captain CHẤP NHẬN và đưa thành luật hợp đồng: **mọi task đổi `render` phải khai `tests/t98` trong inScope**.
## BUG-028 — cổng `t98` không đo hợp đồng payload: khoá DTO biến mất mà cổng VẪN xanh (V17-F2)

**Mức**: high (cổng an toàn mù đúng loại hồi quy nó sinh ra để bắt) · **Trạng thái**: FIXED ở t110 · **Phát hiện**: audit vòng 17 (t109)

### Triệu chứng đo được
`tests/t98-render-coverage.mjs` chỉ so `STATUS_FIXTURE` (map TAY) với text render, nên một khoá bị bỏ khỏi DTO `agent_teams_status` vẫn xanh: phép **M1b** của audit (thay `removed_count: removedMembers.length,` bằng comment, giữ nguyên số dòng, `+16 B`) làm `t107` đỏ nhưng `t98 --strict` vẫn `GREEN`. Nói cách khác cổng chấm *cách diễn đạt của fixture*, không chấm *payload thật*.

### Nguyên nhân
- `output.schema` của `agent_teams_status` khai `properties: {}` ⇒ không có bản khai nào để so với payload.
- `nested_gaps` chỉ được in, không vào quyết định thoát (`lib`-side gate chỉ đếm `uncovered`).
- `ALLOW_LIST` ghi `file:dòng` bằng tay: mục `delete.deleted` trỏ `lib/tools.js:2670-2673` trong khi render thật ở `:2713` (sau t110 là `:2748-2751`) — không ai kiểm.

### Cách sửa (t110)
- `packages/dsh-agent-teams/lib/tools.js` **88dbee4079f9…0f08 / 213 071 B**: `output.schema` của `agent_teams_status` khai tường minh **22 property** cấp 1 (`additionalProperties: true`; mảng `items` object) — bản khai để CỔNG so, không phải để validate lúc chạy (`defineTool` chỉ validate `parameters`). Tiêu đề đổi `active` → `present` (V17-F4); nhánh M=0 giữ nguyên từng byte `Members (N):`.
- `tests/t98-render-coverage.mjs` **2c48512203c8…5cd5 / 44 477 B**, 3 cổng mới: (a) `nested_gaps > 0` ⇒ `--strict` EXIT 1 qua `verdictOf`; (b) so HAI CHIỀU schema ↔ payload THẬT (`realStatusPayload()` chạy tool thật trên seed `team.json` trong `tests/tmp/t110/`, `payloadKeyProblems()` báo thiếu khoá và khoá lạ, `STATUS_FIXTURE` cũng bị so — `fixture_drift`); (c) `allowListLineProblems()` đòi khoảng `file:dòng` phải CHỨA dòng render của `RENDER_LINES`, in bảng `ALLOW_LIST LINE AUDIT`.
- `tests/t107-removed-members-visible.mjs` **0c060bd86242…6285 / 24 844 B**: 6 chỗ theo chuỗi mới.

### Bằng chứng (máy chạy, EXIT thật)
- `node tests/t98-render-coverage.mjs --strict` ⇒ EXIT 0, `SUMMARY tools=16 fields=112 reached=106 uncovered=0 nested_gaps=0 payload_findings=0 fixture_drift=0 allow_listed=6 allow_list_line_problems=0 negative_control_applies=true payload_control_applies=true nested_control_applies=true`, `verdict GREEN`.
- Tái hiện **M1b** trên đĩa: `+16 B` (213 071 → 213 087) ⇒ `t98 --strict` **EXIT 1** với `PAYLOAD agent_teams_status.removed_count — declared in output.schema, absent from the payload the tool returned`, `payload_findings=1`, `verdict RED`; `t107` cũng EXIT 1 (7/12). Khôi phục `identical=true`.
- Đối chứng âm 2 (payload, in-memory): `applies=true … dropping removed_count produced 1 finding(s)`, delta `-18 B`. Đối chứng âm 3 (nested, đúng phép M4clip): `applies=true — stripping agent_teams_create.members[0].member_name raised nested_gaps to 1, so --strict exits 1`.
- Hồi quy EXIT 0: t107 12/12 · t99 11/11 · t56 20/20 · `node --check lib/tools.js` OK.

### Giới hạn còn lại
- So hai chiều chỉ ở **cấp 1** của `agent_teams_status`; giá trị lồng không so với schema. Payload thật lấy từ seed 2 member (1 live + 1 removed) ⇒ nhánh DTO cần dữ liệu khác (member staged, mailbox có thư, coverage có evidence) không được phủ.
- `tests/t108-pack.mjs:654,1252` và `tests/t59-erp-live-copy.mjs:337` vẫn ghi `Members (N active + M removed):` và **cố ý để nguyên byte**: t108-pack ghim hash NGUỒN (`tests/t108-pack.mjs:59`) nên nó đỏ sau MỌI thay đổi `lib/tools.js` (artifact-scoped đúng thiết kế); t59 là suite phiên headless lịch sử, regex của nó sẽ trượt `present`. Sửa chúng để xanh sẽ là xanh giả.
- `STATUS_FIXTURE` vẫn là map tay: cổng bắt được khoá BIẾN MẤT (`fixture_drift`), nhưng không chứng minh được fixture mô tả đúng *giá trị* DTO.

## BUG-028 — cửa sổ ghi KHÔNG CHỦ trên `lib/tools.js`: một boot sống chạy mã CŨ mà không ai khai (medium, OPEN)

**Hiện tượng.** Boot sống `tests/t59-erp-live-copy.mjs` lúc **01:03:11Z** in `Members (7 active + 7 removed)` — tiêu đề của bản TRƯỚC t110; các boot 01:00:54Z, 01:09:18Z và 01:14:20Z đều in `Members (7 present + 7 removed)`. `packages/dsh-agent-teams/lib/tools.js` hiện tại sha `88dbee4079f95ffd…`/213 071 B, mtime **01:04:48Z**, và nội dung CHỈ có `present + ${` (grep `active + ${` = 0).

**Loại trừ (đo, không suy đoán).**
- Không phải trỏ sai profile: `C:/Users/thang/.dsh/profiles/agent-teams-test/node_modules/@nami/dsh-agent-teams` là **symlink** (ls -ld: `lrwxrwxrwx`), giải tới đúng nguồn, `lib/tools.js` cùng sha/mtime. `agent-teams-gui` cũng là symlink tới cùng nguồn.
- Không phải mutation của captain: ba phép của t110 (`tests/tmp/cap110-mut.cjs`, `cap110-mutc.cjs`) đọc buffer → ghi biến thể → ghi lại ĐÚNG buffer; không phép nào chạm chuỗi tiêu đề, và cả ba đều khôi phục `identical=true`.
- Không phải mutation của dev-ui-goat: họ khai không ghi `lib/**` trong cửa sổ 01:00–01:05Z, và mtime các tệp họ tạo đều nằm trong `tests/tmp/t113/**` + `tests/t59-erp-live-copy.mjs` (01:13:47Z).
- Không phải lỗi môi trường: boot ĐỎ duy nhất của cửa sổ đó là **01:08:08Z** với `ERR_MODULE_NOT_FOUND: Cannot find package '@nami/dsh-agent-teams'` (profile `@nami` mtime **01:08:24Z** — một lần relink KHÁC, muộn hơn boot 'active' 5 phút).

**Kết luận đo được.** Vì cả hai profile đều symlink tới nguồn, boot 01:03:11Z chỉ có thể đọc nội dung CŨ từ chính `lib/tools.js` ⇒ **giữa 01:00:54Z và 01:03:11Z đã có một lần ghi thay nội dung hiện hành bằng bản cũ ('active'), và lần ghi 01:04:48Z đã trả lại nội dung hiện hành**. Không ai khai nhận lần ghi đó, và repo không có cơ chế nào ghi lại cửa sổ mutation.

**Hệ quả (vì sao đáng ghi thành bug).**
1. Một suite sống có thể PASS/FAIL trên mã KHÁC với mã mà tài liệu và bản phát hành mô tả, mà không cổng nào phát hiện — cùng lớp BUG-010/BUG-022 nhưng lần này người sửa không xác định được, nên không thể chỉ 'nhắc nhau cẩn thận'.
2. Mọi kết luận 'chữ tiêu đề dao động' rút ra từ cửa sổ này là SAI (xem đính chính ở t113); nếu không có mốc thời gian thì một lỗi quy trình biến thành một lỗi sản phẩm ma.

**Cách xử lý đã chốt (mở t114).** Suite sống phải tự chứng minh NGUỒN nó boot: hash `lib/tools.js` TRƯỚC và SAU boot, ghi vào `meta.json`, và có check khẳng định cả hai bằng hằng số đóng băng; đồng thời cấm ghi `lib/**` trong lúc có suite sống đang chạy, và mọi mutation trong tương lai phải ghi cửa sổ có chủ (file, sha trước/sau, thời điểm).

**Trạng thái.** OPEN — đóng khi t114 xanh và có ít nhất một lần chứng minh cổng mới bắt được lệch nguồn.

### BUG-028 · TÁI DIỄN lần 2 (2026-11-01T02:08:18Z) — cửa sổ ghi không chủ trên `packages/dsh-agent-teams/lib/tools.js`

Phát hiện bởi CHÍNH captain khi tự chạy lại `node packages/dsh-agent-teams/tests/t121-pack.mjs --fresh` (run `tests/tmp/t121/run-2026-11-01T02-08-00Z`): bước 4 'drift across the pack window' đỏ — `drift sau pack=1 (lib/tools.js)`.

Số đo nguyên văn từ `meta.json` của run đó:
- `tableBefore.lib/tools.js` = `e51734baf4693cd30f4c86aaf577afb58f8afef39788588d900a93621ae62d61` / **213 715 B** (đúng đóng băng).
- `tableAfter.lib/tools.js` = `f3abdf76bc8c5097bffc0bb2a2dd76c10c2a618ba258bba7d56b96c6c296e6cb` / **213 689 B** (nhỏ hơn **26 B**).
- `tableEnd.lib/tools.js` = `e51734ba…` / 213 715 **trở lại đúng byte cũ**; `driftEnd=0`.
- mtime hiện tại của `lib/tools.js` = **2026-11-01T02:08:18.627Z** (đúng trong cửa sổ này); mọi tệp khác trong `lib/` giữ mtime cũ ⇒ chỉ MỘT tệp bị chạm.

Loại trừ bằng đo, không bằng suy đoán:
- `packages/dsh-agent-teams/package.json` KHÔNG có `prepack`/`prepare`/`postpack` (chỉ có `build`, `verify*`, `doctor`…) ⇒ `npm pack` không tự dựng lại `lib/**`.
- Không script nào trong `tests/`, `tools/`, `packages/dsh-agent-teams/scripts/` ghi vào `lib/tools.js` (grep `writeFileSync` ∩ `lib/tools.js` chỉ ra tệp ĐỌC). Suite t121 chỉ ghi vào bản sao trong `tests/tmp/t121/**` và profile cài.
- Chạy lại Y HỆT lúc 02:10 (`run-2026-11-01T02-10-28Z`): `driftAfter=0`, `driftEnd=0`, ba chiều 13/13, 11/11 PASS, và **mtime `lib/tools.js` KHÔNG đổi** (vẫn 02:08:18.627Z) ⇒ lần ghi đó là sự kiện MỘT LẦN, không phải hành vi của suite.
- Hai lần chạy của member (`run-…02-02-40Z`, `run-…02-04-11Z`) cũng `driftAfter=0`/`driftEnd=0`.

Hệ quả và cách xử lý:
- Cùng lớp với lần 1 (BUG-028 gốc): có tiến trình ghi `lib/**` mà không ai khai nhận; lần này nội dung là một BIẾN THỂ của chính bản vá t117 (nhỏ hơn 26 B), tồn tại <20 giây rồi được trả lại đúng byte.
- Đã ghi nhận là **rủi ro phải định tuyến**, không bỏ qua: giao `t122` (audit vòng 19) phán xét độc lập hiện tượng này (kèm yêu cầu kiểm rằng mọi suite ghi nguồn phải ghi vào BẢN SAO, và rằng cổng `t114-source-freeze` phải bắt được nếu lần ghi đó xảy ra trong lúc một suite sống đang chạy).
- Cổng `t114-source-freeze.mjs` (16/16) và bảng `FROZEN` 13 dòng trong `tests/t59-erp-live-copy.mjs` là thứ DUY NHẤT bắt được lớp sự kiện này khi nó rơi vào cửa sổ một suite sống — vì vậy chúng phải được giữ và cập nhật theo quy ước t114.

### BUG-028 · ĐÍNH CHÍNH lần 2 — thủ phạm ĐÃ XÁC ĐỊNH (2026-11-01, sau t122)

Mục 'TÁI DIỄN lần 2' ở trên ghi *không ai khai nhận*. Nay đã xác định, bằng số đo trùng khít chứ không bằng suy đoán:

- `docs/audit/closure-vong-19.md` §8 (limitations, member tự khai) nói rõ: trước khi brief cấm ghi `lib/**` tới, họ đã chạy 3 phép đột biến TRỰC TIẾP trên `packages/dsh-agent-teams/lib/tools.js` rồi phục hồi ngay.
- Mutation **A** của họ (thay hai chỗ in `ts` bằng hằng số) có delta **−26 B** và sha sau đột biến `f3abdf76bc8c5097bffc0bb2a2dd76c10c2a618ba258bba7d56b96c6c296e6cb` / **213 689 B** — TRÙNG KHÍT `tableAfter.lib/tools.js` mà suite pack của captain ghi được trong `tests/tmp/t121/run-2026-11-01T02-08-00Z` (xem mục trên).
- Thời điểm khớp: mtime `2026-11-01T02:08:18.627Z` rơi đúng cửa sổ `--fresh` của captain (02:08:00Z → 02:08:1xZ). Nghĩa là: không có tiến trình lạ nào; đó là một member ĐANG CHẠY AUDIT song song, ghi vào nguồn trước khi ràng buộc cấm tới tay.

Hệ quả ghi nhận (đổi cách hiểu sự cố, không đổi mức độ):
- Lần 'ghi không chủ' thứ 2 KHÔNG phải bí ẩn môi trường; nó là **va chạm giữa hai tiến trình member đang chạy trên cùng cây nguồn**. Nó làm đỏ A5/A7 của một lần chạy `--fresh` hợp lệ ⇒ một artefact ĐÚNG có thể bị chấm ĐỎ vì lý do không liên quan tới chính nó.
- Đây cũng là **vi phạm outOfScope của chính card t122** (`packages/dsh-agent-teams/lib` nằm trong outOfScope từ lúc tạo card), xảy ra vì member claim card và bắt đầu làm trước khi brief tới, và vì contract không nói rõ *mọi phép đột biến phải làm trên bản sao* như một luật thi hành được.
- Cả hai lần tái diễn đều được phát hiện bởi cơ chế ba mốc `tableBefore/tableAfter/tableEnd` của suite pack; `tests/t59-erp-live-copy.mjs` chỉ lấy mẫu quanh mỗi lần boot, `tests/t114-source-freeze.mjs` chỉ chứng minh helper ⇒ lớp sự kiện này vẫn CHƯA có cổng lấy mẫu liên tục (finding V19-F2, đã mở card vá).

Luật rút ra (đã ghi `docs/log/CHECK.md`):
1. Card audit/mutation phải mang **outOfScope tuyệt đối** với `packages/dsh-agent-teams/lib` VÀ câu *mọi phép đột biến phải chạy trên bản sao* ngay trong `acceptance`, không chỉ trong brief.
2. Trước khi member bắt đầu một phép đo có ghi nguồn, captain không được chạy song song một suite đang lấy mẫu chính cây nguồn đó.
