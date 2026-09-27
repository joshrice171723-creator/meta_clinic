# MC-02 clinic services page — 2026-09-27

## Built

- Added a public clinic services route and page at `/clinics/:slug/services`, separate from membership enrollment.
- The API resolves the saved clinic slug, requires deployment access and at least one published service with `public_visible`, and returns only clinic name, service name/description/duration/modality, and an optional membership link. Membership sales may be disabled while this page remains available.
- The Growth workspace exposes the services link only when its public offering gate is met. Removing the last published visible service removes the link and makes the public API return 404.

## Checks and limits

- `pnpm run typecheck` passed; changed frontend files were formatted with Prettier.
- `ruby -c` passed for both changed controllers and routes; `bundle exec rails routes -g clinic_services` resolved the new route; scoped RuboCop passed with no offenses.
- No tests or browser journey ran. Positive public listing, disabled-membership access, last-offering removal, role denial and reload still need a connected local walkthrough. The clinic page uses the slug managed in Membership Growth; independent slug/branding management and broader lead tools remain open.
