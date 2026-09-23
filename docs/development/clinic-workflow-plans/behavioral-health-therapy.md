# Behavioral health and therapy tracking

## Assignment and authority

2026-09-22 tracking correction for the existing synthetic behavioral-health assignment. The accepted local scope is the Cedar Behavioral Health initial/return journey and the outpatient psychiatry/medication-management composition already recorded in the [detailed journey](../behavioral-health-journey.md). The [implementation tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) owns current status as BH-01 and BH-02 across MC-01/04/05/06/07/10/12. This assignment brief links the prior work; it does not move or replace that earlier document.

No new clinical protocol, therapy-delivery scope, live service, vendor connection or release is authorized by this tracking correction. Direct therapy delivery, group sessions and separately maintained psychotherapy notes remain unselected or unimplemented as stated below. Read this brief and its canonical links when resuming; compare its baseline with current source and later founder decisions before changing behavior.

## Current sources and decisions

Inspected revision `87ffbee5`. [Product strategy](../../../APPlyVault/01%20Foundation/Meta%20Clinic%20Product%20Strategy%20and%20Scope.md) lists behavioral health as a configurable specialty, with individual/group session scheduling, selected assessments and longitudinal goals as possible distinctive workflows; that catalog is direction, not proof of readiness or a requirement for every practice. The [detailed journey](../behavioral-health-journey.md) supplies the field/recovery mapping and dated synthetic evidence. The [shared build and acceptance guide](../meta-clinic-build-and-acceptance.md) owns the six-column dependency matrix. The [tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) and [Progress Log](../../../APPlyVault/03%20Execution/Progress%20Log.md) own current status and dated outcomes. No explicit decision selecting direct therapy scope, an assessment instrument, safety routing or psychotherapy-note policy was found in the selected current Decisions and Risks sections.

The detailed journey records prior review of US Core CarePlan/Goal, CMS progress-note guidance and HHS psychotherapy-note distinctions with their applicability limits. This run selected no new clinical fields or gates and did not re-review external source pages; future feature design must recheck the applicable source, edition and jurisdiction under [healthcare standards](../healthcare-standards.md) and the [U.S. reference map](../us-healthcare-reference-map.md).

## Connected journey

Reference journey: a synthetic behavioral-health patient registers, books an initial visit, supplies versioned previsit intake, completes staff/clinician handoff, receives ordinary clinical documentation and source-linked care plans/goals, leaves unresolved work with an owner at closure, then returns for a follow-up visit. Scheduling, draft intake, clinical review and unrelated tasks can proceed independently where their own prerequisites are met. The psychiatry branch reuses medication-request, refill and pharmacy-destination owners with backend-only simulation and separate outcome reconciliation. Therapy/referral coordination can be configured as a visit type; this alone does not establish direct individual or group therapy delivery.

See the [connected actor/action table](../behavioral-health-journey.md#connected-actoraction-contract) for actor, owning record, entry condition, successful transition and recovery at each step. Keep encounter responsibility separate from task ownership; closure retains open work. Do not repeat the synthetic clinic/patient creation described in the earlier brief.

## Fields and action rules

No new field contract is proposed. The [detailed field/control mapping](../behavioral-health-journey.md#data-coverage-to-evaluate) owns question labels, purpose, backend record, origin, type, allowed state, writer, provenance, draft behavior, validation and recovery. Current source includes backend-owned four-group patient-reported intake with distinct unknown/declined states; assessment revisions with explicit response source, item/reviewer state and optional score provenance; ordinary versioned SOAP notes with optional actual session duration; and source-linked care-plan/goal history. A form answer is not a clinician finding, a selected assessment instrument or a safety result.

The ordinary note endpoint rejects the `psychotherapy` kind. A protected, separately maintained psychotherapy-note record and its access, consent, portal/export and retention behavior are unavailable. The clinic has not selected the therapy service scope, instrument/version/scorer/reviewer/follow-up rules or safety escalation policy. Those choices cannot be inferred from generic fields, the starter visit type or a template.

## Ownership and dependency matrix references

Reuse the existing six-column matrix without adding a specialty copy: CF-01–04 (configuration and change authority), SC-01/04 (booking/resources), CV-01–05/09–10 (intake, identity, handoff, consent, exact note/revision use), RX-01–03 (prescription preparation and uncertain outcomes), and OP-02/04–05/10/12 (follow-up, coverage, retries and open work after closure). CV-06 applies when a configured telehealth visit is exercised. The detailed journey maps the relevant IDs to each step; this tracking correction changes no dependency row.

Paired acceptance must show the specific prohibited transition is denied while draft recovery, unrelated visits, other authorized tasks or scheduling remain available. Missing instrument or safety policy blocks only the dependent assessment/escalation claim. An unavailable provider blocks external transmission, not local preparation. A closed encounter never silently resolves owned follow-up.

## Implementation and acceptance

**BH-01, partially implemented with scoped local proof:** The synthetic initial/return journey and outpatient psychiatry composition exist. Dated focused tests cover intake, note correction/retry, assessment provenance, prior-care projection, task continuity and controlled-test prescription outcomes. Browser evidence covers the initial/return scenario and the return prior-care read path, but the changed psychiatry browser mutation journey, source-update action, wrong-context denial, draft interruption and complete connected recovery remain unverified. The earlier [journey gaps](../behavioral-health-journey.md#remaining-gaps-and-precise-next-scope) and later checkpoints must be read together; generic item-response state was added after part of that gap text was written, but no selected scored instrument is established.

**BH-02, scope pending:** Therapy/referral coordination is a configured visit type. Direct individual/group therapy delivery and a dedicated protected psychotherapy-note feature have no accepted scope or end-to-end proof. The ordinary-note rejection test is a boundary check, not delivery of that feature. If the founder selects therapy delivery, first define the clinic/service and note/privacy contract, then map source-owned fields and actions, add local implementation, and prove a patient/staff journey with permitted and denied actions, recovery and post-closure follow-up. A separate policy, privacy and professional review remains required before any real use.

Do not calculate a specialty percentage from the shared MC dashboard. A future BH-01 or BH-02 build/validation estimate needs a stable accepted scope and criterion-by-criterion audit; external/human acceptance needs its own evidence. Existing source/tests and this documentation edit are not clinical or release acceptance.

## Checkpoint

Current outcome: the tracker now exposes two explicit specialty checkpoints and links this assignment brief. No application code or shared matrix changed. Next: complete the remaining authorized BH-01 local recovery/browser proof, while obtaining the founder's exact therapy-delivery and psychotherapy-note scope before dependent BH-02 design. Preserve the existing synthetic clinic, patient, visits and open tasks. Reconcile any newer evidence before revising status or assigning percentages.

## Last run

- Date: 2026-09-22 America/Chicago; inspected revision `87ffbee5`.
- Outcome: Reconciled the behavioral-health planning record with the canonical tracker; added BH-01/BH-02 specialty checkpoints without inventing a completion percentage or a new therapy decision.
- Changed canonical paths: `APPlyVault/03 Execution/Meta Clinic Implementation Tracker.md` and `APPlyVault/03 Execution/Progress Log.md`; this assignment file is the skill-required source-adjacent brief. The shared matrix and product decisions did not change.
- Checks: source/tracker/matrix/strategy and dated evidence reviewed; the staged component selector passed vault verification (43 notes/509 links), harness verification (28 documents/8 skills/9 commands), 23 harness tests and scoped diff checking. `vault-audit` completed with existing size/metadata advisories. No application or browser test was run for this documentation-only change.
- Next action: finish BH-01 connected browser/recovery proof and obtain the therapy-scope choice needed for BH-02.
