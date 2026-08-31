# APPly consultancy website and client portal

A marketing site plus a Ruby on Rails client portal for the APPly launch consultancy. This is **not an EHR**. SharePoint mapping and the separately sold EHR/inventory product remain outside this application.

## Implemented

- Consultancy home page and Contact page. The clinic brief has been removed.
- Login with operator-provisioned accounts after payment; no public signup, payment processing, or automated credential email.
- A post-login dashboard with **Paperwork** and **Onboarding & Training**.
- Account-scoped document lists with Not started / Started / Completed, review, password-confirmed demo signing, immutable-at-the-application-level document snapshots, encrypted document/name fields, timestamps/digests, and a downloadable demo text record.
- Three labeled sample written guides with individual progress. Kevin's video section is explicitly awaiting content; no invented videos.
- Contact inquiries encrypted in Rails and available only in the administrator inbox. No email delivery or notifications configured.
- Session expiry, revocation on logout/password change/deactivation, CSRF/origin checks, bounded proxy requests, and basic rate limits.

Signing is **demonstration-only and enforced on the server**. Actual packet documents, signing-method/recipient requirements, approved applicant-data storage, production security review, PDF generation/delivery, and institutional feedback are future work. “Completed” means signed in the prototype, never institutionally accepted or clinic-ready. No real applicant, patient, or confidential legal documents belong in this prototype.

## Local development

Requirements: Node 22.13+, npm, Ruby 3.4.10, Bundler. The Rails lockfile includes macOS ARM and Linux platforms. Rails is pinned by the lockfile to 8.1.3.1.

From `backend/`:

```sh
bundle install
bin/rails db:prepare db:seed
bin/rails server -b 127.0.0.1 -p 3001
```

From this directory, install with `npm ci`, copy the non-secret values in `.env.example` into an ignored `.dev.vars` file, then run `npm run dev`. The frontend is at http://localhost:3000. It talks to Rails through a same-origin, allowlisted server proxy; Rails is never accessed directly by browser code. Cloudflare local development reads `.dev.vars`, not merely the shell's environment.

### Password-free local walkthrough

For synthetic development only, start Rails with `APP_DEVELOPMENT_LOGIN=1 bin/rails server -b 127.0.0.1 -p 3001` and the frontend with `npm run dev -- --host 127.0.0.1 --port 3000`. Keep both servers bound to loopback. Open http://localhost:3000/login and choose **Continue as demo client**. No ChatGPT sign-in or copied password is needed locally.

Each entry creates a fresh non-admin synthetic client and one demo document; only sample training is available. Progress persists in local SQLite through reloads for the session. Demo signing still requires review, a fictional name, consent and the correct document version, but no password confirmation. Regular accounts still require their password. Logout/new entry starts another walkthrough; prior synthetic records are retained locally, not automatically erased.

The shortcut requires Rails development mode, the explicit flag, loopback host/peer and matching Origin, plus an explicitly local development frontend proxy. Existing demo sessions are rejected while the flag is off. It is denied in production even if the flag is accidentally set. Never expose these development servers through a tunnel or network interface, and never use this database for real client data. No shared password or default production account is introduced.

To provision an account after confirming payment, use a separate interactive terminal in `backend/`:

```sh
bin/rails members:create
```

The task prompts for email, administrator status, password and confirmation without echoing the password. It assigns one explicitly labeled demo document. No default accounts or published passwords exist. Deliver credentials through your approved secure channel; this application sends no email. Use `bin/rails members:reset_password` for an assisted reset. Disabling a user or changing their password revokes sessions. Expired records can be removed with `bin/rails members:prune_sessions`; no recurring task was scheduled.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
# Both local servers must be running; creates and removes synthetic fixtures:
node scripts/smoke.mjs
# From backend/:
bin/rails test
bin/rubocop
bin/brakeman --quiet --no-pager
bin/bundler-audit
```

The HTTP smoke test uses the local development database only. Never point it at real data. Rails integration tests cover per-client isolation, signing gates, completed-record protection, personal learning progress, authentication, contact persistence, encryption, and administration.

Navigation deliberately uses normal full-page links, keeping cookie-auth transitions and protected pages out of a client-side page cache. The corresponding Next link lint preference is disabled. Unmodified generated UI primitives are excluded from lint but typechecked; Rails has its own lint/tests. Browser visual/interaction testing has not been performed.

## Deployment boundary

The existing private Sites URL serves the JavaScript frontend:

https://apply-clinic-launch.wdmcdonough.chatgpt.site

**Sites does not run Ruby. Rails requires a separate Ruby/container host; no such host is configured yet.** The hosted contact/login flows return a clear unavailable state until connected. Local success does not mean Rails is deployed. Keep the site owner-only until the full commercial launch review.

The private preview's ChatGPT sign-in is the hosting access gate, separate from the app's Rails email/password login. The local walkthrough does not change that hosted access policy.

Frontend runtime values (set in Sites, then redeploy):

- `APP_SITE_ORIGIN`: exact HTTPS frontend origin.
- `RAILS_BACKEND_URL`: exact HTTPS Rails origin, no path/credentials/query.
- `APP_RUNTIME=production`; never deploy the development flag or `.dev.vars`.

See [backend/README.md](backend/README.md) for Rails secrets, persistence, and the deployment checklist. Only this site's source/build is sent to Sites, never the vault, local databases, keys, or customer records.

## Content and future work

- `app/page.tsx`, `app/contact/`, `app/login/`: public site.
- `app/portal/`, `app/paperwork/`, `app/training/`: client experience.
- `app/inquiries/`: admin contact inbox.
- `backend/db/seeds.rb`: original sample guides, clearly labeled; rerunning does not overwrite edited records.
- `backend/app/models/paperwork.rb`: demonstration document and signing boundary.
- `app/globals.css`: shared green/cream theme.
- Old `/materials` URLs redirect to training.

Future actual documents should be assigned as new immutable versions, not overwrite signed records. Training text is rendered as text, not unsanitized HTML. No upload, embedded-video hosting, PDF pipeline, institution delivery, electronic-signature certification, clinical workflow, or inventory transactions are implemented here. Founder/packet/content/privacy review remains necessary before real use.

## Social card

The existing `public/og.png` (1732 × 908) was generated on 2026-08-30 and preserved. It uses the APPly wordmark, “Your clinic. A supported start.” and “Clinic launch support for NPs & PAs” in ivory/forest/sage. Metadata uses the operator-controlled canonical origin, never an incoming Host header.
