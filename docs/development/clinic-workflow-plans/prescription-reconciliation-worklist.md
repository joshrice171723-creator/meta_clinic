# Prescription reconciliation worklist

## Assignment and authority

Nova owns the delegated MC-10 read-only worklist on a separate branch based on `4eed814c524449bb6c0b0b5948d2b4f37c565e7a`. The 2026-09-30 delegation authorizes implementation and focused regressions. Open PR ownership was checked before source edits: PR64 is estimate comparison, PR61 service instructions, PR35/36 integration and reporting. None owns this worklist. No provider transmission, signing, medication-order mutation, credentials, grants, merge or deployment is authorized.

Read this brief and its canonical references before starting, resuming after a context reset or accepting a handoff. Compare the recorded baseline and decisions with current checkout and newer direction. Reconcile stale assumptions before dependent edits; do not silently expand scope or repeat completed work. Update this checkpoint at completed slices, blockers and handoff.

## Current sources and decisions

- [MC-10 tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md): deferred response/reconciliation worklist is an explicit local gap; provider acceptance remains separate.
- [Prescription transmission brief](../prescription-transmission-plan.md): immutable original identity, source-labeled evidence, no blind retry, outstanding work survives encounter closure.
- [Existing dependency matrix](../meta-clinic-build-and-acceptance.md): RX-03, OP-06/07/08/10/12. No new matrix or clinical policy.
- Existing `PrescriptionWorkflow.unresolved?` uses the latest non-review event **across the series**, ordered by immutable event ID. The worklist derives the same state for recorded simulator attempts; it does not reinterpret timestamps, acknowledgments or dispensing.
- The existing simulator activity report already exposes a capped current-revision subset. That report and PR36's catalog remain unchanged. This staff queue additionally preserves original unresolved revisions and applies patient/site read authority before counts and bounds.
- Existing encounter links accept `medication_request_revision_id` and `prescription_attempt_id`; the history GET reauthorizes the patient and original revision site. No duplicate history endpoint.

| Reference reviewed 2026-09-30                                                                                                                             | Applicability / interpretation                                                                                                                                                                                                          | Mapping and evidence                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [FHIR R4 MedicationRequest 4.0.1, Scope and Boundaries](https://hl7.org/fhir/R4/medicationrequest.html#scope), published R4 trial-use medication resource | Global technical reference used under the existing U.S. D-066 mapping, not a selected exchange profile. Request, dispense and administration are distinct. No new exchange guide is applicable to a read projection without a provider. | Preserve original patient/encounter/revision identity; show source and recorded outcome separately. UI never treats acceptance as dispensing/delivery. Browser checks verify that distinction and exact links. Existing statuses remain local product decisions. |

## Connected journey

An authorized staff reader opens the Work inbox, reads unresolved prescription attempts for the selected site or permitted sites, and follows **Review history** to the original encounter's version-bound history. Encounter-history access additionally needs the existing encounter read capability; query access does not grant it. The current responsible team label comes from RX-03 (prescriber/support queue), not an invented individual assignment. Reconciliation remains an explicit authorized action in the existing source workflow. Refreshing the worklist only reads current source evidence. A completed encounter and a later order revision do not hide unresolved original evidence; recorded reconciliation removes it from this projection while preserving history. Independent care and other inbox sources remain available.

## Fields and action rules

`GET /api/clinic/prescription_reconciliation_worklist?site_id=<optional existing site>` returns a typed `prescription-reconciliation-worklist-v1` contract. Actor and practice come from the existing protected session; site must belong to that practice and be permitted. Require patient read and clinical-record read, recheck site authority, filter accessible patients before count/limit, and record a sensitive-read audit. Cache protections remain inherited.

Each row inherits attempt/event ID, patient identity, original encounter/site, request revision/series/version, medication display, recorded outcome/source/adapter/time, owning team, next action and exact history link. No editable clinical fields, deadlines or acuity classification. Latest non-review kinds are unknown, acknowledged, accepted, outcome-unknown, rejected, unavailable, revoked and duplicate. `failure_before_send`, manual reviews and reconciled attempts are excluded. Only persisted simulator attempts are projected; no artificial manual transmission records or provider-success claims.

Return the full authorized unresolved count and at most 50 attempts in immutable attempt-ID order with explicit returned count/limit/truncation. Overflow remains outstanding; this bounded slice adds no paging or automatic completion. Refresh or retry the same scoped GET. Failed refresh clears unconfirmed source rows and cannot present the queue as clear. Scope changes/capability loss cancel previous requests and suppress old responses; mismatched response actor/practice/site is rejected.

## Ownership and dependency matrix references

RX-03 and OP-07/08: original source identity and next action stay visible; the queue has no submission/replacement controls. OP-06: only the existing local simulator ledger is read. OP-10: retry and response ownership are explicit. OP-12: closure cannot clear outstanding attempts. No matrix change, ownership transfer feature, grant or provider dependency is introduced. The canonical tracker is owned by Relay; its link is handed off rather than edited from this branch.

## Implementation and acceptance

Owning paths: new `apps/api/app/queries/clinic/care/prescription_reconciliation_worklist.rb`, new Care controller, one GET route, paired `src/api/contracts.ts`, new MUI `PrescriptionReconciliationWorklist.tsx` and a small `WorkInbox.tsx` mount. New Rails/browser tests exercise this slice; no schema or domain-mutation files change. Shared route/contract declarations are additive and do not depend on PR64.

MUI uses existing Paper/Stack/Table/Alert/Button patterns. MUI MCP is unavailable; installed MUI 9.4.0 types and [official Table documentation](https://mui.com/material-ui/react-table/) were consulted. No dependency change.

Six authored Rails cases cover all unresolved kinds versus failure-before-send; read-only repeat reads and exact source-history access; original revision and closed encounter retention; series-level resolution and event-ID order; permission-scoped counts/caps and explicit denied/foreign sites; practice isolation and missing/revoked privileges. Fixtures are authored as separately created synthetic immutable rows through existing model validations/database constraints; their execution remains pending. They are not live identities or provider calls. They do not prove submission acceptance.

Six controlled Chromium tests exercise the actual component and same-origin client with synthetic API responses: provenance/links/count limits and desktop/tablet containment; failed refresh and scoped retry; stale-site response exclusion; denied/mismatched contexts; absent capability and delayed response after revocation. Browser fixtures are transport/UI proof, not Rails/API or connected provider proof. Existing real-API history and full Work inbox acceptance still require the reviewed API candidate in an isolated synthetic runtime.

Backend handoff, from `apps/api` in the candidate worktree with the existing isolated test runtime:

```sh
python ../../bin/agent-resources run -- ruby bin/postgres exec bin/rails test test/integration/prescription_reconciliation_worklist_test.rb test/integration/clinical_plan_workflow_test.rb
python ../../bin/agent-resources run -- ruby bin/rubocop app/queries/clinic/care/prescription_reconciliation_worklist.rb app/controllers/clinic/care/prescription_reconciliation_worklists_controller.rb config/routes.rb test/integration/prescription_reconciliation_worklist_test.rb
python ../../bin/agent-resources run -- ruby bin/postgres exec env RAILS_ENV=test bin/rails zeitwerk:check
```

The tracker-link harness check currently fails only because Relay has not yet added this brief to MC-10. All relative Markdown links resolve. No migration is needed. Stop if connected credentials, real-derived records, external transmission, signing authority or production schedules would be required. Connected clinical/provider acceptance remains separately authorized.

## Checkpoint

Implemented read-only source query, protected GET, typed MUI worklist and existing history links. Six authored controlled browser cases passed. Six Rails cases are authored but unexecuted here: Ruby/Bundler are absent, so execution is routed to Sage through dot. TypeScript, Vite bundle (1471 modules) and scoped Prettier checks passed. Scoped diff review and three relative-link checks passed. Independent review, actual API/browser walkthrough and Relay tracker link remain open; no pilot, clinical or provider acceptance claim.

## Last run

2026-09-30. Inspected baseline `4eed814c`; no active PR owned MC-10 reconciliation. Read approved tracker, prescription brief, applicable dependency matrix, current source guards and FHIR/MUI references. Six browser tests passed against controlled transport; backend execution unavailable. Changed only the listed query/controller/route/contracts/component/mount/tests and this brief. TypeScript, bundle and scoped formatting checks passed; the scoped diff and three relative links were reviewed. Next: publish the draft candidate and route the exact backend commands to Sage; Relay adds the tracker link.
