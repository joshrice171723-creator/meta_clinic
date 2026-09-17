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

## Status matrix

| Priority | Area | Status | Evidence and limits |
| --- | --- | --- | --- |
| P0 | Organization → clinic → location → account entry | Locally verified | Desktop, tablet, and phone retained-session smoke routes passed; a full fresh mutation journey remains open. |
| P0 | Patient Flow → Schedule → Tracking Board boundary | Locally verified at API level | Consolidated selector: 162 runs / 1,955 assertions / 0 failures / 0 errors / 0 skips. Scheduled appointments do not enter Tracking Board until an encounter/check-in exists. Browser mutation re-walk remains open. |
| P0 | Permissions and tenant/site isolation | Locally verified for focused selectors | Tracking Board and scope/permission checks pass; a complete fresh-session denied-action matrix is still open. |
| P0 | Responsive/accessibility acceptance | Partially verified | Desktop/tablet/phone smoke and a phone keyboard/overflow spot check passed; WCAG/assistive-technology/zoom/error-state acceptance is not complete. |
| P1 | Registration, clinical record, billing, communications, inventory/workforce | Locally verified by consolidated selector | Consolidated selector: 162 runs / 1,955 assertions / 0 failures / 0 errors / 0 skips. Browser mutation and provider proof remain open. |
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

- The latest browser-created paid-member → initial-contact → appointment →
  check-in journey has not been freshly re-walked after the stale-projection
  repair.
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

- Rails P0/P2 selector: **45 runs / 392 assertions / 0 failures / 0 errors / 0 skips**.
- Frontend schedule test: **9 tests passing**, including the location-timezone
  regression.
- Frontend suite: **51 files / 383 tests passing**;
  production type/build and focused formatting checks were passing in the
  prior verification record.
- Consolidated source-owned selector: **162 runs / 1,955 assertions / 0
  failures / 0 errors / 0 skips**.
- Pharmacy workspace selector after contract repair: **10 runs / 119
  assertions / 0 failures / 0 errors / 0 skips**.
- Browser smoke matrix: desktop and phone core clinic routes passed; managed
  browser mutation accessibility control was unavailable for a fresh paid
  member walkthrough.

## Safest next action

Perform a fresh synthetic browser mutation walkthrough of the paid-member
journey. Keep
the P2 conditional features blocked until product owners approve the missing
contracts; then implement each extension as a separately testable, bounded
slice.
