#!/usr/bin/env bash
set -euo pipefail
umask 077
cd /opt/meta-clinic/deploy

: "${APP_PLATFORM_OWNER_EMAIL:?Set APP_PLATFORM_OWNER_EMAIL for the intended owner}"
compose() { docker compose --env-file release.env "$@"; }

compose run --rm \
  -e APP_PLATFORM_OWNER_EMAIL="$APP_PLATFORM_OWNER_EMAIL" \
  migrate ./bin/rails platform:owner:invite
