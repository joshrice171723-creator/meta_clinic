export type MarketingFeature = {
  slug: string;
  label: string;
  headline: string;
  summary: string;
  points: [string, string, string];
};

export const featureGroups: {
  heading: string;
  features: MarketingFeature[];
}[] = [
  {
    heading: "Run your clinic",
    features: [
      {
        slug: "scheduling",
        label: "Scheduling",
        headline: "A schedule that sees the whole clinic day.",
        summary:
          "Bring appointments, people, and the resources each service needs into one planning view.",
        points: [
          "See the next visit in context",
          "Plan around staff, rooms, or equipment",
          "Keep changes and open work visible",
        ],
      },
      {
        slug: "intake-forms",
        label: "Intake & forms",
        headline: "A better beginning for every visit.",
        summary:
          "Shape intake around the service and make submitted information available for review before care moves forward.",
        points: [
          "Ask questions relevant to the visit",
          "Keep submitted answers connected to the record",
          "Make review and missing information clear",
        ],
      },
      {
        slug: "team-workspace",
        label: "Team workspace",
        headline: "Give every team member a clear next step.",
        summary:
          "Connect front-desk and clinical work while keeping responsibilities and access aligned with the clinic's assignments.",
        points: [
          "Make current work easy to find",
          "Show ownership and handoffs",
          "Respect assigned roles and permissions",
        ],
      },
      {
        slug: "inventory",
        label: "Inventory",
        headline: "Know what your clinic has on hand.",
        summary:
          "Connect stock, locations, and corrections to the operational work that depends on them.",
        points: [
          "See recorded stock by location",
          "Track movement and adjustments",
          "Plan for services that use supplies",
        ],
      },
    ],
  },
  {
    heading: "Deliver care",
    features: [
      {
        slug: "clinical-notes",
        label: "Clinical notes",
        headline: "Documentation with the visit in view.",
        summary:
          "Bring patient and encounter context alongside a reviewable note workflow for authorized clinicians.",
        points: [
          "Work from the right visit",
          "Keep drafts and review state clear",
          "Preserve who authored each entry",
        ],
      },
      {
        slug: "labs-results",
        label: "Labs & results",
        headline: "Keep results connected to the care plan.",
        summary:
          "Organize ordered work, incoming results, review, and follow-up around the patient and visit.",
        points: [
          "See requests and results together",
          "Separate received from reviewed",
          "Keep follow-up work visible",
        ],
      },
      {
        slug: "medication-workflows",
        label: "Medication workflows",
        headline: "A clearer path from plan to fulfillment.",
        summary:
          "Support clinic-selected medication routes with explicit preparation, review, and recorded outcomes.",
        points: [
          "Prepare work in visit context",
          "Keep review and authorization explicit",
          "Distinguish local records from external transmission",
        ],
      },
      {
        slug: "care-plans",
        label: "Care plans",
        headline: "Turn a plan into coordinated work.",
        summary:
          "Connect goals, planned services, tasks, and follow-up without losing the history behind a change.",
        points: [
          "Keep intent and action distinct",
          "Show the next responsible step",
          "Preserve revisions and unfinished work",
        ],
      },
    ],
  },
  {
    heading: "Manage revenue",
    features: [
      {
        slug: "cash-billing",
        label: "Cash billing",
        headline: "Make the money side of care easier to follow.",
        summary:
          "Bring services, charges, and payment state into a clear cash-pay workflow.",
        points: [
          "Keep prices tied to services",
          "Show what is owed and paid",
          "Handle corrections with a record",
        ],
      },
      {
        slug: "memberships-packages",
        label: "Memberships & packages",
        headline: "Create offers that fit your clinic.",
        summary:
          "Support recurring access and service packages alongside pay-per-visit care where a clinic chooses them.",
        points: [
          "Define the offer and its terms",
          "Track access and use",
          "Keep renewals and changes visible",
        ],
      },
      {
        slug: "invoices",
        label: "Invoices",
        headline: "An understandable path from service to invoice.",
        summary:
          "Give clinic teams a clear record of billed work, balances, and corrections.",
        points: [
          "See line items in context",
          "Track invoice state",
          "Keep payment and adjustment history",
        ],
      },
      {
        slug: "optional-insurance",
        label: "Optional insurance",
        headline: "Insurance when your clinic needs it.",
        summary:
          "Add payer workflows as a clinic choice while preserving the cash-pay foundation.",
        points: [
          "Keep coverage evidence separate",
          "Prepare local work before vendor connection",
          "Show submission and response state explicitly",
        ],
      },
    ],
  },
  {
    heading: "Connect with patients",
    features: [
      {
        slug: "online-requests",
        label: "Online requests",
        headline: "Make it easier to start the conversation.",
        summary:
          "Give patients a clear way to request care while the clinic keeps control of review and scheduling.",
        points: [
          "Capture the request",
          "Review before confirming",
          "Connect the next step to the clinic",
        ],
      },
      {
        slug: "patient-portal",
        label: "Patient portal",
        headline: "A clearer place for patients to return.",
        summary:
          "Offer patients an access point for their own appointments, forms, and available care information.",
        points: [
          "Keep access tied to identity",
          "Show the right information",
          "Make next actions understandable",
        ],
      },
      {
        slug: "reminders",
        label: "Reminders",
        headline: "Help the next step stay on track.",
        summary:
          "Support appointment and follow-up communication with visible preparation and delivery outcomes.",
        points: [
          "Prepare the right message",
          "Respect the clinic's communication choices",
          "Show what was sent and what was not",
        ],
      },
      {
        slug: "telehealth",
        label: "Telehealth",
        headline: "Care that can meet patients where they are.",
        summary:
          "Bring virtual entry and encounter context into the same clinic foundation when remote care fits the service.",
        points: [
          "Prepare for a virtual visit",
          "Keep the visit connected to the record",
          "Make connection recovery visible",
        ],
      },
    ],
  },
];

export const marketingFeatures = featureGroups.flatMap(
  (group) => group.features,
);

export function featureHref(feature: MarketingFeature) {
  return `/meta-clinic/features/${feature.slug}`;
}
