# MC10 immutable local attempt provenance — 2026-09-30

Branch: `codex/mc10-attempt-provenance`, based on corrected substitution head `a3254806d7d8425cf6a65482f0b1c9d535d4e603`. It preserves the approved Nova paging ancestor `60158efd5f934c3f62d0e2af9873c6cc13579dc0`; substitution and paging are separate increments, not additional credit here.

## Original contract and bounded source

The [approved prescription brief](../../docs/development/prescription-transmission-plan.md), Attempt ledger and Review sections, explicitly plans transaction/source/schema, canonical digest, correlation identity, exact review and prior-attempt provenance. This increment completes those unambiguous fields for newly created local simulator submissions. It adds no provider adapter, exchange payload or clinical policy. The brief's FHIR R4 MedicationRequest 4.0.1 lifecycle provenance reference is an internal design input already adopted for the U.S.-scoped product; this is not a FHIR Provenance resource or NCPDP SCRIPT conformance implementation. `NewRx` identifies the existing new-prescription simulator operation; `local-simulation-v1` explicitly identifies our local envelope, not a partner transaction version.

New attempts save server-owned `source`, `transaction_type`, `schema_version`, `payload_digest`, UUID `correlation_id`, `review_event_id` and optional `prior_attempt_id`. The digest is SHA-256 over the existing idempotency service's recursively canonical JSON, using its explicit `sha256-v0` algorithm. The local envelope contains practice/patient/encounter, saved order ID/series/revision, all approved prescription fields including explicit substitution, exact manual review ID, frozen destination snapshot and simulator mode/signer/reviewer snapshots. Outcome scenario, request key and correlation UUID are identities/results rather than clinical payload and are not in that digest. The raw envelope is neither persisted here nor returned. Existing authorization, current-revision, release, exact-review, dependency and unresolved-outcome gates remain in place.

Creation stays inside the existing request receipt transaction and series advisory lock. Repeating the exact request returns the saved attempt with the same digest, review and correlation; it does not create new metadata. A subsequent permitted attempt links the latest earlier attempt in the same patient/practice/order series. The model checks that review belongs to this exact revision/patient/practice and is manual review; prior attempts must belong to the same patient/practice/series and precede this row. The forward migration adds nullable metadata, all-or-none value constraints, review/prior foreign keys and unique correlation ID. Existing immutable records remain null; no backfill or updates to historical attempts occur. Existing append-only model callbacks and database trigger remain unchanged.

The protected API returns the saved request key and provenance. The existing MUI Typography timeline shows exact revision/review/correlation and prior relationship alongside the simulated outcome and saved destination. Historical attempts explicitly show unavailable provenance while preserving their outcome. Unknown outcomes are still unresolved, not inferred to be prepared, submitted successfully or received externally. No external sent/received timestamps or partner response codes are invented.

## Preparation question left open

The brief says `PrescriptionTransmissionAttempt` is first prepared and later submitted, while the implemented ledger requires an outcome event and submission timestamp on creation and forbids all updates. Which durable lifecycle representation is approved: one stable attempt identity with append-only preparation/submission stage events, or a separate immutable preparation linked to an immutable submission attempt? This decision determines the record identity, request-key ownership, stale preparation handling and transition API. This increment does not choose that workflow policy, create a preparation endpoint, relabel existing submissions as preparations or claim durable preparation complete. Prepared work must remain distinct from submitted work and never auto-send; implementation of that stage remains a source gap pending the answer.

## Evidence and deferred verification

Before the source-first instruction, 23 focused frontend cases passed across provenance rendering, substitution, clinical workspace and preserved reconciliation paging. The original locked dependency installation completed without lockfile changes. These results predate the final additive request-key type/serialization line and the substitution repair integration; no post-instruction tests, builds or lint runs were started. Static inspection confirms controller input cannot select provenance or bypass gates, metadata creation occurs only on the new idempotent path, immutable prior rows are preserved and no network action was introduced.

Prepared Rails recipes cover exact unknown-outcome replay metadata, stale/missing-review denial, revision/destination change producing a new digest and correlation, prior links, incorrect review rejection and immutable identity. The submission test helper now explicitly sends standard simulator mode, matching the API input contract. They have not run: Ruby is absent here. Schema dumping, migration/rollback/constraint runtime checks, Rails tests and Ruby formatting remain deferred to Sage's existing isolated synthetic runtime. `db/structure.sql` is intentionally untouched; do not hand-fabricate it.

Portable commands for that deferred gate (not authority to start a new environment or run release verification now):

```sh
cd apps/api
python ../../bin/agent-resources run -- ../../bin/postgres exec env RAILS_ENV=test bundle exec rails db:migrate db:structure:dump
python ../../bin/agent-resources run -- bundle exec rubocop app/models/clinic/care/prescription_transmission_attempt.rb app/services/clinic/care/prescription_transmission_workflow.rb db/migrate/20260930223000_add_prescription_attempt_provenance.rb test/integration/patient_journey_orders_test.rb
python ../../bin/agent-resources run -- ../../bin/postgres exec bundle exec rails test test/integration/clinical_plan_workflow_test.rb test/integration/patient_journey_orders_test.rb test/integration/prescription_reconciliation_worklist_test.rb
```

Source publication is explicitly authorized. No live prescribing, clinical choice inference, provider setup, credential change, PR, main merge, deployment or score change is performed. Source coverage and deferred runtime/release gates are separate claims.
