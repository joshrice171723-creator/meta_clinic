# Shortcut execution workspace

Shortcut is APPly's active task coordination and status system under D-060. The
configured OAuth MCP connection is used to inspect, claim, create and complete
bounded Stories in Agent Workspace before and after repository changes.

## Configured target

| Object | Name | ID |
| --- | --- | --- |
| Workspace | APPly | `6a959342-97a0-420a-83c0-df12164f7be1` |
| Team | Agent Workspace (`agent-workspace`) | `6a9a1399-c3ef-478b-ad87-4acd84f2b7fa` |
| Workflow | Standard | `500000005` |
| Backlog | Backlog | `500000006` |
| Unstarted | To Do | `500000007` |
| Started | In Progress | `500000008` |
| Review | In Review | `500000009` |
| Completed | Done | `500000010` |
| Epic workflow | Default | `500000001` |
| Epic state | to do | `500000002` |
| Epic state | in progress | `500000003` |
| Epic state | done | `500000004` |

At the 2026-09-03 cutover there was no current Iteration. An absent Iteration
does not block Story coordination; use a later current Iteration only when it
already exists and clearly fits the work.

## Ownership boundary

Under the active cutover:

- Shortcut may hold Iteration membership, operational Story state, assignee,
  priority, estimates, blocking relationships and work-in-progress signals.
- `APPlyVault/` owns product direction, requirements, decisions, risks and
  professional/release gates. It does not own a task list or roadmap.
- GitHub owns branches, commits, pull requests, reviews and merged source.
- `records/` owns dated implementation, verification, recovery and release
  evidence. A Shortcut comment or state transition is a pointer, not the
  underlying evidence.

Do not copy patient information, confidential applicant material, credentials,
legal advice or private source documents into Shortcut. Stories and agent work
remain wholly synthetic and use repository links for durable context.

## Work model

Use one independently reviewable outcome per Story. Shortcut's
[Roadmap](https://app.shortcut.com/apply-1/roadmap) and Epics provide the broad
workstream view. Reuse an existing Epic or current Iteration when it clearly
owns the outcome; create new grouping only for a real workstream, not merely to
fill a field. The Story owns task-level scope, acceptance, dependencies and
status. Do not create or maintain task IDs, task briefs or task checklists in
the vault.

The configured Standard workflow is:

1. **Backlog** — not selected for the active Iteration.
2. **To Do** — bounded and available but not actively claimed.
3. **In Progress** — a named person and agent run have claimed the Story.
4. **In Review** — the bounded result is ready, but pull-request or human review
   remains.
5. **Done** — the Story's bounded acceptance and stated evidence are complete.

Use active Story claims—not an assumed agent count—as the present overlap
control. Any later team-level WIP limit requires its own explicit configuration
decision and remains an operational signal, not a permission or release control.

## GitHub association

Keep the repository branch prefix and include Shortcut's Story marker, for
example `codex/sc-123/immutable-content-revisions`. Configure version-control
event handling only after separately authorizing the exact repository mapping.
If enabled later, use:

- associated branch -> In Progress;
- opened pull request -> In Review.

Do not map merge directly to Done. Multiple branches or pull requests may
represent unresolved work, and APPly completion requires the Story's stated
evidence beyond a merge. No automatic version-control state mapping is enabled
by this cutover.

## Agent access

Shortcut publishes an OAuth-based hosted MCP server at
`https://mcp.shortcut.com/mcp`. The configured project host uses the narrow
`read`, `story-write` and `comment-write` scopes. Do not grant `admin` or broad
write access merely for agent convenience. Each person
authenticates their own account; never commit tokens or OAuth material.

The project-local Codex configuration is checked in at `.codex/config.toml`:

```toml
[mcp_servers.shortcut]
url = "https://mcp.shortcut.com/mcp"
scopes = ["read", "story-write", "comment-write"]
```

OAuth credentials remain in Codex's host credential storage and must never be
copied into the repository. Codex loads project MCP tools when a task starts,
so start a fresh project task after adding or changing this configuration.
Follow Shortcut's current
[MCP documentation](https://www.shortcut.com/help/integrations/mcp-server/) and
[Codex setup guide](https://www.shortcut.com/help/integrations/codex-cli/) at
the time of activation.

When the configured Shortcut tools are missing or report expired OAuth, inspect
`codex mcp get shortcut --json` and the checked-in project configuration first.
If the enabled server, exact endpoint and narrow scopes still match, an agent is
authorized to run `codex mcp login shortcut` once without a separate
repository-level permission request. Codex stores the resulting credentials in
host credential storage; agents must not handle tokens directly or broaden the
configured scopes.

Valid stored credentials may refresh without human input. A rejected refresh
token requires a new OAuth grant, so any provider or client account-consent step
still follows the host's confirmation policy and cannot be bypassed by a skill.
After successful login, verify the current authenticated user and Agent
Workspace team with the callable Shortcut tools. Resume or start a fresh local
APPly task only when the current client does not refresh its tool catalog. A
failed login or identity/team mismatch leaves repository-changing work blocked
and permits read-only diagnosis only.

## Agent Story lifecycle

1. Search Agent Workspace for the same outcome and inspect all active claims
   that could overlap its paths, contracts, schema or generated artifacts.
2. Reuse the exact Story or create one bounded Story. Do not duplicate or take
   over another active claim; coordinate there and continue only independent
   work.
3. Assign the current authenticated user, move the Story to In Progress and add
   one concise claim comment containing the agent/run identifier, branch or
   worktree, base commit, intended outcome and bounded paths.
4. Run `bin/agent-preflight --story sc-<id> --path <target>` and retrieve the
   minimum linked product, decision, risk and evidence context.
5. Implement and run task-scoped checks. Progress chatter stays in the agent
   task; Shortcut receives only material blockers, scope/ownership changes and
   handoff.
6. Add the result, changed paths or pull request, checks, durable evidence and
   residual risks to the Story. Move it to In Review when acceptance remains,
   or Done when the bounded Story outcome is complete.

If Shortcut is unavailable or inconsistent with the repository, preserve the
discrepancy and continue read-only diagnosis only. Do not guess status, create a
local mirror or begin an uncoordinated repository write.

## Cutover record

The MCP endpoint and narrow `read`, `story-write` and `comment-write` OAuth
scopes were configured and authenticated on 2026-09-03. Read-only discovery then
identified the exact APPly workspace, Standard workflow and Agent Workspace
team. The founder explicitly authorized the task/status cutover on 2026-09-03;
Story `sc-78` is the first harness change to use the complete claim and
completion lifecycle.

This cutover authorizes bounded Story reads, creation, assignment, comments and
state transitions needed for repository task coordination. It does not
authorize team/workflow administration, automatic synchronization, outgoing
webhooks, spending, publication, production access, real/confidential data or
any professional/release acceptance.
