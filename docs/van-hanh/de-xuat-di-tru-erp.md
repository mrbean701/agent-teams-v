# Đề xuất di trú route cho đội ERP (chỉ đọc)

Công cụ: `tools/erp-route-proposal.mjs`. Bài kiểm: `tests/t40-erp-proposal.mjs` (20 check).
Mục đích: thay quy trình đổi model 6 bước của dự án ERP bằng một bản đề xuất đọc được, có bằng
chứng không ghi, để captain tự quyết định từng bước ghi.

## 1. Chạy script (chỉ đọc)

    node tools/erp-route-proposal.mjs                       # mặc định: đội erp-erp của dự án ERP cạnh repo
    node tools/erp-route-proposal.mjs --team <team.json>    # đội khác
    node tools/erp-route-proposal.mjs --json                # cùng dữ liệu, dạng JSON cho máy

Script đọc tệp hai lần và in ba dòng làm bằng chứng:

    sha256 before = 9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e
    sha256 after  = 9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e
    identical = true

`identical = false` thì script thoát mã 3: đó là bất thường, dừng lại và báo captain.
Đo trên đội erp-erp thật (1 533 117 B): sha256 trùng, kích thước và mtime không đổi.

## 2. Đọc bảng đề xuất

Mỗi dòng là một cặp (member gốc đã `removed` ↔ member successor tên `-N` còn sống) cùng vai trò,
kèm route hiện tại của cả hai bên, trạng thái bên giữ lại, số task đang mở và cảnh báo role lệch.
Số liệu đội erp-erp hôm nay: 14 member (7 sống / 7 removed), 107 task (1 đang mở, thuộc `qa-do-2`),
7 cặp đề xuất được, 0 member không suy ra được cặp.

Cảnh báo đã in ra và phải đọc trước khi gỡ ai:

- `fe-ui`, `be-api`, `db-luoc-do`: role LỆCH — bản gốc ghi mô tả vùng việc, bản giữ lại chỉ ghi
  `engineer`; kiểm tra lại mô tả vùng trước khi quyết định.
- `qa-do-2` đang giữ 1 task chưa kết thúc: KHÔNG được gỡ member này (gỡ sẽ huỷ attempt của task mở).

## 3. Captain đổi route cho member đang chạy

Dùng `agent_teams_set_member_route` (đặt `routeOverride` bền trên member còn sống; nếu tiến trình
đang sở hữu child session thì áp live ngay, nếu không thì áp ở lần chạy kế tiếp). Ví dụ:

    agent_teams_set_member_route { member_name: "qa-do-2", provider: "opencode-go", model: "deepseek-v4.1-flash", reasoning_effort: "max" }

Không đặt route lên bản gốc đã `removed`: plugin từ chối member đã gỡ
(`packages/dsh-agent-teams/lib/members.js` — lọc `status !== 'removed'`, kèm chú thích
"A removed member keeps its record for audit; it cannot be re-routed"), và bản ghi đó không xoá
được khỏi roster. Tên đã dùng cũng bị khoá vĩnh viễn
(`packages/dsh-agent-teams/lib/tools.js`, chỗ chặn `has already been used in team`), nên đừng
tạo thêm member `-3`: member còn sống đã là thế hệ duy nhất của vai trò đó.

## 4. Gỡ member thừa

Chỉ gỡ bằng `agent_teams_remove_member` khi member đó không còn task mở; gỡ xong bản ghi chuyển
`status: removed` và vẫn nằm trong roster để kiểm toán. Bản đã removed thì gỡ lại là vô nghĩa.

## Ranh giới: bước ghi KHÔNG được tự động hoá

Script dừng ở đề xuất. Nó không gọi tool, không mở tệp để ghi, không sửa `team.json` của ERP:
bước 3 và 4 do captain thực hiện qua tool, nên mọi thay đổi đều có audit và có người chịu trách nhiệm.
Muốn chứng minh lại: `node tests/t40-erp-proposal.mjs` (chạy trên bản copy trong `tests/tmp/t40/`,
riêng một case chạy trên tệp ERP thật và khẳng định sha256 trước == sau).

## 5. Bước GHI có chốt an toàn (t58)

Mục trên nói script đề xuất **không** tự ghi — điều đó vẫn đúng với `tools/erp-route-proposal.mjs`
(chỉ đọc). Từ t58 có thêm công cụ ghi riêng `tools/erp-route-migrate.mjs` để khỏi gõ tay 7 lần
việc "đặt `routeOverride` của bản gốc lên member kế nhiệm `-2`". Nó không tự quyết định: người
chạy vẫn phải đưa sha256 của tệp và một đường dẫn backup.

    # 1. Xem trước (mặc định): in bảng diff, KHÔNG ghi byte nào
    node tools/erp-route-migrate.mjs
    node tools/erp-route-migrate.mjs --pair ha-tang        # chỉ một cặp
    node tools/erp-route-migrate.mjs --json                # cho máy đọc

    # 2. Ghi thật (bắt buộc đủ backup + sha mong đợi)
    node tools/erp-route-migrate.mjs --apply \
        --backup <thư-mục-sao-lưu>/team.json \
        --expect-sha256 <sha256 của tệp lúc bạn vừa đọc>

Chốt an toàn — mỗi chốt đều dừng, **exit 2**, không ghi byte nào:

| Chốt | Dừng khi |
| --- | --- |
| `--backup` | `--apply` mà thiếu `--backup` |
| `--expect-sha256` | `--apply` mà thiếu sha, hoặc sha tệp lúc chạy khác giá trị đưa vào (ai đó vừa sửa) |
| bản sao | sha256(bản sao) khác sha256(bản gốc) sau khi copy |
| backup cũ | đường dẫn backup đã tồn tại — không ghi đè lên bản sao tốt cũ |
| member gốc | không tồn tại (`MEMBER_NOT_FOUND`), còn sống (`BASE_STILL_ACTIVE`), hoặc không có route khai báo (`BASE_NO_ROUTE`) |
| member đích | không tìm thấy `-N` (`TARGET_NOT_FOUND`) hoặc đã `removed` (`TARGET_REMOVED`) |
| hình dạng tệp | không tái tạo được **nguyên văn** tệp, hoặc deep diff sau khi sửa khác tập khoá mong đợi |
| plugin đọc lại | sau khi ghi, `readTeam` của plugin từ chối tệp — công cụ **tự khôi phục từ backup** rồi dừng (exit 2) |

**Ghi đúng một thứ:** `member.routeOverride` trên member đích, với ĐỦ trường mà validator
`packages/dsh-agent-teams/lib/state.js` (`isTeamMember`) đòi:

    { provider, model, reasoningEffort?, source: "profile", at: <ms>, by: "tools/erp-route-migrate" }

`source` phải thuộc union `{captain, http, profile}`. Công cụ chọn **`profile`** vì route này do
người vận hành ghim từ ngoài phiên (không phải captain gọi tool, cũng không đi đường HTTP); `at` là
đồng hồ lúc ghi; `by` giữ provenance (đổi bằng `--by <tên>` nếu muốn ghi tên người chạy). Thiếu
`source`/`at` thì `readTeam` ném `members[N] is not a valid member record` và **cả đội ERP chết** —
đúng lỗi V6-F1 mà audit t61 bắt được. Không chạm `members`, `tasks`, `name`, `id`,
`captainSessionId`, `phase`, `taskSeq`, `approvedAt`; route khai báo (`provider`/`model` của member)
giữ nguyên.

**Đọc lại bằng plugin trước khi chạy đội:** sau mỗi lần `--apply`, công cụ tự gọi `readTeam`
trên đúng đường dẫn plugin dùng (`<stateRoot>/<teamId>/team.json`) và in
`plugin round-trip: readTeam ok (members=N)`; nếu plugin từ chối thì nó khôi phục bản backup rồi dừng.
Người vận hành vẫn phải xác nhận trên đội thật (gọi `agent_teams_status` để captain đọc lại
`team.json`) **trước khi khởi động lại đội ERP** — đừng tin route mới chỉ vì lệnh ghi đã exit 0.

**Idempotent:** chạy `--apply` lần hai (với sha mới) không đổi byte nào và in `already migrated: N`
ra stderr; khi không có gì phải ghi, công cụ **không mở tệp để ghi**.

**Mã thoát:** `0` xong · `1` tham số/đọc sai · `2` từ chối vì an toàn. Output không in đường dẫn
tuyệt đối (chỉ đường dẫn tương đối so với thư mục đang chạy).

**Chứng minh lại:** `node tests/t58-erp-migrate.mjs` — 23 case (18 cũ + 1 ROUND-TRIP đọc lại bằng
`readTeam` + 3 case âm: thiếu `source`, `at` là chuỗi, `source` ngoài union + 1 dry-run trên tệp ERP
thật), mọi phép ghi chỉ rơi vào
`tests/tmp/t58/`; riêng tệp ERP thật được đo sha256 + mtime + danh sách tệp trước và sau và phải
không đổi (mốc `9f7420b6a1af1f4e…`).

**Giới hạn:** (1) công cụ chỉ ghi `routeOverride` — không gỡ member, không sửa task, không đổi route
khai báo; (2) nó ghi thẳng `team.json` trên đĩa nên tiến trình captain đang chạy có thể còn giữ bản
trong RAM cho tới lần đọc kế tiếp — phải để captain đọc lại (`agent_teams_status`) trước khi tin route
mới, và đổi model cho member đang chạy vẫn nên làm qua `agent_teams_set_member_route` để có audit +
áp live; (3) `--expect-sha256` chỉ chống ghi đè giữa
lúc bạn đọc sha và lúc chạy, không chống hai người chạy song song cùng sha — đừng chạy song song.
