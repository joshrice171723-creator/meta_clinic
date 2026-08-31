# APPly Rails application

See [the site README](../README.md) for both experiences, local startup and verification.

The `backend/` directory is now the **entire Rails application**, including HTML, CSS, forms and database code. The name is retained to avoid moving the existing database, lockfile and deployment paths.

## Authentication and boundaries

`Web::*` renders selling/onboarding pages. `Clinic::*` renders a distinct operations interface. Both use individual provisioned Rails accounts; clinic authorization additionally requires an active `Clinic::Membership` with section-specific capabilities. Staff-directory entries are not authentication identities. No automatic privilege inheritance from consultancy administration.

The retained `/api/*` endpoints continue to serve consultancy sessions/materials/paperwork/contact/inquiries for compatibility and regression testing. There is no JavaScript proxy or cross-origin frontend. All mutations require Rails CSRF protection; protected responses are no-store/noindex. CSP disables scripts, embeds and external connections.

Clinic pages are a non-production synthetic prototype. They use separate prefixed tables in the local SQLite database, not the production EHR schema. Database composite constraints enforce note/patient clinic consistency. Shared runtime and operator privileges remain shared risks; these controls are not production tenant-isolation approval.

## Production configuration — not deployed

The selling/onboarding application needs:

- `RAILS_ENV=production`
- `APP_SITE_ORIGIN`: exact HTTPS origin, without path, credentials, query or fragment
- `SECRET_KEY_BASE`: fresh strong secret, managed outside source/chat
- `ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY`
- `ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY`
- `ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT`
- `DATABASE_PATH`: persistent SQLite path for a **single-instance synthetic staging** setup, e.g. `/rails/storage/production.sqlite3`

No `FRONTEND_ORIGIN` or `RAILS_BACKEND_URL` is required. Never copy local keys/databases into staging. Preserve independent encryption-key backups and prove restore; losing keys loses encrypted content. Use an approved secret-handling workflow, never paste values into the vault, Git, or agent output.

The Dockerfile remains an unverified build starting point. Run it behind a trusted HTTPS terminator; never expose Puma directly to the internet. Mount persistent storage with UID 1000 ownership. Production assumes SSL termination; verify forwarded-protocol behavior and prevent direct backend access. Static CSS is revalidated rather than cached for a year.

Use one process/instance while SQLite and process-local rate limits remain. No PostgreSQL production adapter, durable shared limiter, high availability, access audit pipeline or automated restore is configured. Choose/review those before real client/clinical release; see [AWS guidance](../deploy/aws.md).

The local demo shortcut is denied in production regardless of its flag. **All clinic routes are also denied in production regardless of account or flag.** This is a release boundary, not a compliance certification or sufficient real-data safeguard.

## Release work remaining

Operator activation/recovery delivery, MFA, audit/monitoring, scoped confidential-data permissions, reviewed packet/content, real signatures, PDF/institution pipeline, private media, notices/retention, encrypted backup/restore, clinical workflow review and full access-isolation assessment remain open. No PHI, real applicant records, public release or AWS resource provisioning is authorized by this README.
