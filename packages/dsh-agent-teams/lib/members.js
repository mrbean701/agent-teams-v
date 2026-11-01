/**
 * Member subagent lifecycle: spawn a continuable child per member, deliver
 * task turns and step-boundary messages, and observe its activity.
 *
 * Members are durable continuable subagents of the captain, so a member keeps
 * its conversation across turns and across harness restarts: the captain
 * queues its next turn through {@link deliverToMember}, it works through its turn
 * (updating team state through the `agent_teams_*` tools), and becomes idle
 * again. Its final assistant message is not readable programmatically, so the
 * member persists its report into the captain's mailbox and the task records,
 * which the captain reads through `agent_teams_status`.
 * @module dsh-agent-teams/members
 */
import { installModelSelection } from '@deepseek-ai/dsh-agent';
// Declaration merge only: makes ctx.subagents visible.
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent';
import { createUserMessage, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { access, appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { agentTeamsSource, observedSessionFormatVersion, guardSubagentCreation, startMember, usesManagedActivations, guardSubagentDelivery, installContinuableMemberSetup, memberToolFilter, queueMemberPrompt, restrictableToolNames, startMemberWithLenientFilter, steerMemberPrompt, sessionOwnEvents } from "./harness-compat.js";
import { markMailboxDelivered, appendMailbox, CAPTAIN_KEY, createMessage, readRetiredMemberIds, readTeamSync, readTeam, releaseMailboxDelivery, withTeamLock, writeTeam } from "./state.js";
import { mailboxPrompt } from "./mailbox.js";
import { nearestLiveLead } from "./lineage.js";
import { appendTeamEvent, captainSessionOf } from "./events.js";
import { TERMINAL_TASK_STATUSES } from "./types.js";
import { memberSpawnRelaxableDeny, optionalToolPolicy } from "./tool-policies.js";
/** Persona snapshot of a profile protocol; the full text lives on team.json. */
export const PERSONA_PROTOCOL_MAX_CHARS = 400;
/**
 * Restore the SessionId brand on a value that round-tripped through the
 * durable team file. The brand is erased by JSON serialization; the value
 * originated from `startContinuable`/`agent.id`, so this cast is the boundary
 * restoration, not a new assertion.
 */
function brandedSessionId(value) {
    return value;
}
/**
 * Compose one member route from request, plugin configuration and the captain
 * session, without performing any I/O. This is the single place where the
 * precedence between the captain's route and a configured member default is
 * decided, so a configured model can never be silently paired with whichever
 * provider the captain happens to sit on (issue #189).
 *
 * Precedence: explicit request > plugin configuration > captain session. Model
 * ids are used verbatim: a `/` inside a model id is part of that id and is
 * never treated as a provider separator.
 *
 * `derivedProvider` is true only for a bare configured `memberModel` with no
 * provider anywhere, which is the one shape whose owner must come from the
 * provider catalogs.
 * @param request - the captain-supplied and plugin-configured route halves.
 * @param captain - the captain's current session route.
 * @returns the composed route, or `undefined` when a half cannot be determined.
 */
export function composeMemberRoute(request, captain) {
    const explicitProvider = request.provider?.trim();
    const explicitModel = request.model?.trim();
    const configuredModel = request.defaultModel?.trim();
    const configuredProvider = request.defaultProvider?.trim();
    if (explicitProvider !== undefined && explicitModel === undefined)
        return undefined;
    if (explicitProvider === '' || explicitModel === '' || configuredModel === '' || configuredProvider === '')
        return undefined;
    const providerValue = explicitProvider ?? configuredProvider ?? captain.provider;
    const providerSource = explicitProvider !== undefined ? 'request' : configuredProvider !== undefined ? 'config' : 'captain';
    const modelValue = explicitModel ?? configuredModel ?? captain.model;
    const modelSource = explicitModel !== undefined ? 'request' : configuredModel !== undefined ? 'config' : 'captain';
    return {
        provider: { value: providerValue, source: providerSource },
        model: { value: modelValue, source: modelSource },
        // A named provider is authoritative, and a named model keeps the route the
        // caller asked for. Only a model-only plugin default is allowed to have its
        // owner discovered from the catalogs.
        derivedProvider: providerSource === 'captain' && modelSource === 'config',
    };
}
/**
 * Validate a resolved roster against every provider catalog before any child
 * session is created. Catalogs are advisory when empty (some adapters accept
 * dynamic model ids), but a non-empty catalog is authoritative enough to
 * catch a typo that would otherwise boot a child and fail on its first turn.
 */
export async function validateMemberLlmSelections(ctx, selections, signal) {
    const catalogs = new Map();
    for (const selection of selections) {
        if (signal?.aborted === true)
            throw signal.reason ?? new Error('member model validation was cancelled');
        let catalog = catalogs.get(selection.provider);
        if (catalog === undefined) {
            catalog = await ctx.llm.listModels(selection.provider);
            catalogs.set(selection.provider, catalog);
        }
        if (catalog.length === 0 || catalog.some((model) => model.id === selection.model))
            continue;
        const available = catalog.slice(0, 8).map((model) => model.id).join(', ');
        throw new Error(`unknown member model "${selection.model}" for provider "${selection.provider}"`
            + `${available === '' ? '' : ` (available: ${available}${catalog.length > 8 ? ', …' : ''})`}`);
    }
}
const MEMBER_LABEL_PREFIX = 'agent-teams:';
const FALLBACK_FAILURE_CODES = new Set(['QUOTA', 'RATE_LIMIT', 'AUTH', 'MISSING_CREDENTIAL', 'NO_ADAPTER']);
/**
 * Message markers that turn an otherwise generic INVALID_REQUEST into a dead
 * route: the provider answered, but refuses to serve this model any more. The
 * code alone cannot carry that meaning — a malformed payload also fails as
 * INVALID_REQUEST, and degrading on that would move a healthy member off its
 * route for a bug in our own request.
 */
const FALLBACK_MESSAGE_MARKERS = [
    /Model is unavailable/i,
    /model_not_found/i,
    /does not exist/i,
    /no such model/i,
];
/**
 * Whether a request failure means "this route is dead, try the fallback".
 * @param code - the failure code the provider reported.
 * @param message - the failure message, consulted only for INVALID_REQUEST.
 */
export function isFallbackFailureCode(code, message) {
    if (FALLBACK_FAILURE_CODES.has(code))
        return true;
    if (code !== 'INVALID_REQUEST' || typeof message !== 'string')
        return false;
    return FALLBACK_MESSAGE_MARKERS.some(marker => marker.test(message));
}
/** Pure state transition used by the request-error handler and TDD tests. */
export function selectFallbackRoute(current, fallback, failureCode, alreadySwitched, failureMessage) {
    if (alreadySwitched || fallback === undefined || !isFallbackFailureCode(failureCode, failureMessage)) {
        return { retry: false, switched: alreadySwitched, selection: current };
    }
    return { retry: true, switched: true, selection: fallback };
}
/**
 * Failure markers that mean the provider itself died — an exhausted quota
 * (`GoUsageLimitError`, `Insufficient Balance (QUOTA)`), a throttled account
 * (429/RATE_LIMIT), or a route the provider no longer serves (`404
 * PI_AI_ERROR`). A member that dies this way says nothing on its own, so these
 * markers gate the durable trace that lets the captain see it.
 */
const PROVIDER_FAILURE_MARKERS = [
    /QUOTA/i,
    /RATE_LIMIT/i,
    /\b429\b/,
    /\b404\b/,
    /PI_AI_ERROR/i,
    /Insufficient\s+Balance/i,
    /GoUsageLimitError/i,
];
/** Cap on the durable `lastFailure.message`; the trace stays small in team.json. */
export const MEMBER_FAILURE_MESSAGE_MAX = 300;
/**
 * Whether a member turn failure came from the provider rather than from the
 * member's own turn logic. Pure: no I/O, no clock, so the TDD suite can pin it.
 */
export function isProviderFailure(failure) {
    if (failure === undefined || failure === null)
        return false;
    const code = typeof failure.code === 'string' ? failure.code : '';
    const message = typeof failure.message === 'string' ? failure.message : '';
    if (code.trim() === '' && message.trim() === '')
        return false;
    const haystack = `${code} ${message}`;
    return PROVIDER_FAILURE_MARKERS.some(marker => marker.test(haystack));
}
/**
 * Durable provider-failure trace for one member, or undefined when the failure
 * is not a provider failure (a TypeError belongs to the turn, not the account)
 * or there is no member record to hang it on. The route recorded is the route
 * that died: `routeOf` outranks the raw provider/model pair, so a fallback or a
 * captain-set override is named accurately instead of drifting.
 */
export function providerFailureRecord(member, failure, at) {
    if (member === undefined || member === null || !isProviderFailure(failure))
        return undefined;
    const route = routeOf(member);
    const raw = typeof failure.message === 'string' ? failure.message : String(failure.message ?? '');
    return {
        code: typeof failure.code === 'string' && failure.code.trim() !== '' ? failure.code : 'UNKNOWN',
        message: raw.length > MEMBER_FAILURE_MESSAGE_MAX
            ? `${raw.slice(0, MEMBER_FAILURE_MESSAGE_MAX - 1)}…`
            : raw,
        at,
        provider: route?.provider ?? (typeof member.provider === 'string' ? member.provider.trim() : ''),
        model: route?.model ?? (typeof member.model === 'string' ? member.model.trim() : ''),
    };
}
/** Deliver a durable member report to the live captain at its next model step. */
export function steerCaptainReport(captain, from, content, receipt) {
    try {
        captain.steer(createUserMessage({
            content: [{ type: 'text', text: receipt ?? `AgentTeams message from member ${from}:\n\n${content}` }],
            source: agentTeamsSource({ kind: 'agent-teams' }, observedSessionFormatVersion(captain)),
        }));
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Classify a final member turn failure against the durable record. Pure, so the
 * policy is testable without a lock or a Harness.
 *
 * A failure may only mutate the attempt the plugin actually observed. When that
 * attempt is gone — the member moved on to newer work, the task was
 * reassigned to a newer attempt, or the member generation was replaced — the
 * late error carries no authority and stays silent. When the failure belongs to
 * the current generation but its work already settled, the task and member are
 * left exactly as they are and only a durable captain note is added: otherwise
 * an operator cannot tell a clean run from one whose member's last turn died
 * (429, auth failure, crash) after the delivery landed (issue #205).
 * @param observed - the live member/task capability captured at the error event.
 * @param current - the current durable member record and open task, if any.
 * @returns the disposition for this failure.
 */
export function classifyMemberFailure(observed, current) {
    const member = current.member;
    // Only the exact member generation observed at the error event may report it.
    // A replaced generation (same name, new session id) or a member record that is
    // gone cannot be failed by that child's late error.
    if (member === undefined || member.id !== observed.memberId)
        return 'ignored';
    const task = current.task;
    if (task === undefined) {
        // No open attempt is owned by this generation any more, so nothing here may
        // be mutated — but the failure itself must still be recorded. `working` is
        // NOT evidence of newer work: `syncMemberStatus` writes it as soon as the
        // turn runs, while a task completed earlier in that same turn leaves no open
        // attempt behind (the reporter's run A). Only a *concrete* superseded open
        // attempt — the branch below — or a replaced generation may stay silent.
        return 'noted_settled';
    }
    if (task.id !== observed.task?.id || task.attemptId !== observed.task?.attemptId
        || task.attempt !== observed.task?.attempt)
        return 'ignored';
    return 'failed_attempt';
}
/**
 * The surviving durable record of the capability observed at the error event,
 * or `undefined` when there is nothing honest to say about it.
 *
 * A task is only described as *settled* when its durable status is terminal
 * (`completed`/`failed`/`cancelled`). A non-terminal record — for example a task
 * that was claimed and then unclaimed or reassigned while the error was queued —
 * must fall back to the plain "no open attempt" wording instead of implying a
 * delivery landed.
 */
export function settledTaskRecord(observed, tasks) {
    if (observed === undefined)
        return undefined;
    const record = tasks.find(candidate => candidate.id === observed.id);
    if (record === undefined)
        return undefined;
    return TERMINAL_TASK_STATUSES.includes(record.status) ? record : undefined;
}
/**
 * Build the durable captain note for one recorded failure. Pure, so the wording
 * boundaries are testable without a lock or a Harness.
 * @param memberName - the member that failed.
 * @param summary - the failure message plus its code.
 * @param disposition - what the failure was allowed to do.
 * @param task - the open attempt that was failed, when there was one.
 * @param settledRecord - the terminal record of the observed task, when it exists.
 * @returns the exact message the captain will read.
 */
export function memberFailureMessage(memberName, summary, disposition, task, settledRecord) {
    const head = `Member "${memberName}" hit an unrecoverable turn failure: ${summary}.`;
    if (disposition === 'failed_attempt' && task !== undefined) {
        return `${head} Task ${task.id} ("${task.subject}") was marked failed; reassign it or retry when ready.`;
    }
    if (settledRecord === undefined) {
        return disposition === 'noted_settled'
            ? `${head} No open attempt was owned; no task state was changed.`
            : `${head} No open attempt was owned.`;
    }
    // Only a completed record supports a claim about delivered work. A failed or
    // cancelled record is described by its actual closed state.
    return settledRecord.status === 'completed'
        ? `${head} Task ${settledRecord.id} ("${settledRecord.subject}") had already completed; its state and output were left unchanged. This member's last turn died after its work landed.`
        : `${head} Task ${settledRecord.id} ("${settledRecord.subject}") was already closed as ${settledRecord.status}; its record was left unchanged. This member's last turn died after that task had closed.`;
}
/** Record a final turn failure, never an intermediate request retry. */
export async function failMemberOpenAttempt(ctx, stateRoot, teamId, memberName, failure, fallbackSession, observed) {
    const summary = `${failure.message} (code ${failure.code})`;
    const lockKey = `team:${stateRoot}:${teamId}`;
    const prepared = await withTeamLock(lockKey, async () => {
        const team = await readTeam(stateRoot, teamId);
        if (team === undefined || team.halted === true || team.captainSessionId !== observed.captainSessionId)
            return;
        const member = team.members.find(candidate => candidate.name === memberName && candidate.id === observed.memberId);
        const task = team.tasks.find(candidate => candidate.assignee === memberName
            && (candidate.status === 'claimed' || candidate.status === 'in_progress'));
        // A reassign, completion, or recreated member may win the lock while the
        // final error is queued. Only the capability observed at that event may fail.
        const disposition = classifyMemberFailure(observed, {
            member,
            task,
            observedRecord: observed.task === undefined
                ? undefined
                : team.tasks.find(candidate => candidate.id === observed.task.id),
        });
        if (disposition === 'ignored')
            return;
        if (disposition === 'failed_attempt' && task !== undefined) {
            task.status = 'failed';
            task.output = summary;
            task.updatedAt = Date.now();
        }
        if (member !== undefined && ctx.agents.get(brandedSessionId(member.id))?.status !== 'running')
            member.status = 'idle';
        // A provider death is durable evidence about the ACCOUNT, so it is
        // recorded even when no attempt is open (disposition noted_settled): the
        // captain otherwise learns that a route is dead only when the member goes
        // quiet. Recording inside the team lock keeps the trace and the failed
        // attempt in one durable write.
        const lastFailure = providerFailureRecord(member, failure, Date.now());
        if (lastFailure !== undefined)
            member.lastFailure = lastFailure;
        // Only a terminal record of the observed task may be described, and only a
        // completed one supports a claim about delivered work. Anything else — a
        // never-assigned member, or a record left pending/claimed while the error was
        // queued — gets the plain "no open attempt" wording.
        const settledRecord = disposition === 'noted_settled'
            ? settledTaskRecord(observed.task, team.tasks)
            : undefined;
        const message = {
            ...createMessage(memberName, CAPTAIN_KEY, memberFailureMessage(memberName, summary, disposition, task, settledRecord)),
            deliveryClaimedAt: Date.now(),
        };
        if (disposition === 'failed_attempt' || lastFailure !== undefined)
            await writeTeam(stateRoot, team);
        await appendMailbox(stateRoot, team.id, CAPTAIN_KEY, message);
        if (disposition === 'failed_attempt' && task !== undefined) {
            appendTeamEvent(ctx, captainSessionOf(ctx, team.captainSessionId, fallbackSession), 'agent-teams/task-updated', {
                teamId, taskId: task.id, status: task.status, assignee: memberName, output: task.output,
            });
        }
        appendTeamEvent(ctx, captainSessionOf(ctx, team.captainSessionId, fallbackSession), 'agent-teams/message-sent', {
            teamId: team.id,
            messageId: message.id,
            from: memberName,
            to: CAPTAIN_KEY,
            content: message.content,
            ts: message.ts,
        });
        return { captainSessionId: team.captainSessionId, message };
    });
    if (prepared === undefined)
        return false;
    // Use the same lease/acknowledgment contract as send_message, outside the
    // team lock: steering can synchronously start another agent turn.
    const captain = nearestLiveLead(ctx, { captainSessionId: prepared.captainSessionId });
    const delivered = captain !== undefined && steerCaptainReport(captain, memberName, prepared.message.content, mailboxPrompt(teamId, CAPTAIN_KEY, [prepared.message]));
    await withTeamLock(lockKey, () => delivered
        ? markMailboxDelivered(stateRoot, teamId, CAPTAIN_KEY, [prepared.message.id])
        : releaseMailboxDelivery(stateRoot, teamId, CAPTAIN_KEY, [prepared.message.id]));
    return true;
}
/**
 * Persist an automatic degradation: the declared route stays the spine and the
 * live fallback is recorded beside it. Returns whether a member was written, so
 * the caller can audit exactly the changes that landed.
 */
async function updateFallbackState(stateRoot, teamId, memberName, fallback) {
    return await withTeamLock(`team:${stateRoot}:${teamId}`, async () => {
        const team = await readTeam(stateRoot, teamId);
        if (team === undefined)
            return false;
        const member = team.members.find(candidate => candidate.name === memberName);
        if (member === undefined)
            return false;
        member.activeProvider = fallback.provider;
        member.activeModel = fallback.model;
        member.fallbackActive = true;
        await writeTeam(stateRoot, team);
        return true;
    });
}
/**
 * Record one automatic degradation: durable state first, then the same audit row
 * the captain-driven path writes. The audit copy stays best effort — it must
 * never stop the retry the caller is about to authorize — so a failure here is
 * logged and swallowed.
 * @param ctx - the plugin context (for the audit's own logging).
 * @param request - the degradation to record.
 */
export async function recordAutoFallback(ctx, request) {
    const changed = await updateFallbackState(request.stateRoot, request.teamId, request.memberName, request.fallback);
    if (!changed)
        return false;
    await appendRouteChangeAudit(ctx, request.workspace, {
        at: request.at ?? Date.now(),
        teamId: request.teamId,
        memberName: request.memberName,
        previous: request.previous,
        route: request.fallback,
        // The member really does keep running on this route: the failed request
        // is retried against it and every later step starts there. The row
        // therefore reports the same applied value as the captain-driven live
        // switch, and carries its provenance in the source column instead
        // (`auto:<child session id>`).
        applied: 'live-and-durable',
        source: 'auto',
        by: request.by,
    }).catch((error) => {
        ctx.logger.warn(`agent-teams: failed to audit automatic fallback: ${String(error)}`);
    });
    return true;
}
function pendingSelectionKey(parentSessionId, label) {
    return `${parentSessionId}\u0000${label}`;
}
function effortPart(reasoningEffort) {
    return reasoningEffort === undefined || reasoningEffort === '' ? {} : { reasoningEffort };
}
/**
 * Resolve the route a member is declared to run on, reading no live process
 * state. Five branches in strict precedence order:
 *
 * 1. `fallback` — an active fallback outranks every other declaration: while
 *    the member is degraded the primary route is unusable, so a recorded
 *    override must not pull it back onto the failing route.
 * 2. `override` — the captain-declared route. It happens to be recorded as
 *    most recently, yet it ranks *below* the fallback for the reason above.
 * 3. `active` — an `activeProvider`/`activeModel` pair on a member that is not
 *    currently flagged as fallen back (historical switch record).
 * 4. `declared` — the route captured when the member was created.
 * 5. `undefined` — a legacy member without a complete saved route.
 *
 * An override carries its own effort; the spawn-time effort belongs to another
 * model and is never carried across a route change.
 * @param member - the durable member record.
 * @returns the provider/model(/effort) and its origin, or `undefined`.
 */
export function routeOf(member) {
    if (member === undefined)
        return undefined;
    if (member.fallbackActive === true) {
        const provider = member.activeProvider?.trim();
        const model = member.activeModel?.trim();
        if (provider !== undefined && provider !== '' && model !== undefined && model !== '')
            return { provider, model, origin: 'fallback' };
    }
    const overrideProvider = member.routeOverride?.provider?.trim();
    const overrideModel = member.routeOverride?.model?.trim();
    if (overrideProvider !== undefined && overrideProvider !== '' && overrideModel !== undefined && overrideModel !== '') {
        const effort = member.routeOverride?.reasoningEffort?.trim();
        return { provider: overrideProvider, model: overrideModel, ...effortPart(effort), origin: 'override' };
    }
    if (member.fallbackActive !== true) {
        const provider = member.activeProvider?.trim();
        const model = member.activeModel?.trim();
        if (provider !== undefined && provider !== '' && model !== undefined && model !== '') {
            const effort = member.reasoningEffort?.trim();
            return { provider, model, ...effortPart(effort), origin: 'active' };
        }
    }
    if (member.provider !== undefined && member.model !== undefined) {
        const provider = member.provider.trim();
        const model = member.model.trim();
        if (provider !== '' && model !== '') {
            const effort = member.fallbackActive === true ? undefined : member.reasoningEffort?.trim();
            return { provider, model, ...effortPart(effort), origin: 'declared' };
        }
    }
    return undefined;
}
/**
 * Build the model selection a spawn must use from ONE durable member row.
 *
 * Every path that starts a member (the manual add, the cold resume, and the
 * scheduler's `dispatchMember`) resolves its route through here, so the
 * precedence fallback > override > active > declared lives only in {@link routeOf}
 * and cannot drift between paths. The scheduler path used to read
 * `provider`/`model` straight off the row, which silently skipped a
 * captain-declared override on a member that had never started: the child ran on
 * the declared route and the spawn escalation then overwrote `provider`/`model`
 * with it, so a migrated route never took effect (t86).
 * @param member - the durable member record, or `undefined`.
 * @returns the request for {@link resolveMemberLlmSelection} — the effective route
 *   plus the durable fallback when no fallback is active — or `undefined` for a
 *   legacy member without a complete saved route.
 */
export function selectionFromMember(member) {
    if (member === undefined)
        return undefined;
    // Precedence lives in one place (routeOf), so a cold resume applies exactly
    // the order a live route change does: fallback beats override beats active
    // beats declared.
    const route = routeOf(member);
    if (route === undefined)
        return undefined;
    // Effort ids belong to the original model. After a fallback, its own
    // provider default remains authoritative, including after cold recovery.
    const reasoningEffort = member.fallbackActive === true ? undefined : route.reasoningEffort;
    return {
        provider: route.provider,
        model: route.model,
        ...effortPart(reasoningEffort),
        ...member.fallback === undefined || member.fallbackActive === true ? {} : { fallback: member.fallback },
    };
}
function modelSelection(selection) {
    return {
        provider: selection.provider,
        model: selection.model,
        ...selection.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: ReasoningEffortId(selection.reasoningEffort) },
    };
}
/**
 * Resolve one member's complete model selection. Ordinary members snapshot the
 * captain's current request route and reasoning effort. When provider or model
 * changes, effort is intentionally omitted so the target model materializes
 * its own default instead of receiving an adapter-owned id from another route.
 * An explicit effort overrides either policy; the sentinel "default" also
 * selects the target model's default. The final effort is validated against
 * the target model before a child is created.
 *
 * A configured `memberModel` is a route preference, not a blind model-id
 * override: it is paired with `memberLlmProvider` (or its own `provider/model`
 * form) when configured, and when only a bare model id is configured it is
 * adopted by the captain's provider only if that provider actually advertises
 * it. Otherwise the catalog decides: exactly one advertising provider wins,
 * none or several produce an actionable error listing them (issue #189). A
 * provider the caller *named* — explicitly or via configuration — is never
 * silently switched away from.
 */
export async function resolveMemberLlmSelection(ctx, captain, request, signal) {
    const explicitProvider = request.provider?.trim();
    const explicitModel = request.model?.trim();
    const defaultModel = request.defaultModel?.trim();
    const defaultProvider = request.defaultProvider?.trim();
    const explicitEffort = request.reasoningEffort?.trim();
    const fallback = request.fallback;
    if (request.provider !== undefined && explicitProvider === '') {
        throw new Error('member LLM provider must not be empty');
    }
    if (request.model !== undefined && explicitModel === '') {
        throw new Error('member model must not be empty');
    }
    if (request.defaultModel !== undefined && defaultModel === '') {
        throw new Error('configured memberModel must not be empty');
    }
    if (request.defaultProvider !== undefined && defaultProvider === '') {
        throw new Error('configured memberLlmProvider must not be empty');
    }
    if (request.reasoningEffort !== undefined && explicitEffort === '') {
        throw new Error('member reasoning effort must not be empty');
    }
    // An explicit provider needs an explicit model; `memberModel` is used
    // verbatim, so a `/` inside a model id is never a provider separator.
    if (explicitProvider !== undefined && explicitModel === undefined) {
        throw new Error('an explicit member LLM provider requires an explicit member model');
    }
    const current = captain.session.requestHeader()?.config;
    const currentProvider = current?.provider ?? captain.options.provider;
    const currentModel = current?.model ?? captain.options.model;
    if (currentProvider === undefined || currentModel === undefined) {
        throw new Error('cannot resolve the member LLM route from the current captain session');
    }
    // The plugin-wide default only applies where the caller did not choose a
    // model. `request.defaultModel` belongs to the plugin configuration; a
    // request-level `model` is a user choice and is never re-routed.
    const composed = composeMemberRoute({
        provider: request.provider,
        model: request.model,
        defaultModel: defaultModel,
        defaultProvider: defaultProvider,
    }, { provider: currentProvider, model: currentModel });
    if (composed === undefined) {
        throw new Error('cannot resolve the member LLM route from the current captain session');
    }
    // Only a bare configured `memberModel` may have its owner resolved from the
    // catalogs. A named provider (explicit or configured) is authoritative — a
    // model it does not advertise is a hard error, never a silent switch — and a
    // model the caller named keeps that caller's route.
    const provider = composed.derivedProvider
        ? await resolveMemberModelOwner(ctx, currentProvider, composed.model.value, signal)
        : composed.provider.value;
    // Effort ids belong to one exact provider/model capability. Preserve the
    // captain's effort only on the same route; a changed route must resolve its
    // own default. Explicit effort still wins, while "default" forces that
    // target-default behavior even when the route did not change.
    const model = composed.model.value;
    const sameRoute = provider === currentProvider && model === currentModel;
    const reasoningEffort = explicitEffort === undefined
        ? sameRoute
            ? current?.reasoningEffort
            : undefined
        : explicitEffort === 'default'
            ? undefined
            : ReasoningEffortId(explicitEffort);
    let resolved;
    try {
        resolved = await ctx.llm.resolveCallConfig({
            provider,
            model,
            ...reasoningEffort === undefined
                ? {}
                : { reasoningEffort },
        }, signal);
    }
    catch (error) {
        throw new Error(describeMemberRouteFailure(provider, model, error), { cause: error });
    }
    return {
        provider: resolved.provider,
        model: resolved.model,
        ...resolved.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: String(resolved.reasoningEffort) },
        ...fallback === undefined ? {} : { fallback },
    };
}
/**
 * Pick the provider that owns a configured bare model id when the captain's
 * provider does not advertise it. Only an unambiguous owner is accepted: zero
 * advertising providers and several advertising providers both fail with the
 * catalog, because guessing between real providers changes which account and
 * quota the user's members run on (issue #189).
 * @returns the resolved provider id.
 */
async function resolveMemberModelOwner(ctx, captainProvider, model, signal) {
    // Enumeration is optional: an adapter that cannot list its providers must not
    // turn a resolvable route into a crash. Such a route keeps the captain's
    // provider and lets the durable adapter report the real failure.
    const listProviders = ctx.llm.listProviders;
    if (typeof listProviders !== 'function')
        return captainProvider;
    const owners = [];
    for (const provider of listProviders.call(ctx.llm)) {
        if (signal?.aborted === true)
            throw signal.reason ?? new Error('member model resolution was cancelled');
        const catalog = await ctx.llm.listModels(provider.id);
        if (catalog.length === 0)
            continue;
        if (catalog.some((candidate) => candidate.id === model))
            owners.push(provider.id);
    }
    if (owners.includes(captainProvider))
        return captainProvider;
    if (owners.length === 1)
        return owners[0];
    if (owners.length === 0) {
        throw new Error(`no configured provider advertises the member model "${model}".`
            + ` The captain's provider "${captainProvider}" does not serve it either.`
            + ' Name the owner explicitly with memberLlmProvider, or pass provider + model to agent_teams_add_member.');
    }
    throw new Error(`the member model "${model}" is advertised by ${owners.length} providers (${owners.join(', ')}),`
        + ' so its owner is ambiguous. Name it explicitly with memberLlmProvider, or pass provider + model to agent_teams_add_member.');
}
/** Turn a raw adapter failure into an actionable, route-naming error. */
function describeMemberRouteFailure(provider, model, error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    const hint = code === 'UNKNOWN_MODEL' || code === 'NO_ADAPTER' || code === 'INVALID_CONFIG'
        ? ` The member route was composed from the captain's session and the plugin configuration;`
            + ' set memberLlmProvider when the configured member model belongs to a'
            + " different provider than the captain's session."
        : '';
    return `cannot use the member LLM route "${provider}/${model}": ${message}${code === '' ? '' : ` (code ${code})`}.${hint}`;
}
/**
 * Install the member selection bridge for every fresh or cold-resumed
 * continuable child. Fresh creation reads the pending in-memory selection;
 * cold resume restores the same selection from the owning team's durable
 * record. Legacy members without a complete saved route retain Harness's
 * descriptor provider/model behavior.
 */
export function installMemberSelectionRuntime(ctx, stateDir, onFailureSettled) {
    const pending = new Map();
    const pendingSetup = new Map();
    // Live selection refs by member child session id. An entry exists only
    // while this process owns the child's installed bridge, so a route change
    // can move a running member on its next step without pretending the switch
    // was live when the member was cold.
    const liveSelections = new Map();
    installContinuableMemberSetup(ctx, (childCtx, child) => {
        const descriptor = foldSubagentDescriptor(sessionOwnEvents(child.session));
        if (descriptor?.mode !== 'continuable' || !descriptor.label.startsWith(MEMBER_LABEL_PREFIX)) {
            return () => undefined;
        }
        const parentSessionId = child.session.header.parentSession;
        if (parentSessionId === undefined)
            return () => undefined;
        const identity = descriptor.label.slice(MEMBER_LABEL_PREFIX.length);
        const separator = identity.indexOf(':');
        if (separator < 1 || separator === identity.length - 1)
            return () => undefined;
        const teamId = identity.slice(0, separator);
        const memberName = identity.slice(separator + 1);
        const workspace = child.session.header.cwd ?? process.cwd();
        const stateRoot = join(workspace, stateDir);
        const key = pendingSelectionKey(parentSessionId, descriptor.label);
        // Internal settlement wakeups bypass the public delivery guard. Recheck
        // exact durable membership on every proposed step, including cold resume.
        const disposeAdmission = childCtx.on('agent/pre-step', async (payload, next) => {
            if (payload.agent.id !== child.id)
                return next();
            const admitted = await withTeamLock(`team:${stateRoot}:${teamId}`, async () => {
                const team = await readTeam(stateRoot, teamId);
                return team?.captainSessionId === parentSessionId && team.phase !== 'staged' && team.halted !== true
                    && team.members.some(member => member.id === child.id && member.name === memberName && member.status !== 'removed' && member.stopping !== true)
                    && !team.tasks.some(task => task.reassigning === true && task.assignee === memberName);
            });
            if (!admitted)
                return { kind: 'reject' };
            return next();
        });
        // New activations no longer persist persona/toolFilter in host descriptors.
        // Install them before the first request, and restore the exact saved values
        // after a cold resume. Historical descriptors remain owned by Harness.
        const savedTeam = pending.has(key) ? undefined : readTeamSync(stateRoot, teamId);
        const savedMember = savedTeam?.captainSessionId === parentSessionId
            ? savedTeam.members.find(member => member.id === child.id && member.name === memberName)
            : undefined;
        const setup = pendingSetup.get(key) ?? savedMember?.runtimeSetup;
        if (usesManagedActivations(ctx.subagents) && savedMember !== undefined
            && setup === undefined && descriptor.toolFilter === undefined) {
            disposeAdmission();
            throw new Error('agent-teams: saved member runtime setup is missing; refusing an unrestricted resume');
        }
        let disposeSetup = () => undefined;
        if (usesManagedActivations(ctx.subagents) && setup !== undefined) {
            try {
                const stopFilter = childCtx.tools.restrict(setup.toolFilter);
                try {
                    const stopPersona = childCtx.systemPrompt.section({
                        name: 'deployment:persona-prefix',
                        order: childCtx.systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_PREFIX'),
                        text: setup.persona,
                    });
                    disposeSetup = () => { stopPersona(); stopFilter(); };
                }
                catch (error) {
                    stopFilter();
                    throw error;
                }
            }
            catch (error) {
                disposeAdmission();
                throw error;
            }
        }
        const cleanupAdmission = () => { disposeSetup(); disposeAdmission(); };
        let selection = pending.get(key);
        if (selection === undefined) {
            const team = readTeamSync(stateRoot, teamId);
            if (team?.captainSessionId !== parentSessionId)
                return cleanupAdmission;
            const durableMember = team.members.find(member => member.name === memberName);
            selection = selectionFromMember(durableMember);
            if (selection !== undefined && (descriptor.agentProvider !== durableMember?.provider || descriptor.agentModel !== durableMember?.model)) {
                throw new Error(`agent-teams: saved model route for member "${memberName}" does not match its subagent descriptor`);
            }
        }
        let lastFailedTurn;
        // Harness emits agent/error only after request recovery is exhausted. In
        // particular, llm-retry's "always" policy calls downstream request-error
        // listeners before it retries; that waterfall cannot declare a turn dead.
        const disposeFailure = childCtx.on('agent/error', async (payload) => {
            if (payload.agent.id !== child.id || payload.turn === lastFailedTurn)
                return;
            lastFailedTurn = payload.turn;
            try {
                // Capture the attempt synchronously at the event, before any lock wait
                // can let a captain reassign it or replace the member/team generation.
                const snapshot = readTeamSync(stateRoot, teamId);
                if (snapshot?.captainSessionId !== parentSessionId)
                    return;
                const member = snapshot.members.find(item => item.id === child.id && item.name === memberName && item.status !== 'removed');
                if (member === undefined)
                    return;
                const task = snapshot.tasks.find(item => item.assignee === memberName
                    && (item.status === 'claimed' || item.status === 'in_progress'));
                const failure = payload.error instanceof LlmError ? payload.error.failure : {
                    code: 'UNKNOWN',
                    message: payload.error instanceof Error ? payload.error.message : String(payload.error),
                };
                const recorded = await failMemberOpenAttempt(ctx, stateRoot, teamId, memberName, failure, child.session, {
                    captainSessionId: parentSessionId, memberId: child.id, task,
                });
                if (!recorded)
                    return;
                // The final-error event precedes driver quiescence. Observe the real
                // lifecycle and kick explicitly even if its idle event was missed.
                // Never force an active Agent's status to idle or retry the failed task.
                await child.whenIdle();
                await withTeamLock(`team:${stateRoot}:${teamId}`, async () => {
                    const team = await readTeam(stateRoot, teamId);
                    const current = team?.members.find(item => item.id === child.id && item.name === memberName && item.status !== 'removed');
                    if (team?.captainSessionId !== parentSessionId || current === undefined || child.status !== 'idle')
                        return;
                    if (current.status !== 'idle') {
                        current.status = 'idle';
                        await writeTeam(stateRoot, team);
                    }
                });
                await onFailureSettled?.(workspace, teamId, memberName);
            }
            catch (error) {
                ctx.logger.warn(`agent-teams: failed to record member turn failure: ${String(error)}`);
            }
        });
        // Legacy teams still need failure reporting even without a saved route.
        if (selection === undefined)
            return () => { disposeFailure(); cleanupAdmission(); };
        const selectionRef = { current: modelSelection(selection), assembled: undefined };
        liveSelections.set(child.id, selectionRef);
        const disposeSelection = installModelSelection(childCtx, selectionRef);
        const fallback = selection.fallback;
        let switched = false;
        const disposeFallback = childCtx.on('agent/request-error', async (payload, next) => {
            if (payload.agent.id !== child.id || payload.signal.aborted)
                return next();
            const current = selectionRef.current ?? { provider: selection.provider, model: selection.model };
            const failureMessage = typeof payload.failure.message === 'string' ? payload.failure.message : undefined;
            const transition = selectFallbackRoute(current, fallback, payload.failure.code, switched, failureMessage);
            // selectFallbackRoute only retries when a fallback route exists; the
            // explicit guard narrows that fact for the compiler.
            if (fallback !== undefined && transition.retry) {
                switched = transition.switched;
                selectionRef.current = transition.selection;
                // Request recovery repeats buildRequest inside the current step; it
                // does not re-run prompt assembly. Override that captured route too,
                // otherwise the authorized retry would hit the failed primary again.
                selectionRef.assembled = transition.selection;
                // `current` was captured before the reassignment above: it is the
                // route that just died, which is what the audit row must name on its
                // previous side. The degradation is written durably first and audited
                // second, and neither may stop the retry below.
                await recordAutoFallback(ctx, {
                    stateRoot, teamId, memberName, fallback, workspace,
                    previous: current,
                    by: child.id,
                    at: Date.now(),
                }).catch((error) => {
                    ctx.logger.warn(`agent-teams: failed to persist fallback route: ${String(error)}`);
                });
                ctx.logger.warn(`agent-teams: member ${child.id} switching to fallback ${fallback.provider}/${fallback.model} after ${payload.failure.code}`);
                return { kind: 'retry' };
            }
            return next();
        });
        return () => {
            // Deregister first: a route change racing this disposal must not
            // write into a ref whose bridge is already gone.
            liveSelections.delete(child.id);
            disposeFallback();
            disposeSelection();
            disposeFailure();
            cleanupAdmission();
        };
    });
    return {
        // The configured state directory. `activateMemberNow` builds a member
        // persona from it, and the tool layer hands the runtime no other copy.
        stateDir,
        isPendingMember(agent) {
            const parent = agent.session.header.parentSession;
            const descriptor = foldSubagentDescriptor(sessionOwnEvents(agent.session));
            return parent !== undefined && descriptor?.mode === 'continuable'
                && pending.has(pendingSelectionKey(parent, descriptor.label));
        },
        setLiveRoute(agentId, selection) {
            const ref = liveSelections.get(agentId);
            if (ref === undefined)
                return false;
            // Only `current`. A member running mid-turn already captured its
            // request route when the current prompt assembly started (the host
            // reads `current` once, then snapshots `assembled`), so the request
            // in flight keeps the old route, the next step uses the new one,
            // and the host emits its own "[model changed: …]" notice. Writing
            // `assembled` here would rewrite the route of a request that has
            // already been authorized for another model; that override is
            // reserved for the fallback retry path, which repeats the same step.
            ref.current = selection;
            return true;
        },
        liveRoute(agentId) {
            const current = liveSelections.get(agentId)?.current;
            if (current === undefined)
                return undefined;
            return { provider: current.provider, model: current.model, ...effortPart(current.reasoningEffort) };
        },
        liveChildIds() {
            return [...liveSelections.keys()];
        },
        async withPending(parentSessionId, label, selection, operation, setup) {
            const key = pendingSelectionKey(parentSessionId, label);
            if (pending.has(key)) {
                throw new Error(`member model selection is already pending for "${label}"`);
            }
            pending.set(key, selection);
            if (setup !== undefined)
                pendingSetup.set(key, setup);
            try {
                return await operation();
            }
            finally {
                pending.delete(key);
                pendingSetup.delete(key);
            }
        },
    };
}
function configuredExecutionPrompt(member, config) {
    const prompt = member.executionPrompt?.trim() || config.executionPrompt?.trim();
    return prompt === undefined || prompt === '' ? undefined : prompt;
}
function truncatedPersonaProtocol(protocol) {
    if (protocol === undefined || protocol.trim() === '')
        return '(none)';
    if (protocol.length <= PERSONA_PROTOCOL_MAX_CHARS)
        return protocol;
    return `${protocol.slice(0, PERSONA_PROTOCOL_MAX_CHARS)}… [truncated]`;
}
function assignedNonTerminalCount(team, memberName) {
    return team.tasks.filter(task => (task.assignee === memberName && !TERMINAL_TASK_STATUSES.includes(task.status))).length;
}
/**
 * The member's system prompt (persona), shadowing the deployment persona for
 * that child. Self-contained: it replaces the whole persona section.
 * Frozen at spawn: draft must already carry the Team goal and profile protocol.
 * @param team - the team the member joined.
 * @param member - the member record (name/role are read before spawning).
 * @param stateDir - configured state directory, so the member can locate the
 *   team files with its own file tools.
 */
export function memberPersona(team, member, stateDir, executionPrompt) {
    const goal = team.description?.trim() || '(not provided)';
    const injectedPrompt = member.executionPrompt?.trim() || executionPrompt?.trim();
    const protocol = truncatedPersonaProtocol(team.profile?.protocol);
    return `You are ${member.name}, a member of the multi-agent team "${team.name}" running inside DeepSeek Harness AgentTeams. The captain leads the team; you are a worker member${member.role ? ` with the role: ${member.role}` : ''}.

Team context:
- Team id: ${team.id}
- Your name inside the team (use it as \`from\`/identity): ${member.name}
- Team goal: ${goal}
- Profile protocol: ${protocol}
${injectedPrompt === undefined || injectedPrompt === '' ? '' : `- Execution guidance:
${injectedPrompt}
`}- The team state lives under ${stateDir}/${team.id}/ (team.json and inbox/*.jsonl). You may inspect these files read-only for diagnostics, but never edit them directly; use the agent_teams_* tools so JSON escaping and concurrent updates stay safe.
- The captain and your teammates reach you through messages. Coordination arrives at your nearest model step. Apply it to your current attempt; a task assignment starts a separate turn.
When you receive a task, treat the assignment prompt's dependency results as source material. Do not ignore them.

Working rules:
1. When you receive a task assignment, call agent_teams_claim_task with the task id. Keep the returned attempt_id: include it in every agent_teams_update_task call for that execution attempt. Then mark the task in_progress.
2. Work thoroughly with your available tools; do not cut corners.
3. When finishing a task:
   - use status=completed only when the task's success criteria are satisfied;
   - use status=failed when blocking findings or validation failures mean downstream work must not proceed;
   - include a concise output in either case;
   - a stale-attempt rejection means the captain reassigned or took over the task; stop touching that task and wait for new work.
   claimed cannot jump to completed. Mark in_progress first, then completed or failed.
   Include attempt_id on every update. Then report once as described below and become idle.
4. Send one short report with agent_teams_send_message (to=captain) when you complete a task or hit a blocker. Include source_task_id and source_attempt_id in task reports; a stale source rejection means stop, never relabel an old result with a new attempt. The captain is also your parent: this single message satisfies both reporting duties. Do not repeat it through the native send_message tool or send acknowledgments that add no new information.
5. To ask a teammate something, use agent_teams_send_message with to=<teammate name>; the message lands in their mailbox and wakes them directly — teammates talk to each other without the captain in the loop. The same applies to the captain (to=captain).
6. After your turn becomes idle, the shared task scheduler may assign your next ready task automatically. Never claim a second task while you still own unfinished work.
7. If you already own an open attempt (claimed or in_progress) and receive mail, treat it as guidance for that same attempt_id unless the mail explicitly tells you to stop or fail. Do not claim a new task in that turn.
8. Do not start a teammate's assigned task. Do not privately tell the next-stage member to start; the scheduler assigns unlocked work after you become idle.
9. You are a worker: do not create or delete teams, reassign tasks, or add/remove members — that is the captain's job.
10. Quality-gate kinds carry a contract (kind, objective, inScope, acceptance, verify). Stay inside inScope. Do not mark your own implementation as review pass. Review/requirements complete only with verdict=pass; needs_revision/reject must fail with findings. Mail is not a formal next review. Completed work must not be repeated to attach late evidence: call update_task on the original task with its attempt_id and acceptanceResults/commandsRun/evidence_note; supplements are append-only and cannot change its verdict.`;
}
/**
 * The initial user message delivered when the member is created.
 * Counts non-terminal tasks already assigned to this member on the in-memory draft.
 * @param team - the team the member joined.
 * @param memberName - canonical member name used to count assigned pending work.
 */
export function memberWelcome(team, memberName) {
    const assigned = assignedNonTerminalCount(team, memberName);
    return `You have joined the team "${team.name}" as a member. Wait for an automatic assignment or a captain message.
Current team status: ${team.tasks.length} task(s), ${assigned} pending task(s) assigned to you.
Do not start work until the scheduler or captain assigns a task in this turn.`;
}
/**
 * Spawn one member as a durable continuable subagent of the captain and fill
 * `member.id` with its child session id. On failure nothing is persisted.
 * @param ctx - the plugin context (injects `subagents`).
 * @param config - member runtime knobs.
 * @param selections - fresh/cold child model-selection bridge.
 * @param llmSelection - resolved provider/model/reasoning snapshot.
 * @param captain - the exact live captain agent (the calling agent).
 * @param team - the team record (read-only here).
 * @param member - the member draft whose `id` is filled on success.
 * @param stateDir - configured state directory (for the persona).
 * @param signal - caller cancellation, forwarded to the start.
 * @param initialPrompt - first turn text; the welcome message when omitted.
 * @param resolvedFilter - the member's effective tool filter (a selected
 *   policy, or the legacy captain-only filter when the member has none). The
 *   caller resolves it so `spawnMember` forwards exactly one immutable filter
 *   to `startContinuable`.
 * @param relaxableDeny - deny names the lenient retry may drop for this
 *   member; the caller narrows it for a policy member so a name the owner
 *   declared is never silently removed.
 */
export async function spawnMember(ctx, config, selections, llmSelection, captain, team, member, stateDir, signal, initialPrompt, resolvedFilter, relaxableDeny) {
    // Fail loud at the first use: provider registration is a sibling plugin's
    // effect and may settle after this plugin mounts. Capability checks here
    // mirror what startContinuable would reject, with an actionable error.
    const provider = ctx.subagents.getProvider(config.provider);
    if (provider === undefined) {
        throw new Error(`agent-teams: no subagent provider "${config.provider}" is registered (available: ${ctx.subagents.list().join(', ') || 'none'}) — `
            + 'check that the subagent provider row (e.g. subagent-spawn) is mounted in the composition');
    }
    if (provider.prepareContinuable === undefined) {
        throw new Error(`agent-teams: provider "${config.provider}" does not support continuable members`);
    }
    const legacyCapabilities = provider.capabilities;
    if (!usesManagedActivations(ctx.subagents) && !legacyCapabilities.persona) {
        throw new Error(`agent-teams: provider "${config.provider}" cannot apply a member persona`);
    }
    if (!usesManagedActivations(ctx.subagents) && !legacyCapabilities.toolFilter) {
        throw new Error(`agent-teams: provider "${config.provider}" cannot restrict captain-only tools for members`);
    }
    const label = `${MEMBER_LABEL_PREFIX}${team.id}:${member.name}`;
    // The legacy filter of a member without a configured tool policy: the
    // captain-only deny list plus the depth entries this host registers.
    const requestedFilter = resolvedFilter ?? memberToolFilter(config.maxDepth, restrictableToolNames(captain));
    // The lenient retry may drop names this host reports unknown; keep the exact
    // filter the host accepted for the durable member setup.
    let acceptedFilter = requestedFilter;
    const start = await startMemberWithLenientFilter(toolFilter => {
        acceptedFilter = toolFilter;
        const setup = { persona: memberPersona(team, member, stateDir, config.executionPrompt), toolFilter };
        return selections.withPending(captain.id, label, llmSelection, () => startMember(ctx.subagents, {
            provider: config.provider,
            label,
            request: {
                prompt: [{ type: 'text', text: initialPrompt ?? memberWelcome(team, member.name) }],
                parent: captain,
                persona: memberPersona(team, member, stateDir, config.executionPrompt),
                // Depth deny entries name host tools; resolve them against the
                // running host's registry so a renamed delegation tool cannot abort
                // the spawn (see memberToolFilter). Depth is still enforced by the
                // parent-chain guard installed at plugin mount. A filter the host
                // still rejects is retried without the names it reported.
                toolFilter,
                agentOptions: {
                    provider: llmSelection.provider,
                    model: llmSelection.model,
                    ...llmSelection.reasoningEffort === undefined
                        ? {}
                        : { reasoningEffort: ReasoningEffortId(llmSelection.reasoningEffort) },
                },
                // Harness request.maxDepth caps the absolute depth of THIS creation;
                // it is not inherited by later delegations. The guard below enforces
                // the configured member-relative descendant budget instead.
            },
            signal,
        }), setup);
    }, requestedFilter, relaxableDeny);
    member.id = start.childId;
    // A member that just started again has no standing provider failure: the
    // trace is cleared at the same durable write that records the new child, so a
    // stale `lastFailure` cannot outlive the route that failed.
    delete member.lastFailure;
    // Escalate a captain-declared override into the member's descriptor route
    // at the only moment it can still be written. The child is already running
    // on this exact route, so recording it as provider/model keeps the durable
    // record and the subagent descriptor in agreement; a leftover routeOverride
    // would make the cold-resume descriptor guard reject the very next resume
    // (the descriptor guard above — never weakened for that reason), because it
    // can compare only descriptor against provider/model.
    member.provider = llmSelection.provider;
    member.model = llmSelection.model;
    if (llmSelection.reasoningEffort === undefined)
        delete member.reasoningEffort;
    else
        member.reasoningEffort = llmSelection.reasoningEffort;
    delete member.routeOverride;
    if (usesManagedActivations(ctx.subagents)) {
        member.runtimeSetup = { persona: memberPersona(team, member, stateDir, config.executionPrompt), toolFilter: acceptedFilter };
    }
    // Only a policy member carries a persisted filter snapshot; a member without
    // a policy keeps its public record shape. Legacy descriptors or runtimeSetup
    // restore the filter on cold resume, depending on the host generation.
    if (member.toolFilter !== undefined)
        member.toolFilter = { ...acceptedFilter };
}
/**
 * Start one manually added member inside the turn that added it.
 *
 * `agent_teams_add_member` writes the roster row and then asks the runtime
 * module for this hook, so the tool layer never needs a second spawn path. The
 * contract is narrow on purpose:
 * - the CALLER owns the team lock and every durable write, so this function
 *   mutates `member` in place and never writes `team.json` itself (the caller
 *   persists both the success and the failure, which is what keeps a failed row
 *   visible with its reason);
 * - a thrown error is the only failure signal (design v1 §4.2 d3);
 * - the route is resolved from the durable row through `selectionFromMember`, so
 *   an override declared before the member ever started decides the route, and
 *   `spawnMember` then escalates that route into `provider`/`model` and drops
 *   `routeOverride` — a leftover override under a live descriptor would make the
 *   cold-resume descriptor guard reject the very next resume (members.js:621).
 * @param ctx - the plugin context (injects `subagents`).
 * @param config - member runtime knobs, as `memberRuntime(config)` in the tool layer.
 * @param selections - the installed member selection runtime.
 * @param captain - the exact live captain agent (the member's parent).
 * @param team - the team record that already carries the added roster row.
 * @param member - the new roster row; `id` is filled on success.
 * @param resolvedFilter - the member's effective tool filter, when it has one.
 * @param initialPrompt - first turn text; the welcome message when omitted.
 * @param signal - caller cancellation, forwarded to the start.
 * @returns the child session id (unchanged when the member was already running).
 */
export async function activateMemberNow(ctx, config, selections, captain, team, member, resolvedFilter, initialPrompt, signal) {
    if (member.status === 'removed')
        throw new Error(`agent-teams: member "${member.name}" was removed and cannot be started`);
    if (member.stopping === true)
        throw new Error(`agent-teams: member "${member.name}" is stopping and cannot be started`);
    // Already started: report the child it already owns instead of creating a
    // second session for the same roster row.
    if (member.id !== '')
        return member.id;
    // The caller decides admission; re-checked because the hook is exported and
    // the HTTP /plan action reaches this same runtime.
    if (team.halted === true)
        throw new Error(`agent-teams: team "${team.id}" is halted; member "${member.name}" cannot start`);
    if ((team.phase ?? 'running') === 'staged')
        throw new Error(`agent-teams: team "${team.id}" is still staged; member "${member.name}" starts only after approval`);
    const declared = selectionFromMember(member) ?? {
        provider: member.provider,
        model: member.model,
        ...effortPart(member.reasoningEffort),
    };
    const selection = await resolveMemberLlmSelection(ctx, captain, {
        provider: declared.provider,
        model: declared.model,
        reasoningEffort: declared.reasoningEffort,
        defaultModel: config.memberModel,
        defaultProvider: config.memberLlmProvider,
        fallback: declared.fallback ?? member.fallback ?? config.fallback,
    }, signal);
    // Validate before the start: the roster row is already durable here, so an
    // unusable route must fail the start instead of leaving a half-started member.
    await validateMemberLlmSelections(ctx, [selection], signal);
    // Parity with the scheduler path (tools.js memberRelaxableDeny): a member
    // without a policy keeps the built-in recovery set, and a policy member may
    // relax only the built-in entries the owner did not declare itself. That
    // subset needs the deployment's policy table, so a runtime started without
    // one keeps the fail-loud default instead of spawning under a filter the
    // owner never asked for.
    const relaxableDeny = member.toolPolicy === undefined
        ? undefined
        : config.toolPolicies === undefined || config.toolPolicies === null
            ? []
            : memberSpawnRelaxableDeny(optionalToolPolicy(config.toolPolicies, member.toolPolicy), true);
    await spawnMember(ctx, config, selections, selection, captain, team, member, selections.stateDir ?? '', signal, initialPrompt, resolvedFilter, relaxableDeny);
    return member.id;
}
/** Relative location of the human/audit-readable route-change log. */
const ROUTE_AUDIT_PATH = ['docs', 'log', 'MODEL-SWITCH.md'];
/** Header written when the audit log is created. */
const ROUTE_AUDIT_HEADER = `# MODEL-SWITCH

Append-only record of every member route change applied through
\`agent_teams_set_member_route\`. The machine-readable twin of each line is the
\`agent-teams/member-route-changed\` session event; this file exists so an
independent audit does not depend on the harness recognizing that event type
(events.js omits event types the running harness does not know).

| at (UTC) | team | member | previous | route | applied | source |
| --- | --- | --- | --- | --- | --- | --- |
`;
/** Render one route as \`provider/model\`, with its effort when it has one. */
function auditRouteLabel(route) {
    if (route === undefined)
        return '(none)';
    const effort = route.reasoningEffort === undefined ? '' : ` (${route.reasoningEffort})`;
    return `${route.provider}/${route.model}${effort}`;
}
/**
 * Append one route change to the workspace audit log. Best effort: the audit
 * copy must never be able to fail a route change that already landed durably.
 * @param ctx - the plugin context (for logging).
 * @param workspace - the captain's workspace directory.
 * @param record - the route change to record.
 */
async function appendRouteChangeAudit(ctx, workspace, record) {
    try {
        const path = join(workspace, ...ROUTE_AUDIT_PATH);
        await mkdir(dirname(path), { recursive: true });
        let present = true;
        try {
            await access(path);
        }
        catch {
            present = false;
        }
        if (!present)
            await appendFile(path, ROUTE_AUDIT_HEADER, 'utf8');
        const source = record.by === undefined ? record.source : `${record.source}:${record.by}`;
        // A clear removes the override instead of installing one, so the target
        // column says so rather than naming a route that was never requested.
        const target = record.cleared === true ? '(cleared)' : auditRouteLabel(record.route);
        // A route change can also move the fallback route. Folding the note into
        // the target column keeps one row per change and the existing 7-column
        // shape, so a reader (human or parser) written against the old table
        // still sees a route in that column.
        const fallbackNote = record.fallback !== undefined
            ? ` (fallback ${auditRouteLabel(record.fallback)})`
            : record.fallbackCleared === true ? ' (fallback cleared)' : '';
        await appendFile(path, `| ${new Date(record.at).toISOString()} | ${record.teamId} | ${record.memberName} | ${auditRouteLabel(record.previous)} | ${target}${fallbackNote} | ${record.applied} | ${source} |\n`, 'utf8');
    }
    catch (error) {
        ctx.logger.warn(`agent-teams: could not append ${ROUTE_AUDIT_PATH.join('/')}: ${String(error)}`);
    }
}
/** Relative location of the human/audit-readable member-profile log. */
const MEMBER_PROFILE_AUDIT_PATH = ['docs', 'log', 'MEMBER-PROFILE.md'];
/** Role cap, measured after trimming. */
export const MEMBER_ROLE_MAX = 200;
/** Execution-prompt cap, measured after trimming. */
export const MEMBER_EXECUTION_PROMPT_MAX = 4000;
/** Header written when the member-profile audit log is created. */
const MEMBER_PROFILE_AUDIT_HEADER = `# MEMBER-PROFILE

Append-only record of every member profile change (role / execution prompt)
applied through agent_teams_set_member_profile. The machine-readable twin of
each line is team.json (members[].role / members[].executionPrompt); no harness
event is involved, so an independent audit never depends on the running harness
recognizing an event type (events.js drops what it does not know).

| at (UTC) | team | member | role | executionPrompt | source |
| --- | --- | --- | --- | --- | --- |
`;
/** Keep one free-text value inside a single markdown table cell. */
function auditCell(value) {
    return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}
/**
 * Append one profile change to the workspace audit log. Best effort: the audit
 * copy must never be able to fail a change that already landed durably.
 * @param ctx - the plugin context (for logging).
 * @param workspace - the captain's workspace directory.
 * @param record - the profile change to record.
 */
async function appendMemberProfileAudit(ctx, workspace, record) {
    try {
        const path = join(workspace, ...MEMBER_PROFILE_AUDIT_PATH);
        await mkdir(dirname(path), { recursive: true });
        let present = true;
        try {
            await access(path);
        }
        catch {
            present = false;
        }
        if (!present)
            await appendFile(path, MEMBER_PROFILE_AUDIT_HEADER, 'utf8');
        const source = record.by === undefined ? record.source : `${record.source}:${record.by}`;
        // One row per change: an unchanged half says so explicitly, so a reader
        // never has to diff team.json to learn what the call actually touched.
        const roleNote = record.role === undefined
            ? '(unchanged)'
            : `${record.previousRole === undefined || record.previousRole === '' ? '(none)' : auditCell(record.previousRole)} → ${auditCell(record.role)}`;
        const promptNote = record.executionPrompt === undefined
            ? '(unchanged)'
            : `${record.previousExecutionPrompt === undefined ? 0 : record.previousExecutionPrompt.length} → ${record.executionPrompt.length} chars`;
        await appendFile(path, `| ${new Date(record.at).toISOString()} | ${auditCell(record.teamId)} | ${auditCell(record.memberName)} | ${roleNote} | ${promptNote} | ${source} |\n`, 'utf8');
    }
    catch (error) {
        ctx.logger.warn(`agent-teams: could not append ${MEMBER_PROFILE_AUDIT_PATH.join('/')}: ${String(error)}`);
    }
}

/**
 * Resolve the route a member is running *right now*: the live in-process
 * selection when this process owns the member's session, otherwise the durable
 * declaration. \`nextRoute\` is the same value; the two names exist so a caller
 * can display "what is running" and "what will run" without reimplementing the
 * precedence.
 * @param selections - the installed member selection runtime.
 * @param member - the durable member record.
 * @returns the effective route plus its origin and whether it is live.
 */
export function currentMemberRoute(selections, member) {
    const live = member.id === '' ? undefined : selections.liveRoute(member.id);
    if (live !== undefined)
        return { ...live, origin: 'live', live: true };
    const route = routeOf(member);
    if (route === undefined)
        return undefined;
    return { ...route, live: false };
}
/**
 * Change one member's model route, durably and (when the member is live in this
 * process) immediately.
 *
 * Ordering is deliberate and load-bearing:
 * 1. Resolve + validate the new route *before* any write, so an unusable route
 *    never replaces a working one.
 * 2. Write \`team.json\` (the durable override, with provenance) before the
 *    in-memory switch, so a crash between the two leaves a record that a cold
 *    resume replays rather than a live route with no durable record.
 * 3. Never touch \`provider\`/\`model\`: they are the subagent descriptor route a
 *    cold resume is checked against (members.js:557). \`spawnMember\` escalates the
 *    override into them when the member is actually created.
 * 4. Switch only \`selection.current\`. A member that is mid-turn keeps the route
 *    of the request already in flight and moves on its next step.
 *
 * @param ctx - the plugin context.
 * @param config - member runtime config (defaults for a half-specified route).
 * @param selections - the installed member selection runtime.
 * @param captain - the live captain agent (the team owner).
 * @param stateDir - configured state directory.
 * @param teamId - the team that owns the member.
 * @param memberName - the member to re-route.
 * @param request - the requested route, its provenance, and the reason.
 * @param signal - cancellation signal for catalog validation.
 * @returns the applied change in snake_case for the tool result.
 */
/**
 * The provenance sources the PLUGIN itself owns.
 *
 * The READ side is deliberately lenient (`state.js` `isProvenanceSource`, BUG-026):
 * a foreign writer must never be able to freeze a whole team out of existence just
 * because it labelled a row with its own provenance. The WRITE side is the mirror
 * image: the plugin may only stamp a source it actually owns. A `source` that no
 * writer validates is worse than no provenance at all — it looks like a claim of
 * origin while any caller can forge it — so an unknown value is refused BEFORE the
 * durable write and BEFORE the audit row, leaving team.json byte-identical.
 */
const PROVENANCE_SOURCES = ['captain', 'http', 'profile'];
/**
 * Resolve the provenance of one write, or throw before anything is written.
 * @param source - the caller's `request.source` (`undefined` means "not passed").
 * @param what - the change being written, for the error message.
 * @returns one of `captain` | `http` | `profile`.
 */
function resolveProvenanceSource(source, what) {
    if (source === undefined)
        return 'captain';
    if (typeof source === 'string' && PROVENANCE_SOURCES.includes(source))
        return source;
    const shown = typeof source === 'string' ? JSON.stringify(source) : `${typeof source} ${String(source)}`;
    throw new Error(`agent-teams: ${what} refused: source ${shown} is not one the plugin owns (valid sources: ${PROVENANCE_SOURCES.join(', ')}); nothing was written`);
}
export async function setMemberRoute(ctx, config, selections, captain, stateDir, teamId, memberName, request, signal) {
    const workspace = captain.session.header.cwd ?? process.cwd();
    const stateRoot = join(workspace, stateDir);
    // Provenance first: an unknown source must fail before the lock, before the
    // durable write and before the audit row (BUG-026 write half).
    const source = resolveProvenanceSource(request.source, `route change for member "${memberName}"`);
    return await withTeamLock(`team:${stateRoot}:${teamId}`, async () => {
        const team = await readTeam(stateRoot, teamId);
        if (team === undefined)
            throw new Error(`agent-teams: team "${teamId}" was not found`);
        // A removed member keeps its record for audit; it cannot be re-routed.
        const member = team.members.find(candidate => candidate.name === memberName && candidate.status !== 'removed');
        if (member === undefined)
            throw new Error(`agent-teams: member "${memberName}" is not part of team "${teamId}"`);
        if (member.stopping === true)
            throw new Error(`agent-teams: member "${memberName}" is stopping; its route cannot be changed`);
        // A halted team still accepts a route change: the captain may prepare a
        // resume, and a route is not execution admission.
        // clear: true is the revert path: it removes the captain override and
        // puts the member back on the route it was DECLARED with — the route a
        // cold resume checks the subagent descriptor against. A clear takes no
        // route argument; accepting one would leave the caller unable to tell
        // which of the two requests won.
        const clearing = request.clear === true;
        if (clearing && (request.provider !== undefined || request.model !== undefined || request.reasoningEffort !== undefined)) {
            throw new Error(`agent-teams: clear cannot be combined with provider, model, or reasoning effort; clearing returns member "${memberName}" to its declared route`);
        }
        // The per-member fallback route: where the member degrades to when its
        // primary route dies (selectFallbackRoute). It is durable, so a cold
        // resume re-seeds it at spawn time without the captain being awake.
        // Both halves are required: a provider without a model (or the reverse)
        // is not a route, and guessing the other half would silently bind a
        // member to a model the caller never named.
        const fallbackClearing = request.fallbackClear === true;
        const wantsFallback = request.fallbackProvider !== undefined || request.fallbackModel !== undefined
            || request.fallbackReasoningEffort !== undefined;
        // A call either re-routes the member (provider/model/effort), reverts it
        // (clear), or only moves its fallback. The third shape must NOT fall
        // through to the defaults path, which would silently install an override
        // the caller never asked for.
        const wantsPrimary = request.provider !== undefined || request.model !== undefined || request.reasoningEffort !== undefined;
        if (fallbackClearing && wantsFallback) {
            throw new Error(`agent-teams: fallback_clear cannot be combined with fallback_provider, fallback_model, or fallback_reasoning_effort; clearing removes member "${memberName}"'s fallback route`);
        }
        if (wantsFallback && (request.fallbackProvider === undefined || request.fallbackModel === undefined)) {
            throw new Error(`agent-teams: a fallback route needs both fallback_provider and fallback_model; member "${memberName}" was not changed`);
        }
        const fallbackProvider = typeof request.fallbackProvider === 'string' ? request.fallbackProvider.trim() : request.fallbackProvider;
        const fallbackModel = typeof request.fallbackModel === 'string' ? request.fallbackModel.trim() : request.fallbackModel;
        const fallbackEffort = typeof request.fallbackReasoningEffort === 'string'
            ? (request.fallbackReasoningEffort.trim() === '' ? undefined : request.fallbackReasoningEffort.trim())
            : request.fallbackReasoningEffort;
        if (fallbackProvider === '') {
            throw new Error(`agent-teams: fallback_provider must be a non-empty provider for member "${memberName}"`);
        }
        if (fallbackModel === '') {
            throw new Error(`agent-teams: fallback_model must be a non-empty model for member "${memberName}"`);
        }
        /** @type {{ provider: string, model: string, reasoningEffort?: string } | undefined} */
        let fallbackSelection;
        if (wantsFallback) {
            // Resolved and catalog-validated BEFORE any write, by the same gate a
            // primary route goes through: a typo must fail here, not at 3am when
            // the member actually degrades.
            fallbackSelection = await resolveMemberLlmSelection(ctx, captain, {
                provider: fallbackProvider,
                model: fallbackModel,
                reasoningEffort: fallbackEffort,
                defaultModel: config.memberModel,
                defaultProvider: config.memberLlmProvider,
            }, signal);
            await validateMemberLlmSelections(ctx, [fallbackSelection], signal);
        }
        // Captured before any mutation: the caller is told what was in effect
        // when the request arrived, not what it became.
        const previous = routeOf(member);
        const at = Date.now();
        /** @type {{ provider: string, model: string, reasoningEffort?: string } | undefined} */
        let selection;
        if (clearing) {
            // Validate before mutating, so a rejected clear leaves the record
            // untouched: what survives the override is the declared route.
            const declared = routeOf({
                ...member,
                routeOverride: undefined,
                fallbackActive: undefined,
                activeProvider: undefined,
                activeModel: undefined,
            });
            if (declared === undefined) {
                throw new Error(`agent-teams: member "${memberName}" has no declared provider/model to return to; set a route instead of clearing`);
            }
            delete member.routeOverride;
            // The same three fields the set branch clears: a degraded member has
            // to stop reporting a fallback that no longer applies, or routeOf
            // would keep returning the fallback branch after the revert.
            delete member.fallbackActive;
            delete member.activeProvider;
            delete member.activeModel;
            selection = selectionFromMember(member) ?? {
                provider: declared.provider,
                model: declared.model,
                ...effortPart(declared.reasoningEffort),
            };
        }
        else if (wantsPrimary) {
            selection = await resolveMemberLlmSelection(ctx, captain, {
                provider: request.provider,
                model: request.model,
                reasoningEffort: request.reasoningEffort,
                defaultModel: config.memberModel,
                defaultProvider: config.memberLlmProvider,
                fallback: config.fallback,
            }, signal);
            await validateMemberLlmSelections(ctx, [selection], signal);
            member.routeOverride = {
                provider: selection.provider,
                model: selection.model,
                ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort },
                source,
                at,
                ...request.by === undefined ? {} : { by: request.by },
            };
            // A captain-declared route replaces a degraded one. Leaving the fallback
            // record in place would keep routeOf returning the fallback branch, and
            // the requested route would appear to be ignored.
            delete member.fallbackActive;
            delete member.activeProvider;
            delete member.activeModel;
        }
        else if (!fallbackClearing && !wantsFallback) {
            throw new Error(`agent-teams: member "${memberName}" was not changed: pass provider/model, clear, fallback_provider with fallback_model, or fallback_clear`);
        }
        // A fallback-only change leaves the primary route exactly as it is, yet
        // the event, the audit row and the result still report the route now in
        // effect so a reader never has to infer "unchanged" from an empty field.
        if (selection === undefined) {
            selection = selectionFromMember(member) ?? (previous === undefined
                ? { provider: '', model: '' }
                : { provider: previous.provider, model: previous.model, ...effortPart(previous.reasoningEffort) });
        }
        // The fallback rides in the SAME durable write as the override: a crash
        // between two writes could leave an override that is new and a fallback
        // that is old, which is exactly the pair nobody can reason about later.
        if (wantsFallback) {
            member.fallback = {
                provider: fallbackSelection.provider,
                model: fallbackSelection.model,
                ...fallbackSelection.reasoningEffort === undefined ? {} : { reasoningEffort: fallbackSelection.reasoningEffort },
            };
        }
        else if (fallbackClearing) {
            delete member.fallback;
        }
        // Disk first, RAM second — the clear path keeps the same order: a crash
        // between the two must leave a record a cold resume replays.
        await writeTeam(stateRoot, team);
        // Switch RAM second. A member with no child session yet has no selection
        // bridge: spawnMember escalates the override when it starts the child.
        const switched = member.id === '' ? false : selections.setLiveRoute(member.id, modelSelection(selection));
        const applied = switched ? 'live-and-durable' : 'durable-only';
        // Two independent records: a session event (machine) and an append-only
        // workspace log (human / independent audit).
        appendTeamEvent(ctx, captainSessionOf(ctx, team.captainSessionId, captain.session), 'agent-teams/member-route-changed', {
            teamId: team.id,
            memberId: member.id,
            name: member.name,
            provider: selection.provider,
            model: selection.model,
            ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort },
            // Machine-readable marker: this change REMOVED an override instead of
            // installing one, so a reader cannot mistake the target route for a
            // captain-declared one.
            ...clearing ? { cleared: true } : {},
            // The fallback decision travels with the route change: a reader must
            // not have to diff team.json to learn a member now degrades elsewhere.
            ...wantsFallback ? { fallback: { provider: member.fallback.provider, model: member.fallback.model } } : {},
            ...fallbackClearing ? { fallbackCleared: true } : {},
            ...previous === undefined
                ? {}
                : {
                    previous: {
                        provider: previous.provider,
                        model: previous.model,
                        ...previous.reasoningEffort === undefined ? {} : { reasoningEffort: previous.reasoningEffort },
                    },
                },
            applied,
            source,
        });
        await appendRouteChangeAudit(ctx, workspace, {
            at,
            teamId: team.id,
            memberName: member.name,
            previous,
            route: { provider: selection.provider, model: selection.model, ...effortPart(selection.reasoningEffort) },
            // The target column renders "(cleared)" for this record; the restored
            // route stays visible in the event payload above and in team.json.
            ...clearing ? { cleared: true } : {},
            ...wantsFallback
                ? { fallback: { provider: member.fallback.provider, model: member.fallback.model, ...effortPart(member.fallback.reasoningEffort) } }
                : {},
            ...fallbackClearing ? { fallbackCleared: true } : {},
            applied,
            source,
            by: request.by,
        });
        return {
            team_id: team.id,
            member_id: member.id,
            member_name: member.name,
            name: member.name,
            provider: selection.provider,
            model: selection.model,
            ...selection.reasoningEffort === undefined ? {} : { reasoning_effort: selection.reasoningEffort },
            ...previous === undefined ? {} : { previous: { provider: previous.provider, model: previous.model, origin: previous.origin } },
            // A clear leaves the member on its declared route, so the origin is
            // 'declared' rather than 'override'; the flag says how it got there.
            ...clearing ? { cleared: true } : {},
            ...wantsFallback
                ? {
                    fallback: {
                        provider: member.fallback.provider,
                        model: member.fallback.model,
                        ...member.fallback.reasoningEffort === undefined ? {} : { reasoning_effort: member.fallback.reasoningEffort },
                    },
                }
                : {},
            ...fallbackClearing ? { fallback_cleared: true } : {},
            origin: clearing ? 'declared' : 'override',
            applied,
            source,
        };
    });
}
/**
 * Change the profile (role and/or execution prompt) of a member that already
 * exists, on a team that is already running.
 *
 * The ordering is the same one the route path uses, and it is load-bearing:
 * 1. Validate the request before reading the team, so a refused change never
 *    touches the record (nothing to roll back).
 * 2. Write team.json first — that durable record is what the member's NEXT
 *    activation reads.
 * 3. Update the in-process record only after the write landed.
 * 4. Never interrupt or restart a running member: the turn already in flight
 *    finishes on the prompt it started with, and the next activation picks the
 *    new one up.
 *
 * Fields are merged: a field the caller omits keeps its current value, so one
 * call cannot silently wipe the other half of the profile.
 * @param ctx - the plugin context (session events + logging).
 * @param config - member runtime config (state directory default).
 * @param captain - the live captain agent (the team owner).
 * @param stateDir - configured state directory.
 * @param teamId - the team that owns the member.
 * @param memberName - the member whose profile changes.
 * @param request - { role?, executionPrompt?, source?, by? } as requested.
 * @param signal - unused; kept so the tool and HTTP call sites match.
 * @returns the changed profile in snake_case for the tool result.
 */
export async function setMemberProfile(ctx, config, captain, stateDir, teamId, memberName, request, signal) {
    void signal;
    const workspace = captain.session.header.cwd ?? process.cwd();
    const stateRoot = join(workspace, stateDir);
    // Provenance first, exactly like setMemberRoute: an unknown source is refused
    // before the durable write and before the MEMBER-PROFILE.md row (BUG-026).
    const source = resolveProvenanceSource(request.source, `profile change for member "${memberName}"`);
    // A blank field is "not passed": trimming first means a call carrying one
    // blank half changes nothing, exactly like omitting it.
    const role = typeof request.role === 'string' ? request.role.trim() : '';
    const executionPrompt = typeof request.executionPrompt === 'string' ? request.executionPrompt.trim() : '';
    if (role === '' && executionPrompt === '') {
        throw new Error(`agent-teams: member "${memberName}" was not changed: pass role, execution_prompt, or both`);
    }
    // Caps are enforced as hard errors, never as silent truncation: a truncated
    // prompt would look applied while the member is told something else.
    if (role.length > MEMBER_ROLE_MAX) {
        throw new Error(`agent-teams: role for member "${memberName}" is ${role.length} characters after trimming; the cap is ${MEMBER_ROLE_MAX}`);
    }
    if (executionPrompt.length > MEMBER_EXECUTION_PROMPT_MAX) {
        throw new Error(`agent-teams: execution prompt for member "${memberName}" is ${executionPrompt.length} characters after trimming; the cap is ${MEMBER_EXECUTION_PROMPT_MAX}`);
    }
    return await withTeamLock(`team:${stateRoot}:${teamId}`, async () => {
        const team = await readTeam(stateRoot, teamId);
        if (team === undefined) {
            throw new Error(`agent-teams: team "${teamId}" was not found`);
        }
        // Same member lookup rule the route path uses: a removed member is not
        // addressable, and a stopping member is on its way out.
        const member = team.members.find(candidate => candidate.name === memberName && candidate.status !== 'removed');
        if (member === undefined) {
            throw new Error(`agent-teams: member "${memberName}" is not part of team "${teamId}"`);
        }
        if (member.stopping === true) {
            throw new Error(`agent-teams: member "${memberName}" is stopping; its profile cannot be changed`);
        }
        const at = Date.now();
        const previousRole = member.role;
        const previousExecutionPrompt = member.executionPrompt;
        const next = {
            ...member,
            ...role === '' ? {} : { role },
            ...executionPrompt === '' ? {} : { executionPrompt },
        };
        // Disk first: a crash right after this line leaves the durable record
        // already correct, and a cold resume replays it.
        await writeTeam(stateRoot, { ...team, members: team.members.map(candidate => (candidate === member ? next : candidate)) });
        // RAM second. A member that is mid-turn keeps the prompt it started
        // with: nothing here interrupts, restarts, or re-seeds the child.
        Object.assign(member, next);
        const changed = [...role === '' ? [] : ['role'], ...executionPrompt === '' ? [] : ['executionPrompt']];
        appendTeamEvent(ctx, captainSessionOf(ctx, team.captainSessionId, captain.session), 'agent-teams/member-profile-changed', {
            teamId: team.id,
            memberId: member.id,
            name: member.name,
            changed,
            ...role === '' ? {} : { role },
            ...executionPrompt === '' ? {} : { executionPromptLength: executionPrompt.length },
            source,
        });
        // One durable, human-readable row. Best effort by design: the change has
        // already landed in team.json, so a log failure must not fail the call.
        await appendMemberProfileAudit(ctx, workspace, {
            at,
            teamId: team.id,
            memberName: member.name,
            ...role === '' ? {} : { role, previousRole },
            ...executionPrompt === '' ? {} : { executionPrompt, previousExecutionPrompt },
            source,
            by: request.by,
        });
        return {
            team_id: team.id,
            member_id: member.id,
            member_name: member.name,
            ...role === '' ? {} : { role },
            ...executionPrompt === '' ? {} : { execution_prompt: executionPrompt },
            changed,
            // "previous" only for the half this call actually replaced: a value the
            // caller did not touch was never "before" anything.
            ...role === '' || previousRole === undefined ? {} : { previous_role: previousRole },
            ...executionPrompt === '' || previousExecutionPrompt === undefined ? {} : { previous_execution_prompt: previousExecutionPrompt },
            // Durable only, always: the live child is deliberately not touched.
            applied: 'durable-only',
            origin: 'profile',
            source,
        };
    });
}
/**
 * Deliver one message to a member as its next FIFO turn. Best effort: a
 * failure (member gone or not continuable) is logged and reported as `false`
 * so the caller can decide (mailbox delivery still happened).
 *
 * Any team sender can route through this helper: the captain is the direct
 * parent of every member, and the caller passes the captain's live Agent
 * (its own when the captain calls, the registry-resolved one when a member
 * sends) — mirroring the Claude Code mailbox model where the writer writes
 * the target's inbox and the target picks it up on its own.
 * @param ctx - the plugin context (injects `subagents`).
 * @param captain - the exact live captain agent (the member's direct parent).
 * @param childId - the member's durable child session id.
 * @param text - the message content.
 * @param signal - caller cancellation, forwarded to the delivery.
 * @returns whether the member inbox accepted the message.
 */
export async function deliverToMember(ctx, captain, childId, text, signal, mode = 'queue') {
    try {
        const content = [{ type: 'text', text }];
        if (mode === 'steer')
            await steerMemberPrompt(ctx.subagents, captain, brandedSessionId(childId), content, signal, ctx.agents.get(brandedSessionId(childId)));
        else
            await queueMemberPrompt(ctx.subagents, captain, brandedSessionId(childId), content, signal);
        return true;
    }
    catch (error) {
        ctx.logger.warn(`agent-teams: prompt delivery to member ${childId} failed: ${String(error)}`);
        return false;
    }
}
/**
 * Request cancellation of one live member's current turn. Best effort, fire
 * and return; the target may keep running until it observes the signal.
 * @param ctx - the plugin context (injects `subagents`).
 * @param captain - the exact live captain agent (the member's parent).
 * @param childId - the member's durable child session id.
 */
export function interruptMember(ctx, captain, childId) {
    try {
        ctx.subagents.interrupt(brandedSessionId(childId), { kind: 'ancestor', agent: captain });
    }
    catch (error) {
        ctx.logger.warn(`agent-teams: interrupt of member ${childId} failed: ${String(error)}`);
    }
}
/**
 * Install the missing per-child retirement boundary above Harness rc.6.
 *
 * Upstream `interrupt()` deliberately preserves continuable sessions and the
 * upstream seam exposes no targeted forget/retire method. The durable
 * AgentTeams index therefore rejects every inbox delivery before it can cold-resume a
 * retired member. Catalog rows deliberately remain discoverable: Harness rc.8
 * uses the direct-child catalog to authorize historical transcript reads and
 * `openSubagent()`, so filtering those rows would make an archived member's
 * persisted conversation inaccessible. Exact ids keep unrelated subagents
 * untouched while the delivery boundary still prevents further model turns.
 */
export function installRetiredMemberGuard(ctx, stateDir) {
    guardSubagentDelivery(ctx, async (parent, childId) => {
        const retired = await readRetiredMemberIds(join(parent.session.header.cwd ?? process.cwd(), stateDir));
        return retired.has(childId);
    });
}
/** Bound all descendant creation, including renamed tools and code-runtime calls. */
export function installMemberDelegationGuard(ctx, stateDir, maxDepth) {
    let active = true;
    const check = (parent) => {
        if (!active)
            return;
        let ancestor = parent;
        let depth = 1;
        while (ancestor !== undefined) {
            const descriptor = foldSubagentDescriptor(sessionOwnEvents(ancestor.session));
            if (descriptor?.label?.startsWith(MEMBER_LABEL_PREFIX)) {
                const identity = descriptor.label.slice(MEMBER_LABEL_PREFIX.length);
                const separator = identity.indexOf(':');
                let team;
                try {
                    team = readTeamSync(join(ancestor.session.header.cwd ?? process.cwd(), stateDir), identity.slice(0, separator));
                }
                catch (error) {
                    // Distinguish "team state unreadable" (e.g. a corrupt team.json) from
                    // the guarded rejections below: reject with an actionable message
                    // instead of leaking the raw parse error through subagents.start.
                    throw new Error(`AgentTeams delegation guard could not read the team state of "${identity.slice(0, separator)}" (its team.json may be corrupt or unreadable): ${String(error)}`);
                }
                const member = team?.members.find(item => item.id === ancestor.id && item.name === identity.slice(separator + 1));
                if (member === undefined || member.status === 'removed' || member.stopping === true || team?.halted === true)
                    throw new Error('AgentTeams member is no longer admitting delegated work');
                if (depth > maxDepth)
                    throw new Error(`AgentTeams member delegation limit (${maxDepth}) reached; report to the captain instead of spawning another agent`);
                return;
            }
            const parentId = ancestor.session.header.parentSession;
            ancestor = parentId === undefined ? undefined : ctx.agents.get(parentId);
            depth++;
        }
    };
    guardSubagentCreation(ctx, check);
    ctx.effect(() => () => { active = false; }, 'agent-teams: delegation guard lifetime');
}
/**
 * Snapshot the real driver activity for durable member ids.
 *
 * The team record is the membership authority, so this path intentionally no
 * longer depends on `listChildren()`'s versioned projection shape. Harness
 * rc.8 changed those rows to branded `SessionId` values plus residency-only
 * `activity`; neither is needed to answer whether the live Agent driver is
 * running, idle, or absent/ready.
 * @param ctx - the plugin context (injects `agents`).
 * @param memberIds - child ids restored from the durable team record.
 * @returns child id → live activity.
 */
export function memberActivity(ctx, memberIds) {
    const activity = new Map();
    for (const id of memberIds) {
        if (id === '')
            continue;
        const live = ctx.agents.get(brandedSessionId(id));
        activity.set(id, live === undefined ? 'ready' : live.status);
    }
    return activity;
}
