const unavailable = 'Member services are not connected yet. Please check back soon.';
export const backendUnavailable = unavailable;
export function backendConfig(env: NodeJS.ProcessEnv = process.env) {
  const development = env.APP_RUNTIME === 'development' || env.NODE_ENV === 'development';
  const backend = env.RAILS_BACKEND_URL || (development ? 'http://127.0.0.1:3001' : '');
  const frontend = env.APP_SITE_ORIGIN || (development ? 'http://localhost:3000' : '');
  if (!backend || !frontend) throw new Error(unavailable);
  const target = new URL(backend);
  const origin = new URL(frontend);
  if (target.username || target.password || target.search || target.hash || target.pathname !== '/' ||
      !['http:', 'https:'].includes(target.protocol) || !['http:', 'https:'].includes(origin.protocol) ||
      (!development && (target.protocol !== 'https:' || origin.protocol !== 'https:'))) throw new Error(unavailable);
  return { backend: target.origin, frontend: origin.origin };
}
export function allowedEndpoint(path: string, method: string, env: NodeJS.ProcessEnv = process.env) {
  if (path === 'development_session') {
    if (method !== 'POST' || env.APP_RUNTIME !== 'development') return false;
    try {
      const config = backendConfig(env);
      return [config.frontend, config.backend].every(value => {
        const url = new URL(value);
        return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      });
    } catch { return false; }
  }
  return (method === 'GET' && /^(csrf|session|(?:materials|paperworks)(?:\/[1-9]\d*)?|inquiries)$/.test(path)) ||
    (method === 'POST' && /^(session|contact_messages)$/.test(path)) ||
    (method === 'POST' && /^(?:paperworks\/[1-9]\d*\/(?:start|sign)|materials\/[1-9]\d*\/(?:start|complete))$/.test(path)) ||
    (method === 'DELETE' && path === 'session');
}
export function sessionCookie(raw: string) {
  return raw.split(';').map(value => value.trim()).filter(value => value.startsWith('_apply_session=')).join('; ');
}
export async function railsRequest(path: string, init: RequestInit = {}) {
  const config = backendConfig();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-Forwarded-Host', new URL(config.frontend).host);
  headers.set('X-Forwarded-Proto', new URL(config.frontend).protocol.slice(0, -1));
  headers.set('Origin', config.frontend);
  const response = await fetch(`${config.backend}/api/${path}`, { ...init, headers, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(8000) });
  if (response.status >= 300 && response.status < 400) throw new Error('Unexpected backend redirect');
  return response;
}
