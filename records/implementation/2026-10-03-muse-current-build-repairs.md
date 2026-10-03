# Muse current-build repair checkpoint — 2026-10-03

Observed live build: `0.2.6` at `3da3ca67355f45d10cf4980ca9c1e492dd393534`, clean. The full goal remains all 116 workflows on the final deployed pin with no unresolved failures or blockers. Shared Sandbox RESET remains prohibited.

## Confirmed findings and source repairs

- WF-116 / defect 258, receipt `660c2d49-6f89-450e-9819-11dc6ee1628d`: saved verdict coverage was present after the desk loaded. Muse accepted that change-impact counters were mistaken for verdict counters. Commit `123f0604331dae2395c3d18c75943e7913261097` adds an explicit initial loading state, separate current-build verdict totals, and labels change-impact totals. This is a presentation repair, not a missing-verdict repair.
- WF-101 / defect 256, receipt `00cff31a-107d-47ed-b52a-a4ae80768ff1`: the verified SMS endpoint requirement remains intact. The same commit places create/dispatch errors beside the composer button. This does not provision an SMS fixture or establish a successful send; both remain pending.
- WF-010–013 / defect 260, receipt `37c85fcf-6feb-4658-86d3-6ff86b8c001b`: a read-only probe of the actual `meta-clinic-demo-guided-demo-1` service verified catalog version 13 in code, only versions 10–12 installed, and zero assignable roles. Active shared Sandbox run 79 / practice 8 / operator 14 already has `roles.manage` and `workforce.admin`. The release path now installs the current immutable catalog in the isolated guided database after migration and before startup. Installation uses the existing transaction/advisory lock; it creates definitions and does not grant permissions to existing accounts or alter the Muse credential.

## Checks and limits

- Three frontend files: scoped formatting, diff review, `git diff --check`, TypeScript, and both Vite bundles passed. Existing ineffective dynamic import warning remains unrelated. No automated tests were added or run.
- Release script: Git Bash `bash -n` and `git diff --check` passed. Live catalog installation and exact-build browser retest remain pending the guarded publication.
- Initial database probes using the ordinary API service failed; no database changes were made. Switching to the correctly configured guided service produced the diagnosis above without reading credentials.
- Browser monitoring became unavailable; the established Muse inbox accepted continuation and root-cause messages on the exact live revision. An inbox receipt proves message delivery, not Muse acknowledgement. Public live coverage independently advanced to 40 current-build results: 28 pass, 10 fail, 2 blocked.
- WF-087/105 invoice collection, WF-103 telehealth, WF-106 provider setup, WF-109 connectors, the reminder fixture, and remaining workflow observations are unresolved. Older build results do not count as fresh acceptance.
- This checkpoint is source evidence. It does not claim publication, current-build repair acceptance, completion of the full QA sweep, or zero issues.
