#!/usr/bin/env node
/**
 * t98 — static coverage gate for the BUG-024 class.
 *
 * BUG-024 has two halves. The first is a wrong payload. The second half — the one
 * this gate is about — is a CORRECT payload whose model-facing tool_result text
 * never prints some of it, so the reader (captain or member) cannot see a field the
 * tool really returned.
 *
 * How it measures (no grep, no string matching against the source):
 *   1. capture the REAL definitions out of registerAgentTeamsTools
 *      (packages/dsh-agent-teams/lib/tools.js:505) through a stub context;
 *   2. build a payload fixture out of every output.schema;
 *      agent_teams_status declares additionalProperties:true and properties:{},
 *      so its DTO is mapped by hand from the object returned at
 *      lib/tools.js:2563-2591 and read by renderStatus at lib/tools.js:3215;
 *   3. call the real output.render(args, payload) and assert every TOP-LEVEL field
 *      reaches the text: a unique sentinel (string/number), a boolean/enum branch
 *      (the text changes when the flag flips), or an explicit ALLOW_LIST entry that
 *      names the file:line and says why printing it would be wrong or duplicative.
 *
 * Read-only by construction: nothing under lib/ is written, and the render under
 * measurement is never patched — the negative control wraps a passing render in
 * memory only, to prove the gate is not silently green.
 *
 * Two modes (t99), because the same gate is both a report and a gate:
 *   node tests/t98-render-coverage.mjs             — REPORT mode (same as --report), always
 *       EXIT 0: prints the whole SUMMARY block and every finding, even when RED.
 *   node tests/t98-render-coverage.mjs --report     — the mode above, named explicitly.
 *   node tests/t98-render-coverage.mjs --strict     — GATE mode: EXIT 1 while a top-level
 *       field never reaches the text, a nested value of a printed field never reaches the
 *       text (t110 / V17-F2), or the declared output.schema disagrees with the payload the
 *       tool really returns; EXIT 0 only when every gate is clean.
 *   Any other argument, or both flags at once, is refused with a GATE ERROR and EXIT 2.
 *
 * Exit codes in both modes:
 *   2 — the gate could not run (unknown argument, definition count, stale line map,
 *       silent negative control, or a render that throws on its own schema). A broken
 *       gate is never a pass, so this code is identical in report and strict mode.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');
const PKG_DIR = join(REPO_ROOT, 'packages', 'dsh-agent-teams');
const PKG_LIB = join(PKG_DIR, 'lib');
const TOOLS_JS = join(PKG_LIB, 'tools.js');
const TOOLS_URL = new URL('../packages/dsh-agent-teams/lib/tools.js', import.meta.url).href;

/** t99: two named modes. --report is the default, --strict turns findings into a gate. */
const ARGV = process.argv.slice(2);
const STRICT = ARGV.includes('--strict');
const CONFLICT = STRICT && ARGV.includes('--report');
const UNKNOWN_ARGS = ARGV.filter((arg) => arg !== '--strict' && arg !== '--report');

/** Minimum config registerAgentTeamsTools needs to register the tools (t11/t59 shape). */
const CONFIG = {
    stateDir: '.agent-teams',
    memberProvider: 'spawn',
    maxMembers: 8,
    maxManualMembers: 12,
    profiles: {},
    toolPolicies: {},
};

/**
 * Where each tool render lives, measured with grep when this gate was written.
 * The gate re-reads those lines and refuses to run when the map is stale, so a
 * moved render can never point a finding at the wrong line.
 */
const RENDER_LINES = {
    agent_teams_create: 889,
    agent_teams_edit_plan: 1142,
    agent_teams_approve: 1254,
    agent_teams_add_member: 1303,
    agent_teams_set_member_route: 1366,
    agent_teams_set_member_profile: 1479,
    agent_teams_remove_member: 1542,
    agent_teams_create_task: 1630,
    agent_teams_reassign_task: 1766,
    agent_teams_claim_task: 1901,
    agent_teams_update_task: 2071,
    agent_teams_amend_task: 2240,
    agent_teams_send_message: 2317,
    agent_teams_status: 2466,
    agent_teams_resume: 2698,
    agent_teams_delete: 2748,
};

/**
 * Fields that MUST NOT be printed, each with the line that decides it. A field is
 * allowed only when printing it would be wrong or pure duplication — never because
 * the reader does not need it. Allowing a whole tool is refused below.
 */
const ALLOW_LIST = [
    {
        tool: 'agent_teams_create',
        field: 'captain_session_id',
        file: 'lib/tools.js:889-901',
        reason: 'duplicate: the reader IS this captain session, and the same id is republished as canonical identity in presentationMeta (lib/tools.js:899-911)',
    },
    {
        tool: 'agent_teams_approve',
        field: 'status',
        file: 'lib/tools.js:1254-1258',
        reason: 'duplicate: this DTO carries exactly one value here ("running") and the fixed text already says "approved and running"',
    },
    {
        tool: 'agent_teams_edit_plan',
        field: 'team_id',
        file: 'lib/tools.js:1142-1152',
        reason: 'duplicate + pinned: this tool can only edit the team its caller is captain of, so the id repeats identity the reader already holds, and tests/t94-edit-plan-roster-render.mjs:259 pins the exact bytes of this text (a team_id line fails 3 of its cases); printing it would need that suite rewritten, which is out of this task',
    },
    {
        tool: 'agent_teams_set_member_profile',
        field: 'applied',
        file: 'lib/tools.js:1479-1490',
        reason: 'duplicate: this call is durable-only by construction (lib/members.js:1660 returns applied "durable-only") and the text already says "saved; it takes effect the next time this member starts"',
    },
    {
        tool: 'agent_teams_delete',
        field: 'deleted',
        file: 'lib/tools.js:2748-2751',
        reason: 'duplicate: the DTO only ever returns true here and the fixed text "ended and archived" already states the outcome, so the flag distinguishes nothing',
    },
    {
        tool: 'agent_teams_status',
        field: 'removed_count',
        file: 'lib/tools.js:2466-3329',
        reason: 'derived duplicate: the DTO sets removed_count = removedMembers.length (lib/tools.js:2660) and the roster title prints that very number from the same array (lib/tools.js:3328-3329), so no witness can tell the two keys apart and printing it again would be the same number twice — kept ONLY because the gate now enforces that derivation itself (t125 / V19-F3)',
        // A literal, not ROSTER_INVARIANT: this table is built before that constant exists.
        guardedBy: 'agent_teams_status.removed_count === agent_teams_status.removed_members.length, asserted on the real payload AND on the rendered roster title (ROSTER INVARIANT block), plus NEGATIVE CONTROL 6 (a copy whose removed_count reads team.members instead must turn --strict red) and tests/t107-removed-members-visible.mjs (t125 / V19-F3)',
    },
    {
        tool: 'agent_teams_update_task',
        field: 'attempt_id',
        file: 'lib/tools.js:2071-2074',
        reason: 'duplicate: the caller supplied this attempt_id in the same call; claim_task and reassign_task are the surfaces that must echo it (lib/tools.js:1887, lib/tools.js:1752)',
    },
];

/** Severity of each uncovered field; anything unlisted falls back to a name heuristic. */
/**
 * State words these renders branch on. A string field that never appears verbatim is
 * still printed when changing its value changes the text (the reader sees the state
 * in words) — that is what separates a real gap from a value-driven branch.
 */
const BRANCH_CANDIDATES = ['staged', 'running', 'live-and-durable', 'durable-only', 'resumed', 'already_running', 'cleared', 'fallback', 'override', 'idle', 'working', 'removed', 'completed', 'failed', 'spawned', 'on-task'];

const SEVERITY = {
    'agent_teams_create.members': 'high',
    'agent_teams_create.profile': 'medium',
    'agent_teams_create.task_planning': 'medium',
    'agent_teams_edit_plan.team_id': 'low',
    'agent_teams_set_member_profile.execution_prompt': 'high',
    'agent_teams_set_member_profile.previous_role': 'medium',
    'agent_teams_set_member_profile.previous_execution_prompt': 'medium',
    'agent_teams_status.team_id': 'low',
    'agent_teams_status.phase': 'medium',
};

/**
 * agent_teams_status declares properties:{}, so its payload cannot come from the
 * schema. This fixture is the DTO returned at lib/tools.js:2589-2626; every nested
 * key is something renderStatus (lib/tools.js:3267) is supposed to reach.
 */
const STATUS_FIXTURE = {
    team_id: 'ZQteam_id',
    team_name: 'ZQteam_name',
    description: 'ZQdescription',
    phase: 'ZQphase',
    halted: true,
    escalated: true,
    loop_state: 'ZQloop_state',
    loop_summary: 'ZQloop_summary',
    deliverable: true,
    coverage: [{ goal_item: 'ZQcoverage_goal_item', task_ids: ['t1'], status: 'ZQcoverage_status', evidence: 'ZQcoverage_evidence' }],
    delivery: { ok: true, blockers: ['ZQdelivery_blockers'], warnings: ['ZQdelivery_warnings'] },
    profile: { name: 'ZQprofile_name', protocol: 'ZQprofile_protocol', task_planning: 'ZQprofile_task_planning' },
    viewer: 'ZQviewer',
    members: [{
        name: 'ZQmembers_name',
        role: 'ZQmembers_role',
        provider: 'ZQmembers_provider',
        model: 'ZQmembers_model',
        reasoning_effort: 'ZQmembers_reasoning_effort',
        tool_policy: 'ZQmembers_tool_policy',
        execution_prompt: 'ZQmembers_execution_prompt',
        status: 'ZQmembers_status',
        activity: 'ZQmembers_activity',
        active_provider: 'ZQmembers_active_provider',
        active_model: 'ZQmembers_active_model',
        fallback_active: true,
        fallback: { provider: 'ZQmembers_fallback_provider', model: 'ZQmembers_fallback_model', reasoning_effort: 'ZQmembers_fallback_reasoning_effort' },
        route_override: { provider: 'ZQmembers_route_override_provider', model: 'ZQmembers_route_override_model', reasoning_effort: 'ZQmembers_route_override_reasoning_effort', source: 'ZQmembers_route_override_source', at: 4242 },
        next_route: 'ZQmembers_next_route',
        spawn_error: 'ZQmembers_spawn_error',
        last_failure: { code: 'ZQmembers_last_failure_code', message: 'ZQmembers_last_failure_message', at: 4242, provider: 'ZQmembers_last_failure_provider', model: 'ZQmembers_last_failure_model' },
    }],
    // t107: the removed rows are part of the payload now, so the gate must reach them too
    // (this is the only place that can measure agent_teams_status: its schema is empty).
    removed_count: 1,
    removed_members: [{
        name: 'ZQremoved_members_name',
        role: 'ZQremoved_members_role',
        provider: 'ZQremoved_members_provider',
        model: 'ZQremoved_members_model',
        reasoning_effort: 'ZQremoved_members_reasoning_effort',
        joined_at: 4242,
        runtime_setup: {
            persona: 'ZQremoved_members_runtime_setup_persona',
            tool_filter: 'ZQremoved_members_runtime_setup_tool_filter',
        },
        route_override: {
            provider: 'ZQremoved_members_route_override_provider',
            model: 'ZQremoved_members_route_override_model',
            reasoning_effort: 'ZQremoved_members_route_override_reasoning_effort',
            source: 'ZQremoved_members_route_override_source',
            at: 4242,
            by: 'ZQremoved_members_route_override_by',
        },
    }],
    tasks: [{
        id: 'ZQtasks_id',
        subject: 'ZQtasks_subject',
        status: 'ZQtasks_status',
        assignee: 'ZQtasks_assignee',
        dependencies: ['ZQtasks_dependencies'],
        attempt: 4242,
        attempt_id: 'ZQtasks_attempt_id',
        reassigning: true,
        kind: 'ZQtasks_kind',
        round: 4242,
        verdict: 'ZQtasks_verdict',
        supplemental_evidence: 'ZQtasks_supplemental_evidence',
        fixes: 'ZQtasks_fixes',
        findings_open: 4242,
        seed_id: 'ZQtasks_seed_id',
        output: 'ZQtasks_output',
    }],
    captain_inbox: [{ from: 'ZQcaptain_inbox_from', content: 'ZQcaptain_inbox_content', ts: 4242 }],
    member_inbox: [{ from: 'ZQmember_inbox_from', content: 'ZQmember_inbox_content', ts: 4242 }],
    member_inboxes: { ZQmember_inboxes_key: { count: 4242, latest: 'ZQmember_inboxes_latest' } },
    mailbox_warnings: ['ZQmailbox_warnings'],
    mailbox_warning_count: 4242,
};

/**
 * The subagent runtime shape lib/harness-compat.js:170 accepts: the continuable
 * setup must expose a prompt queue AND a sendMessage function, otherwise
 * registerAgentTeamsTools throws before it registers a single tool (t59 lesson).
 */
function memberRuntime() {
    const runtime = {
        followup() { return Promise.resolve('stub'); },
        sendMessage() { return Promise.resolve('stub'); },
        startActivation() { return Promise.reject(new Error('t98 gate: static process has no agent runtime')); },
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

/** Stable per-name number so two numeric fields never share one printed token. */
function numberForKey(key) {
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) % 1000003;
    return 4200 + (hash % 600);
}

function generateValue(spec, key) {
    const shape = spec ?? {};
    if (shape.type === 'boolean') return true;
    if (shape.type === 'number' || shape.type === 'integer') return numberForKey(key);
    if (shape.type === 'array') {
        const items = shape.items ?? {};
        if (items.type === 'object') return [generateObject(items.properties ?? {}, key + '_')];
        if (items.type === 'array') return [generateValue(items, key)];
        return ['ZQ' + key];
    }
    if (shape.type === 'object') return generateObject(shape.properties ?? {}, key + '_');
    return 'ZQ' + key;
}

function generateObject(properties, prefix) {
    const payload = {};
    for (const [name, spec] of Object.entries(properties)) payload[name] = generateValue(spec, prefix + name);
    return payload;
}

/** One fixture per tool payload; deterministic, so the negative control reuses it. */
function buildFixture(definition) {
    if (definition.name === 'agent_teams_status') return JSON.parse(JSON.stringify(STATUS_FIXTURE));
    return generateObject((definition.output.schema ?? {}).properties ?? {}, '');
}

function renderText(definition, payload) {
    const parts = definition.output.render({}, payload);
    return flattenRender(parts);
}

function flattenRender(item) {
    if (typeof item === 'string') return item;
    if (Array.isArray(item)) return item.map(flattenRender).join('\n');
    if (item && typeof item === 'object') return String(item.text ?? '');
    return String(item ?? '');
}

function collectLeaves(value, path, out) {
    if (typeof value === 'string') {
        if (value.startsWith('ZQ')) out.push({ path, token: value });
        return out;
    }
    if (typeof value === 'number') {
        out.push({ path, token: String(value) });
        return out;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectLeaves(item, path + '[' + index + ']', out));
        return out;
    }
    if (value && typeof value === 'object') {
        for (const [name, inner] of Object.entries(value)) collectLeaves(inner, path + '.' + name, out);
    }
    return out;
}

/**
 * t117 / V18-F2: the leaf witness is a KEY PATH, never a bare value. The status fixture
 * carries 4242 on both `removed_members[0].joined_at` and `route_override.at`, so a value
 * match kept calling joined_at "printed" after its print was gone — the other 4242 in the
 * text stood in for it. A leaf now counts as printed only by ABLATION: change that ONE
 * leaf (type-preserving sentinel) inside a witness payload and require the rendered text
 * to change. Nothing else in the payload can stand in for it any more.
 * @param value - subtree to walk.
 * @param path - key path accumulated so far, e.g. members[0].joined_at.
 * @param segments - the same path as keys/indices, so setAtPath can address the leaf.
 * @param out - collector.
 * @returns every printable leaf, path-addressed.
 */
function leafRecords(value, path, segments, out) {
    if (typeof value === 'string') {
        if (value.startsWith('ZQ')) out.push({ path, segments, token: value, kind: 'string' });
        return out;
    }
    if (typeof value === 'number') {
        out.push({ path, segments, token: String(value), kind: 'number' });
        return out;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => leafRecords(item, path + '[' + index + ']', [...segments, index], out));
        return out;
    }
    if (value && typeof value === 'object') {
        for (const [name, inner] of Object.entries(value)) leafRecords(inner, path + '.' + name, [...segments, name], out);
    }
    return out;
}

/** Replace the leaf addressed by SEGMENTS, copying every node on the way down. */
function setAtPath(node, segments, value) {
    if (segments.length === 0) return value;
    const [head, ...rest] = segments;
    if (typeof head === 'number') {
        const copy = Array.isArray(node) ? node.slice() : [];
        copy[head] = setAtPath(node[head], rest, value);
        return copy;
    }
    const copy = { ...node };
    copy[head] = setAtPath(node[head], rest, value);
    return copy;
}

/** A per-leaf sentinel of the SAME type, so the render formats it exactly as it would the
 *  real value (a timestamp stays a number and is still turned into an ISO string). */
function mutatedLeafValue(record, index) {
    return record.kind === 'number' ? 500000 + index * 7 : record.token + '#t117';
}

/** Every payload the matcher may look at; the same witness set measure() has always used. */
function witnessPayloads(base) {
    const list = [
        { label: 'allTrue', payload: withBooleans(base, true) },
        { label: 'allFalse', payload: withBooleans(base, false) },
    ];
    for (const [name, value] of Object.entries(base)) {
        if (typeof value !== 'boolean') continue;
        const mixed = withBooleans(base, false);
        mixed[name] = true;
        list.push({ label: 'flip:' + name, payload: mixed });
    }
    return list;
}

/** KEY-PATH witness for one top-level field: a leaf is printed only when changing THAT
 *  leaf changes the text on some witness (a throw counts as consumed, never as printed). */
function nestedLeavesOf(definition, base, field, witnessSet, texts) {
    const records = leafRecords(base[field], field, [field], []);
    const unprinted = [];
    records.forEach((record, index) => {
        const printed = witnessSet.some((witness, position) => texts[position] !== null
            && safeText(definition, setAtPath(witness.payload, record.segments, mutatedLeafValue(record, index))) !== texts[position]);
        if (!printed) unprinted.push(record.path);
    });
    return { leaves: records.length, unprinted };
}

/**
 * The pre-t117 witness, kept ONLY so negative control 4 can reproduce V18-F2 on a real
 * source copy and print "the old matcher stayed green" next to "the new one goes red".
 * It counts a leaf as printed when its value appears anywhere in the text, which is the
 * blindness this task fixes.
 */
function legacyUnprintedPaths(records, union) {
    return records.filter((record) => !union.includes(record.token)).map((record) => record.path);
}

/**
 * Measure one tool. One row per TOP-LEVEL field:
 *   rendered — a value sentinel from that field reaches the text
 *   branch   — the field is boolean and flipping it changes the text
 *   allowed  — ALLOW_LIST says printing it is wrong or duplicative
 *   partial  — the field reaches the text, but some nested values never do (report only)
 *   missing  — nothing from that field reaches the text (this is what turns the gate red)
 */
/**
 * Every boolean in the payload (nested ones included) set to one value, so a branch
 * that the base fixture hides — delivery prints its blockers only when ok is false —
 * still gets a witness.
 */
function withBooleans(payload, value) {
    const walk = (node) => {
        if (Array.isArray(node)) return node.map(walk);
        if (node && typeof node === 'object') {
            const copy = {};
            for (const [name, inner] of Object.entries(node)) copy[name] = typeof inner === 'boolean' ? value : walk(inner);
            return copy;
        }
        return node;
    };
    return walk(payload);
}

function safeText(definition, payload) {
    try {
        return renderText(definition, payload);
    } catch {
        return null;
    }
}

/**
 * Measure one tool against a WITNESS SET, because plenty of these renders are
 * value-driven: phase prints only 'staged' or 'running', the cleared branch hides
 * the fallback route, delivery prints blockers only when it is NOT ok. One fixture
 * would therefore report a reachable field as missing. The witness set is:
 *   - every boolean true, every boolean false, and each boolean flipped alone;
 *   - for a string that still does not appear, one payload per candidate state word.
 * One row per TOP-LEVEL field:
 *   rendered — a value sentinel from that field reaches the text on some witness
 *   branch   — the field is a state word / flag and the text changes when it changes
 *   allowed  — ALLOW_LIST says printing it is wrong or duplicative
 *   partial  — the field reaches the text, but some nested values never do (report only)
 *   missing  — nothing from that field reaches the text on any witness (turns the gate red)
 */
function measure(definition, base = buildFixture(definition)) {
    const properties = (definition.output.schema ?? {}).properties ?? {};
    const topLevel = definition.name === 'agent_teams_status' ? Object.keys(STATUS_FIXTURE) : Object.keys(properties);
    const witnessSet = witnessPayloads(base);
    const texts = witnessSet.map((witness) => safeText(definition, witness.payload));
    if (texts[0] === null || texts[1] === null) return { rows: [], error: 'render threw on the generated fixture' };
    const union = texts.filter((text) => text !== null).join('\n');
    const rows = [];
    for (const field of topLevel) {
        const allowed = ALLOW_LIST.find((entry) => entry.tool === definition.name && entry.field === field);
        if (allowed !== undefined) {
            rows.push({ field, verdict: 'allowed', file: allowed.file, reason: allowed.reason });
            continue;
        }
        const value = base[field];
        if (typeof value === 'boolean') {
            const on = withBooleans(base, false);
            on[field] = true;
            const off = withBooleans(base, false);
            off[field] = false;
            const onText = safeText(definition, on);
            const offText = safeText(definition, off);
            if (onText === null || offText === null) {
                rows.push({ field, verdict: 'missing', note: 'render threw while flipping the flag' });
                continue;
            }
            rows.push(onText === offText
                ? { field, verdict: 'missing', note: 'the text is identical whether the flag is true or false' }
                : { field, verdict: 'branch', note: 'the text changes when the flag flips' });
            continue;
        }
        if (typeof value === 'string') {
            if (union.includes(value)) {
                rows.push({ field, verdict: 'rendered' });
                continue;
            }
            const off = withBooleans(base, false);
            const texts = BRANCH_CANDIDATES
                .map((candidate) => safeText(definition, { ...off, [field]: candidate }))
                .filter((text) => text !== null);
            const distinct = new Set(texts);
            if (distinct.size > 1) {
                rows.push({ field, verdict: 'branch', note: 'printed as a state word: ' + distinct.size + ' distinct texts across ' + texts.length + ' candidate values' });
                continue;
            }
            rows.push({ field, verdict: 'missing', note: 'no value of this field changes the text' });
            continue;
        }
        const nested = nestedLeavesOf(definition, base, field, witnessSet, texts);
        if (nested.leaves === 0) {
            rows.push({ field, verdict: 'missing', note: 'fixture carried no printable value' });
            continue;
        }
        if (nested.unprinted.length === 0) rows.push({ field, verdict: 'rendered' });
        else if (nested.unprinted.length < nested.leaves) rows.push({ field, verdict: 'partial', unprinted: nested.unprinted });
        else rows.push({ field, verdict: 'missing', note: 'none of ' + nested.leaves + ' value(s) reach the text on any witness' });
    }
    return { rows, error: '' };
}


/** Negative control: wrap a PASSING render so it drops one field, in memory only. */
function negativeControl(definitions) {
    const target = definitions.find((definition) => definition.name === 'agent_teams_create_task');
    if (target === undefined) return { applies: false, detail: 'no agent_teams_create_task definition to mutate' };
    const fixture = buildFixture(target);
    const candidates = Object.keys(fixture).filter((name) => typeof fixture[name] === 'string');
    if (candidates.length === 0) return { applies: false, detail: 'the create_task fixture carries no string field to drop' };
    const original = target.output.render;
    const before = renderText(target, fixture);
    const attempts = [];
    let chosen = null;
    for (const dropped of candidates) {
        const broken = {
            ...target,
            output: {
                ...target.output,
                render: (args, value) => {
                    const copy = { ...value };
                    delete copy[dropped];
                    return original(args, copy);
                },
            },
        };
        const after = renderText(broken, buildFixture(broken));
        const missing = measure(broken).rows.filter((row) => row.verdict === 'missing').map((row) => row.field);
        const attempt = {
            dropped,
            missing,
            applies: missing.length === 1 && missing[0] === dropped,
            after,
            deltaBytes: Buffer.byteLength(before, 'utf8') - Buffer.byteLength(after, 'utf8'),
        };
        attempts.push(attempt);
        if (attempt.applies && attempt.deltaBytes !== 0) {
            chosen = attempt;
            break;
        }
        if (chosen === null && attempt.applies) chosen = attempt;
    }
    if (chosen === null) {
        return { applies: false, detail: 'no single dropped field is reported by name: ' + JSON.stringify(attempts.map((attempt) => attempt.missing)), attempts };
    }
    return {
        applies: true,
        detail: 'dropped field "' + chosen.dropped + '" from the agent_teams_create_task render; the gate reported missing=' + JSON.stringify(chosen.missing) + ' (tried ' + attempts.length + ' of ' + candidates.length + ' eligible fields)',
        beforeBytes: Buffer.byteLength(before, 'utf8'),
        afterBytes: Buffer.byteLength(before, 'utf8') - chosen.deltaBytes,
        deltaBytes: chosen.deltaBytes,
        after: chosen.after,
    };
}

function severityOf(tool, field) {
    const key = tool + '.' + field;
    if (SEVERITY[key] !== undefined) return SEVERITY[key];
    if (/last_failure|error|verdict|route|provider|model|evidence|execution_prompt|findings/.test(field)) return 'high';
    if (/member|task|status|attempt/.test(field)) return 'medium';
    return 'low';
}

// ---------------------------------------------------------------------------
// t110 / V17-F2 — the payload contract: what output.schema DECLARES versus what
// execute() really RETURNS. Coverage above judges the TEXT; this judges the PAYLOAD.
// ---------------------------------------------------------------------------
const STATUS_TOOL = 'agent_teams_status';
const SEED_TEAM_ID = 'team-t110';
const SEED_ROOT = join(REPO_ROOT, 'tests', 'tmp', 't110');
/** t125 copies live here and NOWHERE else: closure vong 19 section 8 records a run that mutated the real lib/. */
const T125_ROOT = join(REPO_ROOT, 'tests', 'tmp', 't125');

/**
 * t125 / V19-F3 — the seventh allow-list entry (agent_teams_status.removed_count) can never
 * earn a witness: no payload flip changes the text, because the DTO derives both keys from the
 * SAME array and the roster title prints that array's length. An allow-list entry with no
 * witness is only honest when something else asserts the invariant that makes the duplication
 * safe, so the gate asserts it itself, on the REAL payload AND on the text a reader gets:
 *   removed_count === removed_members.length   and the title prints that number.
 * Audit V19 mutation C (removed_count = team.members.length, -2 B) was GREEN before this check.
 */
const ROSTER_INVARIANT = STATUS_TOOL + '.removed_count === ' + STATUS_TOOL + '.removed_members.length';
const ROSTER_FIELD = STATUS_TOOL + '.removed_count';
const ROSTER_DELTA = -2;

function rosterInvariantProblems(payload, renderedText) {
    if (payload === null || typeof payload !== 'object') return [ROSTER_FIELD + ' — no payload to check the roster invariant against'];
    const problems = [];
    const count = payload.removed_count;
    const roster = payload.removed_members;
    const size = Array.isArray(roster) ? roster.length : undefined;
    if (size === undefined) {
        problems.push(ROSTER_FIELD + ' — ' + STATUS_TOOL + '.removed_members is not an array, so the count summarises nothing (' + ROSTER_INVARIANT + ')');
    } else if (typeof count !== 'number' || count !== size) {
        problems.push(ROSTER_FIELD + ' — is ' + JSON.stringify(count) + ' but ' + STATUS_TOOL + '.removed_members carries ' + size + ' entry(ies) (' + ROSTER_INVARIANT + ')');
    }
    const text = String(renderedText ?? '');
    if (size !== undefined && count === size) {
        if (size > 0 && !text.includes(size + ' removed')) {
            problems.push(ROSTER_FIELD + ' — the payload counts ' + size + ' removed member(s) but the rendered text never prints "' + size + ' removed"');
        }
        if (size === 0 && !text.includes('Members (')) {
            problems.push(ROSTER_FIELD + ' — the payload counts 0 removed members but the rendered text never prints the roster title');
        }
    }
    return problems;
}

/** A validator-legal member carrying every OPTIONAL field the status DTO can report. */
function seedMember(name, status) {
    return {
        id: '',
        name,
        role: 'seed-role',
        provider: 'p1',
        model: 'm1',
        reasoningEffort: 'high',
        toolPolicy: 'read-only',
        executionPrompt: 'seed execution prompt',
        joinedAt: 1700000000000,
        status,
        activeProvider: 'p1',
        activeModel: 'm1',
        fallbackActive: true,
        fallback: { provider: 'p2', model: 'm2', reasoningEffort: 'low' },
        routeOverride: { provider: 'p3', model: 'm3', reasoningEffort: 'medium', source: 'captain', at: 1700000000000 },
        spawnError: 'seed spawn error',
        lastFailure: { code: 'QUOTA', message: 'seed provider failure', at: 1700000000000, provider: 'p2', model: 'm2' },
        // lib/state.js:isTeamMember requires a runtimeSetup to carry a LEGAL toolFilter, and
        // isToolNameList (lib/state.js:622) rejects an EMPTY deny list — so this must be non-empty.
        runtimeSetup: { persona: 'seed persona', toolFilter: { deny: ['agent_teams_delete'] } },
    };
}

/** Team record: maxima for the optional fields, minima required by lib/state.js:isTeamState. */
function seedTeamRecord() {
    return {
        id: SEED_TEAM_ID,
        name: 'Team ' + SEED_TEAM_ID,
        description: 't110 seed',
        captainSessionId: 'sess-captain',
        createdAt: 1700000000000,
        taskSeq: 0,
        phase: 'running',
        profile: { name: 'p1' },
        members: [seedMember('seed-live', 'idle'), seedMember('seed-removed', 'removed')],
        tasks: [],
        messageCount: 0,
    };
}

/**
 * Run the REAL status tool against that seed and return the payload a reader really gets.
 * This is the only way to see what the DTO carries: the fixture is written by hand, so
 * comparing schema with fixture can never notice a key the DTO stopped emitting.
 */
async function realStatusPayload(toolsModule) {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
    await mkdir(SEED_ROOT, { recursive: true });
    const dir = await mkdtemp(join(SEED_ROOT, 'seed-'));
    try {
        const stateRoot = join(dir, CONFIG.stateDir);
        await mkdir(join(stateRoot, SEED_TEAM_ID), { recursive: true });
        await writeFile(join(stateRoot, SEED_TEAM_ID, 'team.json'), JSON.stringify(seedTeamRecord(), null, 2), 'utf8');
        const captain = {
            id: 'sess-captain',
            options: { provider: 'p1', model: 'm1' },
            session: { header: { cwd: dir }, append() {}, requestHeader: () => ({ config: { provider: 'p1', model: 'm1' } }) },
        };
        const registered = [];
        const context = stubContext(registered);
        context.agents = { get: (id) => (id === captain.id ? captain : undefined), list: () => [] };
        toolsModule.registerAgentTeamsTools(context, CONFIG);
        const definition = registered.find((entry) => entry.name === STATUS_TOOL);
        if (definition === undefined) return { payload: undefined, text: '', error: STATUS_TOOL + ' was not registered' };
        const payload = await definition.execute({}, { agent: captain, signal: undefined });
        // t125: the text is scored beside the payload, so the roster invariant can be checked on
        // both halves of what the reader actually gets.
        const text = definition.output.render({}, payload).map((part) => part.text ?? '').join('\n');
        return { payload, text, error: '' };
    } catch (error) {
        return { payload: undefined, text: '', error: error instanceof Error ? error.message : String(error) };
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

function declaredKeysOf(definition) {
    return Object.keys((definition.output.schema ?? {}).properties ?? {});
}

/** TWO-WAY key contract: a missing key AND an undeclared key are both findings. */
function payloadKeyProblems(declaredKeys, payload, label) {
    const problems = [];
    const payloadKeys = Object.keys(payload ?? {});
    for (const key of declaredKeys) {
        if (payloadKeys.includes(key)) continue;
        problems.push(label + '.' + key + ' — declared in output.schema, absent from the payload the tool returned');
    }
    for (const key of payloadKeys) {
        if (declaredKeys.includes(key)) continue;
        problems.push(label + '.' + key + ' — present in the payload, NOT declared in output.schema');
    }
    return problems;
}

/** ALLOW_LIST is audited by MACHINE: the cited range must contain the tool's render line. */
function allowListLineProblems(renderLines, entries = ALLOW_LIST) {
    const problems = [];
    for (const entry of entries) {
        const citation = String(entry.file ?? '');
        const match = /^lib\/tools\.js:(\d+)(?:-(\d+))?$/u.exec(citation);
        if (match === null) {
            problems.push(entry.tool + '.' + entry.field + ' — citation "' + citation + '" is not lib/tools.js:<line>[-<line>]');
            continue;
        }
        const from = Number(match[1]);
        const to = match[2] === undefined ? from : Number(match[2]);
        const renderLine = renderLines[entry.tool];
        if (renderLine === undefined) continue;
        if (renderLine < from || renderLine > to) {
            problems.push(entry.tool + '.' + entry.field + ' — citation ' + citation + ' does not contain its render line ' + renderLine);
        }
    }
    return problems;
}

/** One place decides the exit code, so the negative controls can prove the gate. */
function verdictOf(totals, strict) {
    const total = totals.uncovered + totals.nestedGaps + totals.payloadContract + totals.allowList + (totals.roster ?? 0);
    if (total === 0) return 0;
    return strict ? 1 : 0;
}

/** Negative control 2: drop one top-level key from a COPY of the real payload. */
function payloadControl(declaredKeys, payload) {
    if (payload === undefined) return { applies: false, detail: 'no real payload to mutate', problems: [] };
    const key = Object.keys(payload).includes('removed_count') ? 'removed_count' : Object.keys(payload)[0];
    const mutated = { ...payload };
    delete mutated[key];
    const problems = payloadKeyProblems(declaredKeys, mutated, STATUS_TOOL);
    const beforeBytes = Buffer.byteLength(JSON.stringify(payload));
    const afterBytes = Buffer.byteLength(JSON.stringify(mutated));
    return {
        applies: problems.length > 0,
        key,
        problems,
        beforeBytes,
        afterBytes,
        deltaBytes: afterBytes - beforeBytes,
        strictExit: verdictOf({ uncovered: 0, nestedGaps: 0, payloadContract: problems.length, allowList: 0 }, true),
        detail: problems.length === 0
            ? 'dropping ' + key + ' produced NO finding — the contract check is blind'
            : 'dropping ' + key + ' from the payload produced ' + problems.length + ' finding(s)',
    };
}

/** Negative control 3 (audit V17-F2 M4clip): strip one NESTED leaf in memory and prove the
 *  nested gate turns --strict red instead of leaving it green as it did before t110. */
function nestedGapControl(definitions) {
    for (const definition of definitions) {
        const fixture = buildFixture(definition);
        const measured = measure(definition);
        const row = measured.rows.find((entry) => entry.verdict === 'rendered'
            && typeof fixture[entry.field] === 'object' && fixture[entry.field] !== null);
        if (row === undefined) continue;
        const records = leafRecords(fixture[row.field], row.field, [row.field], []);
        for (const leaf of records) {
            const original = definition.output.render;
            // Simulate "the tool stopped reflecting this leaf": pin it to a constant inside the
            // payload the render sees, so NO payload value of that leaf can reach the text. Cutting
            // the token out of the rendered text would not do: the t117 matcher decides by
            // ablating the payload, not by searching the text.
            definition.output.render = (args, value) => original(args, setAtPath(value, leaf.segments, leaf.kind === 'number' ? -1 : ''));
            try {
                const after = measure(definition);
                const gaps = after.rows.filter((entry) => entry.verdict === 'partial').flatMap((entry) => entry.unprinted);
                if (!gaps.includes(leaf.path)) continue;
                return {
                    applies: true,
                    tool: definition.name,
                    field: row.field,
                    path: leaf.path,
                    pinned: leaf.kind === 'number' ? -1 : '""',
                    nestedGapsAfter: gaps.length,
                    strictExit: verdictOf({ uncovered: 0, nestedGaps: gaps.length, payloadContract: 0, allowList: 0 }, true),
                    detail: 'pinning ' + definition.name + '.' + leaf.path + ' (the render no longer reflects it) raised nested_gaps to ' + gaps.length + ', so --strict exits 1',
                };
            } finally {
                definition.output.render = original;
            }
        }
    }
    return { applies: false, detail: 'no definition carried a printed top-level field with a pinnable nested leaf' };
}

/** Every printable leaf of a whole payload, path-addressed (scalar top-level fields are
 *  judged by their own value, so only objects/arrays are walked here). */
function allLeafRecords(base) {
    const records = [];
    for (const [field, value] of Object.entries(base)) {
        if (value === null || typeof value !== 'object') continue;
        leafRecords(value, field, [field], records);
    }
    return records;
}

/** Delete one leaf addressed by SEGMENTS; true when it existed. */
function deleteAtPath(node, segments) {
    const [head, ...rest] = segments;
    if (node === undefined || node === null) return false;
    if (rest.length === 0) {
        if (!(head in node)) return false;
        delete node[head];
        return true;
    }
    return deleteAtPath(node[head], rest);
}

/**
 * Negative control 4 (audit V18-F2): copy lib/ into tests/tmp/t117 and remove ONE print from
 * the COPY (packages/dsh-agent-teams/lib itself is never written), then score that same mutated
 * render with both witnesses. For every mutant: (B) the pre-t117 VALUE witness must stay GREEN,
 * which is the blind spot reproduced, and (A) the KEY-PATH witness must go RED naming the exact
 * key paths. The unmutated copy must be GREEN, so a red mutant proves the mutation, not the copy.
 */
const SOURCE_MUTANTS = [
    {
        label: 'the joined_at print in removedLine',
        find: "const joined = Number.isFinite(member.joined_at) ? ' · joined ' + new Date(member.joined_at).toISOString() : '';",
        replace: "const joined = ''; // t117 negative control: the joined_at print is gone",
        hits: 1,
        expect: ['removed_members[0].joined_at'],
    },
    {
        label: 'the findings_open print on the task line',
        find: '(task.findings_open ?? 0) > 0',
        replace: 'false && (task.findings_open ?? 0) > 0',
        hits: 1,
        expect: ['tasks[0].findings_open'],
    },
    {
        label: 'the inbox timestamp prints (captain + member)',
        find: 'Number.isFinite(message.ts)',
        replace: 'false && Number.isFinite(message.ts)',
        hits: 2,
        expect: ['captain_inbox[0].ts', 'member_inbox[0].ts'],
    },
];

/** Load one throwaway copy of lib/ (optionally mutated) and score it with BOTH witnesses. */
async function loadCopy(index, mutate) {
    const dir = join(REPO_ROOT, 'tests', 'tmp', 't117', 'src-' + index);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, 'pkg'), { recursive: true });
    cpSync(PKG_LIB, join(dir, 'pkg', 'lib'), { recursive: true });
    symlinkSync(join(PKG_DIR, 'node_modules'), join(dir, 'pkg', 'node_modules'), 'junction');
    const copyTools = join(dir, 'pkg', 'lib', 'tools.js');
    const source = readFileSync(copyTools, 'utf8');
    let text = source;
    let applies = 0;
    if (mutate !== undefined) {
        const hits = source.split(mutate.find).length - 1;
        if (hits !== mutate.hits) return { ok: false, detail: 'mutant "' + mutate.label + '" matched ' + hits + ' time(s), expected ' + mutate.hits };
        text = source.split(mutate.find).join(mutate.replace);
        applies = hits;
    }
    if (text !== source) writeFileSync(copyTools, text);
    const registered = [];
    const module = await import(pathToFileURL(copyTools).href + '?t117=' + index + '-' + Date.now());
    module.registerAgentTeamsTools(stubContext(registered), CONFIG);
    const definition = registered.find((item) => item.name === STATUS_TOOL);
    if (definition === undefined) return { ok: false, detail: 'copy ' + index + ' did not register ' + STATUS_TOOL };
    const base = JSON.parse(JSON.stringify(STATUS_FIXTURE));
    const union = witnessPayloads(base).map((witness) => safeText(definition, witness.payload)).filter((part) => part !== null).join('\n');
    const legacyGaps = legacyUnprintedPaths(allLeafRecords(base), union);
    const gaps = measure(definition, base).rows.filter((row) => row.verdict === 'partial').flatMap((row) => row.unprinted);
    return {
        ok: true,
        copyTools,
        applies,
        beforeBytes: Buffer.byteLength(source),
        afterBytes: Buffer.byteLength(text),
        legacyGaps: legacyGaps.length,
        legacyExit: verdictOf({ uncovered: 0, nestedGaps: legacyGaps.length, payloadContract: 0, allowList: 0 }, true),
        gaps,
        pathExit: verdictOf({ uncovered: 0, nestedGaps: gaps.length, payloadContract: 0, allowList: 0 }, true),
    };
}

/**
 * V19-F4: a fail-closed message that only counts the gaps leaves the reader guessing which field
 * went missing, so the key paths are named. Kept as a function of its own so the gate can
 * exercise the message with a fixture instead of waiting for a real red baseline.
 */
function unmutatedCopyRedMessage(gaps) {
    const listed = gaps.length === 0
        ? '(no key path recorded, which is itself the defect)'
        : gaps.map((path) => STATUS_TOOL + '.' + path).join(', ');
    return 'the UNMUTATED copy is already red (nested_gaps=' + gaps.length + '): ' + listed + ' — so a red mutant would prove nothing';
}

async function sourceCopyControl() {
    const baseline = await loadCopy(0);
    if (baseline.ok !== true) return { ok: false, detail: baseline.detail };
    if (baseline.pathExit !== 0 || baseline.gaps.length !== 0) {
        return { ok: false, detail: unmutatedCopyRedMessage(baseline.gaps) };
    }
    const results = [];
    for (const [position, mutant] of SOURCE_MUTANTS.entries()) {
        const measured = await loadCopy(position + 1, mutant);
        if (measured.ok !== true) return { ok: false, detail: measured.detail };
        const missing = mutant.expect.filter((path) => !measured.gaps.includes(path));
        results.push({ ...mutant, ...measured, missing });
    }
    return { ok: true, baseline, results };
}

/**
 * t125 / V19-F3 — one throwaway copy of lib/ whose ONLY difference is the line under test, kept
 * under tests/tmp/t125 (closure vong 19 section 8: a run that mutated the real package made an
 * unrelated run go red). Nothing here ever writes packages/.
 */
const ROSTER_MUTANT = {
    label: 'agent_teams_status.removed_count reads the LIVE roster (team.members) instead of the removed one',
    find: 'removed_count: removedMembers.length,',
    replace: 'removed_count: team.members.length,',
    hits: 1,
};

async function loadStatusCopy(index, mutate) {
    const dir = join(T125_ROOT, 'src-' + index);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, 'pkg'), { recursive: true });
    cpSync(PKG_LIB, join(dir, 'pkg', 'lib'), { recursive: true });
    symlinkSync(join(PKG_DIR, 'node_modules'), join(dir, 'pkg', 'node_modules'), 'junction');
    const copyTools = join(dir, 'pkg', 'lib', 'tools.js');
    const source = readFileSync(copyTools, 'utf8');
    let text = source;
    let applies = 0;
    if (mutate !== undefined) {
        const hits = source.split(mutate.find).length - 1;
        if (hits !== mutate.hits) return { ok: false, detail: 'mutant "' + mutate.label + '" matched ' + hits + ' time(s), expected ' + mutate.hits };
        text = source.split(mutate.find).join(mutate.replace);
        applies = hits;
    }
    if (text !== source) writeFileSync(copyTools, text);
    const module = await import(pathToFileURL(copyTools).href + '?t125=' + index + '-' + Date.now());
    const real = await realStatusPayload(module);
    if (real.error !== '') return { ok: false, detail: 'the copy could not run ' + STATUS_TOOL + ': ' + real.error };
    const payload = real.payload ?? {};
    const problems = rosterInvariantProblems(payload, real.text ?? '');
    const roster = Array.isArray(payload.removed_members) ? payload.removed_members.length : undefined;
    return {
        ok: true,
        applies,
        beforeBytes: Buffer.byteLength(source),
        afterBytes: Buffer.byteLength(text),
        payload,
        problems,
        removedCount: payload.removed_count,
        rosterSize: roster,
        strictExit: verdictOf({ uncovered: 0, nestedGaps: 0, payloadContract: 0, allowList: 0, roster: problems.length }, true),
    };
}

/** NEGATIVE CONTROL 6: the copy whose removed_count reads the live roster MUST turn --strict red. */
async function rosterCopyControl() {
    mkdirSync(T125_ROOT, { recursive: true });
    const baseline = await loadStatusCopy('roster-baseline', undefined);
    if (baseline.ok !== true) return { ok: false, detail: baseline.detail };
    const mutant = await loadStatusCopy('roster-mutant', ROSTER_MUTANT);
    if (mutant.ok !== true) return { ok: false, detail: mutant.detail };
    return {
        ok: true,
        baseline,
        mutant,
        deltaBytes: mutant.afterBytes - baseline.beforeBytes,
        named: mutant.problems.filter((problem) => problem.startsWith(ROSTER_FIELD)),
    };
}

/**
 * Negative control 5 (t117 "no false alarm"): an OPTIONAL key a payload simply does not
 * carry must not be reported. Every reasoning_effort row is dropped from a copy of the
 * fixture and the nested gate must stay silent — this is what catches an implementation
 * that gates on a hard-coded list of required key paths instead of the leaves the payload
 * really has (the t110 commitment).
 */
function optionalKeyControl(definition) {
    const baseline = measure(definition, JSON.parse(JSON.stringify(STATUS_FIXTURE)));
    const baselineGaps = baseline.rows.filter((row) => row.verdict === 'partial').flatMap((row) => row.unprinted);
    const base = JSON.parse(JSON.stringify(STATUS_FIXTURE));
    const removed = [];
    for (const segments of [
        ['members', 0, 'reasoning_effort'],
        ['removed_members', 0, 'reasoning_effort'],
        ['removed_members', 0, 'route_override', 'reasoning_effort'],
    ]) {
        if (deleteAtPath(base, segments) === true) removed.push(segments.join('.'));
    }
    if (removed.length === 0) return { applies: false, detail: 'the fixture carried no optional key to drop', removed: [], alarms: [] };
    const measured = measure(definition, base);
    const gaps = measured.rows.filter((row) => row.verdict === 'partial').flatMap((row) => row.unprinted);
    return {
        applies: true,
        removed,
        gaps: gaps.length,
        baselineGaps: baselineGaps.length,
        // "no false alarm" = dropping an optional key must not ADD a gap. Pre-existing gaps are
        // real render defects of the tool under test and stay listed either way.
        alarms: gaps.filter((path) => !baselineGaps.includes(path)),
        strictExit: verdictOf({ uncovered: 0, nestedGaps: gaps.length, payloadContract: 0, allowList: 0 }, true),
    };
}

async function main() {
    if (UNKNOWN_ARGS.length > 0) {
        console.log('GATE ERROR: unknown argument(s) ' + JSON.stringify(UNKNOWN_ARGS) + ' — this gate accepts --report (default) or --strict');
        return 2;
    }
    if (CONFLICT) {
        console.log('GATE ERROR: --report and --strict ask for opposite verdicts; pass one');
        return 2;
    }
    const source = readFileSync(TOOLS_JS, 'utf8').split(/\r?\n/);
    const staleMap = Object.entries(RENDER_LINES).filter(([, line]) => !/render:/.test(source[line - 1] ?? ''));
    if (staleMap.length > 0) {
        console.log('GATE ERROR: stale RENDER_LINES map — ' + staleMap.map(([name, line]) => name + '@' + line).join(', '));
        return 2;
    }
    const allowLineProblems = allowListLineProblems(RENDER_LINES);
    if (allowLineProblems.length > 0) {
        console.log('GATE ERROR: ALLOW_LIST citation does not point at the render it excuses — ' + allowLineProblems.join(' | '));
        return 2;
    }

    const toolsModule = await import(TOOLS_URL);
    const registered = [];
    toolsModule.registerAgentTeamsTools(stubContext(registered), CONFIG);
    const definitions = registered.filter((definition) => typeof definition.name === 'string' && definition.name !== '');
    const renderable = definitions.filter((definition) => definition.output !== undefined && typeof definition.output.render === 'function');

    console.log('t98 render-coverage gate — real definitions captured from lib/tools.js:505');
    console.log('mode: ' + (STRICT
        ? '--strict — EXIT 1 while a top-level field never reaches the text, EXIT 0 when uncovered=0'
        : '--report — findings are printed, EXIT stays 0; rerun with --strict to gate'));
    console.log('config: ' + JSON.stringify(CONFIG));
    console.log('captured: definitions=' + definitions.length + ' withRender=' + renderable.length + ' expected=16');

    const wholeTool = ALLOW_LIST.filter((entry) => entry.field === '*' || entry.field === undefined);
    if (wholeTool.length > 0) {
        console.log('GATE ERROR: ALLOW_LIST must not allow a whole tool: ' + JSON.stringify(wholeTool.map((entry) => entry.tool)));
        return 2;
    }
    if (definitions.length !== 16 || renderable.length !== 16) {
        console.log('GATE ERROR: expected exactly 16 tools with output.render, captured ' + renderable.length);
        return 2;
    }

    const results = [];
    for (const definition of renderable) {
        const measured = measure(definition);
        if (measured.error !== '') {
            console.log('GATE ERROR: ' + definition.name + ' render threw on its own schema: ' + measured.error);
            return 2;
        }
        results.push({ definition, rows: measured.rows });
    }

    console.log('');
    console.log('| # | tool | schema fields | rendered | branch | allowed | partial | MISSING |');
    console.log('|---|------|--------------:|---------:|-------:|--------:|--------:|--------:|');
    results.forEach((result, index) => {
        const count = (verdict) => result.rows.filter((row) => row.verdict === verdict).length;
        console.log('| ' + (index + 1) + ' | ' + result.definition.name + ' | ' + result.rows.length + ' | ' + count('rendered') + ' | ' + count('branch') + ' | ' + count('allowed') + ' | ' + count('partial') + ' | ' + count('missing') + ' |');
    });

    const gateFailures = [];
    const nestedGaps = [];
    for (const result of results) {
        for (const row of result.rows) {
            if (row.verdict === 'missing') gateFailures.push({ tool: result.definition.name, row });
            if (row.verdict === 'partial') nestedGaps.push({ tool: result.definition.name, row });
        }
    }

    console.log('');
    console.log('FINDINGS — a top-level field that never reaches the text render:');
    if (gateFailures.length === 0) console.log('  (none)');
    for (const entry of gateFailures) {
        console.log('  MISSING ' + entry.tool + '.' + entry.row.field + ' — lib/tools.js:' + RENDER_LINES[entry.tool] + ' — severity ' + severityOf(entry.tool, entry.row.field) + ' — ' + (entry.row.note ?? ''));
    }

    console.log('');
    console.log('FINDINGS — nested values of a printed top-level field that never reach the text (GATES --strict since t110 / V17-F2):');
    if (nestedGaps.length === 0) console.log('  (none)');
    for (const entry of nestedGaps) {
        for (const path of entry.row.unprinted) {
            console.log('  NESTED ' + entry.tool + '.' + path + ' — lib/tools.js:' + RENDER_LINES[entry.tool] + ' — severity ' + severityOf(entry.tool, path) + ' — the parent field is printed, this value is not');
        }
    }

    console.log('');
    console.log('ALLOW_LIST (' + ALLOW_LIST.length + ' entries, each auditable by a human):');
    for (const entry of ALLOW_LIST) {
        console.log('  ' + entry.tool + '.' + entry.field + ' — ' + entry.file + ' — ' + entry.reason);
        if (entry.guardedBy !== undefined) console.log('    GUARDED BY (t125 / V19-F3): ' + entry.guardedBy);
    }
    console.log('');
    console.log('ALLOW_LIST LINE AUDIT (t110 / V17-F3 — the citation must contain the render line):');
    for (const entry of ALLOW_LIST) {
        const lies = allowListLineProblems(RENDER_LINES, [entry]);
        console.log('  ' + entry.tool + '.' + entry.field + ' — ' + entry.file + ' contains render ' + RENDER_LINES[entry.tool] + ' — ' + (lies.length === 0 ? 'ok' : 'LIES'));
    }

    const control = negativeControl(definitions);
    console.log('');
    console.log('NEGATIVE CONTROL (in memory only; the render under measurement is never patched):');
    console.log('  applies=' + control.applies + ' — ' + control.detail);
    console.log('  delta bytes: ' + control.deltaBytes + ' (' + control.beforeBytes + ' → ' + control.afterBytes + ')');
    console.log('  mutated text: ' + JSON.stringify(control.after));
    if (control.applies !== true) {
        console.log('GATE ERROR: the gate cannot detect a dropped field, so a green run would prove nothing');
        return 2;
    }

    const orphanedAllow = ALLOW_LIST.filter((entry) => !renderable.some((definition) => definition.name === entry.tool));
    if (orphanedAllow.length > 0) {
        console.log('GATE ERROR: ALLOW_LIST names a tool that is no longer registered: ' + JSON.stringify(orphanedAllow.map((entry) => entry.tool)));
        return 2;
    }

    const statusDefinition = renderable.find((definition) => definition.name === STATUS_TOOL);
    const declaredStatusKeys = statusDefinition === undefined ? [] : declaredKeysOf(statusDefinition);
    const fixtureDrift = statusDefinition === undefined
        ? ['agent_teams_status is not renderable']
        : payloadKeyProblems(declaredStatusKeys, STATUS_FIXTURE, 'STATUS_FIXTURE');
    const real = await realStatusPayload(toolsModule);
    console.log('');
    console.log('PAYLOAD CONTRACT (t110 / V17-F2 — output.schema versus the payload the tool really returned):');
    console.log('  seed: tests/tmp/t110 — a maximal member pair written to a temp team.json, then agent_teams_status executed for real');
    if (real.error !== '') {
        console.log('GATE ERROR: could not execute ' + STATUS_TOOL + ' against the seed: ' + real.error);
        return 2;
    }
    const payloadProblems = payloadKeyProblems(declaredStatusKeys, real.payload, STATUS_TOOL);
    console.log('  ' + STATUS_TOOL + ': declared=' + declaredStatusKeys.length + ' payload=' + Object.keys(real.payload).length + ' findings=' + payloadProblems.length);
    console.log('  status fixture drift: findings=' + fixtureDrift.length + ' (' + Object.keys(STATUS_FIXTURE).length + ' fixture keys)');
    for (const problem of fixtureDrift) console.log('  PAYLOAD ' + problem);
    for (const problem of payloadProblems) console.log('  PAYLOAD ' + problem);

    // t125 / V19-F3 — the derivation the seventh allow-list entry depends on, asserted instead of trusted.
    const rosterProblems = rosterInvariantProblems(real.payload, real.text ?? '');
    const realRoster = real.payload ?? {};
    console.log('');
    console.log('ROSTER INVARIANT (t125 / V19-F3 — this is what guards the agent_teams_status.removed_count allow-list entry):');
    console.log('  ' + ROSTER_INVARIANT + ' — findings=' + rosterProblems.length + ' (removed_count=' + JSON.stringify(realRoster.removed_count) + ', removed_members=' + (Array.isArray(realRoster.removed_members) ? realRoster.removed_members.length : 'not an array') + ')');
    for (const problem of rosterProblems) console.log('  ROSTER ' + problem);

    const dropped = payloadControl(declaredStatusKeys, real.payload);
    console.log('');
    console.log('NEGATIVE CONTROL 2 (payload contract, in memory only):');
    console.log('  applies=' + dropped.applies + ' — ' + dropped.detail);
    console.log('  delta bytes: ' + dropped.deltaBytes + ' (' + dropped.beforeBytes + ' -> ' + dropped.afterBytes + ')');
    for (const problem of dropped.problems ?? []) console.log('  PAYLOAD ' + problem);
    console.log('  --strict would exit ' + dropped.strictExit + ' with control_payload_findings=' + (dropped.problems ?? []).length);
    if (dropped.applies !== true) {
        console.log('GATE ERROR: the payload contract check cannot see a dropped key, so a green run would prove nothing');
        return 2;
    }

    const nested = nestedGapControl(definitions);
    console.log('');
    console.log('NEGATIVE CONTROL 3 (nested gate, audit V17-F2 M4clip, in memory only):');
    console.log('  applies=' + nested.applies + ' — ' + nested.detail);
    if (nested.applies === true) {
        console.log('  stripped ' + nested.tool + '.' + nested.path + ' (token ' + JSON.stringify(nested.token) + ') -> nested_gaps=' + nested.nestedGapsAfter + ', --strict exit=' + nested.strictExit);
    }
    if (nested.applies !== true) {
        console.log('GATE ERROR: the nested gate cannot see a stripped nested leaf, so a green run would prove nothing');
        return 2;
    }

    const sourceCopy = await sourceCopyControl();
    console.log('');
    console.log('NEGATIVE CONTROL 4 (real source copy under tests/tmp/t117 — audit V18-F2; packages/dsh-agent-teams/lib is NEVER written):');
    if (sourceCopy.ok !== true) {
        console.log('GATE ERROR: ' + sourceCopy.detail);
        return 2;
    }
    console.log('  (0) UNMUTATED copy: nested_gaps=' + sourceCopy.baseline.gaps.length + ' -> --strict exit=' + sourceCopy.baseline.pathExit + '  [the copy itself is green, so a red mutant proves the mutation]');
    const failClosedSample = ['members[0].joined_at', 'tasks[0].findings_open'];
    const failClosedMessage = unmutatedCopyRedMessage(failClosedSample);
    const failClosedNames = failClosedSample.every((path) => failClosedMessage.includes(STATUS_TOOL + '.' + path));
    console.log('  (F4) fail-closed message exercised with a ' + failClosedSample.length + '-path fixture — names every key path: ' + failClosedNames);
    console.log('       ' + JSON.stringify(failClosedMessage));
    if (failClosedNames !== true) {
        console.log('GATE ERROR: the fail-closed message does not name the missing key paths');
        return 2;
    }
    let controlAOk = sourceCopy.baseline.pathExit === 0;
    for (const result of sourceCopy.results) {
        const blind = result.legacyExit === 0;
        const red = result.pathExit === 1;
        if (!blind || !red || result.missing.length > 0) controlAOk = false;
        console.log('  mutant (' + result.applies + ' removal(s)): ' + result.label + ' — ' + result.beforeBytes + ' -> ' + result.afterBytes + ' bytes');
        console.log('    (B) legacy VALUE-token witness (pre-t117): nested_gaps=' + result.legacyGaps + ' -> --strict exit=' + result.legacyExit + (blind ? '  [V18-F2 reproduced: the old witness is blind]' : '  [V18-F2 NOT reproduced]'));
        console.log('    (A) KEY-PATH witness (t117):               nested_gaps=' + result.gaps.length + ' -> --strict exit=' + result.pathExit);
        for (const path of result.gaps) console.log('      MISSING ' + STATUS_TOOL + '.' + path);
        if (result.missing.length > 0) console.log('    UNNAMED at the expected path(s): ' + result.missing.join(', '));
    }
    if (controlAOk !== true) {
        console.log('GATE ERROR: a mutated copy was not reported at its expected key path (or the pre-t117 witness was not blind), so a green run would prove nothing');
        return 2;
    }

    const optional = optionalKeyControl(statusDefinition);
    console.log('');
    console.log('NEGATIVE CONTROL 5 (no false alarm, t117): an OPTIONAL key the payload does not carry is not a gap');
    console.log('  applies=' + optional.applies + ' — dropped ' + JSON.stringify(optional.removed ?? []) + ' from the fixture copy');
    if (optional.applies === true) {
        console.log('  nested_gaps=' + optional.gaps + ' -> --strict exit=' + optional.strictExit + (optional.alarms.length === 0 ? '  [no alarm raised]' : '  [ALARM: ' + optional.alarms.join(', ') + ']'));
    }
    if (optional.applies !== true || optional.alarms.length > 0) {
        console.log('GATE ERROR: the nested gate cries wolf on a key the payload does not carry');
        return 2;
    }

    const rosterCopy = await rosterCopyControl();
    console.log('');
    console.log('NEGATIVE CONTROL 6 (roster invariant, t125 / V19-F3 — a COPY under tests/tmp/t125, the package is never written):');
    if (rosterCopy.ok !== true) {
        console.log('GATE ERROR: ' + rosterCopy.detail);
        return 2;
    }
    console.log('  (0) UNMUTATED copy: removed_count=' + JSON.stringify(rosterCopy.baseline.removedCount) + ' removed_members=' + rosterCopy.baseline.rosterSize + ' -> roster findings=' + rosterCopy.baseline.problems.length + ' -> --strict exit=' + rosterCopy.baseline.strictExit);
    console.log('  mutant (applies=' + rosterCopy.mutant.applies + ', ' + rosterCopy.baseline.beforeBytes + ' -> ' + rosterCopy.mutant.afterBytes + ' bytes, delta ' + rosterCopy.deltaBytes + ' B): removed_count=' + JSON.stringify(rosterCopy.mutant.removedCount) + ' removed_members=' + rosterCopy.mutant.rosterSize + ' -> roster findings=' + rosterCopy.mutant.problems.length + ' -> --strict exit=' + rosterCopy.mutant.strictExit);
    for (const problem of rosterCopy.mutant.problems) console.log('  ROSTER ' + problem);
    const rosterControlOk = rosterCopy.mutant.applies === 1
        && rosterCopy.deltaBytes === ROSTER_DELTA
        && rosterCopy.baseline.strictExit === 0
        && rosterCopy.mutant.strictExit === 1
        && rosterCopy.named.length > 0;
    console.log('  control applies=' + rosterControlOk + ' — the mutation must move --strict from 0 to 1 AND name ' + ROSTER_FIELD);
    if (rosterControlOk !== true) {
        console.log('GATE ERROR: the roster invariant cannot see a removed_count taken from the live roster, so the allow-list entry is unguarded');
        return 2;
    }

    const fieldTotal = results.reduce((sum, result) => sum + result.rows.length, 0);
    const renderedTotal = results.reduce((sum, result) => sum + result.rows.filter((row) => row.verdict === 'rendered' || row.verdict === 'branch').length, 0);
    console.log('');
    // V18-F3: payload_findings is ONE number with ONE meaning at every print (the payload-contract
    // findings); the fixture drift is a different thing and gets its own label.
    const payloadContractFailures = payloadProblems.length + fixtureDrift.length;
    const sourceCopyApplies = controlAOk === true && sourceCopy.ok === true && sourceCopy.baseline.pathExit === 0
        && sourceCopy.results.every((result) => result.legacyExit === 0 && result.pathExit === 1 && result.missing.length === 0);
    console.log('SUMMARY tools=16 fields=' + fieldTotal + ' reached=' + renderedTotal + ' uncovered=' + gateFailures.length + ' nested_gaps=' + nestedGaps.length + ' payload_findings=' + payloadProblems.length + ' fixture_drift=' + fixtureDrift.length + ' payload_contract_failures=' + payloadContractFailures + ' allow_listed=' + ALLOW_LIST.length + ' allow_list_line_problems=' + allowLineProblems.length + ' negative_control_applies=' + control.applies + ' payload_control_applies=' + dropped.applies + ' nested_control_applies=' + nested.applies + ' source_copy_control_applies=' + sourceCopyApplies + ' optional_key_control_applies=' + optional.applies + ' roster_invariant_problems=' + rosterProblems.length + ' roster_control_applies=' + rosterControlOk + ' roster_mutant_exit=' + rosterCopy.mutant.strictExit);
    const totals = { uncovered: gateFailures.length, nestedGaps: nestedGaps.length, payloadContract: payloadContractFailures, allowList: allowLineProblems.length, roster: rosterProblems.length };
    const total = totals.uncovered + totals.nestedGaps + totals.payloadContract + totals.allowList + totals.roster;
    if (total === 0) {
        console.log('verdict GREEN — every top-level field reaches its text render, no nested value is lost, output.schema agrees with the real payload, and removed_count matches removed_members');
        return 0;
    }
    console.log('verdict RED — uncovered=' + totals.uncovered + ' nested_gaps=' + totals.nestedGaps + ' payload_findings=' + payloadProblems.length + ' fixture_drift=' + fixtureDrift.length + ' payload_contract_failures=' + totals.payloadContract + ' allow_list_line_problems=' + totals.allowList + ' roster_invariant_problems=' + totals.roster + '; this is the FINDING the gate was built to surface (see the FINDINGS blocks above)');
    const exit = verdictOf(totals, STRICT);
    // t99: the report is a deliverable on its own, so only --strict fails the build.
    if (STRICT) {
        console.log('--strict: exiting ' + exit + ' because uncovered=' + totals.uncovered + ' nested_gaps=' + totals.nestedGaps + ' payload_findings=' + payloadProblems.length + ' fixture_drift=' + fixtureDrift.length + ' payload_contract_failures=' + totals.payloadContract + ' allow_list_line_problems=' + totals.allowList + ' roster_invariant_problems=' + totals.roster);
        return exit;
    }
    console.log('report mode: exiting ' + exit + ' (findings recorded above; --strict is what turns this into a failure)');
    return exit;
}

process.exitCode = await main();

