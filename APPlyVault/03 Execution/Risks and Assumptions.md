---
type: risk-register
status: active
updated: 2026-08-31
---
# Risks and Assumptions

Home: [[00 Home]] · Action: [[Roadmap and Tasks]] · Review: [[Texas Diligence]]

Impact ratings are initial judgments, not quantified probabilities. All entries are open, with owners unassigned. A risk is not closed merely because a plan exists.

## Risks

| ID   | Impact | Risk                                                                                                                   | Mitigation / next evidence                                                                                         | Linked work                           |
| ---- | ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| R-01 | High   | Generalizing one MD launch to both NP and PA clients or different localities produces incorrect guidance               | Maintain distinct NP/PA and locality variants; tag applicability; review existing attorney-assisted materials      | T-03, T-05, T-07                      |
| R-02 | High   | The company promises legal, clinical, or compliance outcomes beyond its authority/capacity                             | Explicit service boundaries, expert handoffs, contract and claims review                                           | L-01 through L-06; T-08               |
| R-03 | High   | SharePoint compliance or clinical suitability is assumed without implementation evidence                               | Synthetic walkthrough, data-flow and control review, qualified reviewers; no patient data in this vault            | T-06, T-09; L-05                      |
| R-04 | High   | Reported local demand does not convert at a sustainable package price                                                  | Capture existing leads, specific needs, offers, and actual paid scope evidence                                     | T-07, T-08                            |
| R-05 | High   | Unbounded launch work or software support makes either entity uneconomic                                               | Measure labor/rework/costs by entity; define scope, support, and any intercompany charges                          | [[Business Model]]; G3                |
| R-06 | High   | MD materials or implementation cannot be commercialized, or the partnership loses availability                         | Clarify role, capacity, ownership, reuse rights, and continuity before depending on assets                         | T-04                                  |
| R-07 | Medium | Law, vendor behavior, or local requirements change and the playbook becomes stale                                      | Source dates, named maintenance owner, pre-client recheck, change triggers                                         | [[Source Register]]; T-05             |
| R-08 | Medium | Tasks, decisions, and chat diverge; work is duplicated or silently stalls                                              | Canonical task/decision notes, accepted owners, concise progress entries, agreed reviews                           | T-11; [[Working Agreement]]           |
| R-09 | High   | Customers face gaps between consultancy and software entities, or costs/data responsibilities are silently shared      | Explicit contracts, IP, billing, support, data roles, handoff, and exit responsibilities                           | [[Entity and Product Boundary]]; T-09 |
| R-10 | Medium | Existing MD documents are repackaged without applicability checks or duplicated before review                          | Index first when materials arrive; preserve originals, permission, review status, and profession/locality variants | [[Clinic Launch Packet]]; T-12        |
| R-11 | High   | Kevin's physician/mentorship workload, availability, or backup limits delivery capacity                                | Define service cadence, capacity, agreements, fees, coverage, and escalation for both professions                  | T-15; L-02 / L-04                     |
| R-12 | High   | Undefined inventory-value billing mechanics or unreviewed drug/referral relationships produce unsuitable metering, unclear bills, or legal exposure | Preserve the selected basis; define mechanics and review patient charges separately from software fees, supplier incentives and procurement roles using pharmacy PQ-21–PQ-30 | T-14 / T-36; L-04; [[Business Model]] |

**R-13 — High / open:** broad pharmacy configurability is mistaken for universal implemented coverage, every clinic's authority, or a requirement to collect every field. Mitigation: a shared inventory core, explicit capability dependencies, versioned per-clinic/location profiles, separate action permissions and scoped acceptance evidence; unsupported combinations stay disabled. Track implementation under T-13/T-34 and real-use applicability under L-02/L-05/L-06. Owner remains unassigned.

**R-14 — High / open:** an internal medication room, prescriptive authority or “small/cash-pay/our patients only” description is mistaken for authority to dispense or sell drugs, leaving professional coverage, product safety and records inadequate. Mitigation: document the exact activity/site/operator/formulary; obtain scoped classification, supply/charging and staffing findings; validate storage, tracing, controlled/compounding and incident procedures before affected use. Use [[Pharmacy Provider and Counsel Questions]] under T-36 and L-02/L-04/L-05/L-06. No clinic exception or operating pathway has been approved; owner remains unassigned.

**R-15 — High / open:** a named production container or green staging release is mistaken for security, clinical or operational readiness. The 2026-08-31 staging record reports API four critical/fourteen high and web seven high findings; this planning review did not rescan them. The production-promotion gate rejects that pair. Staging PostgreSQL cutover/SQL restore are verified; production remains SQLite. Resolve image advisories, appropriate TLS/audience controls, account/MFA and operations acceptance under [[Roadmap and Tasks#Step 1 — Engineering and release foundation]]. A same-host SQL restore is not independent operator, key-loss or snapshot recovery, and a single host is not high availability. T-20/T-22/T-25 remain open; owner unassigned.

**R-16 — High / open:** a PostgreSQL code migration is deployed onto a SQLite host without preserving data, keys or recovery evidence, or a shared database is mistaken for complete tenant security. Mitigation: the explicit synthetic-only conversion/restore checks and maintenance procedure in [[PostgreSQL and Inventory Foundation]], runtime/owner separation and the still-open trusted identity/RLS/read-audit review. T-38 owns cutover; T-13/T-34 and L-05/E2/E3 retain broader gates.

**R-17 — High / open:** provisioning/recovery or operator privileges admit the wrong person, revive a disabled account or leave old authority usable. This is a planning failure hypothesis, not a newly observed exploit. Mitigation/evidence: T-23.1–T-23.4 recipient-bound activation, identity-checked recovery, deactivation races, session/MFA revocation, denied self-grants and protected lifecycle history. Signals include duplicate/partial provisioning and inconsistent account/session states; recover through the approved operator path, not shared passwords or manual privilege bypass. See [[Roadmap and Tasks#Step 2 — Client onboarding and operator workflow]]. Owner unassigned.

**R-18 — High / open:** new content silently alters issued evidence, stale progress appears current, or a paperwork checkbox is treated as completed external work. Mitigation/evidence: T-24.1–T-24.6 version-bound assignment/progress, explicit re-review, evidence-backed transitions and two-client export/restore tests. Detect mismatched version references, missing completion evidence and unowned dependencies; preserve the prior version and stop only the affected release/transition. Source applicability remains R-01/R-10, not a second source-review task. See [[Roadmap and Tasks#Step 3 — Synthetic packet and training infrastructure]]. Owner unassigned.

**R-19 — High / open:** clinic screens appear usable while wrong-patient selection, lost edits, stale intake or an unaccepted handoff cause unsafe or falsely completed work. Mitigation/evidence: T-13.1–T-13.4 observed synthetic workflow, identity/visit binding, authorship/version rules, explicit ownership and interrupted-session/conflict prototypes. Signals include missing owner, mismatched identity/version and unacknowledged save; pause the affected transition and use the reviewed fallback rather than inventing clinical behavior. Theme completion is not workflow validation. See [[Roadmap and Tasks#Step 5 — Define the first clinic workflow]]. Owner unassigned.

## Assumptions to test

| ID | Hypothesis | Current evidence | What would challenge it? |
| --- | --- | --- | --- |
| A-01 | NPs/PAs will buy the done-for-you launch package and support at a viable price | Local demand reported; founder unsure about first-applicant count; no commitments documented | Prospects want a different scope or will not buy at a sustainable price |
| A-02 | Useful parts of the MD's experience transfer to a selected APP segment | Cofounder's completed-to-date setup documentation is reported to exist; not yet reviewed | Profession/locality differences dominate the proposed packet |
| A-03 | The SharePoint method offers practical benefits worth packaging | Founder report only | Material clinical gaps, high maintenance burden, poor portability, or no customer preference |
| A-04 | Launch delivery and its packet can be repeatable enough for sustainable consulting | Existing MD process and planned packet; no customer delivery economics yet | Most work remains bespoke or requires unpriced expert/support effort |
| A-05 | The separate EHR/inventory product will support sustainable recurring revenue | Implementation + percentage of ordered inventory value confirmed; rate/mechanics, retention, and costs unknown | Buyers prefer existing products, support costs dominate, or the metric does not align with value |
| A-06 | Consultancy setup can avoid routine patient-data access while software is operated separately | Earlier administrative-only starting hypothesis narrowed by confirmed starter EHR inclusion | Provisioning/support requires access; roles, scope, and agreements must be reviewed |
| A-07 | Clinics value the option to choose and combine pharmacy setups | Founder-selected product planning assumption in D-028; no new customer evidence | Actual adoption, workflow research or delivery/support cost favors different capability priorities; do not confuse broad optionality with every clinic needing every module |

## Review protocol

At a team review, name the top three risks, new evidence, changed impact, and one next action each. Record closures with evidence, reviewer, date, and residual risk. Record disproved assumptions as learning; do not silently delete them.

Use [[Working Agreement#Failure-first planning and review]] to turn a risk into a concrete trigger → harm → detection → guard/test → recovery/stop decision. Consider unavailable people, uncertain demand, underestimated labor and unauthorized reuse as well as software faults (R-04/R-05/R-06/R-11). A hypothetical failure is not an incident; a passed mock is not hosted evidence. Route the next action into an existing parent/chunk in [[Roadmap and Tasks#Five-step implementation plan]] and record actual results through [[Evidence Note Template]].
