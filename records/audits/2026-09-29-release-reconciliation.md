# Meta Clinic release reconciliation — 2026-09-29

## Verified release receipt

Version 0.2.1 at revision `646a4384df0e3c19dcd0f439d88e82bebc87cbd0` completed the guarded Lightsail release. Matched API/web images, encrypted recovery and hosted release checks passed. Independent public build.json matched; /up and /clinic/updates returned HTTP 200. Browser inspection confirmed /login?next=/qa displays the QA owner credential form. Successful login to QA with the user’s platform-owner account remains unverified. Demo Owner is not sufficient for the QA API guard.

PRs #25–29 are merged. Atlas Build remains 73.2%, Validation 46.3%, External / human 0%. No progress increase or Muse current-build pass is inferred from publication. Muse confirmed its ten-minute schedule resumed; its QA-page inspection was partial and blocked by account authorization and the deployment overlap.

## Preserved and excluded work

- Root checkout: dirty clinic setup recovery largely duplicates shipped behavior. Its added setup_incomplete_sites payload/UI is redundant with current context.sites; its workforce visibility change needs authorization-scope review. Source, test, config and untracked files remain untouched.
- demo-trust-fixes: anonymous navigation-tour draft remains unverified. SharedDemoLesson.enter! dereferences visitor.id for a previous non-Sandbox run, so a nil visitor can fail. CareFlow timezone rewrite and scribe outcome/demo changes have substantial drift and require focused review. All four dirty originals are preserved.
- workforce-activation-release: temporary release helper is untracked and excluded.
- QA cash, demographics, invoice, inventory and invitation branch repairs are already carried into main. Patch-hash mismatches for PIN autofill and task-based repair counting were checked against current source: both behaviors are present.
- PR #3: historical tracker-only draft; excluded to preserve current evidence and percentages.
- PR #4: conflicting host-side automation proposal; excluded pending conflict resolution and review, including completed build-worktree cleanup.
- Generated render/output files, marketing assets of unreviewed provenance and local model config remain outside this release.

## Proof boundary

This release was assisted and does not count as an unattended cycle. Eight open GitHub muse-qa issues were observed during reconciliation. Historical PDF, imported records and Muse exports overlap and have no verified unique aggregate. Current-build Muse verdict, full workflow coverage, 90% Build and three unattended releases remain unproven.
