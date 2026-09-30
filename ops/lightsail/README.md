# Meta Clinic Lightsail synthetic demo

## Local QA handoff and deployed identity

The local Codex publisher uses this release path. The Muse review handoff is
documented in [the QA runbook](../qa/README.md); it does not install a second
publisher. `/build.json` returns the exact web image's Git revision and package
version with `Cache-Control: no-store`. The release verifies that revision before
recording success, within the existing image-rollback boundary. QA notes are at
`/clinic/updates`. Semantic version alone is insufficient to identify a retest.

Notes for QA: after release, open `/build.json`, confirm its revision matches the
local deployment report, and hard-reload `/clinic/updates` before retesting. The
intentional trade-off is that build identity is public metadata, while browser
acceptance remains an independent Muse result recorded on the PR.

## Workspace tools and investor demo entry

On `aimetaclinic.com`, `/login` and ordinary workspace pages use `/api/` with
credential authentication. Signed-in active owners/admins receive the collapsible
Workspace tools section in the owner workspace, clinic workspace and portal settings.
Omni switching retains and revalidates the initiating privileged session; the
in-workspace controls remain tied to an authorized session. The first authorized Omni
switch prepares its identity if needed. Hosted use does not require a development
environment or `APP_DEVELOPMENT_LOGIN`.

For the expressly public synthetic demo, set `APP_PUBLIC_DEVELOPMENT_LOGIN=1`
and `APP_PUBLIC_DEMO_OWNER_PIN` in the root-only runtime environment file. This
shows the test-account selector on the hosted login page. The Owner choice
requires the configured four-digit PIN; ordinary owner credential login remains
separate. The opt-in is limited to staging on `aimetaclinic.com` and does not
enable a production deployment or another host. Do not store the PIN in Git,
the vault, or release notes.
The release prepares Omni's immutable role definitions through the migration
account before runtime startup; runtime database privileges remain unchanged.

The `/demo` lessons and their named workspace iframe continue to use
`/api/demo-workspace/` and the isolated `apply_guided_demo` database. The release
seeds and verifies that separate demo flow. Existing isolated demo records remain
in that database; they are not copied into the ordinary workspace.

## Current connection (verified 2026-09-20)

The public site is `https://aimetaclinic.com`, with guided lessons at `/demo`.
Its DNS currently resolves to `174.129.142.201`; verify DNS before connecting.
Use the `ubuntu` SSH account and the owner's existing Lightsail key from the
local Secure Files folder. Repository deploy keys under `.ssh` are Git keys,
not server login keys. Do not print, copy into source, or rotate private keys
during a routine release. The `184.194.129.57` address below records the initial
deployment and is no longer the site's current destination.

Automatic merges remain disabled. Use one combined, reviewed release candidate
and the existing Relay-owned publication path. Until a separately approved
automation is installed and its first cycle is proven,
deployment is manual: pushing `main` does not change the running website.
Use the PowerShell release command below. It builds matched API/web images
locally from a clean, pushed `main` checkout, then transfers them to the host.
For a prebuilt release, the optional `publish-containers.yml` workflow can
publish the same commit to GHCR; its jobs may be unavailable while GitHub
account billing restricts Actions. The release command preserves the host's
existing secrets and Compose configuration, backs up
and restore-checks both databases, migrates each with its own credentials,
then updates the matched image references and restarts API, worker,
guided-demo and web. It verifies image revisions, login/authorization and the
public Sandbox creation, location switch and reset flows.

## Routine release from a Windows checkout

Use a clean, pushed `main` checkout with local Docker running. From PowerShell:

```powershell
./ops/lightsail/release.ps1 -KeyPath '<path to the owner Lightsail SSH key>'
```

The default `local` mode uses Docker's layer cache, builds both images with the
same Git revision label, saves and transfers them together, then loads them on
the host. No GitHub Actions job or GHCR credential is needed. A cold build or a
large image transfer can still exceed ten minutes.

If the local Docker engine cannot fit the web TypeScript build, use
`-BuildWebOnHost`. The wrapper runs the locked web install, typecheck, and Vite
bundle on Windows, then packages that bundle into the same revision-labeled
Nginx image. Host preparation, encrypted recovery, and deployment checks are
unchanged.

```powershell
./ops/lightsail/release.ps1 -KeyPath '<path to the owner Lightsail SSH key>' -BuildWebOnHost
```

Optional prebuilt mode: first run **Publish portable containers** on `main`
and wait for both API and web jobs to pass for its exact commit. Give host root
a GitHub Container Registry credential with `read:packages` only. Keep it in
the existing root-only secrets directory, never in Git or a command argument.
The release script uses this Docker config only to pull images; it pins the
deployed references by digest. Set up the credential interactively on the host:

```sh
sudo install -d -m 700 /opt/meta-clinic/secrets/docker-config
sudo -s
export DOCKER_CONFIG=/opt/meta-clinic/secrets/docker-config
read -rsp 'GHCR read token: ' GHCR_TOKEN; echo
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u joshrice171723-creator --password-stdin
unset GHCR_TOKEN
exit
```

Then release the prebuilt images:

```powershell
./ops/lightsail/release.ps1 -KeyPath '<path to the owner Lightsail SSH key>' -ImageSource registry
```

`release.ps1` confirms local `main` equals `origin/main`, uploads the current
release and verifier scripts, and calls `release.sh prepare`. Preparation checks
both image commit labels and web Nginx syntax, restore-checks
the ordinary and guided-demo PostgreSQL dumps, and bundles both dumps with
the existing host secrets. The wrapper downloads that bundle, checks its SHA-256,
encrypts it with Windows DPAPI CurrentUser in `Desktop/06 - Secure Files`,
uploads and downloads the encrypted copy, verifies its decrypted SHA-256,
and removes its plaintext local copy.
Only then does it call `release.sh deploy` with the exact commit and bundle hash.
The DPAPI archive requires this Windows user's profile to decrypt; retain the
host backup and previous images for recovery.

Deployment migrates both databases, reapplies ordinary runtime privileges,
starts the matched images, and checks public routes, anonymous denial, password
login and the isolated Sandbox API journey. It restores the previous image
references if rollout or verification fails. Database migrations are **not**
automatically reversed; stop and review the saved dumps before any database
restore. Preparation failure leaves the current site running. If preparation
fails after creating `/opt/meta-clinic/backups/release-<commit>`, inspect that
directory before retrying the same commit. Do not delete it blindly.

The release command does not merge branches, include uncommitted files, deploy
on every push, or claim clinical/production readiness. Record the hosted result
and exact revision in the Progress Log. For a site-only emergency rollback,
use the saved `previous.env` and review schema compatibility first.

## Initial host record

Selected host: `meta-clinic-demo`, account ending `9164`, `us-east-1a`, Ubuntu 24.04,
2 GB RAM / 2 vCPU / 60 GB disk, $12/month base price. Static IP:
`184.194.129.57` (`meta-clinic-demo-ip`). An attached static IP adds no fee;
taxes, transfer overages, and any subsequently selected extras remain separate.
No paid snapshots or load balancer are selected. This is synthetic staging only.

## Boundary and failure checks

The observable outcome is an authenticated HTTPS demo independent of the user's
computer. User authorized this account and server price in the deployment task.
Keep API, database, and worker ports private. Public ingress is nginx only.
Development login stays disabled. Secrets are generated only on the server;
runtime containers never receive owner database credentials. Use matched immutable
API/web images from one commit. Never substitute an unreviewed branch.

Principal failures: publishing mismatched images, re-generating encryption keys,
exposing development authentication, failing certificate renewal, and losing the
single database volume. `prepare-secrets.py` refuses an existing secret directory;
verify image identities, anonymous denial, CSRF denial, runtime role permissions,
login, and a database restore before claiming acceptance. Current repository CI
failures must be recorded separately; provisioning a host does not resolve them.

## Installation

1. Install Docker/Compose, nginx, and Python venv from Ubuntu packages.
2. Copy this folder into `/opt/meta-clinic/deploy`, and generate secrets once with
   `sudo python3 prepare-secrets.py 184.194.129.57`.
3. Store `API_IMAGE` and `WEB_IMAGE` in `/opt/meta-clinic/deploy/release.env` as matched
   digest references or immutable local commit tags. Keep credentials out of it.
4. Install `nginx-http.conf` as nginx's default site and create `/var/www/acme`.
5. Obtain a Let's Encrypt IP certificate with Certbot >=5.4, the `shortlived`
   profile, and webroot `/var/www/acme`. Configure automatic renewal and nginx
   reload; these certificates last approximately six days. Install the HTTPS
   site only after certificate issuance and application verification.
6. Start PostgreSQL, run the separate `migrate` service, apply the **matching image's**
   `db/runtime_privileges.sql` as owner, and run `provision-demo.rb` through the
   migration container. Start `api`, `worker`, and `web`.
7. Verify HTTPS, credential login, anonymous protected-route denial, CSRF denial,
   development-login denial, runtime database restrictions, and service restart.

## Platform owner invitation

Configure outbound SMTP only in `/opt/meta-clinic/secrets/runtime.env` using
`APP_SMTP_ADDRESS`, `APP_SMTP_PORT`, `APP_SMTP_USERNAME`, `APP_SMTP_PASSWORD`,
`APP_SMTP_AUTHENTICATION`, and a provider-verified `APP_EMAIL_FROM`. Never place
those values in `release.env`, Git, shell history, screenshots, or deployment logs.

After the matched release is healthy and its migration has completed, issue the
single platform-owner invitation from the host:

```sh
sudo env APP_PLATFORM_OWNER_EMAIL='owner@example.com' bash ./invite-owner.sh
```

The task never prints the password or invitation token. Delivery failure revokes
the unusable invitation. The emailed link creates the password, signs in the new
owner, and opens `/owner`. PostgreSQL permits only one user with platform-owner
access; issuing another invitation is refused after activation.

The demo email is `staging-demo-user@example.test`; its generated password is in
the root-restricted secrets directory. Deliver credentials through an owner-only
local file, never Git, build logs, screenshots, or public notes. No shared default
password is built into the image.

## Recovery and updates

Before every subsequent migration, save a `pg_dump -Fc` backup and retain the
previous image identities. Verify restoration into a uniquely named scratch
database before relying on the backup. Keep an encrypted off-host copy of the
database and encryption keys under owner control. An on-server backup alone does
not survive server loss; paid off-host storage has not been selected.

Stop containers with `docker compose down` **without** `--volumes`. A failed
migration or incompatible schema requires a reviewed recovery; changing the image
tag alone is not a database rollback. Do not delete the server, static IP, database
volume, or keys during routine recovery. Stopped Lightsail instances still incur
charges. Never detach the static IP and leave it unused, since detached IPs bill
separately.

Status and dated verification are recorded in the deployment task; this runbook
describes the intended procedure, not a claim that every acceptance step passed.

## Initial release implementation notes

The initial application source is `dda1d41c37665cfc8b309b48751ed35a0701c550`.
Images were built locally and transferred with Docker save/SCP/load because the
available GitHub login lacked private GHCR read access. No GitHub token was placed
on the server. This is manual deployment, not push-to-server automation.

The Windows-built API image required a separate `-lf1` packaging layer from
`Dockerfile.normalize` to normalize executable line endings in `/rails/bin`.
It does not alter application behavior. Normalize deployment text files to LF
before running their shell scripts on Linux. Keep the original image for recovery.
The worker starts through `bundle exec` so Bundler setup cannot consume its
continuous-run arguments before loading the application.

The requested `meta-clinic.184.194.129.57.sslip.io` name resolved, but Let's Encrypt
secondary DNS validation failed; the alternate nip.io name failed the same check.
The live fallback is `https://184.194.129.57` with a valid short-lived IP certificate.
Do not advertise either friendly hostname as working or bypass TLS warnings.

## Guided lessons at /demo

Use `guided-demo.compose.yml` with `compose.yml` and the same immutable release image. Run `prepare-guided-demo.py` once as root on the existing host; it creates a dedicated database/login and independent credentials, refuses an orphaned role, and verifies the demo role cannot connect to the normal database. Preserve this file and database on subsequent updates. Migrate the demo with its own service credentials before starting it. Do not apply the ordinary database runtime role to this disposable lesson database: lesson preparation/reset requires ownership inside this isolated database only.

Route `/api/demo-workspace/` to loopback port 3002, retaining the prefix for the session middleware. Existing `/api/` traffic stays on 3001. `/demo` and the iframe shells are served by the matched web image. No development-login flag or provider credentials are enabled for the public lesson process. Back up and restore-test the ordinary database before its migrations and retain prior release images/nginx configuration for rollback.

## Optional automatic QA release path

**Disabled source example; not the current release path.** Automatic merges are
not registered. The preserved [workflow template](auto-fix.workflow.example.yml)
is outside `.github/workflows`, so merging this source does not grant automatic
GitHub merge authority. No replacement live or manual write-token workflow is
provided. Repository `allow_auto_merge=false` alone would not disable this policy:
it advances `refs/heads/main` directly and may record an attempt before CI checks.

Policy and host scripts remain uninstalled, inactive source. No timer, credentials,
backup destination, billing setting or server is provisioned by committing this
code. Retain the existing Relay-owned publication path and single combined release
candidate. PR #3 is a tracker-document PR, not the runtime release worker.

The following proposed setup and operation require separate, explicit approval;
this release does not authorize copying the template into `.github/workflows`,
running the installer, creating credentials or enabling the host timer.

The preserved future design is: owner-filed bug → owner-authored `auto-fix` PR → exact-candidate CI →
fast-forward main to that tested merge commit → explicit main CI → host builds
matched images → existing prepare → encrypted, verified off-host recovery →
existing deploy and hosted checks → version entry with Notes for QA → QA retest.
In that separately approved design, application-code work may run unattended
after setup; blocked gates remain visible
and never silently become approvals.

### Merge gate and three-attempt budget

The inert `auto-fix.workflow.example.yml` would run trusted **main** policy only
if separately approved and registered. It never checks
out PR code with the write token, consumes PR artifacts as executable content,
installs PR dependencies or evaluates PR text as shell input. It requires:

- Same-repository PR by `joshrice171723-creator`, targeting main, non-draft, labeled
  `auto-fix`, and linked to an owner-filed GitHub issue by `QA-Issue: #NUMBER`.
- Complete changed-file inventory. Only Ruby under `apps/api/app/` and
  TypeScript/TSX/CSS under `apps/web/src/` are allowed. Hidden paths and agent
  instructions are denied. Rename source **and** destination are checked.
- All eight current CI job names actually ran and passed. The latest candidate
  evidence artifact must identify the exact PR merge commit and head. Missing,
  expired, skipped, failed or ambiguous evidence blocks merging.
- The tested merge commit's parents are the current main and exact PR head.
  Non-force ref advancement installs that exact object; a competing main advance
  fails rather than creating an untested merge. GitHub's branch protections still
  apply. Strict linear-history rules are incompatible with this merge-commit path;
  do not bypass or silently change repository protections.

All database files, **all migrations**, dependency/lockfiles, Dockerfiles, CI,
infrastructure and other paths require manual review. This conservative allowlist
does not claim to detect every dangerous operation inside application code.

An append-only issue-comment ledger counts distinct PR head candidates, including
failed CI candidates, up to three per issue across PRs. Rechecking the same head
does not spend another attempt. The fourth candidate is blocked with a workflow
summary requiring human review. Do not reset the budget by creating a new issue for
the same bug. This gate bounds merge/deploy candidates; the QA/Codex driver must also
stop editing after three attempts instead of performing unlimited work before submission.

GitHub-token pushes do not trigger normal push CI. The merger explicitly dispatches
`ci.yml` after merging; the host requires successful main CI for that exact SHA.
If that dispatch fails, run **CI → Run workflow → main**; never skip the gate.
The host does not depend on GHCR publication, but **green GitHub CI and the merge
workflow still depend on Actions working**. A host build is not a substitute for CI.
The observed September 28 run `36383035331` failed before any job steps started;
the connector could not retrieve its failure annotations. Billing is a documented
prior cause, not a newly verified explanation for that run.

### Required Notes for QA

Every fix PR must contain this exact structure, filled with real information:

```markdown
QA-Issue: #123

### Notes for QA
#### What changed
Describe the specific behavior corrected.
#### What to retest
Give the URL, role, setup, actions, expected result and relevant regression check.
#### Intentional behavior / trade-offs
Explain deliberate behavior and limitations, or explicitly state none.
```

The host copies these notes from the merged PRs into the release entry. Missing or
placeholder sections stop the release. Use synthetic examples only; notes become
public and must contain no credentials, PINs, patient information or private data.
All PRs represented in a batch retain their own notes. Direct pushes and changes
outside the allowlist stop the automatic release path, even if CI passed.

### One-time host setup

Perform in an authorized host session, from the reviewed automation checkout:

1. Check Actions availability and resolve account/CI failures. A failed or skipped
   run must not be renamed or relabeled as green. Merge this infrastructure PR
   manually after review; it deliberately cannot merge itself through `auto-fix`.
   Perform one final reviewed baseline release containing this infrastructure
   commit using the existing release procedure. The installer requires its clean
   checkout SHA to equal the running `current-revision`. Otherwise the first
   automated comparison would correctly reject the infrastructure changes between
   the old deployment and main. This is a one-time migration step, not a recurring
   Windows dependency.
2. Install required host tools: existing Docker/Compose and Python requests, plus
   Git, GnuPG, util-linux (`flock`, `findmnt`) and systemd. Build one image at a time.
   The coordinator requires 12 GiB free and gives each build a 90-minute limit.
   Capacity on the small existing host still requires a measured first build.
3. Set up a **read-only** repository deploy key in root's SSH configuration with a
   verified GitHub host key. Never disable host-key checking. Clone a dedicated
   bare repository (never repurpose the development checkout):

   ```sh
   sudo git clone --bare git@github.com:joshrice171723-creator/meta_clinic.git /opt/meta-clinic/source.git
   sudo chmod -R go-rwx /opt/meta-clinic/source.git
   ```

4. Create `/etc/meta-clinic/github-read-token`, root-owned mode 0600, through secure
   host credential entry. Scope it to this repository with read access to contents,
   actions/artifacts, pull requests and issues. It does not need merge/write access.
   Do not put the value in Git, a chat, command arguments or shell history.
5. Provision an owner-controlled mounted **off-host** recovery destination and a
   separate protected off-host key escrow mount. Configure their exact `findmnt`
   source identities. Supported filesystem types are NFS/NFS4, CIFS and SSHFS.
   Mounts must already have appropriate authenticated transport/access controls;
   no storage provider, credentials, spending or permissive mount options are
   selected here. Missing, local-only or mismatched mounts stop release.
6. Create `/etc/meta-clinic/recovery-passphrase` once with at least 32 random bytes,
   root-owned mode 0600. Store a matching owner-controlled escrow copy on the
   separate key mount, also mode 0600. The key stays outside the deployment
   `secrets/` directory, so it is not bundled into its own recovery archive.
   Never regenerate or rotate it during a routine run. GnuPG AES256 encryption,
   local decrypt/hash round-trip, off-host ciphertext hash and off-host decrypt/hash
   checks are mandatory before migration. If this setup is unavailable, stop and
   flag the owner; do not replace it with an unencrypted or on-host-only backup.
7. Install files (this leaves the timer disabled):

   ```sh
   sudo bash ops/lightsail/install-automation.sh
   sudoedit /etc/meta-clinic/auto-release.json
   ```

   Fill the installed config from `auto-release.example.json`. Confirm private
   config/token/key files are root-owned mode 0600. The installer does not overwrite
   existing config, generate credentials, touch runtime secrets, or enable a timer.
8. Inspect the **current** HTTPS virtual host (the historical checked-in nginx file
   is not authoritative for today's TLS configuration). Check whether `/version`
   or `/update-log` already exists; preserve its clients/contract when integrating.
   Add inside the existing `aimetaclinic.com` server block:

   ```nginx
   include /etc/nginx/snippets/meta-clinic-version.conf;
   ```

   Preserve its existing TLS, auth, HSTS, CSP and proxy controls. If those routes
   already exist, reconcile them rather than add conflicting locations. Then:

   ```sh
   sudo nginx -t
   sudo systemctl reload nginx
   sudo python3 -B /opt/meta-clinic/automation/auto_release.py bootstrap
   ```

   Bootstrap verifies current API/web revision labels and the existing hosted
   journeys, then records a **baseline observation**, not a new deployment. Original
   deployment time remains unknown (`deployed_at: null`, separate `observed_at`).
   It refuses to overwrite an existing version manifest. Check `/version.json`
   through the public URL before activation.
9. After the above prerequisites pass, explicitly activate:

   ```sh
   sudo systemctl enable --now meta-clinic-auto-release.timer
   sudo systemctl start meta-clinic-auto-release.service
   sudo journalctl -u meta-clinic-auto-release.service -n 30 --no-pager
   ```

The timer polls two minutes after the prior run completes; releases never overlap.
The coordinator shares the existing release lock with manual `release.sh` calls
and holds it across build, prepare, encryption, deploy, reporting and rollback.
Root-owned installed control scripts are never replaced by a fetched candidate.
Build worktrees are isolated under `/opt/meta-clinic/builds/`. The current attempt's
newly created worktree and its Git registration are removed after the image builds,
including a failed build, before release preparation. Existing directories are never
reused, reset or deleted automatically; dirty worktrees are retained for inspection.
Cleanup does not force removal or prune unrelated worktrees. Keep previous images
and recovery files.
Storage cleanup is a separate, reviewed operation, not automatic `docker prune`.

### Version signal and QA behavior

`/version` and `/update-log` render the release history. `/version.json` and
`/update-log.json` return the same manifest with `schema_version`, `current`, and
`releases`. Each deployment entry has full `sha`, `previous_sha`, UTC `deployed_at`,
`summary`, and `notes_for_qa` (changed/retest/tradeoffs, issue and PR). Baseline and
rollback events are explicitly distinguished. HTML escapes all PR-derived text.
JSON and HTML switch together using one atomic directory pointer, with no-cache
headers. The public JSON is read back and checked before `ready_to_retest` is
recorded. If reporting fails after activation, the coordinator stops and attempts
to restore the previous images and publish a verified rollback entry.

The QA agent must read the newest Notes for QA **before testing**, compare the
full SHA, retest the specified behavior, and file any remaining failure against
the same issue. `fix_prepared`, a merged PR, a built image, and `deploying` are not
signals to retest. The version page only advances after hosted checks succeed.

### Failure, pause and exact rollback

Pause new polling without killing an in-flight migration:

```sh
sudo systemctl stop meta-clinic-auto-release.timer
sudo systemctl status meta-clinic-auto-release.service
```

Inspect `/var/lib/meta-clinic-release/status.json`, the service journal and
`/opt/meta-clinic/backups/release-<sha>`. Build/prepare/deploy/reporting failures
latch `/var/lib/meta-clinic-release/blocked`; future polls stop. A failed migration
does not authorize automatic database restoration. Preserve all recovery evidence.

For an **automated app-only release**, undo the exact full SHA:

```sh
sudo systemctl stop meta-clinic-auto-release.timer
sudo python3 -B /opt/meta-clinic/automation/auto_release.py rollback <FULL_SHA_OF_RELEASE_TO_UNDO>
```

The transaction identifies the previous revision, references and immutable image
IDs. Rollback verifies those identities, restarts the paired images, repeats the
hosted verifier, updates `current-revision`, and publishes a rollback entry with
Notes for QA. It refuses a stale historical rollback when another revision is live.
It never reverses migrations or rewinds application data. Only the app-only
automatic path creates this transaction; manual releases involving schema changes
need their own reviewed recovery procedure.

Do not clear the stop file or restart the timer until the failure is understood,
the live revision and public version agree, and the candidate will not immediately
repeat the failure. Clearing a stop file is an explicit operator recovery action;
the poller never deletes it. Root-only plaintext restore material remains in the
existing backup directory; encrypted off-host copies provide server-loss recovery.

### Acceptance still required

Supply one real QA issue and prove: labeled fix PR, required CI at its exact tested
merge commit, automatic main advancement, successful main CI, host image build,
both database restore checks, local/off-host encryption checks, per-database
migrations, login/authorization/Sandbox create/switch/session-reset verification,
public SHA/timestamp/Notes for QA update, and QA's independent retest. Record actual
revision and results. Retain the existing Relay-owned release path until a
separately approved replacement has completed that proof.

Source references: [GitHub workflow-token event behavior](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow),
[non-force reference updates](https://docs.github.com/en/rest/git/refs#update-a-reference),
and the checked-in CI/release scripts. Availability, installation, running-host
configuration and an actual QA round trip are separate from source validation.
