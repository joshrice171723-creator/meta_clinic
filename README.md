# Meta Clinic

Software for connecting an independent clinic's day: scheduling, front-desk handoffs, care documentation, billing, inventory and follow-up in one workspace.

**[Explore the synthetic sandbox](https://aimetaclinic.com/demo)** · **[Product walkthroughs](https://aimetaclinic.com/meta-clinic/resources)** · [Run locally](#run-locally) · [Engineering guide](DEVELOPMENT.md)

## What to explore

- **Scheduling and Tracking Board:** follow a visit from booking through arrival and team handoffs.
- **Care workflows:** inspect intake, documentation and follow-up alongside the visit context.
- **Clinic operations:** explore invoices, cash-pay offerings, inventory and medication workflow preparation.

The public site and sandbox demonstrate sample clinic workflows. This is active development with synthetic data, not a production clinical system: no real-patient use, production users or completed clinical acceptance is claimed. External payments, messages and other provider integrations have separate configuration and release gates. The [implementation tracker](APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) distinguishes implemented work from remaining acceptance.

## Engineering worth inspecting

| Area | Implemented approach | Source |
| --- | --- | --- |
| Frontend/API boundary | React and TypeScript use a same-origin Rails JSON API; Rails owns permissions, business rules and PostgreSQL access. | [Architecture](docs/architecture/software-architecture.md) |
| Session security | Cookie sessions retain Rails CSRF protection, active-account/session-expiry checks and no-store responses. | [Application controller](apps/api/app/controllers/application_controller.rb) |
| Inventory and money | Exact quantities cross the API as decimal strings; browser presentation is not the authority for availability or permissions. | [Frontend contract](apps/web/README.md), [API guide](apps/api/README.md) |
| Local development | A managed lifecycle checks process ownership and readiness; routine startup does not reset data. | [Development guide](DEVELOPMENT.md#develop-locally) |

These are source-level implementation details, not a claim of HIPAA certification, clinical validation or live-provider acceptance.

## Run locally

Prerequisites: Node 24, the repository-pinned Ruby/Bundler versions, Docker and PostgreSQL 18 client tools. See [setup details](docs/development/getting-started.md) for platform requirements.

From the repository root:

~~~sh
bin/dev setup
bin/dev start
~~~

On Windows:

~~~powershell
ruby .\bin\dev setup
ruby .\bin\dev start
~~~

Open [local login](http://127.0.0.1:3000/login) for the loopback-only synthetic walkthrough. Use independently created sample data only. Full lifecycle commands, isolation options and operational instructions are preserved in [DEVELOPMENT.md](DEVELOPMENT.md).

## Repository and development approach

- [apps/web](apps/web/README.md): React/TypeScript interface.
- [apps/api](apps/api/README.md): Rails, PostgreSQL and domain workflows.
- [Developer handbook](docs/README.md): setup, contribution and architecture.
- [Product definition](PRODUCT.md): scope and boundaries; the provider-guidance portal is a separate product sharing infrastructure.
- [Agent contract](AGENTS.md) and [agent harness](agent-harness/README.md): instructions and checks for AI-assisted work.

Meta Clinic is developed by Joshua Rice with Codex assistance. AI-assisted implementation is part of the workflow; generated changes still require review and verification. No claim is made that every line was hand-written.

**Naming:** Meta Clinic is the clinic product. APPly is a legacy repository/workspace name and a working name associated with the separate guidance portal. Existing paths such as APPlyVault/, environment variables and historical records retain their names so links, tooling and provenance remain intact.
