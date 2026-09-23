# Meta Clinic Session Closeout Runbook

**Revision:** 1  
**Date:** 2026-09-17  
**Purpose:** Close the work covered by this session without confusing source implementation, local verification, browser acceptance, or human/provider approval.

This is a closeout procedure, not a second backlog or decision register. The
[Meta Clinic Implementation Tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md)
remains the work inventory. The [remaining-work report](./meta-clinic-remaining-work.md)
remains the current gap report. Historical plans and evidence retain their
original meaning.

## Finish line

This session can be closed only when all of the following are either completed
with evidence or explicitly recorded as an external/deferred dependency:

1. The current source and checkout are reconciled with the full application review.
2. The fresh synthetic browser journey proves:
   `membership/payment → patient → Patient Flow → Schedule → appointment → check-in → Tracking Board`.
3. The latest Patient Flow stale-projection repair is exercised in that journey.
4. The role, site/tenant, accessibility, responsive, error, and session boundaries
   required for this development scope have evidence or a named unresolved gate.
5. Schedule, reporting, retention, clinical, financial, provider, privacy, tax,
   and operational decisions are either approved, deferred, or blocked by an
   identified owner.
6. Every document claim that says “complete,” “proved,” or “verified” is dated
   and scoped to the evidence that actually supports it.
7. The final diff contains only authorized work, the intended checks are recorded,
   and the committed branch is aligned with its remote.

“Source complete” alone is not session closeout. A local simulator is not a live
provider transaction, and a passing test is not browser or professional approval.

## Authority and boundaries

- Use current source and the current `main` checkout as implementation authority.
- Use the tracker for item status and ownership.
- Use the full review and remaining-work report for the reconciled scope and gaps.
- Use the engineering guide as the ownership/dependency matrix.
- Use the decisions and product strategy records for accepted boundaries.
- Use the patient-journey evidence file for dated local proof and its limitations.
- Use synthetic/local data only. Do not use real patients, real cards, live
  provider transactions, production records, or external communication.
- Do not enable deferred P2 features merely to make the checklist green.
- Preserve unrelated working-tree files and historical evidence.

## Ordered closeout steps

### 0. Freeze and establish the baseline

Owner: coordinator/lead.

- Confirm the current branch, commit, remote alignment, and dirty files.
- Stop other writers before the integrated acceptance pass.
- Record the exact source revision used for each later result.
- Preserve unrelated `.codex` configuration and attachment files.
- Confirm that no real-data or live-provider action is in scope.

Exit evidence: a baseline note containing branch, commit, remote SHA, dirty-file
list, active runtime endpoints, and the synthetic database/fixture name.

### 1. Reconcile the documents before testing

Owner: coordinator/lead.

Compare the following in one pass:

- [Full application review](./meta-clinic-full-application-review.md)
- [Remaining-work report](./meta-clinic-remaining-work.md)
- [P0–P2 audit](./meta-clinic-p0-p2-audit.md)
- [Implementation tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md)
- [Consolidated patient journey](../../PATIENT_JOURNEY_PLAN.md)
- [Patient-journey evidence](../development/patient-journey-implementation-evidence.md)
- [Engineering guide](../development/meta-clinic-build-and-acceptance.md)

Resolve documentation drift by recording, rather than silently rewriting:

- the current checkout SHA;
- the current test selector and totals;
- whether J0–J7 evidence is historical, newly re-walked, or still open;
- which statements are source inspection, automated checks, browser observation,
  documented assumption, or unresolved.

Exit evidence: one dated reconciliation entry in the existing tracker/report,
with no duplicate status register created.

### 2. Run the source-owned verification set

Owner: coordinator/lead.

Run the focused Rails selector, frontend tests, typecheck, production build,
changed-file formatting/lint checks, and `git diff --check` required by the
current repository workflow. Record the exact commands and results. Keep any
repository-wide failures separate from the bounded selector.

Required assertions include:

- tenant/site and role authorization;
- payment idempotency and uncertain outcomes;
- Patient Flow appointment projection;
- schedule capacity, conflict, cancellation, no-show, and timezone behavior;
- persistence after reload and correction/version history;
- inventory/workforce ownership and unit/lot integrity;
- owner aggregate-only boundaries.

Exit evidence: named commands, pass/fail totals, and an explanation for every
failure or intentionally deferred check.

### 3. Complete the fresh synthetic browser journey

Owner: one browser operator; no parallel browser/database writer.

Use a fresh session and synthetic records. Capture a screenshot or trace at each
transition:

1. Select organization, clinic, location, and team account.
2. Open the front-desk membership enrollment flow.
3. Select recurring or one-time terms and save the enrollment.
4. Complete the local, explicitly labeled payment simulation.
5. Confirm the server-created patient and initial-contact work item.
6. Open Patient Flow and verify the patient name/reference is visible.
7. Schedule the first appointment from the selected-patient flow.
8. Verify the month/day schedule count and selected-patient context update.
9. Confirm the initial-contact card is not duplicated after an active appointment
   exists, while the underlying Work Inbox task remains available.
10. Check in or start the encounter explicitly.
11. Refresh Tracking Board and verify the patient appears only after arrival/
    encounter start.
12. Navigate away and back to verify session, date, site, and patient context.

Do not create the patient through a backend shortcut for this step. If browser
control is unavailable, record the browser acceptance as blocked; do not replace
it with an API-only claim.

Exit evidence: a persisted patient, membership/payment result, appointment,
encounter/check-in transition, before/after board state, and screenshots or a
replayable trace.

### 4. Prove the paired negative and recovery paths

Owner: coordinator/lead with the browser operator.

For each consequential boundary, prove both the blocked action and an independent
permitted action:

- wrong role, site, or organization is denied;
- duplicate or uncertain payment does not create a second patient or charge;
- conflicting appointment selects a safe alternative;
- cancelled/no-show appointment does not satisfy active scheduling;
- stale edit/save is rejected without losing the current record;
- failed or unavailable provider state preserves local work;
- closing an encounter leaves unrelated lab, prescription, billing, and follow-up
  work visible and owned;
- clearing or changing patient context does not leak the prior patient.

Exit evidence: API or browser trace for each pair, with the exact record and
permission scope identified.

### 5. Run the role, device, accessibility, and session acceptance pass

Owner: coordinator/lead; human usability review remains separately identified.

Cover the roles that are in scope for the local clinic journey: front desk,
billing, clinician/clinical staff, inventory/workforce, administrator, and owner.
Check permitted and denied actions, not only landing pages.

On desktop, tablet, and phone verify:

- patient identity, owner, reason, blocker, and next action are readable;
- no horizontal overflow or oversized-card collapse hides controls;
- keyboard focus and modal focus are visible and ordered;
- loading, empty, stale, error, blocked, and success states are understandable
  without color alone;
- zoom/reflow and screen-reader status announcements are usable where required;
- a two-hour idle/session check does not silently discard an accepted session or
  replay a consequential mutation.

Exit evidence: role/device matrix with screenshots or traces and explicit
unresolved accessibility or human-review items.

### 6. Resolve policy and external gates

Owner: product/clinic decision owners; do not invent an owner or approval.

Record a decision, deferral, or blocker for:

- timezone/DST, closures, recurrence, overbooking, buffers, provider absence,
  capacity, and the legacy clinician-assignment compatibility path;
- report catalog, freshness, filters, row permissions, export provenance,
  retention, PHI handling, and reconciliation ownership;
- clinical roles, minimum clinical dataset, review/signing, medication/lab
  applicability, and AI-scribe accountability;
- Stripe MOTO/telephone payment, messaging, telehealth, pharmacy, and laboratory
  provider contracts and acceptance;
- privacy/security, jurisdiction, tax, incident recovery, deletion, support,
  deployment, pilot, and release approval.

The safe P2 baseline remains enabled while conditional extensions remain blocked.

Exit evidence: linked decision or risk record for every unresolved gate, with
responsible owner and the exact action blocked.

### 7. Repair only findings that fail the finish line

Owner: serialized source owner.

- Batch findings from steps 2–6 into one repair list.
- Fix only concrete defects within the authorized scope.
- Re-run the failed check and checks directly invalidated by the repair.
- Do not broaden scope into a new feature wave during closeout.
- Preserve historical evidence and add superseding dated notes when needed.

Exit evidence: focused repair diff, affected checks, and an updated tracker entry.

### 8. Final handoff and closure

Owner: coordinator/lead.

- Inspect the final diff and `git status --short`.
- Confirm no secrets, real data, unrelated files, or uncommitted task work were
  included.
- Commit authorized source/document changes and push the intended branch.
- Verify local `HEAD` equals the remote branch SHA.
- Update the tracker and gap report with actual evidence and remaining gates.
- State plainly whether the result is source-complete, locally verified,
  browser-verified, human-approved, pilot-ready, or release-ready. Do not use a
  stronger label than the evidence supports.

## Closeout record template

Copy this structure into the existing tracker or dated evidence record when the
steps are performed:

```text
Closeout date:
Revision / branch:
Synthetic runtime and database:

Source implementation:
- Completed bounded capabilities:
- Deferred or blocked capabilities:

Automated checks:
- Command / result / limitation:

Browser observation:
- Fresh journey result:
- Screenshots or trace:
- Negative/recovery result:

Human/provider decisions:
- Approved:
- Deferred:
- Blocked and owner:

Documentation reconciliation:
- Historical claims retained:
- Superseded or corrected claims:

Final status:
- Highest truthful status:
- Remaining risk:
- Next action, if any:
```

## Stop conditions

Stop and report the affected step when:

- a browser or provider action would require real credentials, real payment,
  real patient data, or external communication;
- a required owner, policy, or approval is unknown;
- a mutation's outcome is uncertain and retry could duplicate money, identity,
  scheduling, stock, or transmission;
- the current source and documents disagree about the authority of a record;
- a fix would expand into a new source of truth, unrestricted tenant creation,
  unsupported provider behavior, or a general workflow engine.

Independent safe steps may continue, but the whole session must not be labeled
closed while a required closeout step is blocked.
