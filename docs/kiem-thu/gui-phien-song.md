# Dogfood trong phiên SỐNG — bằng chứng GUI thật (profile `agent-teams-gui`)

Ngày: 2026-10-31 · Người thực hiện: captain (lead) · Mục tiêu: đóng phần "chưa ai bấm GUI thật trong phiên sống" mà audit vòng 4 (V4, rủi ro 1) để mở.

## 1. Vì sao KHÔNG dùng được profile `agent-teams-test`

Manifest `C:/Users/thang/.dsh/profiles/agent-teams-test/package.json` khai:

```
bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless", "@nami/dsh-agent-teams"]
```

Không có `@deepseek-ai/dsh-web-app` ⇒ profile này là **headless**, mở lên không có Web GUI nên không thể "bấm panel". Lựa chọn dogfood của người dùng (khởi động lại bằng `agent-teams-test`) không thực hiện được đúng nghĩa bấm chuột; phải dựng một profile **web** riêng.

## 2. Profile web mới (không chạm `desktop`, không chạm `agent-teams-test`)

```powershell
dsh.cmd --from-default-profile web --profile agent-teams-gui --dump-config
```

Kết quả: `C:/Users/thang/.dsh/profiles/agent-teams-gui/package.json` với `bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]`.

Nối fork bằng **junction** (script `tests/tmp/link-gui-profile.mjs`, `fs.symlinkSync(target, link, 'junction')` — `mklink /J` qua bash bị `Invalid switch`):

- `node_modules/@nami/dsh-agent-teams` → `E:\Project\Agent-Team\packages\dsh-agent-teams` (link exists `true`, realpath đúng, version `0.2.0-dev.0`);
- manifest: `dependencies: {"@nami/dsh-agent-teams": "file:E:/Project/Agent-Team/packages/dsh-agent-teams"}`, `bundles` thêm `@nami/dsh-agent-teams`.

## 3. Bằng chứng GUI SỐNG

Boot:

```powershell
dsh.cmd --profile agent-teams-gui --port 19488 --host 127.0.0.1 --no-open
# → dsh web: http://127.0.0.1:19488/?token=…
```

Mở bằng Chromium thật và đo:

| Đo | Kết quả |
|---|---|
| Tiêu đề trang | `DeepSeek Harness` (295 node DOM, có sidebar session, composer, model picker `DeepSeek-V4.1-Flash / High`) |
| `browser_console` | **0 entry, 0 error** |
| `browser_network` | 50 request, **0 mã 4xx/5xx** |
| `GET /plugins/dsh-agent-teams/state` | **10 lần đều 200** (kèm `?archived=1`) |
| Bundle gộp `/plugins/??…` | 200, **có `@nami/dsh-agent-teams/client.js`** (13 package trong bundle đó) |

⇒ client module của fork **nạp và chạy thật** trong Web GUI (mạnh hơn `build/test-load.html`, vốn chỉ là trang giả lập `__ModuleLoader__`).

## 4. Auth fence của host THẬT (bổ khuyết cho t24)

t24 chỉ kiểm phản ứng của plugin với status do Connection trả về. Ở GUI thật, đoạn này chạy qua Connection thật:

- `fetch('http://127.0.0.1:19488/plugins/dsh-agent-teams/state')` **không cookie** → `401 {"error":"unauthorized"}`;
- `GET /?token=…` → **303** + `set-cookie: dsh-auth-…`;
- cùng `state` **có cookie** → **200**.

## 5. Dữ liệu thật trả về (chứng minh plugin đọc state của workspace)

`GET /plugins/dsh-agent-teams/state` (cookie hợp lệ) → `teams: 2`:

| workspace/teamId | phase | members | tasks | deliverable |
|---|---|---|---|---|
| `ERP/erp-erp` | running | 7 | 107 | false |
| `Agent-Team/nami-agent-teams` | running | 5 | 36 | **true** |

## 6. Phần CHƯA chứng minh (nói thẳng)

- **Chưa bấm được** `MemberRouteControl` / `AddMemberControl`: panel nằm trong ngữ cảnh một session có team. Trong GUI này click vào `div[role=treeitem]` của session (ref 129) và workspace label (ref 210) **không mở** session; nút `Open right sidebar` mở được khung nhưng rỗng.
- **Không nên** mở session sống thứ hai trên cùng Host trong lúc phiên master đang chạy (rủi ro tranh chấp `team.json`/`inbox`), nên captain dừng ở đây thay vì ép.
- Server test đã tắt (`job_kill` → cổng 19488 đóng, `ECONNREFUSED`), không để tiến trình nền.

## 7. Kết luận

- Đóng **một phần** rủi ro 1 của audit vòng 4: plugin **nạp được trong Web GUI thật**, phục vụ state **200** với đội thật, **0 lỗi console**, auth fence của host hoạt động.
- Còn lại đúng một việc cần NGƯỜI: mở GUI bằng profile web có plugin (ví dụ `agent-teams-gui`), tạo/mở một session trong workspace có đội, rồi bấm thử 2 control mới.

## 8. Nỗ lực TỰ BẤM của captain (theo lựa chọn của người dùng) — BỊ CHẶN bởi công cụ

Sau khi người dùng chọn "cho captain mở 1 session ngắn trong `agent-teams-gui` rồi tự bấm", captain đã thử và ghi lại đúng những gì xảy ra:

1. Boot lại server cổng 19488 (token mới), mở bằng Chromium thật: composer hiện đúng (`div[role=textbox].GRgSLq_input` + placeholder "Describe what you want to build…").
2. Gõ lệnh tạo đội vào composer: `browser_type({ref:227})` → **không vào**; sau đó `browser_click({x:500,y:420})` + `browser_type` → vẫn **không vào**; thử `browser_press('h')` + `('i')` → vẫn **không vào**. DOM giữ nguyên placeholder (`prompt text present in DOM: false`).
3. ⇒ **Không thể tạo session/bấm form** bằng bộ automation này (click thì có tác dụng — đã mở/đóng được right sidebar — nhưng mọi thao tác GÕ CHỮ đều vô hiệu trên editor của GUI).
4. Ghi nhận thêm 1 entry console ở lần mở thứ hai: `error: [deepseek-account] account read failed Object` (profile nháp không có cấu hình account) — không chặn render, nhưng là lý do khả dĩ khiến editor không nhận focus.
5. Server test **đã tắt** (`job_kill` → `ECONNREFUSED`).

Kết luận: DOG-02 (bấm 2 control trong panel) **không thể hoàn tất bằng automation của phiên này**; cần NGƯỜI bấm, hoặc chấp nhận bộ bằng chứng hiện có (SSR + bundle + Chromium `test-load.html` + GUI sống 0 lỗi + state 200 + fence 401/200).
