---
type: implementation-package
status: proposed
updated: 2026-09-03
---
# Cash-Pay Billing Implementation Package

Home: [[00 Home]] · Index: [[01 Table of Contents]] · Status: [[Roadmap and Tasks]] · Architecture: [[Software Architecture]] · Data boundary: [[Data Modeling]] · Evidence: [[Progress Log]]

## Purpose and authority

**Request, 2026-09-03:** prepare one detailed implementation package for a professional cash-pay online clinic billing experience. This package is a handoff plan, not an approved payment launch, a clinical workflow decision, a claim of HIPAA/PCI compliance, or authority to connect Stripe, accept real cards, use real patient data, print actual patient records, or deploy.

APPly's Rails/PostgreSQL ledger remains the financial source of truth. A future processor records independently verified payment events into that ledger; it must not become the authority for invoice balances, line items, credits, refunds, or invoice state. The present source is synthetic only.

## Reviewed baseline — do not replace it

| Existing APPly asset | Observed responsibility | Implementation consequence |
| --- | --- | --- |
| `Clinic::Invoice` / `Clinic::InvoiceLine` | Practice- and patient-scoped draft/posted/void invoice with exact decimal lines | Extend with a forward migration only; do not replace its bigint IDs or re-create the tables. |
| `Clinic::PaymentEvent` / `Clinic::PaymentAllocation` | Idempotent external payment event and allocation to an invoice | Keep this as the common payment ledger; add source-specific evidence alongside it. |
| `Clinic::CreditNote` / `Clinic::RefundEvent` | Separate immutable financial corrections | Never edit or erase posted financial history to simulate a refund or correction. |
| `Clinic::Billing::{DraftInvoice,PostInvoice,AllocatePayment}` | Authorized, locked server-side financial operations | New terminal, documents, and processor flows call or extend these operations; browser code never derives a balance authoritatively. |
| `/api/clinic/billing`, invoice detail/post/allocation routes | Existing bounded aggregate/read and protected mutation seam | Version new read contracts deliberately; preserve current capability checks and legacy compatibility only where tested. |
| `BillingDashboard.tsx` and `Billing.tsx` | Internal ledger dashboard plus read-only patient balance lookup | Consolidate these into one coherent staff journey before adding a patient portal. |

The current patient-balance screen correctly limits its identity lookup, but its copy says posting and payment recording are unavailable while the ledger dashboard supports those protected actions. Resolve that inconsistency in the first UI increment.

## Product boundary and non-goals

### This package covers

- Staff-facing cash-pay receivables: draft invoice, review/post, cash/check/external-card recording, allocation, correction visibility, daily cash close, receipt, and patient balance history.
- A later optional Stripe card-payment source, with server-verified webhook ingestion.
- A later optional patient billing portal only after the internal workflow is complete and its identity, consent, delivery, privacy, accessibility, and support design is accepted.

### This package does not authorize or include

- Insurance claim submission, billing-code selection, diagnosis capture, clinical decision support, or an automatic superbill. A superbill is a separate export scope with approved provider/service-code inputs and reviewed disclosure rules.
- Subscription/membership auto-billing, stored-card charging, ACH, financing, refunds through Stripe, or Stripe Connect. Each is a separate accepted increment.
- Raw PAN, CVC, track data, card screenshots, card-number logs, or card details in APPly fields, audit rows, request telemetry, exceptions, or the vault.
- A claim that cash pay removes privacy, professional, tax, accounting, or patient-record obligations. Applicable requirements and contracts need qualified review before real use.

## Target staff experience

### Navigation and roles

Keep one **Billing** destination. Do not add sidebar entries for every table.

| Role | Minimum allowed activity | Must not be implied |
| --- | --- | --- |
| Billing reader | View only the scoped ledger, invoice detail, and permitted receipt status | Patient-chart access, posting, payment entry, voids, or exports |
| Billing operator | Draft/post invoice, record a cash/check/external payment, issue allowed receipt | Refund, void, cash close approval, or processor configuration |
| Billing supervisor | Review corrections, approve closeout discrepancies and permitted void/refund workflow | Unrestricted tenant, clinical, or processor-secret access |
| Patient portal user (future) | View own eligible documents and initiate a hosted/Elements payment flow | Staff terminal, other-patient data, account/card administration outside explicit scope |

Every server mutation derives actor, practice, permission, request correlation, and timestamp from trusted server context. Do not accept those fields from the browser.

### Screens and outcomes

1. **Billing workspace:** existing queue becomes the operational home: draft review, posted/open balances, recent payments, a visible collection-state banner, and a link to cash close when authorized.
2. **Patient financial ledger:** identity-only search opens one patient’s financial summary: balance, invoices, payment events, allocations, credits/refunds, document history, and explicit empty states. No clinical tab or diagnosis is loaded merely to bill.
3. **Invoice detail:** show immutable posted line snapshot, total, allocations, credit/refund history, balance, document status, and allowed next actions. Status derives from authoritative amounts/state, never a browser-only toggle.
4. **Virtual terminal:** select an already-posted invoice; choose Cash, Check, External card, or (later) Stripe card. Display exact amount due, selected allocation amount, reference requirements, confirmation, and failure/unknown-outcome recovery.
5. **Cash drawer close:** per physical site/session: opening float, received cash, recorded change, expected cash, counted cash, discrepancy, operator explanation, reviewer approval, and close timestamp. No amount is silently adjusted to make a drawer balance.
6. **Documents:** receipt download/print after a recorded payment; a separately gated superbill request/export path. Documents are generated from a versioned server snapshot and retained with issuance/audit metadata.
7. **Settings (future):** clinic legal identity, receipt template, numbering policy, physical sites/drawers, and processor configuration status. Secrets are never displayed or stored in browser configuration.

## Data and operation plan

### Preserve current records; add only gaps

| Increment | Proposed records or fields | Rules |
| --- | --- | --- |
| Invoice presentation | `invoice_number`, `service_date` or approved service-period representation, `posted_at`, void reason/version where accepted | Assign a practice-unique human number at a defined irreversible lifecycle point; do not reuse numbers. Date/service semantics need product and professional review. |
| Payment classification | Add a constrained `source_type` to the event or a linked immutable source record (`cash`, `check`, `external_card`, `stripe`) | The existing `external_event_reference` remains idempotent within practice. Record processor/reference evidence, not card data. |
| Cash control | `cash_drawer_sessions` and immutable `cash_tenders` linked to payment event and site/drawer | Store tendered amount, change, receiver, session, opening/close data, count, discrepancy and approval evidence as exact decimals. One cash tender cannot be allocated twice. |
| Processor evidence | `payment_processor_events` linked to payment event, with processor name, opaque processor IDs, event type/version, verified time, normalized outcome, raw-payload digest and processing state | Uniqueness is practice + processor + processor-event ID. Encrypted/minimized retained payload policy requires review; do not retain raw payment or clinical data by default. |
| Documents | Versioned receipt/superbill document metadata: invoice/payment linkage, document type/template version, issuance time/actor, rendered-file digest, delivery status | Re-render only from authoritative history. Correction/reissue creates a new version; it never overwrites the prior issued artifact. |
| Patient billing preference (future) | Billing email/delivery preference, approved portal identity link, explicit recurring-charge authorization version/time if that later scope is selected | Do not create a local "has card on file" claim from a UI checkbox. Stored payment methods stay processor-owned. |

Migration rules: one additive forward migration per independently deployable increment; bigint IDs and practice scope remain unchanged; composite same-practice integrity uses existing repository conventions; schema/data migration rehearsal, backup/restore, rollback behavior, permissions, and concurrency tests precede acceptance. Do not copy the pasted string-ID/composite-primary-key migration.

### State models

**Invoice:** `draft → posted → void` remains the current core. A paid/partial display is derived from posted amount, allocations, credits, and refunds; it is not a mutable invoice state. Any new collection or document state needs an explicit server-owned transition table and tests.

**Cash drawer:** `open → closing_count_recorded → discrepancy_review → closed`, with an explicit reopen/correction process if approved. A failed/unknown close remains visibly pending; never duplicate a close by retrying blindly.

**Processor event:** `received → signature_verified → normalized → applied | ignored_duplicate | rejected | needs_reconciliation`. Webhook receipt is not payment success; a processor outcome is not an APPly allocation until the locked, authorized ledger operation commits.

## API contracts

Use `/api/clinic` only, CSRF for staff mutations, exact-decimal strings across JSON, and server-generated request IDs/replay keys.

| Endpoint family | Purpose | Required proof |
| --- | --- | --- |
| `GET /api/clinic/patients/:id/billing-ledger` | Scoped patient financial projection | Billing read plus identity projection; no chart fields or other-practice rows. |
| `POST /api/clinic/invoices/:id/payment-tenders` | Create one cash/check/external payment event and allocate intentionally | Posted invoice, exact positive amount, no over-allocation, unique reference/replay intent, locked transaction. |
| `POST /api/clinic/cash-drawers/:id/close` | Record counted cash and move to review/closed state | Open session, authorized operator, exact count, idempotent close intent, independent discrepancy evidence. |
| `GET /api/clinic/invoices/:id/receipt` | Generate or retrieve issued receipt | Scoped read and document-delivery audit; no unbounded document path. |
| `POST /api/clinic/invoices/:id/superbill-requests` | Create a reviewed export request only if that scope is approved | Explicit professional/data policy gate, provider/service snapshots, export authorization and delivery evidence. |
| `POST /api/integrations/stripe/webhooks` (future) | Receive processor events outside session/CSRF flow | Raw-body signature verification, allowlisted event types, deduplication, bounded logging, no browser authority. |

Do not allow a generic browser-supplied `patient_id`, `practice_id`, invoice balance, status, processor event, actor, audit field, or allocation calculation to determine a financial write.

## Stripe integration design — later, isolated increment

1. Create a clinic-level processor configuration record that holds no secret. Store secrets only in the approved server secret manager/configuration path.
2. For card collection, prefer a Stripe-hosted surface or current Stripe Payment Element; APPly sends only the amount and a minimal opaque internal correlation ID. Stripe advises against sensitive data in PaymentIntent metadata or descriptions. [Payment Intents](https://docs.stripe.com/payments/payment-intents)
3. APPly creates/reuses one PaymentIntent per pending collection intent with an idempotency key derived from the server-owned intent. Do not create a new intent on every retry. The browser receives only the processor client secret necessary for that narrowly scoped checkout step.
4. The webhook endpoint verifies Stripe’s `Stripe-Signature` against the unmodified raw request body, records a deduplicated processor event, and responds safely to duplicate/out-of-order delivery. [Stripe webhook handling](https://docs.stripe.com/webhooks/handling-payment-events?lang=node&locale=en-GB)
5. Only a verified terminal processor outcome calls the locked APPly payment-event/allocation operation. Reconciliation links processor event → APPly payment event → allocations → invoice.
6. Keep patient name, diagnosis, appointment narrative, or line-item clinical detail out of Stripe metadata, descriptions, URLs, and logs. Use a minimal opaque APPly reference.
7. Reconciliation dashboard lists unmatched/mismatched/late processor events without auto-repair. An operator resolves them through a deliberately authorized workflow.

Before any real connection: accept processor account ownership, supported countries/currencies, refund/dispute policy, card-present versus card-not-present scope, service agreement/BAA applicability, privacy/security review, retention/logging policy, secret rotation, alerting, disaster recovery, and test/live key separation. Stripe documentation recommends its Payment Element over legacy Card Element for new card collection work. [Element comparison](https://docs.stripe.com/payments/payment-card-element-comparison?locale=en-GB)

## Receipt and superbill contract

### Standard receipt

Generate from server data after payment allocation. Include only the approved clinic identity, invoice number, date of service/approved period, payment date, method label, line descriptions/amounts, total, applied amount, remaining balance, receipt ID, and document version. A reprint is labeled as such and references the original receipt.

### Superbill — separately gated

Do not label an ordinary receipt a superbill. A future superbill needs an approved specification for provider identity/credentials, service date, service/procedure code provenance, diagnosis-code provenance if included, patient demographic fields, signature/attestation, correction/reissue rules, and delivery restrictions. The build must not infer codes from notes or allow free-text clinical data to flow into a payment processor.

Payment-related information can be protected health information in context; cash pay is not a privacy exemption. HHS describes payment/billing activities as regulated payment uses and requires role-based, minimum-necessary policies where applicable. [HHS treatment, payment, and operations guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/disclosures-treatment-payment-health-care-operations/index.html)

## Failure-first acceptance matrix

| Failure hypothesis | Required prevention and evidence |
| --- | --- |
| Payment is recorded twice after a timeout or duplicate webhook | Database uniqueness plus same-intent replay, processor event dedupe, locked allocation, and retry/unknown-outcome tests. |
| Cash amount/change is wrong or drawer is silently balanced | Exact decimal validation, immutable tender/change records, expected-vs-counted discrepancy, approval trail, and close/reopen tests. |
| Staff member crosses patient/practice scope | Server-derived practice/actor, capability denial tests, cross-practice fixtures, and no patient names in aggregate dashboard responses. |
| Browser lies about balance, method, or completion | Server recomputes balance and allowed state under lock; UI shows pending/conflict/error states; API rejects forged totals. |
| Processor callback is forged, delayed, or out of order | Raw-body signature verification, allowed event schema, event-id uniqueness, status ordering, and reconciliation queue tests. |
| Card/clinical information reaches logs or Stripe metadata | Allowlist/redaction tests across controller, jobs, error reporting and audit records; no raw payload dumps. |
| A receipt/superbill is altered or delivered to the wrong person | Versioned server render/digest, scoped download authorization, delivery receipt, reissue-only correction, and negative authorization tests. |
| Financial correction hides history | Immutable credit/refund/void records, no destructive update/delete endpoint, audit failure rollback test. |

## Delivery roadmap

| Phase | Scope | Exit evidence | Explicitly excluded |
| --- | --- | --- | --- |
| 0 — Acceptance brief | Approve cash-pay model, roles, exact document fields, numbering, cash-drawer ownership, and first processor scope | Founder/product decisions recorded; professional/privacy/accounting questions assigned | Any code, migration, Stripe account, portal |
| 1 — Internal patient ledger | Consolidate dashboard and patient financial view using current invoices/allocations/credits/refunds | Scoped API/UI tests, synthetic browser desktop/narrow evidence, permission denial coverage | Cash close, documents, payment processor |
| 2 — Cash/check terminal | Add tender classification and protected collection UI; intentional allocation only | Exact decimal/over-allocation/retry/concurrency/actor tests; synthetic cash payment live proof | Card capture, stored cards, refund execution |
| 3 — Cash reconciliation | Drawer sessions, close review, discrepancy workflow/report | Parallel-session, close-retry, discrepancy, role-denial, and audit tests | General ledger/accounting export |
| 4 — Receipts | Versioned standard receipt generation/reprint and delivery audit | Rendered synthetic PDF review; authorization/reissue/no-data-leak tests | Superbill, real delivery |
| 5 — Superbill decision | Separate approved specification and bounded export implementation if authorized | Qualified review recorded; code provenance/export/delivery tests | Claim submission or automated coding |
| 6 — Stripe card source | Server-owned PaymentIntent + verified webhook + reconciliation queue | Stripe test-mode events, duplicate/out-of-order/invalid-signature tests; secret/log review | Live keys, saved methods, subscriptions, auto-charge |
| 7 — Patient portal | Self-service invoice/document/payment experience after identity/support scope | Auth/session/ownership/accessibility/live synthetic flow evidence | Cross-patient data, automatic recurring charging |
| 8 — Release decision | Review exact real-world deployment and controls | Separate authorized environment, policy, operations/recovery, privacy/security/professional gates | Treating local tests as release approval |

## Required implementation checklist for the next AI

1. Read this package, [[CICD]], [[Software Architecture]], [[Working Agreement]], current [[Roadmap and Tasks]], and the closest `AGENTS.md` files before editing.
2. Pull and inspect the current branch; preserve unrelated changes. Locate existing billing contracts/tests before adding a migration or UI abstraction.
3. Select exactly one phase above. State its accepted inputs, non-goals, failure hypothesis, source files, and exit evidence.
4. Implement Rails authority first: migration/model constraints, authorization, transaction/locking/idempotency, serializer/query, route, and focused negative/concurrency tests.
5. Then implement the smallest staff UI that consumes only the server contract. Use exact decimal strings; do not add local financial calculation authority.
6. Add synthetic fixtures only when necessary, clearly labeled as synthetic. Never use real patient/card/payment data or secrets.
7. Run the targeted Rails/web checks, `bin/verify-web` when contracts cross the boundary, migration/restore checks for schema work, `bin/verify-vault` for package changes, `git diff --check`, and a real local browser check for visible workflow claims.
8. Commit only the scoped change, pull/merge current upstream safely, push, and report exact checks, remaining risks, and the next phase. Do not create a processor account, configure live secrets, execute a financial transaction, send a receipt, or deploy without separate authorization.

## Ready-to-use next prompt

> Implement Phase 1 of `APPlyVault/03 Execution/Cash-Pay Billing Implementation Package.md` only: consolidate the existing internal Billing workspace and Patient balances surface into a scoped patient financial ledger. Preserve APPly’s Rails/PostgreSQL invoice, payment, allocation, credit, refund, authorization, exact-decimal, and audit authority. Do not add Stripe, card collection, cash drawers, documents, clinical fields, migrations, or patient portal functionality. Start with a read-only contract and test audit, then implement the smallest server projection and React UI needed to show a selected patient’s invoices, payments/allocations, credits/refunds, and derived balance. Preserve identity-only lookup and capability boundaries. Add focused API/web tests and live synthetic desktop/narrow proof. Pull/merge/commit/push the finished scoped change and report all evidence plus remaining Phase 2 gates.

## Open decisions before Phase 2

- Who owns a drawer, approves a discrepancy, and may reopen/correct a close?
- Is check payment in the first collection scope, and what reference is required?
- At what lifecycle point is an invoice number assigned, and what format/void rule applies?
- What exact receipt fields and delivery channels are approved?
- Is a superbill in product scope, and who owns the approved code/provider/signature specification?
- Is Stripe needed after cash/check workflow proof, and who owns the account, contracts, test/live credentials, reconciliation, disputes, and refunds?
- What retention, access, export, and support policy is approved for financial documents and processor evidence?

## Evidence and limits

This package is grounded in the current APPly billing source/tests and a local synthetic UI review on 2026-09-03. It does not validate a processor integration, legal/professional requirements, accounting treatment, PCI scope, HIPAA applicability, accessibility compliance, document accuracy, or real-world deployment. Recheck official processor and applicable requirements immediately before any integration/release work.
