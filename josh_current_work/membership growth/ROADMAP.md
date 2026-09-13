# Membership Growth Roadmap

## Outcome

Give every clinic its own public membership page with two deliberate paths:

1. Create and verify an account before purchasing an eligible package through secure checkout.
2. Ask that clinic to make contact before creating an account or making a payment.

Verified account creation creates a tenant-scoped Growth prospect. It is a prospective patient, not yet a patient record, membership, invoice, payment, or portal identity. The Patient Flow board makes that progression visible to authorized clinic staff: account setup, ready to purchase, paid onboarding, scheduling, and scheduled.

## Boundary

A contact request is a pre-purchase lead and does not create a patient, payment, portal identity, or membership agreement. A checkout start is also not proof of payment. An account must verify its email address and set its password before it can start checkout. Only a verified payment event creates the patient record, activates the purchased membership, creates the invoice/payment/receipt records, and opens the clinic onboarding task. The account holder then lands on the paid onboarding view and can request scheduling; clinic staff complete scheduling through the existing authorized appointment workflow.

## Delivery sequence

1. Clinic-specific public address and published catalog.
2. Contact-first lead capture and outreach pipeline.
3. Account setup: record the selected package and contact details in Growth, send a one-time email link, then verify the address and set a password.
4. Authenticated self-service Stripe sandbox checkout for packages that do not require pre-payment review.
5. Verified-payment reconciliation into patient, membership, invoice, payment allocation, receipt, and front-desk onboarding work.
6. Patient Flow board and scheduling handoff: authorized staff can see the current stage and open the linked patient/scheduling record; a scheduled appointment is the terminal board state.

## External gates

The current payment transport remains Stripe test mode. Production payment acceptance, email provider delivery, privacy and legal review, clinic operating procedures, and real-patient acceptance are separate gates. Walk-ins are excluded from this membership-account flow unless separately scoped.
