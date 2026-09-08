# Continuous integration

The repository workflow is `.github/workflows/ci.yml`. It runs on pull requests targeting `main`, pushes to `main`, and manual workflow dispatch; there is no scheduled trigger. Six jobs currently run:

| Job | Authority and scope |
| --- | --- |
| `agent_docs` | Read-only structural/link checks for the vault and agent harness. |
| `scan_ruby` | Brakeman and Bundler Audit. |
| `lint` | RuboCop. |
| `frontend` | Locked npm install, Vitest, format check, TypeScript/Vite build and npm audit. |
| `delivery_contract` | Offline release/configuration/launcher/route tests and host-shell syntax checks; no AWS/Docker calls. |
| `test` | Rails/PostgreSQL tests, eager-loading and backend verification, conversion/restore checks, then the real Vite-to-API HTTP harness. |

CI uses synthetic data and disposable runners. It does not receive hosted secrets, upload vault content or deploy to EC2. Documentation-only changes still run the workflow because no path filters are configured.

## Delivery boundary

CI evidence, staging evidence, browser/accessibility evidence and production acceptance are distinct. The manual `deploy-staging.yml` workflow builds and verifies a matched API/web image pair from one `main` commit, publishes immutable digests and deploys only after its explicit confirmation. `promote-production.yml` accepts only the exact staged pair with fresh scans and the required production controls. Neither workflow authorizes real data, clinical use or a production change by itself.

For hosted operations, use [EC2 operations](../../ops/aws/ec2/README.md), [staging and production](../../ops/aws/ec2/environments.md), and [PostgreSQL cutover](../../ops/aws/ec2/postgres-cutover.md). Their procedures and actual hosted observations remain authoritative.
