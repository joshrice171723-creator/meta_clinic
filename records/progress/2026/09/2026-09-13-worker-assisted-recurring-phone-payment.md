# Worker-assisted recurring telephone payment

Date: 2026-09-13

## Outcome and boundary

The local synthetic membership-growth workflow now separates patient self-service Checkout from staff-assisted recurring telephone enrollment. An authorized membership reviewer can take over one prospective patient's incomplete purchase, attest that the caller authorized the displayed monthly recurring terms, and start a Stripe Terminal Mail Order/Telephone Order (MOTO) SetupIntent on the configured reader. The implementation is development/test-only and does not authorize live cards, real patient information, deployment or clinic operation.

## Failure-first record

- **Principal failure:** an old consumer Checkout or another caller's saved payment identity remains active while staff starts a telephone subscription, causing a duplicate charge, customer crossover or premature patient creation.
- **Detection and prevention:** the service rechecks clinic permission, assigned worker, optimistic version, exact prospect state, connected Stripe account, reader, provider identifiers, recurring amount/currency/interval and opaque correlation. It expires the existing open Checkout before staff takeover; creates a unique Stripe Customer and SetupIntent; stores no card values; and withholds patient, agreement, receipt, portal and onboarding records until the initial subscription invoice is verified paid.
- **Disproof and recovery:** the focused synthetic journey confirms one online Checkout is closed, no second Checkout is created, reader/setup/customer/subscription identities remain prospect-specific, and patient count stays zero through card setup and unpaid subscription processing. Unknown or mismatched provider state fails closed for reconciliation instead of creating another payment.
- **Exit evidence:** source and migration on local Windows/PostgreSQL; focused Rails membership-growth file passed 11 runs / 193 assertions; the decisive phone-payment case passed 1 run / 38 assertions; scoped RuboCop passed 9 files; the focused frontend file passed 5 tests; TypeScript type checking and the production build passed. The development migration subsequently installed without resetting data. Browser inspection verified location selection before clinic entry, the Growth pipeline, assigned signup-call state, exact recurring amount/cancellation attestation and disabled-until-attested telephone-payment action. Live or simulated Stripe MOTO reader processing was not performed.

## Remaining gates

Stripe must approve MOTO access and the clinic must register and configure a supported reader in the same Stripe account. The clinic still needs approved recurring-authorization language and retention, cancellation operations, Payment Card Industry Data Security Standard review, tax determination/registration where applicable, reader custody, monitored webhook reconciliation, hosted acceptance and explicit release authority. No tax calculation was enabled.
