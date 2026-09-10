# Nurse workflow and chart coverage audit plan

## Consolidated verification checklist

After implementation freeze, verify fresh migration and upgrade, model encryption/immutability, tenant/site/patient binding, authorization, replay/digest conflict, stale writer, two-owner race, request-to-fulfillment linkage, dropped-response recovery, API types, frontend unit/type/build checks, and one desktop/tablet browser journey using independently created synthetic records.

## Rescore thresholds

| Dimension | Required evidence for 8/10 |
| --- | --- |
| Overall ambulatory breadth | Arrival -> intake -> handoff -> request/task execution -> follow-up is connected; plans, referrals, and reviewed documents are linked records rather than note text. |
| Core chart coverage | Intake/triage, diagnosis, medication/service requests, fulfillment, procedure/immunization, care plan/goal, referral, and document-review objects have provenance, state, relationships, and a chart read surface. |
| Nurse workflow fit | One role-focused workspace supports a routine visit, result callback, request execution, and handoff without relying on memory or unrelated modules. |
| Integrity/recovery | Applicable cross-tenant/site denial, duplicate/replay, stale writer, dropped response, two-owner race, correction-chain, and refresh-recovery checks pass. |
| Correct data per screen | Registration owns durable identity; encounter owns visit context; intake/triage own today’s observations and source; request owns intended work; fulfillment owns outcome; task owns responsibility. No screen silently infers one from another. |

## Remaining acceptance gates

The score is restricted to local engineering evidence. A real nurse-fit score remains unaccepted until intended RN/LVN/MA users and a prescribing clinician validate roles, fields, exceptions, and workflow using synthetic scenarios. Production, privacy/security, accessibility, clinical, and release decisions remain separate.

See [roadmap](ROADMAP.md) and [build plan](NURSE_WORKFLOW_BUILD_PLAN.md).
