import { marketingPaths } from "./marketingPaths";
import type { GrowthPage } from "./growthPageContent";

type Specialty = {
  name: string;
  buyer: string;
  audience: string;
  journey: string;
  operations: string;
  evaluation: string;
  offer: string;
};

const specialties: Record<string, Specialty> = {
  "/weight-loss": {
    name: "Weight loss",
    buyer: "weight loss clinic owners and program operators",
    audience: "Independent weight loss clinics coordinating intake, visits, program administration, and ongoing follow-up.",
    journey: "A weight management journey can connect initial inquiry and intake with clinician-led evaluation, a documented program decision, and planned follow-up. Eligibility and treatment decisions remain with the clinic’s authorized care team.",
    operations: "Appointments, patient questions, payment or membership steps, and the next check-in all contribute to the clinic’s ongoing work. Clear ownership helps the team see what is open without promising a particular outcome or cadence of care.",
    evaluation: "A product walkthrough can help determine whether the workflow fits the clinic’s program, staffing, and documentation needs, and which capabilities are currently available.",
    offer: "A workflow walkthrough using the clinic’s weight management journey as the agenda.",
  },
  "/behavioral-health": {
    name: "Behavioral health",
    buyer: "behavioral health practice owners and practice managers",
    audience: "Behavioral health teams coordinating intake, recurring visits, documentation, communication, and follow-through.",
    journey: "The path from inquiry and intake to a scheduled session, clinician review, and an agreed next contact gives the team a clear view of what comes next. Private context and care decisions remain with the treating professional.",
    operations: "Recurring appointments, forms, session preparation, documentation review, and follow-up are connected parts of practice operations. Clinical interpretation and crisis coverage remain outside the claims of this workflow overview.",
    evaluation: "A workflow review can clarify role boundaries, privacy requirements, and which functions are currently available for evaluation.",
    offer: "A focused walkthrough around the practice’s intake-to-follow-up handoffs.",
  },
  "/primary-care": {
    name: "Primary care",
    buyer: "primary care clinic owners and practice managers",
    audience: "Independent primary care teams organizing patient access, visits, and ongoing office work.",
    journey: "A routine primary care journey connects an appointment request and intake with the visit and its next documented action. Clinical review and decisions stay within the care team.",
    operations: "Scheduling, patient context, payments where applicable, and follow-up each play a role in the clinic’s operating model.",
    evaluation: "A product evaluation can compare the workflow with the clinic’s service model, staffing, and current systems while confirming feature availability.",
    offer: "A clinic workflow walkthrough tailored to the practice’s service and payment model.",
  },
  "/direct-primary-care": {
    name: "Direct primary care",
    buyer: "direct primary care owners and membership practice managers",
    audience: "Membership-based primary care practices explaining enrollment, access, visits, and ongoing member communication.",
    journey: "Membership terms, patient access, scheduled care, and staff follow-through shape the member experience. Each clinic sets its own terms and clinical availability.",
    operations: "Enrollment questions, recurring administrative work, visit coordination, and member follow-up are part of operating a membership practice. Membership software does not create or guarantee access to care.",
    evaluation: "A workflow review can compare the clinic’s published terms and staffing with the proposed process and clarify applicable obligations and current product scope.",
    offer: "A walkthrough of member onboarding and the clinic’s day-to-day operating handoffs.",
  },
  "/mens-health": {
    name: "Men’s health",
    buyer: "men’s health clinic owners and practice managers",
    audience: "Men’s health teams coordinating confidential intake, clinician review, services, and follow-up.",
    journey: "A private inquiry can lead into intake, a clinician-led evaluation, and the next agreed step. Treatment decisions remain with authorized clinicians.",
    operations: "Appointment coordination, documentation, program administration, and follow-up are key parts of a men’s health clinic’s operating workflow.",
    evaluation: "A product walkthrough can clarify privacy expectations, staff roles, and the current availability of relevant functions.",
    offer: "A workflow discussion shaped around the clinic’s services and patient journey.",
  },
  "/hormone-therapy": {
    name: "Hormone therapy",
    buyer: "hormone therapy clinic owners and practice managers",
    audience: "Clinics organizing intake, clinician review, monitoring workflows, and patient follow-up for hormone-related services.",
    journey: "The operational path from inquiry and intake to clinician evaluation and a clinic-defined monitoring plan keeps each step visible. Qualified clinicians remain responsible for clinical appropriateness, interpretation, and treatment decisions.",
    operations: "Appointments, documented tasks, results review, and follow-up connect the work of the team, with a responsible person identified at each step.",
    evaluation: "A product review can clarify which data, integrations, and workflow functions are available and appropriate for the clinic’s setting.",
    offer: "A product discussion focused on the clinic’s intake, review, and follow-up process.",
  },
  "/infusion": {
    name: "Infusion",
    buyer: "infusion clinic owners and operations leaders",
    audience: "Infusion teams coordinating patient appointments, staff, treatment resources, and operational follow-through.",
    journey: "An infusion visit can move from referral or request through scheduling and preparation to the clinic’s documented workflow and follow-up. Clinical protocols remain the clinic’s responsibility.",
    operations: "Chair and staff coordination, supply visibility, and administrative handoffs shape infusion operations. Product support and integrations depend on the deployment and need confirmation.",
    evaluation: "A guided evaluation can clarify resource constraints, responsibility boundaries, and the current status of each workflow.",
    offer: "A workflow walkthrough centered on scheduling and the clinic’s operational handoffs.",
  },
  "/psychiatry": {
    name: "Psychiatry",
    buyer: "psychiatry practice owners and practice managers",
    audience: "Psychiatry teams coordinating intake, appointments, clinician documentation, and follow-up.",
    journey: "The operational journey from a request for care through intake and a clinician-led appointment continues with documentation and the next agreed contact.",
    operations: "Recurring appointments, patient communication, and staff follow-up fit into the practice’s ongoing work while clinician judgment and privacy remain central.",
    evaluation: "A product discussion can clarify role access, privacy expectations, and availability before the practice chooses a workflow.",
    offer: "A focused review of the practice’s intake, appointment, and follow-up sequence.",
  },
  "/med-spa": {
    name: "Medical spa",
    buyer: "medical spa owners and practice managers",
    audience: "Medical spa teams coordinating service inquiries, appointments, consent steps, and repeat-visit administration.",
    journey: "A prospective client moves from service information and booking through the clinic’s pre-visit steps, clinician review where applicable, and follow-up.",
    operations: "Scheduling, packages or memberships, payments, and inventory each depend on the clinic’s own operating model. Point-of-sale and treatment capabilities require separate confirmation.",
    evaluation: "A product review can clarify workflow scope, staff responsibilities, and current availability before the clinic selects a system.",
    offer: "A walkthrough built around the clinic’s service and appointment flow.",
  },
  "/iv-therapy": {
    name: "IV therapy",
    buyer: "IV therapy clinic owners and practice managers",
    audience: "IV therapy teams organizing service inquiries, bookings, visit preparation, and repeat-visit operations.",
    journey: "The operational sequence from inquiry and booking to clinic-defined preparation, staff review, and follow-up gives the team a view of each handoff. Qualified professionals retain responsibility for clinical screening and treatment decisions.",
    operations: "Appointment resources, consents, packages, and supply questions each create handoffs that need to fit the clinic’s workflow and product scope.",
    evaluation: "A guided review can clarify which workflows are available and suitable for the clinic’s operating and regulatory context.",
    offer: "A product discussion about booking, preparation, and clinic follow-through.",
  },
  "/longevity": {
    name: "Longevity",
    buyer: "longevity clinic owners and practice managers",
    audience: "Longevity practices coordinating inquiries, clinician-led evaluations, planned services, and ongoing follow-up.",
    journey: "A longevity practice may coordinate intake, professional review, a clinic-defined plan, and scheduled follow-through. This workflow description makes no promise about health or longevity outcomes.",
    operations: "Staff coordination, appointments, results-related tasks, and membership administration are part of the practice’s operational workflow, separate from clinical claims.",
    evaluation: "A workflow review can address privacy, responsibility, data needs, and verified product availability before any process is applied to patient care.",
    offer: "A workflow walkthrough based on how the practice coordinates its services.",
  },
  "/physical-therapy": {
    name: "Physical therapy",
    buyer: "physical therapy clinic owners and practice managers",
    audience: "Physical therapy teams coordinating evaluation visits, recurring appointments, documentation, and progress follow-up.",
    journey: "The administrative journey from referral or inquiry to intake, a therapist-led evaluation, scheduled visits, and clinic-defined follow-up connects the steps around care.",
    operations: "Recurring scheduling, documentation tasks, patient communication, and progress review are part of the team’s process. This overview makes no claim about clinical measurement or outcomes.",
    evaluation: "A product walkthrough can clarify current workflow coverage, staff roles, and any integration requirements.",
    offer: "A focused walkthrough of the clinic’s appointment and follow-through workflow.",
  },
};

const topicCopy: Record<string, { label: string; purpose: string; section: string }> = {
  "ai-intake": { label: "AI assisted intake", purpose: "Intake information can be collected and organized for staff review, with privacy and human oversight central to the process.", section: "Assistance, review, and boundaries" },
  "ai-scribe": { label: "AI assisted documentation", purpose: "Documentation support belongs within a clinician-led review process, where notes can be checked and corrected before approval.", section: "Documentation review" },
  "cash-pay": { label: "Cash-pay primary care", purpose: "Cash-pay care starts with clear service and payment terms, followed by a straightforward path through inquiry, scheduling, intake, the visit, and follow-up.", section: "Service model and payment path" },
  "automated-workflows": { label: "Workflow automation", purpose: "Routine handoffs can be easier to follow when responsibilities, exceptions, and the next action are visible to the team.", section: "Handoffs and exceptions" },
  "follow-ups": { label: "Follow-up coordination", purpose: "After a visit, the next contact has an owner, a reason, and a clear place in the clinic’s ongoing work.", section: "Ownership after the visit" },
  "glp-1": { label: "GLP-1 workflow", purpose: "A GLP-1 program includes inquiry, clinician evaluation, documentation, clinic-defined care steps, and follow-up.", section: "Clinical review and operational steps" },
  "glp-1-inventory": { label: "GLP-1 inventory workflow", purpose: "Inventory planning brings recorded stock, purchasing responsibilities, and treatment-related coordination into the clinic’s operational picture.", section: "Supply visibility and responsibility" },
  "glp-1-workflows": { label: "GLP-1 care workflow", purpose: "Intake, clinician review, documented decisions, and planned follow-up form the operational path around GLP-1 care.", section: "Review, documentation, and follow-through" },
  labs: { label: "Lab coordination", purpose: "Lab coordination spans ordering, collection, result receipt, and review, with each handoff shaped by the clinic’s systems and responsibilities.", section: "Lab handoffs to verify" },
  "medication-management": { label: "Medication workflow", purpose: "Medication-related work connects review and documentation with the clinic’s follow-up process and the responsibilities of its care team.", section: "Medication responsibilities" },
  memberships: { label: "Membership administration", purpose: "Membership care combines clear program terms with enrollment and the administrative work that continues throughout the relationship.", section: "Terms and member operations" },
  "online-booking": { label: "Online booking", purpose: "A booking journey moves from appointment request to clinic review, confirmation, and preparation for the visit.", section: "From request to confirmed visit" },
  "patient-intake": { label: "Patient intake", purpose: "A well-organized intake connects the clinic’s questions and review process to a patient’s first appointment.", section: "Before the first visit" },
  payments: { label: "Payment workflow", purpose: "Clear payment terms help patients understand the clinic’s process, while staff have a path for recording and resolving questions.", section: "Payment steps and questions" },
  "progress-tracking": { label: "Progress review workflow", purpose: "Progress review brings selected information, the responsible reviewer, and the clinic’s next operational step together.", section: "Review cadence and next steps" },
  subscriptions: { label: "Recurring program administration", purpose: "Recurring programs pair clearly stated terms with the ongoing administrative work needed to support the relationship.", section: "Recurring terms and administration" },
  telehealth: { label: "Remote visit workflow", purpose: "A remote appointment connects scheduling and patient context with clinician documentation and the next agreed step.", section: "Before, during, and after a remote visit" },
  "telehealth-scheduling": { label: "Telehealth scheduling", purpose: "Remote visit coordination links the appointment request with clinic review, confirmation, patient context, and the next check-in.", section: "A remote visit in the program" },
  "weight-tracking": { label: "Weight tracking workflow", purpose: "Weight-related measures can be recorded, reviewed in context, and connected to the clinic’s follow-up process.", section: "Recorded measures and review" },
  "clinical-documentation": { label: "Clinical documentation", purpose: "Clinical documentation is part of the visit workflow, with clear responsibilities for preparation, professional review, and completion.", section: "Documentation and clinician review" },
  "clinical-notes": { label: "Clinical notes workflow", purpose: "A clinical note moves through preparation, clinician review, correction when needed, and finalization by the practice.", section: "A reviewed record" },
  "treatment-plans": { label: "Treatment plan workflow", purpose: "Clinicians document care plans while the team coordinates the approved next steps around each patient’s plan.", section: "Plan ownership and follow-through" },
  "recurring-appointments": { label: "Recurring appointment coordination", purpose: "Repeat visits require continuity across scheduling, changes, and visibility into what comes next.", section: "Continuity across visits" },
  "recurring-treatments": { label: "Recurring treatment coordination", purpose: "A series of visits brings scheduling changes and follow-up into view while the care team remains responsible for treatment decisions and protocols.", section: "Planning a treatment series" },
  scheduling: { label: "Scheduling workflow", purpose: "An appointment journey runs from request through confirmation and preparation, with a clear process for changes.", section: "Request, confirmation, and changes" },
  "patient-messaging": { label: "Patient messaging workflow", purpose: "Patient questions need a clear route to the right staff member and a visible path to response and follow-through.", section: "Message ownership and response" },
  messaging: { label: "Member communication workflow", purpose: "Member communications are easier to manage when requests have a clear reviewer, response owner, and next step.", section: "Communication and ownership" },
  billing: { label: "Billing workflow", purpose: "A clinic’s billing process includes clear terms, a way to track questions, and a path for resolving open items.", section: "Billing questions and handoffs" },
  intake: { label: "Intake workflow", purpose: "Intake brings patient information and staff review together before the visit begins.", section: "Information before the visit" },
  forms: { label: "Forms workflow", purpose: "Patient forms fit into the visit journey when completion, review, and missing or updated information have clear owners.", section: "Completion and review" },
  "patient-portal": { label: "Patient portal workflow", purpose: "Patient-facing access connects submitted information with staff review and follow-up throughout the clinic journey.", section: "Access, submission, and follow-up" },
  "chair-management": { label: "Chair and resource coordination", purpose: "Infusion visits depend on matching appointment timing with chair availability, staffing, and changes to the day’s schedule.", section: "Resource conflicts and ownership" },
  "chair-scheduling": { label: "Chair scheduling", purpose: "Chair scheduling connects a visit request with resource availability and the clinic’s process for confirming or changing an appointment.", section: "Resource-aware scheduling" },
  "appointment-series": { label: "Appointment series coordination", purpose: "A planned series makes upcoming visits, schedule changes, and unresolved coordination work easier for the team to see.", section: "Planning a series" },
  "infusion-scheduling": { label: "Infusion appointment coordination", purpose: "Infusion appointments bring together the requested visit, clinic resources, and the team’s confirmation process.", section: "Request, resources, and confirmation" },
  "nurse-scheduling": { label: "Staff scheduling workflow", purpose: "Staff availability is one part of planning appointments, with the clinic retaining responsibility for staffing rules and clinical assignments.", section: "Staff availability and handoffs" },
  "resource-scheduling": { label: "Resource scheduling workflow", purpose: "Each visit may depend on specific resources, and schedule changes can create conflicts the team needs to resolve.", section: "Resources and exceptions" },
  "benefits-verification": { label: "Benefits review workflow", purpose: "Coverage review includes checking available information, recording what is known, and following up on unanswered questions.", section: "Review responsibilities" },
  "insurance-verification": { label: "Insurance review workflow", purpose: "Insurance review connects the clinic’s verification process with clear ownership for open coverage questions.", section: "Coverage and unresolved questions" },
  "prior-authorization": { label: "Authorization workflow", purpose: "Authorization work has a clear owner, a record of status, and a path for following up on outstanding steps.", section: "Submission ownership and status" },
  "pharmacy-billing": { label: "Pharmacy and billing handoffs", purpose: "Pharmacy, clinic, and billing steps involve distinct responsibilities that need to be clear across the patient journey.", section: "Parties and data flow to confirm" },
  inventory: { label: "Inventory workflow", purpose: "Inventory operations include recorded stock, review of discrepancies, and ownership of the next action.", section: "Recorded stock and open work" },
  "medication-inventory": { label: "Medication inventory workflow", purpose: "Medication stock records connect handling roles with review and reconciliation under the clinic’s procedures.", section: "Records, roles, and reconciliation" },
  "treatment-inventory-planning": { label: "Treatment supply planning", purpose: "Supply planning relates upcoming appointments to stock review and the clinic’s purchasing decisions.", section: "Planning inputs and human review" },
  "inventory-forecasting": { label: "Inventory planning and forecasting", purpose: "Inventory planning depends on the information, assumptions, and review process a clinic uses to anticipate future needs.", section: "Inputs, assumptions, and review" },
  "lot-tracking": { label: "Lot record workflow", purpose: "Lot records help the team see the details it has recorded and who is responsible for reviewing them.", section: "Traceability responsibilities" },
  "expiration-tracking": { label: "Expiration review workflow", purpose: "Expiration review brings recorded dates, staff ownership, and exceptions into the clinic’s supply process.", section: "Review and exception handling" },
  "recall-management": { label: "Recall response workflow", purpose: "A recall response involves receiving a notice, identifying the reviewer, and documenting the clinic’s follow-up.", section: "Notice, review, and documented action" },
  receiving: { label: "Receiving workflow", purpose: "Receiving connects delivery checks with discrepancy records and the clinic’s process for making supplies available.", section: "Delivery checks and discrepancies" },
  purchasing: { label: "Purchasing workflow", purpose: "Purchasing connects a supply request with approval responsibilities and follow-through when an order arrives.", section: "Request, approval, and receipt" },
  replenishment: { label: "Replenishment workflow", purpose: "Replenishment starts with a supply need, continues through review, and ends with a clinic-owned purchasing decision.", section: "Need identification and approval" },
  "margin-estimation": { label: "Cost and margin review", purpose: "Cost review makes the clinic’s assumptions visible as it considers the financial side of a service or supply decision.", section: "Assumptions and financial review" },
  reporting: { label: "Reporting workflow", purpose: "Operational reporting starts with the clinic’s questions and the source information it uses to review its work.", section: "Questions, data, and interpretation" },
  "consents": { label: "Consent workflow", purpose: "Consent materials are presented and reviewed as part of the clinic’s process, with a clear route for questions and completion records.", section: "Presentation, review, and recordkeeping" },
  packages: { label: "Package administration", purpose: "Package terms shape how patients book services and how the clinic coordinates use and follow-up.", section: "Terms, use, and follow-up" },
  "ed-treatment": { label: "Confidential service inquiry workflow", purpose: "A private service inquiry deserves respectful handling and a clear path to clinician-led evaluation.", section: "Privacy, review, and next steps" },
  "hormone-management": { label: "Hormone care coordination", purpose: "Hormone care coordination connects intake and clinician evaluation with documentation and follow-up responsibilities.", section: "Clinical ownership and operations" },
  "testosterone-management": { label: "Testosterone care workflow", purpose: "The clinic’s process can connect intake and clinician-led evaluation with documentation and its own monitoring plan.", section: "Evaluation and follow-through" },
  trt: { label: "TRT clinic workflow", purpose: "TRT clinic operations connect inquiries and intake with clinician evaluation and the clinic’s follow-up process.", section: "A clinician-led process" },
  "trt-workflows": { label: "TRT program operations", purpose: "TRT program administration involves intake, appointments, documentation, and follow-up, with prescribing decisions remaining with authorized clinicians.", section: "Program handoffs and roles" },
  "lab-monitoring": { label: "Lab review workflow", purpose: "Lab-related results create review tasks that need to reach the right person on the clinic team.", section: "Result ownership" },
  "hormone-therapy": { label: "Hormone therapy workflow", purpose: "Hormone therapy operations connect intake and clinician evaluation with documentation and clinic-defined follow-up.", section: "Care team review" },
  "peptide-management": { label: "Service review workflow", purpose: "Service review connects intake and professional evaluation with documentation and the clinic’s follow-up process.", section: "Evaluation and responsibility" },
  documentation: { label: "Documentation workflow", purpose: "Visit documentation moves through preparation, review, correction when needed, and completion by the responsible professional.", section: "Preparation and review" },
  "progress-tracking": { label: "Progress review workflow", purpose: "Progress information can be reviewed in context and connected to the clinic’s next follow-up step.", section: "Information and clinical review" },
};

const childrenBySpecialty: Record<string, readonly string[]> = {
  "/weight-loss": ["ai-intake", "automated-workflows", "follow-ups", "glp-1", "glp-1-inventory", "glp-1-workflows", "lab-monitoring", "labs", "medication-management", "memberships", "online-booking", "patient-intake", "patient-portal", "payments", "progress-tracking", "subscriptions", "telehealth", "telehealth-scheduling", "weight-tracking"],
  "/behavioral-health": ["ai-intake", "ai-scribe", "billing", "clinical-notes", "forms", "intake", "patient-messaging", "patient-portal", "recurring-appointments", "scheduling", "telehealth", "treatment-plans"],
  "/primary-care": ["ai-intake", "cash-pay", "follow-ups", "intake", "labs", "medications", "memberships", "patient-portal", "scheduling", "telehealth"],
  "/direct-primary-care": ["billing", "intake", "memberships", "messaging", "patient-portal", "scheduling", "telehealth"],
  "/mens-health": ["ai-intake", "ed-treatment", "follow-ups", "hormone-management", "lab-monitoring", "labs", "medication-management", "memberships", "patient-portal", "telehealth", "testosterone-management", "trt", "trt-workflows"],
  "/hormone-therapy": ["ai-intake", "follow-ups", "lab-monitoring", "labs", "medication-management", "memberships", "patient-portal", "telehealth"],
  "/infusion": ["appointment-series", "benefits-verification", "chair-management", "chair-scheduling", "clinical-documentation", "expiration-tracking", "infusion-scheduling", "insurance-verification", "inventory", "inventory-forecasting", "lot-tracking", "margin-estimation", "medication-inventory", "nurse-scheduling", "patient-portal", "pharmacy-billing", "prior-authorization", "purchasing", "recall-management", "receiving", "recurring-treatments", "replenishment", "reporting", "resource-scheduling", "treatment-inventory-planning", "treatment-plans"],
  "/psychiatry": ["ai-intake", "clinical-documentation", "follow-ups", "intake", "labs", "medication-management", "patient-portal", "telehealth"],
  "/med-spa": ["consents", "forms", "inventory", "memberships", "online-booking", "packages", "patient-portal", "payments", "scheduling"],
  "/iv-therapy": ["chair-scheduling", "consents", "inventory", "lot-tracking", "memberships", "online-booking", "packages", "patient-portal"],
  "/longevity": ["ai-intake", "follow-ups", "hormone-management", "lab-monitoring", "labs", "memberships", "peptide-management", "telehealth"],
  "/physical-therapy": ["documentation", "intake", "patient-portal", "progress-tracking", "recurring-appointments", "scheduling", "treatment-plans"],
};

const titleCase = (value: string) => value.split("-").map((part) => part.toUpperCase() === "AI" || part.toUpperCase() === "IV" || part.toUpperCase() === "GLP" || part.toUpperCase() === "TRT" ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

function makeBrief(path: string, specialty: Specialty, slug?: string): Partial<GrowthPage> {
  const topic = slug ? topicCopy[slug] : undefined;
  const pageLabel = topic?.label ?? (slug ? titleCase(slug) : specialty.name);
  const focus = topic?.purpose ?? specialty.journey;
  const headline = slug
    ? `${pageLabel} for ${specialty.name.toLowerCase()} clinics.`
    : `${specialty.name} clinic workflows, connected around the patient journey.`;
  const lead = slug
    ? `${focus} See how this step fits the wider ${specialty.name.toLowerCase()} workflow, then confirm current product availability with the team.`
    : specialty.journey;
  const sections = slug ? [
    { heading: topic?.section ?? `The ${pageLabel.toLowerCase()} handoff`, body: focus },
    { heading: "What the team needs to see", body: `The ${specialty.name.toLowerCase()} team needs the relevant information, role, and recorded status at this step. Review ownership, exceptions, and the next action together during a product walkthrough.` },
    { heading: "Fit with the wider clinic workflow", body: `${specialty.operations} Use the walkthrough to confirm how this page’s workflow connects with intake, scheduling, the visit, and follow-up for this clinic.` },
  ] : [
    { heading: "Start with the patient journey", body: specialty.journey },
    { heading: "Coordinate the clinic’s work", body: specialty.operations },
    { heading: "Evaluate fit and current scope", body: specialty.evaluation },
  ];
  const objections = slug ? [
    { question: `How does ${pageLabel.toLowerCase()} fit our ${specialty.name.toLowerCase()} process?`, answer: `Start with your current steps, staff roles, and exceptions. ${focus} The walkthrough should confirm fit against your process rather than assume one standard workflow.` },
    { question: "Is this function available today?", answer: "Availability can depend on the specific workflow and deployment. Confirm the current product scope and any dependencies during evaluation." },
    { question: "Does this replace professional review or our existing system?", answer: "No. The clinic retains responsibility for professional review and operating decisions. Compare each required function with your existing systems and confirm migration or integration scope before making a change." },
  ] : [
    { question: `Who is this ${specialty.name.toLowerCase()} workflow for?`, answer: `It is intended for ${specialty.buyer}. The page is a starting point for discussing fit; each clinic should map its own roles and process.` },
    { question: "Can we see how our current process would fit?", answer: specialty.offer },
    { question: "Does the software make clinical or eligibility decisions?", answer: "Clinical assessments, eligibility, and treatment decisions remain with the clinic’s appropriately authorized professionals. Confirm the product’s current role and limits during evaluation." },
  ];
  return {
    path,
    eyebrow: slug ? `Workflow for ${specialty.name.toLowerCase()} clinics` : `For ${specialty.name.toLowerCase()} practices`,
    headline,
    lead,
    audience: specialty.audience,
    note: "The guided demo uses synthetic records. Confirm current product availability and the workflow details that matter to your clinic before making a decision.",
    searchIntent: slug ? `${pageLabel.toLowerCase()} software evaluation for ${specialty.name.toLowerCase()} clinics` : `${specialty.name.toLowerCase()} clinic software and workflow evaluation`,
    funnel: slug ? "Evaluation: explain one clinic workflow, then invite a product walkthrough." : "Awareness to evaluation: understand specialty fit, then request a workflow walkthrough.",
    visualBrief: `Future visual: a real, approved product screen or clearly labeled schematic showing the ${pageLabel.toLowerCase()} workflow for a ${specialty.name.toLowerCase()} clinic. Annotate the relevant handoff, staff role, and next action. Use synthetic records in demo imagery; do not imply unavailable features.`,
    primaryCta: { label: "Book a Demo", path: "/book-demo" },
    secondaryCta: { label: "Explore the Sandbox", path: "/sandbox" },
    sections,
    questions: objections,
    links: [
      ...(slug ? [{ label: `${specialty.name} overview`, path: Object.keys(specialties).find((candidate) => path.startsWith(`${candidate}/`)) ?? path }] : []),
      { label: "Platform overview", path: "/platform" },
      { label: "Book a demo", path: "/book-demo" },
      { label: "Related workflow resources", path: "/resources" },
    ],
  };
}

/** Returns a content-first wireframe brief for every planned specialty route. */
export function getSpecialtyPageBrief(path: string): Partial<GrowthPage> | null {
  const normalized = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const specialtyRoot = Object.keys(specialties).find((root) => normalized === root || normalized.startsWith(`${root}/`));
  if (!specialtyRoot || !marketingPaths.some((route) => route.path === normalized)) return null;
  const specialty = specialties[specialtyRoot];
  if (normalized === specialtyRoot) return makeBrief(normalized, specialty);
  const slug = normalized.slice(specialtyRoot.length + 1);
  if (!(childrenBySpecialty[specialtyRoot] ?? []).includes(slug)) return null;
  return makeBrief(normalized, specialty, slug);
}
