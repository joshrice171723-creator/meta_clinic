# Lab source provenance

## Assignment and authority

Nova owns MC06 source metadata for the approved typed-lab contract: preserve supplied performing/issuing organization, method and received/result times. Parent assigned this independently of the helper's procedure/report fulfillment guards. No completion services, clinical policy, live provider/lab data, credentials, deployment, main PR or score edits. Backend execution routes to Sage's existing runtime.

## Current sources and decisions

- [Approved hardening Slice 4](../non-vendor-clinic-hardening-plan.md#4-typed-laboratory-result-semantics) explicitly requires source-faithful organization/method/time provenance and compatible units without calculated interpretation.
- Portable original review `4732505e5d115e51f850976560f8184ebf52ba94`, published on `codex/mc06-fulfillment-source-coverage`, [coverage matrix](../../../records/implementation/2026-09-30-mc06-mc10-source-coverage.md), items 06-13–16: typed values and order/specimen/version ownership exist; organization/method/received/result metadata is omitted, and unit compatibility validation is absent. The helper's later `dbef8e30918c054132d35ef87fcdaf7d01958b16` changes only fulfillment services and their test.
- At base `10707c6163ad43b5cdbb59f6f1c9e0225cd2901c`, the controller whitelist and result normalization discarded these supplied fields; `LabReportVersion` already encrypts and freezes the result payload and includes it in a content digest. Collection, report issue and staff recording remain separate supported times.
- No approved test-to-dimension/unit catalog was found. Vitals units and a free-text UCUM field do not establish lab-code dimensional compatibility. That gap remains open; this slice deliberately implements the explicitly specified provenance first rather than inventing analyte dimensions, conversions or clinical ranges.

Reviewed primary sources on 2026-09-30:

| Source/version/section                                                                                                                                 | Applicability and implementation                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US Core laboratory observation STU9 / 9.0.0, FHIR R4](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-observation-lab-definitions.html) | Published U.S. trial-use profile informs source-faithful laboratory result context and distinct clinical/source times. No claim of profile conformance, selected exchange partner or universal form requirement.                                                                                |
| [FHIR R4 4.0.1 Observation definitions](https://hl7.org/fhir/R4/observation-definitions.html), performer, method, effective and issued                 | Performer and method inform preserving supplied labels; effective/issued meanings remain distinct. The new source result timestamp is kept as labeled source metadata, not relabeled as collection/effective time or interpreted clinically.                                                    |
| [FHIR R4 4.0.1 DiagnosticReport definitions](https://hl7.org/fhir/R4/diagnosticreport-definitions.html), performer/issued                              | Report responsibility and issue time differ from result measurement metadata. Plain source organization labels are not verified Organization references or authenticated performers. `received_at` is optional local source metadata, not inferred from `recorded_at` or a mandated FHIR field. |

## Connected journey

Staff with existing patient-read and site observation-write permissions enters or corrects a manual lab result. Optional source fields appear with the result's value/unit fields. They remain blank when absent. The same create/append normalization preserves them in the encrypted immutable version payload, covered by the existing content digest and exact-key idempotency. Current cards, review preview, report-version history and result-comparison history display supplied fields as plain text. Correction starts with copied source metadata, allows explicit clearing, and leaves prior-version values unchanged.

An invalid timestamp/overlength value rejects only this write without mutating the original report. UI source data remains available for clarification. Unknown saves keep the existing frozen exact request and require explicit unchanged retry. No report entry implies acknowledgment, review, handling, patient contact or fulfillment.

## Fields and action rules

| Field                     | Origin, storage and rule                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `performing_organization` | Optional source-provided result-row label, at most 200 characters; not a verified organization or privilege.                                                                                                                                                              |
| `issuing_organization`    | Optional source-provided result-row label, at most 200 characters; not inferred from report `source_name`. Source report labels that apply to multiple rows may be entered on each applicable result; this slice does not add a report-level organization identity model. |
| `method`                  | Optional source text, at most 200 characters; no invented code, interpretation or method equivalence.                                                                                                                                                                     |
| `resulted_at`             | Optional source ISO 8601 timestamp with explicit offset/Z and valid calendar date; at most 80 characters. Original text, fractional precision and offset are retained. No chronology/urgency policy added.                                                                |
| `received_at`             | Optional separately supplied source receipt timestamp under the same shape rule; not populated from staff entry time, result time or report issue time.                                                                                                                   |
| Omission/clearing         | Whitespace-only values normalize to absent. New absent keys are omitted server-side so old normalized content digests and exact legacy requests stay unchanged. Clearing affects only the new correction.                                                                 |

No schema/model change: existing encrypted `results_payload`, immutable-version guard and content digest apply. Serializer already returns the row payload. Comparison history adds optional passthrough fields; its matching/grouping and paging rules are unchanged. MUI TextField/Stack/Typography compose the new controls/display; no new dependency or custom control. MUI MCP is unavailable; installed component APIs/types are used.

## Ownership and dependency matrix references

Reuses LB-01/02 and LB-06/07 in [existing build/acceptance matrix](../meta-clinic-build-and-acceptance.md), with OP-10 recovery. Existing permissions and patient/order/site/version guards remain authoritative. Missing optional provenance blocks nothing; invalid supplied fields block only their save. Independent authorized chart/order/follow-up work remains available. No new clinical threshold, range, deadline, export policy or completion gate is introduced.

Owned paths: `LabReports#normalize_results` and new timestamp helper only; controller `RESULT_FIELDS`; read-only `LabResultHistory#item_payload`; `PatientLabReports` entry/display bindings; `LabResultHistory` metadata display; new `LabResultProvenance` module; separate Rails/browser tests and this brief. No helper completion service or shared WorkInbox/service pagination edits. The two prior source branches, including the MC14 repair, are preserved.

## Implementation and acceptance

Implemented on `codex/pilot-lab-source-provenance`, base `10707c6163ad43b5cdbb59f6f1c9e0225cd2901c`.

Executed synthetic frontend selector: `vitest run test/lab-result-provenance.test.tsx test/patient-lab-reports.test.tsx --maxWorkers=1`: **9 passed**, five new browser cases plus four existing cases, 14.75 seconds. Browser transport and workspace context are explicitly synthetic; no connected Rails, live session or provider proof is claimed. TypeScript passed; scoped Prettier for the new provenance module, history component and harness passed; Vite bundle passed (1,479 modules, 1.03 seconds); diff whitespace check passed. Existing unrelated formatting in PatientLabReports is preserved.

Five authored Rails integration cases are **not run here** because Ruby/Bundler are absent: protected create/reload/history/replay/encryption; correction and immutable prior metadata; blank/legacy content stability; invalid timestamps/lengths with unchanged records; denied write/foreign patient context. Route these from `apps/api` to Sage's existing isolated runtime:

```sh
ruby -S bundle exec rails test test/integration/lab_result_provenance_test.rb test/integration/clinic_lab_reports_test.rb test/integration/clinic_lab_result_history_test.rb
ruby -S bundle exec rubocop app/services/clinic/care/lab_reports.rb app/services/clinic/care/lab_result_history.rb app/controllers/clinic/care/lab_reports_controller.rb test/integration/lab_result_provenance_test.rb
ruby -S bundle exec rails zeitwerk:check
```

No new migration/schema check is required. Independent backend/source review and connected synthetic browser persistence remain pending; no local/source proof substitutes for external/human acceptance.

## Checkpoint

Source metadata increment is ready for independent review after final frontend checks and verified branch publication. Unit/dimension validation (matrix 06-15) still needs an approved lab test/catalog mapping and valid unit set. No full MC06 closure or score change is claimed. Relay/scorer alone owns the tracker link. Proposed entry: “MC06 optional source result provenance now roundtrips performing/issuing organization, method, received/result timestamps through encrypted immutable versions and current/history/review UI. Nine synthetic frontend cases passed; five authored Rails cases await existing-runtime verification. Unit compatibility/catalog and connected/provider proof remain open.”

## Last run

2026-09-30. Read the approved Slice 4 and published original source matrix, checked current controller/normalizer/model/UI, implemented only confirmed source metadata loss. MC14 retry uncertainty repair interrupted this slice; it was published separately as `a11c737c67388860289782933594a66ba71829ea` with eight focused browser cases/type/format passes, then lab work resumed. All prior branches/checkpoints remain preserved. Frontend final checks passed. Next: published exact lab head and Sage/Relay review. Canonical tracker/score and helper fulfillment sources remain untouched.
