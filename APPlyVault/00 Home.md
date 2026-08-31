---
type: dashboard
status: active
updated: 2026-08-30
---
# APPly — Home

Our shared workspace for a done-for-you clinic-launch consultancy serving **NPs and PAs in Sherman and North Texas**, focused on cash-pay primary-care / concierge-adjacent clinics. The consultancy is formed; the EHR and inventory-management entity is not yet formed and will have different ownership. **APPly remains a working name until the consultancy's legal/brand name is confirmed.**

## Current position

- **Offer:** execute the clinic launch with minimal provider input, through first-patient readiness, including the packet and starter SharePoint EHR; ongoing support is part of the model. Exact deliverables, exceptions, fees, and support terms remain to define.
- **Leadership:** consultancy ownership is Kevin 51% / founder 49%. Founder reports documented direction-setting authority and raises a “veto concern”; whose veto and its scope remain to clarify. Governing documents have not yet been reviewed here.
- **Team / physician services:** Kevin supplies physician support/arrangements and mentorship. The senior-developer friend will be a consultancy employee and a software-company owner; equity amount and employment/IP terms are TBD.
- **Additional service concept:** Kevin wants a video knowledge bank with mentorship. [[Knowledge Bank and Mentorship]] tracks this separately from physician coverage; the selling entity, packaging, audience, and pricing remain open.
- **Reference clinic:** Kevin Stacks, MD, PLLC, general adult medicine in Sherman, verified on the public website. The founder reports the MD has recently gone through cash-pay PLLC setup and documented the legal steps taken so far.
- **Starting assets:** Kevin's attorney helped with his setup process. Existing diligence and workflow materials are expected on 2026-08-31 morning; contents and review scope have not yet been examined here.
- **Commercial structure:** consultancy launch package with ongoing support; support and package-cost details explicitly TBD. Software implementation fee plus recurring fees calculated as a percentage of ordered inventory value; rate, eligible value, billing trigger, and terms remain open. This is not a selected percentage of patient-care revenue.
- **Product direction:** SharePoint initially; eventual custom EHR/inventory backend. D-027 selects EC2 for the current app/database hosting task; a private synthetic staging package is prepared, not provisioned. Future clinical architecture and S3 use remain open.
- **Pharmacy scope:** D-028 sets broad configurability: clinics should be able to choose and combine pharmacy setups. [[Pharmacy Inventory Data Requirements]] covers the shared inventory foundation and proposed capability extensions; individual clinic activation and real-data release still need their own evidence.
- **Demand:** substantial local demand is founder-reported; founder is currently unsure how many first applicants are available. No pipeline count or paid commitment is assumed.
- **Timing:** no deadline pressure was expressed. Budget and actual team capacity are still unknown; no 90-day deadline is imposed.
- **Near-term objective:** build both experiences in one Rails app: [[Website MVP]] / [[Client Portal]] for selling, Contact, paperwork and training; [[Clinic Workspace]] for synthetic clinic operations. Separate layouts/navigation and clinic permissions, not a separate-domain requirement. No real patient data or released EHR; hosting and actual packet/content remain pending. Business-decision interviews stay deferred.

## Start here

1. Start with [[Roadmap and Tasks#Development plan — proposed 2026-08-30]] for the milestone sequence and exit criteria; [[Website MVP]] and [[Client Portal]] record the implementation. [[Company Foundation]] records context; [[Foundation Questions]] remains deferred, not a prerequisite for website work.
2. Use [[MD Pilot]] and [[Texas Diligence]] to turn the existing materials into the [[Clinic Launch Packet]].
3. Use [[Roadmap and Tasks]] for commitments, [[Decisions]] for agreed choices, and [[Progress Log]] for what changed.

## Workspace map

| Area | Notes |
| --- | --- |
| Strategy | [[Company Foundation]], [[Customer and Offer]], [[Business Model]], [[Entity and Product Boundary]], [[Foundation Questions]] |
| Delivery | [[Clinic Launch Packet]], [[Knowledge Bank and Mentorship]] |
| Learning | [[MD Pilot]], [[Customer Discovery]], [[Texas Diligence]], [[SharePoint and EMR]], [[Source Register]] |
| Execution | [[Website MVP]], [[Client Portal]], [[Clinic Workspace]], [[Data Modeling]], [[Roadmap and Tasks]], [[Decisions]], [[Risks and Assumptions]], [[Working Agreement]], [[Progress Log]] |
| Reusable notes | [[Evidence Note Template]], [[Weekly Review Template]] |

## Next three moves

- Establish the reproducible local baseline and browser acceptance in M0/T-22, preserving the guarded local demo and fixing the observed test-setup/CI gaps.
- Finish M1/T-20 EC2 staging after acceptance of the proposed `us-east-1` / roughly $25 monthly baseline; the founder authorized root until further notice and an unexecuted change set is ready. Verify the actual host and recovery before changing hosted access.
- When authorized materials arrive, index and review them for M3/T-12/T-24; real applicant documents and signing remain gated by M4. Keep clinic operations front-facing and permission-separated; real clinical release remains gated.

Task status lives in [[Roadmap and Tasks]]; this page is a summary, not a second task list.

## Reading the notes

**Reported** = supplied by the founder or collaborator, not independently verified. **Sourced background** = a limited statement supported by a dated source, not case-specific approval. **Hypothesis / proposed** = something to test or approve. **Decided** = explicitly agreed and recorded in [[Decisions]]. Unknown means unknown, not zero or not applicable.

This is a business-planning vault, **not a patient-record system**. Do not put patient information, credentials, or unreviewed patient screenshots here. Use synthetic examples. The planning documents are not legal advice or a compliance certification.
