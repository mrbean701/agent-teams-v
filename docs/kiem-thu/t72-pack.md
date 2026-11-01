# t72 — Tarball phát hành vòng 8 (sau t70 state-variant + t71 add-member default route)

Mục tiêu: sinh tarball mới nhất và chứng minh ba chiều payload ↔ bản cài profile sạch ↔ nguồn khớp tuyệt đối,
đủ lớp CSS + planSave + dấu vết t71 trong bundle ĐÃ CÀI.

## Cách chạy (từ repo root)
```
node tests/t72-pack.mjs                       # cổng t71 -> pack x2 -> giải nén -> cài agent-teams-pack7 -> boot
node tests/t72-pack.mjs --analyze <dir>       # chấm lại artefact (nhận cả thư mục run-* lẫn thư mục cha)
```

## Tarball cuối cùng
`packages/dsh-agent-teams/tests/tmp/t72/nami-dsh-agent-teams-0.2.0-dev.0.tgz`
- **sha256 `5137df034fa6ec54ecc98e26842cbf4185fbb3fca320a96690020f07d122c8ac`**
- **2 239 517 B · 133 entry**
- Lần 1 (tests/tmp/t72) và lần 2 (tests/tmp/t72/repack): CÙNG sha256 + size + entry ⇒ `pack determinism: SAME sha256 across 2 runs`.

## 6/6 check của hợp đồng
| # | Tiêu chí | Bằng chứng |
|---|---|---|
| 1 | Tarball in sha256/byte/entry; 2 lần pack cùng sha256 | `5137df03…c8ac` / 2 239 517 B / 133 entry, hai lần trùng khít |
| 2 | drift=0 cho 11 tệp trước/sau pack | `meta.drift={drift:0,changed:[]}`, drift trước 11 tệp = sau 11 tệp; 38 tệp `lib/**/*.js` không đổi trong lượt |
| 3 | tar -tzf strip CRLF: 6/6 bắt buộc, rác=0 | 133 tên đọc bằng tar = 133 entry tự đọc; 6/6 present; node_modules/tests/.tgz lồng/.pid đều rỗng |
| 4 | 3 chiều 11/11 SAME | payload = bản cài = nguồn, `same:true` cả 11 dòng (client.js `5636cd9f66fd`×3/257 459, client.js.map `57892ef70e47`×3/403 287, CSS `53ea47c6d780`×3/51 837) |
| 5 | Bản cài không symlink, ≥141 lớp, có planSave | `agent-teams-pack7`, npm `added 1 package in 2s` exit 0, `isSymbolicLink:false`, `insideProfile:true`, `lockResolved:file:…`; token `aYQbCq_`=719 = nguồn, 150 tên phân biệt, stylesheet 141 lớp / 51 837 B, `aYQbCq_planSave`=true |
| 6 | Probe import bản đã cài + 3 tool gọi được | 16/16 named export nạp bằng `import()`; boot exit 0 `session-555d5da1-a5ea-41e4-9553-f6d2aab037d6` (24,7 s) gọi THẬT `agent_teams_status` + `set_member_route` + `add_member` + `set_member_profile`, mỗi call có tool_result (lỗi QUYỀN "not leading any team", không phải "no such tool") |

Bundle ĐÃ CÀI mang đủ 6/6 dấu vết bản vá (grep chuỗi thật): `aYQbCq_planSave`, `data-add-member-route-default`,
`data-add-member-route-warning`, `data-add-member-catalog-empty`, `pickDefaultRoute`, `data-error-detail` (C15).

## Verify của hợp đồng (EXIT thật)
| lệnh | kết quả |
|---|---|
| `node tests/t72-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t72` | EXIT=0 · 15/15 check PASS |
| `node tests/t10-ui-bundle-smoke.mjs` | EXIT=0 · TOTAL 44 checks, 44 passed |
| `node tests/t70-addmember-default-route.mjs` | EXIT=0 · 16/16 passed |
| `node tests/t72-pack.mjs` (chạy đầy đủ) | EXIT=0 · 15/15 check PASS |

## Trung thực về lần chạy
- Lần 1 (`run-2026-10-31T20-26-47Z`) PASS 15/15 nhưng C15 mới kiểm 3/6 dấu vết t71 mà addendum yêu cầu 6/6.
- Lần 2 (`run-2026-10-31T20-27-59Z`) chạy lại TỪ ĐẦU với C15 = 6/6 chuỗi; tarball **cùng sha256 `5137df03…`**
  (nguồn không đổi giữa hai lần) ⇒ số đo không phải do pack lại, mà do kiểm thêm.

## Giới hạn
- `peerDependencies` không được cài vào profile (chỉ `@nami/dsh-agent-teams`); boot chạy được nhờ runtime desktop cấp `@deepseek-ai/*`.
- Bundle UI không mở trong GUI ở `agent-teams-pack7`; bằng chứng UI là `lib/client.js` + stylesheet đã cài.
- Không `npm publish`, không commit/push; không chạm profile `desktop` hay `agent-teams-pack6`.
