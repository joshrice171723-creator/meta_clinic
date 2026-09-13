# Account-first membership enrollment — 2026-09-13

## Outcome and boundary

Founder clarification: select a membership, create its account, verify email, then pay. Account creation enters the clinic Growth queue. Unpaid enrollment stays there for follow-up; verified payment moves it to patient onboarding using the same account, with no second account invitation. Local application changes and independent fictional records only; no hosted release or live payment.

## Failure-first review

- Hypothesis: an account activation can consume its link before Stripe is available, leaving an active account with no way to resume. Existing generic login routes that account to the unrelated guidance portal. Growth also mislabels unverified accounts and retains paid people in its list.
- Prevention: a session-owned enrollment page and checkout action, account verification checked on the server, explicit enrollment stages, and an unpaid-only Growth query. Receipt and patient access reuse the verified account.
- Disproof: exercise account creation, unauthorized/unverified checkout denial, verification, sign-out/sign-in recovery, unpaid queue retention, verified payment, duplicate delivery, same-account portal access, and removal from Growth. Assert patient records and onboarding do not exist before payment.
- Recovery: keep the existing account and prospect on payment failure; retry payment explicitly. Account activation succeeds independently of provider availability. Historical accountless staff records keep their existing invitation fallback.
- Standards applicability: this change concerns commercial enrollment and account access, not clinical records or health-data exchange. No Fast Healthcare Interoperability Resources implementation guide governs this signup ordering; the founder's explicit workflow and existing session/tenant contracts govern it. Stripe's Checkout fulfillment contract governs paid conversion.

## Exit evidence

- Focused Rails account-first journey passed: 1 test, 54 assertions, no failures or errors. Covers email verification, authenticated payment resumption, unpaid Growth retention, duplicate payment delivery, same-account portal access, and paid removal from Growth using a fake processor and test mail delivery.
- Frontend checks passed across membership Growth, API client, app shell, and test-login suites (32 distinct tests). The membership suite was rerun alone with one worker and a longer timeout after a resource-pressure timeout; all 5 membership tests then passed.
- TypeScript checking and the production Vite build passed. Scoped Ruby syntax and RuboCop checks passed; vault and agent-harness verification and the refreshed context graph passed. Scoped diff whitespace checks passed.
- Windows had approximately 164 MB free physical memory during verification. Browser automation repeatedly timed out, so no browser or responsive acceptance is claimed. The broad web verification runner was interrupted to reduce resource pressure; the focused checks above completed separately. Full backend/security suites were not run in this turn.
- No live email delivery, processor transaction, deployment, or hosted acceptance claimed. Existing accountless staff-assisted records retain their invitation fallback; newly verified membership accounts do not receive a second account invitation after payment.
