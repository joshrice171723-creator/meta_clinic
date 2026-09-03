---
name: frontend-ui
description: Implement or revise APPly React interfaces using the existing Material UI component system. Use for frontend components, controls, layouts, icons, interaction patterns, responsive behavior, accessibility, styling, or visual polish under apps/web.
---

# APPly frontend UI

Treat Material UI as the default implementation substrate for APPly interfaces.

## Impeccable workflow and delegation

1. Invoke and follow `/impeccable` for every frontend UI task (use the host-equivalent `$impeccable` syntax where required). Run its context setup once, use the command or playbook that matches the request and load its craft floor before editing UI. This skill's Material UI hierarchy remains the repository-specific implementation constraint.
2. Bounded frontend subagents are allowed when the host supports them. Give each subagent a non-overlapping implementation area or a read-only investigation/review role, the relevant `AGENTS.md` chain, acceptance criteria and instructions to use both `frontend-ui` and `impeccable`. The primary agent owns integration and final verification; do not let agents concurrently edit the same files.
3. After implementation, selected frontend checks and the first bounded rendered inspection, spawn a fresh read-only adversarial review subagent using the **Luna / Medium / Standard** profile: `gpt-5.6-luna`, medium reasoning and standard inference speed when the host exposes a speed selector. Tell it to run `/impeccable critique [target]` (or the host-equivalent `$impeccable critique [target]`), inspect the scoped diff and rendered desktop/mobile states, and return severity-ordered findings with evidence. Do not give the critic implementation work or let it edit files.
4. Address every substantiated finding, rerun affected checks and perform at most the bounded confirmation pass permitted by `impeccable`. A contributing implementation agent is not the fresh critic.
5. If the host cannot create subagents or select one part of the requested profile, do not claim it did. Use the closest supported Luna/medium profile at the host's available speed, run the critique in a separate context when possible and disclose the exact limitation in the handoff.

## Component selection

1. Read `apps/web/AGENTS.md` and inspect the owning feature, shared components, `Appearance.tsx`, the theme and current Material UI imports before designing the change.
2. Map each requested element to an existing APPly component first, then to the closest Material UI component, icon or documented composition pattern.
3. Use the Material UI option when available. Adapt it through composition, slots, variants, theme overrides, `sx`/`styled` APIs or an owned APPly wrapper.
4. When a shared APPly wrapper or feature module prevents the correct result, improve that owned module and its tests so consumers receive the fix. Do not route around it with a parallel one-off implementation.
5. When Material UI remains the right base but its public APIs are insufficient, change the package implementation. Explore locally if useful, then preserve the final change as a narrow dependency patch, vendored package or pinned fork with exact upstream version/source and license provenance. Prove a clean `npm ci` reapplies the change and run focused regressions; an untracked `node_modules` edit is not a deliverable.
6. Use semantic browser primitives for a new custom control only when Material UI has no suitable option and neither its supported extension points nor a durable package modification can meet the required semantics, accessibility or behavior. In the final handoff, name the Material UI paths considered and why they were insufficient.

## Implementation checks

- Preserve the existing theme, responsive and capability boundaries unless the task changes them.
- Prefer Material UI icons and interaction primitives over custom glyphs, CSS-only imitations or copied source.
- Preserve browser semantics, labels, focus behavior, keyboard operation, reduced-motion preferences and narrow-screen containment.
- Do not treat existing compatibility CSS as permission to add another hand-built control.
- Inspect the diff for raw `button`, form-control, dialog, menu, tooltip, table or layout implementations that duplicate a Material UI primitive.
- For a Material UI package modification, keep the diff minimal, document its removal/upstreaming condition and verify license notices, lockfile integrity, clean installation, build, type safety and focused interaction/accessibility behavior.
- Run the frontend checks selected by `bin/agent-check`; add focused interaction/accessibility coverage for new or materially changed behavior.

Return the selected Material UI primitives, any shared-module or dependency-source change, clean-install evidence when applicable, checks run, the Luna/medium Impeccable critique findings and dispositions, any host-profile limitation, and any justified custom-control exception in the handoff.
