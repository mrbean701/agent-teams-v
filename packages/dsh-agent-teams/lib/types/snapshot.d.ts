/**
 * Team activity snapshot assembly for the activity panel.
 *
 * Server-side assembly mirrors the Claude Code desktop teamWatcher: read the
 * durable team files (the truth source) and enrich with live subagent
 * activity, so the panel always reflects the on-disk state even when a model
 * skipped a tool "ritual" (e.g. not calling update_task on completion).
 * @module dsh-agent-teams/snapshot
 */
import type { Context } from '@deepseek-ai/cordis';
import type { MemberStatus, TeamMemberLastFailure, TeamRouteOverride, TeamState } from './types.ts';
/** Visual task state for the activity panel. */
export type VisualTaskState = 'blocked' | 'open' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled';
/** One member row of the activity snapshot. */
export interface TeamActivityMember {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly provider: string;
    readonly model: string;
    readonly reasoningEffort: string;
    /**
     * `activeProvider`/`activeModel`: the recorded fallback target, if any.
     * A route revert (`clear: true`) deletes the pair, so a reverted member
     * reports empty strings here rather than a stale fallback.
     */
    readonly activeProvider: string;
    readonly activeModel: string;
    /** Whether the member is currently running on its fallback route; deleted by a route revert. */
    readonly fallbackActive: boolean;
    /**
     * A captain-declared route waiting to be applied (absent when none). A route
     * revert deletes `routeOverride` along with `fallbackActive`,
     * `activeProvider`, and `activeModel`, so this field is absent afterwards.
     */
    readonly routeOverride?: TeamRouteOverride;
    /** The route the member's next step will run on, as `provider/model`. */
    readonly nextRoute: string;
    /** Why that route is the one in force: fallback, override, active, or declared. */
    readonly routeOrigin: string;
    /** Durable provider-failure trace, when this member recorded one. */
    readonly lastFailure?: TeamMemberLastFailure;
    readonly executionPrompt: string;
    readonly status: MemberStatus;
    readonly activity: 'working' | 'idle' | 'unknown';
    readonly progress: number;
    readonly done: number;
    readonly total: number;
    readonly currentTask: string;
    readonly unread: number;
}
/** One task row of the activity snapshot. */
export interface TeamActivityTask {
    readonly id: string;
    readonly subject: string;
    readonly description: string;
    readonly status: string;
    readonly state: VisualTaskState;
    readonly assignee: string;
    readonly model: string;
    readonly dependencies: readonly string[];
    readonly depth: number;
    readonly kind?: string;
    readonly round?: number;
    readonly verdict?: string;
    /**
     * Set when this task's verdict or auto-generated work order no longer
     * describes the current bytes; the panel must not render a bare pass badge.
     */
    readonly verdictStale?: string;
    /** Durable last-write stamp; drives the finished-member ordering (issue #192). */
    readonly updatedAt: number;
}
/** One captain-inbox preview row. */
export interface TeamActivityMessage {
    readonly from: string;
    readonly content: string;
}
/**
 * The route a captain DECLARES, which is the route a member naming none inherits.
 * Mirrors `declaredCaptainRoute` in lib/snapshot.js, which reads the same source
 * the host resolves a member route from — `captain.session.requestHeader().config`
 * with `captain.options` as the fallback (see `resolveMemberLlmSelection` in
 * lib/members.js). Any other source would make the panel warn about a route the
 * host never uses.
 */
export interface TeamCaptainRoute {
    readonly provider: string;
    readonly model: string;
    /** Present only when the header declares one; absent (never `''`) otherwise. */
    readonly reasoningEffort?: string;
}
/** The full panel payload for one team. */
export interface TeamActivitySnapshot {
    readonly workspace: string;
    readonly teamId: string;
    readonly name: string;
    readonly description?: string;
    readonly captainSessionId: string;
    /**
     * The route the captain declares, so the add-member form can warn about a
     * route this host does not serve BEFORE the operator submits it.
     *
     * The key is ABSENT — never an empty object — when the captain is unknown
     * (an archived team, a detached session) or declares no complete route: an
     * empty object would read as "declares nothing" instead of "unknown".
     */
    readonly captainRoute?: TeamCaptainRoute;
    readonly phase: 'staged' | 'running';
    readonly planReviewState?: 'awaiting_review' | 'awaiting_feedback';
    readonly halted?: boolean;
    readonly members: readonly TeamActivityMember[];
    readonly tasks: readonly TeamActivityTask[];
    readonly messageCount: number;
    readonly captainInbox: readonly TeamActivityMessage[];
    /** Present when the snapshot could audit the workspace bytes. */
    readonly loopState?: string;
    readonly deliverable?: boolean;
    readonly delivery?: {
        readonly ok: boolean;
        readonly blockers: readonly string[];
        readonly warnings: readonly string[];
    };
}
/** Snapshot projection switches for live and archived teams. */
export interface TeamSnapshotOptions {
    /** Historic review must retain members that were marked removed at shutdown. */
    readonly includeRemoved?: boolean;
    /** Archived teams have no meaningful live activity after their sessions stop. */
    readonly historic?: boolean;
    /**
     * Absolute workspace path of the owning workspace. When present, the snapshot
     * audits the current bytes behind every recorded verdict, so the panel and
     * the model-facing status tool cannot report different delivery verdicts.
     */
    readonly workspacePath?: string;
}
/** Compact `provider/model` route for the activity panel, or just the model. */
export declare function memberModelRoute(member: {
    provider?: string;
    model?: string;
} | undefined): string;
/**
 * Assemble one team snapshot from its durable files plus live activity.
 * @param ctx - the plugin context (injects `subagents`, used for activity).
 * @param stateRoot - resolved absolute state root of the owning workspace.
 * @param workspace - display name of the owning workspace.
 * @param state - the durable team record.
 * @returns the panel snapshot.
 */
export declare function assembleTeamSnapshot(ctx: Context, stateRoot: string, workspace: string, state: TeamState, options?: TeamSnapshotOptions): Promise<TeamActivitySnapshot>;
/**
 * Collect every team under the given workspace state roots.
 * @param ctx - the plugin context.
 * @param roots - `{ workspace, stateRoot }` pairs (resolved absolute roots).
 * @returns the snapshots in stable order (workspace, then team id).
 */
export declare function collectTeamsActivity(ctx: Context, roots: readonly {
    workspace: string;
    stateRoot: string;
    workspacePath?: string;
}[]): Promise<TeamActivitySnapshot[]>;
/**
 * Collect every archived team under the given workspace state roots (the
 * `archive/` subdirectory of each state root). Used by the historic panel
 * path to restore full team detail after deletion.
 * @param ctx - the plugin context.
 * @param roots - `{ workspace, stateRoot }` pairs.
 * @returns the archived snapshots in stable order.
 */
export declare function collectArchivedTeamsActivity(ctx: Context, roots: readonly {
    workspace: string;
    stateRoot: string;
}[]): Promise<TeamActivitySnapshot[]>;
