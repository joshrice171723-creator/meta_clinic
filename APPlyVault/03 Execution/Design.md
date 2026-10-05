---
type: design-system
status: active
updated: 2026-10-05
---
# Clinic Software Design

Home: [[00 Home]] · Product truth: [PRODUCT.md](../../PRODUCT.md) · Current implementation: [[Clinic Workspace]] · Design history: [[Clinic Workspace Design]] · Tasks: [Meta Clinic Implementation Tracker](Meta%20Clinic%20Implementation%20Tracker.md) · Decisions: [[Decisions]]

## Scope and authority

This is the canonical visual and interaction-system direction for the **clinic software product**. It does not govern the separate mentoring and guidance portal. The portal may retain its warmer editorial identity and mobile-first reading behavior; clinic styles must not be imported into it merely because both products currently live in `apps/web`.

The tracking board is the first design-defining clinic surface. Existing clinic code, palettes and prototypes are evidence, not permanent authority. [[Clinic Workspace Design]] retains implementation history, workflow proposals and safety boundaries; this note owns the forward-looking visual system. Product behavior, permissions, clinical meaning and release status remain governed by their existing notes and server contracts.

**Status:** the founder confirmed this direction and selected the Continuous Ledger composition on 2026-09-02. This direction authorizes bounded local design and implementation, not deployment, real-data use, clinical acceptance or silent loss of provider-flow behavior.

## Direction — Clinical Wayfinding Ledger

The clinic should feel like a calm, high-trust operational ledger. Each row is a recorded location-and-time fact pattern with a deliberate next action, not an alert, score or clinical-priority ranking.

**Approved composition:** Continuous Ledger, recorded at `.impeccable/mocks/tracking-board-a-continuous-ledger.png` with its generation prompt and measured implementation specification. The founder also authorized use and modification of the repository's existing Material UI components and icons where useful. MUI remains an implementation tool: clinic tokens, semantics and accessibility govern its appearance rather than its default elevation, shape or status conventions.

The visual system draws from healthcare service interfaces, public-sector casework and physical wayfinding systems: plain language, limited signals, predictable reading order, persistent context and very little ornament. It should remain recognizable across the tracking board, patient record, schedule, inventory and settings without turning every surface into a dashboard of cards.

### Product mechanism

> Show what is recorded, where the work sits operationally, how fresh that information is and what authorized action is available next.

Visual prominence may communicate operational state, data freshness or record review explicitly requested by the displayed workflow/data state. It must not imply clinical acuity, diagnosis, urgency or authority unless an approved contract supplies that meaning.

### First-viewport thesis

At desktop and tablet widths, the first viewport should show:

1. the current clinic and Tracking Board location;
2. a modest page title and plain-language purpose;
3. visible freshness, partial/capped/stale state when applicable;
4. stage filters with counts;
5. the first useful rows, led by patient identity, operational status/timing and the next authorized operational action.

No hero panel, decorative illustration, oversized metric cards or promotional copy belongs above the board.

## Design principles

1. **State before style.** A user should understand recorded, unknown, stale, partial, failed and unsaved states before noticing the theme.
2. **One visual meaning per signal.** Interaction accent, selection, operational attention, system error and confirmed success use distinct roles.
3. **Operational, not diagnostic.** Timing, queue position, membership, care indicators and fixture-authored vital labels do not rank clinical importance.
4. **Reading order is workflow.** Patient → status/timing → location/owner → reason/context → next action should remain stable.
5. **Dense, never cramped.** Desktop and tablet may carry substantial information, but not by shrinking essential text or hiding state behind hover.
6. **Quiet by default.** Borders, spacing and alignment carry structure. Color and elevation appear only when they add meaning.
7. **Truthful recovery.** Errors retain context and offer a safe next step; a failed surface must not collapse into a blank page.

## Color system

### Default appearance

On 2026-10-05, Joshua requested Graphite and blue in dark mode as the default for everyone. Accounts without a saved personal appearance use this default; explicit saved choices remain available. The demo frame, toolbar, account menu and clinic/location selector share the active workspace theme. This supersedes the earlier sage/light default direction below; semantic colors, contrast and workflow hierarchy still apply across palettes.

### Light appearance reference

| Role | Token | Direction |
| --- | --- | --- |
| Canvas | `--clinic-background` | `#F5F7F4`; quiet cool off-white |
| Working surface | `--clinic-surface` | `#FFFFFF` |
| Primary text | `--clinic-text` | `#20352F`; deep slate-green |
| Secondary text | `--clinic-muted` | `#52655E`; never lighter for essential copy |
| Interaction / selection | `--clinic-accent` | `#1F5C4D`; links, selected controls and primary actions only |
| Selected surface | `--clinic-soft` | `#E6EFE8`; pair with text and border, never use alone |
| Divider | `--clinic-border` | `#CCD8D1` |
| Control boundary | `--clinic-control` | `#71847A` |
| Operational attention | `--clinic-warning` / background | `#8A4B12` / `#FFF2D9` |
| System or validation error | `--clinic-error` / background | `#9E313D` / `#FCEBED` |
| Confirmed success | `--clinic-success` / background | `#275D35` / `#E8F2E9` |

Sage/light remains a supported reference. Existing palette choices under D-036/D-039 share the same component behavior and semantic rules. Do not add palette-specific component behavior.

### Semantic rules

- Green does not mean “clinically normal.” Reserve success for a confirmed system or workflow outcome.
- Amber means an operational condition needs review; it does not establish acuity.
- Red is reserved for a defined error or approved urgent condition, never merely “above a fixture range.”
- Missing, unknown, unavailable and not reviewed use explicit neutral text and structure. They must not look successful.
- Fixture-authored vital range labels use restrained neutral treatments and full text. Do not create a red/green priority ladder without an approved clinical contract.
- Do not use success green for `Within normal limits` on the tracking board unless the state is visibly and textually framed as fixture-authored display data; the default treatment is neutral.
- Do not combine `Late`, amber attention and `Above normal limits` into one escalating treatment. Schedule timing and fixture-authored vital display state remain visually independent.
- Every color-coded state includes a visible word or accessible text equivalent.

## Typography

Use an honest system sans-serif stack initially. Do not add a font dependency merely to create brand character. If Source Sans 3 is later self-hosted, preserve its license and re-run complete rendering and metric checks.

| Use | Size / line height | Weight | Notes |
| --- | --- | --- | --- |
| Page title | 28–36px / 1.15 | 650 | Sentence case; no marketing scale |
| Section title | 20–24px / 1.25 | 650 | Clear grouping, not card decoration |
| Component title | 16–18px / 1.35 | 650 | Use sparingly |
| Primary UI/body | 16px / 1.5 | 400–500 | Forms, patient identity, primary actions |
| Secondary UI | 14px / 1.45 | 400–600 | Table headers, metadata, status details |
| Tertiary metadata | 12–13px / 1.4 | 500 | Never required to understand or act |

- Do not use 9–11px functional copy.
- Use tabular numerals for clock times, durations, quantities and identifiers that users compare vertically.
- Use uppercase and added letter spacing only for short, nonessential category labels.
- Use the portal's editorial serif nowhere in clinic operations.
- Prefer direct labels over icon-only primary actions or unexplained abbreviations.

## Spacing, shape and elevation

- Base unit: 4px. Primary rhythm: 8, 12, 16, 24 and 32px.
- Table cells: approximately 12px vertical and 12–16px horizontal padding at standard density; compact density is an explicit user mode, not the default.
- Controls: 44px minimum target where practical; dense table utilities may use smaller visible glyphs inside a 44px hit area.
- Radii: 4–6px controls, 8px containers, 10px maximum for dialogs. Avoid pills except true tags or compact segmented choices.
- Borders: 1px dividers and grouped boundaries. Prefer alignment and whitespace over nested boxes.
- Shadows: none on ordinary cards, tables or navigation. A restrained dialog/popover shadow is allowed to communicate layering.
- Motion: no decorative lift, bounce or animated status. Use short transitions only to explain opening, selection or layout change and honor reduced motion.

## Clinic shell

### Desktop

- Use a stable 220–240px navigation rail with the current clinic and active section clearly visible.
- Group destinations by work domain rather than presenting one undifferentiated list: Care, Operations, Inventory, People and Account.
- Keep sign out and cross-product exits visually secondary.
- Use a compact top utility bar for account, clinic context and global state; raw fixture/license strings should not dominate it.
- Retain the active-page marker, clinic context, sign out and existing focus-return behavior while simplifying navigation chrome.

### Tablet

- Treat 768, 834 and 1024 CSS-pixel widths as required clinic viewports.
- Preserve a real table with contained horizontal scrolling when that best supports comparison. Do not transform the board into cards merely to imitate a phone layout.
- Keep Patient and Status/Timing visible or sticky where technically and accessibly sound.
- Use a conventional menu button or compact collapsed rail. Replace the tall paper-chart pull tab and hard shadow at tablet widths without removing the only navigation control or weakening its current focus-return behavior.
- Dialogs and popovers must fit the viewport, expose their title and close action, and return focus correctly.

### Phone fallback

Clinic phone use is not a primary design target. Preserve a safe, operable fallback without letting phone constraints drive desktop/tablet density or information architecture. The mentoring portal remains responsible for full mobile-responsive quality.

## Tracking board anatomy

1. **Context header:** modest title, one-sentence purpose and explicit freshness state.
2. **Data boundary:** show partial, capped, stale or failed state only when applicable; concise wording with details available deliberately.
3. **Stage filter:** stable stage vocabulary, visible counts including zero and a clear reset path.
4. **Board:** one dominant surface rather than a set of patient cards at primary widths.
5. **Row hierarchy:**
   - patient identity and record reference;
   - operational status and timing;
   - location and ownership state: distinguish a durable server-recorded owner, a transient example-only assignment and unassigned/not recorded;
   - reason and recorded care/vitals;
   - explicit next action such as View patient or Open chart.
6. **Footer guidance:** only the minimum explanation needed to prevent a likely misreading.

### Table behavior

- Sticky headers are preferred for long boards.
- A sticky Patient column may be used at tablet widths after keyboard, zoom and screen-reader verification. Sticky treatment supports comparison and navigation; it must not imply ranking or make Status/Timing look clinically prioritized.
- Sorting, column movement and resizing require discoverable keyboard equivalents; drag cannot be the only explanation.
- Status tags are noninteractive. Filters and buttons must look interactive.
- Zebra shading should be extremely subtle or omitted; hover and focus must be clearer than alternating rows.
- Empty, loading, stale, capped and failed states retain the page header, filters where useful and a safe recovery action.

## Component language

### Buttons and links

- One filled primary action per local task region.
- Secondary actions use outlined or text treatment; destructive actions never share the primary color.
- Link styling remains visibly link-like. Do not use decorative arrows on every navigation target.
- Icon-only actions require an accessible name and are reserved for conventional compact utilities.

### Tags and statuses

- Use sentence-case adjectives or short state phrases.
- Use theme surfaces, readable foreground text and a quiet boundary.
- Do not style a status tag like a button.
- Pair timing with an explicit qualifier: `8 min late · not checked in`, not a floating red `8`.

### Cards and panels

- Cards represent a meaningful grouped object or task, not every metric or paragraph.
- Routine totals stay visually quiet. Action-required items may receive one semantic attention treatment.
- Avoid nested cards, circular icon wells, decorative avatars and equal-weight dashboard tiles.

### Forms

- Labels remain visible above controls.
- Group fields by the user's task and reveal genuinely optional complexity progressively.
- Distinguish unsaved, saving, saved, failed and outcome-unknown states.
- Do not store protected record content in browser persistence to preserve a draft.

## Accessibility and resilience

- Target WCAG 2.2 AA; automated contrast or DOM checks are necessary but not sufficient evidence.
- Essential text meets 4.5:1 contrast and does not drop below 14px without a documented reason.
- Focus remains visible and unobscured in every palette and at all required viewports.
- Do not hide information required for action behind hover. Hover may preview details that are also reachable through focus or activation.
- Support keyboard sorting, column controls, dialogs, navigation and chart actions with predictable focus return.
- Verify 200% text zoom, 400% browser zoom, forced colors and reduced motion.
- A route/component error keeps the clinic shell, states the problem in plain language and offers Retry plus a safe destination.
- Never present absent data as normal, no concern or completed.

## Explicit exclusions

- No marketing-style hero, editorial serif, decorative illustration or mood photography in clinic operations.
- No glass, gradients, glowing status, floating pill navigation, playful animation or dashboard decoration.
- No visual risk score, triage order or acuity signal without an approved clinical contract.
- No clinic-wide mobile-first redesign.
- No portal restyling as a side effect of clinic work.
- No new font, icon or design-system dependency without a separately reviewed need.

## Implementation plan

Story status remains in [Meta Clinic Implementation Tracker](Meta%20Clinic%20Implementation%20Tracker.md). Implement this system in small reviewable slices:

1. **Boundary lock:** finish or reconcile the active provider-flow diff before editing its board markup, mapping or tests. Protected current files are `apps/web/src/features/clinic/TrackingBoardPage.tsx`, `trackingBoard.css`, `trackingBoardApi.ts`, `trackingBoardData.ts`, `apps/web/src/api/contracts.ts`, the API tracking-board controller/serializer/test, `provider-flow.test.tsx`, `tracking-board.test.tsx`, `clinic-navigation.test.ts`, the already-dirty clinic vault notes and `apps/api/db/structure.sql`.
2. **Foundation tokens:** codify clinic-only type, spacing, shape, focus and semantic-color roles without changing API or workflow behavior. The initial safe ownership set is `appearancePreferences.ts`, `Appearance.tsx`, `appearance.css` and narrowly scoped new clinic token or shell files; recheck the worktree before assigning them.
3. **Desktop/tablet shell:** simplify navigation/chrome, remove the decorative pull tab at tablet widths and verify current-location/focus behavior.
4. **Board presentation:** apply the row hierarchy and status language after provider-flow ownership is stable; preserve all data-boundary and authorization semantics.
5. **Component extraction:** separate board header, controls, table presentation and status mapping where this reduces future visual/workflow conflicts.
6. **Tablet and accessibility pass:** inspect 1440×900, 1280×800, 1024 landscape, 834 portrait and 768 portrait in one bounded round, then correct material failures in one batch.
7. **Evidence and adoption:** run frontend checks, the Impeccable detector and independent finish review; record actual results without closing clinical or release gates.

With Continuous Ledger selected, token and shell work may proceed in parallel when their file ownership is disjoint. Board presentation, component extraction, responsive verification and accessibility follow sequentially because they share board markup and styles.

## Failure-first acceptance

**Outcome and boundary:** establish a clinic-only visual foundation that makes the tracking board readable on desktop and tablet without changing data meaning, workflow authority, portal presentation or release scope.

**Principal failure:** the new hierarchy makes schedule timing, queue order, membership, care indicators, fixture ranges or presentation color appear to establish clinical priority or completed workflow.

**Detection and prevention:** review every emphasized state against its server/source meaning; require full-text labels, explicit partial/stale/unknown handling and tests that preserve current action and disclosure language.

**Disproof and recovery:** use wholly synthetic boards containing missing data, late appointments, explicit Waiting Room fixtures, stale/capped responses, collisions and errors. Reject a visual treatment if a reviewer infers clinical priority, arrival, saved assignment or completion not supported by the underlying state. Recovery is removal of the misleading emphasis while preserving the recorded facts.

**Exit evidence:** scoped source diff, relevant frontend tests, build/format/typecheck, detector output, validated desktop/tablet captures and an independent design review. Captures are visual evidence only, not accessibility, clinical, security or release acceptance. This evidence accepts only the visual increment; it does not approve the clinical workflow, security posture, real data or release.

## Open decisions

- Whether the three palette families provide enough user value to retain after the canonical light/dark system is complete.
- Whether to self-host Source Sans 3 later or keep the system stack.
- Exact sticky-column behavior after tablet, zoom and assistive-technology testing.
