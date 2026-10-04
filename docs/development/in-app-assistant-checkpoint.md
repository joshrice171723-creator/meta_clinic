# In-app assistant — Phase 2 checkpoint

Updated: 2026-10-04. Owner: current Codex task (integrator); synthetic development only.

## Direction and preserved history

The owner's October 4 Phase 2 request supersedes the intervening cancellation of
the embedded assistant and resumption of the ChatGPT plugin. The active direction
is an assistant inside Meta Clinic, using the existing app session and backend.
The October 4 follow-up requires demo access without visitor login. The existing
demo entry creates the scoped visitor identity; it must not request credentials.

Phase 1 is parked. `codex/meta-clinic-codex` at `e815cbb9` and its
[handoff](../../plugins/meta-clinic/HANDOFF.md) remain reference material, including
their explicit limits. Connector pairing, OAuth, host metering and packaging are
not the Phase 2 architecture. No later capability group is accepted or started.

## Ownership and Git

- Worktree: `C:/Users/joshr/.codex/worktrees/in-app-assistant/meta_clinic`.
- Branch: `codex/in-app-assistant`; integration base `00bc9c67d14f31526a48fbdfe1e63017867eeb17`.
- Main pulled into this branch from `origin/main` (`6b7fde23`); no master ref exists.
- The primary checkout's unrelated dirty files and all prepared-slot claims are preserved.
- Integrator owns Git, schema dump, runtime/browser, checkpoint, reconciliation and tutorial.
- `booking_backend` owns Rails assistant context/proposal/booking controller and services,
  routes and migration `20261004010000`; `model_adapter` owns provider adapters,
  model gateway and budget migration `20261004010100`; `assistant_frontend` owns web files.
- Runtime reservation: web 3340, API 3341, PostgreSQL 54409/container
  `apply-inapp-assistant`; databases `apply_inapp_assistant_development` and
  `apply_inapp_assistant_test`. No shared database or service may be reset or taken over.

## First milestone and acceptance boundary

Find existing backend appointment openings, create a server-held proposal,
explicitly confirm, and read the persisted appointment plus actor-attributed
receipt. Clinic, location, patient, encounter, role and session are checked at
each step. Confirm reauthorizes under lock, rejects expiry/version/context changes,
and cannot double-book through duplicate submission. Availability is not a hold.

Required evidence: positive persisted booking; permission denial and revoked grants;
actor/session/clinic/site/patient/encounter separation; stale availability and
record versions; expiry; duplicate and concurrent submissions; audit failure;
demo entry without login, role switch and ordinary/demo isolation; model quota
exhaustion, unavailable provider and bounded retry; prompt-injection output
rejection; keyboard/focus and recovery walkthrough. Keep automated, browser,
provider and hosted results separate. Later clinical drafts, billing, briefings
and event actions remain gated until this milestone is verified.

## Historical workflow reconciliation

[The 116-row source](../../plugins/meta-clinic/workflow-116.json) records a supplied
0.2.9 website report (95 pass, 8 fail, 13 blocked), with both `228ae291` and an
earlier `60ed12de` mentioned. It is historical website evidence, not an exact-build
assistant acceptance run. Its source SHA-256 is
`48ff9909dd089df698af2f445e9bbe451800a7ee1db3ae942e314de560ec473e`.

19 ID/subject conflicts, 14 qualified/incomplete claims and 83 unverified reported
results were found in the preserved catalog. No website pass transfers to Phase 2.
The companion reconciliation record retains each criterion, disputed subject,
build provenance and first-milestone candidacy. No signing, approvals, recurrence,
overbooking or external sends become model tools.

## Booking evidence and current expansion

October 4 scope update: after asking whether all 116 workflows were supported,
the owner explicitly authorized building the broader workflow coverage now.
The booking foundation remains the first acceptance gate. Expansion maps each
criterion to actual backend operations; human signing, final approvals, shared
resets and external sends remain gated. Catalog counts are never acceptance.

The real free model interpreted “Find me an appointment tomorrow at 9:30 for
30 minutes.” Backend openings, explicit proposal review and confirmation saved
appointment 2928 for Jamie Brooks at 2026-10-05 09:30–10:00 UTC. Receipt
`faf05d6f-bfbc-4353-b2a9-8e89f0d0d304` read back the persisted appointment.
The ordinary schedule displayed it; SQL confirmed one matching appointment and
one actor-attributed `assistant.booking.confirmed` audit event. Two concurrent
confirmation replays returned 409 `duplicate_submission`.

Focused booking/demo/route checks passed: 15 runs, 846 assertions, no failures.
Gateway checks passed 6 runs/36 assertions; provider checks 4 runs/20 assertions.
Budget cases passed in the earlier combined run. Full architecture whitelist
checks have unrelated baseline drift; no whole-suite pass is claimed.
The final booking TypeScript check and both Vite bundles passed. Browser checks
covered keyboard Escape/focus, draft preservation, 834px tablet layout, expired
proposal recovery, real durable-budget exhaustion and an Inventory-role patient
permission denial. Role switching made the previous proposal unreadable (404).
Expiry and quota screenshots use controlled conditions in the isolated local DB.
Two simultaneous fresh browser contexts retained different roles (Inventory and
Admin). The second visitor could not retrieve the first visitor's proposal (404),
and its ordinary clinic namespace returned 401 while the demo workspace worked.
The first booking milestone is locally verified within the evidence above;
this does not accept all 116 workflow criteria or a hosted release.

Current phase: expansion source planning, then cohesive implementation and one
consolidated verification pass. The three existing workers are mapping backend
execution, workflow coverage and frontend contracts. No expansion runtime proof
is claimed yet. Local runtime remains http://127.0.0.1:3340.

## Earlier integration observations (superseded by evidence above)

Integrated implementation is in focused verification. The local stack is running
at http://127.0.0.1:3340; isolated databases are prepared and all three additive
migrations applied. The web TypeScript check and both Vite bundles passed after
Material UI API/type repairs. Twelve initial assistant Ruby files passed RuboCop.
Vault links/reachability passed; vault size/lifecycle audit reported existing
advisories. No hosted acceptance is claimed.

The fresh-browser check found the existing required visitor-details form. The
bounded repair now creates a server-generated visitor through the existing demo
session flow; a fresh browser reaches role selection with no credential or
contact fields. Interrupted sandbox preparation now has a role-selection recovery
screen that reuses existing records. Complete fresh demo-to-assistant verification
is still running.

Initial focused tests exposed Rails parameter wrapping and the budget model's
implicit table name; these were corrected. Provider/budget checks now have nine
passing cases and two test-helper errors being repaired. Expanded booking tests
are running. Natural-language inference, persisted booking and tutorial workflow
screenshots remain pending; do not describe this milestone as verified yet.
Next: finish one actual free-model conversation through proposal, explicit
confirmation and persisted read-back; then close the named failure-case checks.

Read-only hosted observation on October 4: `build.json` reports version `0.2.9`,
revision `228ae291351602802ee9d0507d82f3b239fe1ed5`, dirty false; `/up` returned
HTTP 200. This task made no hosted change and does not infer assistant support.

## External and compliance requirements

OpenRouter free inference uses an existing key located in an ignored local Meta
Clinic configuration under the owner's explicit reuse/create authorization.
Its read-only provider authentication check succeeded. The key is copied only
to this checkout's ignored runtime file; no secret is committed or displayed.
Integrated free-model inference succeeded; the provider returned cost 0 for the
verified request using `qwen/qwen3.8-27b:free`.
Zero model charges does not mean zero hosting, storage or operating costs.

The production provider path is gated. Three distinct open requirements are
owned by the project owner with healthcare counsel: an executed BAA; approved
retention controls; eligible endpoints/features and approved organization/project.
An adapter does not establish any of them. No HIPAA-compliance claim is made.
Conversation retention is separate from durable action receipts. No whole charts,
credentials or session tokens belong in diagnostic logs.

No main merge, hosted mutation, deployment, public publication, paid inference,
third-party contact or external clinical/payment activation is authorized.
Delivery requires task-branch commits/push plus a concrete release packet listing
the exact target, migrations, expected effect and recovery plan for later approval.

Schema generation observation: the baseline structure contains unrelated learning
tables/versions absent from the current migration directory, plus unrelated
patient-constraint drift. The task preserves the baseline schema and inserts only
the 59 generated assistant objects and three migration versions. The full local
dump is retained under ignored runtime evidence; no unrelated schema is removed.
