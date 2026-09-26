# Multi Clinic Sandbox Coverage Matrix

Status: implementation audit and dependency plan, 2026-09-26. This document maps the current application to the requested two-to-three-month synthetic operating history. It is linked from the [sandbox assignment](multi-clinic-demo-sandbox.md) and the [implementation tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md). It does not mark unexecuted workflows as working.

## What the user is building

One resettable, visitor-isolated organization has two clinics, two sites per clinic, 10–20 staff per site and about 300 patients per site. A visitor should be able to inspect an ordinary but varied two-to-three-month work history: patient charts, bookings and no-shows, encounter notes and treatment changes, medication and allergy states, laboratory follow-up, prescriptions, inventory custody and use, bills and memberships, and local connector outcomes. Reset should replace visitor edits with the same date-anchored operational story. The goal is to expose workflow and scale defects before production; a sparse showcase cannot substitute for the large dataset.

## Evidence and reading rules

- **Observed in source and focused checks:** `DemoSandboxPopulation` creates 1,200 site-attributed patients, eight weeks of 60 completed and 10 cancelled/no-show bookings per site, two future weeks of 60 bookings per site, six visit types per clinic, invoices with full/partial/unpaid allocations, staff and clinicians. `DemoSandboxInventoryHistory` creates dated receipts and weekly use; `DemoSandboxJourneys` creates four linked open clinical stories and four future follow-ups. The existing guided fixtures add smaller route examples. See [population](../../../apps/api/app/services/development/demo_sandbox_population.rb), [inventory history](../../../apps/api/app/services/development/demo_sandbox_inventory_history.rb), [journeys](../../../apps/api/app/services/development/demo_sandbox_journeys.rb), [entry/reset](../../../apps/api/app/services/development/shared_demo_lesson.rb), and [schema](../../../apps/api/db/structure.sql).
- **Executed this work session:** the population case passed 109 assertions. The same-date reset fingerprint passed 5 assertions after mutating and adding a patient; first entry took 81.6 seconds and reset 79.7 seconds on the local test database. A later-date reset case also passed in a separate two-case run. The strict comparison covers business table counts and selected operational values; it excludes append-only `clinic_model_versions` and cannot establish bitwise identity, browser-wide acceptance, concurrent throughput or external provider results. See [population checks](../../../apps/api/test/integration/guided_clinic_demo_test.rb) and [reset fingerprint](../../../apps/api/test/integration/demo_sandbox_reset_fidelity_test.rb).
- **Additional source implementation, not executed proof:** sandbox entry now calls chart history and paired measurements, current lab cases and contact attempts, an in-office stock administration with an encounter bill, scheduling exceptions, a 16-visit open queue with intake and handoff states, care-plan/goal cases, low-stock gauze with draft reorders, workforce schedules and draft timecards, suppressed appointment reminders, staff-origin refills and one reviewed refill, Growth prospects, local membership payment states, and an unavailable video booking. These additions have only source/syntax review; reset time, record counts, authorization and page rendering have not been measured again. The historical population assertion above predates these additions.
- **Evidence labels below:** `B` = populated bulk baseline; `S` = small linked/guided fixture; `C` = app capability found but sandbox row-level proof is absent; `G` = requested story/data absent or insufficient; `R` = reference, security, audit or system table, where a fake row is not a useful target. A table or route may belong to more than one workflow. A mapped route is an available API contract, not proof the demo visibly exercises it.

## Dependency-ordered workflow matrix

| ID | Workflow and owning data | Current evidence | Important gap and next implementation step | Acceptance after reset |
| --- | --- | --- | --- | --- |
| W00 | Visitor isolation and entry: demo visitors, lessons, runs, sessions | B: two practices per visitor; scoped reset and shell reuse. | Measure concurrent entry/reset and ensure one visitor never changes another. Keep large workload. | Distinct tenant IDs; two simultaneous visitors; repeatable baseline. |
| W01 | Organization, clinic, site, address, hours, rooms, departments | B: two clinics and four sites with rooms/hours. | Require an explicitly chosen location specialty before any patient can be assigned, then validate booked capacity, address and timezone. | Four configured sites, site-consistent foreign keys and hours; zero patients on untyped sites. |
| W02 | Clinic profile, features, permissions, roles, service catalog | B/S: prepared primary-care and weight-management practice profiles, operator access. Current `clinic_type` is practice-wide. | Move specialty selection to locations with a compatible practice fallback, then include a behavioral-health location and verify specialty-specific visit and form routing. Record selected capabilities and persona permissions before dependent clinical routes. | Four locations have explicit, repeatable specialty state and valid role access. |
| W03 | Workforce: staff, employment, site assignment, shifts/timecards | B: 12 added staff and three clinicians per site. Source-added: eight weekly site schedules, one approved leave request and one draft timecard per site; payroll export remains disabled. Runtime proof is pending. | Broaden time activity and coverage exceptions only after the basic site flow works; do not imply payroll completion. | Per-site roster, coverage and dated work activity. |
| W04 | Patient identity and panels | B: 300 patients per site with demographics and stable clinic-distinct names; a primary site is persisted. | Add deterministic age/language/contact/family variation; check cross-site search, duplicates and selected-site views. | Exactly 300 primary-site patients per site, same-clinic links. |
| W05 | Patient chart: problems, allergies, medication list and history | Source-added: broad allergy and medication states, encounter reviews, signed retrospective notes, and paired dated measurements on existing encounters for eight patients/site. Runtime proof is pending. | Add clinically coherent problem changes and prior chart revisions; review sampled charts in the browser. | Every chart has interpretable section state; sampled active/stopped/allergy cases and prior revisions survive reset. |
| W06 | Historical and future scheduling | B: 1,920 completed visits, 320 cancelled/no-show bookings and 480 upcoming bookings. Source-added: one reschedule and waitlist request per site, two local offers, and follow-up bookings; runtime proof is pending. | Add supported walk-in, late-arrival, video-eligible and accepted waitlist outcomes; preserve 60 completed/site/week. | Weekly status/type distribution, slot/clinician/site integrity. |
| W07 | Patient Flow, intake, front desk and Tracking Board | Source-added: 16 more booked, confirmed, open visits across four sites, with waiting, incomplete intake, pending handoff and accepted handoff cases; four earlier story encounters remain. Runtime proof is pending. | Exercise arrival and checkout on the same visit; inspect the queue stages in the browser. | Visible queues and handoffs on the same patient/visit. |
| W08 | Encounter and treatment note history | B: 1,920 completed encounter shells. Source-added: reviews across historical encounters, signed retrospective notes, and paired vital observations for 32 patients without adding visits; runtime proof is pending. | Link selected plans and treatment changes to the historical cohort; keep other imported encounter shells labeled as lower fidelity. | Sample charts show prior, current and changed treatment over 2–3 months. |
| W09 | Medication requests, review, prescription and refill | S: authorized orders and one local accepted attempt. Source-added: per-site rejected, unknown and failure-before-send simulator outcomes, one approved refill linked to an authorized order, and one request still in review; runtime proof is pending. | Add changed/discontinued order history and resolve an uncertain attempt; keep outside-pharmacy orders separate from clinic stock. | Version-linked order/review/attempt/refill trail. |
| W10 | Laboratory order, result and follow-up | Source-added: five current open-encounter cases per site for pending order, pending review, routine review, flagged follow-up and corrected review; an immutable not-reached local contact attempt with an owned retry task leaves the flagged follow-up open. Runtime proof is pending. | Establish a broader dated result history and inspect the open contact task in the app. | Order-to-result-to-contact chain on one patient without fake lab interface success. |
| W11 | Care plans, goals, recalls and care gaps | Source-added: plan and goal revision cohorts per site with due, overdue and achieved states plus same-patient follow-up bookings; runtime proof is pending. | Add direct plan-to-appointment links and care-gap closure if supported; inspect prior/current projections. | Previous and current plan state visible with owner/date. |
| W12 | Inventory, procurement and stock use | B: five operations products/site, opening and refill receipts, 160 dated weekly stock-use movements. Source-added: one medication administration from same-site stock, extra gauze use to low-stock state, and a local draft reorder per clinic; runtime proof is pending. | Add partial shipment and variance examples, then reconcile ledger and site/lot/expiry in the running app. | Stock ledger reconciles receipts and use, site/lot/expiry stay coherent. |
| W13 | Historical billing, payment and receivables | B: 1,920 posted visit invoices, half fully paid, one quarter partial and one quarter unpaid. Source-added: one small local credit per site on an unpaid posted bill and local membership payment states; runtime proof is pending. | Add supported refund/failure reconciliation and inspect net balance after credits; distinguish imported financial volume from workflow transitions. | Invoice line totals, allocations and open balances reconcile. |
| W14 | Memberships, contracts, renewals and forecast | Source-added: five patient agreements per clinic with local paid, failed, canceled and pending payment states. Runtime proof is pending. | Add supported dated renewal cycles, visit-to-agreement links and calibrate a two-month forecast without creating future invoices. | Historical membership events and clearly labeled projections reconcile. |
| W15 | Messages, reminders and patient contact | Source-added: 12 suppressed appointment reminders and eight staff-origin refill requests; runtime proof is pending. | Add local sent/failed and follow-up contact outcomes only with a valid identity or provider state; never dispatch externally during reset. | Actor, source, date and next action are visible. |
| W16 | Telehealth and scribe | S: guided review workspace. Source-added: one roomless video booking per clinic under the enabled sandbox service scope, with provider setting explicitly disabled/unconfigured; runtime proof is pending. | Add supported local preparation and wrap-up/documentation states when the provider policy permits; never imply a media session occurred. | One complete local-only trail and one unavailable case. |
| W17 | Other connectors: pharmacy, lab, supplier, payment, payroll | S/C: local payment and prescription simulators; inventory supplier references. | Map each provider boundary to stored local success, rejected/unknown or disconnected state only where the app supports it; do not fabricate external acceptance. | Source and simulation label remain truthful after reset. |
| W18 | Analytics, organization switching and performance | B: populated schedule, billing and stock queries; only one browser Tracking Board route viewed. | Walk each priority route, verify query response and counts, profile entry/reset with large dataset and concurrent visitors. | 2–3-month views load within an agreed budget; no cross-tenant leakage. |
| W19 | Reset and replay integrity | B: transactional two-clinic reset; strict same-date semantic fingerprint passed. | Extend fingerprints to chart revisions and new linked stories as added. Preserve audit provenance rather than pretending generated record IDs or first-time shell audit events are identical. | Mutate multiple domains, reset same and later dates, compare relationships, counts, content and timing. |

## Patient chart breadth contract to implement after W04

Every one of the 1,200 patient charts should expose a valid demographics and site context plus an explicit allergy and medication reconciliation state. A recorded `unknown`/`not reviewed` state is materially different from a documented absence. Distribute positive allergies, known-none, unknown, active medications, historical/stopped medications, contraindication review, and medication changes among coherent profiles; do not prescribe or infer treatment from a random diagnosis. At least the patients with completed imported encounters should have a readable dated visit summary, and a smaller, deliberately varied longitudinal cohort should have full note/version, order, result, plan, message and billing links. Define those cohort sizes in a versioned manifest and verify them per clinic/site; no proposed percentage in this paragraph is implemented today.

## Sequencing, replay and performance

1. Keep W00–W04 as prerequisites: organization → practice → site/hours/rooms → roles/staff → patients/chart identities.
2. Extend the versioned recipe with patient profile archetypes and stable source keys. Add allergies/medication reconciliation before orders, and encounter documentation before claiming a completed care journey.
3. Build schedule → check-in/intake → encounter → note/treatment revisions → orders/results/prescription or inventory use → checkout/bill/payment → follow-up/membership cycle. Use existing domain operations for stateful records; bounded inserts remain appropriate only for synthetic background volume with validated tenancy, state and totals.
4. Preserve the eight-week 60-completed-visit/site target while adding controlled exceptions. Add a third month only after the two-month complete-chart matrix is internally consistent; date changes must shift dates and preserve stable story keys.
5. Reset visitor-owned clinics in the existing transaction. Compare semantic content and all practice-scoped business table counts, plus relationship/amount/stock reconciliation. First-time membership/role audit events in persistent shells may differ; retain and report that history. Measure entry, reset, page query latency and concurrent isolation independently.

## Preparation and reset speed: ranked research

The local first entry took 81.6 seconds and same-date reset took 79.7 seconds. Those are two focused test observations, not a benchmark distribution. `SharedDemoLesson.enter!` does the work synchronously in one transaction. The generator already uses Rails `insert_all!` for high-volume appointment, encounter, invoice, invoice-line and payment rows, while patients and staff use model creation and inventory/clinical stories use domain operations. Rails documents `insert_all!` as a single multirow insert that skips model instantiation, callbacks and validations; replacing the remaining writes indiscriminately could skip required encryption, tenancy, audit or stock rules. [Rails `insert_all!`](https://api.rubyonrails.org/v8.0.2.1/classes/ActiveRecord/Relation.html)

| Rank | Recommendation | Why and proof needed |
| --- | --- | --- |
| 1 | Instrument one complete entry and reset by stage: cleanup, clinic preparation, patients, background history, inventory and linked journeys. Capture wall time, SQL count and rows per stage across repeated runs. | No stage timings or query profile currently identify the bottleneck. Optimize only the dominant measured stage; retain total entry/reset and concurrent-visitor measurements. |
| 2 | Remove repeated lookups and batch only record families whose model behavior and relationships are proven safe to bypass. Keep existing `insert_all!` batches and stateful domain operations. | This is the smallest likely total-time improvement, but its benefit is a hypothesis until measured. PostgreSQL recommends batching inserts to reduce overhead; Rails' bulk insert omits callbacks and validations. [PostgreSQL population guidance](https://www.postgresql.org/docs/17/populate.html), [Rails `insert_all!`](https://api.rubyonrails.org/v8.0.2.1/classes/ActiveRecord/Relation.html) |
| 3 | If the measured work still exceeds the desired request budget, move preparation into a tracked background job with progress, idempotent retry and a visitor-specific lock. | This can make entry responsive; it does not by itself make record creation faster. Rails describes background jobs as moving work outside the request-response cycle. [Rails Active Job guide](https://guides.rubyonrails.org/active_job_basics.html) |
| 4 | Consider PostgreSQL `COPY` only for a large, isolated, callback-free background table after a direct comparison with the existing bulk inserts. | PostgreSQL says `COPY` has lower overhead than `INSERT`, but it is less flexible; existing Rails batches may already be sufficient. Do not drop indexes or foreign keys in the shared sandbox to accelerate loading, because that changes availability and integrity checks. [PostgreSQL population guidance](https://www.postgresql.org/docs/17/populate.html) |
| 5 | Defer template-database cloning or prepared-tenant row copying unless profiling shows ordinary batching cannot meet the budget. | The current sandbox shares a database with visitor-isolated tenants. PostgreSQL template cloning copies a whole database and requires no other sessions on the template; tenant-row copying would require careful identity, foreign-key, encryption, audit and reset mapping. [PostgreSQL `CREATE DATABASE`](https://www.postgresql.org/docs/17/sql-createdatabase.html) |

Faker or another Ruby name generator can vary content but is not a write-speed strategy. Before accepting an optimization, compare repeated first-entry and reset timings, p50/p95 over enough runs, row and relationship counts, stock and money reconciliation, same/later-date fingerprints, and two concurrent visitors. None of these speed options has been implemented or benchmarked here.

## Generated appendices

The following appendices enumerate **all 258 `CREATE TABLE` definitions** in the checked-in PostgreSQL structure and **all 455 `/api/demo` and `/api/clinic` route rows** returned by Rails on 2026-09-26 (253 POST, 140 GET, 42 PATCH, 16 PUT, 4 DELETE). Of the tables, 29 are mapped to bulk evidence, 8 to small examples, 33 to reference/system evidence and **188 still need row-level coverage checks**. These are traceability classifications, not proof that every row is populated or route is exercised. `Wxx` refers to the workflow matrix above. For complex nested routes, the mapped workflow is a triage owner; inspect the controller/action and underlying service before implementation.

## Table inventory — 258 schema tables

`B` means this table family is explicitly populated by the bulk generator or its direct operation; `S` means a small linked example is visible in source. `?` means row coverage still needs direct verification. `R` marks system/reference evidence, not a requirement to seed a fake row. A table may receive indirect rows even if marked `?`; this inventory does not infer counts from model names.

| Table | Schema line | Workflow | Seed proof |
| --- | ---: | --- | --- |
| `ar_internal_metadata` | 1952 | R | R |
| `clinic_allergies` | 1964 | W05 | ? |
| `clinic_appointment_overbook_exceptions` | 2019 | W06 | ? |
| `clinic_appointment_series` | 2057 | W06 | ? |
| `clinic_appointment_series_changes` | 2086 | W06 | ? |
| `clinic_appointment_series_occurrences` | 2144 | W06 | ? |
| `clinic_appointments` | 2185 | W06 | B |
| `clinic_assessment_revisions` | 2236 | W08 | ? |
| `clinic_audit_delivery_receipts` | 2297 | R | R |
| `clinic_audit_events` | 2332 | R | R |
| `clinic_audit_resource_manifests` | 2369 | R | R |
| `clinic_billing_receipts` | 2403 | W13 | ? |
| `clinic_billing_services` | 2442 | W13 | ? |
| `clinic_capacity_rules` | 2482 | W06 | B |
| `clinic_care_goal_revisions` | 2525 | W11 | S |
| `clinic_care_plan_revisions` | 2576 | W11 | S |
| `clinic_cash_drawer_sessions` | 2624 | W13 | ? |
| `clinic_cash_pay_estimate_lines` | 2671 | W13 | ? |
| `clinic_cash_pay_estimates` | 2712 | W13 | ? |
| `clinic_cash_tenders` | 2757 | W13 | ? |
| `clinic_clinical_plan_links` | 2797 | R | R |
| `clinic_clinical_task_dependencies` | 2845 | W07 | ? |
| `clinic_clinical_task_events` | 2879 | W07 | ? |
| `clinic_clinical_tasks` | 2915 | W07 | S |
| `clinic_clinician_assignments` | 2965 | W03 | B |
| `clinic_clinician_credentials` | 3002 | W03 | ? |
| `clinic_clinician_profiles` | 3040 | W03 | B |
| `clinic_communication_endpoints` | 3074 | W15 | ? |
| `clinic_communication_preferences` | 3114 | W15 | ? |
| `clinic_conditions` | 3157 | W05 | ? |
| `clinic_coverage_versions` | 3209 | R | R |
| `clinic_credit_notes` | 3244 | W13 | ? |
| `clinic_departments` | 3284 | W01 | B |
| `clinic_document_categories` | 3317 | R | R |
| `clinic_documents` | 3351 | R | R |
| `clinic_encounter_completion_reviews` | 3393 | W08 | ? |
| `clinic_encounter_diagnosis_revisions` | 3441 | W08 | ? |
| `clinic_encounter_follow_ups` | 3490 | W08 | ? |
| `clinic_encounter_handoff_events` | 3539 | W08 | ? |
| `clinic_encounter_handoffs` | 3580 | W08 | ? |
| `clinic_encounter_intake_history_refs` | 3621 | W08 | ? |
| `clinic_encounter_intake_observation_refs` | 3656 | W10 | ? |
| `clinic_encounter_intake_revisions` | 3691 | W08 | ? |
| `clinic_encounter_note_revisions` | 3736 | W08 | ? |
| `clinic_encounter_note_signatures` | 3774 | W08 | ? |
| `clinic_encounter_notes` | 3812 | W08 | ? |
| `clinic_encounter_participants` | 3849 | W08 | ? |
| `clinic_encounter_precautions` | 3888 | W08 | ? |
| `clinic_encounters` | 3938 | W08 | B |
| `clinic_immunization_revisions` | 3979 | R | R |
| `clinic_insurance_claims` | 4039 | W13 | ? |
| `clinic_intake_consent_revisions` | 4073 | W08 | ? |
| `clinic_inventory_catalog_events` | 4112 | W12 | ? |
| `clinic_inventory_control_reviews` | 4147 | W12 | ? |
| `clinic_inventory_count_approvals` | 4184 | W12 | ? |
| `clinic_inventory_count_session_events` | 4219 | W12 | ? |
| `clinic_inventory_count_session_lines` | 4262 | W12 | ? |
| `clinic_inventory_count_sessions` | 4295 | W12 | ? |
| `clinic_inventory_counts` | 4338 | W12 | ? |
| `clinic_inventory_entries` | 4379 | W12 | B |
| `clinic_inventory_exception_reviews` | 4434 | W12 | ? |
| `clinic_inventory_hold_releases` | 4479 | W12 | ? |
| `clinic_inventory_holds` | 4516 | W12 | ? |
| `clinic_inventory_locations` | 4556 | W12 | B |
| `clinic_inventory_lots` | 4601 | W12 | B |
| `clinic_inventory_profiles` | 4637 | W12 | ? |
| `clinic_inventory_purchase_cart_items` | 4675 | W12 | ? |
| `clinic_inventory_purchase_carts` | 4722 | W12 | ? |
| `clinic_inventory_purchase_order_events` | 4761 | W12 | ? |
| `clinic_inventory_purchase_order_lines` | 4799 | W12 | ? |
| `clinic_inventory_purchase_orders` | 4847 | W12 | ? |
| `clinic_inventory_recall_closures` | 4898 | W12 | ? |
| `clinic_inventory_recall_dispositions` | 4937 | W12 | ? |
| `clinic_inventory_recall_lots` | 4977 | W12 | ? |
| `clinic_inventory_recalls` | 5010 | W12 | ? |
| `clinic_inventory_receipt_lines` | 5052 | W12 | B |
| `clinic_inventory_receipts` | 5100 | W12 | B |
| `clinic_inventory_receiving_sessions` | 5143 | W12 | ? |
| `clinic_inventory_shipment_lines` | 5183 | W12 | ? |
| `clinic_inventory_shipment_reconciliations` | 5219 | W12 | ? |
| `clinic_inventory_shipments` | 5267 | W12 | ? |
| `clinic_inventory_supplier_credits` | 5309 | W12 | ? |
| `clinic_inventory_supplier_invoices` | 5353 | W12 | ? |
| `clinic_inventory_supplier_products` | 5398 | W12 | ? |
| `clinic_inventory_suppliers` | 5444 | W12 | ? |
| `clinic_inventory_transfers` | 5477 | W12 | ? |
| `clinic_inventory_vendor_returns` | 5515 | W12 | ? |
| `clinic_invoice_lines` | 5559 | W13 | B |
| `clinic_invoice_stripe_checkouts` | 5598 | W13 | ? |
| `clinic_invoices` | 5637 | W13 | B |
| `clinic_items` | 5678 | R | R |
| `clinic_lab_report_actions` | 5715 | W10 | ? |
| `clinic_lab_report_versions` | 5754 | W10 | ? |
| `clinic_lab_reports` | 5804 | W10 | ? |
| `clinic_lab_result_follow_ups` | 5845 | W10 | ? |
| `clinic_lab_specimens` | 5897 | W10 | ? |
| `clinic_medication_administration_movements` | 5940 | W09 | ? |
| `clinic_medication_administrations` | 5974 | W09 | ? |
| `clinic_medication_dispenses` | 6038 | W09 | ? |
| `clinic_medication_request_revisions` | 6082 | W09 | S |
| `clinic_medication_statements` | 6160 | W09 | ? |
| `clinic_membership_prospects` | 6215 | W14 | ? |
| `clinic_memberships` | 6319 | W02 | ? |
| `clinic_message_attachments` | 6365 | W15 | ? |
| `clinic_message_delivery_events` | 6399 | W15 | ? |
| `clinic_message_intents` | 6434 | W15 | ? |
| `clinic_message_outbox` | 6471 | W15 | ? |
| `clinic_model_versions` | 6506 | R | R |
| `clinic_notes` | 6547 | R | R |
| `clinic_observation_sources` | 6581 | W10 | ? |
| `clinic_observations` | 6617 | W10 | ? |
| `clinic_operation_receipts` | 6670 | R | R |
| `clinic_patient_address_versions` | 6715 | W05 | ? |
| `clinic_patient_care_coordination_revisions` | 6750 | W04 | ? |
| `clinic_patient_care_needs` | 6788 | W04 | ? |
| `clinic_patient_communication_preferences` | 6838 | W04 | ? |
| `clinic_patient_contacts` | 6874 | W05 | ? |
| `clinic_patient_demographics` | 6913 | W05 | B |
| `clinic_patient_education_acknowledgments` | 6952 | W04 | ? |
| `clinic_patient_education_events` | 6991 | W04 | ? |
| `clinic_patient_emergency_contacts` | 7043 | W04 | ? |
| `clinic_patient_history_reviews` | 7082 | W05 | ? |
| `clinic_patient_memberships` | 7126 | W04 | ? |
| `clinic_patient_portal_appointment_requests` | 7165 | W04 | ? |
| `clinic_patient_portal_identities` | 7219 | W04 | ? |
| `clinic_patient_portal_recovery_deliveries` | 7264 | W04 | ? |
| `clinic_patient_portal_requests` | 7312 | W04 | ? |
| `clinic_patient_portal_waitlist_reply_receipts` | 7357 | W04 | ? |
| `clinic_patient_reminder_actions` | 7396 | W04 | ? |
| `clinic_patient_reminder_delivery_attempts` | 7434 | W04 | ? |
| `clinic_patient_reminder_outbox` | 7477 | W04 | ? |
| `clinic_patient_reminders` | 7515 | W04 | ? |
| `clinic_patient_social_histories` | 7569 | W05 | ? |
| `clinic_patients` | 7611 | W04 | B |
| `clinic_payment_allocations` | 7648 | W13 | B |
| `clinic_payment_collection_intents` | 7684 | W13 | ? |
| `clinic_payment_events` | 7725 | W13 | B |
| `clinic_payment_processor_events` | 7761 | W13 | ? |
| `clinic_pharmacy_batch_events` | 7805 | W12 | ? |
| `clinic_pharmacy_batches` | 7842 | W12 | B |
| `clinic_pharmacy_destinations` | 7884 | R | S |
| `clinic_pharmacy_movements` | 7925 | W12 | ? |
| `clinic_pharmacy_products` | 7964 | W12 | B |
| `clinic_practice_feature_versions` | 8024 | W02 | ? |
| `clinic_practices` | 8061 | W01 | B |
| `clinic_prescription_events` | 8098 | W09 | S |
| `clinic_prescription_transmission_attempts` | 8138 | W09 | S |
| `clinic_previsit_notes` | 8181 | R | R |
| `clinic_procedure_revisions` | 8220 | R | R |
| `clinic_psychotherapy_notes` | 8272 | R | R |
| `clinic_recall_events` | 8313 | W11 | ? |
| `clinic_referral_exchange_events` | 8360 | R | R |
| `clinic_refill_response_deliveries` | 8405 | W09 | ? |
| `clinic_refund_events` | 8446 | W13 | ? |
| `clinic_role_grant_events` | 8484 | W02 | ? |
| `clinic_role_grants` | 8520 | W02 | ? |
| `clinic_rooms` | 8562 | W01 | B |
| `clinic_schedule_holds` | 8598 | W06 | ? |
| `clinic_scribe_documents` | 8640 | W16 | ? |
| `clinic_scribe_draft_sections` | 8679 | W16 | ? |
| `clinic_scribe_drafts` | 8720 | W16 | ? |
| `clinic_scribe_encounters` | 8776 | W08 | ? |
| `clinic_scribe_events` | 8831 | W16 | ? |
| `clinic_scribe_exports` | 8868 | W16 | ? |
| `clinic_scribe_lab_selections` | 8911 | W10 | ? |
| `clinic_scribe_note_templates` | 8947 | W16 | ? |
| `clinic_scribe_recording_chunks` | 8985 | W16 | ? |
| `clinic_scribe_recordings` | 9024 | W16 | ? |
| `clinic_scribe_source_segments` | 9079 | W16 | ? |
| `clinic_scribe_sources` | 9119 | W16 | ? |
| `clinic_service_offering_clinicians` | 9166 | W03 | ? |
| `clinic_service_offering_sites` | 9199 | W02 | ? |
| `clinic_service_offerings` | 9232 | W02 | ? |
| `clinic_service_options` | 9279 | R | R |
| `clinic_service_request_revisions` | 9313 | R | S |
| `clinic_site_hour_exceptions` | 9367 | W01 | ? |
| `clinic_site_operating_hours` | 9405 | W01 | ? |
| `clinic_site_scheduling_policies` | 9442 | W01 | ? |
| `clinic_sites` | 9481 | W01 | B |
| `clinic_staff_address_versions` | 9527 | W03 | ? |
| `clinic_staff_conversation_members` | 9562 | W03 | ? |
| `clinic_staff_conversations` | 9603 | W03 | ? |
| `clinic_staff_members` | 9642 | W03 | B |
| `clinic_staff_message_attachments` | 9677 | W03 | ? |
| `clinic_staff_message_escalations` | 9718 | W03 | ? |
| `clinic_staff_message_outbox` | 9759 | W03 | ? |
| `clinic_staff_message_receipts` | 9799 | W03 | ? |
| `clinic_staff_message_requests` | 9837 | W03 | ? |
| `clinic_staff_messages` | 9876 | W03 | ? |
| `clinic_staff_notification_preferences` | 9922 | W03 | ? |
| `clinic_staff_notifications` | 9956 | W03 | ? |
| `clinic_stock_movements` | 9993 | W12 | ? |
| `clinic_stripe_checkouts` | 10028 | R | R |
| `clinic_stripe_connections` | 10073 | R | R |
| `clinic_stripe_membership_cycles` | 10110 | W02 | ? |
| `clinic_subscription_agreements` | 10148 | W14 | ? |
| `clinic_subscription_events` | 10188 | W14 | ? |
| `clinic_subscription_families` | 10224 | W14 | ? |
| `clinic_subscription_packages` | 10262 | W14 | ? |
| `clinic_subscription_versions` | 10299 | W14 | ? |
| `clinic_supplier_address_versions` | 10336 | W12 | ? |
| `clinic_telehealth_checkins` | 10371 | W16 | ? |
| `clinic_telehealth_commands` | 10412 | W16 | ? |
| `clinic_telehealth_consents` | 10460 | W16 | ? |
| `clinic_telehealth_join_grants` | 10501 | W16 | ? |
| `clinic_telehealth_participants` | 10542 | W16 | ? |
| `clinic_telehealth_patient_receipts` | 10588 | W04 | ? |
| `clinic_telehealth_policy_versions` | 10630 | W16 | ? |
| `clinic_telehealth_provider_events` | 10691 | W16 | ? |
| `clinic_telehealth_room_attempts` | 10733 | W16 | ? |
| `clinic_telehealth_settings` | 10781 | W16 | ? |
| `clinic_telehealth_visit_type_rules` | 10822 | W16 | ? |
| `clinic_telehealth_visits` | 10862 | W16 | ? |
| `clinic_telehealth_wrap_ups` | 10913 | W16 | ? |
| `clinic_visit_types` | 10973 | W02 | B |
| `clinic_waitlist_entries` | 11007 | W06 | ? |
| `clinic_workforce_adjustment_requests` | 11053 | W03 | ? |
| `clinic_workforce_availability_versions` | 11101 | W03 | ? |
| `clinic_workforce_badge_credentials` | 11153 | W03 | ? |
| `clinic_workforce_employee_invitations` | 11195 | W03 | ? |
| `clinic_workforce_employment_sites` | 11242 | W03 | B |
| `clinic_workforce_employments` | 11280 | W03 | B |
| `clinic_workforce_export_batches` | 11318 | W03 | ? |
| `clinic_workforce_kiosk_enrollments` | 11361 | W03 | ? |
| `clinic_workforce_kiosk_sessions` | 11401 | W03 | ? |
| `clinic_workforce_payroll_configuration_versions` | 11440 | W03 | ? |
| `clinic_workforce_punch_challenges` | 11480 | W03 | ? |
| `clinic_workforce_punches` | 11519 | W03 | ? |
| `clinic_workforce_schedule_drafts` | 11566 | W06 | ? |
| `clinic_workforce_schedule_publications` | 11605 | W06 | ? |
| `clinic_workforce_schedule_templates` | 11649 | W06 | ? |
| `clinic_workforce_settings_versions` | 11688 | W03 | ? |
| `clinic_workforce_shift_swap_requests` | 11726 | W03 | ? |
| `clinic_workforce_shifts` | 11781 | W03 | ? |
| `clinic_workforce_time_off_requests` | 11826 | W03 | ? |
| `clinic_workforce_time_segments` | 11877 | W03 | ? |
| `clinic_workforce_timecard_versions` | 11923 | W03 | ? |
| `clinic_working_drafts` | 11974 | R | R |
| `contact_messages` | 12013 | W15 | ? |
| `development_demo_lessons` | 12046 | W00 | B |
| `development_demo_runs` | 12082 | W00 | B |
| `development_demo_visitors` | 12126 | W00 | B |
| `identity_login_throttles` | 12161 | R | R |
| `identity_preferences` | 12173 | R | R |
| `learning_progresses` | 12210 | R | R |
| `materials` | 12244 | R | R |
| `member_sessions` | 12280 | R | R |
| `organizations` | 12313 | W01 | ? |
| `paperworks` | 12344 | R | R |
| `permissions` | 12386 | W02 | ? |
| `platform_audit_events` | 12418 | R | R |
| `platform_owner_invitations` | 12453 | R | R |
| `platform_owner_password_resets` | 12494 | R | R |
| `platform_page_visits` | 12532 | R | R |
| `role_version_permissions` | 12566 | W02 | ? |
| `role_versions` | 12598 | W02 | ? |
| `schema_migrations` | 12631 | R | R |
| `users` | 12640 | R | R |

## API route inventory — 455 clinic and demo routes

Each line is the live Rails route contract. `Action` is routing semantics, not a claim of end-to-end demo proof. The controller path is resolved from the Rails action where the source file exists. Use W00–W19 above to decide which routes need synthetic rows and browser checks. DELETE routes are included for reset/recovery completeness.

| Method | URL | Action | Workflow | Controller source |
| --- | --- | --- | --- | --- |
| `GET` | `/api/demo/run` | `development/demo_runs#show` | W00 | `apps/api/app/controllers/development/demo_runs_controller.rb` |
| `POST` | `/api/demo/lesson` | `development/demo_runs#lesson` | W00 | `apps/api/app/controllers/development/demo_runs_controller.rb` |
| `POST` | `/api/demo/lesson/complete` | `development/demo_runs#complete` | W00 | `apps/api/app/controllers/development/demo_runs_controller.rb` |
| `POST` | `/api/demo/run/view` | `development/demo_runs#view` | W00 | `apps/api/app/controllers/development/demo_runs_controller.rb` |
| `POST` | `/api/demo/run/resume` | `development/demo_runs#resume` | W00 | `apps/api/app/controllers/development/demo_runs_controller.rb` |
| `POST` | `/api/demo/run/enrollment` | `development/demo_runs#enrollment` | W00 | `apps/api/app/controllers/development/demo_runs_controller.rb` |
| `POST` | `/api/demo/run/reset` | `development/demo_runs#reset` | W00 | `apps/api/app/controllers/development/demo_runs_controller.rb` |
| `POST` | `/api/demo/visitor` | `development/demo_runs#register_visitor` | W00 | `apps/api/app/controllers/development/demo_runs_controller.rb` |
| `GET` | `/api/clinic` | `clinic/dashboard#show` | W18 | `apps/api/app/controllers/clinic/dashboard_controller.rb` |
| `GET` | `/api/clinic/realtime/events` | `clinic/realtime/events#show` | W18 | `apps/api/app/controllers/clinic/realtime/events_controller.rb` |
| `GET` | `/api/clinic/context` | `clinic/context#show` | W18 | `apps/api/app/controllers/clinic/context_controller.rb` |
| `PATCH` | `/api/clinic/context` | `clinic/context#update` | W18 | `apps/api/app/controllers/clinic/context_controller.rb` |
| `GET` | `/api/clinic/working_drafts/:kind` | `clinic/working_drafts#show` | W18 | `apps/api/app/controllers/clinic/working_drafts_controller.rb` |
| `PUT` | `/api/clinic/working_drafts/:kind` | `clinic/working_drafts#update` | W18 | `apps/api/app/controllers/clinic/working_drafts_controller.rb` |
| `GET` | `/api/clinic/telehealth/booking_options` | `clinic/telehealth/booking_options#show` | W16 | `apps/api/app/controllers/clinic/telehealth/booking_options_controller.rb` |
| `GET` | `/api/clinic/telehealth/visits` | `clinic/telehealth/visits#index` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `GET` | `/api/clinic/telehealth/visits/:visit_id` | `clinic/telehealth/visits#show` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/start_encounter` | `clinic/telehealth/visits#start_encounter` | W08 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/verify_preparation` | `clinic/telehealth/visits#verify_preparation` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/prepare_room` | `clinic/telehealth/visits#prepare_room` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/participants` | `clinic/telehealth/participants#create` | W16 | `apps/api/app/controllers/clinic/telehealth/participants_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/participants/:id/admit` | `clinic/telehealth/participants#admit` | W16 | `apps/api/app/controllers/clinic/telehealth/participants_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/participants/:id/remove` | `clinic/telehealth/participants#remove` | W16 | `apps/api/app/controllers/clinic/telehealth/participants_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/join_grant` | `clinic/telehealth/visits#join_grant` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/leave` | `clinic/telehealth/visits#leave` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/end` | `clinic/telehealth/visits#end_visit` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/extend` | `clinic/telehealth/visits#extend_visit` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/resume` | `clinic/telehealth/visits#resume` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/reconcile` | `clinic/telehealth/visits#reconcile` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/save_wrap_up` | `clinic/telehealth/visits#save_wrap_up` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/finalize_wrap_up` | `clinic/telehealth/visits#finalize_wrap_up` | W16 | `apps/api/app/controllers/clinic/telehealth/visits_controller.rb` |
| `GET` | `/api/clinic/telehealth/settings` | `clinic/telehealth/settings#show` | W16 | `apps/api/app/controllers/clinic/telehealth/settings_controller.rb` |
| `PUT` | `/api/clinic/telehealth/settings/draft` | `clinic/telehealth/settings#draft` | W16 | `apps/api/app/controllers/clinic/telehealth/settings_controller.rb` |
| `POST` | `/api/clinic/telehealth/settings/publish` | `clinic/telehealth/settings#publish` | W16 | `apps/api/app/controllers/clinic/telehealth/settings_controller.rb` |
| `POST` | `/api/clinic/telehealth/settings/check_connection` | `clinic/telehealth/settings#check_connection` | W16 | `apps/api/app/controllers/clinic/telehealth/settings_controller.rb` |
| `POST` | `/api/clinic/telehealth/settings/disable` | `clinic/telehealth/settings#disable` | W16 | `apps/api/app/controllers/clinic/telehealth/settings_controller.rb` |
| `GET` | `/api/clinic/telehealth/visits/:visit_id/scribe_context` | `clinic/telehealth/scribe#context` | W16 | `apps/api/app/controllers/clinic/telehealth/scribe_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/request_scribe` | `clinic/telehealth/scribe#request_scribe` | W16 | `apps/api/app/controllers/clinic/telehealth/scribe_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/scribe_consent` | `clinic/telehealth/scribe#consent` | W16 | `apps/api/app/controllers/clinic/telehealth/scribe_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/start_scribe_capture` | `clinic/telehealth/scribe#start_capture` | W16 | `apps/api/app/controllers/clinic/telehealth/scribe_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/renew_scribe_capture` | `clinic/telehealth/scribe#renew_capture` | W16 | `apps/api/app/controllers/clinic/telehealth/scribe_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/release_scribe_capture` | `clinic/telehealth/scribe#release_capture` | W16 | `apps/api/app/controllers/clinic/telehealth/scribe_controller.rb` |
| `POST` | `/api/clinic/telehealth/visits/:visit_id/take_over_scribe_capture` | `clinic/telehealth/scribe#take_over_capture` | W16 | `apps/api/app/controllers/clinic/telehealth/scribe_controller.rb` |
| `GET` | `/api/clinic/note_templates` | `clinic/care/note_templates#index` | W18 | `apps/api/app/controllers/clinic/care/note_templates_controller.rb` |
| `GET` | `/api/clinic/work_exceptions` | `clinic/work_exceptions#show` | W18 | `apps/api/app/controllers/clinic/work_exceptions_controller.rb` |
| `POST` | `/api/clinic/recalls/:id/events` | `clinic/operations/recalls#create_event` | W11 | `apps/api/app/controllers/clinic/operations/recalls_controller.rb` |
| `GET` | `/api/clinic/recalls` | `clinic/operations/recalls#index` | W11 | `apps/api/app/controllers/clinic/operations/recalls_controller.rb` |
| `GET` | `/api/clinic/recalls/:id` | `clinic/operations/recalls#show` | W11 | `apps/api/app/controllers/clinic/operations/recalls_controller.rb` |
| `POST` | `/api/clinic/waitlist/:id/transition` | `clinic/scheduling/waitlist#transition` | W06 | `apps/api/app/controllers/clinic/scheduling/waitlist_controller.rb` |
| `GET` | `/api/clinic/waitlist` | `clinic/scheduling/waitlist#index` | W06 | `apps/api/app/controllers/clinic/scheduling/waitlist_controller.rb` |
| `POST` | `/api/clinic/waitlist` | `clinic/scheduling/waitlist#create` | W06 | `apps/api/app/controllers/clinic/scheduling/waitlist_controller.rb` |
| `POST` | `/api/clinic/capacity/:id/deactivate` | `clinic/scheduling/capacity#deactivate` | W06 | `apps/api/app/controllers/clinic/scheduling/capacity_controller.rb` |
| `GET` | `/api/clinic/capacity` | `clinic/scheduling/capacity#index` | W06 | `apps/api/app/controllers/clinic/scheduling/capacity_controller.rb` |
| `POST` | `/api/clinic/capacity` | `clinic/scheduling/capacity#create` | W06 | `apps/api/app/controllers/clinic/scheduling/capacity_controller.rb` |
| `POST` | `/api/clinic/refill_requests/:id/transition` | `clinic/care/refill_requests#transition` | W09 | `apps/api/app/controllers/clinic/care/refill_requests_controller.rb` |
| `POST` | `/api/clinic/refill_requests/:id/retry_delivery` | `clinic/care/refill_requests#retry_delivery` | W09 | `apps/api/app/controllers/clinic/care/refill_requests_controller.rb` |
| `GET` | `/api/clinic/refill_requests` | `clinic/care/refill_requests#index` | W09 | `apps/api/app/controllers/clinic/care/refill_requests_controller.rb` |
| `POST` | `/api/clinic/refill_requests` | `clinic/care/refill_requests#create` | W09 | `apps/api/app/controllers/clinic/care/refill_requests_controller.rb` |
| `GET` | `/api/clinic/facilities` | `clinic/facilities#index` | W18 | `apps/api/app/controllers/clinic/facilities_controller.rb` |
| `POST` | `/api/clinic/facilities` | `clinic/facilities#create` | W18 | `apps/api/app/controllers/clinic/facilities_controller.rb` |
| `POST` | `/api/clinic/facilities/departments` | `clinic/facilities#create_department` | W01 | `apps/api/app/controllers/clinic/facilities_controller.rb` |
| `POST` | `/api/clinic/facilities/:id/rooms` | `clinic/facilities#create_room` | W01 | `apps/api/app/controllers/clinic/facilities_controller.rb` |
| `PATCH` | `/api/clinic/facilities/:id/rooms/:room_id` | `clinic/facilities#update_room` | W01 | `apps/api/app/controllers/clinic/facilities_controller.rb` |
| `PATCH` | `/api/clinic/facilities/:id` | `clinic/facilities#update` | W18 | `apps/api/app/controllers/clinic/facilities_controller.rb` |
| `GET` | `/api/clinic/facilities/:site_id/scheduling_policy` | `clinic/scheduling/site_policies#show` | W01 | `apps/api/app/controllers/clinic/scheduling/site_policies_controller.rb` |
| `PATCH` | `/api/clinic/facilities/:site_id/scheduling_policy` | `clinic/scheduling/site_policies#update` | W01 | `apps/api/app/controllers/clinic/scheduling/site_policies_controller.rb` |
| `GET` | `/api/clinic/practice_features` | `clinic/practice_features#show` | W02 | `apps/api/app/controllers/clinic/practice_features_controller.rb` |
| `PATCH` | `/api/clinic/practice_features` | `clinic/practice_features#update` | W02 | `apps/api/app/controllers/clinic/practice_features_controller.rb` |
| `PUT` | `/api/clinic/practice_features` | `clinic/practice_features#update` | W02 | `apps/api/app/controllers/clinic/practice_features_controller.rb` |
| `POST` | `/api/clinic/visit_types` | `clinic/visit_types#create` | W02 | `apps/api/app/controllers/clinic/visit_types_controller.rb` |
| `PATCH` | `/api/clinic/visit_types/:id` | `clinic/visit_types#update` | W02 | `apps/api/app/controllers/clinic/visit_types_controller.rb` |
| `PUT` | `/api/clinic/visit_types/:id` | `clinic/visit_types#update` | W02 | `apps/api/app/controllers/clinic/visit_types_controller.rb` |
| `GET` | `/api/clinic/clinicians` | `clinic/clinicians#index` | W03 | `apps/api/app/controllers/clinic/clinicians_controller.rb` |
| `POST` | `/api/clinic/clinicians` | `clinic/clinicians#create` | W03 | `apps/api/app/controllers/clinic/clinicians_controller.rb` |
| `GET` | `/api/clinic/role_versions` | `clinic/role_versions#index` | W02 | `apps/api/app/controllers/clinic/role_versions_controller.rb` |
| `POST` | `/api/clinic/appointments/:id/transition` | `clinic/scheduling/appointments#transition` | W06 | `apps/api/app/controllers/clinic/scheduling/appointments_controller.rb` |
| `GET` | `/api/clinic/appointments` | `clinic/scheduling/appointments#index` | W06 | `apps/api/app/controllers/clinic/scheduling/appointments_controller.rb` |
| `POST` | `/api/clinic/appointments` | `clinic/scheduling/appointments#create` | W06 | `apps/api/app/controllers/clinic/scheduling/appointments_controller.rb` |
| `GET` | `/api/clinic/appointments/:id` | `clinic/scheduling/appointments#show` | W06 | `apps/api/app/controllers/clinic/scheduling/appointments_controller.rb` |
| `PATCH` | `/api/clinic/appointments/:id` | `clinic/scheduling/appointments#update` | W06 | `apps/api/app/controllers/clinic/scheduling/appointments_controller.rb` |
| `PUT` | `/api/clinic/appointments/:id` | `clinic/scheduling/appointments#update` | W06 | `apps/api/app/controllers/clinic/scheduling/appointments_controller.rb` |
| `POST` | `/api/clinic/appointment_series/preview` | `clinic/scheduling/appointment_series#preview` | W06 | `apps/api/app/controllers/clinic/scheduling/appointment_series_controller.rb` |
| `POST` | `/api/clinic/appointment_series` | `clinic/scheduling/appointment_series#create` | W06 | `apps/api/app/controllers/clinic/scheduling/appointment_series_controller.rb` |
| `GET` | `/api/clinic/appointment_series/:id` | `clinic/scheduling/appointment_series#show` | W06 | `apps/api/app/controllers/clinic/scheduling/appointment_series_controller.rb` |
| `POST` | `/api/clinic/appointment_series/:id/preview_change` | `clinic/scheduling/appointment_series#preview_change` | W06 | `apps/api/app/controllers/clinic/scheduling/appointment_series_controller.rb` |
| `POST` | `/api/clinic/appointment_series/:id/change_future` | `clinic/scheduling/appointment_series#change_future` | W06 | `apps/api/app/controllers/clinic/scheduling/appointment_series_controller.rb` |
| `POST` | `/api/clinic/appointment_series/:id/cancel_future` | `clinic/scheduling/appointment_series#cancel_future` | W06 | `apps/api/app/controllers/clinic/scheduling/appointment_series_controller.rb` |
| `POST` | `/api/clinic/appointment_requests/:id/approve` | `clinic/operations/appointment_requests#approve` | W06 | `apps/api/app/controllers/clinic/operations/appointment_requests_controller.rb` |
| `POST` | `/api/clinic/appointment_requests/:id/decline` | `clinic/operations/appointment_requests#decline` | W06 | `apps/api/app/controllers/clinic/operations/appointment_requests_controller.rb` |
| `GET` | `/api/clinic/appointment_requests` | `clinic/operations/appointment_requests#index` | W06 | `apps/api/app/controllers/clinic/operations/appointment_requests_controller.rb` |
| `GET` | `/api/clinic/tracking_board` | `clinic/scheduling/tracking_board#show` | W18 | `apps/api/app/controllers/clinic/scheduling/tracking_board_controller.rb` |
| `GET` | `/api/clinic/schedule_calendar` | `clinic/scheduling/calendar#show` | W06 | `apps/api/app/controllers/clinic/scheduling/calendar_controller.rb` |
| `GET` | `/api/clinic/reports/daily_visits_by_state` | `clinic/reports/daily_visits_by_state#show` | W18 | `apps/api/app/controllers/clinic/reports/daily_visits_by_state_controller.rb` |
| `GET` | `/api/clinic/operations/follow_ups` | `clinic/operations/follow_ups#index` | W18 | `apps/api/app/controllers/clinic/operations/follow_ups_controller.rb` |
| `PATCH` | `/api/clinic/operations/encounter_follow_ups/:id` | `clinic/operations/encounter_follow_ups#update` | W08 | `apps/api/app/controllers/clinic/operations/encounter_follow_ups_controller.rb` |
| `GET` | `/api/clinic/encounters/:encounter_id/follow_up` | `clinic/operations/encounter_follow_ups#show` | W08 | `apps/api/app/controllers/clinic/operations/encounter_follow_ups_controller.rb` |
| `PUT` | `/api/clinic/encounters/:encounter_id/follow_up` | `clinic/operations/encounter_follow_ups#upsert` | W08 | `apps/api/app/controllers/clinic/operations/encounter_follow_ups_controller.rb` |
| `GET` | `/api/clinic/operation_receipts/:request_key` | `clinic/operation_receipts#show` | W18 | `apps/api/app/controllers/clinic/operation_receipts_controller.rb` |
| `GET` | `/api/clinic/encounters/:id/completion` | `clinic/scheduling/encounters#completion` | W08 | `apps/api/app/controllers/clinic/scheduling/encounters_controller.rb` |
| `POST` | `/api/clinic/encounters/:id/close` | `clinic/scheduling/encounters#close` | W08 | `apps/api/app/controllers/clinic/scheduling/encounters_controller.rb` |
| `POST` | `/api/clinic/encounters/:id/provider_assignment` | `clinic/scheduling/provider_assignments#create` | W08 | `apps/api/app/controllers/clinic/scheduling/provider_assignments_controller.rb` |
| `POST` | `/api/clinic/encounters/:encounter_id/intake_ownership/claim` | `clinic/scheduling/intake_ownership#claim` | W13 | `apps/api/app/controllers/clinic/scheduling/intake_ownership_controller.rb` |
| `POST` | `/api/clinic/encounters/:encounter_id/intake_ownership/release` | `clinic/scheduling/intake_ownership#release` | W08 | `apps/api/app/controllers/clinic/scheduling/intake_ownership_controller.rb` |
| `GET` | `/api/clinic/encounters/:encounter_id/notes` | `clinic/care/encounter_notes#index` | W08 | `apps/api/app/controllers/clinic/care/encounter_notes_controller.rb` |
| `POST` | `/api/clinic/encounters/:encounter_id/notes` | `clinic/care/encounter_notes#create` | W08 | `apps/api/app/controllers/clinic/care/encounter_notes_controller.rb` |
| `GET` | `/api/clinic/encounters/:encounter_id/psychotherapy_note` | `clinic/care/psychotherapy_notes#show` | W08 | `apps/api/app/controllers/clinic/care/psychotherapy_notes_controller.rb` |
| `PATCH` | `/api/clinic/encounters/:encounter_id/psychotherapy_note` | `clinic/care/psychotherapy_notes#update` | W08 | `apps/api/app/controllers/clinic/care/psychotherapy_notes_controller.rb` |
| `PUT` | `/api/clinic/encounters/:encounter_id/psychotherapy_note` | `clinic/care/psychotherapy_notes#update` | W08 | `apps/api/app/controllers/clinic/care/psychotherapy_notes_controller.rb` |
| `GET` | `/api/clinic/encounters/:encounter_id/medication_administrations` | `clinic/care/medication_administrations#index` | W09 | `apps/api/app/controllers/clinic/care/medication_administrations_controller.rb` |
| `POST` | `/api/clinic/encounters/:encounter_id/medication_administrations` | `clinic/care/medication_administrations#create` | W09 | `apps/api/app/controllers/clinic/care/medication_administrations_controller.rb` |
| `GET` | `/api/clinic/encounters` | `clinic/scheduling/encounters#index` | W08 | `apps/api/app/controllers/clinic/scheduling/encounters_controller.rb` |
| `GET` | `/api/clinic/encounters/:id` | `clinic/scheduling/encounters#show` | W08 | `apps/api/app/controllers/clinic/scheduling/encounters_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/nurse_workspace` | `clinic/care/nurse_workflow#show` | W04 | `apps/api/app/controllers/clinic/care/nurse_workflow_controller.rb` |
| `PATCH` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/room` | `clinic/scheduling/encounters#assign_room` | W04 | `apps/api/app/controllers/clinic/scheduling/encounters_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/education_events` | `clinic/care/patient_education_events#index` | W04 | `apps/api/app/controllers/clinic/care/patient_education_events_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/education_events` | `clinic/care/patient_education_events#create` | W04 | `apps/api/app/controllers/clinic/care/patient_education_events_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/intake_revisions` | `clinic/care/nurse_workflow#revise_intake` | W04 | `apps/api/app/controllers/clinic/care/nurse_workflow_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/handoffs` | `clinic/care/nurse_workflow#request_handoff` | W04 | `apps/api/app/controllers/clinic/care/nurse_workflow_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/clinical_tasks` | `clinic/care/nurse_workflow#create_task` | W04 | `apps/api/app/controllers/clinic/care/nurse_workflow_controller.rb` |
| `PATCH` | `/api/clinic/handoffs/:id` | `clinic/care/nurse_workflow#transition_handoff` | W07 | `apps/api/app/controllers/clinic/care/nurse_workflow_controller.rb` |
| `PATCH` | `/api/clinic/clinical_tasks/:id` | `clinic/care/nurse_workflow#transition_task` | W07 | `apps/api/app/controllers/clinic/care/nurse_workflow_controller.rb` |
| `GET` | `/api/clinic/pharmacy_destinations` | `clinic/care/pharmacy_destinations#index` | W18 | `apps/api/app/controllers/clinic/care/pharmacy_destinations_controller.rb` |
| `POST` | `/api/clinic/pharmacy_destinations` | `clinic/care/pharmacy_destinations#create` | W18 | `apps/api/app/controllers/clinic/care/pharmacy_destinations_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/medication_request_series` | `clinic/care/prescription_order_series#index` | W09 | `apps/api/app/controllers/clinic/care/prescription_order_series_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/medication_requests/:medication_request_id/events` | `clinic/care/prescription_events#index` | W09 | `apps/api/app/controllers/clinic/care/prescription_events_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/medication_requests/:medication_request_id/events` | `clinic/care/prescription_events#create` | W09 | `apps/api/app/controllers/clinic/care/prescription_events_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/medication_requests/:medication_request_id/submit` | `clinic/care/prescription_events#submit` | W09 | `apps/api/app/controllers/clinic/care/prescription_events_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/medication_requests/:medication_request_id/dispenses` | `clinic/care/prescription_events#dispense` | W09 | `apps/api/app/controllers/clinic/care/prescription_events_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/clinical_plan_workspace` | `clinic/care/clinical_plan_workspace#show` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/medication_requests` | `clinic/care/clinical_plan_workspace#create_medication_request` | W09 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `PATCH` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/medication_requests/:series_id` | `clinic/care/clinical_plan_workspace#revise_medication_request` | W09 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/service_requests` | `clinic/care/clinical_plan_workspace#create_service_request` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `PATCH` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/service_requests/:series_id` | `clinic/care/clinical_plan_workspace#revise_service_request` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/diagnoses` | `clinic/care/clinical_plan_workspace#create_diagnosis` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `PATCH` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/diagnoses/:series_id` | `clinic/care/clinical_plan_workspace#revise_diagnosis` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/procedures` | `clinic/care/clinical_plan_workspace#create_procedure` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `PATCH` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/procedures/:series_id` | `clinic/care/clinical_plan_workspace#revise_procedure` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/care_plans` | `clinic/care/clinical_plan_workspace#create_care_plan` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `PATCH` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/care_plans/:series_id` | `clinic/care/clinical_plan_workspace#revise_care_plan` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/care_goals` | `clinic/care/clinical_plan_workspace#create_care_goal` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `PATCH` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/care_goals/:series_id` | `clinic/care/clinical_plan_workspace#revise_care_goal` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/immunizations` | `clinic/care/clinical_plan_workspace#create_immunization` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `PATCH` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/immunizations/:series_id` | `clinic/care/clinical_plan_workspace#revise_immunization` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/assessments` | `clinic/care/clinical_plan_workspace#create_assessment` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `PATCH` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/assessments/:series_id` | `clinic/care/clinical_plan_workspace#revise_assessment` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/clinical_plan_workspace/fulfillment_links` | `clinic/care/clinical_plan_workspace#create_fulfillment_link` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/clinical_plan_workspace/referral_events` | `clinic/care/clinical_plan_workspace#create_referral_event` | W04 | `apps/api/app/controllers/clinic/care/clinical_plan_workspace_controller.rb` |
| `POST` | `/api/clinic/notes/:id/revisions` | `clinic/care/encounter_notes#revise` | W18 | `apps/api/app/controllers/clinic/care/encounter_notes_controller.rb` |
| `POST` | `/api/clinic/notes/:id/corrections` | `clinic/care/encounter_notes#correct` | W18 | `apps/api/app/controllers/clinic/care/encounter_notes_controller.rb` |
| `POST` | `/api/clinic/notes/:id/signatures` | `clinic/care/encounter_notes#sign` | W18 | `apps/api/app/controllers/clinic/care/encounter_notes_controller.rb` |
| `GET` | `/api/clinic/notes/:id` | `clinic/care/encounter_notes#show` | W18 | `apps/api/app/controllers/clinic/care/encounter_notes_controller.rb` |
| `GET` | `/api/clinic/documents/:id/download` | `clinic/documents#download` | W18 | `apps/api/app/controllers/clinic/documents_controller.rb` |
| `GET` | `/api/clinic/documents/:id` | `clinic/documents#show` | W18 | `apps/api/app/controllers/clinic/documents_controller.rb` |
| `GET` | `/api/clinic/document_categories` | `clinic/document_categories#index` | W18 | `apps/api/app/controllers/clinic/document_categories_controller.rb` |
| `POST` | `/api/clinic/message_intents/:id/delivery_events` | `clinic/messaging/message_intents#record_delivery` | W15 | `apps/api/app/controllers/clinic/messaging/message_intents_controller.rb` |
| `GET` | `/api/clinic/message_intents/:id` | `clinic/messaging/message_intents#show` | W15 | `apps/api/app/controllers/clinic/messaging/message_intents_controller.rb` |
| `POST` | `/api/clinic/reminders/recover` | `clinic/reminders#recover` | W15 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `POST` | `/api/clinic/reminders/batch_preview` | `clinic/reminders#batch_preview` | W15 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `POST` | `/api/clinic/reminders/batch_schedule` | `clinic/reminders#batch_schedule` | W06 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `POST` | `/api/clinic/reminders/:id/staff_handoff` | `clinic/reminders#staff_handoff` | W03 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `POST` | `/api/clinic/reminders/:id/pause` | `clinic/reminders#pause` | W15 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `POST` | `/api/clinic/reminders/:id/cancel` | `clinic/reminders#cancel` | W15 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `POST` | `/api/clinic/reminders/:id/retry` | `clinic/reminders#retry` | W15 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `POST` | `/api/clinic/reminders/:id/dispatch` | `clinic/reminders#dispatch_reminder` | W15 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `POST` | `/api/clinic/reminders/:id/delivery_events` | `clinic/reminders#record_delivery` | W15 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `GET` | `/api/clinic/reminders` | `clinic/reminders#index` | W15 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `POST` | `/api/clinic/reminders` | `clinic/reminders#create` | W15 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `GET` | `/api/clinic/reminders/:id` | `clinic/reminders#show` | W15 | `apps/api/app/controllers/clinic/reminders_controller.rb` |
| `PATCH` | `/api/clinic/invoices/:id/draft` | `clinic/billing/invoices#update_draft` | W13 | `apps/api/app/controllers/clinic/billing/invoices_controller.rb` |
| `POST` | `/api/clinic/invoices/:id/post` | `clinic/billing/invoices#post` | W13 | `apps/api/app/controllers/clinic/billing/invoices_controller.rb` |
| `POST` | `/api/clinic/invoices/:id/credits` | `clinic/billing/invoices#credit` | W13 | `apps/api/app/controllers/clinic/billing/invoices_controller.rb` |
| `POST` | `/api/clinic/invoices/:id/void` | `clinic/billing/invoices#void_invoice` | W13 | `apps/api/app/controllers/clinic/billing/invoices_controller.rb` |
| `POST` | `/api/clinic/invoices/:id/payment_allocations` | `clinic/billing/invoices#allocate_payment` | W13 | `apps/api/app/controllers/clinic/billing/invoices_controller.rb` |
| `POST` | `/api/clinic/invoices/:id/cash_payments` | `clinic/billing/invoices#record_cash_payment` | W13 | `apps/api/app/controllers/clinic/billing/invoices_controller.rb` |
| `POST` | `/api/clinic/invoices/:id/online_payment/start` | `clinic/billing/invoice_online_payments#start` | W13 | `apps/api/app/controllers/clinic/billing/invoice_online_payments_controller.rb` |
| `POST` | `/api/clinic/invoices/:id/online_payment/reconcile` | `clinic/billing/invoice_online_payments#reconcile` | W13 | `apps/api/app/controllers/clinic/billing/invoice_online_payments_controller.rb` |
| `POST` | `/api/clinic/invoices/:id/online_payment/cancel` | `clinic/billing/invoice_online_payments#cancel` | W13 | `apps/api/app/controllers/clinic/billing/invoice_online_payments_controller.rb` |
| `GET` | `/api/clinic/invoices/:id` | `clinic/billing/invoices#show` | W13 | `apps/api/app/controllers/clinic/billing/invoices_controller.rb` |
| `GET` | `/api/clinic/billing` | `clinic/billing/dashboard#show` | W13 | `apps/api/app/controllers/clinic/billing/dashboard_controller.rb` |
| `GET` | `/api/clinic/billing/income_outlook` | `clinic/billing/dashboard#income_outlook` | W13 | `apps/api/app/controllers/clinic/billing/dashboard_controller.rb` |
| `GET` | `/api/clinic/billing/support_requests` | `clinic/billing/support_requests#index` | W13 | `apps/api/app/controllers/clinic/billing/support_requests_controller.rb` |
| `POST` | `/api/clinic/billing/support_requests/:id/transition` | `clinic/billing/support_requests#transition` | W13 | `apps/api/app/controllers/clinic/billing/support_requests_controller.rb` |
| `GET` | `/api/clinic/billing_services` | `clinic/billing_services#index` | W13 | `apps/api/app/controllers/clinic/billing_services_controller.rb` |
| `POST` | `/api/clinic/billing_services` | `clinic/billing_services#create` | W13 | `apps/api/app/controllers/clinic/billing_services_controller.rb` |
| `PATCH` | `/api/clinic/billing_services/:id` | `clinic/billing_services#update` | W13 | `apps/api/app/controllers/clinic/billing_services_controller.rb` |
| `PUT` | `/api/clinic/billing_services/:id` | `clinic/billing_services#update` | W13 | `apps/api/app/controllers/clinic/billing_services_controller.rb` |
| `POST` | `/api/clinic/service_offerings/:id/publish` | `clinic/service_offerings#publish` | W02 | `apps/api/app/controllers/clinic/service_offerings_controller.rb` |
| `POST` | `/api/clinic/service_offerings/:id/retire` | `clinic/service_offerings#retire` | W02 | `apps/api/app/controllers/clinic/service_offerings_controller.rb` |
| `GET` | `/api/clinic/service_offerings` | `clinic/service_offerings#index` | W02 | `apps/api/app/controllers/clinic/service_offerings_controller.rb` |
| `POST` | `/api/clinic/service_offerings` | `clinic/service_offerings#create` | W02 | `apps/api/app/controllers/clinic/service_offerings_controller.rb` |
| `PATCH` | `/api/clinic/service_offerings/:id` | `clinic/service_offerings#update` | W02 | `apps/api/app/controllers/clinic/service_offerings_controller.rb` |
| `PUT` | `/api/clinic/service_offerings/:id` | `clinic/service_offerings#update` | W02 | `apps/api/app/controllers/clinic/service_offerings_controller.rb` |
| `POST` | `/api/clinic/cash_pay_estimates/:id/issue` | `clinic/billing/cash_pay_estimates#issue` | W13 | `apps/api/app/controllers/clinic/billing/cash_pay_estimates_controller.rb` |
| `POST` | `/api/clinic/cash_pay_estimates/:id/correct` | `clinic/billing/cash_pay_estimates#correct` | W13 | `apps/api/app/controllers/clinic/billing/cash_pay_estimates_controller.rb` |
| `POST` | `/api/clinic/cash_pay_estimates/:id/deliver` | `clinic/billing/cash_pay_estimates#deliver` | W13 | `apps/api/app/controllers/clinic/billing/cash_pay_estimates_controller.rb` |
| `GET` | `/api/clinic/cash_pay_estimates` | `clinic/billing/cash_pay_estimates#index` | W13 | `apps/api/app/controllers/clinic/billing/cash_pay_estimates_controller.rb` |
| `POST` | `/api/clinic/cash_pay_estimates` | `clinic/billing/cash_pay_estimates#create` | W13 | `apps/api/app/controllers/clinic/billing/cash_pay_estimates_controller.rb` |
| `GET` | `/api/clinic/cash_pay_estimates/:id` | `clinic/billing/cash_pay_estimates#show` | W13 | `apps/api/app/controllers/clinic/billing/cash_pay_estimates_controller.rb` |
| `POST` | `/api/clinic/schedule_holds/:id/release` | `clinic/scheduling/schedule_holds#release` | W06 | `apps/api/app/controllers/clinic/scheduling/schedule_holds_controller.rb` |
| `POST` | `/api/clinic/schedule_holds` | `clinic/scheduling/schedule_holds#create` | W06 | `apps/api/app/controllers/clinic/scheduling/schedule_holds_controller.rb` |
| `GET` | `/api/clinic/stripe_connect` | `clinic/billing/stripe_connect#show` | W18 | `apps/api/app/controllers/clinic/billing/stripe_connect_controller.rb` |
| `POST` | `/api/clinic/stripe_connect/onboard` | `clinic/billing/stripe_connect#onboard` | W18 | `apps/api/app/controllers/clinic/billing/stripe_connect_controller.rb` |
| `POST` | `/api/clinic/stripe_connect/refresh` | `clinic/billing/stripe_connect#refresh` | W18 | `apps/api/app/controllers/clinic/billing/stripe_connect_controller.rb` |
| `GET` | `/api/clinic/subscription_catalog` | `clinic/care/subscription_catalog#index` | W14 | `apps/api/app/controllers/clinic/care/subscription_catalog_controller.rb` |
| `GET` | `/api/clinic/membership_storefront` | `clinic/membership_storefront#show` | W02 | `apps/api/app/controllers/clinic/membership_storefront_controller.rb` |
| `PATCH` | `/api/clinic/membership_storefront` | `clinic/membership_storefront#update` | W02 | `apps/api/app/controllers/clinic/membership_storefront_controller.rb` |
| `PUT` | `/api/clinic/membership_storefront` | `clinic/membership_storefront#update` | W02 | `apps/api/app/controllers/clinic/membership_storefront_controller.rb` |
| `GET` | `/api/clinic/membership_enrollment` | `clinic/membership_enrollments#show` | W02 | `apps/api/app/controllers/clinic/membership_enrollments_controller.rb` |
| `POST` | `/api/clinic/membership_enrollment` | `clinic/membership_enrollments#create` | W02 | `apps/api/app/controllers/clinic/membership_enrollments_controller.rb` |
| `POST` | `/api/clinic/membership_enrollment/:id/payment` | `clinic/membership_enrollments#payment` | W13 | `apps/api/app/controllers/clinic/membership_enrollments_controller.rb` |
| `POST` | `/api/clinic/membership_enrollment/:id/one_time_payment` | `clinic/membership_enrollments#one_time_payment` | W13 | `apps/api/app/controllers/clinic/membership_enrollments_controller.rb` |
| `POST` | `/api/clinic/membership_prospects/:id/phone_payment` | `clinic/membership_prospects#phone_payment` | W14 | `apps/api/app/controllers/clinic/membership_prospects_controller.rb` |
| `POST` | `/api/clinic/membership_prospects/:id/refresh_phone_payment` | `clinic/membership_prospects#refresh_phone_payment` | W14 | `apps/api/app/controllers/clinic/membership_prospects_controller.rb` |
| `GET` | `/api/clinic/membership_prospects` | `clinic/membership_prospects#index` | W14 | `apps/api/app/controllers/clinic/membership_prospects_controller.rb` |
| `GET` | `/api/clinic/membership_prospects/:id` | `clinic/membership_prospects#show` | W14 | `apps/api/app/controllers/clinic/membership_prospects_controller.rb` |
| `PATCH` | `/api/clinic/membership_prospects/:id` | `clinic/membership_prospects#update` | W14 | `apps/api/app/controllers/clinic/membership_prospects_controller.rb` |
| `PUT` | `/api/clinic/membership_prospects/:id` | `clinic/membership_prospects#update` | W14 | `apps/api/app/controllers/clinic/membership_prospects_controller.rb` |
| `POST` | `/api/clinic/callback_requests/:id/transition` | `clinic/operations/callback_requests#transition` | W18 | `apps/api/app/controllers/clinic/operations/callback_requests_controller.rb` |
| `GET` | `/api/clinic/callback_requests` | `clinic/operations/callback_requests#index` | W18 | `apps/api/app/controllers/clinic/operations/callback_requests_controller.rb` |
| `GET` | `/api/clinic/subscription_catalog/storefront_preview` | `clinic/care/subscription_catalog#storefront_preview` | W14 | `apps/api/app/controllers/clinic/care/subscription_catalog_controller.rb` |
| `POST` | `/api/clinic/subscription_catalog/template` | `clinic/care/subscription_catalog#apply_template` | W14 | `apps/api/app/controllers/clinic/care/subscription_catalog_controller.rb` |
| `POST` | `/api/clinic/subscription_catalog/:kind` | `clinic/care/subscription_catalog#save` | W14 | `apps/api/app/controllers/clinic/care/subscription_catalog_controller.rb` |
| `PATCH` | `/api/clinic/subscription_catalog/:kind/:id` | `clinic/care/subscription_catalog#save` | W14 | `apps/api/app/controllers/clinic/care/subscription_catalog_controller.rb` |
| `GET` | `/api/clinic/subscription_catalog/packages/:id/preview` | `clinic/care/subscription_catalog#preview` | W14 | `apps/api/app/controllers/clinic/care/subscription_catalog_controller.rb` |
| `POST` | `/api/clinic/subscription_catalog/packages/:id/publish` | `clinic/care/subscription_catalog#publish` | W14 | `apps/api/app/controllers/clinic/care/subscription_catalog_controller.rb` |
| `POST` | `/api/clinic/subscription_catalog/:kind/:id/retire` | `clinic/care/subscription_catalog#retire` | W14 | `apps/api/app/controllers/clinic/care/subscription_catalog_controller.rb` |
| `POST` | `/api/clinic/subscriptions/:id/reconcile_ledger` | `clinic/billing/subscriptions#reconcile_ledger` | W14 | `apps/api/app/controllers/clinic/billing/subscriptions_controller.rb` |
| `POST` | `/api/clinic/subscriptions/:id/review` | `clinic/billing/subscriptions#review` | W14 | `apps/api/app/controllers/clinic/billing/subscriptions_controller.rb` |
| `POST` | `/api/clinic/subscriptions/:id/reconcile` | `clinic/billing/subscriptions#reconcile` | W14 | `apps/api/app/controllers/clinic/billing/subscriptions_controller.rb` |
| `POST` | `/api/clinic/subscriptions/:id/cancel` | `clinic/billing/subscriptions#cancel` | W14 | `apps/api/app/controllers/clinic/billing/subscriptions_controller.rb` |
| `POST` | `/api/clinic/subscriptions/:id/refund` | `clinic/billing/subscriptions#refund` | W14 | `apps/api/app/controllers/clinic/billing/subscriptions_controller.rb` |
| `GET` | `/api/clinic/subscriptions` | `clinic/billing/subscriptions#index` | W14 | `apps/api/app/controllers/clinic/billing/subscriptions_controller.rb` |
| `POST` | `/api/clinic/cash_drawers/:id/close` | `clinic/billing/cash_drawers#close` | W13 | `apps/api/app/controllers/clinic/billing/cash_drawers_controller.rb` |
| `POST` | `/api/clinic/cash_drawers/:id/reconcile` | `clinic/billing/cash_drawers#reconcile` | W13 | `apps/api/app/controllers/clinic/billing/cash_drawers_controller.rb` |
| `GET` | `/api/clinic/cash_drawers` | `clinic/billing/cash_drawers#index` | W13 | `apps/api/app/controllers/clinic/billing/cash_drawers_controller.rb` |
| `POST` | `/api/clinic/cash_drawers` | `clinic/billing/cash_drawers#create` | W13 | `apps/api/app/controllers/clinic/billing/cash_drawers_controller.rb` |
| `POST` | `/api/clinic/payment_events/:id/allocations` | `clinic/billing/payment_events#allocate` | W13 | `apps/api/app/controllers/clinic/billing/payment_events_controller.rb` |
| `POST` | `/api/clinic/payment_events/:id/cash_refunds` | `clinic/billing/payment_events#cash_refunds` | W13 | `apps/api/app/controllers/clinic/billing/payment_events_controller.rb` |
| `GET` | `/api/clinic/payment_events/:id/receipt` | `clinic/billing/payment_events#receipt` | W13 | `apps/api/app/controllers/clinic/billing/payment_events_controller.rb` |
| `POST` | `/api/clinic/role_grants/:id/revoke` | `clinic/authorization/role_grants#revoke` | W02 | `apps/api/app/controllers/clinic/authorization/role_grants_controller.rb` |
| `GET` | `/api/clinic/role_grants` | `clinic/authorization/role_grants#index` | W02 | `apps/api/app/controllers/clinic/authorization/role_grants_controller.rb` |
| `POST` | `/api/clinic/role_grants` | `clinic/authorization/role_grants#create` | W02 | `apps/api/app/controllers/clinic/authorization/role_grants_controller.rb` |
| `POST` | `/api/clinic/pharmacy/lookup` | `clinic/inventory/pharmacy#lookup` | W18 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `POST` | `/api/clinic/pharmacy/device_lookup` | `clinic/inventory/pharmacy#device_lookup` | W18 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `POST` | `/api/clinic/pharmacy/nadac` | `clinic/inventory/pharmacy#nadac` | W18 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `POST` | `/api/clinic/pharmacy/import` | `clinic/inventory/pharmacy#import` | W18 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `POST` | `/api/clinic/pharmacy/demo` | `clinic/inventory/pharmacy#demo` | W18 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `POST` | `/api/clinic/pharmacy/:id/receive` | `clinic/inventory/pharmacy#receive` | W18 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `GET` | `/api/clinic/pharmacy` | `clinic/inventory/pharmacy#index` | W18 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `POST` | `/api/clinic/pharmacy` | `clinic/inventory/pharmacy#create` | W18 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `GET` | `/api/clinic/pharmacy/:id` | `clinic/inventory/pharmacy#show` | W18 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `PATCH` | `/api/clinic/pharmacy/:id` | `clinic/inventory/pharmacy#update` | W18 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `PUT` | `/api/clinic/pharmacy/:id` | `clinic/inventory/pharmacy#update` | W18 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `POST` | `/api/clinic/pharmacy_batches/:id/movement` | `clinic/inventory/pharmacy#movement` | W12 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `POST` | `/api/clinic/pharmacy_batches/:id/status` | `clinic/inventory/pharmacy#batch_status` | W12 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `POST` | `/api/clinic/pharmacy_batches/:id/count` | `clinic/inventory/pharmacy#count` | W12 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `POST` | `/api/clinic/inventory_counts/:id/approve` | `clinic/inventory/pharmacy#approve_count` | W12 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `POST` | `/api/clinic/inventory_configuration` | `clinic/inventory/pharmacy#configure` | W12 | `apps/api/app/controllers/clinic/inventory/pharmacy_controller.rb` |
| `GET` | `/api/clinic/inventory/bootstrap` | `clinic/inventory/management#bootstrap` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/scan` | `clinic/inventory/management#scan` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/supplier-pricing` | `clinic/inventory/management#supplier_pricing` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/suppliers` | `clinic/inventory/supplier_pricing#create` | W12 | `apps/api/app/controllers/clinic/inventory/supplier_pricing_controller.rb` |
| `PATCH` | `/api/clinic/inventory/suppliers/:id` | `clinic/inventory/supplier_pricing#update` | W12 | `apps/api/app/controllers/clinic/inventory/supplier_pricing_controller.rb` |
| `POST` | `/api/clinic/inventory/suppliers/preview` | `clinic/inventory/supplier_pricing#preview` | W12 | `apps/api/app/controllers/clinic/inventory/supplier_pricing_controller.rb` |
| `POST` | `/api/clinic/inventory/suppliers/import` | `clinic/inventory/supplier_pricing#import` | W12 | `apps/api/app/controllers/clinic/inventory/supplier_pricing_controller.rb` |
| `PATCH` | `/api/clinic/inventory/products/:id/preferred-supplier` | `clinic/inventory/supplier_pricing#set_preferred_supplier` | W12 | `apps/api/app/controllers/clinic/inventory/supplier_pricing_controller.rb` |
| `POST` | `/api/clinic/inventory/demo` | `clinic/inventory/management#demo` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/catalog` | `clinic/inventory/management#catalog` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/exceptions` | `clinic/inventory/management#exceptions` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/exceptions/reviews` | `clinic/inventory/management#review_exception` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/locations` | `clinic/inventory/management#locations` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/locations` | `clinic/inventory/management#create_location` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `PATCH` | `/api/clinic/inventory/locations/:id` | `clinic/inventory/management#update_location` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `PATCH` | `/api/clinic/inventory/products/:id` | `clinic/inventory/management#update_product` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/replenishment` | `clinic/inventory/management#replenishment` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/purchase-cart` | `clinic/inventory/management#purchase_cart` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `PATCH` | `/api/clinic/inventory/purchase-cart` | `clinic/inventory/management#update_purchase_cart` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/purchase-cart/items` | `clinic/inventory/management#add_purchase_cart_item` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `PATCH` | `/api/clinic/inventory/purchase-cart/items/:id` | `clinic/inventory/management#update_purchase_cart_item` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `DELETE` | `/api/clinic/inventory/purchase-cart/items/:id` | `clinic/inventory/management#remove_purchase_cart_item` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/purchase-cart/checkout` | `clinic/inventory/management#checkout_purchase_cart` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/purchase-orders` | `clinic/inventory/management#purchase_orders` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/purchase-orders` | `clinic/inventory/management#create_purchase_order` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/purchase-orders/:id` | `clinic/inventory/management#purchase_order` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/purchase-orders/:id/reconciliation` | `clinic/inventory/reconciliations#show` | W12 | `apps/api/app/controllers/clinic/inventory/reconciliations_controller.rb` |
| `POST` | `/api/clinic/inventory/purchase-orders/:id/receiving-sessions` | `clinic/inventory/reconciliations#receive` | W12 | `apps/api/app/controllers/clinic/inventory/reconciliations_controller.rb` |
| `POST` | `/api/clinic/inventory/purchase-orders/:id/returns` | `clinic/inventory/reconciliations#return_stock` | W12 | `apps/api/app/controllers/clinic/inventory/reconciliations_controller.rb` |
| `POST` | `/api/clinic/inventory/purchase-orders/:id/credits` | `clinic/inventory/reconciliations#credit` | W12 | `apps/api/app/controllers/clinic/inventory/reconciliations_controller.rb` |
| `POST` | `/api/clinic/inventory/purchase-orders/:id/invoices` | `clinic/inventory/reconciliations#invoice` | W12 | `apps/api/app/controllers/clinic/inventory/reconciliations_controller.rb` |
| `POST` | `/api/clinic/inventory/purchase-orders/:id/transition` | `clinic/inventory/management#transition_purchase_order` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/purchase-orders/:id/cancel-remainder` | `clinic/inventory/management#cancel_remainder` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/shipments` | `clinic/inventory/management#create_shipment` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/receiving` | `clinic/inventory/management#receiving` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/receipts` | `clinic/inventory/management#create_receipt` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/lots` | `clinic/inventory/management#lots` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/lots/:id/transfer` | `clinic/inventory/management#create_transfer` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/lots/:id/adjust` | `clinic/inventory/management#create_adjustment` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/lots/:id/count` | `clinic/inventory/management#create_count` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/counts/:id/approve` | `clinic/inventory/management#approve_count` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/activity` | `clinic/inventory/management#activity` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/recalls` | `clinic/inventory/management#recalls` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/recalls` | `clinic/inventory/management#create_recall` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/recalls/:id/disposition` | `clinic/inventory/management#create_disposition` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/recalls/:id/contain` | `clinic/inventory/management#contain_recall` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/recalls/:id/close` | `clinic/inventory/management#close_recall` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/count-sessions` | `clinic/inventory/management#count_sessions` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/count-sessions` | `clinic/inventory/management#create_count_session` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/count-sessions/:id/reassign` | `clinic/inventory/management#reassign_count_session` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/count-sessions/:id/complete` | `clinic/inventory/management#complete_count_session` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/count-sessions/:id/cancel` | `clinic/inventory/management#cancel_count_session` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/count-session-lines/:id/observe` | `clinic/inventory/management#observe_session_line` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/count-session-lines/:id/skip` | `clinic/inventory/management#skip_session_line` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/count-session-lines/:id/resume` | `clinic/inventory/management#resume_session_line` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/inventory/controlled` | `clinic/inventory/management#controlled` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/controlled/:id/investigate` | `clinic/inventory/management#investigate_control` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `POST` | `/api/clinic/inventory/controlled/:id/certify` | `clinic/inventory/management#certify_control` | W12 | `apps/api/app/controllers/clinic/inventory/management_controller.rb` |
| `GET` | `/api/clinic/lab_reports/review_queue` | `clinic/care/lab_reports#review_queue` | W10 | `apps/api/app/controllers/clinic/care/lab_reports_controller.rb` |
| `GET` | `/api/clinic/lab_reports/follow_up_queue` | `clinic/care/lab_reports#follow_up_queue` | W10 | `apps/api/app/controllers/clinic/care/lab_reports_controller.rb` |
| `GET` | `/api/clinic/patients/lookup` | `clinic/care/patients#lookup` | W04 | `apps/api/app/controllers/clinic/care/patients_controller.rb` |
| `GET` | `/api/clinic/patients/:id/billing_ledger` | `clinic/billing/patient_ledgers#show` | W13 | `apps/api/app/controllers/clinic/billing/patient_ledgers_controller.rb` |
| `POST` | `/api/clinic/patients/:id/note` | `clinic/care/patients#note` | W04 | `apps/api/app/controllers/clinic/care/patients_controller.rb` |
| `GET` | `/api/clinic/patients/:id/previous_signed_soap` | `clinic/care/patient_chart_history#show` | W04 | `apps/api/app/controllers/clinic/care/patient_chart_history_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/care_summary` | `clinic/care/patient_care_summaries#show` | W04 | `apps/api/app/controllers/clinic/care/patient_care_summaries_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/intake_consents` | `clinic/care/intake_consents#show` | W04 | `apps/api/app/controllers/clinic/care/intake_consents_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/intake_consents` | `clinic/care/intake_consents#create` | W04 | `apps/api/app/controllers/clinic/care/intake_consents_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/care_coordination/references` | `clinic/care/patient_care_coordinations#references` | W04 | `apps/api/app/controllers/clinic/care/patient_care_coordinations_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/care_coordination` | `clinic/care/patient_care_coordinations#show` | W04 | `apps/api/app/controllers/clinic/care/patient_care_coordinations_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/care_coordination` | `clinic/care/patient_care_coordinations#create` | W04 | `apps/api/app/controllers/clinic/care/patient_care_coordinations_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/clinical_history` | `clinic/care/clinical_history#index` | W04 | `apps/api/app/controllers/clinic/care/clinical_history_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/clinical_history/reviews` | `clinic/care/clinical_history#review` | W04 | `apps/api/app/controllers/clinic/care/clinical_history_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/clinical_history/:kind` | `clinic/care/clinical_history#create` | W04 | `apps/api/app/controllers/clinic/care/clinical_history_controller.rb` |
| `PATCH` | `/api/clinic/patients/:patient_id/clinical_history/:kind/:id` | `clinic/care/clinical_history#update` | W04 | `apps/api/app/controllers/clinic/care/clinical_history_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/vital_signs` | `clinic/care/vital_signs#show` | W04 | `apps/api/app/controllers/clinic/care/vital_signs_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/vital_signs` | `clinic/care/vital_signs#create` | W04 | `apps/api/app/controllers/clinic/care/vital_signs_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/encounters` | `clinic/scheduling/encounters#index` | W04 | `apps/api/app/controllers/clinic/scheduling/encounters_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/encounters` | `clinic/scheduling/encounters#create` | W04 | `apps/api/app/controllers/clinic/scheduling/encounters_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/previsit_note` | `clinic/care/previsit_notes#show` | W04 | `apps/api/app/controllers/clinic/care/previsit_notes_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/encounters/:encounter_id/visit_instructions` | `clinic/care/visit_instructions#show` | W04 | `apps/api/app/controllers/clinic/care/visit_instructions_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/observations` | `clinic/care/observations#index` | W10 | `apps/api/app/controllers/clinic/care/observations_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/observations` | `clinic/care/observations#create` | W10 | `apps/api/app/controllers/clinic/care/observations_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/lab_reports/:id/versions` | `clinic/care/lab_reports#create_version` | W10 | `apps/api/app/controllers/clinic/care/lab_reports_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/lab_reports/:id/versions/:version_id/results/:result_index/history` | `clinic/care/lab_reports#result_history` | W10 | `apps/api/app/controllers/clinic/care/lab_reports_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/lab_reports/:id/versions/:version_id/review` | `clinic/care/lab_reports#review` | W10 | `apps/api/app/controllers/clinic/care/lab_reports_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/lab_reports/:id/versions/:version_id/actions` | `clinic/care/lab_reports#record_action` | W10 | `apps/api/app/controllers/clinic/care/lab_reports_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/lab_reports/:id/versions/:version_id/follow_up` | `clinic/care/lab_reports#record_follow_up` | W10 | `apps/api/app/controllers/clinic/care/lab_reports_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/lab_reports/:id/versions/:version_id/follow_up/complete` | `clinic/care/lab_reports#complete_follow_up` | W10 | `apps/api/app/controllers/clinic/care/lab_reports_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/lab_reports` | `clinic/care/lab_reports#index` | W10 | `apps/api/app/controllers/clinic/care/lab_reports_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/lab_reports` | `clinic/care/lab_reports#create` | W10 | `apps/api/app/controllers/clinic/care/lab_reports_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/lab_reports/:id` | `clinic/care/lab_reports#show` | W10 | `apps/api/app/controllers/clinic/care/lab_reports_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/address_versions` | `clinic/care/patient_addresses#index` | W04 | `apps/api/app/controllers/clinic/care/patient_addresses_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/address_versions` | `clinic/care/patient_addresses#create` | W04 | `apps/api/app/controllers/clinic/care/patient_addresses_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/documents` | `clinic/documents#index` | W04 | `apps/api/app/controllers/clinic/documents_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/message_intents` | `clinic/messaging/message_intents#index` | W04 | `apps/api/app/controllers/clinic/messaging/message_intents_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/message_intents` | `clinic/messaging/message_intents#create` | W04 | `apps/api/app/controllers/clinic/messaging/message_intents_controller.rb` |
| `GET` | `/api/clinic/patients/:patient_id/invoices` | `clinic/billing/invoices#index` | W13 | `apps/api/app/controllers/clinic/billing/invoices_controller.rb` |
| `POST` | `/api/clinic/patients/:patient_id/invoices` | `clinic/billing/invoices#create` | W13 | `apps/api/app/controllers/clinic/billing/invoices_controller.rb` |
| `GET` | `/api/clinic/patients` | `clinic/care/patients#index` | W04 | `apps/api/app/controllers/clinic/care/patients_controller.rb` |
| `POST` | `/api/clinic/patients` | `clinic/care/patients#create` | W04 | `apps/api/app/controllers/clinic/care/patients_controller.rb` |
| `GET` | `/api/clinic/patients/:id` | `clinic/care/patients#show` | W04 | `apps/api/app/controllers/clinic/care/patients_controller.rb` |
| `PATCH` | `/api/clinic/patients/:id` | `clinic/care/patients#update` | W04 | `apps/api/app/controllers/clinic/care/patients_controller.rb` |
| `PUT` | `/api/clinic/patients/:id` | `clinic/care/patients#update` | W04 | `apps/api/app/controllers/clinic/care/patients_controller.rb` |
| `POST` | `/api/clinic/inventory/:id/adjust` | `clinic/inventory/items#adjust` | W12 | `apps/api/app/controllers/clinic/inventory/items_controller.rb` |
| `GET` | `/api/clinic/inventory` | `clinic/inventory/items#index` | W12 | `apps/api/app/controllers/clinic/inventory/items_controller.rb` |
| `POST` | `/api/clinic/inventory` | `clinic/inventory/items#create` | W12 | `apps/api/app/controllers/clinic/inventory/items_controller.rb` |
| `GET` | `/api/clinic/staff` | `clinic/staff/members#index` | W03 | `apps/api/app/controllers/clinic/staff/members_controller.rb` |
| `POST` | `/api/clinic/staff` | `clinic/staff/members#create` | W03 | `apps/api/app/controllers/clinic/staff/members_controller.rb` |
| `PATCH` | `/api/clinic/staff/:id` | `clinic/staff/members#update` | W03 | `apps/api/app/controllers/clinic/staff/members_controller.rb` |
| `PUT` | `/api/clinic/staff/:id` | `clinic/staff/members#update` | W03 | `apps/api/app/controllers/clinic/staff/members_controller.rb` |
| `POST` | `/api/clinic/workforce/badges/:id/revoke` | `clinic/workforce/badges#revoke` | W03 | `apps/api/app/controllers/clinic/workforce/badges_controller.rb` |
| `GET` | `/api/clinic/workforce/badges` | `clinic/workforce/badges#index` | W03 | `apps/api/app/controllers/clinic/workforce/badges_controller.rb` |
| `POST` | `/api/clinic/workforce/badges` | `clinic/workforce/badges#create` | W03 | `apps/api/app/controllers/clinic/workforce/badges_controller.rb` |
| `POST` | `/api/clinic/workforce/kiosks/:id/revoke` | `clinic/workforce/kiosks#revoke` | W03 | `apps/api/app/controllers/clinic/workforce/kiosks_controller.rb` |
| `GET` | `/api/clinic/workforce/kiosks` | `clinic/workforce/kiosks#index` | W03 | `apps/api/app/controllers/clinic/workforce/kiosks_controller.rb` |
| `POST` | `/api/clinic/workforce/kiosks` | `clinic/workforce/kiosks#create` | W03 | `apps/api/app/controllers/clinic/workforce/kiosks_controller.rb` |
| `POST` | `/api/clinic/workforce/timecards/calculate` | `clinic/workforce/timecards#calculate` | W03 | `apps/api/app/controllers/clinic/workforce/timecards_controller.rb` |
| `POST` | `/api/clinic/workforce/timecards/:id/submit` | `clinic/workforce/timecards#submit` | W03 | `apps/api/app/controllers/clinic/workforce/timecards_controller.rb` |
| `POST` | `/api/clinic/workforce/timecards/:id/approve` | `clinic/workforce/timecards#approve` | W03 | `apps/api/app/controllers/clinic/workforce/timecards_controller.rb` |
| `GET` | `/api/clinic/workforce/timecards` | `clinic/workforce/timecards#index` | W03 | `apps/api/app/controllers/clinic/workforce/timecards_controller.rb` |
| `GET` | `/api/clinic/workforce/timecards/:id` | `clinic/workforce/timecards#show` | W03 | `apps/api/app/controllers/clinic/workforce/timecards_controller.rb` |
| `POST` | `/api/clinic/workforce/adjustments/:id/decide` | `clinic/workforce/adjustments#decide` | W03 | `apps/api/app/controllers/clinic/workforce/adjustments_controller.rb` |
| `GET` | `/api/clinic/workforce/adjustments` | `clinic/workforce/adjustments#index` | W03 | `apps/api/app/controllers/clinic/workforce/adjustments_controller.rb` |
| `POST` | `/api/clinic/workforce/adjustments` | `clinic/workforce/adjustments#create` | W03 | `apps/api/app/controllers/clinic/workforce/adjustments_controller.rb` |
| `GET` | `/api/clinic/workforce/employments` | `clinic/workforce/employments#index` | W03 | `apps/api/app/controllers/clinic/workforce/employments_controller.rb` |
| `POST` | `/api/clinic/workforce/employments` | `clinic/workforce/employments#create` | W03 | `apps/api/app/controllers/clinic/workforce/employments_controller.rb` |
| `PATCH` | `/api/clinic/workforce/employments/:id` | `clinic/workforce/employments#update` | W03 | `apps/api/app/controllers/clinic/workforce/employments_controller.rb` |
| `PUT` | `/api/clinic/workforce/employments/:id` | `clinic/workforce/employments#update` | W03 | `apps/api/app/controllers/clinic/workforce/employments_controller.rb` |
| `GET` | `/api/clinic/workforce/settings` | `clinic/workforce/settings#show` | W03 | `apps/api/app/controllers/clinic/workforce/settings_controller.rb` |
| `PUT` | `/api/clinic/workforce/settings` | `clinic/workforce/settings#update` | W03 | `apps/api/app/controllers/clinic/workforce/settings_controller.rb` |
| `POST` | `/api/clinic/workforce/onboarding` | `clinic/workforce/onboarding#create` | W03 | `apps/api/app/controllers/clinic/workforce/onboarding_controller.rb` |
| `PATCH` | `/api/clinic/workforce/onboarding/:id` | `clinic/workforce/onboarding#update` | W03 | `apps/api/app/controllers/clinic/workforce/onboarding_controller.rb` |
| `GET` | `/api/clinic/workforce/schedules` | `clinic/workforce/schedules#index` | W06 | `apps/api/app/controllers/clinic/workforce/schedules_controller.rb` |
| `GET` | `/api/clinic/workforce/my-schedule` | `clinic/workforce/schedules#employee` | W06 | `apps/api/app/controllers/clinic/workforce/schedules_controller.rb` |
| `GET` | `/api/clinic/workforce/schedule-drafts/:id` | `clinic/workforce/schedules#show_draft` | W06 | `apps/api/app/controllers/clinic/workforce/schedules_controller.rb` |
| `POST` | `/api/clinic/workforce/schedule-templates` | `clinic/workforce/schedules#create_template` | W06 | `apps/api/app/controllers/clinic/workforce/schedules_controller.rb` |
| `PATCH` | `/api/clinic/workforce/schedule-templates/:id` | `clinic/workforce/schedules#update_template` | W06 | `apps/api/app/controllers/clinic/workforce/schedules_controller.rb` |
| `POST` | `/api/clinic/workforce/schedule-drafts` | `clinic/workforce/schedules#create_draft` | W06 | `apps/api/app/controllers/clinic/workforce/schedules_controller.rb` |
| `POST` | `/api/clinic/workforce/schedule-drafts/:id/shifts` | `clinic/workforce/schedules#upsert_shift` | W06 | `apps/api/app/controllers/clinic/workforce/schedules_controller.rb` |
| `DELETE` | `/api/clinic/workforce/schedule-drafts/:id/shifts/:shift_id` | `clinic/workforce/schedules#destroy_shift` | W06 | `apps/api/app/controllers/clinic/workforce/schedules_controller.rb` |
| `POST` | `/api/clinic/workforce/schedule-drafts/:id/validate` | `clinic/workforce/schedules#validate_draft` | W06 | `apps/api/app/controllers/clinic/workforce/schedules_controller.rb` |
| `POST` | `/api/clinic/workforce/schedule-drafts/:id/publish` | `clinic/workforce/schedules#publish` | W06 | `apps/api/app/controllers/clinic/workforce/schedules_controller.rb` |
| `GET` | `/api/clinic/workforce/requests` | `clinic/workforce/workforce_requests#index` | W03 | `apps/api/app/controllers/clinic/workforce/workforce_requests_controller.rb` |
| `POST` | `/api/clinic/workforce/availability` | `clinic/workforce/workforce_requests#create_availability` | W03 | `apps/api/app/controllers/clinic/workforce/workforce_requests_controller.rb` |
| `POST` | `/api/clinic/workforce/time-off-requests` | `clinic/workforce/workforce_requests#create_time_off` | W03 | `apps/api/app/controllers/clinic/workforce/workforce_requests_controller.rb` |
| `POST` | `/api/clinic/workforce/shift-swap-requests` | `clinic/workforce/workforce_requests#create_swap` | W03 | `apps/api/app/controllers/clinic/workforce/workforce_requests_controller.rb` |
| `POST` | `/api/clinic/workforce/requests/:id/decision` | `clinic/workforce/workforce_requests#decision` | W03 | `apps/api/app/controllers/clinic/workforce/workforce_requests_controller.rb` |
| `GET` | `/api/clinic/workforce/payroll-exports` | `clinic/workforce/payroll_exports#index` | W03 | `apps/api/app/controllers/clinic/workforce/payroll_exports_controller.rb` |
| `POST` | `/api/clinic/workforce/payroll-exports/configuration` | `clinic/workforce/payroll_exports#configure` | W03 | `apps/api/app/controllers/clinic/workforce/payroll_exports_controller.rb` |
| `POST` | `/api/clinic/workforce/payroll-exports/preview` | `clinic/workforce/payroll_exports#preview` | W03 | `apps/api/app/controllers/clinic/workforce/payroll_exports_controller.rb` |
| `POST` | `/api/clinic/workforce/payroll-exports` | `clinic/workforce/payroll_exports#create` | W03 | `apps/api/app/controllers/clinic/workforce/payroll_exports_controller.rb` |
| `GET` | `/api/clinic/workforce/payroll-exports/:id/download` | `clinic/workforce/payroll_exports#download` | W03 | `apps/api/app/controllers/clinic/workforce/payroll_exports_controller.rb` |
| `GET` | `/api/clinic/staff-messaging/conversations` | `clinic/messaging/staff#index` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `POST` | `/api/clinic/staff-messaging/conversations` | `clinic/messaging/staff#create_conversation` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `GET` | `/api/clinic/staff-messaging/conversations/:id` | `clinic/messaging/staff#show` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `POST` | `/api/clinic/staff-messaging/conversations/:id/messages` | `clinic/messaging/staff#create_message` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `POST` | `/api/clinic/staff-messaging/conversations/:id/read` | `clinic/messaging/staff#mark_read` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `POST` | `/api/clinic/staff-messaging/conversations/:id/recover` | `clinic/messaging/staff#recover` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `GET` | `/api/clinic/staff-messaging/participants` | `clinic/messaging/staff#participants` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `GET` | `/api/clinic/staff-messaging/notifications` | `clinic/messaging/staff#notifications` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `POST` | `/api/clinic/staff-messaging/notifications/:id/read` | `clinic/messaging/staff#read_notification` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `GET` | `/api/clinic/staff-messaging/preferences` | `clinic/messaging/staff#preferences` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `PATCH` | `/api/clinic/staff-messaging/preferences` | `clinic/messaging/staff#preferences` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `POST` | `/api/clinic/staff-messaging/messages/:id/acknowledge` | `clinic/messaging/staff#acknowledge` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `POST` | `/api/clinic/staff-messaging/requests/:id/transition` | `clinic/messaging/staff#transition` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `PATCH` | `/api/clinic/staff-messaging/requests/:id/manage` | `clinic/messaging/staff#manage_request` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `POST` | `/api/clinic/staff-messaging/requests/:id/escalate` | `clinic/messaging/staff#escalate` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `POST` | `/api/clinic/staff-messaging/messages/:message_id/attachments` | `clinic/messaging/staff#presign_attachment` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `POST` | `/api/clinic/staff-messaging/attachments/:id/complete` | `clinic/messaging/staff#complete_attachment` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `GET` | `/api/clinic/staff-messaging/attachments/:id/download` | `clinic/messaging/staff#download_attachment` | W03 | `apps/api/app/controllers/clinic/messaging/staff_controller.rb` |
| `POST` | `/api/clinic/patient_portal/invitations` | `clinic/patient_portal/invitations#create` | W04 | `apps/api/app/controllers/clinic/patient_portal/invitations_controller.rb` |
| `POST` | `/api/clinic/patient_portal/identities/:id/revoke` | `clinic/patient_portal/identity_lifecycle#revoke` | W04 | `apps/api/app/controllers/clinic/patient_portal/identity_lifecycle_controller.rb` |
| `GET` | `/api/clinic/scribe/templates` | `clinic/scribe/templates#index` | W16 | `apps/api/app/controllers/clinic/scribe/templates_controller.rb` |
| `POST` | `/api/clinic/scribe/encounters/create_synthetic` | `clinic/scribe/encounters#create_synthetic` | W08 | `apps/api/app/controllers/clinic/scribe/encounters_controller.rb` |
| `GET` | `/api/clinic/scribe/encounters/:encounter_id/recordings` | `clinic/scribe/recordings#index` | W08 | `apps/api/app/controllers/clinic/scribe/recordings_controller.rb` |
| `POST` | `/api/clinic/scribe/encounters/:encounter_id/recordings` | `clinic/scribe/recordings#create` | W08 | `apps/api/app/controllers/clinic/scribe/recordings_controller.rb` |
| `PATCH` | `/api/clinic/scribe/encounters/:id/context` | `clinic/scribe/encounters#context` | W08 | `apps/api/app/controllers/clinic/scribe/encounters_controller.rb` |
| `POST` | `/api/clinic/scribe/encounters/:id/bind_clinical_encounter` | `clinic/scribe/encounters#bind_clinical_encounter` | W08 | `apps/api/app/controllers/clinic/scribe/encounters_controller.rb` |
| `POST` | `/api/clinic/scribe/encounters/:id/lab_selections` | `clinic/scribe/encounters#lab_selections` | W10 | `apps/api/app/controllers/clinic/scribe/encounters_controller.rb` |
| `POST` | `/api/clinic/scribe/encounters/:id/consent` | `clinic/scribe/encounters#consent` | W08 | `apps/api/app/controllers/clinic/scribe/encounters_controller.rb` |
| `POST` | `/api/clinic/scribe/encounters/:id/sources` | `clinic/scribe/encounters#sources` | W08 | `apps/api/app/controllers/clinic/scribe/encounters_controller.rb` |
| `POST` | `/api/clinic/scribe/encounters/:id/generate` | `clinic/scribe/encounters#generate` | W08 | `apps/api/app/controllers/clinic/scribe/encounters_controller.rb` |
| `GET` | `/api/clinic/scribe/encounters` | `clinic/scribe/encounters#index` | W08 | `apps/api/app/controllers/clinic/scribe/encounters_controller.rb` |
| `POST` | `/api/clinic/scribe/encounters` | `clinic/scribe/encounters#create` | W08 | `apps/api/app/controllers/clinic/scribe/encounters_controller.rb` |
| `GET` | `/api/clinic/scribe/encounters/:id` | `clinic/scribe/encounters#show` | W08 | `apps/api/app/controllers/clinic/scribe/encounters_controller.rb` |
| `DELETE` | `/api/clinic/scribe/encounters/:id` | `clinic/scribe/encounters#destroy` | W08 | `apps/api/app/controllers/clinic/scribe/encounters_controller.rb` |
| `POST` | `/api/clinic/scribe/recordings/:id/chunk` | `clinic/scribe/recordings#chunk` | W16 | `apps/api/app/controllers/clinic/scribe/recordings_controller.rb` |
| `POST` | `/api/clinic/scribe/recordings/:id/finalize` | `clinic/scribe/recordings#finalize` | W16 | `apps/api/app/controllers/clinic/scribe/recordings_controller.rb` |
| `POST` | `/api/clinic/scribe/recordings/:id/transcribe` | `clinic/scribe/recordings#transcribe` | W16 | `apps/api/app/controllers/clinic/scribe/recordings_controller.rb` |
| `POST` | `/api/clinic/scribe/recordings/:id/interrupt` | `clinic/scribe/recordings#interrupt` | W16 | `apps/api/app/controllers/clinic/scribe/recordings_controller.rb` |
| `DELETE` | `/api/clinic/scribe/recordings/:id` | `clinic/scribe/recordings#cancel` | W16 | `apps/api/app/controllers/clinic/scribe/recordings_controller.rb` |
| `GET` | `/api/clinic/scribe/recordings/:id` | `clinic/scribe/recordings#show` | W16 | `apps/api/app/controllers/clinic/scribe/recordings_controller.rb` |
| `POST` | `/api/clinic/scribe/drafts/:id/sections` | `clinic/scribe/drafts#sections` | W16 | `apps/api/app/controllers/clinic/scribe/drafts_controller.rb` |
| `POST` | `/api/clinic/scribe/drafts/:id/restore` | `clinic/scribe/drafts#restore` | W16 | `apps/api/app/controllers/clinic/scribe/drafts_controller.rb` |
| `POST` | `/api/clinic/scribe/drafts/:id/review` | `clinic/scribe/drafts#review` | W16 | `apps/api/app/controllers/clinic/scribe/drafts_controller.rb` |
| `POST` | `/api/clinic/scribe/drafts/:id/approve` | `clinic/scribe/drafts#approve` | W16 | `apps/api/app/controllers/clinic/scribe/drafts_controller.rb` |
| `POST` | `/api/clinic/scribe/drafts/:id/export` | `clinic/scribe/drafts#export` | W16 | `apps/api/app/controllers/clinic/scribe/drafts_controller.rb` |
