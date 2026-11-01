#!/usr/bin/env node
// tools/test/test-env.mjs — build (or rebuild) the throw-away DSH profile
// "agent-teams-test" that mounts the local fork packages/dsh-agent-teams.
//
// Scope: the draft profile only. It never touches the desktop profile (read as
// a reference for provider rows) and never writes into E:\Project\ERP.
//
// Usage (repo root, any shell):
//   node tools/test/test-env.mjs
//   node tools/test/test-env.mjs --force-patch      # rewrite cordis.patch.yml
//   node tools/test/test-env.mjs --no-borrow-model  # credentials row only
//
// Exit codes: 0 all checks passed, 1 a step failed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    DESKTOP_CLI, DESKTOP_PATCH, REPO_ROOT, TEST_PROFILE, extractRow, profileDir, readJson, report, runDsh,
} from './lib/dsh-cli.mjs';

const argv = process.argv.slice(2);
const forcePatch = argv.includes('--force-patch');
const borrowModel = !argv.includes('--no-borrow-model');
const tmpDir = join(REPO_ROOT, 'tests', 'tmp');
mkdirSync(tmpDir, { recursive: true });

const failures = [];
function step(title, fn) {
    console.log('');
    console.log('--- ' + title);
    const ok = fn();
    if (!ok) failures.push(title);
    return ok;
}

let dumped = null;
function dumpConfig(label) {
    const res = runDsh(['--profile', TEST_PROFILE, '--dump-config'], { timeoutMs: 180000 });
    const file = join(tmpDir, 'dump-' + label + '.yml');
    writeFileSync(file, '# ' + res.command + '\n# exit=' + res.status + '\n' + res.stdout);
    writeFileSync(join(tmpDir, 'dump-' + label + '.stderr.txt'), res.stderr);
    dumped = { res, file, text: res.stdout };
    return res;
}

function warnings(label) {
    const lines = (dumped.res.stderr || '').split(/\r?\n/).filter(function (line) { return line.trim() !== ''; });
    console.log('    stderr (' + lines.length + ' line(s)):');
    if (lines.length === 0) console.log('      (empty)');
    for (const line of lines) console.log('      ' + line);
    writeFileSync(join(tmpDir, 'dump-' + label + '.stderr.txt'), lines.join('\n'));
    return lines;
}

// 1. CLI identity ------------------------------------------------------------
step('desktop CLI is installed', function () {
    console.log('    CLI: ' + DESKTOP_CLI);
    if (!existsSync(DESKTOP_CLI)) return false;
    const v = runDsh(['--version'], { timeoutMs: 120000 });
    console.log('    $ ' + v.command);
    console.log('    exit=' + v.status + ' stdout=' + JSON.stringify(v.stdout.trim()) + ' stderr=' + JSON.stringify(v.stderr.trim()));
    return v.status === 0;
});

// 2. Draft profile exists (headless template) -------------------------------
step('draft profile exists or is created from the shipped headless template', function () {
    const pkgFile = join(profileDir, 'package.json');
    if (existsSync(pkgFile)) {
        const pkg = readJson(pkgFile);
        const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
        console.log('    reusing profile ' + profileDir + ' (bundles: ' + (bundles.join(', ') || 'none') + ')');
        return true;
    }
    const res = runDsh(['--profile', TEST_PROFILE, '--from-default-profile', 'headless', '--dump-config'], { timeoutMs: 240000 });
    console.log('    $ ' + res.command);
    console.log('    exit=' + res.status);
    if (res.stderr.trim() !== '') console.log('    stderr: ' + res.stderr.trim());
    return existsSync(pkgFile);
});

// 3. Mount the fork ---------------------------------------------------------
step('fork linked into profile (@nami/dsh-agent-teams)', function () {
    const wanted = 'link:E:/Project/Agent-Team/packages/dsh-agent-teams';
    const pkg = readJson(join(profileDir, 'package.json'));
    const current = pkg.dependencies && pkg.dependencies['@nami/dsh-agent-teams'];
    if (current === wanted) {
        console.log('    already linked: ' + current);
        return true;
    }
    const res = runDsh(['plugin', '--profile', TEST_PROFILE, 'add', wanted], { timeoutMs: 900000 });
    console.log('    $ ' + res.command);
    console.log('    exit=' + res.status);
    for (const line of res.stdout.trim().split(/\r?\n/).slice(0, 12)) console.log('    out: ' + line);
    for (const line of res.stderr.trim().split(/\r?\n/).filter(Boolean)) console.log('    err: ' + line);
    const after = readJson(join(profileDir, 'package.json'));
    const bundles = (after.dsh && after.dsh.profile && after.dsh.profile.bundles) || [];
    console.log('    bundles now: ' + bundles.join(', '));
    return after.dependencies['@nami/dsh-agent-teams'] === wanted && bundles.includes('@nami/dsh-agent-teams');
});

// 4. Profile patch: credentials + model route -------------------------------
step('profile cordis.patch.yml carries credentials + model route rows', function () {
    const patchFile = join(profileDir, 'cordis.patch.yml');
    const reuse = existsSync(patchFile) && !forcePatch && /id: credentials/.test(readFileSync(patchFile, 'utf8'));
    if (reuse) {
        console.log('    reusing existing ' + patchFile + ' (pass --force-patch to rewrite)');
        return true;
    }
    const rows = [
        '# Draft test profile for @nami/dsh-agent-teams (written by tools/test/test-env.mjs).',
        '# credentials: the shipped headless template disables it; without it every model route fails',
        '# at boot with MISSING_CREDENTIAL because the key cannot be read from $DSH_HOME/.credentials.yaml.',
        '- id: credentials',
        '  disabled: false',
    ];
    if (borrowModel) {
        if (!existsSync(DESKTOP_PATCH)) {
            console.log('    MISSING source patch ' + DESKTOP_PATCH + ' — cannot borrow provider rows');
            return false;
        }
        const source = readFileSync(DESKTOP_PATCH, 'utf8');
        for (const id of ['llm-pi-ai', 'agent-default-model']) {
            const row = extractRow(source, id);
            if (row === null) {
                console.log('    MISSING row "- id: ' + id + '" in ' + DESKTOP_PATCH);
                return false;
            }
            rows.push('');
            rows.push('# copied read-only from ' + DESKTOP_PATCH + ' (row id: ' + id + ')');
            rows.push(row);
        }
    }
    rows.push('');
    writeFileSync(patchFile, rows.join('\n'));
    console.log('    wrote ' + patchFile + ' (' + rows.length + ' lines' + (borrowModel ? ', rows: credentials, llm-pi-ai, agent-default-model' : ', row: credentials only') + ')');
    return true;
});

// 5. Verify by config dump --------------------------------------------------
step('--dump-config shows the plugin row and a usable model route', function () {
    const res = dumpConfig('verify');
    console.log('    $ ' + res.command);
    console.log('    exit=' + res.status + ' lines=' + res.stdout.split(/\r?\n/).length + ' dump=' + join(tmpDir, 'dump-verify.yml'));
    warnings('verify');
    if (res.status !== 0) return false;
    const text = res.stdout;
    const checks = [
        ['row agent-teams mounted', /^- id: agent-teams$/m.test(text)],
        ['row agent-teams declares stateDir .agent-teams', /^- id: agent-teams$[\s\S]{0,200}?stateDir: \.agent-teams/m.test(text)],
        ['row credentials enabled', (function () {
            const row = extractRow(text, 'credentials') || '';
            return row !== '' && !/disabled: true/.test(row);
        })()],
        ['row llm-pi-ai declares providers', /^ {4}providers:/m.test(extractRow(text, 'llm-pi-ai') || '')],
        ['row agent-default-model pins a provider', /^ {4}provider: \S+/m.test(extractRow(text, 'agent-default-model') || '')],
    ];
    let ok = true;
    for (const item of checks) ok = report(item[0], item[1]) && ok;
    return ok;
});

console.log('');
console.log('=== summary: ' + (failures.length === 0 ? 'PASS' : 'FAIL') + ' (' + failures.length + ' failing step(s)) ===');
for (const failure of failures) console.log('  failed: ' + failure);
if (failures.length === 0) {
    console.log('next: node tools/test/smoke-team.mjs');
    process.exit(0);
}
process.exit(1);
