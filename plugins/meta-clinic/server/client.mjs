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
      throw new Error(method === 'GET' ? 'The local Meta Clinic API is unavailable. Start the plugin runtime and reconnect.' : 'The save outcome could not be confirmed. Inspect the record before preparing another change; this request will not be replayed.');
    }
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';', 1)[0];
      const index = pair.indexOf('=');
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    if (response.status === 204) return null;
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(response.ok ? 'The API response could not be confirmed. Inspect the record before retrying.' : `The local API returned HTTP ${response.status}. Reconnect or check the runtime.`); }
    if (!response.ok) {
      if (response.status === 401) { this.context = null; this.user = null; this.generation++; }
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
    return (this.configuration?.development_accounts || []).filter(p => ['employee', 'omni'].includes(p.account_type));
  }

  async refreshContext() {
    const session = await this.request('/api/session', { scoped: false });
    const next = await this.request('/api/clinic/context', { scoped: false });
    const previous = this.context;
    if (previous && [previous.user_id, previous.practice?.id, previous.current_site?.id, previous.authorization_generation].join(':') !== [next.user_id, next.practice?.id, next.current_site?.id, next.authorization_generation].join(':')) this.generation++;
    this.user = session.user;
    this.context = next;
    return next;
  }

  async connect({ profile, practice_id, site_id, disconnect } = {}) {
    if (disconnect) {
      if (this.csrf) await this.request('/api/session', { method: 'DELETE', scoped: false });
      this.cookies.clear(); this.csrf = null; this.context = null; this.user = null; this.generation++;
    }
    await this.configure();
    if (profile) {
      const account = this.profiles().find(p => p.id === profile);
      if (!account) throw new Error('Select an available clinic account from the connection panel.');
      practice_id ||= account.clinic?.id ? String(account.clinic.id) : undefined;
      this.context = null; this.user = null; this.generation++;
      await this.request('/api/development_session', { method: 'POST', scoped: false, body: { profile, portal: 'clinic', ...(practice_id ? { practice_id } : {}), ...(site_id ? { site_id } : {}) } });
      await this.configure();
      await this.refreshContext();
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
      actor: this.user ? { id: this.user.id, label: profile?.label || this.user.email_address } : null,
      practice: this.context?.practice || null,
      site: this.context?.current_site || null,
      profiles: this.profiles(), business_date: this.configuration?.business_date,
    };
  }
}
