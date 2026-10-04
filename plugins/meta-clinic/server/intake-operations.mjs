// Curated nurse-workspace contracts backed by the existing Rails workflow.
// The API remains authoritative for permissions, versions, evidence ownership,
// and every state transition. Mutations are prepared for human review.
const id = {
  type: 'string',
  pattern: '^[1-9][0-9]*$',
  description: 'A positive numeric clinic record ID returned by an authorized backend read. Keep it as a string.',
};
const key = {
  type: 'string',
  minLength: 1,
  maxLength: 160,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$',
  description: 'Stable idempotency key for this single requested change. Generate a fresh key for a new action; never replay after an uncertain result.',
};
const version = {
  type: 'integer',
  minimum: 0,
  maximum: 2147483647,
  description: 'Exact lock version returned by the latest backend read. The server rejects stale values.',
};
const choice = (values, description) => ({ type: 'string', enum: values, description });
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const idList = {
  type: 'array',
  maxItems: 50,
  items: id,
  description: 'Existing backend observation IDs already linked to this revision. Supply only IDs returned for this same patient and encounter; backend rechecks access and scope.',
};
const historyList = {
  type: 'array',
  maxItems: 50,
  items: id,
  description: 'Existing backend history-review IDs already linked to this revision. Supply only IDs returned for this same patient and encounter; backend rechecks access and scope.',
};

function operation(id, title, method, path, properties, required, source, options = {}) {
  const pathKeys = [...path.matchAll(/:([a-z_]+)/g)].map(match => match[1]);
  return {
    id,
    title,
    domain: 'Intake',
    description: options.description || `${title} for the selected patient and encounter. Backend membership, site, capability and record-scope checks remain authoritative.`,
    method,
    path: `/api/clinic/${path}`,
    inputSchema: object(properties, required),
    uiPath: '/clinic/intake',
    queryKeys: method === 'GET' ? Object.keys(properties).filter(name => !pathKeys.includes(name)) : [],
    bodyKeys: method === 'GET' ? [] : Object.keys(properties).filter(name => !pathKeys.includes(name)),
    ...(options.bodyRoot ? { bodyRoot: options.bodyRoot } : {}),
    ...(options.resultKey ? { resultKey: options.resultKey } : {}),
    source,
    mutation: method !== 'GET',
    requiresConfirmation: method !== 'GET',
    replay: 'never',
    annotations: { readOnlyHint: method === 'GET', destructiveHint: false, idempotentHint: method === 'GET', openWorldHint: false },
  };
}

export const INTAKE_OPERATIONS = [
  operation(
    'nurse_workspace',
    'Patient encounter intake and handoff workspace',
    'GET',
    'patients/:patient_id/encounters/:encounter_id/nurse_workspace',
    { patient_id: id, encounter_id: id },
    ['patient_id', 'encounter_id'],
    'apps/api/app/controllers/clinic/care/nurse_workflow_controller.rb',
    { resultKey: null, description: 'Read the current authorized intake revision, backend questionnaire definition, review items, evidence options, handoff, tasks and capability flags. This is the source of truth for what the signed-in member may do.' },
  ),
  operation(
    'revise_nurse_intake',
    'Save a reviewed intake revision',
    'POST',
    'patients/:patient_id/encounters/:encounter_id/intake_revisions',
    {
      patient_id: id,
      encounter_id: id,
      request_key: key,
      expected_version: version,
      status: choice(['incomplete', 'ready_for_handoff', 'unable_to_complete'], 'Explicit intake state selected by staff. No clinical completion or recommendation is inferred.'),
      identity_state: choice(['confirmed', 'not_confirmed', 'unable_to_confirm'], 'Identity status selected by staff after following clinic policy.'),
      visit_reason_state: choice(['confirmed', 'needs_correction', 'not_recorded', 'unable_to_obtain'], 'Visit-reason status selected by staff; it does not assert a diagnosis.'),
      history_state: choice(['reviewed', 'incomplete', 'not_recorded', 'unable_to_obtain'], 'History review status selected by staff. The backend may require current history evidence before handoff.'),
      vitals_state: choice(['recorded', 'incomplete', 'not_recorded', 'declined', 'unable_to_obtain', 'not_applicable'], 'Vital-sign status selected by staff; this operation does not create or interpret measurements.'),
      observation_ids: idList,
      history_review_ids: historyList,
    },
    ['patient_id', 'encounter_id', 'request_key', 'expected_version', 'status', 'identity_state', 'visit_reason_state', 'history_state', 'vitals_state'],
    'apps/api/app/controllers/clinic/care/nurse_workflow_controller.rb',
    { bodyRoot: 'intake', resultKey: 'intake', description: 'Append a versioned intake revision after staff review. It preserves the existing questionnaire when omitted. The backend checks intake.write, revision version and evidence ownership; it decides whether the selected state is ready for handoff.' },
  ),
  operation(
    'request_intake_handoff',
    'Request clinician handoff for saved intake',
    'POST',
    'patients/:patient_id/encounters/:encounter_id/handoffs',
    {
      patient_id: id,
      encounter_id: id,
      intake_revision_id: { ...id, description: 'ID of the exact latest intake revision returned by the workspace. The backend rejects old or incomplete revisions.' },
      request_key: key,
    },
    ['patient_id', 'encounter_id', 'intake_revision_id', 'request_key'],
    'apps/api/app/controllers/clinic/care/nurse_workflow_controller.rb',
    { bodyRoot: 'handoff', resultKey: 'handoff', description: 'Create a pending clinician handoff from the latest ready intake. Requires intake.write; non-video encounters also require a room assignment. The backend creates the handoff task and prevents a second active handoff.' },
  ),
  operation(
    'transition_intake_handoff',
    'Respond to or cancel clinician handoff',
    'PATCH',
    'handoffs/:id',
    {
      id: { ...id, description: 'ID of the current handoff returned by the workspace; the backend scopes it to the signed-in practice.' },
      action: choice(['accept', 'reject', 'request_correction', 'complete', 'cancel'], 'Exact backend transition. Valid transitions depend on current state; accept/reject/request_correction/complete require notes.write and a different clinician from the requester. Cancel requires intake.write.'),
      expected_version: version,
      request_key: key,
    },
    ['id', 'action', 'expected_version', 'request_key'],
    'apps/api/app/controllers/clinic/care/nurse_workflow_controller.rb',
    { bodyRoot: 'handoff', resultKey: 'handoff', description: 'Apply one allowed handoff transition using its current version. The backend enforces transition order, role separation, latest-intake linkage and task updates.' },
  ),
];
