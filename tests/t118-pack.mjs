// tests/t118-pack.mjs — repo-resident verifier for the v18 release artefact (t111).
//
// WHY THIS FILE EXISTS (V18-F4): the pack suite of round 18 lived only in
// packages/dsh-agent-teams/tests/tmp/t111, so the shipped artefact could not be re-checked from the
// repo — its meta.json was the only machine-checkable evidence. This suite is the repo copy:
// one command re-hashes the tarball on disk, re-hashes the 13 payload files three ways and fails loudly.
//
// ROUND 19 (t124): re-pinned to the shipped round-19 artefact (tests/tmp/t121), and the negative side
// now also flips ONE byte inside a COPY of the .tgz itself, not only inside an unpacked payload (V19-F5):
// a tarball that still unpacks to the same bytes must be refused by A2 (sha256/bytes) and not reach A4.
//
// USAGE
//   node tests/t118-pack.mjs --analyze packages/dsh-agent-teams/tests/tmp/t121
//   node tests/t118-pack.mjs --analyze <dir-with-a-flipped-copy>.tgz                          (must EXIT 1 at A2)
//   node tests/t118-pack.mjs --fresh        (packs twice into new dirs, proves same sha256 + bytes)
//   node tests/t118-pack.mjs --negative     (unpacked 1-byte mutation AND a 1-byte flip in a .tgz COPY)
//   node tests/t118-pack.mjs --tgz-flip     (only the .tgz copy flip, spawns --analyze on the copy)
//   node tests/t118-pack.mjs                (defaults to --analyze of the round-19 artefact)
//
// --analyze accepts: a .tgz, a directory holding *.tgz (newest wins), or an unpacked payload dir (has lib/).
// Exit: 0 = every check passed, 1 = at least one check failed (the DIFF lines name the file and delta bytes).

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const pluginDir = join(repoRoot, 'packages', 'dsh-agent-teams');
const workDir = join(here, 'tmp', 't118');
// The .tgz copy is mutated under the task work dir of the card that added the case (rules of round 19:
// every mutation runs on a COPY inside tests/tmp/<task>, never on the released artefact).
const FLIP_DIR = process.env.T124_FLIP_DIR ?? join(repoRoot, 'tests', 'tmp', 't124', 'tgz-flip');
const artifactDir = join(pluginDir, 'tests', 'tmp', 't121');
const TARBALL_NAME = 'nami-dsh-agent-teams-0.2.0-dev.0.tgz';
const PROFILE = process.env.DSH_TEST_PROFILE ?? 'agent-teams-pack18';
const DSH_HOME = process.env.DSH_TEST_HOME ?? join(process.env.USERPROFILE ?? 'C:/Users/thang', '.dsh');
const installDir = join(DSH_HOME, 'profiles', PROFILE, 'node_modules', '@nami', 'dsh-agent-teams');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const pad = (value, width) => String(value).padEnd(width, ' ');
const short = (value) => (value === undefined ? '-' : value.slice(0, 12));

// ------------------------------------------------------------------ frozen table
// FROZEN — re-pinned for ROUND 19 (t124) and measured FRESH here, not copied from any other suite.
// Source of every number: the bytes on disk under packages/dsh-agent-teams/** at this HEAD, read with
// node:crypto in the same run that wrote this comment, then cross-checked against (a) the payload inside
// the round-19 tarball under tests/tmp/t121 and (b) the copy installed in profile agent-teams-pack18.
// Why re-pinned: round 18 (t111) pinned lib/tools.js 88dbee4079f95ffd/213071; t117 replaced it with
// e51734baf4693cd3/213715 (status render: ' findings N' + message timestamps), so the round-18 table and
// its tarball are stale by design. The round-18 numbers are recorded in docs/kiem-thu/t118-pack.md.
// Moc do: 2026-11-01T02:24:41.236Z.
const FROZEN_MEASURED_AT = '2026-11-01T02:24:41.236Z';
const FROZEN = [
    { path: 'lib/tools.js', sha256: 'e51734baf4693cd30f4c86aaf577afb58f8afef39788588d900a93621ae62d61', bytes: 213715 },
    { path: 'lib/members.js', sha256: '50f558f8b207d874d3d8052373b2dafc93cfe9ae54100ae03a4a7ed9f8bf1661', bytes: 102260 },
    { path: 'lib/state.js', sha256: '56664c59ff40031989afe32d5d733e3e84d02904f21149314d98d0f49c443485', bytes: 57508 },
    { path: 'lib/snapshot.js', sha256: 'a2a87e1b0c0b34ea1f8cb4a45c195d60d613eca997d0ce0d60e47d1a568c9a60', bytes: 13986 },
    { path: 'lib/index.js', sha256: '2d28e617f0683e420a30875557bbb7589cb0221e40e8839f7fdd9d1015d227c9', bytes: 45315 },
    { path: 'lib/tool-names.js', sha256: 'e3def5db908dcbd510811cb2da9c2076c3cf948b7b734bff73c510f85ac3ec58', bytes: 808 },
    { path: 'lib/client.js', sha256: '9da18d9971a284e936d709db592da6cedcdf1afa960fff282d7a1c802fec7007', bytes: 258432 },
    { path: 'lib/client.js.map', sha256: 'bbf88608f54e966fdb42cf0c8297b81e46d198870ce87b002c6a54f8cf6e5dae', bytes: 404958 },
    { path: 'lib/types/members.d.ts', sha256: 'c53250ab41bff8c310f3bed4f808f8c799296878b060670527b8fbc1f749239e', bytes: 31769 },
    { path: 'lib/types/snapshot.d.ts', sha256: '962f99a7bcb18b9482b0d4e6933bde0c79356b885c323c0e60f596e6c0fd1a22', bytes: 7627 },
    { path: 'lib/types/tools.d.ts', sha256: '41cfc56576ed8ffd8020cba53f6ed7a91ba30382ea46a0e136f02e4d3a67f5c3', bytes: 7546 },
    { path: 'lib/client/ActivityPanel.module.css', sha256: '53ea47c6d780cd9d67fbbab497d3cc302934a8aa16a1ed4ad7ff811442109c16', bytes: 51837 },
    { path: 'package.json', sha256: '92a6404071e457ccc49f485525aab17e467db0e76d4585a50d49997af5451f36', bytes: 10498 },
];
// Artefact of round 19 as shipped (tests/t121, two independent npm pack runs produced these numbers).
const FROZEN_TARBALL = {
    sha256: '2770fbfc4070eb80cbe419134f1c44ffed8e9c6e4d9703d0d775b4af3cc6251e',
    bytes: 2248092,
    entries: 133,
};
const REQUIRED_ENTRIES = [
    'package/lib/tools.js',
    'package/lib/members.js',
    'package/lib/client.js',
    'package/lib/client.js.map',
    'package/lib/tool-names.js',
    'package/cordis.patch.yml',
];
const JUNK_PATTERNS = [
    { label: 'node_modules', re: /^package\/node_modules\//u },
    { label: 'package-tests', re: /^package\/tests\//u },
    { label: 'nested-tgz', re: /\.tgz$/u },
    { label: 'pid', re: /\.pid$/u },
    { label: 'tools', re: /^package\/tools\//u },
];

// ------------------------------------------------------------------ tar reader
/** Minimal ustar reader (npm never writes base-256 sizes). Long names come in 'L' blocks. */
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

// --------------------------------------------------------------- hash sources
function hashDirFiles(baseDir, paths) {
    const out = {};
    for (const rel of paths) {
        const abs = join(baseDir, ...rel.split('/'));
        if (!existsSync(abs)) { out[rel] = undefined; continue; }
        const buffer = readFileSync(abs);
        out[rel] = { sha256: sha256(buffer), bytes: buffer.length };
    }
    return out;
}

function hashTarballFiles(entries, paths) {
    const out = {};
    for (const rel of paths) {
        const entry = entries.find((item) => item.name === 'package/' + rel);
        out[rel] = entry === undefined || entry.body === undefined
            ? undefined
            : { sha256: sha256(entry.body), bytes: entry.body.length };
    }
    return out;
}

// ------------------------------------------------------------------- compares
function compareRows(actual, source, label) {
    return FROZEN.map((frozen) => {
        const got = actual[frozen.path];
        const same = got !== undefined && got.sha256 === frozen.sha256 && got.bytes === frozen.bytes;
        return { path: frozen.path, label, same, applies: true, frozen, actual: got, source: source[frozen.path] };
    });
}

function diffLines(rows) {
    return rows.filter((row) => !row.same).map((row) => {
        const bytesActual = row.actual === undefined ? 0 : row.actual.bytes;
        const delta = bytesActual - row.frozen.bytes;
        return 'DIFF ' + row.path + ' [' + row.label + '] applies=true'
            + ' bytesFrozen=' + row.frozen.bytes
            + ' bytesActual=' + (row.actual === undefined ? 'MISSING' : bytesActual)
            + ' delta=' + (delta >= 0 ? '+' + delta : String(delta))
            + ' shaFrozen=' + row.frozen.sha256.slice(0, 16)
            + ' shaActual=' + (row.actual === undefined ? 'MISSING' : row.actual.sha256.slice(0, 16));
    });
}

// -------------------------------------------------------------------- target
/** Breadth-first *.tgz search, bounded so a wrong path cannot walk the whole disk. */
function findTgzRecursive(dir, depth) {
    if (depth > 4) return [];
    const found = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) found.push(...findTgzRecursive(abs, depth + 1));
        else if (entry.name.endsWith('.tgz')) found.push(abs);
    }
    return found;
}

function resolveTarget(targetArg) {
    const abs = resolve(targetArg);
    if (!existsSync(abs)) return { error: 'target not found: ' + abs, abs };
    const stat = statSync(abs);
    if (stat.isFile()) {
        if (!abs.endsWith('.tgz')) return { error: 'target is a file but not a .tgz: ' + abs, abs };
        return { kind: 'tgz', tgzPath: abs, abs };
    }
    const tgzs = readdirSync(abs).filter((name) => name.endsWith('.tgz')).map((name) => join(abs, name));
    if (tgzs.length > 0) {
        tgzs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
        return { kind: 'tgz', tgzPath: tgzs[0], abs, picked: tgzs.length };
    }
    if (existsSync(join(abs, 'lib'))) return { kind: 'payload', payloadDir: abs, abs };
    // A pack run dir (tests/tmp/t121) keeps its tarball two levels down, under run-*/pack-a/.
    const nested = findTgzRecursive(abs, 0).map((path) => ({ path, mtime: statSync(path).mtimeMs }));
    if (nested.length > 0) {
        nested.sort((a, b) => b.mtime - a.mtime);
        return { kind: 'tgz', tgzPath: nested[0].path, abs, picked: nested.length, nested: true };
    }
    return { error: 'no *.tgz and no lib/ under ' + abs, abs };
}

// ------------------------------------------------------------------- installed
function installedInfo() {
    const info = { dir: installDir };
    if (!existsSync(installDir)) {
        info.missing = true;
        return info;
    }
    const stat = lstatSync(installDir);
    info.lstat = { isSymbolicLink: stat.isSymbolicLink(), isDirectory: stat.isDirectory() };
    try { info.realpath = realpathSync(installDir); } catch { info.realpath = installDir; }
    try { info.version = JSON.parse(readFileSync(join(installDir, 'package.json'), 'utf8')).version; } catch { info.version = undefined; }
    return info;
}

// ------------------------------------------------------------------- analyse
function analyse(targetArg) {
    const checks = [];
    const target = resolveTarget(targetArg);
    const result = { targetArg, target, checks, rows: [], diffs: [], artifact: undefined, installed: installedInfo() };
    const add = (id, label, pass, detail) => checks.push({ id, label, pass, detail });

    add('A1', 'target resolved', target.error === undefined,
        target.error ?? (target.kind === 'tgz' ? 'tgz ' + target.tgzPath : 'payload dir ' + target.payloadDir));
    if (target.error !== undefined) return result;

    let entries;
    let payloadHashes;
    if (target.kind === 'tgz') {
        const buffer = readFileSync(target.tgzPath);
        // A2 is decided from the RAW BYTES, before anything is unpacked: a .tgz whose payload still
        // unpacks to the same files must already be refused here (V19-F5), so a tar that cannot even
        // be read must not abort the checker -- it must fail A2 and say why.
        let tarError;
        try { entries = readTarball(target.tgzPath); } catch (error) { entries = undefined; tarError = String(error?.message ?? error); }
        const names = entries === undefined ? [] : entries.map((entry) => entry.name);
        const dirEntries = entries === undefined ? [] : entries.filter((entry) => entry.typeflag === '5');
        const artifact = { sha256: sha256(buffer), bytes: buffer.length, entriesNow: entries === undefined ? 0 : entries.length, names };
        result.artifact = artifact;
        add('A2', 'tarball sha256 + bytes + entries match the shipped v19 artefact',
            entries !== undefined && artifact.sha256 === FROZEN_TARBALL.sha256 && artifact.bytes === FROZEN_TARBALL.bytes && entries.length === FROZEN_TARBALL.entries,
            'sha256 ' + artifact.sha256 + ' · bytes ' + artifact.bytes + ' · entries ' + artifact.entriesNow
                + (tarError === undefined ? '' : ' · tar unreadable: ' + tarError));
        const missing = REQUIRED_ENTRIES.filter((name) => !names.includes(name));
        const junk = [];
        for (const pattern of JUNK_PATTERNS) {
            const hits = names.filter((name) => pattern.re.test(name));
            if (hits.length > 0) junk.push(pattern.label + '=' + hits.length + ' (' + hits.slice(0, 3).join(', ') + ')');
        }
        add('A6', 'entries: 133 total, 0 directory entries, 6/6 required, 0 junk',
            entries !== undefined && dirEntries.length === 0 && missing.length === 0 && junk.length === 0,
            'dirEntries=' + dirEntries.length + ' missing=' + (missing.length === 0 ? 'none' : missing.join(','))
                + ' junk=' + (junk.length === 0 ? 'none' : junk.join(' ; '))
                + (tarError === undefined ? '' : ' · tar unreadable: ' + tarError));
        payloadHashes = entries === undefined ? {} : hashTarballFiles(entries, FROZEN.map((frozen) => frozen.path));
    } else {
        add('A2', 'tarball sha256 + bytes + entries', 'skip', 'n/a — target is an unpacked payload dir');
        add('A6', 'entries: 133 total, 0 directory entries, 6/6 required, 0 junk', 'skip', 'n/a — target is an unpacked payload dir');
        payloadHashes = hashDirFiles(target.payloadDir, FROZEN.map((frozen) => frozen.path));
    }

    const sourceHashes = hashDirFiles(pluginDir, FROZEN.map((frozen) => frozen.path));
    const sourceRows = compareRows(sourceHashes, sourceHashes, 'source');
    const payloadRows = compareRows(payloadHashes, sourceHashes, 'payload');
    result.rows = payloadRows;
    result.diffs = diffLines(payloadRows).concat(diffLines(sourceRows));

    const sourceBad = sourceRows.filter((row) => !row.same);
    add('A3', 'frozen table (13 files) matches the working tree on disk',
        sourceBad.length === 0,
        sourceBad.length === 0 ? '13/13 same as source' : 'MISMATCH ' + sourceBad.map((row) => row.path).join(','));

    const payloadBad = payloadRows.filter((row) => !row.same);
    add('A4', 'payload inside the artefact matches the frozen table (per-file, applies=true)',
        payloadBad.length === 0,
        payloadBad.length === 0 ? '13/13 same as frozen (each row applies=true)' : 'MISMATCH ' + payloadBad.map((row) => row.path).join(','));

    const installed = result.installed;
    if (installed.missing === true) {
        add('A5', 'three-way: source ↔ payload ↔ installed copy (' + PROFILE + ')',
            'fail',
            'FAIL — installed copy missing at ' + installDir + '; the three-way check cannot be skipped. Run the round that installs profile ' + PROFILE + '.');
    } else {
        const installedHashes = hashDirFiles(installDir, FROZEN.map((frozen) => frozen.path));
        const installedRows = compareRows(installedHashes, installedHashes, 'installed');
        const installedBad = installedRows.filter((row) => !row.same);
        const lintOk = installed.lstat !== undefined && installed.lstat.isSymbolicLink === false && installed.lstat.isDirectory === true;
        const versionOk = installed.version === '0.2.0-dev.0';
        add('A5', 'three-way: source ↔ payload ↔ installed copy (' + PROFILE + ')',
            installedBad.length === 0 && lintOk && versionOk,
            'isSymlink=' + (installed.lstat?.isSymbolicLink) + ' version=' + installed.version
                + ' files=' + (installedRows.length - installedBad.length) + '/13 same'
                + (installedBad.length === 0 ? '' : ' MISMATCH ' + installedBad.map((row) => row.path).join(',')));
        result.installedRows = installedRows;
        result.diffs = result.diffs.concat(diffLines(installedRows));
    }

    result.ok = checks.every((check) => check.pass === true || check.pass === 'skip');
    return result;
}

// --------------------------------------------------------------------- output
function printTable(rows, installedRows) {
    const installedByPath = {};
    for (const row of installedRows ?? []) installedByPath[row.path] = row.actual;
    console.log(pad('file', 40) + pad('frozen sha/bytes', 26) + pad('source', 20) + pad('payload', 20) + pad('installed', 20) + pad('applies', 8) + 'verdict');
    for (const row of rows) {
        const inst = installedByPath[row.path];
        const fmt = (value) => (value === undefined ? 'MISSING' : short(value.sha256) + '/' + value.bytes);
        console.log(pad(row.path, 40)
            + pad(short(row.frozen.sha256) + '/' + row.frozen.bytes, 26)
            + pad(fmt(row.source), 20)
            + pad(fmt(row.actual), 20)
            + pad(fmt(inst), 20)
            + pad('true', 8)
            + (row.same ? 'SAME' : 'DIFF'));
    }
}

function printResult(result) {
    console.log('=== t118 pack verifier — vong 19 artefact (tests/tmp/t121) ===');
    console.log('frozen table measured at ' + FROZEN_MEASURED_AT + ' (t118; 13 files: 12 lib/** + package.json)');
    console.log('target          ' + (result.target.abs ?? result.targetArg) + ' (' + (result.target.kind ?? 'unresolved') + ')');
    const artifact = result.artifact;
    console.log('sha256Now       ' + (artifact ? artifact.sha256 : 'n/a (unpacked payload dir)'));
    console.log('bytesNow        ' + (artifact ? artifact.bytes : 'n/a'));
    console.log('entriesNow      ' + (artifact ? artifact.entriesNow : 'n/a'));
    console.log('applies=true    every row below is a real byte comparison; DIFF rows carry delta bytes');
    console.log('');
    printTable(result.rows, result.installedRows);
    console.log('');
    for (const diff of result.diffs) console.log(diff);
    if (result.diffs.length > 0) console.log('');
    for (const check of result.checks) {
        const state = check.pass === true ? 'PASS' : check.pass === 'skip' ? 'SKIP' : 'FAIL';
        console.log(state + ' ' + check.id + ' ' + check.label);
        console.log('      | ' + check.detail);
    }
    const failed = result.checks.filter((check) => check.pass !== true && check.pass !== 'skip');
    console.log('');
    if (result.ok) {
        console.log('VERDICT PASS — ' + result.checks.filter((check) => check.pass === true).length + '/6 checks passed');
    } else {
        console.log('VERDICT FAIL — ' + failed.length + ' check(s) failed: ' + failed.map((check) => check.id + ' ' + check.label).join(' | '));
    }
    return result.ok ? 0 : 1;
}

// ---------------------------------------------------------------------- fresh
function packOnce(destDir, label) {
    rmSync(destDir, { recursive: true, force: true });
    mkdirSync(destDir, { recursive: true });
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['pack', '--pack-destination', destDir],
        { cwd: pluginDir, encoding: 'utf8', shell: process.platform === 'win32', timeout: 300000 });
    const names = readdirSync(destDir).filter((name) => name.endsWith('.tgz'));
    const tgzPath = names.length === 1 ? join(destDir, names[0]) : undefined;
    return {
        label,
        destDir,
        tgzPath,
        status: result.status,
        stdoutTail: (result.stdout ?? '').split('\n').filter(Boolean).slice(-3).join(' | '),
        stderrTail: (result.stderr ?? '').slice(-400),
    };
}

function entryDigest(tgzPath) {
    const entries = readTarball(tgzPath);
    const map = new Map();
    for (const entry of entries) {
        map.set(entry.name, entry.body === undefined ? 'dir' : sha256(entry.body));
    }
    return { entries, map };
}

function comparePacks(first, second) {
    const a = entryDigest(first.tgzPath);
    const b = entryDigest(second.tgzPath);
    const names = [];
    for (const name of new Set([...a.map.keys(), ...b.map.keys()])) {
        if (a.map.get(name) !== b.map.get(name)) names.push(name);
    }
    names.sort();
    return { entriesA: a.entries.length, entriesB: b.entries.length, differing: names };
}

function runFresh() {
    const stamp = new Date().toISOString().replace(/[:.]/gu, '-');
    mkdirSync(workDir, { recursive: true });
    const first = packOnce(join(workDir, 'fresh-' + stamp, 'a'), 'pack-1');
    const second = packOnce(join(workDir, 'fresh-' + stamp, 'b'), 'pack-2');
    const bad = [];
    if (first.tgzPath === undefined || first.status !== 0) bad.push('pack-1 failed (status=' + first.status + ') ' + first.stderrTail);
    if (second.tgzPath === undefined || second.status !== 0) bad.push('pack-2 failed (status=' + second.status + ') ' + second.stderrTail);
    if (bad.length > 0) {
        console.log('=== t118 --fresh: pack failed ===');
        for (const line of bad) console.log(line);
        console.log('VERDICT FAIL');
        return 1;
    }
    const bufferA = readFileSync(first.tgzPath);
    const bufferB = readFileSync(second.tgzPath);
    const comparator = comparePacks(first, second);
    const identical = sha256(bufferA) === sha256(bufferB) && bufferA.length === bufferB.length && comparator.differing.length === 0;
    console.log('=== t118 --fresh: two independent npm pack runs into new directories ===');
    console.log('pack-1 dir      ' + first.destDir);
    console.log('pack-1          sha256 ' + sha256(bufferA) + ' · bytes ' + bufferA.length + ' · entries ' + comparator.entriesA);
    console.log('pack-2 dir      ' + second.destDir);
    console.log('pack-2          sha256 ' + sha256(bufferB) + ' · bytes ' + bufferB.length + ' · entries ' + comparator.entriesB);
    console.log('pack-identical  ' + identical);
    if (comparator.differing.length > 0) {
        console.log('differing entries (' + comparator.differing.length + '): ' + comparator.differing.slice(0, 20).join(', '));
    }
    console.log('artifact-match  ' + (sha256(bufferA) === FROZEN_TARBALL.sha256 && bufferA.length === FROZEN_TARBALL.bytes));
    console.log('');
    const analysed = analyse(first.tgzPath);
    const verdict = printResult(analysed);
    const ok = identical && analysed.ok && sha256(bufferA) === FROZEN_TARBALL.sha256 && bufferA.length === FROZEN_TARBALL.bytes;
    console.log('');
    console.log(ok ? 'VERDICT PASS — 2 packs are byte-identical and equal the shipped v18 artefact' : 'VERDICT FAIL — two-pack equality or artefact identity broken');
    return ok ? 0 : 1;
}

// ------------------------------------------------------------------ negative
/** Unpack the shipped tarball into tests/tmp/t118/payload-neg and add ONE byte to lib/state.js. */
function shippedTarballPath() {
    const resolved = resolveTarget(artifactDir);
    return resolved.error === undefined && resolved.kind === 'tgz' ? resolved.tgzPath : join(artifactDir, TARBALL_NAME);
}

function prepareNegative() {
    const dir = join(workDir, 'payload-neg');
    rmSync(dir, { recursive: true, force: true });
    const tgzPath = shippedTarballPath();
    const entries = readTarball(tgzPath);
    let written = 0;
    for (const entry of entries) {
        if (entry.body === undefined) continue;
        const rel = entry.name.replace(/^package\//u, '');
        if (rel === entry.name) continue;
        const abs = join(dir, ...rel.split('/'));
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, entry.body);
        written += 1;
    }
    const victim = join(dir, 'lib', 'state.js');
    const before = readFileSync(victim);
    writeFileSync(victim, Buffer.concat([before, Buffer.from([0x21])]));
    const after = readFileSync(victim);
    return { dir, victim: 'lib/state.js', beforeBytes: before.length, afterBytes: after.length, written, tgzPath };
}

function runPayloadNegative() {
    const prepared = prepareNegative();
    console.log('=== t118 --negative (a): 1-byte mutation in an unpacked copy ===');
    console.log('unpacked        ' + prepared.written + ' files from ' + prepared.tgzPath);
    console.log('mutated         ' + prepared.victim + ' ' + prepared.beforeBytes + ' -> ' + prepared.afterBytes + ' bytes (+1)');
    console.log('');
    const result = analyse(prepared.dir);
    const verdict = printResult(result);
    const caught = result.ok === false && result.diffs.some((line) => line.includes('lib/state.js') && line.includes('delta=+1'));
    console.log('');
    console.log('NEGATIVE        caught=' + caught + ' analyzeExit=' + verdict + ' dir=' + prepared.dir);
    console.log(caught
        ? 'PAYLOAD-NEGATIVE PASS — the checker refuses a 1-byte payload mutation and names lib/state.js with delta=+1'
        : 'PAYLOAD-NEGATIVE FAIL — the mutation was NOT caught; the checker is not trustworthy');
    return caught ? 0 : 1;
}

// --------------------------------------------------------------- .tgz copy flip
/**
 * V19-F5: the round-18 negative only mutated an UNPACKED payload. A tarball that still unpacks to the
 * very same files -- one flipped byte in the gzip MTIME field -- must be refused by A2 (sha256/bytes)
 * while A4 (payload) stays green, which is what proves the artefact identity check runs FIRST.
 */
function runTgzFlip() {
    const source = shippedTarballPath();
    if (!existsSync(source)) {
        console.log('TGZ-FLIP FAIL — source tarball missing: ' + source);
        return 1;
    }
    rmSync(FLIP_DIR, { recursive: true, force: true });
    mkdirSync(FLIP_DIR, { recursive: true });
    const copyPath = join(FLIP_DIR, TARBALL_NAME);
    const original = readFileSync(source);
    const copy = Buffer.from(original);
    const FLIP_OFFSET = 8; // gzip MTIME byte: header metadata, outside the deflate stream
    copy[FLIP_OFFSET] = copy[FLIP_OFFSET] ^ 0x01;
    writeFileSync(copyPath, copy);

    const shaOriginal = sha256(original);
    const shaCopy = sha256(copy);
    const entriesOriginal = readTarball(source);
    const entriesCopy = readTarball(copyPath);
    const payloadIdentical = entriesOriginal.length === entriesCopy.length
        && entriesOriginal.every((entry, index) => entry.name === entriesCopy[index].name
            && entry.size === entriesCopy[index].size
            && (entry.body === undefined || entry.body.equals(entriesCopy[index].body)));

    console.log('=== t118 --tgz-flip (b): 1 byte flipped INSIDE A COPY of the .tgz ===');
    console.log('source          ' + source);
    console.log('source sha256   ' + shaOriginal + ' · bytes ' + original.length);
    console.log('copy            ' + copyPath);
    console.log('copy   sha256   ' + shaCopy + ' · bytes ' + copy.length + ' (same length: ' + (copy.length === original.length) + ')');
    console.log('copy unpacks to ' + entriesCopy.length + ' entries; payload identical to the original: ' + payloadIdentical);
    console.log('');

    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--analyze', copyPath], {
        cwd: repoRoot, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024,
    });
    const out = (child.stdout ?? '') + (child.stderr ?? '');
    const a2Fail = /^FAIL A2 /mu.test(out);
    const a4Pass = /^PASS A4 /mu.test(out);
    const a2Detail = (out.match(/^ {6}\| sha256 .*$/mu) ?? [''])[0].trim();
    const originalResult = analyse(source);

    console.log('analyze(copy)   exit=' + child.status + ' · A2 fails=' + a2Fail + ' · A4 passes=' + a4Pass);
    console.log('A2 line         ' + a2Detail);
    console.log('analyze(orig)   ok=' + originalResult.ok + ' · sha256Now=' + (originalResult.artifact === undefined ? 'n/a' : originalResult.artifact.sha256));
    const caught = child.status === 1 && a2Fail && a4Pass
        && copy.length === original.length && shaCopy !== shaOriginal && payloadIdentical
        && originalResult.ok === true;
    console.log('');
    console.log('TGZ-FLIP        caught=' + caught + ' flippedOffset=' + FLIP_OFFSET + ' bytesSame=' + (copy.length === original.length)
        + ' shaMoved=' + (shaCopy !== shaOriginal) + ' payloadIdentical=' + payloadIdentical
        + ' copyExit=' + child.status + ' originalExit=' + (originalResult.ok ? 0 : 1));
    console.log(caught
        ? 'TGZ-FLIP PASS — a 1-byte .tgz copy whose payload still unpacks identically is refused at A2 while A4 stays green, and the original still passes'
        : 'TGZ-FLIP FAIL — the .tgz mutation was not refused at A2 first, or the original no longer passes');
    return caught ? 0 : 1;
}

function runNegative() {
    const payloadVerdict = runPayloadNegative();
    console.log('');
    const flipVerdict = runTgzFlip();
    console.log('');
    const combined = payloadVerdict === 0 && flipVerdict === 0 ? 0 : 1;
    console.log('NEGATIVE combined: payloadMutationExit=' + payloadVerdict + ' tgzFlipExit=' + flipVerdict + ' combinedExit=' + combined);
    return combined;
}

// --------------------------------------------------------------- compare mode
/** Prove the 'packs differ' branch: names every entry whose bytes disagree between two tarballs. */
function runComparePacks(firstArg, secondArg) {
    if (firstArg === undefined || secondArg === undefined) {
        console.log('usage: node tests/t118-pack.mjs --compare-packs <a.tgz> <b.tgz>');
        return 2;
    }
    const firstPath = resolve(firstArg);
    const secondPath = resolve(secondArg);
    for (const path of [firstPath, secondPath]) {
        if (!existsSync(path)) { console.log('FAIL missing tarball: ' + path); return 1; }
    }
    const comparator = comparePacks({ tgzPath: firstPath }, { tgzPath: secondPath });
    const bytesA = readFileSync(firstPath);
    const bytesB = readFileSync(secondPath);
    const identical = sha256(bytesA) === sha256(bytesB) && bytesA.length === bytesB.length && comparator.differing.length === 0;
    console.log('=== t118 --compare-packs ===');
    console.log('a  ' + firstPath);
    console.log('   sha256 ' + sha256(bytesA) + ' · bytes ' + bytesA.length + ' · entries ' + comparator.entriesA);
    console.log('b  ' + secondPath);
    console.log('   sha256 ' + sha256(bytesB) + ' · bytes ' + bytesB.length + ' · entries ' + comparator.entriesB);
    console.log('identical        ' + identical);
    console.log('differing (' + comparator.differing.length + '):');
    for (const name of comparator.differing.slice(0, 40)) console.log('  ' + name);
    if (comparator.differing.length > 40) console.log('  ... ' + (comparator.differing.length - 40) + ' more');
    console.log(identical ? 'VERDICT identical' : 'VERDICT differs — the entries above are the real byte differences');
    return identical ? 0 : 1;
}

// ---------------------------------------------------------------------- main
function main() {
    const args = process.argv.slice(2);
    const flag = (name) => args.includes(name);
    const valueOf = (name) => {
        const index = args.indexOf(name);
        return index >= 0 && args[index + 1] !== undefined && !args[index + 1].startsWith('--') ? args[index + 1] : undefined;
    };
    if (flag('--fresh')) return runFresh();
    if (flag('--negative')) return runNegative();
    if (flag('--tgz-flip')) return runTgzFlip();
    if (flag('--compare-packs')) {
        const index = args.indexOf('--compare-packs');
        return runComparePacks(args[index + 1], args[index + 2]);
    }
    const target = valueOf('--analyze') ?? args.find((item) => !item.startsWith('--')) ?? artifactDir;
    const result = analyse(target);
    return printResult(result);
}

process.exitCode = main();
