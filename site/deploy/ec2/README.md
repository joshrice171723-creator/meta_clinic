# EC2 synthetic staging — prepared, not provisioned

This package hosts the current Rails app **and its existing SQLite database** on one EC2 instance. It does not introduce PostgreSQL, migrate local records, enable clinic routes, or authorize patient/applicant data. The former Sites deployment and existing S3 bucket are untouched. No GitHub service is needed.

## Resources and access

| Component | Prepared configuration |
| --- | --- |
| Compute | Amazon Linux 2023, x86-64 `t3.small` (2 vCPU / 2 GiB), Standard CPU credits; throttles when credits run out rather than accruing Unlimited CPU charges |
| Storage | 20 GiB encrypted gp3 root; separate 30 GiB encrypted gp3 data volume at `/srv/apply`; database, backups and data retained on stack deletion/replacement |
| Network | Dedicated VPC/subnet; public IPv4 for outbound AWS/package access; **no inbound security-group rules**, no NAT gateway/load balancer |
| Administration | Current AWS root session expressly authorized by the founder until further notice; scoped individual MFA-protected access remains the recommended operating setup. SSM only; no SSH keys or inbound SSH |
| Private web | SSM forwards local port 8443 to the host's loopback TLS listener; exact origin `https://localhost:8443`; no public domain/access change |
| Process | One Rails process, read-only container, non-root app, dropped capabilities, capped local logs; nginx and Puma bind only to loopback |
| Secrets | Four independent generated Secrets Manager values; exact-resource read permission; runtime values only in root-owned `/run` tmpfs and Docker runtime metadata |
| Images | Dedicated encrypted private ECR repository with immutable tags; deploy by content digest; no source repository/vault upload |
| Recovery | Retained data volume/secrets/images plus pre-release SQLite backup; off-volume snapshot, key recovery and restore acceptance remain required |

The instance role can manage its SSM connection, pull from its own ECR repository, and read its four secrets. It has **no S3 permissions**, no image-push permission and no secret-write permission. ECR token issuance necessarily uses a wildcard resource; image access is repository-scoped. The app container cannot use the host's IMDSv2 credentials with the configured hop limit and bridge network. SSM operators effectively have root on this host; restrict that access separately. No team-wide access is granted automatically.

## Cost proposal — approval required before execution

US East (N. Virginia), 730 hours/month, checked 2026-08-30:

| Item | Estimated monthly USD |
| --- | ---: |
| t3.small at $0.0208/hour | 15.18 |
| 50 GiB gp3 at $0.08/GiB-month | 4.00 |
| One public IPv4 at $0.005/hour | 3.65 |
| Four Secrets Manager secrets at $0.40 each | 1.60 |
| Subtotal | **24.43** |

Allow roughly **$25/month before snapshots, image storage, API requests, transfer and tax**. This is an estimate, not a spending cap or Free Tier guarantee. ECR image storage is additional (listed at $0.10/GB-month); retained volumes, secrets, images and snapshots keep costing money after a stop/deletion. No budget alert, deletion schedule or external notification is created by this package.

The Pricing API returned $0.0208/hour and $0.08/GB-month for these exact us-east-1 products. The public T3 page currently displays $0.0209/hour, a small source discrepancy; recheck before launch. Sources: [T3](https://aws.amazon.com/ec2/instance-types/t3/), [EBS](https://aws.amazon.com/ebs/pricing/), [IPv4](https://aws.amazon.com/vpc/pricing/), [Secrets Manager](https://aws.amazon.com/secrets-manager/pricing/), [ECR](https://aws.amazon.com/ecr/pricing/).

## 1. Review the plan

The founder explicitly authorized the current **root session until further notice** on 2026-08-30. That instruction takes precedence over the earlier non-root prerequisite for this task; it does not grant permissions to other operators or change the instance's scoped role. Individual MFA-protected access remains recommended for ongoing operations. Confirm the expected account, region and cost before execution. `us-east-1` is the current local default, not an inferred region for the existing bucket. The planning helper rejects account mismatches and requires `--allow-root` for an expressly authorized root session; it cannot verify MFA configuration.

From the repository root, after substituting your profile/account:

```sh
bash site/deploy/ec2/plan.sh apply-staging YOUR_ACCOUNT_ID us-east-1
```

For the currently authorized root session, use the `default` profile and append `--allow-root`.

This creates an **unexecuted** CloudFormation change set. On 2026-08-30, `apply-synthetic-staging` in `us-east-1` has reviewed change set `awscli-cloudformation-package-deploy-1788140042`, status `CREATE_COMPLETE` / execution `AVAILABLE`: 18 additions, no modifications or removals. The empty stack is a review placeholder; no EC2/EBS/ECR/secrets or IAM role has been provisioned. Running-cost acceptance remains pending. Review the actual change set again before execution, including resolved AMI and IAM permissions.

A replacement of the host/data volume requires a separate recovery plan; the template does not automatically attach a retained old volume to a new host. Initial subnet availability/capacity and account quotas are not verified by template validation.

After cost/access approval, execute the specific reviewed change set through the CloudFormation console or `execute-change-set`. Enable stack termination protection after creation. The instance separately has termination protection. Do not execute a replacement/deletion as if it were an ordinary app release.

CloudFormation `CREATE_COMPLETE` is infrastructure state, **not application readiness**. Via an authorized SSM session, require `/etc/apply/bootstrap-ready`, the expected volume mounted at `/srv/apply`, Docker running and no unexpected listeners. If bootstrap fails, inspect `/var/log/cloud-init-output.log` (no secrets are in UserData); do not reformat a disk to retry. OS patch/reboot acceptance is still required.

## 2. Build and push only the app

Build and test from `site/backend/` only:

```sh
docker build --platform linux/amd64 -t apply-staging:RELEASE_ID site/backend
python3 site/deploy/ec2/verify-container.py apply-staging:RELEASE_ID
```

The verifier uses disposable Docker volumes, generated temporary test keys and a local nginx sidecar. It checks actual TLS, production guards, encrypted persistence, container recreation and isolated restore/decryption, then removes its test containers/volumes/keys. It does not contact AWS or open the development database. It does not validate Amazon Linux bootstrap, IAM, EBS snapshots or hosted acceptance.

Use a unique release ID. Never build from the repository root, upload the parent Git repository, or copy development databases/keys. The Docker ignore file excludes local environments, credentials, storage and logs. Rebuild if source changes after validation.

Get `RepositoryUri` and `InstanceId` from the created stack outputs. Authenticate Docker to ECR with `aws ecr get-login-password` piped directly into `docker login --username AWS --password-stdin`; use Docker's approved OS credential helper and log out afterward. Do not echo the token or use a password argument. Tag/push the tested image to that repository, inspect its scan results, and resolve its `sha256` image digest. AWS credentials remain on the host/CLI credential provider, never in the app image.

## 3. Install the release through SSM

The renderer packages **only four named deployment files** into a non-secret Run Command payload. It validates the image URI and pins the release to an immutable digest. It makes no AWS call itself.

```sh
python3 site/deploy/ec2/render-ssm-command.py \
  ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/REPOSITORY@sha256:DIGEST \
  > /tmp/apply-release-command.json
aws ssm send-command --region us-east-1 --document-name AWS-RunShellScript \
  --instance-ids INSTANCE_ID --parameters file:///tmp/apply-release-command.json
```

Use the actual same-account repository and instance. Inspect completion status; failure is not a deployment. The installer pulls the image before stopping the old app, backs up a stopped database with SQLite's backup API, records the previous image, then starts the new image and checks trusted TLS health. A failed migration/health check leaves the app stopped: recovery requires the matched prior image, database and keys, not a blind code rollback. Never use `docker inspect`, `printenv`, `cat /run/apply/runtime.env` or verbose shell tracing in shared output.

## 4. Open the private preview

Install the official [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) on the operator's machine, then:

```sh
aws ssm start-session --region us-east-1 --target INSTANCE_ID \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8443"],"localPortNumber":["8443"]}'
```

The host generates a 90-day self-signed certificate for **localhost only**. Retrieve only `/etc/apply/tls/localhost.crt` and verify its SHA-256 fingerprint through the authenticated SSM channel. Never export `localhost.key`. Use the public certificate as the CA file for command-line checks (`curl --cacert PATH https://localhost:8443/up`). Browser review requires an explicit operator trust decision for that exact certificate; do not silently modify system trust or disable TLS verification. Certificate renewal/trust and an actual domain are separate operator work before wider release. No public HTTPS is exposed by this setup.

Provision synthetic accounts with the existing interactive `members:create` task using `docker exec -it apply-web ./bin/rails members:create`. The password prompt must stay in the operator's private terminal, with no session transcript/recording; never use a Run Command payload or chat for passwords. No password-free hosted demo or default account is introduced. Clinic routes and real paperwork signing remain disabled in production.

## 5. Acceptance and recovery before declaring M1 complete

1. Verify image architecture/digest, IMDSv2, disk encryption/mount identity, no inbound rules, only loopback listeners, and role scope. Verify nginx sets exact host/protocol headers and untrusted forwarded headers cannot change identity.
2. Through actual SSM/TLS, exercise ordinary login, CSRF failures, other-account denial, session/logout, synthetic paperwork/training and inquiry persistence. Confirm Secure/HttpOnly/SameSite cookies, protected no-store responses and disabled clinic/demo shortcuts. All tunnel users share a loopback proxy address and process-local limits: this package is for one operator, not a validated multi-reviewer rate-limiting design.
3. Create a synthetic encrypted record, restart/redeploy, and verify it decrypts. Confirm restart behavior after a host reboot and that missing data mount or missing secrets fails closed.
4. Agree RPO/RTO, stop writes, produce a SQLite backup, and take an encrypted EBS snapshot outside the live volume. Retain the image digest and corresponding secret **version references**, never secret values, in controlled recovery records. Test a restore on isolated storage with the matching keys; check SQLite integrity, decrypted content and account isolation. Same-volume pre-release backups are not disaster recovery.
5. Rehearse a failed release and explicitly restore its matching prior database/image when needed. Preserve WAL/SHM and current failure evidence; do not overwrite a live database or run unreviewed down-migrations. Never rotate encryption keys/salt or delete retained secrets without a tested key/data migration and recovery plan.
6. Record the operator, manual disk/health/certificate checks, alerts/incident responsibility, maintenance and accepted recovery results. No recurring jobs, automatic snapshots, budget alerts or notifications have been set up. Existing M0 browser/CI acceptance remains open.

Do not treat stack success, container health, or a working database as HIPAA, clinical, confidential-document or public-release approval. L-05 and the existing professional/operational gates remain open.

## Teardown

No automatic teardown is provided. After authorized backup/export and an explicit deletion decision, disable the appropriate stack/instance termination protections and remove compute/network resources. Data EBS, ECR and all four secrets deliberately remain retained and billed; inventory and remove them only under the accepted retention/recovery decision. Removing root storage does not remove the retained data volume, but destroys that host's local TLS private key.

## Implementation references

- [EC2 CloudFormation resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-instance.html)
- [Amazon Linux 2023 Docker installation](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/create-container-image.html)
- [AL2023 AWS CLI v2](https://docs.aws.amazon.com/linux/al2023/ug/awscli2.html)
- [Session Manager prerequisites](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-prerequisites.html)
- [CloudFormation generated secrets](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-secretsmanager-secret.html)

Local validation and actual launch status are recorded in the vault's Progress Log and T-20; this runbook does not claim a provisioned server or completed restore exercise.
