# QA coverage column release — 2026-10-09

Joshua authorized merging the existing column fix into main and publishing it to aimetaclinic.com. The clean main checkout was fast-forwarded to `759204195f8406cde5f29f7bb7e99a68aa350f4f` and pushed. Unrelated dirty work remained in its original checkout.

The standard Lightsail release ran with `-BuildWebOnHost -StreamImages -ReuseBuiltImages` through the shared resource queue. Docker was started locally; existing SSH access was verified without printing credentials. API and web images used the same revision. TypeScript and both Vite bundles passed. Existing dynamic-import and duplicate MIME-type warnings did not block the release.

Database restore checks and the encrypted off-host recovery round trip passed before rollout. The release completed all 26 hosted authentication, isolation, context and Sandbox checks. Public `/build.json` returned the exact released revision with `dirty: false`; `/up` returned HTTP 200. No rollback was required.

In the in-chat browser, the populated `/qa?view=coverage` table measured 1261px wide at a 1625px viewport. The final column measured approximately 72.84px before release and 280px after reload. Visual inspection confirmed readable wrapping of the first populated rows. A local screenshot is retained outside Git in the chat's visualization directory as `qa-column-hosted.jpg`.

No automated application test suite, broader responsive matrix or unrelated workflow acceptance was performed. Historical QA verdicts remain historical; this release does not close their underlying defects.
