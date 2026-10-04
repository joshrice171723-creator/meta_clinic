import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const CONNECTOR_SCOPES = {
  'clinic:read': 'Read clinic records available to your Meta Clinic account',
  'clinic:write': 'Prepare and apply clinic changes you authorize',
  'clinic:context': 'Select your authorized clinic or location and manage this connection',
  'clinic:events': 'Subscribe to permitted clinic record changes',
};
const random = () => randomBytes(32).toString('base64url');
export const digest = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fault = (code, status = 400) => Object.assign(new Error(code), { code, status });
const unique = (form, name) => {
  if (form.getAll(name).length !== 1) throw fault('invalid_request');
  return form.get(name);
};

// Predefined public OAuth clients are a supported MCP registration option.
// Registration is operator-owned; a request cannot nominate its own callback.
export function parseClients(value, { development = false } = {}) {
  const clients = JSON.parse(value || '[]');
  if (!Array.isArray(clients) || !clients.length) throw new Error('Configure at least one predefined OAuth client.');
  const result = new Map();
  for (const client of clients) {
    if (!client || typeof client.client_id !== 'string' || !client.client_id || result.has(client.client_id) ||
      typeof client.name !== 'string' || !client.name || !Array.isArray(client.redirect_uris) || !client.redirect_uris.length)
      throw new Error('Invalid predefined OAuth client configuration.');
    for (const redirect of client.redirect_uris) {
      const url = new URL(redirect);
      if (url.username || url.password || url.hash || !(url.protocol === 'https:' || (development && url.protocol === 'http:' && url.hostname === '127.0.0.1')))
        throw new Error('OAuth redirect URIs must be exact HTTPS URLs.');
    }
    result.set(client.client_id, client);
  }
  return result;
}

export function createOAuth({ origin, storage, clients, createService, persistConnection, revokeConnection, development = false }) {
  const resource = origin + '/mcp';
  const cookieName = development ? 'mc_connector_authorization' : '__Host-mc_connector_authorization';
  const cookie = (value, age = 600) => `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${development ? '' : '; Secure'}`;
  const cookieValue = req => (req.headers.cookie || '').split(';').map(x => x.trim().split('=')).find(([name]) => name === cookieName)?.[1];
  const redirect = (transaction, values) => {
    const url = new URL(transaction.redirect_uri);
    for (const [key, value] of Object.entries({ ...values, state: transaction.state, iss: origin })) url.searchParams.set(key, value);
    return url.href;
  };
  const challenge = scopes => `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${scopes.join(' ')}"`;
  function metadata(path) {
    if (path === '/.well-known/oauth-protected-resource' || path === '/.well-known/oauth-protected-resource/mcp')
      return { resource, authorization_servers: [origin], scopes_supported: Object.keys(CONNECTOR_SCOPES), bearer_methods_supported: ['header'] };
    if (path === '/.well-known/oauth-authorization-server') return {
      issuer: origin, authorization_endpoint: origin + '/oauth/authorize', token_endpoint: origin + '/oauth/token',
      revocation_endpoint: origin + '/oauth/revoke', response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'], scopes_supported: Object.keys(CONNECTOR_SCOPES),
      authorization_response_iss_parameter_supported: true,
    };
    return null;
  }
  function begin(params) {
    const client_id = unique(params, 'client_id');
    const client = clients.get(client_id);
    const redirect_uri = unique(params, 'redirect_uri');
    if (!client || !client.redirect_uris.includes(redirect_uri)) throw fault('invalid_client');
    if (unique(params, 'response_type') !== 'code' || unique(params, 'resource') !== resource || unique(params, 'code_challenge_method') !== 'S256') throw fault('invalid_request');
    const state = unique(params, 'state'), code_challenge = unique(params, 'code_challenge');
    const scopes = [...new Set(unique(params, 'scope').split(' ').filter(Boolean))];
    if (!state || state.length > 2048 || !/^[A-Za-z0-9_-]{43}$/.test(code_challenge) || !scopes.includes('clinic:read') || scopes.some(scope => !CONNECTOR_SCOPES[scope])) throw fault('invalid_scope');
    const id = random(), browser = random(), csrf = random();
    const transaction = { client_id, redirect_uri, state, code_challenge, scopes, browserHash: digest(browser), csrfHash: digest(csrf), expires: Date.now() + 600000 };
    storage.set('authorization', digest(id), transaction);
    const checkboxes = scopes.map(scope => `<label class="permission"><input type="checkbox" name="granted_scope" value="${escape(scope)}" checked ${scope === 'clinic:read' ? 'disabled' : ''}> ${escape(CONNECTOR_SCOPES[scope])}</label>`).join('');
    return { cookie: cookie(browser), html: `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Connect Meta Clinic</title>
      <style>body{font:16px system-ui;background:#f3f6fb;color:#172b4d;margin:0;padding:32px}main{max-width:480px;margin:auto;background:white;padding:32px;border:1px solid #dbe2ef;border-radius:12px}h1{font-size:28px}label{display:block;margin:16px 0 6px}input:not([type=checkbox]){box-sizing:border-box;width:100%;padding:12px;border:1px solid #9aaac0;border-radius:6px;font:inherit}.permission{line-height:1.5}button{font:inherit;padding:12px 20px;margin:20px 8px 0 0;border:1px solid #2563eb;border-radius:6px;background:#2563eb;color:white}.cancel{background:white;color:#172b4d}small{display:block;margin-top:20px;color:#44546f}</style>
      <main><h1>Connect Meta Clinic</h1><p><strong>${escape(client.name)}</strong> requests access to your clinic account.</p><p>Your existing clinic permissions apply to every action.</p>
      <form method="post" action="/oauth/authorize"><input type="hidden" name="transaction" value="${id}"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="granted_scope" value="clinic:read">
      <label for="email">Meta Clinic email</label><input id="email" name="email_address" type="email" autocomplete="username" maxlength="254" required>
      <label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
      <fieldset><legend>Allow this connection to</legend>${checkboxes}</fieldset><button name="decision" value="allow">Connect account</button><button class="cancel" name="decision" value="deny" formnovalidate>Cancel</button></form>
      <small>Credentials are submitted over this connection to Meta Clinic. Never enter a password in chat. Disconnecting revokes this connector's access.</small></main></html>` };
  }
  async function finish(req, form) {
    if (req.headers.origin !== origin) throw fault('invalid_request', 403);
    const id = unique(form, 'transaction'), csrf = unique(form, 'csrf');
    const transaction = storage.get('authorization', digest(id));
    const browser = cookieValue(req);
    if (!transaction || transaction.expires < Date.now() || !browser || !equal(transaction.browserHash, digest(browser)) || !equal(transaction.csrfHash, digest(csrf))) throw fault('invalid_request', 403);
    // Consume before awaiting credentials: two submissions cannot authorize twice.
    storage.delete('authorization', digest(id));
    const decision = unique(form, 'decision');
    if (decision === 'deny') return { location: redirect(transaction, { error: 'access_denied' }), cookie: cookie('', 0) };
    if (decision !== 'allow') throw fault('invalid_request');
    const scopes = [...new Set(form.getAll('granted_scope'))];
    if (!scopes.includes('clinic:read') || scopes.some(scope => !transaction.scopes.includes(scope))) throw fault('invalid_scope');
    const service = createService();
    let credentials;
    try {
      credentials = { email_address: unique(form, 'email_address'), password: unique(form, 'password') };
      await service.signIn(credentials);
      if (!service.client.user || !service.client.context) throw fault('access_denied', 403);
      const connectionId = random(), code = random();
      await persistConnection(connectionId, service, { client_id: transaction.client_id, scopes, resource, expires: Date.now() + 12 * 60 * 60 * 1000, revoked: false });
      storage.set('code', digest(code), { connectionId, client_id: transaction.client_id, redirect_uri: transaction.redirect_uri, code_challenge: transaction.code_challenge, resource, scopes, expires: Date.now() + 60000 });
      return { location: redirect(transaction, { code }), cookie: cookie('', 0) };
    } catch {
      service.client.clearSession();
      return { location: redirect(transaction, { error: 'access_denied' }), cookie: cookie('', 0) };
    } finally { credentials = undefined; form.delete('password'); }
  }
  function issue(grant) {
    const access_token = random(), refresh_token = random();
    const record = { connectionId: grant.connectionId, client_id: grant.client_id, resource, scopes: grant.scopes };
    storage.set('access', digest(access_token), { ...record, expires: Date.now() + 900000 });
    storage.set('refresh', digest(refresh_token), { ...record, expires: Date.now() + 12 * 60 * 60 * 1000, used: false });
    return { access_token, token_type: 'Bearer', expires_in: 900, refresh_token, scope: grant.scopes.join(' ') };
  }
  function exchange(form) {
    const client_id = unique(form, 'client_id');
    if (!clients.has(client_id)) throw fault('invalid_client');
    if (unique(form, 'resource') !== resource) throw fault('invalid_target');
    return storage.transaction(() => {
      if (unique(form, 'grant_type') === 'authorization_code') {
        const id = digest(unique(form, 'code')), grant = storage.get('code', id);
        const verifier = unique(form, 'code_verifier');
        if (!grant || grant.expires < Date.now() || grant.client_id !== client_id || grant.resource !== resource || grant.redirect_uri !== unique(form, 'redirect_uri') ||
          !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !equal(grant.code_challenge, createHash('sha256').update(verifier).digest('base64url'))) throw fault('invalid_grant');
        storage.delete('code', id);
        const connection = storage.get('connection', grant.connectionId);
        if (!connection || connection.revoked || connection.expires < Date.now()) throw fault('invalid_grant');
        return issue(grant);
      }
      if (form.get('grant_type') !== 'refresh_token') throw fault('unsupported_grant_type');
      const id = digest(unique(form, 'refresh_token')), grant = storage.get('refresh', id);
      if (!grant || grant.client_id !== client_id || grant.resource !== resource || grant.expires < Date.now()) throw fault('invalid_grant');
      const connection = storage.get('connection', grant.connectionId);
      if (grant.used) {
        // Return the error after committing revocation, rather than rolling it back.
        if (connection) { connection.revoked = true; storage.set('connection', grant.connectionId, connection); }
        return { error: 'invalid_grant' };
      }
      if (!connection || connection.revoked || connection.expires < Date.now()) throw fault('invalid_grant');
      if (form.has('scope')) {
        const scopes = [...new Set(unique(form, 'scope').split(' ').filter(Boolean))];
        if (!scopes.includes('clinic:read') || scopes.some(scope => !grant.scopes.includes(scope))) throw fault('invalid_scope');
        grant.scopes = scopes;
        connection.scopes = scopes;
        storage.set('connection', grant.connectionId, connection);
      }
      storage.set('refresh', id, { ...grant, used: true });
      return issue(grant);
    });
  }
  function authenticate(req, scopes = ['clinic:read']) {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '');
    const grant = match && storage.get('access', digest(match[1]));
    const connection = grant && storage.get('connection', grant.connectionId);
    if (!grant || grant.resource !== resource || grant.expires < Date.now() || !connection || connection.revoked || connection.expires < Date.now()) throw fault('invalid_token', 401);
    if (scopes.some(scope => !grant.scopes.includes(scope) || !connection.scopes.includes(scope))) throw Object.assign(fault('insufficient_scope', 403), { scopes });
    return grant;
  }
  async function revoke(form) {
    const client_id = unique(form, 'client_id');
    if (!clients.has(client_id)) throw fault('invalid_client');
    const token = unique(form, 'token');
    const grant = storage.get('access', digest(token)) || storage.get('refresh', digest(token));
    if (grant?.client_id === client_id) await revokeConnection(grant.connectionId);
    return {};
  }
  function cleanup() {
    for (const kind of ['authorization', 'code', 'access', 'refresh'])
      for (const { key, value } of storage.list(kind)) if (value.expires < Date.now()) storage.delete(kind, key);
  }
  return { resource, metadata, begin, finish, exchange, authenticate, revoke, challenge, cleanup };
}
