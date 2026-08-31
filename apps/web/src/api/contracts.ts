// Browser-facing response types only. Business rules live in apps/api.
export type Decimal = string;
export type AppearancePreference = {
  palette: "sage" | "blue" | "graphite";
  mode: "system" | "light" | "dark";
};
export type UserSettings = {
  user_id: number;
  appearance: AppearancePreference & { version: number };
};
export type User = {
  id: number;
  email_address: string;
  admin: boolean;
  development_demo?: boolean;
};
export type Paperwork = {
  id: number;
  title: string;
  document_version: string;
  demo: boolean;
  signing_available: boolean;
  status: string;
  started_at: string | null;
  signed_at: string | null;
  body?: string;
  content_digest?: string;
  signature_name?: string;
  signature_digest?: string;
  consent_version?: string;
};
export type Material = {
  id: number;
  title: string;
  summary: string;
  status: string;
  sample: boolean;
  body?: string;
};
export type Item = {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  reorder_level: number;
};
export type Patient = { id: number; display_name: string; reference: string };
export type StaffMember = {
  id: number;
  display_name: string;
  job_title: string;
  active: boolean;
};
export type ClinicOverview = {
  practice: { id: number; name: string; timezone: string };
  capabilities: {
    patients_access: boolean;
    inventory_access: boolean;
    staff_access: boolean;
  };
  inventory_actions: Record<
    | "catalog"
    | "receive"
    | "adjust"
    | "hold"
    | "release"
    | "count"
    | "configure",
    boolean
  >;
  development_demo: boolean;
  patient_count: number | null;
  active_staff_count: number | null;
  low_stock: Item[] | null;
};
export type Product = {
  id: number;
  name: string;
  sku: string;
  ndc: string | null;
  product_ndc: string | null;
  generic_name: string | null;
  ingredients: string | null;
  dosage_form: string | null;
  route: string | null;
  labeler: string | null;
  package_description: string | null;
  source: string;
  imported_at: string | null;
  reorder_point: number;
  active: boolean;
  stock_unit: string;
  quantity_scale: number;
  package_size: Decimal;
  unit_reference: string | null;
  available_quantity: Decimal;
  on_hand_quantity: Decimal;
  low_stock: boolean;
  locations: string[];
  next_expiry: string | null;
};
export type StockEvent = {
  id: number;
  actor_id: number;
  created_at: string;
  reason: string;
  kind: string;
  quantity: Decimal | null;
};
export type BatchSummary = {
  id: number;
  product_id: number;
  product_name: string;
  stock_unit: string;
  lot_number: string;
  location: string;
  expires_on: string;
  quantity: Decimal;
  available: boolean;
  status: string;
  expiring: boolean;
};
export type Catalog = {
  product_count: number;
  active_count: number;
  low_count: number;
  query: string;
  filter: string;
  page: number;
  filtered_count: number;
  unit_totals: { unit: string; available: Decimal; unavailable: Decimal }[];
  products: Product[];
  low_stock: Product[];
  attention: BatchSummary[];
  movements: (StockEvent & {
    product_id: number;
    product_name: string;
    lot_number: string;
    location: string;
    stock_unit: string;
  })[];
  profile: { version: number; status: string } | null;
};
export type Batch = BatchSummary & {
  holds: { id: number; kind: string; reason: string }[];
  counts: {
    id: number;
    expected_quantity: Decimal;
    observed_quantity: Decimal;
    reason: string;
    approved_by: number | null;
  }[];
  receipts: {
    id: number;
    received_at: string;
    input_quantity: Decimal;
    input_unit: string;
    conversion_factor: Decimal;
    quantity: Decimal;
    stock_unit: string;
    supplier: string | null;
    unit_cost: Decimal | null;
    currency: string | null;
    invoice_reference: string | null;
  }[];
  histories: StockEvent[];
};
export type ProductDetails = {
  product: Product;
  batches: Batch[];
  batch_page: number;
  batch_count: number;
  timezone: string;
};
export type NdcResult = {
  name: string;
  ingredients: string;
  dosage_form: string;
  package_description: string;
  ndc: string;
  labeler: string;
  reference_token: string;
};
