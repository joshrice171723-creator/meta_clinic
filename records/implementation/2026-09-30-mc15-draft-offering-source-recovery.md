# MC-15 draft-offering missing-source recovery — 2026-09-30

Base: `dbf42a0c5906620142912fb61e1585e170557f4c`. Follow-on scope: `configurationMapping.ts`, its model/browser fixture tests and this evidence note. No backend, schema, shared Operations composition, source application, score, deployment or clinical default changed.

## Existing contract and concrete defect

[`Clinic::ServiceOffering`](../../apps/api/app/models/clinic/service_offering.rb) permits an absent visit type for a draft and requires one before publication. [`ConfigurationManifest`](../../apps/api/app/queries/clinic/operations/configuration_manifest.rb) includes all offering statuses and emits `visit_type_id: null` for that draft. The initial cross-clinic preview incorrectly rejected such a valid format-1 snapshot, preventing review of its other configuration records.

The parser now distinguishes an explicitly absent visit type from malformed identifiers. `null` is accepted; absent keys, strings, booleans, objects, zero, negative and fractional identifiers remain rejected. Review identifies the exact source offering with no configured visit type, directs recovery through its owning configuration workflow and requests a fresh snapshot. It never selects a visit type. A mapped destination offering with no visit type also receives its own unresolved configuration message.

Replacing the source file continues to clear old mappings. A corrected source replaces the missing-choice message with the existing separate catalog-mapping requirement, rather than pretending the cross-clinic mapping or import is complete. Source data remains in memory and untouched; the download remains a review artifact.

## Deferred decisions

The tracker explicitly requires a separately specified migration-recovery operation. No inspected contract authorizes an actual cross-clinic apply operation. Before implementing it, the configuration owner must decide the exact import field allowlist and operation tier; create/update/skip versus consolidation semantics; source-to-destination visit-type, clinician and billing catalog mapping/equivalence rules; the conflict rule for existing destination customization and retired/draft records; and the apply/rollback scope, revision preconditions, request identity and durable retry/reconciliation outcome contract. Existing same-clinic offering idempotency is not authority for a bulk cross-clinic transaction or rollback.

## Verification

Seven synthetic model tests and TypeScript passed. The two existing mapping browser cases passed; the added draft-recovery case passed after its test assertions were corrected to inspect actual selected values and the explicit unresolved location reference. The initial assertions incorrectly expected visible empty-select text and then omitted the offering's location-reference blocker from a count. Production behavior required no further repair. The passing new case proves missing-source messaging, corrected-snapshot replacement, both destination selections cleared, unresolved catalog review and zero mutation requests. Scoped formatting and Git whitespace checks passed.

Raw checks are retained at `C:/Users/joshr/Documents/Codex/2026-09-30/task-9/evidence/mc15-draft-recovery-checks.{json,txt}` and `mc15-draft-recovery-repair.{json,txt}`; the unsuccessful repair assertion is preserved separately as `mc15-draft-recovery-repair-attempt1.{json,txt}`. Checks queued behind the existing shared Desktop resource lock and reused installed matching dependencies. No clinic migration, live configuration mutation, provider call, credential inspection, provisioning or duplicate stack occurred. No connected real-API or clinical acceptance is claimed. The earlier bundle was not repeated for this bounded model/diagnostic change.
