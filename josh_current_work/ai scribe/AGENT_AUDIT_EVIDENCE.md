# AI Scribe audit evidence

Date: 2026-09-03

## Evidence completed

- Migration version collision was detected with shared untracked migrations `20260903001210` and `20260903001220`; the AI Scribe migration was moved to `20260903001230`.
- Ruby syntax checks passed for all 14 scribe models, services, controller/serializer files, and the migration (`ruby -c`, 14 files, all `Syntax OK`).
- The committed backend files are present in `bf81eb3`; `git show --name-only HEAD` confirms the scribe controllers, models, services, serializer, and migration are included.
- The protected unrelated `apps/api/app/queries/clinic/billing/patient_ledger.rb` remained unstaged.

## Not yet verified

- Rails boot, Zeitwerk, migration execution, route generation, database constraints, and integration tests were not completed. `ruby bin/rails zeitwerk:check` produced no output after three 30-second waits in the shared environment and was stopped; the repository has no usable `bin/postgres` helper on this Windows checkout.
- Consent denial/revocation, cross-tenant ID substitution, approval blocking, revision invalidation, idempotent export, and deletion scrub need live Rails integration tests after the mixed shared route/permission changes are coordinated.
- No browser/UI evidence exists yet. The client route and review workspace still need implementation and a desktop/narrow live smoke check.
- No production provider, recording path, EHR adapter, PHI, credentials, or real patient data was used.

## Required next evidence

1. Stage only the scribe hunks in the mixed Ability, Practice, and routes files and add scribe capability/type wiring.
2. Add focused Rails integration coverage for consent, authorization/tenant isolation, provenance/revision/approval/export, and deletion.
3. Add the encounter-chart link and review workspace, then run the focused web test/build and a live browser smoke test.
4. Re-run migration/route/loadability checks when the shared environment is responsive; treat the result as separate from file-level syntax evidence.
