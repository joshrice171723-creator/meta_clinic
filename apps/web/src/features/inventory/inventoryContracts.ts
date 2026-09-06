export type InventoryCapability = boolean;
export type Decimal = string;
export type InventoryCategory =
  | "medication"
  | "clinical_supply"
  | "lab_supply"
  | "office_supply"
  | "cleaning_supply"
  | "equipment"
  | "other";

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
  category: InventoryCategory;
  active: boolean;
  ndc: string;
  device_identifier: string;
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
export type NdcResult = {
  name: string;
  generic_name?: string;
  product_ndc?: string;
  ingredients?: string;
  dosage_form?: string;
  route?: string;
  package_description?: string;
  labeler?: string;
  ndc: string;
  reference_token: string;
};
export type GudidResult = {
  device_identifier: string;
  issuing_agency?: string;
  brand_name?: string;
  company_name?: string;
  version_model_number?: string;
  catalog_number?: string;
  device_description?: string;
  single_use?: boolean;
  lot_batch?: boolean;
  expiration_date?: boolean;
  device_sterile?: boolean;
  gmdn_name?: string;
  source_url: string;
  reference_token: string;
};
export type NadacBenchmark = {
  ndc: string;
  description?: string;
  nadac_per_unit: string;
  effective_date?: string;
  pricing_unit?: string;
  source_url: string;
  source_updated_at?: string;
};
export type InventorySupplierProduct = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  product_id: string | null;
  ndc: string;
  supplier_sku: string;
  description: string;
  package_quantity: Decimal;
  wholesale_unit_cost: Decimal;
  currency: string;
  ordering_unit: string;
  contract_status: string;
  available?: boolean | null;
  lead_time_days?: number | null;
  effective_date?: string | null;
  imported_at: string;
};
export type InventoryPackage = {
  id: string;
  product_id: string;
  description: string;
  input_unit: string;
  units_per_package: Decimal;
};
export type InventoryLocation = {
  id: string;
  name: string;
  kind?: "storage" | "quarantine" | "returns" | "controlled";
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  areas: string[];
};
export type InventoryFacility = {
  id: number;
  code: string;
  name: string;
  status: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
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
  product_name?: string;
  stock_unit?: string;
  input_unit?: string;
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
  checkout_group_id?: string | null;
  destination: string;
  receiving_site_id?: string | null;
  destination_address?: string | null;
  created_at: string;
  lines: InventoryPurchaseOrderLine[];
  subtotal: Decimal;
  tax: Decimal;
  shipping: Decimal;
  total: Decimal;
  cancelled_remaining_units?: Decimal;
};
export type InventoryPurchaseCartItem = {
  id: string;
  product_id: string;
  product_name: string;
  requested_packages: Decimal;
  input_unit: string;
  conversion_factor: Decimal;
  supplier_id: string | null;
  supplier: string | null;
  supplier_product_id: string | null;
  supplier_sku?: string | null;
  package_quantity: Decimal;
  supplier_packages?: Decimal;
  unit_price: Decimal;
  currency: string;
  extended_cost: Decimal;
  source: string;
  price_snapshot_at?: string | null;
  price_snapshot_digest?: string | null;
};
export type InventoryPurchaseCart = {
  id: string;
  status: string;
  destination_site_id?: string | null;
  reason?: string | null;
  checkout_group_id?: string | null;
  version: number;
  items: InventoryPurchaseCartItem[];
};
export type InventoryShipment = {
  id: string;
  po_id: string;
  supplier_reference: string;
  status: string;
  package_count: number;
  delivered_at: string;
  expected_units: Decimal;
  reconciliation?: {
    id: string;
    accepted_packages: Decimal;
    missing_packages: Decimal;
    rejected_packages: Decimal;
    excess_packages: Decimal;
    exception: string;
    reason: string;
    observations: {
      product_id: string;
      lot_number?: string;
      expires_on?: string;
      temperature_c?: string;
    }[];
    actor_id: string;
    recorded_at: string;
  } | null;
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
  configuration?: {
    status: "draft" | "configured" | "synthetic" | "suspended" | "retired";
    version: number;
    reason: string;
    operator_reference?: string | null;
  };
  as_of: string;
  timezone: string;
  practice: { id: number; name: string; timezone: string };
  users: { id: string; name: string }[];
  suppliers?: { id: string; name: string }[];
  supplier_products?: InventorySupplierProduct[];
  current_user_id: string;
  capabilities: Record<string, InventoryCapability>;
  products: InventoryProduct[];
  packages: InventoryPackage[];
  locations: InventoryLocation[];
  sites?: InventoryFacility[];
  lots: InventoryLot[];
  balances: InventoryBalance[];
  movements: InventoryMovement[];
  purchase_orders: InventoryPurchaseOrder[];
  purchase_cart?: InventoryPurchaseCart | null;
  shipments: InventoryShipment[];
  receipts: InventoryReceipt[];
  recalls: InventoryRecall[];
  controlled_reconciliations: InventoryReconciliation[];
  audit_events: InventoryAuditEvent[];
};

export type InventoryActivityData = Pick<
  InventoryData,
  | "schema_version"
  | "dataset_version"
  | "data_version"
  | "configuration"
  | "as_of"
  | "timezone"
  | "practice"
  | "users"
  | "current_user_id"
  | "capabilities"
> & {
  activity_page: {
    query: string;
    total_count: number;
    filtered_count: number;
    before_cursor: string | null;
    next_cursor: string | null;
    page_size: number;
  };
  movements: (InventoryMovement & {
    lot_number: string;
    location_name: string;
    stock_unit: string;
  })[];
};
