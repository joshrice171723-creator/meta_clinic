#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/meta-clinic/deploy
compose() { docker compose --env-file release.env "$@"; }
compose config --quiet
compose up -d --wait postgres
install -d -m 700 /opt/meta-clinic/backups
backup="/opt/meta-clinic/backups/before-migration-$(date -u +%Y%m%dT%H%M%SZ).dump"
compose exec -T postgres pg_dump -U apply_owner -d apply -Fc > "$backup"
compose run --rm migrate
compose run --rm --no-deps migrate cat db/runtime_privileges.sql |
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U apply_owner -d apply
compose run --rm migrate ./bin/rails runner /opt/provision-demo.rb
compose up -d api worker web
compose ps
