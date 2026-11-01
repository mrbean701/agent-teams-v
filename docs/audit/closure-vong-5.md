# Audit closure vòng 5 (t42) — route revert, fallback per-member, UI, pack

- **Auditor**: audit-goat (độc lập, không viết mã plugin). Attempt `cd3fe99e-27df-4974-8848-4da8384d96bf`.
- **Thời điểm**: 2026-10-31T18:44–18:52Z. Trần đã dùng: **22/40 lệnh**, lần thử **1/3**. Log thô: `tests/tmp/audit-v5/*.log`.
- **Phạm vi chấm**: **MÃ NGUỒN** `packages/dsh-agent-teams` + toàn bộ suite `tests/`.
- **VERDICT: ĐẠT — cho MÃ NGUỒN.** **Tarball t41 KHÔNG dùng để phát hành** (lệch nguồn, §4).

## 1. Mã tại lúc chấm (sha256 tự đo)

| tệp | sha256 (rút) | byte | | tệp | sha256 (rút) | byte |
|---|---|---|---|---|---|---|
| lib/members.js | `8e4f7b39f20b…` | 96 140 | | lib/client.js | `f8601251…` | 198 572 |
| lib/state.js | `7b49f5ab1d46…` | 56 282 | | lib/client.js.map | `a0241ae8…` | 335 890 |
| lib/snapshot.js | `92ecdd87…` | 11 687 | | package.json | `92a64040…` | 10 498 |
| | | | | **lib/tools.js** | **`de6a012431bf…`** | **193 704** |

`lib/tools.js` đổi **hai lần trong lúc audit**: `de6a012431bf`/193 704 (mtime 18:42:26Z, sau khi t41 pack 18:39:14Z) là bản tôi **chạy toàn bộ suite**; lúc 18:48:19Z nó thành `a01b1a1018cb`/194 888 (writer vẫn ghi). Verdict chấm đúng bộ byte `de6a012431bf`; 6 tệp còn lại **không đổi suốt phiên**. Tarball phải pack lại (t52) và chấm lại (t53) trên cây đã đứng yên.

## 2. C1 + C4 — toàn bộ suite, tôi tự chạy (exit code thật; log `tests/tmp/audit-v5/<suite>.log`)

| exit 0 | bằng chứng máy (nguyên văn tail log) |
|---|---|
| t3-route-smoke | `18/18` |
| t4-control-plane-smoke | `22/22 cases passed` |
| t10-ui-bundle-smoke | `TOTAL 40 checks, 40 passed, 0 failed` (lớn từ 25) |
| t11-http-e2e `--analyze` | `PASS — proved C1..C8 (11 checks, 0 failed)` |
| t15-activate-member | `21/21 passed` |
| t18-hot-switch `--analyze` | `proved C1..C9; unproved none` |
| t20-erp-compat | scratch `tests/tmp/t20-erp-compat` |
| t21-add-member `--analyze` | `proved A1..A7; unproved none` |
| t24-auth-fence | 12 PASS / 0 FAIL (§6) |
| t27-rollback `--analyze` | `PASS — 16/16 check` |
| t28-provider-failure | `20/20 passed` |
| t29-pack-install `--analyze` | `proved C1..C5` (chấm tarball CŨ ac84c73a) |
| t30-status-last-failure | `TOTAL 8 checks, 8 passed` |
| t35-pack-repack `--analyze` | `7/7 checks passed` |
| t37-route-clear | `14/14 passed` |
| t38-member-fallback | `17/17 passed` (lớn từ 14) |
| t39-plan-clear-http | 11 PASS / 0 FAIL |
| t40-erp-proposal | `TOTAL 20 checks, 20 passed` |
| t42-pack-v5 `--analyze` | `9/9 checks passed` (snapshot 18:39, đã cũ) |
| t43-member-profile | `19/19 passed` |
| t44-types-clear | `11/11 passed` |
| t45-clear-live-e2e `--analyze` | `proved C1..C7` (dir `e2e-t45clear/2026-10-31T18-35-47`) |
| t46-plan-fallback-http | 15 PASS / 0 FAIL |
| t48-tool-names | `6/6 passed` |
| t49-profile-http-dto | 16 PASS / 0 FAIL |

Trung thực: `tests/t47-*.mjs` **không tồn tại** (brief captain nhắc) — bộ thật là t43/t44/t45/t46/t48/t49. Lần `--analyze` t21 đầu của tôi **exit 1** vì tôi truyền thư mục rỗng (`no session output`), không phải suite hỏng; chạy lại đúng dir ⇒ PASS.

## 3. C2 — mutation test do chính tôi làm (chứng minh suite không PASS giả)

| # | đột biến | sha trước → đột biến | kết quả | khôi phục |
|---|---|---|---|---|
| A | `lib/members.js:1256` `const clearing = request.clear === true;` → `= false` | `8e4f7b39…44f3` → `e4d441aa…a675` | **t37 EXIT=1**, 20 FAIL (stack `tests/t37-route-clear.mjs:344`) | `cp` từ `members.js.orig` ⇒ sha **trùng**; t37 `14/14` exit 0 |
| B | `lib/state.js:648` `function isMemberFallback(value) {` → chèn `return true;` | `7b49f5ab…69fd` → (đã khôi phục) | **t38 EXIT=1** `16/17`, `not ok 15 - d3 a malformed fallback is rejected at the durable boundary`, `AssertionError: Missing expected rejection` tại `tests/t38-member-fallback.mjs:332` | `cp` từ `state.js.orig` ⇒ sha **trùng**; t38 `17/17` exit 0 |

Backup `.orig` có sha **bằng** bản gốc trước khi sửa ⇒ không thể "khôi phục bằng bản đã sửa". Hai cơ chế mới (clear guard + validator ranh giới đĩa) đều có test phân biệt thật.

## 4. C3 — tarball: đo độc lập, không tin bảng người đóng gói

- `packages/dsh-agent-teams/tests/tmp/t42/nami-dsh-agent-teams-0.2.0-dev.0.tgz`: sha256 `1fe4fc5f3f1b…aa2f`, **2 206 957 B**, **133 entry** (`tar -tzf`, cắt CRLF).
- Bắt buộc **6/6** có: `package/lib/{tools,members,client}.js`, `client.js.map`, `tool-names.js`, `package/cordis.patch.yml`. Cấm: `node_modules` 0 · `package/tests` 0 · `.tgz` lồng 0 · `.pid` 0.
- Giải nén (`tests/tmp/audit-v5/extract`), hash payload vs **nguồn hiện tại**: **6/7 SAME**, lệch đúng `lib/tools.js` payload `651ce617003b`/193 189 vs nguồn `de6a012431bf`/193 704.
- ⇒ **tarball t41/t42 KHÔNG dùng để phát hành.** Repack `cd packages/dsh-agent-teams && node build/build.mjs && npm pack` sau khi writer dừng — thuộc **t52**; chấm 3 chiều thuộc **t53**. `--analyze` `9/9` chỉ chứng minh byte 18:39 khớp nguồn 18:39.

## 5. C5 — hồ sơ

- `node tools/check-doc-paths.mjs --summary` ⇒ EXIT 0: `files=5 paths=51 paths_missing=0 links=41 links_missing=0`.
- `node tools/dependency-report.mjs` ⇒ EXIT 0: `tasks=53 realEdges=65 derivedEdges=57 waves=26 problems=0`.
- `docs/TODO.md` = **53 hàng / 53 id duy nhất**; cột trạng thái VERIFIED 47 · CANCELLED 1 · **OPEN 5**. Ledger `team.json`: completed 48 · **in_progress 3** (t42,t50,t51) · **pending 2** (t52,t53).
- ⇒ **F1**: `docs/TODO.md:4` ghi `IN_PROGRESS=3 · OPEN=2` nhưng bảng đánh **5 hàng OPEN** — bảng gộp pending vào OPEN; header khớp ledger, cột thì không.

## 6. C6 — bảo mật `/plan` (tự chạy `tests/t24-auth-fence.mjs`, exit 0, 12 PASS)

C1/C1b GET+DELETE → `405` (`allow="POST"`, body rỗng) · C2 body 1 000 096 B → `413 {"error":"request body is too large"}` · C2b body 900 049 B dưới trần vào handler (`400` lỗi trường) · C3 session lạ → `409 {"error":"captain session is not attached"}` · C4 fence hỏi đúng 1 lần/request (5/5) · C5 → `401 {"error":"unauthorized"}` · C6 fence chạy TRƯỚC kiểm method (GET bị chặn → 401, không 405) · C7 route đọc `/state` cũng 401 · C9 → `403 {"error":"forbidden"}`.

Mã: mọi route qua `lib/index.js:186` `authenticatedWebRoutes(rawWebServer, () => ctx.get('connection'))`; handler lấy captain từ `ctx.agents.get(sessionId)` (`:297`), kiểm đội thuộc captain (`:308`), `teamId` không đi vào đường dẫn tệp. Action mới tự kiểm tham số: `clear_member_route` từ chối kèm `provider/model/reasoningEffort` (`lib/index.js:402`); `set_member_fallback` từ chối trộn set/clear (`:436`) và đòi cả hai nửa route (`:438-440`); cả hai qua `agentTeamsRuntime` (`withTeamLock`), không nhánh nào ghi đĩa trực tiếp từ HTTP.

## 7. Quét PASS giả toàn bộ `tests/*.mjs` (25 tệp)

- `.skip(`: **0**. `catch {}`/`catch (e) {}` rỗng: **0**.
- `process.exit(0)`: **1** — `tests/t42-pack-v5.mjs:302`, trong **script con sinh ra** để probe `import()` (0 = nạp được, 42 = SyntaxError, 3 = lỗi khác). Là tín hiệu phép thử, không phải "thoát 0 lấy PASS", nhưng chỉ chứng minh byte nạp được, không chứng minh export ⇒ **F3**.
- Không suite nào tự viết mock rồi tự chấm PASS: E2E đều spawn phiên thật (t11/t18/t21/t27/t45); `--analyze` chỉ chấm lại artifact đã ghi (`tests/t35-pack-repack.mjs:273-277`).

## 8. Phát hiện còn lại (không blocker/high/medium)

| id | mức | nội dung | dẫn chứng | tái hiện |
|---|---|---|---|---|
| F1 | low (hồ sơ) | Header TODO đếm IN_PROGRESS=3/OPEN=2, cột đánh 5 hàng OPEN | `docs/TODO.md:4` vs 5 hàng `| t42/t50/t51/t52/t53 | OPEN` | `grep -cE "^\\| t[0-9]+ \\| OPEN" docs/TODO.md` → 5 |
| F2 | low (đóng gói+drift) | tarball t41 lệch nguồn ở `lib/tools.js` (`651ce617003b`/193 189 vs `de6a012431bf`/193 704); **nguồn còn đổi tiếp** thành `a01b1a1018cb`/194 888 lúc 18:48:19Z ⇒ t53 phải chạy lại suite trên cây đứng yên | §4; pack 18:39:14Z < 18:42:26Z < 18:48:19Z | `tar -xzf …` rồi hash 2 tệp |
| F3 | low (test hygiene) | probe `import()` chỉ phân biệt SyntaxError vs lỗi khác, không assert export | `tests/t42-pack-v5.mjs:302` | đọc dòng đó |
| F4 | info (host) | event `agent-teams/*` vẫn bị host bỏ (`lib/events.js:33-40` gate `KNOWN_SESSION_EVENT_TYPES`); dấu vết thật = `team.json routeOverride` + `docs/log/MODEL-SWITCH.md` | không đổi từ vòng 4 | — |

## 9. Điều kiện phát hành (chủ sở hữu)

1. **t52** — chờ writer dừng, `node build/build.mjs` + `npm pack`, ghi hash 3 chiều **trong cùng một lệnh** (chống drift).
2. **t53** — audit tarball cuối: 133 entry, 6/6 bắt buộc, 0 cấm, payload ↔ nguồn 7/7 SAME, rebuild byte-no-op.
3. **F1** — người giữ `docs/TODO.md` sửa một vế (header hoặc cột) cho khớp ledger. **Không** dùng tarball `1fe4fc5f…` để phát hành; **không** publish/commit trong phạm vi audit này.

## 10. Kết luận & lệnh tái lập

**MÃ NGUỒN: ĐẠT** — 25/25 suite tự chạy exit 0 (7 phép `--analyze` chấm artifact thật), 2 mutation tự làm đều bị bắt và khôi phục về sha gốc, `/plan` kín ở cả 5 mã lỗi, hồ sơ 0 link gãy / 0 problem. **TARBALL t41: KHÔNG ĐẠT để phát hành** — lệch nguồn `lib/tools.js`; phát hành thuộc t52 + t53.
```
node tests/t37-route-clear.mjs; node tests/t38-member-fallback.mjs; node tests/t24-auth-fence.mjs
node tests/t21-add-member-e2e.mjs --analyze tests/tmp/e2e-addmember/2026-10-31T17-10-25
node tests/t45-clear-live-e2e.mjs --analyze tests/tmp/e2e-t45clear/2026-10-31T18-35-47
node tools/check-doc-paths.mjs --summary && node tools/dependency-report.mjs
```

