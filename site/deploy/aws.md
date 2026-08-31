# AWS staging preparation — not deployed

The founder has now requested EC2 setup for the app and database. The concrete [EC2 deployment package](ec2/README.md) supplies CloudFormation, private SSM/TLS access, encrypted persistent SQLite storage, managed secrets, release tooling and a recovery runbook. It is **prepared, not provisioned**. The founder expressly authorized the current root session until further notice. A reviewed, unexecuted CloudFormation change set in `us-east-1` proposes 18 additions; only its empty review stack exists. No compute/storage/secrets/roles have been provisioned and no bucket/objects were accessed. Acceptance of the roughly $25/month baseline and proposed region remains pending.

The checklist below preserves the earlier preparation context. Current development remains wholly synthetic, with no reported BAA and unchanged real-data gates. This is not a HIPAA-compliant configuration claim.

## Proposed low-dependency path

- One EC2 Linux host running the Rails selling/onboarding application behind a TLS reverse proxy.
- Encrypted gp3 EBS for the operating system and persistent application/database storage.
- SQLite may remain for one-instance **synthetic staging**. Evaluate PostgreSQL on EC2 for the future clinical workload; it is not configured in this commit and database tables do not run in S3.
- The existing private S3 bucket can be evaluated for documents and versioned backups after its region, encryption, ownership, access, retention and recovery requirements are reviewed. Do not mount it as a live SQLite/PostgreSQL data directory.
- Clinic functionality remains local-only and disabled in production until a separate release decision and implementation.

EC2, EBS, S3, data transfer, public IPv4, snapshots and any selected key/logging services can incur AWS charges. No Render, hosted database subscription, GitHub deployment or paid third-party authentication is needed by this plan. **No paid infrastructure has been provisioned or budget assumed.**

## Before creating an instance

1. Confirm `us-east-1` (N. Virginia) versus `us-east-2` (Ohio), including the existing bucket's actual region. Do not infer this from your physical location.
2. Agree the staging budget, instance size/CPU architecture, domain/TLS setup, authorized audience and operator. The Dockerfile must be built and tested on the selected architecture.
3. Individual MFA-protected administrative identities and least privilege remain recommended; the founder's later root authorization is the current task exception, not an IAM or MFA assessment. Prefer Session Manager access; review its role/network configuration. Do not enable public SSH or a database port by default.
4. Require IMDSv2, encrypt EBS/root volumes, set deliberate termination/snapshot behavior, and patch the OS and application. Do not give the instance broad S3 access.
5. Expose only the reviewed HTTPS entrypoint; use a private database socket/network. Decide whether HTTP is needed solely for certificate issuance/redirect. Restrict synthetic staging to approved reviewers; noindex is not access control.
6. Store deployment secrets outside Git, images, logs, chat and this vault. Ensure logs/errors contain no submitted names, documents, passwords or patient content.
7. Build from **site/backend only** with its Docker ignore rules. Never use the repository root/vault as the container context. Source can be transferred directly through an approved channel; GitHub is not a database or a deployment requirement.
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
