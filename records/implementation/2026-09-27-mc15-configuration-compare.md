# MC-15 configuration snapshot comparison — 2026-09-27

The existing Operations configuration snapshot now accepts a saved JSON file for a read-only comparison against the currently loaded clinic configuration. It rejects another clinic or format and reports clinic-setting, location and service-offering changes by count. No upload, import or mutation occurs; file contents stay in browser memory only during comparison.

Prettier, TypeScript and scoped diff checks passed. No tests or browser walkthrough ran. This does not restore settings or establish migration recovery; the current snapshot must be refreshed before comparing if the clinic changed since page load.
