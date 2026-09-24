import { marketingPaths } from "./marketingPaths";
import { getEditorialPageBrief } from "./EditorialPageBriefs";
import { getPlatformAiPageBrief } from "./PlatformAiPageBriefs";
import { getSpecialtyPageBrief } from "./SpecialtyPageBriefs";

export type GrowthPage = {
  path: string;
  group: string;
  title: string;
  eyebrow: string;
  headline: string;
  lead: string;
  steps: readonly string[];
  image?: string;
  imageAlt?: string;
  imageCaption?: string;
  gallery?: readonly { image: string; imageAlt: string; imageCaption: string }[];
  note: string;
  audience: string;
  searchIntent: string;
  canonicalPath: string;
  funnel: string;
  visualBrief: string;
  primaryCta: { label: string; path: string };
  secondaryCta: { label: string; path: string };
  sections: readonly { heading: string; body: string }[];
  questions: readonly { question: string; answer: string }[];
  links: { label: string; path: string }[];
  children: { label: string; path: string }[];
};

const specialtyNames: Record<string, string> = {
  "weight-loss": "weight loss",
  "weight-loss-clinics": "weight loss",
  "behavioral-health": "behavioral health",
  "primary-care": "primary care",
  "direct-primary-care": "direct primary care",
  "mens-health": "men’s health",
  "hormone-therapy": "hormone therapy",
  infusion: "infusion",
  psychiatry: "psychiatry",
  "med-spa": "medical spa",
  "iv-therapy": "IV therapy",
  longevity: "longevity",
  "physical-therapy": "physical therapy",
};

const topics: { test: RegExp; title: string; promise: string; steps: [string, string, string]; image?: string; alt?: string; caption?: string }[] = [
  { test: /chair|resource|nurse|appointment|scheduling|booking/, title: "Scheduling", promise: "Plan appointments, people, and the resources a visit needs in one operational sequence.", steps: ["Set the visit type and availability", "Review the calendar with staff and resource context", "Carry changes into the day-of-visit view"], image: "/marketing/scheduling-month.png", alt: "Meta Clinic month schedule in a synthetic demo clinic.", caption: "Scheduling view from the synthetic demo" },
  { test: /intake|interview|forms|consent/, title: "Intake", promise: "Give the team the right information to review before a visit begins.", steps: ["Invite the patient to complete the relevant questions", "Review submitted answers and missing items", "Bring that context into the visit"], image: "/marketing/primary-care-patients-app.png", alt: "Meta Clinic patient directory containing synthetic demonstration records.", caption: "Patient context in the demo clinic" },
  { test: /telehealth|video/, title: "Telehealth", promise: "Connect a remote appointment to scheduling, chart context, and follow-through.", steps: ["Schedule the remote visit", "Open the encounter with the relevant patient context", "Record the next action after the call"], image: "/marketing/scheduling-telehealth.png", alt: "Meta Clinic synthetic telehealth scheduling view.", caption: "Remote visit context in the demo" },
  { test: /glp-1|trt|testosterone|peptide|hormone|medication|pharmacy|prescrib/, title: "Medication workflow", promise: "Keep medication decisions, recorded work, and supply context connected for team review.", steps: ["Review the patient and treatment context", "Record the authorized medication step", "Check supply and follow-up work"], image: "/marketing/inventory-app.png", alt: "Meta Clinic inventory view showing synthetic stock records.", caption: "Inventory view from the synthetic demo" },
  { test: /inventory|lot|expir|recall|purchas|receiv|replenish|forecast|stock/, title: "Inventory", promise: "Make stock, lots, and the work around replenishment easier to inspect.", steps: ["Find the item and its recorded stock", "Review lots and pending movement", "Plan the next purchase or treatment need"], image: "/marketing/inventory-app.png", alt: "Meta Clinic inventory view with synthetic items.", caption: "Stock visibility in the demo clinic" },
  { test: /membership|subscription|package/, title: "Memberships", promise: "Keep program offers, access, and payment context close to the patient journey.", steps: ["Present the program terms", "Record the enrollment choice", "Connect the ongoing service and billing work"], image: "/marketing/memberships-app.png", alt: "Meta Clinic membership configuration screen using synthetic data.", caption: "Membership setup in the demo" },
  { test: /billing|payment|invoice|margin|cash-pay|insurance|benefit|authorization/, title: "Financial workflow", promise: "Make the financial steps of a visit visible without losing clinical context.", steps: ["Clarify the service and payment model", "Review charges, payments, or required checks", "Resolve open work before closing the loop"], image: "/marketing/cash-billing-app.png", alt: "Meta Clinic billing summary from a synthetic demo clinic.", caption: "Billing activity in the synthetic demo" },
  { test: /lab|progress|weight-tracking|reporting/, title: "Progress and results", promise: "Bring recorded results and next review work into one patient context.", steps: ["Collect the recorded measure or result", "Review it against the visit context", "Plan follow-up or additional work"], image: "/marketing/tracking-board-app.png", alt: "Meta Clinic Tracking Board showing synthetic operational work.", caption: "Operational follow-through in the demo" },
  { test: /follow-up|notification|messaging|communication|email|sms|reminder/, title: "Follow-up", promise: "Keep the next patient contact and the team’s open work visible after a visit.", steps: ["Record the next action", "Assign or schedule the follow-through", "Check what was completed and what remains open"], image: "/marketing/tracking-board-app.png", alt: "Meta Clinic Tracking Board showing synthetic clinic tasks.", caption: "Open work in the synthetic demo" },
  { test: /clinical|documentation|note|scribe|treatment-plan|procedure/, title: "Clinical documentation", promise: "Keep documentation close to the visit and visible for the next authorized step.", steps: ["Open the encounter context", "Record and review the care work", "Carry approved next steps into follow-up"], image: "/marketing/primary-care-patients-app.png", alt: "Meta Clinic patient directory from a synthetic demonstration clinic.", caption: "Patient record entry point in the demo" },
  { test: /portal|self-service|patient-management/, title: "Patient access", promise: "Give patients a clearer way to complete their part of the journey and give staff context for review.", steps: ["Start from a patient request", "Collect or display the permitted information", "Bring the outcome into staff workflow"], image: "/marketing/primary-care-patients-app.png", alt: "Meta Clinic patient directory in a synthetic demonstration clinic.", caption: "Patient record entry point in the demo" },
  { test: /role|permission|audit|access-control|encryption|data-protection|backup|privacy|hipaa|baa/, title: "Security and governance", promise: "Give decision makers a precise account of controls, responsibilities, and review questions.", steps: ["Identify the data and users involved", "Review documented controls and responsibilities", "Confirm the specific deployment and agreement scope"] },
  { test: /multi-location|scale|workflow|automate|launch|replace/, title: "Operations", promise: "Trace the handoffs between front desk, care team, and back office work.", steps: ["Map the current operating sequence", "Find the disconnected handoffs", "Evaluate the matching Meta Clinic workflow"], image: "/marketing/tracking-board-app.png", alt: "Meta Clinic Tracking Board with synthetic clinic activity.", caption: "Shared operational view in the demo" },
];

const focus: Record<string, Partial<GrowthPage>> = {
  "/platform": {
    eyebrow: "One connected platform",
    headline: "See the full clinic day in one place.",
    lead: "Explore how patient access, scheduling, the visit, payments, inventory, and follow-up connect without losing the team’s view of open work.",
    steps: ["Begin with the patient journey", "Work from a shared clinic view", "Carry open tasks through follow-up"],
  },
  "/ai": {
    eyebrow: "AI in clinic workflow",
    headline: "Put AI assistance where review still belongs to your team.",
    lead: "Evaluate assisted intake, documentation, and summaries in the context of real clinic work. Staff and clinicians remain responsible for review and decisions.",
  },
  "/security": {
    eyebrow: "Security review",
    headline: "Ask clear questions about data, access, and responsibility.",
    lead: "Use this section to review the controls, agreements, and deployment details that apply to your evaluation. Specific representations require current evidence.",
  },
  "/pricing": {
    eyebrow: "Pricing conversation",
    headline: "Choose the operating model before the quote.",
    lead: "Tell us your clinic type, locations, staff, and workflows. We will discuss scope and pricing directly rather than publish a number without a defined offer.",
    steps: ["Define your clinic model", "Select the workflows to evaluate", "Review the proposed scope and price"],
    audience: "Clinic owners and practice leaders evaluating operating cost",
    searchIntent: "Meta Clinic pricing and software evaluation",
    note: "Pricing depends on an agreed scope. No public package, included capability, discount, or savings figure is represented on this page.",
    primaryCta: { label: "Request a pricing conversation", path: "/book-demo" },
    secondaryCta: { label: "Explore the demo", path: "/demo" },
    sections: [
      { heading: "Describe the clinic", body: "Share your specialty, locations, team size, patient access model, and the systems currently in use. These details set the context for a useful scope discussion." },
      { heading: "Choose the workflows", body: "Name the first patient and staff journeys you need to evaluate, such as intake, scheduling, visits, payment, inventory, or follow-up. Confirm which capabilities are available for the proposed environment." },
      { heading: "Include implementation work", body: "Ask which setup, data preparation, training, and clinic-side decisions would be needed before a pilot or launch. Identify which work belongs to each party." },
      { heading: "Account for connected services", body: "List payment, messaging, telehealth, prescribing, or other external services your clinic expects to use. Verify each current connection, agreement, and separate cost before treating it as included." },
      { heading: "Review the full proposal", body: "Ask for the proposed product scope, implementation work, support, dependencies, agreement terms, and total commercial commitment in writing before deciding." },
    ],
    questions: [
      { question: "Is a public price available?", answer: "A price is discussed after the clinic model and proposed scope are understood. This page does not publish a standard package or rate." },
      { question: "What should be included in a quote?", answer: "Review the named capabilities, access, implementation responsibilities, support, external service costs, terms, and any limits that apply." },
      { question: "Can we see the product first?", answer: "Use the synthetic demo to inspect the workflow, then request a focused walkthrough of the functions your clinic needs." },
    ],
    links: [{ label: "Platform overview", path: "/platform" }, { label: "Weight loss clinics", path: "/weight-loss" }, { label: "Behavioral health practices", path: "/behavioral-health" }, { label: "Cash-pay clinics", path: "/solutions/cash-pay-clinics" }],
  },
  "/sandbox": {
    eyebrow: "Guided product access",
    headline: "Explore the clinic workflow for yourself.",
    lead: "Open a guided demonstration with synthetic records and follow patient access, the visit, and operational follow-through.",
  },
  "/book-demo": {
    eyebrow: "Product walkthrough",
    headline: "See Meta Clinic through your clinic’s workflow.",
    lead: "Tell us which specialty and operating problem matter most. We will use that context to shape the conversation and product walkthrough.",
  },
  "/request-demo": {
    eyebrow: "Product walkthrough",
    headline: "Request a focused Meta Clinic demo.",
    lead: "Share the journey you want to see, from first patient contact through follow-up, and we can walk through the relevant screens.",
  },
  "/contact": {
    eyebrow: "Contact Meta Clinic",
    headline: "Tell us about your clinic.",
    lead: "Share your specialty, operating model, and the workflow you want to improve. We will respond using the contact information you provide.",
  },
  "/pilot": {
    eyebrow: "Pilot evaluation",
    headline: "Discuss a bounded clinic pilot.",
    lead: "Tell us what you would need to evaluate and which staff roles would participate. A pilot scope requires a separate agreement and readiness review.",
  },
  "/get-started": {
    eyebrow: "Start an evaluation",
    headline: "Start with the workflow you need to solve.",
    lead: "Describe your clinic and the most important handoff to improve. We can use that to guide the next conversation.",
  },
  "/signup": {
    eyebrow: "Access request",
    headline: "Request access to evaluate Meta Clinic.",
    lead: "Account access is provisioned through an evaluation process. Tell us about your clinic and we can discuss the right next step.",
  },
  "/resources": {
    eyebrow: "Practical clinic resources",
    headline: "Map the workflow before choosing the software.",
    lead: "Explore guides and templates about intake, scheduling, inventory, memberships, and clinic operations, then connect the topic to a product walkthrough.",
  },
  "/solutions": {
    eyebrow: "Operational problems",
    headline: "Start with the handoff slowing your clinic down.",
    lead: "Look at intake, scheduling, front desk work, stock, follow-up, and growth as connected clinic problems with measurable next steps.",
  },
  "/integrations": {
    eyebrow: "Connected systems",
    headline: "Review the systems your clinic depends on.",
    lead: "Inspect each proposed connection by supported data flow, current availability, owner, and failure path. Confirm vendor status before treating a connection as live.",
  },
  "/weight-loss": {
    eyebrow: "For weight loss clinics",
    headline: "Keep the weight loss journey connected.",
    lead: "From first interest through intake, visits, program payment, treatment review, and follow-up, give the team one place to see what happened and what comes next.",
    steps: ["Welcome and qualify the patient", "Move from visit to program decisions", "Keep monitoring and follow-up in view"],
  },
  "/weight-loss/telehealth-scheduling": {
    headline: "Schedule a remote visit with the rest of the program in view.",
    lead: "A telehealth appointment is one step in ongoing weight care. Show the booking, patient context, visit, and next check-in together.",
  },
  "/weight-loss/glp-1-workflows": {
    headline: "See the work around GLP-1 care, not just the prescription.",
    lead: "Connect intake, clinician review, documented decisions, inventory context, and planned follow-up. Medication decisions remain with authorized clinicians.",
  },
  "/behavioral-health": {
    eyebrow: "For behavioral health practices",
    headline: "Keep every session connected to the next step.",
    lead: "Coordinate intake, recurring appointments, session documentation, patient communication, and follow-up while preserving the clinician’s review and judgment.",
    steps: ["Prepare the patient and session", "Document the visit with context", "Carry the agreed next step forward"],
  },
  "/behavioral-health/telehealth": {
    headline: "Remote sessions, connected to the care workflow.",
    lead: "Show how a remote session fits with booking, patient context, documentation, and the next appointment.",
  },
  "/primary-care/cash-pay": {
    eyebrow: "For cash-pay primary care",
    headline: "Make the visit and the payment path easy to follow.",
    lead: "Show patients the service model clearly, then connect scheduling, intake, the visit, payment, and follow-up for the team.",
    steps: ["Explain the service and price", "Connect booking and intake to the visit", "Close out payment and follow-up work"],
  },
  "/direct-primary-care": {
    eyebrow: "For direct primary care practices",
    headline: "Keep membership care personal and organized.",
    lead: "Bring enrollment, access, visits, communication, and ongoing billing into a coherent practice workflow.",
  },
};

const relatedByTopic: Record<string, string[]> = {
  Scheduling: ["/platform/scheduling", "/resources/guides/telehealth-workflow"],
  Intake: ["/platform/patient-intake", "/resources/guides/automate-patient-intake"],
  Telehealth: ["/platform/telehealth", "/resources/guides/telehealth-workflow"],
  "Medication workflow": ["/platform/medications", "/resources/guides/glp-1-clinic-workflow"],
  Inventory: ["/platform/inventory", "/resources/guides/medical-inventory-lot-tracking"],
  Memberships: ["/platform/memberships", "/resources/guides/clinic-membership-model"],
  "Financial workflow": ["/platform/billing", "/solutions/cash-pay-clinics"],
  "Progress and results": ["/platform/reporting", "/platform/labs"],
  "Follow-up": ["/platform/messaging", "/solutions/automate-follow-ups"],
  "Clinical documentation": ["/platform/clinical-documentation", "/platform/workflows"],
  "Patient access": ["/platform/patient-portal", "/solutions/patient-self-service"],
  "Security and governance": ["/security", "/platform/roles-permissions"],
  Operations: ["/platform/workflows", "/solutions"],
};

const canonicalAliases: Record<string, string> = {
  "/weight-loss-clinics": "/weight-loss",
  "/ai-intake": "/ai/intake",
  "/inventory": "/platform/inventory",
  "/try": "/sandbox",
  "/request-demo": "/book-demo",
};

const resourceDirections: Record<string, [string, string, string]> = {
  "start-a-weight-loss-clinic": ["Choose the patient population, clinician model, and services before selecting software.", "Map intake, visits, medication review, inventory, and follow-up in one patient journey.", "Check financing, consent, state rules, staffing, and vendor obligations with qualified advisers."],
  "start-a-trt-clinic": ["Define the clinical services and which licensed professionals own each decision.", "Map intake, baseline information, lab review, visit, medication work, and monitoring.", "Review jurisdiction, prescribing, lab, and record requirements with qualified advisers."],
  "start-a-cash-pay-clinic": ["Define services, prices, payment timing, and whether memberships or packages are offered.", "Map booking, price disclosure, intake, visit, checkout, and follow-up.", "Review refunds, consent, tax, and legal terms with qualified advisers."],
  "glp-1-clinic-workflow": ["Show the sequence from eligibility intake to clinician assessment.", "Keep medication decisions, supply records, and patient communication distinct.", "Schedule monitoring and follow-up without implying an automatic prescription."],
  "weight-loss-patient-intake": ["Ask only questions needed for the clinic’s service and review process.", "Show who reviews submitted history, medications, and goals.", "Carry missing information into the visit without treating intake as approval."],
  "trt-patient-intake": ["Separate patient-reported symptoms, history, and goals from clinician findings.", "Record which information and labs still need review.", "Keep prescribing decisions and follow-up with authorized clinicians."],
  "infusion-chair-scheduling": ["List visit duration, chair, staffing, and preparation needs.", "Check conflicts across appointments and resources.", "Define how delays, cancellations, and recurring series are handled."],
  "infusion-inventory-management": ["Identify medication, unit, lot, expiration, and receiving records.", "Map demand from planned treatments to available stock.", "Define discrepancy, recall, and replenishment review paths."],
  "medical-inventory-lot-tracking": ["Record item identity, lot, expiration, quantity, and location.", "Connect receipts, use, adjustments, and recalls to auditable events.", "Review how staff resolve unknown or conflicting stock."],
  "automate-patient-intake": ["Identify questions common to all visits and those specific to a service.", "Make incomplete answers and required staff review visible.", "Measure how much work actually shifts before claiming savings."],
  "clinic-membership-model": ["Define the services included and excluded in the offer.", "Explain price, renewal, cancellation, and care access clearly.", "Connect enrollment, billing, and the patient’s ongoing service record."],
  "telehealth-workflow": ["Determine which appointments can use a remote visit.", "Map booking, identity, visit context, documentation, and technical failure recovery.", "Record next steps and any in-person follow-up."],
  "ai-in-healthcare-workflows": ["Identify a narrow task where assistance could reduce preparation work.", "Show the source data, draft output, reviewer, and correction path.", "Assess privacy, errors, retention, and human decision boundaries."],
  "weight-loss-intake-form": ["Program goal, relevant history, medications, and contact preferences.", "Visible consent and review fields appropriate to the clinic’s service.", "A staff checklist for missing information and clinician review."],
  "trt-intake-form": ["Patient goals, symptom history, medication history, and prior care.", "A clear distinction between self-report and clinician assessment.", "A review checklist before any treatment decision."],
  "telehealth-consent": ["Explain the visit format and technology used.", "Cover privacy, interruption, emergency, and alternative-care instructions for review.", "Have qualified counsel adapt the form to the clinic’s jurisdiction and service."],
  "clinic-intake-form": ["Collect contact and visit context relevant to the service.", "Mark required versus optional answers and staff review needs.", "Keep the final version under clinic and professional review."],
  "infusion-treatment-schedule": ["Record the ordered series, duration, and planned dates.", "Check chair, staff, and supply constraints at each appointment.", "Define reschedule and missed-treatment handling."],
  "medication-inventory-template": ["Record product, unit, location, lot, expiration, and quantity.", "Track receipt, use, adjustment, and reconciliation events.", "Assign staff review for discrepancies and recalls."],
  "clinic-launch-checklist": ["Define services, buyer, location, and staffing plan.", "Map patient acquisition, booking, clinical work, payment, and follow-up.", "Separate software setup from legal, clinical, security, and vendor approvals."],
};

const priorityCopy: Record<string, [string, string]> = {
  "/weight-loss/telehealth": ["Keep remote weight care connected to the program.", "Show the visit in the context of prior intake, the clinician’s review, and the next check-in rather than as an isolated video call."],
  "/weight-loss/telehealth-scheduling": ["Book the remote visit with the next step in mind.", "Plan a telehealth appointment, make the patient context available to the care team, and keep follow-up visible."],
  "/weight-loss/online-booking": ["Make the first appointment easier to start.", "Show available visit types clearly and carry the booking into intake and staff review."],
  "/weight-loss/ai-intake": ["Use AI to prepare intake for review.", "Explore how assisted questions or summaries could help the team prepare while keeping eligibility and treatment decisions with clinicians."],
  "/weight-loss/patient-intake": ["Collect the right context before the visit.", "Bring goals, history, medications, and unanswered questions into a reviewable intake flow."],
  "/weight-loss/glp-1": ["Connect the work around GLP-1 care.", "Map clinician assessment, documented treatment decisions, supply context, and monitoring without implying automatic prescribing."],
  "/weight-loss/glp-1-workflows": ["See the whole GLP-1 journey.", "Follow intake, provider review, medication work, inventory, and follow-up as separate accountable steps."],
  "/weight-loss/glp-1-inventory": ["Make GLP-1 supply visible to the team.", "Review recorded stock, lots, use, and the next replenishment question alongside planned patient work."],
  "/weight-loss/medication-management": ["Keep medication work tied to the patient journey.", "Show what has been reviewed, what remains open, and where the authorized clinician must decide."],
  "/weight-loss/memberships": ["Connect program enrollment to ongoing care.", "Present membership terms clearly, then keep visits, payment, and follow-up aligned with the chosen program."],
  "/weight-loss/subscriptions": ["Explain recurring program payment without losing care context.", "Clarify renewal, cancellation, and service access as part of the patient’s ongoing weight-care workflow."],
  "/weight-loss/payments": ["Bring payment into the patient journey.", "Show when a charge is due, what has been recorded, and what the front desk still needs to resolve."],
  "/weight-loss/labs": ["Keep lab work connected to the visit.", "Review ordered and recorded results in patient context, then make the next clinical review step visible."],
  "/weight-loss/lab-monitoring": ["See when a result needs follow-through.", "Connect lab timing, result review, and the next appointment without presenting a value as a treatment decision."],
  "/weight-loss/follow-ups": ["Make the next check-in easy to find.", "Carry the care plan, patient communication, and scheduling task forward after each visit."],
  "/weight-loss/weight-tracking": ["Track recorded measures in context.", "Show the trend the clinic has recorded alongside visits and clinician interpretation, without turning a number into an automatic judgment."],
  "/weight-loss/progress-tracking": ["Give the team a longitudinal view of progress.", "Bring goals, recorded measures, visits, and open follow-up together for review."],
  "/weight-loss/patient-portal": ["Let patients see their next step.", "Connect permitted patient actions to the clinic’s intake, appointment, and follow-up workflow."],
  "/weight-loss/automated-workflows": ["Automate handoffs the team can still inspect.", "Identify repeatable reminders and tasks while keeping clinical decisions and exception handling visible."],
  "/behavioral-health/scheduling": ["Make the session plan visible to the team.", "Coordinate new and recurring appointments while preserving the provider, location, and next step for each visit."],
  "/behavioral-health/telehealth": ["Keep remote sessions connected to care.", "Link booking, patient context, the session, documentation, and follow-up in one reviewable flow."],
  "/behavioral-health/intake": ["Prepare for the first conversation.", "Collect relevant patient-reported context while keeping assessment and care decisions with qualified professionals."],
  "/behavioral-health/ai-intake": ["Prepare intake with clear human review.", "Explore assisted intake without treating generated text as an assessment or clinical conclusion."],
  "/behavioral-health/clinical-notes": ["Keep session notes close to the encounter.", "Document the work in context and make unfinished review or signature steps visible to the authorized clinician."],
  "/behavioral-health/ai-scribe": ["Draft, review, and correct before a note is final.", "Use assisted documentation only with clear provenance, clinician review, and a visible correction path."],
  "/behavioral-health/treatment-plans": ["Keep the plan connected to ongoing visits.", "Show goals, agreed work, revisions, and next review without replacing clinician judgment."],
  "/behavioral-health/recurring-appointments": ["Plan an ongoing course of sessions.", "See the appointment series, exceptions, cancellations, and follow-up work together."],
  "/behavioral-health/patient-messaging": ["Keep communication in the right care context.", "Show patient messages alongside ownership, response state, and the next appropriate action."],
  "/behavioral-health/forms": ["Make forms part of the session workflow.", "Collect and review the required information before the appointment, with missing items visible to staff."],
  "/behavioral-health/patient-portal": ["Give patients a clear route into care.", "Connect permitted forms, appointments, and communication to the practice’s actual process."],
  "/behavioral-health/billing": ["Keep session billing connected to completed work.", "Show the service, charge, payment state, and unresolved financial follow-up without obscuring the clinical record."],
  "/primary-care": ["Keep everyday care organized around the patient.", "Bring appointments, chart context, services, payment, and follow-up into a shared operating view for independent primary care."],
  "/primary-care/cash-pay": ["Make cash-pay care clear from booking to checkout.", "Explain the service and price, then connect intake, the visit, payment, and next action."],
  "/primary-care/scheduling": ["Plan the day around actual services and people.", "See visits, providers, room context, and changes as part of one primary-care day."],
  "/primary-care/telehealth": ["Keep remote primary care connected to the record.", "Plan the appointment, review context, document the visit, and make follow-up visible."],
  "/primary-care/intake": ["Start the visit with relevant information.", "Collect the reason for visit, history, and open questions before the care team takes the next step."],
  "/primary-care/ai-intake": ["Prepare the visit without replacing review.", "Use assisted intake to organize patient-reported information, then let staff and clinicians confirm what matters."],
  "/primary-care/memberships": ["Connect membership access to primary care.", "Explain the offer and keep enrollment, visits, billing, and ongoing communication aligned."],
  "/primary-care/medications": ["See medication work within the visit.", "Keep current records, authorized decisions, and open follow-up visible to the care team."],
  "/primary-care/labs": ["Make result review part of follow-through.", "Connect orders, results, clinician review, and patient communication in the record."],
  "/primary-care/follow-ups": ["Do not lose the next step after checkout.", "Keep referrals, messages, repeat visits, and outstanding tasks visible after the encounter."],
  "/primary-care/patient-portal": ["Give patients a clearer path back to the clinic.", "Connect permitted self-service actions to appointments, information requests, and follow-up."],
  "/direct-primary-care/memberships": ["Make membership terms and access understandable.", "Show included services, renewal and cancellation rules, enrollment, and ongoing care together."],
  "/direct-primary-care/scheduling": ["Plan access around the practice model.", "Connect the requested visit to provider capacity, membership context, and follow-up."],
  "/direct-primary-care/telehealth": ["Carry DPC continuity into remote visits.", "Show booking, known patient context, the visit, and the next action as one care relationship."],
  "/direct-primary-care/intake": ["Welcome members with the right context.", "Collect goals, history, and access preferences before the first visit or renewal conversation."],
  "/direct-primary-care/messaging": ["Keep member communication accountable.", "Make the message, owner, response state, and next action easy to find."],
  "/direct-primary-care/patient-portal": ["Give members a clear self-service path.", "Connect appointments, forms, and communication to the ongoing relationship."],
  "/direct-primary-care/billing": ["Keep recurring payment understandable.", "Show charges, renewal timing, recorded payments, and unresolved issues in the member context."],
  "/solutions/cash-pay-clinics": ["Run the cash-pay journey as one workflow.", "Connect price explanation, scheduling, intake, service, checkout, and follow-up so the team can see what remains."],
};

const additionalCopy: Record<string, [string, string]> = {
  "/platform/patient-management": ["Keep patient context where the team works.", "Find the record, upcoming work, and past interactions without rebuilding the story at each handoff."],
  "/platform/scheduling": ["Plan the clinic day with the whole team in mind.", "Bring appointments, staff, location, and visit context into one operational view."],
  "/platform/telehealth": ["Make remote care part of the clinic workflow.", "Connect booking, patient context, the encounter, and follow-up around a remote visit."],
  "/platform/patient-intake": ["Begin with information the team can review.", "Collect relevant answers, show missing items, and carry submitted context into the visit."],
  "/platform/patient-portal": ["Give patients a clearer way to do their part.", "Connect permitted self-service actions to the staff workflow that follows."],
  "/platform/messaging": ["Keep the message and its next action together.", "Show who sent it, who owns the response, and whether follow-through is still open."],
  "/platform/clinical-documentation": ["Document the visit without losing its context.", "Keep notes, review state, and next steps close to the encounter that produced them."],
  "/platform/medications": ["Keep medication work accountable.", "Make current context, authorized decisions, supply information, and pending tasks visible."],
  "/platform/labs": ["Connect lab work to the patient journey.", "Show the order or result, who needs to review it, and what happens next."],
  "/platform/procedures": ["Keep procedure work connected to the visit.", "Plan the service, record what happened, and carry supplies and follow-up into the next step."],
  "/platform/inventory": ["See stock where clinic work needs it.", "Connect receipts, lots, usage, and replenishment questions to the services being planned."],
  "/platform/billing": ["Make financial work visible after care.", "Review charges, payment state, and unresolved items alongside the visit that created them."],
  "/platform/payments": ["Connect payment to the right clinic service.", "Clarify what is due, what was received, and what requires follow-up."],
  "/platform/memberships": ["Run a membership program with clear terms.", "Connect offers, enrollment, renewal, access, and the ongoing patient relationship."],
  "/platform/packages": ["Keep package use clear across visits.", "Show what a patient purchased, what was used, and what remains without hiding service terms."],
  "/platform/invoices": ["Give every invoice a clear status.", "Follow creation, payment, credits, and open balances in the clinic’s financial workflow."],
  "/platform/forms": ["Collect forms in the right visit context.", "Show which forms were sent, completed, and reviewed before work moves forward."],
  "/platform/e-signatures": ["Make signature work easy to verify.", "Show the document, signer, completion state, and any unresolved step without treating a draft as signed."],
  "/platform/tasks": ["Make open work visible to its owner.", "Connect each task to the patient or clinic context, the responsible team member, and a recorded outcome."],
  "/platform/notifications": ["Send the right reminder at the right step.", "Keep notification triggers, delivery status, and exceptions tied to the underlying workflow."],
  "/platform/reporting": ["See what the clinic recorded and what remains unknown.", "Use operational reporting to review activity, backlog, and trends without inventing conclusions from incomplete data."],
  "/platform/multi-location": ["Coordinate clinics without flattening local context.", "Review site-specific schedules, staff, records, and reporting within the organization’s permission model."],
  "/platform/roles-permissions": ["Give staff only the access their work requires.", "Explain role assignments, practice and site scope, and the server-side decisions that protect records."],
  "/platform/audit-history": ["Keep a record of consequential actions.", "Review who changed what, when, and in which clinic context, with the limits of the current audit view stated clearly."],
  "/platform/workflows": ["Connect the steps between departments.", "Map the handoff from patient access to care, financial work, inventory, and follow-up."],
  "/ai/intake": ["Prepare intake without replacing staff review.", "Use assistive questions or summaries to organize patient-reported information for the people who make decisions."],
  "/ai/scribe": ["Turn a draft into a reviewed note.", "Show the source, proposed text, corrections, and clinician approval before documentation is treated as complete."],
  "/ai/clinical-summaries": ["Summarize context for a reviewer, not for a diagnosis.", "Give the care team a concise starting point with access to the underlying record and a visible correction path."],
  "/ai/patient-interviews": ["Gather patient-reported context before the visit.", "Use structured questions to prepare the team while keeping interpretation and care decisions with clinicians."],
  "/ai/lab-review": ["Prepare lab context for clinical review.", "Organize recorded results and open questions without calling an AI output a final interpretation."],
  "/ai/follow-up": ["Draft the next communication for review.", "Show what triggered a proposed follow-up, who approves it, and what was actually sent."],
  "/ai/workflow-automation": ["Automate repeatable work with a visible owner.", "Move routine steps forward while surfacing exceptions and decisions that need an authorized person."],
  "/ai/voice": ["Evaluate voice assistance in a controlled workflow.", "Show recording and transcription boundaries, review steps, and data handling before relying on a voice feature."],
  "/ai/avatar": ["Evaluate an avatar as an interface, not a clinician.", "Explain the task it supports, the source of its answers, escalation to staff, and the limits of automation."],
  "/ai/documentation": ["Keep AI-assisted documentation reviewable.", "Show the draft, its provenance, the reviewer’s edits, and the final record state."],
  "/ai/patient-communication": ["Keep patient communication accountable.", "Make proposed messages, approvals, delivery state, and response ownership visible."],
  "/solutions/automate-patient-intake": ["Remove repeated intake handoffs.", "Map the forms, review steps, and missing information that currently force staff to re-enter answers."],
  "/solutions/reduce-front-desk-work": ["Give the front desk fewer disconnected steps.", "Connect booking, arrival, forms, payments, and handoff so staff can focus on exceptions."],
  "/solutions/automate-scheduling": ["Make scheduling fit the service, not just the clock.", "Review visit type, people, resources, changes, and confirmation in one sequence."],
  "/solutions/automate-follow-ups": ["Make follow-up an owned task.", "Create the next action from the visit and show when it was completed or still needs attention."],
  "/solutions/manage-medication-inventory": ["Know what medication stock is recorded.", "Connect receipts, lots, use, discrepancies, and planned care without assuming external supplier activity."],
  "/solutions/manage-memberships": ["Run membership care with clear terms and work.", "Show the offer, enrollment, payments, access, visits, and cancellation path."],
  "/solutions/multi-location-clinics": ["Give each location the right view.", "Coordinate shared oversight while respecting site-scoped work and permissions."],
  "/solutions/launch-a-clinic": ["Map the clinic before it opens its doors.", "Define services, staff, patient access, care, payment, and follow-up as one operating model."],
  "/solutions/scale-a-clinic": ["Scale the workflow that already works.", "Find repeatable steps, exceptions, owners, and reporting needs before adding locations or staff."],
  "/solutions/replace-multiple-systems": ["See where disconnected tools create rework.", "Trace a patient journey across the current stack, then evaluate which handoffs Meta Clinic can actually replace."],
  "/solutions/patient-self-service": ["Give patients a clear action and staff a clear result.", "Connect booking, forms, payments, and messages to the clinic workflow that receives them."],
  "/mens-health": ["Keep ongoing men’s health care connected.", "Bring intake, telehealth, clinician review, labs, medications, memberships, and follow-up into one practice workflow."],
  "/mens-health/trt": ["See the full TRT care sequence.", "Map intake, clinical assessment, labs, documented medication decisions, and monitoring with clear clinician ownership."],
  "/mens-health/trt-workflows": ["Keep each TRT step accountable.", "Separate patient-reported information, lab review, prescribing decisions, supply work, and follow-up."],
  "/mens-health/testosterone-management": ["Keep testosterone treatment decisions in context.", "Review the patient, recorded labs, authorized medication work, and next monitoring task together."],
  "/mens-health/ed-treatment": ["Map ED care from intake to follow-up.", "Show how assessment, clinician decisions, medication work, and patient communication fit together."],
  "/mens-health/hormone-management": ["Keep hormone care longitudinal.", "Connect labs, treatment decisions, visits, and monitoring without treating a single number as a complete assessment."],
  "/hormone-therapy": ["Organize hormone therapy as ongoing care.", "Bring intake, lab review, clinician decisions, medication records, and follow-up into one visible sequence."],
  "/infusion": ["Plan the infusion day around patients and resources.", "See how appointments, chair and staff capacity, treatment planning, supplies, authorization work, and follow-up connect."],
  "/infusion/chair-scheduling": ["Plan chairs alongside the appointment.", "Review duration, chair availability, preparation, and staffing before a treatment is placed on the calendar."],
  "/infusion/infusion-scheduling": ["Connect treatment timing to the clinic day.", "Map the visit series, preparation work, chair and staff capacity, and changes that need review."],
  "/infusion/recurring-treatments": ["Plan a treatment series without losing exceptions.", "Keep planned visits, changes, cancellations, and remaining work visible across the series."],
  "/infusion/treatment-plans": ["Carry the plan into operational preparation.", "Connect the authorized treatment plan to scheduling, stock planning, documentation, and review."],
  "/infusion/appointment-series": ["See the whole appointment series.", "Organize repeated visits, intervals, capacity, and rescheduling around the treatment sequence."],
  "/infusion/chair-management": ["Know which chair is available for which visit.", "Review capacity, duration, changes, and room context without using schedule order as clinical priority."],
  "/infusion/resource-scheduling": ["Schedule the resources a treatment needs.", "Consider chair, room, equipment, staff, and preparation together before confirming a slot."],
  "/infusion/nurse-scheduling": ["Plan nursing coverage with the treatment day.", "Show appointment demand and staffing availability while leaving clinical assignment rules to the practice."],
  "/infusion/medication-inventory": ["Connect medication stock to planned treatments.", "Review recorded quantities, lots, expiration, and pending work before a scheduled infusion."],
  "/infusion/inventory": ["See infusion supplies and medications in one inventory view.", "Connect receiving, stock, use, and replenishment to the treatment schedule."],
  "/infusion/lot-tracking": ["Trace lots through the inventory workflow.", "Keep item, lot, location, use, and recall questions tied to recorded events."],
  "/infusion/expiration-tracking": ["See expiration risk before the treatment day.", "Review dated stock and planned demand so staff can resolve suitability questions early."],
  "/infusion/recall-management": ["Give a recall a traceable review path.", "Identify affected lots, recorded locations and use, then document the clinic’s follow-up actions."],
  "/infusion/purchasing": ["Connect purchasing to planned demand.", "Review stock, expected treatments, request status, and receiving without implying a live supplier order."],
  "/infusion/receiving": ["Record what actually arrived.", "Match the receipt to the item, package, lot, expiration, and purchase context before stock becomes available."],
  "/infusion/replenishment": ["Make the next stock decision visible.", "Use recorded on-hand stock and planned treatments to surface what staff should review for replenishment."],
  "/infusion/inventory-forecasting": ["Estimate demand from the treatment schedule.", "Compare planned services with recorded stock and expected receipts while showing uncertainty and exceptions."],
  "/infusion/treatment-inventory-planning": ["Plan treatment supplies before the appointment.", "Connect a treatment plan and schedule to the items the team expects to need, then review gaps."],
  "/infusion/insurance-verification": ["Keep coverage questions in the preparation flow.", "Record the verification request, source, response, and unresolved items without presenting an estimate as a guarantee."],
  "/infusion/prior-authorization": ["Track authorization work before treatment.", "Show the request, supporting context, status, expiration, and next staff action with external outcomes clearly distinguished."],
  "/infusion/benefits-verification": ["Make benefit checks reviewable.", "Keep payer source, date, service, response, and remaining questions next to the planned treatment."],
  "/infusion/pharmacy-billing": ["Connect pharmacy charges to documented work.", "Review medication use, charge context, payer or patient path, and unresolved financial steps."],
  "/infusion/margin-estimation": ["See the assumptions behind treatment economics.", "Separate known costs and receipts from estimates, and make each assumption visible for review."],
  "/infusion/clinical-documentation": ["Keep the infusion record connected to the plan.", "Show the ordered care, administration record, observed events, and follow-up within the authorized workflow."],
  "/infusion/patient-portal": ["Give infusion patients a clear next step.", "Connect permitted schedule, forms, messages, and treatment preparation information to staff review."],
  "/infusion/reporting": ["Review infusion operations with context.", "See treatment activity, resource use, stock, and financial follow-through without hiding missing data."],
  "/psychiatry": ["Connect psychiatric care across visits.", "Bring intake, telehealth, clinician assessment, medication management, documentation, and follow-up into one longitudinal view."],
  "/psychiatry/medication-management": ["Keep medication follow-up visible and clinician owned.", "Show recorded decisions, monitoring questions, patient contact, and the next review without automatic prescribing claims."],
  "/med-spa": ["Connect medical spa services to clinic operations.", "Bring booking, forms, consents, inventory, packages, payments, and follow-up together around the service."],
  "/med-spa/consents": ["Make consent status clear before a service.", "Show the relevant form, signer, review state, and the next staff action without treating a draft as completed."],
  "/iv-therapy": ["Plan IV therapy from booking to follow-through.", "Connect chair time, intake, consent, stock, package or membership terms, and the visit record."],
  "/iv-therapy/chair-scheduling": ["Place the IV visit with its chair and staff needs.", "Review duration, room capacity, preparation, and changes as one appointment workflow."],
  "/longevity": ["Keep longitudinal programs organized.", "Connect intake, labs, clinician review, ongoing services, memberships, and follow-up over time."],
  "/longevity/peptide-management": ["Map peptide-related work with clear boundaries.", "Separate patient context, clinician decisions, medication records, supply status, and follow-up; confirm legal and vendor requirements."],
  "/physical-therapy": ["Make a course of therapy easier to follow.", "Keep evaluation, appointment series, treatment plan, progress documentation, and patient follow-through connected."],
  "/physical-therapy/recurring-appointments": ["Plan a therapy series with room for change.", "Show visit cadence, provider and resource availability, cancellations, and the next appointment."],
  "/physical-therapy/progress-tracking": ["See progress across the course of care.", "Connect documented measures, visits, goals, and clinician interpretation without reducing progress to one score."],
  "/security/hipaa": ["Review the HIPAA responsibilities that apply.", "Separate the clinic’s obligations, Meta Clinic’s documented safeguards, and any business associate agreement that would be required for the intended use."],
  "/security/data-protection": ["Follow the data through its actual workflow.", "Review what is collected, where it is stored, who can access it, and how deletion or retention works in the relevant environment."],
  "/security/encryption": ["Ask where and how data is encrypted.", "Review transport, storage, key handling, and scope from current technical evidence rather than a general badge."],
  "/security/access-control": ["Review who can access each clinic record.", "Examine account roles, practice and site scope, authentication, and server-side authorization using current evidence."],
  "/security/audit-logs": ["Understand which actions leave an audit trail.", "Review event coverage, actor and time context, retention, and access to audit history."],
  "/security/backups": ["Review backup and recovery evidence.", "Ask about scope, frequency, restoration exercises, and the difference between a stored backup and a proven recovery."],
  "/security/business-associate-agreement": ["Discuss the agreement required for your use.", "Confirm the parties, covered service, data flow, subprocessors, and signature status with qualified counsel before protected data use."],
  "/security/ai-data-privacy": ["Know what data an AI feature uses.", "Review source data, provider flow, retention, access, human review, and any external model agreements for the specific feature."],
  "/integrations/stripe": ["Review the Stripe payment path.", "Confirm the supported account model, checkout flow, payment events, refunds, reconciliation, and actual connection status."],
  "/integrations/labs": ["Review how lab information moves.", "Map ordering, result receipt, patient matching, error handling, and clinician review for the specific laboratory relationship."],
  "/integrations/pharmacies": ["Review the pharmacy handoff.", "Distinguish a prepared medication record from an actual external transmission and confirm the pharmacy connection in use."],
  "/integrations/e-prescribing": ["Separate preparation from live prescribing.", "Review clinician identity, vendor connection, transmission status, and recovery when an external prescription is not accepted."],
  "/integrations/sms": ["Review text messaging as an external service.", "Confirm consent, content, delivery status, failure handling, and the vendor relationship before making a messaging claim."],
  "/integrations/email": ["Know which email leaves the system.", "Review templates, trigger, recipient, delivery status, and privacy boundaries for any external email service."],
  "/integrations/telehealth": ["Review the video connection behind a visit.", "Confirm the vendor, session setup, access rules, fallback path, and current agreement status."],
  "/integrations/api": ["Review integration access by use case.", "Define supported endpoints, authentication, authorization scope, rate limits, and the owner of each connection."],
  "/company": ["Learn what Meta Clinic is building.", "Understand the software product, the clinics it is intended to serve, and how to evaluate the current workflow."],
  "/about": ["Meet the purpose behind Meta Clinic.", "Read how the product approaches the connected clinic day, which problems it targets, and what buyers should verify in a demo."],
  "/founder": ["Meet the founder through verifiable work.", "Describe the founder’s background and product role only with approved facts, then show the current software rather than invented customer proof."],
  "/careers": ["Explore future work on Meta Clinic.", "Describe the product and the kinds of problems the team works on; list openings only when a real role is approved."],
  "/partners": ["Explore a practical clinic partnership.", "Start with the problem your organization helps clinics solve and the exact workflow a joint evaluation could improve."],
  "/partner-program": ["Define partnership value before a program promise.", "Discuss referral, service, or integration ideas without implying a published program or commercial terms that are not approved."],
  "/affiliate-program": ["Review whether an affiliate model fits.", "Clarify audience, attribution, disclosure, and terms before offering an affiliate arrangement."],
  "/legal/privacy": ["Review the privacy policy for the specific service.", "Confirm data categories, purposes, retention, access, and contact details in a legally reviewed policy before publication."],
  "/legal/terms": ["Review the terms that govern use.", "Confirm service scope, account obligations, limitations, and governing terms with counsel before these terms are published."],
  "/legal/baa": ["Review the business associate agreement process.", "Identify the covered service, parties, data flow, vendor relationships, and signature status before protected data is involved."],
  "/legal/hipaa": ["Review HIPAA scope without a badge claim.", "Document the relevant obligations, safeguards, and agreement process with qualified review."],
  "/legal/cookies": ["Explain what the site stores in the browser.", "Document cookies and similar technologies actually used, their purpose, duration, and user choices before publication."],
  "/legal/acceptable-use": ["Set clear boundaries for service use.", "Define permitted use, prohibited conduct, account responsibilities, and consequences in reviewed terms."],
  "/legal/ai-disclosure": ["Explain where AI assists and where people decide.", "Describe the relevant features, data flow, human review, limitations, and patient-facing disclosures after review."],
};

function pretty(segment: string) {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bAi\b/g, "AI").replace(/\bGlp 1\b/g, "GLP-1")
    .replace(/\bTrt\b/g, "TRT").replace(/\bHipaa\b/g, "HIPAA")
    .replace(/\bApi\b/g, "API").replace(/\bSms\b/g, "SMS")
    .replace(/\bBaa\b/g, "BAA").replace(/\bEhr\b/g, "EHR")
    .replace(/\bIv\b/g, "IV").replace(/\bEd\b/g, "ED");
}

const entries: Map<string, string> = new Map(marketingPaths.map((entry) => [entry.path, entry.group]));
const verifiedVisuals: Record<string, { image: string; imageAlt: string; imageCaption: string }> = {
  "/platform/patient-management": {
    image: "/marketing/primary-care-patients-app.png",
    imageAlt: "Meta Clinic patient directory showing synthetic demonstration records and search controls.",
    imageCaption: "Patient directory in the synthetic demo",
  },
  "/platform/scheduling": {
    image: "/marketing/captures/schedule-booking-omni-adapted.png",
    imageAlt: "Meta Clinic synthetic appointment form showing patient, visit time, room, clinician, visit type, and visit reason.",
    imageCaption: "Appointment setup in the synthetic demo",
  },
  "/platform/memberships": {
    image: "/marketing/memberships-app.png",
    imageAlt: "Meta Clinic membership catalog showing several synthetic clinic programs.",
    imageCaption: "Membership program catalog in the synthetic demo",
  },
  "/platform/inventory": {
    image: "/marketing/inventory-app.png",
    imageAlt: "Meta Clinic inventory catalog showing synthetic clinic supplies and recorded stock.",
    imageCaption: "Inventory catalog in the synthetic demo",
  },
  "/infusion/lot-tracking": {
    image: "/marketing/captures/inventory-activity-ledger.png",
    imageAlt: "Meta Clinic synthetic inventory movement ledger showing lot identifiers, locations, quantities, and recorded receipts.",
    imageCaption: "Lot movement example in the synthetic demo; infusion-specific scope requires review",
  },
  "/infusion/receiving": {
    image: "/marketing/captures/inventory-activity-ledger.png",
    imageAlt: "Meta Clinic synthetic inventory activity ledger showing stock receipts with lot and location context.",
    imageCaption: "Recorded stock receipts in the synthetic demo; infusion-specific scope requires review",
  },
  "/resources/guides/medical-inventory-lot-tracking": {
    image: "/marketing/captures/inventory-activity-ledger.png",
    imageAlt: "Meta Clinic synthetic inventory movement ledger showing stock receipt entries by lot and location.",
    imageCaption: "Inventory movement example for the lot-tracking guide",
  },
  "/platform/billing": {
    image: "/marketing/captures/finance-paid-invoice-detail.png",
    imageAlt: "Meta Clinic synthetic invoice detail showing recorded charges, a payment, a credit, and a zero balance.",
    imageCaption: "Billing detail from the synthetic demo",
  },
  "/platform/payments": {
    image: "/marketing/captures/finance-paid-invoice-detail.png",
    imageAlt: "Meta Clinic synthetic invoice showing an allocated payment and the resulting balance.",
    imageCaption: "Recorded payment in the synthetic demo",
  },
  "/platform/invoices": {
    image: "/marketing/captures/finance-open-invoice-detail.png",
    imageAlt: "Meta Clinic synthetic open invoice with line items and an unpaid balance.",
    imageCaption: "Open invoice detail from the synthetic demo",
  },
  "/platform/telehealth": {
    image: "/marketing/scheduling-month.png",
    imageAlt: "Meta Clinic month schedule showing synthetic remote and in-person appointments.",
    imageCaption: "Remote visits in the synthetic demo schedule",
  },
  "/weight-loss/telehealth": {
    image: "/marketing/scheduling-month.png",
    imageAlt: "Meta Clinic synthetic month schedule showing remote visits alongside other appointments.",
    imageCaption: "Remote visit scheduling in the synthetic demo; confirm weight loss clinic configuration during evaluation",
  },
  "/weight-loss/telehealth-scheduling": {
    image: "/marketing/scheduling-month.png",
    imageAlt: "Meta Clinic synthetic month schedule with remote appointment entries and visit times.",
    imageCaption: "Remote appointments in the synthetic demo; specialty setup is evaluated separately",
  },
  "/behavioral-health/telehealth": {
    image: "/marketing/scheduling-month.png",
    imageAlt: "Meta Clinic synthetic month schedule showing remote appointment entries.",
    imageCaption: "Remote visit scheduling in the synthetic demo; behavioral health workflow is evaluated separately",
  },
  "/weight-loss/memberships": {
    image: "/marketing/memberships-app.png",
    imageAlt: "Meta Clinic synthetic membership catalog containing a metabolic health program among other clinic programs.",
    imageCaption: "Membership catalog with a synthetic metabolic health program",
  },
  "/platform/workflows": {
    image: "/marketing/tracking-board-app.png",
    imageAlt: "Meta Clinic tracking board showing synthetic visits in different operational states.",
    imageCaption: "Clinic workflow board in the synthetic demo",
  },
  "/solutions/reduce-front-desk-work": {
    image: "/marketing/captures/crop-front-desk-queue.png",
    imageAlt: "Meta Clinic synthetic front desk day queue with appointment times, rooms, visit states, and chart and billing actions.",
    imageCaption: "Front desk day queue with patient and billing handoffs in the synthetic demo",
  },
  "/behavioral-health/scheduling": {
    image: "/marketing/scheduling-month.png",
    imageAlt: "Meta Clinic synthetic month schedule with appointment times and remote visit indicators.",
    imageCaption: "General appointment scheduling in the demo; practice-specific setup requires review",
  },
  "/primary-care/scheduling": {
    image: "/marketing/scheduling-month.png",
    imageAlt: "Meta Clinic synthetic month schedule showing appointments and visit times.",
    imageCaption: "Clinic calendar in the synthetic demo",
  },
  "/primary-care/telehealth": {
    image: "/marketing/scheduling-month.png",
    imageAlt: "Meta Clinic synthetic schedule showing remote appointments alongside in-person visits.",
    imageCaption: "Remote appointment scheduling in the synthetic demo",
  },
  "/primary-care/memberships": {
    image: "/marketing/captures/membership-tier-preview-northside-clinic-2026-09-24-synthetic-direct.png",
    imageAlt: "Meta Clinic synthetic primary care membership preview showing price and included service.",
    imageCaption: "Primary care membership preview in the synthetic demo",
  },
  "/direct-primary-care/billing": {
    image: "/marketing/captures/finance-open-invoice-detail.png",
    imageAlt: "Meta Clinic synthetic primary care invoice showing service charges and an open balance.",
    imageCaption: "Primary care invoice review in the synthetic demo",
  },
  "/solutions/manage-memberships": {
    image: "/marketing/memberships-app.png",
    imageAlt: "Meta Clinic synthetic membership catalog showing clinic programs and publication states.",
    imageCaption: "Membership programs in the synthetic demo",
  },
  "/primary-care/cash-pay": {
    image: "/marketing/captures/finance-paid-invoice-detail.png",
    imageAlt: "Meta Clinic synthetic clinic invoice showing care-related line items, a payment, a credit, and a remaining balance of zero.",
    imageCaption: "Cash-pay invoice workflow example in the synthetic demo",
  },
  "/solutions/cash-pay-clinics": {
    image: "/marketing/captures/finance-open-invoice-detail.png",
    imageAlt: "Meta Clinic synthetic clinic invoice showing service charges and an open balance for staff review.",
    imageCaption: "Invoice review in the synthetic demo",
  },
  "/direct-primary-care/memberships": {
    image: "/marketing/captures/membership-tier-preview-northside-clinic-2026-09-24-synthetic-direct.png",
    imageAlt: "Meta Clinic synthetic patient-facing primary care membership card preview with price and included service.",
    imageCaption: "Primary care membership preview in the synthetic demo",
  },
};
const verifiedGalleries: Record<string, GrowthPage["gallery"]> = {
  "/platform": [
    { image: "/marketing/primary-care-patients-app.png", imageAlt: "Meta Clinic synthetic patient directory with search and registered patients.", imageCaption: "Patient context in a synthetic clinic" },
    { image: "/marketing/scheduling-month.png", imageAlt: "Meta Clinic synthetic month schedule with remote and in-person appointments.", imageCaption: "Scheduling in a synthetic clinic" },
    { image: "/marketing/captures/finance-paid-invoice-detail.png", imageAlt: "Meta Clinic synthetic paid invoice with line items, payment, and credit.", imageCaption: "Financial follow-through in a synthetic clinic" },
  ],
  "/weight-loss": [
    { image: "/marketing/primary-care-patients-app.png", imageAlt: "Meta Clinic synthetic patient directory with patient search and record entry points.", imageCaption: "Shared patient context; specialty intake requires review" },
    { image: "/marketing/scheduling-month.png", imageAlt: "Meta Clinic synthetic month schedule showing remote appointments.", imageCaption: "Remote visit scheduling; weight loss setup requires review" },
    { image: "/marketing/memberships-app.png", imageAlt: "Meta Clinic synthetic membership catalog containing a metabolic health program.", imageCaption: "Metabolic health program in the demo catalog" },
  ],
  "/behavioral-health": [
    { image: "/marketing/primary-care-patients-app.png", imageAlt: "Meta Clinic synthetic patient directory with patient search and record entry points.", imageCaption: "Shared patient context; practice-specific intake requires review" },
    { image: "/marketing/scheduling-month.png", imageAlt: "Meta Clinic synthetic month schedule showing remote visits.", imageCaption: "Remote visit scheduling in the shared demo" },
    { image: "/marketing/tracking-board-app.png", imageAlt: "Meta Clinic synthetic visit tracking board with intake and provider readiness states.", imageCaption: "Shared visit handoffs; behavioral health setup requires review" },
  ],
  "/primary-care/cash-pay": [
    { image: "/marketing/captures/schedule-booking-omni-adapted.png", imageAlt: "Meta Clinic synthetic appointment form with visit time, site, room, clinician, and visit reason.", imageCaption: "Booking details in a synthetic clinic" },
    { image: "/marketing/captures/crop-front-desk-queue.png", imageAlt: "Meta Clinic synthetic front desk day queue with visit status and chart and billing actions.", imageCaption: "Front desk handoff from visit to billing" },
    { image: "/marketing/captures/finance-open-invoice-lines.png", imageAlt: "Meta Clinic synthetic invoice showing itemized charges, no allocated payment, and an open balance.", imageCaption: "Itemized charges and open balance" },
  ],
  "/solutions/cash-pay-clinics": [
    { image: "/marketing/captures/schedule-booking-omni-adapted.png", imageAlt: "Meta Clinic synthetic appointment form with visit time, site, room, clinician, and visit reason.", imageCaption: "Booking details in a synthetic clinic" },
    { image: "/marketing/captures/crop-front-desk-queue.png", imageAlt: "Meta Clinic synthetic front desk day queue with visit status and chart and billing actions.", imageCaption: "Front desk handoff from visit to billing" },
    { image: "/marketing/captures/finance-paid-invoice-lines.png", imageAlt: "The same synthetic invoice after a payment and credit, with zero remaining balance.", imageCaption: "Payment and credit recorded against the invoice" },
  ],
};
export const marketingRouteCount = entries.size;
export function getGrowthPage(path: string): GrowthPage | null {
  if (["/ai-intake", "/inventory", "/weight-loss-clinics"].includes(path)) {
    const canonicalPath = canonicalAliases[path];
    const canonicalPage = getGrowthPage(canonicalPath);
    return canonicalPage ? { ...canonicalPage, path, canonicalPath } : null;
  }
  if (path === "/site-map") {
    return {
      path, group: "Site map", title: "Site map", eyebrow: "Browse Meta Clinic",
      headline: "Find the clinic workflow you want to explore.",
      lead: "Browse the complete planning catalog by specialty, platform capability, operating problem, and resource. Pages remain subject to product and claim review before public search indexing.",
      steps: ["Choose a clinic type", "Open a specific workflow", "Use the demo to inspect the product"],
      note: "Availability and claims are confirmed during evaluation.",
      audience: "Clinic owners and operators", searchIntent: "Meta Clinic site map", canonicalPath: path, funnel: "Navigate → evaluate → demo",
      visualBrief: "No image required; a structured topic directory is the main content.",
      primaryCta: { label: "Explore the demo", path: "/demo" }, secondaryCta: { label: "Book a demo", path: "/book-demo" },
      sections: [{ heading: "Choose a topic", body: "Use the full directory below to find a specialty or operating problem." }],
      questions: [{ question: "Where should I start?", answer: "Start with your clinic type, then choose the specific workflow you want to evaluate." }],
      links: [{ label: "Platform", path: "/platform" }, { label: "Resources", path: "/resources" }], children: [],
    };
  }
  const group = entries.get(path) ?? (path.startsWith("/alternatives/") ? "Comparison / alternative pages" : path.startsWith("/customers/") ? "Customer proof" : undefined);
  if (!group) return null;
  const parts = path.slice(1).split("/");
  const parent = `/${parts[0]}`;
  const specialty = specialtyNames[parts[0]];
  const last = parts.at(-1) || "Meta Clinic";
  const title = pretty(last);
  const topic = topics.find((item) => item.test.test(last)) ?? topics.at(-1)!;
  const overview = parts.length === 1;
  const isResource = path.startsWith("/resources/");
  const isLegal = group === "Legal" || group === "Security / Compliance";
  const isProof = group === "Customer proof" || group === "Comparison / alternative pages";
  const isIntegration = group === "Integrations";
  const isCompany = group === "Company";
  const isAI = group === "AI";
  const isConversion = group === "Sales / conversion" || ["/book-demo", "/contact", "/signup", "/pricing", "/sandbox"].includes(path);
  const resourceIndex = ["/resources/guides", "/resources/templates", "/resources/checklists", "/resources/videos", "/resources/webinars", "/resources/case-studies"].includes(path);
  const resourceNeedsEvidence = ["/resources/webinars", "/resources/case-studies", "/resources/api-docs", "/resources/help"].includes(path);
  const primaryCta = resourceNeedsEvidence
    ? { label: "Ask for details", path: "/contact" }
    : resourceIndex
      ? { label: "Browse this topic", path: "#directory" }
      : isResource
        ? { label: path.includes("/templates/") ? "Use the checklist" : "Use the guide", path: "#details" }
    : isLegal || isIntegration || isProof
      ? { label: "Ask a question", path: "/contact" }
      : isConversion && !["/pricing", "/sandbox", "/try"].includes(path)
        ? { label: "Send a request", path: "#request" }
        : { label: "Explore the demo", path: "/demo" };
  const secondaryCta = isResource
    ? { label: "See the product", path: "/demo" }
    : isConversion
      ? { label: "See the demo", path: "/demo" }
      : { label: "Book a demo", path: "/book-demo" };
  const audience = isLegal
    ? "Clinic owners, medical directors, and security reviewers"
    : isResource
      ? "Clinic operators researching a practical workflow"
      : isIntegration
        ? "Operations and technical buyers evaluating a connection"
        : specialty
          ? `${pretty(parts[0])} owners, practice managers, and clinical leads`
          : "Independent clinic owners and practice managers";
  const searchIntent = isResource
    ? `How to plan ${title.toLowerCase()} in a clinic`
    : isLegal
      ? `Meta Clinic ${title.toLowerCase()} details`
      : isIntegration
        ? `Meta Clinic ${title.toLowerCase()} integration`
        : `${specialty ?? "clinic"} ${title.toLowerCase()} software`;
  const funnel = isResource ? "Learn → evaluate workflow → demo" : isConversion ? "Evaluate → request a conversation" : "Evaluate workflow → demo → pilot discussion";
  const children = [...entries.keys()]
    .filter((candidate) => candidate.startsWith(`${path}/`) && candidate.slice(path.length + 1).split("/").length === 1)
    .map((candidate) => ({ label: pretty(candidate.split("/").at(-1)!), path: candidate }));
  const siblings = [...entries.keys()]
    .filter((candidate) => candidate !== path && candidate.startsWith(`${parent}/`) && candidate.split("/").length === parts.length + 1)
    .slice(0, 4)
    .map((candidate) => ({ label: pretty(candidate.split("/").at(-1)!), path: candidate }));
  const crossLinks = (relatedByTopic[topic.title] ?? [])
    .filter((candidate) => candidate !== path && entries.has(candidate))
    .map((candidate) => ({ label: pretty(candidate.split("/").at(-1)!), path: candidate }));
  const parentPath = parts.length > 1 ? `/${parts.slice(0, -1).join("/")}` : "/";
  const links = [
    ...(overview ? [] : [{ label: parentPath === "/" ? "Meta Clinic overview" : `${pretty(parts.at(-2)!)} overview`, path: parentPath }]),
    ...(children.length ? children : siblings).slice(0, overview ? 4 : 2),
    ...crossLinks,
    { label: "Explore the demo", path: "/demo" },
  ].filter((item, index, all) => all.findIndex((other) => other.path === item.path) === index).slice(0, 6);
  const base: GrowthPage = {
    path,
    group,
    title,
    eyebrow: specialty ? `Meta Clinic for ${specialty}` : group,
    headline: overview ? `${title} clinics, one connected view of the work.` : `${title} for ${specialty ?? "independent clinics"}.`,
    lead: overview
      ? `Explore the connected clinic workflow for ${specialty ?? title.toLowerCase()}: patient access, the visit, team handoffs, and what happens next.`
      : `${topic.promise} This page focuses on ${title.toLowerCase()}${specialty ? ` in ${specialty} care` : ""}.`,
    steps: topic.steps,
    image: topic.image,
    imageAlt: topic.alt,
    imageCaption: topic.caption,
    note: isLegal
      ? "Detailed security and legal representations require current review before publication. Ask about the specific controls and agreements that apply to your evaluation."
      : isProof
        ? "Customer evidence and comparisons will be added only when the underlying facts and permissions are verified."
        : isResource
          ? "Use this as a practical evaluation outline. Confirm clinical, legal, and operational requirements for your own setting."
          : "Screens show synthetic demonstration data. Confirm the exact workflow and available integrations during evaluation.",
    audience,
    searchIntent,
    canonicalPath: canonicalAliases[path] ?? path,
    funnel,
    visualBrief: isLegal
      ? `A dated, reviewed explanation of ${title.toLowerCase()} scope and responsibility; no unsupported seal or badge.`
      : isProof
        ? "Permissioned customer evidence or a sourced comparison, added only after verification."
        : isResource
          ? `An annotated ${title.toLowerCase()} example and a reusable checklist.`
          : `A readable product capture that demonstrates ${title.toLowerCase()} in a synthetic clinic, with the relevant controls fully visible.`,
    primaryCta,
    secondaryCta,
    sections: [
      { heading: `Where ${title.toLowerCase()} fits`, body: specialty ? `In ${specialty} care, this work connects patient access, the visit, and follow-through. Start by naming who owns the handoff and what information must be available.` : `Start with the clinic task behind ${title.toLowerCase()}: the people involved, the information they need, and the next action they must take.` },
      { heading: "What the team needs to see", body: `${topic.promise} Review the recorded state, missing context, and who can act before treating a step as complete.` },
      { heading: "How to evaluate it", body: `Open the guided demo and follow the ${title.toLowerCase()} task from start to finish. Bring your clinic’s roles, timing, and exception cases to a walkthrough.` },
    ],
    questions: [
      { question: `How does ${title.toLowerCase()} connect to the rest of the clinic?`, answer: `Evaluate the handoff from patient access to the visit and then to follow-up. Related pages below show adjacent workflows.` },
      { question: "Can we see this with our clinic’s workflow?", answer: "Use the synthetic demo to inspect the current interface, then request a conversation about your specific operating model." },
      { question: "What is available today?", answer: "Confirm the exact product behavior, configuration, and any external connection during evaluation. Planned capabilities are not represented as active services." },
    ],
    links,
    children,
  };
  if (isResource) {
    base.headline = `${title}: a practical clinic workflow guide.`;
    base.lead = `Use this guide to map the people, information, and decisions involved in ${title.toLowerCase()}. Then see where Meta Clinic can support the workflow.`;
    const directions = resourceDirections[last];
    if (directions) {
      base.steps = directions;
      base.sections = [
        { heading: "Start with the operating model", body: directions[0] },
        { heading: "Map the working sequence", body: directions[1] },
        { heading: "Review the open decisions", body: directions[2] },
      ];
    }
  } else if (isLegal) {
    base.headline = `${title}: review the details that apply to your clinic.`;
    base.lead = `Understand the scope, responsibilities, and open questions around ${title.toLowerCase()} before choosing a clinic software system.`;
    base.image = undefined;
  } else if (isProof) {
    base.headline = `${title}: evaluate the evidence.`;
    base.lead = "Compare fit, implementation, and observed results using dated facts and a clear methodology. This page is reserved until that evidence is available.";
    base.image = undefined;
  }
  if (isIntegration) {
    base.headline = `Review the ${title.toLowerCase()} connection.`;
    base.lead = `Map the data your clinic expects to exchange with ${title.toLowerCase()}, who operates the connection, and how failures are handled. Ask which parts are available in the current environment.`;
    base.sections = [
      { heading: "What should move", body: `List the exact ${title.toLowerCase()} data, direction, trigger, and owner. A vendor name by itself does not establish an active integration.` },
      { heading: "What the team sees", body: "Show the originating record, submission or receipt state, and any work that remains when an external system is unavailable." },
      { heading: "Questions for a walkthrough", body: "Confirm supported accounts, authentication, testing mode, error handling, reconciliation, and the current vendor agreement status." },
    ];
    base.note = "Vendor logos, live connectivity, and BAAs are shown only after the corresponding relationship and implementation are verified.";
  }
  if (isAI) {
    base.sections = [
      { heading: "The staff task", body: `Identify the work that ${title.toLowerCase()} could help prepare, and the information used to produce an output.` },
      { heading: "Human review", body: "Show who sees the proposed output, what can be corrected, and which action still requires an authorized human decision." },
      { heading: "Data and limitations", body: "Explain the current data flow, retention, failure behavior, and known limits after those facts are verified." },
    ];
    base.note = "AI output is assistive. Do not treat it as an autonomous clinical decision, verified note, or sent communication without the required review.";
  }
  if (isCompany) {
    base.sections = [
      { heading: "What Meta Clinic is building", body: "Describe the software product and the independent clinics it is intended to serve, separate from any consultancy or clinical practice." },
      { heading: "How we work with clinics", body: "Explain product evaluation, feedback, implementation discussion, and support commitments only to the extent currently offered." },
      { heading: "Get in touch", body: "Use the contact route for a business question or to request a workflow walkthrough." },
    ];
  }
  if (isLegal) {
    base.sections = [
      { heading: "Scope to confirm", body: `Define what ${title.toLowerCase()} covers, which environment it applies to, and which party owns each responsibility.` },
      { heading: "Evidence to request", body: "Review the dated policy, technical description, agreement, or assessment with the appropriate qualified reviewer." },
      { heading: "Questions for your clinic", body: "Confirm your own data, workforce, vendor, retention, and incident obligations before relying on a specific representation." },
    ];
  }
  // Visual assets are attached in a separate pass after every route has content.
  base.image = undefined;
  const curated = priorityCopy[path] ?? additionalCopy[path];
  const familyBrief = getSpecialtyPageBrief(path) ?? getPlatformAiPageBrief(path) ?? getEditorialPageBrief(path);
  const page: GrowthPage = { ...base, ...(curated ? { headline: curated[0], lead: curated[1] } : {}), ...focus[path], ...(familyBrief ?? {}) };
  Object.assign(page, verifiedVisuals[path] ?? {});
  page.gallery = verifiedGalleries[path];
  page.links = [...(familyBrief?.links ?? page.links), ...base.links]
    .filter((link, index, all) => link.path !== path && all.findIndex((candidate) => candidate.path === link.path) === index)
    .slice(0, 8);
  if (["/resources/videos", "/resources/webinars", "/resources/api-docs", "/resources/help"].includes(path)) {
    page.note = "This is a planned resource area. Publish links or access instructions only after the material and support path are ready and verified.";
    page.primaryCta = { label: "Ask about this resource", path: "/contact" };
  }
  if (["/book-demo", "/request-demo", "/contact", "/pilot", "/get-started", "/signup"].includes(path)) {
    page.primaryCta = { label: "Send a request", path: "#request" };
  } else if (path === "/sandbox") {
    page.primaryCta = { label: "Open the guided demo", path: "/demo" };
  } else if (path === "/try") {
    page.primaryCta = { label: "Start the demo", path: "/demo" };
    page.secondaryCta = { label: "Book a demo", path: "/book-demo" };
  } else if (["/resources", "/resources/guides", "/resources/templates", "/solutions"].includes(path)) {
    page.primaryCta = { label: "Browse the pages", path: "#directory" };
  } else if (path === "/resources/checklists") {
    page.primaryCta = { label: "Browse workflow templates", path: "/resources/templates" };
  }
  return page;
}
