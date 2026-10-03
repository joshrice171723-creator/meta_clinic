export type Screen =
  | "catalog"
  | "catalog_new"
  | "configure"
  | "locations"
  | "supplier_pricing"
  | "replenishment"
  | "purchasing"
  | "purchase_order_new"
  | "shipment_new"
  | "receiving"
  | "lots"
  | "activity"
  | "exceptions"
  | "recalls"
  | "counts"
  | "controlled";
export const links: {
  screen: Screen;
  href: string;
  label: string;
  short: string;
  group: "Monitor" | "Procure" | "Operate" | "Exceptions";
}[] = [
  {
    screen: "catalog",
    href: "/clinic/inventory",
    label: "Inventory overview",
    short: "Overview",
    group: "Monitor",
  },
  {
    screen: "replenishment",
    href: "/clinic/inventory/replenishment",
    label: "Plan replenishment",
    short: "Plan order",
    group: "Procure",
  },
  {
    screen: "purchasing",
    href: "/clinic/inventory/purchasing",
    label: "Orders & delivery",
    short: "Orders",
    group: "Procure",
  },
  {
    screen: "supplier_pricing",
    href: "/clinic/inventory/suppliers",
    label: "Suppliers & pricing",
    short: "Suppliers",
    group: "Procure",
  },
  {
    screen: "receiving",
    href: "/clinic/inventory/receiving",
    label: "Receive & put away",
    short: "Receive",
    group: "Operate",
  },
  {
    screen: "lots",
    href: "/clinic/inventory/lots",
    label: "Stock by lot",
    short: "Stock detail",
    group: "Monitor",
  },
  {
    screen: "activity",
    href: "/clinic/inventory/activity",
    label: "Movement ledger",
    short: "Activity",
    group: "Operate",
  },
  {
    screen: "exceptions",
    href: "/clinic/inventory/exceptions",
    label: "Exception queue",
    short: "Exceptions",
    group: "Exceptions",
  },
  {
    screen: "recalls",
    href: "/clinic/inventory/recalls",
    label: "Recall cases",
    short: "Recalls",
    group: "Exceptions",
  },
  {
    screen: "counts",
    href: "/clinic/inventory/counts",
    label: "Cycle counts",
    short: "Counts",
    group: "Operate",
  },
  {
    screen: "controlled",
    href: "/clinic/inventory/controlled",
    label: "Controlled reconciliation",
    short: "Controlled",
    group: "Exceptions",
  },
];

export const screenDescriptions: Record<Screen, string> = {
  catalog: "Monitor availability, lot exceptions, and replenishment signals.",
  catalog_new: "Add a product definition before ordering or receiving stock.",
  configure:
    "Record the inventory operating configuration before posting stock.",
  locations:
    "Manage stock storage, quarantine, returns, and controlled locations.",
  supplier_pricing: "",
  replenishment: "Turn low-stock signals into reviewed purchase requests.",
  purchasing: "Track purchase orders from draft through completion.",
  purchase_order_new:
    "Create a reviewed purchase order for any active catalog item.",
  shipment_new: "Record a delivered shipment against a sent purchase order.",
  receiving: "Verify deliveries, lot details, and quarantine exceptions.",
  lots: "Review exact balances by lot and storage location.",
  activity: "Trace every stock movement to its source and operator.",
  exceptions: "Assign and review expiry, stock, hold, and delivery exceptions.",
  recalls: "Keep affected lots held until disposition is recorded.",
  counts: "Run assigned blind counts and reconcile every frozen bin position.",
  controlled: "Resolve count variances with an independent reviewer.",
};

export function screenForPath(path: string): Screen {
  const value = path.replace(/\/$/, "");
  if (value === "/clinic/inventory/catalog/new") return "catalog_new";
  if (value === "/clinic/inventory/configure") return "configure";
  if (value === "/clinic/inventory/locations") return "locations";
  if (value === "/clinic/inventory/suppliers") return "supplier_pricing";
  if (value === "/clinic/inventory/purchasing/new") return "purchase_order_new";
  if (value === "/clinic/inventory/shipments/new") return "shipment_new";
  return links.find((link) => link.href === value)?.screen ?? "catalog";
}
export function screenTitle(screen: Screen) {
  return (
    {
      catalog: "Inventory overview",
      catalog_new: "Add catalog item",
      configure: "Configure inventory",
      locations: "Storage locations",
      supplier_pricing: "Suppliers & pricing",
      replenishment: "Plan replenishment",
      purchasing: "Orders & delivery",
      purchase_order_new: "Create purchase order",
      shipment_new: "Record delivered shipment",
      receiving: "Receive & put away",
      lots: "Stock by lot",
      activity: "Movement ledger",
      exceptions: "Exception queue",
      recalls: "Recall case management",
      counts: "Cycle counts",
      controlled: "Controlled reconciliation",
    } satisfies Record<Screen, string>
  )[screen];
}
