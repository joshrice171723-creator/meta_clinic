import { OPERATIONS } from './catalog.mjs';
import { PANEL_SCHEMAS } from './panels.mjs';

const describe = (schema, context) => {
  const copy = structuredClone(schema);
  const visit = (node, name) => {
    if (!node || typeof node !== 'object') return;
    node.description ||= `${name.replaceAll('_', ' ')} for ${context}. Use recorded backend values; omitted optional fields retain backend behavior.`;
    if (node.properties) for (const [key, value] of Object.entries(node.properties)) visit(value, key);
    if (node.items) visit(node.items, `${name} item`);
    for (const branch of [...node.oneOf || [], ...node.anyOf || []]) visit(branch, name);
    // OpenAPI 3.0 uses its own Schema Object subset, without Draft 7 dependencies.
    if (node.dependencies) {
      node.allOf = Object.entries(node.dependencies).map(([field, required]) => ({ anyOf: [{ not: { required: [field] } }, { required }] }));
      delete node.dependencies;
    }
  };
  visit(copy, context);
  return copy;
};

export function prototypeOpenApi(port = 3320) {
  const calendar = describe(OPERATIONS.find(op => op.id === 'schedule_calendar').inputSchema, 'calendar search');
  const booking = describe(OPERATIONS.find(op => op.id === 'book_appointment').inputSchema, 'appointment booking');
  const panels = Object.fromEntries(Object.entries(PANEL_SCHEMAS).map(([key, schema]) => [key, describe(schema, `${key} panel`)]));
  const parameters = (schema, exclude = []) => Object.entries(schema.properties).filter(([key]) => !exclude.includes(key)).map(([name, field]) => ({ name, in: 'query', required: schema.required?.includes(name) || false, description: field.description, schema: field }));
  const responses = {
    200: { description: 'MCP-style result. Clinical details are in _meta for component rendering; this REST response itself is not model-redacted.', content: { 'application/json': { schema: { $ref: '#/components/schemas/ToolResult' } } } },
    400: { description: 'Invalid input, missing local session, expired review, or rejected operation.' },
    401: { description: 'The clinic session expired.' },
    403: { description: 'Caller origin, local broker credential, or clinic permission denied.' },
    404: { description: 'Unknown route, method, or invisible backend record.' },
    409: { description: 'Backend conflict or stale record revision.' },
    422: { description: 'Backend domain validation rejected the request.' },
    429: { description: 'Backend rate limit; follow its retry guidance.' },
  };
  const expectedContext = { type: 'object', additionalProperties: false, description: 'Optional account and clinic snapshot. A mismatch rejects stale requests.', required: ['actor_id', 'practice_id', 'site_id', 'authorization_generation'], properties: Object.fromEntries(['actor_id', 'practice_id', 'site_id', 'authorization_generation'].map(key => [key, { type: 'string', nullable: true, description: `Exact ${key.replaceAll('_', ' ')} from the current connection, stringified; null when absent.` }])) };
  const postBody = schema => ({ required: true, description: 'Exact prototype operation arguments; no credentials or patient narrative.', content: { 'application/json': { schema } } });
  return {
    openapi: '3.0.3',
    info: { title: 'Meta Clinic local prototype facade', version: '0.2.0', description: 'Executable aliases for the installed local MCP plugin. Uses its existing signed-in Rails account and selected clinic, not OAuth. One local OS installation shares one account connection. Loopback-only and synthetic development runtime only. These contracts adapt the architecture proposal to actual backend fields. No new triage, live payer verification, remote customer service, or spatial layout writer is implied. The browser header is a same-origin request guard, not a user identity credential.' },
    servers: [{ url: `http://127.0.0.1:${port}`, description: 'Local loopback broker; hosted origins are rejected.' }],
    security: [{ BrokerBearer: [] }, { SameOriginPanel: [] }],
    paths: {
      '/api/v1/appointments/schedule': { post: {
        operationId: 'prototypeSchedule', summary: 'Read calendar, prepare booking, or apply a reviewed booking',
        description: 'Search returns recorded calendar and availability. Prepare creates a five-minute exact-value review without saving/reserving. Commit consumes the review once and asks Rails to persist it. Backend permissions, revision checks and overlap constraints remain authoritative. Requests with uncertain write results are never automatically replayed.',
        requestBody: postBody({ oneOf: [
          { type: 'object', additionalProperties: false, required: ['phase', 'arguments'], properties: { phase: { type: 'string', enum: ['search'], description: 'Read availability without mutation.' }, arguments: calendar, expected_context: expectedContext } },
          { type: 'object', additionalProperties: false, required: ['phase', 'arguments'], properties: { phase: { type: 'string', enum: ['prepare'], description: 'Prepare exact booking arguments for review.' }, arguments: booking, expected_context: expectedContext } },
          { type: 'object', additionalProperties: false, required: ['phase', 'change_id'], properties: { phase: { type: 'string', enum: ['commit'], description: 'Apply the exact prepared change after review.' }, change_id: { type: 'string', format: 'uuid', description: 'Unexpired single-use change_id returned by prepare, bound to current account and clinic context.' } } },
        ] }), responses,
      } },
      '/api/v1/clinic/layout': { get: { operationId: 'prototypeRooms', summary: 'Read clinic rooms and operational status', description: 'Returns backend room states and capabilities. It does not invent spatial coordinates or persist layout adjustments.', parameters: parameters(panels.rooms), responses } },
      '/api/v1/patients/{id}/telemetry': { get: { operationId: 'prototypeVitals', summary: 'Read recorded vitals history', description: 'A bounded recorded-data view, not real-time monitoring or clinical interpretation. Detailed measurements are returned only in component metadata in MCP transport.', parameters: [{ name: 'id', in: 'path', required: true, description: 'Existing authorized patient ID. Preserve it as a positive numeric string; do not infer a patient from a name.', schema: { type: 'string', pattern: '^[1-9][0-9]*$' } }, ...parameters(panels.vitals, ['patient_id'])], responses } },
      '/api/v1/billing/claims/status': { post: { operationId: 'prototypeBillingStatus', summary: 'Read stored coverage and insurance request history', description: 'Eligibility, authorization, claim and reconciliation history remains distinct and preserves backend state/source. No payer is contacted and no claim or charge is created.', requestBody: postBody({ type: 'object', additionalProperties: false, required: ['arguments'], properties: { arguments: panels.billing, expected_context: expectedContext } }), responses } },
    },
    components: {
      securitySchemes: {
        BrokerBearer: { type: 'http', scheme: 'bearer', description: 'Local broker credential held by the installed MCP process. Never enter it in chat or commit it. Clinical identity comes from the broker signed-in account.' },
        SameOriginPanel: { type: 'apiKey', in: 'header', name: 'X-Meta-Clinic-UI', description: 'Browser request marker value 1. Also requires exact local Origin for POST, or same-origin Fetch Metadata for GET. It does not independently authenticate a person.' },
      },
      schemas: { ToolResult: { type: 'object', description: 'MCP result envelope shared by the prototype facade.', properties: {
        isError: { type: 'boolean', description: 'True when the operation failed; never present it as a saved action.' },
        content: { type: 'array', description: 'Short model-visible administrative text.', items: { type: 'object', required: ['type', 'text'], properties: { type: { type: 'string', enum: ['text'], description: 'Text content block.' }, text: { type: 'string', description: 'Backend operation message.' } } } },
        structuredContent: { type: 'object', additionalProperties: true, description: 'Model-visible operation result or clinical panel administrative summary.' },
        _meta: { type: 'object', additionalProperties: true, description: 'Component-only panel data, request arguments, connection and scope. Still visible to an HTTP caller; never treat it as de-identified.' },
      } } },
    },
  };
}
