# Staging and production

**Protected owner review active 2026-09-01:** [IP-based HTTPS setup](review-access.md) serves fixed staging address `https://44.218.229.179`, with ACME-only public HTTP, an authenticated HTTPS edge, two protected individual reviewer credentials and certificate maintenance. `StagingDemoUser` and the retained owner reviewer passed private TLS/login/authorization/logout checks; the final outside-AWS path also passed. The founder explicitly accepted the exact current pair for this limited synthetic preview. That pair is main `f8a0cae` / run `33521216835`; completed scans report API 6 critical/15 high and web 1 critical/9 high. Production remains untouched; the older verification entries below retain their original scope.

**Staging cutover verified 2026-08-31:** staging runs independent API/static-web images and PostgreSQL 18.6. Rails commands use `apply-api`; `apply-web` is static nginx with no credentials. The installed pair-aware installer/services/SSM contract agree. The trusted edge resolves internal container addresses after every service start; no published Docker ports or external app networks are needed. Production remains on its prior SQLite bootstrap and was not changed.

Source/runbook updated 2026-09-01. Both environments remain private in `us-east-1`, with separate instances, encrypted EBS, roles and ECR. Staging has six application/database managed secrets plus two review credentials in the separate review stack; production retains its four original secrets. Production's last hosted verification remains 2026-08-30. Both run `RAILS_ENV=production`; `APP_DEPLOYMENT_ENV` determines sample-content behavior. This is an initial deployment foundation, not a completed clinical system or high-availability architecture.

| Environment | Instance | Data volume | Sample portal content |
| --- | --- | --- | --- |
| Staging (`apply-synthetic-staging`) | `i-011a8232817dc587f` | `vol-08103d72933334fc8` | Allowed for provisioned synthetic accounts |
| Production (`apply-production`) | `i-0df3819ee5050b27b` | `vol-0f683ce09c9cb53a0` | Disabled; initially empty, not a current row-count assertion |

Each host is a t3.micro with 8 GiB root + 2 GiB data. The 2026-08-30 combined bootstrap estimate was **$27.28/month** (not repriced here), before ECR storage, snapshots, API calls, additional usage and tax. Storage is deliberately small and must be checked before releases. The [operations runbook](README.md) contains cost sources, security boundaries and recovery procedures. No load balancer, RDS, NAT gateway, public ingress or existing S3 integration was added.

Production skips sample seeds, assigns no demo paperwork when provisioning members, hides any existing sample guides/demo documents from HTML and API access, and rejects demo assignment/signing. It does not delete history. The clinic navigation is hidden in deployed environments because clinic routes remain unreleased. The password-free development login remains local-only, even in staging. Staging accounts use ordinary authentication. Neither environment is approved for PHI or confidential applicant documents; real signing remains disabled.

## Verified staging release and recovery

An archived staging deployment run, attempt 5, completed successfully on 2026-08-31 for main commit `a710f635f4f0ca653cb6213200a6b4b3845a6914`. Format-2 receipt `/apply/releases/staging` records API `sha256:8d632c3197247c3560f391ac24136e9483516a37ebc22ce2cea1f11fb44eb093`, web `sha256:e2511898a1f45afe4e7341aa687ed60c7b506aac859727c242e4b5eeb5dc1306`, SSM `703529ae-5142-43fd-9520-95760ef4dd75` and generation `3336623812405`.

Five synthetic rows survived conversion; original keys/SQLite/image were retained. Encrypted snapshot `snap-0e3e7a87bdfe0988b` completed before cutover. Root-only recovery metadata/offline SQLite are under `/srv/apply/backups/cutover-20260831/`; the PostgreSQL dump is `/srv/apply/backups/cutover-20260831.dump`. Separate-cluster restore, decryption, runtime permission denials, reconciliation, private HTTPS and app restart passed. The failed never-imported destination and stopped restore cluster are retained as evidence; no destructive reset was used. See the vault Progress Log for scope and unresolved operational acceptance.

## Private access

Staging's prepared reviewer configuration uses the exact IP origin; the legacy localhost tunnel below still supports health checks but no longer supplies the staging browser-login origin. The intended reviewer URL remains unavailable externally until the reviewed HTTPS activation. Production's existing localhost preview is unchanged. See [review access](review-access.md) for the prepared configuration and reversal procedure.

Use **one tunnel at a time**, retaining local port 8443 so the browser's origin matches Rails. Substitute the instance from the table:

```sh
PATH="$HOME/.local/bin:$PATH" aws ssm start-session --region us-east-1 \
  --target INSTANCE_ID --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["8443"],"localPortNumber":["8443"]}'
```

Open `https://localhost:8443`. Each host has a different localhost certificate. Retrieve only its public `localhost.crt` and verify its fingerprint over authenticated SSM, as described in the operations runbook. Never export the TLS private key or disable certificate validation. Do not reuse staging's CA file for production. No browser/system trust setting has been changed.

For account provisioning, start an ordinary private SSM terminal to the intended instance. On staging use `sudo docker exec -it apply-api ./bin/rails members:create`; on the unchanged production bootstrap use `sudo docker exec -it apply-web ./bin/rails members:create`. Confirm the installed version before choosing the command. Enter credentials only in the operator's private terminal, without recording/transcription. Production provisioning creates an ordinary account without sample paperwork. No ready-to-use production account or default password was issued by setup.

Public application access remains off; staging HTTP is limited to certificate challenges. A domain is optional: either a domain with authorized DNS or a stable IP needs trusted TLS/renewal, exact proxy/origin configuration and a reviewed audience/data scope. Opening port 3000 is not part of that process.

## Delivery automation — staging active, production pending

Staging's OIDC provider/role and fixed SSM document are installed in `apply-delivery`, with `EnableProduction=false`. Authentication was verified in GitHub; production role/settings remain untouched. The [developer CI boundary](../../../docs/development/ci.md) explains source checks; this runbook is the authority for installed environments and hosted outcomes. Source checks now cover the corrected API/web launcher names and parse every host shell script individually; all 22 offline release/configuration/launcher/route tests pass. Hosted TLS, restart, preserved-data decryption and separate PostgreSQL restore also passed; offline tests alone do not establish those outcomes.

**Production remains pending:** its [PostgreSQL cutover](postgres-cutover.md), host installation, role and environment/reviewer protections require separate authorization and verification. Staging recovery evidence and automated release receipts do not authorize promotion. No plan upgrade, visibility change or branch/reviewer setting was made.

An authorized operator can sign in and run read-only preflight from the repository root:

```sh
gh auth login --hostname github.com --git-protocol ssh --web --skip-ssh-key
python3 ops/aws/ec2/configure-delivery.py --staging-only
```

The staging-only preflight reads AWS identity, GitHub admin access and resolved OIDC subject metadata, without reading/changing production controls. It does not inspect installed host files, databases or a current CloudFormation change set.

Only within an approved activation task:

```sh
python3 ops/aws/ec2/configure-delivery.py --staging-only --apply
```

Staging-only mode creates no production role or environment settings. Without `--staging-only`, the helper may create a missing production environment/main-only rule. Both modes execute only additions-only CloudFormation changes. It refuses incompatible existing protections and AWS modifications. It is not transactional across GitHub/AWS: an environment or unexecuted change set may remain after a later failure. Inspect the outcome before retrying, and wait for actual stack completion. Required reviewers/branch protection, host installation, database cutover and app deployment are separate; this helper performs none of them. Do not bypass failures with wildcard trust, root access keys or public repository visibility.

`targets.json` holds non-secret resource metadata; role ARNs alone do not prove the roles exist. GitHub roles have no Secrets Manager or arbitrary RunShellScript permission. The fixed SSM document accepts `image` (API digest), `webImage` and `generation`, matching the installed pair-aware release command. An existing document needs its own reviewed update; the additions-only helper cannot silently modify it.

Release behavior:

1. **CI** runs five jobs for PRs/main pushes and manual dispatch: Ruby security, Ruby lint, frontend tests/format/typecheck/build/audit, offline release/launcher contracts, and PostgreSQL-backed Rails plus frontend-to-API HTTP checks. It has no AWS permissions.
2. **Deploy staging** runs only through a manual dispatch on `main` with the exact `deploy-staging` confirmation. CI, PRs, pushes and schedules do not trigger it. It checks out that exact main commit, builds separate Linux amd64 API/web images, verifies both deployment configurations with disposable synthetic data, and publishes matching `sha-<commit>-<run>-<attempt>-api` / `-web` tags.
3. Staging waits for both scans to complete, but applies no critical/high severity threshold. The host validates the pre-release PostgreSQL backup archive, then verifies the managed reviewer authorization, minimum clinic dataset, PostgreSQL runtime identity and schema; restarts the API and clinic worker; and requires the same privacy-safe state fingerprint afterward. The atomically written root-only receipt binds that state to the exact API/web digests and release generation under `/srv/apply/releases/<release>-<generation>-pilot-readiness.json`. SSM returns that privacy-safe attestation to the workflow, which validates it against the requested artifacts and generation before writing both an immutable per-generation record and the latest pointer under `/apply/releases/staging`. Review that exact pair and the workflow summary.
4. Run **Promote production** on `main`, supplying `digest` (API), `web_digest` and `promote-production`. It requires the latest receipt to match both reviewed digests, contain a valid matching staging-host attestation, belong to main's history, and have scans that are complete, at most 24 hours old and free of critical/high findings. Legacy or unattested releases are rejected. It copies the pair without rebuilding, verifies both destination digests, validates the production host attestation, and writes immutable plus latest production receipts. The tool reads existing scans; it does not start a fresh scan automatically.
5. Each workflow serializes its own releases without active cancellation; staging and production have separate concurrency groups. The host lock rejects stale generations, checks free space, backs up PostgreSQL, retains both prior image references and checks API/frontend TLS health, runtime database identity and environment policy. Inspect the printed SSM command before retrying a disconnected/unknown run; failure requires deliberate recovery, not an automatic down-migration.

No scheduled or automatic deployment exists. Independent required reviewers depend on the repository plan; manual dispatch/promotion does not prove they are enforced. Only staging delivery/host credential permissions were added in this activation; production controls and developer/reviewer access settings were not changed.

## Current release limits

The initial deployment was a locally verified working-tree snapshot, explicitly tagged as a bootstrap release; it is not falsely attributed to a clean main commit or a GitHub run. See the vault Progress Log for the actual final digest and checks. Future automated images carry immutable commit/run tags.

Historical bootstrap image (2026-08-30), still the last verified production image: `sha256:e5d770997d9fefb95e516e3c9713c8e66b2653af8988b22f435356678f820e9f`, tagged `bootstrap-20260830-environments-nav`. Private HTTPS and SQLite integrity passed after that release and a production reboot. SSH is masked rather than only disabled, because reboot verification found the AMI restarted it; authenticated SSM remains the administration path.

**PostgreSQL source migration:** Rails, tests, CI, canonical structure, container verification and the prepared installer now use PostgreSQL 18. Both local container configurations and fresh/legacy/concurrent-write/restore rehearsals pass. Staging completed conversion on 2026-08-31; production still runs the SQLite bootstrap: use the [controlled cutover runbook](postgres-cutover.md), preserve old data/images/keys and meet the release gates before installing the new source. The ordinary installer refuses an unverified legacy conversion. GitHub sign-in alone is not sufficient.

The 2026-08-31 candidate scans again found **4 critical and 14 high** API findings, and **7 high** web findings, plus lower-severity findings. Both hosts remain private with synthetic/empty data. The proposed automated production gate rejects this image; bootstrap installation does not establish security acceptance or authorize bypassing that gate. Resolve or separately review remediation before broader release. See the operations runbook's upstream advisory references.

Staging has one API process, static frontend and private PostgreSQL; production retains the prior SQLite arrangement. Deployments have maintenance downtime. Neither is high availability, clinical authorization or a capacity guarantee. Automated backups, monitoring/alerts, recovery targets, certificate renewal, MFA/access operations and full browser/security acceptance remain release work. No backup or monitoring schedule was created.

The staging continuity receipt contains only a format number, environment, database kind, schema version and SHA-256 state fingerprint. It does not print record content, credentials, database URLs or reviewer identity. A matching fingerprint proves that the checked staging dataset did not change across that controlled service restart; it is not a browser journey, independent restore, real-patient test, clinical acceptance or availability measurement.

The existing staging stack was not replaced. Its runtime configuration was explicitly adopted as staging through SSM. A proposed CloudFormation update showed conditional host/attachment replacement and was removed without execution; review a recovery plan before any such infrastructure update. The production stack was created from the then-current parameterized SQLite template, not today's PostgreSQL UserData. Existing staging records/keys and the earlier recovery snapshot were preserved.

Sources: [GitHub OIDC and AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws), [immutable subject claims](https://docs.github.com/en/actions/reference/security/oidc), [deployment environment availability](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
