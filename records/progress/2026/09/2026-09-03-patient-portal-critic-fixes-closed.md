---
type: progress-record
status: archived
event_date: 2026-09-03
source: APPlyVault/03 Execution/Progress Log.md
---

# 2026-09-03 — Patient portal critic fixes closed

**Repairs:** converted `datetime-local` appointment inputs to offset-bearing ISO timestamps at submission, added structured JSON rescues for patient-portal parameter/record/uniqueness/context failures, split read capabilities from the appointment-request write capability, removed internal message request keys and dispatch state from the patient projection, restricted result projection to completed encounters, added the page main landmark, responsive narrow layouts, and exact string-preserving currency display.

**Verification:** the fresh Impeccable adversarial review found the issues above; all were addressed. Full web tests passed 13 files / 155 tests, typecheck and production build passed, Ruby syntax and Zeitwerk eager loading passed, and Git whitespace checks passed. Rails integration execution remains inconclusive under local concurrent transaction/lock contention.
