# Patient Portal Audit Plan

## Related planning documents

- [Capability roadmap](ROADMAP.md)
- [Patient portal build plan](PATIENT_PORTAL_BUILD_PLAN.md)
- [Shared roadmap index](../ROADMAP_INDEX.md)
- Host implementation roadmap: `APPlyVault/03 Execution/Patient Portal Implementation Roadmap.md`

## 1. Audit purpose and boundaries

Determine whether the portal can expose the correct patient’s approved information and accept bounded requests without becoming an ungoverned clinical, prescribing, payment, or emergency system. Audit the full journey from invitation and session assurance through dashboard reads, request submission, scheduling/payment/document transitions, result release, support, failure recovery, and rollback.

Passing automated tests does not prove HIPAA compliance, clinical safety, reimbursement eligibility, accessibility conformance, or vendor/contract approval. Those decisions require named owners and evidence outside the codebase.

## 2. Required evidence package

Collect the commit/environment manifest, route and serializer inventory, schema/migrations/indexes/constraints, identity and capability matrix, data-flow/threat model, encryption/key-rotation notes, audit-event catalog, retention/legal-hold policy, vendor/processor/scribe/lab/e-prescribing review, notification policy, document/PDF policy, incident/runbooks, accessibility report, synthetic account fixtures, screenshots, and pilot go/no-go record.

For every operation, map: role, patient/practice relationship, capability, UI control, server enforcement, audit event, source/version, failure state, retry behavior, and evidence location.

## 3. Audit workstreams

### A. Identity, session, and support access

- Invite an existing synthetic patient; verify proofing, token expiry, one-time use, terms evidence, step-up, recovery, device/session rotation, logout, inactivity, and revocation.
- Try invitation forwarding, replay, account enumeration, reset bypass, shared contact reuse, wrong-patient selection, stale session after revocation, proxy escalation, and support impersonation.
- Confirm no production route accepts the development login or fixture account, and no browser token or protected value is persisted.
- Verify invite, activate, step-up, recovery, revoke, denial, and support events are append-only, actor/session scoped, and free of tokens or PHI.

### B. Tenant, patient, and capability isolation

- Exercise every context, appointment request, patient request, ledger, document, result, and release endpoint with unauthenticated, expired, revoked, wrong-practice, wrong-patient, suspended, read-only, and altered-ID requests.
- Verify response codes and counts do not leak another patient’s existence. Test session rotation, CSRF, Origin, no-store headers, cache behavior, and direct API access independent of hidden UI controls.
- Confirm capability flags are descriptive only; Rails reauthorizes every operation.

### C. Intake, appointments, and inventory

- Submit a versioned intake module with incomplete, duplicate, stale, corrected, unsigned, and wrong-patient data. Verify source/provenance, signature/attestation, mapped-field allowlist, and correction workflow.
- Submit duplicate and concurrent appointment requests; test offset/timezone/DST, stale availability, overlapping appointments, expired holds, cancellation/release, site/service eligibility, and staff override.
- Verify approval cannot create a booking or inventory decrement without authoritative service/resource checks, and outage falls back to explicit staff contact.

### D. Billing, credits, and Stripe boundary

- Verify posted/draft/void invoice visibility, exact-decimal totals, partial allocation, unapplied credit, refund, reversal, tax/fee presentation, receipt/document state, and immutable history.
- Replay duplicate, out-of-order, signed/unsigned, stale, unknown, and cross-account webhook events. Force processor timeout, duplicate payment intent, abandoned checkout, refund/dispute, and reconciliation queue outcomes.
- Confirm no raw PAN/CVC, payment metadata with clinical content, or processor secrets appear in APPly records, logs, telemetry, URLs, or browser storage.
- Require finance/merchant owner acceptance of account ownership, webhook secret custody, tax/receipt numbering, refund/dispute process, and support escalation before enabling collection.

### E. Clinical summaries, documents, and results

- Attempt to view draft, unsigned, unreleased, withdrawn, amended, wrong-encounter, wrong-patient, quarantined, and unauthorized documents. Verify release requires qualified review, explicit version, snapshot, source provenance, and audit.
- Download, retry, reissue, and revoke synthetic documents; inspect content-disposition, no-store, authorization-at-download, access logs, PDF visual quality, text extraction, keyboard navigation, and screen-reader labels.
- Project only clinician-released authoritative results with units, ranges, source date, correction/version state, and neutral text equivalents. Test unreleased, amended, critical, missing-range, and corrected results.
- Confirm summary copy never implies diagnosis, treatment completion, reimbursement eligibility, or emergency coverage.

### F. Requests, messaging, refills, and notifications

- Submit general and refill requests with duplicate keys, changed retry payloads, excessive content, expired session, wrong identity, and provider outage. Verify encrypted storage, digest compatibility, safe metadata-only projection, status transitions, triage owner, SLA clock, and no false “approved/resolved” state.
- Test attachment policy, if enabled: allowlist, size, checksum, quarantine, malware failure, private download, expiry, retention, and wrong-patient denial.
- Verify messages are not an emergency channel and exact response-time copy is approved. Test notification redaction, delivery failure, duplicate suppression, opt-out, quiet hours, and no content in external previews.
- Route refill requests to the approved prescriber/e-prescribing workflow; test denial, clarification, controlled-substance restriction, provider-unavailable, and request-withdrawal behavior.

### G. UX and accessibility

- Capture desktop, tablet, narrow, 200%/400% zoom, forced-colors, reduced-motion, and slow/offline states for login, dashboard, request, appointment, billing, document, and error flows.
- Verify heading/landmark structure, labels, focus visibility and return, keyboard-only operation, live-region/status announcements, non-color state meaning, target sizes, error identification/suggestions, and reflow without sensitive content loss.
- Review plain language, timezone labels, empty/unavailable/stale states, emergency copy, request/payment disclaimers, and outcome-unknown/retry wording with patient-support representatives.

### H. Operations, privacy, and recovery

- Inspect logs, traces, analytics, browser titles, notification payloads, backups, exports, support tools, and error pages for PHI, tokens, raw payment data, or unbounded request content.
- Exercise audit-writer failure, database outage, queue stall, webhook replay, notification outage, document-store outage, provider unavailability, backup restore, and manual continuity. Confirm safe pause/rollback without destructive deletion.
- Verify rate limits, secret rotation, alert ownership, unresolved-work dashboards, incident evidence preservation, retention/legal hold, deletion receipts, and access reviews.

## 4. Minimum role and scope matrix

| Operation | Patient | Staff | Clinician | Finance | Admin/auditor |
| --- | --- | --- | --- | --- | --- |
| Read own released projection | Own patient only | Assigned scope | Assigned scope | Financial scope only | Approved audit scope |
| Submit question/refill request | Own identity | Not as patient | Workflow-dependent | No | No |
| Submit appointment request | Own identity | On behalf only if policy permits | Workflow-dependent | No | No |
| Approve/book appointment | No | Scheduling capability | Scheduling capability | No | Policy-dependent |
| Post/adjust invoice or allocate credit | No | Billing capability | No | Finance capability | Approved audit/admin |
| Create payment intent | Own posted invoice only after enablement | Staff workflow | No | Finance capability | No |
| Release summary/result/document | No | No unless explicitly delegated | Clinical release capability | No | Review/audit only |
| Triage/resolve refill request | No | Administrative triage only | Prescriber/clinical workflow | No | Policy-dependent |
| Revoke/recover identity | No | Support workflow with proofing | No | No | Identity-admin capability |
| Read audit history | No | No by default | No by default | No by default | Separate audit capability |

The matrix is a review template, not an authorization implementation. The server must derive actor, practice, patient, relationship, and capability.

## 5. Automated and live test matrix

### Required automated cases

- Identity invitation replay/expiry, recovery, step-up, revocation, session invalidation, enumeration resistance, and support-access audit.
- Practice/patient/role/capability isolation for every portal read and write; direct API ID substitution and stale session.
- Request idempotency, encrypted storage, digest mismatch, status transition, optimistic concurrency, rate limits, and audit completeness.
- Appointment future/window/overlap/timezone/DST/duplicate/concurrent/stale/hold/cancellation cases.
- Ledger exact-decimal balance, credit allocation/reversal, payment intent, webhook signature/replay/deduplication, refund/void, and reconciliation queue.
- Release/no-release/version/addendum/withdrawal, document download authorization, no-store, checksum/scan, and result correction/release cases.
- Notification redaction, delivery unknown, outage/retry, refill authorization denial, and emergency-copy contract.
- Accessibility semantics and responsive snapshots/interaction tests for all implemented patient flows.

### Live synthetic smoke evidence

Use one synthetic practice, patient, staff, clinician, finance user, revoked user, and wrong-practice user. Capture: activation → sign-in → dashboard; submit question/refill → staff triage; request appointment → staff confirmation fallback; post invoice → read balance/credit; clinician release → read summary/document; result release/correction; revoke → denial; provider/outbox failure → visible recovery; logout/session expiry; and rollback/manual continuity. Keep screenshots and network/log evidence redacted.

## 6. Severity and release gates

- **P0 — block all release:** cross-patient/practice disclosure; token/session takeover; unauthorized clinical/payment/document access; raw card capture; silent emergency or critical-result loss; audit bypass; or irreversible financial/clinical mutation from a patient request.
- **P1 — block pilot:** broken revocation/recovery; incorrect capability enforcement; unsafe clinical release; duplicate/unknown payment reconciliation; refill presented as approved; sensitive notification/document leakage; missing retention or inaccessible critical flow; or unowned outage/escalation.
- **P2 — block wider rollout:** confusing status/error, non-critical retry/filter defect, incomplete telemetry, or recoverable responsive/accessibility issue.
- **P3 — backlog:** polish and non-safety enhancement.

Pilot approval requires zero open P0/P1 findings, executable isolation/audit coverage, accepted identity/clinical/finance/vendor/privacy policies, tested recovery and rollback, accessibility evidence, support and incident readiness, and an explicit bounded audience. Production enablement additionally requires real environment preflight, secrets/backup/monitoring verification, training, and named go/no-go approval.

## 7. Audit outputs

- Readiness summary and go/no-go recommendation.
- Role × action × patient/practice scope matrix with direct API evidence.
- Identity/session lifecycle and data-flow/threat-model review.
- Ledger/payment/credit/reconciliation and document/clinical-release evidence.
- Request/appointment/intake/result state diagrams and failure tables.
- Privacy/log/notification/retention/redaction review.
- Accessibility/responsive report with screenshots and assistive-technology notes.
- Findings register with severity, evidence, owner, remediation, and retest.
- Pilot monitoring, support, incident, rollback, backup/restore, and manual-continuity sign-off.

## Research basis

- [HHS Summary of the HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) — access control, audit controls, authentication, integrity, availability, and transmission security; useful safeguards, not a product certification.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) — keyboard, focus, status, contrast, reflow, target size, and accessible authentication review criteria.
- [NIST SP 800-66 Rev. 2](https://csrc.nist.gov/pubs/sp/800/66/r2/final) — risk-assessment and HIPAA Security Rule implementation guidance.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) — masking, sanitization, audit protection, and retention principles.

These sources inform the audit checklist; they do not establish that APPly is compliant, clinically safe, or suitable for a particular organization without its own review and acceptance.
