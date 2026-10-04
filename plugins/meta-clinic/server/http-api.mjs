import { callTool } from './service.mjs';

const object = value => value && typeof value === 'object' && !Array.isArray(value);
const only = (input, keys) => {
  if (!object(input) || Object.keys(input).some(key => !keys.includes(key))) throw new Error('Unexpected request fields. Read the local OpenAPI contract.');
};

// Local prototype aliases reuse the same serialized session, catalog validation,
// review tickets and Rails permission checks as the installed MCP tools.
// The broker must authenticate the local caller before invoking this function.
export async function routePrototypeApi(method, url, input, port) {
  const path = url.pathname;
  let name = 'meta_clinic_panel';
  let args;
  if (path === '/api/v1/appointments/schedule' && method === 'POST') {
    only(input, ['phase', 'arguments', 'change_id', 'expected_context']);
    const expected_context = input.expected_context;
    if (input.phase === 'search') {
      if (input.change_id !== undefined) throw new Error('Search does not accept a change identifier.');
      name = 'meta_clinic_read';
      args = { operation: 'schedule_calendar', arguments: input.arguments || {}, expected_context };
    } else if (input.phase === 'prepare') {
      if (input.change_id !== undefined) throw new Error('Preparation does not accept a change identifier.');
      name = 'meta_clinic_prepare_change';
      args = { operation: 'book_appointment', arguments: input.arguments || {}, expected_context };
    } else if (input.phase === 'commit') {
      if (input.arguments !== undefined || input.expected_context !== undefined || typeof input.change_id !== 'string') throw new Error('Commit requires only the prepared change identifier.');
      name = 'meta_clinic_apply_change';
      args = { change_id: input.change_id };
    } else throw new Error('Choose search, prepare or commit.');
  } else if (path === '/api/v1/clinic/layout' && method === 'GET') {
    args = { view: 'rooms', arguments: queryArguments(url) };
  } else if (/^\/api\/v1\/patients\/[1-9][0-9]*\/telemetry$/.test(path) && method === 'GET') {
    const parameters = queryArguments(url);
    if ('patient_id' in parameters) throw new Error('Use the patient identifier in the route only.');
    args = { view: 'vitals', arguments: { ...parameters, patient_id: path.split('/')[4] } };
  } else if (path === '/api/v1/billing/claims/status' && method === 'POST') {
    only(input, ['arguments', 'expected_context']);
    args = { view: 'billing', arguments: input.arguments || {}, expected_context: input.expected_context };
  } else return null;
  return callTool(name, args, port);
}

function queryArguments(url) {
  const args = {};
  for (const [key, value] of url.searchParams) {
    if (key in args) throw new Error('Duplicate query parameters are not supported.');
    args[key] = ['page', 'per_page', 'limit'].includes(key) && /^\d+$/.test(value) ? Number(value) : value;
  }
  return args;
}
