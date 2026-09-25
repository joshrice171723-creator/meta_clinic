# Main integration and Lightsail release attempt — 2026-09-24

## Source integration

- Inventoried all nine local branches and worktrees and fetched remote branches. The only branches with commits outside the previous `main` were `codex/journey-connected-proof` and `codex/marketing-specialty-architecture`; the others were already ancestors of `main`.
- Merged the marketing branch into the clean journey integration checkout without conflicts. Updated stale marketing checks for the expanded membership walkthrough, restored a disclosure for a related image on lab-results pages, and excluded untracked review images from the web image build context.
- Fast-forwarded and pushed `main` to `5a2aa693f471c8e800c817e28879576bed5a7664`. No local branch remains unmerged. Untracked screenshot/review output and an unrelated concurrent `launch.css` edit were left untouched.

## Local verification

- Frontend TypeScript and production bundle passed. Four focused frontend test files passed 21 of 21 tests after the marketing assertions were aligned with the merged content. Four changed Ruby files passed syntax checks; the scoped diff check passed.
- The focused membership Rails integration test did not start because this worktree's local PostgreSQL credential did not match the shared database. Starting a dedicated synthetic test database stalled and was stopped. Rails integration behavior is therefore unverified in this release attempt.

## Hosted release status

- Target: `https://aimetaclinic.com`, DNS `174.129.142.201`, owner Lightsail host. The documented release command was run from clean tracked `main` for exact revision `5a2aa693`.
- Local API image build failed twice because Docker BuildKit reported `frontend grpc server closed unexpectedly`. A legacy builder stalled at container startup. A simple local container start also stalled. Docker Desktop's restart remained stuck, and the Windows service could not be started from this non-administrator shell.
- The failure occurred before image upload or host preparation. No hosted database, image reference, secret or service was changed. A read-only host check showed API, worker, guided demo and web still using `2e866283e99065a73c0e8a9e1b21f16d5aca19f9`; public `/up` returned HTTP 200.
- Resume only after the local Docker service can build and run containers. Rerun the documented release command for the then-current reviewed `main`, including its database backup/restore checks and hosted verification. Source merge, local build and HTTP health alone do not establish hosted acceptance or clinical readiness.
