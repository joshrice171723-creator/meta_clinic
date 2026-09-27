# MC-14/15 reminder delivery inventory — 2026-09-27

Operations now reads a clinic-scoped reminder state report behind `reminders.read`. It shows current delivered, failed and delivery-unknown counts from persisted reminder records, their latest update and a link to the existing attention queue. The response contains no patient, destination or message content. The inventory distinguishes these local states from provider-confirmed delivery.

Ruby syntax, scoped RuboCop, route resolution, frontend formatting, TypeScript and scoped diff checks passed. A connected authorized/denied/reload walkthrough remains pending; no tests ran. This source view does not establish vendor delivery, external readiness or a complete reporting catalog.
