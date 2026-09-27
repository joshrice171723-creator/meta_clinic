# MC-02 clinic-managed public page copy — 2026-09-27

Growth staff with `subscription_catalog.publish` can set a headline and introduction through the existing audited storefront settings. Rails validates and bounds both fields; existing clinics keep the current public copy until a setting is saved. The clinic's membership and services pages show the saved text as plain escaped content. The current configuration snapshot includes the fields so later comparisons show copy changes.

The additive migration applied to the local synthetic development database. Ruby syntax and scoped lint, TypeScript and changed-file formatting passed; no tests or browser journey ran. This is text branding only. Logo/color management, public page save/reload, role denial and connected account recovery remain open.
