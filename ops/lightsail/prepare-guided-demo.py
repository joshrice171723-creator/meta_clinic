#!/usr/bin/env python3
"""Create the isolated lesson database and credentials once; never print secrets."""
import os
from pathlib import Path
import secrets
import subprocess

os.umask(0o077)
target = Path('/opt/meta-clinic/secrets/guided-demo.env')


def sql(statement):
    return subprocess.run(
        ['docker', 'exec', '-i', 'meta-clinic-demo-postgres-1', 'psql',
         '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'apply_owner', '-d', 'postgres'],
        input=statement, text=True, capture_output=True, check=True).stdout.strip()


if target.exists():
    print('Existing guided-demo credentials retained.')
else:
    if sql("SELECT count(*) FROM pg_roles WHERE rolname='apply_guided_demo'") != '0':
        raise SystemExit('Role already exists without its credential file; recover the file before proceeding.')
    password = secrets.token_hex(32)
    sql(f"CREATE ROLE apply_guided_demo LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '{password}';")
    sql('CREATE DATABASE apply_guided_demo OWNER apply_guided_demo;')
    sql('REVOKE ALL ON DATABASE apply_guided_demo FROM PUBLIC;')
    if sql("SELECT has_database_privilege('apply_guided_demo','apply','CONNECT')") != 'f':
        raise SystemExit('Demo role can connect to ordinary database; refusing activation.')
    values = {
        'RAILS_ENV': 'production', 'APP_DEPLOYMENT_ENV': 'staging',
        'APP_GUIDED_DEMO': '1', 'APP_SITE_ORIGIN': 'https://aimetaclinic.com',
        'PGHOST': 'postgres', 'PGPORT': '5432', 'PGDATABASE': 'apply_guided_demo',
        'PGUSER': 'apply_guided_demo', 'PGPASSWORD': password,
        'SECRET_KEY_BASE': secrets.token_hex(64),
        'ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY': secrets.token_hex(32),
        'ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY': secrets.token_hex(32),
        'ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT': secrets.token_hex(32),
        'RAILS_MAX_THREADS': '3', 'RAILS_LOG_LEVEL': 'warn',
    }
    with target.open('x') as stream:
        stream.write(''.join(f'{key}={value}\n' for key, value in values.items()))
    print('Created dedicated lesson database and server-only credentials.')
