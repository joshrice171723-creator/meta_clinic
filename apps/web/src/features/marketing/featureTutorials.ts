import type { ProductTour, WalkthroughStep } from "./productWalkthroughs";

const captureSizes = {
  "care-followup": [1350, 556],
  "care-goals": [1350, 544],
  "care-plan": [1350, 544],
  "insurance-model": [1300, 85],
  "insurance-profile": [1350, 683],
  "intake-answers": [1314, 1154],
  "intake-groups": [1350, 1027],
  "intake-handoff": [1350, 726],
  "labs-reports": [666, 503],
  "labs-review": [600, 526],
  "medication-outcome": [1300, 375],
  "medication-request": [1300, 566],
  "medication-review": [1300, 720],
  "note-findings": [1350, 849],
  "note-history": [1350, 333],
  "note-signing": [1350, 222],
  "online-request": [982, 358],
  "online-reschedule": [600, 467],
  "portal-appointments": [1182, 1482],
  "portal-billing": [1040, 593],
  "portal-home": [1182, 982],
  "scribe-context": [1382, 982],
  "scribe-transcript": [1382, 982],
  "team-queue": [1350, 1054],
  "team-task": [351, 234],
  "telehealth-preparation": [1080, 1394],
  "telehealth-room": [1382, 1032],
} as const;

function screen(
  file: keyof typeof captureSizes,
  label: string,
  title: string,
  body: string,
  detail: string,
  caption: string,
): WalkthroughStep {
  const [width, height] = captureSizes[file];
  return {
    label, title, body, detail, caption,
    image: `/marketing/captures/tutorial-${file}.png`,
    width, height,
    href: "/demo",
  };
}

export const featureTutorials = {
  portal: {
    title: "Give patients a clear path back to their care.",
    introduction: "Follow the patient view from the home screen to appointments and billing. The portal keeps the patient's own next actions together.",
    steps: [
      screen("portal-home", "Start at home", "Find the next visit and available instructions.", "The home screen brings the next appointment and released after-visit instructions into view. Open appointment details to check the time, location, room, and clinician.", "In the patient portal: Home → review the next appointment → open the visit or available instructions.", "Patient portal home with an upcoming appointment and instructions area."),
      screen("portal-appointments", "Prepare for the visit", "Keep appointment changes and intake in one place.", "Appointments lists upcoming visits and the actions available for each. Patients can confirm a visit when available, request a change, or open the intake and visit-note flow.", "Choose the intended appointment before selecting Confirm, Request reschedule, Request cancellation, or Complete intake.", "Upcoming patient appointments and appointment-request controls."),
      screen("portal-billing", "Review the balance", "Return to invoices without calling for every detail.", "Open Billing to review the invoices available to the patient account. Select an invoice for its details, and use the clinic billing contact path when a question needs a person.", "In Billing: select the invoice → review the amount due and recorded state → contact clinic billing if needed.", "Patient billing history with invoice balances and recorded payments."),
    ],
  },
  requests: {
    title: "Turn a preferred time into a clear request for the clinic.",
    introduction: "Patients can ask for a new visit or request a change to an existing appointment. The clinic reviews the request before confirming the appointment details.",
    steps: [
      screen("online-request", "Request a visit", "Tell the clinic what time and location would work.", "In the patient portal, open Appointments and Request a new appointment. Choose a preferred time window, clinic location, optional visit type, and visit format before sending the request.", "Choose a window of up to four hours. A request does not select a clinician or guarantee that time; the clinic can offer another opening.", "New-appointment request form in the patient portal."),
      screen("online-reschedule", "Request a change", "Keep a change connected to the original appointment.", "Use Request reschedule on the appointment you want to change. The dialog shows the current appointment beside the preferred replacement window so the patient can review both before sending.", "The appointment remains subject to clinic review. Change the preferred start or end before submitting the request.", "Reschedule request with the current appointment and preferred times."),
    ],
  },
  ai: {
    title: "See how Scribe prepares work for clinician review.",
    introduction: "Start with the patient, visit context, and recording consent. Then provide authorized source material and review the resulting draft before it becomes part of a signed record.",
    steps: [
      screen("scribe-context", "Set the context", "Connect the session to the right visit.", "Open Scribe, review the patient and session, choose the note template, and link the recorded visit. The Context tab keeps visit details, consent state, and reviewed lab selections together.", "Recording, transcript import, and draft generation require the applicable recording consent. The example shows preparation before consent is recorded.", "Scribe session with visit context and consent controls."),
      screen("scribe-transcript", "Provide the source", "Keep the transcript beside the work it informs.", "Use the Transcript tab to record a permitted session or import an authorized transcript once consent is recorded. Draft generation depends on the configured provider being available.", "Prepare the source → generate the draft when available → check the output against the source. These screenshots do not show a generated result.", "Scribe Transcript tab with recording and import controls."),
      screen("note-signing", "Review and sign", "Keep final authorship with the clinician.", "Review the documentation in the encounter before signing. The chart keeps saved revisions visible, and a later correction is prepared as a separate unsigned revision.", "This separate signed-chart example shows revision controls; generating a draft does not sign a note.", "Signed chart revision history, separate from Scribe draft preparation."),
    ],
  },
  insurance: {
    title: "Start with the clinic's configured payment model.",
    introduction: "Check the location profile before planning payer work. The demo shown here uses cash-based care with insurance disabled; these screens explain where to review that scope.",
    steps: [
      screen("insurance-profile", "Check the profile", "Find the insurance setting before planning the workflow.", "Open Clinic setup and read Current settings. The location profile lists the specialty, planned services, and whether insurance workflows are enabled.", "In Clinic setup: review Current settings → check Insurance workflows → review the supported change route if the intended model is different.", "Location profile showing the clinic's insurance-workflow setting."),
      screen("insurance-model", "Review payment scope", "Keep the payment model clear during setup.", "Open the supported profile review and read Payment model. The current demo is configured for memberships and direct patient payments. Discuss the specific payer workflow and availability before treating it as part of your clinic's setup.", "This walkthrough shows configuration review. It does not show claim submission, payer acceptance, or live insurance processing.", "Payment model in the location-profile review."),
    ],
  },
  team: {
    title: "Find the work, read its context, and follow it to the source.",
    introduction: "Patient Flow brings requests, encounter follow-ups, and lab work into one team view. The stages and owner labels make the next action easier to find.",
    steps: [
      screen("team-queue", "Scan the queue", "Start with the work that needs attention.", "Open Patient Flow and use All open, Mine, or Overdue to choose the work you need to see. New, In progress, and Ready to schedule separate the stages of the workflow.", "Read the work type, source, owner, and next action. Use the source-feed pagination when more records are available.", "Patient Flow with source filters and work organized by stage."),
      screen("team-task", "Open the source", "Carry the task's context into the next workspace.", "Each card keeps the patient, request, timing, and owner beside the next action. Open the source link to continue the work in the appropriate clinical or operational screen.", "For source-managed items, reviewing the inbox does not complete the task. Follow its action link and record the outcome there.", "A Patient Flow work item with its owner and source action."),
    ],
  },
  labs: {
    title: "Follow a reported result into review and follow-up.",
    introduction: "Find the report in the patient record, read the source values, and prepare the review outcome. Receipt, clinician review, and patient follow-up stay separate.",
    steps: [
      screen("labs-reports", "Find the report", "Read the result with its source and status.", "Open Lab reports from the patient record or a Patient Flow review link. Check the laboratory, reported date, linked order, specimen, and recorded values together.", "Compare Needs review with the acknowledgment state. Acknowledging receipt does not record a clinical review or patient contact.", "Lab report with source details, a recorded value, and review status."),
      screen("labs-review", "Prepare the review", "Record the review and make the follow-up explicit.", "Open Review to inspect the report and document the outcome. Review the follow-up choice before saving so the next action remains visible to the team.", "Read the source values → record the review → choose the follow-up state. The screenshot shows the review form before submission.", "Lab-review form opened from a reported result."),
    ],
  },
  telehealth: {
    title: "Prepare the video workflow, then manage the waiting room.",
    introduction: "Start with the clinic's preparation and consent settings, then see the waiting-room controls. Video is not connected in this demo, so these screens show setup and readiness rather than a live call.",
    steps: [
      screen("telehealth-preparation", "Prepare the visit", "Put the patient's instructions in place first.", "In Telehealth settings, review the preparation wording, support details, location and callback requirements, and visit timing. The clinic reviews and publishes the policy that applies to its visits.", "Open Telehealth → Settings → Preparation and consent. Review the draft before publishing it.", "Patient preparation and consent settings for video visits."),
      screen("telehealth-room", "Review the room", "See who is preparing, waiting, or connected.", "Open the virtual waiting room and filter by date, site, clinician, or status. The readiness message explains what must be configured before new video appointments can be booked.", "A connected provider, published policy, successful health check, and eligible visit type are required. This demo has no active video connection.", "Virtual waiting room and its current video-readiness message."),
    ],
  },
  medications: {
    title: "Take a refill request through review and a recorded outcome.",
    introduction: "Start with the patient's request, review the medication history, then check the decision and its delivery state. These separate demo examples show pending, in-review, and completed work.",
    steps: [
      screen("medication-request", "Read the request", "Begin with what the patient is asking for.", "Open Refill requests and read the medication, pharmacy destination, request note, and current status. Keep the patient and the requested medication in view before starting a review.", "From the request queue: select the request → review its details → open medication history.", "A pending refill request with its medication, pharmacy, and review controls."),
      screen("medication-review", "Review the history", "Put the request beside the current medication record.", "Open medication history, choose the encounter for an eventual order, and prepare the patient-visible response. The clinician records their review before approving, changing, or declining the request.", "Review the history → select the encounter → document the response and reconciliation → choose the appropriate decision.", "An in-review request with medication history and encounter selection."),
      screen("medication-outcome", "Check the outcome", "Follow the decision through to the patient-facing result.", "A completed request keeps the recorded response, reviewer, and linked medication-order revision visible. Check the delivery state separately so saved work does not get mistaken for a delivered message or pharmacy transmission.", "The example shows a saved decision that still needs patient-delivery follow-up.", "Completed refill review with a linked order and delivery follow-up."),
    ],
  },
  notes: {
    title: "Follow the note from history to the signed record.",
    introduction: "Open the encounter and confirm the patient before entering the chart. These screens show a completed example, including the recorded history and review findings.",
    steps: [
      screen("note-history", "Start with history", "Give the visit a clear starting point.", "Open History of Present Illness to review the chief complaint, timing, character, and what changes the symptoms. The additional history field keeps the patient's account alongside those details.", "In the chart: History of Present Illness → review the structured fields → read the additional history.", "History of Present Illness in a signed example chart."),
      screen("note-findings", "Review findings", "Make reviewed and unreviewed findings easy to distinguish.", "The Review of Systems separates positive, negative, and not-reviewed findings. Read the status beside each finding; a blank selection is not a negative result.", "In an editable chart, a finding cycles through positive, negative, and not reviewed. This signed example is read-only.", "Review of Systems with the legend and recorded findings."),
      screen("note-signing", "Review the revision", "Keep the signed note and its revision history together.", "Review the recorded assessment and plan before signing. When a signed note needs a change, start a correction as a separate unsigned revision so the earlier record remains available.", "Use Saved revision history to select a version. Start correction prepares a new revision; it does not replace the signed record.", "Signed chart controls and saved revision history."),
    ],
  },
  intake: {
    title: "Move from intake questions to the clinician handoff.",
    introduction: "See the intake groups, inspect the recorded answers, and review what the next person needs. Each screenshot is a panel from the encounter workspace.",
    steps: [
      screen("intake-groups", "Find the group", "Know what has been saved and what needs attention.", "Open Rooming & intake from the encounter. The grouped questions keep visit details, history, measurements, and follow-up organized, with the saved state visible beside each group.", "Select a group to review it. Opening a group does not mark it complete.", "Intake groups and their saved states."),
      screen("intake-answers", "Review answers", "Keep the answer connected to its source.", "Read the questions and saved answers in context. Use the comparison and source controls when reviewing a previous answer, and record exceptions where information is unavailable.", "In Intake: open the relevant group → review its questions → save the completed work.", "Visit questions and answer-review controls."),
      screen("intake-handoff", "Prepare the handoff", "Make the remaining preparation visible.", "Switch to Clinician handoff to review the identity, visit reason, history, and vital-sign preparation. Read the checklist before passing work to the clinician.", "A saved intake group and a completed handoff are separate states. Resolve the items shown for this encounter.", "Clinician handoff checklist within Rooming & intake."),
    ],
  },
  plans: {
    title: "Connect the care plan, the goal, and the next action.",
    introduction: "The encounter keeps care plans and goals in separate, visible records. Follow this example through to the follow-up work that carries it forward.",
    steps: [
      screen("care-plan", "Review the plan", "Give the plan a record of its own.", "Open Orders & plans, then Care plans. Review the title, draft or active state, revision, and recorded date before making a change.", "New plan records require an open encounter. The screenshot shows an existing draft in a completed visit.", "Care plans tab with an existing draft and its revision."),
      screen("care-goals", "Read the goal", "Keep the intended outcome visible.", "Select Goals to review the recorded objective and its status. Check the target date separately; the app makes an unrecorded date explicit.", "Review the goal's wording, state, revision, and date together before revising it.", "Goals tab showing a proposed goal and revision."),
      screen("care-followup", "Assign follow-up", "Give the next step a place to return to.", "Use Encounter follow-up to record what needs to happen next, when it is due, and the responsible staff member. Follow-ups marked as needed also appear in Operations.", "Choose the follow-up status → record the plan and due date → assign the responsible staff → save.", "Encounter follow-up with a plan, due date, and owner."),
    ],
  },
} satisfies Record<string, ProductTour>;
