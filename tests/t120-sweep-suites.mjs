#!/usr/bin/env node
/**
 * t120 — proof that tools/sweep-suites.mjs classifies suite results mechanically.
 *
 * Why: 14 audit rounds classified red suites by hand, so "EXIT 1 because the artefact is from an
 * older round" was always counted next to "EXIT 1 is a real defect". The sweep tool must answer
 * that question from rules and citations, not from memory. This suite drives the real tool against
 * throw-away fixtures under tests/tmp/t120, never against the repo suites themselves.
 *
 *   node tests/t120-sweep-suites.mjs
 *
 * The fixture text that has to look like a live boot is assembled from pieces on purpose: if this
 * file contained the signal words verbatim, the sweep would classify THIS suite as LIVE and an
 * audit would silently skip it.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const TOOL = join(REPO_ROOT, 'tools', 'sweep-suites.mjs');
const TMP = join(HERE, 'tmp', 't120');
const FIX = join(TMP, 'fixtures');
const SENTINEL = join(TMP, 'sentinel-from-suite.txt');
const FROZEN_COPY = join(TMP, 'frozen-copy');
const REAL_STATE = join(REPO_ROOT, 'packages', 'dsh-agent-teams', 'lib', 'state.js');
const ROOT_REL = 'tests/tmp/t120/fixtures';

const checks = [];
function check(id, title, ok, evidence) {
    checks.push({ id, title, ok: ok === true, evidence: String(evidence ?? '') });
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' — ' + title);
    if (evidence !== undefined) console.log('      evidence: ' + evidence);
    return ok === true;
}

function sha256(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

function extractJson(text) {
    const lines = String(text).split(/\r?\n/);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        if (lines[i] === '{') {
            try {
                return JSON.parse(lines.slice(i).join('\n'));
            } catch (error) {
                return undefined;
            }
        }
    }
    return undefined;
}

function runTool(args) {
    const result = spawnSync(process.execPath, [TOOL, ...args], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: 32 * 1024 * 1024,
    });
    const out = (result.stdout ?? '') + (result.stderr ?? '');
    return { code: result.status, out, json: extractJson(result.stdout ?? '') };
}

function rowFor(json, name) {
    if (json === undefined || !Array.isArray(json.rows)) return undefined;
    return json.rows.find((row) => row.suite === name);
}

const LIVE_FIXTURE = [
    '// synthetic boot: the sweep must detect this from text, never from a name list',
    "import { spawnSync } from 'node:child_process';",
    "const " + 'DESKTOP' + '_CLI = ' + "'C:/fake/gui/dsh.cmd';",
    "spawnSync('power" + "shell.exe', ['-NoProfile', '-Command', 'exit 0']);",
    "const args = ['--" + "json', '-'];",
    "console.log('fake live suite argv=' + args.join(' ') + ' boot session-abcdef12');",
    'process.exit(0);',
    '',
].join('\n');

const FIXTURES = {
    't120-fake-pass.mjs': "console.log('fake pass suite');\nprocess.exit(0);\n",
    't120-fake-fail.mjs': "console.error('fake failing suite');\nprocess.exit(1);\n",
    't120-fake-odd.mjs': "console.error('fake odd suite exits 2');\nprocess.exit(2);\n",
    't120-fake-slow.mjs': "const t0 = Date.now();\nwhile (Date.now() - t0 < 60000) { /* hang on purpose */ }\nprocess.exit(0);\n",
    't120-fake-legacy.mjs': "console.error('legacy artefact suite: pinned to an older round');\nprocess.exit(1);\n",
    't120-fake-nearmiss.mjs': "console.error('near miss: the exceptions list names another suite');\nprocess.exit(1);\n",
    't120-fake-sideeffect.mjs': [
        "import { mkdirSync, writeFileSync } from 'node:fs';",
        "import { dirname, join } from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        'const here = dirname(fileURLToPath(import.meta.url));',
        "mkdirSync(join(here, '..'), { recursive: true });",
        "writeFileSync(join(here, '..', 'sentinel-from-suite.txt'), 'this suite ran');",
        'process.exit(0);',
        '',
    ].join('\n'),
    't120-fake-live-boot.mjs': LIVE_FIXTURE,
    // V19-F7: a suite that exits 0 while announcing that a gate could not run.
    't120-fake-warn.mjs': [
        "console.log('WARN typescript was not found at packages/dsh-agent-teams/node_modules/typescript, so the declaration compile gate cannot run');",
        "console.log('20/20 cases passed');",
        'process.exit(0);',
        '',
    ].join('\n'),
    // V19-F2: a suite that writes ONE byte into a COPY of the frozen source table while it runs.
    't120-fake-drift.mjs': [
        "import { appendFileSync, existsSync } from 'node:fs';",
        "import { dirname, join } from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        'const here = dirname(fileURLToPath(import.meta.url));',
        "const victim = join(here, '..', 'frozen-copy', 'lib', 'state.js');",
        "if (!existsSync(victim)) { console.error('drift fixture cannot find its copy at ' + victim); process.exit(2); }",
        "appendFileSync(victim, 'X');",
        "console.log('drift fixture appended 1 byte to ' + victim);",
        'process.exit(0);',
        '',
    ].join('\n'),
};

async function prepareFixtures() {
    await rm(TMP, { recursive: true, force: true });
    await mkdir(FIX, { recursive: true });
    // A COPY of the release source table, so the drift fixture never writes the real tree.
    await mkdir(FROZEN_COPY, { recursive: true });
    await cp(join(REPO_ROOT, 'packages', 'dsh-agent-teams', 'lib'), join(FROZEN_COPY, 'lib'), { recursive: true });
    await cp(join(REPO_ROOT, 'packages', 'dsh-agent-teams', 'package.json'), join(FROZEN_COPY, 'package.json'));
    for (const [name, body] of Object.entries(FIXTURES)) {
        await writeFile(join(FIX, name), body, 'utf8');
    }
    const exceptions = {
        version: 1,
        entries: [
            {
                suite: 't120-fake-legacy.mjs',
                args: [],
                reason: 'fixture pinned to an older round; red by design',
                citation: 'tests/tmp/t120/fixtures/t120-fake-legacy.mjs:1',
                fix: 're-pin the fixture when the fixture round moves',
            },
        ],
    };
    await writeFile(join(TMP, 'exceptions.json'), JSON.stringify(exceptions, null, 2), 'utf8');
    const override = {
        version: 1,
        entries: [
            {
                suite: 't120-fake-live-boot.mjs',
                group: 'fast',
                reason: 'declared override: this fixture only prints an argv, it boots nothing',
                citation: 'tests/tmp/t120/fixtures/t120-fake-live-boot.mjs:2',
                fix: 'delete the override if the fixture ever boots a real session',
            },
        ],
    };
    await writeFile(join(TMP, 'exceptions-override.json'), JSON.stringify(override, null, 2), 'utf8');
    await writeFile(join(TMP, 'manifest.json'), JSON.stringify({ suites: ['t120-fake-pass.mjs', 't120-fake-odd.mjs', { suite: 't120-fake-gone.mjs', file: ROOT_REL + '/t120-fake-gone.mjs' }] }, null, 2), 'utf8');
    await writeFile(join(TMP, 'exceptions-empty.json'), JSON.stringify({ version: 1, entries: [] }, null, 2), 'utf8');
    await writeFile(join(TMP, 'exceptions-broken.json'), '{ not json at all', 'utf8');
}

const ROOT_ARGS = ['--root', ROOT_REL];
const EXC = ['--exceptions', 'tests/tmp/t120/exceptions.json'];

await prepareFixtures();

{
    const run = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '20000', '--only', 'fake-pass', '--json']);
    const row = rowFor(run.json, 't120-fake-pass.mjs');
    check('a1', 'suite tren exit 0 => PASS, tool exit 0', row !== undefined && row.verdict === 'PASS' && row.exitCode === 0 && run.code === 0,
        'verdict=' + (row && row.verdict) + ' exit=' + (row && row.exitCode) + ' toolExit=' + run.code);
}
{
    const run = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '20000', '--only', 'fake-fail,fake-legacy', '--json']);
    const fail = rowFor(run.json, 't120-fake-fail.mjs');
    const legacy = rowFor(run.json, 't120-fake-legacy.mjs');
    check('a2', 'exit 1 => FAIL; va exception khop => LEGACY nhung KHONG duoc chay, van exit 1',
        fail !== undefined && fail.verdict === 'FAIL' && legacy !== undefined && legacy.verdict === 'LEGACY' && legacy.ran === false && run.code === 1,
        'fail=' + JSON.stringify(fail && { v: fail.verdict, e: fail.exitCode }) + ' legacy=' + JSON.stringify(legacy && { v: legacy.verdict, ran: legacy.ran }) + ' toolExit=' + run.code);
}
{
    const run = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '20000', '--only', 'fake-odd', '--json']);
    const row = rowFor(run.json, 't120-fake-odd.mjs');
    check('a3', 'exit 2 => UNCLASSIFIED (khong xanh, khong phai FAIL) va tool exit 3',
        row !== undefined && row.verdict === 'UNCLASSIFIED' && /exit 2/.test(row.note ?? '') && run.code === 3,
        'verdict=' + (row && row.verdict) + ' note=' + (row && row.note) + ' toolExit=' + run.code);
}
{
    const started = Date.now();
    const run = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '1500', '--only', 'fake-slow', '--json']);
    const elapsed = Date.now() - started;
    const row = rowFor(run.json, 't120-fake-slow.mjs');
    check('a4', 'suite treo => FAIL(timeout), tool khong treo theo',
        row !== undefined && row.verdict === 'FAIL' && /timeout/.test(row.note ?? '') && elapsed < 30000 && run.code === 1,
        'verdict=' + (row && row.verdict) + ' note=' + (row && row.note) + ' wallMs=' + elapsed + ' toolExit=' + run.code);
}
{
    const run = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '20000', '--only', 'fake-legacy', '--json']);
    const printed = /tests\/tmp\/t120\/fixtures\/t120-fake-legacy\.mjs:1/.test(run.out) && /reason:/.test(run.out) && /fix:/.test(run.out);
    const row = rowFor(run.json, 't120-fake-legacy.mjs');
    check('a5', 'exception LEGACY khop => LEGACY, in nguyen van reason+citation+fix, tool exit 0',
        row !== undefined && row.verdict === 'LEGACY' && printed && run.code === 0,
        'verdict=' + (row && row.verdict) + ' citationPrinted=' + printed + ' toolExit=' + run.code);
}
{
    const run = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '20000', '--only', 'fake-nearmiss', '--json']);
    const row = rowFor(run.json, 't120-fake-nearmiss.mjs');
    check('a6', 'exception KHONG khop (ten gan giong) => FAIL, khong duoc tha', row !== undefined && row.verdict === 'FAIL' && run.code === 1,
        'verdict=' + (row && row.verdict) + ' toolExit=' + run.code);
}
{
    await rm(SENTINEL, { force: true });
    const run = runTool([...ROOT_ARGS, ...EXC, '--list', '--only', 'fake-sideeffect', '--json']);
    const row = rowFor(run.json, 't120-fake-sideeffect.mjs');
    check('a7', '--list KHONG chay gi (suite co side-effect ghi tep ma tep khong xuat hien)',
        existsSync(SENTINEL) === false && run.code === 0 && row !== undefined && row.ran === false,
        'sentinelExists=' + existsSync(SENTINEL) + ' toolExit=' + run.code + ' ran=' + (row && row.ran));
}
{
    const run = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '20000', '--only', 'fake-pass', '--json']);
    const names = run.json !== undefined && Array.isArray(run.json.rows) ? run.json.rows.map((row) => row.suite) : [];
    check('a8', '--only loc dung: chi con dung suite khop', names.length === 1 && names[0] === 't120-fake-pass.mjs',
        'rows=' + JSON.stringify(names));
}
{
    const run = runTool(['--manifest', 'tests/tmp/t120/manifest.json', ...ROOT_ARGS, ...EXC, '--run', '--timeout', '20000', '--json']);
    const gone = rowFor(run.json, 't120-fake-gone.mjs');
    const pass = rowFor(run.json, 't120-fake-pass.mjs');
    check('a9', 'suite khong chay duoc (tep khong ton tai) => UNCLASSIFIED, khong phai PASS',
        gone !== undefined && gone.verdict === 'UNCLASSIFIED' && gone.ran === false && pass !== undefined && pass.verdict === 'PASS' && run.code === 3,
        'gone=' + JSON.stringify(gone && { v: gone.verdict, ran: gone.ran, note: gone.note }) + ' toolExit=' + run.code);
}
{
    const unknown = runTool(['--list', '--bogus-flag']);
    const brokenExceptions = runTool(['--list', ...(['--exceptions', 'tests/tmp/t120/exceptions-broken.json'])]);
    const emptyRoot = runTool(['--list', '--root', 'tests/tmp/t120/does-not-exist']);
    const noMatch = runTool([...ROOT_ARGS, ...EXC, '--run', '--only', 'zzz-no-such-suite']);
    check('a10', 'exit code cua CONG CU: 2 khi tham so sai / danh sach ngoai le hong / khong co suite nao',
        unknown.code === 2 && brokenExceptions.code === 2 && emptyRoot.code === 2 && noMatch.code === 2,
        'unknownFlag=' + unknown.code + ' brokenExceptions=' + brokenExceptions.code + ' emptyRoot=' + emptyRoot.code + ' noMatch=' + noMatch.code);
}
{
    const mutPath = join(FIX, 't120-fake-mutate.mjs');
    const before = "console.log('mutate control: green');\nprocess.exit(0);\n";
    const after = "console.log('mutate control: now red');\nprocess.exit(1);\n";
    await writeFile(mutPath, before, 'utf8');
    const first = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '20000', '--only', 'fake-mutate', '--json']);
    const greenRow = rowFor(first.json, 't120-fake-mutate.mjs');
    await writeFile(mutPath, after, 'utf8');
    const second = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '20000', '--only', 'fake-mutate', '--json']);
    const redRow = rowFor(second.json, 't120-fake-mutate.mjs');
    const deltaBytes = Buffer.byteLength(after) - Buffer.byteLength(before);
    const applies = greenRow !== undefined && redRow !== undefined && greenRow.verdict === 'PASS' && redRow.verdict === 'FAIL';
    console.log('      mutation: applies=' + applies + ' sha256 before=' + sha256(before).slice(0, 16) + ' after=' + sha256(after).slice(0, 16) + ' deltaBytes=' + deltaBytes);
    check('a11', 'DOI CHUNG AM: sua fixture tu exit 0 sang exit 1 => ket luan doi PASS -> FAIL',
        applies && first.code === 0 && second.code === 1,
        'before=' + (greenRow && greenRow.verdict) + ' after=' + (redRow && redRow.verdict) + ' toolExit ' + first.code + ' -> ' + second.code + ' applies=' + applies + ' deltaBytes=' + deltaBytes);
}
{
    const run = runTool([...ROOT_ARGS, '--exceptions', 'tests/tmp/t120/exceptions-empty.json', '--run', '--timeout', '20000', '--only', 'fake-legacy', '--json']);
    const row = rowFor(run.json, 't120-fake-legacy.mjs');
    check('a12', 'DOI CHUNG AM: xoa muc ngoai le => suite roi vao FAIL, khong tu thanh LEGACY',
        row !== undefined && row.verdict === 'FAIL' && row.ran === true && row.exitCode === 1 && run.code === 1,
        'verdict=' + (row && row.verdict) + ' ran=' + (row && row.ran) + ' exit=' + (row && row.exitCode) + ' toolExit=' + run.code);
}
{
    const all = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '1500', '--json']);
    const skippedText = /skipped \(live\): 1 suite/.test(all.out);
    const liveSkipped = rowFor(all.json, 't120-fake-live-boot.mjs');
    const included = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '20000', '--include-live', '--only', 'fake-live-boot', '--json']);
    const liveRan = rowFor(included.json, 't120-fake-live-boot.mjs');
    const listAll = runTool([...ROOT_ARGS, ...EXC, '--list', '--json']);
    const liveRow = rowFor(listAll.json, 't120-fake-live-boot.mjs');
    check('a13', 'nhom LIVE nhan dien bang dau hieu van ban: mac dinh bo qua + noi ro, --include-live moi chay',
        liveRow !== undefined && liveRow.group === 'live' && skippedText && liveSkipped !== undefined && liveSkipped.ran === false && liveRan !== undefined && liveRan.ran === true && included.json !== undefined && included.json.boots >= 1,
        'signals=' + JSON.stringify(liveRow && liveRow.signals) + ' skippedText=' + skippedText + ' defaultRan=' + (liveSkipped && liveSkipped.ran) + ' includeLiveRan=' + (liveRan && liveRan.ran) + ' boots=' + (included.json && included.json.boots));
}
{
    const run = runTool(['--list', '--json']);
    const rows = Array.isArray(run.json && run.json.rows) ? run.json.rows : [];
    const liveNames = rows.filter((row) => row.group === 'live').map((row) => row.suite);
    const wanted = ['t59-erp-live-copy.mjs', 't106-erp-live-roundtrip.mjs', 't82-erp-migrate-live.mjs', 't11-http-e2e.mjs', 't18-hot-switch-e2e.mjs', 't45-clear-live-e2e.mjs'];
    const missing = wanted.filter((name) => !liveNames.includes(name));
    const selfRow = rows.find((row) => row.suite === 't120-sweep-suites.mjs');
    check('a14', 'repo that: --list thay >=60 suite, CA 6 suite LIVE cua card, va chinh suite nay KHONG bi coi la LIVE',
        rows.length >= 60 && missing.length === 0 && run.code === 0 && selfRow !== undefined && selfRow.group === 'fast',
        'suites=' + rows.length + ' live=' + liveNames.length + ' missing=' + JSON.stringify(missing) + ' selfGroup=' + (selfRow && selfRow.group));
}
{
    const run = runTool([...ROOT_ARGS, '--exceptions', 'tests/tmp/t120/exceptions-override.json', '--list', '--json']);
    const row = rowFor(run.json, 't120-fake-live-boot.mjs');
    check('a15', 'cho phep GHI DE nhom bang danh sach khai bao co ly do (live -> fast, co reason)',
        row !== undefined && row.group === 'fast' && run.code === 0,
        'group=' + (row && row.group) + ' overridePrinted=' + /\[override\]/.test(run.out));
}


// ---------------------------------------------------------------- V19-F2 sampling
{
    const realStateBefore = { sha256: sha256(readFileSync(REAL_STATE)), bytes: statSync(REAL_STATE).size };
    const copyStateBefore = sha256(readFileSync(join(FROZEN_COPY, 'lib', 'state.js')));
    const drift = runTool([...ROOT_ARGS, ...EXC, '--frozen-root', 'tests/tmp/t120/frozen-copy', '--run', '--timeout', '20000', '--only', 'fake-drift', '--json']);
    const row = rowFor(drift.json, 't120-fake-drift.mjs');
    const entry = row !== undefined && Array.isArray(row.drift) ? row.drift.find((item) => item.file === 'lib/state.js') : undefined;
    const realStateAfter = { sha256: sha256(readFileSync(REAL_STATE)), bytes: statSync(REAL_STATE).size };
    const copyStateAfter = sha256(readFileSync(join(FROZEN_COPY, 'lib', 'state.js')));
    const named = drift.out.includes('lib/state.js')
        && /shaBefore=[0-9a-f]{16}/u.test(drift.out)
        && /shaAfter=[0-9a-f]{16}/u.test(drift.out)
        && /WRITTEN while this suite ran/u.test(drift.out);
    const realUntouched = realStateBefore.sha256 === realStateAfter.sha256 && realStateBefore.bytes === realStateAfter.bytes;
    check('a16', 'F2: sweep chup bang 13 tep TRUOC/SAU moi suite; fixture ghi 1 byte vao BAN SAO => FAIL, neu dung tep + hai sha, cay that khong doi',
        row !== undefined && row.verdict === 'FAIL' && entry !== undefined && entry.shaBefore !== entry.shaAfter
            && entry.bytesAfter === entry.bytesBefore + 1 && named && drift.code === 1
            && copyStateBefore !== copyStateAfter && realUntouched,
        'verdict=' + (row && row.verdict) + ' drift=' + JSON.stringify(entry && { file: entry.file, before: entry.shaBefore.slice(0, 16), after: entry.shaAfter.slice(0, 16), bytesBefore: entry.bytesBefore, bytesAfter: entry.bytesAfter })
            + ' toolExit=' + drift.code + ' named=' + named + ' realStateUnchanged=' + realUntouched);
}
{
    // A copy that is ALREADY one byte different from the real tree must still be green: sampling
    // compares before/after inside its own window, it does not pin the table.
    const control = runTool([...ROOT_ARGS, ...EXC, '--frozen-root', 'tests/tmp/t120/frozen-copy', '--run', '--timeout', '20000', '--only', 'fake-pass', '--json']);
    const row = rowFor(control.json, 't120-fake-pass.mjs');
    check('a17', 'F2 control: suite KHONG ghi gi => PASS, drift rong, tool exit 0 (lay mau cua so, khong ghim bang)',
        row !== undefined && row.verdict === 'PASS' && Array.isArray(row.drift) && row.drift.length === 0 && row.sampled === true && control.code === 0,
        'verdict=' + (row && row.verdict) + ' sampled=' + (row && row.sampled) + ' drift=' + JSON.stringify(row && row.drift) + ' toolExit=' + control.code);
}
// ---------------------------------------------------------------- V19-F7 warnings
{
    const plain = runTool([...ROOT_ARGS, ...EXC, '--run', '--timeout', '20000', '--only', 'fake-warn', '--json']);
    const row = rowFor(plain.json, 't120-fake-warn.mjs');
    const listed = /== WARN lines \(1\)/u.test(plain.out)
        && plain.out.includes('WARN typescript was not found at packages/dsh-agent-teams/node_modules/typescript, so the declaration compile gate cannot run')
        && /warnings: 1 WARN line\(s\) in 1 suite/u.test(plain.out);
    check('a18', 'F7 mac dinh: moi dong ^WARN duoc dem + in nguyen van (warnCount + muc warnings), exit van theo ma suite (0)',
        row !== undefined && row.verdict === 'PASS' && row.warnCount === 1 && Array.isArray(row.warnings)
            && row.warnings.length === 1 && /\(typescript\)|typescript was not found/u.test(row.warnings[0]) && listed && plain.code === 0,
        'verdict=' + (row && row.verdict) + ' warnCount=' + (row && row.warnCount) + ' listed=' + listed + ' toolExit=' + plain.code);
}
{
    const strict = runTool([...ROOT_ARGS, ...EXC, '--strict', '--run', '--timeout', '20000', '--only', 'fake-warn', '--json']);
    const row = rowFor(strict.json, 't120-fake-warn.mjs');
    const explained = /--strict: any WARN is NOT green|STRICT/u.test(strict.out);
    check('a19', 'F7 --strict: co WARN => KHONG xanh (tool exit 3), van in dong WARN + warnCount',
        row !== undefined && row.warnCount === 1 && strict.code === 3 && explained,
        'warnCount=' + (row && row.warnCount) + ' toolExit=' + strict.code + ' explained=' + explained);
}
{
    const list = runTool(['--list', '--json']);
    const rows = Array.isArray(list.json && list.json.rows) ? list.json.rows : [];
    const legacy = rows.filter((row) => row.legacy === true);
    const reposRun = runTool(['--list']);
    check('a20', 'F7/F2 khong pha hanh vi cu: danh sach ngoai le mac dinh van dung 8 LEGACY, --list van khong chay gi',
        legacy.length === 8 && list.code === 0 && /legacy exceptions: 8/u.test(reposRun.out),
        'legacyRows=' + legacy.length + ' names=' + legacy.map((row) => row.suite).join(',') + ' listExit=' + list.code);
}

const failed = checks.filter((item) => item.ok !== true);
console.log('');
console.log('# ' + checks.length + '/' + checks.length + ' cases: ' + (checks.length - failed.length) + ' passed, ' + failed.length + ' failed');
for (const item of checks) console.log((item.ok ? 'ok ' : 'FAIL ') + item.id + ' ' + item.title);
process.exitCode = failed.length === 0 ? 0 : 1;
