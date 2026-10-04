import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createClinicService } from './service.mjs';
import { routePrototypeApi } from './http-api.mjs';

export const PORT = Number(process.env.META_CLINIC_PANEL_PORT || 3323);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error('Invalid panel port.');
const origin = `http://127.0.0.1:${PORT}`;
const runtimeDir = join(process.env.LOCALAPPDATA || homedir(), 'MetaClinicCodex');
const statePath = join(runtimeDir, `connection-${PORT}.json`);
const root = dirname(fileURLToPath(import.meta.url));
const VERSION = '0.3.0';
// Generated once per stdio process and carried only in authenticated headers.
const connectionId = randomBytes(32).toString('hex');
const match = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function startBroker() {
  const token = randomBytes(32).toString('hex');
  const connections = new Map();
  const browsers = new Map();
  const handoffs = new Map();
  const cookieName = 'meta_clinic_panel_session';
  const lifetime = 8 * 60 * 60 * 1000;
  const handoffLifetime = 5 * 60 * 1000;
  const sweep = () => {
    const now = Date.now();
    for (const [key, entry] of handoffs) if (entry.expires <= now) handoffs.delete(key);
    for (const store of [connections, browsers]) for (const [key, entry] of store) if (entry.expires <= now) store.delete(key);
  };
  const connection = id => {
    if (!/^[a-f0-9]{64}$/.test(id || '')) throw new Error('Invalid private connection identifier.');
    let entry = connections.get(id);
    if (!entry) {
      if (connections.size >= 256) throw new Error('Too many local connections. Close unused sessions and restart the broker.');
      entry = { expires: Date.now() + lifetime, handoff: null };
      entry.service = createClinicService({ links: { loginUrl: () => {
        if (!entry.handoff || !handoffs.has(entry.handoff)) {
          entry.handoff = randomBytes(32).toString('hex');
          handoffs.set(entry.handoff, { entry, expires: Date.now() + handoffLifetime });
        }
        return `${origin}/sign-in?handoff=${entry.handoff}`;
      } } });
      connections.set(id, entry);
    }
    entry.expires = Date.now() + lifetime;
    return entry;
  };
  const browserSession = (req, res, create = false) => {
    const cookie = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='));
    const id = cookie?.slice(cookieName.length + 1);
    let entry = /^[a-f0-9]{64}$/.test(id || '') ? browsers.get(id) : null;
    if (!entry && create) {
      if (browsers.size >= 256) throw new Error('Too many browser sessions. Close unused sessions and restart the broker.');
      const nextId = randomBytes(32).toString('hex');
      entry = { service: createClinicService(), linked: null, pending: null, expires: Date.now() + lifetime };
      browsers.set(nextId, entry);
      res.setHeader('Set-Cookie', `${cookieName}=${nextId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${lifetime / 1000}`);
    }
    if (entry) entry.expires = Date.now() + lifetime;
    return entry;
  };
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.headers.host !== `127.0.0.1:${PORT}`) return reply(403, { error: 'Use the configured loopback origin.' });
    if (req.headers.origin && req.headers.origin !== origin) return reply(403, { error: 'Use the configured panel origin.' });
    let url;
    try { url = new URL(req.url, origin); } catch { return reply(400, { error: 'Invalid route.' }); }
    if (url.origin !== origin) return reply(403, { error: 'Use the configured panel origin.' });
    const internal = match(req.headers.authorization, `Bearer ${token}`);
    const browser = req.headers['x-meta-clinic-ui'] === '1' && (req.headers.origin === origin || (req.method === 'GET' && req.headers['sec-fetch-site'] === 'same-origin'));
    // Cross-site navigation can open a public page or an explicit handoff.
    // Data routes and mutations require same-origin browser or private auth.
    if (req.headers['sec-fetch-site'] === 'cross-site' && (!['GET', 'HEAD'].includes(req.method) || !['/', '/sign-in', '/tutorial.html'].includes(url.pathname))) return reply(403, { error: 'Open this route from the clinic panel.' });
    sweep();
    if (url.pathname === '/health' && req.method === 'GET') return reply(200, { app: 'meta-clinic-codex', version: VERSION });
    if (url.pathname === '/auth/sign-in' && req.method === 'POST') {
      if (req.headers.origin !== origin || req.headers['x-meta-clinic-ui'] !== '1') return reply(403, { error: 'Open the sign-in page from your local clinic panel.' });
      try {
        const session = browserSession(req, res);
        if (!session) return reply(401, { error: 'Open the sign-in page again to start a browser session.' });
        if (session.pending && session.pending.expires <= Date.now()) {
          return reply(401, { error: 'The connection link expired. Return to Codex and open Sign in again.' });
        }
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 4096) return reply(413, { error: 'Sign-in request is too large.' });
        }
        const input = JSON.parse(body);
        if (typeof input?.email_address !== 'string' || typeof input?.password !== 'string' || input.email_address.length > 254 || Buffer.byteLength(input.password) > 72 || !input.password)
          return reply(400, { error: 'Enter your account email and password.' });
        const target = session.pending?.entry || null;
        const signedIn = await (target?.service || session.service).signIn({ email_address: input.email_address, password: input.password });
        input.password = undefined;
        session.linked = target;
        session.pending = null;
        return reply(200, signedIn);
      } catch (error) {
        return reply(error.status === 429 ? 429 : 401, { error: error.status === 429 ? 'Too many sign-in attempts. Try again in five minutes.' : error.message || 'Sign-in could not be completed. Confirm your account and clinic access.' });
      }
    }
    if ((url.pathname === '/tools/call' && req.method === 'POST') || url.pathname.startsWith('/api/v1/')) {
      if (!internal && !browser) return reply(403, { error: 'Use the signed-in panel or its private broker connection.' });
      try {
        const session = internal ? connection(req.headers['x-meta-clinic-connection']) : browserSession(req, res);
        if (!session) return reply(401, { error: 'Open the clinic panel again to start a browser session.' });
        const service = session.linked?.service || session.service;
        if (session.linked) session.linked.expires = Date.now() + lifetime;
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 512 * 1024) return reply(413, { error: 'Request is too large.' });
        }
        const input = body ? JSON.parse(body) : {};
        if (url.pathname === '/tools/call') {
          if (!input || typeof input.name !== 'string' || !input.arguments || typeof input.arguments !== 'object' || Array.isArray(input.arguments)) return reply(400, { error: 'Invalid tool request.' });
          return reply(200, await service.callTool(input.name, input.arguments, PORT));
        }
        const result = await routePrototypeApi(req.method, url, input, PORT, service);
        if (!result) return reply(404, { error: 'Unknown prototype route or method.' });
        const status = result.isError ? (Number(result.structuredContent?.status) || 400) : 200;
        return reply(status, result);
      } catch (error) { return reply(400, { error: error.message || 'Invalid clinic request.' }); }
    }
    if (req.method !== 'GET') return reply(405, { error: 'Method not allowed.' });
    try {
      const path = url.pathname;
      const allowed = path === '/' ? 'panel.html' : path === '/sign-in' ? 'sign-in.html' : path === '/tutorial.html' ? 'tutorial.html' : path === '/openapi.json' ? 'openapi.json' : /^\/screenshots\/[a-z0-9-]+\.(png|jpg)$/.test(path) ? path.slice(1) : null;
      if (!allowed) return reply(404, { error: 'Page not found.' });
      if (path === '/' || path === '/sign-in') {
        const session = browserSession(req, res, true);
        if (path === '/sign-in') {
          const key = url.searchParams.get('handoff');
          if (key) {
            const handoff = handoffs.get(key);
            if (!handoff || handoff.expires <= Date.now()) return reply(401, { error: 'This connection link expired or was already opened. Return to Codex and open Sign in again.' });
            handoffs.delete(key);
            handoff.entry.handoff = null;
            session.pending = handoff;
          } else {
            session.pending = null;
          }
          // A normal browser sign-in switches only its independent account.
          session.linked = null;
        }
      }
      const full = resolve(root, allowed);
      if (!full.startsWith(root + sep)) return reply(403, { error: 'Invalid page.' });
      const bytes = await readFile(full);
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      res.writeHead(200, { 'Content-Type': full.endsWith('.png') ? 'image/png' : full.endsWith('.jpg') ? 'image/jpeg' : full.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' });
      res.end(bytes);
    } catch { reply(404, { error: 'Build the panel and tutorial before opening this page.' }); }
  });
  server.requestTimeout = 35000;
  server.headersTimeout = 10000;
  server.on('error', error => { console.error(`Meta Clinic panel could not start: ${error.code || 'startup failed'}`); process.exitCode = 1; });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(PORT, '127.0.0.1', resolveListen); });
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(statePath, JSON.stringify({ pid: process.pid, port: PORT, token, version: VERSION }), { mode: 0o600 });
  console.error(`Meta Clinic panel listening at ${origin}`);
}

async function existing() {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const response = await fetch(origin + '/health', { signal: AbortSignal.timeout(1000), redirect: 'error' });
    const data = await response.json();
    if (response.ok && data.app === 'meta-clinic-codex') {
      if (data.version !== VERSION) {
        const error = new Error('An older Meta Clinic panel is running. Stop the plugin runtime with its runtime helper, then start it again.');
        error.code = 'PLUGIN_VERSION_CHANGED';
        throw error;
      }
      if (data.version === state.version) return state;
    }
  } catch (error) { if (error.code === 'PLUGIN_VERSION_CHANGED') throw error; }
  return null;
}

export async function ensureBroker() {
  const state = await existing();
  if (state) return state;
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--daemon'], { detached: true, windowsHide: true, stdio: 'ignore', env: process.env });
  child.unref();
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolveWait => setTimeout(resolveWait, 200));
    const ready = await existing();
    if (ready) return ready;
  }
  throw new Error(`The local plugin panel could not start on port ${PORT}. Check for another process using that port.`);
}

export async function brokerCall(name, args) {
  const state = await ensureBroker();
  const response = await fetch(origin + '/tools/call', { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'X-Meta-Clinic-Connection': connectionId, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args || {} }), redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('The local plugin connection is unavailable. Reopen the panel.');
  return response.json();
}

// Bundling moves this module into server.mjs, whose entry point starts the broker.
// Only the unbundled broker module needs its own direct-entry startup.
if (import.meta.url.endsWith('/broker.mjs') && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--daemon')) await startBroker();
