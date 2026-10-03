import { marketingPaths } from "./marketingPaths";
import { growthTour } from "./productWalkthroughs";
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
  medications: { label: "Medication coordination", purpose: "Medication coordination connects the patient’s questions and visit context with professional review, documentation, and any clinic-defined follow-up.", section: "Review and next steps" },
  memberships: { label: "Membership administration", purpose: "Membership care combines clear program terms with enrollment and the administrative work that continues throughout the relationship.", section: "Terms and member operations" },
  "online-booking": { label: "Online booking", purpose: "A booking journey moves from appointment request to clinic review, confirmation, and preparation for the visit.", section: "From request to confirmed visit" },
  "patient-intake": { label: "Patient intake", purpose: "A well-organized intake connects the clinic’s questions and review process to a patient’s first appointment.", section: "Before the first visit" },
  payments: { label: "Payment workflow", purpose: "Clear payment terms help patients understand the clinic’s process, while staff have a path for recording and resolving questions.", section: "Payment steps and questions" },
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
  consents: { label: "Consent workflow", purpose: "Consent materials are presented and reviewed as part of the clinic’s process, with a clear route for questions and completion records.", section: "Presentation, review, and recordkeeping" },
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

const overviewSteps: Record<string, readonly string[]> = {
  "Weight loss": ["Receive a program inquiry", "Collect and review intake information", "Schedule a clinician-led evaluation", "Document the clinic’s program decision", "Coordinate payment or membership steps", "Plan the next check-in"],
  "Behavioral health": ["Receive an inquiry for care", "Complete and review intake", "Schedule the first session", "Prepare the clinician’s visit context", "Document the session through clinician review", "Coordinate the agreed next contact"],
  "Primary care": ["Receive an appointment request", "Collect and review patient information", "Confirm the visit", "Prepare the care team’s context", "Document the visit and next action", "Coordinate follow-up"],
  "Direct primary care": ["Explain the clinic’s membership terms", "Respond to enrollment questions", "Record the clinic’s enrollment steps", "Coordinate a member visit", "Route member questions to the right team", "Plan administrative follow-through"],
  "Men’s health": ["Receive a private service inquiry", "Collect and review intake information", "Arrange clinician evaluation", "Document the clinic’s next step", "Coordinate program administration", "Plan follow-up with the care team"],
  "Hormone therapy": ["Receive a service inquiry", "Collect clinic-defined intake information", "Arrange clinician evaluation", "Document the professional review", "Coordinate clinic-defined monitoring tasks", "Plan the next follow-up"],
  Infusion: ["Receive a referral or appointment request", "Review clinic preparation requirements", "Coordinate appointment resources", "Confirm the visit with the patient", "Record the clinic’s visit workflow", "Route follow-up work to its owner"],
  Psychiatry: ["Receive a request for care", "Complete and review intake", "Schedule a clinician appointment", "Prepare relevant visit context", "Document the appointment through clinician review", "Coordinate the next agreed contact"],
  "Medical spa": ["Share service information", "Receive a booking request", "Complete clinic-required pre-visit steps", "Arrange clinician review where applicable", "Coordinate the appointment and payment steps", "Plan follow-up or a return visit"],
  "IV therapy": ["Receive a service inquiry", "Review clinic-defined preparation steps", "Coordinate appointment resources", "Confirm the visit", "Complete the clinic’s review and documentation steps", "Assign follow-up work"],
  Longevity: ["Receive a service inquiry", "Collect and review intake information", "Arrange professional evaluation", "Document the clinic-defined plan", "Coordinate appointments and related tasks", "Plan follow-up with the team"],
  "Physical therapy": ["Receive a referral or appointment request", "Complete and review intake", "Schedule a therapist-led evaluation", "Plan recurring visits with the patient", "Document the clinic’s next steps", "Coordinate progress review and follow-up"],
};

function childScenario(slug: string, label: string, specialty: Specialty): string {
  if (slug === "cash-pay") {
    return "A patient asks what a primary care visit costs and how to book. Front-desk staff share the clinic’s published service and payment terms, route payment-specific questions to the responsible administrator, and coordinate scheduling. The clinician receives the visit context; clinical questions stay with the care team. If a service or fee is unclear, staff confirm it with the clinic before setting expectations."
  ;
  }
  if (specialty.name === "Weight loss" && /inventory|purchasing|receiving|replenishment|lot|expiration|recall|forecasting|margin/.test(slug)) {
    return `A program coordinator preparing for a ${label.toLowerCase()} task spots a stock or supply question. The coordinator checks the clinic’s recorded information, routes discrepancies to the operations owner, and keeps any patient-specific treatment question with the authorized clinician.`;
  }
  if (specialty.name === "Weight loss" && /booking|scheduling|telehealth|appointment/.test(slug)) {
    return `A patient requests a ${label.toLowerCase()} appointment as part of a weight management program. The program coordinator checks the clinic’s scheduling requirements, confirms the appointment details with the patient, and routes care questions or incomplete intake to the appropriate reviewer before the next step.`;
  }
  if (specialty.name === "Weight loss" && /intake|portal|messaging|forms/.test(slug)) {
    return `A prospective patient shares information through the clinic’s ${label.toLowerCase()} process. The intake coordinator checks for missing items, routes care-related context to an authorized clinician, and follows up with the patient on incomplete administrative steps.`;
  }
  if (specialty.name === "Weight loss") {
    return `A prospective patient asks about ${label.toLowerCase()}. The intake coordinator records the request and shares the clinic’s published program information; an authorized clinician reviews care-related details; then the coordinator tracks scheduling, administrative questions, and the agreed next contact. Missing information returns to the patient or the staff member who can resolve it.`;
  }
  if (specialty.name === "Behavioral health" && /clinical-notes|clinical-documentation|ai-scribe|treatment-plans/.test(slug)) {
    return `After a behavioral health session, the treating professional reviews the visit context and documentation, corrects anything that needs attention, and determines the clinical next step. Practice staff coordinate an agreed follow-up; missing details return to the responsible author, and urgent concerns follow practice procedures.`;
  }
  if (specialty.name === "Behavioral health" && /scheduling|appointment|telehealth/.test(slug)) {
    return `A person requests a ${label.toLowerCase()} appointment. The scheduling coordinator checks the practice’s process, confirms the details with the person, and routes appointment changes or missing intake information to the right owner. The treating professional handles clinical review.`;
  }
  if (specialty.name === "Behavioral health" && /intake|forms|portal|messaging|communication/.test(slug)) {
    return `A person contacts the practice about ${label.toLowerCase()}. The intake or scheduling coordinator records the request, routes forms and relevant context to the assigned clinician for review, and follows up on missing information or appointment changes. Clinical assessment stays with the treating professional; urgent concerns follow the practice’s own procedures.`;
  }
  if (/inventory|purchasing|receiving|replenishment|lot|expiration|recall|forecasting|margin/.test(slug)) {
    return `A clinic manager notices a ${label.toLowerCase()} question during routine operations. The responsible staff member checks the clinic’s records, identifies who should review it, and routes any unresolved item for follow-up.`;
  }
  if (/scheduling|appointment|booking|telehealth|chair|resource/.test(slug)) {
    return `A patient requests a ${label.toLowerCase()} appointment. Front-desk staff review the request and clinic requirements, then coordinate confirmation with the patient and the relevant care or operations team.`;
  }
  if (/intake|forms|portal|messaging|communication/.test(slug)) {
    return `A patient submits information or a question through the clinic’s ${label.toLowerCase()} process. Staff review what arrived, identify missing details, and route the next step to the appropriate team member.`;
  }
  if (/lab|monitoring|progress/.test(slug)) {
    return `A result or progress item reaches the clinic for review. Staff route it to the designated professional, who determines any clinical interpretation or follow-up; operations staff coordinate the administrative next step.`;
  }
  if (/medication|glp|hormone|testosterone|trt|treatment-plan|ed-treatment|peptide/.test(slug)) {
    return `A patient asks about ${label.toLowerCase()} during an ongoing care journey. Clinic staff route the request and relevant context to an authorized clinician, who determines the clinical next step.`;
  }
  if (/billing|payment|subscription|membership|package|benefit|insurance|authorization/.test(slug)) {
    return `A patient or member has a ${label.toLowerCase()} question. Front-desk or billing staff review the clinic’s terms and available information, then route unresolved items to the responsible person.`;
  }
  return `A patient’s visit creates a ${label.toLowerCase()} task for the clinic. The team records who owns the next step, routes relevant context for professional review where needed, and follows up on open work.`;
}

function guideFor(specialty: Specialty, slug: string): { label: string; path: string } | null {
  if (specialty.name === "Weight loss") {
    if (/intake|forms|portal/.test(slug)) return { label: "Weight loss patient intake guide", path: "/resources/guides/weight-loss-patient-intake" };
    if (/glp|medication|prescrib|inventory|lot|replenish|forecast/.test(slug)) return { label: "GLP-1 clinic workflow guide", path: "/resources/guides/glp-1-clinic-workflow" };
    if (/telehealth|scheduling|booking/.test(slug)) return { label: "Telehealth workflow guide", path: "/resources/guides/telehealth-workflow" };
    if (/membership|subscription|payment/.test(slug)) return { label: "Clinic membership model guide", path: "/resources/guides/clinic-membership-model" };
    return { label: "Starting a weight loss clinic guide", path: "/resources/guides/start-a-weight-loss-clinic" };
  }
  if (specialty.name === "Behavioral health" && /telehealth|scheduling|appointment/.test(slug)) {
    return { label: "Telehealth workflow guide", path: "/resources/guides/telehealth-workflow" };
  }
  if (specialty.name === "Infusion") {
    if (/inventory|lot|expiration|recall|purchas|receiv|replenish|forecast/.test(slug)) {
      return { label: "Infusion inventory guide", path: "/resources/guides/infusion-inventory-management" };
    }
    if (/scheduling|chair|resource|nurse|appointment|recurring/.test(slug)) {
      return { label: "Infusion chair scheduling guide", path: "/resources/guides/infusion-chair-scheduling" };
    }
  }
  if (specialty.name === "Men’s health" && /trt|testosterone|intake/.test(slug)) {
    return { label: "Starting a TRT clinic guide", path: "/resources/guides/start-a-trt-clinic" };
  }
  if (specialty.name === "Direct primary care" && /membership|billing/.test(slug)) {
    return { label: "Clinic membership model guide", path: "/resources/guides/clinic-membership-model" };
  }
  if (/intake|forms|consent/.test(slug)) return { label: "Patient intake workflow guide", path: "/resources/guides/automate-patient-intake" };
  if (/telehealth|video/.test(slug)) return { label: "Telehealth workflow guide", path: "/resources/guides/telehealth-workflow" };
  if (/inventory|lot|expiration|recall|purchas|receiv|replenish|forecast/.test(slug)) return { label: "Medical inventory guide", path: "/resources/guides/medical-inventory-lot-tracking" };
  if (/membership|subscription|package/.test(slug)) return { label: "Clinic membership model guide", path: "/resources/guides/clinic-membership-model" };
  if (slug === "cash-pay") return { label: "Starting a cash-pay clinic guide", path: "/resources/guides/start-a-cash-pay-clinic" };
  return { label: "Clinic operations guides", path: "/resources/guides" };
}

function platformCapabilityFor(slug: string) {
  if (/ai-intake/.test(slug)) return "/ai/intake";
  if (/ai-scribe/.test(slug)) return "/ai/scribe";
  if (/telehealth|video/.test(slug)) return "/platform/telehealth";
  if (/scheduling|booking|appointment|chair|resource|nurse/.test(slug)) return "/platform/scheduling";
  if (/intake|forms|consent/.test(slug)) return "/platform/patient-intake";
  if (/inventory|lot|expiration|recall|purchas|receiv|replenish|stock|forecast/.test(slug)) return "/platform/inventory";
  if (/membership|subscription|package/.test(slug)) return "/platform/memberships";
  if (/billing|payment|invoice|margin|cash-pay|insurance|benefit|authorization/.test(slug)) return "/platform/billing";
  if (/lab/.test(slug)) return "/platform/labs";
  if (/progress|weight-tracking|report/.test(slug)) return "/platform/reporting";
  if (/medication|prescrib|glp-1|trt|testosterone|hormone/.test(slug)) return "/platform/medications";
  if (/documentation|note|treatment-plan/.test(slug)) return "/platform/clinical-documentation";
  if (/messaging|communication|follow-up/.test(slug)) return "/platform/messaging";
  if (/portal/.test(slug)) return "/platform/patient-portal";
  return "/platform/workflows";
}

function reviewBoundaryFor(slug: string) {
  if (/^ai-|scribe|avatar|voice/.test(slug)) return "Ask which information the current feature can organize or draft, where the original source remains visible, and who corrects or approves an output. No generated text should be treated as a clinical decision or sent communication without the required human review.";
  if (/scheduling|booking|appointment|chair|resource|nurse|telehealth/.test(slug)) return "Inspect which availability and appointment states the current product displays, which confirmation steps still belong to staff, and how conflicts or failed remote visits return to a named owner. Clinic scheduling and care policies remain with the practice.";
  if (/inventory|lot|expiration|recall|purchas|receiv|replenish|stock|forecast/.test(slug)) return "Separate recorded stock and planning views from physical counts, supplier confirmations, and clinical treatment decisions. Ask who reconciles discrepancies, approves a purchase, and responds when an item is unavailable or recalled.";
  if (/billing|payment|invoice|membership|subscription|package|margin|cash-pay/.test(slug)) return "Distinguish a displayed price, invoice, or payment state from the clinic’s approved terms and any external processor result. Staff resolve exceptions and confirm financial commitments; care eligibility remains a clinical decision where applicable.";
  return "Use the walkthrough to identify which information the product records or prepares, which step requires a staff member to act, and how an exception is corrected. Professional interpretation, policy choices, and clinical decisions remain with the clinic’s authorized team.";
}

function makeBrief(path: string, specialty: Specialty, slug?: string): Partial<GrowthPage> {
  const topic = slug ? topicCopy[slug] : undefined;
  const guide = slug ? guideFor(specialty, slug) : null;
  const pageLabel = topic?.label ?? (slug ? titleCase(slug) : specialty.name);
  const focus = topic?.purpose ?? specialty.journey;
  const headline = slug
    ? `${pageLabel} for ${specialty.name.toLowerCase()} clinics.`
    : `${specialty.name} clinic workflows, connected around the patient journey.`;
  const lead = slug
    ? focus
    : specialty.journey;
  const sections = slug ? [
    { heading: `The ${pageLabel.toLowerCase()} challenge`, body: `${pageLabel} can involve several clinic handoffs. ${focus}` },
    { heading: "A starting scenario", body: childScenario(slug, pageLabel, specialty) },
    { heading: "What the staff team needs to see", body: slug === "cash-pay"
      ? "Front-desk staff need the clinic’s current service and payment terms, appointment request, and owner for any open question. Scheduling staff coordinate the visit; billing or administrative staff handle payment questions; the clinician sees relevant visit context. A product walkthrough can show which of these details are currently available."
      : specialty.name === "Weight loss"
        ? `The intake coordinator needs the patient’s request, completion status, next appointment, and owner of each open administrative task. The care team needs relevant context for professional review; supply questions belong with the operations owner. A product walkthrough can show the current screen and available fields.`
        : specialty.name === "Behavioral health"
          ? `The intake or scheduling coordinator needs request status, form completion, appointment details, and the owner of each follow-up. The treating professional receives the context needed for review, with sensitive or urgent concerns handled under the practice’s procedures. A product walkthrough can show the current screen and available fields.`
          : `For this ${specialty.name.toLowerCase()} workflow, staff need a clear view of the request or task, its owner, current status, and the next action. The exact screen and available fields should be confirmed in a product walkthrough.` },
    { heading: "Handoffs and professional review", body: slug === "cash-pay"
      ? "Front-desk staff explain published terms and coordinate booking; payment or fee exceptions go to the clinic’s designated administrator; care questions go to the clinician. The clinic defines its service, fee, and payment policies, and the clinician retains clinical decision-making."
      : specialty.name === "Weight loss"
        ? "The intake coordinator owns request completeness and scheduling follow-through. Payment or membership questions go to the clinic’s designated administrator; care-related questions and eligibility decisions go to an authorized clinician. Missing details return to the person who can resolve them."
        : specialty.name === "Behavioral health"
          ? "The intake coordinator owns form and request follow-through; scheduling changes go to the scheduling owner; clinical context goes to the treating professional. Incomplete information returns to the patient or intake staff, while urgent concerns follow the practice’s established procedures."
          : `Front-desk or operations staff coordinate the administrative handoff; the care team handles professional review where appropriate. Clinical interpretation and care decisions remain with authorized clinicians, and unresolved exceptions return to the clinic’s chosen owner.` },
    { heading: "Assisted steps and staff decisions", body: reviewBoundaryFor(slug) },
  ] : [
    { heading: "Operating model", body: `${specialty.audience} Each clinic defines its own services, staff roles, policies, and operating terms.` },
    { heading: "Patient journey", body: specialty.journey },
    { heading: "Team handoffs", body: `Patient-facing staff, the care team, and clinic operations each have a role in the ${specialty.name.toLowerCase()} journey. Clear ownership helps requests, visit preparation, and follow-up move to the right person while preserving professional responsibilities.` },
    { heading: "Key workflows", body: specialty.operations },
  ];
  const currentOverview: Record<
    string,
    {
      headline: string;
      lead: string;
      steps: string[];
      sections: { heading: string; body: string }[];
    }
  > = {
    "Weight loss": {
      headline: "Give every follow-up a clear next step.",
      lead: "Bring intake, recorded plans, program terms, and follow-up work into one clinic workspace. Start with the shared tools behind an ongoing weight management program.",
      steps: [
        "Review the intake",
        "Read the recorded plan",
        "Assign the next follow-up",
      ],
      sections: [
        {
          heading: "A program needs more than a calendar",
          body: "Intake prepares the visit. Care plans keep documented intent visible. Follow-up work gives the next action a due date and responsible staff member. Memberships can describe your published program terms when that model fits.",
        },
        {
          heading: "See the shared foundation",
          body: "The walkthrough uses real intake, plan, and follow-up screens from the primary care demo. Dedicated weight trends, GLP-1 protocols, and dose decisions are outside the proof shown here; map those requirements in a focused clinic walkthrough.",
        },
      ],
    },
    "Behavioral health": {
      headline: "Keep the work around each session organized.",
      lead: "Reserve session time, find the team's open work, and make the next contact clear. Explore the shared operational tools around relationship-based care.",
      steps: [
        "Reserve the session",
        "Find the team task",
        "Record the next contact",
      ],
      sections: [
        {
          heading: "Continuity starts with a named next action",
          body: "Scheduling holds the time, clinician, and room. Patient Flow keeps open source tasks and their owners visible. Encounter follow-up records the next contact, due date, and responsible staff member.",
        },
        {
          heading: "Map specialty requirements explicitly",
          body: "These captures show shared scheduling and follow-up tools. They do not demonstrate protected psychotherapy notes, crisis response, or specialty assessment instruments. Review those requirements against your practice's workflow before choosing a system.",
        },
      ],
    },
    "Primary care": {
      headline: "Carry visit context into the next review.",
      lead: "Prepare the clinician handoff, read the encounter's recorded findings, and keep lab review visible. Follow the current primary care demo through the work around a visit.",
      steps: [
        "Prepare the handoff",
        "Review documented findings",
        "Open the lab review",
      ],
      sections: [
        {
          heading: "Keep review states readable",
          body: "Intake groups show their saved state. The clinician handoff lists remaining preparation. Chart findings distinguish positive, negative, and not reviewed. Lab receipt and clinical review remain separate steps.",
        },
        {
          heading: "Choose the next action with its source in view",
          body: "The tour uses separate sample records to show handoff, documentation, and a lab-review form before submission. Cash billing and membership tools can support the clinic's selected payment model alongside that visit work.",
        },
      ],
    },
  };
  const overview = !slug ? currentOverview[specialty.name] : undefined;
  const objections = slug ? [
    { question: `How does ${pageLabel.toLowerCase()} fit our ${specialty.name.toLowerCase()} process?`, answer: `Start with your current steps, staff roles, and exceptions. ${focus} The walkthrough should confirm fit against your process rather than assume one standard workflow.` },
    { question: "What should our team bring to a walkthrough?", answer: "Bring a real clinic scenario, the people who own each step, and an exception that changes the usual path." },
    { question: "Does this replace professional review or our existing system?", answer: "No. The clinic retains responsibility for professional review and operating decisions. Compare each required function with your existing systems and confirm migration or integration scope before making a change." },
  ] : [
    { question: `Who is this ${specialty.name.toLowerCase()} workflow for?`, answer: `It is intended for ${specialty.buyer}. The page is a starting point for discussing fit; each clinic should map its own roles and process.` },
    { question: "Can we see how our current process would fit?", answer: specialty.offer },
    { question: "Does the software make clinical or eligibility decisions?", answer: "Clinical assessments, eligibility, and treatment decisions remain with the clinic’s appropriately authorized professionals. Confirm the product’s current role and limits during evaluation." },
  ];
  return {
    path,
    eyebrow: slug ? `Workflow for ${specialty.name.toLowerCase()} clinics` : `For ${specialty.name.toLowerCase()} practices`,
    headline: overview?.headline ?? headline,
    lead: overview?.lead ?? lead,
    ...(slug ? {} : { steps: overview?.steps ?? overviewSteps[specialty.name] }),
    audience: specialty.audience,
    note: "",
    searchIntent: slug ? `${pageLabel.toLowerCase()} software evaluation for ${specialty.name.toLowerCase()} clinics` : `${specialty.name.toLowerCase()} clinic software and workflow evaluation`,
    funnel: slug ? "Evaluation: explain one clinic workflow, then invite a product walkthrough." : "Awareness to evaluation: understand specialty fit, then request a workflow walkthrough.",
    visualBrief: `Future visual: a real, approved product screen or clearly labeled schematic showing the ${pageLabel.toLowerCase()} workflow for a ${specialty.name.toLowerCase()} clinic. Annotate the relevant handoff, staff role, and next action. Use synthetic records in demo imagery; do not imply unavailable features.`,
    primaryCta: { label: "Try the demo", path: "/demo" },
    secondaryCta: growthTour(path)
      ? { label: "Explore the steps", path: "#product-walkthrough" }
      : { label: "Request a walkthrough", path: "/book-demo" },
    sections: overview?.sections ?? sections,
    questions: objections,
    links: [
      ...(slug ? [{ label: `${specialty.name} overview`, path: Object.keys(specialties).find((candidate) => path.startsWith(`${candidate}/`)) ?? path }] : []),
      ...(slug ? [{ label: "Shared platform capability", path: platformCapabilityFor(slug) }] : []),
      ...(guide ? [guide] : []),
      { label: "Explore the demo", path: "/demo" },
      { label: "Request a demo", path: "/book-demo" },
      ...(specialty.name === "Weight loss" && slug && /intake|forms|portal/.test(slug) ? [
        { label: "Weight loss intake form template", path: "/resources/templates/weight-loss-intake-form" },
      ] : []),
      ...(slug === "cash-pay" ? [
        { label: "Cash-pay clinic solution", path: "/solutions/cash-pay-clinics" },
        { label: "Starting a cash-pay clinic guide", path: "/resources/guides/start-a-cash-pay-clinic" },
        { label: "Direct primary care workflows", path: "/direct-primary-care" },
        { label: "Direct primary care billing", path: "/direct-primary-care/billing" },
        { label: "Direct primary care memberships", path: "/direct-primary-care/memberships" },
      ] : []),
      { label: "Platform overview", path: "/platform" },
      { label: "Related workflow resources", path: "/resources/guides" },
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
