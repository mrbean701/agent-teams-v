# t82 — routeOverride do `erp-route-migrate --apply` điều khiển lượt chạy THẬT của member

Trạng thái: **PASS 6/6** — lần chạy thật sau bản vá: `tests/tmp/e2e-t82/run-2026-10-31T21-25-33-603Z`.

## Câu hỏi
Khi `tools/erp-route-migrate.mjs --apply` ghi `routeOverride` (source `profile`) lên một member
còn sống, thì **phiên con THẬT** của member đó có gửi request bằng route đã di trú hay không —
hay plugin chỉ ghi vào tệp mà không ảnh hưởng lượt chạy kế tiếp?

## Cách chạy
```
node tests/t82-erp-migrate-live.mjs                              # 3 phiên headless thật (profile nháp agent-teams-test)
node tests/t82-erp-migrate-live.mjs --analyze tests/tmp/e2e-t82  # chấm lại từ đĩa, 0 phiên
```
Fixture là đội do chính plugin tạo qua tool (`agent_teams_create`) trong `tests/tmp/e2e-t82/run-<stamp>/{ws-a,ws-b}`
— không tự viết JSON tay. Mỗi member một model khác nhau, đều provider `command-code-goat`:
`alpha` = `deepseek/deepseek-v4-pro`, `alpha-2` = `deepseek/deepseek-v4.1-flash`,
`beta` = `deepseek/deepseek-v4-flash`, `beta-2` = `deepseek/deepseek-v4-flash-fast` (effort high).

## Bảng tiêu chí
| Mã | Tiêu chí | Cách đo |
| --- | --- | --- |
| C1 | Fixture đúng layout của plugin: `<ws>/.agent-teams/e2e-t82/team.json`, 2 cặp `alpha/alpha-2` + `beta/beta-2`, 4 route KHÁC nhau và đều có trong catalog đang chạy | đọc tệp sau boot A1 + so `cordis.patch.yml` của profile |
| C2 | `erp-route-migrate --apply` trên BẢN COPY: EXIT 0, in bảng cặp, `alpha-2.routeOverride` đủ 6 trường (`provider, model, reasoningEffort, source='profile', at, by`) và bằng route khai báo của `alpha` | chạy CLI thật, đọc lại tệp |
| C3 | Phiên con THẬT của `alpha-2` sau di trú gửi `request/header` bằng ĐÚNG route đã di trú (route của `alpha`), khác route khai báo của chính nó | transcript `$DSH_HOME/sessions/<slug>/<childId>/*.zstd` |
| C4 | Đối chứng ÂM: trước di trú, phiên con của cùng member dùng route KHAI BÁO của nó (`…v4.1-flash`) | transcript phiên con ở ws-a |
| C5 | Tệp ERP thật chỉ được ĐỌC: sha256 + size + mtime trước == sau | `E:/Project/ERP/.agent-teams/erp-erp/team.json` |
| C6 | Tài liệu này có bảng C1..C6, artifact dir, số boot thật và giới hạn | chính tệp này, ≤ 80 dòng |

## Ngân sách boot
Mỗi lần chạy đầy đủ = **3 phiên thật** (A1 tạo đội + đối chứng âm; B1 tạo đội thứ hai; B2 resume
phiên captain của B1 sau di trú). Trần của task là 6 phiên ⇒ đã dùng **6/6** (lần 1 FAIL + lần 2 PASS);
`--analyze` tốn 0 phiên.

## Artifact
`tests/tmp/e2e-t82/run-<stamp>/`: `meta.json`, `teamA.json`, `teamB-before.json`, `teamB-after-migrate.json`,
`teamB-after-b2.json`, `migrate-stdout.txt`, `childA-headers.json`, `childB-headers.json`, `erp-before.json`,
`erp-after.json`, `checks.json`, `session*.stdout.txt`.

## Kết quả — lần chạy thật 2 (sau bản vá), `run-2026-10-31T21-25-33-603Z`, 3 boot, EXIT 0
| Mã | Kết quả | Bằng chứng thô |
| --- | --- | --- |
| C1 | PASS | `<ws-a>/.agent-teams/e2e-t82/team.json`, 4 route khác nhau, đủ trong catalog; `alpha`/`beta` = `removed` |
| C2 | PASS | migrate EXIT 0: `alpha-2.routeOverride = command-code-goat/deepseek/deepseek-v4-pro (high)`, `source="profile"`, `by="t82"`, `at=1793481963794`; bảng cặp in `alpha → alpha-2 … v4.1-flash (high) → v4-pro (high)` |
| C3 | **PASS** | phiên con `cab3814f-13c6-4747-b6c1-3983eec17204` gửi `request/header = command-code-goat/deepseek/deepseek-v4-pro` = route ĐÃ DI TRÚ (khai báo của nó là `…v4.1-flash`) |
| C4 | PASS | phiên con trước di trú `02031032-94d3-48ac-8119-e00b5d017e15` dùng `command-code-goat/deepseek/deepseek-v4.1-flash` = route khai báo, khác route di trú |
| C5 | PASS | ERP `sha256`/`size`/`mtime` trước == sau = `9f7420b6…e15f2d1e` / 1 533 117 B |
| C6 | PASS | chính tệp này (bảng, artifact dir, số boot, giới hạn) |

`verdict PASS — proved C1,C2,C3,C4,C5,C6 — unproved (none)`, `EXIT 0`; `--analyze` trên cùng artifact cho
đúng verdict đó, `EXIT 0`.

## Nguyên nhân C3 từng FAIL và bản vá (lần chạy 1, `run-2026-10-31T21-12-51-903Z`)
- Đường **scheduler** `dispatchMember` (`lib/tools.js:546`) dựng selection từ **spine**
  `member.provider/model/reasoningEffort`, KHÔNG qua `selectionFromMember(member)`/`routeOf()`
  (`lib/members.js:437-468`, nơi override thắng declared); spawn xong `lib/members.js:1054-1060` escalate
  chính selection đó và xoá `routeOverride` ⇒ override mất mà chưa từng có hiệu lực (lần 1: phiên con
  `84d85f22-…` chạy `…v4.1-flash`).
- Nay `lib/tools.js:546` dùng `membersApi.selectionFromMember(member)` trước khi rơi về spine ⇒ spawn đi
  đúng route `routeOf()` phân giải (fallback > override > active > declared); routeOverride vẫn bị escalate
  vào `provider/model` sau spawn (giữ descriptor và record khớp nhau cho cold-resume guard) nên lần đọc
  `teamB-after-b2.json` không còn `routeOverride` — điều đó là THIẾT KẾ, không phải mất route.

## Giới hạn
- Fixture là đội tự tạo trong `tests/tmp`, KHÔNG phải đội ERP thật: chỉ `team.json` ERP thật được đọc
  để chứng minh C5; dữ liệu ERP thật không bao giờ được ghi.
- Không chứng minh nhánh provider chết / fallback: cả 4 route đều sống trong profile nháp.
- Chỉ một cặp được chạy tới phiên con (`alpha-2`); `beta-2` chỉ được kiểm ở mức tệp.
- Kết luận đúng cho route do công cụ di trú ghi (source `profile`); `set_member_route` (source
  `captain`) đã được chứng minh riêng ở t18/t45/t59.
