# Source-only combined integration — 2026-09-30

This is a source-accounting cutoff for the single product integration branch, not a release-readiness claim. Product integration does not change main or live. PR66 was merged externally with Office at21:20:20UTC; that release did not contain this larger product batch. The product branch now preserves verified current main7ded2cfe5768f9dea1fbba58a49805ff34fa3214 as its baseline. Josh's 21:08 UTC instruction changed the sprint target to 95% Build and deferred new tests/builds/lint. No new verification job was started after that instruction. Independent scoring owns percentages; tests do not earn Build credit.

## Retained source heads

| Lane | Exact retained source |
| --- | --- |
| MC01 starter-service recovery | 357ccf0d8ed953324e5bec82374ac58f729ed27c |
| MC02 atomic paid conversion | 445a8a2607f44011a877e7bf2ff3c111dbccd4a3 |
| MC03 identity/language | e6e6535a73fb4a4343bd2681f831e33273261426; matrix43b3b000e2fb9e3db4f2a08c10572a372234f893 |
| MC04 provenance | 2d96bed50ea815e294e3e80aea246926136d94bc |
| MC04 configured resources | ONLY080f183f1a5c5afe7e08d3da66d8ac795e74535a cherry-picked asf5d80322; provenance retained separately |
| MC04 operational policy | 8d9a0bbe98cbf7c7e7c199889485f102cf8ba4ec, superseding incomplete081f wiring state |
| MC04 overbook | ONLY a98cd14fa845169823acad39649e3ca13f99d046 cherry-picked; no other source from its branch |
| MC05 question context/manual recovery and patient intake retry | 0dc95c5299a0f3aac76fce275747293631f1c17c, retaining142599/20995/d5c5/784 |
| MC06 lab provenance/configured units | 0bf6584dd9a5d68c20692dbac63ca91d09b07c4f plusd40d584aa55b7ef3cc68facbc91ee89eb0555501 |
| MC06 repaired closure/type/replay guards | a0326be8ad494a40e9d260eeb226fd038bb2d957; replaces unrepaireddbef final source |
| MC07 repaired telehealth lifecycle | a1c118ac15fed8f78bb977334a77f66ed6e1231c, already retained at6099 |
| MC08 price/date/context | d9082a1f63b39b963be63d5a277c320267339a20, retainingd19 |
| MC09 entitlement/recurring allowance source | 17f7ee60e6a029a11eed3c0498294ee760324c84, retaining6ee and supplied schema795; prior source retained at1b9 |
| MC10 substitution/provenance/durable preparation | f0269c37c61798bf3f3d8c896ee769592264d6fe, retaining5f8/067a/10afe/a325/60158 |
| MC11 quote/local supplier preparation | 07121a53607f0176cf503deee635cf5ab351622d, retainingba08 |
| MC12 paging/return/refill/reschedule/callback | 25f296a83a09739dc5c5c29ed0a24dd5104528fa, retaining6caa/900/8b6/ed421/repaired8715 |
| MC12 waitlist | 7e58880a3cbfeaaec84d861254ffb0b355c66a75; original branch ancestry retained after earlier isolated cherry-pick |
| MC13 corrected unknown policy/overnight | 667338bdc74a984e27d9611732b9e5d04ffb1d3f plus correction460caf7d486ebc53ec9254088021be48e13facc9 |
| MC14 corrected source reconciliation | a11c737c67388860289782933594a66ba71829ea |
| MC15 corrected single/bulk bounded text import | f38cfea3e0a94c74b1fbfd11f31211d5cca709f8, retaining6c81; prior mapping review5383 remains |

All original branches/history are preserved. Old blocked source heads may remain as historical ancestors; the corrected final source above is the accounting target. No percentage credit is assigned by this manifest.

## Integration resolutions and source limits

- MC03 matrices conflicted because both source branches added the same path. The combined file retains both authored texts under labeled historical cutoffs; no source accounting, limitations or prior review statements were discarded.
- Supplied verified MC08 schema commit51111f92e2eca3ef0b9c65130cf51e43d8e8ebff contributes exactly three lines: price-revision column/check and migrationversion. Its migration-list conflict was resolved additively, preserving all existing combined schema content, including MC09's177added lines. No generated dump was fabricated or rewritten.
- MC08 and MC13 originally duplicated migrationversion20260930230000. Sage's unchanged-content rename460caf7d fixes MC13 to20260930230200; MC08 remains230000/230100. Static inventory now has unique versions. No migration ran during this source-only batch.
- Remaining new migration/schema stages are unfinished/unverified: MC04 overbook trigger; MC08 date/context; MC10 substitution/attempt provenance/durable preparation; MC11 quote/delivery preparation; MC13 nullable policy totals. The committed structure is not claimed to be a freshly regenerated complete schema for this batch. Preserve scoped generated artifacts when supplied; do not fill unknown values or backfill historical clinical choices.
- MC10's current UI submits preparation_id; both existing synthetic application callers create a preparation and pass its ID. Final sourcef026 retains caller/route/regression follow-up5f8 and allows exact owned committed legacy retries to reach idempotency with their original payload before preparation validation. Auth/actor/practice/key/digest remain checked; unmatched new requests require explicit preparation. This is statically inspected source; runtime verification remains deferred. No historical preparation is inferred or fabricated; current durable-preparation source is not a runtime-completion claim.
- Shared ClinicalPlanWorkflow retains prescription substitution handling and corrected proposed-kind/closure evidence checks. Routes/contracts were merged additively. These are concise source inspections, not runtime/type/build passes.
- PR4, actor credentials/activation, new Office scope, unrelated646bc531 and unfinished fast-builder increments are excluded. Original main recovery infrastructure is preserved.

## Verification and scoring cutoff

Latest independent score documents c18d37fa44a1de4efffeca47e5241bd330cb38cf assess ONLY6099fc5523b5d82ac2437767bec10f168aceeafd: Build80.5%, local Validation49.5%, External0%. This larger source batch is outside that frozen cutoff and awaits independent source scoring; no95% claim.

Existing completed evidence remains valid only at its tested source:6099 cloud45/45,types/build/style;1b9 cloud108tests/types/build/format completed before stop per parent handoff; isolated MC09 schema-bearing4401 restore27Rails/3641assertions,lint/eager/syntax. None is a combined runtime pass for this later batch.

Three MC09 architecture-contract failures independently reproduce identically at baseline8c. They remain disclosed pre-existing contract debt, not passing tests. MC03 backend failures likewise reproduce on baseline per Sage's disposition. CI billing fails before jobs; full CI is not green. New runtime, migration, type/build, connected/browser/provider and release/recovery verification is deferred. No main merge, production deployment, fixture reset, charges/provider calls, credentials/access changes or host automation activation occurred.

## External Office baseline reconciliation

Branch: `codex/relay-product-source-20260930`. Product source snapshot98d16213 remains preserved on the old local integration branch; the merged PR66 branch was not pushed again. The new branch retains main7ded2cfe and all its Office identity/task/UI, harness and infrastructure source. The sole baseline conflict was the schema-migration list; Office160000, MC09 000900 and MC08 230000 entries were retained together. Product schema changes remain additive to the supplied Office schema. No new PR, main merge, deployment, actor activation or credential action was performed. New product percentages require an independent frozen-cutoff assessment.

## Source increments after published1818a691 cutoff

MC15 f38cfea3 adds explicit source/destination/four-text-field mapping across existing drafts, frozen per-item exact requests and sequential partial application. Unknown items retain exact identity across denial; unresolved items never count as all applied. Recovery is in memory, not atomic or rollback-capable; no new offerings, catalog application or protected configuration changes. Nine authored regressions were not run.

MC06 d40d584a adds revisioned clinic-supplied lab unit mapping configuration through existing permission boundaries. Numeric/range results store their captured configured-pair validation receipt; unconfigured/unmapped remains explicitly unvalidated. No conversions, authoritative catalog values or clinical approval is supplied. Human mapping approval earns no source credit. The two frontend integration conflicts were resolved by preserving LabResultProvenance type extension and view plus adding the unit-validation receipt property and view. Backend, configuration and route additions merged without dropping existing provenance or repaired closure guards. No schema mutation or new tests/builds/lint were run for these increments.

## Next wave after immutable scoredfe6 cutoff

Sourcefe6db4c0764b1dc9a4d33b354bf744d6fc5c3f12 retains final MC10f0269c37, MC15bulkf38cfea3 and MC06unitsd40d584a. These three were not pending at that cutoff. Its independent scoring remains frozen to that exact tree.

MC09 recurring accounting17f7ee60 is the next source increment: explicit purchased allowance configuration, retained paid-window identity, immutable use/reversal and exact replay; historical agreements without allowance policy remain unconfigured. Migration20260930001100 follows prior entitlement00900 and references its table plus existing subscription event identities and immutable-record function. No version duplicate was found statically. The merge retains the complete existing Office/MC09/MC08 schema snapshot byte-for-byte; no allowance-table generated SQL or migration-version entry was fabricated. Fresh schema generation, migration execution and new authored regressions are unrun. Existing runtime_privileges.sql source adds the new allowance table to the protected append-only table list; that script was not executed and no access/role/token changed. Human commercial policy selection and clinical approval are not credited by source implementation. No main merge, new PR or deployment.

## Carrier preparation in the same next wave

ONLY carrier source commitc1b2aea0fae6dc8966438b709047a6193cdf454a was cherry-picked on the recurring-accounting wave. Its prior supplier07121 source was already retained. New preparation is bound to the existing shipment and retains actor/time/correlation/exact request identity, duplicate prevention and unknown-outcome recovery. It is explicitly a disconnected local carrier preparation, not carrier sending/tracking confirmation or receipt of stock; manual shipment/receiving remains separate. Migration20260930222511 has no duplicate source version. Its generated schema and runtime verification are unrun. No generated artifact was fabricated.

Sage independently checked immutablefe6 source consistency:235 migration IDs/classes unique, correctedMC13 retained, Office routes intact and no concrete dependency/function/route collision identified. Eight schema-artifact migrations atfe6 remained ungenerated. Recurring01100 follows entitlement00900. This newer wave adds allowance and carrier migrations, leaving ten schema-artifact stages pending; the fe6 check is not claimed to cover execution of this later wave. No test/build/lint job was started.

## Subsequent verified Office main advancement

While publishing the recurring/carrier wave, remote main advanced to5702fee0d757c0f2e4b77506f576eed24c5999c1, changing only Office repair-count/defect-lane source and its authored test. This external commit was merged into the isolated product branch without conflict, preserving both main ancestry and all product work. No test was executed by Relay and no main/deployment mutation occurred. Initial7ded baseline statements above are retained as historical checkpoints; current preserved main baseline is5702fee0.

## MC05 explicit saved-question task linkage

Source0dc95c5299a0f3aac76fce275747293631f1c17c retains the intake recovery source and adds explicit create/link against an immutable saved question/revision, eligible staff selection, transfer acknowledgement, status/history and cancelled-only reopen. Original answer references and exact uncertain receipt retries remain protected. This merge was conflict-free and adds no migration. Static source inspection does not establish runtime completion; no new tests/build/lint, automatic task assignment, clinical approval or percentage credit. Ten prior schema-artifact stages remain pending.

## Completed MC04 source paths in the next wave

ONLY compatibility commit080f183f was applied, followed by complete operational-policy head8d9a0bbe. Both integrations were conflict-free. Source inspection confirmed both route sets, Facilities operational editor alongside the scheduling editor, nested resource-compatibility editor, booking/rescheduling/series allocation methods, and preserved historical category and waiting projections. Compatibility is explicitly clinic-configured; absent policy is unconfigured. Waiting comparison is display-only, with missing/failed policy explicit and no automatic escalation or clinical defaults. Source receipts remain in the original contributed records. No runtime completeness, clinical values, percentage credit or release readiness is inferred.

Four additional unapplied migrations are authored: resource configuration212000 and operational policy213000/category213100/provenance213200. Generated SQL was not invented or appended. This wave now has fourteen pending schema-artifact stages. No test/build/lint, migration, main merge, new PR, deployment or access activation was performed; all prior source and frozen scoring cutoffs remain preserved.

## Disputed estimates and staff conversion boundary correction

Docs correction8a9000a7 is retained with both existing tracker/log histories preserved and the historical fe6 record restored explicitly as disputed. Legacy80.5 and91.1 are subjective planning estimates, not measured completion or release gates. Overall measured completion is undefined. The requirement inventory assesses immutablefe6 only; later source does not retroactively change that inventory or historical rows. No score award or release authorization follows this documentation.

Staff conversion sourceb3a9197b75bc0f34bcb51238fe8dbd04f8cf10a5 merged cleanly. Its ordinary caller already grouped local writes atomically; the defect was provider GET evidence and receipt delivery inside that enclosing transaction. The correction captures evidence before conversion locks, commits billing/onboarding/staff-paid state together, then delivers the receipt. Authorized paid-state recovery retries missing delivery without another charge. Existing public445a and recurring entitlement accounting are preserved. Exactly-once email delivery is not established; execution remains unverified. No migration or schema change, tests, build, lint, provider action or new percentage credit.

## Export issuance, simulated prescription lifecycle and bounded UCUM wave

MC14 source5c82d1761e3f87729d2b1d0bf9f6015e10940ec2 retains day-end a11 and provides explicit issuance for five existing Operations CSV reports, captured source/filter/version/actor/time, immutable artifact/digest/receipt and exact recovery. History is own-actor only; detail rows are selected-page bounded; lesson clinics are excluded. This is not general all-record export or selected retention/legal policy. Its manually represented forty-line SQL addition was removed from the canonical structure in a new preservation commit: the original author commit remains in ancestry, the migration remains source, and generated execution evidence is pending. Prior supplied verified schema artifacts stay unchanged. No fresh dump was fabricated.

MC10 source54319ae428a030f6f273141710669ce274102af6 retains final durable preparationf026 and adds explicitly SIMULATOR-only immutable response identity/metadata/local received time and cancellation/fill-notice request/result consumers. Unknown evidence has no invented received time. RxFill does not create dispense or infer medication/quantity. Live mappings remain disconnected; simulated source is not vendor acceptance.

MC06 source8b5c69b0d4d377e95fe0337ded8c8f262b2e138d retains configured mappingsd40d and adds bounded mechanical LINEAR-UCUM dimension comparison using pinned upstream definitions. Raw/legacy codes remain distinct from validated codes and historical payloads are preserved. Special/arbitrary units and clinic-approved mappings remain unsupported/unconfigured; full UCUM conformance is not claimed. The sole source conflict was the LabReportsController RESULT_FIELDS allowlist; it retains all prior provenance fields plus supplied_unit_code. Upstream license/data bytes are unchanged.

Docs follow-upb40e1c02132bfb55f08af2feee33e93bae348d67 corrects the fixed-fe6 staff-transaction inference while leaving numeric history unchanged. The ordinary staff caller already grouped local writes; laterb3a source separates GET evidence and receipt delivery. These cutoffs must not be conflated.

The export231000 and response235900 migrations add two ungenerated schema stages, now sixteen pending. Runtime, migration/schema, type/build/browser/conformance and release verification remain unrun. No new tests/build/lint, provider actions, main merge, new PR, deployment, activation or score award.

## Known release limitation: sandbox reset, issue34

[Open issue34](https://github.com/joshrice171723-creator/meta_clinic/issues/34) remains a known readiness limitation. Parent directly read tester evidence reporting a failed sandbox-reset retest on released7ded2cfe at approximately2026-09-30 21:40UTC: progress followed by a one-minute timeout and temporary500 before Retry. The old synthetic edits did clear. This is tester-reported evidence, not Relay reproduction; it does not establish later5702fee0 behavior. No demo-ready claim is supported by this report. Source-only integration neither reruns QA nor repairs this historical issue; any later readiness summary must retain the open limitation and exact evidence boundary.

## Durable bounded MC15 continuation source

Source1bde8909b4f19ca47f8311df81414a146e2c3ba4 retains bulkf38 and adds encrypted saved plans with original actor/site/source/destination/revision/request identity, persistent item states, authorized reload/resume and receipt reconciliation before explicit retry. Permission, authorization-generation or context loss blocks continuation. Scope remains four text fields on existing drafts, sequential non-atomic application, no general migration/rollback/automatic retry/grants; retention policy is unselected. Runtime encryption/persistence/concurrency/replay remains unverified.

The sole integration conflict was the supplied hand-authored structure SQL. Current canonical schema was retained exactly; author SQL remains preserved in the original commit history and the forward234515 migration remains authored but unapplied. Seventeen schema-artifact stages now await isolated generation; no SQL dump was fabricated, no database altered and no schema-generation job started by Relay. Generation is an implementation-artifact task and will not establish full runtime validation. No tests/build/lint, new PR, main merge, deployment or percentage award.

## Isolated schema-generation source blocker correction

Sage found migration20260930213011 calling delete_prefix on a Symbol from its %i table list while generating structure fromb14adecdf47897441f5348e41f69e69f666d1466. Correction173f0fd5 changes only table.to_s.delete_prefix('clinic_inventory_') in the constraint name. The other three migration delete_prefix uses already convert table.to_s; no additional occurrence of the same type error was found in that scoped source search. Relay ran no migration or runtime check; Sage owns resumed isolated generation. No completion score follows this correction.

Evidence-only sourcea82540157066ec7262b7eea6970be234043a6f7a is retained asbcd538df. It traces existing MC05 task transitions and closure contracts, not new feature implementation or retrospective completion credit. Office, all existing product source and canonical schema artifacts are preserved.

## Explicit draft field mapping and complete filtered export wave

MC15 sourcef6c3a906311c52f334032611785a8379e2b08669 extends the retained durable importer to fourteen existing editable fields with explicit field/reference mapping, exact previews and original request/receipt recovery. Reference targets must be current eligible existing records; billing reference reads retain existing billing authorization. Prices, inferred defaults, new record creation/merge, protected settings, clearing references/empty eligibility lists and status transitions are excluded. New current scope supersedes the older four-text-field limit without rewriting historical records. No generated migration or SQL is needed for this increment; encrypted durable-plan runtime verification remains pending.

MC14 source1cfab28ea4143998812e323c7c1abe41ef3baa98 replaces new selected-page exports with explicit complete filtered snapshots for the existing five reports, deterministic ordering, row counts, captured business-time/database snapshot and immutable receipts. Technical caps are10000combined detail rows,2MB CSV,4MB provenance and query/capture deadlines; exceeding a cap fails rather than silently truncating. Own-actor history, legacy exact recovery, lesson exclusion and day-end a11 source are retained. General unrestricted export/retention/legal acceptance is not inferred.

Both merges were clean. Source inspection traced the supported field allowlist/reference and receipt producer-consumer paths and export scope/limits/legacy replay. No tests/build/lint or runtime validation ran. Migration delta and canonical structure delta fromfa967ff201f6f9ea41ef9906a28d1ad53834ef7c are both zero, so Sage's isolated generation cutoff remains unchanged for schema purposes. Seventeen pending schema-artifact stages still await that generation. Office and other lanes are preserved; no percentage award, PR, main merge or deployment.

## Document provenance configuration and deliberately closed metadata writes

Sourced1e96341f6af80395cf3310f79b8222085ab0ac8 merged cleanly after7f7d4ea5. It supplies explicit category configuration/history and encrypted append-only metadata API/UI scaffolding, retaining immutable original document object-version/checksum references and original bytes/signatures. Source inspection confirmed writer_available? is false, can_write is false and authorize_writer! always records denial then raises before metadata writes. Existing facilities authority can configure categories but does not grant document metadata write authority; no categories, roles or grants were enabled. This is configuration/source scaffolding, not an activated document provenance workflow or new clinical approval.

Exactly one new migration:20260930235500_add_configured_document_provenance.rb (AddConfiguredDocumentProvenance), for clinic_document_provenance_configurations and clinic_document_metadata_revisions with tenant/reference constraints and immutable-record triggers. No canonical structure change. This migration is outside Sage's activefa967ff2 generation cutoff; its application/generated SQL remain pending, bringing the pre-generation pending artifact inventory to eighteen stages. No competing database work, tests/build/lint, live operation, PR, main merge, deployment or percentage award.

## Paid-period resolution and first generated schema artifact

MC09 sourcec779f9cf1459f0d6e8e9cb4630d815dbd314472b merged cleanly: deliberate staff selection of original paid-event evidence, reason/confirmation and immutable resolution history for future configured allowance accounting. Historical usage stays intact; conflicting unreversed usage blocks accounting. Legacy agreements without purchased policy remain unconfigured. The runtime_privileges.sql source adds the resolution table to the existing append-only protection list; no privilege script was executed or grant/access changed.

Sage generated schema8170390d1cf1cd1de1d4910b58c915ae017dfef7 directly fromfa967ff201f6f9ea41ef9906a28d1ad53834ef7c and reported all eighteen pending migrations plus the single dump completed in a disposable database, removed afterward with no active lock. Its schema-only source was applied as527965db without conflict. This actual generation record supersedes earlier provisional artifact counts; it supplies an implementation artifact, not functional validation or release readiness. Relay ran no database work or tests/build/lint.

Exactly three new migration files remain outside the generatedfa967 cutoff:20260930235500_add_configured_document_provenance.rb;20261001000100_create_subscription_paid_period_resolutions.rb;20261001000200_guard_resolved_allowance_accounting.rb. The first adds category configuration and encrypted closed-write metadata scaffolding; the second adds immutable paid-period resolutions and nullable allowance-resolution/accounted-at references; the third adds the future allowance accounting guard. Existing generated structure is retained exactly as supplied while these new sources await the next isolated generation. No new PR, main merge, deployment or percentage credit.

Remote main was observed advancing todad4e133f504f32a0367b635b907f60b45049cd9 during publication of the preceding provenance wave. That external source was not merged or altered; the product branch preserves its prior5702Office baseline. A later source reconciliation must inspect that delta without treating source publication as a deployment.
