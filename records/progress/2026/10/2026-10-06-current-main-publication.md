# 2026-10-06 — Current main and portfolio published

Joshua explicitly requested publication to aimetaclinic.com after checking all branches and worktrees. Published candidate: `3ab2a398e4a65dde23eaf921355766b9330d8bfb`, version `0.2.9`.

## Source and preservation

- Fetched origin and fast-forwarded clean main in a new managed release checkout. The original dirty worktrees were preserved.
- The preceding inventory found all 39 worktree HEADs and every local/remote branch tip contained in origin/main, with zero local branch commits absent from origin. Source changes in the three dirty worktrees matched their already-integrated preservation snapshots; local settings and generated scratch remained excluded.
- The application was previously released at `9c8ce61f`. The two subsequent commits record the prior release and remove the portfolio's career-automation section. No additional application implementation was introduced by this publication.

## Application release

- Ran the existing `ops/lightsail/release.ps1` from clean, pushed main through the shared heavy-command queue, using `-BuildWebOnHost -StreamImages` and the existing owner SSH key. DNS and SSH destination matched the documented Lightsail host.
- Docker Desktop was started because its engine was stopped. Matched API/web Docker builds, locked dependency installation, TypeScript, the primary Vite bundle, Office bundle and nginx configuration checks passed.
- Both database backups were restore-checked. The recovery bundle was copied off-host, encrypted with Windows DPAPI, transferred back and downloaded again, then decrypted and hash-checked before activation.
- The release runner exited 0. All 26 hosted checks passed, including authentication, CSRF and anonymous denial, five concurrent context reads, isolated Omni organization creation and persisted context, Sandbox location switching/persistence, and a second visitor joining the prepared Sandbox.
- All five Compose services reported healthy. Public `/build.json` reports the candidate, `dirty: false`, version `0.2.9`; `/up` returns 200. Host revision and application image tags match the candidate.
- Encrypted recovery archive: `C:\Users\joshr\Desktop\06 - Secure Files\MetaClinic-recovery-3ab2a398e4a65dde23eaf921355766b9330d8bfb.tar.gz.dpapi`. Existing previous image references and host backups remain available. No rollback was required.

## Separate portfolio publication

- Published committed static files under `/var/www/joshua-portfolio/releases/3ab2a398e4a65dde23eaf921355766b9330d8bfb/joshua/`, with an atomic current-symlink switch and prior-target/nginx-snippet backup. The previous target was `/var/www/joshua-portfolio/releases/c9d838ed1f9b2e7483282de87c9287646b43ec85`.
- Published nine files: `index.html`, `resume.html`, `styles.css`, `resume.js`, `favicon.svg`, `joshua-rice.png`, `Joshua_Rice_resume_2026.docx`, `assets/agent-office.png`, and `assets/workflow-coverage.png`. The older README allowlist omitted the two referenced screenshot assets; these were added before final verification. README, design notes and deployment configuration were excluded.
- HTTPS bytes for all nine files matched source SHA-256 hashes. `/joshua` redirects to `/joshua/` with 301; a missing file returns 404. Final `/joshua/` returns 200 and no longer contains the removed career-automation section.
- Browser inspection confirmed the portfolio loads with its hero, navigation and remaining sections. The published portfolio tab was left open. A broad responsive/browser matrix was not performed.

No automated application test suites or broad workflow regression ran. This release does not close independent QA or professional/prelaunch gates. The following evidence commit is documentation only and does not alter the published artifacts.
