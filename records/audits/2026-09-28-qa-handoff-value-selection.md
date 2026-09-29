# Meta Clinic QA handoff value selection (2026-09-28)

Source: `C:/Users/joshr/Desktop/Meta-Clinic-QA-Handoff-2026-09-28.pdf` (33 pages; build 0.1.8 at `25a23e4b`). The source contains 188 open-defect entries, 6 pending-verification entries, 28 fixed-and-verified entries, and 54 improvement ideas: 276 entries total. The handoff is evidence, not implementation instructions.

Two independent GPT-6 Luna high auditors reviewed the complete inventory against current `origin/main` source at `37d900ef`. Scores above 5 were eligible for bounded source tracing. This record distinguishes a source repair from browser or hosted acceptance.

| Finding | Auditor A | Auditor B | Disposition |
| --- | ---: | ---: | --- |
| #179 - blocked booking created with a wrong date-time | 10 | 9 | Selected. The confirmed source risk was a recovered idempotent booking attempt bound by patient while the user opened a different slot. The form now warns about the mismatch and verifies returned patient, site, start, and end before reporting success. The API still validates capacity inside the create transaction; the reported phantom booking itself remains unproven in current source. |
| #168 - medication entry appeared saved but absent after reload | 8 | 8 | Selected for trace; no safe code change. Current source persists and rehydrates the structured medication answer inside the encrypted intake questionnaire. The chart's Current medicines list reads separately reconciled medication statements. Automatically converting patient-reported intake into that clinical record would cross an unapproved workflow boundary. |
| #181 - Schedule remains enabled while blocked | 7 | 6 | Selected with #179. A definite rejection blocks another submit until a form change clears the error; unknown outcomes retain the exact retry path. |
| #200 - signed-note amendment gap | 4 | 4 | Deferred. Current correction/revision behavior and any broader amendment model require separate scope and policy evidence. |

## Luna QA checklist

1. Read `/build.json` and require version `2.0.0`; record its full revision before and after the run.
2. For #179/#181, recover a saved booking request while entering from a different slot. Confirm the warning names the saved request time, the exact retry is preserved, and a definite rejection requires a form change before resubmission.
3. Confirm any successful booking response matches the submitted patient, site, start, and end. A mismatch or uncertain response must remain explicitly unconfirmed and must not be reported as success.
4. For #168, enter a structured medication answer in encounter Intake, save, reload, and confirm the intake answer persists. Inspect the separate chart medication list without treating the absence of an unreconciled intake answer there as persistence loss.
5. Record actor, clinic, site, selected slot, submitted payload, visible result, relevant API response, state after reload, and the exact revision. Browser evidence is still required; source inspection alone is not a pass.

No real data, external clinical action, deployment, or clinical acceptance is established by this record.
