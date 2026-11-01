#!/usr/bin/env node
/**
 * t58 - Buoc GHI cua di tru route doi Agent Teams ERP, co chot an toan.
 *
 * t40 (tools/erp-route-proposal.mjs) chi DOC va de xuat: 7 cap member goc da
 * "removed" (ha-tang, qa-do, master-hop-dong, tai-lieu, fe-ui, be-api,
 * db-luoc-do) voi ban ke nhiem "-2" con song. Ban "-2" can mang route ma ban goc
 * khai bao (opencode-go-new/minimax-m3.1-flash-free, effort max).
 *
 * Cong cu nay lam buoc GHI do, va mac dinh la KHONG GHI:
 *   node tools/erp-route-migrate.mjs                     -> dry-run, in bang diff
 *   node tools/erp-route-migrate.mjs --pair ha-tang      -> dry-run 1 cap
 *   node tools/erp-route-migrate.mjs --apply --backup <f> --expect-sha256 <sha>
 *
 * Chot an toan (moi cai deu exit 2, khong ghi byte nao):
 *   - thieu --backup hoac --expect-sha256 khi --apply
 *   - sha256(tep dich) != --expect-sha256  (co ai vua sua)
 *   - ban backup khong byte-identical voi ban goc
 *   - member goc khong ton tai / con song / khong co route khai bao
 *   - member dich khong ton tai / da removed
 *   - tep khong tai tao duoc NGUYEN VAN (round-trip) nen khong the cam ket
 *     "chi doi routeOverride"
 *   - deep diff sau khi sua khac tap khoa mong doi
 *
 * Ghi DUNG hinh dang ma plugin chap nhan (lib/state.js isTeamMember):
 *   member.routeOverride = { provider, model, reasoningEffort?, source, at, by }
 * `source` phai thuoc union cua validator ({captain, http, profile}); cong cu nay
 * dung 'profile' vi day la route do nguoi van hanh ghim tu ngoai phien (khong phai
 * captain goi tool, cung khong phai duong HTTP), va `by` ghi ro ai/cai gi da ghi.
 * Thieu source/at thi readTeam nem 'members[N] is not a valid member record' va CA
 * DOI ERP chet - dung la V6-F1 ma audit t61 bat duoc. Sau khi ghi, cong cu tu doc
 * lai bang chinh readTeam cua plugin; neu plugin tu choi thi tu khoi phuc backup
 * roi moi dung.
 *
 * Khong cham khoa nao khac cua team.json.
 *
 * Ma thoat: 0 = xong, 1 = loi tham so/doc, 2 = tu choi vi an toan.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, renameSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
// Validator cua plugin = nguon su that ve hinh dang team.json.
import { readTeam } from '../packages/dsh-agent-teams/lib/state.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
// Mac dinh: doi ERP nam canh repo nay. Khong viet duong dan tuyet doi trong ma.
const DEFAULT_TEAM = resolve(REPO_ROOT, '..', 'ERP', '.agent-teams', 'erp-erp', 'team.json');
const SUCCESSOR_RE = /^(.+)-(\d+)$/;
const EXIT_OK = 0;
const EXIT_USAGE = 1;
const EXIT_REFUSED = 2;
const WRITE_KEYS = ['provider', 'model', 'reasoningEffort'];
// `source` phai thuoc union trong packages/dsh-agent-teams/lib/state.js isTeamMember
// ('captain' | 'http' | 'profile'): day la route do nguoi van hanh ghim tu NGOAI phien
// (khong qua tool captain, khong qua HTTP) nen 'profile' la gia tri dung nghia.
const ROUTE_SOURCE = 'profile';
const DEFAULT_BY = 'tools/erp-route-migrate';

class UsageError extends Error {}
class Refusal extends Error {}

function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

/** Duong dan hien thi: tuong doi so voi cwd, khong bao gio tuyet doi. */
function displayPath(absolute) {
    const rel = relative(process.cwd(), absolute);
    return rel === '' ? '.' : rel;
}

function parseArgs(argv) {
    const options = {
        team: DEFAULT_TEAM, apply: false, dryRun: false, backup: undefined,
        expectSha: undefined, pairs: [], json: false, help: false, by: DEFAULT_BY,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const take = (name) => {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('--')) throw new UsageError(name + ' can mot gia tri');
            i += 1;
            return value;
        };
        if (arg === '--help' || arg === '-h') { options.help = true; continue; }
        if (arg === '--json') { options.json = true; continue; }
        if (arg === '--apply') { options.apply = true; continue; }
        if (arg === '--dry-run') { options.dryRun = true; continue; }
        if (arg === '--team') { options.team = resolve(process.cwd(), take('--team')); continue; }
        if (arg.startsWith('--team=')) { options.team = resolve(process.cwd(), arg.slice('--team='.length)); continue; }
        if (arg === '--backup') { options.backup = resolve(process.cwd(), take('--backup')); continue; }
        if (arg.startsWith('--backup=')) { options.backup = resolve(process.cwd(), arg.slice('--backup='.length)); continue; }
        if (arg === '--expect-sha256') { options.expectSha = take('--expect-sha256').trim().toLowerCase(); continue; }
        if (arg.startsWith('--expect-sha256=')) { options.expectSha = arg.slice('--expect-sha256='.length).trim().toLowerCase(); continue; }
        if (arg === '--pair') { options.pairs.push(take('--pair')); continue; }
        if (arg.startsWith('--pair=')) { options.pairs.push(arg.slice('--pair='.length)); continue; }
        if (arg === '--by') { options.by = take('--by').trim(); continue; }
        if (arg.startsWith('--by=')) { options.by = arg.slice('--by='.length).trim(); continue; }
        throw new UsageError('tham so khong hieu: ' + arg);
    }
    if (options.by === '') throw new UsageError('--by can mot ten khong rong');
    if (options.apply === true && options.dryRun === true) throw new UsageError('--apply va --dry-run loai tru nhau');
    if (options.apply !== true) {
        if (options.backup !== undefined) throw new UsageError('--backup chi co nghia khi dung --apply');
        if (options.expectSha !== undefined) throw new UsageError('--expect-sha256 chi co nghia khi dung --apply');
    }
    return options;
}

/** Route ma mot member KHAI BAO (provider/model/reasoningEffort), hoac undefined. */
function declaredRoute(member) {
    if (typeof member.provider !== 'string' || member.provider === '') return undefined;
    if (typeof member.model !== 'string' || member.model === '') return undefined;
    return {
        provider: member.provider,
        model: member.model,
        ...(member.reasoningEffort === undefined || member.reasoningEffort === '' ? {} : { reasoningEffort: member.reasoningEffort }),
    };
}

/** Route dang co hieu luc tren member: routeOverride truoc, roi route khai bao. */
function effectiveRoute(member) {
    if (member.routeOverride !== undefined && member.routeOverride !== null) {
        return {
            provider: member.routeOverride.provider,
            model: member.routeOverride.model,
            ...(member.routeOverride.reasoningEffort === undefined || member.routeOverride.reasoningEffort === '' ? {} : { reasoningEffort: member.routeOverride.reasoningEffort }),
        };
    }
    return declaredRoute(member);
}

function routeLabel(route) {
    if (route === undefined) return '(khong co)';
    const effort = route.reasoningEffort === undefined ? '' : ' (' + String(route.reasoningEffort) + ')';
    return String(route.provider) + '/' + String(route.model) + effort;
}

function sameRoute(left, right) {
    return routeLabel(left) === routeLabel(right);
}

/** member "-N" (N>=2) cung ten goc, uu tien ban con song co so thu tu nho nhat. */
function findSuccessors(members, baseName) {
    const found = [];
    for (const member of members) {
        const match = SUCCESSOR_RE.exec(String(member.name));
        if (match === null || match[1] !== baseName) continue;
        const ordinal = Number(match[2]);
        if (Number.isFinite(ordinal) !== true || ordinal < 2) continue;
        found.push({ member, ordinal });
    }
    found.sort((a, b) => a.ordinal - b.ordinal);
    return found;
}

/**
 * Dung ke hoach: danh sach cap can ghi + danh sach ly do tu choi.
 * Khong sua gi o day; chi doc.
 */
function buildPlan(team, selectedPairs) {
    const members = Array.isArray(team.members) ? team.members : [];
    const byName = new Map(members.map((member) => [String(member.name), member]));
    const detected = [];
    for (const member of members) {
        const match = SUCCESSOR_RE.exec(String(member.name));
        if (match === null) continue;
        const ordinal = Number(match[2]);
        if (Number.isFinite(ordinal) !== true || ordinal < 2) continue;
        if (detected.includes(match[1])) continue;
        detected.push(match[1]);
    }
    const selected = selectedPairs.length > 0 ? selectedPairs : detected;
    const items = [];
    const errors = [];
    for (const baseName of selected) {
        const base = byName.get(baseName);
        if (base === undefined) {
            errors.push({ code: 'MEMBER_NOT_FOUND', message: 'member "' + baseName + '" khong ton tai trong team.json' });
            continue;
        }
        if (base.status !== 'removed') {
            errors.push({ code: 'BASE_STILL_ACTIVE', message: 'member goc "' + baseName + '" van con song (status ' + String(base.status) + '), day khong phai cap di tru' });
            continue;
        }
        const source = declaredRoute(base);
        if (source === undefined) {
            errors.push({ code: 'BASE_NO_ROUTE', message: 'member goc "' + baseName + '" khong co route khai bao (thieu provider/model)' });
            continue;
        }
        const successors = findSuccessors(members, baseName);
        if (successors.length === 0) {
            errors.push({ code: 'TARGET_NOT_FOUND', message: 'khong tim thay member ke nhiem "' + baseName + '-<N>"' });
            continue;
        }
        const live = successors.find((entry) => entry.member.status !== 'removed');
        if (live === undefined) {
            errors.push({ code: 'TARGET_REMOVED', message: 'member dich "' + String(successors[0].member.name) + '" da bi removed; plugin tu choi doi route member removed' });
            continue;
        }
        const target = live.member;
        const routeOverride = base.routeOverride === undefined || base.routeOverride === null ? source : effectiveRoute(base);
        const desired = {};
        for (const key of WRITE_KEYS) if (routeOverride[key] !== undefined) desired[key] = routeOverride[key];
        const action = sameRoute(effectiveRoute(target), desired) ? 'already' : 'write';
        items.push({
            baseName,
            baseStatus: String(base.status),
            targetName: String(target.name),
            targetStatus: String(target.status),
            currentRoute: effectiveRoute(target),
            nextRoute: desired,
            action,
            target,
        });
    }
    return { items, errors, detected };
}

/** Tap duong dan khoa khac nhau giua hai JSON (dung de cam ket "chi doi routeOverride"). */
function deepDiff(left, right, prefix = '') {
    const out = [];
    const bothObjects = left !== null && right !== null && typeof left === 'object' && typeof right === 'object';
    if (bothObjects !== true) {
        if (JSON.stringify(left) !== JSON.stringify(right)) out.push(prefix === '' ? '(root)' : prefix);
        return out;
    }
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
        const path = Array.isArray(left) ? prefix + '[' + key + ']' : (prefix === '' ? key : prefix + '.' + key);
        out.push(...deepDiff(left[key], right[key], path));
    }
    return out;
}

/** Khuon dinh dang cua tep (thut le + newline cuoi) de tai tao NGUYEN VAN. */
function detectFormat(text) {
    const indentMatch = /\n([ \t]+)"/.exec(text);
    return { indent: indentMatch === null ? '  ' : indentMatch[1], trailingNewline: text.endsWith('\n') };
}

function serialize(team, format) {
    return JSON.stringify(team, null, format.indent) + (format.trailingNewline ? '\n' : '');
}

function renderText(report) {
    const lines = [];
    lines.push('# Di tru route - doi ' + String(report.team.name) + ' (' + String(report.team.id) + ')');
    lines.push('nguon: ' + report.source);
    lines.push('che do: ' + (report.mode === 'apply' ? 'APPLY (co ghi)' : 'dry-run (KHONG ghi byte nao)'));
    lines.push('');
    lines.push('| # | member goc (removed) | member dich | route hien tai | route se dat | viec |');
    lines.push('|---|---|---|---|---|---|');
    report.items.forEach((item, index) => {
        lines.push('| ' + (index + 1) + ' | ' + item.baseName + ' | ' + item.targetName
            + ' | ' + routeLabel(item.currentRoute) + ' | ' + routeLabel(item.nextRoute)
            + ' | ' + (item.action === 'already' ? 'da di tru (bo qua)' : 'se ghi') + ' |');
    });
    if (report.items.length === 0) lines.push('| - | (khong co cap nao duoc chon) | | | | |');
    lines.push('');
    lines.push('## Tong ket');
    lines.push('- cap phat hien trong team.json: ' + report.detected);
    lines.push('- cap duoc chon: ' + report.items.length);
    lines.push('- can ghi: ' + report.changed);
    lines.push('- already migrated: ' + report.already);
    lines.push('- truong provenance ghi kem: source=' + ROUTE_SOURCE + ' · at=<ms luc chay> · by=' + String(report.by));
    if (report.mode === 'apply') {
        lines.push('- backup: ' + report.backup + ' (byte-identical: ' + String(report.backupIdentical) + ')');
        lines.push('- khoa da doi: ' + (report.diffPaths.length === 0 ? '(khong co)' : report.diffPaths.join(', ')));
        lines.push('- plugin round-trip: ' + (report.pluginRead === 'ok'
            ? 'readTeam ok (members=' + String(report.pluginMembers) + ')'
            : 'khong chay (khong ghi gi)'));
    }
    lines.push('');
    lines.push('sha256 truoc = ' + report.shaBefore);
    lines.push('sha256 sau   = ' + report.shaAfter);
    lines.push('identical = ' + String(report.shaBefore === report.shaAfter));
    return lines.join('\n');
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log('node tools/erp-route-migrate.mjs [--team <team.json>] [--pair <ten-goc>]... [--json]');
        console.log('node tools/erp-route-migrate.mjs --apply --backup <tep> --expect-sha256 <sha> [--pair <ten-goc>]... [--by <ten>]');
        console.log('Mac dinh: dry-run, KHONG ghi. Team mac dinh: ' + displayPath(DEFAULT_TEAM));
        return EXIT_OK;
    }
    const source = displayPath(options.team);
    const original = readFileSync(options.team);
    const shaBefore = sha256(original);
    if (options.apply === true) {
        if (options.backup === undefined) throw new Refusal('an toan: --apply bat buoc co --backup <tep>');
        if (options.expectSha === undefined) throw new Refusal('an toan: --apply bat buoc co --expect-sha256 <sha> de chong ghi de');
        if (shaBefore !== options.expectSha) {
            throw new Refusal('an toan: sha256 tep dich la ' + shaBefore + ' nhung --expect-sha256 la ' + options.expectSha + ' - co ai vua sua tep, DUNG lai');
        }
    }
    const text = original.toString('utf8');
    const team = JSON.parse(text);
    const format = detectFormat(text);
    const roundTripExact = serialize(team, format) === text;
    if (roundTripExact !== true) {
        throw new Refusal('an toan: khong tai tao duoc NGUYEN VAN team.json nen khong the cam ket "chi doi routeOverride"');
    }
    const plan = buildPlan(team, options.pairs);
    if (plan.errors.length > 0) {
        for (const error of plan.errors) console.error('TU CHOI [' + error.code + '] ' + error.message);
        throw new Refusal('an toan: ' + plan.errors.length + ' ly do tu choi, khong ghi byte nao');
    }
    const changed = plan.items.filter((item) => item.action === 'write').length;
    const already = plan.items.length - changed;
    const report = {
        task: 't58',
        mode: options.apply === true ? 'apply' : 'dry-run',
        source,
        team: { id: team.id, name: team.name },
        detected: plan.detected.length,
        items: plan.items.map((item) => ({
            baseName: item.baseName, baseStatus: item.baseStatus, targetName: item.targetName,
            targetStatus: item.targetStatus, currentRoute: item.currentRoute, nextRoute: item.nextRoute, action: item.action,
        })),
        changed,
        already,
        shaBefore,
        shaAfter: shaBefore,
        backup: options.backup === undefined ? undefined : displayPath(options.backup),
        backupIdentical: undefined,
        diffPaths: [],
        by: options.by,
        provenance: undefined,
        pluginRead: undefined,
        pluginMembers: undefined,
    };
    if (options.apply === true) {
        if (existsSync(options.backup) === true) {
            throw new Refusal('an toan: tep backup ' + displayPath(options.backup) + ' da ton tai - khong ghi de len ban sao cu');
        }
        mkdirSync(dirname(options.backup), { recursive: true });
        copyFileSync(options.team, options.backup);
        const backupSha = sha256(readFileSync(options.backup));
        report.backupIdentical = backupSha === shaBefore;
        if (report.backupIdentical !== true || backupSha !== options.expectSha) {
            throw new Refusal('an toan: ban sao ' + displayPath(options.backup) + ' khong byte-identical voi ban goc (' + backupSha + '), DUNG lai');
        }
        if (changed > 0) {
            const next = JSON.parse(text);
            const byName = new Map(next.members.map((member) => [String(member.name), member]));
            // Ban ghi PHai qua duoc lib/state.js isTeamMember: du source + at (so) +
            // by. Hinh dang nay mirror dung khoi members.js:1417-1424 ma plugin ghi.
            const at = Date.now();
            report.provenance = { source: ROUTE_SOURCE, at, by: options.by };
            for (const item of plan.items) {
                if (item.action !== 'write') continue;
                byName.get(item.targetName).routeOverride = {
                    provider: item.nextRoute.provider,
                    model: item.nextRoute.model,
                    ...item.nextRoute.reasoningEffort === undefined ? {} : { reasoningEffort: item.nextRoute.reasoningEffort },
                    source: ROUTE_SOURCE,
                    at,
                    by: options.by,
                };
            }
            const diffPaths = deepDiff(team, next);
            const expected = plan.items.filter((item) => item.action === 'write')
                .map((item) => 'members[' + team.members.indexOf(item.target) + '].routeOverride');
            const unexpected = diffPaths.filter((path) => expected.includes(path) !== true);
            if (unexpected.length > 0 || diffPaths.length !== expected.length) {
                throw new Refusal('an toan: deep diff khac tap khoa mong doi (' + diffPaths.join(', ') + '), DUNG lai truoc khi ghi');
            }
            const nextText = serialize(next, format);
            const tempPath = options.team + '.t58-tmp';
            try {
                writeFileSync(tempPath, nextText);
                renameSync(tempPath, options.team);
            } catch (error) {
                if (existsSync(tempPath) === true) rmSync(tempPath, { force: true });
                throw error;
            }
            report.diffPaths = diffPaths;
        }
        const after = readFileSync(options.team);
        report.shaAfter = sha256(after);
        if (changed > 0 && report.shaAfter === shaBefore) {
            throw new Refusal('an toan: da ghi nhung sha256 khong doi - bat thuong');
        }
        if (changed > 0) {
            // Doc lai BANG CHINH validator cua plugin: `<stateRoot>/<teamId>/team.json`.
            const stateRoot = dirname(dirname(options.team));
            const teamId = basename(dirname(options.team));
            try {
                const reread = await readTeam(stateRoot, teamId);
                if (reread === undefined) throw new Error('readTeam tra ve undefined');
                report.pluginRead = 'ok';
                report.pluginMembers = reread.members.length;
            } catch (error) {
                copyFileSync(options.backup, options.team);
                throw new Refusal('an toan: plugin TU CHOI doc lai team.json sau khi ghi ('
                    + (error instanceof Error ? error.message : String(error))
                    + '); DA KHOI PHUC tu backup ' + displayPath(options.backup));
            }
        }
        if (changed === 0) report.shaAfter = shaBefore;
    } else {
        report.shaAfter = sha256(readFileSync(options.team));
    }
    if (options.json === true) console.log(JSON.stringify(report, null, 2));
    else console.log(renderText(report));
    if (changed === 0) console.error('already migrated: ' + already + ' (khong ghi byte nao)');
    return EXIT_OK;
}

try {
    process.exitCode = await main();
} catch (error) {
    if (error instanceof UsageError) {
        console.error('erp-route-migrate: ' + error.message);
        process.exitCode = EXIT_USAGE;
    } else if (error instanceof Refusal) {
        console.error('erp-route-migrate: ' + error.message);
        process.exitCode = EXIT_REFUSED;
    } else {
        console.error('erp-route-migrate: ' + (error instanceof Error ? error.message : String(error)));
        process.exitCode = EXIT_USAGE;
    }
}
