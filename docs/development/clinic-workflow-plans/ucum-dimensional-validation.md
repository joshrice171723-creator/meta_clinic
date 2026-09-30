# Configured UCUM dimensional validation

## Assignment and authority

MC06 correction of the partial `d40d584aa55b7ef3cc68facbc91ee89eb0555501` increment, delegated2026-09-30. The former implementation checked only clinic-entered strings. This source pass implements mechanical linear-unit dimension reduction and separates raw supplied codes from validated UCUM codes. No clinical test mappings/ranges, conversions, grants, live config or patient/provider data. Josh directs source-only work: no tests/build/lint or runtime checks. Relay owns integration and scoring.

## Current sources and decisions

Accepted requirement: [hardening plan slice4](../non-vendor-clinic-hardening-plan.md#4-typed-laboratory-result-semantics), quantity/unit row: validated compatible dimensions before assigning a UCUM code, unchanged source text and no inferred conversion. Arbitrary dimension labels and allowlist membership did not meet that rule.

Reviewed primary sources2026-09-30:

- [UCUM specification2.2, 2024-06-17](https://ucum.org/ucum), lexical/grammar and dimensional semantics. Prefix/atom resolution, expressions and derived definitions support computation of base-dimension vectors. Scale factors do not affect dimensional compatibility. Special and arbitrary units need distinct treatment.
- [Official unmodified UCUM essence definitions](https://github.com/ucum-org/ucum/blob/ef4c31cd7d3bc81de1a1bf2cc8414bf502b6304f/ucum-essence.xml), pinned commit `ef4c31cd7d3bc81de1a1bf2cc8414bf502b6304f`, version2.2; SHA256 `dfccea1b5dc284245ebae97edd1dc03c45864da4e87df55bc9851797b4fd0b61`. Licensed definitions and license are vendored unchanged, with attribution/provenance README. They are technical unit definitions, not clinic/test defaults.
- U.S. applicability is the existing [US Core Laboratory Result Observation STU9](https://hl7.org/fhir/us/core/STU9/StructureDefinition-us-core-observation-lab-definitions.html) quantity-unit contract recorded in the approved plan/reference map. This increment does not claim FHIR conformance.

No UCUM parser is present in the locked Rails dependencies. Available reputable NLM JavaScript/reference Java implementations require runtimes not included in the API image. This bounded application-owned Ruby evaluator uses existing Nokogiri and official definitions without adding a runtime, dependency, service or network operation. It is not a full UCUM implementation or conversion engine.

## Connected journey

1. Existing clinic-settings writer explicitly supplies an exact test system/code/version, descriptive label, expected-dimension reference UCUM expression and approved unit list. No reference unit or clinical mapping is defaulted.
2. Server reduces the reference and every allowed unit through the pinned definitions. Unknown syntax/atoms, unsupported special/arbitrary units or dimension-incompatible allowed units reject configuration. A label cannot override computed dimensions.
3. For a mapped numeric/range result, server mechanically reduces the raw supplied unit and compares its vector against the explicit reference. Incompatibility rejects inside the existing lab write transaction. A compatible unit must additionally appear in the clinic's explicit allowlist.
4. Only that successful path stores a validated `unit_code` and `dimensionally_validated` receipt. Result value, display-unit text, source coding and provenance remain unchanged; no numeric conversion occurs.
5. Unconfigured/unmapped results or incomplete legacy mappings keep their supplied code as raw provenance with `unit_code: null`. They remain unknown/unvalidated. Other value kinds do not acquire a validated quantity code.
6. Reads expose historical membership-only codes as raw supplied codes, without updating encrypted payloads/digests or claiming retrospective dimension validation. Exact committed lab retries retain their historical outcome. Authorized exact settings retries can acknowledge old membership-only receipts without allowing a new legacy configuration write.

## Fields and action rules

Mapping adds required `expected_dimension_unit` (max80). Existing `dimension` is only a descriptive clinic label. Server stores computed `dimension_vector` and engine identity `ucum-2.2-linear-dimensions-v1`; caller-supplied engine/vectors are not accepted. Empty mappings remain explicitly unconfigured. Existing mappings without the new engine/reference are `configuration_incomplete` for new writes until explicitly completed.

`UcumDimensions` parses case-sensitive linear expressions: authoritative atoms/metric prefixes; positive integer factors; integer atom powers; dot products, left-to-right quotients and nested parentheses; annotations without dimensional meaning. Definitions recursively expand into the seven authoritative UCUM base-unit exponents. Prefixes/scalar factors are dimensionless; the evaluator never applies them to a result value. It validates lexical brackets/annotations, unknown atoms, unconsumed syntax and recursion/resource bounds. Parenthesized powers are unsupported under the pinned grammar. Maximum input240 bytes, nesting16, definition recursion32, exponent magnitude1000. User fields retain their existing80-character bound.

Special/non-ratio units, arbitrary-unit atoms and any definitions containing them fail closed with an explicit unsupported error. Their placeholder definitions are never treated as ordinary dimensionless units. This excludes e.g. special temperature/logarithmic expressions and arbitrary activity units; there is no claim of universal UCUM syntax/semantic support, scientific-equivalence validation or successful runtime conformance. Unsupported cases need a separately supported validator before they can be configured/promoted. Unmapped input remains raw, including unsupported strings.

Request contract accepts `supplied_unit_code`, with legacy `unit_code` treated as raw intake input. Existing normalization/idempotency payload shape remains stable. New immutable rows store raw `supplied_unit_code` separately; only mechanically validated mapped numeric/range rows populate `unit_code`. Receipt includes computed dimensions, reference expression, configuration revision and engine. New request bodies cannot supply receipts or validated status. Server read projection hides legacy unvalidated `unit_code` under `supplied_unit_code`; the original stored history is untouched.

History matching uses unchanged supplied-unit identity, not promotion state, and performs no cross-unit value conversion. API serializers, comparison selection/items, editable correction values and browser labels all distinguish supplied from validated code. The dimension receipt explains legacy membership-only status as unvalidated.

## Ownership and dependency matrix references

Nova owns the new evaluator and unmodified vendored definitions/license; changes to the mapping service/controller/editor, lab intake normalization/controller, lab serializer/history and existing lab consumer/receipt display. No schema migration or authorization grant. Earlier supplied-provenance normalization/display spans remain separate; Relay must retain them in the combined tree. Existing `facilities.write`, lab write authorization, tenant scopes, practice lock, immutable lab versions and protected exact retry remain the owning mechanisms. Fulfillment services are untouched.

## Implementation and acceptance

Implemented source mechanically compares vectors; string membership is only the additional clinic allowlist restriction. Inspected parser/definition field contract, prefix lookup, recursion, vector algebra, new configuration rejection, raw/validated read/write separation, protected replay and historical projection. Vendor bytes/license hashes were inspected; `git diff --check` passed. These are static source observations, not executed dimensional examples or runtime acceptance.

No tests, syntax/typecheck, lint/format, build, parser execution, clinical fixtures or live API calls ran. Ruby remains absent; no provisioning. Deferred verification when authorized must cover official UCUM linear validation/dimension fixtures, malformed expressions, prefixes, compound/powered units, equivalent dimensions with different factors, genuinely incompatible vectors, arbitrary/special rejection, missing mappings, raw preservation, immutable legacy projection, config/lab exact replay after changes, stale/denied writes and frontend raw-code correction round-trip. Clinical test→expected-dimension mappings remain external approved configuration, never inferred from a test name/value.

## Checkpoint

Proposed tracker wording: **MC06 / 06-15 — mechanical configured linear-UCUM dimension mechanism implemented in source; prior string-membership increment remains partial evidence.** Clinic-supplied reference expressions and allowed units are reduced through pinned authoritative definitions; incompatible dimensions reject. Raw/legacy/unconfigured values are not promoted to validated UCUM codes. Special/arbitrary UCUM support, runtime conformance evidence and approved clinic-specific mappings remain open. No full-UCUM, validation or clinical acceptance credit claimed.

## Last run

2026-09-30; base `d40d584aa55b7ef3cc68facbc91ee89eb0555501`. Source correction completed with static contract/diff review and official-definition hash inspection only. No tests/build/lint, grants, medical defaults, source-value conversions, live data, new PR, merge or deployment. Relay owns source integration; independent runtime proof is deferred as directed.
