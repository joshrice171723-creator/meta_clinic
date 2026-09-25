#!/usr/bin/env bash
# Run only through release.ps1: it copies and encrypts the recovery archive before deploy.
set -Eeuo pipefail
umask 077

usage() { echo "Usage: release.sh prepare COMMIT_SHA local|registry | deploy COMMIT_SHA RECOVERY_SHA256" >&2; exit 2; }
[[ $# -ge 2 && $# -le 3 ]] || usage
phase=$1
revision=$2
[[ $revision =~ ^[0-9a-f]{40}$ ]] || usage
[[ $EUID -eq 0 ]] || { echo "Run as root on the Lightsail host." >&2; exit 2; }
[[ $phase == prepare || $phase == deploy ]] || usage
[[ $# -eq 3 ]] || usage

cd /opt/meta-clinic/deploy
exec 9>/opt/meta-clinic/release.lock
flock -n 9 || { echo "Another release is running." >&2; exit 1; }

repo=ghcr.io/joshrice171723-creator
secrets=/opt/meta-clinic/secrets
backups=/opt/meta-clinic/backups
release_file=/opt/meta-clinic/deploy/release.env
state=$backups/release-$revision
export DOCKER_CONFIG=$secrets/docker-config
compose() {
  local env_file=$1
  shift
  docker compose -f compose.yml -f guided-demo.compose.yml --env-file "$env_file" "$@"
}

restore_scratch=""
cleanup_scratch() {
  if [[ -n $restore_scratch ]]; then
    compose "$release_file" exec -T postgres dropdb -U apply_owner --if-exists "$restore_scratch" >/dev/null || true
  fi
}
trap cleanup_scratch EXIT

backup_and_check() {
  local database=$1 target=$2 original restored scratch
  compose "$release_file" exec -T postgres pg_dump -U apply_owner -d "$database" -Fc > "$target"
  compose "$release_file" exec -T postgres pg_restore --list < "$target" >/dev/null
  scratch="release_check_${revision:0:8}_${RANDOM}"
  compose "$release_file" exec -T postgres createdb -U apply_owner "$scratch"
  restore_scratch=$scratch
  compose "$release_file" exec -T postgres pg_restore --exit-on-error --no-owner --no-acl -U apply_owner -d "$restore_scratch" < "$target" >/dev/null
  original=$(compose "$release_file" exec -T postgres psql -At -U apply_owner -d "$database" -c 'SELECT count(*) FROM users')
  restored=$(compose "$release_file" exec -T postgres psql -At -U apply_owner -d "$restore_scratch" -c 'SELECT count(*) FROM users')
  [[ $original == "$restored" ]] || { echo "Restore count differs for $database." >&2; exit 1; }
  cleanup_scratch
  restore_scratch=""
}

if [[ $phase == prepare ]]; then
  image_source=$3
  [[ $image_source == local || $image_source == registry ]] || usage
  [[ -f $release_file && -f $secrets/guided-demo.env ]] || { echo "Existing release or guided-demo credentials are missing." >&2; exit 1; }
  python3 -c 'import requests' || { echo "Python 3 requests is required for hosted verification." >&2; exit 1; }
  [[ ! -e $state ]] || { echo "A preparation for this commit already exists: $state" >&2; exit 1; }
  if [[ $image_source == registry ]]; then
    api_tag=$repo/meta-clinic-api:sha-$revision
    web_tag=$repo/meta-clinic-web:sha-$revision
    docker pull "$api_tag" >/dev/null
    docker pull "$web_tag" >/dev/null
  else
    api_tag=meta-clinic-api:$revision
    web_tag=meta-clinic-web:$revision
  fi
  for tag in "$api_tag" "$web_tag"; do
    actual=$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$tag")
    [[ $actual == "$revision" ]] || { echo "Image revision mismatch: $tag" >&2; exit 1; }
  done
  docker run --rm --tmpfs /tmp --entrypoint nginx "$web_tag" -t >/dev/null
  if [[ $image_source == registry ]]; then
    api_image=$(docker image inspect --format '{{index .RepoDigests 0}}' "$api_tag")
    web_image=$(docker image inspect --format '{{index .RepoDigests 0}}' "$web_tag")
    [[ $api_image == *@sha256:* && $web_image == *@sha256:* ]] || { echo "Image digests unavailable." >&2; exit 1; }
  else
    api_image=$api_tag
    web_image=$web_tag
  fi
  install -d -m 700 "$backups" "$state"
  cp "$release_file" "$state/previous.env"
  printf 'API_IMAGE=%s\nWEB_IMAGE=%s\n' "$api_image" "$web_image" > "$state/candidate.env"
  printf 'API_ID=%s\nWEB_ID=%s\n' \
    "$(docker image inspect --format '{{.Id}}' "$api_tag")" \
    "$(docker image inspect --format '{{.Id}}' "$web_tag")" > "$state/image-ids"
  compose "$state/candidate.env" config --quiet
  backup_and_check apply "$state/apply.dump"
  backup_and_check apply_guided_demo "$state/apply_guided_demo.dump"
  tar -C /opt/meta-clinic -czf "$state/recovery.tar.gz" \
    "backups/release-$revision/apply.dump" \
    "backups/release-$revision/apply_guided_demo.dump" \
    "backups/release-$revision/previous.env" \
    "backups/release-$revision/candidate.env" \
    "backups/release-$revision/image-ids" secrets
  handoff="/home/ubuntu/meta-clinic-recovery-$revision.tar.gz"
  install -m 600 -o ubuntu -g ubuntu "$state/recovery.tar.gz" "$handoff"
  printf '%s\n' "$revision" > "$state/prepared"
  printf 'RECOVERY_ARCHIVE=%s\nRECOVERY_SHA256=%s\n' \
    "$handoff" "$(sha256sum "$state/recovery.tar.gz" | cut -d ' ' -f 1)"
  exit 0
fi

expected_sha=$3
[[ $expected_sha =~ ^[0-9a-f]{64}$ ]] || usage
[[ -f $state/prepared && -f $state/previous.env && -f $state/candidate.env && -f $state/recovery.tar.gz ]] || {
  echo "Prepare this exact commit first." >&2; exit 1;
}
[[ $(sha256sum "$state/recovery.tar.gz" | cut -d ' ' -f 1) == "$expected_sha" ]] || {
  echo "Recovery archive checksum mismatch." >&2; exit 1;
}
cmp -s "$release_file" "$state/previous.env" || {
  echo "The hosted release changed after preparation; prepare again." >&2; exit 1;
}
for component in API WEB; do
  image=$(sed -n "s/^${component}_IMAGE=//p" "$state/candidate.env")
  expected_id=$(sed -n "s/^${component}_ID=//p" "$state/image-ids")
  [[ -n $image && -n $expected_id && $(docker image inspect --format '{{.Id}}' "$image") == "$expected_id" ]] || {
    echo "Prepared $component image changed or is missing." >&2; exit 1;
  }
done

activated=0
rollback() {
  local status=$?
  trap - ERR
  if [[ $activated -eq 1 ]]; then
    cp "$state/previous.env" "$release_file"
    if compose "$release_file" up -d --pull never api worker guided-demo web; then
      echo "Previous image references restarted; verify their health." >&2
    else
      echo "Image rollback failed; recover from $state immediately." >&2
    fi
  fi
  echo "Release failed. Database migrations were not reversed. Recovery: $state" >&2
  exit "$status"
}
trap rollback ERR

compose "$state/candidate.env" run --rm migrate ./bin/rails db:migrate
compose "$state/candidate.env" run --rm migrate ./bin/rails runner 'Development::OmniAccess.send(:ensure_roles!)'
compose "$state/candidate.env" run --rm --no-deps guided-demo ./bin/rails db:migrate
compose "$state/candidate.env" run --rm --no-deps guided-demo ./bin/rails runner 'Development::TestAccounts.prepare_omni!'
docker run --rm --entrypoint cat "$(sed -n 's/^API_IMAGE=//p' "$state/candidate.env")" /rails/db/runtime_privileges.sql |
  compose "$release_file" exec -T postgres psql -v ON_ERROR_STOP=1 -U apply_owner -d apply
if grep -q '^APP_PUBLIC_DEVELOPMENT_LOGIN=1$' "$secrets/runtime.env"; then
  compose "$state/candidate.env" run --rm --no-deps api ./bin/rails runner 'Development::TestAccounts.prepare_omni!'
fi
activated=1
install -m 600 "$state/candidate.env" "$release_file"
compose "$release_file" up -d --pull never --wait --wait-timeout 120 api worker guided-demo web
for path in /login /up /api/demo-workspace/csrf /demo /clinic; do
  # Compose reports running containers before Rails finishes booting.
  deadline=$((SECONDS + 90))
  while :; do
    status=$(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' "https://aimetaclinic.com$path") || status=000
    [[ $status == 200 ]] && break
    if (( SECONDS >= deadline )); then
      echo "$path did not become ready (last status $status)." >&2
      false
    fi
    sleep 2
  done
done
status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 15 https://aimetaclinic.com/api/clinic/context)
[[ $status == 401 || $status == 403 || $status == 404 ]] || { echo "Anonymous clinic access returned $status." >&2; false; }
python3 "/tmp/meta-clinic-verify-$revision.py"
printf '%s\n' "$revision" > /opt/meta-clinic/deploy/current-revision
echo "RELEASED=$revision"
echo "API_IMAGE=$(sed -n 's/^API_IMAGE=//p' "$release_file")"
echo "WEB_IMAGE=$(sed -n 's/^WEB_IMAGE=//p' "$release_file")"
