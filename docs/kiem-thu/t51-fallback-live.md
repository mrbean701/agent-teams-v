# t51 — E2E: member TỰ TỤT fallback khi provider chết giữa lượt

Artifact hiện hành (**vòng 4, sau t54/t55**): `tests/tmp/e2e-t51fallback/2026-10-31T19-01-49-321Z` ·
`node tests/t51-fallback-live-e2e.mjs` → **exit 0** · `--analyze <dir>` → `verdict PASS - proved C1,C2,C3,C4,C5,C6 - unproved (none)`.
Artifact vòng 3 (**TRƯỚC t54**): `tests/tmp/e2e-t51fallback/2026-10-31T18-52-18-301Z` · profile nháp `agent-teams-test` ·
`node tests/t51-fallback-live-e2e.mjs` → exit 1 · `--analyze` → `FAIL - … unproved C6`.

## Cách ép lỗi provider THẬT (3 vòng, không mô phỏng hàm nội bộ)
1. `opencode-go/kimi-k2.7-code` (BUG-006 tưởng đã chết) — KHÔNG chết nữa: member chạy 9 step bình thường
   (`request/header` seq 11 + `assistant/message` seq 14…54). Vòng 1 FAIL vì giả định sai, không phải lỗi plugin.
2. `opencode-go-new/minimax-m3.1-flash-free` — lỗi thật `code=INVALID_REQUEST` "400 … Model is unavailable."
   Mã này KHÔNG thuộc `FALLBACK_FAILURE_CODES` nên plugin KHÔNG retry (đúng thiết kế), task `failed`.
3. `cline/moonshotai/kimi-k3` — provider có khai báo trong `cordis.patch.yml` nhưng `CLINE_API_KEY` không có
   trong `.credentials.yaml` ⇒ lỗi thật `code=MISSING_CREDENTIAL` (thuộc tập retry) ⇒ tụt fallback THẬT.

## Kết quả 6 case — vòng 3 (TRƯỚC t54): 5/6
| Case | Kết quả | Bằng chứng thô |
| --- | --- | --- |
| C1 | PASS | `assistant/attempt` #15: `code=MISSING_CREDENTIAL`, message `llm-pi-ai: no credential for provider route "cline"; its profile resolves CLINE_API_KEY, which is not set…` |
| C2 | PASS | cold `routeOf` (chính `lib/members.js` trong profile): `command-code-goat/deepseek/deepseek-v4.1-flash origin=fallback` |
| C3 | PASS | `request/context` #17 trên fallback; `task.status=completed`; `member.status=idle` (member KHÔNG chết) |
| C4 | PASS | `team.json`: `fallbackActive=true activeProvider=command-code-goat activeModel=deepseek/deepseek-v4.1-flash`, spine vẫn `cline/moonshotai/kimi-k3` |
| C5 | PASS | `- worker-a [fallback runner] idle/ready · cline/moonshotai/kimi-k3 → command-code-goat/deepseek/deepseek-v4.1-flash (fallback)` |
| C6 | **FAIL** | `docs/log/MODEL-SWITCH.md` chỉ có 1 row (do captain `set_member_route`, `durable-only`); KHÔNG có row nào cho lần tự tụt |

Verdict: `FAIL - proved C1,C2,C3,C4,C5 - unproved C6` (exit 1).

## Phát hiện (C6 = lỗ hổng sản phẩm, không phải lỗi test)
- `lib/members.js:339-353 updateFallbackState()` ghi `activeProvider/activeModel/fallbackActive` rồi `writeTeam`,
  nhưng KHÔNG gọi audit; `appendRouteChangeAudit` chỉ được gọi từ `setMemberRoute` (`lib/members.js:1423`).
- Hệ quả: nhóm log `MODEL-SWITCH.md` thiếu sự kiện tự tụt, trong khi đường thủ công (set/clear) có row.
  Trái với mục tiêu 'đủ bảy nhóm log' ⇒ đề nghị dev-runtime thêm row `applied=auto-fallback`.

## Vòng 4 (t55, sau t54) — C6 nay PASS, 6/6
- Chạy THẬT một phiên mới (captain `session-1235c252-f92f-40bb-a405-3a6b14b7181e`, exit 0, 45.2 s), member
  `worker-a id=41f43c6f-ad11-4710-860a-a080abbb0a22`, cùng cặp route `cline/moonshotai/kimi-k3` → `command-code-goat/deepseek/deepseek-v4.1-flash`.
- C1..C5 PASS y như vòng 3. C6 nay PASS: audit có **2 row**, row của lần TỰ TỤT là
  `| 2026-10-31T19:02:01.903Z | e2e-t51fallback | worker-a | cline/moonshotai/kimi-k3 | command-code-goat/deepseek/deepseek-v4.1-flash | live-and-durable | auto:41f43c6f-ad11-4710-860a-a080abbb0a22 |`
  (row còn lại của captain `set_member_route`: `… | durable-only | captain:session-1235c252-… |`).
- Chứng minh phép sửa nằm ở CHÍNH artifact: chấm lại `18-52-18-301Z` (trước t54) vẫn `FAIL … unproved C6` exit 1,
  chấm `19-01-49-321Z` (sau t54) `PASS` exit 0 ⇒ C6 đổi vì `lib/members.js` đổi, KHÔNG phải test nới lỏng.
- Sai lệch ghi nhận: cột `applied` của row tự tụt là `live-and-durable` (không phải `auto-fallback`); provenance ở cột 7 `auto:<child session id>`.
- Hồi quy kèm theo (exit 0): `tests/t38-member-fallback.mjs` 17/17, `tests/t37-route-clear.mjs` 14/14, `tests/t3-route-smoke.mjs` 18/18.

## Điều CHƯA phủ (khai báo thẳng)
1. Nhánh `QUOTA`/`RATE_LIMIT`/`429` KHÔNG tái hiện được (BUG-006 hết hiệu lực), nên đường 429 chưa chứng minh;
   `AUTH`, `NO_ADAPTER` cũng chưa chạy.
2. Chỉ chạy được đúng 1 lần tụt (một cấp fallback). Không kiểm tụt lần 2 hay quay lại route gốc.
3. Fallback được cài TRƯỚC khi spawn (đúng ràng buộc: `fallback` chụp lúc registration, `lib/members.js:741`);
   cài fallback lên member ĐANG chạy rồi mong tụt ngay thì không phủ.
4. Không kiểm thông điệp `model-changed`/notice cho lần tự tụt, không kiểm panel UI (môi trường headless).
5. Môi trường dùng chung working tree: 2 vòng đầu có cảnh báo `lib/**` đổi giữa lúc chạy (agent khác đang sửa);
   vòng 3 KHÔNG có cảnh báo, nên bằng chứng vòng 3 sạch.
6. Test exit 1 là ĐÚNG thiết kế khi còn case FAIL; `--analyze` chấm lại không tốn quota.
