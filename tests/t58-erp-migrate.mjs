#!/usr/bin/env node
/**
 * t58 - suite cho tools/erp-route-migrate.mjs (buoc GHI di tru route ERP).
 *
 *   node tests/t58-erp-migrate.mjs
 *
 * LUAT CUNG: moi phep ghi cua suite nay chi roi vao tests/tmp/t58/. Tep that
 * <repo>/../ERP/.agent-teams/erp-erp/team.json chi duoc DOC; sha256 cua no duoc
 * do luc bat dau va luc ket thuc va phai bang moc dong bang 9f7420b6..., neu
 * khong thi suite FAIL.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
// Validator cua plugin: nguon su that ve hinh dang team.json (V6-F1).
import { readTeam, writeTeam } from '../packages/dsh-agent-teams/lib/state.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const TOOL = join(REPO, 'tools', 'erp-route-migrate.mjs');
const ERP_TEAM = resolve(REPO, '..', 'ERP', '.agent-teams', 'erp-erp', 'team.json');
const FROZEN_ERP_SHA = '9f7420b6a1af1f4e3f7b41c39854cfeac247b0d90c49b86deda432e3e15f2d1e';
const TMP = join(REPO, 'tests', 'tmp', 't58');
const FROZEN_ERP_BYTES = 1533117;
const TEAM_ID = 'erp-erp';
const ROUTE = { provider: 'opencode-go-new', model: 'minimax-m3.1-flash-free', reasoningEffort: 'max' };
const STARTED_AT = Date.now();

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const shaOfFile = (path) => sha256(readFileSync(path));
const erpBefore = shaOfFile(ERP_TEAM);
const erpStatBefore = statSync(ERP_TEAM);
const erpListingBefore = readdirSync(dirname(ERP_TEAM)).sort().join(',');

/** Chay tool, tra ve {status, stdout, stderr}. */
function run(args, cwd = REPO) {
    const result = spawnSync(process.execPath, [TOOL, ...args], { cwd, encoding: 'utf8' });
    assert.equal(result.error, undefined, 'khong chay duoc tool: ' + String(result.error));
    return { status: result.status, stdout: String(result.stdout), stderr: String(result.stderr) };
}

/** Ban copy moi cua team.json ERP trong tests/tmp/t58/<ten>/. */
function freshCopy(name) {
    const stateRoot = join(TMP, name);
    rmSync(stateRoot, { recursive: true, force: true });
    mkdirSync(join(stateRoot, TEAM_ID), { recursive: true });
    const path = join(stateRoot, TEAM_ID, 'team.json');
    copyFileSync(ERP_TEAM, path);
    return { dir: stateRoot, stateRoot, teamId: TEAM_ID, path };
}

/** Sua ban copy bang JSON (chi trong tests/tmp/t58). */
function mutateCopy(path, edit) {
    const before = readFileSync(path, 'utf8');
    const team = JSON.parse(before);
    edit(team);
    const after = JSON.stringify(team, null, 2);
    writeFileSync(path, after);
    return { before, after };
}

const memberIndex = (team, name) => team.members.findIndex((member) => member.name === name);
const memberNamed = (team, name) => team.members.find((member) => member.name === name);

/** Tap duong dan khoa khac nhau giua hai JSON. */
function diffPaths(left, right, prefix = '') {
    const bothObjects = left !== null && right !== null && typeof left === 'object' && typeof right === 'object';
    if (bothObjects !== true) return JSON.stringify(left) === JSON.stringify(right) ? [] : [prefix === '' ? '(root)' : prefix];
    const out = [];
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
        const path = Array.isArray(left) ? prefix + '[' + key + ']' : (prefix === '' ? key : prefix + '.' + key);
        out.push(...diffPaths(left[key], right[key], path));
    }
    return out;
}

/** Ban sao cua team KHONG co routeOverride (de chung minh khong khoa nao khac bi doi). */
function withoutRouteOverride(team) {
    return {
        ...team,
        members: team.members.map((member) => {
            const clone = { ...member };
            delete clone.routeOverride;
            return clone;
        }),
    };
}

/** routeOverride do tool ghi PHAI hop le theo lib/state.js isTeamMember. */
function assertRouteOverride(record, label) {
    assert.equal(typeof record, 'object', label + ': routeOverride khong phai object');
    assert.deepEqual({ provider: record.provider, model: record.model, reasoningEffort: record.reasoningEffort }, ROUTE, label + ': route khong duoc chep dung tu ban goc');
    assert.equal(record.source, 'profile', label + ': source phai la "profile" (union cua isTeamMember)');
    assert.equal(typeof record.at, 'number', label + ': at phai la so');
    assert.ok(Number.isFinite(record.at) === true && record.at >= STARTED_AT, label + ': at phai la ms hop le');
    assert.equal(typeof record.by, 'string', label + ': by phai la chuoi provenance');
    assert.ok(record.by.trim() !== '', label + ': by khong duoc rong');
}

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const erpOriginal = JSON.parse(readFileSync(ERP_TEAM, 'utf8'));
const EXPECTED_PAIRS = ['ha-tang', 'qa-do', 'master-hop-dong', 'tai-lieu', 'fe-ui', 'be-api', 'db-luoc-do'];

test('s0 moc dong bang: team.json ERP dung sha256 da cam ket va suite chay tren ban copy', async () => {
    assert.equal(erpBefore, FROZEN_ERP_SHA, 'sha256 team.json ERP khac moc dong bang - DUNG lai truoc khi doc tiep');
    assert.ok(erpOriginal.members.length >= 14);
    assert.equal(EXPECTED_PAIRS.length, 7);
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
});

test('a1 dry-run: in bang 7 cap "se ghi", khong doi byte nao, khong tao backup', async () => {
    const copy = freshCopy('a1');
    const before = shaOfFile(copy.path);
    const result = run(['--team', copy.path]);
    assert.equal(result.status, 0, result.stderr);
    const rows = result.stdout.split('\n').filter((line) => line.includes('| se ghi |'));
    assert.equal(rows.length, 7, 'bang diff phai co 7 hang "se ghi"');
    for (const base of EXPECTED_PAIRS) assert.ok(rows.some((row) => row.includes('| ' + base + ' |')), 'thieu cap ' + base);
    assert.ok(result.stdout.includes('dry-run'), 'phai noi ro dang dry-run');
    assert.ok(result.stdout.includes('identical = true'), 'phai in identical = true');
    assert.ok(result.stdout.includes('source=profile'), 'dry-run phai noi truong provenance se ghi');
    assert.equal(shaOfFile(copy.path), before, 'dry-run khong duoc doi byte nao');
    assert.deepEqual(readdirSync(copy.stateRoot).sort(), [TEAM_ID], 'dry-run khong duoc tao tep nao');
    assert.deepEqual(readdirSync(join(copy.stateRoot, TEAM_ID)).sort(), ['team.json']);
});

test('a2 dry-run --json: mode, changed=7, already=0, sha khong doi', async () => {
    const copy = freshCopy('a2');
    const result = run(['--team', copy.path, '--json']);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.detected, 7);
    assert.equal(report.changed, 7);
    assert.equal(report.already, 0);
    assert.equal(report.shaBefore, report.shaAfter);
    assert.deepEqual(report.diffPaths, []);
});

test('b1 --apply thieu --backup bi tu choi (exit 2), tep khong doi', async () => {
    const copy = freshCopy('b1');
    const before = shaOfFile(copy.path);
    const result = run(['--team', copy.path, '--apply', '--expect-sha256', before]);
    assert.equal(result.status, 2, 'phai exit 2');
    assert.ok(/--backup/.test(result.stderr), 'phai noi ro thieu --backup');
    assert.equal(shaOfFile(copy.path), before);
});

test('b2 --apply thieu --expect-sha256 bi tu choi (exit 2), tep khong doi', async () => {
    const copy = freshCopy('b2');
    const before = shaOfFile(copy.path);
    const result = run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'backup.json')]);
    assert.equal(result.status, 2);
    assert.ok(/--expect-sha256/.test(result.stderr), 'phai noi ro thieu --expect-sha256');
    assert.equal(shaOfFile(copy.path), before);
    assert.equal(existsSync(join(copy.dir, 'backup.json')), false, 'chua duoc tao backup khi tu choi');
});

test('c1 sha lech --expect-sha256: exit 2, khong ghi, khong tao backup', async () => {
    const copy = freshCopy('c1');
    const before = shaOfFile(copy.path);
    const result = run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'backup.json'), '--expect-sha256', 'deadbeef'.repeat(8)]);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('deadbeef'), 'phai in ca sha mong doi va sha thuc');
    assert.ok(result.stderr.includes(before), 'phai in sha thuc cua tep');
    assert.equal(shaOfFile(copy.path), before);
    assert.equal(existsSync(join(copy.dir, 'backup.json')), false);
});

test('c2 --pair vao member goc con song: exit 2, tep khong doi', async () => {
    const copy = freshCopy('c2');
    const before = shaOfFile(copy.path);
    const result = run(['--team', copy.path, '--pair', 'ha-tang-2']);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('MEMBER_NOT_FOUND') || result.stderr.includes('MEMBER_NOT_FOUND') || result.stderr.includes('van con song'), result.stderr);
    assert.equal(shaOfFile(copy.path), before);
});

test('c3 --pair vao member khong ton tai: exit 2 MEMBER_NOT_FOUND', async () => {
    const copy = freshCopy('c3');
    const before = shaOfFile(copy.path);
    const result = run(['--team', copy.path, '--pair', 'khong-co-member-nay']);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('MEMBER_NOT_FOUND'), result.stderr);
    assert.equal(shaOfFile(copy.path), before);
});

test('c4 ban goc khong co route khai bao: exit 2 BASE_NO_ROUTE', async () => {
    const copy = freshCopy('c4');
    mutateCopy(copy.path, (team) => {
        delete memberNamed(team, 'qa-do').provider;
        delete memberNamed(team, 'qa-do').model;
    });
    const before = shaOfFile(copy.path);
    const result = run(['--team', copy.path, '--pair', 'qa-do']);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('BASE_NO_ROUTE'), result.stderr);
    assert.equal(shaOfFile(copy.path), before);
});

test('c5 member dich da removed: exit 2 TARGET_REMOVED', async () => {
    const copy = freshCopy('c5');
    mutateCopy(copy.path, (team) => {
        memberNamed(team, 'fe-ui-2').status = 'removed';
        delete memberNamed(team, 'fe-ui-2').id;
    });
    const before = shaOfFile(copy.path);
    const result = run(['--team', copy.path, '--pair', 'fe-ui']);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes('TARGET_REMOVED'), result.stderr);
    assert.equal(shaOfFile(copy.path), before);
});

test('d1 apply mot cap: chi routeOverride cua member do doi, backup byte-identical', async () => {
    const copy = freshCopy('d1');
    const before = shaOfFile(copy.path);
    const backup = join(copy.dir, 'backup.json');
    const result = run(['--team', copy.path, '--apply', '--backup', backup, '--expect-sha256', before, '--pair', 'ha-tang']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(shaOfFile(backup), before, 'backup phai byte-identical voi ban goc');
    assert.ok(result.stdout.includes('byte-identical: true'), 'phai in byte-identical: true');
    assert.ok(result.stdout.includes('plugin round-trip: readTeam ok'), 'phai in ket qua doc lai bang plugin');
    const migrated = JSON.parse(readFileSync(copy.path, 'utf8'));
    const paths = diffPaths(erpOriginal, migrated);
    const expected = ['members[' + memberIndex(erpOriginal, 'ha-tang-2') + '].routeOverride'];
    assert.deepEqual(paths, expected, 'chi duoc doi routeOverride cua member dich');
    assertRouteOverride(memberNamed(migrated, 'ha-tang-2').routeOverride, 'd1/ha-tang-2');
    assert.equal(memberNamed(migrated, 'ha-tang-2').provider, 'opencode-go', 'route khai bao phai giu nguyen');
    assert.notEqual(shaOfFile(copy.path), before, 'apply that phai doi byte');
});

test('d2 apply lai chinh cap do (idempotent): khong doi byte nao, bao already migrated: 1', async () => {
    const copy = freshCopy('d1');
    const before = shaOfFile(copy.path);
    run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'b1.json'), '--expect-sha256', before, '--pair', 'ha-tang']);
    const afterFirst = shaOfFile(copy.path);
    const second = run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'b2.json'), '--expect-sha256', afterFirst, '--pair', 'ha-tang']);
    assert.equal(second.status, 0, second.stderr);
    assert.ok(second.stderr.includes('already migrated: 1'), second.stderr);
    assert.equal(shaOfFile(copy.path), afterFirst, 'lan hai khong duoc doi byte nao');
    assert.deepEqual(diffPaths(erpOriginal, JSON.parse(readFileSync(copy.path, 'utf8'))), ['members[' + memberIndex(erpOriginal, 'ha-tang-2') + '].routeOverride']);
});

test('d3 apply ca 7 cap: dung 7 khoa routeOverride doi, khong khoa nao khac', async () => {
    const copy = freshCopy('d3');
    const before = shaOfFile(copy.path);
    const result = run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'backup.json'), '--expect-sha256', before]);
    assert.equal(result.status, 0, result.stderr);
    const migrated = JSON.parse(readFileSync(copy.path, 'utf8'));
    const paths = diffPaths(erpOriginal, migrated);
    const expected = EXPECTED_PAIRS.map((base) => 'members[' + memberIndex(erpOriginal, base + '-2') + '].routeOverride');
    assert.deepEqual(paths.slice().sort(), expected.slice().sort());
    for (const base of EXPECTED_PAIRS) assertRouteOverride(memberNamed(migrated, base + '-2').routeOverride, 'd3/' + base + '-2');
    assert.deepEqual(withoutRouteOverride(migrated), withoutRouteOverride(erpOriginal), 'ngoai routeOverride khong duoc khoa nao khac doi');
    assert.equal(migrated.tasks.length, erpOriginal.tasks.length);
    assert.ok(result.stdout.includes('khoa da doi: ') && result.stdout.split('khoa da doi: ')[1].split('\n')[0].split(', ').length === 7);
});

test('d4 apply lai toan bo (idempotent): already migrated: 7, byte khong doi', async () => {
    const copy = freshCopy('d3');
    const before = shaOfFile(copy.path);
    run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'b1.json'), '--expect-sha256', before]);
    const afterFirst = shaOfFile(copy.path);
    const second = run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'b2.json'), '--expect-sha256', afterFirst]);
    assert.equal(second.status, 0, second.stderr);
    assert.ok(second.stderr.includes('already migrated: 7'), second.stderr);
    assert.equal(shaOfFile(copy.path), afterFirst);
});

test('e1 tham so sai: exit 1 (khong phai 2)', async () => {
    const copy = freshCopy('e1');
    const before = shaOfFile(copy.path);
    const unknown = run(['--team', copy.path, '--khong-co-tham-so-nay']);
    assert.equal(unknown.status, 1, unknown.stderr);
    const conflict = run(['--team', copy.path, '--apply', '--dry-run']);
    assert.equal(conflict.status, 1, conflict.stderr);
    assert.equal(run(['--team', copy.path, '--by', '']).status, 1, '--by rong phai la loi tham so');
    assert.equal(shaOfFile(copy.path), before);
});

test('e2 output khong chua duong dan tuyet doi', async () => {
    const copy = freshCopy('e2');
    const dry = run(['--team', copy.path]);
    assert.equal(/[A-Za-z]:[\\/]/.test(dry.stdout + dry.stderr), false, 'output lo duong dan tuyet doi:\n' + dry.stdout);
    const before = shaOfFile(copy.path);
    const applied = run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'backup.json'), '--expect-sha256', before]);
    assert.equal(applied.status, 0, applied.stderr);
    assert.equal(/[A-Za-z]:[\\/]/.test(applied.stdout + applied.stderr), false, 'output apply lo duong dan tuyet doi:\n' + applied.stdout);
});

test('e3 backup khong bi ghi de: lan apply thu hai voi backup cu bi tu choi', async () => {
    const copy = freshCopy('e3');
    const before = shaOfFile(copy.path);
    const backup = join(copy.dir, 'backup.json');
    assert.equal(run(['--team', copy.path, '--apply', '--backup', backup, '--expect-sha256', before, '--pair', 'qa-do']).status, 0);
    const backupSha = shaOfFile(backup);
    const again = run(['--team', copy.path, '--apply', '--backup', backup, '--expect-sha256', shaOfFile(copy.path), '--pair', 'qa-do']);
    assert.equal(again.status, 2, again.stderr);
    assert.equal(shaOfFile(backup), backupSha, 'ban sao cu phai duoc giu nguyen');
});

test('f1 ROUND-TRIP: sau --apply, readTeam cua plugin doc duoc tep dich (V6-F1)', async () => {
    const copy = freshCopy('f1');
    const before = shaOfFile(copy.path);
    const result = run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'backup.json'), '--expect-sha256', before]);
    assert.equal(result.status, 0, result.stderr);
    // Doc lai bang CHINH validator cua plugin, khong phai bang JSON.parse.
    const team = await readTeam(copy.stateRoot, copy.teamId);
    assert.ok(team !== undefined, 'readTeam tra ve undefined tren tep vua ghi');
    console.log('  readTeam ok: members=' + team.members.length + ' team=' + String(team.id));
    assert.equal(team.members.length, erpOriginal.members.length, 'readTeam phai thay du so member');
    assert.equal(team.tasks.length, erpOriginal.tasks.length);
    const target = team.members.find((member) => member.name === 'ha-tang-2');
    assertRouteOverride(target.routeOverride, 'f1/ha-tang-2');
    assert.equal(target.routeOverride.provider, ROUTE.provider);
    assert.equal(target.routeOverride.model, ROUTE.model);
    for (const base of EXPECTED_PAIRS) {
        assertRouteOverride(team.members.find((member) => member.name === base + '-2').routeOverride, 'f1/' + base + '-2');
    }
});

test('f2 CASE AM: routeOverride thieu source bi readTeam TU CHOI (validator la that)', async () => {
    const copy = freshCopy('f2');
    const before = shaOfFile(copy.path);
    assert.equal(run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'backup.json'), '--expect-sha256', before, '--pair', 'ha-tang']).status, 0);
    const changed = mutateCopy(copy.path, (team) => {
        delete memberNamed(team, 'ha-tang-2').routeOverride.source;
    });
    assert.notEqual(changed.after, changed.before, 'mutation khong doi byte nao - ban va vo nghia');
    console.log('  mutation != original: true (bo source)');
    await assert.rejects(() => readTeam(copy.stateRoot, copy.teamId), /is not a valid member record/, 'readTeam phai tu choi ban ghi thieu source');
});

test('f3 CASE AM: routeOverride co at la CHUOI bi readTeam TU CHOI', async () => {
    const copy = freshCopy('f3');
    const before = shaOfFile(copy.path);
    assert.equal(run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'backup.json'), '--expect-sha256', before, '--pair', 'qa-do']).status, 0);
    const changed = mutateCopy(copy.path, (team) => {
        memberNamed(team, 'qa-do-2').routeOverride.at = 'khong-phai-so';
    });
    assert.notEqual(changed.after, changed.before, 'mutation khong doi byte nao - ban va vo nghia');
    console.log('  mutation != original: true (at -> chuoi)');
    await assert.rejects(() => readTeam(copy.stateRoot, copy.teamId), /is not a valid member record/);
});

test('f4 source NGOAI union cua plugin nay duoc DOC (lenient) + round-trip nguyen van (t102/BUG-026)', async () => {
    // Truoc t102 case nay khang dinh readTeam TU CHOI source 'script'. Union dong da bi go
    // co chu y: mot he ngoai ghi provenance khong duoc lam chet ca doi (BUG-026). Nang luc
    // bat loi KHONG mat, no doi cho: tests/t102-erp-read-leniency.mjs do phan tu choi
    // ('', 123, 65 ky tu, 'Erp', 'erp tool') va dung doi chung am union cu trong bo nho.
    const copy = freshCopy('f4');
    const before = shaOfFile(copy.path);
    assert.equal(run(['--team', copy.path, '--apply', '--backup', join(copy.dir, 'backup.json'), '--expect-sha256', before, '--pair', 'be-api']).status, 0);
    const changed = mutateCopy(copy.path, (team) => {
        memberNamed(team, 'be-api-2').routeOverride.source = 'script';
    });
    assert.notEqual(changed.after, changed.before, 'mutation khong doi byte nao - ban va vo nghia');
    console.log('  mutation != original: true (source=script)');
    const team = await readTeam(copy.stateRoot, copy.teamId);
    assert.ok(team !== undefined, 'readTeam tra ve undefined tren ban ghi co source la');
    const target = memberNamed(team, 'be-api-2');
    assert.equal(target.routeOverride.source, 'script', 'source phai duoc giu NGUYEN VAN, khong chuan hoa');
    assert.equal(target.routeOverride.provider, ROUTE.provider);
    assert.equal(target.routeOverride.model, ROUTE.model);
    assert.equal(team.members.length, erpOriginal.members.length, 'readTeam phai thay du so member');
    await writeTeam(copy.stateRoot, team);
    const again = await readTeam(copy.stateRoot, copy.teamId);
    assert.equal(memberNamed(again, 'be-api-2').routeOverride.source, 'script');
    console.log('  readTeam ok: source=' + JSON.stringify(memberNamed(again, 'be-api-2').routeOverride.source)
        + ' members=' + again.members.length + ' tasks=' + again.tasks.length + ' round-trip=true');
});

test('g1 dry-run tren TEP ERP THAT: khong ghi, sha256 + so byte khong doi', async () => {
    const result = run(['--team', ERP_TEAM]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes('identical = true'), result.stdout);
    assert.equal(shaOfFile(ERP_TEAM), FROZEN_ERP_SHA, 'dry-run tren tep ERP that da lam doi tep');
    assert.equal(statSync(ERP_TEAM).size, FROZEN_ERP_BYTES);
    console.log('  ERP sau dry-run: sha256=' + shaOfFile(ERP_TEAM) + ' bytes=' + statSync(ERP_TEAM).size + ' identical=true');
});

test('z1 ket thuc: team.json ERP that van dung moc sha256, khong tep nao bi tao/xoa', async () => {
    assert.equal(shaOfFile(ERP_TEAM), erpBefore, 'team.json ERP da bi doi trong luc chay suite');
    assert.equal(shaOfFile(ERP_TEAM), FROZEN_ERP_SHA);
    const statAfter = statSync(ERP_TEAM);
    assert.equal(statAfter.mtimeMs, erpStatBefore.mtimeMs, 'mtime team.json ERP doi nghia la co ghi');
    assert.equal(statAfter.size, FROZEN_ERP_BYTES);
    assert.equal(readdirSync(dirname(ERP_TEAM)).sort().join(','), erpListingBefore, 'cay .agent-teams/erp-erp bi them/bot tep');
});

const results = [];
for (const item of cases) {
    try {
        await item.fn();
        results.push(true);
        console.log('ok ' + results.length + ' ' + item.name);
    } catch (error) {
        results.push(false);
        console.log('not ok ' + results.length + ' ' + item.name);
        console.log('  ' + (error instanceof Error ? error.message : String(error)));
    }
}
const failed = results.filter((ok) => ok !== true).length;
console.log('# ' + (results.length - failed) + '/' + results.length + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
