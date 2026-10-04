import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

const KIND = 'event_subscription';
const DEFAULT_TTL = 60 * 60 * 1000;
const MAX_SUBSCRIPTIONS = 200;
const MAX_PER_CONNECTION = 20;
const RETRIES = [5_000, 30_000, 120_000, 600_000];
const REMINDER_DUE = 'clinic.appointment.reminder_due';
const NAMES = {
  'clinic.appointment.changed': 'Persisted changes to one existing appointment, including scheduling and status changes.',
  [REMINDER_DUE]: 'An existing scheduled appointment reminder becomes due under the backend reminder schedule and current policy. No patient message is sent by this event.',
  'clinic.result.changed': 'Persisted report or report-version changes for one existing lab report, without result values.',
  'clinic.task.changed': 'Persisted changes to one existing clinical task, without task or patient content.',
};

class EventError extends Error {
  constructor(code, message, data) { super(message); this.code = code; this.data = data; }
}
const invalid = message => new EventError(-32602, message);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function secretKey(secret) {
  if (typeof secret !== 'string' || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) throw invalid('Supply a Standard Webhooks signing secret.');
  const value = secret.slice(6), key = Buffer.from(value, 'base64');
  if (key.length < 24 || key.length > 64 || key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) throw invalid('The signing secret must decode to 24–64 bytes.');
  return key;
}
function definition(name) {
  return {
    name, description: NAMES[name], delivery: ['webhook'],
    inputSchema: { type: 'object', properties: { resource_id: { type: 'string', pattern: '^[1-9][0-9]{0,18}$', description: 'ID of the existing resource to monitor.' } }, required: ['resource_id'], additionalProperties: false },
    payloadSchema: { type: 'object', properties: { resource_id: { type: 'string' }, change: { type: 'string', enum: name === REMINDER_DUE ? ['due'] : ['create', 'update', 'destroy', 'touch'] } }, required: ['resource_id', 'change'], additionalProperties: false },
  };
}

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) blocked.addSubnet(address, prefix, 'ipv6');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
function publicAddress(address) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}
function callbackUrl(value, origins) {
  let url;
  try { url = new URL(value); } catch { throw invalid('Supply a valid HTTPS callback URL.'); }
  if (typeof value !== 'string' || value.length > 4096 || url.protocol !== 'https:' || url.username || url.password || url.hash || !origins.has(url.origin) || isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw invalid('Callback must use an explicitly configured HTTPS origin and public hostname.');
  return url;
}
function category(error) {
  if (error.code === 'ETIMEDOUT' || error.name === 'AbortError') return 'timeout';
  if (/CERT|TLS|SSL/.test(error.code || '')) return 'tls_error';
  return 'connection_refused';
}

// Resolve every connection, reject any non-public DNS answer, and pin the socket
// to a validated answer while retaining the original TLS hostname. No redirects.
async function post(subscription, body, webhookId, origins, signal) {
  const url = callbackUrl(subscription.url, origins);
  let timer;
  const answers = await Promise.race([
    lookup(url.hostname, { all: true, verbatim: true }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Callback DNS timeout.'), { code: 'ETIMEDOUT' })), 10_000); }),
  ]).finally(() => clearTimeout(timer));
  if (!answers.length || answers.some(answer => !publicAddress(answer.address))) throw new EventError(-32015, 'Callback could not be reached.', { reason: 'connection_refused' });
  if (signal.aborted) throw Object.assign(new Error('Callback cancelled.'), { name: 'AbortError' });
  const selected = answers[0];
  const bytes = Buffer.from(body, 'utf8');
  if (bytes.length > 262144) throw invalid('Event exceeds the webhook size limit.');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const keys = [subscription.secret];
  if (subscription.previousSecret && subscription.rotationUntil > Date.now()) keys.push(subscription.previousSecret);
  const signatures = keys.map(secret => `v1,${createHmac('sha256', secretKey(secret)).update(`${webhookId}.${timestamp}.`).update(bytes).digest('base64')}`).join(' ');
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: 'POST', agent: false, signal, servername: url.hostname,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [selected]); else callback(null, selected.address, selected.family);
      },
      headers: { 'Content-Type': 'application/json', 'Content-Length': bytes.length, 'webhook-id': webhookId, 'webhook-timestamp': timestamp, 'webhook-signature': signatures, 'X-MCP-Subscription-Id': subscription.id },
    }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 16_384) req.destroy(new Error('Callback response too large.')); else chunks.push(chunk); });
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    const timeout = setTimeout(() => req.destroy(Object.assign(new Error('Callback timeout.'), { code: 'ETIMEDOUT' })), 10_000);
    req.once('close', () => clearTimeout(timeout));
    req.on('error', reject); req.end(bytes);
  });
}

export function createEventService({ storage, resolveConnection, allowedCallbackOrigins = [] }) {
  const origins = new Set(allowedCallbackOrigins.map(value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) throw new Error('Configure exact HTTPS event callback origins.');
    return url.origin;
  }));
  const locks = new Map(), activeRequests = new Map(); let ticking = false;
  async function locked(key, work) {
    const previous = locks.get(key) || Promise.resolve();
    const running = previous.catch(() => {}).then(work); locks.set(key, running);
    try { return await running; } finally { if (locks.get(key) === running) locks.delete(key); }
  }
  async function connected(connectionId, expectedOwner) {
    const service = await resolveConnection(connectionId);
    if (!service) throw new EventError(-32012, 'Reconnect the clinic account.');
    await service.client.refreshContext();
    const context = service.client.context;
    if (!context?.user_id || !context.practice?.id) throw new EventError(-32012, 'Reconnect the clinic account.');
    const owner = canonical([connectionId, String(context.user_id), String(context.practice.id)]);
    if (expectedOwner && owner !== expectedOwner) throw new EventError(-32012, 'The subscription account changed.');
    return { service, owner };
  }
  async function feed(service, name, args, cursor, pendingEventId) {
    const query = new URLSearchParams({ name, resource_id: args.resource_id, ...(cursor ? { cursor } : {}), ...(pendingEventId ? { pending_event_id: pendingEventId } : {}) });
    return service.client.request(`/api/clinic/plugin_events?${query}`);
  }
  function identity(owner, params) {
    if (!Object.hasOwn(NAMES, params.name)) throw new EventError(-32011, 'Event is unavailable.', { kind: 'event' });
    const args = params.arguments;
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).length !== 1 || typeof args.resource_id !== 'string' || !/^[1-9][0-9]{0,18}$/.test(args.resource_id)) throw invalid('Supply only a valid resource_id.');
    if (params.delivery?.mode !== 'webhook') throw new EventError(-32014, 'Webhook delivery is required.', { feature: 'deliveryMode', value: params.delivery?.mode });
    const url = callbackUrl(params.delivery.url, origins).href;
    return { id: `sub_${createHash('sha256').update(canonical([owner, url, params.name, args])).digest('hex')}`, url, args };
  }
  async function signedPost(sub, body, id) {
    const controller = new AbortController(); activeRequests.set(sub.id, controller);
    try { return await post(sub, body, id, origins, controller.signal); }
    finally { if (activeRequests.get(sub.id) === controller) activeRequests.delete(sub.id); }
  }
  async function verify(sub) {
    const challenge = randomBytes(32).toString('base64url');
    let result;
    try { result = await signedPost(sub, JSON.stringify({ type: 'verification', challenge }), `msg_verification_${randomBytes(16).toString('hex')}`); }
    catch (error) { throw new EventError(-32015, 'Callback verification failed.', { reason: error.data?.reason || category(error) }); }
    if (result.status < 200 || result.status >= 300) throw new EventError(-32015, 'Callback verification failed.', { reason: result.status >= 500 ? 'http_5xx' : 'http_4xx' });
    let returned;
    try { returned = JSON.parse(result.body).challenge; } catch {}
    const received = Buffer.from(typeof returned === 'string' ? returned : '');
    const expected = Buffer.from(challenge);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new EventError(-32015, 'Callback verification failed.', { reason: 'challenge_failed' });
  }
  async function operation(message, { connectionId, scopes } = {}) {
    if (process.env.META_CLINIC_EVENTS_ENABLED !== '1') throw new EventError(-32014, 'Event delivery is not enabled.', { feature: 'events' });
    if (scopes && !new Set(scopes).has('clinic:events')) throw new EventError(-32012, 'Event access is required.');
    const params = message.params || {};
    const { service, owner } = await connected(connectionId);
    if (message.method === 'events/list') {
      if (params.cursor != null) throw invalid('The event catalog has one page.');
      const catalog = await service.client.request('/api/clinic/plugin_events/catalog');
      return { events: catalog.names.filter(name => Object.hasOwn(NAMES, name)).map(definition) };
    }
    const key = identity(owner, params);
    if (message.method === 'events/unsubscribe') {
      activeRequests.get(key.id)?.abort();
      return locked(key.id, () => { storage.delete(KIND, key.id); return {}; });
    }
    if (message.method !== 'events/subscribe') throw new EventError(-32601, 'Method not found.');
    if (params.cursor != null) throw new EventError(-32014, 'These events do not provide client replay.', { feature: 'cursor' });
    secretKey(params.delivery.secret);
    if (params.ttlMs != null && (!Number.isSafeInteger(params.ttlMs) || params.ttlMs <= 0)) throw invalid('ttlMs must be a positive integer or null.');
    // The protocol permits a documented minimum to prevent refresh storms.
    const ttl = params.ttlMs == null ? DEFAULT_TTL : Math.max(60_000, Math.min(DEFAULT_TTL, params.ttlMs));
    // Admission is serialized across identities, including the asynchronous
    // callback verification, so concurrent callers cannot exceed store quotas.
    return locked('subscribe-admission', () => locked(key.id, async () => {
      let existing = storage.get(KIND, key.id);
      let truncated = false;
      if (existing && (existing.expiresAt <= Date.now() || existing.stopped)) { storage.delete(KIND, key.id); existing = undefined; truncated = true; }
      const all = storage.list(KIND);
      if (!existing && (all.length >= MAX_SUBSCRIPTIONS || all.filter(row => row.value.connectionId === connectionId).length >= MAX_PER_CONNECTION)) throw new EventError(-32013, 'Subscription limit reached.', { limit: 'subscriptions', max: MAX_PER_CONNECTION });
      // The backend validates current access even on refresh and a cached challenge.
      let initial;
      try { initial = await feed(service, params.name, key.args, existing?.cursor); }
      catch (error) {
        if (!existing || !['feed_expired', 'feed_limit'].includes(error.code)) throw error;
        // The private position has reached its stated bound. A refresh begins
        // a new future stream and explicitly reports the lost replay interval.
        storage.delete(KIND, key.id); existing = undefined; truncated = true;
        initial = await feed(service, params.name, key.args);
      }
      const sub = { ...existing, id: key.id, connectionId, owner, name: params.name, args: key.args, url: key.url, secret: params.delivery.secret, cursor: existing?.cursor || initial.cursor, expiresAt: Date.now() + ttl };
      if (existing && existing.secret !== sub.secret) { sub.previousSecret = existing.secret; sub.rotationUntil = Date.now() + 5 * 60 * 1000; }
      if (!existing?.verifiedUntil || existing.verifiedUntil <= Date.now() || existing.secret !== sub.secret) {
        await verify(sub); sub.verifiedUntil = Date.now() + 5 * 60 * 1000;
      }
      sub.expiresAt = Date.now() + ttl;
      storage.set(KIND, sub.id, sub);
      return { id: sub.id, refreshBefore: new Date(sub.expiresAt).toISOString(), cursor: null, truncated };
    }));
  }
  async function handle(message, context) {
    try { return { jsonrpc: '2.0', id: message.id, result: await operation(message, context) }; }
    catch (error) {
      const code = error instanceof EventError ? error.code : [401, 403, 404].includes(error.status) ? -32012 : -32603;
      return { jsonrpc: '2.0', id: message.id, error: { code, message: error instanceof EventError ? error.message : code === -32012 ? 'Event access is unavailable.' : 'Event operation could not be completed.', ...(error instanceof EventError && error.data ? { data: error.data } : {}) } };
    }
  }
  async function deliver(id) {
    const sub = storage.get(KIND, id);
    if (!sub) return;
    if (sub.expiresAt <= Date.now()) { storage.delete(KIND, id); return; }
    if (sub.stopped || sub.pending?.nextAt > Date.now()) return;
    let service, page;
    try {
      ({ service } = await connected(sub.connectionId, sub.owner));
      // Validate resource and site permissions immediately before every delivery.
      page = await feed(service, sub.name, sub.args, sub.cursor, sub.name === REMINDER_DUE ? sub.pending?.eventId : undefined);
    } catch (error) {
      if (error.code === -32012 || [401, 403, 404].includes(error.status)) storage.delete(KIND, id);
      else if (['feed_expired', 'feed_limit'].includes(error.code)) { sub.stopped = error.code; storage.set(KIND, id, sub); }
      return;
    }
    if (sub.name === REMINDER_DUE && sub.pending && page.pending_event_eligible !== true) {
      // A due occurrence is a current condition, unlike immutable model history.
      // Do not retry a cancelled, moved, paused, expired or policy-denied notice.
      // Retain the acknowledged position so a later eligible occurrence is read.
      delete sub.pending; storage.set(KIND, id, sub); return;
    }
    if (!sub.pending) {
      const event = page.events?.[0]; if (!event) return;
      const reminder = sub.name === REMINDER_DUE;
      const validOccurrence = reminder ? /^clinic-reminder-[0-9]+-[0-9]+-[0-9]+$/.test(event.eventId) && event.data?.change === 'due' : /^clinic-version-[0-9]+-[0-9]+$/.test(event.eventId) && ['create', 'update', 'destroy', 'touch'].includes(event.data?.change);
      if (event.name !== sub.name || event.data?.resource_id !== sub.args.resource_id || typeof event.feed_cursor !== 'string' || typeof event.eventId !== 'string' || !validOccurrence || !Number.isFinite(Date.parse(event.timestamp))) return;
      // Select fields explicitly; internal cursors and unforeseen backend fields
      // never become webhook payload or model instructions.
      const body = JSON.stringify({ eventId: event.eventId, name: sub.name, timestamp: event.timestamp, data: { resource_id: event.data.resource_id, change: event.data.change }, cursor: null });
      sub.pending = { body, eventId: event.eventId, cursor: event.feed_cursor, attempts: 0, nextAt: 0 };
      storage.set(KIND, id, sub);
    }
    if (sub.expiresAt <= Date.now()) { storage.delete(KIND, id); return; }
    let result;
    try { result = await signedPost(sub, sub.pending.body, sub.pending.eventId); }
    catch (error) { result = { status: 0, reason: category(error) }; }
    if (result.status >= 200 && result.status < 300) {
      sub.cursor = sub.pending.cursor; delete sub.pending;
    } else {
      if (result.status === 410) { storage.delete(KIND, id); return; }
      if (result.status === 413 || (result.status >= 300 && result.status < 500 && result.status !== 429) || sub.pending.attempts >= RETRIES.length) {
        sub.stopped = result.status === 413 ? 'payload_rejected' : 'delivery_failed';
      } else {
        sub.pending.nextAt = Date.now() + RETRIES[sub.pending.attempts++];
      }
    }
    if (sub.rotationUntil <= Date.now()) { delete sub.previousSecret; delete sub.rotationUntil; }
    storage.set(KIND, id, sub);
  }
  async function tick() {
    if (ticking || process.env.META_CLINIC_EVENTS_ENABLED !== '1') return;
    ticking = true;
    try {
      for (const { key } of storage.list(KIND).slice(0, MAX_SUBSCRIPTIONS)) await locked(key, () => deliver(key));
    } finally { ticking = false; }
  }
  return { handle, tick };
}
