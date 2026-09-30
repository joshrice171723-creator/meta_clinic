# Intake answer source inspection

## Assignment and authority

Nova's authorized product assignment: reassess the remaining pilot critical path, select one unowned bounded capability, and implement with authored regressions. MC-05/06 and M11 own this slice: staff can inspect the source of a saved intake answer before clinician handoff/review. This is read-only presentation of existing persisted records; it does not approve clinical content, assign tasks, sign a note, change a consent, transmit to a provider, or authorize release.

Read this brief and its canonical references before resuming or accepting a handoff. Keep one active product item. Preserve the existing PR52/53/54 and other open-PR file owners; do not merge or deploy.

## Current sources and decisions

Inspected baseline: `2b0e9db4c9158562130e02555396dd078658ac8a` on main. The [canonical tracker](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) selects MC-05/06/12; [M11](../weight-management-intake-tracking.md#M11--patient-confirmation-and-clinician-review) requires readable source/version and distinguishes confirmation from clinical review. [The connected journey](../../../PATIENT_JOURNEY_PLAN.md) separates intake/arrival T03–04 from exact reviewed-content T05 and parallel ownership T10.

The [2026-09-19 audit](../../../records/implementation/2026-09-19-weight-management-intake-audit.md) is historical: newer source already adds detailed typed capture, question snapshots, evidence/consent links and conditional follow-up. Reuse those owners. The founder's `0a9c218a` simplification deliberately removes automatic intake task generation. Unknown/declined answers remain documentation; this assignment does not recreate those queues.

Three ranked gaps from current source/tracker:

1. M11 answer-source visibility: `IntakeReview.attach!` stores item-level question/source/time/confirmation/correction metadata; `NurseWorkflow.serialize_intake` returns it. The staff workspace's saved-answer comparison lacks an item-level source inspector. Selected missing capability.
2. MC-09/T08 membership continuation: recorded focused API proof already exists for renewal failure, exact replay and cancellation. Connected browser failure/cancellation/unknown-payment recovery is an acceptance gap, not evidence of missing source.
3. MC-12/T10 patient follow-up/messaging: precise patient visibility, failed-message recovery and return-visit acceptance remain open. Existing recovery source and separately owned PR49 cover part of it; no duplicate repair assigned here. MC-07 also needs connected two-party media/provider evidence, which a local room simulator cannot supply.

## Connected journey

A staff member records intake in the existing rooming workspace. Saving creates an immutable encrypted intake revision. In the active group's saved-source disclosure, a permitted reader selects one saved question and sees its recorded wording, exact saved response, original entry before normalization, author/time, confirmation and correction reference. Unsaved draft edits remain separate. A clinician can use this source evidence alongside existing comparison and handoff; viewing does not record clinical acceptance.

Changing the saved revision, active group or patient/encounter resets the disclosure/selection. A mismatched source fails closed. Legacy answers remain readable with explicit missing metadata. No additional request or mutation is triggered by inspection. Independent draft saving, scheduling, manual documentation and existing follow-up actions retain their own prerequisites.

## Fields and action rules

| Existing owning value | Display and evidence rule | Regression |
| --- | --- | --- |
| Intake ID/version/patient/encounter | Identify the saved context; do not show a mismatched record | Positive context and two mismatch cases |
| `items[id].question` and question/form versions | Prefer recorded wording. If absent, mark original question unavailable and label fallback as current wording; do not copy current version into provenance | Changed current wording and legacy metadata |
| `answers[id]`, raw `original_response` | Preserve exact strings, decimal units, zero, explicit response states and repeated records; original entry is not a previous-revision answer | Quantity/zero/repeated medicine/escaped text, decline selection |
| Item source/recorder/time | Use the item's recorded source; do not substitute latest revision author/time | Different item and revision author, absent legacy source |
| Item confirmation/time | Show staff confirmation separately from clinical review; absent is unavailable | Confirmation/legacy negative cases |
| `supersedes_revision_id` | Show an earlier intake record reference, not an invented version or fetched prior answer | Correction reference |

Source mapping reviewed 2026-09-30: [HL7 FHIR QuestionnaireResponse R4 4.0.1, 2.38.1–3](https://hl7.org/fhir/R4/questionnaireresponse.html) describes recorded question wording, subject/encounter, authored/author/source and answers. This published global technical foundation is used for the U.S. pilot's local provenance presentation; it is not a selected exchange profile or conformance claim. Snapshot preference and separate confirmation are explicit Meta Clinic product contracts. No medication rule, triage threshold or jurisdictional consent content changes.

Material UI connector is unavailable. Installed package types plus official [Accordion](https://mui.com/material-ui/react-accordion/) and [Select](https://mui.com/material-ui/react-select/) documentation were reviewed. Reuse Accordion/Summary/Details, TextField/MenuItem, Alert, Box/Stack/Typography and ExpandMore. No new primitive library or dependency.

## Ownership and dependency matrix references

Reuse [the matrix](../meta-clinic-build-and-acceptance.md): CV-01 (unknown/draft states), CV-02 (correction provenance), CV-03 (identity), CV-04 (separate handoff), CV-09/10 (exact clinical content use), OP-10 (no false saved outcome). This read-only slice changes no matrix row or gate. Clinical review, ownership, handoff and post-closure task acceptance remain their domain owners' work.

PR36 owns the active tracker file. The current user explicitly requires avoiding existing PR files, so its owner must add the assignment link/status during coordinated integration. Proposed text: **MC-05/06 M11 — [saved answer source inspection](intake-answer-provenance.md): bounded read-only source inspector delivered in a draft candidate; authored frontend tests executed; exact API source/denial and connected browser acceptance remain separately scoped. No completion percentage or clinical-review claim.** The plan-to-tracker link is pending owner integration, not silently supplied by an overlapping edit.

## Implementation and acceptance

The source inspector is composed within the existing NurseEncounterWorkspace active group. Frontend contract typing exposes fields the API already returns; backend production source, schema and permissions are unchanged. A new focused Rails test checks immutable item provenance through save/read/correction and denied/mismatched/foreign context. Ruby/Bundler are absent here; route it to Sage's existing isolated synthetic runtime rather than provision another stack.

Acceptance: recorded wording/author/time survive current form changes and later revisions; exact units and nonresponse states remain distinct; missing metadata is explicit; original entry and earlier-record reference are distinct; permitted readers can inspect without edit capability; mismatched context has no answer display; keyboard question selection works; revision/group/context changes reset selection; inspection makes no API request or mutation. Controlled browser fixtures demonstrate component behavior, not actual API/database/vendor acceptance.

From the exact candidate's `apps/api`, preserve runtime-owner environment/database and shared queue:

```sh
python ../../bin/agent-resources run -- ruby -e 'RubyVM::InstructionSequence.compile_file(ARGV.fetch(0))' test/integration/intake_answer_provenance_test.rb
python ../../bin/agent-resources run -- ruby bin/postgres exec bin/rails test test/integration/intake_answer_provenance_test.rb
python ../../bin/agent-resources run -- ruby bin/rubocop test/integration/intake_answer_provenance_test.rb
```

No migrations or eager-loading changes. An existing broad backend rerun is not required. Return exact SHA, actual cases/assertions and failures; Nova retains regression ownership. Connected API browser proof must inspect a saved/corrected synthetic answer as a permitted reader, reload it, then verify denied/wrong-context behavior. No vendor credentials are needed.

## Checkpoint

Source delivered in an isolated candidate. Six authored frontend cases and sixteen existing nurse-workspace cases passed (22 unique tests). Final product source passed changed-file formatting, TypeScript and Vite production bundle. The final new-test-only rerun passed all six after correcting a selector to expect both identical saved/original values; no product workaround was added. A 1280px Chromium component walkthrough covered keyboard selection, decline/legacy state, saved-revision reset and wrong-context denial with no page errors or API requests. Its source panel screenshot was visually inspected after waiting for the disclosure transition. This is controlled component data, not real API/browser acceptance. Two API cases are authored but unrun because Ruby/Bundler are absent. Whitespace checks pass. Documentation harness verification reports only the pending tracker link; the user's existing-PR-file exclusion keeps that edit with PR36's owner. No feature outside this slice is active.

PR55 review correction (2026-09-30): the inspector now consumes `latestIntake`, the same continuity resolver used by editing and handoff, rather than the raw retained workspace snapshot. Two authored Chromium regressions exercise the real workspace save handler/API client with a controlled HTTP correction receipt while refresh either retains the older revision or reports failure. They assert the corrected answer, original entry, item recorder/time and supersedes reference, reject the previous source, and require disclosure reset. Both failed on the old binding and passed after the fix. The eight provenance cases and sixteen existing nurse-workspace cases passed together (24 unique cases). This is controlled browser/transport evidence, not real Rails/browser acceptance. Sage independently passed the unchanged two API cases with 51 assertions and scoped style/syntax at `43aad220f792f99c40cb7bf9a1401ae3d850ab7a`; no backend files changed in this correction or were rerun here. Relay owns the tracker-link gate. The separate MC09/MC12 acceptance-design checkpoint is preserved without executing QA or introducing another feature.

## Last run

2026-09-30 UTC. Inspected main `2b0e9db4`; selected and implemented the missing source-inspection interface after completing PR54's authored dropdown handoff. Changed canonical paths: this assignment plan, source inspector, nurse workspace composition, frontend contract and focused frontend/API regression files. Authored and existing focused frontend checks, TypeScript, selected formatting and production bundle passed; API tests remain authored but unrun. The documentation verifier has one reported issue: the assignment link is absent from the actively owned tracker. Next: Sage exact-head API/source review and connected real-API browser acceptance, plus the tracker link by its owner. Source metadata display is not full M11, clinical, provider or release acceptance.
