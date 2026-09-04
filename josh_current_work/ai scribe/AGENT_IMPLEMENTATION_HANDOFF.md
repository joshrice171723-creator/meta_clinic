# AI Scribe implementation handoff

Date: 2026-09-03
Repository: `C:\Users\joshr\Desktop\Work\APPly`

## Implemented

The backend contains a synthetic, documentation-only scribe workflow:

- an encounter is tenant-scoped and cannot process until a versioned consent decision is accepted;
- transcript import is the supported source path, with encrypted source/segment content, SHA-256 content provenance, ordered timestamps, speaker labels, and quality flags;
- generation is behind a provider boundary (`synthetic-local` / `grounded-section-abstainer` v1), records input/output/template/model digests, grounds subjective/objective text to segment IDs, and abstains on assessment/plan rather than generating clinical conclusions or instructions;
- section edits create a new draft revision and supersede the parent; accept/reject actions are explicit and append-only events;
- approval requires all four sections to contain reviewer-resolved content with no warning codes and requires `scribe.approve`;
- export is separate from approval, requires confirmation and `scribe.export`, is idempotent, records the approved checksum and payload digest, and targets only the synthetic `parent_record_adapter` boundary. It does not write an EHR/official chart;
- deletion marks the encounter deleted and scrubs source, segment, generated, and human content while retaining safe lifecycle metadata;
- permissions are separate for read, write, approve, export, and delete, and all lookups begin from the current practice scope.

## Files

Backend files are in `apps/api/app/controllers/clinic/scribe`, `apps/api/app/models/clinic/scribe`, `apps/api/app/services/clinic/scribe`, and `apps/api/app/serializers/clinic/scribe`. The schema is `apps/api/db/migrate/20260903001230_create_clinic_scribe_workflow.rb`; the version was chosen after checking the shared checkout for collisions.

The source checkout was concurrently committed by another agent in commit `bf81eb3` (`Add patient reminder lifecycle foundation`) while the scribe files were staged. That commit contains the scribe backend files and migration alongside reminder files. No duplicate scribe commit should be made. The protected `apps/api/app/queries/clinic/billing/patient_ledger.rb` change was not staged by this work.

Shared integration still needs to be committed by the owning agent or a coordinated follow-up: `apps/api/app/models/ability.rb`, `apps/api/app/models/clinic/practice.rb`, and `apps/api/config/routes.rb` contain mixed reminder plus scribe changes in the working tree. The React route/page integration is not yet complete.

## Safe boundary

This is synthetic development functionality. It does not record audio, call a cloud model, diagnose, triage, prescribe, recommend treatment, submit an EHR record, or claim HIPAA/legal/clinical approval.
