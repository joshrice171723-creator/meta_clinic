// Additional existing Rails contracts for the connected clinic-day panel.
// Existing catalog IDs are reused by the UI; this array contains only missing operations.
const text = (maxLength = 160) => ({ type: 'string', maxLength });
const requiredText = (maxLength = 160) => ({ ...text(maxLength), minLength: 1 });
const id = { type: 'string', pattern: '^[1-9][0-9]*$' };
const integer = (minimum = 0, maximum = 2147483647) => ({ type: 'integer', minimum, maximum });
const time = { type: 'string', format: 'date-time' };
const key = { ...requiredText(), pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$' };
const choice = (...values) => ({ type: 'string', enum: values });
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items, maxItems = 100) => ({ type: 'array', items, maxItems });
const paging = { page: integer(1, 1000000), per_page: integer(1, 100) };
const noteFields = { template_id: requiredText(100), template_version: integer(1, 1000000), subjective: text(50000), objective: text(50000), assessment: text(50000), plan: text(50000), patient_instructions: text(5000), session_duration_minutes: integer(1, 1440), request_key: key };
function operation(id, title, method, path, properties, required, controller, bodyRoot, resultKey) {
  return {
    id, title, domain: 'Care', method, path: `/api/clinic/${path}`,
    description: `${title} for the selected patient and encounter using backend authorization and validation.`,
    inputSchema: object(properties, required), uiPath: '/clinic/patients',
    queryKeys: method === 'GET' ? Object.keys(properties).filter(name => !path.includes(`:${name}`)) : [],
    bodyKeys: method === 'GET' ? [] : Object.keys(properties).filter(name => !path.includes(`:${name}`)),
    ...(bodyRoot ? { bodyRoot } : {}), ...(resultKey ? { resultKey } : {}),
    source: `apps/api/app/controllers/clinic/${controller}_controller.rb`,
    mutation: method !== 'GET', requiresConfirmation: method !== 'GET', replay: 'never',
    annotations: { readOnlyHint: method === 'GET', destructiveHint: false, idempotentHint: method === 'GET', openWorldHint: false },
  };
}
export const CARE_OPERATIONS = [
  operation('record_vital_signs', 'Record encounter vital signs', 'POST', 'patients/:patient_id/encounters/:encounter_id/vital_signs', {
    patient_id: id, encounter_id: id, request_key: key, dictionary_version: requiredText(80), observed_at: time,
    confirmed_patient: { type: 'boolean', const: true },
    readings: { ...array(object({ code: requiredText(), value: { type: 'string', pattern: '^[+-]?[0-9]+(?:\\.[0-9]+)?$', minLength: 1, maxLength: 30 }, unit_code: requiredText(80) }, ['code', 'value', 'unit_code']), 9), minItems: 1 },
  }, ['patient_id', 'encounter_id', 'request_key', 'dictionary_version', 'observed_at', 'confirmed_patient', 'readings'], 'care/vital_signs', 'vital_signs', 'observations'),
  operation('note_templates', 'Available encounter note templates', 'GET', 'note_templates', { encounter_id: id }, ['encounter_id'], 'care/note_templates', null, 'templates'),
  operation('get_encounter_note', 'SOAP note and revision history', 'GET', 'notes/:id', { id }, ['id'], 'care/encounter_notes', null, 'note'),
  operation('create_soap_draft', 'Create SOAP draft', 'POST', 'encounters/:encounter_id/notes', { encounter_id: id, note_kind: { type: 'string', const: 'soap' }, ...noteFields }, ['encounter_id', 'note_kind', 'template_id', 'template_version', 'request_key'], 'care/encounter_notes', 'encounter_note', 'note'),
  operation('revise_soap_draft', 'Append SOAP draft revision', 'POST', 'notes/:id/revisions', { id, ...noteFields, expected_revision: integer(1) }, ['id', 'template_id', 'template_version', 'expected_revision', 'request_key'], 'care/encounter_notes', 'revision', 'note'),
  operation('encounter_follow_up', 'Encounter follow-up disposition', 'GET', 'encounters/:encounter_id/follow_up', { encounter_id: id }, ['encounter_id'], 'operations/encounter_follow_ups'),
  operation('record_encounter_follow_up', 'Record follow-up disposition', 'PUT', 'encounters/:encounter_id/follow_up', { encounter_id: id, request_key: key, expected_version: integer(), status: choice('not_required', 'needed', 'arranged'), plan: text(4000), follow_up_appointment_id: id, due_at: time, assigned_to_membership_id: id }, ['encounter_id', 'request_key', 'expected_version', 'status'], 'operations/encounter_follow_ups', 'follow_up', 'follow_up'),
  operation('complete_encounter', 'Complete encounter with reviewed evidence', 'POST', 'encounters/:id/close', {
    id, patient_id: id, request_key: key, ended_at: time,
    disposition_code: choice('completed_as_planned', 'left_before_completion', 'transferred_to_higher_level_of_care', 'emergency_services', 'other'),
    instructions_status: choice('provided', 'not_required', 'unable_to_complete'), education_status: choice('recorded', 'not_required', 'unable_to_complete'),
    follow_up_id: id, follow_up_version: integer(), expected_follow_up_state: choice('not_required', 'needed', 'arranged', 'completed'), instruction_note_revision_id: id,
    expected_education_event_ids: array(id, 10000), expected_open_task_versions: array({ type: 'string', pattern: '^[1-9][0-9]*:[0-9]+$' }, 10000),
    open_work_reviewed: { type: 'boolean', const: true }, exception_note: text(2000),
  }, ['id', 'patient_id', 'request_key', 'disposition_code', 'instructions_status', 'education_status', 'follow_up_id', 'follow_up_version', 'expected_follow_up_state', 'expected_education_event_ids', 'expected_open_task_versions', 'open_work_reviewed'], 'scheduling/encounters', 'close', 'encounter'),
];
