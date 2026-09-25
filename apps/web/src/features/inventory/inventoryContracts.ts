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
  eligible?: boolean;
  eligibility_reason?: string | null;
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
  site_id: string | null;
  parent_location_id: string | null;
  status: "active" | "retired";
  path: string;
  child_count: number;
  stock_destination: boolean;
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
  transferable: boolean;
};
export type InventoryMovement = {
  id: string;
  type: string;
  lot_id: string;
  location_id: string;
  quantity_units: Decimal;
  direction: string;
  source?: { kind: string; label: string; href?: string };
  occurred_at: string;
  actor_id?: string;
  actor_name?: string | null;
  reason?: string;
  reverses_entry_id?: string | null;
  can_reverse?: boolean;
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

export type InventoryReadContext = Pick<
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
>;

export type InventoryActivityData = InventoryReadContext & {
  activity_page: {
    query: string;
    total_count: number;
    filtered_count: number;
    lot_id?: string | null;
    lot_number?: string | null;
    before_cursor: string | null;
    next_cursor: string | null;
    page_size: number;
  };
  movements: (InventoryMovement & {
    product_id: string;
    lot_number: string;
    location_name: string;
    stock_unit: string;
  })[];
};

export type InventoryCatalogRead = {
  q?: string;
  status?: "all" | "attention" | "in_range";
  sort?: "name" | "available_asc" | "available_desc";
  page?: number;
};
export type InventoryCatalogData = InventoryReadContext &
  Pick<InventoryData, "products" | "packages"> & {
    catalog_page: {
      query: string;
      status: NonNullable<InventoryCatalogRead["status"]>;
      sort: NonNullable<InventoryCatalogRead["sort"]>;
      page: number;
      page_count: number;
      page_size: number;
      total_count: number;
      filtered_count: number;
    };
    can_create_purchase_order: boolean;
    attention_count: number;
    attention: (Pick<
      InventoryLot,
      "id" | "product_id" | "lot_number" | "expiration_date" | "status"
    > & { product_name: string })[];
  };

export type InventoryPlanRead = {
  q?: string;
  plan_mode?: "needed" | "all";
  page?: number;
};
export type InventoryPlanData = InventoryReadContext &
  Pick<InventoryData, "products" | "sites" | "purchase_cart"> & {
    plan_page: {
      query: string;
      mode: NonNullable<InventoryPlanRead["plan_mode"]>;
      page: number;
      page_count: number;
      page_size: number;
      total_count: number;
      filtered_count: number;
      product_id: string | null;
    };
    explanations: Record<
      string,
      {
        available_units: Decimal;
        on_hand_units: Decimal;
        unavailable_units: Decimal;
        incoming_units: Decimal;
        pending_order_units: Decimal;
        draft_cart_packages: Decimal;
        shortage_units: Decimal;
        suggested_packages: Decimal;
        rounded_units: Decimal;
        unit_mismatch_count: number;
        offer: {
          supplier_name: string;
          supplier_product_id: string;
          supplier_id: string;
          package_quantity: Decimal;
          supplier_packages: Decimal;
          unit_price: Decimal;
          currency: string;
          desired_units: Decimal;
          total_cost: Decimal;
          overage_units: Decimal;
          lead_time_days: number | null;
        } | null;
        offer_error: string | null;
      }
    >;
  };

export type InventorySupplierRead = {
  q?: string;
  supplier_id?: string;
  page?: number;
};
export type InventorySupplierData = InventoryReadContext & {
  supplier_page: {
    query: string;
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
    filtered_count: number;
    supplier_id: string | null;
  };
  suppliers: { id: string; name: string }[];
  supplier_products: (InventorySupplierProduct & {
    eligible: boolean;
    eligibility_reason: string | null;
  })[];
  products: Pick<
    InventoryProduct,
    "id" | "name" | "ndc" | "preferred_supplier_id"
  >[];
};

export type InventoryStockRead = {
  q?: string;
  stock_status?: "all" | "available" | "held" | "expired";
  page?: number;
};

export type InventoryLocationRead = {
  q?: string;
  location_status?: "all" | "active" | "retired";
  page?: number;
};
export type InventoryLocationData = InventoryReadContext &
  Pick<InventoryData, "sites"> & {
    location_page: {
      query: string;
      status: NonNullable<InventoryLocationRead["location_status"]>;
      page: number;
      page_count: number;
      page_size: number;
      total_count: number;
      filtered_count: number;
    };
    locations: InventoryLocation[];
    location_options: InventoryLocation[];
  };

export type InventoryExceptionRead = {
  q?: string;
  exception_status?: "all" | "unreviewed" | "reviewed";
  category?:
    | "all"
    | "expiring"
    | "expired"
    | "inactive_product"
    | "inactive_location"
    | "hold"
    | "delivery_discrepancy";
  page?: number;
};
export type InventoryException = {
  id: string;
  source_kind: "batch" | "hold" | "reconciliation";
  source_id: string;
  category: string;
  title: string;
  product_id: string | null;
  product_name: string | null;
  lot_number: string | null;
  location_id: string | null;
  location_path: string | null;
  shipment_id: string | null;
  expires_on: string | null;
  quantity_units: Decimal | null;
  stock_unit: string | null;
  details: string;
  state: "open" | "reviewed";
  assignee_id: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  reason: string | null;
  evidence_reference: string | null;
  review_id: string | null;
};
export type InventoryExceptionData = InventoryReadContext & {
  exception_page: {
    query: string;
    status: NonNullable<InventoryExceptionRead["exception_status"]>;
    category: NonNullable<InventoryExceptionRead["category"]>;
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
    filtered_count: number;
  };
  exceptions: InventoryException[];
  assignees: { id: string; name: string }[];
};

export type InventoryRecallRead = {
  q?: string;
  recall_status?: "open" | "closed" | "all";
  page?: number;
  recall_id?: string;
  position_page?: number;
  history_page?: number;
  lot_q?: string;
  lot_page?: number;
  product_id?: string;
};
export type InventoryRecallSummary = {
  id: string;
  reference: string;
  product_id: string;
  product_name: string;
  stock_unit: string;
  status: "open" | "closed";
  effective_at: string;
  reason: string;
  required_disposition: string;
  affected_units: Decimal;
  remaining_units: Decimal;
  held_units: Decimal;
  uncontained_units: Decimal;
  disposition_units: Decimal;
  lot_count: number;
  closure: {
    reason: string;
    evidence_reference: string;
    actor_id: string;
    created_at: string;
  } | null;
};
export type InventoryRecallPosition = {
  batch_id: string;
  lot_id: string;
  lot_number: string;
  location_id: string;
  location_path: string;
  expires_on: string;
  on_hand_units: Decimal;
  held_for_case: boolean;
};
export type InventoryRecallDisposition = {
  id: string;
  batch_id: string;
  quantity_units: Decimal;
  method: string;
  evidence_reference: string;
  reason: string;
  actor_id: string;
  created_at: string;
};
export type InventoryRecallData = InventoryReadContext & {
  recall_page: {
    query: string;
    status: NonNullable<InventoryRecallRead["recall_status"]>;
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
    filtered_count: number;
    selected_id: string | null;
  };
  recalls: InventoryRecallSummary[];
  selected_recall: InventoryRecallSummary | null;
  positions: InventoryRecallPosition[];
  position_page: {
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
  };
  dispositions: InventoryRecallDisposition[];
  history_page: {
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
  };
  lot_options: {
    id: string;
    product_id: string;
    product_name: string;
    stock_unit: string;
    lot_number: string;
    expires_on: string;
  }[];
  lot_page: {
    query: string;
    product_id: string | null;
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
  };
};

export type InventoryCountRead = {
  q?: string;
  count_status?: "open" | "overdue" | "all" | "completed" | "cancelled";
  page?: number;
  session_id?: string;
  line_page?: number;
  history_page?: number;
};
export type InventoryCountSession = {
  id: string;
  location_id: string;
  location_path: string;
  assignee_id: string;
  assignee_name: string;
  due_on: string;
  blind: boolean;
  status: "open" | "completed" | "cancelled";
  reason: string;
  created_at: string;
  line_count: number;
  observed_count: number;
  skipped_count: number;
  reconciled_count: number;
};
export type InventoryCountLine = {
  id: string;
  batch_id: string;
  product_id: string;
  product_name: string;
  stock_unit: string;
  lot_number: string;
  location_path: string;
  expires_on: string;
  skipped: boolean;
  skip_reason: string | null;
  expected_units: Decimal | null;
  latest_count: {
    id: string;
    expected_units: Decimal;
    counted_units: Decimal;
    variance_units: Decimal;
    actor_id: string;
    created_at: string;
    approved: boolean;
    stale: boolean;
    can_approve: boolean;
  } | null;
  reconciled: boolean;
};
export type InventoryCountEvent = {
  id: string;
  kind: string;
  line_id: string | null;
  actor_id: string;
  reason: string;
  created_at: string;
  assignee_id: string | null;
  count: {
    id: string;
    expected_units: Decimal;
    counted_units: Decimal;
    variance_units: Decimal;
  } | null;
};
export type InventoryCountData = InventoryReadContext & {
  count_page: {
    query: string;
    status: NonNullable<InventoryCountRead["count_status"]>;
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
    filtered_count: number;
    selected_id: string | null;
  };
  sessions: InventoryCountSession[];
  selected_session: InventoryCountSession | null;
  lines: InventoryCountLine[];
  line_page: {
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
  };
  events: InventoryCountEvent[];
  history_page: {
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
  };
  locations: { id: string; path: string }[];
  assignees: { id: string; name: string }[];
};

export type InventoryControlledRead = {
  q?: string;
  control_status?: "all" | "pending" | "certified";
  page?: number;
};
export type InventoryControlledData = InventoryReadContext & {
  controlled_page: {
    query: string;
    status: NonNullable<InventoryControlledRead["control_status"]>;
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
    filtered_count: number;
  };
  products: Pick<
    InventoryProduct,
    "id" | "name" | "ndc" | "base_unit" | "schedule"
  >[];
  lots: Pick<
    InventoryLot,
    "id" | "product_id" | "lot_number" | "expiration_date"
  >[];
  locations: Pick<InventoryLocation, "id" | "name">[];
  controlled_reconciliations: (InventoryReconciliation & {
    can_investigate: boolean;
    can_certify: boolean;
    stale: boolean;
    approved: boolean;
  })[];
};

export type InventoryScanContext = "receiving" | "transfer" | "count";
export type InventoryScanMatch = {
  product_id: string;
  product_name: string;
  sku: string;
  ndc: string | null;
  device_identifier: string | null;
  matched_fields: ("sku" | "ndc" | "device_identifier")[];
  line_id?: string;
  line_page?: number;
  lot_number?: string;
  expires_on?: string | null;
  location_id?: string;
  location_name?: string;
};
export type InventoryScanData = {
  status: "matched" | "ambiguous" | "unmatched" | "too_many";
  normalized_code: string;
  message: string | null;
  matches: InventoryScanMatch[];
  page?: number;
  page_count?: number;
  total_count?: number;
  page_size?: number;
};

export type InventoryStockData = InventoryReadContext &
  Pick<
    InventoryData,
    "products" | "packages" | "lots" | "balances" | "locations"
  > & {
    stock_page: {
      query: string;
      status: NonNullable<InventoryStockRead["stock_status"]>;
      product_id: string | null;
      product_name: string | null;
      page: number;
      page_count: number;
      page_size: number;
      total_count: number;
      filtered_count: number;
    };
    unit_totals: {
      stock_unit: string;
      on_hand_units: Decimal;
      available_units: Decimal;
      unavailable_units: Decimal;
    }[];
  };

export type InventoryOrderRead = {
  q?: string;
  order_status?: string;
  page?: number;
};
export type InventoryOrderData = InventoryReadContext & {
  order_page: {
    query: string;
    status: string;
    page: number;
    page_count: number;
    page_size: number;
    total_groups: number;
    filtered_groups: number;
    total_orders: number;
    matching_orders: number;
  };
  purchase_orders: InventoryPurchaseOrder[];
  products: Pick<InventoryProduct, "id" | "name" | "ndc" | "base_unit">[];
  shipments: Pick<InventoryShipment, "id" | "po_id" | "supplier_reference">[];
};

export type InventoryReceivingRecall = Pick<
  InventoryRecall,
  "id" | "product_id" | "lot_numbers" | "reference" | "required_disposition"
>;
export type InventoryReceivingLotLookup = {
  lot: InventoryLot | null;
  recalls: InventoryReceivingRecall[];
};
export type InventoryReceivingDetail = InventoryReadContext &
  Pick<
    InventoryData,
    | "packages"
    | "lots"
    | "locations"
    | "receipts"
    | "shipments"
    | "purchase_orders"
  > & {
    products: Pick<InventoryProduct, "id" | "name" | "base_unit">[];
    recalls: InventoryReceivingRecall[];
  };
export type InventoryDeliveryRead = {
  q?: string;
  delivery_status?: "all" | "open" | "reconciled";
  page?: number;
  shipment_id?: string | null;
};
export type InventoryDeliveryData = InventoryReceivingDetail & {
  delivery_page: {
    query: string;
    status: NonNullable<InventoryDeliveryRead["delivery_status"]>;
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
    filtered_count: number;
    selected_shipment_id: string | null;
  };
  delivery_options: {
    id: string;
    supplier_reference: string;
    order_number: string;
    supplier_name: string | null;
    status: string;
  }[];
};

export type InventoryShipmentIntakeRead = {
  q?: string;
  page?: number;
  purchase_order_id?: string | null;
};

export type InventoryShipmentIntakeLine = {
  id: string;
  product_id: string;
  product_name: string;
  stock_unit: string;
  ordered_packages: Decimal;
  received_packages: Decimal;
  allocated_packages: Decimal;
  available_packages: Decimal;
  units_per_package: Decimal;
};

export type InventoryShipmentIntakeData = InventoryReadContext & {
  intake_page: {
    query: string;
    page: number;
    page_count: number;
    page_size: number;
    total_count: number;
    filtered_count: number;
    selected_order_id: string | null;
  };
  order_options: {
    id: string;
    number: string;
    status: string;
    supplier: string | null;
    destination: string | null;
  }[];
  selected_order: {
    id: string;
    number: string;
    status: string;
    supplier: string | null;
    destination: string | null;
    lines: InventoryShipmentIntakeLine[];
  } | null;
};
