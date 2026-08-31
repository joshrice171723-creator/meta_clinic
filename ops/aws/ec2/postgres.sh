#!/bin/bash
# Host-only PostgreSQL service and owner operations. Never enable tracing.
set -euo pipefail
umask 077
# shellcheck source=/dev/null
source /etc/apply/config
mountpoint -q /srv/apply
command=${1:-start}
case "$command" in start|backup|migrate) ;; *) exit 1 ;; esac
install -d -o 999 -g 999 -m 700 /run/apply-postgres
python3 - <<'PY'
import json,os,re,subprocess
for name,reference in [('owner','APPLY_DATABASE_OWNER_SECRET'),('runtime','APPLY_DATABASE_RUNTIME_SECRET')]:
    result=subprocess.run(['aws','secretsmanager','get-secret-value','--secret-id',os.environ[reference],'--output','json'],capture_output=True,text=True,check=True)
    value=json.loads(result.stdout)['SecretString']
    if not re.fullmatch(r'[A-Za-z0-9]{64}',value):
        raise SystemExit('Unexpected database secret format; details suppressed')
    path='/run/apply-postgres/'+name
    descriptor=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(descriptor,'w') as output: output.write(value)
    os.chown(path,999,999)
PY
if [ "$command" = start ]; then
  docker network inspect apply-database >/dev/null 2>&1 || docker network create --internal apply-database >/dev/null
  install -d -m 700 /srv/apply/postgres
  # PostgreSQL 18 stores its versioned cluster below /var/lib/postgresql.
  if ! docker container inspect apply-postgres >/dev/null 2>&1; then
    docker run -d --name apply-postgres --restart unless-stopped --network apply-database \
      --mount type=bind,src=/srv/apply/postgres,dst=/var/lib/postgresql \
      --mount type=bind,src=/run/apply-postgres,dst=/run/apply-postgres,readonly \
      -e POSTGRES_USER=apply_owner -e POSTGRES_DB=apply \
      -e POSTGRES_PASSWORD_FILE=/run/apply-postgres/owner \
      --memory 256m --memory-swap 256m --shm-size 64m --pids-limit 128 \
      --log-driver local --log-opt max-size=10m --log-opt max-file=3 \
      postgres:18.6 -c shared_buffers=64MB -c max_connections=20 \
      -c log_statement=none -c log_min_error_statement=panic -c log_parameter_max_length_on_error=0 >/dev/null
  else
    docker start apply-postgres >/dev/null
  fi
  for _attempt in $(seq 1 30); do
    if docker exec apply-postgres pg_isready -U apply_owner -d apply >/dev/null; then exit 0; fi
    sleep 1
  done
  echo 'PostgreSQL did not become ready'; exit 1
fi
if [ "$command" = backup ]; then
  destination=${2:?Backup file path required}
  [[ "$destination" = /srv/apply/backups/*.dump ]] || exit 1
  [ ! -e "$destination" ] || exit 1
  docker exec apply-postgres pg_dump -U apply_owner -d apply --format=custom --no-owner --no-acl > "$destination"
  test -s "$destination"
  exit 0
fi
image=${2:?Migration image required}
[[ "$image" = "$APPLY_REPOSITORY"@sha256:* ]] || exit 1
# The owner is intentionally confined to maintenance, never passed to the server.
python3 - <<'PY'
from pathlib import Path
runtime=Path('/run/apply/runtime.env').read_text()
owner=Path('/run/apply-postgres/owner').read_text()
lines=[line for line in runtime.splitlines() if not line.startswith(('PGUSER=','PGPASSWORD='))]
Path('/run/apply-postgres/migration.env').write_text('\n'.join(lines)+f'\nPGUSER=apply_owner\nPGPASSWORD={owner}\n')
PY
docker run --rm --network apply-database --env-file /run/apply-postgres/migration.env \
  --read-only --tmpfs /rails/tmp:uid=1000,gid=1000,mode=700 --tmpfs /rails/log:uid=1000,gid=1000,mode=700 \
  --memory 500m --memory-swap 500m "$image" ./bin/rails db:migrate db:seed >/dev/null
docker exec -i apply-postgres psql -X -v ON_ERROR_STOP=1 -U apply_owner -d apply >/dev/null <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='apply_runtime') THEN CREATE ROLE apply_runtime LOGIN; END IF;
  EXECUTE format('ALTER ROLE apply_runtime PASSWORD %L',pg_read_file('/run/apply-postgres/runtime'));
END $$;
SQL
docker run --rm --entrypoint cat "$image" /rails/db/runtime_privileges.sql | docker exec -i apply-postgres psql -X -v ON_ERROR_STOP=1 -U apply_owner -d apply >/dev/null
rm -f /run/apply-postgres/migration.env
