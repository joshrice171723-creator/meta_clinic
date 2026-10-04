# Intake and clinician handoff panel

This prototype adds a focused staff workflow around the existing Rails nurse workspace. It searches authorized patients, lists their encounters, reads the backend intake and handoff state, prepares a versioned intake revision for approval, and prepares backend-supported handoff actions for approval. The backend remains responsible for authorization, validation, evidence ownership, version checks, role separation, and persistence.

The panel intentionally edits only the five intake state fields exposed by the current API. It leaves the existing questionnaire answers, observations, history-review references, clinical notes, diagnoses, and measurements untouched. It does not sign notes, claim that a clinician approved care, infer normal findings, start or check in a visit, or bypass the parent review dialog. Status choices are blank until returned by the backend or explicitly selected by staff.

## Existing API contracts

The API routes are implemented by `Clinic::Care::NurseWorkflowController`:

| Operation ID | Method and route | Behavior |
| --- | --- | --- |
| `nurse_workspace` | `GET /api/clinic/patients/:patient_id/encounters/:encounter_id/nurse_workspace` | Returns the current intake, questionnaire definition, review items, evidence options, tasks, handoff, and capability flags. |
| `revise_nurse_intake` | `POST /api/clinic/patients/:patient_id/encounters/:encounter_id/intake_revisions` | Appends a revision using `expected_version`; omitted questionnaire data preserves the existing questionnaire. Requires `intake.write`. |
| `request_intake_handoff` | `POST /api/clinic/patients/:patient_id/encounters/:encounter_id/handoffs` | Creates a pending handoff from the latest ready intake. Non-video encounters require a room. Requires `intake.write`. |
| `transition_intake_handoff` | `PATCH /api/clinic/handoffs/:id` | Applies an allowed state transition using `expected_version`. Response actions require `notes.write` and a different authorized clinician from the requester; cancellation requires `intake.write`. |

The handoff state machine and intake readiness checks live in `apps/api/app/services/clinic/care/nurse_workflow.rb`. The panel does not duplicate them as authority. A rejected, stale, inaccessible, or otherwise invalid action remains a backend error and must not be shown as saved.

## Root integration

The root app and catalog now mount this slice. The integration is:

1. In `plugins/meta-clinic/server/catalog.mjs`, import `INTAKE_OPERATIONS` from `./intake-operations.mjs` and spread it into `OPERATIONS`. The exported definitions include strict input schemas, source controller, endpoint path, body root, result key, write confirmation, and no-replay annotations. Existing `meta_clinic_read` and `meta_clinic_prepare_change` then route these IDs through the normal schema, permission, context, review-ticket, and one-time apply behavior.
2. Import `IntakeWorkspace` from `./IntakeWorkspace` in `plugins/meta-clinic/ui/app.tsx` and render it in the clinic workspace's `Intake` domain panel.
3. Pass the existing parent callbacks and state without adding a second API client:

   ```tsx
   <IntakeWorkspace
     call={call}
     onPrepare={onPrepare}
     refreshKey={refreshKey}
     context={context}
     onDirtyChange={onDirtyChange}
   />
   ```

4. The component uses `call('meta_clinic_read', { operation, arguments })` for the existing patient lookup and encounter reads plus `nurse_workspace`. It calls `onPrepare(operationId, exactArguments)` for `revise_nurse_intake`, `request_intake_handoff`, and `transition_intake_handoff`; the parent must show the prepared values and require the existing human Apply action. Increment `refreshKey` after a confirmed apply so the component can reload the backend-owned result.
5. Pass the authenticated context snapshot already used by the parent. It scopes local draft reset to `user_id`, `practice.id`, `current_site.id`, and `authorization_generation`. Call `onDirtyChange` so the existing Keep editing / Discard and continue guard protects navigation.

The component uses these existing read IDs for patient and encounter selection: `lookup_patient`, `list_encounters`, and `get_encounter`. Patient IDs, encounter IDs, and revision IDs always come from their backend responses; the panel does not synthesize record identifiers.

## Data and safety boundaries

- The app and local API use independently generated synthetic development data. The panel is not approved for real patient information or production use.
- A save is not made until the parent applies its prepared change. The API rechecks current membership, capability, encounter scope, idempotency, and version during apply.
- The intake update preserves existing linked observation and history-review IDs as returned by the backend; this panel does not attach new evidence. It does not edit the questionnaire body.
- Handoff requests are enabled only from a saved `ready_for_handoff` revision and are still validated by the API. The backend enforces current-revision linkage, room requirements, active-handoff uniqueness, task creation, response roles, and allowed state transitions.
- A UI read, build, or local API response does not establish clinical, privacy, security, regulatory, production, or release acceptance.

## Standards and applicability

This slice reuses the clinic's existing intake and handoff data model; it does not define a new exchange resource, clinical terminology binding, triage algorithm, or jurisdiction-specific rule. Accordingly, no new U.S. Core/FHIR mapping or clinical code set was selected. The existing backend contract and explicit actor-selected workflow states control the panel. Any future expansion into clinical answer fields, safety routing, a new data model, or an external exchange requires a separate standards-guided review against the applicable U.S. implementation guides and operational sources before changing behavior.
