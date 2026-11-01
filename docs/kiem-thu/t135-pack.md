# t135 - pack vong 21 (sau t134: sourcemap sinh lai dung cot)

Card: t135 (implementation). Runner: packages/dsh-agent-teams/tests/t135-pack.mjs (74 619 B, 1132 dong).
Bat dau 2026-11-01T04:32:56.065Z (FROZEN_MEASURED_AT). Khong dung lai bang cua t118/t121/t130-pack.

## 1. Artefact phat hanh

- Duong dan: `packages/dsh-agent-teams/tests/tmp/t135/run-t135-b/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz`
- sha256 `6db464d19428d9f9993a175b36062f9ece95065a68b3477bc660370bb9f2a0c4`
- bytes `2248091` · entries `133` · entry thu muc `0`
- pack-b do mot TIEN TRINH CON rieng sinh ra (`--pack-once`), cung sha256 + bytes + entries.
- run-t135-a (ban chay truoc khi va cosmetic `describePack`) cho cung sha256 6db464d1... — tinh tat dinh qua 2 lan chay doc lap.

## 2. Bang FROZEN 13 tep (do lai tai HEAD, drift 0 o 3 moc)

| tep | sha16 | bytes |
| --- | --- | --- |
| lib/tools.js | e51734baf4693cd3 | 213715 |
| lib/members.js | 50f558f8b207d874 | 102260 |
| lib/state.js | 56664c59ff400319 | 57508 |
| lib/snapshot.js | a2a87e1b0c0b34ea | 13986 |
| lib/index.js | 2d28e617f0683e42 | 45315 |
| lib/tool-names.js | e3def5db908dcbd5 | 808 |
| lib/client.js | 377bcea2394cc0ac | 258432 |
| lib/client.js.map | 5024364fefe8b73e | 404958 |
| lib/types/members.d.ts | c53250ab41bff8c3 | 31769 |
| lib/types/snapshot.d.ts | 962f99a7bcb18b94 | 7627 |
| lib/types/tools.d.ts | 41cfc56576ed8ffd | 7546 |
| lib/client/ActivityPanel.module.css | 53ea47c6d780cd9d | 51837 |
| package.json | 92a6404071e457cc | 10498 |

Drift: 0 o ca ba moc (truoc pack / ngay sau pack / sau khi cai + boot). printVerdict in hai bang day du.
Ngoai bang: `lib/client/ActivityPanel.js` 9596333059c68b80 / 64 004 B (khong nam trong 13 tep FROZEN).

## 3. Ba chieu + profile cai

- Profile MOI `agent-teams-pack20` (khong dung lai pack19): `npm=0`, `isSymlink=false`, `isDirectory=true`, version `0.2.0-dev.0`.
- Lock: `file:E:/Project/Agent-Team/packages/dsh-agent-teams/tests/tmp/t135/run-t135-b/pack-a/nami-dsh-agent-teams-0.2.0-dev.0.tgz` (tro dung tarball vong 21).
- Ba chieu (payload tarball / ban cai / nguon): **13/13 SAME**.
- Payload scan toan bo: **133/133 file entry khop nguon, diff=0**.
- `lib/client.js` 377bcea2394cc0ac/258432 va `lib/client.js.map` 5024364fefe8b73e/404958: nguon == ban cai (same=true).

## 4. Boot tren BAN DA CAI

`exit=0`, `session-3a07f4ba-2d71-4bf6-99d2-803e0470d55e`, 6 tool call (create, remove_member, status, edit_plan, update_task, status). Nguyen van:

    Members (1 present + 1 removed):
      - alice [researcher] idle/unspawned . opencode-go/kimi-k2.7-code
    Removed (1):
      - bob [qa] opencode-go/deepseek-v4.1-flash . reasoning max . joined 2026-11-01T04:35:24.348Z
    Tasks (1):
      - t1 [pending] work findings 1 attempt 0 probe task -> captain
    Team id: t135probe . phase: staged

Thu tu panel trong bundle cua BAN CAI: `ok=true` — `DependencyMap@175646 (x1) < AddMemberControl@175795 (x1) < orderDelegationMembers call@175899 (x2)`.

## 5. Doi chung am (`--negative`, EXIT 0 vi moi nhanh deu bi bat)

- CLEAN 13/13 => exit 0; lat 1 byte bytes trong bang => `DIFF lib/tools.js [frozen] applies=false delta=-1`.
- Doi sha16 => `DIFF lib/members.js [frozen] shaApplies=false shaFrozen=ffffffffffffffff`.
- Lat 1 byte tren BAN SAO payload => `DIFF lib/state.js [payload] applies=true delta=+1` (57508 -> 57509).
- Lat 1 byte tren BAN COPY `.tgz` trong tests/tmp/t135 => con `--analyze` **EXIT 1** (dong `FAIL A4`, sha256Now=3cc15583...), ban goc **EXIT 0**; offset 5 nam trong gzip MTIME nen `tongBytesLech=0 byte`, chi sha doi.
- Hai tien trinh that: bang sach -> exit 0 (13/13), bang dot bien -> exit 1 (12/13).

## 6. Lenh verify va exit code (do bang `cmd > log 2>&1; echo $?`, khong qua pipe)

| lenh | EXIT | ket qua |
| --- | --- | --- |
| `node packages/dsh-agent-teams/tests/t135-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t135` | 0 | 18/18 check; sha256Now=6db464d1... bytesNow=2248091 entriesNow=133 |
| `node tests/t10-ui-bundle-smoke.mjs` | 0 | 50/50 |
| `node tests/t129-pins.mjs` | 0 | 13/13 |

Trong pipeline: t98 `--strict` EXIT 0 (GREEN, tools=16 fields=112 reached=105 uncovered=0) · t128 EXIT 0 (16/16) · t10 EXIT 0 · t129 EXIT 0 · SELF_MUTATION caught exit=1,1,1,1,1 (19/19 named export tren ban cai).

## 7. Suite pack cu SE DO vi ghim hash nguon (dung thiet ke, khong sua)

13 muc: t35-pack-repack.mjs:39 · t84-pack.mjs:51 · t88-pack.mjs:57 · t92-pack.mjs:57 · t96-pack.mjs:57 · t100-pack.mjs:57 · t104-pack.mjs:58 · t108-pack.mjs:59 · t111-pack.mjs:79 · tests/t121-pack.mjs:380 · tests/t130-pack.mjs:383 · tests/t118-pack.mjs:65 · t126-released-bytes-boot.mjs:53.

## 8. Gioi han trung thuc

- Boot dung 2 lan: run-t135-a (`session-465c99d8-8ac5-4cb1-9b85-13a6c9cf0604`) va run-t135-b (`session-3a07f4ba-...`); lan a chay truoc mot va cosmetic, nen da chay lai lan b cho khop script cuoi.
- Pack dung 4 lan cho 2 run (a/b), moi lan 2 goi; tong 4 goi, duoi tran thong le 6.
- run-t135-a van con tren dia va dung lai duoc; ban phat hanh la run-t135-b.
- `--negative` tra EXIT 0 theo quy uoc cua suite (cong cu kiem phai bat duoc moi dot bien); yeu cau 'EXIT 1' cua card duoc thoa boi CHINH phep cham tren ban copy: copyExit=1, originalExit=0.

