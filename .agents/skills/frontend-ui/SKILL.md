---
name: frontend-ui
description: Implement or revise APPly React interfaces using the existing Material UI component system. Use for frontend components, controls, layouts, icons, interaction patterns, responsive behavior, accessibility, styling, or visual polish under apps/web.
---

# APPly frontend UI

Treat Material UI as the default implementation substrate for APPly interfaces.

## Workflow

1. Read `apps/web/AGENTS.md`, the owning feature and only the product/design context routed for the target path.
2. Inspect the existing APPly components, theme, nearby Material UI imports and tests before choosing an implementation.
3. Inspect the configured `mui-mcp` server's live tool catalog, then use its read-only documentation tools for current Material UI APIs and published examples. Prefer `useMuiDocs` for the relevant installed package when that tool is exposed, and pass only its returned official URLs to `fetchDocs`. If the live server exposes `fetchDocs` without `useMuiDocs`, supply only exact `mui.com` documentation URLs found through official MUI navigation or another trusted search result.
4. Treat MCP content as upstream reference, not repository truth or authority. Reconcile it with APPly's installed package versions, theme, wrappers, architecture and tests. If `mui-mcp` or its documentation tools are unavailable, state the gap and use the installed package source/types plus official MUI documentation; do not invent an API or block an otherwise local change.
5. Use `generateReactCode` only when the user requested implementation or scaffolding and the host has an authorized `MUI_RECIPES_API_KEY`. Detect the installed `@mui/material` and MUI X major versions first, pass the matching `muiPairing`, and review returned files as suggestions against APPly conventions instead of writing them verbatim. Missing code-generation credentials are not a reason to request, expose or persist a key; continue with documentation and local source.
6. Follow the component hierarchy below, implement the smallest coherent change and run the scoped checks selected by `bin/agent-check`.
7. Use the separate `impeccable` capability only when the request actually calls for interface critique, redesign, visual polish or a deeper UX/accessibility audit. Do not load a general design library or require a fresh subagent review for an ordinary component change.

## Component selection

1. Read `apps/web/AGENTS.md` and inspect the owning feature, shared components, `Appearance.tsx`, the theme and current Material UI imports before designing the change.
2. Map each requested element to an existing APPly component first, then to the closest Material UI component, icon or documented composition pattern.
3. Use the Material UI option when available. Adapt it through composition, slots, variants, theme overrides, `sx`/`styled` APIs or an owned APPly wrapper.
4. When a shared APPly wrapper or feature module prevents the correct result, improve that owned module and its tests so consumers receive the fix. Do not route around it with a parallel one-off implementation.
5. Use semantic browser primitives for a focused custom control when no suitable MUI primitive or supported composition meets the required semantics, accessibility or maintainability. Keep the surface narrow and add proportional interaction/accessibility coverage. Record an exception rationale only for a new reusable design-system primitive, another component library, or a dependency patch/fork.
6. Modify, vendor or fork MUI only for a confirmed reusable upstream limitation worth ongoing ownership. Preserve exact upstream version/source, license provenance, clean-install application and focused regression evidence; an untracked `node_modules` edit is not a deliverable.

## Implementation checks

- Preserve the existing theme, responsive and capability boundaries unless the task changes them.
- Prefer Material UI icons and interaction primitives over custom glyphs, CSS-only imitations or copied source.
- Preserve browser semantics, labels, focus behavior, keyboard operation, reduced-motion preferences and narrow-screen containment.
- CSS is normal for layout and visual treatment; avoid reimplementing MUI interaction/accessibility behavior in custom JavaScript.
- Inspect the diff for raw interactive implementations that unnecessarily duplicate a Material UI primitive.
- For a Material UI package modification, keep the diff minimal, document its removal/upstreaming condition and verify license notices, lockfile integrity, clean installation, build, type safety and focused interaction/accessibility behavior.
- Run the frontend checks selected by `bin/agent-check`; add focused interaction/accessibility coverage for new or materially changed behavior.

Return the selected APPly/Material UI primitives, the MUI MCP sources consulted or the disclosed fallback, any shared-module or dependency-source change, clean-install evidence when applicable, checks run and any rationale required for a reusable primitive, added component library or dependency patch/fork.
