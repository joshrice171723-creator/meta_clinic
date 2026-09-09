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

Status at baseline: **documented, implementation not started**. This section will be appended after the cohesive source build, implementation freeze, and single focused verification pass. The original findings above will remain as dated baseline evidence rather than being rewritten as if the defects never existed.
