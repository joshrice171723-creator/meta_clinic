# Continuous integration

The repository workflow is `.github/workflows/ci.yml`. It runs on pull requests targeting `main`, pushes to `main`, and manual workflow dispatch; there is no scheduled trigger. Ordinary feature-branch pushes do not trigger it. The `scope` job uses the complete push range or pull-request base to select work through `bin/ci-change-scope`:

- Documentation-only changes retain `agent_docs` without application suites or bundles.
- Web-test-only changes run frontend tests, TypeScript and formatting, without production bundles or dependency audit. API-test-only changes retain lint, both Rails shards and backend contracts. Mixed test/documentation changes combine those scopes.
- Production, dependencies, CI/tooling, unknown paths and manual dispatch retain every existing check. Missing diff history falls back to full checks. Renames count both old and new paths.

This selects work, not acceptance: skipped jobs are not passing application evidence, and existing failing checks stay unresolved. CI always checks instruction structure. The existing application jobs are:

| Job | Authority and scope |
| --- | --- |
| `agent_docs` | Read-only structural/link checks for the vault and agent harness. |
| `scan_ruby` | Brakeman and Bundler Audit. |
| `lint` | RuboCop. |
| `frontend` | Locked pnpm install, Vitest, format check, TypeScript/Vite build and pnpm audit. |
| `portable_delivery` | Checks that portable delivery stays loopback-only, commit-pinned, and free of cloud OIDC authority. |
| `rails_test` | Two Rails/PostgreSQL test shards and eager-loading. |
| `backend_contracts` | Backend invariants, conversion/restore and the real Vite-to-API HTTP harness. |

CI uses synthetic data and disposable runners. It does not receive hosted secrets, upload vault content or deploy to EC2. Changing the selector or workflow itself requests full checks; there is no blanket event-level path filter that hides a workflow failure.

## Local release retries

`ops/lightsail/release.ps1` checks existing SSH access before image builds. A normal invocation still builds matched images without fingerprinting overhead. For a checked candidate's build and subsequent explicitly requested retries, opt in with `-ReuseBuiltImages`. It may reuse a successful local build receipt less than 24 hours old. The receipt must match the full revision, build mode, tracked/untracked source hashes, Vite environment inputs, installed dependency/input content hashes, and both immutable Linux/amd64 image IDs and revision labels. Missing, changed, expired or malformed evidence falls back to a fresh build. Unreadable inputs, dependency junctions into another worktree, inputs over 128 MiB or a fingerprint exceeding its ten-second lookup budget also prevent reuse. Receipts contain digests and image IDs, never environment values or keys, and stay in the user's temporary directory.

Reuse is packaging evidence only. Main/remote equality, clean tracked source, archive collision checks, fresh image transfer, recovery/restore, encrypted off-host round trip, migrations, host switching and hosted verification still run. No previous hosted or QA evidence is promoted to a fresh pass. There is no new automatic release or container dispatch. Keep paused loops paused, and obtain the existing publication approval before a release.

Focused selector and synthetic receipt checks are `python -B bin/test-ci-change-scope` and `pwsh -File ops/lightsail/test-build-receipt.ps1`; neither contacts providers or changes a host.

## Delivery boundary

CI evidence, container publication, browser/accessibility evidence and hosted acceptance are distinct. The manual `publish-containers.yml` workflow builds the API and web from one `main` commit and publishes commit-tagged images to the repository owner's GitHub Container Registry. It does not deploy them or grant a host access.

For packaging and future owner-controlled hosting, use [portable deployment](../../ops/portable/README.md). Historical AWS observations remain evidence only under `records/` and are not current operating instructions.
