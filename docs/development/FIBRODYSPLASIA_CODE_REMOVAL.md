# Fibrodysplasia-authored code removal manifest

Date: 2026-09-09

## Decision and attribution rule

The repository owner directed removal of code originally created by GitHub user `Fibrodysplasia` (William McDonough), while preserving files originally created by `joshrice171723-creator` even when William later edited them.

GitHub identifies commit `fc3f783611b6b5c713e6751bc57e8ab5bdf0aaca`, authored as `William McDonough <wdmcdonough@gmail.com>`, with the GitHub account `Fibrodysplasia`. Git history is the evidence source for the inventory.

A current tracked file is classified as removed when all of the following are true:

- it is code, runtime configuration, infrastructure, a test, or executable tooling under `.github/workflows`, `agent-harness`, `apps`, `bin`, `ops`, `site`, `test`, or `tools`;
- its first Git addition, following rename history, was authored with `wdmcdonough@gmail.com`;
- it still exists at the pre-removal revision `2a6f4bb367bf8c551a03e32ad628e39f9ab0d7a8`.

Markdown, product records, vault material, plans, images, and other non-code documentation were not classified as code and were not removed by this operation. Files first created by Joshua were preserved even when William later modified them.

## Scope summary

Removed files: **457**.

| Area | Files removed |
| --- | ---: |
| Agent harness | 2 |
| Database and fixtures | 32 |
| Frontend runtime/config | 15 |
| Frontend tests | 14 |
| GitHub workflows | 3 |
| Operations | 29 |
| Other | 1 |
| Rails application | 198 |
| Rails runtime/config | 55 |
| Rails tests | 51 |
| React application | 39 |
| Repository commands | 12 |
| Repository tests | 3 |
| Site | 3 |

## What must be rebuilt

Rebuild work must be based on Joshua-owned requirements and preserved documentation, without copying the deleted implementation:

1. Recreate the Rails runtime boundary: dependency manifests, boot/configuration, routes, database connection, application controller/model/job/mail foundations, and safe local commands.
2. Design new migrations and schema from the intended Meta Clinic domain. The removed migrations and generated structure are referenceable only as deletion history, not reusable implementation.
3. Reimplement required backend capabilities behind tenant-scoped authentication and authorization. Start with the minimum clinic identity, staff access, patient, scheduling, encounter, billing, inventory, messaging, reminders, scribe, telehealth, and workforce boundaries actually still desired.
4. Recreate the React/Vite application shell, API transport/contracts, navigation, shared UI foundation, and only the desired product workflows.
5. Rebuild tests from current requirements. Do not restore removed assertions merely to regain historical coverage.
6. Recreate CI, packaging, deployment, and operational tooling only after the new runtime boundaries exist.
7. Reconcile each preserved Joshua-created file listed below. These files remain in Git but may import or depend on removed code and are not evidence of a runnable application.

## Preserved Joshua-created files later edited by Fibrodysplasia

| Preserved path | Original creator | Original commit | Date |
| --- | --- | --- | --- |
| `apps/api/app/controllers/clinic/inventory/management_controller.rb` | joshrice171723-creator | `623a3fa09f65` | 2026-09-02 |
| `apps/api/app/models/clinic/inventory/recall_disposition.rb` | joshrice171723-creator | `623a3fa09f65` | 2026-09-02 |
| `apps/api/app/services/clinic/audit_recorder.rb` | joshrice171723-creator | `271bcdd2f669` | 2026-08-31 |
| `apps/api/app/services/clinic/inventory/inventory_wire.rb` | joshrice171723-creator | `623a3fa09f65` | 2026-09-02 |
| `apps/api/app/services/development/bulk_dev_seed.rb` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/coverage_versions.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/credit_notes.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/insurance_claims.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/inventory_adjustments.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/invoice_headers.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/manifest.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/office_items.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/patients.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/payments.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/pharmacy_batches.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/pharmacy_products.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/refund_events.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/role_grants.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/db/seed_data/bulk_v1/visits.csv` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/lib/tasks/development_seed.rake` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/script/generate_bulk_seed_csv.rb` | joshrice171723-creator | `7c072cad6971` | 2026-09-03 |
| `apps/api/test/integration/patient_portal_test.rb` | joshrice171723-creator | `bd61c05862d4` | 2026-09-03 |
| `apps/web/src/features/clinic/Reminders.tsx` | joshrice171723-creator | `2c9f7e73f9ba` | 2026-09-03 |
| `apps/web/src/features/inventory/InventoryApp.tsx` | joshrice171723-creator | `623a3fa09f65` | 2026-09-02 |
| `apps/web/src/features/inventory/inventoryContracts.ts` | joshrice171723-creator | `623a3fa09f65` | 2026-09-02 |
| `apps/web/src/features/patientPortal/PatientPortal.tsx` | joshrice171723-creator | `bd61c05862d4` | 2026-09-03 |
| `apps/web/src/features/patientPortal/PatientPortalActivation.tsx` | joshrice171723-creator | `bf81eb3a60bc` | 2026-09-03 |
| `apps/web/src/features/scribe/ScribeReviewWorkspace.tsx` | joshrice171723-creator | `2c9f7e73f9ba` | 2026-09-03 |
| `apps/web/src/features/scribe/types.ts` | joshrice171723-creator | `2c9f7e73f9ba` | 2026-09-03 |
| `apps/web/test/inventory.test.tsx` | joshrice171723-creator | `623a3fa09f65` | 2026-09-02 |
| `apps/web/test/scribe-review-workspace.test.tsx` | joshrice171723-creator | `2c9f7e73f9ba` | 2026-09-03 |
| `bin/apply` | joshrice171723-creator | `fa290222043e` | 2026-09-01 |
| `bin/doctor` | joshrice171723-creator | `fa290222043e` | 2026-09-01 |
| `bin/doctor.ps1` | joshrice171723-creator | `fa290222043e` | 2026-09-01 |
| `bin/install-apply` | joshrice171723-creator | `fa290222043e` | 2026-09-01 |
| `bin/start-dev` | joshrice171723-creator | `fa290222043e` | 2026-09-01 |
| `bin/start-dev.ps1` | joshrice171723-creator | `fa290222043e` | 2026-09-01 |

## Removed file manifest

Every path below was deleted from the working tree. The last pre-removal version remains recoverable from Git revision `2a6f4bb367bf8c551a03e32ad628e39f9ab0d7a8`.

| Removed path | Original creation commit | Date |
| --- | --- | --- |
| `.github/workflows/ci.yml` | `1455324bd358` | 2026-08-31 |
| `.github/workflows/deploy-staging.yml` | `1455324bd358` | 2026-08-31 |
| `.github/workflows/promote-production.yml` | `1455324bd358` | 2026-08-31 |
| `agent-harness/routes.json` | `acecd71806db` | 2026-09-03 |
| `agent-harness/test_agent_check.py` | `a129cf370338` | 2026-09-03 |
| `apps/api/.dockerignore` | `2a25f480a554` | 2026-08-30 |
| `apps/api/.github/dependabot.yml` | `2a25f480a554` | 2026-08-30 |
| `apps/api/.gitignore` | `2a25f480a554` | 2026-08-30 |
| `apps/api/.rubocop.yml` | `2a25f480a554` | 2026-08-30 |
| `apps/api/.ruby-version` | `2a25f480a554` | 2026-08-30 |
| `apps/api/Dockerfile` | `2a25f480a554` | 2026-08-30 |
| `apps/api/Gemfile` | `2a25f480a554` | 2026-08-30 |
| `apps/api/Gemfile.lock` | `2a25f480a554` | 2026-08-30 |
| `apps/api/Rakefile` | `2a25f480a554` | 2026-08-30 |
| `apps/api/app/controllers/application_controller.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/app/controllers/clinic/api_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/authorization/role_grants_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/base_controller.rb` | `2959aa253f3d` | 2026-08-30 |
| `apps/api/app/controllers/clinic/billing/invoices_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/care/encounter_notes_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/care/note_templates_controller.rb` | `8f95f278593d` | 2026-09-01 |
| `apps/api/app/controllers/clinic/care/observations_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/care/patient_addresses_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/care/patient_care_summaries_controller.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/app/controllers/clinic/care/patient_chart_history_controller.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/app/controllers/clinic/care/patients_controller.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/controllers/clinic/clinicians_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/context_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/dashboard_controller.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/controllers/clinic/document_categories_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/documents_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/facilities_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/inventory/items_controller.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/controllers/clinic/messaging/message_intents_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/operation_receipts_controller.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/app/controllers/clinic/role_versions_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/scheduling/appointments_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/scheduling/encounters_controller.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/clinic/scheduling/provider_assignments_controller.rb` | `bc68da473aef` | 2026-09-02 |
| `apps/api/app/controllers/clinic/scheduling/tracking_board_controller.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/app/controllers/clinic/staff/members_controller.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/controllers/concerns/.keep` | `2a25f480a554` | 2026-08-30 |
| `apps/api/app/controllers/concerns/clinic/api/pagination.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/concerns/clinic/api/request_parameters.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/controllers/concerns/launch/material_access.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/controllers/concerns/member_authentication.rb` | `2959aa253f3d` | 2026-08-30 |
| `apps/api/app/controllers/identity/api/development_access_controller.rb` | `69e92009da64` | 2026-08-31 |
| `apps/api/app/controllers/identity/api/sessions_controller.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/controllers/identity/api/settings_controller.rb` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/api/app/controllers/launch/api/contact_messages_controller.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/controllers/launch/api/inquiries_controller.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/controllers/launch/api/learning_progresses_controller.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/controllers/launch/api/materials_controller.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/controllers/launch/api/paperworks_controller.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/jobs/application_job.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/app/mailers/application_mailer.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/app/models/ability.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/models/application_record.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/app/models/clinic/appointment.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/audit_delivery_receipt.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/audit_event.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/audit_resource_manifest.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/care/allergy.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/care/condition.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/care/encounter_precaution.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/app/models/clinic/care/medication_statement.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/care/note.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/care/observation.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/care/observation_source.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/care/patient.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/care/patient_address_version.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/care/patient_care_need.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/app/models/clinic/care/patient_communication_preference.rb` | `b92f654431f2` | 2026-08-31 |
| `apps/api/app/models/clinic/care/patient_contact.rb` | `b92f654431f2` | 2026-08-31 |
| `apps/api/app/models/clinic/care/patient_demographics.rb` | `b92f654431f2` | 2026-08-31 |
| `apps/api/app/models/clinic/care/patient_emergency_contact.rb` | `b92f654431f2` | 2026-08-31 |
| `apps/api/app/models/clinic/care/patient_history_review.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/app/models/clinic/care/patient_membership.rb` | `bc68da473aef` | 2026-09-02 |
| `apps/api/app/models/clinic/care/patient_social_history.rb` | `b92f654431f2` | 2026-08-31 |
| `apps/api/app/models/clinic/clinician_assignment.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/clinician_credential.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/clinician_profile.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/coverage_version.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/credit_note.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/department.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/document.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/document_category.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/encounter.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/encounter_note.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/encounter_note_revision.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/encounter_note_signature.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/encounter_participant.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/insurance_claim.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/catalog_event.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/count.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/count_approval.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/entry.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/hold.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/hold_release.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/item.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/location.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/lot.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/pharmacy_batch.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/pharmacy_batch_event.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/pharmacy_movement.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/pharmacy_product.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/profile.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/receipt.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/receipt_line.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/stock_movement.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/supplier.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/inventory/supplier_address_version.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/invoice.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/invoice_line.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/membership.rb` | `2959aa253f3d` | 2026-08-30 |
| `apps/api/app/models/clinic/message_attachment.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/message_delivery_event.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/message_intent.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/message_outbox.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/model_version.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/operation_receipt.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/app/models/clinic/payment_allocation.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/payment_event.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/practice.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/refund_event.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/role_grant.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/role_grant_event.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/room.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/site.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/staff/address_version.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/clinic/staff/member.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/clinic/visit_type.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/concerns/.keep` | `2a25f480a554` | 2026-08-30 |
| `apps/api/app/models/concerns/clinic/append_only.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/concerns/clinic/auditable.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/concerns/clinic/tenant_scoped.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/identity/preference.rb` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/api/app/models/launch/contact_message.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/launch/learning_progress.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/launch/material.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/launch/paperwork.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/models/member_session.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/app/models/organization.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/permission.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/platform_audit_event.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/role_version.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/role_version_permission.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/models/user.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/app/policies/demo_content.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/policies/development_access.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/app/queries/clinic/inventory/catalog_query.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/queries/clinic/inventory/product_details_query.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/queries/launch/inquiries_query.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/queries/launch/materials_query.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/serializers/clinic/authorization_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/billing/invoice_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/care/encounter_note_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/care/observation_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/care/patient_care_summary_serializer.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/app/serializers/clinic/care/patient_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/clinician_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/document_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/facility_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/inventory/catalog_response.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/serializers/clinic/inventory/item_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/inventory/product_response.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/serializers/clinic/message_intent_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/role_version_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/scheduling/appointment_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/scheduling/encounter_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/serializers/clinic/scheduling/tracking_board_serializer.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/app/serializers/clinic/staff_member_serializer.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/app/services/clinic/authorization.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/authorization/grant_access.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/authorization/revoke_access.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/billing/allocate_payment.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/billing/draft_invoice.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/billing/money.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/billing/post_invoice.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/care/add_patient_address.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/care/create_encounter_note.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/care/note_template_catalog.rb` | `8f95f278593d` | 2026-09-01 |
| `apps/api/app/services/clinic/care/record_observation.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/care/revise_encounter_note.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/care/sign_encounter_note.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/care/soap_note_payload.rb` | `8f95f278593d` | 2026-09-01 |
| `apps/api/app/services/clinic/documents/access.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/idempotency.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/app/services/clinic/inventory/access.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/services/clinic/inventory/ndc_catalog.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/services/clinic/inventory/quantity.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/services/clinic/inventory/receiving.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/services/clinic/messaging/create_intent.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/messaging/record_delivery.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/scheduling/assign_provider.rb` | `bc68da473aef` | 2026-09-02 |
| `apps/api/app/services/clinic/scheduling/book_appointment.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/scheduling/close_encounter.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/scheduling/create_encounter.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/clinic/scheduling/transition_appointment.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/app/services/development/backend_samples.rb` | `4989742264cb` | 2026-08-31 |
| `apps/api/app/services/development/demo_account.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/services/development/omni_access.rb` | `69e92009da64` | 2026-08-31 |
| `apps/api/app/services/development/pharmacy_stock.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/services/development/test_accounts.rb` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/api/app/services/development/test_clinic.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/services/integrations/fda/ndc_directory.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/services/launch/contact_submission.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/services/launch/sign_paperwork.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/services/launch/training_progress.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/app/services/staging/demo_clinic.rb` | `fc12359a7712` | 2026-09-01 |
| `apps/api/app/views/pwa/service-worker.js` | `2a25f480a554` | 2026-08-30 |
| `apps/api/bin/brakeman` | `2a25f480a554` | 2026-08-30 |
| `apps/api/bin/bundler-audit` | `2a25f480a554` | 2026-08-30 |
| `apps/api/bin/ci` | `2a25f480a554` | 2026-08-30 |
| `apps/api/bin/dev` | `1455324bd358` | 2026-08-31 |
| `apps/api/bin/docker-entrypoint` | `1455324bd358` | 2026-08-31 |
| `apps/api/bin/import-legacy-sqlite` | `1455324bd358` | 2026-08-31 |
| `apps/api/bin/postgres` | `1455324bd358` | 2026-08-31 |
| `apps/api/bin/rails` | `2a25f480a554` | 2026-08-30 |
| `apps/api/bin/rake` | `2a25f480a554` | 2026-08-30 |
| `apps/api/bin/rubocop` | `2a25f480a554` | 2026-08-30 |
| `apps/api/bin/setup` | `2a25f480a554` | 2026-08-30 |
| `apps/api/bin/thrust` | `2a25f480a554` | 2026-08-30 |
| `apps/api/bin/verify-backend` | `4989742264cb` | 2026-08-31 |
| `apps/api/bin/verify-postgres` | `1455324bd358` | 2026-08-31 |
| `apps/api/config.ru` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/application.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/boot.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/bundler-audit.yml` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/ci.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/database.yml` | `1455324bd358` | 2026-08-31 |
| `apps/api/config/environment.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/environments/development.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/environments/production.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/environments/test.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/initializers/browser_security.rb` | `2959aa253f3d` | 2026-08-30 |
| `apps/api/config/initializers/content_security_policy.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/initializers/filter_parameter_logging.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/initializers/inflections.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/initializers/member_security.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/initializers/paper_trail.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/config/initializers/postgresql.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/config/initializers/session_store.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/locales/en.yml` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/puma.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/config/routes.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/db/migrate/20260830000100_create_member_foundation.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/db/migrate/20260830000200_add_client_portal.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/db/migrate/20260830000300_create_synthetic_clinic_workspace.rb` | `2959aa253f3d` | 2026-08-30 |
| `apps/api/db/migrate/20260830000400_create_pharmacy_inventory.rb` | `f77ce3da20dc` | 2026-08-30 |
| `apps/api/db/migrate/20260830000500_build_inventory_foundation.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/db/migrate/20260830000600_harden_inventory_posting.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/db/migrate/20260830000700_clarify_package_units.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/db/migrate/20260830000800_index_inventory_worklists.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/db/migrate/20260831000100_create_identity_preferences.rb` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/api/db/migrate/20260831000200_implement_approved_clinic_erd_schema.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/db/migrate/20260831000300_create_tenant_bound_paper_trail_storage.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/db/migrate/20260831000400_add_created_at_to_clinic_model_versions.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/db/migrate/20260831000700_use_role_permissions_for_inventory_authorization.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/db/migrate/20260831000800_harden_verified_backend_invariants.rb` | `4989742264cb` | 2026-08-31 |
| `apps/api/db/migrate/20260831000900_add_patient_registration_history.rb` | `b92f654431f2` | 2026-08-31 |
| `apps/api/db/migrate/20260831001000_remove_contact_consent_duplicates.rb` | `b92f654431f2` | 2026-08-31 |
| `apps/api/db/migrate/20260831001100_prepare_soap_note_drafts.rb` | `8f95f278593d` | 2026-09-01 |
| `apps/api/db/migrate/20260901000100_add_patient_care_summary_records.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/db/migrate/20260902000100_index_patient_care_summary_records.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/db/migrate/20260902000200_encrypt_observation_values.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/db/migrate/20260902000300_create_clinic_operation_receipts.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/db/migrate/20260902000500_harden_clinic_operation_receipts.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/db/migrate/20260902002700_reconcile_patient_membership_schema.rb` | `768f3f39857d` | 2026-09-02 |
| `apps/api/db/migrate/20260902002800_verify_patient_membership_schema.rb` | `768f3f39857d` | 2026-09-02 |
| `apps/api/db/migrate/20260902009900_bind_observation_encrypted_values.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/db/migrate/20260902009901_validate_observation_binding_ids.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/db/migrate/20260902009902_upgrade_clinic_operation_receipt_digests.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/db/migrate/20260902009903_version_clinic_operation_receipt_digest_keys.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/db/migrate/20260903000100_replace_identity_appearance_palettes.rb` | `a3647c46c06f` | 2026-09-03 |
| `apps/api/db/runtime_privileges.sql` | `1455324bd358` | 2026-08-31 |
| `apps/api/db/seeds.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/db/structure.sql` | `1455324bd358` | 2026-08-31 |
| `apps/api/lib/tasks/.keep` | `2a25f480a554` | 2026-08-30 |
| `apps/api/lib/tasks/clinics.rake` | `f77ce3da20dc` | 2026-08-30 |
| `apps/api/lib/tasks/development_accounts.rake` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/api/lib/tasks/inventory.rake` | `1455324bd358` | 2026-08-31 |
| `apps/api/lib/tasks/members.rake` | `2a25f480a554` | 2026-08-30 |
| `apps/api/public/400.html` | `2a25f480a554` | 2026-08-30 |
| `apps/api/public/404.html` | `2a25f480a554` | 2026-08-30 |
| `apps/api/public/406-unsupported-browser.html` | `2a25f480a554` | 2026-08-30 |
| `apps/api/public/422.html` | `2a25f480a554` | 2026-08-30 |
| `apps/api/public/500.html` | `2a25f480a554` | 2026-08-30 |
| `apps/api/script/.keep` | `2a25f480a554` | 2026-08-30 |
| `apps/api/test/architecture/boundaries_test.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/test/architecture/erd_contract.json` | `4989742264cb` | 2026-08-31 |
| `apps/api/test/architecture/erd_contract_test.rb` | `4989742264cb` | 2026-08-31 |
| `apps/api/test/architecture/paper_trail_configuration_test.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/test/architecture/patient_membership_schema_migration_test.rb` | `768f3f39857d` | 2026-09-02 |
| `apps/api/test/architecture/routes_contract.json` | `1455324bd358` | 2026-08-31 |
| `apps/api/test/controllers/.keep` | `2a25f480a554` | 2026-08-30 |
| `apps/api/test/fixtures/files/.keep` | `2a25f480a554` | 2026-08-30 |
| `apps/api/test/fixtures/materials.yml` | `1455324bd358` | 2026-08-31 |
| `apps/api/test/helpers/.keep` | `2a25f480a554` | 2026-08-30 |
| `apps/api/test/integration/.keep` | `2a25f480a554` | 2026-08-30 |
| `apps/api/test/integration/backend_verification_test.rb` | `4989742264cb` | 2026-08-31 |
| `apps/api/test/integration/client_portal_test.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/test/integration/clinic_administrative_permissions_test.rb` | `bc68da473aef` | 2026-09-02 |
| `apps/api/test/integration/clinic_audit_failure_test.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/test/integration/clinic_encounter_notes_idempotency_test.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/test/integration/clinic_provider_assignment_test.rb` | `bc68da473aef` | 2026-09-02 |
| `apps/api/test/integration/clinic_site_scoped_provider_test.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/test/integration/clinic_tracking_board_test.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/test/integration/clinic_workspace_test.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/test/integration/development_login_test.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/test/integration/member_flows_test.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/test/integration/named_test_accounts_test.rb` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/api/test/integration/patient_care_summary_test.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/test/integration/pharmacy_workspace_test.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/test/integration/production_demo_test.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/test/integration/session_duration_test.rb` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/api/test/integration/settings_test.rb` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/api/test/integration/transport_test.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/test/legacy/sqlite_structure.sql` | `f77ce3da20dc` | 2026-08-30 |
| `apps/api/test/mailers/.keep` | `2a25f480a554` | 2026-08-30 |
| `apps/api/test/models/.keep` | `2a25f480a554` | 2026-08-30 |
| `apps/api/test/models/ability_test.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/test/models/clinic/backend_integrity_test.rb` | `4989742264cb` | 2026-08-31 |
| `apps/api/test/models/clinic/erd_models_test.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/test/models/clinic/inventory/foundation_test.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/test/models/clinic/inventory/pharmacy_test.rb` | `f77ce3da20dc` | 2026-08-30 |
| `apps/api/test/models/clinic/observation_encryption_test.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/test/queries/clinic/inventory/catalog_query_test.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/test/services/clinic/audit_and_idempotency_test.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/test/services/clinic/domain_logic_test.rb` | `600976f337a8` | 2026-08-31 |
| `apps/api/test/services/clinic/inventory/ndc_catalog_test.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/test/services/clinic/record_observation_test.rb` | `fa70b8993c94` | 2026-09-02 |
| `apps/api/test/services/development_backend_samples_test.rb` | `4989742264cb` | 2026-08-31 |
| `apps/api/test/services/development_bulk_dev_seed_test.rb` | `31cc4e0c280e` | 2026-09-03 |
| `apps/api/test/services/integrations/fda/ndc_directory_test.rb` | `f77ce3da20dc` | 2026-08-30 |
| `apps/api/test/services/launch/workflows_test.rb` | `1455324bd358` | 2026-08-31 |
| `apps/api/test/support/authorization_helpers.rb` | `543676474bdd` | 2026-08-31 |
| `apps/api/test/support/pharmacy_method_override.rb` | `f77ce3da20dc` | 2026-08-30 |
| `apps/api/test/test_helper.rb` | `2a25f480a554` | 2026-08-30 |
| `apps/api/test/verification/backend_races.rb` | `4989742264cb` | 2026-08-31 |
| `apps/web/.dockerignore` | `1455324bd358` | 2026-08-31 |
| `apps/web/.gitignore` | `1455324bd358` | 2026-08-31 |
| `apps/web/.node-version` | `1455324bd358` | 2026-08-31 |
| `apps/web/Dockerfile` | `1455324bd358` | 2026-08-31 |
| `apps/web/design/clinic-intake-handoff-prototype.html` | `b6a5700a24a6` | 2026-09-02 |
| `apps/web/design/clinic-workspace-directions.html` | `a3352334b22c` | 2026-08-31 |
| `apps/web/index.html` | `1455324bd358` | 2026-08-31 |
| `apps/web/nginx.conf` | `1455324bd358` | 2026-08-31 |
| `apps/web/package-lock.json` | `1455324bd358` | 2026-08-31 |
| `apps/web/package.json` | `1455324bd358` | 2026-08-31 |
| `apps/web/public/clinic.css` | `2959aa253f3d` | 2026-08-30 |
| `apps/web/public/launch.css` | `2a25f480a554` | 2026-08-30 |
| `apps/web/public/shared.css` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/App.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/api/client.ts` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/api/contracts.ts` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/features/clinic/Appearance.tsx` | `75b4e119b446` | 2026-08-31 |
| `apps/web/src/features/clinic/Billing.tsx` | `bc68da473aef` | 2026-09-02 |
| `apps/web/src/features/clinic/CareFlow.tsx` | `0edc0b461dc5` | 2026-08-31 |
| `apps/web/src/features/clinic/CareIndicators.tsx` | `b6a5700a24a6` | 2026-09-02 |
| `apps/web/src/features/clinic/ChartSelectionPage.tsx` | `b6a5700a24a6` | 2026-09-02 |
| `apps/web/src/features/clinic/ClinicFrame.tsx` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/web/src/features/clinic/FrontDesk.tsx` | `bc68da473aef` | 2026-09-02 |
| `apps/web/src/features/clinic/HistoryOfPresentIllness.tsx` | `3d662fd0581b` | 2026-09-04 |
| `apps/web/src/features/clinic/Operations.tsx` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/web/src/features/clinic/Patients.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/features/clinic/ReviewOfSystems.tsx` | `3d662fd0581b` | 2026-09-04 |
| `apps/web/src/features/clinic/Staff.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/features/clinic/TrackingBoardPage.tsx` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/web/src/features/clinic/Workspace.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/features/clinic/appearance.css` | `75b4e119b446` | 2026-08-31 |
| `apps/web/src/features/clinic/appearancePreferences.ts` | `75b4e119b446` | 2026-08-31 |
| `apps/web/src/features/clinic/careFlow.css` | `0edc0b461dc5` | 2026-08-31 |
| `apps/web/src/features/clinic/chartNavigation.ts` | `b6a5700a24a6` | 2026-09-02 |
| `apps/web/src/features/clinic/clinicFrame.css` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/web/src/features/clinic/clinicNavigation.tsx` | `848280a49507` | 2026-09-02 |
| `apps/web/src/features/clinic/staffWorkflow.css` | `bc68da473aef` | 2026-09-02 |
| `apps/web/src/features/clinic/trackingBoard.css` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/web/src/features/clinic/trackingBoardApi.ts` | `b6a5700a24a6` | 2026-09-02 |
| `apps/web/src/features/clinic/trackingBoardData.ts` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/web/src/features/identity/Login.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/features/identity/Settings.tsx` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/web/src/features/inventory/Office.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/features/launch/Contact.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/features/launch/Home.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/features/launch/Inquiries.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/features/launch/Paperwork.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/features/launch/Portal.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/features/launch/Training.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/main.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/shared/forms.css` | `1455324bd358` | 2026-08-31 |
| `apps/web/src/shared/ui.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/test/appearance.test.tsx` | `75b4e119b446` | 2026-08-31 |
| `apps/web/test/care-indicators.test.tsx` | `b6a5700a24a6` | 2026-09-02 |
| `apps/web/test/client.test.ts` | `1455324bd358` | 2026-08-31 |
| `apps/web/test/clinic-navigation.test.ts` | `848280a49507` | 2026-09-02 |
| `apps/web/test/clinic-shell.test.tsx` | `bc68da473aef` | 2026-09-02 |
| `apps/web/test/intake-handoff-prototype.test.ts` | `b6a5700a24a6` | 2026-09-02 |
| `apps/web/test/presentation.test.tsx` | `1455324bd358` | 2026-08-31 |
| `apps/web/test/provider-flow.test.tsx` | `b6a5700a24a6` | 2026-09-02 |
| `apps/web/test/review-of-systems.test.tsx` | `3d662fd0581b` | 2026-09-04 |
| `apps/web/test/staff-workflow.test.tsx` | `bc68da473aef` | 2026-09-02 |
| `apps/web/test/test-logins.test.tsx` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/web/test/tracking-board.test.tsx` | `bcc9fc85f67f` | 2026-08-31 |
| `apps/web/test/trackingBoardCareFixtures.ts` | `b6a5700a24a6` | 2026-09-02 |
| `apps/web/test/trackingBoardFixtures.ts` | `9e6e6ada553a` | 2026-09-04 |
| `apps/web/tsconfig.json` | `1455324bd358` | 2026-08-31 |
| `apps/web/vite.config.ts` | `1455324bd358` | 2026-08-31 |
| `bin/agent-check` | `432f63a865ff` | 2026-08-31 |
| `bin/agent-preflight` | `432f63a865ff` | 2026-08-31 |
| `bin/create-agent-skill` | `a3647c46c06f` | 2026-09-03 |
| `bin/dev` | `1455324bd358` | 2026-08-31 |
| `bin/lib/development_lifecycle.rb` | `05eead0c9800` | 2026-09-04 |
| `bin/lib/task_trace.rb` | `05eead0c9800` | 2026-09-04 |
| `bin/startdev-refresh` | `a3647c46c06f` | 2026-09-03 |
| `bin/task-trace` | `05eead0c9800` | 2026-09-04 |
| `bin/vault-audit` | `acecd71806db` | 2026-09-03 |
| `bin/verify-agent-harness` | `a3647c46c06f` | 2026-09-03 |
| `bin/verify-vault` | `432f63a865ff` | 2026-08-31 |
| `bin/verify-web` | `1455324bd358` | 2026-08-31 |
| `dev_server_startup` | `16ec89bca1dd` | 2026-09-01 |
| `ops/aws/ec2/apply-api.service` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/apply-postgres.service` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/apply-review-cert-reload.sh` | `600976f337a8` | 2026-08-31 |
| `ops/aws/ec2/apply-review-renew.service` | `600976f337a8` | 2026-08-31 |
| `ops/aws/ec2/apply-review-renew.timer` | `600976f337a8` | 2026-08-31 |
| `ops/aws/ec2/apply-run.sh` | `f77ce3da20dc` | 2026-08-30 |
| `ops/aws/ec2/apply-web.service` | `f77ce3da20dc` | 2026-08-30 |
| `ops/aws/ec2/configure-delivery.py` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/delivery.yaml` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/install-release.sh` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/nginx.conf` | `f77ce3da20dc` | 2026-08-30 |
| `ops/aws/ec2/plan.sh` | `f77ce3da20dc` | 2026-08-30 |
| `ops/aws/ec2/postgres-secrets.yaml` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/postgres.sh` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/prepare-reviewer.py` | `600976f337a8` | 2026-08-31 |
| `ops/aws/ec2/release.py` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/render-ssm-command.py` | `f77ce3da20dc` | 2026-08-30 |
| `ops/aws/ec2/review-access.yaml` | `600976f337a8` | 2026-08-31 |
| `ops/aws/ec2/review_access.py` | `600976f337a8` | 2026-08-31 |
| `ops/aws/ec2/stack.yaml` | `f77ce3da20dc` | 2026-08-30 |
| `ops/aws/ec2/targets.json` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/test_configure_delivery.py` | `cf3080939bee` | 2026-08-31 |
| `ops/aws/ec2/test_deploy_workflow.py` | `458572d41bb9` | 2026-09-01 |
| `ops/aws/ec2/test_launcher.py` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/test_release.py` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/test_review_access.py` | `600976f337a8` | 2026-08-31 |
| `ops/aws/ec2/verify-container.py` | `1455324bd358` | 2026-08-31 |
| `ops/aws/ec2/verify-review-edge.py` | `600976f337a8` | 2026-08-31 |
| `ops/aws/ec2/verify-review-host.py` | `600976f337a8` | 2026-08-31 |
| `site/.gitignore` | `2a25f480a554` | 2026-08-30 |
| `site/.openai/hosting.json` | `2a25f480a554` | 2026-08-30 |
| `site/components.json` | `2a25f480a554` | 2026-08-30 |
| `test/agent_harness/test_agent_preflight.py` | `a129cf370338` | 2026-09-03 |
| `test/development/development_lifecycle_test.rb` | `05eead0c9800` | 2026-09-04 |
| `test/development/task_trace_test.rb` | `05eead0c9800` | 2026-09-04 |

## Recovery and verification limits

- This is a normal Git deletion commit; deleted material can be inspected or recovered from the parent revision without rewriting history.
- The authorship classification is file-level. It intentionally does not delete William's later line edits from Joshua-created files, because the owner explicitly asked to preserve those files.
- The repository is expected to fail builds and tests immediately after removal. Passing runtime, security, clinical, deployment, or release status is not claimed.
- Before rebuilding a preserved file, inspect its imports and routes against the removed manifest and replace missing dependencies with new owner-approved implementations.
