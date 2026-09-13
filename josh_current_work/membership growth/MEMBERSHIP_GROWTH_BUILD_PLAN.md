# Membership Growth Build Plan

## User flow

- The clinic publishes a unique membership page containing only its own published packages.
- The customer chooses a package and any allowed options, then enters name, email address, optional phone number, and contact permission to begin account setup.
- Account setup creates an encrypted, tenant-scoped purchase prospect in Growth and sends a one-time email link. The linked setup page verifies the address, sets the first password, accepts the current portal terms, and creates a normal member session. A mismatched, expired, replayed, or already-owned address cannot start checkout.
- “Have the clinic contact me” remains a separate encrypted outreach lead without a patient, user account, payment, or membership record.
- The authenticated account can start an idempotent Stripe sandbox Checkout Session only for its matching verified Growth prospect. Packages requiring clinic review remain contact-first.
- A return to the storefront never claims success by itself. A verified signed payment event must match the stored clinic, immutable quote, currency, amount, fee, Checkout Session, and payment records.
- After verified payment, one transaction creates the patient, invoice, paid membership agreement, payment allocation, billing receipt, active patient-portal identity for the already-verified account, and front-desk patient-flow task. The receipt email confirms payment; it does not require the member to set a second password.
- The paid onboarding view requests the limited profile details already supported by the patient record and offers appointment scheduling. The Patient Flow board ends at an actual future appointment created through the existing clinic scheduling authority; it does not treat opening the scheduler, a task claim, or an appointment request as scheduled.

## Pipeline

Contact-first: `new -> contacted -> qualified` or `declined`.

Purchase: `account_setup_pending -> account_verified -> checkout_pending -> payment_processing -> paid_onboarding -> scheduling -> scheduled`. The first two stages are represented by persisted account-setup metadata on the prospect; existing payment and appointment records remain authoritative for the later stages. Expired and failed checkout outcomes remain distinct and never enter onboarding. A patient becomes a durable patient record only at verified payment.

## Failure-first controls

- Clinic and published-version lookups are tenant-scoped.
- Public submissions use request keys and immutable digests.
- Payment reconciliation trusts signed provider events and fresh provider reads, never the browser return URL.
- Amount, currency, payment mode, connected account, application fee, and opaque correlation must match before onboarding.
- Replayed payment events reuse the same patient, agreement, receipt, task, and email-delivery marker.
- Contact values are encrypted at rest; only keyed digests are used for duplicate signals.
- Account setup tokens are stored only as digests, expire, are single-use, and are never returned in normal public responses or stored in browser persistence.
- Checkout derives the purchaser from the authenticated, verified prospect rather than browser-submitted contact fields.
- Receipt email is serialized by the prospect lock so concurrent event delivery cannot duplicate receipts or create a second patient-flow task.
- The Patient Flow board is a read-only, tenant- and capability-scoped projection. Its column is derived from persisted account, payment, task, appointment-request, and appointment state; browser drag or card placement cannot change official workflow state.

## Failure-first record

| Element | Record |
| --- | --- |
| Outcome and boundary | A person with a verified account can purchase one selected clinic membership, then becomes a paid patient only after a verified payment. Authorized staff see the current Patient Flow stage and use the existing scheduler to create the terminal scheduled appointment. Local synthetic data and Stripe test mode only. |
| Principal failure | A wrong or unverified email could be charged, a browser return could falsely show a paid member, or a board action could imply an appointment was scheduled when no appointment exists. |
| Detection and prevention | Checkout requires a session bound to the verified prospect; provider webhook reconciliation owns payment activation; one-time token digests and expiry protect account setup; the board reads server-owned stages and displays source links and incomplete/error states. |
| Disproof and recovery | Exercise expired/replayed/wrong-account setup tokens, a verified account attempting another prospect's checkout, duplicate and out-of-order payment events, missing scheduling access, and task/appointment state disagreement. Expected result: no cross-account checkout, no duplicate patient/payment records, no false scheduled card; retry the same authorized step or route staff to the linked source workspace. |
| Exit record | Record actual local tests, browser journey, source revision, reviewer/date, and remaining email, payment-provider, clinical, privacy, and release gates in the implementation handoff after build. |

## Healthcare data boundary

The United States Core Patient Profile is relevant when the verified payment intentionally creates the minimal patient record. The account-setup and paid-onboarding forms collect only the bounded administrative/contact profile fields accepted by the existing patient model; they do not collect clinical history, prescribe, triage, or make appointment eligibility decisions. This implementation does not claim Fast Healthcare Interoperability Resources conformance, clinical readiness, or exchange acceptance. Additional demographics and identity matching remain governed by future clinic and integration requirements.
