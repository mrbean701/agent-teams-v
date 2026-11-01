# Kiểm tra đường dẫn tài liệu (sinh tự động)

Sinh bằng: node tools/check-doc-paths.mjs --write (4 tệp tài liệu).
Cột exists cho biết đường dẫn có thật ở gốc repo (root) hay trong packages/dsh-agent-teams.

~~~
path | exists
build/build.mjs | yes (packages/dsh-agent-teams)
build/test-load.html | yes (packages/dsh-agent-teams)
docs/DEPENDENCIES.md | yes (root)
docs/MASTER-PROMPT.md | yes (root)
docs/TODO.md | yes (root)
docs/audit/probe-q1.mjs | yes (root)
docs/audit/vong-1.md | yes (root)
docs/audit/vong-2.md | yes (root)
docs/bao-cao-agent-teams.md | yes (root)
docs/bao-cao-telegram.md | yes (root)
docs/ke-hoach-staged.md | yes (root)
docs/log/MODEL-SWITCH.md | yes (root)
docs/mau-bao-cao-telegram.md | yes (root)
docs/nghien-cuu/hop-dong-host.md | yes (root)
docs/provenance-tasks.json | yes (root)
docs/quy-tac-du-an.md | yes (root)
docs/thiet-ke/thiet-ke-v1.md | yes (root)
docs/van-hanh/*.md | yes (root)
docs/van-hanh/README.md | yes (root)
docs/van-hanh/di-migrate-va-rollback.md | yes (root)
docs/van-hanh/khuyen-nghi-update-member.md | yes (root)
lib/*.js | yes (packages/dsh-agent-teams)
lib/client.js | yes (packages/dsh-agent-teams)
lib/events.js | yes (packages/dsh-agent-teams)
lib/index.js | yes (packages/dsh-agent-teams)
lib/members.js | yes (packages/dsh-agent-teams)
lib/state.js | yes (packages/dsh-agent-teams)
lib/tool-names.js | yes (packages/dsh-agent-teams)
lib/tool-policies.js | yes (packages/dsh-agent-teams)
lib/tools.js | yes (packages/dsh-agent-teams)
lib/web-routes.js | yes (packages/dsh-agent-teams)
tests/*.mjs | yes (root)
tests/t10-ui-bundle-smoke.mjs | yes (root)
tests/t11-http-e2e.mjs | yes (root)
tests/t15-activate-member.mjs | yes (root)
tests/t18-hot-switch-e2e.mjs | yes (root)
tests/t20-erp-compat.mjs | yes (root)
tests/t21-add-member-e2e.mjs | yes (root)
tests/t24-auth-fence.mjs | yes (root)
tests/t27-rollback.mjs | yes (root)
tests/t3-route-smoke.mjs | yes (root)
tests/t4-control-plane-smoke.mjs | yes (root)
tools/check-doc-paths.mjs | yes (root)
tools/dependency-report.mjs | yes (root)
tools/telegram-report.mjs | yes (root)
tools/test/smoke-team.mjs | yes (root)
tools/test/test-env.mjs | yes (root)

link | exists
docs/bao-cao-agent-teams.md -> TODO.md | yes
docs/bao-cao-agent-teams.md -> audit/vong-2.md | yes
docs/bao-cao-agent-teams.md -> thiet-ke/thiet-ke-v1.md | yes
docs/bao-cao-agent-teams.md -> van-hanh/README.md | yes
docs/bao-cao-agent-teams.md -> van-hanh/di-migrate-va-rollback.md | yes
docs/bao-cao-agent-teams.md -> van-hanh/khuyen-nghi-update-member.md | yes
docs/bao-cao-agent-teams.md -> van-hanh/kiem-tra-duong-dan.md | yes
docs/van-hanh/README.md -> ../../.agent-teams/nami-agent-teams/team.json | yes
docs/van-hanh/README.md -> ../DEPENDENCIES.md | yes
docs/van-hanh/README.md -> ../MASTER-PROMPT.md | yes
docs/van-hanh/README.md -> ../TODO.md | yes
docs/van-hanh/README.md -> ../audit/dong-finding-vong-1.md | yes
docs/van-hanh/README.md -> ../audit/probe-erp.mjs | yes
docs/van-hanh/README.md -> ../audit/probe-q1.mjs | yes
docs/van-hanh/README.md -> ../audit/vong-1.md | yes
docs/van-hanh/README.md -> ../audit/vong-2.md | yes
docs/van-hanh/README.md -> ../bao-cao-telegram.md | yes
docs/van-hanh/README.md -> ../bao-cao-telegram/ | yes
docs/van-hanh/README.md -> ../ke-hoach-staged.md | yes
docs/van-hanh/README.md -> ../kiem-thu/add-member-e2e.md | yes
docs/van-hanh/README.md -> ../kiem-thu/hot-switch-e2e.md | yes
docs/van-hanh/README.md -> ../kiem-thu/moi-truong.md | yes
docs/van-hanh/README.md -> ../kiem-thu/t10-ui.md | yes
docs/van-hanh/README.md -> ../kiem-thu/t11-http-e2e.md | yes
docs/van-hanh/README.md -> ../kiem-thu/t22-build-bundle.md | yes
docs/van-hanh/README.md -> ../kiem-thu/t9-bundle-kha-thi.md | yes
docs/van-hanh/README.md -> ../kiem-thu/tuong-thich-erp.md | yes
docs/van-hanh/README.md -> ../log/ | yes
docs/van-hanh/README.md -> ../mau-bao-cao-telegram.md | yes
docs/van-hanh/README.md -> ../nghien-cuu/hop-dong-host.md | yes
docs/van-hanh/README.md -> ../provenance-tasks.json | yes
docs/van-hanh/README.md -> ../quy-tac-du-an.md | yes
docs/van-hanh/README.md -> ../thiet-ke/thiet-ke-v1.md | yes
docs/van-hanh/README.md -> README.md | yes
docs/van-hanh/README.md -> di-migrate-va-rollback.md | yes
docs/van-hanh/README.md -> khuyen-nghi-update-member.md | yes
docs/van-hanh/di-migrate-va-rollback.md -> ../kiem-thu/moi-truong.md | yes
docs/van-hanh/di-migrate-va-rollback.md -> ../kiem-thu/t27-rollback.md | yes
docs/van-hanh/di-migrate-va-rollback.md -> ../kiem-thu/tuong-thich-erp.md | yes
docs/van-hanh/di-migrate-va-rollback.md -> ../log/BUG.md | yes

files=4 paths=47 paths_missing=0 links=40 links_missing=0
~~~
