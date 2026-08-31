#!/usr/bin/env python3
"""Render non-secret SSM parameters to stdout; does not contact AWS or deploy."""
import argparse
import base64
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('image', help='Exact ECR repository@sha256:digest; no mutable tag')
args = parser.parse_args()
if not re.fullmatch(r'\d{12}\.dkr\.ecr\.us-east-[12]\.amazonaws\.com/[a-z0-9/_-]+@sha256:[a-f0-9]{64}', args.image):
    parser.error('Expected an immutable private ECR digest in US East')
root = Path(__file__).resolve().parent
files = {
    'apply-run.sh': ('/usr/local/sbin/apply-run', '700'),
    'install-release.sh': ('/usr/local/sbin/apply-install-release', '700'),
    'apply-web.service': ('/etc/systemd/system/apply-web.service', '644'),
    'nginx.conf': ('/etc/nginx/nginx.conf', '644'),
}
commands = ['set -eu', 'umask 077', 'test -f /etc/apply/bootstrap-ready']
for source, (destination, mode) in files.items():
    encoded = base64.b64encode((root / source).read_bytes()).decode('ascii')
    commands.extend([f"printf '%s' '{encoded}' | base64 --decode > '{destination}'",
                     f"chmod {mode} '{destination}'"])
commands.append(f"/usr/local/sbin/apply-install-release '{args.image}'")
print(json.dumps({'commands': ['\n'.join(commands)], 'executionTimeout': ['600']}))
