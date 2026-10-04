// UI-only projections of executable Rails response contracts. Never return raw records.
// Sources: care/observation_serializer.rb, services/clinic/care/vital_signs.rb,
// clinic/facility_serializer.rb, scheduling/tracking_board_serializer.rb,
// billing/invoice_serializer.rb, queries/clinic/billing/dashboard.rb,
// controllers/clinic/billing/insurance_preparations_controller.rb and
// services/clinic/billing/insurance_preparation.rb. Paths are under apps/api/app/.
const VITAL_CODES = new Set([
  'vital-systolic-bp', 'vital-diastolic-bp', 'vital-heart-rate',
  'vital-respiratory-rate', 'vital-oxygen-saturation', 'vital-temperature',
  'vital-weight', 'vital-height', 'vital-pain-score', 'vital-bmi',
]);
// Existing development seed dictionary (backend_samples.rb:840-864), kept distinct from v2.
const LEGACY_VITAL_LABELS = {
  'vital-systolic-bp': 'Systolic blood pressure', 'vital-diastolic-bp': 'Diastolic blood pressure',
  'vital-heart-rate': 'Heart rate', 'vital-respiratory-rate': 'Respiratory rate',
  'vital-oxygen-saturation': 'Oxygen saturation', 'vital-temperature': 'Temperature', 'vital-weight': 'Weight',
};
const supportedVital = row => (row.code_system === 'urn:apply:vital-signs' && row.code_version === '2' && VITAL_CODES.has(row.code))
  || (row.code_system === 'synthetic-vitals' && row.code_version === '1' && Object.hasOwn(LEGACY_VITAL_LABELS, row.code));
const recordIdSchema = { type: 'string', pattern: '^[1-9][0-9]*$', description: 'Existing numeric clinic record ID from an authorized API response. No synthetic reference mapping.' };
const pageSchema = { type: 'integer', minimum: 1, maximum: 1000000, description: 'Requested backend page. The returned pagination describes the source list before panel filtering.' };
const sizeSchema = { type: 'integer', minimum: 1, maximum: 100, description: 'Backend page size. No automatic traversal of additional pages.' };
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

// The root service compiles these schemas with its existing Ajv instance before calling loadPanel.
export const PANEL_SCHEMAS = {
  vitals: schema({
    patient_id: { ...recordIdSchema, description: 'Required existing patient ID; selects the authorized observation list.' },
    encounter_id: { ...recordIdSchema, description: 'Optional existing encounter ID belonging to the selected patient.' },
    page: pageSchema, per_page: sizeSchema,
  }, ['patient_id']),
  rooms: schema({
    site_id: { ...recordIdSchema, description: 'Optional authorized clinic location ID for the room list. No availability or spatial coordinates are inferred.' },
    page: pageSchema, per_page: sizeSchema,
  }),
  billing: schema({
    patient_id: { ...recordIdSchema, description: 'Optional existing patient ID. When supplied, load patient invoices and insurance preparation history at the session selected location; otherwise load the practice invoice dashboard.' },
    encounter_id: { ...recordIdSchema, description: 'Optional encounter filter for the selected patient invoices; requires patient_id.' },
    page: pageSchema, per_page: sizeSchema,
  }),
};
PANEL_SCHEMAS.billing.dependencies = { encounter_id: ['patient_id'] };
const numericId = (value) => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^[1-9][0-9]*$/.test(value))) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};
const text = (value, maximum = 160) => typeof value === 'string' && value.length <= maximum ? value : null;
const decimal = (value) => typeof value === 'string' && /^[+-]?[0-9]+(?:\.[0-9]+)?$/.test(value) ? value : null;
const state = (value, allowed) => allowed.includes(value) ? value : null;
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T[0-9:.+-]+Z?)?$/.test(value) ? value : null;
const rows = (value) => Array.isArray(value) ? value : [];
const pagination = (value) => value && typeof value === 'object' ? {
  page: Number.isSafeInteger(value.page) ? value.page : null,
  per_page: Number.isSafeInteger(value.per_page) ? value.per_page : null,
  total: Number.isSafeInteger(value.total) ? value.total : null,
  total_pages: Number.isSafeInteger(value.total_pages) ? value.total_pages : null,
} : null;
const input = (args, allowed) => Object.fromEntries(allowed.filter(key => args[key] !== undefined && args[key] !== '').map(key => [key, args[key]]));
const summary = (view, title, count) => ({ view, title, status: 'loaded', row_count: count });

async function vitals(args, readOperation) {
  if (!args.patient_id) throw new Error('Select a patient before opening vital signs.');
  const data = await readOperation('patient_observations', input(args, ['patient_id', 'encounter_id', 'page', 'per_page']));
  const readings = rows(data.observations)
    .filter(row => supportedVital(row) && row.value_kind !== 'group')
    .map(row => ({
      id: numericId(row.id), patient_id: numericId(row.patient_id), encounter_id: numericId(row.encounter_id),
      parent_observation_id: numericId(row.parent_observation_id), code: row.code,
      code_system: row.code_system, code_version: text(row.code_version, 80),
      label: text(row.display_label, 160) || LEGACY_VITAL_LABELS[row.code] || row.code,
      value_kind: state(row.value_kind, ['numeric', 'text', 'coded', 'missing']),
      numeric_value: row.value_kind === 'numeric' ? decimal(row.numeric_value) : null,
      unit_code: text(row.unit_code, 80), unit_label: text(row.unit_label, 80) || text(row.unit_code, 80),
      observed_at: date(row.observed_at), recorded_at: date(row.recorded_at),
      status: null,
    }));
  const paired = new Set();
  const bloodPressure = [];
  for (const systolic of readings.filter(row => row.code === 'vital-systolic-bp' && row.numeric_value !== null)) {
    const diastolic = readings.find(row => row.code === 'vital-diastolic-bp' && row.numeric_value !== null && !paired.has(row.id)
      && row.encounter_id === systolic.encounter_id && row.code_system === systolic.code_system
      && row.code_version === systolic.code_version && row.unit_code === systolic.unit_code
      && (systolic.parent_observation_id !== null ? row.parent_observation_id === systolic.parent_observation_id
        : row.parent_observation_id === null && systolic.observed_at !== null && row.observed_at === systolic.observed_at));
    if (!diastolic) continue;
    paired.add(diastolic.id);
    bloodPressure.push({
      systolic_id: systolic.id, diastolic_id: diastolic.id, parent_observation_id: systolic.parent_observation_id,
      systolic: systolic.numeric_value, diastolic: diastolic.numeric_value,
      unit_code: systolic.unit_code, unit_label: systolic.unit_label,
      observed_at: systolic.observed_at, recorded_at: systolic.recorded_at,
    });
  }
  return {
    summary: summary('vitals', 'Vital signs loaded', readings.length),
    panel: {
      view: 'vitals', patient_id: numericId(args.patient_id), encounter_id: numericId(args.encounter_id),
      readings, blood_pressure: bloodPressure, pagination: pagination(data.pagination),
      gaps: [
        'The observation API supplies value kind, values, units and times; it does not supply a clinical normal/abnormal status or interpretation.',
        'This is one observation page filtered to supported vital-sign codes. A paired blood-pressure component may be on another page; missing pairs are not inferred.',
        'Narrative observation text and free-text missing reasons are omitted from this panel.',
      ],
    },
  };
}

async function rooms(args, readOperation) {
  const facilities = await readOperation('facilities', { type: 'rooms', ...input(args, ['site_id', 'page', 'per_page']) });
  const board = await readOperation('tracking_board', {});
  const visitRows = rows(board.visits).filter(row => row.row_type === 'encounter' && row.encounter);
  const roomRows = rows(facilities.rooms).map(room => ({
    id: numericId(room.id), site_id: numericId(room.site_id), code: text(room.code, 80),
    kind: state(room.kind, ['physical', 'telehealth']), status: null,
    visits: visitRows.filter(visit => numericId(visit.encounter.room_id) === numericId(room.id)
      && numericId(visit.encounter.site_id) === numericId(room.site_id)).map(visit => ({
      encounter_id: numericId(visit.encounter_id), patient_id: numericId(visit.patient_id),
      status: state(visit.encounter.status, ['open', 'completed']),
      operational_state: state(visit.operational_state, ['upcoming', 'on_time', 'late', 'waiting_room', 'unrecorded']),
      started_at: date(visit.encounter.started_at), ended_at: date(visit.encounter.ended_at),
    })),
  }));
  return {
    summary: summary('rooms', 'Rooms and recorded encounters loaded', roomRows.length),
    panel: {
      view: 'rooms', site_id: numericId(args.site_id), rooms: roomRows, pagination: pagination(facilities.pagination),
      board_as_of: date(board.as_of), board_truncated: typeof board.truncated === 'boolean' ? board.truncated : null,
      gaps: [
        'The room API supplies room identity and kind, but no physical availability, cleaning or occupancy status. Encounter statuses shown here are recorded encounter states.',
        'The tracking board contains authorized open encounters and completed encounters awaiting checkout; an empty room entry does not establish availability.',
        'No backend floor-plan coordinates are available. Room cards are a list, not a spatial floor plan.',
      ],
    },
  };
}

const invoice = (row) => ({
  id: numericId(row.id), patient_id: numericId(row.patient_id ?? row.patient?.id), encounter_id: numericId(row.encounter_id),
  site_id: numericId(row.source_site_id), status: state(row.status, ['draft', 'posted', 'void']), currency: text(row.currency, 3),
  total_amount: decimal(row.total_amount ?? row.total), allocated_amount: decimal(row.allocated_amount ?? row.allocated),
  credit_amount: decimal(row.credit_amount ?? row.credited), balance_amount: decimal(row.balance_amount ?? row.balance),
  created_at: date(row.created_at), updated_at: date(row.updated_at),
});
const insuranceStates = ['prepared', 'pending', 'approved', 'denied', 'unknown', 'cancelled'];
const insuranceSources = ['local', 'manual', 'simulation'];
const insuranceRequest = (row) => ({
  id: numericId(row.id), coverage_id: numericId(row.coverage_id), invoice_id: numericId(row.invoice_id),
  insurance_claim_id: numericId(row.insurance_claim_id),
  kind: state(row.kind, ['eligibility', 'authorization', 'claim', 'reconciliation']),
  state: state(row.state, insuranceStates), source: state(row.source, insuranceSources),
  latest_event_id: numericId(row.latest_event_id), latest_state: state(row.latest_state, insuranceStates),
  latest_source: state(row.latest_source, insuranceSources), recorded_at: date(row.recorded_at),
  service_date: date(row.details?.service_date),
});

async function billing(args, readOperation) {
  const patientId = numericId(args.patient_id);
  const data = await readOperation(patientId ? 'patient_invoices' : 'billing_dashboard', input(args,
    patientId ? ['patient_id', 'encounter_id', 'page', 'per_page'] : ['page', 'per_page']));
  const invoices = rows(patientId ? data.invoices : data.recent_invoices).map(invoice);
  const limitation = 'Eligibility and claim entries are local preparation/history with local, manual or simulation evidence. No live payer submission, real-time eligibility verification, adjudication or remittance status is supplied by this API.';
  let insurance = {
    available: false, enabled: null, site_id: null, coverage: [], eligibility: [], claims: [], authorizations: [], reconciliations: [],
    coverage_pagination: null, request_pagination: null, limitation,
  };
  const gaps = [limitation];
  if (patientId) {
    try {
      const details = await readOperation('patient_insurance', input(args, ['patient_id', 'page', 'per_page']));
      const requests = rows(details.requests).map(insuranceRequest);
      insurance = {
        ...insurance, available: true, enabled: typeof details.enabled === 'boolean' ? details.enabled : null,
        site_id: numericId(details.site_id),
        coverage: rows(details.coverage).map(row => ({
          id: numericId(row.id), version: numericId(row.version), site_id: numericId(row.site_id),
          status: state(row.details?.status, ['active', 'inactive', 'unknown']),
          starts_on: date(row.details?.starts_on), ends_on: date(row.details?.ends_on),
          observed_on: date(row.details?.observed_on), recorded_at: date(row.recorded_at),
        })),
        eligibility: requests.filter(row => row.kind === 'eligibility'), claims: requests.filter(row => row.kind === 'claim'),
        authorizations: requests.filter(row => row.kind === 'authorization'), reconciliations: requests.filter(row => row.kind === 'reconciliation'),
        coverage_pagination: pagination(details.pagination), request_pagination: pagination(details.request_pagination),
      };
      gaps.push('Insurance reads use the session selected location. Coverage and request history are separate paginated lists; current results do not establish all-patient claim totals.');
      if (details.enabled === false) gaps.push('Insurance workflow preparation is disabled for the selected location; existing history remains readable.');
    } catch (error) {
      if (![403, 404, 422].includes(error.status)) throw error;
      gaps.push(error.status === 403 ? 'Insurance history is unavailable with the current account permissions.'
        : error.status === 422 ? 'Insurance history requires an authorized selected clinic location.'
          : 'Insurance history could not be loaded in the current clinic context.');
    }
  } else {
    gaps.push('Select a patient to read insurance coverage and eligibility/claim preparation history. The practice invoice dashboard has no practice-wide claim or eligibility queue.');
  }
  return {
    summary: summary('billing', 'Billing records loaded', invoices.length),
    panel: {
      view: 'billing', patient_id: patientId, invoices,
      pagination: pagination(patientId ? data.pagination : data.invoice_pagination), insurance, gaps,
    },
  };
}

// readOperation must return the raw decoded API body and preserve backend errors/status.
// The caller owns authentication, context stability and routing this panel into UI-only metadata.
export async function loadPanel(view, args = {}, readOperation) {
  if (typeof readOperation !== 'function') throw new Error('A clinic read adapter is required.');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Panel arguments must be an object.');
  const loaders = { vitals, rooms, billing };
  if (!Object.hasOwn(loaders, view)) throw new Error('Choose the vitals, rooms or billing panel.');
  if (Object.keys(args).some(key => !Object.hasOwn(PANEL_SCHEMAS[view].properties, key))) throw new Error('Unsupported panel argument.');
  for (const key of ['patient_id', 'encounter_id', 'site_id']) {
    if (args[key] !== undefined && numericId(args[key]) === null) throw new Error('Choose an existing numeric clinic record ID.');
  }
  if (view === 'billing' && args.encounter_id && !args.patient_id) throw new Error('Select a patient before filtering invoices by encounter.');
  return loaders[view](args, readOperation);
}
