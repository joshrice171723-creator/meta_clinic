---
target: new front-end palette values
total_score: 29
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
target_identity: "file:/Users/mcdonough/Developer/Professional/APPly/apps/web/src/features/clinic/appearancePreferences.ts"
target_fingerprint: "sha256:ee0b61f22af82a773bcb492958e3f8c3b83e601a63282c77c54a25522fde10c9"
target_path: /Users/mcdonough/Developer/Professional/APPly/apps/web/src/features/clinic/appearancePreferences.ts
timestamp: 2026-09-03T06-50-06Z
slug: s-web-src-features-clinic-appearancepreferences-ts
---
Method: dual-agent (A: /root/design_review · B: /root/detector_browser)

## Design Health Score

| # | Heuristic | Score | Key Issue |
| --- | --- | --- | --- |
| 1 | Visibility of System Status | 3 | Save and recovery are clear, but there is no applied-theme preview or confirmation. |
| 2 | Match System / Real World | 4 | Theme and brightness labels are straightforward. |
| 3 | User Control and Freedom | 2 | No temporary comparison or restore-current/default affordance. |
| 4 | Consistency and Standards | 4 | One token system drives CSS and MUI consistently. |
| 5 | Error Prevention | 3 | Allowlisted server-owned choices are safe; visual choice remains unconfirmed. |
| 6 | Recognition Rather Than Recall | 3 | Names are clear but users must imagine their appearance. |
| 7 | Flexibility and Efficiency | 2 | Follow system helps, but no preview/quick comparison exists. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained and legible, with the local-only Development view competing for attention. |
| 9 | Error Recovery | 3 | Reload guidance is explicit; live recovery was not exercised. |
| 10 | Help and Documentation | 2 | No explanation of the palette character or accessibility intent. |
| **Total** | | **29/40** | **Good** |

## Design Specificity Verdict

The palette names and disciplined clinic-scoped token system make this feel authored for APPly, especially in dark Plum. But the four themes use the same neutral-card plus one-accent recipe, and the current Settings page hides the visual promise behind native select labels. That makes the choice more generic than the palette names deserve.

The deterministic scan was unavailable: the project-local Impeccable script path does not exist. Browser evidence confirmed the live Settings page renders four labeled theme choices and three labeled brightness choices. Overlay injection was unavailable because this Browser surface exposes read-only page evaluation only; no overlay or live server was created.

## Overall Impression

The values are technically disciplined and noticeably more individual than the prior set. The main opportunity is to let people see their choice before committing, then give each direction slightly more surface character while protecting the current contrast guarantees.

## What's Working

- Four clear, memorable names with no clinical-safety overclaim.
- Strong token discipline: account-owned selection, MUI mapping, clinic scope, native labeled selects, 44px controls, focus treatment, and stable semantic status roles.
- The reviewed dark Plum surface felt calm, legible, and professional; all primary text/action pair checks are high contrast.

## Priority Issues

- **[P1] No pre-save visual preview.** Users must infer Juniper, Cobalt, Plum, and Saffron from names alone. Add a compact, non-persistent preview strip or selectable palette tiles with a surface, text, action, and status sample; retain an explicit text-selected state. Suggested command: `$impeccable colorize`.
- **[P2] The themes are structurally too uniform.** They largely read as a hue swap on white/dark cards. Give each a modestly distinct canvas/surface/soft relationship that earns its name without scattering accent color. Suggested command: `$impeccable colorize`.
- **[P2] Surface grouping is faint.** Borders are subtle in light and dark mode. Improve grouping with a small surface delta, spacing, or border adjustment; do not add decorative shadows. Suggested command: `$impeccable layout`.
- **[P2] Development view competes with Appearance.** The six-option local-only selector breaks the page's single-focus task. Isolate or visually subordinate it. Suggested command: `$impeccable distill`.
- **[P3] Palette-specific status context is underdeveloped.** Semantic hues should remain stable, but their surrounding neutrals and soft backgrounds could better integrate with each palette. Suggested command: `$impeccable colorize`.

## Persona Red Flags

**Alex (power user):** must save and revisit the workspace to compare themes. Follow system is efficient, but temporary visual comparison is missing.

**Jordan (first-timer):** has no visual explanation of the poetic palette names or why a choice might suit their working environment.

**Sam (assistive-technology user):** labeled native controls and focus treatment are solid. The palette effect has no nonvisual description, and status needs text/icons wherever color indicates meaning.

## Minor Observations

- “Parchment” is less descriptive in dark mode; the name is strongest in light mode.
- The Appearance form's text size, spacing, and narrow-screen stacking are sound.
- Actual save-failure presentation, zoom, and assistive-technology behavior were not exercised in this critique.

## Questions to Consider

- What would make each option feel like a chosen working environment rather than a different button color?
- Should a person be able to preview calm, decisive, editorial, and optimistic cues before saving?
- Does a personal Appearance page need the development role switch at the same visual level?
