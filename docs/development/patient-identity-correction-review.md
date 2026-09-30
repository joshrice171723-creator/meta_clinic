# Patient identity correction review

Registration staff correcting an existing patient's chart name, legal or preferred name, date of birth, or primary contact detail review the saved and proposed identity before saving. Correction comparison and confirmation use the exact field values, including case-only changes. The clinic reference remains immutable. Unchanged identity and correspondence-only edits use the existing save path.

The review reuses the practice-scoped `/api/clinic/patients/lookup` name, reference, birth-date and phone searches. Results are deduplicated by patient ID and exclude the patient being corrected. Failed or incomplete matching blocks confirmation; returning to editing retains the working copy. Matches offer the existing record link and do not merge, delete, or relink records. Confirmation applies only to the original patient ID through the existing registration update API.

A stale-version rejection reloads that same patient's saved identity and requires a new review against it. An unknown save outcome instead preserves the exact pending payload and request key for retry, without another identity lookup. Existing patient/practice authorization, idempotency, version checks and registration audit/history remain server responsibilities and are unchanged.

## Standards and local decisions

[US Core Patient 9.0.0](https://hl7.org/fhir/us/core/StructureDefinition-us-core-patient.html) describes demographic identity including names, identifiers, birth date and contact information. These concepts inform the comparison fields. The correction confirmation and duplicate-review gate are local product decisions, not a US Core requirement. Existing server history preserves prior registration values; this change does not implement FHIR exchange or claim conformance.

## Scoped verification

`apps/web/test/patient-identity-correction.test.ts` mounts the real registration form and MUI review against mocked API and working-copy responses on loopback only. It covers before/after review, self-exclusion, duplicate candidate deduplication, failed/incomplete matching recovery, unchanged identity, exact unknown-outcome retries and stale-version re-review. Existing registration mapping and recovery tests remain applicable.

Run from `apps/web` with one worker:

```sh
vitest run test/patient-identity-correction.test.ts test/patient-registration.test.ts --maxWorkers=1
tsc --noEmit
vite build
```

Backend acceptance remains separate: in an available API runtime, run `PARALLEL_WORKERS=1 bin/rails test test/integration/patient_registration_integrity_test.rb`. Frontend mocks do not prove live practice isolation or audit persistence. No live patient writes are needed for these checks.
