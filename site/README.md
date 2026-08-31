# APPly — one Rails app, two experiences

Rails 8.1.3.1 / Ruby 3.4.10. No React, Vinext, Node server, frontend proxy, or JavaScript build is needed. Views are server-rendered ERB with native forms and CSS.

| Experience | Routes | Purpose |
| --- | --- | --- |
| Selling and launch | `/`, `/contact`, `/login`, `/portal`, `/paperwork`, `/training` | Consultancy marketing, inquiries, provisioned client accounts, demo signing, onboarding and information |
| Clinic workspace | `/clinic`, `/clinic/patients`, `/clinic/inventory`, `/clinic/staff` | Distinct clinic dashboard/navigation; synthetic EHR foundation, office inventory and employee directory |
| EHR pharmacy | `/clinic/pharmacy` | Package catalog with public FDA NDC import, fictional lots/expiry, stock movements and batch-status history |

The two experiences share Rails and individual account authentication, **not automatic permissions**. An active clinic membership with explicit section capabilities is required; the consultancy administrator flag does not grant clinic access. Each login has one developer-assigned clinic. Someone working at multiple clinics uses separate logins; there is no clinic picker or self-service creation. It is not the complete multi-clinic PostgreSQL architecture proposed in the vault.

**Synthetic only.** Clinic routes are unconditionally disabled in production. No real patient, employee, applicant or confidential legal information belongs in this development environment. Front-facing separation is not process/database isolation or HIPAA compliance. Before any real clinical release, reassess the shared runtime/database/identity and intercompany data responsibilities.

## Start locally

From `site/backend/`:

```sh
bundle install
bin/rails db:prepare db:seed
APP_DEVELOPMENT_LOGIN=1 bin/rails server -b 127.0.0.1 -p 3000
```

Open [local login](http://localhost:3000/login) and explicitly choose **Continue as demo client**. This creates a fresh non-admin synthetic account, sample launch document and assigned **Test Clinic**. The demo only works in development, explicitly enabled, with loopback host/peer and matching POST Origin. Ordinary same-origin GET navigation works without an Origin header. Do not tunnel or expose the development server.

In the portal, **Clinic workspace** opens the assigned Test Clinic directly, including two fictional patients, two office supplies and a staff entry. Each fresh demo has an isolated clinic, even though they share the display name. Switching workspaces creates neither a clinic nor a login and copies no patient data into onboarding. Signed-out clinic navigation returns directly to `/clinic` after successful login. Logout/new demo login starts a new walkthrough; prior synthetic records are retained locally.

For demo accounts created before automatic assignment, developers can run `bin/rails clinics:prepare_test` in development. It assigns Test Clinic only to active, non-admin generated `demo-UUID@example.invalid` accounts with demo-only paperwork and no existing membership. It never alters/revives an existing membership, changes normal accounts or creates a login session. Repeating it is a no-op for already assigned accounts.

**My launch** uses the existing session; it never signs anyone in. An active development session is labeled and has a visible Sign out button. `/login` remains accessible even while signed in so an account change is explicit.

For normal provisioned accounts, use the interactive `bin/rails members:create` task after operator payment confirmation. Passwords are prompted without echo, never hard-coded. `members:reset_password` revokes sessions; `members:prune_sessions` removes expired session records. No public signup, payment processing or credential email is implemented.

## What works

- Native contact form; encrypted inquiry storage and administrator-only inbox at `/inquiries`. No notifications or outbound email.
- Per-user paperwork with Not started / Started / Completed, review, consent, document-version check, regular-account password confirmation, and downloadable demo text receipt. Only demo documents can be signed. No PDFs, filings or institutional acceptance.
- Three labeled written sample guides with personal progress. Kevin's videos remain awaiting content.
- Clinic-scoped fictional patient creation and append-only **draft** entries with encrypted names/body and author attribution. No clinical signing, encounters workflow, diagnoses, prescriptions, labs or decision support.
- Office supply creation, signed integer stock adjustments with reason/actor, atomic nonnegative balances, retry deduplication and reorder indicators. No orders, billing, clinical inventory/lot handling or medication management.
- Pharmacy inventory under the EHR navigation: public package lookup/import, manual fictional products, whole-package lot receiving, ledger-derived stock, corrections/write-offs, quarantine/recall/release history, low-stock and expiry worklists. No dispensing, patient linkage, dose conversion, orders, automatic recall feed or valuation. Existing office supplies remain separate.
- Fictional employee directory creation and active/inactive status. This is not payroll, scheduling, HR document storage, invitations or permission administration; changing directory status does not grant/revoke logins.

SQLite persists under `backend/storage/` locally. No bucket, PHI system or SharePoint connection has been accessed. The EC2 setup task performed read-only AWS identity/template/pricing checks; no paid resource or application dependency was added.

For an existing checkout, run `bin/rails db:migrate`, then restart Rails so it loads the new pharmacy service directory. Open **EHR · Pharmacy**. A local demo account can choose **Load fictional pharmacy examples** on an empty catalog; it never replaces existing products. FDA search sends only the submitted public drug name/NDC to `api.fda.gov`, not clinic or patient records. An import creates reference metadata at zero stock. Select the exact package and verify its physical label; NDC listing is not FDA approval.

The source pharmacy specifications and PostgreSQL proposal remain in `pharmacy-inventory/`. The standalone Vite/React app and npm files were removed after porting its useful behavior into Rails.

## Verify

From `site/backend/`:

```sh
bin/rails db:prepare
bin/rails test
bin/rubocop
bin/brakeman --quiet --no-pager
bin/bundler-audit
```

Tests exercise both ERB experiences and retained JSON endpoints, CSRF, authorization, isolation, encrypted fields, demo signing, progress, stock constraints and production clinic denial. Tests create their own materials; seeds do not pollute test expectations. The EC2 package adds a Linux container/TLS/persistence/restore verifier. Browser visual/accessibility QA, independent security review and actual cloud deployment remain separate checks.

The canonical runtime schema is now `backend/db/structure.sql`, not `schema.rb`, so fresh databases retain the pharmacy stock and append-only triggers. `sqlite3` must be on PATH (already included in the Dockerfile). The SQL dump contains schema/migration versions only, not application data. Pharmacy tests also cover exact-package FDA mapping, tampered/expired import results, repeat receipts, underflow, composite clinic/actor constraints and protected history. Use a disposable test database for fresh-initialization checks; never point test commands at development or real records.

## Hosting

See the [EC2 staging package](deploy/ec2/README.md) and [AWS boundary guidance](deploy/aws.md). It prepares one Rails host plus the existing SQLite database on encrypted EBS, with private SSM/TLS access and no inbound network ports. The founder authorized the current root session until further notice. An unexecuted change set in `us-east-1` is ready; cost/region acceptance remains pending and no paid infrastructure has been provisioned. No GitHub hosting, PostgreSQL migration, S3 connection or repository publication is required.

The former private Sites deployment is historical and **has not been updated or removed**. Its ChatGPT hosting gate does not apply to local Rails. `.openai/hosting.json` is retained only as historical deployment metadata; do not publish this Ruby application using the old JavaScript build workflow.

The 100 removed JavaScript frontend/config/test files are recoverable from parent-repository commit `2a25f48`. Existing ignored build/dependency caches and local data were left alone. No Git history was rewritten.

## Source map

- `backend/app/controllers/web/`, `backend/app/views/web/`: selling and onboarding.
- `backend/app/controllers/clinic/`, `backend/app/models/clinic/`, `backend/app/views/clinic/`: synthetic clinic workspace.
- `backend/app/views/layouts/`: visibly separate layouts.
- `backend/public/application.css`, `clinic.css`: native CSS; no external fonts, analytics or JavaScript.
- `backend/db/seeds.rb`: original sample training, not Kevin's reviewed content.
- `backend/public/og.png`: preserved original APPly social card.

Secrets, databases, logs, uploaded files and vault contents must never be included in deployment artifacts.
