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
    title: "Keep the next appointment in view.",
    introduction:
      "Begin with the calendar, prepare appointment reminders, and return to the front-desk queue as the visit approaches.",
    steps: [calendar, reminders, arrival],
  },
} satisfies Record<string, ProductTour>;

export type ProductTourKey = keyof typeof productTours;

const featureTours: Partial<Record<string, ProductTourKey>> = {
  "medication-workflows": "medications",
  "optional-insurance": "insurance",
  "labs-results": "labs",
  "care-plans": "plans",
  scheduling: "scheduling",
  "tracking-board": "visits",
  "team-workspace": "team",
  "clinical-notes": "notes",
  "intake-forms": "intake",
  "online-requests": "requests",
  "patient-portal": "portal",
  telehealth: "telehealth",
  inventory: "inventory",
  "cash-billing": "billing",
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
  if (topic === "patient-portal") return "portal";
  if (topic === "online-booking") return "requests";
  if (
    [
      "scheduling",
      "recurring-appointments",
    ].includes(topic)
  )
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
  if (["billing", "payments", "invoices", "cash-pay"].includes(topic))
    return "billing";
  if (["clinical-notes", "clinical-documentation"].includes(topic)) return "notes";
  if (["patient-intake", "intake", "forms"].includes(topic)) return "intake";
  if (["care-plans", "care-planning", "goals"].includes(topic)) return "plans";
  if (
    [
      "workflows",
      "patient-management",
    ].includes(topic)
  )
    return "visits";
  if (["reminders", "appointment-reminders"].includes(topic))
    return "reminders";
  return undefined;
}
