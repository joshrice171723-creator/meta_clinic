# Clinic background work

`apps/api/bin/clinic-worker` provides a small, independently supervised process for existing PostgreSQL-backed reminder and staff-message outboxes. It does not add a queue service, create authority, or change the outbox state machines.

Run one bounded pass from `apps/api`:

```sh
bin/clinic-worker --once
```

Run a supervised loop with a 15-second interval and at most 25 candidates of each work type per pass:

```sh
bin/clinic-worker --interval 15 --limit 25
```

The interval must be 1–3600 seconds and the limit must be 1–100. `SIGINT` and `SIGTERM` stop the loop after the current item. Output contains aggregate counts only; failure logs name the work type and exception class without record, tenant, recipient, or message values.

## Safety and authority

The worker requires PostgreSQL and uses a database advisory lock so only one worker pass runs at a time. Existing row locks, leases, retry limits, idempotency keys, policy checks, and audit writes remain authoritative. Its in-process cursor advances past every bounded candidate set before wrapping to the start, so repeatedly blocked early rows do not starve later eligible work during a supervised run.

Each item recovers the initiating user from the outbox creation audit version, then rechecks that the user and clinic membership are active and still hold the required permission. Missing attribution or current authority blocks that item. The worker never creates a user, membership, role, or grant. Every item clears Rails and PaperTrail request context before the next tenant.

Staff-message processing is limited to existing in-app notification outbox events. Automated overdue-request escalation is excluded because it requires a separately selected accountable recipient.

Reminder delivery accepts only the built-in non-network provider setting. With any other provider setting, the worker can safely recover an expired lease under the existing row lock but will not claim pending work or call the provider. Existing reminder delivery gates still apply. Enabling a network provider, production clinic access, real recipient data, or outbound delivery requires separate authorization and deployment work.

In Rails production mode, the existing clinic release gate still applies: only the guarded staging demonstration clinic can run. The worker does not make production clinic workflows available.

## Deployment requirements

Run the worker as a separate supervised process beside the API with the same application version, PostgreSQL connection, Rails encryption keys, deployment environment, and private network access. Configure restart policy, process health monitoring, aggregate-log collection, and alerts for blocked or failed counts. A running process is operational evidence only; backup/restore, high availability, independent audit storage, provider approval, and production release remain separate gates.

The EC2 release installs `apply-clinic-worker.service`, which runs `bin/clinic-worker --interval 15` from the same immutable API image recorded in `/etc/apply/image`. Each release stops the worker before migration and starts it only after the API, frontend, database, and deployment-policy checks pass; worker startup failure stops the release services.
