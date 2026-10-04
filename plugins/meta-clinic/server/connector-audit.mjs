import { createHash, randomUUID } from 'node:crypto';
import { OPERATIONS } from './catalog.mjs';

const RECORD_LIMIT = 2000;
const CLINIC_LIMIT = 1000;
const DAY = 86400000;
const RETENTION = 30 * DAY;
const operations = new Set(OPERATIONS.map(operation => operation.id));
const tools = new Set(['meta_clinic_open', 'meta_clinic_catalog', 'meta_clinic_connection', 'meta_clinic_read',
  'meta_clinic_panel', 'meta_clinic_prepare_change', 'meta_clinic_apply_change', 'meta_clinic_discard_change',
  'meta_clinic_profile', 'meta_clinic_demo_action', 'events/list', 'events/subscribe', 'events/unsubscribe']);
const outcomes = new Set(['success', 'denied', 'error', 'unconfirmed']);
const denials = new Set(['authentication', 'permissions', 'clinic_limit', 'request_limit', 'context_changed']);
const unavailable = () => Object.assign(new Error('Connector audit storage is unavailable. No clinic action was dispatched.'), { status: 503 });
function backendId(value) {
  const id = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  return typeof id === 'string' && /^[1-9][0-9]{0,29}$/.test(id) ? id : null;
}

// This is connector call accounting, not model tokens, OpenAI API usage, or a
// billable ledger. All rows use the existing authenticated encrypted store.
export function createConnectorAudit({ storage, toolCallsPerClinicPerDay = 0, now = Date.now }) {
  if (!Number.isSafeInteger(toolCallsPerClinicPerDay) || toolCallsPerClinicPerDay < 0 || toolCallsPerClinicPerDay > 1000000)
    throw new Error('The clinic daily tool-call limit must be an integer from 0 to 1000000; 0 disables the limit.');

  function update(ticket, action) {
    return storage.transaction(() => {
      const record = storage.get('connector_audit', ticket.slot);
      if (!record || record.id !== ticket.id || record.outcome !== 'in_progress') throw unavailable();
      action(record);
      storage.set('connector_audit', ticket.slot, record);
    });
  }
  function begin({ connectionId, clientId, tool, operation }) {
    if (typeof connectionId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(connectionId) || !tools.has(tool)) throw unavailable();
    try {
      return storage.transaction(() => {
        const time = now();
        const cursor = storage.get('connector_audit_state', 'cursor')?.slot || 0;
        for (let offset = 0; offset < RECORD_LIMIT; offset++) {
          const slot = String((cursor + offset) % RECORD_LIMIT);
          const previous = storage.get('connector_audit', slot);
          // Protect live calls from ring eviction. Stale starts retain an
          // unknown outcome until retention expires; never invent completion.
          if (previous?.outcome === 'in_progress' && previous.started_at > time - RETENTION) continue;
          const id = randomUUID();
          storage.set('connector_audit', slot, { version: 1, id, source: 'remote_connector', connection_id: connectionId,
            oauth_client_id: typeof clientId === 'string' && clientId.length <= 200 ? clientId : null, tool,
            operation: operations.has(operation) ? operation : null, backend_origin: null, user_id: null, practice_id: null, site_id: null,
            started_at: time, outcome: 'in_progress', denial_reason: null, duration_ms: null });
          storage.set('connector_audit_state', 'cursor', { slot: (Number(slot) + 1) % RECORD_LIMIT });
          return { id, slot, startedAt: time };
        }
        throw unavailable();
      });
    } catch { throw unavailable(); }
  }
  function attribute(ticket, context, user, backendOrigin) {
    const userId = backendId(context?.user_id), practiceId = backendId(context?.practice?.id);
    if (!userId || !practiceId || userId !== backendId(user?.id)) throw Object.assign(new Error('Reconnect to establish the current clinic account.'), { status: 401 });
    let origin;
    try {
      const url = new URL(backendOrigin);
      if (url.origin !== backendOrigin || !(url.origin === 'https://aimetaclinic.com' ||
        (url.protocol === 'http:' && url.hostname === '127.0.0.1'))) throw unavailable();
      origin = url.origin;
    } catch { throw unavailable(); }
    let limited = false;
    try {
      update(ticket, record => {
        if (record.practice_id) throw unavailable();
        record.backend_origin = origin;
        record.user_id = userId; record.practice_id = practiceId; record.site_id = backendId(context.current_site?.id);
        if (record.tool.startsWith('events/')) return;
        const time = now(), day = Math.floor(time / DAY);
        const meterKey = createHash('sha256').update(JSON.stringify([origin, practiceId])).digest('hex');
        let meter = storage.get('connector_clinic_meter', meterKey);
        if (!meter) {
          const rows = storage.list('connector_clinic_meter');
          for (const row of rows) if (row.value.updated_at <= time - 31 * DAY) storage.delete('connector_clinic_meter', row.key);
          if (rows.filter(row => row.value.updated_at > time - 31 * DAY).length >= CLINIC_LIMIT) throw unavailable();
          meter = { backend_origin: origin, practice_id: practiceId, days: [] };
        }
        meter.days = meter.days.filter(bucket => bucket.day >= day - 30);
        let bucket = meter.days.find(bucket => bucket.day === day);
        if (!bucket) { bucket = { day, calls: 0, limited: 0 }; meter.days.push(bucket); }
        limited = toolCallsPerClinicPerDay > 0 && bucket.calls >= toolCallsPerClinicPerDay;
        if (limited) bucket.limited++; else bucket.calls++;
        meter.updated_at = time;
        storage.set('connector_clinic_meter', meterKey, meter);
      });
    } catch { throw unavailable(); }
    if (limited) throw Object.assign(new Error('This clinic has reached its configured daily connector tool-call limit. Try again after the next UTC day.'), { status: 429, code: 'clinic_tool_call_limit' });
  }
  function operation(ticket, operation, context) {
    if (!operations.has(operation?.id)) throw unavailable();
    try {
      update(ticket, record => {
        // A changed execution context must not escape the admitted clinic's
        // meter or be reported under the prior clinic before a backend write.
        if (record.user_id !== backendId(context?.user_id) || record.practice_id !== backendId(context?.practice?.id) ||
          record.site_id !== backendId(context?.current_site?.id))
          throw Object.assign(new Error('The clinic context changed. Refresh before trying the action again.'), { status: 409 });
        record.operation = operation.id;
      });
      ticket.operationRecorded = true;
    } catch (failure) { if (failure.status === 409) throw failure; throw unavailable(); }
  }
  function finish(ticket, outcome, denial) {
    if (!outcomes.has(outcome)) throw new Error('Invalid connector audit outcome.');
    update(ticket, record => {
      record.outcome = outcome;
      record.denial_reason = outcome === 'denied' && denials.has(denial) ? denial : null;
      record.duration_ms = Math.max(0, now() - record.started_at);
    });
  }
  function cleanup() {
    const time = now();
    storage.transaction(() => {
      for (const { key, value } of storage.list('connector_audit')) if (value.started_at <= time - RETENTION) storage.delete('connector_audit', key);
      for (const { key, value } of storage.list('connector_clinic_meter')) if (value.updated_at <= time - 31 * DAY) storage.delete('connector_clinic_meter', key);
    });
  }
  cleanup();
  return { begin, attribute, operation, finish, cleanup };
}
