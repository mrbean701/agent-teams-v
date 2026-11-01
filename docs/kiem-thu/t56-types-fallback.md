# t56 — Khai báo kiểu cho `lib/members.js` (đóng V5-T1) + cổng biên dịch thật (t83)

Bộ kiểm: `tests/t56-types-fallback.mjs`, hai tầng:

1. **So khớp văn bản** (d1..d17): đối chiếu chữ ký trong
   `packages/dsh-agent-teams/lib/types/members.d.ts` với các dòng `export` thật trong
   `packages/dsh-agent-teams/lib/members.js`. Bắt lệch tên, số lượng, thứ tự tham số,
   sự tồn tại và giá trị hằng số.
2. **Biên dịch thật** (d18..d20, thêm ở t83): chạy chính `tsc` của package trên toàn bộ
   21 tệp `packages/dsh-agent-teams/lib/types/*.d.ts` và đòi exit 0.

## Vấn đề V5-T1

t43 thêm ba giá trị vào `lib/members.js` mà chưa khai báo. Bộ t56 cũ che chúng bằng
danh sách `KNOWN_UNDECLARED` — tức là một export mới **không** bị bắt, miễn danh sách
khớp. t81 khai báo nốt ba tên và làm rỗng danh sách, nên từ nay mọi export giá trị của
`lib/members.js` đều phải có khai báo.

## Ba khai báo đã thêm

| Tên | Dạng khai báo trong `lib/types/members.d.ts` | Nguồn thật trong `lib/members.js` | Giá trị / chữ ký |
| --- | --- | --- | --- |
| `MEMBER_ROLE_MAX` | `export declare const MEMBER_ROLE_MAX: number;` | `packages/dsh-agent-teams/lib/members.js:1203` | 200 — comment nêu đúng số dòng và giá trị, case d13 so lại cả hai |
| `MEMBER_EXECUTION_PROMPT_MAX` | `export declare const MEMBER_EXECUTION_PROMPT_MAX: number;` | `packages/dsh-agent-teams/lib/members.js:1205` | 4000 — như trên, case d14 |
| `setMemberProfile` | `export declare function setMemberProfile(ctx, config, captain, stateDir, teamId, memberName, request, signal?): Promise<MemberProfileChangeResult>` | `packages/dsh-agent-teams/lib/members.js:1563` | 8 tham số đúng tên/thứ tự; `signal` không dùng trong JS nên để optional — case d15 |

Kèm hai interface mô tả đúng dữ liệu thật (không phải export giá trị nên không ảnh hưởng
bộ đếm): `MemberProfileChangeRequest` (role / executionPrompt / source / by — đúng bốn
trường mà phần thân hàm đọc, case d16) và `MemberProfileChangeResult` (snake_case:
`team_id`, `member_id`, `member_name`, `role?`, `execution_prompt?`, `changed`,
`previous_role?`, `previous_execution_prompt?`, `applied: 'durable-only'`,
`origin: 'profile'`, `source`).

## Số case trước / sau

| Thời điểm | Số case | Kết quả |
| --- | --- | --- |
| Trước t81 (`KNOWN_UNDECLARED` 3 tên) | 12 | `# 12/12 passed, 0 failed`, exit 0 |
| Sau t81 (`KNOWN_UNDECLARED` rỗng) | 17 | `# 17/17 passed, 0 failed`, exit 0, in `KNOWN_UNDECLARED=[]` |
| Sau t83 (thêm cổng biên dịch) | 20 | `# 20/20 passed, 0 failed`, exit 0, in `tsc=5.9.3` và `files=21` |

Case d13..d17 (t81): hằng số + giá trị + số dòng, chữ ký 8 tham số + arity runtime = 8,
trường `request.*` được khai báo đủ, và đối chứng âm (allow-list rỗng vẫn bắt được export
bịa `T56_INVENTED_EXPORT`, vẫn bắt được khi xoá một khai báo khỏi bản sao trong bộ nhớ).

## Cổng biên dịch thật (t83)

**Định vị `tsc`:** suy ra từ vị trí của chính bộ kiểm (`import.meta.url`), không hardcode
đường dẫn tuyệt đối và không gọi `npm`/`npx`:

~~~text
TSC_ENTRY    = <package>/node_modules/typescript/lib/tsc.js
TSC_MANIFEST = <package>/node_modules/typescript/package.json   (đọc version)
~~~

Thiếu tệp ⇒ bộ kiểm in `FATAL typescript was not found ...` và **exit 1**. Chỉ khi đặt
`AGENT_TEAMS_ALLOW_NO_TSC=1` mới hạ thành cảnh báo, và khi đó kết quả tự khai
`skipped=true` (không bao giờ được tính là pass). Case d20 đo cả hai nhánh bằng một
`lookup` tiêm vào.

**Lệnh chạy (cwd = gốc repo):**

~~~text
node <TSC_ENTRY> --noEmit --skipLibCheck --target es2022 --module esnext \
     --moduleResolution bundler <21 tệp lib/types/*.d.ts>
~~~

**Kết quả đo:** `tsc=5.9.3`, `files=21`, exit 0 (case d18).

**Vì sao buộc phải có `--skipLibCheck`:** bỏ cờ này thì chính 21 tệp hiện tại exit 2 vì
lỗi **có sẵn, không do t56**: `harness-compat.d.ts(29,65): error TS2339: Property
'subagents' does not exist on type 'Context'` (và các dòng 30, 117, 119, 173),
`web-routes.d.ts(1,54): error TS2307: Cannot find module 'node:http'`, cùng TS2304
`Disposable` trong khai báo của `dsh-session`. Sửa các tệp đó nằm ngoài phạm vi t56/t83.

**Đối chứng âm (case d19):** copy 21 tệp sang thư mục tạm `tests/tmp/t56-tsc-*`, đổi
`captain: Agent, stateDir: string,` thành `... stateDir: number,` **chỉ** trong khai báo
`setMemberProfile`, ghi thêm một tệp `consumer.ts` (import hàm qua `./members.js` rồi gọi
với `'state-dir'`), chạy đúng lệnh trên ⇒ exit **khác 0** với
`consumer.ts(5,66): error TS2345: Argument of type 'string' is not assignable to
parameter of type 'number'.`; in `applies=1 delta_lines=1`; thư mục tạm xoá trong
`finally`.

**Vì sao cần `consumer.ts`:** đo thật — sửa bên trong `.d.ts` một mình vẫn exit 0
(`MEMBER_ROLE_MAX: number` → `: Nope` ⇒ 0; mutation + consumer chỉ đọc hằng số ⇒ 0;
mutation `setMemberProfile` + consumer **gọi** hàm ⇒ 2). `--skipLibCheck` tắt mọi chẩn
đoán phát sinh *bên trong* tệp khai báo, nên chỉ một tệp tiêu thụ mới biến lệch khai báo
thành lỗi biên dịch thật.

## Lệnh và kết quả (chạy từ gốc repo)

~~~text
node tests/t56-types-fallback.mjs          -> EXIT=0  # 20/20 passed, 0 failed
node tests/t43-member-profile.mjs          -> EXIT=0  19/19
node tests/t10-ui-bundle-smoke.mjs         -> EXIT=0  48/48
node tools/check-doc-paths.mjs --summary   -> EXIT=0  paths_missing=0 links_missing=0
~~~

Không rebuild bundle: `lib/types/**` không nằm trong `lib/client.js`, nên
`packages/dsh-agent-teams/lib/client.js` phải giữ nguyên sha256.

## Giới hạn còn lại (nói thẳng)

1. `--skipLibCheck` là bắt buộc, nên cổng biên dịch chứng minh khai báo **parse, bind và
   được dùng đúng kiểu ở chỗ tiêu thụ** — không chứng minh nhất quán nội bộ *bên trong*
   từng tệp `.d.ts` (ví dụ `MEMBER_ROLE_MAX: number` → `: Nope` vẫn exit 0 nếu không có
   consumer đọc nó).
2. Cổng **không** kiểm hành vi runtime: giá trị hằng số đúng 200/4000 hay `members.js`
   thật sự trả đúng khoá là việc của tầng so khớp văn bản (d13/d14/d16) và các suite hành
   vi (t43, t54).
3. Phạm vi biên dịch là `lib/types/*.d.ts` (21 tệp), **không** gồm `lib/types/client/**`.
4. Đây là bộ kiểm, không phải bước build: `packages/dsh-agent-teams/package.json` không
   thêm script `tsc` nào (ngoài phạm vi t83).

## Kết luận

**V5-T1 nay ĐÓNG**: `KNOWN_UNDECLARED = []`, 31/31 export giá trị của `lib/members.js`
đều có khai báo, bộ kiểm vẫn bắt được drift mới sau khi danh sách rỗng, và **hạn chế
"chỉ so khớp văn bản" khai ở t81 nay không còn**: khai báo đã được biên dịch thật bởi
`tsc` 5.9.3 của package, với đối chứng âm chứng minh cổng có thể fail.
