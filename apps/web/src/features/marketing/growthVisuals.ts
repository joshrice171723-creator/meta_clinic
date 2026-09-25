export type MarketingVisual = {
  image: string;
  alt: string;
  caption?: string;
  kind: "photo" | "product";
};

const photo = (name: string, alt: string): MarketingVisual => ({
  image: `/marketing/${name}.png`,
  alt,
  kind: "photo",
});

const product = (name: string, alt: string, caption: string): MarketingVisual => ({
  image: `/marketing/${name}.png`,
  alt,
  caption,
  kind: "product",
});

const productScreens = {
  schedule: product("captures/schedule-booking-omni-adapted", "Meta Clinic appointment form with sample patient, visit, clinician, and room details.", "Appointment setup"),
  calendar: product("captures/schedule-month-omni-october", "Meta Clinic month calendar with sample clinic appointments.", "Clinic calendar"),
  patients: product("captures/patient-directory-21-natural-records", "Meta Clinic patient directory with sample records and search controls.", "Patient directory"),
  inventory: product("captures/inventory-catalog-100-products", "Meta Clinic inventory catalog with sample products, quantities, and reorder points.", "Inventory catalog"),
  lots: product("captures/inventory-omni-stock-detail-lot-table", "Meta Clinic stock detail with sample lot, location, and quantity information.", "Lot and stock detail"),
  memberships: product("captures/membership-catalog-five-programs", "Meta Clinic membership catalog with sample clinic programs.", "Membership catalog"),
  invoices: product("captures/finance-open-invoice-detail", "Meta Clinic invoice detail with sample line items and an open balance.", "Invoice detail"),
  payments: product("captures/finance-paid-invoice-detail", "Meta Clinic invoice detail with a sample payment, credit, and balance.", "Payment and invoice detail"),
  visits: product("captures/tracking-board-varied-stages-omni", "Meta Clinic tracking board with sample visits at different stages.", "Visit tracking board"),
};

function topicPhoto(path: string): MarketingVisual | undefined {
  if (/glp-1|weight-loss|metabolic/.test(path)) return photo("weight-management-visit", "A clinician and patient discussing a weight management visit.");
  if (/behavioral-health|psychiatry|mental-health/.test(path)) return photo("behavioral-health-session", "A behavioral health clinician speaking with a patient in an office.");
  if (/infusion|iv-therapy/.test(path)) return photo("infusion-care", "A patient and clinician during an infusion clinic visit.");
  if (/trt|testosterone|hormone/.test(path)) return photo("hormone-health-visit", "A clinician speaking with a patient during a health visit.");
  if (/telehealth|video|virtual/.test(path)) return photo("scheduling-telehealth", "Clinic staff preparing a remote appointment together.");
  if (/intake|forms|patient-portal|patient-management/.test(path)) return photo("primary-care-front-desk", "A patient and clinic coordinator speaking at the front desk.");
  if (/inventory|stock|lot|receiv|purchas|replenish|forecast|supply|pharmac/.test(path)) return photo("inventory-review", "Clinic staff reviewing supplies and inventory at a workstation.");
  if (/membership|subscription|package/.test(path)) return photo("memberships-team", "Clinic team members reviewing a membership program together.");
  if (/billing|payment|invoice|cash-pay|pricing|checkout|collection|stripe/.test(path)) return photo("cash-billing-team", "Clinic staff reviewing a billing workflow at a desk.");
  if (/scheduling|booking|appointment|calendar/.test(path)) return photo("scheduling-front-desk", "A clinic coordinator working with a scheduling calendar.");
  if (/follow-up|messaging|notification|workflow|task|reporting/.test(path)) return photo("tracking-board-handoff", "Clinic staff discussing visit follow-through at a workstation.");
  return undefined;
}

function specialtyPhoto(path: string): MarketingVisual | undefined {
  const root = path.split("/")[1];
  if (root === "weight-loss" || root === "weight-loss-clinics") {
    if (/inventory|stock|lot|replenish/.test(path)) return photo("inventory-review", "Clinic staff reviewing treatment supplies and stock together.");
    if (/glp-1|medication|lab|progress|weight-tracking/.test(path)) return photo("weight-management-visit", "A clinician and patient discussing a weight management visit.");
    return photo("weight-management-team", "Weight management clinic staff reviewing a patient program at a desk.");
  }
  if (root === "behavioral-health" || root === "psychiatry") {
    return /scheduling|billing|intake|forms/.test(path)
      ? photo("behavioral-health-team", "Behavioral health practice staff reviewing clinic work together.")
      : photo("behavioral-health-session", "A behavioral health clinician speaking with a patient in an office.");
  }
  if (root === "primary-care" || root === "direct-primary-care") return /cash-pay|billing|payment|invoice/.test(path)
    ? photo("cash-billing-checkout", "Clinic staff reviewing patient checkout and billing together.")
    : photo("primary-care-visit", "A clinician speaking with a patient during a primary care visit.");
  if (root === "infusion" || root === "iv-therapy") return /inventory|lot|receiv|supply/.test(path)
    ? photo("infusion-team", "Infusion clinic staff reviewing treatment supplies together.")
    : photo("infusion-care", "A patient and clinician during an infusion clinic visit.");
  if (root === "mens-health" || root === "hormone-therapy" || root === "longevity") return photo("hormone-health-visit", "A clinician speaking with a patient during a health visit.");
  if (root === "med-spa") return photo("aesthetics-consult", "A clinician and patient discussing an aesthetic service.");
  if (root === "physical-therapy") return photo("rehabilitation-visit", "A physical therapist working with a patient during a visit.");
  return undefined;
}

function relatedProduct(path: string, group: string): MarketingVisual | undefined {
  if (["Legal", "Security / Compliance", "Customer proof", "Comparison / alternative pages", "Integrations", "Company", "AI"].includes(group)) return undefined;
  if (/telehealth|video|virtual/.test(path)) return productScreens.calendar;
  if (/lot|expir|recall/.test(path)) return productScreens.lots;
  if (/inventory|stock|receiv|purchas|replenish|forecast|supply/.test(path)) return productScreens.inventory;
  if (/membership|subscription|package/.test(path)) return productScreens.memberships;
  if (/invoice/.test(path)) return productScreens.invoices;
  if (/billing|payment|cash-pay|pricing|checkout|collection/.test(path)) return productScreens.payments;
  if (/scheduling|booking|appointment|calendar/.test(path)) return productScreens.schedule;
  if (/intake|forms|patient-portal|patient-management/.test(path)) return productScreens.patients;
  if (/glp-1|medication|prescrib/.test(path)) return productScreens.inventory;
  if (/follow-up|workflow|task|reporting|recurring/.test(path)) return productScreens.visits;
  return undefined;
}

export function getGrowthVisuals(path: string, group: string): { hero: MarketingVisual; product?: MarketingVisual } {
  const specialty = specialtyPhoto(path);
  const topical = topicPhoto(path);
  const hero = specialty ?? topical ?? (
    group === "AI" ? photo("primary-care-visit", "A clinician speaking with a patient at a desk.")
      : group === "Security / Compliance" || group === "Legal" ? photo("scheduling-team", "Clinic staff reviewing work together at a computer.")
        : group === "Customer proof" || group === "Comparison / alternative pages" ? productScreens.calendar
          : group === "Company" ? photo("scheduling-team", "Clinic staff reviewing the day's work together.")
            : group === "Integrations" ? photo("tracking-board-team", "Clinic staff reviewing operational work at a workstation.")
              : photo("primary-care-visit", "A clinician speaking with a patient during a clinic visit.")
  );
  const screen = relatedProduct(path, group);
  return { hero, product: screen?.image === hero.image ? undefined : screen };
}
