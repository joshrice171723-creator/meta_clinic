# Prospective-patient rule and verified portal handoff

Date: 2026-09-13
Environment: local development and test with wholly synthetic data
Decision: D-070

## Outcome and boundary

The public clinic membership flow records a prospective patient as soon as it receives a name plus an email address or phone number. Opening, canceling, abandoning or failing Checkout does not create a patient and does not remove the prospective patient. A matching server-verified successful payment creates the patient, receipt, clinic onboarding task and one-time portal invitation. The successful browser return waits for that evidence before continuing to password setup.

This work changes local source, the named `apply_development` schema and the disposable `apply_test` schema. It does not enter card details, create a live payment, send production email, deploy, or authorize real patient data.

No healthcare implementation guide was selected because this increment concerns commerce confirmation, account activation and product relationship labeling rather than clinical data content or an exchange contract. The existing clinical and release gates remain unchanged.

## Failure hypothesis, detection and prevention

Principal failure: the browser returns before the signed payment event is processed and receives portal credentials or a patient record anyway. The handoff endpoint detects the current server-owned prospect state and returns only `preparing` until paid onboarding and a matching unexpired invitation exist. A wrong opaque reference is denied. Browser state never supplies payment authority.

Secondary failure: requiring email for every inquiry loses a reachable phone-only lead. The capture contract now requires either email or phone, while the purchase path still requires email for the receipt and portal invitation.

## Disproof and recovery

Synthetic negative checks request the handoff before payment and with a wrong reference; neither returns an activation path. Successful payment is replayed through the existing verified gateway fixture, after which browser and email paths share the same one-time activation token. Activation clears the encrypted temporary token. If signed processing is delayed or the temporary handoff cannot complete, the browser directs the person to the receipt email instead of reporting false success.

The database transition is additive except for allowing null email fields on prospective records. Existing email values remain unchanged. The new digest constraint requires at least one valid contact digest. The migration is forward-only; a future transition must preserve phone-only prospects and activation evidence.

## Exit evidence and limits

- Focused Rails phone-only capture: 1 run / 9 assertions, passed.
- Focused Rails purchase and activation journey: 1 run / 46 assertions, passed.
- Focused frontend membership-growth file: 5 tests, passed.
- TypeScript type check: passed.
- Production frontend build: passed.
- Frontend dependency audit: zero vulnerabilities.
- Scoped Ruby style check: 8 files, no offenses.
- PostgreSQL verifier: upgrade preservation, stock/settings concurrency, separate restore and fresh migration passed; task-owned scratch databases were cleaned by the verifier.
- Backend invariant verifier: invoice allocation and simultaneous address version checks passed, then an existing appointment-reservation concurrency check failed with `Overlapping reservations raced`; this was outside the membership-growth paths.
- Ruby syntax and diff-integrity checks: passed before the final documentation update.
- The first full focused Rails-file run hit PostgreSQL's configured idle-in-transaction timeout during development test-account setup and was stopped. It did not fail a checkout assertion and is not counted as passing evidence.

Browser completion of a Stripe test payment, external email delivery, full-suite and production build checks remain unverified. Live Stripe, hosted release, real-patient use and clinical, privacy, security or legal acceptance remain outside this result.
