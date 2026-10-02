#!/usr/bin/env bash
# Existing host access only. No timer is installed by this command.
set -Eeuo pipefail
umask 077
mode=${1:---check}
[[ $# -le 1 && ( $mode == --check || $mode == --run ) ]] || { echo 'Usage: reset-sandbox.sh [--check|--run]' >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo 'Run on the existing Lightsail host as root.' >&2; exit 2; }
cd /opt/meta-clinic/deploy
[[ -f release.env && -f /opt/meta-clinic/secrets/guided-demo.env ]] || { echo 'Existing demo configuration missing.' >&2; exit 1; }
exec 9>/opt/meta-clinic/release.lock
flock -n 9 || { echo 'Release or sandbox reset already running.' >&2; exit 1; }
compose() { docker compose -f compose.yml -f guided-demo.compose.yml --env-file release.env "$@"; }
state="/opt/meta-clinic/backups/sandbox-$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 700 "$state"
scratch=""
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n $scratch && $scratch =~ ^sandbox_check_[0-9]+_[0-9]+$ ]]; then
    compose exec -T postgres dropdb -U apply_owner --if-exists "$scratch" >/dev/null || status=1
  fi
  printf '%s status=%s mode=%s\n' "$(date -u +%FT%TZ)" "$status" "$mode" >> "$state/result.log"
  [[ $status == 0 ]] || echo "Sandbox reset stopped. Retained recovery and diagnostics: $state" >&2
  exit "$status"
}
trap cleanup EXIT
# The service independently checks hosted mode and the exact connected database.
compose exec -T guided-demo ./bin/rails runner 'Development::SandboxReset.check!; puts "Sandbox role and database guards passed"' > "$state/check.log" 2>&1
database=apply_guided_demo
compose exec -T postgres pg_dump -U apply_owner -d "$database" -Fc > "$state/demo.dump"
compose exec -T postgres pg_restore --list < "$state/demo.dump" > "$state/backup-list.log"
scratch="sandbox_check_$$_$RANDOM"
compose exec -T postgres createdb -U apply_owner "$scratch"
compose exec -T postgres pg_restore --exit-on-error --no-owner --no-acl -U apply_owner -d "$scratch" < "$state/demo.dump" > "$state/restore.log" 2>&1
# Compare important persisted rows as well as the complete restore's success.
counts='SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM clinic_patients), (SELECT count(*) FROM clinic_role_grants), (SELECT count(*) FROM development_demo_runs)'
original=$(compose exec -T postgres psql -v ON_ERROR_STOP=1 -At -U apply_owner -d "$database" -c "$counts")
restored=$(compose exec -T postgres psql -v ON_ERROR_STOP=1 -At -U apply_owner -d "$scratch" -c "$counts")
[[ -n $original && $original == "$restored" ]] || { echo 'Scratch restore verification failed; no reset performed.' >&2; exit 1; }
sha256sum "$state/demo.dump" > "$state/demo.dump.sha256"
compose exec -T postgres dropdb -U apply_owner "$scratch" >/dev/null
scratch=""
printf '%s\n' 'Backup restored and checked; original demo remains unchanged.' > "$state/verified"
if [[ $mode == --run ]]; then
  compose exec -T -e SANDBOX_RESET_BACKUP_VERIFIED=1 guided-demo ./bin/rails runner 'puts Development::SandboxReset.run!.to_json' > "$state/reset.log" 2>&1
fi
echo "Sandbox ${mode#--} completed. Recovery: $state"
