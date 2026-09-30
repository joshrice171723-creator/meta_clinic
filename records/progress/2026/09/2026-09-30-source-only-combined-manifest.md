# Source-only combined integration — 2026-09-30

This is a source-accounting cutoff for the single product integration branch, not a release-readiness claim. Product integration does not change main or live. PR66 was merged externally with Office at21:20:20UTC; that release did not contain this larger product batch. The product branch now preserves verified current main7ded2cfe5768f9dea1fbba58a49805ff34fa3214 as its baseline. Josh's 21:08 UTC instruction changed the sprint target to 95% Build and deferred new tests/builds/lint. No new verification job was started after that instruction. Independent scoring owns percentages; tests do not earn Build credit.

## Retained source heads

| Lane | Exact retained source |
| --- | --- |
| MC01 starter-service recovery | 357ccf0d8ed953324e5bec82374ac58f729ed27c |
| MC02 atomic paid conversion | 445a8a2607f44011a877e7bf2ff3c111dbccd4a3 |
| MC03 identity/language | e6e6535a73fb4a4343bd2681f831e33273261426; matrix43b3b000e2fb9e3db4f2a08c10572a372234f893 |
| MC04 provenance | 2d96bed50ea815e294e3e80aea246926136d94bc |
| MC04 overbook | ONLY a98cd14fa845169823acad39649e3ca13f99d046 cherry-picked; no other source from its branch |
| MC05 question context/manual recovery and patient intake retry | 142599baf63fdd310021fc51176456f66d06c63e, retaining20995/d5c5/784 |
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
