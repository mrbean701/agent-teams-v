# MODEL-SWITCH

Append-only record of every member route change applied through
`agent_teams_set_member_route`. The machine-readable twin of each line is the
`agent-teams/member-route-changed` session event; this file exists so an
independent audit does not depend on the harness recognizing that event type
(events.js omits event types the running harness does not know).

| at (UTC) | team | member | previous | route | applied | source |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-31T20:13:40.030Z | gui-dogfood | alice | opencode-go/deepseek-v4.1-flash (max) | deepseek-official/deepseek-v4-pro (high) | durable-only | http:web:session-28c28ee0-1efa-414d-a9ad-653cfe0abce1 |
| 2026-10-31T20:13:58.728Z | gui-dogfood | alice | deepseek-official/deepseek-v4-pro (high) | (cleared) | durable-only | http:web:session-28c28ee0-1efa-414d-a9ad-653cfe0abce1 |
| 2026-10-31T20:15:17.354Z | gui-dogfood | alice | opencode-go/deepseek-v4.1-flash (max) | deepseek-official/deepseek-v4-pro (high) | durable-only | http:web:session-28c28ee0-1efa-414d-a9ad-653cfe0abce1 |
| 2026-10-31T22:19:43.945Z | roster-dog-mvwyrbzt | alice | opencode-go/deepseek-v4.1-flash (max) | deepseek-official/deepseek-v4-pro (high) | durable-only | captain:session-9f394b2f-cd8a-4b99-8725-bbe39d93b670 |
| 2026-10-31T22:26:01.907Z | roster-dog2-mvwyzorp | alice | opencode-go/deepseek-v4.1-flash (max) | deepseek-official/deepseek-v4-pro (high) | durable-only | captain:session-1a810232-dc56-4f39-a814-e6fbfe7d5678 |
