# Scribe inside the video call

Navigation: [packet](README.md) · [telehealth architecture and schema](TELEHEALTH_BUILD_PLAN.md) · [future checks](TELEHEALTH_AUDIT_PLAN.md).

**Required scope confirmed by the user's 2026-09-08 follow-up. Proposed implementation; no application changes yet.** Scribe must operate inside the clinician's video workspace. An external Scribe launch link alone is insufficient.

## User experience and button placement

The video stage occupies the left of the desktop workspace. The right pane's first tab is **Scribe & note**, followed by **Patient context** and **Participants**. At tablet widths, those become tabs below/beside the stage without hiding the call controls or patient identity.

The Scribe pane header is sticky. It shows the actual state: `Off`, `Awaiting consent`, `Recording`, `Paused`, `Saving audio`, `Processing`, `Draft ready`, or a specific error. A timer reports captured recording duration separately from call duration. A recording indicator appears in both the clinician and patient view only when capture actually starts.

| Control | Placement | Function and result |
| --- | --- | --- |
| **Start Scribe** | Scribe pane header, primary when off | Binds/loads the Scribe session for this encounter, asks for separate participant consent, then claims capture and starts only when current consent permits |
| **Pause** | Header beside timer while recording | Stops new audio capture, finalizes the permitted acknowledged segment and marks capture paused; video continues |
| **Resume** | Header while paused | Rechecks consent/participants/ownership and starts a new recording segment; never silently resumes after reconnect |
| **Finish recording** | Header beside Pause | Stops capture, flushes permitted chunks, finalizes segment and makes acknowledged sources available; video continues |
| **Finish & review** | Scribe pane when source/draft exists | Stops any active recording and switches the same pane to source/draft review, retaining the call and exact encounter |
| **Template** | Under header | Existing server-owned Scribe/note template choices, preserving template version/provenance |
| **Typed context** | Under template, compact expandable field | Existing encounter-bound context, with explicit save/dirty state; available even when recording is declined |
| **Save context** | Context field footer | Existing context mutation with expected version; no patient chart overwrite |
| **Generate draft** | Above draft area after permitted sources exist | Uses ordered acknowledged sources and saved context; reports processing rather than inventing an immediate note |
| **Review draft** | Draft area header | Existing section editing/source comparison; unsigned text remains editable under existing conflict rules |
| **Apply to encounter** | Review footer | Existing reviewed/approved export path to the canonical note revision; never silently signs |
| **Allow Scribe** / **Continue without Scribe** | Patient in-call consent panel | Records separate recording/processing decision; declining leaves the video visit available |
| **Stop Scribe** | Patient recording indicator menu/panel | Withdraws recording consent, stops capture and invalidates further processing for that epoch; does not withdraw treatment consent or end video |
| **Take over recording** | Staff Participants/Scribe ownership panel | Explicit permitted takeover with current owner shown; revokes old capture epoch before a new owner can capture |

Call microphone/camera/end controls remain in the video stage's bottom bar. Do not place recording beside camera in a way that suggests every call is recorded. Ending the call stops Scribe capture, but note review can continue in the existing encounter afterward.

## Audio capture and media ownership

`ScribeAudioBridge.ts` subscribes to the provider's permitted local microphone and remote participant audio tracks and feeds cloned tracks through a Web Audio `MediaStreamAudioDestinationNode`. Feed that destination into the existing Scribe recorder input contract. Do not independently reopen the microphone when the provider already owns it, capture the screen to obtain audio, or record the device's speaker output.

The provider SDK owns the original tracks. Stopping/pausing Scribe stops its cloned tracks, recorder and audio graph only; it must not stop the call's originals. Conversely, leaving the call stops original tracks and the Scribe bridge. Do not connect the mixed capture graph to audio output and create feedback. Respect local mute and remote subscription changes; system/screen-share audio is excluded by default. Capture no video.

A mixed audio stream supports transcription but does not establish named speaker identity. Display unattributed transcript text unless a supported source provides reliable attribution; never label an utterance as the patient or clinician merely by inference. If later separate-track transcription is implemented, preserve explicit participant/source provenance without inventing attribution.

When a participant joins/leaves or changes consent, pause capture, invalidate the consent/capture epoch and recompute the required participant acknowledgements. No invisible observers or hidden recording. A consenting participant cannot consent for the patient through an arbitrary API parameter.

## Reuse the existing Scribe data model

The existing Scribe encounter links to the existing clinical encounter; recording, recording chunks, source/segments, documents, drafts, sections and exports remain the storage authority. The telehealth schema adds a `scribe_encounter_id`, capture owner/epoch/lease on the visit; telehealth provenance fields on existing Scribe recordings; and a distinct `scribe_recording` purpose in immutable participant-consent evidence. The [build plan](TELEHEALTH_BUILD_PLAN.md) contains exact attributes and constraints.

The existing Scribe consent status remains an enforcement gate. `SyncScribeConsent` must consume the current recording-consent decisions of required participants and establish/invalidate the existing Scribe consent epoch. It must not treat treatment acceptance as recording permission. Upload/finalize/transcribe/generate/export operations recheck both the Scribe contract and current telehealth binding/epoch as applicable.

Use one Scribe capture owner per visit. A server lease is renewed by the authenticated staff owner, with a fenced epoch validated on every chunk. A second tab or clinician cannot capture simultaneously. After ownership loss, permit reconciliation of already-acknowledged source evidence but reject new stale capture writes. Recovery must not depend on browser storage.

## Existing recording limits and longer visits

Source inspection of `apps/api/app/services/clinic/scribe/recording_capture.rb` found a maximum of 30 minutes, 30 MiB and 500 chunks per recording, with a 4-second chunk interval. These are implementation facts at the inspected source, not a new telehealth policy.

Do not silently raise or bypass the limits. Read limits from the server; finalize an acknowledged segment before the applicable threshold and start the next segment in the same Scribe encounter under current consent. Surface any gap during rollover. Pausing also ends the current segment; resume starts a new one rather than assuming a native pause endpoint exists.

Draft generation for the call uses an ordered, deduplicated acknowledged source set. Extend the current single-source generation interface if required: accept allowed source IDs belonging to the same Scribe/clinical encounter, calculate a stable source-set/version digest and freeze it for that generation. Do not concatenate arbitrary browser-provided transcripts. A new segment arriving during generation marks the draft as based on an older source set; it does not overwrite reviewed text automatically.

The current finalize/transcribe workflow does not prove streaming transcription. During the call, show capture and processing honestly, then transcript segments when returned by the backend. Do not simulate a live transcript or promise instant clinical notes.

## Functions and API wiring

Existing operations to reuse:

- `POST /api/clinic/scribe/encounters` and `POST /api/clinic/scribe/encounters/:id/bind_clinical_encounter`.
- `PATCH /api/clinic/scribe/encounters/:id/context`.
- `POST /api/clinic/scribe/encounters/:id/recordings`.
- Existing recording `chunk`, `finalize`, `transcribe`, `interrupt` and cancel routes.
- Encounter `generate`, and draft `sections`, `review`, `approve`, `export` routes.

New telehealth operations, all scoped to `:visitPublicId`:

| Endpoint | Service | Contract |
| --- | --- | --- |
| `GET /api/clinic/telehealth/visits/:visitPublicId/scribe_context` | `ScribeContext` | Authorized exact encounter/session, capture owner/state, actual limits, sources and permitted actions; no other patient's draft |
| `POST /api/clinic/telehealth/visits/:visitPublicId/request_scribe` | `RequestScribe` | Requires Scribe and hosting/participation authority, creates/reuses the one bound session and requests consent in the call UI |
| `POST /api/patient_portal/telehealth/visits/:visitPublicId/scribe_consent` | `RecordScribeConsent` | Patient's own accept/decline/withdraw decision, published policy digest, request key and expected version |
| `POST /api/clinic/telehealth/visits/:visitPublicId/scribe_consent` | `RecordScribeConsent` | Staff participant's own acknowledgement only; cannot impersonate the patient |
| `POST /api/clinic/telehealth/visits/:visitPublicId/start_scribe_capture` | `ClaimScribeCapture` | Current consent and participant set, one capture lease; existing recording create receives validated provenance |
| `POST /api/clinic/telehealth/visits/:visitPublicId/renew_scribe_capture` | `RenewScribeCapture` | Same active owner/epoch; no takeover by renewal |
| `POST /api/clinic/telehealth/visits/:visitPublicId/release_scribe_capture` | `ReleaseScribeCapture` | Stops/pauses capture ownership after acknowledged finalization or explicit interrupted state |
| `POST /api/clinic/telehealth/visits/:visitPublicId/take_over_scribe_capture` | `TakeOverScribeCapture` | Explicit privileged, expected-version transfer; invalidate old epoch and reconcile interrupted segment |

Supporting services: `BindScribeEncounter`, `SyncScribeConsent`, `ValidateCaptureEpoch`, `OrderedScribeSources`. Frontend functions: `attachScribeTracks`, `detachScribeTracks`, `startSegment`, `finishSegment`, `rolloverSegment`, `claimCapture`, `renewCapture`, `releaseCapture`, `reconcileInterruptedCapture`, `saveTypedContext`, `generateFromSourceSet`, `returnToBoundEncounter`.

Refactor the existing Scribe recording provider/controls to accept an authorized stream source without duplicating its upload/retry/context logic. Keep the ordinary microphone-only path compatible. Use one persistent call provider and the existing persistent Scribe owner under the authenticated shell; the panes consume their state rather than creating route-owned recorders.

## End, withdrawal and failure behavior

- **End call:** stop new capture immediately, flush/finalize bounded permitted buffered audio, disconnect media promptly, and retain source/draft review. Audio upload failure cannot keep the patient connected.
- **Upload failure:** show `Audio upload incomplete`, preserve acknowledged server chunks and a bounded in-memory retry buffer while the authenticated page remains open. Do not promise recovery of unuploaded audio after a crash. Do not persist protected audio in local storage/IndexedDB as an unreviewed workaround.
- **Consent withdrawal:** stop the capture graph promptly and reject subsequent chunks/processing according to the existing consent epoch rules. Do not call previously uploaded audio deleted unless the authoritative retention action confirms that outcome.
- **AI/transcription failure:** retain saved context, acknowledged sources and typed note work; offer the existing explicit retry/review path. Video continues.
- **Video disconnect:** stop or pause capture visibly; leave saved notes and source evidence intact. Rejoin requires fresh media authorization and explicit recording resume after consent checks.
- **Host context change/logout/revocation:** stop media and capture, clear transient credentials and protected in-memory UI, invalidate capture authority; do not attach data to the next selected patient.
- **Draft conflict:** retain authored changes and show the actual revision conflict; no automatic overwrite/sign/export.

This integration reuses currently configured Scribe transcription/generation providers and server credentials. It does not authorize a new provider, purchase, live processing or real-data use. Both-party audio, consent revocation, takeover, rollover and exact-encounter export require the future integrated verification below.

## Required additional verification

Prove actual local and remote audio appear in the acknowledged recording and transcription under synthetic identities, without echo or duplicate local tracks. Muting and paused periods must be respected. Confirm stopping recording leaves the call connected. Test patient decline/withdrawal, newly added participant, two tabs, clinician takeover, expired capture lease, stale chunks, segment boundaries, upload loss, provider disconnect and call end during flush.

Prove transcript/draft source-set provenance and that new source segments cannot overwrite reviewed revisions. Check ordinary Scribe still works, video-mode limits roll over without silent truncation, and every export binds the exact encounter. Provider and Scribe live behavior remain unverified until exercised in the isolated implementation environment after freeze.
