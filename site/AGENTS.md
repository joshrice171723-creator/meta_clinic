# Historical Sites agent instructions

These instructions apply to `site/` and extend the repository root contract.

- `site/` contains historical Sites metadata/assets, not the current application. New application work belongs in `apps/web/` or `apps/api/`.
- Do not restore removed runtimes, introduce patient-data collection or treat historical hosting metadata as current deployment authority.
- Inspect or edit this directory only when the request explicitly concerns the historical site, its assets or Sites configuration.
- Publishing, unpublishing, changing domains or modifying hosted state requires explicit authorization and the applicable Sites workflow. Never publish vault contents.
- Preserve current files and Git history; avoid incidental cleanup or generated-cache changes.
