/**
 * Pack the release tarball for round 24 (after t148 made the dependency column as TALL as the member
 * column, through the --member-column-height CSS variable).
 *
 * Round 23 shipped the three-block panel; t148 then changed the panel source and its stylesheet again
 * (lib/client.js 7dca20dd... -> 44911f22... / 260 704 B, lib/client.js.map 173b684f... -> a6b7d7b7... /
 * 408 920 B, lib/client/ActivityPanel.module.css 7ea5190c... -> b6d8a2f5... / 52 216 B, and the panel
 * source lib/client/ActivityPanel.js 2407c22e... -> 247d3e3b... / 66 382 B), so the round-23 artefact
 * t143 no longer describes the shipped bytes.
 *
 *   node packages/dsh-agent-teams/tests/t149-pack.mjs --fresh [runDir]  # pack A here + pack B in a CHILD process, table, drift, install, boot
 *   node packages/dsh-agent-teams/tests/t149-pack.mjs --pack-once <dir>  # one pack into <dir>, prints its sha256/bytes/entries (used by --fresh)
 *   node packages/dsh-agent-teams/tests/t149-pack.mjs --negative  # frozen table, payload AND .tgz copy must all fail
 *   node packages/dsh-agent-teams/tests/t149-pack.mjs --analyze <dir> [tgz]  # re-score + re-hash the tarball on disk
 *
 * Exit code 0 means every check passed; 1 means at least one failed.
 */
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
const here = dirname(fileURLToPath(import.meta.url));
// This round the suite lives INSIDE the package (packages/dsh-agent-teams/tests), so the repo root is not
// one level up: walking to a fixed depth would silently point packDir, the CLI helper and the ledger at the
// wrong tree. Walk up until the shared test helper is actually there, and abort loudly if it never is.
function findRepoRoot(start) {
    let dir = start;
    for (let depth = 0; depth < 6; depth += 1) {
        if (existsSync(join(dir, 'tools', 'test', 'lib', 'dsh-cli.mjs'))) return dir;
        dir = dirname(dir);
    }
    throw new Error('repo root (tools/test/lib/dsh-cli.mjs) not found above ' + start);
}
const repoRoot = findRepoRoot(here);
const pluginDir = join(repoRoot, 'packages', 'dsh-agent-teams');
const packDir = join(pluginDir, 'tests', 'tmp', 't149');
const cli = await import(pathToFileURL(join(repoRoot, 'tools', 'test', 'lib', 'dsh-cli.mjs')).href);
const CLI = cli.DESKTOP_CLI;
const DSH_HOME = cli.DSH_HOME;

const TEST_PROFILE = process.env.DSH_TEST_PROFILE ?? 'agent-teams-pack23';
const SOURCE_PROFILE = process.env.DSH_SOURCE_PROFILE ?? 'agent-teams-test';
const PROFILE_DIR = join(DSH_HOME, 'profiles', TEST_PROFILE);
const SOURCE_PROFILE_DIR = join(DSH_HOME, 'profiles', SOURCE_PROFILE);
const INSTALL_REL = join('node_modules', '@nami', 'dsh-agent-teams');
// The 12 files that define the shipped behaviour. Drift is measured over this list, so a
// file that a later round rewrites cannot silently disagree with the tarball.
const FILES = [
    'lib/tools.js',
    'lib/members.js',
    'lib/state.js',
    'lib/snapshot.js',
    'lib/index.js',
    'lib/tool-names.js',
    'lib/client.js',
    'lib/client.js.map',
    'lib/types/members.d.ts',
    'lib/types/snapshot.d.ts',
    'lib/types/tools.d.ts',
    'lib/client/ActivityPanel.module.css',
    'package.json',
];
const REQUIRED_ENTRIES = [
    'package/lib/tools.js',
    'package/lib/members.js',
    'package/lib/client.js',
    'package/lib/client.js.map',
    'package/lib/tool-names.js',
    'package/cordis.patch.yml',
];

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const readIfExists = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const short = (buffer) => sha256(buffer).slice(0, 12);
// ------------------------------------------------------------------ tar reader
/** Minimal ustar reader: enough for what npm writes (no base-256 sizes). */
function readTarball(tgzPath) {
    const raw = gunzipSync(readFileSync(tgzPath));
    const entries = [];
    let longName;
    for (let offset = 0; offset + 512 <= raw.length;) {
        const header = raw.subarray(offset, offset + 512);
        const field = (from, to) => header.subarray(from, to).toString('utf8').replace(/\0.*$/u, '');
        const size = parseInt(field(124, 136).trim() || '0', 8);
        const typeflag = field(156, 157) || '0';
        const name = field(0, 100);
        const prefix = field(345, 500);
        const body = raw.subarray(offset + 512, offset + 512 + size);
        if (typeflag === 'L') {
            longName = body.toString('utf8').replace(/\0.*$/u, '');
            offset += 512 + Math.ceil(size / 512) * 512;
            continue;
        }
        if (typeflag === 'x' || typeflag === 'g') {
            offset += 512 + Math.ceil(size / 512) * 512;
            continue;
        }
        const fullName = longName ?? (prefix ? prefix + '/' + name : name);
        longName = undefined;
        if (fullName === '') break;
        entries.push({ name: fullName, size, typeflag, body: typeflag === '0' ? body : undefined });
        offset += 512 + Math.ceil(size / 512) * 512;
    }
    return entries;
}
// ----------------------------------------------------------------------- pack
/** Pack the current tree into destDir. Each call is a full, independent npm pack:
 *  the only *.tgz removed is the one already sitting in that same destination, so
 *  pack #1 (the artefact we ship) survives pack #2 (the determinism probe). */
function packFresh(record, destDir, recordKey) {
    mkdirSync(destDir, { recursive: true });
    for (const name of readdirSync(destDir)) {
        if (name.endsWith('.tgz')) rmSync(join(destDir, name), { force: true });
    }
    const relative = destDir === packDir ? '.' : destDir.slice(packDir.length + 1);
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['pack', '--pack-destination', destDir],
        { cwd: pluginDir, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300000 });
    record[recordKey] = {
        command: 'npm pack --pack-destination packages/dsh-agent-teams/tests/tmp/t149' + (relative === '.' ? '' : '/' + relative),
        destination: destDir,
        status: result.status,
        stdoutTail: (result.stdout ?? '').split('\n').filter(Boolean).slice(-6).join('\n'),
        stderrTail: (result.stderr ?? '').slice(-800),
    };
    const names = readdirSync(destDir).filter((name) => name.endsWith('.tgz'));
    if (names.length !== 1) return undefined;
    return join(destDir, names[0]);
}
/** One pack into <destDir> from ITS OWN process: --fresh runs this in a child to prove determinism. */
function packOnce(destDir) {
    const record = {};
    const tgzPath = packFresh(record, destDir, 'packOnce');
    const info = artifactInfo(tgzPath ?? '');
    console.log('PACK_ONCE sha256=' + info.sha256Now + ' bytes=' + info.bytesNow + ' entries=' + info.entriesNow
        + ' path=' + (tgzPath ?? '(none)') + ' npm=' + (record.packOnce?.status ?? 'n/a'));
    process.exitCode = tgzPath === undefined ? 1 : 0;
}
function newestTgzIn(dir) {
    if (!existsSync(dir)) return undefined;
    const names = readdirSync(dir).filter((name) => name.endsWith('.tgz'));
    return names.length === 0 ? undefined : join(dir, names[0]);
}
function unpackPayload(tgzPath, entries, record) {
    const payloadDir = join(packDir, 'payload');
    rmSync(payloadDir, { recursive: true, force: true });
    for (const entry of entries) {
        if (entry.body === undefined) continue;
        // Strip npm's 'package/' prefix: the payload dir then mirrors the installed package,
        // so the same relative paths (lib/tool-names.js) can be imported from both.
        const rel = entry.name.replace(/^package\//u, '');
        if (rel === entry.name) continue;
        const target = join(payloadDir, ...rel.split('/'));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, entry.body);
    }
    record.payloadDir = payloadDir;
    return payloadDir;
}
// -------------------------------------------------------------------- install
function installIntoCleanProfile(tgzPath, record) {
    const installDir = join(PROFILE_DIR, INSTALL_REL);
    rmSync(PROFILE_DIR, { recursive: true, force: true });
    mkdirSync(PROFILE_DIR, { recursive: true });
    for (const name of ['cordis.yml', 'pnpm-workspace.yaml', 'cordis.patch.yml']) {
        const from = join(SOURCE_PROFILE_DIR, name);
        if (existsSync(from)) copyFileSync(from, join(PROFILE_DIR, name));
    }
    writeFileSync(join(PROFILE_DIR, 'package.json'), JSON.stringify({
        name: 'dsh-profile-' + TEST_PROFILE,
        private: true,
        dependencies: { '@nami/dsh-agent-teams': 'file:' + tgzPath.replaceAll('\\', '/') },
        dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-headless', '@nami/dsh-agent-teams'] } },
    }, null, 2) + '\n', 'utf8');
    // --offline: any registry lookup would fail, so success proves no network was needed.
    const args = ['i', '--offline', '--no-audit', '--no-fund', '--legacy-peer-deps', tgzPath];
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args,
        { cwd: PROFILE_DIR, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300000 });
    record.npm = {
        args: args.map((item) => item.replaceAll(tgzPath, '<tarball>')),
        status: result.status,
        stdoutTail: (result.stdout ?? '').split('\n').filter(Boolean).slice(-4).join('\n'),
        stderrTail: (result.stderr ?? '').slice(-800),
    };
    const stat = existsSync(installDir) ? lstatSync(installDir) : undefined;
    const lock = JSON.parse(readIfExists(join(PROFILE_DIR, 'package-lock.json')) || '{}');
    const locked = lock.packages?.['node_modules/@nami/dsh-agent-teams'];
    record.profile = {
        dir: PROFILE_DIR,
        installDir,
        lstat: stat === undefined ? undefined : { isSymbolicLink: stat.isSymbolicLink(), isDirectory: stat.isDirectory() },
        realpath: stat === undefined ? undefined : realpathSync(installDir),
        insideProfile: stat === undefined ? false : resolve(realpathSync(installDir)).startsWith(resolve(PROFILE_DIR) + sep),
        dependencySpec: JSON.parse(readIfExists(join(PROFILE_DIR, 'package.json')) || '{}').dependencies?.['@nami/dsh-agent-teams'] ?? '',
        lockResolved: locked?.resolved ?? '',
        version: existsSync(join(installDir, 'package.json')) ? JSON.parse(readFileSync(join(installDir, 'package.json'), 'utf8')).version : undefined,
    };
    return installDir;
}
// ----------------------------------------------------------------------- boot
function psQuote(value) {
    return "'" + String(value).replaceAll("'", "''") + "'";
}

/** One headless session; the task text travels on stdin ('-'). */
function runHeadless(promptText, cwd, timeoutMs = 600000) {
    const command = '& ' + psQuote(CLI) + ' ' + psQuote('--profile') + ' ' + psQuote(TEST_PROFILE)
        + ' ' + psQuote('--json') + ' ' + psQuote('-') + '; exit $LASTEXITCODE';
    const startedAt = Date.now();
    const result = spawnSync('powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { cwd, input: promptText, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    return {
        command: 'powershell -NoProfile -Command "<desktop cli> --profile ' + TEST_PROFILE + ' --json -" < stdin(' + promptText.length + ' chars)',
        status: result.status,
        signal: result.signal,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        error: result.error === undefined ? undefined : String(result.error),
        elapsedMs: Date.now() - startedAt,
    };
}
function walk(value, visit) {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
        for (const item of value) walk(item, visit);
        return;
    }
    visit(value);
    for (const key of Object.keys(value)) walk(value[key], visit);
}

function parseStream(text) {
    const events = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('{') === false) continue;
        try {
            events.push(JSON.parse(trimmed));
        }
        catch {
            // not an event line
        }
    }
    const calls = [];
    const results = new Map();
    const sessionIds = new Set();
    for (const event of events) {
        walk(event, (node) => {
            if (typeof node.sessionId === 'string' && node.sessionId !== '') sessionIds.add(node.sessionId);
            if (typeof node.session_id === 'string' && node.session_id !== '') sessionIds.add(node.session_id);
            if (typeof node.tool === 'string' && typeof node.callId === 'string') calls.push({ callId: node.callId, tool: node.tool });
            else if (typeof node.callId === 'string' && typeof node.result === 'string') results.set(node.callId, { status: node.status, result: node.result });
        });
    }
    return { events, calls, results, sessionIds: [...sessionIds] };
}

// ------------------------------------------------------------------ verifying
function hashThreeWays(tgzDir, entries, installDir) {
    const payload = new Map(entries.filter((entry) => entry.name.startsWith('package/') && entry.body !== undefined)
        .map((entry) => [entry.name.slice('package/'.length), entry.body]));
    return THREE_WAY_FILES.map((rel) => {
        const fromPayload = payload.get(rel);
        const installedPath = join(installDir, ...rel.split('/'));
        const fromInstalled = existsSync(installedPath) ? readFileSync(installedPath) : undefined;
        const sourcePath = join(pluginDir, ...rel.split('/'));
        const fromSource = existsSync(sourcePath) ? readFileSync(sourcePath) : undefined;
        const hashes = {
            payload: fromPayload === undefined ? 'MISSING' : sha256(fromPayload),
            installed: fromInstalled === undefined ? 'MISSING' : sha256(fromInstalled),
            source: fromSource === undefined ? 'MISSING' : sha256(fromSource),
        };
        return {
            file: rel,
            ...hashes,
            bytes: { payload: fromPayload?.length ?? 0, installed: fromInstalled?.length ?? 0, source: fromSource?.length ?? 0 },
            same: hashes.payload.length === 64 && hashes.installed.length === 64 && hashes.source.length === 64
                && hashes.payload === hashes.installed && hashes.installed === hashes.source,
        };
    });
}
function tarListing(tgzPath) {
    const result = spawnSync('tar', ['-tzf', tgzPath], { encoding: 'utf8', timeout: 120000 });
    if (result.status !== 0 || typeof result.stdout !== 'string') return { available: false, names: [] };
    // Windows tar writes CRLF: strip the carriage return before comparing (t29 lesson).
    return { available: true, names: result.stdout.split('\n').map((line) => line.replace(/\r$/u, '')).filter(Boolean) };
}
/** sha256 + size of the 10 release files, taken at one instant. */
function driftSnapshot() {
    const files = FILES.map((rel) => {
        const path = join(pluginDir, ...rel.split('/'));
        const present = existsSync(path);
        const buffer = present ? readFileSync(path) : undefined;
        return { file: rel, sha256: buffer === undefined ? 'MISSING' : sha256(buffer), bytes: buffer?.length ?? 0 };
    });
    return { at: new Date().toISOString(), files };
}

function driftBetween(before, after) {
    const changed = before.files
        .filter((item) => {
            const now = after.files.find((other) => other.file === item.file);
            return now === undefined || now.sha256 !== item.sha256 || now.bytes !== item.bytes;
        })
        .map((item) => item.file);
    const missing = after.files.filter((item) => before.files.every((other) => other.file !== item.file)).map((item) => item.file);
    return { drift: changed.length + missing.length, changed: [...changed, ...missing] };
}
// --------------------------------------------------------------- export asserts
const EXPECTED_EXPORTS = {
    'tools.js': ['registerAgentTeamsTools'],
    'members.js': ['activateMemberNow', 'setMemberRoute', 'setMemberProfile', 'routeOf', 'recordAutoFallback',
        'isFallbackFailureCode', 'selectFallbackRoute', 'selectionFromMember'],
    'state.js': ['readTeam', 'writeTeam', 'readTeamSync'],
    'snapshot.js': ['assembleTeamSnapshot', 'collectTeamsActivity', 'collectArchivedTeamsActivity', 'memberModelRoute'],
    'tool-names.js': ['TEAM_TOOL_NAMES', 'MEMBER_TOOL_NAMES', 'CAPTAIN_TOOL_NAMES'],
};

/** Import a shipped module in a child process and ASSERT which NAMED exports exist.
 *
 *  V11-F3 (audit round 11) was this function: the child called process.exit(0) on BOTH branches, so
 *  an import that threw still looked like a clean probe and no missing export could ever fail it.
 *  The contract is now:
 *    - child exits 0 ONLY when every requested name is present,
 *    - child exits 1 when a requested name is missing (rows + 'missing named export' on stderr),
 *    - child exits 2 when the import itself threw (all rows false + the error on stderr),
 *  and the parent records 'status' on every row so score()/printVerdict can show the real exit code.
 *  extraNames injects names that do not exist; the SELF_MUTATION control uses that to prove the
 *  probe is capable of failing at all (nothing is written to disk to do it). */
function assertExports(libDir, extraNames = []) {
    const rows = [];
    for (const [file, names] of Object.entries(EXPECTED_EXPORTS)) {
        const want = names.concat(extraNames);
        const url = pathToFileURL(join(libDir, file)).href;
        const code = 'const want=' + JSON.stringify(want) + ';import(' + JSON.stringify(url) + ').then((m)=>{'
            + 'const rows=want.map((n)=>[n,typeof m[n]!=="undefined"]);'
            + 'console.log(JSON.stringify(rows));'
            + 'const missing=rows.filter((r)=>r[1]!==true).map((r)=>r[0]);'
            + 'if(missing.length>0){console.error("missing named export: "+missing.join(","));process.exit(1);}'
            + 'process.exit(0);},'
            + '(e)=>{console.error(e.name+": "+String(e.message).slice(0,140));'
            + 'console.log(JSON.stringify(want.map((n)=>[n,false])));process.exit(2);});';
        const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 120000 });
        const lastLine = (run.stdout ?? '').trim().split('\n').filter(Boolean).pop() ?? '';
        const stderrFirst = (run.stderr ?? '').split('\n').filter(Boolean)[0] ?? '';
        let parsed;
        try {
            parsed = JSON.parse(lastLine);
        }
        catch {
            parsed = { error: 'khong doc duoc ket qua con (exit=' + run.status + '): ' + lastLine.slice(0, 120) };
        }
        if (Array.isArray(parsed)) {
            for (const pair of parsed) {
                rows.push({ module: file, name: pair[0], ok: pair[1] === true,
                    error: pair[1] === true ? '' : (stderrFirst || 'missing'), status: run.status });
            }
        }
        else {
            for (const name of names) {
                rows.push({ module: file, name, ok: false, error: parsed.error ?? 'import that bai', status: run.status });
            }
        }
    }
    return rows;
}

/** SELF_MUTATION control for V11-F3: ask the probe for one export that cannot exist. A probe that
 *  can fail must come back with a non-zero child exit on EVERY module; a probe whose child always
 *  exits 0 reports 'not caught' and the run fails. The mutation lives in memory only. */
const SELF_MUTATION_MARKER = '__t149_self_mutation_marker__';
function selfMutationProbe(libDir) {
    const rows = assertExports(libDir, [SELF_MUTATION_MARKER]);
    const markerRows = rows.filter((row) => row.name === SELF_MUTATION_MARKER);
    const exitCodes = markerRows.map((row) => row.status);
    const caught = markerRows.length > 0 && markerRows.every((row) => row.ok === false)
        && exitCodes.every((code) => typeof code === 'number' && code !== 0);
    const detail = 'marker rows=' + markerRows.length + ' ok=false=' + markerRows.filter((row) => row.ok === false).length;
    console.log('SELF_MUTATION: ' + (caught ? 'caught exit=' + exitCodes.join(',') : 'NOT caught exit=' + exitCodes.join(',') + ' (' + detail + ')'));
    return { marker: SELF_MUTATION_MARKER, caught, exitCodes, rows: markerRows, detail };
}

// ------------------------------------------------------------------ frozen table
// Round 24, measured at HEAD after t148 tied the dependency column height to the member column. THREE
// rows moved since round 23: lib/client.js (7dca20dd... -> 44911f22... / 258 790 -> 260 704 B),
// lib/client.js.map (173b684f... -> a6b7d7b7... / 405 349 -> 408 920 B) and
// lib/client/ActivityPanel.module.css (7ea5190c... -> b6d8a2f5... / 52 045 -> 52 216 B). The panel
// SOURCE also moved (lib/client/ActivityPanel.js 2407c22e... -> 247d3e3b... / 66 382 B) and is the
// 14th row of the three-way table; lib/client/WorkspaceActivity.module.css did NOT change this round
// and is reported separately.
// Every row is re-measured from disk at run time: a mismatch means another writer touched the tree,
// which is a STOP condition and never something to paper over.
const FROZEN_MEASURED_AT = '2026-11-01T08:53:49.289Z';
const FROZEN = {
    'lib/tools.js': { sha16: 'e51734baf4693cd3', bytes: 213715 },
    'lib/members.js': { sha16: '50f558f8b207d874', bytes: 102260 },
    'lib/state.js': { sha16: '56664c59ff400319', bytes: 57508 },
    'lib/snapshot.js': { sha16: 'a2a87e1b0c0b34ea', bytes: 13986 },
    'lib/index.js': { sha16: '2d28e617f0683e42', bytes: 45315 },
    'lib/tool-names.js': { sha16: 'e3def5db908dcbd5', bytes: 808 },
    'lib/client.js': { sha16: '44911f22c6431523', bytes: 260704 },
    'lib/client.js.map': { sha16: 'a6b7d7b7ec4c4528', bytes: 408920 },
    'lib/types/members.d.ts': { sha16: 'c53250ab41bff8c3', bytes: 31769 },
    'lib/types/snapshot.d.ts': { sha16: '962f99a7bcb18b94', bytes: 7627 },
    'lib/types/tools.d.ts': { sha16: '41cfc56576ed8ffd', bytes: 7546 },
    'lib/client/ActivityPanel.module.css': { sha16: 'b6d8a2f53b80afb6', bytes: 52216 },
    'package.json': { sha16: '92a6404071e457cc', bytes: 10498 },
};
// The round-23 table is kept ONLY so this suite can prove WHICH rows the round-24 release moved:
// exactly three (client.js, client.js.map, ActivityPanel.module.css) and nothing else. It is never
// used as the frozen table itself.
const FROZEN_ROUND23 = {
    'lib/tools.js': { sha16: 'e51734baf4693cd3', bytes: 213715 },
    'lib/members.js': { sha16: '50f558f8b207d874', bytes: 102260 },
    'lib/state.js': { sha16: '56664c59ff400319', bytes: 57508 },
    'lib/snapshot.js': { sha16: 'a2a87e1b0c0b34ea', bytes: 13986 },
    'lib/index.js': { sha16: '2d28e617f0683e42', bytes: 45315 },
    'lib/tool-names.js': { sha16: 'e3def5db908dcbd5', bytes: 808 },
    'lib/client.js': { sha16: '7dca20dd1edf2c66', bytes: 258790 },
    'lib/client.js.map': { sha16: '173b684f1a6a569c', bytes: 405349 },
    'lib/types/members.d.ts': { sha16: 'c53250ab41bff8c3', bytes: 31769 },
    'lib/types/snapshot.d.ts': { sha16: '962f99a7bcb18b94', bytes: 7627 },
    'lib/types/tools.d.ts': { sha16: '41cfc56576ed8ffd', bytes: 7546 },
    'lib/client/ActivityPanel.module.css': { sha16: '7ea5190c7d978556', bytes: 52045 },
    'package.json': { sha16: '92a6404071e457cc', bytes: 10498 },
};
// The shipped panel SOURCE lives under lib/client/ and IS inside the tarball, so the three-way
// comparison covers it as a FOURTEENTH row even though the frozen table has thirteen entries.
const EXTRA_FILES = ['lib/client/ActivityPanel.js'];
const THREE_WAY_FILES = [...FILES, ...EXTRA_FILES];
// Reported in the verdict but NOT part of the 14-row three-way count (the card fixes that at 14): the
// second CSS module t142 changed. It did not move in round 24, so its row must read SAME.
const REPORT_ONLY_FILES = ['lib/client/WorkspaceActivity.module.css'];
const EXPECTED_ENTRIES_TOTAL = 133;
const JUNK_RULES = [
    { label: 'node_modules', hit: (name) => name.includes('node_modules/') },
    { label: 'package/tests', hit: (name) => name.startsWith('package/tests/') },
    { label: 'nested .tgz', hit: (name) => name.endsWith('.tgz') },
    { label: '.pid', hit: (name) => name.endsWith('.pid') },
    { label: 'tools', hit: (name) => name === 'package/tools' || name.startsWith('package/tools/') },
];
// A drive-letter path with a second separator, anchored so a URL such as 'http://x' cannot match
// (the round-11 lesson: the naive /[A-Za-z]:[\\/]/ test fired on 'p:/').
const ABS_PATH_RE = /(?:^|[\s"'(=,:])[A-Za-z]:[\\/][A-Za-z0-9_. -]{2,}[\\/]|[A-Za-z]:[\\/]Project[\\/]Agent-Team|[A-Za-z]:[\\/]Users[\\/]|[A-Za-z]:[\\/]dsh[\\/]/;
// Every earlier pack round pins the SOURCE hashes of ITS OWN round, so those suites are red against
// today tree by design (tests/t118-pack.mjs and tools/sweep-suites.mjs already carry them as LEGACY).
// Round 22 names them so a reviewer can tell "expected red" from "broken": nothing here is edited.
const LEGACY_PACK_SUITES = [
    { suite: 'tests/t35-pack-repack.mjs', line: 39, pin: 'lib/tools.js 7fde7bbc49db1ba6' },
    { suite: 'tests/t84-pack.mjs', line: 51, pin: 'lib/tools.js 75800e15fce2abf6' },
    { suite: 'tests/t88-pack.mjs', line: 57, pin: 'lib/tools.js 9be217b1669a2241' },
    { suite: 'tests/t92-pack.mjs', line: 57, pin: 'lib/tools.js a9ad29f8ae87a884' },
    { suite: 'tests/t96-pack.mjs', line: 57, pin: 'lib/tools.js 6150b7b287cb815d' },
    { suite: 'tests/t100-pack.mjs', line: 57, pin: 'lib/tools.js 5deb03ca93b2a8e9' },
    { suite: 'tests/t104-pack.mjs', line: 58, pin: 'lib/tools.js 5deb03ca93b2a8e9' },
    { suite: 'tests/t108-pack.mjs', line: 59, pin: 'lib/tools.js d402c6586df1e140' },
    { suite: 'tests/t111-pack.mjs', line: 79, pin: 'lib/client.js.map bbf88608f54e966f' },
    { suite: 'packages/dsh-agent-teams/tests/t121-pack.mjs', line: 380, pin: 'lib/client.js.map bbf88608f54e966f' },
    { suite: 'packages/dsh-agent-teams/tests/t130-pack.mjs', line: 395, pin: 'lib/client.js.map 1f1d15524bcd3caa' },
    { suite: 'packages/dsh-agent-teams/tests/t135-pack.mjs', line: 399, pin: 'lib/client.js.map 5024364fefe8b73e' },
    { suite: 'packages/dsh-agent-teams/tests/t140-pack.mjs', line: 399, pin: 'lib/client.js.map b1693659959056b0' },
    { suite: 'packages/dsh-agent-teams/tests/t143-pack.mjs', line: 406, pin: 'lib/client.js.map 173b684f1a6a569c' },
    { suite: 'tests/t118-pack.mjs', line: 65, pin: 'lib/client.js.map bbf88608f54e966f' },
    { suite: 'tests/t126-released-bytes-boot.mjs', line: 53, pin: 'lib/client.js.map bbf88608f54e966f' },
];

// --------------------------------------------------------------- measurement
/** Read the 13 shipped files straight off disk: the only trustworthy source for drift. */
function measureFiles(list) {
    return list.map((rel) => {
        const path = join(pluginDir, ...rel.split('/'));
        const present = existsSync(path);
        const buffer = present ? readFileSync(path) : undefined;
        return { file: rel, sha256: buffer === undefined ? 'MISSING' : sha256(buffer), bytes: buffer === undefined ? 0 : buffer.length };
    });
}



/** Same measurement, but from an arbitrary root (the unpacked payload copy). Kept separate from
 *  measureFiles so the --fresh code path stays exactly the one its evidence log was produced with. */
function measureFromRoot(root) {
    return FILES.map((rel) => {
        const path = join(root, ...rel.split('/'));
        const present = existsSync(path);
        const buffer = present ? readFileSync(path) : undefined;
        return { file: rel, sha256: buffer === undefined ? 'MISSING' : sha256(buffer), bytes: buffer === undefined ? 0 : buffer.length };
    });
}

/** Compare a fresh measurement against the frozen table, keeping both byte counts and the delta. */
function compareFrozen(measured, table) {
    return measured.map((row) => {
        const want = table[row.file];
        const bytesFrozen = want === undefined ? -1 : want.bytes;
        const shaFrozen = want === undefined ? 'MISSING' : want.sha16;
        const shaActual = row.sha256 === 'MISSING' ? 'MISSING' : row.sha256.slice(0, 16);
        const applies = bytesFrozen === row.bytes;
        const shaApplies = shaFrozen === shaActual;
        return { file: row.file, shaFrozen, shaActual, bytesFrozen, bytesActual: row.bytes,
            delta: row.bytes - bytesFrozen, applies, shaApplies, ok: applies && shaApplies };
    });
}

function diffLines(rows) {
    return rows.filter((row) => row.ok !== true).map((row) => 'DIFF ' + row.file + ' [frozen] applies=' + row.applies
        + ' shaApplies=' + row.shaApplies + ' bytesFrozen=' + row.bytesFrozen + ' bytesActual=' + row.bytesActual
        + ' delta=' + (row.delta >= 0 ? '+' : '') + row.delta + ' shaFrozen=' + row.shaFrozen + ' shaActual=' + row.shaActual);
}

function frozenTableText(rows) {
    return rows.map((row) => (row.ok === true ? 'ok   ' : 'DIFF ') + row.file.padEnd(34)
        + row.shaActual.padEnd(18) + String(row.bytesActual).padStart(7)
        + '  frozen ' + row.shaFrozen.padEnd(18) + String(row.bytesFrozen).padStart(7)
        + (row.ok === true ? '' : '  delta ' + (row.delta >= 0 ? '+' : '') + row.delta));
}

// ------------------------------------------------------------------- artifact
/** Hash the tarball that is actually on disk right now; never trust a recorded number. */
function artifactInfo(tgzPath) {
    if (tgzPath === '' || !existsSync(tgzPath)) return { path: tgzPath, sha256Now: '', bytesNow: 0, entriesNow: 0, readError: '' };
    const bytes = readFileSync(tgzPath);
    // A tarball that no longer decompresses must score as a FAILED check, not crash the scorer: the
    // round-20 negative control deliberately hands this function a byte-flipped copy of the artefact.
    let entriesNow = 0;
    let readError = '';
    try { entriesNow = readTarball(tgzPath).length; }
    catch (error) { readError = String(error.message); }
    return { path: tgzPath, sha256Now: sha256(bytes), bytesNow: bytes.length, entriesNow, readError };
}

function tarAudit(tgzPath, entries) {
    const listing = tarListing(tgzPath);
    const names = listing.names;
    const dirs = entries.filter((entry) => entry.typeflag === '5' || entry.typeflag === '1').map((entry) => entry.name);
    const requiredMissing = REQUIRED_ENTRIES.filter((name) => names.includes(name) !== true);
    const junk = [];
    for (const name of names) for (const rule of JUNK_RULES) if (rule.hit(name)) junk.push(rule.label + ':' + name);
    const absPaths = names.filter((name) => ABS_PATH_RE.test(name));
    return { available: listing.available, total: names.length, dirEntries: dirs.length, dirNames: dirs,
        requiredMissing, junk, absPaths };
}

// ------------------------------------------- whole payload, panel order, bundle hashes
// Round 20 shipped a NEW client bundle while keeping both client files at their old byte count, so a
// table of sizes alone can prove nothing: these helpers compare CONTENT (sha256 of every payload file,
// the ORDER of the three panel markers inside the installed bundle, and the bundle hashes themselves).
function payloadScan(entries) {
    const rows = [];
    let compared = 0;
    let skipped = 0;
    let fileEntries = 0;
    for (const entry of entries) {
        if (entry.body === undefined) continue;
        const rel = entry.name.replace(/^package\//u, '');
        if (rel === entry.name) continue;
        fileEntries += 1;
        const sourcePath = join(pluginDir, ...rel.split('/'));
        if (!existsSync(sourcePath)) { skipped += 1; rows.push({ file: rel, kind: 'not-in-source' }); continue; }
        const shipped = sha256(entry.body);
        const source = sha256(readFileSync(sourcePath));
        compared += 1;
        if (shipped !== source) rows.push({ file: rel, kind: 'sha-differs', shipped, source });
    }
    return { available: fileEntries > 0, fileEntries, compared, skipped, diff: rows };
}
// Round 23 ships the THREE-BLOCK panel (t142): the team section is a grid split 1:2, its left cell
// holds the captain cell + add-member control + member list, and DependencyMap is a SIBLING element
// in the section children — not a child of a wrapper column div. The round-22 layout markers (the
// data-panel-columns grid attribute and the panelColumns / panelColumnAside classes) must be GONE
// from the source, from the CSS and from the installed bundle.
// Every offset here is a BYTE offset inside the installed lib/client.js, so a reviewer can open the
// file at exactly that byte instead of trusting a character index (the file is not pure ASCII).
const LAYOUT_PRESENT = [
    { label: 'grid 1:2 minmax(280px,1fr) minmax(0,2fr)', re: /minmax\(280px,1fr\) minmax\(0,2fr\)/gu, min: 1, max: 1 },
    { label: 'grid selector [data-workspace-team]', re: /data-workspace-team(?=["'])/gu, min: 1, max: -1 },
    // Round 24 (t148): the dependency column copies the member column height through this variable.
    { label: 'CSS variable --member-column-height', re: /--member-column-height/gu, min: 1, max: -1 },
    { label: 'rule height:var(--member-column-height,auto)', re: /height:var\(--member-column-height,auto\)/gu, min: 1, max: 1 },
    { label: 'cap max-height:var(--member-column-height,56vh)', re: /max-height:var\(--member-column-height,56vh\)/gu, min: 1, max: 1 },
];
const LAYOUT_ABSENT = [
    { label: 'data-panel-columns', re: /data-panel-columns/gu },
    { label: 'panelColumns', re: /panelColumns/gu },
    { label: 'panelColumnAside', re: /panelColumnAside/gu },
];
const DEPENDENCY_CALL_RE = /DependencyMap, \{/gu;
/** All match offsets of a global regex, restarting from index 0. */
function markerOffsets(text, re) {
    const out = [];
    re.lastIndex = 0;
    let hit = re.exec(text);
    while (hit !== null) { out.push(hit.index); re.lastIndex = hit.index + 1; hit = re.exec(text); }
    return out;
}
function layoutProof(installDir) {
    const bundlePath = join(installDir, 'lib', 'client.js');
    if (!existsSync(bundlePath)) return { available: false, ok: false, detail: 'installed lib/client.js missing', present: [], absent: [], sourceRows: [] };
    const buffer = readFileSync(bundlePath);
    const text = buffer.toString('utf8');
    const byteOf = (index) => Buffer.byteLength(text.slice(0, index), 'utf8');
    const present = LAYOUT_PRESENT.map((marker) => {
        const found = markerOffsets(text, marker.re);
        const ok = found.length >= marker.min && (marker.max === -1 || found.length <= marker.max);
        return { label: marker.label, count: found.length, offset: found.length === 0 ? -1 : byteOf(found[0]), ok };
    });
    const absent = LAYOUT_ABSENT.map((marker) => {
        const found = markerOffsets(text, marker.re);
        return { label: marker.label, count: found.length, ok: found.length === 0 };
    });
    const calls = markerOffsets(text, DEPENDENCY_CALL_RE);
    const callIndex = calls.length === 0 ? -1 : calls[calls.length - 1];
    const tail = callIndex === -1 ? '' : text.slice(Math.max(0, callIndex - 200), callIndex);
    const lastClose = tail.lastIndexOf('}), ');
    const after = lastClose === -1 ? '' : tail.slice(lastClose + 4);
    // A SIBLING call follows the close of the element before it ('}), ') with nothing but the jsx call
    // wrapper in between; a column CHILD would instead appear right after 'children: ['. Those two
    // facts are what separate "sibling in the section children" from "inside a wrapper column div".
    const siblingClose = /^\(0, [A-Za-z0-9_$.]+\)\($/u.test(after);
    const wrapped = after.includes('children:');
    const dependency = {
        name: 'DependencyMap',
        count: calls.length,
        offset: callIndex === -1 ? -1 : byteOf(callIndex),
        excerpt: callIndex === -1 ? '' : text.slice(Math.max(0, callIndex - 200), callIndex + 140),
        after, siblingClose, wrapped,
        ok: callIndex !== -1 && siblingClose && !wrapped,
    };
    const sourceRows = ['lib/client/ActivityPanel.js', 'lib/client/ActivityPanel.module.css'].map((rel) => {
        const sourceText = readFileSync(join(pluginDir, ...rel.split('/')), 'utf8');
        const counts = LAYOUT_ABSENT.map((marker) => ({ label: marker.label, count: (sourceText.match(marker.re) ?? []).length }));
        const bad = counts.filter((row) => row.count !== 0);
        return { file: rel, counts, ok: bad.length === 0, detail: counts.map((row) => row.label + '=x' + row.count).join(' ') };
    });
    // The SOURCE says the same thing in one line a human can read: DependencyMap is called right after
    // the delegation section closes, i.e. it is a sibling in the same children array.
    const panelSource = readFileSync(join(pluginDir, 'lib', 'client', 'ActivityPanel.js'), 'utf8');
    const sourceSibling = /\] \}\)\] \}\), _jsx\(DependencyMap, \{/u.test(panelSource);
    const ok = present.every((row) => row.ok) && absent.every((row) => row.ok) && dependency.ok
        && sourceRows.every((row) => row.ok) && sourceSibling;
    const detail = 'grid 1:2@' + present[0].offset + ' (x' + present[0].count + ')'
        + ' | ' + present[1].label + '@' + present[1].offset + ' (x' + present[1].count + ')'
        + ' | ' + absent.map((row) => row.label + '=x' + row.count).join(' ')
        + ' | DependencyMap@' + dependency.offset + ' (x' + dependency.count + ', siblingClose=' + siblingClose + ', wrapped=' + wrapped + ')'
        + ' | sourceSibling=' + sourceSibling
        + ' | nguon: ' + sourceRows.map((row) => row.file + ' -> ' + row.detail).join(' ; ')
        + ' | bundle ' + buffer.length + ' B';
    return { available: true, ok, present, absent, dependency, sourceRows, sourceSibling, detail, length: buffer.length };
}
function bundleHashes(sourceRoot, installDir) {
    return ['lib/client.js', 'lib/client.js.map'].map((rel) => {
        const sourceBytes = readFileSync(join(sourceRoot, ...rel.split('/')));
        const installedPath = join(installDir, ...rel.split('/'));
        const installedBytes = existsSync(installedPath) ? readFileSync(installedPath) : undefined;
        const source = { sha256: sha256(sourceBytes), bytes: sourceBytes.length };
        const installed = installedBytes === undefined ? { sha256: 'MISSING', bytes: 0 } : { sha256: sha256(installedBytes), bytes: installedBytes.length };
        return { file: rel, source, installed, same: installed.sha256 === source.sha256 && installed.bytes === source.bytes };
    });
}
// Reported separately, never part of the frozen table or of the 14-row three-way count.
function extraHashes() {
    return REPORT_ONLY_FILES.map((rel) => {
        const path = join(pluginDir, ...rel.split('/'));
        const bytes = existsSync(path) ? readFileSync(path) : undefined;
        return { file: rel, sha256: bytes === undefined ? 'MISSING' : sha256(bytes), bytes: bytes === undefined ? 0 : bytes.length };
    });
}
function newestPackTgz(runDir) {
    const packADir = join(runDir, 'pack-a');
    if (!existsSync(packADir)) return undefined;
    const names = readdirSync(packADir).filter((name) => name.endsWith('.tgz'));
    return names.length === 0 ? undefined : join(packADir, names[0]);
}
function tgzFlip(runDir, tgzPath) {
    const flipDir = join(packDir, 'tgz-flip');
    rmSync(flipDir, { recursive: true, force: true });
    mkdirSync(flipDir, { recursive: true });
    const name = tgzPath.split(/[\\/]/u).pop();
    const copyPath = join(flipDir, 'flipped-' + name);
    const originalBytes = readFileSync(tgzPath);
    const flipped = Buffer.from(originalBytes);
    // Offset 5 is inside the gzip MTIME field: the archive still decompresses, so the child really does
    // read a tarball whose bytes and sha256 differ from the packed artefact instead of failing to open it.
    flipped[5] = flipped[5] ^ 0xff;
    writeFileSync(copyPath, flipped);
    const runChild = (extra) => {
        const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--analyze', runDir, ...extra],
            { cwd: repoRoot, encoding: 'utf8', timeout: 240000 });
        const lines = (result.stdout ?? '').split('\n');
        return {
            exit: result.status,
            failLine: lines.find((line) => /^FAIL\s+A\d/u.test(line)) ?? '',
            shaLine: lines.filter((line) => line.includes('sha256Now=')).slice(-1)[0] ?? '',
            tail: lines.filter(Boolean).slice(-1)[0] ?? '',
        };
    };
    const copy = runChild([copyPath]);
    const original = runChild([]);
    const flippedSha = sha256(flipped);
    const caught = copy.exit === 1 && original.exit === 0 && copy.failLine !== '' && flippedSha !== sha256(originalBytes);
    const result = {
        available: true, caught, copyExit: copy.exit, originalExit: original.exit,
        flippedOffset: 5, bytesSame: flipped.length === originalBytes.length,
        originalSha: sha256(originalBytes), flippedSha, failLine: copy.failLine, copyShaLine: copy.shaLine,
    };
    console.log('TGZ_FLIP: copyExit=' + result.copyExit + ' originalExit=' + result.originalExit + ' caught=' + result.caught
        + ' offset=' + result.flippedOffset + ' bytesSame=' + result.bytesSame
        + ' tongBytesLech=' + (flipped.length - originalBytes.length) + ' byte'
        + ' sha=' + result.originalSha.slice(0, 16) + ' -> ' + result.flippedSha.slice(0, 16));
    console.log('TGZ_FLIP child: ' + (result.failLine || '(khong thay dong FAIL)') + ' | ' + (result.copyShaLine || '(khong thay sha256Now)'));
    rmSync(flipDir, { recursive: true, force: true });
    return result;
}
// ------------------------------------------------------------- other suites
/** Run one suite from the repo with the plain node binary and keep its summary line. */
function runNodeSuite(relPath, args) {
    const target = join(repoRoot, ...relPath.split('/'));
    if (!existsSync(target)) return { command: 'node ' + relPath + ' ' + args.join(' '), exit: null, summary: '', tail: 'MISSING file ' + target };
    const result = spawnSync(process.execPath, [target, ...args], { cwd: repoRoot, encoding: 'utf8', timeout: 300000 });
    const out = (result.stdout ?? '').split('\n');
    const summary = out.filter((line) => /SUMMARY|verdict/u.test(line)).slice(0, 3).join(' | ');
    return { command: 'node ' + relPath + ' ' + args.join(' '), exit: result.status,
        summary, tail: out.filter(Boolean).slice(-6).join('\n') };
}
// ----------------------------------------------------------------------- boot
// The witness for round 24: the SHIPPED bytes must print both counts, the removed block and the
// findings trace. The team is built by the shipped tools themselves, so the render, the store and the
// guards are all exercised; nothing is hand-written into the state directory.
const bootPrompt = 'You are checking a freshly installed plugin. Do exactly these steps, in this order, once each. '
    + '1) Call agent_teams_create with arguments {"name":"t149probe","description":"round 24 release probe","approval":"required","plan":{"members":[{"name":"alice","role":"researcher","provider":"opencode-go","model":"kimi-k2.7-code"},{"name":"bob","role":"qa","provider":"opencode-go","model":"deepseek-v4.1-flash"}],"tasks":[]}}. '
    + '2) Call agent_teams_remove_member with arguments {"name":"bob"} (the team then has exactly one active and one removed member). '
    + '3) Call agent_teams_status with an empty arguments object. Do not skip this call: its text is checked. '
    + '4) Call agent_teams_edit_plan with arguments {"operations":[{"action":"add_task","subject":"probe task","assignee":"captain"}]}. '
    + '5) Call agent_teams_update_task on the task id shown in the step-4 result (usually t1) with arguments {"task_id":"<id from step 4>","findings":[{"id":"F1","severity":"low","problem":"probe problem","requiredFix":"probe fix"}]}. If the id differs from t1, use the exact id from step 4. '
    + '6) Call agent_teams_status AGAIN with an empty arguments object. Do not skip this call: it must show the findings count. '
    + 'A step may fail; that is expected and is part of the check: do not retry anything except using the real task id in step 5, do not approve the plan, do not fix anything. '
    + 'Then reply with a single line in this exact form and nothing else: '
    + 'PROBE created=<yes or no> removed=<yes or no> plan=<yes or no> findings=<yes or no> err5=<the exact error text of step 5, or none>';

function statusTextsOf(stream) {
    const texts = [];
    for (const call of stream.calls) {
        if (call.tool.includes('agent_teams_status') !== true) continue;
        const result = stream.results.get(call.callId);
        if (result !== undefined && typeof result.result === 'string') texts.push(result.result);
    }
    return texts;
}

function firstLineMatching(textValue, pattern) {
    for (const line of String(textValue).split('\n')) if (pattern.test(line)) return line;
    return '';
}

// ---------------------------------------------------------------------- modes
function runNegative() {
    console.log('=== t149 --negative: bang FROZEN, payload VA ban copy .tgz deu phai bat duoc ===');
    const measured = measureFiles(FILES);
    const clean = compareFrozen(measured, FROZEN);
    const cleanBad = clean.filter((row) => row.ok !== true);
    console.log('CLEAN: ' + (FILES.length - cleanBad.length) + '/' + FILES.length + ' khop bang FROZEN => exit 0');
    for (const line of diffLines(clean)) console.log(line);

    const bytesMutated = JSON.parse(JSON.stringify(FROZEN));
    bytesMutated['lib/tools.js'].bytes += 1;
    const bytesRows = compareFrozen(measured, bytesMutated);
    const bytesBad = bytesRows.filter((row) => row.ok !== true);
    console.log('MUTATION bytes: lat 1 byte cua lib/tools.js trong bang (trong bo nho, khong cham dia)');
    for (const line of diffLines(bytesRows)) console.log(line);

    const shaMutated = JSON.parse(JSON.stringify(FROZEN));
    shaMutated['lib/members.js'].sha16 = 'ffffffffffffffff';
    const shaRows = compareFrozen(measured, shaMutated);
    const shaBad = shaRows.filter((row) => row.ok !== true);
    console.log('MUTATION sha: doi 16 hex cua lib/members.js trong bang');
    for (const line of diffLines(shaRows)) console.log(line);

    const bytesCaught = bytesBad.length === 1 && bytesBad[0].file === 'lib/tools.js'
        && bytesBad[0].applies === false && bytesBad[0].delta === -1;
    const shaCaught = shaBad.length === 1 && shaBad[0].file === 'lib/members.js' && shaBad[0].shaApplies === false;
    const cleanOk = cleanBad.length === 0;

    // A mutation on the ARTEFACT side, which is the shape tests/t118-pack.mjs used: unpack the shipped
    // tarball into tests/tmp/t149/payload (never beside the sources), flip one byte, and re-score the copy.
    // Here the row differs in BOTH size and sha, so the DIFF line keeps applies=<the mutation applies>=true
    // and carries the byte delta, which is what the card asks to see.
    const newestRun = latestRunDir(packDir);
    const payloadTgz = newestRun === undefined ? undefined
        : readdirSync(join(newestRun, 'pack-a')).filter((name) => name.endsWith('.tgz')).map((name) => join(newestRun, 'pack-a', name))[0];
    let payloadBranch = { available: payloadTgz !== undefined, caught: false, lines: [] };
    if (payloadTgz !== undefined) {
        const payloadEntries = readTarball(payloadTgz);
        const payloadDir = unpackPayload(payloadTgz, payloadEntries, {});
        const victim = join(payloadDir, 'lib', 'state.js');
        writeFileSync(victim, Buffer.concat([readFileSync(victim), Buffer.from('!', 'ascii')]));
        const payloadRows = compareFrozen(measureFromRoot(payloadDir), FROZEN);
        const payloadBad = payloadRows.filter((row) => row.ok !== true);
        payloadBranch.lines = payloadBad.map((row) => 'DIFF ' + row.file + ' [payload] applies=' + (row.bytesActual !== row.bytesFrozen)
            + ' bytesFrozen=' + row.bytesFrozen + ' bytesActual=' + row.bytesActual
            + ' delta=' + (row.delta >= 0 ? '+' : '') + row.delta
            + ' shaFrozen=' + row.shaFrozen + ' shaActual=' + row.shaActual);
        payloadBranch.caught = payloadBad.length === 1 && payloadBad[0].file === 'lib/state.js'
            && payloadBad[0].delta === 1 && payloadBad[0].bytesActual !== payloadBad[0].bytesFrozen;
        for (const line of payloadBranch.lines) console.log(line);
        rmSync(payloadDir, { recursive: true, force: true });
    }
    console.log('PAYLOAD_MUTATION: available=' + payloadBranch.available + ' caught=' + payloadBranch.caught);

    // Round-20 control: flip ONE byte of a COPY of the shipped .tgz (never the artefact itself) and let a
    // child of this very file score that copy. The copy keeps its length, so only the sha256 and the
    // tarball check can catch it — which is exactly the gap the round-19 review found.
    const flipTgz = newestRun === undefined ? undefined : newestPackTgz(newestRun);
    const flip = flipTgz === undefined || newestRun === undefined
        ? { available: false, caught: false, copyExit: 'n/a', originalExit: 'n/a' }
        : tgzFlip(newestRun, flipTgz);
    if (flip.available === false) console.log('TGZ_FLIP: khong tim thay tarball trong run moi nhat cua ' + packDir);

    // The in-memory comparison above shows the DIFF text; a reviewer also wants the EXIT CODES of two
    // real processes: the clean table must exit 0 and the 1-byte-flipped table must exit 1. Both tables
    // are written under tests/tmp/t149 (never beside the sources) and a child of this very file scores them.
    const probeClean = join(packDir, 'frozen-clean.json');
    const probeMutated = join(packDir, 'frozen-mutated.json');
    writeFileSync(probeClean, JSON.stringify(FROZEN, null, 2), 'utf8');
    writeFileSync(probeMutated, JSON.stringify(bytesMutated, null, 2), 'utf8');
    const runProbe = (tablePath) => {
        const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--negative-probe', tablePath],
            { cwd: repoRoot, encoding: 'utf8', timeout: 180000 });
        const text = (result.stdout ?? '').split('\n').filter(Boolean);
        return { exit: result.status, last: text.length === 0 ? '' : text[text.length - 1], stderr: (result.stderr ?? '').slice(-400) };
    };
    const cleanProbe = runProbe(probeClean);
    const mutatedProbe = runProbe(probeMutated);
    console.log('PROCESS clean table   -> exit=' + cleanProbe.exit + ' | ' + cleanProbe.last);
    console.log('PROCESS mutated table -> exit=' + mutatedProbe.exit + ' | ' + mutatedProbe.last);
    const exitCodesOk = cleanProbe.exit === 0 && mutatedProbe.exit === 1;
    console.log('');
    console.log('NEGATIVE: cleanExit=' + (cleanOk ? 0 : 1) + ' bytesMutationCaught=' + bytesCaught
        + ' shaMutationCaught=' + shaCaught + ' tgzFlipCaught=' + flip.caught
        + ' caught=' + (cleanOk && bytesCaught && shaCaught && flip.caught));
    const failed = cleanOk === false || bytesCaught === false || shaCaught === false || exitCodesOk === false
        || payloadBranch.available === false || payloadBranch.caught === false
        || flip.available === false || flip.caught === false;
    console.log('exit codes 2 tien trinh: clean=' + cleanProbe.exit + ' mutated=' + mutatedProbe.exit
        + ' => ' + (exitCodesOk ? 'ok (0 / 1)' : 'WRONG'));
    console.log(failed ? 'FAIL - bo kiem khong bat duoc mutation hoac ban sach da do.'
        : 'PASS - ban sach exit 0; lat 1 byte trong bang => DIFF delta=-1; lat 1 byte tren BAN SAO payload => DIFF applies=true delta=+1; doi sha => DIFF shaApplies=false; lat 1 byte tren BAN COPY .tgz => con --analyze EXIT 1 con ban goc EXIT 0; 2 tien trinh that cho exit 0 / 1.');
    process.exitCode = failed ? 1 : 0;
}

/** Score one frozen table against the live tree and translate mismatches into a process exit code. */
function negativeProbe(tablePath) {
    if (tablePath === undefined) {
        console.error('negative-probe: thieu duong dan bang');
        process.exitCode = 2;
        return;
    }
    const table = JSON.parse(readFileSync(tablePath, 'utf8'));
    const rows = compareFrozen(measureFiles(FILES), table);
    const bad = rows.filter((row) => row.ok !== true);
    for (const line of diffLines(rows)) console.log(line);
    console.log('probe ' + tablePath + ': ' + (FILES.length - bad.length) + '/' + FILES.length + ' rows match -> exit ' + (bad.length === 0 ? 0 : 1));
    process.exitCode = bad.length === 0 ? 0 : 1;
}

function score(meta) {
    const checks = [];
    const add = (id, ok, detail, evidence) => checks.push({ id, ok: ok === true, detail, evidence });
    const packs = meta.packs ?? [];
    const same = packs.length === 2 && packs[0].sha256 === packs[1].sha256
        && packs[0].bytes === packs[1].bytes && packs[0].entryCount === packs[1].entryCount;
    add('A1 two packs in two SEPARATE processes are byte-identical', same,
        packs.length === 2 ? packs[0].sha256 + ' / ' + packs[0].bytes + ' B / ' + packs[0].entryCount + ' entries'
            + ' vs ' + packs[1].sha256 + ' / ' + packs[1].bytes + ' B / ' + packs[1].entryCount + ' entries'
            : 'only ' + packs.length + ' pack(s) recorded');
    const frozenRows = meta.frozenRowsBefore ?? [];
    const frozenBad = frozenRows.filter((row) => row.ok !== true);
    add('A2 frozen table 13 rows re-measured at run time', frozenRows.length === FILES.length && frozenBad.length === 0,
        (FILES.length - frozenBad.length) + '/' + FILES.length + ' rows match (measured ' + FROZEN_MEASURED_AT + ')'
        + (frozenBad.length === 0 ? '' : ' | ' + diffLines(frozenRows).join(' | ')));
    const tar = meta.tar ?? {};
    const tarOk = tar.available === true && tar.total === EXPECTED_ENTRIES_TOTAL && tar.dirEntries === 0
        && (tar.requiredMissing ?? ['x']).length === 0 && (tar.junk ?? ['x']).length === 0 && (tar.absPaths ?? ['x']).length === 0;
    add('A3 tar listing 133 entries / 0 dir / required 6-6 / 0 junk / 0 absolute path', tarOk,
        'total=' + (tar.total ?? 'n/a') + ' dirEntries=' + (tar.dirEntries ?? 'n/a')
        + ' requiredMissing=' + ((tar.requiredMissing ?? []).join(',') || 'none')
        + ' junk=' + ((tar.junk ?? []).join(',') || 'none') + ' absPaths=' + ((tar.absPaths ?? []).join(',') || 'none')
        + ' tarAvailable=' + tar.available);
    const artifact = meta.artifact ?? {};
    const artifactOk = packs.length > 0 && artifact.sha256Now === packs[0].sha256
        && artifact.bytesNow === packs[0].bytes && artifact.entriesNow === packs[0].entryCount;
    add('A4 artifact re-hashed from disk matches the pack record', artifactOk,
        'sha256Now=' + (artifact.sha256Now || '(none)') + ' bytesNow=' + (artifact.bytesNow ?? 0) + ' entriesNow=' + (artifact.entriesNow ?? 0));
    const driftAfter = meta.driftAfter ?? {};
    add('A5 drift across the pack window = 0', driftAfter.drift === 0,
        'drift=' + (driftAfter.drift ?? 'n/a') + ' changed=' + ((driftAfter.changed ?? []).join(',') || 'none'));
    const profile = meta.profile ?? {};
    const spec = String(profile.dependencySpec ?? '');
    const profileOk = (meta.npm?.status === 0) && profile.lstat?.isSymbolicLink === false
        && profile.lstat?.isDirectory === true && profile.version === '0.2.0-dev.0'
        && String(profile.lockResolved ?? '').includes('/tests/tmp/t149/')
        && String(profile.lockResolved ?? '').endsWith('.tgz') && spec.startsWith('file:') && spec.includes('tests/tmp/t149');
    add('A6 clean profile ' + TEST_PROFILE + ' install (no symlink, dev.0, lock file: to the round-24 tarball)', profileOk,
        'npm=' + (meta.npm?.status ?? 'n/a') + ' isSymlink=' + (profile.lstat?.isSymbolicLink ?? 'n/a')
        + ' isDirectory=' + (profile.lstat?.isDirectory ?? 'n/a') + ' version=' + (profile.version ?? 'n/a')
        + ' dependencySpec=' + (spec || '(none)') + ' lockResolved=' + (profile.lockResolved || '(none)'));
    const threeWay = meta.threeWay ?? [];
    const sameCount = threeWay.filter((row) => row.same === true).length;
    add('A7 three-way (tarball payload / installed copy / source) 14/14 SAME, including lib/client/ActivityPanel.js',
        threeWay.length === THREE_WAY_FILES.length && sameCount === THREE_WAY_FILES.length,
        sameCount + '/' + THREE_WAY_FILES.length + ' same'
        + (sameCount === THREE_WAY_FILES.length ? '' : ' | ' + threeWay.filter((row) => row.same !== true).map((row) => row.file).join(',')));
    const boot = meta.boot ?? {};
    const membersLine = String(boot.membersLine ?? '');
    const removedLine = String(boot.removedLine ?? '');
    const findingsLine = String(boot.findingsLine ?? '');
    const bootOk = boot.status === 0 && String(boot.sessionId ?? '') !== '' && (boot.calls ?? []).length >= 3
        && membersLine === 'Members (1 present + 1 removed):' && removedLine.startsWith('Removed (1):')
        && / findings \d+/u.test(findingsLine);
    add('A8 boot on the INSTALLED copy prints both counts, the removed block and the findings trace', bootOk,
        'exit=' + (boot.status ?? 'n/a') + ' session=' + (boot.sessionId || '(none)') + ' calls=' + (boot.calls ?? []).length
        + ' | members=' + (membersLine || '(none)') + ' | removed=' + (removedLine || '(none)') + ' | findings=' + (findingsLine || '(none)'),
        (boot.statusTexts ?? []).length === 0 ? '' : String((boot.statusTexts ?? [])[(boot.statusTexts ?? []).length - 1]));
    const exportsRows = meta.exports ?? [];
    const exportsBad = exportsRows.filter((row) => row.ok !== true);
    const mutation = meta.selfMutation ?? {};
    const exportsOk = exportsRows.length === 19 && exportsBad.length === 0 && mutation.caught === true;
    add('A9 shipped named exports 19/19 + SELF_MUTATION caught', exportsOk,
        (exportsRows.length - exportsBad.length) + '/' + exportsRows.length + ' exports present | SELF_MUTATION caught=' + (mutation.caught === true)
        + ' exit=' + ((mutation.exitCodes ?? []).join(',') || 'n/a')
        + (exportsBad.length === 0 ? '' : ' | missing ' + exportsBad.map((row) => row.module + ':' + row.name).join(',')));
    const t98 = meta.t98 ?? {};
    add('A10 tests/t98-render-coverage.mjs --strict is green at pack time', t98.exit === 0,
        'EXIT=' + (t98.exit ?? 'n/a') + ' | ' + (t98.summary || t98.tail || '(no output)'));
    const driftEnd = meta.driftEnd ?? {};
    add('A11 drift after install + boot = 0', driftEnd.drift === 0,
        'drift=' + (driftEnd.drift ?? 'n/a') + ' changed=' + ((driftEnd.changed ?? []).join(',') || 'none'));
    // Content gates: round 24 moved three rows of the table below plus the panel source, so size and sha
    // sha of the whole tarball alone cannot show the correction; these checks read the map itself.
    const scan = meta.payloadScan ?? {};
    const scanOk = scan.available === true && (scan.fileEntries ?? 0) >= 100 && scan.compared === scan.fileEntries && (scan.diff ?? ['x']).length === 0;
    add('A12 whole payload compared with the source tree (every file entry, 0 diff)', scanOk,
        'fileEntries=' + (scan.fileEntries ?? 'n/a') + ' compared=' + (scan.compared ?? 'n/a') + ' skipped=' + (scan.skipped ?? 'n/a')
        + ' diff=' + ((scan.diff ?? []).length === 0 ? 'none' : (scan.diff ?? []).slice(0, 5).map((row) => row.file + ':' + row.kind).join(',')));
    const order = meta.panelOrder ?? {};
    add('A13 installed bundle ships the round-24 layout: grid 1:2 and the --member-column-height rules present, data-panel-columns/panelColumns/panelColumnAside GONE, DependencyMap a sibling of the left cell', order.ok === true,
        order.detail ?? 'no layout proof measured');
    const bundles = meta.bundleHashes ?? [];
    add('A14 installed client.js + client.js.map hashes equal the source hashes',
        bundles.length === 2 && bundles.every((row) => row.same === true),
        bundles.length === 0 ? 'no bundle hashes measured'
            : bundles.map((row) => row.file + ' source=' + row.source.sha256.slice(0, 16) + '/' + row.source.bytes
                + ' installed=' + row.installed.sha256.slice(0, 16) + '/' + row.installed.bytes + ' same=' + row.same).join(' | '));
    add('A15 boot printed a Team id line', /^Team id: /u.test(String(boot.teamIdLine ?? '')),
        'teamIdLine=' + (String(boot.teamIdLine ?? '') || '(none)'));
    // A16: the historically red pack suites are NAMED (with the hash each one pins), never silently ignored.
    add('A16 historical pack suites that are red by design are listed with file:line and pinned hash',
        LEGACY_PACK_SUITES.length > 0 && LEGACY_PACK_SUITES.every((row) => row.suite !== '' && row.line > 0 && row.pin !== ''),
        LEGACY_PACK_SUITES.length + ' suite(s): ' + LEGACY_PACK_SUITES.map((row) => row.suite + ':' + row.line + ' (' + row.pin + ')').join(', '));
    // A17: the frozen table is compared against the tree at SCORING time, so --analyze cannot pass on a
    // meta.json that was true an hour ago.
    const frozenNow = meta.frozenNow ?? [];
    const frozenNowBad = frozenNow.filter((row) => row.ok !== true);
    add('A17 frozen table re-measured from disk at scoring time', frozenNow.length === FILES.length && frozenNowBad.length === 0,
        (FILES.length - frozenNowBad.length) + '/' + FILES.length + ' rows match'
        + (frozenNowBad.length === 0 ? '' : ' | ' + diffLines(frozenNow).join(' | ')));
    // A18: the pins that guard the bundle stay green after the pack.
    const pinSuites = [meta.t10, meta.t128, meta.t129];
    add('A18 t10 + t128 + t129 all exit 0 after the pack', pinSuites.every((item) => item?.exit === 0),
        't10=' + (meta.t10?.exit ?? 'n/a') + ' t128=' + (meta.t128?.exit ?? 'n/a') + ' t129=' + (meta.t129?.exit ?? 'n/a'));
    // A19: the round-24 release moved EXACTLY three rows of the frozen table. Anything else moving is a
    // stop condition: either another writer touched lib/** or the table was copied instead of measured.
    const moved = FILES.filter((rel) => {
        const current = (meta.tableBefore ?? []).find((row) => row.file === rel);
        const before = FROZEN_ROUND23[rel];
        return current === undefined || before === undefined || current.sha256.slice(0, 16) !== before.sha16 || current.bytes !== before.bytes;
    });
    const expectedMoved = ['lib/client.js', 'lib/client.js.map', 'lib/client/ActivityPanel.module.css'];
    const movedOk = moved.length === expectedMoved.length && expectedMoved.every((rel) => moved.includes(rel));
    add('A19 exactly 3 rows moved since round 23 (client.js 7dca20dd->44911f22, client.js.map 173b684f->a6b7d7b7, ActivityPanel.module.css 7ea5190c->b6d8a2f5) and the other 10 are unchanged',
        movedOk, 'moved=' + (moved.join(',') || 'none') + ' | unchanged=' + (FILES.length - moved.length) + '/' + FILES.length);
    // A20: a 13-row three-way would pass while shipping a panel source nobody can trace back.
    add('A20 three-way table really covers 14 files including lib/client/ActivityPanel.js',
        threeWay.length === THREE_WAY_FILES.length, threeWay.length + '/' + THREE_WAY_FILES.length + ' rows measured');
    return checks;
}
function plainTable(rows) {
    return (rows ?? []).map((row) => '  ' + row.file.padEnd(34) + row.sha256.slice(0, 16).padEnd(18) + String(row.bytes).padStart(7));
}

async function runFresh(overrideDir) {
    const stamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d+Z$/u, 'Z');
    // An explicit run directory makes the pack reproducible for a reviewer: --fresh tests/tmp/t149/run-x
    // re-creates exactly that directory instead of scattering a new timestamped one.
    const runDir = overrideDir === undefined || overrideDir === ''
        ? join(packDir, 'run-' + stamp)
        : (isAbsolute(overrideDir) ? resolve(overrideDir) : join(packDir, overrideDir));
    rmSync(runDir, { recursive: true, force: true });
    const workspace = join(runDir, 'workspace');
    mkdirSync(workspace, { recursive: true });
    const meta = { task: 't149', round: 24, profile: TEST_PROFILE, startedAt: new Date().toISOString(), runDir, workspace, frozenMeasuredAt: FROZEN_MEASURED_AT };
    const save = () => writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

    // 1. The frozen table is re-derived from disk NOW: a stale copy of round 18 would pass a hand-copied
    //    comparison and prove nothing, so every row is measured here and compared against FROZEN.
    meta.tableBefore = measureFiles(FILES);
    meta.frozenRowsBefore = compareFrozen(meta.tableBefore, FROZEN);
    meta.frozenNow = meta.frozenRowsBefore;
    console.log('=== t149 --fresh: bang FROZEN do lai tai HEAD (' + FROZEN_MEASURED_AT + ') ===');
    for (const line of frozenTableText(meta.frozenRowsBefore)) console.log(line);
    for (const line of diffLines(meta.frozenRowsBefore)) console.log(line);
    save();

    // 2. The render gate the round-18 audit used, re-run at pack time so a red gate is visible in the record.
    meta.t98 = runNodeSuite('tests/t98-render-coverage.mjs', ['--strict']);
    console.log('t98 --strict: EXIT=' + meta.t98.exit + ' | ' + (meta.t98.summary || '(no SUMMARY line)'));
    // The two pins the round-20 audit relies on, re-run at pack time so a red pin is visible in the record.
    meta.t10 = runNodeSuite('tests/t10-ui-bundle-smoke.mjs', []);
    console.log('t10: EXIT=' + meta.t10.exit + ' | ' + (meta.t10.summary || meta.t10.tail || '(no output)'));
    meta.t129 = runNodeSuite('tests/t129-pins.mjs', []);
    console.log('t129-pins: EXIT=' + meta.t129.exit + ' | ' + (meta.t129.summary || meta.t129.tail || '(no output)'));
    meta.t128 = runNodeSuite('tests/t128-panel-order.mjs', []);
    console.log('t128-panel-order: EXIT=' + meta.t128.exit + ' | ' + (meta.t128.summary || meta.t128.tail || '(no output)'));
    save();
    // 3. Two independent npm packs in THIS process: determinism is proven only when both tarballs are
    //    hashed from disk, never from the command output.
    const packA = packFresh(meta, join(runDir, 'pack-a'), 'packA');
    // Determinism that counts is ACROSS processes: pack B is produced by a CHILD of this very file, so no
    // in-process state of npm can make the two tarballs agree by accident.
    const packBDir = join(runDir, 'pack-b');
    mkdirSync(packBDir, { recursive: true });
    const childPack = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--pack-once', packBDir],
        { cwd: repoRoot, encoding: 'utf8', timeout: 300000 });
    const childOut = (childPack.stdout ?? '').split('\n').filter((line) => line.startsWith('PACK_ONCE ')).slice(-1)[0] ?? '';
    const packB = newestTgzIn(packBDir);
    meta.packChild = { exit: childPack.status, line: childOut, dir: packBDir, stderrTail: (childPack.stderr ?? '').slice(-400) };
    console.log('pack B (tien trinh con rieng): exit=' + childPack.status + ' | ' + (childOut || '(khong thay dong PACK_ONCE)'));
    const describePack = (tgzPath, key, fallbackDir) => {
        const record = meta[key] ?? {};
        // Pack B is produced by a CHILD process, so its record has no in-process destination: fill it from
        // the directory the child was given, or the verdict would print an empty row for the determinism pack.
        if (record.destination === undefined && fallbackDir !== undefined) {
            record.destination = fallbackDir;
            record.command = 'node <this file> --pack-once ' + fallbackDir;
            meta[key] = record;
        }
        const info = artifactInfo(tgzPath ?? '');
        return { destination: record.destination ?? '', command: record.command ?? '',
            name: tgzPath === undefined ? '' : tgzPath.split(/[\\/]/u).pop(),
            sha256: info.sha256Now, bytes: info.bytesNow, entryCount: info.entriesNow };
    };
    meta.packs = [describePack(packA, 'packA'), describePack(packB, 'packB', packBDir)];
    for (const item of meta.packs) console.log('pack: ' + item.name + ' sha256=' + item.sha256 + ' bytes=' + item.bytes + ' entries=' + item.entryCount);
    save();

    const tgzPath = packA ?? packB;
    const entries = tgzPath === undefined ? [] : readTarball(tgzPath);
    meta.artifact = artifactInfo(tgzPath ?? '');
    meta.tar = tgzPath === undefined
        ? { available: false, total: 0, dirEntries: 0, dirNames: [], requiredMissing: REQUIRED_ENTRIES.slice(), junk: [], absPaths: [] }
        : tarAudit(tgzPath, entries);
    console.log('artifact: sha256Now=' + meta.artifact.sha256Now + ' bytesNow=' + meta.artifact.bytesNow + ' entriesNow=' + meta.artifact.entriesNow);
    console.log('tar: total=' + meta.tar.total + ' dirEntries=' + meta.tar.dirEntries + ' requiredMissing=' + (meta.tar.requiredMissing.join(',') || 'none')
        + ' junk=' + (meta.tar.junk.join(',') || 'none') + ' absPaths=' + (meta.tar.absPaths.join(',') || 'none'));
    save();

    // 4. Drift across the pack window: the artefact is only meaningful if the tree stood still.
    meta.tableAfter = measureFiles(FILES);
    meta.driftAfter = driftBetween({ files: meta.tableBefore }, { files: meta.tableAfter });
    console.log('drift sau pack = ' + meta.driftAfter.drift + ' (' + (meta.driftAfter.changed.join(',') || 'none') + ')');
    save();

    // 5. Install into a profile that does not exist yet: a stale pack17 install would hide a bad tarball.
    const installDir = tgzPath === undefined ? '' : installIntoCleanProfile(tgzPath, meta);
    console.log('install: profile=' + TEST_PROFILE + ' npm=' + (meta.npm?.status ?? 'n/a') + ' isSymlink=' + (meta.profile?.lstat?.isSymbolicLink ?? 'n/a')
        + ' version=' + (meta.profile?.version ?? 'n/a') + ' lock=' + (meta.profile?.lockResolved || '(none)'));
    meta.threeWay = tgzPath === undefined ? [] : hashThreeWays(runDir, entries, installDir);
    const sameCount = meta.threeWay.filter((row) => row.same === true).length;
    console.log('ba chieu: ' + sameCount + '/' + THREE_WAY_FILES.length + ' same');
    // Content proof, not size proof: the whole payload is compared file by file, the panel ORDER inside
    // the installed bundle is read back, and both client files are hashed on both sides.
    meta.payloadScan = payloadScan(entries);
    console.log('payload scan: ' + meta.payloadScan.compared + '/' + meta.payloadScan.fileEntries
        + ' file entry khop nguon, bo qua=' + meta.payloadScan.skipped + ', diff=' + meta.payloadScan.diff.length
        + (meta.payloadScan.diff.length === 0 ? '' : ' | ' + meta.payloadScan.diff.slice(0, 5).map((row) => row.file + ':' + row.kind).join(',')));
    meta.panelOrder = installDir === '' ? { available: false, ok: false, detail: 'khong co ban cai', present: [], absent: [], sourceRows: [] } : layoutProof(installDir);
    console.log('panel order trong BAN CAI: ok=' + meta.panelOrder.ok + ' | ' + (meta.panelOrder.detail || 'n/a'));
    meta.bundleHashes = installDir === '' ? [] : bundleHashes(pluginDir, installDir);
    for (const row of meta.bundleHashes) console.log('bundle ' + row.file + ' source=' + row.source.sha256.slice(0, 16) + '/' + row.source.bytes
        + ' installed=' + row.installed.sha256.slice(0, 16) + '/' + row.installed.bytes + ' same=' + row.same);
    meta.extraHashes = extraHashes();
    for (const row of meta.extraHashes) console.log('extra (khong trong FROZEN) ' + row.file + ' sha256=' + row.sha256 + ' bytes=' + row.bytes);
    meta.exports = installDir === '' ? [] : assertExports(join(installDir, 'lib'));
    meta.selfMutation = installDir === '' ? { caught: false, exitCodes: [] } : selfMutationProbe(join(installDir, 'lib'));
    save();

    // 6. Boot on the INSTALLED copy: the shipped render is the only witness that counts.
    const boot = runHeadless(bootPrompt, workspace);
    const stream = parseStream(boot.stdout);
    const statusTexts = statusTextsOf(stream);
    const finalText = statusTexts.length === 0 ? '' : String(statusTexts[statusTexts.length - 1]);
    const finalLines = finalText.split('\n');
    const rosterAt = finalLines.findIndex((line) => /^Members \(/u.test(line));
    meta.boot = {
        command: boot.command, status: boot.status, signal: boot.signal, elapsedMs: boot.elapsedMs,
        stderrTail: boot.stderr.slice(-600), sessionId: stream.sessionIds[0] ?? '',
        calls: stream.calls.map((call) => ({ tool: call.tool })), statusTexts,
        membersLine: firstLineMatching(finalText, /^Members \(/u),
        removedLine: firstLineMatching(finalText, /^Removed \(/u),
        findingsLine: firstLineMatching(finalText, / findings \d+/u),
        teamIdLine: firstLineMatching(finalText, /^Team id:/u),
        rosterLines: rosterAt === -1 ? [] : finalLines.slice(rosterAt, rosterAt + 12),
    };
    console.log('boot: exit=' + meta.boot.status + ' session=' + (meta.boot.sessionId || '(none)') + ' calls=' + meta.boot.calls.length);
    save();

    // 7. Drift after install + boot: install must not touch the source tree either.
    meta.tableEnd = measureFiles(FILES);
    meta.driftEnd = driftBetween({ files: meta.tableBefore }, { files: meta.tableEnd });
    save();

    const checks = score(meta);
    printVerdict(meta, checks, runDir);
    process.exitCode = checks.every((item) => item.ok === true) ? 0 : 1;
}

function latestRunDir(target) {
    if (!existsSync(target)) return undefined;
    if (existsSync(join(target, 'meta.json'))) return target;
    const runs = readdirSync(target).filter((name) => name.startsWith('run-') && existsSync(join(target, name, 'meta.json'))).sort();
    return runs.length === 0 ? undefined : join(target, runs[runs.length - 1]);
}

function analyze(target, tgzOverride) {
    const dir = latestRunDir(resolve(target));
    if (dir === undefined) {
        console.error('analyze: khong tim thay meta.json trong ' + target);
        process.exitCode = 2;
        return;
    }
    const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
    // An explicit tarball argument re-hashes THAT file: the negative control hands this mode a byte-
    // flipped copy and expects the scorer to fail on it while the recorded artefact keeps passing.
    const overridePath = tgzOverride === undefined ? undefined : resolve(tgzOverride);
    if (overridePath !== undefined) meta.artifactOverride = overridePath;
    meta.artifact = artifactInfo(overridePath ?? meta.artifact?.path ?? '');
    // Scored from the TREE, never from the numbers written in meta.json: an --analyze run re-measures
    // the 13 frozen files now and prints every mismatch.
    meta.frozenNow = compareFrozen(measureFiles(FILES), FROZEN);
    for (const line of diffLines(meta.frozenNow)) console.log(line);
    // The layout proof is re-run against the INSTALLED profile as well, so --analyze cannot pass on a
    // layout that was measured in an earlier run and is no longer what the profile holds.
    const analyzInstallDir = String(meta.profile?.installDir ?? '');
    if (analyzInstallDir !== '') meta.panelOrder = layoutProof(analyzInstallDir);
    const checks = score(meta);
    printVerdict(meta, checks, dir);
    process.exitCode = checks.every((item) => item.ok === true) ? 0 : 1;
}

function printVerdict(meta, checks, dir) {
    const pad = (textValue, width) => String(textValue).padEnd(width, ' ');
    console.log('');
    console.log('=== t149 pack vong 24 sau t148 (cot dependencies cao BANG cot member qua bien --member-column-height) + 2 pack o 2 TIEN TRINH RIENG + doi chieu toan bo payload ===');
    console.log('run: ' + dir);
    console.log('profile: ' + TEST_PROFILE + ' (moi cho vong 24, khong dung lai pack22) | frozen table measured at ' + FROZEN_MEASURED_AT);
    console.log('pack B: ' + (meta.packChild === undefined ? '(khong co)' : 'tien trinh con exit=' + meta.packChild.exit + ' dir=' + meta.packChild.dir));
    console.log('');
    console.log('--- 13 tep DO TRUOC pack ---');
    for (const line of plainTable(meta.tableBefore)) console.log(line);
    console.log('--- 13 tep DO SAU pack ---');
    for (const line of plainTable(meta.tableAfter)) console.log(line);
    console.log('drift sau pack=' + (meta.driftAfter?.drift ?? 'n/a') + ' (' + ((meta.driftAfter?.changed ?? []).join(',') || 'none') + ')'
        + ' | drift sau cai+boot=' + (meta.driftEnd?.drift ?? 'n/a') + ' (' + ((meta.driftEnd?.changed ?? []).join(',') || 'none') + ')');
    console.log('');
    for (const item of meta.packs ?? []) console.log('pack: ' + item.destination + ' -> ' + item.name + '  sha256=' + item.sha256 + '  bytes=' + item.bytes + '  entries=' + item.entryCount);
    const packs = meta.packs ?? [];
    if (packs.length === 2) console.log('2 lan pack: ' + (packs[0].sha256 === packs[1].sha256 ? 'SAME sha256 va SAME bytes' : 'DIFFERENT (xem A1)'));
    console.log('artifact tren dia: sha256Now=' + (meta.artifact?.sha256Now || '(none)') + ' bytesNow=' + (meta.artifact?.bytesNow ?? 0) + ' entriesNow=' + (meta.artifact?.entriesNow ?? 0));
    console.log('tar: total=' + (meta.tar?.total ?? 'n/a') + ' dirEntries=' + (meta.tar?.dirEntries ?? 'n/a')
        + ' requiredMissing=' + ((meta.tar?.requiredMissing ?? []).join(',') || 'none')
        + ' junk=' + ((meta.tar?.junk ?? []).join(',') || 'none') + ' absPaths=' + ((meta.tar?.absPaths ?? []).join(',') || 'none'));
    console.log('profile: isSymlink=' + (meta.profile?.lstat?.isSymbolicLink ?? 'n/a') + ' isDirectory=' + (meta.profile?.lstat?.isDirectory ?? 'n/a')
        + ' version=' + (meta.profile?.version ?? 'n/a') + ' npm=' + (meta.npm?.status ?? 'n/a'));
    console.log('profile dependencySpec=' + (meta.profile?.dependencySpec || '(none)'));
    console.log('profile lockResolved=' + (meta.profile?.lockResolved || '(none)'));
    console.log('');
    console.log(pad('file', 34) + pad('payload', 15) + pad('installed', 15) + pad('source', 15) + pad('bytes p/i/s', 22) + 'verdict');
    for (const row of meta.threeWay ?? []) {
        console.log(pad(row.file, 34) + pad(row.payload.slice(0, 12), 15) + pad(row.installed.slice(0, 12), 15) + pad(row.source.slice(0, 12), 15)
            + pad(row.bytes.payload + '/' + row.bytes.installed + '/' + row.bytes.source, 22) + (row.same ? 'SAME' : 'DIFF'));
    }
    console.log('');
    const exportRows = meta.exports ?? [];
    for (const row of exportRows) console.log((row.ok === true ? 'ok   ' : 'MISS ') + (exportRows.indexOf(row) + 1) + ' export ' + row.module + ':' + row.name + (row.error === '' ? '' : ' (' + row.error + ')'));
    console.log('SELF_MUTATION: ' + (meta.selfMutation?.caught === true
        ? 'caught exit=' + (meta.selfMutation.exitCodes ?? []).join(',')
        : 'NOT caught exit=' + ((meta.selfMutation?.exitCodes ?? []).join(',') || '(khong chay)')));
    console.log('');
    console.log('--- agent_teams_status tren BAN CAI (nguyen van: khoi roster + Removed + dong task co findings) ---');
    const rosterLines = meta.boot?.rosterLines ?? [];
    console.log(rosterLines.length === 0 ? '(khong thay dong Members)' : rosterLines.join('\n'));
    console.log('--- het khoi roster ---');
    console.log('dong 1 (expect "Members (1 present + 1 removed):"): ' + (meta.boot?.membersLine || '(none)'));
    console.log('dong 2 (expect "Removed (1):"): ' + (meta.boot?.removedLine || '(none)'));
    console.log('dong 3 (expect dau vet findings): ' + (meta.boot?.findingsLine || '(none)'));
    console.log('boot: exit=' + (meta.boot?.status ?? 'n/a') + ' session=' + (meta.boot?.sessionId || '(khong thay)') + ' calls=' + ((meta.boot?.calls ?? []).map((call) => call.tool).join(',')));
    console.log('t98 --strict: EXIT=' + (meta.t98?.exit ?? 'n/a') + ' | ' + (meta.t98?.summary || meta.t98?.tail || '(no output)'));
    console.log('t10: EXIT=' + (meta.t10?.exit ?? 'n/a') + ' | ' + (meta.t10?.summary || meta.t10?.tail || '(no output)'));
    console.log('t129-pins: EXIT=' + (meta.t129?.exit ?? 'n/a') + ' | ' + (meta.t129?.summary || meta.t129?.tail || '(no output)'));
    console.log('t128-panel-order: EXIT=' + (meta.t128?.exit ?? 'n/a') + ' | ' + (meta.t128?.summary || meta.t128?.tail || '(no output)'));
    const frozenNowRows = meta.frozenNow ?? [];
    console.log('FROZEN do lai tai luc cham: ' + frozenNowRows.filter((row) => row.ok === true).length + '/' + FILES.length + ' khop'
        + (frozenNowRows.length === 0 ? ' (khong co)' : ''));
    console.log('--- pack suite cu SE DO vi ghim hash nguon (dung thiet ke, khong sua) ---');
    for (const row of LEGACY_PACK_SUITES) console.log('  ' + row.suite + ':' + row.line + ' ghim ' + row.pin);
    console.log('payload scan: ' + (meta.payloadScan?.compared ?? 'n/a') + '/' + (meta.payloadScan?.fileEntries ?? 'n/a')
        + ' file entry khop nguon | diff=' + ((meta.payloadScan?.diff ?? []).length));
    const layout = meta.panelOrder ?? {};
    console.log('layout trong BAN CAI: ok=' + (layout.ok ?? 'n/a') + ' | ' + (layout.detail || 'n/a'));
    for (const row of layout.present ?? []) console.log('  co    ' + row.label + '  count=' + row.count + '  offset=' + row.offset + '  ok=' + row.ok);
    for (const row of layout.absent ?? []) console.log('  khong ' + row.label + '  count=' + row.count + '  ok=' + row.ok);
    console.log('  DependencyMap call site offset=' + (layout.dependency?.offset ?? 'n/a') + ' count=' + (layout.dependency?.count ?? 'n/a')
        + ' siblingClose=' + (layout.dependency?.siblingClose ?? 'n/a') + ' wrapped=' + (layout.dependency?.wrapped ?? 'n/a'));
    if (typeof layout.dependency?.excerpt === 'string') console.log('  excerpt: ' + JSON.stringify(layout.dependency.excerpt));
    for (const row of layout.sourceRows ?? []) console.log('  nguon ' + row.file + ': ' + row.detail + ' ok=' + row.ok);
    console.log('  source sibling (ActivityPanel.js): ' + (layout.sourceSibling ?? 'n/a'));
    for (const row of meta.bundleHashes ?? []) console.log('bundle ' + row.file + ' source=' + row.source.sha256.slice(0, 16) + '/' + row.source.bytes
        + ' installed=' + row.installed.sha256.slice(0, 16) + '/' + row.installed.bytes + ' same=' + row.same);
    for (const row of meta.extraHashes ?? []) console.log('extra (khong trong FROZEN) ' + row.file + ' sha256=' + row.sha256 + ' bytes=' + row.bytes);
    console.log('Team id line: ' + (meta.boot?.teamIdLine || '(none)'));
    console.log('');
    let failed = 0;
    for (const item of checks) {
        if (item.ok !== true) failed += 1;
        console.log((item.ok ? 'PASS  ' : 'FAIL  ') + item.id);
        console.log('      ' + item.detail);
        if (item.id.startsWith('A8') && typeof item.evidence === 'string' && item.evidence !== '')
            for (const line of item.evidence.split('\n')) console.log('      | ' + line);
    }
    console.log('');
    console.log((checks.length - failed) + '/' + checks.length + ' checks passed, ' + failed + ' failed');
    console.log(failed === 0
        ? 'PASS - pack vong 24: 2 lan pack o 2 TIEN TRINH RIENG cung sha256/bytes/entries, bang FROZEN 13 dong do lai khop (map a6b7d7b7), drift=0 o 3 moc, 133 entry / 0 dir / 0 rac, ba chieu 14/14 SAME tren profile agent-teams-pack23 (lock file: tro dung tarball vong 24), payload khop nguon tung tep, bang chung BYTE trong BAN CAI: --member-column-height + height:var(...) + max-height:var(...) co mat, ba marker bo cuc cu = 0, DependencyMap la sibling (offset + excerpt), boot in NGUYEN VAN "Members (1 present + 1 removed):" + "Removed (1):" + "Team id:", t10/t128/t129 xanh, --analyze tu hash tarball tren dia, --negative bat ca ban copy .tgz.'
        : 'FAIL - xem cac dong FAIL o tren.');
}

async function main() {
    const argv = process.argv.slice(2);
    const mode = argv[0] ?? '--fresh';
    if (mode === '--negative') { runNegative(); return; }
    if (mode === '--negative-probe') { negativeProbe(argv[1]); return; }
    if (mode === '--analyze') { analyze(argv[1] ?? packDir, argv[2]); return; }
    if (mode === '--pack-once') {
        if (argv[1] === undefined) { console.error('pack-once: thieu thu muc dich'); process.exitCode = 2; return; }
        packOnce(argv[1]); return;
    }
    if (mode === '--fresh') { await runFresh(argv[1]); return; }
    console.error('unknown mode ' + mode + ' (use --fresh [runDir], --pack-once <dir>, --negative, --negative-probe <table> or --analyze <dir> [<tgz>])');
    process.exitCode = 2;
}

await main();
