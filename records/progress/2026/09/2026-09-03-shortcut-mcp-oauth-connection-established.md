---
type: progress-record
status: archived
event_date: 2026-09-03
source: founder-authorized Shortcut connection
---

# 2026-09-03 — Shortcut MCP OAuth connection established

**Outcome:** the project-scoped Codex configuration now points to Shortcut's hosted MCP endpoint with `read`, `story-write` and `comment-write` scopes. The founder completed the OAuth approval, and `codex mcp list` reported the `shortcut` server enabled with OAuth authentication.

**Authority:** the founder explicitly authorized starting the app.shortcut.com MCP connection and completed the interactive approval. D-059 is amended to reflect that connection authority.

**Boundary:** no Shortcut workspace, team, Epic, Iteration, Story, comment or workflow setting was selected, created or changed. The running Codex task did not hot-load the newly configured Shortcut tools, so workspace/team discovery remains a read-only first action in a fresh project task. The vault remains the canonical task/status register pending a separately accepted cutover.

**Credential handling:** OAuth material remains outside the repository in Codex-managed host storage. No token, credential or private Shortcut content was written to source, documentation, the vault or this evidence record.

**Limits:** authentication is not approval for Story writes, GitHub integration, webhooks, automatic synchronization, workspace administration, release action or use of real/confidential data.
