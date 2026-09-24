import type { ClinicTypeSlug } from "./ClinicTypePages";

export type ClinicTypeFeature = {
  slug: string;
  headline: string;
  useCase: string;
};

type ClinicTypeToolkit = {
  heading: string;
  introduction: string;
  features: ClinicTypeFeature[];
  photos: [string, string];
};

export const clinicTypeToolkits: Record<ClinicTypeSlug, ClinicTypeToolkit> = {
  "primary-care": {
    heading: "A connected toolkit for ongoing primary care.",
    introduction:
      "Follow the relationship from the next appointment through results, documentation, and the work that continues between visits.",
    photos: ["primary-care-visit.png", "primary-care-front-desk.png"],
    features: [
      {
        slug: "scheduling",
        headline: "Give each visit its place in the day.",
        useCase:
          "Plan annual visits, follow-ups, and telehealth time against the same calendar and the people who will deliver them.",
      },
      {
        slug: "tracking-board",
        headline: "See the handoff from arrival to checkout.",
        useCase:
          "Keep a busy primary care day readable as patients move from check-in through rooming, clinician work, and checkout.",
      },
      {
        slug: "intake-forms",
        headline: "Begin with the information this visit needs.",
        useCase:
          "Gather the reason for the visit and updated history before the care team opens the encounter.",
      },
      {
        slug: "clinical-notes",
        headline: "Keep the visit and its note together.",
        useCase:
          "Write within the encounter while the longitudinal patient context remains close at hand.",
      },
      {
        slug: "labs-results",
        headline: "Follow a result back to the visit.",
        useCase:
          "See ordered work, incoming results, review state, and the next patient-facing action in one care path.",
      },
      {
        slug: "care-plans",
        headline: "Make follow-through visible between visits.",
        useCase:
          "Connect the plan made today with ownership and follow-up at the next primary care visit.",
      },
      {
        slug: "invoices",
        headline: "Make the financial next step clear.",
        useCase:
          "Show the services delivered, what was billed, and the balance after a visit.",
      },
    ],
  },
  "membership-care": {
    heading: "Tools for care that keeps going.",
    introduction:
      "Bring access, recurring relationships, appointments, and payment history into a service model patients can understand.",
    photos: ["memberships-team.png", "memberships-front-desk.png"],
    features: [
      {
        slug: "memberships-packages",
        headline: "Make the membership promise visible.",
        useCase:
          "Keep enrolled patients, plan terms, and included services alongside the visits they use.",
      },
      {
        slug: "scheduling",
        headline: "Reserve time for members and visits.",
        useCase:
          "Plan regular visits and same-week access while showing provider and room availability.",
      },
      {
        slug: "patient-portal",
        headline: "Give members a place to return.",
        useCase:
          "Make upcoming appointments, forms, and available next steps easy to find after enrollment.",
      },
      {
        slug: "reminders",
        headline: "Keep recurring care in rhythm.",
        useCase:
          "Prepare visit and follow-up messages with visible delivery state and patient preferences.",
      },
      {
        slug: "cash-billing",
        headline: "Separate membership from visit charges.",
        useCase:
          "Keep recurring access and extra billable services understandable in the financial view.",
      },
      {
        slug: "invoices",
        headline: "Explain every billed service.",
        useCase:
          "Give staff and patients a clear invoice trail for work outside the included plan.",
      },
    ],
  },
  "urgent-care": {
    heading: "See the whole walk-in day.",
    introduction:
      "Connect the first request, arrival, room, visit, and final handoff when the day's order changes quickly.",
    photos: ["urgent-care-visit.png", "urgent-care-handoff.png"],
    features: [
      {
        slug: "online-requests",
        headline: "Start with a clear request.",
        useCase:
          "Review the reason for care before offering an arrival or appointment time.",
      },
      {
        slug: "scheduling",
        headline: "Make room for planned and same-day care.",
        useCase:
          "Balance bookable time with the changing availability of providers and rooms.",
      },
      {
        slug: "tracking-board",
        headline: "Know where each walk-in stands.",
        useCase:
          "Read arrival, intake, room, clinician, and checkout stages without mistaking queue order for clinical priority.",
      },
      {
        slug: "intake-forms",
        headline: "Gather focused information early.",
        useCase:
          "Capture visit-specific answers while keeping incomplete work easy for staff to recognize.",
      },
      {
        slug: "clinical-notes",
        headline: "Document the episodic visit.",
        useCase:
          "Keep the reason, encounter notes, and review state together as the visit moves toward discharge.",
      },
      {
        slug: "invoices",
        headline: "Close the visit with a clear bill.",
        useCase: "Show charges, adjustments, and payment state at checkout.",
      },
    ],
  },
  "weight-management": {
    heading: "Support progress over many visits.",
    introduction:
      "Give a longitudinal program clear milestones, follow-ups, results, and flexible ways to pay.",
    photos: ["weight-management-visit.png", "weight-management-team.png"],
    features: [
      {
        slug: "intake-forms",
        headline: "Start with a fuller picture.",
        useCase:
          "Collect goals and history relevant to the program before the first consultation.",
      },
      {
        slug: "scheduling",
        headline: "Give each follow-up a place.",
        useCase:
          "Plan consultations and recurring check-ins across in-person and remote time.",
      },
      {
        slug: "clinical-notes",
        headline: "See the progress behind the visit.",
        useCase:
          "Document the current encounter with prior goals and earlier work in context.",
      },
      {
        slug: "labs-results",
        headline: "Bring lab review into the journey.",
        useCase:
          "Connect requested tests, incoming results, review, and follow-up to the program timeline.",
      },
      {
        slug: "care-plans",
        headline: "Keep the next milestone in view.",
        useCase:
          "Record goals and follow-up work so a plan can be reviewed at the next check-in.",
      },
      {
        slug: "memberships-packages",
        headline: "Offer a program with clear terms.",
        useCase:
          "Present included visits and package use alongside the patient's ongoing care.",
      },
      {
        slug: "telehealth",
        headline: "Make remote follow-ups part of the plan.",
        useCase:
          "Connect virtual check-ins to the same schedule and encounter history.",
      },
    ],
  },
  "hormone-health": {
    heading: "Connect consultation, monitoring, and follow-up.",
    introduction:
      "Keep the clinical conversation grounded in the visit, relevant results, and a visible next step.",
    photos: ["hormone-health-visit.png", "hormone-health-team.png"],
    features: [
      {
        slug: "intake-forms",
        headline: "Prepare for a focused consultation.",
        useCase:
          "Collect the history and goals the clinic chooses before the first appointment.",
      },
      {
        slug: "scheduling",
        headline: "Plan follow-ups around the care path.",
        useCase:
          "Give consultations, result reviews, and remote visits clear times and resources.",
      },
      {
        slug: "labs-results",
        headline: "See the result and its next action.",
        useCase:
          "Track ordered work through receipt, clinician review, and follow-up discussion.",
      },
      {
        slug: "medication-workflows",
        headline: "Keep medication decisions explicit.",
        useCase:
          "Show prepared work, authorization, and recorded outcome without implying an external prescription was sent.",
      },
      {
        slug: "care-plans",
        headline: "Make monitoring a continuing conversation.",
        useCase:
          "Link the current plan, its revisions, and future review points to the patient journey.",
      },
      {
        slug: "telehealth",
        headline: "Bring result reviews online when appropriate.",
        useCase:
          "Place remote follow-up in the same schedule and encounter context as in-person care.",
      },
    ],
  },
  "behavioral-health": {
    heading: "Protect time and continuity for care.",
    introduction:
      "Help a practice coordinate sessions, documentation, and next steps without turning care into a generic queue.",
    photos: ["behavioral-health-session.png", "behavioral-health-team.png"],
    features: [
      {
        slug: "scheduling",
        headline: "Make session time dependable.",
        useCase:
          "Plan recurring and one-time appointments with the right clinician and visit format.",
      },
      {
        slug: "intake-forms",
        headline: "Welcome each patient with relevant context.",
        useCase:
          "Gather the practice's chosen intake information before the first session.",
      },
      {
        slug: "clinical-notes",
        headline: "Keep documentation close to the session.",
        useCase:
          "Write within the encounter and preserve author and draft status.",
      },
      {
        slug: "care-plans",
        headline: "Carry goals across sessions.",
        useCase: "Make the agreed plan and its next review visible over time.",
      },
      {
        slug: "telehealth",
        headline: "Make remote sessions feel connected.",
        useCase:
          "Bring the virtual room into the booked visit and return to the record afterward.",
      },
      {
        slug: "reminders",
        headline: "Help patients prepare for the next session.",
        useCase:
          "Use clear appointment communications while keeping delivery outcomes visible.",
      },
    ],
  },
  "rehabilitation-pt": {
    heading: "Keep a course of care moving.",
    introduction:
      "Coordinate planned visit series, progress documentation, and the resources needed for each appointment.",
    photos: ["rehabilitation-visit.png", "rehabilitation-team.png"],
    features: [
      {
        slug: "scheduling",
        headline: "Plan the whole visit series.",
        useCase:
          "See recurring sessions against clinician, room, and equipment availability.",
      },
      {
        slug: "care-plans",
        headline: "Keep goals visible from session to session.",
        useCase:
          "Record the plan, work completed, and the next review point across visits.",
      },
      {
        slug: "clinical-notes",
        headline: "Document progress in context.",
        useCase:
          "Connect each encounter note to the visit and the wider course of care.",
      },
      {
        slug: "team-workspace",
        headline: "Show who owns the next step.",
        useCase:
          "Make scheduling, treatment preparation, and follow-up tasks readable to the right team.",
      },
      {
        slug: "memberships-packages",
        headline: "Make visit packages understandable.",
        useCase:
          "Keep a package's terms and remaining visits visible beside scheduled care.",
      },
      {
        slug: "invoices",
        headline: "Give each session a clear bill.",
        useCase:
          "Show billed services and payment history over a multi-visit course.",
      },
    ],
  },
  infusion: {
    heading: "A toolkit shaped around treatment days.",
    introduction:
      "Coordinate time, supplies, results, and financial follow-through while infusion-specific clinical workflows are designed with the clinic.",
    photos: ["infusion-care.png", "infusion-team.png"],
    features: [
      {
        slug: "scheduling",
        headline: "Reserve the right amount of treatment time.",
        useCase:
          "Plan longer appointments against staff and room capacity, with preparation time visible.",
      },
      {
        slug: "tracking-board",
        headline: "See the treatment day as it moves.",
        useCase:
          "Keep arrival, preparation, active visit, and checkout handoffs visible to the team.",
      },
      {
        slug: "inventory",
        headline: "Know what is on hand before the visit.",
        useCase:
          "Review recorded supply stock and location context as the team prepares the day's services.",
      },
      {
        slug: "labs-results",
        headline: "Bring lab review into treatment planning.",
        useCase:
          "Keep requested tests, received results, clinician review, and the next action connected to the visit.",
      },
      {
        slug: "medication-workflows",
        headline: "Make preparation and authorization explicit.",
        useCase:
          "Record local medication work and review state without presenting a planned infusion workflow as already active.",
      },
      {
        slug: "invoices",
        headline: "Make treatment charges understandable.",
        useCase:
          "Show service line items, adjustments, and payment state after a treatment visit.",
      },
      {
        slug: "cash-billing",
        headline: "Follow the cash-pay path clearly.",
        useCase:
          "Keep a visible record of what was charged, paid, or still due.",
      },
    ],
  },
  aesthetics: {
    heading: "A thoughtful front-to-back experience.",
    introduction:
      "Bring discovery, consultation, treatment scheduling, supplies, and payment into one consistent clinic journey.",
    photos: ["aesthetics-consult.png", "aesthetics-team.png"],
    features: [
      {
        slug: "online-requests",
        headline: "Make first contact feel easy.",
        useCase:
          "Let prospective patients explain what they are exploring before a consultation is confirmed.",
      },
      {
        slug: "intake-forms",
        headline: "Prepare for a better consultation.",
        useCase: "Gather relevant history and goals before the visit begins.",
      },
      {
        slug: "scheduling",
        headline: "Plan treatment around people and resources.",
        useCase:
          "Reserve clinician, room, and equipment time for the service selected.",
      },
      {
        slug: "inventory",
        headline: "Keep treatment supplies visible.",
        useCase:
          "See recorded stock and corrections by location before the next service.",
      },
      {
        slug: "memberships-packages",
        headline: "Present packages with clear terms.",
        useCase:
          "Track included services and use as patients return for additional visits.",
      },
      {
        slug: "cash-billing",
        headline: "Give checkout a clean finish.",
        useCase:
          "Keep charges, payment state, and adjustments understandable after the appointment.",
      },
      {
        slug: "invoices",
        headline: "Make each service easy to review.",
        useCase:
          "Show service line items and payment history after a consultation or treatment.",
      },
    ],
  },
};

export function clinicTypeFeatureHref(
  clinicType: ClinicTypeSlug,
  featureSlug: string,
) {
  const pathSlug = featureSlug === "labs-results" ? "lab-results" : featureSlug;
  return `/meta-clinic/${clinicType}/features/${pathSlug}`;
}

export function canonicalClinicFeatureSlug(slug: string) {
  return slug === "lab-results" ? "labs-results" : slug;
}
