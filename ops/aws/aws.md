# AWS deployment boundary

**Source review: 2026-08-31; last recorded hosted verification: 2026-08-30.** Start with the [CI/CD developer guide](../../APPlyVault/03%20Execution/CICD.md), [environment runbook](ec2/environments.md) and [PostgreSQL cutover](ec2/postgres-cutover.md). Current source builds independent React/static-web and Rails API images backed by PostgreSQL. The hosted observations below concern the older SQLite bootstrap, not a fresh check or deployment of that pair.

The founder approved launching the smaller paid EC2 setup and authorized root until further notice. The [EC2 runbook](ec2/README.md) describes the running t3.micro in `us-east-1`: 8 GiB encrypted root plus 2 GiB SQLite data, private SSM/TLS access, managed secrets, release tooling and recovery. Its baseline is about $14/month before extras; the 2021 account's introductory EC2 allowance has expired. No existing bucket/objects were accessed. Host operation is verified, but outstanding base-image advisories and broader M1 acceptance remain open.

A subsequent request created a separate private production host and disabled production sample content. See [Staging and production](ec2/environments.md) for the two-host configuration, roughly $28 combined monthly baseline and pending CI/CD activation. No real-data or public release is inferred.

The checklist below preserves the earlier preparation context. Current development remains wholly synthetic, with no reported BAA and unchanged real-data gates. This is not a HIPAA-compliant configuration claim.

## Proposed low-dependency path

- One EC2 Linux host per environment, with separate static-web and Rails API containers behind the trusted TLS reverse proxy after coordinated cutover.
- Encrypted gp3 EBS for the operating system and persistent application/database storage.
- PostgreSQL 18.6 is selected for every application environment. Current private hosts retain their SQLite bootstrap until the [verified maintenance cutover](ec2/postgres-cutover.md); new deployments use a private PostgreSQL container with independent persistent storage and restricted runtime credentials. Database tables do not run in S3.
- The existing private S3 bucket can be evaluated for documents and versioned backups after its region, encryption, ownership, access, retention and recovery requirements are reviewed. Do not mount it as a live SQLite/PostgreSQL data directory.
- Clinic functionality remains local-only and disabled in production until a separate release decision and implementation.

EC2, EBS, data transfer, public IPv4, snapshots and selected key/logging services incur AWS charges. No Render, hosted database subscription, GitHub deployment or paid third-party authentication is needed. **The founder accepted the reduced setup's running cost; this is not an unlimited spending authorization.** S3 remains an unimplemented option.

## Before creating an instance

1. For the existing bootstrap, `us-east-1` is already selected. Reconfirm actual targets and maintenance scope before a change; any future bucket integration needs its own region/access review.
2. Agree the staging budget, instance size/CPU architecture, domain/TLS setup, authorized audience and operator. The Dockerfile must be built and tested on the selected architecture.
3. Individual MFA-protected administrative identities and least privilege remain recommended; the founder's later root authorization is the current task exception, not an IAM or MFA assessment. Prefer Session Manager access; review its role/network configuration. Do not enable public SSH or a database port by default.
4. Require IMDSv2, encrypt EBS/root volumes, set deliberate termination/snapshot behavior, and patch the OS and application. Do not give the instance broad S3 access.
5. Expose only the reviewed HTTPS entrypoint; use a private database socket/network. Decide whether HTTP is needed solely for certificate issuance/redirect. Restrict synthetic staging to approved reviewers; noindex is not access control.
6. Store deployment secrets outside Git, images, logs, chat and this vault. Ensure logs/errors contain no submitted names, documents, passwords or patient content.
7. Build API and frontend separately from **apps/api** and **apps/web**, each with its own Docker ignore rules; verify and release a matched pair. Never use the repository root/vault as a build context. Source transfer and delivery activation require their own authorized workflow.
8. Exercise login/logout, inquiry persistence, signing/progress, restart, encrypted backup and isolated restore, key recovery and rollback before calling staging ready. Versioning alone is not a tested backup strategy.

## Real-data boundary

A BAA may be deferred for a wholly synthetic prototype, but applicable agreements and safeguards must exist **before ePHI reaches AWS**, including test uploads—not merely before the first patient appointment. A BAA alone is insufficient: roles, risk analysis, exact eligible services/configurations, access control, audit, retention, recovery, incident response and clinical acceptance need review.

The current clinic prototype shares Rails, identity and local database infrastructure with the selling side. Front-facing separation does not establish security or legal separation. Decide the production deployment/data boundaries explicitly for the differently owned businesses. Do not remove production clinic denial just to make it reachable.

## Official references checked 2026-08-30

- [AWS EBS overview](https://aws.amazon.com/documentation-overview/ebs/): attached block storage can host a database; SSD options support transactional workloads.
- [AWS EBS encryption](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-encryption.html): encryption covers EBS volumes/snapshots with AWS KMS integration.
- [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html): business-associate arrangements before ePHI handling, plus risk analysis and safeguards.
- [HHS cloud guidance](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html): cloud responsibilities and BAA obligations, including encrypted/no-view storage.

This checklist does not replace qualified privacy/security, legal or clinical review.
