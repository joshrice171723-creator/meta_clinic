import { featureTutorials } from "./featureTutorials";

export type WalkthroughStep = {
  label: string;
  title: string;
  body: string;
  detail: string;
  image: string;
  caption: string;
  width: number;
  height: number;
  href: string;
};

export type ProductTour = {
  title: string;
  introduction: string;
  limitation?: string;
  steps: readonly WalkthroughStep[];
};

const capture = (file: string) => `/marketing/captures/${file}.png`;

const calendar: WalkthroughStep = {
  label: "Plan the day",
  title: "Start with a clear view of the calendar.",
  body: "See how appointments fill the month, then move into the day you want to plan. The schedule gives the team a shared starting point before a patient arrives.",
  detail:
    "Look for: appointment counts, confirmed visits, and the time already scheduled.",
  image: capture("schedule-month-omni-october"),
  width: 990,
  height: 680,
  caption: "Month calendar with appointment counts and scheduled time.",
  href: "/meta-clinic/features/scheduling",
};
const booking: WalkthroughStep = {
  label: "Book the visit",
  title: "Give the appointment its people, place, and purpose.",
  body: "Choose the patient, time, duration, clinician, room, and visit type together. A visit reason gives the next person useful context before they open the appointment.",
  detail:
    "In the appointment form: review the patient → set the visit details → save a draft or schedule.",
  image: capture("schedule-booking-omni-adapted"),
  width: 838,
  height: 799,
  caption: "Appointment form showing the details behind a booking.",
  href: "/meta-clinic/features/scheduling",
};
const arrival: WalkthroughStep = {
  label: "Prepare for arrival",
  title: "Turn the schedule into a front-desk plan.",
  body: "Bring the day's visits into a working queue. Staff can review the appointment and its recorded status before deciding what needs their attention next.",
  detail:
    "Look for: the expected visit, appointment time, and current arrival state.",
  image: capture("care-front-desk-october-morning-queue"),
  width: 947,
  height: 640,
  caption: "The front-desk morning queue, organized around scheduled visits.",
  href: "/meta-clinic/features/tracking-board",
};
const board: WalkthroughStep = {
  label: "Hand off care",
  title: "See where the visit stands and who is involved.",
  body: "Read the room, visit reason, provider, recorded care context, and timing together. The board makes the operational handoff visible as work moves between the front desk and care team.",
  detail:
    "Look for: waiting, intake, and provider stages beside the visit. Stage and timing describe workflow, not clinical urgency.",
  image: capture("tracking-board-varied-stages-omni"),
  width: 1550,
  height: 643,
  caption:
    "Tracking Board showing visits at different stages of the clinic day.",
  href: "/meta-clinic/features/tracking-board",
};
const invoice: WalkthroughStep = {
  label: "Review charges",
  title: "Make the balance understandable, line by line.",
  body: "Open an invoice to see its recorded services, quantities, charges, and remaining balance. Staff can answer a billing question from the same financial record.",
  detail:
    "In the invoice ledger: select an invoice → review its lines → check payments and credits.",
  image: capture("finance-open-invoice-detail"),
  width: 945,
  height: 760,
  caption: "An open invoice with service lines and a remaining balance.",
  href: "/meta-clinic/features/invoices",
};
const payment: WalkthroughStep = {
  label: "Check settlement",
  title: "Follow the payment through to the balance.",
  body: "See allocated payments and credits alongside the invoice total. Keep the recorded financial outcome visible when the team returns to a patient billing question.",
  detail:
    "Look for: invoice state, allocated payment, credit, and the amount still outstanding.",
  image: capture("finance-paid-invoice-detail"),
  width: 945,
  height: 740,
  caption: "A separate paid invoice example with payment and credit details.",
  href: "/meta-clinic/features/cash-billing",
};
const stock: WalkthroughStep = {
  label: "Find the item",
  title: "Know what is on hand before you plan the next step.",
  body: "Find a product and compare its recorded quantities with its reorder point. Start a stock conversation with the item and its availability in view.",
  detail:
    "In Inventory: find the product → read its quantities → inspect the stock detail.",
  image: capture("inventory-catalog-100-products"),
  width: 1520,
  height: 1500,
  caption: "Inventory catalog with product quantities and reorder points.",
  href: "/meta-clinic/features/inventory",
};
const lots: WalkthroughStep = {
  label: "Inspect stock",
  title: "Go from a quantity to the stock behind it.",
  body: "Review the item's lot and location information before deciding what to use, move, or replenish. A catalog total is a starting point; the detail supplies the context.",
  detail:
    "Look for: the selected product and its recorded lot, location, and quantity information.",
  image: capture("inventory-omni-stock-detail-lot-table"),
  width: 2140,
  height: 370,
  caption: "Stock detail opened from the inventory catalog.",
  href: "/meta-clinic/features/inventory",
};
const movement: WalkthroughStep = {
  label: "Follow activity",
  title: "Keep a visible history of stock movement.",
  body: "Review recorded inventory activity when a quantity changes. The activity view gives staff a place to investigate movement rather than relying on the current total alone.",
  detail:
    "In Inventory: open Activity → find the item or movement → review the recorded entry.",
  image: capture(
    "inventory-activity-northside-clinic-2026-09-24-synthetic-direct",
  ),
  width: 1129,
  height: 728,
  caption: "Inventory activity in a separate sample clinic workspace.",
  href: "/meta-clinic/features/inventory",
};
const directory: WalkthroughStep = {
  label: "Find the patient",
  title: "Begin with the right patient record.",
  body: "Use the patient directory to find the person whose visit you are preparing. Identity and visit context are the starting point for the clinical work that follows.",
  detail:
    "This screen shows the patient directory. Open the demo to explore the encounter, forms, and documentation itself.",
  image: capture("patient-directory-21-natural-records"),
  width: 670,
  height: 1325,
  caption: "Patient directory with sample records and search controls.",
  href: "/meta-clinic/features/clinical-notes",
};
const reminders: WalkthroughStep = {
  label: "Prepare a reminder",
  title: "Connect the message to the appointment.",
  body: "Choose upcoming visits, review contact readiness, and prepare the appropriate reminder. Keep message history and items needing attention close to the schedule.",
  detail:
    "In Appointment reminders: review upcoming appointments → prepare the message → check its recorded outcome. Prepared does not mean delivered.",
  image: capture(
    "operations-reminders-northside-clinic-2026-09-24-synthetic-direct",
  ),
  width: 1129,
  height: 728,
  caption:
    "Appointment reminders with upcoming visits and message-history tabs.",
  href: "/meta-clinic/features/reminders",
};

export const productTours = {
  ...featureTutorials,
  ai: {
    ...featureTutorials.ai,
    title: "Prepare a Scribe session. Review every draft.",
    introduction:
      "Connect the patient and visit, check recording consent, then prepare the transcript source. These app screens show the work before generation.",
    limitation:
      "No generated draft is shown here. Generation needs a configured provider and current consent; a clinician must check any output against its source before signing.",
    steps: featureTutorials.ai.steps.slice(0, 2),
  },
  weightLoss: {
    title: "Keep program follow-up connected to the visit.",
    introduction:
      "Review intake, read the recorded plan, and give follow-up a date and an owner. This tour uses the shared encounter tools available to a weight management team.",
    limitation:
      "Shared-core examples from a primary care demo. They do not demonstrate weight trends, a GLP-1 protocol, dose decisions, or a weight-loss outcome.",
    steps: [
      featureTutorials.intake.steps[1],
      featureTutorials.plans.steps[0],
      featureTutorials.plans.steps[2],
    ],
  },
  behavioralHealth: {
    title: "Organize the work around the next session.",
    introduction:
      "Reserve the session, find the open team task, and record the next contact. Follow the administrative handoffs without losing the owner of the work.",
    limitation:
      "These are shared scheduling and follow-up tools. The captures do not demonstrate protected psychotherapy notes, crisis response, or specialty assessment instruments.",
    steps: [
      {
        ...booking,
        label: "Reserve the session",
        title: "Give the session a time, clinician, and room.",
      },
      featureTutorials.team.steps[1],
      featureTutorials.plans.steps[2],
    ],
  },
  primaryCare: {
    title: "From visit preparation to a reviewed result.",
    introduction:
      "Read the clinician handoff, review the documented findings, and open a lab result for review. Each capture shows a real part of the primary care demo.",
    limitation:
      "Separate sample records illustrate these steps; they are not a single patient's completed journey. The lab-review form is shown before submission.",
    steps: [
      featureTutorials.intake.steps[2],
      featureTutorials.notes.steps[1],
      featureTutorials.labs.steps[1],
    ],
  },
  cashBilling: {
    title: "From a payment question to its financial record.",
    introduction:
      "Review the recorded payment, prepare a credit with a reason when needed, and check the invoice balance. Keep receipts, refunds, and invoice adjustments distinct.",
    limitation:
      "These separate app examples show recorded financial states. A paid invoice capture does not demonstrate a live card transaction or processor settlement.",
    steps: [
      {
        ...payment,
        label: "Review payments",
        title: "See what was received and what was refunded.",
        body: "Payments & receipts lists the payment method, original amount, refunds, amount after refunds, and receipt status. Open the recorded payment to inspect its related invoices and refunds.",
        detail:
          "In Billing: Payments & receipts → review method and amounts → open the payment or available receipt. Confirm any external processor outcome separately.",
        image: capture("finance-omni-payments-table"),
        width: 1160,
        height: 430,
        caption: "Recorded payments in a separate sample clinic.",
      },
      {
        ...invoice,
        label: "Prepare a credit",
        title: "Give the adjustment a recorded reason.",
        body: "Open the invoice credit form and review the amount and reason before saving. A credit reduces the invoice balance; it is separate from returning money through a refund.",
        detail:
          "Review the adjustment form before submission. This screen shows credit preparation, not a completed refund or processor action.",
        image: capture("finance-credit-dialog"),
        width: 601,
        height: 525,
        caption: "Invoice credit dialog with amount and reason controls.",
      },
      payment,
    ],
  },
  day: {
    title: "Follow the work through a clinic day.",
    introduction:
      "Start with the appointment, follow the team handoff, and see the financial record afterward. These separate app examples show what each part of the day looks like.",
    steps: [booking, arrival, board, invoice],
  },
  scheduling: {
    title: "From an open time to a visit in progress.",
    introduction:
      "Walk through the calendar, appointment form, and arrival queue. Each screen gives the next person something concrete to work with.",
    steps: [calendar, booking, arrival],
  },
  visits: {
    title: "From the front desk to the next handoff.",
    introduction:
      "See the screens that help staff find the patient, prepare the arrival, and understand the recorded visit stage.",
    steps: [directory, arrival, board],
  },
  trackingBoard: {
    title: "Read the handoff in one board.",
    introduction:
      "Start with the current visit stage, then scan the room, clinician, recorded care context, and timing. Use the board to find the operational work that needs a next action.",
    limitation:
      "Stage, timing, and row color describe recorded workflow. They do not establish clinical urgency or a completed handoff.",
    steps: [
      {
        ...board,
        detail:
          "Read across the row: patient and reason → current stage and room → assigned clinician → recorded vitals and care context. Open the visit for the underlying encounter; a board view does not complete the work.",
      },
    ],
  },
  inventory: {
    title: "Follow an inventory question beyond the total.",
    introduction:
      "Start with the catalog, inspect stock detail, then look at recorded movement. The screenshots show each part of that workflow.",
    steps: [stock, lots, movement],
  },
  billing: {
    title: "From a charge to a clear financial record.",
    introduction:
      "Review the invoice queue, open the service lines, and see how a settled invoice reads. These are separate examples of invoice states in the app.",
    steps: [
      {
        ...invoice,
        label: "Find the invoice",
        title: "Start with the invoices that need attention.",
        body: "Review recorded invoices and their balances together. Select the invoice you want to investigate before moving into its individual service lines.",
        detail:
          "In the invoice ledger: compare invoice state, date, total, and balance.",
        image: capture("finance-open-invoice-queue"),
        width: 1281,
        height: 945,
        caption: "Invoice queue showing recorded charges and open balances.",
      },
      invoice,
      payment,
    ],
  },
  reminders: {
    title: "Prepare the reminder. Check what happened next.",
    introduction:
      "Start in Appointment reminders, where upcoming visits and message history sit together. Review readiness before preparing a message, then inspect its recorded outcome.",
    limitation:
      "The demo uses sandbox delivery. Prepared, provider-accepted, delivered, and read are different states; this capture does not show a real text reaching a patient.",
    steps: [
      {
        ...reminders,
        detail:
          "Upcoming appointments → check contact and consent readiness → prepare a reminder. Then open Message history for queued, accepted, failed, or uncertain delivery outcomes; unresolved work needs a staff review.",
      },
    ],
  },
} satisfies Record<string, ProductTour>;

export type ProductTourKey = keyof typeof productTours;

const featureTours: Partial<Record<string, ProductTourKey>> = {
  "medication-workflows": "medications",
  "optional-insurance": "insurance",
  "labs-results": "labs",
  "care-plans": "plans",
  scheduling: "scheduling",
  "tracking-board": "trackingBoard",
  "team-workspace": "team",
  "clinical-notes": "notes",
  "intake-forms": "intake",
  "online-requests": "requests",
  "patient-portal": "portal",
  telehealth: "telehealth",
  inventory: "inventory",
  "cash-billing": "cashBilling",
  invoices: "billing",
  reminders: "reminders",
};

export function featureTour(slug: string) {
  return featureTours[slug];
}

// Only direct, supported subjects receive a product tour. A screenshot of a
// shared calendar must not be presented as proof of chair scheduling or AI.
export function growthTour(path: string): ProductTourKey | undefined {
  const segments = path
    .replace(/^\/meta-clinic(?=\/|$)/, "")
    .split("/")
    .filter(Boolean);
  const topic = segments.at(-1) ?? "";
  if (segments[0] === "ai" && segments.length === 1) return "ai";
  if (segments[0] === "ai" && ["scribe", "documentation"].includes(topic))
    return "ai";
  if (segments.length === 1 && topic === "weight-loss") return "weightLoss";
  if (segments.length === 1 && topic === "behavioral-health")
    return "behavioralHealth";
  if (segments.length === 1 && topic === "primary-care") return "primaryCare";
  if (
    ["platform", "demo", "sandbox", "solutions"].includes(topic) &&
    segments.length === 1
  )
    return "day";
  if (
    segments.length === 1 &&
    [
      "weight-loss",
      "behavioral-health",
      "primary-care",
      "direct-primary-care",
      "infusion",
      "mens-health",
      "hormone-therapy",
      "med-spa",
      "iv-therapy",
      "longevity",
      "physical-therapy",
      "psychiatry",
    ].includes(topic)
  )
    return "day";
  if (
    ![
      "platform",
      "weight-loss",
      "behavioral-health",
      "primary-care",
      "direct-primary-care",
      "infusion",
      "mens-health",
      "hormone-therapy",
      "med-spa",
      "iv-therapy",
      "longevity",
      "physical-therapy",
      "psychiatry",
    ].includes(segments[0])
  )
    return undefined;
  if (topic === "telehealth") return "telehealth";
  if (["ai-scribe", "documentation-assistance"].includes(topic)) return "ai";
  if (["labs", "lab-results"].includes(topic)) return "labs";
  if (["medications", "medication-management"].includes(topic))
    return "medications";
  if (["follow-ups", "treatment-plans"].includes(topic)) return "plans";
  if (topic === "patient-portal") return "portal";
  if (topic === "online-booking") return "requests";
  if (["scheduling", "recurring-appointments"].includes(topic))
    return "scheduling";
  if (
    [
      "inventory",
      "medication-inventory",
      "lot-tracking",
      "stock-movements",
    ].includes(topic)
  )
    return "inventory";
  if (["billing", "payments", "cash-pay"].includes(topic)) return "cashBilling";
  if (topic === "invoices") return "billing";
  if (["clinical-notes", "clinical-documentation"].includes(topic))
    return "notes";
  if (["patient-intake", "intake", "forms"].includes(topic)) return "intake";
  if (["care-plans", "care-planning", "goals"].includes(topic)) return "plans";
  if (["workflows", "patient-management"].includes(topic)) return "visits";
  if (["reminders", "appointment-reminders"].includes(topic))
    return "reminders";
  return undefined;
}
