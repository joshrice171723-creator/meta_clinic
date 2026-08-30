---
type: product-discovery
status: unreviewed-workflow
updated: 2026-08-30
---
# SharePoint and EMR

Home: [[00 Home]] · Pilot: [[MD Pilot]] · Related issues: [[Texas Diligence]]

## Current claim and evidence

**Reported by founder:** the MD cofounder has created a simple, HIPAA-compliant method for managing patients with SharePoint files. It is intended as the starter EHR included in the consultancy's clinic-launch offering.

**Confirmed product direction:** eventually replace SharePoint with a bespoke backend. The EHR and inventory-management offering will be in a separate entity. EC2/S3 were mentioned as possibilities; the architecture and migration timing remain explicitly open. See [[Entity and Product Boundary]].

**Not yet reviewed:** deployment type (including whether SharePoint Online), tenant ownership, licenses, agreements, configuration, data flows, security review, staff procedures, actual usage, workflow completeness, and reuse rights. Do not convert the reported claim into a customer-facing assurance.

Microsoft lists SharePoint Online among in-scope services for its HIPAA offering, but explicitly says a BAA or use of its services does not by itself make an organization compliant. Confirm the actual deployment and agreements rather than assuming coverage. [Microsoft HIPAA/HITECH guidance](https://learn.microsoft.com/en-us/compliance/regulatory/offering-hipaa-hitech).

HHS permits cloud handling of ePHI under applicable agreements and HIPAA obligations, including risk analysis and risk management. Our review must cover the whole operating workflow, not just file storage. [HHS cloud guidance](https://www.hhs.gov/hipaa/for-professionals/faq/2075/may-a-hipaa-covered-entity-or-business-associate-use-cloud-service-to-store-or-process-ephi/index.html).

## Discovery packet to request — no patient data

- A synthetic demonstration from intake through follow-up, record correction, and export.
- Architecture/data-flow diagram: every system, user, device, integration, and support access path.
- Deployment and licensing inventory; who owns/administers the tenant and pays the vendors.
- Non-sensitive summary of applicable agreements, risk assessment, control testing, policies, training, and responsible reviewers.
- Current limitations, incidents or near misses described without patient details, and time spent maintaining the workflow.
- Authorship, ownership, and permission to reuse configuration, templates, and procedures.

## Review questions, not a compliance checklist

| Area | Evidence or demonstration to obtain |
| --- | --- |
| Responsibility and agreements | Clinic/vendor/company roles, covered services, agreements, subprocessors, and support obligations |
| Identity and permissions | Individual accounts, authentication, least privilege, sharing boundaries, admin access, joiner/leaver procedures |
| Data movement | Downloads, synced endpoints, email, links, mobile devices, backups, logs, automations, integrations, and any AI tools |
| Traceability and integrity | Access/change records, chart authorship, corrections, signatures where applicable, audit retention, review procedures |
| Availability and recovery | Restore test, downtime workflow, incident escalation, ownership of recovery tasks |
| Patient and record lifecycle | Access requests, release, amendments, retention, legal holds where applicable, export, and offboarding |
| Clinical suitability | Qualified clinician review of missing functions, handoffs, failure modes, and service-specific documentation needs |
| Operating cost | Setup labor, licenses, maintenance, training, support, and migration cost |

All areas are unreviewed. Passing this table alone would not establish compliance or clinical fitness; the appropriate reviewers define the full applicable requirements.

## Function map to build with the MD

Record **supported / external system / manual workaround / gap / not applicable**, plus evidence and accountable person, for: intake/consent; scheduling; encounters; medications/allergies; orders/results; prescribing; patient communication; billing; reporting; record requests; and continuity/export. Do not presume all functions exist or all are required for every clinic.

## Keep delivery and product responsibilities separate

| Product area | Candidate scope | Patient-data implications |
| --- | --- | --- |
| Consultancy launch packet/workspace | Milestones, applicant inputs, resources, expert handoffs, business documents | Keep patient data out; applicant business data still needs appropriate handling |
| Initial SharePoint EHR setup | Starter EHR included in intended consulting delivery | Determine which entity configures/supports it and any patient-data access; implementation review remains open |
| Separate EHR / inventory product | Eventual custom EHR backend and inventory-management offering | Separate product, contracts, operations, privacy/security, and clinical review; feature scope remains open |

The founder has selected an eventual custom replacement as the direction; do not continue representing build versus never-build as unanswered. Scope, architecture, rollout, and integration choices remain open, and can be revisited explicitly if evidence warrants. The launch consultancy does not need to wait for that replacement if the initial SharePoint delivery is appropriately reviewed and operationally ready.

## Future product discovery — no architecture commitment

- Define the clinical and inventory workflows before choosing infrastructure. Inventory might mean supplies, stock counts, purchasing, lots/expiry, equipment, or medication inventory; none of these details is yet selected.
- Document who owns the current setup and future code, licenses the software, contracts with the clinic, pays cloud vendors, and provides support.
- Record required data structure, access rules, audit/history behavior, backup/restore, export, and migration acceptance criteria.
- Plan the transition from SharePoint: mapping, reconciliation, validation, cutover responsibilities, continuity, and an appropriate rollback/recovery approach. Do not migrate patient data during discovery.
- Evaluate EC2/S3 and other necessary components only after requirements and applicable vendor/security review. Mentioning a cloud service does not establish a complete backend or deployment approval.

No cloud account was accessed, infrastructure created, product implementation started, or patient system changed.

## Before our company handles real patient information

Resolve L-05; document roles and data flows; obtain applicable agreements and qualified review; verify controls and operations; establish incident/support/recovery ownership; and approve a narrowly scoped deployment. This planning rule does not purport to approve or assess the MD clinic's current operation.

For current discovery, use synthetic data only. Do not connect this vault or prototypes to patient files, and do not request patient-system credentials in chat.
