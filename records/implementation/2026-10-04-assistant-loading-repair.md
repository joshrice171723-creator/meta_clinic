# Assistant loading and usability repair

Date: 2026-10-04. Synthetic local demo, web 3340/API 3341, branch
`codex/in-app-assistant`, repair following `9bc18b27`. No deployment performed.

## Changes and bounded evidence

- Workflow catalog readiness is calculated once per request, retaining each
  operation's authorization. Synthetic profile: 193 entries, 159 readiness
  checks reduced to 1. Patched runner took 6.0 seconds, 159 SQL statements;
  this is not a measured before/after latency comparison.
- Assistant POST reads/setup/proposals and context DELETE no longer emit demo
  record-change events. Successful booking/workflow confirmations and other
  clinic mutations retain the existing refresh behavior.
- Context binds independently of workflow catalog loading. Composer is usable
  while connecting; requests have bounded waits and separate catalog retry.
  Close/reopen preserves draft/session. Route, role and patient changes retain
  invalidation. Patient/visit controls expand when needed.

## Verification

- Repair source `9a2b2446`; latest main `7c763942` integrated by `1b18a293`.
  Merge preserved both progress histories and combined navigation-link closing
  with the assistant entry button. The post-merge full web build passed and the
  assistant opened and connected in the demo. `assistant-open.jpg` was refreshed
  after integration; tablet evidence predates the unrelated main UI integration.

- Full web build: TypeScript, primary Vite, Office Vite passed. Existing marketing
  dynamic-import warning remains. Final `pnpm exec tsc --noEmit` passed after the
  transport change. An initial command used a nonexistent `tsconfig.app.json`;
  the corrected project-default command passed.
- `pnpm exec vitest run test/client.test.ts`: 49 passed, including assistant
  read/setup/proposal non-refresh and confirmed-change refresh coverage.
- Focused Rails `workflow_registry_test.rb`: 1 test, 3 assertions, no failures.
  Ruby syntax and scoped diff whitespace checks passed.
- Actual in-app demo: editable composer during context connection; context 201
  in 2284.741 ms, catalog 200 in 4032.840 ms (CDP request/response timestamps).
  Close/reopen retained `Show the current stock report.` and emitted zero
  assistant API requests. Selecting synthetic Jamie Brooks cleared the draft
  and rebound context. Browse workflows expanded with available operations.
- Desktop and tablet layouts inspected. Captures are in the tutorial directory:
  `assistant-open.jpg` and `assistant-tablet.jpg`.

## Limits

The host temporarily had only 272 MB free RAM and the local API/database health
checks stalled. Only this task's runtime was recovered; unrelated processes
were left intact. First-load timing still depends on local service load. No new
model-provider call, full workflow acceptance run, or hosted validation was made
for this repair. Existing provider quota limits remain separately documented.
