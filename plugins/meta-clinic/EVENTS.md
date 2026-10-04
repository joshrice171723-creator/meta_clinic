# Meta Clinic MCP Events

This optional remote connector implements the webhook subset documented in
[OpenAI MCP Events](https://developers.openai.com/plugins/build/mcp-events),
reviewed October 4, 2026. It requires MCP 2.0 version `2026-07-28` and Work/Cloud
or a compatible dot. Installing the local stdio plugin alone does not activate
ChatGPT subscriptions or deploy this connector.

The selected host is ChatGPT. Acceptance uses independently synthetic records
only. OpenAI's current
[HIPAA eligible functionality guidance](https://help.openai.com/en/articles/20001069-hipaa-eligible-products-and-functionality)
excludes event-triggered scheduled tasks from Business Associate Agreement (BAA)
coverage and says not to use them to transmit, store or process protected health
information. Metadata filtering does not establish PHI compliance. Do not enable
this connector for real clinical records or claim healthcare acceptance from
the synthetic checks.

## Operator configuration

Enable outbound delivery only with `META_CLINIC_EVENTS_ENABLED=1`. Configure
`allowedCallbackOrigins` from exact operator supplied HTTPS origins, including
any nondefault port. There is no wildcard, guessed OpenAI callback domain or
fallback allowlist. The endpoint rejects credentials, IP literal hosts,
fragments, non-HTTPS URLs and origins absent from that list. Every connection
resolves DNS, denies non-public addresses, pins a validated address while keeping
the hostname for TLS, and refuses redirects. Set the allowed origins from the
actual callback destinations supplied by the authorized integration.

Construct `createEventService({ storage, resolveConnection, allowedCallbackOrigins })`
from `server/events.mjs`. `storage` must provide durable encrypted synchronous
`get(kind,key)`, `set(kind,key,value)`, `delete(kind,key)` and `list(kind)` returning
`[{key,value}]`. The existing encrypted connector store supplies these methods.
Its backup, encryption key recovery and operator access remain operational
requirements. Subscription state contains callback signing keys and private
backend cursors; never expose that state in tool results, logs or notes.

`resolveConnection(connectionId)` returns the account's service or null. It must
reject a disconnected connection, revoked OAuth consent, missing `clinic:events`
scope or expired connection. Every incoming event method also requires the
`clinic:events` OAuth scope in the transport. Pass its verified scope array to
`handle(message,{connectionId,scopes})`. `handle` returns the JSON-RPC envelope.
Run `tick()` from one connector process on a bounded timer; it serializes ticks
and each subscription. Multiple processes sharing the store are unsupported
without a distributed delivery lease. A missing connection stops and removes
its subscriptions. Rails rechecks account, practice, site and resource access
before each callback attempt, including retries.

The authenticated MCP endpoint routes `events/list`, `events/subscribe` and
`events/unsubscribe` to this service. When configured, `server/discover` must
include `resultType: "complete"`, `supportedVersions: ["2026-07-28"]` and
`capabilities.events: {}` beside the transport's other actual capabilities.
This module does not implement the transport or claim legacy MCP initialization
is equivalent to MCP 2.0 discovery.

## Supported subscriptions and permissions

Every event takes exactly `{ "resource_id": "<existing-record-id>" }`.
Discovery filters names using the connected account's current backend
permissions. Subscription creation and every subsequent feed read additionally
check the actual tenant, patient, resource and site. Change events monitor future
changes to a specific existing record. The reminder event watches scheduled
reminders for one existing appointment; it does not discover new appointments.
Subscriptions are explicit user requests. Installing or signing in does not
subscribe an account or start reminders.

| Event | Persisted source | Required current access |
| --- | --- | --- |
| `clinic.appointment.changed` | `Clinic::Appointment` PaperTrail metadata | `patients.read` for the appointment's patient; `appointments.read` for its site and actual appointment |
| `clinic.appointment.reminder_due` | Existing `Clinic::PatientReminder.scheduled_at`, reminder state, and `PatientReminderOutbox.available_at` for the appointment | The appointment's patient/site/resource read permissions above, plus current practice `reminders.read` |
| `clinic.result.changed` | `Clinic::Care::LabReport` and its `LabReportVersion` PaperTrail metadata | `patients.read` for the report's patient; `notes.read` for the report's site, matching the existing lab-report read boundary |
| `clinic.task.changed` | `Clinic::ClinicalTask` PaperTrail metadata | `patients.read` for the task's patient; `encounters.write` for the task's site, matching the operational clinical-task worklist boundary |

The webhook data is exactly `{ resource_id, change }`, where `change` is the
persisted model-version event (`create`, `update`, `destroy` or `touch`), or `due`
for a reminder occurrence. For a change event, an event
ID derives from the immutable practice/version ID; the occurrence time comes
from persisted history. No patient name or ID, clinical result, status value,
note text, actor, request correlation, changed-field names or user instructions
are delivered. The generic event name intentionally does not promise that every
change is a status transition. Use an independently authorized read tool to
inspect the current record.

## Appointment reminder timing

`clinic.appointment.reminder_due` uses the appointment ID as `resource_id`. It
requires an existing appointment reminder with category `appointment`, source
`Clinic::Appointment`, matching practice/patient/appointment, state `scheduled`
or `queued`, no cancellation, and a pending matching outbox. Both persisted
`scheduled_at` and outbox `available_at` must have reached the current backend
business time. The appointment must still be scheduled/confirmed and in the
future, and the reminder must not be expired. The existing
`Clinic::Reminders::Policy.evaluate` must currently allow it, including endpoint
verification, appointment reminder consent, opt-out, quiet hours and source
eligibility. This event never changes reminder state, claims the outbox, invokes
dispatch, or sends patient SMS/email/portal messages.

The subscription captures backend business time for its initial due boundary;
the signed cursor's 24-hour expiration uses wall-clock time. Reminders scheduled
before that due boundary are not replayed. No offset such as "24 hours before"
is invented by the connector: authorized backend reminder creation/batch
scheduling owns that choice. Appointment reconciliation already moves or cancels
the persisted reminder when the appointment changes.

The event occurrence time is the reminder's persisted `scheduled_at`; its stable
ID combines practice, reminder ID and that scheduled time in microseconds. The
payload remains exactly `{ resource_id: "<appointment-id>", change: "due" }`.
No reminder content, channel, destination, patient identifier or appointment
time is included in `data`. Polling may observe eligibility after the due time;
this is not a guaranteed delivery deadline.

Before retrying a queued reminder callback, the connector sends its private
`pending_event_id` to the same authenticated feed. Rails returns
`pending_event_eligible` after inspecting the bounded candidate window and
current policy, independently of the first page of events. A false or missing
answer discards the queued callback without advancing its acknowledged cursor.
Cancelled, moved, paused, expired, dispatched or newly policy-denied occurrences
therefore stop retrying. A later eligible occurrence can be read again. A request
already received by the callback cannot be recalled.

The backend routes inside the existing `clinic` namespace are:

```ruby
get "plugin_events/catalog", to: "plugin_events#catalog"
get "plugin_events", to: "plugin_events#index"
```

`Clinic::PluginEventsController` retains the normal session, membership, clinic,
expected actor/practice/site, deployment and setup guards. Feed reads record an
ordinary `plugin_events.read` audit event. Change events read existing append-only
`clinic_model_versions`; due events read existing reminder/outbox state and
current policy. Neither path versions connector bookkeeping.
It never reads the unrelated QA task event stream.

## Lifecycle and delivery

Subscription identity is deterministic from the authenticated connection and
clinic actor/practice, canonical arguments, event name and callback URL. Refresh
keeps that identity and pending delivery. Default and maximum granted lifetime
is one hour; the minimum is one minute to bound refresh traffic. A requested
nonexpiring subscription receives a finite expiration. Expired subscriptions
stop delivering and are removed. Limits are 20 subscriptions per connection and
200 for the process store.

Before activation, a fresh random challenge is sent in a signed verification
request. The callback must return 2xx and the same challenge, compared in constant
time. Verification is cached for that subscription and signing key for five
minutes; replacing the key requires verification again. During key rotation,
requests carry signatures for the current and immediately previous key for five
minutes. Signatures follow
[Standard Webhooks 1.0](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md):
HMAC-SHA256 over `webhook-id.webhook-timestamp.exact-body-bytes`, serialized as
`v1,<base64>`, with the `whsec_` base64 key decoded to 24–64 bytes. The exact
serialized bytes are posted once per attempt with the required four headers and
JSON content type.

Each tick attempts at most one event per subscription. Persist the event before
delivery; retain its event ID and exact body across restarts and retries. Each
attempt has a fresh signing timestamp/signature and a ten second DNS/HTTP
deadline. A 2xx acknowledges receipt and advances the private backend cursor.
Network errors, HTTP 429 and HTTP 5xx retry after 5 seconds, 30 seconds, 2 minutes
and 10 minutes. HTTP 410 removes the subscription. HTTP 413 and other permanent
HTTP errors stop it, as does exhausting retries. Unsubscribe cancels in-flight
HTTP work and eagerly deletes the matching owned subscription; repeated
unsubscribe returns `{}`. A request already received by the callback cannot be
recalled. A process crash after receipt and before storing its acknowledgement
can cause a duplicate event; the stable event ID lets the receiver deduplicate.

## Explicit limits

- Protocol responses and deliveries return `cursor: null`: client replay is
  unsupported. A non-null requested replay cursor returns Unsupported. Refresh
  of an active subscription preserves its private delivery position, but a new
  subscription after expiry or a stopped delivery starts with future changes.
- Backend history uses a signed, actor/practice/resource-bound cursor with a
  bootstrap occurrence time and at most 256 acknowledged occurrence IDs. Each read
  scans unseen resource changes in pages of 25. Tracking IDs instead of assuming
  monotonic commit order prevents later commits with lower IDs being skipped.
  The private cursor expires 24 hours after initial subscription. Capacity or
  expiration stops delivery (`feed_limit`/`feed_expired`) rather than skipping
  history. A subsequent subscribe/refresh begins a fresh future stream and
  returns `truncated: true` when it replaces retained expired/stopped state or
  an exhausted/expired backend cursor. Pending events in the old interval are
  not replayed. Inspect the source resource with its authorized read tool when
  `truncated` is returned. A subscription already removed after expiration or
  revocation has no retained interval to report and receives `truncated: false`.
- Reminder reads enumerate at most 256 candidate scheduled/queued reminders for
  the one appointment and return at most 25 eligible occurrences per page. An
  oversized candidate window returns `feed_limit` rather than silently omitting
  an occurrence or declaring a pending retry eligible. Reminder eligibility is
  a current condition, not immutable delivery history. If the normal backend
  dispatcher advances a reminder before the connector observes it, no due event
  is emitted. Paused, cancelled, failed and completed reminders are excluded.
  A repeated eligible occurrence after an unacknowledged failed attempt retains
  its stable event ID for receiver deduplication.
- Changes whose audit occurrence preceded initial subscription are excluded.
  Mutations bypassing PaperTrail and fields with no persisted version are not
  represented. This feed does not establish complete audit coverage.
- No site-wide schedule events, new-result/new-task queue discovery, polling or
  streaming protocol modes, `gap` or `terminated` control notifications are
  advertised. Complete cross-resource monitoring needs a separately designed
  persisted and authorized event source.
- No callback was contacted during implementation. No live subscription,
  delivery, restart, revocation or ChatGPT acceptance has been demonstrated.
  Source implementation is separate from deployment and integration acceptance.
