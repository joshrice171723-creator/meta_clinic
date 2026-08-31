# APPly Rails application

See [the site README](../README.md) for both experiences, local startup and verification.

The `backend/` directory is now the **entire Rails application**, including HTML, CSS, forms and database code. The name is retained to avoid moving the existing database, lockfile and deployment paths.

## Authentication and boundaries

`Web::*` renders selling/onboarding pages. `Clinic::*` renders a distinct operations interface. Both use individual provisioned Rails accounts; clinic authorization additionally requires an active `Clinic::Membership` with section-specific capabilities. Staff-directory entries are not authentication identities. No automatic privilege inheritance from consultancy administration.

The retained `/api/*` endpoints continue to serve consultancy sessions/materials/paperwork/contact/inquiries for compatibility and regression testing. There is no JavaScript proxy or cross-origin frontend. All mutations require Rails CSRF protection; protected responses are no-store/noindex. CSP disables scripts, embeds and external connections.

Clinic pages are a non-production synthetic prototype. They use separate prefixed tables in the local SQLite database, not the production EHR schema. Database composite constraints enforce note/patient clinic consistency. Shared runtime and operator privileges remain shared risks; these controls are not production tenant-isolation approval.

The pharmacy module at `/clinic/pharmacy` requires the existing inventory capability, independently of patient access. It uses `clinic_pharmacy_products`, `clinic_pharmacy_batches`, `clinic_pharmacy_movements` and `clinic_pharmacy_batch_events`. Whole-package balances are computed from immutable movement rows; composite keys bind lots and actors to the clinic. SQLite triggers reject stock underflow and edits/deletions to movement/status history. `db/structure.sql` is the canonical schema because Ruby schema dumps omit triggers; keep the sqlite3 CLI available when loading/dumping it. This is not an independent audit system or production clinical authorization.

`Pharmacy::NdcDirectory` performs only explicit public-directory searches over HTTPS, with time/size limits and controlled query fields. The lookup is rate-limited per account; no API key, background polling or bulk ingestion is configured. Responses are escaped as text. Signed import references expire after 20 minutes and are bound to the initiating clinic/account; public results cannot choose local ownership or add stock. See [the source-folder README](../../pharmacy-inventory/README.md) for supported features and intentional exclusions.

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

The Dockerfile was built and tested for `linux/amd64` during EC2 preparation. The [container verifier](../deploy/ec2/verify-container.py) checks TLS, production guards, encrypted writes, restart persistence and an isolated SQLite restore/decryption. It caught and fixed late encryption configuration: keys now load before production eager loading, with existing local derivation preserved. Run behind a trusted HTTPS terminator; never expose Puma directly to the internet. Mount persistent storage with UID 1000 ownership and provide writable temporary storage. Actual EC2 bootstrap and cloud recovery remain unverified. Static CSS is revalidated rather than cached for a year.

Use one process/instance while SQLite and process-local rate limits remain. No PostgreSQL production adapter, durable shared limiter, high availability, access audit pipeline or automated restore is configured. Choose/review those before real client/clinical release; see [AWS guidance](../deploy/aws.md).

The local demo shortcut is denied in production regardless of its flag. **All clinic routes are also denied in production regardless of account or flag.** This is a release boundary, not a compliance certification or sufficient real-data safeguard.

## Release work remaining

Operator activation/recovery delivery, MFA, audit/monitoring, scoped confidential-data permissions, reviewed packet/content, real signatures, PDF/institution pipeline, private media, notices/retention, encrypted backup/restore, clinical workflow review and full access-isolation assessment remain open. No PHI, real applicant records, public release or AWS resource provisioning is authorized by this README.
