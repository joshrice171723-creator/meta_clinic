# MC12 waitlist exact-reply recovery — 2026-09-30

This increment addresses only gap 3 in the [accepted source-coverage matrix](2026-09-30-mc12-source-coverage-at-651.md) at `8b6cfedb963b020607c19814c83bf346c15c639c`, the branch base. It is dated source and synthetic validation evidence, not a score, connected acceptance or release approval. Refill, reschedule/cancel and intake recovery remain with their assigned owners.

## Existing contract verified

The [portal controller](../../apps/api/app/controllers/clinic/patient_portal/waitlist_controller.rb) derives practice/patient authority from the authenticated identity and patches the owned entry with action, expected version and request key. The [waitlist service](../../apps/api/app/services/clinic/scheduling/waitlist.rb) records immutable identity-scoped exact-reply receipts and verifies the original entry/action/version payload on replay. Fresh acceptance retains current eligibility checks. Both successful accept and decline update the entry once; acceptance books the selected offer, while decline clears its offer timestamps and returns it to waiting. The response serializes the entry, including version, recorded state and appointment reference. No server contract or eligibility policy is changed here.

## Changes

- [WaitlistReplySubmission](../../apps/web/src/features/patientPortal/waitlistReplySubmission.ts) captures and freezes the original offer snapshot, action, version, body and request key. It serializes explicit submissions and preserves that exact attempt after transport errors, HTTP 408, server errors and explicit `outcome_unconfirmed`, including subsequent ordinary rejection. Only an initial known rejection releases the attempt for a fresh action.
- A successful exact PATCH is acknowledged only if its returned entry matches the original entry, site, clinician, visit type, next version, action state and recorded state. Acceptance additionally requires a positive appointment reference and the selected offer timestamps; decline requires cleared offer timestamps and no appointment. A mismatched response remains unconfirmed.
- [PatientWaitlistOffers](../../apps/web/src/features/patientPortal/PatientWaitlistOffers.tsx) uses this component-owned in-memory attempt. Fresh actions stay locked during uncertainty, and explicit retry resends the same body/key even if a later list or eligibility result changes. A GET showing waiting is informational; it cannot confirm the original decline. Cleanup discards the owner and ignores its late completion; the existing patient-context component key and API session ownership remain in place.

There is no automatic resend, new browser/server private working-copy storage, provider interaction or change to staff queues, refill, appointment dialogs or intake. Full reload/unmount still ends the mounted recovery boundary.

## Validation

All requests and records in the [new regression suite](../../apps/web/test/patient-waitlist-reply-recovery.test.ts) are synthetic. The 24 passing cases comprise 22 helper cases and two Chromium tests mounting the real component under React StrictMode. They cover exact accept/decline replay through uncertainty and later rejection, changed intent and eligibility, wrong acknowledgments, duplicate clicks, disposed owners, and a waiting GET that must not unlock an unconfirmed decline. Mounted tests intercept `/api/*`; there is no live API/database/patient connection.

Executed in the disposable cloud worktree:

```sh
python3 bin/agent-resources run -- pnpm --dir apps/web exec vitest run test/patient-waitlist-reply-recovery.test.ts --maxWorkers=1
python3 bin/agent-resources run -- pnpm --dir apps/web run typecheck
python3 bin/agent-resources run -- pnpm --dir apps/web run build:bundle
pnpm --dir apps/web exec prettier --check src/features/patientPortal/PatientWaitlistOffers.tsx src/features/patientPortal/waitlistReplySubmission.ts test/patient-waitlist-reply-recovery.test.ts
git diff --check
```

Focused tests: **24/24 passed**; TypeScript and Vite bundle passed. Initial mounted fixture failures came from intercepting a source-module URL as API JSON, then a DOM assertion racing a list refresh; both fixture issues were corrected before the final passing run. Locked dependencies were installed without scripts using disposable workspace pnpm cache/store paths; manifests and lockfiles are unchanged.

## Remaining limits

The existing PATCH response does not echo request key or return an immutable receipt snapshot. Its exact request is server-verified against the receipt, but the serialized entry can have subsequently evolved. This client deliberately retains uncertainty if the current result no longer matches the original next-version transition; it does not infer success from a later waiting/booked state or claim to solve every reconciliation case. No backend changes were needed or backend tests executed; Ruby remains unavailable in this cloud environment. Connected patient-account, session-revocation and live mobile acceptance remain external validation, not implied by synthetic Chromium checks. No PR, merge, deployment or canonical score/document edit is included.
