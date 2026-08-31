# EC2 operations

Source/runbook updated 2026-08-31. Staging activation/cutover is now verified; explicitly dated 2026-08-30 observations below remain historical and production was not changed. The [CI/CD guide](../../../APPlyVault/03%20Execution/CICD.md) owns developer commands, the five CI jobs and coordinated release activation.

This package now prepares **PostgreSQL 18.6, a Rails JSON API and a separate static frontend** on one EC2 instance per environment. Staging now runs this stack; production retains its SQLite bootstrap; see [Staging and production](environments.md) for actual installed state and [the PostgreSQL cutover runbook](postgres-cutover.md) before using these changed tools. Local PostgreSQL tests do not constitute a hosted migration. Clinic routes remain denied; no patient/applicant data, S3 integration or public access is authorized.

## Resources and access

| Component | Prepared configuration |
| --- | --- |
| Compute | Amazon Linux 2023, x86-64 `t3.micro` (2 vCPU / 1 GiB), Standard CPU credits; throttles when credits run out rather than accruing Unlimited CPU charges |
| Storage | 8 GiB encrypted gp3 root; separate 2 GiB encrypted gp3 data volume at `/srv/apply`; database and backups retained on stack deletion/replacement |
| Network | Dedicated VPC/subnet; public IPv4 for outbound AWS/package access; **no inbound security-group rules**, no NAT gateway/load balancer |
| Administration | Current AWS root session expressly authorized by the founder until further notice; scoped individual MFA-protected access remains the recommended operating setup. SSM only; no SSH keys or inbound SSH |
| Private web | SSM forwards local port 8443 to the host's loopback TLS listener; exact origin `https://localhost:8443`; no public domain/access change |
| Process | One Rails process: 500 MiB API, 64 MiB static frontend and 256 MiB PostgreSQL limits, no container swap; read-only/non-root app containers, dropped capabilities and capped logs. Host app ports and TLS edge bind only to loopback; PostgreSQL is private |
| Secrets | Six independent generated Secrets Manager values after cutover (four application keys, database owner and runtime credentials); exact-resource read permission; runtime values only in root-owned `/run` tmpfs and Docker runtime metadata |
| Images | Dedicated encrypted private ECR repository with immutable tags; deploy by content digest; no source repository/vault upload |
| Recovery | Retained data volume/secrets/images plus pre-release PostgreSQL custom-format backup; off-volume snapshot, key recovery and restore acceptance remain required |

The instance role can manage its SSM connection, pull from its own ECR repository, and read only its own explicitly listed secrets. It has **no S3 permissions**, no image-push permission and no secret-write permission. ECR token issuance necessarily uses a wildcard resource; image access is repository-scoped. The app containers cannot use the host's IMDSv2 credentials with the configured hop limit and bridge network. SSM operators effectively have root on this host; restrict that access separately. No team-wide access is granted automatically.

## Existing bootstrap cost and Free Tier

US East (N. Virginia), 730 hours/month, checked 2026-08-30:

| Item | Estimated monthly USD |
| --- | ---: |
| t3.micro at $0.0104/hour | 7.59 |
| 10 GiB gp3 at $0.08/GiB-month | 0.80 |
| One public IPv4 at $0.005/hour | 3.65 |
| Four Secrets Manager secrets at $0.40 each | 1.60 |
| Subtotal | **13.64** |

Allow roughly **$14/month before snapshots, image storage, API requests, transfer and tax**. The founder explicitly approved paying the reduced setup's cost on 2026-08-30 after first requesting free operation. This is an estimate, not a spending cap. ECR image storage is additional (listed at $0.10/GB-month); retained volumes, secrets, images and snapshots keep costing money after a stop/deletion. No budget alert, deletion schedule or external notification is created by this package.

The Pricing API returned $0.0104/hour for the exact us-east-1 t3.micro Linux/shared product. Sources: [T3](https://aws.amazon.com/ec2/instance-types/t3/), [EBS](https://aws.amazon.com/ebs/pricing/), [IPv4](https://aws.amazon.com/vpc/pricing/), [Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/), [ECR](https://aws.amazon.com/ecr/pricing/).

Account Management reports creation on 2021-12-22; the account's introductory EC2 allowance has expired under the [legacy Free Tier rules](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html). An instance's `FreeTierEligible` label does not establish account eligibility. The Free Tier plan API returned no plan data and the usage API listed no EC2 allowance. Promotional credits were not verified because the browser needed separate sign-in; none are assumed in this estimate. No account plan was upgraded or new account created.

The PostgreSQL plan adds two managed secrets per environment (about $0.80/month before calls) to the bootstrap estimate above; this additional provisioning is pending.

This replaces the initial 50 GiB/t3.small proposal. Small disks need manual free-space checks before each release; retain only the images needed for the accepted rollback plan and do not prune volumes or the current/prior release blindly. Monitor `/` and `/srv/apply` separately. Expand the appropriate volume before capacity is exhausted. The reduced container passed local synthetic checks, not a load/capacity assessment.

## Original staging release and scan limits

The approved server is `i-011a8232817dc587f` in `us-east-1a`, stack `apply-synthetic-staging`, with data volume `vol-08103d72933334fc8`. The app uses the private ECR repository `apply-synthetic-staging-images-9bigtc87uopg`; the original release `20260830-micro-2` ran the amd64 digest `sha256:333f651ee18af05982caa0c136f39bfc5e45d012e7b88561aa1482c158f8da74`. There are no public inbound rules; the packaged SSH daemon is disabled. Actual acceptance and remaining operational work are recorded in the Progress Log/T-20.

On this Mac, the official Session Manager plugin is installed at `~/.local/bin/session-manager-plugin`. To reconnect the preview:

```sh
PATH="$HOME/.local/bin:$PATH" aws ssm start-session --region us-east-1 \
  --target i-011a8232817dc587f --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8443"],"localPortNumber":["8443"]}'
```

Then use `https://localhost:8443`. The public certificate is saved at `~/.local/state/apply-ec2/localhost.crt`; its SHA-256 fingerprint was matched through authenticated SSM: `52:DA:6E:55:E1:5F:5D:81:AB:68:91:29:84:9A:71:E7:AC:4E:69:1F:D5:70:4B:E1:AE:34:08:1D:5B:24:4D:B5`. Command-line verification uses `curl --cacert "$HOME/.local/state/apply-ec2/localhost.crt" https://localhost:8443/up`. Browser trust requires the operator's decision for this exact certificate; system/browser trust was not changed. Reconnect after a host reboot or expired session. No public IP URL is an application entrypoint.

The first ECR scan reported 4 critical and 21 high findings. Updating runtime OS packages supplied OpenSSL 3.5.7 and reduced the deployed digest to **4 critical, 14 high, 5 medium and 1 low**. Stable APT candidates still match installed glibc, Perl, libssh2 and SQLite versions; this is not a clean vulnerability scan. Debian describes the glibc [scanf issue](https://security-tracker.debian.org/tracker/CVE-2026-5450) and Perl [Socket](https://security-tracker.debian.org/tracker/CVE-2026-12087), [Storable](https://security-tracker.debian.org/tracker/CVE-2026-57433) and [regex](https://security-tracker.debian.org/tracker/CVE-2026-13221) findings. Storable is absent from this runtime, while Perl Socket is present. These observations do not dismiss all findings or establish complete exploitability. Resolve or explicitly assess the remaining findings before broader release; synthetic private staging does not authorize real data.

## 1. Review the plan

The founder explicitly authorized the current **root session until further notice** on 2026-08-30. That instruction takes precedence over the earlier non-root prerequisite for this task; it does not grant permissions to other operators or change the instance's scoped role. Individual MFA-protected access remains recommended for ongoing operations. Confirm the expected account, region and cost before execution. `us-east-1` is the current local default, not an inferred region for the existing bucket. The planning helper rejects account mismatches and requires `--allow-root` for an expressly authorized root session; it cannot verify MFA configuration.

From the repository root, after substituting your profile/account:

```sh
bash ops/aws/ec2/plan.sh apply-staging YOUR_ACCOUNT_ID us-east-1
```

For the currently authorized root session, use the `default` profile and append `--allow-root`.

The helper creates an **unexecuted** CloudFormation change set. On 2026-08-30, the reduced `apply-synthetic-staging` change set `awscli-cloudformation-package-deploy-1788140714` was reviewed: 18 additions, no modifications or removals. The founder then explicitly approved paying and instructed launch; that exact change set was executed. The earlier larger proposal was removed without execution. Stack termination protection is enabled. Current launch/acceptance results are recorded in the vault's Progress Log and T-20.

A replacement of the host/data volume requires a separate recovery plan; the template does not automatically attach a retained old volume to a new host. Initial subnet availability/capacity and account quotas are not verified by template validation.

After cost/access approval, execute the specific reviewed change set through the CloudFormation console or `execute-change-set`. Enable stack termination protection after creation. The instance separately has termination protection. Do not execute a replacement/deletion as if it were an ordinary app release.

CloudFormation `CREATE_COMPLETE` is infrastructure state, **not application readiness**. Via an authorized SSM session, require `/etc/apply/bootstrap-ready`, the expected volume mounted at `/srv/apply`, Docker running and no unexpected listeners. If bootstrap fails, inspect `/var/log/cloud-init-output.log` (no secrets are in UserData); do not reformat a disk to retry. OS patch/reboot acceptance is still required.

## 2. Build and push only the app

D-033 defines a two-image release; staging completed installation and PostgreSQL cutover on 2026-08-31, while production retains its Rails/SQLite bootstrap. Complete the documented PostgreSQL cutover and coordinated installer/systemd/SSM update before activating the new pair. Backend container/service is `apply-api` on private port 3001; static `apply-web` serves private port 8080 with no app secrets. Neither publishes host ports. The loopback HTTPS edge routes to validated internal IPs, refreshed by each service's `ExecStartPost` hook. The API launcher name now matches its service's stop/cleanup targets; offline regression tests execute the actual launcher with isolated command stubs. CI parses each host shell script separately. Only staging's host files were updated in the authorized activation.

Build both apps independently from their own contexts:

```sh
docker build --pull --no-cache --platform linux/amd64 --provenance=false -t apply-api:RELEASE_ID apps/api
docker build --pull --no-cache --platform linux/amd64 --provenance=false -t apply-web:RELEASE_ID apps/web
python3 ops/aws/ec2/verify-container.py apply-api:RELEASE_ID --web-image apply-web:RELEASE_ID --environment staging
python3 ops/aws/ec2/verify-container.py apply-api:RELEASE_ID --web-image apply-web:RELEASE_ID --environment production
```

Use the fresh build for releases so cached package layers do not skip security updates. The verifier uses disposable Docker volumes, generated temporary test keys and a local nginx sidecar. It checks actual TLS, production guards, encrypted persistence, container recreation and isolated restore/decryption, then removes its test containers/volumes/keys. It does not contact AWS or open the development database. It does not validate Amazon Linux bootstrap, IAM, EBS snapshots or hosted acceptance.

Use a unique release ID. Never build from the repository root, upload the parent Git repository, or copy development databases/keys. The Docker ignore file excludes local environments, credentials, storage and logs. Rebuild if source changes after validation.

Get `RepositoryUri` and `InstanceId` from the created stack outputs. Authenticate Docker to ECR with `aws ecr get-login-password` piped directly into `docker login --username AWS --password-stdin`; use Docker's approved OS credential helper and log out afterward. Do not echo the token or use a password argument. Tag/push both tested images to that repository using one release label plus `-api`/`-web` suffixes. Record both `sha256` digests as a pair. Staging waits for complete scans; automated production promotion additionally requires both scans to be at most 24 hours old with zero critical/high findings and an exact match to the latest verified staging receipt. AWS credentials remain on the host/CLI credential provider, never in the app image.

## 3. Install the release through SSM

The renderer packages **only seven named deployment files** into a non-secret Run Command payload. It validates both image URIs and pins the release to an immutable API/web pair. It makes no AWS call itself. This privileged manual install path is separate from GitHub's fixed digest-only SSM document; it does not perform the legacy database cutover or establish a successful staging receipt. Its omitted generation defaults to the manual value `0`, so automated releases must use the ordinary generation-bearing workflow.

```sh
python3 ops/aws/ec2/render-ssm-command.py \
  ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/REPOSITORY@sha256:API_DIGEST \
  --web-image ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/REPOSITORY@sha256:WEB_DIGEST \
  > /tmp/apply-release-command.json
aws ssm send-command --region us-east-1 --document-name AWS-RunShellScript \
  --instance-ids INSTANCE_ID --parameters file:///tmp/apply-release-command.json
```

Use the actual same-account repository and instance. Inspect completion status; failure is not a deployment. The installer pulls both images before stopping the old app, refuses unconverted legacy storage, backs up PostgreSQL, migrates explicitly using maintenance credentials, applies restricted runtime grants, records both previous image references, then starts the API and static web services and checks both API and frontend health through trusted TLS. A failed migration/health check leaves the app stopped: recovery requires the matched prior API/web pair, database and keys, not a blind code rollback. Never use `docker inspect`, `printenv`, `cat /run/apply/runtime.env` or verbose shell tracing in shared output.

## 4. Open the private preview

Install the official [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) on the operator's machine, then:

```sh
aws ssm start-session --region us-east-1 --target INSTANCE_ID \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8443"],"localPortNumber":["8443"]}'
```

The host generates a 90-day self-signed certificate for **localhost only**. Retrieve only `/etc/apply/tls/localhost.crt` and verify its SHA-256 fingerprint through the authenticated SSM channel. Never export `localhost.key`. Use the public certificate as the CA file for command-line checks (`curl --cacert PATH https://localhost:8443/up`). Browser review requires an explicit operator trust decision for that exact certificate; do not silently modify system trust or disable TLS verification. Certificate renewal/trust and an actual domain are separate operator work before wider release. No public HTTPS is exposed by this setup.

After the coordinated split installation, provision synthetic accounts with the existing interactive `members:create` task using `docker exec -it apply-api ./bin/rails members:create`. On the older Rails/SQLite bootstrap only, Rails still resides in `apply-web`; confirm installed state before choosing that legacy command. The password prompt must stay in the operator's private terminal, with no session transcript/recording; never use a Run Command payload or chat for passwords. No password-free hosted demo or default account is introduced. Clinic routes and real paperwork signing remain disabled in production.

## 5. Acceptance and recovery before declaring M1 complete

Initial cloud verification on 2026-08-30 passed real TLS/login/logout, Secure/HttpOnly/SameSite cookies, CSRF and admin denial, disabled clinic/demo routes, encrypted inquiry writes, release restart and full host reboot. Encrypted snapshot `snap-06488228df1ab8884` was restored to a temporary separate volume; SQLite integrity and decryption with the managed keys passed. That temporary volume was unmounted, detached and deleted. The snapshot remains retained and billed. Non-secret resource/secret-version references are stored with mode 0600 in `~/.local/state/apply-ec2/recovery.json`. One synthetic verification account remains disabled and its generated password was discarded; no usable member account/default password was issued. This bounded exercise does not establish RPO/RTO, external operator/key recovery, full account/workflow acceptance, or an ongoing backup schedule.

1. Verify image architecture/digest, IMDSv2, disk encryption/mount identity, no inbound rules, only loopback listeners, and role scope. Verify nginx sets exact host/protocol headers and untrusted forwarded headers cannot change identity.
2. Through actual SSM/TLS, exercise ordinary login, CSRF failures, other-account denial, session/logout, synthetic paperwork/training and inquiry persistence. Confirm Secure/HttpOnly/SameSite cookies, protected no-store responses and disabled clinic/demo shortcuts. All tunnel users share a loopback proxy address and process-local limits: this package is for one operator, not a validated multi-reviewer rate-limiting design.
3. Create a synthetic encrypted record, restart/redeploy, and verify it decrypts. Confirm restart behavior after a host reboot and that missing data mount or missing secrets fails closed.
4. Agree RPO/RTO, stop writes, produce a PostgreSQL custom-format backup, and take an encrypted EBS snapshot outside the live volume. Retain both API/web image digests and corresponding secret **version references**, never secret values, in controlled recovery records. Test a restore on isolated storage with the matching keys; check restored schema/constraints, inventory reconciliation, decrypted content and account isolation. Same-volume pre-release backups are not disaster recovery.
5. Rehearse a failed release and explicitly restore its matching prior database/image pair when needed. Preserve legacy SQLite WAL/SHM when applicable and current failure evidence; do not overwrite a live database or run unreviewed down-migrations. Never rotate encryption keys/salt or delete retained secrets without a tested key/data migration and recovery plan.
6. Record the operator, manual disk/health/certificate checks, alerts/incident responsibility, maintenance and accepted recovery results. No recurring jobs, automatic snapshots, budget alerts or notifications have been set up. Existing M0 browser/CI acceptance remains open.

Do not treat stack success, container health, or a working database as HIPAA, clinical, confidential-document or public-release approval. L-05 and the existing professional/operational gates remain open.

## Teardown

No automatic teardown is provided. After authorized backup/export and an explicit deletion decision, disable the appropriate stack/instance termination protections and remove compute/network resources. Data EBS, ECR and all provisioned secrets deliberately remain retained and billed; inventory and remove them only under the accepted retention/recovery decision. Removing root storage does not remove the retained data volume, but destroys that host's local TLS private key.

## Implementation references

- [EC2 CloudFormation resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-instance.html)
- [Amazon Linux 2023 Docker installation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-container-image.html)
- [AL2023 AWS CLI v2](https://docs.aws.amazon.com/linux/al2023/ug/awscli2.html)
- [Session Manager prerequisites](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-prerequisites.html)
- [CloudFormation generated secrets](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-secretsmanager-secret.html)

Current deployment status and remaining limits are recorded in [Staging and production](environments.md), the vault Progress Log and T-20. Historical checks above retain their original scope.
