---
type: source-register
status: preliminary
updated: 2026-08-30
---
# Source Register

Home: [[00 Home]] · Used in: [[Texas Diligence]], [[SharePoint and EMR]], [[Data Modeling]]

## How to use this register

These are primary-source starting references, not a completed legal or security review. “Accessed” means the page was reviewed on that date, not that every statement is current controlling law. Recheck applicability and effective dates before relying on a source for a client. Resolve conflicting or outdated guidance with current authority and a qualified reviewer.

| ID | Source | Accessed | Limited relevance / limitation |
| --- | --- | --- | --- |
| S-01 | [Texas SOS — Formation of Texas Entities FAQs](https://www.sos.texas.gov/corp/formationfaqs.shtml) | 2026-08-30 | Professional-entity formation, ownership, and governance background; not approval of a clinic's structure |
| S-02 | [Texas Medical Board — Prescribing and Supervision](https://www.tmb.texas.gov/apply-renew/physician/prescribing-and-supervision) | 2026-08-30 | Delegation and prescribing framework; requires practice-specific application and current-law review |
| S-03 | [Texas Medical Board — Physician Assistant License Application](https://www.tmb.texas.gov/index.php/apply-renew/physician-assistant/physician-assistant-license-application) | 2026-08-30 | PA licensing/supervision context; not a clinic-ownership guide |
| S-04 | [HHS — Cloud services and ePHI](https://www.hhs.gov/hipaa/for-professionals/faq/2075/may-a-hipaa-covered-entity-or-business-associate-use-cloud-service-to-store-or-process-ephi/index.html) | 2026-08-30 | Cloud agreements and risk-management context; does not assess the MD implementation |
| S-05 | [Microsoft — HIPAA and HITECH offering](https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech) | 2026-08-30 | In-scope services and shared compliance responsibilities; actual deployment and terms remain unreviewed |
| S-06 | [Texas Attorney General — Patient Privacy](https://www.texasattorneygeneral.gov/consumer-protection/health-care/patient-privacy) | 2026-08-30 | Texas and federal patient-privacy context; not a full state-law analysis |
| S-07 | [Texas Medical Board — Additional Practice Topics for Physicians](https://www.tmb.texas.gov/apply-renew/physician/additional-practice-topics-for-physicians) | 2026-08-30 | Physician records/closure and other practice topics for later review; not an APP-wide rulebook |
| S-08 | [Kevin Stacks, MD, PLLC — homepage](https://stacksadultmedicine.com/) and [provider](https://stacksadultmedicine.com/provider) | 2026-08-30 | Read rendered pages using the browser skill after the web reader failed. Supports public practice/provider identity, general adult medicine, and Sherman location only; not legal clearance, operating status, cash-pay terms, or compliance evidence |
| S-09 | [HHS — Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html) | 2026-08-30 | Safeguards, risk analysis, audit controls, addressable specifications, and required documentation retention; not a schema certification or universal medical-record retention rule |
| S-10 | [HHS — HIPAA and cloud computing](https://www.hhs.gov/hipaa/for-professionals/special-topics/health-information-technology/cloud-computing/index.html) | 2026-08-30 | Agreements, risk review, and encrypted/no-view cloud-service responsibilities; no actual vendor or configuration approved |
| S-11 | [HHS — Minimum necessary requirement](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html) | 2026-08-30 | Purpose/role limits and exceptions, including provider treatment disclosures/requests; not authorization for unrestricted internal access |
| S-12 | [HHS — Medical-record retention FAQ](https://www.hhs.gov/hipaa/for-professionals/faq/580/does-hipaa-require-covered-entities-to-keep-medical-records-for-any-period/index.html) | 2026-08-30 | Privacy Rule does not set a general medical-record retention period; applicable state/professional rules still need review |
| S-13 | [PostgreSQL 18 — Row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html) | 2026-08-30 | RLS behavior, owner/superuser bypass, constraints, and operational limitations; no proof of the proposed model's implementation |
| S-14 | [PostgreSQL 18 — CREATE POLICY](https://www.postgresql.org/docs/18/sql-createpolicy.html) | 2026-08-30 | USING/WITH CHECK, restrictive/permissive policies, and command behavior; policy helper implementation remains open |
| S-15 | [PostgreSQL 18 — CREATE FUNCTION](https://www.postgresql.org/docs/18/sql-createfunction.html) | 2026-08-30 | Definer-function privileges, safe search path, and execution grants; no verifier/API security review performed |
| S-16 | [PostgreSQL 18 — Constraints](https://www.postgresql.org/docs/18/ddl-constraints.html) | 2026-08-30 | Composite keys/foreign keys and CHECK limitations; illustrative DDL has not been executed |
| S-17 | [PostgreSQL 18 — CREATE TRIGGER](https://www.postgresql.org/docs/18/sql-createtrigger.html) | 2026-08-30 | Trigger events and limits; ordinary row triggers do not audit SELECT access |
| S-18 | [pgAudit — Official project documentation](https://github.com/pgaudit/pgaudit) | 2026-08-30 | Statement/object audit, version-specific compatibility, logging options, and superuser caveat; extension/host support and configuration untested |
| S-19 | [PostgreSQL 18 — Error reporting and logging](https://www.postgresql.org/docs/18/runtime-config-logging.html) | 2026-08-30 | Statement/error/parameter logging exposure; actual logging data paths still need validation |
| S-20 | [PostgreSQL 18 — Encryption options](https://www.postgresql.org/docs/18/encryption-options.html) | 2026-08-30 | Storage/transport/client-side encryption distinctions; proposed application envelopes and key lifecycle are not implemented |
| S-21 | [PostgreSQL 18 — CREATE VIEW](https://www.postgresql.org/docs/18/sql-createview.html) | 2026-08-30 | Invoker versus owner privileges and RLS behavior; no views or reports deployed |
| S-22 | [HHS — Security Rule rulemaking](https://www.hhs.gov/hipaa/for-professionals/security/hipaa-security-rule-nprm/index.html) | 2026-08-30 | Reviewed page describes proposed changes and current-rule continuity; recheck controlling law/effective dates before reliance |
| S-23 | [GitHub — Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) | 2026-08-30 | Workflow YAML belongs in the repository's `.github/workflows` directory. Supports the local finding that `site/backend/.github/workflows/ci.yml` is not a site-root GitHub workflow; no remote CI configuration or run was inspected |

S-06 was also rechecked for [[Data Modeling]] on 2026-08-30. The new note contains assistant-proposed design choices informed by these sources, not source-mandated table names, approved professional findings, or a vendor selection.

## Discovery references not fully reviewed

- [Texas Board of Nursing — APRN scope of practice](https://www.bon.texas.gov/practice_scope_of_practice_aprn.asp.html): discovered in search; direct page retrieval failed on 2026-08-30. Full review remains open. Do not mark BON scope review complete on that basis.
- Current Texas statutes and administrative rules for the selected entity/practice model: exact relevant provisions and effective dates to be resolved with counsel.
- City/county zoning, occupancy, fire/building, and other applicable local sources: reference clinic is in Sherman; exact jurisdiction and client-service geography still to confirm. No permitting source has been reviewed.
- Service-specific agencies, payer requirements, and vendor terms: select after clinic profile is known.

## Private and first-hand evidence

- U-01: founder's initial brief, 2026-08-30; summarized in [[Company Foundation]]. Reported context, not independent validation.
- U-02: founder's first answers, 2026-08-30: cash-pay primary-care / concierge-adjacent focus; MD cofounder and two engineers; documented MD setup process to become applicant packet; consulting through first-patient readiness including starter EHR; substantial local demand reported.
- U-03: founder's additional answers, 2026-08-30: eventual custom SharePoint replacement, architecture undecided; separate EHR/inventory entity; no deadline pressure; existing materials inaccessible until tomorrow morning.
- U-04: founder's seven numbered answers, 2026-08-30: both NPs/PAs and Sherman/North Texas; full execution with minimal provider input; Kevin provides physician services/arrangements and mentorship; Kevin's attorney helped his setup; consultancy launch package with ongoing support; software implementation fee and transactional-value recurring fees; consultancy formed/software not formed/different owners; founder reports 49% consultancy interest and sole direction-setting responsibility; senior-developer friend being brought on; first-applicant count unsure. This records founder-supplied business facts and direction, not independent review of governing documents or pricing legality.
- U-05: founder's six numbered answers, 2026-08-30: software recurring fee based on percentage of ordered inventory value; support/cost details TBD; Kevin owns 51%, documented founder direction-setting with an unspecified veto concern; senior developer is consultancy employee and software owner, amounts TBD; Kevin's capacity TBD and video knowledge bank with mentorship proposed.
- U-06: founder's subsequent redirect, 2026-08-30: bootstrap the website now; remaining questions are business decisions, not prerequisites to general setup. Recorded in D-020 and [[Website MVP]].
- U-07: founder's backend documentation request, 2026-08-30: write [[Data Modeling]] with PostgreSQL tables for multiple clinics and proposed access control/auditing supporting HIPAA safeguards. Authorizes this design note, not a patient-system build, compliance certification, or deployment.
- U-08: founder's website revision, 2026-08-30: remove the entire clinic brief, add a Ruby on Rails backend with login for future material, and add a Contact page.
- U-09: founder's portal clarification, 2026-08-30: APPly provisions and sends logins after payment; no public signup. Login leads to paperwork with progress and signing, plus written/video onboarding and training. Generic operations examples are acceptable for now. PDF generation/submission and feedback are later; no EHR belongs in this portal. SharePoint mapping and a separately sold integrated EHR/inventory product remain distinct.
- U-10: founder's current request, 2026-08-30: review the vault and code, clarify if needed, and generate a milestone-oriented development plan with clear exit criteria. Delivered in [[Roadmap and Tasks#Development plan — proposed 2026-08-30]]. Authorizes review/planning, not acceptance of every proposed milestone or a new deployment/client-data workflow.
- MD diligence materials, clinic timeline, SharePoint review artifacts, customer interviews, and professional findings: not yet received; access to existing materials expected on 2026-08-31 morning. Do not equate missing access with nonexistent work.

For new evidence, create an [[Evidence Note Template|evidence note]] with source, date, applicability, specific claim, limitations, and any qualified review. Do not paste patient information or privileged advice here; reference approved controlled records when needed.
