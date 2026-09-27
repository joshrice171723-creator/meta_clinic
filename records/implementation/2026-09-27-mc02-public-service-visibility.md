# MC-02 public service visibility — 2026-09-27

## Source outcome

- Added a separate `public_visible` choice to the existing service-offering configuration. The forward migration defaults every existing offering to false. Staff with existing service-offering write authority can change the choice through the same versioned, audited operation.
- The anonymous clinic membership page now reads only offerings that are both published and explicitly public. Its response contains name, description, duration and modality; it does not return internal price, site, clinician or booking configuration.
- The page displays those service descriptions alongside the existing membership catalog. It makes no booking, payment or clinical eligibility claim.

## Observed checks and limits

- The development migration applied to the existing synthetic `apply_development` database; generated `db/structure.sql` includes the default and index.
- Ruby syntax, changed-file RuboCop, Rails eager load, TypeScript, Prettier and the page-script syntax check passed. No tests were added or run.
- An anonymous local GET for the synthetic Weight Loss Clinic returned its existing two membership plans and zero services before any offering was opted in. The positive public-listing journey, staff save/reload, retirement removal and browser presentation remain unverified.
- MC-02 build estimate moved from 60% to 65%. Validation stayed 45%; external/human stayed 0%. Independent clinic pages, broader branding/lead tools and account/payment browser recovery remain open.
