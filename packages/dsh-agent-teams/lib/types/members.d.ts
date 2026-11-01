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
import type { Context } from '@deepseek-ai/cordis';
import { type Agent } from '@deepseek-ai/dsh-agent';
import type { Session } from '@deepseek-ai/dsh-session';
import { type SessionFormatBearer } from './harness-compat.ts';
import type { MemberToolFilter, MemberToolPolicy } from './tool-policies.ts';
import { type TeamMember, type TeamMemberLastFailure, type TeamState, type TeamTask } from './types.ts';
/** Persona snapshot of a profile protocol; the full text lives on team.json. */
export declare const PERSONA_PROTOCOL_MAX_CHARS = 400;
/** Runtime knobs for member spawning, resolved from plugin config. */
export interface MemberRuntimeConfig {
    /** Registered `ctx.subagents` provider name (must support continuable + persona). */
    provider: string;
    /** Child delegation depth cap (0 forbids delegation entirely). */
    maxDepth?: number;
    /** Plugin-wide execution prompt. */
    executionPrompt?: string;
    /** Plugin-wide fallback route. */
    fallback?: {
        provider: string;
        model: string;
    };
    /** Configured member model default, used when a route change names none. */
    memberModel?: string;
    /** Configured member provider, paired with `memberModel`. */
    memberLlmProvider?: string;
    /**
     * Owner-declared tool policies. A policy member relaxes only the built-in
     * deny names the owner did not declare, so the manual add needs this table
     * to compute the same relaxable set the scheduler path computes; absent, a
     * policy member fails loud instead.
     */
    toolPolicies?: Record<string, MemberToolPolicy>;
}
/** Durable provider/model/reasoning snapshot for one member. */
export interface MemberLlmSelection {
    /** Registered LLM provider route. */
    provider: string;
    /** Provider-owned model id. */
    model: string;
    /** Adapter-owned reasoning effort, absent when the target has no explicit/default effort. */
    reasoningEffort?: string;
    /** Configured second-choice route. */
    fallback?: {
        provider: string;
        model: string;
    };
}
/** Optional member-level route requested by the captain. */
export interface MemberLlmSelectionRequest {
    /** Explicit LLM provider route; requires an explicit model. */
    provider?: string;
    /** Explicit model id; otherwise the plugin default or captain model is used. */
    model?: string;
    /** Plugin-level member model default. */
    defaultModel?: string;
    /** Configured member LLM provider, paired with `defaultModel` (issue #189). */
    defaultProvider?: string;
    /** Explicit reasoning effort; "default" selects the target model's default effort. */
    reasoningEffort?: string;
    /** Configured fallback route. */
    fallback?: {
        provider: string;
        model: string;
    };
}
/** A composed member route plus where each half came from. */
export interface MemberRouteResolution {
    readonly provider: {
        readonly value: string;
        readonly source: 'request' | 'config' | 'captain';
    };
    readonly model: {
        readonly value: string;
        readonly source: 'request' | 'config' | 'captain';
    };
    /**
     * Whether the provider half was *derived* rather than named. Only a
     * model-only plugin default may have its owner looked up in the provider
     * catalogs; a provider or model the caller named is never re-pointed.
     */
    readonly derivedProvider: boolean;
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
export declare function composeMemberRoute(request: Pick<MemberLlmSelectionRequest, 'provider' | 'model' | 'defaultModel' | 'defaultProvider'>, captain: {
    readonly provider: string;
    readonly model: string;
}): MemberRouteResolution | undefined;
/** Process-local bridge between spawn admission and synchronous child setup. */
export interface MemberSelectionRuntime {
    /** Configured state directory, exposed so a manual start can build its persona. */
    readonly stateDir: string;
    /** Trusted fresh-child admission, before the durable member id is written. */
    isPendingMember(agent: Agent): boolean;
    /** Make one selection visible while Harness materializes the fresh child. */
    withPending<T>(parentSessionId: string, label: string, selection: MemberLlmSelection, operation: () => Promise<T>, setup?: TeamMember['runtimeSetup']): Promise<T>;
    /**
     * Move a member this process owns onto another route for its next step.
     * Only the next-step route is replaced; a request already authorized keeps
     * its route (the host reports the change itself).
     * @returns whether a live selection was found for this child id.
     */
    setLiveRoute(agentId: string, selection: MemberLlmSelection): boolean;
    /** The route a live member was last switched to, if this process owns it. */
    liveRoute(agentId: string): {
        provider: string;
        model: string;
        reasoningEffort?: string;
    } | undefined;
    /** Child session ids this process currently holds a live selection for. */
    liveChildIds(): readonly string[];
}
/** One member route plus where it came from (no live process state read). */
export interface MemberEffectiveRoute {
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort?: string;
    readonly origin: 'fallback' | 'override' | 'active' | 'declared';
}
/** The route a member is running on now, and whether it is a live switch. */
export interface MemberCurrentRoute {
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort?: string;
    readonly origin: 'live' | 'fallback' | 'override' | 'active' | 'declared';
    readonly live: boolean;
}
/**
 * Resolve a member's declared route. Precedence: an active fallback, then a
 * captain-declared override, then a recorded active route, then the route
 * captured at creation.
 * @param member - the durable member record, or `undefined`.
 * @returns the route and its origin, or `undefined` for a legacy member.
 */
export declare function routeOf(member: TeamMember | undefined): MemberEffectiveRoute | undefined;
/**
 * Build the model selection a spawn must use from ONE durable member row.
 *
 * Every path that starts a member (manual add, cold resume, scheduler dispatch)
 * resolves its route through here, so the precedence fallback > override >
 * active > declared lives only in {@link routeOf} and cannot drift between them.
 * @param member - the durable member record, or `undefined`.
 * @returns the request for {@link resolveMemberLlmSelection} — the effective route
 *   plus the durable fallback when no fallback is active — or `undefined` for a
 *   legacy member without a complete saved route.
 */
export declare function selectionFromMember(member: TeamMember | undefined): MemberLlmSelectionRequest | undefined;
/**
 * Resolve the route a member is running on now: the live switch when this
 * process owns its session, otherwise the durable declaration.
 * @param selections - the installed member selection runtime.
 * @param member - the durable member record.
 */
export declare function currentMemberRoute(selections: MemberSelectionRuntime, member: TeamMember): MemberCurrentRoute | undefined;
/** Optional member route requested for a live member. */
export interface MemberRouteChangeRequest {
    /**
     * Revert the member to its declared route instead of setting one: the durable
     * record loses `routeOverride`, `fallbackActive`, `activeProvider`, and
     * `activeModel`, and the result reports `origin: 'declared'`.
     * Mutually exclusive with `provider`, `model`, and `reasoningEffort`: a
     * request that combines clear with any of them is rejected, because clearing
     * needs no route to travel with. A member with no declared provider/model is
     * rejected too — there would be nothing to return to.
     */
    clear?: boolean;
    /** Explicit LLM provider route; requires `model` unless a configured default pairs it. */
    provider?: string;
    /** Explicit model id. */
    model?: string;
    /** Explicit reasoning effort; omitted means the target model's own default. */
    reasoningEffort?: string;
    /** Where the change came from; defaults to `captain`. */
    source?: 'captain' | 'http' | 'profile';
    /** Optional actor label recorded with the change. */
    by?: string;
}
/** Result of {@link setMemberRoute}, in the tool-facing snake_case shape. */
export interface MemberRouteChangeResult {
    readonly team_id: string;
    readonly member_id: string;
    readonly member_name: string;
    readonly name: string;
    readonly provider: string;
    readonly model: string;
    readonly reasoning_effort?: string;
    readonly previous?: {
        readonly provider: string;
        readonly model: string;
        readonly origin: string;
    };
    /**
     * Where the route now in force came from: `'declared'` after a revert
     * (`clear`), `'override'` after a set.
     */
    readonly origin: string;
    /** `true` only for a revert; `provider`/`model` then report the declared route. */
    readonly cleared?: boolean;
    readonly applied: 'live-and-durable' | 'durable-only';
    readonly source: string;
}
/**
 * Change one member's route durably, and immediately when this process owns the
 * member. The override never rewrites the member's descriptor route; it is
 * escalated into it at the next spawn.
 * @param ctx - the plugin context.
 * @param config - member runtime config (defaults for a half-specified route).
 * @param selections - the installed member selection runtime.
 * @param captain - the live captain agent that owns the team.
 * @param stateDir - configured state directory.
 * @param teamId - the team that owns the member.
 * @param memberName - the member to re-route.
 * @param request - the requested route and its provenance.
 * @param signal - cancellation signal for catalog validation.
 */
export declare function setMemberRoute(ctx: Context, config: MemberRuntimeConfig, selections: MemberSelectionRuntime, captain: Agent, stateDir: string, teamId: string, memberName: string, request: MemberRouteChangeRequest, signal?: AbortSignal): Promise<MemberRouteChangeResult>;
/**
 * Cap on a member's `role` after trimming, enforced by {@link setMemberProfile}
 * as a hard error — never as a silent truncation, which would leave the record
 * saying something the member was never told.
 * Value read from `lib/members.js:1219` (`export const MEMBER_ROLE_MAX = 200;`).
 */
export declare const MEMBER_ROLE_MAX: number;
/**
 * Cap on a member's `executionPrompt` after trimming, enforced by
 * {@link setMemberProfile} as a hard error — never as a silent truncation.
 * Value read from `lib/members.js:1221`
 * (`export const MEMBER_EXECUTION_PROMPT_MAX = 4000;`).
 */
export declare const MEMBER_EXECUTION_PROMPT_MAX: number;
/** One captain-driven member profile change: role, execution prompt, or both. */
export interface MemberProfileChangeRequest {
    /** New role; trimmed, and a blank value counts as "not passed". */
    readonly role?: string;
    /** New execution prompt; trimmed, and a blank value counts as "not passed". */
    readonly executionPrompt?: string;
    /** Where the change came from; defaults to `captain`. */
    readonly source?: 'captain' | 'http' | 'profile';
    /** Optional actor label recorded with the change. */
    readonly by?: string;
}
/** Result of {@link setMemberProfile}, in the tool-facing snake_case shape. */
export interface MemberProfileChangeResult {
    readonly team_id: string;
    readonly member_id: string;
    readonly member_name: string;
    /** Present only for the half this call replaced. */
    readonly role?: string;
    readonly execution_prompt?: string;
    /** The halves this call actually wrote: `role` and/or `executionPrompt`. */
    readonly changed: readonly string[];
    readonly previous_role?: string;
    readonly previous_execution_prompt?: string;
    /** Durable only, always: a live child keeps the prompt it started with. */
    readonly applied: 'durable-only';
    readonly origin: 'profile';
    readonly source: string;
}
/**
 * Change one member's role and/or execution prompt on a live, running team.
 *
 * Disk first, RAM second: `team.json` is written before the in-memory record is
 * updated, so a crash in between leaves the durable record already correct and a
 * cold resume replays it. The new prompt is only read the next time the member
 * starts: a running child is never interrupted, restarted, or re-seeded. A blank
 * field counts as "not passed", so a call costs only the half it names, and an
 * over-cap field is an error rather than a silent truncation. The change is
 * mirrored into one append-only row of the workspace member-profile log.
 * @param ctx - the plugin context (for the audit log's own logging).
 * @param config - member runtime config (accepted for call-site symmetry).
 * @param captain - the live captain agent that owns the team; its workspace holds the audit log.
 * @param stateDir - configured state directory.
 * @param teamId - the team that owns the member.
 * @param memberName - the member whose profile changes.
 * @param request - the requested role / execution prompt and its provenance.
 * @param signal - unused; kept so the tool and HTTP call sites match.
 */
export declare function setMemberProfile(ctx: Context, config: MemberRuntimeConfig, captain: Agent, stateDir: string, teamId: string, memberName: string, request: MemberProfileChangeRequest, signal?: AbortSignal): Promise<MemberProfileChangeResult>;
/**
 * Validate a resolved roster against every provider catalog before any child
 * session is created. Catalogs are advisory when empty (some adapters accept
 * dynamic model ids), but a non-empty catalog is authoritative enough to
 * catch a typo that would otherwise boot a child and fail on its first turn.
 */
export declare function validateMemberLlmSelections(ctx: Context, selections: readonly MemberLlmSelection[], signal?: AbortSignal): Promise<void>;
/**
 * Whether a request failure means "this route is dead, try the fallback".
 * The five legacy codes answer on their own; an INVALID_REQUEST does only when
 * its message matches a dead-route marker (model unavailable / model_not_found /
 * "does not exist" / "no such model"), because a malformed payload of ours also
 * fails as INVALID_REQUEST and must not move a healthy member off its route.
 * @param code - the failure code the provider reported.
 * @param message - the failure message, consulted only for INVALID_REQUEST.
 */
export declare function isFallbackFailureCode(code: string, message?: string): boolean;
/** Cap on the durable `lastFailure.message` recorded in team.json. */
export declare const MEMBER_FAILURE_MESSAGE_MAX = 300;
/**
 * Whether a member turn failure came from the provider rather than from the
 * member's own turn logic. Pure: no I/O, no clock.
 * @param failure - the adapter failure carried by the final `agent/error`.
 */
export declare function isProviderFailure(failure: {
    readonly code?: string;
    readonly message?: string;
} | undefined): boolean;
/**
 * Durable provider-failure trace for one member.
 * @param member - the durable member record, or `undefined`.
 * @param failure - the adapter failure carried by the final `agent/error`.
 * @param at - the recording timestamp (ms since epoch).
 * @returns the trace, or `undefined` when this failure is not a provider failure.
 */
export declare function providerFailureRecord(member: TeamMember | undefined, failure: {
    readonly code?: string;
    readonly message?: string;
}, at: number): TeamMemberLastFailure | undefined;
/** Pure state transition used by the request-error handler and TDD tests. */
export declare function selectFallbackRoute(current: {
    provider: string;
    model: string;
}, fallback: {
    provider: string;
    model: string;
} | undefined, failureCode: string, alreadySwitched: boolean, failureMessage?: string): {
    retry: boolean;
    switched: boolean;
    selection: {
        provider: string;
        model: string;
    };
};
/**
 * One automatic degradation to record: the route that just died, the fallback
 * that replaced it, and where the human-readable audit trail lives.
 */
export type MemberAutoFallbackRequest = {
    /** Absolute state root holding the team file: <workspace>/<stateDir>. */
    readonly stateRoot: string;
    readonly teamId: string;
    readonly memberName: string;
    /** The route that failed — the previous side of the audit row. */
    readonly previous: {
        readonly provider: string;
        readonly model: string;
        readonly reasoningEffort?: string;
    };
    /** The route the member keeps running on. */
    readonly fallback: {
        readonly provider: string;
        readonly model: string;
        readonly reasoningEffort?: string;
    };
    /** Workspace the audit log is written under. */
    readonly workspace: string;
    /** Session id of the child that degraded, rendered as auto:<id>. */
    readonly by?: string;
    /** Recording timestamp (ms since epoch); defaults to now. */
    readonly at?: number;
};
/**
 * Record one automatic degradation: the durable team.json write comes first,
 * then the same audit row the captain-driven path writes. The audit half is
 * best effort — a log failure is warned and swallowed, never thrown — so it can
 * never cost the retry the caller is about to authorize.
 * @param ctx - the plugin context (for the audit's own logging).
 * @param request - the degradation to record.
 * @returns whether a durable member record was actually written.
 */
export declare function recordAutoFallback(ctx: Context, request: MemberAutoFallbackRequest): Promise<boolean>;
/** Deliver a durable member report to the live captain at its next model step. */
export declare function steerCaptainReport(captain: Pick<Agent, 'steer'> & SessionFormatBearer, from: string, content: string, receipt?: string): boolean;
interface FailedMemberAttempt {
    readonly captainSessionId: string;
    readonly memberId: string;
    readonly task?: Pick<TeamTask, 'id' | 'attempt' | 'attemptId'>;
}
/** How a final member turn failure relates to the durable record. */
export type MemberFailureDisposition = 
/** A live observed attempt was failed and its task marked failed. */
'failed_attempt'
/** The work had already settled; only a durable captain note was added. */
 | 'noted_settled'
/** No record: stale generation, superseded attempt, retired member, or no team. */
 | 'ignored';
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
export declare function classifyMemberFailure(observed: FailedMemberAttempt, current: {
    readonly member?: Pick<TeamMember, 'id' | 'status'> | undefined;
    readonly task?: Pick<TeamTask, 'id' | 'attempt' | 'attemptId'> | undefined;
    /** The durable record of the task the observation referred to, settled or not. */
    readonly observedRecord?: Pick<TeamTask, 'id' | 'status' | 'subject'> | undefined;
}): MemberFailureDisposition;
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
export declare function settledTaskRecord(observed: Pick<TeamTask, 'id'> | undefined, tasks: readonly Pick<TeamTask, 'id' | 'status' | 'subject'>[]): Pick<TeamTask, 'id' | 'status' | 'subject'> | undefined;
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
export declare function memberFailureMessage(memberName: string, summary: string, disposition: MemberFailureDisposition, task: Pick<TeamTask, 'id' | 'subject'> | undefined, settledRecord: Pick<TeamTask, 'id' | 'status' | 'subject'> | undefined): string;
/** Record a final turn failure, never an intermediate request retry. */
export declare function failMemberOpenAttempt(ctx: Context, stateRoot: string, teamId: string, memberName: string, failure: {
    readonly code: string;
    readonly message: string;
}, fallbackSession: Session, observed: FailedMemberAttempt): Promise<boolean>;
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
export declare function resolveMemberLlmSelection(ctx: Context, captain: Agent, request: MemberLlmSelectionRequest, signal?: AbortSignal): Promise<MemberLlmSelection>;
/**
 * Install the member selection bridge for every fresh or cold-resumed
 * continuable child. Fresh creation reads the pending in-memory selection;
 * cold resume restores the same selection from the owning team's durable
 * record. Legacy members without a complete saved route retain Harness's
 * descriptor provider/model behavior.
 */
export declare function installMemberSelectionRuntime(ctx: Context, stateDir: string, onFailureSettled?: (workspace: string, teamId: string, memberName: string) => Promise<void>): MemberSelectionRuntime;
/**
 * The member's system prompt (persona), shadowing the deployment persona for
 * that child. Self-contained: it replaces the whole persona section.
 * Frozen at spawn: draft must already carry the Team goal and profile protocol.
 * @param team - the team the member joined.
 * @param member - the member record (name/role are read before spawning).
 * @param stateDir - configured state directory, so the member can locate the
 *   team files with its own file tools.
 */
export declare function memberPersona(team: TeamState, member: TeamMember, stateDir: string, executionPrompt?: string): string;
/**
 * The initial user message delivered when the member is created.
 * Counts non-terminal tasks already assigned to this member on the in-memory draft.
 * @param team - the team the member joined.
 * @param memberName - canonical member name used to count assigned pending work.
 */
export declare function memberWelcome(team: TeamState, memberName: string): string;
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
export declare function spawnMember(ctx: Context, config: MemberRuntimeConfig, selections: MemberSelectionRuntime, llmSelection: MemberLlmSelection, captain: Agent, team: TeamState, member: TeamMember, stateDir: string, signal: AbortSignal, initialPrompt?: string, resolvedFilter?: MemberToolFilter, relaxableDeny?: readonly string[]): Promise<void>;
/**
 * Start one manually added member inside the turn that added it.
 *
 * The caller owns the team lock and every durable write: this hook mutates
 * `member` in place (filling `id`, and escalating the route into
 * `provider`/`model` through `spawnMember`) and never writes `team.json`.
 * A thrown error is the caller's only failure signal.
 * @returns the child session id, or the existing one when the member was already running.
 */
export declare function activateMemberNow(ctx: Context, config: MemberRuntimeConfig, selections: MemberSelectionRuntime, captain: Agent, team: TeamState, member: TeamMember, resolvedFilter?: MemberToolFilter, initialPrompt?: string, signal?: AbortSignal): Promise<string>;
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
export declare function deliverToMember(ctx: Context, captain: Agent, childId: string, text: string, signal: AbortSignal, mode?: 'queue' | 'steer'): Promise<boolean>;
/**
 * Request cancellation of one live member's current turn. Best effort, fire
 * and return; the target may keep running until it observes the signal.
 * @param ctx - the plugin context (injects `subagents`).
 * @param captain - the exact live captain agent (the member's parent).
 * @param childId - the member's durable child session id.
 */
export declare function interruptMember(ctx: Context, captain: Agent, childId: string): void;
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
export declare function installRetiredMemberGuard(ctx: Context, stateDir: string): void;
/** Bound all descendant creation, including renamed tools and code-runtime calls. */
export declare function installMemberDelegationGuard(ctx: Context, stateDir: string, maxDepth: number): void;
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
export declare function memberActivity(ctx: Context, memberIds: readonly string[]): Map<string, 'running' | 'idle' | 'ready'>;
export {};
