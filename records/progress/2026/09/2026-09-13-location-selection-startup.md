# Location selection no longer waits for dashboard loading — 2026-09-13

## Outcome and boundary

A signed-in clinic user with more than one authorized location receives the location picker as soon as the authorized context loads. The full clinic overview loads only after that location is chosen. This is a local browser-flow correction; authorization, session checks, server-selected locations, data model, and hosted behavior are unchanged.

## Failure-first review

- **Failure hypothesis:** the picker is coupled to the full `/api/clinic` overview. A slow or unavailable overview therefore hides the required location decision until the browser's 30-second read deadline expires.
- **Detection and prevention:** the visible signal is the exact read-timeout message, “The request timed out. Reconnect and try again.” Context remains the server-authorized source of locations. The browser now defers the unrelated overview request while a location decision is required.
- **Disproof and recovery:** the focused clinic-shell check verifies that no overview loads before context, that a single-location context may load its overview, and that a multi-location context only enables the overview after an explicit selection. A failed context still presents its retry state; a failed post-selection overview presents its own retry state without weakening the location gate.
- **Exit evidence:** implementation is complete locally. The checkout's web dependency executable was absent; an exact locked dependency restore was attempted but Windows reported a locked Rolldown binary. Focused frontend test/build evidence remains pending that local runtime recovery. No browser, hosted, or clinical acceptance is claimed.
