import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Manual roster and per-member route control for the AgentTeams panel.
 *
 * Two host actions back this leaf, both on the plugin's own `/plan` route:
 * `set_member_route` (durable override plus a live switch for a member that is
 * already running) and `add_member` (manual roster growth in either phase).
 * Neither touches the captain composer: the model directory here is read only
 * for catalog metadata, so choosing a member route never changes which model
 * the captain session's own composer runs.
 *
 * Durable truth stays on the host. Every mutation returns through the ordinary
 * activity polling snapshot, so this module keeps only transient form state.
 * @module dsh-agent-teams/client/member-controls
 */
import { useEffect, useState } from 'react';
import { StagedModelPicker } from "./StagingPlanEditor.js";
import css from './ActivityPanel.module.css';
/** The plugin-owned control route: stage actions plus manual roster/route. */
const PLAN_URL = '/plugins/dsh-agent-teams/plan';
const ROUTE_ROW = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', padding: '2px 0 2px 10px', fontSize: '11px' };
const ROUTE_LABEL = { color: 'var(--dsw-alias-label-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };
const ROUTE_VALUE = { color: 'var(--dsw-alias-label-secondary)' };
const ROUTE_PAIR = { color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums' };
const ROUTE_HINT = { color: 'var(--dsw-alias-label-tertiary)' };
const ROUTE_FEEDBACK = { color: 'var(--dsw-alias-label-secondary)' };
const ORIGIN_BADGE = { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '999px', padding: '0 6px', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--dsw-alias-label-secondary)' };
const REVERT_BUTTON = { fontSize: '11px', padding: '1px 6px', borderRadius: '6px', border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' };
const FAILURE_ROW = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', padding: '2px 0 2px 10px', fontSize: '11px' };
const FAILURE_LABEL = { color: 'var(--dsw-alias-label-negative, #c0392b)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' };
const FAILURE_DETAIL = { color: 'var(--dsw-alias-label-secondary)', fontVariantNumeric: 'tabular-nums' };
const FORM = { display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 10px', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: '10px', marginTop: '6px' };
const FIELD = { display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px' };
const ACTIONS = { display: 'flex', alignItems: 'center', gap: '8px' };
/**
 * Resolve one session's model directory. A host that does not offer the service
 * (or an unmounted session) must degrade to text-only controls, never break the
 * panel that already renders teams.
 * @param modelDirectories - the host `modelDirectories` service, if injected.
 * @param sessionId - captain session the directory belongs to.
 * @returns the directory handle, or undefined when the host cannot supply one.
 */
export function resolveModelDirectory(modelDirectories, sessionId) {
    if (modelDirectories === undefined || modelDirectories === null)
        return undefined;
    if (typeof modelDirectories.directoryFor !== 'function')
        return undefined;
    try {
        return modelDirectories.directoryFor(sessionId) ?? undefined;
    }
    catch {
        return undefined;
    }
}
async function postPlan(payload) {
    const response = await fetch(PLAN_URL, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (response.ok)
        return;
    let message = `HTTP ${response.status}`;
    try {
        const body = await response.json();
        if (typeof body.error === 'string' && body.error.trim() !== '')
            message = body.error;
    }
    catch { }
    throw new Error(message);
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/** `provider/model`, or the bare model id when the provider is unknown. */
function routeText(provider, model) {
    const scope = (provider ?? '').trim();
    const id = (model ?? '').trim();
    if (scope !== '' && id !== '')
        return `${scope}/${id}`;
    return id;
}
// --- Catalog helpers (DOG-03 D1) -------------------------------------------
// The add-member form used to start empty, so the host fell back to the
// captain's DECLARED route; that route need not exist in this host's catalog and
// the first click came back 409. These helpers read the same directory snapshot
// StagedModelPicker renders, so the form can start on a route that is really
// selectable. They are plain functions on purpose: a test can slice them out of
// this file and exercise them without React.
/** Flatten a directory snapshot into provider/model pairs, in catalog order. */
export function catalogRoutesOf(state) {
    const groups = state !== undefined && state !== null && Array.isArray(state.groups) ? state.groups : [];
    const out = [];
    for (const group of groups) {
        const models = group !== undefined && group !== null && Array.isArray(group.models) ? group.models : [];
        const provider = typeof group?.id === 'string' ? group.id.trim() : '';
        for (const candidate of models) {
            const id = typeof candidate?.id === 'string' ? candidate.id.trim() : '';
            if (provider === '' || id === '')
                continue;
            out.push({ provider, model: id });
        }
    }
    return out;
}
/** True while the form has not committed to a route yet (either half missing). */
export function blankRoute(route) {
    return (route?.provider ?? '').trim() === '' || (route?.model ?? '').trim() === '';
}
/** The route an untouched form adopts: the first catalog entry, or nothing. */
export function defaultCatalogRoute(state) {
    const first = catalogRoutesOf(state)[0];
    if (first === undefined)
        return undefined;
    return { provider: first.provider, model: first.model, reasoningEffort: 'default' };
}
// DOG-03 D1: what an untouched form should start on. A declared route that the
// catalog really serves wins (an operator pinning a model keeps it); otherwise
// the first catalog entry is used and the caller is told the declaration was
// not usable, so it can warn instead of letting the operator eat a 409.
/** @returns {{route?: {provider: string, model: string, reasoningEffort: string}, inCatalog: boolean, warning: boolean, source: string}} */
export function pickDefaultRoute(catalog, declaredRoute) {
    const routes = Array.isArray(catalog) ? catalog : catalogRoutesOf(catalog);
    const wanted = {
        provider: (declaredRoute?.provider ?? '').trim(),
        model: (declaredRoute?.model ?? '').trim(),
    };
    const declaredUsable = wanted.provider !== '' && wanted.model !== ''
        && routes.some((entry) => entry.provider === wanted.provider && entry.model === wanted.model);
    if (declaredUsable) {
        return {
            route: {
                provider: wanted.provider,
                model: wanted.model,
                reasoningEffort: declaredRoute?.reasoningEffort ?? 'default',
            },
            inCatalog: true,
            warning: false,
            source: 'declared',
        };
    }
    const first = routes[0];
    if (first === undefined)
        return { inCatalog: false, warning: true, source: 'empty-catalog' };
    return {
        route: { provider: first.provider, model: first.model, reasoningEffort: 'default' },
        inCatalog: true,
        warning: wanted.provider !== '' || wanted.model !== '',
        source: 'catalog',
    };
}
/** Whether a chosen route is really in the catalog snapshot. */
export function catalogHasRoute(state, provider, model) {
    const scope = (provider ?? '').trim();
    const id = (model ?? '').trim();
    if (scope === '' || id === '')
        return false;
    return catalogRoutesOf(state).some((route) => route.provider === scope && route.model === id);
}
/** Read the directory snapshot once; an absent or hostile service reads as none. */
export function catalogSnapshotOf(directory) {
    if (directory === undefined || directory === null)
        return undefined;
    const store = directory.store;
    if (store === undefined || store === null || typeof store.getSnapshot !== 'function')
        return undefined;
    try {
        return store.getSnapshot() ?? undefined;
    }
    catch {
        return undefined;
    }
}
/** Subscribe to directory changes; a service without a store yields a no-op. */
export function subscribeCatalog(directory, listener) {
    const store = directory === undefined || directory === null ? undefined : directory.store;
    if (store === undefined || store === null || typeof store.subscribe !== 'function')
        return () => undefined;
    try {
        const unsubscribe = store.subscribe(listener);
        return typeof unsubscribe === 'function' ? unsubscribe : () => undefined;
    }
    catch {
        return () => undefined;
    }
}
/** The route this control edits: a declared override outranks the roster spine. */
function memberRoute(member) {
    const override = member.routeOverride;
    return {
        provider: (override?.provider ?? member.provider ?? '').trim(),
        model: (override?.model ?? member.model ?? '').trim(),
        reasoningEffort: override?.reasoningEffort ?? member.reasoningEffort ?? '',
    };
}
/** The origins the host snapshot can report, in the order routeOf resolves them. */
const ROUTE_ORIGINS = new Set(['override', 'fallback', 'active', 'declared']);
/**
 * Where the member's next-step route comes from. The host resolves it once per
 * snapshot (lib/snapshot.js routeOrigin) so the panel never re-derives the
 * precedence: an unknown or missing origin renders no badge at all.
 */
function routeOriginOf(member) {
    const origin = typeof member?.routeOrigin === 'string' ? member.routeOrigin.trim() : '';
    return ROUTE_ORIGINS.has(origin) ? origin : '';
}
/**
 * The member's durable fallback route, read from the host snapshot. A record
 * that is missing, mistyped, or missing a half is treated as absent: a corrupt
 * roster must never break the row that renders it.
 */
function memberFallback(member) {
    const record = member === undefined || member === null ? undefined : member.fallback;
    if (record === undefined || record === null || typeof record !== 'object')
        return undefined;
    const route = routeText(record.provider, record.model);
    if (route === '')
        return undefined;
    return {
        route,
        reasoningEffort: typeof record.reasoningEffort === 'string' ? record.reasoningEffort.trim() : '',
    };
}
/**
 * The badge one row shows. The order is fixed and mirrors the host precedence:
 * a captain override outranks a member that has ALREADY degraded, which
 * outranks the mere declaration of a fallback, which outranks 'declared'.
 */
function routeBadgeOf(member) {
    const origin = routeOriginOf(member);
    if (origin === 'override')
        return 'override';
    if (origin === 'fallback' || member?.fallbackActive === true)
        return 'fallback-active';
    if (memberFallback(member) !== undefined)
        return 'fallback';
    if (origin === 'declared')
        return 'declared';
    if (origin === 'active')
        return 'active';
    return '';
}
/** `YYYY-MM-DD HH:MMZ` for a recorded instant; an unusable instant is dropped. */
function failureInstant(at) {
    if (typeof at !== 'number' || !Number.isFinite(at))
        return '';
    const when = new Date(at);
    if (Number.isNaN(when.getTime()))
        return '';
    return when.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}
/**
 * The member's last provider death, read from the host snapshot. A record that
 * is missing, mistyped or empty in its code is treated as absent, so a corrupt
 * roster never breaks the panel that already renders teams.
 */
function memberFailure(member) {
    const failure = member === undefined || member === null ? undefined : member.lastFailure;
    if (failure === undefined || failure === null || typeof failure !== 'object')
        return undefined;
    const code = typeof failure.code === 'string' ? failure.code.trim() : '';
    if (code === '')
        return undefined;
    const parts = [code];
    const at = failureInstant(failure.at);
    if (at !== '')
        parts.push(at);
    const route = routeText(failure.provider, failure.model);
    if (route !== '')
        parts.push(route);
    return { code, detail: parts.join(' \u00b7 '), message: typeof failure.message === 'string' ? failure.message : '' };
}
/**
 * One member's last provider death, rendered under its row: the error code, the
 * instant it happened, and the route that died. A healthy member renders
 * nothing at all, so the existing row layout is untouched for it.
 */
export function MemberFailureNotice({ member, t }) {
    const failure = memberFailure(member);
    if (failure === undefined)
        return null;
    return (_jsxs("div", { "data-member-failure": failure.code, role: "status", style: FAILURE_ROW, title: failure.message === '' ? undefined : failure.message, children: [_jsx("span", { style: FAILURE_LABEL, children: t('member.failure.title') }), _jsx("span", { style: FAILURE_DETAIL, children: failure.detail })] }));
}
// A failed call reports the ACTION the operator can take, and keeps the raw
// server string as a secondary detail (also in `title`) so the 409 wording is
// still diagnosable without being the only thing the operator can read.
function Notice({ value }) {
    if (value === undefined)
        return null;
    const detail = typeof value.detail === 'string' && value.detail !== '' ? value.detail : undefined;
    return (_jsxs("span", { style: ROUTE_FEEDBACK, "data-tone": value.tone, role: value.tone === 'error' ? 'alert' : 'status', "aria-live": value.tone === 'error' ? 'assertive' : 'polite', title: detail, children: [value.message, detail !== undefined && _jsx("small", { style: ROUTE_HINT, "data-error-detail": true, children: detail })] }));
}
/**
 * One member's route control. A durable override is written through
 * `set_member_route`; the host keeps the roster spine untouched, so the panel
 * shows both the spine route and the route the next step will run on.
 */
export function MemberRouteControl({ team, member, modelDirectory, t, historic = false, stopped = false }) {
    const override = member.routeOverride;
    const overrideProvider = override?.provider ?? '';
    const overrideModel = override?.model ?? '';
    const overrideEffort = override?.reasoningEffort ?? '';
    const [draft, setDraft] = useState(() => memberRoute(member));
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState(undefined);
    // A host snapshot is the durable truth: re-seed the picker whenever it moves.
    useEffect(() => {
        setDraft(memberRoute(member));
    }, [member.provider, member.model, member.reasoningEffort, overrideProvider, overrideModel, overrideEffort]);
    const readOnly = historic || stopped;
    const spine = routeText(member.provider, member.model);
    const declared = routeText(overrideProvider, overrideModel);
    const nextRoute = (member.nextRoute ?? '').trim() !== '' ? member.nextRoute : routeText(draft.provider, draft.model);
    const overridden = declared !== '' && declared !== spine;
    const pair = overridden && spine !== ''
        ? t('member.route.pair', { current: spine, next: declared })
        : '';
    const apply = async (selection) => {
        if (busy)
            return;
        setDraft(selection);
        setBusy(true);
        setFeedback(undefined);
        try {
            await postPlan({
                sessionId: team.captainSessionId,
                teamId: team.teamId,
                action: 'set_member_route',
                memberName: member.name,
                provider: selection.provider,
                model: selection.model,
                reasoningEffort: selection.reasoningEffort,
            });
            setFeedback({ tone: 'success', message: t('member.route.saved') });
        }
        catch (error) {
            setFeedback({ tone: 'error', message: t('member.route.failed', { message: errorMessage(error) }) });
            setDraft(memberRoute(member));
        }
        finally {
            setBusy(false);
        }
    };
    // Revert: drop the override and return to the declared route. The host writes
    // team.json before switching RAM, so a 409 leaves the durable record intact.
    const revert = async () => {
        if (busy)
            return;
        setBusy(true);
        setFeedback(undefined);
        try {
            await postPlan({
                sessionId: team.captainSessionId,
                teamId: team.teamId,
                action: 'clear_member_route',
                memberName: member.name,
            });
            setFeedback({ tone: 'success', message: t('member.route.cleared') });
        }
        catch (error) {
            setFeedback({ tone: 'error', message: t('member.route.clearFailed', { message: errorMessage(error) }) });
        }
        finally {
            setBusy(false);
        }
    };
    // Clearing the fallback only removes the degraded route; the declared
    // primary route (the spine a cold resume checks) is not touched.
    const clearFallback = async () => {
        if (busy)
            return;
        setBusy(true);
        setFeedback(undefined);
        try {
            await postPlan({
                sessionId: team.captainSessionId,
                teamId: team.teamId,
                action: 'clear_member_fallback',
                memberName: member.name,
            });
            setFeedback({ tone: 'success', message: t('member.route.fallbackCleared') });
        }
        catch (error) {
            setFeedback({ tone: 'error', message: t('member.route.fallbackClearFailed', { message: errorMessage(error) }) });
        }
        finally {
            setBusy(false);
        }
    };
    const badgeKey = routeBadgeOf(member);
    const badge = badgeKey === ''
        ? null
        : _jsx("span", { style: ORIGIN_BADGE, "data-route-badge": badgeKey, children: t('member.route.origin.' + badgeKey) });
    // The fallback route is shown even while the member is still on its own
    // route: it is the promise the host will keep if that route dies.
    const fallback = memberFallback(member);
    const fallbackRow = fallback === undefined
        ? null
        : _jsx("span", { style: ROUTE_HINT, "data-member-fallback-route": fallback.route, title: fallback.reasoningEffort === '' ? undefined : fallback.reasoningEffort, children: t('member.route.fallback', { route: fallback.route }) });
    const fallbackClear = fallback === undefined || readOnly
        ? null
        : _jsx("button", { type: "button", "data-member-fallback-clear": member.name, disabled: busy, style: REVERT_BUTTON, onClick: () => { void clearFallback(); }, children: t('member.route.fallbackClear') });
    const revertButton = override === undefined || readOnly
        ? null
        : _jsx("button", { type: "button", "data-member-route-clear": member.name, disabled: busy, style: REVERT_BUTTON, onClick: () => { void revert(); }, children: t('member.route.clear') });
    const picker = modelDirectory === undefined
        ? _jsxs("span", { style: ROUTE_VALUE, children: [routeText(draft.provider, draft.model) || t('member.route.none'), " ", _jsx("small", { style: ROUTE_HINT, children: t('member.route.noCatalog') })] })
        : _jsx(StagedModelPicker, { directory: modelDirectory, provider: draft.provider, model: draft.model, reasoningEffort: draft.reasoningEffort, busy: busy, onChange: (selection) => { void apply(selection); }, t: t });
    return (_jsxs("div", { "data-member-route-control": member.name, "data-route-origin": (member.routeOrigin ?? '') || undefined, "data-route-override": overridden || undefined, style: ROUTE_ROW, children: [_jsx("span", { style: ROUTE_LABEL, children: t('member.route.title') }), readOnly
                ? _jsx("span", { style: ROUTE_VALUE, children: nextRoute || t('member.route.none') })
                : picker, pair !== '' && _jsx("span", { style: ROUTE_PAIR, "data-member-route-pair": true, title: pair, children: pair }), override !== undefined && _jsx("span", { style: ROUTE_HINT, "data-route-source": override.source, children: t('member.route.override', { source: override.source }) }), badge, revertButton, fallbackRow, fallbackClear, _jsx(Notice, { value: feedback })] }));
}
/**
 * Manual roster growth for one team. The form posts the same `add_member`
 * action the captain's tool uses, so a browser added member and a model added
 * member take one code path on the host; a 409 (duplicate name or the
 * `maxManualMembers` cap) surfaces its message instead of failing silently.
 */
export function AddMemberControl({ team, modelDirectory, t, historic = false, stopped = false, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [route, setRoute] = useState({ provider: '', model: '', reasoningEffort: '' });
    const [executionPrompt, setExecutionPrompt] = useState('');
    const [toolPolicy, setToolPolicy] = useState('');
    const [busy, setBusy] = useState(false);
    const [feedback, setFeedback] = useState(undefined);
    // DOG-03 D1: the form used to start EMPTY, so the payload carried no route,
    // the host fell back to the captain's declared route, and this host does not
    // serve that route from its catalog: the first click came back 409. A blank
    // form now adopts a route the catalog really offers, so the first click works.
    const catalogState = catalogSnapshotOf(modelDirectory);
    const routeBlank = blankRoute(route);
    // t74: the captain's DECLARED route is what the host would inherit for a
    // member naming none, so it seeds the picker; absent keeps the older pick.
    const declaredRoute = team === undefined || team === null ? undefined : team.captainRoute;
    const declaredRouteText = declaredRoute === undefined || declaredRoute === null
        ? ''
        : routeText(declaredRoute.provider, declaredRoute.model);
    const defaultPick = pickDefaultRoute(catalogState, declaredRoute);
    const routeOutsideCatalog = !routeBlank && catalogState !== undefined
        && !catalogHasRoute(catalogState, route.provider, route.model);
    useEffect(() => {
        if (modelDirectory === undefined || !open)
            return undefined;
        const adopt = () => {
            const pick = pickDefaultRoute(catalogSnapshotOf(modelDirectory), declaredRoute);
            if (pick.route === undefined)
                return;
            const wanted = pick.route;
            setRoute((current) => (blankRoute(current) ? wanted : current));
        };
        adopt();
        void modelDirectory.load?.().then(adopt).catch(() => undefined);
        return subscribeCatalog(modelDirectory, adopt);
    }, [modelDirectory, open, routeBlank, declaredRouteText]);
    if (historic || stopped)
        return null;
    // t74: the captain DECLARES a route this host does not serve, so the form
    // started on a catalog route instead. Name the declaration itself: the
    // operator has to know why the preselected route is not the inherited one.
    const captainRouteWarning = defaultPick.warning === true && declaredRouteText !== ''
        ? _jsx("span", { style: ROUTE_HINT, role: "status", "data-add-member-captain-route-warning": declaredRouteText, children: t('addMember.captainRouteOutside', { route: declaredRouteText }) })
        : null;
    // A route the catalog does not serve is flagged where it is chosen, so the
    // 409 that D1 recorded becomes predictable instead of surprising.
    const routeHint = routeOutsideCatalog
        ? _jsx("span", { style: ROUTE_HINT, role: "status", "data-add-member-route-warning": routeText(route.provider, route.model), children: t('addMember.routeUnavailable', { route: routeText(route.provider, route.model) }) })
        : routeBlank || defaultPick.route === undefined || defaultPick.source === 'declared'
            ? null
            : _jsx("span", { style: ROUTE_HINT, "data-add-member-route-default": routeText(route.provider, route.model), children: t('addMember.routeDefault') });
    const emptyCatalogHint = modelDirectory !== undefined && defaultPick.source === 'empty-catalog'
        ? _jsx("span", { style: ROUTE_HINT, role: "status", "data-add-member-catalog-empty": true, children: t('addMember.catalogEmpty') })
        : null;
    const submit = async (event) => {
        event.preventDefault();
        if (busy)
            return;
        const trimmed = name.trim();
        if (trimmed === '') {
            setFeedback({ tone: 'error', message: t('addMember.nameRequired') });
            return;
        }
        setBusy(true);
        setFeedback(undefined);
        const payload = {
            sessionId: team.captainSessionId,
            teamId: team.teamId,
            action: 'add_member',
            memberName: trimmed,
            // A running team starts the member now; a staged roster only grows.
            activation: 'immediate',
        };
        if (role.trim() !== '')
            payload.role = role.trim();
        if (route.provider.trim() !== '' && route.model.trim() !== '') {
            payload.provider = route.provider.trim();
            payload.model = route.model.trim();
            if (route.reasoningEffort !== '')
                payload.reasoningEffort = route.reasoningEffort;
        }
        if (executionPrompt.trim() !== '')
            payload.executionPrompt = executionPrompt.trim();
        if (toolPolicy.trim() !== '')
            payload.tool_policy = toolPolicy.trim();
        try {
            await postPlan(payload);
            setFeedback({ tone: 'success', message: t('addMember.addedNamed', { name: trimmed }) });
            setName('');
            setRole('');
            setExecutionPrompt('');
            setToolPolicy('');
            setRoute({ provider: '', model: '', reasoningEffort: '' });
        }
        catch (error) {
            // The operator needs the ACTION, not a restatement of the 409: the
            // raw server string survives in the detail (and in the title).
            setFeedback({
                tone: 'error',
                message: t('addMember.failedAction'),
                detail: t('addMember.failed', { message: errorMessage(error) }),
            });
        }
        finally {
            setBusy(false);
        }
    };
    return (_jsxs("div", { "data-add-member": team.teamId, children: [_jsx("button", { type: "button", className: css.membersToggle, "data-add-member-toggle": true, "aria-expanded": open, onClick: () => { setOpen((current) => !current); setFeedback(undefined); }, children: t(open ? 'addMember.close' : 'addMember.toggle') }), open && (_jsxs("form", { "data-add-member-form": true, style: FORM, onSubmit: (event) => { void submit(event); }, children: [_jsx("strong", { style: ROUTE_VALUE, children: t('addMember.title') }), _jsxs("label", { style: FIELD, children: [t('addMember.name'), _jsx("input", { name: "memberName", value: name, required: true, disabled: busy, onChange: (event) => { setName(event.currentTarget.value); } })] }), _jsxs("label", { style: FIELD, children: [t('addMember.role'), _jsx("input", { name: "role", value: role, disabled: busy, onChange: (event) => { setRole(event.currentTarget.value); } })] }), _jsxs("div", { style: FIELD, children: [_jsx("span", { children: t('addMember.route') }), modelDirectory === undefined
                                ? _jsxs("span", { style: ROUTE_HINT, children: [routeText(route.provider, route.model) || t('addMember.routeInherit'), " ", t('addMember.noCatalog')] })
                                : _jsx(StagedModelPicker, { directory: modelDirectory, provider: route.provider, model: route.model, reasoningEffort: route.reasoningEffort, busy: busy, onChange: (selection) => { setRoute(selection); }, t: t }), captainRouteWarning, routeHint, emptyCatalogHint] }), _jsxs("label", { style: FIELD, children: [t('addMember.prompt'), _jsx("textarea", { name: "executionPrompt", rows: 3, value: executionPrompt, disabled: busy, onChange: (event) => { setExecutionPrompt(event.currentTarget.value); } })] }), _jsxs("label", { style: FIELD, children: [t('addMember.toolPolicy'), _jsx("input", { name: "tool_policy", value: toolPolicy, disabled: busy, placeholder: t('addMember.toolPolicyHint'), onChange: (event) => { setToolPolicy(event.currentTarget.value); } })] }), _jsxs("span", { style: ACTIONS, children: [_jsx("button", { type: "submit", className: css.planSave, disabled: busy || name.trim() === '', children: busy ? t('addMember.saving') : t('addMember.submit') }), _jsx(Notice, { value: feedback })] })] }))] }));
}
