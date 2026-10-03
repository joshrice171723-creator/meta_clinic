# Marketing tutorial and specialty navigation publication

Date: 2026-10-03. Joshua explicitly requested publication to aimetaclinic.com after confirming the marketing changes were pushed to main.

## Released identity and scope

- Previous hosted revision: `aab93057680cb18cba5eb3b4c0cdf090446ba2ed`.
- Released revision: `6d96d07184a32440a59dfb6530dad78c83e7ff65`, version `0.2.6`; public build identity and host current-revision matched at 08:09 UTC.
- Included the committed screenshot-led marketing walkthroughs, shared navigation, 17-feature tutorial library, and withdrawal of unfinished hormone health, rehabilitation/PT, aesthetics and infusion marketing pages and related links. The candidate also contains the already-merged referral/insurance preparation, import recovery and QA 236–246 fixes described in their existing implementation records. No additional branch was integrated for this publication; current QA 247–253 work remains excluded.
- API image ID: `sha256:5157563a81f2cb5ae47ba05ea9daa33403d9621acad2bf950eb8f749f0261bd6`.
- Web image ID: `sha256:5399622c1572d2c59a6c8cc4155b037dbce3e71a48bc0a7931a7f53b7f1e4634`.

## Observed release evidence

The clean isolated main release checkout advanced by fast-forward to the exact approved candidate under the existing global release mutex. The canonical `release.ps1 -BuildWebOnHost` path ran through the resource queue. Locked dependencies, TypeScript and main/Office bundles passed. Both images were built, transferred and verified. Both databases were backed up and restore-checked; the off-host DPAPI recovery archive passed upload/download/decrypt/hash verification before deployment. The included migrations completed. No rollback was needed.

The canonical hosted verifier reported all 26 checks passing, including ordinary password authentication, anonymous/CSRF denial, logout denial, isolated demo organization entry, Sandbox availability, location switching/persistence and second-visitor entry. Public `/build.json` reports the exact released revision with `dirty: false`; `/up`, `/clinic/updates` and `/meta-clinic` returned HTTP 200.

The live browser showed only Primary Care, Membership Care, Urgent Care, Weight Management and Behavioral Health in the specialty menu. The homepage had no links to the withdrawn specialties. Each of the four old base URLs displayed “This page is not available.” with `noindex,nofollow`; this is an application unavailable view, not a server HTTP 404. The live resource library retained 17 distinct feature tutorial destinations. Its membership tutorial link opened the expected walkthrough with loaded catalog/services screenshots; below-the-fold images use lazy loading. Earlier local focused checks cover related indexes, aliases and nested routes separately from this live sample.

## Recovery and limits

Host recovery remains under `/opt/meta-clinic/backups/release-6d96d07184a32440a59dfb6530dad78c83e7ff65`. The matching encrypted off-host archive remains in the owner's existing Secure Files directory. Previous images and recovery material were preserved. Logs remain outside Git in the release-checkouts directory.

No automated test suite was added or run. Existing mixed marketing-import and duplicate Nginx MIME warnings did not fail the builds. This publication does not close broader clinical, provider, original QA or independent Muse acceptance. The existing Muse monitor's last available status reported a disconnected tunnel; no active run/build was inferred or restarted. Development, QA and scheduled publication automations were already paused and remain paused. The original dirty checkout was preserved.
