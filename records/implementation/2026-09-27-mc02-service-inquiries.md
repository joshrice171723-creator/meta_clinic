# MC-02 service inquiries — 2026-09-27

## Built

- The public clinic services page now accepts a consented inquiry for a published visible service. A practice-bound request key prevents duplicate creation on retry, and the service rechecks publication under a database lock.
- Contact details are encrypted at rest. The clinic inbox is limited to staff with `subscriptions.review`, returns at most 100 recent inquiries, and records access in the audit log.
- Staff can advance an inquiry from new to contacted to closed. The update requires the displayed record version, is practice-scoped, and records the committed transition.

## Checks and remaining work

- The migration applied to the local synthetic development database. Ruby syntax, scoped RuboCop, Rails eager loading, TypeScript, and changed-file formatting passed. No tests ran.
- A browser journey for public submission, duplicate retry, staff access/denial, transition and reload remains open. This does not send messages, book appointments, or create patients. Clinic-specific branding and account/payment recovery remain separate MC-02 work.
