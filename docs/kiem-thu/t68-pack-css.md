# t68 — Pack lại tarball sau bản vá CSS/planSave (t67)

Mục tiêu: artefact phát hành chứa ĐÚNG mã hiện tại (141 lớp CSS + `planSave`), pack tất định, cài được vào profile sạch, boot gọi được 3 tool mới.

Cách chạy (từ repo root):
```
node tests/t68-pack-css.mjs                      # cổng t67 -> pack x2 -> giải nén -> cài profile -> boot
node tests/t68-pack-css.mjs --analyze <run-dir>  # chấm lại artefact đã có, không tốn quota
```

## Kết quả (run-2026-10-31T20-08-04Z, EXIT=0, 14/14 check)

| Bước | Kết quả |
|---|---|
| Cổng thứ tự | `t67`=completed (1 lần hỏi) -> vẫn completed lúc pack và sau pack |
| Pack lần 1 | `nami-dsh-agent-teams-0.2.0-dev.0.tgz` sha256 `03bed22f4bb2c7f0ada8bf16eeddf189047035795177bce54ed2abd3853fd99e` · 2 232 556 B · 133 entry |
| Pack lần 2 (repack) | cùng sha256 `03bed22f4bb2c7f0…fd99e` · 2 232 556 B · 133 entry |
| drift | `drift=0` 11 tệp (trước 11 / sau 11); drift sau boot=0; 38 tệp `lib/**/*.js` không đổi |
| 3 chiều | 11/11 SAME (payload = bản cài = nguồn), mismatches 0. Đại diện: client.js `42f51e8e65af`×3/251 789 · client.js.map `3b85de13f43e`×3/391 373 · ActivityPanel.module.css `53ea47c6d780`×3/51 837 · tools.js `a01b1a1018cb`×3/194 888 · package.json `92a6404071e4`×3/10 498 |
| tar -tzf (strip `\r`) | 6/6 entry bắt buộc; 0 `node_modules`, 0 `package/tests`, 0 `.tgz` lồng, 0 `.pid` |
| Cài profile sạch | `C:/Users/thang/.dsh/profiles/agent-teams-pack6`, `npm i --offline --legacy-peer-deps` exit 0, `symlink=false`, `lockResolved=file:…` |
| Boot headless | exit 0, `session-f309c12d-be37-4d52-88e1-e77471748954`; gọi THẬT `agent_teams_status`, `agent_teams_set_member_route`, `agent_teams_add_member`, `agent_teams_set_member_profile` (có tool_result, không "no such tool") |
| CSS trong bundle | token `aYQbCq_` 719 = nguồn = bản cài · 150 lớp phân biệt · stylesheet 141 lớp / 51 837 B · `aYQbCq_planSave` có ở payload, bản cài và stylesheet |
| Bundle đã cài | `data-member-route-control`=true, `data-add-member`=true, `planSave`=true, hash `AgentTeamsCard`/`WorkspaceActivity` không đổi trong suốt lượt |
| Export bản CÀI | 16/16 named export nạp được bằng `import()` thật (không regex) |

## Trung thực về lần chạy 2
FAIL C14 là do CHECKER: `cardUnchanged/workspaceUnchanged` tính lúc ĐO CSS khi `meta.componentAtEnd` chưa tồn tại (`undefined`) -> luôn false. Đã chuyển phép so sang lúc chấm điểm. Artefact không đổi (cùng sha256 `03bed22f…`); `--analyze` trên chính run đó 14/14, rồi chạy lại toàn bộ end-to-end cũng 14/14, EXIT=0.

## Giới hạn
- `peerDependencies` không được cài vào profile (chỉ có `@nami/dsh-agent-teams`); boot chạy được nhờ runtime desktop cấp `@deepseek-ai/*`.
- Bundle UI không mở trong GUI ở `agent-teams-pack6`; bằng chứng UI là `lib/client.js` + stylesheet đã cài.
- Không `npm publish`, không commit/push; profile `desktop` và `agent-teams-pack2..5` không bị chạm.
- C9/C12 dựa trên `sha256` 38 tệp `lib/**/*.js`; nếu tiến trình khác ghi đúng lúc, kết quả FAIL chứ không im lặng.
