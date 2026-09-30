# MC-15 cross-clinic mapping review — 2026-09-30

Base: `8c3d2358073acd14bb135a93a3adb1d7aa9034c8`. Dedicated branch: `codex/mc15-import-recovery-20260930`. Scope: local synthetic configuration mapping and missing-source recovery preview; no configuration application, migration, provider calls, credentials, deployment or score edits.

## Delivered behavior

The authorized Operations configuration snapshot now includes a separate cross-clinic mapping review. A saved format-1 source file remains in browser memory. Source and destination clinic identity are explicit. Locations and service offerings require explicit destination selection; matching names or coincident identifiers never select a destination. The downloaded review records both snapshots' supplied digests/timestamps, mappings, unresolved checks and protected-change boundaries. It is deliberately a review artifact rather than an executable import file.

The parser rejects malformed identity/provenance, duplicate IDs, invalid offering references and groups above 500 records; the UI rejects files above 1 MB and same-clinic sources. Missing source locations remain visible as unresolved references. Recovery requires a fresh complete source snapshot and a new explicit mapping. Missing destinations, duplicate consolidation and destination offering/location eligibility mismatches remain blocked. The source file can be cleared/replaced; parent snapshot refresh or changed provenance remounts the preview, discarding mappings and late file responses.

The existing manifest omits visit-type catalog records and clinician/price eligibility. Every source offering therefore retains a separate catalog-mapping blocker even after location/offering selections. Profiles, capability activation, insurance workflows and finalization retain the D-078 Meta Clinic/FDE review boundary. The existing Rails permission, revision, idempotency and finalized-profile enforcement in `Clinic::Configuration::PracticeFeatures` is untouched. No healthcare field, treatment rule or exchange contract changes; a clinical FHIR implementation guide does not define this local review-artifact workflow.

## Focused evidence

- Five model tests passed: explicit selection/no mutation, protected review, missing-source recovery, invalid/duplicate/ineligible destination mappings, and malformed/same-clinic denial.
- Two controlled Chrome browser fixture tests passed at a 1280px primary viewport: missing-source recovery, explicit selection, JSON download, clear and zero mutation requests; late file completion after component replacement is discarded. Repeated only those two after moving their generated cache into the worktree's ignored `tmp/` path.
- Four existing same-clinic comparison race tests passed. Their original broad file selector initially failed because there are now two file inputs; it was scoped to the existing accessible `Compare saved JSON` label without weakening assertions.
- TypeScript `--noEmit` and Vite production bundle passed. Owned/new files passed Prettier. Operations retains exactly the same two pre-existing formatting differences as the base revision; a baseline-versus-candidate formatted-diff comparison passed. Scoped Git diff whitespace review passed.
- Checks ran sequentially through the existing Desktop `bin/agent-resources` shared kernel lock used by Relay/Sage. Existing installed dependencies were reused; the SHA-256 of `pnpm-lock.yaml` matched (`392a07c3c46095d4861b40ba08369dd3cb3e87a6bd62e954c558c054f1f0b35f`). No prepared slot was modified, no dependency install occurred, and no Docker/database stack was started.
- Raw results remain at `C:/Users/joshr/Documents/Codex/2026-09-30/task-9/evidence/mc15-{checks,repair,final}.{json,txt}`. Initial failures are retained. Fixture code is committed with this record.

Frontend composition uses existing MUI `Button`, `TextField`/`MenuItem`, `Alert`, `Stack` and typography patterns. The MUI MCP documentation tools were unavailable; existing repository usage and installed dependency/types supplied the local API reference. No shared UI primitive or dependency changed.

## Remaining boundary

This slice supplies the missing local mapping/recovery review workflow. It does **not** complete cross-clinic import or rollback: catalog/reference mapping, a server-owned approved apply transaction, exact revision/idempotent retries, durable import history and recovery/rollback semantics require a subsequent bounded contract and implementation. A controlled fixture browser walkthrough is not connected real-API acceptance, clinical approval or migration/cutover proof. The independent scorer must assess the delivered source; no Build percentage was changed or claimed.
