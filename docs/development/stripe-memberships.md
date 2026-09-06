# Stripe sandbox monthly memberships

[sc-294](https://app.shortcut.com/apply-1/story/294) owns the roadmap and acceptance. This extends [clinic subscriptions](clinic-subscriptions.md). [Dated implementation evidence](../../records/clinic-subscriptions/2026-09-06-stripe-sandbox-handoff.md) separates source implementation from observed behavior.

## Local setup

This integration is enabled only in development/test, with a sandbox server key. Production is deliberately unavailable. The hosted Checkout integration needs no publishable key in the frontend. Never use a key previously exposed in chat.

Create `apps/api/tmp/stripe-sandbox.json` privately (the directory is Git-ignored):

```json
{
  "STRIPE_SANDBOX_KEY": "",
  "STRIPE_CONNECT_WEBHOOK_SECRET": "",
  "STRIPE_RETURN_ORIGIN": "http://127.0.0.1:3200"
}
```

Save a newly created `rk_test_` restricted server key in the first field. Do not commit this file or paste its contents into chat. Server environment variables with the same names override the private file; test environments use environment variables only. Changing the private file does not require restarting Rails. Adding the Stripe gem to a running server does require a restart.

Restricted-key permissions must cover the actual calls below. Stripe's Dashboard may group Accounts v2 creation under configuration permissions. If a call is denied, review the denied endpoint and grant its specific resource; do not enable every product.

| Scope | Resources used |
| --- | --- |
| Platform | Accounts v2 and merchant configuration creation/read; Account Links write; account read; Events read; CLI Debugging Tools write for local listening |
| Connected accounts | Checkout Sessions write, Customers write, Products write, Prices write, Subscriptions write; Invoices and Invoice Payments read; Payment Intents write; Charges read; Events read |

No payout/transfer/refund creation permission is needed by APPly. Stripe onboarding selects full Dashboard access, US/USD, merchant card payments and Stripe as fees/losses collector. The account is verified again before payment. The clinic owns its processing fees and payout account. Clinic business/bank details and any agreements are completed by the user on Stripe's hosted page.

For a clean local start, follow [getting started](getting-started.md), using the existing database and port environment settings. Do not reset a populated database. The current review runtime uses `apply_sc269_development`, web port `3200` and API port `3201`. Migrations `20260906000200` through `20260906000400` are additive. Preserve the existing publication migration and runtime privilege requirements.

Install the official [Stripe CLI](https://docs.stripe.com/cli). On this Windows workspace, the official binary is available privately at `apps/api/tmp/stripe-cli/stripe.exe`. From the repository root, start the listener after saving the key:

```powershell
$env:APPLY_API_PORT = '3201'
ruby bin/stripe-listen
```

Keep that terminal open. The helper passes the key in the child process environment, saves the listener's signing secret into the private JSON file without printing it, and forwards only the listed membership events to `http://127.0.0.1:3201/stripe/connect/webhook`. It does not generate events, run tests or create charges. A stale `STRIPE_CONNECT_WEBHOOK_SECRET` environment override must be removed or updated to match the listener. No public tunnel or Dashboard webhook destination is needed for this local listener.

The subscribed snapshot events are `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `customer.subscription.updated`, `customer.subscription.deleted` and `charge.refunded`. Connected-account event routing is mandatory. Account onboarding status is explicitly refreshed through **Check connection**; Accounts v2 thin events are not consumed.

## Manual acceptance walkthrough

Joshua authorized a light automated-testing pass during the non-inventory integration. Focused automated checks support the manual walkthrough below; they do not establish Stripe payment or user acceptance. The earlier testing pause is preserved in the dated handoff as historical evidence.

1. Open `http://127.0.0.1:3200/login`, choose **OmniLogin**, then open `http://127.0.0.1:3200/clinic/billing`. Select **Stripe setup**. After the listener is ready, reload and choose **Connect clinic with Stripe**. Complete the sandbox onboarding yourself, return, and choose **Check connection**. Both card payments and payouts must be enabled.
2. Open **Subscriptions** in the clinic sidebar. Create/edit a membership with a positive USD monthly price, automatic renewal, one-month duration, end-of-term cancellation and maximum one purchase per patient. Publish its immutable version. Existing service-selection and eligibility review rules still apply.
3. Sign out and choose **Open assigned patient portal** at the login page. On `http://127.0.0.1:3200/patient-portal`, select the published membership, review the server quote and enroll. The preview portal cannot purchase. Complete only sandbox Checkout using Stripe's documented sandbox payment details.
4. On return, select **Check payment status** if delivery has not arrived. A browser return alone grants nothing. Once Stripe confirms full payment, inspect the paid dates and receipt. Return as Omni to **Billing → Subscriptions**, then inspect the corresponding invoice and payment in the other Billing tabs. Stripe should show a connected-account subscription with `application_fee_percent = 2.1`; each successful invoice's payment must have the matching rounded fee.
5. Abandon another unpaid Checkout to review the pending state. It can be resumed or canceled; repeated requests reuse the original session. A expired Checkout is reconciled before another enrollment is allowed. Unknown provider outcomes require recovery, not a second payment.
6. On each real sandbox monthly renewal, paid invoice evidence creates one new local invoice/payment/receipt and updates the paid interval. Failed, incomplete or past-due collection does not extend access. The patient can reopen an outstanding hosted Stripe invoice and then check payment status. **Refresh from Stripe** backfills missed paid invoice history without creating charges.
7. Choose **Cancel future renewals** and confirm. For a paid subscription, Stripe schedules cancellation at period end and APPly retains only the verified paid access. For an open unpaid Checkout, APPly expires that session. Refresh repeatedly to inspect stable dates and records.
8. If reviewing refunds manually, use the connected clinic's sandbox Stripe Dashboard. APPly observes cumulative successful refunded amounts from the verified charge; it never initiates a Stripe refund or claims that the application fee was refunded. A full refund of the current paid period removes that period's access. Refunding a payment does not cancel its recurring subscription; cancel future renewals separately.

Immediate month advancement is not built into this UI. Checkout currently creates its own customer without a test clock. An accelerated renewal/failure walkthrough requires a separately reviewed sandbox test-clock customer flow; do not claim that monthly renewal was exercised merely by completing initial Checkout. Focused service tests use stubbed Stripe responses and cannot prove live sandbox delivery or a real monthly charge.

## Implementation contract and limits

- `StripeGateway` uses stripe-ruby `19.6.1`, API `2026-08-26.dahlia`, a sandbox-only transport and HTTPS redirect allowlists. Stripe's official SDK changelog verified this pairing on 2026-09-06.
- `StripeConnect` creates one durable clinic/account routing identity and verifies full Dashboard and fee responsibility. Direct Checkout runs with the connected-account header. Subscription Checkout sets `subscription_data[application_fee_percent] = 2.1` for every invoice; one-time purchases use a fixed 210-basis-point fee rounded to cents.
- Stripe receives only a neutral membership product label and opaque routing reference, with no clinical package, service or patient data from APPly. Card details are collected by Stripe.
- Signed webhook evidence persists a digest and redacted identifiers in the existing event ledger. Processing re-reads current Stripe objects and verifies account, sandbox, currency, amount, interval, payment and fee. Unique checkout/agreement and invoice/payment cycle identities plus locks prevent repeat ledger allocation. An old event cannot shorten the latest recorded paid period.
- Successful invoices create append-only membership cycles, exact allocations and receipts dated from Stripe's paid timestamp. Renewal invoices are materialized locally only when paid; outstanding Stripe renewal amounts are shown separately. The dashboard's collected-after-refunds figure excludes processor/application fees and is not a Stripe balance or payout forecast.
- Initial one-time payment dates use the successful charge timestamp. Refund observations reconcile cumulative amounts, dated when APPly observes them; individual Stripe refund IDs/timestamps, application-fee returns and actual processing-fee/balance-transaction accounting are not imported.
- Provider calls currently run synchronously, including under clinic locks during reconciliation. Large histories or provider outages can delay other clinic billing work and exceed request deadlines. Webhook retries and manual recovery retain financial correctness; a durable queue, bounded recovery batches, monitoring and operational reconciliation are production work.
- No plan switching, discounts, tax, prorations, trials, subscription pauses, service-consumption accounting, refund initiation, automatic balance top-ups or clinic-to-APPly software subscription page is implemented. Provider term changes outside these constraints fail closed for operator reconciliation.
- A lost account/session creation response may be retried using its original idempotency key within 23 hours. After that, identity recovery is an operator task; no new account/payment is silently created. No repair UI for that exceptional identity loss is provided.
- Production enablement requires explicit release authority, secure hosted credentials and connected webhooks, runtime database grants, financial/privacy/security review, operational ownership, reconciliation monitoring and acceptance evidence. The development lock is deliberate; this work makes no production-readiness claim.

Primary references: [Connect subscriptions](https://docs.stripe.com/connect/subscriptions), [direct charges](https://docs.stripe.com/connect/direct-charges), [fee-payer behavior](https://docs.stripe.com/connect/direct-charges-fee-payer-behavior), [Accounts v2 creation](https://docs.stripe.com/api/v2/core/accounts/create), [Connect webhooks](https://docs.stripe.com/connect/webhooks), [CLI listening](https://docs.stripe.com/cli/listen), [stripe-ruby changelog](https://github.com/stripe/stripe-ruby/blob/master/CHANGELOG.md).
