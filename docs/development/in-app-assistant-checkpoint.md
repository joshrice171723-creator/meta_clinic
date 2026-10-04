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
not the Phase 2 architecture. The first booking gate is now locally verified;
the owner's later explicit direction authorizes broader workflow implementation.
Representative expanded operations are locally verified below; no complete
116-criterion assistant acceptance run has been completed.

## Ownership and Git

- Worktree: `C:/Users/joshr/.codex/worktrees/in-app-assistant/meta_clinic`.
- Branch: `codex/in-app-assistant`; booking commit `ca8c4f50`, main synchronization
  `c2f63775`, both pushed. Expansion source is `c385729b`; the companion evidence record pins that source.
- Main merged into this branch from `origin/main` (`e85e5500`); no master ref exists.
- The primary checkout's unrelated dirty files and all prepared-slot claims are preserved.
- Integrator owns Git, schema dump, runtime/browser, checkpoint, reconciliation and tutorial.
- `booking_backend` owns the generalized workflow context/proposal/controller and
  migration `20261004010300`; clinical/operations workers own their separate
  domain handlers. `model_adapter` owns workflow mapping and model gateway;
  `assistant_frontend` owns web files. Integrator owns routes and schema dump.
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

Current phase: local expansion implementation and focused verification delivered
on the task branch. Workflow migration
`20261004010300` is installed in the owned development DB. The additive schema
change retains unrelated baseline objects (354 additions, zero removals).

The criterion-first [workflow map](in-app-assistant-workflow-map.md) preserves all
116 criteria and 19 ID conflicts: 52 have mapped implementations pending complete
criterion verification, 53 have concrete partial/dependency gaps, and 11 remain
human-gated. No full-criterion acceptance verdict is inferred from those counts.
Standing briefings and automatic event actions remain outside this implementation.

Focused checks after the all-writers freeze and narrow repairs:
- Scheduling handler: five cases passed in the consolidated domain run.
- Clinical/Administration: all ten cases passed in the repaired combined run.
- Operations/Office: seven cases, 80 assertions, zero failures/errors.
- Generic workflow integration: all nine cases passed across the repaired run and
  concurrency rerun (one case/seven assertions for concurrent confirmation).
- Workflow and booking model gateways: 14 cases passed; final provider transport
  rerun: five cases/27 assertions, zero failures/errors.
- Existing waitlist regression passed after configuring its synthetic site.
- Final TypeScript, primary Vite and Office Vite builds passed; pre-existing
  marketing dynamic-import warning remains. Scoped RuboCop: 44 files, no offenses.
Failed intermediate checks and repairs are retained in the workflow evidence.
No entire-repository test pass is claimed.

Real OpenRouter interpretation selected `reports.current_stock`, followed by a
200 backend stock read. Final billing model request encountered upstream 429;
local account count was 9/50, so local quota was not the cause. Free-only routing
and caps were retained. Direct workflow controls remained usable: explicit review
and confirmation saved billing service 1, code `AI-REVIEW-1004`, USD 35.00 in
practice 3. SQL and an independent assistant catalog read matched. A replay
returned 409 `duplicate_submission`. Receipt:
`37271ad4-61e6-42b3-9baa-fabb910c24c4`. No AI-generated billing proposal is claimed.
Named patient selection bound Jamie Brooks; clinical-history read returned 200
with durable read receipt 1460. The 834px tablet viewport had no horizontal
page overflow. The final expansion keyboard recheck passed: Escape closes the panel and
restores focus to its entry button.

The controlled Admin quota-exhaustion fixture was restored from artificial 15 to
its actual reservation count 3. Account/practice counts and real attempts were not
decremented; caps were not raised. Runtime remains http://127.0.0.1:3340.

Next executable product work: choose a criterion with a concrete missing adapter
from the map (for example patient merge/handoff, structured HPI/ROS, PO-linked
receiving or count sessions), implement it through its existing backend contract,
and verify that complete criterion on the assistant build. Full 116-workflow
acceptance and hosted verification remain pending. The exact release packet is
[in-app-assistant-release.md](in-app-assistant-release.md). No deployment.

## Runtime and prior integration repairs

The isolated stack is running with the three booking/budget migrations applied.
All 21 changed booking Ruby files passed scoped RuboCop after three test-helper
spacing repairs. Vault links/reachability passed; size/lifecycle audit reported
existing advisories. Prior Rails parameter wrapping, model table naming, context
UUID, version fallback and free-model response defects were repaired before the
passing evidence above. Fresh demo provisioning can take several minutes; its
role-selection recovery reuses existing records. No shared reset was performed.

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
the booking objects and three migration versions; the expansion adds its own
41 objects and one migration version. The full local
dump is retained under ignored runtime evidence; no unrelated schema is removed.
