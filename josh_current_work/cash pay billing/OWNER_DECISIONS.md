# Cash-Pay Billing Owner Decisions

Date: 2026-09-04  
Decision owner: Joshua Rice  
Status: Product scope approved; detailed implementation, qualified review, and release gates remain required.

This record captures owner decisions made for the cash-pay billing roadmap. It does not authorize real payment transactions, provider credentials, patient data, document delivery, or deployment by itself.

## Approved product scope

| Capability | Owner decision | Boundary |
| --- | --- | --- |
| Staff-only cash collection | Approved | Staff-facing collection against posted invoices. |
| Cash refunds | Approved | Cash-only refunds tied to evidenced cash payments. |
| One drawer per physical site | Approved | One open drawer per clinic location. |
| Manager reconciliation | Approved | Staff close may record a short/over amount; a manager reconciles it without rewriting the original facts. |
| Checks/OCR | Approved | Provider, image custody, retention, access, deletion, and review rules must still be selected and implemented. |
| Stripe/card payments | Approved | Provider integration remains server-authoritative and requires provider/security/operations review. |
| Patient portal | Approved | Patient identity, consent, document access, support, and privacy controls remain required. |
| Superbills | Explicitly out of scope | Do not build, expose, or label receipts as superbills under this roadmap. |
| PDF and email receipts | Approved | Requires an immutable document snapshot, delivery controls, retention, and reissue policy. |

## Initial operating geography

| Decision | Owner approval | Boundary |
| --- | --- | --- |
| First real release geography | United States only | Do not expand country, tax, privacy, currency, or provider scope without a separate decision. |

## Stripe rollout scope

| Decision | Owner approval | Boundary |
| --- | --- | --- |
| First-release card payments | Online card payments only | Use a hosted Checkout or Payment Element flow; no physical terminal is required for the first release. |
| Card-present payments | Approved for a later increment | Defer implementation and acceptance until physical equipment is available for testing. |

## Working defaults adopted

These defaults may guide implementation unless the owner later overrides them. They are not a substitute for qualified legal, accounting, privacy, security, accessibility, or professional review.

- Assign a permanent invoice number when an invoice is posted. Drafts remain unnumbered, and numbers are never reused.
- Treat service date as the date the service occurred. Require it before posting; do not substitute the payment date.
- Keep staff drawer close non-blocking. Preserve expected cash, counted cash, discrepancy, and explanation immutably; corrections create a new adjustment/review record or an explicitly approved reopen transition.
- Generate receipts from an immutable server snapshot after a successful payment or refund. Reprints reference the original; corrections create a reissue and never overwrite history.
- Generate PDF receipts for approved payments and email them only to a verified, authorized delivery address. Record delivery attempts and failures without placing sensitive payment data in logs.
- Do not store raw check images by default. Keep the check boundary fail-closed until an approved provider and custody policy exist.
- Use a hosted or Payment Element card surface. APPly must not store PAN or CVC; server-owned collection intents and signed, deduplicated webhook events remain the authority boundary.
- Limit the patient portal to the authenticated patient's permitted financial documents and actions. Do not add unrelated clinical content merely to support billing.

## Still required before real-world enablement

- Select and approve the check/OCR provider and image/data custody policy.
- Approve Stripe account ownership, supported payment scope, refunds/disputes, secrets, webhook custody, and reconciliation ownership.
- Approve receipt numbering, document fields, email delivery, retention, reprint, and correction policy.
- Name hosted-environment, support, on-call, backup/restore, rollback, privacy, security, accessibility, accounting, and professional-review owners.
- Capture the authenticated synthetic browser journey at desktop, tablet, and narrow widths.
- Record a written go/no-go decision after all required evidence and reviews pass.
