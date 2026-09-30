# MC01 starter replay and service-disable review

2026-09-30 UTC. Bounded builder assignment: the two confirmed MC01 discrepancies only. Source commit `706834658f0d6d5729014c63ec1fdd2a07b201ba`, branch `codex/mc01-preset-disable-recovery`, integration base `5470609423ed67b99453c3b779f584e0c86f2fd8`. The subsequent evidence-only commit does not change tested application source.

The [published immutable coverage matrix](https://github.com/joshrice171723-creator/meta_clinic/blob/df1dfec3fc9eb14b859b98bdf186d29fee1e18e9/records/audits/2026-09-30-mc01-mc02-mc04-source-coverage.md) remains unchanged; its cutoff remains `c16468388eeaed39acbbb2184049fd4c72ff2462`, with independent reconciliation `b768dec2fa0125af9be301303462cc56aed2153c`. This record supplies new implementation evidence, not a score correction or acceptance of an entire milestone.

## Approved requirement and implementation

| Requirement | Changed source and behavior | Focused evidence |
| --- | --- | --- |
| [Revision-4 journey brief](../superseded-plans/PATIENT_JOURNEY_PROOF_AND_REFINEMENT.md), line 30: repeat preset application preserves administrator customization and avoids duplicates. | [StarterProfile](../../apps/api/app/services/clinic/configuration/starter_profile.rb), lines 30–56, now resolves an existing visit by its saved practice-scoped ID. Renames, retirement, saved form identity and custom metadata survive. A missing or foreign linked ID rejects rather than creating a replacement. First application retains existing recipe behavior. | Authored Rails cases at [practice_features_test](../../apps/api/test/integration/practice_features_test.rb), lines 272 and 298. Runtime pending Sage. |
| [Capability architecture](../../docs/architecture/clinic-capability-architecture.md), lines 61–63: preview relevant consequences for permitted settings, revalidate at apply, preserve history/open work and action permissions. | New read-only [ServiceDisablePreview](../../apps/api/app/queries/clinic/configuration/service_disable_preview.rb), lines 36–108, summarizes removed service use within the selected site or sites inheriting clinic defaults. Six existing gate-backed services map to authorized appointments/current clinical revisions; laboratory and medication source tasks expose open/unassigned counts when existing encounter permission permits. Record-level conflicts/owners remain in the existing owning workspace linked by the preview. Restricted and unmapped work remains explicitly unknown. | Authored Rails cases at lines 311, 350, 376 and 415; runtime pending Sage. Controlled browser cases passed. |
| Protected profile and exact replay remain authoritative. | [PracticeFeatures](../../apps/api/app/services/clinic/configuration/practice_features.rb), lines 115–143, retains protected type/insurance/service-addition denial. New finalized service removal requires a matching preview digest, recomputed inside the existing practice/site lock. Request replay is reauthorized and checked before stale impact validation; old non-preview request digests remain compatible. No appointments, clinical revisions, assignments or tasks are changed by the configuration operation. | Rails tests author stale work rejection, committed replay after further work changes, independent assessment edits, unchanged task pool/source/state and unrelated service availability. These are authored assertions, not executed backend proof. |
| Browser recovery must preserve choices and the original uncertain request. | [PracticeFeatureSettings](../../apps/web/src/features/clinic/PracticeFeatureSettings.tsx), lines 402–580 and 940–1060, binds review to scope/revision/all current choices, rejects stale asynchronous scope responses, and requires reviewed consequences before removal. Known rejection retains choices and requires renewed review. Transport failure or explicit `outcome_unconfirmed` retains the whole original request/key/token, freezes editing and offers explicit identical retry. Existing protected controls remain protected. Contract at [contracts.ts](../../apps/web/src/api/contracts.ts). | [Seven synthetic browser cases](../../apps/web/test/practice-feature-service-disable.test.tsx): review/change/re-enable; lost response; explicit unconfirmed response; stale rejection; unavailable preview plus independent edit; location change; permission-restricted unknown summary. All passed. |

Mapped consequences cover telehealth, external laboratory coordination, prescription preparation, take-home fulfillment, minor office procedures and vaccinations. Other service-scope intent values receive an explicit unmapped review message; this increment does not invent workflows or imply those services have new backend gates. Task summaries may be unavailable even when record summaries are readable; unavailable is never rendered as zero. Counts and a fingerprint leave the query, not patient names, patient IDs, task IDs or member identities. Configuration permission does not grant chart access.

Existing clinical forms, identifiers, revision chains, workflow states and action-specific ownership remain authoritative. No new clinical fields, protocols or exchange format were selected, so no new FHIR conformance claim applies. The UI composes existing MUI Paper/Stack/Alert/Button/Checkbox controls, using installed Material UI 9.4.0 and its official [Alert](https://mui.com/material-ui/react-alert/) and [Button](https://mui.com/material-ui/react-button/) documentation.

## Verification actually executed

Final staged frontend selection completed successfully at approximately 21:01 UTC:

```sh
python bin/agent-check --phase final --staged --path apps/web --level component --reuse-evidence --run
```

- Changed-file whitespace check passed.
- Incremental TypeScript passed.
- Related tests: 2 files, 9 tests passed.
- Changed-flow tests: 1 file, 7 tests passed (controlled Chromium/Vite component walkthrough with wholly synthetic intercepted API responses, not a connected Rails journey).
- Changed-file Prettier check passed.
- Vite bundle passed.

Earlier six-case browser run failed because the test interceptor also captured Vite's `/src/api/client.ts` module. One diagnosed repair narrowed interception to pathname `/api/`; the six-case rerun passed. The explicit unconfirmed-response case subsequently expanded the suite to seven, which passed independently and in the final selection. Selector attempts with incompatible phase/filter options exited before executing checks; they are not passing evidence. Initial pnpm dependency preparation needed a writable temporary XDG directory and then succeeded with the unchanged frozen lockfile. No manifest or lockfile was changed. Source diff review and whole changed-file whitespace review passed.

`ruby` is absent in this environment. Rails runtime, PostgreSQL acceptance, eager loading and RuboCop have **not** run. No backend or infrastructure was provisioned. No screenshot or connected/backend acceptance is claimed.

## Sage handoff — pending backend receipt

Check out the exact published branch/head reported with this record in Sage's existing prepared synthetic backend environment. Preserve its runtime protections and clinic-data boundaries. No migration is added. Run these queued commands from the repository root:

```sh
python bin/agent-resources run -- sh -c 'cd apps/api && ruby bin/postgres exec env RAILS_ENV=test bin/rails db:prepare'
python bin/agent-resources run -- sh -c 'cd apps/api && ruby bin/postgres exec bin/rails test test/architecture/paper_trail_configuration_test.rb test/integration/practice_features_test.rb test/integration/settings_test.rb'
python bin/agent-resources run -- sh -c 'cd apps/api && ruby bin/postgres exec env RAILS_ENV=test bin/rails zeitwerk:check'
python bin/agent-resources run -- sh -c 'cd apps/api && ruby bin/rubocop app/controllers/clinic/practice_features_controller.rb app/queries/clinic/configuration/service_disable_preview.rb app/services/clinic/configuration/practice_features.rb app/services/clinic/configuration/starter_profile.rb test/integration/practice_features_test.rb'
```

These match the staged API component selector. The feature test file contains 16 cases, including six added MC01 cases. Return the exact checkout SHA, commands, totals and failures; route any repair only to these MC01-owned files. Backend acceptance remains pending until that receipt exists. This record and the builder's final handoff route the work to the coordinating thread; no Sage execution or acknowledgement has been observed here.

Only the eight named MC01 source/test files and this evidence record changed. MC02 and MC04 source were untouched. No PR, merge, main update, deployment, score update, live-clinic change, provider/financial call, credential change or new authority occurred.
