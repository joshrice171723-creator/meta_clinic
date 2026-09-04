# Cash-Pay Billing Agent Handoff

This handoff supersedes the 2026-09-03 remainder-only checkpoint. The current run is the single cohesive implementation pass for the owner-approved local synthetic billing scope; one final audit follows implementation.

## Checkpoint

- Scope: keep the existing ledger, cash drawer, refund, receipt, and provider-neutral boundaries; add the billing-only patient portal projection and server-gated, read-only Omni patient preview with synthetic patient switching.
- Explicitly deferred: check/OCR intake, card-present payments, Superbills, real provider credentials/calls, production PDF/email delivery, and hosted release.

## Verification

Verification is intentionally recorded after the implementation pass and one combined final audit, not per slice.

## Scope protection

No real payment credentials, card data, patient data, or live processor behavior is authorized or introduced. Any existing unrelated work remains preserved unless it is required by the owner-approved billing scope.

## Remaining gate

After implementation, run the focused checks and one final source/runtime/browser/approval audit. Fix consolidated findings once, then update the roadmap and evidence records.
