# Cash-Pay Billing Owner Decisions

Date: 2026-09-04  
Decision owner: Joshua Rice  
Status: Product scope approved; detailed implementation, qualified review, and release gates remain required.

This record captures owner decisions made for the cash-pay billing roadmap. The canonical APPly decision register remains [Decisions.md](../../APPlyVault/03%20Execution/Decisions.md); this file is the capability-specific execution copy. It does not authorize real payment transactions, provider credentials, patient data, document delivery, or deployment by itself.

## Approved product scope

| Capability | Owner decision | Boundary |
| --- | --- | --- |
| Staff-only cash collection | Approved | Staff-facing collection against posted invoices. |
| Cash refunds | Approved | Cash-only refunds tied to evidenced cash payments. |
| One drawer per physical site | Approved | One open drawer per clinic location. |
| Manager reconciliation | Approved | Staff close may record a short/over amount; a manager reconciles it without rewriting the original facts. |
| Checks/OCR | Approved for a later increment; deferred from first release | No check image, OCR, or manual check-entry path is enabled in the first release. Provider, custody, retention, access, deletion, and review rules remain future work. |
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

## Additional owner decisions

| Decision | Owner approval | Boundary |
| --- | --- | --- |
| First patient portal scope | Billing-only portal first | Start with authenticated access to permitted billing documents and payment actions; do not expand to a full clinic portal in this increment. |
| Receipt email delivery | Automatic email after payment | Send only to a verified, authorized address and record delivery attempts/failures. |
| Receipt and billing-data retention | Applicable U.S., state, and clinic policy | Do not invent a universal retention period; configure the approved policy before real release. |
| Accounting and tax boundary | APPly records payment facts; accounting system owns tax/GL | Do not build tax calculation or accounting export into the first release unless separately approved. |

## Rollout and portal verification decisions

| Decision | Owner approval | Boundary |
| --- | --- | --- |
| First-release rollout posture | Controlled U.S. pilot with one clinic | Prove the complete workflow in a bounded pilot before broader rollout. |
| Portal verification access | Omni portal patient view with patient switching | Omni may view what any selected patient in its assigned practice would see using local development data; the view is read-only, clearly labeled, server-gated, and unavailable for real patient data or production impersonation. |

Support and on-call ownership is intentionally deferred because it is not relevant to the current planning slice.

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
