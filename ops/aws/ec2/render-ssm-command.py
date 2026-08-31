#!/usr/bin/env python3
"""Render non-secret SSM parameters to stdout; does not contact AWS or deploy."""
import argparse
import base64
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('image', help='Exact ECR repository@sha256:digest; no mutable tag')
parser.add_argument('--web-image', required=True, help='Exact static frontend ECR digest')
args = parser.parse_args()
if not all(re.fullmatch(r'\d{12}\.dkr\.ecr\.us-east-[12]\.amazonaws\.com/[a-z0-9/_-]+@sha256:[a-f0-9]{64}', image) for image in [args.image, args.web_image]):
    parser.error('Expected an immutable private ECR digest in US East')
root = Path(__file__).resolve().parent
files = {
    'apply-run.sh': ('/usr/local/sbin/apply-run', '700'),
    'install-release.sh': ('/usr/local/sbin/apply-install-release', '700'),
    'apply-api.service': ('/etc/systemd/system/apply-api.service', '644'),
    'apply-web.service': ('/etc/systemd/system/apply-web.service', '644'),
    'postgres.sh': ('/usr/local/sbin/apply-postgres', '700'),
    'apply-postgres.service': ('/etc/systemd/system/apply-postgres.service', '644'),
    'nginx.conf': ('/etc/nginx/nginx.conf', '644'),
}
commands = ['set -eu', 'umask 077', 'test -f /etc/apply/bootstrap-ready']
for source, (destination, mode) in files.items():
    encoded = base64.b64encode((root / source).read_bytes()).decode('ascii')
    commands.extend([f"printf '%s' '{encoded}' | base64 --decode > '{destination}'",
                     f"chmod {mode} '{destination}'"])
commands.append(f"/usr/local/sbin/apply-install-release '{args.image}' '{args.web_image}'")
print(json.dumps({'commands': ['\n'.join(commands)], 'executionTimeout': ['600']}))
