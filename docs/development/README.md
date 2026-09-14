# Developer documentation

These documents explain how to work on APPly. They describe current source mechanics; the repository root and nested `AGENTS.md` files describe agent policy, and `APPlyVault/` records product context, decisions, risks and dated evidence.

- [Getting started](getting-started.md): local prerequisites and the managed development lifecycle.
- [Contributing](contributing.md): branches, focused changes, checks and review.
- [Shared development resources](development-resources.md): heavy-job queue, two protected prepared worktrees and source-test evidence reuse.
- [Meta Clinic build and acceptance](meta-clinic-build-and-acceptance.md): connected workflow behavior, organization-assigned permissions and completion evidence; links to the canonical product strategy and implementation tracker.
- [Standards-guided healthcare development](healthcare-standards.md): primary references and the workflow for translating healthcare standards into data, pages and verification.
- [U.S. healthcare reference map](us-healthcare-reference-map.md): official source URLs mapped to clinic setup, scheduling, charts, medications, vaccinations, labs and other app areas.
- [CI](ci.md): GitHub checks and the boundary between CI, staging and production.
- [Architecture](../architecture/README.md): repository ownership, domain boundaries and implementation contracts.
- [Stripe monthly memberships](stripe-memberships.md): sandbox Connect credentials, local webhook delivery, membership lifecycle and manual acceptance gate.
- [Clinic background work](clinic-background-work.md): bounded PostgreSQL outbox recovery process, safety gates and deployment requirements.
- [Twilio setup](twilio.md): separate telehealth-video and patient-recovery SMS credentials, required gates and sandbox behavior.

Application-specific commands remain authoritative in [the API README](../../apps/api/README.md) and [the web README](../../apps/web/README.md). Provider-neutral packaging and future owner-controlled hosting preparation live in [portable deployment](../../ops/portable/README.md).
