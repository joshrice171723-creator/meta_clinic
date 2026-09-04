---
type: design-proposal
status: tracking-board-ui-prototype
updated: 2026-09-02
---
# Clinic Workspace Design

Home: [[00 Home]] · Index: [[01 Table of Contents]] · Current visual system: [[Design]] · Current product: [[Clinic Workspace]] · Ownership: [[Software Architecture]] · Requirements: [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) · Evidence: [[Source Register]]

This note preserves clinic design history, workflow proposals, source observations and implementation boundaries. [[Design]] is the canonical forward-looking visual system; where its proposed direction changes current styling, existing behavior remains evidence until a bounded implementation is completed and verified.

## Direction and scope

**Founder input, 2026-08-31 (U-26/U-27), updated by D-055:** explore a sleek, accessible clinic interface on a feature branch. Staff will primarily perform patient intake and triage; the physician will mainly create and sign notes/prescriptions. Staff use both desktop and tablet, and users may select Juniper & porcelain, Cobalt & limestone, Plum & parchment or Saffron & ink. Exact staff roles remain unspecified. This clarifies intended use and cosmetic implementation, not clinical permissions or release approval.

**Layout recommendation, not a selected workflow:** staff-first Today/intake queue, a focused clinician workspace, and inventory as a supporting view within the same clinic shell. These are complementary views, not three separate applications. All four palettes are now selectable in the current clinic UI; Juniper & porcelain with Follow system is the implementation default, not a founder-selected exclusive palette. Preserve the launch/clinic distinction and developer-assigned single clinic; no clinic selector, shared login or new account privileges.

The [interactive design comparison](../../apps/web/design/clinic-workspace-directions.html) contains three layouts and four interchangeable palettes, with system/light/dark appearances. It is an isolated HTML fragment, outside Vite's runtime/public entrypoints. All examples are independently invented; selections only change the preview. It makes no API requests and does not save, sign, prescribe, transmit or alter stock. Navigation chrome is illustrative; comparison controls, example rows, disclosures and review previews are interactive. The preview uses system fonts, not a downloaded font.

The React app provides the synthetic patient directory with registration and patient detail backed by current APIs, read-only legacy drafts, staff/inventory controls, context-driven module navigation, and patient/encounter/observation detail. The current working tree additionally expands registration to demographics, contacts, emergency contacts, communication preferences and social-history fields, and adds a patient update path. `CareFlow.tsx` includes MUI-based scheduling/appointment presentation, patient-bound encounter controls and a structured unsigned SOAP draft workspace. Overview now consumes a capped, permission-scoped open-encounter projection while labeling all missing flow semantics and freshness limits; fixture-only stage, wait, membership and provider-assignment values are not grafted onto those rows. The provider workspace has one identity/visit checkpoint, recorded care and vital context, explicit draft states and a bounded encounter-completion control. These are source observations of uncommitted work, not acceptance of a complete intake or clinical workflow. Arrival, five-stage flow, durable handoffs, clinical signatures and prescriptions are **not implemented in the frontend**; encounter completion does not establish checkout, departure or handoff. The registration and note fields do not by themselves establish complete clinical intake, consent, membership, triage or clinical-content acceptance. The MUI layer is scoped to clinic presentation and does not alter the synthetic-only, authorization or production-denial boundaries.

## Tracking board and Operations — 2026-08-31

**Backend integration planning, 2026-08-31:** [[Clinic Frontend Backend Mapping]] maps the corrected ERD and revision-5 backend handoff onto this existing shell, board, patient/encounter workflow, Operations and personal Settings. It distinguishes current routes from concurrent backend scaffolding, covers all target entities, and identifies missing arrival/flow, typed intake, patient membership and prescribing contracts. Its focused intake/clinician layout and APIs are proposals, not newly implemented workflows or acceptance of the clinical gates. Existing palettes/navigation and the delivered example board remain unchanged.

**Provider-flow implementation follow-up, 2026-09-02:** the board now has a deliberately partial schedule-aware backend source: accessible open encounters plus the practice-local day's scheduled/confirmed appointments without encounters, recorded site/room/appointment facts, a 200-row cap and an explicit truncation flag. Provider hierarchy leads with operational Status and Timing, named View patient/Open chart actions and visible snapshot freshness. Expected / en route, Due now and Late describe schedule timing only, never clinical priority. Waiting Room requires explicit state; ordinary encounter start is not arrival, and the current API still lacks a durable production check-in event. The browser discloses partial/stale state and refreshes on focus. Encounter detail fails closed without the patient ID and verifies the patient/encounter pair. Current-chart navigation opens the bound encounter; previous-chart navigation excludes the current encounter and looks only for signed SOAP history. One patient/visit confirmation precedes the unsigned SOAP workspace. The workspace keeps patient, visit, recorded care and vitals together; removes unsupported quick-exam and personal-macro controls; preserves save-conflict and unknown-outcome no-replay behavior; and exposes an explicit patient-bound `open` to `completed` encounter command. That command does not sign, prescribe, complete checkout, prove departure or accept a handoff. These controls are error-prevention evidence, not an accepted handoff, ambulance-transfer or clinical workflow.

### Care-needs column backend boundary — 2026-09-02

Founder direction accepts at-a-glance indicators for allergies, medications, communication/interpreter needs, accessibility or mobility needs, infection precautions, current-care conditions and review-needed state. The backend represents those categories without converting a missing record into a reassuring negative. A verified none-reported review is distinct from no data, follow-up needed and unable to obtain; encounter-specific precautions cannot be substituted across patients or encounters. Generic disability, behavioral-health, pregnancy, code-status and inferred high-risk-medication icons are not default board indicators because they can expose more than the immediate workflow needs or imply unsupported clinical judgment.

The implemented frontend uses the selected Material UI glyphs in a dedicated Care column with short accessible labels and concern-specific popovers opened by hover, keyboard focus and tap/click. Allergy and medication groups receive count badges when multiple records exist. Founder corrections on 2026-09-02 keep those at-a-glance indicators, move the combined Care summary to hover/focus on the existing SOAP-chart control, and remove universal loading/unavailable/empty-summary indicators from the Care column; activating the chart control still opens or selects the chart. The visible glyph and color are not the only meaning. Popovers include recorded facts, dates and review status while preserving explicit unknown states; they do not infer severity or priority. Linked rows request the patient-and-encounter-bound API summary. The unlinked example shift uses isolated board-only summaries to demonstrate varied concern combinations and deliberate empty Care cells without pretending the examples are API patients. The column participates in the existing sort, move, resize and visibility controls and remains inside the table's narrow-screen scroller.

### Tracking board increment — failure-first entry

Founder request, 2026-08-31: make Overview a patient tracking board, separate Operations, simplify Patients/Pharmacy labels, and add viewport-height collapsible navigation with a paper-chart tab. Continue on `feature/clinic-settings-responsive`; Codex owns this local synthetic UI increment. Supporting frontend updates are authorized. Current API has directory records but no visit, arrival, triage or patient-membership contract. Do not infer visits or membership from directory entries or staff login membership. Use a prominently labeled, independently invented example shift to demonstrate the board; durable check-in/clinical workflows remain a separate contract, not an invented live feed.

Failure controls: abbreviations can collide, so retain unique example visit references and selected-row identity; missing triage/membership remains unknown, not normal/nonmember. Waiting time means time in the current waiting stage, not total time in clinic; the example clock is fixed and labeled. Filtered counts cannot masquerade as the whole workload. Membership does not set clinical priority. Operations must retain existing capability filtering. Collapsed navigation must remove hidden links from keyboard reach, retain a visible toggle and provide Escape/focus return on small-screen drawers; sidebar scrolling is independent of long page content. Verify these with synthetic tests and permitted browser checks, without bypassing the prior URL-policy block. No new clinical scores, signs/prescriptions, record persistence, permissions or release authority.

### Provider assignment interaction — failure-first entry, 2026-09-01

**Current outcome and boundary:** T-48 superseded the original browser-memory prototype on 2026-09-02. The Provider column now shows the current recorded queue assignment. Selecting the provider control or double-clicking an editable Provider cell opens a portal-based modal containing only clinicians eligible at the encounter's assignable site plus an explicit Unassigned choice, so editing cannot resize the table. A permission- and site-scoped Rails operation persists the queue assignment with locking, an expected assignment token, idempotency receipt and required audit. This is queue-assignment evidence only; it does not establish clinical ownership, handoff completion or provider acceptance.

**Failure hypothesis and controls:** an unauthorized or wrong-site clinician could be offered, a stale board could overwrite another assignment, or an uncertain response could lead a retry to post twice. The API therefore projects row-level assignment availability and an assignable-site roster, reauthorizes the selected encounter and clinician at mutation time, compares the expected token under lock and replays the same request key. The browser prevents concurrent submits, retains that key when the outcome is unconfirmed and requires a board reload after a stale-token conflict. The same editor always includes Unassigned, and the cell exposes the full assigned identity to assistive technology.

**Disproof, recovery and exit evidence:** integration coverage must prove permission denial, site eligibility, stale-token conflict, same-provider no-op, explicit unassign, idempotent replay, unknown-outcome reconciliation, audit rollback and the database invariant allowing only one current queue provider. Browser checks cover opening the editor, the bounded roster and stable table geometry. Reload reconciles a stale board or an outcome the user chooses not to retry. Exact results and remaining limits are recorded in [[Progress Log#2026-09-02 — Tracking-board data and resize hardening implemented]]. No source result closes clinical ownership/handoff semantics, T-13's broader accepted workflow or any release gate.

**Historical note:** the 2026-09-01 in-memory prototype was verified only as a presentation experiment and is no longer the current contract. The durable T-48 implementation replaces its reload-reset and `Example only — not saved` behavior. Clinical ownership, provider acceptance and handoff semantics remain unresolved rather than being inferred from persistence.

### Synthetic vital-status diversity — failure-first entry, 2026-09-01

**Outcome and boundary:** vary the independently invented tracking-board vital fixtures so recorded examples include above-normal-limits, within-normal-limits and below-normal-limits display states, with visible and assistive-text indications. Codex owns this local frontend-fixture increment. Status is fixture-authored alongside each reading; the browser must not derive a clinical classification, diagnose, reprioritize, alert an external party or write a record.

**Failure hypothesis and controls:** hard-coded numeric thresholds could be mistaken for accepted clinical decision support, and color-only styling could hide meaning from some users. Each synthetic reading therefore carries an explicit display status, while the UI renders colored highlighting plus a full accessible label and a text-labeled color legend stating that the classifications are synthetic display data rather than clinical guidance. Per founder direction, directional symbols are omitted. Weight remains unassessed because no individual context/range is defined. Missing readings remain `Not recorded` rather than within limits.

**Disproof, recovery and exit evidence:** unit checks must prove the fixtures include all three statuses and that rendered markup exposes their full labels without threshold calculations. Browser checks must confirm distinct values/status colors, the text-labeled legend, non-color accessible names and narrow-width containment. Any inferred threshold, hidden status, clinical-action wording or conversion of missing data into normal rejects the increment; recovery is removal of the display classification while preserving the original synthetic reading. Actual results and unresolved clinical-validation limits belong in [[Progress Log#2026-09-01 — Tracking board density and controls corrected]]; no source result closes T-13 or a professional/release gate.

**Exit record:** the local synthetic board displayed distinct within-limit, above-limit, below-limit and mixed-status patients, with full accessible names on every colored reading and two missing-reading rows still shown as `Not recorded`. The legend and its non-clinical-guidance disclosure remained visible and wrapped below the table at 390 × 844 while the wide table stayed in its own scroller. Source checks confirm the classifications come from fixture fields rather than numeric threshold logic. These are presentation-fixture results only; clinical ranges, validation, response actions and durable observation data remain outside this increment.

### Delivered presentation and data boundary

D-041/U-29 select the tracking-board direction for this cash-pay, membership-based clinic experience. Overview now displays a bounded same-day encounter/appointment projection; in the guarded development fixture set, every patient identity remains independently invented and visibly prefixed `SYN_`. Backend-backed rows use the stored display name, derived age, recorded sex, encounter/appointment/site/room fields, commercial-membership state, observations and current queue-provider assignment. Six recognized development/test fixture encounter/visit-type pairs also carry explicit scenario stage/reason metadata so the local board can exercise every filter without inferring state from encounter status; ordinary rows omit that optional field. Arrival/check-in and clinical priority are not inferred, and missing values remain explicit. Synthetic labels are not de-identification or sufficient clinical identity confirmation. Patient commercial membership is distinct from staff login membership.

Stage filters, column sorting/reordering/resizing, column selection and empty-filter recovery work. Every stage category stays visible with its current count, including zero; selecting a zero-count stage renders no rows and retains recovery controls. The API caps results at 200 and declares truncation; the browser discloses capped, refreshing, stale and failed-refresh states. Practice-local clock formatting, recorded commercial membership, recorded vital values with their units and the assignable provider roster come from the bounded API projection; explicit local seed stages/reasons remain development/test metadata. Provider selection is a durable queue-assignment operation with the failure controls above, not a completed clinical handoff. Chart navigation is separate from Care details; each recorded concern opens a click/tap-activated dialog, and the table becomes labeled visit cards on narrow screens. Care summaries are batched into the board projection. Accepted production check-in, triage capture, clinical ownership/handoff semantics and full workflow validation remain separate T-13 work; this is not a completed clinical workflow.

`/clinic/operations` uses the existing authorized overview response for office reorder items, active staff and patient-directory totals plus module shortcuts. Counts are not recast as today's attendance. Patients and Pharmacy lose the EHR prefix; Patients retains its directory/draft behavior with a board-return link. The Operations login return is explicitly allowlisted. Existing themes, backend authorization, production denial and launch styling remain.

The sidebar is viewport-height and independently scrollable, with Sign out at its bottom when space permits. A 44px-wide, chart-tab-style button remains available when collapsed. At 760px and below, navigation starts closed and opens as a drawer with outside content inert, focus containment, Escape and focus return. Collapse is transient page state, not an account preference. The board uses a Material UI table with a contained horizontal scroll region on narrow screens. Stage filters, the Columns selector and the current partial-projection disclosure remain visible, while the former search, expandable SOAP placeholder and separate sort selector are removed.

Research: S-87's outpatient whiteboard case study supports visit rows with location and workflow fields and iterative local adaptation; S-88 illustrates filtered, documentation-dependent tracking lists. Neither establishes this clinic's workflow or a clinical triage algorithm. S-89 informs disclosure semantics. The chosen columns and membership separation are design inferences plus founder direction, not imported EHR behavior.

Verification and limits: [[Progress Log#2026-08-31 — Tracking board, Operations and chart-tab navigation]] records frontend tests and current browser checks. These do not close T-13, T-43's separate Settings/pharmacy matrix, T-22.2's full accessibility acceptance, or any clinical/security release gate.

## What the current frontend shows

Initial observations from `apps/web` source and the existing local synthetic clinic overview on 2026-08-31, before the theme implementation below. This is a bounded UI inspection, not a full accessibility or security audit; proposed workflow/layout changes remain open.

| Observation | Design response |
| --- | --- |
| Strong green identity and distinct clinic shell already exist | Retain recognizable green, use a lighter neutral navigation surface and reserve emphasis for selection/actions |
| Overview emphasizes counts and explanatory cards | Make the day's work and its next action primary; only show counts that describe a useful worklist |
| Many clinic labels/table headings are 9–12px; token names suggest DM Sans/Instrument Serif but actual font stacks use Arial/Georgia | Adopt honest font tokens; propose 16px body/inputs and 14px secondary labels; keep operational screens sans-serif |
| Sidebar links do not set an active-page marker although CSS supports one | Add visible active state plus `aria-current="page"` in future runtime implementation |
| Mobile sidebar stacks navigation, launch links and sign-out ahead of work | Use compact responsive navigation; keep current clinic, account and sign-out accessible without dominating the screen |
| Patient directory has no search and shows creation alongside browsing | Separate finding/selecting a patient from deliberate creation; add scoped search with safe result disambiguation in a later accepted slice |
| Pharmacy table is at least 770px wide with small text | Prioritize identity, location, exact quantity/unit, availability and actionable exceptions; place detailed provenance in a selected-item view |
| App already has a skip link, labeled native inputs, loading/error states and duplicate-submit protection | Preserve these; test their complete keyboard, focus, error and session-expiry behavior rather than replacing them |
| Launch navigation is repeated in several places | Keep one clearly labeled secondary workspace link; launch work should not compete with intake |

Primary source locations: `apps/web/src/features/clinic/Workspace.tsx`, `Patients.tsx`, `Staff.tsx`; `src/features/inventory/Catalog.tsx`; `src/features/identity/Login.tsx`; `src/shared/ui.tsx`; `public/clinic.css` and `shared.css`. Actual source paths/ownership remain governed by [[Software Architecture]].

## Implemented appearance preferences — 2026-08-31

### Account settings and responsive correction — local implementation

The founder requested a feature branch, correction of squeezed pharmacy summaries/sidebar actions, testing across device sizes and moving themes into a Settings page tied to the signed-in user (D-039/U-28). Owner: Codex for this local synthetic increment on `feature/clinic-settings-responsive`; current account/clinic authorization, all themes and production denial remain. T-43 records implementation and pending live-browser acceptance. No clinical workflow, hosting or account-management expansion is included.

Failure-first entry: browser-shared preferences could leak into the next account; narrow containers can make controls unreadable; expired sessions, conflicting tabs or lost save responses could falsely report completion. Use server-owned, allowlisted preferences resolved only from the current session, explicit save/error/conflict states and no automatic import of the old browser preference. Verify isolated synthetic accounts, validation/authorization/CSRF and repeated/stale writes, plus desktop/tablet/phone overflow, control wrapping and keyboard interaction. Keep failed edits visibly unsaved and offer reloading the saved settings.

**Delivered:** `/clinic/settings` is the initial personal Settings page, reached from clinic navigation or My settings. It displays the signed-in account and a selectable four-palette theme group with a neighboring Dark mode switch; each changed selection saves immediately after the server accepts it, so there is no ordinary Save appearance action. The palette cards show resolved light/dark samples, mark the selected theme in text and remain keyboard-operable; the local-only Development view stays visually subordinate. Saved preferences are loaded on later page loads/sessions on that account; Follow system remains available in the account preference contract and resolves separately on each device. There is no live push to other open tabs. A failed change leaves the saved appearance unchanged and exposes a retry action; reloading retrieves the acknowledged server state.

`Identity::Preference` stores only palette, mode and revision with a unique user foreign key, allowlist checks and revision constraints. `/api/settings` GET/PATCH/PUT derives the target from the authenticated session; the submitted expected user ID is a mismatch guard, never a target selector. Server-side user-row locking serializes first saves, stale versions return conflict, and the frontend validates response ownership before reporting success. Old browser-local preferences are no longer read/written or automatically assigned to any account; the unused old key is not deleted. No credentials or records move into browser persistence, and no permission/provisioning/password controls were added.

**Containers:** summary labels, quantities and explanatory text now stack vertically within each tile. The grid has four columns above 1150px, two from 601–1150px, and one through 600px; Settings fields also stack through 600px. Sign out uses its own single-column form instead of the inventory form grid, with a nonwrapping button. Theme tokens and launch styling are preserved.

**Evidence and remaining acceptance:** [[Progress Log#2026-08-31 — User settings and responsive container corrections]] records 83 Rails tests / 853 assertions, 42 frontend tests, migration/restore/concurrency and HTTP verification. Fourteen source-level width checks cover 320–1440px, not a rendering engine. Browser access was blocked by URL safety policy during navigation, including a connection-error document; it was not bypassed. No corrected-screen screenshots, live viewport, keyboard, screen-reader or zoom results are claimed. Manually verify 320/390px phones, 768/834px portrait tablets, 959/1024px intermediate/landscape widths and 1280/1440px desktop: summary/control wrapping, page versus contained-table overflow, keyboard focus, all themes, save/reload and account switching. T-43/T-22.2 stay open for that acceptance.

Later integration evidence: [[Progress Log#2026-08-31 — Clinic and test-account integration verification]] records successful Settings save/account-switching and Settings/empty-pharmacy reflow checks at 320–1440px, plus correction of the initial session/CSRF race. All palette/light-dark variants save successfully. The earlier URL-policy limitation above is historical; populated-catalog/theme visual coverage and full assistive-technology/zoom acceptance remain open.

### Original browser-local baseline — superseded by D-039

D-036/T-41 originally implemented three palettes; D-055 replaces them with **Juniper & porcelain**, **Cobalt & limestone**, **Plum & parchment** and **Saffron & ink**. Each supports Light, Dark or Follow system; system mode responds to device preference changes. The default is Juniper & porcelain / Follow system. Native labeled selects expand inline without covering work; the picker stacks on narrow screens and controls target at least 44px height. Active navigation now has a visible marker and `aria-current="page"`; the clinic uses system sans-serif, larger labels and 16px form/action text.

The two allowlisted cosmetic values are account-scoped server preferences, not browser-local storage. No account, clinic, record, token or free text is retained in browser persistence. Desktop and tablet retrieve the same saved selection for that account while Follow system still resolves from each device. A save failure does not silently retry or report success.

Ownership: `apps/web/src/features/clinic/Appearance.tsx`, `appearancePreferences.ts`, `appearance.css` and `features/identity/Settings.tsx`, with the allowlisted account-preference API owned by Identity. All overrides are clinic-scoped, preserving launch styles and existing routes, API contracts, permissions and clinical workflows. No fonts or dependencies were added. Existing navigation/layout structure remains; the three conceptual workflow layouts are not implemented by this slice.

Verification covers allowlist/persistence failures, system and storage listeners, rendered native controls, permission-filtered active navigation, loading-state isolation, six token sets and static responsive/style contracts. See [[Progress Log#2026-08-31 — Selectable clinic themes implemented]] for actual checks. Rendered contrast, complete keyboard/screen-reader behavior, device interaction and zoom/reflow remain T-22 acceptance work; token math is not full WCAG conformance.

## Staff-first workflow hypothesis

AHRQ recommends examining both clinical and administrative workflows when introducing ambulatory health IT. The following sequence is our design inference from that guidance plus the founder's stated users, **not a map of Kevin's unreviewed clinic workflow**. Confirm it through a wholly synthetic staff/clinician walkthrough. See S-84/S-85.

| Stage | Intended experience | Handoff or safety boundary |
| --- | --- | --- |
| Prepare / arrival | Find the correct person and visit; distinguish scheduled, walk-in and return work if those pathways are approved | Do not automatically create a new patient when search has no result; identity confirmation is explicit |
| Intake | One selected patient/visit, short grouped fields, visible completion and explicit save state | Separate administrative intake from clinical assessment; incomplete and unknown are visible states |
| Triage | Authorized staff record the approved assessment and any escalation; expose who owns the next action | Staff job title alone must not grant triage authority. No invented clinical scoring, thresholds or automatic reassurance; queue order is not acuity |
| Clinician handoff | Persistent identity, intake author/time/version, completeness and unresolved issues beside clinician work | Staff mark ready; clinician accepts responsibility. Opening a record is not completion or acceptance |
| Note / prescription | Clinician reviews intake, creates a note and any prescription, then reviews each explicitly | Staff-entered context does not silently become clinician-authored text. Note signing and prescribing are separate authorized actions |
| Checkout / follow-up | Responsible owner and outstanding work remain visible after the encounter | Signing a note does not automatically complete referrals, results, prescriptions or follow-up |

The exact intake fields, emergency escalation pathway, triage roles, note structure and prescribing permissions require responsible clinical/professional review. No patient examples are needed for discovery. Scheduling, reminders, billing and results integrations are separate scope choices, not implied implementation commitments.

## Layout comparison

| Direction | Structure | Best fit / tradeoff |
| --- | --- | --- |
| A — Staff intake, recommended default | Intake queue plus selected work item; visible stage, responsible person and next action | Keeps staff oriented across interruptions. Needs scoped queue/visit/handoff data beyond today's API |
| B — Clinician focus | Patient/visit list beside persistent identity, staff intake context and note/prescription review | Reduces page switching during focused work. Requires careful unsaved-change, stale-data and wrong-patient protection; collapses to sequential sections on small screens |
| C — Operations desk | Exception-oriented stock list with selected lot/location, physical and available balances | Useful secondary workspace for supplies/pharmacy. Never becomes a second clinic shell or competes with intake as the default |

A and B should ultimately share the same encounter context with authorized role-appropriate actions. Role-based landing preferences are a proposal; UI visibility never replaces Rails authorization. Retain team access to other permitted work. Do not infer professional authority from the labels “staff” or “physician.”

The preview deliberately omits a functioning note editor, clinical fields and sign/send actions. The next design increment should explore the actual staff intake form and clinician composer, not treat placeholder panels as completed workflows.

## Visual system

| Token, light appearance | Juniper & porcelain — default | Cobalt & limestone | Plum & parchment | Saffron & ink |
| --- | --- | --- | --- | --- |
| Canvas | `#F7F9F8` | `#F8F8F6` | `#FCF9FC` | `#FFFAF1` |
| Surface | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| Primary text | `#182B27` | `#18233C` | `#2C1C3B` | `#302614` |
| Secondary text | `#52635E` | `#526078` | `#665675` | `#655A42` |
| Action / selected accent | `#006B5F` | `#1D4ED8` | `#6D28D9` | `#7C4A03` |
| Selected background | `#DDF3EC` | `#E5EDFF` | `#F0E8FF` | `#FFF0C9` |

Juniper preserves a calm green identity; Cobalt provides decisive, highly scannable contrast; Plum brings a composed editorial warmth; and Saffron is a clear, optimistic alternative. Color is a preference, not evidence of clinical trust, safety or usability. All four light/dark token sets are implemented; appearance follows the system unless the user explicitly changes it. Status meanings stay consistent across palettes.

Use restrained 6–10px component radii, a small spacing scale (4/8/12/16/24/32px), subtle section separators and limited shadows. Avoid marketing-size headlines, decorative charts, ornamental imagery and icon-only primary actions. Status colors are semantic: amber for a reviewable exception, red reserved for true urgent/error states defined by the approved workflow. Every state also needs text; “unknown” must never look like “normal.”

**Typography:** recommend self-hosted Source Sans 3 for the eventual interface; Adobe describes it as designed for UI environments. Inter is a good more geometric alternative with tabular figures and a slashed zero. Both official sources publish open font licenses (S-86); preserve the chosen license when bundling. No font has been installed. Use 16px body/inputs, 14px minimum secondary UI text, approximately 1.5 body line height and tabular numerals for stock/times. These are project design targets, not a claim that WCAG mandates a particular font or 16px size. Keep any launch-site editorial serif out of dense clinical work.

Calculated token contrast (sRGB WCAG formula; unrounded ratios used for pass decisions):

| Palette | Lowest tested text pairing, light | Lowest tested text pairing, dark | Light primary-button text |
| --- | --- | --- | --- |
| Juniper | 4.56:1 | 5.17:1 | 6.43:1 |
| Cobalt | 4.69:1 | 5.15:1 | 6.70:1 |
| Plum | 4.73:1 | 5.37:1 | 7.10:1 |
| Saffron | 4.57:1 | 5.41:1 | 7.40:1 |

Tested primary/secondary/accent text on canvas, surface and selected backgrounds, plus primary button foreground/background. Amber labels are 6.12:1 light and 8.46:1 dark. Secondary control borders exceed 3:1 against their surfaces. These calculations are token checks, not proof of whole-interface WCAG conformance; rendered states, focus, zoom and assistive technologies still need validation.

## Accessibility and ease-of-access targets

Target WCAG 2.2 AA, with larger touch targets as a product preference. Sources S-92/S-93 were reviewed on 2026-08-31.

- Normal text at least 4.5:1; large text at least 3:1. Target 44px interactive heights where practical; WCAG 2.2 AA's target-size criterion is 24 by 24 CSS pixels with defined exceptions, not a universal 44px requirement.
- Logical keyboard order, meaningful headings/landmarks, a working skip link, visible unobscured focus and no hover-only information. In implementation, drawers/dialogs need intentional focus entry/return and Escape behavior.
- Reflow at 320 CSS pixels; check 200% text zoom and 400% browser zoom separately. Wide clinical tables may need a contained two-dimensional layout, but ordinary forms/worklists should stack rather than shrink text.
- Visible labels, correct autocomplete, password-manager/paste support, clear login errors and an accessible password-visibility control. Keep explicit login and clinic-return routing; do not add automatic login, self-registration or a clinic picker.
- Keep sign-out/session state easy to find. MFA, recovery and shared-device policy require their own approved design; a staff-first screen does not imply shared accounts.
- Distinguish saved draft, unsaved changes, saving, failed save and stale server data. Do not show fake autosave or silently replay a write after expiry. Warn before changing patients with an unsaved draft; preserving data across expiry requires a reviewed secure strategy, not browser record storage.
- Show errors beside fields and in a linked summary; retain non-sensitive input as appropriate, identify the correction and announce status without announcing every keystroke. Use plain labels such as “Patients,” “Pharmacy,” “Office stock” and “Team.”
- Clinical identity stays visible in the writing/review context. Missing or unreviewed information must remain explicit. A future prescription should distinguish draft, authorized, transmitted, failed and pharmacy acknowledgement, without treating any as equivalent.

## Safe implementation sequence — not a new backlog

T-13 remains the requirements owner; T-22 retains browser/accessibility acceptance. T-41 records the completed cosmetic slice only; no requirements or professional gate closes from these designs.

[Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap) now owns the smaller T-13.1–T-13.4 chunks: synthetic script, actual role/workflow walkthrough, reviewed field/state/permission/API contract and interaction prototype/engineering handoff. Current-theme/device acceptance is T-22.2 under [Shortcut Roadmap](https://app.shortcut.com/apply-1/roadmap). Preserve routes, decimal strings, permissions and the delivered themes; do not repeat their implementation.

Apply [[Working Agreement#Failure-first planning and review]] before accepting the layout: show what happens with the wrong patient/visit, missing intake, absent clinician, unaccepted handoff, stale concurrent edit, duplicate submit, lost save response and expired session. Keep identity, authorship, owner and saved/unsaved/unknown states visible. Each applicable case needs an observable safe result and recovery path in the prototype, labeled simulated rather than tested runtime behavior.

The next candidate runtime path is search/selection → visit context → staff intake → explicit handoff → clinician draft/review, only after its scope and E1/E2 requirements are accepted. Clinical triage rules, signing, prescribing and integrations remain separate later work; no clinical fields, thresholds or e-prescribing service are selected by the breakdown. A successful build or interactive preview is not clinical/security acceptance.

Staff use of both desktop and tablet is confirmed by U-27; specific supported devices, browsers and orientations still need acceptance coverage. All palettes are accepted as user choices; workflow layout and clinical review remain open. MD/SharePoint/governance originals are unavailable; these concepts do not validate or replace them. L-05 and applicable E1–E3/professional gates remain unchanged.
