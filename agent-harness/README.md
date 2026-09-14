# APPly agent harness

This directory documents the repository's agent control plane. It is separate from the APPly software knowledge base in `APPlyVault/`.

## Boundary

| Layer | Canonical location | Owns | Must not own |
| --- | --- | --- | --- |
| Always-on policy and routing | Root and nested `AGENTS.md` | Stable safety, authority, preservation and path-routing rules | Dated project state, task status or duplicated product requirements |
| On-demand procedures | `agent-harness/workflows/` | Reusable implementation, research, release, incident and handoff methods | Product facts or evidence that changes over time |
| On-demand capabilities | `.agents/skills/` | Discoverable task-specific instructions and optional resources/scripts | Runtime permissions or claims that a prompt is an enforcement boundary |
| Deterministic helpers | `bin/agent-*`, `bin/verify-agent-harness`, `bin/verify-vault` | Preflight, routing and structural checks | Human approval, professional judgment or release acceptance |
| Developer handbook | `docs/`, application READMEs and runbooks | Current setup, architecture, checks and operational mechanics | Product status, agent policy or historical transcripts |
| Software knowledge base | `APPlyVault/` | Current direction, requirements, decisions, risks, research and recent evidence indexes | Agent-runtime procedure, developer command manuals or long historical transcripts |
| Historical evidence | `records/` | Detailed dated/superseded records retained outside default context | Current status, instructions or authority |
| Executable truth | Source, tests, migrations and runbooks | Current implementation and operational mechanics | Unverified business or clinical claims |

The physical `AGENTS.md` files remain at repository and subtree boundaries because agent discovery depends on their location. Their content should stay concise and stable. When a product fact changes, update the owning vault note or source—not an agent instruction.

## Entry sequence

1. Read root `AGENTS.md` and the nearest nested `AGENTS.md` for the target path.
2. Run `bin/agent-preflight --path <target>` and retrieve only the product, decision, risk and evidence context needed for the task.
3. Load only the relevant workflow from `agent-harness/workflows/`.
4. Use `APPlyVault/01 Table of Contents.md` to retrieve the minimum current product context needed for the task.
5. Use a skill only when its description or explicit invocation matches the job.
6. During a build, use `bin/agent-check --phase build --path <target> --level focused` only for a useful focused signal. After staging the frozen candidate, run one `--phase final --staged` component or integration selection. Repair with named `--check` values only. The report includes impacted product areas and exact selected tests; dependency audits run locally only when dependency files changed.
7. Report the final checks, evidence and residual risks in the task handoff.

`agent-harness/routes.json` is the machine-readable selector behind `bin/agent-preflight`. It maps repository surfaces to applicable workflows, skills, developer documentation, minimum vault context and checks without duplicating their contents or granting authority.

## Skills

Canonical repository skills live under `.agents/skills/`, the repository location discovered by Codex. Host-specific mirrors are intentionally absent; the harness should gain an adapter only when that host is actually selected.

- `plan`: read-only investigation and an evidence-backed execution plan.
- `act`: scoped implementation and verification using the current plan or clear request.
- `vault-context`: targeted retrieval from the APPly knowledge base without loading the entire vault.
- `create-skill`: create or revise focused repository skills, preferring an available authoritative MCP source for changing upstream context while retaining local-code and explicit-installation boundaries.
- `clinic-workflow-planning`: plan connected patient/staff journeys using applicable U.S. sources, field-level data requirements and maintenance of the existing six-column ownership/dependency matrix; keeps brainstorming and implementation authority separate.
- `frontend-ui`: consult the project-configured official MUI MCP, then implement APPly interfaces through existing APPly/Material UI composition; fall back explicitly to installed package source/types and official documentation when the server is unavailable.
- `startdev`: run the canonical `bin/dev` lifecycle for non-destructive start/restart, fast-forward-only refresh, explicit setup or data reset, stop, and strict status.
- `task-trace`: explicitly measure observable task execution and return a metadata-only JSON trace plus self-contained SVG timeline; it does not expose private reasoning or provide a CPU profile.

Codex invokes an explicit skill with `$plan`, `$act`, `$vault-context`, `$create-skill`, `$startdev` or `$task-trace` (or through `/skills`); `frontend-ui` may be selected automatically when its description matches the request. Codex does not currently expose arbitrary repository-defined slash aliases, so `/startdev` and `/task-trace` express intended command names while the `$` forms are the reliable invocations. Plan/Act borrow Cline's open-source mode concepts, but they are repository prompt skills rather than Cline integration. A skill or workflow does not remove tools from a host and cannot substitute for its sandbox, approval policy or native mode controls.

Create a new skill with `$create-skill` or with `bin/create-agent-skill` after its description and body are ready. Command-like skills should route through a checked-in deterministic helper: `startdev` uses canonical `bin/dev`, and `task-trace` uses `bin/task-trace`. Use the [knowledge-maintenance workflow](workflows/knowledge-maintenance.md) for periodic cleanup. Validate harness structure with `bin/verify-agent-harness`; validate the knowledge base with `bin/verify-vault` and `bin/vault-audit`.

## Provenance

The Plan/Act distinction is adapted from Cline's open-source mode design. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the exact reviewed sources, revision and limits of the adaptation.
