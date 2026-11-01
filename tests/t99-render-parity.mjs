#!/usr/bin/env node
/**
 * t99 — parity between what a tool RETURNS and what its text says.
 *
 * BUG-025: nine top-level fields and four nested groups reached the structured
 * payload and never reached output.render, so the captain (who reads the text) could
 * not see the roster it had just created, the profile it had just edited, or the route
 * a member would really use. No suite compared output.schema with output.render, which
 * is why thirteen audit rounds missed it.
 *
 * This suite is the behavioural half of that comparison: it captures the REAL
 * definitions from lib/tools.js (same stub context the t98 gate uses), renders a
 * realistic payload, and asserts the fixed field is READABLE in the text. The negative
 * control wraps a render in memory only (the shipped render is never patched), deletes
 * the field, and asserts the same parity check then FAILS — a green run has to mean
 * something.
 *
 * Read-only: nothing under lib/ is written.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const TOOLS_URL = new URL('../packages/dsh-agent-teams/lib/tools.js', import.meta.url).href;

const CONFIG = {
    stateDir: '.agent-teams',
    memberProvider: 'spawn',
    maxMembers: 8,
    maxManualMembers: 12,
    profiles: {},
    toolPolicies: {},
};

function memberRuntime() {
    const runtime = {
        followup() { return Promise.resolve('stub'); },
        sendMessage() { return Promise.resolve('stub'); },
        startActivation() { return Promise.reject(new Error('t99: static process has no agent runtime')); },
        getProvider() { return { id: 'spawn' }; },
        list() { return []; },
        interrupt() {},
    };
    runtime[Symbol.for('dsh.subagent.deliverPrompt')] = () => Promise.resolve('deliver');
    runtime[Symbol.for('dsh.subagent.queuePrompt')] = () => Promise.resolve('queue');
    return runtime;
}

function stubContext(registered) {
    const noop = () => {};
    return {
        logger: { debug: noop, info: noop, warn: noop, error: noop },
        tools: { register: (definition) => { registered.push(definition); } },
        agents: { get() { return undefined; }, list() { return []; } },
        subagents: memberRuntime(),
        llm: {
            async listModels() { return []; },
            async listProviders() { return []; },
            async resolveCallConfig(config) { return config; },
        },
        on() { return noop; },
        inject: noop,
        systemPrompt: { section: noop },
        effect(fn) { try { fn(); } catch { /* stub */ } },
        get() { return undefined; },
    };
}

const toolsModule = await import(TOOLS_URL);
const registered = [];
toolsModule.registerAgentTeamsTools(stubContext(registered), CONFIG);
const definitions = new Map(registered.filter((definition) => definition.output !== undefined && typeof definition.output.render === 'function').map((definition) => [definition.name, definition]));

function renderOf(name) {
    const definition = definitions.get(name);
    assert.ok(definition !== undefined, 'the tool ' + name + ' must be registered with a render');
    return definition;
}

function flatten(item) {
    if (typeof item === 'string') return item;
    if (Array.isArray(item)) return item.map(flatten).join('\n');
    if (item && typeof item === 'object') return String(item.text ?? '');
    return String(item ?? '');
}

function textFor(definition, payload) {
    return flatten(definition.output.render({}, payload));
}

/** ---- fixtures: real-looking payloads, not schema sentinels ---- */

const CREATE_PAYLOAD = {
    team_id: 'team-t99',
    team_name: 't99-review',
    state_dir: '.agent-teams',
    phase: 'staged',
    captain_session_id: 'sess-captain',
    profile: 'ErpTeam',
    task_planning: 'planned',
    members: [
        {
            member_name: 'alice',
            member_id: 'child-a',
            member_role: 'researcher',
            provider: 'command-code-goat',
            model: 'deepseek/deepseek-v4.1-flash',
            reasoning_effort: 'high',
            tool_policy: 'read-only',
            status: 'idle',
        },
        {
            member_name: 'bob',
            member_id: '',
            member_role: 'builder',
            provider: 'command-code-goat',
            model: 'deepseek/deepseek-v4.1-pro',
            status: 'pending',
        },
    ],
    tasks: [
        {
            task_id: 't1',
            seed_id: 'seed-1',
            subject: 'read the ERP sheet',
            assignee: 'alice',
            dependencies: [],
            status: 'pending',
            kind: 'implementation',
        },
    ],
};

const PROFILE_PAYLOAD = {
    member_name: 'alice',
    changed: ['execution_prompt'],
    execution_prompt: 'Read the sheet and report the row count.',
    previous_role: 'researcher',
    previous_execution_prompt: 'Read the sheet.',
};

const EDIT_PLAN_PAYLOAD = {
    status: 'staged',
    members: 2,
    tasks: 1,
    dependencies: 0,
    graph: ['t1 [pending] read the ERP sheet -> alice'],
    roster: ['alice (researcher; command-code-goat/deepseek/deepseek-v4.1-flash)'],
    team_id: 'team-t99',
};

const STATUS_PAYLOAD = {
    team_id: 'team-t99',
    team_name: 't99-review',
    description: 'review team',
    phase: 'running',
    viewer: 'captain',
    members: [
        {
            name: 'alice',
            role: 'researcher',
            status: 'idle',
            activity: 'ready',
            provider: 'command-code-goat',
            model: 'deepseek/deepseek-v4.1-flash',
            reasoning_effort: 'high',
            execution_prompt: 'Read the sheet and report the row count.',
            tool_policy: 'read-only',
            active_provider: 'cline',
            active_model: 'moonshotai/kimi-k3',
            fallback_active: true,
            fallback: { provider: 'command-code-goat', model: 'deepseek/deepseek-v4.1-flash', reasoning_effort: 'high' },
            route_override: { provider: 'command-code-goat', model: 'deepseek/deepseek-v4.1-pro', reasoning_effort: 'max', source: 'captain', at: 1700000000000 },
            next_route: 'command-code-goat/deepseek/deepseek-v4.1-pro',
            last_failure: { code: 'QUOTA', message: 'quota exhausted for this key', at: 1700000000001, provider: 'cline', model: 'moonshotai/kimi-k3' },
        },
    ],
    tasks: [
        {
            id: 't1',
            subject: 'read the ERP sheet',
            status: 'in_progress',
            assignee: 'alice',
            dependencies: [],
            attempt: 2,
            attempt_id: 'attempt-abc',
            kind: 'implementation',
            output: 'row count 107',
        },
    ],
    coverage: [{ goal_item: 'G2', status: 'covered', task_ids: ['t1'], evidence: 'tests/t99-render-parity.mjs PASS' }],
    delivery: { ok: true, blockers: [], warnings: [] },
    captain_inbox: [],
    member_inbox: [],
    member_inboxes: {},
    mailbox_warning_count: 0,
    mailbox_warnings: [],
};

/** ---- the checks ---- */

const CASES = [];
function check(name, fn) {
    CASES.push({ name, fn });
}

/** Parity helper: every token must be readable in the rendered text. */
function expectTokens(text, tokens, label) {
    const missing = tokens.filter((token) => !text.includes(token));
    assert.deepEqual(missing, [], label + ': the text must print ' + JSON.stringify(tokens) + ', missing ' + JSON.stringify(missing));
}

check('a1 — create prints the whole roster it just created (name, id, role, route, status, policy)', () => {
    const text = textFor(renderOf('agent_teams_create'), CREATE_PAYLOAD);
    expectTokens(text, ['Members (2):', 'alice', 'child-a', 'researcher', 'command-code-goat/deepseek/deepseek-v4.1-flash', 'reasoning high', 'status idle', 'policy read-only', 'bob', 'builder', 'deepseek/deepseek-v4.1-pro', 'status pending'], 'create roster');
    return text;
});

check('a2 — create prints profile, task planning and the status/kind of every seed task', () => {
    const text = textFor(renderOf('agent_teams_create'), CREATE_PAYLOAD);
    expectTokens(text, ['Profile: ErpTeam', 'Task planning: planned', 'status=pending', 'kind=implementation', 'seed-1'], 'create plan header');
});

check('a3 — set_member_profile prints the new prompt and the previous value it replaced', () => {
    const text = textFor(renderOf('agent_teams_set_member_profile'), PROFILE_PAYLOAD);
    expectTokens(text, ['execution prompt: Read the sheet and report the row count.', 'previous role: researcher', 'previous execution prompt: Read the sheet.'], 'profile text');
    return text;
});

check('a4 — set_member_profile keeps its old sentence byte for byte when nothing previous is present', () => {
    const text = textFor(renderOf('agent_teams_set_member_profile'), { member_name: 'bob', changed: ['role'], role: 'builder' });
    assert.equal(text, 'Member "bob" profile updated (role) — role: builder — saved; it takes effect the next time this member starts, and the step already in flight keeps the prompt it started with.');
});

check('a5 — edit_plan.team_id is allow-listed with a reason instead of printed (t94 pins this text byte for byte)', () => {
    // Deliberate scope decision, recorded in the gate: t94 compares the whole text of
    // this render in three cases, so a team_id line cannot be added without rewriting a
    // suite that is outside this task. The field must therefore be declared, not dropped.
    const full = textFor(renderOf('agent_teams_edit_plan'), EDIT_PLAN_PAYLOAD);
    assert.equal(full.includes('team_id'), false, 'this render must stay byte-identical to what t94 pins');
    const empty = textFor(renderOf('agent_teams_edit_plan'), { ...EDIT_PLAN_PAYLOAD, graph: [], roster: [] });
    assert.equal(empty, 'Staged plan updated atomically (2 members, 1 tasks, 0 dependencies). No members were spawned and no tasks were scheduled.');
    const gateSource = readFileSync(join(REPO_ROOT, 'tests', 't98-render-coverage.mjs'), 'utf8');
    assert.match(gateSource, /tool: 'agent_teams_edit_plan',\s*\n\s*field: 'team_id',/u, 'the gate must declare this field in ALLOW_LIST');
    assert.match(gateSource, /field: 'team_id',\s*\n\s*file: 'lib\/tools\.js:1142-1152',/u, 'the entry must name the render line');
});

check('a6 — status prints team_id and phase of the snapshot it describes', () => {
    const text = textFor(renderOf('agent_teams_status'), STATUS_PAYLOAD);
    expectTokens(text, ['Team id: team-t99', 'phase: running'], 'status identity');
});

check('a7 — status prints the execution prompt, the active route, the fallback and the override with its provenance', () => {
    const text = textFor(renderOf('agent_teams_status'), STATUS_PAYLOAD);
    expectTokens(text, ['prompt: Read the sheet and report the row count.', 'active route: cline/moonshotai/kimi-k3', 'fallback route: command-code-goat/deepseek/deepseek-v4.1-flash (reasoning high)', 'override route: command-code-goat/deepseek/deepseek-v4.1-pro (reasoning max) by captain at 2023-11-14T22:13:20.000Z'], 'status member routes');
});

check('a8 — status prints the last provider failure with its route', () => {
    const text = textFor(renderOf('agent_teams_status'), STATUS_PAYLOAD);
    expectTokens(text, ['last failure: QUOTA — quota exhausted for this key (cline/moonshotai/kimi-k3)', '2023-11-14T22:13:20.001Z'], 'status last failure');
});

check('a9 — status prints the attempt_id update_task needs and the evidence behind a coverage row', () => {
    const text = textFor(renderOf('agent_teams_status'), STATUS_PAYLOAD);
    expectTokens(text, ['attempt_id attempt-abc', 'evidence: tests/t99-render-parity.mjs PASS'], 'status handle + evidence');
});

check('a10 — NEGATIVE CONTROL: deleting the fixed field in memory makes the same parity check fail', () => {
    const definition = renderOf('agent_teams_create');
    const before = textFor(definition, CREATE_PAYLOAD);
    const original = definition.output.render;
    const broken = {
        ...definition,
        output: {
            ...definition.output,
            render: (args, value) => {
                const copy = { ...value };
                delete copy.members;
                return original(args, copy);
            },
        },
    };
    const after = textFor(broken, CREATE_PAYLOAD);
    assert.equal(before.includes('Members (2):'), true);
    assert.equal(after.includes('Members (2):'), false);
    assert.equal(after.includes('child-a'), false);
    const deltaBytes = Buffer.byteLength(before, 'utf8') - Buffer.byteLength(after, 'utf8');
    assert.ok(deltaBytes > 0, 'dropping the roster must shrink the text');
    console.log('  negative control: applies=1 dropped=members delta_bytes=' + deltaBytes + ' (shipped render untouched)');
});

check('a11 — the t98 gate answers in both modes: report EXIT 0, --strict EXIT 0 when clean, unknown flag EXIT 2', () => {
    const run = (args) => {
        try {
            const stdout = execFileSync(process.execPath, ['tests/t98-render-coverage.mjs', ...args], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
            return { status: 0, stdout };
        } catch (error) {
            return { status: error.status ?? -1, stdout: String(error.stdout ?? '') };
        }
    };
    const report = run([]);
    assert.equal(report.status, 0, 'report mode must exit 0 even when it prints findings');
    assert.match(report.stdout, /^mode: --report/m);
    assert.match(report.stdout, /SUMMARY tools=16 fields=\d+ reached=\d+ uncovered=0/u);
    const strict = run(['--strict']);
    assert.equal(strict.status, 0, 'strict mode must exit 0 with uncovered=0');
    assert.match(strict.stdout, /^mode: --strict/m);
    assert.match(strict.stdout, /verdict GREEN/u);
    const namedReport = run(['--report']);
    assert.equal(namedReport.status, 0, '--report is the same mode as the default and must exit 0');
    assert.match(namedReport.stdout, /^mode: --report/m);
    const bogus = run(['--bogus']);
    assert.equal(bogus.status, 2, 'a broken invocation is never a pass');
    assert.match(bogus.stdout, /GATE ERROR: unknown argument/u);
    const conflict = run(['--report', '--strict']);
    assert.equal(conflict.status, 2, 'two opposite verdicts cannot both be honoured');
    assert.match(conflict.stdout, /GATE ERROR: --report and --strict/u);
    console.log('  gate: default=0 --report=0 --strict=0 bogus=2 conflict=2');
});

let failed = 0;
let index = 0;
for (const item of CASES) {
    index += 1;
    try {
        item.fn();
        console.log('ok ' + index + ' ' + item.name);
    } catch (error) {
        failed += 1;
        console.log('not ok ' + index + ' ' + item.name);
        console.log('  ' + String(error.message).split('\n').join('\n  '));
    }
}
console.log('');
console.log('# ' + (CASES.length - failed) + '/' + CASES.length + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
