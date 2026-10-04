# Meta Clinic plugin operation coverage

This is a curated catalog of 90 operations (61 reads and 29 deliberate writes) backed by the existing Rails API at integration base `74c5b15abbec`. It exposes practical clinic operations; it does not implement every application function or add backend business logic. Source presence is not runtime, browser, hosted, clinical, legal, or release acceptance.

`server/catalog.mjs` exports `OPERATIONS`. Each operation carries its HTTP method, clinic API path, closed JSON Schema, query/body field allowlists, optional body wrapper, existing app link and controller source. IDs remain strings. Money and stock quantities remain exact decimal strings. Integer stock reorder points remain integers. API responses retain their backend ownership and pagination.

## Calling contract

Use an authenticated session for an authorized synthetic clinic. Read `/api/csrf` first, keep its CSRF state and cookie in the connection, read `/api/session`, then read `/api/clinic/context`. The normal web client uses the same origin and sends `X-Clinic-Actor` and `X-Clinic-Practice` for clinic calls plus `X-CSRF-Token` for writes. A plugin connection must preserve the equivalent session protections and refresh context after actor, practice or site changes.

`queryKeys` identifies GET query parameters. Replace colon path parameters with URL encoded values from the schema. `bodyKeys` identifies allowed mutation fields; omit every other argument and put those fields under `bodyRoot` when present. Missing optional fields must remain omitted. Schema fields provide panel form metadata; `oneOf` invoice lines require one of the documented catalog, manual or retained-line shapes. Backend validation and authorization remain authoritative.

Every mutation has `requiresConfirmation: true`, `mutation: true`, `replay: 'never'`, and `readOnlyHint: false`. Submit only a deliberate selected operation with reviewed arguments. A request key is backend deduplication evidence, not permission to repeat or automatically replay a write after a timeout or context change. Read the current record or protected operation receipt to resolve an uncertain outcome. Do not combine unrelated writes into an automatic sequence.

## Practical coverage

- Schedule/front desk: calendar availability, appointment detail, ordinary clinician booking, rescheduling, status transitions, appointment request review, callbacks, room assignment and encounter start.
- Patients/chart: registry and identity matching, registration updates, chart and care summary, encounter completion review, observations, vital sign field dictionary, notes, allergies/medications/conditions, lab queue and document metadata.
- Billing: invoice dashboards and detail, patient ledger, unposted invoice drafts, billing service catalog edits, agreements and subscription catalog.
- Inventory: catalog, exceptions, locations, replenishment, purchase order detail, receiving, stock positions/history, recalls and count sessions, count observation and reorder settings.
- Staff/tasks/messages: staff directory, employment/access projections, workforce schedules/timecards/settings, follow-up queue, conversations, internal messages, acknowledgments and request transitions.
- Facilities/settings: facility/room/department/visit type lookup, room edits, visit type creation, workforce contract, telehealth configuration and booking policy reads.
- Telehealth/reporting: preparation and visit queue/detail; daily visit, invoice, stock movement and payment reports, current stock and open clinical work.

## Backend conditions to review before writes

Ordinary appointment booking requires patient, site, clinician, visit type and start/end timestamps. Rescheduling requires the current `expected_updated_at` and a request key. The calendar is a projection; booking rechecks availability under backend locks. Cancellation additionally requires `cancellation_message_acknowledged=true`. Registration requires a selected configured location, display name, immutable clinic reference and documented sex or unknown. Updating registration retains the original reference.

Closing a callback as resolved or declined requires a review note with the actual contact outcome. Team/role conversations require a title; direct conversations require exactly two participants including the caller. Use membership IDs returned by the participant API. Staff request transitions obey their current state and resolution policy. Room kind cannot change when appointments are linked.

Invoice lines use either a billing service ID plus its lock version and quantity, or a manual description/unit amount/quantity. Draft updates can retain an invoice line ID and quantity without overriding its catalog/amount fields. Invoice currency, service lock versions and expected record timestamps must come from the current backend record. Catalog edits require current lock versions. Count sessions require a stocked leaf location and eligible assignee; count observations do not approve variances or post stock changes automatically.

## Deliberately omitted

Destructive demo resets, merges/deletions, credential/access grants or revocations, clinical note signing/corrections, prescriptions and medication administration, clinical diagnosis/order authoring, complex chart and intake revisions, invoice posting/credits/write-offs/payments/refunds, cash drawer reconciliation, procurement checkout/provider submission, inventory stock movement/recall disposition/variance approval, external messages/reminder dispatch, upload/download transport, workforce publication/payroll exports, and telehealth provider room/join tokens are outside this catalog. Specialized workflows remain available in the full clinic application subject to its existing permission and authority checks. Some additional read filters are intentionally omitted rather than accepting arbitrary input.

Session login, logout, development account selection, and practice switching are connection concerns outside the clinic operation catalog. Existing sources are `apps/api/app/controllers/identity/api/sessions_controller.rb`, `identity/api/development_access_controller.rb`, `clinic/context_controller.rb`, `apps/api/config/routes.rb`, and `apps/web/src/api/client.ts`. Development profiles come from `/api/csrf`'s `development_accounts`; do not invent profile IDs. `/api/development_session` accepts the chosen profile/portal and optional practice/site. `/api/development_access` is Omni only and requires `expected_user_id`. A context practice switch clears the selected site.

## Source inventory

All paths below are declared in [`apps/api/config/routes.rb`](../../../apps/api/config/routes.rb). Each row links the controller defining the request and response contract. Supporting validation lives in the corresponding models/services; examples include `scheduling/book_appointment.rb`, `clinic/appointment.rb`, `messaging/create_staff_conversation.rb`, `clinic/staff_message_request.rb`, `inventory/count_program.rb`, `inventory/pharmacy_product.rb`, `telehealth/visit_queue.rb`, and `operations/follow_up_worklist.rb`. Existing UI links were mapped against `apps/web/src/App.tsx`, `features/workforce/WorkforceApp.tsx`, and the inventory navigation.

| Operation | Domain | HTTP endpoint | Request/response source |
| --- | --- | --- | --- |
| `clinic_context` | Context | `GET /api/clinic/context` | [context](../../../apps/api/app/controllers/clinic/context_controller.rb) |
| `select_clinic_site` | Context | `PATCH /api/clinic/context` | [context](../../../apps/api/app/controllers/clinic/context_controller.rb) |
| `list_appointments` | Schedule | `GET /api/clinic/appointments` | [scheduling/appointments](../../../apps/api/app/controllers/clinic/scheduling/appointments_controller.rb) |
| `get_appointment` | Schedule | `GET /api/clinic/appointments/:id` | [scheduling/appointments](../../../apps/api/app/controllers/clinic/scheduling/appointments_controller.rb) |
| `book_appointment` | Schedule | `POST /api/clinic/appointments` | [scheduling/appointments](../../../apps/api/app/controllers/clinic/scheduling/appointments_controller.rb) |
| `reschedule_appointment` | Schedule | `PATCH /api/clinic/appointments/:id` | [scheduling/appointments](../../../apps/api/app/controllers/clinic/scheduling/appointments_controller.rb) |
| `transition_appointment` | Schedule | `POST /api/clinic/appointments/:id/transition` | [scheduling/appointments](../../../apps/api/app/controllers/clinic/scheduling/appointments_controller.rb) |
| `schedule_calendar` | Schedule | `GET /api/clinic/schedule_calendar` | [scheduling/calendar](../../../apps/api/app/controllers/clinic/scheduling/calendar_controller.rb) |
| `tracking_board` | Schedule | `GET /api/clinic/tracking_board` | [scheduling/tracking_board](../../../apps/api/app/controllers/clinic/scheduling/tracking_board_controller.rb) |
| `appointment_requests` | Schedule | `GET /api/clinic/appointment_requests` | [operations/appointment_requests](../../../apps/api/app/controllers/clinic/operations/appointment_requests_controller.rb) |
| `approve_appointment_request` | Schedule | `POST /api/clinic/appointment_requests/:id/approve` | [operations/appointment_requests](../../../apps/api/app/controllers/clinic/operations/appointment_requests_controller.rb) |
| `decline_appointment_request` | Schedule | `POST /api/clinic/appointment_requests/:id/decline` | [operations/appointment_requests](../../../apps/api/app/controllers/clinic/operations/appointment_requests_controller.rb) |
| `callback_requests` | Schedule | `GET /api/clinic/callback_requests` | [operations/callback_requests](../../../apps/api/app/controllers/clinic/operations/callback_requests_controller.rb) |
| `review_callback_request` | Schedule | `POST /api/clinic/callback_requests/:id/transition` | [operations/callback_requests](../../../apps/api/app/controllers/clinic/operations/callback_requests_controller.rb) |
| `list_encounters` | Chart | `GET /api/clinic/patients/:patient_id/encounters` | [scheduling/encounters](../../../apps/api/app/controllers/clinic/scheduling/encounters_controller.rb) |
| `get_encounter` | Chart | `GET /api/clinic/encounters/:id` | [scheduling/encounters](../../../apps/api/app/controllers/clinic/scheduling/encounters_controller.rb) |
| `start_encounter` | Chart | `POST /api/clinic/patients/:patient_id/encounters` | [scheduling/encounters](../../../apps/api/app/controllers/clinic/scheduling/encounters_controller.rb) |
| `assign_encounter_room` | Schedule | `PATCH /api/clinic/patients/:patient_id/encounters/:encounter_id/room` | [scheduling/encounters](../../../apps/api/app/controllers/clinic/scheduling/encounters_controller.rb) |
| `encounter_completion` | Chart | `GET /api/clinic/encounters/:id/completion` | [scheduling/encounters](../../../apps/api/app/controllers/clinic/scheduling/encounters_controller.rb) |
| `list_patients` | Patients | `GET /api/clinic/patients` | [care/patients](../../../apps/api/app/controllers/clinic/care/patients_controller.rb) |
| `lookup_patient` | Patients | `GET /api/clinic/patients/lookup` | [care/patients](../../../apps/api/app/controllers/clinic/care/patients_controller.rb) |
| `get_patient` | Patients | `GET /api/clinic/patients/:id` | [care/patients](../../../apps/api/app/controllers/clinic/care/patients_controller.rb) |
| `register_patient` | Patients | `POST /api/clinic/patients` | [care/patients](../../../apps/api/app/controllers/clinic/care/patients_controller.rb) |
| `update_patient_registration` | Patients | `PATCH /api/clinic/patients/:id` | [care/patients](../../../apps/api/app/controllers/clinic/care/patients_controller.rb) |
| `add_patient_note` | Patients | `POST /api/clinic/patients/:id/note` | [care/patients](../../../apps/api/app/controllers/clinic/care/patients_controller.rb) |
| `patient_care_summary` | Chart | `GET /api/clinic/patients/:patient_id/care_summary` | [care/patient_care_summaries](../../../apps/api/app/controllers/clinic/care/patient_care_summaries_controller.rb) |
| `patient_observations` | Chart | `GET /api/clinic/patients/:patient_id/observations` | [care/observations](../../../apps/api/app/controllers/clinic/care/observations_controller.rb) |
| `vital_sign_dictionary` | Chart | `GET /api/clinic/patients/:patient_id/encounters/:encounter_id/vital_signs` | [care/vital_signs](../../../apps/api/app/controllers/clinic/care/vital_signs_controller.rb) |
| `encounter_notes` | Chart | `GET /api/clinic/encounters/:encounter_id/notes` | [care/encounter_notes](../../../apps/api/app/controllers/clinic/care/encounter_notes_controller.rb) |
| `clinical_history` | Chart | `GET /api/clinic/patients/:patient_id/clinical_history` | [care/clinical_history](../../../apps/api/app/controllers/clinic/care/clinical_history_controller.rb) |
| `patient_lab_reports` | Chart | `GET /api/clinic/patients/:patient_id/lab_reports` | [care/lab_reports](../../../apps/api/app/controllers/clinic/care/lab_reports_controller.rb) |
| `lab_review_queue` | Tasks | `GET /api/clinic/lab_reports/review_queue` | [care/lab_reports](../../../apps/api/app/controllers/clinic/care/lab_reports_controller.rb) |
| `patient_documents` | Chart | `GET /api/clinic/patients/:patient_id/documents` | [documents](../../../apps/api/app/controllers/clinic/documents_controller.rb) |
| `billing_dashboard` | Billing | `GET /api/clinic/billing` | [billing/dashboard](../../../apps/api/app/controllers/clinic/billing/dashboard_controller.rb) |
| `income_outlook` | Billing | `GET /api/clinic/billing/income_outlook` | [billing/dashboard](../../../apps/api/app/controllers/clinic/billing/dashboard_controller.rb) |
| `patient_billing_ledger` | Billing | `GET /api/clinic/patients/:id/billing_ledger` | [billing/patient_ledgers](../../../apps/api/app/controllers/clinic/billing/patient_ledgers_controller.rb) |
| `patient_invoices` | Billing | `GET /api/clinic/patients/:patient_id/invoices` | [billing/invoices](../../../apps/api/app/controllers/clinic/billing/invoices_controller.rb) |
| `get_invoice` | Billing | `GET /api/clinic/invoices/:id` | [billing/invoices](../../../apps/api/app/controllers/clinic/billing/invoices_controller.rb) |
| `draft_invoice` | Billing | `POST /api/clinic/patients/:patient_id/invoices` | [billing/invoices](../../../apps/api/app/controllers/clinic/billing/invoices_controller.rb) |
| `update_draft_invoice` | Billing | `PATCH /api/clinic/invoices/:id/draft` | [billing/invoices](../../../apps/api/app/controllers/clinic/billing/invoices_controller.rb) |
| `billing_services` | Billing | `GET /api/clinic/billing_services` | [billing_services](../../../apps/api/app/controllers/clinic/billing_services_controller.rb) |
| `create_billing_service` | Billing | `POST /api/clinic/billing_services` | [billing_services](../../../apps/api/app/controllers/clinic/billing_services_controller.rb) |
| `update_billing_service` | Billing | `PATCH /api/clinic/billing_services/:id` | [billing_services](../../../apps/api/app/controllers/clinic/billing_services_controller.rb) |
| `subscriptions` | Billing | `GET /api/clinic/subscriptions` | [billing/subscriptions](../../../apps/api/app/controllers/clinic/billing/subscriptions_controller.rb) |
| `subscription_catalog` | Billing | `GET /api/clinic/subscription_catalog` | [care/subscription_catalog](../../../apps/api/app/controllers/clinic/care/subscription_catalog_controller.rb) |
| `inventory_catalog` | Inventory | `GET /api/clinic/inventory/catalog` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `inventory_exceptions` | Inventory | `GET /api/clinic/inventory/exceptions` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `inventory_locations` | Inventory | `GET /api/clinic/inventory/locations` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `replenishment_plan` | Inventory | `GET /api/clinic/inventory/replenishment` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `purchase_orders` | Inventory | `GET /api/clinic/inventory/purchase-orders` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `get_purchase_order` | Inventory | `GET /api/clinic/inventory/purchase-orders/:id` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `inventory_receiving` | Inventory | `GET /api/clinic/inventory/receiving` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `inventory_positions` | Inventory | `GET /api/clinic/inventory/lots` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `inventory_activity` | Inventory | `GET /api/clinic/inventory/activity` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `inventory_recalls` | Inventory | `GET /api/clinic/inventory/recalls` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `inventory_count_sessions` | Inventory | `GET /api/clinic/inventory/count-sessions` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `create_inventory_count` | Inventory | `POST /api/clinic/inventory/count-sessions` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `record_inventory_count` | Inventory | `POST /api/clinic/inventory/count-session-lines/:id/observe` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `update_inventory_product` | Inventory | `PATCH /api/clinic/inventory/products/:id` | [inventory/management](../../../apps/api/app/controllers/clinic/inventory/management_controller.rb) |
| `staff_directory` | Staff | `GET /api/clinic/staff` | [staff/members](../../../apps/api/app/controllers/clinic/staff/members_controller.rb) |
| `create_staff_member` | Staff | `POST /api/clinic/staff` | [staff/members](../../../apps/api/app/controllers/clinic/staff/members_controller.rb) |
| `update_staff_active` | Staff | `PATCH /api/clinic/staff/:id` | [staff/members](../../../apps/api/app/controllers/clinic/staff/members_controller.rb) |
| `workforce_employments` | Staff | `GET /api/clinic/workforce/employments` | [workforce/employments](../../../apps/api/app/controllers/clinic/workforce/employments_controller.rb) |
| `workforce_schedules` | Staff | `GET /api/clinic/workforce/schedules` | [workforce/schedules](../../../apps/api/app/controllers/clinic/workforce/schedules_controller.rb) |
| `workforce_timecards` | Staff | `GET /api/clinic/workforce/timecards` | [workforce/timecards](../../../apps/api/app/controllers/clinic/workforce/timecards_controller.rb) |
| `get_timecard` | Staff | `GET /api/clinic/workforce/timecards/:id` | [workforce/timecards](../../../apps/api/app/controllers/clinic/workforce/timecards_controller.rb) |
| `facilities` | Facilities | `GET /api/clinic/facilities` | [facilities](../../../apps/api/app/controllers/clinic/facilities_controller.rb) |
| `create_facility_room` | Facilities | `POST /api/clinic/facilities/:id/rooms` | [facilities](../../../apps/api/app/controllers/clinic/facilities_controller.rb) |
| `update_facility_room` | Facilities | `PATCH /api/clinic/facilities/:id/rooms/:room_id` | [facilities](../../../apps/api/app/controllers/clinic/facilities_controller.rb) |
| `create_visit_type` | Facilities | `POST /api/clinic/visit_types` | [visit_types](../../../apps/api/app/controllers/clinic/visit_types_controller.rb) |
| `workforce_settings` | Settings | `GET /api/clinic/workforce/settings` | [workforce/settings](../../../apps/api/app/controllers/clinic/workforce/settings_controller.rb) |
| `staff_conversations` | Messages | `GET /api/clinic/staff-messaging/conversations` | [messaging/staff](../../../apps/api/app/controllers/clinic/messaging/staff_controller.rb) |
| `get_staff_conversation` | Messages | `GET /api/clinic/staff-messaging/conversations/:id` | [messaging/staff](../../../apps/api/app/controllers/clinic/messaging/staff_controller.rb) |
| `staff_message_participants` | Messages | `GET /api/clinic/staff-messaging/participants` | [messaging/staff](../../../apps/api/app/controllers/clinic/messaging/staff_controller.rb) |
| `create_staff_conversation` | Messages | `POST /api/clinic/staff-messaging/conversations` | [messaging/staff](../../../apps/api/app/controllers/clinic/messaging/staff_controller.rb) |
| `send_staff_message` | Messages | `POST /api/clinic/staff-messaging/conversations/:id/messages` | [messaging/staff](../../../apps/api/app/controllers/clinic/messaging/staff_controller.rb) |
| `acknowledge_staff_message` | Messages | `POST /api/clinic/staff-messaging/messages/:id/acknowledge` | [messaging/staff](../../../apps/api/app/controllers/clinic/messaging/staff_controller.rb) |
| `transition_staff_request` | Tasks | `POST /api/clinic/staff-messaging/requests/:id/transition` | [messaging/staff](../../../apps/api/app/controllers/clinic/messaging/staff_controller.rb) |
| `mark_staff_conversation_read` | Messages | `POST /api/clinic/staff-messaging/conversations/:id/read` | [messaging/staff](../../../apps/api/app/controllers/clinic/messaging/staff_controller.rb) |
| `follow_up_worklist` | Tasks | `GET /api/clinic/operations/follow_ups` | [operations/follow_ups](../../../apps/api/app/controllers/clinic/operations/follow_ups_controller.rb) |
| `telehealth_visits` | Telehealth | `GET /api/clinic/telehealth/visits` | [telehealth/visits](../../../apps/api/app/controllers/clinic/telehealth/visits_controller.rb) |
| `get_telehealth_visit` | Telehealth | `GET /api/clinic/telehealth/visits/:visit_id` | [telehealth/visits](../../../apps/api/app/controllers/clinic/telehealth/visits_controller.rb) |
| `telehealth_booking_options` | Telehealth | `GET /api/clinic/telehealth/booking_options` | [telehealth/booking_options](../../../apps/api/app/controllers/clinic/telehealth/booking_options_controller.rb) |
| `telehealth_settings` | Settings | `GET /api/clinic/telehealth/settings` | [telehealth/settings](../../../apps/api/app/controllers/clinic/telehealth/settings_controller.rb) |
| `report_daily_visits` | Reports | `GET /api/clinic/reports/daily_visits_by_state` | [reports/daily_visits_by_state](../../../apps/api/app/controllers/clinic/reports/daily_visits_by_state_controller.rb) |
| `report_daily_invoices` | Reports | `GET /api/clinic/reports/daily_invoices` | [reports/daily_invoices](../../../apps/api/app/controllers/clinic/reports/daily_invoices_controller.rb) |
| `report_stock_movements` | Reports | `GET /api/clinic/reports/daily_stock_movements` | [reports/daily_stock_movements](../../../apps/api/app/controllers/clinic/reports/daily_stock_movements_controller.rb) |
| `report_daily_payments` | Reports | `GET /api/clinic/reports/daily_payment_activity` | [reports/daily_payment_activity](../../../apps/api/app/controllers/clinic/reports/daily_payment_activity_controller.rb) |
| `report_current_stock` | Reports | `GET /api/clinic/reports/current_stock` | [reports/current_stock](../../../apps/api/app/controllers/clinic/reports/current_stock_controller.rb) |
| `report_open_clinical_work` | Reports | `GET /api/clinic/reports/open_clinical_work` | [reports/open_clinical_work](../../../apps/api/app/controllers/clinic/reports/open_clinical_work_controller.rb) |

## Evidence boundary

This catalog was assembled by route/controller/model/service source review. No tests, build, browser run or live requests were performed by the catalog worker. The integrator owns focused checks and final connection/UI acceptance. Deployment and plugin installation are separate authorized actions.
