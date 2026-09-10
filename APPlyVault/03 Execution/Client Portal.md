---
type: implementation
status: private-hosted-prototype
updated: 2026-08-31
---
# Client Portal

Home: [[00 Home]] · Website: [[Website MVP]] · Decisions: [[Decisions]] · Status: [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap)


**Frontend/API update, D-033:** portal rendering and form state moved to `apps/web`; sessions, account-scoped paperwork/training, signing eligibility and inquiry permissions remain in `apps/api`. The browser uses explicit JSON contracts and an authenticated text-receipt endpoint, never backend credentials or persistent record/token storage. Earlier HTML implementation/test observations below remain historical; see [[Software Architecture]] and the latest [[Progress Log]].

## Founder-selected scope

After payment, APPly generates and securely delivers a client login. There is no public account creation. The first signed-in page presents two choices:

1. **Paperwork:** assigned documents, Not Started / Started / Completed status, review and signing.
2. **Onboarding & Training:** written how-to material and, later, Kevin's videos and information resources.

The founder excluded an EHR from this launch portal. D-025 authorized a separately presented [[Clinic Workspace]]; D-033 now supplies both experiences through `apps/web` and the Rails API, with distinct navigation/layout and explicit clinic permissions. Consultancy administration does not grant clinic access. Software ownership remains separate; SharePoint remains the intended starter workflow, to be mapped later. [[Data Modeling]] remains the broader clinical/security proposal. D-031 moved the local prototype to PostgreSQL; [[PostgreSQL and Inventory Foundation]] records its bounded controls and pending hosted cutover.

## Current local implementation

D-032's domain refactor places selling/onboarding under `Launch::*` and sessions under `Identity::*`. D-033 moves presentation/forms to React and exposes the existing operations and scoped queries through Rails JSON; native page controllers/views are retired. [[Software Architecture]] owns code-placement rules. The completed frontend/API split and latest recorded full-suite/container evidence are in [[Progress Log#2026-08-31 — Frontend and API separation completed; test database recreated]].

| Area | Implemented behavior | Limit |
| --- | --- | --- |
| Access | Rails accounts, no registration endpoint, operator provisioning/reset tasks, session expiry/revocation, protected pages/API | Payment confirmation and secure credential delivery are operator steps; no checkout or email automation |
| Dashboard | Two primary modules with personal progress counts | No clinic operations or patient information |
| Paperwork | Per-user assignments; explicit review start; password and consent confirmation; version/digest checks; encrypted document body/name; recorded timestamp; downloadable demonstration text record | Only clearly labeled demo documents can be signed; actual legal/applicant packet absent and real signing rejected server-side |
| Record protection | Assigned content and completed evidence cannot be edited/deleted through the application/model workflow | Not tamper-proof storage, identity certification, notarization, or recipient acceptance |
| Training | Three original, labeled generic operations guides; each client has separate start/completion state | Not Kevin-authored/reviewed content or clinical/legal guidance; no videos uploaded |
| Contact | Validated business message persisted encrypted; administrator-only paginated inbox | No email delivery/notifications; public collection and retention review pending |

“Completed” means the demonstration signing step finished; it does not mean sent, received, accepted, approved, filed, or ready to see patients. Training completion is self-marked progress, not a competency credential.

Source and operational instructions live in the repository `README.md` and `apps/api/README.md`. No credentials are recorded in the vault or reusable passwords published. The named synthetic personas below are explicitly local-only.

## Local development access

After the founder encountered the private host's ChatGPT gate, they authorized a generic development login. The local login page offers **Continue as demo client** when explicitly enabled. It creates a fresh, non-admin synthetic client with one demo document, access only to sample training, and an isolated assigned Test Clinic. Progress persists locally for that session; signing out and entering again starts fresh, without deleting prior synthetic records.

D-026 removes the clinic-create step. Clinic Workspace opens the login's assigned clinic directly; a signed-out visitor returns there after explicit login. My launch uses an existing session and never creates one. Development sessions now show a persistent demo notice and Sign out button; the login form remains accessible while signed in. Missing/revoked clinic assignment requires developer assistance, not a picker or self-service creation.

No copied password or ChatGPT sign-in is needed locally. The demo signing step still checks review, consent, fictional name and document version; password confirmation is skipped only for the guarded development session and a demo document. Regular account signing still requires its password. Rails development mode, explicit enablement, loopback checks and matching POST Origin are required; safe GET navigation may omit Origin. Production rejects the shortcut regardless of flag. Both the frontend (3000) and API (3001) must remain bound to loopback, never tunneled. Use [[CICD#Rails can run locally]] for setup.

**D-040 adds reusable local test logins:** Test Admin (inquiry inbox, no clinic), Test Client A and Test Client B (separate personal progress/Test Clinics), and Test Disabled (expected denial). Select them explicitly on the local login page; no passwords are published. Their setup preserves existing progress/access state and refuses conflicting identities. They retain the development/loopback/CSRF guards and cannot use ordinary password login. [[Client Access Workflow#Reusable local test accounts]] owns usage and limits; the existing fresh demo remains available. These are synthetic personas, not appointments to production roles.

**Session maximum:** local source/runtime now uses 12 hours from login, without sliding extension. Both explicit expiry and session age are checked, including older sessions originally issued for 24 hours. Logout, password changes and deactivation still revoke access. The initial local change updated neither host. The later D-040 continuation authorizes reviewed merge/CI delivery to staging; production remains unchanged and broader MFA/recovery acceptance remains open.

The hosted preview's ChatGPT screen is a separate owner-only hosting gate, not APPly's Rails login. No hosted access policy, production account, public signup or deployment was changed for this development request.

## Infrastructure boundary

D-033 supersedes D-024's Rails-rendered frontend: Vite serves local browser pages on 3000 and proxies `/api` to Rails on 3001; Rails uses PostgreSQL. The prepared hosted release uses separate static-web/API images from the same commit, installed as a matched digest pair behind the trusted TLS edge.

**Recorded historical hosted state:** D-027/D-030 established two private bootstrap environments on 2026-08-30. The later [[Progress Log#2026-08-31 — Staging delivery activated and PostgreSQL cutover verified]] records staging release and recovery evidence. That AWS path was retired on 2026-09-10; no current host or usable hosted account is asserted. Successful-account browser acceptance remains open. No S3, real data or public release is included.

D-030 adds a separate private production container with independent storage/keys. Production skips sample seeds, creates no demo assignments, hides existing sample material/demo paperwork and rejects demo signing; records are not deleted. Staging keeps synthetic portal content with ordinary login. See [[CICD]] for active staging delivery and pending production activation. No actual client account, confidential release or clinical guard removal is included.

The former private Sites preview is historical and does not serve the current frontend/API pair. Its ChatGPT hosting gate is unrelated to local Rails authentication. Hosted acceptance remains tracked on the Shortcut Roadmap.

## Implementation plan and failure checks

[Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) owns T-23.1–T-23.4 and T-17.1; [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) owns T-12.1 and T-24.1–T-24.6. D-040 accepts the [[Client Access Workflow]] structure with a 12-hour session maximum, adds the local test personas above and defers production admin assignments. T-23.1 retains full lifecycle-tabletop evidence; T-23.2/T-23.3 now have bounded fixture/session work, not implemented activation/recovery. MFA/protected audit and production readiness remain open. Synthetic work need not wait for Kevin's actual documents; actual source review and the released content manifest do.

Use [[Working Agreement#Failure-first planning and review]] to challenge wrong-recipient activation, duplicate/partial provisioning, reset-versus-deactivation races, operator self-grants, false inquiry acknowledgment, stale content/progress and cross-client history/export. Acceptance requires observable denial or recoverable error and preserved evidence, not just a working screen. M4/T-25 still owns confidential handling and real signing; the current demo receipt is not a substitute.

## Later document pipeline — not implemented

The founder intends to generate PDFs, send them to appropriate institutions, and track feedback. Future design should distinguish signed, prepared, sent, delivered, feedback received, corrections required, accepted, and closed. These are candidate states, not approved institution-specific processes.

Before real use: obtain the actual reviewed packet and reuse rights; map NP/PA/locality applicability and required client actions; verify each recipient's format/signature/submission rules; approve confidential applicant storage and access; define audit/retention/export/recovery; and select the signing/delivery implementation. T-12 remains the packet source/review dependency. No forms are submitted or external recipients contacted by this prototype.

## Verification and release limits

The 2026-08-31 frontend/API split recorded 76 Rails tests / 784 assertions, 11 frontend tests, native-HTTP transport checks and both local staging/production container configurations passing. [[Progress Log#2026-08-31 — Frontend and API separation completed; test database recreated]] records their scope. Current commands live in [[CICD]]; the newest progress entry distinguishes any fresh checks from this prior evidence.

The current review and proposed release sequence are in [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap). The code supports the prototype described above, including the existing local-demo edits. Operator activation/recovery delivery, controlled content administration/versioned learning, durable activity auditing and approved real signing are still development work. Per-user ownership is the implemented boundary; multi-person engagement access is not implemented and must not use shared accounts.

The earlier sample-seed test failures and nested CI-path defect were corrected; they are historical findings, not current blockers. The guarded navigation and Rails-only increments remain in the dated [[Progress Log]]. Observed main CI and staging cutover are now recorded; M0/T-22 still needs full browser/visual/accessibility acceptance. Production cutover, broader operations and independent security, signature, legal and clinical acceptance remain open. All examples are synthetic; no live EHR, SharePoint, patient files or institutional integration was accessed by this planning review.
