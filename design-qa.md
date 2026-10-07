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


# Clinic floor reference-match QA — 2026-10-06

final result: passed

## Scope and evidence

The result passes the requested isometric composition inside Meta Clinic. This is local visual and interaction verification, not pixel-identical reproduction or launch acceptance. The Scribe report above is historical and unchanged.

- Route: `http://127.0.0.1:3270/clinic/map`, branch `codex/clinic-2d-extraction`.
- Selected reference: `C:/Users/joshr/AppData/Local/Temp/codex-clipboard-6992108a-27b8-4de2-9bfd-f7a1f5df7dd3.png`.
- Final desktop evidence: `outputs/clinic-map-isometric-final.png` and `outputs/clinic-map-worklist-final.png`.
- Tablet evidence: `outputs/clinic-map-reference-tablet.png`; observed document viewport 833 × 900 CSS pixels. Temporary viewport override was reset for the final desktop capture.
- Source and implementation images were viewed together. Comparison used corresponding content regions and relative panel proportions because the reference is a standalone page and the implementation includes the existing application shell.

## Visual comparison

- Hierarchy: headline, four summary tiles, isometric floor with side inspector, then a full-width room worklist follow the reference. The clinic page is capped at 1100px for a readable centered composition.
- Image: generated transparent raster artwork contains six rooms in two rows of three with pale sage walls, ivory exam couches, slate cushions and beige desks. Interactive labels are native application controls over the artwork. Furniture and geometry are schematic rather than surveyed location data.
- Color and typography: the page uses the existing Green/light clinic theme, sage selection, light paper panels and dotted floor background. The existing workspace shell remains visible. Essential room labels, facts and table contents use readable 14px text; small metadata uses 11–12px. This deliberately improves legibility over the small reference capture.
- Spacing: consistent 16px panel gaps, 20px panel padding and padded table rows preserve the reference's quiet separation. The tablet layout stacks the inspector below the floor and uses two columns of statistics.
- Copy and facts: the reference headline is retained. Room names, visit counts and assignments come from existing authorized records. The reference's fictional occupied/ready/turnover states, staff availability and durations are not fabricated. The inspected local scene had six persisted rooms and one waiting visit without a room assignment.
- Additional product surfaces: waiting and other unplaced visits remain accessible below the worklist. Telehealth resources remain outside the decorative physical floor.

## Iterations and closed findings

1. P1: the initial flat floor cards did not match the requested perspective or palette. Replaced with the isometric asset, local light theme, inspector and worklist.
2. P2: the floor was oversized in the application shell. Added the 1100px content ceiling and balanced the inspector width.
3. P1: ordinary refresh blanked the visible scene. Retained same-context snapshots while refreshing, with an independent original 60-second expiry; context changes, denied reads and errors still clear records.
4. P2: the tablet view compressed the floor and inspector into two columns. Changed the stacking breakpoint to 900px and observed the resulting single-column workspace.
5. P2: room header cells needed table spacing and semantics. Added scoped row headers and consistent 8px × 16px cell padding.

No actionable P0/P1/P2 visual finding remains in the inspected desktop and tablet composition. Minor artwork geometry differs from the source reference; it remains an illustrative floor rather than an exact architectural model.

## Focused verification

- Room clicks and keyboard Enter update the selected-room inspector and selected worklist row.
- Search and the native assignment filter narrow the worklist and disable nonmatching floor labels. Empty filtered results are explicit.
- Same-context manual refresh retained the selected room, filter and visible scene while the refresh control was disabled.
- Browser console error inspection returned no errors.
- Final web typecheck and production build passed. Scoped formatting, diff review, agent-harness documentation verification and vault verification passed.
- No automated tests were added or run. Broader regression, full device coverage, hosted acceptance and deployment were not performed.
