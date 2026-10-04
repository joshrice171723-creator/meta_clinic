# Clinical, statement-print and provider follow-up — 2026-10-03

## Scope and release

Joshua reported disabled procedures, immunizations and assessments, a statement-print action that appeared inert and left Close stuck, operator-gated telehealth, and simulated Stripe. He requested provider sandboxes with test credentials and preservation of all prior work. This continues the authorized GitHub and aimetaclinic.com reconciliation release.

- Source repair: `99a929e16148036b30156167a539a9b66dca8628`.
- Corrected shared-Sandbox ownership check and final deployed revision: `228ae291351602802ee9d0507d82f3b239fe1ed5`.
- Both releases completed through the canonical Lightsail wrapper with matched API/web images, encrypted off-host recovery archives and all 26 hosted checks passing. Each archive is retained in the owner's secure recovery directory under its exact revision.
- Original reconciliation backups, worktrees and stashes remain preserved. No reset, reseed, force push or history rewrite was performed.

## Clinical configuration and preservation evidence

The existing Sandbox profile differed from fresh seed configuration. Its finalized profile omitted procedures/vaccinations and had an empty assessment scope. Ordinary finalized-profile editing correctly refused adding previously unselected services.

Added an explicit operator-only repair service that validates the active Sandbox, practice, operator membership and exact location scope, locks shared preparation before row locks, preserves prior immutable profile versions and appends an idempotent revision. It is not part of automatic Sandbox preparation and has no HTTP endpoint.

The first invocation failed before writing because the helper incorrectly required the lesson and current run visitors to match. Shared Sandbox restart intentionally retains the lesson while allowing a different run visitor. The correction retains visitor presence plus matching operator/practice and all other scope guards.

Successful invocation: run **79**, practice **8**, site **145 / Guided Clinic**, practice-default scope excluded. New feature version **290**, revision **2**, retains existing services and adds `minor_office_procedures`, `vaccinations`, and `tobacco_use` assessment scope. Sites 148, 162 and 163 were excluded.

- Patients: **603 before / 603 after**, every prior patient ID retained.
- Encounters: **1,004 before / 1,004 after**, every prior encounter ID retained.
- All prior practice feature-version attributes compared equal after the append.
- Hosted Chrome: opened the existing draft encounter 13897; Procedures → Add procedure outcome, Immunizations → Add immunization, and Structured assessments → Add structured assessment each opened its form. No clinical revision was saved.
- Clinic-administered vaccine completion remains separately gated. Historical/external/registry immunization entry is available. The repair does not invent a clinical review or enable `immunization_administration_enabled`; a separate source correction preserves an already-enabled flag during unrelated profile edits when vaccination scope remains selected.

## Statement print

The original nested-iframe print call stalled browser automation and returned no observable print confirmation. Replaced it with an authenticated standalone print-view link and a narrowly scoped Sandbox new-tab exception for statement/receipt HTML routes.

Hosted Chrome verified that the statement for synthetic patient 7766 rendered, **Open print / PDF view** opened the same authenticated statement in another tab, and the original preview's **Close** returned to the ledger. The standalone document exposes **Print statement**. Native printer output or a saved PDF was not observed through the available browser interface and remains unverified.

## Provider sandbox status — not connected

Prepared an explicit Stripe test-mode gate for private hosted staging and its webhook route/configuration documentation. The gate remains off. It excludes guided public demo and ordinary public-development-login access; simulator account history is preserved. Private provider-testing access remains a pending user choice.

Located the user's **Meta Clinic Provider Console** and its handoff export under Desktop / 08 - Product Workspaces. It is a provider tracker; the static files contain no provider API credentials. Located the ignored provider configuration in the original Meta Clinic checkout and the older APPly checkout; no values were printed or committed.

- Current saved Stripe test key: read-only account request returned **403 permission denied**. Older APPly test key: **401 / api_key_expired**. Appropriate test account/Connect permissions and a dedicated hosted webhook signing secret remain needed.
- Saved Twilio Video API key: read-only Video Rooms request returned **200**. This corrects the initial overbroad classification based on the saved account SID matching an SMS test-account field.
- Saved Twilio Account SID/Auth Token pair: read-only account request returned **401 / 20003**. API-key account discovery also failed (**401 / 70004**). No account identity was inferred from these failures. The saved callback URL is a placeholder; a matching Video account/callback Auth Token and real hosted callback configuration remain needed.
- No provider credentials were copied to the host, no payment or Video room was created, and no provider connection or end-to-end media/payment acceptance is claimed.

## Checks and limits

Passed Ruby syntax, scoped formatting/whitespace, portable Compose configuration, portable-delivery verification, agent-harness validation, TypeScript and both production web bundles. Both canonical releases passed all 26 hosted checks. The clinical form and statement-tab walkthroughs are bounded UI evidence; no application test suites or comprehensive clinical/provider acceptance were run or claimed.
