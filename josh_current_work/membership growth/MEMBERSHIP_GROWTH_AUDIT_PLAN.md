# Membership Growth Audit Plan

## Evidence target

Prove the local synthetic software flow only. Do not treat these checks as production payment, email deliverability, privacy, security, legal, clinical, or real-patient acceptance.

## Required checks

- Each clinic address exposes only that clinic and its published package versions.
- Contact-first submission creates one encrypted lead and no user account, patient, agreement, payment, or portal identity.
- Account setup creates one encrypted purchase prospect and a one-time setup delivery without a patient, agreement, payment, or portal identity; only the matching email link can set the first password and create the session.
- An unverified account, expired/replayed link, or session for a different prospect cannot create a Stripe Checkout Session.
- Purchase-now creates a Stripe sandbox Checkout Session for the matching verified account and still creates no patient before payment verification.
- Browser return and cancel states do not activate onboarding.
- A matching verified payment creates exactly one patient, agreement, payment allocation, receipt, active portal identity for the verified account, receipt email, and front-desk onboarding task across replay.
- The receipt email contains the paid amount and receipt number without a second password-setup token.
- The Patient Flow board exposes only authorized, tenant-scoped records; its final Scheduled column requires an actual linked future appointment. A claimed task, opened scheduling screen, or pending appointment request must not appear as scheduled.
- Wrong clinic, wrong package version, mismatched amount or currency, invalid fee, failed payment, expired checkout, stale pipeline update, and missing clinic authority fail without cross-tenant disclosure.
- No protected contact value or activation token appears in provider metadata, audit metadata, public acknowledgement responses, or browser storage.

## Verification set

Run focused backend integration tests, relevant subscription and portal regression tests, route and boundary checks, Ruby formatting, security scanning, frontend type checking, focused component tests, and the production frontend build. Record known unrelated baseline failures separately.
