# Release and infrastructure workflow

## When to use

Use for any hosted read/write, deployment, promotion, database cutover, public-access change or infrastructure mutation.

## Authorization gate

Confirm explicit authorization for the exact account, environment, candidate commit/digests and action. Source preparation alone does not pass this gate. Production requires its own authorization even after staging success.

## Procedure

1. Read `ops/aws/AGENTS.md`, CICD, environment state and the exact runbook.
2. Resolve candidate API/web digests from one reviewed commit. Confirm required source/CI evidence without treating it as hosted acceptance.
3. Record failure hypotheses for wrong target, wrong candidate, missing secret/key, partial release, health-check false positive, data loss and failed rollback.
4. Define preflight evidence, stop conditions, recovery owner/path and post-release verification before mutation.
5. Prefer plan/render/offline checks. Inspect exact commands and targets without printing secret values.
6. Execute only the authorized stage. Do not broaden IAM/network access or silently substitute a different candidate.
7. Verify service identity, health, restricted routes, data/key preservation, restart behavior and recovery evidence appropriate to the change.
8. Record actual environment, commit/digests, commands/checks, outcome, rollback status, residual risk and next gate in the Progress Log.

## Stop conditions

Stop for target ambiguity, candidate mismatch, missing recovery, unexpected records/key identity, unresolved critical findings, partial state without safe continuation or any real/confidential data outside an approved process.
