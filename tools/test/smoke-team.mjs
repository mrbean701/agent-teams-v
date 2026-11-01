#!/usr/bin/env node
// tools/test/smoke-team.mjs — smoke test: boot one headless captain session on the
// draft profile, let it create a team with exactly one member, then read the durable
// team.json back from disk. Level: smoke (see skill "test-collaboration").
//
// Usage (repo root):
//   node tools/test/smoke-team.mjs                    # team smoke1, fresh workspace
//   node tools/test/smoke-team.mjs --team smoke2 --profile agent-teams-test
//   node tools/test/smoke-team.mjs --workspace tests/tmp/smoke-fixed   # reuse a directory
//
// Exit codes: 0 PASS, 1 FAIL (checks C1-C3), 2 harness error.
// Every artefact lands in the workspace: session.stdout.txt, session.stderr.txt, result.json.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, TEST_PROFILE, report, runDsh } from './lib/dsh-cli.mjs';

const argv = process.argv.slice(2);
function arg(name, fallback) {
    const index = argv.indexOf('--' + name);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}
const team = arg('team', 'smoke1');
const profile = arg('profile', TEST_PROFILE);
const timeoutMs = Number(arg('timeout-ms', '420000'));

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const workspace = join(REPO_ROOT, arg('workspace', join('tests', 'tmp', 'smoke-run', stamp)));
mkdirSync(workspace, { recursive: true });

// The task travels as ONE argv item. A multi-line task is silently cut at the
// first newline by the headless launcher (observed 2026-10-31: the model only ever
// saw line 1 and reported "the step list is empty"), so the prompt is a single line.
const prompt = [
    'Environment smoke test for the agent-teams plugin. Do exactly these steps and nothing else.',
    'Step 1: call the tool agent_teams_create with these arguments:',
    '{"name":"' + team + '","description":"smoke: one member, staged plan","approval":"required","plan":{"members":[{"name":"worker-1","role":"smoke member"}],"tasks":[]}}.',
    'Step 2: call agent_teams_status with {}.',
    'Step 3: reply with exactly one line: SMOKE_DONE <team_id from step 1>.',
    'Rules: do not add more members, do not create or assign tasks, do not run shell commands, do not create or edit files.',
    'If agent_teams_create is not in your tool list, reply exactly SMOKE_NO_TOOL and stop.',
].join(' ');

console.log('workspace : ' + workspace);
console.log('profile   : ' + profile);
console.log('team      : ' + team);
console.log('mode      : --json run events, session id minted by the host');

// --session-id only addresses an EXISTING session ("dsh: session \"...\" does not
// exist; omit --session-id to start a new Session"), so the host mints it here and
// the script reads the id back out of the event stream.
const run = runDsh(['--profile', profile, '--json', prompt], { cwd: workspace, timeoutMs });
writeFileSync(join(workspace, 'session.stdout.txt'), run.stdout);
writeFileSync(join(workspace, 'session.stderr.txt'), run.stderr);
console.log('');
console.log('$ ' + run.command.slice(0, 400) + ' …');
console.log('exit=' + run.status + (run.error ? ' error=' + run.error : ''));
console.log('');
console.log('--- stdout (' + run.stdout.length + ' bytes) ---');
console.log(run.stdout.slice(0, 4000));
console.log('--- stderr (' + run.stderr.length + ' bytes) ---');
console.log(run.stderr.slice(0, 4000));

// --json emits newline-delimited run events: keep the raw file and parse tolerantly.
const events = [];
for (const line of run.stdout.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    try { events.push(JSON.parse(line)); } catch (error) { events.push({ unparsed: line }); }
}
const sessionMatch = run.stdout.match(/"sessionId"\s*:\s*"([^"]+)"/);
const sessionId = sessionMatch ? sessionMatch[1] : null;
const toolMentioned = /agent_teams_create/.test(run.stdout);
console.log('');
console.log('--- run events (' + events.length + ') ---');
console.log('session id from events: ' + (sessionId || 'not found'));
console.log('agent_teams_create mentioned in events: ' + toolMentioned);
for (const event of events.slice(0, 25)) console.log('  ' + JSON.stringify(event).slice(0, 400));
if (events.length > 25) console.log('  … ' + (events.length - 25) + ' more event(s) in session.stdout.txt');

// Read the durable state back. stateDir is ".agent-teams" relative to the workspace.
const stateRoot = join(workspace, '.agent-teams');
const teamFiles = [];
if (existsSync(stateRoot)) {
    for (const entry of readdirSync(stateRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const candidate = join(stateRoot, entry.name, 'team.json');
        if (existsSync(candidate)) teamFiles.push(candidate);
    }
}
console.log('');
console.log('--- durable state ---');
console.log('state root: ' + stateRoot + ' (' + (existsSync(stateRoot) ? 'exists' : 'MISSING') + ')');
for (const file of teamFiles) console.log('  ' + file);

let parsed = null;
let parseError = null;
const chosen = teamFiles.find(file => file.includes(team)) || teamFiles[0];
if (chosen) {
    try {
        parsed = JSON.parse(readFileSync(chosen, 'utf8'));
    } catch (error) {
        parseError = String(error);
    }
}

const c1 = teamFiles.length > 0;
const c2 = parsed !== null && typeof parsed.id === 'string' && parsed.id.length > 0;
const c3 = parsed !== null && Array.isArray(parsed.members) && parsed.members.length === 1;
const c4 = run.status === 0 && /SMOKE_DONE/.test(run.stdout);

console.log('');
report('C1 team.json written under <workspace>/.agent-teams/', c1, teamFiles.length + ' file(s)');
report('C2 team.json parses and carries an id', c2, parseError ? 'parse error: ' + parseError : (parsed ? 'id=' + parsed.id + ' phase=' + parsed.phase : 'no file'));
report('C3 exactly one member in the roster', c3, parsed && Array.isArray(parsed.members)
    ? parsed.members.map(function (member) { return member.name + '/' + member.status; }).join(', ')
    : 'no roster');
console.log((c4 ? 'INFO ' : 'INFO ') + 'C4 captain reported SMOKE_DONE (evidence only, not an acceptance criterion) — ' + (c4 ? 'yes' : 'no (exit=' + run.status + ')'));

if (parsed) {
    console.log('');
    console.log('--- team.json (first 2000 bytes) ---');
    console.log(JSON.stringify(parsed, null, 2).slice(0, 2000));
}

const verdict = c1 && c2 && c3 ? 'PASS' : 'FAIL';
const result = {
    verdict, team, profile, sessionId, toolMentioned, workspace,
    command: run.command, exitCode: run.status, error: run.error,
    checks: { C1_team_json_exists: c1, C2_team_json_parses: c2, C3_one_member: c3, C4_model_reported_done: c4 },
    teamJson: chosen || null,
    stateRoot,
    at: new Date().toISOString(),
};
writeFileSync(join(workspace, 'result.json'), JSON.stringify(result, null, 2));
console.log('');
console.log('=== smoke verdict: ' + verdict + ' ===');
console.log('result.json: ' + join(workspace, 'result.json'));
process.exit(verdict === 'PASS' ? 0 : 1);
