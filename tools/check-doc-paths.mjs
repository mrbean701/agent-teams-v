#!/usr/bin/env node
/**
 * check-doc-paths.mjs - fail when the user-facing docs mention a repo path that
 * does not exist.
 *
 * Scans docs/bao-cao-agent-teams.md and docs/van-hanh/*.md for (a) repo paths
 * written as inline code or prose (tests/*.mjs, lib/*.js, docs/**, build/**,
 * tools/**, scripts/**) and (b) markdown relative links, then prints a
 * "path | exists" table. A path resolves against the repo root first and then
 * against packages/dsh-agent-teams, because the docs quote plugin-internal
 * paths (lib/tools.js) as well as repo paths (tests/t3-route-smoke.mjs).
 * Glob segments (*, ?, and a ** directory prefix) are supported so a stale
 * pattern such as tests/t17-*.mjs is reported as missing instead of silently
 * passing.
 *
 * Usage: node tools/check-doc-paths.mjs [--summary] [--write]
 *   --summary  print only the SUMMARY line (compact, for pasting into a report)
 *   --write    also regenerate docs/van-hanh/kiem-tra-duong-dan.md
 * Exit code: 0 when nothing is missing, 1 otherwise.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASES = ['', 'packages/dsh-agent-teams'];
const ARGS = new Set(process.argv.slice(2));
const DOC_FILES = ['docs/bao-cao-agent-teams.md'];
for (const name of readdirSync(join(ROOT, 'docs/van-hanh')).sort()) {
    if (name.endsWith('.md') && name !== 'kiem-tra-duong-dan.md') DOC_FILES.push('docs/van-hanh/' + name);
}
const PATH_RE = /(?:^|[^A-Za-z0-9_./-])((?:tests|lib|docs|build|tools|scripts)\/[A-Za-z0-9._*/-]+\.(?:json|mjs|html|md|ts|js|sh))/g;
const LINK_RE = /\]\(([^()\s]+)\)/g;
const PLACEHOLDER_RE = /[<>]|\.\.\.|\u2026/;

/** Build an anchored regex for one path segment, supporting * and ?. */
function segRe(part) {
    let out = '^';
    for (const ch of part) {
        if (ch === '*') out += '[^/]*';
        else if (ch === '?') out += '[^/]';
        else if (/[A-Za-z0-9_-]/.test(ch)) out += ch;
        else out += '\\' + ch;
    }
    return out + '$';
}

/** Expand one candidate (may contain * and ?) into matching repo-relative files. */
function expand(candidate) {
    if (candidate.includes('/**/')) {
        const prefix = candidate.split('/**/')[0];
        return existsSync(join(ROOT, prefix)) ? [candidate] : [];
    }
    if (!/[*?]/.test(candidate)) return existsSync(join(ROOT, candidate)) ? [candidate] : [];
    let bases = [''];
    for (const part of candidate.split('/')) {
        const next = [];
        for (const base of bases) {
            const abs = join(ROOT, base === '' ? '.' : base);
            if (!existsSync(abs)) continue;
            if (!/[*?]/.test(part)) {
                next.push(base === '' ? part : base + '/' + part);
                continue;
            }
            const re = new RegExp(segRe(part));
            for (const name of readdirSync(abs)) {
                if (re.test(name)) next.push(base === '' ? name : base + '/' + name);
            }
        }
        bases = next;
    }
    return bases.filter((rel) => existsSync(join(ROOT, rel)));
}

const paths = new Map();
const links = new Map();
for (const doc of DOC_FILES) {
    const text = readFileSync(join(ROOT, doc), 'utf8');
    for (const m of text.matchAll(PATH_RE)) {
        const candidate = m[1].replace(/[.,;:]+$/, '');
        if (PLACEHOLDER_RE.test(candidate)) continue;
        if (!paths.has(candidate)) paths.set(candidate, new Set());
        paths.get(candidate).add(doc);
    }
    for (const m of text.matchAll(LINK_RE)) {
        const target = m[1].split('#')[0];
        if (target === '' || /^[a-z]+:/i.test(target)) continue;
        if (PLACEHOLDER_RE.test(target)) continue;
        const abs = resolve(dirname(join(ROOT, doc)), target);
        links.set(doc + ' -> ' + target, existsSync(abs));
    }
}

const rows = [];
let pathsMissing = 0;
for (const candidate of [...paths.keys()].sort()) {
    let where = '';
    for (const base of BASES) {
        const probe = base === '' ? candidate : base + '/' + candidate;
        if (expand(probe).length > 0) {
            where = base === '' ? 'root' : base;
            break;
        }
    }
    if (where === '') pathsMissing += 1;
    rows.push(candidate + ' | ' + (where === '' ? 'NO' : 'yes (' + where + ')'));
}
const linkRows = [];
let linksMissing = 0;
for (const [key, ok] of [...links.entries()].sort()) {
    if (!ok) linksMissing += 1;
    linkRows.push(key + ' | ' + (ok ? 'yes' : 'NO'));
}

const table = ['path | exists', ...rows, '', 'link | exists', ...linkRows, ''].join('\n');
const summary = 'files=' + DOC_FILES.length + ' paths=' + rows.length + ' paths_missing=' + pathsMissing
    + ' links=' + linkRows.length + ' links_missing=' + linksMissing;

if (ARGS.has('--summary')) console.log('SUMMARY ' + summary);
else console.log(table);

if (ARGS.has('--write')) {
    const note = [
        '# Kiểm tra đường dẫn tài liệu (sinh tự động)',
        '',
        'Sinh bằng: node tools/check-doc-paths.mjs --write (' + DOC_FILES.length + ' tệp tài liệu).',
        'Cột exists cho biết đường dẫn có thật ở gốc repo (root) hay trong packages/dsh-agent-teams.',
        '',
        '~~~',
        table,
        summary,
        '~~~',
        '',
    ].join('\n');
    writeFileSync(join(ROOT, 'docs/van-hanh/kiem-tra-duong-dan.md'), note);
    console.log('WROTE docs/van-hanh/kiem-tra-duong-dan.md');
}
const failed = pathsMissing + linksMissing;
console.log('SUMMARY ' + summary);
console.log('EXIT ' + (failed > 0 ? 1 : 0));
process.exit(failed > 0 ? 1 : 0);
