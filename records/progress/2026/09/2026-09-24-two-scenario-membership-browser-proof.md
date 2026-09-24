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
