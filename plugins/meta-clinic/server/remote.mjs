import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createStorage } from './storage.mjs';
import { createOAuth, parseClients, digest } from './oauth.mjs';
import { ClinicClient } from './client.mjs';
import { createClinicService } from './service.mjs';
import { createEventService } from './events.mjs';
import { createConnectorAudit } from './connector-audit.mjs';

const error = (message, status = 400) => Object.assign(new Error(message), { status });
async function readBody(req, limit = 512 * 1024) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > limit) throw error('Request is too large.', 413);
  }
  return body;
}

export function remoteConfiguration(env = process.env) {
  const development = env.META_CLINIC_REMOTE_DEVELOPMENT === '1';
  const url = new URL(env.META_CLINIC_CONNECTOR_ORIGIN || 'http://127.0.0.1:3330');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    !(url.protocol === 'https:' || (development && url.protocol === 'http:' && url.hostname === '127.0.0.1')))
    throw new Error('Configure the exact HTTPS connector origin. Loopback HTTP requires explicit remote-development mode.');
  const port = Number(env.META_CLINIC_CONNECTOR_PORT || 3330);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid connector port.');
  const connectionMode = env.META_CLINIC_CONNECTION_MODE || (development ? 'local' : 'hosted');
  if (!development && connectionMode !== 'hosted') throw new Error('A public connector must use the approved hosted clinic backend.');
  const eventsEnabled = env.META_CLINIC_EVENTS_ENABLED === '1';
  // The TLS proxy must overwrite this header, never append client input.
  const clientIpHeader = env.META_CLINIC_TRUSTED_CLIENT_IP_HEADER?.toLowerCase();
  if ((!development && !clientIpHeader) || (clientIpHeader && !/^[a-z][a-z0-9-]{0,79}$/.test(clientIpHeader)))
    throw new Error('Configure a client-IP header overwritten by the trusted loopback TLS proxy.');
  const allowedCallbackOrigins = (env.META_CLINIC_EVENT_CALLBACK_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (eventsEnabled && !allowedCallbackOrigins.length) throw new Error('Configure verified event callback origins before enabling delivery.');
  const toolCallsPerClinicPerDay = Number(env.META_CLINIC_TOOL_CALLS_PER_CLINIC_PER_DAY || 0);
  if (!Number.isSafeInteger(toolCallsPerClinicPerDay) || toolCallsPerClinicPerDay < 0 || toolCallsPerClinicPerDay > 1000000)
    throw new Error('Invalid clinic daily tool-call limit.');
  return { origin: url.origin, development, port, connectionMode, eventsEnabled, allowedCallbackOrigins, clientIpHeader,
    toolCallsPerClinicPerDay,
    clients: parseClients(env.META_CLINIC_OAUTH_CLIENTS, { development }),
    storagePath: env.META_CLINIC_CONNECTOR_STORE, storageKey: env.META_CLINIC_CONNECTOR_KEY };
}

export async function startRemote(createMcpServer, requiredScopes, config = remoteConfiguration()) {
  const storage = createStorage({ path: config.storagePath, key: config.storageKey });
  const audit = createConnectorAudit({ storage, toolCallsPerClinicPerDay: config.toolCallsPerClinicPerDay });
  const services = new Map(), queues = new Map(), limits = new Map();
  const activeConnections = new Set(), blockedConnections = new Set();
  const createService = () => createClinicService({ client: new ClinicClient({ connectionMode: config.connectionMode }),
    links: { loginUrl: config.origin + '/connect', tutorialUrl: config.origin + '/tutorial.html', demoEnabled: false } });
  const persistConnection = async (id, service, fields) => {
    const prior = storage.get('connection', id);
    storage.set('connection', id, { ...prior, ...fields, session: service.client.exportSession() });
    services.set(id, service);
  };
  const validConnection = id => {
    if (blockedConnections.has(id)) return null;
    const record = storage.get('connection', id);
    return record && !record.revoked && record.expires > Date.now() &&
      (!record.recovery_required || activeConnections.has(id)) ? record : null;
  };
  const resolveConnection = async (id, { detached = false } = {}) => {
    const record = validConnection(id);
    if (!record) { services.delete(id); return null; }
    if (!detached && services.has(id)) return services.get(id);
    const service = createService();
    service.client.importSession(record.session);
    if (!detached) services.set(id, service);
    return service;
  };
  const revokeConnection = async id => {
    const record = storage.get('connection', id);
    const service = services.get(id) || (record?.session ? await resolveConnection(id) : null);
    if (record) { record.revoked = true; record.session = null; storage.set('connection', id, record); }
    try { if (service?.client.csrf) await service.client.request('/api/session', { method: 'DELETE', scoped: false }); } catch { /* Connector revocation is already effective; never replay a failed logout. */ }
    service?.client.clearSession(); services.delete(id);
  };
  const oauth = createOAuth({ ...config, storage, createService, persistConnection, revokeConnection });
  const blockConnection = (id, service) => {
    blockedConnections.add(id);
    service?.client.clearSession(); services.delete(id);
  };
  const withConnection = (id, action) => {
    const run = (queues.get(id) || Promise.resolve()).then(async () => {
      let service;
      try { service = await resolveConnection(id); }
      catch { throw error('Connector session storage is unavailable. Reconnect after it is restored.', 503); }
      if (!service) throw error('Reconnect your Meta Clinic account.', 401);
      try {
        storage.transaction(() => {
          const record = validConnection(id);
          if (!record) throw error('Reconnect your Meta Clinic account.', 401);
          // Leave a durable fence before dispatch. If the process stops or a
          // final save fails, restart must not restore the previous cookie state.
          storage.set('connection', id, { ...record, recovery_required: true });
        });
        activeConnections.add(id);
      } catch (failure) {
        blockConnection(id, service);
        throw error(failure.status === 401 ? 'Reconnect your Meta Clinic account.' :
          'Connector session storage is unavailable. No clinic action was dispatched.', failure.status === 401 ? 401 : 503);
      }
      let result;
      try { return result = await action(service); }
      finally {
        try {
          // Revocation during an in-flight call must never be undone by its save.
          const record = storage.get('connection', id);
          if (record && !record.revoked && record.expires > Date.now())
            await persistConnection(id, service, { ...record, recovery_required: false });
        } catch {
          // Preserve the exact clinic response/receipt. A failed session save
          // never turns a confirmed write into a failed action or a replay.
          blockConnection(id, service);
          console.error('Connector session save failed; this connection is blocked until account reconnection.');
          if (result) {
            const warning = { session_saved: false, reconnect_required: true };
            if (result.jsonrpc) {
              if (result.result) result.result._meta = { ...result.result._meta, connection_persistence: warning };
            } else {
              result._meta = { ...result._meta, connection_persistence: warning };
              if (Array.isArray(result.content)) result.content.push({ type: 'text', text: 'The connector could not save its session. The clinic response above is preserved. Reconnect before another action; inspect the record before repeating a change.' });
            }
          }
        } finally { activeConnections.delete(id); }
      }
    });
    const settled = run.catch(() => {});
    queues.set(id, settled);
    void settled.finally(() => { if (queues.get(id) === settled) queues.delete(id); });
    return run;
  };
  const events = config.eventsEnabled ? createEventService({ storage, allowedCallbackOrigins: config.allowedCallbackOrigins,
    resolveConnection: id => validConnection(id)?.scopes.includes('clinic:events') ? resolveConnection(id, { detached: true }) : null }) : null;

  async function audited(grant, tool, operation, action) {
    const ticket = audit.begin({ connectionId: grant.connectionId, clientId: grant.client_id, tool, operation });
    let result, outcome = 'error', denial;
    const denied = failure => failure.status === 401 ? 'authentication' : failure.status === 403 || failure.code === -32012 ? 'permissions' :
      failure.status === 429 ? (failure.code === 'clinic_tool_call_limit' ? 'clinic_limit' : 'request_limit') : failure.status === 409 ? 'context_changed' : undefined;
    try {
      result = await action(ticket);
      const status = result.structuredContent?.status;
      denial = denied(result.error || { status, code: result.structuredContent?.code });
      outcome = result.isError || result.error ? (denial ? 'denied' :
        tool === 'meta_clinic_apply_change' && ticket.operationRecorded && !status ? 'unconfirmed' : 'error') : 'success';
      return result;
    } catch (failure) {
      denial = denied(failure);
      outcome = denial ? 'denied' : tool === 'meta_clinic_apply_change' && ticket.operationRecorded && !failure.status ? 'unconfirmed' : 'error';
      if ([401, 403].includes(failure.status) && !failure.challenge)
        failure.challenge = oauth.challenge(tool.startsWith('events/') ? ['clinic:read', 'clinic:events'] : requiredScopes(tool));
      throw failure;
    } finally {
      try { audit.finish(ticket, outcome, denial); }
      catch {
        // A final audit failure cannot undo a confirmed clinic write. Preserve
        // that response and its uncertainty instead of encouraging a replay.
        console.error('Connector final audit outcome could not be recorded; inspect the clinic record before repeating a change.');
        if (result) {
          result._meta = { ...result._meta, connector_audit: { final_outcome_recorded: false } };
          if (Array.isArray(result.content)) result.content.push({ type: 'text', text: 'The connector could not record the final audit outcome. Inspect the clinic record before repeating a change.' });
        }
      }
    }
  }

  function rateLimit(req, path) {
    if (!path.startsWith('/oauth/')) return;
    const address = config.clientIpHeader ? req.headers[config.clientIpHeader] : req.socket.remoteAddress;
    if (typeof address !== 'string' || !isIP(address)) throw error('Invalid proxy client address.', 403);
    const key = `${address}:${path}`;
    const now = Date.now(), previous = limits.get(key);
    const record = previous && previous.until > now ? previous : { count: 0, until: now + 300000 };
    record.count++; limits.set(key, record);
    if (record.count > (path === '/oauth/authorize' ? 30 : 120)) throw error('Too many authorization requests. Try again shortly.', 429);
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const reply = (status, body, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body);
    };
    try {
      // Bind to loopback behind a TLS proxy that preserves the configured Host.
      // Never infer public identity or origin from arbitrary forwarded headers.
      if (req.headers.host !== new URL(config.origin).host) throw error('Invalid connector host.', 403);
      const url = new URL(req.url, config.origin), path = url.pathname;
      if (req.headers.origin && req.headers.origin !== config.origin) throw error('Cross-origin requests are not allowed.', 403);
      rateLimit(req, path);
      if (req.method === 'GET') {
        const metadata = oauth.metadata(path);
        if (metadata) return reply(200, metadata);
        if (path === '/health') return reply(200, { app: 'meta-clinic-connector', version: '0.3.0', events: Boolean(events) });
        if (path === '/oauth/authorize') {
          const page = oauth.begin(url.searchParams);
          res.setHeader('Set-Cookie', page.cookie); return reply(200, page.html, 'text/html; charset=utf-8');
        }
        if (path === '/connect' || path === '/') return reply(200, '<!doctype html><html lang="en"><meta charset="utf-8"><title>Meta Clinic connection</title><main><h1>Connect your Meta Clinic account</h1><p>Open your host’s plugin settings, choose Meta Clinic, and connect or reconnect your account. Each connection has its own clinic permissions.</p></main></html>', 'text/html; charset=utf-8');
        if (path === '/tutorial.html' || /^\/screenshots\/[a-z0-9-]+\.(jpg|png)$/.test(path)) {
          res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
          const file = path === '/tutorial.html' ? 'tutorial.html' : path.slice(1);
          const data = await readFile(new URL('./' + file, import.meta.url));
          return reply(200, data, file.endsWith('.jpg') ? 'image/jpeg' : file.endsWith('.png') ? 'image/png' : 'text/html; charset=utf-8');
        }
      }
      if (req.method === 'POST' && ['/oauth/authorize', '/oauth/token', '/oauth/revoke'].includes(path)) {
        if (!(req.headers['content-type'] || '').startsWith('application/x-www-form-urlencoded')) throw error('Use a form-encoded authorization request.', 415);
        const form = new URLSearchParams(await readBody(req, 16384));
        if (path === '/oauth/authorize') {
          const result = await oauth.finish(req, form);
          res.writeHead(303, { Location: result.location, 'Set-Cookie': result.cookie }); return res.end();
        }
        const result = path === '/oauth/token' ? oauth.exchange(form) : await oauth.revoke(form);
        return reply(result.error ? 400 : 200, result);
      }
      if (path !== '/mcp') return reply(404, { error: 'not_found' });
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, { error: 'method_not_allowed' }); }
      const grant = oauth.authenticate(req);
      if (!(req.headers['content-type'] || '').startsWith('application/json')) throw error('Use an application/json MCP request.', 415);
      const message = JSON.parse(await readBody(req));
      if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') throw error('Invalid JSON-RPC request.');
      if (message.method === 'server/discover') return reply(200, { jsonrpc: '2.0', id: message.id, result: {
        resultType: 'complete', supportedVersions: ['2026-07-28'], serverInfo: { name: 'meta-clinic', version: '0.3.0' },
        capabilities: { tools: {}, resources: {}, ...(events ? { events: {} } : {}) },
      } });
      if (message.method.startsWith('events/')) {
        if (!events) return reply(200, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Events are not enabled on this connector.' } });
        if (!['events/list', 'events/subscribe', 'events/unsubscribe'].includes(message.method))
          return reply(200, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported event method.' } });
        return reply(200, await audited(grant, message.method, null, ticket => withConnection(grant.connectionId, async service => {
          oauth.authenticate(req, ['clinic:read', 'clinic:events']);
          await service.client.refreshContext();
          oauth.authenticate(req, ['clinic:read', 'clinic:events']);
          audit.attribute(ticket, service.client.context, service.client.user, service.client.baseUrl);
          return events.handle(message, { connectionId: grant.connectionId });
        })));
      }
      const mcp = createMcpServer(async (name, args) => {
        return audited(grant, name, args.operation, ticket => withConnection(grant.connectionId, async service => {
          // Consent or token validity may change while an earlier request owns
          // this connection's queue. Check again at execution time.
          try { oauth.authenticate(req, requiredScopes(name)); }
          catch (failure) { failure.challenge = oauth.challenge(requiredScopes(name)); throw failure; }
          await service.client.refreshContext();
          // The backend refresh yields, so token revocation and scope changes
          // must be checked again before metered admission or tool dispatch.
          try { oauth.authenticate(req, requiredScopes(name)); }
          catch (failure) { failure.challenge = oauth.challenge(requiredScopes(name)); throw failure; }
          audit.attribute(ticket, service.client.context, service.client.user, service.client.baseUrl);
          if (name === 'meta_clinic_demo_action') throw error('Use a separate local demo connection. A linked clinic account cannot be replaced with a demo identity.', 403);
          if (name === 'meta_clinic_connection' && args.profile) throw error('Reconnect through account authorization to use a different identity.', 403);
          if (name === 'meta_clinic_profile') {
            const key = digest(`${service.client.baseUrl}:${service.client.user.id}`);
            let profile = storage.get('profile', key);
            if (!profile) { profile = { id: randomUUID() }; storage.set('profile', key, profile); }
            const data = { id: profile.id, email: service.client.user.email_address,
              nickname: service.client.context?.practice?.name || 'Meta Clinic' };
            return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
          }
          const result = await service.callTool(name, args, config.port, { authorizeOperation: operation => {
            audit.operation(ticket, operation, service.client.context);
            const scopes = [...requiredScopes(name), ...(operation.path === '/api/clinic/context' && operation.method !== 'GET' ? ['clinic:context'] : [])];
            oauth.authenticate(req, scopes);
          } });
          if (name === 'meta_clinic_connection' && args.disconnect) await revokeConnection(grant.connectionId);
          if (result.isError && [401, 403].includes(result.structuredContent?.status))
            result._meta = { ...result._meta, 'mcp/www_authenticate': [oauth.challenge(result.structuredContent.required_scopes || ['clinic:read'])] };
          return result;
        }));
      }, { remote: true });
      res.once('close', () => { void mcp.close(); });
      if (req.headers['mcp-protocol-version'] === '2026-07-28') {
        // MCP 2 discovery/events coexist with the SDK's tool/resource handlers.
        // Use a request-local transport so clients never share protocol state.
        if (!['tools/list', 'tools/call', 'resources/list', 'resources/read', 'resources/templates/list', 'ping'].includes(message.method))
          return reply(200, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Unsupported method.' } });
        const transport = { start: async () => {}, close: async () => {}, send: async value => { if (!res.writableEnded) reply(200, value); } };
        await mcp.connect(transport);
        if (message.id === undefined) { await mcp.close(); return reply(202, {}); }
        transport.onmessage(message);
      } else {
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        await mcp.connect(transport);
        await transport.handleRequest(req, res, message);
      }
    } catch (failure) {
      if (res.headersSent) { res.end(); return; }
      const status = Number(failure.status) || 400;
      if (status === 401 || status === 403) res.setHeader('WWW-Authenticate', oauth.challenge(failure.scopes || ['clinic:read']));
      if (status === 429) res.setHeader('Retry-After', '300');
      // Never echo backend bodies, stack traces, credentials or OAuth parameters.
      reply(status, { error: failure.code || (status === 401 ? 'invalid_token' : status === 403 ? 'access_denied' : 'invalid_request') });
    }
  });
  server.requestTimeout = 35000; server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, '127.0.0.1', resolve); });
  let ticking = false;
  const timer = setInterval(async () => {
    if (ticking) return; ticking = true;
    try {
      oauth.cleanup();
      audit.cleanup();
      for (const [key, value] of limits) if (value.until < Date.now()) limits.delete(key);
      for (const { key, value } of storage.list('connection')) if (value.revoked || value.expires < Date.now()) {
        services.delete(key); blockedConnections.delete(key); storage.delete('connection', key);
      }
      await events?.tick();
    } catch { console.error('Connector maintenance needs attention; event delivery will retry within its configured limits.'); }
    finally { ticking = false; }
  }, 30000);
  timer.unref();
  console.error(`Meta Clinic connector listening on loopback port ${config.port}; configured external origin ${config.origin}`);
  return { server, close: async () => { clearInterval(timer); await new Promise(resolve => server.close(resolve)); storage.close(); } };
}
