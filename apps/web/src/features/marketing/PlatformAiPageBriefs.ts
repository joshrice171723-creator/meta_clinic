import type { GrowthPage } from "./growthPageContent";

type Brief = {
  title: string;
  lead: string;
  problem: string;
  workflow: string;
  evaluation: string;
  faq: readonly [string, string, string];
  visual: string;
};

const briefs: Record<string, Brief> = {
  "/platform": {
    title: "The clinic workflow platform",
    lead: "Follow the work from a patient’s first request through the visit, payment, and follow-up. Evaluate each handoff against the way your clinic operates.",
    problem: "Clinic work crosses patient access, the front desk, care teams, and back-office follow-through. A workflow review can show where information is entered, who needs it next, and where work can become hard to see.",
    workflow: "A representative journey from request through follow-up makes clear what each role sees, what they record, and which next action remains open at every handoff.",
    evaluation: "A guided demonstration helps you inspect the screens and states relevant to your workflow. It can also clarify configuration, availability, and external dependencies with the product team before making a decision.",
    faq: ["Is every workflow available today?", "Can we evaluate our clinic’s operating model?", "Does a shared platform replace our other systems?"],
    visual: "A later screenshot set should trace one synthetic patient journey across access, scheduling, visit, payment, and follow-up. Label the demonstrated environment and avoid implying every module is generally available.",
  },
  "/platform/audit-history": {
    title: "Audit history",
    lead: "Evaluate how a clinic can review recorded changes, the people involved, and the context needed to investigate an operational question.",
    problem: "When a record changes, reviewers need a clear account of what changed and where to look next. Audit needs center on the decisions a clinic must reconstruct and the records those decisions touch.",
    workflow: "A synthetic change can illustrate the reviewer’s path from question to conclusion, including the difference between recorded history and details that are not captured.",
    evaluation: "A product walkthrough can clarify which events are recorded, how long they remain available, who can review them, and how exports or corrections are represented. The answers depend on the evaluated environment.",
    faq: ["Does the page establish that every action is logged?", "Can audit history prove regulatory compliance?", "Who can review a history entry?"],
    visual: "Capture a synthetic record history with event details, actor context, and visible limitations. Add annotations for the questions a reviewer can answer; do not use compliance badges.",
  },
  "/platform/billing": {
    title: "Clinic billing workflow",
    lead: "Map the financial work around a clinic visit, from understanding the service and amount due to recording payment status and resolving open items.",
    problem: "Billing handoffs can leave staff unsure which service, charge, or balance needs attention. Clear charge sources, payment models, and exception paths make ownership easier to understand.",
    workflow: "A synthetic visit can illustrate charge review, payment recording, and unresolved balance follow-up. The financial record remains distinct from clinical decisions and external processor outcomes.",
    evaluation: "A product walkthrough can clarify which billing steps the current environment supports, which payment methods or processors are involved, and how refunds, partial payments, and failures are represented.",
    faq: ["Does billing include insurance claims?", "Are payments processed by Meta Clinic?", "Can the workflow support memberships or packages?"],
    visual: "Show a synthetic visit’s billing summary with line items, payment state, and remaining staff work. Clearly label any simulated processor or payment status.",
  },
  "/platform/clinical-documentation": {
    title: "Clinical documentation workflow",
    lead: "See how visit documentation can fit into the clinic’s recorded workflow, with review, correction, and responsibility made explicit.",
    problem: "Documentation has to remain understandable to the people responsible for reviewing and acting on it. The information source, author, reviewer, and signing expectations should be clear for each setting.",
    workflow: "A synthetic encounter can illustrate available context, documentation, and what remains unsigned, incomplete, or ready for the next authorized person.",
    evaluation: "A product walkthrough can clarify supported note types, editing and signing behavior, permissions, retention, and any specialty-specific configuration. Clinical content and approval remain with qualified staff.",
    faq: ["Does the system decide what belongs in a note?", "Can a draft be treated as a signed record?", "Are all specialty templates included?"],
    visual: "Use a synthetic encounter capture showing note context, author or reviewer state, and a clearly distinct draft or completion state. Exclude real patient information.",
  },
  "/platform/e-signatures": {
    title: "Electronic signature workflow",
    lead: "Evaluate how a document moves from preparation to review and signature, and how staff can tell what still needs attention.",
    problem: "A signature request is useful only when the signer, document version, and completion state are clear. Each step needs an identified signer, document, and owner.",
    workflow: "A synthetic document can illustrate preparation, signer review, recorded response, and staff follow-up, including an incomplete or declined request.",
    evaluation: "A product walkthrough can clarify which documents and signature methods are supported, what evidence is retained, how identity is handled, and what agreement governs the workflow. Current behavior depends on the evaluated setup.",
    faq: ["Does an electronic signature automatically make a form legally sufficient?", "Can we see who signed which version?", "What happens when a signer does not complete the request?"],
    visual: "Capture a synthetic signature request showing document version, signer step, and request state. Avoid legal-validity claims or invented identity checks.",
  },
  "/platform/forms": {
    title: "Clinic forms",
    lead: "Plan how a clinic presents questions, collects responses, and gives staff a useful view of what is complete or still needs review.",
    problem: "Forms can create extra work when questions do not match the service or staff cannot see what is missing. A clear form purpose and assigned reviewer help prevent those gaps.",
    workflow: "A synthetic form can illustrate setup, patient completion, staff review, correction requests, and the next workflow step. Patient-reported information remains distinct from staff assessment.",
    evaluation: "A product walkthrough can clarify field types, conditional behavior, accessibility, language support, consent handling, and how changes to a form affect existing responses.",
    faq: ["Can forms replace clinician review?", "Can each service use different questions?", "How do staff handle a missing or changed response?"],
    visual: "Show a synthetic form beside its staff review state, marking patient-entered answers and unanswered items without implying clinical clearance.",
  },
  "/platform/inventory": {
    title: "Clinic inventory workflow",
    lead: "Review how staff can organize stock records, investigate discrepancies, and connect inventory work to the clinic’s operating needs.",
    problem: "Stock counts become difficult to trust when receipts, use, adjustments, and item details are scattered. A clear inventory process defines what the clinic tracks and who resolves a mismatch.",
    workflow: "A synthetic item can illustrate receipt, location or quantity review, an adjustment, and the record of why it changed. Any actions requiring a second review should be clear.",
    evaluation: "A product walkthrough can clarify supported item attributes, lot and expiration behavior, adjustment history, reporting, and any purchasing or supplier connection separately.",
    faq: ["Does an inventory count guarantee physical stock accuracy?", "Are supplier orders sent automatically?", "Can inventory be tied to a treatment plan?"],
    visual: "Capture a synthetic inventory item with quantity, location, and recent movement context. Show unknown or unverified stock as such; do not suggest automatic supplier fulfillment.",
  },
  "/platform/invoices": {
    title: "Clinic invoices",
    lead: "Understand how an invoice is prepared, reviewed, shared, and reconciled with the clinic’s records and payment process.",
    problem: "An invoice must explain what is being billed and what action is expected. Clear approval paths for services, fees, adjustments, and patient communication help staff resolve questions.",
    workflow: "A synthetic invoice can illustrate draft review, delivery status, and payment reconciliation, including a correction or failed-delivery path and any work left open.",
    evaluation: "A product walkthrough can clarify invoice fields, numbering, tax and refund handling, delivery channels, processor dependencies, and the exact source of payment status.",
    faq: ["Does an invoice mean payment has cleared?", "Can invoices be corrected after sending?", "Which delivery channels are available?"],
    visual: "Show a synthetic invoice with itemized charges, draft or sent state, and a separate payment state. Label simulated delivery or processor activity.",
  },
  "/platform/labs": {
    title: "Lab workflow coordination",
    lead: "Map the operational steps around lab orders and results, including what staff can see and what still requires qualified review.",
    problem: "Lab work involves a request, a result, and a person responsible for interpretation and follow-up. Each part should have a clear source, and the process should make missing results visible.",
    workflow: "A synthetic lab task can illustrate order context, result receipt, review ownership, and follow-up tracking. Result values remain separate from interpretation or care decisions.",
    evaluation: "A product walkthrough can clarify whether data is entered manually or received from a connection, which vendors and test types are supported, and how corrections, missing results, and review are represented.",
    faq: ["Does the software interpret lab results?", "Are results received automatically from every lab?", "How is an unreviewed result distinguished?"],
    visual: "Use synthetic lab data to show order context, result receipt state, and a clearly pending human review step. Do not display fabricated clinical interpretation.",
  },
  "/platform/medications": {
    title: "Medication workflow coordination",
    lead: "Evaluate how medication-related work and its follow-up can be organized while prescribing decisions remain with authorized clinicians.",
    problem: "Medication work spans patient context, clinician review, documentation, and sometimes inventory or an external pharmacy. The product’s role and any external system boundaries should be clear before evaluation.",
    workflow: "A synthetic medication task can illustrate context review, a clinician-owned decision, documentation, and staff follow-up. External steps remain distinct from work recorded as complete.",
    evaluation: "A product walkthrough can clarify medication data sources, supported prescribing or pharmacy connections, permissions, reconciliation, and failure handling for the current environment.",
    faq: ["Does software recommend or authorize a medication?", "Does a recorded request prove a prescription was transmitted?", "Which pharmacy connections are active?"],
    visual: "Show a synthetic medication workflow with clinician review clearly separated from administrative status and any external transmission state.",
  },
  "/platform/memberships": {
    title: "Clinic memberships",
    lead: "Explore how membership terms, enrollment context, recurring service work, and billing questions can be made easier for a clinic team to review.",
    problem: "Membership operations depend on clear terms, eligibility, effective dates, and staff responses to changes. The offer and clinic responsibilities should be explicit at each step.",
    workflow: "A useful walkthrough follows a synthetic membership from offer explanation and enrollment choice through access review, billing status, and a cancellation or change request.",
    evaluation: "A product walkthrough can clarify supported term configuration, proration and cancellation rules, payment provider behavior, and how staff see a failed or disputed payment.",
    faq: ["Does a membership define clinical eligibility?", "Are recurring payments handled by an external processor?", "Can membership terms be changed for existing members?"],
    visual: "Show a synthetic membership summary with terms, effective state, and next administrative task. Avoid implying payment success unless the source state is shown.",
  },
  "/platform/messaging": {
    title: "Clinic messaging workflow",
    lead: "Review how patient communication is prepared, tracked, and connected to staff follow-up without assuming a message was delivered or read.",
    problem: "Communication can fall through when responsibility and delivery state are unclear. Clinics benefit from clear channel ownership, approved message types, and an escalation path.",
    workflow: "A synthetic message can illustrate staff preparation, recorded send results, replies, and follow-up tasks. Failed, queued, and unknown delivery states remain distinct.",
    evaluation: "A product walkthrough can clarify the currently supported channels, sender identity, consent and preference handling, delivery reporting, retention, and vendor dependencies.",
    faq: ["Does a queued message mean the patient received it?", "Which channels are currently connected?", "Can AI send messages without staff review?"],
    visual: "Capture a synthetic message timeline with channel, author, delivery state, and linked follow-up. Do not use real contact details or imply read receipts that are absent.",
  },
  "/platform/multi-location": {
    title: "Multi-location clinic operations",
    lead: "Assess how teams coordinate work across locations while keeping local responsibilities, shared oversight, and access boundaries clear.",
    problem: "Multiple sites can create duplicate work and conflicting views of availability or ownership. Shared information and locally owned decisions need clear boundaries.",
    workflow: "A task moving between two synthetic locations can illustrate assignment, handoff context, and which location owns the next action.",
    evaluation: "A product walkthrough can clarify location configuration, access scoping, reporting differences, shared inventory or scheduling behavior, and how changes are managed for the evaluated setup.",
    faq: ["Can every clinic record be shared across locations?", "Does adding a location require a separate setup?", "Are reports consolidated automatically?"],
    visual: "Use clearly labeled synthetic locations to illustrate one handoff and the access or assignment context. Do not claim unrestricted cross-location sharing.",
  },
  "/platform/notifications": {
    title: "Clinic notifications",
    lead: "See how a notification can make an operational event visible and help a team member decide whether follow-up is needed.",
    problem: "Too many or poorly targeted alerts make meaningful work harder to notice. Useful notifications have a clear recipient and a response that staff can understand.",
    workflow: "A synthetic event can illustrate its notification, recipient context, acknowledgment, and resulting task, including what happens if the alert is missed or unavailable.",
    evaluation: "A product walkthrough can clarify which events create notifications, how recipients are determined, what delivery channels exist, and whether acknowledgment or escalation is recorded.",
    faq: ["Does a notification prove the task was completed?", "Can each role configure notification rules?", "What happens when an alert is missed?"],
    visual: "Capture a synthetic notification and its linked task state, making delivery, acknowledgment, and completion separate states.",
  },
  "/platform/packages": {
    title: "Clinic packages",
    lead: "Review how a clinic explains a package, records a patient’s selection, and tracks the administrative work around included services.",
    problem: "Packages can be confusing when inclusions, expiration, redemption, and refunds are unclear. Clear offer terms and exception handling help both patients and staff understand the process.",
    workflow: "A synthetic package can illustrate its terms, purchase record, service redemption, and remaining balance, with a change or refund question tracked for staff.",
    evaluation: "A product walkthrough can clarify how package terms, service counts, expiration, payment, refunds, and redemption history are represented and which policies remain clinic-managed.",
    faq: ["Does a package establish that a service is clinically appropriate?", "How are expirations and refunds handled?", "Does the interface itself process package payments?"],
    visual: "Show a synthetic package’s stated terms, redemption history, and remaining administrative status without suggesting clinical eligibility.",
  },
  "/platform/patient-intake": {
    title: "Patient intake",
    lead: "Plan the intake path from patient-provided information to staff review, with missing details and the next responsible person easy to identify.",
    problem: "Intake works best when questions serve a clear purpose and someone owns review. The clinic should define what information is needed before a visit and how incomplete responses are handled.",
    workflow: "A synthetic intake invitation can illustrate the patient response, staff review, and request for clarification. Patient statements remain distinct from verified records and clinical findings.",
    evaluation: "A product walkthrough can clarify form configuration, identity context, accessibility, consent, staff assignment, and how patient corrections are retained.",
    faq: ["Does completing intake clear someone for care?", "Who reviews the submitted information?", "Can intake forms be tailored to a service?"],
    visual: "Pair a synthetic patient intake response with the staff review queue, showing incomplete items and ownership without clinical approval signals.",
  },
  "/platform/patient-management": {
    title: "Patient record management",
    lead: "Evaluate how staff find a patient record, understand its current operational context, and carry forward work that still needs attention.",
    problem: "Patient information can be fragmented across interactions and team roles. Each task needs relevant record details, with a clear process for resolving duplicates or corrections.",
    workflow: "A synthetic patient record can illustrate lookup, recent activity, an administrative update, and an assigned next action. Provenance and unknown fields should remain visible.",
    evaluation: "A product walkthrough can clarify supported record fields, duplicate handling, change history, access boundaries, export options, and data correction processes.",
    faq: ["Does the record show only verified information?", "How are duplicates or corrections handled?", "Can staff see every patient record?"],
    visual: "Show a synthetic patient overview with recent activity, data provenance cues, and open work. Use no real identifying information.",
  },
  "/platform/patient-portal": {
    title: "Patient portal workflow",
    lead: "Explore the patient-facing steps for accessing information or completing a task, alongside the staff view that handles review and follow-through.",
    problem: "A portal experience needs to make the patient’s next step understandable and help staff see what has or has not arrived. Access, identity, and support needs shape the right workflow for each clinic.",
    workflow: "A synthetic patient request can illustrate portal entry, submission, staff review, and a response or next step. A submitted request remains distinct from an approved action.",
    evaluation: "A product walkthrough can clarify available portal functions, identity and account recovery methods, supported devices, message delivery, and how portal activity appears to staff.",
    faq: ["Does portal access expose the full patient record?", "Does a submitted request mean it is approved?", "Which portal functions are available now?"],
    visual: "Pair a synthetic patient portal task with the corresponding staff queue and resulting state. Avoid real identifiers and unverified access claims.",
  },
  "/platform/payments": {
    title: "Clinic payment workflow",
    lead: "Follow how staff present a payment amount, record an outcome, and reconcile exceptions while keeping the source of payment status clear.",
    problem: "A payment workflow needs to distinguish what is owed, what was attempted, and what a processor actually confirmed. Approval and exception handling are key parts of a reliable process.",
    workflow: "A synthetic charge can illustrate a payment attempt, processor response, and staff reconciliation, with pending, failed, and refunded outcomes shown separately.",
    evaluation: "A product walkthrough can clarify supported payment methods, processor availability, fees, refunds, disputes, and whether a screen shows a local record or processor-confirmed state.",
    faq: ["Does a saved payment record mean funds settled?", "Which processor and payment methods are supported?", "How are refunds or disputes handled?"],
    visual: "Show synthetic payment attempts with distinct pending, failed, and confirmed states, each labeled with its source. No real financial information.",
  },
  "/platform/procedures": {
    title: "Procedures for platform clinics",
    lead: "Understand where procedure-related work fits in the clinic workflow, from preparation and team handoffs through documentation and follow-up.",
    problem: "Procedure workflows involve people, supplies, documentation, and a defined next step. The procedure types and responsibilities vary by clinic and should be established by its qualified professionals.",
    workflow: "A representative synthetic task can illustrate preparation, documented work, handoff, and follow-up. Qualified professionals retain ownership of the clinical protocol and decisions.",
    evaluation: "A product walkthrough can clarify which procedure workflow elements are currently represented, how configuration is handled, and what remains outside the product or dependent on local policy.",
    faq: ["Does the platform define or recommend a clinical procedure?", "Can we see procedure-specific documentation and handoffs?", "Are all specialties and procedure types supported?"],
    visual: "Later add an annotated product capture and short synthetic task flow for one procedure type, with review ownership and availability labeled. Do not invent clinical steps or customer proof.",
  },
  "/platform/reporting": {
    title: "Clinic operational reporting",
    lead: "Review how teams can ask operational questions of recorded clinic activity and understand the scope and limits of each view.",
    problem: "A report is useful only when its definitions, date range, and source data are understood. Metrics should match the operational decisions the clinic wants to inform.",
    workflow: "A synthetic report can illustrate filter selection, result interpretation, and follow-up. Missing, delayed, or excluded data should be clear, and a count alone does not establish clinical quality.",
    evaluation: "A product walkthrough can clarify metric definitions, refresh timing, filtering, export behavior, role access, and reconciliation against source records.",
    faq: ["Are report numbers real-time and complete?", "Can reports compare locations fairly?", "Do reports measure clinical outcomes?"],
    visual: "Capture a synthetic report with visible date range, filters, and metric definitions. Mark sample data clearly and avoid unsupported outcome claims.",
  },
  "/platform/roles-permissions": {
    title: "Roles and permissions",
    lead: "Evaluate how a clinic assigns access to team members and reviews whether permissions match their responsibilities.",
    problem: "Access should reflect the tasks a person is expected to perform. Role review considers sensitive areas, approval needs, and how access changes when responsibilities change.",
    workflow: "A synthetic role comparison can illustrate available actions and a permission boundary, along with how an administrator reviews or changes access.",
    evaluation: "A product walkthrough can clarify permission granularity, role setup, administrative authority, access review records, and how restrictions are enforced across the application.",
    faq: ["Does a visible menu determine a person’s permission?", "Can each clinic define custom roles?", "How are access changes recorded?"],
    visual: "Show a synthetic role comparison and a clear permission boundary. Do not present the illustration as evidence of a formal security certification.",
  },
  "/platform/scheduling": {
    title: "Clinic scheduling",
    lead: "Follow an appointment from availability and booking through staff preparation, changes, and the work needed after a visit.",
    problem: "Scheduling depends on accurate visit types, staff, resources, and clinic rules. Common conflicts and their owners are useful starting points for evaluation.",
    workflow: "A synthetic appointment can illustrate booking, confirmation state, rescheduling, and the clinic’s day view, including any relevant staff or resource constraints.",
    evaluation: "A product walkthrough can clarify supported appointment types, recurring visits, resource handling, patient reminders, timezone behavior, and any external calendar connection.",
    faq: ["Does a calendar hold confirm the patient received details?", "Can schedules include rooms or equipment?", "Which calendar connections are currently supported?"],
    visual: "Capture a synthetic day view and one appointment detail showing visit type, assigned resources, and confirmation state without implying reminder delivery.",
  },
  "/platform/tasks": {
    title: "Clinic task tracking",
    lead: "Make the next operational action visible, with an owner, relevant context, and a clear way to distinguish open work from completed work.",
    problem: "Handoffs fail when a request has no clear owner or completion signal. Recurring tasks need clear timing and evidence of completion.",
    workflow: "A synthetic task can illustrate creation, assignment, reassignment, and completion review, as well as a blocked task and its escalation path.",
    evaluation: "A product walkthrough can clarify task creation sources, due-date behavior, role access, notification rules, history, and how tasks link to patient or operational records.",
    faq: ["Does a task marked done prove the underlying work occurred?", "Can tasks be assigned across roles?", "How are overdue or blocked items surfaced?"],
    visual: "Show a synthetic task list with owner, due context, and open, blocked, and completed states. Avoid urgency colors that imply clinical priority.",
  },
  "/platform/telehealth": {
    title: "Telehealth visit workflow",
    lead: "Map how a remote appointment fits with booking, patient context, visit documentation, and the next clinic action.",
    problem: "A video link alone does not cover the remote visit workflow. Staff preparation, patient access, and a connection-failure plan are also part of the journey.",
    workflow: "A synthetic remote appointment can illustrate scheduling, pre-visit preparation, session state, and post-visit follow-up. Any external video provider remains a separate dependency.",
    evaluation: "A product walkthrough can clarify the current video provider, supported devices, access requirements, fallback plan, security terms, and whether any connection is active in the demonstration environment.",
    faq: ["Does a scheduled telehealth visit guarantee a working video connection?", "Which video provider is supported today?", "What is the fallback when a patient cannot join?"],
    visual: "Show synthetic appointment preparation and remote-session states, clearly labeling any simulated video connection and the clinic’s fallback step.",
  },
  "/platform/workflows": {
    title: "Clinic workflow handoffs",
    lead: "Map who does what next across a clinic journey and evaluate whether the relevant context and open work remain visible at each handoff.",
    problem: "A workflow crosses roles and systems, so an apparently complete step can still leave unresolved work. A representative clinic journey helps surface owners, inputs, and exceptions.",
    workflow: "A synthetic journey can illustrate patient access, scheduling, visit work, financial closeout, and follow-up, including points where human review or an external system changes the sequence.",
    evaluation: "A guided demo can compare a clinic’s operating examples with the current product and make gaps, manual work, configuration needs, and dependencies explicit.",
    faq: ["Does a workflow run without staff action?", "Can every clinic configure every sequence?", "How are exceptions and external steps represented?"],
    visual: "Create a later annotated sequence using synthetic screens and a concise handoff diagram. Separate current demonstrated behavior from proposed or unavailable steps.",
  },
  "/ai": {
    title: "AI assistance in clinic workflows",
    lead: "Evaluate proposed AI assistance by task, information used, reviewer, and limits. Keep staff and clinician review visible wherever a decision or communication is involved.",
    problem: "AI can add risk when its role, data source, or failure state is unclear. A bounded administrative task and explicit human review help make those limits understandable.",
    workflow: "An example can show the input, proposed output, reviewer edits, and resulting action as separate steps, including an incomplete input or incorrect suggestion.",
    evaluation: "A product walkthrough can clarify which AI functions are actually available, the data flow and retention, model or vendor dependencies, review controls, and the supported failure path before relying on a capability.",
    faq: ["Does AI make clinical decisions?", "Is every AI page describing a feature available today?", "What information is sent to an AI provider?"],
    visual: "Use a clearly labeled synthetic example showing input, proposed output, human edits, and approval boundary. Include a limitation or correction state; no autonomous care claims.",
  },
  "/ai/avatar": {
    title: "AI avatar concepts for clinic access",
    lead: "Assess whether a conversational avatar would make a defined patient or staff task easier, and what accessible alternatives and human support are needed.",
    problem: "A lifelike interface can imply authority or understanding beyond what a system provides. Its purpose, audience, and handoff to a person should be clear.",
    workflow: "A synthetic, low-risk information exchange can illustrate how a user corrects the system, switches to another format, or reaches staff when it cannot help.",
    evaluation: "A product walkthrough can clarify whether an avatar exists in the current product, what it can say or collect, how identity and consent work, and how accessibility and escalation are handled.",
    faq: ["Is an AI avatar a clinician or care provider?", "Can users choose a non-avatar interaction?", "Is this capability currently available?"],
    visual: "If a product capture is later approved, label it as a synthetic concept or current feature accurately. Include a plain text alternative and visible route to human help.",
  },
  "/ai/clinical-summaries": {
    title: "AI-assisted clinical summaries",
    lead: "Evaluate a summary as a draft that a qualified reviewer checks against its source context before it is used in a clinical workflow.",
    problem: "A concise summary may omit uncertainty, timing, or a detail that changes meaning. Source boundaries and clinician review responsibility determine whether it is useful.",
    workflow: "A comparison of synthetic source material and a proposed summary can reveal omissions or unsupported statements and show how a reviewer edits or rejects the draft.",
    evaluation: "A product walkthrough can clarify the current feature status, input sources, citation or trace-back behavior, retention, known limits, and whether summary generation is available for the intended record type.",
    faq: ["Can the summary be relied on without review?", "Does every sentence link back to source information?", "Which records can be summarized today?"],
    visual: "Show synthetic source snippets beside a draft summary and a human correction state. Highlight omissions and source boundaries rather than claiming accuracy.",
  },
  "/ai/documentation": {
    title: "AI-assisted clinic documentation",
    lead: "Explore how a draft could support documentation work while keeping source material, clinician edits, and final approval distinct.",
    problem: "Documentation assistance can introduce errors or hide what was generated. Clinic policy determines which source information may be used and how the responsible clinician reviews each draft.",
    workflow: "A synthetic source input can illustrate a proposed draft, reviewer corrections, and an explicit save or approval step, including rejection and missing-information handling.",
    evaluation: "A product walkthrough can clarify availability, supported note types, data handling, editing and signing boundaries, and whether any generated content can enter a record before review.",
    faq: ["Does generated text become part of the record automatically?", "Who is responsible for checking a draft?", "What source data is used?"],
    visual: "Capture a synthetic draft with generated and human-edited content distinguishable, alongside an explicit review control and non-final state.",
  },
  "/ai/follow-up": {
    title: "AI-assisted follow-up preparation",
    lead: "Consider assistance that could help staff prepare follow-up work, with the person responsible for deciding what to send or do clearly identified.",
    problem: "Follow-up suggestions can miss clinic context or imply a decision has been made. The task, source information, and staff approval point define the limits of any assistance.",
    workflow: "A synthetic completed visit can illustrate a proposed follow-up task, its source context, reviewer edits, and who approved any resulting action.",
    evaluation: "A product walkthrough can clarify whether suggestions are available, which events and data inform them, how staff can correct or dismiss them, and whether any external message is sent.",
    faq: ["Does AI decide which care follow-up is needed?", "Will a suggestion contact a patient automatically?", "Can staff inspect the information behind a suggestion?"],
    visual: "Show a synthetic proposed follow-up beside its source context, staff review, and separate send or task state. Do not imply autonomous care planning.",
  },
  "/ai/intake": {
    title: "AI-assisted intake support",
    lead: "Review whether assistance can help organize patient-provided intake information for staff, without treating an answer or summary as verification or approval.",
    problem: "Intake responses may be incomplete, ambiguous, or patient-reported. Staff need a clear way to notice uncertainty and correct a generated summary before use.",
    workflow: "A comparison of synthetic patient answers with an organized draft can surface missing or conflicting items and a reviewer request for clarification.",
    evaluation: "A product walkthrough can clarify current availability, questions and source fields used, patient notice, data retention, language behavior, and how staff corrections are recorded.",
    faq: ["Does AI intake determine eligibility for care?", "Are patient responses independently verified?", "Can staff review the original answers?"],
    visual: "Pair synthetic original answers with a proposed organization and explicit uncertainty markers, keeping original patient statements accessible.",
  },
  "/ai/lab-review": {
    title: "AI support for lab review tasks",
    lead: "Define a narrow administrative review task around lab information while leaving interpretation, diagnosis, and care decisions to qualified clinicians.",
    problem: "Automated descriptions can misstate a value, reference range, or clinical context. A narrow administrative scope helps prevent unsupported inference.",
    workflow: "A synthetic example can use lab values to demonstrate source checking, an administrative draft or comparison, clinician review, and a clear unresolved state for ambiguous data.",
    evaluation: "A product walkthrough can clarify whether any feature is available, which result formats and sources it handles, how units and reference ranges are preserved, and whether source traceability exists.",
    faq: ["Does AI interpret or diagnose from lab results?", "Can it preserve source units and ranges?", "Is a lab-review feature available now?"],
    visual: "Only use synthetic values and visibly preserve units and source context. Show human review and uncertainty; do not generate treatment recommendations.",
  },
  "/ai/patient-communication": {
    title: "AI-assisted patient communication",
    lead: "Evaluate support for preparing clear patient communication while preserving staff review, approved wording, patient preferences, and honest delivery status.",
    problem: "Generated language can be inaccurate, confusing, or inappropriate for a patient’s context. Message types and review expectations should be defined before any message is sent.",
    workflow: "A synthetic draft can be compared with approved source information, edited for clarity, and shown separately from approval, delivery, or patient response.",
    evaluation: "A product walkthrough can clarify current availability, data sent to any model provider, consent and channel rules, language support, audit trail, and delivery confirmation source.",
    faq: ["Can AI send clinical advice directly?", "Does an approved draft mean it was delivered?", "Can the patient’s communication preferences be respected?"],
    visual: "Show a synthetic draft, source reference, staff edits, approval, and a distinct delivery state. Avoid real contact information and unsourced health advice.",
  },
  "/ai/patient-interviews": {
    title: "AI-assisted patient interview concepts",
    lead: "Plan a bounded interview experience that captures patient-reported information for staff review and makes its limits and human handoff clear.",
    problem: "An interview can feel like a clinical assessment even when it only collects information. Clear scope, patient notice, accessibility, and escalation expectations help set appropriate boundaries.",
    workflow: "A synthetic question and patient response can illustrate any supported transcript or summary, staff review, an unclear answer, and a route to human assistance.",
    evaluation: "A product walkthrough can clarify whether an interview feature exists, supported modalities and languages, consent and retention, accessibility, and what happens when a patient raises an urgent concern.",
    faq: ["Does an AI interview assess or triage a patient?", "Can a patient stop and speak with staff?", "What is recorded and retained?"],
    visual: "Use a synthetic, clearly non-clinical capture with patient notice, transcript review, and human help option. Never imply emergency monitoring.",
  },
  "/ai/scribe": {
    title: "AI scribe evaluation",
    lead: "Assess a scribe workflow by its recording boundary, draft output, review controls, and the clinician’s explicit responsibility for the final record.",
    problem: "Audio capture and generated notes raise distinct questions about consent, accuracy, and retention. The recording control and notice to patients and clinicians should be clear.",
    workflow: "If a current demonstration is available, synthetic audio can illustrate the capture notice, draft generation, correction, and final review, alongside a no-recording or discard path.",
    evaluation: "A product walkthrough can clarify current status, supported devices and languages, recording and retention behavior, data recipients, note destinations, consent process, and failure handling.",
    faq: ["Does a generated note require clinician review?", "Is audio recorded or retained?", "Is an AI scribe available in this environment?"],
    visual: "Later capture must use synthetic content and show notice, recording state, draft provenance, and reviewer control. Do not claim accuracy or automatic signing.",
  },
  "/ai/voice": {
    title: "Voice assistance evaluation",
    lead: "Explore a voice interaction as a possible way to complete a defined task, with accessibility, correction, privacy, and human support visible.",
    problem: "Speech recognition can mishear names, numbers, or clinical terms. Appropriate tasks and a clear transcript review path help manage those limitations.",
    workflow: "A synthetic example can use speech to compare spoken input with a transcript, correct an error, and confirm any resulting draft before it enters another workflow.",
    evaluation: "A product walkthrough can clarify feature availability, supported languages and devices, audio handling and retention, transcript correction, accessibility alternatives, and noisy-environment behavior.",
    faq: ["Does voice input save or send information automatically?", "Can users review and correct the transcript?", "Which languages and devices are supported?"],
    visual: "Show synthetic voice input beside its transcript and correction step, with microphone and recording states explicit. Include a non-voice alternative.",
  },
  "/ai/workflow-automation": {
    title: "AI and workflow automation",
    lead: "Separate deterministic workflow rules from AI suggestions, then evaluate the approvals and recovery steps required before any action occurs.",
    problem: "Automation can hide responsibility when a trigger, rule, or generated suggestion is unclear. Permitted actions, required approval, and recovery from an incorrect step need clear ownership.",
    workflow: "A synthetic trigger can illustrate rule evaluation, any proposed AI output, human approval, execution result, and recovery path. External actions remain distinct.",
    evaluation: "A product walkthrough can clarify what is currently automated, which steps need approval, how rules are configured and audited, and what rollback or retry behavior exists.",
    faq: ["Can AI autonomously perform clinical work?", "Which steps require staff approval?", "How can an incorrect automated action be corrected?"],
    visual: "Use a synthetic flow diagram that distinguishes rules, AI suggestions, approval, and execution results. Label proposed or unavailable steps as concepts.",
  },
};

const teamSections: Record<string, readonly [string, string]> = {
  "/platform": ["A shared clinic view should help front-desk, care, and administrative staff understand the recorded state of a journey. In a walkthrough, compare the information each role needs and any details that remain unavailable.", "Each transition still has an owner: patient access to staff preparation, staff to the clinician, and the visit to follow-up. Human review remains necessary for professional decisions and unresolved exceptions."],
  "/platform/audit-history": ["A reviewer needs the record, relevant event details, and enough context to distinguish a correction from a new action. The exact events and fields visible depend on the current product configuration.", "An event history can support investigation, while a person still determines what it means and whether action is needed. Corrections and events outside the captured history require separate handling."],
  "/platform/billing": ["Front-desk and billing staff need to see the service context, amount, payment state, and any unresolved balance without confusing those details with care decisions.", "Payment status should move between staff and any processor as a distinct recorded outcome. A staff member reviews exceptions such as partial, failed, refunded, or disputed transactions."],
  "/platform/clinical-documentation": ["Clinicians and authorized staff need encounter context, authorship, and a clear distinction between unfinished and reviewed documentation. The fields and note types require environment-specific confirmation.", "Documentation may pass from preparer to clinician reviewer and then to the next authorized role. The clinician remains responsible for interpretation, correction, and any final approval."],
  "/platform/e-signatures": ["Staff need to identify the document version, intended signer, and request state. The signer should be able to review the document before recording a response.", "A signature request moves between document preparer, signer, and staff follow-up. Staff must resolve incomplete or declined requests; a status alone does not establish legal sufficiency."],
  "/platform/forms": ["Staff need to distinguish patient-entered responses, unanswered questions, and their own review notes. A reviewer should see enough context to decide whether clarification is needed.", "Responses pass from the patient to an assigned reviewer and may return for clarification. Patient statements are not automatically verified or converted into a clinical assessment."],
  "/platform/inventory": ["Operations staff need item identity, recorded quantity, location, and movement context to investigate a discrepancy. Physical counts and the reasons behind adjustments remain important context.", "Receiving, use, adjustment, and reconciliation may involve different staff responsibilities. A person reviews discrepancies and any lot, expiration, or recall-related next action."],
  "/platform/invoices": ["Billing staff need itemized charges, invoice state, delivery outcome, and payment state presented as separate facts. The source of each state should be understandable.", "Invoice preparation can pass from staff review to patient delivery and later reconciliation. Exceptions such as correction, failed delivery, or payment mismatch need a responsible staff member."],
  "/platform/labs": ["The care team needs to distinguish an order or request from a received result and a reviewed result. Source, units, and missing information remain visible context for a qualified reviewer.", "Lab information may arrive from staff entry or an external source, depending on confirmed setup. Qualified clinicians retain interpretation and care decisions; staff can track unresolved receipt or follow-up work."],
  "/platform/medications": ["Authorized clinicians need medication context and documentation, while operations staff may need related inventory or pharmacy status. These views should not imply that a prescription was transmitted when only a local record exists.", "The workflow can cross clinician review, staff follow-up, inventory, and an external pharmacy. Clinicians own prescribing decisions, and staff confirm any external response separately."],
  "/platform/memberships": ["Staff need the member’s stated terms, effective dates, access context, and billing state to respond to enrollment changes. Payment status should have a visible source.", "Enrollment, service access, recurring billing, and cancellation can involve separate owners. Staff review exceptions and clinic-defined eligibility rather than treating membership status as a clinical decision."],
  "/platform/messaging": ["The team needs message content, intended channel, responsible staff member, and a delivery state that distinguishes queued, sent, failed, or unknown outcomes.", "A staff member prepares or reviews communication, a channel may return a delivery result, and the team handles replies or failures. Sending and clinical advice require the appropriate human oversight."],
  "/platform/multi-location": ["Managers and location teams need to see assignment and location context without losing the boundary between shared oversight and local responsibility. Access depends on verified configuration.", "Work transferred between sites needs a receiving owner and enough context to continue safely. Local staff still review site-specific exceptions and decisions."],
  "/platform/notifications": ["A notification is useful when its recipient, event, and related open task are clear. Staff need to distinguish the alert itself from the underlying work state.", "An alert can lead to acknowledgment, assignment, or escalation, but it does not complete the task automatically. A person follows up when delivery is missed or unavailable."],
  "/platform/packages": ["Staff need package terms, recorded purchase status, included service count, and redemption history to answer patient questions. These administrative details do not establish clinical appropriateness.", "Package setup, payment, redemption, and adjustments may have separate owners. Staff review refunds, remaining balance, and disputes against the clinic’s stated terms."],
  "/platform/patient-intake": ["The patient provides information; staff need the original responses, completion state, and items needing clarification before a visit. Review ownership should be visible.", "Intake moves from patient completion to staff review and, where needed, a clarification request. A clinician separately determines what the information means for care."],
  "/platform/patient-management": ["Staff need relevant patient identity and activity context, with record source, unknown details, and correction history easy to distinguish.", "Record changes may pass between staff who enter information and authorized reviewers who correct or reconcile it. Access and identity questions require the configured permission process."],
  "/platform/patient-portal": ["Patients need a clear next step and an understandable request state; staff need to see submissions, missing information, and ownership in their work queue.", "A patient submission passes to staff review before a response or action. Portal access does not itself approve a request or determine what information a user may access."],
  "/platform/payments": ["Staff need the amount due, attempted payment, processor response, and reconciliation status presented distinctly. Pending or unknown states should not appear settled.", "A payment attempt crosses the clinic interface and payment processor, then returns to staff for reconciliation. Staff handle failures, refunds, or disputes using the confirmed source state."],
  "/platform/procedures": ["The team needs the procedure’s operational context, assigned roles, preparation status, and documentation state. Clinical details and protocols are set by the clinic’s qualified professionals.", "Preparation, procedure documentation, and follow-up pass between designated staff and clinicians. A qualified professional reviews decisions and any exception; software status is not clinical approval."],
  "/platform/reporting": ["Managers need the report’s metric definitions, time window, filters, and source context to understand what a number includes or omits.", "A report can prompt a question for an operations owner to investigate against source records. Human review is needed for incomplete data and before using results to make operational decisions."],
  "/platform/roles-permissions": ["Administrators need a clear view of role assignments and the actions each role may take. Staff should understand when a task requires another authorized person.", "Access requests and role changes pass through the clinic’s designated administrator. The server’s authorization controls, rather than visible navigation, determine whether an action is permitted."],
  "/platform/scheduling": ["Schedulers need visit type, availability, assigned staff or resources, and appointment state together. Patients and staff may have different next steps when a visit changes.", "Booking and confirmation pass to staff preparation and the patient’s appointment experience. Staff handle conflicts and cancellations; a calendar state alone does not establish successful patient notification."],
  "/platform/tasks": ["Team members need an owner, due context, related record, and a distinct open, blocked, or completed state to know what action remains.", "Tasks pass from creator to assignee and may be reassigned or escalated. A person verifies the underlying work before relying on a completion state."],
  "/platform/telehealth": ["Staff and patients need appointment preparation and session access details, while the team needs a clear view of the visit and post-visit work. External video availability requires confirmation.", "The clinic prepares the appointment, the patient joins through the confirmed channel, and staff handle connection trouble or follow-up. Clinicians remain responsible for the visit and its decisions."],
  "/platform/workflows": ["Each role needs the context and open work relevant to its step, along with clear ownership when a process crosses a system or team boundary.", "Handoffs can move from patient access to scheduling, clinician work, billing, and follow-up. A person owns exceptions and reviews any external or clinical action before it is treated as complete."],
  "/ai": ["A team evaluating AI needs to see the input, proposed output, reviewer, and action boundary together. Each feature’s data flow and availability require separate confirmation.", "AI output remains a proposal until an appropriate person reviews it. The human owner handles corrections, incomplete context, and the decision to proceed or discard."],
  "/ai/avatar": ["Patients and staff need to know whether an avatar is a concept or available feature, what task it serves, and how to use an accessible alternative.", "A user should be able to correct or leave the interaction and reach staff when needed. The avatar does not act as a clinician or replace human support."],
  "/ai/clinical-summaries": ["A reviewer needs the source context beside the proposed summary, with omissions, uncertainty, and unsupported statements easy to identify.", "A walkthrough should trace how a draft would reach a qualified reviewer for correction, rejection, or appropriate use. No summary replaces review of the source or professional judgment."],
  "/ai/documentation": ["The responsible clinician needs to distinguish source material, generated draft text, and their own edits before approving documentation.", "If available, a draft should reach the clinician for correction and explicit review before any permitted record action. Generated content is not inherently complete, accurate, or final."],
  "/ai/follow-up": ["Staff need the source context behind a proposed follow-up and a clear distinction between a suggestion, an assigned task, and a patient communication.", "A staff member reviews the proposal, edits or dismisses it, and owns any approved next action. Care decisions and patient contact require the relevant human authorization."],
  "/ai/intake": ["Staff need original patient answers alongside any organized draft, including missing or conflicting responses and their source.", "Patient-provided information passes to staff for clarification or review. AI organization does not verify a response or determine care eligibility."],
  "/ai/lab-review": ["Qualified reviewers need source values, units, reference ranges, and any proposed administrative summary presented without unsupported interpretation.", "A clinician reviews result information and decides whether further action is appropriate. AI assistance must not substitute for interpretation or diagnosis."],
  "/ai/patient-communication": ["Staff need approved source information, proposed wording, channel preference, and the person responsible for reviewing a draft before sending.", "A human reviews and approves any communication; delivery is a separate channel outcome. AI does not independently provide clinical advice or establish patient receipt."],
  "/ai/patient-interviews": ["Patients need clear notice about the interview’s purpose, what is collected, and how to reach staff; staff need the response and any transcript or summary for review.", "Patient responses pass to staff for review and clarification. The interview does not assess or triage, and any urgent concern needs the clinic’s human support process."],
  "/ai/scribe": ["The clinician and patient need clear recording notice and control, while the clinician needs to distinguish captured source material from generated draft notes.", "If available, capture and draft preparation pass to clinician review, correction, and a deliberate record action. Consent, retention, and discard behavior must be verified for the specific feature."],
  "/ai/voice": ["The user needs a visible microphone state and transcript they can review, correct, or discard; another input method should remain available.", "Spoken input becomes a transcript or draft for human correction before any later action. A misheard value should not be treated as confirmed information."],
  "/ai/workflow-automation": ["Staff need to distinguish a configured rule, an AI suggestion, a required approval, and an external action in the same workflow view.", "A trigger or proposal should pass through required human approval before any consequential action. The team needs a correction and recovery path for failures or unintended outcomes."],
};

const faqAnswers: Record<string, readonly [string, string, string]> = {
  "/platform/audit-history": ["The exact event coverage must be confirmed for the environment and record type being evaluated.", "No. A history view is one input to review and does not establish compliance by itself.", "Confirm role access and review controls in the current product walkthrough."],
  "/platform": ["No. Each module and workflow needs current, environment-specific availability confirmation.", "Yes. Bring a representative journey and the roles involved to a guided walkthrough.", "No. Confirm which existing tools remain involved and how each handoff is represented."],
  "/platform/billing": ["Insurance billing is a separate scope to confirm; do not infer claims support from a billing overview.", "Payment processing depends on the configured provider. Verify the provider response represented by each state.", "Review how terms, eligibility, and recurring charges are configured for the current environment."],
  "/platform/clinical-documentation": ["No. Qualified staff determine and review clinical content.", "No. Draft, saved, and signed states should be confirmed separately in the evaluated workflow.", "Confirm the available templates and configuration for the clinic’s specialty."],
  "/platform/e-signatures": ["Legal sufficiency depends on document, jurisdiction, and process; review with qualified counsel.", "Ask to inspect version and signer evidence in the current workflow.", "Confirm any expiration, reminder, and staff follow-up behavior directly."],
  "/platform/forms": ["No. Forms collect information; the clinic defines the review and decision process.", "Confirm which form rules and service-specific configurations are supported.", "Inspect how edits, resubmissions, and staff clarification requests are recorded."],
  "/platform/inventory": ["No. Recorded counts require clinic processes for physical reconciliation.", "Do not assume supplier ordering; verify any supplier connection and its current status.", "Confirm whether and how any relationship to treatment planning is supported."],
  "/platform/invoices": ["No. Sending an invoice and receiving confirmed payment are separate events.", "Verify correction behavior, history, and patient notification for the current setup.", "Confirm each enabled delivery method and its reported outcome."],
  "/platform/labs": ["No. Clinical interpretation belongs to qualified clinicians.", "Do not assume a lab feed; verify the exact lab connection and result source.", "Inspect how pending review is represented in the current workflow."],
  "/platform/medications": ["No. Authorized clinicians retain prescribing decisions.", "No. A local record is distinct from a confirmed external transmission.", "Confirm each pharmacy connection and its availability before relying on it."],
  "/platform/memberships": ["No. Clinical eligibility follows the clinic’s professional process.", "Verify the processor and recurring payment behavior in the current configuration.", "Confirm how changes apply to existing terms and members."],
  "/platform/messaging": ["No. Queued, sent, delivered, and read may be different states.", "Confirm which channels are active in the evaluated environment.", "Do not assume automatic sending; inspect approval requirements for the specific workflow."],
  "/platform/multi-location": ["Access depends on configured roles and product behavior; confirm the actual boundaries.", "Confirm implementation and commercial scope for an additional location.", "Verify report definitions and whether cross-location aggregation is available."],
  "/platform/notifications": ["No. A notification is a signal, not proof that underlying work is complete.", "Confirm available controls and who is permitted to change them.", "Ask how missed alerts appear in open work and who owns escalation."],
  "/platform/packages": ["No. Package purchase or redemption does not determine clinical appropriateness.", "The clinic’s terms and configured billing flow govern; verify how exceptions are recorded.", "Confirm the payment provider and state source for the evaluated workflow."],
  "/platform/patient-intake": ["No. Intake completion does not establish clinical clearance.", "The clinic defines review ownership; demonstrate how assignment is represented.", "Confirm supported intake configuration and review behavior."],
  "/platform/patient-management": ["Record details can have different sources and states; verify provenance in the product.", "Ask to see duplicate resolution, correction permissions, and history.", "Access depends on configured permissions; confirm with role-based examples."],
  "/platform/patient-portal": ["Portal scope and permissions must be confirmed; do not assume full-record access.", "No. A request is a request until the clinic reviews and acts on it.", "Confirm available functions and account access behavior in the current environment."],
  "/platform/payments": ["No. A local record and processor settlement are distinct; verify the state source.", "Confirm provider, accepted methods, and availability for your evaluation.", "Ask to inspect the processor and staff path for each exception."],
  "/platform/procedures": ["No. The product organizes workflow; it does not establish clinical protocols.", "Confirm the workflow elements shown in a current synthetic demonstration.", "Evaluate each procedure type separately; do not assume universal specialty coverage."],
  "/platform/reporting": ["Refresh and completeness depend on the data source and report; confirm both.", "Check definitions, filters, and location mapping before comparing sites.", "Operational reports do not by themselves establish clinical outcomes."],
  "/platform/roles-permissions": ["No. Navigation is presentation; verify actual authorization behavior by role.", "Confirm the available role model and any configuration boundaries.", "Inspect the current history and administrative controls directly."],
  "/platform/scheduling": ["No. Booking and patient receipt of a reminder are distinct states.", "Confirm which resources can be scheduled and how conflicts appear.", "Verify the named calendar provider and current connection status."],
  "/platform/tasks": ["A status is a record of workflow state, not independent proof of work quality.", "Confirm assignable roles, access rules, and transfer behavior.", "Inspect due, blocked, and overdue handling in the current interface."],
  "/platform/telehealth": ["No. Scheduling does not guarantee device, network, or provider availability.", "Confirm the configured provider and whether it is active in this environment.", "Ask the clinic to define and demonstrate its fallback process."],
  "/platform/workflows": ["Some steps may need staff action; follow the exact sequence in a demonstration.", "Configuration limits depend on the product and environment; confirm specific changes.", "Ask to inspect exception, manual, and external-system states separately."],
  "/ai": ["No. AI outputs do not replace professional judgment or authorized decisions.", "No. Page copy describes an evaluation topic; confirm each feature’s current status.", "Data flow and retention must be verified for the specific feature and provider."],
  "/ai/avatar": ["No. An avatar is an interface, not a clinician or source of professional care.", "Confirm whether alternatives exist and can be used for the intended task.", "This route alone does not establish availability; request a current product demonstration."],
  "/ai/clinical-summaries": ["No. A qualified reviewer must check source information and the proposed summary.", "Traceability must be confirmed for the exact feature; do not assume sentence-level links.", "Verify supported record types and feature availability in the current environment."],
  "/ai/documentation": ["Confirm whether content remains a draft and what explicit action saves or signs it.", "The responsible qualified clinician reviews and approves clinical documentation.", "Ask which input sources the current feature uses and how they are handled."],
  "/ai/follow-up": ["No. Care decisions remain with qualified staff and clinicians.", "Do not assume that a suggestion sends a message or creates an external action.", "Request the source context and reviewer controls in a current demonstration."],
  "/ai/intake": ["No. Intake assistance does not establish clinical eligibility.", "Patient-reported information remains unverified unless the clinic separately verifies it.", "Confirm whether original answers remain available alongside any summary."],
  "/ai/lab-review": ["No. Interpretation and diagnosis remain with qualified clinicians.", "Ask to verify unit, range, and result-source preservation using supported examples.", "Confirm current capability status before planning around it."],
  "/ai/patient-communication": ["Do not assume AI may send advice; verify review and sending controls for each use.", "No. Approval and delivery are separate states.", "Confirm whether patient channel and language preferences are represented and enforced."],
  "/ai/patient-interviews": ["No. An interview does not establish assessment or triage.", "Ask to see stop, correction, and human-support options for the current experience.", "Confirm what is collected, processed, and retained before any use."],
  "/ai/scribe": ["Yes, review and approval boundaries must be confirmed; generated content is not inherently final.", "Recording and retention details require feature-specific confirmation.", "This route does not establish that a scribe is currently available."],
  "/ai/voice": ["Confirm whether speech is only transcribed or also triggers another action.", "Review and correction behavior should be demonstrated before use.", "Supported languages and devices require current product confirmation."],
  "/ai/workflow-automation": ["No. AI does not assume clinical authority; confirm each specific action boundary.", "Map required approvals and permissions for the evaluated workflow.", "Ask to see the correction, retry, and audit path before enabling any action."],
};

function specialtyExampleFor(path: string) {
  if (/inventory|lot/.test(path)) return "/infusion/medication-inventory";
  if (/medication/.test(path)) return "/weight-loss/medication-management";
  if (/billing|payments|invoices/.test(path)) return "/primary-care/cash-pay";
  if (/telehealth|scheduling/.test(path)) return "/weight-loss/telehealth";
  if (/membership|packages/.test(path)) return "/weight-loss/memberships";
  if (/scribe|documentation|clinical-summaries/.test(path)) return "/behavioral-health/clinical-notes";
  if (/intake|forms|interviews/.test(path)) return "/weight-loss/patient-intake";
  if (/labs|lab-review/.test(path)) return "/weight-loss/labs";
  if (/portal|messaging|patient-communication/.test(path)) return "/behavioral-health/patient-portal";
  if (/follow-up|notifications|tasks|workflow/.test(path)) return "/weight-loss/follow-ups";
  return "/weight-loss";
}

export function getPlatformAiPageBrief(path: string): Partial<GrowthPage> | null {
  const brief = briefs[path];
  if (!brief) return null;
  if (["/ai", "/ai/scribe", "/ai/documentation"].includes(path)) {
    return {
      group: "AI",
      title: "Scribe preparation and clinician review",
      eyebrow: "Inside Scribe",
      headline: "Prepare the source. Keep the clinician in charge.",
      lead: "Connect the patient and visit, check recording consent, and prepare the transcript. See the current Scribe workspace before draft generation.",
      steps: [
        "Select the patient and visit",
        "Check consent and source material",
        "Review any generated draft",
      ],
      note: "The captures show preparation and transcript controls. No generated draft is shown. Generation depends on the configured provider and current consent.",
      primaryCta: { label: "Try the demo", path: "/demo" },
      secondaryCta: {
        label: "Explore the steps",
        path: "#product-walkthrough",
      },
      sections: [
        {
          heading: "Give the draft a clear source",
          body: "The Context tab keeps the session, visit, template, consent, and selected lab context together. The Transcript tab provides recording and import controls. Confirm the patient and allowed source before capture or generation.",
        },
        {
          heading: "Review before the record changes",
          body: "Check any generated draft against its source, correct missing or unsupported content, and make the record action deliberately. A generated draft does not sign the encounter. Final authorship stays with the clinician.",
        },
      ],
      questions: [
        {
          question: "Can I see a generated draft in these screens?",
          answer:
            "No. These captures show session preparation and transcript controls before generation. Evaluate generated content separately when the provider and consent requirements are met.",
        },
        {
          question: "What is required before recording?",
          answer:
            "Current recording consent is required. The app stops capture when the accepted consent or capture lease is no longer current.",
        },
        {
          question: "Does generating a draft sign the note?",
          answer:
            "No. The clinician reviews and corrects the draft; signing remains a separate encounter action.",
        },
      ],
      links: [
        { label: "Clinical notes tutorial", path: "/features/clinical-notes" },
        { label: "Intake tutorial", path: "/features/intake-forms" },
        { label: "Request a walkthrough", path: "/book-demo" },
      ],
    };
  }
  if (path === "/platform/telehealth") {
    return {
      group: "Platform",
      title: "Telehealth preparation and readiness",
      eyebrow: "Before the video visit",
      headline: "Know what is ready before the call.",
      lead: "Review preparation instructions, consent policy, and the virtual waiting room. The demo shows setup and readiness with no active video connection.",
      steps: [
        "Review patient preparation",
        "Publish the clinic policy",
        "Check video readiness",
      ],
      primaryCta: { label: "Try the demo", path: "/demo" },
      secondaryCta: {
        label: "Explore the steps",
        path: "#product-walkthrough",
      },
      sections: [
        {
          heading: "Prepare the patient before entry",
          body: "Telehealth settings hold preparation wording, support details, patient location and callback requirements, and timing. Review the policy your clinic intends to publish before using it for visits.",
        },
        {
          heading: "Check the dependencies together",
          body: "New video bookings require a connected provider, a published policy, a successful provider health check, and an eligible visit type. The waiting room shows the current readiness state; a scheduled time alone cannot establish a working connection.",
        },
      ],
      questions: [
        {
          question: "Does this demo show a live call?",
          answer:
            "No. The captures show preparation and waiting-room readiness. Video is not connected in the captured demo.",
        },
        {
          question: "What enables new video bookings?",
          answer:
            "The clinic needs a connected provider, published policy, successful health check, and at least one eligible visit type.",
        },
        {
          question: "Where do staff find the work?",
          answer:
            "Open the virtual waiting room and filter by date, site, clinician, or status. Review the readiness message before relying on a join action.",
        },
      ],
      links: [
        { label: "Scheduling tutorial", path: "/features/scheduling" },
        { label: "Request a walkthrough", path: "/book-demo" },
      ],
    };
  }
  const isAi = path.startsWith("/ai");
  const root = path === "/platform" || path === "/ai";
  const audience = isAi ? "Clinic owners, practice managers, and clinical reviewers evaluating AI-assisted work" : "Clinic owners, practice managers, and teams evaluating clinic operations";
  const answers = faqAnswers[path] ?? [
    "Confirm the exact behavior in a current product walkthrough; page descriptions do not establish availability.",
    "Map the clinic’s roles, data, and exception paths, then inspect those details in a synthetic demonstration.",
    "Verify configuration, external dependencies, and the responsible reviewer before relying on this workflow.",
  ];
  const parent = isAi ? "/ai" : "/platform";
  const links = path === "/platform"
    ? [
      { label: "Home", path: "/" },
      { label: "Explore clinic workflows", path: "/platform/workflows" },
      { label: "Weight loss clinics", path: "/weight-loss" },
      { label: "Behavioral health practices", path: "/behavioral-health" },
      { label: "Cash-pay primary care", path: "/primary-care/cash-pay" },
      { label: "Browse clinic resources", path: "/resources/guides" },
      { label: "Explore the demo", path: "/demo" },
      { label: "Request a demo", path: "/book-demo" },
    ]
    : path === "/ai"
      ? [
        { label: "Home", path: "/" },
        { label: "Platform overview", path: "/platform" },
        { label: "Explore AI documentation", path: "/ai/documentation" },
        { label: "Weight loss intake example", path: "/weight-loss/ai-intake" },
        { label: "Behavioral health documentation example", path: "/behavioral-health/ai-scribe" },
        { label: "Browse clinic resources", path: "/resources/guides" },
        { label: "Explore the demo", path: "/demo" },
        { label: "Request a demo", path: "/book-demo" },
      ]
      : [
        { label: `${isAi ? "AI" : "Platform"} overview`, path: parent },
        { label: "Home", path: "/" },
        { label: "Related specialty example", path: specialtyExampleFor(path) },
        { label: "Browse clinic resources", path: "/resources/guides" },
        { label: "Explore the demo", path: "/demo" },
        { label: "Request a demo", path: "/book-demo" },
      ];

  return {
    group: isAi ? "AI" : "Platform",
    title: brief.title,
    eyebrow: isAi ? "AI evaluation" : "Clinic platform",
    headline: path === "/platform" ? "Explore platform with Meta Clinic." : path === "/ai" ? "Explore AI with Meta Clinic." : brief.title,
    lead: brief.lead,
    steps: root
      ? isAi
        ? ["Choose a bounded task", "Identify its input and data path", "Review the proposed output", "Define the human approval point", "Confirm availability and limits"]
        : ["Map the patient journey", "Identify each role and handoff", "Review the team’s shared work", "Locate open and exception states", "Confirm scope and availability"]
      : ["Identify the task and owner", "Follow the handoff and review", "Confirm scope and availability"],
    note: isAi
      ? "AI features and data handling require feature-specific confirmation. Treat generated content as a proposal for appropriate human review; this page does not represent availability or autonomous clinical action."
      : "Screens and workflows require current product confirmation. Demonstrations should use synthetic data and distinguish supported behavior from configuration, manual steps, and planned work.",
    audience,
    searchIntent: isAi ? `${brief.title.toLowerCase()} evaluation for clinics` : `${brief.title.toLowerCase()} for independent clinics`,
    funnel: "Evaluate workflow → confirm product scope → book a demo",
    visualBrief: brief.visual,
    primaryCta: { label: "Request a demo", path: "/book-demo" },
    secondaryCta: { label: "Explore the sandbox", path: "/sandbox" },
    sections: root
      ? [
        { heading: "Who it serves and the buyer problem", body: `${audience}. ${brief.problem}` },
        { heading: "Top outcomes", body: isAi ? "A bounded assistance task can make a draft or organized information easier to review, while leaving decisions and external actions with the responsible person." : "A connected workflow can help teams see ownership, the next step, and unresolved work across the patient journey. Evaluate the specific screens and states before relying on them." },
        { heading: "Connected journey", body: brief.workflow },
        { heading: "Capability areas and team view", body: `${teamSections[path][0]} These capability topics are evaluation areas; their presence here does not establish current availability.` },
        { heading: "Objections, handoffs, and human review", body: teamSections[path][1] },
        { heading: "Evaluate scope, limits, and next step", body: brief.evaluation },
      ]
      : [
        { heading: "The buyer problem", body: brief.problem },
        { heading: "A scenario to follow", body: brief.workflow },
        { heading: "What the team needs to see", body: teamSections[path][0] },
        { heading: "Handoffs and human review", body: teamSections[path][1] },
        { heading: isAi ? "Draft output, approval, and correction" : "Recorded state and staff action", body: isAi
          ? "Trace the source information, proposed output, correction path, approving person, and any separate action that would send or save it. Confirm which steps the current feature actually performs; clinical decisions and communication approval remain with the authorized team."
          : "Separate what the current product records or updates from actions owned by staff, external services, or clinic policy. Inspect an incomplete or failed case as well as the normal path before treating a visible status as finished work." },
        { heading: "Evaluate current scope and limits", body: brief.evaluation },
      ],
    questions: [0, 1, 2].map((index) => ({ question: brief.faq[index], answer: answers[index] })),
    links,
  };
}
