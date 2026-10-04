# Plugin workspace design

## Direction

Operate mode: help clinic staff find a task, understand backend records and review a deliberate change alongside their Codex conversation. The clinic application's existing appearance module is the visual authority for this plugin. The older sage design note does not match the application's current cobalt default or Joshua's feedback on the plugin.

## Implemented system

- `ui/theme.ts` imports `CLINIC_THEMES`, `DEFAULT_APPEARANCE` and `clinicThemeStyle` from the existing clinic application. No second palette table is maintained.
- Light appearance is the standalone default. The native host can supply its appearance; an explicit light/dark control is also available for the open panel.
- System sans-serif, compact heading scale, outlined surfaces, six-pixel controls and restrained blue selection. MUI supplies icons, forms, dialogs and keyboard behavior.
- Persistent account, practice and location context; a narrow domain sidebar; task search and four catalog-backed read shortcuts on Home.
- Selecting a read task without mandatory input loads it immediately. Other tasks expose their existing schema; mutations retain preparation and exact-value review.
- Tables lead with backend-provided identity, show readable timestamps with time zones, and keep internal IDs in record details. Unknown fields remain available in details; no records or activity metrics are manufactured.
- Desktop uses task list beside records. Tablet stacks that task list above the workspace; narrow layouts retain horizontal domain navigation and table scrolling.

## October 3, 2026 evidence

TypeScript and production build pass. Browser walkthrough covers connection, global task search, direct appointment/patient reads, readable patient/time columns, detail access, prepared-change cancellation, and the retained synthetic staff record. Desktop and 834px tablet captures were inspected; light/dark appearance was checked. Screenshots are actual browser captures of synthetic backend data, not generated artwork.

Review was performed in this chat because subagents are prohibited in this side conversation. The automated design detector did not run its checks: a pre-existing repository comp-round gate stopped it. That unrelated design state was preserved. No automated tests were run. Native Codex rendering remains a separate unverified host check; this pass does not establish user preference or market demand.

The next useful validation is watching someone complete a lookup and a reviewed change without coaching, then addressing the friction they actually encounter.
