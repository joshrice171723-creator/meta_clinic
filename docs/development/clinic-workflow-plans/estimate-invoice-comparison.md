# Issued estimate and posted invoice comparison

## Assignment and authority

Nova owns this MC-08 product slice from current main `4eed814c5244`. The coordinator authorized a separate draft PR and authored regressions. Preserve existing branches; exclude PR35/36 integration, PR61, Office navigation and external Muse setup. No merge, deployment, provider payment, outbound delivery, live fixture or identity creation is authorized.

Outcome: billing readers select an issued estimate and a posted invoice for the same patient, inspect both historical line sets and their exact server-calculated total difference, and recover a failed read. This is manual comparison, not a durable assertion that both records cover the same services. It makes no payment, balance, legal applicability or dispute-eligibility decision.

Read this brief and canonical references before resuming or accepting a handoff. Reconcile the baseline against newer user direction before dependent edits. Do not silently expand scope or repeat valid unchanged-source checks.

## Current sources and decisions

- [Tracker MC-08](../../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md) explicitly lists invoice comparison as missing. Relay owns the tracker in PR36; provide this brief's link inline rather than editing that file.
- [Approved non-vendor hardening, cash-pay estimates](../non-vendor-clinic-hardening-plan.md#3-cash-pay-estimates-and-gfe-workflow) requires comparison with posted charges while preserving issued snapshots. Dispute handling remains separately reviewed policy.
- [Product](../../../PRODUCT.md) and [architecture](../../architecture/software-architecture.md): Rails owns authorization and exact financial data; React displays the scoped projection.
- [Existing dependency matrix](../meta-clinic-build-and-acceptance.md): OP-01 separates financial evidence from posting claims; OP-10 covers failed/stale reads and recovery. No new matrix row or global hold.
- [FHIR R4 Invoice 4.0.1](https://hl7.org/fhir/R4/invoice.html), scope/usage and resource content, reviewed 2026-09-30: patient, document status, charge lines and monetary totals are distinct facts. This global technical guidance applies to the U.S. cash-pay product selected by the approved plan, without a FHIR-native table or conformance claim.
- [CMS medical bill dispute guidance](https://www.cms.gov/initiatives/your-patient-rights/medical-bill-rights/get-help/dispute-bill), U.S. federal patient/provider process, reviewed 2026-09-30: legal eligibility/process require more facts than a total difference. No eligibility threshold or legal outcome is calculated here.
- [MUI TextField](https://mui.com/material-ui/react-text-field/), reviewed 2026-09-30: reuse installed MUI 9.4.0 select, Paper, Stack, Alert and Button. MUI MCP is unavailable; official documentation and installed types are the fallback.

## Connected journey

1. A billing reader selects a saved issued or superseded-issued estimate in a patient's Billing ledger. Drafts stay independently readable.
2. The existing ledger supplies choices: only loaded posted invoices in the estimate's currency. No new list, paging or payment API.
3. A same-origin GET includes explicit patient/estimate/invoice IDs. Rails rechecks read access, practice/patient scope, issued snapshot, posted status and currency.
4. Show original IDs, estimate revision/status/issue time, invoice status/record time, descriptions, quantities, unit amounts, expected/posted line amounts and estimate inclusions/exclusions. Server decimal totals and signed difference compare posted charges before payments/credits, never outstanding balance.
5. Failed reads retain the chosen records and offer explicit refresh. Selection/patient changes cancel the old read and hide its data. Mismatched response identity is rejected. Neither document nor ledger is mutated.

## Fields and action rules

| Field/control        | Ownership and rule                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Record IDs           | Existing scoped references, revalidated in Rails; no client tenant authority.                                                                                |
| Estimate eligibility | Issued or superseded with issue time; historical lines survive correction.                                                                                   |
| Invoice eligibility  | Posted, same practice/patient/currency; draft/void and unrelated records denied.                                                                             |
| Totals/difference    | BigDecimal sums of historical amounts; JSON decimal strings displayed verbatim. Current catalog prices, payments and credits cannot redefine posted charges. |
| Provenance           | Original IDs, estimate revision/status/time, invoice status/created/updated time and comparison generation time; no invented posting timestamp.              |
| Recovery             | Explicit GET refresh and response ownership; no browser storage, financial replay or new idempotency receipt.                                                |

The existing billing team owns review. Read access grants no posting/refund/issuance authority. Missing eligible records block only comparison; draft review and independent ledger work remain available. No new clinical/vendor authority or owner is invented.

## Implementation and acceptance

Owned paths: new billing comparison query; existing estimate controller/route; paired API contract; new MUI panel; its mount in CashPayEstimates and Billing's existing ledger projection; two focused test files; this brief. No model/schema, provider adapter or shared matrix change.

- Four authored Rails cases: read-only exact comparison/catalog change/reload with unchanged records; superseded/zero/negative differences and precise draft/void/currency rejections; qualified foreign/wrong-patient denials with independent read; invalid request and denied access without ledger mutation.
- Controlled Chromium cases use actual CashPayEstimates/panel with isolated synthetic HTTP fixtures: eligible selection/lines/reload; failed GET/refresh; stale response after invoice switch; patient-switch reset; denied/mismatched responses; draft exclusion with readable snapshot.
- Controlled browser checks are not Rails-backed integration or provider acceptance. Rails fixtures are test-transaction-only; no charges/notifications.
- Ruby/Bundler are absent here. Route backend verification to the existing owned runtime through the coordinator; do not provision another stack. No migration is needed.

## Checkpoint

Implementation and scoped author checks are complete. Six new controlled Chromium cases passed on the final frontend source, including the 1440px selection/line comparison/reload walkthrough and reading order; the two unchanged existing estimate tests also passed (eight unique focused cases). TypeScript, production bundle, changed-file/range formatting and diff checks passed. Billing's only owned change is its invoice-list prop; unrelated existing formatting remains untouched and the changed range was checked. Initial browser failures came from an omitted synthetic CSRF response in the HTTP harness; adding that prerequisite restored the actual API-client path before the final pass. No API or provider success is inferred from the controlled responses.

Four Rails cases are authored and remain unrun here because Ruby/Bundler are absent. No schema change or separate runtime provisioning occurred. Five repository-relative links resolve. Harness verification failed only because this brief lacks its Relay-owned tracker link. Next: hand the draft candidate and focused runtime commands through the coordinator for independent backend verification/review. Stop on overlapping ownership, private data, provider execution or automatic legal/financial policy; continue independent authorized work.

## Last run

- Date: 2026-09-30 UTC.
- Baseline: current main `4eed814c524449bb6c0b0b5948d2b4f37c565e7a`; open PR35/36/61 remain separate; merged Office PR62/63 are excluded from edits.
- Scope: one read-only MC-08 comparison workflow in `/workspace/meta_clinic_nova_comparison`.
- Outcome: eight focused frontend tests, TypeScript, bundle, changed-file/range formatting and diff checks passed; five relative links resolve. Four API cases are authored but unrun; tracker link and independent verification remain pending.
- Next: draft PR with exact head/backend commands; coordinator routes the existing Ruby runtime; Relay adds the tracker link. No deployment, merge, payments or outbound notifications.
