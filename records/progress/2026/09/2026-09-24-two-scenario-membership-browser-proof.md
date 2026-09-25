# Two-scenario membership browser checkpoint — 2026-09-24

## Scope and method

An isolated, checkout-owned local stack and synthetic database were used to walk two membership entry scenarios in one clinic: weight management and behavioral health. Both programs used local simulator settings. This checkpoint scores **browser evidence coverage**, not product completeness, clinical readiness, or live payment acceptance. Each stage earns 2 points when its action and persisted result were observed, 1 for a rendered or partial result, and 0 when the connected action was not reached.

| Stage | Weight | Behavioral health | Observed evidence |
| --- | ---: | ---: | --- |
| Staff catalog, pricing, and publication | 2 | 2 | Staff published the two program tiers, including $89 monthly weight care and $119 monthly behavioral care, each with its own included follow-up service. |
| Public plan selection | 2 | 2 | The enabled clinic page showed both programs, prices, renewal terms, and service inclusions; each plan could be selected. |
| Account request | 2 | 2 | Two independent synthetic adults submitted the account-first form. Both requests appeared in Growth after reload and as separate `email_verification_pending` records in the local database. |
| Verification and simulated payment | 0 | 0 | Both stopped at email verification; no activation or simulator payment was completed. |
| Patient creation and enrollment | 0 | 0 | Both remained prospective; neither had a patient record or paid enrollment. |
| Patient portal return | 0 | 0 | No account was activated, so portal access was not exercised. |
| Growth unpaid follow-up | 2 | 2 | Both correctly remained in the prospective queue after reload. The behavioral row's staff call-in-progress action and one attempt also survived reload. |
| Paid Patient Flow handoff | 0 | 0 | Patient Flow displayed zero clinic items, consistent with both unpaid requests; no paid handoff occurred. |
| **Connected browser proof** | **8/16** | **8/16** | Four stages were observed for each scenario, limited to the specific actions above. |

The public page address was saved and remained enabled after a reload. Growth showed Patients (0), matching the database's `patient_created:false` and `paid:false` for both records. No outbound email was sent by the staff follow-up action, and no real payment or vendor request was made.

## Blocker and next proof

The local mailer generated verification messages as files. The browser control rejected opening the local mail file under its URL security policy and explicitly prohibited trying the same result through another access route. The messages and verification tokens were not opened or used. This leaves the connected activation, payment, patient creation, portal return, and paid staff handoff unproved in this run. The next acceptance pass needs an allowed normal browser path for a synthetic verification message, then should continue each account through the local simulator and verify reload, paid Growth/Patient Flow, portal identity, and a recovery/denial path. These two membership entries do not establish a full weight-loss or behavioral-health clinical journey.

## Follow-up in progress — 2026-09-24

The local simulator now returns a one-time setup path directly in the account response only for a loopback development request with development access and a clinic opted into the simulator. Ordinary requests retain email delivery. A repeated incomplete synthetic request rotates its token so an expired setup path can be retried. Focused API proof passed 2 cases/82 assertions for setup, payment lifecycle and retry; a later remote-IP denial addition passed its focused case with 24 assertions. Frontend typecheck, 10 related tests, formatting and bundle passed. A broader Rails selection reached 35 runs/419 assertions with two errors: the account-first mail expectation was corrected and its focused test rerun successfully; the separate adult-account catalog fixture still errors before its assertions. No broad green suite is claimed.

Two new synthetic weight and behavioral requests reached their browser setup forms through this path. Account credential creation and portal terms acceptance require the user's direct browser action under the browser-control policy. Their payment, patient, portal and staff stages remain unobserved, so the score above stays 8/16 each until those stages are actually completed and checked after reload.

## Completed local synthetic walkthrough — 2026-09-24

The founder authorized a repeatable synthetic route in this development environment. A new loopback-only development service activates the already-created fictional account for a clinic opted into the local payment simulator. It clears the setup token, retains the generated unusable password, records a distinct synthetic activation audit action, and leaves email verification and portal terms acceptance unclaimed. Ordinary account requests still use the mailed verification and password path. The account page labels the synthetic state explicitly. This replaces the blocked browser credential and terms steps for this local walkthrough; it does not exercise either real step.

The original Avery Cedar weight request and Morgan Vale behavioral request were resumed on the same enabled clinic page. Each reached its plan-specific account page, completed a signed local payment event, and showed a paid enrollment after a full reload. Avery's portal showed Weight Care Monthly active, USD 89 paid, zero outstanding, invoice #12 and payment #6. Morgan's portal showed Behavioral Care Monthly active, USD 119 paid, zero outstanding, invoice #11 and payment #5. The two patient identities remained separate. As Clinic Administrator, the Growth view no longer contained either paid request, while Patient Flow showed both in Ready to schedule, assigned to the front desk with exact patient-specific schedule links. Both cards survived a full Patient Flow reload.

| Stage | Weight | Behavioral health | Latest observed evidence |
| --- | ---: | ---: | --- |
| Staff catalog, pricing, and publication | 2 | 2 | Earlier browser publication and reload proof remains valid. |
| Public plan selection | 2 | 2 | Both original plan selections were repeated on the enabled page. |
| Account request | 2 | 2 | Original requests were reused for the same fictional people and plans. |
| Synthetic account activation and local payment | 2 | 2 | The guarded synthetic account state was shown in the browser; each signed simulator payment was verified and reconciled. No email ownership, password setup, portal terms, external card charge, or Stripe settlement is claimed. |
| Patient creation and enrollment | 2 | 2 | Each paid account linked to a distinct patient and active membership; account and portal views survived reload. |
| Patient portal return | 2 | 2 | Both same-account portal identities, plan details, paid invoice and ledger entries were visible. |
| Growth unpaid follow-up | 2 | 2 | The earlier unpaid queue and follow-up state survived reload; after payment, both paid requests left the prospective queue. |
| Paid Patient Flow handoff | 2 | 2 | Morgan and Avery appeared as separate front-desk initial-contact cards in Ready to schedule, with correct patient schedule links, and survived reload. |
| **Connected local synthetic proof** | **16/16** | **16/16** | This score covers the eight stated browser stages for these two fictional memberships only. |

Focused Rails checks of the guarded activation and denied non-loopback path passed 2 runs/81 assertions. The final affected Rails selection passed 35 runs/506 assertions after repairing a date-dependent age-boundary test fixture. Rails eager loading and scoped RuboCop passed. The related frontend tests passed 10/10; typecheck, formatting and the production bundle passed. These checks and the browser walk establish the local synthetic branch and persisted handoff; the normal email verification/terms flow, renewal or payment failure recovery, wrong-clinic browser denial, external payment, full clinical journeys, deployment and clinic acceptance remain separate work.

To repeat this local walk, enable development sign-in and [opt one synthetic practice into the local payment simulator](../../../../docs/development/stripe-memberships.md), then open that practice's public membership page on the configured loopback origin. Use a fresh fictional adult with an `example.invalid` address for each plan, continue through the account and local payment screens, reload the paid account and patient portal, and use the development Clinic Administrator selector to check the corresponding Patient Flow cards. The same address cannot start a second account after activation; use another fictional address for a new run. Keep simulator configuration private and out of Git.
