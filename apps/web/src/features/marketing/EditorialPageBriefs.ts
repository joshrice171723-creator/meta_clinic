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
  { path: "/book-demo", title: "Book a Meta Clinic demo", angle: "Bring one clinic workflow and its team handoffs to a focused product walkthrough.", family: "conversion" },
  { path: "/request-demo", title: "Request a product walkthrough", angle: "Describe the clinic workflow you want to inspect so the walkthrough can focus on relevant screens and questions.", family: "conversion" },
  { path: "/contact", title: "Contact Meta Clinic", angle: "Share clinic context and a business question to identify a useful next conversation.", family: "conversion" },
  { path: "/get-started", title: "Get started with a clinic workflow", angle: "Begin with your specialty, operating model, and the handoff you most want to improve.", family: "conversion" },
  { path: "/pilot", title: "Discuss a clinic pilot", angle: "Define evaluation questions, participating roles, scope, and readiness before discussing a pilot.", family: "conversion" },
  { path: "/sandbox", title: "Explore the product sandbox", angle: "Inspect a guided workflow with synthetic records and note questions for a walkthrough.", family: "conversion" },
  { path: "/signup", title: "Request evaluation access", angle: "Share your clinic and intended evaluation so access and next steps can be discussed.", family: "conversion" },
  { path: "/try", title: "Try the guided demo", angle: "Follow a clinic task from patient access to team follow-through in a guided demonstration.", family: "conversion" },
];

const familyCopy: Record<Family, { eyebrow: string; headings: readonly [string, string, string]; questions: readonly [string, string, string]; cta: { label: string; path: string }; secondary: { label: string; path: string }; note: string }> = {
  resource: { eyebrow: "Clinic operations resource", headings: ["Set scope and ownership", "Map the working sequence", "Review exceptions before adoption"], questions: ["Who should use this resource?", "Can I use it as clinic policy?", "How does this connect to software evaluation?"], cta: { label: "Explore the sandbox", path: "/sandbox" }, secondary: { label: "Book a demo", path: "/book-demo" }, note: "Operational planning only, not clinical or legal advice. Adapt it to clinic policy and obtain qualified review where required." },
  solution: { eyebrow: "Clinic operations solution", headings: ["Find the handoff creating friction", "Give each role a clear next step", "Evaluate fit with real exceptions"], questions: ["Which part should we map first?", "Does this remove every manual step?", "How can our team evaluate fit?"], cta: { label: "Book a demo", path: "/book-demo" }, secondary: { label: "Explore the platform", path: "/platform" }, note: "Confirm current product behavior and availability in a guided evaluation." },
  security: { eyebrow: "Security evaluation", headings: ["Define data and deployment scope", "Request current evidence", "Assign shared responsibilities"], questions: ["What is verified about this control today?", "Can this page establish compliance for our clinic?", "What evidence should our reviewer request?"], cta: { label: "Ask a security question", path: "/contact" }, secondary: { label: "Review security topics", path: "/security" }, note: "Verification status: this page is an evaluation outline, not a verified security or compliance representation. Confirm current documentation, deployment scope, and agreements with the appropriate reviewer." },
  integration: { eyebrow: "Integration evaluation", headings: ["Specify the data exchange", "Confirm availability and ownership", "Plan for failure and reconciliation"], questions: ["Is this vendor connection available today?", "Who operates the connection and account?", "What happens when an exchange fails?"], cta: { label: "Confirm integration status", path: "/contact" }, secondary: { label: "Explore clinic workflows", path: "/platform" }, note: "Verification status: vendor relationship, connectivity, supported data exchange, and agreement status are unverified until confirmed with current product and vendor evidence. No active integration is claimed." },
  comparison: { eyebrow: "Software evaluation", headings: ["Choose criteria before comparing", "Compare workflow and implementation", "Verify claims with a walkthrough"], questions: ["Is this comparison based on current evidence?", "Will one platform fit every clinic?", "What should we validate before switching?"], cta: { label: "See the product workflow", path: "/book-demo" }, secondary: { label: "Review the platform", path: "/platform" }, note: "Comparison status: publish no capability, price, result, or migration claim without a dated primary source and like-for-like review." },
  proof: { eyebrow: "Customer evidence", headings: ["Understand clinic context", "Separate observation from outcome", "Review permission and method"], questions: ["Is this evidence approved for publication?", "Can another clinic expect the same result?", "What context is needed to interpret the story?"], cta: { label: "Discuss your clinic workflow", path: "/book-demo" }, secondary: { label: "Contact Meta Clinic", path: "/contact" }, note: "Verification status: no customer name, testimonial, result, or review is represented as approved. Publish only after source verification and explicit permission." },
  company: { eyebrow: "About Meta Clinic", headings: ["Product focus", "How clinic evaluation works", "Current opportunities and relationships"], questions: ["Who is Meta Clinic designed for?", "How can a clinic learn about the product?", "Are roles or programs currently open?"], cta: { label: "Contact Meta Clinic", path: "/contact" }, secondary: { label: "Book a demo", path: "/book-demo" }, note: "Company history, open roles, customer relationships, and program terms require confirmation before publication." },
  legal: { eyebrow: "Policy review", headings: ["Identify document and scope", "Review approved current text", "Confirm responsibilities and changes"], questions: ["Is this the current approved policy?", "Does this replace advice from our counsel?", "How do I confirm which terms apply?"], cta: { label: "Ask about policy scope", path: "/contact" }, secondary: { label: "Review security topics", path: "/security" }, note: "Verification status: policy text and effective dates require approval by the responsible legal reviewer. This wireframe is not a contract or legal advice." },
  conversion: { eyebrow: "Clinic product evaluation", headings: ["Tell us about your clinic", "Choose the workflow to review", "Agree on a useful next step"], questions: ["What should I include in my request?", "Do I need to share patient information?", "What happens after I submit?"], cta: { label: "Request a conversation", path: "/contact" }, secondary: { label: "Explore the sandbox", path: "/sandbox" }, note: "Use business context only; do not include patient information. Product access, pilot scope, and availability are confirmed separately." },
};

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

function relatedLinks(family: Family): GrowthPage["links"] {
  if (family === "resource") return [{ label: "All guides", path: "/resources/guides" }, { label: "Templates", path: "/resources/templates" }, { label: "Explore sandbox", path: "/sandbox" }];
  if (family === "solution") return [{ label: "All solutions", path: "/solutions" }, { label: "Platform", path: "/platform" }, { label: "Book a demo", path: "/book-demo" }];
  if (family === "security") return [{ label: "Security overview", path: "/security" }, { label: "Privacy policy", path: "/legal/privacy" }, { label: "Ask a question", path: "/contact" }];
  if (family === "integration") return [{ label: "Integrations", path: "/integrations" }, { label: "Platform", path: "/platform" }, { label: "Confirm availability", path: "/contact" }];
  if (family === "comparison") return [{ label: "Compare options", path: "/compare" }, { label: "Platform", path: "/platform" }, { label: "Book a demo", path: "/book-demo" }];
  if (family === "proof") return [{ label: "Customer stories", path: "/customers" }, { label: "Case studies", path: "/customers/case-studies" }, { label: "Book a demo", path: "/book-demo" }];
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
    sections: content.headings.map((heading, index) => ({ heading, body: paragraphs[index as 0 | 1 | 2] })),
    questions: content.questions.map((question, index) => ({ question, answer: faqAnswers[index as 0 | 1 | 2] })),
    links: relatedLinks(spec.family),
  };
}
