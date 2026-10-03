import type { GrowthPage } from "./growthPageContent";

type Family = "resource" | "solution" | "security" | "integration" | "comparison" | "proof" | "company" | "legal" | "conversion";
type Spec = { path: string; title: string; angle: string; family: Family };

// Page-specific editorial angles. This registry stays text-first until the planned visual pass.
const specs: readonly Spec[] = [
  // Resources, guides, and templates
  { path: "/resources", title: "Clinic resources", angle: "Map a clinic workflow, identify open decisions, and prepare a focused software evaluation.", family: "resource" },
  { path: "/resources/api-docs", title: "API documentation", angle: "Review documented operations, authentication expectations, and versioning before planning an integration.", family: "resource" },
  { path: "/resources/case-studies", title: "Case studies", angle: "Evaluate customer stories through verified context, permissioned evidence, and clearly scoped outcomes.", family: "proof" },
  { path: "/resources/checklists", title: "Clinic workflow checklists", angle: "Turn an operating question into a practical checklist your clinic team can review together.", family: "resource" },
  { path: "/resources/guides", title: "Clinic operations guides", angle: "Find a step-by-step starting point for the people, information, and handoffs behind common clinic workflows.", family: "resource" },
  { path: "/resources/guides/ai-in-healthcare-workflows", title: "AI in healthcare workflows", angle: "Assess where AI may prepare work, where human review applies, and what evidence is needed before adoption.", family: "resource" },
  { path: "/resources/guides/automate-patient-intake", title: "Automate patient intake", angle: "Map intake from invitation through staff review, missing information, and the visit handoff.", family: "resource" },
  { path: "/resources/guides/clinic-membership-model", title: "Clinic membership model", angle: "Plan membership terms, enrollment, included services, billing events, and the path when a member changes or leaves.", family: "resource" },
  { path: "/resources/guides/glp-1-clinic-workflow", title: "GLP-1 clinic workflow", angle: "Map operations around an individualized weight management program without prescribing a clinical protocol.", family: "resource" },
  { path: "/resources/guides/infusion-chair-scheduling", title: "Infusion chair scheduling", angle: "Coordinate appointment duration, chair availability, staff coverage, and changes to the daily plan.", family: "resource" },
  { path: "/resources/guides/infusion-inventory-management", title: "Infusion inventory management", angle: "Organize item, lot, expiration, receiving, and reconciliation work around infusion operations.", family: "resource" },
  { path: "/resources/guides/medical-inventory-lot-tracking", title: "Medical inventory lot tracking", angle: "Create a reviewable process for receiving, locating, moving, and reconciling lot-controlled stock.", family: "resource" },
  { path: "/resources/guides/start-a-cash-pay-clinic", title: "Start a cash-pay clinic", angle: "Outline the choices behind services, pricing communication, patient access, payment, and follow-up.", family: "resource" },
  { path: "/resources/guides/start-a-trt-clinic", title: "Start a TRT clinic", angle: "Plan administrative workflow for a testosterone clinic while leaving clinical protocols to qualified clinicians.", family: "resource" },
  { path: "/resources/guides/start-a-weight-loss-clinic", title: "Start a weight loss clinic", angle: "Plan service design, intake, scheduling, program administration, payment, and follow-through.", family: "resource" },
  { path: "/resources/guides/telehealth-workflow", title: "Telehealth workflow", angle: "Connect remote visit scheduling, preparation, encounter context, and follow-up after a call.", family: "resource" },
  { path: "/resources/guides/trt-patient-intake", title: "TRT patient intake", angle: "Structure administrative intake so relevant information reaches an authorized reviewer before the visit.", family: "resource" },
  { path: "/resources/guides/weight-loss-patient-intake", title: "Weight loss patient intake", angle: "Plan how a weight management clinic gathers, reviews, and carries intake context into a visit.", family: "resource" },
  { path: "/resources/help", title: "Help center", angle: "Find answers about product access, everyday workflows, and where to get help with an evaluation.", family: "resource" },
  { path: "/resources/templates", title: "Clinic workflow templates", angle: "Start from a reusable planning document, adapt it to local policy, and make ownership visible.", family: "resource" },
  { path: "/resources/templates/clinic-intake-form", title: "Clinic intake form template", angle: "Draft an administrative intake outline to identify required information and review ownership.", family: "resource" },
  { path: "/resources/templates/clinic-launch-checklist", title: "Clinic launch checklist", angle: "Track operating decisions, owners, dependencies, and readiness questions involved in opening a clinic.", family: "resource" },
  { path: "/resources/templates/infusion-treatment-schedule", title: "Infusion treatment schedule template", angle: "Plan a schedule around appointments, chairs, staff coverage, and details requiring confirmation.", family: "resource" },
  { path: "/resources/templates/medication-inventory-template", title: "Medication inventory template", angle: "Record item, lot, expiration, location, movement, and reconciliation fields for an approved stock process.", family: "resource" },
  { path: "/resources/templates/telehealth-consent", title: "Telehealth consent template", angle: "Prepare a review draft of consent topics required by qualified legal and clinical reviewers.", family: "resource" },
  { path: "/resources/templates/trt-intake-form", title: "TRT intake form template", angle: "Organize an administrative intake outline for qualified clinic review without implying a treatment protocol.", family: "resource" },
  { path: "/resources/templates/weight-loss-intake-form", title: "Weight loss intake form template", angle: "Organize intake topics for qualified review and separate patient responses from clinical decisions.", family: "resource" },
  { path: "/resources/videos", title: "Product videos", angle: "Use short walkthroughs to inspect a workflow, staff handoff, and questions for a demo.", family: "resource" },
  { path: "/resources/webinars", title: "Clinic operations webinars", angle: "Explore practical clinic operations discussions and bring relevant questions to your team.", family: "resource" },
  // Solutions
  { path: "/solutions", title: "Clinic operations solutions", angle: "Start with an operating problem, map the handoffs, and evaluate the matching workflow.", family: "solution" },
  { path: "/solutions/automate-follow-ups", title: "Coordinate patient follow-ups", angle: "Turn a visit outcome into an owned next step and show completed or still-open work.", family: "solution" },
  { path: "/solutions/automate-patient-intake", title: "Coordinate patient intake", angle: "Connect information collection, staff review, missing details, and visit preparation.", family: "solution" },
  { path: "/solutions/automate-scheduling", title: "Coordinate clinic scheduling", angle: "Match visit type, staff, resources, availability, and schedule changes to clinic rules.", family: "solution" },
  { path: "/solutions/cash-pay-clinics", title: "Software for cash-pay clinics", angle: "Connect service information, patient access, payments, and follow-up while keeping terms clear.", family: "solution" },
  { path: "/solutions/launch-a-clinic", title: "Plan a clinic launch", angle: "Map services, roles, access, visits, and follow-through into a practical operating plan.", family: "solution" },
  { path: "/solutions/manage-medication-inventory", title: "Manage medication inventory", angle: "Review recorded stock, lots, expirations, movements, and reconciliation work.", family: "solution" },
  { path: "/solutions/manage-memberships", title: "Manage clinic memberships", angle: "Keep terms, enrollment, payment events, service access, and membership changes visible.", family: "solution" },
  { path: "/solutions/multi-location-clinics", title: "Coordinate multi-location clinics", angle: "Review shared workflows while keeping location-specific work and permissions clear.", family: "solution" },
  { path: "/solutions/patient-self-service", title: "Improve patient self-service", angle: "Let patients complete appropriate tasks and show staff which requests need review.", family: "solution" },
  { path: "/solutions/reduce-front-desk-work", title: "Reduce disconnected front desk work", angle: "Connect booking, arrival, intake, payment, and handoff so staff can focus on exceptions.", family: "solution" },
  { path: "/solutions/replace-multiple-systems", title: "Evaluate a connected clinic platform", angle: "Inventory tools and handoffs before deciding what to consolidate or keep separate.", family: "solution" },
  { path: "/solutions/scale-a-clinic", title: "Scale clinic operations", angle: "Identify repeatable steps, exceptions, role ownership, and reporting needs before adding capacity.", family: "solution" },
  // Security and integrations
  { path: "/security", title: "Security and privacy review", angle: "Review data flows, access, safeguards, agreements, and evidence needed for your clinic.", family: "security" },
  { path: "/security/access-control", title: "Access control", angle: "Review identity, role assignment, permissions, access changes, and review responsibilities.", family: "security" },
  { path: "/security/ai-data-privacy", title: "AI data privacy", angle: "Ask what information an AI feature receives, processes, retains, and makes available for review.", family: "security" },
  { path: "/security/audit-logs", title: "Audit logs", angle: "Confirm recorded events, context, retention, and who can review them.", family: "security" },
  { path: "/security/backups", title: "Backups and recovery", angle: "Request current backup scope, restoration process, recovery objectives, and supporting evidence.", family: "security" },
  { path: "/security/business-associate-agreement", title: "Business associate agreement", angle: "Determine whether an agreement applies, is available for review, and matches the proposed service scope.", family: "security" },
  { path: "/security/data-protection", title: "Data protection", angle: "Map information, permitted use, storage, access, retention, deletion, and shared responsibilities.", family: "security" },
  { path: "/security/encryption", title: "Encryption", angle: "Request current documentation about encryption scope, transit, storage, key handling, and exceptions.", family: "security" },
  { path: "/security/hipaa", title: "HIPAA review", angle: "Review roles, data flows, safeguards, agreements, and deployment responsibilities.", family: "security" },
  { path: "/integrations", title: "Clinic integrations", angle: "Evaluate each connection by data flow, availability, vendor responsibilities, and failure path.", family: "integration" },
  { path: "/integrations/api", title: "API integration", angle: "Confirm API availability, operations, authentication, versioning, limits, and support expectations.", family: "integration" },
  { path: "/integrations/e-prescribing", title: "E-prescribing integration", angle: "Confirm availability, operators, clinical prerequisites, and account requirements for an e-prescribing connection.", family: "integration" },
  { path: "/integrations/email", title: "Email integration", angle: "Map message triggers, preference handling, delivery ownership, failures, and provider support.", family: "integration" },
  { path: "/integrations/labs", title: "Laboratory integrations", angle: "Confirm supported labs, result data, ordering workflow, matching, exceptions, and current status.", family: "integration" },
  { path: "/integrations/pharmacies", title: "Pharmacy integrations", angle: "Verify intended data exchange, pharmacy participation, account prerequisites, and responsibility.", family: "integration" },
  { path: "/integrations/sms", title: "SMS integration", angle: "Review message events, consent and opt-out behavior, delivery status, provider ownership, and availability.", family: "integration" },
  { path: "/integrations/stripe", title: "Stripe payments integration", angle: "Confirm supported payment flow, account ownership, reconciliation, fees, and connection state.", family: "integration" },
  { path: "/integrations/telehealth", title: "Telehealth integration", angle: "Map scheduling, joining, encounter context, and follow-up; confirm provider and connection status.", family: "integration" },
  // Comparisons and customer proof
  { path: "/compare", title: "Compare clinic software approaches", angle: "Compare workflow, ownership, implementation effort, and evidence against consistent criteria.", family: "comparison" },
  { path: "/compare/ehr-vs-meta-clinic", title: "EHR versus Meta Clinic", angle: "Compare a clinical record system’s role with the broader operating workflow a clinic coordinates.", family: "comparison" },
  { path: "/compare/practice-management-vs-meta-clinic", title: "Practice management versus Meta Clinic", angle: "Compare scheduling and administration with the full set of patient and operational handoffs in scope.", family: "comparison" },
  { path: "/alternatives", title: "Clinic software alternatives", angle: "Build a shortlist around clinic fit, workflow coverage, migration needs, and verifiable evidence.", family: "comparison" },
  { path: "/alternatives/[competitor-name]", title: "Compare clinic software options", angle: "Use a balanced, source-checked comparison of fit, capabilities, implementation, and open questions.", family: "comparison" },
  { path: "/customers", title: "Customer stories", angle: "Review customer evidence with clear context, permission, methods, and limits on what it establishes.", family: "proof" },
  { path: "/customers/[clinic-name]", title: "Clinic customer story", angle: "Present a customer experience only after details, attribution, outcomes, and permission are confirmed.", family: "proof" },
  { path: "/customers/case-studies", title: "Clinic case studies", angle: "Explain clinic context, workflow change, evidence source, and observed result in permissioned stories.", family: "proof" },
  { path: "/reviews", title: "Product reviews", angle: "Evaluate dated, attributable reviews with context about who shared them and what they describe.", family: "proof" },
  { path: "/testimonials", title: "Customer testimonials", angle: "Share permissioned customer perspectives with context and no unsupported result claims.", family: "proof" },
  // Company and partners
  { path: "/about", title: "About Meta Clinic", angle: "Explain what Meta Clinic is building, who the software is intended to serve, and how to evaluate it.", family: "company" },
  { path: "/company", title: "Meta Clinic company", angle: "Describe the product organization, its focus, and how clinics can start a business conversation.", family: "company" },
  { path: "/founder", title: "Founder perspective", angle: "Share product origins and direction with verified details and a clear distinction between plans and shipped work.", family: "company" },
  { path: "/careers", title: "Careers at Meta Clinic", angle: "Describe the work and collaboration involved; list roles only when openings are confirmed.", family: "company" },
  { path: "/partners", title: "Meta Clinic partners", angle: "Explain partner conversations and how current relationships are verified.", family: "company" },
  { path: "/partner-program", title: "Partner program", angle: "Set out partner fit, referral boundaries, and discussion steps without implying unconfirmed terms.", family: "company" },
  { path: "/affiliate-program", title: "Affiliate program", angle: "Explain eligibility, disclosures, tracking, and payment terms only after an active program is confirmed.", family: "company" },
  // Legal policies
  { path: "/legal", title: "Legal information", angle: "Find current terms, privacy information, and service agreements relevant to evaluation.", family: "legal" },
  { path: "/legal/acceptable-use", title: "Acceptable use", angle: "Review permitted use, user responsibilities, and reporting in the current approved policy.", family: "legal" },
  { path: "/legal/ai-disclosure", title: "AI disclosure", angle: "Explain AI features, prepared outputs, human review, and the current approved disclosure.", family: "legal" },
  { path: "/legal/baa", title: "Business associate agreement", angle: "Review the applicable agreement and service scope with qualified counsel.", family: "legal" },
  { path: "/legal/cookies", title: "Cookies and similar technologies", angle: "Explain technologies in use, their purposes, available controls, and reviewed policy.", family: "legal" },
  { path: "/legal/hipaa", title: "HIPAA information", angle: "Describe applicable roles and responsibilities against current service facts and qualified review.", family: "legal" },
  { path: "/legal/privacy", title: "Privacy policy", angle: "Explain collection, use, sharing, retention, choices, and contact routes using approved policy.", family: "legal" },
  { path: "/legal/terms", title: "Terms of service", angle: "Make governing service terms, scope, responsibilities, and change history available for review.", family: "legal" },
  // Conversion pages. /demo is excluded because App.tsx owns that route.
  { path: "/book-demo", title: "Request a Meta Clinic walkthrough", angle: "Bring one clinic workflow and its team handoffs to a focused product walkthrough.", family: "conversion" },
  { path: "/request-demo", title: "Request a product walkthrough", angle: "Describe the clinic workflow you want to inspect so the walkthrough can focus on relevant screens and questions.", family: "conversion" },
  { path: "/contact", title: "Contact Meta Clinic", angle: "Share clinic context and a business question to identify a useful next conversation.", family: "conversion" },
  { path: "/get-started", title: "Get started with a clinic workflow", angle: "Begin with your specialty, operating model, and the handoff you most want to improve.", family: "conversion" },
  { path: "/pilot", title: "Discuss a clinic pilot", angle: "Define evaluation questions, participating roles, scope, and readiness before discussing a pilot.", family: "conversion" },
  { path: "/sandbox", title: "Explore the product sandbox", angle: "Inspect a guided workflow with synthetic records and note questions for a walkthrough.", family: "conversion" },
  { path: "/signup", title: "Request evaluation access", angle: "Share your clinic and intended evaluation so access and next steps can be discussed.", family: "conversion" },
  { path: "/try", title: "Try the guided demo", angle: "Follow a clinic task from patient access to team follow-through in a guided demonstration.", family: "conversion" },
];

const familyCopy: Record<Family, { eyebrow: string; headings: readonly [string, string, string]; questions: readonly [string, string, string]; cta: { label: string; path: string }; secondary: { label: string; path: string }; note: string ;
  }> = {
  resource: { eyebrow: "Clinic operations resource", headings: ["Set scope and ownership", "Map the working sequence", "Review exceptions before adoption"], questions: ["Who should use this resource?", "Can I use it as clinic policy?", "How does this connect to software evaluation?"], cta: { label: "Explore the demo", path: "app:/demo" }, secondary: { label: "Request a walkthrough", path: "/book-demo" }, note: "Operational planning only, not clinical or legal advice. Adapt it to clinic policy and obtain qualified review where required." },
  solution: { eyebrow: "Clinic operations solution", headings: ["Find the handoff creating friction", "Give each role a clear next step", "Evaluate fit with real exceptions"], questions: ["Which part should we map first?", "Does this remove every manual step?", "How can our team evaluate fit?"], cta: { label: "Request a walkthrough", path: "/book-demo" }, secondary: { label: "Explore the platform", path: "/platform" }, note: "Confirm current product behavior and availability in a guided evaluation." },
  security: { eyebrow: "Security evaluation", headings: ["Define data and deployment scope", "Request current evidence", "Assign shared responsibilities"], questions: ["What is verified about this control today?", "Can this page establish compliance for our clinic?", "What evidence should our reviewer request?"], cta: { label: "Ask a security question", path: "/contact" }, secondary: { label: "Review security topics", path: "/security" }, note: "Verification status: this page is an evaluation outline, not a verified security or compliance representation. Confirm current documentation, deployment scope, and agreements with the appropriate reviewer." },
  integration: { eyebrow: "Integration evaluation", headings: ["Specify the data exchange", "Confirm availability and ownership", "Plan for failure and reconciliation"], questions: ["Is this vendor connection available today?", "Who operates the connection and account?", "What happens when an exchange fails?"], cta: { label: "Confirm integration status", path: "/contact" }, secondary: { label: "Explore clinic workflows", path: "/platform" }, note: "Verification status: vendor relationship, connectivity, supported data exchange, and agreement status are unverified until confirmed with current product and vendor evidence. No active integration is claimed." },
  comparison: { eyebrow: "Software evaluation", headings: ["Choose criteria before comparing", "Compare workflow and implementation", "Verify claims with a walkthrough"], questions: ["Is this comparison based on current evidence?", "Will one platform fit every clinic?", "What should we validate before switching?"], cta: { label: "See the product workflow", path: "/book-demo" }, secondary: { label: "Review the platform", path: "/platform" }, note: "Comparison status: publish no capability, price, result, or migration claim without a dated primary source and like-for-like review." },
  proof: { eyebrow: "Customer evidence", headings: ["Understand clinic context", "Separate observation from outcome", "Review permission and method"], questions: ["Is this evidence approved for publication?", "Can another clinic expect the same result?", "What context is needed to interpret the story?"], cta: { label: "Discuss your clinic workflow", path: "/book-demo" }, secondary: { label: "Contact Meta Clinic", path: "/contact" }, note: "Verification status: no customer name, testimonial, result, or review is represented as approved. Publish only after source verification and explicit permission." },
  company: { eyebrow: "About Meta Clinic", headings: ["Product focus", "How clinic evaluation works", "Current opportunities and relationships"], questions: ["Who is Meta Clinic designed for?", "How can a clinic learn about the product?", "Are roles or programs currently open?"], cta: { label: "Contact Meta Clinic", path: "/contact" }, secondary: { label: "Request a walkthrough", path: "/book-demo" }, note: "Company history, open roles, customer relationships, and program terms require confirmation before publication." },
  legal: { eyebrow: "Policy review", headings: ["Identify document and scope", "Review approved current text", "Confirm responsibilities and changes"], questions: ["Is this the current approved policy?", "Does this replace advice from our counsel?", "How do I confirm which terms apply?"], cta: { label: "Ask about policy scope", path: "/contact" }, secondary: { label: "Review security topics", path: "/security" }, note: "Verification status: policy text and effective dates require approval by the responsible legal reviewer. This wireframe is not a contract or legal advice." },
  conversion: { eyebrow: "Clinic product evaluation", headings: ["Tell us about your clinic", "Choose the workflow to review", "Agree on a useful next step"], questions: ["What should I include in my request?", "Do I need to share patient information?", "What happens after I submit?"], cta: { label: "Request a conversation", path: "/contact" }, secondary: { label: "Explore the demo", path: "app:/demo" }, note: "Use business context only; do not include patient information. Product access, pilot scope, and availability are confirmed separately." },
};

type ResourceDetail = { checklist: string; sequence: string; exception: string; next: string ;
};
const resourceDetails: Record<string, ResourceDetail> = {
  "/resources": { checklist: "Choose a workflow, name its owner, list required information, mark the handoff, and identify how completion is recognized.", sequence: "Start with a patient or staff request, follow preparation and review, then trace the work to its recorded outcome and follow-up owner.", exception: "Note missing information, changed appointments, unavailable services, duplicate requests, and tasks that need an authorized decision.", next: "Select one guide or template below, adapt it with the people doing the work, and compare the resulting map with a focused product walkthrough." },
  "/resources/api-docs": { checklist: "Identify the client, environment, authentication method, endpoint, required fields, version, rate limit, and support contact before building.", sequence: "Read the authentication guide, inspect a documented request and response, then map errors and versioning to the consuming system.", exception: "Plan for expired credentials, validation errors, throttling, timeouts, duplicate submissions, and changes to documented versions.", next: "Confirm API availability and access for your account, then use a non-production environment and documented examples before connecting clinic workflows." },
  "/resources/checklists": { checklist: "For each task, record trigger, owner, required input, completion evidence, due point, and the next role receiving the work.", sequence: "Arrange checklist items in actual working order; group prerequisite checks before actions and close the loop with a named reviewer.", exception: "Add a branch for incomplete inputs, urgent escalation according to clinic policy, rescheduling, and an unavailable system.", next: "Run the checklist with one team member from each role, remove duplicate checks, and assign an owner to every unresolved item." },
  "/resources/guides": { checklist: "Pick the guide that matches the workflow, define the clinic setting, list roles, and collect current written procedures before changing steps.", sequence: "Use each guide to move from current-state mapping to a proposed sequence, owner assignment, exception review, and evaluation questions.", exception: "Flag jurisdictional, clinical, privacy, vendor, and staffing decisions for the qualified owner instead of treating a general guide as a rule.", next: "Bring the completed map to a team review and use the relevant sandbox walkthrough to validate only the software-related steps." },
  "/resources/guides/ai-in-healthcare-workflows": { checklist: "Name the AI-supported task, input categories, intended output, reviewer, correction path, retention questions, and actions that remain human-owned.", sequence: "Compare the original input with the proposed output, have the assigned person review and correct it, then record what is accepted or discarded.", exception: "Define handling for incomplete or misleading output, unavailable AI service, sensitive input, model uncertainty, and a reviewer who declines the suggestion.", next: "Request current data-flow and feature documentation; evaluate a narrow workflow with human review before expanding use." },
  "/resources/guides/automate-patient-intake": { checklist: "List each form, required field, invitation trigger, due point, staff reviewer, missing-item follow-up, and destination in the visit workflow.", sequence: "Send or provide the intake request, track submission, review answers and omissions, resolve questions with the patient, then make approved context available to the visit team.", exception: "Plan for partial or duplicate submissions, changed appointments, accessibility needs, incorrect contact details, and information that requires clinician review.", next: "Walk one routine and one incomplete intake through the proposed process; confirm what staff can see and correct before using it." },
  "/resources/guides/clinic-membership-model": { checklist: "Write eligibility, price, included services, exclusions, billing cadence, pause or cancellation terms, and who approves each change.", sequence: "Present the approved terms, capture the member’s choice, record effective date, reconcile payment status, and confirm service access with the responsible team.", exception: "Define failed payment, refund, disputed terms, pause, cancellation, renewal change, and an enrollment that needs manual review.", next: "Have operations, finance, and legal review the terms together, then trace enrollment through change and cancellation before selecting tools." },
  "/resources/guides/glp-1-clinic-workflow": { checklist: "Map inquiry, administrative intake, appointment preparation, authorized clinical review, program administration, payment, and follow-up ownership.", sequence: "Track the patient-facing request into staff preparation, leave clinical eligibility and treatment decisions to qualified clinicians, and assign the agreed operational follow-up.", exception: "Define incomplete intake, missed visit, unavailable product or service, a change requiring clinical review, and a patient request to pause or stop.", next: "Review this operational map with clinical leadership and confirm local policies; do not use it as a prescribing or eligibility protocol." },
  "/resources/guides/infusion-chair-scheduling": { checklist: "Record appointment type and duration, chair requirements, staff coverage, preparation time, turnover, and the role allowed to change the schedule.", sequence: "Match a requested visit to an eligible time, chair, and staffed window; confirm the booking, then show changes to affected roles.", exception: "Plan for late starts, extended visits, chair downtime, staffing gaps, cancellations, and competing requests using clinic-defined priorities.", next: "Replay a typical day with a schedule owner and care-team representative, then confirm which capacity rules are supported by current software." },
  "/resources/guides/infusion-inventory-management": { checklist: "Track item identity, lot, expiration, location, receipt, movement, count owner, reconciliation date, and the source record for each change.", sequence: "Receive and verify stock, place it in a recorded location, document authorized movement or use, and reconcile the balance on the clinic’s schedule.", exception: "Define damaged or expired stock, count mismatch, recall notice, missing lot detail, and an item held for investigation.", next: "Compare the inventory map with existing policy and supplier records; confirm that any software view supports the exact fields and controls needed." },
  "/resources/guides/medical-inventory-lot-tracking": { checklist: "Capture item, lot identifier, expiration, supplier reference, quantity, storage location, transaction reason, and staff member recording the movement.", sequence: "Verify a delivery against its documents, record each lot separately, track transfers and use, then reconcile physical counts with the ledger.", exception: "Set a hold and escalation owner for mismatched lots, unreadable labels, expired items, suspected recall, and stock with unknown provenance.", next: "Test the process using synthetic examples and ask the responsible inventory and compliance owners to approve the local recordkeeping rules." },
  "/resources/guides/start-a-cash-pay-clinic": { checklist: "Define services, audience, published prices, payment timing, refund rules, staffing, booking path, documentation, and the owner for each policy.", sequence: "Describe a service and its terms, accept a booking request, prepare the visit, record payment activity, and assign after-visit follow-up.", exception: "Plan for cancellations, refunds, declined payments, price changes, package balances, and a service question needing qualified review.", next: "Validate the business model and applicable requirements with qualified advisors, then use the map to evaluate software fit." },
  "/resources/guides/start-a-trt-clinic": { checklist: "Map business setup, responsible roles, patient access, administrative intake, appointment operations, payment, records, and qualified clinical oversight.", sequence: "Route inquiries to the appropriate staff, prepare intake for authorized review, coordinate the visit, and assign administrative follow-up without encoding treatment decisions.", exception: "Identify licensing and jurisdiction questions, incomplete information, a concern requiring clinician escalation, and vendor or pharmacy dependencies for qualified review.", next: "Use qualified legal and clinical advisors to establish requirements; treat this guide as an operations outline, not a clinical protocol." },
  "/resources/guides/start-a-weight-loss-clinic": { checklist: "Define service model, staff roles, intake ownership, visit capacity, payment terms, documentation, follow-up, and the approved clinical governance process.", sequence: "Receive an inquiry, coordinate intake and scheduling, prepare the visit team, record administrative outcomes, and assign the next contact.", exception: "Plan for incomplete intake, missed appointments, changing service needs, payment issues, and any clinical question that must go to a qualified clinician.", next: "Review the operating model with qualified clinical, legal, and business advisors before choosing tools or publishing service claims." },
  "/resources/guides/telehealth-workflow": { checklist: "Specify visit type, eligibility owner, appointment instructions, connection method, identity process, contingency contact, and follow-up owner.", sequence: "Schedule and confirm the visit, send approved joining details, prepare encounter context, record the visit through the clinic’s process, and assign follow-up.", exception: "Document a failed connection, late arrival, privacy concern, unsuitable visit, and a need to switch to an approved alternative.", next: "Have clinical and privacy owners validate the workflow and applicable location rules; verify the current video connection separately." },
  "/resources/guides/trt-patient-intake": { checklist: "Identify administrative questions, source documents, completion status, reviewer, missing-item contact, and the point where clinical review begins.", sequence: "Provide the approved intake request, check completion, route responses to the authorized reviewer, resolve administrative omissions, and prepare the visit.", exception: "Escalate urgent concerns under clinic policy; handle conflicting, incomplete, or misdirected information through a named reviewer and approved channel.", next: "Ask qualified clinical and legal owners to approve questions and retention before using a form; this guide does not define screening or treatment criteria." },
  "/resources/guides/weight-loss-patient-intake": { checklist: "List approved intake topics, completion timing, responsible reviewer, missing-answer process, accessibility path, and how context reaches the visit.", sequence: "Invite the patient, monitor submission, route completed responses to the appropriate reviewer, resolve omissions, and record visit-preparation status.", exception: "Handle incomplete or conflicting responses, language or accessibility needs, changed appointments, and concerns that require qualified clinical attention.", next: "Have clinical leadership approve the intake scope and review steps; do not treat this administrative outline as a care or eligibility protocol." },
  "/resources/help": { checklist: "Capture the page or task, account role, expected behavior, observed behavior, time, and a safe way for support to reproduce the issue.", sequence: "Search the relevant topic, follow the documented steps, note the result, and route unresolved access or product issues through the approved support contact.", exception: "Avoid sending passwords, tokens, patient information, or protected records; describe the issue with synthetic examples and stop if sensitive data is requested.", next: "If the article does not resolve the question, contact support with the non-sensitive context and the workflow you were trying to complete." },
  "/resources/templates": { checklist: "Choose a template, name its intended owner, replace sample assumptions, add local policy references, and assign review and approval roles.", sequence: "Copy the template, complete each required field, discuss ownership with affected roles, record unresolved items, and approve a version for local use.", exception: "Mark fields that do not apply, defer decisions requiring legal or clinical review, and record how outdated copies will be replaced.", next: "Use a completed template in a team walkthrough; keep the source and local version date visible so later reviews can find the approved copy." },
  "/resources/templates/clinic-intake-form": { checklist: "For each question state purpose, required or optional status, answer format, reviewer, and what happens if it is unanswered.", sequence: "Order questions by patient effort, group related topics, identify the submission confirmation, and map each response group to its authorized reviewer.", exception: "Provide an accessible completion path, a way to correct an answer, and instructions for staff when a response needs follow-up rather than automated interpretation.", next: "Have clinical, privacy, and accessibility reviewers approve the form before use; collect only information the clinic has a defined reason to request." },
  "/resources/templates/clinic-launch-checklist": { checklist: "Create rows for task, owner, due date, dependency, evidence of completion, status, and the person who approves closure.", sequence: "Work from business and service scope through staffing, policies, access, scheduling, communications, and a final operational rehearsal.", exception: "Flag unresolved permits, vendor readiness, staffing gaps, policy approvals, and failed rehearsal steps as blockers with named owners.", next: "Review open blockers at a launch meeting and keep a dated decision log; this checklist does not certify legal or clinical readiness." },
  "/resources/templates/infusion-treatment-schedule": { checklist: "Add visit slot, planned duration, chair, assigned coverage, preparation window, turnover allowance, and change contact.", sequence: "Place visits against staffed chair capacity, confirm requirements with the schedule owner, publish the daily view, and record every change for affected roles.", exception: "Show conflicts, chair maintenance, extended appointments, staff absence, cancellation, and waitlist requests for human resolution.", next: "Validate the schedule fields and local rules with the team; do not encode treatment suitability or clinical sequencing in this template." },
  "/resources/templates/medication-inventory-template": { checklist: "Use item, lot, expiration, quantity, unit, location, transaction type, reference, recorder, and reconciliation status fields.", sequence: "Record receipt by lot, document each authorized transfer or use, update the balance, and reconcile physical stock against the recorded amount.", exception: "Create a hold and investigation path for discrepancy, damage, expiration, recall, missing lot, or uncertain transaction history.", next: "Have the inventory owner approve fields, access, retention, and reconciliation frequency; validate with synthetic records before local adoption." },
  "/resources/templates/telehealth-consent": { checklist: "List purpose, visit modality, foreseeable limitations, alternatives, privacy considerations, withdrawal process, and who answers questions.", sequence: "Present the approved document before the visit, allow time for questions, record completion through the clinic-approved process, and make the status visible to the responsible team.", exception: "Define how staff respond to declined consent, a connection failure, a request to stop, or a situation needing an alternative approved workflow.", next: "Have qualified legal and clinical reviewers approve language for the relevant jurisdiction and visit types before use; this draft is not legal advice." },
  "/resources/templates/trt-intake-form": { checklist: "List administrative topics, question purpose, answer format, completion status, reviewer, and the path for missing or corrected responses.", sequence: "Share the clinic-approved form, track completion, route responses to authorized clinical review, and prepare the visit without deriving treatment recommendations.", exception: "Use clinic policy for urgent disclosures, conflicting entries, privacy requests, and information submitted through the wrong channel.", next: "Ask qualified clinical and legal reviewers to approve every question and data practice; this template is not a screening or prescribing protocol." },
  "/resources/templates/weight-loss-intake-form": { checklist: "For each approved topic note its purpose, response type, reviewer, optionality, and action for an incomplete answer.", sequence: "Provide the approved form, confirm receipt, route responses for qualified review, resolve administrative gaps, and mark visit preparation complete.", exception: "Offer an accessible alternative and a correction route; send clinical concerns to the authorized reviewer rather than interpreting them in the form.", next: "Review content, privacy, accessibility, and retention with qualified owners before use; this template does not define eligibility or treatment." },
  "/resources/videos": { checklist: "Choose a video by workflow, note the role shown, identify which screen or task matters, and record questions that remain unanswered.", sequence: "Watch the task from entry to completion, pause at handoffs, and compare each visible step with your clinic’s current process.", exception: "Treat demo records as illustrative, note any outdated interface or missing context, and do not infer an integration or feature from an unverified clip.", next: "Bring the unresolved workflow questions to a current guided demo and confirm the product behavior in the environment being evaluated." },
  "/resources/webinars": { checklist: "Review the topic, presenter qualifications, recording date, cited sources, and whether the discussion is operational, clinical, or commercial.", sequence: "Capture the problem discussed, the suggested process, assumptions, and questions to verify with your own qualified team.", exception: "Separate general discussion from current product behavior, jurisdiction-specific requirements, and advice for a particular patient or clinic.", next: "Use the session notes to prepare a team discussion and check current primary sources before adopting a policy or making a purchasing decision." },
};

function resourceSections(spec: Spec): GrowthPage["sections"] {
  const detail = resourceDetails[spec.path];
  if (!detail) return [];
  return [
    { heading: "Purpose and scope", body: `${spec.angle} Define who will use this resource, the setting it applies to, and which decisions remain with a qualified clinic owner.` },
    { heading: "Actionable checklist", body: detail.checklist },
    { heading: "Process and handoff", body: detail.sequence },
    { heading: "Exceptions to plan for", body: detail.exception },
    { heading: "Next step", body: detail.next },
  ];
}

type JourneySections = readonly [string, string, string, string, string];
const solutionSections: Record<string, JourneySections> = {
  "/solutions": ["Clinic owners and practice managers often see work stall between roles, tools, and the patient-facing task. Start with one recurring handoff and name the delay or re-entry it creates.", "Choose yesterday’s representative task: who initiated it, what information arrived, where did it wait, and how did the team know it was done?", "Trace the request through intake, staff review, service, and follow-through. Assign an owner at each transfer and show what context must travel with the task.", "The front desk needs status and missing items; the care team needs reviewed context; managers need to find unowned work. Check permissions and exception handling for each view.", "Bring the map to a walkthrough and ask which steps are available today, what remains manual, and how your team could measure a better handoff."],
  "/solutions/automate-follow-ups": ["Practice managers and care teams can lose visibility after a visit when next actions live in notes, inboxes, or memory. Begin with a follow-up that is frequently delayed.", "Use a completed visit that requires a scheduled check-in: identify the trigger, timing rule, responsible role, and the information needed to act.", "Show how the visit creates a follow-up task, who reviews or assigns it, what completion means, and how an overdue or unanswered contact returns to staff attention.", "Staff need patient context, due timing, prior attempts, and a clear owner; managers need a view of unassigned and overdue work. Ask how opt-outs and failed messages are handled.", "Evaluate a routine and overdue example. Confirm which follow-up steps are currently supported and agree on a measure such as fewer unowned tasks before discussing a pilot."],
  "/solutions/automate-patient-intake": ["Repeated questions and incomplete forms create extra work for patients and staff. A practice manager can start with one visit type whose preparation often arrives late.", "Follow a new patient from appointment booking through a partially completed intake form and the staff member checking readiness.", "Map request delivery, submission tracking, review, correction requests, and transfer of accepted information to the visit. Keep clinical interpretation with the authorized reviewer.", "Front desk staff need completion and missing-field status; clinicians need reviewed context; patients need a clear way to correct or ask for help. Check access and correction history.", "Walk through complete and incomplete submissions. Ask what can be configured, what stays manual, and how the clinic will measure fewer repeat entries or last-minute gaps."],
  "/solutions/automate-scheduling": ["Scheduling becomes difficult when appointment type, staff availability, rooms, chairs, and visit duration are considered in separate places. Start with one appointment that needs a specific resource.", "Use a rescheduled appointment that requires a clinician and room at the same time; note the constraints the scheduler checks today.", "Trace request, eligibility under clinic rules, slot selection, confirmation, and change notifications. Show who owns conflicts and who confirms affected resources.", "Schedulers need a reason for unavailable slots and a safe way to resolve conflicts; staff need the current schedule and change context. Ask about waitlists and cancellations.", "Evaluate a normal booking and a resource conflict. Verify supported scheduling rules in the current product and compare them with your clinic’s actual constraints."],
  "/solutions/cash-pay-clinics": ["Cash-pay teams must keep service descriptions, quoted terms, payment status, and follow-up consistent across patient and staff conversations. Start with one service that has clear published terms.", "Follow a prospective patient from service inquiry to booking, arrival, payment, and a post-visit question about the charge.", "Map service information, appointment, checkout, receipt status, and follow-up ownership. Distinguish recorded payment state from accounting reconciliation and clinic policy.", "Front desk staff need the agreed service and payment status; managers need exceptions such as refunds or failed charges; patients need clear terms. Ask how changes are recorded.", "Review a straightforward payment and a refund or decline. Confirm current payment behavior, fees, and account requirements directly before deciding on fit."],
  "/solutions/launch-a-clinic": ["A new clinic has interdependent choices about service scope, staffing, policies, scheduling, and patient access. The owner should begin with one planned service and its first operating day.", "Simulate the first patient inquiry through appointment preparation, staff assignment, service delivery, payment, and next contact.", "List prerequisites and decision owners before launch: approved service information, staff access, booking rules, patient materials, and escalation contacts.", "The owner needs unresolved decisions and dependencies; staff need role-specific steps and escalation routes. Ask how changes to opening plans reach each role.", "Use a readiness review with named owners and evidence for each decision. Software walkthroughs can check workflow fit but do not establish legal, clinical, or operational readiness."],
  "/solutions/manage-medication-inventory": ["Teams can have difficulty reconciling what is on hand with what was received, moved, or recorded. Start with an item whose lot and expiration need regular review.", "Walk through a delivery with two lots, a location transfer, and a count that differs from the expected balance.", "Trace receiving, lot-level record, authorized movement, use, and reconciliation. Identify the role that can edit each event and who investigates a discrepancy.", "Inventory staff need quantities, lot, expiry, and movement history; managers need holds and unresolved mismatches. Confirm role access and whether external purchasing is actually connected.", "Ask the product team to demonstrate the exact fields and discrepancy path. Compare it with clinic policy and confirm integrations separately before relying on them."],
  "/solutions/manage-memberships": ["Membership operations combine enrollment, recurring terms, included services, payment events, and changes over time. Start with a new member who later pauses or cancels.", "Follow an approved offer from explanation and member choice through activation, a visit, a failed payment, and a cancellation request.", "Show the source of terms, enrollment confirmation, access state, payment status, and person responsible for changes or exceptions.", "Staff need a clear view of what was agreed and what service access applies; finance needs payment exceptions; patients need understandable change terms. Ask how disputes are resolved.", "Review enrollment, payment failure, pause, and cancellation scenarios with operations and finance. Confirm current product behavior and have qualified reviewers approve terms."],
  "/solutions/multi-location-clinics": ["Operators need shared oversight without losing which location owns a patient-facing task or local exception. Start with a task created at one site that needs central review.", "Use a cross-location appointment change or inventory question and identify who can see, assign, and resolve it at each site.", "Trace local task creation, location ownership, any permitted escalation, and central reporting. Confirm how access changes when staff work across locations.", "Location staff need local queues and relevant context; central operators need comparable status without broader access than intended. Ask how permission boundaries appear in the interface.", "Walk through one local and one cross-site scenario using the intended role setup. Confirm the current scope of location permissions and reporting before estimating rollout effort."],
  "/solutions/patient-self-service": ["Patient self-service can reduce back-and-forth only when requests land with a clear owner and a safe review path. Start with a patient updating contact details or asking to reschedule.", "Follow a request from patient submission to staff review, clarification, accepted change, and confirmation back to the patient.", "Map what the patient can submit, what changes require staff approval, where the request appears, and how unresolved requests are assigned.", "Patients need understandable status and correction instructions; staff need request context, identity checks required by policy, and an audit of accepted changes. Ask about accessibility and channel failure.", "Test common and ambiguous requests. Confirm which fields and actions are supported today and where clinic policy requires manual review."],
  "/solutions/reduce-front-desk-work": ["Front desk teams often repeat work when booking, arrival, intake, and payment each sit in a separate queue. Begin with a patient arriving whose intake is incomplete.", "Track the check-in from appointment lookup through missing information, staff resolution, visit handoff, and checkout.", "Identify what is gathered once, who verifies it, how missing steps are assigned, and which status is visible to the next role.", "Reception needs a concise readiness view and an exception path; the care team needs the reviewed handoff; managers need to spot repeat bottlenecks. Ask what staff still enter twice.", "Walk through an ordinary arrival and an incomplete one. Compare actual clicks and remaining manual tasks against a baseline from your front desk."],
  "/solutions/replace-multiple-systems": ["Replacing tools can move complexity instead of removing it. The owner should start with a current-system map showing duplicate entry, records of authority, and tasks that cross vendor boundaries.", "Choose one patient journey that touches at least two systems, such as booking through payment, and note every data handoff.", "For each step, record source, destination, owner, export needs, dependencies, and fallback. Mark which system should remain during a phased transition.", "Staff need role-specific migration and training plans; leaders need contract, data access, and transition risk. Ask about export format, cutover, rollback, and retained history.", "Compare the workflow with current product evidence and a migration plan. Do not assume all systems can be replaced; verify each dependency and exit term before deciding."],
  "/solutions/scale-a-clinic": ["Adding locations or staff can expose inconsistent practices and hidden workarounds. Start with one workflow that succeeds at the current clinic but varies by person or site.", "Compare the same task at two locations or across two staff members and note where steps, owners, and outcomes diverge.", "Document the repeatable core, permitted local variation, escalation owner, and reporting signal before copying the workflow to a new team.", "Operators need comparable completion and exception views; local staff need room for approved variation. Ask how role access, training changes, and workflow updates are managed.", "Pilot the standardized path with one team and review exceptions before expansion. Set a measurable readiness threshold and confirm the platform supports the needed scope."],
};

const conversionSections: Record<string, JourneySections> = {
  "/book-demo": ["Clinic owners and practice managers need to know whether a product can support a real operating workflow. Bring one recurring handoff where the current process is hard to see.", "Choose a concrete journey such as incomplete intake before a visit, a scheduling change, or a stock reconciliation; name the roles who should join the walkthrough.", "Ask to see the workflow from its starting point through review, staff action, and follow-up. Request that the presenter identify the screen, owner, and any manual step at every handoff.", "Ask what is available now, what needs configuration, and what is only planned. You do not need to share patient information; synthetic examples are enough to frame the discussion.", "Use the demo to record fit, gaps, and follow-up questions. If useful, agree on a separate scoped evaluation with clear participants and criteria."],
  "/request-demo": ["A useful demo request starts with the question your team cannot answer from a general product tour. Tell us which workflow or role handoff you want to inspect.", "Describe one scenario, the people involved, and the result your team needs to see; for example, how a scheduling change reaches the room and staff owner.", "The request should route the topic to a focused walkthrough, where the relevant current screens and handoff states can be reviewed with your team.", "If the feature or connection is uncertain, ask for its current availability and dependencies. Keep patient-level details out of the request and use operational descriptions instead.", "Submit the workflow and attendee context, then use the response to plan a focused session or clarify whether a different evaluation step fits."],
  "/contact": ["Business questions often need different owners: product fit, partnership, security, or general company information. Start by naming the subject and the decision you are trying to make.", "Provide your clinic type, role, location count if relevant, and a short description of the workflow or business question; do not include patient details.", "A clear inquiry lets the team identify the right follow-up owner and request only the context needed to respond.", "If your question depends on security controls, vendor availability, a legal term, or customer evidence, ask for the current source and scope rather than an informal assurance.", "Send the business inquiry and retain any response that clarifies scope or next steps. Use approved clinical channels for patient matters."],
  "/get-started": ["Teams unsure where to begin can start with the most costly or confusing handoff, rather than trying to evaluate every feature at once.", "Name your specialty, operating model, primary roles, and one current task that gets repeated, delayed, or lost between people.", "Use that scenario to choose a relevant product walkthrough, identify who must attend, and list any workflow constraints that should be visible.", "Ask how the current product handles your normal case and exception case; clarify dependencies, manual work, and availability before drawing conclusions.", "Agree on whether the next step is a demo, a scoped evaluation, or a follow-up question. Keep the evaluation bounded by a clear workflow and owner."],
  "/pilot": ["A pilot is useful only when the clinic and product team can answer a defined evaluation question with an agreed scope and responsible participants.", "Choose one workflow, a small set of roles, an evaluation period to be confirmed, and an observable outcome such as handoff completeness or task ownership.", "Map onboarding, configuration, synthetic or approved data scope, support owner, review cadence, and exit or continuation decision before starting.", "Ask what product behavior is available, what readiness dependencies apply, how issues are handled, and which criteria would indicate fit. A pilot does not itself establish clinical or compliance readiness.", "Discuss a written scope and required agreements with the responsible parties; begin only after participants, access, boundaries, and success criteria are confirmed."],
  "/sandbox": ["A sandbox lets evaluators inspect workflow behavior without bringing real patient records into a marketing evaluation. Start with one role and one task to follow.", "Select a synthetic scenario such as booking a visit, reviewing an intake status, or assigning a follow-up; note the starting state before clicking through.", "Observe what each role can see, how work moves to the next owner, and what status changes. Record any step that is unavailable or requires staff action.", "Ask whether the shown flow is current, which configuration it assumes, and what is intentionally simulated. Do not infer external connectivity from a sample screen.", "Use observations to shape a focused demo request and list open questions about roles, availability, or workflow gaps."],
  "/signup": ["Evaluation access should match a business need and the appropriate account scope. The clinic contact should explain who will evaluate and what workflow matters.", "Provide organization context, evaluator role, and a non-sensitive description of the intended evaluation; identify whether a guided session may answer the question first.", "Access provisioning and any setup should have a named owner, agreed account scope, and instructions for using synthetic demonstration data.", "Ask what access is currently available, how evaluators are supported, and what limitations apply. Do not submit credentials or patient records through the request.", "Request access or a guided alternative, then confirm scope and next steps directly before planning clinic use."],
  "/try": ["A short guided tryout is most useful when the visitor knows which outcome to inspect and can distinguish a sample workflow from a live clinic deployment.", "Follow one synthetic task from patient access to staff handoff, such as submitting intake and checking whether preparation is complete.", "Notice where information appears, who owns the next action, and how an incomplete or changed request is surfaced to staff.", "If a step looks automated, confirm what is actually happening, which parts are sample data, and whether a person still reviews the result.", "Capture questions and continue to a focused walkthrough when you need to verify availability, configuration, security evidence, or implementation scope."],
};

function journeySections(spec: Spec): GrowthPage["sections"] {
  const detail = (spec.family === "solution" ? solutionSections : conversionSections)[spec.path];
  if (!detail) return [];
  const headings = ["Problem and buyer context", "Starting scenario", "Workflow and handoffs", "Team view and objections", "Evaluate and choose a next step"] as const;
  return headings.map((heading, index) => ({ heading, body: detail[index as 0 | 1 | 2 | 3 | 4] }));
}

type TrustSections = readonly [string, string, string, string, string];
const securitySections: Record<string, TrustSections> = {
  "/security": [
    "Clinic owners, security leads, and privacy reviewers should begin by documenting the product environment, intended workflow, data categories, users, and connected services in scope.",
    "Request current control descriptions, assessment scope, evidence dates, exceptions, responsible owners, and relevant agreements. No certification or compliance status is asserted by this page.",
    "Map who approves access, handles configuration, reviews incidents, responds to data requests, and manages vendors. Distinguish Meta Clinic responsibilities from the clinic’s own obligations.",
    "Ask what happens during account changes, service interruption, suspected incident, or a request to correct or remove information. Record escalation contacts and unresolved dependencies.",
    "Have your security, privacy, and legal reviewers compare current evidence with your deployment and use case. Treat any missing document or confirmation as open, then agree on follow-up owners."],
  "/security/access-control": [
    "Define which staff roles need access, what work each role performs, and which information or actions should be limited by job responsibility.",
    "Request current role and permission documentation, access review procedure, identity requirements, change history, and evidence showing the documented scope. Do not infer controls from a visible navigation menu.",
    "Map onboarding, role change, temporary coverage, termination, and periodic review to named approvers. Confirm how a clinic administrator requests and verifies each change.",
    "Ask how incorrect access, a locked account, an urgent role change, or a departed staff member is handled and recorded. Confirm the response owner and expected escalation path.",
    "Compare the documented model with your clinic’s least-privilege requirements using representative roles. Resolve configuration and review questions before evaluating real deployment."],
  "/security/ai-data-privacy": [
    "For each AI-assisted workflow, identify the input, output, user, intended task, and whether the information can include sensitive or patient-related content.",
    "Request a current data-flow description covering processing parties, retention, access, model use, subprocessors, deletion, and feature-specific limitations. These details are unverified until evidence is reviewed.",
    "Document when staff submit information, review a generated result, correct or reject it, and decide whether it is recorded or shared. AI output remains subject to human review.",
    "Ask what happens when output is incorrect, unavailable, incomplete, or submitted in error, and how a user can avoid or stop processing where applicable.",
    "Have privacy and security reviewers compare the documented flow to the intended use and applicable agreements. Keep unresolved processing or retention questions open."],
  "/security/audit-logs": [
    "Identify which actions your clinic needs to reconstruct, such as account changes, record access, administrative updates, or workflow events, and who will review them.",
    "Request the current event list, captured fields, retention period, export availability, access restrictions, and evidence for the specific product environment. Do not assume a particular event is logged.",
    "Assign an operational owner for reviewing events, escalating suspicious activity, and retaining evidence under clinic policy. Clarify how access to the logs themselves is controlled.",
    "Ask how missing events, delayed visibility, a suspected unauthorized action, or a request for an export is handled and documented.",
    "Use a documented scenario to confirm what can be inspected today and which questions remain unanswered. Do not treat the existence of logs as proof of compliance."],
  "/security/backups": [
    "Establish which data and service components matter to your evaluation, what disruption you are planning for, and which recovery responsibilities belong to each party.",
    "Request current backup scope, frequency, retention, encryption details, restoration process, recovery objectives, test date, and exclusions. These operational claims require evidence for the relevant deployment.",
    "Map who declares a recovery event, communicates status, validates restored information, and reconciles work created during an interruption.",
    "Ask how corruption, accidental deletion, regional outage, failed restoration, and data captured during downtime are handled; distinguish documented procedures from tested outcomes.",
    "Have continuity owners review current evidence and define any required recovery demonstration. Leave recovery capability or timing unverified until evidence supports it."],
  "/security/business-associate-agreement": [
    "First determine whether the proposed service and data flow make a business associate agreement applicable; this depends on roles, scope, and current service facts.",
    "Request the current agreement template or executed-document process, covered service scope, effective terms, and responsible legal contact. No BAA availability or execution status is claimed here.",
    "Compare agreement duties with operational owners for permitted use, safeguards, subcontractors, incident notice, access requests, and return or deletion obligations.",
    "Resolve what happens if scope changes, a subprocessor is introduced, an incident occurs, or the relationship ends. Ask counsel to review any open or conflicting terms.",
    "Have qualified counsel determine applicability and review the current agreement before relying on a BAA representation. Mark availability and execution as unverified until confirmed."],
  "/security/data-protection": [
    "Inventory the information involved in the proposed workflow, where it originates, which users need it, and the purpose for each use.",
    "Request current documentation for collection, processing, storage, sharing, retention, deletion, access, and subprocessors, including scope and evidence date.",
    "Assign owners for configuration, user access, data requests, correction, retention schedules, vendor oversight, and end-of-service handling.",
    "Ask how misdirected information, an incorrect record, a deletion request, a vendor outage, or a change in intended use is handled and documented.",
    "Review the data map and supporting evidence with privacy and security stakeholders. Do not infer a safeguard or permitted use that is not documented."],
  "/security/encryption": [
    "Identify the data, transport paths, storage locations, users, and service boundaries relevant to the encryption question being evaluated.",
    "Request current technical documentation for encryption in transit and at rest, cryptographic scope, key ownership and rotation, exceptions, and evidence date. No specific encryption configuration is asserted here.",
    "Clarify which party operates key management, how access to keys is restricted, and how configuration or key changes are approved and recorded.",
    "Ask how backup copies, logs, exports, temporary processing, and a suspected key compromise are handled within the documented scope.",
    "Have a qualified security reviewer compare technical evidence to your requirements and deployment. Treat unprovided algorithms, key practices, and certification claims as unverified."],
  "/security/hipaa": [
    "Map the clinic’s intended use, information involved, parties, and proposed service roles before drawing any conclusion about HIPAA applicability or responsibility.",
    "Request current documentation supporting the specific safeguards, service scope, and agreements under review. This page does not claim that Meta Clinic is HIPAA certified or compliant.",
    "Ask qualified reviewers to assign responsibilities for permitted use, workforce access, risk processes, incident response, patient rights requests, and vendor oversight.",
    "Review how changes to the service, data flow, connected vendor, or clinic role affect the analysis; identify unresolved legal or operational questions.",
    "Have your privacy and legal advisors assess the current evidence for your specific arrangement. Keep certification, compliance, and BAA status explicitly unverified unless documented."],
};

const integrationSections: Record<string, TrustSections> = {
  "/integrations": [
    "Clinic operators should list the systems involved, the workflow that crosses them, and the business owner for each connection before evaluating an integration.",
    "For every proposed connection, request supported data, direction, trigger, accounts, vendor participation, availability, and evidence date. A listed vendor or planned feature does not establish a live connection.",
    "Assign owners for configuration, credentials, monitoring, support, reconciliation, and changes to either system. Confirm which system remains authoritative for each data element.",
    "Plan for rejected, delayed, duplicate, or unavailable exchanges and specify how staff see an error and resume work safely without silently losing a task.",
    "Review one normal and one failure scenario with product and vendor owners. Keep each connection’s status unverified until current evidence confirms it."],
  "/integrations/api": [
    "An engineering or operations owner should identify the system, workflow, data direction, and reason an API connection is needed before estimating work.",
    "Request current API documentation, supported operations, authentication method, versions, limits, availability, and access requirements. Do not assume credentials or endpoints are available.",
    "Map client ownership, credential storage and rotation, error monitoring, retries, idempotency, version upgrades, and support escalation between both parties.",
    "Ask how timeouts, throttling, invalid payloads, duplicate requests, and breaking changes are surfaced and reconciled.",
    "Confirm access and a non-production evaluation path with the responsible product owner; treat API availability and specific capabilities as unverified until demonstrated."],
  "/integrations/e-prescribing": [
    "A clinic must first identify the prescribing workflow, authorized roles, intended system boundary, and applicable account or service prerequisites.",
    "Request confirmation of the current connection, supported participants, jurisdictions, data exchanged, agreements, and required credentials. No prescribing vendor relationship or live capability is claimed.",
    "Clarify who owns configuration, user provisioning, clinical workflow policy, support, and reconciliation when a prescription-related task does not complete.",
    "Ask how a rejected, delayed, cancelled, or misrouted request is returned to an authorized clinician and recorded without implying autonomous prescribing.",
    "Have clinical, legal, and vendor stakeholders confirm availability and responsibilities in writing before planning reliance on the connection."],
  "/integrations/email": [
    "Define which clinic events may generate email, who approves message content, which recipients are eligible, and what the communication is intended to accomplish.",
    "Verify current provider support, sender identity setup, trigger behavior, supported templates, delivery status, and data shared with the email service.",
    "Assign responsibility for consent and preference records, template approval, bounced messages, replies, and staff follow-up. Confirm where delivery status is visible.",
    "Plan for bounce, delay, provider outage, wrong address, duplicate send, and an opt-out or reply that needs a person to act.",
    "Review the current data flow and message controls with privacy and operations owners. Treat provider connection and delivery guarantees as unverified until demonstrated."],
  "/integrations/labs": [
    "Identify the lab workflow in scope: order, result receipt, matching, review, and follow-up, including the clinic and laboratory roles involved.",
    "Ask which laboratories and accounts are currently supported, which results or order fields move, whether the path is live, and what agreements or configuration are required.",
    "Map patient matching, result routing, authorized review, correction, and responsibility for unresolved or unmatched results before any workflow is used.",
    "Define handling for delayed, duplicate, corrected, unmatched, or unavailable results and make sure a result is not treated as reviewed until the assigned person acts.",
    "Confirm the specific laboratory connection and demonstrate its normal and exception path with current evidence; vendor availability remains unverified until then."],
  "/integrations/pharmacies": [
    "Specify the pharmacy-related workflow, information expected to move, authorized clinic roles, patient account context, and the pharmacy’s responsibilities.",
    "Verify participating pharmacy, supported transaction types, account prerequisites, data direction, current availability, and agreement scope; no pharmacy connection is claimed here.",
    "Identify who handles setup, change requests, rejected transactions, account mismatches, support, and reconciliation between the clinic and pharmacy.",
    "Plan for unavailable service, a changed pharmacy, duplicate request, or conflicting status, with a clear route to an authorized staff member.",
    "Ask product and pharmacy representatives to confirm the exact supported workflow and current status before representing it as integrated."],
  "/integrations/sms": [
    "List which appointment or workflow events might trigger a text, intended recipients, message purpose, and clinic policy governing patient contact.",
    "Verify provider, available message events, sender setup, delivery status, data shared, current connection, and required account configuration.",
    "Assign ownership for contact preferences, consent, opt-out processing, message content approval, failed delivery review, and inbound replies.",
    "Test the documented response to a wrong number, opt-out, delayed or duplicated message, provider outage, and urgent reply; do not assume delivery equals receipt.",
    "Review the current vendor and data-flow evidence with privacy and operations owners. Keep live status and supported behavior unverified until confirmed."],
  "/integrations/stripe": [
    "Define the payment workflow, merchant account owner, currencies and payment methods in scope, and the records finance needs to reconcile.",
    "Request confirmation of current Stripe connection status, supported flows, account setup, fees, data exchanged, and any limitations. No live payment connection is asserted here.",
    "Map payment initiation, result handling, refunds, disputes, reconciliation, and responsibility between the clinic, Meta Clinic, and payment provider.",
    "Plan for declined or delayed payment, duplicate submission, webhook failure, refund, dispute, and account restriction; identify which ledger is authoritative.",
    "Have finance and product owners review a demonstrated normal and exception path plus current commercial terms before relying on the integration."],
  "/integrations/telehealth": [
    "Specify whether the evaluation covers scheduling, launching a session, identity, encounter context, or follow-up, and identify the clinic roles involved.",
    "Confirm the current video provider, supported browsers and accounts, data exchanged, service availability, agreements, and any environment-specific limits.",
    "Map invite delivery, staff preparation, patient joining, visit transition, and post-session follow-up; identify which party supports each step.",
    "Plan for failed join, audio or video interruption, privacy concern, late participant, and a clinic-approved alternative workflow.",
    "Demonstrate the exact current connection and confirm vendor and agreement status with owners. Do not infer a live integration from a scheduling screen."],
};

function trustSections(spec: Spec): GrowthPage["sections"] {
  const detail = (spec.family === "security" ? securitySections : integrationSections)[spec.path];
  if (!detail) return [];
  const headings = ["Scope and buyer context", "Evidence to request", "Ownership and workflow", "Exceptions and open questions", "Evaluation and next step"] as const;
  return headings.map((heading, index) => ({ heading, body: detail[index as 0 | 1 | 2 | 3 | 4] }));
}

const comparisonBriefs: Record<string, TrustSections> = {
  "/compare": [
    "Clinic owners and practice managers should agree on the job to be done before shortlisting software. Separate must-have workflows from preferences and future ideas.",
    "Run the same scenario through each option: the roles involved, information needed, exceptions, and what counts as completion. Keep the scenario identical so the comparison is fair.",
    "For each claim, record a dated primary source or a witnessed demonstration, the product scope it applies to, and what remains unconfirmed. This page contains no verified competitor ranking or capability claim.",
    "Include data access, permissions, implementation effort, contract scope, migration, support, and exit needs. Mark unknowns as unknown rather than inferring a capability from marketing language.",
    "Use the criteria matrix in a product walkthrough and ask owners to resolve the highest-impact unknowns before making a decision."],
  "/compare/ehr-vs-meta-clinic": [
    "A clinic deciding between an EHR, practice tools, or a broader platform should first define which clinical-record and operating tasks are in scope.",
    "Select one journey that crosses roles, such as booking through encounter preparation and follow-up. Identify which system is expected to hold each record and why.",
    "Compare only current, sourced details about record functions, operational workflow, access, and integrations. No direct capability comparison on this page is verified or published.",
    "Review migration, clinical documentation needs, role permissions, support, data export, and legal scope. A broader platform does not automatically replace every specialized or clinical system.",
    "Ask product owners to demonstrate the same workflow and document gaps, dependencies, and systems that would remain before evaluating a transition."],
  "/compare/practice-management-vs-meta-clinic": [
    "Practice managers should decide whether the evaluation concerns scheduling and administration alone or also patient access, visit handoffs, and follow-through.",
    "Use a scenario with booking, a change, arrival, staff preparation, and a follow-up task; note each system and role currently involved.",
    "Compare like-for-like current evidence for calendars, tasks, communication, payment, and reporting. The page does not assert that a named product has a particular feature.",
    "Check configuration effort, role boundaries, integrations, record ownership, training, support, and total cost; list which functions need a separate tool.",
    "Walk through the clinic’s scenario in each considered option and retain an evidence-backed list of fit, gaps, and implementation questions."],
  "/alternatives": [
    "An alternatives search is clearer when the clinic names its specialty, operating model, locations, users, and the workflow driving the search.",
    "Build a shortlist using a representative task and include normal completion, a change, and a failure or exception that staff handle today.",
    "For each candidate, capture dated sources, demonstrated product behavior, implementation requirements, and a direct contact for unresolved claims. No vendor comparison is verified here.",
    "Compare contract and exit terms, data portability, access control, vendor dependencies, migration, training, support, and ownership after cutover.",
    "Score options against the clinic’s agreed criteria, then ask each vendor to demonstrate the open questions using the same workflow."],
  "/alternatives/[competitor-name]": [
    "A comparison with a named vendor should help a clinic buyer assess a specific workflow, not imply that either product is universally better.",
    "Select one clinic task and document roles, inputs, expected result, configuration, and exception path for both products under review.",
    "Populate each side only with current primary sources or a dated demonstration. Competitor capabilities, prices, customer results, and migration claims are unverified placeholders until sourced.",
    "Show limitations, version and plan differences, third-party dependencies, contract scope, and any detail that could not be confirmed; invite correction when evidence changes.",
    "Have a reviewer check source links and like-for-like wording before publication; use a live evaluation to resolve remaining fit questions."],
};

const proofBriefs: Record<string, TrustSections> = {
  "/resources/case-studies": [
    "A case study should tell a clinic owner whether the organization and workflow resemble their own. Record specialty, size, operating model, and time period only with permission.",
    "Gather approved interview notes, product scope, implementation timeline, and any measured outcome with its source, date, denominator, and method. This route currently has no approved customer evidence.",
    "Separate what the clinic reported, what was directly observed, and what was measured. Do not turn an anecdote into a quantified result or general product claim.",
    "Check quote accuracy, attribution, permission, representativeness, and limitations. Do not imply endorsement, guaranteed performance, or an outcome another clinic should expect.",
    "Publish only after the customer and internal owners approve the final facts, scope, and presentation; otherwise keep the page as an evidence-gathering outline."],
  "/customers": [
    "Clinic leaders looking for peer context need to know who is represented, what workflow was evaluated, and when the experience took place.",
    "A published story needs confirmed clinic identity, scope, quote or observation source, date, and explicit permission. No customer listing or outcome is approved in this wireframe.",
    "Explain the clinic’s starting context, the workflow it considered, and what changed only when those details are verified. Separate reported experience from independently measured evidence.",
    "State limits, sample size, selection method, and any relationship or incentive that affects interpretation. Do not imply that one story establishes typical results.",
    "Invite readers to evaluate their own workflow in a demo; add customer evidence only after source and permission review."],
  "/customers/[clinic-name]": [
    "A named clinic story should answer whether the clinic’s context is relevant to the reader, using only details the organization approved for release.",
    "Confirm organization name, interview source, product and workflow scope, dates, metrics, quote approval, and publication permission. No customer fact is verified by this placeholder.",
    "Describe the starting process and observed product use, then explain any outcome with its measurement method and evidence source. Leave unsupported fields unpublished.",
    "Do not infer a result, endorsement, or permission from a draft or internal note. Include limitations and clarify when a reported outcome is specific to that clinic.",
    "Route the page to customer and evidence reviewers before publishing; until approved, retain a neutral evaluation outline with no names or claims."],
  "/customers/case-studies": [
    "A case study should tell a clinic owner whether the organization and workflow resemble their own. Record specialty, size, operating model, and time period only with permission.",
    "Gather approved interview notes, product scope, implementation timeline, and any measured outcome with its source, date, denominator, and method. No approved case study is claimed here.",
    "Separate what the clinic reported, what was directly observed, and what was measured. Do not turn an anecdote into a quantified result or general product claim.",
    "Check quote accuracy, attribution, permission, representativeness, and limitations. Do not imply endorsement, guaranteed performance, or an outcome another clinic should expect.",
    "Publish only after the customer and internal owners approve the final facts, scope, and presentation; otherwise keep the page as an evidence-gathering outline."],
  "/reviews": [
    "Review readers need a date, source, reviewer context, product scope, and enough detail to judge whether an opinion applies to their clinic.",
    "Use only reviews with verified origin, permission or valid use basis, accurate attribution, and a record of any incentive or moderation. No reviews are verified for this page.",
    "Preserve the reviewer’s meaning and distinguish subjective opinion from a factual performance claim. Link claims to evidence or omit them.",
    "Explain selection and moderation criteria; do not present a curated subset as representative or suppress critical feedback in a misleading way.",
    "Confirm sourcing, date, quote fidelity, and disclosure with the responsible reviewer before publishing any review content."],
  "/testimonials": [
    "A testimonial is useful when a clinic reader can understand who is speaking, what they experienced, and the context around the statement.",
    "Obtain explicit permission, verified identity and role, final quote approval, product scope, date, and disclosure of any material relationship. No testimonial is approved here.",
    "Keep the statement faithful to the speaker’s experience and avoid adding product results or clinical implications that the source did not establish.",
    "Include context and limits so a quote is not mistaken for a guarantee, typical result, endorsement of an unverified feature, or clinical recommendation.",
    "Publish only after attribution and claim review; until then, use the page to explain how permissioned customer perspectives will be evaluated."],
};

const companyBriefs: Record<string, TrustSections> = {
  "/about": [
    "Clinic owners and practice managers should quickly understand what Meta Clinic is building, the clinic workflows in scope, and how to evaluate current product behavior.",
    "Describe confirmed product scope and intended audience from current source material. Keep company history, customer status, launch dates, and outcomes unpublished until verified.",
    "Explain a practical evaluation path: identify a workflow, request a focused walkthrough, and document fit and open questions with the people who own the work.",
    "Separate current capabilities from roadmap ideas, proposed services, consultancy work, and clinical practice. State no customer or partnership relationship without approval.",
    "Point clinic teams to the platform, demo, and contact routes; confirm any commitment, support offer, or availability directly."],
  "/company": [
    "Business and clinic stakeholders need a clear account of the software organization and the product work relevant to independent clinic operations.",
    "Include only reviewed legal entity, operating location, leadership, history, and product information. Any detail not confirmed by an authoritative company source remains a placeholder.",
    "Describe how an organization can request product information or discuss evaluation, while distinguishing product activity from consulting or clinical services.",
    "Do not imply staffing scale, support coverage, investment, customer adoption, or operational commitments that have not been verified.",
    "Use the contact route for business questions and update company facts only after the responsible owner validates the source and wording."],
  "/founder": [
    "Readers looking for the founder’s perspective should understand the problem being addressed and how it informed the product direction.",
    "Use a confirmed first-person account and verified background details; no biography, personal history, or founding date is established by this brief.",
    "Explain how clinic workflow questions inform product evaluation, with concrete examples only when they are factual, permissioned, and current.",
    "Distinguish shipped product, current experiments, and future plans. Avoid implying clinical authority, customer endorsement, or outcomes without evidence.",
    "Invite clinics to share business workflow feedback through approved contact channels; verify all personal and company statements before publication."],
  "/careers": [
    "A candidate needs to know the work, expectations, location, employment terms, and hiring contact before deciding to apply.",
    "Publish a role only after the hiring owner confirms that it is open, with approved responsibilities, qualifications, compensation disclosure where applicable, and application instructions.",
    "Explain the actual selection process and who handles candidate information using current hiring policy; do not promise a timeline unless confirmed.",
    "If there are no verified openings, say that status clearly rather than implying active recruitment. Do not collect sensitive or unnecessary applicant information.",
    "Route interested candidates to a verified application path or company contact after role availability and privacy handling are confirmed."],
  "/partners": [
    "Clinic operators and potential partners should understand the type of relationship being discussed and where responsibilities would sit.",
    "Name a partner or describe an active relationship only with verified status, agreed wording, permission, and current scope. No partner is confirmed by this page.",
    "For a proposed collaboration, document referral, implementation, support, data, and customer communication responsibilities before describing it publicly.",
    "Clarify that a conversation or logo does not establish a live integration, endorsement, contract, or service commitment.",
    "Invite a business inquiry to discuss fit; confirm the responsible owner and approved relationship details before adding partner claims."],
  "/partner-program": [
    "An organization evaluating a partner program needs clear eligibility, responsibilities, customer boundaries, and current program terms.",
    "Program status, referral rules, compensation, onboarding, support, and legal terms are unverified here and should remain unpublished until approved.",
    "A proposed workflow should name lead ownership, consent for introductions, service delivery scope, escalation, and how each party communicates with clinics.",
    "Resolve conflict handling, data sharing, branding, termination, and whether any promised capability depends on a third party before enrollment.",
    "Use a business contact to ask whether a program is active; share detailed terms only after owner and legal review."],
  "/affiliate-program": [
    "A prospective affiliate should be able to assess whether a real program exists, who may participate, and what disclosures and payment rules apply.",
    "No active affiliate program, rate, tracking method, payout schedule, or eligibility rule is verified by this page; do not publish placeholder terms as an offer.",
    "If a program is approved, explain referral attribution, required disclosures, prohibited claims, payment handling, and participant support from the current terms.",
    "Address attribution disputes, returned payments, termination, privacy, and misleading promotion; require approved language for product and compliance claims.",
    "Confirm program status and written terms with the responsible business and legal owners before accepting referrals or publishing a signup call to action."],
};

const legalBriefs: Record<string, TrustSections> = {
  "/legal": [
    "A clinic reviewing legal information needs to identify which document applies to the product, environment, user, and intended activity under consideration.",
    "List only current approved source documents with owner, version, effective date, and status. None of the policy text on this wireframe should be treated as published or in force.",
    "Preserve the document’s definitions, responsibilities, choices, contact route, and change history; distinguish explanatory material from binding terms.",
    "Flag missing approval, unclear service scope, conflicting versions, or a question requiring counsel rather than summarizing around the uncertainty.",
    "Have the responsible legal reviewer approve the source and rendered copy before publication. Readers should consult qualified counsel for their circumstances."],
  "/legal/acceptable-use": [
    "Users need to understand who may use the service, which activities are restricted, and how concerns should be reported.",
    "The current acceptable-use policy, effective date, enforcement process, and authorized contact are unverified placeholders pending source review.",
    "Organize approved rules by user responsibility, prohibited activity, account handling, and reporting; preserve defined exceptions and referenced documents.",
    "Clarify how suspected misuse, account compromise, mistaken flagging, and appeals are handled only when the approved policy defines those steps.",
    "Publish after the policy owner and legal reviewer confirm text, scope, and revision date; do not invent enforcement rights or user obligations."],
  "/legal/ai-disclosure": [
    "A user should be able to identify which product features use AI, what task they assist, and when human review is required.",
    "Feature scope, data processing, retention, model provider, and approved disclosure language are unverified until supported by current product documentation.",
    "Explain how a user sees, reviews, edits, rejects, and records an AI-assisted output without presenting it as an autonomous clinical decision.",
    "Address unavailable or inaccurate output, data handling questions, and feature changes only from approved documentation; route unresolved questions to the responsible owner.",
    "Have product, privacy, and legal owners approve the disclosure for each active feature and its actual data flow before publication."],
  "/legal/baa": [
    "Readers first need to establish whether the service arrangement and information flow make a business associate agreement applicable.",
    "BAA availability, current template, execution status, effective date, and covered services are unverified here; do not imply an agreement is offered or signed.",
    "When a current agreement exists, identify its responsible parties and preserve its permitted uses, safeguards, subcontractor duties, notice provisions, and termination language.",
    "Escalate scope changes, conflicting documents, or questions about legal duties to qualified counsel; a marketing summary cannot alter the agreement.",
    "Confirm applicability and current agreement with legal owners before reliance or publication; keep the page as a review placeholder until approved."],
  "/legal/cookies": [
    "Visitors need to know which browser technologies are used, their purpose, and what choices are available in the current site experience.",
    "Cookie inventory, providers, durations, purposes, and consent behavior are unverified until checked against current site configuration and approved policy.",
    "Group technologies by necessary operation and any optional purpose only when documented; explain how available settings can be changed.",
    "Review third-party changes, region-specific requirements, rejected consent, and deleted browser storage. Do not list vendors or durations from assumptions.",
    "Have privacy and web owners validate a current inventory and legal reviewer approve the policy before publication."],
  "/legal/hipaa": [
    "HIPAA questions depend on the parties, service, data flow, and use in a specific arrangement; readers should identify those facts first.",
    "No HIPAA certification, compliance status, safeguard, or BAA status is asserted here. Request current evidence and approved statements tied to the exact service scope.",
    "Explain roles and responsibilities only from current reviewed documents; distinguish the software provider’s commitments from the clinic’s own duties.",
    "Route questions about applicability, safeguards, breach obligations, and patient rights to qualified privacy and legal reviewers.",
    "Keep claims unpublished until evidence and legal review support them. This page is informational scaffolding, not legal advice or a compliance determination."],
  "/legal/privacy": [
    "A privacy notice should let readers understand whose information is collected, for which service, and how the notice relates to their interaction.",
    "Collection, use, sharing, retention, rights, contact details, and effective date are unverified until matched against current data flows and an approved policy.",
    "Describe each purpose and recipient in plain language from the source documents; distinguish website inquiry data from any product or clinic-controlled information.",
    "Explain choices, request handling, deletion limits, and policy changes only when current operations can honor them and the responsible reviewer approves the wording.",
    "Complete a data inventory and legal review before publishing. Do not treat this draft as the active privacy notice."],
  "/legal/terms": [
    "Prospective users need to know which service terms govern access, who the parties are, and when a proposed agreement becomes effective.",
    "Current terms, legal entity, effective date, pricing or renewal provisions, and change process are unverified placeholders pending approved source documents.",
    "Present the approved clauses with headings and links intact; explain how product terms relate to order forms, privacy terms, and any negotiated agreement.",
    "Flag conflicts, missing documents, or jurisdiction questions for counsel. Do not invent warranty, liability, payment, renewal, or termination language.",
    "Publish only the current approved document with version history and reviewer signoff; readers should seek qualified advice before accepting terms."],
};

function remainingFamilySections(spec: Spec): GrowthPage["sections"] {
  const familyMap = spec.family === "comparison" ? comparisonBriefs
    : spec.family === "proof" ? proofBriefs
      : spec.family === "company" ? companyBriefs
        : legalBriefs;
  let detail = familyMap[spec.path];
  if (!detail && spec.family === "comparison" && spec.path.startsWith("/alternatives/")) detail = comparisonBriefs["/alternatives/[competitor-name]"];
  if (!detail && spec.family === "proof" && spec.path.startsWith("/customers/")) detail = proofBriefs["/customers/[clinic-name]"];
  if (!detail) return [];
  const headings = spec.family === "comparison" ? ["Buyer criteria", "Matched workflow scenario", "Evidence and sources", "Gaps and switching risks", "Evaluation next step"]
    : spec.family === "proof" ? ["Story scope and permission", "Evidence to confirm", "How to interpret outcomes", "Limits and attribution", "Review before publication"]
      : spec.family === "company" ? ["Audience and purpose", "Facts to verify", "How to engage", "Open questions and boundaries", "Next step"]
        : ["Document scope", "Source and review status", "Responsibilities and operation", "Exceptions and interpretation", "Review before publication"];
  return headings.map((heading, index) => ({ heading, body: detail![index as 0 | 1 | 2 | 3 | 4] }));
}

function bodies(family: Family, title: string, angle: string): readonly [string, string, string] {
  if (family === "resource") return [
    `Begin with the people responsible for ${title.toLowerCase()}, the information each role needs, and the decision the workflow supports. Mark local policy and items requiring qualified review.`,
    `Write the sequence from first request through review, completion, and follow-up. For ${title.toLowerCase()}, record owner, required input, handoff, and status so the team can find gaps without relying on memory.`,
    `Walk through routine work and exceptions such as missing information, schedule changes, unavailable systems, and unclear ownership. Validate the resulting process with the people who will use it.`,
  ];
  if (family === "solution") return [
    `${angle} Ask where information is repeated, which role waits for another, and how the team knows the task is finished. Capture a current-state example first.`,
    `For ${title.toLowerCase()}, show the staff role, context, next action, and handoff state together. Keep exception work visible without implying software makes a clinical or operational decision.`,
    `Evaluate a routine task, a changed request, missing information, and a step needing human review. Agree on practical measures such as fewer duplicate entries or clearer task ownership.`,
  ];
  if (family === "security") return [
    `${angle} Document the environment, data categories, users, connected services, and intended use. A control must be assessed in the deployment and responsibility scope it covers.`,
    `Request current, scoped documentation for ${title.toLowerCase()}, including owner, operating process, evidence date, exceptions, and any independent review. Record unknowns explicitly.`,
    "Have security, privacy, legal, and operational reviewers assign responsibilities for configuration, access, incidents, retention, and vendor review before relying on a claim.",
  ];
  if (family === "integration") return [
    `${angle} Define source and destination, data fields, direction, trigger, frequency, account prerequisites, and the party responsible for each step. A vendor name does not establish support or live connectivity.`,
    `Ask the product owner to demonstrate the current supported path for ${title.toLowerCase()} and identify unavailable, planned, or third-party-dependent pieces. Record evidence date and environment.`,
    "Review rejection, delay, duplicate, outage, and reconciliation scenarios. Decide who sees an error and how work resumes safely when the external service cannot be reached.",
  ];
  if (family === "comparison") return [
    "Set clinic-specific criteria for workflow coverage, permissions, data access, implementation effort, support, and operating cost. Define each criterion so options are assessed consistently.",
    `Compare ${title.toLowerCase()} by walking through the same clinic scenario. Separate demonstrated behavior from roadmap statements, marketing language, and third-party assumptions.`,
    "Check dated primary sources, contract scope, migration responsibilities, training, and exit options. Keep conclusions proportional to the evidence collected.",
  ];
  if (family === "proof") return [
    `Give ${title.toLowerCase()} context with the organization, team, specialty, operating model, and evaluation period. Include only details approved for publication.`,
    "Describe workflow observations separately from measured outcomes. State source, timeframe, denominator, and method for each metric; omit any result that cannot be verified.",
    "Confirm attribution, quote accuracy, permission, review date, and limitations. One customer story is useful context, not a promise of the same result elsewhere.",
  ];
  if (family === "company") return [
    `Describe ${title.toLowerCase()} through the product being built, clinic roles it is intended to support, and operating problems being addressed. Keep confirmed history separate from plans.`,
    "Explain how a clinic can share needs, review the product, and discuss fit. State support, delivery, and availability only when a current owner confirms them.",
    "List leadership details, roles, partnerships, and program terms only when verified. Give interested clinics a contact path and identify steps requiring a separate agreement.",
  ];
  if (family === "legal") return [
    `Identify who the ${title.toLowerCase()} document applies to, the service or activity it covers, the responsible entity, and effective date from the approved source.`,
    "Present approved text with definitions, responsibilities, choices, and contact routes preserved. Do not add terms or remove qualifications absent from the source.",
    "Show version date and a way to ask which terms apply. Route interpretation questions to a qualified reviewer; do not present the page as legal advice.",
  ];
  return [
    `${angle} Share specialty, clinic size or locations, roles involved, and the task to inspect. Describe the business question without patient-level details.`,
    "Choose a focused scenario such as intake, scheduling, visit follow-through, memberships, or inventory. Show current screens and distinguish available behavior from open questions.",
    "Agree on the next step: walkthrough, scoped evaluation, or follow-up conversation. Pilot access, implementation details, and commercial terms require separate confirmation.",
  ];
}

function answers(family: Family, title: string): readonly [string, string, string] {
  if (family === "resource") return [`Clinic owners, practice managers, and workflow owners mapping ${title.toLowerCase()} can use this as a working outline.`, "No. Have the appropriate clinic, clinical, privacy, or legal owner adapt and approve the process.", "Compare the map with current product behavior in a demo and record what is available, configurable, or still open." ];
  if (family === "solution") return [`Start with one ${title.toLowerCase()} scenario, including its handoffs and the source of rework or delay.`, "No. Confirm current behavior and identify steps that still require staff review, external systems, or clinic policy.", "Bring roles, exceptions, and a success measure to a walkthrough; discuss a pilot only after scope is clear."];
  if (family === "security") return ["No status is asserted here. Request dated documentation applicable to your product version, deployment, and data.", "No. Review your organization’s responsibilities and evidence with qualified security, privacy, and legal reviewers.", `Request the scope, owner, evidence date, exceptions, related agreement, and follow-up contact for ${title.toLowerCase()}.`];
  if (family === "integration") return ["Availability is unverified here. Ask the product team and vendor to confirm a supported connection for your accounts and environment.", "Confirm account owner, configuration party, support contact, data responsibilities, and agreement status.", "Agree on error visibility, safe recovery, reconciliation ownership, and the authoritative system for each record."];
  if (family === "comparison") return ["This is an evaluation framework. Publish direct comparisons only with current, dated, like-for-like sources.", "No. Fit depends on workflows, roles, deployment, integrations, and commercial terms; compare them against your requirements.", "Confirm export, migration, training, access, contract, support, and a representative workflow before changing systems."];
  if (family === "proof") return ["Only evidence with confirmed source, attribution approval, and publication permission should appear; this brief contains no approved customer claim.", "No. An experience is specific to its clinic, timeframe, scope, and measurement method.", `Review context, workflow scope, date, method, permission, and limitations before interpreting ${title.toLowerCase()}.`];
  if (family === "company") return ["Meta Clinic is presented here as clinic software; confirm current product scope and intended audience in a walkthrough.", "Use the contact page for a business question or request a workflow-focused demo.", "Confirm current openings, relationships, and program terms directly; no active role or program is claimed here."];
  if (family === "legal") return ["This is not approved policy text. Verify the current document, reviewer, effective date, and service scope before publication.", "No. Obtain advice from qualified counsel for your circumstances.", "Contact Meta Clinic with the product, environment, and evaluation scope to confirm the applicable current document."];
  return ["Share clinic type, roles, operating context, and workflow to see; keep the request focused on business information.", "No. Do not submit patient information in a marketing request.", "The team can discuss a suitable walkthrough or evaluation. Timing, access, and any pilot are confirmed separately."];
}

const resourceDestinations: Record<string, readonly [string, string]> = {
  "/resources/guides/ai-in-healthcare-workflows": ["/ai/workflow-automation", "/weight-loss"],
  "/resources/guides/automate-patient-intake": ["/weight-loss/patient-intake", "/weight-loss"],
  "/resources/guides/clinic-membership-model": ["/direct-primary-care/memberships", "/direct-primary-care"],
  "/resources/guides/glp-1-clinic-workflow": ["/weight-loss/glp-1-workflows", "/weight-loss"],
  "/resources/guides/infusion-chair-scheduling": ["/infusion/chair-scheduling", "/infusion"],
  "/resources/guides/infusion-inventory-management": ["/infusion/medication-inventory", "/infusion"],
  "/resources/guides/medical-inventory-lot-tracking": ["/infusion/lot-tracking", "/infusion"],
  "/resources/guides/start-a-cash-pay-clinic": ["/primary-care/cash-pay", "/primary-care"],
  "/resources/guides/start-a-trt-clinic": ["/mens-health/trt", "/mens-health"],
  "/resources/guides/start-a-weight-loss-clinic": ["/weight-loss/ai-intake", "/weight-loss"],
  "/resources/guides/telehealth-workflow": ["/weight-loss/telehealth", "/weight-loss"],
  "/resources/guides/trt-patient-intake": ["/mens-health/ai-intake", "/mens-health"],
  "/resources/guides/weight-loss-patient-intake": ["/weight-loss/patient-intake", "/weight-loss"],
  "/resources/templates/clinic-intake-form": ["/weight-loss/patient-intake", "/weight-loss"],
  "/resources/templates/clinic-launch-checklist": ["/solutions/launch-a-clinic", "/primary-care"],
  "/resources/templates/infusion-treatment-schedule": ["/infusion/chair-scheduling", "/infusion"],
  "/resources/templates/medication-inventory-template": ["/infusion/medication-inventory", "/infusion"],
  "/resources/templates/telehealth-consent": ["/behavioral-health/telehealth", "/behavioral-health"],
  "/resources/templates/trt-intake-form": ["/mens-health/ai-intake", "/mens-health"],
  "/resources/templates/weight-loss-intake-form": ["/weight-loss/patient-intake", "/weight-loss"],
};

function relatedLinks(family: Family, path: string): GrowthPage["links"] {
  if (family === "resource") {
    const targets = resourceDestinations[path];
    return [
      ...(targets ? [{ label: "Related workflow", path: targets[0] }, { label: "Specialty overview", path: targets[1] }] : []),
      { label: "All guides", path: "/resources/guides" },
      { label: "Templates", path: "/resources/templates" },
      { label: "Explore sandbox", path: "/sandbox" },
    ];
  }
  if (family === "solution") return [{ label: "All solutions", path: "/solutions" }, { label: "Platform", path: "/platform" }, { label: "Request a walkthrough", path: "/book-demo" }];
  if (family === "security") return [{ label: "Security overview", path: "/security" }, { label: "Privacy policy", path: "/legal/privacy" }, { label: "Ask a question", path: "/contact" }];
  if (family === "integration") return [{ label: "Integrations", path: "/integrations" }, { label: "Platform", path: "/platform" }, { label: "Confirm availability", path: "/contact" }];
  if (family === "comparison") return [{ label: "Compare options", path: "/compare" }, { label: "Platform", path: "/platform" }, { label: "Request a walkthrough", path: "/book-demo" }];
  if (family === "proof") return [{ label: "Customer stories", path: "/customers" }, { label: "Case studies", path: "/customers/case-studies" }, { label: "Request a walkthrough", path: "/book-demo" }];
  if (family === "company") return [{ label: "About Meta Clinic", path: "/about" }, { label: "Platform", path: "/platform" }, { label: "Contact", path: "/contact" }];
  if (family === "legal") return [{ label: "Legal information", path: "/legal" }, { label: "Security overview", path: "/security" }, { label: "Contact", path: "/contact" }];
  return [{ label: "Explore sandbox", path: "/sandbox" }, { label: "Platform", path: "/platform" }, { label: "Contact", path: "/contact" }];
}

/** Curated text-first content for editorial routes; images are attached in a later pass. */
export function getEditorialPageBrief(path: string): Partial<GrowthPage> | null {
  const normalized = path.replace(/\/$/, "") || "/";
  const spec = specs.find((entry) => entry.path === normalized)
    ?? (normalized.startsWith("/alternatives/") && normalized.split("/").length === 3
      ? { path: normalized, title: `Compare ${normalized.split("/").at(-1)!.replace(/[-_]/g, " ")} with Meta Clinic`, angle: "Build a balanced, source-checked comparison of workflow fit, supported capabilities, implementation, and open questions.", family: "comparison" as const }
      : undefined)
    ?? (normalized.startsWith("/customers/") && normalized.split("/").length === 3
      ? { path: normalized, title: `${normalized.split("/").at(-1)!.replace(/[-_]/g, " ")} clinic story`, angle: "Present a customer experience only after details, attribution, outcomes, and publication permission are confirmed.", family: "proof" as const }
      : undefined);
  if (!spec) return null;
  const content = familyCopy[spec.family];
  const paragraphs = bodies(spec.family, spec.title, spec.angle);
  const faqAnswers = answers(spec.family, spec.title);
  const group = spec.family === "solution" ? "Operational use cases" : spec.family === "proof" ? "Customer proof" : spec.family === "company" ? "Company" : spec.family === "legal" ? "Legal" : spec.family === "security" ? "Security / Compliance" : spec.family === "integration" ? "Integrations" : spec.family === "comparison" ? "Comparison / alternative pages" : spec.family === "conversion" ? "Sales / conversion" : "Resources";
  const visualBrief = spec.family === "resource" ? `Later: annotated ${spec.title.toLowerCase()} worksheet or task flow with no patient information.`
    : spec.family === "solution" ? `Later: workflow map for ${spec.title.toLowerCase()} showing roles, handoffs, status, and an exception path.`
      : spec.family === "security" ? `Later: reviewed evidence map for ${spec.title.toLowerCase()} showing scope, owner, evidence date, and unknowns; no unverified badges.`
        : spec.family === "integration" ? `Later: verified data-flow diagram for ${spec.title.toLowerCase()} with source, destination, owner, failure state, and confirmed availability.`
          : spec.family === "comparison" ? `Later: neutral criteria matrix for ${spec.title.toLowerCase()} with dated sources and explicit unknowns; no unsupported ranking.`
            : spec.family === "proof" ? `Later: permissioned story layout for ${spec.title.toLowerCase()} with context, evidence source, date, and limitations.`
              : spec.family === "company" ? `Later: verified company or team image for ${spec.title.toLowerCase()}, with named people only after consent.`
                : spec.family === "legal" ? `Later: document navigation and version history for ${spec.title.toLowerCase()}; no certification marks.`
                  : `Later: product workflow preview for ${spec.title.toLowerCase()} using approved synthetic data.`;
  return {
    group, title: spec.title, eyebrow: content.eyebrow, headline: spec.title, lead: spec.angle,
    steps: ["Map the current context", "Review the handoff and owner", "Confirm the next step"], note: content.note,
    audience: spec.family === "resource" ? "Clinic owners, practice managers, and workflow owners" : "Clinic owners, practice managers, and evaluation stakeholders",
    searchIntent: `${spec.title.toLowerCase()} planning, evaluation, and clinic workflow`,
    funnel: spec.family === "resource" ? "Learn → plan workflow → evaluate" : spec.family === "conversion" ? "Evaluate → request a conversation" : "Understand → evaluate fit → discuss a demo",
    visualBrief, primaryCta: content.cta, secondaryCta: content.secondary,
    sections: spec.family === "resource" ? resourceSections(spec)
      : spec.family === "solution" || spec.family === "conversion" ? journeySections(spec)
        : spec.family === "security" || spec.family === "integration" ? trustSections(spec)
          : spec.family === "comparison" || spec.family === "proof" || spec.family === "company" || spec.family === "legal" ? remainingFamilySections(spec)
            : content.headings.map((heading, index) => ({ heading, body: paragraphs[index as 0 | 1 | 2] })),
    questions: content.questions.map((question, index) => ({ question, answer: faqAnswers[index as 0 | 1 | 2] })),
    links: relatedLinks(spec.family, normalized),
  };
}
