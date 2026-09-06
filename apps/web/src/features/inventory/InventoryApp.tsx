import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";
import { Alert, Button, Chip, MenuItem, TextField } from "@mui/material";
import { api, ApiError } from "../../api/client";
import { Form as InventoryForm, LoadState } from "../../shared/ui";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import type {
  InventoryBalance,
  InventoryData,
  InventoryActivityData,
  InventoryCatalogData,
  InventoryCatalogRead,
  InventoryPlanData,
  InventoryPlanRead,
  InventoryStockData,
  InventoryStockRead,
  InventoryOrderData,
  InventoryOrderRead,
  InventoryDeliveryData,
  InventoryDeliveryRead,
  InventoryReceivingDetail,
  InventoryReceivingLotLookup,
  InventoryProduct,
  InventoryRecall,
  InventoryCategory,
  Decimal,
  InventorySupplierProduct,
  InventoryFacility,
  InventoryPurchaseOrder,
  NadacBenchmark,
  GudidResult,
  NdcResult,
} from "./inventoryContracts";
import {
  decimalAdd,
  decimalCeilDivide,
  decimalCompare,
  decimalDisplay,
  decimalMoney,
  decimalMultiply,
  decimalSubtract,
  decimalSum,
} from "./inventoryContracts";
import { SupplierPricingScreen } from "./SupplierPricing";
import "./inventory.css";

type Screen =
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
  | "recalls"
  | "controlled";
type Notice = {
  tone: "success" | "error";
  title: string;
  detail: string;
} | null;
export type PendingInventoryMutation = {
  key: string;
  endpoint: string;
  intent: string;
};

export function inventoryMutationAttempt(
  pending: PendingInventoryMutation | null,
  endpoint: string,
  body: Record<string, unknown>,
  createKey: () => string = () => crypto.randomUUID(),
): PendingInventoryMutation | null {
  const intent = JSON.stringify({ endpoint, body });
  if (pending && (pending.endpoint !== endpoint || pending.intent !== intent))
    return null;
  return { key: pending?.key ?? createKey(), endpoint, intent };
}

export function inventoryOutcomeUnconfirmed(reason: unknown): boolean {
  return (
    !(reason instanceof ApiError) ||
    reason.code === "outcome_unconfirmed" ||
    reason.status >= 500 ||
    (reason.status === 409 && /outcome is unconfirmed/i.test(reason.message))
  );
}

export function inventoryMovementViewState(
  total: number,
  visible: number,
  filter: string,
): "empty" | "filtered_empty" | "results" {
  if (total === 0) return "empty";
  if (visible === 0 && filter.trim()) return "filtered_empty";
  return "results";
}

const links: {
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
    screen: "recalls",
    href: "/clinic/inventory/recalls",
    label: "Expiry & recalls",
    short: "Exceptions",
    group: "Exceptions",
  },
  {
    screen: "controlled",
    href: "/clinic/inventory/controlled",
    label: "Controlled reconciliation",
    short: "Controlled",
    group: "Exceptions",
  },
];

const inventoryCategories: Array<{
  value: InventoryCategory;
  label: string;
}> = [
  { value: "medication", label: "Medication" },
  { value: "clinical_supply", label: "Clinical supply" },
  { value: "lab_supply", label: "Lab / specimen supply" },
  { value: "office_supply", label: "Office supply" },
  { value: "cleaning_supply", label: "Cleaning / facility" },
  { value: "equipment", label: "Equipment" },
  { value: "other", label: "Other" },
];

function inventoryCategoryLabel(category: InventoryCategory): string {
  return inventoryCategories.find((option) => option.value === category)?.label ?? "Other";
}

const screenDescriptions: Record<Screen, string> = {
  catalog: "Monitor availability, lot exceptions, and replenishment signals.",
  catalog_new: "Add a product definition before ordering or receiving stock.",
  configure:
    "Record the inventory operating configuration before posting stock.",
  locations: "Manage stock storage, quarantine, returns, and controlled locations.",
  supplier_pricing: "",
  replenishment: "Turn low-stock signals into reviewed purchase requests.",
  purchasing: "Track purchase orders from draft through completion.",
  purchase_order_new:
    "Create a reviewed purchase order for any active catalog item.",
  shipment_new: "Record a delivered shipment against a sent purchase order.",
  receiving: "Verify deliveries, lot details, and quarantine exceptions.",
  lots: "Review exact balances by lot and storage location.",
  activity: "Trace every stock movement to its source and operator.",
  recalls: "Keep affected lots held until disposition is recorded.",
  controlled: "Resolve count variances with an independent reviewer.",
};

const inventoryConfigurationReasons = [
  { value: "initial_setup", label: "Initial clinic inventory setup" },
  { value: "enable_operations", label: "Enable purchasing and receiving" },
  { value: "resume_operations", label: "Resume inventory operations" },
  { value: "approved_change", label: "Approved operating change" },
  { value: "other", label: "Other" },
] as const;

const purchaseOrderReasons = [
  { value: "reorder_point", label: "Below reorder point" },
  { value: "stockout_prevention", label: "Prevent stockout" },
  { value: "initial_stock", label: "Initial stock for new catalog item" },
  {
    value: "replacement",
    label: "Replace damaged, expired, or recalled stock",
  },
  { value: "approved_request", label: "Approved clinic request" },
  { value: "other", label: "Other" },
] as const;

const purchaseOrderCurrency = "USD";

function screenForPath(path: string): Screen {
  const value = path.replace(/\/$/, "");
  if (value === "/clinic/inventory/catalog/new") return "catalog_new";
  if (value === "/clinic/inventory/configure") return "configure";
  if (value === "/clinic/inventory/locations") return "locations";
  if (value === "/clinic/inventory/suppliers") return "supplier_pricing";
  if (value === "/clinic/inventory/purchasing/new") return "purchase_order_new";
  if (value === "/clinic/inventory/shipments/new") return "shipment_new";
  return links.find((link) => link.href === value)?.screen ?? "catalog";
}
function screenTitle(screen: Screen) {
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
      recalls: "Expiry & recalls",
      controlled: "Controlled reconciliation",
    } satisfies Record<Screen, string>
  )[screen];
}

function number(value: number | string) {
  return decimalDisplay(String(value));
}
function nonNegative(value: Decimal): Decimal {
  return decimalCompare(value, "0") < 0 ? "0" : value;
}
function validDecimal(value: string, allowZero = false) {
  if (!/^-?\d+(?:\.\d+)?$/.test(value.trim())) return false;
  return decimalCompare(value, "0") >= (allowZero ? 0 : 1);
}
type InferredInventoryUnits = {
  stockUnit: "each" | "tablet" | "capsule" | "vial" | "mL" | "g" | "package";
  packageSize: string;
  quantityScale: string;
  source: "package-description" | "container";
};
export function inferInventoryUnits(
  result: Pick<NdcResult, "dosage_form" | "package_description">,
): InferredInventoryUnits {
  const description = result.package_description ?? "";
  const matches = Array.from(
    description.matchAll(
      /(?:^|[\s,;(])([0-9]+(?:\.[0-9]+)?)\s*(TABLETS?|CAPSULES?|VIALS?|ML|MILLILITERS?|G|GRAMS?|EACH|PATCH(?:ES)?|SYRINGES?|APPLICATORS?|BOTTLES?|TUBES?|PACK(?:S|ETS)?|POUCH(?:ES)?)/gi,
    ),
  );
  const standardUnit = (value: string) => {
    const unit = value.toLowerCase();
    if (unit.startsWith("tablet")) return "tablet" as const;
    if (unit.startsWith("capsule")) return "capsule" as const;
    if (unit.startsWith("vial")) return "vial" as const;
    if (["ml", "milliliter", "milliliters"].includes(unit))
      return "mL" as const;
    if (["g", "gram", "grams"].includes(unit)) return "g" as const;
    if (unit === "each" || /patch|syringe|applicator/.test(unit))
      return "each" as const;
    return "package" as const;
  };
  const preferred = matches.find(
    (match) => !/bottle|tube|pack|pouch/i.test(match[2]),
  );
  const match = preferred ?? matches[0];
  if (match) {
    const stockUnit = standardUnit(match[2]);
    const packageSize = match[1];
    return {
      stockUnit,
      packageSize: stockUnit === "package" ? "1" : packageSize,
      quantityScale:
        stockUnit === "mL" || stockUnit === "g"
          ? String(Math.min(packageSize.split(".")[1]?.length ?? 0, 6))
          : "0",
      source: preferred ? "package-description" : "container",
    };
  }

  return {
    stockUnit: "package",
    packageSize: "1",
    quantityScale: "0",
    source: "container",
  };
}
function inventoryUnitDefinition(unit: string, quantity: string) {
  const labels: Record<string, string> = {
    each: "unit",
    tablet: "tablet",
    capsule: "capsule",
    vial: "vial",
    mL: "mL",
    g: "g",
    package: "package",
  };
  const label = labels[unit] ?? "unit";
  const plural =
    ["mL", "g"].includes(unit) || decimalCompare(quantity, "1") === 0
      ? label
      : label + "s";
  return decimalDisplay(quantity) + " " + plural + " per package";
}
function unitLabel(data: InventoryData, productId: string) {
  return product(data, productId)?.base_unit ?? "unavailable unit";
}
function packageFor(data: Pick<InventoryData, "packages">, packageId?: string) {
  return data.packages.find((item) => item.id === packageId);
}
function money(value: Decimal, currency?: string) {
  return `${currency ? `${currency} ` : ""}${decimalMoney(value)}`;
}
export function inventoryDate(value?: string, timezone?: string) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(value));
}
export function inventoryDateTime(value?: string, timezone?: string) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone,
      }).format(new Date(value))
    : "—";
}
function capability(data: Pick<InventoryData, "capabilities">, key: string) {
  return data.capabilities[key] === true;
}
function product<T extends { id: string }>(data: { products: T[] }, id: string) {
  return data.products.find((item) => item.id === id);
}
function lot(data: Pick<InventoryData, "lots">, id: string) {
  return data.lots.find((item) => item.id === id);
}
function location(data: Pick<InventoryData, "locations">, id: string) {
  return data.locations.find((item) => item.id === id);
}
function balanceFor(data: Pick<InventoryData, "balances">, balanceId?: string) {
  return (
    data.balances.find((item) => item.id === balanceId) ??
    data.balances.find(
      (item) => decimalCompare(item.available_units, "0") > 0,
    ) ??
    data.balances[0]
  );
}

export function recallSelectableBalances(
  balances: InventoryBalance[],
  recallId: string,
  recallLotIds: string[],
): InventoryBalance[] {
  return balances.filter(
    (balance) =>
      recallLotIds.includes(balance.lot_id) &&
      balance.recall_ids?.includes(recallId),
  );
}

export function recallViewState(
  recall: Pick<InventoryRecall, "status"> | undefined,
  hasExactBatch: boolean,
) {
  if (!recall) {
    return {
      empty: true,
      actionable: false,
      availability: "Not held",
      showComplete: false,
      workflowStage: -1,
    };
  }
  const workflowStage =
    {
      identified: 0,
      inventory_locked: 1,
      location_sweep: 2,
      isolated: 3,
      disposition_pending: 4,
      disposition_complete: 5,
      closed: 6,
    }[recall.status] ?? 1;
  return {
    empty: false,
    actionable: hasExactBatch,
    availability: hasExactBatch ? "held" : "Not held for this recall",
    showComplete:
      hasExactBatch &&
      ["disposition_complete", "closed"].includes(recall.status),
    workflowStage: hasExactBatch ? workflowStage : Math.min(workflowStage, 4),
  };
}
function onOrderUnits(data: InventoryData, productId: string): Decimal {
  return decimalSum(
    data.purchase_orders
      .filter((order) => !["cancelled", "complete"].includes(order.status))
      .flatMap((order) => order.lines)
      .filter((line) => line.product_id === productId)
      .map((line) =>
        nonNegative(decimalSubtract(line.ordered_units, line.received_units)),
      ),
  );
}
function replenishmentCandidates(data: InventoryData) {
  return data.products.filter(
    (item) =>
      decimalCompare(
        decimalAdd(item.available_units, onOrderUnits(data, item.id)),
        item.reorder_point_units,
      ) < 0,
  );
}
function recordedPackagePrice(
  data: InventoryData,
  productId: string,
): Decimal | undefined {
  return recordedPackageTerms(data, productId)?.packagePrice;
}
function recordedPackageTerms(
  data: InventoryData,
  productId: string,
): { packagePrice: Decimal; currency: string } | undefined {
  const line = data.purchase_orders
    .flatMap((order) => order.lines)
    .find((line) => line.product_id === productId);
  return line
    ? { packagePrice: line.package_price, currency: line.currency }
    : undefined;
}
export function benchmarkPackagePrice(
  item: Pick<InventoryData["products"][number], "base_unit" | "units_per_package">,
  benchmark?: NadacBenchmark,
): Decimal | undefined {
  if (
    !benchmark?.nadac_per_unit ||
    !benchmark.pricing_unit ||
    !validDecimal(benchmark.nadac_per_unit, true) ||
    !validDecimal(item.units_per_package)
  )
    return undefined;
  const unitKey = (value: string) => {
    const normalized = value.trim().toLowerCase().replace(/[^a-z]/g, "");
    if (["ea", "each", "tablet", "tablets", "capsule", "capsules", "vial", "vials", "package", "packages"].includes(normalized)) return "count";
    if (["ml", "milliliter", "milliliters"].includes(normalized)) return "ml";
    if (["g", "gm", "gram", "grams"].includes(normalized)) return "g";
    return normalized;
  };
  if (unitKey(item.base_unit) !== unitKey(benchmark.pricing_unit))
    return undefined;
  return decimalMultiply(benchmark.nadac_per_unit, item.units_per_package);
}
function supplierProductFor(
  data: InventoryData,
  productId: string,
  supplierId: string,
): InventorySupplierProduct | undefined {
  const item = product(data, productId);
  return data.supplier_products?.find(
    (row) =>
      row.supplier_id === supplierId &&
      row.available !== false &&
      (row.product_id === productId ||
        (row.product_id == null && Boolean(item?.ndc) && row.ndc === item?.ndc)),
  );
}
function supplierOffersFor(data: InventoryData, productId: string) {
  const item = product(data, productId);
  return (data.supplier_products ?? []).filter(
    (row) =>
      (row.product_id === productId ||
        (row.product_id == null && Boolean(item?.ndc) && row.ndc === item?.ndc)) &&
      row.available !== false,
  );
}
function facilityCanReceivePurchaseOrder(record: InventoryFacility) {
  return (
    record.status === "active" &&
    Boolean(
      record.address_line1?.trim() &&
        record.city?.trim() &&
        record.state?.trim() &&
        record.postal_code?.trim() &&
        record.country?.trim(),
    )
  );
}
function purchaseOrderFacilities(data: Pick<InventoryData, "sites">) {
  return (data.sites ?? []).filter((record) => record.status === "active");
}
function facilityAddress(record?: InventoryFacility) {
  if (!record) return "";
  return [
    record.address_line1,
    record.address_line2,
    [record.city, record.state].filter(Boolean).join(", "),
    record.postal_code,
    record.country,
  ]
    .filter(Boolean)
    .join(", ");
}
function purchaseOrderDestination(data: InventoryData, _productId: string) {
  return purchaseOrderFacilities(data).find(facilityCanReceivePurchaseOrder);
}

function Card({
  title,
  eyebrow,
  children,
  className = "",
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`inventory-card ${className}`}>
      {eyebrow && <p className="inventory-eyebrow">{eyebrow}</p>}
      {title && <h2>{title}</h2>}
      {children}
    </section>
  );
}
function Metric({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className={`inventory-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "blue";
}) {
  return <span className={`inventory-badge ${tone}`}>{children}</span>;
}
function DataPoint({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`inventory-datapoint ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="inventory-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function ConfirmButton({
  children,
  disabled,
  onConfirm,
  tone = "primary",
  confirmationTitle = "Confirm this inventory action?",
  confirmationContent,
  confirmLabel = "Confirm action",
  confirmDisabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  onConfirm: () => void;
  tone?: "primary" | "danger" | "outline";
  confirmationTitle?: ReactNode;
  confirmationContent?: ReactNode;
  confirmLabel?: string;
  confirmDisabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  if (confirming)
    return (
      <div
        className="inventory-confirm"
        role="dialog"
        aria-label="Confirm inventory action"
      >
        <div>
          <strong>{confirmationTitle}</strong>
          {confirmationContent}
        </div>
        <div className="inventory-confirm-actions">
          <button
            className="inventory-button outline"
            type="button"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
          <button
            className={`inventory-button ${tone}`}
            type="button"
            disabled={confirmDisabled}
            onClick={() => {
              setConfirming(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    );
  return (
    <button
      className={`inventory-button ${tone}`}
      disabled={disabled}
      type="button"
      onClick={() => setConfirming(true)}
    >
      {children}
    </button>
  );
}
function Notice({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  if (!notice) return null;
  return (
    <div
      className={`inventory-notice ${notice.tone}`}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.detail}</p>
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss notice">
        ×
      </button>
    </div>
  );
}

type InventoryRun = (
  endpoint: string,
  body: Record<string, unknown>,
  successTitle: string,
  successDetail: string,
  afterSuccess?: (payload: { id?: number | string }) => void,
) => Promise<void>;

function CatalogCreateScreen({
  data,
  busy,
  run,
}: {
  data: InventoryData;
  busy: boolean;
  run: InventoryRun;
}) {
  const [category, setCategory] = useState<InventoryCategory>("medication");
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [ndc, setNdc] = useState("");
  const [deviceIdentifier, setDeviceIdentifier] = useState("");
  const [genericName, setGenericName] = useState("");
  const [dosageForm, setDosageForm] = useState("");
  const [packageDescription, setPackageDescription] = useState("");
  const [stockUnit, setStockUnit] = useState("");
  const [packageSize, setPackageSize] = useState("1");
  const [quantityScale, setQuantityScale] = useState("0");
  const [reorderPoint, setReorderPoint] = useState("0");
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<NdcResult[]>([]);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [selectedNdc, setSelectedNdc] = useState<NdcResult>();
  const [deviceLookupResult, setDeviceLookupResult] = useState<GudidResult>();
  const [deviceResult, setDeviceResult] = useState<GudidResult>();
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [nadacBenchmark, setNadacBenchmark] = useState<NadacBenchmark>();
  const [nadacBusy, setNadacBusy] = useState(false);
  const [nadacError, setNadacError] = useState("");
  const [unitDetectionSource, setUnitDetectionSource] = useState<
    InferredInventoryUnits["source"] | "manual"
  >("manual");
  const lookupVersion = useRef(0);
  const nadacVersion = useRef(0);
  const deviceVersion = useRef(0);
  const requiresUnitReference = packageSize !== "1";
  const unitReference =
    stockUnit && packageSize
      ? inventoryUnitDefinition(stockUnit, packageSize)
      : "";
  const lookup = async (query: string) => {
    const version = ++lookupVersion.current;
    setLookupBusy(true);
    setLookupError("");
    setLookupResults([]);
    try {
      const payload = await api<{ results?: NdcResult[] }>(
        "/api/clinic/pharmacy/lookup",
        { method: "POST", body: { ndc_query: query } },
      );
      if (lookupVersion.current !== version) return;
      setLookupResults(payload.results ?? []);
      if (!payload.results?.length)
        setLookupError(
          "No FDA package matches were found. You can still enter the item manually.",
        );
    } catch (reason) {
      if (lookupVersion.current !== version) return;
      setLookupError(
        reason instanceof Error
          ? reason.message
          : "The FDA directory could not be searched. You can still enter the item manually.",
      );
    } finally {
      if (lookupVersion.current === version) setLookupBusy(false);
    }
  };
  useEffect(() => {
    const query = lookupQuery.trim();
    if (
      category !== "medication" ||
      query.length < 3 ||
      !capability(data, "inventory.catalog")
    ) {
      lookupVersion.current += 1;
      setLookupBusy(false);
      setLookupResults([]);
      setLookupError("");
      return;
    }
    const timer = window.setTimeout(() => {
      void lookup(query);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [category, data, lookupQuery]);
  useEffect(() => {
    const selected = selectedNdc?.ndc;
    if (category !== "medication" || !selected) {
      nadacVersion.current += 1;
      setNadacBusy(false);
      setNadacBenchmark(undefined);
      setNadacError("");
      return;
    }
    const version = ++nadacVersion.current;
    setNadacBusy(true);
    setNadacBenchmark(undefined);
    setNadacError("");
    void api<{ benchmark?: NadacBenchmark }>("/api/clinic/pharmacy/nadac", {
      method: "POST",
      body: { ndc: selected },
    })
      .then((payload) => {
        if (nadacVersion.current !== version) return;
        setNadacBenchmark(payload.benchmark);
      })
      .catch((reason) => {
        if (nadacVersion.current !== version) return;
        setNadacError(
          reason instanceof Error
            ? reason.message
            : "The public cost benchmark could not be loaded.",
        );
      })
      .finally(() => {
        if (nadacVersion.current === version) setNadacBusy(false);
      });
  }, [category, selectedNdc?.ndc]);
  const lookupDevice = async (identifier: string) => {
    const version = ++deviceVersion.current;
    setDeviceBusy(true);
    setDeviceError("");
    setDeviceLookupResult(undefined);
    try {
      const payload = await api<{ result?: GudidResult }>(
        "/api/clinic/pharmacy/device_lookup",
        { method: "POST", body: { device_identifier: identifier } },
      );
      if (deviceVersion.current !== version) return;
      if (payload.result) setDeviceLookupResult(payload.result);
      else setDeviceError("No FDA device record matched that identifier. You can enter the item manually.");
    } catch (reason) {
      if (deviceVersion.current !== version) return;
      setDeviceError(
        reason instanceof Error
          ? reason.message
          : "The FDA device directory could not be searched. You can enter the item manually.",
      );
    } finally {
      if (deviceVersion.current === version) setDeviceBusy(false);
    }
  };
  useEffect(() => {
    const identifier = deviceIdentifier.trim();
    if (deviceResult) return;
    if (
      category === "medication" ||
      identifier.length < 6 ||
      !capability(data, "inventory.catalog")
    ) {
      deviceVersion.current += 1;
      setDeviceBusy(false);
      setDeviceLookupResult(undefined);
      setDeviceResult(undefined);
      setDeviceError("");
      return;
    }
    const timer = window.setTimeout(() => void lookupDevice(identifier), 450);
    return () => window.clearTimeout(timer);
  }, [category, data, deviceIdentifier, deviceResult]);
  const changeCategory = (next: InventoryCategory) => {
    setCategory(next);
    if (next === "medication") {
      deviceVersion.current += 1;
      setDeviceIdentifier("");
      setDeviceLookupResult(undefined);
      setDeviceResult(undefined);
      setDeviceError("");
      return;
    }
    lookupVersion.current += 1;
    setLookupQuery("");
    setLookupResults([]);
    setLookupError("");
    setSelectedNdc(undefined);
    setDeviceIdentifier("");
    setDeviceLookupResult(undefined);
    setDeviceResult(undefined);
    setDeviceError("");
    setNdc("");
    setGenericName("");
    setDosageForm("");
  };
  const selectDevice = (result: GudidResult) => {
    setDeviceResult(result);
    setDeviceLookupResult(undefined);
    setDeviceIdentifier(result.device_identifier);
    setName(result.brand_name || result.device_description || "");
    setPackageDescription(
      [
        result.device_description,
        result.company_name,
        result.version_model_number && `Model ${result.version_model_number}`,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    setStockUnit("each");
    setPackageSize("1");
    setQuantityScale("0");
    setUnitDetectionSource("manual");
    setDeviceError("");
  };
  const clearDeviceSelection = () => {
    setDeviceLookupResult(undefined);
    setDeviceResult(undefined);
    setDeviceIdentifier("");
    setDeviceError("");
    deviceVersion.current += 1;
  };
  const selectNdc = (result: NdcResult) => {
    const inferredUnits = inferInventoryUnits(result);
    setSelectedNdc(result);
    setName(result.name);
    setNdc(result.ndc);
    setGenericName(result.generic_name ?? "");
    setDosageForm(result.dosage_form ?? "");
    setPackageDescription(result.package_description ?? "");
    setSku(`NDC-${result.ndc}`);
    setStockUnit(inferredUnits.stockUnit);
    setPackageSize(inferredUnits.packageSize);
    setQuantityScale(inferredUnits.quantityScale);
    setUnitDetectionSource(inferredUnits.source);
    setLookupError("");
  };
  const clearNdcSelection = () => {
    setSelectedNdc(undefined);
    setNadacBenchmark(undefined);
    setNadacError("");
    nadacVersion.current += 1;
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(
      "/api/clinic/pharmacy",
      {
        reference_token: selectedNdc?.reference_token,
        device_reference_token: deviceResult?.reference_token,
        clinic_pharmacy_product: {
          name: name.trim(),
          category,
          sku: sku.trim(),
          ndc: ndc.trim() || undefined,
          device_identifier: deviceIdentifier.trim() || undefined,
          generic_name: genericName.trim() || undefined,
          dosage_form: dosageForm.trim() || undefined,
          package_description: packageDescription.trim() || undefined,
          stock_unit: stockUnit,
          package_size: packageSize,
          quantity_scale: quantityScale,
          unit_reference: unitReference.trim() || undefined,
          reorder_point: reorderPoint,
        },
      },
      "Catalog item created",
      `${name.trim()} is ready for purchasing. Stock will remain at zero until a receipt is confirmed.`,
      (payload) => {
        if (payload.id !== undefined)
          window.location.assign(
            `/clinic/inventory/purchasing/new?product_id=${payload.id}`,
          );
      },
    );
  };
  return (
    <div className="inventory-stack">
      <a className="inventory-back-link" href="/clinic/inventory">
        ← Back to inventory overview
      </a>
      <div>
        <Card title="Product definition">
          <p className="inventory-lead">
            Add the item once. The catalog definition controls package
            conversion, purchasing quantities, and receiving accuracy.
          </p>
          <Field
            label="Item category"
            hint="Use medication for FDA/NDC-backed products; all other categories use your clinic SKU."
          >
            <select
              value={category}
              onChange={(event) =>
                changeCategory(event.target.value as InventoryCategory)
              }
            >
              {inventoryCategories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {category === "medication" ? (
            <div className="inventory-info">
            <strong>Use FDA package data</strong>
            <p>
              Search by a medication name or the NDC printed on the package.
              Choose the exact package to prefill its verified label data, then
              complete the clinic-owned purchasing fields below.
            </p>
            <form className="inventory-inline-form" autoComplete="off">
              <Field label="Search FDA NDC Directory">
                <input
                  value={lookupQuery}
                  onChange={(event) => setLookupQuery(event.target.value)}
                  placeholder="Type 3+ letters or an NDC, e.g. ibu"
                  maxLength={80}
                  disabled={!capability(data, "inventory.catalog")}
                  autoComplete="off"
                />
              </Field>
              <small className="inventory-permission">
                {lookupBusy
                  ? "Searching FDA…"
                  : "Search begins automatically after 3 characters."}
              </small>
            </form>
            {lookupError && (
              <p className="inventory-danger-text">{lookupError}</p>
            )}
            {lookupResults.length > 0 && (
              <div className="inventory-stack compact">
                <Field
                  label="Choose exact FDA package"
                  hint={lookupResults.length + " package matches found."}
                >
                  <select
                    value={selectedNdc?.reference_token ?? ""}
                    onChange={(event) => {
                      const result = lookupResults.find(
                        (item) => item.reference_token === event.target.value,
                      );
                      if (result) selectNdc(result);
                    }}
                  >
                    <option value="">Select a package</option>
                    {lookupResults.map((result) => (
                      <option
                        key={result.reference_token}
                        value={result.reference_token}
                      >
                        {result.name} · NDC {result.ndc}
                        {result.package_description
                          ? " · " + result.package_description
                          : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                {selectedNdc && (
                  <p className="inventory-success-line">
                    Selected {selectedNdc.name} · NDC {selectedNdc.ndc}
                    {selectedNdc.labeler ? " · " + selectedNdc.labeler : ""}
                  </p>
                )}
              </div>
            )}
            {selectedNdc && (
              <button
                className="inventory-button outline"
                type="button"
                onClick={clearNdcSelection}
              >
                Clear FDA selection and enter manually
              </button>
            )}
            {selectedNdc && (
              <div className="inventory-info inventory-benchmark">
                <strong>Public cost benchmark</strong>
                {nadacBusy ? (
                  <p>Checking CMS NADAC…</p>
                ) : nadacError ? (
                  <p>{nadacError} You can continue without it.</p>
                ) : nadacBenchmark ? (
                  <>
                    <p>
                      <strong>
                        ${nadacBenchmark.nadac_per_unit ?? "Not available"}
                      </strong>{" "}
                      per {nadacBenchmark.pricing_unit ?? "pricing unit"}
                    </p>
                    <p>
                      Effective {nadacBenchmark.effective_date ?? "date unavailable"} · CMS NADAC ·{" "}
                      <a href={nadacBenchmark.source_url} target="_blank" rel="noreferrer">
                        Source
                      </a>
                    </p>
                    <p>
                      This is a national average benchmark, not your clinic’s
                      supplier price.
                    </p>
                  </>
                ) : (
                  <p>
                    No current NADAC benchmark was found for this NDC. You can
                    continue without it.
                  </p>
                )}
              </div>
            )}
            <p className="inventory-caption">
              FDA data is used to prefill the package record. It does not
              replace your clinic’s SKU, stock unit, reorder point, or receiving
              setup.
            </p>
            </div>
          ) : (
            <div className="inventory-info">
              <strong>Use FDA device data (optional)</strong>
              <p>
                Scan or enter the UDI-DI/GTIN printed on a glove, supply, or
                other device package. FDA data can identify the device; your
                clinic still owns the SKU, stock unit, and reorder point.
              </p>
              <form className="inventory-inline-form" autoComplete="off">
                <Field label="UDI-DI / GTIN">
                  <input
                    value={deviceIdentifier}
                    onChange={(event) => setDeviceIdentifier(event.target.value)}
                    placeholder="Enter the identifier from the package"
                    maxLength={200}
                    disabled={!capability(data, "inventory.catalog")}
                    autoComplete="off"
                  />
                </Field>
                <small className="inventory-permission">
                  {deviceBusy
                    ? "Looking up AccessGUDID…"
                    : "Lookup begins automatically after 6 characters."}
                </small>
              </form>
              {deviceError && <p className="inventory-danger-text">{deviceError}</p>}
              {deviceLookupResult && (
                <div className="inventory-stack compact">
                  <p className="inventory-success-line">
                    {deviceLookupResult.brand_name || "FDA device record"} · {deviceLookupResult.device_identifier}
                    {deviceLookupResult.company_name ? ` · ${deviceLookupResult.company_name}` : ""}
                  </p>
                  <button
                    className="inventory-button outline"
                    type="button"
                    onClick={() => selectDevice(deviceLookupResult)}
                  >
                    Use this device record
                  </button>
                </div>
              )}
              {deviceResult && (
                <div className="inventory-stack compact">
                  <p className="inventory-success-line">
                    Selected {deviceResult.brand_name || "FDA device record"} · {deviceResult.device_identifier}
                  </p>
                  <button
                    className="inventory-button outline"
                    type="button"
                    onClick={clearDeviceSelection}
                  >
                    Clear device selection
                  </button>
                </div>
              )}
            </div>
          )}
          <form
            className="inventory-form-grid"
            onSubmit={submit}
            autoComplete="off"
          >
            <Field label="Product name">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={160}
                required
                autoFocus
                readOnly={Boolean(selectedNdc)}
                autoComplete="off"
              />
            </Field>
            <Field label="SKU">
              <input
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                maxLength={160}
                required
                autoComplete="off"
              />
            </Field>
            {category === "medication" && (
              <>
                <Field label="NDC" hint="Optional when an NDC is unavailable.">
                  <input
                    value={ndc}
                    onChange={(event) => setNdc(event.target.value)}
                    maxLength={30}
                    readOnly={Boolean(selectedNdc)}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Generic name" hint="Optional display metadata.">
                  <input
                    value={genericName}
                    onChange={(event) => setGenericName(event.target.value)}
                    maxLength={500}
                    readOnly={Boolean(selectedNdc)}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="Dosage form"
                  hint="For example: tablet, vial, or liquid."
                >
                  <input
                    value={dosageForm}
                    onChange={(event) => setDosageForm(event.target.value)}
                    maxLength={500}
                    readOnly={Boolean(selectedNdc)}
                    autoComplete="off"
                  />
                </Field>
              </>
            )}
            {category !== "medication" && (
              <Field
                label="UDI-DI / GTIN"
                hint="Optional. Stored as the FDA device identifier when available."
              >
                <input
                  value={deviceIdentifier}
                  onChange={(event) => setDeviceIdentifier(event.target.value)}
                  maxLength={200}
                  readOnly={Boolean(deviceResult)}
                  autoComplete="off"
                />
              </Field>
            )}
            <Field label="Package description">
              <input
                value={packageDescription}
                onChange={(event) => setPackageDescription(event.target.value)}
                maxLength={4000}
                placeholder="100 tablets per bottle"
                readOnly={Boolean(selectedNdc)}
                autoComplete="off"
              />
            </Field>
            <Field label="Stock unit">
              <select
                value={stockUnit}
                onChange={(event) => {
                  const next = event.target.value;
                  setUnitDetectionSource("manual");
                  setStockUnit(next);
                  if (!["mL", "g"].includes(next)) setQuantityScale("0");
                  if (next === "package") setPackageSize("1");
                }}
              >
                <option value="">Select stock unit</option>
                <option value="each">Each</option>
                <option value="tablet">Tablet</option>
                <option value="capsule">Capsule</option>
                <option value="vial">Vial</option>
                <option value="mL">mL</option>
                <option value="g">g</option>
                <option value="package">Package</option>
              </select>
              {selectedNdc && (
                <small className="inventory-permission">
                  {unitDetectionSource === "package-description"
                    ? "Detected automatically from the FDA package description. You can adjust it if your clinic tracks a different unit."
                    : "FDA data did not specify a standard stock unit, so this defaults to package tracking. You can adjust it if needed."}
                </small>
              )}
            </Field>
            <Field
              label="Units per package"
              hint="Use 1 when each purchased package is one stock unit."
            >
              <input
                type="number"
                min={1}
                max={1000000}
                step={stockUnit === "mL" || stockUnit === "g" ? "any" : 1}
                value={packageSize}
                onChange={(event) => setPackageSize(event.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            <Field label="Quantity precision">
              <select
                value={quantityScale}
                disabled={!["mL", "g"].includes(stockUnit)}
                onChange={(event) => setQuantityScale(event.target.value)}
              >
                <option value="0">Whole units</option>
                <option value="1">1 decimal place</option>
                <option value="2">2 decimal places</option>
                <option value="3">3 decimal places</option>
                <option value="4">4 decimal places</option>
                <option value="5">5 decimal places</option>
                <option value="6">6 decimal places</option>
              </select>
            </Field>
            <Field
              label="Inventory definition"
              hint="Generated from the stock unit and units per package."
            >
              <output
                className="inventory-info"
                style={{ display: "block" }}
                aria-live="polite"
              >
                {unitReference ||
                  "Select a stock unit to generate the inventory definition."}
              </output>
            </Field>
            <Field label="Reorder point" hint={`Base ${stockUnit} units.`}>
              <input
                type="number"
                min={0}
                max={1000000}
                step={1}
                value={reorderPoint}
                onChange={(event) => setReorderPoint(event.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            <div className="inventory-form-actions">
              <PermissionNote
                allowed={capability(data, "inventory.catalog")}
                permission="inventory.catalog"
              />
              <button
                className="inventory-button primary"
                type="submit"
                disabled={
                  busy ||
                  !capability(data, "inventory.catalog") ||
                  !name.trim() ||
                  !sku.trim() ||
                  !stockUnit ||
                  !packageSize ||
                  (requiresUnitReference && !unitReference)
                }
              >
                {busy ? "Creating…" : "Create item and continue →"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

function PurchaseOrderCreateScreen({
  data,
  busy,
  run,
}: {
  data: InventoryData;
  busy: boolean;
  run: InventoryRun;
}) {
  const requestedProductId = new URLSearchParams(window.location.search).get(
    "product_id",
  );
  const requestedItem = data.products.find(
    (item) => item.id === requestedProductId,
  );
  const initialItem =
    requestedItem ?? data.products[0];
  const productIsLocked = Boolean(requestedItem);
  const [productId, setProductId] = useState(initialItem?.id ?? "");
  const item = data.products.find((record) => record.id === productId);
  const initialSupplierId =
    initialItem?.preferred_supplier_id ??
    supplierOffersFor(data, initialItem?.id ?? "")[0]?.supplier_id ??
    "";
  const initialOffer = initialItem
    ? supplierProductFor(data, initialItem.id, initialSupplierId)
    : undefined;
  const initialTerms = initialItem
    ? recordedPackageTerms(data, initialItem.id)
    : undefined;
  const initialDestination = purchaseOrderDestination(
    data,
    initialItem?.id ?? "",
  );
  const [destinationId, setDestinationId] = useState(
    initialDestination?.id ?? "",
  );
  const [supplierId, setSupplierId] = useState(
    initialSupplierId,
  );
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState(
    initialOffer?.wholesale_unit_cost ?? initialTerms?.packagePrice ?? "",
  );
  const [numberValue, setNumberValue] = useState("");
  const [reasonSelection, setReasonSelection] = useState("");
  const [reasonDetails, setReasonDetails] = useState("");
  const selectedReason = purchaseOrderReasons.find(
    (option) => option.value === reasonSelection,
  );
  const reason = [selectedReason?.label, reasonDetails.trim()]
    .filter(Boolean)
    .join(": ");
  const supplierProduct = item
    ? supplierProductFor(data, item.id, supplierId)
    : undefined;
  const packageInfo = packageFor(data, item?.package_id);
  const destination = data.sites?.find(
    (record) => record.id === destinationId,
  );
  const destinationOptions = purchaseOrderFacilities(data);
  const selectProduct = (nextId: string) => {
    const next = data.products.find((record) => record.id === nextId);
    const nextSupplierId =
      next?.preferred_supplier_id ??
      supplierOffersFor(data, nextId)[0]?.supplier_id ??
      "";
    const nextOffer = supplierProductFor(data, nextId, nextSupplierId);
    const nextTerms = recordedPackageTerms(data, nextId);
    setProductId(nextId);
    setSupplierId(nextSupplierId);
    setDestinationId(purchaseOrderDestination(data, nextId)?.id ?? "");
    setUnitPrice(
      nextOffer?.wholesale_unit_cost ??
        (nextTerms?.packagePrice ?? ""),
    );
  };
  const [nadacBenchmark, setNadacBenchmark] = useState<NadacBenchmark>();
  const [nadacBusy, setNadacBusy] = useState(false);
  const [nadacError, setNadacError] = useState("");
  const nadacVersion = useRef(0);
  useEffect(() => {
    const ndc = item?.ndc;
    if (!ndc || supplierProduct) {
      nadacVersion.current += 1;
      setNadacBenchmark(undefined);
      setNadacBusy(false);
      setNadacError("");
      return;
    }
    const version = ++nadacVersion.current;
    setNadacBusy(true);
    setNadacBenchmark(undefined);
    setNadacError("");
    void api<{ benchmark?: NadacBenchmark }>("/api/clinic/pharmacy/nadac", {
      method: "POST",
      body: { ndc },
    })
      .then((payload) => {
        if (nadacVersion.current === version)
          setNadacBenchmark(payload.benchmark);
      })
      .catch((error) => {
        if (nadacVersion.current !== version) return;
        setNadacError(
          error instanceof Error
            ? error.message
            : "The public cost benchmark could not be loaded.",
        );
      })
      .finally(() => {
        if (nadacVersion.current === version) setNadacBusy(false);
      });
  }, [item?.id, item?.ndc, supplierProduct]);
  const historicalPackagePrice = item
    ? recordedPackageTerms(data, item.id)?.packagePrice
    : undefined;
  useEffect(() => {
    if (!item || supplierProduct) return;
    const price = benchmarkPackagePrice(item, nadacBenchmark);
    if (price)
      setUnitPrice((current) =>
        !current || current === historicalPackagePrice ? price : current,
      );
  }, [
    data,
    historicalPackagePrice,
    item,
    nadacBenchmark,
    supplierId,
    supplierProduct,
  ]);
  const benchmarkPrice = item
    ? benchmarkPackagePrice(item, nadacBenchmark)
    : undefined;
  const selectedSupplierName = data.suppliers?.find(
    (record) => record.id === supplierId,
  )?.name;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    void run(
      "/api/clinic/inventory/purchase-orders",
      {
        purchase_order: {
          ...(numberValue.trim() ? { number: numberValue.trim() } : {}),
          destination: destination?.name ?? "",
          receiving_site_id: destination?.id ?? "",
          destination_address: facilityAddress(destination),
          reason,
          ...(supplierId ? { supplier_id: supplierId } : {}),
          lines: [
            {
              product_id: item.id,
              quantity,
              input_unit: packageInfo?.input_unit ?? "",
              conversion_factor: item.units_per_package,
              unit_price: unitPrice,
              currency: purchaseOrderCurrency,
            },
          ],
        },
      },
      "Draft PO created",
      `${number(quantity)} ${packageInfo?.input_unit ?? "unavailable unit"} of ${item.name} is ready for review.`,
      () => window.location.assign("/clinic/inventory/purchasing"),
    );
  };
  if (!item)
    return (
      <Card title="Create purchase order">
        <p>No catalog items are available yet.</p>
        <a
          className="inventory-button outline"
          href="/clinic/inventory/catalog/new"
        >
          Add catalog item
        </a>
      </Card>
    );
  return (
    <div className="inventory-stack">
      <a className="inventory-back-link" href="/clinic/inventory">
        ← Back to inventory overview
      </a>
      <div>
        <Card title="Purchase order details">
          <p className="inventory-lead">
            Order any active catalog item. This creates a draft only; stock is
            added after the delivery is recorded and received.
          </p>
          <form className="inventory-form-grid" onSubmit={submit}>
            {productIsLocked ? (
              <Field
                label="Catalog item"
                hint="Selected from the inventory item you chose."
              >
                <input
                  value={`${item.name} · ${number(item.available_units)} available`}
                  readOnly
                />
              </Field>
            ) : (
              <Field label="Catalog item">
                <select
                  value={productId}
                  onChange={(event) => selectProduct(event.target.value)}
                >
                  {data.products.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.name} · {number(record.available_units)} available
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              label="Order quantity (packages)"
              hint={`${number(decimalMultiply(quantity || "0", item.units_per_package))} ${item.base_unit} total`}
            >
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </Field>
            <Field label="Supplier">
              <select
                value={supplierId}
                onChange={(event) => {
                  const nextSupplierId = event.target.value;
                  const offer = supplierProductFor(data, item.id, nextSupplierId);
                  const terms = recordedPackageTerms(data, item.id);
                   setSupplierId(nextSupplierId);
                   setUnitPrice(
                     offer?.wholesale_unit_cost ?? terms?.packagePrice ?? "",
                   );
                }}
              >
                <option value="">No supplier</option>
                {data.suppliers?.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Package price"
              hint={
                supplierProduct
                  ? `Supplier feed: ${supplierProduct.supplier_sku} · ${supplierProduct.contract_status} contract`
                  : benchmarkPrice
                    ? "Prefilled from the CMS public cost benchmark. Review against the supplier quote."
                    : nadacBusy
                      ? historicalPackagePrice
                        ? "Checking the CMS public cost benchmark; the last recorded package price is shown until it returns."
                        : "Checking the CMS public cost benchmark…"
                      : nadacError
                        ? `${nadacError} Enter the supplier quote manually.`
                        : `${
                            supplierId
                              ? `No imported price is loaded for ${selectedSupplierName ?? "the selected supplier"}. `
                              : "No supplier quote is loaded. "
                          }No public CMS NADAC benchmark was found for this exact NDC. ${
                            historicalPackagePrice
                              ? "The last recorded package price is shown; confirm or replace it."
                              : "Enter the package price manually."
                          }`
              }
            >
              <input
                inputMode="decimal"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                placeholder="0.00"
                required
              />
            </Field>
            <Field label="Ship to">
              <select
                value={destinationId}
                onChange={(event) => setDestinationId(event.target.value)}
                required
              >
                <option value="">Select a clinic facility</option>
                {destinationOptions.map((record) => (
                  <option
                    key={record.id}
                    value={record.id}
                    disabled={!facilityCanReceivePurchaseOrder(record)}
                  >
                    {record.name}
                    {!facilityCanReceivePurchaseOrder(record)
                      ? " · address incomplete"
                      : ""}
                  </option>
                ))}
              </select>
              {destination && (
                <small>
                  {facilityCanReceivePurchaseOrder(destination)
                    ? `Delivery address: ${facilityAddress(destination)}`
                    : "Complete this location's address before ordering."}
                </small>
              )}
            </Field>
            <Field
              label="PO number"
              hint="Optional. A number is generated when blank."
            >
              <input
                value={numberValue}
                onChange={(event) => setNumberValue(event.target.value)}
                maxLength={80}
              />
            </Field>
            <Field label="Reason">
              <select
                value={reasonSelection}
                onChange={(event) => setReasonSelection(event.target.value)}
                required
              >
                <option value="">Select a reason</option>
                {purchaseOrderReasons.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            {reasonSelection === "other" && (
              <Field
                label="Reason details"
                hint="Required when Other is selected."
              >
                <input
                  value={reasonDetails}
                  onChange={(event) => setReasonDetails(event.target.value)}
                  maxLength={160}
                  required
                />
              </Field>
            )}
            <div className="inventory-form-actions">
              <PermissionNote
                allowed={capability(data, "procurement.create")}
                permission="procurement.create"
              />
              <ConfirmButton
                disabled={
                  busy ||
                  !capability(data, "procurement.create") ||
                  !destination ||
                  !facilityCanReceivePurchaseOrder(destination) ||
                  !validDecimal(quantity) ||
                  !validDecimal(unitPrice, true) ||
                  !reasonSelection ||
                  (reasonSelection === "other" && !reasonDetails.trim())
                }
                onConfirm={() => {
                  const fake = new Event("submit") as unknown as FormEvent;
                  submit(fake);
                }}
              >
                Create draft PO →
              </ConfirmButton>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

function InventoryLocationsScreen({
  data,
  busy,
  run,
}: {
  data: InventoryData;
  busy: boolean;
  run: InventoryRun;
}) {
  const params = new URLSearchParams(window.location.search);
  const requestedReturnTo = params.get("return_to") ?? "/clinic/inventory/purchasing/new";
  const returnTo = requestedReturnTo.startsWith("/clinic/inventory")
    ? requestedReturnTo
    : "/clinic/inventory/purchasing/new";
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"storage" | "controlled">("storage");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(
      "/api/clinic/inventory/locations",
      {
        location: {
          name: name.trim(),
          kind,
        },
      },
      "Storage location saved",
      `${name.trim()} is now available for stock put-away and movement tracking.`,
      () => window.location.assign(returnTo),
    );
  };
  return (
    <div className="inventory-stack">
      <a className="inventory-back-link" href={returnTo}>
        ← Back to purchase order
      </a>
      <Card title="Inventory storage locations">
        <p className="inventory-lead">
          Define the physical places where stock is stored, quarantined,
          returned, or controlled. Supplier delivery addresses belong to the
          clinic facility profile in Operations.
        </p>
        {data.locations.length > 0 && (
          <div className="inventory-stack compact">
            {data.locations.map((record) => (
              <div className="inventory-muted-panel" key={record.id}>
                <strong>{record.name}</strong>
                <p>
                  {record.kind?.replace("_", " ") || "Storage"}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Add storage location">
        <form className="inventory-form-grid" onSubmit={submit}>
          <Field label="Location name" hint="For example, Main cabinet or Medication room.">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={100}
              required
              autoFocus
            />
          </Field>
          <Field label="Location type">
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as "storage" | "controlled")}
            >
              <option value="storage">Storage</option>
              <option value="controlled">Controlled storage</option>
            </select>
          </Field>
          <div className="inventory-form-actions">
            <PermissionNote
              allowed={capability(data, "inventory.configure")}
              permission="inventory.configure"
            />
            <ConfirmButton
              disabled={
                busy ||
                !capability(data, "inventory.configure") ||
                !name.trim()
              }
              onConfirm={() => submit(new Event("submit") as unknown as FormEvent)}
            >
              Save storage location →
            </ConfirmButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

function InventoryConfigureScreen({
  data,
  busy,
  run,
}: {
  data: InventoryData;
  busy: boolean;
  run: InventoryRun;
}) {
  const [reasonSelection, setReasonSelection] = useState("");
  const [reasonDetails, setReasonDetails] = useState("");
  const selectedReason = inventoryConfigurationReasons.find(
    (option) => option.value === reasonSelection,
  );
  const requiresReasonDetails = reasonSelection === "other";
  const reason = [selectedReason?.label, reasonDetails.trim()]
    .filter(Boolean)
    .join(": ");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(
      "/api/clinic/inventory_configuration",
      {
        status: "configured",
        reason,
      },
      "Inventory configured",
      "Inventory writes are now enabled for this practice.",
      () => window.location.assign("/clinic/inventory"),
    );
  };
  return (
    <div className="inventory-stack">
      <Card title="Configure inventory">
        <p className="inventory-lead">
          Confirm the operating basis before creating stock records. This is a
          practice configuration record, not seeded inventory.
        </p>
        <form className="inventory-form-grid" onSubmit={submit}>
          <Field label="Configuration reason">
            <select
              value={reasonSelection}
              onChange={(event) => setReasonSelection(event.target.value)}
              required
              autoFocus
            >
              <option value="">Select a reason</option>
              {inventoryConfigurationReasons.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          {requiresReasonDetails && (
            <Field
              label="Explain the reason"
              hint="Required when Other is selected."
            >
              <textarea
                value={reasonDetails}
                onChange={(event) => setReasonDetails(event.target.value)}
                maxLength={120}
                required
                placeholder="Describe the approved inventory operating setup"
              />
            </Field>
          )}
          <div className="inventory-form-actions">
            <PermissionNote
              allowed={capability(data, "inventory.configure")}
              permission="inventory.configure"
            />
            <ConfirmButton
              disabled={
                busy ||
                !capability(data, "inventory.configure") ||
                !reasonSelection ||
                (requiresReasonDetails && !reasonDetails.trim())
              }
              onConfirm={() =>
                submit(new Event("submit") as unknown as FormEvent)
              }
            >
              Configure inventory →
            </ConfirmButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

function PermissionNote({
  allowed,
  permission,
}: {
  allowed: boolean;
  permission: string;
}) {
  return allowed ? null : (
    <span className="inventory-permission">
      View only · {permission} is required for this action.
    </span>
  );
}

export function InventoryApp({ path }: { path: string }) {
  const { registerBlocker } = useClinicNavigation();
  const screen = screenForPath(path);
  const [data, setData] = useState<
    | InventoryData
    | InventoryActivityData
    | InventoryCatalogData
    | InventoryPlanData
    | InventoryStockData
    | InventoryOrderData
    | InventoryDeliveryData
  >();
  const readVersion = useRef(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uncertainMutation, setUncertainMutation] =
    useState<PendingInventoryMutation | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const needsPurchaseOrderFacility =
    screen === "purchase_order_new" || screen === "replenishment";
  const routeScope =
    typeof window === "undefined" ? "" : window.location.search;

  useEffect(() => {
    if (!uncertainMutation || typeof window === "undefined") return;
    const message =
      "This inventory action has an unknown outcome. Leaving may make a safe retry impossible.";
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", warn);
    const unregister = registerBlocker(() => message);
    return () => {
      window.removeEventListener("beforeunload", warn);
      unregister();
    };
  }, [registerBlocker, uncertainMutation]);

  useEffect(() => {
    if (
      !data ||
      "activity_page" in data ||
      "catalog_page" in data ||
      "stock_page" in data ||
      "order_page" in data ||
      "delivery_page" in data ||
      !needsPurchaseOrderFacility
    )
      return;
    if (purchaseOrderFacilities(data).some(facilityCanReceivePurchaseOrder))
      return;
    window.location.replace("/clinic/facilities");
  }, [data, needsPurchaseOrderFacility]);

  const load = async (
    requested?: InventoryCatalogRead &
      InventoryPlanRead &
      InventoryStockRead &
      InventoryOrderRead &
      InventoryDeliveryRead & { before?: string | null },
  ) => {
    const read: InventoryCatalogRead &
      InventoryPlanRead &
      InventoryStockRead &
      InventoryOrderRead &
      InventoryDeliveryRead & { before?: string | null } = {
      ...(needsPurchaseOrderFacility
        ? {
            plan_mode: (screen === "purchase_order_new"
              ? "all"
              : "needed") as NonNullable<InventoryPlanRead["plan_mode"]>,
          }
        : {}),
      ...(requested ??
        (screen === "catalog" && data && "catalog_page" in data
          ? {
              q: data.catalog_page.query,
              status: data.catalog_page.status,
              sort: data.catalog_page.sort,
              page: data.catalog_page.page,
            }
          : screen === "lots" && data && "stock_page" in data
            ? {
                q: data.stock_page.query,
                stock_status: data.stock_page.status,
                page: data.stock_page.page,
              }
            : screen === "purchasing" && data && "order_page" in data
              ? {
                  q: data.order_page.query,
                  order_status: data.order_page.status,
                  page: data.order_page.page,
                }
              : screen === "receiving" && data && "delivery_page" in data
                ? {
                    q: data.delivery_page.query,
                    delivery_status: data.delivery_page.status,
                    page: data.delivery_page.page,
                    shipment_id: data.delivery_page.selected_shipment_id,
                  }
                : needsPurchaseOrderFacility && data && "plan_page" in data
                  ? {
                      q: data.plan_page.query,
                      plan_mode: data.plan_page.mode,
                      page: data.plan_page.page,
                    }
                  : {})),
    };
    const version = ++readVersion.current;
    setLoading(true);
    setError("");
    let lastReason: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const query = new URLSearchParams();
        if (screen === "activity") query.set("view", "ledger");
        if (screen === "catalog") query.set("view", "table");
        if (screen === "lots") query.set("view", "positions");
        if (screen === "purchasing") query.set("view", "batches");
        if (screen === "receiving") query.set("view", "deliveries");
        if (needsPurchaseOrderFacility) query.set("view", "plan");
        if (read.delivery_status)
          query.set("delivery_status", read.delivery_status);
        if (read.order_status) query.set("order_status", read.order_status);
        const routeQuery = new URLSearchParams(window.location.search);
        const shipmentId =
          read.shipment_id === undefined
            ? routeQuery.get("shipment_id")
            : read.shipment_id;
        if (screen === "receiving" && shipmentId)
          query.set("shipment_id", shipmentId);
        if (screen === "lots" && routeQuery.get("product_id"))
          query.set("product_id", routeQuery.get("product_id")!);
        if (screen === "activity" && routeQuery.get("lot_id"))
          query.set("lot_id", routeQuery.get("lot_id")!);
        if (needsPurchaseOrderFacility && routeQuery.get("product_id"))
          query.set("product_id", routeQuery.get("product_id")!);
        if (read.plan_mode) query.set("plan_mode", read.plan_mode);
        if (read.stock_status) query.set("stock_status", read.stock_status);
        if (read.status) query.set("status", read.status);
        if (read.sort) query.set("sort", read.sort);
        if (read.page) query.set("page", String(read.page));
        if (read.q) query.set("q", read.q);
        if (read.before) query.set("before", read.before);
        const endpoint =
          screen === "activity"
            ? `/api/clinic/inventory/activity?${query}`
            : screen === "catalog"
              ? `/api/clinic/inventory/catalog?${query}`
              : screen === "lots"
                ? `/api/clinic/inventory/lots?${query}`
                : screen === "purchasing"
                  ? `/api/clinic/inventory/purchase-orders?${query}`
                  : screen === "receiving"
                    ? `/api/clinic/inventory/receiving?${query}`
                    : needsPurchaseOrderFacility
                      ? `/api/clinic/inventory/replenishment?${query}`
                      : "/api/clinic/inventory/bootstrap";
        const payload = await api<{
          data:
            | InventoryData
            | InventoryActivityData
            | InventoryCatalogData
            | InventoryPlanData
            | InventoryStockData
            | InventoryOrderData
            | InventoryDeliveryData;
        }>(endpoint, { signal: controller.signal });
        if (version !== readVersion.current) return;
        if (
          !payload.data ||
          (screen === "activity") !== "activity_page" in payload.data ||
          (screen === "catalog") !== "catalog_page" in payload.data ||
          needsPurchaseOrderFacility !== "plan_page" in payload.data ||
          (screen === "lots") !== "stock_page" in payload.data ||
          (screen === "purchasing") !== "order_page" in payload.data ||
          (screen === "receiving") !== "delivery_page" in payload.data
        )
          throw new Error(
            "The inventory service returned an incomplete response.",
          );
        setData(payload.data);
        setLoading(false);
        return;
      } catch (reason) {
        if (version !== readVersion.current) return;
        lastReason = reason;
        if (
          !(reason instanceof DOMException && reason.name === "AbortError") ||
          attempt === 1
        )
          break;
      } finally {
        window.clearTimeout(timeout);
      }
    }
    if (version !== readVersion.current) return;
    setError(
      lastReason instanceof DOMException && lastReason.name === "AbortError"
        ? "Inventory is taking longer than expected. The page retried once; try again when the clinic API is ready."
        : lastReason instanceof Error
          ? lastReason.message
          : "Unable to load inventory.",
    );
    setLoading(false);
  };
  useEffect(() => {
    setData(undefined);
    void load({});
    return () => {
      readVersion.current += 1;
    };
  }, [screen, routeScope]);

  const run = async (
    endpoint: string,
    body: Record<string, unknown>,
    successTitle: string,
    successDetail: string,
    afterSuccess?: (payload: { id?: number | string }) => void,
  ) => {
    const attempt = inventoryMutationAttempt(uncertainMutation, endpoint, body);
    if (!attempt) {
      setNotice({
        tone: "error",
        title: "Action still needs reconciliation",
        detail:
          "Retry the retained action or reload before starting a different action.",
      });
      return;
    }
    const requestKey = attempt.key;
    setBusy(true);
    setNotice(null);
    try {
      const requestBody: Record<string, unknown> = {
        ...body,
        request_key: requestKey,
      };
      Object.entries(requestBody).forEach(([key, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const nested = value as Record<string, unknown>;
          if (key !== "request_key" && !nested.request_key)
            requestBody[key] = { ...nested, request_key: requestKey };
        }
      });
      const payload = await api<{
        data?: InventoryData;
        acknowledged?: boolean;
        id?: number | string;
      }>(
        [
          "lots",
          "purchasing",
          "receiving",
          "replenishment",
          "purchase_order_new",
        ].includes(screen)
          ? `${endpoint}?response=ack`
          : endpoint,
        {
          method: "POST",
          body: requestBody,
        },
      );
      if (
        [
          "lots",
          "purchasing",
          "receiving",
          "replenishment",
          "purchase_order_new",
        ].includes(screen)
      ) {
        if (payload.acknowledged !== true)
          throw new Error(
            "The inventory action response could not be confirmed.",
          );
      } else {
        if (!payload.data)
          throw new Error(
            "The inventory action response could not be confirmed.",
          );
        setData(payload.data);
      }
      setUncertainMutation(null);
      setNotice({
        tone: "success",
        title: successTitle,
        detail: successDetail,
      });
      afterSuccess?.(payload);
      if (
        [
          "lots",
          "purchasing",
          "receiving",
          "replenishment",
          "purchase_order_new",
        ].includes(screen)
      )
        await load();
    } catch (reason) {
      const outcomeUnconfirmed = inventoryOutcomeUnconfirmed(reason);
      if (outcomeUnconfirmed) setUncertainMutation(attempt);
      setNotice({
        tone: "error",
        title:
          reason instanceof ApiError && reason.status === 403
            ? "Permission denied"
            : "Action blocked",
        detail: outcomeUnconfirmed
          ? "The outcome is unconfirmed. No automatic retry was made; reconcile this request before trying again."
          : reason instanceof Error
            ? reason.message
            : "The server rejected this action.",
      });
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data)
    return (
      <div className="inventory-app">
        <LoadState />
      </div>
    );
  if (error && !data)
    return (
      <div className="inventory-app">
        <Card title="Inventory could not load">
          <LoadState error={error} />
          <button
            className="inventory-button primary"
            type="button"
            onClick={() => void load()}
          >
            Try again
          </button>
        </Card>
      </div>
    );
  if (!data) return null;

  if (
    needsPurchaseOrderFacility &&
    !("activity_page" in data) &&
    !("catalog_page" in data) &&
    !("stock_page" in data) &&
    !("order_page" in data) &&
    !("delivery_page" in data) &&
    !purchaseOrderFacilities(data).some(facilityCanReceivePurchaseOrder)
  )
    return (
      <div className="inventory-app">
        <LoadState />
      </div>
    );

  return (
    <div className="inventory-app">
      <div className="inventory-layout">
        <div className="inventory-main">
          <header className="inventory-header">
            <div>
              <h1>{screenTitle(screen)}</h1>
              {screenDescriptions[screen] && (
                <p className="inventory-header-description">
                  {screenDescriptions[screen]}
                </p>
              )}
            </div>
            <div className="inventory-header-actions">
              <Chip
                label={"Persisted clinic data"}
                size="small"
                variant="outlined"
                sx={{
                  borderColor: "var(--inventory-border)",
                  color: "var(--inventory-muted)",
                  fontWeight: 600,
                }}
              />
              <span className="inventory-header-meta">
                Updated {inventoryDateTime(data.as_of, data.timezone)}
              </span>
              <Button
                variant="outlined"
                size="medium"
                startIcon={<RefreshRoundedIcon />}
                type="button"
                disabled={loading}
                onClick={() => void load()}
                sx={{
                  minHeight: 44,
                  borderColor: "var(--inventory-control)",
                  color: "var(--inventory-blue)",
                  textTransform: "none",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {loading ? "Refreshing…" : "Refresh data"}
              </Button>
            </div>
          </header>
          <div className="inventory-content">
            <nav className="inventory-subnav" aria-label="Inventory workspace">
              {(["Monitor", "Procure", "Operate", "Exceptions"] as const).map(
                (group) => (
                  <div className="inventory-subnav-group" key={group}>
                    <span>{group}</span>
                    <div>
                      {links
                        .filter(
                          (link) =>
                            link.group === group &&
                            (link.screen !== "supplier_pricing" ||
                              data.capabilities.supplier_pricing === true),
                        )
                        .map((link) => (
                          <a
                            key={link.screen}
                            href={link.href}
                            aria-current={
                              screen === link.screen ? "page" : undefined
                            }
                          >
                            {link.short}
                          </a>
                        ))}
                    </div>
                  </div>
                ),
              )}
            </nav>
            {data.configuration?.status !== "configured" && (
              <div className="inventory-warning strong" role="status">
                <strong>
                  Inventory setup is required before posting stock.
                </strong>
                <p>
                  Existing records remain viewable. Configure this practice to
                  create catalog, purchasing, receiving, and adjustment records.
                </p>
                <a
                  className="inventory-button outline"
                  href="/clinic/inventory/configure"
                >
                  Configure inventory
                </a>
              </div>
            )}
            <Notice notice={notice} onClose={() => setNotice(null)} />
            {"activity_page" in data ? (
              <ActivityScreen
                data={data}
                loading={loading}
                error={error}
                onRead={load}
              />
            ) : "catalog_page" in data ? (
              <CatalogScreen
                data={data}
                loading={loading}
                error={error}
                onRead={load}
              />
            ) : "plan_page" in data ? (
              <PurchaseCartWorkspace
                data={data}
                busy={busy}
                readBlocked={Boolean(uncertainMutation)}
                loading={loading}
                error={error}
                run={run}
                onRead={load}
                directEntry={screen === "purchase_order_new"}
              />
            ) : "stock_page" in data ? (
              <LotsScreen
                key={`${data.stock_page.page}:${data.stock_page.query}:${data.stock_page.status}:${data.stock_page.product_id}`}
                data={data}
                busy={busy}
                readBlocked={Boolean(uncertainMutation)}
                run={run}
                loading={loading}
                error={error}
                onRead={load}
              />
            ) : "order_page" in data ? (
              <PurchasingScreen
                data={data}
                busy={busy}
                readBlocked={Boolean(uncertainMutation)}
                run={run}
                loading={loading}
                error={error}
                onRead={load}
              />
            ) : "delivery_page" in data ? (
              <ReceivingWorkspace
                data={data}
                busy={busy}
                readBlocked={Boolean(uncertainMutation)}
                run={run}
                loading={loading}
                error={error}
                onRead={load}
              />
            ) : (
              <>
                {screen === "catalog_new" && (
                  <CatalogCreateScreen data={data} busy={busy} run={run} />
                )}
                {screen === "configure" && (
                  <InventoryConfigureScreen data={data} busy={busy} run={run} />
                )}
                {screen === "locations" && (
                  <InventoryLocationsScreen data={data} busy={busy} run={run} />
                )}
                {screen === "supplier_pricing" && (
                  <SupplierPricingScreen
                    data={data}
                    onData={(next) => setData(next)}
                  />
                )}
                {screen === "shipment_new" && (
                  <ShipmentCreateScreen data={data} busy={busy} run={run} />
                )}
                {screen === "recalls" && (
                  <RecallScreen data={data} busy={busy} run={run} />
                )}
                {screen === "controlled" && (
                  <ControlledScreen data={data} busy={busy} run={run} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CatalogScreen({
  data,
  loading = false,
  error = "",
  onRead,
}: {
  data: InventoryCatalogData;
  loading?: boolean;
  error?: string;
  onRead: (read: InventoryCatalogRead) => Promise<void>;
}) {
  const result = data.catalog_page;
  const {
    page,
    page_count: pageCount,
    page_size: pageSize,
    status: statusFilter,
    sort,
  } = result;
  const [query, setQuery] = useState(result.query);
  useEffect(() => setQuery(result.query), [result.query]);
  const applied = { q: result.query, status: statusFilter, sort, page };
  const onRefresh = () => onRead(applied);
  const activeFilter =
    result.query || statusFilter !== "all" || sort !== "name";
  const canCreatePurchaseOrder = data.can_create_purchase_order;
  if (result.total_count === 0)
    return (
      <Card title="Product catalog">
        {error && (
          <Alert severity="error">
            {error} The previous catalog page remains visible.
          </Alert>
        )}
        <p className="inventory-lead">
          No catalog items yet. Add the first product definition to begin
          purchasing and receiving stock. No inventory records are currently
          available.
        </p>
        {data.configuration?.status === "configured" &&
          capability(data, "inventory.catalog") && (
            <a
              className="inventory-button outline"
              href="/clinic/inventory/catalog/new"
            >
              Add catalog item
            </a>
          )}
      </Card>
    );
  return (
    <div className="inventory-stack" aria-busy={loading}>
      <div className="inventory-catalog-topline">
        <div>
          <h2>Catalog</h2>
          <p className="inventory-lead">
            Products, stock positions, and traceability in one view.
          </p>
        </div>
        <div className="inventory-catalog-actions">
          <Button
            variant="outlined"
            href="/clinic/inventory/catalog/new"
            sx={{
              minHeight: 44,
              borderColor: "var(--inventory-control)",
              color: "var(--inventory-blue)",
              textTransform: "none",
              fontWeight: 700,
            }}
          >
            Add catalog item
          </Button>
          <Button
            variant="contained"
            startIcon={<MoveToInboxOutlinedIcon />}
            href="/clinic/inventory/receiving"
            sx={{
              minHeight: 44,
              backgroundColor: "var(--inventory-blue)",
              textTransform: "none",
              fontWeight: 700,
              boxShadow: "none",
              "&:hover": { backgroundColor: "var(--inventory-blue)" },
            }}
          >
            Receive stock
          </Button>
        </div>
      </div>
      <p className="inventory-flow-note">
        Quantities are shown in base units unless a package unit is named.
      </p>
      <Card title="Catalog and lot traceability">
        <div className="inventory-card-heading">
          <div>
            <p className="inventory-lead">
              Search the records you need, then open lots or replenishment from
              the row.
            </p>
          </div>
        </div>
        <form
          className="inventory-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (!loading) void onRead({ ...applied, q: query.trim(), page: 1 });
          }}
        >
          <TextField
            size="small"
            label="Search inventory"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Product, NDC, lot, supplier"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            size="small"
            label="Stock status"
            value={statusFilter}
            disabled={loading}
            onChange={(event) =>
              void onRead({
                ...applied,
                status: event.target.value as typeof statusFilter,
                page: 1,
              })
            }
          >
            <MenuItem value="all">All products</MenuItem>
            <MenuItem value="attention">Needs attention</MenuItem>
            <MenuItem value="in_range">In range</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Sort by"
            value={sort}
            disabled={loading}
            onChange={(event) =>
              void onRead({
                ...applied,
                sort: event.target.value as typeof sort,
                page: 1,
              })
            }
          >
            <MenuItem value="name">Product name</MenuItem>
            <MenuItem value="available_asc">Available: low to high</MenuItem>
            <MenuItem value="available_desc">Available: high to low</MenuItem>
          </TextField>
          <Button type="submit" variant="outlined" disabled={loading}>
            Search inventory
          </Button>
          {activeFilter && (
            <Button
              variant="outlined"
              type="button"
              disabled={loading}
              onClick={() => {
                setQuery("");
                void onRead({ q: "", status: "all", sort: "name", page: 1 });
              }}
            >
              Reset view
            </Button>
          )}
        </form>
        <p className="inventory-results-count" role="status">
          {loading
            ? "Loading catalog…"
            : `Showing ${result.filtered_count === 0 ? 0 : (page - 1) * pageSize + 1}–${Math.min(page * pageSize, result.filtered_count)} of ${result.filtered_count} matching products (${result.total_count} total).`}
          {result.query && ` Search: ${result.query}.`}
        </p>
        {error && (
          <Alert severity="error">
            {error} The previous catalog page remains visible.
          </Alert>
        )}
        {data.products.length === 0 && (
          <p className="inventory-empty-state" role="status">
            No products match this view. Change the search or reset the view.
          </p>
        )}
        <div className="inventory-table-wrap">
          <table>
            <caption className="sr-only">Inventory catalog</caption>
            <thead>
              <tr>
                <th>Product / package</th>
                <th>NDC / UDI-DI</th>
                <th>Available</th>
                <th>On hand</th>
                <th>Reorder point</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((item) => (
                <tr key={item.id}>
                  <td data-label="Product">
                    <strong>{item.name}</strong>
                    <small>
                      {inventoryCategoryLabel(item.category)} ·{" "}
                      {item.preferred_supplier ?? "Supplier not recorded"} ·{" "}
                      {packageFor(data, item.package_id)?.description ??
                        "Package metadata not recorded"}
                    </small>
                  </td>
                  <td data-label="NDC / UDI-DI" className="mono">
                    {item.ndc || item.device_identifier || "Not recorded"}
                  </td>
                  <td data-label="Available" className="numeric">
                    {number(item.available_units)} {item.base_unit}
                  </td>
                  <td data-label="On hand" className="numeric">
                    {number(item.on_hand_units)}
                  </td>
                  <td data-label="Reorder point" className="numeric">
                    {number(item.reorder_point_units)}
                  </td>
                  <td data-label="Status">
                    <Badge tone={item.low_stock ? "warning" : "success"}>
                      {item.low_stock ? "Reorder" : "In range"}
                    </Badge>
                  </td>
                  <td data-label="Actions">
                    <a href={`/clinic/inventory/lots?product_id=${item.id}`}>
                      View lots
                    </a>
                    {canCreatePurchaseOrder && (
                      <a
                        href={`/clinic/inventory/purchasing/new?product_id=${item.id}`}
                      >
                        Create purchase order
                      </a>
                    )}
                    {item.low_stock && canCreatePurchaseOrder && (
                      <a
                        href={`/clinic/inventory/replenishment?product_id=${item.id}`}
                      >
                        Start replenishment
                      </a>
                    )}
                    {capability(data, "inventory.catalog") && (
                      <ReorderPointEditor item={item} onSaved={onRefresh} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pageCount > 1 && (
          <nav className="inventory-pagination" aria-label="Catalog pagination">
            <Button
              variant="outlined"
              type="button"
              disabled={loading || page === 1}
              onClick={() => void onRead({ ...applied, page: page - 1 })}
            >
              Previous
            </Button>
            <span aria-live="polite">
              Page {page} of {pageCount}
            </span>
            <Button
              variant="outlined"
              type="button"
              disabled={loading || page === pageCount}
              onClick={() => void onRead({ ...applied, page: page + 1 })}
            >
              Next
            </Button>
          </nav>
        )}
      </Card>
      <Card title="Attention queue">
        {data.attention_count > 0 && (
          <p className="inventory-results-count">
            Showing {data.attention.length} of {data.attention_count} held or
            recalled lots.{" "}
            <a href="/clinic/inventory/lots">View stock by lot</a>
          </p>
        )}
        <ul className="inventory-list">
          {data.attention.map((item) => (
            <li key={item.id}>
              <Badge tone="danger">{item.status}</Badge>
              <div>
                <strong>Lot {item.lot_number}</strong>
                <small>
                  {item.product_name} · expires{" "}
                  {inventoryDate(item.expiration_date, data.timezone)}
                </small>
              </div>
            </li>
          ))}
          {data.attention_count === 0 && <li>No held or recalled lots.</li>}
        </ul>
      </Card>
    </div>
  );
}

function ReorderPointEditor({
  item,
  onSaved,
}: {
  item: InventoryData["products"][number];
  onSaved: () => Promise<void>;
}) {
  return (
    <details className="inventory-details">
      <summary>Edit reorder point</summary>
      <InventoryForm
        endpoint={`/api/clinic/inventory/products/${item.id}`}
        method="PATCH"
        submit="Save reorder point"
        onSuccess={() => void onSaved()}
        className="inventory-inline-form"
      >
        <Field label={`Reorder point (${item.base_unit}s)`}>
          <input
            name="product[reorder_point]"
            type="number"
            min={0}
            max={1000000}
            step={1}
            defaultValue={item.reorder_point_units}
          />
        </Field>
      </InventoryForm>
    </details>
  );
}

function ReplenishmentScreen({
  data,
  busy,
  run,
}: {
  data: InventoryData;
  busy: boolean;
  run: (
    endpoint: string,
    body: Record<string, unknown>,
    title: string,
    detail: string,
  ) => Promise<void>;
}) {
  const requestedProductId = new URLSearchParams(window.location.search).get(
    "product_id",
  );
  const candidates = replenishmentCandidates(data);
  const requestedProduct = data.products.find(
    (product) => product.id === requestedProductId,
  );
  const requestedItem = candidates.find(
    (product) => product.id === requestedProductId,
  );
  const initialItem = requestedProductId ? requestedItem : candidates[0];
  const [productId, setProductId] = useState(initialItem?.id ?? "");
  const item = candidates.find((product) => product.id === productId);
  const packageInfo = packageFor(data, item?.package_id);
  const initialDestination = purchaseOrderDestination(
    data,
    initialItem?.id ?? "",
  );
  const [destinationId, setDestinationId] = useState(
    initialDestination?.id ?? "",
  );
  const destination = data.sites?.find(
    (location) => location.id === destinationId,
  );
  const [supplierId, setSupplierId] = useState(
    initialItem?.preferred_supplier_id ?? data.suppliers?.[0]?.id ?? "",
  );
  const supplier = data.suppliers?.find((record) => record.id === supplierId);
  const initialSupplierOffer = initialItem
    ? supplierProductFor(
        data,
        initialItem.id,
        initialItem.preferred_supplier_id ?? data.suppliers?.[0]?.id ?? "",
      )
    : undefined;
  const supplierProduct = item
    ? supplierProductFor(data, item.id, supplierId)
    : undefined;
  const suggestedQuantity = (productId: string) => {
    const product = data.products.find((record) => record.id === productId);
    if (!product) return "1";
    const deficit = nonNegative(
      decimalSubtract(
        decimalSubtract(product.reorder_point_units, product.available_units),
        onOrderUnits(data, product.id),
      ),
    );
    return decimalCompare(deficit, "0") > 0
      ? decimalCeilDivide(deficit, product.units_per_package)
      : "1";
  };
  const [quantity, setQuantity] = useState(() =>
    initialItem ? suggestedQuantity(initialItem.id) : "1",
  );
  const [unitPrice, setUnitPrice] = useState(
    initialSupplierOffer?.wholesale_unit_cost ??
      (initialItem ? (recordedPackagePrice(data, initialItem.id) ?? "") : ""),
  );
  const [reason, setReason] = useState("");
  const [currency, setCurrency] = useState(initialSupplierOffer?.currency ?? "");
  if (!item)
    return (
      <Card title="Replenishment suggestions">
        <p>
          {requestedProductId
            ? requestedProduct
              ? `${requestedProduct.name} is not below its projected reorder point.`
              : "The requested product was not found."
            : "No products are below their projected reorder point."}
        </p>
        <a className="inventory-button outline" href="/clinic/inventory">
          Return to catalog
        </a>
      </Card>
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(
      "/api/clinic/inventory/purchase-orders",
      {
        purchase_order: {
          destination: destination?.name ?? "",
          receiving_site_id: destination?.id ?? "",
          destination_address: facilityAddress(destination),
          reason: reason.trim(),
          ...(supplierId ? { supplier_id: supplierId } : {}),
          lines: [
            {
              product_id: item.id,
              quantity,
              input_unit: packageInfo?.input_unit ?? "",
              conversion_factor: item.units_per_package,
              unit_price: unitPrice,
              currency: currency.trim().toUpperCase(),
            },
          ],
        },
      },
      "Draft created",
      `${number(quantity)} ${packageInfo?.input_unit ?? "unavailable unit"} (${number(decimalMultiply(quantity, item.units_per_package))} ${item.base_unit}) added.`,
    );
  };
  return (
    <div className="inventory-two-col wide-left">
      <Card title="Replenishment suggestion">
        <div className="inventory-card-heading">
          <Field label="Product">
            <select
              value={item.id}
              onChange={(event) => {
                const selected = data.products.find(
                  (product) => product.id === event.target.value,
                );
                setProductId(event.target.value);
                const nextSupplierId = selected?.preferred_supplier_id ?? "";
                const offer = supplierProductFor(
                  data,
                  event.target.value,
                  nextSupplierId,
                );
                setSupplierId(nextSupplierId);
                setQuantity(suggestedQuantity(event.target.value));
                setUnitPrice(
                  offer?.wholesale_unit_cost ??
                    recordedPackagePrice(data, event.target.value) ??
                    "",
                );
                setCurrency(offer?.currency ?? "");
              }}
            >
              {candidates.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="inventory-panel-heading">
          <div>
            <h3>{item.name}</h3>
            <p className="inventory-lead">
              NDC {item.ndc || "not recorded"} ·{" "}
              {packageInfo?.description ??
                `${number(item.units_per_package)} ${item.base_unit} per ${packageInfo?.input_unit ?? "unavailable unit"}`}
            </p>
          </div>
        </div>
        <div className="inventory-data-grid four">
          <DataPoint
            label="Available"
            value={`${number(item.available_units)} ${item.base_unit}`}
          />
          <DataPoint
            label="Held"
            value={`${number(decimalSum(data.balances.filter((balance) => balance.product_id === item.id).map((balance) => balance.held_units)))} ${item.base_unit}`}
            tone="warning"
          />
          <DataPoint
            label="On order"
            value={`${number(onOrderUnits(data, item.id))} ${item.base_unit}`}
          />
          <DataPoint
            label="Reorder point"
            value={`${number(item.reorder_point_units)} ${item.base_unit}`}
          />
        </div>
        <div className="inventory-muted-panel">
          <strong>Projected replenishment</strong>
          <p>Available and inbound stock are below the reorder point.</p>
        </div>
        <form className="inventory-form-grid" onSubmit={submit}>
          <Field
            label={`Order quantity (${packageInfo?.input_unit ?? "unavailable unit"})`}
            hint={`${number(decimalMultiply(quantity || "0", item.units_per_package))} ${item.base_unit} · package multiple ${number(item.units_per_package)}`}
          >
            <input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </Field>
          <Field label="Supplier">
            {(data.suppliers?.length ?? 0) > 0 ? (
              <select
                value={supplierId}
                onChange={(event) => {
                  const nextSupplierId = event.target.value;
                  const offer = supplierProductFor(data, item.id, nextSupplierId);
                setSupplierId(nextSupplierId);
                setDestinationId(
                  purchaseOrderDestination(data, event.target.value)?.id ?? "",
                );
                  setUnitPrice(
                    offer?.wholesale_unit_cost ??
                      recordedPackagePrice(data, item.id) ??
                      "",
                  );
                  setCurrency(offer?.currency ?? "");
                }}
              >
                <option value="">No supplier</option>
                {data.suppliers?.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.name}
                  </option>
                ))}
              </select>
            ) : (
              <input value="Not recorded" readOnly />
            )}
          </Field>
          <Field
            label="Unit price"
            hint={
              supplierProduct
                ? `Supplier feed: ${supplierProduct.supplier_sku} · ${supplierProduct.contract_status} contract`
                : "Enter the supplier quote for this order."
            }
          >
            <input
              inputMode="decimal"
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              placeholder="Enter price"
            />
          </Field>
          <Field label="Currency" hint="Three-letter ISO currency code.">
            <input
              value={currency}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
              maxLength={3}
              placeholder="USD"
              required
            />
          </Field>
          <Field label="Destination">
            <select
              value={destinationId}
              onChange={(event) => setDestinationId(event.target.value)}
              required
            >
              <option value="">Select a clinic facility</option>
              {purchaseOrderFacilities(data).map((location) => (
                <option
                  key={location.id}
                  value={location.id}
                  disabled={!facilityCanReceivePurchaseOrder(location)}
                >
                  {location.name}
                  {!facilityCanReceivePurchaseOrder(location)
                    ? " · address incomplete"
                    : ""}
                </option>
              ))}
            </select>
            {destination && (
              <small>
                {facilityCanReceivePurchaseOrder(destination)
                  ? `Delivery address: ${facilityAddress(destination)}`
                  : "Complete this location's address before ordering."}
              </small>
            )}
          </Field>
          <Field label="Reason">
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </Field>
          <div className="inventory-form-actions">
            <PermissionNote
              allowed={capability(data, "procurement.create")}
              permission="procurement.create"
            />
            <ConfirmButton
              disabled={
                busy ||
                !capability(data, "procurement.create") ||
                !validDecimal(quantity) ||
                !validDecimal(unitPrice, true) ||
                !/^[A-Z]{3}$/.test(currency.trim().toUpperCase()) ||
                !destination ||
                !reason.trim()
              }
              onConfirm={() => {
                const fake = new Event("submit") as unknown as FormEvent;
                submit(fake);
              }}
            >
              Create draft PO →
            </ConfirmButton>
          </div>
        </form>
      </Card>
      <Card title="Quantity preview">
        <div className="inventory-stack compact">
          <DataPoint label="Product" value={item.name} />
          <DataPoint
            label="Supplier"
            value={supplier?.name ?? "Not selected"}
          />
          <DataPoint
            label="Draft quantity"
            value={`${number(quantity || "0")} ${packageInfo?.input_unit ?? "unavailable unit"}`}
          />
          <DataPoint
            label="Base-unit quantity"
            value={`${number(decimalMultiply(quantity || "0", item.units_per_package))} ${item.base_unit}`}
          />
          {validDecimal(unitPrice, true) && (
            <DataPoint
              label="Estimated subtotal"
              value={money(
                decimalMultiply(quantity || "0", unitPrice),
                currency,
              )}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function PurchaseCartWorkspace({
  data,
  busy,
  readBlocked,
  loading,
  error,
  run,
  onRead,
  directEntry = false,
}: {
  data: InventoryPlanData;
  busy: boolean;
  readBlocked: boolean;
  loading: boolean;
  error: string;
  run: InventoryRun;
  onRead: (read: InventoryPlanRead) => Promise<void>;
  directEntry?: boolean;
}) {
  const result = data.plan_page;
  const pinnedProduct = Boolean(result.product_id);
  const [search, setSearch] = useState(result.query);
  const [reason, setReason] = useState(data.purchase_cart?.reason ?? "");
  const [destinationId, setDestinationId] = useState(
    data.purchase_cart?.destination_site_id ?? "",
  );
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        (data.purchase_cart?.items ?? []).map((item) => [
          item.id,
          item.requested_packages,
        ]),
      ),
  );
  const [cartAction, setCartAction] = useState<string | null>(null);
  const [cartError, setCartError] = useState("");
  const cart = data.purchase_cart;
  const canProcure = capability(data, "procurement.create");
  const writeBlocked = readBlocked || loading || Boolean(error);
  const destinations = purchaseOrderFacilities(data).filter(
    facilityCanReceivePurchaseOrder,
  );
  const applied: InventoryPlanRead = {
    q: result.query,
    plan_mode: result.mode,
    page: result.page,
  };
  useEffect(() => setSearch(result.query), [result.query]);
  useEffect(() => {
    setReason(cart?.reason ?? "");
    setDestinationId(cart?.destination_site_id ?? "");
    setLineQuantities(
      Object.fromEntries(
        (cart?.items ?? []).map((item) => [item.id, item.requested_packages]),
      ),
    );
  }, [cart?.id, cart?.version]);

  const refresh = () => onRead(applied);
  const reconcileCartMutation = async (
    action: string,
    endpoint: string,
    options: { method: "PATCH" | "DELETE"; body?: Record<string, unknown> },
  ) => {
    setCartAction(action);
    setCartError("");
    try {
      const payload = await api<{ acknowledged?: boolean }>(
        `${endpoint}?response=ack`,
        options,
      );
      if (payload.acknowledged !== true)
        throw new Error("The cart update response could not be confirmed.");
      await refresh();
    } catch (reason) {
      setCartError(
        reason instanceof Error
          ? `${reason.message} A draft refresh was requested; reload the page if its current state is still unclear.`
          : "The cart update could not be confirmed. A draft refresh was requested; reload the page if its current state is still unclear.",
      );
      await refresh();
    } finally {
      setCartAction(null);
    }
  };
  const addItem = (product: InventoryProduct) => {
    const explanation = data.explanations[product.id];
    if (!explanation?.offer) return;
    const quantity =
      decimalCompare(explanation.suggested_packages, "0") > 0
        ? explanation.suggested_packages
        : "1";
    void run(
      "/api/clinic/inventory/purchase-cart/items",
      {
        item: {
          product_id: product.id,
          requested_packages: quantity,
          source:
            result.mode === "needed" &&
            decimalCompare(explanation.shortage_units, "0") > 0
              ? "replenishment"
              : "manual",
          destination_site_id: destinationId,
          reason: reason.trim(),
        },
      },
      "Added to draft",
      `${product.name} is in the draft cart using ${explanation.offer.supplier_name}.`,
    );
  };
  const updateItem = (id: string) => {
    const requestedPackages = lineQuantities[id]?.trim() ?? "";
    if (!/^[1-9][0-9]*$/.test(requestedPackages)) {
      setCartError("Package quantity must be a positive whole number.");
      return;
    }
    void reconcileCartMutation(
      `update:${id}`,
      `/api/clinic/inventory/purchase-cart/items/${id}`,
      {
        method: "PATCH",
        body: { item: { requested_packages: requestedPackages } },
      },
    );
  };
  const removeItem = (id: string) => {
    void reconcileCartMutation(
      `remove:${id}`,
      `/api/clinic/inventory/purchase-cart/items/${id}`,
      { method: "DELETE" },
    );
  };
  const subtotal = decimalSum(
    (cart?.items ?? []).map((item) => item.extended_cost),
  );
  const supplierCount = new Set(
    (cart?.items ?? []).map((item) => item.supplier_id).filter(Boolean),
  ).size;
  const selectedDestination = destinations.find(
    (site) => String(site.id) === destinationId,
  );
  const hasUnsavedLineChanges = Boolean(
    cart?.items.some(
      (item) =>
        (lineQuantities[item.id] ?? item.requested_packages) !==
        item.requested_packages,
    ),
  );
  const checkout = async () => {
    if (!cart) return;
    setCartAction("checkout");
    setCartError("");
    try {
      const payload = await api<{ acknowledged?: boolean }>(
        "/api/clinic/inventory/purchase-cart?response=ack",
        {
          method: "PATCH",
          body: {
            cart: {
              destination_site_id: destinationId,
              reason: reason.trim(),
            },
          },
        },
      );
      if (payload.acknowledged !== true)
        throw new Error("The cart details could not be confirmed.");
      await run(
        "/api/clinic/inventory/purchase-cart/checkout",
        { checkout: { cart_id: cart.id } },
        "Checkout complete",
        `${supplierCount} supplier purchase order${supplierCount === 1 ? "" : "s"} created.`,
      );
    } catch (reason) {
      setCartError(
        reason instanceof Error
          ? reason.message
          : "The cart details could not be confirmed.",
      );
      await refresh();
    } finally {
      setCartAction(null);
    }
  };
  return (
    <div className="inventory-two-col purchase-cart-layout">
      <Card
        title={directEntry ? "Create purchase order" : "Plan replenishment"}
      >
        {pinnedProduct && (
          <Alert severity="info">
            This view is pinned to the catalog item you selected. Its product
            cannot be changed here.{" "}
            <a
              href={
                directEntry
                  ? "/clinic/inventory/purchasing/new"
                  : "/clinic/inventory/replenishment"
              }
            >
              Open the full planning list
            </a>
            .
          </Alert>
        )}
        <form
          className="inventory-toolbar purchase-cart-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (!loading)
              void onRead({
                ...applied,
                q: pinnedProduct ? "" : search.trim(),
                page: 1,
              });
          }}
        >
          <TextField
            select
            size="small"
            label="Planning scope"
            value={result.mode}
            disabled={loading || pinnedProduct}
            onChange={(event) =>
              void onRead({
                ...applied,
                plan_mode: event.target.value as NonNullable<
                  InventoryPlanRead["plan_mode"]
                >,
                page: 1,
              })
            }
          >
            <MenuItem value="needed">Needs replenishment</MenuItem>
            <MenuItem value="all">All active catalog items</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Search active catalog"
            placeholder="Name, NDC, device ID, or SKU"
            value={search}
            disabled={pinnedProduct}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <Button
            type="submit"
            variant="outlined"
            disabled={loading || pinnedProduct}
          >
            Search products
          </Button>
        </form>
        <p className="inventory-results-count" role="status">
          {loading
            ? "Loading planning data…"
            : `Showing ${result.filtered_count === 0 ? 0 : (result.page - 1) * result.page_size + 1}–${Math.min(result.page * result.page_size, result.filtered_count)} of ${result.filtered_count} matching products (${result.total_count} active total).`}
        </p>
        {error && (
          <Alert severity="error">
            {error} The previous planning page remains visible.
          </Alert>
        )}
        <div className="inventory-list purchase-catalog-list">
          {data.products.map((product) => {
            const explanation = data.explanations[product.id];
            const offer = explanation?.offer;
            const alreadyInCart = cart?.items.some(
              (item) => item.product_id === product.id,
            );
            const hasUnitMismatch = Boolean(explanation?.unit_mismatch_count);
            return (
              <div
                className={`inventory-list-row ${product.id === result.product_id ? "selected" : ""}`}
                key={product.id}
              >
                <div>
                  <strong>{product.name}</strong>
                  <small>
                    {product.ndc ||
                      product.device_identifier ||
                      "Identifier not recorded"}{" "}
                    · {number(product.units_per_package)} {product.base_unit}{" "}
                    per catalog package
                  </small>
                  {explanation && (
                    <small>
                      Available {number(explanation.available_units)} ·
                      Confirmed incoming {number(explanation.incoming_units)} ·
                      Reorder point {number(product.reorder_point_units)}
                    </small>
                  )}
                  {explanation && (
                    <details>
                      <summary>How this quantity was calculated</summary>
                      <small>
                        Physical {number(explanation.on_hand_units)}{" "}
                        {product.base_unit}; unavailable{" "}
                        {number(explanation.unavailable_units)}; confirmed
                        incoming {number(explanation.incoming_units)}; pending
                        unsent orders {number(explanation.pending_order_units)};
                        current draft {number(explanation.draft_cart_packages)}{" "}
                        catalog packages.
                      </small>
                      <small>
                        Shortage {number(explanation.shortage_units)}{" "}
                        {product.base_unit}; suggested{" "}
                        {number(explanation.suggested_packages)} catalog
                        packages, rounded to {number(explanation.rounded_units)}{" "}
                        {product.base_unit}.
                      </small>
                    </details>
                  )}
                  {hasUnitMismatch && (
                    <Alert severity="warning">
                      {explanation.unit_mismatch_count} outstanding order line
                      {explanation.unit_mismatch_count === 1
                        ? " has"
                        : "s have"}{" "}
                      a different stock unit. Review it before adding this item.
                    </Alert>
                  )}
                </div>
                <div className="purchase-catalog-price">
                  {offer
                    ? money(offer.unit_price, offer.currency)
                    : "No eligible offer"}
                  <small>
                    {offer
                      ? `${offer.supplier_name} · ${number(offer.supplier_packages)} supplier packages`
                      : (explanation?.offer_error ??
                        "Supplier terms unavailable")}
                  </small>
                </div>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={
                    busy ||
                    writeBlocked ||
                    Boolean(cartAction) ||
                    !offer ||
                    !selectedDestination ||
                    !reason.trim() ||
                    !canProcure ||
                    alreadyInCart ||
                    hasUnitMismatch
                  }
                  onClick={() => addItem(product)}
                >
                  {alreadyInCart ? "In draft" : "Add"}
                </Button>
              </div>
            );
          })}
          {data.products.length === 0 && (
            <p className="inventory-empty" role="status">
              No products match this planning view.
            </p>
          )}
        </div>
        {result.page_count > 1 && (
          <nav
            className="inventory-pagination"
            aria-label="Purchase catalog pagination"
          >
            <Button
              variant="outlined"
              type="button"
              disabled={loading || result.page === 1}
              onClick={() => void onRead({ ...applied, page: result.page - 1 })}
            >
              Previous
            </Button>
            <span aria-live="polite">
              Page {result.page} of {result.page_count}
            </span>
            <Button
              variant="outlined"
              type="button"
              disabled={loading || result.page === result.page_count}
              onClick={() => void onRead({ ...applied, page: result.page + 1 })}
            >
              Next
            </Button>
          </nav>
        )}
      </Card>
      <Card title="Draft purchase cart" className="purchase-cart-panel">
        <PermissionNote allowed={canProcure} permission="procurement.create" />
        <div className="inventory-form-grid compact">
          <TextField
            select
            size="small"
            label="Destination facility"
            value={destinationId}
            disabled={writeBlocked || Boolean(cartAction)}
            onChange={(event) => setDestinationId(event.target.value)}
          >
            <MenuItem value="">Select a facility</MenuItem>
            {destinations.map((site) => (
              <MenuItem key={site.id} value={String(site.id)}>
                {site.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Purchase reason"
            value={reason}
            disabled={writeBlocked || Boolean(cartAction)}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this needed?"
          />
        </div>
        {cartError && <Alert severity="error">{cartError}</Alert>}
        {!cart?.items.length ? (
          <p className="inventory-muted-panel">
            Your draft is empty. Add any active catalog item; supplier routing
            happens automatically.
          </p>
        ) : (
          <div className="purchase-cart-lines">
            {cart.items.map((item) => {
              const quantity =
                lineQuantities[item.id] ?? item.requested_packages;
              const unchanged = quantity === item.requested_packages;
              return (
                <form
                  className="purchase-cart-line"
                  key={item.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateItem(item.id);
                  }}
                >
                  <div>
                    <strong>{item.product_name}</strong>
                    <small>
                      {item.supplier ?? "Supplier unavailable"} ·{" "}
                      {item.requested_packages} catalog packages ·{" "}
                      {item.supplier_packages ?? item.requested_packages}{" "}
                      supplier packages ·{" "}
                      {money(item.unit_price, item.currency)} / supplier package
                    </small>
                  </div>
                  <TextField
                    size="small"
                    label="Packages"
                    type="number"
                    value={quantity}
                    disabled={writeBlocked || Boolean(cartAction)}
                    onChange={(event) =>
                      setLineQuantities((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    slotProps={{ htmlInput: { min: 1, step: 1 } }}
                  />
                  <strong>{money(item.extended_cost, item.currency)}</strong>
                  <div className="inventory-form-actions">
                    <Button
                      type="submit"
                      size="small"
                      variant="outlined"
                      disabled={
                        busy ||
                        writeBlocked ||
                        Boolean(cartAction) ||
                        unchanged ||
                        !canProcure
                      }
                    >
                      {cartAction === `update:${item.id}` ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      size="small"
                      color="error"
                      aria-label={`Remove ${item.product_name}`}
                      disabled={
                        busy ||
                        writeBlocked ||
                        Boolean(cartAction) ||
                        !canProcure
                      }
                      onClick={() => removeItem(item.id)}
                    >
                      <ClearRoundedIcon fontSize="small" />
                    </Button>
                  </div>
                </form>
              );
            })}
          </div>
        )}
        <div className="purchase-cart-summary">
          <span>
            {cart?.items.length ?? 0} lines · {supplierCount} supplier purchase
            order{supplierCount === 1 ? "" : "s"}
          </span>
          <strong>
            Estimated subtotal{" "}
            {money(subtotal, cart?.items[0]?.currency ?? "USD")}
          </strong>
        </div>
        <Button
          variant="contained"
          disabled={
            busy ||
            writeBlocked ||
            Boolean(cartAction) ||
            hasUnsavedLineChanges ||
            !cart?.items.length ||
            !destinationId ||
            !reason.trim() ||
            !canProcure
          }
          onClick={() => void checkout()}
        >
          {cartAction === "checkout" ? "Checking out…" : "Check out once"}
        </Button>
      </Card>
    </div>
  );
}

function ShipmentCreateScreen({
  data,
  busy,
  run,
}: {
  data: InventoryData;
  busy: boolean;
  run: InventoryRun;
}) {
  const openOrders = data.purchase_orders.filter((order) =>
    ["sent", "partially_received"].includes(order.status),
  );
  const requestedOrderId = new URLSearchParams(window.location.search).get(
    "purchase_order_id",
  );
  const initialOrder =
    openOrders.find((order) => order.id === requestedOrderId) ?? openOrders[0];
  const [orderId, setOrderId] = useState(initialOrder?.id ?? "");
  const order = openOrders.find((record) => record.id === orderId);
  const initialLine = order?.lines.find(
    (line) =>
      decimalCompare(
        decimalSubtract(line.ordered_packages, line.received_packages),
        "0",
      ) > 0,
  );
  const [lineId, setLineId] = useState(initialLine?.id ?? "");
  const line =
    order?.lines.find((record) => record.id === lineId) ?? initialLine;
  const remaining = line
    ? nonNegative(
        decimalSubtract(line.ordered_packages, line.received_packages),
      )
    : "0";
  const [packages, setPackages] = useState(remaining);
  const [reference, setReference] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!order || !line) return;
    void run(
      "/api/clinic/inventory/shipments",
      {
        shipment: {
          purchase_order_id: order.id,
          purchase_order_line_id: line.id,
          reference: reference.trim(),
          supplier_reference: supplierReference.trim(),
          package_count: packages,
        },
      },
      "Delivery recorded",
      `${number(packages)} packages are ready for receiving and put-away.`,
      () => window.location.assign("/clinic/inventory/receiving"),
    );
  };
  if (!order || !line)
    return (
      <Card title="Record delivered shipment">
        <p>No sent purchase order is ready for delivery intake.</p>
        <div className="inventory-form-actions">
          <a
            className="inventory-button outline"
            href="/clinic/inventory/purchasing/new"
          >
            Create purchase order
          </a>
          <a
            className="inventory-button outline"
            href="/clinic/inventory/purchasing"
          >
            Back to purchasing
          </a>
        </div>
      </Card>
    );
  return (
    <div className="inventory-stack">
      <a className="inventory-back-link" href="/clinic/inventory/purchasing">
        ← Back to orders & delivery
      </a>
      <div className="inventory-two-col wide-left">
        <Card title="Delivery intake">
          <p className="inventory-lead">
            Record what arrived from the supplier. This marks the shipment
            delivered; inventory is not available until Receiving confirms the
            lot and put-away details.
          </p>
          <form className="inventory-form-grid" onSubmit={submit}>
            <Field label="Purchase order">
              <select
                value={order.id}
                onChange={(event) => {
                  const nextOrder = openOrders.find(
                    (record) => record.id === event.target.value,
                  );
                  const nextLine = nextOrder?.lines.find(
                    (candidate) =>
                      decimalCompare(
                        decimalSubtract(
                          candidate.ordered_packages,
                          candidate.received_packages,
                        ),
                        "0",
                      ) > 0,
                  );
                  setOrderId(event.target.value);
                  setLineId(nextLine?.id ?? "");
                  setPackages(
                    nextLine
                      ? nonNegative(
                          decimalSubtract(
                            nextLine.ordered_packages,
                            nextLine.received_packages,
                          ),
                        )
                      : "0",
                  );
                }}
              >
                {openOrders.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.number} · {record.status.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            {order.lines.length > 1 && (
              <Field label="Order line">
                <select
                  value={line.id}
                  onChange={(event) => {
                    const nextLine = order.lines.find(
                      (record) => record.id === event.target.value,
                    );
                    setLineId(event.target.value);
                    setPackages(
                      nextLine
                        ? nonNegative(
                            decimalSubtract(
                              nextLine.ordered_packages,
                              nextLine.received_packages,
                            ),
                          )
                        : "0",
                    );
                  }}
                >
                  {order.lines.map((record) => (
                    <option key={record.id} value={record.id}>
                      {product(data, record.product_id)?.name ?? record.id}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Product">
              <input
                value={
                  product(data, line.product_id)?.name ?? "Unknown catalog item"
                }
                readOnly
              />
            </Field>
            <Field
              label="Packages delivered"
              hint={`${number(decimalMultiply(packages || "0", line.units_per_package))} ${unitLabel(data, line.product_id)} total · ${number(remaining)} remaining on PO`}
            >
              <input
                type="number"
                min={1}
                max={Number(remaining)}
                step={1}
                value={packages}
                onChange={(event) => setPackages(event.target.value)}
                required
              />
            </Field>
            <Field
              label="Internal shipment reference"
              hint="A unique receiving record, such as SHIP-2026-001."
            >
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                maxLength={80}
                required
              />
            </Field>
            <Field
              label="Supplier delivery reference"
              hint="Use the packing slip, tracking, or delivery number."
            >
              <input
                value={supplierReference}
                onChange={(event) => setSupplierReference(event.target.value)}
                maxLength={120}
                required
              />
            </Field>
            <div className="inventory-form-actions">
              <PermissionNote
                allowed={capability(data, "inventory.receive")}
                permission="inventory.receive"
              />
              <ConfirmButton
                disabled={
                  busy ||
                  !capability(data, "inventory.receive") ||
                  !validDecimal(packages) ||
                  decimalCompare(packages || "0", remaining) > 0 ||
                  !reference.trim() ||
                  !supplierReference.trim()
                }
                onConfirm={() => {
                  const fake = new Event("submit") as unknown as FormEvent;
                  submit(fake);
                }}
              >
                Mark delivered → Receiving
              </ConfirmButton>
            </div>
          </form>
        </Card>
        <Card title="Delivery handoff">
          <div className="inventory-stack compact">
            <DataPoint
              label="PO status"
              value={order.status.replaceAll("_", " ")}
              detail="Only sent orders can receive deliveries"
              tone="blue"
            />
            <DataPoint
              label="This shipment"
              value={`${number(packages)} packages`}
              detail={`${number(decimalMultiply(packages || "0", line.units_per_package))} ${unitLabel(data, line.product_id)}`}
            />
            <DataPoint
              label="Next screen"
              value="Receive & put away"
              detail="Enter lot, expiry, and storage location"
              tone="success"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

export type InventoryPurchaseOrderGroup = {
  id: string;
  checkoutGroupId: string | null;
  orders: InventoryPurchaseOrder[];
};

export function purchaseOrderGroups(
  orders: InventoryPurchaseOrder[],
): InventoryPurchaseOrderGroup[] {
  const groups = new Map<string, InventoryPurchaseOrderGroup>();
  orders.forEach((order) => {
    const checkoutGroupId = order.checkout_group_id ?? null;
    const id = checkoutGroupId ?? `order:${order.id}`;
    const group = groups.get(id) ?? { id, checkoutGroupId, orders: [] };
    group.orders.push(order);
    groups.set(id, group);
  });
  return Array.from(groups.values()).sort((left, right) =>
    (right.orders[0]?.created_at ?? "").localeCompare(
      left.orders[0]?.created_at ?? "",
    ),
  );
}

function purchaseOrderStatusTone(
  status: string,
): "neutral" | "success" | "warning" | "danger" | "blue" {
  if (status === "complete") return "success";
  if (["cancelled", "rejected"].includes(status)) return "danger";
  if (status === "draft") return "warning";
  return "blue";
}

function purchaseOrderGroupStatus(
  orders: InventoryPurchaseOrder[],
): { label: string; tone: "neutral" | "success" | "warning" | "danger" | "blue" } {
  const statuses = orders.map((order) => order.status);
  if (statuses.every((status) => status === "complete"))
    return { label: "Complete", tone: "success" };
  if (statuses.every((status) => status === "cancelled"))
    return { label: "Cancelled", tone: "danger" };
  if (statuses.every((status) => status === "draft"))
    return { label: "Needs review", tone: "warning" };
  return { label: "In progress", tone: "blue" };
}

function purchaseOrderGroupTotal(group: InventoryPurchaseOrderGroup): string {
  const currencies = Array.from(
    new Set(
      group.orders.flatMap((order) =>
        order.lines.map((line) => line.currency),
      ),
    ),
  );
  return currencies.length === 1
    ? money(
        decimalSum(group.orders.map((order) => order.total)),
        currencies[0],
      )
    : "Multiple currencies";
}

function PurchasingScreen({
  data,
  busy,
  readBlocked,
  loading,
  error,
  onRead,
  run,
}: {
  data: InventoryOrderData;
  busy: boolean;
  readBlocked: boolean;
  loading: boolean;
  error: string;
  onRead: (read: InventoryOrderRead) => Promise<void>;
  run: (
    endpoint: string,
    body: Record<string, unknown>,
    title: string,
    detail: string,
  ) => Promise<void>;
}) {
  const page = data.order_page;
  const [query, setQuery] = useState(page.query);
  useEffect(() => setQuery(page.query), [page.query]);
  const applied = { q: page.query, order_status: page.status, page: page.page };
  const disabled = loading || busy || readBlocked;
  return (
    <div className="inventory-stack" aria-busy={loading}>
      <Card title="Find purchase batches">
        <form
          className="inventory-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (!disabled)
              void onRead({ ...applied, q: query.trim(), page: 1 });
          }}
        >
          <TextField
            label="Search orders"
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Order, supplier, product"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            label="Order status"
            size="small"
            value={page.status}
            disabled={disabled}
            onChange={(event) =>
              void onRead({
                ...applied,
                order_status: event.target.value,
                page: 1,
              })
            }
          >
            {[
              "all",
              "draft",
              "submitted",
              "approved",
              "rejected",
              "sent",
              "partially_received",
              "complete",
              "cancelled",
            ].map((status) => (
              <MenuItem key={status} value={status}>
                {status === "all" ? "All orders" : status.replaceAll("_", " ")}
              </MenuItem>
            ))}
          </TextField>
          <Button type="submit" variant="outlined" disabled={disabled}>
            Search orders
          </Button>
          {(page.query || page.status !== "all") && (
            <Button
              type="button"
              variant="outlined"
              disabled={disabled}
              onClick={() =>
                void onRead({ q: "", order_status: "all", page: 1 })
              }
            >
              Reset filters
            </Button>
          )}
        </form>
        <p role="status">
          {loading
            ? "Loading purchase batches…"
            : `${page.filtered_groups} matching of ${page.total_groups} purchase batches · ${page.matching_orders} matching of ${page.total_orders} orders.`}
        </p>
        <p className="inventory-card-description">
          Each matching batch includes all of its supplier orders so batch
          totals remain complete.
        </p>
        {error && (
          <Alert severity="error">
            {error} The previous purchase page remains visible.
          </Alert>
        )}
        {page.page_count > 1 && (
          <nav
            className="inventory-pagination"
            aria-label="Purchase batch pagination"
          >
            <Button
              variant="outlined"
              disabled={disabled || page.page === 1}
              onClick={() => void onRead({ ...applied, page: page.page - 1 })}
            >
              Previous
            </Button>
            <span>
              Page {page.page} of {page.page_count}
            </span>
            <Button
              variant="outlined"
              disabled={disabled || page.page === page.page_count}
              onClick={() => void onRead({ ...applied, page: page.page + 1 })}
            >
              Next
            </Button>
          </nav>
        )}
      </Card>
      {data.purchase_orders.length > 0 ? (
        <PurchaseOrderDetails
          key={`${page.page}:${page.query}:${page.status}`}
          data={data}
          busy={busy}
          run={run}
        />
      ) : (
        <Card title="Purchasing">
          <p>
            {page.total_orders === 0
              ? "No purchase orders exist yet."
              : "No purchase batches match this view. Change the filters."}
          </p>
          <a href="/clinic/inventory/replenishment">Plan order</a>
        </Card>
      )}
    </div>
  );
}

function PurchaseOrderDetails({
  data,
  busy,
  run,
}: {
  data: InventoryOrderData;
  busy: boolean;
  run: (
    endpoint: string,
    body: Record<string, unknown>,
    title: string,
    detail: string,
  ) => Promise<void>;
}) {
  const orderGroups = useMemo(
    () => purchaseOrderGroups(data.purchase_orders),
    [data.purchase_orders],
  );
  const [orderId, setOrderId] = useState(data.purchase_orders[0]?.id ?? "");
  const [expandedGroupId, setExpandedGroupId] = useState(
    orderGroups[0]?.id ?? "",
  );
  const [actionReason, setActionReason] = useState("");
  const order =
    data.purchase_orders.find((record) => record.id === orderId) ??
    data.purchase_orders[0];
  if (!order)
    return (
      <Card title="Purchasing">
        <p>No purchase orders exist. Start from Replenishment.</p>
        <a
          className="inventory-button primary"
          href="/clinic/inventory/replenishment"
        >
          Open replenishment
        </a>
      </Card>
    );
  if (order.lines.length === 0)
    return (
      <Card title="Purchasing">
        <p>This purchase order has no lines.</p>
      </Card>
    );
  const shipment = data.shipments.find((record) => record.po_id === order.id);
  const hasRemaining = order.lines.some((record) =>
    decimalCompare(decimalSubtract(record.ordered_packages, record.received_packages), "0") > 0,
  );
  const orderCurrency = order.lines[0]?.currency ?? "USD";
  const next = (
    {
      draft: ["submitted", "Submit purchase order", "procurement.submit"],
      submitted: ["approved", "Approve purchase order", "procurement.approve"],
      approved: ["sent", "Mark order sent", "procurement.submit"],
      sent: ["complete", "Close order", "procurement.submit"],
      partially_received: ["complete", "Close order", "procurement.submit"],
    } as Record<string, [string, string, string]>
  )[order.status];
  const transition = () =>
    next &&
    void run(
      `/api/clinic/inventory/purchase-orders/${order.id}/transition`,
      {
        status: next[0],
        reason: actionReason.trim(),
      },
      "Purchase order updated",
      `${order.number} is now ${next[0].replaceAll("_", " ")}.`,
    );
  const cancel = () =>
    void run(
      `/api/clinic/inventory/purchase-orders/${order.id}/cancel-remainder`,
      {
        status: "cancelled",
        reason: actionReason.trim(),
      },
      "Remainder cancelled",
      "The outstanding quantity was closed; received history remains unchanged.",
    );
  const actionReasonField = (
    <Field label="Action reason" hint="Required for the audit record.">
      <input
        value={actionReason}
        onChange={(event) => setActionReason(event.target.value)}
        maxLength={200}
        autoFocus
        required
      />
    </Field>
  );
  const actionConfirmDisabled = (permission: string) =>
    busy || !capability(data, permission) || !actionReason.trim();
  return (
    <div className="inventory-stack">
      <Card title="Purchase batches">
        <p className="inventory-card-description">
          Each batch comes from one checkout. A separate purchase order is kept
          for each supplier.
        </p>
        <div className="inventory-purchase-batches">
          {orderGroups.map((group) => {
            const groupStatus = purchaseOrderGroupStatus(group.orders);
            const expanded = expandedGroupId === group.id;
            const title = group.checkoutGroupId
              ? `Purchase batch ${group.checkoutGroupId.slice(0, 8).toUpperCase()}`
              : "Individual purchase order";
            return (
              <div
                className={`inventory-purchase-batch ${expanded ? "expanded" : ""}`}
                key={group.id}
              >
                <button
                  className="inventory-purchase-batch-header"
                  type="button"
                  aria-expanded={expanded}
                  onClick={() =>
                    setExpandedGroupId((current) =>
                      current === group.id ? "" : group.id,
                    )
                  }
                >
                  <span className="inventory-purchase-batch-heading">
                    <strong>{title}</strong>
                    <small>
                      {group.orders.length} supplier purchase order
                      {group.orders.length === 1 ? "" : "s"} · created{" "}
                      {inventoryDateTime(
                        group.orders[0]?.created_at,
                        data.timezone,
                      )}
                    </small>
                  </span>
                  <span className="inventory-purchase-batch-summary">
                    <Badge tone={groupStatus.tone}>{groupStatus.label}</Badge>
                    <strong>{purchaseOrderGroupTotal(group)}</strong>
                  </span>
                </button>
                {expanded && (
                  <div className="inventory-purchase-batch-orders">
                    {group.orders.map((record) => (
                      <button
                        className={`inventory-purchase-order-option ${record.id === order.id ? "selected" : ""}`}
                        type="button"
                        key={record.id}
                        aria-current={record.id === order.id ? "true" : undefined}
                        onClick={() => setOrderId(record.id)}
                      >
                        <span>
                          <strong>
                            {record.supplier ?? "Supplier not recorded"}
                          </strong>
                          <small>
                            {record.number} · {record.lines.length} line
                            {record.lines.length === 1 ? "" : "s"}
                          </small>
                        </span>
                        <span className="inventory-purchase-order-option-summary">
                          <Badge tone={purchaseOrderStatusTone(record.status)}>
                            {record.status.replaceAll("_", " ")}
                          </Badge>
                          <strong>
                            {money(
                              record.total,
                              record.lines[0]?.currency ?? "USD",
                            )}
                          </strong>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <Card title={`Purchase order ${order.number}`}>
        <div className="inventory-panel-heading">
          <div>
            <div className="inventory-title-row">
              <Badge tone="blue">{order.status.replaceAll("_", " ")}</Badge>
            </div>
            <p className="inventory-lead">
              {order.supplier ?? "Supplier not recorded"} → {order.destination} · created{" "}
              {inventoryDateTime(order.created_at, data.timezone)}
            </p>
            {order.destination_address && (
              <p className="inventory-lead">Deliver to: {order.destination_address}</p>
            )}
          </div>
        </div>
      </Card>
      <Card title="Order lines">
          <div className="inventory-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product / package</th>
                  <th className="numeric">Status</th>
                  <th className="numeric">Price</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => {
                  const item = product(data, line.product_id);
                  const packageUnit = line.input_unit ?? "package";
                  const baseUnit = line.stock_unit ?? item?.base_unit ?? "unavailable unit";
                  const remaining = nonNegative(
                    decimalSubtract(line.ordered_packages, line.received_packages),
                  );
                  return (
                    <tr key={line.id}>
                      <td>
                        <strong>{line.product_name ?? item?.name}</strong>
                        <small>
                          {`${number(line.units_per_package)} ${baseUnit} / ${packageUnit}`} {" "}
                          · NDC {item?.ndc}
                        </small>
                      </td>
                      <td className="numeric">
                        <strong>
                          {number(line.ordered_packages)} {packageUnit} ordered
                        </strong>
                        <small>
                          {number(line.received_packages)} received · {number(remaining)} remaining
                        </small>
                        <small>
                          {number(line.ordered_units)} {baseUnit} total
                        </small>
                      </td>
                      <td className="numeric">
                        {money(line.package_price, line.currency)} / {packageUnit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="inventory-order-footer">
            <div className="inventory-order-actions">
              {["sent", "partially_received"].includes(order.status) &&
                hasRemaining && (
                  <a
                    className="inventory-button outline"
                    href={`/clinic/inventory/shipments/new?purchase_order_id=${order.id}`}
                  >
                    Record delivery
                  </a>
                )}
              {next && (
                <ConfirmButton
                  tone="primary"
                  disabled={busy || !capability(data, next[2])}
                  confirmationTitle={`${next[1]}?`}
                  confirmationContent={actionReasonField}
                  confirmDisabled={actionConfirmDisabled(next[2])}
                  confirmLabel={next[1]}
                  onConfirm={transition}
                >
                  {next[1]}
                </ConfirmButton>
              )}
              {order.status !== "complete" && order.status !== "cancelled" && (
                <div className="inventory-order-cancel">
                  <ConfirmButton
                    tone="outline"
                    disabled={
                      busy ||
                      !hasRemaining ||
                      !capability(data, "procurement.submit")
                    }
                    confirmationTitle="Cancel remaining quantities?"
                    confirmationContent={actionReasonField}
                    confirmDisabled={actionConfirmDisabled("procurement.submit")}
                    confirmLabel="Cancel remainder"
                    onConfirm={cancel}
                  >
                    Cancel remainder
                  </ConfirmButton>
                </div>
              )}
            </div>
            <div className="inventory-order-summary" aria-label="Order total">
              <div className="inventory-order-summary-row">
                <span>Subtotal</span>
                <strong>{money(order.subtotal, orderCurrency)}</strong>
              </div>
              <div className="inventory-order-summary-row">
                <span>Shipping</span>
                <strong>{money(order.shipping, orderCurrency)}</strong>
              </div>
              <div className="inventory-order-summary-row">
                <span>Tax</span>
                <strong>{money(order.tax, orderCurrency)}</strong>
              </div>
              <div className="inventory-order-summary-row total">
                <span>Order total</span>
                <strong>{money(order.total, orderCurrency)}</strong>
              </div>
            </div>
          </div>
          {shipment && (
            <a className="inventory-info" href={`/clinic/inventory/receiving?shipment_id=${shipment.id}`}>
              Delivery {shipment.supplier_reference} recorded · View receiving
            </a>
          )}
          <PermissionNote
            allowed={capability(data, "procurement.approve")}
            permission="procurement.approve"
          />
        </Card>
    </div>
  );
}

function ReceivingWorkspace({
  data,
  busy,
  readBlocked,
  loading,
  error,
  onRead,
  run,
}: {
  data: InventoryDeliveryData;
  busy: boolean;
  readBlocked: boolean;
  loading: boolean;
  error: string;
  onRead: (read: InventoryDeliveryRead) => Promise<void>;
  run: (
    endpoint: string,
    body: Record<string, unknown>,
    title: string,
    detail: string,
  ) => Promise<void>;
}) {
  const page = data.delivery_page;
  const [query, setQuery] = useState(page.query);
  useEffect(() => setQuery(page.query), [page.query]);
  const applied = {
    q: page.query,
    delivery_status: page.status,
    page: page.page,
    shipment_id: page.selected_shipment_id,
  };
  const disabled = loading || busy || readBlocked;
  const selected = data.shipments[0];
  return (
    <div className="inventory-stack" aria-busy={loading}>
      <Card title="Delivery queue">
        <form
          className="inventory-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (!disabled)
              void onRead({
                ...applied,
                q: query.trim(),
                page: 1,
                shipment_id: null,
              });
          }}
        >
          <TextField
            label="Search deliveries"
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Delivery, order, supplier"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            label="Delivery status"
            size="small"
            value={page.status}
            disabled={disabled}
            onChange={(event) =>
              void onRead({
                ...applied,
                delivery_status: event.target.value as typeof page.status,
                page: 1,
                shipment_id: null,
              })
            }
          >
            <MenuItem value="open">Open deliveries</MenuItem>
            <MenuItem value="reconciled">Reconciled deliveries</MenuItem>
            <MenuItem value="all">All deliveries</MenuItem>
          </TextField>
          <Button type="submit" variant="outlined" disabled={disabled}>
            Search deliveries
          </Button>
        </form>
        <p role="status">
          {loading
            ? "Loading deliveries…"
            : `${data.delivery_options.length} shown · ${page.filtered_count} matching of ${page.total_count} deliveries.`}
        </p>
        {error && (
          <Alert severity="error">
            {error} The previous delivery remains visible.
          </Alert>
        )}
        {data.delivery_options.length === 0 && (
          <p>
            No deliveries match this view. Change the search or status to review
            delivery history.
          </p>
        )}
        {(data.delivery_options.length > 0 || selected) && (
          <TextField
            select
            fullWidth
            size="small"
            label="Select delivery"
            value={selected?.id ?? ""}
            disabled={disabled}
            onChange={(event) =>
              void onRead({ ...applied, shipment_id: event.target.value })
            }
          >
            {selected &&
              !data.delivery_options.some(
                (option) => option.id === selected.id,
              ) && (
                <MenuItem value={selected.id}>
                  {selected.supplier_reference} (outside this view)
                </MenuItem>
              )}
            {data.delivery_options.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                {option.supplier_reference} · {option.order_number} ·{" "}
                {option.supplier_name ?? "Supplier not recorded"} ·{" "}
                {option.status}
              </MenuItem>
            ))}
          </TextField>
        )}
        {page.page_count > 1 && (
          <nav
            className="inventory-pagination"
            aria-label="Delivery pagination"
          >
            <Button
              variant="outlined"
              disabled={disabled || page.page === 1}
              onClick={() =>
                void onRead({
                  ...applied,
                  page: page.page - 1,
                  shipment_id: null,
                })
              }
            >
              Previous
            </Button>
            <span>
              Page {page.page} of {page.page_count}
            </span>
            <Button
              variant="outlined"
              disabled={disabled || page.page === page.page_count}
              onClick={() =>
                void onRead({
                  ...applied,
                  page: page.page + 1,
                  shipment_id: null,
                })
              }
            >
              Next
            </Button>
          </nav>
        )}
      </Card>
      {selected && (
        <ReceivingScreen
          key={selected.id}
          data={data}
          busy={busy}
          run={run}
          lookupLot
        />
      )}
    </div>
  );
}

export function ReceivingScreen({
  data,
  busy,
  run,
  lookupLot = false,
}: {
  data: InventoryReceivingDetail;
  lookupLot?: boolean;
  busy: boolean;
  run: (
    endpoint: string,
    body: Record<string, unknown>,
    title: string,
    detail: string,
  ) => Promise<void>;
}) {
  const [shipmentId, setShipmentId] = useState(data.shipments[0]?.id ?? "");
  const shipment =
    data.shipments.find((record) => record.id === shipmentId) ??
    data.shipments[0];
  const order = data.purchase_orders.find(
    (item) => item.id === shipment?.po_id,
  );
  const allocations = shipment?.allocations ?? [];
  const allocatedLines =
    order?.lines.filter((candidate) =>
      allocations.some(
        (entry) => entry.purchase_order_line_id === candidate.id,
      ),
    ) ?? [];
  const [lineId, setLineId] = useState(allocatedLines[0]?.id ?? "");
  const line =
    allocatedLines.find((record) => record.id === lineId) ?? allocatedLines[0];
  const allocation = allocations.find(
    (entry) => entry.purchase_order_line_id === line?.id,
  );
  const item = line && product(data, line.product_id);
  const packageInfo = packageFor(data, line?.package_id);
  const packageUnit = packageInfo?.input_unit ?? "unavailable unit";
  const baseUnit = item?.base_unit ?? "unavailable unit";
  const [lotLookupAttempt, setLotLookupAttempt] = useState(0);
  const [lotLookup, setLotLookup] = useState<{
    key: string;
    data: InventoryReceivingLotLookup;
    error?: string;
  }>();
  const productLots = data.lots.filter(
    (record) => record.product_id === item?.id,
  );
  const initialLot =
    productLots.find((record) => record.status === "recalled") ??
    productLots[0];
  const [lotNumber, setLotNumber] = useState(initialLot?.lot_number ?? "");
  const [expirationDate, setExpirationDate] = useState(
    initialLot?.expiration_date ?? "",
  );
  const recordedObservation = shipment?.reconciliation?.observations.find(
    (record) => record.product_id === item?.id,
  );
  const displayedLot = shipment?.reconciliation
    ? (recordedObservation?.lot_number ?? "")
    : lotNumber;
  const lookupKey = `${item?.id}:${displayedLot.trim()}`;
  const lookupMatches = lotLookup?.key === lookupKey;
  const lookupReady = !lookupLot || (lookupMatches && !lotLookup?.error);
  const selectedLot =
    (lookupMatches ? lotLookup?.data.lot : undefined) ??
    productLots.find((record) => record.lot_number === displayedLot.trim());
  const recall = [
    ...(lookupMatches ? (lotLookup?.data.recalls ?? []) : []),
    ...data.recalls,
  ].find(
    (record) =>
      record.product_id === item?.id &&
      record.lot_numbers.includes(displayedLot.trim()),
  );
  const eligibleLocations = recall
    ? data.locations.filter((record) => record.kind === "quarantine")
    : data.locations;
  const initialLocation = recall
    ? (eligibleLocations.find((record) => record.kind === "quarantine") ??
      eligibleLocations[0])
    : (eligibleLocations.find((record) => record.kind === "storage") ??
      eligibleLocations.find((record) => record.kind === "controlled") ??
      eligibleLocations[0]);
  const [destinationId, setDestinationId] = useState(initialLocation?.id ?? "");
  const destination =
    eligibleLocations.find((record) => record.id === destinationId) ??
    initialLocation;
  const [areaId, setAreaId] = useState(initialLocation?.areas[0] ?? "");
  const receipt =
    shipment && data.receipts.find((item) => item.shipment_id === shipment.id);
  const receiptLine = receipt?.lines.find(
    (record) => record.lot_id === selectedLot?.id,
  );
  const [packages, setPackages] = useState(
    shipment?.reconciliation?.accepted_packages ??
      allocation?.expected_packages ??
      "1",
  );
  const [missingPackages, setMissingPackages] = useState(
    shipment?.reconciliation?.missing_packages ?? "0",
  );
  const [rejectedPackages, setRejectedPackages] = useState(
    shipment?.reconciliation?.rejected_packages ?? "0",
  );
  const [excessPackages, setExcessPackages] = useState(
    shipment?.reconciliation?.excess_packages ?? "0",
  );
  const [exceptionKind, setExceptionKind] = useState(
    shipment?.reconciliation?.exception ?? "short_delivery",
  );
  const [temperature, setTemperature] = useState("");
  const [reason, setReason] = useState("");
  const selectLot = (value: string, productId = item?.id) => {
    setLotNumber(value);
    const known = data.lots.find(
      (record) =>
        record.product_id === productId && record.lot_number === value,
    );
    setExpirationDate(known?.expiration_date ?? "");

    const nextRecall = data.recalls.find(
      (record) =>
        record.product_id === productId && record.lot_numbers.includes(value),
    );
    const nextLocations = nextRecall
      ? data.locations.filter((record) => record.kind === "quarantine")
      : data.locations;
    const nextLocation = nextRecall
      ? (nextLocations.find((record) => record.kind === "quarantine") ??
        nextLocations[0])
      : (nextLocations.find((record) => record.kind === "storage") ??
        nextLocations.find((record) => record.kind === "controlled") ??
        nextLocations[0]);
    setDestinationId(nextLocation?.id ?? "");
    setAreaId(nextLocation?.areas[0] ?? "");
  };
  useEffect(() => {
    if (!lookupLot || !item?.id || !displayedLot.trim()) return;
    const controller = new AbortController();
    let current = true;
    const key = lookupKey;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        view: "receiving_lookup",
        product_id: item.id,
        lot_number: displayedLot.trim(),
      });
      void api<{ data: InventoryReceivingLotLookup }>(
        `/api/clinic/inventory/lots?${params}`,
        { signal: controller.signal },
      )
        .then((payload) => {
          if (!current) return;
          setLotLookup({ key, data: payload.data });
          if (payload.data.lot)
            setExpirationDate(payload.data.lot.expiration_date);
          if (payload.data.recalls.length > 0) {
            setDestinationId(
              data.locations.find((location) => location.kind === "quarantine")
                ?.id ?? "",
            );
            setAreaId("");
          }
        })
        .catch((reason: unknown) => {
          if (!current) return;
          setLotLookup({
            key,
            data: { lot: null, recalls: [] },
            error:
              reason instanceof Error
                ? reason.message
                : "Unable to check this lot.",
          });
        });
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lookupLot, item?.id, displayedLot, lotLookupAttempt]);
  if (!shipment || !order || !line || !item)
    return (
      <Card title="Receiving">
        <p>No open shipment is available.</p>
      </Card>
    );
  const countsValid = [
    packages,
    missingPackages,
    rejectedPackages,
    excessPackages,
  ].every(
    (value) =>
      /^\d+(?:\.0+)?$/.test(value) && decimalCompare(value, "1000000") <= 0,
  );
  const hasDiscrepancy =
    countsValid &&
    [missingPackages, rejectedPackages, excessPackages].some(
      (value) => decimalCompare(value, "0") > 0,
    );
  const accepted = countsValid && decimalCompare(packages, "0") > 0;
  const balanced =
    countsValid &&
    decimalCompare(
      decimalSum([packages, missingPackages, rejectedPackages]),
      allocation?.expected_packages ?? "0",
    ) === 0;
  const confirm = () =>
    void run(
      "/api/clinic/inventory/receipts",
      {
        receipt: {
          purchase_order_id: order.id,
          shipment_id: shipment.id,
          purchase_order_line_id: line.id,
          lot_number: lotNumber.trim(),
          expiration_date: expirationDate,
          quantity_packages: packages,
          destination_location: destination?.name,
          ...(areaId ? { area_id: areaId } : {}),
          ...(temperature ? { temperature_c: temperature } : {}),
          ...(recall && accepted
            ? {
                recall_id: recall.id,
                exception: "recall_match",
                disposition: "quarantine_recall",
                status: "quarantined",
              }
            : { status: "received" }),
          ...(hasDiscrepancy
            ? {
                reconciliation: {
                  missing_packages: missingPackages,
                  rejected_packages: rejectedPackages,
                  excess_packages: excessPackages,
                  exception: exceptionKind,
                },
              }
            : {}),
          reason,
        },
      },
      hasDiscrepancy ? "Delivery reconciled" : "Receipt recorded",
      `${number(packages)} ${packageUnit} accepted${accepted ? ` into ${destination?.name}` : ""}.`,
    );
  return (
    <div className="inventory-two-col wide-left">
      <Card>
        <div className="inventory-card-heading">
          {lookupLot ? (
            <DataPoint label="Shipment" value={shipment.supplier_reference} />
          ) : (
            <Field label="Shipment">
              <select
                value={shipment.id}
                onChange={(event) => {
                  const selected = data.shipments.find(
                    (record) => record.id === event.target.value,
                  );
                  const selectedOrder = data.purchase_orders.find(
                    (record) => record.id === selected?.po_id,
                  );
                  setShipmentId(event.target.value);
                  const selectedAllocations = selected?.allocations ?? [];
                  const selectedLine = selectedOrder?.lines.find((candidate) =>
                    selectedAllocations.some(
                      (entry) => entry.purchase_order_line_id === candidate.id,
                    ),
                  );
                  const selectedLots = data.lots.filter(
                    (record) => record.product_id === selectedLine?.product_id,
                  );
                  const nextLot =
                    selectedLots.find(
                      (record) => record.status === "recalled",
                    ) ?? selectedLots[0];
                  setLineId(selectedLine?.id ?? "");
                  selectLot(
                    nextLot?.lot_number ?? "",
                    selectedLine?.product_id,
                  );
                  setPackages(
                    selected?.reconciliation?.accepted_packages ??
                      selectedAllocations.find(
                        (entry) =>
                          entry.purchase_order_line_id === selectedLine?.id,
                      )?.expected_packages ??
                      "1",
                  );
                  setMissingPackages(
                    selected?.reconciliation?.missing_packages ?? "0",
                  );
                  setRejectedPackages(
                    selected?.reconciliation?.rejected_packages ?? "0",
                  );
                  setExcessPackages(
                    selected?.reconciliation?.excess_packages ?? "0",
                  );
                  setExceptionKind(
                    selected?.reconciliation?.exception ?? "short_delivery",
                  );
                  setReason("");
                }}
              >
                {data.shipments.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.supplier_reference}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {allocatedLines.length > 1 && (
            <Field label="Purchase-order line">
              <select
                value={line.id}
                onChange={(event) => {
                  const nextLineId = event.target.value;
                  const nextLine = allocatedLines.find(
                    (record) => record.id === nextLineId,
                  );
                  const nextLots = data.lots.filter(
                    (record) => record.product_id === nextLine?.product_id,
                  );
                  const nextLot =
                    nextLots.find((record) => record.status === "recalled") ??
                    nextLots[0];
                  setLineId(nextLineId);
                  selectLot(nextLot?.lot_number ?? "", nextLine?.product_id);
                  setPackages(
                    allocations.find(
                      (entry) => entry.purchase_order_line_id === nextLineId,
                    )?.expected_packages ?? "1",
                  );
                }}
              >
                {allocatedLines.map((record) => (
                  <option key={record.id} value={record.id}>
                    {product(data, record.product_id)?.name ?? record.id}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <div className="inventory-panel-heading">
          <div>
            <h2>Shipment {shipment.supplier_reference}</h2>
            <p className="inventory-lead">
              {order.number} · delivered{" "}
              {inventoryDateTime(shipment.delivered_at, data.timezone)}
            </p>
          </div>
          <Badge tone={receipt?.status === "quarantined" ? "warning" : "blue"}>
            {shipment.reconciliation
              ? "Reconciled with discrepancy"
              : (receipt?.status ?? shipment.status)}
          </Badge>
        </div>
        {shipment.reconciliation && (
          <Alert severity="info">
            {number(shipment.reconciliation.accepted_packages)} accepted,{" "}
            {number(shipment.reconciliation.missing_packages)} missing,{" "}
            {number(shipment.reconciliation.rejected_packages)} rejected and{" "}
            {number(shipment.reconciliation.excess_packages)} excess packages
            refused. {shipment.reconciliation.reason}
          </Alert>
        )}
        {recall && accepted && (
          <div className="inventory-warning" role="alert">
            <strong>Recall match: {recall.reference}</strong>
            <p>This lot must be received into a quarantine location.</p>
          </div>
        )}
        <div className="inventory-data-grid two">
          <Field label="Product / package">
            <input
              value={`${item.name} · ${number(line.units_per_package)} ${baseUnit} per ordered ${packageUnit}`}
              readOnly
            />
          </Field>
          <Field label="Lot number">
            <input
              value={displayedLot}
              readOnly={!!shipment.reconciliation}
              onChange={(event) => selectLot(event.target.value)}
            />
          </Field>
          <Field label="Expiration">
            <input
              type="date"
              value={
                shipment.reconciliation
                  ? (recordedObservation?.expires_on ?? "")
                  : expirationDate
              }
              readOnly={!!shipment.reconciliation}
              onChange={(event) => setExpirationDate(event.target.value)}
            />
          </Field>
          <TextField
            size="small"
            label={`Accepted (${packageUnit})`}
            value={packages}
            disabled={busy || !!receipt || !!shipment.reconciliation}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            onChange={(event) => setPackages(event.target.value)}
            helperText={
              countsValid
                ? `${number(decimalMultiply(packages, line.units_per_package))} ${baseUnit} will enter inventory`
                : "Enter whole package counts."
            }
          />
          <TextField
            size="small"
            label="Missing packages"
            value={missingPackages}
            disabled={busy || !!receipt || !!shipment.reconciliation}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            onChange={(event) => setMissingPackages(event.target.value)}
          />
          <TextField
            size="small"
            label="Rejected packages"
            value={rejectedPackages}
            disabled={busy || !!receipt || !!shipment.reconciliation}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            onChange={(event) => setRejectedPackages(event.target.value)}
            helperText="Expected packages refused at receiving; no stock is added."
          />
          <TextField
            size="small"
            label="Excess packages refused"
            value={excessPackages}
            disabled={busy || !!receipt || !!shipment.reconciliation}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
            onChange={(event) => setExcessPackages(event.target.value)}
            helperText="Additional unaccepted packages beyond this delivery allocation."
          />
          {hasDiscrepancy && (
            <TextField
              select
              size="small"
              label="Discrepancy"
              value={exceptionKind}
              disabled={busy || !!receipt || !!shipment.reconciliation}
              onChange={(event) => setExceptionKind(event.target.value)}
            >
              {[
                ["short_delivery", "Short delivery"],
                ["damaged", "Damaged goods"],
                ["wrong_item", "Wrong item"],
                ["wrong_lot", "Wrong lot"],
                ["temperature", "Temperature exception"],
                ["expiry", "Expiry exception"],
                ["excess", "Excess delivery"],
                ["other", "Other discrepancy"],
              ].map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Field label="Temperature (°C)">
            <input
              value={
                shipment.reconciliation
                  ? (recordedObservation?.temperature_c ?? "")
                  : temperature
              }
              readOnly={!!shipment.reconciliation}
              onChange={(event) => setTemperature(event.target.value)}
            />
          </Field>
          <Field label="Destination">
            <select
              value={destination?.id ?? ""}
              onChange={(event) => {
                const selected = data.locations.find(
                  (record) => record.id === event.target.value,
                );
                setDestinationId(event.target.value);
                setAreaId(selected?.areas[0] ?? "");
              }}
            >
              {eligibleLocations.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.name}
                </option>
              ))}
            </select>
          </Field>
          {destination && destination.areas.length > 0 && (
            <Field label="Area">
              <select
                value={areaId}
                onChange={(event) => setAreaId(event.target.value)}
              >
                {destination.areas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Reason">
            <input
              value={shipment.reconciliation?.reason ?? reason}
              readOnly={!!shipment.reconciliation}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </div>
        {!balanced && (
          <Alert severity="warning">
            Accepted + missing + rejected packages must equal{" "}
            {number(allocation?.expected_packages ?? "0")} expected packages.
          </Alert>
        )}
        <div className="inventory-form-actions">
          <PermissionNote
            allowed={capability(data, "inventory.receive")}
            permission="inventory.receive"
          />
          {lookupLot &&
            displayedLot.trim() &&
            !lookupReady &&
            (lookupMatches && lotLookup?.error ? (
              <Alert
                severity="error"
                action={
                  <Button
                    onClick={() => {
                      setLotLookup(undefined);
                      setLotLookupAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Retry lot check
                  </Button>
                }
              >
                {lotLookup.error} Check this lot before accepting stock.
              </Alert>
            ) : (
              <p role="status">Checking lot expiry and recall records…</p>
            ))}
          <ConfirmButton
            disabled={
              busy ||
              !!receipt ||
              !!shipment.reconciliation ||
              !capability(data, "inventory.receive") ||
              (accepted &&
                (!destination ||
                  !lotNumber.trim() ||
                  !expirationDate ||
                  !lookupReady)) ||
              !reason.trim() ||
              !allocation ||
              !balanced
            }
            onConfirm={confirm}
            confirmationTitle={
              hasDiscrepancy
                ? "Reconcile this delivery?"
                : "Confirm this receipt?"
            }
            confirmationContent={
              <p>
                {number(packages)} packages accepted; {number(missingPackages)}{" "}
                missing; {number(rejectedPackages)} rejected;{" "}
                {number(excessPackages)} excess refused. Only accepted packages
                enter inventory. Missing and rejected packages remain
                outstanding on the PO.
              </p>
            }
          >
            {shipment.reconciliation
              ? "Delivery reconciled"
              : receipt
                ? "Receipt recorded"
                : hasDiscrepancy
                  ? "Reconcile delivery"
                  : "Confirm receipt"}
          </ConfirmButton>
        </div>
        {receiptLine && (
          <p className="inventory-success-line">
            Recorded: {number(receiptLine.quantity_packages)} {packageUnit} /{" "}
            {number(receiptLine.quantity_units)} {baseUnit}
            {receiptLine.area_id ? ` at ${receiptLine.area_id}` : ""}.
          </p>
        )}
      </Card>
      <Card title="Receipt reconciliation">
        <div className="inventory-stack compact">
          <DataPoint
            label="PO ordered"
            value={`${number(line.ordered_packages)} ${packageUnit} · ${number(line.ordered_units)} ${baseUnit}`}
          />
          <DataPoint
            label="Shipment delivered"
            value={`${shipment.package_count} ${packageUnit} · ${number(shipment.expected_units)} ${baseUnit}`}
          />
          <DataPoint
            label="This receipt"
            value={
              countsValid
                ? `${number(packages)} ${packageUnit} · ${number(decimalMultiply(packages, line.units_per_package))} ${baseUnit}`
                : "Enter whole package counts"
            }
          />
          <DataPoint
            label="PO remaining"
            value={`${number(nonNegative(decimalSubtract(line.ordered_packages, line.received_packages)))} ${packageUnit} · ${number(nonNegative(decimalSubtract(line.ordered_units, line.received_units)))} ${baseUnit}`}
          />
          {recall && (
            <DataPoint
              label="Disposition"
              value={recall.required_disposition}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function LotsScreen({
  data,
  busy,
  run,
  loading,
  readBlocked,
  error,
  onRead,
}: {
  data: InventoryStockData;
  loading: boolean;
  readBlocked: boolean;
  error: string;
  onRead: (read: InventoryStockRead) => Promise<void>;
  busy: boolean;
  run: (
    endpoint: string,
    body: Record<string, unknown>,
    title: string,
    detail: string,
  ) => Promise<void>;
}) {
  const page = data.stock_page;
  const [query, setQuery] = useState(page.query);
  const applied = { q: page.query, stock_status: page.status, page: page.page };
  const [selectedId, setSelectedId] = useState(
    () => balanceFor(data)?.id ?? "",
  );
  const [action, setAction] = useState<"transfer" | "adjust" | "count">(
    "transfer",
  );
  const [quantity, setQuantity] = useState<Decimal>("1");
  const [destination, setDestination] = useState(
    data.locations.find((item) => item.kind === "returns")?.id ??
      data.locations[0]?.id ??
      "",
  );
  const [reason, setReason] = useState("");
  const selected = balanceFor(data, selectedId);
  const selectedLot = selected ? lot(data, selected.lot_id) : undefined;
  const selectedProduct = selected
    ? product(data, selected.product_id)
    : undefined;
  const selectedLocation = selected
    ? location(data, selected.location_id)
    : undefined;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !selectedProduct) return;
    if (action === "transfer")
      void run(
        `/api/clinic/inventory/lots/${selected.lot_id}/transfer`,
        {
          transfer: {
            source_batch_id: selected.id.replace("bal_", ""),
            destination_location_id: destination,
            quantity,
            reason,
          },
        },
        "Transfer posted",
        `${number(quantity)} ${selectedProduct.base_unit} were posted as an equal out/in pair.`,
      );
    else if (action === "adjust")
      void run(
        `/api/clinic/inventory/lots/${selected.lot_id}/adjust`,
        {
          adjustment: {
            lot_id: selected.lot_id,
            location_id: selected.location_id,
            delta_units: quantity,
            reason,
          },
        },
        "Adjustment posted",
        "Inventory adjusted.",
      );
    else
      void run(
        `/api/clinic/inventory/lots/${selected.lot_id}/count`,
        {
          count: {
            lot_id: selected.lot_id,
            location_id: selected.location_id,
            counted_units: quantity,
            reason,
          },
        },
        "Cycle count posted",
        "Cycle count recorded.",
      );
  };
  const blocked =
    !selected ||
    !selectedLot ||
    decimalCompare(selected.available_units, "0") === 0 ||
    selectedLot.status !== "active";
  return (
    <div className="inventory-stack" aria-busy={loading}>
      <Card title="Find stock positions">
        {page.product_name && (
          <p>
            Product: {page.product_name}.{" "}
            <a href="/clinic/inventory/lots">View all products</a>
          </p>
        )}
        <form
          className="inventory-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (!loading && !busy && !readBlocked)
              void onRead({ ...applied, q: query.trim(), page: 1 });
          }}
        >
          <TextField
            label="Search stock"
            size="small"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Product, lot, location"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            label="Stock status"
            size="small"
            value={page.status}
            disabled={loading || busy || readBlocked}
            onChange={(event) =>
              void onRead({
                ...applied,
                stock_status: event.target.value as typeof page.status,
                page: 1,
              })
            }
          >
            <MenuItem value="all">All positions</MenuItem>
            <MenuItem value="available">Available stock</MenuItem>
            <MenuItem value="held">Held stock</MenuItem>
            <MenuItem value="expired">Expired stock</MenuItem>
          </TextField>
          <Button
            type="submit"
            variant="outlined"
            disabled={loading || busy || readBlocked}
          >
            Search stock
          </Button>
          {(page.query || page.status !== "all") && (
            <Button
              type="button"
              variant="outlined"
              disabled={loading || busy || readBlocked}
              onClick={() =>
                void onRead({ q: "", stock_status: "all", page: 1 })
              }
            >
              Reset filters
            </Button>
          )}
        </form>
        <p role="status">
          {loading
            ? "Loading stock…"
            : `${data.balances.length} shown · ${page.filtered_count} matching of ${page.total_count} stock positions.`}
        </p>
        {error && (
          <Alert severity="error">
            {error} The previous stock page remains visible.
          </Alert>
        )}
      </Card>
      <div className="inventory-metrics">
        {data.unit_totals.map((total) => (
          <Metric
            key={total.stock_unit}
            label={`${total.stock_unit} available`}
            value={number(total.available_units)}
            detail={`${number(total.on_hand_units)} on hand · ${number(total.unavailable_units)} unavailable across all matching positions`}
          />
        ))}
      </div>
      <Card title="Lot balances">
        {data.balances.length === 0 && (
          <p role="status">
            No stock positions match this view. Change the filters or receive
            stock.
          </p>
        )}
        <div className="inventory-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product / lot</th>
                <th>Location</th>
                <th>On hand</th>
                <th>Available</th>
                <th>Status</th>
                <th>Trace</th>
              </tr>
            </thead>
            <tbody>
              {data.balances.map((balance) => {
                const item = product(data, balance.product_id)!;
                const lotItem = lot(data, balance.lot_id)!;
                const loc = location(data, balance.location_id)!;
                return (
                  <tr
                    key={balance.id}
                    className={balance.id === selected?.id ? "selected" : ""}
                  >
                    <td>
                      <Button
                        type="button"
                        disabled={busy || loading || readBlocked}
                        sx={{
                          textTransform: "none",
                          textAlign: "left",
                          justifyContent: "flex-start",
                        }}
                        onClick={() => {
                          setSelectedId(balance.id);
                          setQuantity("1");
                          setReason("");
                        }}
                      >
                        {item.name}
                      </Button>
                      <small>
                        Lot {lotItem.lot_number} · expires{" "}
                        {inventoryDate(lotItem.expiration_date, data.timezone)}
                      </small>
                    </td>
                    <td>
                      {loc.name}
                      <small>{loc.areas[0]}</small>
                    </td>
                    <td className="numeric">{number(balance.on_hand_units)}</td>
                    <td className="numeric">
                      {number(balance.available_units)}
                    </td>
                    <td>
                      <Badge
                        tone={
                          lotItem.status === "active" ? "success" : "danger"
                        }
                      >
                        {lotItem.status}
                      </Badge>
                    </td>
                    <td>
                      <a
                        href={`/clinic/inventory/activity?lot_id=${balance.lot_id}`}
                      >
                        View ledger
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {page.page_count > 1 && (
        <nav className="inventory-pagination" aria-label="Stock pagination">
          <Button
            variant="outlined"
            disabled={loading || busy || readBlocked || page.page === 1}
            onClick={() => void onRead({ ...applied, page: page.page - 1 })}
          >
            Previous
          </Button>
          <span>
            Page {page.page} of {page.page_count}
          </span>
          <Button
            variant="outlined"
            disabled={
              loading || busy || readBlocked || page.page === page.page_count
            }
            onClick={() => void onRead({ ...applied, page: page.page + 1 })}
          >
            Next
          </Button>
        </nav>
      )}
      {selected && selectedLot && selectedProduct && selectedLocation && (
        <div className="inventory-two-col wide-left">
          <Card
            title={`${selectedProduct.name} · Lot ${selectedLot.lot_number}`}
          >
            <div className="inventory-data-grid four">
              <DataPoint label="Location" value={selectedLocation.name} />
              <DataPoint
                label="On hand"
                value={`${number(selected.on_hand_units)} ${selectedProduct.base_unit}`}
              />
              <DataPoint
                label="Held"
                value={`${number(selected.held_units)} ${selectedProduct.base_unit}`}
                tone="warning"
              />
              <DataPoint
                label="Expires"
                value={inventoryDate(
                  selectedLot.expiration_date,
                  data.timezone,
                )}
              />
            </div>
            <div className="inventory-form-actions">
              <button
                className={`inventory-button ${action === "transfer" ? "primary" : "outline"}`}
                type="button"
                onClick={() => setAction("transfer")}
              >
                Transfer
              </button>
              <button
                className={`inventory-button ${action === "adjust" ? "primary" : "outline"}`}
                type="button"
                onClick={() => setAction("adjust")}
              >
                Adjust
              </button>
              <button
                className={`inventory-button ${action === "count" ? "primary" : "outline"}`}
                type="button"
                onClick={() => setAction("count")}
              >
                Cycle count
              </button>
            </div>
            <form className="inventory-form-grid" onSubmit={submit}>
              <Field
                label={
                  action === "count"
                    ? "Counted units"
                    : `Quantity / delta (${selectedProduct.base_unit})`
                }
              >
                <input
                  type="number"
                  min={action === "count" ? 0 : 1}
                  value={quantity}
                  step="any"
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </Field>
              {action === "transfer" && (
                <Field label="Destination">
                  <select
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                  >
                    {data.locations
                      .filter((item) => item.id !== selected.location_id)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <Field label="Reason">
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <div className="inventory-form-actions">
                <PermissionNote
                  allowed={capability(
                    data,
                    action === "transfer"
                      ? "inventory.transfer"
                      : action === "count"
                        ? "inventory.count"
                        : "inventory.adjust",
                  )}
                  permission={
                    action === "transfer"
                      ? "inventory.transfer"
                      : action === "count"
                        ? "inventory.count"
                        : "inventory.adjust"
                  }
                />
                <ConfirmButton
                  disabled={
                    busy ||
                    (action === "transfer" && blocked) ||
                    (action !== "count" &&
                      decimalCompare(quantity || "0", "0") <= 0) ||
                    !capability(
                      data,
                      action === "transfer"
                        ? "inventory.transfer"
                        : action === "count"
                          ? "inventory.count"
                          : "inventory.adjust",
                    )
                  }
                  onConfirm={() => {
                    const fake = new Event("submit") as unknown as FormEvent;
                    submit(fake);
                  }}
                >
                  Post {action}
                </ConfirmButton>
              </div>
            </form>
          </Card>
          <Card title="Selected balance">
            <div className="inventory-stack compact">
              <DataPoint
                label="Available"
                value={`${number(selected.available_units)} ${selectedProduct.base_unit}`}
              />
              <p
                className={
                  blocked ? "inventory-danger-text" : "inventory-success-line"
                }
              >
                {blocked
                  ? "Action blocked: held, recalled, or unavailable stock cannot transfer."
                  : "Available for transfer."}
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export function ActivityScreen({
  data,
  loading = false,
  error = "",
  onRead,
}: {
  data: InventoryActivityData;
  loading?: boolean;
  error?: string;
  onRead: (query: { q?: string; before?: string | null }) => Promise<void>;
}) {
  const page = data.activity_page;
  const [filter, setFilter] = useState(page.query);
  useEffect(() => setFilter(page.query), [page.query]);
  const normalizedFilter = page.query;
  const rows = data.movements;
  const viewState =
    page.before_cursor && rows.length === 0 && page.filtered_count > 0
      ? "page_empty"
      : page.lot_id && rows.length === 0 && !page.query
        ? "lot_empty"
        : inventoryMovementViewState(page.total_count, rows.length, page.query);
  const search = (event: FormEvent) => {
    event.preventDefault();
    if (!loading) void onRead({ q: filter.trim() });
  };
  return (
    <div className="inventory-stack" aria-busy={loading}>
      <Card title="Activity ledger">
        {page.lot_number && (
          <p>
            Lot {page.lot_number}.{" "}
            <a href="/clinic/inventory/activity">View full ledger</a>
          </p>
        )}
        <div className="inventory-card-heading inventory-ledger-toolbar">
          <form onSubmit={search}>
            <TextField
              size="small"
              label="Filter ledger"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Type, reason, source"
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            <Button
              sx={{ minHeight: 40, textTransform: "none" }}
              type="submit"
              variant="outlined"
              disabled={loading}
            >
              Search ledger
            </Button>
          </form>
          <div className="inventory-ledger-summary">
            <p className="inventory-results-count" role="status">
              {loading
                ? "Loading movements…"
                : `${rows.length} shown · ${page.filtered_count} matching of ${page.total_count} recorded movements.`}
              {normalizedFilter && ` Search: ${normalizedFilter}.`}
            </p>
            {normalizedFilter && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<ClearRoundedIcon />}
                type="button"
                disabled={loading}
                onClick={() => {
                  setFilter("");
                  void onRead({ q: "" });
                }}
                sx={{
                  minHeight: 40,
                  borderColor: "var(--inventory-control)",
                  color: "var(--inventory-blue)",
                  textTransform: "none",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                Clear filter
              </Button>
            )}
          </div>
        </div>
        {error && (
          <Alert severity="error">
            {error} The previous ledger page remains visible.
          </Alert>
        )}
        {viewState === "results" ? (
          <div className="inventory-table-wrap">
            <table>
              <caption className="sr-only">Inventory movement ledger</caption>
              <thead>
                <tr>
                  <th>Occurred</th>
                  <th>Type</th>
                  <th>Lot / location</th>
                  <th>Quantity</th>
                  <th>Reason / source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {inventoryDateTime(item.occurred_at, data.timezone)}
                    </td>
                    <td>
                      <Badge
                        tone={item.direction === "out" ? "warning" : "blue"}
                      >
                        {item.type}
                      </Badge>
                    </td>
                    <td>
                      <strong>Lot {item.lot_number}</strong>
                      <small>{item.location_name}</small>
                    </td>
                    <td className="numeric">
                      {item.direction === "out" ? "−" : "+"}
                      {number(item.quantity_units)} {item.stock_unit}
                    </td>
                    <td>
                      <span>{item.reason}</span>
                      <small className="mono">{item.source_id}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="inventory-empty-state" role="status">
            <strong>
              {viewState === "filtered_empty"
                ? `No movements match “${page.query}”.`
                : viewState === "lot_empty"
                  ? "No movements recorded for this lot"
                  : viewState === "page_empty"
                    ? "No older movements"
                    : "No movements recorded"}
            </strong>
            <p>
              {viewState === "filtered_empty"
                ? "Clear the search filter to review recorded movements."
                : viewState === "page_empty"
                  ? "Return to the newest movements to continue reviewing the ledger."
                  : "Recorded stock receipts, transfers, adjustments, and counts will appear here with their source."}
            </p>
          </div>
        )}
        <div className="inventory-form-actions">
          <Button
            sx={{ minHeight: 40, textTransform: "none" }}
            variant="outlined"
            disabled={loading || !page.before_cursor}
            onClick={() => void onRead({ q: page.query })}
          >
            Newest movements
          </Button>
          <Button
            sx={{ minHeight: 40, textTransform: "none" }}
            variant="outlined"
            disabled={loading || !page.next_cursor}
            onClick={() =>
              void onRead({ q: page.query, before: page.next_cursor })
            }
          >
            Older movements
          </Button>
        </div>
      </Card>
    </div>
  );
}

function RecallScreen({
  data,
  busy,
  run,
}: {
  data: InventoryData;
  busy: boolean;
  run: (
    endpoint: string,
    body: Record<string, unknown>,
    title: string,
    detail: string,
  ) => Promise<void>;
}) {
  const [recallId, setRecallId] = useState(data.recalls[0]?.id ?? "");
  const recall =
    data.recalls.find((record) => record.id === recallId) ?? data.recalls[0];
  const item = recall && product(data, recall.product_id);
  const recallLotIds = recall
    ? data.lots
        .filter((record) => recall.lot_numbers.includes(record.lot_number))
        .map((record) => record.id)
    : [];
  const recallBalances = recallSelectableBalances(
    data.balances,
    recall?.id ?? "",
    recallLotIds,
  );
  const [balanceId, setBalanceId] = useState("");
  const batch =
    recallBalances.find((record) => record.id === balanceId) ??
    recallBalances[0];
  const recalledLot = batch && lot(data, batch.lot_id);
  const batchLocation = batch && location(data, batch.location_id);
  const viewState = recallViewState(recall, Boolean(batch));
  const [quantity, setQuantity] = useState<Decimal>(batch?.held_units ?? "0");
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  if (!recall || !item)
    return (
      <Card title="Recalls and disposition">
        <p>No recall records are available.</p>
      </Card>
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!batch) return;
    void run(
      `/api/clinic/inventory/recalls/${recall.id}/disposition`,
      {
        disposition: {
          batch_id: batch.id.replace("bal_", ""),
          quantity_units: quantity,
          method: recall.required_disposition,
          evidence_reference: evidence,
          reason: reason.trim(),
        },
      },
      "Disposition recorded",
      `${number(quantity)} ${item.base_unit} recorded.`,
    );
  };
  const stages = [
    "identified",
    "inventory locked",
    "location sweep",
    "isolated",
    "disposition pending",
    "disposition complete",
    "closed",
  ];
  return (
    <div className="inventory-two-col wide-left">
      <div className="inventory-stack">
        <Card className="recall-card">
          <div className="inventory-card-heading">
            {data.recalls.length > 1 && (
              <Field label="Recall">
                <select
                  value={recall.id}
                  onChange={(event) => {
                    const selected = data.recalls.find(
                      (record) => record.id === event.target.value,
                    );
                    const lotIds = selected
                      ? data.lots
                          .filter((record) =>
                            selected.lot_numbers.includes(record.lot_number),
                          )
                          .map((record) => record.id)
                      : [];
                    const selectedBalance = recallSelectableBalances(
                      data.balances,
                      event.target.value,
                      lotIds,
                    )[0];
                    setRecallId(event.target.value);
                    setBalanceId(selectedBalance?.id ?? "");
                    setQuantity(selectedBalance?.held_units ?? "0");
                    setEvidence("");
                  }}
                >
                  {data.recalls.map((record) => (
                    <option key={record.id} value={record.id}>
                      {record.reference}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {recallBalances.length > 1 && (
              <Field label="Lot / location">
                <select
                  value={batch.id}
                  onChange={(event) => {
                    const selected = recallBalances.find(
                      (record) => record.id === event.target.value,
                    );
                    setBalanceId(event.target.value);
                    setQuantity(selected?.held_units ?? "0");
                  }}
                >
                  {recallBalances.map((record) => (
                    <option key={record.id} value={record.id}>
                      {lot(data, record.lot_id)?.lot_number} ·{" "}
                      {location(data, record.location_id)?.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <div className="inventory-panel-heading">
            <div>
              <Badge tone={viewState.showComplete ? "success" : "danger"}>
                {recall.status.replaceAll("_", " ")}
              </Badge>
              <h2>{recall.reference}</h2>
              <p className="inventory-lead">
                {item.name} · lot{" "}
                {recalledLot?.lot_number ?? "No exact held lot"}
              </p>
            </div>
            <div className="inventory-date">
              <small>Effective</small>
              <strong>
                {inventoryDate(recall.effective_at, data.timezone)}
              </strong>
            </div>
          </div>
          <div className="inventory-data-grid four">
            <DataPoint
              label="Affected"
              value={`${number(recall.affected_units)} ${item.base_unit}`}
            />
            <DataPoint
              label="Held now"
              value={
                batch
                  ? `${number(recall.held_units)} ${item.base_unit}`
                  : "Not held for this recall"
              }
              tone="warning"
            />
            <DataPoint
              label="Location"
              value={batchLocation?.name ?? "Location not recorded"}
            />
            <DataPoint
              label="Available"
              value={
                batch
                  ? `${number(batch.available_units)} ${item.base_unit}`
                  : "Not held"
              }
              tone={batch ? "danger" : ""}
            />
          </div>
          <p className="inventory-info">
            <strong>Required disposition:</strong>{" "}
            {recall.required_disposition.replaceAll("_", " ")}
            <br />
            {recall.reason}
          </p>
        </Card>
        <Card title="Recall workflow">
          <div className="inventory-timeline recall">
            {stages.map((stage, index) => (
              <div
                key={stage}
                className={index <= viewState.workflowStage ? "done" : ""}
              >
                <span>{index + 1}</span>
                {stage}
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card title="Record disposition">
        {!batch ? (
          <div className="inventory-info">
            <strong>No exact active hold for this recall</strong>
            <p>
              This recall is recorded, but no selectable balance is currently
              held for it. Choose another recall to review its exact held
              balance; no disposition can be recorded here.
            </p>
          </div>
        ) : viewState.showComplete ? (
          <div className="inventory-success-box">
            <strong>Final disposition complete</strong>
            <p>
              No held units remain. Return evidence is recorded and this lot
              remains unavailable.
            </p>
            <code>{recall.evidence_reference}</code>
          </div>
        ) : (
          <form className="inventory-stack compact" onSubmit={submit}>
            <Field label={`Quantity (${item.base_unit})`}>
              <input
                type="number"
                min={1}
                max={batch.held_units}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
            <Field label="Evidence / return reference">
              <textarea
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
                placeholder="Required supplier RMA or evidence reference"
              />
            </Field>
            <Field label="Disposition reason">
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
              />
            </Field>
            <PermissionNote
              allowed={capability(data, "recall.dispose")}
              permission="recall.dispose"
            />
            <ConfirmButton
              tone="danger"
              disabled={
                busy ||
                !capability(data, "recall.dispose") ||
                !evidence.trim() ||
                !reason.trim() ||
                decimalCompare(quantity || "0", "0") <= 0 ||
                decimalCompare(quantity || "0", batch.held_units) > 0
              }
              onConfirm={() => {
                const fake = new Event("submit") as unknown as FormEvent;
                submit(fake);
              }}
            >
              Approve and record disposition
            </ConfirmButton>
          </form>
        )}
      </Card>
    </div>
  );
}

function ControlledScreen({
  data,
  busy,
  run,
}: {
  data: InventoryData;
  busy: boolean;
  run: (
    endpoint: string,
    body: Record<string, unknown>,
    title: string,
    detail: string,
  ) => Promise<void>;
}) {
  const [reconciliationId, setReconciliationId] = useState(
    data.controlled_reconciliations[0]?.id ?? "",
  );
  const reconciliation =
    data.controlled_reconciliations.find(
      (record) => record.id === reconciliationId,
    ) ?? data.controlled_reconciliations[0];
  const item = reconciliation && product(data, reconciliation.product_id);
  const selectedLot = reconciliation && lot(data, reconciliation.lot_id);
  const selectedLocation =
    reconciliation && location(data, reconciliation.location_id);
  const [note, setNote] = useState("");
  if (!reconciliation || !item || !selectedLot || !selectedLocation)
    return (
      <Card title="Controlled reconciliation">
        <p>No controlled count is available.</p>
      </Card>
    );
  const unresolved =
    reconciliation.status !== "resolved" &&
    reconciliation.status !== "certified";
  const investigate = () =>
    void run(
      `/api/clinic/inventory/controlled/${reconciliation.count_id}/investigate`,
      { review: { reason: note } },
      "Variance resolved",
      "Variance resolved. A separate reviewer may now certify.",
    );
  const certify = () =>
    void run(
      `/api/clinic/inventory/controlled/${reconciliation.count_id}/certify`,
      { review: { reason: note.trim() } },
      "Reconciliation certified",
      "Reconciliation certified.",
    );
  return (
    <div className="inventory-two-col wide-left">
      <div className="inventory-stack">
        <Card>
          {data.controlled_reconciliations.length > 1 && (
            <div className="inventory-card-heading">
              <Field label="Reconciliation">
                <select
                  value={reconciliation.id}
                  onChange={(event) => {
                    setReconciliationId(event.target.value);
                    setNote("");
                  }}
                >
                  {data.controlled_reconciliations.map((record) => (
                    <option key={record.id} value={record.id}>
                      {product(data, record.product_id)?.name} ·{" "}
                      {lot(data, record.lot_id)?.lot_number}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          <div className="inventory-panel-heading">
            <div>
              <div className="inventory-title-row">
                {item.schedule && <Badge tone="danger">{item.schedule}</Badge>}
                <Badge tone="blue">
                  {reconciliation.status.replaceAll("_", " ")}
                </Badge>
              </div>
              <h2>{item.name}</h2>
              <p className="inventory-lead">
                NDC {item.ndc} · lot {selectedLot.lot_number} ·{" "}
                {selectedLocation.name}
              </p>
            </div>
            <div className="inventory-date">
              <small>Counted</small>
              <strong>
                {inventoryDateTime(reconciliation.counted_at, data.timezone)}
              </strong>
            </div>
          </div>
          <div className="inventory-data-grid three">
            <DataPoint
              label="Expected"
              value={`${number(reconciliation.expected_units)} ${item.base_unit}`}
            />
            <DataPoint
              label="Counted"
              value={`${number(reconciliation.counted_units)} ${item.base_unit}`}
            />
            <DataPoint
              label="Variance"
              value={`${decimalCompare(reconciliation.variance_units, "0") > 0 ? "+" : ""}${number(reconciliation.variance_units)} ${item.base_unit}`}
              tone={
                decimalCompare(reconciliation.variance_units, "0") === 0
                  ? "success"
                  : "danger"
              }
            />
          </div>
          <div className="inventory-data-grid two">
            <DataPoint
              label="Counter"
              value={
                data.users.find((user) => user.id === reconciliation.counter_id)
                  ?.name ?? "Recorded operator"
              }
            />
          </div>
        </Card>
        {unresolved ? (
          <div className="inventory-warning strong" role="alert">
            <strong>
              Certification blocked: unresolved{" "}
              {number(reconciliation.variance_units)} {item.base_unit} variance
            </strong>
            <p>
              An authorized reviewer must investigate and post an adjustment
              before certification.
            </p>
          </div>
        ) : (
          <div className="inventory-success-box">
            <strong>Variance resolved</strong>
            <p>
              Expected and counted quantities now agree. Certification is
              available to a separate authorized reviewer.
            </p>
          </div>
        )}
        <Card title="Separation-of-duties trail">
          <ol className="inventory-trail">
            <li className="done">
              <strong>Count recorded</strong>
              <span>
                {number(reconciliation.counted_units)} {item.base_unit} counted.
              </span>
            </li>
            <li className={reconciliation.investigation_note ? "done" : ""}>
              <strong>Variance investigated and adjusted</strong>
              <span>
                {reconciliation.investigation_note ??
                  "Pending authorized investigation and adjustment."}
              </span>
            </li>
            <li className={reconciliation.status === "certified" ? "done" : ""}>
              <strong>Certification</strong>
              <span>
                {reconciliation.certified_at
                  ? `Certified ${inventoryDateTime(reconciliation.certified_at, data.timezone)}.`
                  : "Blocked until variance resolution and a separate reviewer."}
              </span>
            </li>
          </ol>
        </Card>
      </div>
      <Card title={unresolved ? "Resolve variance" : "Certify count"}>
        {unresolved ? (
          <div className="inventory-stack compact">
            <Field label="Investigation findings">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Required count/research findings"
              />
            </Field>
            <PermissionNote
              allowed={
                capability(data, "inventory.count") &&
                capability(data, "controlled.count")
              }
              permission="inventory.count + controlled.count"
            />
            <p className="inventory-info">
              Resolution posts a {number(reconciliation.variance_units)}{" "}
              {item.base_unit}
              adjustment so the balance matches the physical count.
            </p>
            <ConfirmButton
              disabled={
                busy ||
                !capability(data, "inventory.count") ||
                !capability(data, "controlled.count") ||
                !note.trim()
              }
              onConfirm={investigate}
            >
              Post variance resolution
            </ConfirmButton>
          </div>
        ) : (
          <div className="inventory-stack compact">
            <DataPoint
              label="Resolved expected"
              value={`${number(reconciliation.counted_units)} ${item.base_unit}`}
            />
            <PermissionNote
              allowed={capability(data, "controlled.certify")}
              permission="controlled.certify"
            />
            <ConfirmButton
              disabled={
                busy ||
                !capability(data, "controlled.certify") ||
                !note.trim() ||
                reconciliation.status === "certified"
              }
              onConfirm={certify}
            >
              Certify reconciliation
            </ConfirmButton>
          </div>
        )}
      </Card>
    </div>
  );
}
