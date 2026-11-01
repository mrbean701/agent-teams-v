/**
 * t132 — panel render order (runtime proof on the SHIPPED bundle).
 *
 * Layer A (static): the installed bundle of the released tarball (profile
 *   agent-teams-pack19) is parsed and the five sibling call sites inside
 *   TeamSection must appear as ProgressOverview -> DependencyMap ->
 *   AddMemberControl -> orderDelegationMembers -> WorkspaceSummary.
 * Layer B (runtime, no Host boot): the SAME installed bundle is evaluated in a
 *   vm sandbox with a fake window.__ModuleLoader__, its internals are exported
 *   through an in-memory injection of one line, and TeamSection is rendered for
 *   real two ways: react-dom/server to HTML (DOM order measured on the markup)
 *   and a recording jsx-runtime that keeps COMPONENT IDENTITY in the children
 *   array (so the order is measured on the element tree, not on text).
 * Negative controls: the pre-t128 bundle came from git HEAD into
 *   tests/tmp/t132/old-client.js and must FAIL the same predicate; a copy with
 *   the two call sites swapped must FAIL; a copy with one DOM marker renamed
 *   must FAIL as "missing" (so indexOf(-1) can never fake a pass).
 *
 * Run: node tests/t132-panel-runtime.mjs            (fresh run, 0 boots)
 *      node tests/t132-panel-runtime.mjs --analyze tests/tmp/t132
 *
 * Zero Host boot is needed for any of this: every measurement is in-process.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode(10);
const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const PKG = path.join(REPO, 'packages', 'dsh-agent-teams');
const SOURCE_CLIENT = path.join(PKG, 'lib', 'client.js');
const INSTALLED = 'C:/Users/thang/.dsh/profiles/agent-teams-pack19/node_modules/@nami/dsh-agent-teams/lib/client.js';
const OUT_ROOT = path.join(REPO, 'tests', 'tmp', 't132');
const DOC = path.join(REPO, 'docs', 'kiem-thu', 't132-panel-runtime.md');

// t130 released bytes (round 20). Measured with node:crypto, not copied from a report.
const PINNED_INSTALLED = { sha256: '377bcea2394cc0ac3dd69b7c1dba05b56e90b0d5db9a1b565840e057bc0cb47d', bytes: 258432 };
// vong 19 (pre-t128) client.js == git HEAD byte.
const PINNED_V19 = { sha256: '9da18d9971a284e936d709db592da6cedcdf1afa960fff282d7a1c802fec7007', bytes: 258432 };

const requireFromPkg = createRequire(path.join(PKG, 'package.json'));
const realReact = requireFromPkg('react');
const realJsx = requireFromPkg('react/jsx-runtime');
const serverRenderer = requireFromPkg('react-dom/server');

const INJECT = 'module.exports.__t132 = { TeamSection: TeamSection, ActivityPanel: ActivityPanel, DependencyMap: DependencyMap, AddMemberControl: AddMemberControl, ProgressOverview: ProgressOverview, WorkspaceSummary: WorkspaceSummary };';

function hashOf(file) {
    const buffer = fs.readFileSync(file);
    return { sha256: crypto.createHash('sha256').update(buffer).digest('hex'), bytes: buffer.length };
}

function hashOfText(text) {
    return { sha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex'), bytes: Buffer.byteLength(text, 'utf8') };
}

function stamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

// ------------------------------------------------------------------ hooks stub
// The panel's teammates are invoked through element types in tree mode, so the
// stubs only ever serve TeamSection/AddMemberControl/DependencyMap/WorkspaceSummary
// themselves: no network, no timers, no state transitions.
function stubHooks() {
    const overrides = {
        useState: (init) => [typeof init === 'function' ? init() : init, () => undefined],
        useReducer: (reducer, init) => [typeof init === 'function' ? init() : init, () => undefined],
        useMemo: (compute) => compute(),
        useCallback: (fn) => fn,
        useRef: (init) => ({ current: init }),
        useEffect: () => undefined,
        useLayoutEffect: () => undefined,
        useInsertionEffect: () => undefined,
        useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
        useContext: (context) => (context === undefined || context === null ? undefined : context._currentValue),
        useId: () => 't132-id',
        useTransition: () => [false, (fn) => { fn(); }],
        useDeferredValue: (value) => value,
        useDebugValue: () => undefined,
    };
    return new Proxy(overrides, {
        get: (target, key) => (key in target ? target[key] : realReact[key]),
    });
}

// --------------------------------------------------------------- tree recorder
function recordJsx(type, props, key) {
    return { type, props: props === undefined ? {} : props, key: key === undefined ? null : key };
}
const recorderJsx = { jsx: recordJsx, jsxs: recordJsx, jsxDEV: recordJsx, Fragment: realReact.Fragment };

function typeName(type) {
    if (typeof type === 'function') {
        return type.name === undefined || type.name === '' ? 'anonymous' : type.name;
    }
    if (typeof type === 'string') return type;
    if (typeof type === 'symbol') return String(type);
    return 'object-component';
}

function serialize(node) {
    if (node === null || node === undefined || node === false || node === true) return '';
    if (Array.isArray(node)) {
        const parts = [];
        for (const child of node) parts.push(serialize(child));
        return parts.join(' | ');
    }
    if (typeof node !== 'object') return String(node);
    const props = node.props === undefined || node.props === null ? {} : node.props;
    const name = typeName(node.type);
    const attributes = [];
    for (const key of Object.keys(props)) {
        if (key === 'children') continue;
        const value = props[key];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            attributes.push(key + '=' + String(value));
        }
    }
    const head = '<' + name + (attributes.length === 0 ? '' : ' ' + attributes.join(' ')) + '>';
    return head + serialize(props.children) + '</' + name + '>';
}

// ------------------------------------------------------------------ bundle load
function loadBundleText(text, label, options) {
    const at = text.lastIndexOf('return module.exports;');
    if (at < 0) throw new Error('harness: no module.exports return inside ' + label);
    const injected = text.slice(0, at) + INJECT + NL + '    ' + text.slice(at);
    let registration;
    const host = {};
    host.__ModuleLoader__ = { load: (value) => { registration = value; } };
    host.window = host;
    const primitivesStub = { Menu: () => null, Modal: () => null, Tooltip: () => null };
    const reactModule = options.hooks === 'stub' ? stubHooks() : realReact;
    const jsxModule = options.jsx === 'record' ? recorderJsx : realJsx;
    const externals = {
        'react': reactModule,
        'react/jsx-runtime': jsxModule,
        '@deepseek-ai/dsh-client-ui-primitives': primitivesStub,
    };
    const sandbox = vm.createContext({
        window: host,
        __ModuleLoader__: host.__ModuleLoader__,
        console,
        setTimeout,
        clearTimeout,
        performance,
        fetch: () => Promise.reject(new Error('t132: no network')),
    });
    vm.runInContext(injected, sandbox, { filename: label });
    if (registration === undefined) throw new Error('harness: bundle did not call window.__ModuleLoader__.load in ' + label);
    const loaded = registration.factory((name) => {
        if (externals[name] === undefined) throw new Error('harness: unexpected external require ' + name + ' in ' + label);
        return externals[name];
    });
    if (loaded.__t132 === undefined) throw new Error('harness: internal export injection did not take effect in ' + label);
    return loaded.__t132;
}

function loadBundleFile(file, options) {
    return loadBundleText(fs.readFileSync(file, 'utf8'), file, options);
}

// --------------------------------------------------------------------- fixture
const DICTIONARY = {
    'team.stats.members': 'Members {count}',
    'team.stats.completed': '{completed}/{total} done',
    'team.stats.messages': '{count} messages',
};

function tFn(key, values) {
    let out = String(DICTIONARY[key] === undefined ? key : DICTIONARY[key]);
    if (values !== undefined && values !== null) {
        for (const name of Object.keys(values)) out = out.split('{' + name + '}').join(String(values[name]));
    }
    return out;
}

function fixtureMember(id, name, role) {
    return {
        id, name, role, status: 'working', activity: 'working', progress: 0, done: 0, total: 0,
        currentTask: '', unread: 0, provider: 'command-code-goat', model: 'deepseek/deepseek-v4-pro',
        reasoningEffort: 'high',
    };
}

function fixtureTeam() {
    return {
        teamId: 'team-t132',
        name: 't132 fixture',
        captainSessionId: 'session-1',
        phase: 'running',
        halted: false,
        messageCount: 3,
        workspace: '',
        planReviewState: '',
        captainRoute: undefined,
        captainInbox: [],
        members: [
            fixtureMember('child-1', 'ana', 'dev'),
            fixtureMember('child-2', 'bob', 'qa'),
            fixtureMember('child-3', 'cleo', 'doc'),
        ],
        tasks: [
            { id: 't1', subject: 'first task', state: 'idle', status: 'pending', dependencies: [], assignee: 'ana' },
            { id: 't2', subject: 'second task', state: 'idle', status: 'pending', dependencies: ['t1'], assignee: 'bob' },
        ],
    };
}

// ------------------------------------------------------------------- predicates
function countOf(text, needle) {
    let total = 0;
    let at = -1;
    while ((at = text.indexOf(needle, at + 1)) !== -1) total += 1;
    return total;
}

function orderProblems(text, spec) {
    const problems = [];
    const measured = [];
    for (const entry of spec) {
        const occurrences = countOf(text, entry.needle);
        if (occurrences === 0) problems.push('missing ' + entry.label + ' (needle ' + entry.needle + ')');
        if (occurrences > 1) problems.push('ambiguous ' + entry.label + ' (needle ' + entry.needle + ') appears ' + occurrences + ' times');
        measured.push({ label: entry.label, needle: entry.needle, index: text.indexOf(entry.needle), occurrences });
    }
    for (let k = 1; k < measured.length; k += 1) {
        const previous = measured[k - 1];
        const current = measured[k];
        if (previous.index < 0 || current.index < 0) continue;
        if (!(previous.index < current.index)) {
            problems.push(previous.label + ' @' + previous.index + ' must precede ' + current.label + ' @' + current.index);
        }
    }
    return { problems, measured };
}

const DOM_SPEC_PLAIN = [
    { label: 'ProgressOverview', needle: 'data-progress-summary' },
    { label: 'DependencyMap', needle: 'data-dependency-map' },
    { label: 'AddMemberControl', needle: 'data-add-member=' },
    { label: 'member list', needle: 'data-members-toggle' },
];

const DOM_SPEC_WORKSPACE = DOM_SPEC_PLAIN.concat([{ label: 'WorkspaceSummary', needle: 'data-total=' }]);

const TREE_SPEC = [
    { label: 'ProgressOverview', needle: '<ProgressOverview' },
    { label: 'DependencyMap', needle: '<DependencyMap' },
    { label: 'AddMemberControl', needle: '<AddMemberControl' },
    { label: 'member list', needle: 'data-members-toggle=true' },
    { label: 'WorkspaceSummary', needle: '<WorkspaceSummary' },
];

const STATIC_SPEC = [
    { label: 'ProgressOverview call site', needle: 'ProgressOverview, { team, t, discarded }' },
    { label: 'DependencyMap call site', needle: 'DependencyMap, { tasks: team.tasks' },
    { label: 'AddMemberControl call site', needle: 'AddMemberControl, { team, modelDirectory' },
    { label: 'orderDelegationMembers call', needle: 'orderDelegationMembers(team.members, team.tasks)' },
    { label: 'WorkspaceSummary call site', needle: 'WorkspaceSummary, { team, t, discarded }' },
];

// ------------------------------------------------------------------- mutations
function propsBlockEnd(text, from) {
    const start = text.indexOf('{', from);
    if (start < 0) return -1;
    let depth = 0;
    for (let index = start; index < text.length; index += 1) {
        const char = text[index];
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) return index;
        }
    }
    return -1;
}

function swapPanelCalls(text) {
    const startA = text.indexOf('DependencyMap, { tasks');
    const startB = text.indexOf('AddMemberControl, { team');
    if (startA < 0 || startB < 0) return { ok: false, reason: 'call sites not found' };
    if (!(startA < startB)) return { ok: false, reason: 'unexpected base order' };
    const endA = propsBlockEnd(text, startA);
    const endB = propsBlockEnd(text, startB);
    if (endA < 0 || endB < 0) return { ok: false, reason: 'props block not balanced' };
    const blockA = text.slice(startA, endA + 1);
    const blockB = text.slice(startB, endB + 1);
    if (!blockA.startsWith('DependencyMap, {')) return { ok: false, reason: 'block A shape' };
    if (!blockB.startsWith('AddMemberControl, {')) return { ok: false, reason: 'block B shape' };
    const swapped = text.slice(0, startA) + blockB + text.slice(endA + 1, startB) + blockA + text.slice(endB + 1);
    return { ok: true, text: swapped, blockA, blockB, startA, startB, endA, endB };
}

// ------------------------------------------------------------------------ runner
const results = [];
let failures = 0;

function check(id, title, ok, detail) {
    results.push({ id, title, ok, detail });
    if (!ok) failures += 1;
    console.log((ok ? 'PASS ' : 'FAIL ') + id + ' ' + title + ' :: ' + detail);
}

function measuredText(measured) {
    return measured.map((entry) => entry.label + '@' + entry.index).join(' < ');
}

function ensureOldClient() {
    const file = path.join(OUT_ROOT, 'old-client.js');
    if (fs.existsSync(file)) {
        const cached = hashOf(file);
        if (cached.sha256 === PINNED_V19.sha256 && cached.bytes === PINNED_V19.bytes) return { file, source: 'ban sao trong tests/tmp/t132', cached: true };
    }
    return { file, source: 'git show HEAD', needsExtract: true };
}

async function extractOldClient(file, write) {
    const { spawnSync } = await import('node:child_process');
    const run = spawnSync('git', ['show', 'HEAD:packages/dsh-agent-teams/lib/client.js'], { cwd: REPO, encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
    if (run.status !== 0 || run.stdout === undefined || run.stdout.length === 0) {
        return { ok: false, reason: 'git show HEAD failed (status ' + String(run.status) + ')' };
    }
    const buffer = run.stdout;
    if (write === true) fs.writeFileSync(file, buffer);
    return { ok: true, bytes: buffer.length, hash: crypto.createHash('sha256').update(buffer).digest('hex'), text: buffer.toString('utf8'), wrote: write === true };
}

// -------------------------------------------------------- CLI fail-closed (t133)
const USAGE = [
    'cach dung:',
    '  node tests/t132-panel-runtime.mjs                        # do moi, ghi tests/tmp/t132/run-<stamp>/',
    '  node tests/t132-panel-runtime.mjs --analyze <run-dir>    # CHI DOC artifact, 0 boot, khong ghi byte nao',
    '  node tests/t132-panel-runtime.mjs --analyze <dir> --strict  # tu choi thu muc chua nhieu run-dir',
    'ma thoat: 0 = dat het; 1 = co ca hong; 2 = loi dung CLI hoac harness (khong ghi dia)',
].join(NL);

function parseCli(argv) {
    const problems = [];
    const parsed = { mode: 'fresh', requested: undefined, strict: false };
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === '--analyze') {
            if (parsed.mode === 'analyze') {
                problems.push('--analyze bi lap lai');
                continue;
            }
            parsed.mode = 'analyze';
            const value = argv[index + 1];
            if (value === undefined) {
                problems.push('--analyze thieu gia tri (can duong dan run-dir)');
                continue;
            }
            if (value.startsWith('-') === true) {
                problems.push('--analyze thieu gia tri: gap co ' + value + ' thay vi duong dan');
                continue;
            }
            parsed.requested = value;
            index += 1;
            continue;
        }
        if (token === '--strict') {
            parsed.strict = true;
            continue;
        }
        problems.push('co khong ho tro: ' + token);
    }
    if (parsed.strict === true && parsed.mode !== 'analyze') problems.push('--strict chi dung kem --analyze');
    return { parsed, problems };
}

function listRunDirs(container) {
    return fs.readdirSync(container)
        .filter((entry) => entry.startsWith('run-'))
        .map((entry) => path.join(container, entry))
        .filter((dir) => {
            try {
                return fs.statSync(dir).isDirectory() === true && fs.existsSync(path.join(dir, 'results.json'));
            } catch (error) {
                return false;
            }
        })
        .sort();
}

function resolveAnalyzeTarget(requested, strict) {
    const abs = path.resolve(REPO, requested);
    if (fs.existsSync(abs) !== true) return { ok: false, reason: 'duong dan khong ton tai: ' + requested + ' (-> ' + abs + ')' };
    let stat = undefined;
    try {
        stat = fs.statSync(abs);
    } catch (error) {
        return { ok: false, reason: 'khong doc duoc duong dan: ' + requested + ' (' + String(error.message) + ')' };
    }
    if (stat.isDirectory() !== true) return { ok: false, reason: 'khong phai thu muc: ' + requested };
    if (fs.existsSync(path.join(abs, 'results.json')) === true) return { ok: true, dir: abs, how: 'run-dir' };
    const candidates = listRunDirs(abs);
    if (candidates.length === 0) {
        return { ok: false, reason: 'khong co results.json trong ' + requested + ' va cung khong co thu muc run-* nao de cham' };
    }
    if (strict === true) {
        return { ok: false, reason: '--strict: ' + requested + ' chua ' + String(candidates.length) + ' run-dir — hay tro thang vao run-dir can cham' };
    }
    const newest = candidates[candidates.length - 1];
    return { ok: true, dir: newest, how: 'container ' + String(candidates.length) + ' run-dir -> moi nhat ' + path.relative(REPO, newest).split(path.sep).join('/') };
}

// ghi artifact CHI o che do fresh; --analyze la chi-doc (contract t133/A1)
let WRITE_ARTIFACTS = false;

function emit_(file, content) {
    if (WRITE_ARTIFACTS !== true) return false;
    fs.writeFileSync(file, content);
    return true;
}

async function main() {
    const argv = process.argv.slice(2);
    const { parsed, problems } = parseCli(argv);
    if (problems.length > 0) {
        console.error('LOI DUNG CLI (exit 2, khong ghi dia):');
        problems.forEach((problem) => console.error('  - ' + problem));
        console.error(USAGE);
        process.exit(2);
    }
    const analyze = parsed.mode === 'analyze';
    let target = undefined;
    let resolveNote = 'fresh run, ghi artifact';
    if (analyze) {
        const resolved = resolveAnalyzeTarget(parsed.requested, parsed.strict);
        if (resolved.ok !== true) {
            console.error('LOI --analyze (exit 2, khong ghi dia): ' + resolved.reason);
            console.error(USAGE);
            process.exit(2);
        }
        target = resolved.dir;
        resolveNote = 'che do chi doc, ' + resolved.how;
    } else {
        target = path.join(OUT_ROOT, 'run-' + stamp());
    }
    WRITE_ARTIFACTS = analyze !== true;
    if (WRITE_ARTIFACTS === true) fs.mkdirSync(target, { recursive: true });
    const targetRel = path.relative(REPO, target).split(path.sep).join('/');
    console.log('# t132 panel runtime order — mode=' + (analyze ? 'analyze' : 'fresh') + ' target=' + targetRel + ' (' + resolveNote + ')');
    console.log('# bundle do nguoi dung cai: ' + INSTALLED);
    console.log('# boots this invocation: 0 (moi phep do deu chay trong tien trinh nay)');
    console.log('# ghi artifact: ' + (WRITE_ARTIFACTS === true ? 'co (fresh mode)' : 'KHONG (--analyze chi doc) '));

    const artifact = { mode: analyze ? 'analyze' : 'fresh', target: path.relative(REPO, target).split(path.sep).join('/'), bootsThisInvocation: 0 };

    // ---------------------------------------------------------------- C1 identity
    const installedHash = hashOf(INSTALLED);
    const sourceHash = hashOf(SOURCE_CLIENT);
    const installedText = fs.readFileSync(INSTALLED, 'utf8');
    const identityProblems = [];
    if (installedHash.sha256 !== PINNED_INSTALLED.sha256) identityProblems.push('installed sha256 ' + installedHash.sha256 + ' != pinned ' + PINNED_INSTALLED.sha256);
    if (installedHash.bytes !== PINNED_INSTALLED.bytes) identityProblems.push('installed bytes ' + installedHash.bytes + ' != pinned ' + PINNED_INSTALLED.bytes);
    if (sourceHash.sha256 !== installedHash.sha256) identityProblems.push('installed bundle != packages/dsh-agent-teams/lib/client.js (' + sourceHash.sha256 + ')');
    check('C1', 'bundle DA CAI la dung bo byte phat hanh t130 (bang ca tep nguon)', identityProblems.length === 0,
        identityProblems.length === 0
            ? 'sha256 ' + installedHash.sha256 + ' / ' + installedHash.bytes + ' B — installed == packages/dsh-agent-teams/lib/client.js'
            : identityProblems.join('; '));
    artifact.identity = { installed: installedHash, source: sourceHash, pinned: PINNED_INSTALLED };

    // ------------------------------------------------------- C2 layer A (static)
    const staticOrder = orderProblems(installedText, STATIC_SPEC);
    check('C2', 'LOP A: nam call site anh em trong bundle da cai theo dung thu tu', staticOrder.problems.length === 0,
        staticOrder.problems.length === 0 ? measuredText(staticOrder.measured) : staticOrder.problems.join('; '));
    artifact.staticOrder = staticOrder;

    // ------------------------------------------- C3 layer B: DOM via react-dom/server
    const installedReal = loadBundleFile(INSTALLED, { hooks: 'real', jsx: 'real' });
    const plainProps = { team: fixtureTeam(), t: tFn, modelDirectory: undefined, onNavigate: () => undefined, historic: false, workspace: false };
    const plainHtml = serverRenderer.renderToStaticMarkup(realReact.createElement(installedReal.TeamSection, plainProps));
    emit_(path.join(target, 'dom-plain.html'), plainHtml);
    const plainOrder = orderProblems(plainHtml, DOM_SPEC_PLAIN);
    const plainMemberRows = countOf(plainHtml, 'data-activity=');
    const plainMemberNames = ['>ana<', '>bob<', '>cleo<'].filter((needle) => plainHtml.includes(needle)).length;
    const plainOk = plainOrder.problems.length === 0 && plainMemberRows >= 3 && plainMemberNames === 3;
    check('C3', 'LOP B/DOM: render that bang react-dom/server — ProgressOverview < DependencyMap < AddMemberControl < danh sach member', plainOk,
        (plainOrder.problems.length === 0
            ? measuredText(plainOrder.measured)
            : plainOrder.problems.join('; ')) + ' :: html ' + plainHtml.length + ' ky tu, dong member ' + plainMemberRows + ', ten member ' + plainMemberNames + '/3');
    artifact.domPlain = { url: 'tests/tmp/t132/dom-plain.html', order: plainOrder, memberRows: plainMemberRows, memberNames: plainMemberNames, htmlBytes: plainHtml.length };

    // ------------------------------- C4 layer B: DOM with WorkspaceSummary (stub hooks)
    const installedStub = loadBundleFile(INSTALLED, { hooks: 'stub', jsx: 'real' });
    const workspaceProps = { team: fixtureTeam(), t: tFn, modelDirectory: undefined, onNavigate: () => undefined, historic: false, workspace: true };
    const workspaceHtml = serverRenderer.renderToStaticMarkup(realReact.createElement(installedStub.TeamSection, workspaceProps));
    emit_(path.join(target, 'dom-workspace.html'), workspaceHtml);
    const workspaceOrder = orderProblems(workspaceHtml, DOM_SPEC_WORKSPACE);
    check('C4', 'LOP B/DOM: che do workspace them WorkspaceSummary SAU danh sach member', workspaceOrder.problems.length === 0,
        workspaceOrder.problems.length === 0 ? measuredText(workspaceOrder.measured) : workspaceOrder.problems.join('; '));
    artifact.domWorkspace = { url: 'tests/tmp/t132/dom-workspace.html', order: workspaceOrder, htmlBytes: workspaceHtml.length };

    // ---------------------------------------------- C5 layer B: element tree identity
    const installedTree = loadBundleFile(INSTALLED, { hooks: 'stub', jsx: 'record' });
    const treeText = serialize(installedTree.TeamSection(workspaceProps));
    emit_(path.join(target, 'tree-workspace.txt'), treeText);
    const treeOrder = orderProblems(treeText, TREE_SPEC);
    const treeMembers = ['<button', 'data-members-toggle=true'].every((needle) => treeText.includes(needle));
    check('C5', 'LOP B/TREE: cay phan tu (jsx-runtime ghi lai) giu dung thu tu component, khong phai so chuoi', treeOrder.problems.length === 0 && treeMembers,
        (treeOrder.problems.length === 0 ? measuredText(treeOrder.measured) : treeOrder.problems.join('; ')) + ' :: tree ' + treeText.length + ' ky tu');
    artifact.tree = { url: 'tests/tmp/t132/tree-workspace.txt', order: treeOrder, treeBytes: treeText.length };

    // ------------------------------------------------- C6 negative control: old bundle
    // ------------------------------------------------- C6 negative control: old bundle
    const old = ensureOldClient();
    let oldExtract = old.cached === true ? 'dung ban sao trong tests/tmp/t132' : 'chua co ban sao';
    let oldText = undefined;
    let oldHash = { sha256: 'none', bytes: 0 };
    if (old.cached === true) {
        oldHash = hashOf(old.file);
    } else if (old.needsExtract === true) {
        const extracted = await extractOldClient(old.file, WRITE_ARTIFACTS);
        if (extracted.ok === true) {
            oldText = extracted.text;
            oldHash = { sha256: extracted.hash, bytes: extracted.bytes };
            oldExtract = 'git show HEAD' + (extracted.wrote === true ? ' -> tests/tmp/t132/old-client.js (' + extracted.bytes + ' B)' : ' (trong bo nho, khong ghi dia vi che do --analyze)');
        } else {
            oldExtract = 'FAILED: ' + extracted.reason;
        }
    }
    const oldMatchesPin = oldHash.sha256 === PINNED_V19.sha256 && oldHash.bytes === PINNED_V19.bytes;
    let oldProblems = ['old bundle unavailable'];
    let oldDetail = 'no file';
    if (oldMatchesPin) {
        const loadOld = (options) => (oldText === undefined ? loadBundleFile(old.file, options) : loadBundleText(oldText, 't132:old-in-memory', options));
        const oldReal = loadOld({ hooks: 'real', jsx: 'real' });
        const oldHtml = serverRenderer.renderToStaticMarkup(realReact.createElement(oldReal.TeamSection, plainProps));
        emit_(path.join(target, 'old-dom-plain.html'), oldHtml);
        const oldOrder = orderProblems(oldHtml, DOM_SPEC_PLAIN);
        const oldTree = loadOld({ hooks: 'stub', jsx: 'record' });
        const oldTreeOrder = orderProblems(serialize(oldTree.TeamSection(workspaceProps)), TREE_SPEC);
        oldProblems = oldOrder.problems;
        oldDetail = 'old ' + oldHash.sha256.slice(0, 16) + ' DOM ' + measuredText(oldOrder.measured) + ' :: ' + oldOrder.problems.join('; ')
            + ' || TREE problems: ' + (oldTreeOrder.problems.length === 0 ? '(none)' : oldTreeOrder.problems.join('; '));
        emit_(path.join(target, 'old-order-problems.txt'), oldOrder.problems.join(NL) + NL + oldTreeOrder.problems.join(NL) + NL);
        artifact.oldBundle = { file: 'tests/tmp/t132/old-client.js', extract: oldExtract, hash: oldHash, domOrder: oldOrder, treeProblems: oldTreeOrder.problems };
    }
    check('C6', 'DOI CHUNG AM: bundle CU (git HEAD, vong 19) PHAI do cung phep thu tu', oldMatchesPin && oldProblems.length > 0 && oldHash.sha256 !== installedHash.sha256,
        'sha ' + oldHash.sha256.slice(0, 16) + ' (' + oldExtract + ') :: ' + oldDetail);

    // ------------------------------------------ C7 negative control: swapped call sites
    const swapped = swapPanelCalls(installedText);
    let swapOk = false;
    let swapDetail = swapped.ok === true ? '' : 'mutation failed: ' + swapped.reason;
    if (swapped.ok === true) {
        const swappedModule = loadBundleText(swapped.text, 't132:swapped-in-memory', { hooks: 'real', jsx: 'real' });
        const swappedHtml = serverRenderer.renderToStaticMarkup(realReact.createElement(swappedModule.TeamSection, plainProps));
        const swappedOrder = orderProblems(swappedHtml, DOM_SPEC_PLAIN);
        const delta = hashOfText(swapped.text).bytes - Buffer.byteLength(installedText, 'utf8');
        swapOk = swappedOrder.problems.length > 0 && countOf(swapped.text, 'DependencyMap, { tasks') === 1 && countOf(swapped.text, 'AddMemberControl, { team') === 1;
        swapDetail = 'mutation applies: byte delta ' + delta + ' :: DOM ' + measuredText(swappedOrder.measured) + ' :: ' + swappedOrder.problems.join('; ');
        emit_(path.join(target, 'swap-order-problems.txt'), swappedOrder.problems.join(NL) + NL);
        artifact.swapped = { byteDelta: delta, order: swappedOrder };
    }
    check('C7', 'DOI CHUNG AM: ban copy dao nguoc 2 call site PHAI do cung phep thu tu', swapOk, swapDetail);

    // --------------------------------------- C8 negative control: one marker removed
    const missingText = installedText.split('data-dependency-map').join('data-dependency-gone');
    const missingModule = loadBundleText(missingText, 't132:missing-marker-in-memory', { hooks: 'real', jsx: 'real' });
    const missingHtml = serverRenderer.renderToStaticMarkup(realReact.createElement(missingModule.TeamSection, plainProps));
    const missingOrder = orderProblems(missingHtml, DOM_SPEC_PLAIN);
    const missingProblem = missingOrder.problems.find((problem) => problem.startsWith('missing DependencyMap'));
    emit_(path.join(target, 'missing-marker-problems.txt'), missingOrder.problems.join(NL) + NL);
    artifact.missingMarker = { mutationApplies: missingText !== installedText, problems: missingOrder.problems };
    check('C8', 'DOI CHUNG AM: xoa 1 marker DOM PHAI bao missing (indexOf(-1) khong the lot qua)', missingText !== installedText && missingProblem !== undefined,
        missingOrder.problems.length === 0 ? 'khong bao gi' : missingOrder.problems.join('; '));

    // --------------------------------------------- C9 no writes + doc + analyze mode
    const installedAfter = hashOf(INSTALLED);
    const sourceAfter = hashOf(SOURCE_CLIENT);
    const docText = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : '';
    const docTokens = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'].filter((token) => docText.includes(token));
    const docHasLimits = docText.includes('Giới hạn') || docText.includes('Gioi han');
    const docOk = docTokens.length === 9 && docHasLimits;
    let analyzeDetail = 'fresh run — artifact written for a later --analyze';
    let analyzeOk = true;
    if (analyze) {
        const stored = path.join(target, 'results.json');
        let previous = undefined;
        let parseError = '';
        try {
            previous = JSON.parse(fs.readFileSync(stored, 'utf8'));
        } catch (error) {
            previous = undefined;
            parseError = String(error.message);
        }
        if (previous === undefined) {
            analyzeOk = false;
            analyzeDetail = 'results.json khong doc duoc (' + parseError + ') — KHONG duoc coi la dat';
        } else {
            const previousPlain = previous.domPlain !== undefined ? previous.domPlain : (previous.artifact !== undefined && previous.artifact.domPlain !== undefined ? previous.artifact.domPlain : undefined);
            const storedMeasured = previousPlain !== undefined && previousPlain.order !== undefined && Array.isArray(previousPlain.order.measured) === true ? previousPlain.order.measured : undefined;
            const nowIndices = measuredText(plainOrder.measured);
            if (storedMeasured === undefined) {
                analyzeOk = false;
                analyzeDetail = 'results.json thieu domPlain.order.measured nen khong so duoc (KHONG duoc coi la dat): fresh ' + nowIndices;
            } else {
                const thenIndices = measuredText(storedMeasured);
                analyzeOk = thenIndices === nowIndices;
                analyzeDetail = 'analyze 0 boot, chi doc: stored ' + thenIndices + (analyzeOk === true ? ' == ' : ' != ') + 'fresh ' + nowIndices;
            }
        }
        artifact.analyze = { mode: 'analyze-read-only', orderMatchesStored: analyzeOk, detail: analyzeDetail, wroteArtifacts: false };
    }
    check('C9', 'khong ghi byte nao vao bundle nguon/da cai + doc du token + --analyze chi doc (idempotent)', analyzeOk && docOk && installedAfter.sha256 === installedHash.sha256 && sourceAfter.sha256 === sourceHash.sha256,
        'installed unchanged=' + (installedAfter.sha256 === installedHash.sha256) + ' source unchanged=' + (sourceAfter.sha256 === sourceHash.sha256)
            + ' doc tokens ' + docTokens.length + '/9 + muc gioi han=' + docHasLimits + ' :: ' + analyzeDetail);

    artifact.results = results;
    const wroteResults = emit_(path.join(target, 'results.json'), JSON.stringify(artifact, null, 2));
    emit_(path.join(target, 'run-meta.json'), JSON.stringify({ mode: artifact.mode, bootsThisInvocation: 0, bootsTotalReal: 0, checks: results.length, failures: failures, target: artifact.target }, null, 2));

    const proved = results.filter((entry) => entry.ok).map((entry) => entry.id);
    const unproved = results.filter((entry) => entry.ok === false).map((entry) => entry.id);
    console.log('');
    console.log('verdict ' + (failures === 0 ? 'PASS' : 'FAIL') + ' — proved ' + (proved.length === 0 ? '(none)' : proved.join(',')) + ' — unproved ' + (unproved.length === 0 ? '(none)' : unproved.join(',')));
    console.log('artifact: ' + artifact.target + ' · boots that: 0 · so ca: ' + results.length + ' · hong: ' + failures + ' · ghi results.json: ' + (wroteResults === true ? 'co' : 'KHONG (che do --analyze chi doc)'));
    process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error('HARNESS FAILURE: ' + (error instanceof Error ? error.stack : String(error)));
    process.exit(2);
});
