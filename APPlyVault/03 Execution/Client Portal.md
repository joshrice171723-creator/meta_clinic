---
type: implementation
status: local-prototype
updated: 2026-08-30
---
# Client Portal

Home: [[00 Home]] · Website: [[Website MVP]] · Decisions: [[Decisions]] · Status: [[Roadmap and Tasks]]

## Founder-selected scope

After payment, APPly generates and securely delivers a client login. There is no public account creation. The first signed-in page presents two choices:

1. **Paperwork:** assigned documents, Not Started / Started / Completed status, review and signing.
2. **Onboarding & Training:** written how-to material and, later, Kevin's videos and information resources.

The founder excluded an EHR from this launch portal. D-025 now authorizes a separately presented [[Clinic Workspace]] in the same Rails application, with distinct navigation/layout and explicit clinic permissions. Consultancy administration does not grant clinic access. Software ownership remains separate; SharePoint remains the intended starter workflow, to be mapped later. [[Data Modeling]] is still a future PostgreSQL proposal, not this local SQLite prototype.

## Current local implementation

| Area | Implemented behavior | Limit |
| --- | --- | --- |
| Access | Rails accounts, no registration endpoint, operator provisioning/reset tasks, session expiry/revocation, protected pages/API | Payment confirmation and secure credential delivery are operator steps; no checkout or email automation |
| Dashboard | Two primary modules with personal progress counts | No clinic operations or patient information |
| Paperwork | Per-user assignments; explicit review start; password and consent confirmation; version/digest checks; encrypted document body/name; recorded timestamp; downloadable demonstration text record | Only clearly labeled demo documents can be signed; actual legal/applicant packet absent and real signing rejected server-side |
| Record protection | Assigned content and completed evidence cannot be edited/deleted through the application/model workflow | Not tamper-proof storage, identity certification, notarization, or recipient acceptance |
| Training | Three original, labeled generic operations guides; each client has separate start/completion state | Not Kevin-authored/reviewed content or clinical/legal guidance; no videos uploaded |
| Contact | Validated business message persisted encrypted; administrator-only paginated inbox | No email delivery/notifications; public collection and retention review pending |

“Completed” means the demonstration signing step finished; it does not mean sent, received, accepted, approved, filed, or ready to see patients. Training completion is self-marked progress, not a competency credential.

Source and operational instructions live in `site/README.md` and `site/backend/README.md`. No credentials are recorded in the vault. No default account or known demo password is published.

## Local development access

After the founder encountered the private host's ChatGPT gate, they authorized a generic development login. The local login page now offers **Continue as demo client** when explicitly enabled. It creates a fresh, non-admin synthetic client with one demo document and access only to sample training. Progress persists locally for that session; signing out and entering again starts fresh, without deleting prior synthetic records.

No copied password or ChatGPT sign-in is needed locally. The demo signing step still checks review, consent, fictional name and document version; password confirmation is skipped only for the guarded development session and a demo document. Regular account signing still requires its password. Rails development mode, explicit enablement, loopback checks and matching POST Origin are required; safe GET navigation may omit Origin. Production rejects the shortcut regardless of flag. The single Rails server must remain bound to loopback, never tunneled.

The hosted preview's ChatGPT screen is a separate owner-only hosting gate, not APPly's Rails login. No hosted access policy, production account, public signup or deployment was changed for this development request.

## Infrastructure boundary

D-024 replaces the JavaScript frontend with Rails-rendered ERB, native forms and CSS. Both experiences now run through one local Rails server at localhost:3000. SQLite remains the development database. AWS/EC2 preparation is in site/deploy/aws.md; exact US East region, budget, operator, domain and restore testing remain open. No AWS resources or S3 access were created.

The former private Sites preview is historical and unchanged; it does not serve the new Rails implementation. Its ChatGPT hosting gate is unrelated to local Rails authentication. Verified Rails hosting remains T-20.

## Later document pipeline — not implemented

The founder intends to generate PDFs, send them to appropriate institutions, and track feedback. Future design should distinguish signed, prepared, sent, delivered, feedback received, corrections required, accepted, and closed. These are candidate states, not approved institution-specific processes.

Before real use: obtain the actual reviewed packet and reuse rights; map NP/PA/locality applicability and required client actions; verify each recipient's format/signature/submission rules; approve confidential applicant storage and access; define audit/retention/export/recovery; and select the signing/delivery implementation. T-12 remains the packet source/review dependency. No forms are submitted or external recipients contacted by this prototype.

## Verification and release limits

**Current Rails-only update:** 37 tests / 422 assertions pass across HTML and retained API flows. Native HTTP checks cover assets, demo login, signing/receipt, training, explicit clinic setup, fictional patient draft and logout. A deterministic materials fixture and test-seed guard resolve the earlier seed-dependent failures. Final checks are in [[Progress Log#2026-08-30 — Rails migration and two front-facing workspaces]]. Frontend results below are historical, not requirements for the removed JavaScript frontend.

The current review and proposed release sequence are in [[Roadmap and Tasks#Development plan — proposed 2026-08-30]]. The code supports the prototype described above, including the existing local-demo edits. Operator activation/recovery delivery, controlled content administration/versioned learning, durable activity auditing and approved real signing are still development work. Per-user ownership is the implemented boundary; multi-person engagement access is not implemented and must not use shared accounts.

On 2026-08-30 this planning review independently reran five frontend tests, typecheck/lint, Rails lint and Brakeman successfully. Rails passed 26 tests / 214 assertions on a fresh schema-only scratch database. A separate fresh `db:prepare test` run failed two assertions because the three seeded guides were included in lists expected to contain only each test's guide. M0/T-22 tracks deterministic test setup and the CI workflow's nested repository-path problem. No application code was changed to obtain the passing run; development/client databases were not used.

The paragraph below records the earlier implementation verification, not additional checks performed by this planning review:

26 Rails tests / 214 assertions and five frontend helper tests pass after the development-access change. Native HTTP smoke checks cover regular and demo login, CSRF/origin failures, protected content, demo signing, personal training state, encrypted contact persistence, admin access/denial, logout and cookie replay. Integration tests also cover production/flag/network guards, sample-only access and ordinary-account password requirements. Frontend typecheck/lint/build, Rails lint and Brakeman passed again; dependency audits passed during the prior implementation and dependencies were unchanged. See [[Progress Log]].

No browser interaction/visual QA or container build was performed. No independent security, electronic-signature sufficiency, legal, HIPAA, or clinical-readiness assessment is claimed. All examples are synthetic; no live EHR, SharePoint, patient files, or institutional integration was accessed.
