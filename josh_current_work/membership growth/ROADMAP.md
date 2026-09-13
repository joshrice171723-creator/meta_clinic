# Membership Growth Roadmap

## Outcome

Give every clinic its own public membership page with two deliberate paths:

1. Purchase an eligible package immediately through secure checkout.
2. Ask that clinic to make contact before any payment.

## Boundary

A contact request is a pre-purchase lead and does not create a patient, payment, portal identity, or membership agreement. A checkout start is also not proof of payment. Only a verified payment event creates the patient record, activates the purchased membership, opens the clinic onboarding task, and sends the receipt with a one-time patient portal link.

## Delivery sequence

1. Clinic-specific public address and published catalog.
2. Contact-first lead capture and outreach pipeline.
3. Self-service Stripe sandbox checkout for packages that do not require pre-payment review.
4. Verified-payment reconciliation into patient, membership, receipt, portal invitation, and front-desk onboarding work.
5. Clinic pipeline controls for outreach completion and portal activation visibility.

## External gates

The current payment transport remains Stripe test mode. Production payment acceptance, email provider delivery, privacy and legal review, clinic operating procedures, and real-patient acceptance are separate gates.
