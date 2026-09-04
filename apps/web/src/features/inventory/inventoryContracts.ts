export type InventoryCapability = boolean;
export type Decimal = string;

export function decimalParts(value: Decimal): [bigint, number] {
  const [whole, fraction = ""] = value.trim().split(".");
  const scale = fraction.length;
  return [BigInt(`${whole || "0"}${fraction}`), scale];
}

export function decimalAdd(left: Decimal, right: Decimal): Decimal {
  const [a, as] = decimalParts(left);
  const [b, bs] = decimalParts(right);
  const scale = Math.max(as, bs);
  const factorA = 10n ** BigInt(scale - as);
  const factorB = 10n ** BigInt(scale - bs);
  const raw = a * factorA + b * factorB;
  const sign = raw < 0n ? "-" : "";
  const text = (raw < 0n ? -raw : raw).toString().padStart(scale + 1, "0");
  return scale
    ? `${sign}${text.slice(0, -scale)}.${text.slice(-scale)}`
        .replace(/(\.\d*?)0+$/, "$1")
        .replace(/\.$/, "")
    : `${sign}${text}`;
}

export function decimalSubtract(left: Decimal, right: Decimal): Decimal {
  return decimalAdd(left, right.startsWith("-") ? right.slice(1) : `-${right}`);
}

export function decimalMultiply(left: Decimal, right: Decimal): Decimal {
  const [a, as] = decimalParts(left);
  const [b, bs] = decimalParts(right);
  const scale = as + bs;
  const raw = a * b;
  const sign = raw < 0n ? "-" : "";
  const text = (raw < 0n ? -raw : raw).toString().padStart(scale + 1, "0");
  return scale
    ? `${sign}${text.slice(0, -scale)}.${text.slice(-scale)}`
        .replace(/(\.\d*?)0+$/, "$1")
        .replace(/\.$/, "")
    : `${sign}${text}`;
}

export function decimalCeilDivide(left: Decimal, right: Decimal): Decimal {
  const [a, as] = decimalParts(left);
  const [b, bs] = decimalParts(right);
  if (a < 0n || b <= 0n)
    throw new RangeError("Ceiling division requires non-negative values.");
  const numerator = a * 10n ** BigInt(bs);
  const denominator = b * 10n ** BigInt(as);
  return ((numerator + denominator - 1n) / denominator).toString();
}

export function decimalSum(values: Decimal[]): Decimal {
  return values.reduce(decimalAdd, "0");
}

export function decimalCompare(left: Decimal, right: Decimal): number {
  const [a, as] = decimalParts(left);
  const [b, bs] = decimalParts(right);
  const scale = Math.max(as, bs);
  const alignedA = a * 10n ** BigInt(scale - as);
  const alignedB = b * 10n ** BigInt(scale - bs);
  return alignedA === alignedB ? 0 : alignedA < alignedB ? -1 : 1;
}

export function decimalDisplay(value: Decimal): string {
  const normalized = value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  const [whole, fraction] = normalized.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
}

export function decimalMoney(value: Decimal): string {
  const [whole, fraction = ""] = decimalDisplay(value).split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
}
export type InventoryProduct = {
  id: string;
  name: string;
  ndc: string;
  schedule: string | null;
  package_id: string;
  base_unit: string;
  units_per_package: Decimal;
  reorder_point_units: Decimal;
  preferred_supplier: string | null;
  preferred_supplier_id?: string | null;
  available_units: Decimal;
  on_hand_units: Decimal;
  low_stock: boolean;
};
export type InventoryPackage = {
  id: string;
  product_id: string;
  description: string;
  package_unit: string;
  units_per_package: Decimal;
};
export type InventoryLocation = {
  id: string;
  name: string;
  kind?: "storage" | "quarantine" | "returns" | "controlled";
  areas: string[];
};
export type InventoryLot = {
  id: string;
  product_id: string;
  package_id: string;
  lot_number: string;
  expiration_date: string;
  recall_id?: string;
  status: string;
};
export type InventoryBalance = {
  id: string;
  product_id: string;
  lot_id: string;
  location_id: string;
  recall_ids: string[];
  on_hand_units: Decimal;
  held_units: Decimal;
  blocked_units: Decimal;
  quarantined_units: Decimal;
  available_units: Decimal;
};
export type InventoryMovement = {
  id: string;
  type: string;
  lot_id: string;
  location_id: string;
  quantity_units: Decimal;
  direction: string;
  source_id: string;
  occurred_at: string;
  actor_id?: string;
  reason?: string;
};
export type InventoryPurchaseOrderLine = {
  id: string;
  product_id: string;
  package_id: string;
  ordered_packages: Decimal;
  units_per_package: Decimal;
  ordered_units: Decimal;
  package_price: Decimal;
  currency: string;
  received_units: Decimal;
  received_packages: Decimal;
};
export type InventoryPurchaseOrder = {
  id: string;
  number: string;
  status: string;
  supplier: string | null;
  destination: string;
  ordered_at: string;
  lines: InventoryPurchaseOrderLine[];
  subtotal: Decimal;
  tax: Decimal;
  shipping: Decimal;
  total: Decimal;
  cancelled_remaining_units?: Decimal;
};
export type InventoryShipment = {
  id: string;
  po_id: string;
  supplier_reference: string;
  status: string;
  package_count: number;
  delivered_at: string;
  expected_units: Decimal;
  allocations?: {
    purchase_order_line_id: string;
    expected_packages: Decimal;
  }[];
};
export type InventoryReceiptLine = {
  id: string;
  lot_id: string;
  quantity_packages: Decimal;
  quantity_units: Decimal;
  location_id: string;
  area_id: string | null;
  disposition?: string;
  temperature_c?: string;
  exception?: string;
};
export type InventoryReceipt = {
  id: string;
  shipment_id: string;
  status: string;
  received_by: string;
  started_at: string;
  lines: InventoryReceiptLine[];
};
export type InventoryRecall = {
  id: string;
  reference: string;
  product_id: string;
  lot_numbers: string[];
  status: string;
  effective_at: string;
  reason: string;
  required_disposition: string;
  affected_units: Decimal;
  held_units: Decimal;
  evidence_reference?: string;
  disposition_units?: Decimal;
};
export type InventoryReconciliation = {
  id: string;
  count_id: string;
  product_id: string;
  lot_id: string;
  location_id: string;
  status: string;
  expected_units: Decimal;
  counted_units: Decimal;
  variance_units: Decimal;
  counted_at: string;
  counter_id: string;
  investigation_required: boolean;
  investigation_note?: string;
  certified_at?: string;
  certified_by?: string;
};
export type InventoryAuditEvent = {
  id: string;
  action: string;
  actor_id: string;
  entity_id: string;
  occurred_at: string;
};
export type InventoryData = {
  schema_version: string;
  dataset_version: string;
  data_version: number;
  as_of: string;
  timezone: string;
  practice: { id: number; name: string; timezone: string };
  users: { id: string; name: string }[];
  suppliers?: { id: string; name: string }[];
  current_user_id: string;
  capabilities: Record<string, InventoryCapability>;
  products: InventoryProduct[];
  packages: InventoryPackage[];
  locations: InventoryLocation[];
  lots: InventoryLot[];
  balances: InventoryBalance[];
  movements: InventoryMovement[];
  purchase_orders: InventoryPurchaseOrder[];
  shipments: InventoryShipment[];
  receipts: InventoryReceipt[];
  recalls: InventoryRecall[];
  controlled_reconciliations: InventoryReconciliation[];
  audit_events: InventoryAuditEvent[];
  transfers?: {
    id: string;
    lot_id: string;
    source_location_id: string;
    destination_location_id: string;
    quantity_units: Decimal;
    status: string;
  }[];
  adjustments?: {
    id: string;
    lot_id: string;
    location_id: string;
    delta_units: Decimal;
    reason: string;
    status: string;
  }[];
  cycle_counts?: {
    id: string;
    lot_id: string;
    location_id: string;
    expected_units: Decimal;
    counted_units: Decimal;
    variance_units: Decimal;
    status: string;
  }[];
};
