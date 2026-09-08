# Boundaries of this property suite

Read coverage.md and the actual results JSON for executed properties. A declared extension or a model validation test does not establish a complete workflow. No workflow has full browser end-to-end coverage from this package.

| Area | Remaining verification |
|---|---|
| Creation forms | Individual required markers, radio groups, error focus, custom inputs and save recovery need browser/component checks. Shared Field rendering alone cannot establish every screen. |
| Clinic and access | Model and service contracts do not establish deployment provisioning, email invitation delivery, browser login/session navigation or every tenant boundary. |
| Membership and online billing | Explicit gateway simulations and the application's local payment fixture exercise application state only. Live Stripe Connect, hosted checkout, signed real-provider webhooks, settlement and refunds remain unverified. |
| Scheduling | Selected request, confirmation, reassignment, stale-edit and transition guards do not cover all availability, room/provider conflict, recurrence or timezone combinations. |
| Clinical records | Selected note, lab, patient, observation and document-release invariants do not cover every clinical history subtype, instruction publication, exported record or object download. |
| Scribe | Consent policy does not verify recording, upload, transcription, provider output, review or export. |
| Inventory | Receipt, transfer, adjustment, count, recall, return and reconciliation properties cover named state/accounting contracts. Every purchasing approval, custody path, recall disposition and scanner device flow remains broader than these checks. |
| Workforce | Models and selected onboarding, settings and timecard guards do not establish complete shift publishing, conflicts, swaps, badge/kiosk hardware, punch correction or payroll export. |
| Reminders and messages | Required-data and selected terminal/read/attachment guards do not establish sending, provider delivery, inbound response handling, retries or the full staff conversation UI. No external messages are sent. |
| Guidance and telehealth | Documented separate-product/development-lane workflows require their own runtime and verification. This package does not alter those lanes. |

Existing repository tests are not counted merely because their files exist. Failed properties remain failures; harness interruptions are distinguished from product findings. A confirmed application crash can prevent a later invariant from being evaluated, which is reported explicitly.
