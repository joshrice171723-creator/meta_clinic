# Clinic workflow planning outputs

Each writable run of `clinic-workflow-planning` creates or updates one assignment file here: `<assignment-slug>.md`. The same assignment reuses the same file. Its fixed sections hold the scoped plan, source mapping, acceptance criteria, checkpoint, and latest run result.

After repository preflight, the skill runs `python .agents/skills/clinic-workflow-planning/scripts/ensure_plan.py <assignment-slug>` from the repository root. This creates the file or marks a new run in progress without overwriting prior plan sections. The agent completes the file before handoff; an in-progress marker alone is not a finished plan.

These files are assignment briefs. Every assignment file must also have a resolving Markdown link and evidence-bounded status in the [Meta Clinic Implementation Tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md); `bin/verify-agent-harness` checks the link. The tracker remains the current work inventory, and the [build and acceptance guide](../meta-clinic-build-and-acceptance.md) owns the shared dependency matrix. Existing canonical records remain at their owning paths. Earlier briefs are linked from the relevant assignment file when revisited; they are not moved automatically.
