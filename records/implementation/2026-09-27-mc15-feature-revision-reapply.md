# MC-15 feature revision reapplication — 2026-09-27

Clinic setup can now load choices from one of the latest 25 saved revisions for the same clinic and location into its existing editor. The read route requires `facilities.write`; it binds the requested site to the current practice. Applying a choice only changes the form. Saving uses the existing optimistic revision, request key, authorization and protected-profile checks, and writes a new append-only revision. A finalized profile cannot load a version that changes its protected clinic type, insurance setting or selected service ceiling.

Ruby syntax, scoped RuboCop, route loading, TypeScript and changed-file formatting passed. No tests or browser journey ran. The picker is a same-clinic recovery aid, not import of another clinic or a full configuration rollback. Connected reload, denied-role and stale-save proof remains open.
