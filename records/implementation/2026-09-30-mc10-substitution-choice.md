# MC10 explicit prescription substitution choice — 2026-09-30

Branch: `codex/mc10-substitution-choice`, based on approved prescription paging head `60158efd5f934c3f62d0e2af9873c6cc13579dc0`. This slice preserves that source and adds no paging implementation or duplicate credit.

## Authorized contract and bounded outcome

The original [prescription implementation brief](../../docs/development/prescription-transmission-plan.md), Prescription details and Substitution instruction sections, requires an explicit allowed/not-allowed choice for outside-pharmacy release while retaining unresolved drafts. This increment implements only that missing field and gate. Durable preparation and additional attempt provenance remain separate planned source gaps.

[FHIR R4 MedicationRequest, version 4.0.1, substitution](https://hl7.org/fhir/R4/medicationrequest-definitions.html#MedicationRequest.substitution), checked 2026-09-30, describes prescriber substitution intent. It is the global technical reference already adopted by the U.S.-scoped brief, not a selected prescribing exchange profile. FHIR allows substitution when the block is absent; Meta Clinic's approved local product contract instead requires an explicit choice before release. No FHIR exchange, vendor mapping, clinical equivalence, state-law determination or conformance is implemented.

The forward migration adds nullable `substitution_instruction`, constrained to `allowed` or `not_allowed` when present. There is no default or backfill: prior revisions stay unresolved. The medication-request model and clinical-plan field mapping preserve the choice on append-only revisions and return it through the existing serializer. The editor uses its existing MUI Select composition with a selectable unresolved draft state. The fulfillment summary displays the saved choice; its review and simulator submission controls block unresolved outside-pharmacy choices. The server's existing release validation independently blocks the same path. In-house orders are not subject to this outside-pharmacy requirement. Reconciliation and exact pending retries retain their existing paths.

Changing or clearing a choice creates a new medication-request revision, so a prior exact-revision review cannot approve the changed choice. No medication, substitution decision, pharmacy, patient or dose is inferred. Explicit `not_allowed` values added to existing synthetic recipe helpers are fixture authors' choices, not an application default.

## Verification

- Nine focused frontend cases passed across `clinical-plan-workspace.test.tsx` and `prescription-substitution.test.tsx`, including unresolved initial choice, bounded editor options, saved-choice summary and existing workspace behavior.
- The preserved `prescription-reconciliation-worklist.test.tsx` passed all eleven cases in the initial scoped run. That run exposed an existing workspace test mock returning workspace-shaped data for the disabled prescription-attempt endpoint; the mock now honors disabled sources and routes event responses independently. The failed workspace case passed on the focused repair run.
- A loopback Chromium check mounted the real MUI fulfillment panel against synthetic reads: unresolved choice blocks review/submission, explicit not-allowed choice enables that gate, clearing it blocks again, and no mutation is sent. Script: `/workspace/mc10-substitution-evidence/mounted-substitution.mjs`.
- Frontend TypeScript, bundle build and changed-file formatting passed. No Ruby executable is available here; Rails tests, migration execution/rollback, SQL constraint behavior, Ruby formatting and schema-dump regeneration are unverified.

## Required Sage handoff

Use the already owned isolated synthetic test runtime. Do not prepare another stack. The checked-in `db/structure.sql` has intentionally not been hand-edited: regenerate it from the applied migration and inspect the resulting additive column/constraint/migration-version change before integration.

```sh
cd apps/api
python ../../bin/agent-resources run -- ../../bin/postgres exec env RAILS_ENV=test bundle exec rails db:migrate db:structure:dump
python ../../bin/agent-resources run -- bundle exec rubocop app/models/clinic/care/medication_request_revision.rb app/services/clinic/care/clinical_plan_workflow.rb app/services/clinic/care/prescription_workflow.rb db/migrate/20260930204500_add_prescription_substitution_instruction.rb test/integration/clinical_plan_workflow_test.rb test/integration/patient_journey_orders_test.rb
python ../../bin/agent-resources run -- ../../bin/postgres exec bundle exec rails test test/integration/clinical_plan_workflow_test.rb test/integration/patient_journey_orders_test.rb test/integration/prescription_reconciliation_worklist_test.rb
```

Two new Rails recipes cover unresolved draft preservation, both explicit choices, immutable prior revisions, invalid-choice rejection, exact-review invalidation and unresolved release/review denial. They have not run. Complete scoped migration/rollback and runtime constraint checks in disposable, explicitly named test databases owned by Sage; no protected development database is targeted by this handoff.

The sprint coordinator authorized committing and publishing this tested source and evidence on the dedicated same-repository branch. Backend/schema verification remains an integration blocker, not a source-publication blocker. No real prescribing, provider call, clinical substitution decision, credential, policy, main change, PR, deployment or score update is authorized or performed by this source-publication step.

## Independent review repair

Independent review rejected `6b161c77ecf3f762cb68bc7c50a0b9f8a055c45e`: the editor sent `substitution_instruction`, but the controller rejected it before workflow validation; two synthetic sandbox prescription builders also omitted the choice before invoking review. The corrected source adds the field to the controller allowlist and an explicit `not_allowed` fixture choice to `DemoSandboxJourneys` and `DemoSandboxPrescriptionOutcomes`. These fixture definitions create wholly synthetic examples; no historical row is changed, inferred or backfilled, and no sandbox reset was executed.

The portable editor/API/workflow boundary regression failed against the unchanged controller at `6b161` and passes on the correction. Request-level Rails recipes now cover blank draft creation, both explicit create choices, invalid create/revision rejection and append-only choices. Two additional Rails recipes invoke the bounded synthetic prescription builders and assert exact review plus simulated outcome. Rails runtime evidence remains pending Sage; passing source/frontend checks do not validate these API or seed executions.

Run the original migration/test commands above against the corrected branch. Expand changed-file RuboCop with:

```sh
cd apps/api
python ../../bin/agent-resources run -- bundle exec rubocop app/controllers/clinic/care/clinical_plan_workspace_controller.rb app/services/development/demo_sandbox_journeys.rb app/services/development/demo_sandbox_prescription_outcomes.rb test/integration/clinical_plan_workflow_test.rb
```
