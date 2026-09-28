#!/usr/bin/env bash
# One-time, explicit installation from a reviewed checkout; does not enable the timer.
set -Eeuo pipefail
umask 077
[[ $EUID -eq 0 ]] || { echo 'Run on the authorized Lightsail host as root.' >&2; exit 1; }
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ -f /opt/meta-clinic/deploy/current-revision ]] || { echo 'Existing deployment is required.' >&2; exit 1; }
revision=$(git -C "$here" rev-parse HEAD)
[[ -z $(git -C "$here" status --porcelain --untracked-files=no) ]] || {
  echo 'Install from a clean, reviewed checkout.' >&2; exit 1;
}
[[ $(cat /opt/meta-clinic/deploy/current-revision) == "$revision" ]] || {
  echo 'First perform a reviewed baseline release of this exact infrastructure commit.' >&2; exit 1;
}
if systemctl is-active --quiet meta-clinic-auto-release.service; then
  echo 'A release is active; wait for it to finish before installing.' >&2; exit 1
fi
if systemctl is-active --quiet meta-clinic-auto-release.timer; then
  echo 'Stop the release timer explicitly before upgrading installed automation.' >&2; exit 1
fi
exec 9>/opt/meta-clinic/release.lock
flock -n 9 || { echo 'Another release holds the lock.' >&2; exit 1; }
install -d -m 700 /opt/meta-clinic/automation /etc/meta-clinic
install -d -m 711 /var/lib/meta-clinic-release
install -d -m 755 /var/lib/meta-clinic-release/public
for script in qa_policy.py auto_release.py release.sh verify-demo.py; do
  install -m 600 "$here/$script" "/opt/meta-clinic/automation/$script"
done
install -m 644 "$here/version-location.conf" /etc/nginx/snippets/meta-clinic-version.conf
install -m 644 "$here/meta-clinic-auto-release.service" /etc/systemd/system/
install -m 644 "$here/meta-clinic-auto-release.timer" /etc/systemd/system/
if [[ ! -e /etc/meta-clinic/auto-release.json ]]; then
  install -m 600 "$here/auto-release.example.json" /etc/meta-clinic/auto-release.json
fi
systemctl daemon-reload
echo 'Installed only. Configure credentials, recovery mounts, nginx include and baseline before activation.'
