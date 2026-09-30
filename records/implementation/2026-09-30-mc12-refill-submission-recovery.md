# MC12 patient refill submission recovery — 2026-09-30

Branch `nova/mc12-patient-return-20260930`, parent `8b6cfedb963b020607c19814c83bf346c15c639c`. Independent source increment for the first concrete gap in the [coverage matrix](2026-09-30-mc12-source-coverage-at-651.md). Waitlist/intake are separately assigned; no IntakeQuestions, membership UI, staff refill review/delivery, queue pagination or reschedule/cancel source changed here.

## Contract and implementation

Current [OP-07/10](../../docs/development/meta-clinic-build-and-acceptance.md) prohibits blind duplicate submission and false acknowledgment after possible commit. The existing patient [CreateRequest](../../apps/api/app/services/clinic/patient_portal/create_request.rb) already binds replay to practice/key, patient, identity, type and structured content digest. A refill support request does not authorize prescribing, clinical review or pharmacy transmission. This uses those existing semantics, not a new clinical field or policy; the connected packet's Communication/Task distinctions remain applicable context, not a FHIR exchange claim.

Previously the [patient form](../../apps/web/src/features/patientPortal/PatientRefillRequests.tsx) retained a key only while fields stayed equal. After possible commit with lost response, it allowed changes and a new request before resolving the first; ordinary network errors did not receive its unknown warning. React state alone also did not serialize a repeated handler before rerender.

The new [submission owner](../../apps/web/src/features/patientPortal/refillRequestSubmission.ts) freezes trimmed medication, pharmacy, note and key, serializes calls and retains the same attempt after network, 408, 5xx or explicit `outcome_unconfirmed`. A later rejection cannot disprove prior possible commit. Initial definitive rejection permits correction and a new key. All three fields lock while busy or uncertain; explicit “Retry same request” remains available. No automatic resend occurs.

The patient RequestsController **create response only** now includes request key/type from the authoritative record. Existing GET lists and shared refill serializer remain unchanged. The browser accepts success only for a positive saved ID, matching key/type/patient source, exact medication/pharmacy/note and known pending/in-review/resolved/declined status. Blank optional note matches the existing null representation. Mismatched/missing acknowledgment stays uncertain and does not clear fields or refresh as success. Already-terminal exact replay is acknowledged without claiming pending clinical review; success tells the patient to check current saved status.

No patient/practice/site authority is introduced in the request body. Existing BaseController session, deployment and active owning identity checks and CreateRequest exact replay remain authoritative on every retry, including after access revocation. Request encryption, audit/model history and review/delivery persistence are unchanged. Existing PatientPortal patient-keyed component lifetime bounds memory. Full reload/unmount recovery is not claimed; no browser protected storage, server private working-copy schema or staff grant is added.

Existing MUI TextField/Button/Alert compose the interaction. The frontend-ui skill was applied; its MUI MCP tool is unavailable, so installed types and previously inspected official MUI documentation are the fallback. No dependency, shared primitive or package change.

## Verified checks and limits

- **21 synthetic submission cases passed**: one fake committed row after lost acknowledgment, immutable exact retry despite supplied changes, initial known rejection, unknown then rejection, network/408/503/explicit unknown, each acknowledgment mismatch, all four saved statuses, null optional note, rapid calls, invalid fresh fields and separate patient owners.
- **Two actual component-handler cases passed with controlled React hooks and mocked transport/resource**: three exact POST bodies across unknown/rejection/success, field locks and explicit retry, no automatic send, one refresh only after confirmation, repeated handler serialization and mismatched-response false-success prevention. These are a source interaction harness, not a mounted DOM/browser or Rails acceptance run. Both cases **failed against original 8b6cfedb component source** and passed after restoring the correction.
- TypeScript `tsc --noEmit`, Vite bundle, changed-file Prettier and `git diff --check` passed. Locked installed dependencies reused; no live browser QA.
- New isolated Rails [patient refill recovery recipe](../../apps/api/test/integration/patient_refill_request_recovery_test.rb) has three cases: exact acknowledgment/replay with one request and unchanged saved attributes, same-key changed pharmacy and other-patient rejection/no content exposure, practice-scoped key namespace/read isolation, and revoked-identity exact retry denial. It asserts no medication revision or delivery is produced merely by submission. **Not executed**: Ruby/Bundler remain unavailable in Cloud. No backend provisioning repeated.

## Exact backend handoff to Sage

Run in the existing owned synthetic runtime at this source commit or its unchanged descendant:

```sh
cd apps/api
python ../../bin/agent-resources run -- bundle exec rubocop app/controllers/clinic/patient_portal/requests_controller.rb test/integration/patient_refill_request_recovery_test.rb
python ../../bin/agent-resources run -- ../../bin/postgres exec bundle exec rails test test/integration/patient_refill_request_recovery_test.rb test/integration/refill_workflow_test.rb
```

The new three case names are `refill acknowledgement confirms exact replay and rejects changed or foreign patient attempts`, `another practice cannot read the refill and owns its separate key namespace`, and `exact refill replay still requires current active owning identity`. No accepted assertion is weakened to accommodate unavailable runtime.

No outbound email/SMS/provider action, credentials, live patient data, clinical policy, durable private draft, PR/main merge/deploy or canonical score change. Independent scorer/reviewer owns acceptance and credit. Remaining owned next source is the existing reschedule/cancel dialog's prior-uncertainty retention/acknowledgment gap; waitlist and intake remain with their assigned owners.
