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
| NW-2 | Medication/service requests, procedure/immunization outcomes, encounter diagnosis, care plan/goals, document review metadata and fulfillment links | Existing patient/encounter, lab report, medication administration, document metadata |
| NW-3 | API-backed nurse workspace and chart panels with persistent identity, loading/error/stale/unsaved/reconcile states | NW-1 and NW-2 response contracts |

Shared routes, browser contracts, capability projection, schema dump, roadmap/index, and final integration remain coordinator-owned.

## Freeze gate

All source slices and consumers are integrated; writers have stopped; the scoped diff contains no unrelated work; every route has a server handler and every user action uses the authoritative API. Only then may tests, builds, browser checks, or audits begin.

See [roadmap](ROADMAP.md) and [audit plan](NURSE_WORKFLOW_AUDIT_PLAN.md).
