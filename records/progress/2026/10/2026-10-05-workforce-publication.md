# Workforce publication — 2026-10-05

## Authorization and scope

Joshua explicitly requested committing, merging, pushing to Git and publishing to aimetaclinic. The reviewed candidate was workforce head `506ae3603ee7abc5b2570086be1391e0d0183512`, based on then-current main/live `013077ac5037c5a2cfa5427e101c3164a17102a4`. Its nineteen source commits and local evidence are described in [the development record](2026-10-05-workforce-development.md).

The clean dedicated main checkout fast-forwarded to current main and then the exact workforce candidate. Main was pushed without force. Unrelated dirty primary-checkout work and unfinished development/QA branches were excluded and preserved. Both owning chats reported stopped state; their two heartbeats and the separate scheduled publisher were already paused and remained paused.

## Release and verification

The existing `Global\MetaClinicReleaseRunner` mutex covered fetch, integration, push, packaging, recovery, deployment and immediate verification. The standard `ops/lightsail/release.ps1` ran through the shared heavy-command queue with `-BuildWebOnHost -StreamImages -ReuseBuiltImages`. Streaming avoided a large local image archive; no alternate publisher or gate bypass was used.

- Existing owner SSH access and DNS `174.129.142.201` were verified before mutation. Credential contents were never read or copied into this record.
- Locked web installation, TypeScript, both Vite bundles, matched revision-labelled API/web images and Nginx syntax checks passed on the exact candidate. Existing marketing import and duplicate MIME warnings were nonfatal.
- Both PostgreSQL backups passed scratch restoration. The encrypted off-host recovery round trip passed before deployment. The protected archive remains in the owner's existing Secure Files directory and host recovery remains under `/opt/meta-clinic/backups/release-506ae3603ee7abc5b2570086be1391e0d0183512`.
- The standard migration/privilege/setup steps completed. API, web, worker, guided-demo and PostgreSQL containers became healthy. No rollback was required.
- Hosted verification passed HTTPS login, API health, staging login/PIN configuration, anonymous and missing-CSRF denial, password login, authenticated context, five concurrent context reads, logout denial, isolated demo entry, Omni organization/location persistence, and two-visitor Sandbox/location-switch persistence.
- Fresh public checks at approximately 18:04 UTC returned build revision `506ae3603ee7abc5b2570086be1391e0d0183512`, version `0.2.9`, `dirty: false`. `/up`, `/login`, `/demo`, and `/clinic/updates` each returned HTTP 200. The host current-revision file matched. Clean local main and fetched origin/main were identical.

## Evidence limits and coordination

[GitHub CI run 37352235473](https://github.com/joshrice171723-creator/meta_clinic/actions/runs/37352235473) failed before its scope/docs jobs started. GitHub's annotation identified failed account payments or the spending limit; the application jobs were skipped. This is unavailable CI, not a test pass. No application test suite was manually run and no billing setting changed.

Independent hosted workforce QA is not established by the release checks. The development record retains the CSV completed-download gap, stalled local draft-discard dialog and paused post-repair invitation replay check. The already-revoked synthetic activation-link exposure remains an open incident-assessment boundary; no affected panel was reopened for this release.

The observed deployed revision and scoped follow-up were sent to the existing Muse monitor under the publish skill. No monitor or engineering/QA schedule was resumed. The release record and vault index are saved separately on the workforce branch so main and the deployed application remain at the exact verified release commit.
