---
type: design-proposal
status: themes-implemented-layouts-proposed
updated: 2026-08-31
---
# Clinic Workspace Design

Home: [[00 Home]] · Index: [[01 Table of Contents]] · Current product: [[Clinic Workspace]] · Ownership: [[Software Architecture]] · Requirements: [[Roadmap and Tasks]] · Evidence: [[Source Register]]

## Direction and scope

**Founder input, 2026-08-31 (U-26/U-27):** explore a sleek, accessible clinic interface on a feature branch. Staff will primarily perform patient intake and triage; the physician will mainly create and sign notes/prescriptions. The follow-up confirms staff use both desktop and tablet and requests implementing all three themes for users to choose (D-036). Exact staff roles remain unspecified. This clarifies intended use and cosmetic implementation, not clinical permissions or release approval.

**Layout recommendation, not a selected workflow:** staff-first Today/intake queue, a focused clinician workspace, and inventory as a supporting view within the same clinic shell. These are complementary views, not three separate applications. All three palettes are now selectable in the current clinic UI; sage/ivory with Follow system is the implementation default, not a founder-selected exclusive palette. Preserve the launch/clinic distinction and developer-assigned single clinic; no clinic selector, shared login or new account privileges.

The [interactive design comparison](../../apps/web/design/clinic-workspace-directions.html) contains three layouts and three interchangeable palettes, with system/light/dark appearances. It is an isolated HTML fragment, outside Vite's runtime/public entrypoints. All examples are independently invented; selections only change the preview. It makes no API requests and does not save, sign, prescribe, transmit or alter stock. Navigation chrome is illustrative; comparison controls, example rows, disclosures and review previews are interactive. The preview uses system fonts, not a downloaded font.

The actual React app still provides the synthetic patient directory/append-only draft foundation, staff directory and inventory controls described in [[Clinic Workspace]]. Intake, triage, visits, scheduling, handoffs, clinical signatures and prescriptions are **not implemented**. No production guard, backend, schema, package dependency, deployment or authentication setting is changed by this design work.

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

1. All three themes and the initial typography/active-navigation/control improvements are implemented under T-41. Review the staff-first shell and responsive navigation with desktop/tablet users before changing the workflow layout. Keep routes, exact decimal strings and permissions intact.
2. Rehearse a synthetic intake-to-clinician handoff with actual staff-role descriptions, then define patient/visit identity, permitted fields, statuses, ownership and API contracts before building those features.
3. Design and implement note draft/review/signing and prescriptions as separately authorized workflows, with versioning, correction history, permission checks, session handling and explicit acceptance criteria. No e-prescribing integration is selected here.
4. Validate supported screens with keyboard-only operation, screen reader, zoom/reflow, interrupted-session, wrong-patient, duplicate-submit, stale-data, missing-intake and failed-transmission scenarios. A successful build is not clinical or security acceptance.

Staff use of both desktop and tablet is confirmed by U-27; specific supported devices, browsers and orientations still need acceptance coverage. All palettes are accepted as user choices; workflow layout and clinical review remain open. MD/SharePoint/governance originals are unavailable; these concepts do not validate or replace them. L-05 and applicable E1–E3/professional gates remain unchanged.
