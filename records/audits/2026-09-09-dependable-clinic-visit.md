# Dependable clinic visit: failure inventory and repair evidence

## Outcome and authority

Requested outcome: clinic staff complete registration → appointment → check-in → vitals → provider note → checkout → follow-up. Refreshing, navigating, repeated clicks, failed requests and interrupted sessions must preserve the correct patient/visit records and provide staff-operated recovery.

Source baseline: `03c13d7`, pulled from `origin/main` on 2026-09-09. Working branch: `codex/dependable-clinic-visit`; checkout: `C:/Users/joshr/Desktop/Worktrees/APPly-dependable-visit`. The canonical checkout and concurrent telehealth/performance work are preserved. The remote uses `main`; it has no `master` branch. Shortcut is excluded by the user's explicit instruction.

This is a bounded clinic-journey audit and implementation record, not a claim that every defect in the application has been found. Source inspection, automated tests, live observations and unresolved proof are distinguished. Only independently invented local data may be used; no external message, charge, deployment or production patient record is authorized by this work.

## Failure inventory: shared recovery and context

### J01 — One editor can erase another editor's navigation protection

**Evidence: source inspection.** `apps/web/src/App.tsx`, `ClinicApplication`, stores a single `blockerRef`. Each call to `registerBlocker` replaces it, including registration with `null`. The schedule remains mounted while other clinic routes open. Vitals, SOAP and other editors can register concurrently.

**Trigger and harm:** edit one form, open another protected editor, then close that editor or navigate. The surviving form's warning can disappear, allowing navigation to discard unsaved work or an unresolved mutation attempt.

**Solution:** maintain independently registered blockers with individual cleanup. Check every live blocker before accepting navigation and report the relevant warning. Clearing one registration must not clear any other registration.

**Acceptance:** mount two blockers, remove either in either order, and verify the other still blocks. Check browser back/forward and clinic links with simultaneous unsaved editors.

### J02 — Unbounded requests can strand staff in a busy state

**Evidence: source inspection.** `apps/web/src/api/client.ts` has no request deadline, including its shared CSRF bootstrap. A fetch that never settles leaves subscribing reads or mutation controls waiting indefinitely.

**Trigger and harm:** a stalled connection or response body leaves the user unable to retry or reconcile without refreshing; refresh may then destroy the only retained request key.

**Solution:** bound connection and response parsing time, compose caller cancellation with a timeout, release request state, and distinguish cancelled reads from unknown mutation outcomes. Do not automatically replay any mutation. A failed successful-response parse must be treated as an unknown outcome rather than an empty success object.

**Acceptance:** hold bootstrap, response and body separately; verify a bounded actionable error, no replay, and a subsequent explicit retry using the original operation identity.

### J03 — Another-tab account change is not checked against the open clinic workspace

**Evidence: source inspection.** `SessionGuard.tsx` reads session timing but does not compare returned user identity. The clinic shell retains its original `user` and rendered patient context. Cookies are shared between tabs.

**Trigger and harm:** switch accounts in another tab and return to an existing chart. That chart can remain visible and issue work under the newly authenticated account before a full reload; current server permissions do not prove that this is the actor the operator sees.

**Solution:** carry the expected authenticated actor as a non-authoritative request precondition, check it against the server-derived current user before clinic reads/writes, reject mismatches and lock stale UI. Compare heartbeat identity as well. Never use the supplied ID to authorize an action. Reject late responses belonging to an obsolete client session generation.

**Acceptance:** switch cookies to a second allowed actor in the same clinic and a second clinic; stale-tab reads/writes must fail before mutation, and no stale result may be accepted by the former view.

### J04 — Login recovery drops the working destination

**Evidence: source inspection.** `shared/ui.tsx` `useResource` redirects a 401 to `/login` without `next`. `SessionGuard.tsx` preserves only the pathname, and `loginDestination` does not parse safe clinic query parameters. Schedule/patient/billing navigation can carry essential selection in those parameters.

**Trigger and harm:** an expired session during a visit sends staff to a generic destination, losing the visit handoff or checkout selection and increasing wrong-context risk.

**Solution:** preserve a validated same-origin clinic pathname and an allowlist of known selection parameters. Use the same destination function for session lock, initial authentication and failed resource reads. Reauthorize and re-fetch restored context.

**Acceptance:** expire on a patient encounter, filtered schedule and patient/encounter checkout; after login return to the correct route. Reject external URLs, protocol-relative paths and unknown query fields.

### J05 — Forced refresh loses protected working drafts and retry identities

**Evidence: source inspection.** Registration, scheduling, vitals and SOAP forms hold working values and mutation attempts in React state/refs. Navigation warnings do not survive a browser crash or forced refresh. Repository policy correctly prohibits protected content in browser local/session storage.

**Trigger and harm:** refresh after typing or after the server commits but before its response arrives. Unsaved content is lost; retry identity may be lost even though an official record was committed. Re-entering can duplicate work or strand recovery behind a uniqueness error.

**Solution:** add encrypted server-owned working drafts, separate from official clinical observations, note revisions, signatures and billing records. Scope each draft to the authenticated membership, practice, workflow kind, patient and encounter. Use expected-version writes, serialized client saves, response ownership checks and a versioned clear marker. Persist the exact pending operation before submitting it. Restored pending attempts require explicit staff reconciliation/retry; autosave must never sign, record observations, charge, close a visit or send follow-up communication. Show saving, saved, failed and conflict states honestly. A hard interruption before the server acknowledges a keystroke cannot be promised durable; preserve an explicit unsaved warning until acknowledgment.

**Acceptance:** restore acknowledged draft content after full reload; isolate patient, encounter, actor and practice; deny revoked access; reject two-tab stale updates; replay a dropped draft-save response; prevent a stale save from resurrecting a cleared draft. For committed official operations, restore the original attempt and demonstrate one persisted outcome after explicit retry.

## Visit-stage findings

### J06 — Registration has no idempotent official save or outcome reconciliation

**Evidence: source inspection.** `Patients.tsx:581-615` uses `Form` without retry-key transport. `care/patients_controller.rb:48-68` creates/updates without `Clinic::Idempotency`. Generic `shared/ui.tsx:172-232` re-enables editable fields after any error.

**Trigger/harm:** a committed POST loses its response; retry encounters an opaque duplicate-reference error, or changing reference creates a second patient. PATCH retries can append child history again.

**Solution:** exact-payload idempotent create/update, actor/practice-scoped receipts and patient result resolution. Persist and freeze the attempted payload/key before sending. Restore it after interruption and offer explicit reconciliation/retry. **Proof:** same-key replay returns the same patient with unchanged counts; changed-payload replay is rejected; lost-response recovery restores that patient.

### J07 — Ordinary registration edits append duplicate contact/history records

**Evidence: source inspection.** `Patients.tsx:439-579` prepopulates latest contact, emergency contact and social history. `patients_controller.rb:101-128` appends these unconditionally on save. `patient_serializer.rb:17-20` returns their history newest-first. The preferred contact flag is not editable but the controller defaults it false.

**Trigger/harm:** change only a patient's name; unchanged child sections acquire duplicate history and a new contact can lose its preferred flag. Later readers see different meaning despite no intended contact edit.

**Solution:** compare normalized submitted/current values, preserve omitted flags, and skip unchanged subrecords. Define explicit replacement/clear semantics using the established immutable-history contract; never rewrite immutable past records merely to close them. Current projections must identify the current version, with any multiple-contact capability preserved. **Proof:** unrelated edits preserve child counts and preference; a changed/cleared section records exactly one intentional successor and exact replay creates none.

### J08 — Registration edits silently overwrite another staff member's changes

**Evidence: source inspection.** `patients_controller.rb:61-68` accepts no expected revision and overwrites mutable registration data after an unlocked read.

**Trigger/harm:** two staff open a registration; the later save restores stale demographics/preferences and contact snapshots over the first staff member's work.

**Solution:** expose a revision covering the entire registration, lock and compare it before changing any parent/child row, and advance it for every registration change. Reject conflicts with an actionable reload/review flow that retains the user's working copy. **Proof:** the second stale save changes no records; deliberate reconciliation then succeeds once.

### J09 — Schedule cannot normally find patients beyond its first 100 records

**Evidence: source inspection.** `CareFlow.tsx:506-510,615-622,788-818` loads at most 100 patients and uses only that array for booking choices.

**Trigger/harm:** a clinic grows beyond that cap; a later patient cannot be booked from Schedule unless staff find a separate exact-patient deep link.

**Solution:** bounded server identity search, a selected patient retained independently of search results, and exact-ID reauthorization on draft restore. **Proof:** find/book a patient outside the initial page; stale search responses and unavailable patients never replace the confirmed selection.

### J10 — Check-in copy contradicts the persisted arrival semantics

**Evidence: source inspection.** `FrontDesk.tsx:243-278,593-646,753-764` says Start visit/when care begins. `trackingBoardApi.ts:225-226` uses encounter start as arrival and `TrackingBoardPage.tsx:360-375` displays Checked in/waiting.

**Trigger/harm:** staff follow the instruction and wait for care to begin; the recorded arrival and wait duration are late and intake is delayed.

**Solution:** make the existing front-desk command explicitly Check in: record arrival and open the visit workflow. Provider chart entry remains a later action. This bounded journey uses the existing arrival meaning of `started_at`; a separate clinical-start clock is not required for this repair. **Proof:** one check-in creates/reuses one appointment-bound encounter and exposes the correct queue/chart context after reload.

### J11 — Appointment status failures do not reconcile the visible outcome

**Evidence: source inspection.** `FrontDesk.tsx:207-240,1028-1042` shows a generic refresh instruction after status mutation failure. Backend `TransitionAppointment` checks expected status, which protects stale writes but does not resolve the visible result.

**Trigger/harm:** confirmation/cancellation/no-show commits and loses its response. Staff see failure while the server has advanced the appointment.

**Solution:** fetch the exact appointment after an ambiguous response; show confirmed success only if its status matches the requested target, allow retry only if the original status remains, and surface other concurrent states for review. **Proof:** both pre-commit failure and post-commit response loss recover without an extra transition.

### J12 — An incoming saved SOAP revision overwrites dirty local text

**Evidence: source inspection.** `CareFlow.tsx:1488-1503` resets sections/instructions on revision changes and checks only `saveAttemptRef`, not dirty state or the editing base revision.

**Trigger/harm:** another clinician/tab saves, then resource refresh arrives while the current clinician is editing. Unsaved clinical text disappears.

**Solution:** retain the editing base revision, never replace dirty/saving text implicitly, and present an explicit conflict with the latest saved note and preserved local working draft. **Proof:** a deferred newer revision leaves local text intact and blocks stale official save until reviewed.

### J13 — SOAP stale/create conflicts can leave an endless retry loop

**Evidence: source inspection.** `CareFlow.tsx:1615-1619,1794-1801,1969-1983` retains the stale note; reset clears attempt state but does not fetch the winning revision/note.

**Trigger/harm:** simultaneous creation or revision causes a conflict. A fresh attempt still uses the stale expected revision and fails again, forcing manual intervention or losing edits.

**Solution:** resolve the exact encounter's canonical SOAP note, validate its context, preserve the local copy and offer deliberate rebase/discard. A competing create must open the single existing note rather than repeatedly creating another. **Proof:** two creates yield one header; a stale revision is rejected and can be deliberately reapplied after reviewing the latest version.

### J14 — Signing recovery retains stale revision and attestation

**Evidence: source inspection.** `EncounterNoteSigning.tsx:79-98,120-156` detects revision mismatch but retains the previous attempt/body/attestation; conflict does not refresh the parent note.

**Trigger/harm:** another revision arrives while a signature outcome is unknown; the signing dialog retries an obsolete revision instead of requiring review of the new body.

**Solution:** validate recovery response context. Confirm an existing exact signature; retry the same unchanged unsigned revision only after renewed attestation; for a newer revision clear the old attempt and attestation, refresh the displayed note and require fresh review. **Proof:** post-commit timeout yields one signature, pre-commit timeout allows exact retry, concurrent revision requires review before signing.

### J15 — Clinical child responses lack complete client context checks

**Evidence: source inspection; defense gap, not a demonstrated server authorization exploit.** `VitalSignsEntry.tsx:261-266` accepts the returned observations without patient/encounter validation. `CareFlow.tsx:2125-2146` passes a fetched note into the editor without asserting its patient, encounter and kind. Backend services already scope these records.

**Trigger/harm:** a malformed/stale/wrongly bound response can be shown as successful work in the current chart and clear its working draft.

**Solution:** validate each returned observation and note against the active patient/encounter and expected shape before rendering or acknowledging success. Keep unknown attempts recoverable on mismatch. **Proof:** wrong-context responses never render/clear the draft; valid responses preserve exact values.

### J16 — Invoice edits are last-write-wins and have no safe replay

**Evidence: source inspection.** `Billing.tsx:1085-1167`, `billing/invoices_controller.rb:129-137` and `billing/update_draft_invoice.rb:4-31` update charges without an expected revision or request key. The service locks, deletes/recreates lines and touches the invoice, but does not compare the editor's version.

**Trigger/harm:** two checkout editors save, or PATCH commits before a lost response. Charges can be silently overwritten and a retry cannot be matched to the original edit.

**Solution:** add expected invoice revision and exact request identity; compare under lock inside `Clinic::Idempotency`, preserve lines on conflict and return the same authoritative invoice on replay. Retain working charges and the exact attempt across refresh. **Proof:** stale edit creates no new lines; same-key replay has one outcome; lost-response recovery resolves the committed invoice.

### J17 — Checkout interruption loses charges and action identities

**Evidence: source inspection.** `Billing.tsx:929-1009` keeps new invoice lines/currency/key in memory; posting at `695-759` keeps its reviewed version/key in memory; `InvoiceCheckoutControls.tsx:81-130` keeps online-payment action keys in refs. Backend encounter-linked invoice uniqueness is present but cannot restore the attempted charges.

**Trigger/harm:** refresh before save or after ambiguous create/post/payment-start. Staff reconstruct charges or start a fresh action without knowing the previous outcome.

**Solution:** persist checkout working values and exact pending operations, bind restoration to patient/encounter/invoice and query the authoritative invoice/payment state before explicitly retrying. Never autosubmit payment. **Proof:** refresh each phase and show one correctly linked invoice/post/payment outcome; no wrong-patient attachment. External Stripe execution remains outside this local cash-visit acceptance.

### J18 — Needed follow-up does not become durable staff work

**Evidence: source inspection.** `telehealth/wrap_up_workflow.rb:80-137` finalizes a textual needed-follow-up plan but does not create a work item. `operations/follow_up_worklist.rb:20-46` selects only `StaffMessageRequest`; `OperationFollowUps.tsx:67-221` lists those requests. The in-person flow at `CareFlow.tsx:2698-2959` has close/checkout but no follow-up capture.

**Trigger/harm:** the clinician records a needed follow-up or finishes an in-person visit, yet staff have no encounter-linked item to arrange and close. A plan in prose is mistaken for completed operational handoff.

**Solution:** persist an encounter-scoped follow-up plan/work item, transactionally bridge finalized needed plans, and provide the in-person capture plus staff resolution linked to a real appointment. Project patient, encounter, site, current disposition and remaining action in Operations. Replay must yield one work item, not a second task. **Proof:** needed creates one visible item, arranged links the correct later appointment, none is explicit, and completion/reload preserves the result with tenant/site denial.

### J19 — Arranged follow-up can continue to look arranged after cancellation

**Evidence: source inspection.** `wrap_up_workflow.rb:199-221,275-276` validates the appointment at finalization only. Scheduling transition/reschedule reconciles telehealth/reminders but not the follow-up plan. `wrap_up_serializer.rb:30-33,55-58` and `PatientVisitCompletion.tsx:92-135` continue showing the linked appointment without current disposition.

**Trigger/harm:** a linked follow-up is later cancelled or moved. Staff lack an exception and the patient can see a cancelled arrangement as current.

**Solution:** preserve the historical finalized plan while projecting the linked appointment's current status/time. Reopen needed work for cancelled/no-show arrangements, reconcile valid reschedules, and expose truthful disposition. **Proof:** subsequent appointment changes update the worklist/patient projection without rewriting signed/finalized history or duplicating the item.

### Existing safeguards to preserve

Source inspection confirms atomic registration parent/child creation, same-key booking replay, appointment-locked check-in reuse, patient/site/appointment mismatch rejection, append-only encrypted SOAP revisions, revision conflict checks, signature identity checks, exact-decimal atomic vital collection saves, idempotent encounter closure, encounter-linked invoice lookup and one-active-invoice constraints. These reduce risk but do not establish the missing browser/recovery behavior. Existing narrow tests will be reused rather than duplicated.

## Integrated acceptance contract

1. Register one invented patient through the staff UI. Verify demographics and contact records persist together and a retry creates no second patient.
2. Book an appointment for that exact patient, refresh, then check in. Verify one appointment, one encounter, correct site/room and visible queue state.
3. Record vitals against the encounter. Exercise navigation, a failed save and a lost response. Verify one intended set of observations with unchanged decimal values and patient/encounter ownership.
4. Edit and save the provider note. Refresh its working draft, exercise a stale revision and an uncertain response, then sign explicitly. Verify the reviewed revision, signature and patient instructions agree.
5. Continue to checkout with the same patient/encounter. Resume a saved invoice, post and record a local cash payment with explicit staff actions. Retry ambiguous outcomes and verify one invoice/payment/allocation and the correct balance.
6. Close the visit and record or schedule follow-up through available staff controls. Reload the follow-up surface and verify persisted linkage and actionable outstanding work. No external message delivery is implied by saving or queuing a follow-up.
7. Exercise wrong-patient URL pairs, account changes, double clicks, refreshes, back/forward, dropped requests and stale tabs. Every rejected action must leave authoritative records unchanged and offer a safe staff next action.

## Implementation and verification record

Initial phase: source audit and complete documentation, then cohesive implementation, implementation freeze, one consolidated high-value verification pass, and only affected reruns after repairs. Existing integrated test `apps/api/test/integration/clinic_integrated_journey_test.rb` bypasses registration, vitals, note editing and follow-up and supplies no browser-interruption proof; it is not acceptance of this contract.

Isolated runtime configuration: PostgreSQL container `apply-dependable-visit`, port `54339`, development database `apply_dependable_visit_development`, test database `apply_dependable_visit_test`, frontend `3100`, API `3101`. Canonical setup completed against the isolated database. Final evidence and unresolved gates will be appended here.
