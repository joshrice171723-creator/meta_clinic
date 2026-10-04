import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { callTool, signIn } from './service.mjs';
import { routePrototypeApi } from './http-api.mjs';

export const PORT = Number(process.env.META_CLINIC_PANEL_PORT || 3320);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error('Invalid panel port.');
const origin = `http://127.0.0.1:${PORT}`;
const runtimeDir = join(process.env.LOCALAPPDATA || homedir(), 'MetaClinicCodex');
const statePath = join(runtimeDir, `connection-${PORT}.json`);
const root = dirname(fileURLToPath(import.meta.url));
const match = (a, b) => typeof a === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function startBroker() {
  const token = randomBytes(32).toString('hex');
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.headers.host !== `127.0.0.1:${PORT}`) return reply(403, { error: 'Use the configured loopback origin.' });
    if (req.url === '/health' && req.method === 'GET') return reply(200, { app: 'meta-clinic-codex', version: '0.2.0' });
    if (req.url === '/auth/sign-in' && req.method === 'POST') {
      if (req.headers.origin !== origin || req.headers['x-meta-clinic-ui'] !== '1') return reply(403, { error: 'Open the sign-in page from your local clinic panel.' });
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 4096) return reply(413, { error: 'Sign-in request is too large.' });
        }
        const input = JSON.parse(body);
        if (typeof input?.email_address !== 'string' || typeof input?.password !== 'string' || input.email_address.length > 254 || Buffer.byteLength(input.password) > 72 || !input.password)
          return reply(400, { error: 'Enter your account email and password.' });
        const signedIn = await signIn({ email_address: input.email_address, password: input.password });
        return reply(200, signedIn);
      } catch (error) {
        return reply(error.status === 429 ? 429 : 401, { error: error.status === 429 ? 'Too many sign-in attempts. Try again in five minutes.' : 'Sign-in could not be completed. Check your email and password and confirm that your account has active clinic access.' });
      }
    }
    if (req.url === '/tools/call' && req.method === 'POST') {
      const internal = match(req.headers.authorization, `Bearer ${token}`);
      const browser = req.headers.origin === origin && req.headers['x-meta-clinic-ui'] === '1';
      if (!internal && !browser) return reply(403, { error: 'Open the panel from its local address.' });
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 512 * 1024) return reply(413, { error: 'Request is too large.' });
        }
        const message = JSON.parse(body);
        if (!message || typeof message.name !== 'string' || !message.arguments || typeof message.arguments !== 'object' || Array.isArray(message.arguments)) return reply(400, { error: 'Invalid tool request.' });
        return reply(200, await callTool(message.name, message.arguments, PORT));
      } catch { return reply(400, { error: 'Unable to read this request.' }); }
    }
    if (req.url.startsWith('/api/v1/')) {
      const internal = match(req.headers.authorization, `Bearer ${token}`);
      const browser = req.headers['x-meta-clinic-ui'] === '1' && (req.headers.origin === origin || (req.method === 'GET' && req.headers['sec-fetch-site'] === 'same-origin'));
      if (!internal && !browser) return reply(403, { error: 'Use the signed-in local panel or its broker connection.' });
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 512 * 1024) return reply(413, { error: 'Request is too large.' });
        }
        const result = await routePrototypeApi(req.method, new URL(req.url, origin), body ? JSON.parse(body) : {}, PORT);
        if (!result) return reply(404, { error: 'Unknown prototype route or method.' });
        const status = result.isError ? (Number(result.structuredContent?.status) || 400) : 200;
        return reply(status, result);
      } catch (error) { return reply(400, { error: error.message || 'Invalid prototype request.' }); }
    }
    if (req.method !== 'GET') return reply(405, { error: 'Method not allowed.' });
    try {
      const path = new URL(req.url, origin).pathname;
      const allowed = path === '/' ? 'panel.html' : path === '/sign-in' ? 'sign-in.html' : path === '/tutorial.html' ? 'tutorial.html' : path === '/openapi.json' ? 'openapi.json' : /^\/screenshots\/[a-z0-9-]+\.(png|jpg)$/.test(path) ? path.slice(1) : null;
      if (!allowed) return reply(404, { error: 'Page not found.' });
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
  await writeFile(statePath, JSON.stringify({ pid: process.pid, port: PORT, token, version: '0.2.0' }), { mode: 0o600 });
  console.error(`Meta Clinic panel listening at ${origin}`);
}

async function existing() {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const response = await fetch(origin + '/health', { signal: AbortSignal.timeout(1000), redirect: 'error' });
    const data = await response.json();
    if (response.ok && data.app === 'meta-clinic-codex') {
      if (data.version !== '0.2.0') {
        const error = new Error('An older Meta Clinic panel is running. Stop the plugin runtime with its runtime helper, then start it again.');
        error.code = 'PLUGIN_VERSION_CHANGED';
        throw error;
      }
      if (data.version === state.version) return state;
    }
  } catch (error) { if (error.code === 'PLUGIN_VERSION_CHANGED') throw error; /* A stopped runtime is started below. */ }
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
  const response = await fetch(origin + '/tools/call', { method: 'POST', headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args || {} }), redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('The local plugin connection is unavailable. Reopen the panel.');
  return response.json();
}
