# Scribe reference-match QA

## Scope

- Route: `http://localhost:3000/clinic/scribe`
- Reference: `C:/Users/joshr/AppData/Local/Temp/codex-clipboard-5fb3101b-76ca-476d-b992-a37726a9f762.png`
- Reference dimensions: 1040 x 695
- Live implementation capture: Codex in-app browser, 1008 x 958

## Visual comparison

- The desktop clinic navigation collapses to a narrow, recoverable menu rail.
- The Scribe session rail, period tabs, circular initials, compact rows, selected-session tint, patient header, note tabs, editor canvas, bottom composer, and clinical disclaimer match the reference hierarchy and placement.
- Create uses the reference dark brown treatment. Transcribe uses a bright green split-button treatment with a timer and six-bar microphone meter directly below it.
- Clinical controls omitted from the reference remain available: template choice, recording consent, source transcript, review, approval, export, retention deletion, and persistent recording controls.
- The implementation uses current API session data; it does not add display fixtures.

## Functional comparison

- Session selection, search toggle, refresh, new session, note tabs, context editing and save, template choice, note generation, consent, and recording entry points are wired to their existing handlers.
- The compact meter receives the Web Audio analyser's RMS input level through the persistent recording state and exposes an accessible `role="meter"` value.
- Starting Transcribe in the in-app browser reached the browser microphone-permission phase and updated the header to its green recording state. The host browser did not expose its permission prompt to automation, so live physical-input fluctuation could not be observed in this run.

## Verification

- Focused Scribe and clinic-shell tests: 17 passed.
- Targeted formatting check: passed.
- Repository-wide TypeScript check: blocked by pre-existing errors in `LiveStaffMessagingWorkspace.tsx` at lines 452, 462, and 509; no Scribe errors were reported.
- Exact same-viewport overlay comparison was unavailable because the in-app browser viewport is fixed at 1008 x 958.

## Result

blocked
