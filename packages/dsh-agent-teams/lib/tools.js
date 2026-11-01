import { drainMemberChildren } from "./harness-compat.js";
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { join } from 'node:path';
import { appendTeamEvent, captainSessionOf } from "./events.js";
import { amendTaskContract, acknowledgeMailbox, markMailboxDelivered, discardMailboxMessages, appendMailbox, archiveTeamDir, beginTaskAttempt, CAPTAIN_KEY, createMessage, createTeamDir, findTeamByCaptain, findTeamByParticipant, cancelUnfinishedTask, invalidateTaskAttempt, readUnreadMailbox, readMailbox, recordRetiredMemberIds, releaseMailboxDelivery, readTeam, sanitizeKey, transitionError, unsatisfiedDependencies, withTeamLock, writeTeam, validateCreateTask, evaluateQualityCompletion, planQualityFollowUp, resumeTeamState, buildCoverageMatrix, canDeclareDelivery, describeQualityLoop, sanitizeReviewAcceptance, sanitizeReviewObjective, isValidFindingLine, normalizeBlankOptionalTaskFields, taskKindOf, } from "./state.js";
import { appendTaskEvidence } from "./quality-gates.js";
import { artifactDrift, bindReviewToRevision, isQualityKind, verdictScopePatterns, } from "./quality-gates.js";
import { auditTeamWorkspace } from "./workspace-audit.js";
import { readArtifactScope, snapshotWorkspacePaths, workspacePathExists } from "./artifacts.js";
import { agentTeamsSource, observedSessionFormatVersion, restrictableToolNames } from "./harness-compat.js";
import { memberSpawnRelaxableDeny, optionalToolPolicy, requireToolPolicy, resolveMemberToolFilter } from "./tool-policies.js";
import { deliverToMember, installRetiredMemberGuard, installMemberSelectionRuntime, installMemberDelegationGuard, memberActivity, memberWelcome, resolveMemberLlmSelection, spawnMember, steerCaptainReport, validateMemberLlmSelections, } from "./members.js";
import * as membersApi from './members.js';
import { TERMINAL_TASK_STATUSES } from "./types.js";
import { collectCompletedDependencyOutputs, formatDependencyOutputs, installTeamScheduler } from "./scheduler.js";
import { installMailboxAdmission, isCurrentMail, mailboxContent, mailboxPrompt, readCurrentMailbox } from "./mailbox.js";
import { resolveTeamProfile } from "./profiles.js";
import { forkLineageNote, leadIdentityOfAsync, nearestLiveLead, sessionLeadsTeamAsync } from "./lineage.js";
export { steerCaptainReport } from "./members.js";
/** The caller agent, or a loud failure for non-agent callers. */
function requireCaptain(exec) {
    if (!exec.agent) {
        throw new Error('agent_teams tools require a calling agent (exec.agent was undefined)');
    }
    return exec.agent;
}
/** The captain's workspace directory (team state root parent). */
function workspaceOf(agent) {
    return agent.session.header.cwd ?? process.cwd();
}
/** Resolved absolute state root. */
function stateRootOf(workspace, config) {
    return join(workspace, config.stateDir);
}
/** Process-local lock key scoped by workspace state root and team id. */
function teamLockKey(stateRoot, teamId) {
    return `team:${stateRoot}:${teamId}`;
}
/**
 * Bind a closing verdict to the revision it judged, using the snapshot taken
 * when its attempt started (if any) to notice that the workspace changed while
 * the gate was being formed. A verdict that ran over a moving workspace binds
 * the drift explicitly instead of claiming the current bytes.
 */
function bindClosingVerdict(workspace, team, task) {
    if (task.status !== 'completed')
        return;
    const kind = taskKindOf(task);
    if (kind !== 'review' && kind !== 'requirements' && kind !== 'verification')
        return;
    if ((kind === 'review' || kind === 'requirements') && task.verdict !== 'pass')
        return;
    const scope = verdictScopePatterns(team, task);
    if (scope.length === 0)
        return;
    const read = readArtifactScope(workspace, scope);
    const duringDrift = task.verdictStartSnapshot === undefined
        ? []
        : artifactDrift(task.verdictStartSnapshot.artifacts, read.artifacts);
    const bound = bindReviewToRevision(team, task, {
        artifacts: read.artifacts,
        gaps: read.gaps,
        scope,
        duringDrift,
    });
    task.reviewedTaskId = bound.reviewedTaskId;
    task.reviewedAttempt = bound.reviewedAttempt;
    task.reviewedArtifacts = bound.reviewedArtifacts;
    task.reviewedGaps = bound.reviewedGaps;
    task.reviewedScope = bound.reviewedScope;
    task.reviewedDuringDrift = bound.reviewedDuringDrift;
    task.verdictStartSnapshot = undefined;
}
/** Process-local lock key enforcing one active team per captain session. */
function captainLockKey(stateRoot, captainId) {
    return `captain:${stateRoot}:${captainId}`;
}
/** The team this captain currently leads, or a loud failure. */
async function requireCaptainTeam(ctx, workspace, config, captain) {
    const team = await findTeamByCaptain(stateRootOf(workspace, config), captain.id, await leadIdentityOfAsync(ctx, captain.session));
    if (team === undefined) {
        throw new Error(`you are not leading any team yet — call agent_teams_create first${forkLineageNote(captain.session)}`);
    }
    return team;
}
/** The team this captain or active member currently participates in. */
async function requireParticipantTeam(ctx, workspace, config, caller) {
    const team = await findTeamByParticipant(stateRootOf(workspace, config), caller.id, await leadIdentityOfAsync(ctx, caller.session));
    if (team === undefined) {
        throw new Error(`you do not lead or belong to any active team yet${forkLineageNote(caller.session)}`);
    }
    return team;
}
/** Re-derive a caller's role from fresh state while holding the team lock. */
async function participantIdentityOf(ctx, team, agentId) {
    if (await sessionLeadsTeamAsync(ctx, team, agentId))
        return { kind: 'captain', name: CAPTAIN_KEY };
    const member = team.members.find((candidate) => candidate.id === agentId && candidate.status !== 'removed');
    return member === undefined ? undefined : { kind: 'member', name: member.name };
}
/** Fresh state for a team that still exists; never falls back to stale lookup data. */
async function requireFreshTeam(stateRoot, teamId) {
    const fresh = await readTeam(stateRoot, teamId);
    if (fresh === undefined)
        throw new Error(`team "${teamId}" is no longer active`);
    return fresh;
}
/** Fresh state with captain authorization rechecked inside the lock. */
async function requireFreshCaptainTeam(ctx, stateRoot, teamId, captainId) {
    const fresh = await requireFreshTeam(stateRoot, teamId);
    if (!(await sessionLeadsTeamAsync(ctx, fresh, captainId))) {
        throw new Error(`only the captain of team "${fresh.name}" (session ${fresh.captainSessionId}) or one of its fork descendants may perform this operation`);
    }
    return fresh;
}
/** Fresh state and caller identity rechecked inside the lock. */
async function requireFreshParticipant(ctx, stateRoot, teamId, callerId) {
    const fresh = await requireFreshTeam(stateRoot, teamId);
    const identity = await participantIdentityOf(ctx, fresh, callerId);
    if (identity === undefined)
        throw new Error(`you are no longer an active participant in team "${fresh.name}"`);
    return { team: fresh, identity };
}
/** Look up one live (non-removed) member by display name. */
function requireMember(team, name) {
    const member = team.members.find((candidate) => candidate.name === name && candidate.status !== 'removed');
    if (member === undefined) {
        throw new Error(`no active member named "${name}" in team "${team.name}"`);
    }
    return member;
}
/** Look up one task by id. */
function requireTask(team, taskId) {
    const task = team.tasks.find((candidate) => candidate.id === taskId);
    if (task === undefined) {
        throw new Error(`no task "${taskId}" in team "${team.name}" — use agent_teams_status to list tasks`);
    }
    return task;
}
function requireStagedTeam(team) {
    if (team.phase !== 'staged') {
        throw new Error(`team "${team.name}" is already running; its plan can no longer be edited`);
    }
    if (team.halted === true)
        throw new Error(`team "${team.name}" is halted, not awaiting plan approval`);
}
function trimmedOptional(value) {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}
/** Whether one materialized plan member carries no roster content at all. */
function isEmptyPlanMember(member) {
    if (member === undefined || member === null)
        return true;
    if (typeof member !== 'object')
        return typeof member === 'string' && member.trim() === '';
    return Object.values(member).every(value => value === undefined || value === null || (typeof value === 'string' && value.trim() === ''));
}
/**
 * Some model gateways materialize optional object parameters instead of
 * omitting them: a call that only passed `profile` arrives carrying
 * `plan: { members: [], tasks: [] }`, or one placeholder member whose every
 * field is blank (issue #234). Such a plan carries no roster, so it must count
 * as an omitted plan — the same invariant issue #99 established for a blank
 * `profile` string (a materialized blank equals "not provided").
 * @param plan - the materialized inline plan argument.
 * @returns whether the plan carries no member content and no task at all.
 */
function isEmptyInlinePlan(plan) {
    const members = plan.members;
    const tasks = plan.tasks;
    const emptyMembers = !Array.isArray(members) || members.length === 0 || members.every(member => isEmptyPlanMember(member));
    const emptyTasks = !Array.isArray(tasks) || tasks.length === 0;
    return emptyMembers && emptyTasks;
}
/**
 * Resolve one member's selected tool policy into the persisted policy id and
 * the immutable effective filter (#59).
 *
 * An unknown id fails here — before the member is written and before any child
 * is created — so a typo can never persist a half-configured member or leave a
 * resumable orphan behind. A member without a policy resolves to `{}`: the
 * previous behavior and record shape stay untouched.
 * @param config - resolved plugin config (declared policies + depth cap).
 * @param captain - the live captain, whose registry view names the host tools.
 * @param policyId - the selected policy id, or undefined for no policy.
 * @returns the member fields to persist (`toolPolicy` + `toolFilter`), or `{}`.
 */
function memberToolSelection(config, captain, policyId) {
    if (policyId === undefined)
        return {};
    const policy = requireToolPolicy(config.toolPolicies, policyId);
    return {
        toolPolicy: policyId,
        toolFilter: resolveMemberToolFilter(policy, {
            maxDepth: config.memberMaxDepth,
            knownTools: restrictableToolNames(captain),
        }),
    };
}
/**
 * Deny names the lenient spawn retry may drop for one member.
 *
 * A member without a policy keeps the built-in #163/#164 recovery path. A
 * policy member may only relax built-in entries the owner did not declare
 * itself (`memberSpawnRelaxableDeny`), and a selected policy id this
 * deployment no longer declares relaxes nothing: the member then fails loud
 * instead of spawning under a different filter.
 * @param config - resolved plugin config.
 * @param member - the member being spawned.
 * @returns the relaxable deny names, or undefined for the legacy default.
 */
function memberRelaxableDeny(config, member) {
    if (member.toolPolicy === undefined)
        return undefined;
    return memberSpawnRelaxableDeny(optionalToolPolicy(config.toolPolicies, member.toolPolicy), true);
}
/** Validate references and cycles before a staged graph can be saved or run.
 *
 * `options.onlyTaskIds` narrows the per-task checks (subject / assignee /
 * dependency) to the batch that was just edited: a running team can only touch
 * pending tasks, so an unrelated task whose assignee was removed long ago must
 * not block every later edit (BUG-012). Cycle detection keeps walking the whole
 * graph, and omitting the option restores the full scan used by approval.
 */
function validateStagedGraph(team, requireRunnable, options = {}) {
    const members = team.members.filter((member) => member.status !== 'removed');
    if (requireRunnable && members.length === 0)
        throw new Error('add at least one member before approving the plan');
    if (requireRunnable && team.tasks.length === 0)
        throw new Error('add at least one task before approving the plan');
    const memberNames = new Set(members.map((member) => member.name));
    const taskIds = new Set(team.tasks.map((task) => task.id));
    const onlyTaskIds = options.onlyTaskIds === undefined ? undefined : new Set(options.onlyTaskIds);
    for (const task of team.tasks) {
        if (onlyTaskIds !== undefined && !onlyTaskIds.has(task.id))
            continue;
        if (task.subject.trim() === '')
            throw new Error(`task "${task.id}" must have a subject`);
        if (task.assignee !== undefined && task.assignee !== CAPTAIN_KEY && !memberNames.has(task.assignee)) {
            throw new Error(`task "${task.id}" assignee "${task.assignee}" is not an active member`);
        }
        for (const dependency of task.dependencies) {
            if (dependency === task.id)
                throw new Error(`task "${task.id}" cannot depend on itself`);
            if (!taskIds.has(dependency))
                throw new Error(`task "${task.id}" depends on unknown task "${dependency}"`);
        }
    }
    const visiting = new Set();
    const visited = new Set();
    const byId = new Map(team.tasks.map((task) => [task.id, task]));
    const visit = (taskId) => {
        if (visiting.has(taskId))
            throw new Error(`task dependency graph contains a cycle at "${taskId}"`);
        if (visited.has(taskId))
            return;
        visiting.add(taskId);
        for (const dependency of byId.get(taskId)?.dependencies ?? [])
            visit(dependency);
        visiting.delete(taskId);
        visited.add(taskId);
    };
    for (const task of team.tasks)
        visit(task.id);
}
function memberOpenTask(team, memberName, exceptTaskId) {
    return team.tasks.find(task => task.id !== exceptTaskId
        && task.assignee === memberName
        && (task.status === 'claimed' || task.status === 'in_progress'));
}
function taskDetails(team, task) {
    return [task.subject, task.description ?? '',
        `Kind: ${task.kind ?? 'work'}`,
        `Objective: ${task.objective ?? ''}`,
        `In scope: ${(task.inScope ?? []).join(', ')}; Out of scope: ${(task.outOfScope ?? []).join(', ')}`,
        `Acceptance: ${(task.acceptance ?? []).join('; ')}`,
        `Verify: ${(task.verify ?? []).join('; ')}`,
        `Dependency results:\n${formatDependencyOutputs(collectCompletedDependencyOutputs(team.tasks, task.id))}`,
    ].join('\n');
}
/** Captain work is immediate, not a durable scheduler lane: allow one unfinished takeover at a time. */
function captainOpenTask(team, exceptTaskId) {
    return team.tasks.find(task => task.id !== exceptTaskId
        && task.assignee === CAPTAIN_KEY
        && !TERMINAL_TASK_STATUSES.includes(task.status));
}
/** Stop every currently-resident member activation for one halted team.
 *
 * Interrupt requests only cancel the member's current model turn and retain its
 * activation. Draining the selected direct children is the stronger lifecycle
 * boundary: it waits for the activation handles to release, so a child cannot
 * keep executing after the captain-chat Stop control has reported success.
 */
/**
 * The live Agent the host admits member operations from.
 *
 * Harness continuable delivery is authorized against the member's durable
 * direct parent (`subagents.authorizeLineage`), which is the session that
 * spawned it — the team's recorded captain. A captain acting from its own fork
 * therefore commands members *through* that session:
 *
 * - while the recorded captain is resident, its Agent is used directly;
 * - while it is cold, this resolves it through the public session controller
 *   (`workspaceRegistry.create` + `sessionController.create` with the existing
 *   session id — attach/resume only: no prompt, no model request, and the
 *   durable `captainSessionId` is never rewritten);
 * - when the composition exposes neither service, or the resume fails, the
 *   operation fails with an explicit bounded error instead of migrating team
 *   ownership to a session the host would reject at delivery time.
 *
 * @param ctx - the plugin context (injects `agents`).
 * @param team - current team state.
 * @param caller - the captain-side session performing the operation.
 * @returns the caller itself, or the live recorded captain session.
 */
async function memberOperationParent(ctx, team, caller) {
    if (caller.id === team.captainSessionId)
        return caller;
    const resident = ctx.agents.get(team.captainSessionId);
    if (resident !== undefined)
        return resident;
    const resumed = await resumeLeadAnchor(ctx, team, caller);
    if (resumed !== undefined)
        return resumed;
    throw new Error(`member operations require the live captain session ${team.captainSessionId} that owns team "${team.name}"; this session is its fork and ${resumeUnavailableReason(ctx, team)}`);
}
/**
 * Best-effort live anchor for scheduler calls: the recorded captain when
 * resident, the resumed one when this composition can attach it, and
 * `undefined` otherwise (the scheduler then keeps its existing
 * registry-only behavior). Never throws, so mutating tools stay usable on
 * compositions without a session controller.
 * @param ctx - the plugin context (injects `agents`).
 * @param team - the team whose recorded captain is the delivery parent.
 * @param caller - the captain-side session performing the operation.
 * @returns the anchor agent when one is live, else undefined.
 */
async function liveLeadAnchorAgent(ctx, team, caller) {
    if (caller.id === team.captainSessionId)
        return caller;
    const resident = ctx.agents.get(team.captainSessionId);
    if (resident !== undefined)
        return resident;
    return resumeLeadAnchor(ctx, team, caller);
}
/** Why the recorded captain could not be resumed, for one bounded error message. */
function resumeUnavailableReason(ctx, team) {
    const services = optionalTeamServices(ctx);
    if (services.controller === undefined || services.registry === undefined) {
        return 'this composition exposes no session controller to resume it, so add_member, member delivery and member drain are unavailable from the fork';
    }
    return `resuming it through the session controller failed (its workspace is "${team.name}"'s workspace)`;
}
/** Public optional services used only to attach the recorded captain session. */
function optionalTeamServices(ctx) {
    const get = ctx.get;
    if (typeof get !== 'function')
        return {};
    const read = (name) => {
        try {
            return get.call(ctx, name);
        }
        catch {
            return undefined;
        }
    };
    return {
        controller: read('sessionController'),
        registry: read('workspaceRegistry'),
    };
}
/**
 * Attach the team's recorded captain session in this process without sending a
 * prompt: the Harness controller's create-with-existing-id path resumes the
 * session and leaves every durable field (including `captainSessionId`)
 * untouched.
 * @returns the resumed Agent, or undefined when this composition cannot resume it.
 */
async function resumeLeadAnchor(ctx, team, caller) {
    const { controller, registry } = optionalTeamServices(ctx);
    if (controller?.create === undefined || registry?.create === undefined)
        return undefined;
    const cwd = caller.session.header.cwd ?? process.cwd();
    try {
        const workspace = await registry.create(cwd, cwd);
        await controller.create({ sessionId: team.captainSessionId, workspaceId: workspace.id, agentPreset: 'standard' });
        return ctx.agents.get(team.captainSessionId);
    }
    catch (error) {
        ctx.logger.warn(`agent-teams: could not resume the recorded captain session ${team.captainSessionId}: ${String(error)}`);
        return undefined;
    }
}
async function stopTeamMemberActivations(ctx, captain, members, signal) {
    const memberIds = members.filter(member => member.id !== '').map(member => member.id);
    if (memberIds.length === 0)
        return;
    // Every supported exact host has targeted recursive drain. Unlike interrupt,
    // it closes admission and clears queued work before awaiting descendants.
    signal?.throwIfAborted();
    await drainMemberChildren(ctx.subagents, captain, memberIds);
}
export async function haltTeamWork(input) {
    const halted = await withTeamLock(teamLockKey(input.stateRoot, input.teamId), async () => {
        const fresh = await requireFreshCaptainTeam(input.ctx, input.stateRoot, input.teamId, input.captain.id);
        if (fresh.halted === true) {
            return {
                teamName: fresh.name,
                captainSessionId: fresh.captainSessionId,
                cancelledTasks: fresh.tasks.filter((task) => task.status === 'cancelled').length,
                alreadyHalted: true,
                members: fresh.members.filter((member) => member.id !== '' && member.status !== 'removed').map((member) => ({ ...member })),
            };
        }
        const now = Date.now();
        let cancelledTasks = 0;
        for (const task of fresh.tasks) {
            if (TERMINAL_TASK_STATUSES.includes(task.status))
                continue;
            cancelUnfinishedTask(task, 'Stopped from the captain chat.');
            cancelledTasks += 1;
        }
        for (const member of fresh.members) {
            if (member.status === 'removed')
                continue;
            member.status = 'idle';
        }
        fresh.halted = true;
        fresh.haltedAt = now;
        await writeTeam(input.stateRoot, fresh);
        appendTeamEvent(input.ctx, captainSessionOf(input.ctx, fresh.captainSessionId, input.captain.session), 'agent-teams/team-halted', {
            teamId: fresh.id,
            cancelledTasks,
        });
        return {
            teamName: fresh.name,
            captainSessionId: fresh.captainSessionId,
            cancelledTasks,
            alreadyHalted: false,
            members: fresh.members.filter((member) => member.id !== '' && member.status !== 'removed').map((member) => ({ ...member })),
        };
    });
    // Persist the stop boundary first, then abort the Captain before draining
    // children. Otherwise its current model turn can observe `halted`, call
    // resume, and race the still-running HTTP stop request.
    input.captain.cancel({ kind: 'user' }, { keepInbox: true });
    // Members are children of the recorded captain session, so the parent-bound
    // drain must run as that session when a fork requested the stop.
    const haltAnchor = input.captain.id === halted.captainSessionId
        ? input.captain
        : input.ctx.agents.get(halted.captainSessionId);
    if (haltAnchor === undefined) {
        input.ctx.logger.warn(`agent-teams: captain session ${halted.captainSessionId} is not live; member activations of "${halted.teamName}" were not drained from this session`);
    }
    else {
        await stopTeamMemberActivations(input.ctx, haltAnchor, halted.members, input.signal);
    }
    // Interrupting a child emits a trailing subagent-settled notification. That
    // notification can start a fresh Captain turn after the first cancellation,
    // so close the stop boundary again once every child activation has drained.
    // Queued user input is preserved both times; only runtime-generated work is
    // prevented from silently resuming the halted team.
    input.captain.cancel({ kind: 'user' }, { keepInbox: true });
    return {
        teamName: halted.teamName,
        captainSessionId: halted.captainSessionId,
        cancelledTasks: halted.cancelledTasks,
        alreadyHalted: halted.alreadyHalted,
    };
}
/** Web approval has no tool result in the captain's conversation. */
export function stagedPlanApprovedContext(teamName) {
    return [
        `The user approved the staged AgentTeams plan "${teamName}" from the pre-run review UI.`,
        'Approval has committed; the scheduler owns dispatch of the approved team. Do not approve again, recreate the roster, or send messages merely to start assigned tasks.',
        'Acknowledge the approval and handle any reports or user work already pending. Yield only when waiting for members is the remaining action. Their reports will wake you automatically; do not busy-poll status or keep a turn running just to wait.',
        'On a report, inspect the result and coordinate the next necessary action. If work has since been halted, respect that state and resume only on an explicit user request.',
    ].join('\n');
}
/** Context queued after the human rejects a staged plan. */
export function stagedPlanDiscardContext(teamName) {
    return [
        `The user discarded the staged AgentTeams plan "${teamName}" from the pre-run review UI.`,
        'That decision is final for this draft: it has been archived, no members were created, and no tasks may run.',
        'Do not call agent_teams_create, agent_teams_approve, or recreate a replacement team merely because the old team is no longer active.',
        'Wait for a later explicit user request. If the next user message is unrelated to AgentTeams, answer it normally and do not start a team.',
    ].join('\n');
}
/** Model-facing continuation that turns the review UI back into a conversation. */
export function stagedPlanFeedbackContext(teamName) {
    return [
        `The user selected "Return to chat and revise" for the staged AgentTeams plan "${teamName}".`,
        'The existing staged plan is still the only draft. Do not create a replacement team, approve it, spawn members, edit the plan, or start work in this turn.',
        'Ask the user one concise, concrete question about what they want changed, then stop and wait for their answer.',
        'After the user answers, revise this same staged roster and DAG with one atomic agent_teams_edit_plan call, summarize the changes, and ask the user to review the updated plan again.',
    ].join('\n');
}
/**
 * Register every `agent_teams_*` tool into the shared tools registry.
 * @param ctx - the plugin context (injects `tools`).
 * @param config - resolved tool config.
 */
export function registerAgentTeamsTools(ctx, config) {
    installRetiredMemberGuard(ctx, config.stateDir);
    installMemberDelegationGuard(ctx, config.stateDir, config.memberMaxDepth ?? 0);
    installMailboxAdmission(ctx, config.stateDir);
    const scheduler = installTeamScheduler(ctx, { stateDir: config.stateDir, executionPrompt: config.executionPrompt, dispatch: dispatchMember });
    // addMemberNow lives at module scope because the tool and the HTTP /plan action share
    // it, so the scheduler handle travels in as an argument instead of a closure.
    const kickMember = (workspace, teamId, memberName, anchor) => scheduler.kickMember(workspace, teamId, memberName, anchor);
    async function dispatchMember(captain, teamId, memberName, text, signal, mode, attemptId) {
        const root = stateRootOf(workspaceOf(captain), config);
        // Record why a member never started. The scheduler treats a failed dispatch as
        // "not now" and retries, so without this the captain only ever sees an
        // unexplained `unspawned` member and no diagnostic reaches any surface.
        const recordSpawnError = async (reason) => {
            try {
                await withTeamLock(teamLockKey(root, teamId), async () => {
                    const fresh = await requireFreshCaptainTeam(ctx, root, teamId, captain.id);
                    const failed = fresh.members.find(item => item.name === memberName && item.status !== 'removed');
                    if (failed === undefined || failed.id !== '')
                        return;
                    failed.spawnError = reason;
                    await writeTeam(root, fresh);
                });
            }
            catch (error) {
                ctx.logger.warn(`agent-teams: could not record the member start failure for ${memberName}: ${String(error)}`);
            }
        };
        let orphan;
        try {
            return await withTeamLock(teamLockKey(root, teamId), async () => {
                const team = await readTeam(root, teamId);
                if (team === undefined || !(await sessionLeadsTeamAsync(ctx, team, captain.id)) || team.halted === true || team.phase === 'staged')
                    return false;
                const member = team.members.find(item => item.name === memberName && item.status !== 'removed');
                if (member === undefined || member.stopping === true || team.tasks.some(task => task.reassigning === true && task.assignee === memberName))
                    return false;
                if (attemptId !== undefined && !team.tasks.some(task => task.attemptId === attemptId && task.assignee === memberName && (task.status === 'claimed' || task.status === 'in_progress')))
                    return false;
                if (member.id !== '')
                    return deliverToMember(ctx, captain, member.id, text, signal, mode);
                // A member that has never started must spawn on the route its durable
                // row resolves to — the same call activateMemberNow makes — because
                // routeOf() is the only place the precedence fallback > override >
                // active > declared lives. Reading provider/model directly here ran
                // the child on the declared route and let the spawn escalation
                // overwrite provider/model with it, so a migrated routeOverride was
                // dropped without ever taking effect (t86).
                const declaredRoute = membersApi.selectionFromMember(member) ?? {
                    provider: member.provider,
                    model: member.model,
                    ...member.reasoningEffort === undefined || member.reasoningEffort === ''
                        ? {}
                        : { reasoningEffort: member.reasoningEffort },
                };
                const selection = await resolveMemberLlmSelection(ctx, captain, {
                    provider: declaredRoute.provider,
                    model: declaredRoute.model,
                    reasoningEffort: declaredRoute.reasoningEffort,
                    defaultModel: config.memberModel,
                    defaultProvider: config.memberLlmProvider,
                    fallback: declaredRoute.fallback ?? member.fallback ?? config.fallback,
                }, signal);
                await spawnMember(ctx, memberRuntime(config), memberSelections, selection, captain, team, member, config.stateDir, signal, text, member.toolFilter, memberRelaxableDeny(config, member));
                orphan = { ...member };
                delete member.spawnError;
                await writeTeam(root, team);
                orphan = undefined;
                return true;
            });
        }
        catch (error) {
            if (orphan !== undefined) {
                await recordRetiredMemberIds(root, [orphan.id]);
                await stopTeamMemberActivations(ctx, captain, [orphan]);
            }
            // The stack carries the failing frame; the message alone rarely does.
            let reason = String(error);
            if (error instanceof Error && typeof error.stack === 'string' && error.stack !== '')
                reason = error.stack;
            ctx.logger.warn(`agent-teams: member dispatch failed for ${memberName}: ${String(error)}`);
            await recordSpawnError(reason);
            return false;
        }
    }
    const updatePlanBatch = async (captain, teamId, mutations, signal, allowPendingEdits = false) => {
        if (mutations.length === 0)
            throw new Error('at least one staged plan operation is required');
        const workspace = workspaceOf(captain);
        const stateRoot = stateRootOf(workspace, config);
        return withTeamLock(teamLockKey(stateRoot, teamId), async () => {
            const fresh = await requireFreshCaptainTeam(ctx, stateRoot, teamId, captain.id);
            const staged = fresh.phase === 'staged';
            if (!staged && !allowPendingEdits)
                requireStagedTeam(fresh);
            if (fresh.halted === true)
                throw new Error('team is halted; resume before editing tasks');
            if (!staged && mutations.some(mutation => mutation.action !== 'update_task')) {
                throw new Error('a running team only permits update_task edits to pending, never-started tasks; roster and removal edits require a staged plan');
            }
            // Task ids this batch actually touched; a running team scopes the
            // reference validation to them (see validateStagedGraph options).
            const editedTaskIds = new Set();
            for (const mutation of mutations) {
                if (mutation.action === 'update_member') {
                    const member = requireMember(fresh, mutation.memberName);
                    if (member.id !== '')
                        throw new Error(`staged member "${member.name}" was already spawned`);
                    const selection = await resolveMemberLlmSelection(ctx, captain, {
                        provider: mutation.provider,
                        model: mutation.model,
                        reasoningEffort: trimmedOptional(mutation.reasoningEffort),
                        fallback: member.fallback,
                    }, signal);
                    member.role = trimmedOptional(mutation.role);
                    member.provider = selection.provider;
                    member.model = selection.model;
                    member.reasoningEffort = selection.reasoningEffort;
                    member.executionPrompt = trimmedOptional(mutation.executionPrompt);
                    // The roster editor replaces route/prompt fields; the tool policy is
                    // only touched when the mutation names one, so a plan revision cannot
                    // silently widen a member's tool set.
                    if (mutation.toolPolicy !== undefined) {
                        const selected = memberToolSelection(config, captain, trimmedOptional(mutation.toolPolicy));
                        member.toolPolicy = selected.toolPolicy;
                        member.toolFilter = selected.toolFilter;
                    }
                }
                else if (mutation.action === 'update_task') {
                    const task = requireTask(fresh, mutation.taskId);
                    if (task.status !== 'pending' || (task.attempt ?? 0) !== 0 || task.reassigning === true) {
                        throw new Error(`task "${task.id}" has already started and cannot be edited`);
                    }
                    if (!staged && mutation.assignee === CAPTAIN_KEY)
                        throw new Error('use reassign_task for captain takeover');
                    const subject = mutation.subject.trim();
                    if (subject === '')
                        throw new Error('task subject must not be empty');
                    task.subject = subject;
                    task.description = trimmedOptional(mutation.description);
                    task.assignee = trimmedOptional(mutation.assignee);
                    task.dependencies = [...new Set(mutation.dependencies.map((item) => item.trim()).filter(Boolean))];
                    task.updatedAt = Date.now();
                    editedTaskIds.add(task.id);
                }
                else if (mutation.action === 'add_task') {
                    const subject = mutation.subject.trim();
                    if (subject === '')
                        throw new Error('task subject must not be empty');
                    fresh.taskSeq += 1;
                    const now = Date.now();
                    const createdTaskId = `t${fresh.taskSeq}`;
                    editedTaskIds.add(createdTaskId);
                    fresh.tasks.push({
                        id: createdTaskId,
                        subject,
                        description: trimmedOptional(mutation.description),
                        status: 'pending',
                        assignee: trimmedOptional(mutation.assignee),
                        dependencies: [...new Set(mutation.dependencies.map((item) => item.trim()).filter(Boolean))],
                        attempt: 0,
                        kind: 'work',
                        createdAt: now,
                        updatedAt: now,
                    });
                }
                else if (mutation.action === 'remove_task') {
                    const task = requireTask(fresh, mutation.taskId);
                    const dependent = fresh.tasks.find((candidate) => candidate.dependencies.includes(task.id));
                    if (dependent !== undefined) {
                        throw new Error(`task "${task.id}" is still required by "${dependent.id}"; update that dependency before removing the task`);
                    }
                    fresh.tasks = fresh.tasks.filter((candidate) => candidate.id !== task.id);
                }
                else {
                    const member = requireMember(fresh, mutation.memberName);
                    if (member.id !== '')
                        throw new Error(`staged member "${member.name}" was already spawned`);
                    const owned = fresh.tasks.filter((task) => task.assignee === member.name);
                    if (owned.length > 0) {
                        throw new Error(`member "${member.name}" still owns planned tasks: ${owned.map((task) => task.id).join(', ')}; update or remove those tasks first`);
                    }
                    fresh.members = fresh.members.filter((candidate) => candidate !== member);
                }
            }
            // Staged plans keep the whole-graph scan; a running team validates only the
            // tasks this batch edited, because the rest cannot be changed from here.
            validateStagedGraph(fresh, false, staged ? {} : { onlyTaskIds: editedTaskIds });
            if (!staged) {
                for (const mutation of mutations) {
                    if (mutation.action !== 'update_task')
                        continue;
                    const task = requireTask(fresh, mutation.taskId);
                    const validation = validateCreateTask({ ...fresh, tasks: fresh.tasks.filter(item => item.id !== task.id) }, task);
                    if (!validation.ok)
                        throw new Error(validation.error ?? 'edited task violates the quality contract');
                }
            }
            else
                fresh.planReviewState = 'awaiting_review';
            signal?.throwIfAborted();
            await writeTeam(stateRoot, fresh);
            return fresh;
        });
    };
    // Browser review controls retain their staged-only contract.
    const updateStagedPlanBatch = (captain, teamId, mutations, signal) => (updatePlanBatch(captain, teamId, mutations, signal));
    const updateStagedPlan = async (captain, teamId, mutation, signal) => (updateStagedPlanBatch(captain, teamId, [mutation], signal));
    const approveStagedTeam = async (captain, teamId, signal) => {
        const workspace = workspaceOf(captain);
        const stateRoot = stateRootOf(workspace, config);
        const runSignal = signal ?? new AbortController().signal;
        const approved = await withTeamLock(teamLockKey(stateRoot, teamId), async () => {
            const fresh = await requireFreshCaptainTeam(ctx, stateRoot, teamId, captain.id);
            requireStagedTeam(fresh);
            // A staged removal has no child session to retain in history. Drop those
            // placeholders before transitioning to the stricter running shape.
            fresh.members = fresh.members.filter((member) => member.status !== 'removed');
            validateStagedGraph(fresh, true);
            const selections = [];
            for (const member of fresh.members) {
                // Resolve the route the member will actually run on, exactly like a spawn
                // does. selectionFromMember() carries the one precedence chain
                // (fallback > routeOverride > active > declared); reading the spine here
                // would validate and persist a route the member never runs on, and would
                // reject a valid override only because its DECLARED route is outside the
                // catalog.
                const declaredRoute = membersApi.selectionFromMember(member) ?? {
                    provider: member.provider,
                    model: member.model,
                    ...member.reasoningEffort === undefined || member.reasoningEffort === ''
                        ? {}
                        : { reasoningEffort: member.reasoningEffort },
                };
                const selection = await resolveMemberLlmSelection(ctx, captain, {
                    provider: declaredRoute.provider,
                    model: declaredRoute.model,
                    reasoningEffort: declaredRoute.reasoningEffort,
                    fallback: declaredRoute.fallback ?? member.fallback ?? config.fallback,
                }, runSignal);
                selections.push(selection);
                // Keep the spine escalation: the row records the route the child will start
                // on. Do NOT drop routeOverride here — the spawn escalation does that once
                // the child really runs, so a failed first activation cannot lose the
                // operator's route.
                member.provider = selection.provider;
                member.model = selection.model;
                member.reasoningEffort = selection.reasoningEffort;
            }
            await validateMemberLlmSelections(ctx, selections, runSignal);
            fresh.phase = 'running';
            delete fresh.planReviewState;
            fresh.approvedAt = Date.now();
            await writeTeam(stateRoot, fresh);
            return { teamId: fresh.id, members: fresh.members.length, tasks: fresh.tasks.length };
        });
        try {
            await scheduler.kickTeam(workspace, teamId, await liveLeadAnchorAgent(ctx, { captainSessionId: captain.id, name: teamId }, captain));
        }
        catch (error) {
            // Approval is already durably committed. A transient wake-up failure is
            // recoverable by the next status/member lifecycle kick and must not make
            // the UI report that an already-running team failed to approve.
            ctx.logger.warn(`agent-teams: post-approval kick failed for "${teamId}": ${String(error)}`);
        }
        return approved;
    };
    const continueStagedPlanning = async (captain, teamId) => {
        const workspace = workspaceOf(captain);
        const stateRoot = stateRootOf(workspace, config);
        const prepared = await withTeamLock(teamLockKey(stateRoot, teamId), async () => {
            const fresh = await requireFreshCaptainTeam(ctx, stateRoot, teamId, captain.id);
            requireStagedTeam(fresh);
            if (fresh.planReviewState === 'awaiting_feedback') {
                return { teamName: fresh.name, alreadyWaiting: true };
            }
            fresh.planReviewState = 'awaiting_feedback';
            await writeTeam(stateRoot, fresh);
            return { teamName: fresh.name, alreadyWaiting: false };
        });
        if (prepared.alreadyWaiting)
            return { teamId, alreadyWaiting: true };
        // End any planning turn that is still producing tool calls. A plugin
        // follow-up submitted after cancellation is queued as the next turn by the
        // Harness Agent contract, so it cannot race ahead and recreate the team.
        captain.cancel({ kind: 'user' }, { keepInbox: true });
        try {
            captain.followup(createUserMessage({
                content: [{ type: 'text', text: stagedPlanFeedbackContext(prepared.teamName) }],
                source: agentTeamsSource({ kind: 'agent-teams' }, observedSessionFormatVersion(captain)),
            }));
        }
        catch (error) {
            // Do not leave the durable UI in a false waiting state when the live
            // Captain disappeared between lookup and delivery.
            await withTeamLock(teamLockKey(stateRoot, teamId), async () => {
                const fresh = await requireFreshCaptainTeam(ctx, stateRoot, teamId, captain.id);
                requireStagedTeam(fresh);
                if (fresh.planReviewState === 'awaiting_feedback') {
                    fresh.planReviewState = 'awaiting_review';
                    await writeTeam(stateRoot, fresh);
                }
            });
            throw error;
        }
        return { teamId, alreadyWaiting: false };
    };
    const discardStagedTeam = async (captain, teamId) => {
        const workspace = workspaceOf(captain);
        const stateRoot = stateRootOf(workspace, config);
        const discarded = await withTeamLock(teamLockKey(stateRoot, teamId), async () => {
            const fresh = await requireFreshCaptainTeam(ctx, stateRoot, teamId, captain.id);
            requireStagedTeam(fresh);
            appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/plan-discarded', {
                teamId: fresh.id,
            });
            // A staged plan owns no child sessions. Archiving releases the captain
            // immediately while retaining the rejected graph for later inspection.
            await archiveTeamDir(stateRoot, fresh.id);
            return { teamId: fresh.id, teamName: fresh.name };
        });
        // Preserve this control fact for the next genuine user turn, then abort the
        // still-running Captain turn. Without both operations a late model step can
        // observe the missing active team and incorrectly create it again.
        try {
            captain.inject(createUserMessage({
                content: [{ type: 'text', text: stagedPlanDiscardContext(discarded.teamName) }],
                source: agentTeamsSource({ kind: 'agent-teams' }, observedSessionFormatVersion(captain)),
            }));
        }
        catch (error) {
            // The archive is already authoritative. Cancellation still prevents a
            // late step from recreating work; failure to park extra context is only a
            // live-delivery warning and must not turn a successful discard into 409.
            ctx.logger.warn(`agent-teams: failed to inject discard context for "${discarded.teamId}": ${String(error)}`);
        }
        captain.cancel({ kind: 'user' }, { keepInbox: true });
        return { teamId: discarded.teamId };
    };
    ctx.tools.register(defineTool({
        name: 'agent_teams_create',
        description: 'Create a team. Use approval=required for a two-phase plan: members and tasks remain unspawned/unclaimed until the user reviews the Web plan and explicitly approves it. Optional profiles expand their configured roster; seed profiles also expand template tasks, while captain profiles leave the graph for the Captain to design. approval=automatic preserves the legacy immediate-execution path.',
        parameters: {
            name: { type: 'string', required: true, description: 'Name for the new team (used as its stable id).' },
            description: { type: 'string', description: 'Team purpose / the goal the team will work on.' },
            profile: { type: 'string', description: 'Optional configured profile name.' },
            plan: {
                type: 'object', additionalProperties: false,
                description: 'Optional complete ordinary-work roster and DAG in one atomic call, instead of separate add_member/create_task rounds. Mutually exclusive with profile. For quality gates use create_task with the explicit quality contract.',
                properties: {
                    members: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
                                name: { type: 'string', required: true }, role: { type: 'string' },
                                provider: { type: 'string' }, model: { type: 'string' }, reasoning_effort: { type: 'string' },
                                tool_policy: { type: 'string', description: 'Optional owner-declared tool-policy id for this member.' },
                            } } },
                    tasks: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
                                id: { type: 'string', required: true, description: 'Local reference used by dependencies in this plan; the result maps it to a durable task id.' },
                                subject: { type: 'string', required: true }, description: { type: 'string' }, assignee: { type: 'string' },
                                dependencies: { type: 'array', items: { type: 'string' } },
                            } } },
                },
            },
            approval: {
                type: 'string',
                enum: ['required', 'automatic'],
                description: 'required stages the plan for explicit user review; automatic starts immediately. Defaults to automatic for API compatibility.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    team_id: { type: 'string', required: true },
                    team_name: { type: 'string', required: true },
                    captain_session_id: { type: 'string', required: true },
                    state_dir: { type: 'string', required: true },
                    phase: { type: 'string', required: true },
                    profile: { type: 'string' },
                    task_planning: { type: 'string' },
                    members: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { member_name: { type: 'string', required: true }, member_id: { type: 'string', required: true }, member_role: { type: 'string' }, provider: { type: 'string', required: true }, model: { type: 'string', required: true }, reasoning_effort: { type: 'string' }, tool_policy: { type: 'string' }, status: { type: 'string', required: true } } } },
                    tasks: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { task_id: { type: 'string', required: true }, seed_id: { type: 'string', required: true }, subject: { type: 'string', required: true }, status: { type: 'string', required: true }, kind: { type: 'string' }, assignee: { type: 'string' }, dependencies: { type: 'array', items: { type: 'string' }, required: true } } } },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: (value.phase === 'staged'
                        ? `Team "${value.team_name}" plan created under ${value.state_dir}. It is staged: finish the roster and DAG, then wait for the user to edit and approve it. Do not start or approve it yourself.`
                        : `Team "${value.team_name}" created (id ${value.team_id}) under ${value.state_dir}. You are the captain.`)
                        + (value.tasks === undefined ? '' : '\n' + value.tasks.map(task => `${task.task_id} [${task.seed_id}]: ${task.subject}; assignee=${task.assignee ?? 'unassigned'}; dependencies=${task.dependencies.join(',')}; status=${task.status}; kind=${task.kind ?? 'task'}`).join('\n'))
                        // t99 / BUG-025: the payload carried profile, task_planning and the whole
                        // roster while the text dropped all three, so the captain read a plan without
                        // seeing the members it had just created or the route each one will use.
                        + (value.profile === undefined ? '' : '\nProfile: ' + value.profile)
                        + (value.task_planning === undefined ? '' : '\nTask planning: ' + value.task_planning)
                        + (value.members === undefined || value.members.length === 0 ? '' : '\nMembers (' + value.members.length + '):' + value.members.map(member => `\n  - ${member.member_name} (${member.member_role ?? 'member'}; ${member.provider}/${member.model}${member.reasoning_effort === undefined ? '' : ', reasoning ' + member.reasoning_effort}; status ${member.status}${member.tool_policy === undefined ? '' : '; policy ' + member.tool_policy}; id ${member.member_id})`).join('')),
                }],
            // The conversation card folds this durable result, and the card cannot
            // reproduce the host's key cleaning for every name (issue #203). Publish
            // the canonical identity instead of letting a client re-derive it.
            presentationMeta: (_args, value) => ({
                team_id: value.team_id,
                team_name: value.team_name,
                captain_session_id: value.captain_session_id,
                phase: value.phase,
                ...value.members === undefined ? {} : {
                    members: value.members.map(member => ({
                        id: member.member_id,
                        name: member.member_name,
                        role: member.member_role ?? '',
                        status: member.status,
                    })),
                },
            }),
        },
        async execute(args, exec) {
            const captain = requireCaptain(exec);
            const workspace = workspaceOf(captain);
            const stateRoot = stateRootOf(workspace, config);
            const teamName = args.name.trim();
            if (teamName === '')
                throw new Error('team name must not be empty');
            const teamId = sanitizeKey(teamName);
            const staged = args.approval === 'required';
            // Some models materialize optional parameters as "" instead of omitting
            // them (issue #99). The profile is optional, so treat a blank value
            // exactly like an omitted one instead of failing every create call.
            const profileName = args.profile !== undefined && args.profile.trim() !== ''
                ? args.profile.trim()
                : undefined;
            // Gateways materialize the optional `plan` object the same way (issue
            // #234): an empty shell carries no roster, so it is an omitted plan and
            // the profile / inline-plan exclusion below stays untouched.
            const inlinePlan = args.plan !== undefined && !isEmptyInlinePlan(args.plan) ? args.plan : undefined;
            if (profileName !== undefined && inlinePlan !== undefined)
                throw new Error('choose either a configured profile or an inline plan');
            const created = await withTeamLock(captainLockKey(stateRoot, captain.id), async () => {
                const current = await findTeamByParticipant(stateRoot, captain.id, await leadIdentityOfAsync(ctx, captain.session));
                if (current !== undefined) {
                    const leads = await sessionLeadsTeamAsync(ctx, current, captain.id);
                    const relationship = leads ? 'lead' : 'belong to';
                    const guidance = leads
                        ? 'Use agent_teams_status and continue the existing team. Do not delete and recreate it merely to continue work. End it only when the user explicitly wants a separate new team.'
                        : 'Continue your assigned member work and report to your captain; do not create a separate team.';
                    throw new Error(`you already ${relationship} team "${current.name}" (id ${current.id}). ${guidance}`);
                }
                return withTeamLock(teamLockKey(stateRoot, teamId), async () => {
                    const existing = await readTeam(stateRoot, teamId);
                    if (existing !== undefined) {
                        throw new Error(`team id "${teamId}" is taken by another captain — pick a different team name`);
                    }
                    if (profileName === undefined && inlinePlan === undefined) {
                        const state = {
                            name: teamName,
                            id: teamId,
                            description: args.description,
                            captainSessionId: captain.id,
                            createdAt: Date.now(),
                            members: [],
                            tasks: [],
                            taskSeq: 0,
                            ...staged ? { phase: 'staged', planReviewState: 'awaiting_review' } : {},
                        };
                        await createTeamDir(stateRoot, state);
                        return { committed: true, state };
                    }
                    return initializeProfileTeam({
                        ctx,
                        config,
                        memberSelections,
                        captain,
                        exec,
                        stateRoot,
                        teamName,
                        teamId,
                        profileName: profileName ?? 'inline-plan',
                        inlinePlan,
                        description: args.description,
                        staged,
                    });
                });
            });
            if (created.committed) {
                try {
                    await scheduler.kickTeam(workspace, created.state.id, await liveLeadAnchorAgent(ctx, created.state, captain));
                }
                catch (error) {
                    ctx.logger.warn(`agent-teams: post-create kick failed for "${created.state.id}": ${String(error)}`);
                }
                try {
                    appendTeamEvent(ctx, captain.session, 'agent-teams/team-created', {
                        teamId: created.state.id,
                        captainSessionId: captain.id,
                        name: created.state.name,
                        ...created.state.description !== undefined ? { description: created.state.description } : {},
                        ...created.state.profile?.name === undefined ? {} : { profile: created.state.profile.name },
                    });
                    for (const member of created.state.members) {
                        appendTeamEvent(ctx, captain.session, 'agent-teams/member-added', {
                            teamId: created.state.id,
                            memberId: member.id,
                            name: member.name,
                            ...member.role === undefined ? {} : { role: member.role },
                        });
                    }
                    for (const task of created.state.tasks) {
                        appendTeamEvent(ctx, captain.session, 'agent-teams/task-created', {
                            teamId: created.state.id,
                            taskId: task.id,
                            subject: task.subject,
                            dependencies: task.dependencies,
                            ...task.assignee === undefined ? {} : { assignee: task.assignee },
                        });
                    }
                }
                catch (error) {
                    ctx.logger.warn(`agent-teams: post-create events failed for "${created.state.id}": ${String(error)}`);
                }
            }
            const persisted = await readTeam(stateRoot, created.state.id).catch(() => undefined);
            const snapshot = persisted ?? created.state;
            if (snapshot.profile === undefined && inlinePlan === undefined) {
                return {
                    team_id: snapshot.id,
                    team_name: snapshot.name,
                    captain_session_id: snapshot.captainSessionId,
                    state_dir: join(stateRoot, snapshot.id),
                    phase: snapshot.phase ?? 'running',
                };
            }
            return {
                team_id: snapshot.id,
                team_name: snapshot.name,
                captain_session_id: snapshot.captainSessionId,
                state_dir: join(stateRoot, snapshot.id),
                phase: snapshot.phase ?? 'running',
                ...snapshot.profile === undefined ? {} : { profile: snapshot.profile.name },
                task_planning: snapshot.profile?.taskPlanning ?? 'seed',
                members: snapshot.members.map((member) => ({
                    member_name: member.name,
                    member_id: member.id,
                    ...member.role === undefined ? {} : { member_role: member.role },
                    provider: member.provider ?? '',
                    model: member.model ?? '',
                    ...member.reasoningEffort === undefined ? {} : { reasoning_effort: member.reasoningEffort },
                    ...member.toolPolicy === undefined ? {} : { tool_policy: member.toolPolicy },
                    status: member.status,
                })),
                tasks: snapshot.tasks.map((task) => ({
                    task_id: task.id,
                    seed_id: task.profileSeedId ?? '',
                    subject: task.subject,
                    status: task.status,
                    ...task.kind === undefined ? {} : { kind: task.kind },
                    ...task.assignee === undefined ? {} : { assignee: task.assignee },
                    dependencies: task.dependencies,
                })),
            };
        },
    }));
    /**
     * Render one `agent_teams_edit_plan` roster row.
     *
     * The route shown is the EFFECTIVE route of the durable row, resolved by
     * `selectionFromMember`, whose precedence (fallback > override > active >
     * declared) lives in `routeOf`. A staged member may already carry a
     * captain-declared `routeOverride` and the approve path starts it from the same
     * helper, so echoing the declared spine here told the captain a route that the
     * run would not use (BUG-024).
     *
     * A route that differs from the declared spine is marked ` (override)`, or
     * ` (fallback)` / ` (active)` when the effective route comes from a live
     * fallback or from a leftover active route of an older record. The
     * declared spine is read for exactly two things — the comparison that decides the
     * marker, and the row of a member with no resolvable route at all — so a row
     * without a difference stays byte-identical to the pre-BUG-024 format and
     * existing readers keep working.
     */
    function editPlanRosterRow(member) {
        const declaredRoute = `${member.provider ?? ''}/${member.model ?? ''}`;
        const selection = membersApi.selectionFromMember(member);
        if (typeof selection?.provider !== 'string' || typeof selection.model !== 'string' || selection.provider === '' || selection.model === '')
            return `${member.name} (${member.role || 'member'}; ${declaredRoute})`;
        const route = `${selection.provider}/${selection.model}`;
        if (route === declaredRoute)
            return `${member.name} (${member.role || 'member'}; ${route})`;
        const origin = membersApi.routeOf(member)?.origin;
        const marker = origin === 'fallback' ? ' (fallback)' : origin === 'active' ? ' (active)' : ' (override)';
        return `${member.name} (${member.role || 'member'}; ${route}${marker})`;
    }
    ctx.tools.register(defineTool({
        name: 'agent_teams_edit_plan',
        description: 'Atomically revise an AgentTeams plan. While staged, edit tasks and roster without starting work. While running, only update_task is allowed, and only for pending tasks with no prior attempt: correct dependencies, assignees or descriptions before they start; newly ready work is scheduled after commit. Never edit active/finished attempts. Submit dependent edits in order. Never modify .agent-teams files directly.',
        parameters: {
            operations: {
                type: 'array',
                required: true,
                description: 'One atomic, ordered batch. Running teams allow only update_task for never-started pending tasks. If any operation is invalid, none of the edits are saved.',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        action: {
                            type: 'string',
                            required: true,
                            enum: ['update_member', 'update_task', 'add_task', 'remove_task', 'remove_member'],
                        },
                        member_name: { type: 'string', description: 'Member name for update_member or remove_member.' },
                        task_id: { type: 'string', description: 'Task id for update_task or remove_task.' },
                        subject: { type: 'string', description: 'Required for add_task; optional replacement for update_task.' },
                        description: { type: 'string', description: 'Optional task description.' },
                        assignee: { type: 'string', description: 'Optional task assignee; an empty string moves it to the shared pool.' },
                        dependencies: { type: 'array', items: { type: 'string' }, description: 'Complete replacement dependency list for a task.' },
                        role: { type: 'string', description: 'Optional member role.' },
                        provider: { type: 'string', description: 'Optional member provider; defaults to the current staged route.' },
                        model: { type: 'string', description: 'Optional member model; defaults to the current staged route.' },
                        reasoning_effort: { type: 'string', description: 'Optional member reasoning effort.' },
                        execution_prompt: { type: 'string', description: 'Optional member-specific execution prompt.' },
                        tool_policy: { type: 'string', description: 'Optional owner-declared tool-policy id for this member; an empty string clears it back to the unchanged default tool set.' },
                    },
                },
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    status: { type: 'string', required: true },
                    team_id: { type: 'string', required: true },
                    members: { type: 'number', required: true },
                    tasks: { type: 'number', required: true },
                    dependencies: { type: 'number', required: true },
                    roster: { type: 'array', items: { type: 'string' }, required: true },
                    graph: { type: 'array', items: { type: 'string' }, required: true },
                },
            },
            render: (_args, value) => {
                // The captain reads this TEXT, not the structured payload: until this
                // second fix of BUG-024 the roster (the effective route of every member,
                // including a staged routeOverride) never left the structured output, so
                // the first fix was invisible on the real tool path.
                const summary = `${value.status === 'staged' ? 'Staged plan' : 'Pending task graph'} updated atomically (${value.members} members, ${value.tasks} tasks, ${value.dependencies} dependencies). ${value.status === 'staged' ? 'No members were spawned and no tasks were scheduled.' : 'The scheduler will dispatch any newly ready work.'}`;
                // Graph first, then one roster line per member in `updated.members` order.
                // An empty body prints no separator at all, so a plan without tasks or
                // members never gains a stray blank line.
                const body = [...value.graph, ...value.roster];
                // t99 / BUG-025: team_id stays out of this text on purpose. t94 pins the exact
                // bytes of this render (three of its cases compare the whole text), and this tool
                // only ever addresses the caller's own team, so the id repeats identity the reader
                // already holds. The gate records it in ALLOW_LIST (tests/t98-render-coverage.mjs)
                // with this reason instead of dropping it silently.
                return [{ type: 'text', text: body.length === 0 ? summary : `${summary}\n${body.join('\n')}` }];
            },
        },
        async execute(args, exec) {
            const captain = requireCaptain(exec);
            const workspace = workspaceOf(captain);
            const team = await requireCaptainTeam(ctx, workspace, config, captain);
            if (args.operations.length === 0)
                throw new Error('at least one staged plan operation is required');
            const mutations = args.operations.map((operation, index) => {
                const label = `operation ${index + 1} (${operation.action})`;
                if (operation.action === 'update_member') {
                    const memberName = operation.member_name?.trim() ?? '';
                    if (memberName === '')
                        throw new Error(`${label} requires member_name`);
                    const member = requireMember(team, memberName);
                    return {
                        action: 'update_member',
                        memberName,
                        role: operation.role ?? member.role,
                        provider: operation.provider?.trim() || member.provider || '',
                        model: operation.model?.trim() || member.model || '',
                        reasoningEffort: operation.reasoning_effort ?? member.reasoningEffort,
                        executionPrompt: operation.execution_prompt ?? member.executionPrompt,
                        // Omitted means "keep the current policy": a route/prompt revision
                        // must not silently change what the member may do.
                        ...operation.tool_policy === undefined ? {} : { toolPolicy: operation.tool_policy },
                    };
                }
                if (operation.action === 'update_task') {
                    const taskId = operation.task_id?.trim() ?? '';
                    if (taskId === '')
                        throw new Error(`${label} requires task_id`);
                    const task = requireTask(team, taskId);
                    return {
                        action: 'update_task',
                        taskId,
                        subject: operation.subject ?? task.subject,
                        description: operation.description ?? task.description,
                        assignee: operation.assignee ?? task.assignee,
                        dependencies: operation.dependencies ?? task.dependencies,
                    };
                }
                if (operation.action === 'add_task') {
                    const subject = operation.subject?.trim() ?? '';
                    if (subject === '')
                        throw new Error(`${label} requires a non-empty subject`);
                    return {
                        action: 'add_task',
                        subject,
                        description: operation.description,
                        assignee: operation.assignee,
                        dependencies: operation.dependencies ?? [],
                    };
                }
                if (operation.action === 'remove_task') {
                    const taskId = operation.task_id?.trim() ?? '';
                    if (taskId === '')
                        throw new Error(`${label} requires task_id`);
                    return { action: 'remove_task', taskId };
                }
                const memberName = operation.member_name?.trim() ?? '';
                if (memberName === '')
                    throw new Error(`${label} requires member_name`);
                return { action: 'remove_member', memberName };
            });
            const updated = await updatePlanBatch(captain, team.id, mutations, exec.signal, true);
            if (updated.phase !== 'staged')
                await scheduler.kickTeam(workspace, team.id, await liveLeadAnchorAgent(ctx, team, captain));
            return {
                status: updated.phase ?? 'running',
                team_id: updated.id,
                members: updated.members.length,
                tasks: updated.tasks.length,
                dependencies: updated.tasks.reduce((sum, task) => sum + task.dependencies.length, 0),
                roster: updated.members.map(editPlanRosterRow),
                graph: updated.tasks.map((task) => `${task.id}: ${task.subject} -> ${task.assignee || 'shared'}${task.dependencies.length === 0 ? '' : `; depends on ${task.dependencies.join(', ')}`}`),
            };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_approve',
        description: 'Approve and start a staged team plan. Call this only in response to an explicit user approval in a new user turn; never call it during the turn that created or edited the plan. The Web Approve & Run button uses the same runtime directly.',
        parameters: {
            confirmation: { type: 'string', required: true, description: 'The user\'s explicit approval statement.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    status: { type: 'string', required: true },
                    team_id: { type: 'string', required: true },
                    members: { type: 'number', required: true },
                    tasks: { type: 'number', required: true },
                },
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: `Team ${value.team_id} approved and running (${value.members} members, ${value.tasks} tasks).`,
                }],
        },
        async execute(args, exec) {
            if (args.confirmation.trim() === '')
                throw new Error('explicit user approval text is required');
            const captain = requireCaptain(exec);
            const workspace = workspaceOf(captain);
            const team = await requireCaptainTeam(ctx, workspace, config, captain);
            const approved = await approveStagedTeam(captain, team.id, exec.signal);
            return { status: 'running', team_id: approved.teamId, members: approved.members, tasks: approved.tasks };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_add_member',
        description: 'Add a member to the team roster. Planning and idle roster rows do not call a model. After approval, the member session starts with its first ready task or explicit message and remains durable for later work.',
        parameters: {
            name: { type: 'string', required: true, description: 'Unique member name inside the team.' },
            role: { type: 'string', description: 'Role of the member (e.g. researcher, engineer, reviewer).' },
            provider: { type: 'string', description: 'Optional LLM provider route. Use only when the user explicitly requests a different provider; requires model. Omit to use the configured member route (memberLlmProvider/memberModel) or the captain\'s current route.' },
            model: { type: 'string', description: 'Optional model override (used verbatim, including any "/" in the id). Omit for the configured memberModel default (paired with memberLlmProvider when set) or the captain\'s current model.' },
            reasoning_effort: { type: 'string', description: 'Optional reasoning effort override: one of the target model\'s supported effort ids, or "default" to force its default. When omitted, the captain\'s effort is inherited only for the same provider/model; a changed route uses the target default.' },
            executionPrompt: { type: 'string', description: 'Optional member-specific execution prompt. It remains editable while staged.' },
            tool_policy: { type: 'string', description: 'Optional id of a tool policy declared by the deployment owner (config toolPolicies). It restricts which global tools this member sees and may invoke: a policy allow-list also keeps the four coordination tools, and captain-only tools can never be reopened. Omit for the unchanged default tool set.' },
            activation: {
                type: 'string',
                enum: ['immediate', 'on-task'],
                default: 'immediate',
                description: 'When the new member starts. "immediate" (the default) starts it as soon as it is added, which is what a running team expects; a staged plan still waits for approval. "on-task" waits for the first ready task or an explicit message.'
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    member_name: { type: 'string', required: true },
                    member_id: { type: 'string', required: true },
                    provider: { type: 'string', required: true },
                    model: { type: 'string', required: true },
                    reasoning_effort: { type: 'string' },
                    tool_policy: { type: 'string' },
                    status: { type: 'string', required: true },
                    phase: { type: 'string', required: true },
                    spawned: { type: 'boolean', required: true },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: (value.phase === 'staged'
                        ? 'Member "' + value.member_name + '" added to the staged roster (' + value.provider + '/' + value.model + '); no child was spawned.'
                        : value.spawned === true
                            ? 'Member "' + value.member_name + '" added and started (session ' + value.member_id + ', ' + value.provider + '/' + value.model + (value.reasoning_effort === undefined ? '' : ', reasoning ' + value.reasoning_effort) + ', status ' + value.status + ').'
                            : 'Member "' + value.member_name + '" added (' + (value.member_id || 'starts with its first ready task') + ', ' + value.provider + '/' + value.model + (value.reasoning_effort === undefined ? '' : ', reasoning ' + value.reasoning_effort) + ', status ' + value.status + ').')
                        + (value.tool_policy === undefined ? '' : ' Tool policy "' + value.tool_policy + '" applies to this member.'),
                }],
        },
        async execute(args, exec) {
            const captain = requireCaptain(exec);
            // One shared runtime path: the Web /plan add_member action calls the same
            // function, so the roster rules, the manual cap and the immediate start cannot
            // drift between the tool and HTTP surfaces (design v1 §4.2 d).
            return addMemberNow(ctx, config, memberSelections, captain, {
                name: args.name,
                role: args.role,
                provider: trimmedOptional(args.provider),
                model: trimmedOptional(args.model),
                reasoningEffort: trimmedOptional(args.reasoning_effort),
                executionPrompt: trimmedOptional(args.executionPrompt),
                toolPolicy: trimmedOptional(args.tool_policy),
                activation: args.activation ?? 'immediate',
                source: 'captain',
            }, exec.signal, kickMember);
        },
    }));

    ctx.tools.register(defineTool({
        name: 'agent_teams_set_member_route',
        description: 'Change the model route of a member that already exists, including while it is running, or clear a previously set override so the member returns to the route it was declared with. The next step of that session uses the new route; the step already in flight keeps the route it started with and the session records a model-changed notice, so no work is lost. Works for a member that has not started yet (the route is used when it starts) and for one running now: the route the child session was opened with stays in provider/model and the override is stored beside it. Pass clear=true to remove the override instead of setting one: provider and model are then not allowed, the durable record loses its override, and the member goes back to its declared provider/model. Pass fallback_provider and fallback_model (with optional fallback_reasoning_effort) to declare the route this member degrades to when its own provider dies; pass fallback_clear=true to remove that fallback route (not combinable with the fallback route arguments). Captain only.',
        parameters: {
            member_name: { type: 'string', required: true, description: 'Name of the member whose route changes.' },
            clear: { type: 'boolean', description: 'Set true to REMOVE the captain override and return the member to the provider/model declared in team.json (the audit log records "(cleared)"). Cannot be combined with provider, model, or reasoning_effort; when clear is true or omitted, provider and model are required.' },
            provider: { type: 'string', description: 'LLM provider of the new route. Required unless clear is true.' },
            model: { type: 'string', description: 'Model id of the new route (used verbatim, including any "/" in the id). Required unless clear is true.' },
            reasoning_effort: { type: 'string', description: 'Optional reasoning effort for the new route: one of the target model supported effort ids, or "default" to force its default. Omit for the target model default.' },
            fallback_provider: { type: 'string', description: 'Optional provider of the fallback route this member degrades to when its own route dies. Requires fallback_model; cannot be combined with fallback_clear. Validated against the provider catalog before it is saved.' },
            fallback_model: { type: 'string', description: 'Optional model id of the fallback route (used verbatim, including any "/" in the id). Requires fallback_provider.' },
            fallback_reasoning_effort: { type: 'string', description: 'Optional reasoning effort for the fallback route. Only meaningful together with fallback_provider and fallback_model.' },
            fallback_clear: { type: 'boolean', description: 'Set true to REMOVE the member fallback route and keep the primary route untouched. Cannot be combined with fallback_provider, fallback_model, or fallback_reasoning_effort.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    member_name: { type: 'string', required: true },
                    provider: { type: 'string', required: true },
                    model: { type: 'string', required: true },
                    reasoning_effort: { type: 'string' },
                    previous_provider: { type: 'string' },
                    previous_model: { type: 'string' },
                    cleared: { type: 'boolean' },
                    fallback_provider: { type: 'string' },
                    fallback_model: { type: 'string' },
                    fallback_reasoning_effort: { type: 'string' },
                    fallback_cleared: { type: 'boolean' },
                    applied: { type: 'string', required: true },
                    child_id: { type: 'string' },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: (value.cleared === true
                        ? 'Member "' + value.member_name + '" override is cleared: back on its declared route ' + value.provider + '/' + value.model
                            + (value.reasoning_effort === undefined ? '' : ', reasoning ' + value.reasoning_effort)
                            + (value.previous_provider === undefined ? '' : ' (was ' + value.previous_provider + '/' + value.previous_model + ')')
                        : 'Member "' + value.member_name + '" route is now ' + value.provider + '/' + value.model
                            + (value.reasoning_effort === undefined ? '' : ', reasoning ' + value.reasoning_effort))
                        + (value.fallback_cleared === true
                            ? '; its fallback route is cleared'
                            : value.fallback_provider === undefined
                                ? ''
                                : '; fallback route is ' + value.fallback_provider + '/' + value.fallback_model
                                    + (value.fallback_reasoning_effort === undefined ? '' : ', reasoning ' + value.fallback_reasoning_effort))
                        + (value.applied === 'live-and-durable'
                            ? ' — applied to the live session and saved; the step already in flight keeps its route and the session records a model-changed notice'
                            : ' — saved; it takes effect the next time this member starts')
                        + (value.child_id === undefined ? '.' : ', session ' + value.child_id + '.'),
                }],
        },
        async execute(args, exec) {
            const captain = requireCaptain(exec);
            const team = await requireCaptainTeam(ctx, workspaceOf(captain), config, captain);
            // Two mutually exclusive shapes share this tool: a route assignment
            // (provider + model, optional effort) and a clear (no route at all).
            // Rejecting the mixture here keeps the ambiguity out of the durable
            // record; members.js enforces the same rule for the HTTP and runtime paths.
            const clearing = args.clear === true;
            if (clearing && (args.provider !== undefined || args.model !== undefined || args.reasoning_effort !== undefined)) {
                throw new Error('agent_teams_set_member_route: clear cannot be combined with provider, model, or reasoning_effort — clear returns the member to its declared route, so pass only member_name and clear');
            }
            // The fallback route is a second, independent shape on the same tool:
            // a complete pair, or an explicit removal of it. A half pair would
            // leave the record naming half a route, so it never reaches members.js.
            const fallbackClearing = args.fallback_clear === true;
            const fallbackGiven = args.fallback_provider !== undefined || args.fallback_model !== undefined
                || args.fallback_reasoning_effort !== undefined;
            // Three shapes reach members.js: a re-route, a revert (clear), and a
            // fallback-only change. Only the first two owe provider+model, so the
            // guard has to know which shape it is looking at.
            const wantsPrimary = args.provider !== undefined || args.model !== undefined || args.reasoning_effort !== undefined;
            if (!clearing && !fallbackClearing && !fallbackGiven && (args.provider === undefined || args.model === undefined)) {
                throw new Error('agent_teams_set_member_route: provider and model are required unless clear is true');
            }
            if (!clearing && !fallbackClearing && wantsPrimary && (args.provider === undefined || args.model === undefined)) {
                throw new Error('agent_teams_set_member_route: provider and model are required unless clear is true');
            }
            if (fallbackClearing && fallbackGiven) {
                throw new Error('agent_teams_set_member_route: fallback_clear cannot be combined with fallback_provider, fallback_model, or fallback_reasoning_effort — it removes the fallback route, so pass only member_name and fallback_clear');
            }
            if (fallbackGiven && (args.fallback_provider === undefined || args.fallback_model === undefined)) {
                throw new Error('agent_teams_set_member_route: a fallback route needs both fallback_provider and fallback_model');
            }
            const changed = await runtime.setMemberRoute(captain, {
                teamId: team.id,
                memberName: args.member_name,
                ...clearing ? { clear: true } : {},
                provider: args.provider,
                model: args.model,
                reasoningEffort: trimmedOptional(args.reasoning_effort),
                ...fallbackClearing ? { fallbackClear: true } : {},
                ...args.fallback_provider === undefined ? {} : { fallbackProvider: args.fallback_provider },
                ...args.fallback_model === undefined ? {} : { fallbackModel: args.fallback_model },
                ...trimmedOptional(args.fallback_reasoning_effort) === undefined
                    ? {}
                    : { fallbackReasoningEffort: trimmedOptional(args.fallback_reasoning_effort) },
                // Provenance: the audit log records 'captain:<session>', so an independent
                // audit can name the session that ordered the change (design v1 §4.1 step 7).
                by: captain.session.id,
                source: 'captain',
            }, exec.signal);
            const previous = changed.previous;
            return {
                member_name: changed.member_name,
                provider: changed.provider,
                model: changed.model,
                ...changed.reasoning_effort === undefined ? {} : { reasoning_effort: changed.reasoning_effort },
                ...previous === undefined ? {} : { previous_provider: previous.provider, previous_model: previous.model },
                ...changed.cleared === true ? { cleared: true } : {},
                ...changed.fallback === undefined ? {} : {
                    fallback_provider: changed.fallback.provider,
                    fallback_model: changed.fallback.model,
                    ...changed.fallback.reasoning_effort === undefined ? {} : { fallback_reasoning_effort: changed.fallback.reasoning_effort },
                },
                ...changed.fallback_cleared === true ? { fallback_cleared: true } : {},
                applied: changed.applied,
                ...changed.child_id === undefined ? {} : { child_id: changed.child_id },
            };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_set_member_profile',
        description: 'Change the role and/or the execution prompt of a member that already exists, including while it is running. Fields are merged: a field you omit keeps its current value, so pass only what changes. The change is written to team.json first and takes effect the next time that member is activated; the step already in flight is never interrupted or restarted. A blank value is not a way to erase a field, and a value over the cap (role 200 characters, execution prompt 4000 characters, both measured after trimming) is refused instead of truncated. Every change appends one row to docs/log/MEMBER-PROFILE.md. Captain only.',
        parameters: {
            team_id: { type: 'string', description: 'Optional team id. When passed it must be the caller own team; omit it and the caller team is used.' },
            member_name: { type: 'string', required: true, description: 'Name of the member whose profile changes.' },
            role: { type: 'string', description: 'New role line for the member (at most 200 characters after trimming). Omit to keep the current role.' },
            execution_prompt: { type: 'string', description: 'New execution prompt for the member (at most 4000 characters after trimming). Omit to keep the current prompt. Used from the next activation on.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    member_name: { type: 'string', required: true },
                    role: { type: 'string' },
                    execution_prompt: { type: 'string' },
                    changed: { type: 'array', items: { type: 'string' }, required: true },
                    previous_role: { type: 'string' },
                    previous_execution_prompt: { type: 'string' },
                    applied: { type: 'string', required: true },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: 'Member "' + value.member_name + '" profile updated (' + value.changed.join(', ') + ')'
                        + (value.role === undefined ? '' : ' — role: ' + value.role)
                        + (value.execution_prompt === undefined ? '' : ' — execution prompt: ' + clipText(value.execution_prompt, 400))
                        + ' — saved; it takes effect the next time this member starts, and the step already in flight keeps the prompt it started with.'
                        // t99 / BUG-025: previous_role and previous_execution_prompt are the undo
                        // trace the captain needs to put a profile back, and no text carried them.
                        + (value.previous_role === undefined ? '' : '\n  previous role: ' + value.previous_role)
                        + (value.previous_execution_prompt === undefined ? '' : '\n  previous execution prompt: ' + (value.previous_execution_prompt === '' ? '(empty)' : clipText(value.previous_execution_prompt, 400))),
                }],
        },
        async execute(args, exec) {
            const captain = requireCaptain(exec);
            const team = await requireCaptainTeam(ctx, workspaceOf(captain), config, captain);
            const askedTeam = trimmedOptional(args.team_id);
            if (askedTeam !== undefined && askedTeam !== team.id) {
                throw new Error('agent_teams_set_member_profile: team_id "' + askedTeam + '" is not the caller team "' + team.id + '"');
            }
            const role = trimmedOptional(args.role);
            const executionPrompt = trimmedOptional(args.execution_prompt);
            // One shape only: at least one field. An empty call would be a no-op
            // that still owes an audit row, so it is refused instead.
            if (role === undefined && executionPrompt === undefined) {
                throw new Error('agent_teams_set_member_profile: need at least one field — pass role, execution_prompt, or both');
            }
            const changed = await runtime.setMemberProfile(captain, {
                teamId: team.id,
                memberName: args.member_name,
                ...role === undefined ? {} : { role },
                ...executionPrompt === undefined ? {} : { executionPrompt },
                // Provenance: the audit log records 'captain:<session>', so an
                // independent audit can name the session that ordered the change.
                by: captain.session.id,
                source: 'captain',
            }, exec.signal);
            return {
                member_name: changed.member_name,
                ...changed.role === undefined ? {} : { role: changed.role },
                ...changed.execution_prompt === undefined ? {} : { execution_prompt: changed.execution_prompt },
                changed: changed.changed,
                ...changed.previous_role === undefined ? {} : { previous_role: changed.previous_role },
                ...changed.previous_execution_prompt === undefined ? {} : { previous_execution_prompt: changed.previous_execution_prompt },
                applied: changed.applied,
            };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_remove_member',
        description: 'Remove a member safely: revoke its current attempts, return all unfinished owned tasks to the shared pending pool, interrupt its live turn, and mark it removed.',
        parameters: {
            name: { type: 'string', required: true, description: 'Name of the member to remove.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    member_name: { type: 'string', required: true },
                    status: { type: 'string', required: true },
                    requeued_tasks: { type: 'array', items: { type: 'string' }, required: true },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: `Member "${value.member_name}" removed (status ${value.status}); requeued tasks: ${value.requeued_tasks.join(', ') || 'none'}.`,
                }],
        },
        async execute(args, exec) {
            const captain = requireCaptain(exec);
            const workspace = workspaceOf(captain);
            const stateRoot = stateRootOf(workspace, config);
            const team = await requireCaptainTeam(ctx, workspace, config, captain);
            const revoked = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
                const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id);
                const member = fresh.members.find(item => item.name === args.name);
                if (member === undefined)
                    throw new Error(`no member \"${args.name}\" in team \"${fresh.name}\"`);
                const requeued = [];
                for (const task of fresh.tasks) {
                    if (task.assignee !== member.name || task.status === 'completed')
                        continue;
                    invalidateTaskAttempt(task);
                    task.reassigning = false;
                    requeued.push(task.id);
                }
                member.status = 'removed';
                await discardMailboxMessages(stateRoot, fresh.id, member.name, (await readUnreadMailbox(stateRoot, fresh.id, member.name)).map(message => message.id));
                await writeTeam(stateRoot, fresh);
                appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/member-removed', {
                    teamId: fresh.id,
                    memberId: member.id,
                });
                return { member: { ...member }, requeued };
            });
            if (revoked.member.id !== '') {
                await recordRetiredMemberIds(stateRoot, [revoked.member.id]);
                await stopTeamMemberActivations(ctx, await memberOperationParent(ctx, team, captain), [revoked.member], exec.signal);
            }
            await scheduler.kickTeam(workspace, team.id, await liveLeadAnchorAgent(ctx, team, captain));
            return {
                member_name: revoked.member.name,
                status: revoked.member.status,
                requeued_tasks: revoked.requeued,
            };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_create_task',
        description: 'Create a task in your team\'s task list. Use kind=work (default) for research, repository audits and general tasks. kind=review is only a quality gate for an existing implementation/repair task via reviewedTaskId. Every call must include a non-empty subject, including verification and review tasks. Tasks can depend on other tasks (dependencies): a task is only claimable once every dependency is completed. Optionally assign it to a member, who still claims it before working.',
        parameters: {
            subject: { type: 'string', required: true, description: 'Required non-empty title for this task. Never omit it, including for verification or review tasks.' },
            description: { type: 'string', description: 'What needs to be done, in detail.' },
            dependencies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Task ids this task depends on (must be completed before this task can be claimed).',
            },
            assignee: { type: 'string', description: 'Member name when an owner is specified. Omission puts this task in the shared pool; roles, subjects and descriptions do not assign an owner.' },
            kind: {
                type: 'string',
                enum: ['work', 'requirements', 'implementation', 'verification', 'review', 'repair', 'integration'],
                description: 'Explicit task kind. Omission means work with no quality gates, even if the subject says implementation/review. Quality kinds require a contract. An implementation may be planned before requirements passes when its dependency chain includes that requirements task.',
            },
            round: { type: 'number', description: '1-based review / requirements / repair round.' },
            objective: { type: 'string', description: 'Required non-empty objective for quality kinds.' },
            inScope: { type: 'array', items: { type: 'string' }, description: 'Workspace-relative POSIX paths this task may change.' },
            outOfScope: { type: 'array', items: { type: 'string' }, description: 'Workspace-relative POSIX paths this task must not change.' },
            acceptance: { type: 'array', items: { type: 'string' }, description: 'Acceptance criteria. Required for quality kinds.' },
            verify: { type: 'array', items: { type: 'string' }, description: 'Verification commands. Required for implementation/repair.' },
            deliverables: { type: 'array', items: { type: 'string' }, description: 'Expected deliverable paths or names.' },
            nonGoals: { type: 'array', items: { type: 'string' }, description: 'Explicit non-goals.' },
            reviewedTaskId: { type: 'string', description: 'Existing AgentTeams implementation/repair task id. Required for kind=review; an external repository audit is kind=work.' },
            sourceTaskId: { type: 'string', description: 'Source implementation/artifact. Required for kind=repair.' },
            sourceFindingIds: { type: 'array', items: { type: 'string' }, description: 'Finding ids this repair must close.' },
            coverageOf: { type: 'array', items: { type: 'string' }, description: 'User-constraint / goal items this task covers.' },
            resume: { type: 'boolean', description: 'If true, clear halted in the same lock before creating the task.' },
            resumeReason: { type: 'string', description: 'Required non-empty reason when resume=true.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    task_id: { type: 'string', required: true },
                    subject: { type: 'string', required: true },
                    status: { type: 'string', required: true },
                    kind: { type: 'string', required: true },
                    assignee: { type: 'string' },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: `Task "${value.subject}" created as ${value.task_id} (status ${value.status}, kind ${value.kind}, ${value.assignee ? `assigned to ${value.assignee}` : 'unassigned shared pool'}).`,
                }],
        },
        async execute(args, exec) {
            const captain = requireCaptain(exec);
            const workspace = workspaceOf(captain);
            const stateRoot = stateRootOf(workspace, config);
            const team = await requireCaptainTeam(ctx, workspace, config, captain);
            // Some models materialize optional parameters as "" instead of omitting
            // them (issue #105). Normalize blank optional fields to omitted before
            // validation so a blank value can neither be rejected spuriously nor be
            // persisted into team.json, where it would brick the team on reload.
            const input = normalizeBlankOptionalTaskFields(args);
            const created = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
                const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id);
                const gate = validateCreateTask(fresh, {
                    subject: input.subject,
                    description: input.description,
                    dependencies: input.dependencies,
                    assignee: input.assignee,
                    kind: input.kind,
                    round: input.round,
                    objective: input.objective,
                    inScope: input.inScope,
                    outOfScope: input.outOfScope,
                    acceptance: input.acceptance,
                    verify: input.verify,
                    deliverables: input.deliverables,
                    nonGoals: input.nonGoals,
                    reviewedTaskId: input.reviewedTaskId,
                    sourceTaskId: input.sourceTaskId,
                    sourceFindingIds: input.sourceFindingIds,
                    coverageOf: input.coverageOf,
                    resume: input.resume,
                    resumeReason: input.resumeReason,
                });
                if (!gate.ok)
                    throw new Error(gate.error ?? 'create_task rejected by quality gates');
                if (fresh.halted === true) {
                    const resumed = resumeTeamState(fresh, args.resumeReason ?? '');
                    if (resumed.status !== 'resumed' || resumed.team === undefined) {
                        throw new Error(resumed.error ?? 'team is halted; call agent_teams_resume or pass resume=true with resumeReason');
                    }
                    fresh.halted = false;
                    fresh.haltedAt = undefined;
                    appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/team-resumed', {
                        teamId: fresh.id,
                        reason: args.resumeReason ?? '',
                    });
                }
                const dependencies = args.dependencies ?? [];
                for (const dependency of dependencies) {
                    if (!fresh.tasks.some((task) => task.id === dependency)) {
                        throw new Error(`dependency "${dependency}" does not exist in team "${fresh.name}"`);
                    }
                }
                if (args.assignee !== undefined)
                    requireMember(fresh, args.assignee);
                const kind = gate.kind ?? 'work';
                const objective = kind === 'review' || kind === 'requirements'
                    ? sanitizeReviewObjective(input.objective)
                    : input.objective;
                const acceptance = kind === 'review' || kind === 'requirements'
                    ? sanitizeReviewAcceptance(input.acceptance)
                    : input.acceptance;
                const task = {
                    id: `t${fresh.taskSeq + 1}`,
                    subject: args.subject,
                    description: args.description,
                    status: 'pending',
                    assignee: args.assignee,
                    dependencies,
                    attempt: 0,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    kind,
                    ...args.round === undefined ? {} : { round: args.round },
                    ...objective === undefined ? {} : { objective },
                    ...input.inScope === undefined ? {} : { inScope: input.inScope },
                    ...input.outOfScope === undefined ? {} : { outOfScope: input.outOfScope },
                    ...acceptance === undefined ? {} : { acceptance },
                    ...input.verify === undefined ? {} : { verify: input.verify },
                    ...input.deliverables === undefined ? {} : { deliverables: input.deliverables },
                    ...input.nonGoals === undefined ? {} : { nonGoals: input.nonGoals },
                    ...input.reviewedTaskId === undefined ? {} : { reviewedTaskId: input.reviewedTaskId },
                    ...input.sourceTaskId === undefined ? {} : { sourceTaskId: input.sourceTaskId },
                    ...input.sourceFindingIds === undefined ? {} : { sourceFindingIds: input.sourceFindingIds },
                    ...input.coverageOf === undefined ? {} : { coverageOf: input.coverageOf },
                };
                fresh.taskSeq += 1;
                fresh.tasks.push(task);
                await writeTeam(stateRoot, fresh);
                appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/task-created', {
                    teamId: fresh.id,
                    taskId: task.id,
                    subject: task.subject,
                    dependencies: task.dependencies,
                    ...task.assignee !== undefined ? { assignee: task.assignee } : {},
                    ...task.kind === undefined ? {} : { kind: task.kind },
                    ...task.round === undefined ? {} : { round: task.round },
                });
                return {
                    task_id: task.id,
                    subject: task.subject,
                    status: task.status,
                    kind: taskKindOf(task),
                    ...task.assignee !== undefined ? { assignee: task.assignee } : {},
                };
            });
            await scheduler.kickTeam(workspace, team.id, await liveLeadAnchorAgent(ctx, team, captain));
            return created;
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_reassign_task',
        description: 'Atomically retry, reassign, or let the captain take over one ready unfinished/failed task. The old attempt is revoked before its member is interrupted, so late updates cannot overwrite the new owner. Use assignee="captain" only when you will finish that task in this turn; a captain can own only one unfinished takeover at a time, and an unfinished takeover returns to the member pool when the captain becomes idle.',
        parameters: {
            task_id: { type: 'string', required: true, description: 'Task to retry/reassign.' },
            assignee: { type: 'string', required: true, description: 'Active member name, or "captain" for captain takeover.' },
            reason: { type: 'string', description: 'Why the task is being retried or reassigned.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    task_id: { type: 'string', required: true },
                    previous_assignee: { type: 'string', required: true },
                    assignee: { type: 'string', required: true },
                    status: { type: 'string', required: true },
                    attempt: { type: 'number', required: true },
                    attempt_id: { type: 'string' },
                },
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: `Task ${value.task_id} reassigned ${value.previous_assignee || 'unassigned'} → ${value.assignee} (attempt ${value.attempt}, status ${value.status}${value.attempt_id ? `, attempt_id ${value.attempt_id}` : ''}).`,
                }],
        },
        async execute(args, exec) {
            const captain = requireCaptain(exec);
            const workspace = workspaceOf(captain);
            const stateRoot = stateRootOf(workspace, config);
            const team = await requireCaptainTeam(ctx, workspace, config, captain);
            const target = args.assignee.trim();
            if (target === '')
                throw new Error('reassignment assignee must not be empty');
            const revoked = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
                const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id);
                const task = requireTask(fresh, args.task_id);
                if (task.status === 'completed')
                    throw new Error(`completed task ${task.id} is immutable and cannot be reassigned`);
                if (task.reassigning === true) {
                    const previousMember = fresh.members.find(member => member.id === task.handoffFromMemberId && member.stopping === true);
                    if (task.assignee !== target || previousMember === undefined)
                        throw new Error(`task ${task.id} is already being reassigned`);
                    return { previousAssignee: previousMember.name, previousMember: { ...previousMember }, handoffId: task.handoffId };
                }
                const targetMember = target === CAPTAIN_KEY ? undefined : requireMember(fresh, target);
                if (target === CAPTAIN_KEY) {
                    const busy = captainOpenTask(fresh, task.id);
                    if (busy !== undefined) {
                        throw new Error(`captain is busy with ${busy.id}; complete or reassign it before taking over ${task.id}`);
                    }
                    const pending = unsatisfiedDependencies(fresh.tasks, task.dependencies);
                    if (pending.length > 0) {
                        throw new Error(`task ${task.id} is blocked by unfinished dependencies: ${pending.join(', ')} — complete them before captain takeover`);
                    }
                }
                else if (targetMember !== undefined) {
                    const busy = memberOpenTask(fresh, targetMember.name, task.id);
                    if (busy !== undefined) {
                        throw new Error(`member "${targetMember.name}" is busy with ${busy.id}; finish or reassign it first`);
                    }
                }
                const previousAssignee = task.assignee ?? '';
                const previousMember = (task.status !== 'claimed' && task.status !== 'in_progress')
                    || task.assignee === undefined || task.assignee === CAPTAIN_KEY
                    ? undefined
                    : fresh.members.find(member => member.name === task.assignee && member.status !== 'removed');
                invalidateTaskAttempt(task, target, true);
                if (previousMember !== undefined) {
                    previousMember.stopping = true;
                    task.handoffFromMemberId = previousMember.id;
                    await discardMailboxMessages(stateRoot, fresh.id, previousMember.name, (await readUnreadMailbox(stateRoot, fresh.id, previousMember.name)).map(message => message.id));
                }
                await writeTeam(stateRoot, fresh);
                return {
                    previousAssignee,
                    previousMember: previousMember === undefined ? undefined : { ...previousMember },
                    handoffId: task.handoffId,
                };
            });
            let quiescenceError;
            if (revoked.previousMember !== undefined) {
                try {
                    await stopTeamMemberActivations(ctx, await memberOperationParent(ctx, team, captain), [revoked.previousMember], exec.signal);
                }
                catch (error) {
                    quiescenceError = error;
                }
            }
            await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
                const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id);
                const task = requireTask(fresh, args.task_id);
                if (task.handoffId !== revoked.handoffId || task.assignee !== target || task.reassigning !== true) {
                    throw new Error(`task ${task.id} changed during reassignment; refusing to overwrite the newer state`);
                }
                task.reassigning = quiescenceError !== undefined;
                if (quiescenceError === undefined) {
                    const previous = fresh.members.find(member => member.id === revoked.previousMember?.id);
                    if (previous !== undefined)
                        delete previous.stopping;
                    delete task.handoffFromMemberId;
                }
                if (quiescenceError === undefined && target === CAPTAIN_KEY) {
                    beginTaskAttempt(task, CAPTAIN_KEY);
                    // The captain is already in the turn that requested takeover; there
                    // is no later member claim handshake to move claimed -> in_progress.
                    task.status = 'in_progress';
                    task.updatedAt = Date.now();
                }
                await writeTeam(stateRoot, fresh);
                appendTeamEvent(ctx, captain.session, 'agent-teams/task-updated', {
                    teamId: fresh.id,
                    taskId: task.id,
                    status: task.status,
                    assignee: task.assignee,
                    ...args.reason === undefined ? {} : { output: `Reassigned: ${args.reason}` },
                });
            });
            if (quiescenceError !== undefined)
                throw quiescenceError;
            if (target !== CAPTAIN_KEY)
                await scheduler.kickMember(workspace, team.id, target, await liveLeadAnchorAgent(ctx, team, captain));
            const current = await readTeam(stateRoot, team.id);
            const task = current === undefined ? undefined : requireTask(current, args.task_id);
            if (task === undefined)
                throw new Error(`team "${team.name}" ended during reassignment`);
            return {
                task_id: task.id,
                previous_assignee: revoked.previousAssignee,
                assignee: task.assignee ?? '',
                status: task.status,
                attempt: task.attempt ?? 0,
                ...task.attemptId === undefined ? {} : { attempt_id: task.attemptId },
            };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_claim_task',
        description: 'Members claim their own ready task or read their existing attempt_id. Captains must use reassign_task to assign and wake a member; claim_task does not dispatch work. A member cannot own a second unfinished task. The returned attempt_id is required for updates and becomes stale after retry/reassignment.',
        parameters: {
            task_id: { type: 'string', required: true, description: 'The task id to claim.' },
            assignee: { type: 'string', description: 'Deprecated: claim_task only supports a member claiming its own task. Captains must use reassign_task.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    task_id: { type: 'string', required: true },
                    status: { type: 'string', required: true },
                    assignee: { type: 'string', required: true },
                    attempt: { type: 'number', required: true },
                    attempt_id: { type: 'string' },
                    task_details: { type: 'string', required: true },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: `Task ${value.task_id} claimed by ${value.assignee} (attempt ${value.attempt}${value.attempt_id ? `, attempt_id ${value.attempt_id}` : ''}, status ${value.status}).\n${value.task_details}`,
                }],
        },
        async execute(args, exec) {
            const caller = requireCaptain(exec);
            const workspace = workspaceOf(caller);
            const stateRoot = stateRootOf(workspace, config);
            const team = await requireParticipantTeam(ctx, workspace, config, caller);
            return withTeamLock(teamLockKey(stateRoot, team.id), async () => {
                const { team: fresh, identity } = await requireFreshParticipant(ctx, stateRoot, team.id, caller.id);
                const task = requireTask(fresh, args.task_id);
                if (task.reassigning === true) {
                    throw new Error(`task ${task.id} is being reassigned; wait for the handoff to finish`);
                }
                // Gateways materialize this deprecated optional argument, and a model may
                // also restate its own member name. A blank or self-valued assignee is
                // harmless: it asks for exactly what a claim does anyway.
                const requestedAssignee = typeof args.assignee === 'string' && args.assignee.trim() !== ''
                    ? args.assignee.trim()
                    : undefined;
                let assignee = task.assignee;
                if (identity.kind === 'captain') {
                    // A captain may read the capability of its already-started takeover,
                    // but must never create a member claim without dispatching it (#125).
                    if (requestedAssignee !== undefined || task.assignee !== CAPTAIN_KEY
                        || (task.status !== 'claimed' && task.status !== 'in_progress')) {
                        throw new Error('claim_task is for members claiming their own task; captains must use agent_teams_reassign_task to assign and wake a member');
                    }
                }
                else {
                    if (requestedAssignee !== undefined && requestedAssignee !== identity.name) {
                        throw new Error('members cannot set assignee when claiming a task');
                    }
                    if (assignee !== undefined && assignee !== identity.name) {
                        throw new Error(`task ${task.id} is assigned to "${assignee}", not you`);
                    }
                    assignee = identity.name;
                }
                // Authorization must happen before the idempotent return: another
                // member must not receive a false success for somebody else's task.
                if (task.status === 'claimed' || task.status === 'in_progress') {
                    if (assignee === undefined || task.assignee !== assignee) {
                        throw new Error(`task ${task.id} is already claimed by "${task.assignee ?? 'nobody'}"`);
                    }
                    return {
                        task_details: taskDetails(fresh, task),
                        task_id: task.id,
                        status: task.status,
                        assignee,
                        attempt: task.attempt ?? 0,
                        ...task.attemptId === undefined ? {} : { attempt_id: task.attemptId },
                    };
                }
                const pending = unsatisfiedDependencies(fresh.tasks, task.dependencies);
                if (pending.length > 0) {
                    throw new Error(`task ${task.id} is blocked by unfinished dependencies: ${pending.join(', ')} — complete them first`);
                }
                const transition = transitionError(task.status, 'claimed');
                if (transition !== undefined)
                    throw new Error(transition);
                if (assignee === undefined) {
                    throw new Error('claiming an unassigned task needs an assignee (claim on behalf of a member)');
                }
                const busy = memberOpenTask(fresh, assignee, task.id);
                if (busy !== undefined) {
                    throw new Error(`member "${assignee}" is busy with ${busy.id}; finish or reassign it first`);
                }
                const attemptId = beginTaskAttempt(task, assignee);
                await writeTeam(stateRoot, fresh);
                appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, caller.session), 'agent-teams/task-updated', {
                    teamId: fresh.id,
                    taskId: task.id,
                    status: task.status,
                    assignee: task.assignee,
                });
                return {
                    task_details: taskDetails(fresh, task),
                    task_id: task.id,
                    status: task.status,
                    assignee: task.assignee ?? '',
                    attempt: task.attempt ?? 0,
                    attempt_id: attemptId,
                };
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_update_task',
        description: 'Update a task status/output. Members must supply the current attempt_id returned by claim_task; stale attempts are rejected after takeover/reassignment. Terminal results are immutable, but owners and the captain can append acceptanceResults/commandsRun/evidence_note as attributed supplemental evidence, without reclaiming or changing the verdict. A captain must use reassign_task(assignee="captain") before updating active member-owned work.',
        parameters: {
            task_id: { type: 'string', required: true, description: 'The task id to update.' },
            attempt_id: { type: 'string', description: 'Members must explicitly include the current attempt_id from their assignment/claim in EVERY update, including failed reviews with findings. If omitted, retry with the same current id; omission does not revoke the attempt.' },
            status: {
                type: 'string',
                enum: ['in_progress', 'completed', 'failed', 'cancelled'],
                description: 'New status (in_progress, completed, failed, cancelled).',
            },
            output: { type: 'string', description: 'Original result summary; immutable after completion/failure.' },
            evidence_note: { type: 'string', description: 'Append-only supplementary observation on a terminal task. Does not reopen work or change the original result.' },
            verdict: {
                type: 'string',
                enum: ['pass', 'needs_revision', 'reject'],
                description: 'Required for completing requirements/review. needs_revision and reject must fail the task.',
            },
            findings: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        id: { type: 'string', required: true },
                        severity: { type: 'string', enum: ['low', 'medium', 'high', 'blocker'], required: true },
                        problem: { type: 'string', required: true },
                        requiredFix: { type: 'string', required: true },
                        file: { type: 'string' },
                        line: { type: 'number' },
                        resolved: { type: 'boolean' },
                    },
                },
                description: 'Structured review findings. Required when verdict is needs_revision or reject; each item needs id, severity, problem, and requiredFix.',
            },
            changedPaths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Workspace-relative POSIX paths changed by this implementation/repair.',
            },
            acceptanceResults: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        criterion: { type: 'string', required: true },
                        status: { type: 'string', enum: ['passed', 'failed'], required: true },
                        evidence: { type: 'string' },
                    },
                },
                description: 'Acceptance evidence in contract order: {criterion, status:"passed"|"failed", evidence?}. Supply one item per acceptance criterion.',
            },
            commandsRun: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        command: { type: 'string', required: true },
                        status: { type: 'string', enum: ['passed', 'failed'], required: true },
                        exitCode: { type: 'number' },
                        evidence: { type: 'string' },
                    },
                },
                description: 'Verification evidence in contract order: {command, status:"passed"|"failed", exitCode?, evidence?}. Supply one item per verify command.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    task_id: { type: 'string', required: true },
                    status: { type: 'string', required: true },
                    output: { type: 'string' },
                    attempt: { type: 'number', required: true },
                    attempt_id: { type: 'string' },
                    evidence_count: { type: 'number' },
                    follow_up: { type: 'string' },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: `Task ${value.task_id} attempt ${value.attempt} → ${value.status}${value.output !== undefined ? `\nOutput: ${value.output}` : ''}${value.evidence_count === undefined ? '' : `\nSupplemental evidence records: ${value.evidence_count}. Original result unchanged.`}${value.follow_up ? `\n${value.follow_up}` : ''}`,
                }],
        },
        async execute(args, exec) {
            const caller = requireCaptain(exec);
            const workspace = workspaceOf(caller);
            const stateRoot = stateRootOf(workspace, config);
            const team = await requireParticipantTeam(ctx, workspace, config, caller);
            let followUpMessage;
            const updated = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
                const { team: fresh, identity } = await requireFreshParticipant(ctx, stateRoot, team.id, caller.id);
                const task = requireTask(fresh, args.task_id);
                if (identity.kind === 'captain'
                    && task.assignee !== undefined
                    && task.assignee !== CAPTAIN_KEY
                    && !TERMINAL_TASK_STATUSES.includes(task.status)
                    && !(args.status === 'cancelled' && task.status === 'pending' && (task.attempt ?? 0) === 0 && task.reassigning !== true)) {
                    throw new Error(`task ${task.id} is owned by member "${task.assignee}"; call agent_teams_reassign_task with assignee="captain" before takeover`);
                }
                if (identity.kind === 'member') {
                    if (task.assignee !== identity.name) {
                        throw new Error(`task ${task.id} is assigned to "${task.assignee ?? 'nobody'}", not you`);
                    }
                    if (task.attemptId !== undefined && (args.attempt_id === undefined || args.attempt_id.trim() === '')) {
                        throw new Error(`missing attempt_id for task ${task.id}. Retry this update with attempt_id="${task.attemptId}" from your current assignment. This is a missing parameter, not a revoked attempt; do not restart the work or request reassignment.`);
                    }
                    if (task.attemptId !== undefined && args.attempt_id !== task.attemptId) {
                        throw new Error(`stale attempt for task ${task.id}: expected the current attempt_id; stop work and request fresh assignment`);
                    }
                }
                if (TERMINAL_TASK_STATUSES.includes(task.status)) {
                    const appended = appendTaskEvidence(task, {
                        ...args, findings: parseFindings(args.findings), changedPaths: normalizeBlankOptionalTaskFields(args).changedPaths,
                        acceptanceResults: parseAcceptanceResults(args.acceptanceResults), commandsRun: parseCommandResults(args.commandsRun),
                    }, identity.name);
                    if (appended)
                        await writeTeam(stateRoot, fresh);
                    return {
                        evidence_count: task.supplementalEvidence?.length ?? 0,
                        task_id: task.id,
                        status: task.status,
                        attempt: task.attempt ?? 0,
                        ...task.attemptId === undefined ? {} : { attempt_id: task.attemptId },
                        ...task.output !== undefined ? { output: task.output } : {},
                    };
                }
                if (args.evidence_note?.trim())
                    throw new Error('evidence_note is for terminal tasks; record active work with output and structured evidence');
                // Blank optional list entries (e.g. changedPaths:[""]) must not be
                // persisted: hasValidQualityTaskFields rejects them on reload and
                // would brick the whole team state (issue #105 class).
                const input = normalizeBlankOptionalTaskFields(args);
                const findings = parseFindings(args.findings);
                const acceptanceResults = parseAcceptanceResults(args.acceptanceResults);
                const commandsRun = parseCommandResults(args.commandsRun);
                const gate = evaluateQualityCompletion(task, {
                    status: args.status,
                    output: args.output,
                    verdict: args.verdict,
                    findings,
                    changedPaths: input.changedPaths,
                    acceptanceResults,
                    commandsRun,
                });
                if (!gate.ok)
                    throw new Error(gate.error ?? 'update_task rejected by quality gates');
                if (args.status !== undefined) {
                    const transition = transitionError(task.status, args.status);
                    if (transition !== undefined)
                        throw new Error(transition);
                    task.status = args.status;
                }
                if (args.output !== undefined)
                    task.output = args.output;
                if (args.verdict !== undefined)
                    task.verdict = args.verdict;
                if (findings !== undefined)
                    task.findings = findings;
                if (input.changedPaths !== undefined)
                    task.changedPaths = input.changedPaths;
                if (acceptanceResults !== undefined)
                    task.acceptanceResults = acceptanceResults;
                if (commandsRun !== undefined)
                    task.commandsRun = commandsRun;
                // A passing gate is evidence about a revision: record which one, so a
                // later edit cannot leave the team advertising an unreviewed revision.
                bindClosingVerdict(workspace, fresh, task);
                task.updatedAt = Date.now();
                const priorDependencies = new Map(fresh.tasks.map(item => [item.id, [...item.dependencies]]));
                const followUp = (task.status === 'failed' && isQualityKind(taskKindOf(task)))
                    ? applyQualityFollowUp(fresh, task, (paths) => snapshotWorkspacePaths(workspace, paths), (path) => workspacePathExists(workspace, path))
                    : undefined;
                let followUpSummary;
                if ((followUp?.created.length ?? 0) > 0) {
                    const rewired = fresh.tasks.filter(item => priorDependencies.has(item.id) && JSON.stringify(priorDependencies.get(item.id)) !== JSON.stringify(item.dependencies));
                    followUpSummary = `Automatic quality follow-up for ${task.id}: ${followUp.created.map(item => `${item.id} (${item.kind}, owner=${item.assignee ?? 'unassigned'}, deps=${item.dependencies.join(',') || 'none'})`).join('; ')}.${rewired.length ? ` Updated dependencies: ${rewired.map(item => `${item.id} -> ${item.dependencies.join(',')}`).join('; ')}.` : ''} Use these tasks; do not create duplicate repair/review work.${followUp.excludedFindings === undefined ? '' : ` Findings on default-excluded paths were not turned into a contract and stay with the user: ${followUp.excludedFindings.join(', ')}.`}`;
                    followUpMessage = createMessage(CAPTAIN_KEY, CAPTAIN_KEY, followUpSummary);
                }
                if (followUp?.escalated === true) {
                    await appendMailbox(stateRoot, fresh.id, CAPTAIN_KEY, createMessage(CAPTAIN_KEY, CAPTAIN_KEY, `Quality-gate loop escalated after ${task.id} (${task.kind ?? 'review'} verdict=${task.verdict}). Automatic repair/review stopped.${followUp.reason === undefined ? '' : ` Reason: ${followUp.reason}.`}${followUp.excludedFindings === undefined ? '' : ` Findings left for the user (default-excluded paths, not a member's to edit): ${followUp.excludedFindings.join(', ')}.`}`));
                }
                await writeTeam(stateRoot, fresh);
                if (followUpMessage !== undefined)
                    await appendMailbox(stateRoot, fresh.id, CAPTAIN_KEY, followUpMessage);
                appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, caller.session), 'agent-teams/task-updated', {
                    teamId: fresh.id,
                    taskId: task.id,
                    status: task.status,
                    ...task.assignee !== undefined ? { assignee: task.assignee } : {},
                    ...task.output !== undefined ? { output: task.output } : {},
                    ...task.verdict === undefined ? {} : { verdict: task.verdict },
                    ...task.round === undefined ? {} : { round: task.round },
                });
                for (const created of followUp?.created ?? []) {
                    appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, caller.session), 'agent-teams/task-created', {
                        teamId: fresh.id,
                        taskId: created.id,
                        subject: created.subject,
                        dependencies: created.dependencies,
                        ...created.assignee === undefined ? {} : { assignee: created.assignee },
                        ...created.kind === undefined ? {} : { kind: created.kind },
                        ...created.round === undefined ? {} : { round: created.round },
                    });
                }
                return {
                    ...followUpSummary === undefined ? {} : { follow_up: followUpSummary },
                    task_id: task.id,
                    status: task.status,
                    attempt: task.attempt ?? 0,
                    ...task.attemptId === undefined ? {} : { attempt_id: task.attemptId },
                    ...task.output !== undefined ? { output: task.output } : {},
                };
            });
            if (followUpMessage !== undefined) {
                const captain = nearestLiveLead(ctx, team);
                if (captain !== undefined && steerCaptainReport(captain, CAPTAIN_KEY, followUpMessage.content, mailboxPrompt(team.id, CAPTAIN_KEY, [followUpMessage]))) {
                    await withTeamLock(teamLockKey(stateRoot, team.id), () => markMailboxDelivered(stateRoot, team.id, CAPTAIN_KEY, [followUpMessage.id]));
                }
            }
            await scheduler.kickTeam(workspace, team.id, await liveLeadAnchorAgent(ctx, team, caller));
            return updated;
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_amend_task',
        description: 'Captain-only controlled contract amendment for one non-terminal quality task: replace a wrong objective/acceptance/verify/inScope/outOfScope when the original contract makes honest completion impossible (for example a verify command that cannot pass, or an inScope that forbids the file the objective names). The amendment is appended to the task\'s revisions ledger with previous values and the reason, and is rejected once a review/requirements task has passed judgment on this task. Members cannot amend contracts; the implementer re-reads the amended contract before its next quality gate. Lists are full replacements, not deltas.',
        parameters: {
            task_id: { type: 'string', required: true, description: 'Task whose contract is being amended.' },
            reason: { type: 'string', required: true, description: 'Why the current contract is wrong; recorded in the revisions ledger.' },
            objective: { type: 'string', description: 'Replacement objective.' },
            acceptance: { type: 'array', items: { type: 'string' }, description: 'Replacement acceptance criteria (full list, not a delta).' },
            verify: { type: 'array', items: { type: 'string' }, description: 'Replacement verification commands (full list, not a delta).' },
            inScope: { type: 'array', items: { type: 'string' }, description: 'Replacement workspace-relative inScope paths (full list).' },
            outOfScope: { type: 'array', items: { type: 'string' }, description: 'Replacement workspace-relative outOfScope paths (full list).' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    task_id: { type: 'string', required: true },
                    status: { type: 'string', required: true },
                    revised_fields: { type: 'string', required: true },
                    revision_count: { type: 'number', required: true },
                    contract: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: `Task ${value.task_id} contract amended (${value.revised_fields}); ${value.revision_count} revision(s) on record, status ${value.status}. New contract: ${value.contract}`,
                }],
        },
        async execute(args, exec) {
            const captain = requireCaptain(exec);
            const workspace = workspaceOf(captain);
            const stateRoot = stateRootOf(workspace, config);
            const team = await requireCaptainTeam(ctx, workspace, config, captain);
            const amended = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
                const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id);
                const task = requireTask(fresh, args.task_id);
                const input = {
                    ...args.objective === undefined ? {} : { objective: args.objective },
                    ...args.acceptance === undefined ? {} : { acceptance: args.acceptance },
                    ...args.verify === undefined ? {} : { verify: args.verify },
                    ...args.inScope === undefined ? {} : { inScope: args.inScope },
                    ...args.outOfScope === undefined ? {} : { outOfScope: args.outOfScope },
                };
                const result = amendTaskContract(fresh, task, normalizeBlankOptionalTaskFields(input), CAPTAIN_KEY, args.reason);
                if (!result.ok || result.task === undefined) {
                    throw new Error(result.error ?? 'amend_task rejected by quality gates');
                }
                Object.assign(task, result.task);
                task.updatedAt = Date.now();
                await writeTeam(stateRoot, fresh);
                return {
                    taskId: task.id,
                    status: task.status,
                    fields: result.revision?.fields ?? [],
                    revisionCount: task.revisions?.length ?? 0,
                    contract: {
                        ...task.objective === undefined ? {} : { objective: task.objective },
                        ...task.acceptance === undefined ? {} : { acceptance: task.acceptance },
                        ...task.verify === undefined ? {} : { verify: task.verify },
                        ...task.inScope === undefined ? {} : { inScope: task.inScope },
                        ...task.outOfScope === undefined ? {} : { outOfScope: task.outOfScope },
                    },
                };
            });
            appendTeamEvent(ctx, captainSessionOf(ctx, team.captainSessionId, captain.session), 'agent-teams/task-amended', {
                teamId: team.id,
                taskId: amended.taskId,
                fields: amended.fields,
                reason: args.reason,
            });
            return {
                task_id: amended.taskId,
                status: amended.status,
                revised_fields: amended.fields.join(', '),
                revision_count: amended.revisionCount,
                contract: JSON.stringify(amended.contract),
            };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_send_message',
        description: 'Send coordination or current-task guidance directly to the captain or a teammate. A running recipient receives it at the next model step; an idle recipient wakes. Messages are durably retained until read. Use task creation/reassignment for a new unit of work, not repeated status nudges.',
        parameters: {
            source_task_id: { type: 'string', description: 'Sender task, NOT the recipient task. Members include it with source_attempt_id. Captains sending guidance normally omit both source fields.' },
            source_attempt_id: { type: 'string', description: 'Sender execution capability paired with source_task_id. Stale reports are rejected. Omit for ordinary captain guidance.' },
            to: { type: 'string', required: true, description: 'Recipient: "captain" or a member name.' },
            content: { type: 'string', required: true, description: 'The message text.' },
            from: { type: 'string', description: 'Sender (defaults to the caller: the captain, or the calling member).' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    message_id: { type: 'string', required: true },
                    from: { type: 'string', required: true },
                    to: { type: 'string', required: true },
                    delivered: { type: 'string', required: true, description: 'live (accepted by the live captain), wake (member recipient woken), mailbox (durable inbox only), or duplicate (same message already retained).' },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: `Message ${value.message_id} ${value.from} → ${value.to} delivered via ${value.delivered}.`,
                }],
        },
        async execute(args, exec) {
            const caller = requireCaptain(exec);
            const workspace = workspaceOf(caller);
            const stateRoot = stateRootOf(workspace, config);
            const team = await requireParticipantTeam(ctx, workspace, config, caller);
            const to = args.to.trim();
            const prepared = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
                const { team: fresh, identity } = await requireFreshParticipant(ctx, stateRoot, team.id, caller.id);
                const from = identity.name;
                // `from` may only be the caller's own identity: impersonating another
                // member (or the captain) would poison the mailbox and event records.
                if (args.from !== undefined && args.from !== from) {
                    throw new Error(`agent_teams_send_message: "from" must be your own identity ("${from}"), not "${args.from}"`);
                }
                const sourceTaskId = args.source_task_id?.trim() || undefined;
                const sourceAttemptId = args.source_attempt_id?.trim() || undefined;
                if ((sourceTaskId === undefined) !== (sourceAttemptId === undefined))
                    throw new Error('send_message requires source_task_id and source_attempt_id together');
                const source = sourceTaskId === undefined
                    ? identity.kind === 'member' ? memberOpenTask(fresh, identity.name) ?? fresh.tasks.filter(item => item.assignee === identity.name && item.attemptId !== undefined).sort((a, b) => b.updatedAt - a.updatedAt)[0] : undefined
                    : requireTask(fresh, sourceTaskId);
                if (sourceTaskId !== undefined && (source?.assignee !== identity.name || source.attemptId !== sourceAttemptId)) {
                    throw new Error('stale or foreign source attempt; stop sending results from the revoked task');
                }
                const sourceFields = source?.attemptId === undefined ? {} : { sourceTaskId: source.id, sourceAttemptId: source.attemptId, sourceTaskStatus: source.status };
                const owned = to === CAPTAIN_KEY ? undefined : memberOpenTask(fresh, requireMember(fresh, to).name);
                const duplicate = (await readMailbox(stateRoot, fresh.id, to)).find(message => message.from === from
                    && message.content === args.content && message.taskId === owned?.id && message.attemptId === owned?.attemptId
                    && message.sourceTaskId === sourceFields.sourceTaskId && message.sourceAttemptId === sourceFields.sourceAttemptId && message.sourceTaskStatus === sourceFields.sourceTaskStatus
                    && isCurrentMail(fresh, message) && (message.attemptId !== undefined || message.sourceAttemptId !== undefined || message.readAt === undefined));
                if (duplicate !== undefined)
                    return { kind: 'duplicate', message: duplicate, from };
                if (to === CAPTAIN_KEY) {
                    const message = { ...createMessage(from, CAPTAIN_KEY, args.content), ...sourceFields, deliveryClaimedAt: Date.now() };
                    await appendMailbox(stateRoot, fresh.id, CAPTAIN_KEY, message);
                    appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, caller.session), 'agent-teams/message-sent', {
                        teamId: fresh.id,
                        messageId: message.id,
                        from,
                        to: CAPTAIN_KEY,
                        content: args.content,
                        ts: message.ts,
                    });
                    return { kind: 'captain', fresh, identity, message, from };
                }
                if (fresh.halted === true) {
                    throw new Error(`team "${fresh.name}" is halted; call agent_teams_resume before waking a member`);
                }
                const recipient = requireMember(fresh, to);
                const message = { ...createMessage(from, recipient.name, args.content), ...sourceFields, deliveryClaimedAt: Date.now(),
                    ...owned?.attemptId === undefined ? {} : { taskId: owned.id, attemptId: owned.attemptId },
                };
                await appendMailbox(stateRoot, fresh.id, recipient.name, message);
                appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, caller.session), 'agent-teams/message-sent', {
                    teamId: fresh.id,
                    messageId: message.id,
                    from,
                    to: recipient.name,
                    content: args.content,
                    ts: message.ts,
                });
                return { kind: 'member', fresh, identity, message, from, recipient };
            });
            if (prepared.kind === 'duplicate')
                return { message_id: prepared.message.id, from: prepared.from, to: prepared.message.to, delivered: 'duplicate' };
            // Resolve a live lead only after releasing the state lock: the recorded
            // captain while resident, otherwise the nearest live fork descendant, so
            // a human working in a fork still receives member reports. The plugin
            // mailbox is already durable if no lead session is live.
            const captain = nearestLiveLead(ctx, prepared.fresh);
            if (prepared.kind === 'captain') {
                let delivered = 'mailbox';
                if (captain !== undefined && prepared.identity.kind === 'member') {
                    delivered = steerCaptainReport(captain, prepared.from, args.content, mailboxPrompt(prepared.fresh.id, CAPTAIN_KEY, [prepared.message])) ? 'live' : 'mailbox';
                }
                if (delivered === 'live') {
                    await withTeamLock(teamLockKey(stateRoot, prepared.fresh.id), () => (markMailboxDelivered(stateRoot, prepared.fresh.id, CAPTAIN_KEY, [prepared.message.id])));
                }
                else {
                    await withTeamLock(teamLockKey(stateRoot, prepared.fresh.id), () => (releaseMailboxDelivery(stateRoot, prepared.fresh.id, CAPTAIN_KEY, [prepared.message.id])));
                }
                return { message_id: prepared.message.id, from: prepared.from, to: CAPTAIN_KEY, delivered };
            }
            let delivered = 'mailbox';
            if (captain !== undefined) {
                const text = mailboxPrompt(prepared.fresh.id, prepared.recipient.name, [prepared.message]);
                const accepted = await dispatchMember(captain, prepared.fresh.id, prepared.recipient.name, text, exec.signal, 'steer', prepared.message.attemptId);
                delivered = accepted ? 'wake' : 'mailbox';
                if (accepted) {
                    await withTeamLock(teamLockKey(stateRoot, prepared.fresh.id), () => (markMailboxDelivered(stateRoot, prepared.fresh.id, prepared.recipient.name, [prepared.message.id])));
                }
            }
            if (delivered === 'mailbox') {
                await withTeamLock(teamLockKey(stateRoot, prepared.fresh.id), () => (releaseMailboxDelivery(stateRoot, prepared.fresh.id, prepared.recipient.name, [prepared.message.id])));
            }
            return {
                message_id: prepared.message.id,
                from: prepared.from,
                to: prepared.recipient.name,
                delivered,
            };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_status',
        description: 'Team snapshot: members with live activity and tasks with status/assignee/dependencies/output. Captains also see every team mailbox; members see only their own inbox. Use after mailbox progress deliveries or for an explicit status request. After dispatch, end your turn while members work; do not repeatedly poll.',
        parameters: {},
        output: {
            // t110 / V17-F2: this schema used to declare NO properties, so nothing in the
            // codebase stated which keys this DTO owes its readers and no test could compare
            // the declaration with what execute() really returns. The key list below is that
            // declared contract; tests/t98-render-coverage.mjs runs the tool against a seeded
            // team and checks it TWO-WAY against the payload the DTO really produces (a key the
            // code drops, e.g. removed_count, and a key the code adds without declaring here are
            // both findings). additionalProperties stays true so a DTO addition is a gate
            // finding rather than a runtime refusal for every other reader.
            schema: {
                type: 'object',
                additionalProperties: true,
                properties: {
                    team_id: { type: 'string' },
                    team_name: { type: 'string' },
                    description: { type: 'string' },
                    phase: { type: 'string' },
                    halted: { type: 'boolean' },
                    escalated: { type: 'boolean' },
                    loop_state: { type: 'string' },
                    loop_summary: { type: 'string' },
                    deliverable: { type: 'boolean' },
                    coverage: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    delivery: { type: 'object', additionalProperties: true },
                    profile: { type: 'object', additionalProperties: true },
                    viewer: { type: 'string' },
                    members: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    removed_count: { type: 'number' },
                    removed_members: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    tasks: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    captain_inbox: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    member_inbox: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    member_inboxes: { type: 'object', additionalProperties: true },
                    mailbox_warnings: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    mailbox_warning_count: { type: 'number' },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderStatus(value) }],
        },
        async execute(_args, exec) {
            const caller = requireCaptain(exec);
            const workspace = workspaceOf(caller);
            const stateRoot = stateRootOf(workspace, config);
            const located = await requireParticipantTeam(ctx, workspace, config, caller);
            if (await sessionLeadsTeamAsync(ctx, located, caller.id)) {
                await scheduler.kickTeam(workspace, located.id, await memberOperationParent(ctx, located, caller));
            }
            const { team, identity } = await withTeamLock(teamLockKey(stateRoot, located.id), () => requireFreshParticipant(ctx, stateRoot, located.id, caller.id));
            const activity = memberActivity(ctx, team.members.map((member) => member.id));
            const audit = auditTeamWorkspace(workspace, team);
            const members = team.members
                .filter((member) => member.status !== 'removed')
                .map((member) => {
                // The spawn route (provider/model) stays the spine; the override, the
                // emergency route and the next route are reported beside it (design v1 §4.2 e).
                const next = currentMemberRoute(memberSelections, member);
                const override = member.routeOverride;
                return {
                    name: member.name,
                    role: member.role ?? '',
                    provider: member.provider ?? '',
                    model: member.model ?? '',
                    reasoning_effort: member.reasoningEffort ?? '',
                    tool_policy: member.toolPolicy ?? '',
                    // The member's own execution prompt, reported ONLY when the
                    // member actually carries one: a member without a prompt keeps
                    // the key absent, exactly like last_failure and route_override
                    // below (the DTO never reports null).
                    ...typeof member.executionPrompt !== 'string' || member.executionPrompt.trim() === ''
                        ? {}
                        : { execution_prompt: member.executionPrompt },
                    status: member.status,
                    activity: member.id !== '' ? (activity.get(member.id) ?? 'unknown') : 'unspawned',
                    active_provider: member.activeProvider ?? '',
                    active_model: member.activeModel ?? '',
                    fallback_active: member.fallbackActive === true,
                    // The durable fallback declaration, reported next to the
                    // already-degraded flag: this DTO is assembled here and does
                    // NOT come from assembleTeamSnapshot (lesson t30).
                    ...member.fallback === undefined ? {} : {
                        fallback: {
                            provider: member.fallback.provider,
                            model: member.fallback.model,
                            ...member.fallback.reasoningEffort === undefined ? {} : { reasoning_effort: member.fallback.reasoningEffort },
                        },
                    },
                    ...override === undefined ? {} : {
                        route_override: {
                            provider: override.provider,
                            model: override.model,
                            ...override.reasoningEffort === undefined ? {} : { reasoning_effort: override.reasoningEffort },
                            source: override.source ?? '',
                            at: override.at ?? 0,
                        },
                    },
                    ...next === undefined ? {} : { next_route: next.provider + '/' + next.model },
                    ...member.spawnError === undefined ? {} : { spawn_error: member.spawnError },
                    // NFR-KHANG-LOI-PROVIDER-01: the last provider death of this
                    // member, written durably by members.js and reported here so
                    // the captain sees it in the tool it reads daily.
                    ...member.lastFailure === undefined ? {} : {
                        last_failure: {
                            code: member.lastFailure.code,
                            message: member.lastFailure.message,
                            at: member.lastFailure.at,
                            provider: member.lastFailure.provider ?? '',
                            model: member.lastFailure.model ?? '',
                        },
                    },
                };
            });
            // t107 / BUG-027: this payload used to DROP every 'removed' row, so a team whose
            // history lives in removed records (ERP keeps routeOverride with source 'erp'
            // plus erpStage / runtimeSetup for migration and rollback) lost information at the
            // PAYLOAD layer — BUG-024/025 were text-only. The live roster stays filtered
            // exactly as before because every other tool depends on it; the removed records
            // are reported beside it, with the route picture a rollback needs.
            const removedMembers = team.members
                .filter((member) => member.status === 'removed')
                .map((member) => {
                const override = member.routeOverride;
                return {
                    name: member.name,
                    role: member.role ?? '',
                    provider: member.provider ?? '',
                    model: member.model ?? '',
                    ...member.reasoningEffort === undefined || member.reasoningEffort === '' ? {} : { reasoning_effort: member.reasoningEffort },
                    ...member.joinedAt === undefined ? {} : { joined_at: member.joinedAt },
                    // MEASURED on the real ERP file: its removed rows carry no routeOverride at
                    // all; the durable material they do carry is runtimeSetup (a 4 000-character
                    // persona plus the tool filter) and joinedAt. Both are clipped here so the
                    // payload cannot double in size over seven historical rows.
                    ...member.runtimeSetup === undefined ? {} : {
                        runtime_setup: {
                            ...typeof member.runtimeSetup.persona !== 'string' ? {} : { persona: clipText(member.runtimeSetup.persona, 400) },
                            ...member.runtimeSetup.toolFilter === undefined ? {} : { tool_filter: clipText(JSON.stringify(member.runtimeSetup.toolFilter), 400) },
                        },
                    },
                    ...override === undefined ? {} : {
                        route_override: {
                            provider: override.provider,
                            model: override.model,
                            ...override.reasoningEffort === undefined ? {} : { reasoning_effort: override.reasoningEffort },
                            source: override.source ?? '',
                            at: override.at ?? 0,
                            by: override.by ?? '',
                        },
                    },
                };
            });
            const tasks = team.tasks.map((task) => ({
                id: task.id,
                subject: task.subject,
                status: task.status,
                assignee: task.assignee ?? '',
                dependencies: task.dependencies,
                attempt: task.attempt ?? 0,
                attempt_id: task.attemptId ?? '',
                reassigning: task.reassigning === true,
                kind: taskKindOf(task),
                ...task.round === undefined ? {} : { round: task.round },
                ...task.verdict === undefined ? {} : { verdict: task.verdict },
                ...task.supplementalEvidence === undefined ? {} : { supplemental_evidence: JSON.stringify(task.supplementalEvidence) },
                ...task.findingSourceTaskIds === undefined ? {} : { fixes: task.findingSourceTaskIds.join(',') },
                findings_open: (task.findings ?? []).filter((finding) => finding.resolved !== true).length,
                ...task.profileSeedId === undefined ? {} : { seed_id: task.profileSeedId },
                ...task.output !== undefined ? { output: task.output } : {},
            }));
            const mailboxWarnings = [];
            let mailboxWarningCount = 0;
            const reportMalformed = (agentKey) => (lineNumber) => {
                mailboxWarningCount += 1;
                if (mailboxWarnings.length < 10) {
                    mailboxWarnings.push(`${agentKey} mailbox line ${lineNumber}`);
                }
            };
            const captainInbox = identity.kind === 'captain'
                ? await readCurrentMailbox(stateRoot, team.id, CAPTAIN_KEY, reportMalformed(CAPTAIN_KEY))
                : [];
            const ownInbox = identity.kind === 'member' ? (await readCurrentMailbox(stateRoot, team.id, identity.name)).slice(0, 10) : [];
            const memberInboxes = {};
            const visibleMembers = identity.kind === 'captain'
                ? members
                : members.filter((member) => member.name === identity.name);
            for (const member of visibleMembers) {
                const messages = await readCurrentMailbox(stateRoot, team.id, member.name, reportMalformed(member.name));
                if (messages.length > 0) {
                    memberInboxes[member.name] = {
                        count: messages.length,
                        latest: messages[messages.length - 1]?.content.slice(0, 200) ?? '',
                    };
                }
            }
            const coverage = buildCoverageMatrix([...new Set(team.tasks.flatMap((item) => item.coverageOf ?? []))], team.tasks).map((row) => ({
                goal_item: row.goal_item,
                task_ids: [...row.task_ids],
                status: row.status,
                ...row.evidence === undefined ? {} : { evidence: row.evidence },
            }));
            const deliveryCheck = canDeclareDelivery(team, audit);
            const delivery = {
                ok: deliveryCheck.ok,
                blockers: [...deliveryCheck.blockers],
                warnings: [...deliveryCheck.warnings],
            };
            const loop = describeQualityLoop(team, audit);
            const result = {
                team_id: team.id,
                team_name: team.name,
                description: team.description ?? '',
                phase: team.phase ?? 'running',
                halted: loop.halted,
                escalated: loop.escalated,
                loop_state: loop.state,
                loop_summary: loop.summary,
                deliverable: loop.deliverable,
                coverage,
                delivery,
                ...team.profile === undefined ? {} : {
                    profile: {
                        name: team.profile.name,
                        ...team.profile.protocol === undefined
                            ? {}
                            : { protocol: team.profile.protocol.slice(0, 240) },
                        ...team.profile.taskPlanning === undefined ? {} : { task_planning: team.profile.taskPlanning },
                    },
                },
                viewer: identity.name,
                members,
                // The rows the roster no longer counts, reported as data and not only as
                // text, so a caller can act on them (t107).
                removed_count: removedMembers.length,
                removed_members: removedMembers,
                tasks,
                captain_inbox: captainInbox.slice(0, 10).map((message) => ({
                    from: message.from,
                    content: mailboxContent(message),
                    ts: message.ts,
                })),
                member_inbox: ownInbox.map(message => ({ from: message.from, content: mailboxContent(message), ts: message.ts })),
                member_inboxes: memberInboxes,
                mailbox_warnings: mailboxWarnings,
                mailbox_warning_count: mailboxWarningCount,
            };
            const acknowledged = identity.kind === 'captain'
                ? captainInbox.slice(0, 10).map(message => message.id)
                : ownInbox.map(message => message.id);
            if (acknowledged.length > 0) {
                await withTeamLock(teamLockKey(stateRoot, team.id), () => (acknowledgeMailbox(stateRoot, team.id, identity.kind === 'captain' ? CAPTAIN_KEY : identity.name, acknowledged)));
            }
            return result;
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_resume',
        description: 'Explicitly resume a halted team. Requires a non-empty reason. Does not recreate cancelled tasks; only still-pending work is scheduled.',
        parameters: {
            reason: { type: 'string', required: true, description: 'Why the team is being resumed.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    status: { type: 'string', required: true },
                    team_id: { type: 'string', required: true },
                    reason: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: value.status === 'already_running'
                        ? `Team ${value.team_id} is already running.`
                        : `Team ${value.team_id} resumed (${value.reason}).`,
                }],
        },
        async execute(args, exec) {
            const captain = requireCaptain(exec);
            const workspace = workspaceOf(captain);
            const stateRoot = stateRootOf(workspace, config);
            const team = await requireCaptainTeam(ctx, workspace, config, captain);
            const result = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
                const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id);
                const resumed = resumeTeamState(fresh, args.reason);
                if (resumed.status === 'rejected')
                    throw new Error(resumed.error ?? 'resume rejected');
                if (resumed.status === 'resumed') {
                    fresh.halted = false;
                    fresh.haltedAt = undefined;
                    await writeTeam(stateRoot, fresh);
                    appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/team-resumed', {
                        teamId: fresh.id,
                        reason: args.reason,
                    });
                }
                return {
                    status: resumed.status,
                    team_id: fresh.id,
                    reason: args.reason,
                };
            });
            if (result.status === 'resumed')
                await scheduler.kickTeam(workspace, team.id, await liveLeadAnchorAgent(ctx, team, captain));
            return result;
        },
    }));
    ctx.tools.register(defineTool({
        name: 'agent_teams_delete',
        description: 'End and archive your team: interrupts members and moves the current tasks and mailboxes out of active state for later inspection. Use when the work is done or explicitly abandoned. A same-name archive replaces its previous generation.',
        parameters: {},
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    deleted: { type: 'boolean', required: true },
                    team_name: { type: 'string', required: true },
                },
            },
            render: (args, value) => [{
                    type: 'text',
                    text: `Team "${value.team_name}" ended and archived.`,
                }],
        },
        async execute(_args, exec) {
            const captain = requireCaptain(exec);
            const workspace = workspaceOf(captain);
            const stateRoot = stateRootOf(workspace, config);
            const team = await requireCaptainTeam(ctx, workspace, config, captain);
            const members = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
                const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id);
                // Include previously removed members so deleting a pre-fix team also
                // retires durable catalog entries left behind by remove_member.
                const roster = fresh.members.map(member => ({ ...member }));
                for (const member of fresh.members) {
                    await discardMailboxMessages(stateRoot, fresh.id, member.name, (await readUnreadMailbox(stateRoot, fresh.id, member.name)).map(message => message.id));
                    if (member.status === 'removed')
                        continue;
                    member.status = 'removed';
                    for (const task of fresh.tasks) {
                        if (task.assignee === member.name && !TERMINAL_TASK_STATUSES.includes(task.status))
                            invalidateTaskAttempt(task);
                    }
                }
                await writeTeam(stateRoot, fresh);
                return roster;
            });
            await recordRetiredMemberIds(stateRoot, members.map(member => member.id));
            await stopTeamMemberActivations(ctx, await memberOperationParent(ctx, team, captain), members, exec.signal);
            await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
                const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id);
                appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/team-deleted', {
                    teamId: fresh.id,
                });
                // Archive, not delete: tasks (with their dependency graph) and the
                // mailboxes stay on disk for later review and dependency rebuilds.
                await archiveTeamDir(stateRoot, fresh.id);
            });
            return { deleted: true, team_name: team.name };
        },
    }));
    // Live-member hydration validates saved filters against registered tools.
    const memberSelections = installMemberSelectionRuntime(ctx, config.stateDir, (workspace, teamId, memberName) => (scheduler.kickMember(workspace, teamId, memberName)));
    const runtime = {
        isPendingMember: memberSelections.isPendingMember,
        updateStagedPlan,
        updateStagedPlanBatch,
        approveStagedTeam,
        continueStagedPlanning,
        discardStagedTeam,
        // v1 route control plane (design v1 §4.2 c): the member-selection registry is
        // the one live registry, so no second one is created here.
        setMemberRoute: (captain, request, signal) => setMemberRoute(ctx, config, memberSelections, captain, request, signal),
        addMember: (captain, request, signal) => addMemberNow(ctx, config, memberSelections, captain, request, signal, kickMember),
        currentMemberRoute: (member) => currentMemberRoute(memberSelections, member),
        // Profile control plane (role / execution prompt): a captain edit that is
        // durable first and never interrupts the member it names.
        setMemberProfile: (captain, request, signal) => setMemberProfileNow(ctx, config, captain, request, signal),
    };
    return runtime;
}
async function initializeProfileTeam(input) {
    // Tool gateways can materialize omitted optional strings as blanks (#234).
    // Normalize only the tool-supplied roster; owner profile validation remains
    // strict, and required fields, unknown policies and route pairing still fail.
    const inlinePlan = input.inlinePlan === undefined ? undefined : {
        ...input.inlinePlan,
        members: input.inlinePlan.members.map(member => ({
            ...member,
            role: trimmedOptional(member.role),
            provider: trimmedOptional(member.provider),
            model: trimmedOptional(member.model),
            reasoning_effort: trimmedOptional(member.reasoning_effort),
            tool_policy: trimmedOptional(member.tool_policy),
        })),
    };
    const profile = resolveTeamProfile(inlinePlan === undefined ? input.config.profiles : { [input.profileName]: inlinePlan }, input.profileName, input.config.maxMembers);
    const selections = [];
    for (const template of profile.members) {
        selections.push(await resolveMemberLlmSelection(input.ctx, input.captain, {
            provider: template.provider,
            model: template.model,
            defaultModel: input.config.memberModel,
            defaultProvider: input.config.memberLlmProvider,
            reasoningEffort: template.reasoningEffort,
            fallback: template.fallback ?? profile.fallback ?? input.config.fallback,
        }, input.exec.signal));
    }
    await validateMemberLlmSelections(input.ctx, selections, input.exec.signal);
    const now = Date.now();
    const seedToActual = new Map(profile.tasks.map((template, index) => [template.id, `t${index + 1}`]));
    const draft = {
        name: input.teamName,
        id: input.teamId,
        description: input.description,
        profile: {
            name: profile.name,
            ...profile.description === undefined ? {} : { description: profile.description },
            ...profile.protocol === undefined ? {} : { protocol: profile.protocol },
            ...profile.executionPrompt === undefined ? {} : { executionPrompt: profile.executionPrompt },
            ...profile.fallback === undefined ? {} : { fallback: profile.fallback },
            taskPlanning: profile.taskPlanning,
            ...profile.reviewPolicy === undefined ? {} : { reviewPolicy: profile.reviewPolicy },
        },
        ...profile.reviewPolicy === undefined ? {} : { reviewPolicy: profile.reviewPolicy },
        captainSessionId: input.captain.id,
        createdAt: now,
        ...input.staged ? { phase: 'staged', planReviewState: 'awaiting_review' } : {},
        members: profile.members.map((template, index) => {
            const selection = selections[index];
            // A profile member selects a policy by id; an unknown id fails here,
            // before the team directory and any child session exist (#59).
            const toolSelection = memberToolSelection(input.config, input.captain, template.toolPolicy);
            return {
                id: '',
                name: template.name,
                role: template.role,
                provider: selection.provider,
                model: selection.model,
                reasoningEffort: selection.reasoningEffort,
                executionPrompt: template.executionPrompt ?? profile.executionPrompt ?? input.config.executionPrompt,
                ...selection.fallback === undefined ? {} : { fallback: selection.fallback },
                ...toolSelection,
                joinedAt: now,
                status: 'idle',
            };
        }),
        tasks: profile.tasks.map((template, index) => ({
            id: `t${index + 1}`,
            profileSeedId: template.id,
            subject: template.subject,
            description: template.description,
            status: 'pending',
            assignee: template.assignee,
            dependencies: template.dependencies.map((dependency) => seedToActual.get(dependency) ?? dependency),
            attempt: 0,
            createdAt: now,
            updatedAt: now,
        })),
        taskSeq: profile.tasks.length,
    };
    // Roster creation is durable planning only. The scheduler starts each
    // member with its first actual task once its dependencies are satisfied.
    if (input.inlinePlan !== undefined)
        delete draft.profile;
    await createTeamDir(input.stateRoot, draft);
    return { committed: true, state: draft };
}
function parseFindings(value) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value))
        throw new Error('findings must be an array');
    return value.map((item, index) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            throw new Error(`findings[${index}] must be an object`);
        }
        const raw = item;
        if (typeof raw['id'] !== 'string' || raw['id'].trim() === '')
            throw new Error(`findings[${index}].id is required`);
        if (raw['severity'] !== 'low' && raw['severity'] !== 'medium' && raw['severity'] !== 'high' && raw['severity'] !== 'blocker') {
            throw new Error(`findings[${index}].severity is invalid`);
        }
        if (typeof raw['problem'] !== 'string' || raw['problem'].trim() === '')
            throw new Error(`findings[${index}].problem is required`);
        if (typeof raw['requiredFix'] !== 'string' || raw['requiredFix'].trim() === '')
            throw new Error(`findings[${index}].requiredFix is required`);
        return {
            id: raw['id'].trim(),
            severity: raw['severity'],
            problem: raw['problem'],
            requiredFix: raw['requiredFix'],
            // A blank optional file must be omitted, not persisted: durable-state
            // validation requires non-empty optional strings (issue #105 class).
            ...typeof raw['file'] === 'string' && raw['file'].trim() !== '' ? { file: raw['file'] } : {},
            // Only a contract-valid line is persisted. A model that materializes
            // "no line number" as -1 (or sends a non-integer) must not write a record
            // the durable validator rejects on the next read, which used to brick the
            // entire team (issue #188). The predicate is shared with
            // `isReviewFinding`, so the two sides cannot drift apart again.
            ...isValidFindingLine(raw['line']) ? { line: raw['line'] } : {},
            ...typeof raw['resolved'] === 'boolean' ? { resolved: raw['resolved'] } : {},
        };
    });
}
function parseAcceptanceResults(value) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value))
        throw new Error('acceptanceResults must be an array');
    return value.map((item, index) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            throw new Error(`acceptanceResults[${index}] must be an object`);
        }
        const raw = item;
        if (typeof raw['criterion'] !== 'string' || raw['criterion'].trim() === '') {
            throw new Error(`acceptanceResults[${index}].criterion is required`);
        }
        if (raw['status'] !== 'passed' && raw['status'] !== 'failed') {
            throw new Error(`acceptanceResults[${index}].status must be passed or failed`);
        }
        return {
            criterion: raw['criterion'],
            status: raw['status'],
            ...typeof raw['evidence'] === 'string' ? { evidence: raw['evidence'] } : {},
        };
    });
}
function parseCommandResults(value) {
    if (value === undefined)
        return undefined;
    if (!Array.isArray(value))
        throw new Error('commandsRun must be an array');
    return value.map((item, index) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            throw new Error(`commandsRun[${index}] must be an object`);
        }
        const raw = item;
        if (typeof raw['command'] !== 'string' || raw['command'].trim() === '') {
            throw new Error(`commandsRun[${index}].command is required`);
        }
        if (raw['status'] !== 'passed' && raw['status'] !== 'failed') {
            throw new Error(`commandsRun[${index}].status must be passed or failed`);
        }
        return {
            command: raw['command'],
            status: raw['status'],
            ...typeof raw['exitCode'] === 'number' ? { exitCode: raw['exitCode'] } : {},
            ...typeof raw['evidence'] === 'string' ? { evidence: raw['evidence'] } : {},
        };
    });
}
export function applyQualityFollowUp(team, closed, snapshotPaths, pathExists) {
    const planned = planQualityFollowUp(team, closed, pathExists === undefined ? {} : { pathExists });
    if (planned.escalated === true)
        team.escalated = true;
    const created = [];
    const existing = [...team.tasks];
    const now = Date.now();
    const idBySubject = new Map();
    for (const draft of planned.created) {
        team.taskSeq += 1;
        const id = `t${team.taskSeq}`;
        if (draft.id !== undefined)
            idBySubject.set(draft.id, id);
        if (draft.subject !== undefined)
            idBySubject.set(draft.subject, id);
        const dependencies = (draft.dependencies ?? []).map((dependency) => {
            if (team.tasks.some((item) => item.id === dependency))
                return dependency;
            return idBySubject.get(dependency) ?? dependency;
        });
        // Record the workspace the generated work order was derived from, so a
        // later round that changes a cited file can mark it stale instead of
        // letting a member read a frozen snapshot as authoritative (issue #174).
        const contractSnapshot = draft.contractPaths === undefined || draft.contractPaths.length === 0 || snapshotPaths === undefined
            ? undefined
            : snapshotPaths(draft.contractPaths);
        const next = {
            id,
            subject: draft.subject ?? `${draft.kind}-round-${draft.round ?? 1}`,
            status: 'pending',
            assignee: draft.assignee,
            dependencies,
            attempt: 0,
            createdAt: now,
            updatedAt: now,
            kind: draft.kind,
            ...draft.description === undefined ? {} : { description: draft.description },
            ...draft.round === undefined ? {} : { round: draft.round },
            ...draft.objective === undefined ? {} : { objective: draft.objective },
            ...draft.inScope === undefined ? {} : { inScope: draft.inScope },
            ...draft.outOfScope === undefined ? {} : { outOfScope: draft.outOfScope },
            ...draft.acceptance === undefined ? {} : { acceptance: draft.acceptance },
            ...draft.verify === undefined ? {} : { verify: draft.verify },
            ...draft.sourceTaskId === undefined ? {} : { sourceTaskId: draft.sourceTaskId },
            ...draft.sourceFindingIds === undefined ? {} : { sourceFindingIds: draft.sourceFindingIds },
            ...draft.findingSourceTaskIds === undefined ? {} : { findingSourceTaskIds: draft.findingSourceTaskIds },
            ...draft.reviewedTaskId === undefined ? {} : { reviewedTaskId: idBySubject.get(draft.reviewedTaskId) ?? draft.reviewedTaskId },
            ...contractSnapshot === undefined ? {} : { contractSnapshot },
        };
        team.tasks.push(next);
        created.push(next);
    }
    // A staged full delivery plan may already contain downstream integration
    // work that points at the first requirements/review gate. When that gate
    // opens an automatic revision loop, move only still-pending downstream
    // edges to the new terminal gate so the approved plan can continue after
    // the repair instead of waiting forever on an intentionally failed task.
    const replacement = created.at(-1);
    if (replacement !== undefined) {
        for (const task of existing) {
            if (task.status !== 'pending' || !task.dependencies.includes(closed.id))
                continue;
            task.dependencies = task.dependencies.map((dependency) => (dependency === closed.id ? replacement.id : dependency));
            task.updatedAt = now;
        }
    }
    return {
        created,
        escalated: planned.escalated === true,
        ...planned.reason === undefined ? {} : { reason: planned.reason },
        ...planned.excludedFindings === undefined ? {} : { excludedFindings: planned.excludedFindings },
    };
}
/** Build the `memberRuntime` config handed to member helpers. */
function memberRuntime(config) {
    return {
        provider: config.memberProvider,
        maxDepth: config.memberMaxDepth,
        executionPrompt: config.executionPrompt,
        fallback: config.fallback,
        // The configured member route default: a route change that names no provider/model
        // resolves against these two, so leaving them out would hand the runtime an
        // undefined default (design v1 §2.3).
        memberModel: config.memberModel,
        memberLlmProvider: config.memberLlmProvider,
        // The owner-declared policy table (t17). A manual add computes the same
        // owner-safe relaxable deny set the scheduler path computes; without the
        // table it would have to fail loud on every policy member instead.
        toolPolicies: config.toolPolicies,
    };
}

/**
 * Read one hook that the v1 route registry adds to lib/members.js (design v1 §4.1).
 * The hooks are read off the module namespace instead of being imported by name: a
 * named import of a symbol the runtime module does not export yet is a link-time
 * error for the whole package, and the runtime side can land independently.
 * @param name - exported hook name.
 * @returns the hook, or undefined when this build provides no such hook.
 */
function membersFunction(name) {
    const candidate = membersApi[name];
    return typeof candidate === 'function' ? candidate : undefined;
}
/**
 * Add one member to the roster. `agent_teams_add_member` and the Web `/plan`
 * add_member action both come through here, so the roster rules, the manual cap and
 * the immediate start cannot drift between the tool and HTTP surfaces (design v1 §4.2 d).
 * @param ctx - plugin context.
 * @param config - resolved tool config.
 * @param memberSelections - live member-selection registry.
 * @param captain - the calling captain agent.
 * @param request - the roster row to add.
 * @param signal - abort signal of the calling turn.
 * @returns the snake_case result reported by the tool and the HTTP layer.
 */
async function addMemberNow(ctx, config, memberSelections, captain, request, signal, kick) {
    const workspace = workspaceOf(captain);
    const stateRoot = stateRootOf(workspace, config);
    const team = await requireCaptainTeam(ctx, workspace, config, captain);
    const activation = request.activation ?? 'immediate';
    // A manual add may grow the roster past the automatic plan cap, so it has its own
    // cap; a config built before that option existed keeps maxMembers (design v1 D5).
    const cap = config.maxManualMembers ?? config.maxMembers;
    const created = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id);
        const memberName = request.name.trim();
        if (memberName === '')
            throw new Error('member name must not be empty');
        const memberKey = sanitizeKey(memberName);
        if (memberKey === CAPTAIN_KEY) {
            throw new Error('member name "' + request.name + '" is reserved for the captain');
        }
        if (fresh.members.some((candidate) => sanitizeKey(candidate.name) === memberKey)) {
            throw new Error('member name "' + request.name + '" has already been used in team "' + fresh.name + '"');
        }
        if (fresh.members.filter((candidate) => candidate.status !== 'removed').length >= cap) {
            throw new Error('team "' + fresh.name + '" is at its manual member cap (' + cap + ')');
        }
        const selection = await resolveMemberLlmSelection(ctx, captain, {
            provider: request.provider,
            model: request.model,
            defaultModel: config.memberModel,
            defaultProvider: config.memberLlmProvider,
            reasoningEffort: request.reasoningEffort,
            fallback: config.fallback,
        }, signal);
        const toolSelection = memberToolSelection(config, captain, request.toolPolicy);
        const member = {
            id: '',
            name: memberName,
            role: request.role,
            provider: selection.provider,
            model: selection.model,
            reasoningEffort: selection.reasoningEffort,
            ...selection.fallback === undefined ? {} : { fallback: selection.fallback },
            executionPrompt: request.executionPrompt,
            ...toolSelection,
            joinedAt: Date.now(),
            status: 'idle',
        };
        await validateMemberLlmSelections(ctx, [selection], signal);
        fresh.members.push(member);
        await writeTeam(stateRoot, fresh);
        appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/member-added', {
            teamId: fresh.id,
            memberId: member.id,
            name: member.name,
            ...member.role !== undefined ? { role: member.role } : {},
        });
        let spawned = false;
        // A manual add to a running team must be usable in this turn: start the child now
        // instead of waiting for its first ready task. A staged plan is unchanged and never
        // spawns before approval (design v1 §4.2 d3).
        if (activation === 'immediate' && (fresh.phase ?? 'running') !== 'staged' && fresh.halted !== true) {
            const activateMemberNow = membersFunction('activateMemberNow');
            if (activateMemberNow !== undefined) {
                let orphan;
                try {
                    await activateMemberNow(ctx, memberRuntime(config), memberSelections, captain, fresh, member, member.toolFilter, memberWelcome(fresh, member.name), signal);
                    orphan = { ...member };
                    delete member.spawnError;
                    await writeTeam(stateRoot, fresh);
                    orphan = undefined;
                    spawned = true;
                }
                catch (error) {
                    // The roster row stays: a member that failed to start must stay visible on
                    // the team that already recorded the add, with the reason attached.
                    let reason = String(error);
                    if (error instanceof Error && typeof error.stack === 'string' && error.stack !== '')
                        reason = error.stack;
                    ctx.logger.warn('agent-teams: immediate start failed for ' + memberName + ': ' + String(error));
                    member.spawnError = reason;
                    await writeTeam(stateRoot, fresh);
                    if (orphan !== undefined) {
                        await recordRetiredMemberIds(stateRoot, [orphan.id]);
                        await stopTeamMemberActivations(ctx, captain, [orphan], signal);
                    }
                }
            }
        }
        return {
            member_name: member.name,
            member_id: member.id,
            provider: selection.provider,
            model: selection.model,
            ...selection.reasoningEffort === undefined
                ? {}
                : { reasoning_effort: selection.reasoningEffort },
            ...member.toolPolicy === undefined ? {} : { tool_policy: member.toolPolicy },
            status: member.status,
            phase: fresh.phase ?? 'running',
            spawned,
        };
    });
    // A staged roster, an on-task add and a build without the activation hook keep the
    // pre-existing path: the scheduler starts the member with its first ready task.
    if (created.spawned !== true) {
        if (typeof kick === 'function')
            await kick(workspace, team.id, created.member_name, await liveLeadAnchorAgent(ctx, team, captain));
    }
    const latest = (await readTeam(stateRoot, team.id))?.members.find(member => member.name === created.member_name);
    return latest === undefined ? created : { ...created, member_id: latest.id, status: latest.status };
}
/**
 * Change one member's route through the live registry (design v1 §4.1). The registry
 * owns the durable override, the disk-before-RAM order and the model-changed notice, so
 * the tool and the HTTP `/plan` action cannot apply the change differently.
 * @param ctx - plugin context.
 * @param config - resolved tool config.
 * @param memberSelections - live member-selection registry.
 * @param captain - the calling captain agent.
 * @param request - the requested route.
 * @param signal - abort signal of the calling turn.
 * @returns the snake_case route result reported by the tool and the HTTP layer.
 */
async function setMemberRoute(ctx, config, memberSelections, captain, request, signal) {
    const routeSetter = membersFunction('setMemberRoute');
    if (routeSetter === undefined) {
        throw new Error('changing a member route is not available in this build: lib/members.js provides no setMemberRoute');
    }
    return routeSetter(ctx, memberRuntime(config), memberSelections, captain, config.stateDir, request.teamId, request.memberName, {
        ...request.clear === true ? { clear: true } : {},
        provider: request.provider,
        model: request.model,
        reasoningEffort: request.reasoningEffort,
        ...request.fallbackClear === true ? { fallbackClear: true } : {},
        ...request.fallbackProvider === undefined ? {} : { fallbackProvider: request.fallbackProvider },
        ...request.fallbackModel === undefined ? {} : { fallbackModel: request.fallbackModel },
        ...request.fallbackReasoningEffort === undefined ? {} : { fallbackReasoningEffort: request.fallbackReasoningEffort },
        source: request.source,
        ...request.by === undefined ? {} : { by: request.by },
    }, signal);
}
/**
 * Change one member profile (role / execution prompt) through lib/members.js, so the
 * tool cannot apply the change differently from any other caller. Durable first:
 * lib/members.js owns the disk-before-RAM order and the audit row.
 * @param ctx - plugin context.
 * @param config - resolved tool config.
 * @param captain - the calling captain agent.
 * @param request - the requested profile change.
 * @param signal - abort signal of the calling turn.
 * @returns the snake_case profile result reported by the tool.
 */
async function setMemberProfileNow(ctx, config, captain, request, signal) {
    const profileSetter = membersFunction('setMemberProfile');
    if (profileSetter === undefined) {
        throw new Error('changing a member profile is not available in this build: lib/members.js provides no setMemberProfile');
    }
    return profileSetter(ctx, memberRuntime(config), captain, config.stateDir, request.teamId, request.memberName, {
        ...request.role === undefined ? {} : { role: request.role },
        ...request.executionPrompt === undefined ? {} : { executionPrompt: request.executionPrompt },
        source: request.source,
        ...request.by === undefined ? {} : { by: request.by },
    }, signal);
}
/**
 * The route a member would use next, read from the live registry (design v1 §7).
 * @param memberSelections - live member-selection registry.
 * @param member - the member row as stored.
 * @returns the next route, or undefined when the member has no route at all.
 */
function currentMemberRoute(memberSelections, member) {
    const liveRoute = membersFunction('currentMemberRoute');
    if (liveRoute !== undefined) {
        const route = liveRoute(memberSelections, member);
        if (route !== undefined && route !== null)
            return route;
    }
    if (member.provider === undefined || member.model === undefined)
        return undefined;
    return {
        provider: member.provider,
        model: member.model,
        origin: 'declared',
        live: false,
    };
}
/**
 * Clip one free-text payload value for the model-facing status text, so a 4 000
 * character execution prompt cannot flood the line. t99 / BUG-025.
 * @param text - value to clip.
 * @param max - maximum characters kept before the ellipsis.
 * @returns the clipped text.
 */
function clipText(text, max) {
    const raw = String(text);
    return raw.length <= max ? raw : raw.slice(0, max) + '…';
}
/**
 * One line for a member row the roster no longer counts, printed by the status text so a
 * team that keeps 'removed' records (ERP: a routeOverride with an ERP source) reports them
 * instead of silently dropping them. t107 / BUG-027.
 * @param member - one entry of the removed_members payload.
 * @returns the rendered line.
 */
function removedLine(member) {
    const route = member.provider && member.model ? ' ' + member.provider + '/' + member.model : '';
    const effort = member.reasoning_effort ? ' · reasoning ' + member.reasoning_effort : '';
    const joined = Number.isFinite(member.joined_at) ? ' · joined ' + new Date(member.joined_at).toISOString() : '';
    const setup = member.runtime_setup === undefined
        ? ''
        : (member.runtime_setup.persona === undefined ? '' : ' · persona: ' + clipText(member.runtime_setup.persona, 120))
            + (member.runtime_setup.tool_filter === undefined ? '' : ' · tools: ' + clipText(member.runtime_setup.tool_filter, 120));
    const override = member.route_override;
    const provenance = override === undefined
        ? ''
        : ' (override route: ' + override.provider + '/' + override.model
            + (override.reasoning_effort ? ' (reasoning ' + override.reasoning_effort + ')' : '')
            + (override.source ? ' by ' + override.source : '')
            + (override.by ? ' (' + override.by + ')' : '')
            + (Number.isFinite(override.at) ? ' at ' + new Date(override.at).toISOString() : '')
            + ')';
    return '  - ' + member.name + ' [' + (member.role || 'no role') + ']' + route + effort + joined + setup + provenance;
}
/** Render the status snapshot as compact text for the model. */
function renderStatus(value) {
    const team = value;
    // t107 / BUG-027: 'removed' rows used to disappear from the payload AND from this text,
    // so 'Members (7)' claimed the roster had lost seven people while the file still carried
    // their records (an ERP routeOverride is migration and rollback material). The title now
    // names both counts and the block below prints them; with M = 0 both the title and every
    // other line stay byte-identical to BUG-025, so an ordinary team's text does not move.
    const removedMembers = Array.isArray(team.removed_members) ? team.removed_members : [];
    const memberTitle = removedMembers.length > 0
        ? `Members (${team.members.length} present + ${removedMembers.length} removed):`
        : `Members (${team.members.length}):`;
    const flags = [
        team.halted ? 'halted' : undefined,
        team.escalated ? 'escalated' : undefined,
        team.deliverable ? 'deliverable' : undefined,
        team.loop_state && team.loop_state !== 'running' && team.loop_state !== 'halted' && team.loop_state !== 'escalated'
            ? team.loop_state
            : undefined,
    ].filter((item) => item !== undefined);
    const lines = [
        `Team "${team.team_name}"${team.description ? ` — ${team.description}` : ''}${flags.length > 0 ? ` [${flags.join(', ')}]` : ''}`,
        ...team.profile === undefined ? [] : [`Profile: ${team.profile.name}${team.profile.task_planning ? ` [${team.profile.task_planning}]` : ''}${team.profile.protocol ? ` — ${team.profile.protocol}` : ''}`],
        ...team.loop_summary ? [`Loop: ${team.loop_state ?? ''} — ${team.loop_summary}`.replace(/^Loop:  — /u, 'Loop: ')] : [],
        `Viewing as: ${team.viewer}`,
        memberTitle,
        ...team.members.map((member) => {
            const spine = member.provider && member.model ? ' · ' + member.provider + '/' + member.model : '';
            // Two-sided route (design v1 §7): the spine is the route this session was
            // opened with; the next route is shown only when it differs, and a fallback
            // route is never hidden even when it currently equals the spine.
            const next = member.next_route;
            const differ = next !== undefined && next !== (member.provider ?? '') + '/' + (member.model ?? '');
            const origin = member.route_override !== undefined
                ? ' (override)'
                : member.fallback_active === true ? ' (fallback)' : '';
            const tail = differ ? ' → ' + next + origin : member.fallback_active === true ? ' (fallback)' : '';
            const effort = member.reasoning_effort ? ' · reasoning ' + member.reasoning_effort : '';
            const failure = member.spawn_error === undefined ? '' : '\n      start failed: ' + member.spawn_error.slice(0, 400);
            const policy = member.tool_policy ? ' · policy ' + member.tool_policy : '';
            // t99 / BUG-025: the member payload carried the full profile and route picture
            // (execution prompt, active route, fallback, override with its source, last
            // provider failure) while the text printed only the spine and an ' (override)'
            // marker, so the captain could not see which route a member would really use.
            const detail = [
                member.execution_prompt === undefined || member.execution_prompt === '' ? undefined : 'prompt: ' + clipText(member.execution_prompt, 400),
                member.active_provider === undefined && member.active_model === undefined ? undefined : 'active route: ' + (member.active_provider ?? '?') + '/' + (member.active_model ?? '?'),
                member.fallback === undefined ? undefined : 'fallback route: ' + member.fallback.provider + '/' + member.fallback.model + (member.fallback.reasoning_effort === undefined || member.fallback.reasoning_effort === '' ? '' : ' (reasoning ' + member.fallback.reasoning_effort + ')'),
                member.route_override === undefined ? undefined : 'override route: ' + member.route_override.provider + '/' + member.route_override.model + (member.route_override.reasoning_effort === undefined || member.route_override.reasoning_effort === '' ? '' : ' (reasoning ' + member.route_override.reasoning_effort + ')') + (member.route_override.source === undefined ? '' : ' by ' + member.route_override.source) + (Number.isFinite(member.route_override.at) ? ' at ' + new Date(member.route_override.at).toISOString() : ''),
                member.last_failure === undefined ? undefined : 'last failure: ' + member.last_failure.code + ' — ' + clipText(member.last_failure.message, 200) + (member.last_failure.provider === undefined ? '' : ' (' + member.last_failure.provider + '/' + (member.last_failure.model ?? '?') + ')') + (Number.isFinite(member.last_failure.at) ? ' at ' + new Date(member.last_failure.at).toISOString() : ''),
            ].filter((item) => item !== undefined);
            const details = detail.map((item) => '\n      ' + item).join('');
            return '  - ' + member.name + ' [' + member.role + '] ' + member.status + '/' + member.activity + spine + tail + effort + policy + failure + details;
        }),
        ...removedMembers.length === 0 ? [] : [
            `Removed (${removedMembers.length}):`,
            ...removedMembers.map((member) => removedLine(member)),
        ],
        `Tasks (${team.tasks.length}):`,
        ...team.tasks.map((task) => {
            const deps = task.dependencies.length > 0 ? ` (deps: ${task.dependencies.join(',')})` : '';
            const output = task.output !== undefined ? `\n      output: ${task.output.slice(0, 300)}` : '';
            const evidence = task.supplemental_evidence ? `\n      Supplemental observations (original verdict unchanged): ${task.supplemental_evidence}` : '';
            const handoff = task.reassigning ? ' (reassigning)' : '';
            const seed = task.seed_id === undefined || task.seed_id === '' ? '' : ` seed ${task.seed_id}`;
            const kind = task.kind ? ` ${task.kind}` : '';
            const round = task.round === undefined ? '' : ` r${task.round}`;
            const verdict = task.verdict === undefined ? '' : ` verdict ${task.verdict}`;
            const fixes = task.fixes === undefined ? '' : ` fixes ${task.fixes}`;
            // t99 / BUG-025: attempt_id is the handle update_task/claim_task require, and the
            // status text printed the attempt number without it.
            const attemptId = task.attempt_id === undefined || task.attempt_id === '' ? '' : ` (attempt_id ${task.attempt_id})`;
            // t117 / V18-F2: findings_open was computed for every task (lib/tools.js:2593) and never printed, so a captain could not see how many review findings were still open.
            const openFindings = (task.findings_open ?? 0) > 0 ? ` findings ${task.findings_open}` : '';
            return `  - ${task.id} [${task.status}]${kind}${round}${verdict}${fixes}${openFindings} attempt ${task.attempt}${attemptId}${handoff}${seed} ${task.subject} → ${task.assignee || 'unassigned'}${deps}${output}${evidence}`;
        }),
        ...team.coverage === undefined || team.coverage.length === 0 ? [] : [
            'Coverage:',
            ...team.coverage.map((row) => `  - ${row.goal_item}: ${row.status} (${row.task_ids.join(',') || 'none'})${row.evidence === undefined || row.evidence === '' ? '' : ' — evidence: ' + clipText(row.evidence, 200)}`),
        ],
        ...team.delivery === undefined ? [] : [
            `Delivery: ${team.delivery.ok ? 'ok' : `blocked (${team.delivery.blockers.join('; ')})`}`,
        ],
        ...(team.delivery?.warnings ?? []).length === 0 ? [] : [
            'Gate warnings (delivery is not blocked, but these recorded verdicts or generated work orders no longer describe the current bytes):',
            ...(team.delivery?.warnings ?? []).map((warning) => `  - ${warning}`),
        ],
        `Captain inbox (${team.captain_inbox.length}):`,
        // t117 / V18-F2: both inbox payloads carry a numeric ts and the text printed neither, so a
        // captain reading two messages could not tell which one was newer.
        ...team.captain_inbox.map((message) => `  - [${message.from}] ${message.content}${Number.isFinite(message.ts) ? ' · at ' + new Date(message.ts).toISOString() : ''}`),
        ...(team.member_inbox ?? []).map(message => `  - [${message.from}] ${message.content}${Number.isFinite(message.ts) ? ' · at ' + new Date(message.ts).toISOString() : ''}`),
    ];
    for (const [name, inbox] of Object.entries(team.member_inboxes)) {
        lines.push(`Member inbox ${name} (${inbox.count}): latest — ${inbox.latest.slice(0, 120)}`);
    }
    if (team.mailbox_warning_count > 0) {
        lines.push(`Mailbox warnings (${team.mailbox_warning_count}; malformed lines were skipped; showing up to 10):`, ...team.mailbox_warnings.map((warning) => `  - ${warning}`));
    }
    // t99 / BUG-025: the identity of the snapshot itself (team_id, phase) never reached
    // the text, so a captain reading two teams' status could not tell them apart.
    lines.push(`Team id: ${team.team_id} · phase: ${team.phase ?? 'unknown'}`);
    return lines.join('\n');
}
