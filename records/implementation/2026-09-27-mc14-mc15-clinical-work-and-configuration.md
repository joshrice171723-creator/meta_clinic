# MC-14/15 clinical work and configuration — 2026-09-27

## Build outcome

- MC-14: Operations now has a source-backed current clinical-task summary by kind and active state, with an overdue count and a selected-site boundary. It is a current census, not a historical daily report. The response contains no patient details and links to the owning follow-up worklist.
- MC-15: A practice-wide configuration administrator can review and download a versioned JSON snapshot of the clinic, location feature revisions and service-offering settings. Its digest covers the listed configuration; the file is explicitly for human review and cannot be imported or used as a migration receipt.

## Scoped evidence and gaps

- Rails eager load, changed-file RuboCop, Ruby syntax, frontend TypeScript and Prettier passed. No tests were added or run.
- Read-only calls against an existing synthetic clinic returned one selected-site active clinical task, and a two-site configuration manifest with a 64-character digest. An unrelated role was denied both reads.
- The browser presentation, downloaded file, site-change reload, historical workflow reconciliation and import/migration recovery remain unverified. No live integration or real data was used.
- MC-14 and MC-15 build estimates moved from 35% to 40%. Validation and external/human estimates remain unchanged.
