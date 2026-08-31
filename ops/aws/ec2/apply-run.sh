#!/bin/bash
# Installed as root on each host. Never enable shell tracing here.
set -euo pipefail
umask 077
# shellcheck source=/dev/null
source /etc/apply/config
[[ "$APPLY_ENVIRONMENT" = staging || "$APPLY_ENVIRONMENT" = production ]] || exit 1
mountpoint -q /srv/apply
# The static frontend never fetches or receives database/session secrets.
if [ "${1:-api}" = web ]; then
  image=$(cat /etc/apply/web-image)
  [[ "$image" == "$APPLY_REPOSITORY"@sha256:* ]] || exit 1
  [[ "${image##*@sha256:}" =~ ^[a-f0-9]{64}$ ]] || exit 1
  docker network inspect apply-frontend >/dev/null 2>&1 || docker network create --internal apply-frontend >/dev/null
  exec docker run --rm --name apply-web --network apply-frontend --publish 127.0.0.1:3000:8080 \
    --read-only --tmpfs /tmp:uid=101,gid=101,mode=700,size=32m --cap-drop ALL --security-opt no-new-privileges:true \
    --memory 64m --memory-swap 64m --pids-limit 128 \
    --log-driver local --log-opt max-size=10m --log-opt max-file=3 "$image"
fi
[[ "${1:-api}" = api || "${1:-}" = prepare ]] || exit 1
# Values exist only in root-owned /run tmpfs and the container runtime, not UserData.
python3 - <<'PY'
import json, os, re, subprocess
keys = {
    'SECRET_KEY_BASE': 'APPLY_SESSION_SECRET',
    'ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY': 'APPLY_ENCRYPTION_SECRET',
    'ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY': 'APPLY_DETERMINISTIC_SECRET',
    'ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT': 'APPLY_SALT_SECRET',
    'PGPASSWORD': 'APPLY_DATABASE_RUNTIME_SECRET',
}
values = {
    'RAILS_ENV': 'production', 'APP_SITE_ORIGIN': 'https://localhost:8443',
    'APP_DEPLOYMENT_ENV': os.environ['APPLY_ENVIRONMENT'],
    'PGHOST': 'apply-postgres', 'PGPORT': '5432', 'PGDATABASE': 'apply', 'PGUSER': 'apply_runtime',
    'APP_DEVELOPMENT_LOGIN': '0', 'RAILS_MAX_THREADS': '3', 'WEB_CONCURRENCY': '0',
    'PORT': '3001', 'RAILS_LOG_LEVEL': 'warn',
}
for key, reference in keys.items():
    result = subprocess.run(['aws', 'secretsmanager', 'get-secret-value',
        '--secret-id', os.environ[reference], '--output', 'json'],
        capture_output=True, check=True, text=True)
    value = json.loads(result.stdout)['SecretString']
    if not re.fullmatch(r'[A-Za-z0-9]{64}', value):
        raise SystemExit('Unexpected secret format; values suppressed')
    values[key] = value
fd = os.open('/run/apply/runtime.env', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as output:
    output.write(''.join(f'{key}={value}\n' for key, value in values.items()))
PY

[ "${1:-}" != prepare ] || exit 0

image=$(cat /etc/apply/image)
[[ "$image" == "$APPLY_REPOSITORY"@sha256:* ]] || exit 1
[[ "${image##*@sha256:}" =~ ^[a-f0-9]{64}$ ]] || exit 1

exec docker run --rm --name apply-api --network apply-database \
  --publish 127.0.0.1:3001:3001 \
  --env-file /run/apply/runtime.env \
  --read-only --tmpfs /rails/tmp:uid=1000,gid=1000,mode=700 \
  --tmpfs /rails/log:uid=1000,gid=1000,mode=700 \
  --tmpfs /tmp:mode=1777,size=64m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 500m --memory-swap 500m --pids-limit 256 \
  --log-driver local --log-opt max-size=10m --log-opt max-file=3 \
  "$image" ./bin/rails server
