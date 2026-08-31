# APPly — one Rails app, two experiences

Rails 8.1.3.1 / Ruby 3.4.10. No React, Vinext, Node server, frontend proxy, or JavaScript build is needed. Views are server-rendered ERB with native forms and CSS.

| Experience | Routes | Purpose |
| --- | --- | --- |
| Selling and launch | `/`, `/contact`, `/login`, `/portal`, `/paperwork`, `/training` | Consultancy marketing, inquiries, provisioned client accounts, demo signing, onboarding and information |
| Clinic workspace | `/clinic`, `/clinic/patients`, `/clinic/inventory`, `/clinic/staff` | Distinct clinic dashboard/navigation; synthetic EHR foundation, office inventory and employee directory |

The two experiences share Rails and individual account authentication, **not automatic permissions**. An active clinic membership with explicit section capabilities is required; the consultancy administrator flag does not grant clinic access. The prototype supports one clinic membership per user. It is not the complete multi-clinic PostgreSQL architecture proposed in the vault.

**Synthetic only.** Clinic routes are unconditionally disabled in production. No real patient, employee, applicant or confidential legal information belongs in this development environment. Front-facing separation is not process/database isolation or HIPAA compliance. Before any real clinical release, reassess the shared runtime/database/identity and intercompany data responsibilities.

## Start locally

From `site/backend/`:

```sh
bundle install
bin/rails db:prepare db:seed
APP_DEVELOPMENT_LOGIN=1 bin/rails server -b 127.0.0.1 -p 3000
```

Open [local login](http://localhost:3000/login) and choose **Continue as demo client**. This creates a fresh non-admin synthetic account and sample launch document. The demo only works in development, explicitly enabled, with loopback host/peer and matching POST Origin. Ordinary same-origin GET navigation works without an Origin header. Do not tunnel or expose the development server.

In the portal, choose **Clinic workspace**, then **Create demo clinic**. This separately creates an isolated fictional practice, clinic membership, two fictional patients, two office supplies and a staff entry. Switching between workspaces does not create another login or copy patient data into onboarding. Logout/new demo login starts a new walkthrough; prior synthetic records are retained locally.

For normal provisioned accounts, use the interactive `bin/rails members:create` task after operator payment confirmation. Passwords are prompted without echo, never hard-coded. `members:reset_password` revokes sessions; `members:prune_sessions` removes expired session records. No public signup, payment processing or credential email is implemented.

## What works

- Native contact form; encrypted inquiry storage and administrator-only inbox at `/inquiries`. No notifications or outbound email.
- Per-user paperwork with Not started / Started / Completed, review, consent, document-version check, regular-account password confirmation, and downloadable demo text receipt. Only demo documents can be signed. No PDFs, filings or institutional acceptance.
- Three labeled written sample guides with personal progress. Kevin's videos remain awaiting content.
- Clinic-scoped fictional patient creation and append-only **draft** entries with encrypted names/body and author attribution. No clinical signing, encounters workflow, diagnoses, prescriptions, labs or decision support.
- Office supply creation, signed integer stock adjustments with reason/actor, atomic nonnegative balances, retry deduplication and reorder indicators. No orders, billing, clinical inventory/lot handling or medication management.
- Fictional employee directory creation and active/inactive status. This is not payroll, scheduling, HR document storage, invitations or permission administration; changing directory status does not grant/revoke logins.

SQLite persists under `backend/storage/` locally. No AWS account, bucket, PHI system or SharePoint connection has been accessed. No new paid service or library was added.

## Verify

From `site/backend/`:

```sh
bin/rails db:prepare
bin/rails test
bin/rubocop
bin/brakeman --quiet --no-pager
bin/bundler-audit
```

Tests exercise both ERB experiences and retained JSON endpoints, CSRF, authorization, isolation, encrypted fields, demo signing, progress, stock constraints and production clinic denial. Tests create their own materials; seeds do not pollute test expectations. Browser visual/accessibility QA, container build, independent security review and cloud deployment remain separate checks.

## Hosting

See [AWS deployment guidance](deploy/aws.md). AWS US East was supplied but Virginia (`us-east-1`) versus Ohio (`us-east-2`) is unresolved. No infrastructure has been provisioned. No GitHub hosting or repository publication is required.

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
