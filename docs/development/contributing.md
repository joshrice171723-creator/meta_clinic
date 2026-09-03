# Contributing

Keep `main` integrated and reviewable. Start from a clean, current branch, make the smallest independently reviewable change, and use synthetic fixtures or mocks.

```sh
git status --short --branch
git fetch origin
git switch -c codex/<short-task-name>
```

Do not reset, discard or blindly stash existing work. Coordinate ownership before changing shared routes, schema, authentication or cross-feature contracts. Keep API and frontend producers/consumers together, preserve exact decimal strings and server-side authorization, and do not treat UI capability flags as permission.

Run checks selected by `bin/agent-check`; use the app README commands for focused API/web checks. For delivery or operations changes also run the applicable offline tests and shell syntax checks described in the ops runbooks. A local pass is not GitHub, browser/accessibility, security, clinical or release acceptance.

Open a pull request after inspecting the scoped diff and `git diff --check`. The other developer reviews it and all required checks must pass before merge. Update a continuing checkout only with a clean, reviewed fast-forward or merge. Hosted staging delivery and production promotion are separate manually authorized workflows; follow the exact runbooks and never deploy from `site/`.
