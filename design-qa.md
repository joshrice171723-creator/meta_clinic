# Scribe reference-match QA

## Scope

- Route: `http://localhost:3000/clinic/scribe`
- Reference: `C:/Users/joshr/AppData/Local/Temp/codex-clipboard-5fb3101b-76ca-476d-b992-a37726a9f762.png`
- Reference dimensions: 1040 x 695
- Live implementation capture: Codex in-app browser, 1008 x 958

## Visual comparison

- The normal desktop clinic navigation remains visible; Scribe does not introduce a separate collapse control.
- The Scribe session rail uses persistent Today/Past tabs and a visible search field that narrows the server-backed session list.
- The patient header, note tabs, editor canvas, bottom composer, and clinical disclaimer retain the reference hierarchy without the unrelated Me control.
- Create uses a fixed-width dark brown treatment. Transcribe is one fixed-width bright green action with non-wrapping text, a timer, and the six-bar microphone meter directly below it.
- Clinical controls omitted from the reference remain available: template choice, recording consent, source transcript, review, approval, export, retention deletion, and persistent recording controls.
- The implementation uses current API session data; it does not add display fixtures.

## Functional comparison

- Session selection, persistent search, new session, note tabs, context editing and save, template choice, note generation, consent, and recording entry points are wired to their existing handlers.
- The note canvas has one Save action. Consent actions use a compact wrapping row with concise Accept, Decline, Withdraw, and Delete labels.
- The compact meter receives the Web Audio analyser's RMS input level through the persistent recording state and exposes an accessible `role="meter"` value.
- Starting Transcribe in the in-app browser reached the browser microphone-permission phase and updated the header to its green recording state. The host browser did not expose its permission prompt to automation, so live physical-input fluctuation could not be observed in this run.

## Verification

- Focused Scribe and clinic-shell tests: 17 passed.
- Targeted formatting check: passed.
- Repository-wide TypeScript check: blocked by pre-existing errors in `LiveStaffMessagingWorkspace.tsx` at lines 452, 462, and 509; no Scribe errors were reported.
- Exact same-viewport overlay comparison was unavailable because the in-app browser viewport is fixed at 1008 x 958.

## Correction verification

- Live desktop capture at 1140 x 958 confirmed the normal clinic navigation, visible filtering input, stable header controls, one Save action, and polished accepted/not-recorded consent states.
- The responsive header moves its action row below patient identity before control labels can wrap.
- The layout detector returned no findings.

## Result

passed
