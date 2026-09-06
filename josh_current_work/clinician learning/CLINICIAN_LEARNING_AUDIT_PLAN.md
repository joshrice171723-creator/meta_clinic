# Professional Learning Record Audit Plan

Status: prospective verification plan; there is no implementation evidence or release approval yet.

Backlinks:

- [ROADMAP.md](ROADMAP.md)
- [CLINICIAN_LEARNING_BUILD_PLAN.md](CLINICIAN_LEARNING_BUILD_PLAN.md)
- [Healthcare Capability Roadmap Index](../ROADMAP_INDEX.md)
- Shortcut planning Story `sc-410`

## Audit decision

The capability is safe to pilot only when evidence proves that it provides useful source-cited education, protects patient and clinician privacy, keeps clinical and learning authority separate, and describes records truthfully. It is eligible for an accredited pilot only when a named accredited provider prospectively approves the activity and remains the issuer of credit.

A roadmap, UI, model response, export, passing unit test, or clinician attestation is not by itself proof of accredited CME.

## Audit boundary

Audit the full path:

```text
authorized clinical/general entry
-> question and context handling
-> source retrieval and answer generation
-> citation inspection and engagement evidence
-> learning candidate
-> reflection and clinician attestation
-> private portfolio
-> export preview/create/download
-> external self-report outcome
-> future accredited-provider decision
```

Include browser, Rails, provider adapters, source licensing/provenance, authorization, tenant and clinician ownership, protected storage, logs/telemetry, audit delivery, export artifacts, feature flags, and rollback. The audit does not certify HIPAA compliance, medical-device status, professional-board acceptance, or accreditation.

## Evidence rules

- Evidence must come from the current implementation and environment, not roadmap prose.
- Every result records date, commit, environment, synthetic fixture, actor/role, tenant/site, expected result, actual result, artifact location, and reviewer.
- Use synthetic patients, encounters, questions, sources, and credentials only.
- Passing lower-level tests cannot close browser/runtime or external-provider gates.
- A mocked provider can prove internal state behavior but not source availability, latency, licensing, or live delivery.
- A self-reported external status is evidence only of what the clinician recorded, not what an external organization decided.
- Accredited award evidence requires the provider’s approved activity version and provider-issued acknowledgement.

## Gate matrix

| Gate | Required proof | Pilot blocker |
|---|---|---|
| Product claims and governance | Approved intended-use statement, claims glossary, prohibited-copy review, privacy/retention/time/attestation/source policies, named owners. | Any wording implies earned/approved CME without provider authority. |
| Authorization and ownership | Server-side role/capability matrix, cross-clinician/tenant/site negative tests, IDOR tests, context reauthorization, session/CSRF evidence. | Unauthorized private learning or patient context can be read or changed. |
| Privacy and data flow | Data-flow diagram, provider contract/settings, minimum-necessary payload evidence, encryption/storage review, PHI log/telemetry scan, export deidentification results. | Patient identifiers, raw clinical text, questions, or reflections leak to unauthorized surfaces or exports. |
| Evidence quality and provenance | Allowlist/version review, claim-to-citation evaluation, original-source resolution, freshness/retraction behavior, conflict/uncertainty and abstention evidence. | Answers lack inspectable provenance or materially misrepresent sources. |
| Clinical safety and intended use | General-education boundary tests, harmful/patient-specific prompt set, no-write proof, stale/wrong-patient tests, clinician reviewer sign-off. | Feature recommends or performs unsafe care actions, or patient-context reasoning ships without its gate. |
| Engagement and record integrity | Active/idle/background timing tests, idempotency, clinician edit/attestation, revision/supersession, source-change stale behavior. | Passive use creates a record or time can be inflated without visible provenance. |
| Portfolio and export | Exact preview-to-artifact reconciliation, formula-injection protection, immutable history, correction lineage, authenticated download, privacy scan. | Export totals/content differ from preview or protected patient data appears. |
| External status truthfulness | Submission and outcome-source tests, unsupported-jurisdiction behavior, versioned guidance, no inferred acceptance. | APPly represents a clinician-entered status as verified. |
| Accessibility and workflow fit | Desktop/tablet/narrow screenshots, keyboard/focus/escape, screen-reader names/status, contrast, zoom, reduced-motion, dirty-navigation and resume tests. | Sidecar blocks care, loses work silently, or is not operable by keyboard. |
| Reliability, observability, and rollback | Provider outage, timeout, partial answer, audit failure, duplicate retry, feature-disable, data preservation, alert/runbook evidence. | Failure creates silent authority, loses confirmed records, or cannot be contained. |
| Accredited activity, future only | Provider agreement, prospective activity approval/version, participation rules, disclosures, AI oversight, provider decision receipts, correction/revocation/reconciliation. | APPly can issue, change, or backdate credit without provider authority. |

## Role and scope matrix

The audit must prove the backend behavior, not only hidden buttons.

| Actor | Own inquiry/answers | Own reflection/record | Own export | Aggregate data | Provider configuration/award |
|---|---:|---:|---:|---:|---:|
| Authorized clinician | Yes | Yes | Yes | No by default | No |
| Another clinician in same practice | No | No | No | No | No |
| Practice manager/admin | No by default | No by default | No by default | Only approved deidentified aggregates | No |
| Clinical/education lead | No by default | No by default | No by default | Only approved deidentified aggregates | No |
| Support operator | No | No | No | No | No |
| Authorized provider administrator, future | Only the minimum qualified activity package | No general private portfolio | Only approved activity evidence | Approved program reporting only | Configure activity; provider decides award |
| User from another tenant | No | No | No | No | No |

Test disabled accounts, ended memberships, switched practice/site, direct object-ID changes, stale sessions, missing capabilities, forged role/actor/tenant fields, and replayed requests.

## Critical end-to-end journeys

### Journey 1 — general question to confirmed learning

1. Authorized clinician opens a general evidence sidecar.
2. Asks a synthetic clinical-education question.
3. Receives a concise answer with source dates, uncertainty, and inline citations.
4. Opens an original source and asks a substantive follow-up.
5. Completes the session; APPly proposes but does not create a learning moment.
6. Clinician reviews topic, objective, time, reflection, status language, and attestation.
7. Clinician confirms and sees the item in their private learning record.

Required evidence: network/API trace, source snapshot/digests, engagement events, attestation/version, audit events, browser screenshots, and cross-user denial.

### Journey 2 — confirmed encounter context

1. Provider confirms the synthetic patient and encounter in the current chart flow.
2. Selects a SOAP concept or verified condition/medication and chooses **Explore evidence**.
3. Sidecar shows the right context and a `General education` label.
4. Provider changes encounters while the sidecar has work.
5. APPly blocks or explicitly clears/rebinds context; it never silently carries the prior patient.
6. Saved learning preview contains no patient identity, clinical value, raw note, or transcript.

Required evidence: before/after screenshots, request payload review, stale-context response, data-store inspection, deidentification result, and audit correlation.

### Journey 3 — abstention and source failure

1. Ask an unsupported, ambiguous, newly changed, or adversarial question.
2. Remove or fail one evidence source/provider.
3. Verify partial/abstained/unavailable state and visible source limits.
4. Verify no evidence-based learning moment can be confirmed from an uncited answer.
5. Retry without duplicate engagement or answer history.

Required evidence: injected failure, error/alert trace, preserved inquiry, new response revision, no false learning/credit state, and recovery result.

### Journey 4 — export and correction

1. Select exact confirmed learning revisions and date range.
2. Preview the deidentified rows and totals.
3. Create/download CSV using one idempotency key.
4. Retry the request and verify one immutable snapshot.
5. Correct a learning record through a superseding revision.
6. Create a new export that references the new revision and preserves the old export.

Required evidence: preview/artifact field reconciliation, digests, formula-injection fixture, correction lineage, authenticated download, privacy scan, and audit events.

### Journey 5 — external self-report

1. Record a submission to a supported synthetic destination.
2. Verify status remains `submitted` with `clinician_reported` source.
3. Record accepted and rejected examples with a visible status source.
4. Choose an unsupported jurisdiction and verify neutral export plus “requirements not verified.”
5. Change a guidance profile and verify historic submissions keep the old version.

Required evidence: UI labels, API/store values, guidance source/version, unsupported fallback, and no credited-total change.

### Journey 6 — future accredited activity

1. Create a provider-approved activity version with a future eligibility window.
2. Complete one qualifying and one non-qualifying synthetic activity.
3. Verify APPly submits only the qualified package and displays `pending provider decision`.
4. Ingest issued, rejected, corrected, and revoked provider decisions.
5. Verify old general-learning records never become eligible retroactively.

Required evidence: provider agreement/approval reference, activity version, eligibility evaluation, outbound digest, signed/verified provider receipt, reconciliation, certificate reference, and revocation history.

## Negative and abuse cases

At minimum test:

- forge `practice_id`, `site_id`, `clinician_membership_id`, `clinician_profile_id`, patient ID, encounter ID, or learning record ID;
- ask for another clinician’s record or export by direct URL/API;
- submit protected clinical text in a deidentified field;
- include a patient name, date of birth, medical record number, phone, email, exact visit date, or distinctive narrative in topic/reflection;
- leave the drawer open idle, background the tab, change system clock, replay active-time events, or send implausible deltas;
- replay attest/export/submission requests with same and different payloads;
- change evidence sources after a draft is created;
- use retracted, stale, conflicting, paywalled, malicious, or inaccessible sources;
- inject instructions through source text or a selected SOAP-note passage;
- ask for direct diagnosis, treatment, prescribing, or autonomous official-record changes;
- navigate to another patient, practice, site, or logged-out state with the drawer open;
- disable the capability during an active request and with existing confirmed records;
- fail audit persistence, provider request, source retrieval, artifact storage, and download;
- attempt spreadsheet formula injection in CSV fields;
- mark an external status accepted without identifying its source;
- alter the browser to say accredited or issued while server state is non-accredited; and
- activate an accredited activity outside its approved version/date window.

## Evidence-quality evaluation

Before clinician pilot, build a clinically reviewed synthetic question set across common, uncommon, ambiguous, conflicting, contraindicated, outdated, and insufficient-evidence topics. For every response, reviewers score:

- factual correctness;
- claim-to-citation entailment;
- source quality and currentness;
- completeness of material cautions;
- uncertainty and abstention appropriateness;
- jurisdiction/applicability clarity;
- readability and time-to-understand; and
- whether the answer could be misconstrued as patient-specific advice.

Record individual failures, not only averages. Define the release thresholds with the clinical reviewer in `sc-412` before running the evaluation. High-severity unsafe or fabricated-citation failures block pilot regardless of aggregate score.

For model/provider changes, rerun the locked set and a fresh adversarial sample. Evidence must identify provider, model, retrieval profile, source-policy version, and commit.

## Privacy and deidentification verification

Inspect every location protected content could reach:

- database columns and encryption behavior;
- job/action arguments and retry payloads;
- application/provider request logs;
- metrics, analytics, tracing, and error reporting;
- browser memory, cache, local/session storage, and URLs;
- audit event metadata;
- notifications and staff-message events;
- CSV/PDF artifacts and filenames; and
- future provider submission packages.

Use synthetic canary identifiers to prove they do not appear outside approved protected fields. Automated detection supports but does not replace human review of exported prose. A deidentification failure is a release blocker.

## Accessibility and workflow review

Capture and inspect the actual built UI at supported desktop/tablet and narrow layouts. Verify:

- focus moves into the drawer and returns to the invoking concept;
- the drawer can be dismissed and resumed without silent loss;
- keyboard order, escape behavior, source expansion, dialogs, and menus;
- visible labels for general versus patient-context mode and every record status;
- screen-reader announcement of loading, partial, stale, failed, saved, and conflict states;
- citations and uncertainty are not color-only;
- zoom/reflow, contrast, target size, reduced motion, and text spacing;
- chart and Scribe actions remain usable while the sidecar is present; and
- one clear primary action per region.

The sidecar must reduce context switching without obscuring clinical work. If clinicians routinely close it to complete an encounter, the design has failed even if it is technically functional.

## Observability and operational evidence

Dashboards and alerts must use non-content metadata and cover:

- inquiry start/completion/failure by mode and provider version;
- source retrieval failures, retraction/freshness warnings, and citation mismatches;
- answer latency, partial/abstained rate, and retry outcomes;
- deidentification blocks and privacy/security denials;
- attestation conflict, export failure, duplicate reconciliation, and download failure;
- cross-tenant/ownership denial anomalies;
- audit-delivery failure; and
- future provider submission/acknowledgement/reconciliation mismatch.

Runbooks must explain safe feature disablement, provider cutoff, source correction, affected-record identification, clinician notification, export invalidation/supersession, and future award revocation reconciliation.

## Severity and disposition

| Severity | Meaning | Gate consequence |
|---|---|---|
| Critical | Cross-tenant/private-record disclosure, patient-data leakage, unsafe clinical action, fabricated accreditation/award, or unrecoverable record corruption. | Immediate no-go; disable affected capability and investigate. |
| High | Material citation fabrication, source misrepresentation, wrong-patient context, authorization bypass, export mismatch, or silent stale-state use. | No pilot/release until fixed and retested. |
| Medium | Recoverable workflow/accessibility/reliability defect that could confuse status or lose unconfirmed work. | Fix before broad release; narrowly accepted pilot exception requires named owner and expiry. |
| Low | Minor issue with no authority, privacy, safety, record-integrity, or task-completion impact. | Track with owner; does not alone block a bounded pilot. |

Open Critical or High findings always block. “Known limitation” is not a disposition for an authority, privacy, or clinical-safety failure.

## Release gates

### Gate A — internal synthetic readiness

- Policy/claims boundary approved.
- General-education evidence, sources, abstention, learning draft, attestation, private record, and rollback work end to end.
- Automated suites pass for authorization, state, idempotency, deidentification, exports, and negative cases.
- No open Critical or High findings.

### Gate B — bounded clinician pilot

- Clinical evidence-quality review meets predeclared thresholds.
- Desktop/tablet accessibility and workflow review passes.
- Privacy/log/telemetry inspection passes.
- Support, incident, correction, source withdrawal, and feature-disable runbooks are exercised.
- Product language is non-accredited and self-report status is explicit.

### Gate C — contextual clinical pilot

- Confirmed-encounter, wrong-patient, stale-context, and unsaved-work evidence passes.
- Minimum-necessary context payload is approved.
- General-education mode does not drift into patient-specific recommendation.
- Scribe integration, if included, preserves separate documentation and learning authority.

### Gate D — export and guidance release

- Preview/artifact/history/correction/privacy reconciliation passes.
- Every guidance profile has an authoritative source, effective/review date, version owner, and unsupported fallback.
- External status source is always visible and server-enforced.

### Gate E — accredited provider pilot, future

- Named accredited-provider agreement and prospective activity approval exist.
- Accredited provider reviews the participation/reflection record and AI/source controls.
- Issued/rejected/corrected/revoked provider decisions reconcile.
- Designation language, certificate, reporting, retention, disclosures, evaluation, and monitoring are approved.
- The non-accredited product cannot manufacture or backdate an award.

## Audit output

When implementation begins, create `AGENT_AUDIT_EVIDENCE.md` only after factual evidence exists. It must include:

- audited commit and environment;
- exact Story and scope;
- release phase and flags;
- evidence matrix with links/artifacts;
- automated and live/runtime results kept distinct;
- clinical/privacy/accessibility reviewers and dates;
- open findings, owners, expiry, and retest status;
- external provider/source limitations; and
- explicit go/no-go decision.

Do not create an implementation handoff or evidence file during planning and do not mark the roadmap complete from this audit plan alone.

## Planning references

- [AMA: what to know about the other kind of CME credit](https://www.ama-assn.org/education/ama-pra-credit-system/what-know-about-other-kind-cme-credit)
- [AMA PRA Credit System requirements](https://www.ama-assn.org/education/ama-pra-credit-system/ama-pra-credit-system-requirements)
- [ACCME: joint providership](https://accme.org/rule/joint-providership/)
- [ACCME: urgent alert on the use of AI in accredited education](https://accme.org/news/urgent-alert-on-the-use-of-ai-in-accredited-ce/)
- [Heidi Evidence product guide](https://support.heidihealth.com/en/articles/13191359-get-started-with-heidi-evidence)

Revalidate these and add jurisdiction-specific primary sources before implementation or release decisions.
