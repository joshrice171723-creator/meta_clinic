#!/bin/bash
# SSM runs this as root, with one repository@sha256 image argument, never secrets.
set -euo pipefail
umask 077
[ -f /etc/apply/bootstrap-ready ] || { echo 'Bootstrap is not ready'; exit 1; }
# shellcheck source=/dev/null
source /etc/apply/config
mountpoint -q /srv/apply
image=$1
[[ "$image" == "$APPLY_REPOSITORY"@sha256:* ]] || exit 1
[[ "${image##*@sha256:}" =~ ^[a-f0-9]{64}$ ]] || exit 1
exec 9>/run/apply-release.lock
flock -n 9 || { echo 'Another release is running'; exit 1; }

# The short-lived ECR token is piped directly to Docker and kept on host tmpfs.
docker_config=$(mktemp -d /run/apply-registry.XXXXXX)
trap 'rm -rf "$docker_config"' EXIT
registry=${APPLY_REPOSITORY%%/*}
aws ecr get-login-password | docker --config "$docker_config" login \
  --username AWS --password-stdin "$registry" >/dev/null
docker --config "$docker_config" pull "$image"
rm -rf "$docker_config"

install -d -m 700 /etc/apply/tls
if [ ! -f /etc/apply/tls/localhost.crt ]; then
  # Private key stays on the encrypted root volume. Export ONLY localhost.crt.
  openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 90 \
    -keyout /etc/apply/tls/localhost.key -out /etc/apply/tls/localhost.crt \
    -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' \
    -addext 'basicConstraints=critical,CA:FALSE' 2>/dev/null
fi
nginx -t

# Stop writes before a SQLite backup. A same-volume copy is NOT disaster recovery.
systemctl stop apply-web.service || true
release=$(date -u +%Y%m%dT%H%M%SZ)
if [ -f /srv/apply/storage/production.sqlite3 ]; then
  sqlite3 /srv/apply/storage/production.sqlite3 \
    ".backup '/srv/apply/backups/before-$release.sqlite3'"
  [ "$(sqlite3 "/srv/apply/backups/before-$release.sqlite3" 'PRAGMA integrity_check;')" = ok ]
fi
if [ -f /etc/apply/image ]; then
  cp /etc/apply/image "/srv/apply/backups/before-$release.image"
fi
printf '%s\n' "$image" > /etc/apply/image
systemctl daemon-reload
systemctl enable --now apply-web.service nginx.service
systemctl restart nginx.service
for _attempt in $(seq 1 45); do
  if curl --fail --silent --cacert /etc/apply/tls/localhost.crt \
      https://localhost:8443/up >/dev/null; then
    echo 'Private HTTPS health check passed. Hosted workflow/restore acceptance is still required.'
    exit 0
  fi
  sleep 2
done
systemctl stop apply-web.service
echo 'Release health check failed; app stopped. Inspect sanitized diagnostics; do not blindly roll back a migrated database.'
exit 1
