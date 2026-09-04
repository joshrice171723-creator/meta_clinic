---
type: progress-record
status: archived
event_date: 2026-09-03
source: APPlyVault/03 Execution/Progress Log.md
---

# 2026-09-03 — Cash-pay drawer, receipt, and staff workflow implemented

**Implementation:** completed the locally-authorized cash portion of [[Cash-Pay Billing Implementation Package]]. Additive Rails records now preserve per-site cash-drawer sessions, immutable cash tender/change evidence, and immutable cash-payment/cash-refund receipt records beside the established invoice/payment-event/allocation ledger. The internal Billing workspace can open one drawer per site, record cash against a posted invoice, calculate change server-side, open a scoped printable receipt, close with a recorded short/over variance, and show the server-derived expected cash. The patient financial ledger identifies only locally evidenced cash payments and receipt availability, enabling a cash-only refund control without exposing external processor references or assigning a source to historical payment events.

**Evidence:** focused synthetic integration coverage exercised drawer open, cash payment/change, same-request replay, cash refund, printable receipt with `Cache-Control: no-store`, expected cash, and non-blocking discrepant close. The patient-ledger regression passed with its new cash/receipt indicators; TypeScript typecheck, production Vite build, changed-file Prettier, Git whitespace, and Impeccable detector passed. The focused cash test previously passed; a later repeat did not finish inside the local command window despite PostgreSQL showing no lingering `apply_test` activity, so it is not double-counted as new evidence. The local browser page remained at Loading because its API context was unavailable, so no visible browser acceptance is claimed.

**Limits and next authority:** this is synthetic local cash evidence, not permission to operate a real drawer. Receipt HTML is not the approved production receipt/PDF/reprint/delivery design. Check scanning/OCR/image custody, invoice numbering/service-date policy, receipt content/version/delivery, correction/reopen governance, superbill, Stripe, portal, real data, and release remain blocked until accepted separately. The package's whole-milestone table is updated as the source of truth.
