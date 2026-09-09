# Staff access and patient separation: failure inventory and repair evidence

## Outcome and authority

Requested outcome: prove normal employee onboarding, pilot-role permissions, account revocation, session expiry, and clinic/patient separation. Every pilot employee must activate and use an ordinary email/password account. Development account switching is useful setup infrastructure but is explicitly excluded from acceptance evidence. Backend authorization must deny unauthorized and cross-clinic actions, including after a membership, role, or site assignment changes.

Source baseline: `736307115c95769380fdc746a2a9a427907db0d1`, pulled from `origin/main` on 2026-09-09. Working branch: `codex/staff-access-separation`; checkout: `C:/Users/joshr/Desktop/Worktrees/APPly-staff-access-separation`. Shortcut is excluded by the user's explicit instruction. Only independently invented local records may be used. This record does not authorize deployment, production access, real credentials, patient data, external messages, or clinical/security approval.

Evidence labels used below are source inspection, automated test, and live observation. At this baseline only source inspection has occurred. Existing tests were read where useful but were not run and are not treated as current proof.

## Failure-first boundary

The principal failure is that the screen can identify one employee, role, clinic, site, or patient while the server commits work under stale or broader authority. Prevention must therefore live in Rails and PostgreSQL-backed identity, membership, grant, and resource scopes. The browser may project current capabilities and lock stale UI, but it cannot grant access. Revocation must serialize with protected writes; a successful response cannot mean “revoked” while an old session or in-flight action can still commit.

## Failure inventory

### A01 — Normal employees cannot activate or enter any deployed clinic

**Severity: critical. Evidence: source inspection.** Every shipped API image runs Rails in production mode. `identity/api/employee_activations_controller.rb` returns 404 for every production-mode activation. `clinic/base_controller.rb` then permits production clinic routes only for the single staging demo identity. The login page links to employee activation only when the local development-login switch is enabled.

**Trigger and harm:** invite a normal employee in a deployed synthetic clinic, open the activation route, then sign in. Activation or clinic entry is denied regardless of the invitation and role. Local development switching can conceal this blocker but cannot establish pilot authentication.

**Solution:** add an explicit server deployment policy for enabled pilot clinics. Permit public activation only for a valid invitation whose practice is enabled by that policy; permit ordinary active members of enabled practices into the clinic. Preserve the current closed-by-default production behavior, development-switch restrictions, and staging demo path.

**Acceptance:** in production-mode local runtime, activate and log in to an enabled synthetic pilot clinic with ordinary credentials. A disabled clinic, cross-clinic identity, invalid/revoked invitation, and development-session endpoint remain denied.

### A02 — The seven pilot roles exist only in a local development account service

**Severity: critical. Evidence: source inspection.** Clinic Administrator, Billing & Accounting, Front Desk Coordinator, Clinician, Clinical Staff, Inventory Coordinator, and Records Viewer are defined in `services/development/role_accounts.rb`. The deployed schema provisions only generic `workforce-*` roles. Normal onboarding filters role choices to the `workforce-` prefix, so it cannot assign any named pilot role.

**Trigger and harm:** a clinic administrator uses Add employee. The role list cannot represent the pilot jobs whose access is being accepted; a developer must create or switch to local-only accounts.

**Solution:** move the immutable pilot role catalog and human-readable labels into clinic authorization ownership, provision a new immutable version through a forward migration, and make normal onboarding expose only current assignable catalog roles. Development fixtures must consume that catalog instead of owning a second definition.

**Acceptance:** each catalog role is present after a fresh migration, appears with a human-readable label, is assignable only when the grantor possesses every delegated permission, and can be attached through a normal invitation/activation flow.

### A03 — Front Desk cannot perform its required registration and check-in work

**Severity: high. Evidence: source inspection.** The Front Desk definition has patient identity lookup and appointment read/book/status only. Patient registration requires `patients.write`; starting the appointment-bound encounter used as current check-in requires `encounters.write` at the actual site.

**Trigger and harm:** a Front Desk employee can find and book a patient but cannot register a new patient or complete arrival/check-in, breaking the staff handoff at the first pilot role.

**Solution:** create a new immutable Front Desk role version containing the minimum currently available registration and encounter-start permissions. Keep notes, observations, provider assignment, billing, inventory, workforce administration, and other clinical actions denied.

**Acceptance:** ordinary Front Desk credentials can register, book, transition, and check in one synthetic patient; direct note, vital, provider-assignment, billing, inventory, role, and cross-site/clinic actions fail with unchanged records.

### A04 — The pilot administrator cannot provision the payroll role

**Severity: high. Evidence: source inspection.** The named Clinic Administrator lacks `workforce.payroll.configure` and `workforce.payroll.export`. Grant creation enforces a correct grantor ceiling, so this administrator cannot assign Payroll Operator or a complete Workforce Administrator. No named pilot account can perform or delegate payroll work.

**Solution:** include payroll configuration/export in the new immutable Clinic Administrator definition and expose the current Payroll Operator workforce role through normal onboarding. Preserve the delegation ceiling and self-elevation denial.

**Acceptance:** Clinic Administrator can assign Payroll Operator to another employee; the operator can perform only its defined payroll/timecard work; other roles and self-targeted grants remain denied.

### A05 — Records Viewer can mutate provider assignment

**Severity: high. Evidence: source inspection.** The supposedly read-only role explicitly includes `encounters.assign_provider`. Context projects it, the board shows the editor, and the backend correctly honors the permission, allowing this role to change active care ownership.

**Solution:** omit the mutation permission from a new immutable Records Viewer version. Do not rewrite historical role definitions or grants.

**Acceptance:** Records Viewer can read its intended records but sees no assignment editor; a direct assignment request returns 403, records stay unchanged, and a permitted clinician/clinical staff account still succeeds.

### A06 — Workforce inactivation and site removal leave real authorization active

**Severity: critical. Evidence: source inspection.** `LinkEmployment.update!` changes only employment and employment-site rows. `Ability` authorizes administrative work from active membership role grants without checking employment status. The UI reports workforce access inactivated while practice-wide grants and removed-site grants remain effective. Existing member sessions also remain usable.

**Solution:** bind onboarding-created grants to their employment. In one transaction, inactivation/site removal must revoke the corresponding active grants, append grant/audit events, increment authorization generation, and revoke the affected clinic sessions. Reactivation/site addition creates new grants after checking the current administrator's delegation ceiling; it never resurrects historical grants.

**Acceptance:** old-cookie replay after offboarding is denied; every former workforce/clinic permission is denied immediately; removed-site authority fails while retained-site authority remains; another employee is unaffected; history and audit show the transition.

### A07 — There is no normal account-revocation or restoration action

**Severity: high. Evidence: source inspection.** The only employee control is workforce status, and the UI explicitly states the clinic account is unchanged. There is no normal membership/account lifecycle route. A user/model callback can revoke sessions when an internal caller changes `User.active`, but clinic staff cannot invoke a safe scoped command.

**Solution:** add a server-owned employee access lifecycle command with `revoke_account` and `restore_account`. It must lock employment, membership, user and active grants; prohibit self-revocation; preserve records; revoke sessions and outstanding invitations; audit the exact outcome; and require a new explicit normal sign-in after restoration.

**Acceptance:** an administrator revokes another employee, all sessions disappear, ordinary login and clinic APIs deny access, and records remain. Restoration does not restore old sessions or old grants implicitly and requires a current role assignment.

### A08 — Role and site permission changes lack one coherent employee workflow

**Severity: high. Evidence: source inspection.** Add employee assigns one role, but employment update accepts only status, end date, and sites. Generic role-grant APIs are not integrated into the employee UI. Staff cannot safely change an employee's job access without developer/API intervention, and the source does not identify which grants belong to onboarding.

**Solution:** extend the employment command/UI to replace the employment-owned role and sites atomically. Revoke old grants, create new immutable grants after current-ceiling checks, increment authorization generation, and report one authoritative result. Preserve unrelated grants that were not created for that employment.

**Acceptance:** administrator changes a normal employee from Front Desk to Billing and changes sites; the old role/site actions deny immediately, the new actions succeed, and retries do not duplicate grants or events.

### A09 — Permission changes leave protected UI and capabilities stale

**Severity: high. Evidence: source inspection.** Workspace loads `/api/clinic/context` once. Session heartbeat/focus checks only user identity and session timing. Role or membership changes deny later backend requests, but already-rendered patient data and obsolete controls can remain until navigation, manual reload, or session expiry.

**Solution:** expose a server-derived authorization generation with session/context responses. Increment it for role, site, membership, and account transitions. `SessionGuard` compares the expected generation on heartbeat/focus and on authorization errors, clears the protected workspace, and reloads current context only after reauthorization.

**Acceptance:** two browser sessions start with the same employee. Revoking, restoring, changing role, and changing site in the administrator session causes the employee session to lock or refresh without manual navigation; no stale response is accepted.

### A10 — Grant revocation can lose a race with an in-flight protected write

**Severity: high. Evidence: source inspection.** Revocation locks only the grant. Many workflows authorize before their write transaction, and permission reads do not lock a shared membership authorization epoch. A revoke can commit after authorization but before the protected record commits, allowing a post-revocation write.

**Solution:** add a membership authorization generation and transaction helper that locks the membership, rechecks current generation and permission inside the protected write transaction, and returns the locked actor membership. Apply it to all pilot-critical mutations: registration, appointment/check-in, vitals, note create/revise/sign, billing/checkout/payment, follow-up, workforce administration, and role transitions. Permission changes lock the same membership row and advance generation.

**Acceptance:** barrier tests exercise both orderings for representative clinical and financial writes. When revocation wins, the protected write returns denial and changes no business/audit success record; when the write wins, revocation applies immediately afterward.

### A11 — Invitation creation can commit after inviter authority is revoked

**Severity: high. Evidence: source inspection.** Invitation authorization occurs before the write transaction. A concurrent grant or membership revocation can commit after that check and the invitation/audit can still commit.

**Solution:** lock the inviter membership and repeat authorization inside the invitation transaction using the shared authorization generation contract.

**Acceptance:** both concurrency orderings are exercised. If revocation wins, no invitation, token, staff row, or committed-success audit remains.

### A12 — Activation bearer remains in browser URL/history

**Severity: medium. Evidence: source inspection.** `EmployeeActivationPage` reads `?token=` but never removes it. It can remain in history and same-origin referrers.

**Solution:** capture the token synchronously and immediately replace the address with `/workforce/activate` before other application requests/resources. Never log or render it after activation/revocation.

**Acceptance:** activation succeeds from a token URL while browser location, history, referrer, server logs, errors, and subsequent requests contain no token.

### A13 — `workforce.timecards.read` can submit another employee's timecard

**Severity: high. Evidence: source inspection.** `TimecardsController#submit` enters through the readable-card path. Under the supported `manager_required` mode there is no review permission check, so a read-only Payroll Operator can mutate another employee's card to submitted.

**Solution:** owner submission requires active workforce self access and the employee-submit policy. Manager submission requires `workforce.timecards.review` at every represented site. Read permission alone never mutates.

**Acceptance:** read-only payroll credentials receive 403 and unchanged card; a reviewer succeeds; employee mode permits only the owner.

### A14 — Timecard UI combines read, review, and approval into one failing page

**Severity: medium. Evidence: source inspection.** `TimecardReviewPage` always fetches review-only adjustments and always renders calculate, correction, decision, and approval controls. A built-in Payroll Operator has read but lacks review/approve, so a denied secondary request collapses the whole read page.

**Solution:** load and render read, review, and approval slices using their exact capability flags. One denied optional slice must not hide authorized timecard records.

**Acceptance:** Payroll Operator loads cards with no review request/control; reviewer and approver see only authorized controls; backend denials remain enforced.

### A15 — Billing read-only users see posting and payment controls

**Severity: medium. Evidence: source inspection.** Context's broad `billing` flag is true for read or write. Billing screens use it as a mutation fallback, so Records Viewer sees controls that the backend later rejects.

**Solution:** remove broad mutation fallbacks. Gate draft, post, payment, online collection, cash reconciliation, and catalog actions on their exact atomic capability.

**Acceptance:** Records Viewer sees read-only billing without mutation controls; direct requests still return 403. Billing & Accounting sees and completes only its assigned actions.

### A16 — Payroll export controls ignore the export capability

**Severity: medium. Evidence: source inspection.** Payroll configuration uses its exact capability, but preview/create/download controls render without checking `workforce.payroll.export`. Current built-in roles pair these flags, which leaves the defect latent.

**Solution:** gate every export action on `workforce_payroll_export`; keep configuration on `workforce_payroll_configure`.

**Acceptance:** a configure-only role changes settings but cannot preview/create/download; direct export is 403. Export role succeeds.

### A17 — Site-scoped lab permissions expose practice-wide lab records

**Severity: high. Evidence: source inspection.** Lab controllers and services authorize `notes.read`, `notes.write`, or `observations.write` with `any_site: true`, then query practice-wide patients/reports. Lab reports lack an immutable encounter/site provenance usable for record authorization.

**Solution:** bind each lab report to an authoritative encounter/site, require the actual site on every read/write/review/follow-up, and filter queues through site-scoped ability. Existing unbound records require an explicit safe migration disposition rather than guessed attribution.

**Acceptance:** a Site A grant cannot enumerate, read, create, review, or follow up Site B lab records; practice grants succeed; cross-practice IDs remain not found.

### A18 — Patient read leaks note metadata without note permission

**Severity: medium-high. Evidence: source inspection.** Encounter detail requires only `patients.read` but serializes note IDs, kind, template/revision/signature state, and clinical child counts. Dedicated note routes correctly require `notes.read` at the encounter site.

**Solution:** redact note-derived fields and sensitive child counts unless the actor has `notes.read` at the actual encounter site, or require the explicit permission for the detailed projection. Keep operational encounter fields available where needed for registration/scheduling roles.

**Acceptance:** a patients-read-only role receives no note-derived metadata; Site A note reader receives it only for Site A; provider workflows remain intact.

### A19 — Site-scoped messaging reader can enumerate every clinic account email

**Severity: medium. Evidence: source inspection.** The participants endpoint accepts messaging read at any one site and returns every active practice membership email.

**Solution:** require an actual selected site for site-scoped grants and return only memberships with an active employment/permission at that site. A practice-scoped messaging reader may receive the practice-wide eligible directory.

**Acceptance:** Site A reader sees only Site A candidates; Site B and unassigned emails are absent; practice reader sees all eligible participants; cross-practice IDs remain unavailable.

### A20 — Sensitive staff/follow-up reads have no complete access evidence

**Severity: medium. Evidence: source inspection.** `BaseController#sensitive_read_action` does not cover encounter follow-up worklists/details or staff-messaging participants. Protected data can be released without the required independent read audit.

**Solution:** record these reads at the service/query boundary with server-derived practice, actor, action, resource/site context, and fail-closed behavior when the audit sink is unavailable.

**Acceptance:** successful reads and denials create the expected bounded audit evidence without sensitive values; an audit outage prevents release and returns an honest service-unavailable result.

## Existing safeguards to preserve

Source inspection confirms ordinary login rejects inactive and reserved local accounts; email/IP throttles and generic credential errors are present; sessions have a 12-hour absolute and 15-minute idle limit; GET polling does not slide idle expiry; trusted browser activity uses an explicit PATCH; cookies are secure/HttpOnly/SameSite; password/account changes revoke sessions; invitations use encrypted email, random hashed single-use tokens, row locking, atomic activation, and 72-hour expiry; server requests recompute active membership and grants; stale actor headers return conflict; core patient/appointment/encounter/vital/note/document/invoice/payment/follow-up controllers use practice/patient scopes; composite tenant foreign keys and payment patient matching are present. No direct cross-practice IDOR was confirmed in the inspected core routes. One clinic membership per user is currently enforced, avoiding multi-practice session ambiguity. PostgreSQL RLS remains a separate documented release gate.

## Pilot role acceptance matrix

| Pilot role | Required positive work | Required denials |
| --- | --- | --- |
| Clinic Administrator | employee invite/revoke/restore/role/site changes; full registration-through-follow-up; workforce administration; delegate payroll | self-elevation/revocation, disabled clinic, cross-clinic records |
| Front Desk Coordinator | patient identity/registration, appointment booking/status, arrival/check-in | vitals, notes/signing, provider assignment, billing, inventory, roles |
| Clinical Staff | registration, scheduling/check-in, vitals, follow-up, read notes | note signing, billing, inventory administration, roles |
| Clinician | patient/appointment/encounter, vitals, note write/sign, follow-up | billing payment, inventory administration, roles |
| Billing & Accounting | patient/encounter read needed for checkout; invoice draft/post/payment/cash reconcile | clinical mutation, provider assignment, roles, inventory |
| Inventory Coordinator | inventory/procurement/receiving/count/recall work | patient/clinical/billing/workforce records except explicitly required inventory context |
| Records Viewer | intended patient/appointment/note/document/billing reads | every mutation, including provider assignment |
| Payroll Operator | timecard read and payroll configure/export | timecard review/approve, clinical/billing/inventory/roles |

Every positive case uses a separately invited and activated ordinary account. The development switch may bootstrap the local administrator only; it is not evidence for any row in this matrix.

## Consolidated verification plan

After implementation freeze, perform one focused pass:

1. One Rails integration file provisions two practices/two sites and normal invited accounts for every matrix role; activates through the public endpoint; logs in through `/api/session`; checks one representative required action and representative denials per role.
2. The same file exercises old-cookie account revoke, role/site change, invitation and protected-write revocation races, cross-practice and same-practice cross-site patient/encounter/lab/note/invoice/follow-up IDs, timecard mutation separation, and unchanged record counts after denial.
3. One focused frontend test covers capability-specific timecard, billing, payroll, Records Viewer, and activation-token scrubbing behavior.
4. One local browser journey uses a normal invitation, activation, password login, role change, access revoke/restore, focus/session revalidation, expiry/relogin, and cross-clinic denied URL. Persisted rows and audit records are inspected afterward.

No broad suite, cosmetic assertion expansion, repeated successful run, real message delivery, deployment, or production data is part of this pass.

## Implementation record

Status after repair: **A01-A20 implemented and focused automated verification passed.** The original findings above remain the dated baseline. The following table records the source change that closes each finding.

| Finding | Implemented repair | Persistence and denial behavior |
| --- | --- | --- |
| A01 | Added a closed-by-default production pilot-practice allowlist and made employee activation consult the invitation's practice. The ordinary activation link is present independently of development account switching. | Only active members of explicitly enabled practices enter production clinic routes. Invalid, expired, revoked, used, and disabled-practice invitations remain denied. |
| A02 | Moved the named pilot roles into `Clinic::Authorization::PilotRoleCatalog` version 4, provisioned them through a forward migration, and made both onboarding and development fixtures consume the same catalog. | Immutable role versions are stored in PostgreSQL; employee records serialize stable role IDs plus human-readable labels. |
| A03 | Added the minimum patient registration, appointment, and encounter-start capabilities to Front Desk Coordinator. | Direct vitals, note, provider-assignment, billing, inventory, and workforce actions still fail backend authorization. |
| A04 | Added payroll configure/export authority to Clinic Administrator and made Payroll Operator assignable through normal onboarding. | The existing grantor ceiling still rejects permissions the administrator does not hold and rejects self-targeted elevation. |
| A05 | Removed `encounters.assign_provider` from the new Records Viewer role version and gated the editor by the exact permission. | Historical role definitions remain immutable; current grants are upgraded to the corrected catalog version and direct mutation returns 403. |
| A06 | Bound onboarding-created grants to the source employment. Employment status, role, and site changes revoke and replace only those owned grants while incrementing membership authorization generation. | Removed authority is not resurrected; stale sessions observe a generation mismatch and protected writes lock/recheck the same membership row. |
| A07 | Added the transactional `EmployeeAccessLifecycle` revoke/restore command and exposed it through the employment API/UI. | Revoke inactivates employment, membership, and user, revokes grants and invitations, deletes every session, and preserves records. Restore issues fresh role authority and requires a new login; old sessions and grants stay dead. |
| A08 | Extended employment update to atomically replace role and site assignments, with server catalog validation and current grantor-ceiling checks. | Retries converge on the requested active grant set; unrelated grants remain untouched and every authority transition advances generation. |
| A09 | Added `authorization_generation` to membership, session, and clinic-context responses. `SessionGuard` locks on inactive access or a changed generation. | Permission changes cannot leave an accepted stale client context; refresh/focus checks require the current server generation. |
| A10 | Wrapped every non-read clinic request in a transaction that locks the actor membership and verifies active state plus the captured authorization generation before controller work commits. | Revocation and protected mutation serialize on the membership row. If revocation wins, the mutation is denied with no committed business write. |
| A11 | Moved inviter reauthorization into the onboarding transaction under the same membership-generation lock. | A revoked inviter cannot commit an invitation, staff row, token, or success audit after losing authority. |
| A12 | The activation screen captures the query token and immediately replaces browser history with `/workforce/activate`. | Subsequent location/history state and application navigation do not retain the bearer token. |
| A13 | Split employee self-submission from manager submission and require review permission at every represented site for manager actions. | Timecard read alone never mutates a card; failed authorization leaves state unchanged. |
| A14 | Split timecard reads, adjustments, calculations, decisions, and approval controls by their exact capabilities. | Denial of an optional review slice no longer hides authorized read-only records. |
| A15 | Removed broad billing fallbacks and gated draft, posting, payment, online collection, reconciliation, and catalog actions individually. | Hidden controls mirror backend denial; read-only roles retain readable billing data without write affordances. |
| A16 | Gated payroll preview/create/download on export permission while keeping settings behind configure permission. | Configure-only and export-only combinations now produce distinct UI and backend behavior. |
| A17 | Added immutable site provenance to lab reports and enforced the actual site for queues, reads, creates, reviews, and follow-ups. | Site A grants cannot enumerate or act on Site B reports. Existing unbound historical reports remain practice-scoped rather than receiving guessed site attribution. |
| A18 | Redacted note IDs, revision/signature state, and note-derived child counts unless the actor has `notes.read` at the encounter site. | Registration/scheduling users retain operational encounter fields without clinical-note metadata. |
| A19 | Made participant discovery site-aware and required every new conversation participant to be eligible at the selected site. | Site-scoped users cannot enumerate or add Site B/unassigned clinic accounts; cross-practice membership remains unavailable. |
| A20 | Added fail-closed audit evidence around follow-up and staff-participant reads. | An unavailable audit sink prevents sensitive release; audit records contain server-derived actor, practice, resource, action, and site context without payload values. |

## Verification evidence

- Fresh isolated setup and both new migrations completed against PostgreSQL in `apply-staff-access-postgres` on port 54369.
- Ruby syntax checks passed for all 19 changed Ruby source files.
- The focused workforce access integration passed: **10 runs, 83 assertions, 0 failures**. It proves allowlisted production activation with an ordinary password-backed account, role/site changes, account revocation with session deletion, and restoration with fresh authority.
- The focused role, follow-up audit, timecard, and lab boundary checks passed. The consolidated run exposed four lab failures caused by the shared capability helper dropping the site argument; that defect was repaired, and the lab rerun passed: **6 runs, 129 assertions, 0 failures**. The other 24 tests in the consolidated run had already passed.
- The production web build passed after updating the authorization-generation contract: Vite compiled 1,347 modules successfully.
- `git diff --check` passed.

The final rendered browser pass could not run because this Codex host's Windows Computer Use service returned `Trusted RPC service is not configured: sky`. This is an environment limitation, not evidence of browser acceptance. The ordinary activation/login lifecycle is independently proved at the production-mode API boundary, and the frontend compiles, but a rendered pilot walkthrough remains release evidence to collect on a host with browser automation available. PostgreSQL RLS also remains the existing separate release gate; this change does not claim that gate is complete.

No broad suite, low-value test expansion, real message delivery, deployment, production access, or real patient data was used.
