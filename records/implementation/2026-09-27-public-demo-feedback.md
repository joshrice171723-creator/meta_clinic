# Public demo feedback — 2026-09-27

## Delivered

The sandbox header now opens a short feedback form. Submissions require the existing encrypted demo-visitor cookie and an active sandbox run, are limited to 2,000 characters in both Rails and PostgreSQL, and are stored separately from clinic and patient records. The form asks visitors not to include patient, health, or account details.

The owner command center exposes the newest feedback first with pagination. Its existing platform-owner authorization protects the response; submitted text is rendered as plain text.

## Verification

- Applied additive migration `20260927233500` to the local synthetic `apply_development` database; generated `apps/api/db/structure.sql` includes the foreign key, chronological index, and message-length constraint.
- Changed-file RuboCop, Rails Zeitwerk check, demo feedback route check, web TypeScript check, Prettier check, and scoped diff checks passed.
- No tests or browser submission walkthrough ran. Browser acceptance, hosted behavior, and release remain unverified.
- This feature is outside the scored MC-01–MC-15 rows; no Build percentage changed.
