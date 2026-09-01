# AWS operations agent instructions

These instructions apply to `ops/aws/` and extend the repository root contract.

## Authority and environment boundaries

- Source/runbook changes are local implementation work. Any AWS read/write, deployment, cutover, public ingress, secret operation, purchase or production action requires explicit authorization for the exact account, environment and objective.
- Staging and production are separate targets with independent data, keys, roles and release decisions. Staging success never implies production authorization.
- A release uses a matched API/web pair from one reviewed commit. Do not rebuild one side independently during promotion.
- Never print, copy or commit AWS credentials, secret values, database URLs, keys or decrypted configuration. Do not broaden IAM, network or public access as a troubleshooting shortcut.
- Preserve synthetic data, encryption identity and recovery evidence. A successful container start is not database, rollback, security or operational acceptance.

Read `CICD.md`, `PostgreSQL and Inventory Foundation.md`, `ops/aws/ec2/environments.md` and the exact runbook for the requested action. Use [`../../agent-workflows/release.md`](../../agent-workflows/release.md). Database cutovers also use [`../../agent-workflows/database-change.md`](../../agent-workflows/database-change.md).

## Safe implementation and checks

- Prefer plan/render/offline validation before an authorized remote action.
- Resolve exact environment and targets; never rely on an unset variable, broad glob or implicit default for destructive operations.
- Define recovery, stop conditions and evidence before mutation. Preserve existing audit/history records.
- Keep production clinic/demo denial and all professional/real-data gates in force.

For local operations changes run from the repository root:

```sh
python3 -B -m unittest discover -s ops/aws/ec2 -p 'test_*.py'
for script in ops/aws/ec2/*.sh; do
  bash -n "$script" || exit
done
```

Run applicable renderers/verifiers against synthetic or explicitly authorized targets. Report whether evidence is offline, staging or production.
