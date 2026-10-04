// Curated existing Rails API contracts. Each operation names its executable source.
// No backend authority, fixture values, provider credentials, or replay logic live here.
const string = (maxLength = 160) => ({ type: 'string', maxLength });
const text = (maxLength = 160) => ({ ...string(maxLength), minLength: 1 });
const choice = (...values) => ({ type: 'string', enum: values });
const id = { type: 'string', pattern: '^[1-9][0-9]*$', description: 'Clinic record ID from an API response; preserve as a string.' };
const integer = (minimum = 0, maximum = 2147483647) => ({ type: 'integer', minimum, maximum });
const boolean = { type: 'boolean' };
const queryBoolean = choice('true', 'false');
const date = { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const time = { type: 'string', format: 'date-time' };
const decimal = { type: 'string', pattern: '^[+-]?[0-9]+(?:\\.[0-9]+)?$', maxLength: 30, description: 'Exact decimal string. Never convert money or quantities through floating point.' };
const requestKey = { ...text(160), pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$' };
const uuidKey = { ...requestKey, pattern: '^[0-9a-fA-F-]{36}$' };
const page = integer(1, 1000000);
const paging = { page, per_page: integer(1, 100) };
const object = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items, minItems = 0, maxItems = 100) => ({ type: 'array', items, minItems, maxItems });
const source = (name) => `apps/api/app/controllers/clinic/${name}_controller.rb`;
const operation = (id, title, domain, method, path, properties, required, uiPath, controller, options = {}) => ({
  id, title, domain,
  description: options.description || `${title} using the current authenticated clinic and existing backend permissions.`,
  method, path: `/api/clinic/${path}`, inputSchema: object(properties, required), uiPath,
  queryKeys: method === 'GET' ? Object.keys(properties).filter((key) => !path.includes(`:${key}`)) : [],
  bodyKeys: method === 'GET' ? [] : Object.keys(properties).filter((key) => !path.includes(`:${key}`)),
  source: source(controller),
  mutation: method !== 'GET',
  requiresConfirmation: method !== 'GET',
  replay: 'never',
  annotations: { readOnlyHint: method === 'GET', destructiveHint: false, idempotentHint: method === 'GET', openWorldHint: false },
  ...options,
});
const read = (id, title, domain, path, properties, required, uiPath, controller, options) => operation(id, title, domain, 'GET', path, properties, required, uiPath, controller, options);
const write = (id, title, domain, method, path, properties, required, uiPath, controller, bodyRoot, options = {}) => operation(id, title, domain, method, path, properties, required, uiPath, controller, { ...(bodyRoot ? { bodyRoot } : {}), ...options });
const appointmentStatuses = ['scheduled', 'confirmed', 'no_show', 'completed', 'cancelled'];
const booking = { patient_id: id, starts_at: time, ends_at: time, site_id: id, room_id: id, booked_clinician_id: id, visit_type_id: id, service_offering_id: id, schedule_hold_id: id, reason: string(500), request_key: requestKey, visit_modality: choice('in_person', 'video'), overbook_reason: string(500), expected_policy_revision: integer(), expected_resource_revision: integer(), };
const registration = { display_name: text(120), reference: text(32), legal_name: string(160), preferred_name: string(160), primary_address: string(20000), date_of_birth: date, sex: choice('female', 'male', 'intersex', 'unknown'), primary_language: string(80), interpreter_required: boolean, contact_type: choice('phone', 'email'), contact_value: string(320), preferred: boolean, preferred_contact_method: choice('text', 'phone', 'email', 'portal'), appointment_reminders_consent: boolean, general_communications_consent: boolean, request_key: requestKey };
const service = { name: text(160), code: string(50), description: string(500), unit_amount: decimal, currency: { ...text(3), minLength: 3 }, active: boolean, request_key: requestKey };
// Invoice variants are mutually exclusive, matching invoice_line_attributes.
const invoiceLines = array({ oneOf: [
  object({ quantity: decimal, billing_service_id: id, service_lock_version: integer() }, ['quantity', 'billing_service_id', 'service_lock_version']),
  object({ quantity: decimal, unit_amount: decimal, description_snapshot: text(500) }, ['quantity', 'unit_amount', 'description_snapshot']),
  object({ quantity: decimal, invoice_line_id: id }, ['quantity', 'invoice_line_id']),
] }, 1, 100);
const inventoryPage = { q: string(), page };

export const OPERATIONS = [
  read('clinic_context', 'Current clinic context', 'Context', 'context', {}, [], '/clinic/settings', 'context'),
  write('select_clinic_site', 'Select clinic location', 'Context', 'PATCH', 'context', { site_id: id }, ['site_id'], '/clinic/settings', 'context', null, { description: 'Change the session location to an authorized site. Refresh context before another operation.' }),

  read('list_appointments', 'Appointments', 'Schedule', 'appointments', { ...paging, patient_id: id, site_id: id, date, booked_clinician_id: id, status: choice(...appointmentStatuses), upcoming: queryBoolean, closed_site: queryBoolean, queue_context: queryBoolean, from: time, to: time, from_date: date, through_date: date, q: string() }, [], '/clinic/schedule', 'scheduling/appointments', { resultKey: 'appointments' }),
  read('get_appointment', 'Appointment detail', 'Schedule', 'appointments/:id', { id }, ['id'], '/clinic/schedule', 'scheduling/appointments', { resultKey: 'appointment' }),
  write('book_appointment', 'Book appointment', 'Schedule', 'POST', 'appointments', booking, ['patient_id', 'starts_at', 'ends_at', 'site_id', 'booked_clinician_id', 'visit_type_id'], '/clinic/schedule', 'scheduling/appointments', 'appointment', { resultKey: 'appointment', description: 'Book after checking site, service, provider and slot availability. Backend rechecks capacity and permissions.' }),
  write('reschedule_appointment', 'Reschedule appointment', 'Schedule', 'PATCH', 'appointments/:id', { id, starts_at: time, ends_at: time, site_id: id, room_id: id, booked_clinician_id: id, visit_type_id: id, service_offering_id: id, expected_updated_at: time, request_key: requestKey, visit_modality: choice('in_person', 'video'), overbook_reason: text(500), expected_policy_revision: integer(), expected_resource_revision: integer() }, ['id', 'starts_at', 'ends_at', 'expected_updated_at', 'request_key'], '/clinic/schedule', 'scheduling/appointments', 'appointment', { resultKey: 'appointment' }),
  write('transition_appointment', 'Update appointment status', 'Schedule', 'POST', 'appointments/:id/transition', { id, to: choice(...appointmentStatuses), expected_status: choice(...appointmentStatuses), cancellation_message_acknowledged: boolean }, ['id', 'to'], '/clinic/schedule', 'scheduling/appointments', 'transition', { resultKey: 'appointment', description: 'Apply an allowed appointment transition. Cancellation requires cancellation_message_acknowledged=true; no cancellation message is sent automatically.' }),
  read('schedule_calendar', 'Calendar and availability', 'Schedule', 'schedule_calendar', { site_id: id, date, period: choice('day', 'month'), duration_minutes: integer(5, 240), waitlist_entry_id: id }, ['site_id', 'date'], '/clinic/schedule', 'scheduling/calendar'),
  read('tracking_board', 'Front desk tracking board', 'Schedule', 'tracking_board', {}, [], '/clinic', 'scheduling/tracking_board', { resultKey: 'visits' }),
  read('appointment_requests', 'Patient appointment requests', 'Schedule', 'appointment_requests', { site_id: id, status: choice('pending', 'approved', 'declined', 'cancelled', 'expired') }, [], '/clinic/schedule', 'operations/appointment_requests', { resultKey: 'appointment_requests', description: 'Read authorized appointment requests. The backend may expire stale requests during this read.' }),
  write('approve_appointment_request', 'Approve appointment request', 'Schedule', 'POST', 'appointment_requests/:id/approve', { id, request_key: requestKey, starts_at: time, ends_at: time, site_id: id, room_id: id, booked_clinician_id: id, visit_type_id: id }, ['id', 'request_key'], '/clinic/schedule', 'operations/appointment_requests', 'review'),
  write('decline_appointment_request', 'Decline appointment request', 'Schedule', 'POST', 'appointment_requests/:id/decline', { id, request_key: requestKey, reason: string(300) }, ['id', 'request_key'], '/clinic/schedule', 'operations/appointment_requests', 'review'),
  read('callback_requests', 'Callback queue', 'Schedule', 'callback_requests', {}, [], '/clinic/schedule', 'operations/callback_requests', { resultKey: 'callback_requests' }),
  write('review_callback_request', 'Record callback outcome', 'Schedule', 'POST', 'callback_requests/:id/transition', { id, request_key: requestKey, status: choice('in_review', 'resolved', 'declined'), review_note: string(1000) }, ['id', 'request_key', 'status'], '/clinic/schedule', 'operations/callback_requests', 'callback_request', { description: 'Record an actual callback outcome. Resolved and declined requests require review_note; this does not place a call.' }),
  read('list_encounters', 'Patient encounters', 'Chart', 'patients/:patient_id/encounters', { patient_id: id, ...paging, status: choice('open', 'completed'), site_id: id }, ['patient_id'], '/clinic/patients/:patient_id', 'scheduling/encounters', { resultKey: 'encounters' }),
  read('get_encounter', 'Encounter detail', 'Chart', 'encounters/:id', { id, patient_id: id }, ['id', 'patient_id'], '/clinic/patients/:patient_id', 'scheduling/encounters', { resultKey: 'encounter' }),
  write('start_encounter', 'Start patient encounter', 'Chart', 'POST', 'patients/:patient_id/encounters', { patient_id: id, appointment_id: id, started_at: time, site_id: id, room_id: id }, ['patient_id'], '/clinic/patients/:patient_id', 'scheduling/encounters', 'encounter', { resultKey: 'encounter' }),
  write('assign_encounter_room', 'Assign encounter room', 'Schedule', 'PATCH', 'patients/:patient_id/encounters/:encounter_id/room', { patient_id: id, encounter_id: id, room_id: id, request_key: uuidKey }, ['patient_id', 'encounter_id', 'room_id', 'request_key'], '/clinic', 'scheduling/encounters', 'room', { resultKey: 'encounter' }),
  read('encounter_completion', 'Encounter completion review', 'Chart', 'encounters/:id/completion', { id, patient_id: id }, ['id', 'patient_id'], '/clinic/patients/:patient_id', 'scheduling/encounters'),

  read('list_patients', 'Patient registry', 'Patients', 'patients', { ...paging, q: string(), site_id: id }, [], '/clinic/patients', 'care/patients', { resultKey: 'patients', description: 'Find patient registry rows by clinic reference and optional primary location.' }),
  read('lookup_patient', 'Match patient identity', 'Patients', 'patients/lookup', { ...paging, id, q: string(), date_of_birth: date, phone: string(320) }, [], '/clinic/patients', 'care/patients', { resultKey: 'patients', description: 'Match by ID alone or at least one of name/query, date_of_birth, phone. ID cannot be combined with matching fields.' }),
  read('get_patient', 'Patient chart', 'Patients', 'patients/:id', { id }, ['id'], '/clinic/patients/:id', 'care/patients'),
  write('register_patient', 'Register patient', 'Patients', 'POST', 'patients', registration, ['display_name', 'reference', 'sex'], '/clinic/patients/new', 'care/patients', 'clinic_patient', { resultKey: 'patient', description: 'Register at the selected configured location. Sex must be documented or unknown. Optional omitted registration fields use backend defaults.' }),
  write('update_patient_registration', 'Update patient registration', 'Patients', 'PATCH', 'patients/:id', { id, ...registration, expected_updated_at: time }, ['id', 'display_name', 'reference'], '/clinic/patients/:id', 'care/patients', 'clinic_patient', { resultKey: 'patient', description: 'Update registration, retaining the original clinic reference. Use expected_updated_at from the current record to guard concurrent edits.' }),
  write('add_patient_note', 'Add patient note', 'Patients', 'POST', 'patients/:id/note', { id, body: text(8000) }, ['id', 'body'], '/clinic/patients/:id', 'care/patients'),
  read('patient_care_summary', 'Patient care summary', 'Chart', 'patients/:patient_id/care_summary', { patient_id: id, encounter_id: id }, ['patient_id'], '/clinic/patients/:patient_id', 'care/patient_care_summaries'),
  read('patient_observations', 'Patient observations', 'Chart', 'patients/:patient_id/observations', { patient_id: id, ...paging, encounter_id: id, value_kind: choice('numeric', 'text', 'coded', 'missing', 'group'), code: string(), from: time, to: time }, ['patient_id'], '/clinic/patients/:patient_id', 'care/observations', { resultKey: 'observations' }),
  read('vital_sign_dictionary', 'Encounter vital sign fields', 'Chart', 'patients/:patient_id/encounters/:encounter_id/vital_signs', { patient_id: id, encounter_id: id }, ['patient_id', 'encounter_id'], '/clinic/patients/:patient_id', 'care/vital_signs'),
  read('encounter_notes', 'Encounter notes', 'Chart', 'encounters/:encounter_id/notes', { encounter_id: id }, ['encounter_id'], '/clinic/patients', 'care/encounter_notes', { resultKey: 'notes' }),
  read('clinical_history', 'Allergies, medications and conditions', 'Chart', 'patients/:patient_id/clinical_history', { patient_id: id, encounter_id: id }, ['patient_id'], '/clinic/patients/:patient_id', 'care/clinical_history'),
  read('patient_lab_reports', 'Patient lab reports', 'Chart', 'patients/:patient_id/lab_reports', { patient_id: id, ...paging }, ['patient_id'], '/clinic/patients/:patient_id', 'care/lab_reports', { resultKey: 'reports' }),
  read('lab_review_queue', 'Lab review queue', 'Tasks', 'lab_reports/review_queue', paging, [], '/clinic/patients', 'care/lab_reports', { resultKey: 'items' }),
  read('patient_documents', 'Patient document metadata', 'Chart', 'patients/:patient_id/documents', { patient_id: id, ...paging, category_id: id, scan_state: choice('pending', 'quarantined', 'clean', 'rejected') }, ['patient_id'], '/clinic/patients/:patient_id', 'documents', { resultKey: 'documents' }),

  read('billing_dashboard', 'Billing dashboard', 'Billing', 'billing', { ...paging, q: string(), filter: choice('all', 'draft', 'open', 'paid', 'void', 'age_0_30', 'age_31_60', 'age_61_90', 'age_91_plus'), sort: choice('recent', 'oldest', 'balance_desc', 'total_desc') }, [], '/clinic/billing', 'billing/dashboard'),
  read('income_outlook', 'Income outlook', 'Billing', 'billing/income_outlook', { outlook_months: choice('3', '6', '12'), outlook_start: { type: 'string', pattern: '^\\d{4}-\\d{2}$' } }, [], '/clinic/billing', 'billing/dashboard', { resultKey: 'income_outlook' }),
  read('patient_billing_ledger', 'Patient billing ledger', 'Billing', 'patients/:id/billing_ledger', { id, invoice_id: id, payment_id: id, refund_id: id, encounter_id: id }, ['id'], '/clinic/billing/patients', 'billing/patient_ledgers'),
  read('patient_invoices', 'Patient invoices', 'Billing', 'patients/:patient_id/invoices', { patient_id: id, ...paging, encounter_id: id, status: choice('draft', 'posted', 'void') }, ['patient_id'], '/clinic/billing/patients', 'billing/invoices', { resultKey: 'invoices' }),
  read('get_invoice', 'Invoice detail', 'Billing', 'invoices/:id', { id, patient_id: id }, ['id'], '/clinic/billing', 'billing/invoices', { resultKey: 'invoice' }),
  write('draft_invoice', 'Create draft invoice', 'Billing', 'POST', 'patients/:patient_id/invoices', { patient_id: id, currency: { ...text(3), minLength: 3 }, encounter_id: id, request_key: requestKey, lines: array({ oneOf: invoiceLines.items.oneOf.slice(0, 2) }, 1, 100) }, ['patient_id', 'currency', 'lines'], '/clinic/billing', 'billing/invoices', 'invoice', { resultKey: 'invoice', description: 'Create an unposted invoice. Use catalog IDs with lock versions, or exact manual line descriptions and decimal amounts; no payment is collected.' }),
  write('update_draft_invoice', 'Update draft invoice', 'Billing', 'PATCH', 'invoices/:id/draft', { id, currency: { ...text(3), minLength: 3 }, request_key: requestKey, expected_updated_at: text(40), lines: invoiceLines }, ['id', 'currency', 'request_key', 'expected_updated_at', 'lines'], '/clinic/billing', 'billing/invoices', 'invoice', { resultKey: 'invoice' }),
  read('billing_services', 'Billing service catalog', 'Billing', 'billing_services', { ...paging, q: string(), active: queryBoolean }, [], '/clinic/billing/services', 'billing_services', { resultKey: 'services' }),
  write('create_billing_service', 'Create billing service', 'Billing', 'POST', 'billing_services', service, ['name', 'unit_amount', 'currency', 'request_key'], '/clinic/billing/services', 'billing_services', 'service', { resultKey: 'service' }),
  write('update_billing_service', 'Update billing service', 'Billing', 'PATCH', 'billing_services/:id', { id, ...service, lock_version: integer() }, ['id', 'request_key', 'lock_version'], '/clinic/billing/services', 'billing_services', 'service', { resultKey: 'service' }),
  read('subscriptions', 'Subscription agreements', 'Billing', 'subscriptions', { patient_id: id, package_id: id, family_id: id, service_id: id, tier: string(), search: string() }, [], '/clinic/billing', 'billing/subscriptions'),
  read('subscription_catalog', 'Subscription catalog', 'Billing', 'subscription_catalog', {}, [], '/clinic/subscriptions', 'care/subscription_catalog'),

  read('inventory_catalog', 'Inventory catalog table', 'Inventory', 'inventory/catalog', { ...inventoryPage, view: choice('table') }, ['view'], '/clinic/inventory/catalog', 'inventory/management', { resultKey: 'data' }),
  read('inventory_exceptions', 'Inventory exceptions', 'Inventory', 'inventory/exceptions', { ...inventoryPage, view: choice('queue') }, [], '/clinic/inventory/exceptions', 'inventory/management', { resultKey: 'data' }),
  read('inventory_locations', 'Inventory locations', 'Inventory', 'inventory/locations', { ...inventoryPage, view: choice('tree') }, [], '/clinic/inventory/locations', 'inventory/management', { resultKey: 'data' }),
  read('replenishment_plan', 'Replenishment plan', 'Inventory', 'inventory/replenishment', { ...inventoryPage, view: choice('plan'), product_id: id }, ['view'], '/clinic/inventory/replenishment', 'inventory/management', { resultKey: 'data' }),
  read('purchase_orders', 'Purchase orders', 'Inventory', 'inventory/purchase-orders', { ...inventoryPage, view: choice('batches'), purchase_order_id: id }, ['view'], '/clinic/inventory/purchasing', 'inventory/management', { resultKey: 'data' }),
  read('get_purchase_order', 'Purchase order detail', 'Inventory', 'inventory/purchase-orders/:id', { id }, ['id'], '/clinic/inventory/purchasing', 'inventory/management'),
  read('inventory_receiving', 'Receiving deliveries', 'Inventory', 'inventory/receiving', { ...inventoryPage, view: choice('deliveries', 'intake'), shipment_id: id, purchase_order_id: id }, ['view'], '/clinic/inventory/receiving', 'inventory/management', { resultKey: 'data' }),
  read('inventory_positions', 'Stock positions and lots', 'Inventory', 'inventory/lots', { ...inventoryPage, view: choice('positions'), product_id: id }, ['view'], '/clinic/inventory/lots', 'inventory/management', { resultKey: 'data' }),
  read('inventory_activity', 'Stock movement history', 'Inventory', 'inventory/activity', { q: string(), view: choice('ledger'), before: id, lot_id: id }, ['view'], '/clinic/inventory/activity', 'inventory/management', { resultKey: 'data' }),
  read('inventory_recalls', 'Recall cases', 'Inventory', 'inventory/recalls', { ...inventoryPage, view: choice('cases'), recall_id: id, position_page: page, history_page: page, lot_q: string(), lot_page: page, product_id: id }, ['view'], '/clinic/inventory/recalls', 'inventory/management', { resultKey: 'data' }),
  read('inventory_count_sessions', 'Inventory count sessions', 'Inventory', 'inventory/count-sessions', { ...inventoryPage, view: choice('program'), session_id: id, line_page: page, history_page: page }, [], '/clinic/inventory/counts', 'inventory/management', { resultKey: 'data' }),
  write('create_inventory_count', 'Assign inventory count', 'Inventory', 'POST', 'inventory/count-sessions', { location_id: id, assignee_id: id, due_on: date, blind: boolean, reason: text(500), request_key: uuidKey }, ['location_id', 'assignee_id', 'due_on', 'reason', 'request_key'], '/clinic/inventory/counts', 'inventory/management', 'session'),
  write('record_inventory_count', 'Record count observation', 'Inventory', 'POST', 'inventory/count-session-lines/:id/observe', { id, counted_units: decimal, reason: text(500), request_key: uuidKey }, ['id', 'counted_units', 'reason', 'request_key'], '/clinic/inventory/counts', 'inventory/management', 'count'),
  write('update_inventory_product', 'Update inventory reorder settings', 'Inventory', 'PATCH', 'inventory/products/:id', { id, reorder_point: integer(0, 1000000), active: boolean }, ['id'], '/clinic/inventory/catalog', 'inventory/management', 'product'),

  read('staff_directory', 'Staff directory', 'Staff', 'staff', { ...paging, q: { ...string(), title: 'Job title', description: 'Search matches job titles. Leave blank to browse names.' }, active: queryBoolean }, [], '/clinic/staff', 'staff/members', { resultKey: 'staff' }),
  write('create_staff_member', 'Create staff directory member', 'Staff', 'POST', 'staff', { display_name: text(120), job_title: text(120) }, ['display_name', 'job_title'], '/clinic/staff', 'staff/members', 'clinic_staff_member', { resultKey: 'staff_member', description: 'Create a staff directory record; this does not create a login or send an invitation.' }),
  write('update_staff_active', 'Update staff directory status', 'Staff', 'PATCH', 'staff/:id', { id, active: boolean }, ['id', 'active'], '/clinic/staff', 'staff/members'),
  read('workforce_employments', 'Employee access and employment', 'Staff', 'workforce/employments', {}, [], '/clinic/workforce/employees', 'workforce/employments'),
  read('workforce_schedules', 'Staff schedules', 'Staff', 'workforce/schedules', { site_id: id }, ['site_id'], '/clinic/workforce/schedule', 'workforce/schedules'),
  read('workforce_timecards', 'Timecards', 'Staff', 'workforce/timecards', { scope: choice('self'), site_id: id, employment_id: id }, [], '/clinic/workforce/timecards', 'workforce/timecards'),
  read('get_timecard', 'Timecard detail', 'Staff', 'workforce/timecards/:id', { id, site_id: id }, ['id'], '/clinic/workforce/timecards', 'workforce/timecards', { resultKey: 'timecard' }),
  read('facilities', 'Facilities, rooms and visit types', 'Facilities', 'facilities', { ...paging, type: choice('sites', 'rooms', 'departments', 'visit_types'), q: string(), site_id: id, available_only: queryBoolean, selected_only: queryBoolean, detail: queryBoolean }, [], '/clinic/facilities', 'facilities'),
  write('create_facility_room', 'Create facility room', 'Facilities', 'POST', 'facilities/:id/rooms', { id, code: text(80), kind: choice('physical', 'telehealth') }, ['id', 'code'], '/clinic/facilities', 'facilities', 'room', { resultKey: 'room' }),
  write('update_facility_room', 'Update facility room', 'Facilities', 'PATCH', 'facilities/:id/rooms/:room_id', { id, room_id: id, code: text(80), kind: choice('physical', 'telehealth') }, ['id', 'room_id'], '/clinic/facilities', 'facilities', 'room', { resultKey: 'room', description: 'Update a room name or kind. A room with linked appointments cannot change kind.' }),
  write('create_visit_type', 'Create visit type', 'Facilities', 'POST', 'visit_types', { request_key: requestKey, code: text(80) }, ['request_key', 'code'], '/clinic/facilities', 'visit_types', 'visit_type', { resultKey: 'visit_type' }),
  read('workforce_settings', 'Workforce settings contract', 'Settings', 'workforce/settings', { site_id: id }, [], '/clinic/workforce/settings', 'workforce/settings'),

  read('staff_conversations', 'Staff conversations', 'Messages', 'staff-messaging/conversations', paging, [], '/clinic/messages', 'messaging/staff', { resultKey: 'conversations' }),
  read('get_staff_conversation', 'Conversation and messages', 'Messages', 'staff-messaging/conversations/:id', { id, ...paging }, ['id'], '/clinic/messages', 'messaging/staff'),
  read('staff_message_participants', 'Available message participants', 'Messages', 'staff-messaging/participants', { site_id: id }, [], '/clinic/messages', 'messaging/staff', { resultKey: 'participants' }),
  write('create_staff_conversation', 'Create staff conversation', 'Messages', 'POST', 'staff-messaging/conversations', { request_key: requestKey, kind: choice('direct', 'team', 'role'), title: string(120), site_id: id, member_ids: array(id, 1) }, ['request_key', 'kind', 'member_ids'], '/clinic/messages', 'messaging/staff', 'conversation', { resultKey: 'conversation' }),
  write('send_staff_message', 'Send internal staff message', 'Messages', 'POST', 'staff-messaging/conversations/:id/messages', { id, request_key: requestKey, body: text(10000), message_class: choice('routine', 'time_sensitive', 'urgent', 'safety_critical'), response_due_at: time, assignee_membership_id: id, requested_action: string(200), reply_to_message_id: id }, ['id', 'request_key', 'body'], '/clinic/messages', 'messaging/staff', 'message', { resultKey: 'message', description: 'Post a deliberate internal staff message to the selected authorized conversation. No external patient message is sent.' }),
  write('acknowledge_staff_message', 'Acknowledge staff message', 'Messages', 'POST', 'staff-messaging/messages/:id/acknowledge', { id, note: string(500) }, ['id'], '/clinic/messages', 'messaging/staff', 'acknowledgement', { resultKey: 'message' }),
  write('transition_staff_request', 'Update staff request', 'Tasks', 'POST', 'staff-messaging/requests/:id/transition', { id, state: choice('open', 'acknowledged', 'in_progress', 'resolved', 'declined', 'expired'), resolution_code: string(80), resolution_note: string(500), request_key: requestKey, expected_updated_at: string(40) }, ['id', 'state'], '/clinic/messages', 'messaging/staff', 'transition', { resultKey: 'request', description: 'Apply a backend allowed request transition. Resolutions may require a policy specific resolution code or note.' }),
  write('mark_staff_conversation_read', 'Mark conversation read', 'Messages', 'POST', 'staff-messaging/conversations/:id/read', { id }, ['id'], '/clinic/messages', 'messaging/staff'),
  read('follow_up_worklist', 'Follow-up and task worklist', 'Tasks', 'operations/follow_ups', { filter: choice('all', 'mine', 'overdue', 'unassigned', 'offboarded'), site_id: id, page, staff_requests_page: page, encounter_follow_ups_page: page, renewal_exceptions_page: page }, [], '/clinic/operations', 'operations/follow_ups'),

  read('telehealth_visits', 'Telehealth visit queue', 'Telehealth', 'telehealth/visits', { date, site_id: id, clinician_membership_id: id, status: choice('scheduled', 'in_progress', 'ending', 'ended', 'cancelled', 'no_show'), cursor: string(2000), limit: integer(1, 100), encounter_id: id, patient_id: id }, [], '/clinic/telehealth', 'telehealth/visits', { resultKey: 'data' }),
  read('get_telehealth_visit', 'Telehealth preparation and visit', 'Telehealth', 'telehealth/visits/:visit_id', { visit_id: text(160) }, ['visit_id'], '/clinic/telehealth', 'telehealth/visits', { resultKey: 'data' }),
  read('telehealth_booking_options', 'Telehealth booking rules', 'Telehealth', 'telehealth/booking_options', { site_id: id }, [], '/clinic/schedule', 'telehealth/booking_options', { resultKey: 'data' }),
  read('telehealth_settings', 'Telehealth settings', 'Settings', 'telehealth/settings', {}, [], '/clinic/settings/telehealth', 'telehealth/settings', { resultKey: 'data' }),

  read('report_daily_visits', 'Daily visits by state', 'Reports', 'reports/daily_visits_by_state', { date, site_id: id, page }, ['date'], '/clinic/operations', 'reports/daily_visits_by_state', { resultKey: 'report' }),
  read('report_daily_invoices', 'Daily invoices', 'Reports', 'reports/daily_invoices', { date, page }, ['date'], '/clinic/operations', 'reports/daily_invoices', { resultKey: 'report' }),
  read('report_stock_movements', 'Daily stock movements', 'Reports', 'reports/daily_stock_movements', { date, page }, ['date'], '/clinic/operations', 'reports/daily_stock_movements', { resultKey: 'report' }),
  read('report_daily_payments', 'Daily payment activity', 'Reports', 'reports/daily_payment_activity', { date, payment_page: page, refund_page: page }, ['date'], '/clinic/operations', 'reports/daily_payment_activity', { resultKey: 'report' }),
  read('report_current_stock', 'Current stock', 'Reports', 'reports/current_stock', { page: integer(1, 999999), office_page: integer(1, 999999), status: choice('all', 'available', 'held', 'expired') }, [], '/clinic/operations', 'reports/current_stock', { resultKey: 'report' }),
  read('report_open_clinical_work', 'Open clinical work', 'Reports', 'reports/open_clinical_work', { site_id: id }, [], '/clinic/operations', 'reports/open_clinical_work', { resultKey: 'report' }),
];
