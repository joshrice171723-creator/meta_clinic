# Membership Growth Audit Plan

## Evidence target

Prove the local synthetic software flow only. Do not treat these checks as production payment, email deliverability, privacy, security, legal, clinical, or real-patient acceptance.

## Required checks

- Each clinic address exposes only that clinic and its published package versions.
- Contact-first submission creates one encrypted lead and no patient, agreement, payment, or portal identity.
- Purchase-now creates a Stripe sandbox Checkout Session and still creates no patient before payment verification.
- Browser return and cancel states do not activate onboarding.
- A matching verified payment creates exactly one patient, agreement, payment allocation, receipt, portal invitation, receipt email, and front-desk onboarding task across replay.
- The receipt email contains the paid amount, receipt number, and one-time portal activation link.
- Portal activation moves the paid record to the activated stage.
- Wrong clinic, wrong package version, mismatched amount or currency, invalid fee, failed payment, expired checkout, stale pipeline update, and missing clinic authority fail without cross-tenant disclosure.
- No protected contact value or activation token appears in provider metadata, audit metadata, public acknowledgement responses, or browser storage.

## Verification set

Run focused backend integration tests, relevant subscription and portal regression tests, route and boundary checks, Ruby formatting, security scanning, frontend type checking, focused component tests, and the production frontend build. Record known unrelated baseline failures separately.
