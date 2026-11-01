/**
 * The `agent_teams_*` model-facing tools.
 *
 * The captain (the agent that created the team) orchestrates: members are
 * continuable subagents it spawns and wakes. Members share the same tools and
 * drive their own task state, mirroring the Claude Code AgentTeams flow:
 * create team → add members → create tasks with dependencies → claim/assign →
 * work → report → status → delete.
 * @module dsh-agent-teams/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type MemberToolPolicy } from './tool-policies.ts';
import type { ArtifactSnapshot } from './types.ts';
import { type TeamMember, type TeamState, type TeamTask } from './types.ts';
export { steerCaptainReport } from './members.ts';
/** Resolved plugin config consumed by the tools. */
export interface ToolsConfig {
    /** State directory name under the captain's workspace. */
    stateDir: string;
    /** Member subagent provider name. */
    memberProvider: string;
    /** Optional member model override. */
    memberModel?: string;
    /** Optional member LLM provider, paired with `memberModel` (issue #189). */
    memberLlmProvider?: string;
    /** Prompt injected into member personas and assignments. */
    executionPrompt?: string;
    /** Plugin fallback route. */
    fallback?: import('./profiles.ts').TeamModelFallbackConfig;
    /** Member delegation depth cap. */
    memberMaxDepth?: number;
    /** Team size cap for the automatic plan (members). */
    maxMembers: number;
    /** Larger cap used only by a manual roster addition; defaults to 12 and must be >= maxMembers. */
    maxManualMembers?: number;
    /** Named team profiles from the active DSH profile. */
    profiles: Record<string, import('./profiles.ts').TeamProfileConfig>;
    /** Owner-declared reusable member tool policies, keyed by policy id (#59). */
    toolPolicies: Record<string, MemberToolPolicy>;
}
/** Browser/UI mutations allowed while a plan is waiting for approval. */
export type StagedPlanMutation = {
    action: 'update_member';
    memberName: string;
    role?: string | null;
    provider: string;
    model: string;
    reasoningEffort?: string | null;
    executionPrompt?: string | null;
    /** Selected tool-policy id; an empty string clears it back to no policy. */
    toolPolicy?: string;
} | {
    action: 'update_task';
    taskId: string;
    subject: string;
    description?: string | null;
    assignee?: string | null;
    dependencies: string[];
} | {
    action: 'add_task';
    subject: string;
    description?: string | null;
    assignee?: string | null;
    dependencies: string[];
} | {
    action: 'remove_task';
    taskId: string;
} | {
    action: 'remove_member';
    memberName: string;
};
/** One manual roster addition, shared by the tool and the Web `/plan` add_member action. */
export interface MemberAddRequest {
    /** Roster name; unique inside the team and never the captain key. */
    name: string;
    /** Optional role label shown to the captain and the panel. */
    role?: string;
    /** Explicit LLM provider route; resolved like any other member selection. */
    provider?: string;
    /** Explicit model id. */
    model?: string;
    /** Explicit reasoning effort for that model. */
    reasoningEffort?: string;
    /** Member-level execution prompt. */
    executionPrompt?: string;
    /** Owner-declared tool-policy id for this member. */
    toolPolicy?: string;
    /** `immediate` starts the member in this turn when the team is running. */
    activation?: 'immediate' | 'on-task';
    /** Where the add came from, recorded in the audit event. */
    source?: 'captain' | 'http' | 'profile';
}
/** What a manual roster addition reports back to the tool and HTTP surfaces. */
export interface MemberAddResult {
    readonly member_name: string;
    readonly member_id: string;
    readonly provider: string;
    readonly model: string;
    readonly reasoning_effort?: string;
    readonly tool_policy?: string;
    readonly status: string;
    readonly phase: string;
    /** True only when the member was started in this turn. */
    readonly spawned: boolean;
}
/** One route change request, as the tools and the Web `/plan` action pass it down. */
export interface MemberRouteChangeInput {
    /** Team that owns the member. */
    teamId: string;
    /** Member to re-route; matched by name. */
    memberName: string;
    /** Requested provider. */
    provider: string;
    /** Requested model. */
    model: string;
    /** Requested reasoning effort; omitted means the target model default. */
    reasoningEffort?: string;
    /** Where the change came from. */
    source?: 'captain' | 'http' | 'profile';
    /** Optional actor label recorded with the change. */
    by?: string;
}
/** Runtime bridge shared by model-facing tools and the Web staging surface. */
export interface AgentTeamsRuntime {
    isPendingMember(agent: Agent): boolean;
    updateStagedPlan(captain: Agent, teamId: string, mutation: StagedPlanMutation, signal?: AbortSignal): Promise<TeamState>;
    updateStagedPlanBatch(captain: Agent, teamId: string, mutations: readonly StagedPlanMutation[], signal?: AbortSignal): Promise<TeamState>;
    approveStagedTeam(captain: Agent, teamId: string, signal?: AbortSignal): Promise<{
        teamId: string;
        members: number;
        tasks: number;
    }>;
    continueStagedPlanning(captain: Agent, teamId: string): Promise<{
        teamId: string;
        alreadyWaiting: boolean;
    }>;
    discardStagedTeam(captain: Agent, teamId: string): Promise<{
        teamId: string;
    }>;
    /** Add one roster row; a running, non-halted team starts it in this turn. */
    addMember(captain: Agent, request: MemberAddRequest, signal?: AbortSignal): Promise<MemberAddResult>;
    /** Change one member's route durably, and live when this process owns the child. */
    setMemberRoute(captain: Agent, request: MemberRouteChangeInput, signal?: AbortSignal): Promise<import('./members.ts').MemberRouteChangeResult>;
    /** The route a member would use next, read from the live registry. */
    currentMemberRoute(member: TeamMember): import('./members.ts').MemberCurrentRoute | undefined;
}
export declare function haltTeamWork(input: {
    ctx: Context;
    stateRoot: string;
    teamId: string;
    captain: Agent;
    signal?: AbortSignal;
}): Promise<{
    teamName: string;
    captainSessionId: string;
    cancelledTasks: number;
    alreadyHalted: boolean;
}>;
/** Web approval has no tool result in the captain's conversation. */
export declare function stagedPlanApprovedContext(teamName: string): string;
/** Context queued after the human rejects a staged plan. */
export declare function stagedPlanDiscardContext(teamName: string): string;
/** Model-facing continuation that turns the review UI back into a conversation. */
export declare function stagedPlanFeedbackContext(teamName: string): string;
/**
 * Register every `agent_teams_*` tool into the shared tools registry.
 * @param ctx - the plugin context (injects `tools`).
 * @param config - resolved tool config.
 */
export declare function registerAgentTeamsTools(ctx: Context, config: ToolsConfig): AgentTeamsRuntime;
export declare function applyQualityFollowUp(team: TeamState, closed: TeamTask, snapshotPaths?: (paths: readonly string[]) => ArtifactSnapshot, pathExists?: (path: string) => boolean): {
    created: TeamTask[];
    escalated: boolean;
    reason?: string;
    excludedFindings?: string[];
};
