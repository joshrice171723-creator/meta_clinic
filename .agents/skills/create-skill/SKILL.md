---
name: create-skill
description: Create or revise a focused APPly repository Agent Skill. Use when the user asks to add, scaffold, improve, or adapt an APPly repository skill.
---

# Create a repository skill

Create a capability under `.agents/skills/<skill-name>/` without moving product knowledge into the harness.

## Workflow

1. Define one concrete job, trigger phrases, exclusions and observable output. Search existing repository skills first; revise an existing skill instead of creating an overlapping duplicate.
2. For a job that depends on changing third-party APIs, frameworks or documentation, inspect the MCP tools actually available on the current host and the provider's official integration documentation. Prefer a first-party or explicitly selected MCP server for current upstream context; use the local lockfile, installed source, repository contracts and tests as truth for what APPly currently runs.
3. Inspect the live server tool catalog before naming tools because published packages and setup pages can temporarily differ. Name the required MCP capability and a bounded fallback in the skill. Do not assume a server or tool exists, invent tool names, make a documentation server authoritative over local code, or install/configure an integration unless the current task explicitly authorizes it. OpenAI's current MCP configuration and example-server index is at `https://developers.openai.com/codex/mcp`; it is a discovery starting point, not an exhaustive allowlist.
4. Keep `SKILL.md` concise. Its YAML frontmatter must contain a kebab-case `name` matching the folder and a discriminating `description`. Put conditional detail in `references/`, deterministic repeated logic in `scripts/` and output material in `assets/` only when each has a concrete use.
5. Keep automatic discovery unless the user wants a command-like or explicit-only skill. For explicit-only behavior, add `agents/openai.yaml` with `policy.allow_implicit_invocation: false` and say so in the description.
6. Keep `.agents/skills/` canonical and do not create a host-specific mirror unless the user has selected and authorized that integration.
7. If adapting third-party work, inspect the authoritative source and license. Record the repository, exact revision, paths, license and material changes in `agent-harness/THIRD_PARTY_NOTICES.md`; include license text when the license or copied material requires it.
8. Run `bin/verify-agent-harness` and `git diff --check`, then inspect the skill diff for secrets, sensitive material, stale facts and unfinished placeholders.

For a new skill whose full body is already prepared, `bin/create-agent-skill <name> --description <text> --body-file <path>` safely creates the canonical skill and OpenAI metadata without overwriting an existing skill. Use `--explicit-only` for a command-like skill. The generated files still require content review and repository validation.
