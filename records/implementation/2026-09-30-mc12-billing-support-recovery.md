# MC12 patient billing-support recovery — 2026-09-30

Base: `8c3d2358073acd14bb135a93a3adb1d7aa9034c8`. Branch: `nova/mc12-patient-return-20260930`. Scoring reference: `419b822fbe5ac8ca0ba16ae67f52d14982a47391`. This record supplies source evidence for independent scoring; it does not change the canonical percentages.

## Missing behavior and implementation

The patient [billing-support component](../../apps/web/src/features/patientPortal/PatientBillingSupport.tsx) retained an exact retry only while the content stayed identical. After an uncertain POST, editing the question generated a different key and could create a second persisted request. Transport errors outside `ApiError` also lacked uncertainty guidance.

The new [submission owner](../../apps/web/src/features/patientPortal/billingSupportSubmission.ts) captures a trimmed immutable question/key pair, serializes in-flight sends, and retains the original pair after transport errors, HTTP 408/5xx, or explicit `outcome_unconfirmed`. The text field locks and the button offers an explicit same-request retry. No automatic replay occurs. A matching positive request ID, key, `message` type and exact content are required before clearing the question and displaying saved-for-review success. A definitive initial rejection allows correction with a fresh key; a rejection after an earlier uncertain result cannot disprove that earlier commit and retains the original attempt.

The [portal call site](../../apps/web/src/features/patientPortal/PatientPortal.tsx) remounts this component when practice/patient changes; the existing outer session guard is keyed by user. Attempts remain in component memory only. No protected values or keys are put in browser storage. Existing server-owned practice/patient/identity checks and immutable request history are unchanged. No site permissions, visibility policy or external delivery paths change.

## Verified checks

- Independently synthetic [focused tests](../../apps/web/test/patient-billing-support-recovery.test.ts): **13 passed**, one worker. The fake persistence owner commits once, loses its acknowledgement, then returns the same record for an explicit retry even if a changed draft is supplied. It proves one fake saved request, identical key/content, no automatic resend, fresh identity after acknowledgement, network/408/503/explicit-uncertainty handling, rejection-after-uncertainty retention, malformed acknowledgement rejection, rapid-submit serialization and independent component attempts.
- Frontend TypeScript: `python ../../bin/agent-resources run -- node_modules/.bin/tsc --noEmit` passed.
- Changed-file Prettier and `git diff --check` passed.
- Installed unchanged locked frontend dependencies once with scripts disabled. The default pnpm store path was unavailable; installation succeeded using workspace-local store/cache/state paths. No dependency or lockfile change.

These tests execute the submission owner with synthetic in-memory transport; they do not establish real Rails persistence, browser interaction, live delivery or patient/role denial acceptance. No live browser QA, provider calls, email/SMS, credentials or real data were used.

## Instructions and applicability

Reviewed root/web/records instructions, preflight, code-change workflow, frontend-ui skill, product/architecture/TOC/design and exact tracker/MC12 acceptance packet. Graft and MUI MCP were unavailable. Existing MUI 9.4.0 primitives and official [TextField](https://mui.com/material-ui/react-text-field/) and [Button](https://mui.com/material-ui/react-button/) documentation were consulted on 2026-09-30. This is transport recovery for an existing billing-support request, with no clinical fields, healthcare exchange, medication policy or care-plan revision; no new clinical implementation guide applies to this change.

## Remaining scope and local-owner handoff

Ruby is absent (`ruby: command not found`) and there is no checkout-owned Rails/PostgreSQL runtime. No backend provisioning was attempted. The existing local test owner can verify the unchanged owning API against this commit in their isolated synthetic test database:

```sh
cd apps/api
python ../../bin/agent-resources run -- ../../bin/postgres exec bundle exec rails test test/integration/patient_portal_test.rb test/integration/patient_portal_lifecycle_test.rb
```

Still open: connected exact-POST retry/one-row persistence and foreign-patient denial proof; actual UI interaction/context-switch proof; durable uncertainty recovery after full reload/unmount; patient-visible follow-up/return acceptance beyond this billing-support slice; clinical chat and actual outbound message delivery. Tab panels currently stay mounted, but no durable reload claim is made. Existing staff refill delivery and encounter follow-up recovery receive no new credit here. Nova/Relay's membership-history files are untouched.
