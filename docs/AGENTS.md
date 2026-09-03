# Developer-documentation instructions

These instructions apply to `docs/` and extend the repository contract.

- Keep docs current and source-adjacent: setup, commands, architecture, testing, CI and operational mechanics belong here.
- Do not create a second decision, task, risk or progress register. Link to the canonical vault record when product context matters.
- Use repository-relative Markdown links, not Obsidian wiki links.
- Prefer stable contracts and owning paths over changing test totals, dated transcripts or temporary branch state. Move material historical evidence to `records/`.
- Verify every command against the current source or runbook and run `bin/verify-agent-harness` after changes.
