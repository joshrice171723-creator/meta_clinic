# Connections and account isolation

## Local plugin

The 0.3 broker is bound to `127.0.0.1:3323`, separate from the earlier 3320
runtime so an upgrade does not terminate an existing session. Override with
`META_CLINIC_PANEL_PORT` when needed. Each stdio process receives a private
connection, with its own API cookies, selected account, clinic context, pending
reviews and history. Browser sessions have their own HttpOnly cookie. A browser
can sign in on behalf of a particular Codex connection only after opening that
connection's one-use, five-minute sign-in link. The link is component metadata;
it is not returned as model-visible text. Browser panels in the same browser
profile share that browser's selected connection. This is not per-tab isolation.

Connections expire after eight hours of inactivity and disappear on broker
restart. Persisted clinic records remain in Rails. The new 0.3.0 broker refuses
to silently reuse the old shared-session broker. The new default port lets an
older 3320 session continue; start the new build on 3323 for fresh connections.
Do not terminate unrelated application services.

### Connect the local plugin to the hosted synthetic clinic

Set `META_CLINIC_CONNECTION_MODE=hosted` in the plugin process environment.
Remove local `META_CLINIC_API_URL` and `META_CLINIC_WEB_URL` overrides, or set both
to exactly `https://aimetaclinic.com`. No other remote origin is allowed. Start
the broker without the local Rails runtime helper, which deliberately configures
the isolated local database. Use the browser sign-in page or the Demo workspace.
Passwords remain out of chat. No database access, source access or deployment
permission is granted through this connection.

The hosted mode uses the existing HTTPS session and CSRF APIs. It does not
bypass availability, membership, site, patient or operation authorization. A
hosted permission denial remains a denial. Browser sessions on the website and
connector remain separate: sign into the same authorized clinic account to
compare the same records. Opening the full website does not transfer cookies.

## Deployable remote connector

`npm run serve:remote` starts a separate loopback HTTP service. For public access,
use the existing deployment process to place it behind a TLS reverse proxy
preserving the exact configured Host. This source does not deploy or open a
tunnel. Any OpenAI client mTLS requirements must be configured at that boundary.

Required operator configuration (values are supplied outside Git):

| Variable | Required value |
| --- | --- |
| `META_CLINIC_CONNECTOR_ORIGIN` | Exact approved HTTPS connector origin |
| `META_CLINIC_CONNECTOR_PORT` | Private listener port; default 3330 |
| `META_CLINIC_TRUSTED_CLIENT_IP_HEADER` | Required public proxy header (for example `x-real-ip`) overwritten with the connecting client's single IP address; never trust a client-supplied or appended value |
| `META_CLINIC_CONNECTION_MODE` | `hosted` for the public connector |
| `META_CLINIC_CONNECTOR_STORE` | Absolute private SQLite file path outside the repository |
| `META_CLINIC_CONNECTOR_KEY` | Secret-manager supplied base64 32-byte AES key |
| `META_CLINIC_OAUTH_CLIENTS` | JSON array of operator-registered `client_id`, display `name`, and exact `redirect_uris` |
| `META_CLINIC_EVENTS_ENABLED` | `1` only when event delivery is configured and authorized |
| `META_CLINIC_EVENT_CALLBACK_ORIGINS` | Comma-separated exact HTTPS callback origins verified from host registration |

The storage directory must be accessible only to the connector service account.
On Windows, configure its NTFS ACL explicitly; Unix file modes do not establish
Windows access isolation. Keep encryption-key recovery separately controlled.
Changing the key without migrating the encrypted store makes saved grants
unreadable. No key, token or actual connection configuration belongs in Git.

For a fully local synthetic rehearsal only, set
`META_CLINIC_REMOTE_DEVELOPMENT=1`, use a loopback HTTP connector origin and
`META_CLINIC_CONNECTION_MODE=local`. This exception never applies to a public
connector. Use an isolated store and disposable operator-created key.

### Authorization contract

- Discovery: `/.well-known/oauth-protected-resource` and
  `/.well-known/oauth-authorization-server`.
- Resource audience: the configured origin followed by `/mcp`.
- Authorization Code with S256 PKCE. Implicit grants are unsupported.
- Predefined public clients, exact registered callbacks, state and issuer in
  callbacks; no unrestricted dynamic registration or callback fetching.
- Browser credentials are sent to the existing Rails sign-in over HTTPS. The
  connector issues its own opaque, scoped tokens after explicit consent.
- Fifteen-minute access tokens; rotating refresh tokens and connector sessions
  bounded by twelve hours. Rails' own session expiry can end access earlier.
- Refresh-token reuse revokes its connection. Scope reduction also constrains
  previously issued access tokens. Revocation is immediate locally even if the
  backend logout request fails.
- Protected requests validate resource, expiry, scopes and connection status.
  Clinic reads and writes then revalidate backend membership and permissions.
- Account labels use an opaque persistent profile mapping. Emails are display
  metadata, not authentication or account-linking proof.
- Remote account-linked connections cannot switch into a shared demo identity.
  Use a separate local demo connection, optionally against the hosted backend.

The connector store contains encrypted sessions, hashed-token lookup records,
short-lived authorization transactions and event subscriptions. It does not
replicate clinical records. Detailed data can reach an authorized MCP App through
tool metadata; that separation is not a claim of HIPAA de-identification.

### Sign in with ChatGPT

Commercial enrollment and client registration are not present or assumed. This
optional provider would establish a verified identity for linking to a clinic
account; it would not replace Meta Clinic permissions or the outer connector
grant. The current working authorization path is ordinary Meta Clinic sign-in.

## Acceptance boundaries

Source implementation is not deployment or directory approval. Record actual
local, hosted-backend, native-host and public-connector evidence separately in
`DELIVERY.md`. A public connector still needs an approved host/TLS deployment,
registered clients/callbacks, secret configuration, host connection and an actual
multi-account walkthrough before customer use is claimed.

## Connector audit and usage limits

Every remote tool invocation and Events protocol action is recorded in the encrypted connector store, with its OAuth client, connection, freshly authenticated backend account, clinic, location, operation, outcome and duration. Arguments, patient fields, passwords and tokens are excluded. Requests rejected before a tool invocation are not attributed clinic audit entries.

The ring holds at most 2,000 records for up to 30 days. Clinic counters hold up to 31 UTC-day buckets for at most 1,000 clinics, namespaced by backend origin. `META_CLINIC_TOOL_CALLS_PER_CLINIC_PER_DAY` defaults to `0` (disabled); a positive configured limit rejects additional admitted tool calls for that clinic until the next UTC day. Events protocol calls are audited but do not consume this tool allowance. This is connector call accounting, not ChatGPT token metering or a billing ledger.

Audit admission storage failures block dispatch. A failure recording the final audit or saving the refreshed session preserves the returned clinic result and adds a warning. Session persistence uses a durable recovery marker before dispatch; a failed final save or interrupted process requires a fresh account connection instead of reopening stale cookies. An uncertain clinic outcome must be inspected, never automatically replayed.
