#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/meta-clinic/deploy
compose() { docker compose --env-file release.env "$@"; }
install -d -m 700 /opt/meta-clinic/backups
backup="/opt/meta-clinic/backups/verified-$(date -u +%Y%m%dT%H%M%SZ).dump"
compose exec -T postgres pg_dump -U apply_owner -d apply -Fc > "$backup"
compose exec -T postgres pg_restore --list < "$backup" >/dev/null
scratch="meta_clinic_restore_$(openssl rand -hex 6)"
compose exec -T postgres createdb -U apply_owner "$scratch"
cleanup() { compose exec -T postgres dropdb -U apply_owner "$scratch"; }
trap cleanup EXIT
compose exec -T postgres pg_restore --exit-on-error -U apply_owner -d "$scratch" < "$backup"
original=$(compose exec -T postgres psql -At -U apply_owner -d apply -c 'SELECT count(*) FROM users')
restored=$(compose exec -T postgres psql -At -U apply_owner -d "$scratch" -c 'SELECT count(*) FROM users')
test "$original" = "$restored"
echo 'PASS: database backup parsed and restored into an isolated scratch database.'
