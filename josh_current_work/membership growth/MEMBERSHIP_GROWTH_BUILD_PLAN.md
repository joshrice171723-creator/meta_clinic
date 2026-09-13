# Membership Growth Build Plan

## User flow

- The clinic publishes a unique membership page containing only its own published packages.
- The customer chooses a package and any allowed options, then provides their name, email address, optional phone number, and contact permission.
- “Have the clinic contact me” creates an encrypted, tenant-scoped outreach lead without creating patient or payment records.
- “Purchase now” creates an idempotent Stripe sandbox Checkout Session. Packages requiring clinic review remain contact-first.
- A return to the storefront never claims success by itself. A verified signed payment event must match the stored clinic, immutable quote, currency, amount, fee, Checkout Session, and payment records.
- After verified payment, one transaction creates the patient, invoice, paid membership agreement, billing receipt, portal invitation, and front-desk patient-call task. The receipt email includes the one-time portal activation link.

## Pipeline

Contact-first: `new -> contacted -> qualified` or `declined`.

Purchase: `checkout_pending -> payment_processing -> paid_onboarding -> contacted`; portal activation moves paid onboarding or contacted records to `converted`. Expired and failed checkout outcomes remain distinct and never enter onboarding.

## Failure-first controls

- Clinic and published-version lookups are tenant-scoped.
- Public submissions use request keys and immutable digests.
- Payment reconciliation trusts signed provider events and fresh provider reads, never the browser return URL.
- Amount, currency, payment mode, connected account, application fee, and opaque correlation must match before onboarding.
- Replayed payment events reuse the same patient, agreement, receipt, task, and email-delivery marker.
- Contact values are encrypted at rest; only keyed digests are used for duplicate signals.
- Receipt email is serialized by the prospect lock so concurrent event delivery cannot invalidate a just-sent activation link.

## Healthcare data boundary

The United States Core Patient Profile is relevant when the verified payment intentionally creates the minimal patient record. This implementation does not claim Fast Healthcare Interoperability Resources conformance, clinical readiness, or exchange acceptance. Additional demographics and identity matching remain governed by future clinic and integration requirements.
