# Portable deployment instructions

This directory contains provider-neutral, owner-controlled packaging. It does not authorize a hosted deployment, public ingress, spending, real data, or production use.

- Keep credentials in an untracked deployment-host environment file; never commit or print values.
- Pin releases to one reviewed API/web commit tag. Do not use mutable `latest` tags.
- Back up and restore PostgreSQL before any migration or release.
- Keep the default listener loopback-only until TLS, access control, recovery, and the intended audience are reviewed.
- Run `docker compose config` and `bin/verify-portable-delivery` after changes.
