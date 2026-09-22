# Clinic real-time invalidation

## Decision and scope

The approved first transport is same-origin Server-Sent Events (SSE), not WebSockets. The current views need server-to-browser invalidation only; protected reads and all commands remain ordinary clinic APIs. A stream event means “refresh your authorized view,” never “show or act on this event payload.” No patient, appointment, message, lab, billing, or other clinical content is sent in the stream.

Initial topics are `work_inbox`, `tracking_board`, `telehealth_queue`, and `staff_messaging`. The frontend coalesces invalidations briefly, re-fetches through existing APIs, revalidates on tab focus, and retains visible watchdog refreshes. Disconnects back off exponentially and show a freshness warning; reconnect emits a full resync invalidation. Authorization failure stops the stream and periodic protected refreshes until the workspace is reopened.

## Authorization and delivery boundary

- `GET /api/clinic/realtime/events` uses the existing clinic session, membership, actor, practice, and role checks. Stream setup must not bypass those guards.
- One dedicated PostgreSQL `LISTEN` connection is held per stream on a channel derived from the authorized practice ID; unrelated practices do not receive each other's notifications. The channel is generated from an integer, not user input. The connection is not borrowed from the Active Record pool. A server-process connection cap defaults to 20 and is configurable up to 250. Capacity planning must account for every application process and every connected user.
- Membership activity, user activity, practice, and authorization generation are rechecked at each heartbeat (20 seconds). Session changes close the stream. Each invalidation is scoped to the authorized practice.
- Publisher signals are emitted after a successful clinic mutation transaction. Notification failure is logged and does not change an already successful mutation; watchdog/focus refresh is the fallback.
- Notifications have no durable history or replay. Connect/reconnect causes a REST resync. Clients must tolerate duplicate, coalesced, reordered, or missed invalidations and always re-fetch authoritative state.
- Topic grants are intentionally broader than individual rows but reveal no row identifiers or protected content. Every resulting REST read remains server-authorized. Staff-message acknowledgements are excluded to avoid a read/refresh feedback loop.
- Validate that the outer deployment proxy/load balancer forwards streaming responses without buffering and permits the configured idle heartbeat. The repository's static Nginx serves the web shell; it is not proof of external proxy behavior.

## Workflow boundaries

SSE is suitable for the staff work inbox, tracking board, telehealth waiting/queue lifecycle, and staff messaging list/detail invalidation. Telehealth media and participant connection quality remain owned by the video provider; connection recovery or visit actions require normal server authorization. The transport does not create check-in evidence, alter clinical state, or guarantee that the view is current; timestamps/freshness indicators and explicit verification before consequential action remain necessary.

Keep ordinary reads, payment/billing state, inventory counts, imports without a visible durable status view, reminders, and one-off request/response actions on their existing APIs or bounded refresh behavior. Add a new topic only for a measured workflow requiring faster cross-user freshness and a defined mutation producer.

## Operational gates before production use

Measure concurrent streams per process/host, PostgreSQL connection headroom, connect/reconnect rate, notification-to-REST-refresh latency, fallback request volume, event-loop/thread occupancy, proxy buffering, and stream disconnect/error rates. Exercise revoked membership, disabled user, changed authorization generation, wrong practice, stale actor, missed notification, duplicate notification, reconnect, proxy timeout, PostgreSQL failover, process restart, and the per-process connection cap. Confirm users see stale/disconnected state and that protected REST reads fail closed. These repository changes do not establish external proxy behavior, clinical acceptance, or production readiness.
