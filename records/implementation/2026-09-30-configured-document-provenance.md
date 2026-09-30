# MC05 configured document metadata — 2026-09-30

Source branch `codex/mc05-document-provenance`, based on combined source `b14adecdf47897441f5348e41f69e69f666d1466`. Office, MC10 and other product lanes remain in the base. Parent explicitly authorized configured metadata source as an end-to-end batch, source publication and independent implementation layers; no tests, builds, lint, live actions, role grants, PR, main merge or deployment.

## Original requirement and standards scope

This implements the deliberately selected metadata owner from Nova's trace `96ce511f22282c7ad11b32a5d385e673c8b055a2` (`docs/development/clinic-workflow-plans/clinical-document-provenance.md` in that commit), [MC05 original-field matrix](2026-09-30-mc05-original-field-source-matrix.md), and [M10 records/evidence provenance](../../docs/development/weight-management-intake-tracking.md#M10--records-labs-consent-and-administrative-context). Their earlier missing category/write/precision contract is addressed by explicit per-category field configuration and a closed authority gate. No universal attachment semantics, lab interpretation or clinical verification is inferred.

[HL7 FHIR R4 DocumentReference definitions, version 4.0.1](https://hl7.org/fhir/R4/documentreference-definitions.html), inspected 2026-09-30, distinguish reference metadata, document lifecycle and underlying content integrity. The reference creation date is indexing time; author is not necessarily the informant or data-entry person. This is the global technical foundation already used in the U.S.-scoped product, not an adopted exchange profile or conformance claim. Mapping: retain document ID/object version/checksum and original content, keep supplied source/issuer separate from metadata recorder, and keep issue/received dates separate from existing storage timestamps. Partial calendar dates use supplied year/month/day precision without silently filling missing components. Internal day-one calendar validation is not stored or displayed as supplied precision.

## Source contract and authorization limits

Existing document categories gain a separate immutable configuration history. No category is created, selected or enabled by migration or seed. Revision zero means unconfigured, `applicable=false`, `fields=[]`. A permitted configurator deliberately selects applicability and any subset of optional `source`, `issuer`, `issued_date`, `received_date` fields. No field requiredness or category clinical meaning is inferred. Configuration only reuses the existing practice-level `facilities.write` boundary used for practice features; `documents.read` is also required by the category controller. Site-only configuration grants do not configure these practice-wide categories. This boundary grants no clinical metadata authoring permission.

The exact inspected `Ability::PERMISSION_RULES` includes `documents.read`, but no applicable generic clinical-document writer. `scribe.write` is scoped to separate scribe records, and `intake.write` owns intake, not generic documents. Neither is repurposed. `writer_available?` and API `can_write` remain false; `authorize_writer!` rechecks reader context, records a denied audit event and raises permission denial before recording metadata. No permission rule, role catalog, grant, migration backfill or configurable arbitrary action string is added. Activation requires an approved existing-or-separately-authorized generic document writer boundary and explicit category/field selection. Configuring a category alone cannot open the gate.

Metadata source includes model, API/controller, versioned service, encrypted storage and UI source for future approved authoring. The route is deliberately inaccessible for mutation while writer authority remains unconfigured; it is not a claim that users can currently save clinical metadata. No actual metadata, configuration or document was written during this source work.

## Data and persistence

`DocumentProvenanceConfiguration` is append-only per practice/category. `DocumentMetadataRevision` stores a numbered chain per existing document, exact document object version/checksum, patient/practice, actor membership, configuration ID, request key and recorded time. Supplied source, issuer, dates, date precision and correction reason stay in Active Record encrypted `content`; that field is excluded from PaperTrail snapshots and the entire API `metadata` root is filtered from request logs. The existing encryption runtime is reused without generating/changing keys. DB triggers forbid update/delete on both new tables. Composite foreign keys preserve document/patient/practice, actor, configuration tenant and same-document predecessor; model checks also bind configuration category and immediately preceding revision.

There are no changes to document object key/version/checksum, bytes, signatures, scan state or download controls. Existing documents and historical metadata remain untouched. Categories that cease to apply retain earlier metadata history; disabling authoring never rewrites supplied facts. Dates stay nullable strings with exact stated precision; unknown remains null. Calendar format is validated, but no clinical date ordering or freshness interpretation is invented. Corrections append a full snapshot with an encrypted supplied reason and prior revision reference.

Configuration and metadata creation paths use the existing protected idempotency receipt service. Same key/different data conflicts; exact replay returns the original saved configuration or metadata row. New records lock the category/document, check expected revision, bind expected category configuration revision, and compare exact original object version/checksum. Metadata replays resolve the editor's saved configuration revision instead of demanding the latest configuration before receipt resolution. A new write requires that version still be latest. Current writer denial executes before any metadata receipt/write.

## UI/API surfaces

The patient record composes `PatientDocumentProvenance` under the existing document-read capability, keyed by practice, actor, membership, authorization generation, site, patient and session epoch. Existing paginated document/category reads are reused. Source history/configuration endpoints:

- `GET /api/clinic/document_categories`: existing category schema plus explicit configuration and `can_configure`.
- `GET/POST /api/clinic/document_categories/:id/provenance_configuration`: paginated configuration history or append-only explicit configuration save.
- `GET/POST /api/clinic/patients/:patient_id/documents/:document_id/provenance`: current metadata and paginated history, or closed metadata write route.

Controller whitelists match frontend root bodies. Config save carries request key, expected revision, applicable and selected fields. Metadata save carries request key, expected metadata/configuration revisions, unchanged object version/checksum, optional supplied fields and correction reason. API acknowledgement includes exact key, saved revision and content; UI accepts only matching acknowledgements and retains an uncertain request's exact path/body/key. Stale responses retain edits for explicit saved-version review/rebase. Patient/document changes and navigation are blocked while edits or uncertain requests are present; protected drafts stay in memory, never localStorage. Context changes reset selection/history/drafts and ignore old save responses. Pages have bounded previous/next controls and failed read retry. No upload/download action, bytes editor, automated tasks or review approval is introduced.

## Evidence and remaining gates

Static inspection only: checked the original plan and scope trace, existing permissions, encrypted/append-only conventions, controller/body matching, composite FK targets, exact retry/receipt ordering, closed mutation gate, context resets and additive base preservation. `git diff --check` is a whitespace-only static check. An independent frontend builder owns the new component and its additive patient composition; root owns backend, evidence and publication. No tests, typecheck, build, lint, dependency install, Rails runtime, schema generation or database command was run. Runtime, encryption/audit, authorization/concurrency, partial-date and connected browser verification remain deferred. `db/structure.sql` is not fabricated.

Activation decisions still required: which existing categories and metadata fields are applicable, and the approved generic document writer boundary/authorized role assignments through existing reviewed administration. This slice neither chooses those values nor grants roles. The source is intentionally configurable and closed, not blanket-access clinical metadata authoring or full MC05 completion.

Portable deferred Sage schema command, for the existing owned synthetic runtime when verification is authorized again:

```sh
cd apps/api
python ../../bin/agent-resources run -- ../../bin/postgres exec env RAILS_ENV=test bundle exec rails db:migrate db:structure:dump
```

Do not provision a redundant stack, run live seed/reset or claim migration/runtime/release acceptance from this source commit.
