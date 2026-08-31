# APPly Rails service

Rails 8.1.3.1 / Ruby 3.4.10. This service holds consultancy member access, non-clinical training progress, demonstration paperwork, and contact inquiries. It is not the separately proposed clinical PostgreSQL model.

See the parent README for local setup, account provisioning, and checks. Seed data contains only original generic training examples; there are no default logins.

## HTTP interface

All application endpoints are under `/api`; `/up` is a boot health check.

- `GET csrf`: session-bound CSRF token.
- `GET/POST/DELETE session`: current account, login, logout.
- `POST development_session`: optional loopback-only synthetic login; requires `RAILS_ENV=development` and `APP_DEVELOPMENT_LOGIN=1`. Returns 404 otherwise. Existing demo sessions are also rejected when the guard no longer applies. See the parent README; never enable on a hosted service.
- `GET materials`, `GET materials/:id`: published guides, with the current user's progress.
- `POST materials/:id/start`, `POST materials/:id/complete`: personal learning progress.
- `GET paperworks`, `GET paperworks/:id`: documents assigned to the current user only.
- `POST paperworks/:id/start`, `POST paperworks/:id/sign`: review/sign demo documents only.
- `POST contact_messages`: validated business inquiry, persisted before success.
- `GET inquiries?before=ID`: admin-only, 50-row cursor pagination.

The frontend proxy forwards only the APPly session cookie and CSRF token and sets its fixed configured origin. Every Rails resource independently authenticates and authorizes access. No user/role/owner ID supplied by the browser controls ownership. Missing and other-client documents both return 404. Published shared training is visible to all provisioned active members; confidential per-client attachments are not a training feature.

## Production configuration — not deployed yet

Use a Ruby-capable host with TLS and persistent storage. The included Dockerfile is a deployment starting point, not a verified container build. Docker was unavailable on the workstation; native Rails was tested.

Required protected environment configuration:

- `RAILS_ENV=production`
- `SECRET_KEY_BASE`: a fresh strong Rails secret, stored in the host's secret manager.
- `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY`
- `ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY`
- `ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT`
- `FRONTEND_ORIGIN`: exact HTTPS frontend origin.
- `RAILS_BACKEND_URL`: exact HTTPS origin for this Rails service.
- `DATABASE_PATH`: persistent SQLite location, e.g. `/rails/storage/production.sqlite3`.

Generate encryption keys using Rails' `db:encryption:init` through an approved local secret-handling workflow. Do not paste values into chat, the vault, Git, or issue trackers. Back up and test recovery of both the encrypted database and encryption keys. Development/test derive keys locally; copying a database without the matching keys will not preserve decryptability.

The container runs as a non-root user. Mount a persistent volume at `/rails/storage`, with ownership suitable for UID 1000. Never place production SQLite on ephemeral image storage. Keep a single service instance while using SQLite and the current process-local rate limiter. Before scaling, choose shared storage/cache and validate concurrency and limits.

## Release checks still required

1. Choose and approve the actual host, domain, data flows, protected secret storage, database/backups, retention/deletion rules, and responsible operators.
2. Verify production TLS, Secure/HttpOnly/SameSite cookies, host/origin configuration, proxy trust, and rate limits. The current rate limiter can aggregate frontend-proxied traffic under one IP and is not a complete abuse-control system. Add shared/edge protection and monitoring appropriate to the selected host.
3. Provision administrators carefully; record confirmed-payment approval outside this prototype. Set up secure credential delivery/recovery and evaluate invitation expiry, first-login password change, MFA, and access review before serving confidential applicant material.
4. Supply reviewed packet versions and determine the required signing method for each recipient. Current code rejects signing non-demo documents. App-level immutability and SHA-256 digests are **not tamper-proof storage, independently verified identity, notarization, or proof of legal signature sufficiency**. Add appropriate audit/retention/export controls and professional review before enabling real signatures.
5. Configure verified training/video content and an approved private media path. Do not put patient data, privileged advice, or per-client documents into shared training.
6. Confirm contact privacy notices, response ownership, retention, notification delivery if wanted, and protected administrator access. Current messages are stored in the inbox; no email is sent.
7. Exercise backup/restore, failure/retry cases, accessibility and browser flows, and independent security review. Native tests and static scans do not establish production or HIPAA readiness.

The future PDF generation, institutional submission, status callbacks, and feedback pipeline are deliberately absent. No automatic external communications, institutional filings, payments, EHR connections, or SharePoint access occur.
