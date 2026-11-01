// tools/test/lib/dsh-cli.mjs — shared helpers for the draft test profile.
// Runs the DESKTOP host CLI (0.2.1-rc.5) through PowerShell.
// Why PowerShell: invoking dsh.cmd straight from MSYS2 bash makes a full
// session run die with
//   'C:\Users\...\Programs\DeepSeek' is not recognized as an internal or external command
// (reproduced with the shipped 'headless' profile too, so it is not the plugin).
// The identical run through powershell -NoProfile -Command works.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export const DESKTOP_CLI = process.env.DSH_DESKTOP_CLI
    ?? 'C:/Users/thang/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd';
export const DSH_HOME = process.env.DSH_TEST_HOME ?? join(process.env.USERPROFILE ?? 'C:/Users/thang', '.dsh');
export const DESKTOP_PATCH = process.env.DSH_TEST_PATCH_SOURCE
    ?? join(DSH_HOME, 'profiles', 'desktop', 'cordis.patch.yml');
export const TEST_PROFILE = process.env.DSH_TEST_PROFILE ?? 'agent-teams-test';
export const profileDir = join(DSH_HOME, 'profiles', TEST_PROFILE);

export function psQuote(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
}

/** Run the desktop dsh CLI through PowerShell. Returns {command,status,stdout,stderr}. */
export function runDsh(args, { cwd = REPO_ROOT, timeoutMs = 300000 } = {}) {
    if (!existsSync(DESKTOP_CLI)) {
        throw new Error(`desktop dsh CLI not found at ${DESKTOP_CLI} (set DSH_DESKTOP_CLI)`);
    }
    const command = `& ${psQuote(DESKTOP_CLI)} ${args.map(psQuote).join(' ')}; exit $LASTEXITCODE`;
    const res = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
        cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env },
    });
    return {
        command: `powershell -NoProfile -Command "${command}"`,
        status: res.status,
        stdout: res.stdout ?? '',
        stderr: res.stderr ?? '',
        error: res.error ? String(res.error) : undefined,
    };
}

/** Extract one top-level YAML row (`- id: <id>`) out of a cordis patch file. */
export function extractRow(text, id) {
    const lines = text.split(/\r?\n/);
    const startRe = new RegExp(`^-\\s+id:\\s*${id}\\s*$`);
    let start = -1;
    for (let i = 0; i < lines.length; i += 1) {
        if (startRe.test(lines[i])) { start = i; break; }
    }
    if (start < 0) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
        if (/^-\s/.test(lines[i]) || /^#/.test(lines[i])) { end = i; break; }
    }
    const block = lines.slice(start, end);
    while (block.length > 0 && block[block.length - 1].trim() === '') block.pop();
    return block.join('\n');
}

export function readRow(text, id) {
    return extractRow(text, id);
}

export function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

export function report(title, ok, detail) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${title}${detail ? ' — ' + detail : ''}`);
    return ok;
}
