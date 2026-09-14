---
type: implementation-package
status: archived
lifecycle: archived
archived: 2026-09-14
historical_status: active
updated: 2026-09-13
---

> Historical plan only. Superseded as build guidance by the [current Meta Clinic strategy](../../APPlyVault/01%20Foundation/Meta%20Clinic%20Product%20Strategy%20and%20Scope.md) and [implementation tracker](../../APPlyVault/03%20Execution/Meta%20Clinic%20Implementation%20Tracker.md). Do not execute old prompts or adopt proposed features from this document without current direction. Original dated content follows; see [archive context](README.md).

# Cash-Pay Billing Implementation Package

Home: [[00 Home]] · Index: [[01 Table of Contents]] · Status: [Meta Clinic Implementation Tracker](Meta%20Clinic%20Implementation%20Tracker.md) · Architecture: [[Software Architecture]] · Data boundary: [[Data Modeling]] · Test plan: [Cash-Pay Billing Test Plan](Cash-Pay%20Billing%20Test%20Plan.md) · Evidence: [[Progress Log]]

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
| `BillingDashboard.tsx` and `Billing.tsx` | Internal ledger dashboard plus read-only patient balance lookup | Keep the staff billing journey separate from the local billing-only patient portal. |

The patient-balance screen correctly limits its identity lookup and now explains that authorized billing staff can start a draft invoice from the ledger. Posting and payment mutations remain capability-gated server operations; the screen does not imply that a lookup alone authorizes them.

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

**Verified gaps:** invoice number, service date, generalized payment-source classification, hosted processor webhook integration, and patient payment preference are still absent. The cash increment below has now added local cash-drawer sessions, cash tender/change records, and immutable cash-payment/refund receipt records; a later synthetic provider-neutral processor boundary is documented below. APPly must continue adding gaps forward-only; it must not guess a source type for the 110 existing payment events.

### Selected compatibility design

Use a linked payment-source model rather than adding a required `source_type` directly to `clinic_payment_events`. Existing events stay valid and render as **Imported / source not recorded** until an authorized reconciliation supplies evidence. New terminal-created events require exactly one source record in the same transaction. This avoids inventing history and preserves the current unique external-event-reference idempotency rule.

For Stripe, receive/verify an event before creating a `PaymentEvent` when it is unmatched or not terminal. The processor-event record therefore links to a collection intent first and only optionally to the payment event after APPly applies it. A webhook must never be forced into an allocation merely because it arrived.

## Product boundary and non-goals

### This package covers

- Staff-facing cash-pay receivables: draft invoice, review/post, cash/check/external-card recording, allocation, correction visibility, daily cash close, receipt, and patient balance history.
- A later optional Stripe card-payment source, with server-verified webhook ingestion.
- The owner-approved local billing-only patient portal slice, including an Omni-only patient view selector; production identity, consent, delivery, privacy, accessibility, support, and payment gates remain separate.

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
| Patient portal user (local first release) | View own billing ledger, invoices, balances, credits, refunds, payment history, and receipt availability | Staff terminal, other-patient data, payment collection, account/card administration outside explicit scope |

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
| Payment classification | **Future:** immutable `clinic_payment_sources` linked 1:1 to a new terminal-created payment event: practice/patient/payment IDs, method (`cash`, `check`, `external_card`, `stripe`), normalized reference, server-derived recorder and timestamps | Existing payment events remain source-free and display as imported/unknown; do not backfill a guessed method. The current local cash path uses its cash tender as source evidence and leaves generalized source classification for a later accepted increment. |
| Cash control | **Implemented locally:** `clinic_cash_drawer_sessions` plus immutable `clinic_cash_tenders` linked directly to a payment event and `Clinic::Site`; `request_key` is practice-scoped and unique | Store tendered amount, change, receiver, session, opening/close data, count, discrepancy and approval evidence as exact decimals. A cash tender is one source of one payment event; allocation remains in the existing allocation table. |
| Processor evidence | **Implemented locally as a provider-neutral synthetic boundary; real integration remains future** | `Clinic::PaymentCollectionIntent` owns opaque correlation/expected amount/currency/state; `Clinic::PaymentProcessorEvent` owns processor name, opaque IDs, event type/version, verified time, normalized outcome, raw-payload digest and processing state. Uniqueness is practice + processor + processor-event ID. No Stripe account, credentials, webhook route, raw body, or ledger application is enabled. |
| Documents | **Implemented locally for cash:** `clinic_billing_receipts` stores immutable payment/refund receipt metadata and payload; versioned rendered documents remain future | The local endpoint provides a scoped printable HTML receipt with `Cache-Control: no-store`. Re-render, PDF, delivery, correction and reissue still require an approved document contract and must never overwrite issued history. |
| Patient billing preference (future) | Billing email/delivery preference, approved portal identity link, explicit recurring-charge authorization version/time if that later scope is selected | Do not create a local "has card on file" claim from a UI checkbox. Stored payment methods stay processor-owned. |

Migration rules: one additive forward migration per independently deployable increment; bigint IDs and practice scope remain unchanged; composite same-practice integrity uses existing repository conventions; schema/data migration rehearsal, backup/restore, rollback behavior, permissions, and concurrency tests precede acceptance. Do not copy the pasted string-ID/composite-primary-key migration. A new source/tender write must create its `PaymentEvent`, source, and first allocation atomically through the existing locked allocation behavior; a processor webhook first records its own deduplicated evidence and applies only after an explicit terminal/reconciliation decision.

### State models

**Invoice:** `draft → posted → void` remains the current core. A paid/partial display is derived from posted amount, allocations, credits, and refunds; it is not a mutable invoice state. Any new collection or document state needs an explicit server-owned transition table and tests.

**Cash drawer target:** `open → closing_count_recorded → discrepancy_review → closed`, with an explicit reopen/correction process if approved. **Local implementation today:** `open → closed`; counted cash, discrepancy and explanation are retained at close, and short/over close is non-blocking. A failed/unknown close remains visibly pending; never duplicate a close by retrying blindly.

**Processor event:** `received → signature_verified → normalized → applied | ignored_duplicate | rejected | needs_reconciliation`. Webhook receipt is not payment success; a processor outcome is not an APPly allocation until the locked, authorized ledger operation commits.

## API contracts

Use `/api/clinic` only, CSRF for staff mutations, exact-decimal strings across JSON, and server-generated request IDs/replay keys.

| Endpoint family | Purpose | Required proof |
| --- | --- | --- |
| `GET /api/clinic/patients/:id/billing-ledger` | Target name for the scoped patient financial projection | Billing read plus identity projection; no chart fields or other-practice rows. |
| `POST /api/clinic/invoices/:id/payment-tenders` | Target name for a generalized cash/check/external payment operation | Posted invoice, exact positive amount, no over-allocation, unique reference/replay intent, source required for new terminal events, and one locked transaction. |
| `POST /api/clinic/cash-drawers/:id/close` | Record counted cash and move to review/closed state | Open session, authorized operator, exact count, idempotent close intent, independent discrepancy evidence. |
| `GET /api/clinic/invoices/:id/receipt` | Target name for an issued receipt | Scoped read and document-delivery audit; no unbounded document path. |
| `POST /api/clinic/invoices/:id/superbill-requests` | Create a reviewed export request only if that scope is approved | Explicit professional/data policy gate, provider/service snapshots, export authorization and delivery evidence. |
| `POST /api/integrations/stripe/webhooks` (future) | Receive processor events outside session/CSRF flow | Raw-body signature verification, allowlisted event types, deduplication, bounded logging, no browser authority. |

Do not allow a generic browser-supplied `patient_id`, `practice_id`, invoice balance, status, processor event, actor, audit field, or allocation calculation to determine a financial write.

### Local cash route map — verified 2026-09-03

The current implementation uses these concrete routes; future generalized endpoint names above remain a contract-design target and must not be presented as shipped:

| Current route | Operation |
| --- | --- |
| `GET /api/clinic/patients/:id/billing_ledger` | Read the scoped patient ledger. |
| `POST /api/clinic/invoices/:id/cash_payments` | Record one cash tender, allocation, replay key and receipt atomically. |
| `GET/POST /api/clinic/cash_drawers` | List or open practice-scoped site drawers. |
| `POST /api/clinic/cash_drawers/:id/close` | Record counted cash, discrepancy and close. |
| `POST /api/clinic/payment_events/:id/cash_refunds` | Record a cash-only refund and receipt. |
| `GET /api/clinic/payment_events/:id/receipt` | Render the latest scoped printable receipt without caching. |

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
| 0 — Acceptance brief | Approve cash-pay model, roles, exact document fields, numbering, cash-drawer ownership, and first processor scope | Founder/product decisions recorded; professional/privacy/accounting questions assigned | Production provider, real-data, clinical, document-delivery, and release activation |
| 1 — Internal patient ledger | Consolidate dashboard and patient financial view using current invoices/allocations/credits/refunds | Scoped API/UI tests, synthetic browser desktop/narrow evidence, permission denial coverage | Cash close, documents, payment processor |
| 1.5 — Receivables operations | Make the internal ledger operational: full invoice retrieval, draft authoring/editing, intentional partial or unapplied allocation, aging/follow-up state, and invoice audit timeline | Server-paginated/searchable ledger; authorized draft create/edit/post path; exact-decimal allocation tests including unapplied remainder; derived aging contract; read-only event timeline with tenant/role denial tests; synthetic desktop/narrow workflow evidence | Void/credit execution until policy is approved; statements/reminders; accounting export; processor work |
| 2 — Cash/check terminal | Add tender classification and protected collection UI; intentional allocation only | Exact decimal/over-allocation/retry/concurrency/actor tests; synthetic cash payment live proof | Card capture, stored cards, refund execution |
| 3 — Cash reconciliation | Drawer sessions, close review, discrepancy workflow/report | Parallel-session, close-retry, discrepancy, role-denial, and audit tests | General ledger/accounting export |
| 4 — Receipts | Versioned standard receipt generation/reprint and delivery audit | Rendered synthetic PDF review; authorization/reissue/no-data-leak tests | Superbill, real delivery |
| 5 — Superbill decision | Separate approved specification and bounded export implementation if authorized | Qualified review recorded; code provenance/export/delivery tests | Claim submission or automated coding |
| 6 — Stripe card source | Server-owned PaymentIntent + verified webhook + reconciliation queue | Stripe test-mode events, duplicate/out-of-order/invalid-signature tests; secret/log review | Live keys, saved methods, subscriptions, auto-charge |
| 7 — Patient portal | Billing-only patient ledger plus local Omni patient view selector | Practice/patient/session denial coverage, billing-only projection, contract/UI tests, synthetic browser evidence | Clinical portal actions, payment collection, production impersonation, cross-practice data |
| 8 — Release decision | Review exact real-world deployment and controls | Separate authorized environment, policy, operations/recovery, privacy/security/professional gates | Treating local tests as release approval |

### Accepted local cash-drawer rules — 2026-09-03

- One cash drawer is open per clinic location. Staff enter its opening cash amount and may close it.
- Expected cash equals opening float plus cash received, minus recorded change and cash refunds. A short/over close is recorded and can be reconciled by a manager later; it does not block staff closeout. Manager reconciliation records reviewer, time, request key, and note without changing the immutable expected/count/discrepancy values.
- Cash refunds reduce drawer cash. Every recorded financial event requires a printable receipt.
- Checks will eventually be scanned for the check number and needed fields. Scanner/OCR provider, bank-data retention, image access and deletion rules remain a separate gated integration; raw check images are not stored by this local milestone.

### Check intake/OCR boundary — 2026-09-03

No scanner/OCR provider, required check fields, image custody, retention, access, deletion, or bank-data policy has been approved. The local increment therefore adds only a provider-agnostic `Clinic::Billing::CheckIntake` boundary and a fail-closed `Clinic::Billing::CheckOcrAdapter`. The boundary accepts synthetic metadata only (exact positive amount when supplied, normalized three-letter currency, and bounded opaque references), rejects image/blob/object fields and unsupported fields, and never creates a model, migration, route, upload, or payment event.

An injected synthetic adapter can return an opaque status and field names for contract tests; callers receive only redacted metadata flags and field-presence evidence. The default adapter raises `NotAuthorized`, so no external call or OCR execution can occur accidentally. Raw check images, OCR values, provider payloads and provider credentials are not accepted, stored, logged, or included in fixtures. This is an implementation boundary and test evidence, not authorization to scan a check or record a check payment.

The next check increment requires an explicit provider/policy decision covering provider ownership and allowed environment, required fields, image transport/custody, retention and deletion, authorized staff access and audit, error/unknown outcomes, and the handoff into the existing payment-event/allocation operation. Until those inputs are accepted, the Phase 2 check path remains blocked.

### Whole-milestone execution status — reviewed 2026-09-04

| Phase | Current execution status | Evidence or blocking authority |
| --- | --- | --- |
| 0 — Acceptance brief | Partially complete | Founder accepted one open drawer per site, staff open/close authority, non-blocking short/over close, cash refunds reducing expected cash, and printable money-event receipts. Invoice numbering, formal receipt fields/delivery, check-image handling, retention, superbill, processor, and release authority remain unapproved. |
| 1 — Internal patient ledger | Complete locally; browser recheck blocked | Read-only scoped ledger contract, Material UI patient ledger, focused regression, and local synthetic inspection. The current browser/API context remains unavailable for a fresh visible-flow claim. |
| 1.5 — Receivables operations | Complete locally; browser recheck blocked | The internal ledger now supports guarded draft create/edit/post, server-owned search/filter/sort/pagination, derived aging, age triage filters, unapplied payment totals, allocation of retained payment remainders to another eligible posted invoice, and a bounded invoice audit timeline. Rails locks the payment/invoice path and returns the server-derived allocated/unapplied remainder. Focused Rails proof is not part of this portal closeout; current web typecheck/build are blocked by unrelated staff-messaging/inventory symbols. Preserve Phase 1–4 cash behavior; do not count this adjacent work as cash-package completion. |
| 2 — Cash/check terminal | Cash complete locally; check intake adapter boundary complete locally; provider/OCR execution blocked | A server-authoritative cash terminal records tender, change, allocation, practice-scoped replay key, and a linked receipt in one transaction. The check boundary validates synthetic metadata, rejects image material, redacts adapter evidence, and fails closed without an authorized provider. Check scanning/OCR and check-image policy still require an approved provider and retention/access rules. |
| 3 — Cash reconciliation | Local cash controls and manager discrepancy reconciliation complete; production reconciliation blocked | One open drawer per site, opening float, received cash, change, cash refunds, expected/count/discrepancy, non-blocking close, and manager-only reconciliation with reviewer/time/note are implemented and tested with synthetic records. Reopen/correction policy and accounting export remain unapproved. |
| 4 — Receipts | Basic cash receipts complete locally; production document scope blocked | Cash payment/refund receipts are immutable records with a scoped printable HTML view and no-store response header. Approved clinic identity, invoice numbering/service date, rendered-file digest/version, reprint/reissue, delivery, and PDF evidence remain blocked. |
| 5 — Superbill decision | Blocked | Provider/code/date/signature/disclosure specification and qualified approval are absent. |
| 6 — Stripe card source | Provider-neutral boundary complete locally; real integration blocked | Synthetic intent, raw-body signature verification, redacted/deduplicated processor-event evidence, and unmatched-event reconciliation state are covered by focused tests. Processor account owner, contracts, test credentials, webhook secret, supported scope, dispute/refund policy, security review, and explicit ledger-application workflow remain absent. |
| 7 — Patient portal | Implemented locally and Rails-verified; browser and production gates blocked | Billing-only projection, assigned-patient access, local Omni patient switching, dormant-action denial, session isolation, and contracts/UI are implemented. Focused Rails integration passes 4 runs / 39 assertions; browser, identity lifecycle, support, consent, document delivery, accessibility, privacy, real-data, and production evidence remain open. |
| 8 — Release decision | Portable publication controls implemented; hosted gate blocked | `bin/verify-portable-delivery` enforces manual, commit-pinned, loopback-only, no-cloud-OIDC packaging in CI. Authorized environment, operations/recovery, privacy/security/professional approval and hosted evidence remain outstanding. |

### Phase 1 delivery record — 2026-09-03

**Implemented:** `GET /api/clinic/patients/:id/billing_ledger` now provides a read-only, practice- and patient-scoped `clinic-patient-ledger-v1` projection. It returns exact-decimal invoice totals, allocations, credits, derived balances, payment allocation history, and payment-level refund history. It deliberately omits `external_event_reference`, does not guess historical tender/source type, and does not treat a payment-level refund as an invoice reversal because the current schema has no refund-to-invoice reversal relationship. The patient-balances interface now uses this contract through Material UI components and supports lookup, selected-patient ledger summary, invoice detail, and explicit empty/error/loading states.

**Verification recorded so far:** TypeScript typecheck and production Vite build pass; changed frontend files pass Prettier; the running local synthetic app was inspected at desktop and 768 px narrow widths, including patient selection and the empty-ledger response. A focused Rails integration test was added for ledger scope, exact balances, credit/refund projection, and processor-reference omission. Final commit/push evidence and the focused Rails completion are recorded in [[Progress Log]].

**Phase 1 scope exclusions (not current package status):** Cash/check tender entry, cash drawer sessions, receipt/superbill documents, Stripe, processor webhooks, schema migrations, portal work, clinical fields, and any real payment or patient data were excluded from this first ledger increment. Later entries below record the locally implemented cash portions.

### Phase 2–4 delivery record — 2026-09-03

**Implemented locally:** additive cash-drawer, tender, and receipt tables retain the existing payment-event/allocation ledger as financial authority. A staff member can open one drawer at a clinic site, record cash tender and change against a posted invoice, print the resulting receipt, record a cash refund only against a cash payment, and close a drawer even when its counted cash differs from the server-calculated expected cash. The patient financial ledger exposes only a `cash_payment`/receipt-available indicator for locally evidenced cash events; it does not expose processor references or invent a source for historical records. The Billing workspace uses Material UI controls for drawer open, collection, receipt access, close, and cash-only refund action.

**Safeguards and evidence:** cash writes derive practice/actor on Rails, use exact-decimal validation, lock the drawer and existing allocation path, atomically create tender/receipt evidence, enforce a practice-scoped replay key that cannot change drawer or amount intent, and retain cash refunds as separate history. Closed drawers retain immutable expected/count/discrepancy values and a manager-only reconciliation mutation records reviewer identity/time, required note, and an idempotent request key. The focused synthetic integration proof covers open → tender/change → same-key replay and mismatch rejection → refund/over-refund rejection → scoped printable receipt/no-store → expected cash → non-blocking discrepant close → manager reconciliation, plus transaction rollback and read-only denial. TypeScript typecheck, production build, changed-file formatting, and Impeccable detection pass. The MUI staff UI now requires explicit physical-site drawer selection when multiple drawers are open and presents reconciliation for an authorized manager after refresh. A live browser render could not complete because the local workspace remained at its Loading state while its API context was unavailable; it is not claimed as UI acceptance.

**Still blocked:** check scanning/OCR, check-image storage/deletion/access policy, invoice numbering and service-date decisions, approved receipt template/content/delivery/PDF/reissue policy, superbill specification, Stripe account/webhook secrets, patient portal production identity/lifecycle and document/payment gates, and every real-data/release authority. The local billing-only patient portal and Omni patient view are implemented separately in the 2026-09-04 handoff.

### Provider-neutral card boundary delivery record — 2026-09-03

**Implemented locally:** the additive provider-neutral seam now models a practice-scoped collection intent and processor-event evidence without connecting to Stripe or another provider. Intent creation locks the posted invoice, preserves exact amount/currency, rejects live mode, and makes request-key replay/conflict explicit. Synthetic Stripe-style raw-body signatures are verified with timestamp tolerance; verified events are normalized, deduplicated, redacted, and left in reconciliation when unmatched. No event creates an APPly payment event or allocation, and raw webhook bodies/card-like values are not stored.

**Verification and limits:** `ruby bin/postgres exec ruby bin/rails test test/services/clinic/billing/payment_collection_boundary_test.rb` passed 8 runs / 41 assertions / 0 failures. It covers intent scope, idempotency/conflict, live-mode denial, signature tampering/staleness, duplicate/out-of-order/unmatched events, and redaction. This is not a Stripe integration or payment acceptance. Account ownership, test/live credentials, webhook route and secret custody, supported scope, PCI/privacy/security review, refunds/disputes, retention, alerting, recovery, and explicit ledger-application authority remain blocked.

### Billing-only patient portal delivery record — 2026-09-04

**Implemented locally:** the patient portal now exposes a read-only billing projection containing practice/patient identity, exact-decimal balances, invoices and lines, credits, payment history, allocations, refunds, and receipt availability. Ordinary patient access remains bound to the active portal identity. Dormant appointment, intake, clinical, reminder, messaging, refill, and request actions are denied at the patient-portal boundary. Omni can enter through the local development login and select any patient in Omni's assigned practice; the selected ID is session-scoped and the same billing view is rendered.

**Verification and limits:** web Vitest passed 15 files / 163 tests; focused Rails patient-portal integration passes 4 runs / 39 assertions / 0 failures; changed Ruby syntax, route-contract JSON, vault verification, release-readiness source checks, and whitespace checks passed. The isolated Omni run found and repaired the controller's unavailable ID helper in `bd5fa6c`. Typecheck/build remain blocked by unrelated missing staff-messaging and inventory symbols. Browser evidence, production identity/lifecycle, payment collection, document delivery, and all release approvals remain blocked.

### Receivables operations delivery record — 2026-09-03

**Implemented locally:** draft invoices can be edited only while still in `draft`; posted invoice lines remain immutable and line changes are recorded through the existing audit trail. A payment event can retain an unapplied remainder and an authorized billing operator can later allocate that remainder to another posted invoice for the same patient and currency through `POST /api/clinic/payment_events/:id/allocations`. The server reuses the existing locked allocation operation, rejects cross-practice/patient/currency/over-allocation attempts, and returns exact-decimal allocated and unapplied totals. The patient ledger now exposes `unapplied_amount`, and the staff ledger offers an explicit eligible-invoice allocation control.

**Verification and limit:** `npm run typecheck`, production Vite build, targeted Prettier, Ruby syntax, and `git diff --check` pass. The focused Rails test could not start because the shared test database has two pending patient-portal migrations from concurrent work; no billing assertion failure was observed. The full Vitest run also produced no completion output in a bounded window and was stopped safely. No patient/card/payment data or external processor was used.

### Package completion review — 2026-09-03

This document is complete as the implementation roadmap and handoff for the accepted local cash-pay increment. The unblocked local cash work is implemented, tested, and recorded above; the package is intentionally still marked **active** because several later phases require product, professional, privacy, processor, or release authority that has not been supplied. “Complete” here means the source-of-truth plan, route map, acceptance evidence, escalation protocol, and explicit blockers are current—not that the blocked production phases are approved or shipped.

For any future coding defect in a bounded slice, Luna is the sole implementer and verifier. Give Luna up to three distinct repair-and-test attempts for that same defect. If it remains unresolved, stop and report the exact failure for user direction; do not switch coding agents or broaden the package.

The adjacent receivables work was reviewed under the same rule: Luna found and repaired the cash-tender migration's unsafe blank default and the invoice-aging boundary mismatch in `bdab67d` and `f4ceb34`, then verified the focused boundaries. Luna also audited the invoice audit-timeline increment in `e715970`; no coding defect was found. These commits are upstream but are tracked here only as dependency context, not as additional cash functionality.

## Required continuation checklist for the next AI

The package-specific verification procedure and Luna-only bounded repair rules live in [Cash-Pay Billing Test Plan](Cash-Pay%20Billing%20Test%20Plan.md). Update that matrix and [[Progress Log]] after every gate; never convert an unavailable browser/API or unapproved production contract into a pass.

1. Read this package, [[CICD]], [[Software Architecture]], [[Working Agreement]], current [Meta Clinic Implementation Tracker](Meta%20Clinic%20Implementation%20Tracker.md), and the closest `AGENTS.md` files before editing.
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
