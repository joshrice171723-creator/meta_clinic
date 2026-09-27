# Focused coding workflow

The [implementation tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md#build-ready-queue--2026-09-27-preparation) owns the rolling build queue. This page holds reusable commands, not task status.

## One worker, one coherent workflow

1. Read Git status and the latest automation memory, fetch/pull main. Preserve unrelated files. Use the queue's exact file targets and nearest instructions; graft callers before changing a shared symbol. Do not restart whole-repo discovery.
2. Finish one connected workflow before picking another. Reuse existing service/UI owners. If two attempts hit the same environmental blocker, record the command and exact blocker and move to the next independent row.
3. Run one consolidated scoped non-test pass. No tests unless Joshua requests them. Inspect permission, persistence, money/stock and lost-work boundaries touched by the change. A source walkthrough does not claim browser acceptance.
4. At the hourly checkpoint update tracker evidence and this queue once; the atlas reads the tracker hourly. Keep concise intermediate facts in the automation memory. Plans and arbitrary score increments do not establish completion.
5. Review owned diff; synchronize main and master if present/applicable, commit only owned paths, push without force, verify remote SHA. Leave incomplete work explicitly identified.

## Commands (PowerShell)

Repository root:

```powershell
git status --short
git fetch origin
git pull --ff-only origin main
python bin/agent-preflight --path <target>
graft callers <symbol> --depth all
ruby bin/dev status
```

For a stopped local stack, use `ruby bin/dev preview` when the checkout's existing preview profile/database is prepared; otherwise follow [getting started](getting-started.md) and `ruby bin/dev start --no-browser`. Verify the checkout/ports reported by status before browsing. Do not reset data, install dependencies, restart a healthy stack or create another database for an ordinary edit.

API directory `apps/api`:

```powershell
ruby bin/postgres exec bin/rails db:migrate
bundle exec rubocop <changed-ruby-file> <changed-ruby-file>
```

Run migration only after a reviewed additive migration exists. The PostgreSQL wrapper supplies the local password privately; never print credential files or bypass it with an unconfigured database command. Review generated `db/structure.sql`.

Web directory `apps/web`:

```powershell
pnpm exec prettier --write <changed-ts-or-tsx-file>
pnpm run typecheck
```

Repository root before committing:

```powershell
git diff --check
git diff -- <owned-paths>
python bin/verify-vault
# Only when harness or developer documentation changes:
python bin/verify-agent-harness
git fetch origin
git pull --ff-only origin main
git branch -r --list origin/master
# If origin/master exists and applies, merge it without discarding owned work.
git add -- <owned-paths>
git diff --cached --check
git commit -m "<coherent change>"
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

Vault validation is needed when links/structure change, not after every source edit. Existing resource scheduling rules in [development resources](development-resources.md) still apply to heavy commands. These commands are non-test checks; do not use a broad check selector that silently includes tests.
