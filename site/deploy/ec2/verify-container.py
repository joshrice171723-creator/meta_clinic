#!/usr/bin/env python3
"""Test a local Linux image with disposable synthetic volumes; never contacts AWS."""
import argparse
import os
from pathlib import Path
import re
import secrets
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('image', help='Locally built linux/amd64 Rails image')
args = parser.parse_args()
root = Path(__file__).resolve().parent
prefix = 'apply-check-' + secrets.token_hex(6)
app, proxy = prefix + '-web', prefix + '-tls'
volume, restore = prefix + '-data', prefix + '-restore'
env = os.environ.copy()
runtime = {
    'RAILS_ENV': 'production', 'APP_SITE_ORIGIN': 'https://localhost:8443',
    'DATABASE_PATH': '/rails/storage/production.sqlite3',
    'APP_DEVELOPMENT_LOGIN': '1',  # Deliberately wrong flag: production must still deny.
    'RAILS_MAX_THREADS': '3', 'WEB_CONCURRENCY': '0', 'PORT': '3000', 'RAILS_LOG_LEVEL': 'warn',
}
for key in ['SECRET_KEY_BASE', 'ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY',
            'ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY', 'ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT']:
    runtime[key] = secrets.token_hex(32)
env.update(runtime)


def run(*command, check=True):
    result = subprocess.run(command, env=env, capture_output=True, text=True)
    if check and result.returncode:
        # Do not print child environments or raw Rails diagnostics.
        classes = sorted(set(re.findall(r'\b[A-Z]\w*(?:::\w+)*(?:Error|Exception)\b', result.stderr + result.stdout)))
        raise RuntimeError(f'{command[0]} {command[1]} failed ({result.returncode}); error classes: {classes}; raw output suppressed')
    return result.stdout.strip()


def options(data_volume):
    return ['--platform', 'linux/amd64', '--read-only', '--tmpfs', '/rails/tmp:uid=1000,gid=1000,mode=700',
            '--tmpfs', '/rails/log:uid=1000,gid=1000,mode=700', '--tmpfs', '/tmp:mode=1777,size=64m', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges:true', '--memory', '700m', '--memory-swap', '700m', '--pids-limit', '256',
            '-v', f'{data_volume}:/rails/storage', *[flag for key in runtime for flag in ('-e', key)]]


with tempfile.TemporaryDirectory(prefix=prefix) as scratch:
    tls = Path(scratch) / 'tls'
    tls.mkdir(mode=0o755)
    run('openssl', 'req', '-x509', '-newkey', 'rsa:3072', '-sha256', '-nodes', '-days', '1',
        '-keyout', str(tls / 'localhost.key'), '-out', str(tls / 'localhost.crt'),
        '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
        '-addext', 'basicConstraints=critical,CA:FALSE')
    (tls / 'localhost.key').chmod(0o600)
    try:
        for name in [volume, restore]:
            run('docker', 'volume', 'create', name)
            run('docker', 'run', '--rm', '--platform', 'linux/amd64', '--user', '0',
                '-v', name + ':/data', '--entrypoint', 'chown', args.image, '1000:1000', '/data')

        def start():
            run('docker', 'run', '-d', '--name', app, *options(volume), '-v', f'{tls}:/tls:ro',
                args.image, './bin/rails', 'server')
            run('docker', 'run', '-d', '--name', proxy, '--network', 'container:' + app,
                '-v', f'{root / "nginx.conf"}:/etc/nginx/nginx.conf:ro',
                '-v', f'{tls}:/etc/apply/tls:ro', 'nginx:stable-alpine')
            for _ in range(45):
                status = request('/up')
                if status == '200':
                    return
                time.sleep(1)
            raise RuntimeError('Production TLS health check failed; raw output suppressed')

        def request(path, *extra):
            return run('docker', 'exec', app, 'curl', '--silent', '--max-time', '3', '--cacert',
                       '/tls/localhost.crt', '-o', '/dev/null', '-w', '%{http_code}',
                       *extra, 'https://localhost:8443' + path, check=False)

        start()
        assert request('/') == '200'
        assert request('/login') == '200'
        assert request('/portal') == '302'
        assert request('/clinic') == '404'
        page = run('docker', 'exec', app, 'curl', '--silent', '--cacert', '/tls/localhost.crt',
                   '-c', '/rails/tmp/verification-cookies', 'https://localhost:8443/login')
        assert 'Continue as demo client' not in page
        csrf = re.search(r'name="csrf-token" content="([^"]+)"', page).group(1)
        assert request('/login/development', '-X', 'POST', '-b', '/rails/tmp/verification-cookies',
                       '-H', 'Origin: https://localhost:8443', '--data-urlencode', 'authenticity_token=' + csrf) == '404'
        assert request('/', '-H', 'Host: untrusted.invalid') == '000'
        run('docker', 'exec', app, './bin/rails', 'runner',
            "ContactMessage.create!(name: 'Synthetic staging check', email: 'check@example.invalid', "
            "message: 'Wholly synthetic persistence and recovery marker')")
        check_record = (
            "raise 'Missing/decryption failure' unless ContactMessage.count == 1 && "
            "ContactMessage.first.message == 'Wholly synthetic persistence and recovery marker'; "
            "raw = ActiveRecord::Base.connection.select_value('SELECT message FROM contact_messages LIMIT 1'); "
            "raise 'Not encrypted' if raw.include?('Wholly synthetic')"
        )
        run('docker', 'exec', app, './bin/rails', 'runner', check_record)
        print('Production TLS, host denial, protected routes and encrypted write passed.', flush=True)
        run('docker', 'rm', '-f', proxy, app)
        start()
        run('docker', 'exec', app, './bin/rails', 'runner', check_record)
        run('docker', 'exec', app, 'sqlite3', '/rails/storage/production.sqlite3',
            ".backup '/rails/storage/verification-backup.sqlite3'")
        run('docker', 'run', '--rm', '--platform', 'linux/amd64', '--user', '0',
            '-v', volume + ':/source:ro', '-v', restore + ':/restore', '--entrypoint', 'sh', args.image,
            '-c', 'cp /source/verification-backup.sqlite3 /restore/production.sqlite3 && chown 1000:1000 /restore/production.sqlite3')
        assert run('docker', 'run', '--rm', *options(restore), '--entrypoint', 'sqlite3', args.image,
                   '/rails/storage/production.sqlite3', 'PRAGMA integrity_check;') == 'ok'
        run('docker', 'run', '--rm', *options(restore), args.image, './bin/rails', 'runner', check_record)
        print('Container recreation, isolated SQLite restore and decryption passed.', flush=True)
    finally:
        run('docker', 'rm', '-f', proxy, app, check=False)
        for name in [volume, restore]:
            run('docker', 'volume', 'rm', name, check=False)
print('Disposable containers, synthetic volumes and temporary test keys removed.')
