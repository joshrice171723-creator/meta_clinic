# Continuous integration

The repository workflow is `.github/workflows/ci.yml`. It runs on pull requests targeting `main`, pushes to `main`, and manual workflow dispatch; there is no scheduled trigger. Six jobs currently run:

| Job | Authority and scope |
| --- | --- |
| `agent_docs` | Read-only structural/link checks for the vault and agent harness. |
| `scan_ruby` | Brakeman and Bundler Audit. |
| `lint` | RuboCop. |
| `frontend` | Locked npm install, Vitest, format check, TypeScript/Vite build and npm audit. |
| `portable_delivery` | Checks that portable delivery stays loopback-only, commit-pinned, and free of cloud OIDC authority. |
| `test` | Rails/PostgreSQL tests, eager-loading and backend verification, conversion/restore checks, then the real Vite-to-API HTTP harness. |

CI uses synthetic data and disposable runners. It does not receive hosted secrets, upload vault content or deploy to EC2. Documentation-only changes still run the workflow because no path filters are configured.

## Delivery boundary

CI evidence, container publication, browser/accessibility evidence and hosted acceptance are distinct. The manual `publish-containers.yml` workflow builds the API and web from one `main` commit and publishes commit-tagged images to the repository owner's GitHub Container Registry. It does not deploy them or grant a host access.

For packaging and future owner-controlled hosting, use [portable deployment](../../ops/portable/README.md). Historical AWS observations remain evidence only under `records/` and are not current operating instructions.
