// Run only against the local synthetic development database; never against a live clinic.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const backend = fileURLToPath(new URL('../backend', import.meta.url));
const marker = randomUUID();
const env = { ...process.env, RAILS_ENV: 'development', APPLY_SMOKE_EMAIL: `smoke-${marker}@example.invalid`, APPLY_SMOKE_PASSWORD: randomUUID() + 'aA9!' };
const runner = code => execFileSync('bin/rails', ['runner', code], { cwd: backend, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const ids = JSON.parse(runner('require "json"; user = User.create!(email_address: ENV.fetch("APPLY_SMOKE_EMAIL"), password: ENV.fetch("APPLY_SMOKE_PASSWORD"), admin: true); material = Material.create!(title: "Synthetic smoke material", body: "Synthetic protected content", published_at: Time.current); puts({ user: user.id, material: material.id }.to_json)'));
let cookie = '';
let inquiryId;
async function request(path, options = {}) {
  const response = await fetch('http://localhost:3000' + path, { ...options, redirect: 'manual', headers: { Cookie: cookie, ...options.headers } });
  for (const value of response.headers.getSetCookie()) if (value.startsWith('_apply_session=')) cookie = value.split(';')[0];
  return response;
}
async function mutation(path, body, method = 'POST') {
  const csrf = await request('/api/backend/csrf');
  assert.equal(csrf.status, 200);
  const { csrf_token } = await csrf.json();
  return request('/api/backend/' + path, { method, headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json', 'X-CSRF-Token': csrf_token }, body: body === undefined ? undefined : JSON.stringify(body) });
}
try {
  assert.equal((await request('/portal')).status, 307);
  assert.equal((await request('/api/backend/materials')).status, 401);
  assert.equal((await request('/api/backend/session', { method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await request('/api/backend/session', { method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: '{}' })).status, 422);
  const signIn = await mutation('session', { email_address: env.APPLY_SMOKE_EMAIL, password: env.APPLY_SMOKE_PASSWORD });
  assert.equal(signIn.status, 200);
  const portal = await request('/portal');
  assert.equal(portal.status, 200);
  assert.match(await portal.text(), /Paperwork/);
  const materials = await request('/training');
  assert.equal(materials.status, 200);
  assert.match(await materials.text(), /Synthetic smoke material/);
  const detail = await request('/training/' + ids.material);
  assert.equal(detail.status, 200);
  assert.match(await detail.text(), /Synthetic protected content/);
  assert.equal((await mutation('materials/' + ids.material + '/start')).status, 200);
  assert.equal((await mutation('materials/' + ids.material + '/complete')).status, 200);
  const contact = await mutation('contact_messages', { contact_message: { name: 'Synthetic Smoke Test', email: env.APPLY_SMOKE_EMAIL, message: 'A wholly synthetic website integration test.', website: '' } });
  assert.equal(contact.status, 201);
  const inbox = await request('/api/backend/inquiries');
  assert.equal(inbox.status, 200);
  const data = await inbox.json();
  const inquiry = data.inquiries.find(item => item.email === env.APPLY_SMOKE_EMAIL);
  assert.ok(inquiry);
  inquiryId = inquiry.id;
  const adminPage = await request('/inquiries');
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /Synthetic Smoke Test/);
  const previousCookie = cookie;
  assert.equal((await mutation('session', undefined, 'DELETE')).status, 204);
  assert.equal((await request('/api/backend/materials')).status, 401);
  cookie = previousCookie;
  assert.equal((await request('/api/backend/materials')).status, 401);
  console.log('PASS: frontend → Rails login, CSRF/origin checks, protected pages, contact persistence, admin inbox, logout and cookie replay.');
} finally {
  env.APPLY_SMOKE_USER_ID = String(ids.user);
  env.APPLY_SMOKE_MATERIAL_ID = String(ids.material);
  env.APPLY_SMOKE_INQUIRY_ID = inquiryId ? String(inquiryId) : '';
  runner('User.find(ENV.fetch("APPLY_SMOKE_USER_ID")).destroy!; Material.find(ENV.fetch("APPLY_SMOKE_MATERIAL_ID")).destroy!; ContactMessage.find_by(id: ENV["APPLY_SMOKE_INQUIRY_ID"])&.destroy!');
  console.log('Temporary synthetic member and material removed; confirmed test inquiry removed.');
}
