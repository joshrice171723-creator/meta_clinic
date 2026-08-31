#!/bin/bash
# Installed as root on the staging host. Never enable shell tracing here.
set -euo pipefail
umask 077
# shellcheck source=/dev/null
source /etc/apply/config
mountpoint -q /srv/apply
image=$(cat /etc/apply/image)
[[ "$image" == "$APPLY_REPOSITORY"@sha256:* ]] || exit 1
[[ "${image##*@sha256:}" =~ ^[a-f0-9]{64}$ ]] || exit 1

# Values exist only in root-owned /run tmpfs and the container runtime, not UserData.
python3 - <<'PY'
import json, os, re, subprocess
keys = {
    'SECRET_KEY_BASE': 'APPLY_SESSION_SECRET',
    'ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY': 'APPLY_ENCRYPTION_SECRET',
    'ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY': 'APPLY_DETERMINISTIC_SECRET',
    'ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT': 'APPLY_SALT_SECRET',
}
values = {
    'RAILS_ENV': 'production', 'APP_SITE_ORIGIN': 'https://localhost:8443',
    'DATABASE_PATH': '/rails/storage/production.sqlite3',
    'APP_DEVELOPMENT_LOGIN': '0', 'RAILS_MAX_THREADS': '3', 'WEB_CONCURRENCY': '0',
    'PORT': '3000', 'RAILS_LOG_LEVEL': 'warn',
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

exec docker run --rm --name apply-web \
  --publish 127.0.0.1:3000:3000 \
  --env-file /run/apply/runtime.env \
  --mount type=bind,src=/srv/apply/storage,dst=/rails/storage \
  --read-only --tmpfs /rails/tmp:uid=1000,gid=1000,mode=700 \
  --tmpfs /rails/log:uid=1000,gid=1000,mode=700 \
  --tmpfs /tmp:mode=1777,size=64m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  --memory 700m --memory-swap 700m --pids-limit 256 \
  --log-driver local --log-opt max-size=10m --log-opt max-file=3 \
  "$image" ./bin/rails server
