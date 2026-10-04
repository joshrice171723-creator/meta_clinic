# Plugin platform decision

Reviewed October 4, 2026. Source work begins at `292a16f0`; the existing plugin,
Rails services, database, visual calendar and MCP App remain the foundation.

## Architecture

Use one plugin package containing skills, authenticated MCP tools, an MCP App,
and supported navigation extensions. **ChatGPT is the primary product host**,
per the owner's October 4 clarification. Codex builds and previews the source;
the existing local Codex package is development compatibility. Preserve the
clinic website, hosting, database, session protections, permissions and records.
The assistant embedded inside Meta Clinic is phase 2, reusing the tool catalog;
do not build it during this phase. Sites is out of scope.

### Identity, data path and commercial boundary

Meta Clinic credentials authorize clinic resources; ChatGPT access is a separate
host relationship. OAuth account linking does not turn consumer ChatGPT into a
covered healthcare channel. Tool content/structured results can reach the model;
component metadata reaches the host UI even when hidden from the model. Neither
is an automatic anonymization or contractual boundary.

No executed BAA, eligible workspace or approved API organization was inspected.
The claimed one-BAA subcontractor arrangement remains a proposed commercial
model, not an implemented contract. The current integration uses synthetic data.
The connector makes no OpenAI inference calls: it cannot meter or charge the
ChatGPT host's model tokens through Meta Clinic's API account. Connector usage
and any future Meta Clinic-funded API inference must be accounted separately.

OpenAI's [current eligibility guidance](https://help.openai.com/en/articles/20001069-hipaa-eligible-products-and-functionality),
reviewed October 4, lists covered ChatGPT products and requires the eligible
workspace and enabled functionality. It separately lists Sites and event-triggered
scheduled tasks as outside BAA coverage. Keep Events development synthetic;
public clinical activation requires evaluation of the actual host, features,
agreements and data path. The guidance now describes API Modified Retention;
do not assume a zero-retention setting or API agreement covers ChatGPT.

The default local runtime remains loopback-only. An explicit hosted connection
mode permits only `https://aimetaclinic.com`. The deployable connector adds
Authorization Code with S256 PKCE, registered clients and exact redirects,
resource-bound scoped tokens, isolated backend sessions and encrypted connector
storage. It never exposes database or deployment credentials to customers.
Deploying that connector is a separate action requiring authorization.

Sign in with ChatGPT is optional: the current commercial offering requires
partner enrollment. Ordinary Meta Clinic sign-in must work without it. If later
enabled, link verified issuer/client/subject to an existing authenticated clinic
account, retain enterprise sign-in rules, and keep the inner identity flow
separate from outer connector authorization. No implicit grant, email-hint
authentication, assumed enrollment or fabricated OpenAI credentials.

## Host support and acceptance

| Surface | Documented support | Implementation/acceptance boundary |
| --- | --- | --- |
| Package/tools | Universal plugin directory for ChatGPT and Codex | Existing local package; remote endpoint requires deployment and connection registration |
| MCP App | Shared MCP Apps bridge and registered UI resource | Existing calendar/dashboard UI; browser evidence does not prove host rendering |
| Navigation/panel | Global and thread extension entrypoints | Existing declarations; verify actual host display capability |
| Per-account connection | OAuth 2.1, resource metadata, S256 PKCE, predefined clients supported | Implement account isolation and backend reauthorization; verify negative cross-account cases |
| MCP Events | Protocol `2026-07-28`, webhook delivery; Work web/cloud and dots | Separate protocol adapter; verify actual supported host subscription before claiming delivery |
| Sign in with ChatGPT | Limited commercial trial; separate identity and connector flows | Enrollment unavailable/unverified; do not block ordinary sign-in |
| Sites | Workspace-private connected Sites with individual visitor grants | Out of scope; no hosting migration or separate clinic database |
| File viewers | Optional host extension | Deferred until an existing clinic file journey justifies one |
| Submission | ZIP upload, automated checks, review, approval, chosen publication | Prepare only; no submission/publication authorized |

## Current official references

- [Architecture](https://developers.openai.com/plugins/concepts/plugins)
- [Packaging](https://developers.openai.com/plugins/build/plugins)
- [MCP App UI](https://developers.openai.com/plugins/build/chatgpt-ui)
- [Extensions](https://developers.openai.com/plugins/build/extensions)
- [Authentication](https://developers.openai.com/plugins/build/auth)
- [MCP Events](https://developers.openai.com/plugins/build/mcp-events)
- [Plugin identity](https://developers.openai.com/siwc/chatgpt-plugin)
- [Sites](https://learn.chatgpt.com/docs/sites)
- [Submission](https://developers.openai.com/plugins/deploy/submission)

Installed foundations: MCP SDK 1.29.0, MCP Apps 1.7.5, OpenAI Extensions 0.1.0,
React 19.2.8, MUI 9.4.0. MCP Events protocol support must be explicit; installing
these packages alone does not prove MCP 2.0 discovery or event delivery.

## Implementation ownership and finish line

- Coordinator: remote OAuth/HTTP transport, registration, integration, coverage,
  final checks, package/tutorial and Git synchronization.
- Connection worker: isolated service state, local browser pairing, hosted API
  allowlist and private session export/import.
- Demo worker: existing demo API lifecycle and interactive demo panel.
- Events worker: authorized persisted event feed and webhook subscriptions.

All writers finish before the consolidated verification pass. Verify ordinary
sign-in, account separation, token resource/scope/PKCE enforcement, expiry and
revocation, reviewed persistence, demo ownership and supported event lifecycle.
Record unavailable hosted deployment/registration separately. No new clinical
interpretation or data standard is introduced by the transport changes.
