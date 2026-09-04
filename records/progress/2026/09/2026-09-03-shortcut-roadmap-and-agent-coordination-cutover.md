---
type: progress-record
status: archived
event_date: 2026-09-03
source: founder-authorized Shortcut cutover
---

# 2026-09-03 — Shortcut roadmap and agent coordination cutover

**Outcome:** the founder explicitly selected Shortcut as APPly's sole roadmap
and task-tracking system. APPly workspace
`6a959342-97a0-420a-83c0-df12164f7be1` uses Agent Workspace
`6a9a1399-c3ef-478b-ad87-4acd84f2b7fa` and Standard workflow `500000005`.
The configured states are Backlog `500000006`, To Do `500000007`, In Progress
`500000008`, In Review `500000009` and Done `500000010`. No current Iteration
was present at cutover. Shortcut Roadmap uses Epic workflow `500000001` with to
do `500000002`, in progress `500000003` and done `500000004`.

**Coordination contract:** every repository-changing agent run inspects Agent
Workspace for the same outcome and overlapping claims, reuses or creates one
bounded Story, assigns the current authenticated user, moves it to In Progress
and records run/base/branch/path ownership before editing. The final Story
update records the result, checks, evidence and residual risks before In Review
or Done. Shortcut state does not grant release, production, data, clinical,
contractual or spending authority.

**Roadmap:** Shortcut Epics provide the broad Roadmap grouping. The harness
cutover is Story [sc-78](https://app.shortcut.com/apply-1/story/78) under Agent
Infrastructure Epic [80](https://app.shortcut.com/apply-1/epic/80). The former
Vault roadmap/task register and 29 generated task briefs were removed from
`APPlyVault/` and preserved under `records/tasks/`; the patient-portal
implementation roadmap was preserved under `records/proposals/`. They are
historical evidence, not a fallback status source.

**Repository result:** root policy, harness routing/workflows, Story-aware
preflight, developer/architecture guidance, the vault-context skill and the
Vault authority records now point roadmap and task activity to Shortcut. The
Vault remains the current source for product direction, requirements,
decisions, risks, research and evidence indexes.

**Verification:** `bin/verify-agent-harness`, `bin/verify-vault`,
`bin/vault-audit`, both focused Python harness test files and
`git diff --check` passed. The vault audit retained advisory size/lifecycle
findings; no application runtime or hosted release check was required for this
documentation/tooling cutover.

**Limits:** no automatic GitHub mapping, webhook, team/workflow administration,
production access, confidential data, patient information, professional review
or release action was authorized or performed.
