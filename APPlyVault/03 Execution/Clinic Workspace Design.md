---
type: design-proposal
status: tracking-board-ui-prototype
updated: 2026-08-31
---
# Clinic Workspace Design

Home: [[00 Home]] · Index: [[01 Table of Contents]] · Current product: [[Clinic Workspace]] · Ownership: [[Software Architecture]] · Requirements: [[Roadmap and Tasks]] · Evidence: [[Source Register]]

## Direction and scope

**Founder input, 2026-08-31 (U-26/U-27):** explore a sleek, accessible clinic interface on a feature branch. Staff will primarily perform patient intake and triage; the physician will mainly create and sign notes/prescriptions. The follow-up confirms staff use both desktop and tablet and requests implementing all three themes for users to choose (D-036). Exact staff roles remain unspecified. This clarifies intended use and cosmetic implementation, not clinical permissions or release approval.

**Layout recommendation, not a selected workflow:** staff-first Today/intake queue, a focused clinician workspace, and inventory as a supporting view within the same clinic shell. These are complementary views, not three separate applications. All three palettes are now selectable in the current clinic UI; sage/ivory with Follow system is the implementation default, not a founder-selected exclusive palette. Preserve the launch/clinic distinction and developer-assigned single clinic; no clinic selector, shared login or new account privileges.

The [interactive design comparison](../../apps/web/design/clinic-workspace-directions.html) contains three layouts and three interchangeable palettes, with system/light/dark appearances. It is an isolated HTML fragment, outside Vite's runtime/public entrypoints. All examples are independently invented; selections only change the preview. It makes no API requests and does not save, sign, prescribe, transmit or alter stock. Navigation chrome is illustrative; comparison controls, example rows, disclosures and review previews are interactive. The preview uses system fonts, not a downloaded font.

The actual React app still provides the synthetic patient directory/append-only draft foundation, staff directory and inventory controls described in [[Clinic Workspace]]. Intake, triage, visits, scheduling, handoffs, clinical signatures and prescriptions are **not implemented**. The initial study/themes did not change the backend or schema; D-039 subsequently adds account-owned cosmetic preferences as described below. Production guards, dependencies, authentication policy and hosting remain unchanged.

## Tracking board and Operations — 2026-08-31

### Tracking board increment — failure-first entry

Founder request, 2026-08-31: make Overview a patient tracking board, separate Operations, simplify Patients/Pharmacy labels, and add viewport-height collapsible navigation with a paper-chart tab. Continue on `feature/clinic-settings-responsive`; Codex owns this local synthetic UI increment. Supporting frontend updates are authorized. Current API has directory records but no visit, arrival, triage or patient-membership contract. Do not infer visits or membership from directory entries or staff login membership. Use a prominently labeled, independently invented example shift to demonstrate the board; durable check-in/clinical workflows remain a separate contract, not an invented live feed.

Failure controls: abbreviations can collide, so retain unique example visit references and selected-row identity; missing triage/membership remains unknown, not normal/nonmember. Waiting time means time in the current waiting stage, not total time in clinic; the example clock is fixed and labeled. Filtered counts cannot masquerade as the whole workload. Membership does not set clinical priority. Operations must retain existing capability filtering. Collapsed navigation must remove hidden links from keyboard reach, retain a visible toggle and provide Escape/focus return on small-screen drawers; sidebar scrolling is independent of long page content. Verify these with synthetic tests and permitted browser checks, without bypassing the prior URL-policy block. No new clinical scores, signs/prescriptions, record persistence, permissions or release authority.

### Delivered presentation and data boundary

D-041/U-29 select the tracking-board direction for this cash-pay, membership-based clinic experience. Overview now displays a clearly labeled **example shift**, not a live workload. A visit row includes first initial / first three surname characters, unique example visit reference, age if known, stage/location, reason/type, triage availability, membership, waiting-stage time versus total elapsed time, and next action/owner. Expanded rows show example vital signs with units, entry author/time and review/handoff context. Abbreviations are not de-identification or sufficient clinical identity confirmation. Patient membership is distinct from staff login membership.

Stage filters, visible-label/visit/room/owner search, arrival/current-wait sorting, expansion and empty-filter recovery work. Member/non-member/not verified and missing triage/vitals/owner states remain explicit. The example clock is fixed at 10:20 AM; examples are not derived from directory rows and never enter the database. There are no actionable clinical buttons or fabricated save acknowledgements. New check-in, membership, visit, triage and handoff records still require a separately reviewed contract under T-13; this is not a completed clinical workflow.

`/clinic/operations` uses the existing authorized overview response for office reorder items, active staff and patient-directory totals plus module shortcuts. Counts are not recast as today's attendance. Patients and Pharmacy lose the EHR prefix; Patients retains its directory/draft behavior with a board-return link. The Operations login return is explicitly allowlisted. Existing themes, backend authorization, production denial and launch styling remain.

The sidebar is viewport-height and independently scrollable, with Sign out at its bottom when space permits. A 44px-wide, chart-tab-style button remains available when collapsed. At 760px and below, navigation starts closed and opens as a drawer with outside content inert, focus containment, Escape and focus return. Collapse is transient page state, not an account preference. Row cards reflow on intermediate widths; phone stage selection replaces the large button grid. The sample-source explanation is a disclosure whose closed summary still says **Example shift / Not live**.

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

**Delivered:** `/clinic/settings` is the initial personal Settings page, reached from clinic navigation or My settings. It displays the signed-in account and provides Color theme / Brightness plus an explicit Save appearance action. Saved preferences are loaded on later page loads/sessions on that account; Follow system resolves separately on each device. There is no live push to other open tabs. Unsaved choices do not change the current theme. Reloading discards unsaved choices and retrieves the acknowledged server state.

`Identity::Preference` stores only palette, mode and revision with a unique user foreign key, allowlist checks and revision constraints. `/api/settings` GET/PATCH/PUT derives the target from the authenticated session; the submitted expected user ID is a mismatch guard, never a target selector. Server-side user-row locking serializes first saves, stale versions return conflict, and the frontend validates response ownership before reporting success. Old browser-local preferences are no longer read/written or automatically assigned to any account; the unused old key is not deleted. No credentials or records move into browser persistence, and no permission/provisioning/password controls were added.

**Containers:** summary labels, quantities and explanatory text now stack vertically within each tile. The grid has four columns above 1150px, two from 601–1150px, and one through 600px; Settings fields also stack through 600px. Sign out uses its own single-column form instead of the inventory form grid, with a nonwrapping button. Theme tokens and launch styling are preserved.

**Evidence and remaining acceptance:** [[Progress Log#2026-08-31 — User settings and responsive container corrections]] records 83 Rails tests / 853 assertions, 42 frontend tests, migration/restore/concurrency and HTTP verification. Fourteen source-level width checks cover 320–1440px, not a rendering engine. Browser access was blocked by URL safety policy during navigation, including a connection-error document; it was not bypassed. No corrected-screen screenshots, live viewport, keyboard, screen-reader or zoom results are claimed. Manually verify 320/390px phones, 768/834px portrait tablets, 959/1024px intermediate/landscape widths and 1280/1440px desktop: summary/control wrapping, page versus contained-table overflow, keyboard focus, all themes, save/reload and account switching. T-43/T-22.2 stay open for that acceptance.

Later integration evidence: [[Progress Log#2026-08-31 — Clinic and test-account integration verification]] records successful Settings save/account-switching and Settings/empty-pharmacy reflow checks at 320–1440px, plus correction of the initial session/CSRF race. All palette/light-dark variants save successfully. The earlier URL-policy limitation above is historical; populated-catalog/theme visual coverage and full assistive-technology/zoom acceptance remain open.

### Original browser-local baseline — superseded by D-039

D-036/T-41 implement **Sage & ivory**, **Mineral blue** and **Warm graphite** in the clinic's Appearance disclosure. Each supports Light, Dark or Follow system; system mode responds to device preference changes. The default is Sage & ivory / Follow system. Native labeled selects expand inline without covering work; the picker stacks on narrow screens and controls target at least 44px height. Active navigation now has a visible marker and `aria-current="page"`; the clinic uses system sans-serif, larger labels and 16px form/action text.

The two allowlisted cosmetic values are remembered under one versioned browser-local key. No account, clinic, record, token or free text is stored. This is not account sync: desktop and tablet can differ, and people sharing a browser share its appearance. Same-origin tabs respond to preference changes. If storage is blocked, the selected appearance still applies for the current page and the UI explains that it could not remember it. Signing out does not erase this non-sensitive preference.

Ownership: `apps/web/src/features/clinic/Appearance.tsx`, `appearancePreferences.ts` and `appearance.css`. All overrides are clinic-scoped, preserving launch styles and existing routes, API contracts, permissions and clinical workflows. No fonts, dependencies, backend preference service or account settings were added. Existing navigation/layout structure remains; the three conceptual workflow layouts are not implemented by this slice.

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

| Token, light appearance | Sage & ivory — default | Mineral blue | Warm graphite |
| --- | --- | --- | --- |
| Canvas | `#F5F7F4` | `#F4F7FA` | `#F7F5F1` |
| Surface | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| Primary text | `#20352F` | `#213747` | `#2A3533` |
| Secondary text | `#52655E` | `#536574` | `#616A64` |
| Action / selected accent | `#1F5C4D` | `#245A81` | `#3E4B49` |
| Selected background | `#E6EFE8` | `#E7EFF6` | `#ECEFE7` |

Sage preserves APPly's existing green while making the clinic feel quieter and lighter. Blue offers a cooler alternative; graphite is deliberately neutral. Color is a preference, not evidence of clinical trust, safety or usability. All three light/dark token sets are implemented; appearance follows the system unless the user explicitly changes it. Status meanings stay consistent across palettes.

Use restrained 6–10px component radii, a small spacing scale (4/8/12/16/24/32px), subtle section separators and limited shadows. Avoid marketing-size headlines, decorative charts, ornamental imagery and icon-only primary actions. Status colors are semantic: amber for a reviewable exception, red reserved for true urgent/error states defined by the approved workflow. Every state also needs text; “unknown” must never look like “normal.”

**Typography:** recommend self-hosted Source Sans 3 for the eventual interface; Adobe describes it as designed for UI environments. Inter is a good more geometric alternative with tabular figures and a slashed zero. Both official sources publish open font licenses (S-86); preserve the chosen license when bundling. No font has been installed. Use 16px body/inputs, 14px minimum secondary UI text, approximately 1.5 body line height and tabular numerals for stock/times. These are project design targets, not a claim that WCAG mandates a particular font or 16px size. Keep any launch-site editorial serif out of dense clinical work.

Calculated token contrast (sRGB WCAG formula; unrounded ratios used for pass decisions):

| Palette | Lowest tested text pairing, light | Lowest tested text pairing, dark | Light primary-button text |
| --- | --- | --- | --- |
| Sage | 5.29:1 | 6.11:1 | 7.79:1 |
| Blue | 5.19:1 | 6.14:1 | 7.36:1 |
| Graphite | 4.81:1 | 6.10:1 | 9.10:1 |

Tested primary/secondary/accent text on canvas, surface and selected backgrounds, plus primary button foreground/background. Amber labels are 6.12:1 light and 8.46:1 dark. Secondary control borders exceed 3:1 against their surfaces. These calculations are token checks, not proof of whole-interface WCAG conformance; rendered states, focus, zoom and assistive technologies still need validation.

## Accessibility and ease-of-access targets

Target WCAG 2.2 AA, with larger touch targets as a product preference. Sources S-82/S-83 were reviewed on 2026-08-31.

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

[[Roadmap and Tasks#Step 5 — Define the first clinic workflow]] now owns the smaller T-13.1–T-13.4 chunks: synthetic script, actual role/workflow walkthrough, reviewed field/state/permission/API contract and interaction prototype/engineering handoff. Current-theme/device acceptance is T-22.2 under [[Roadmap and Tasks#Step 1 — Engineering and release foundation]]. Preserve routes, decimal strings, permissions and the delivered themes; do not repeat their implementation.

Apply [[Working Agreement#Failure-first planning and review]] before accepting the layout: show what happens with the wrong patient/visit, missing intake, absent clinician, unaccepted handoff, stale concurrent edit, duplicate submit, lost save response and expired session. Keep identity, authorship, owner and saved/unsaved/unknown states visible. Each applicable case needs an observable safe result and recovery path in the prototype, labeled simulated rather than tested runtime behavior.

The next candidate runtime path is search/selection → visit context → staff intake → explicit handoff → clinician draft/review, only after its scope and E1/E2 requirements are accepted. Clinical triage rules, signing, prescribing and integrations remain separate later work; no clinical fields, thresholds or e-prescribing service are selected by the breakdown. A successful build or interactive preview is not clinical/security acceptance.

Staff use of both desktop and tablet is confirmed by U-27; specific supported devices, browsers and orientations still need acceptance coverage. All palettes are accepted as user choices; workflow layout and clinical review remain open. MD/SharePoint/governance originals are unavailable; these concepts do not validate or replace them. L-05 and applicable E1–E3/professional gates remain unchanged.
