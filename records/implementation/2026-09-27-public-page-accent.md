# 2026-09-27 - BR-05 public page accent

## Source delivered

MC-02 / BR-05: the existing storefront settings now save a shared public-page accent. The Material UI select offers Ocean blue, Violet, Forest green and Default. The existing transaction, row lock, publisher permission and audit event own the update. Blank resets to null; the model and PostgreSQL check constraint reject values outside the palette. Existing records remain null and retain their previous theme.

Both public serializers expose the saved accent; both page ThemeProviders use the same bounded theme mapping. Buttons and controls receive the chosen primary color with white contained-button text; arbitrary CSS and external assets are not accepted. The staff index/show responses and configuration manifest include the setting. Publication gates and payment/enrollment mutations remain unchanged. This is visual branding, with no new clinical fields or standards mapping.

## Checks

- Applied additive migration 20260927215500 through the managed local PostgreSQL wrapper; generated structure preserves existing migrations and constraints.
- Eight changed Ruby files passed scoped RuboCop.
- Frontend TypeScript and five changed-file Prettier checks passed.
- Scoped source walkthrough followed settings load, edit, save, returned state, both public responses and shared theme fallback. Source review is not populated browser acceptance.
- No tests were added or run. Browser save/reload, permission denial and visual acceptance remain open.

## Remaining work

Logo upload remains separate. Palette changes require coordinated database/model/frontend changes. Tracker percentage and BR-05 queue status are deferred to the next hourly checkpoint; this source record does not claim MC-02 complete.
