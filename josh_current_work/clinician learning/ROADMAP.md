# Professional Learning Record Roadmap

Status: planning baseline; no clinician-learning feature or accredited CME activity is implied to exist.

Companion plans:

- [CLINICIAN_LEARNING_BUILD_PLAN.md](CLINICIAN_LEARNING_BUILD_PLAN.md) defines the software architecture and build sequence.
- [CLINICIAN_LEARNING_AUDIT_PLAN.md](CLINICIAN_LEARNING_AUDIT_PLAN.md) defines the evidence required before pilot or release.
- [Healthcare Capability Roadmap Index](../ROADMAP_INDEX.md) coordinates shared APPly dependencies.

## Product decision

APPly should create a **Professional Learning Record** that turns evidence review already happening during clinical work into a private, inspectable learning history. Learning should begin where the clinician is working—such as a SOAP note, diagnosis, medication, observation, or Scribe draft—not in a separate course catalog.

The first release is deliberately **not an accredited CME product**. It may help a clinician document non-accredited learning and prepare a record for self-reporting where an external organization allows it. APPly must not say that a clinician earned, completed, qualified for, or was awarded CME unless a future accredited provider prospectively controls the eligible activity and issues the credit.

Clinician-facing names:

- **Explore evidence**: the contextual action inside clinical work.
- **Evidence sidecar**: the right-side research and question workspace.
- **Save learning moment**: the explicit clinician action that creates a record.
- **My learning record**: the private portfolio and export surface.

Avoid calling the first release a “CME tracker.” That phrase suggests authority the product does not yet have.

## Vision

A physician notices an unfamiliar diagnosis, unexpected result, medication question, or documentation concept while reviewing an encounter. They select the relevant text or open an adjacent action and choose **Explore evidence**. APPly opens a sidecar without removing them from the chart.

The sidecar gives a concise, source-cited explanation:

1. the bottom line;
2. why it may matter;
3. what the evidence says and how current it is;
4. important limits, disagreement, or uncertainty;
5. links to the underlying guideline, review, or paper; and
6. suggested follow-up questions.

The clinician may ask follow-ups and inspect sources. If the interaction becomes meaningful learning, APPly offers a quiet **Save learning moment** action. The physician confirms the topic, time, and a short reflection such as “confirmed my approach,” “changed my approach,” “needs follow-up,” or “not useful.” APPly then adds a deidentified entry to the physician’s private learning record.

The product should feel like a useful clinical evidence tool first and a learning recorder second. It must never interrupt care with a quiz, badge, course prompt, or forced reflection.

## Who it helps

| User | Value |
|---|---|
| Physician or advanced-practice clinician | Gets an understandable, source-cited answer in context and avoids reconstructing learning history months later. |
| Practice clinical leader | Can offer a safer evidence workflow without reading private questions or reflections. May see only approved aggregate adoption and safety measures. |
| Compliance or education lead | Gets consistent, deidentified records and provenance instead of screenshots, browser history, or memory. |
| Accredited CME partner, later | Receives a prospective, versioned activity record with participation evidence, reflection, and traceable sources under rules it approved. |

## Experience map

### 1. Discover in the work

Contextual entry points may appear beside a clinical concept in:

- a SOAP note or prior signed note;
- an AI Scribe draft or cited source;
- a diagnosis or problem entry;
- an observation or result once the underlying host workflow is verified;
- a medication statement once the underlying host workflow is verified; or
- a global quick action for a clinician who wants to ask a general question.

The action is never the default clinical action and never implies that APPly recommends changing care.

### 2. Explore without leaving the chart

The right-side evidence sidecar preserves the current chart context. It clearly shows whether the question is:

- **General education**: based on a selected topic, without patient-specific reasoning; or
- **Patient-context evidence review**: uses protected encounter context and is available only after the model/provider, privacy, intended-use, and clinical-safety gates are satisfied.

The MVP should launch with general education. Patient-context reasoning is a later, separately gated capability because it can cross from education into clinical decision support.

### 3. Inspect, question, and verify

Every answer must show citations close to the claims they support. The clinician can open a source, see publication and review dates, identify the publisher, and understand when evidence is limited or conflicting. APPly must not hide uncertainty behind a polished summary.

### 4. Confirm a learning moment

APPly may suggest saving only after inspectable engagement, such as reading an answer, opening a source, or asking a substantive follow-up. It does not create a learning record merely because a drawer was open.

The clinician controls the final record and must:

- confirm the deidentified topic and learning objective;
- review the documented active time;
- choose or write a short reflection;
- attest that the entry is accurate; and
- save, edit, or discard it.

### 5. Use the private record

**My learning record** is reachable from the clinician’s profile/account area and from a post-session confirmation, not from a new primary “Learn” navigation tab. It supports search, date filters, specialty/topic filters, source inspection, edits with history, voiding, and deidentified PDF/CSV export.

The record distinguishes:

- potential learning;
- documented non-accredited learning;
- prepared or submitted for external self-reporting;
- externally accepted or rejected, with the source of that status; and
- accredited credit issued by a recognized provider in the future.

These are different facts and must never be collapsed into one progress number.

## Product principles

1. **Care remains primary.** Learning actions are adjacent, dismissible, and resumable.
2. **A useful evidence interaction comes first.** Tracking is a byproduct of explicit clinician confirmation.
3. **Source visibility is mandatory.** An AI answer without inspectable provenance cannot become a confirmed learning moment.
4. **Patient context stays protected.** Exports contain no patient identifiers, raw notes, transcripts, or result values.
5. **The clinician owns the reflection.** Practice managers do not receive routine access to personal questions, reflections, or source-reading history.
6. **Active time is evidence, not a stopwatch claim.** Passive tab time, background time, and idle time are excluded; the clinician reviews the result.
7. **External authorities remain authoritative.** APPly records a self-reported outcome but does not infer acceptance.
8. **Accreditation is prospective.** A later partnership can define eligible activities going forward; old records are not retroactively relabeled as accredited.
9. **Clinical decision support needs its own gate.** Patient-specific diagnosis or treatment recommendations are not smuggled into an “education” feature.
10. **No productivity surveillance.** Learning activity is not used for performance rankings, compensation, or punitive monitoring.

## Roadmap

### Phase 0 — policy, claims, and partner discovery

Outcome: a signed product boundary before software implementation begins.

- Review the participation/reflection record with clinical, privacy, legal, and an accredited CME organization.
- Decide the first supported jurisdiction and the exact non-accredited/self-report wording.
- Define source quality, freshness, correction, retraction, and evidence-conflict policies.
- Define active-time, reflection, attestation, retention, export, and amendment rules.
- Decide whether any patient context may leave APPly and require appropriate contractual/privacy controls before it does.
- Produce a prohibited-claims list for product copy, sales, support, and exports.

Exit criteria:

- Approved intended-use statement and claims glossary.
- Approved privacy/retention policy and source policy.
- Written external review stating what the v1 record can and cannot support.
- No dependency on receiving accreditation to begin the non-accredited product.

### Phase 1 — evidence sidecar and manual learning moment

Outcome: a clinician can ask a general clinical-education question, inspect sources, and explicitly save a private non-accredited record.

- Launch a standalone general-education sidecar using approved evidence sources.
- Present concise answers, limitations, source dates, citations, and source links.
- Record engagement evidence without treating idle time as participation.
- Let the clinician create, edit, confirm, or discard a learning moment.
- Add **My learning record** under clinician profile/account access.
- Label all records as professional learning, not accredited credit.

Exit criteria:

- End-to-end happy path works without patient context.
- Citations resolve to the source version represented in the answer.
- Another clinician, manager, and tenant cannot access the private record.
- No screen or export implies accredited CME.

### Phase 2 — learning in the clinical workflow

Outcome: evidence review can start from the work without turning the chart into a course.

- Add **Explore evidence** to verified SOAP-note and Scribe review surfaces.
- Pass only authorized, minimum-necessary, typed context references.
- Preserve the clinician’s place in the encounter when opening and closing the sidecar.
- Prevent stale context when the clinician changes patients or encounters.
- Add result, diagnosis, and medication entry points only after their source and authorization boundaries are verified.
- Keep general-education mode as the default; separately gate any patient-context reasoning.

Exit criteria:

- Context entry points are useful, quiet, keyboard accessible, and safe on desktop/tablet layouts.
- The sidecar never writes a diagnosis, order, medication, note, or patient message.
- Patient identifiers never appear in a saved learning record or export.

### Phase 3 — portfolio, export, and self-report support

Outcome: clinicians can use their documented learning outside APPly without overstating its status.

- Add filters, source history, amendment history, voiding, and totals by date/topic.
- Generate deidentified PDF and CSV records with provenance and clinician attestation.
- Add a submission log for an external board, employer, or professional organization.
- Require the clinician to identify the destination and status source.
- Display “self-reported” until an authoritative integration or reviewed receipt proves otherwise.

Exit criteria:

- Export contents match the selected record set and reconcile to visible totals.
- Privacy review finds no patient identifiers or protected encounter text.
- Accepted/rejected status cannot be created without recording who supplied that outcome.

### Phase 4 — jurisdiction and organization guidance

Outcome: APPly can explain how to use a learning record without pretending rules are universal.

- Add versioned guidance profiles for selected boards, employers, and organizations.
- Show source, effective date, last-reviewed date, and “verify before submitting” language.
- Map an APPly record to external fields without promising eligibility or acceptance.
- Notify clinicians when a saved profile materially changes, without silently rewriting history.

Exit criteria:

- Every rule shown has an authoritative source and review date.
- Unsupported jurisdictions fall back to a neutral export, not guessed advice.
- Historic exports retain the profile version used when they were created.

### Phase 5 — prospective accredited activity pilot

Outcome: an accredited organization can define and govern one eligible learning activity, and only that organization can issue credit.

- Establish an agreement with an accredited provider or joint provider.
- Prospectively approve activity design, target audience, sources, participation, assessment/reflection, faculty/AI oversight, disclosures, evaluation, credit calculation, records, and reporting.
- Version eligible dates and rules; do not make prior general learning moments eligible after the fact.
- Submit qualified activity evidence to the provider and ingest the provider’s decision.
- Show an accredited award only after an issued decision and retain revocation/correction support.

Exit criteria:

- Provider approval, activity version, designation language, award authority, and reporting responsibility are documented.
- A pilot proves issued, rejected, corrected, and revoked outcomes.
- APPly’s record reconciles to provider records and never awards credit locally.

## Dependencies

| Dependency | Why it matters | Required before |
|---|---|---|
| Host identity, tenant, site, role, session, and CSRF controls | Protects clinician and patient context. | Phase 1 |
| Global audit, retention, feature flag, and observability contracts | Makes sensitive access and failures traceable. | Phase 1 |
| Approved evidence-source and citation contract | Prevents unsupported AI summaries from becoming learning evidence. | Phase 1 |
| Clinical/privacy/legal review | Defines education versus decision support and permitted data flow. | Phase 1 and again before patient-context mode |
| Verified SOAP note and Scribe integration contracts | Supplies safe in-workflow entry points. | Phase 2 |
| External rule sources and review ownership | Prevents stale self-report guidance. | Phase 4 |
| Accredited-provider agreement | Creates lawful authority to designate and issue accredited credit. | Phase 5 |

Staff Messaging may later provide a private reminder that the clinician has unfinished learning moments, but it is not an MVP dependency and must not reveal questions or reflections. Patient Portal, Reminders, Billing, and Workforce have no direct MVP dependency and must not expose clinician learning data.

## Measures of value

Use these as product-learning measures, not employee scorecards:

- percentage of evidence sessions clinicians rate useful;
- percentage of answers where at least one cited source is opened;
- median time to a useful answer and return to the encounter;
- percentage of suggested learning moments clinicians confirm versus discard;
- percentage of confirmed moments with a meaningful reflection;
- export completion and correction rates;
- stale, broken, retracted, or mismatched citation rate;
- privacy events, cross-tenant denials, and patient-identifier leakage rate;
- rate of unsupported-credit language found in audits; and
- clinician trust and cognitive-load feedback during pilot.

Do not optimize for time spent in the sidecar, number of questions, or number of saved moments. Those metrics can reward distraction or surveillance rather than useful learning.

## Recommended first release and effort posture

The recommended first release is **general evidence review + explicit non-accredited learning moments + a private record + CSV export**. It should use selected topics rather than patient-specific reasoning. That is useful on its own, tests clinician demand, and avoids making accreditation or protected-context AI a launch dependency.

Directional planning bands for a small focused product team—not a vendor quote or commitment:

| Work | Relative effort | Main cost/risk drivers |
|---|---|---|
| Phase 0 policy and partner discovery | Medium | Clinical, privacy, legal, source-policy, and accredited-organization review; usually more calendar coordination than software. |
| Phase 1 general evidence and private record | High | New evidence-source/provider integration, citation quality, clinical evaluation, protected storage, and end-to-end product work. |
| Phase 2 contextual clinical entry points | Medium to high | Wrong-patient/stale-context controls, deidentification, workflow polish, and a separate safety decision if patient context is used. |
| Phase 3 portfolio and CSV export | Medium | Record correction/history, exact totals, privacy review, and immutable artifact generation. PDF adds a new verified rendering path. |
| Phase 4 external guidance | Medium and ongoing | Jurisdiction research, source/version ownership, periodic review, and change notification. |
| Phase 5 accredited pilot | High and externally variable | Provider agreement, activity design, AI oversight, disclosures, evaluation, reporting, monitoring, certificates, and provider fees/process. |

The largest recurring software costs are likely evidence-content licensing or APIs, AI usage, clinical quality review, source monitoring, and support/incident operations. The largest uncertainty is the accredited-provider relationship, not the learning-record database or screens. APPly should validate clinician usefulness before paying the organizational cost of accreditation.

## Non-goals

- A course marketplace, learning-management system, quiz center, or primary navigation tab.
- Automatic CME awards, certificates, or Category 1 claims in the non-accredited release.
- Automated diagnosis, treatment selection, ordering, prescribing, or official-record writes.
- Replacing source reading, clinical judgment, or local policies.
- Exposing private learning content to managers by default.
- Giving universal board or jurisdiction advice from an unversioned rules list.
- Retroactively converting old professional-learning entries into accredited credit.

## Completion definition

The roadmap is complete only when:

- the build plan has been implemented through the intended release phase;
- the audit plan has current evidence for every applicable gate;
- privacy, clinical-safety, tenant-isolation, accessibility, and failure-recovery findings meet release thresholds;
- product language matches the authority APPly actually has;
- the release can be disabled or rolled back without corrupting a learning record; and
- any accredited-credit display is backed by a prospective accredited activity and provider-issued decision.

## Current research basis

These are planning inputs and must be revalidated during implementation and before any accredited pilot:

- [AMA: what to know about the other kind of CME credit](https://www.ama-assn.org/education/ama-pra-credit-system/what-know-about-other-kind-cme-credit)
- [AMA PRA Credit System requirements](https://www.ama-assn.org/education/ama-pra-credit-system/ama-pra-credit-system-requirements)
- [ACCME: joint providership](https://accme.org/rule/joint-providership/)
- [ACCME: urgent alert on the use of AI in accredited education](https://accme.org/news/urgent-alert-on-the-use-of-ai-in-accredited-ce/)
- [Heidi Evidence product guide](https://support.heidihealth.com/en/articles/13191359-get-started-with-heidi-evidence)

The Heidi reference demonstrates an evidence experience pattern; it is not evidence that APPly, Heidi, or an AI interaction is itself accredited CME.
