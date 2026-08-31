#!/usr/bin/env python3
"""Test a local Linux image with disposable synthetic volumes; never contacts AWS."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('image', help='Locally built linux/amd64 Rails image')
parser.add_argument('--web-image', required=True, help='Separately built static frontend image')
parser.add_argument('--environment', choices=['staging', 'production'], default='production')
args = parser.parse_args()
root = Path(__file__).resolve().parent
prefix = 'apply-check-' + secrets.token_hex(6)
app, web, proxy = prefix + '-api', prefix + '-web', prefix + '-tls'
volume, restore = prefix + '-data', prefix + '-restore'
database, restored_database, network = prefix + '-postgres', prefix + '-restored', prefix + '-network'
env = os.environ.copy()
runtime = {
    'RAILS_ENV': 'production', 'APP_SITE_ORIGIN': 'https://localhost:8443',
    'APP_DEPLOYMENT_ENV': args.environment,
    'PGHOST': database, 'PGPORT': '5432', 'PGDATABASE': 'apply', 'PGUSER': 'apply_runtime', 'PGPASSWORD': secrets.token_hex(32),
    'APP_DEVELOPMENT_LOGIN': '1',  # Deliberately wrong flag: production must still deny.
    'RAILS_MAX_THREADS': '3', 'WEB_CONCURRENCY': '0', 'PORT': '3001', 'RAILS_LOG_LEVEL': 'warn',
}
for key in ['SECRET_KEY_BASE', 'ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY',
            'ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY', 'ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT']:
    runtime[key] = secrets.token_hex(32)
env.update(runtime)
owner_password = secrets.token_hex(32)
env.update(POSTGRES_PASSWORD=owner_password, POSTGRES_USER="apply_owner", POSTGRES_DB="apply")


def run(*command, check=True, data=None):
    result = subprocess.run(command, env=env, capture_output=True, text=True, input=data)
    if check and result.returncode:
        # Do not print child environments or raw Rails diagnostics.
        classes = sorted(set(re.findall(r'\b[A-Z]\w*(?:::\w+)*(?:Error|Exception)\b', result.stderr + result.stdout)))
        raise RuntimeError(f'{command[0]} {command[1]} failed ({result.returncode}); error classes: {classes}; raw output suppressed')
    return result.stdout.strip()


def options(data_volume):
    return ['--platform', 'linux/amd64', '--read-only', '--tmpfs', '/rails/tmp:uid=1000,gid=1000,mode=700',
            '--tmpfs', '/rails/log:uid=1000,gid=1000,mode=700', '--tmpfs', '/tmp:mode=1777,size=64m', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges:true', '--memory', '500m', '--memory-swap', '500m', '--pids-limit', '256',
            '--network', network, *[flag for key in runtime for flag in ('-e', key)]]


with tempfile.TemporaryDirectory(prefix=prefix) as scratch:
    tls = Path(scratch) / 'tls'
    tls.mkdir(mode=0o755)
    run('openssl', 'req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-nodes', '-days', '1',
        '-keyout', str(tls / 'localhost.key'), '-out', str(tls / 'localhost.crt'),
        '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
        '-addext', 'basicConstraints=critical,CA:FALSE')
    (tls / 'localhost.key').chmod(0o600)
    proxy_config = Path(scratch) / 'nginx.conf'
    proxy_config.write_text((root / 'nginx.conf').read_text().replace('127.0.0.1:3000;', '127.0.0.1:8080;'))
    try:
        run('docker', 'network', 'create', '--internal', network)
        for name, data_volume in [(database, volume), (restored_database, restore)]:
            run('docker', 'volume', 'create', data_volume)
            run('docker', 'run', '-d', '--name', name, '--network', network,
                '-v', data_volume + ':/var/lib/postgresql', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER', '-e', 'POSTGRES_DB',
                '--memory', '256m', '--memory-swap', '256m', 'postgres:18.6', '-c', 'shared_buffers=64MB', '-c', 'max_connections=20')
            for _ in range(60):
                if run('docker', 'exec', name, 'pg_isready', '-U', 'apply_owner', '-d', 'apply', check=False).endswith('accepting connections'):
                    break
                time.sleep(1)
            else:
                raise RuntimeError('PostgreSQL readiness failed')

        def sql(name, text):
            return run('docker', 'exec', '-i', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'apply_owner', '-d', 'apply', data=text)

        def grants(name):
            # Generated values exist only in subprocess input, never command args/logs.
            sql(name, "CREATE ROLE apply_runtime LOGIN PASSWORD '" + runtime['PGPASSWORD'] + "';")
            sql(name, (root.parents[2] / 'apps/api/db/runtime_privileges.sql').read_text())

        env.update(PGUSER='apply_owner', PGPASSWORD=owner_password)
        run('docker', 'run', '--rm', *options(volume), args.image, './bin/rails', 'db:migrate', 'db:seed')
        env.update(PGUSER='apply_runtime', PGPASSWORD=runtime['PGPASSWORD'])
        grants(database)

        def start():
            run('docker', 'run', '-d', '--name', app, *options(volume), '-v', f'{tls}:/tls:ro',
                args.image, './bin/rails', 'server')
            run('docker', 'run', '-d', '--name', web, '--network', 'container:' + app,
                '--read-only', '--tmpfs', '/tmp:uid=101,gid=101,mode=700,size=32m',
                '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', args.web_image)
            run('docker', 'run', '-d', '--name', proxy, '--network', 'container:' + app,
                '-v', f'{proxy_config}:/etc/nginx/nginx.conf:ro',
                '-v', f'{tls}:/etc/apply/tls:ro', 'nginx:stable-alpine')
            for _ in range(45):
                status = request('/up')
                if status == '200':
                    return
                if run('docker', 'inspect', '--format', '{{.State.Running}}', app) != 'true':
                    logs = subprocess.run(['docker', 'logs', app], capture_output=True, text=True)
                    classes = sorted(set(re.findall(r'\b[A-Z]\w*(?:::\w+)*(?:Error|Exception)\b', logs.stdout + logs.stderr)))
                    raise RuntimeError(f'Application exited before readiness; error classes: {classes}; raw output suppressed')
                time.sleep(1)
            raise RuntimeError('Production TLS health check failed; raw output suppressed')

        def request(path, *extra):
            return run('docker', 'exec', app, 'curl', '--silent', '--max-time', '3', '--cacert',
                       '/tls/localhost.crt', '-o', '/dev/null', '-w', '%{http_code}',
                       *extra, 'https://localhost:8443' + path, check=False)

        start()
        assert request('/') == '200'
        assert request('/login') == '200'
        assert request('/portal') == '200'  # Empty browser shell, never protected records.
        assert request('/api/session') == '401'
        assert request('/api/clinic') == '404'
        assert request('/clinic') == '404'
        assert request('/api/not-a-route') == '404'
        assert request('/not-a-page') == '404'
        page = run('docker', 'exec', app, 'curl', '--silent', '--cacert', '/tls/localhost.crt',
                   'https://localhost:8443/')
        assert 'type="module"' in page and '/assets/' in page
        script = re.search(r'src="(/assets/[^"]+\.js)"', page).group(1)
        assert request(script) == '200'
        api = run('docker', 'exec', app, 'curl', '--silent', '--cacert', '/tls/localhost.crt',
                  '-c', '/rails/tmp/verification-cookies', 'https://localhost:8443/api/csrf')
        payload = json.loads(api)
        assert payload['development_login'] is False
        assert request('/api/development_session', '-X', 'POST', '-b', '/rails/tmp/verification-cookies',
                       '-H', 'Origin: https://localhost:8443', '-H', 'X-CSRF-Token: ' + payload['csrf_token']) == '404'
        assert request('/', '-H', 'Host: untrusted.invalid') == '000'
        expected_samples = 3 if args.environment == 'staging' else 0
        run('docker', 'exec', app, './bin/rails', 'runner',
            f'raise "Unexpected sample seeds" unless Launch::Material.where(sample: true).count == {expected_samples}; '
            'raise "Unexpected account seeds" unless User.count.zero?')
        run('docker', 'exec', app, './bin/rails', 'runner',
            "Launch::ContactMessage.create!(name: 'Synthetic staging check', email: 'check@example.invalid', "
            "message: 'Wholly synthetic persistence and recovery marker')")
        check_record = (
            "raise 'Missing/decryption failure' unless Launch::ContactMessage.count == 1 && "
            "Launch::ContactMessage.first.message == 'Wholly synthetic persistence and recovery marker'; "
            "raw = ActiveRecord::Base.connection.select_value('SELECT message FROM contact_messages LIMIT 1'); "
            "raise 'Not encrypted' if raw.include?('Wholly synthetic')"
        )
        run('docker', 'exec', app, './bin/rails', 'runner', check_record)
        print('Production TLS, host denial, protected routes and encrypted write passed.', flush=True)
        run('docker', 'rm', '-f', proxy, web, app)
        start()
        run('docker', 'exec', app, './bin/rails', 'runner', check_record)
        dump = subprocess.run(['docker', 'exec', database, 'pg_dump', '-U', 'apply_owner', '-d', 'apply', '--format=custom', '--no-owner', '--no-acl'], capture_output=True, check=True).stdout
        result = subprocess.run(['docker', 'exec', '-i', restored_database, 'pg_restore', '-U', 'apply_owner', '-d', 'apply', '--exit-on-error', '--single-transaction', '--no-owner', '--no-acl'], input=dump, capture_output=True)
        assert result.returncode == 0, 'PostgreSQL restore failed; raw output suppressed'
        grants(restored_database)
        env['PGHOST'] = restored_database
        run('docker', 'run', '--rm', *options(restore), args.image, './bin/rails', 'runner', check_record)
        run('docker', 'run', '--rm', *options(restore), args.image, './bin/rails', 'runner',
            "c=ApplicationRecord.connection; raise unless c.select_value('SELECT current_user')=='apply_runtime'; "
            "raise if c.select_value(\"SELECT has_table_privilege(current_user,'contact_messages','TRUNCATE')\"); "
            "raise if c.select_value(\"SELECT has_schema_privilege(current_user,'public','CREATE')\")")
        print('Container recreation, separate PostgreSQL restore/decryption and restricted runtime role passed.', flush=True)
    finally:
        run('docker', 'rm', '-f', proxy, web, app, database, restored_database, check=False)
        for name in [volume, restore]:
            run('docker', 'volume', 'rm', name, check=False)
        run('docker', 'network', 'rm', network, check=False)
print('Disposable containers, synthetic volumes and temporary test keys removed.')
