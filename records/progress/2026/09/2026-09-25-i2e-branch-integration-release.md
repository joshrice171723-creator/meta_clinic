# i2E branch integration and hosted release — 2026-09-25

## Branch and worktree inventory

Fetched and pruned `origin`, then inspected all nine registered worktrees and every local and fetched remote branch ref. All branch tips were already contained in `origin/main`; none had commits ahead, so there was no unmerged i2E branch content to combine. The i2E investor page, Jane workflow handoffs and public `/i2e` Nginx route were already present in main. No worktree or branch was deleted. Existing untracked review outputs were preserved and excluded from the release.

## Build correction and Git push

The first production web image build stopped at TypeScript because `conversionTarget.baseline` is nullable in the type, while this test first asserts its expected non-null value. A non-null assertion was added only to the subsequent arithmetic expression in `apps/web/test/i2e-investor.test.tsx`.

`pnpm run typecheck` passed. The matched API and web container builds passed; the web build ran TypeScript and Vite, and the container's `nginx -t` succeeded with an existing duplicate MIME-type warning. No test suites were run. Commit `550f951224b120b5e721ee3e8b80a01b51530f17` was pushed to `origin/main`.

## Hosted release

The documented Lightsail release completed for the exact commit `550f951224b120b5e721ee3e8b80a01b51530f17`. The release backed up and restore-checked both hosted databases, migrated them, activated matched API/web images, and passed readiness checks for web, API, worker and isolated demo services. The hosted verifier passed HTTPS login and API health, public-development-login configuration, anonymous denial, CSRF denial, password login, authenticated clinic context, owner PIN gate, concurrent context reads, logout denial, isolated demo login/Omni organization setup, and Sandbox registration, creation, site switching, persistence and reset.

After release, `/i2e` returned HTTP 200 and the deployed i2E JavaScript asset returned HTTP 200 with the Jane prescribing and supplier-workflow handoff copy. The host's `current-revision` reported the exact released commit above. This is synthetic investor-demo publication evidence, not clinical or production acceptance.
