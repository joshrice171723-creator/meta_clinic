# MC13 migration version correction — 2026-09-30

Source base: `667338bdc74a984e27d9611732b9e5d04ffb1d3f` (current MC13 app repairs retained).

MC08 `d9082a1f63b39b963be63d5a277c320267339a20` owns versions `20260930230000` (price provenance) and `20260930230100` (date/context). MC13's undeployed migration previously also claimed `20260930230000`. Combining those filenames would give Rails duplicate migration versions.

Rename only MC13 to [20260930230200_allow_unknown_workforce_policy_minutes.rb](../../apps/api/db/migrate/20260930230200_allow_unknown_workforce_policy_minutes.rb). This version is unused in those source heads, the published partial candidate `1fb61df393fb42e8987bfb459704af39c300c58e`, and Relay's inspected local migration inventory. No explicit old-version references were found in MC13 source/records. Migration class, three nullability operations and irreversible downgrade remain byte-for-byte unchanged; file SHA256 before/after is `786d0033aea10624df9bfefb19db0f7813e8411a86e44cee8938bd199c55c34c` (Windows checkout bytes).

**Source-only correction.** No migration, database access, test, build or lint was run after Josh's21:08UTC source-first instruction. `db/structure.sql` was not edited or represented as generated. MC13 schema generation must use the new version after the complete combined source manifest is frozen; generated schema and runtime verification remain pending. Relay owns application integration. No main change, PR or deployment.
