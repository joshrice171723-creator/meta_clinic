// Import the owner's two appendices without treating reported website verdicts
// as proof of integration coverage. No network calls or clinic writes occur.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OPERATIONS } from '../server/catalog.mjs';

const source = process.argv[2];
if (!source) throw new Error('Pass the owner-supplied workflow prompt file path.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const input = (await readFile(source, 'utf8')).replace(/\r\n/g, '\n');
const appendixA = input.split('# APPENDIX A')[1]?.split('# APPENDIX B')[0];
const appendixB = input.split('# APPENDIX B')[1];
if (!appendixA || !appendixB) throw new Error('Both appendices are required.');
const claims = new Map([...appendixA.matchAll(/^- (WF-\d{3}) (PASS|FAIL|BLOCKED) (.+)$/gm)].map(m => [m[1], { verdict: m[2], observation: m[3] }]));
const canonical = [...appendixB.matchAll(/^### (WF-\d{3}) — (.+)\n([\s\S]*?)(?=^### WF-|$(?![\s\S]))/gm)];
if (claims.size !== 116 || canonical.length !== 116 || new Set(canonical.map(m => m[1])).size !== 116)
  throw new Error('Expected exactly 116 unique claims and criteria.');

// These are semantic conflicts between the supplied appendices, not a retest.
const conflicts = {
  24: 'Payroll exports criteria; reported result concerns direct timesheet entry.',
  45: 'Recurring series criteria; reported result concerns reminder policy.',
  46: 'Walk-in criteria; reported result concerns waitlist addition.',
  47: 'Late-arrival criteria; reported result concerns recurrence policy.',
  48: 'No-show criteria; reported result concerns overbooking policy.',
  58: 'Draft/sign/complete encounter criteria; reported result concerns time-gated no-show.',
  67: 'SOAP edit, auto-save and template criteria; reported result concerns a care plan.',
  68: 'Amend signed note criteria; reported result concerns signing/completing an encounter.',
  76: 'Care-plan criteria; reported result concerns patient messaging.',
  77: 'Referral-exchange criteria; reported result concerns team broadcast.',
  78: 'Recall creation criteria; reported result concerns document upload.',
  79: 'Care-gap/recall worklist criteria; reported result concerns task claiming.',
  90: 'Receipt output criteria; reported result concerns invoice ledger.',
  97: 'Membership pipeline rendering criteria; reported result concerns activation/cancellation.',
  98: 'Staff messaging criteria; reported result concerns subscription catalog.',
  100: 'Patient reminder composer criteria; reported result concerns end-of-day closeout.',
  108: 'Operations hub/closeout criteria; reported result concerns audit log.',
  109: 'Daily report date-entry criteria; reported result concerns role denial.',
  110: 'Large-data performance criteria; reported result concerns session expiry.',
};
const qualifications = {
  1: 'Shared lessons supersede tenant-isolation criterion; visitor interference remains separate.',
  2: 'Owner prohibition: inspect controls only; never reset shared records.',
  27: 'Self-denial alone does not demonstrate approval by a different authorized person.',
  41: 'Report says no acknowledgment checkbox; criteria require acknowledgment.',
  44: 'Report ends at workforce-activation gate; successful retry not established.',
  87: 'Simulator acceptance is not live collection; retain exact simulated provenance.',
  101: 'Queued attempt is not confirmed external delivery.',
  103: 'Readiness gates do not establish a booked video visit required by criteria.',
  105: 'Three distinct legs: owner connection, ordinary collection, membership collection. Do not collapse them into one PASS.',
  112: 'Owner prohibition: inspect controls only; never reset shared records.',
  113: 'An immediately visible invitation does not by itself prove the requested sync-race case.',
  114: 'Observed expiry copy does not demonstrate full retry/lock sequence and draft preservation.',
  115: 'Patient activity evidence alone does not establish the separate practice audit criterion.',
  116: 'A login gate with no 502 does not establish the authenticated owner dashboard rendering.',
};

// Explicit candidates in the current catalog. Empty means no exposed contract
// found, not that the underlying website lacks a backend implementation.
const mapping = {};
const set = (ids, operations, gap) => { for (const n of ids) mapping[n] = { operations: operations.split(' ').filter(Boolean), gap }; };
set([1,2,3,112], '', 'Demo helpers are separate tools. Entry is partial; shared reset is denied; full simultaneous visitor journey remains unverified.');
set([4,5,7,19,20], 'facilities clinic_context', 'Facility/setup reads only; setup and timezone writes are not exposed.');
set([6], 'facilities create_facility_room update_facility_room', 'Room writes exist; department creation and combined journey remain missing.');
set([8,9], 'clinic_context select_clinic_site', 'Backend-authorized site selection exists; exact chooser/refresh acceptance remains pending.');
set([10,11,12,13,113], 'workforce_employments staff_directory', 'Directory records do not provision accounts, invitations, roles or activation links.');
set([14], 'create_visit_type', 'Reviewed create exists; current browser persistence journey pending.');
set([15], 'facilities', 'Visit-type deactivation is not exposed.');
set([16], 'booking_service_offerings', 'Offering reads only; publication is not exposed.');
set([17,18], 'billing_services create_billing_service update_billing_service', 'Reviewed catalog mutations exist; complete browser save/retirement evidence pending.');
set([21,25], 'workforce_schedules', 'Schedule reads only; shift edit/publication missing.');
set([22,24,26,27,28], '', 'No catalog tool for this workforce lifecycle. Human decision and separate-approver gates must remain.');
set([23], 'workforce_timecards get_timecard', 'Timecard reads exist; calculation is not exposed.');
set([29], 'lookup_patient register_patient get_patient', 'Reviewed registration exists; full duplicate/identity-review journey pending.');
set([30], 'list_patients lookup_patient get_patient', 'Patient lookup worked in local Care walkthrough; exact directory criterion not fully retested.');
set([31], 'lookup_patient', 'Patient merge not exposed; lookup is not merge.');
set([32,33], 'get_patient update_patient_registration', 'Generic registration update exists; clear-field/contact/guarantor criteria require field-level verification.');
set([35,36,37,38], 'patient_care_summary clinical_history', 'Chart reads exist; structured intake/allergy/condition/medication/reconciliation writes are absent.');
set([39], 'schedule_calendar booking_clinicians booking_service_offerings booking_resource_availability book_appointment', 'Visual booking exists; successful v0.2 local booking is historical evidence only.');
set([40], 'get_appointment reschedule_appointment', 'Reviewed local reschedule/read-back/restoration passed in v0.3 event check; full calendar interaction pending.');
set([41,48,53,54], 'get_appointment transition_appointment tracking_board', 'Generic reviewed transitions exist; exact action policy, acknowledgment and state-specific browser journey pending.');
set([42], 'book_appointment', 'Booking editor exists; recovery across sessions is not established.');
set([43,44,45,46,47,49,50,51,52], 'schedule_calendar site_scheduling_policy booking_resource_availability', 'Policy/calendar reads are related context only; this precise advanced workflow is not completed. Do not infer recurrence, override, waitlist, month/export or block writes.');
set([34], 'nurse_workspace revise_nurse_intake', 'Reviewed intake status revision exists; questionnaire editing and structured history reconciliation remain separate and incomplete.');
set([55], 'assign_encounter_room get_encounter nurse_workspace revise_nurse_intake', 'Room assignment and versioned intake status exist; full claim and evidence-completion journey remains unverified.');
set([56], 'nurse_workspace request_intake_handoff transition_intake_handoff', 'Reviewed request and role-separated transitions exposed with backend versions; complete multi-person journey remains unverified.');
set([57,92], 'encounter_completion complete_encounter patient_invoices billing_services draft_invoice', 'Care offers completion evidence and one-line draft checkout; posting/payment/receipt journey missing.');
set([58], 'create_soap_draft revise_soap_draft encounter_completion complete_encounter', 'Unsigned draft verified locally; signing stays human-only and is not exposed. Full lifecycle not verified.');
set([59], 'vital_sign_dictionary record_vital_signs patient_observations', 'Real local service write and panel/website read-back passed; native date input submission/default criterion pending.');
set([60,61,62,63,64,65,66], 'patient_care_summary clinical_history', 'Related chart reads only; this structured clinical write is not exposed.');
set([67], 'note_templates get_encounter_note create_soap_draft revise_soap_draft', 'Reviewed unsigned SOAP save/read-back passed locally. Explicit review intentionally differs from website auto-save; template and revision lifecycle acceptance pending.');
set([68], 'get_encounter_note', 'Signed notes are read only; separate correction workflow is not exposed.');
set([69], 'encounter_follow_up record_encounter_follow_up follow_up_worklist', 'Follow-up disposition exists; task creation is a distinct backend workflow and remains missing.');
set([70,71,72,73,76,77,78,79], 'patient_care_summary clinical_history follow_up_worklist', 'Related read context only; precise medication/order/plan/referral/recall lifecycle missing. Human approval is not an agent operation.');
set([74], 'patient_lab_reports lab_review_queue', 'Lab reads exist; lab review/follow-up chain writes missing.');
set([75], 'lab_review_queue', 'Read mapped; role-aware populated/empty browser check pending.');
set([80], 'inventory_locations inventory_catalog', 'Read context only; location/bin setup missing.');
set([81], 'purchase_orders get_purchase_order inventory_receiving', 'Receiving reads exist; posting receipt missing.');
set([82], 'inventory_count_sessions create_inventory_count record_inventory_count', 'Count creation/observation exist; bin setup, reconciliation and completion missing.');
set([83], 'inventory_positions inventory_activity', 'Read mapped; exact movement/history browser evidence pending.');
set([84], 'inventory_exceptions inventory_recalls', 'Read mapped; current populated/empty evidence pending.');
set([85,86,87,88,89,90,93,94], 'get_invoice patient_billing_ledger report_daily_payments', 'Related reads only; payment/adjustment/refund/statement/receipt/drawer writes are not exposed.');
set([91], 'billing_dashboard patient_billing_ledger patient_invoices', 'Ledger reads exist; exact requested search/filter/sort parity pending.');
set([95,96,97], 'subscriptions subscription_catalog', 'Staff subscription reads do not implement public entry, publication or membership lifecycle.');
set([98], 'staff_message_participants staff_conversations create_staff_conversation send_staff_message get_staff_conversation', 'Internal messaging tools exist; send/delivery and participation browser checks pending.');
set([99,100,101], 'get_appointment', 'Reminder policy/composer/send are absent. Existing-record Events are not timed reminders or patient delivery.');
set([102], 'note_templates', 'Templates are related context; Scribe start/capture/review not exposed.');
set([103], 'telehealth_booking_options telehealth_visits get_telehealth_visit telehealth_settings', 'Readiness and queue reads only; booking/join lifecycle not established.');
set([104], 'telehealth_settings', 'Settings reads only; eligibility draft-save not exposed.');
set([105,106,107], '', 'No provider credentials or owner connection tools. External activation requires separate authorization.');
set([108], 'billing_dashboard report_daily_visits report_daily_invoices report_open_clinical_work', 'Related reports exist; consolidated closeout hub is missing.');
set([109], 'report_daily_visits report_daily_invoices report_stock_movements report_daily_payments', 'Date-filtered tools exist; UI entry modes and returned report rows pending.');
set([110], 'schedule_calendar billing_dashboard inventory_positions', 'Read mappings do not prove large-data performance; no timings claimed.');
set([111], '', 'Configuration snapshot download/compare and file viewer not exposed.');
set([114], 'clinic_context', 'OAuth expiry/revocation and broker invalidation checks passed; exact website idle banner/lock/draft criteria remain separate.');
set([115], '', 'Backend audit mechanisms are reused by clinic endpoints; bounded remote connector call auditing is implemented; full practice audit UI and cross-host coverage remain incomplete.');
set([116], '', 'Owner infrastructure controls deliberately remain outside customer-facing tools.');

const domains = [
  [9,'Entry and sites','Clinic administrator or demo visitor','Demo / connection / facilities'],
  [20,'Access and catalogs','Access administrator or catalog manager','Staff / facilities / billing'],
  [28,'Workforce','Employee or workforce manager; distinct correction approver','Staff'],
  [33,'Patient identity','Permitted registration staff','Patients / Care'],
  [38,'Intake and history','Permitted intake or clinical staff','Patient chart / encounter'],
  [52,'Scheduling','Permitted front desk or scheduler','Schedule'],
  [58,'Visit flow','Front desk, intake, clinician, checkout staff as authorized','Schedule / Care'],
  [79,'Clinical records','Clinician or clinical coordinator with resource-specific grants','Care / Chart / Tasks'],
  [84,'Inventory','Inventory operator or reviewer','Inventory'],
  [94,'Billing','Billing operator or distinct authorized reviewer','Billing / Care checkout'],
  [97,'Memberships','Authorized growth staff or patient','Billing / public entry'],
  [101,'Communications','Permitted staff conversation participant or reminder operator','Messages / Schedule'],
  [104,'Scribe and telehealth','Authorized clinician or telehealth administrator','Chart / Telehealth'],
  [107,'Providers','Owner/operator only','Existing website owner settings'],
  [111,'Operations','Permitted operations/report reader','Reports'],
  [116,'Recovery and ownership','Applicable session owner, administrator or owner','Context / Demo / existing website'],
];
const byId = new Map(OPERATIONS.map(op => [op.id,op]));
const rows = canonical.map(m => {
  const n = Number(m[1].slice(3));
  if (!mapping[n] || !claims.has(m[1])) throw new Error(`Missing mapping for ${m[1]}`);
  const [,domain,role,entry] = domains.find(([end]) => n <= end);
  const criteria = m[3].split('- **Acceptance:**')[1]?.split(/\n- \*\*Historical note/)[0]?.trim();
  if (!criteria) throw new Error(`Missing criteria for ${m[1]}`);
  const operations = mapping[n].operations.map(id => {
    const op = byId.get(id); if (!op) throw new Error(`Unknown operation ${id}`);
    return { id, method:op.method, path:op.path, kind:op.method === 'GET' ? 'read' : 'reviewed_write', required:op.inputSchema.required || [] };
  });
  return {
    id:m[1], title:m[2], domain, intended_role:role, entry_point:entry,
    acceptance_markdown:criteria,
    reported_website:claims.get(m[1]),
    reconciliation:conflicts[n] ? 'ID_SUBJECT_CONFLICT' : qualifications[n] ? 'QUALIFIED_OR_INCOMPLETE_EVIDENCE' : 'UNVERIFIED_REPORTED_RESULT',
    reconciliation_note:conflicts[n] || qualifications[n] || 'Reported website result retained; not independently reverified and not integration acceptance.',
    candidate_operations:operations,
    integration_status:operations.length ? 'PARTIAL_OR_RELATED_SOURCE' : 'NO_CATALOG_CONTRACT',
    gap:mapping[n].gap,
    permission_boundary:'Backend session user, current membership, clinic, location, resource ownership and action grants; OAuth consent only narrows these. Intended role is not a permission grant.',
    prerequisites:'Authenticated authorized account and backend-returned identifiers; exact required operation fields listed above. Demo requires its own scoped visitor session. Human approval and policy gates remain in the owning workflow.',
    states_to_verify:['success with persisted read-back','honest empty result','permission denial','stale revision or policy conflict','interrupted save and explicit recovery without automatic replay'],
    evidence:'VERIFICATION.md for selected v0.3 local checks; DELIVERY.md for dated v0.2 evidence. No full WF acceptance imported from Appendix A.',
  };
});
const payload = {
  source_filename:'codex-plugin-prompt-with-workflows (1).md',
  source_sha256:createHash('sha256').update(input).digest('hex'),
  digest_normalization:'UTF-8 text with CRLF normalized to LF',
  date:'2026-10-04',
  source_status:'User-supplied website observations; not independently verified',
  claimed_website_build:'0.2.9 @ 228ae291351602802ee9d0507d82f3b239fe1ed5; original report also names 60ed12ded8a4320b992774c693b91dad586ce7ad before build changed',
  reported_totals:Object.fromEntries(['PASS','FAIL','BLOCKED'].map(v => [v,rows.filter(r => r.reported_website.verdict === v).length])),
  conflicts:rows.filter(r => r.reconciliation === 'ID_SUBJECT_CONFLICT').length,
  complete_integration_workflows_claimed:0,
  workflows:rows,
};
const escape = value => String(value).replace(/\|/g,'\\|').replace(/\n/g,' ');
const md = [
  '# Canonical 116-workflow reconciliation', '',
  'Imported October 4, 2026 from the owner-supplied prompt. Appendix B supplies the criteria; Appendix A remains a separate reported website observation. Neither supplies current plugin acceptance.', '',
  `The 116 reported verdicts total 95 PASS, 8 FAIL and 13 BLOCKED. **${payload.conflicts} IDs describe different subjects in the two appendices.** Other rows have incomplete or qualified evidence. No reported PASS is copied into integration acceptance.`, '',
  'The full criteria, intended roles, entry points, candidate read/write contracts, required fields, boundary rules, recovery cases and evidence limits are in [workflow-116.json](workflow-116.json). Candidate operations can be related reads only; they do not prove that a workflow is implemented. Exact website permissions and state machines still require source mapping before extending any missing write.', '',
  '## Conflicting IDs', '',
  '| ID | Criteria versus reported observation |', '| --- | --- |',
  ...rows.filter(r => r.reconciliation === 'ID_SUBJECT_CONFLICT').map(r => `| ${r.id} | ${escape(r.reconciliation_note)} |`), '',
  '## Integration coverage by canonical ID', '',
  '| ID | Canonical criterion | Current candidates | Missing behavior / evidence |', '| --- | --- | --- | --- |',
  ...rows.map(r => `| ${r.id} | ${escape(r.title)} | ${r.candidate_operations.map(o => `\`${o.id}\``).join(', ') || 'None in catalog'} | ${escape(r.gap)} |`), '',
  '## Host surfaces and remaining architecture', '',
  '| Surface | Source / selected evidence | Remaining |', '| --- | --- | --- |',
  '| Sidebar and panels | Portable declarations and MCP App; local browser captures | Actual ChatGPT/native host rendering and deep-link acceptance |',
  '| File viewers | No viewer declared | Select supported existing file journey, validate type/content/access; no invented viewer protocol |',
  '| MCP Events | Existing-record metadata feed, persistent subscriptions; local appointment update/ack verified | Host callback verification, delivery/retry/expiry, lab/task lifecycle, reminder-due acceptance and new-record discovery |',
  '| Sites | Explicitly out of scope | No Site hosting or separate clinic database |',
  '| Identity | Per-connection Meta Clinic sessions, OAuth PKCE/scopes, encrypted connector store | Actual hosted account acceptance, registered ChatGPT connection |',
  '| Agent audit / metering | Encrypted remote call provenance and bounded clinic call counters; no model calls in this plugin | Focused failure/limit acceptance and operational retention/export requirements; host token usage is not available |',
  '| Submission | Checklist and listing source | Final target, HTTPS deployment, registered clients, policy URLs and review; no submission authorized |', '',
  '## Next executable sequence', '',
  '1. Primary host is ChatGPT, confirmed by the owner October 4. Meta Clinic credentials authorize clinic access; ChatGPT host access and eligible contractual coverage remain separate. In-app assistant is phase 2.',
  '2. Preserve the current v0.3 implementation, local evidence and tutorial as a reviewable checkpoint.',
  '3. Verify actor-attributed remote call auditing and configured clinic limits; do not fabricate token usage for ChatGPT-hosted inference.',
  '4. Complete intake/arrival/handoff and follow-up/checkout slices against backend contracts, preserving human signing and approval gates.',
  '5. Complete ordinary and demo browser journeys, then supported host/event acceptance. Keep blocked provider and shared reset cases blocked.', '',
].join('\n');
await writeFile(resolve(root,'workflow-116.json'), JSON.stringify(payload,null,2)+'\n');
await writeFile(resolve(root,'WORKFLOW-116.md'), md);
console.log(JSON.stringify({workflows:rows.length,reported_totals:payload.reported_totals,subject_conflicts:payload.conflicts,complete_integration_workflows_claimed:0}));
