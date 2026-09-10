# Nurse workflow and chart coverage build plan

## Acceptance contract

Actor: authorized clinic staff or clinician. Entry point: tracking board or selected encounter. Persisted outcome: explicit encounter workflow/intake/handoff state plus linked tasks and chart objects. Failure behavior: wrong tenant/site/patient, stale version, changed replay, duplicate owner, or unconfirmed response stops without false success and supports refresh/reconcile. Non-goals are listed in the roadmap.

## Failure-first record

- Failure hypothesis: inferred workflow state, a stale handoff, or an unbound clinical object could place work on the wrong patient/visit or falsely report completion.
- Prevention/detection: composite tenant/patient/encounter keys; server-derived actor; exact capabilities; aggregate locks/CAS; idempotency digests; append-only revisions/events; explicit unknown/incomplete/outcome-unconfirmed states; no clinical narrative in audit metadata.
- Disproof/recovery: synthetic denial, replay, stale writer, two-owner race, dropped-response reconciliation, immutable-history, and wrong-patient tests. Reload the authoritative aggregate and append a correction; never rewrite history or auto-replay a protected mutation.
- Stop conditions: cross-tenant disclosure, plaintext protected values, duplicate accepted handoff, silent loss/alteration, missing required audit evidence, or a clinical choice not represented as an explicit open gate.

## Build slices

| Slice | Owned outcome | Dependencies |
| --- | --- | --- |
| NW-1 | Encounter workflow projection/events, immutable intake revisions/items, triage evidence links, handoff aggregate/events, clinical tasks | Existing encounter, observation, history-review, membership, authorization, idempotency, audit |
| NW-2 | API-backed nurse workspace with persistent identity, loading/error/stale/unsaved/reconcile states | NW-1 response contracts |
| Deferred order-to-action slice | Medication/service requests, procedure/immunization outcomes, encounter diagnosis, care plan/goals, document review metadata and fulfillment links | Verified NW-1/NW-2 workflow foundation and clinical review |

Shared routes, browser contracts, capability projection, schema dump, roadmap/index, and final integration remain coordinator-owned.

## First-slice field, state, and permission matrix

| Screen step | Persisted owner | Minimum fields/state | Current technical permission |
| --- | --- | --- | --- |
| Arrival and selection | Existing appointment/encounter | Exact patient, appointment, encounter, site, recorded arrival/check-in | Existing appointment/encounter permissions |
| Intake | Immutable intake revision | Identity-confirmation state, visit-reason review state, history-review state, vitals state, exact linked observation/review IDs, author/time/version | `intake.write` |
| Triage evidence | Existing observation/history-review records | Recorded value or explicit missing state, source, observed/reviewed time, author; no score or inferred normality | `observations.write` and existing history-review boundary |
| Handoff | Handoff aggregate plus immutable events | Exact intake revision, pending/accepted/rejected/correction/completed/cancelled, requester/acceptor/time/version | Staff request via `intake.write`; clinician response via `notes.write` |
| Remaining work | Clinical task | Patient/encounter/site, task kind, pool/owner, due state, status, resolution, version | Existing encounter-write boundary |

The order-to-action chain is deliberately second. This follows the market review's recommendation to fix ownership and flow before adding broad clinical object families.

## Freeze gate

All source slices and consumers are integrated; writers have stopped; the scoped diff contains no unrelated work; every route has a server handler and every user action uses the authoritative API. Only then may tests, builds, browser checks, or audits begin.

See [roadmap](ROADMAP.md) and [audit plan](NURSE_WORKFLOW_AUDIT_PLAN.md).
