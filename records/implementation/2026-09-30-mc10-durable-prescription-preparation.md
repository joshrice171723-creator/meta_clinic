# MC-10 durable prescription preparation source handoff

Date: 2026-09-30. Integration base: `10afe86357f94dc3c3d979647ccd809328005e8d` (`codex/mc10-attempt-provenance`). Authorized scope: source implementation and source-branch publication only. No score/status acceptance change, main merge, PR, deployment, live pharmacy connection or clinical-choice backfill.

## Implemented source contract

- `Clinic::Care::PrescriptionPreparation` is separate immutable, audited evidence: exact medication-request revision and manual review, preparation actor/time, stable request key, canonical SHA-256 envelope digest, pharmacy snapshot and existing simulation mode/signer/reviewer snapshots.
- `POST .../prepare` uses the existing patient/site/write authorization, active actor, idempotency receipt and prescription-series lock. It validates the same medication identity, explicit substitution, prescription details, outside-pharmacy destination and dependency requirements. It creates no prescription event or transmission attempt. It never changes the order's clinical or transmission status or adds sent/received evidence.
- `POST .../submit` now requires `preparation_id`. It rechecks current revision, destination snapshot/digest, mode/signer/reviewer context, unresolved outcomes and dependency readiness; each preparation can link to at most one immutable attempt. A destination row lock protects snapshot capture/recheck from concurrent directory edits.
- Saved prepare and submit requests retain their existing exact replay identity through `Clinic::Idempotency`. Exact submission replay returns its original attempt/correlation even after an unknown outcome; a different request is blocked pending original-attempt reconciliation. Replay does not repeat the submission operation.
- Evidence reads derive preparation state from linked attempt existence and expose source freshness separately. The MUI panel separates **Save prescription preparation** from **Submit to pharmacy (simulated)**, shows locally prepared/unsubmitted, source-changed and linked simulated outcome states, and labels historical attempts without preparation evidence. No external acknowledgment state is invented.
- Both synthetic sandbox submission callers explicitly prepare first. Existing API/service regression helpers were adapted for the required ID; a regression case was authored for no-send preparation, stable replay identity and changed-destination invalidation. All test execution is unrun.

## Static review and remaining verification

Reviewed the scoped source and caller contracts; `git diff --check` passed. No tests, builds, lint, Rails boot, browser walkthrough, database migration, rollback or concurrency checks ran. No dependencies or runtime databases were changed. Authored cases are source, not passing evidence. `graft` and the MUI MCP connector were unavailable; scoped source reads and official MUI Button documentation were used.

Further authored regression scenarios for integration: wrong tenant/patient/site/role; missing review, medication identity, substitution or destination; edited/reviewed replacement revision; mismatched preparation/destination/mode/signers; two concurrent submit keys against one preparation; no automatic replay after reconnect; immutable preparation update/delete and direct-SQL mismatched preparation rejection; exact unknown-attempt replay followed by reconciliation; reload/read of prepared versus linked submission evidence.

## Migration and compatibility limitations

Forward migration `20260930234500_add_durable_prescription_preparations` creates preparation records, tenant/context foreign keys, immutable/context triggers, and an optional historical `preparation_id` with a unique attempt linkage. An insert trigger requires matching preparation on every new attempt. Existing attempt rows stay NULL without guessed preparation, review, substitution or transmission history.

Migration is authored but **unapplied**. `apps/api/db/structure.sql` was **not regenerated**. The integrator must apply this migration after `20260930223000_add_prescription_attempt_provenance`, verify fresh/upgrade/rollback and constraints on an authorized synthetic database, and regenerate/review the structure dump before runtime acceptance. Old clients and direct submission callers must supply a preparation ID; included source callers are adapted. Existing historical submission receipts keep their old payload shape; replay through the new required-ID API is not silently migrated. Coordinate client rollout and retained old pending submissions explicitly.

## Reference mapping

The accepted [prescription transmission plan](../../docs/development/prescription-transmission-plan.md), MC-10 and D-066/D-072 govern this slice. [FHIR R4 MedicationRequest 4.0.1, sections 11.1.1–11.1.3](https://hl7.org/fhir/R4/medicationrequest.html), reopened 2026-09-30, supplies the base distinction between order, dispense and administration, plus revision/requester/destination provenance. The preparation record and canonical local envelope are engineering choices for the accepted U.S. outpatient workflow, not a FHIR exchange profile or NCPDP SCRIPT mapping. No partner-specific guide, clinical rule or wire payload was selected. [Official MUI Button documentation](https://mui.com/material-ui/react-button/), reopened 2026-09-30, supports the existing Button composition; no component-library or package change was made.
