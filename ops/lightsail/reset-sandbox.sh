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
scratch_created=0
guard_pid=""
cleanup() {
  local status=$?
  trap - EXIT
  if [[ $scratch_created == 1 && $scratch =~ ^sandbox_check_[0-9]+_[0-9]+$ ]]; then
    compose exec -T postgres dropdb -U apply_owner --if-exists "$scratch" >/dev/null || status=1
  fi
  if [[ -n $guard_pid ]]; then
    exec 11>&-
    wait "$guard_pid" >/dev/null 2>&1 || true
  fi
  printf '%s status=%s mode=%s\n' "$(date -u +%FT%TZ)" "$status" "$mode" >> "$state/result.log"
  [[ $status == 0 ]] || echo "Sandbox reset stopped. Retained recovery and diagnostics: $state" >&2
  exit "$status"
}
trap cleanup EXIT
# Keep the shared pool lock on the SAME Rails connection through backup and reset.
# Closing the pipe on failure aborts the transaction; its timeout bounds orphan locks.
coproc RESET_GUARD {
  compose exec -T -e SANDBOX_RESET_MODE="$mode" guided-demo ./bin/rails runner '
    Development::SandboxReset.with_pool_lock do
      $stdout.sync = true
      puts "SANDBOX_LOCK_READY"
      raise "Backup verification handshake failed" unless IO.select([STDIN], nil, nil, 600) && STDIN.gets&.strip == "BACKUP_VERIFIED"
      if ENV["SANDBOX_RESET_MODE"] == "--run"
        ENV["SANDBOX_RESET_BACKUP_VERIFIED"] = "1"
        puts Development::SandboxReset.run!.to_json
      end
    end
  ' 2> "$state/guard.log"
}
guard_pid=$RESET_GUARD_PID
guard_original_read=${RESET_GUARD[0]}
guard_original_write=${RESET_GUARD[1]}
exec 10<&"$guard_original_read"
exec 11>&"$guard_original_write"
exec {guard_original_read}<&-
exec {guard_original_write}>&-
IFS= read -r -t 120 ready <&10
[[ $ready == SANDBOX_LOCK_READY ]] || { echo 'Demo guard did not acquire the pool lock.' >&2; exit 1; }
database=apply_guided_demo
compose exec -T postgres pg_dump -U apply_owner -d "$database" -Fc > "$state/demo.dump"
compose exec -T postgres pg_restore --list < "$state/demo.dump" > "$state/backup-list.log"
scratch="sandbox_check_$$_$RANDOM"
compose exec -T postgres createdb -U apply_owner "$scratch"
scratch_created=1
compose exec -T postgres pg_restore --exit-on-error --no-owner --no-acl -U apply_owner -d "$scratch" < "$state/demo.dump" > "$state/restore.log" 2>&1
# Compare important persisted rows as well as the complete restore's success.
counts='SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM clinic_patients), (SELECT count(*) FROM clinic_role_grants), (SELECT count(*) FROM development_demo_runs)'
original=$(compose exec -T postgres psql -v ON_ERROR_STOP=1 -At -U apply_owner -d "$database" -c "$counts")
restored=$(compose exec -T postgres psql -v ON_ERROR_STOP=1 -At -U apply_owner -d "$scratch" -c "$counts")
[[ -n $original && $original == "$restored" ]] || { echo 'Scratch restore verification failed; no reset performed.' >&2; exit 1; }
sha256sum "$state/demo.dump" > "$state/demo.dump.sha256"
compose exec -T postgres dropdb -U apply_owner "$scratch" >/dev/null
scratch_created=0
scratch=""
printf '%s\n' 'Backup restored and checked; original demo remains unchanged.' > "$state/verified"
printf '%s\n' BACKUP_VERIFIED >&11
exec 11>&-
cat <&10 > "$state/reset.log"
wait "$guard_pid"
guard_pid=""
echo "Sandbox ${mode#--} completed. Recovery: $state"
