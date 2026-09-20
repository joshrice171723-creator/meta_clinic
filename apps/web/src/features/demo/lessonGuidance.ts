export type LessonGuide = {
  goal: string;
  constraints: string;
  steps: readonly string[];
  doneWhen: string;
  recap: string;
};

const guides: Record<string, LessonGuide> = {
  navigation_tour: {
    goal: "Learn where each clinic workspace lives before working in it.",
    constraints:
      "This is a read-only tour. Use the clinic menu only; page controls stay disabled.",
    steps: [
      "Use the clinic menu to open Care, Operations, Inventory, Billing, Growth, Setup, and Settings workspaces.",
      "At each destination, read the page title and the short description of the work it owns.",
      "Return to the menu and continue until you can identify where scheduling, patient work, inventory, and billing begin.",
    ],
    doneWhen:
      "You can name the workspace that owns each kind of clinic work without changing any records.",
    recap:
      "You have a map of the clinic workspace and its operational boundaries.",
  },
  clinic_setup: {
    goal: "Confirm the prepared clinic profile before making it available for day-to-day work.",
    constraints:
      "The clinic profile, active facility, and visit types are already prepared. Keep the prepared scope intact.",
    steps: [
      "Review the clinic type and service scope shown in the profile.",
      "Confirm the prepared facility is active and the available visit types match the clinic's scope.",
      "Select Finalize clinic setup after reviewing the configuration summary.",
    ],
    doneWhen: "The setup page shows the clinic as finalized.",
    recap:
      "The prepared clinic configuration is now ready for the next workflow.",
  },
  membership_publish: {
    goal: "Publish one membership offer that a prospective patient can select.",
    constraints:
      "Use the prepared service catalog and terms. This lesson does not create a real charge or external storefront listing.",
    steps: [
      "Open the membership editor and create or select the prepared membership offering.",
      "Review the name, included service, price, renewal choice, and terms before publishing.",
      "Select Publish and confirm the offer appears in the membership catalog.",
    ],
    doneWhen: "A newly published membership is visible in the clinic catalog.",
    recap:
      "The clinic now has a published offer ready for the prepared enrollment flow.",
  },
  patient_enroll: {
    goal: "Create the prepared patient's membership account from a published offer.",
    constraints:
      "Use the prepared offer and demo identity only. Enrollment creates an account setup state, not a paid membership.",
    steps: [
      "Review the published membership and select the prepared offer.",
      "Continue through the account details using the prepared identity and the displayed membership terms.",
      "Submit the enrollment and confirm the account moves to the payment step.",
    ],
    doneWhen:
      "The prepared account exists and is waiting for its local payment simulation.",
    recap:
      "The selected offer and account are linked, but payment has not yet been confirmed.",
  },
  membership_payment: {
    goal: "Complete the local payment simulation that activates the prepared membership.",
    constraints:
      "This is a local demo payment only; it does not contact a processor or charge a card.",
    steps: [
      "Review the prepared account, membership selection, and displayed amount.",
      "Select the local payment simulation action and confirm the displayed outcome.",
      "Verify the confirmation state before continuing to staff scheduling work.",
    ],
    doneWhen:
      "The prepared patient is marked paid and the membership is active in the demo.",
    recap:
      "The demo has recorded a local payment outcome and activated the prepared membership.",
  },
  appointment_schedule: {
    goal: "Book the prepared patient into an available follow-up slot.",
    constraints:
      "Use the prepared patient, clinician, room, and available capacity. Do not create a second patient.",
    steps: [
      "Select Schedule first appointment or the available appointment action.",
      "Choose an available date and time, then review the prepared clinician, room, visit type, and patient before saving.",
      "Confirm the booking and verify it appears on the schedule.",
    ],
    doneWhen:
      "A new appointment for the prepared patient appears in the clinic schedule.",
    recap:
      "The patient now has a recorded follow-up appointment with the prepared clinic resources.",
  },
  appointment_reschedule: {
    goal: "Move the prepared appointment to a different available time without creating a duplicate.",
    constraints:
      "Work from the prepared appointment and choose an open time. Keep the patient and visit context unchanged.",
    steps: [
      "Open the prepared appointment from Front desk.",
      "Choose Reschedule and select a different available date or time.",
      "Save the change and verify the appointment now shows the new time.",
    ],
    doneWhen:
      "The original appointment remains one record and its scheduled time has changed.",
    recap:
      "The existing appointment was moved without creating a duplicate visit.",
  },
  appointment_cancel: {
    goal: "Cancel the prepared appointment and review the communication boundary.",
    constraints:
      "The warning is local to this demo. No text, email, or external notification is sent.",
    steps: [
      "Open the prepared appointment from Front desk.",
      "Select Cancel appointment and read the local-only communication warning.",
      "Confirm the cancellation and verify the appointment status changes to cancelled.",
    ],
    doneWhen: "The prepared appointment is marked cancelled.",
    recap:
      "The appointment is cancelled in the clinic record; no outreach was sent.",
  },
  patient_check_in: {
    goal: "Start the prepared patient's visit from the front desk.",
    constraints:
      "Use today's prepared appointment and room. Check-in creates the encounter; it does not complete clinical documentation.",
    steps: [
      "Find today's prepared appointment in Front desk.",
      "Select the check-in or arrived action and confirm the prepared room and visit context.",
      "Verify the patient moves from the appointment list into the active visit state.",
    ],
    doneWhen: "An encounter has been started for the prepared appointment.",
    recap:
      "The front desk has handed the prepared patient into an active visit.",
  },
  visit_save: {
    goal: "Save an unsigned SOAP note for the prepared open encounter.",
    constraints:
      "Use only the supplied scenario. Record no examination finding, medication, dose, or clinical decision that is not provided.",
    steps: [
      "Open the prepared chart.",
      "Apply the prepared SOAP template.",
      "Add the supplied follow-up update to Additional subjective history.",
      "Save the unsigned draft.",
    ],
    doneWhen:
      "A new unsigned note revision has been saved for the prepared encounter.",
    recap:
      "The encounter now has a saved draft; it has not been signed or completed.",
  },
  visit_complete: {
    goal: "Complete the prepared encounter after reviewing its signed evidence and follow-up disposition.",
    constraints:
      "The demo supplies the note and follow-up evidence. Do not add medication, dose, diagnosis, or a new clinical instruction.",
    steps: [
      "Open the prepared chart and review the signed instructions and follow-up disposition.",
      "Confirm the recorded visit information is complete for this demonstration.",
      "Select the complete-visit action and verify the encounter is no longer open.",
    ],
    doneWhen: "The prepared encounter has a recorded completion time.",
    recap:
      "The prepared visit is complete with its supplied evidence preserved.",
  },
  inventory_product_create: {
    goal: "Add one catalog product that inventory workflows can identify and count.",
    constraints:
      "Use a demo product only. Choose a clear name, stock unit, and package description; do not imply a real supplier or medication listing.",
    steps: [
      "Open Add catalog item and enter a recognizable product name and SKU.",
      "Set the stock unit, package information, and any required catalog fields shown by the form.",
      "Save the product and confirm it appears in the inventory catalog.",
    ],
    doneWhen: "A new product record appears in the catalog.",
    recap:
      "The clinic inventory catalog now contains the newly created demo product.",
  },
  inventory_supplier_create: {
    goal: "Add a supplier record that purchasing can reference.",
    constraints:
      "Use a demo supplier name only. This lesson creates a local directory entry and does not contact the supplier.",
    steps: [
      "Open Suppliers and pricing, then choose Add supplier.",
      "Enter a clear demo supplier name and save the record.",
      "Confirm the supplier is selected or visible in the supplier directory.",
    ],
    doneWhen:
      "A new supplier record is visible in the local supplier directory.",
    recap: "Purchasing can now reference the newly created demo supplier.",
  },
  inventory_location_create: {
    goal: "Create an active storage location for the prepared facility.",
    constraints:
      "Use the prepared facility and an unambiguous storage name. This does not move stock.",
    steps: [
      "Open Storage locations and choose Add storage location.",
      "Enter the location name, select the prepared facility, and keep the location active.",
      "Save and confirm the new location appears in the storage list.",
    ],
    doneWhen:
      "A new active storage location is listed for the prepared facility.",
    recap:
      "The clinic has another recorded place where stock can be received or transferred.",
  },
  inventory_purchase_order_create: {
    goal: "Create a draft purchase order for the prepared product.",
    constraints:
      "Use the prepared product, supplier, and destination. This creates a local draft and does not place an external order.",
    steps: [
      "Open Create purchase order and confirm the prepared product is selected.",
      "Choose the prepared supplier and destination, then enter the requested quantity and unit price.",
      "Save the draft and verify the order is available for the next receiving workflow.",
    ],
    doneWhen: "A new purchase order exists for the prepared product.",
    recap:
      "The clinic has a recorded local order ready to be tracked through delivery.",
  },
  inventory_shipment_record: {
    goal: "Record delivery details against the prepared sent purchase order.",
    constraints:
      "Use the prepared order and local delivery details only. No supplier system is contacted.",
    steps: [
      "Open the prepared sent purchase order and choose Record delivered shipment.",
      "Enter the delivery reference and package details required by the form.",
      "Save the shipment and confirm it is ready for receiving.",
    ],
    doneWhen: "A shipment record exists for the prepared purchase order.",
    recap:
      "The order now has local delivery evidence ready for receiving and put-away.",
  },
  inventory_receive: {
    goal: "Receive the prepared delivery into the supply cabinet and create stock history.",
    constraints:
      "Use the prepared shipment and Supply cabinet. Receipt affects local stock records only.",
    steps: [
      "Review the delivered shipment and confirm Supply cabinet is the receiving location.",
      "Enter the received quantity and the lot details required by the receiving form.",
      "Post the receipt and confirm stock is visible at the receiving location.",
    ],
    doneWhen: "A receipt and its resulting on-hand stock are recorded.",
    recap: "The delivered inventory is now traceable in local stock history.",
  },
  inventory_count: {
    goal: "Reconcile a stock count for the prepared supply cabinet.",
    constraints:
      "Count the prepared on-hand stock only. Completing a count records a local inventory result.",
    steps: [
      "Open Cycle counts and create or start a count for Supply cabinet.",
      "Record the counted quantity for the prepared stock and review any variance.",
      "Complete the count after confirming the reconciliation summary.",
    ],
    doneWhen:
      "A completed count session is recorded for the prepared location.",
    recap:
      "The supply cabinet now has a completed local count and reconciliation record.",
  },
  inventory_adjust: {
    goal: "Record a traceable adjustment for the prepared lot.",
    constraints:
      "Use the prepared lot and provide the reason requested by the form. An adjustment changes local stock history.",
    steps: [
      "Open Stock by lot and select the Adjust tab.",
      "Choose the prepared lot, enter the adjustment quantity, and record a clear reason.",
      "Post the adjustment and review the resulting movement entry.",
    ],
    doneWhen: "A new adjustment movement is visible for the prepared lot.",
    recap:
      "The stock change and its reason are now traceable in the movement ledger.",
  },
  inventory_transfer: {
    goal: "Move part of the prepared lot to the second storage location.",
    constraints:
      "Use the prepared source lot and Secondary cabinet destination. The transfer should preserve total on-hand stock.",
    steps: [
      "Open Stock by lot and select the Transfer tab.",
      "Choose the prepared source lot, Secondary cabinet destination, and transfer quantity.",
      "Post the transfer and verify stock is recorded at both locations.",
    ],
    doneWhen: "A transfer record exists for the prepared lot and destination.",
    recap: "The lot's custody changed location while remaining traceable.",
  },
  inventory_recall: {
    goal: "Open a local recall case for the prepared lot and preserve its custody context.",
    constraints:
      "Use the prepared lot and case details. This lesson creates local control records and does not contact a manufacturer or regulator.",
    steps: [
      "Open Recall case management and choose Create recall case.",
      "Select the prepared lot, enter the case reason, and review the stock custody history.",
      "Create the case and confirm the recall record is visible.",
    ],
    doneWhen: "A recall case exists for the prepared lot.",
    recap: "The prepared lot now has a traceable local recall case.",
  },
  patient_flow_review: {
    goal: "Understand how unscheduled patient work is organized before an appointment is booked.",
    constraints:
      "This is a review-only walkthrough; no task or appointment is changed.",
    steps: [
      "Find the work inbox and identify the prepared patient's pending task.",
      "Review the assigned team and the task's current status.",
      "Compare completing contact work with booking an appointment from the scheduling workspace.",
    ],
    doneWhen:
      "You can explain why Patient Flow work happens before scheduling.",
    recap:
      "You have reviewed the pre-scheduling work handoff without changing it.",
  },
  tracking_board_review: {
    goal: "Read the clinic's recorded visit stages without inferring clinical priority.",
    constraints:
      "This is a review-only walkthrough; it does not change the prepared encounter.",
    steps: [
      "Read the board's clinic date and visit-stage labels.",
      "Locate the prepared visit and review its recorded room and status.",
      "Review the available visit actions without selecting one.",
    ],
    doneWhen:
      "You can identify the prepared visit's recorded operational state.",
    recap:
      "You reviewed the tracking board as operational context, not a clinical-priority signal.",
  },
  patient_register: {
    goal: "Create one new local patient record from the patient directory.",
    constraints:
      "Use a demo identity only. Registration creates a patient record; it does not enroll a membership or book a visit.",
    steps: [
      "Open the patient directory and choose Register or Add patient.",
      "Enter the required demo identity and reference fields shown in the form.",
      "Save the record and confirm the new patient appears in the directory.",
    ],
    doneWhen:
      "A new patient record appears in the prepared clinic's directory.",
    recap: "The clinic now has a newly registered local patient record.",
  },
  refill_review: {
    goal: "Understand the information staff review before a refill workflow proceeds.",
    constraints:
      "This is a review-only walkthrough; it does not send a prescription or pharmacy request.",
    steps: [
      "Find the refill queue and its status filters.",
      "Review the prepared request's patient and medication context.",
      "Locate the review actions and identify what remains for authorized clinical review.",
    ],
    doneWhen:
      "You can identify the request context and the boundary before a refill decision.",
    recap:
      "You reviewed the refill queue without initiating a prescription workflow.",
  },
  recall_review: {
    goal: "Understand how local care-gap work is surfaced for follow-up.",
    constraints:
      "This is a review-only walkthrough; it does not send patient outreach.",
    steps: [
      "Find the recall and care-gap worklist.",
      "Review the prepared patient's follow-up context and due work.",
      "Locate the next-action controls and identify the handoff they support.",
    ],
    doneWhen:
      "You can identify the prepared care-gap item and its next local action.",
    recap: "You reviewed follow-up work without sending outreach.",
  },
  telehealth_review: {
    goal: "Review visit readiness before a telehealth session begins.",
    constraints:
      "This is a review-only walkthrough; it does not start a call or contact a participant.",
    steps: [
      "Find the telehealth workspace and its readiness information.",
      "Review the prepared patient's visit context.",
      "Locate the access and preparation controls without starting the session.",
    ],
    doneWhen:
      "You can identify the prepared visit's readiness context and available preparation controls.",
    recap: "You reviewed telehealth readiness without opening a live visit.",
  },
  scribe_review: {
    goal: "See how the recording dock remains available while staff move through prepared clinic work.",
    constraints:
      "Voice-to-text and AI drafting are unavailable in this demo. The walkthrough does not create a clinical draft.",
    steps: [
      "Select Accept consent and confirm the recording permission for this Scribe session.",
      "Select Start recording to open the persistent recording dock.",
      "Select Open treatment workspace in the dock and confirm it remains available while you move through the prepared workspace.",
    ],
    doneWhen:
      "You have opened the recording dock and reviewed its persistence boundary.",
    recap:
      "You reviewed the Scribe workspace without recording audio or creating an AI draft.",
  },
  waitlist_review: {
    goal: "Review how capacity and a prepared waitlist entry support an offer workflow.",
    constraints:
      "This is a review-only walkthrough; it does not contact the patient.",
    steps: [
      "Find the capacity and waitlist controls.",
      "Review the prepared clinic availability and patient context.",
      "Locate the offer workflow and identify the action that would require outreach.",
    ],
    doneWhen:
      "You can identify the prepared waitlist entry and the boundary before an offer is sent.",
    recap:
      "You reviewed capacity and waitlist context without sending outreach.",
  },
  operations_review: {
    goal: "Understand where operational readiness information belongs and who owns the next action.",
    constraints:
      "This is a review-only walkthrough; it does not change workload or readiness records.",
    steps: [
      "Find the clinic's operations overview.",
      "Review the recorded workload and readiness information.",
      "Identify which workspace owns the next action for a prepared item.",
    ],
    doneWhen:
      "You can route a prepared operational item to its owning workspace.",
    recap: "You reviewed operations context without changing a record.",
  },
  reminders_review: {
    goal: "Review appointment reminder handling and its communication boundary.",
    constraints: "This is a review-only walkthrough; no email or text is sent.",
    steps: [
      "Find the reminders workspace and its filters.",
      "Review the prepared appointment and its local reminder information.",
      "Locate the review controls and distinguish them from sending communication.",
    ],
    doneWhen:
      "You can identify the prepared reminder and the no-send boundary.",
    recap: "You reviewed local reminder handling without contacting anyone.",
  },
  messages_review: {
    goal: "Understand how staff conversation context and handoff ownership stay visible.",
    constraints: "This is a review-only walkthrough; no staff message is sent.",
    steps: [
      "Find the staff-messaging workspace.",
      "Review the prepared conversation, participants, and handoff context.",
      "Locate the conversation controls and identify how staff context remains attached.",
    ],
    doneWhen:
      "You can identify the prepared handoff and the controls available to staff.",
    recap:
      "You reviewed staff communication context without sending a message.",
  },
  workforce_review: {
    goal: "Understand where workforce, staffing, and timekeeping information is managed.",
    constraints:
      "This is a review-only walkthrough; no workforce or payroll record is changed.",
    steps: [
      "Find the workforce workspace and its sections.",
      "Review the prepared clinic team's available workforce context.",
      "Locate the staffing and timekeeping controls available to this role.",
    ],
    doneWhen:
      "You can identify the workforce section that owns the prepared task.",
    recap:
      "You reviewed workforce context without changing staffing or timekeeping.",
  },
  billing_review: {
    goal: "Review the prepared patient's cash-based billing context and transaction history.",
    constraints:
      "This is a review-only walkthrough; no real charge or payment is made.",
    steps: [
      "Find the cash-based billing workspace.",
      "Review the prepared patient's recorded payment and balance context.",
      "Locate the transaction history and distinguish it from a new charge action.",
    ],
    doneWhen:
      "You can identify the recorded balance and its transaction history.",
    recap: "You reviewed billing context without making a charge.",
  },
  growth_review: {
    goal: "Understand how membership inquiries progress until payment is confirmed.",
    constraints:
      "This is a review-only walkthrough; no account invitation, payment, or outreach is sent.",
    steps: [
      "Find the membership growth workspace.",
      "Review the prepared membership and patient-entry information.",
      "Distinguish an inquiry or enrollment from a confirmed local payment.",
    ],
    doneWhen:
      "You can explain why unpaid people remain in Growth until payment is verified.",
    recap:
      "You reviewed the membership pipeline without changing a patient or payment state.",
  },
  settings_review: {
    goal: "Understand the boundary between clinic-wide settings and the signed-in user's settings.",
    constraints:
      "This is a review-only walkthrough; shared configuration is not changed.",
    steps: [
      "Find the clinic and account settings sections.",
      "Review the current settings and their scope.",
      "Identify which settings belong to the clinic and which belong to the signed-in user.",
    ],
    doneWhen:
      "You can distinguish clinic configuration from personal account settings.",
    recap: "You reviewed settings scope without changing shared configuration.",
  },
  inventory_overview_review: {
    goal: "Orient yourself to the prepared inventory quantities and the workspaces that change them.",
    constraints: "This is a review-only walkthrough; stock is not changed.",
    steps: [
      "Find the inventory overview and its filters.",
      "Review the prepared stock quantities and product context.",
      "Locate the stock, purchasing, and receiving workspaces that can change inventory history.",
    ],
    doneWhen:
      "You can identify the prepared inventory and where each stock workflow begins.",
    recap: "You reviewed stock context without posting inventory movement.",
  },
  inventory_ledger_review: {
    goal: "Trace how a recorded receipt changed the prepared stock balance.",
    constraints:
      "This is a review-only walkthrough; no inventory movement is posted.",
    steps: [
      "Find the movement ledger and its filters.",
      "Review the prepared receipt movement and its resulting stock.",
      "Inspect the movement source and reason to trace how the stock changed.",
    ],
    doneWhen:
      "You can connect the prepared stock balance to its receipt movement.",
    recap: "You reviewed the inventory trail without changing stock history.",
  },
};

function baseKey(lessonId: string) {
  return lessonId.split("__").at(-1) ?? lessonId;
}

function specialtyContext(lessonId: string) {
  if (lessonId.startsWith("primary_care__"))
    return " in the prepared primary-care scenario";
  if (lessonId.startsWith("weight_management__"))
    return " in the prepared weight-management scenario";
  return "";
}

export function lessonGuide(lessonId: string): LessonGuide {
  const guide = guides[baseKey(lessonId)];
  if (!guide)
    throw new Error(`Missing guided-demo instructions for ${lessonId}.`);

  const context = specialtyContext(lessonId);
  return context
    ? { ...guide, goal: `${guide.goal.replace(/\.$/, "")}${context}.` }
    : guide;
}

export const supportedLessonGuideIds = Object.freeze(Object.keys(guides));
