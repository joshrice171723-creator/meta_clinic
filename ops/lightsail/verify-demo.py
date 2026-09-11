"""Run with /opt/certbot/bin/python as root after HTTPS is enabled."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import time
import requests

origin = 'https://184.194.129.57'
session = requests.Session()
session.headers['Origin'] = origin
def check(condition, label):
    if not condition:
        raise SystemExit('FAILED: ' + label)
    print('PASS: ' + label)

check(session.get(origin + '/login', timeout=20).status_code == 200, 'HTTPS login page')
check(session.get(origin + '/up', timeout=20).status_code == 200, 'API health')
configuration = session.get(origin + '/api/csrf', timeout=20).json()
check(configuration.get('development_login') is False, 'development login disabled')
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
check(session.post(origin + '/api/development_session', json={}, timeout=20).status_code == 404, 'development endpoint unavailable')
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
