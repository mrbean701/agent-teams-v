window.__ModuleLoader__.load({
  id: "@nami/dsh-agent-teams",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// lib/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var import_jsx_runtime8 = require("react/jsx-runtime");

// lib/client/WorkspaceActivity.js
var import_jsx_runtime6 = require("react/jsx-runtime");
var import_react5 = require("react");

// lib/client/ActivityPanel.js
var import_jsx_runtime5 = require("react/jsx-runtime");
var import_react4 = require("react");

// lib/client/icons.js
var import_jsx_runtime = require("react/jsx-runtime");
var stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
function IconBranchOutline16() {
  return (0, import_jsx_runtime.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 16 16", "aria-hidden": "true", ...stroke, children: [(0, import_jsx_runtime.jsx)("circle", { cx: "4", cy: "3", r: "1.5" }), (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "4", r: "1.5" }), (0, import_jsx_runtime.jsx)("circle", { cx: "4", cy: "13", r: "1.5" }), (0, import_jsx_runtime.jsx)("path", { d: "M4 4.5v7M4 9h3a5 5 0 0 0 5-3.5" })] });
}
function IconChevronDownOutline14() {
  return (0, import_jsx_runtime.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 14 14", "aria-hidden": "true", ...stroke, children: (0, import_jsx_runtime.jsx)("path", { d: "m3 5 4 4 4-4" }) });
}
function IconPanelLeftOutline16() {
  return (0, import_jsx_runtime.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 16 16", "aria-hidden": "true", ...stroke, children: [(0, import_jsx_runtime.jsx)("rect", { x: "2", y: "2.5", width: "12", height: "11", rx: "2" }), (0, import_jsx_runtime.jsx)("path", { d: "M6 2.5v11" })] });
}
function IconStopFill16() {
  return (0, import_jsx_runtime.jsx)("svg", { width: "16", height: "16", viewBox: "0 0 16 16", "aria-hidden": "true", children: (0, import_jsx_runtime.jsx)("rect", { x: "4", y: "4", width: "8", height: "8", rx: "1", fill: "currentColor" }) });
}
function IconWarningOutline16() {
  return (0, import_jsx_runtime.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 16 16", "aria-hidden": "true", ...stroke, children: [(0, import_jsx_runtime.jsx)("path", { d: "m7 2-5.5 10a1 1 0 0 0 1 1.5h11a1 1 0 0 0 1-1.5L9 2a1.1 1.1 0 0 0-2 0Z" }), (0, import_jsx_runtime.jsx)("path", { d: "M8 6v3m0 2v.1" })] });
}

// lib/client/ActivityPanel.js
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// lib/client/session-navigation.js
function currentSessionId(state) {
  if ("current" in state)
    return state.current;
  return Object.values(state.byId).find((row) => (row.retainedBy?.mainView ?? 0) > 0)?.id;
}
async function openAgentTeamMember(sessions, parentSessionId, childSessionId, layout, workspace) {
  if (sessions.open === void 0 && workspace !== void 0) {
    workspace.openSession({ parentSessionId, childSessionId, mode: "continuable" });
    return "subagent";
  }
  const navigation = layout?.beginNavigation?.();
  if (sessions.openSubagent === void 0 || sessions.refreshSubagents === void 0) {
    if (sessions.open === void 0)
      throw new Error("Harness does not expose session navigation");
    sessions.open(childSessionId);
    layout?.selectPanel?.(null);
    return "session";
  }
  await sessions.refreshSubagents(parentSessionId);
  if (navigation?.aborted)
    return "cancelled";
  const retained = sessions.subagentAddress?.(childSessionId);
  sessions.openSubagent(retained?.parentSessionId === parentSessionId ? retained : { parentSessionId, childSessionId, mode: "continuable" });
  layout?.selectPanel?.(null);
  return "subagent";
}

// lib/client/activity-model.js
var COMPACT_DAG_NODE_WIDTH = 92;
var COMPACT_DAG_NODE_HEIGHT = 30;
var COMPACT_DAG_COLUMN_GAP = 26;
var COMPACT_DAG_ROW_GAP = 8;
function memberRouteLabel(member) {
  if (member === void 0)
    return "";
  const provider = member.provider?.trim() ?? "";
  const model = member.model?.trim() ?? "";
  if (provider !== "" && model !== "")
    return `${provider}/${model}`;
  return model;
}
function taskModelLabel(task, members) {
  const direct = task.model?.trim() ?? "";
  if (direct !== "")
    return direct;
  return memberRouteLabel(members.find((candidate) => candidate.name === task.assignee));
}
function compactModelLabel(route) {
  const trimmed = route.trim();
  if (trimmed === "")
    return "";
  const slash = trimmed.lastIndexOf("/");
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}
function memberFinishedAt(memberName, tasks) {
  let latest;
  for (const task of tasks) {
    if (task.assignee !== memberName)
      continue;
    if (task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled")
      continue;
    const stamp = task.updatedAt;
    if (typeof stamp !== "number" || !Number.isFinite(stamp))
      continue;
    if (latest === void 0 || stamp > latest)
      latest = stamp;
  }
  return latest;
}
function memberIsRunning(member, tasks) {
  if (member.activity === "working" || member.status === "working")
    return true;
  return tasks.some((task) => task.assignee === member.name && (task.status === "pending" || task.status === "claimed" || task.status === "in_progress"));
}
function orderDelegationMembers(members, tasks) {
  const running = [];
  const finishedStamped = [];
  const finishedUnstamped = [];
  members.forEach((member, index) => {
    if (memberIsRunning(member, tasks)) {
      running.push({ member, index });
      return;
    }
    const finishedAt = memberFinishedAt(member.name, tasks);
    if (finishedAt === void 0)
      finishedUnstamped.push({ member, index });
    else
      finishedStamped.push({ member, index, finishedAt });
  });
  finishedStamped.sort((left, right) => right.finishedAt - left.finishedAt || left.index - right.index);
  return [
    ...running,
    ...finishedStamped,
    ...finishedUnstamped
  ].map((entry) => entry.member);
}
function teamIsActive(team) {
  if (team.halted === true || team.phase === "staged")
    return false;
  if (team.members.some((member) => member.activity === "working" || member.status === "working"))
    return true;
  if (team.tasks.some((task) => task.status === "pending" || task.status === "claimed" || task.status === "in_progress"))
    return true;
  return team.members.length > 0 && team.tasks.length === 0;
}
function usesParallelTaskGrid(tasks) {
  if (tasks.length === 0)
    return false;
  const taskIds = new Set(tasks.map((task) => task.id));
  return tasks.every((task) => task.dependencies.every((dependency) => !taskIds.has(dependency)));
}
function activityPanelExpandedForSession(open, owner, current) {
  return open && owner !== void 0 && owner === current;
}
function activityPanelShouldAutoExpand({ alreadyAutoOpened, pageSettled, restoreComplete, previousLiveTeamIds, currentLiveTeamIds }) {
  return !alreadyAutoOpened && pageSettled && restoreComplete && currentLiveTeamIds.some((teamId) => !previousLiveTeamIds.has(teamId));
}
function dependencyFocusTaskId(pinnedTaskId, keyboardTaskId, hoverTaskId) {
  return pinnedTaskId ?? keyboardTaskId ?? hoverTaskId;
}
function taskStages(tasks) {
  const byDepth = /* @__PURE__ */ new Map();
  for (const task of tasks) {
    const depth = Number.isFinite(task.depth) ? Math.max(0, Math.floor(task.depth)) : 0;
    const stage = byDepth.get(depth) ?? [];
    stage.push(task);
    byDepth.set(depth, stage);
  }
  return [...byDepth.entries()].sort(([left], [right]) => left - right).map(([depth, stageTasks]) => ({
    depth,
    tasks: stageTasks.slice().sort((left, right) => left.id.localeCompare(right.id, "en", { numeric: true }))
  }));
}
function compactDagLayout(tasks, dimensions) {
  const nodeWidth = dimensions?.nodeWidth ?? COMPACT_DAG_NODE_WIDTH;
  const nodeHeight = dimensions?.nodeHeight ?? COMPACT_DAG_NODE_HEIGHT;
  const columnGap = dimensions?.columnGap ?? COMPACT_DAG_COLUMN_GAP;
  const rowGap = dimensions?.rowGap ?? COMPACT_DAG_ROW_GAP;
  const stages = taskStages(tasks);
  const positions = /* @__PURE__ */ new Map();
  const nodes = [];
  for (const [column, stage] of stages.entries()) {
    for (const [row, task] of stage.tasks.entries()) {
      const x = column * (nodeWidth + columnGap);
      const y = row * (nodeHeight + rowGap);
      positions.set(task.id, { x, y });
      nodes.push({ task, x, y });
    }
  }
  const edges = [];
  for (const task of tasks) {
    const target = positions.get(task.id);
    if (target === void 0)
      continue;
    for (const dependency of task.dependencies) {
      const source = positions.get(dependency);
      if (source === void 0)
        continue;
      const x1 = source.x + nodeWidth;
      const y1 = source.y + nodeHeight / 2;
      const x2 = target.x;
      const y2 = target.y + nodeHeight / 2;
      edges.push({
        from: dependency,
        to: task.id,
        path: `M${x1} ${y1}C${x1 + 14} ${y1},${x2 - 14} ${y2},${x2} ${y2}`
      });
    }
  }
  const rows = Math.max(1, ...stages.map((stage) => stage.tasks.length));
  return {
    width: stages.length === 0 ? 0 : stages.length * nodeWidth + (stages.length - 1) * columnGap,
    height: stages.length === 0 ? 0 : rows * nodeHeight + (rows - 1) * rowGap,
    nodes,
    edges
  };
}
function relatedTaskIds(taskId, tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (!byId.has(taskId))
    return /* @__PURE__ */ new Set();
  const dependents = /* @__PURE__ */ new Map();
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      const targets2 = dependents.get(dependency) ?? [];
      targets2.push(task.id);
      dependents.set(dependency, targets2);
    }
  }
  const related = /* @__PURE__ */ new Set();
  const upstreamSeen = /* @__PURE__ */ new Set();
  const downstreamSeen = /* @__PURE__ */ new Set();
  const visitUpstream = (id) => {
    if (upstreamSeen.has(id))
      return;
    upstreamSeen.add(id);
    related.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? [])
      visitUpstream(dependency);
  };
  const visitDownstream = (id) => {
    if (downstreamSeen.has(id))
      return;
    downstreamSeen.add(id);
    related.add(id);
    for (const dependent of dependents.get(id) ?? [])
      visitDownstream(dependent);
  };
  visitUpstream(taskId);
  visitDownstream(taskId);
  return related;
}

// lib/client/activity-monitor.js
var targets = /* @__PURE__ */ new Map();
var targetListeners = /* @__PURE__ */ new Set();
var snapshotListeners = /* @__PURE__ */ new Set();
var targetSnapshot = [];
var activitySnapshots = { teams: [], archivedTeams: [] };
function targetKey(sessionId, teamId) {
  return `${sessionId}\0${teamId}`;
}
function publishTargets() {
  targetSnapshot = [...targets.values()].filter((target) => target.active).map(({ key, sessionId, teamId }) => ({ key, sessionId, teamId }));
  for (const listener of targetListeners)
    listener();
}
function subscribeActivityMonitorTargets(listener) {
  targetListeners.add(listener);
  return () => {
    targetListeners.delete(listener);
  };
}
function getActivityMonitorTargetsSnapshot() {
  return targetSnapshot;
}
function monitorAgentTeam(sessionId, teamId) {
  const owner = sessionId.trim();
  const id = teamId.trim();
  if (owner === "" || id === "")
    return () => {
    };
  const key = targetKey(owner, id);
  const existing = targets.get(key);
  if (existing === void 0) {
    targets.set(key, { key, sessionId: owner, teamId: id, refs: 1, active: true });
    publishTargets();
  } else {
    existing.refs += 1;
    if (!existing.active) {
      existing.active = true;
      publishTargets();
    }
  }
  let released = false;
  return () => {
    if (released)
      return;
    released = true;
    const current = targets.get(key);
    if (current === void 0)
      return;
    current.refs -= 1;
    if (current.refs <= 0) {
      targets.delete(key);
      if (current.active)
        publishTargets();
    }
  };
}
function settleActivityMonitorTargets(keys) {
  let changed = false;
  for (const key of keys) {
    const target = targets.get(key);
    if (target?.active !== true)
      continue;
    target.active = false;
    changed = true;
  }
  if (changed)
    publishTargets();
}
function subscribeActivitySnapshots(listener) {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}
function getActivitySnapshotsSnapshot() {
  return activitySnapshots;
}
function updateActivitySnapshots(update) {
  const next = {
    teams: update.teams ?? activitySnapshots.teams,
    archivedTeams: update.archivedTeams ?? activitySnapshots.archivedTeams
  };
  if (next.teams === activitySnapshots.teams && next.archivedTeams === activitySnapshots.archivedTeams)
    return;
  activitySnapshots = next;
  for (const listener of snapshotListeners)
    listener();
}
var ACTIVITY_POLL_MS = 1e3;
var ACTIVITY_PROBE_MS = 5e3;
var ACTIVITY_STATE_URL = "/plugins/dsh-agent-teams/state";
var ACTIVITY_HALT_URL = "/plugins/dsh-agent-teams/halt";
function startActivityPolling(monitorTargets, runtime = {}) {
  const discoverySessionId = runtime.discoverySessionId?.trim();
  if (monitorTargets.length === 0 && (discoverySessionId === void 0 || discoverySessionId === "")) {
    return { firstTick: Promise.resolve(), stop: () => {
    } };
  }
  const fetchState = runtime.fetchState ?? ((url, init) => fetch(url, init));
  const schedule = runtime.schedule ?? ((callback, intervalMs2) => setInterval(callback, intervalMs2));
  const cancel = runtime.cancel ?? ((timer2) => {
    clearInterval(timer2);
  });
  const publishSnapshots = runtime.publishSnapshots ?? updateActivitySnapshots;
  const settleTargets = runtime.settleTargets ?? settleActivityMonitorTargets;
  let cancelled = false;
  let inFlight = false;
  let hot = monitorTargets.length > 0;
  let discoveryComplete = false;
  let discoveredLiveKeys = /* @__PURE__ */ new Set();
  let controller;
  let timer;
  const intervalMs = () => hot ? ACTIVITY_POLL_MS : ACTIVITY_PROBE_MS;
  const reschedule = () => {
    cancel(timer);
    timer = schedule(() => {
      void tick();
    }, intervalMs());
  };
  const tick = async () => {
    if (inFlight || cancelled)
      return;
    inFlight = true;
    controller = new AbortController();
    try {
      const liveResponse = await fetchState(ACTIVITY_STATE_URL, {
        cache: "no-store",
        signal: controller.signal
      });
      if (!liveResponse.ok)
        throw new Error("Activity unavailable");
      const body = await liveResponse.json();
      if (cancelled)
        return;
      if (!Array.isArray(body.teams))
        throw new Error("Invalid activity response");
      runtime.onStatus?.("ready");
      const liveTeams = body.teams;
      publishSnapshots({ teams: liveTeams });
      const previousDiscoveredKeys = discoveredLiveKeys;
      discoveredLiveKeys = new Set(discoverySessionId === void 0 || discoverySessionId === "" ? [] : liveTeams.filter((team) => team.captainSessionId === discoverySessionId).map((team) => team.teamId));
      if (!hot && discoveredLiveKeys.size > 0) {
        hot = true;
        reschedule();
      }
      const discoveredTeamArchived = [...previousDiscoveredKeys].some((teamId) => !discoveredLiveKeys.has(teamId));
      const missing = monitorTargets.filter((target) => !liveTeams.some((team) => team.captainSessionId === target.sessionId && team.teamId === target.teamId));
      const needsDiscoveryArchive = discoverySessionId !== void 0 && discoverySessionId !== "" && !discoveryComplete;
      if (missing.length === 0 && !needsDiscoveryArchive && !discoveredTeamArchived)
        return;
      const archivedResponse = await fetchState(`${ACTIVITY_STATE_URL}?archived=1`, {
        cache: "no-store",
        signal: controller.signal
      });
      if (!archivedResponse.ok)
        throw new Error("Archive unavailable");
      const archivedBody = await archivedResponse.json();
      if (cancelled)
        return;
      if (!Array.isArray(archivedBody.teams))
        throw new Error("Invalid archive response");
      publishSnapshots({ archivedTeams: archivedBody.teams });
      discoveryComplete = true;
      settleTargets(new Set(missing.map((target) => target.key)));
    } catch (error) {
      if (error?.name === "AbortError")
        return;
      if (!cancelled)
        runtime.onStatus?.("error");
    } finally {
      inFlight = false;
    }
  };
  const firstTick = tick();
  if (timer === void 0)
    timer = schedule(() => {
      void tick();
    }, intervalMs());
  return {
    firstTick,
    stop: () => {
      if (cancelled)
        return;
      cancelled = true;
      controller?.abort();
      cancel(timer);
    }
  };
}

// lib/client/artwork.js
var ART_BASE = "/plugins/dsh-agent-teams/assets/";
var ROLE_ART = [
  [/data|analys|metric|performance|数据|分析|指标|性能/, "member-data-v2.png"],
  [/resear|investig|explor|study|研究|调查|探索|调研/, "member-researcher-v2.png"],
  // Match compound QA titles (for example "QA Engineer") before the broad
  // engineer bucket, otherwise an eight-role roster repeats the engineer art.
  [/\bqa\b|test|verif|quality|测试|质量|验证/, "member-qa-v2.png"],
  [/engineer|dev\b|server|backend|\bapi\b|runtime|watcher|contract|工程|后端|服务|接口|开发|代码|编程/, "member-engineer-v2.png"],
  [/design|\bui\b|\bux\b|front|theme|accessib|设计|前端|主题|无障碍/, "member-designer-v2.png"],
  [/secur|audit|risk|threat|review|安全|审计|审查|风险/, "member-security-v2.png"],
  [/docs|writer|product|spec|撰写|文案|写作|文档|规范/, "member-docs-v2.png"],
  [/release|\bbuild\b|deploy|\bops\b|\bci\b|ship|coordin|发布|构建|部署|运维|协调/, "member-operator-v2.png"]
];
var LEAD_ART = `${ART_BASE}team-lead-v2.png`;
var ACTION_ART = {
  working: `${ART_BASE}action-working-v2.png`,
  idle: `${ART_BASE}action-sleeping-v2.png`,
  unknown: `${ART_BASE}action-thinking-v2.png`
};
function memberArtUrl(name, role) {
  const identity = `${name} ${role}`.toLowerCase();
  for (const [pattern, art] of ROLE_ART) {
    if (pattern.test(identity))
      return `${ART_BASE}${art}`;
  }
  return null;
}

// lib/client/AgentTeamsCard.js
var import_jsx_runtime2 = require("react/jsx-runtime");
var import_react = require("react");

// css-module:lib/client/AgentTeamsCard.module.css
var css = `.kPAopq_root{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);border-radius:10px;flex-direction:column;gap:8px;width:100%;min-width:0;padding:10px 12px;display:flex}.kPAopq_head{align-items:center;gap:8px;min-width:0;display:flex}.kPAopq_leadAvatar{object-fit:contain;filter:drop-shadow(0 1px 1px #122d4833);background:0 0;border:0;border-radius:0;flex:none;width:30px;height:30px}.kPAopq_teamName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:0 auto;font-size:13px;font-weight:600;line-height:20px;overflow:hidden}.kPAopq_memberCount{color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;margin-left:auto;font-size:11px;line-height:16px}.kPAopq_panelButton{border:1px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:999px;flex:none;padding:2px 8px;font-size:10.5px;font-weight:600;line-height:16px;transition:border-color .12s,color .12s}.kPAopq_panelButton:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}.kPAopq_panelButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.kPAopq_members{flex-wrap:wrap;gap:6px;min-width:0;display:flex}.kPAopq_member{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);max-width:160px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:999px;align-items:center;gap:5px;padding:3px 8px 3px 3px;font-size:11px;font-weight:500;line-height:16px;transition:border-color .12s,background-color .12s;display:inline-flex}.kPAopq_member:hover{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-button-ghost-active-fill)}.kPAopq_member:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.kPAopq_memberArt{object-fit:contain;filter:drop-shadow(0 1px 1px #122d482e);background:0 0;border:0;border-radius:0;width:24px;height:24px}.kPAopq_memberInitial{background:var(--dsw-alias-state-business-primary);width:20px;height:20px;color:var(--dsw-alias-label-primary-inverted);border-radius:50%;justify-content:center;align-items:center;font-size:10px;font-weight:600;line-height:20px;display:inline-flex}.kPAopq_memberName{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.kPAopq_chatEntry{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);font:inherit;white-space:nowrap;cursor:pointer;background:0 0;border-radius:7px;align-items:center;gap:5px;padding:3px 8px;font-size:12px;display:inline-flex}.kPAopq_chatEntry img{object-fit:contain;width:22px;height:22px}.kPAopq_chatEntry:hover{background:var(--dsw-alias-bg-module-platform)}.kPAopq_chatEntry:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.kPAopq_turnCards{gap:8px;margin-block:10px;display:grid}@media (width<=600px){.kPAopq_head{flex-wrap:wrap}}`;
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
}
var AgentTeamsCard_default = { "root": "kPAopq_root", "head": "kPAopq_head", "leadAvatar": "kPAopq_leadAvatar", "teamName": "kPAopq_teamName", "memberCount": "kPAopq_memberCount", "panelButton": "kPAopq_panelButton", "5px": "5px", "12s": "12s", "members": "kPAopq_members", "member": "kPAopq_member", "memberArt": "kPAopq_memberArt", "memberInitial": "kPAopq_memberInitial", "memberName": "kPAopq_memberName", "chatEntry": "kPAopq_chatEntry", "turnCards": "kPAopq_turnCards" };

// lib/client/AgentTeamsCard.js
var OPEN_PANEL_EVENT = "agent-teams:open-panel";
function openActivityPanel(data) {
  window.dispatchEvent(new CustomEvent(OPEN_PANEL_EVENT, {
    detail: {
      teamId: data.teamId,
      captainSessionId: data.captainSessionId,
      teamName: data.teamName,
      members: data.members
    }
  }));
}
var noWorkspace = () => void 0;
var noSubscription = () => () => {
};
function AgentTeamsCard({ node, openMember, sessionId, t, workspaceBridge }) {
  const native = (0, import_react.useSyncExternalStore)(workspaceBridge?.subscribe ?? noSubscription, workspaceBridge?.getSnapshot ?? noWorkspace);
  const location = node.location;
  if (native && (location.kind === "turn" || location.kind === "step") && location.turn.status === "closed")
    return null;
  return (0, import_jsx_runtime2.jsx)(AgentTeamsSummary, { data: node.data, openMember, sessionId, t });
}
function AgentTeamsSummary({ data, openMember, sessionId, t }) {
  const owner = data.captainSessionId || sessionId;
  const { teams, archivedTeams } = (0, import_react.useSyncExternalStore)(subscribeActivitySnapshots, getActivitySnapshotsSnapshot);
  (0, import_react.useEffect)(() => {
    return monitorAgentTeam(owner, data.teamId);
  }, [data.teamId, owner]);
  const snapshot = teams.find((team) => team.teamId === data.teamId && (owner === "" || team.captainSessionId === owner)) ?? archivedTeams.find((team) => team.teamId === data.teamId && (owner === "" || team.captainSessionId === owner));
  const resolved = (0, import_react.useMemo)(() => ({
    ...data,
    captainSessionId: snapshot?.captainSessionId ?? owner,
    teamName: snapshot?.name ?? data.teamName,
    members: snapshot?.members.map((member) => ({ id: member.id, name: member.name, role: member.role })) ?? data.members
  }), [data, owner, snapshot]);
  return (0, import_jsx_runtime2.jsxs)("section", { className: AgentTeamsCard_default.root, "data-agent-teams-card": true, "data-team-id": resolved.teamId, children: [(0, import_jsx_runtime2.jsxs)("header", { className: AgentTeamsCard_default.head, children: [(0, import_jsx_runtime2.jsx)("img", { className: AgentTeamsCard_default.leadAvatar, src: LEAD_ART, alt: "", "aria-hidden": true }), (0, import_jsx_runtime2.jsx)("span", { className: AgentTeamsCard_default.teamName, title: resolved.teamName, children: resolved.teamName }), (0, import_jsx_runtime2.jsx)("span", { className: AgentTeamsCard_default.memberCount, children: t("card.memberCount", { count: resolved.members.length }) }), (0, import_jsx_runtime2.jsx)("button", { type: "button", className: AgentTeamsCard_default.panelButton, onClick: () => {
    openActivityPanel(resolved);
  }, "aria-label": t("workspace.focus"), title: t("workspace.focus"), children: t("workspace.focus") })] }), resolved.members.length > 0 && (0, import_jsx_runtime2.jsx)("div", { className: AgentTeamsCard_default.members, children: resolved.members.map((member) => (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: AgentTeamsCard_default.member, onClick: () => {
    if (member.id !== "")
      openMember(owner, member.id);
  }, title: member.role === "" ? member.name : `${member.name} \xB7 ${member.role}`, children: [memberArtUrl(member.name, member.role) !== null ? (0, import_jsx_runtime2.jsx)("img", { className: AgentTeamsCard_default.memberArt, src: memberArtUrl(member.name, member.role) ?? "", alt: "", "aria-hidden": true }) : (0, import_jsx_runtime2.jsx)("span", { className: AgentTeamsCard_default.memberInitial, children: member.name.trim().slice(0, 1).toUpperCase() || "?" }), (0, import_jsx_runtime2.jsx)("span", { className: AgentTeamsCard_default.memberName, children: member.name })] }, member.id || member.name)) })] });
}

// lib/client/StagingPlanEditor.js
var import_jsx_runtime3 = require("react/jsx-runtime");
var import_react2 = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// css-module:lib/client/ActivityPanel.module.css
var css2 = `html{--agent-teams-panel-shift:420px}html[data-agent-teams-panel-open] [data-phase=active]{box-sizing:border-box;padding-right:var(--agent-teams-panel-shift)}.aYQbCq_badge{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:color-mix(in srgb, var(--dsw-alias-bg-module-platform) 92%, transparent);backdrop-filter:blur(16px);height:34px;box-shadow:0 8px 28px color-mix(in srgb, var(--dsw-alias-bg-mask-3) 29%, transparent);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border-radius:999px;align-items:center;gap:7px;padding:0 12px;font-size:12px;font-weight:600;line-height:20px;transition:border-color .15s,transform .12s;display:inline-flex;position:absolute;top:64px;right:18px}.aYQbCq_badge:hover{border-color:var(--dsw-alias-border-l3);transform:translateY(-1px)}.aYQbCq_badge:active{transform:translateY(0)scale(.98)}.aYQbCq_badge:focus-visible,.aYQbCq_iconButton:focus-visible,.aYQbCq_memberRow:focus-visible,.aYQbCq_membersToggle:focus-visible,.aYQbCq_sectionToggleTitle:focus-visible,.aYQbCq_dagNode:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.aYQbCq_badgeDot,.aYQbCq_panelDot{background:var(--dsw-alias-label-tertiary);border-radius:50%;width:7px;height:7px}.aYQbCq_badgeDot[data-busy=true],.aYQbCq_panelDot[data-busy=true]{background:var(--dsw-alias-state-business-primary);animation:1.25s ease-in-out infinite aYQbCq_agentTeamsPulse}.aYQbCq_badgeCount,.aYQbCq_memberCount,.aYQbCq_teamStats,.aYQbCq_stageLabel,.aYQbCq_taskId{font-variant-numeric:tabular-nums}.aYQbCq_panel{box-sizing:border-box;border:1px solid color-mix(in srgb, var(--dsw-alias-border-l3) 58%, transparent);background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 95%, transparent);backdrop-filter:blur(20px)saturate(1.08);box-shadow:0 12px 32px color-mix(in srgb, var(--dsw-alias-bg-mask-3) 25%, transparent), 0 32px 72px color-mix(in srgb, var(--dsw-alias-bg-mask-3) 33%, transparent);will-change:transform;border-radius:16px;flex-direction:column;animation:.16s ease-out aYQbCq_agentTeamsPanelIn;display:flex;position:absolute;top:0;left:0;overflow:hidden}.aYQbCq_panel[data-dragging],.aYQbCq_panel[data-resizing]{user-select:none;box-shadow:0 16px 38px color-mix(in srgb, var(--dsw-alias-bg-mask-3) 29%, transparent), 0 36px 78px color-mix(in srgb, var(--dsw-alias-bg-mask-3) 38%, transparent)}@keyframes aYQbCq_agentTeamsPanelIn{0%{opacity:0}to{opacity:1}}@keyframes aYQbCq_agentTeamsPulse{0%,to{opacity:.42}50%{opacity:1}}.aYQbCq_panelHead{border-bottom:1px solid var(--dsw-alias-border-l2);cursor:grab;touch-action:none;flex:none;justify-content:space-between;align-items:center;min-height:44px;padding:0 14px 0 16px;display:flex}.aYQbCq_panelHead:active,.aYQbCq_panel[data-dragging] .aYQbCq_panelHead{cursor:grabbing}.aYQbCq_panel[data-compact] .aYQbCq_panelHead{cursor:default;touch-action:auto}.aYQbCq_panelTitle{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;font-size:14px;font-weight:600;line-height:20px;display:inline-flex}.aYQbCq_panelControls{flex:none;align-items:center;gap:2px;display:inline-flex}.aYQbCq_iconButton{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:7px;justify-content:center;align-items:center;padding:0;transition:background-color .12s,color .12s,transform .12s;display:inline-flex}.aYQbCq_iconButton:hover{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-primary)}.aYQbCq_iconButton:active{transform:scale(.94)}.aYQbCq_iconButton[data-control=dock][data-mode=docked] svg{transform:scaleX(-1)}.aYQbCq_resizeHandle{z-index:5;touch-action:none;pointer-events:auto;position:absolute}.aYQbCq_resizeHandle[data-resize-edge=left]{cursor:ew-resize;width:14px;top:44px;bottom:14px;left:0}.aYQbCq_resizeHandle[data-resize-edge=left]:after{background:color-mix(in srgb, var(--dsw-alias-label-tertiary) 42%, transparent);content:"";opacity:.45;border-radius:999px;width:3px;height:48px;transition:background-color .12s,opacity .12s;position:absolute;top:50%;left:4px;transform:translateY(-50%)}.aYQbCq_resizeHandle[data-resize-edge=bottom]{cursor:ns-resize;height:14px;bottom:0;left:20px;right:20px}.aYQbCq_resizeHandle[data-resize-edge=bottom]:after{background:color-mix(in srgb, var(--dsw-alias-label-tertiary) 42%, transparent);content:"";opacity:.45;border-radius:999px;width:48px;height:3px;transition:background-color .12s,opacity .12s;position:absolute;bottom:4px;left:50%;transform:translate(-50%)}.aYQbCq_resizeHandle[data-resize-edge=corner]{cursor:nwse-resize;width:28px;height:28px;bottom:0;right:0}.aYQbCq_resizeHandle[data-resize-edge=corner]:after{border-right:2px solid var(--dsw-alias-label-tertiary);border-bottom:2px solid var(--dsw-alias-label-tertiary);content:"";opacity:.58;width:10px;height:10px;transition:border-color .12s,opacity .12s;position:absolute;bottom:6px;right:6px}.aYQbCq_resizeHandle:hover:after,.aYQbCq_panel[data-resizing] .aYQbCq_resizeHandle:after{background-color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary);opacity:.95}.aYQbCq_teams{overscroll-behavior:contain;scrollbar-color:color-mix(in srgb, var(--dsw-alias-label-tertiary) 28%, transparent) transparent;scrollbar-width:thin;flex-direction:column;min-height:0;display:flex;overflow-y:auto}.aYQbCq_teams::-webkit-scrollbar{width:6px}.aYQbCq_teams::-webkit-scrollbar-track{background:0 0}.aYQbCq_teams::-webkit-scrollbar-thumb{background:color-mix(in srgb, var(--dsw-alias-label-tertiary) 28%, transparent);background-clip:padding-box;border:2px solid #0000;border-radius:999px}.aYQbCq_teams:hover::-webkit-scrollbar-thumb{background:color-mix(in srgb, var(--dsw-alias-label-tertiary) 44%, transparent);background-clip:padding-box}.aYQbCq_team{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:12px;padding:12px 14px 16px;display:flex;container:aYQbCq_agent-team/inline-size}.aYQbCq_team:last-child{border-bottom:0}.aYQbCq_teamHead{align-items:center;gap:10px;min-width:0;display:flex}.aYQbCq_teamName{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:13px;font-weight:600;line-height:18px;overflow:hidden}.aYQbCq_teamStats{color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;gap:8px;font-size:10.5px;line-height:16px;display:inline-flex}.aYQbCq_teamStopButton{border:1px solid var(--dsw-alias-border-l2);width:26px;height:26px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border-radius:7px;flex:none;place-items:center;padding:0;transition:border-color .15s,background .15s,color .15s;display:grid}.aYQbCq_teamStopButton:hover{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 42%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, transparent);color:var(--dsw-alias-state-error-primary)}.aYQbCq_teamStopButton:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.aYQbCq_stopModalActions{justify-content:flex-end;gap:8px;display:flex}.aYQbCq_stopModalActions button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-ghost-active-fill);min-height:34px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;border-radius:8px;justify-content:center;align-items:center;gap:6px;padding:6px 13px;font-size:12px;font-weight:600;display:inline-flex}.aYQbCq_stopModalActions button[data-danger]{border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_stopModalActions button:disabled{cursor:wait;opacity:.58}.aYQbCq_stopModalError{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);color:var(--dsw-alias-state-error-primary);border-radius:8px;align-items:flex-start;gap:7px;margin:0;padding:9px 10px;font-size:12px;line-height:18px;display:flex}.aYQbCq_stopModalError svg{flex:none;margin-top:1px}.aYQbCq_sectionHead{justify-content:space-between;align-items:center;gap:8px;min-width:0;display:flex}.aYQbCq_sectionTitle{color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;font-size:11px;font-weight:600;line-height:16px;display:inline-flex}.aYQbCq_sectionHint{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:14px;overflow:hidden}.aYQbCq_delegationSection{min-width:0}.aYQbCq_captainNode{box-sizing:border-box;border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 32%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-layer-1));border-radius:10px;grid-template-columns:48px minmax(0,1fr) auto;align-items:center;gap:9px;min-height:56px;padding:6px 10px;display:grid}.aYQbCq_captainAvatar,.aYQbCq_memberAvatar{flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative}.aYQbCq_captainAvatar{width:46px;height:46px}.aYQbCq_leadAvatar,.aYQbCq_memberArt{object-fit:contain;filter:drop-shadow(0 1px 1px #122d4833);background:0 0;border:0;border-radius:0}.aYQbCq_leadAvatar{width:44px;height:44px}.aYQbCq_memberArt{width:40px;height:40px}.aYQbCq_captainInfo,.aYQbCq_memberInfo{flex-direction:column;min-width:0;display:flex}.aYQbCq_captainInfo{gap:2px}.aYQbCq_captainLine,.aYQbCq_memberLine{align-items:center;gap:6px;min-width:0;display:flex}.aYQbCq_captainName,.aYQbCq_memberName{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;font-weight:600;line-height:18px;overflow:hidden}.aYQbCq_captainRole,.aYQbCq_memberRole{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:14px;overflow:hidden}.aYQbCq_captainSummary,.aYQbCq_memberStatusLine{color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;font-size:10.5px;line-height:15px;overflow:hidden}.aYQbCq_taskDetailModel{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9.5px;line-height:14px;overflow:hidden}.aYQbCq_memberModel{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-ghost-active-fill);min-width:0;max-width:132px;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;border-radius:999px;flex:0 auto;align-items:center;padding:0 6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;font-weight:600;line-height:15px;display:inline-flex;overflow:hidden}.aYQbCq_captainState,.aYQbCq_memberState{color:var(--dsw-alias-label-tertiary);white-space:nowrap;flex:none;align-items:center;gap:5px;font-size:10px;font-weight:500;line-height:15px;display:inline-flex}.aYQbCq_captainState[data-busy=true],.aYQbCq_memberState[data-activity=working]{color:var(--dsw-alias-state-business-primary)}.aYQbCq_workGlyph rect{opacity:.5}.aYQbCq_workGlyph[data-active=true] rect{animation:1.1s ease-in-out infinite aYQbCq_agentTeamsDot}@keyframes aYQbCq_agentTeamsDot{0%,to{opacity:.25}50%{opacity:1}}.aYQbCq_progressOverview{flex-direction:column;gap:7px;display:flex}.aYQbCq_progressTitle{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;line-height:16px}.aYQbCq_progressSegments{gap:3px;display:flex}.aYQbCq_progressSegments>span,.aYQbCq_progressEmpty{background:var(--dsw-alias-border-l3);border-radius:2px;flex:1;height:5px}.aYQbCq_progressEmpty{width:100%;display:block}.aYQbCq_progressSegments>span[data-state=running]{background:var(--dsw-alias-state-business-primary)}.aYQbCq_progressSegments>span[data-state=blocked]{background:var(--dsw-alias-state-warn-primary)}.aYQbCq_progressSegments>span[data-state=completed]{background:var(--dsw-alias-state-success-primary)}.aYQbCq_progressSegments>span[data-state=failed]{background:var(--dsw-alias-state-error-primary)}.aYQbCq_progressSegments>span[data-state=cancelled]{opacity:.55}.aYQbCq_progressLegend{color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;gap:10px;font-size:9.5px;line-height:14px;display:flex}.aYQbCq_progressLegend>span[data-state=running]{color:var(--dsw-alias-state-business-primary)}.aYQbCq_progressLegend>span[data-state=blocked]{color:var(--dsw-alias-state-warn-primary)}.aYQbCq_progressLegend>span[data-state=completed]{color:var(--dsw-alias-state-success-primary)}.aYQbCq_progressSummary{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 7%, var(--dsw-alias-bg-layer-1));min-width:0;color:var(--dsw-alias-label-secondary);border-radius:8px;align-items:center;gap:6px;padding:5px 8px;font-size:10px;font-weight:600;line-height:15px;display:flex}.aYQbCq_progressSummary[data-state=warning]{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, var(--dsw-alias-bg-layer-1))}.aYQbCq_progressSummary[data-state=completed]{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 8%, var(--dsw-alias-bg-layer-1))}.aYQbCq_progressSummary[data-state=discarded]{background:var(--dsw-alias-button-ghost-active-fill)}.aYQbCq_progressSummary>span:last-child{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.aYQbCq_progressSummaryDot{background:var(--dsw-alias-state-business-primary);border-radius:50%;flex:none;width:5px;height:5px}.aYQbCq_progressSummary[data-state=warning] .aYQbCq_progressSummaryDot{background:var(--dsw-alias-state-warn-primary)}.aYQbCq_progressSummary[data-state=completed] .aYQbCq_progressSummaryDot{background:var(--dsw-alias-state-success-primary)}.aYQbCq_progressSummary[data-state=discarded] .aYQbCq_progressSummaryDot{background:var(--dsw-alias-label-tertiary)}.aYQbCq_membersToggle{background:var(--dsw-alias-bg-module-platform);width:100%;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;border:0;border-radius:8px;justify-content:space-between;align-items:center;gap:8px;padding:6px 8px;font-size:10.5px;font-weight:600;line-height:15px;display:flex}.aYQbCq_membersToggle:hover{background:var(--dsw-alias-button-ghost-active-fill)}.aYQbCq_membersToggle>span{align-items:center;gap:5px;display:inline-flex}.aYQbCq_membersToggle>span:last-child{color:var(--dsw-alias-state-business-primary)}.aYQbCq_chevron{flex:none;transition:transform .14s}.aYQbCq_chevron[data-open=true]{transform:rotate(90deg)}.aYQbCq_delegationTree{flex-direction:column;gap:2px;margin-left:18px;padding:9px 0 0 20px;display:flex;position:relative}.aYQbCq_delegationTree:before{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 48%, var(--dsw-alias-border-l2));content:"";width:1px;position:absolute;top:0;bottom:22px;left:0}.aYQbCq_memberBlock{flex-direction:column;min-width:0;padding:3px 0 7px;display:flex;position:relative}.aYQbCq_memberBranch{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 48%, var(--dsw-alias-border-l2));width:20px;height:1px;display:block;position:absolute;top:27px;right:100%}.aYQbCq_memberBranch:before{background:var(--dsw-alias-state-business-primary);content:"";border-radius:50%;width:5px;height:5px;position:absolute;top:-2px;right:-1px}.aYQbCq_memberRow{box-sizing:border-box;width:100%;min-width:0;min-height:48px;color:inherit;font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;grid-template-columns:46px minmax(0,1fr) auto;align-items:center;gap:8px;padding:4px 6px;transition:background-color .12s,transform .12s;display:grid}.aYQbCq_memberRow:hover,.aYQbCq_memberRow[data-activity=working]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, var(--dsw-alias-bg-layer-1))}.aYQbCq_memberRow:active{transform:scale(.995)}.aYQbCq_memberAvatar{width:42px;height:42px}.aYQbCq_memberAvatar[data-unread=true]:after{box-sizing:border-box;border:1px solid var(--dsw-alias-bg-layer-1);background:var(--dsw-alias-state-business-primary);content:"";border-radius:50%;width:6px;height:6px;animation:1.8s ease-in-out infinite aYQbCq_agentTeamsUnreadPulse;position:absolute;top:0;right:-1px}@keyframes aYQbCq_agentTeamsUnreadPulse{0%,to{opacity:.78;transform:scale(.92)}50%{opacity:1;transform:scale(1.16)}}.aYQbCq_memberInitial{background:var(--dsw-alias-state-business-primary);width:34px;height:34px;color:var(--dsw-alias-label-primary-inverted);border-radius:50%;justify-content:center;align-items:center;font-size:14px;font-weight:600;line-height:20px;display:inline-flex}.aYQbCq_stateArt{box-sizing:border-box;object-fit:contain;width:22px;height:22px;filter:drop-shadow(0 0 1px var(--dsw-alias-bg-layer-1)) drop-shadow(0 1px 1px #122d483d);background:0 0;border:0;border-radius:0;position:absolute;bottom:-3px;right:-5px}.aYQbCq_stateArt[data-activity=working]{animation:2.4s ease-in-out infinite aYQbCq_agentTeamsFloat}.aYQbCq_stateArt[data-activity=idle]{animation:4.2s ease-in-out infinite aYQbCq_agentTeamsBreathe}.aYQbCq_stateArt[data-activity=unknown]{animation:2.8s ease-in-out infinite aYQbCq_agentTeamsThink}@keyframes aYQbCq_agentTeamsFloat{0%,to{transform:translateY(0)rotate(-4deg)}50%{transform:translateY(-2px)rotate(4deg)}}@keyframes aYQbCq_agentTeamsBreathe{0%,to{opacity:.82;transform:scale(1)}50%{opacity:1;transform:scale(1.06)}}@keyframes aYQbCq_agentTeamsThink{0%,to{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}.aYQbCq_memberState{margin-left:auto}.aYQbCq_memberCount{color:var(--dsw-alias-label-tertiary);font-size:10.5px;line-height:16px}.aYQbCq_assignmentLine{align-items:center;gap:7px;min-width:0;padding:0 6px 0 60px;display:flex}.aYQbCq_assignmentLabel{color:var(--dsw-alias-label-tertiary);flex:none;font-size:9.5px;line-height:14px}.aYQbCq_assignmentTasks{flex-wrap:wrap;flex:1;gap:4px;min-width:0;display:flex}.aYQbCq_assignmentChip{background:var(--dsw-alias-button-ghost-active-fill);max-width:100%;min-height:16px;color:var(--dsw-alias-label-secondary);text-overflow:ellipsis;white-space:nowrap;border-radius:4px;align-items:center;padding:0 5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;font-weight:600;line-height:14px;display:inline-flex;overflow:hidden}.aYQbCq_assignmentChip[data-state=running]{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_assignmentChip[data-state=completed]{background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_assignmentChip[data-state=blocked]{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_assignmentChip[data-state=failed]{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_assignmentChip[data-state=cancelled]{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}.aYQbCq_unreadPill{color:var(--dsw-alias-state-business-primary);white-space:nowrap;flex:none;font-size:9.5px;font-weight:600;line-height:14px}.aYQbCq_taskEmpty{color:var(--dsw-alias-label-tertiary);font-size:9.5px;line-height:14px}.aYQbCq_dependencySection{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:7px;min-width:0;padding-top:10px;display:flex}.aYQbCq_sectionToggleTitle{color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:0;font-size:11px;font-weight:600;line-height:16px;display:inline-flex}.aYQbCq_dagViewport{scrollbar-width:thin;min-width:0;padding:2px 0 4px;overflow-x:auto}.aYQbCq_dagCanvas{min-width:100%;position:relative}.aYQbCq_dagCanvas[data-layout=parallel]{flex-wrap:wrap;gap:8px;display:flex}.aYQbCq_dagCanvas[data-layout=parallel] .aYQbCq_dagNode{flex:92px;min-width:92px;position:relative}.aYQbCq_dagEdges{pointer-events:none;position:absolute;inset:0;overflow:visible}.aYQbCq_dagEdges path{fill:none;stroke:var(--dsw-alias-border-l3);stroke-width:1px;transition:opacity .14s,stroke .14s,stroke-width .14s}.aYQbCq_dagEdges path[data-active=true]{stroke:var(--dsw-alias-state-business-primary);stroke-width:1.6px}.aYQbCq_dagEdges path[data-dimmed=true]{opacity:.24}.aYQbCq_dagNode{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;border-radius:6px;flex-direction:column;justify-content:center;gap:1px;padding:0 6px;transition:border-color .14s,background-color .14s,opacity .14s;display:flex;position:absolute}.aYQbCq_dagNode:hover,.aYQbCq_dagNode[data-focused=true]{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, var(--dsw-alias-bg-layer-1))}.aYQbCq_dagNode[data-dimmed=true]{opacity:.3}.aYQbCq_dagNode[data-state=running][data-dimmed=true]{opacity:.58}.aYQbCq_dagNode[data-state=completed]{border-color:color-mix(in srgb, var(--dsw-alias-state-success-primary) 48%, var(--dsw-alias-border-l2))}.aYQbCq_dagNode[data-state=blocked]{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 52%, var(--dsw-alias-border-l2))}.aYQbCq_dagNode[data-state=failed]{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 56%, var(--dsw-alias-border-l2))}.aYQbCq_dagNode[data-verdict-stale=true]{border-style:dashed;border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 62%, var(--dsw-alias-border-l2))}.aYQbCq_dagNode[data-verdict-stale=true] .aYQbCq_dagNodeHead{color:var(--dsw-alias-state-warn-primary)}.aYQbCq_dagNodeHead{color:var(--dsw-alias-label-primary);align-items:center;gap:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9.5px;font-weight:700;display:flex}.aYQbCq_dagNodeDot{background:var(--dsw-alias-border-l3);border-radius:1.5px;flex:none;width:5px;height:5px}.aYQbCq_dagNode[data-state=running] .aYQbCq_dagNodeDot{background:var(--dsw-alias-state-business-primary)}.aYQbCq_dagNode[data-state=running] .aYQbCq_dagNodeHead{padding-right:12px}.aYQbCq_dagRunningState{width:9px;height:9px;color:var(--dsw-alias-state-business-primary);pointer-events:none;justify-content:center;align-items:center;display:inline-flex;position:absolute;top:4px;right:5px}.aYQbCq_dagRunningState .aYQbCq_workGlyph{width:9px;height:9px}.aYQbCq_dagNode[data-state=blocked] .aYQbCq_dagNodeDot{background:var(--dsw-alias-state-warn-primary)}.aYQbCq_dagNode[data-state=completed] .aYQbCq_dagNodeDot{background:var(--dsw-alias-state-success-primary)}.aYQbCq_dagNode[data-state=failed] .aYQbCq_dagNodeDot{background:var(--dsw-alias-state-error-primary)}.aYQbCq_dagNodeLabel{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:8.5px;line-height:11px;overflow:hidden}.aYQbCq_taskDetail{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);border-radius:9px;flex-direction:column;gap:3px;min-width:0;padding:7px 9px;display:flex}.aYQbCq_taskDetailHead{align-items:center;gap:6px;min-width:0;display:flex}.aYQbCq_taskDetailId{color:var(--dsw-alias-state-business-primary);flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;font-weight:700}.aYQbCq_taskDetailSubject{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:600;line-height:16px;overflow:hidden}.aYQbCq_taskDetailBadge{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-secondary);border-radius:4px;flex:none;padding:0 5px;font-size:8.5px;font-weight:600;line-height:14px}.aYQbCq_taskDetailBadge[data-state=running]{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_taskDetailBadge[data-state=blocked]{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_taskDetailBadge[data-state=completed]{background:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_taskDetailBadge[data-state=failed]{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_taskDetailLine,.aYQbCq_taskDetailMeta{color:var(--dsw-alias-label-secondary);font-size:9.5px;line-height:14px}.aYQbCq_taskDetailMeta{color:var(--dsw-alias-label-tertiary)}.aYQbCq_emptyHint{color:var(--dsw-alias-label-tertiary);padding:10px 12px;font-size:11px;line-height:16px}.aYQbCq_planEditor{border:1px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 30%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-bg-module-platform) 94%, var(--dsw-alias-state-business-primary));box-shadow:inset 0 1px 0 color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);border-radius:10px;flex-direction:column;gap:12px;margin:0 10px 12px;padding:12px;display:flex}.aYQbCq_planHeader>span{justify-content:space-between;align-items:center;gap:8px;display:flex}.aYQbCq_planHeader>span>span{flex-direction:column;gap:2px;min-width:0;display:flex}.aYQbCq_planHeader strong{color:var(--dsw-alias-label-primary);font-size:12px}.aYQbCq_planHeader small{color:var(--dsw-alias-label-secondary);font-size:9px;font-weight:500;line-height:13px}.aYQbCq_planHeader em{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted);border-radius:999px;flex:none;padding:1px 7px;font-size:9px;font-style:normal;line-height:16px}.aYQbCq_planHeader p{color:var(--dsw-alias-label-secondary);margin:5px 0 0;font-size:10px;line-height:15px}.aYQbCq_planFlow{grid-template-columns:repeat(3,minmax(0,1fr));margin:0;padding:0;list-style:none;display:grid}.aYQbCq_planFlow li{min-width:0;color:var(--dsw-alias-label-tertiary);align-items:center;gap:5px;font-size:9px;font-weight:600;line-height:14px;display:flex;position:relative}.aYQbCq_planFlow li:not(:last-child):after{background:var(--dsw-alias-border-l2);content:"";flex:1;min-width:8px;height:1px;margin-right:5px}.aYQbCq_planFlow li>span{border:1px solid var(--dsw-alias-border-l2);border-radius:50%;flex:none;place-items:center;width:18px;height:18px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;display:grid}.aYQbCq_planFlow li[data-active]{color:var(--dsw-alias-state-business-primary)}.aYQbCq_planFlow li[data-active]>span{border-color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent)}.aYQbCq_planSection{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);border-radius:8px;overflow:hidden}.aYQbCq_planSectionToggle,.aYQbCq_planCardHeader{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:0}.aYQbCq_planSectionToggle{justify-content:space-between;align-items:center;gap:8px;min-height:42px;padding:7px 9px;display:flex}.aYQbCq_planSectionToggle:hover,.aYQbCq_planCardHeader:hover{background:color-mix(in srgb, var(--dsw-alias-button-ghost-active-fill) 46%, transparent)}.aYQbCq_planSectionToggle>span{align-items:baseline;gap:7px;min-width:0;display:flex}.aYQbCq_planSectionToggle strong{font-size:10.5px}.aYQbCq_planSectionToggle small{color:var(--dsw-alias-label-tertiary);font-size:9px}.aYQbCq_planList{border-top:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:0;display:flex}.aYQbCq_planEmpty{color:var(--dsw-alias-label-tertiary);text-align:center;margin:0;padding:12px;font-size:10px}.aYQbCq_planCard{background:0 0;border:0;border-radius:0;min-width:0;margin:0;padding:0;display:block;position:relative}.aYQbCq_planCard+.aYQbCq_planCard{border-top:1px solid var(--dsw-alias-border-l2)}.aYQbCq_planCard[data-open=true]{background:color-mix(in srgb, var(--dsw-alias-bg-base) 62%, transparent)}.aYQbCq_planCardHeader{grid-template-columns:minmax(80px,.9fr) minmax(72px,1.15fr) auto 12px;align-items:center;gap:7px;min-height:40px;padding:6px 9px;display:grid}.aYQbCq_planCardIdentity{flex-direction:column;gap:1px;min-width:0;display:flex}.aYQbCq_planCardIdentity strong,.aYQbCq_planTaskSummary{color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:650;line-height:14px;overflow:hidden}.aYQbCq_planCardIdentity>span,.aYQbCq_planCardMeta{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:8.5px;line-height:12px;overflow:hidden}.aYQbCq_planTaskId{background:var(--dsw-alias-button-ghost-active-fill);width:max-content;color:var(--dsw-alias-label-secondary);border-radius:4px;padding:1px 5px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:8.5px;font-weight:700;line-height:14px}.aYQbCq_planDirty{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 13%, transparent);color:var(--dsw-alias-state-warn-primary);border-radius:999px;justify-self:end;padding:1px 5px;font-size:8px;font-style:normal;font-weight:650;line-height:14px}.aYQbCq_planChevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .18s cubic-bezier(.2,.7,.2,1)}.aYQbCq_planChevron[data-open=true]{transform:rotate(90deg)}.aYQbCq_planCardBody{flex-direction:column;gap:8px;padding:0 9px 9px;display:flex}.aYQbCq_planCardBody fieldset{border:0;flex-direction:column;gap:7px;min-width:0;margin:0;padding:0;display:flex}.aYQbCq_planCardBody label,.aYQbCq_planNewTask label{min-width:0;color:var(--dsw-alias-label-tertiary);flex-direction:column;flex:1;gap:4px;font-size:9px;display:flex}.aYQbCq_planCardBody label small{color:var(--dsw-alias-label-tertiary);font-size:8px;line-height:11px}.aYQbCq_planCard input,.aYQbCq_planCard textarea,.aYQbCq_planCard select,.aYQbCq_planNewTask input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);width:100%;min-width:0;color:var(--dsw-alias-label-primary);font:inherit;border-radius:6px;outline:none;font-size:10.5px;line-height:16px;transition:border-color .16s,box-shadow .16s}.aYQbCq_planCard input,.aYQbCq_planCard select,.aYQbCq_planNewTask input{min-height:32px;padding:6px 8px}.aYQbCq_planCard textarea{resize:vertical;min-height:58px;padding:7px 8px}.aYQbCq_planCard input:focus-visible,.aYQbCq_planCard textarea:focus-visible,.aYQbCq_planCard select:focus-visible,.aYQbCq_planNewTask input:focus-visible{border-color:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent)}.aYQbCq_planGrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;display:grid}.aYQbCq_planModelPicker{grid-template-columns:minmax(0,1fr);gap:5px;display:grid}.aYQbCq_planModelMenu{width:100%;display:flex}.aYQbCq_planModelTrigger{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);width:100%;min-height:38px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;border-radius:7px;justify-content:space-between;align-items:center;gap:8px;padding:7px 9px;transition:border-color .16s,background-color .16s,transform .12s;display:flex}.aYQbCq_planModelTrigger:hover:not(:disabled){border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}.aYQbCq_planModelTrigger:active:not(:disabled){transform:translateY(1px)}.aYQbCq_planModelTrigger:focus-visible{border-color:var(--dsw-alias-state-business-primary);outline:2px solid color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent);outline-offset:1px}.aYQbCq_planModelTrigger:disabled{cursor:wait;opacity:.64}.aYQbCq_planModelTriggerCopy{align-items:baseline;gap:6px;min-width:0;display:flex}.aYQbCq_planModelTriggerCopy strong,.aYQbCq_planModelTriggerCopy span{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.aYQbCq_planModelTriggerCopy strong{color:var(--dsw-alias-label-primary);font-size:10px;font-weight:650;line-height:15px}.aYQbCq_planModelTriggerCopy span{color:var(--dsw-alias-label-tertiary);font-size:9px;line-height:14px}.aYQbCq_planModelMenuRow{grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;width:100%;min-width:0;display:grid}.aYQbCq_planModelMenuRow>span:first-child{color:var(--dsw-alias-label-primary)}.aYQbCq_planModelMenuRow strong{color:var(--dsw-alias-label-tertiary);text-align:right;text-overflow:ellipsis;white-space:nowrap;font-weight:450;overflow:hidden}.aYQbCq_planModelMenuBack{align-items:center;gap:7px;display:inline-flex}.aYQbCq_planModelMenuBack svg{transform:rotate(180deg)}.aYQbCq_planModelEffortRow{flex-direction:column;align-items:flex-start;min-width:0;display:flex}.aYQbCq_planModelEffortRow small{width:100%;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:14px;overflow:hidden}.aYQbCq_planModelHint{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:8.5px;line-height:12px;overflow:hidden}.aYQbCq_planModelNotice{background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 9%, transparent);color:var(--dsw-alias-label-secondary);border-radius:6px;grid-column:1/-1;justify-content:space-between;align-items:center;gap:8px;padding:6px 7px;font-size:8.5px;line-height:12px;display:flex}.aYQbCq_planModelNotice button{color:var(--dsw-alias-state-business-primary);cursor:pointer;font:inherit;background:0 0;border:0;flex:none;padding:2px 6px;font-weight:650}.aYQbCq_planActions,.aYQbCq_planApproveRow,.aYQbCq_planNewTask,.aYQbCq_planConfirm,.aYQbCq_planApproveActions,.aYQbCq_planSecondaryActions{align-items:center;gap:7px;display:flex}.aYQbCq_planReviewActions{grid-template-columns:minmax(0,1fr);gap:6px;width:100%;display:grid}.aYQbCq_planSecondaryActions{grid-template-columns:minmax(0,1fr) auto;display:grid}.aYQbCq_planActions{justify-content:flex-end}.aYQbCq_planActions button,.aYQbCq_planNewTask button,.aYQbCq_planApproveRow button,.aYQbCq_planConfirm button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-ghost-active-fill);min-height:30px;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:6px;flex:none;padding:5px 10px;font-size:9.5px;font-weight:600;transition:background .16s,border-color .16s,transform .16s}.aYQbCq_planActions button:hover:not(:disabled),.aYQbCq_planNewTask button:hover:not(:disabled),.aYQbCq_planApproveRow button:hover:not(:disabled),.aYQbCq_planConfirm button:hover:not(:disabled){border-color:var(--dsw-alias-label-tertiary)}.aYQbCq_planActions button:active:not(:disabled),.aYQbCq_planNewTask button:active:not(:disabled),.aYQbCq_planApproveRow button:active:not(:disabled),.aYQbCq_planConfirm button:active:not(:disabled){transform:scale(.98)}.aYQbCq_planActions button[data-danger],.aYQbCq_planConfirm button[data-danger]{color:var(--dsw-alias-state-error-primary)}.aYQbCq_planFeedback{min-width:0;color:var(--dsw-alias-label-secondary);flex:1;align-items:center;gap:5px;font-size:9px;line-height:13px;animation:.18s ease-out aYQbCq_plan-feedback-in;display:inline-flex}.aYQbCq_planFeedback[data-tone=success]{color:var(--dsw-alias-state-success-primary)}.aYQbCq_planFeedback[data-tone=error]{color:var(--dsw-alias-state-error-primary)}.aYQbCq_planFeedback>span{border:1px solid;border-radius:50%;flex:none;place-items:center;width:15px;height:15px;display:grid}.aYQbCq_planFeedback svg{width:11px;height:11px}@keyframes aYQbCq_plan-feedback-in{0%{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:translateY(0)}}.aYQbCq_planConfirm{border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, var(--dsw-alias-border-l2));background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 7%, transparent);border-radius:7px;flex-wrap:wrap;justify-content:flex-end;padding:7px}.aYQbCq_planConfirm>span{min-width:140px;color:var(--dsw-alias-label-secondary);flex:1;font-size:9px;line-height:13px}.aYQbCq_planNewTask{align-items:flex-end}.aYQbCq_planNewTask label{gap:4px}.aYQbCq_planNewTask label>span{line-height:13px}.aYQbCq_planApproveRow{z-index:1;border:1px solid var(--dsw-alias-border-l2);background:color-mix(in srgb, var(--dsw-alias-bg-module-platform) 94%, transparent);min-height:50px;box-shadow:0 -5px 16px color-mix(in srgb, var(--dsw-alias-bg-base) 35%, transparent);backdrop-filter:blur(8px);border-radius:8px;flex-direction:column;justify-content:flex-end;align-items:stretch;margin:0 -4px -4px;padding:8px;position:sticky;bottom:0}.aYQbCq_planApproveRow[data-armed=true]{border-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, var(--dsw-alias-border-l2))}.aYQbCq_planApproveRow[data-discard=true]{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l2))}.aYQbCq_planApproveCopy{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.aYQbCq_planApproveCopy strong{color:var(--dsw-alias-label-primary);font-size:9.5px;line-height:13px}.aYQbCq_planApproveCopy small{color:var(--dsw-alias-label-tertiary);font-size:8.5px;line-height:12px}.aYQbCq_planApproveRow button{background:var(--dsw-alias-state-business-primary);min-height:32px;color:var(--dsw-alias-label-primary-inverted);padding-inline:13px}.aYQbCq_planReviewActions>button[data-plan-approve]{width:100%}.aYQbCq_planApproveActions>button:first-child{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-primary)}.aYQbCq_planSecondaryActions>button,.aYQbCq_planApproveActions>button[data-danger]{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-primary)}.aYQbCq_planSecondaryActions>button[data-danger],.aYQbCq_planApproveActions>button[data-danger]{color:var(--dsw-alias-state-error-primary)}.aYQbCq_planSectionToggle:focus-visible,.aYQbCq_planCardHeader:focus-visible,.aYQbCq_planActions button:focus-visible,.aYQbCq_planNewTask button:focus-visible,.aYQbCq_planApproveRow button:focus-visible,.aYQbCq_planConfirm button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}.aYQbCq_planActions button:disabled,.aYQbCq_planNewTask button:disabled,.aYQbCq_planApproveRow button:disabled{cursor:default;opacity:.55}.aYQbCq_historicPill{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-tertiary);border-radius:4px;flex:none;margin-left:auto;padding:1px 7px;font-size:9.5px;font-weight:600;line-height:15px}.aYQbCq_members{flex-direction:column;gap:3px;display:flex}.aYQbCq_archiveLabel{color:var(--dsw-alias-label-tertiary);padding:5px 14px 0;font-size:9.5px;font-weight:600;line-height:14px;display:block}@media (prefers-reduced-motion:reduce){.aYQbCq_panel,.aYQbCq_badge,.aYQbCq_badgeDot,.aYQbCq_panelDot,.aYQbCq_workGlyph rect,.aYQbCq_stateArt,.aYQbCq_memberAvatar[data-unread=true]:after,.aYQbCq_planChevron,.aYQbCq_planFeedback,.aYQbCq_planActions button,.aYQbCq_planNewTask button,.aYQbCq_planApproveRow button,.aYQbCq_planConfirm button,.aYQbCq_planCard input,.aYQbCq_planCard textarea,.aYQbCq_planCard select,.aYQbCq_planNewTask input{transition:none;animation:none}}@media (width<=960px){html[data-agent-teams-panel-open] [data-phase=active]{padding-right:0}}@media (width<=640px){.aYQbCq_badge{top:56px;right:10px}.aYQbCq_teamStats span[data-stat=messages]{display:none}.aYQbCq_captainNode{grid-template-columns:48px minmax(0,1fr)}.aYQbCq_captainState{display:none}.aYQbCq_delegationTree{margin-left:12px;padding-left:15px}.aYQbCq_memberBranch{width:15px}.aYQbCq_assignmentLine{padding-left:53px}.aYQbCq_planFlow li{gap:4px;font-size:8px}.aYQbCq_planFlow li:not(:last-child):after{margin-right:3px}.aYQbCq_planCardHeader{grid-template-columns:auto minmax(0,1fr) auto}.aYQbCq_planCardHeader .aYQbCq_planCardMeta{display:none}.aYQbCq_planGrid,.aYQbCq_planModelPicker{grid-template-columns:minmax(0,1fr)}.aYQbCq_planNewTask,.aYQbCq_planApproveRow{flex-direction:column;align-items:stretch}.aYQbCq_planNewTask button,.aYQbCq_planApproveRow>button,.aYQbCq_planApproveActions,.aYQbCq_planReviewActions{width:100%}.aYQbCq_planApproveActions button,.aYQbCq_planReviewActions button,.aYQbCq_planSecondaryActions button{flex:1}}@container aYQbCq_agent-team (width<=360px){.aYQbCq_planEditor{margin-inline:0;padding-inline:10px}.aYQbCq_planHeader>span{align-items:flex-start}.aYQbCq_planFlow li{gap:3px;font-size:7.5px}.aYQbCq_planFlow li:not(:last-child):after{min-width:4px;margin-right:2px}.aYQbCq_planSecondaryActions,.aYQbCq_planApproveActions{grid-template-columns:minmax(0,1fr);width:100%;display:grid}.aYQbCq_planSecondaryActions button,.aYQbCq_planApproveActions button{width:100%}}.aYQbCq_dagOwner{text-overflow:ellipsis;max-width:64px;margin-left:auto;font-size:9px;font-weight:400;overflow:hidden}.aYQbCq_team[data-workspace-team]{--workspace-surface:var(--dsw-alias-bg-layer-1);--workspace-line:color-mix(in srgb, var(--dsw-alias-border-l2) 75%, transparent);--workspace-shadow:0 3px 14px color-mix(in srgb, var(--dsw-alias-label-primary) 3%, transparent);background:0 0;border:0;gap:14px;padding:0;container:none}.aYQbCq_team[data-workspace-team] .aYQbCq_teamHead{flex-wrap:wrap;gap:8px;padding:0 2px 2px}.aYQbCq_team[data-workspace-team] .aYQbCq_teamName{flex-basis:160px;font-size:14px;line-height:1.5}.aYQbCq_team[data-workspace-team] .aYQbCq_teamStats{flex-wrap:wrap;font-size:11px}.aYQbCq_team[data-workspace-team] .aYQbCq_teamStopButton{border-radius:9px;width:32px;height:32px}.aYQbCq_team[data-workspace-team] .aYQbCq_delegationSection,.aYQbCq_team[data-workspace-team] .aYQbCq_dependencySection,.aYQbCq_completionCard,.aYQbCq_inboxCard{border:1px solid var(--workspace-line);background:var(--workspace-surface);min-width:0;box-shadow:var(--workspace-shadow);box-sizing:border-box;border-radius:18px;margin:0;padding:18px}.aYQbCq_team[data-workspace-team] .aYQbCq_captainNode{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 4%, var(--dsw-alias-bg-module-platform));border-color:var(--workspace-line);border-radius:12px;grid-template-columns:44px minmax(0,1fr);gap:8px;padding:10px}.aYQbCq_team[data-workspace-team] .aYQbCq_captainState{grid-column:2;justify-self:start;font-size:11px}.aYQbCq_team[data-workspace-team] .aYQbCq_captainName{font-size:14px}.aYQbCq_team[data-workspace-team] .aYQbCq_captainRole{font-size:11px}.aYQbCq_team[data-workspace-team] .aYQbCq_captainSummary{white-space:normal;font-size:12px;line-height:1.6}.aYQbCq_team[data-workspace-team] .aYQbCq_progressOverview{gap:9px;margin:16px 0}.aYQbCq_team[data-workspace-team] .aYQbCq_progressSegments{gap:4px}.aYQbCq_team[data-workspace-team] .aYQbCq_progressSegments>span{border-radius:4px;height:6px}.aYQbCq_team[data-workspace-team] .aYQbCq_progressLegend{gap:8px 12px;font-size:11px}.aYQbCq_team[data-workspace-team] .aYQbCq_progressSummary{font-size:11px;line-height:1.6}.aYQbCq_team[data-workspace-team] .aYQbCq_progressSummary>span:last-child{white-space:normal}.aYQbCq_team[data-workspace-team] .aYQbCq_membersToggle{background:var(--dsw-alias-bg-module-platform);border-radius:9px;padding:10px;font-size:11px}.aYQbCq_team[data-workspace-team] .aYQbCq_memberBlock{padding-top:14px;padding-bottom:8px}.aYQbCq_team[data-workspace-team] .aYQbCq_memberRow{border-radius:9px}.aYQbCq_team[data-workspace-team] .aYQbCq_memberLine{flex-wrap:wrap;gap:4px 6px}.aYQbCq_team[data-workspace-team] .aYQbCq_memberName{font-size:13px}.aYQbCq_team[data-workspace-team] .aYQbCq_memberRole,.aYQbCq_team[data-workspace-team] .aYQbCq_memberState,.aYQbCq_team[data-workspace-team] .aYQbCq_memberCount{font-size:11px}.aYQbCq_team[data-workspace-team] .aYQbCq_memberRole{background:var(--dsw-alias-bg-module-platform);border-radius:5px;padding:1px 5px}.aYQbCq_team[data-workspace-team] .aYQbCq_memberStatusLine{white-space:normal;font-size:12px;line-height:1.6}.aYQbCq_team[data-workspace-team] .aYQbCq_assignmentLine{flex-wrap:wrap;row-gap:5px}.aYQbCq_team[data-workspace-team] .aYQbCq_assignmentLabel{font-size:10px}.aYQbCq_team[data-workspace-team] .aYQbCq_assignmentChip{border-radius:5px;font-size:10px;line-height:18px}.aYQbCq_team[data-workspace-team] .aYQbCq_memberBlock[data-selected-member] .aYQbCq_memberRow{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}.aYQbCq_team[data-workspace-team] .aYQbCq_sectionHead{flex-wrap:wrap;gap:8px;margin-bottom:18px}.aYQbCq_team[data-workspace-team] .aYQbCq_sectionToggleTitle{font-size:12px}.aYQbCq_team[data-workspace-team] .aYQbCq_sectionHint{white-space:normal;font-size:11px;line-height:1.6}.aYQbCq_team[data-workspace-team] .aYQbCq_dagViewport{padding:4px 2px 14px}.aYQbCq_team[data-workspace-team] .aYQbCq_dagNode{background:var(--workspace-surface);border-radius:11px;padding:10px 11px}.aYQbCq_team[data-workspace-team] .aYQbCq_dagNodeHead{margin-bottom:6px;font-size:11px}.aYQbCq_team[data-workspace-team] .aYQbCq_dagNodeLabel{white-space:normal;-webkit-line-clamp:2;letter-spacing:0;-webkit-box-orient:vertical;font-size:12px;line-height:1.4;display:-webkit-box;overflow:hidden}.aYQbCq_team[data-workspace-team] .aYQbCq_dagOwner{white-space:nowrap;max-width:105px;font-size:10px}.aYQbCq_team[data-workspace-team] .aYQbCq_taskDetail{border-radius:11px;margin-top:14px;padding:14px}.aYQbCq_team[data-workspace-team] .aYQbCq_taskDetailSubject{white-space:normal;font-size:13px;line-height:1.6}.aYQbCq_team[data-workspace-team] .aYQbCq_taskDetailLine,.aYQbCq_team[data-workspace-team] .aYQbCq_taskDetailMeta{font-size:12px;line-height:1.6}.aYQbCq_team[data-workspace-team] .aYQbCq_planEditor{background:var(--workspace-surface);border-color:var(--workspace-line);border-radius:18px;margin:0;padding:18px}.aYQbCq_team[data-workspace-team] .aYQbCq_planApproveRow{position:static}.aYQbCq_workspaceSummary{grid-template-columns:minmax(0,1fr);gap:14px;min-width:0;display:grid}.aYQbCq_completionCard h3,.aYQbCq_inboxCard h3{color:var(--dsw-alias-label-secondary);margin:0;font-size:12px;font-weight:600;line-height:1.6}.aYQbCq_completionBody{flex-wrap:wrap;align-items:center;gap:20px;margin-top:16px;display:flex}.aYQbCq_completionRing{flex:none;width:132px;height:132px;position:relative}.aYQbCq_completionRing svg{width:100%;height:100%;transform:rotate(-90deg)}.aYQbCq_completionRing circle{fill:none;stroke-width:7px}.aYQbCq_ringTrack{stroke:var(--dsw-alias-border-l2)}.aYQbCq_ringValue{stroke:var(--dsw-alias-state-business-primary)}.aYQbCq_completionRing>span{color:var(--dsw-alias-label-secondary);flex-direction:column;justify-content:center;align-items:center;gap:5px;font-size:11px;display:flex;position:absolute;inset:0}.aYQbCq_completionRing strong{color:var(--dsw-alias-label-primary);letter-spacing:-.7px;font-variant-numeric:tabular-nums;font-size:26px;font-weight:600;line-height:1.2}.aYQbCq_completionRing small{font-size:18px;font-weight:450}.aYQbCq_completionTasks{flex:200px;min-width:0;max-height:216px;margin:0;padding:2px;list-style:none;overflow:auto}.aYQbCq_completionTasks li{border-bottom:1px solid var(--workspace-line);grid-template-columns:18px auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:7px 0;font-size:11px;display:grid}.aYQbCq_completionTasks li:last-child{border:0}.aYQbCq_completionDot{background:var(--dsw-alias-bg-module-platform);width:16px;height:16px;color:var(--dsw-alias-label-secondary);border-radius:50%;place-items:center;display:grid}.aYQbCq_completionTasks li[data-state=completed] .aYQbCq_completionDot{background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_completionTasks li[data-state=failed] .aYQbCq_completionDot{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_completionTaskId{text-overflow:ellipsis;white-space:nowrap;max-width:6em;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden}.aYQbCq_completionTaskSubject{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.aYQbCq_completionTaskStatus{color:var(--dsw-alias-label-secondary);font-size:10px}.aYQbCq_completionTasks li[data-verdict-stale] .aYQbCq_completionDot{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary)}.aYQbCq_completionTasks li[data-verdict-stale] .aYQbCq_completionTaskStatus{font-weight:600}.aYQbCq_completionTasks:focus-visible,.aYQbCq_inboxMessages:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px;border-radius:4px}.aYQbCq_inboxCard>header{flex-wrap:wrap;align-items:baseline;gap:6px 12px;display:flex}.aYQbCq_inboxCard>header>span{color:var(--dsw-alias-label-secondary);font-size:10px}.aYQbCq_inboxMessages{max-height:260px;margin:14px 0 0;padding:0;list-style:none;overflow:auto}.aYQbCq_inboxMessages li{align-items:start;gap:9px;margin:0 0 12px;display:flex}.aYQbCq_inboxMessages img,.aYQbCq_inboxInitial{object-fit:contain;flex:none;width:30px;height:30px}.aYQbCq_inboxInitial{background:var(--dsw-alias-bg-module-platform);border-radius:9px;place-items:center;font-size:12px;display:grid}.aYQbCq_inboxMessages li>div{flex:1;min-width:0}.aYQbCq_inboxMessages strong{overflow-wrap:anywhere;font-size:11px;font-weight:550}.aYQbCq_inboxMessages p{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, var(--dsw-alias-bg-module-platform));white-space:pre-wrap;overflow-wrap:anywhere;border-radius:0 10px 10px;margin:5px 0 0;padding:9px 11px;font-size:12px;line-height:1.6}.aYQbCq_summaryEmpty{color:var(--dsw-alias-label-secondary);margin:14px 0 0;font-size:12px;line-height:1.8}@container (width>=800px){.aYQbCq_team[data-workspace-team]{grid-template-columns:minmax(280px,1fr) minmax(0,2fr);align-items:start;gap:16px;display:grid}.aYQbCq_team[data-workspace-team]>.aYQbCq_teamHead,.aYQbCq_team[data-workspace-team]>[data-staging-editor],.aYQbCq_workspaceSummary{grid-column:1/-1}.aYQbCq_workspaceSummary{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.aYQbCq_team[data-workspace-team] .aYQbCq_dependencySection{align-self:stretch}.aYQbCq_team[data-workspace-team] .aYQbCq_dagCanvas[data-layout=parallel]{grid-template-columns:repeat(2,minmax(0,1fr))}}@container (width<=400px){.aYQbCq_team[data-workspace-team] .aYQbCq_delegationSection,.aYQbCq_team[data-workspace-team] .aYQbCq_dependencySection,.aYQbCq_completionCard,.aYQbCq_inboxCard{border-radius:14px;padding:12px}.aYQbCq_team[data-workspace-team] .aYQbCq_teamStats{gap:6px;font-size:10px}.aYQbCq_completionBody{justify-content:center}}.aYQbCq_progressSegments>span[data-state=claimed],.aYQbCq_dagNode[data-state=claimed] .aYQbCq_dagNodeDot{background:var(--dsw-alias-state-warn-primary)}.aYQbCq_progressLegend>span[data-state=claimed]{color:var(--dsw-alias-state-warn-primary)}.aYQbCq_dagNode[data-state=claimed]{border-color:var(--dsw-alias-state-warn-primary)}.aYQbCq_dagNode[data-state=claimed] .aYQbCq_dagNodeHead{padding-right:38px}.aYQbCq_dagClaimedState{color:var(--dsw-alias-state-warn-primary);font-size:8px;line-height:10px;position:absolute;top:4px;right:5px}.aYQbCq_assignmentChip[data-state=claimed],.aYQbCq_taskDetailBadge[data-state=claimed]{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-primary-inverted)}.aYQbCq_archivedWrap{flex-direction:column;display:flex}.aYQbCq_planSave{box-sizing:border-box;border:1px solid transparent;background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted);font:inherit;cursor:pointer;border-radius:7px;justify-content:center;align-items:center;min-height:28px;padding:0 12px;font-size:10.5px;font-weight:600;line-height:15px;transition:background-color .12s,transform .12s;display:inline-flex}.aYQbCq_planSave:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 88%, var(--dsw-alias-bg-base))}.aYQbCq_planSave:active:not(:disabled){transform:scale(.97)}.aYQbCq_planSave:disabled{background:var(--dsw-alias-button-ghost-active-fill);color:var(--dsw-alias-label-tertiary);cursor:not-allowed}.aYQbCq_planSave:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}.aYQbCq_panelColumnMain{flex-direction:column;gap:9px;min-width:0;display:flex}.aYQbCq_team[data-workspace-team]>.aYQbCq_dependencySection{overscroll-behavior:contain;min-width:0;max-height:56vh;overflow-y:auto}@container (width>=800px){.aYQbCq_team[data-workspace-team]>.aYQbCq_dependencySection{align-self:stretch;contain:size;max-height:none}}`;
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = css2;
  document.head.appendChild(style);
}
var ActivityPanel_default = { "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "16": "16", "24": "24", "25": "25", "42": "42", "45": "45", "55": "55", "58": "58", "64": "64", "78": "78", "82": "82", "92": "92", "94": "94", "95": "95", "97": "97", "98": "98", "995": "995", "badge": "aYQbCq_badge", "15s": "15s", "12s": "12s", "iconButton": "aYQbCq_iconButton", "memberRow": "aYQbCq_memberRow", "membersToggle": "aYQbCq_membersToggle", "sectionToggleTitle": "aYQbCq_sectionToggleTitle", "dagNode": "aYQbCq_dagNode", "badgeDot": "aYQbCq_badgeDot", "panelDot": "aYQbCq_panelDot", "25s": "25s", "badgeCount": "aYQbCq_badgeCount", "memberCount": "aYQbCq_memberCount", "teamStats": "aYQbCq_teamStats", "stageLabel": "aYQbCq_stageLabel", "taskId": "aYQbCq_taskId", "panel": "aYQbCq_panel", "08": "08", "16s": "16s", "panelHead": "aYQbCq_panelHead", "panelTitle": "aYQbCq_panelTitle", "panelControls": "aYQbCq_panelControls", "resizeHandle": "aYQbCq_resizeHandle", "teams": "aYQbCq_teams", "team": "aYQbCq_team", "teamHead": "aYQbCq_teamHead", "teamName": "aYQbCq_teamName", "5px": "5px", "teamStopButton": "aYQbCq_teamStopButton", "stopModalActions": "aYQbCq_stopModalActions", "stopModalError": "aYQbCq_stopModalError", "sectionHead": "aYQbCq_sectionHead", "sectionTitle": "aYQbCq_sectionTitle", "sectionHint": "aYQbCq_sectionHint", "delegationSection": "aYQbCq_delegationSection", "captainNode": "aYQbCq_captainNode", "captainAvatar": "aYQbCq_captainAvatar", "memberAvatar": "aYQbCq_memberAvatar", "leadAvatar": "aYQbCq_leadAvatar", "memberArt": "aYQbCq_memberArt", "captainInfo": "aYQbCq_captainInfo", "memberInfo": "aYQbCq_memberInfo", "captainLine": "aYQbCq_captainLine", "memberLine": "aYQbCq_memberLine", "captainName": "aYQbCq_captainName", "memberName": "aYQbCq_memberName", "captainRole": "aYQbCq_captainRole", "memberRole": "aYQbCq_memberRole", "captainSummary": "aYQbCq_captainSummary", "memberStatusLine": "aYQbCq_memberStatusLine", "taskDetailModel": "aYQbCq_taskDetailModel", "memberModel": "aYQbCq_memberModel", "captainState": "aYQbCq_captainState", "memberState": "aYQbCq_memberState", "workGlyph": "aYQbCq_workGlyph", "1s": "1s", "progressOverview": "aYQbCq_progressOverview", "progressTitle": "aYQbCq_progressTitle", "progressSegments": "aYQbCq_progressSegments", "progressEmpty": "aYQbCq_progressEmpty", "progressLegend": "aYQbCq_progressLegend", "progressSummary": "aYQbCq_progressSummary", "progressSummaryDot": "aYQbCq_progressSummaryDot", "chevron": "aYQbCq_chevron", "14s": "14s", "delegationTree": "aYQbCq_delegationTree", "memberBlock": "aYQbCq_memberBlock", "memberBranch": "aYQbCq_memberBranch", "8s": "8s", "memberInitial": "aYQbCq_memberInitial", "stateArt": "aYQbCq_stateArt", "4s": "4s", "2s": "2s", "06": "06", "assignmentLine": "aYQbCq_assignmentLine", "assignmentLabel": "aYQbCq_assignmentLabel", "assignmentTasks": "aYQbCq_assignmentTasks", "assignmentChip": "aYQbCq_assignmentChip", "unreadPill": "aYQbCq_unreadPill", "taskEmpty": "aYQbCq_taskEmpty", "dependencySection": "aYQbCq_dependencySection", "dagViewport": "aYQbCq_dagViewport", "dagCanvas": "aYQbCq_dagCanvas", "dagEdges": "aYQbCq_dagEdges", "6px": "6px", "dagNodeHead": "aYQbCq_dagNodeHead", "dagNodeDot": "aYQbCq_dagNodeDot", "dagRunningState": "aYQbCq_dagRunningState", "dagNodeLabel": "aYQbCq_dagNodeLabel", "taskDetail": "aYQbCq_taskDetail", "taskDetailHead": "aYQbCq_taskDetailHead", "taskDetailId": "aYQbCq_taskDetailId", "taskDetailSubject": "aYQbCq_taskDetailSubject", "taskDetailBadge": "aYQbCq_taskDetailBadge", "taskDetailLine": "aYQbCq_taskDetailLine", "taskDetailMeta": "aYQbCq_taskDetailMeta", "emptyHint": "aYQbCq_emptyHint", "planEditor": "aYQbCq_planEditor", "planHeader": "aYQbCq_planHeader", "planFlow": "aYQbCq_planFlow", "planSection": "aYQbCq_planSection", "planSectionToggle": "aYQbCq_planSectionToggle", "planCardHeader": "aYQbCq_planCardHeader", "planList": "aYQbCq_planList", "planEmpty": "aYQbCq_planEmpty", "planCard": "aYQbCq_planCard", "9fr": "9fr", "15fr": "15fr", "planCardIdentity": "aYQbCq_planCardIdentity", "planTaskSummary": "aYQbCq_planTaskSummary", "planCardMeta": "aYQbCq_planCardMeta", "planTaskId": "aYQbCq_planTaskId", "planDirty": "aYQbCq_planDirty", "planChevron": "aYQbCq_planChevron", "18s": "18s", "planCardBody": "aYQbCq_planCardBody", "planNewTask": "aYQbCq_planNewTask", "planGrid": "aYQbCq_planGrid", "planModelPicker": "aYQbCq_planModelPicker", "planModelMenu": "aYQbCq_planModelMenu", "planModelTrigger": "aYQbCq_planModelTrigger", "planModelTriggerCopy": "aYQbCq_planModelTriggerCopy", "planModelMenuRow": "aYQbCq_planModelMenuRow", "planModelMenuBack": "aYQbCq_planModelMenuBack", "planModelEffortRow": "aYQbCq_planModelEffortRow", "planModelHint": "aYQbCq_planModelHint", "planModelNotice": "aYQbCq_planModelNotice", "planActions": "aYQbCq_planActions", "planApproveRow": "aYQbCq_planApproveRow", "planConfirm": "aYQbCq_planConfirm", "planApproveActions": "aYQbCq_planApproveActions", "planSecondaryActions": "aYQbCq_planSecondaryActions", "planReviewActions": "aYQbCq_planReviewActions", "planFeedback": "aYQbCq_planFeedback", "planApproveCopy": "aYQbCq_planApproveCopy", "historicPill": "aYQbCq_historicPill", "members": "aYQbCq_members", "archiveLabel": "aYQbCq_archiveLabel", "dagOwner": "aYQbCq_dagOwner", "completionCard": "aYQbCq_completionCard", "inboxCard": "aYQbCq_inboxCard", "workspaceSummary": "aYQbCq_workspaceSummary", "completionBody": "aYQbCq_completionBody", "completionRing": "aYQbCq_completionRing", "ringTrack": "aYQbCq_ringTrack", "ringValue": "aYQbCq_ringValue", "7px": "7px", "completionTasks": "aYQbCq_completionTasks", "completionDot": "aYQbCq_completionDot", "completionTaskId": "aYQbCq_completionTaskId", "completionTaskSubject": "aYQbCq_completionTaskSubject", "completionTaskStatus": "aYQbCq_completionTaskStatus", "inboxMessages": "aYQbCq_inboxMessages", "inboxInitial": "aYQbCq_inboxInitial", "summaryEmpty": "aYQbCq_summaryEmpty", "dagClaimedState": "aYQbCq_dagClaimedState", "archivedWrap": "aYQbCq_archivedWrap", "planSave": "aYQbCq_planSave", "panelColumnMain": "aYQbCq_panelColumnMain" };

// lib/client/StagingPlanEditor.js
var PLAN_URL = "/plugins/dsh-agent-teams/plan";
function useDismissSuccess(feedback, setFeedback) {
  (0, import_react2.useEffect)(() => {
    if (feedback?.tone !== "success")
      return;
    const timeout = window.setTimeout(() => {
      setFeedback(void 0);
    }, 3500);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [feedback, setFeedback]);
}
async function mutatePlan(payload) {
  const response = await fetch(PLAN_URL, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (response.ok)
    return;
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    if (typeof body.error === "string" && body.error.trim() !== "")
      message = body.error;
  } catch {
  }
  throw new Error(message);
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function DisclosureChevron({ open }) {
  return (0, import_jsx_runtime3.jsx)("svg", { className: ActivityPanel_default.planChevron, "data-open": open, width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": true, children: (0, import_jsx_runtime3.jsx)("path", { d: "M4 2.5 7.5 6 4 9.5" }) });
}
function Feedback({ value }) {
  if (value === void 0)
    return null;
  return (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planFeedback, "data-tone": value.tone, role: value.tone === "error" ? "alert" : "status", "aria-live": value.tone === "error" ? "assertive" : "polite", children: [(0, import_jsx_runtime3.jsx)("span", { "aria-hidden": true, children: value.tone === "success" ? (0, import_jsx_runtime3.jsx)("svg", { viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: "1.8", children: (0, import_jsx_runtime3.jsx)("path", { d: "m2.5 6.2 2.2 2.2 4.8-5" }) }) : (0, import_jsx_runtime3.jsx)("svg", { viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: "1.8", children: (0, import_jsx_runtime3.jsx)("path", { d: "M6 2.3v4.1M6 8.8v.1" }) }) }), value.message] });
}
function routeKey(provider, model) {
  return JSON.stringify([provider, model]);
}
var MODEL_MENU_OPEN_MODELS = "open:models";
var MODEL_MENU_OPEN_EFFORT = "open:effort";
var MODEL_MENU_BACK = "navigate:back";
var MODEL_MENU_RETRY = "action:retry";
var MODEL_MENU_DEFAULT_EFFORT = "effort:default";
function modelMenuId(provider, model) {
  return `model:${routeKey(provider, model)}`;
}
function effortMenuId(effort) {
  return `effort:${effort}`;
}
function StagedModelPicker({ directory, provider, model, reasoningEffort, busy, onChange, t }) {
  const state = (0, import_react2.useSyncExternalStore)(directory.store.subscribe, directory.store.getSnapshot);
  const [open, setOpen] = (0, import_react2.useState)(false);
  const [pane, setPane] = (0, import_react2.useState)("root");
  const catalogRoutes = state.groups.flatMap((group) => group.models.map((candidate) => ({
    key: routeKey(group.id, candidate.id),
    provider: group.id,
    providerName: group.name,
    model: candidate
  })));
  const selectedKey = routeKey(provider, model);
  const selected = catalogRoutes.find((candidate) => candidate.key === selectedKey);
  const efforts = selected?.model.reasoning?.efforts ?? [];
  const currentMissing = provider !== "" && model !== "" && selected === void 0;
  const defaultEffort = selected?.model.reasoning?.defaultEffort;
  const effectiveEffort = reasoningEffort === "" || reasoningEffort === "default" ? defaultEffort : reasoningEffort;
  const selectedEffort = efforts.find((effort) => effort.id === effectiveEffort);
  const modelLabel = selected?.model.name ?? (model === "" ? t("plan.model.choose") : model);
  const effortLabel = selectedEffort?.name ?? (effectiveEffort === void 0 ? t("plan.model.providerDefault") : effectiveEffort);
  const unavailable = state.status === "error" || state.failures.length > 0;
  const close = () => {
    setOpen(false);
    setPane("root");
  };
  const rootItems = [
    {
      id: MODEL_MENU_OPEN_MODELS,
      label: (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planModelMenuRow, children: [(0, import_jsx_runtime3.jsx)("span", { children: t("plan.member.model") }), (0, import_jsx_runtime3.jsx)("strong", { children: modelLabel }), (0, import_jsx_runtime3.jsx)(DisclosureChevron, { open: false })] }),
      disabled: state.status === "loading" && catalogRoutes.length === 0
    },
    {
      id: MODEL_MENU_OPEN_EFFORT,
      label: (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planModelMenuRow, children: [(0, import_jsx_runtime3.jsx)("span", { children: t("plan.member.reasoning") }), (0, import_jsx_runtime3.jsx)("strong", { children: effortLabel }), (0, import_jsx_runtime3.jsx)(DisclosureChevron, { open: false })] }),
      disabled: selected?.model.reasoning === void 0
    }
  ];
  const modelItems = [
    {
      id: MODEL_MENU_BACK,
      label: (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planModelMenuBack, children: [(0, import_jsx_runtime3.jsx)(DisclosureChevron, { open: false }), t("plan.model.back")] })
    },
    { type: "separator", id: "models:separator" }
  ];
  if (catalogRoutes.length === 0) {
    modelItems.push({
      id: "models:empty",
      label: state.status === "loading" ? t("plan.model.loading") : t("plan.model.empty"),
      disabled: true
    });
  } else {
    for (const group of state.groups) {
      modelItems.push({ type: "label", id: `provider:${group.id}`, text: group.name });
      for (const candidate of group.models) {
        modelItems.push({
          id: modelMenuId(group.id, candidate.id),
          label: candidate.name
        });
      }
    }
  }
  const effortItems = [
    {
      id: MODEL_MENU_BACK,
      label: (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planModelMenuBack, children: [(0, import_jsx_runtime3.jsx)(DisclosureChevron, { open: false }), t("plan.model.back")] })
    },
    { type: "separator", id: "effort:separator" },
    {
      id: MODEL_MENU_DEFAULT_EFFORT,
      label: defaultEffort === void 0 ? t("plan.model.providerDefault") : t("plan.model.modelDefault", {
        effort: efforts.find((effort) => effort.id === defaultEffort)?.name ?? defaultEffort
      })
    },
    ...efforts.map((effort) => ({
      id: effortMenuId(effort.id),
      label: (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planModelEffortRow, children: [(0, import_jsx_runtime3.jsx)("span", { children: effort.name }), effort.description !== void 0 && (0, import_jsx_runtime3.jsx)("small", { children: effort.description })] })
    }))
  ];
  const items = pane === "models" ? modelItems : pane === "effort" ? effortItems : rootItems;
  const selectedId = pane === "models" ? modelMenuId(provider, model) : pane === "effort" ? reasoningEffort === "" || reasoningEffort === "default" ? MODEL_MENU_DEFAULT_EFFORT : effortMenuId(reasoningEffort) : void 0;
  const choose = (id) => {
    if (id === MODEL_MENU_OPEN_MODELS) {
      setPane("models");
      return;
    }
    if (id === MODEL_MENU_OPEN_EFFORT) {
      setPane("effort");
      return;
    }
    if (id === MODEL_MENU_BACK) {
      setPane("root");
      return;
    }
    if (id === MODEL_MENU_RETRY) {
      void directory.load().catch(() => void 0);
      return;
    }
    const nextModel = catalogRoutes.find((candidate) => modelMenuId(candidate.provider, candidate.model.id) === id);
    if (nextModel !== void 0) {
      close();
      if (nextModel.provider === provider && nextModel.model.id === model)
        return;
      onChange({
        provider: nextModel.provider,
        model: nextModel.model.id,
        reasoningEffort: "default"
      });
      return;
    }
    if (id === MODEL_MENU_DEFAULT_EFFORT) {
      close();
      if (effectiveEffort === defaultEffort)
        return;
      onChange({ provider, model, reasoningEffort: "default" });
      return;
    }
    const nextEffort = efforts.find((effort) => effortMenuId(effort.id) === id);
    if (nextEffort === void 0)
      return;
    close();
    if (nextEffort.id === reasoningEffort)
      return;
    onChange({ provider, model, reasoningEffort: nextEffort.id });
  };
  return (0, import_jsx_runtime3.jsxs)("div", { className: ActivityPanel_default.planModelPicker, "data-model-directory-status": state.status, children: [(0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives.Menu, { open, portal: true, align: "end", compact: true, className: ActivityPanel_default.planModelMenu, items, footer: unavailable ? [{ id: MODEL_MENU_RETRY, label: t("plan.model.retry") }] : void 0, selectedId, onSelect: choose, onClose: close, anchor: (0, import_jsx_runtime3.jsxs)("button", { type: "button", className: ActivityPanel_default.planModelTrigger, "data-plan-model-trigger": true, "aria-label": t("plan.model.triggerAria", { model: modelLabel, effort: effortLabel }), "aria-haspopup": "menu", "aria-expanded": open, disabled: busy, onClick: () => {
    if (open)
      close();
    else {
      setPane("root");
      setOpen(true);
      void directory.load().catch(() => void 0);
    }
  }, children: [(0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planModelTriggerCopy, children: [(0, import_jsx_runtime3.jsx)("strong", { children: state.status === "loading" && catalogRoutes.length === 0 ? t("plan.model.loading") : modelLabel }), (0, import_jsx_runtime3.jsx)("span", { children: effortLabel })] }), (0, import_jsx_runtime3.jsx)(DisclosureChevron, { open })] }) }), (0, import_jsx_runtime3.jsx)("small", { className: ActivityPanel_default.planModelHint, children: currentMissing ? t("plan.model.currentUnavailable", { provider, model }) : selected?.model.description ?? t("plan.model.route", { provider, model }) }), unavailable && (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planModelNotice, role: state.status === "error" ? "alert" : "status", children: [(0, import_jsx_runtime3.jsx)("span", { children: state.error ?? t("plan.model.partialFailure", { count: state.failures.length }) }), (0, import_jsx_runtime3.jsx)("button", { type: "button", disabled: busy || state.status === "loading", onClick: () => {
    void directory.load().catch(() => void 0);
  }, children: t("plan.model.retry") })] })] });
}
function StagedMemberEditor({ team, member, modelDirectory, onPendingChange, t }) {
  const bodyId = (0, import_react2.useId)();
  const [open, setOpen] = (0, import_react2.useState)(false);
  const [role, setRole] = (0, import_react2.useState)(member.role);
  const [provider, setProvider] = (0, import_react2.useState)(member.provider ?? "");
  const [model, setModel] = (0, import_react2.useState)(member.model ?? "");
  const [reasoningEffort, setReasoningEffort] = (0, import_react2.useState)(member.reasoningEffort ?? "");
  const [executionPrompt, setExecutionPrompt] = (0, import_react2.useState)(member.executionPrompt ?? "");
  const remoteSignature = JSON.stringify([
    member.role,
    member.provider ?? "",
    member.model ?? "",
    member.reasoningEffort ?? "",
    member.executionPrompt ?? ""
  ]);
  const [savedSignature, setSavedSignature] = (0, import_react2.useState)(remoteSignature);
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [feedback, setFeedback] = (0, import_react2.useState)();
  useDismissSuccess(feedback, setFeedback);
  const signature = JSON.stringify([role, provider, model, reasoningEffort, executionPrompt]);
  const dirty = signature !== savedSignature;
  (0, import_react2.useEffect)(() => {
    onPendingChange(`member:${member.name}`, dirty || busy);
    return () => {
      onPendingChange(`member:${member.name}`, false);
    };
  }, [busy, dirty, member.name, onPendingChange]);
  (0, import_react2.useEffect)(() => {
    setRole(member.role);
    setProvider(member.provider ?? "");
    setModel(member.model ?? "");
    setReasoningEffort(member.reasoningEffort ?? "");
    setExecutionPrompt(member.executionPrompt ?? "");
    setSavedSignature(remoteSignature);
  }, [member.role, member.provider, member.model, member.reasoningEffort, member.executionPrompt, remoteSignature]);
  const markEdited = () => {
    setFeedback(void 0);
  };
  const persist = async (selection = { provider, model, reasoningEffort }) => {
    const nextSignature = JSON.stringify([
      role,
      selection.provider,
      selection.model,
      selection.reasoningEffort,
      executionPrompt
    ]);
    setProvider(selection.provider);
    setModel(selection.model);
    setReasoningEffort(selection.reasoningEffort);
    setBusy(true);
    setFeedback(void 0);
    try {
      await mutatePlan({
        sessionId: team.captainSessionId,
        teamId: team.teamId,
        action: "update_member",
        memberName: member.name,
        role,
        provider: selection.provider,
        model: selection.model,
        reasoningEffort: selection.reasoningEffort,
        executionPrompt
      });
      setSavedSignature(nextSignature);
      setFeedback({ tone: "success", message: t("plan.saved") });
    } catch (error) {
      setFeedback({ tone: "error", message: t("plan.failed", { message: errorMessage(error) }) });
    } finally {
      setBusy(false);
    }
  };
  const save = async (event) => {
    event.preventDefault();
    await persist();
  };
  const route = `${provider}/${model}`.replace(/^\//u, "");
  return (0, import_jsx_runtime3.jsxs)("article", { className: ActivityPanel_default.planCard, "data-plan-member": member.name, "data-open": open, children: [(0, import_jsx_runtime3.jsxs)("button", { type: "button", className: ActivityPanel_default.planCardHeader, "aria-expanded": open, "aria-controls": bodyId, onClick: () => {
    setOpen((current) => !current);
  }, children: [(0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planCardIdentity, children: [(0, import_jsx_runtime3.jsx)("strong", { children: member.name }), (0, import_jsx_runtime3.jsx)("span", { children: role || t("plan.member.roleFallback") })] }), (0, import_jsx_runtime3.jsx)("span", { className: ActivityPanel_default.planCardMeta, title: route, children: route }), dirty && (0, import_jsx_runtime3.jsx)("em", { className: ActivityPanel_default.planDirty, children: t("plan.unsaved") }), (0, import_jsx_runtime3.jsx)(DisclosureChevron, { open })] }), open && (0, import_jsx_runtime3.jsxs)("form", { id: bodyId, className: ActivityPanel_default.planCardBody, onSubmit: (event) => {
    void save(event);
  }, children: [(0, import_jsx_runtime3.jsxs)("fieldset", { disabled: busy, children: [(0, import_jsx_runtime3.jsxs)("label", { children: [t("plan.member.role"), (0, import_jsx_runtime3.jsx)("input", { name: "role", value: role, onChange: (event) => {
    setRole(event.currentTarget.value);
    markEdited();
  } })] }), (0, import_jsx_runtime3.jsx)(StagedModelPicker, { directory: modelDirectory, provider, model, reasoningEffort, busy, onChange: (selection) => {
    void persist(selection);
  }, t }), (0, import_jsx_runtime3.jsxs)("label", { children: [t("plan.member.prompt"), (0, import_jsx_runtime3.jsx)("textarea", { name: "executionPrompt", value: executionPrompt, onChange: (event) => {
    setExecutionPrompt(event.currentTarget.value);
    markEdited();
  }, rows: 3 })] })] }), (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planActions, children: [(0, import_jsx_runtime3.jsx)(Feedback, { value: feedback }), (0, import_jsx_runtime3.jsx)("button", { type: "submit", disabled: busy || !dirty || provider.trim() === "" || model.trim() === "", children: busy ? t("plan.saving") : t("plan.save") })] })] })] });
}
function StagedTaskEditor({ team, task, onPendingChange, t }) {
  const bodyId = (0, import_react2.useId)();
  const taskDependencies = task.dependencies.join(", ");
  const [open, setOpen] = (0, import_react2.useState)(false);
  const [subject, setSubject] = (0, import_react2.useState)(task.subject);
  const [description, setDescription] = (0, import_react2.useState)(task.description ?? "");
  const [assignee, setAssignee] = (0, import_react2.useState)(task.assignee);
  const [dependencies, setDependencies] = (0, import_react2.useState)(taskDependencies);
  const remoteSignature = JSON.stringify([task.subject, task.description ?? "", task.assignee, taskDependencies]);
  const [savedSignature, setSavedSignature] = (0, import_react2.useState)(remoteSignature);
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [confirmingRemove, setConfirmingRemove] = (0, import_react2.useState)(false);
  const [feedback, setFeedback] = (0, import_react2.useState)();
  useDismissSuccess(feedback, setFeedback);
  const signature = JSON.stringify([subject, description, assignee, dependencies]);
  const dirty = signature !== savedSignature;
  (0, import_react2.useEffect)(() => {
    onPendingChange(`task:${task.id}`, dirty || busy);
    return () => {
      onPendingChange(`task:${task.id}`, false);
    };
  }, [busy, dirty, onPendingChange, task.id]);
  (0, import_react2.useEffect)(() => {
    setSubject(task.subject);
    setDescription(task.description ?? "");
    setAssignee(task.assignee);
    setDependencies(taskDependencies);
    setSavedSignature(remoteSignature);
  }, [task.subject, task.description, task.assignee, taskDependencies, remoteSignature]);
  const markEdited = () => {
    setFeedback(void 0);
    setConfirmingRemove(false);
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback(void 0);
    try {
      await mutatePlan({
        sessionId: team.captainSessionId,
        teamId: team.teamId,
        action: "update_task",
        taskId: task.id,
        subject,
        description,
        assignee,
        dependencies: dependencies.split(",").map((item) => item.trim()).filter(Boolean)
      });
      setSavedSignature(signature);
      setFeedback({ tone: "success", message: t("plan.saved") });
    } catch (error) {
      setFeedback({ tone: "error", message: t("plan.failed", { message: errorMessage(error) }) });
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setFeedback(void 0);
    try {
      await mutatePlan({
        sessionId: team.captainSessionId,
        teamId: team.teamId,
        action: "remove_task",
        taskId: task.id
      });
      setFeedback({ tone: "success", message: t("plan.removed") });
    } catch (error) {
      setFeedback({ tone: "error", message: t("plan.failed", { message: errorMessage(error) }) });
      setBusy(false);
    }
  };
  const dependencySummary = task.dependencies.length === 0 ? t("plan.dependencies.none") : t("plan.dependencies.count", { count: task.dependencies.length });
  return (0, import_jsx_runtime3.jsxs)("article", { className: ActivityPanel_default.planCard, "data-plan-task": task.id, "data-open": open, children: [(0, import_jsx_runtime3.jsxs)("button", { type: "button", className: ActivityPanel_default.planCardHeader, "aria-expanded": open, "aria-controls": bodyId, onClick: () => {
    setOpen((current) => !current);
  }, children: [(0, import_jsx_runtime3.jsx)("span", { className: ActivityPanel_default.planTaskId, children: task.id }), (0, import_jsx_runtime3.jsx)("span", { className: ActivityPanel_default.planTaskSummary, title: subject, children: subject }), (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planCardMeta, children: [assignee || t("plan.task.unassigned"), " \xB7 ", dependencySummary] }), dirty && (0, import_jsx_runtime3.jsx)("em", { className: ActivityPanel_default.planDirty, children: t("plan.unsaved") }), (0, import_jsx_runtime3.jsx)(DisclosureChevron, { open })] }), open && (0, import_jsx_runtime3.jsxs)("form", { id: bodyId, className: ActivityPanel_default.planCardBody, onSubmit: (event) => {
    void save(event);
  }, children: [(0, import_jsx_runtime3.jsxs)("fieldset", { disabled: busy, children: [(0, import_jsx_runtime3.jsxs)("label", { children: [t("plan.task.subject"), (0, import_jsx_runtime3.jsx)("input", { name: "subject", required: true, value: subject, onChange: (event) => {
    setSubject(event.currentTarget.value);
    markEdited();
  } })] }), (0, import_jsx_runtime3.jsxs)("label", { children: [t("plan.task.description"), (0, import_jsx_runtime3.jsx)("textarea", { name: "description", value: description, onChange: (event) => {
    setDescription(event.currentTarget.value);
    markEdited();
  }, rows: 3 })] }), (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planGrid, children: [(0, import_jsx_runtime3.jsxs)("label", { children: [t("plan.task.assignee"), (0, import_jsx_runtime3.jsxs)("select", { name: "assignee", value: assignee, onChange: (event) => {
    setAssignee(event.currentTarget.value);
    markEdited();
  }, children: [(0, import_jsx_runtime3.jsx)("option", { value: "", children: t("plan.task.unassigned") }), team.members.map((member) => (0, import_jsx_runtime3.jsx)("option", { value: member.name, children: member.name }, member.name))] })] }), (0, import_jsx_runtime3.jsxs)("label", { children: [t("plan.task.dependencies"), (0, import_jsx_runtime3.jsx)("input", { name: "dependencies", value: dependencies, onChange: (event) => {
    setDependencies(event.currentTarget.value);
    markEdited();
  } }), (0, import_jsx_runtime3.jsx)("small", { children: t("plan.task.dependenciesHint") })] })] })] }), confirmingRemove && (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planConfirm, role: "alert", children: [(0, import_jsx_runtime3.jsx)("span", { children: t("plan.removeWarning", { task: task.id }) }), (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: () => {
    setConfirmingRemove(false);
  }, children: t("plan.cancel") }), (0, import_jsx_runtime3.jsx)("button", { type: "button", "data-danger": true, "data-confirming": true, onClick: () => {
    void remove();
  }, children: t("plan.removeConfirm") })] }), (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planActions, children: [(0, import_jsx_runtime3.jsx)(Feedback, { value: feedback }), (0, import_jsx_runtime3.jsx)("button", { type: "button", "data-danger": true, onClick: () => {
    setConfirmingRemove(true);
    setFeedback(void 0);
  }, disabled: busy || confirmingRemove, children: t("plan.remove") }), (0, import_jsx_runtime3.jsx)("button", { type: "submit", disabled: busy || !dirty || subject.trim() === "", children: busy ? t("plan.saving") : t("plan.save") })] })] })] });
}
function StagingPlanEditor({ team, modelDirectory, onContinuePlanning, onDiscarded, t }) {
  const membersId = (0, import_react2.useId)();
  const tasksId = (0, import_react2.useId)();
  const [membersOpen, setMembersOpen] = (0, import_react2.useState)(true);
  const [tasksOpen, setTasksOpen] = (0, import_react2.useState)(true);
  const [newTask, setNewTask] = (0, import_react2.useState)("");
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const [discardArmed, setDiscardArmed] = (0, import_react2.useState)(false);
  const [pendingEditors, setPendingEditors] = (0, import_react2.useState)(/* @__PURE__ */ new Set());
  const [feedback, setFeedback] = (0, import_react2.useState)();
  useDismissSuccess(feedback, setFeedback);
  const dependencyLinks = team.tasks.reduce((total, task) => total + task.dependencies.length, 0);
  const runnable = team.members.length > 0 && team.tasks.length > 0;
  const hasPendingEdits = pendingEditors.size > 0 || newTask.trim() !== "";
  const waitingForFeedback = team.planReviewState === "awaiting_feedback";
  (0, import_react2.useEffect)(() => {
    void modelDirectory.load().catch(() => void 0);
  }, [modelDirectory]);
  const onPendingChange = (0, import_react2.useCallback)((key, pending) => {
    setPendingEditors((current) => {
      if (pending === current.has(key))
        return current;
      const next = new Set(current);
      if (pending)
        next.add(key);
      else
        next.delete(key);
      return next;
    });
  }, []);
  const addTask = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback(void 0);
    try {
      await mutatePlan({
        sessionId: team.captainSessionId,
        teamId: team.teamId,
        action: "add_task",
        subject: newTask,
        dependencies: []
      });
      setNewTask("");
      setFeedback({ tone: "success", message: t("plan.taskAdded") });
      setTasksOpen(true);
    } catch (error) {
      setFeedback({ tone: "error", message: t("plan.failed", { message: errorMessage(error) }) });
    } finally {
      setBusy(false);
    }
  };
  const approve = async () => {
    setBusy(true);
    setFeedback(void 0);
    try {
      await mutatePlan({
        sessionId: team.captainSessionId,
        teamId: team.teamId,
        action: "approve"
      });
    } catch (error) {
      setFeedback({ tone: "error", message: t("plan.failed", { message: errorMessage(error) }) });
      setBusy(false);
    }
  };
  const continueInChat = async () => {
    if (waitingForFeedback) {
      onContinuePlanning();
      return;
    }
    setBusy(true);
    setFeedback(void 0);
    try {
      await mutatePlan({
        sessionId: team.captainSessionId,
        teamId: team.teamId,
        action: "continue"
      });
      onContinuePlanning();
    } catch (error) {
      setFeedback({ tone: "error", message: t("plan.failed", { message: errorMessage(error) }) });
      setBusy(false);
    }
  };
  const discard = async () => {
    setBusy(true);
    setFeedback(void 0);
    try {
      await mutatePlan({
        sessionId: team.captainSessionId,
        teamId: team.teamId,
        action: "discard"
      });
      onDiscarded();
    } catch (error) {
      setFeedback({ tone: "error", message: t("plan.failed", { message: errorMessage(error) }) });
      setBusy(false);
      setDiscardArmed(false);
    }
  };
  return (0, import_jsx_runtime3.jsxs)("section", { className: ActivityPanel_default.planEditor, "data-staging-editor": true, children: [(0, import_jsx_runtime3.jsxs)("header", { className: ActivityPanel_default.planHeader, children: [(0, import_jsx_runtime3.jsxs)("span", { children: [(0, import_jsx_runtime3.jsxs)("span", { children: [(0, import_jsx_runtime3.jsx)("strong", { children: t("plan.title") }), (0, import_jsx_runtime3.jsx)("small", { children: t("plan.readySummary", { members: team.members.length, tasks: team.tasks.length, links: dependencyLinks }) })] }), (0, import_jsx_runtime3.jsx)("em", { children: t("plan.badge") })] }), (0, import_jsx_runtime3.jsx)("p", { children: t("plan.description") })] }), (0, import_jsx_runtime3.jsxs)("ol", { className: ActivityPanel_default.planFlow, "aria-label": t("plan.flow.aria"), children: [(0, import_jsx_runtime3.jsxs)("li", { "data-active": true, children: [(0, import_jsx_runtime3.jsx)("span", { children: "1" }), t("plan.flow.review")] }), (0, import_jsx_runtime3.jsxs)("li", { children: [(0, import_jsx_runtime3.jsx)("span", { children: "2" }), t("plan.flow.spawn")] }), (0, import_jsx_runtime3.jsxs)("li", { children: [(0, import_jsx_runtime3.jsx)("span", { children: "3" }), t("plan.flow.run")] })] }), (0, import_jsx_runtime3.jsxs)("section", { className: ActivityPanel_default.planSection, children: [(0, import_jsx_runtime3.jsxs)("button", { type: "button", className: ActivityPanel_default.planSectionToggle, "aria-expanded": membersOpen, "aria-controls": membersId, onClick: () => {
    setMembersOpen((current) => !current);
  }, children: [(0, import_jsx_runtime3.jsxs)("span", { children: [(0, import_jsx_runtime3.jsx)("strong", { children: t("plan.members.title") }), (0, import_jsx_runtime3.jsx)("small", { children: t("plan.members.count", { count: team.members.length }) })] }), (0, import_jsx_runtime3.jsx)(DisclosureChevron, { open: membersOpen })] }), membersOpen && (0, import_jsx_runtime3.jsx)("div", { id: membersId, className: ActivityPanel_default.planList, children: team.members.length === 0 ? (0, import_jsx_runtime3.jsx)("p", { className: ActivityPanel_default.planEmpty, children: t("plan.members.empty") }) : team.members.map((member) => (0, import_jsx_runtime3.jsx)(StagedMemberEditor, { team, member, modelDirectory, onPendingChange, t }, member.name)) })] }), (0, import_jsx_runtime3.jsxs)("section", { className: ActivityPanel_default.planSection, children: [(0, import_jsx_runtime3.jsxs)("button", { type: "button", className: ActivityPanel_default.planSectionToggle, "aria-expanded": tasksOpen, "aria-controls": tasksId, onClick: () => {
    setTasksOpen((current) => !current);
  }, children: [(0, import_jsx_runtime3.jsxs)("span", { children: [(0, import_jsx_runtime3.jsx)("strong", { children: t("plan.tasks.title") }), (0, import_jsx_runtime3.jsx)("small", { children: t("plan.tasks.count", { count: team.tasks.length, links: dependencyLinks }) })] }), (0, import_jsx_runtime3.jsx)(DisclosureChevron, { open: tasksOpen })] }), tasksOpen && (0, import_jsx_runtime3.jsx)("div", { id: tasksId, className: ActivityPanel_default.planList, children: team.tasks.length === 0 ? (0, import_jsx_runtime3.jsx)("p", { className: ActivityPanel_default.planEmpty, children: t("plan.tasks.empty") }) : team.tasks.map((task) => (0, import_jsx_runtime3.jsx)(StagedTaskEditor, { team, task, onPendingChange, t }, task.id)) })] }), (0, import_jsx_runtime3.jsxs)("form", { className: ActivityPanel_default.planNewTask, onSubmit: (event) => {
    void addTask(event);
  }, children: [(0, import_jsx_runtime3.jsxs)("label", { children: [(0, import_jsx_runtime3.jsx)("span", { children: t("plan.newTaskLabel") }), (0, import_jsx_runtime3.jsx)("input", { name: "newTask", value: newTask, onChange: (event) => {
    setNewTask(event.currentTarget.value);
    setFeedback(void 0);
  }, placeholder: t("plan.newTask"), disabled: busy })] }), (0, import_jsx_runtime3.jsx)("button", { type: "submit", disabled: busy || newTask.trim() === "", children: busy ? t("plan.adding") : t("plan.addTask") })] }), (0, import_jsx_runtime3.jsxs)("div", { className: ActivityPanel_default.planApproveRow, "data-armed": discardArmed || void 0, "data-discard": discardArmed || void 0, "data-review-state": waitingForFeedback ? "awaiting-feedback" : "awaiting-review", children: [(0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planApproveCopy, children: [(0, import_jsx_runtime3.jsx)("strong", { children: discardArmed ? t("plan.discardConfirmTitle") : waitingForFeedback ? t("plan.feedbackTitle") : t("plan.approveTitle") }), (0, import_jsx_runtime3.jsx)("small", { children: discardArmed ? t("plan.discardWarning") : waitingForFeedback ? t("plan.feedbackHint") : hasPendingEdits ? t("plan.pendingEdits") : t("plan.approveHint", { members: team.members.length, tasks: team.tasks.length }) })] }), (0, import_jsx_runtime3.jsx)(Feedback, { value: feedback }), discardArmed ? (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planApproveActions, children: [(0, import_jsx_runtime3.jsx)("button", { type: "button", disabled: busy, onClick: () => {
    setDiscardArmed(false);
  }, children: t("plan.cancel") }), (0, import_jsx_runtime3.jsx)("button", { type: "button", "data-plan-discard": true, "data-danger": true, "data-confirming": true, disabled: busy, onClick: () => {
    void discard();
  }, children: busy ? t("plan.discarding") : t("plan.discardConfirm") })] }) : (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planReviewActions, children: [(0, import_jsx_runtime3.jsx)("button", { type: "button", "data-plan-approve": true, disabled: busy || !runnable || hasPendingEdits, onClick: () => {
    void approve();
  }, children: t("plan.approve") }), (0, import_jsx_runtime3.jsxs)("span", { className: ActivityPanel_default.planSecondaryActions, children: [(0, import_jsx_runtime3.jsx)("button", { type: "button", "data-plan-continue": true, disabled: busy, onClick: () => {
    void continueInChat();
  }, children: t(waitingForFeedback ? "plan.returnToChat" : "plan.continue") }), (0, import_jsx_runtime3.jsx)("button", { type: "button", "data-plan-discard": true, "data-danger": true, disabled: busy, onClick: () => {
    setDiscardArmed(true);
    setFeedback(void 0);
  }, children: t("plan.discard") })] })] })] })] });
}

// lib/client/MemberControls.js
var import_jsx_runtime4 = require("react/jsx-runtime");
var import_react3 = require("react");
var PLAN_URL2 = "/plugins/dsh-agent-teams/plan";
var ROUTE_ROW = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", padding: "2px 0 2px 10px", fontSize: "11px" };
var ROUTE_LABEL = { color: "var(--dsw-alias-label-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" };
var ROUTE_VALUE = { color: "var(--dsw-alias-label-secondary)" };
var ROUTE_PAIR = { color: "var(--dsw-alias-label-secondary)", fontVariantNumeric: "tabular-nums" };
var ROUTE_HINT = { color: "var(--dsw-alias-label-tertiary)" };
var ROUTE_FEEDBACK = { color: "var(--dsw-alias-label-secondary)" };
var ORIGIN_BADGE = { border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "999px", padding: "0 6px", fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--dsw-alias-label-secondary)" };
var REVERT_BUTTON = { fontSize: "11px", padding: "1px 6px", borderRadius: "6px", border: "1px solid var(--dsw-alias-border-l2)", background: "transparent", color: "var(--dsw-alias-label-secondary)", cursor: "pointer" };
var FAILURE_ROW = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", padding: "2px 0 2px 10px", fontSize: "11px" };
var FAILURE_LABEL = { color: "var(--dsw-alias-label-negative, #c0392b)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" };
var FAILURE_DETAIL = { color: "var(--dsw-alias-label-secondary)", fontVariantNumeric: "tabular-nums" };
var FORM = { display: "flex", flexDirection: "column", gap: "6px", padding: "8px 10px", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "10px", marginTop: "6px" };
var FIELD = { display: "flex", flexDirection: "column", gap: "2px", fontSize: "11px" };
var ACTIONS = { display: "flex", alignItems: "center", gap: "8px" };
function resolveModelDirectory(modelDirectories, sessionId) {
  if (modelDirectories === void 0 || modelDirectories === null)
    return void 0;
  if (typeof modelDirectories.directoryFor !== "function")
    return void 0;
  try {
    return modelDirectories.directoryFor(sessionId) ?? void 0;
  } catch {
    return void 0;
  }
}
async function postPlan(payload) {
  const response = await fetch(PLAN_URL2, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (response.ok)
    return;
  let message = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    if (typeof body.error === "string" && body.error.trim() !== "")
      message = body.error;
  } catch {
  }
  throw new Error(message);
}
function errorMessage2(error) {
  return error instanceof Error ? error.message : String(error);
}
function routeText(provider, model) {
  const scope = (provider ?? "").trim();
  const id = (model ?? "").trim();
  if (scope !== "" && id !== "")
    return `${scope}/${id}`;
  return id;
}
function catalogRoutesOf(state) {
  const groups = state !== void 0 && state !== null && Array.isArray(state.groups) ? state.groups : [];
  const out = [];
  for (const group of groups) {
    const models = group !== void 0 && group !== null && Array.isArray(group.models) ? group.models : [];
    const provider = typeof group?.id === "string" ? group.id.trim() : "";
    for (const candidate of models) {
      const id = typeof candidate?.id === "string" ? candidate.id.trim() : "";
      if (provider === "" || id === "")
        continue;
      out.push({ provider, model: id });
    }
  }
  return out;
}
function blankRoute(route) {
  return (route?.provider ?? "").trim() === "" || (route?.model ?? "").trim() === "";
}
function pickDefaultRoute(catalog, declaredRoute) {
  const routes = Array.isArray(catalog) ? catalog : catalogRoutesOf(catalog);
  const wanted = {
    provider: (declaredRoute?.provider ?? "").trim(),
    model: (declaredRoute?.model ?? "").trim()
  };
  const declaredUsable = wanted.provider !== "" && wanted.model !== "" && routes.some((entry) => entry.provider === wanted.provider && entry.model === wanted.model);
  if (declaredUsable) {
    return {
      route: {
        provider: wanted.provider,
        model: wanted.model,
        reasoningEffort: declaredRoute?.reasoningEffort ?? "default"
      },
      inCatalog: true,
      warning: false,
      source: "declared"
    };
  }
  const first = routes[0];
  if (first === void 0)
    return { inCatalog: false, warning: true, source: "empty-catalog" };
  return {
    route: { provider: first.provider, model: first.model, reasoningEffort: "default" },
    inCatalog: true,
    warning: wanted.provider !== "" || wanted.model !== "",
    source: "catalog"
  };
}
function catalogHasRoute(state, provider, model) {
  const scope = (provider ?? "").trim();
  const id = (model ?? "").trim();
  if (scope === "" || id === "")
    return false;
  return catalogRoutesOf(state).some((route) => route.provider === scope && route.model === id);
}
function catalogSnapshotOf(directory) {
  if (directory === void 0 || directory === null)
    return void 0;
  const store = directory.store;
  if (store === void 0 || store === null || typeof store.getSnapshot !== "function")
    return void 0;
  try {
    return store.getSnapshot() ?? void 0;
  } catch {
    return void 0;
  }
}
function subscribeCatalog(directory, listener) {
  const store = directory === void 0 || directory === null ? void 0 : directory.store;
  if (store === void 0 || store === null || typeof store.subscribe !== "function")
    return () => void 0;
  try {
    const unsubscribe = store.subscribe(listener);
    return typeof unsubscribe === "function" ? unsubscribe : () => void 0;
  } catch {
    return () => void 0;
  }
}
function memberRoute(member) {
  const override = member.routeOverride;
  return {
    provider: (override?.provider ?? member.provider ?? "").trim(),
    model: (override?.model ?? member.model ?? "").trim(),
    reasoningEffort: override?.reasoningEffort ?? member.reasoningEffort ?? ""
  };
}
var ROUTE_ORIGINS = /* @__PURE__ */ new Set(["override", "fallback", "active", "declared"]);
function routeOriginOf(member) {
  const origin = typeof member?.routeOrigin === "string" ? member.routeOrigin.trim() : "";
  return ROUTE_ORIGINS.has(origin) ? origin : "";
}
function memberFallback(member) {
  const record = member === void 0 || member === null ? void 0 : member.fallback;
  if (record === void 0 || record === null || typeof record !== "object")
    return void 0;
  const route = routeText(record.provider, record.model);
  if (route === "")
    return void 0;
  return {
    route,
    reasoningEffort: typeof record.reasoningEffort === "string" ? record.reasoningEffort.trim() : ""
  };
}
function routeBadgeOf(member) {
  const origin = routeOriginOf(member);
  if (origin === "override")
    return "override";
  if (origin === "fallback" || member?.fallbackActive === true)
    return "fallback-active";
  if (memberFallback(member) !== void 0)
    return "fallback";
  if (origin === "declared")
    return "declared";
  if (origin === "active")
    return "active";
  return "";
}
function failureInstant(at) {
  if (typeof at !== "number" || !Number.isFinite(at))
    return "";
  const when = new Date(at);
  if (Number.isNaN(when.getTime()))
    return "";
  return when.toISOString().slice(0, 16).replace("T", " ") + "Z";
}
function memberFailure(member) {
  const failure = member === void 0 || member === null ? void 0 : member.lastFailure;
  if (failure === void 0 || failure === null || typeof failure !== "object")
    return void 0;
  const code = typeof failure.code === "string" ? failure.code.trim() : "";
  if (code === "")
    return void 0;
  const parts = [code];
  const at = failureInstant(failure.at);
  if (at !== "")
    parts.push(at);
  const route = routeText(failure.provider, failure.model);
  if (route !== "")
    parts.push(route);
  return { code, detail: parts.join(" \xB7 "), message: typeof failure.message === "string" ? failure.message : "" };
}
function MemberFailureNotice({ member, t }) {
  const failure = memberFailure(member);
  if (failure === void 0)
    return null;
  return (0, import_jsx_runtime4.jsxs)("div", { "data-member-failure": failure.code, role: "status", style: FAILURE_ROW, title: failure.message === "" ? void 0 : failure.message, children: [(0, import_jsx_runtime4.jsx)("span", { style: FAILURE_LABEL, children: t("member.failure.title") }), (0, import_jsx_runtime4.jsx)("span", { style: FAILURE_DETAIL, children: failure.detail })] });
}
function Notice({ value }) {
  if (value === void 0)
    return null;
  const detail = typeof value.detail === "string" && value.detail !== "" ? value.detail : void 0;
  return (0, import_jsx_runtime4.jsxs)("span", { style: ROUTE_FEEDBACK, "data-tone": value.tone, role: value.tone === "error" ? "alert" : "status", "aria-live": value.tone === "error" ? "assertive" : "polite", title: detail, children: [value.message, detail !== void 0 && (0, import_jsx_runtime4.jsx)("small", { style: ROUTE_HINT, "data-error-detail": true, children: detail })] });
}
function MemberRouteControl({ team, member, modelDirectory, t, historic = false, stopped = false }) {
  const override = member.routeOverride;
  const overrideProvider = override?.provider ?? "";
  const overrideModel = override?.model ?? "";
  const overrideEffort = override?.reasoningEffort ?? "";
  const [draft, setDraft] = (0, import_react3.useState)(() => memberRoute(member));
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [feedback, setFeedback] = (0, import_react3.useState)(void 0);
  (0, import_react3.useEffect)(() => {
    setDraft(memberRoute(member));
  }, [member.provider, member.model, member.reasoningEffort, overrideProvider, overrideModel, overrideEffort]);
  const readOnly = historic || stopped;
  const spine = routeText(member.provider, member.model);
  const declared = routeText(overrideProvider, overrideModel);
  const nextRoute = (member.nextRoute ?? "").trim() !== "" ? member.nextRoute : routeText(draft.provider, draft.model);
  const overridden = declared !== "" && declared !== spine;
  const pair = overridden && spine !== "" ? t("member.route.pair", { current: spine, next: declared }) : "";
  const apply2 = async (selection) => {
    if (busy)
      return;
    setDraft(selection);
    setBusy(true);
    setFeedback(void 0);
    try {
      await postPlan({
        sessionId: team.captainSessionId,
        teamId: team.teamId,
        action: "set_member_route",
        memberName: member.name,
        provider: selection.provider,
        model: selection.model,
        reasoningEffort: selection.reasoningEffort
      });
      setFeedback({ tone: "success", message: t("member.route.saved") });
    } catch (error) {
      setFeedback({ tone: "error", message: t("member.route.failed", { message: errorMessage2(error) }) });
      setDraft(memberRoute(member));
    } finally {
      setBusy(false);
    }
  };
  const revert = async () => {
    if (busy)
      return;
    setBusy(true);
    setFeedback(void 0);
    try {
      await postPlan({
        sessionId: team.captainSessionId,
        teamId: team.teamId,
        action: "clear_member_route",
        memberName: member.name
      });
      setFeedback({ tone: "success", message: t("member.route.cleared") });
    } catch (error) {
      setFeedback({ tone: "error", message: t("member.route.clearFailed", { message: errorMessage2(error) }) });
    } finally {
      setBusy(false);
    }
  };
  const clearFallback = async () => {
    if (busy)
      return;
    setBusy(true);
    setFeedback(void 0);
    try {
      await postPlan({
        sessionId: team.captainSessionId,
        teamId: team.teamId,
        action: "clear_member_fallback",
        memberName: member.name
      });
      setFeedback({ tone: "success", message: t("member.route.fallbackCleared") });
    } catch (error) {
      setFeedback({ tone: "error", message: t("member.route.fallbackClearFailed", { message: errorMessage2(error) }) });
    } finally {
      setBusy(false);
    }
  };
  const badgeKey = routeBadgeOf(member);
  const badge = badgeKey === "" ? null : (0, import_jsx_runtime4.jsx)("span", { style: ORIGIN_BADGE, "data-route-badge": badgeKey, children: t("member.route.origin." + badgeKey) });
  const fallback = memberFallback(member);
  const fallbackRow = fallback === void 0 ? null : (0, import_jsx_runtime4.jsx)("span", { style: ROUTE_HINT, "data-member-fallback-route": fallback.route, title: fallback.reasoningEffort === "" ? void 0 : fallback.reasoningEffort, children: t("member.route.fallback", { route: fallback.route }) });
  const fallbackClear = fallback === void 0 || readOnly ? null : (0, import_jsx_runtime4.jsx)("button", { type: "button", "data-member-fallback-clear": member.name, disabled: busy, style: REVERT_BUTTON, onClick: () => {
    void clearFallback();
  }, children: t("member.route.fallbackClear") });
  const revertButton = override === void 0 || readOnly ? null : (0, import_jsx_runtime4.jsx)("button", { type: "button", "data-member-route-clear": member.name, disabled: busy, style: REVERT_BUTTON, onClick: () => {
    void revert();
  }, children: t("member.route.clear") });
  const picker = modelDirectory === void 0 ? (0, import_jsx_runtime4.jsxs)("span", { style: ROUTE_VALUE, children: [routeText(draft.provider, draft.model) || t("member.route.none"), " ", (0, import_jsx_runtime4.jsx)("small", { style: ROUTE_HINT, children: t("member.route.noCatalog") })] }) : (0, import_jsx_runtime4.jsx)(StagedModelPicker, { directory: modelDirectory, provider: draft.provider, model: draft.model, reasoningEffort: draft.reasoningEffort, busy, onChange: (selection) => {
    void apply2(selection);
  }, t });
  return (0, import_jsx_runtime4.jsxs)("div", { "data-member-route-control": member.name, "data-route-origin": (member.routeOrigin ?? "") || void 0, "data-route-override": overridden || void 0, style: ROUTE_ROW, children: [(0, import_jsx_runtime4.jsx)("span", { style: ROUTE_LABEL, children: t("member.route.title") }), readOnly ? (0, import_jsx_runtime4.jsx)("span", { style: ROUTE_VALUE, children: nextRoute || t("member.route.none") }) : picker, pair !== "" && (0, import_jsx_runtime4.jsx)("span", { style: ROUTE_PAIR, "data-member-route-pair": true, title: pair, children: pair }), override !== void 0 && (0, import_jsx_runtime4.jsx)("span", { style: ROUTE_HINT, "data-route-source": override.source, children: t("member.route.override", { source: override.source }) }), badge, revertButton, fallbackRow, fallbackClear, (0, import_jsx_runtime4.jsx)(Notice, { value: feedback })] });
}
function AddMemberControl({ team, modelDirectory, t, historic = false, stopped = false, defaultOpen = false }) {
  const [open, setOpen] = (0, import_react3.useState)(defaultOpen);
  const [name, setName] = (0, import_react3.useState)("");
  const [role, setRole] = (0, import_react3.useState)("");
  const [route, setRoute] = (0, import_react3.useState)({ provider: "", model: "", reasoningEffort: "" });
  const [executionPrompt, setExecutionPrompt] = (0, import_react3.useState)("");
  const [toolPolicy, setToolPolicy] = (0, import_react3.useState)("");
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [feedback, setFeedback] = (0, import_react3.useState)(void 0);
  const catalogState = catalogSnapshotOf(modelDirectory);
  const routeBlank = blankRoute(route);
  const declaredRoute = team === void 0 || team === null ? void 0 : team.captainRoute;
  const declaredRouteText = declaredRoute === void 0 || declaredRoute === null ? "" : routeText(declaredRoute.provider, declaredRoute.model);
  const defaultPick = pickDefaultRoute(catalogState, declaredRoute);
  const routeOutsideCatalog = !routeBlank && catalogState !== void 0 && !catalogHasRoute(catalogState, route.provider, route.model);
  (0, import_react3.useEffect)(() => {
    if (modelDirectory === void 0 || !open)
      return void 0;
    const adopt = () => {
      const pick = pickDefaultRoute(catalogSnapshotOf(modelDirectory), declaredRoute);
      if (pick.route === void 0)
        return;
      const wanted = pick.route;
      setRoute((current) => blankRoute(current) ? wanted : current);
    };
    adopt();
    void modelDirectory.load?.().then(adopt).catch(() => void 0);
    return subscribeCatalog(modelDirectory, adopt);
  }, [modelDirectory, open, routeBlank, declaredRouteText]);
  if (historic || stopped)
    return null;
  const captainRouteWarning = defaultPick.warning === true && declaredRouteText !== "" ? (0, import_jsx_runtime4.jsx)("span", { style: ROUTE_HINT, role: "status", "data-add-member-captain-route-warning": declaredRouteText, children: t("addMember.captainRouteOutside", { route: declaredRouteText }) }) : null;
  const routeHint = routeOutsideCatalog ? (0, import_jsx_runtime4.jsx)("span", { style: ROUTE_HINT, role: "status", "data-add-member-route-warning": routeText(route.provider, route.model), children: t("addMember.routeUnavailable", { route: routeText(route.provider, route.model) }) }) : routeBlank || defaultPick.route === void 0 || defaultPick.source === "declared" ? null : (0, import_jsx_runtime4.jsx)("span", { style: ROUTE_HINT, "data-add-member-route-default": routeText(route.provider, route.model), children: t("addMember.routeDefault") });
  const emptyCatalogHint = modelDirectory !== void 0 && defaultPick.source === "empty-catalog" ? (0, import_jsx_runtime4.jsx)("span", { style: ROUTE_HINT, role: "status", "data-add-member-catalog-empty": true, children: t("addMember.catalogEmpty") }) : null;
  const submit = async (event) => {
    event.preventDefault();
    if (busy)
      return;
    const trimmed = name.trim();
    if (trimmed === "") {
      setFeedback({ tone: "error", message: t("addMember.nameRequired") });
      return;
    }
    setBusy(true);
    setFeedback(void 0);
    const payload = {
      sessionId: team.captainSessionId,
      teamId: team.teamId,
      action: "add_member",
      memberName: trimmed,
      // A running team starts the member now; a staged roster only grows.
      activation: "immediate"
    };
    if (role.trim() !== "")
      payload.role = role.trim();
    if (route.provider.trim() !== "" && route.model.trim() !== "") {
      payload.provider = route.provider.trim();
      payload.model = route.model.trim();
      if (route.reasoningEffort !== "")
        payload.reasoningEffort = route.reasoningEffort;
    }
    if (executionPrompt.trim() !== "")
      payload.executionPrompt = executionPrompt.trim();
    if (toolPolicy.trim() !== "")
      payload.tool_policy = toolPolicy.trim();
    try {
      await postPlan(payload);
      setFeedback({ tone: "success", message: t("addMember.addedNamed", { name: trimmed }) });
      setName("");
      setRole("");
      setExecutionPrompt("");
      setToolPolicy("");
      setRoute({ provider: "", model: "", reasoningEffort: "" });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: t("addMember.failedAction"),
        detail: t("addMember.failed", { message: errorMessage2(error) })
      });
    } finally {
      setBusy(false);
    }
  };
  return (0, import_jsx_runtime4.jsxs)("div", { "data-add-member": team.teamId, children: [(0, import_jsx_runtime4.jsx)("button", { type: "button", className: ActivityPanel_default.membersToggle, "data-add-member-toggle": true, "aria-expanded": open, onClick: () => {
    setOpen((current) => !current);
    setFeedback(void 0);
  }, children: t(open ? "addMember.close" : "addMember.toggle") }), open && (0, import_jsx_runtime4.jsxs)("form", { "data-add-member-form": true, style: FORM, onSubmit: (event) => {
    void submit(event);
  }, children: [(0, import_jsx_runtime4.jsx)("strong", { style: ROUTE_VALUE, children: t("addMember.title") }), (0, import_jsx_runtime4.jsxs)("label", { style: FIELD, children: [t("addMember.name"), (0, import_jsx_runtime4.jsx)("input", { name: "memberName", value: name, required: true, disabled: busy, onChange: (event) => {
    setName(event.currentTarget.value);
  } })] }), (0, import_jsx_runtime4.jsxs)("label", { style: FIELD, children: [t("addMember.role"), (0, import_jsx_runtime4.jsx)("input", { name: "role", value: role, disabled: busy, onChange: (event) => {
    setRole(event.currentTarget.value);
  } })] }), (0, import_jsx_runtime4.jsxs)("div", { style: FIELD, children: [(0, import_jsx_runtime4.jsx)("span", { children: t("addMember.route") }), modelDirectory === void 0 ? (0, import_jsx_runtime4.jsxs)("span", { style: ROUTE_HINT, children: [routeText(route.provider, route.model) || t("addMember.routeInherit"), " ", t("addMember.noCatalog")] }) : (0, import_jsx_runtime4.jsx)(StagedModelPicker, { directory: modelDirectory, provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort, busy, onChange: (selection) => {
    setRoute(selection);
  }, t }), captainRouteWarning, routeHint, emptyCatalogHint] }), (0, import_jsx_runtime4.jsxs)("label", { style: FIELD, children: [t("addMember.prompt"), (0, import_jsx_runtime4.jsx)("textarea", { name: "executionPrompt", rows: 3, value: executionPrompt, disabled: busy, onChange: (event) => {
    setExecutionPrompt(event.currentTarget.value);
  } })] }), (0, import_jsx_runtime4.jsxs)("label", { style: FIELD, children: [t("addMember.toolPolicy"), (0, import_jsx_runtime4.jsx)("input", { name: "tool_policy", value: toolPolicy, disabled: busy, placeholder: t("addMember.toolPolicyHint"), onChange: (event) => {
    setToolPolicy(event.currentTarget.value);
  } })] }), (0, import_jsx_runtime4.jsxs)("span", { style: ACTIONS, children: [(0, import_jsx_runtime4.jsx)("button", { type: "submit", className: ActivityPanel_default.planSave, disabled: busy || name.trim() === "", children: busy ? t("addMember.saving") : t("addMember.submit") }), (0, import_jsx_runtime4.jsx)(Notice, { value: feedback })] })] })] });
}

// lib/client/panel-geometry.js
var PANEL_LAYOUT_STORAGE_KEY = "dsh-agent-teams:activity-panel:v1";
var PANEL_COMPACT_BREAKPOINT = 960;
var PANEL_DEFAULT_WIDTH = 388;
var PANEL_DEFAULT_HEIGHT = 640;
var PANEL_MIN_WIDTH = 320;
var PANEL_MAX_WIDTH = 640;
var PANEL_MIN_HEIGHT = 360;
var PANEL_DOCK_TOP = 64;
var PANEL_DOCK_RIGHT = 18;
var PANEL_DOCK_BOTTOM = 48;
var PANEL_FLOAT_MARGIN = 12;
var DEFAULT_PANEL_LAYOUT = Object.freeze({
  mode: "docked",
  x: 0,
  y: PANEL_DOCK_TOP,
  width: PANEL_DEFAULT_WIDTH,
  height: PANEL_DEFAULT_HEIGHT,
  heightMode: "auto"
});
function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function parsePanelLayout(value) {
  if (value === null)
    return DEFAULT_PANEL_LAYOUT;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null)
      return DEFAULT_PANEL_LAYOUT;
    const record = parsed;
    if (record.mode !== "docked" && record.mode !== "floating" || !finite(record.x) || !finite(record.y) || !finite(record.width) || !finite(record.height)) {
      return DEFAULT_PANEL_LAYOUT;
    }
    return {
      mode: record.mode,
      x: record.x,
      y: record.y,
      width: record.width,
      height: record.height,
      // v1 values written before content-fit height existed have no mode.
      // Treat them as automatic so the upgrade removes legacy blank space.
      heightMode: record.mode === "floating" && record.heightMode === "manual" ? "manual" : "auto"
    };
  } catch {
    return DEFAULT_PANEL_LAYOUT;
  }
}
function compactPanelForBounds(bounds) {
  return bounds.width <= PANEL_COMPACT_BREAKPOINT;
}
function panelUsesAutoHeight(layout, bounds) {
  return compactPanelForBounds(bounds) || layout.mode === "docked" || layout.heightMode === "auto";
}
function panelMaximumHeight(layout, bounds) {
  const bottomInset = compactPanelForBounds(bounds) || layout.mode === "floating" ? PANEL_FLOAT_MARGIN : PANEL_DOCK_BOTTOM;
  return Math.max(1, bounds.height - layout.y - bottomInset);
}
function resolvePanelGeometry(layout, bounds) {
  const boundsWidth = Math.max(1, bounds.width);
  const boundsHeight = Math.max(1, bounds.height);
  if (compactPanelForBounds(bounds)) {
    return {
      ...layout,
      x: PANEL_FLOAT_MARGIN,
      y: PANEL_FLOAT_MARGIN,
      width: Math.max(1, boundsWidth - PANEL_FLOAT_MARGIN * 2),
      height: Math.max(1, boundsHeight - PANEL_FLOAT_MARGIN * 2)
    };
  }
  const maximumWidth = Math.max(1, Math.min(PANEL_MAX_WIDTH, boundsWidth - PANEL_FLOAT_MARGIN * 2));
  const minimumWidth = Math.min(PANEL_MIN_WIDTH, maximumWidth);
  const width = clamp(layout.width, minimumWidth, maximumWidth);
  const maximumHeight = Math.max(1, boundsHeight - PANEL_FLOAT_MARGIN * 2);
  const minimumHeight = Math.min(PANEL_MIN_HEIGHT, maximumHeight);
  if (layout.mode === "docked") {
    const y = clamp(PANEL_DOCK_TOP, PANEL_FLOAT_MARGIN, Math.max(PANEL_FLOAT_MARGIN, boundsHeight - minimumHeight - PANEL_FLOAT_MARGIN));
    const availableHeight = Math.max(1, boundsHeight - y - PANEL_DOCK_BOTTOM);
    const height2 = clamp(availableHeight, Math.min(minimumHeight, availableHeight), maximumHeight);
    const anchorRight = clamp(bounds.anchorRight, 0, boundsWidth);
    const maximumX = Math.max(PANEL_FLOAT_MARGIN, boundsWidth - width - PANEL_FLOAT_MARGIN);
    const x = clamp(anchorRight - PANEL_DOCK_RIGHT - width, PANEL_FLOAT_MARGIN, maximumX);
    return { mode: "docked", x, y, width, height: height2, heightMode: layout.heightMode };
  }
  const height = clamp(layout.height, minimumHeight, maximumHeight);
  return {
    mode: "floating",
    x: clamp(layout.x, PANEL_FLOAT_MARGIN, Math.max(PANEL_FLOAT_MARGIN, boundsWidth - width - PANEL_FLOAT_MARGIN)),
    y: clamp(layout.y, PANEL_FLOAT_MARGIN, Math.max(PANEL_FLOAT_MARGIN, boundsHeight - height - PANEL_FLOAT_MARGIN)),
    width,
    height,
    heightMode: layout.heightMode
  };
}
function floatPanelLayout(geometry, bounds) {
  return resolvePanelGeometry({ ...geometry, mode: "floating" }, bounds);
}
function dockPanelLayout(layout, bounds) {
  return resolvePanelGeometry({ ...layout, mode: "docked", heightMode: "auto" }, bounds);
}
function movePanelLayout(start, dx, dy, bounds) {
  return resolvePanelGeometry({ ...start, mode: "floating", x: start.x + dx, y: start.y + dy }, bounds);
}
function resizePanelLayout(start, edge, dx, dy, bounds) {
  if (start.mode === "docked") {
    if (edge !== "left")
      return resolvePanelGeometry(start, bounds);
    return resolvePanelGeometry({ ...start, width: start.width - dx }, bounds);
  }
  const resolved = resolvePanelGeometry(start, bounds);
  const minimumWidth = Math.min(PANEL_MIN_WIDTH, resolved.x + resolved.width - PANEL_FLOAT_MARGIN);
  const minimumHeight = Math.min(PANEL_MIN_HEIGHT, bounds.height - resolved.y - PANEL_FLOAT_MARGIN);
  if (edge === "left") {
    const right = resolved.x + resolved.width;
    const maximumWidth2 = Math.max(1, Math.min(PANEL_MAX_WIDTH, right - PANEL_FLOAT_MARGIN));
    const width2 = clamp(resolved.width - dx, Math.min(minimumWidth, maximumWidth2), maximumWidth2);
    return { ...resolved, x: right - width2, width: width2 };
  }
  const maximumHeight = Math.max(1, bounds.height - resolved.y - PANEL_FLOAT_MARGIN);
  const height = clamp(resolved.height + dy, Math.min(minimumHeight, maximumHeight), maximumHeight);
  if (edge === "bottom")
    return { ...resolved, height, heightMode: "manual" };
  const maximumWidth = Math.max(1, Math.min(PANEL_MAX_WIDTH, bounds.width - resolved.x - PANEL_FLOAT_MARGIN));
  const width = clamp(resolved.width + dx, Math.min(minimumWidth, maximumWidth), maximumWidth);
  return { ...resolved, width, height, heightMode: "manual" };
}

// lib/client/ActivityPanel.js
var AUTOCLOSE_GRACE_MS = 2e3;
var AUTO_OPEN_SETTLE_MS = 4e3;
var PANEL_OPEN_ATTRIBUTE = "data-agent-teams-panel-open";
var PANEL_SHIFT_PROPERTY = "--agent-teams-panel-shift";
var PANEL_CONVERSATION_GAP = 14;
var MOVE_THRESHOLD = 4;
var CAPTAIN_ASSIGNEE = "captain";
function initialPanelLayout() {
  if (typeof window === "undefined")
    return DEFAULT_PANEL_LAYOUT;
  return parsePanelLayout(window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY));
}
function initialPanelBounds() {
  if (typeof window === "undefined")
    return { width: 1440, height: 900, anchorRight: 1440 };
  return { width: window.innerWidth, height: window.innerHeight, anchorRight: window.innerWidth };
}
function memberInitial(name) {
  return name.trim().slice(0, 1).toUpperCase() || "?";
}
function stableHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index) | 0;
  }
  return Math.abs(hash);
}
var ACCENTS = [
  "var(--dsw-alias-state-business-primary)",
  "var(--dsw-alias-state-success-primary)",
  "var(--dsw-alias-state-error-primary)",
  "var(--dsw-alias-state-warn-primary)",
  "var(--dsw-alias-label-tertiary)"
];
function accentOf(id) {
  return ACCENTS[stableHash(id) % ACCENTS.length] ?? ACCENTS[0];
}
var TASK_STATUS_LABEL = {
  pending: "task.status.pending",
  claimed: "task.status.claimed",
  in_progress: "task.status.inProgress",
  completed: "task.status.completed",
  failed: "task.status.failed",
  cancelled: "task.status.cancelled"
};
function taskStatusLabel(status, t) {
  const key = TASK_STATUS_LABEL[status];
  return key === void 0 ? status : t(key);
}
function formatTaskIds(ids, t) {
  return ids.join(t("format.listSeparator"));
}
function taskTitle(task, model) {
  const extras = [
    task.kind,
    task.round === void 0 ? void 0 : `r${task.round}`,
    task.verdict,
    // Never show a bare pass: the audited verdict may no longer describe the
    // bytes currently on disk (issue #161).
    task.verdictStale === void 0 ? void 0 : `\u26A0 ${task.verdictStale}`,
    model === "" ? void 0 : model
  ].filter((item) => item !== void 0);
  return extras.length === 0 ? `${task.id} \xB7 ${task.subject}` : `${task.id} \xB7 ${task.subject} \xB7 ${extras.join(" \xB7 ")}`;
}
function taskTone(state, status) {
  if (status === "failed")
    return "failed";
  if (status === "cancelled")
    return "cancelled";
  return state;
}
function Chevron({ open }) {
  return (0, import_jsx_runtime5.jsx)("svg", { className: ActivityPanel_default.chevron, "data-open": open, width: "9", height: "9", viewBox: "0 0 10 10", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": true, children: (0, import_jsx_runtime5.jsx)("path", { d: "M3.5 2l3 3-3 3" }) });
}
function WorkGlyph({ active }) {
  return (0, import_jsx_runtime5.jsx)("svg", { className: ActivityPanel_default.workGlyph, "data-active": active, width: "11", height: "11", viewBox: "0 0 11 11", fill: "currentColor", "aria-hidden": true, children: [[0, 0], [4.2, 0], [8.4, 0], [0, 4.2], [4.2, 4.2], [8.4, 4.2]].map(([x, y], index) => (0, import_jsx_runtime5.jsx)("rect", { x, y, width: "2.6", height: "2.6", rx: ".6", style: { animationDelay: `${index * 0.15}s` } }, `${x}:${y}`)) });
}
function CollapsedBadge({ count, busy, onClick, t }) {
  return (0, import_jsx_runtime5.jsxs)("button", { type: "button", className: ActivityPanel_default.badge, "data-agent-teams-collapsed": true, "data-busy": busy, onClick, "aria-label": t("activity.badgeAria", { count }), children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.badgeDot, "data-busy": busy, "aria-hidden": true }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.badgeCount, children: count })] });
}
function memberStateLabel(member, tasks, historic, t) {
  const owned = tasks.filter((task) => task.assignee === member.name);
  if (member.activity === "working")
    return t("member.state.working");
  if (owned.some((task) => task.status === "failed"))
    return t("member.state.failed");
  if (owned.some((task) => task.state === "blocked"))
    return t("member.state.waiting");
  if (owned.length > 0 && owned.every((task) => task.status === "completed"))
    return t("member.state.delivered");
  if (member.status === "removed")
    return t(historic ? "member.state.left" : "member.state.removed");
  if (owned.length > 0)
    return t("member.state.pending");
  return t("member.state.unassigned");
}
function memberStatusText(member, tasks, t) {
  const owned = tasks.filter((task) => task.assignee === member.name);
  const current = owned.find((task) => task.id === member.currentTask);
  const blocked = owned.find((task) => task.state === "blocked");
  if (member.activity === "working" && current !== void 0) {
    const model = taskModelLabel(current, [member]);
    return model === "" ? t("member.status.executing", { taskId: current.id }) : t("member.status.executingModel", { taskId: current.id, model });
  }
  if (member.activity === "working")
    return t("member.status.working");
  if (blocked !== void 0) {
    const dependency = tasks.find((task) => blocked.dependencies.includes(task.id) && task.state !== "completed");
    if (dependency !== void 0) {
      return t("member.status.waitingOn", {
        taskId: dependency.id,
        assignee: dependency.assignee || t("task.assignee.unclaimed")
      });
    }
    return t("member.status.waitingPrerequisite");
  }
  if (member.total === 0)
    return t("member.status.waitingAssignment");
  if (member.done === member.total)
    return t("member.status.delivered");
  if (owned.some((task) => task.status === "failed"))
    return t("task.detail.failed");
  if (owned.length > 0 && owned.every((task) => task.status === "completed" || task.status === "cancelled"))
    return t("member.status.settled");
  return t(member.activity === "idle" ? "member.status.idle" : "member.status.unknown");
}
function compactTaskLabel(subject) {
  const withoutVerb = subject.replace(/^开发\s*/u, "").replace(/^\d+[-_.、\s]*/u, "");
  const head = withoutVerb.split(/[（(·：:]/u)[0]?.trim() ?? withoutVerb;
  return head.length > 18 ? `${head.slice(0, 17)}\u2026` : head;
}
function taskSummary(team, t, discarded = false) {
  const completed = team.tasks.filter((task) => task.status === "completed");
  const cancelled = team.tasks.filter((task) => task.status === "cancelled");
  const running = team.tasks.filter((task) => task.state === "running");
  const claimed = team.tasks.filter((task) => task.state === "claimed");
  const blocked = team.tasks.filter((task) => task.state === "blocked");
  const ready = team.tasks.filter((task) => task.state === "open" && task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled");
  const failed = team.tasks.filter((task) => task.status === "failed");
  if (discarded)
    return t("task.summary.discarded", { count: team.tasks.length });
  if (team.tasks.length === 0)
    return t("task.summary.waitingBreakdown");
  if (team.phase === "staged")
    return t("task.summary.staged", { count: team.tasks.length });
  if (completed.length === team.tasks.length)
    return t("task.summary.allDelivered", { count: completed.length });
  if (completed.length + cancelled.length + failed.length === team.tasks.length) {
    return t("task.summary.ended", {
      completed: completed.length,
      cancelled: cancelled.length,
      failed: failed.length
    });
  }
  if (failed.length > 0 && running.length === 0 && claimed.length === 0 && ready.length === 0 && blocked.length === 0) {
    return t("task.summary.failedSettled", { count: failed.length });
  }
  if (blocked.length > 0 && running.length > 0) {
    return t("task.summary.blockedAndRunning", {
      tasks: formatTaskIds(blocked.slice(0, 3).map((task) => task.id), t),
      more: blocked.length > 3 ? t("task.summary.more", { count: blocked.length - 3 }) : ""
    });
  }
  if (running.length > 0)
    return t("task.summary.running", { tasks: formatTaskIds(running.map((task) => task.id), t) });
  if (claimed.length > 0)
    return t("task.summary.claimed", { tasks: formatTaskIds(claimed.map((task) => task.id), t) });
  if (ready.length > 0)
    return t("task.summary.ready", { tasks: formatTaskIds(ready.map((task) => task.id), t) });
  if (blocked.length > 0)
    return t("task.summary.blocked", { tasks: formatTaskIds(blocked.map((task) => task.id), t) });
  return t("task.summary.waitingSchedule");
}
function ProgressOverview({ team, t, discarded = false }) {
  const running = discarded ? 0 : team.tasks.filter((task) => task.state === "running").length;
  const claimed = discarded ? 0 : team.tasks.filter((task) => task.state === "claimed").length;
  const blocked = discarded ? 0 : team.tasks.filter((task) => task.state === "blocked").length;
  const completed = discarded ? 0 : team.tasks.filter((task) => task.status === "completed").length;
  const settled = !discarded && team.tasks.length > 0 && team.tasks.every((task) => task.status === "completed" || task.status === "failed" || task.status === "cancelled");
  const summaryTone = discarded ? "discarded" : blocked > 0 || team.tasks.some((task) => task.status === "failed" || task.status === "cancelled") ? "warning" : settled ? "completed" : "running";
  return (0, import_jsx_runtime5.jsxs)("section", { className: ActivityPanel_default.progressOverview, "aria-label": t("progress.aria"), "data-progress-summary": true, children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.progressTitle, children: t("progress.title") }), team.tasks.length > 0 ? (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.progressSegments, "aria-hidden": true, children: team.tasks.map((task) => (0, import_jsx_runtime5.jsx)("span", { "data-state": discarded ? "cancelled" : taskTone(task.state, task.status) }, task.id)) }) : (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.progressEmpty }), (0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.progressLegend, children: [(0, import_jsx_runtime5.jsx)("span", { "data-state": "running", children: t("progress.running", { count: running }) }), claimed > 0 && (0, import_jsx_runtime5.jsx)("span", { "data-state": "claimed", children: t("progress.claimed", { count: claimed }) }), (0, import_jsx_runtime5.jsx)("span", { "data-state": "blocked", children: t("progress.blocked", { count: blocked }) }), (0, import_jsx_runtime5.jsx)("span", { "data-state": "completed", children: t("progress.delivered", { count: completed }) })] }), (0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.progressSummary, "data-state": summaryTone, children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.progressSummaryDot }), (0, import_jsx_runtime5.jsx)("span", { children: taskSummary(team, t, discarded) })] })] });
}
function WorkspaceSummary({ team, t, discarded }) {
  const completed = discarded ? 0 : team.tasks.filter((task) => task.status === "completed").length;
  const total = team.tasks.length;
  return (0, import_jsx_runtime5.jsxs)("div", { className: ActivityPanel_default.workspaceSummary, children: [(0, import_jsx_runtime5.jsxs)("section", { className: ActivityPanel_default.completionCard, "aria-label": t("progress.aria"), children: [(0, import_jsx_runtime5.jsx)("h3", { children: t("progress.title") }), (0, import_jsx_runtime5.jsxs)("div", { className: ActivityPanel_default.completionBody, children: [(0, import_jsx_runtime5.jsxs)("div", { className: ActivityPanel_default.completionRing, role: "img", "aria-label": t("team.stats.completed", { completed, total }), "data-completed": completed, "data-total": total, children: [(0, import_jsx_runtime5.jsxs)("svg", { viewBox: "0 0 120 120", "aria-hidden": true, children: [(0, import_jsx_runtime5.jsx)("circle", { className: ActivityPanel_default.ringTrack, cx: "60", cy: "60", r: "51" }), (0, import_jsx_runtime5.jsx)("circle", { className: ActivityPanel_default.ringValue, cx: "60", cy: "60", r: "51", pathLength: "100", strokeDasharray: `${total === 0 ? 0 : completed / total * 100} 100` })] }), (0, import_jsx_runtime5.jsxs)("span", { "aria-hidden": true, children: [(0, import_jsx_runtime5.jsxs)("strong", { children: [completed, (0, import_jsx_runtime5.jsxs)("small", { children: [" / ", total] })] }), (0, import_jsx_runtime5.jsx)("span", { children: t(discarded ? "task.status.notRun" : "workspace.completed") })] })] }), total === 0 ? (0, import_jsx_runtime5.jsx)("p", { className: ActivityPanel_default.summaryEmpty, children: t("workspace.noTasks") }) : (0, import_jsx_runtime5.jsx)("ul", { className: ActivityPanel_default.completionTasks, tabIndex: 0, "aria-label": t("workspace.taskSummary"), children: team.tasks.map((task) => (0, import_jsx_runtime5.jsxs)("li", { "data-state": discarded ? "cancelled" : taskTone(task.state, task.status), "data-verdict-stale": task.verdictStale === void 0 ? void 0 : "true", title: taskTitle(task, taskModelLabel(task, team.members)), children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.completionDot, "aria-hidden": true, children: task.verdictStale !== void 0 ? "!" : !discarded && task.status === "completed" ? "\u2713" : "\xB7" }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.completionTaskId, children: task.id }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.completionTaskSubject, title: task.subject, children: task.subject }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.completionTaskStatus, children: discarded ? t("task.status.notRun") : task.verdictStale !== void 0 ? t("workspace.verdictStale") : taskStatusLabel(task.status, t) })] }, task.id)) })] })] }), (0, import_jsx_runtime5.jsxs)("section", { className: ActivityPanel_default.inboxCard, "aria-label": t("workspace.inbox"), children: [(0, import_jsx_runtime5.jsxs)("header", { children: [(0, import_jsx_runtime5.jsx)("h3", { children: t("workspace.inbox") }), (0, import_jsx_runtime5.jsx)("span", { children: t("workspace.inboxHint") })] }), team.captainInbox.length === 0 ? (0, import_jsx_runtime5.jsx)("p", { className: ActivityPanel_default.summaryEmpty, children: t("workspace.inboxEmpty") }) : (0, import_jsx_runtime5.jsx)("ul", { className: ActivityPanel_default.inboxMessages, tabIndex: 0, "aria-label": t("workspace.inbox"), children: team.captainInbox.map((message, index) => {
    const member = team.members.find((candidate) => candidate.name === message.from);
    const art = message.from === CAPTAIN_ASSIGNEE ? LEAD_ART : memberArtUrl(message.from, member?.role ?? "");
    return (0, import_jsx_runtime5.jsxs)("li", { children: [art === null ? (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.inboxInitial, "aria-hidden": true, children: memberInitial(message.from) }) : (0, import_jsx_runtime5.jsx)("img", { src: art, alt: "", "aria-hidden": true }), (0, import_jsx_runtime5.jsxs)("div", { children: [(0, import_jsx_runtime5.jsx)("strong", { children: message.from }), (0, import_jsx_runtime5.jsx)("p", { children: message.content })] })] }, `${index}:${message.from}`);
  }) })] })] });
}
function DependencyMap({ tasks, members, t, discarded = false, workspace = false, onSelectTask }) {
  const [open, setOpen] = (0, import_react4.useState)(true);
  const [hoverTaskId, setHoverTaskId] = (0, import_react4.useState)(null);
  const [keyboardTaskId, setKeyboardTaskId] = (0, import_react4.useState)(null);
  const [pinnedTaskId, setPinnedTaskId] = (0, import_react4.useState)(null);
  const hoverTimer = (0, import_react4.useRef)(null);
  const focusedTaskId = dependencyFocusTaskId(pinnedTaskId, keyboardTaskId, hoverTaskId);
  const nodeWidth = workspace ? 164 : COMPACT_DAG_NODE_WIDTH;
  const nodeHeight = workspace ? 76 : COMPACT_DAG_NODE_HEIGHT;
  const layout = (0, import_react4.useMemo)(() => compactDagLayout(tasks, workspace ? { nodeWidth: 164, nodeHeight: 76, columnGap: 36, rowGap: 16 } : void 0), [tasks, workspace]);
  const parallel = (0, import_react4.useMemo)(() => usesParallelTaskGrid(tasks), [tasks]);
  const related = (0, import_react4.useMemo)(() => focusedTaskId === null ? null : relatedTaskIds(focusedTaskId, tasks), [focusedTaskId, tasks]);
  const scheduleHover = (id) => {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (id === null) {
      setHoverTaskId(null);
      return;
    }
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null;
      setHoverTaskId(id);
    }, 180);
  };
  (0, import_react4.useEffect)(() => () => {
    if (hoverTimer.current !== null)
      clearTimeout(hoverTimer.current);
  }, []);
  (0, import_react4.useEffect)(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setPinnedTaskId(null);
        onSelectTask?.(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onSelectTask]);
  if (tasks.length === 0)
    return null;
  const fallbackTask = tasks.find((task) => task.state === "blocked") ?? tasks.find((task) => task.state === "running") ?? tasks.find((task) => task.state === "claimed") ?? tasks[0];
  const detailTask = tasks.find((task) => task.id === focusedTaskId) ?? fallbackTask;
  const detailModel = taskModelLabel(detailTask, members);
  const waitingOn = detailTask.dependencies.filter((dependency) => tasks.find((task) => task.id === dependency)?.status !== "completed");
  const dependents = tasks.filter((task) => task.dependencies.includes(detailTask.id));
  return (0, import_jsx_runtime5.jsxs)("section", { className: ActivityPanel_default.dependencySection, "aria-label": t("dependency.aria"), "data-dependency-map": true, children: [(0, import_jsx_runtime5.jsxs)("header", { className: ActivityPanel_default.sectionHead, children: [(0, import_jsx_runtime5.jsxs)("button", { type: "button", className: ActivityPanel_default.sectionToggleTitle, onClick: () => {
    setOpen((current) => !current);
  }, "aria-expanded": open, children: [(0, import_jsx_runtime5.jsx)(Chevron, { open }), (0, import_jsx_runtime5.jsx)(IconBranchOutline16, {}), " ", t(parallel ? "dependency.parallel" : "dependency.title")] }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.sectionHint, children: pinnedTaskId === null ? t(parallel ? "dependency.hint.parallel" : workspace ? "workspace.dependencies" : "dependency.hint.chain") : t("dependency.hint.pinned", { taskId: pinnedTaskId }) })] }), open && (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [(0, import_jsx_runtime5.jsx)("div", { className: ActivityPanel_default.dagViewport, children: (0, import_jsx_runtime5.jsxs)("div", { className: ActivityPanel_default.dagCanvas, "data-layout": parallel ? "parallel" : "dependency", style: parallel ? void 0 : { width: layout.width, height: layout.height }, children: [!parallel && (0, import_jsx_runtime5.jsx)("svg", { className: ActivityPanel_default.dagEdges, width: layout.width, height: layout.height, "aria-hidden": true, children: layout.edges.map((edge) => {
    const active = related !== null && related.has(edge.from) && related.has(edge.to);
    return (0, import_jsx_runtime5.jsx)("path", { d: edge.path, "data-active": active, "data-dimmed": related !== null && !active }, `${edge.from}:${edge.to}`);
  }) }), layout.nodes.map(({ task, x, y }) => {
    const model = taskModelLabel(task, members);
    return (0, import_jsx_runtime5.jsxs)("button", { type: "button", className: ActivityPanel_default.dagNode, style: parallel ? { height: nodeHeight } : { left: x, top: y, width: nodeWidth, height: nodeHeight }, "data-task-id": task.id, "data-state": discarded ? "cancelled" : taskTone(task.state, task.status), "data-verdict-stale": task.verdictStale === void 0 ? void 0 : "true", "data-task-model": model || void 0, "data-focused": related?.has(task.id) ?? false, "data-dimmed": related !== null && !related.has(task.id), "aria-pressed": pinnedTaskId === task.id, title: taskTitle(task, model), onClick: () => {
      const next = pinnedTaskId === task.id ? null : task.id;
      setPinnedTaskId(next);
      onSelectTask?.(next);
    }, onMouseEnter: () => {
      scheduleHover(task.id);
    }, onMouseLeave: () => {
      scheduleHover(null);
    }, onFocus: () => {
      setKeyboardTaskId(task.id);
    }, onBlur: () => {
      setKeyboardTaskId(null);
    }, children: [(0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.dagNodeHead, children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.dagNodeDot }), task.id, workspace && (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.dagOwner, children: task.assignee || t("task.assignee.unclaimed") })] }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.dagNodeLabel, children: workspace ? task.subject : compactTaskLabel(task.subject) }), !discarded && task.state === "claimed" && (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.dagClaimedState, children: t("task.status.claimed") }), task.state === "running" && (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.dagRunningState, "aria-label": t("task.runningAria"), children: (0, import_jsx_runtime5.jsx)(WorkGlyph, { active: true }) })] }, task.id);
  })] }) }), (0, import_jsx_runtime5.jsxs)("section", { className: ActivityPanel_default.taskDetail, "data-task-detail": detailTask.id, children: [(0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.taskDetailHead, children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.taskDetailId, children: detailTask.id }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.taskDetailSubject, title: detailTask.subject, children: detailTask.subject.replace(/^开发\s*/u, "") }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.taskDetailBadge, "data-state": discarded ? "cancelled" : taskTone(detailTask.state, detailTask.status), children: discarded ? t("task.status.notRun") : taskStatusLabel(detailTask.status, t) })] }), (0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.taskDetailLine, children: [detailTask.assignee || t("task.assignee.unclaimed"), " \xB7 ", discarded ? t("task.detail.notRun") : detailTask.status === "completed" ? t("task.detail.completed") : detailTask.status === "cancelled" ? t("task.detail.cancelled") : detailTask.status === "failed" ? t("task.detail.failed") : detailTask.dependencies.length === 0 ? t("task.detail.noPrerequisite") : waitingOn.length === 0 ? t("task.detail.ready") : t("task.detail.waitingOn", { tasks: formatTaskIds(waitingOn, t) })] }), detailModel !== "" && (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.taskDetailModel, "data-task-model": detailModel, children: t("task.model", { model: detailModel }) }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.taskDetailMeta, children: dependents.length === 0 ? t("task.detail.noDownstream") : t("task.detail.unlocks", { tasks: formatTaskIds(dependents.map((task) => task.id), t) }) })] })] })] });
}
function TeamSection({ team, modelDirectory, onContinuePlanning, onDiscarded, onNavigate, t, historic = false, workspace = false }) {
  const [selectedTaskId, setSelectedTaskId] = (0, import_react4.useState)(null);
  const selectedAssignee = team.tasks.find((task) => task.id === selectedTaskId)?.assignee;
  const [membersOpen, setMembersOpen] = (0, import_react4.useState)(workspace);
  const [stopOpen, setStopOpen] = (0, import_react4.useState)(false);
  const [stopping, setStopping] = (0, import_react4.useState)(false);
  const [stopError, setStopError] = (0, import_react4.useState)("");
  const discarded = historic && team.phase === "staged";
  const stopped = !historic && team.halted === true;
  const busyCount = team.members.filter((member) => member.activity === "working").length;
  const assignedCount = team.tasks.filter((task) => task.assignee !== "" && task.assignee !== CAPTAIN_ASSIGNEE).length;
  const captainOwned = team.tasks.filter((task) => task.assignee === CAPTAIN_ASSIGNEE && task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled");
  const captainBusy = captainOwned.length > 0;
  const captainTaskIds = formatTaskIds(captainOwned.map((task) => task.id), t);
  const completedCount = team.tasks.filter((task) => task.status === "completed").length;
  const allCompleted = team.tasks.length > 0 && completedCount === team.tasks.length;
  const allSettled = team.tasks.length > 0 && team.tasks.every((task) => task.status === "completed" || task.status === "failed" || task.status === "cancelled");
  const unfinishedCount = team.tasks.filter((task) => task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled").length;
  const canStop = !historic && team.phase === "running" && team.halted !== true && teamIsActive(team);
  const stopTeam = async () => {
    if (stopping)
      return;
    setStopping(true);
    setStopError("");
    try {
      const response = await fetch(ACTIVITY_HALT_URL, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: team.captainSessionId, teamId: team.teamId })
      });
      if (!response.ok) {
        let message = t("team.stopRequestFailed");
        try {
          const body = await response.json();
          if (typeof body.error === "string" && body.error.trim() !== "")
            message = body.error;
        } catch {
        }
        throw new Error(message);
      }
      setStopOpen(false);
    } catch (error) {
      setStopError(t("team.stopFailed", { message: error instanceof Error ? error.message : String(error) }));
    } finally {
      setStopping(false);
    }
  };
  return (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [(0, import_jsx_runtime5.jsxs)("section", { className: ActivityPanel_default.team, "data-team-id": team.teamId, "data-workspace-team": workspace || void 0, children: [(0, import_jsx_runtime5.jsxs)("header", { className: ActivityPanel_default.teamHead, children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.teamName, title: team.name, children: team.name }), historic && (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.historicPill, children: t(discarded ? "team.discarded" : "team.ended") }), stopped && (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.historicPill, children: t("team.stopped") }), (0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.teamStats, children: [(0, import_jsx_runtime5.jsx)("span", { "data-stat": "members", children: t("team.stats.members", { count: team.members.length }) }), (0, import_jsx_runtime5.jsx)("span", { "data-stat": "tasks", children: t("team.stats.completed", { completed: completedCount, total: team.tasks.length }) }), (0, import_jsx_runtime5.jsx)("span", { "data-stat": "messages", children: t("team.stats.messages", { count: team.messageCount }) })] }), canStop && (0, import_jsx_runtime5.jsx)("button", { type: "button", className: ActivityPanel_default.teamStopButton, "aria-label": t("team.stop"), title: t("team.stop"), onClick: () => {
    setStopError("");
    setStopOpen(true);
  }, children: (0, import_jsx_runtime5.jsx)(IconStopFill16, {}) })] }), team.phase === "staged" && !historic && modelDirectory !== void 0 && onContinuePlanning !== void 0 && onDiscarded !== void 0 && (0, import_jsx_runtime5.jsx)(StagingPlanEditor, { team, modelDirectory, onContinuePlanning, onDiscarded, t }), (0, import_jsx_runtime5.jsxs)("section", { className: ActivityPanel_default.delegationSection, "aria-label": t("delegation.aria"), "data-delegation-map": true, children: [(0, import_jsx_runtime5.jsxs)("div", { className: ActivityPanel_default.captainNode, children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.captainAvatar, children: (0, import_jsx_runtime5.jsx)("img", { className: ActivityPanel_default.leadAvatar, src: LEAD_ART, alt: "", "aria-hidden": true }) }), (0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.captainInfo, children: [(0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.captainLine, children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.captainName, children: t("captain.name") }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.captainRole, children: t("captain.role") })] }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.captainSummary, children: discarded ? t("captain.summary.discarded", { tasks: team.tasks.length, members: team.members.length }) : captainBusy ? t("captain.summary.withTakeover", { tasks: assignedCount, captainTasks: captainTaskIds }) : team.phase === "staged" ? t(team.planReviewState === "awaiting_feedback" ? "captain.summary.awaitingFeedback" : "captain.summary.staged", { tasks: team.tasks.length, members: team.members.length }) : t("captain.summary", { tasks: assignedCount, members: team.members.length }) })] }), (0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.captainState, "data-busy": captainBusy || busyCount > 0, children: [(0, import_jsx_runtime5.jsx)(WorkGlyph, { active: captainBusy || busyCount > 0 }), discarded ? t("captain.state.discarded") : captainBusy ? t("captain.state.takeover", { tasks: captainTaskIds }) : team.phase === "staged" ? t(team.planReviewState === "awaiting_feedback" ? "captain.state.awaitingFeedback" : "captain.state.staged") : busyCount > 0 ? t("captain.state.working", { count: busyCount }) : t(allCompleted ? "captain.state.collected" : allSettled ? "captain.state.settled" : "captain.state.waiting")] })] }), (0, import_jsx_runtime5.jsx)(ProgressOverview, { team, t, discarded }), (0, import_jsx_runtime5.jsxs)("div", { className: ActivityPanel_default.panelColumnMain, "data-panel-column": "member", children: [(0, import_jsx_runtime5.jsx)(AddMemberControl, { team, modelDirectory, t, historic, stopped }), (() => {
    const orderedMembers = orderDelegationMembers(team.members, team.tasks);
    const runningMembers = orderedMembers.filter((member) => member.activity === "working" || member.status === "working" || team.tasks.some((task) => task.assignee === member.name && (task.status === "pending" || task.status === "claimed" || task.status === "in_progress")));
    const visibleMembers = membersOpen ? orderedMembers : runningMembers;
    const hiddenFinishedCount = orderedMembers.length - visibleMembers.length;
    const expandLabel = membersOpen ? t("members.collapse") : hiddenFinishedCount > 0 ? t("members.expandFinished", { count: hiddenFinishedCount }) : t("members.expand");
    return (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [(0, import_jsx_runtime5.jsxs)("button", { type: "button", className: ActivityPanel_default.membersToggle, onClick: () => {
      setMembersOpen((current) => !current);
    }, "aria-expanded": membersOpen, "data-members-toggle": true, children: [(0, import_jsx_runtime5.jsxs)("span", { children: [(0, import_jsx_runtime5.jsx)(Chevron, { open: membersOpen }), t("members.toggle", { count: team.members.length })] }), (0, import_jsx_runtime5.jsx)("span", { children: expandLabel })] }), (membersOpen || visibleMembers.length > 0) && (0, import_jsx_runtime5.jsxs)("div", { className: ActivityPanel_default.delegationTree, children: [team.members.length === 0 && (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.emptyHint, children: t("members.empty") }), visibleMembers.map((member) => {
      const owned = team.tasks.filter((task) => task.assignee === member.name);
      const memberModel = memberRouteLabel(member);
      return (0, import_jsx_runtime5.jsxs)("div", { className: ActivityPanel_default.memberBlock, "data-activity": member.activity, "data-selected-member": workspace && selectedAssignee === member.name || void 0, children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.memberBranch, "aria-hidden": true, children: (0, import_jsx_runtime5.jsx)("span", {}) }), (0, import_jsx_runtime5.jsxs)("button", { type: "button", className: ActivityPanel_default.memberRow, "data-activity": member.activity, onClick: () => {
        if (member.id !== "") {
          onNavigate(team.captainSessionId, member.id);
        }
      }, children: [(0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.memberAvatar, "data-unread": member.unread > 0, children: [memberArtUrl(member.name, member.role) !== null ? (0, import_jsx_runtime5.jsx)("img", { className: ActivityPanel_default.memberArt, src: memberArtUrl(member.name, member.role) ?? "", alt: "", "aria-hidden": true }) : (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.memberInitial, style: { background: accentOf(member.id) }, children: memberInitial(member.name) }), (0, import_jsx_runtime5.jsx)("img", { className: ActivityPanel_default.stateArt, "data-activity": member.activity, src: ACTION_ART[member.activity], alt: "", "aria-hidden": true })] }), (0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.memberInfo, children: [(0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.memberLine, children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.memberName, children: member.name }), member.role !== "" && (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.memberRole, children: member.role }), memberModel !== "" && (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.memberModel, role: "img", "data-member-model": memberModel, title: memberModel, "aria-label": memberModel, children: compactModelLabel(memberModel) }), (0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.memberState, "data-activity": member.activity, children: [(0, import_jsx_runtime5.jsx)(WorkGlyph, { active: member.activity === "working" }), discarded ? t("member.state.notCreated") : stopped ? t("member.state.stopped") : team.phase === "staged" ? t("member.state.staged") : memberStateLabel(member, team.tasks, historic, t)] })] }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.memberStatusLine, children: discarded ? t("member.status.discarded") : stopped ? t("member.status.stopped") : team.phase === "staged" ? t("member.status.staged") : historic && owned.length > 0 && owned.every((task) => task.status === "completed" || task.status === "failed" || task.status === "cancelled") ? t("member.status.settled") : memberStatusText(member, team.tasks, t) })] }), (0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.memberCount, children: [member.done, "/", member.total] })] }), (0, import_jsx_runtime5.jsx)(MemberRouteControl, { team, member, modelDirectory, t, historic, stopped }), (0, import_jsx_runtime5.jsx)(MemberFailureNotice, { member, t }), (0, import_jsx_runtime5.jsxs)("div", { className: ActivityPanel_default.assignmentLine, children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.assignmentLabel, children: t(discarded ? "assignment.discarded" : team.phase === "staged" ? "assignment.staged" : "assignment.label") }), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.assignmentTasks, children: owned.length === 0 ? (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.taskEmpty, children: t("assignment.empty") }) : owned.map((task) => {
        const model = taskModelLabel(task, team.members);
        const shortModel = compactModelLabel(model);
        return (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.assignmentChip, "data-state": discarded ? "cancelled" : taskTone(task.state, task.status), "data-verdict-stale": task.verdictStale === void 0 ? void 0 : "true", "data-task-model": model || void 0, title: taskTitle(task, model), children: task.state === "running" && shortModel !== "" ? `${task.id} \xB7 ${shortModel}` : task.id }, task.id);
      }) })] })] }, member.id || member.name);
    })] })] });
  })()] })] }), (0, import_jsx_runtime5.jsx)(DependencyMap, { tasks: team.tasks, members: team.members, t, discarded, workspace, onSelectTask: setSelectedTaskId }), workspace && (0, import_jsx_runtime5.jsx)(WorkspaceSummary, { team, t, discarded })] }), (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives2.Modal, { open: stopOpen, onClose: () => {
    if (!stopping)
      setStopOpen(false);
  }, title: t("team.stopTitle", { team: team.name }), closeLabel: t("plan.cancel"), description: t("team.stopDescription", { tasks: unfinishedCount, members: busyCount }), footer: (0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.stopModalActions, children: [(0, import_jsx_runtime5.jsx)("button", { type: "button", disabled: stopping, onClick: () => {
    setStopOpen(false);
  }, children: t("team.stopCancel") }), (0, import_jsx_runtime5.jsxs)("button", { type: "button", "data-danger": true, disabled: stopping, onClick: () => {
    void stopTeam();
  }, children: [(0, import_jsx_runtime5.jsx)(IconStopFill16, {}), stopping ? t("team.stopping") : t("team.stopConfirm")] })] }), children: stopError !== "" && (0, import_jsx_runtime5.jsxs)("p", { className: ActivityPanel_default.stopModalError, role: "alert", children: [(0, import_jsx_runtime5.jsx)(IconWarningOutline16, {}), stopError] }) })] });
}
function historicCardTeam(data, owner) {
  return {
    workspace: "",
    teamId: data.teamId,
    name: data.teamName,
    captainSessionId: data.captainSessionId || owner,
    phase: "running",
    members: data.members.map((member) => ({
      ...member,
      status: "removed",
      activity: "idle",
      progress: 0,
      done: 0,
      total: 0,
      currentTask: "",
      unread: 0
    })),
    tasks: [],
    messageCount: 0,
    captainInbox: []
  };
}
function ActivityPanel({ sessionsList, modelDirectories, openMember, t, conversationVisible = true }) {
  const navigateToSession = (parentId, childId) => {
    setOpen(false);
    setWasActive(false);
    openMember(parentId, childId);
  };
  const [open, setOpen] = (0, import_react4.useState)(false);
  const [openOwner, setOpenOwner] = (0, import_react4.useState)();
  const [autoOpened, setAutoOpened] = (0, import_react4.useState)(false);
  const [wasActive, setWasActive] = (0, import_react4.useState)(false);
  const [historic, setHistoric] = (0, import_react4.useState)(/* @__PURE__ */ new Map());
  const [layout, setLayout] = (0, import_react4.useState)(initialPanelLayout);
  const [bounds, setBounds] = (0, import_react4.useState)(initialPanelBounds);
  const [interaction, setInteraction] = (0, import_react4.useState)(null);
  const panelRef = (0, import_react4.useRef)(null);
  const boundsRef = (0, import_react4.useRef)(bounds);
  const gestureRef = (0, import_react4.useRef)(null);
  const frameRef = (0, import_react4.useRef)(null);
  const pendingLayoutRef = (0, import_react4.useRef)(null);
  const current = currentSessionId((0, import_react4.useSyncExternalStore)(sessionsList.subscribe, sessionsList.getSnapshot));
  const autoOpenTrackerRef = (0, import_react4.useRef)({ sessionId: current, restoreComplete: false, liveTeamIds: /* @__PURE__ */ new Set() });
  const monitorTargets = (0, import_react4.useSyncExternalStore)(subscribeActivityMonitorTargets, getActivityMonitorTargetsSnapshot);
  const returnToComposer = () => {
    setOpen(false);
    setOpenOwner(void 0);
    window.requestAnimationFrame(() => {
      document.querySelector('[data-composer-card] [contenteditable="true"][role="textbox"], [data-composer-card] textarea')?.focus();
    });
  };
  const { teams, archivedTeams } = (0, import_react4.useSyncExternalStore)(subscribeActivitySnapshots, getActivitySnapshotsSnapshot);
  const currentTargets = (0, import_react4.useMemo)(() => current === void 0 ? [] : monitorTargets.filter((target) => target.sessionId === current), [current, monitorTargets]);
  const currentRef = (0, import_react4.useRef)(current);
  (0, import_react4.useEffect)(() => {
    currentRef.current = current;
  }, [current]);
  const mountedAtRef = (0, import_react4.useRef)(performance.now());
  const expanded = conversationVisible && activityPanelExpandedForSession(open, openOwner, current);
  const geometry = (0, import_react4.useMemo)(() => resolvePanelGeometry(layout, bounds), [layout, bounds]);
  const compact = compactPanelForBounds(bounds);
  const commitLayout = (0, import_react4.useCallback)((next) => {
    setLayout(next);
  }, []);
  (0, import_react4.useEffect)(() => {
    window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);
  (0, import_react4.useLayoutEffect)(() => {
    const overlay = document.querySelector("[data-shell-overlay]");
    if (overlay === null)
      return;
    const conversation = document.querySelector("[data-phase='active']");
    let frame = null;
    const measure = () => {
      frame = null;
      const overlayRect = overlay.getBoundingClientRect();
      const conversationRect = conversation?.getBoundingClientRect();
      const next = {
        width: overlayRect.width,
        height: overlayRect.height,
        anchorRight: conversationRect === void 0 ? overlayRect.width : Math.min(Math.max(conversationRect.right - overlayRect.left, 0), overlayRect.width)
      };
      const previous = boundsRef.current;
      if (previous.width === next.width && previous.height === next.height && previous.anchorRight === next.anchorRight)
        return;
      boundsRef.current = next;
      setBounds(next);
    };
    const scheduleMeasure = () => {
      frame ?? (frame = requestAnimationFrame(measure));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(overlay);
    if (conversation !== null)
      observer?.observe(conversation);
    window.addEventListener("resize", scheduleMeasure);
    return () => {
      if (frame !== null)
        cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [current]);
  (0, import_react4.useLayoutEffect)(() => {
    const tracker = autoOpenTrackerRef.current;
    if (tracker.sessionId !== current) {
      tracker.sessionId = current;
      tracker.restoreComplete = false;
      tracker.liveTeamIds = /* @__PURE__ */ new Set();
      setWasActive(false);
      setAutoOpened(false);
    }
    if (openOwner === void 0 || openOwner === current)
      return;
    setOpen(false);
    setOpenOwner(void 0);
  }, [current, openOwner]);
  (0, import_react4.useLayoutEffect)(() => {
    const root = document.documentElement;
    const shouldYield = expanded && geometry.mode === "docked" && !compact;
    if (shouldYield) {
      root.setAttribute(PANEL_OPEN_ATTRIBUTE, "");
      root.style.setProperty(PANEL_SHIFT_PROPERTY, `${geometry.width + PANEL_CONVERSATION_GAP + 18}px`);
    } else {
      root.removeAttribute(PANEL_OPEN_ATTRIBUTE);
      root.style.removeProperty(PANEL_SHIFT_PROPERTY);
    }
    return () => {
      root.removeAttribute(PANEL_OPEN_ATTRIBUTE);
      root.style.removeProperty(PANEL_SHIFT_PROPERTY);
    };
  }, [compact, expanded, geometry.mode, geometry.width]);
  (0, import_react4.useEffect)(() => {
    if (current === void 0)
      return;
    const controller = startActivityPolling(currentTargets, { discoverySessionId: current });
    let active = true;
    const tracker = autoOpenTrackerRef.current;
    if (tracker.sessionId === current && !tracker.restoreComplete) {
      void controller.firstTick.then(() => {
        const latest = autoOpenTrackerRef.current;
        if (!active || latest.sessionId !== current || latest.restoreComplete)
          return;
        latest.liveTeamIds = new Set(getActivitySnapshotsSnapshot().teams.filter((team) => team.captainSessionId === current).map((team) => team.teamId));
        latest.restoreComplete = true;
      });
    }
    return () => {
      active = false;
      controller.stop();
    };
  }, [current, currentTargets]);
  (0, import_react4.useEffect)(() => {
    const onOpenPanel = (event) => {
      const activeSession = currentRef.current;
      if (activeSession === void 0)
        return;
      setOpenOwner(activeSession);
      setOpen(true);
      const detail = event.detail;
      if (detail?.teamId !== void 0) {
        const owner = detail.captainSessionId !== "" ? detail.captainSessionId : currentRef.current ?? "";
        const teamKey = `${owner}:${detail.teamId}`;
        setHistoric((previous) => {
          const next = new Map(previous);
          next.set(teamKey, { data: detail, owner });
          return next;
        });
      }
    };
    window.addEventListener(OPEN_PANEL_EVENT, onOpenPanel);
    return () => {
      window.removeEventListener(OPEN_PANEL_EVENT, onOpenPanel);
    };
  }, []);
  const visibleTeams = (0, import_react4.useMemo)(
    // No current session (initial load): show nothing until one is picked,
    // so cross-session teams never leak into the floater.
    () => current === void 0 ? [] : teams.filter((team) => team.captainSessionId === current),
    [teams, current]
  );
  const visibleHistoric = (0, import_react4.useMemo)(() => current === void 0 ? [] : [...historic.values()].filter(({ data, owner }) => owner === current && !teams.some((live) => live.captainSessionId === current && live.teamId === data.teamId) && !archivedTeams.some((archived) => archived.captainSessionId === current && archived.teamId === data.teamId)), [historic, current, teams, archivedTeams]);
  const visibleArchived = (0, import_react4.useMemo)(() => current === void 0 ? [] : archivedTeams.filter((team) => team.captainSessionId === current && !teams.some((live) => live.captainSessionId === current && live.teamId === team.teamId)), [archivedTeams, current, teams]);
  const visibleCount = visibleTeams.length + visibleArchived.length + visibleHistoric.length;
  const visibleLiveTeamIds = (0, import_react4.useMemo)(() => visibleTeams.map((team) => team.teamId).sort(), [visibleTeams]);
  const visibleLiveTeamKey = visibleLiveTeamIds.join("\0");
  (0, import_react4.useEffect)(() => {
    const tracker = autoOpenTrackerRef.current;
    const settled = performance.now() - mountedAtRef.current >= AUTO_OPEN_SETTLE_MS;
    const shouldAutoExpand = tracker.sessionId === current && activityPanelShouldAutoExpand({
      alreadyAutoOpened: autoOpened,
      pageSettled: settled,
      restoreComplete: tracker.restoreComplete,
      previousLiveTeamIds: tracker.liveTeamIds,
      currentLiveTeamIds: visibleLiveTeamIds
    });
    if (tracker.sessionId === current && tracker.restoreComplete) {
      tracker.liveTeamIds = new Set(visibleLiveTeamIds);
    }
    if (visibleCount > 0) {
      setWasActive(true);
      if (shouldAutoExpand) {
        setOpenOwner(current);
        setOpen(true);
        setAutoOpened(true);
      }
      return;
    }
    if (!wasActive)
      return;
    const timer = setTimeout(() => {
      setOpen(false);
      setOpenOwner(void 0);
      setWasActive(false);
      setAutoOpened(false);
    }, AUTOCLOSE_GRACE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [visibleCount, visibleLiveTeamKey, autoOpened, wasActive, current]);
  const busy = (0, import_react4.useMemo)(() => visibleTeams.some((team) => team.members.some((member) => member.activity === "working")), [visibleTeams]);
  const hasTeams = visibleCount > 0;
  const panelGeometryForGesture = (0, import_react4.useCallback)(() => {
    const measuredHeight = panelRef.current?.getBoundingClientRect().height;
    if (measuredHeight === void 0 || measuredHeight <= 0)
      return geometry;
    return { ...geometry, height: measuredHeight };
  }, [geometry]);
  const flushScheduledLayout = (0, import_react4.useCallback)(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const pending = pendingLayoutRef.current;
    pendingLayoutRef.current = null;
    if (pending !== null)
      commitLayout(pending);
  }, [commitLayout]);
  const scheduleLayout = (0, import_react4.useCallback)((next) => {
    pendingLayoutRef.current = next;
    frameRef.current ?? (frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingLayoutRef.current;
      pendingLayoutRef.current = null;
      if (pending !== null)
        commitLayout(pending);
    }));
  }, [commitLayout]);
  (0, import_react4.useEffect)(() => () => {
    if (frameRef.current !== null)
      cancelAnimationFrame(frameRef.current);
  }, []);
  const beginMove = (0, import_react4.useCallback)((event) => {
    if (compact || event.button !== 0 || event.target.closest("button") !== null)
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      start: panelGeometryForGesture(),
      activated: false
    };
  }, [compact, panelGeometryForGesture]);
  const beginResize = (0, import_react4.useCallback)((edge, event) => {
    if (compact || event.button !== 0 || geometry.mode === "docked" && edge !== "left")
      return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureRef.current = {
      kind: "resize",
      edge,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      start: panelGeometryForGesture(),
      activated: true
    };
    setInteraction("resizing");
  }, [compact, geometry.mode, panelGeometryForGesture]);
  const updateGesture = (0, import_react4.useCallback)((event) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId || !event.currentTarget.hasPointerCapture(event.pointerId))
      return;
    const dx = event.clientX - gesture.originX;
    const dy = event.clientY - gesture.originY;
    const activeBounds = boundsRef.current;
    if (gesture.kind === "move") {
      if (!gesture.activated && Math.hypot(dx, dy) < MOVE_THRESHOLD)
        return;
      if (!gesture.activated) {
        gesture.activated = true;
        setInteraction("dragging");
      }
      scheduleLayout(movePanelLayout(floatPanelLayout(gesture.start, activeBounds), dx, dy, activeBounds));
      return;
    }
    scheduleLayout(resizePanelLayout(gesture.start, gesture.edge ?? "left", dx, dy, activeBounds));
  }, [scheduleLayout]);
  const endGesture = (0, import_react4.useCallback)((event) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId)
      return;
    updateGesture(event);
    flushScheduledLayout();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gestureRef.current = null;
    setInteraction(null);
  }, [flushScheduledLayout, updateGesture]);
  const cancelGesture = (0, import_react4.useCallback)((event) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId)
      return;
    flushScheduledLayout();
    gestureRef.current = null;
    setInteraction(null);
  }, [flushScheduledLayout]);
  const toggleDock = (0, import_react4.useCallback)(() => {
    const liveGeometry = panelGeometryForGesture();
    commitLayout(liveGeometry.mode === "docked" ? floatPanelLayout(liveGeometry, boundsRef.current) : dockPanelLayout(liveGeometry, boundsRef.current));
  }, [commitLayout, panelGeometryForGesture]);
  const autoHeight = panelUsesAutoHeight(geometry, bounds);
  const panelStyle = {
    width: geometry.width,
    height: autoHeight ? "auto" : geometry.height,
    maxHeight: panelMaximumHeight(geometry, bounds),
    transform: `translate3d(${geometry.x}px, ${geometry.y}px, 0)`
  };
  if (!conversationVisible || !hasTeams && !expanded)
    return null;
  return (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [!expanded && (0, import_jsx_runtime5.jsx)(CollapsedBadge, { count: visibleCount, busy, t, onClick: () => {
    if (current === void 0)
      return;
    setOpenOwner(current);
    setOpen(true);
  } }), expanded && (0, import_jsx_runtime5.jsxs)("aside", { ref: panelRef, className: ActivityPanel_default.panel, style: panelStyle, "data-agent-teams-activity": true, "data-panel-mode": geometry.mode, "data-height-mode": autoHeight ? "auto" : "manual", "data-compact": compact || void 0, "data-dragging": interaction === "dragging" || void 0, "data-resizing": interaction === "resizing" || void 0, "aria-label": t("activity.panelAria"), children: [(0, import_jsx_runtime5.jsxs)("header", { className: ActivityPanel_default.panelHead, onPointerDown: beginMove, onPointerMove: updateGesture, onPointerUp: endGesture, onPointerCancel: cancelGesture, "data-drag-handle": !compact || void 0, children: [(0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.panelTitle, children: [t("activity.title"), (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.panelDot, "data-busy": busy, "aria-hidden": true })] }), (0, import_jsx_runtime5.jsxs)("span", { className: ActivityPanel_default.panelControls, children: [!compact && (0, import_jsx_runtime5.jsx)("button", { type: "button", className: ActivityPanel_default.iconButton, "data-control": "dock", "data-mode": geometry.mode, onClick: toggleDock, "aria-label": t(geometry.mode === "docked" ? "activity.float" : "activity.dockRight"), title: t(geometry.mode === "docked" ? "activity.float" : "activity.dockRight"), children: (0, import_jsx_runtime5.jsx)(IconPanelLeftOutline16, {}) }), (0, import_jsx_runtime5.jsx)("button", { type: "button", className: ActivityPanel_default.iconButton, "data-control": "collapse", onClick: () => {
    setOpen(false);
    setOpenOwner(void 0);
  }, "aria-label": t("activity.collapse"), title: t("activity.collapse"), children: (0, import_jsx_runtime5.jsx)(IconChevronDownOutline14, {}) })] })] }), (0, import_jsx_runtime5.jsx)("div", { className: ActivityPanel_default.teams, children: visibleCount === 0 ? (0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.emptyHint, children: t("activity.empty") }) : (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [visibleTeams.map((team) => (0, import_jsx_runtime5.jsx)(TeamSection, { team, modelDirectory: resolveModelDirectory(modelDirectories, team.captainSessionId), onContinuePlanning: returnToComposer, onDiscarded: returnToComposer, onNavigate: navigateToSession, t }, team.teamId)), visibleArchived.map((team) => (0, import_jsx_runtime5.jsxs)("div", { "data-team-id": team.teamId, "data-historic": true, className: ActivityPanel_default.archivedWrap, children: [(0, import_jsx_runtime5.jsx)("span", { className: ActivityPanel_default.archiveLabel, children: t(team.phase === "staged" ? "archive.discardedLabel" : "archive.label") }), (0, import_jsx_runtime5.jsx)(TeamSection, { team, onNavigate: navigateToSession, t, historic: true })] }, `${team.captainSessionId}:${team.teamId}`)), visibleHistoric.map(({ data: team, owner }) => {
    const teamKey = `${owner}:${team.teamId}`;
    return (0, import_jsx_runtime5.jsx)(TeamSection, { team: historicCardTeam(team, owner), onNavigate: navigateToSession, t, historic: true }, teamKey);
  })] }) }), !compact && (0, import_jsx_runtime5.jsx)("div", { className: ActivityPanel_default.resizeHandle, "data-resize-edge": "left", onPointerDown: (event) => {
    beginResize("left", event);
  }, onPointerMove: updateGesture, onPointerUp: endGesture, onPointerCancel: cancelGesture, "aria-hidden": true }), !compact && geometry.mode === "floating" && (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [(0, import_jsx_runtime5.jsx)("div", { className: ActivityPanel_default.resizeHandle, "data-resize-edge": "bottom", onPointerDown: (event) => {
    beginResize("bottom", event);
  }, onPointerMove: updateGesture, onPointerUp: endGesture, onPointerCancel: cancelGesture, "aria-hidden": true }), (0, import_jsx_runtime5.jsx)("div", { className: ActivityPanel_default.resizeHandle, "data-resize-edge": "corner", onPointerDown: (event) => {
    beginResize("corner", event);
  }, onPointerMove: updateGesture, onPointerUp: endGesture, onPointerCancel: cancelGesture, "aria-hidden": true })] })] })] });
}

// lib/client/workspace-state.js
function createWorkspaceState() {
  let snapshot = { statuses: /* @__PURE__ */ new Map(), history: /* @__PURE__ */ new Map(), selected: /* @__PURE__ */ new Map() };
  const listeners = /* @__PURE__ */ new Set();
  const publish = (next) => {
    snapshot = next;
    for (const listener of listeners)
      listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    status(session, status) {
      if (snapshot.statuses.get(session) === status)
        return;
      publish({ ...snapshot, statuses: new Map(snapshot.statuses).set(session, status) });
    },
    select(session, team) {
      if (snapshot.selected.get(session) === team)
        return;
      publish({ ...snapshot, selected: new Map(snapshot.selected).set(session, team) });
    },
    remember(session, data) {
      const owner = data.captainSessionId || session;
      if (owner !== session)
        return;
      publish({
        ...snapshot,
        history: new Map(snapshot.history).set(`${owner}:${data.teamId}`, { ...data, captainSessionId: owner }),
        selected: new Map(snapshot.selected).set(owner, data.teamId)
      });
    }
  };
}
function createTeamDiscovery() {
  let restored = false;
  let known = /* @__PURE__ */ new Set();
  return (teams) => {
    const added = restored ? teams.find((team) => !known.has(team.teamId))?.teamId : void 0;
    known = new Set(teams.map((team) => team.teamId));
    restored = true;
    return added;
  };
}

// css-module:lib/client/WorkspaceActivity.module.css
var css3 = `.eDfHrq_root{--dsw-alias-state-business-primary:light-dark(#2866d7,#82b4ff);height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:color-mix(in srgb, var(--dsw-alias-bg-module-platform) 78%, var(--dsw-alias-bg-base));font-variant-numeric:tabular-nums;font-family:inherit;overflow:auto;container:eDfHrq_team-workspace/inline-size}.eDfHrq_content{max-width:none;margin:0 auto;padding:16px 14px 28px}.eDfHrq_heading{flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:20px;display:flex}.eDfHrq_heading img{object-fit:contain;width:32px;height:32px}.eDfHrq_heading h2{letter-spacing:-.4px;margin:0;font-size:17px;font-weight:650}.eDfHrq_heading>span{color:var(--dsw-alias-label-secondary);margin-left:auto;font-size:12px}.eDfHrq_selector{flex-wrap:wrap;gap:8px;margin-bottom:18px;display:flex}.eDfHrq_selector button{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);text-align:left;overflow-wrap:anywhere;border-radius:10px;align-items:center;gap:10px;max-width:100%;padding:10px 12px;font-size:12px;transition:background-color .14s,border-color .14s;display:flex}.eDfHrq_selector span{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-size:10px}.eDfHrq_selector button[aria-pressed=true]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, var(--dsw-alias-bg-layer-1));border-color:var(--dsw-alias-state-business-primary)}.eDfHrq_selector button:hover{border-color:var(--dsw-alias-state-business-primary)}.eDfHrq_root button{cursor:pointer;font-family:inherit}.eDfHrq_selector button,.eDfHrq_empty button,.eDfHrq_error button{color:inherit}.eDfHrq_root button:active{transform:scale(.98)}.eDfHrq_root button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:3px}.eDfHrq_empty{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:18px;padding:32px 24px}.eDfHrq_emptyMark{width:44px;height:44px;color:var(--dsw-alias-state-business-primary);background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent);border-radius:13px;place-items:center;font-size:26px;display:grid}.eDfHrq_empty h3{margin:20px 0 10px;font-size:16px;font-weight:600}.eDfHrq_empty p{max-width:45ch;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.8}.eDfHrq_empty button,.eDfHrq_error button{background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);border-radius:9px;padding:9px 13px;font-size:12px}.eDfHrq_empty button:hover,.eDfHrq_error button:hover{border-color:var(--dsw-alias-state-business-primary)}.eDfHrq_error{border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, var(--dsw-alias-border-l2));background:var(--dsw-alias-bg-layer-1);border-radius:12px;flex-wrap:wrap;align-items:start;gap:12px;margin-bottom:18px;padding:14px;font-size:12px;line-height:1.65;display:flex}.eDfHrq_error>span{flex:180px}.eDfHrq_error button{flex:none}.eDfHrq_skeleton{gap:14px;display:grid}.eDfHrq_skeleton i{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:16px;height:130px;animation:1.8s ease-in-out infinite alternate eDfHrq_breathe}.eDfHrq_skeleton i:first-child{height:74px}.eDfHrq_skeleton i:last-child{animation-delay:.3s}@keyframes eDfHrq_breathe{to{opacity:.45}}@container eDfHrq_team-workspace (width>=720px){.eDfHrq_content{padding:24px 24px 32px}.eDfHrq_heading{margin-bottom:24px}}@media (prefers-reduced-motion:reduce){.eDfHrq_skeleton i{animation:none}.eDfHrq_root button{transition:none}}`;
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = css3;
  document.head.appendChild(style);
}
var WorkspaceActivity_default = { "8": "8", "45": "45", "65": "65", "98": "98", "root": "eDfHrq_root", "content": "eDfHrq_content", "heading": "eDfHrq_heading", "4px": "4px", "selector": "eDfHrq_selector", "14s": "14s", "empty": "eDfHrq_empty", "error": "eDfHrq_error", "emptyMark": "eDfHrq_emptyMark", "skeleton": "eDfHrq_skeleton", "8s": "8s", "3s": "3s" };

// lib/client/WorkspaceActivity.js
var TEAM_TAB_KIND = "agent-teams";
var TEAM_TAB_ID = "@nanmicoder/dsh-agent-teams/activity";
function createWorkspaceBridge() {
  let sidebar;
  const listeners = /* @__PURE__ */ new Set();
  return {
    getSnapshot: () => sidebar,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set(value) {
      sidebar = value;
      for (const listener of listeners)
        listener();
    }
  };
}
function ActivitySurface({ bridge, state, ...props }) {
  const sidebar = (0, import_react5.useSyncExternalStore)(bridge.subscribe, bridge.getSnapshot);
  return sidebar === void 0 ? (0, import_jsx_runtime6.jsx)(ActivityPanel, { ...props }) : (0, import_jsx_runtime6.jsx)(WorkspaceMonitor, { ...props, sidebar, state });
}
function WorkspaceMonitor({ sessionsList, sidebar, state }) {
  const current = currentSessionId((0, import_react5.useSyncExternalStore)(sessionsList.subscribe, sessionsList.getSnapshot));
  const targets2 = (0, import_react5.useSyncExternalStore)(subscribeActivityMonitorTargets, getActivityMonitorTargetsSnapshot);
  const currentTargets = (0, import_react5.useMemo)(() => targets2.filter((target) => target.sessionId === current), [targets2, current]);
  const discover = (0, import_react5.useMemo)(() => createTeamDiscovery(), [current]);
  (0, import_react5.useEffect)(() => {
    if (current === void 0)
      return;
    state.status(current, "loading");
    const controller = startActivityPolling(currentTargets, {
      discoverySessionId: current,
      onStatus(status) {
        state.status(current, status);
      },
      publishSnapshots(update) {
        updateActivitySnapshots(update);
        if (update.teams === void 0)
          return;
        const added = discover(update.teams.filter((team) => team.captainSessionId === current));
        if (added !== void 0 && sidebar.mounted.getSnapshot() === current && !sidebar.isExpanded()) {
          state.select(current, added);
          sidebar.openTab(TEAM_TAB_KIND);
        }
      }
    });
    return () => {
      controller.stop();
    };
  }, [current, currentTargets, discover, sidebar, state]);
  (0, import_react5.useEffect)(() => {
    const open = (event) => {
      if (current === void 0 || sidebar.mounted.getSnapshot() !== current)
        return;
      const data = event.detail;
      if (data?.captainSessionId && data.captainSessionId !== current)
        return;
      if (data?.teamId)
        state.remember(current, data);
      sidebar.openTab(TEAM_TAB_KIND);
    };
    window.addEventListener(OPEN_PANEL_EVENT, open);
    return () => {
      window.removeEventListener(OPEN_PANEL_EVENT, open);
    };
  }, [current, sidebar, state]);
  return null;
}
function WorkspaceActivity({ sessionId, useTabInfo, t, state, modelDirectories, openMember }) {
  const { tab } = useTabInfo();
  const snapshots = (0, import_react5.useSyncExternalStore)(subscribeActivitySnapshots, getActivitySnapshotsSnapshot);
  const local = (0, import_react5.useSyncExternalStore)(state.subscribe, state.getSnapshot);
  const [retry, setRetry] = (0, import_react5.useState)(0);
  const live = snapshots.teams.filter((team) => team.captainSessionId === sessionId);
  const archived = snapshots.archivedTeams.filter((team) => team.captainSessionId === sessionId && !live.some((item) => item.teamId === team.teamId));
  const historic = [...local.history.values()].filter((team) => team.captainSessionId === sessionId && !live.some((item) => item.teamId === team.teamId) && !archived.some((item) => item.teamId === team.teamId)).map((team) => historicCardTeam(team, sessionId));
  const records = [...live, ...archived, ...historic];
  const selected = records.find((team) => team.teamId === local.selected.get(sessionId)) ?? records[0];
  const history = selected !== void 0 && !live.includes(selected);
  const status = local.statuses.get(sessionId) ?? "loading";
  (0, import_react5.useEffect)(() => {
    if (retry === 0 || !tab.visible)
      return;
    const controller = startActivityPolling([], { discoverySessionId: sessionId, onStatus: (value) => state.status(sessionId, value) });
    void controller.firstTick.finally(() => {
      controller.stop();
    });
    return () => {
      controller.stop();
    };
  }, [retry, sessionId, state, tab.visible]);
  const backToChat = () => {
    tab.actions.close();
    requestAnimationFrame(() => document.querySelector('[data-composer-card] [contenteditable="true"][role="textbox"], [data-composer-card] textarea')?.focus());
  };
  return (0, import_jsx_runtime6.jsx)("div", { className: WorkspaceActivity_default.root, "data-agent-teams-workspace": true, "data-session-id": sessionId, children: (0, import_jsx_runtime6.jsxs)("div", { className: WorkspaceActivity_default.content, children: [(0, import_jsx_runtime6.jsxs)("header", { className: WorkspaceActivity_default.heading, children: [(0, import_jsx_runtime6.jsx)("img", { src: LEAD_ART, alt: "", "aria-hidden": true }), (0, import_jsx_runtime6.jsx)("h2", { children: "AgentTeams" }), (0, import_jsx_runtime6.jsx)("span", { children: t("workspace.title") })] }), status === "error" && (0, import_jsx_runtime6.jsxs)("div", { className: WorkspaceActivity_default.error, role: "alert", children: [(0, import_jsx_runtime6.jsx)("span", { children: t("workspace.error") }), (0, import_jsx_runtime6.jsx)("button", { onClick: () => setRetry((value) => value + 1), children: t("workspace.retry") })] }), records.length > 1 && (0, import_jsx_runtime6.jsx)("nav", { className: WorkspaceActivity_default.selector, "aria-label": t("workspace.title"), children: records.map((team) => (0, import_jsx_runtime6.jsxs)("button", { "aria-pressed": selected?.teamId === team.teamId, onClick: () => state.select(sessionId, team.teamId), children: [team.name, (0, import_jsx_runtime6.jsx)("span", { children: t(live.includes(team) ? "workspace.current" : "workspace.history") })] }, team.teamId)) }), selected === void 0 ? status === "loading" ? (0, import_jsx_runtime6.jsxs)("div", { className: WorkspaceActivity_default.skeleton, role: "status", "aria-label": t("workspace.loading"), children: [(0, import_jsx_runtime6.jsx)("i", {}), (0, import_jsx_runtime6.jsx)("i", {}), (0, import_jsx_runtime6.jsx)("i", {})] }) : (0, import_jsx_runtime6.jsxs)("section", { className: WorkspaceActivity_default.empty, children: [(0, import_jsx_runtime6.jsx)("span", { className: WorkspaceActivity_default.emptyMark, "aria-hidden": true, children: "\u21B3" }), (0, import_jsx_runtime6.jsx)("h3", { children: t("workspace.emptyTitle") }), (0, import_jsx_runtime6.jsx)("p", { children: t("workspace.emptyBody") }), (0, import_jsx_runtime6.jsx)("button", { onClick: backToChat, children: t("workspace.back") })] }) : (0, import_jsx_runtime6.jsx)(import_jsx_runtime6.Fragment, { children: (0, import_jsx_runtime6.jsx)(TeamSection, { team: selected, workspace: true, historic: history, modelDirectory: resolveModelDirectory(modelDirectories, sessionId), onContinuePlanning: backToChat, onDiscarded: backToChat, onNavigate: openMember, t }, `${sessionId}:${selected.teamId}`) })] }) });
}

// lib/client/TeamChatEntry.js
var import_jsx_runtime7 = require("react/jsx-runtime");
var import_react6 = require("react");

// lib/client/agent-teams-card-definition.js
function teamKeyFromName(name) {
  const cleaned = name.normalize("NFC").trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return cleaned === "" ? "team" : cleaned;
}
function parseAgentTeamsCreateArgs(value) {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || !("name" in parsed) || typeof parsed.name !== "string") {
      return void 0;
    }
    const name = parsed.name.trim();
    if (name === "")
      return void 0;
    return { teamId: teamKeyFromName(name), name };
  } catch {
    return void 0;
  }
}
function parseAgentTeamsCreateResult(meta) {
  if (typeof meta !== "object" || meta === null)
    return void 0;
  const record = meta;
  const teamId = typeof record.team_id === "string" ? record.team_id.trim() : "";
  if (teamId === "")
    return void 0;
  const captainSessionId = typeof record.captain_session_id === "string" ? record.captain_session_id.trim() : "";
  const members = [];
  if (Array.isArray(record.members)) {
    for (const entry of record.members) {
      if (typeof entry !== "object" || entry === null)
        continue;
      const member = entry;
      const name = typeof member.name === "string" ? member.name : "";
      if (name === "")
        continue;
      members.push({
        id: typeof member.id === "string" ? member.id : "",
        name,
        role: typeof member.role === "string" ? member.role : ""
      });
    }
  }
  return { teamId, captainSessionId, members };
}
function teamIdFromCreateResultText(text) {
  const created = [...text.matchAll(/" created \(id ([^()\s]+)\) under /gu)].at(-1)?.[1];
  if (created !== void 0 && created !== "")
    return created;
  const stagedPath = [...text.matchAll(/plan created under (.+?)\. It is staged: /gu)].at(-1)?.[1];
  if (stagedPath === void 0)
    return void 0;
  const segment = stagedPath.split(/[\\/]/u).filter((part) => part !== "").at(-1);
  return segment === void 0 || segment === "" ? void 0 : segment;
}
var agentTeamsCardDefinition = {
  kind: "agent-teams",
  target: "chat",
  match: (event) => {
    if (event.type === "tool/call" && event.data.name === "agent_teams_create") {
      return parseAgentTeamsCreateArgs(event.data.arguments) === void 0 ? null : { id: String(event.data.callId), role: "start" };
    }
    if (event.type === "tool/result" && event.data.message.source.kind === "tool") {
      return { id: String(event.data.message.source.callId), role: "update" };
    }
    return null;
  },
  start: (_context, match) => {
    if (match.event.type !== "tool/call") {
      throw new Error("agent-teams card start requires agent_teams_create tool/call");
    }
    const parsed = parseAgentTeamsCreateArgs(match.event.data.arguments);
    if (parsed === void 0)
      throw new Error("agent-teams card start requires valid create arguments");
    return { ...parsed, accepted: false, captainSessionId: "", members: [] };
  },
  update: (context, match) => {
    if (match.event.type !== "tool/result")
      return context.state;
    const failed = match.event.data.error !== void 0 || toolResultFailed(match.event.data.message);
    if (failed)
      return context.state;
    const canonical = parseAgentTeamsCreateResult(match.event.data.meta);
    const legacyId = canonical === void 0 ? teamIdFromCreateResultText(resultText(match.event.data.message)) : void 0;
    if (canonical === void 0 && legacyId === void 0)
      return { ...context.state, accepted: true };
    return {
      ...context.state,
      accepted: true,
      teamId: canonical?.teamId ?? legacyId ?? context.state.teamId,
      captainSessionId: canonical?.captainSessionId ?? "",
      members: canonical?.members ?? []
    };
  },
  buildViewNode: (context) => {
    if (context.start === void 0)
      return null;
    const state = context.state;
    if (!state.accepted)
      return null;
    return {
      key: context.key,
      kind: "agent-teams",
      id: context.id,
      target: "chat",
      anchorSeq: context.start.event.seq,
      location: context.start.location,
      visibility: "visible",
      data: {
        teamId: state.teamId,
        captainSessionId: state.captainSessionId,
        teamName: state.name,
        members: state.members
      }
    };
  }
};
function resultText(message) {
  return message.content.filter((block) => typeof block === "object" && block !== null && "type" in block && block.type === "text" && "text" in block && typeof block.text === "string").map((block) => block.text).join("\n");
}
function toolResultFailed(message) {
  return message.isError === true || message.content.some((block) => typeof block === "object" && block !== null && "type" in block && block.type === "tool-result" && "isError" in block && block.isError === true);
}
function teamCardsForTurn(nodes, turn) {
  return [...nodes].filter((node) => node.kind === "agent-teams" && (node.location.kind === "turn" || node.location.kind === "step") && node.location.turn.turn === turn);
}

// lib/client/TeamChatEntry.js
function TeamChatEntry({ sessionId, t }) {
  const { teams, archivedTeams } = (0, import_react6.useSyncExternalStore)(subscribeActivitySnapshots, getActivitySnapshotsSnapshot);
  const team = [...teams, ...archivedTeams].find((team2) => team2.captainSessionId === sessionId);
  if (!team)
    return null;
  return (0, import_jsx_runtime7.jsxs)("button", { className: AgentTeamsCard_default.chatEntry, "data-team-chat-entry": true, type: "button", title: t("workspace.focus"), onClick: () => openActivityPanel({ teamId: team.teamId, captainSessionId: sessionId, teamName: team.name, members: team.members }), children: [(0, import_jsx_runtime7.jsx)("img", { src: LEAD_ART, alt: "", "aria-hidden": true }), t("workspace.focus")] });
}
function TeamTurnCard({ sessionId, turn, useChat, t, openMember }) {
  const nodes = useChat((snapshot) => snapshot.nodes);
  const cards = teamCardsForTurn(nodes.values(), turn.turn);
  if (turn.status !== "closed" || cards.length === 0)
    return null;
  return (0, import_jsx_runtime7.jsx)("div", { className: AgentTeamsCard_default.turnCards, "data-team-turn-cards": true, children: cards.map((node) => (0, import_jsx_runtime7.jsx)(AgentTeamsSummary, { data: node.data, sessionId, t, openMember }, node.key)) });
}

// lib/client/locales.js
var AGENT_TEAMS_LOCALE_NAMESPACE = "agentTeams";
var zh = {
  "workspace.dependencies": "\u4ECE\u5DE6\u5230\u53F3\uFF1A\u5B8C\u6210\u524D\u7F6E\u540E\u89E3\u9501 \xB7 \u70B9\u51FB\u67E5\u770B\u8BE6\u60C5",
  "workspace.title": "\u56E2\u961F\u534F\u4F5C",
  "workspace.guide": "\u67E5\u770B\u6210\u5458\u5206\u5DE5\u3001\u4EFB\u52A1\u4F9D\u8D56\u4E0E\u6267\u884C\u8FDB\u5EA6",
  "workspace.eyebrow": "AGENT TEAMS",
  "workspace.description": "\u961F\u957F\u7EDF\u7B79\u5206\u5DE5\uFF0C\u6210\u5458\u6309\u4EFB\u52A1\u4F9D\u8D56\u5E76\u884C\u534F\u4F5C\u3002",
  "workspace.relationships": "\u961F\u957F\u534F\u8C03\u6210\u5458\u5206\u5DE5\uFF1B\u4EFB\u52A1\u8FDE\u7EBF\u8868\u793A\u524D\u7F6E\u4F9D\u8D56\u3002\u70B9\u51FB\u4EFB\u52A1\u53EF\u5B9A\u4F4D\u8D1F\u8D23\u6210\u5458\u3002",
  "workspace.emptyTitle": "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u56E2\u961F",
  "workspace.emptyBody": "\u5728\u804A\u5929\u4E2D\u4F7F\u7528 /agent-teams \u63CF\u8FF0\u76EE\u6807\uFF0C\u786E\u8BA4\u8BA1\u5212\u540E\u5373\u53EF\u5728\u8FD9\u91CC\u67E5\u770B\u534F\u4F5C\u8FDB\u5EA6\u3002",
  "workspace.loading": "\u6B63\u5728\u8BFB\u53D6\u56E2\u961F\u72B6\u6001",
  "workspace.error": "\u6682\u65F6\u65E0\u6CD5\u8FDE\u63A5\u56E2\u961F\u670D\u52A1\uFF0C\u6B63\u5728\u81EA\u52A8\u91CD\u8BD5\u3002\u5DF2\u52A0\u8F7D\u7684\u72B6\u6001\u53EF\u80FD\u4E0D\u662F\u6700\u65B0\u3002",
  "workspace.retry": "\u91CD\u65B0\u8FDE\u63A5",
  "workspace.current": "\u5F53\u524D\u56E2\u961F",
  "workspace.history": "\u5386\u53F2\u8BB0\u5F55",
  "workspace.back": "\u8FD4\u56DE\u5BF9\u8BDD",
  "workspace.tasks": "\u9879\u4EFB\u52A1",
  "workspace.members": "\u540D\u6210\u5458",
  "workspace.completed": "\u5DF2\u5B8C\u6210",
  "workspace.focus": "\u67E5\u770B\u56E2\u961F",
  "workspace.noTasks": "\u7B49\u5F85\u961F\u957F\u62C6\u89E3\u4EFB\u52A1",
  "workspace.inbox": "\u961F\u957F\u6536\u4EF6\u7BB1",
  "workspace.inboxHint": "\u6700\u8FD1 5 \u6761\u672A\u8BFB\u6D88\u606F",
  "workspace.inboxEmpty": "\u6682\u65E0\u672A\u8BFB\u6D88\u606F\u3002\u6210\u5458\u56DE\u62A5\u4F1A\u5728\u8FD9\u91CC\u663E\u793A\uFF0C\u961F\u957F\u8BFB\u53D6\u540E\u79FB\u51FA\u3002",
  "workspace.taskSummary": "\u4EFB\u52A1\u5B8C\u6210\u60C5\u51B5",
  "workspace.verdictStale": "\u7ED3\u8BBA\u5DF2\u8FC7\u671F",
  "card.memberCount": "{count} \u540D\u6210\u5458",
  "action.openActivityPanel": "\u6253\u5F00\u6D3B\u52A8\u9762\u677F",
  "activity.panelButton": "\u6D3B\u52A8\u9762\u677F",
  "activity.badgeAria": "AgentTeams \u6D3B\u52A8\u4E0E\u5386\u53F2\uFF0C{count} \u6761\u56E2\u961F\u8BB0\u5F55",
  "activity.panelAria": "AgentTeams \u6D3B\u52A8\u9762\u677F",
  "activity.title": "AgentTeams \u6D3B\u52A8",
  "activity.float": "\u5207\u6362\u4E3A\u6D6E\u52A8\u9762\u677F",
  "activity.dockRight": "\u505C\u9760\u5230\u53F3\u4FA7",
  "activity.collapse": "\u6536\u8D77\u6D3B\u52A8\u9762\u677F",
  "activity.empty": "\u6682\u65E0\u56E2\u961F\u6D3B\u52A8",
  "team.stop": "\u505C\u6B62\u56E2\u961F",
  "team.stopped": "\u5DF2\u505C\u6B62",
  "team.stopTitle": "\u786E\u8BA4\u505C\u6B62\u201C{team}\u201D\uFF1F",
  "team.stopDescription": "\u5C06\u53D6\u6D88 {tasks} \u9879\u672A\u5B8C\u6210\u4EFB\u52A1\uFF0C\u5E76\u505C\u6B62 {members} \u540D\u6B63\u5728\u5DE5\u4F5C\u7684\u6210\u5458\u3002\u5DF2\u5B8C\u6210\u7684\u7ED3\u679C\u4F1A\u4FDD\u7559\u3002",
  "team.stopCancel": "\u7EE7\u7EED\u8FD0\u884C",
  "team.stopConfirm": "\u786E\u8BA4\u505C\u6B62",
  "team.stopping": "\u6B63\u5728\u505C\u6B62\u2026",
  "team.stopFailed": "\u505C\u6B62\u5931\u8D25\uFF1A{message}",
  "team.stopRequestFailed": "\u670D\u52A1\u5668\u672A\u80FD\u505C\u6B62\u56E2\u961F\uFF0C\u8BF7\u91CD\u8BD5",
  "team.discarded": "\u5DF2\u653E\u5F03",
  "format.listSeparator": "\u3001",
  "task.status.pending": "\u5F85\u9886\u53D6",
  "task.status.claimed": "\u5DF2\u8BA4\u9886",
  "task.status.inProgress": "\u8FDB\u884C\u4E2D",
  "task.status.completed": "\u5DF2\u5B8C\u6210",
  "task.status.failed": "\u5931\u8D25",
  "task.status.cancelled": "\u5DF2\u53D6\u6D88",
  "task.status.notRun": "\u672A\u6267\u884C",
  "member.state.working": "\u5DE5\u4F5C\u4E2D",
  "member.state.failed": "\u6709\u5931\u8D25",
  "member.state.waiting": "\u7B49\u5F85",
  "member.state.delivered": "\u5DF2\u4EA4\u4ED8",
  "member.state.left": "\u5DF2\u79BB\u961F",
  "member.state.removed": "\u5DF2\u79FB\u9664",
  "member.state.pending": "\u5F85\u6267\u884C",
  "member.state.unassigned": "\u5F85\u6D3E\u5DE5",
  "member.state.staged": "\u5F85\u521B\u5EFA",
  "member.state.notCreated": "\u672A\u521B\u5EFA",
  "member.state.stopped": "\u5DF2\u505C\u6B62",
  "member.status.executing": "\u6B63\u5728\u6267\u884C {taskId}",
  "member.status.executingModel": "\u6B63\u5728\u6267\u884C {taskId} \xB7 {model}",
  "member.status.working": "\u6B63\u5728\u5904\u7406\u5DF2\u6D3E\u4EFB\u52A1",
  "member.status.waitingOn": "\u7B49\u5F85 {taskId} \xB7 {assignee}",
  "member.status.waitingPrerequisite": "\u7B49\u5F85\u524D\u7F6E\u4EFB\u52A1",
  "member.status.waitingAssignment": "\u7B49\u5F85\u961F\u957F\u6D3E\u5DE5",
  "member.status.delivered": "\u4EFB\u52A1\u5DF2\u4EA4\u4ED8",
  "member.status.idle": "\u5F85\u7EE7\u7EED\u6267\u884C",
  "member.status.unknown": "\u72B6\u6001\u672A\u77E5",
  "member.status.staged": "\u786E\u8BA4\u540E\u521B\u5EFA\u5E76\u542F\u52A8",
  "member.status.settled": "\u4EFB\u52A1\u5747\u5DF2\u7EC8\u7ED3",
  "member.status.discarded": "\u8BA1\u5212\u5DF2\u653E\u5F03\uFF0C\u672A\u521B\u5EFA",
  "member.status.stopped": "\u56E2\u961F\u5DF2\u505C\u6B62\uFF0C\u9700\u663E\u5F0F\u6062\u590D",
  "task.assignee.unclaimed": "\u5F85\u8BA4\u9886",
  "task.summary.waitingBreakdown": "\u7B49\u5F85\u961F\u957F\u62C6\u89E3\u4EFB\u52A1",
  "task.summary.staged": "{count} \u9879\u8BA1\u5212\u7B49\u5F85\u786E\u8BA4",
  "task.summary.discarded": "{count} \u9879\u8BA1\u5212\u5DF2\u653E\u5F03\uFF0C\u5747\u672A\u6267\u884C",
  "task.summary.allDelivered": "\u5168\u90E8 {count} \u9879\u4EFB\u52A1\u5DF2\u4EA4\u4ED8",
  "task.summary.ended": "\u7EC8\u6001\uFF1A{completed} \u5DF2\u4EA4\u4ED8 \xB7 {cancelled} \u5DF2\u53D6\u6D88 \xB7 {failed} \u5931\u8D25",
  "task.summary.blockedAndRunning": "{tasks}{more} \u7B49\u5F85\u524D\u7F6E\uFF0C\u5176\u4F59\u5DF2\u5F00\u5DE5",
  "task.summary.more": " \u7B49 {count} \u9879",
  "task.summary.running": "{tasks} \u6B63\u5728\u6267\u884C",
  "task.summary.claimed": "\u5DF2\u8BA4\u9886\uFF1A{tasks}",
  "task.summary.ready": "{tasks} \u5DF2\u5C31\u7EEA\u5F85\u5F00\u5DE5",
  "task.summary.blocked": "{tasks} \u7B49\u5F85\u524D\u7F6E",
  "task.summary.failedSettled": "{count} \u9879\u5DF2\u5931\u8D25\uFF0C\u81EA\u52A8\u5FAA\u73AF\u5DF2\u505C\u6B62",
  "task.summary.waitingSchedule": "\u7B49\u5F85\u4E0B\u4E00\u8F6E\u8C03\u5EA6",
  "progress.aria": "\u56E2\u961F\u603B\u8FDB\u5EA6",
  "progress.title": "\u603B\u8FDB\u5EA6",
  "progress.running": "\u25A0 \u8FDB\u884C\u4E2D {count}",
  "progress.claimed": "\u25A0 \u5DF2\u8BA4\u9886 {count}",
  "progress.blocked": "\u25A0 \u7B49\u5F85\u4F9D\u8D56 {count}",
  "progress.delivered": "\u25A0 \u5DF2\u4EA4\u4ED8 {count}",
  "dependency.aria": "\u4EFB\u52A1\u4F9D\u8D56\u94FE",
  "dependency.parallel": "\u5E76\u884C\u4EFB\u52A1",
  "dependency.title": "\u4EFB\u52A1\u4F9D\u8D56",
  "dependency.hint.parallel": "\u65E0\u524D\u540E\u4F9D\u8D56 \xB7 \u70B9\u51FB\u67E5\u770B\u8BE6\u60C5",
  "dependency.hint.chain": "\u60AC\u505C\u9AD8\u4EAE\u4F9D\u8D56\u94FE \xB7 \u70B9\u51FB\u56FA\u5B9A",
  "dependency.hint.pinned": "{taskId} \u5DF2\u56FA\u5B9A \xB7 Esc \u53D6\u6D88",
  "task.runningAria": "\u8FD0\u884C\u4E2D",
  "task.model": "{model}",
  "task.detail.cancelled": "\u4EFB\u52A1\u5DF2\u53D6\u6D88\uFF0C\u4E0D\u4F1A\u7EE7\u7EED\u6267\u884C",
  "task.detail.failed": "\u4EFB\u52A1\u5931\u8D25\uFF0C\u7B49\u5F85\u660E\u786E\u91CD\u8BD5",
  "task.detail.completed": "\u5DF2\u5B8C\u6210\u5E76\u4EA4\u4ED8",
  "task.detail.noPrerequisite": "\u65E0\u524D\u7F6E\uFF0C\u53EF\u7ACB\u5373\u5F00\u5DE5",
  "task.detail.ready": "\u524D\u7F6E\u5DF2\u5C31\u7EEA\uFF0C\u53EF\u5F00\u5DE5",
  "task.detail.waitingOn": "\u7B49\u5F85 {tasks}",
  "task.detail.notRun": "\u8BA1\u5212\u5DF2\u653E\u5F03\uFF0C\u4EFB\u52A1\u672A\u6267\u884C",
  "task.detail.noDownstream": "\u65E0\u4E0B\u6E38\u4EFB\u52A1",
  "task.detail.unlocks": "\u5B8C\u6210\u540E\u89E3\u9501 {tasks}",
  "team.ended": "\u5DF2\u7ED3\u675F",
  "plan.badge": "\u5F85\u786E\u8BA4",
  "plan.title": "\u6267\u884C\u524D\u8BA1\u5212\u5BA1\u67E5",
  "plan.description": "\u6210\u5458\u5C1A\u672A\u521B\u5EFA\u3001\u4EFB\u52A1\u5C1A\u672A\u8C03\u5EA6\u3002\u53EF\u76F4\u63A5\u8C03\u6574\u8BA1\u5212\uFF0C\u4E5F\u53EF\u8FD4\u56DE\u5BF9\u8BDD\u544A\u8BC9\u961F\u957F\u54EA\u91CC\u9700\u8981\u4FEE\u6539\u3002",
  "plan.member.role": "\u89D2\u8272",
  "plan.member.provider": "Provider",
  "plan.member.model": "\u6A21\u578B",
  "plan.member.reasoning": "\u63A8\u7406\u7B49\u7EA7",
  "plan.member.reasoningHint": "\u7559\u7A7A\u4F7F\u7528\u9ED8\u8BA4\u503C\uFF1B\u53EF\u7528 low\u3001medium\u3001high\u3001xhigh \u7B49",
  "plan.model.choose": "\u9009\u62E9\u6A21\u578B",
  "plan.model.currentUnavailable": "{provider}/{model}\uFF08\u5F53\u524D\u76EE\u5F55\u4E0D\u53EF\u7528\uFF09",
  "plan.model.route": "\u8DEF\u7531\uFF1A{provider}/{model}",
  "plan.model.defaultReasoning": "\u9ED8\u8BA4\u63A8\u7406\u7B49\u7EA7",
  "plan.model.providerDefault": "Provider \u9ED8\u8BA4\u503C",
  "plan.model.modelDefault": "\u6A21\u578B\u9ED8\u8BA4\u503C\uFF08{effort}\uFF09",
  "plan.model.triggerAria": "\u9009\u62E9\u6210\u5458\u6A21\u578B\uFF0C\u5F53\u524D {model}\uFF0C\u63A8\u7406\u7B49\u7EA7 {effort}",
  "plan.model.back": "\u8FD4\u56DE",
  "plan.model.loading": "\u6B63\u5728\u52A0\u8F7D\u6A21\u578B\u2026",
  "plan.model.empty": "\u6682\u65E0\u53EF\u7528\u6A21\u578B",
  "plan.model.partialFailure": "{count} \u4E2A Provider \u7684\u6A21\u578B\u76EE\u5F55\u52A0\u8F7D\u5931\u8D25",
  "plan.model.retry": "\u91CD\u8BD5",
  "plan.member.prompt": "\u89D2\u8272\u63D0\u793A\u8BCD",
  "plan.member.roleFallback": "\u672A\u8BBE\u7F6E\u89D2\u8272",
  "plan.task.subject": "\u4EFB\u52A1\u540D\u79F0",
  "plan.task.description": "\u4EFB\u52A1\u8BF4\u660E",
  "plan.task.assignee": "\u8D1F\u8D23\u4EBA",
  "plan.task.dependencies": "\u4F9D\u8D56\u4EFB\u52A1 ID\uFF08\u9017\u53F7\u5206\u9694\uFF09",
  "plan.task.dependenciesHint": "\u4F8B\u5982 task-1, task-2\uFF1B\u4E0D\u5F97\u5F62\u6210\u5FAA\u73AF\u4F9D\u8D56",
  "plan.task.unassigned": "\u5171\u4EAB\u4EFB\u52A1\u6C60",
  "plan.unsaved": "\u672A\u4FDD\u5B58",
  "plan.save": "\u4FDD\u5B58",
  "plan.saving": "\u4FDD\u5B58\u4E2D\u2026",
  "plan.remove": "\u5220\u9664",
  "plan.removed": "\u4EFB\u52A1\u5DF2\u5220\u9664",
  "plan.removeConfirm": "\u786E\u8BA4\u5220\u9664",
  "plan.removeWarning": "\u5220\u9664 {task} \u540E\u5C06\u91CD\u65B0\u8BA1\u7B97\u4F9D\u8D56\u5173\u7CFB\u3002",
  "plan.cancel": "\u53D6\u6D88",
  "plan.addTask": "\u6DFB\u52A0\u4EFB\u52A1",
  "plan.adding": "\u6DFB\u52A0\u4E2D\u2026",
  "plan.taskAdded": "\u4EFB\u52A1\u5DF2\u6DFB\u52A0",
  "plan.newTask": "\u65B0\u4EFB\u52A1\u540D\u79F0",
  "plan.newTaskLabel": "\u65B0\u589E\u8BA1\u5212\u4EFB\u52A1",
  "plan.readySummary": "{members} \u540D\u6210\u5458 \xB7 {tasks} \u9879\u4EFB\u52A1 \xB7 {links} \u6761\u4F9D\u8D56",
  "plan.flow.aria": "\u56E2\u961F\u542F\u52A8\u6D41\u7A0B",
  "plan.flow.review": "\u5BA1\u67E5\u8BA1\u5212",
  "plan.flow.spawn": "\u521B\u5EFA\u6210\u5458",
  "plan.flow.run": "\u5F00\u59CB\u6267\u884C",
  "plan.members.title": "\u6210\u5458\u4E0E\u6A21\u578B\u8DEF\u7531",
  "plan.members.count": "{count} \u540D\u6210\u5458",
  "plan.members.empty": "\u5C1A\u672A\u89C4\u5212\u6210\u5458",
  "plan.tasks.title": "\u4EFB\u52A1\u4E0E\u4F9D\u8D56",
  "plan.tasks.count": "{count} \u9879\u4EFB\u52A1 \xB7 {links} \u6761\u4F9D\u8D56",
  "plan.tasks.empty": "\u5C1A\u672A\u89C4\u5212\u4EFB\u52A1",
  "plan.dependencies.none": "\u65E0\u4F9D\u8D56",
  "plan.dependencies.count": "{count} \u6761\u4F9D\u8D56",
  "plan.approve": "\u786E\u8BA4\u5E76\u542F\u52A8\u56E2\u961F",
  "plan.approving": "\u6B63\u5728\u521B\u5EFA\u6210\u5458\u2026",
  "plan.approveTitle": "\u8BA1\u5212\u68C0\u67E5\u5B8C\u6BD5\uFF1F",
  "plan.approveHint": "\u786E\u8BA4\u540E\u5C06\u521B\u5EFA {members} \u540D\u6210\u5458\u5E76\u8C03\u5EA6 {tasks} \u9879\u4EFB\u52A1\u3002",
  "plan.approveConfirmTitle": "\u786E\u8BA4\u542F\u52A8\u6B64\u56E2\u961F",
  "plan.approveWarning": "\u542F\u52A8\u540E\u4E0D\u80FD\u518D\u5728\u6B64\u5904\u7F16\u8F91\u6210\u5458\u548C\u4F9D\u8D56\u3002",
  "plan.approveConfirm": "\u786E\u8BA4\u542F\u52A8",
  "plan.continue": "\u8FD4\u56DE\u5BF9\u8BDD\u4FEE\u6539",
  "plan.returnToChat": "\u56DE\u5230\u5BF9\u8BDD",
  "plan.feedbackTitle": "\u6B63\u5728\u7B49\u4F60\u8BF4\u660E\u4FEE\u6539\u65B9\u5411",
  "plan.feedbackHint": "\u961F\u957F\u4F1A\u5728\u5BF9\u8BDD\u4E2D\u8FFD\u95EE\uFF1B\u6536\u5230\u4F60\u7684\u56DE\u590D\u540E\uFF0C\u53EA\u4FEE\u6539\u8FD9\u4EFD\u8349\u6848\u5E76\u518D\u6B21\u7B49\u5F85\u786E\u8BA4\u3002",
  "plan.discard": "\u653E\u5F03\u672C\u6B21\u8BA1\u5212",
  "plan.discardConfirmTitle": "\u653E\u5F03\u672C\u6B21\u8BA1\u5212\uFF1F",
  "plan.discardWarning": "\u8BE5\u8BA1\u5212\u4F1A\u7ED3\u675F\u5E76\u5F52\u6863\uFF1B\u5C1A\u672A\u521B\u5EFA\u4EFB\u4F55\u6210\u5458\uFF0C\u4E5F\u4E0D\u4F1A\u6267\u884C\u4EFB\u52A1\u3002",
  "plan.discardConfirm": "\u786E\u8BA4\u653E\u5F03",
  "plan.discarding": "\u6B63\u5728\u653E\u5F03\u2026",
  "plan.pendingEdits": "\u8BF7\u5148\u4FDD\u5B58\u5F53\u524D\u4FEE\u6539\uFF0C\u518D\u542F\u52A8\u56E2\u961F\u3002",
  "plan.saved": "\u8BA1\u5212\u5DF2\u4FDD\u5B58",
  "plan.failed": "\u64CD\u4F5C\u5931\u8D25\uFF1A{message}",
  "team.stats.members": "{count} \u540D\u6210\u5458",
  "team.stats.completed": "{completed}/{total} \u5B8C\u6210",
  "team.stats.messages": "{count} \u6761\u6D88\u606F",
  "delegation.aria": "\u961F\u957F\u6D3E\u5DE5\u5173\u7CFB",
  "captain.name": "\u961F\u957F",
  "captain.role": "\u62C6\u89E3 \xB7 \u6D3E\u53D1 \xB7 \u6C47\u603B",
  "captain.summary": "\u5DF2\u6D3E\u53D1 {tasks} \u9879\u4EFB\u52A1\u7ED9 {members} \u540D\u6210\u5458",
  "captain.summary.staged": "\u5DF2\u89C4\u5212 {tasks} \u9879\u4EFB\u52A1\u4E0E {members} \u540D\u6210\u5458\uFF0C\u7B49\u5F85\u786E\u8BA4",
  "captain.summary.awaitingFeedback": "\u8349\u6848\u5DF2\u4FDD\u7559\uFF0C\u7B49\u5F85\u4F60\u5728\u5BF9\u8BDD\u4E2D\u8BF4\u660E\u4FEE\u6539\u65B9\u5411",
  "captain.summary.discarded": "\u8BA1\u5212\u5DF2\u653E\u5F03\uFF1A{members} \u540D\u6210\u5458\u672A\u521B\u5EFA\uFF0C{tasks} \u9879\u4EFB\u52A1\u672A\u6267\u884C",
  "captain.summary.withTakeover": "\u5DF2\u6D3E\u53D1 {tasks} \u9879\u7ED9\u6210\u5458 \xB7 \u961F\u957F\u63A5\u7BA1 {captainTasks}",
  "captain.state.working": "{count} \u4EBA\u6267\u884C\u4E2D",
  "captain.state.takeover": "\u6B63\u5728\u6267\u884C {tasks}",
  "captain.state.collected": "\u5DF2\u6536\u9F50",
  "captain.state.waiting": "\u7B49\u5F85\u56DE\u62A5",
  "captain.state.staged": "\u5F85\u786E\u8BA4",
  "captain.state.awaitingFeedback": "\u5F85\u53CD\u9988",
  "captain.state.discarded": "\u5DF2\u653E\u5F03",
  "captain.state.settled": "\u5DF2\u7EC8\u7ED3",
  "members.toggle": "{count} \u540D\u6210\u5458",
  "members.collapse": "\u6536\u8D77",
  "members.expand": "\u5C55\u5F00",
  "members.expandFinished": "\u5C55\u5F00\u5DF2\u7ED3\u675F\uFF08{count}\uFF09",
  "members.empty": "\u6682\u65E0\u6210\u5458\uFF0C\u7B49\u5F85\u961F\u957F\u7EC4\u5EFA\u56E2\u961F",
  "assignment.label": "\u961F\u957F\u6D3E\u53D1",
  "assignment.staged": "\u8BA1\u5212\u4EFB\u52A1",
  "assignment.discarded": "\u672A\u6267\u884C\u7684\u8BA1\u5212",
  "assignment.empty": "\u6682\u65E0\u4EFB\u52A1",
  "archive.label": "\u5DF2\u7ED3\u675F \xB7 \u5386\u53F2\u5F52\u6863",
  "archive.discardedLabel": "\u8BA1\u5212\u5DF2\u653E\u5F03 \xB7 \u5386\u53F2\u5F52\u6863",
  "member.route.title": "\u8DEF\u7EBF",
  "member.route.pair": "{current} \u2192 {next}",
  "member.route.override": "\u8986\u76D6\u6765\u6E90\uFF1A{source}",
  "member.route.saved": "\u8DEF\u7EBF\u5DF2\u4FDD\u5B58\uFF1B\u6210\u5458\u4E0B\u4E00\u6B65\u4F7F\u7528\u65B0\u8DEF\u7EBF",
  "member.route.failed": "\u6539\u8DEF\u7EBF\u5931\u8D25\uFF1A{message}",
  "member.route.none": "\u672A\u8BBE\u7F6E",
  "member.route.noCatalog": "\uFF08\u65E0\u6A21\u578B\u76EE\u5F55\uFF0C\u4EC5\u663E\u793A\u5F53\u524D\u8DEF\u7EBF\uFF09",
  "member.route.origin.override": "\u8986\u76D6",
  "member.route.origin.declared": "\u58F0\u660E",
  "member.route.origin.fallback": "\u964D\u7EA7",
  "member.route.origin.active": "\u5F53\u524D",
  "member.route.clear": "\u6062\u590D\u539F\u8DEF\u7EBF",
  "member.route.cleared": "\u5DF2\u6062\u590D\u539F\u8DEF\u7EBF\uFF1B\u6210\u5458\u4E0B\u4E00\u6B65\u4F7F\u7528\u58F0\u660E\u8DEF\u7EBF",
  "member.route.clearFailed": "\u6062\u590D\u539F\u8DEF\u7EBF\u5931\u8D25\uFF1A{message}",
  "member.route.origin.fallback-active": "\u964D\u7EA7\u4E2D",
  "member.route.fallback": "\u964D\u7EA7\uFF1A{route}",
  "member.route.fallbackClear": "\u6E05\u9664\u964D\u7EA7\u8DEF\u7EBF",
  "member.route.fallbackCleared": "\u5DF2\u6E05\u9664\u964D\u7EA7\u8DEF\u7EBF\uFF1B\u4E3B\u8DEF\u7EBF\u4E0D\u53D8",
  "member.route.fallbackClearFailed": "\u6E05\u9664\u964D\u7EA7\u8DEF\u7EBF\u5931\u8D25\uFF1A{message}",
  "member.failure.title": "\u63D0\u4F9B\u65B9\u6545\u969C",
  "addMember.toggle": "\u624B\u52A8\u6DFB\u52A0\u6210\u5458",
  "addMember.close": "\u6536\u8D77\u6DFB\u52A0\u8868\u5355",
  "addMember.title": "\u624B\u52A8\u6DFB\u52A0\u4E00\u540D\u6210\u5458",
  "addMember.name": "\u6210\u5458\u540D\u79F0",
  "addMember.role": "\u89D2\u8272",
  "addMember.route": "\u6A21\u578B\u8DEF\u7EBF\uFF08\u53EF\u9009\uFF09",
  "addMember.routeInherit": "\u7559\u7A7A\u5219\u7EE7\u627F\u961F\u957F\u8DEF\u7EBF",
  "addMember.noCatalog": "\uFF08\u65E0\u6A21\u578B\u76EE\u5F55\uFF0C\u7559\u7A7A\u7EE7\u627F\u961F\u957F\u8DEF\u7EBF\uFF09",
  "addMember.prompt": "\u6267\u884C\u63D0\u793A\uFF08\u53EF\u9009\uFF09",
  "addMember.toolPolicy": "\u5DE5\u5177\u7B56\u7565 id\uFF08\u53EF\u9009\uFF09",
  "addMember.toolPolicyHint": "\u7559\u7A7A\u4F7F\u7528\u9ED8\u8BA4\u5DE5\u5177\u96C6",
  "addMember.submit": "\u6DFB\u52A0\u6210\u5458",
  "addMember.saving": "\u6B63\u5728\u6DFB\u52A0\u2026",
  "addMember.addedNamed": "\u5DF2\u6DFB\u52A0\u6210\u5458 {name}",
  "addMember.failed": "\u6DFB\u52A0\u6210\u5458\u5931\u8D25\uFF1A{message}",
  "addMember.nameRequired": "\u8BF7\u586B\u5199\u6210\u5458\u540D\u79F0",
  "addMember.routeDefault": "\u5DF2\u81EA\u52A8\u9009\u62E9\u6A21\u578B\u76EE\u5F55\u4E2D\u7684\u6A21\u578B\uFF0C\u53EF\u968F\u65F6\u66F4\u6362",
  "addMember.routeUnavailable": "{route} \u4E0D\u5728\u5F53\u524D\u6A21\u578B\u5217\u8868\u4E2D\uFF0C\u63D0\u4EA4\u4F1A\u88AB\u62D2\u7EDD",
  "addMember.captainRouteOutside": "\u961F\u957F\u58F0\u660E\u7684\u8DEF\u7EBF {route} \u4E0D\u5728\u5F53\u524D\u6A21\u578B\u5217\u8868\u4E2D\uFF0C\u5DF2\u6539\u9009\u76EE\u5F55\u5185\u7684\u6A21\u578B",
  "addMember.catalogEmpty": "\uFF08\u6A21\u578B\u76EE\u5F55\u4E3A\u7A7A\uFF0C\u6682\u65F6\u65E0\u6CD5\u9009\u62E9\u8DEF\u7EBF\uFF09",
  "addMember.failedAction": "\u6DFB\u52A0\u6210\u5458\u5931\u8D25\u3002\u8BF7\u9009\u62E9\u5217\u8868\u4E2D\u7684\u6A21\u578B\u540E\u91CD\u8BD5"
};
var en = {
  "workspace.dependencies": "Left to right: prerequisites unlock tasks \xB7 Select for details",
  "workspace.title": "Team workspace",
  "workspace.guide": "Members, task dependencies, and execution progress",
  "workspace.eyebrow": "AGENT TEAMS",
  "workspace.description": "The captain coordinates. Members work in parallel as dependencies clear.",
  "workspace.relationships": "The captain coordinates members. Connections show task prerequisites. Select a task to locate its owner.",
  "workspace.emptyTitle": "No team in this conversation yet",
  "workspace.emptyBody": "Use /agent-teams in chat to describe your goal. Review the plan, then follow the team here.",
  "workspace.loading": "Loading team activity",
  "workspace.error": "The team service is unavailable. Retrying automatically; loaded activity may be out of date.",
  "workspace.retry": "Reconnect",
  "workspace.current": "Current team",
  "workspace.history": "History",
  "workspace.back": "Back to conversation",
  "workspace.tasks": "tasks",
  "workspace.members": "members",
  "workspace.completed": "completed",
  "workspace.focus": "View team",
  "workspace.noTasks": "Waiting for the captain to define tasks",
  "workspace.inbox": "Captain inbox",
  "workspace.inboxHint": "Up to 5 recent unread messages",
  "workspace.inboxEmpty": "No unread messages. Member reports appear here until the captain reads them.",
  "workspace.taskSummary": "Task completion summary",
  "workspace.verdictStale": "Verdict outdated",
  "card.memberCount": "{count} members",
  "action.openActivityPanel": "Open activity panel",
  "activity.panelButton": "Activity panel",
  "activity.badgeAria": "AgentTeams activity and history, {count} team records",
  "activity.panelAria": "AgentTeams activity panel",
  "activity.title": "AgentTeams activity",
  "activity.float": "Switch to floating panel",
  "activity.dockRight": "Dock to the right",
  "activity.collapse": "Collapse activity panel",
  "activity.empty": "No team activity",
  "team.stop": "Stop team",
  "team.stopped": "Stopped",
  "team.stopTitle": "Stop \u201C{team}\u201D?",
  "team.stopDescription": "This cancels {tasks} unfinished tasks and stops {members} working members. Completed results are kept.",
  "team.stopCancel": "Keep running",
  "team.stopConfirm": "Stop team",
  "team.stopping": "Stopping\u2026",
  "team.stopFailed": "Could not stop team: {message}",
  "team.stopRequestFailed": "The server could not stop this team. Try again.",
  "team.discarded": "Discarded",
  "format.listSeparator": ", ",
  "task.status.pending": "Unclaimed",
  "task.status.claimed": "Claimed",
  "task.status.inProgress": "In progress",
  "task.status.completed": "Completed",
  "task.status.failed": "Failed",
  "task.status.cancelled": "Cancelled",
  "task.status.notRun": "Not run",
  "member.state.working": "Working",
  "member.state.failed": "Has failures",
  "member.state.waiting": "Waiting",
  "member.state.delivered": "Delivered",
  "member.state.left": "Left team",
  "member.state.removed": "Removed",
  "member.state.pending": "Pending",
  "member.state.unassigned": "Awaiting assignment",
  "member.state.staged": "Not spawned",
  "member.state.notCreated": "Not created",
  "member.state.stopped": "Stopped",
  "member.status.executing": "Working on {taskId}",
  "member.status.executingModel": "Working on {taskId} \xB7 {model}",
  "member.status.working": "Working on assigned tasks",
  "member.status.waitingOn": "Waiting for {taskId} \xB7 {assignee}",
  "member.status.waitingPrerequisite": "Waiting for prerequisites",
  "member.status.waitingAssignment": "Waiting for the captain to assign work",
  "member.status.delivered": "Tasks delivered",
  "member.status.idle": "Ready to continue",
  "member.status.unknown": "Status unknown",
  "member.status.staged": "Will be spawned after approval",
  "member.status.settled": "All assigned work is settled",
  "member.status.discarded": "Plan discarded; member was not created",
  "member.status.stopped": "Team stopped; explicit resume required",
  "task.assignee.unclaimed": "Unclaimed",
  "task.summary.waitingBreakdown": "Waiting for the captain to break down the work",
  "task.summary.staged": "{count} planned tasks awaiting approval",
  "task.summary.discarded": "{count} planned tasks discarded; none ran",
  "task.summary.allDelivered": "All {count} tasks delivered",
  "task.summary.ended": "Final: {completed} delivered \xB7 {cancelled} cancelled \xB7 {failed} failed",
  "task.summary.blockedAndRunning": "{tasks}{more} waiting on prerequisites; other work has started",
  "task.summary.more": " and {count} more",
  "task.summary.running": "{tasks} in progress",
  "task.summary.claimed": "Claimed: {tasks}",
  "task.summary.ready": "{tasks} ready to start",
  "task.summary.blocked": "{tasks} waiting on prerequisites",
  "task.summary.failedSettled": "{count} failed; the automatic loop has stopped",
  "task.summary.waitingSchedule": "Waiting for the next scheduling round",
  "progress.aria": "Overall team progress",
  "progress.title": "Overall progress",
  "progress.running": "\u25A0 In progress {count}",
  "progress.claimed": "\u25A0 Claimed {count}",
  "progress.blocked": "\u25A0 Waiting {count}",
  "progress.delivered": "\u25A0 Delivered {count}",
  "dependency.aria": "Task dependency chain",
  "dependency.parallel": "Parallel tasks",
  "dependency.title": "Task dependencies",
  "dependency.hint.parallel": "No dependencies \xB7 Click for details",
  "dependency.hint.chain": "Hover to highlight dependencies \xB7 Click to pin",
  "dependency.hint.pinned": "{taskId} pinned \xB7 Esc to clear",
  "task.runningAria": "Running",
  "task.model": "{model}",
  "task.detail.cancelled": "Cancelled; execution will not continue",
  "task.detail.failed": "Failed; awaiting an explicit retry",
  "task.detail.completed": "Completed and delivered",
  "task.detail.noPrerequisite": "No prerequisites; ready to start",
  "task.detail.ready": "Prerequisites ready; can start",
  "task.detail.waitingOn": "Waiting for {tasks}",
  "task.detail.notRun": "Plan discarded; task was not run",
  "task.detail.noDownstream": "No downstream tasks",
  "task.detail.unlocks": "Unlocks {tasks} when complete",
  "team.ended": "Ended",
  "plan.badge": "Awaiting approval",
  "plan.title": "Pre-run plan review",
  "plan.description": "Members have not been spawned and tasks have not been scheduled. Edit the draft here, or return to chat and tell the Captain what should change.",
  "plan.member.role": "Role",
  "plan.member.provider": "Provider",
  "plan.member.model": "Model",
  "plan.member.reasoning": "Reasoning effort",
  "plan.member.reasoningHint": "Leave blank for default; accepts low, medium, high, xhigh, and more",
  "plan.model.choose": "Choose a model",
  "plan.model.currentUnavailable": "{provider}/{model} (not in the current catalog)",
  "plan.model.route": "Route: {provider}/{model}",
  "plan.model.defaultReasoning": "Default reasoning effort",
  "plan.model.providerDefault": "Provider default",
  "plan.model.modelDefault": "Model default ({effort})",
  "plan.model.triggerAria": "Choose member model, currently {model}, reasoning effort {effort}",
  "plan.model.back": "Back",
  "plan.model.loading": "Loading models\u2026",
  "plan.model.empty": "No models available",
  "plan.model.partialFailure": "{count} provider catalogs could not be loaded",
  "plan.model.retry": "Retry",
  "plan.member.prompt": "Role prompt",
  "plan.member.roleFallback": "Role not set",
  "plan.task.subject": "Task subject",
  "plan.task.description": "Task description",
  "plan.task.assignee": "Assignee",
  "plan.task.dependencies": "Dependency task IDs (comma-separated)",
  "plan.task.dependenciesHint": "For example task-1, task-2; cycles are rejected",
  "plan.task.unassigned": "Shared task pool",
  "plan.unsaved": "Unsaved",
  "plan.save": "Save",
  "plan.saving": "Saving\u2026",
  "plan.remove": "Remove",
  "plan.removed": "Task removed",
  "plan.removeConfirm": "Confirm remove",
  "plan.removeWarning": "Removing {task} will recalculate downstream dependencies.",
  "plan.cancel": "Cancel",
  "plan.addTask": "Add task",
  "plan.adding": "Adding\u2026",
  "plan.taskAdded": "Task added",
  "plan.newTask": "New task subject",
  "plan.newTaskLabel": "Add a planned task",
  "plan.readySummary": "{members} members \xB7 {tasks} tasks \xB7 {links} dependencies",
  "plan.flow.aria": "Team launch flow",
  "plan.flow.review": "Review plan",
  "plan.flow.spawn": "Create members",
  "plan.flow.run": "Start work",
  "plan.members.title": "Members & model routes",
  "plan.members.count": "{count} members",
  "plan.members.empty": "No members planned yet",
  "plan.tasks.title": "Tasks & dependencies",
  "plan.tasks.count": "{count} tasks \xB7 {links} dependencies",
  "plan.tasks.empty": "No tasks planned yet",
  "plan.dependencies.none": "No dependencies",
  "plan.dependencies.count": "{count} dependencies",
  "plan.approve": "Approve & Run",
  "plan.approving": "Creating members\u2026",
  "plan.approveTitle": "Plan ready?",
  "plan.approveHint": "Approval creates {members} members and schedules {tasks} tasks.",
  "plan.approveConfirmTitle": "Confirm team launch",
  "plan.approveWarning": "Member routes and dependencies cannot be edited here after launch.",
  "plan.approveConfirm": "Confirm launch",
  "plan.continue": "Return to chat & revise",
  "plan.returnToChat": "Return to chat",
  "plan.feedbackTitle": "Waiting for your revision direction",
  "plan.feedbackHint": "The Captain will ask in chat. After your reply, it will revise this draft and wait for approval again.",
  "plan.discard": "Discard this plan",
  "plan.discardConfirmTitle": "Discard this plan?",
  "plan.discardWarning": "The plan will end and be archived. No members have been spawned and no tasks will run.",
  "plan.discardConfirm": "Discard plan",
  "plan.discarding": "Discarding\u2026",
  "plan.pendingEdits": "Save the current edits before launching the team.",
  "plan.saved": "Plan saved",
  "plan.failed": "Operation failed: {message}",
  "team.stats.members": "{count} members",
  "team.stats.completed": "{completed}/{total} completed",
  "team.stats.messages": "{count} messages",
  "delegation.aria": "Captain delegation map",
  "captain.name": "Captain",
  "captain.role": "Break down \xB7 Delegate \xB7 Synthesize",
  "captain.summary": "Assigned {tasks} tasks to {members} members",
  "captain.summary.staged": "Planned {tasks} tasks and {members} members; awaiting approval",
  "captain.summary.awaitingFeedback": "Draft preserved; waiting for your revision direction in chat",
  "captain.summary.discarded": "Plan discarded: {members} members were not created and {tasks} tasks did not run",
  "captain.summary.withTakeover": "Assigned {tasks} to members \xB7 Captain owns {captainTasks}",
  "captain.state.working": "{count} active",
  "captain.state.takeover": "Working on {tasks}",
  "captain.state.collected": "All reports received",
  "captain.state.waiting": "Waiting for reports",
  "captain.state.staged": "Awaiting approval",
  "captain.state.awaitingFeedback": "Awaiting feedback",
  "captain.state.discarded": "Discarded",
  "captain.state.settled": "Settled",
  "members.toggle": "Members {count}",
  "members.collapse": "Collapse",
  "members.expand": "Expand",
  "members.expandFinished": "Show finished ({count})",
  "members.empty": "No members yet; waiting for the captain to assemble the team",
  "assignment.label": "Captain assigned",
  "assignment.staged": "Planned task",
  "assignment.discarded": "Plan not run",
  "assignment.empty": "No tasks",
  "archive.label": "Ended \xB7 Archived history",
  "archive.discardedLabel": "Plan discarded \xB7 Archived history",
  "member.route.title": "Route",
  "member.route.pair": "{current} \u2192 {next}",
  "member.route.override": "Override from {source}",
  "member.route.saved": "Route saved; the member uses it from the next step",
  "member.route.failed": "Route change failed: {message}",
  "member.route.none": "Not set",
  "member.route.noCatalog": "(no model catalog; showing the current route)",
  "member.route.origin.override": "override",
  "member.route.origin.declared": "declared",
  "member.route.origin.fallback": "fallback",
  "member.route.origin.active": "active",
  "member.route.clear": "Restore declared route",
  "member.route.cleared": "Declared route restored; the next step uses it",
  "member.route.clearFailed": "Restore failed: {message}",
  "member.route.origin.fallback-active": "fallback active",
  "member.route.fallback": "fallback: {route}",
  "member.route.fallbackClear": "Clear fallback",
  "member.route.fallbackCleared": "Fallback route cleared; the primary route is unchanged",
  "member.route.fallbackClearFailed": "Clear fallback failed: {message}",
  "member.failure.title": "Provider failure",
  "addMember.toggle": "Add member",
  "addMember.close": "Close the add-member form",
  "addMember.title": "Add one member manually",
  "addMember.name": "Member name",
  "addMember.role": "Role",
  "addMember.route": "Model route (optional)",
  "addMember.routeInherit": "Leave empty to inherit the captain route",
  "addMember.noCatalog": "(no model catalog; empty inherits the captain route)",
  "addMember.prompt": "Execution prompt (optional)",
  "addMember.toolPolicy": "Tool policy id (optional)",
  "addMember.toolPolicyHint": "Leave empty for the default tool set",
  "addMember.submit": "Add member",
  "addMember.saving": "Adding\u2026",
  "addMember.addedNamed": "Member {name} added",
  "addMember.failed": "Add member failed: {message}",
  "addMember.nameRequired": "Enter a member name",
  "addMember.routeDefault": "Picked from the catalog automatically; change it if needed",
  "addMember.routeUnavailable": "{route} is not in the current catalog; submitting will be rejected",
  "addMember.captainRouteOutside": "The captain declares {route}, which is not in the current catalog; a catalog model was chosen instead",
  "addMember.catalogEmpty": "(the catalog is empty, so no route can be chosen yet)",
  "addMember.failedAction": "Add member failed. Choose a model from the list and try again"
};

// lib/client/index.js
var inject = ["uiConversation", "slots", "sessions", "locale", "modelDirectories", "layout"];
var useLegacyPanelInfo = (select) => select({ activePanelId: null });
function HiddenAgentTeamsCommand() {
  return null;
}
function apply(ctx) {
  const bridge = createWorkspaceBridge();
  const state = createWorkspaceState();
  ctx.effect(() => ctx.locale.register(AGENT_TEAMS_LOCALE_NAMESPACE, { zh, en }), "agent-teams: dictionaries");
  const openMember = (parentId, childId) => {
    void openAgentTeamMember(ctx.sessions, parentId, childId, ctx.layout, ctx.get("uiWorkspace")).catch((error) => {
      console.warn(`agent-teams: failed to open member transcript ${childId}: ${String(error)}`);
    });
  };
  const Panel = ({ t, usePanelInfo }) => {
    const usePanel = usePanelInfo ?? useLegacyPanelInfo;
    const conversationVisible = usePanel((panel) => panel.activePanelId === null);
    return (0, import_jsx_runtime8.jsx)(ActivitySurface, { bridge, state, conversationVisible, sessionsList: ctx.sessions.list, modelDirectories: ctx.modelDirectories, openMember, t });
  };
  ctx.inject(["sidebarRight", "sidebarRightTabs"], (native) => {
    const t = native.locale.bind(AGENT_TEAMS_LOCALE_NAMESPACE);
    native.effect(() => native.sidebarRightTabs.register({
      id: TEAM_TAB_ID,
      kind: TEAM_TAB_KIND,
      title: () => t("workspace.title")
    }));
    native.slots.inject("conversation.session.header.actions", () => native.slots.register({
      name: "conversation.session.header.actions",
      id: "agent-teams-entry",
      order: 50,
      locale: AGENT_TEAMS_LOCALE_NAMESPACE
    }, TeamChatEntry));
    native.slots.inject("conversation.chat.turnTail", () => native.slots.register({
      name: "conversation.chat.turnTail",
      id: "agent-teams-summary",
      order: 50,
      locale: AGENT_TEAMS_LOCALE_NAMESPACE,
      inject: () => ({ openMember })
    }, TeamTurnCard));
    native.slots.inject("sidebar.right.pane.tab", () => {
      const dispose = native.slots.register({
        name: "sidebar.right.pane.tab",
        key: TEAM_TAB_ID,
        locale: AGENT_TEAMS_LOCALE_NAMESPACE,
        inject: () => ({ state, modelDirectories: native.modelDirectories, openMember })
      }, WorkspaceActivity);
      bridge.set(native.sidebarRight);
      return () => {
        bridge.set(void 0);
        dispose();
      };
    });
  });
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "agent-teams-activity",
    order: 80,
    label: "AgentTeams activity",
    locale: AGENT_TEAMS_LOCALE_NAMESPACE
  }, Panel));
  ctx.slots.inject("conversation.chat.commandview", () => ctx.slots.register({
    name: "conversation.chat.commandview",
    key: "agent-teams"
  }, HiddenAgentTeamsCommand));
  ctx.uiConversation.events.register(agentTeamsCardDefinition);
  ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
    name: "conversation.chat.node",
    key: "agent-teams",
    locale: AGENT_TEAMS_LOCALE_NAMESPACE,
    inject: () => ({
      openMember,
      workspaceBridge: bridge
    })
  }, AgentTeamsCard));
}


    return module.exports;
  }
});
//# sourceMappingURL=client.js.map