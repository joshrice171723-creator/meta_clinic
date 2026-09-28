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

Deployment is manual: pushing `main` does not change the running website.
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
