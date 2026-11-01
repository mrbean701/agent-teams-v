# Xac nhan dong findings audit vong 1 — task t19

Nguoi kiem: audit-kimi (doc lap, khong tin captain).  
Thoi gian: 2026-10-31T14:52:38.426Z.

## Muc tieu

Kiem doc lap rang 3 findings ghi trong `docs/audit/vong-1.md` da duoc dong that, khong chi tuyen bo.

## Tom tat ket luan

**PASS** — ca 3 findings deu da dong bang ma + test that.

| Finding | Muc do | Trang thai | Bang chung chinh |
|---|---|---|---|
| F1 — `routeOverride.by` thieu provenance cho tool va HTTP | medium | **Da dong** | `lib/tools.js:1271 by: captain.session.id`; `lib/index.js:382 by: 'web:' + sessionId`; `lib/members.js:1134` ghi `by`; `appendRouteChangeAudit` (`:1048`) ghi `source:by`. Mutation test: xoa dong `by` -> H1 FAIL, khoi phuc -> PASS, sha256 khop. |
| F2 — Test F2 ten/Assertion sai | low | **Da dong** | `tests/t4-control-plane-smoke.mjs:363-383` ten test va assertion khop mo ta “attempts an immediate start ... keeps the row when the start fails”, kiem `spawnError` khop `/activateMemberNow/` va `/does not support continuable members/`. Mutation test voi provider co `prepareContinuable` lam test FAIL khi hook thanh cong (khong con loi start). |
| F3 — `update_member` ghi truc tiep `provider`/`model` (rui ro pre-existing) | low | **Da dong** | `docs/van-hanh/khuyen-nghi-update-member.md` mo ta dung ma; `lib/index.js:393-398` comment chi dan dung `set_member_route` cho member da spawn; `lib/tools.js:573-574` chan mutation khac `update_task` tren team running; `:579-580` chan member da spawn. `docs/log/MODEL-SWITCH.md` chi con header bang, van xuoi chuyen sang `docs/log/MODEL-SWITCH-notes.md`, quy tac file may doc ghi trong `docs/quy-tac-du-an.md`. |

## Phuong phap kiem chung

1. Doc truc tiep cac file duoc chi dinh.  
2. Chay mutation test cho F1 (xoa dong `by` trong `lib/tools.js`, chay `tests/t4-control-plane-smoke.mjs`, khoi phuc file, doi chieu sha256).  
3. Chay mutation test cho F2 (sao chep test sang `tests/tmp/t4-f2-hook-mutation.mjs`, them `prepareContinuable` vao stub provider de start thanh cong, chay, kiem chung F2 FAIL khi hook khong con ghi loi).  
4. Doi chieu tai lieu van hanh voi ma nguon va kiem tra sap xep file log.

## Chi tiet bang chung

### F1 — provenance `by`

Vi tri ma (doc truc tiep):

- `lib/tools.js:1269-1273`:
  ```js
  // Provenance: the audit log records 'captain:<session>', so an independent
  // audit can name the session that ordered the change (design v1 §4.1 step 7).
  by: captain.session.id,
  source: 'captain',
  ```

- `lib/index.js:380-383`:
  ```js
  // Provenance: the audit log records 'http:web:<session>', naming the
  // browser session behind the request instead of a bare 'http'.
  by: 'web:' + sessionId,
  source: 'http',
  ```

- `lib/members.js:1128-1135` ghi `routeOverride` kem `by`:
  ```js
  member.routeOverride = {
      provider: selection.provider,
      model: selection.model,
      ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort },
      source,
      at,
      ...request.by === undefined ? {} : { by: request.by },
  };
  ```

- `lib/members.js:1048` format audit source:
  ```js
  const source = record.by === undefined ? record.source : `${record.source}:${record.by}`;
  ```

**Mutation test F1:**

```bash
cd E:/Project/Agent-Team
# sha256 goc cua lib/tools.js
node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('packages/dsh-agent-teams/lib/tools.js','utf8'),'utf8').digest('hex'))"
# -> f1e06dea1738e822227fabf200231f6cff000227900279bf57917b7a6b21c61b

# (xoa dong "by: captain.session.id," tai tools.js:1271)
node tests/t4-control-plane-smoke.mjs
# -> exit 1, FAIL H1 ... routeOverride.by undefined

# (khoi phuc dong by)
node -e "..."
# -> f1e06dea1738e822227fabf200231f6cff000227900279bf57917b7a6b21c61b

node tests/t4-control-plane-smoke.mjs
# -> exit 0, 22/22 passed
```

Ket qua thuc te:

- Goc sha256: `f1e06dea1738e822227fabf200231f6cff000227900279bf57917b7a6b21c61b`.
- Sau khi xoa `by`: `4c24f8c8a51e8025c1fb6bc0188470262fd7d387a7f38216a06ecd53e6c05048`; test H1 FAIL voi `AssertionError: the durable override names the captain session` (`actual: undefined, expected: 'sess-captain'`).
- Sau khi khoi phuc: sha256 quay lai `f1e06dea1738e822227fabf200231f6cff000227900279bf57917b7a6b21c61b`; `node tests/t4-control-plane-smoke.mjs` tra 22/22 PASS.

=> F1 da dong that.

### F2 — Test F2

Vi tri test (`tests/t4-control-plane-smoke.mjs:363-383`):

```js
test('F2 the add_member tool attempts an immediate start on a running team and keeps the row when the start fails', async () => {
    ...
    assert.equal(out.phase, 'running');
    assert.equal(out.spawned, false, 'this fake provider cannot host a child, so the start fails');
    assert.equal(out.member_id, '', 'a failed start leaves no child id behind');
    const erin = (await teamOf(workspace, 'team-f2')).members.find((m) => m.name === 'erin');
    assert.ok(erin !== undefined, 'the roster row stays visible on the team that recorded the add');
    // The point of this case is the ATTEMPT. The stub provider in makeHarness has no
    // prepareContinuable, so activateMemberNow is reached and fails inside spawnMember;
    // the recorded stack is the proof. If addMemberNow ever stops calling the activation
    // hook (the audit round 1 complaint about this test), both assertions below fail.
    assert.equal(typeof erin.spawnError, 'string', 'the failed start is recorded on the member');
    assert.match(erin.spawnError, /activateMemberNow/, 'the activation hook was actually reached');
    assert.match(erin.spawnError, /does not support continuable members/, 'the failure reason is the provider capability, not a silent no-op');
    ...
});
```

Ten test va assertion gio khop: test kiem rang `add_member` **co gang** start ngay lap tuc tren team running va giu lai hang roster khi start that bai.

**Mutation test F2:**

Sao chep test sang `tests/tmp/t4-f2-hook-mutation.mjs` (sha256 `a68a778e2a8318ac405559b2d33a050222a0f053d6e11a1d9432a3f4458d92ed`), dieu chinh `LIB` path vi file nam sau hon mot cap, sua stub `startActivation` tra ve thanh cong, va them `prepareContinuable` vao stub provider:

```js
getProvider() { return { id: 'spawn', defaultModel: 'm1', prepareContinuable: () => ({}) }; },
startActivation(spec) {
    lastActivation = spec;
    return Promise.resolve({ childId: 'child-mutated', result: Promise.resolve({ text: 'ok' }) });
},
```

Chay:

```bash
node tests/tmp/t4-f2-hook-mutation.mjs
# -> exit 1
# FAIL F2 the add_member tool attempts an immediate start on a running team and keeps the row when the start fails
#      AssertionError [ERR_ASSERTION]: the activation hook was actually reached
```

21/22 PASS, chi F2 FAIL. Dieu nay chung minh F2 se FAIL neu hook ngung duoc goi / tra ve thanh cong (khong con loi ghi nhan). File goc `tests/t4-control-plane-smoke.mjs` khong bi sua (sha256 `47513937db7f40a9251ab0da7ea1ae7092322b16d9d8dc7d94d4b67fdb03b88d`).

=> F2 da dong that.

### F3 — `update_member` va phan chia file log

Tai lieu `docs/van-hanh/khuyen-nghi-update-member.md` ton tai va khop ma:

- Ket luan mot dong (dong 8): `update_member` chi dung khi member chua spawn; member dang chay phai dung `agent_teams_set_member_route`.
- Bang tinh huong (dong 23-29) trich dan dung `lib/tools.js:573-574` va `:579-580`.

Kiem tra ma:

- `lib/tools.js:573-574`:
  ```js
  if (!staged && mutations.some(mutation => mutation.action !== 'update_task')) {
      throw new Error('a running team only permits update_task edits to pending, never-started tasks; roster and removal edits require a staged plan');
  }
  ```

- `lib/tools.js:579-580`:
  ```js
  if (member.id !== '')
      throw new Error(`staged member "${member.name}" was already spawned`);
  ```

- `lib/index.js:393-398` comment:
  ```js
  // Inherited 0.1.28 path (audit round 1, finding 3): this action writes
  // provider/model straight onto the roster row through the staged-plan
  // batch, so it is meant for a roster that has not started yet. Once a
  // member owns a child session, change its route with
  // 'set_member_route' instead — that path keeps the descriptor guard
  // (lib/members.js) consistent on the next cold resume.
  ```

Kiem tra file log:

- `docs/log/MODEL-SWITCH.md` (doc truc tiep): chi chua header bang, 10 dong, khong co van xuoi.
- `docs/log/MODEL-SWITCH-notes.md`: chua toan bo ghi chu van xuoi.
- `docs/quy-tac-du-an.md` dong 61-64 quy dinh: `docs/log/MODEL-SWITCH.md` la file may doc do plugin ghi; ghi chu, ca kiem, giai thich => `docs/log/MODEL-SWITCH-notes.md`.

=> F3 da dong that.

## Cac lenh da chay

| # | Lenh | Ket qua |
|---|---|---|
| 1 | `node tests/t4-control-plane-smoke.mjs` (tren ma goc) | exit 0, 22/22 PASS |
| 2 | Xoa `by: captain.session.id` trong `lib/tools.js`, chay lai t4 | exit 1, H1 FAIL |
| 3 | Khoi phuc `lib/tools.js`, sha256 kiem chung | sha256 khop `f1e06dea...c61b` |
| 4 | `node tests/tmp/t4-f2-hook-mutation.mjs` (provider co `prepareContinuable`) | exit 1, F2 FAIL |
| 5 | Doc `docs/van-hanh/khuyen-nghi-update-member.md`, `docs/log/MODEL-SWITCH.md`, `docs/log/MODEL-SWITCH-notes.md`, `docs/quy-tac-du-an.md` | khop thuc te ma |

## Ket luan

**Verdict: PASS** — ca 3 findings trong `docs/audit/vong-1.md` deu da duoc dong that bang ma nguon va test; khong co dau hieu fake-success hay skip.

audit-kimi  
attempt_id: 75714f1f-5527-415a-87aa-908291a3ed07
