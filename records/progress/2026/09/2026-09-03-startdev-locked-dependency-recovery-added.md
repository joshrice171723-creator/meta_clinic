---
type: progress-record
status: archived
event_date: 2026-09-03
source: APPlyVault/03 Execution/Progress Log.md
---

# 2026-09-03 — Startdev locked-dependency recovery added

**Request and implementation:** D-057 now makes `$startdev` pause on a Bundler missing-locked-gem failure, identify the exact dependency/version, configured registry/checksum provenance and application use, then offer a frozen install before resuming the managed refresh. The direct helper remains non-installing. The first observed trigger was `csv 3.3.6`, declared from `https://rubygems.org/` with its lockfile SHA-256 and used because Ruby 3.4 no longer provides CSV as a loadable default gem; APPly uses it for its synthetic bulk-seed CSV loader/generator.

**Limits and evidence:** a registry/checksum match is lockfile provenance, not independent security acceptance. The recovery uses `BUNDLE_FROZEN=true bundle install`, which may download other missing locked gems and requires explicit user confirmation. The observed `csv` install normalized only Bundler's own `4.0.15` checksum entry; `bundle check` passed and `csv 3.3.6` loaded, so D-057 now treats that exact metadata-only diff as expected. Any dependency-resolution change remains a stop condition. The failed refresh did not replant the local development database or start Rails/Vite.
