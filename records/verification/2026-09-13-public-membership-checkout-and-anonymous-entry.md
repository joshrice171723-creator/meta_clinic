# Public membership checkout and anonymous entry

Date: 2026-09-13

## Scope and boundary

This change covers the synthetic, local public membership storefront only. It must begin without an active application session, collect contact information before payment, and then redirect to a server-created Stripe test Checkout page. It does not establish a live payment service, send real email, or authorize use of real patient or payment data.

## Failure-first review

| Failure mode | Detection | Preventive change | Recovery and verification |
| --- | --- | --- | --- |
| Stripe rejects the request configuration before a Checkout session exists, but the buyer receives a misleading retry message. | The observed message is emitted by the shared Stripe gateway after every Stripe exception; its requested application programming interface version is unsupported. | Pin the gateway to the current Stripe application programming interface version and preserve a safe configuration-rejection message. | A service test fixes the expected version and error classification; a browser journey must still confirm a hosted Checkout redirect with test credentials. |
| The saved restricted sandbox key expires, and a replacement temporary sandbox key can create Checkout sessions but cannot inspect Connect accounts. | A redacted provider probe returned `401 api_key_expired` for the saved key; the replacement key authorized Checkout reads but returned `403 forbidden` for Accounts v2. | Accept Stripe Command Line Interface temporary-sandbox keys and explicitly scope the temporary platform-account route to development and test configuration. Do not weaken the connected-account requirement outside that boundary. | Create a hosted Checkout session through the temporary platform sandbox and visibly confirm the `checkout.stripe.com` card-entry page. A claimed sandbox with Accounts v2 access remains required for connected-clinic production routing. |
| An already signed-in development account remains active when opening a public membership page. | The route is public but app session polling reads the existing session and the development shortcut only navigates. | Clear the session before mounting a public directory or storefront route. | A front-end test confirms anonymous-entry gating; manually enter the public route from a signed-in synthetic account. |
| A provider redirect or completed payment is treated as proof of onboarding. | Checkout and webhook handling are separate from the route entry. | Keep provider confirmation and onboarding server-side and test-only. | Do not claim payment, email, or onboarding completion without provider-event and local evidence. |

## Exit criteria

Source checks must pass for the changed server and web code. Browser confirmation must show a hosted Stripe test Checkout address only after contact details are accepted; it remains a local, synthetic verification and not production acceptance.
