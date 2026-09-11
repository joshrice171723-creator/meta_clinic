# Meta Clinic Lightsail synthetic demo

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
