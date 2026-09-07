# Hardening review handoff — 2026-09-07

This is a local, fictional-development review handoff. It records implementation and verification evidence; it does **not** certify APPly as production-ready, HIPAA compliant, clinically accepted, or safe for real payments or patient data.

## Review focus

- **Checkout and refund recovery.** `5052676` adds strict paid-invoice refund reconciliation and `9eb55f7` exposes the existing authorized clinic refresh. `dd84a19` records a post-repair automatic signed webhook delivery: one USD 0.01 sandbox refund was applied as the second cumulative refund row after an earlier USD 5.00 refund. Review connected-account identity, cumulative-delta locking, idempotency, and the boundary between webhook delivery and reconciliation.
- **Async stale-completion hardening.** `4988adc`, `166dde6`, `e9405e6`, `806e472`, `4d82b6c`, `f037770`, and `46f8046` scope retries or late completions to the current patient, selection, resource generation, draft, clinical-save, or recalled-receipt state. Their focused tests are helper-level ordering/recovery checks unless the checkpoint says otherwise; do not read them as mounted UI or live-write proof.
- **Appointment draft protection.** `7bcb11c` adds baseline-based clinic-navigation and `beforeunload` guards for changed booking fields; reset and successful creation advance that baseline. Its focused `staff-workflow` result passed 1 file and 6 tests. The create endpoint has no request-key/idempotency contract, so an unknown create outcome is not automatically retried or claimed recoverable by this frontend-only change.
- **UI resilience.** Recent contained commits preserve data and action layouts without changing authority: `40f7ba5`, `c21eeae`, `b6f8483`, `44c9f96`, `2f6fc20`, `11967f9`, and `61456bd`. They address compact time ranges, long backend text wrapping, and tablet-width payment controls. No new user-facing workflow was introduced.

## Verification actually completed

- Existing full ClinicWorkspace integration: **28 runs, 306 assertions**, green against `apply_finalization_20260907_a`; log: `apps/api/tmp/finalization-clinic-workspace-full.log`.
- Earlier full frontend suite: **20 files, 206 tests**, green; log: `tmp/production-finalization/web-full-suite-final.log`.
- Final combined `apps/web` `npm run typecheck` passed after all frozen frontend commits, including `7bcb11c`. Focused frontend hardening tests were intentionally narrow; the checkpoint identifies their exact file/count and helper-level limit. Sol's final source inspection also confirmed the locked clinical-history forms retain enabled exact retry controls and unlock after success or deterministic rejection; it was not a mounted-dialog or live-write check.
- Existing inventory retry verification reported **1 run, 20 assertions** with tenant and digest boundaries retained. Sol's final review found exact retry controls enabled and success/rejection unlocking unchanged, with no additional edit.
- Patient portal keyboard inspection verified modal Tab movement, Escape dismissal, and focus return. The browser screenshot bridge timed out twice at CDP `Page.captureScreenshot`; no new 390px screenshot is claimed.

## Known limits and required skepticism

- Native print preview, saved PDF, pagination/page breaks, and physical printing of released instructions remain unverified.
- Sandbox ordinary-invoice checkout, membership settlement, authenticated refund reconciliation, and one post-repair automatic refund webhook are verified. Recurring renewal, failed collection, and production payments are not. The configured canonical host matters because `localhost` and `127.0.0.1` do not share browser cookies.
- Live AI/Scribe provider output remains deferred. No live provider-quality claim is made.
- Prepaid credits, automatic membership credit draw, positive-difference upgrades, and backend no-downgrade enforcement remain unimplemented. Existing invoice credit notes are not a transferable wallet.
- The mutable published catalog description remains a content follow-up; immutable purchases and invoices were intentionally not rewritten.

## Working-tree boundary

Preserve unrelated dirty API authorization/test-account/structure files and web App, Workspace, identity, workforce, and login-test files. Do not reset, format broadly, or fold them into a hardening change. Consult [production-finalization-checkpoint.md](production-finalization-checkpoint.md) for detailed contracts, commands, logs, and historical evidence.
