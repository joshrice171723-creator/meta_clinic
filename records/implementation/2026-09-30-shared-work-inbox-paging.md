# Shared Work Inbox paging — 2026-09-30

Base: `8c3d2358073acd14bb135a93a3adb1d7aa9034c8`. Branch: `nova/mc12-patient-return-20260930`, following patient billing-support commit `145de3b5`. Joshua designated this helper sole owner of shared queue paging following independent scorer checklist `e33648c278ca8d7c7abe0ad0d662f9560e806894`. This is source evidence for independent scoring, not a percentage-table update or a Build >90 claim.

## Implemented missing source

The [follow-up service](../../apps/api/app/services/clinic/operations/follow_up_worklist.rb) previously capped encounter follow-ups and accessible staff-message requests at 50 without offsets. Renewal exceptions read 51 only to signal truncation. The [controller](../../apps/api/app/controllers/clinic/operations/follow_ups_controller.rb) now accepts independent positive bounded `staff_requests_page`, `encounter_follow_ups_page` and `renewal_exceptions_page` parameters, defaulting to 1. Each population returns its own same-named metadata object with `page`, `per_page: 50`, full filtered `total`, and `total_pages`.

Counts and rows share the existing permission/practice/site/assignment scope. Staff requests keep active conversation participation and message visibility; encounter work keeps existing encounter-site authority and remains visible after encounter closure; renewals keep practice-wide billing authority, existing exception conditions and exclusion from location-specific/mine/overdue views. Existing stable date-plus-ID ordering is retained. Requested pages beyond the current last page clamp to that page; an empty population returns page 1, total 0 and total_pages 0. No mutation, existing claim/complete/reopen workflow, provider retry, money collection or clinical policy changes. Audit read references now record the effective independent pages as well as the existing site/filter.

The [Work Inbox](../../apps/web/src/features/clinic/WorkInbox.tsx) now exposes independent Previous/Next controls and matching totals for these three populations, and consumes existing lab review/follow-up page APIs beyond hardcoded page 1. Lab priority/version ordering and source links/actions remain owned by their existing APIs. Lab queues still cover **all authorized locations**, matching their existing API contract; this increment does not make them selected-site-only queues.

The [paging source helper](../../apps/web/src/features/clinic/workInboxPaging.ts) binds visible rows to the exact URL and filter scope before an effect executes. A new page/filter suppresses prior rows immediately; aborted late reads cannot overwrite the current source. Explicit failed-page retry keeps the requested page. Assignment/work-type changes reset all independent counters to 1; changing practice, actor, location or capabilities remounts the inbox and resets protected state. Background refreshes within the same page retain mounted rows/drafts and display loading/error status. Previous-scope rows never appear as current, and failed sources cannot claim an empty/complete queue.

## Verified checks and limits

- Focused frontend synthetic tests: **24 passed across 2 files**, one worker (13 billing-support cases plus 11 paging cases). Paging cases cover 51/100/101/0 totals, independent/reset counters, immediate source-scope suppression, disabled-source clearing, same-page failed/retry state and same-page refresh retention.
- Frontend TypeScript passed after the complete source change.
- Vite bundle passed (1,476 modules transformed, 1.29-second reported build).
- All seven changed frontend source/test files pass Prettier; `git diff --check` passes. Scoped diff/source review confirms existing action paths and source identities are retained. No manifest, dependency, schema, policy or canonical tracker change.
- Three synthetic Rails acceptance cases were added to [clinic_follow_ups_test.rb](../../apps/api/test/integration/clinic_follow_ups_test.rb): reach the 51st accessible staff request with stable order/count and private/other-site exclusion; reach closed-encounter follow-up 51 while excluding a denied site; reject invalid independent page values. **These cases have not run.**

Runtime blocker: the saved Cloud checkout has Node 24 and locked frontend dependencies, but no Ruby executable (`ruby: command not found`). `docker ps` succeeded and showed no running containers. No Rails/PostgreSQL stack or dependency/runtime provisioning was started. Ruby syntax, RuboCop, SQL execution and real backend pagination/denial/reload proof are therefore **unverified**, even though frontend checks passed. There was no live browser QA, actual outbound email/SMS, provider call, live patient data or credential access.

## Handoff to existing local test owner

Use the dedicated branch/commit in the already owned isolated synthetic test runtime; do not reset or borrow another runtime. Suggested queued checks:

```sh
cd apps/api
python ../../bin/agent-resources run -- bundle exec rubocop app/controllers/clinic/operations/follow_ups_controller.rb app/services/clinic/operations/follow_up_worklist.rb test/integration/clinic_follow_ups_test.rb
python ../../bin/agent-resources run -- ../../bin/postgres exec bundle exec rails test test/integration/clinic_follow_ups_test.rb test/integration/patient_journey_continuity_test.rb test/integration/clinic_lab_reports_test.rb
python ../../bin/agent-resources run -- ../../bin/postgres exec bundle exec rails test test/services/clinic/stripe_memberships_test.rb
```

The existing renewal suite exercises local exception projection, not a newly prepared 51-renewal fixture; that multi-page runtime proof remains open. No browser run is requested here. Source controls and pure-state tests do not establish frontend interaction/real-API connected acceptance. MC12 credit is limited to new later-page access to existing staff follow-up populations; MC09's affected contract is renewal-exception paging, and MC06's affected contract is consuming existing lab queue pages. Shared code is not duplicate scoring credit. Other ordinary clinical-task previews, appointment/refill/callback populations and unrelated queues retain their prior limits and remain outside this increment. Existing staff refill recovery and encounter follow-up transitions receive no new implementation credit.

Patient-visible released follow-up/return journey, durable full-reload uncertain-message recovery, actual external delivery, and broader scope/role acceptance remain open. Nova/Relay's membership-history files, MC09 helper's entitlement work, Office/DevOps and QA backlog are untouched. Relay alone combines; no PR, main merge or deploy was created.

## Independent-review correction — Overdue lab follow-up pages

Independent review blocked `81cbc6e2`: fifty future critical lab follow-ups precede a routine overdue item at row 51. Switching to Overdue resets the source page to 1, but the original increment hid both lab pagers outside All open and showed an unqualified empty state. The overdue item remained in the authorized source yet could not be reached in that filter.

The correction keeps lab follow-up navigation and failed-page retry in **All open and Overdue**, matching the existing item projection. Lab review navigation remains All open because those rows are not projected into Overdue. Counts say **source items**, rather than claiming to count the client-filtered visible subset. If loaded source pages do not cover their whole populations, the empty state says **No matching work on the loaded pages** and directs staff to navigate source pages. Existing server pagination, priority order, source links and mutations are unchanged.

The new [rendered regression](../../apps/web/test/work-inbox-overdue-lab-pages.test.tsx) runs the actual Work Inbox projection with independently synthetic paged responses and controlled React state. Under Overdue, page 1 has fifty future critical rows and no matching item; page 2 requests the existing queue's second page, renders the overdue row 51 and retains its exact patient/report/version source link. A failed Overdue page 2 retains Retry page and cannot display a clear-queue message. Both tests **fail against original `81cbc6e2` and pass against the correction**. This is static React rendering with mocked transport/state, not a live browser or Rails proof. The previous patient return-request work remains separate from this correction commit.
