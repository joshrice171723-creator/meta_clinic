# MC-08 issued estimate contact snapshot

**Date:** 2026-09-27
**Scope:** Include saved clinic contact details on the printable Good Faith Estimate (GFE) without allowing later site edits to change an issued copy.

Issuing a GFE now snapshots the practice name and available contact data from the patient's primary site, which is constrained to the same practice: site name, formatted address, phone, and contact email. The API returns that snapshot and the print sheet uses it. A forward-only migration defaults older estimate rows to an empty object; their historical contact values are not reconstructed from current site data. General estimates with no patient still show the saved practice name and contain no site contact block.

**Database target:** local synthetic development database `apply_development` (`127.0.0.1:54329`), per `apps/api/config/database.yml`; no external database or real records.

**Checks and limit:** Ruby syntax, scoped RuboCop, frontend TypeScript, changed-file Prettier, vault verification, and `git diff --check` passed. One `bundle exec rails db:migrate` attempt could not connect to the named development database because the configured database password was unavailable to the command. It was not retried; `structure.sql` was not generated or verified. No tests or browser journey were run. Sending a document, recording delivery, and external payment remain separate workflows.

**2026-09-27 follow-up:** The earlier command bypassed the documented local PostgreSQL wrapper. `ruby bin/postgres exec bin/rails db:migrate` successfully applied migration `20260927195400` to the local synthetic development database. The generated structure diff contains the JSONB column, object constraint, and migration version. Credentials were supplied privately by the existing wrapper. This resolves the migration blocker; browser printing and issue/reload behavior remain unverified.
