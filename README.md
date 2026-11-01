# agent-teams-v — plugin Agent Teams cho DSH (bản fork đang hoàn thiện)

Repo này chứa bản viết lại plugin **Agent Teams** (`@nami/dsh-agent-teams`) dùng cho DSH Harness, chạy thật trên dữ liệu `team.json` của ERP.

## Trạng thái phát hành

Bộ byte đã được audit độc lập và **đã chứng minh cài từ tarball rồi chạy** trên hai profile sạch:

- Tệp: `dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz`
- sha256: `2770fbfc4070eb80cbe419134f1c44ffed8e9c6e4d9703d0d775b4af3cc6251e`
- Kích thước: 2 248 092 B · 133 entry

```bash
npm i --offline --legacy-peer-deps <đường-dẫn-tới>/dist/vong-19/nami-dsh-agent-teams-0.2.0-dev.0.tgz
```

Kiểm sha trước khi cài. Verdict audit gắn với đúng bộ byte này tại đường dẫn này — pack lại hoặc di chuyển là verdict hết hiệu lực.

## Nội dung

| Thư mục | Nội dung |
|---|---|
| `packages/dsh-agent-teams/` | mã plugin: `lib/tools.js`, `lib/members.js`, `lib/state.js`, `lib/client.js` (UI), `lib/types/*.d.ts` |
| `tests/` | 66 suite kiểm chứng (cổng render parity, cổng đóng băng nguồn, suite live trên bản copy ERP, cổng kiểm hợp đồng task) |
| `tools/` | `check-contract.mjs`, `sweep-suites.mjs`, `dependency-report.mjs`, `telegram-report.mjs`, `check-logs.mjs`, `check-doc-paths.mjs` |
| `docs/` | báo cáo chính, audit từng vòng, 7 nhóm log, kỷ yếu Telegram |
| `dist/` | tarball phát hành đã audit |

## Điểm vào để đọc

1. `docs/bao-cao-agent-teams.md` — báo cáo tổng: bộ byte phát hành, bằng chứng, findings, điều kiện hết hiệu lực.
2. `docs/audit/closure-bytes-phat-hanh.md` — audit độc lập bộ byte phát hành (verdict + 3 phép phá cổng).
3. `docs/TODO.md` — 127 task của quá trình dogfood 19 vòng, gồm số đo từng task.
4. `docs/log/BUG.md` — 4 lỗi thật đã bắt và vá: BUG-024 (payload đúng nhưng text bỏ sót trường), BUG-026 (một trường lạ trong `team.json` ERP làm cả 16 tool chết), BUG-027 (payload làm rơi hồ sơ member đã xoá), BUG-028 (nguồn bị ghi trong lúc suite chạy).

## Cổng kiểm chạy được ngay

```bash
node tools/check-contract.mjs --state .agent-teams/nami-agent-teams --task t127
node tests/t98-render-coverage.mjs --strict
node tests/t113-roster-assertion.mjs
node tools/sweep-suites.mjs --list
```

## Giới hạn đã biết

- `render` của `agent_teams_status` **không byte-exact** giữa hai phiên trên cùng dữ liệu (lệch 8 ký tự ở blob `supplemental_evidence` của task `t4`, `lib/tools.js:3380`) — đừng ghim golden theo toàn văn render.
- `--analyze` của `tests/t126-released-bytes-boot.mjs` chấm trạng thái sống, không đọc `artifact.json` (finding VB-F3, chưa vá).
- Version giữ `0.2.0-dev.0`; chưa publish lên registry.
