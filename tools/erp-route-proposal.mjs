#!/usr/bin/env node
/**
 * t40 — cong cu CHI DOC: de xuat di tru route cho doi Agent Teams cua du an ERP.
 *
 * Muc tieu: thay quy trinh doi model 6 buoc bang PowerShell
 * (<repo>/../ERP/tools/session/chan-doan-doi-model.ps1) bang mot ban de xuat doc duoc:
 * voi moi cap (member goc da removed, member successor -N con song) cua cung mot vai tro,
 * noi ro route hien tai cua ban con song, viec nen lam, va canh bao.
 *
 * RANG BUOC: chi DOC. Khong mo tep de ghi, khong tao thu muc, khong goi API nao.
 * Bang chung: doc tep 1 lan (sha256 before), tinh toan trong RAM, doc lai tep lan 2 (sha256 after)
 * va in identical. Tep khong doi thi identical = true.
 *
 * Cach dung:
 *   node tools/erp-route-proposal.mjs
 *   node tools/erp-route-proposal.mjs --team <duong-dan team.json>
 *   node tools/erp-route-proposal.mjs --json
 */
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
// Mac dinh: doi ERP nam canh repo nay. Khong dung duong dan tuyet doi trong ma.
const DEFAULT_TEAM = resolve(REPO_ROOT, '..', 'ERP', '.agent-teams', 'erp-erp', 'team.json');
const TERMINAL_TASK_STATUSES = ['completed', 'failed', 'cancelled'];
const SUCCESSOR_RE = /^(.+)-(\d+)$/;
const TOOL_SET_ROUTE = 'agent_teams_set_member_route';
const TOOL_REMOVE = 'agent_teams_remove_member';

function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

function parseArgs(argv) {
    const options = { team: DEFAULT_TEAM, json: false, help: false };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--json') { options.json = true; continue; }
        if (arg === '--help' || arg === '-h') { options.help = true; continue; }
        if (arg === '--team') {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('--')) throw new Error('--team can mot duong dan');
            options.team = resolve(process.cwd(), value);
            i += 1;
            continue;
        }
        if (arg.startsWith('--team=')) { options.team = resolve(process.cwd(), arg.slice('--team='.length)); continue; }
        throw new Error('tham so khong hieu: ' + arg);
    }
    return options;
}

/** Dem task chua ket thuc theo tung assignee. */
function openTaskCounts(team) {
    const counts = new Map();
    for (const task of Object.values(team.tasks ?? {})) {
        if (TERMINAL_TASK_STATUSES.includes(task.status)) continue;
        const assignee = String(task.assignee ?? '');
        counts.set(assignee, (counts.get(assignee) ?? 0) + 1);
    }
    return counts;
}

/** Suy ra cac cap (member goc -N da removed, member successor con song) va cac member le. */
function analyseTeam(team) {
    const members = Array.isArray(team.members) ? team.members : [];
    const openBy = openTaskCounts(team);
    const byName = new Map();
    for (const member of members) byName.set(member.name, member);
    const pairs = [];
    const orphans = [];
    const basesWithPair = new Set();
    for (const member of members) {
        const match = SUCCESSOR_RE.exec(String(member.name ?? ''));
        if (match === null) continue;
        const ordinal = Number(match[2]);
        if (Number.isFinite(ordinal) !== true || ordinal < 2) continue;
        if (member.status === 'removed') continue;
        const baseName = match[1];
        const original = byName.get(baseName);
        if (original === undefined) {
            orphans.push({ member: member.name, status: member.status, why: 'khong tim thay member goc ten "' + baseName + '"' });
            continue;
        }
        if (original.status !== 'removed') {
            orphans.push({
                member: member.name, status: member.status,
                why: 'ban goc "' + baseName + '" van con song (status ' + original.status + ') nen day la 2 member trung vai tro, khong phai cap di tru',
            });
            continue;
        }
        basesWithPair.add(baseName);
        pairs.push({
            base: original,
            keep: member,
            roleMatches: original.role === member.role,
            keepOpenTasks: openBy.get(member.name) ?? 0,
            baseOpenTasks: openBy.get(baseName) ?? 0,
        });
    }
    for (const member of members) {
        if (member.status !== 'removed') continue;
        if (basesWithPair.has(member.name)) continue;
        orphans.push({ member: member.name, status: member.status, why: 'ban goc da removed va khong co ban successor -N cung ten goc' });
    }
    const stats = {
        members: members.length,
        active: members.filter((m) => m.status !== 'removed').length,
        removed: members.filter((m) => m.status === 'removed').length,
        tasks: Object.keys(team.tasks ?? {}).length,
        openTasks: Object.values(team.tasks ?? {}).filter((t) => TERMINAL_TASK_STATUSES.includes(t.status) !== true).length,
        pairs: pairs.length,
        orphans: orphans.length,
    };
    return { members, pairs, orphans, stats, openBy };
}

function routeLabel(member) {
    if (member === undefined) return '(khong co)';
    const override = member.routeOverride;
    const provider = (override !== undefined && override !== null ? override.provider : undefined) ?? member.provider;
    const model = (override !== undefined && override !== null ? override.model : undefined) ?? member.model;
    const effort = (override !== undefined && override !== null ? override.reasoningEffort : undefined) ?? member.reasoningEffort;
    const origin = override !== undefined && override !== null ? 'override' : 'khai bao';
    return String(provider) + '/' + String(model) + (effort === undefined || effort === null ? '' : ' (' + String(effort) + ')') + ' [' + origin + ']';
}

function pad(value, width) {
    const text = String(value);
    return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

function renderText(report) {
    const lines = [];
    const t = report.team;
    lines.push('# De xuat di tru route — doi ' + String(t.name) + ' (' + String(t.id) + ')');
    lines.push('nguon: ' + report.source);
    lines.push('phase: ' + String(t.phase ?? '(khong ro)') + ' · captainSessionId: ' + String(t.captainSessionId ?? '(khong co)'));
    lines.push('');
    lines.push('sha256 before = ' + report.sha256.before);
    lines.push('sha256 after  = ' + report.sha256.after);
    lines.push('identical = ' + String(report.sha256.identical));
    lines.push('');
    lines.push('## Thong ke');
    const s = report.stats;
    lines.push('- member: ' + s.members + ' tong · ' + s.active + ' dang song · ' + s.removed + ' da removed');
    lines.push('- task: ' + s.tasks + ' tong · ' + s.openTasks + ' dang mo (chua ' + TERMINAL_TASK_STATUSES.join('/') + ')');
    lines.push('- cap de xuat duoc: ' + s.pairs);
    lines.push('- member khong suy ra duoc cap: ' + s.orphans);
    lines.push('');
    lines.push('## Bang de xuat');
    lines.push('');
    lines.push('| # | ban goc (removed) | member giu lai | trang thai ban giu | route ban giu lai | route ban goc | role | task mo |');
    lines.push('|---|---|---|---|---|---|---|---|');
    report.pairs.forEach((pair, index) => {
        lines.push('| ' + (index + 1) + ' | ' + pair.base.name + ' | ' + pair.keep.name + ' | ' + String(pair.keep.status)
            + ' | ' + routeLabel(pair.keep) + ' | ' + routeLabel(pair.base)
            + ' | ' + (pair.roleMatches ? 'khop' : 'LECH') + ' | ' + pair.keepOpenTasks + ' |');
    });
    if (report.pairs.length === 0) lines.push('| – | (khong co cap nao) | | | | | | |');
    lines.push('');
    lines.push('## Chi tiet tung cap');
    report.pairs.forEach((pair, index) => {
        lines.push('');
        lines.push('### ' + (index + 1) + '. ' + pair.base.name + '  ->  ' + pair.keep.name);
        lines.push('- route hien tai cua ban giu lai: ' + routeLabel(pair.keep));
        lines.push('- route cua ban goc (da removed): ' + routeLabel(pair.base));
        lines.push('- ly do: ban goc "' + pair.base.name + '" da bi go khoi doi (status removed) nhung ten van bi khoa vinh vien'
            + ' (tools.js:2777 — trung ten la tu choi), nen ban successor "' + pair.keep.name + '" la the he duy nhat con song'
            + ' (status ' + String(pair.keep.status) + ').');
        lines.push('- de xuat: giu "' + pair.keep.name + '" lam member duy nhat cua vai tro nay, va khi can doi model thi dat routeOverride NGAY TREN NO'
            + ' bang ' + TOOL_SET_ROUTE + ' — dung tao them ban -' + (Number(String(pair.keep.name).split('-').pop()) + 1) + ' nua:');
        lines.push('    ' + TOOL_SET_ROUTE + ' { member_name: "' + pair.keep.name + '", provider: "<provider>", model: "<model>" }');
        lines.push('- KHONG dat routeOverride len "' + pair.base.name + '": plugin tu choi member da removed'
            + ' (members.js:1177-1180 loc status !== removed, kem chu thich "A removed member keeps its record for audit; it cannot be re-routed"),'
            + ' va ban ghi nay khong the xoa khoi roster.');
        if (pair.roleMatches !== true) {
            lines.push('- canh bao: role LECH — ban goc ghi "' + String(pair.base.role) + '", ban giu lai ghi "' + String(pair.keep.role)
                + '". Kiem tra lai mo ta vung viec truoc khi go ban nao.');
        }
        if (pair.keepOpenTasks > 0) {
            lines.push('- canh bao: "' + pair.keep.name + '" dang giu ' + pair.keepOpenTasks + ' task chua ket thuc —'
                + ' KHONG duoc go member nay (remove_member se huy attempt cua task dang mo). Chi doi route, va doi duoc ngay ca khi member dang chay.');
        }
    });
    lines.push('');
    lines.push('## Member khong suy ra duoc cap');
    if (report.orphans.length === 0) {
        lines.push('- (khong co) — moi member deu nam trong mot cap hoac da ro rang.');
    } else {
        for (const orphan of report.orphans) {
            lines.push('- ' + orphan.member + ' [' + orphan.status + ']: ' + orphan.why);
        }
    }
    lines.push('');
    lines.push('## Bon buoc cho nguoi dung (chi de xuat — cong cu nay KHONG tu ghi)');
    lines.push('1. Chay: node tools/erp-route-proposal.mjs --team <team.json> (chi doc, sha256 before/after phai trung nhau).');
    lines.push('2. Doc bang de xuat + canh bao o tren; quyet dinh giu member nao va route nao.');
    lines.push('3. Neu dong y: captain goi ' + TOOL_SET_ROUTE + ' cho member dang chay (durable + live neu tien trinh do so huu member).');
    lines.push('4. Chi go member thua bang ' + TOOL_REMOVE + ' khi member do khong con task mo; ban ghi da removed thi khong go duoc nua.');
    lines.push('');
    lines.push('Tai lieu chi tiet: docs/van-hanh/de-xuat-di-tru-erp.md');
    return lines.join('\n');
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log('node tools/erp-route-proposal.mjs [--team <team.json>] [--json]');
        console.log('Mac dinh: ' + DEFAULT_TEAM);
        console.log('CHI DOC: in sha256 before/after va identical de chung minh khong ghi.');
        return 0;
    }
    const before = readFileSync(options.team);
    const shaBefore = sha256(before);
    const statBefore = statSync(options.team);
    const team = JSON.parse(before.toString('utf8'));
    const analysis = analyseTeam(team);
    // view: hinh dang THO cho phan in text (member con nguyen provider/model de doc route).
    const view = {
        source: options.team,
        team: { id: team.id, name: team.name, phase: team.phase, captainSessionId: team.captainSessionId },
        sha256: { before: shaBefore, after: shaBefore, identical: false },
        stats: analysis.stats,
        pairs: analysis.pairs,
        orphans: analysis.orphans,
    };
    const report = {
        task: 't40',
        source: view.source,
        team: view.team,
        sha256: view.sha256,
        stats: view.stats,
        pairs: analysis.pairs.map((pair) => ({
            base: { name: pair.base.name, status: pair.base.status, route: routeLabel(pair.base), role: pair.base.role },
            keep: { name: pair.keep.name, status: pair.keep.status, route: routeLabel(pair.keep), role: pair.keep.role },
            roleMatches: pair.roleMatches,
            keepOpenTasks: pair.keepOpenTasks,
            action: TOOL_SET_ROUTE + ' member_name=' + pair.keep.name,
        })),
        orphans: analysis.orphans,
    };
    // Doc lai tep lan hai: bang chung khong ghi.
    const after = readFileSync(options.team);
    const statAfter = statSync(options.team);
    report.sha256.after = sha256(after);
    report.sha256.identical = report.sha256.before === report.sha256.after && statBefore.size === statAfter.size;
    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        console.log(renderText(view));
    }
    if (report.sha256.identical !== true) {
        console.error('LOI: sha256 cua ' + options.team + ' DA DOI trong luc chay — cong cu nay chi doc, day la bat thuong.');
        return 3;
    }
    return 0;
}

try {
    process.exitCode = main();
} catch (error) {
    console.error('erp-route-proposal: ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 2;
}
