"""Run once as root on the selected fresh demo host; never prints secrets."""
import ipaddress
import os
from pathlib import Path
import secrets
import sys

address = str(ipaddress.IPv4Address(sys.argv[1]))
directory = Path('/opt/meta-clinic/secrets')
if directory.exists():
    raise SystemExit('Secrets already exist; refusing to replace encryption keys or passwords.')
os.umask(0o077)
directory.mkdir(parents=True, mode=0o700)
owner_password = secrets.token_hex(32)
runtime_password = secrets.token_hex(32)
runtime = {
    'RAILS_ENV': 'production',
    'APP_DEPLOYMENT_ENV': 'staging',
    'APP_SITE_ORIGIN': 'https://' + address,
    'APP_DEVELOPMENT_LOGIN': '0',
    'RAILS_MAX_THREADS': '3',
    'PORT': '3000',
    'PGHOST': 'postgres', 'PGPORT': '5432', 'PGDATABASE': 'apply',
    'PGUSER': 'apply_runtime', 'PGPASSWORD': runtime_password,
    'SECRET_KEY_BASE': secrets.token_hex(64),
    'ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY': secrets.token_hex(32),
    'ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY': secrets.token_hex(32),
    'ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT': secrets.token_hex(32),
}
postgres = {
    'POSTGRES_DB': 'apply', 'POSTGRES_USER': 'apply_owner',
    'POSTGRES_PASSWORD': owner_password,
    'POSTGRES_RUNTIME_PASSWORD': runtime_password,
}
owner = {'PGUSER': 'apply_owner', 'PGPASSWORD': owner_password}
for name, values in [('runtime.env', runtime), ('postgres.env', postgres), ('owner.env', owner)]:
    (directory / name).write_text(''.join(f'{key}={value}\n' for key, value in values.items()))
(directory / 'demo-password').write_text(secrets.token_urlsafe(32) + '\n')
os.chown(directory / 'demo-password', 1000, 1000)
print('Host-only secrets created; no secret values printed.')
