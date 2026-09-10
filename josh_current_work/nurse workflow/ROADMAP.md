# Nurse workflow and chart coverage roadmap

## Objective

Raise MC's code-level ambulatory breadth, chart coverage, nurse workflow, integrity/recovery, and screen-to-object fit to an evidence-backed 8/10 target while preserving the separate professional, security, hosted, and real-data gates.

## Authorized local scope

1. Make encounter arrival, intake state, triage evidence linkage, and handoff explicit persisted workflow facts.
2. Add one clinical-task lifecycle with pool/owner/due/status/resolution and links to the patient, encounter, request, result, or communication that created the work.
3. Put the nurse's current visit, prior summary, today’s inputs, handoff, and owned work into one desktop/tablet workspace backed by the API.
4. After that workflow is verified, add the separate order-to-action and missing chart-object slice.

## Exclusions and gates

No triage score, diagnostic decision support, clinical threshold, prescribing/signing authority, EPCS/PDMP, external eRx/lab/imaging/registry exchange, real patient data, deployment, or clinical approval is included. Field dictionaries and role policy remain subject to RN/LVN/MA and prescribing-clinician review.

## Delivery sequence

Schema and server transitions -> API contracts -> nurse workspace -> implementation freeze -> one consolidated verification pass -> narrow repairs -> evidence-backed rescore.

## Completion boundary

“8/10” means the implemented local synthetic product meets the measurable engineering criteria in the audit plan. It does not mean a nurse has accepted the workflow or that MC is production-ready.

See [build plan](NURSE_WORKFLOW_BUILD_PLAN.md) and [audit plan](NURSE_WORKFLOW_AUDIT_PLAN.md).
