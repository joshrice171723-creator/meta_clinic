#!/bin/bash
# SSM installs an API/web digest pair. Both must be verified before promotion.
set -euo pipefail
umask 077
[ -f /etc/apply/bootstrap-ready ] || { echo 'Bootstrap is not ready'; exit 1; }
# shellcheck source=/dev/null
source /etc/apply/config
mountpoint -q /srv/apply
# This host is administered through SSM; do not leave the AMI's SSH daemon listening.
systemctl mask --now sshd.service
image=${1:?API digest required}
web_image=${2:?Frontend digest required}
generation=${3:-0}
[[ "$generation" =~ ^[0-9]{1,18}$ ]] || exit 1
[[ "$image" == "$APPLY_REPOSITORY"@sha256:* ]] || exit 1
[[ "${image##*@sha256:}" =~ ^[a-f0-9]{64}$ ]] || exit 1
[[ "$web_image" == "$APPLY_REPOSITORY"@sha256:* ]] || exit 1
[[ "${web_image##*@sha256:}" =~ ^[a-f0-9]{64}$ ]] || exit 1
exec 9>/run/apply-release.lock
flock -n 9 || { echo 'Another release is running'; exit 1; }
previous_generation=$(cat /etc/apply/release-generation 2>/dev/null || echo 0)
if [ "$generation" -gt 0 ] && [ "$generation" -le "$previous_generation" ]; then
  echo 'Stale or already applied release; no changes made'
  exit 1
fi
# Preserve enough space to pull the candidate and make a database backup.
[ "$(df -Pk / | awk 'NR == 2 {print $4}')" -ge 1048576 ] || { echo 'Root disk needs at least 1 GiB free'; exit 1; }
db_kib=$(du -sk /srv/apply/postgres 2>/dev/null | cut -f1 || true)
[ "$(df -Pk /srv/apply | awk 'NR == 2 {print $4}')" -ge "$(( ${db_kib:-0} + 102400 ))" ] || { echo 'Data disk needs room for a backup plus 100 MiB'; exit 1; }

# The short-lived ECR token is piped directly to Docker and kept on host tmpfs.
docker_config=$(mktemp -d /run/apply-registry.XXXXXX)
receipt_temp=
trap 'rm -rf "$docker_config"; [ -z "${receipt_temp:-}" ] || rm -f "$receipt_temp"' EXIT
registry=${APPLY_REPOSITORY%%/*}
aws ecr get-login-password | docker --config "$docker_config" login \
  --username AWS --password-stdin "$registry" >/dev/null
docker --config "$docker_config" pull "$image"
docker --config "$docker_config" pull "$web_image"
rm -rf "$docker_config"

install -d -m 700 /etc/apply/tls
if [ ! -f /etc/apply/tls/localhost.crt ]; then
  # Private key stays on the encrypted root volume. Export ONLY localhost.crt.
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 90 \
    -keyout /etc/apply/tls/localhost.key -out /etc/apply/tls/localhost.crt \
    -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' \
    -addext 'basicConstraints=critical,CA:FALSE' 2>/dev/null
fi
# Initial placeholders keep nginx configuration valid until ExecStartPost
# resolves both container addresses. Subsequent restarts refresh each address.
install -d -m 700 /etc/apply/upstreams
for component in api web; do
  if [ ! -f "/etc/apply/upstreams/$component.conf" ]; then
    printf 'server 127.0.0.1:9;\n' > "/etc/apply/upstreams/$component.conf"
  fi
done
nginx -t

# Legacy hosts must complete the explicit offline cutover before normal releases.
if [ -f /srv/apply/storage/production.sqlite3 ] && [ ! -f /etc/apply/postgres-cutover-verified ]; then
  echo 'Legacy SQLite data exists: complete the documented verified cutover first'; exit 1
fi
systemctl stop apply-clinic-worker.service || true
systemctl stop apply-web.service apply-api.service || true
systemctl daemon-reload
systemctl enable --now apply-postgres.service
release=$(date -u +%Y%m%dT%H%M%SZ)
/usr/local/sbin/apply-postgres backup "/srv/apply/backups/before-$release.dump"
install -d -m 700 /run/apply
# Prepare runtime secrets without starting a server or changing the saved image.
/usr/local/sbin/apply-run prepare
/usr/local/sbin/apply-postgres migrate "$image"
if [ -f /etc/apply/image ]; then
  cp /etc/apply/image "/srv/apply/backups/before-$release.image"
fi
if [ -f /etc/apply/web-image ]; then
  cp /etc/apply/web-image "/srv/apply/backups/before-$release.web-image"
fi
printf '%s\n' "$image" > /etc/apply/image
printf '%s\n' "$web_image" > /etc/apply/web-image
systemctl daemon-reload
systemctl enable --now apply-api.service apply-web.service nginx.service
systemctl restart nginx.service
for _attempt in $(seq 1 45); do
  if curl --fail --silent --cacert /etc/apply/tls/localhost.crt \
      https://localhost:8443/up >/dev/null && curl --fail --silent --cacert /etc/apply/tls/localhost.crt https://localhost:8443/health >/dev/null; then
    if ! docker exec -e APPLY_EXPECTED_ENVIRONMENT="$APPLY_ENVIRONMENT" apply-api ./bin/rails runner 'raise "Wrong deployment" unless Rails.env.production? && ENV.fetch("APP_DEPLOYMENT_ENV") == ENV.fetch("APPLY_EXPECTED_ENVIRONMENT"); raise "Demo enabled" if ENV["APP_DEPLOYMENT_ENV"] == "production" && DemoContent.enabled?; raise "Invalid database" unless ActiveRecord::Base.connection.adapter_name == "PostgreSQL" && ActiveRecord::Base.connection.select_value("SELECT current_user") == "apply_runtime"' >/dev/null 2>&1; then
      systemctl stop apply-clinic-worker.service || true
      systemctl stop apply-web.service apply-api.service
      echo 'Release database/environment verification failed; app stopped'
      exit 1
    fi
    if ! systemctl enable --now apply-clinic-worker.service || ! systemctl is-active --quiet apply-clinic-worker.service; then
      systemctl stop apply-clinic-worker.service || true
      systemctl stop apply-web.service apply-api.service
      echo 'Release worker startup failed; app stopped'
      exit 1
    fi
    if [ "$APPLY_ENVIRONMENT" = staging ]; then
      before_restart=$(/usr/local/sbin/apply-run pilot-readiness) || {
        systemctl stop apply-clinic-worker.service || true
        systemctl stop apply-web.service apply-api.service
        echo 'Staging pilot-readiness check failed; app stopped'
        exit 1
      }
      systemctl restart apply-api.service apply-clinic-worker.service
      restart_ready=0
      for _restart_attempt in $(seq 1 45); do
        if curl --fail --silent --cacert /etc/apply/tls/localhost.crt https://localhost:8443/up >/dev/null && \
            systemctl is-active --quiet apply-clinic-worker.service; then
          restart_ready=1
          break
        fi
        sleep 2
      done
      if [ "$restart_ready" -ne 1 ]; then
        systemctl stop apply-clinic-worker.service || true
        systemctl stop apply-web.service apply-api.service
        echo 'Staging services did not recover after restart; app stopped'
        exit 1
      fi
      after_restart=$(/usr/local/sbin/apply-run pilot-readiness) || true
      if [ -z "$after_restart" ] || [ "$before_restart" != "$after_restart" ]; then
        systemctl stop apply-clinic-worker.service || true
        systemctl stop apply-web.service apply-api.service
        echo 'Staging state did not survive restart; app stopped'
        exit 1
      fi
      install -d -m 700 /srv/apply/releases
      receipt_path="/srv/apply/releases/$release-$generation-pilot-readiness.json"
      receipt_temp=$(mktemp /srv/apply/releases/.pilot-readiness.XXXXXX)
      PILOT_STATE="$after_restart" API_IMAGE="$image" WEB_IMAGE="$web_image" \
        RELEASE_GENERATION="$generation" RELEASED_AT="$release" python3 - "$receipt_temp" <<'PY'
import json, os, sys
state = json.loads(os.environ['PILOT_STATE'])
receipt = {
    'format': 1,
    'released_at': os.environ['RELEASED_AT'],
    'generation': int(os.environ['RELEASE_GENERATION']),
    'images': {'api': os.environ['API_IMAGE'], 'web': os.environ['WEB_IMAGE']},
    'state': state,
}
with open(sys.argv[1], 'w', encoding='utf-8') as output:
    json.dump(receipt, output, sort_keys=True, separators=(',', ':'))
    output.write('\n')
PY
      chmod 600 "$receipt_temp"
      if ! ln "$receipt_temp" "$receipt_path"; then
        rm -f "$receipt_temp"
        systemctl stop apply-clinic-worker.service || true
        systemctl stop apply-web.service apply-api.service
        echo 'Staging readiness receipt already exists; app stopped'
        exit 1
      fi
      rm -f "$receipt_temp"
    fi
    [ "$generation" -eq 0 ] || printf '%s\n' "$generation" > /etc/apply/release-generation
    printf '%s\n' "$image" > /etc/apply/verified-image
    printf '%s\n' "$web_image" > /etc/apply/verified-web-image
    echo 'Private HTTPS, database, deployment-policy and staging continuity checks passed.'
    exit 0
  fi
  sleep 2
done
systemctl stop apply-clinic-worker.service || true
systemctl stop apply-web.service apply-api.service
echo 'Release health check failed; app stopped. Inspect sanitized diagnostics; do not blindly roll back a migrated database.'
exit 1
