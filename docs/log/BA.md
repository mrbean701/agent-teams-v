# BA — phân tích yêu cầu

## Yêu cầu gốc (người dùng, m00001 + m00085)
1. Viết lại plugin Agent Teams mà dự án ERP đang dùng (@nanmicoder/dsh-agent-teams v0.1.28) thành một phiên bản mới của riêng mình.
2. Thêm khả năng đổi model của member ngay khi member đang chạy.
3. Thêm khả năng thêm member thủ công (không chỉ qua kế hoạch staged).

## Hiện trạng (đã kiểm chứng bằng mã)
- Đổi model khi đang chạy: chưa có. Route bị khoá 4 lớp; muốn đổi phải huỷ member rồi thêm lại (quy trình tay 6 bước trong E:\Project\ERP\tools\session\chan-doan-doi-model.ps1), dẫn tới team.json của ERP phình thành 14 member với 7 bản ghi 'removed'.
- Thêm member thủ công: công cụ agent_teams_add_member đã chạy được trên đội đang chạy (tools.js:1159-1262) nhưng giao diện /plan không có action add_member và mọi sửa danh sách đều bị requireStagedTeam chặn (tools.js:140-146).

## Phạm vi bản mới
- Giữ nguyên: kiến trúc đội, scheduler, cơ chế staged plan, định dạng team.json (chỉ thêm trường tuỳ chọn).
- Thêm: routeOverride cho member, công cụ agent_teams_set_member_route, runtime.addMember dùng chung, action /plan add_member + set_member_route, trần manualMemberCap 12, UI chọn route và form thêm member.

## Giả định đang dùng (chưa được người dùng trả lời trực tiếp)
- A1: tên gói mới @nami/dsh-agent-teams, cài thử trong profile nháp trước.
- A2: giai đoạn 1 chỉ công cụ + HTTP; UI là giai đoạn 2 sau spike dựng lại bundle client.
- A3: trần tự động giữ 8, thêm trần tay 12.
- A4: không di trú dữ liệu; trường mới là tuỳ chọn nên team.json cũ vẫn đọc được.

## Quyết định kỹ thuật — bản fork
- Gói mới: @nami/dsh-agent-teams, phiên bản 0.2.0-dev.0, đặt tại packages/dsh-agent-teams (bản gốc v0.1.28 vẫn nguyên trong profile desktop để tham chiếu).
- Giữ nguyên id plugin trong cordis.patch.yml là `agent-teams` để panel và các đội đã tồn tại vẫn nhận đúng plugin.
- Giữ nguyên hai hằng danh tính cũ, có lý do: lib/harness-compat.js:69 AGENT_TEAMS_PLUGIN_NAME chỉ dùng cho host định dạng cũ (<3) ở dòng 129, đổi tên sẽ làm source của phiên cũ sai; lib/client/WorkspaceActivity.js:12 TEAM_TAB_ID phải khớp chuỗi id tab đã hard-code trong bundle lib/client.js:3620 nên chỉ đổi được sau khi dựng lại bundle.

## Yêu cầu phi chức năng bổ sung — 2026-10-31T13:23:21.323Z
- **NFR-CHI-PHI-01**: ưu tiên `deepseek-v4.1-flash` cho member để tối ưu chi phí (người dùng yêu cầu). Tiêu chí kiểm: sau khi tính năng chạy, `agent_teams_status` cho thấy toàn bộ member ở `opencode-go/deepseek-v4.1-flash`, và việc đổi được làm bằng tool `set_member_route` mà không tạo member mới và không mất attempt nào.

## Bổ sung — Kênh báo cáo chính thức (2026-10-31T13:41:20.089Z)
- Kênh: **Agent teams report** chat `-1004360988691`, gửi qua `node tools/telegram-report.mjs --file <md> [--silent]`; runbook `docs/bao-cao-telegram.md`, mẫu nội dung `docs/mau-bao-cao-telegram.md`.
- Báo cáo định kỳ: `--silent`. Blocker/mốc lớn: giữ thông báo.
- Cấm kết luận "không có kênh" dựa trên `mcp_connector_catalog` (đây không phải MCP connector).

## 2026-10-31T16:18:04.873Z — Yêu cầu mới phát sinh từ dogfood: NFR-KHANG-LOI-PROVIDER-01
- Hiện tượng: trong 2 giờ chạy thật, 3 provider lần lượt chết (`deepseek-official` Insufficient Balance, `command-code-claude` 404, `opencode-go` 429 GoUsageLimitError) ⇒ member chết giữa task, task `failed`, phải add/remove member thủ công và reassign.
- Vấn đề gốc: route của member là MỘT điểm; plugin có cơ chế `fallback` (`lib/members.js:616-642` `selectFallbackRoute`, `agent/request-error` → `{kind:'retry'}`) nhưng chỉ hoạt động khi member ĐANG CHẠY và chỉ khi cấu hình `fallback` được đặt; không có đường đổi route cho member idle, không có cảnh báo cho captain.
- Yêu cầu cho bản mới: (1) `set_member_route` phải nhận cả provider/model/effort VÀ `fallback` (đổi được khi đội chạy, áp cho cả member idle); (2) khi member failed vì lỗi provider (QUOTA/404/5xx), captain phải nhận được sự kiện/tín hiệu rõ ràng (mailbox hoặc sự kiện `agent-teams/member-route-failed`) kèm provider/model đề xuất thay thế; (3) tuỳ chọn `autoReplaceOnProviderFailure` để plugin tự tạo member thay thế trên route còn sống thay vì bắt captain churn tay. Tiêu chí nghiệm thu: mô phỏng 429 ở member → đội vẫn hoàn thành task mà không cần captain tạo member mới bằng tay.
- Ghi nhận: đây là phát hiện từ vận hành thật, không phải yêu cầu ban đầu của người dùng; đưa vào t13 (tài liệu) và đề xuất thành task riêng sau t10/t11.

## Vòng 5 — Phân tích khoảng trống sau audit vòng 4 (captain, 2026-10-31)

Bối cảnh: 36 task vòng 1–4 đã đóng, audit vòng 4 kết luận PHÁT HÀNH ĐƯỢC. Theo MASTER TASK mục 2.3, không dừng khi TODO trống — phải đối chiếu lại mục tiêu và tìm phần còn thiếu.

Khoảng trống tìm được (đều kiểm bằng mã, không suy đoán):

1. **Không có đường KHÔI PHỤC route gốc.** `setMemberRoute` (`lib/members.js:1167`) chỉ ĐẶT `member.routeOverride`; chỗ duy nhất xoá nó là nhánh spawn thăng cấp (`lib/members.js:991 delete member.routeOverride;`). Không tool, không HTTP, không UI ⇒ một khi captain đổi route thì không thể quay lại route khai báo trong `team.json`. → **t37** (tool clear) + **t39** (HTTP action + nút UI + badge declared/override).
2. **Fallback chỉ đặt được lúc tạo member.** `member.fallback` chỉ nhận từ `add_member`; tool đổi route hiện tại truyền `config.fallback` (giá trị cấu hình chung) chứ không ghi per-member. Với BUG-006 (429) thì captain vẫn phải thay member thủ công. → **t38**.
3. **Đội ERP vẫn phải dùng script PowerShell 6 bước** (`E:\Project\ERP\tools\session\chan-doan-doi-model.ps1`) vì dữ liệu ERP có 7 member `removed` + 7 member `-2`. Chưa có công cụ đề xuất di trú. → **t40** (chỉ đọc, không ghi ERP).
4. **Tarball phát hành sẽ lệch mã nguồn** ngay khi t37–t39 ghi file ⇒ cần pack lại + audit lại. → **t41** (pack) + **t42** (audit vòng 5).

Ràng buộc điều phối: t37 và t38 cùng chạm `lib/members.js` + `lib/tools.js` ⇒ xếp TUẦN TỰ (t38 deps t37) theo quy tắc "không cho 2 member sửa cùng tệp". t39 (client) và t40 (tools/) chạy song song được.

Ghi chú quy trình: CODE FREEZE của vòng 4 được GỠ cho vòng 5; sau mỗi task captain phải đo lại hash 7 tệp lõi và công bố baseline mới trước khi mở task kế tiếp chạm cùng tệp.

5. **(Phát hiện từ t40, 2026-10-31) Không thể chỉnh hồ sơ member trên đội đang chạy.** `setMemberRoute` chỉ đổi route; `role` và `executionPrompt` chỉ được ghi lúc `add_member`, còn `update_member` qua tool/HTTP vẫn staged-only (`lib/tools.js:573-580`). Dữ liệu ERP cho thấy hệ quả thật: 3 cặp member lệch vai trò — `fe-ui` (bản gốc ghi "Giao diện React 19 — vùng ERP/erp-fe/**"), `be-api` ("Backend Java 21 …"), `db-luoc-do` ("Lược đồ dữ liệu …"), trong khi bản `-2` còn sống chỉ ghi "engineer" ⇒ hồ sơ đội đang chạy đã mất thông tin vùng việc. Thêm nữa: member `removed` KHÔNG đặt được routeOverride (`lib/members.js:1178-1181`) và tên cũ bị khoá vĩnh viễn (`lib/tools.js` `has already been used`) ⇒ không thể tái tạo member gốc. → **t43** (tool chỉnh `role`/`executionPrompt` cho member đang sống).
## Vòng 11–12 — BUG-023: khi "route người vận hành ghim" không tới được phiên con (2026-10-31T21:1x–23:5xZ)

Hai vòng 11 và 12 là một câu chuyện nghiệp vụ liền mạch: vòng 11 phát hiện + vá (t86), vòng 12
vá nốt nhánh approve (t87) rồi đóng bằng audit độc lập (t89). Kết luận của mục này áp cho cả vòng 11 và
vòng 12, và rủi ro còn lại ở cuối mục là rủi ro đang mở tại thời điểm vòng 12 đóng.

### Vì sao đây là lỗi NGHIỆP VỤ, không phải lỗi kỹ thuật thuần
Người dùng chấp nhận bản fork này vì một lời hứa nghiệp vụ: **đổi model của một member là có hiệu lực
thật**, và với đội ERP đang chạy thì đó là cách duy nhất để chuyển cả đội sang nhà cung cấp khác mà
không mất lịch sử đội. Công cụ di trú `tools/erp-route-migrate.mjs` ghi `routeOverride` (source
`profile`) lên 7 member `-2`; nếu đường spawn bỏ qua `routeOverride` thì **vận hành viên tin rằng cả
đội đã chuyển nhà cung cấp trong khi thực tế member vẫn chạy route khai báo cũ** — sai lệch im lặng,
không có lỗi nào nổi lên, và chỉ phát hiện khi nhìn `request/header` của phiên con (đúng cách t82 đo).
Đây là lỗi nghiệp vụ vì hậu quả rơi vào *niềm tin của người vận hành về chi phí và nhà cung cấp*, không
phải vào một ngoại lệ trong log.

### Phạm vi lỗi — hẹp nhưng đúng chỗ then chốt
Chỉ nhánh **spawn từ scheduler cho member CHƯA từng có `id`** (`lib/tools.js` `dispatchMember`) đọc
spine `member.provider/model/reasoningEffort`. Đường thủ công (`activateMemberNow`) và member đã có
`id` đi qua `deliverToMember` + live-selection nên vẫn đúng — đó là lý do t18/t21/t45/t59 xanh trong
khi t82 đỏ. Hệ quả thời gian: override của member chưa spawn bị **xoá ngay sau lần spawn đầu**
(`delete member.routeOverride`), nên lần chạy THỨ HAI cũng sai, không chỉ lần đầu.

### Giả định đang dùng (chưa có câu trả lời trực tiếp của người dùng)
- `routeOverride` là **ý định của captain/vận hành viên** và phải thắng route khai báo (declared) —
  giả định này là nền của cả tính năng "đổi model khi member đang chạy".
- Việc escalate route override vào `provider/model` sau spawn là **chủ ý** (giữ descriptor và record
  khớp nhau cho cold-resume guard), nên "override không còn trong `team.json` sau spawn" KHÔNG phải
  mất route; muốn kiểm phải đọc `request/header` của phiên con.
- Route đã ghim không cần re-seed xuống con ĐANG chạy (`setLiveRoute` không làm việc đó) — đó là chủ ý
  của thiết kế v1: route sống do selection sống quyết định.

### Rủi ro còn lại sau khi vá (t86 + t87)
- `approveStagedTeam` đã vá ở t87 (dùng `selectionFromMember`, spine literal = 0 lần trong
  `lib/tools.js`) — nhưng đây là bản vá của CÙNG một lớp lỗi "đọc spine thay vì đọc precedence", nên
  rủi ro hệ thống là **lớp lỗi này có thể tái xuất ở một call-site mới**; biện pháp đang dùng là assert
  đếm call-site + spine literal = 0 trong suite, cộng mutation của captain/audit mỗi vòng.
- `agent_teams_status` **vẫn báo spine** ở dòng member, không báo route override (theo thiết kế v1
  §4.2 e) ⇒ người vận hành đọc status có thể tưởng đội chưa đổi route. Đây là khoảng trống *thông tin*,
  chưa phải lỗi chức năng, và chưa có yêu cầu người dùng nào đổi nó.
- Nhánh cold-resume (member có `id` nhưng con đã chết) chỉ được kiểm qua guard descriptor, chưa có E2E
  riêng cho "resume sau khi override bị escalate".

## Vòng 13 — BUG-024: "route hiệu lực" phải tới được cả MÁY ĐỌC lẫn NGƯỜI ĐỌC (2026-10-31T22:41:04.775Z)

### Vấn đề nghiệp vụ
Người vận hành đổi route cho một member **chưa spawn** (member staged, `id === ''`). Hệ thống đã ghi
`routeOverride` và approve đã resolve route đúng từ t87 — nhưng có hai đường người dùng KHÔNG thấy route đó:

1. **Roster trong `agent_teams_edit_plan`** (`lib/tools.js:1183`) dựng chuỗi từ `member.provider/model`
   (spine) nên báo route KHAI BÁO, không phải route HIỆU LỰC ⇒ người vận hành tưởng override chưa ăn.
2. **Text tool_result của chính `edit_plan`** (`lib/tools.js:1138`) chỉ in `value.graph` ⇒ roster đã có
   trong structured output nhưng KHÔNG tới văn bản người đọc. Đây là nửa còn lại, chỉ lộ ra khi captain
   boot headless thật và đọc nguyên văn `tool_result` (`session-9f394b2f`).

### Vì sao đây là lỗi NGHIỆP VỤ
Yêu cầu gốc của người dùng là *"đổi model khi member đang chạy"*. Một override không hiển thị đúng chỗ
người vận hành ra quyết định thì trên thực tế **không kiểm chứng được** — đúng lớp lỗi "ghi đúng nhưng
đọc sai" đã gặp ở BUG-023 (route ghim không tới phiên con) và ở cổng log (im lặng bỏ qua phép kiểm).

### Cách chốt
- t90: roster theo `selectionFromMember` + dấu nguồn gốc `(override)/(fallback)/(active)`.
- t94: render in graph **rồi** roster; câu tóm tắt giữ nguyên byte.
- t95: cổng log coi header thiếu vòng là LỖI (không im lặng).
- t96: pack vòng 13; **t97 audit độc lập chốt PHÁT HÀNH ĐƯỢC** (boot thật tái lập được dòng roster).

### Rủi ro còn lại (chấp nhận, đã ghi nhận)
- `agent_teams_status` **vẫn** báo spine (thiết kế v1 §4.2 e) ⇒ người đọc status vẫn có thể hiểu sai route;
  đây là khoảng trống thông tin, chưa có yêu cầu người dùng đổi.
- Render hiện là văn bản thuần; nếu sau này thêm cột (effort, fallback) thì phải cập nhật cả C24 của t96.
- Phiên master đang chạy plugin 0.1.28 (BUG-017) ⇒ chính captain không tự gọi được `edit_plan` để thấy
  roster trong phiên này; mọi bằng chứng là boot headless profile `agent-teams-test`.
## Vòng 14 — BUG-025: khi payload đúng mà người đọc vẫn không thấy

- **Hiện trạng**: plugin trả DTO đầy đủ nhưng text tool_result (thứ DUY NHẤT captain/mô hình đọc trong vòng làm việc) bỏ sót 9 trường cấp 1 trên 5 tool. Nặng nhất: agent_teams_create không in roster ⇒ captain vừa tạo đội mà không thấy thành viên/route; agent_teams_set_member_profile không in previous_role/previous_execution_prompt ⇒ mất dấu vết để hoàn tác.
- **Ảnh hưởng nghiệp vụ**: với bản ERP, người vận hành đổi route/prompt của member qua captain ⇒ nếu text không phản ánh giá trị cũ, thao tác không kiểm chứng lại được bằng log hội thoại, chỉ còn team.json. Đây là lỗi "tin được nhưng không kiểm được".
- **Vì sao 13 vòng audit bỏ lọt**: mọi suite cũ kiểm DOM marker, chuỗi trong bundle, hoặc so .d.ts với mã; chưa suite nào đối chiếu schema với render. Lỗi chỉ lộ khi boot headless và đọc nguyên văn tool_result — đúng cách BUG-024 nửa sau được tìm ra.
- **Quyết định**: dựng cổng tĩnh (t98) rồi vá (t99), audit độc lập lại chính cổng (t101 phải tự mutation). Không nới assert, không allow-list trường người đọc cần.
- **Rủi ro còn lại**: fixture do người viết cổng nghĩ ra; render rẽ nhánh theo giá trị có thể báo oan (cổng đã dùng witness set boolean/trạng thái để giảm). Cổng chấm mã hiện tại, không bảo vệ được tool mới nếu tool đó khai schema rỗng.

### Vòng 15 — vì sao bản phát hành phải đổi (nghiệp vụ)

BUG-026 là lỗi nghiệp vụ nặng nhất còn lại với ERP: `team.json` do hệ thống khác sinh ra mang `routeOverride.source` lạ (ví dụ `erp`) hoặc trạng thái task lạ ⇒ **đọc là NÉM**, nghĩa là toàn bộ 16 tool `agent_teams_*` chết chỉ vì một trường mô tả. Vá vòng 15 đóng cả hai chiều:

- **Chiều ĐỌC (t102)**: trường provenance chỉ cần đúng HÌNH DẠNG (`/^[a-z][a-z0-9:_-]{0,63}$/u`) chứ không cần đúng danh sách nội bộ; thông điệp lỗi status/kind/verdict nay nêu danh sách giá trị hợp lệ thay vì chỉ nói 'invalid'.
- **Chiều GHI (t103)**: plugin chỉ nhận `captain|http|profile` và NÉM TRƯỚC khi ghi đĩa/audit, kèm câu `nothing was written` — tức không bao giờ tạo ra tệp mà chính mình không đọc lại được.

Rủi ro còn lại (đã ghi `docs/kiem-thu/t103-write-source-clamp.md` §7): chiều đọc lenient nghĩa là `source` là TOKEN MÔ TẢ, không phải khoá tin cậy — ai sửa tay `team.json` vẫn ghi được giá trị lạ; `by`/`at` không được kiểm; `tools/erp-route-migrate.mjs` hard-code `'profile'` và không đi qua guard. Với ERP, các giới hạn này chấp nhận được vì nguồn ghi duy nhất còn lại là chính plugin.
### Vòng 16 — vì sao unit test chưa đủ (nghiệp vụ)

Ba vòng vừa rồi ta sửa `lib/state.js` và `lib/members.js` và chứng minh bằng suite chạy trong tiến trình (t102/t103). Nhưng với ERP, câu hỏi thật của người vận hành không phải 'hàm có đúng không' mà là: **mở Agent Teams trên `team.json` thật của ERP thì có dùng được không, và ghi route xong có làm mất dữ liệu ERP không**. Hai điều đó chỉ trả lời được bằng một phiên boot thật trên chính tệp 14 member/107 task, đọc lại tệp sau khi ghi và so từng trường ERP-only (`profileSeedId`, `supplementalEvidence`, `runtimeSetup`, `taskSeq`, `approvedAt`).

Rủi ro nếu bỏ qua bước này: ta có thể đang có bộ byte 'phát hành được' mà lần đầu ERP dùng thật vẫn hỏng — đúng kiểu lỗi đã xảy ra ở BUG-023/BUG-024 (unit xanh, đường người dùng đỏ).
## Vòng 17 — audit t109: bản phát hành đúng nhưng CỔNG CHỨNG MINH còn mù một lớp

- **Verdict**: tarball t108 `0cb3fdfe…cfd63f18`/2 247 534 B/133 entry **phát hành được** (133/133 payload = nguồn, 13/13 ba chiều, repack cùng sha+bytes), nhưng công bố bị chặn bởi 2 finding mức medium.
- **V17-F1 (đã sửa ngay trong lượt)**: §2.1 báo cáo còn hash `5deb03ca93b2…`/205 239 B của `lib/tools.js` (thật `d402c6586df1…`/210 641) và thiếu `lib/types/tools.d.ts` — đây là dạng lỗi lặp lại 5 vòng (V7-F1/V8-F1/V10-F1/V11-F1/V14-F3): *báo cáo là đầu vào của phát hành*, sai số ở đó làm operator cài bản thiếu vá.
- **V17-F2 (mở t110) — đây là finding nghiệp vụ nặng nhất vòng này**: cổng `tests/t98-render-coverage.mjs` chỉ chấm `uncovered` (trường schema không tới được text) mà KHÔNG chấm `nested_gaps`, và mù với hồi quy **payload** khi số dòng text không đổi. Audit chứng minh: xoá khoá `removed_count` khỏi DTO nhưng thay bằng comment (giữ số dòng, +16 B) ⇒ `t107` đỏ 5 case nhưng `t98 --strict` VẪN GREEN. Nghĩa là với 1 thay đổi chỉ ở payload, cổng parity cho phép đi qua.
- **Vì sao quan trọng cho ERP**: chính BUG-027 là lỗi payload (DTO lọc mất hồ sơ `removed`) và nó sống qua 13 vòng audit. Nếu cổng chỉ nhìn text thì lớp lỗi đó vẫn có thể tái phát mà CI xanh — tức cái cổng đang bảo vệ niềm tin sai.
- **V17-F4 (mở t110)**: tiêu đề in `Members (7 active + 7 removed)` trên `team.json` ERP thật, trong đó 6 hồ sơ là `idle` và 1 là `working` ⇒ chữ 'active' nói sai trạng thái; đổi sang `present` (đúng nghĩa 'không bị removed') trong khi nhánh M=0 giữ nguyên từng byte.
- **V17-F3/F5/F11 (low)**: dòng trong ALLOW_LIST lệch (`:2670-2673` vs `:2713`), `tests/t35-pack-repack.mjs` ghim hash lịch sử `7fde7bbc…` nên không chế độ nào xanh, và `dependency-report` báo `problems=1` (t107 completed dưới cha t106 failed) trong khi báo cáo vẫn ghi `problems=0` (đã sửa thành `problems=1` + lý do).
- **Kết luận nghiệp vụ**: chuỗi bằng chứng của dự án đã đủ mạnh ở tầng *byte* (hash/repack/ba chiều) nhưng tầng *ngữ nghĩa* (payload có còn đủ khoá không) mới được kiểm bằng suite cụ thể, chưa bằng cổng. t110 phải biến nó thành cổng, nếu không mỗi bản phát hành sau lại phải trông vào việc member viết đúng suite.

## Vòng 18 — vì sao một tiêu đề đếm lại là lỗi NGHIỆP VỤ

Hai lỗi của vòng 17 nhìn qua là chuyện chữ nghĩa, nhưng với ERP thì không:

1. **`Members (N active + M removed)`** gọi cả member `idle` là 'active'. Team ERP thật có 14 hồ sơ: 6 idle, 1 working, 7 removed — câu cũ in '7 active', tức khẳng định SAI về nguồn lực đang chạy. Với người vận hành, đây là con số họ dùng để quyết định có thêm người hay không; sai một từ là sai quyết định. Vòng 18 đổi sang **`present`** — đúng nghĩa 'còn trong team, chưa bị gỡ'.
2. **Cổng chỉ nhìn TEXT**: audit vòng 17 chứng minh một hồi quy PAYLOAD (xoá `removed_count`, giữ nguyên số dòng) làm suite trạng thái đỏ nhưng cổng render-parity vẫn XANH. Với ERP, đường đọc chính là `tool_result` trong hội thoại; nếu cặp (schema ↔ payload ↔ text) không được kiểm ba chiều thì CI xanh mà dữ liệu đã mất — đúng lớp BUG-024/025/027 lặp lại lần thứ ba.

Hệ quả nghiệp vụ đã chốt trong vòng 18: cổng `tests/t98-render-coverage.mjs --strict` phải đỏ ở CẢ BA lớp (thiếu trường cấp 1, mất giá trị lồng, payload lệch schema) và phải đỏ bằng GATE ERROR (exit 2) khi chính bảng miễn trừ sai địa chỉ — vì một bảng miễn trừ trỏ sai dòng là cách âm thầm nhất để vô hiệu hoá cổng.

Còn mở: `tests/t59-erp-live-copy.mjs` (kim chạy sống trên bản copy ERP thật) vẫn ghim câu cũ — nếu để nguyên, lần chạy sống kế tiếp sẽ báo đỏ và người đọc sẽ tưởng dữ liệu ERP hỏng, trong khi chỉ là câu chữ đổi. Đó là lý do t113 tồn tại.

## Vòng 19 — vì sao phải mở vòng mới sau vòng 18

Audit vòng 18 đã chốt tarball `t111` là phát hành được, nhưng chính cổng parity của đội lại lộ ra một lớp lỗi nữa: cổng so khớp token theo **GIÁ TRỊ** chứ không theo **ĐƯỜNG DẪN KHOÁ**. Hệ quả nghiệp vụ: fixture có hai lá cùng giá trị `4242` (`removed_members[0].joined_at` và `route_override.at`), nên khi bản vá bỏ in `joined_at` thì cổng vẫn XANH — tức là một trường người đọc mất mà CI không biết.

**Vì sao người dùng ERP phải quan tâm**: log hội thoại là bằng chứng duy nhất khi đội vận hành đối chiếu lại 'ai đổi model của member nào, lúc nào'. Một dòng `joined_at` hay `findings_open` biến mất khỏi text không làm tool hỏng, nhưng làm câu trả lời 'hồ sơ này vào lúc nào' không kiểm được nữa — cùng lớp với BUG-024/025/027, chỉ khác tầng (payload → text → cổng đo).

**Cái giá đã trả**: vòng 19 phải sửa `lib/tools.js` (`e51734ba…/213 715 B`) để in `findings_open` và in mốc thời gian của inbox, và mọi verdict audit cũ hết hiệu lực ngay khi byte đầu tiên đổi. Vì vậy vòng 19 phải pack lại (`t121`) rồi audit lại (`t122`) trước khi công bố.

## Vòng 19 (phần 2) — vì sao 3 finding medium của vòng 19 không thể đóng bằng một câu 'đã ghi nhận'

Vòng 19 chốt được bộ byte phát hành, nhưng ba finding medium đều nói về CÙNG một lớp: **cổng của đội chỉ đúng trong miền nó lấy mẫu**. (1) V19-F1: luật chống nợ hợp đồng có trong công cụ nhưng được chạy SAU khi card đã terminal ⇒ luật tồn tại mà không có hiệu lực. (2) V19-F2: lớp BUG-028 (một tiến trình ghi nguồn rồi trả lại đúng byte) chỉ bị bắt bởi suite pack có ba mốc; mọi cổng khác chỉ mẫu quanh boot ⇒ cửa sổ 20 giây là vô hình — và hôm nay chính cửa sổ đó làm đỏ oan một lần chạy hợp lệ. (3) V19-F3: cổng render-parity có một entry allow-list mà bất biến của nó chỉ đúng NHỜ cấu trúc dữ liệu, không nhờ phép kiểm ⇒ mutation phá bất biến vẫn cho cổng xanh.

Với người vận hành ERP, hệ quả không phải chuyện học thuật: cả ba đều là kiểu lỗi 'CI xanh mà sản phẩm sai'. Vì vậy captain không ghi nhận suông — mở ngay t123/t124/t125, mỗi card có đối chứng âm bắt buộc (phải chứng minh cổng MỚI bắt được đúng lớp lỗi cũ), và cả ba chỉ chạm `tools/**` + `tests/**` nên verdict phát hành vòng 19 vẫn còn hiệu lực.

## Vòng 20 — vì sao phải mở vòng (2026-11-01)

Người dùng yêu cầu đổi THỨ TỰ panel: đưa `DependencyMap` về vị trí cũ và đặt nút/form `AddMemberControl` ngay TRÊN danh sách member.
Hệ quả kỹ thuật: Host nạp panel từ bundle `lib/client.js` (exports `./client`), nên mọi thay đổi UI phải vào cả ba tệp `lib/client/ActivityPanel.js`, `lib/client.js`, `lib/client.js.map`.
Verdict audit vòng 19 (`docs/audit/closure-vong-19.md`, mốc `2026-11-01T03:05:21Z`) gắn với điều kiện 'lib/** không đổi 1 byte' ⇒ đổi `lib/client.js` là **vô hiệu hoá verdict** ⇒ bắt buộc pack vòng 20 (t130) + audit vòng 20 (t131) trước khi công bố.
Rủi ro riêng của vòng này: repo KHÔNG còn toolchain build (`tsconfig.json`, `tsconfig.client.json`, `tsdown` config đều không tồn tại; `scripts/clean-build.mjs` và `scripts/git-artifacts.mjs` không có) ⇒ bundle phải sửa TAY và phải có cổng đồng bộ source↔bundle↔map, nếu không 'sửa nguồn mà bundle cũ' sẽ là lớp lỗi mới. **ĐÍNH CHÍNH (sau t134):** câu trên SAI — repo CÓ pipeline build thật `build/build.mjs` (esbuild 0.28.2) và `node build/build.mjs` tái lập `lib/client.js` BYTE-IDENTICAL `377bcea2394cc0ac…`/258 432 B; chỉ `lib/client.js.map` là không được sinh lại. Thiếu `tsconfig*.json` KHÔNG đồng nghĩa thiếu toolchain.

## Vòng 21 — vì sao mở vòng (sau verdict vòng 20)

Vòng 20 đã công bố bộ byte `d34be2af…`/2 248 088 B. Audit vòng 20 (t131) đóng dấu điều kiện: 'lib/** hoặc package.json đổi 1 byte là verdict vô hiệu'.

Nhưng chính audit đó mở **V20-F1 (medium)**: `mappings` của `lib/client.js.map` không được sinh lại — `sourcesContent[2]` đã đổi (`d35b5f3f…` → `95963330…`) mà bảng mappings vẫn là bản tiền sửa. Hệ quả thật: khi người phát triển ERP mở DevTools và bấm vào một dòng trong bundle, công cụ nhảy về nguồn **sai cột** (bundle 175 647 và 175 796 cùng trỏ về `392:179`, tức rơi vào chữ 'pendencyMap' thay vì đầu `DependencyMap` và `AddMemberControl`). Nó không làm sai hành vi chạy, nhưng nó làm **sai khả năng truy vết** — với một plugin mà cả giá trị nằm ở việc 'kiểm chứng lại được bằng log/artefact' thì đây là lỗi thật, không phải lỗi trang trí.

Bài học quan trọng nhất của vòng này là một kết luận SAI của captain: tôi đã khẳng định 'repo không còn toolchain build' sau khi kiểm `tsconfig.json`, `tsconfig.client.json`, `scripts/clean-build.mjs` — và ghi kết luận đó vào BA/ACTIVITY/báo cáo. Thực tế `build/build.mjs` tồn tại và dùng esbuild 0.28.2; chạy nó **tái lập `lib/client.js` byte-identical** `377bcea2394cc0ac…`/258 432 B. Tức là 'thiếu file cấu hình của một toolchain cụ thể' KHÔNG đồng nghĩa 'không có cách sinh lại artefact'. Vì kết luận sai đó, cả một vòng được thiết kế để 'sửa tay bundle' trong khi lẽ ra chỉ cần chạy build.

Vì `lib/client.js.map` đổi ⇒ bộ byte phát hành đổi ⇒ phải pack vòng 21 (t135) và audit vòng 21 (t136) trước khi công bố bản có sourcemap đúng.
## Vòng 22 — vì sao phải mở vòng mới (sau t139)

- **Sự kiện**: người dùng bác bố cục panel mà captain tự chốt ở t128 (m07538 + m07553 kèm ảnh) ⇒ t139 đổi `lib/client/ActivityPanel.js`, `lib/client/ActivityPanel.module.css`, rồi sinh lại `lib/client.js` + `lib/client.js.map` bằng `node build/build.mjs`.
- **Hệ quả bắt buộc**: 4 tệp thuộc bảng đóng băng 13 dòng đổi byte ⇒ verdict audit vòng 21 (`6db464d1…`/2 248 091 B) **hết hiệu lực**; không được công bố bộ byte đó nữa, dù bản vòng 21 đã cài trong profile `desktop` một lúc.
- **Vì sao không 'vá nhỏ trong vòng cũ'**: verdict vòng 21 gắn với ĐÚNG bộ byte đã chấm; sửa `lib/**` rồi tuyên bố verdict cũ còn hiệu lực là tự phá nguyên tắc 'byte đã chấm = byte được công bố'.
- **Vì sao KHÔNG đợi vá thêm**: 5 finding còn lại của vòng 21 đều mức low (V21-F1..F5) và đã đóng ở t137; vòng 22 chỉ khác vòng 21 đúng 4 tệp nên phạm vi audit hẹp (chứng minh bằng C1 của brief t141).
- **Rủi ro riêng của vòng này**: đây là lần đầu bản phát hành đổi BỐ CỤC giao diện, và là lần đầu có phép kiểm ở mức BYTE PHÁT HÀNH cho bố cục (t140 A13) — nếu phép đó mù thì người dùng vẫn nhận panel sai dù mọi cổng nguồn xanh.

## Vòng 23 — vì sao phải mở vòng mới ngay sau vòng 22

- **Sự kiện**: người dùng chụp ảnh panel thật và bác bố cục 1:1 của t139 ('member list và dependencies đang ở chung 1 cột'). Audit vòng 22 (t141) đóng với **V22-F0 high** đúng lỗi đó ⇒ bộ byte `b65f60fd…` KHÔNG được công bố.
- **Vì sao không 'sửa nhỏ trong vòng 22'**: bố cục là thứ người dùng nhìn thấy; sửa `lib/client.js`/CSS rồi giữ verdict cũ là tuyên bố sai về bộ byte đang chạy. Byte đổi ⇒ verdict phải đổi.
- **Phạm vi vòng 23**: t142 chỉ đổi 5 tệp (3 nguồn + bundle + map) + 3 pin + 1 doc; 10 tệp còn lại của bảng đóng băng phải nguyên byte — t143 có phép kiểm riêng cho việc đó (A3/A4).
- **Rủi ro chính**: bố cục mới phụ thuộc `@container` KHÔNG có tên; nếu Host chèn container khác giữa panel và `section.team` thì ngưỡng 800px đo sai phần tử và người dùng lại thấy bố cục dọc. Đã khai trong `docs/kiem-thu/t142-three-columns.md`; t143 phải chứng minh bằng BYTE trong bản cài rằng CSS 1:2 thực sự nằm trong bundle phát hành.

## Vòng 23 (phần 4) — vì sao đóng ở đây

- **Ba yêu cầu gốc đều đã có bằng chứng đầu-cuối**: (1) đổi model khi member ĐANG CHẠY — `tests/t18` + `t138` (notice `[model changed: …]`, `request/header` trước/sau, attemptId trong transcript) và boot thật trên bản copy `team.json` ERP; (2) thêm member thủ công — `agent_teams_add_member` + panel Add member có ca `t21`/`t70`; (3) tương thích `team.json` ERP — boot sống trên 14 member (7 `removed` vẫn hiển thị) / 107 task, đọc được trường lạ `routeOverride{source:'erp'}`, ghi chỉ nhận `captain|http|profile` (tệp ERP gốc không đổi sha).
- **Chất lượng đóng bằng đo, không bằng lời khai**: audit vòng 23 PASS; t145 đóng khoảng mù CSS nhúng (đột biến 0 byte bị bắt); t146 làm bảng sweep sạch FAIL (`PASS=44 FAIL=0 LEGACY=16 skipped(pack)=9`); t147 viết tài liệu vận hành trích nguyên văn từ mã.
- **Vì sao dừng**: người dùng yêu cầu 'làm xong thì dừng'; không còn finding medium/high mở; hai việc còn lại đều cần người dùng quyết (publish npm; restart cứng app) nên không tự làm.

## Vòng 24 — vì sao mở lại goal và mở vòng mới

- Người dùng yêu cầu (m08276): cột dependencies phải cao bằng cột member, co giãn khi form Add member mở/đóng. Đây là yêu cầu HÀNH VI bố cục, không phải trang trí ⇒ phải sửa `lib/client/ActivityPanel.js`/CSS ⇒ `lib/client.js` đổi ⇒ **verdict vòng 23 hết hiệu lực**, cần pack vòng 24 + audit vòng 24.
- Goal cũ `goal-1891aa22…` đã ở phase `complete` và KHÔNG resume được (`cannot resume goal … from phase "complete"`) ⇒ tạo goal mới `goal-d0bb5ed0…` cùng objective để tiếp tục vận hành liên tục; đây là ghi nhận kỹ thuật, không phải thay đổi mục tiêu.
- Rủi ro đã biết: đo chiều cao bằng JS thì hành vi phụ thuộc môi trường trình duyệt; test hiện tại render bằng `react-dom/server` nên KHÔNG thấy chiều cao thật ⇒ card t148 phải nêu cách đo thật hoặc khai 'chưa đo được', và captain sẽ tự chụp ảnh GUI ở 2 trạng thái để nghiệm thu.

## Vòng 25 — vì sao mở vòng mới và đánh đổi đã chấp nhận

- **Sự kiện**: yêu cầu của người dùng (m08276) là cột dependencies cao BẰNG cột member và co giãn theo form Add member. t148 làm bằng JS (`ResizeObserver` + `--member-column-height`) và **KHÔNG đạt trên app thật** (captain đo: trái vượt đáy 1080, phải kết thúc ~1040 ⇒ biến không được gán). t150 thay bằng **CSS thuần** `align-self:stretch; contain:size; max-height:none` ⇒ `lib/client.js` đổi ⇒ **vòng mới (25)**.
- **Đánh đổi đã đo và CHẤP NHẬN**: `contain:size` khiến chiều cao tối thiểu của card = padding+border (38 px) nên khi cột trái chỉ còn 1 hàng thì card phải cao hơn 16 px — nhưng nội dung **vẫn cuộn nội bộ** (đo: scrollH 95 > clientH 36) nên không mất truy cập. Trong app, cột trái luôn có header + delegation cell nên ca này không lộ.
- **Vì sao không quay lại JS**: JS đo phụ thuộc thời điểm (ref null, tab ẩn, layout chưa xong) và **suite không phát hiện được** — bài học đã ghi ở CHECK vòng 25. CSS thuần sai thì sai ngay ở lần vẽ đầu, không có trạng thái trung gian.
- **Phạm vi vòng 25**: 5 tệp đổi (3 nguồn + bundle + map), 10 dòng FROZEN còn lại phải nguyên; verdict vòng 23 hết hiệu lực; vòng 24 CHƯA audit và bị vòng 25 thay ⇒ không có bộ byte nào khác được phép công bố.
