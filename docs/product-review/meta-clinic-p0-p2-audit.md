# Meta Clinic P0–P2 Correctness Audit

**Audit date:** 2026-09-17  
**Branch:** `main`  
**Data boundary:** Synthetic/local records only. No real patient, payment, provider, or production data was used.

## Executive conclusion

The bounded P0–P2 source work is internally coherent for the tested local
paths, but it is not a complete product or launch acceptance. One correctness
defect was found and repaired: Schedule formatted timestamps using the practice
timezone even when the selected location overrides it. Calendar display,
booking handoff, and post-booking date selection now use the selected site's
timezone.

The conditional P2 extensions are intentionally not enabled. External calendar
sync, advanced recurrence/overbooking, personalized dashboards, and broader
multi-clinic reporting still lack approved ownership and source/conflict or
metric contracts. Enabling them would create unsupported behavior or a second
source of truth.

## Two-part re-audit — 2026-09-17

### Part 1 — core workflow and evidence reconciliation — completed

The current checkout was compared with the closeout evidence, source session
policy, and the P0–P2 records. The fresh synthetic path is now recorded as
browser-verified through membership/payment, patient creation, Patient Flow,
selected-patient Schedule, appointment creation, front-desk check-in, and the
post-arrival Tracking Board. The retained-session route matrix passes on
desktop, tablet, and phone. The source also sets a two-hour idle timeout and a
12-hour absolute session ceiling; elapsed-session behavior is an acceptance
check, not a claim inferred from those constants. The stale open-walk wording
and pre-repair test totals in this report were documentation defects and are
corrected below.

### Part 2 — source-owned acceptance breadth — completed with explicit limits

The source-owned Part 2 selector now passes **135 runs / 1,467 assertions / 0
failures / 0 errors / 0 skips** across role/site permissions, scheduling,
registration, billing, inventory, workforce, portal, reminders, scribe, and the
cross-role integrated clinic journey. It exposed one stale synthetic fixture:
the waitlist recovery path had no weekly capacity rules for its clinician/site;
adding those rules repaired the fixture without changing runtime behavior, and
the full selector was rerun clean. Frontend **51 files / 383 tests**, TypeScript,
production build, and the desktop/tablet/phone seven-route smoke matrix also
pass. The package-script tablet invocation had a development-selector harness
timeout; direct execution of the same browser harness against `localhost`
passed, so this is recorded as tooling behavior rather than a product failure.

The remaining Part 2 limits are real acceptance gates: fresh browser action
denials for every role, populated-resource mutation walkthroughs beyond the
core membership journey, screen-reader/contrast/zoom/modal/error-state review,
elapsed two-hour session proof, and clinical/provider/privacy/tax/retention,
support, pilot, and release decisions. Source and local checks do not satisfy
those human or external gates.

## Status matrix

| Priority | Area | Status | Evidence and limits |
| --- | --- | --- | --- |
| P0 | Organization → clinic → location → account entry | Browser-verified for the bounded journey | Fresh synthetic entry and the retained-session desktop/tablet/phone route matrix passed. Full role/action denial coverage remains in Part 2. |
| P0 | Patient Flow → Schedule → Tracking Board boundary | Browser-verified for the bounded journey | The fresh mutation walk preserved the selected patient through Schedule and kept the appointment off Tracking Board until check-in. Current paired selector: 87 runs / 724 assertions; broader continuity selector: 50 runs / 525 assertions. |
| P0 | Permissions and tenant/site isolation | Locally verified for focused selectors | Tracking Board and scope/permission checks pass; a complete fresh-session denied-action matrix is still open. |
| P0 | Responsive/accessibility acceptance | Partially verified | Desktop/tablet/phone smoke and a phone keyboard/overflow spot check passed; WCAG/assistive-technology/zoom/error-state acceptance is not complete. |
| P1 | Registration, clinical record, billing, communications, inventory/workforce | Locally verified for source-owned contracts; bounded browser path verified | The consolidated selector remains valid source evidence. The fresh browser proof covers membership/payment and scheduling; populated module workflows and provider proof remain in Part 2. |
| P1 | Schedule policy | Partial | Site timezone/DST, capacity, closure, conflict, and cancellation paths are represented. Recurrence, overbook, buffers, absence policy, and the legacy clinician-without-assignment compatibility path remain decision-dependent. |
| P1 | Reporting/export/audit/retention | Partial | Read-only server calendar export and domain-specific provenance exist. A consolidated report catalog, retention/export contract, and reconciliation owner are not established. |
| P2 | Safe baseline | Source-complete | In-house calendar is authoritative; `.ics` export is read-only; recurrence/overbook are explicit `not_configured`; owner command center is aggregate-only. |
| P2 | Conditional extensions | Deferred/blocked | No approved owner, conflict/source-of-truth policy, role-preference contract, provider contract, or aggregate metric definition. No implementation should be enabled yet. |

## Corrections made during this audit

- `ClinicSchedule` now resolves the selected location's
  `timezone_override` before formatting calendar times, dates, booking success
  messages, and check-in navigation. It falls back to the practice timezone
  when no override exists.
- Added a frontend regression test covering location override and fallback.
- Added a calendar contract test asserting the P2 policy remains
  `recurrence: not_configured`, `overbook: not_configured`, and
  `external_sync: read_only_export`.
- Manual pharmacy catalog creation now strips unverified NDC identifiers; the
  pharmacy fixture supplies its required inventory bin and input unit.
- Time-dependent appointment fixtures now use a clinic-local daytime slot so
  valid one-hour visits do not cross midnight and fail capacity validation.
- Reconciled the stale P0–P2 browser-status and selector-total claims with the
  newer closeout evidence; no runtime authorization or source-of-truth change
  was needed for this Part 1 repair.
- Added weekly synthetic capacity rules to the cross-role integrated journey so
  its waitlist offer/recovery path exercises the same capacity guard as runtime.
- Updated the remaining-work report and implementation tracker with the P2
  boundary decision and this audit's evidence limits.

## Logic and workflow audit findings

### Correct boundaries observed

- Calendar appointments are projected from tenant-bound appointment records;
  booking rechecks capacity and conflicts in the existing backend path.
- Cancelled/no-show visits are not treated as active calendar capacity, and an
  encounter/check-in is the explicit transition into Tracking Board.
- Retained calendar responses are discarded when their month or site does not
  match the current URL state, preventing stale cross-location display.
- Owner command-center data contains clinic/member counts and owner invitation
  state, not patient identifiers, clinical records, or clinic financial detail.
- External calendar output is labeled read-only and includes server provenance;
  it cannot mutate schedule state.

### Gaps or risks still open

- A repository-wide baseline has not been established; broader historical
  suites may still contain unrelated fixture or route assumptions outside the
  consolidated selector.
- Full browser role denial, populated-resource, keyboard/zoom, screen-reader,
  modal, loading, and error-state evidence is missing.
- Live Stripe MOTO/payment-reader, messaging, telehealth, clinical governance,
  legal/tax/privacy/retention, and deployment evidence remain external gates.
- Calendar policy does not yet define recurrence, overbooking, buffers, or
  provider absence. The UI must continue to present these as unavailable until
  those decisions are approved.

## Verification record

- Historical Rails P0/P2 selector: **45 runs / 392 assertions / 0 failures /
  0 errors / 0 skips**.
- Frontend schedule test: **9 tests passing**, including the location-timezone
  regression.
- The earlier frontend suite record of **51 files / 383 tests** is retained as
  historical evidence; it was not rerun in this Part 1 slice. The prior
  production type/build and focused formatting checks were passing in that
  verification record.
- Consolidated source-owned selector: **162 runs / 1,955 assertions / 0
  failures / 0 errors / 0 skips**.
- Closeout continuity/checkout/workspace selector: **50 runs / 525 assertions /
  0 failures / 0 errors / 0 skips**.
- Closeout paired negative/recovery selector: **87 runs / 724 assertions / 0
  failures / 0 errors / 0 skips**.
- Part 2 role/populated-workflow selector: **135 runs / 1,467 assertions / 0
  failures / 0 errors / 0 skips** after the capacity-fixture repair.
- Pharmacy workspace selector after contract repair: **10 runs / 119
  assertions / 0 failures / 0 errors / 0 skips**.
- Browser smoke matrix: desktop, tablet, and phone passed for the seven core
  clinic routes; the fresh synthetic paid-member mutation walkthrough also
  passed. Full accessibility and elapsed-session evidence remain open.

## Safest next action

Assign owners for the remaining human/provider acceptance gates and run the
separate prelaunch matrix. Keep the P2 conditional features blocked until
product owners approve the missing contracts; then implement each extension as
a separately testable, bounded slice.
