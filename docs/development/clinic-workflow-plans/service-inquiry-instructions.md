# Service inquiry instructions

## Assignment and authority

Nova owns this MC-01/MC-02 product slice on a distinct branch, based on `2b0e9db4c9158562130e02555396dd078658ac8a`. The coordinator authorized a small unclaimed pilot workflow with authored tests. No merge, deployment, outbound communication, provider integration, live fixture creation or clinical rule is authorized.

Outcome: authorized clinic configuration staff record optional service-specific contact and referral instructions, recover the save, reload the values and publish the same guidance on the existing public service inquiry page. This implements informational guidance only; structured referral prerequisites and referral receipt/eligibility are not implemented by these fields.

Read this brief and the canonical references before starting, resuming after a context reset or accepting a handoff. Compare the baseline and decisions with the current checkout and newer user direction. Reconcile stale assumptions before dependent edits; preserve existing branches and avoid repeating completed work.

## Current sources and decisions

- [Tracker MC-01/MC-02](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md): contact/referral requirements remain open; public services and consented inquiries already exist.
- [Approved non-vendor hardening, service-offering fields](../non-vendor-clinic-hardening-plan.md#1-internal-service-offering-catalog): service-specific contact route and service requirements are separate from pricing and completed care.
- [Product](../../../PRODUCT.md): shared configurable core and vendor-independent local preparation.
- [Architecture](../../architecture/software-architecture.md): Rails owns configuration, authorization and persistence; React owns presentation.
- [FHIR R4 HealthcareService 4.0.1](https://hl7.org/fhir/R4/healthcareservice-definitions.html), reviewed 2026-09-30: `comment`, `telecom` and `referralMethod` distinguish service details, contact and referral information. This is the global technical foundation already selected by the U.S. hardening brief, applied only to U.S. service-directory presentation. Plain-text guidance is not a FHIR ContactPoint/referralMethod mapping, a clinical protocol or conformance claim. Absent referral guidance does not establish that a referral is unnecessary.
- [MUI TextField v9](https://mui.com/material-ui/react-text-field/), reviewed 2026-09-30; installed MUI 9.4.0 supports labeled multiline inputs, helper text and `slotProps.htmlInput`. MUI MCP is unavailable; official documentation and installed types are the fallback.

Reconciled alternatives: closeout review checkpoints already exist and PR36 owns that area; MC09/MC12 live fixture/auth acceptance is separately owned; MC07 connected media needs provider prerequisites. This slice does not reopen those assignments or take the QA repair queue.

## Connected journey

1. Authorized staff open an existing offering or save a new draft in Clinic Setup.
2. Enter optional contact/referral guidance, with explicit notice that publicly visible published services expose those values.
3. Save through the existing versioned, audited, idempotent write path. Reload and inspect the saved guidance; blank values clear independently.
4. Publish using existing site/visit-type/duration/resource guards. Public cards show only the service page's published, visible, practice-scoped values.
5. The anonymous visitor can use the existing consented inquiry form; these informational fields do not send messages, prove a referral or authorize booking/care.
6. Retirement hides the service from the public page and preserves the saved catalog record.

## Fields and action rules

| Field/control           | Owning behavior                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contact_instructions`  | Nullable plain text, whitespace trimmed, at most 500 characters; empty means no service-specific guidance recorded.                                                                                                                                                                |
| `referral_instructions` | Independently nullable plain text with the same bound; no automatic referral clearance or receipt state.                                                                                                                                                                           |
| Editor                  | Existing MUI TextFields, labels, helper text and 500-character bound. Both fields follow existing busy/unknown-outcome guards. The same exact-retry action is now reachable inside the open editor after an uncertain save; it reuses the retained request without allowing edits. |
| Public display          | React text children, preserving newlines and wrapping long words; no HTML, Markdown parsing, hyperlinks or external asset fetches. Unrecorded guidance has no completion claim.                                                                                                    |
| Configuration manifest  | Includes saved public-facing guidance alongside existing offering configuration; does not import or restore it.                                                                                                                                                                    |
| Persistence             | Additive nullable columns with model and PostgreSQL length guards. No backfill, reset, altered appointments or ledger transition.                                                                                                                                                  |

## Ownership and dependency matrix references

Nova is the sole writer in `/workspace/meta_clinic_nova_services`. Intended paths: service-offering model/operation/controller/serializer; public service controller; configuration manifest; additive migration; ServiceOfferingSettings and PublicClinicServices; focused new API/frontend tests; this brief. PR35 and PR49–60 files remain untouched. The canonical tracker remains Relay-owned; send the proposed link inline for Relay rather than editing overlapping tracker work.

CF-01 applies existing publication prerequisites; OP-10 applies failed/stale/uncertain saves and exact retry; OP-01 applies protected configuration permissions. Missing guidance never becomes a clinic-wide hold. Role denial blocks this write while permitted read and independently authorized work remain available. No shared matrix changes.

## Implementation and acceptance

- API regressions: create/reload/replay/publish/independent clearing/retirement; overlong and stale changes leave saved values unchanged while unrelated drafts save; denied and foreign writes; draft/private/foreign public exclusions.
- Controlled browser regressions: saved instruction editor → reload → publication → public card; unknown save preserves instructions and exact request; rejected save permits correction; parent/server permission intersection; literal content and absent guidance with phone containment.
- These browser cases intercept the real API client using closed-world responses. They are not Rails-backed integration or actual inquiry delivery.
- Required runtime handoff: on the existing isolated synthetic runtime, migrate from the prior schema, generate/review `db/structure.sql`, run the focused API file plus existing service-offering regressions, scoped RuboCop and eager loading. Ruby/Bundler are absent here; no provisioning attempt is warranted.
- Stop if a public field needs private patient content, a clinical referral rule, external sending, live identity creation or another owner's files. Continue independent presentation/tests while runtime verification is routed.

## Checkpoint

Source implementation and authored frontend verification complete for the bounded slice. Five controlled Chromium/Vitest cases passed on the final frontend source (including the 1440px save/reload/publish walkthrough and a 390px public fallback); TypeScript, changed-file Prettier, bundle and diff hygiene passed. Four backend integration cases are authored but unrun. The first browser attempt had an overly broad test interceptor that caught Vite's API-client source module; narrowing to actual `/api/` requests fixed that harness fault. A subsequent strict locator collision during MUI dialog dismissal was fixed by awaiting dialog closure. No passing test is inferred from those failed attempts.

Backend migration execution and generated `db/structure.sql` remain blocked by absent Ruby/Bundler and must run on Sage's existing isolated synthetic runtime. Do not load the old structure and claim this migration was verified. No data rewrite/backfill is needed. `bin/verify-agent-harness` ran and failed only for this brief's missing tracker link; Relay owns that tracker path in PR36 and must add the link before that gate can pass. Four repository-relative links resolve. No broad suite, connected Rails-backed browser, clinical/vendor or release acceptance ran.

## Last run

- Date: 2026-09-30 UTC.
- Inspected source baseline: `2b0e9db4c9158562130e02555396dd078658ac8a`; current open PR ownership checked before edits.
- Changed paths: only this slice's owned source, migration, new tests and brief.
- Outcome: five focused controlled frontend cases, TypeScript, Prettier, bundle and diff checks passed; Ruby checks/schema generation unavailable; tracker-link harness gate open; no deployment/merge/provider/outbound operation.
- Next: route the additive migration/schema dump, four new API cases plus existing offering tests, scoped Ruby style and eager loading to Sage; return generated schema to Nova for the authored branch, then obtain independent review. Relay adds the tracker link.
