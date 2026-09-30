# Staff recurring-payment conversion transaction — 2026-09-30

Source-only correction; unintegrated and unverified. Base `fe6db4c0764b1dc9a4d33b354bf744d6fc5c3f12`, branch `codex/mc02-staff-conversion-atomicity-20260930`. No tests, build, lint or new tests, per the coordinator's current instruction.

## Applicable contract and actual source finding

The [membership build plan](<../../josh_current_work/membership growth/MEMBERSHIP_GROWTH_BUILD_PLAN.md>) requires verified-payment conversion to create patient, invoice, paid agreement, allocation, receipt, portal identity and task in one local transaction. [Staff enrollment](../../docs/development/front-desk-membership-enrollment.md), Purpose and Flow 5–6, describes the staff counterpart and assigns conversion to the same existing verified-payment completion. It provides no separate staff exclusion.

At the inspected base, `PublicCheckout.fulfill_staff_subscription!` visibly splits billing reconciliation from onboarding. Its sole caller `StaffPhonePayment.reconcile_subscription!` actually wraps both in an outer transaction, so the ordinary caller already joins local writes atomically. The actual incomplete boundary is that this wrapper also holds provider reads and receipt delivery inside that transaction, and the fulfillment entry point does not independently own full conversion. The correction makes that boundary explicit without claiming a second score award for the existing ordinary-caller atomicity.

## Owned correction

- [StaffSubscriptionEvidence](../../apps/api/app/services/clinic/membership_growth/staff_subscription_evidence.rb): narrowly captures the staff subscription, current invoice, payment allocation, PaymentIntent and optional charge through GETs before conversion locks. Captures original practice/account/reference, subscription/customer/price/setup identity, reviewer/telephone authorization and retained terms. The existing recurring verifier receives independent copies from this exact read set; missing/different requests and writes fail closed with no network fallback.
- [PublicCheckout](../../apps/api/app/services/clinic/membership_growth/public_checkout.rb): verifies connection practice, then acquires existing practice/prospect/purchase locks; rechecks captured bindings and rejects evidence predating a newer checkout sync. Purchase, existing recurring sync/financial audit, onboarding/identity/task/audit and staff paid marker all share one transaction. Existing subscription/cycle/payment identifiers deduplicate replay. Receipt delivery begins after this conversion transaction commits.
- [StaffPhonePayment](../../apps/api/app/services/clinic/membership_growth/staff_phone_payment.rb): removes its encompassing transaction, preserving upfront permission, reviewer, tenant, caller authorization and provider validation. An authorized refresh of completed onboarding retries a missing receipt using the original connection actor and existing serialized delivery marker; it does not create a subscription or charge. The start rescue reloads durable state before marking failure, so a post-commit delivery error cannot relabel a paid conversion as failed.

Recurring billing verifier, provider write/idempotency keys and successful renewal handlers are unchanged. No entitlement/catalog, schema, privilege, fixture, score, provider configuration or clinical policy change. The previous public-path `445a` source remains intact.

## Outcomes and limits

An unexpected provider object/request, changed local payment binding or newer local sync prevents this captured conversion from committing; retry collects current provider reads. A local onboarding/audit/staff-paid write failure rolls back the local purchase and conversion together. A mail failure after commit leaves paid onboarding and its ledger intact; authorized status recovery retries only outstanding delivery. Provider payment may already have completed, so local failure never proves payment failed or authorizes a fresh charge.

No live provider/payment action was made. This increment moves reads outside the *staff conversion* transaction; it does not refactor other recurring observation/recovery or public provider-call boundaries. Existing prospect-lock email serialization is retained after conversion commit. The external-send/marker crash window still does not establish exactly-once email delivery.

## Deferred validation

No tests, build or lint were run or added. Runtime behavior, syntax/lint, concurrent snapshots, rollback, replay, mail-failure recovery and authorization need the assigned local backend owner's later checks. In particular verify provider requests happen before the conversion transaction, an unexpected snapshot request cannot reach a provider, old reads cannot overwrite newer sync, and paid receipt recovery cannot start a new payment. Existing focused membership-growth and Stripe-membership suites remain the validation entry points when authorized. No Ruby/runtime stack was created here.

Relay alone integrates this published correction; no PR, main merge or deployment.
