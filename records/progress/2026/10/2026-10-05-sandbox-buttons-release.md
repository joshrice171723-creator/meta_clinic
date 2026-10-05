# Sandbox marketing buttons released — 2026-10-05

Joshua authorized publishing the completed “Try Our Sandbox” button changes to aimetaclinic.com. PR #76 was merged, and clean main at `252cb38ddafe3c23e85824db8a10259b6cbd6d24` was deployed through the canonical Lightsail release wrapper with `-BuildWebOnHost -StreamImages -ReuseBuiltImages` under the release mutex and shared resource queue.

## Result and evidence

- Request-demo and walkthrough actions now lead to `/demo` with the label “Try Our Sandbox”. Adjacent duplicate actions were removed; sandbox buttons have stronger contrast, weight, elevation and keyboard focus styling.
- TypeScript and both Vite production bundles passed. Matched API and web images carry revision `252cb38ddafe3c23e85824db8a10259b6cbd6d24`. API, worker, guided-demo, web and PostgreSQL reported healthy.
- Both databases were backed up and restore-checked. The encrypted off-host recovery archive passed checksum and encryption round-trip gates: `MetaClinic-recovery-252cb38ddafe3c23e85824db8a10259b6cbd6d24.tar.gz.dpapi`, 2,796,614 bytes, retained in the owner's Secure Files directory. Previous image references and host recovery material were retained.
- The release completed all 26 hosted checks, including authentication, CSRF and anonymous access denial, concurrent context reads, organization entry, Sandbox preparation, location persistence and a second visitor joining the prepared Sandbox.
- Independent HTTPS verification returned `/build.json` revision `252cb38ddafe3c23e85824db8a10259b6cbd6d24`, version `0.2.9`, `dirty: false`; `/up` returned 200.
- Live browser checks covered `/meta-clinic`, `/meta-clinic/book-demo`, `/meta-clinic/platform`, `/meta-clinic/weight-loss`, `/meta-clinic/ai` and `/meta-clinic/pricing`. The sandbox links had the requested label and `/demo` destination, with no old request-demo/walkthrough action labels. Desktop and 375px mobile screenshots were inspected; mobile had no horizontal overflow and its navigation drawer exposed the sandbox action. Local screenshots are retained under this task's ignored `tmp/marketing-live/` directory.

## Limits and resolved blockers

Docker initially reported a stopped engine with a stale resume error. A bounded Docker Desktop restart restored the engine. Streaming avoided a large local image archive; local free space remains low. No unrelated worktrees or files were removed.

GitHub CI jobs did not start because of the account billing/spending restriction. The local release path and named hosted checks supplied separate evidence. Existing ineffective dynamic-import and duplicate-MIME warnings remained nonfatal. No application test suites were added or run.

This release contains the marketing changes only. The requested workforce demo-data improvements remain separate and pending. It does not establish broader workflow, clinical, security or production acceptance.

This receipt is a documentation-only follow-up; its Git revision may be newer than the live application revision.
