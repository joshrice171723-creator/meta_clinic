// The API owns identity, scope, authorization, transactions and persistence.
export function localOrigin(value, fallback) {
  const url = new URL(value || fallback);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('Meta Clinic for Codex requires an http://127.0.0.1:<port> origin. Hosted connections are disabled.');
  return url.origin;
}

export class ClinicClient {
  constructor() {
    this.baseUrl = localOrigin(process.env.META_CLINIC_API_URL, 'http://127.0.0.1:3311');
    this.webUrl = localOrigin(process.env.META_CLINIC_WEB_URL, 'http://127.0.0.1:3310');
    this.cookies = new Map();
    this.csrf = null;
    this.context = null;
    this.user = null;
    this.configuration = null;
    this.generation = 0;
    this.authMode = 'account';
    this.developmentAccountsEnabled = process.env.META_CLINIC_ENABLE_DEVELOPMENT_ACCOUNTS === '1';
  }

  clearSession() {
    this.cookies.clear();
    this.csrf = null;
    this.context = null;
    this.user = null;
    this.configuration = null;
    this.authMode = 'account';
    this.generation++;
  }

  async request(path, { method = 'GET', body, scoped = true } = {}) {
    if (!path.startsWith('/api/') || path.includes('..') || path.includes('\\') || /[\r\n]/.test(path)) throw new Error('Invalid API path.');
    if (method !== 'GET' && !this.csrf) throw new Error('Reconnect your account before making changes.');
    const context = this.context;
    const headers = {
      Accept: 'application/json',
      Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': this.csrf, Origin: this.baseUrl }),
      ...(scoped && context ? { 'X-Clinic-Actor': String(context.user_id), 'X-Clinic-Practice': String(context.practice.id), ...(context.current_site ? { 'X-Clinic-Site': String(context.current_site.id) } : {}) } : {}),
    };
    let response;
    try {
      response = await fetch(this.baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30000) });
    } catch {
      if (path === '/api/session' && method === 'POST') throw new Error('Sign-in could not be confirmed because the local clinic API did not respond. Check the local runtime and sign in again.');
      throw new Error(method === 'GET' ? 'The local Meta Clinic API is unavailable. Start the plugin runtime and reconnect.' : 'The save outcome could not be confirmed. Inspect the record before preparing another change; this request will not be replayed.');
    }
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const index = pair.indexOf('=');
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    if (response.status === 401) this.clearSession();
    if (response.status === 204) return null;
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(response.ok ? 'The API response could not be confirmed. Inspect the record before retrying.' : `The local API returned HTTP ${response.status}. Reconnect or check the runtime.`); }
    if (!response.ok) {
      const error = new Error(data.error || data.message || `Meta Clinic returned HTTP ${response.status}.`);
      error.code = data.code;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async configure() {
    const configuration = await this.request('/api/csrf', { scoped: false });
    // Fail closed if someone accidentally points the bridge at a forwarded hosted service.
    if (!configuration.development_login || configuration.environment !== 'development' || configuration.public_demo_owner_pin_required)
      throw new Error('This connection must use the isolated local development runtime. Hosted demo access is disabled.');
    this.csrf = configuration.csrf_token;
    this.configuration = configuration;
    return configuration;
  }

  profiles() {
    if (!this.developmentAccountsEnabled) return [];
    return (this.configuration?.development_accounts || []).filter(p => ['employee', 'omni'].includes(p.account_type));
  }

  async signIn({ email_address, password } = {}) {
    // A new identity must not inherit the former account's cookies, context or tickets.
    this.clearSession();
    try {
      if (typeof email_address !== 'string' || typeof password !== 'string') throw new Error('Enter an email address and password.');
      const email = email_address.trim().toLowerCase();
      const encoder = new TextEncoder();
      if (!email || encoder.encode(email).length > 254 || !password || encoder.encode(password).length > 72)
        throw new Error('Enter a valid email address and a password of at most 72 bytes.');
      await this.configure();
      await this.request('/api/session', { method: 'POST', scoped: false, body: { email_address: email, password } });
      // Rails replaces the session on sign-in. Obtain its new CSRF state before scope reads.
      await this.configure();
      await this.refreshContext();
      this.authMode = 'account';
      return this.snapshot();
    } catch (error) {
      this.clearSession();
      throw error;
    } finally {
      password = undefined;
      email_address = undefined;
    }
  }

  async refreshContext() {
    try {
    const session = await this.request('/api/session', { scoped: false });
    const next = await this.request('/api/clinic/context', { scoped: false });
    if (!session.user?.id || String(session.user.id) !== String(next.user_id)) {
      this.clearSession();
      throw new Error('The account changed while connecting. Sign in again before continuing.');
    }
    const previous = this.context;
    if (previous && [previous.user_id, previous.practice?.id, previous.current_site?.id, previous.authorization_generation].join(':') !== [next.user_id, next.practice?.id, next.current_site?.id, next.authorization_generation].join(':')) this.generation++;
    this.user = session.user;
    this.context = next;
    return next;
    } catch (error) {
      if (error.status === 401 || error.status === 403) this.clearSession();
      throw error;
    }
  }

  async connect({ profile, practice_id, site_id, disconnect } = {}) {
    if (profile && !this.developmentAccountsEnabled) throw new Error('Development account selection is disabled. Sign in with your clinic account.');
    if (disconnect) {
      try {
        if (this.csrf) await this.request('/api/session', { method: 'DELETE', scoped: false });
      } finally {
        this.clearSession();
      }
    }
    await this.configure();
    if (profile) {
      const account = this.profiles().find(p => p.id === profile);
      if (!account) throw new Error('Select an available clinic account from the connection panel.');
      practice_id ||= account.clinic?.id ? String(account.clinic.id) : undefined;
      this.clearSession();
      try {
        await this.configure();
        await this.request('/api/development_session', { method: 'POST', scoped: false, body: { profile, portal: 'clinic', ...(practice_id ? { practice_id } : {}), ...(site_id ? { site_id } : {}) } });
        await this.configure();
        await this.refreshContext();
        this.authMode = 'development';
      } catch (error) {
        this.clearSession();
        throw error;
      }
    } else if (!disconnect && this.user) {
      await this.refreshContext();
      if (practice_id) {
        await this.request('/api/clinic/context', { method: 'PATCH', body: { practice_id } });
        this.generation++;
        await this.refreshContext();
      }
      if (site_id) {
        await this.request('/api/clinic/context', { method: 'PATCH', body: { site_id } });
        this.generation++;
        await this.refreshContext();
      }
    }
  }

  snapshot() {
    const profile = this.profiles().find(p => p.id === this.user?.development_account_id);
    return {
      connected: Boolean(this.context && this.user), baseUrl: this.baseUrl, webUrl: this.webUrl,
      authMode: this.authMode, developmentAccountsEnabled: this.developmentAccountsEnabled,
      actor: this.user ? { id: this.user.id, label: profile?.label || this.user.email_address } : null,
      practice: this.context?.practice || null,
      site: this.context?.current_site || null,
      profiles: this.profiles(), business_date: this.configuration?.business_date,
    };
  }
}
