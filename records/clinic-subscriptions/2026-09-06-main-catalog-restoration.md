# Main development membership catalog restoration

Scope: [sc-337](https://app.shortcut.com/apply-1/story/337), explicitly authorized by Joshua on 2026-09-06. Source code base: `d4a8a6b` on `main`. Local dev seed data only.

## Cause and result

The merged source retained the membership implementation, but `apply_development` had only the original flexible-services package. The seven published packages remained in `apply_sc269_development`; the older `apply_subscription_browser_90673ca9` also retained the six wellness tiers. Git integration did not consolidate those databases.

Copied the seven active published packages from `apply_sc269_development` to the Omni practice in `apply_development` using existing Rails `SubscriptionCatalog.save` and `.publish` operations in one transaction. Remapped family/service/package IDs instead of copying foreign keys. Imported only published catalog definitions, excluding the retired verification program, unpublished gold draft, purchases, Stripe configuration, and other operational data.

The existing flexible program, service, and package were matched by their known legacy names and received their clean published names. Existing published version 1 was preserved; the current package received a new version. Six wellness packages were added. Program display order now opens Women's Wellness, followed by Men's Wellness and Flexible services, so the initial page shows the tier comparison. Source program descriptions and service/package terms were retained.

## Verification

- Before mutation, saved a PostgreSQL custom-format backup at `apps/api/tmp/sc337/main-before.dump` (ignored local artifact, 1,075,111 bytes; SHA256 `b9cb199ccb5b8eb2f890a8b35109230d6d3819841584391337cd81555a8c3325`).
- A transaction rehearsal completed all seven packages, checked protected data, and rolled back. A separate query confirmed the original one-family/one-package/one-version state remained.
- Applied the transaction. Compared row counts and content fingerprints for 57 inventory/financial tables, including subscription agreements/events and Stripe records: unchanged. Verified the pre-existing published version attributes were unchanged.
- Repeated the import in verification mode: zero changes, seven published packages, Women's Wellness first, no `Dev seed` labels in the published catalog.
- Restored the backup into the uniquely created `apply_sc337_restore_20260906` scratch database. All 57 protected table fingerprints matched the before-transfer baseline, and the original single-package catalog was present. No existing database was reset or replaced.
- Reloaded the existing Chrome tab at `http://localhost:3000/patient-portal#memberships`. Visually observed the three Women's Wellness cards. Clicked Men's Wellness and verified all three corresponding cards. Each program displays Essential $89.00, Complete $149.00, and Plus $219.00 with its own services. Returned the tab to Women's Wellness.

This was a local data repair through unchanged application services. No application source, schema, UI, dependencies, credentials, payment execution, or server database configuration changed. No full backend/frontend suite was run; evidence covers this bounded catalog transfer, rollback, replay, backup recovery, preservation, and browser rendering. Existing dirty `apps/api/db/structure.sql` was left untouched and excluded from the commit.

Local transfer script, source export, and rehearsal/apply/replay fingerprint reports are retained under ignored `apps/api/tmp/sc337/` for recovery inspection. They are one-time operation artifacts, not a new application import interface. The database backup is not committed.
