---
type: implementation-package
status: active
updated: 2026-09-03
---
# Cash-Pay Billing Implementation Package

Home: [[00 Home]] · Index: [[01 Table of Contents]] · Status: [[Roadmap and Tasks]] · Architecture: [[Software Architecture]] · Data boundary: [[Data Modeling]] · Test plan: [[Cash-Pay Billing Test Plan]] · Evidence: [[Progress Log]]

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

## Current database fit — verified 2026-09-03

This section is a read-only inspection of the active local synthetic `apply_development` PostgreSQL database and current Rails operations. The row counts below are a local synthetic snapshot, not a fixture contract or a claim about any hosted environment: 220 invoices, 110 payment events, 110 allocations, 10 credit notes, and 12 refund events.

| Current record | What the live schema and operation already enforce | Cash-pay implementation consequence |
| --- | --- | --- |
| `clinic_invoices` | bigint `id`, `practice_id`, `patient_id`, currency, status, rounding-policy version, timestamps; practice/patient indexes | Use the existing invoice as the collection target. Do not add a second account-receivable header or replace the keys. |
| `clinic_invoice_lines` | Exact numeric quantity/unit/posted amounts and immutable description snapshot, tied to invoice/practice/patient | Receipt line detail derives from posted snapshots; a payment workflow cannot rewrite lines. |
| `clinic_payment_events` | bigint practice/patient-scoped event with exact numeric amount/currency and unique `(practice_id, external_event_reference)` | It already provides the idempotency anchor for imported/external payments. A new terminal must create one payment event through the existing locked operation, not store a parallel payment total. |
| `clinic_payment_allocations` | Exact numeric allocation tied to payment/invoice/patient/practice, with practice-scoped indexes | One payment can be allocated across invoices only up to its event amount; one invoice cannot exceed posted total. The existing operation locks the patient and invoice before it checks both limits. |
| `clinic_credit_notes` / `clinic_refund_events` | Separate exact numeric historical correction records, not invoice-field overwrites | Show them in the patient ledger and receipt balance calculation; add no destructive "edit payment" shortcut. Current execution routes for creating/refunding them are not part of this package's first phases. |
| `clinic_insurance_claims` / `clinic_coverage_versions` | Existing practice/patient-scoped records, including encrypted coverage evidence | Leave untouched. Their presence does not authorize insurance workflow, claim submission, or a superbill in the cash-pay increment. |

**Verified gaps:** the live schema has no invoice number, service date, payment-method/source record, cash-drawer session, tender/change record, processor webhook event, receipt/document issuance record, or patient payment preference. APPly must add those forward-only; it must not guess a source type for the 110 existing payment events.

### Selected compatibility design

Use a linked payment-source model rather than adding a required `source_type` directly to `clinic_payment_events`. Existing events stay valid and render as **Imported / source not recorded** until an authorized reconciliation supplies evidence. New terminal-created events require exactly one source record in the same transaction. This avoids inventing history and preserves the current unique external-event-reference idempotency rule.

For Stripe, receive/verify an event before creating a `PaymentEvent` when it is unmatched or not terminal. The processor-event record therefore links to a collection intent first and only optionally to the payment event after APPly applies it. A webhook must never be forced into an allocation merely because it arrived.

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
| Payment classification | Immutable `clinic_payment_sources` linked 1:1 to a new terminal-created payment event: practice/patient/payment IDs, method (`cash`, `check`, `external_card`, `stripe`), normalized reference, server-derived recorder and timestamps | Existing payment events remain source-free and display as imported/unknown; do not backfill a guessed method. Enforce same-practice/patient links and unique practice/payment source. |
| Cash control | `clinic_cash_drawer_sessions` plus immutable `clinic_cash_tenders` linked through payment source/event and existing `Clinic::Site` | Store tendered amount, change, receiver, session, opening/close data, count, discrepancy and approval evidence as exact decimals. A cash tender is one source of one payment event; allocation remains in the existing allocation table. |
| Processor evidence | `clinic_payment_collection_intents` and `clinic_payment_processor_events`; only applied events optionally link to `clinic_payment_events` | Intent owns opaque correlation/expected amount/currency/state; event owns processor name, opaque processor IDs, event type/version, verified time, normalized outcome, raw-payload digest and processing state. Uniqueness is practice + processor + processor-event ID. |
| Documents | Versioned receipt/superbill document metadata: invoice/payment linkage, document type/template version, issuance time/actor, rendered-file digest, delivery status | Re-render only from authoritative history. Correction/reissue creates a new version; it never overwrites the prior issued artifact. |
| Patient billing preference (future) | Billing email/delivery preference, approved portal identity link, explicit recurring-charge authorization version/time if that later scope is selected | Do not create a local "has card on file" claim from a UI checkbox. Stored payment methods stay processor-owned. |

Migration rules: one additive forward migration per independently deployable increment; bigint IDs and practice scope remain unchanged; composite same-practice integrity uses existing repository conventions; schema/data migration rehearsal, backup/restore, rollback behavior, permissions, and concurrency tests precede acceptance. Do not copy the pasted string-ID/composite-primary-key migration. A new source/tender write must create its `PaymentEvent`, source, and first allocation atomically through the existing locked allocation behavior; a processor webhook first records its own deduplicated evidence and applies only after an explicit terminal/reconciliation decision.

### State models

**Invoice:** `draft → posted → void` remains the current core. A paid/partial display is derived from posted amount, allocations, credits, and refunds; it is not a mutable invoice state. Any new collection or document state needs an explicit server-owned transition table and tests.

**Cash drawer:** `open → closing_count_recorded → discrepancy_review → closed`, with an explicit reopen/correction process if approved. A failed/unknown close remains visibly pending; never duplicate a close by retrying blindly.

**Processor event:** `received → signature_verified → normalized → applied | ignored_duplicate | rejected | needs_reconciliation`. Webhook receipt is not payment success; a processor outcome is not an APPly allocation until the locked, authorized ledger operation commits.

## API contracts

Use `/api/clinic` only, CSRF for staff mutations, exact-decimal strings across JSON, and server-generated request IDs/replay keys.

| Endpoint family | Purpose | Required proof |
| --- | --- | --- |
| `GET /api/clinic/patients/:id/billing-ledger` | Scoped patient financial projection | Billing read plus identity projection; no chart fields or other-practice rows. |
| `POST /api/clinic/invoices/:id/payment-tenders` | Create one cash/check/external payment event, source/tender evidence, and intentional allocation | Posted invoice, exact positive amount, no over-allocation, unique reference/replay intent, source required for new terminal events, and one locked transaction. |
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
5. Only a verified terminal processor outcome calls the locked APPly payment-event/allocation operation. Reconciliation links collection intent → processor event → APPly payment event → allocations → invoice; unmatched events remain visible and unapplied.
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
| Payment is recorded twice after a timeout or duplicate webhook | Existing unique practice/reference event plus same-intent replay, processor-event dedupe, linked source uniqueness, locked allocation, and retry/unknown-outcome tests. |
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
| 1.5 — Receivables operations | Make the internal ledger operational: full invoice retrieval, draft authoring/editing, intentional partial or unapplied allocation, aging/follow-up state, and invoice audit timeline | Server-paginated/searchable ledger; authorized draft create/edit/post path; exact-decimal allocation tests including unapplied remainder; derived aging contract; read-only event timeline with tenant/role denial tests; synthetic desktop/narrow workflow evidence | Void/credit execution until policy is approved; statements/reminders; accounting export; processor and portal work |
| 2 — Cash/check terminal | Add tender classification and protected collection UI; intentional allocation only | Exact decimal/over-allocation/retry/concurrency/actor tests; synthetic cash payment live proof | Card capture, stored cards, refund execution |
| 3 — Cash reconciliation | Drawer sessions, close review, discrepancy workflow/report | Parallel-session, close-retry, discrepancy, role-denial, and audit tests | General ledger/accounting export |
| 4 — Receipts | Versioned standard receipt generation/reprint and delivery audit | Rendered synthetic PDF review; authorization/reissue/no-data-leak tests | Superbill, real delivery |
| 5 — Superbill decision | Separate approved specification and bounded export implementation if authorized | Qualified review recorded; code provenance/export/delivery tests | Claim submission or automated coding |
| 6 — Stripe card source | Server-owned PaymentIntent + verified webhook + reconciliation queue | Stripe test-mode events, duplicate/out-of-order/invalid-signature tests; secret/log review | Live keys, saved methods, subscriptions, auto-charge |
| 7 — Patient portal | Self-service invoice/document/payment experience after identity/support scope | Auth/session/ownership/accessibility/live synthetic flow evidence | Cross-patient data, automatic recurring charging |
| 8 — Release decision | Review exact real-world deployment and controls | Separate authorized environment, policy, operations/recovery, privacy/security/professional gates | Treating local tests as release approval |

### Accepted local cash-drawer rules — 2026-09-03

- One cash drawer is open per clinic location. Staff enter its opening cash amount and may close it.
- Expected cash equals opening float plus cash received, minus recorded change and cash refunds. A short/over close is recorded and can be reconciled by a manager later; it does not block staff closeout.
- Cash refunds reduce drawer cash. Every recorded financial event requires a printable receipt.
- Checks will eventually be scanned for the check number and needed fields. Scanner/OCR provider, bank-data retention, image access and deletion rules remain a separate gated integration; raw check images are not stored by this local milestone.

### Whole-milestone execution status — started 2026-09-03

| Phase | Current execution status | Evidence or blocking authority |
| --- | --- | --- |
| 0 — Acceptance brief | Partially complete | Founder accepted one open drawer per site, staff open/close authority, non-blocking short/over close, cash refunds reducing expected cash, and printable money-event receipts. Invoice numbering, formal receipt fields/delivery, check-image handling, retention, superbill, processor, and release authority remain unapproved. |
| 1 — Internal patient ledger | Complete locally | Read-only scoped ledger contract, Material UI patient ledger, focused regression, local synthetic desktop/narrow inspection. |
| 1.5 — Receivables operations | Accepted as the next implementation slice; not yet implemented | The existing dashboard is limited to eight recent invoices and has no draft-authoring UI, unapplied-allocation workflow, aging/follow-up state, or invoice event timeline. Implement only after preserving Phase 1–4 behavior and adding focused server/UI evidence. |
| 2 — Cash/check terminal | Cash complete locally; check scanning blocked | A server-authoritative cash terminal records tender, change, allocation, replay key, and a linked receipt in one transaction. Check scanning/OCR and check-image policy require an approved provider and retention/access rules. |
| 3 — Cash reconciliation | Complete locally | One open drawer per site, opening float, received cash, change, cash refunds, expected/count/discrepancy, and non-blocking close are implemented and tested with synthetic records. No accounting export or real cash operation. |
| 4 — Receipts | Basic cash receipts complete locally; production document scope blocked | Cash payment/refund receipts are immutable records with a scoped printable HTML view and no-store response header. Approved clinic identity, invoice numbering/service date, rendered-file digest/version, reprint/reissue, delivery, and PDF evidence remain blocked. |
| 5 — Superbill decision | Blocked | Provider/code/date/signature/disclosure specification and qualified approval are absent. |
| 6 — Stripe card source | Blocked | Processor account owner, contracts, test credentials, webhook secret, supported scope, dispute/refund policy, and security review are absent. |
| 7 — Patient portal | Blocked | Portal identity, support, consent, document-delivery, accessibility, and privacy scope are unapproved. |
| 8 — Release decision | Blocked | No authorized deployment environment, operations/recovery, or privacy/security/professional release gate exists. |

### Phase 1 delivery record — 2026-09-03

**Implemented:** `GET /api/clinic/patients/:id/billing_ledger` now provides a read-only, practice- and patient-scoped `clinic-patient-ledger-v1` projection. It returns exact-decimal invoice totals, allocations, credits, derived balances, payment allocation history, and payment-level refund history. It deliberately omits `external_event_reference`, does not guess historical tender/source type, and does not treat a payment-level refund as an invoice reversal because the current schema has no refund-to-invoice reversal relationship. The patient-balances interface now uses this contract through Material UI components and supports lookup, selected-patient ledger summary, invoice detail, and explicit empty/error/loading states.

**Verification recorded so far:** TypeScript typecheck and production Vite build pass; changed frontend files pass Prettier; the running local synthetic app was inspected at desktop and 768 px narrow widths, including patient selection and the empty-ledger response. A focused Rails integration test was added for ledger scope, exact balances, credit/refund projection, and processor-reference omission. Final commit/push evidence and the focused Rails completion are recorded in [[Progress Log]].

**Phase 1 scope exclusions (not current package status):** Cash/check tender entry, cash drawer sessions, receipt/superbill documents, Stripe, processor webhooks, schema migrations, portal work, clinical fields, and any real payment or patient data were excluded from this first ledger increment. Later entries below record the locally implemented cash portions.

### Phase 2–4 delivery record — 2026-09-03

**Implemented locally:** additive cash-drawer, tender, and receipt tables retain the existing payment-event/allocation ledger as financial authority. A staff member can open one drawer at a clinic site, record cash tender and change against a posted invoice, print the resulting receipt, record a cash refund only against a cash payment, and close a drawer even when its counted cash differs from the server-calculated expected cash. The patient financial ledger exposes only a `cash_payment`/receipt-available indicator for locally evidenced cash events; it does not expose processor references or invent a source for historical records. The Billing workspace uses Material UI controls for drawer open, collection, receipt access, close, and cash-only refund action.

**Safeguards and evidence:** cash writes derive practice/actor on Rails, use exact-decimal validation, lock the drawer and existing allocation path, atomically create tender/receipt evidence, reject mismatched replay details, and retain cash refunds as separate history. The focused synthetic integration proof covers open → tender/change → same-key replay → refund → scoped printable receipt/no-store → expected cash → non-blocking discrepant close. TypeScript typecheck, production build, changed-file formatting, and Impeccable detection pass. A live browser render could not complete because the local workspace remained at its Loading state while its API context was unavailable; it is not claimed as UI acceptance.

**Still blocked:** check scanning/OCR, check-image storage/deletion/access policy, invoice numbering and service-date decisions, approved receipt template/content/delivery/PDF/reissue policy, superbill specification, Stripe account/webhook secrets, patient portal, and every real-data/release authority.

## Required continuation checklist for the next AI

The package-specific verification procedure and Terra Med failure-escalation rules live in [[Cash-Pay Billing Test Plan]]. Update that matrix and [[Progress Log]] after every gate; never convert an unavailable browser/API or unapproved production contract into a pass.

1. Read this package, [[CICD]], [[Software Architecture]], [[Working Agreement]], current [[Roadmap and Tasks]], and the closest `AGENTS.md` files before editing.
2. Pull and inspect the current branch; preserve unrelated changes. Locate existing billing contracts/tests before adding a migration or UI abstraction.
3. Recheck the whole-milestone status table and select only an unblocked remaining phase. State its accepted inputs, non-goals, failure hypothesis, source files, and exit evidence.
4. Implement Rails authority first: migration/model constraints, authorization, transaction/locking/idempotency, serializer/query, route, and focused negative/concurrency tests.
5. Then implement the smallest staff UI that consumes only the server contract. Use exact decimal strings; do not add local financial calculation authority.
6. Add synthetic fixtures only when necessary, clearly labeled as synthetic. Never use real patient/card/payment data or secrets.
7. Run the targeted Rails/web checks, `bin/verify-web` when contracts cross the boundary, migration/restore checks for schema work, `bin/verify-vault` for package changes, `git diff --check`, and a real local browser check for visible workflow claims.
8. Commit only the scoped change, pull/merge current upstream safely, push, and report exact checks, remaining risks, and the next phase. Do not create a processor account, configure live secrets, execute a financial transaction, send a receipt, or deploy without separate authorization.

## Ready-to-use next prompt

> Continue `APPlyVault/03 Execution/Cash-Pay Billing Implementation Package.md` from its current whole-milestone status. Do not repeat Phases 1–3 or present the basic cash receipt as a production document. First obtain or record the exact missing authority for one blocked item (check scanner/OCR and image policy, invoice numbering/service date, approved receipt/PDF/reissue/delivery contract, superbill specification, Stripe ownership/secrets, portal identity, or release controls). Then implement only that accepted increment with Rails authority, exact decimals, tenant/actor checks, additive migrations, focused negative tests, Material UI staff UI when relevant, local synthetic browser proof, package/Progress Log update, commit, and push. Never use real payment/card/check/patient data or external credentials.

## Open decisions before the next increment

- Drawer ownership/close and later manager reconciliation are accepted locally. Reopen/correction rules remain unapproved.
- Is check payment in the first collection scope, which scanned fields are required, and which approved provider handles scanning/OCR and image custody?
- At what lifecycle point is an invoice number assigned, and what format/void rule applies?
- What exact receipt fields and delivery channels are approved?
- Is a superbill in product scope, and who owns the approved code/provider/signature specification?
- Is Stripe needed after cash/check workflow proof, and who owns the account, contracts, test/live credentials, reconciliation, disputes, and refunds?
- What retention, access, export, and support policy is approved for financial documents and processor evidence?

## Evidence and limits

This package is grounded in the current APPly billing source/tests and a local synthetic UI review on 2026-09-03. It does not validate a processor integration, legal/professional requirements, accounting treatment, PCI scope, HIPAA applicability, accessibility compliance, document accuracy, or real-world deployment. Recheck official processor and applicable requirements immediately before any integration/release work.
