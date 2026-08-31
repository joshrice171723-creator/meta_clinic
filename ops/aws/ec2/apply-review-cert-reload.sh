#!/bin/bash
# Certbot calls this only after successful issuance/renewal. Never print keys.
set -euo pipefail
/usr/sbin/nginx -t
/usr/bin/systemctl reload nginx.service
