# Patient Portal implementation handoff

Date: 2026-09-04
Repository: `C:\Users\joshr\Desktop\Work\APPly`
Scope: owner-approved billing-only portal slice with Omni development preview

## Delivered

- `GET /api/patient_portal/context` now returns only the assigned patient/practice metadata, exact-decimal billing ledger, read-only billing capability flags, and billing notices.
- The normal local patient login remains bound to its active `Clinic::PatientPortal::Identity`.
- `PATCH /api/patient_portal/development_patient` permits only the local Omni development identity to select any patient from its assigned practice.
- The selected Omni preview patient is stored only in the current Rails session. Each context reload uses that selection, and a new Omni session starts at the first available patient.
- Dormant appointment, request, reminder, and reminder-preference routes remain present for explicit compatibility denial but return `patient_portal_billing_only` before their actions run.
- The patient portal UI now renders billing balances, invoices, and payment history only. Omni sees the additional session-scoped selector; ordinary patients do not.
- The local development login includes a direct “Open Omni patient portal” entry point.

## Focused verification added

`apps/api/test/integration/patient_portal_test.rb` covers billing-only projection omission, dormant-action denial, Omni patient switching, session isolation, invalid/cross-scope patient IDs, and ordinary-patient denial of the preview switch.

Verification: the focused Rails integration passes 4 runs / 39 assertions / 0 failures / 0 errors. Web Vitest passes 15 files / 163 tests. Shared web typecheck/build remain blocked by unrelated missing staff-messaging and inventory symbols; browser acceptance remains unverified.

## Explicit exclusions and remaining gates

No production identity provider, real data, production impersonation, payment collection, Stripe/provider integration, PDF/email delivery, checks/OCR, card-present equipment, Superbills, clinical release, appointment booking, intake, reminders, messaging/refills, deployment, or professional/security/finance/operations/accessibility acceptance was introduced.

The formal evidence-first audit remains deferred until the implementation is complete. Local automated results are not release acceptance.
