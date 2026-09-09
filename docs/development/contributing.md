# Contributing

Keep `main` integrated and reviewable. Before a repository change, inspect the active task context for the same objective and overlapping claims. Start from a clean, current branch, make the smallest independently reviewable change, and use synthetic fixtures or mocks.

```sh
git status --short --branch
git fetch origin
git switch -c codex/sc-<story-id>/<short-task-name>
```

Do not reset, discard or blindly stash existing work. Put the base commit, branch/worktree and bounded paths in the Story claim; stop conflicting edits when another active claim overlaps shared routes, schema, authentication, generated artifacts or cross-feature contracts. Keep API and frontend producers/consumers together, preserve exact decimal strings and server-side authorization, and do not treat UI capability flags as permission.

Run checks selected by `bin/agent-check --path <target> --level component`; repeat `--path` for each owned surface and use `focused` for fast local feedback or `integration` for the applicable boundary contracts. The command discloses unrelated dirty files without allowing them to broaden check selection. Use the app README commands for narrower API/web diagnosis. For delivery or operations changes also run the applicable offline tests and shell syntax checks described in the ops runbooks. A local pass is not GitHub, browser/accessibility, security, clinical or release acceptance.

Open a pull request after inspecting the scoped diff and `git diff --check`. The other developer reviews it and all required checks must pass before merge. Add the result, checks, evidence and residual risks to the claimed Story; move it to In Review while acceptance remains or Done only when its bounded outcome is complete. Update a continuing checkout only with a clean, reviewed fast-forward or merge. Hosted staging delivery and production promotion are separate manually authorized workflows; follow the exact runbooks and never deploy from `site/`.
