# t34 — Panel hiển thị vết lỗi provider (last_failure)

Ngày 2026-10-31 · Owner: dev-ui-goat · Attempt 1 (`a49cb51a-60bd-420c-b467-ff3f26380b63`)

## 1. Vì sao có task này

F4 của audit vòng 3: t28 ghi bền `members[].lastFailure` trong team.json, t30/t31 phát `last_failure` trong DTO `agent_teams_status`, nhưng panel đếm được **0 hit** cho `lastFailure`/`last_failure` trong `lib/client/**` và `lib/client.js` ⇒ người dùng GUI không thấy member nào chết vì provider.

## 2. Chỗ sửa

| Tệp:dòng | Nội dung |
| --- | --- |
| `lib/client/MemberControls.js:28-30` | `FAILURE_ROW` / `FAILURE_LABEL` / `FAILURE_DETAIL` (inline style, không dựa class css-module) |
| `lib/client/MemberControls.js:100-125` | `failureInstant(at)` → `YYYY-MM-DD HH:MMZ`; `memberFailure(member)` lọc record hỏng và dựng `detail` = `code · at · provider/model` |
| `lib/client/MemberControls.js:127-137` | `export function MemberFailureNotice({ member, t })` → `div[data-member-failure=code][role=status][title=message]`; member lành trả `null` |
| `lib/client/ActivityPanel.js:29` | import `MemberFailureNotice` |
| `lib/client/ActivityPanel.js:425` | chèn `_jsx(MemberFailureNotice, …)` ngay sau `MemberRouteControl`, trước `assignmentLine` |
| `lib/client/locales.js:230` / `:473` | khoá `member.failure.title` — zh `提供方故障`, en `Provider failure` |
| `tests/t10-ui-bundle-smoke.mjs` | 3 member mẫu (failing / healthy / corrupt) + 3 check mới |
| `lib/client.js` + `lib/client.js.map` | sinh bằng `node build/build.mjs`, không sửa tay |

## 3. Cách đọc trên panel

Một hàng nhỏ dưới dòng route của member: nhãn **Provider failure** + `QUOTA · 2023-11-14 22:13Z · p0/m0` (code · thời điểm · route đã chết); `title` của node là `message` (server cắt ≤300 ký tự tại `lib/members.js:129`). Record thiếu, sai kiểu, `code` rỗng, hay `at` không parse được ⇒ **không render gì**; member lành ⇒ hàng của nó không đổi một byte.

## 4. Bằng chứng đo được

- Build 2 lần cùng hash: `lib/client.js` `0026ac70a5fcdfa4a749d908516c029e92127a23378a7de0a93b19fe1aa82d89` / 193129 B, map `28facff2641a75b2073a0c43d107f0fd8644d31f00cec66b4f8ab27361f5a032` / 326147 B (trước t34: `d28532e7…5cc91` / 191153 B, map `70cb6e90…4841` / 322244 B); BUILD1_EXIT=0, BUILD2_EXIT=0, `node --check lib/client.js` OK.
- `node tests/t10-ui-bundle-smoke.mjs` → **TOTAL 25 checks, 25 passed, 0 failed**, EXIT 0 (22 case cũ không hồi quy + 3 case mới: renders notice, `QUOTA · 2023-11-14 22:13Z · p0/m0`, healthy+corrupt chỉ sinh đúng 1 hàng).
- Map: 19 `sources`, 0 `sources` lẫn `sourcesContent` chứa `[A-Za-z]:[\\/]`; `sourcesContent[12]` (`../lib/client/MemberControls.js`) **bằng đúng từng byte** nội dung trên đĩa và chứa `data-member-failure`; bundle cũng 0 hit đường dẫn ổ đĩa.
- Chromium thật, `file:///E:/Project/Agent-Team/packages/dsh-agent-teams/build/test-load.html`: `Overall: PASS`, `inject contents: [uiConversation, slots, sessions, locale, modelDirectories, layout]`, **console 0 entry**.
- `TEAM_TAB_ID` không đổi: `@nanmicoder/dsh-agent-teams/activity` có trong `lib/client/WorkspaceActivity.js` và trong bundle.

## 5. Giới hạn còn lại

- Panel chỉ vẽ lại khi snapshot host đổi; không có poll riêng, nên vết lỗi hiện ra ở lần refresh kế tiếp sau khi `members.js` ghi team.json.
- Chưa bấm thử trong GUI sống: bằng chứng là SSR + bundle loader harness + Chromium trên `test-load.html`, không phải một phiên team thật có member chết vì provider.
- Không chạm composer model của captain, `MemberRouteControl`, `AddMemberControl`, `StagedModelPicker` (0 byte đổi).
