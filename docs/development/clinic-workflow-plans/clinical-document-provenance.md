# Clinical document provenance scope check

## Assignment and authority

Nova was assigned MC05 optional supplied clinical-document metadata, conditional on the accepted requirement being unambiguous. No actual upload, patient document, provider call, credentials, new PR, deployment or score change. The intake helper owns per-question task reasons/actions and intake-save recovery; none of its paths are changed.

## Current sources and decisions

Inspected base `10707c6163ad43b5cdbb59f6f1c9e0225cd2901c` and exact portable matrix `d5c5d833769f223756b2112c86b590b06aaf1c3e`, [MC05 original-field source matrix](../../../records/implementation/2026-09-30-mc05-original-field-source-matrix.md), “Owning document/result metadata”. The matrix confirms generic document metadata is absent, but explicitly distinguishes that from an approved universal attachment editor: “An explicitly selected document-category clinical provenance contract would be needed before extending semantics.” This finding prevents implementation under the assignment's stated condition; it is not a request for a new clinical policy.

[Preserved M10](../weight-management-intake-tracking.md#m10--records-labs-consent-and-administrative-context) requires visible evidence source/date/version and forbids silently treating imported records as current or verified. Its evidence fields also include test/value/unit/range/laboratory, which existing laboratory records already own. It does not select applicable generic attachment categories, a generic metadata writer or a clinical metadata revision contract.

Actual source trace:

| Owner | Existing behavior / missing contract |
| --- | --- |
| `Clinic::Document` | Patient/practice/optional encounter/category; object key/version, checksum, size/media type, scan state; audited database timestamps. No clinical source/issue fields and no immutable clinical metadata revision model. Do not equate object version with a new metadata revision. |
| `DocumentsController`, routes | Patient index; scoped show; download. No generic upload/create/update or metadata-authoring operation. All require existing `documents.read`; read authority cannot be promoted into write authority. |
| `DocumentSerializer` | Returns file identity, availability and creation time; no clinical provenance projection. |
| `Documents::Access` | Download rechecks practice/site document read, requires clean scan state and audits the exact object version. Keep these protections. |
| `IntakeEvidence` / picker | Links document ID/object version/digest/scan state with category-derived source and database creation time. These are not a clinical issuing source or issue date. No changes to intake paths are authorized here. |
| Lab report/version owner | Separate source, collection/issue dates and immutable result versions already exist. New lab result organization/method/received/result provenance is published separately as `0bf6584dd9a5d68c20692dbac63ca91d09b07c4f`; it does not fill generic attachment provenance. |

## Connected journey

Implementation is blocked only at selection of the generic clinical document contract. Existing authorized document reads, availability/clean-scan download, lab entry/history and evidence selection remain available. No upload workflow, metadata editor, revision model or authenticated writer is claimed from the current source.

A bounded next assignment can select existing document categories used as clinical evidence and the supplied source/issue fields, then authorize a metadata writer and immutable revision relationship to the existing object version/checksum. After that selection, a staff member can read the exact selected file record, record only supplied metadata with unknowns left absent, recover an uncertain save, and reload the exact metadata revision without changing the stored object or calling a provider. This is a proposed contract boundary, not implemented behavior or an inferred clinical verification.

## Fields and action rules

Not selected. Source/issue metadata is missing, but the accepted record does not define which generic categories it applies to or whether issue information is a date, timestamp or partially known source date. Do not infer it from upload time/category, add requiredness, invent an author or convert unknown data. The generic metadata writer and correction/revision rule also require explicit selection; `documents.read` remains read-only authority.

## Ownership and dependency matrix references

M10 evidence source/date/version and OP-10 persistence/recovery apply after selection. Existing document access/scan protections remain owned by Documents. No new clinical matrix gate, automatic task, intake requiredness, provider authority or approval state is introduced. This source inspection changes no clinical workflow or data model, so no new clinical standard mapping is asserted; applicable U.S. document-reference guidance must be reviewed before implementing the selected metadata contract.

## Implementation and acceptance

**Documentation-only scope finding. No product code implemented.** No application tests, type checks or backend execution were run for this finding. Scoped source/read-contract inspection and diff whitespace check were performed. No actual attachment, fixture write, database or external provider was used.

Once a contract is selected, proportionate synthetic coverage should verify permitted/denied metadata write; wrong patient/practice/site; unknown source/date remaining absent; source values separate from upload time; immutable earlier revisions tied to unchanged object version/checksum; stale revision rejection; exact uncertain retry; reload and consumer projection. This is a proposed verification list, not executed proof.

## Checkpoint

Concrete missing choices for parent: applicable existing document categories; exact optional supplied source/issue fields and time precision; metadata writer authority; metadata correction/version relationship to object version. No safe generic implementation can satisfy the current conditional assignment without choosing those semantics. Preserve the lab/MC14 sources and keep this capability unimplemented rather than assigning Build credit to documentation.

Relay/scorer own tracker integration if needed. Proposed entry: “MC05 generic document source/issue metadata remains absent. Exact original matrix does not select a universal attachment metadata contract; applicable categories, supplied fields, writer and metadata version rule must be selected before implementation. Existing document access and linked lab provenance remain separate. No source-completion or score credit claimed.”

## Last run

2026-09-30. Read exact matrix `d5c5d833769f223756b2112c86b590b06aaf1c3e`, M10 and current document model/controller/serializer/access plus evidence consumers. Found absent generic metadata and missing category/write/revision contract; preserved this concrete scope handoff on `codex/pilot-document-provenance-scope`. No application or intake-helper paths changed. Next: parent selection or another unambiguous unowned source assignment; no runtime provisioning or silent wait is needed.
