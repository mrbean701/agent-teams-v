#!/usr/bin/env node
/**
 * t114 — proof that the LIVE suite cannot boot on source other than the frozen table.
 *
 * Why: BUG-028. At 01:03:11Z the live boot tests/t59-erp-live-copy.mjs printed the OLD status
 * title while the tree on disk only contains the new one. Both dogfood profiles are symlinks to
 * packages/dsh-agent-teams, so that boot could only have read different bytes than the source this
 * document describes — and no gate noticed. t59 now fingerprints the 13 frozen files before and
 * after every boot and refuses the run (C10) when the bytes are not the frozen bytes.
 *
 *   node tests/t114-source-freeze.mjs
 *
 * The mechanism is proved WITHOUT touching a source file: the two helpers are sliced out of the
 * live suite and run here, and every mutation happens on a COPY under tests/tmp/t114/tree.
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const PKG = join(REPO_ROOT, 'packages', 'dsh-agent-teams');
const LIVE = join(HERE, 't59-erp-live-copy.mjs');
const TMP = join(HERE, 'tmp', 't114');
const TREE = join(TMP, 'tree');

const checks = [];
function check(id, title, ok, evidence) {
    checks.push({ id, title, ok: ok === true, evidence: String(evidence ?? '') });
    console.log((ok === true ? 'PASS ' : 'FAIL ') + id + ' — ' + title);
    if (evidence !== undefined) console.log('      evidence: ' + evidence);
    return ok === true;
}

/** Copy a function declaration out of the live suite by counting braces. */
function sliceFunction(source, name) {
    let start = -1;
    for (const candidate of ['async function ' + name + '(', 'function ' + name + '(']) {
        const at = source.indexOf(candidate);
        if (at >= 0) { start = at; break; }
    }
    if (start < 0) throw new Error('function ' + name + ' is not declared in the live suite');
    let depth = 0;
    let seen = false;
    for (let i = start; i < source.length; i += 1) {
        const ch = source[i];
        if (ch === '{') { depth += 1; seen = true; continue; }
        if (ch === '}') {
            depth -= 1;
            if (seen && depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error('unbalanced braces while slicing ' + name);
}

/** The frozen table as the live suite declares it — parsed, never hard-coded a second time. */
function parseFrozen(source) {
    const start = source.indexOf('const FROZEN = [');
    if (start < 0) throw new Error('the live suite does not declare const FROZEN = [');
    const end = source.indexOf('];', start);
    if (end < 0) throw new Error('const FROZEN = [ is not closed');
    const block = source.slice(start, end);
    const rows = [];
    const re = /\{ path: '([^']+)', sha256: '([0-9a-f]{64})', bytes: (\d+) \}/g;
    let match = re.exec(block);
    while (match !== null) {
        rows.push({ path: match[1], sha256: match[2], bytes: Number(match[3]) });
        match = re.exec(block);
    }
    return rows;
}

async function hashFile(path) {
    return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function copyTree(root, rows) {
    await rm(root, { recursive: true, force: true });
    for (const row of rows) {
        const target = join(root, row.path);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(join(PKG, row.path), target);
    }
}

const source = await readFile(LIVE, 'utf8');
const frozen = parseFrozen(source);
const factory = new Function('readFile', 'createHash', 'join', 'FROZEN', 'PKG',
    sliceFunction(source, 'sourceHashesOf') + '\n' + sliceFunction(source, 'sourceProblemsOf')
    + '\nreturn { sourceHashesOf: sourceHashesOf, sourceProblemsOf: sourceProblemsOf };');
const helpers = factory(readFile, createHash, join, frozen, PKG);

// ---------------------------------------------------------------- the table itself
const unique = new Set(frozen.map((row) => row.path));
const wanted = ['lib/tools.js', 'lib/index.js', 'lib/client.js', 'package.json', 'lib/client/ActivityPanel.module.css'];
check('A1', 'the live suite freezes 13 files, each with a 64-hex sha256 and a byte count, and the paths are unique',
    frozen.length === 13 && unique.size === 13 && frozen.every((row) => /^[0-9a-f]{64}$/.test(row.sha256) && Number.isInteger(row.bytes) && row.bytes > 0)
        && wanted.every((path) => unique.has(path)),
    'rows=' + frozen.length + ' unique=' + unique.size + ' paths=' + frozen.map((row) => row.path).join(','));

const live = await helpers.sourceHashesOf();
check('A2', 'sourceHashesOf(root) returns 13 records {path, sha, bytes} for the real package',
    Array.isArray(live) && live.length === 13
        && live.every((row) => typeof row.path === 'string' && /^[0-9a-f]{64}$/.test(row.sha) && Number.isInteger(row.bytes) && row.bytes > 0),
    'records=' + live.length + ' sample=' + JSON.stringify(live[0]));

const liveByPath = new Map(live.map((row) => [row.path, row]));
const tableMismatches = frozen.filter((row) => {
    const seen = liveByPath.get(row.path);
    return seen === undefined || seen.sha !== row.sha256 || seen.bytes !== row.bytes;
});
check('A3', 'every frozen row equals what the helper measures on the real package (path set, sha256 and bytes)',
    tableMismatches.length === 0 && liveByPath.size === frozen.length,
    tableMismatches.length === 0 ? 'all 13 rows agree'
        : 'mismatches=' + JSON.stringify(tableMismatches.map((row) => row.path + ' frozen ' + row.sha256 + '/' + row.bytes + ' measured ' + (liveByPath.get(row.path)?.sha ?? 'missing') + '/' + (liveByPath.get(row.path)?.bytes ?? 'missing'))));

const directMismatches = [];
for (const row of frozen) {
    const fresh = await hashFile(join(PKG, row.path));
    if (fresh !== row.sha256) directMismatches.push(row.path + ' frozen ' + row.sha256 + ' fresh ' + fresh);
}
check('A4', 'the table the live suite declares matches the tree as read directly (regex parse, no second hard-coded copy)',
    frozen.length === 13 && directMismatches.length === 0,
    directMismatches.length === 0 ? 'parsed=' + frozen.length + ' fresh reads=0 drift' : directMismatches.join(' | '));

// ---------------------------------------------------------------- the mechanism on a COPY
await mkdir(TMP, { recursive: true });
await copyTree(TREE, frozen);
const copied = await helpers.sourceHashesOf(TREE);
check('B1', 'the copy under tests/tmp/t114/tree is byte-faithful: the helper reads the same 13 sha256 there',
    copied.length === 13 && copied.every((row) => row.sha === liveByPath.get(row.path)?.sha && row.bytes === liveByPath.get(row.path)?.bytes),
    'copied=' + copied.length + ' identical=' + String(copied.every((row) => row.sha === liveByPath.get(row.path)?.sha)));

const target = join(TREE, 'lib', 'tools.js');
const original = await readFile(target);
const flipped = Buffer.from(original);
flipped[0] = flipped[0] ^ 0x01;
await writeFile(target, flipped);
const afterFlip = await helpers.sourceHashesOf(TREE);
const flipRow = afterFlip.find((row) => row.path === 'lib/tools.js');
check('B2', 'flipping ONE byte of a copied file is detected: the sha256 changes and the frozen value is printed beside it',
    flipRow !== undefined && flipRow.sha !== frozen.find((row) => row.path === 'lib/tools.js')?.sha256
        && flipRow.bytes === frozen.find((row) => row.path === 'lib/tools.js')?.bytes,
    'frozen=' + frozen.find((row) => row.path === 'lib/tools.js')?.sha256 + ' flipped=' + flipRow?.sha + ' bytes=' + flipRow?.bytes);

const problemsFromDrift = helpers.sourceProblemsOf([{ name: 'write', before: copied, after: afterFlip }], frozen);
check('B3', 'sourceProblemsOf reports that drift and names the file with BOTH hashes',
    problemsFromDrift.length > 0 && problemsFromDrift.some((line) => line.includes('lib/tools.js')
        && line.includes(frozen.find((row) => row.path === 'lib/tools.js')?.sha256) && line.includes(flipRow?.sha ?? 'nope')),
    'applies=true delta=0 B (a byte flip keeps the length) problems=' + JSON.stringify(problemsFromDrift));

const truncated = Buffer.from(original).subarray(0, original.length - 1);
await writeFile(target, truncated);
const afterDrop = await helpers.sourceHashesOf(TREE);
const dropRow = afterDrop.find((row) => row.path === 'lib/tools.js');
const dropFrozen = frozen.find((row) => row.path === 'lib/tools.js');
const problemsFromDrop = helpers.sourceProblemsOf([{ name: 'write', before: copied, after: afterDrop }], frozen);
check('B4', 'dropping one byte is detected too, and the byte delta is reported as non-zero',
    problemsFromDrop.length > 0 && dropRow !== undefined && dropFrozen !== undefined
        && dropRow.bytes === dropFrozen.bytes - 1 && dropRow.sha !== dropFrozen.sha256,
    'applies=true delta=' + String((dropRow?.bytes ?? 0) - (dropFrozen?.bytes ?? 0)) + ' B problems=' + JSON.stringify(problemsFromDrop));

// ---------------------------------------------------------------- negative controls
const badPin = frozen.map((row) => (row.path === 'lib/index.js'
    ? { path: row.path, sha256: (row.sha256[0] === '0' ? '1' : '0') + row.sha256.slice(1), bytes: row.bytes }
    : row));
const nibbleDelta = badPin.filter((row, index) => row.sha256 !== frozen[index].sha256).length;
const problemsFromBadPin = helpers.sourceProblemsOf([{ name: 'write', before: live, after: live }], badPin);
const cleanRun = helpers.sourceProblemsOf([{ name: 'write', before: live, after: live }], frozen);
check('E1', 'a frozen pin off by ONE hex nibble is refused, while an untouched table on the same readings passes',
    problemsFromBadPin.length > 0 && problemsFromBadPin.some((line) => line.includes('lib/index.js')) && cleanRun.length === 0,
    'applies=true changedNibbles=' + nibbleDelta + ' delta=0 B (a hex flip keeps the length) badPinProblems=' + JSON.stringify(problemsFromBadPin) + ' cleanProblems=' + JSON.stringify(cleanRun));

const badBytesPin = frozen.map((row) => (row.path === 'lib/members.js' ? { path: row.path, sha256: row.sha256, bytes: row.bytes + 1 } : row));
const problemsFromBadBytes = helpers.sourceProblemsOf([{ name: 'write', before: live, after: live }], badBytesPin);
check('E1b', 'a pin whose byte count is off by one is refused as well, and the byte delta is printed non-zero',
    problemsFromBadBytes.length > 0 && problemsFromBadBytes.some((line) => line.includes('lib/members.js') && line.includes('!= frozen')),
    'applies=true delta=+1 B changedBytes=1 problems=' + JSON.stringify(problemsFromBadBytes));

const noBoots = helpers.sourceProblemsOf([], frozen);
const missingRead = helpers.sourceProblemsOf([{ name: 'write', before: live, after: [] }], frozen);
check('E2', 'a run with no fingerprint, or with a fingerprint missing one file, is refused',
    noBoots.length === 1 && noBoots[0].includes('no boot was fingerprinted')
        && missingRead.length > 0 && missingRead.some((line) => line.includes('no hash recorded')),
    'noBoots=' + JSON.stringify(noBoots) + ' missingRead=' + JSON.stringify(missingRead.slice(0, 2)));

// ---------------------------------------------------------------- a missing file fails loudly
const brokenTree = join(TMP, 'tree-missing');
await copyTree(brokenTree, frozen);
await rm(join(brokenTree, 'lib', 'index.js'));
let missingError = '';
try {
    await helpers.sourceHashesOf(brokenTree);
} catch (error) {
    missingError = String(error?.message ?? error);
}
check('C1', 'a missing frozen file fails with an error that names the file instead of returning a short list',
    /lib[\\/]index\.js/.test(missingError) && /ENOENT/.test(missingError),
    'error=' + missingError);

// ---------------------------------------------------------------- the live suite really gates on this
const mintWired = /bootFingerprint\(sourceBoots, 'mint'/.test(source);
const writeWired = /bootFingerprint\(sourceBoots, 'write'/.test(source);
check('W1', 'both live boots (mint and write) go through bootFingerprint, so no boot runs un-fingerprinted',
    mintWired && writeWired,
    'mintWired=' + String(mintWired) + ' writeWired=' + String(writeWired));

const c10Block = /check\('C10',([\s\S]{0,1600}?)\);/.exec(source)?.[1] ?? '';
const c10Assign = /const sourceProblems = sourceProblemsOf\(sourceBoots, FROZEN\);/.test(source);
const c10Gate = c10Block.includes('sourceProblems.length === 0 && sourceBoots.length > 0');
check('W2', 'C10 is a real check fed by sourceProblemsOf(sourceBoots, FROZEN) and refusing the run on any problem',
    c10Assign && c10Gate && c10Block.includes('SOURCE_DRIFT_NOTE'),
    'assign=' + String(c10Assign) + ' gate=' + String(c10Gate) + ' note=' + String(c10Block.includes('SOURCE_DRIFT_NOTE'))
        + ' block=' + JSON.stringify(c10Block.slice(0, 180)));

const gate = new Function('sourceProblems', 'sourceBoots', 'return (sourceProblems.length === 0 && sourceBoots.length > 0);');
check('W3', 'the C10 boolean itself has teeth: it is true only for an empty problem list AND at least one fingerprinted boot',
    gate([], ['boot']) === true && gate(['drift'], ['boot']) === false && gate([], []) === false,
    'empty+1boot=' + String(gate([], ['boot'])) + ' problem+1boot=' + String(gate(['drift'], ['boot'])) + ' empty+0boots=' + String(gate([], [])));

check('W4', 'the drift note tells the reader what to do, in the wording the contract fixed',
    source.includes('nguồn đã bị ghi trong lúc suite chạy') && source.includes('CHÍNH task đổi lib/**'),
    'note=' + JSON.stringify((/const SOURCE_DRIFT_NOTE = '([^']+)'/.exec(source)?.[1] ?? '')));

const failed = checks.filter((entry) => entry.ok !== true);
console.log('');
console.log('# frozen=' + frozen.length + ' files · helperRecords=' + live.length + ' · problemsOnDrift=' + problemsFromDrift.length + ' · problemsOnBadPin=' + problemsFromBadPin.length);
console.log('# ' + (checks.length - failed.length) + '/' + checks.length + ' passed, ' + failed.length + ' failed');
const code = failed.length === 0 ? 0 : 1;
console.log('EXIT ' + code);
process.exit(code);
