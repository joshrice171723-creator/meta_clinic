# Muse QA write API - 2026-10-03

Joshua approved the five action contracts, Ed25519 enrollment, exact owner-confirmed and live-clean build gate, typed verbatim evidence, synchronous screenshot archiving, direct verdicts without prior claims, and distinct expired-claim display. Joshua explicitly authorized merge/push to main, publication to aimetaclinic.com and the version update to 0.2.5.

## Implementation

Five separately scoped signed POST actions record claims, verdicts, defects, verified fixture selection and retest requests. Owner enrollment/revocation retains session and CSRF protections. All actions require exact build pins and idempotency keys. Fresh-nonce retries return immutable receipts; used nonces are rejected. The clock tolerance is inclusive +/-300 seconds, with eleven-minute nonce retention. A before/after build check rolls back a write if deployment occurs while screenshots archive. Synthetic authority is the server fixture registry and active tenant membership, never a name prefix. Existing dormant workflow execution remains closed.

PNG/JPEG evidence is fetched at write time into immutable QA evidence with SHA-256. Downloads use an explicit HTTPS hostname allowlist, public-address checks, DNS-pinned connections, bounded redirects/size/time and no temporary URL persistence. Download failures roll back the whole write. Old claims are sealed under their original build and appear amber as expired, separately from failed workflows, within the existing grid poll.

The API route inventory was already stale on incoming main; it is synchronized with actual routes and permits only the seven exact new /qa/api paths outside the established /api prefix. Deployment nginx and development proxy preserve the literal signed path. Coherent loose location-setup recovery edits were carried into current source without restoring an older authorization hunk. Original root dirty/untracked artifacts remain preserved.

## Focused evidence

- Native isolated PostgreSQL: 22 QA integration/service cases, 200 assertions, zero failures/errors/skips. Includes direct verdict/grid read, stale and dirty pins, owner approval, synthetic rejection across all five actions, signature tampering, replay/idempotency, screenshot archive rollback and evidence scope, enrollment/revocation, and original-pin expiry.
- Independent PostgreSQL session races passed: exactly one verdict receipt for duplicate idempotent writes and exclusive workflow claiming.
- Clinic facilities: 10 tests, 85 assertions, zero failures/errors/skips.
- API route contract: one case, 672 assertions, passed. Rails eager loading and 17 changed Ruby files' RuboCop checks passed.
- Two focused frontend files: five selected cases passed; fifteen unrelated cases skipped. Covers current revision counts and the amber expired state distinct from failed, plus clinic setup recovery controls.
- Portable compose configuration and portable delivery checks passed; scoped diff checks passed.

Failed attempts are retained in this record: the scratch concurrency runner intentionally left its independent owner fixture, so a subsequent suite collided with the single-owner constraint. Only the generated scratch database was dropped/recreated; the subsequent suite passed. Windows lacked pg_dump in PATH for automatic schema dumping; schema was generated with the matching PostgreSQL 18 container tools, and unrelated dump normalization was excluded. Frontend initial runs lacked the Playwright cached browser, then used installed Chrome; cold Vite compilation required a longer navigation allowance. A modal had hidden the grid from the new locator; closing it resolved the assertion. Damaged loose-edit punctuation was repaired and the markup assertion checks rendered text rather than a brittle exact escaped string.

## Operational boundary

Publication proof is recorded below after the authorized release. Muse's actual public key/fingerprint is not supplied, so no live key is enrolled. Its screenshot hostnames are pending; default empty allowlist rejects external screenshots. Each workflow also needs an existing server-authored synthetic fixture receipt and active membership. No owner-confirmed pin or synthetic verification is manufactured by this release. Local passing cases do not claim actual unattended Muse acceptance or all 116 workflows passing. Exact request/response/signing schemas and the local-key client are in [MUSE_API.md](../../../../ops/qa/MUSE_API.md).

Release source review found that both web image paths omitted the clean-build flag from published build.json. The first packaging attempt was stopped before image transfer/deployment. Both generation paths now emit dirty:false from the guarded clean release source; the Muse gate still requires an explicit false value.
