# Canonical 116-workflow reconciliation

Imported October 4, 2026 from the owner-supplied prompt. Appendix B supplies the criteria; Appendix A remains a separate reported website observation. Neither supplies current plugin acceptance.

The 116 reported verdicts total 95 PASS, 8 FAIL and 13 BLOCKED. **19 IDs describe different subjects in the two appendices.** Other rows have incomplete or qualified evidence. No reported PASS is copied into integration acceptance.

The full criteria, intended roles, entry points, candidate read/write contracts, required fields, boundary rules, recovery cases and evidence limits are in [workflow-116.json](workflow-116.json). Candidate operations can be related reads only; they do not prove that a workflow is implemented. Exact website permissions and state machines still require source mapping before extending any missing write.

## Conflicting IDs

| ID | Criteria versus reported observation |
| --- | --- |
| WF-024 | Payroll exports criteria; reported result concerns direct timesheet entry. |
| WF-045 | Recurring series criteria; reported result concerns reminder policy. |
| WF-046 | Walk-in criteria; reported result concerns waitlist addition. |
| WF-047 | Late-arrival criteria; reported result concerns recurrence policy. |
| WF-048 | No-show criteria; reported result concerns overbooking policy. |
| WF-058 | Draft/sign/complete encounter criteria; reported result concerns time-gated no-show. |
| WF-067 | SOAP edit, auto-save and template criteria; reported result concerns a care plan. |
| WF-068 | Amend signed note criteria; reported result concerns signing/completing an encounter. |
| WF-076 | Care-plan criteria; reported result concerns patient messaging. |
| WF-077 | Referral-exchange criteria; reported result concerns team broadcast. |
| WF-078 | Recall creation criteria; reported result concerns document upload. |
| WF-079 | Care-gap/recall worklist criteria; reported result concerns task claiming. |
| WF-090 | Receipt output criteria; reported result concerns invoice ledger. |
| WF-097 | Membership pipeline rendering criteria; reported result concerns activation/cancellation. |
| WF-098 | Staff messaging criteria; reported result concerns subscription catalog. |
| WF-100 | Patient reminder composer criteria; reported result concerns end-of-day closeout. |
| WF-108 | Operations hub/closeout criteria; reported result concerns audit log. |
| WF-109 | Daily report date-entry criteria; reported result concerns role denial. |
| WF-110 | Large-data performance criteria; reported result concerns session expiry. |

## Integration coverage by canonical ID

| ID | Canonical criterion | Current candidates | Missing behavior / evidence |
| --- | --- | --- | --- |
| WF-001 | Demo visitor entry creates isolated tenant (#103) [ISOLATION CRITERION SUPERSEDED — see note] | None in catalog | Demo helpers are separate tools. Entry is partial; shared reset is denied; full simultaneous visitor journey remains unverified. |
| WF-002 | Reset restores baseline after visitor edits (#109) | None in catalog | Demo helpers are separate tools. Entry is partial; shared reset is denied; full simultaneous visitor journey remains unverified. |
| WF-003 | Two simultaneous visitors don't interfere | None in catalog | Demo helpers are separate tools. Entry is partial; shared reset is denied; full simultaneous visitor journey remains unverified. |
| WF-004 | Create location (site) with address/hours/rooms | `facilities`, `clinic_context` | Facility/setup reads only; setup and timezone writes are not exposed. |
| WF-005 | Finalize location setup | `facilities`, `clinic_context` | Facility/setup reads only; setup and timezone writes are not exposed. |
| WF-006 | Add rooms/departments to a site | `facilities`, `create_facility_room`, `update_facility_room` | Room writes exist; department creation and combined journey remain missing. |
| WF-007 | Edit site timezone | `facilities`, `clinic_context` | Facility/setup reads only; setup and timezone writes are not exposed. |
| WF-008 | Location chooser org-scoping (#59) | `clinic_context`, `select_clinic_site` | Backend-authorized site selection exists; exact chooser/refresh acceptance remains pending. |
| WF-009 | Chooser persistence (#56) | `clinic_context`, `select_clinic_site` | Backend-authorized site selection exists; exact chooser/refresh acceptance remains pending. |
| WF-010 | Invite employee (all roles incl. Clinician option) | `workforce_employments`, `staff_directory` | Directory records do not provision accounts, invitations, roles or activation links. |
| WF-011 | Activation link complete & activatable | `workforce_employments`, `staff_directory` | Directory records do not provision accounts, invitations, roles or activation links. |
| WF-012 | Change employee access role (#110) | `workforce_employments`, `staff_directory` | Directory records do not provision accounts, invitations, roles or activation links. |
| WF-013 | Invite + revoke works | `workforce_employments`, `staff_directory` | Directory records do not provision accounts, invitations, roles or activation links. |
| WF-014 | Add visit type | `create_visit_type` | Reviewed create exists; current browser persistence journey pending. |
| WF-015 | Disable visit type works (#52 stays fixed) | `facilities` | Visit-type deactivation is not exposed. |
| WF-016 | Add service offering + publish | `booking_service_offerings` | Offering reads only; publication is not exposed. |
| WF-017 | Add fee-schedule service | `billing_services`, `create_billing_service`, `update_billing_service` | Reviewed catalog mutations exist; complete browser save/retirement evidence pending. |
| WF-018 | Edit/retire a fee-schedule service | `billing_services`, `create_billing_service`, `update_billing_service` | Reviewed catalog mutations exist; complete browser save/retirement evidence pending. |
| WF-019 | Implementation profile save (#52 leg) | `facilities`, `clinic_context` | Facility/setup reads only; setup and timezone writes are not exposed. |
| WF-020 | Insurance-workflows switch disabled (#53) | `facilities`, `clinic_context` | Facility/setup reads only; setup and timezone writes are not exposed. |
| WF-021 | Create/manage shifts | `workforce_schedules` | Schedule reads only; shift edit/publication missing. |
| WF-022 | Request/approve leave | None in catalog | No catalog tool for this workforce lifecycle. Human decision and separate-approver gates must remain. |
| WF-023 | Calculated timecards view | `workforce_timecards`, `get_timecard` | Timecard reads exist; calculation is not exposed. |
| WF-024 | Payroll exports view renders | None in catalog | No catalog tool for this workforce lifecycle. Human decision and separate-approver gates must remain. |
| WF-025 | Team schedule tab "Could not load" (#19) | `workforce_schedules` | Schedule reads only; shift edit/publication missing. |
| WF-026 | Badge issuance silently fails (#45) | None in catalog | No catalog tool for this workforce lifecycle. Human decision and separate-approver gates must remain. |
| WF-027 | Clock-out edit blocked | None in catalog | No catalog tool for this workforce lifecycle. Human decision and separate-approver gates must remain. |
| WF-028 | Clock in/out via kiosk unreachable (#86) [CORRECTED: full punch lifecycle required] | None in catalog | No catalog tool for this workforce lifecycle. Human decision and separate-approver gates must remain. |
| WF-029 | Patient registration | `lookup_patient`, `register_patient`, `get_patient` | Reviewed registration exists; full duplicate/identity-review journey pending. |
| WF-030 | Patient directory search | `list_patients`, `lookup_patient`, `get_patient` | Patient lookup worked in local Care walkthrough; exact directory criterion not fully retested. |
| WF-031 | Merge duplicate patients | `lookup_patient` | Patient merge not exposed; lookup is not merge. |
| WF-032 | Edit registration details / patient demographics | `get_patient`, `update_patient_registration` | Generic registration update exists; clear-field/contact/guarantor criteria require field-level verification. |
| WF-033 | Emergency contact works; guarantor capture | `get_patient`, `update_patient_registration` | Generic registration update exists; clear-field/contact/guarantor criteria require field-level verification. |
| WF-034 | Intake "Record an exception" for allergies | `nurse_workspace`, `revise_nurse_intake` | Reviewed intake status revision exists; questionnaire editing and structured history reconciliation remain separate and incomplete. |
| WF-035 | Add allergy | `patient_care_summary`, `clinical_history` | Chart reads exist; structured intake/allergy/condition/medication/reconciliation writes are absent. |
| WF-036 | Add problem/condition | `patient_care_summary`, `clinical_history` | Chart reads exist; structured intake/allergy/condition/medication/reconciliation writes are absent. |
| WF-037 | Record medication history | `patient_care_summary`, `clinical_history` | Chart reads exist; structured intake/allergy/condition/medication/reconciliation writes are absent. |
| WF-038 | Allergy/medication reconciliation state (renders on patient record + encounter context) | `patient_care_summary`, `clinical_history` | Chart reads exist; structured intake/allergy/condition/medication/reconciliation writes are absent. |
| WF-039 | Book appointment | `schedule_calendar`, `booking_clinicians`, `booking_service_offerings`, `booking_resource_availability`, `book_appointment` | Visual booking exists; successful v0.2 local booking is historical evidence only. |
| WF-040 | Reschedule within capacity | `get_appointment`, `reschedule_appointment` | Reviewed local reschedule/read-back/restoration passed in v0.3 event check; full calendar interaction pending. |
| WF-041 | Cancel with acknowledgment RE-VERIFIED 2026-09-28 ~10:37 CDT on 0.1.4 (batch 3 retest, GH #9): cancelled Sep 29 11:00 AM Avery Example appointment (ack checked); confirmed "appointment was cancelled. No cancellation message was sent."; slot offers "Schedule a replacement appointment." RE-VERIFIED 2026-09-28 ~12:28 CDT on 0.1.5 (batch 4 retest, GH #12): "Cancel appointment" VISIBLE AND ENABLED in the appointment detail dialog for the Scheduled Oct 13 11:00 AM–11:30 AM appointment (Close / Manage appointment / Check in patient alongside); visible but correctly disabled for Completed/Cancelled appointments per the release note's eligibility rule. Inspect only | `get_appointment`, `transition_appointment`, `tracking_board` | Generic reviewed transitions exist; exact action policy, acknowledgment and state-specific browser journey pending. |
| WF-042 | Save-as-draft recovers draft RE-VERIFIED 2026-09-28 ~10:37 CDT on 0.1.4 (batch 3 retest, GH #13): dialog shows "Recovered appointment draft from an earlier session: review its patient, time, and scheduling detail" with "Start new appointment" button | `book_appointment` | Booking editor exists; recovery across sessions is not established. |
| WF-043 | Schedule outside capacity silently no-ops (#32) | `schedule_calendar`, `site_scheduling_policy`, `booking_resource_availability` | Policy/calendar reads are related context only; this precise advanced workflow is not completed. Do not infer recurrence, override, waitlist, month/export or block writes. |
| WF-044 | Clinician-missing-assignment warning → assign button works (0.1.2): "Assign QA Test Clinician to SIMT for this slot" → "QA Test Clinician is assigned to SIMT for this slot. Retry booking." → saved. (Was #15/#76; verified 2026-09-28.) BUG-HUNT 2026-09-28 ~20:22 CDT on 0.1.8 @ 25a23e4 (main-chat): BLOCKED | `schedule_calendar`, `site_scheduling_policy`, `booking_resource_availability` | Policy/calendar reads are related context only; this precise advanced workflow is not completed. Do not infer recurrence, override, waitlist, month/export or block writes. |
| WF-045 | Recurring series | `schedule_calendar`, `site_scheduling_policy`, `booking_resource_availability` | Policy/calendar reads are related context only; this precise advanced workflow is not completed. Do not infer recurrence, override, waitlist, month/export or block writes. |
| WF-046 | Walk-in booking | `schedule_calendar`, `site_scheduling_policy`, `booking_resource_availability` | Policy/calendar reads are related context only; this precise advanced workflow is not completed. Do not infer recurrence, override, waitlist, month/export or block writes. |
| WF-047 | (FAIL) Late arrival handling | `schedule_calendar`, `site_scheduling_policy`, `booking_resource_availability` | Policy/calendar reads are related context only; this precise advanced workflow is not completed. Do not infer recurrence, override, waitlist, month/export or block writes. |
| WF-048 | No-show marking | `get_appointment`, `transition_appointment`, `tracking_board` | Generic reviewed transitions exist; exact action policy, acknowledgment and state-specific browser journey pending. |
| WF-049 | Waitlist add | `schedule_calendar`, `site_scheduling_policy`, `booking_resource_availability` | Policy/calendar reads are related context only; this precise advanced workflow is not completed. Do not infer recurrence, override, waitlist, month/export or block writes. |
| WF-050 | Overbook exception flow | `schedule_calendar`, `site_scheduling_policy`, `booking_resource_availability` | Policy/calendar reads are related context only; this precise advanced workflow is not completed. Do not infer recurrence, override, waitlist, month/export or block writes. |
| WF-051 | Calendar month view + export | `schedule_calendar`, `site_scheduling_policy`, `booking_resource_availability` | Policy/calendar reads are related context only; this precise advanced workflow is not completed. Do not infer recurrence, override, waitlist, month/export or block writes. |
| WF-052 | Block schedule (#99) | `schedule_calendar`, `site_scheduling_policy`, `booking_resource_availability` | Policy/calendar reads are related context only; this precise advanced workflow is not completed. Do not infer recurrence, override, waitlist, month/export or block writes. |
| WF-053 | Check-in → board | `get_appointment`, `transition_appointment`, `tracking_board` | Generic reviewed transitions exist; exact action policy, acknowledgment and state-specific browser journey pending. |
| WF-054 | Checked-in visit cancellation | `get_appointment`, `transition_appointment`, `tracking_board` | Generic reviewed transitions exist; exact action policy, acknowledgment and state-specific browser journey pending. |
| WF-055 | Rooming + intake claim | `assign_encounter_room`, `get_encounter`, `nurse_workspace`, `revise_nurse_intake` | Room assignment and versioned intake status exist; full claim and evidence-completion journey remains unverified. |
| WF-056 | Encounter handoff | `nurse_workspace`, `request_intake_handoff`, `transition_intake_handoff` | Reviewed request and role-separated transitions exposed with backend versions; complete multi-person journey remains unverified. |
| WF-057 | Checkout on same visit | `encounter_completion`, `complete_encounter`, `patient_invoices`, `billing_services`, `draft_invoice` | Care offers completion evidence and one-line draft checkout; posting/payment/receipt journey missing. |
| WF-058 | Full encounter: draft → sign → complete | `create_soap_draft`, `revise_soap_draft`, `encounter_completion`, `complete_encounter` | Unsigned draft verified locally; signing stays human-only and is not exposed. Full lifecycle not verified. |
| WF-059 | Vitals entry (observed-time default wrong → MUSE_QA-001) | `vital_sign_dictionary`, `record_vital_signs`, `patient_observations` | Real local service write and panel/website read-back passed; native date input submission/default criterion pending. |
| WF-060 | HPI fields (spacing fixed) | `patient_care_summary`, `clinical_history` | Related chart reads only; this structured clinical write is not exposed. |
| WF-061 | Interactive ROS (13 systems, cycles positive/negative/not reviewed) | `patient_care_summary`, `clinical_history` | Related chart reads only; this structured clinical write is not exposed. |
| WF-062 | Add diagnosis disabled | `patient_care_summary`, `clinical_history` | Related chart reads only; this structured clinical write is not exposed. |
| WF-063 | Add procedure disabled | `patient_care_summary`, `clinical_history` | Related chart reads only; this structured clinical write is not exposed. |
| WF-064 | Add immunization disabled | `patient_care_summary`, `clinical_history` | Related chart reads only; this structured clinical write is not exposed. |
| WF-065 | Add assessment disabled (#62) | `patient_care_summary`, `clinical_history` | Related chart reads only; this structured clinical write is not exposed. |
| WF-066 | Add care goal | `patient_care_summary`, `clinical_history` | Related chart reads only; this structured clinical write is not exposed. |
| WF-067 | SOAP note edit + auto-save (explicit Save draft disabled | `note_templates`, `get_encounter_note`, `create_soap_draft`, `revise_soap_draft` | Reviewed unsigned SOAP save/read-back passed locally. Explicit review intentionally differs from website auto-save; template and revision lifecycle acceptance pending. |
| WF-068 | Reopen/amend signed note | `get_encounter_note` | Signed notes are read only; separate correction workflow is not exposed. |
| WF-069 | Encounter follow-up task | `encounter_follow_up`, `record_encounter_follow_up`, `follow_up_worklist` | Follow-up disposition exists; task creation is a distinct backend workflow and remains missing. |
| WF-070 | Add medication request disabled (#47) | `patient_care_summary`, `clinical_history`, `follow_up_worklist` | Related read context only; precise medication/order/plan/referral/recall lifecycle missing. Human approval is not an agent operation. |
| WF-071 | Link fulfillment disabled (#47) | `patient_care_summary`, `clinical_history`, `follow_up_worklist` | Related read context only; precise medication/order/plan/referral/recall lifecycle missing. Human approval is not an agent operation. |
| WF-072 | Refill requests: queue/review work, but approve/decline disabled | `patient_care_summary`, `clinical_history`, `follow_up_worklist` | Related read context only; precise medication/order/plan/referral/recall lifecycle missing. Human approval is not an agent operation. |
| WF-073 | Add service request disabled (#48) | `patient_care_summary`, `clinical_history`, `follow_up_worklist` | Related read context only; precise medication/order/plan/referral/recall lifecycle missing. Human approval is not an agent operation. |
| WF-074 | Lab result follow-up chain unreachable (#48) | `patient_lab_reports`, `lab_review_queue` | Lab reads exist; lab review/follow-up chain writes missing. |
| WF-075 | Lab inbox renders (0 items) | `lab_review_queue` | Read mapped; role-aware populated/empty browser check pending. |
| WF-076 | Add care plan disabled (#48) | `patient_care_summary`, `clinical_history`, `follow_up_worklist` | Related read context only; precise medication/order/plan/referral/recall lifecycle missing. Human approval is not an agent operation. |
| WF-077 | Record referral exchange disabled (#48) | `patient_care_summary`, `clinical_history`, `follow_up_worklist` | Related read context only; precise medication/order/plan/referral/recall lifecycle missing. Human approval is not an agent operation. |
| WF-078 | Recalls have no creation path (defects #23, #50) | `patient_care_summary`, `clinical_history`, `follow_up_worklist` | Related read context only; precise medication/order/plan/referral/recall lifecycle missing. Human approval is not an agent operation. |
| WF-079 | Care-gap list (patient record "no open care gaps" + /clinic/recalls worklist renders) | `patient_care_summary`, `clinical_history`, `follow_up_worklist` | Related read context only; precise medication/order/plan/referral/recall lifecycle missing. Human approval is not an agent operation. |
| WF-080 | Inventory setup | `inventory_locations`, `inventory_catalog` | Read context only; location/bin setup missing. |
| WF-081 | Receiving: receipt blocked | `purchase_orders`, `get_purchase_order`, `inventory_receiving` | Receiving reads exist; posting receipt missing. |
| WF-082 | Count sessions: still no bin-setup path | `inventory_count_sessions`, `create_inventory_count`, `record_inventory_count` | Count creation/observation exist; bin setup, reconciliation and completion missing. |
| WF-083 | Stock detail/ledger view renders (0 movements) | `inventory_positions`, `inventory_activity` | Read mapped; exact movement/history browser evidence pending. |
| WF-084 | Inventory exceptions/recalls tabs render | `inventory_exceptions`, `inventory_recalls` | Read mapped; current populated/empty evidence pending. |
| WF-085 | Cash payment | `get_invoice`, `patient_billing_ledger`, `report_daily_payments` | Related reads only; payment/adjustment/refund/statement/receipt/drawer writes are not exposed. |
| WF-086 | Billing credit/adjustment | `get_invoice`, `patient_billing_ledger`, `report_daily_payments` | Related reads only; payment/adjustment/refund/statement/receipt/drawer writes are not exposed. |
| WF-087 | Card payment gate (Stripe unconnected) | `get_invoice`, `patient_billing_ledger`, `report_daily_payments` | Related reads only; payment/adjustment/refund/statement/receipt/drawer writes are not exposed. |
| WF-088 | Refund path | `get_invoice`, `patient_billing_ledger`, `report_daily_payments` | Related reads only; payment/adjustment/refund/statement/receipt/drawer writes are not exposed. |
| WF-089 | No patient-statement generation (#54) | `get_invoice`, `patient_billing_ledger`, `report_daily_payments` | Related reads only; payment/adjustment/refund/statement/receipt/drawer writes are not exposed. |
| WF-090 | "Print a receipt" silently does nothing (#54) | `get_invoice`, `patient_billing_ledger`, `report_daily_payments` | Related reads only; payment/adjustment/refund/statement/receipt/drawer writes are not exposed. |
| WF-091 | Invoice ledger view + filters | `billing_dashboard`, `patient_billing_ledger`, `patient_invoices` | Ledger reads exist; exact requested search/filter/sort parity pending. |
| WF-092 | Checkout guided view (payment steps blocked) | `encounter_completion`, `complete_encounter`, `patient_invoices`, `billing_services`, `draft_invoice` | Care offers completion evidence and one-line draft checkout; posting/payment/receipt journey missing. |
| WF-093 | Write-off / bad-debt flow | `get_invoice`, `patient_billing_ledger`, `report_daily_payments` | Related reads only; payment/adjustment/refund/statement/receipt/drawer writes are not exposed. |
| WF-094 | Cash drawer count/close/open | `get_invoice`, `patient_billing_ledger`, `report_daily_payments` | Related reads only; payment/adjustment/refund/statement/receipt/drawer writes are not exposed. |
| WF-095 | tested | `subscriptions`, `subscription_catalog` | Staff subscription reads do not implement public entry, publication or membership lifecycle. |
| WF-096 | tested | `subscriptions`, `subscription_catalog` | Staff subscription reads do not implement public entry, publication or membership lifecycle. |
| WF-097 | Membership pipeline (Growth page) renders | `subscriptions`, `subscription_catalog` | Staff subscription reads do not implement public entry, publication or membership lifecycle. |
| WF-098 | Staff messaging: participant list populates (#44 FIXED on symptoms 0.1.8); new #112 (create permission denial) | `staff_message_participants`, `staff_conversations`, `create_staff_conversation`, `send_staff_message`, `get_staff_conversation` | Internal messaging tools exist; send/delivery and participation browser checks pending. |
| WF-099 | Reminder configuration UI (Clinic reminder settings) | `get_appointment` | Reminder policy/composer/send are absent. Existing-record Events are not timed reminders or patient delivery. |
| WF-100 | No patient-facing message composer; reminders sending dead-end (#70 re-confirmed 0.1.8) | `get_appointment` | Reminder policy/composer/send are absent. Existing-record Events are not timed reminders or patient delivery. |
| WF-101 | Appointment reminder send blocked | `get_appointment` | Reminder policy/composer/send are absent. Existing-record Events are not timed reminders or patient delivery. |
| WF-102 | Scribe session can't start (template list empty) (#46) | `note_templates` | Templates are related context; Scribe start/capture/review not exposed. |
| WF-103 | Telehealth needs operator Twilio creds (#39 | `telehealth_booking_options`, `telehealth_visits`, `get_telehealth_visit`, `telehealth_settings` | Readiness and queue reads only; booking/join lifecycle not established. |
| WF-104 | Add eligibility rule draft-save FAILED on 0.2.3 (new #235: "Save draft" confirms but draft lost on reload; overlay #39 persists) | `telehealth_settings` | Settings reads only; eligibility draft-save not exposed. |
| WF-105 | Stripe connect flow (needs owner action | None in catalog | No provider credentials or owner connection tools. External activation requires separate authorization. |
| WF-106 | Twilio connect (operator-managed | None in catalog | No provider credentials or owner connection tools. External activation requires separate authorization. |
| WF-107 | Transmission simulator/connectors area absent on 0.2.4 (new #236: read-only readout missing everywhere; no documented removal in 0.2.4 update log; possible intentional removal | None in catalog | No provider credentials or owner connection tools. External activation requires separate authorization. |
| WF-108 | Operations overview hub renders | `billing_dashboard`, `report_daily_visits`, `report_daily_invoices`, `report_open_clinical_work` | Related reports exist; consolidated closeout hub is missing. |
| WF-109 | Daily source reports date can't commit (#51; retested 2026-09-30 ~18:45 CDT on exact 0.2.4 @ dad4e133 | `report_daily_visits`, `report_daily_invoices`, `report_stock_movements`, `report_daily_payments` | Date-filtered tools exist; UI entry modes and returned report rows pending. |
| WF-110 | Schedule/billing/stock query performance on large data (schedule, billing overview, stock list all load quickly, no hangs; 2026-09-28; re-verified 2026-09-30 ~18:54 CDT on exact 0.2.4 @ 0cad7038 | `schedule_calendar`, `billing_dashboard`, `inventory_positions` | Read mappings do not prove large-data performance; no timings claimed. |
| WF-111 | Config snapshot: refresh/download work; "Compare saved JSON" opens hidden file input (native picker; file leg not drivable | None in catalog | Configuration snapshot download/compare and file viewer not exposed. |
| WF-112 | Guided demo reset (owner action | None in catalog | Demo helpers are separate tools. Entry is partial; shared reset is denied; full simultaneous visitor journey remains unverified. |
| WF-113 | Invite silently dropped under sync race (#58) | `workforce_employments`, `staff_directory` | Directory records do not provision accounts, invitations, roles or activation links. |
| WF-114 | Session expiry handling | `clinic_context` | OAuth expiry/revocation and broker invalidation checks passed; exact website idle banner/lock/draft criteria remain separate. |
| WF-115 | Patient activity feed records synthetic actions (practice-level audit trail missing | None in catalog | Backend audit mechanisms are reused by clinic endpoints; bounded remote connector call auditing is implemented; full practice audit UI and cross-host coverage remain incomplete. |
| WF-116 | Owner workspace /owner 502 Bad Gateway (#69) | None in catalog | Owner infrastructure controls deliberately remain outside customer-facing tools. |

## Host surfaces and remaining architecture

| Surface | Source / selected evidence | Remaining |
| --- | --- | --- |
| Sidebar and panels | Portable declarations and MCP App; local browser captures | Actual ChatGPT/native host rendering and deep-link acceptance |
| File viewers | No viewer declared | Select supported existing file journey, validate type/content/access; no invented viewer protocol |
| MCP Events | Existing-record metadata feed, persistent subscriptions; local appointment update/ack verified | Host callback verification, delivery/retry/expiry, lab/task lifecycle, reminder-due acceptance and new-record discovery |
| Sites | Explicitly out of scope | No Site hosting or separate clinic database |
| Identity | Per-connection Meta Clinic sessions, OAuth PKCE/scopes, encrypted connector store | Actual hosted account acceptance, registered ChatGPT connection |
| Agent audit / metering | Encrypted remote call provenance and bounded clinic call counters; no model calls in this plugin | Focused failure/limit acceptance and operational retention/export requirements; host token usage is not available |
| Submission | Checklist and listing source | Final target, HTTPS deployment, registered clients, policy URLs and review; no submission authorized |

## Next executable sequence

1. Primary host is ChatGPT, confirmed by the owner October 4. Meta Clinic credentials authorize clinic access; ChatGPT host access and eligible contractual coverage remain separate. In-app assistant is phase 2.
2. Preserve the current v0.3 implementation, local evidence and tutorial as a reviewable checkpoint.
3. Verify actor-attributed remote call auditing and configured clinic limits; do not fabricate token usage for ChatGPT-hosted inference.
4. Complete intake/arrival/handoff and follow-up/checkout slices against backend contracts, preserving human signing and approval gates.
5. Complete ordinary and demo browser journeys, then supported host/event acceptance. Keep blocked provider and shared reset cases blocked.
