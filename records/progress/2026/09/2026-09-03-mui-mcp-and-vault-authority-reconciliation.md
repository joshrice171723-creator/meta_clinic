---
type: progress-record
status: archived
event_date: 2026-09-03
source: founder-authorized project MCP configuration and read-only verification
---
# MUI MCP and Vault authority reconciliation

The project-scoped configuration now selects the official Material UI MCP alongside the existing Shortcut MCP. MUI MCP output is limited to upstream documentation and examples; local dependency ranges, installed source and types, APPly architecture, tests and executable behavior remain implementation truth. Shortcut remains the sole roadmap, Story-status and coordination plane.

Read-only verification resolved `@mui/mcp` 0.1.4 from the official MUI repository. The published server exposed `fetchDocs` and `generateReactCode`; the documented `useMuiDocs` tool was unavailable in the live package. `fetchDocs` successfully retrieved an official MUI page. Code generation was not used because its separate recipe credential was not configured or requested.

The Vault remains authoritative for product direction, requirements, decisions, risks, research and evidence indexes. Former Vault task registers and briefs are preserved under `records/`; active notes and reusable templates are being reconciled so former T-ID references no longer assert current ownership, status or acceptance. This record is dated evidence, not a task register, release acceptance or security assessment.

Limits: no application runtime, deployment, production access, clinical data or confidential records were involved. MCP content is external and may be unavailable or stale; agents must fall back to official documentation or local source without inventing APIs. Operational configuration, credentials and invocation details remain in project configuration, harness guidance and developer documentation.
