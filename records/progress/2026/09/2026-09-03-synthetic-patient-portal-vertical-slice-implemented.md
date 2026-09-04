---
type: progress-record
status: archived
event_date: 2026-09-03
source: APPlyVault/03 Execution/Progress Log.md
---

# 2026-09-03 — Synthetic patient portal vertical slice implemented

**Implementation:** added the local/test-only patient portal identity binding and a dedicated synthetic patient login. Rails resolves one practice/patient identity from the signed session and returns a narrow projection of upcoming appointments, exact-decimal billing ledger, intake status, released SOAP summaries, encrypted observation results, active medications, and message metadata. The React/MUI portal renders bounded states; payment collection remains disabled pending a processor boundary.

**Limits / blockers:** this is synthetic development evidence only. Invitation/recovery/revocation lifecycle, payment collection, intake signatures, clinician release workflow, outbound messaging/refills/results, real data, and release remain gated.
