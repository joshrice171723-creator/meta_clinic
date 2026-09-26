"""Run with Python 3 and requests as root after HTTPS is enabled."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import time
import requests

origin = 'https://aimetaclinic.com'
session = requests.Session()
session.headers['Origin'] = origin
def check(condition, label):
    if not condition:
        raise SystemExit('FAILED: ' + label)
    print('PASS: ' + label)

check(session.get(origin + '/login', timeout=20).status_code == 200, 'HTTPS login page')
check(session.get(origin + '/up', timeout=20).status_code == 200, 'API health')
configuration = session.get(origin + '/api/csrf', timeout=20).json()
public_demo_enabled = 'APP_PUBLIC_DEVELOPMENT_LOGIN=1' in Path(
    '/opt/meta-clinic/secrets/runtime.env').read_text().splitlines()
check(configuration.get('development_login') is public_demo_enabled,
      'public development login matches staging configuration')
check(configuration.get('public_demo_owner_pin_required') is public_demo_enabled,
      'owner demo PIN matches staging configuration')
if public_demo_enabled:
    check(any(account['id'] == 'omni' for account in configuration.get('development_accounts', [])),
          'Omni available for new organization setup')
else:
    check(not configuration.get('development_accounts'), 'no public development account shortcuts')
csrf = configuration['csrf_token']
check(session.get(origin + '/api/clinic/context', timeout=20).status_code in (401, 403, 404), 'anonymous clinic access denied')
password = Path('/opt/meta-clinic/secrets/demo-password').read_text().strip()
credentials = {'email_address': 'staging-demo-user@example.test', 'password': password}
check(session.post(origin + '/api/session', json=credentials, timeout=20).status_code in (403, 422), 'login without CSRF denied')
session.headers['X-CSRF-Token'] = csrf
check(session.post(origin + '/api/session', json=credentials, timeout=20).status_code == 200, 'password login')
configuration = session.get(origin + '/api/csrf', timeout=20).json()
session.headers['X-CSRF-Token'] = configuration['csrf_token']
check(configuration.get('clinic_available') is True, 'managed synthetic clinic available')
check(session.get(origin + '/api/clinic/context', timeout=20).status_code == 200, 'authenticated clinic context')
if public_demo_enabled:
    check(session.post(origin + '/api/development_session', json={
        'profile': 'omni', 'portal': 'owner'}, timeout=20).status_code == 403,
        'owner demo entry requires PIN')
else:
    check(session.post(origin + '/api/development_session', json={}, timeout=20).status_code == 404,
          'development endpoint unavailable')
cookies = session.cookies.get_dict()
def request_context(_):
    start = time.monotonic()
    response = requests.get(origin + '/api/clinic/context', cookies=cookies, timeout=30)
    return response.status_code, round(time.monotonic() - start, 2)
with ThreadPoolExecutor(max_workers=5) as pool:
    outcomes = list(pool.map(request_context, range(5)))
check(all(status == 200 for status, _ in outcomes), 'five concurrent context reads')
print('Concurrent read durations (seconds):', [duration for _, duration in outcomes])
check(session.delete(origin + '/api/session', timeout=20).status_code in (200, 204), 'logout')
check(session.get(origin + '/api/clinic/context', timeout=20).status_code in (401, 403, 404), 'clinic access denied after logout')

# Exercise the public, isolated Sandbox through the same API prefix the iframe uses.
sandbox = requests.Session()
sandbox.headers['Origin'] = origin
base = origin + '/api/demo-workspace'
demo_configuration = sandbox.get(base + '/csrf', timeout=20).json()
check(demo_configuration.get('development_login') is True, 'isolated demo login enabled')
check(any(account['id'] == 'omni' for account in demo_configuration['development_accounts']),
      'Omni available in isolated demo')
sandbox.headers['X-CSRF-Token'] = demo_configuration['csrf_token']
demo_entry = sandbox.post(base + '/development_session', json={
    'profile': 'omni', 'portal': 'clinic', 'new_organization': {
        'organization_name': 'Demo Walkthrough Organization',
        'clinic_name': 'Demo Walkthrough Clinic', 'location_name': 'Main location'}}, timeout=30)
check(demo_entry.status_code == 201, 'create organization and enter as Omni')
demo_context = sandbox.get(base + '/clinic/context', timeout=20)
check(demo_context.status_code == 200 and demo_context.json()['current_site']['name'] == 'Main location',
      'new organization location persists in clinic context')
csrf = sandbox.get(base + '/csrf', timeout=20).json()['csrf_token']
sandbox.headers['X-CSRF-Token'] = csrf
check(sandbox.delete(base + '/session', timeout=20).status_code == 204, 'Omni logout')
csrf = sandbox.get(base + '/csrf', timeout=20).json()['csrf_token']
sandbox.headers['X-CSRF-Token'] = csrf
visitor = {'name': 'Release Check', 'email': 'release-check@example.test', 'company': 'Synthetic demo'}
check(sandbox.post(base + '/demo/visitor', json=visitor, timeout=20).status_code == 200,
      'Sandbox visitor registration')
csrf = sandbox.get(base + '/csrf', timeout=20).json()['csrf_token']
sandbox.headers['X-CSRF-Token'] = csrf
opened = sandbox.post(base + '/demo/lesson', json={'lesson_key': 'sandbox'}, timeout=600)
check(opened.status_code == 201 and opened.json()['run']['sandbox'], 'Sandbox available')
clinic_id = opened.json()['run']['clinic']['id']
context = sandbox.get(base + '/clinic/context', timeout=20).json()
sites = context['sites']
check(len(sites) >= 2, 'Sandbox has multiple sites')
csrf = sandbox.get(base + '/csrf', timeout=20).json()['csrf_token']
sandbox.headers['X-CSRF-Token'] = csrf
selected = sandbox.patch(base + '/clinic/context', json={'site_id': sites[1]['id']}, timeout=20)
check(selected.status_code == 200 and selected.json()['current_site']['id'] == sites[1]['id'],
      'Sandbox location switch')
check(sandbox.get(base + '/clinic/context', timeout=20).json()['current_site']['id'] == sites[1]['id'],
      'Sandbox location persisted')
csrf = sandbox.get(base + '/csrf', timeout=20).json()['csrf_token']
sandbox.headers['X-CSRF-Token'] = csrf
second_visitor = requests.Session()
second_visitor.headers['Origin'] = origin
second_visitor.headers['X-CSRF-Token'] = second_visitor.get(base + '/csrf', timeout=20).json()['csrf_token']
check(second_visitor.post(base + '/demo/visitor', json={
    'name': 'Second Release Check', 'email': 'release-check-secondary@example.test',
    'company': 'Synthetic demo'}, timeout=20).status_code == 200,
      'Second Sandbox visitor registration')
second_visitor.headers['X-CSRF-Token'] = second_visitor.get(base + '/csrf', timeout=20).json()['csrf_token']
joined = second_visitor.post(base + '/demo/lesson', json={'lesson_key': 'sandbox'}, timeout=30)
check(joined.status_code == 201 and joined.json()['run']['clinic']['id'] == clinic_id,
      'Second visitor joined prepared Sandbox')
