# Patient Portal audit evidence

Date: 2026-09-03

## Change and repository evidence

- `git status --short --branch` showed a shared worktree with unrelated reminder/scribe/staff-messaging edits and the protected `apps/api/app/queries/clinic/billing/patient_ledger.rb` change.
- Migration collision check found unrelated versions `20260903001200`, `20260903001210`, `20260903001220`, and `20260903001230`; the Patient Portal migration uses unique version `20260903001300`.
- The lifecycle files are present in `bf81eb3`, and `HEAD` and `origin/main` both point to that commit at handoff time. That commit also contains unrelated shared-agent work because the checkout advanced concurrently; no history rewrite was attempted.
- The handoff documentation is the only new material being committed by this checkpoint.

## Verification

| Check | Result | Notes |
| --- | --- | --- |
| Ruby syntax | Pass | Lifecycle services, controllers, and migration returned `Syntax OK`. |
| `git diff --check` | Pass | No whitespace errors were reported for the checked working tree. |
| Migration version uniqueness | Pass | `20260903001300` is distinct from all existing/untracked migration versions. |
| Web typecheck | Blocked by unrelated shared work | `npm run typecheck` reached another agent's `apps/web/src/features/clinic/Reminders.tsx` and failed on MUI `Stack` `justifyContent` typing at lines 12 and 31. |
| Web test suite | Inconclusive | The concurrent `npm test` process did not finish during the bounded verification window. |
| Rails route load | Inconclusive | The concurrent `bundle exec rails routes` process did not finish during the bounded verification window. |
| Patient Portal integration tests | Not run | Route wiring and test fixtures are in mixed/shared files and require reconciliation first. |
| Live browser smoke | Not run | The activation route is not yet safely committed with the mixed `App.tsx`/routes wiring. |

## Required follow-up acceptance

1. Reconcile and commit the mixed route/App/contracts/context hunks so activation is reachable and the patient projection cannot expose an unsigned later revision.
2. Add focused integration tests for invitation replay/expiry, wrong patient/practice assignment, missing terms, reserved-account activation, revocation invalidating an existing session, and generic recovery responses.
3. Add the dedicated `patient_portal.identity.invite` and `patient_portal.identity.revoke` permission rules once `Ability` is free of the concurrent reminder/scribe edits.
4. Run Rails migration/loadability checks, focused backend tests, web typecheck/tests, and a redacted synthetic browser activation → portal → revoke denial smoke test.
5. Keep production enablement blocked pending the roadmap's identity, recovery, support, privacy/security, clinical, finance, accessibility, and operations owners and approvals.
