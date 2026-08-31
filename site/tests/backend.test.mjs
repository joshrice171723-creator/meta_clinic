import test from 'node:test';
import assert from 'node:assert/strict';
import { backendConfig, allowedEndpoint, sessionCookie } from '../lib/backend.ts';
test('development routes locally; production requires explicit HTTPS services', () => {
  assert.deepEqual(backendConfig({ NODE_ENV: 'development' }), { backend: 'http://127.0.0.1:3001', frontend: 'http://localhost:3000' });
  assert.throws(() => backendConfig({ NODE_ENV: 'production' }));
  assert.throws(() => backendConfig({ NODE_ENV: 'production', RAILS_BACKEND_URL: 'http://127.0.0.1', APP_SITE_ORIGIN: 'https://example.com' }));
  assert.deepEqual(backendConfig({ NODE_ENV: 'production', RAILS_BACKEND_URL: 'https://api.example.com', APP_SITE_ORIGIN: 'https://example.com' }), { backend: 'https://api.example.com', frontend: 'https://example.com' });
});
test('backend URL cannot carry credentials, query parameters, or arbitrary paths', () => {
  for (const url of ['https://user:pass@example.com', 'https://example.com/private', 'https://example.com?target=bad', 'file:///tmp/socket']) {
    assert.throws(() => backendConfig({ NODE_ENV: 'production', RAILS_BACKEND_URL: url, APP_SITE_ORIGIN: 'https://example.com' }));
  }
});
test('only supported endpoints and methods are proxied', () => {
  for (const path of ['csrf', 'session', 'materials', 'materials/12', 'inquiries', 'paperworks', 'paperworks/1']) assert.equal(allowedEndpoint(path, 'GET'), true);
  for (const path of ['../users', 'materials/../users', 'https://evil.com', 'users', 'materials/0', 'materials/2?admin=true']) assert.equal(allowedEndpoint(path, 'GET'), false);
  assert.equal(allowedEndpoint('session', 'POST'), true);
  assert.equal(allowedEndpoint('session', 'DELETE'), true);
  assert.equal(allowedEndpoint('contact_messages', 'POST'), true);
  assert.equal(allowedEndpoint('inquiries', 'POST'), false);
  assert.equal(allowedEndpoint('materials', 'DELETE'), false);
  for (const path of ['paperworks/1/start', 'paperworks/1/sign', 'materials/1/start', 'materials/1/complete']) assert.equal(allowedEndpoint(path, 'POST'), true);
  for (const path of ['paperworks/1/delete', 'paperworks/../sign', 'materials/1/publish', 'users']) assert.equal(allowedEndpoint(path, 'POST'), false);
});
test('unrelated browser cookies never reach Rails', () => {
  assert.equal(sessionCookie('analytics=foo; _apply_session=opaque; unrelated=private'), '_apply_session=opaque');
  assert.equal(sessionCookie('other_apply_session=wrong'), '');
});
test('development login proxy is only available for an explicitly local development runtime', () => {
  assert.equal(allowedEndpoint('development_session', 'POST', { APP_RUNTIME: 'development' }), true);
  for (const env of [{}, { NODE_ENV: 'development' }, { APP_RUNTIME: 'production', NODE_ENV: 'development' },
    { APP_RUNTIME: 'development', APP_SITE_ORIGIN: 'https://preview.example.com' },
    { APP_RUNTIME: 'development', RAILS_BACKEND_URL: 'https://api.example.com' }]) {
    assert.equal(allowedEndpoint('development_session', 'POST', env), false);
  }
  for (const method of ['GET', 'DELETE', 'PUT']) assert.equal(allowedEndpoint('development_session', method, { APP_RUNTIME: 'development' }), false);
});
