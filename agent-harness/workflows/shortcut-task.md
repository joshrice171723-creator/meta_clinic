# Shortcut task coordination workflow

## When to use

Use this workflow before every repository-changing task. D-060 makes Shortcut's
APPly **Agent Workspace** the canonical active task, claim and status plane. A
read-only review may proceed without creating a Story unless the user asks for
one, but it must not cross into a repository write without a claim.

The exact workspace, team, workflow and state IDs are recorded in
[`docs/development/shortcut.md`](../../docs/development/shortcut.md). A Shortcut
Story coordinates execution; it cannot expand repository, data, release,
clinical, contractual or spending authority.

## Connection recovery

Treat an expired configured OAuth session as recoverable before declaring
Shortcut unavailable:

1. When Shortcut tools are absent or a call reports reauthorization is needed,
   run `codex mcp get shortcut --json` from the repository root and inspect the
   project `.codex/config.toml`. Continue only when the server is enabled, its
   URL is exactly `https://mcp.shortcut.com/mcp`, and its checked-in scopes are
   exactly `read`, `story-write` and `comment-write`.
2. Run `codex mcp login shortcut` once. The founder authorizes agents to
   initiate recovery of this established connection without a separate
   repository-level permission prompt. Never widen scopes, paste a token, read
   credential storage or repeat or persist the native client's authorization
   URL, callback parameters or tokens in source, notes, comments or user
   messages.
3. Use available computer-use/browser tools to complete the existing login
   and authorization flow before asking Joshua to reconnect manually. Inspect
   the current browser tabs or authorization window, verify the intended
   Shortcut account/workspace and the configured scopes, and accept the
   matching authorization prompt. Joshua explicitly authorizes this recovery
   of the established connection; do not ask again merely because an OAuth
   consent button appears. Reuse a pending login rather than starting another.
   Keep authorization URLs and callback values transient and out of reports.
   If no authorization page opened, use the current login attempt's URL to
   open it through the supported browser tools without publishing that URL.
   Ask for help only when a concrete step cannot be completed with available
   tools, such as a required user-only authentication challenge, unavailable
   browser control, an account/scope mismatch, or a host-enforced confirmation.
   State the exact blocker and attempted recovery. Provider and host safeguards
   still apply; these instructions do not bypass authentication or widen access.
4. After the command exits successfully, re-resolve the task tool catalog and
   verify both the authenticated user and Agent Workspace team through Shortcut
   MCP. If the current client cannot refresh its catalog, resume or start a
   fresh local APPly task and verify again before any repository write.

Make only one login attempt per recovery. A configuration mismatch, failed or
incomplete OAuth flow, unavailable command, identity/team mismatch or still
uncallable tools makes Shortcut unavailable for the task: preserve the
discrepancy and continue read-only only.

## Inspect and select

1. Query Agent Workspace before editing. Search non-Done Stories by objective,
   likely component and relevant keywords, then inspect started Stories for
   overlapping paths, branch/worktree, contract or migration claims.
2. Reuse a Story only when it describes the same bounded outcome. If it is
   unclaimed and ready, start it. If another run or person has an active claim,
   do not reassign it, duplicate it or touch the overlapping scope; coordinate
   on that Story and continue only independent work.
3. If no exact Story exists, create one in Agent Workspace with a concise
   outcome, boundaries, acceptance evidence and relevant repository context.
   Use an existing Epic or current Iteration only when the fit is clear. Do not
   invent an Epic, Iteration, deadline, estimate, owner or priority merely to
   fill a field.
4. Assign the current authenticated Shortcut user and move the Story to **In
   Progress**. Add one claim comment with the agent/run identity, base commit,
   branch or worktree, intended outcome and bounded path scope. When practical,
   include `sc-<id>` in a new `codex/` branch name; an existing branch may be
   retained when the claim comment makes ownership unambiguous.
5. Run `bin/agent-preflight --story sc-<id> --path <target>` for every major
   path. The Story owns the task-level outcome, acceptance, dependencies and
   active status; repository and vault sources remain supporting context.

## Execution and evidence

- Keep the Story's scope and claim current when the objective or owned paths
  materially change. Progress chatter stays in the agent task; comment only on
  a material blocker, handoff, scope/ownership change or verified result.
- Keep product requirements, decisions, risks and professional/release gates in
  the vault. Keep material dated evidence under `records/`. Shortcut owns the
  active execution state and points to those durable sources rather than
  copying them.
- Use isolated worktrees, databases and ports when concurrent work needs them.
  A separate worktree does not cure overlapping contracts, schema or shared
  generated artifacts; the Story claim must disclose those surfaces.
- Never put credentials, patient information, confidential applicant material,
  legal advice or private source documents in a Story, comment or attachment.

## Standard workflow

- **Backlog** — proposed or not ready for selection.
- **To Do** — bounded and available, but not actively claimed.
- **In Progress** — an identified run/person owns the current execution scope.
- **In Review** — implementation or documentation is ready, but pull-request or
  human acceptance remains.
- **Done** — the Story's bounded outcome and stated checks/evidence are complete.

For a material blocker, leave the Story In Progress and add the blocker, owner
needed and safe next action. If abandoning the claim, comment why, return it to
To Do and remove only the current user's assignment when doing so will not erase
another accountable owner.

## Completion

Before the final response, add one concise Story comment containing the result,
changed paths or pull request, checks actually run, durable evidence links and
remaining risks or gates. Move the Story to In Review when review remains, or
Done only when the bounded acceptance is satisfied. Merge, CI or an agent
assertion alone does not close a security, professional, clinical, operational,
HIPAA or release gate.

If Shortcut is unavailable or its current state cannot be established, preserve
the discrepancy and continue read-only diagnosis only. Do not create a local
status mirror or start an uncoordinated repository write.
