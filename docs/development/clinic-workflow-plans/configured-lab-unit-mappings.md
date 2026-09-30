# Configured lab unit mappings

## Assignment and authority

MC06 source-only assignment from dot, 2026-09-30: implement the approved typed-result unit/dimension mechanism using explicit clinic-supplied mappings. Do not select clinical values, seed catalogs, introduce conversions/ranges, grant roles or change live configuration. Josh directs no tests/build/lint during this sprint. Relay owns integration and the tracker; this brief supplies the proposed tracker entry rather than editing scores.

## Current sources and decisions

Base: `d957313b4ea2a9873d61142f060a59c34260d644`, fetched combined-release source. [Hardening plan slice 4](../non-vendor-clinic-hardening-plan.md#4-typed-laboratory-result-semantics) requires compatible code/unit pairs, unchanged source values and explicit unknown state. The MC06/10 source matrix identifies 06-15 as missing validation. Existing `PracticeFeatureVersion` is append-only, clinic/site-scoped JSON with attributed membership, revision and unique request key; `PracticeFeatures.revise` already authorizes `facilities.write` and uses a practice lock. No existing lab mapping catalog was found.

Standards reviewed 2026-09-30: [US Core Laboratory Result Observation, STU9 9.0.0 on FHIR R4](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-observation-lab-definitions.html). U.S. applicability is laboratory result coding and quantity-unit representation. This increment preserves existing coding and unit fields; the local mapping declaration is a product configuration mechanism, not an IG-prescribed catalog, terminology server, UCUM syntax parser or FHIR-conformance claim. No test codes, units or dimension labels were chosen from that source or seeded.

## Connected journey

1. Authorized clinic-wide Facilities reader sees current mappings, revision and explicit configured/unconfigured status. Server projects write permission separately.
2. Existing `facilities.write` holder supplies test system/code/version, dimension label and allowed unit codes. No values are suggested. Save creates a new attributed append-only configuration version, preserving the other clinic profile fields.
3. A new numeric/range lab result matches the exact configured test system/code/version. Its supplied unit code must be explicitly listed; missing or different units reject the operation. No conversion or value interpretation occurs.
4. Unconfigured mappings or an unmatched test preserve the source row with an unvalidated receipt. Other value kinds record `not_applicable`. Existing versions lacking receipts remain unknown, never retrospectively validated.
5. The immutable result version stores the supplied dimension label, configuration revision and validation status. Current results, version history and comparison history display that stored receipt rather than recomputing against newer settings.
6. An exact committed lab retry returns the original version through existing idempotency; later mappings do not change its validation outcome. The write transaction rolls back a rejected pair. Uploaded/source document records are not mutated by this mechanism.

## Fields and action rules

`GET /api/clinic/lab_unit_mappings` returns `{configuration, can_write}`. `PATCH` or `PUT` receives `{configuration: {expected_revision, request_key, mappings}}`; success returns an owned `configuration` receipt with its request key and separately `current_configuration`. An exact replay acknowledges its original version without claiming it is still the current configuration.

Each mapping: `code_system` (required, max240), `code` (required, max80), optional `code_version` (max80), `dimension` (required supplied label, max120), and `unit_codes` (1–20 explicit strings, each max80). Maximum200 mappings; duplicate test system/code/version entries reject. Matching is exact and case-sensitive after boundary whitespace trimming. A missing code version matches only a missing source version. Clearing all mappings explicitly returns to unconfigured state. No patient, actor, practice or site identity can be selected by the caller.

`expected_revision` addresses the existing clinic-default feature revision, not a separate counter. Configuration changes serialize with profile saves and lab-version checks using the existing practice lock. A later clinic profile save preserves the namespace; site profiles do not override clinic-wide mappings. Stale saves reject. Configuration request keys are bounded to the existing idempotency key format; replay requires the same actor membership and normalized mapping body.

Stored row `unit_validation`: `status` (`configured_match`, `unconfigured`, `unmapped`, `not_applicable`), `configuration_revision`, and supplied `dimension` or null. These server-added fields participate in the immutable version content digest and size limit, but not the caller's idempotency payload. A mapping match is only agreement with the clinic declaration; independent scientific/terminology approval remains external.

The editor freezes unresolved body/key, retains uncertainty after later denial, guards navigation/unload and offers explicit exact retry. Fresh pre-commit denial unlocks the draft; stale configuration requires explicit reload. Reload discards the draft only on a successful protected read. No browser persistence or automatic mutation retry.

## Ownership and dependency matrix references

Nova owns this MC06 increment: new lab mapping service/controller and MUI editor/receipt display; narrow changes to routes, `PracticeFeatures.revise`, `LabReports.create_version!`, `LabResultHistory`, Facilities and lab consumers. No schema migration, grant, clinical policy, provider adapter or fixture mutation. MC06 fulfillment helper completion services remain untouched. The earlier supplied-provenance increment changes separate normalization/display spans and remains independently owned. MC15 settings recovery should preserve this namespace when integrating its settings changes; Relay owns combined-tree compatibility.

## Implementation and acceptance

Implemented source mechanism with no default mappings. Static contract inspection followed route/controller/service authorization, revision and actor-owned replay; new-write transaction versus committed replay; namespace retention; server-only receipt assignment; frontend transport encoding and stored-receipt displays. `git diff --check` passed. No tests, typecheck, formatter/lint, bundle, Rails runtime or live configuration operation was run, as directed. Ruby remains absent in this cloud environment; do not provision it for this handoff.

Deferred synthetic verification when authorized: configured match/missing unit/wrong unit; differing system/code/version unknown; empty config unknown; foreign practice/read/write denial; stale revision and conflicting key; source/body preservation; invalid pair rollback; old version immutability; config change followed by committed lab replay; lost settings reply→403→exact retry→owned receipt; fresh403 unlock; late/unmounted response; profile save retains mappings. Existing API regressions live at `test/integration/clinic_lab_reports_test.rb`, `clinic_lab_result_history_test.rb` and practice feature settings coverage; no new test file is claimed.

## Checkpoint

Proposed tracker entry: **MC06 / 06-15 — source-only optional clinic-declared test/unit/dimension mapping mechanism:** authorized revisioned settings, exact configured-pair enforcement and immutable per-result validation receipts implemented. Empty or unmatched mappings remain explicitly unvalidated. Human-approved catalog values, terminology/scientific validation and runtime acceptance remain open. No score or validation credit assigned here.

## Last run

2026-09-30. Inspected base `d957313b4ea2a9873d61142f060a59c34260d644`. Completed the bounded optional-config source mechanism and static contract/diff inspection. Changed paths are confined to the scope above and this brief. Tests/build/lint deliberately unrun. Next: Relay integrates the source; approved clinic mappings and deferred synthetic verification remain distinct prerequisites. No live operations, credentials, clinical conversions, new PR, merge or deployment.
