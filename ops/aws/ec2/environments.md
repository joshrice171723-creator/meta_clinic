# Staging and production

**Prepared source update (D-033):** the repository now builds independent `apps/api` and `apps/web` images, promoted as a verified digest pair. Installed host observations below still describe the unchanged Rails/SQLite bootstrap. After the pending cutover, Rails commands use `apply-api` rather than `apply-web`; the latter becomes static nginx with no application credentials. The installer, `apply-api.service`, `apply-web.service` and SSM `webImage` parameter must be updated together before workflow activation.

Source/runbook updated 2026-08-31; **last recorded hosted verification was 2026-08-30**, with no new host or account inspection in this update. At that verification both environments ran privately in `us-east-1`. They use separate EC2 instances, encrypted SQLite volumes, four independent managed secrets each, instance roles and ECR repositories. Both run `RAILS_ENV=production`; `APP_DEPLOYMENT_ENV` determines sample-content behavior. This is an initial deployment foundation, not a completed clinical system or high-availability architecture.

| Environment | Instance | Data volume | Sample portal content |
| --- | --- | --- | --- |
| Staging (`apply-synthetic-staging`) | `i-011a8232817dc587f` | `vol-08103d72933334fc8` | Allowed for provisioned synthetic accounts |
| Production (`apply-production`) | `i-0df3819ee5050b27b` | `vol-0f683ce09c9cb53a0` | Disabled; initially empty, not a current row-count assertion |

Each host is a t3.micro with 8 GiB root + 2 GiB data. The 2026-08-30 combined bootstrap estimate was **$27.28/month** (not repriced here), before ECR storage, snapshots, API calls, additional usage and tax. Storage is deliberately small and must be checked before releases. The [operations runbook](README.md) contains cost sources, security boundaries and recovery procedures. No load balancer, RDS, NAT gateway, public ingress or existing S3 integration was added.

Production skips sample seeds, assigns no demo paperwork when provisioning members, hides any existing sample guides/demo documents from HTML and API access, and rejects demo assignment/signing. It does not delete history. The clinic navigation is hidden in deployed environments because clinic routes remain unreleased. The password-free development login remains local-only, even in staging. Staging accounts use ordinary authentication. Neither environment is approved for PHI or confidential applicant documents; real signing remains disabled.

## Private access

Use **one tunnel at a time**, retaining local port 8443 so the browser's origin matches Rails. Substitute the instance from the table:

```sh
PATH="$HOME/.local/bin:$PATH" aws ssm start-session --region us-east-1 \
  --target INSTANCE_ID --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8443"],"localPortNumber":["8443"]}'
```

Open `https://localhost:8443`. Each host has a different localhost certificate. Retrieve only its public `localhost.crt` and verify its fingerprint over authenticated SSM, as described in the operations runbook. Never export the TLS private key or disable certificate validation. Do not reuse staging's CA file for production. No browser/system trust setting has been changed.

For account provisioning, start an ordinary private SSM terminal to the intended instance. On the recorded Rails/SQLite bootstrap use `sudo docker exec -it apply-web ./bin/rails members:create`; after the coordinated API/web cutover use `sudo docker exec -it apply-api ./bin/rails members:create`. Confirm the installed version before choosing the command. Enter credentials only in the operator's private terminal, without recording/transcription. Production provisioning creates an ordinary account without sample paperwork. No ready-to-use production account or default password was issued by setup.

Public access remains off. Connecting a domain requires the chosen domain/subdomain, authorized DNS changes, public TLS issuance/renewal, exact proxy/origin configuration and a reviewed audience/data scope. Opening port 3000 is not part of that process.

## Delivery automation — prepared, not activated

The root workflows and AWS delivery template are prepared locally. The [CI/CD guide](../../../APPlyVault/03%20Execution/CICD.md) is the canonical developer workflow and activation sequence. Source checks now cover the corrected API/web launcher names and parse every host shell script individually; all 12 offline release/launcher tests pass. These results do not install anything on EC2.

**Remaining activation work:** complete the [PostgreSQL cutover](postgres-cutover.md), install the pair-aware host files and fixed SSM document together, establish GitHub authentication/protection/delivery roles, publish reviewed source and observe the actual workflow runs. AWS login does not authenticate GitHub. The private repository's plan/policies were not rechecked; no upgrade or visibility change was made.

An authorized operator can sign in and run read-only preflight from the repository root:

```sh
gh auth login --hostname github.com --git-protocol ssh --web --skip-ssh-key
python3 ops/aws/ec2/configure-delivery.py
```

The preflight reads AWS account identity, GitHub admin access, actual OIDC subject format and existing production protection. It does not inspect installed host files, databases or a current CloudFormation change set.

Only within an approved activation task:

```sh
python3 ops/aws/ec2/configure-delivery.py --apply
```

This can create a missing production environment/main-only rule, create a CloudFormation change set and execute it only when every resource change is an addition. It refuses incompatible existing protections and AWS modifications. It is not transactional across GitHub/AWS: an environment or unexecuted change set may remain after a later failure. Inspect the outcome before retrying, and wait for actual stack completion. Required reviewers/branch protection, host installation, database cutover and app deployment are separate; this helper performs none of them. Do not bypass failures with wildcard trust, root access keys or public repository visibility.

`targets.json` holds non-secret resource metadata; role ARNs alone do not prove the roles exist. GitHub roles have no Secrets Manager or arbitrary RunShellScript permission. The fixed SSM document accepts `image` (API digest), `webImage` and `generation`, matching the installed pair-aware release command. An existing document needs its own reviewed update; the additions-only helper cannot silently modify it.

Once published and activated:

1. **CI** runs five jobs for PRs/main pushes and manual dispatch: Ruby security, Ruby lint, frontend tests/format/typecheck/build/audit, offline release/launcher contracts, and PostgreSQL-backed Rails plus frontend-to-API HTTP checks. It has no AWS permissions.
2. **Deploy staging** responds only to successful CI for a trusted main push, not PR/manual CI. It checks out that exact commit, builds separate Linux amd64 API/web images, verifies both deployment configurations with disposable synthetic data, and publishes matching `sha-<commit>-<run>-<attempt>-api` / `-web` tags.
3. Staging waits for both scans to complete, but applies no critical/high severity threshold. After SSM success it writes a format-2 receipt with the commit and both digests to `/apply/releases/staging`. Review that exact pair and the workflow summary.
4. Run **Promote production** on `main`, supplying `digest` (API), `web_digest` and `promote-production`. It requires the latest receipt to match both reviewed digests, the commit to belong to main's history, and both scans to be complete, at most 24 hours old and free of critical/high findings. Legacy single-image receipts are rejected. It copies the pair without rebuilding and verifies both destination digests. The tool reads existing scans; it does not start a fresh scan automatically.
5. Each workflow serializes its own releases without active cancellation; staging and production have separate concurrency groups. The host lock rejects stale generations, checks free space, backs up PostgreSQL, retains both prior image references and checks API/frontend TLS health, runtime database identity and environment policy. Inspect the printed SSM command before retrying a disconnected/unknown run; failure requires deliberate recovery, not an automatic down-migration.

No scheduled deployment exists. Independent required reviewers depend on the repository plan; manual promotion does not prove they are enforced. No developer access or account settings were changed by this source/documentation update.

## Current release limits

The initial deployment was a locally verified working-tree snapshot, explicitly tagged as a bootstrap release; it is not falsely attributed to a clean main commit or a GitHub run. See the vault Progress Log for the actual final digest and checks. Future automated images carry immutable commit/run tags.

Last verified installed image (2026-08-30), in both environment repositories: `sha256:e5d770997d9fefb95e516e3c9713c8e66b2653af8988b22f435356678f820e9f`, tagged `bootstrap-20260830-environments-nav`. Private HTTPS and SQLite integrity passed after that release and a production reboot. SSH is masked rather than only disabled, because reboot verification found the AMI restarted it; authenticated SSM remains the administration path.

**PostgreSQL source migration:** Rails, tests, CI, canonical structure, container verification and the prepared installer now use PostgreSQL 18. Both local container configurations and fresh/legacy/concurrent-write/restore rehearsals pass. These installed hosts still run the SQLite digest above: use the [controlled cutover runbook](postgres-cutover.md), preserve old data/images/keys and meet the release gates before installing the new source. The ordinary installer refuses an unverified legacy conversion. GitHub sign-in alone is not sufficient.

The 2026-08-30 ECR scan found **4 critical and 14 high OS-package findings** (no fresh scan in this update), plus medium/low findings, in the initial patched runtime. Both hosts remain private with synthetic/empty data. The proposed automated production gate rejects this image; bootstrap installation does not establish security acceptance or authorize bypassing that gate. Resolve or separately review remediation before broader release. See the operations runbook's upstream advisory references.

The recorded bootstrap has one application process and SQLite database per environment, with short maintenance downtime during deployment. It is not high availability, a PostgreSQL migration, a production clinical authorization, or a guarantee of capacity. Automated backups, monitoring/alerts, recovery targets, certificate renewal, MFA/access operations and full browser/security acceptance remain release work. No backup or monitoring schedule was created.

The existing staging stack was not replaced. Its runtime configuration was explicitly adopted as staging through SSM. A proposed CloudFormation update showed conditional host/attachment replacement and was removed without execution; review a recovery plan before any such infrastructure update. The production stack was created from the then-current parameterized SQLite template, not today's PostgreSQL UserData. Existing staging records/keys and the earlier recovery snapshot were preserved.

Sources: [GitHub OIDC and AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [immutable subject claims](https://docs.github.com/en/actions/reference/security/oidc), [deployment environment availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
