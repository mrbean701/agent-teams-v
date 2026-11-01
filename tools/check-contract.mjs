#!/usr/bin/env node
/**
 * tools/check-contract.mjs — the task-contract gate, run BEFORE a card is dispatched.
 *
 * WHY: in 18 audit rounds the captain shipped contracts that could not be executed: verify
 * commands pointing at files that do not exist (t74 'the ghost file', t103
 * tests/t43-set-member-profile.mjs, t111 tests/t111-pack.mjs in the wrong directory) left finished
 * work stuck in_progress; and cards created without an assignee were claimed cross-member five
 * times in one day (t110, t113, t114). Both classes are machine-detectable before dispatch.
 *
 * The gate reads ONLY the ledger (team.json) and the file system. It never runs a verify command,
 * so PASS here means 'the contract is executable', never 'the work is correct'.
 *
 *   node tools/check-contract.mjs --state <dir> --task <id> [--json] [--pre]
 *
 * exit 0 = every check PASS, 1 = at least one FAIL, 2 = the input itself could not be read.
 *
 * --pre runs the SAME six checks and returns the SAME verdict/exit code; it only changes what the
 * tool says about the moment it was called: 'if this card goes terminal now, the FAIL is frozen,
 * because a terminal contract is immutable — fix (x) first'. It is not a second, gentler gate and it
 * adds no exemption: t117's contract was wrong only because the gate's verdict arrived after the card
 * was completed, and a check that can be run only after the damage is not a check.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.agent-teams', 'tmp', 'build', 'dist', '.pnpm', 'coverage']);
const DEPTH_LIMIT = 5;

function parseArgs(argv) {
    const out = { state: undefined, task: undefined, json: false, pre: false, errors: [] };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--json') { out.json = true; continue; }
        if (arg === '--pre') { out.pre = true; continue; }
        if (arg === '--state') { out.state = argv[i + 1]; i += 1; continue; }
        if (arg === '--task') { out.task = argv[i + 1]; i += 1; continue; }
        out.errors.push('unknown argument ' + JSON.stringify(arg));
    }
    if (out.state === undefined) out.errors.push('--state <dir> is required');
    if (out.task === undefined) out.errors.push('--task <id> is required');
    return out;
}

function resolveStateDir(value) {
    const direct = resolve(process.cwd(), value);
    if (existsSync(direct)) return direct;
    if (!isAbsolute(value)) {
        const fromRepo = resolve(REPO_ROOT, value);
        if (existsSync(fromRepo)) return fromRepo;
    }
    return direct;
}

function toList(value) {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value.filter((entry) => typeof entry === 'string' && entry.trim() !== '');
    if (typeof value === 'string' && value.trim() !== '') return [value];
    return [];
}

function normalise(value) {
    return String(value).trim().replace(/\\/gu, '/').replace(/\/+$/u, '');
}

function isAbsolutePath(value) {
    const text = String(value).trim();
    return /^[A-Za-z]:[\\/]/u.test(text) || text.startsWith('/') || text.startsWith('\\\\');
}

function coversOrEquals(entry, item) {
    return item === entry || item.startsWith(entry + '/');
}

function walkFiles(root, collected, depth) {
    if (depth > DEPTH_LIMIT) return;
    let entries = [];
    try {
        entries = readdirSync(root, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '.') continue;
        const full = join(root, entry.name);
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walkFiles(full, collected, depth + 1);
            continue;
        }
        if (entry.isFile()) collected.push(full);
    }
}

function collectCandidates() {
    const roots = [];
    const packagesDir = join(REPO_ROOT, 'packages');
    if (existsSync(packagesDir)) {
        for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const testsDir = join(packagesDir, entry.name, 'tests');
            if (existsSync(testsDir)) roots.push(testsDir);
        }
    }
    const repoTests = join(REPO_ROOT, 'tests');
    if (existsSync(repoTests)) roots.push(repoTests);
    const collected = [];
    for (const root of roots) walkFiles(root, collected, 0);
    return collected;
}

function baseNameOf(value) {
    const text = normalise(value);
    const cut = text.lastIndexOf('/');
    return cut < 0 ? text : text.slice(cut + 1);
}

function nameScore(want, have) {
    const strip = (value) => value.replace(/\.(m?js|cjs|ts)$/u, '').toLowerCase();
    const left = strip(want);
    const right = strip(have);
    let prefix = 0;
    while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
    const rightTokens = new Set(right.split('-'));
    let shared = 0;
    for (const token of left.split('-')) {
        if (token.length > 1 && rightTokens.has(token)) shared += 1;
    }
    return Math.max(prefix, shared * 5);
}

function suggestFor(target) {
    const want = baseNameOf(target);
    const candidates = collectCandidates();
    const exact = [];
    const similar = [];
    for (const full of candidates) {
        const have = baseNameOf(full);
        const shown = normalise(full.slice(REPO_ROOT.length + 1));
        if (have === want) exact.push(shown);
        else if (nameScore(want, have) >= 6) similar.push({ shown, score: nameScore(want, have) });
    }
    similar.sort((a, b) => b.score - a.score);
    return exact.concat(similar.map((entry) => entry.shown)).slice(0, 3);
}

function nodeTargets(command) {
    let rest = String(command).trim();
    let base = '';
    const cd = /^cd\s+(\S+)\s*&&\s*(.*)$/iu.exec(rest);
    if (cd !== null) {
        base = cd[1];
        rest = cd[2].trim();
    }
    const tokens = rest.split(/\s+/u).filter((token) => token !== '');
    if (tokens.length === 0) return [];
    if (!/^node(\.exe)?$/iu.test(tokens[0])) return [];
    const target = tokens.slice(1).find((token) => !token.startsWith('-'));
    if (target === undefined) return [];
    return [{ base, target }];
}
function plannedByTask(task) {
    const planned = new Set();
    for (const entry of toList(task.deliverables)) {
        planned.add(normalise(entry));
    }
    return planned;
}

function checkVerifyFiles(task) {
    const planned = plannedByTask(task);
    const commands = toList(task.verify);
    if (commands.length === 0) {
        return { id: 'a', label: 'verify targets exist', ok: true, detail: 'no verify command declared — (c) decides whether that is legal for this kind' };
    }
    const failures = [];
    const notes = [];
    for (const command of commands) {
        const targets = nodeTargets(command);
        if (targets.length === 0) {
            notes.push('skipped, not a "node <path>" command: ' + command);
            continue;
        }
        for (const entry of targets) {
            const full = resolve(REPO_ROOT, entry.base, entry.target);
            if (existsSync(full) && statSync(full).isFile()) {
                notes.push('exists: ' + entry.target);
                continue;
            }
            const key = normalise(entry.base === '' ? entry.target : entry.base + '/' + entry.target);
            if (planned.has(key) || planned.has(normalise(entry.target))) {
                notes.push('planned by this task (declared in deliverables): ' + entry.target);
                continue;
            }
            const suggestion = suggestFor(entry.target);
            failures.push('missing: ' + entry.target
                + (entry.base === '' ? '' : ' (relative to ' + entry.base + ')')
                + (suggestion.length === 0 ? ' — no file of that name anywhere under packages/**/tests/ or tests/' : ' — nearest real file: ' + suggestion.join(' | ')));
        }
    }
    const verifyFailures = failures;
    return { id: 'a', label: 'verify targets exist', ok: verifyFailures.length === 0, detail: failures.concat(notes).join('; ') };
}

function checkAssignee(task) {
    const assignee = String(task.assignee ?? '').trim();
    if (assignee === '') {
        return { id: 'b', label: 'the card has an owner', ok: false, detail: 'card ở pool chung — member sẽ claim chéo (set assignee when the card is created, then brief that member only)' };
    }
    return { id: 'b', label: 'the card has an owner', ok: true, detail: 'assignee=' + assignee };
}

function uniqStrings(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        if (seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}

function checkKindFields(task) {
    const kind = String(task.kind ?? '').trim();
    const problems = [];
    const has = (names) => names.some((name) => typeof task[name] === 'string' && task[name].trim() !== '');
    if (kind === 'review') {
        if (!has(['reviewedTaskId', 'reviewed_task_id'])) problems.push('kind=review requires reviewedTaskId: which task is being reviewed');
    } else if (kind === 'repair') {
        if (!has(['sourceTaskId', 'source_task_id'])) problems.push('kind=repair requires sourceTaskId: which finding it repairs');
    } else if (kind === 'implementation') {
        if (toList(task.verify).length === 0) problems.push('kind=implementation requires at least one verify command');
    } else if (kind === '') {
        problems.push('kind is empty — expected one of requirements, implementation, verification, review, repair, integration, work');
    }
    const ok = problems.length === 0;
    return { id: 'c', label: 'the fields this kind requires are present', ok, detail: ok ? 'kind=' + kind : problems.join('; ') };
}

function checkScopeShape(task) {
    const scope = toList(task.inScope);
    const problems = [];
    if (scope.length === 0) problems.push('inScope is empty — the card does not bound the work');
    for (const entry of scope) {
        if (isAbsolutePath(entry)) problems.push('inScope contains an absolute path: ' + entry + ' (paths are workspace-relative POSIX)');
    }
    const ok = problems.length === 0;
    return { id: 'd', label: 'inScope is non-empty and relative', ok, detail: ok ? scope.length + ' entries' : problems.join('; ') };
}

function checkDeliverables(task) {
    const declared = toList(task.deliverables).concat(toList(task.deliverable));
    if (declared.length === 0) {
        return { id: 'e', label: 'every deliverable sits inside inScope', ok: true, detail: 'no deliverables declared — nothing to compare' };
    }
    const scope = toList(task.inScope).map(normalise);
    const outside = [];
    for (const item of uniqStrings(declared.map(normalise))) {
        if (scope.some((entry) => coversOrEquals(entry, item))) continue;
        outside.push(item);
    }
    const ok = outside.length === 0;
    return {
        id: 'e',
        label: 'every deliverable sits inside inScope',
        ok,
        detail: ok ? declared.length + ' deliverable(s), all inside inScope' : 'deliverable outside inScope: ' + outside.join(', ') + ' — refuse at dispatch, the owner would have to edit a file it is forbidden to touch',
    };
}

function checkScopeOverlap(task) {
    const scope = toList(task.inScope).map(normalise);
    const out = toList(task.outOfScope).map(normalise);
    const clashes = [];
    for (const banned of out) {
        if (banned === '') continue;
        for (const entry of scope) {
            if (coversOrEquals(banned, entry)) clashes.push('outOfScope "' + banned + '" covers inScope "' + entry + '"');
        }
    }
    const ok = clashes.length === 0;
    return { id: 'f', label: 'outOfScope does not cover an inScope entry', ok, detail: ok ? (out.length === 0 ? 'no outOfScope declared' : out.length + ' outOfScope entries, no overlap') : clashes.join('; ') };
}

function runChecks(task) {
    return [
        checkVerifyFiles(task),
        checkAssignee(task),
        checkKindFields(task),
        checkScopeShape(task),
        checkDeliverables(task),
        checkScopeOverlap(task),
    ];
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.errors.length > 0) {
        for (const message of args.errors) console.error('GATE ERROR: ' + message);
        console.error('usage: node tools/check-contract.mjs --state <dir> --task <id> [--json] [--pre]');
        return 2;
    }
    const stateDir = resolveStateDir(args.state);
    const teamPath = join(stateDir, 'team.json');
    if (!existsSync(teamPath)) {
        console.error('GATE ERROR: no team.json under state dir ' + stateDir);
        return 2;
    }
    let team = undefined;
    try {
        team = JSON.parse(readFileSync(teamPath, 'utf8'));
    } catch (error) {
        console.error('GATE ERROR: team.json is not valid JSON: ' + String(error && error.message));
        return 2;
    }
    const tasks = Array.isArray(team?.tasks) ? team.tasks : [];
    const task = tasks.find((entry) => String(entry?.id ?? '') === String(args.task));
    if (task === undefined) {
        console.error('GATE ERROR: task ' + args.task + ' does not exist in ' + teamPath + ' (' + tasks.length + ' tasks: ' + tasks.map((entry) => entry.id).join(', ') + ')');
        return 2;
    }
    const checks = runChecks(task);
    const failed = checks.filter((entry) => entry.ok !== true);
    const exitCode = failed.length === 0 ? 0 : 1;
    const failedIds = failed.map((entry) => '(' + entry.id + ')');
    // The verdict is the same in both modes; only the sentence that names the MOMENT differs. --pre is
    // meant to be run before the captain writes 'completed', when a FAIL can still be repaired.
    const terminalConclusion = failed.length === 0
        ? 'recording completion for ' + String(task.id) + ' is legal right now — the contract would stay PASS'
        : 'recording completion for ' + String(task.id) + ' now would freeze a ' + 'FAILED contract (a terminal card is immutable) — repair ' + failedIds.join(' ') + ' first, then re-run this gate until it exits 0';
    const report = {
        state: normalise(stateDir),
        task: String(task.id),
        kind: String(task.kind ?? ''),
        assignee: String(task.assignee ?? ''),
        checks,
        verdict: exitCode === 0 ? 'PASS' : 'FAIL',
        exitCode,
        mode: args.pre ? 'pre' : 'normal',
        preTerminal: args.pre === true,
        terminalBlocked: failed.length > 0,
        terminalConclusion,
    };
    if (args.json) {
        console.log(JSON.stringify(report, null, 1));
        return exitCode;
    }
    console.log('contract gate' + (args.pre ? ' [PRE-TERMINAL]' : '') + ' — task ' + report.task + ' · kind=' + (report.kind || '(empty)') + ' · assignee=' + (report.assignee || '(none)'));
    for (const entry of checks) {
        console.log((entry.ok === true ? 'PASS ' : 'FAIL ') + '(' + entry.id + ') ' + entry.label + ' — ' + entry.detail);
    }
    console.log('');
    console.log('verdict ' + report.verdict + ' — ' + (checks.length - failed.length) + '/' + checks.length + ' checks passed'
        + (failed.length === 0 ? '' : ' — failed: ' + failedIds.join(' ')));
    if (args.pre) {
        console.log('PRE-TERMINAL ' + report.verdict + ' — ' + terminalConclusion);
        console.log(failed.length === 0
            ? 'PRE-TERMINAL: no repair needed; run the card to completion.'
            : 'PRE-TERMINAL: do NOT record completion yet — fix ' + failedIds.join(' ') + ', then re-run: node tools/check-contract.mjs --state <dir> --task ' + String(task.id) + ' --pre');
    }
    console.log('EXIT ' + exitCode);
    return exitCode;
}

process.exit(main());
