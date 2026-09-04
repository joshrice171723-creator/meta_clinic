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
import { Button, Chip } from "@mui/material";
import { api, ApiError } from "../../api/client";
import { Form as InventoryForm, LoadState } from "../../shared/ui";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import type {
  InventoryBalance,
  InventoryData,
  InventoryRecall,
  Decimal,
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
import "./inventory.css";

type Screen =
  | "catalog"
  | "catalog_new"
  | "configure"
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

const workflowLinks = [
  {
    label: "Check stock",
    href: "/clinic/inventory",
    screen: "catalog" as Screen,
  },
  {
    label: "Plan an order",
    href: "/clinic/inventory/replenishment",
    screen: "replenishment" as Screen,
  },
  {
    label: "Receive delivery",
    href: "/clinic/inventory/receiving",
    screen: "receiving" as Screen,
  },
  {
    label: "Resolve exceptions",
    href: "/clinic/inventory/recalls",
    screen: "recalls" as Screen,
  },
];

const screenDescriptions: Record<Screen, string> = {
  catalog: "Monitor availability, lot exceptions, and replenishment signals.",
  catalog_new: "Add a product definition before ordering or receiving stock.",
  configure:
    "Record the inventory operating configuration before posting stock.",
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

function screenForPath(path: string): Screen {
  const value = path.replace(/\/$/, "");
  if (value === "/clinic/inventory/catalog/new") return "catalog_new";
  if (value === "/clinic/inventory/configure") return "configure";
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
function packageFor(data: InventoryData, packageId?: string) {
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
function capability(data: InventoryData, key: string) {
  return data.capabilities[key] === true;
}
function product(data: InventoryData, id: string) {
  return data.products.find((item) => item.id === id);
}
function lot(data: InventoryData, id: string) {
  return data.lots.find((item) => item.id === id);
}
function location(data: InventoryData, id: string) {
  return data.locations.find((item) => item.id === id);
}
function balanceFor(data: InventoryData, balanceId?: string) {
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
  return data.purchase_orders
    .flatMap((order) => order.lines)
    .find((line) => line.product_id === productId)?.package_price;
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
}: {
  children: ReactNode;
  disabled?: boolean;
  onConfirm: () => void;
  tone?: "primary" | "danger" | "outline";
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
          <strong>Confirm this inventory action?</strong>
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
            onClick={() => {
              setConfirming(false);
              onConfirm();
            }}
          >
            Confirm action
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
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [ndc, setNdc] = useState("");
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
  const [unitDetectionSource, setUnitDetectionSource] = useState<
    InferredInventoryUnits["source"] | "manual"
  >("manual");
  const lookupVersion = useRef(0);
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
    if (query.length < 3 || !capability(data, "inventory.catalog")) {
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
  }, [data, lookupQuery]);
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
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(
      "/api/clinic/pharmacy",
      {
        reference_token: selectedNdc?.reference_token,
        clinic_pharmacy_product: {
          name: name.trim(),
          sku: sku.trim(),
          ndc: ndc.trim() || undefined,
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
      <div className="inventory-two-col wide-left">
        <Card title="Product definition">
          <p className="inventory-lead">
            Add the item once. The catalog definition controls package
            conversion, purchasing quantities, and receiving accuracy.
          </p>
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
                onClick={() => setSelectedNdc(undefined)}
              >
                Clear FDA selection and enter manually
              </button>
            )}
            <p className="inventory-caption">
              FDA data is used to prefill the package record. It does not
              replace your clinic’s SKU, stock unit, reorder point, or receiving
              setup.
            </p>
          </div>
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
            <Field label="NDC" hint="Optional for non-medication supplies.">
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
              hint="For example: tablet, vial, or supply."
            >
              <input
                value={dosageForm}
                onChange={(event) => setDosageForm(event.target.value)}
                maxLength={500}
                readOnly={Boolean(selectedNdc)}
                autoComplete="off"
              />
            </Field>
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
  const initialItem =
    data.products.find((item) => item.id === requestedProductId) ??
    data.products[0];
  const [productId, setProductId] = useState(initialItem?.id ?? "");
  const item = data.products.find((record) => record.id === productId);
  const initialDestination =
    data.locations.find((record) => record.kind === "storage") ??
    data.locations[0];
  const [destinationId, setDestinationId] = useState(
    initialDestination?.id ?? "",
  );
  const [supplierId, setSupplierId] = useState(
    initialItem?.preferred_supplier_id ?? data.suppliers?.[0]?.id ?? "",
  );
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState(
    initialItem ? (recordedPackagePrice(data, initialItem.id) ?? "") : "",
  );
  const [numberValue, setNumberValue] = useState("");
  const [reason, setReason] = useState("");
  const [currency, setCurrency] = useState("");
  const packageInfo = packageFor(data, item?.package_id);
  const destination = data.locations.find(
    (record) => record.id === destinationId,
  );
  const selectProduct = (nextId: string) => {
    const next = data.products.find((record) => record.id === nextId);
    setProductId(nextId);
    setSupplierId(next?.preferred_supplier_id ?? data.suppliers?.[0]?.id ?? "");
    setUnitPrice(next ? (recordedPackagePrice(data, next.id) ?? "") : "");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    void run(
      "/api/clinic/inventory/purchase-orders",
      {
        purchase_order: {
          ...(numberValue.trim() ? { number: numberValue.trim() } : {}),
          destination: destination?.name ?? "",
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
      <div className="inventory-two-col wide-left">
        <Card title="Purchase order details">
          <p className="inventory-lead">
            Order any active catalog item. This creates a draft only; stock is
            added after the delivery is recorded and received.
          </p>
          <form className="inventory-form-grid" onSubmit={submit}>
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
                onChange={(event) => setSupplierId(event.target.value)}
              >
                <option value="">No supplier</option>
                {data.suppliers?.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Package price">
              <input
                inputMode="decimal"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                placeholder="0.00"
                required
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
            <Field label="Ship to">
              <select
                value={destinationId}
                onChange={(event) => setDestinationId(event.target.value)}
                required
              >
                {data.locations.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.name}
                  </option>
                ))}
              </select>
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
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={200}
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
                  !destination ||
                  !validDecimal(quantity) ||
                  !validDecimal(unitPrice, true) ||
                  !/^[A-Z]{3}$/.test(currency.trim().toUpperCase()) ||
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
        <Card title="Order preview">
          <div className="inventory-stack compact">
            <DataPoint
              label="Item"
              value={item.name}
              detail={`${number(item.units_per_package)} ${item.base_unit} per package`}
            />
            <DataPoint
              label="Available now"
              value={`${number(item.available_units)} ${item.base_unit}`}
            />
            <DataPoint
              label="Incoming after draft"
              value={`${number(decimalMultiply(quantity || "0", item.units_per_package))} ${item.base_unit}`}
              tone="blue"
            />
            <DataPoint
              label="Draft status"
              value="Needs review"
              detail="Submit, approve, then mark sent"
              tone="warning"
            />
          </div>
        </Card>
      </div>
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
  const [data, setData] = useState<InventoryData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uncertainMutation, setUncertainMutation] =
    useState<PendingInventoryMutation | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

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

  const load = async () => {
    setLoading(true);
    setError("");
    let lastReason: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const payload = await api<{ data: InventoryData }>(
          "/api/clinic/inventory/bootstrap",
          { signal: controller.signal },
        );
        if (!payload.data)
          throw new Error(
            "The inventory service returned an incomplete response.",
          );
        setData(payload.data);
        setLoading(false);
        return;
      } catch (reason) {
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
    void load();
  }, []);

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
      const payload = await api<{ data: InventoryData; id?: number | string }>(
        endpoint,
        {
          method: "POST",
          body: requestBody,
        },
      );
      setData(payload.data);
      setUncertainMutation(null);
      setNotice({
        tone: "success",
        title: successTitle,
        detail: successDetail,
      });
      afterSuccess?.(payload);
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

  const available = decimalSum(
    data.balances.map((item) => item.available_units),
  );
  const held = decimalSum(data.balances.map((item) => item.held_units));
  return (
    <div className="inventory-app">
      <div className="inventory-layout">
        <div className="inventory-main">
          <header className="inventory-header">
            <div>
              <h1>{screenTitle(screen)}</h1>
              <p className="inventory-header-description">
                {screenDescriptions[screen]}
              </p>
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
                        .filter((link) => link.group === group)
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
            <nav
              className="inventory-workflow"
              aria-label="Daily inventory flow"
            >
              <span className="inventory-workflow-label">Daily flow</span>
              {workflowLinks.map((item, index) => (
                <a
                  href={item.href}
                  key={item.screen}
                  aria-current={screen === item.screen ? "step" : undefined}
                >
                  <span>{index + 1}</span>
                  {item.label}
                </a>
              ))}
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
            {screen === "catalog" && (
              <CatalogScreen
                data={data}
                available={available}
                held={held}
                onRefresh={load}
              />
            )}
            {screen === "catalog_new" && (
              <CatalogCreateScreen data={data} busy={busy} run={run} />
            )}
            {screen === "configure" && (
              <InventoryConfigureScreen data={data} busy={busy} run={run} />
            )}
            {screen === "replenishment" && (
              <ReplenishmentScreen data={data} busy={busy} run={run} />
            )}
            {screen === "purchasing" && (
              <PurchasingScreen data={data} busy={busy} run={run} />
            )}
            {screen === "purchase_order_new" && (
              <PurchaseOrderCreateScreen data={data} busy={busy} run={run} />
            )}
            {screen === "shipment_new" && (
              <ShipmentCreateScreen data={data} busy={busy} run={run} />
            )}
            {screen === "receiving" && (
              <ReceivingScreen data={data} busy={busy} run={run} />
            )}
            {screen === "lots" && (
              <LotsScreen data={data} busy={busy} run={run} />
            )}
            {screen === "activity" && <ActivityScreen data={data} />}
            {screen === "recalls" && (
              <RecallScreen data={data} busy={busy} run={run} />
            )}
            {screen === "controlled" && (
              <ControlledScreen data={data} busy={busy} run={run} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CatalogScreen({
  data,
  available,
  held,
  onRefresh,
}: {
  data: InventoryData;
  available: Decimal;
  held: Decimal;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "attention" | "in_range"
  >("all");
  const [sort, setSort] = useState<"name" | "available_asc" | "available_desc">(
    "name",
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProducts = data.products.filter((item) => {
    const itemLots = data.lots
      .filter((candidate) => candidate.product_id === item.id)
      .map((candidate) => candidate.lot_number)
      .join(" ");
    const locationNames = data.balances
      .filter((balance) => balance.product_id === item.id)
      .map((balance) => location(data, balance.location_id)?.name ?? "")
      .join(" ");
    const searchable =
      `${item.name} ${item.ndc} ${item.preferred_supplier} ${item.package_id} ${itemLots} ${locationNames}`.toLowerCase();
    const matchesQuery =
      !normalizedQuery || searchable.includes(normalizedQuery);
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "attention" && item.low_stock) ||
      (statusFilter === "in_range" && !item.low_stock);
    return matchesQuery && matchesStatus;
  });
  const products = [...filteredProducts].sort((left, right) => {
    if (sort === "available_asc")
      return decimalCompare(left.available_units, right.available_units);
    if (sort === "available_desc")
      return decimalCompare(right.available_units, left.available_units);
    return left.name.localeCompare(right.name);
  });
  const activeFilter = normalizedQuery || statusFilter !== "all";
  const availableUnits = decimalSum(
    data.products.map((item) => item.available_units),
  );
  const incomingUnits = data.purchase_orders
    .filter((order) => !["cancelled", "complete"].includes(order.status))
    .flatMap((order) => order.lines)
    .reduce<Decimal>(
      (total, line) =>
        decimalAdd(
          total,
          nonNegative(decimalSubtract(line.ordered_units, line.received_units)),
        ),
      "0",
    );
  const lotExceptions = data.lots.filter(
    (item) => item.status !== "active",
  ).length;
  const lowStockProducts = data.products.filter((item) => item.low_stock);
  if (data.products.length === 0)
    return (
      <Card title="Product catalog">
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
    <div className="inventory-stack">
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
      <div className="inventory-summary" aria-label="Inventory summary">
        <DataPoint
          label="Available units"
          value={number(availableUnits)}
          detail="Ready to dispense"
          tone="success"
        />
        <DataPoint
          label="Incoming units"
          value={number(incomingUnits)}
          detail="On open orders"
          tone="blue"
        />
        <DataPoint
          label="Low-stock products"
          value={number(lowStockProducts.length)}
          detail={`${number(lotExceptions)} lot exceptions`}
          tone={lowStockProducts.length ? "danger" : "success"}
        />
      </div>
      <Card title="Catalog and lot traceability">
        <div className="inventory-card-heading">
          <div>
            <p className="inventory-lead">
              Search the records you need, then open lots or replenishment from
              the row.
            </p>
          </div>
        </div>
        <div className="inventory-toolbar">
          <Field label="Search inventory">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Product, NDC, lot, supplier"
            />
          </Field>
          <Field label="Stock status">
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as typeof statusFilter)
              }
            >
              <option value="all">All products</option>
              <option value="attention">Needs attention</option>
              <option value="in_range">In range</option>
            </select>
          </Field>
          <Field label="Sort by">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
            >
              <option value="name">Product name</option>
              <option value="available_asc">Available: low to high</option>
              <option value="available_desc">Available: high to low</option>
            </select>
          </Field>
          {activeFilter && (
            <button
              className="inventory-button outline inventory-reset-button"
              type="button"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setSort("name");
              }}
            >
              Reset view
            </button>
          )}
        </div>
        <p className="inventory-results-count" role="status">
          Showing {products.length} of {data.products.length} products.
        </p>
        <div className="inventory-table-wrap">
          <table>
            <caption className="sr-only">Medication catalog</caption>
            <thead>
              <tr>
                <th>Product / package</th>
                <th>NDC</th>
                <th>Available</th>
                <th>On hand</th>
                <th>Reorder point</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((item) => (
                <tr key={item.id}>
                  <td data-label="Product">
                    <strong>{item.name}</strong>
                    <small>
                      {item.preferred_supplier ?? "Supplier not recorded"} ·{" "}
                      {packageFor(data, item.package_id)?.description ??
                        "Package metadata not recorded"}
                    </small>
                  </td>
                  <td data-label="NDC" className="mono">
                    {item.ndc}
                  </td>
                  <td data-label="Available" className="numeric">
                    {number(item.available_units)} {item.base_unit}s
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
                    <a
                      href={`/clinic/inventory/purchasing/new?product_id=${item.id}`}
                    >
                      Create purchase order
                    </a>
                    {item.low_stock && (
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
      </Card>
      <Card title="Attention queue">
        <ul className="inventory-list">
          {data.lots
            .filter((item) => item.status !== "active")
            .map((item) => (
              <li key={item.id}>
                <Badge tone="danger">{item.status}</Badge>
                <div>
                  <strong>Lot {item.lot_number}</strong>
                  <small>
                    {product(data, item.product_id)?.name} · expires{" "}
                    {inventoryDate(item.expiration_date, data.timezone)}
                  </small>
                </div>
              </li>
            ))}
          {data.lots.every((item) => item.status === "active") && (
            <li>No held or recalled lots.</li>
          )}
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
  const initialDestination =
    data.locations.find((location) => location.kind === "storage") ??
    data.locations[0];
  const [destinationId, setDestinationId] = useState(
    initialDestination?.id ?? "",
  );
  const destination = data.locations.find(
    (location) => location.id === destinationId,
  );
  const [supplierId, setSupplierId] = useState(
    initialItem?.preferred_supplier_id ?? data.suppliers?.[0]?.id ?? "",
  );
  const supplier = data.suppliers?.find((record) => record.id === supplierId);
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
    initialItem ? (recordedPackagePrice(data, initialItem.id) ?? "") : "",
  );
  const [reason, setReason] = useState("");
  const [currency, setCurrency] = useState("");
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
                setSupplierId(selected?.preferred_supplier_id ?? "");
                setQuantity(suggestedQuantity(event.target.value));
                setUnitPrice(
                  recordedPackagePrice(data, event.target.value) ?? "",
                );
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
                onChange={(event) => setSupplierId(event.target.value)}
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
          <Field label="Unit price">
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
            >
              {data.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
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

function PurchasingScreen({
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
  const [orderId, setOrderId] = useState(data.purchase_orders[0]?.id ?? "");
  const order =
    data.purchase_orders.find((record) => record.id === orderId) ??
    data.purchase_orders[0];
  const [lineId, setLineId] = useState(order?.lines[0]?.id ?? "");
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
  const line =
    order.lines.find((record) => record.id === lineId) ?? order.lines[0];
  if (!line)
    return (
      <Card title="Purchasing">
        <p>This purchase order has no lines.</p>
      </Card>
    );
  const item = product(data, line.product_id);
  const packageInfo = packageFor(data, line.package_id);
  const packageUnit = packageInfo?.input_unit ?? "unavailable unit";
  const baseUnit = item?.base_unit ?? "unavailable unit";
  const [actionReason, setActionReason] = useState("");
  const shipment = data.shipments.find((record) => record.po_id === order.id);
  const cancelledPackages = order.cancelled_remaining_units
    ? decimalCeilDivide(order.cancelled_remaining_units, line.units_per_package)
    : "0";
  const remaining = nonNegative(
    decimalSubtract(
      decimalSubtract(line.ordered_packages, line.received_packages),
      cancelledPackages,
    ),
  );
  const stages = [
    "draft",
    "submitted",
    "approved",
    "sent",
    "partially received",
  ];
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
  return (
    <div className="inventory-stack">
      <Card>
        <div className="inventory-card-heading">
          <Field label="Purchase order">
            <select
              value={order.id}
              onChange={(event) => {
                const selected = data.purchase_orders.find(
                  (record) => record.id === event.target.value,
                );
                setOrderId(event.target.value);
                setLineId(selected?.lines[0]?.id ?? "");
              }}
            >
              {data.purchase_orders.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.number}
                </option>
              ))}
            </select>
          </Field>
          {order.lines.length > 1 && (
            <Field label="Order line">
              <select
                value={line.id}
                onChange={(event) => setLineId(event.target.value)}
              >
                {order.lines.map((record) => (
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
            <div className="inventory-title-row">
              <h2>{order.number}</h2>
              <Badge tone="blue">{order.status.replaceAll("_", " ")}</Badge>
            </div>
            <p className="inventory-lead">
              {order.supplier} → {order.destination} · ordered{" "}
              {inventoryDateTime(order.ordered_at, data.timezone)}
            </p>
          </div>
          <Field label="Action reason">
            <input
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
              maxLength={200}
              required
            />
          </Field>
          <div className="inventory-form-actions">
            {["sent", "partially_received"].includes(order.status) &&
              decimalCompare(remaining, "0") > 0 && (
                <a
                  className="inventory-button outline"
                  href={`/clinic/inventory/shipments/new?purchase_order_id=${order.id}`}
                >
                  Record delivery
                </a>
              )}
            {next && (
              <ConfirmButton
                tone="outline"
                disabled={
                  busy || !capability(data, next[2]) || !actionReason.trim()
                }
                onConfirm={transition}
              >
                {next[1]}
              </ConfirmButton>
            )}
            {order.status !== "complete" && order.status !== "cancelled" && (
              <ConfirmButton
                tone="outline"
                disabled={
                  busy ||
                  decimalCompare(remaining, "0") === 0 ||
                  !capability(data, "procurement.submit") ||
                  !actionReason.trim()
                }
                onConfirm={cancel}
              >
                Cancel {number(remaining)} {packageUnit} remainder
              </ConfirmButton>
            )}
          </div>
        </div>
        <div className="inventory-timeline">
          {stages.map((stage, index) => (
            <div
              key={stage}
              className={
                index <=
                stages.indexOf(
                  order.status.replace(
                    "partially_received",
                    "partially received",
                  ),
                )
                  ? "done"
                  : ""
              }
            >
              <span>{index + 1}</span>
              {stage}
            </div>
          ))}
        </div>
      </Card>
      <div className="inventory-two-col wide-left">
        <Card title="Order lines">
          <div className="inventory-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product / package</th>
                  <th>Ordered</th>
                  <th>Received</th>
                  <th>Remaining</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>{item?.name}</strong>
                    <small>
                      {item &&
                        `${number(item.units_per_package)} ${baseUnit} / ${packageUnit}`}{" "}
                      · NDC {item?.ndc}
                    </small>
                  </td>
                  <td className="numeric">
                    <strong>
                      {number(line.ordered_packages)} {packageUnit}
                    </strong>
                    <small>
                      {number(line.ordered_units)} {baseUnit}
                    </small>
                  </td>
                  <td className="numeric">
                    <strong>
                      {number(line.received_packages)} {packageUnit}
                    </strong>
                    <small>
                      {number(line.received_units)} {baseUnit}
                    </small>
                  </td>
                  <td className="numeric">
                    <strong>
                      {number(remaining)} {packageUnit}
                    </strong>
                    <small>
                      {number(
                        decimalMultiply(remaining, line.units_per_package),
                      )}{" "}
                      {baseUnit}
                    </small>
                  </td>
                  <td className="numeric">
                    {money(line.package_price, line.currency)} / {packageUnit}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <PermissionNote
            allowed={capability(data, "procurement.approve")}
            permission="procurement.approve"
          />
        </Card>
        <Card title="Order summary">
          <div className="inventory-stack compact">
            <DataPoint
              label={`${number(line.ordered_packages)} ${packageUnit} × ${money(line.package_price, line.currency)}`}
              value={money(order.subtotal, line.currency)}
            />
            <DataPoint label="Tax" value={money(order.tax, line.currency)} />
            <DataPoint
              label="Shipping"
              value={money(order.shipping, line.currency)}
            />
            <DataPoint
              label="Total"
              value={money(order.total, line.currency)}
            />
            {shipment && (
              <p className="inventory-info">
                Shipment {shipment.supplier_reference} delivered{" "}
                {shipment.package_count} {packageUnit}. {number(remaining)}{" "}
                {packageUnit}
                remain on the purchase order.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ReceivingScreen({
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
  const selectedLot = productLots.find(
    (record) => record.lot_number === lotNumber,
  );
  const recall = data.recalls.find(
    (record) =>
      record.product_id === item?.id && record.lot_numbers.includes(lotNumber),
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
    allocation?.expected_packages ?? "1",
  );
  const [temperature, setTemperature] = useState("");
  const [reason, setReason] = useState("");
  const selectLot = (value: string, productId = item?.id) => {
    setLotNumber(value);
    const known = data.lots.find(
      (record) =>
        record.product_id === productId && record.lot_number === value,
    );
    if (known) setExpirationDate(known.expiration_date);

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
  if (!shipment || !order || !line || !item)
    return (
      <Card title="Receiving">
        <p>No open shipment is available.</p>
      </Card>
    );
  const confirm = () =>
    void run(
      "/api/clinic/inventory/receipts",
      {
        receipt: {
          purchase_order_id: order.id,
          shipment_id: shipment.id,
          purchase_order_line_id: line.id,
          lot_number: lotNumber,
          expiration_date: expirationDate,
          quantity_packages: packages,
          destination_location: destination?.name,
          ...(areaId ? { area_id: areaId } : {}),
          ...(temperature ? { temperature_c: temperature } : {}),
          ...(recall
            ? {
                recall_id: recall.id,
                exception: "recall_match",
                disposition: "quarantine_recall",
                status: "quarantined",
              }
            : { status: "received" }),
          reason,
        },
      },
      "Receipt recorded",
      `${number(packages)} ${packageUnit} received into ${destination?.name}.`,
    );
  return (
    <div className="inventory-two-col wide-left">
      <Card>
        <div className="inventory-card-heading">
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
                  selectedLots.find((record) => record.status === "recalled") ??
                  selectedLots[0];
                setLineId(selectedLine?.id ?? "");
                selectLot(nextLot?.lot_number ?? "", selectedLine?.product_id);
                setPackages(
                  selectedAllocations.find(
                    (entry) =>
                      entry.purchase_order_line_id === selectedLine?.id,
                  )?.expected_packages ?? "1",
                );
              }}
            >
              {data.shipments.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.supplier_reference}
                </option>
              ))}
            </select>
          </Field>
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
            {receipt?.status ?? shipment.status}
          </Badge>
        </div>
        {recall && (
          <div className="inventory-warning" role="alert">
            <strong>Recall match: {recall.reference}</strong>
            <p>This lot must be received into a quarantine location.</p>
          </div>
        )}
        <div className="inventory-data-grid two">
          <Field label="Product / package">
            <input
              value={`${item.name} · ${packageInfo?.description ?? `${number(item.units_per_package)} ${baseUnit} per ${packageUnit}`}`}
              readOnly
            />
          </Field>
          <Field label="Lot number">
            <input
              value={lotNumber}
              onChange={(event) => selectLot(event.target.value)}
            />
          </Field>
          <Field label="Expiration">
            <input
              type="date"
              value={expirationDate}
              onChange={(event) => setExpirationDate(event.target.value)}
            />
          </Field>
          <Field
            label={`Quantity (${packageUnit})`}
            hint={`${number(decimalMultiply(packages || "0", item.units_per_package))} ${baseUnit}`}
          >
            <input
              type="number"
              min={1}
              value={packages}
              onChange={(event) => setPackages(event.target.value)}
            />
          </Field>
          <Field label="Temperature (°C)">
            <input
              value={temperature}
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
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </div>
        <div className="inventory-form-actions">
          <PermissionNote
            allowed={capability(data, "inventory.receive")}
            permission="inventory.receive"
          />
          <ConfirmButton
            disabled={
              busy ||
              !!receipt ||
              !capability(data, "inventory.receive") ||
              !destination ||
              !lotNumber.trim() ||
              !expirationDate ||
              !reason.trim() ||
              !allocation ||
              !validDecimal(packages) ||
              decimalCompare(
                packages || "0",
                allocation?.expected_packages ?? "0",
              ) !== 0
            }
            onConfirm={confirm}
          >
            {receipt ? "Receipt recorded" : "Confirm receipt"}
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
            value={`${number(packages)} ${packageUnit} · ${number(decimalMultiply(packages || "0", item.units_per_package))} ${baseUnit}`}
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
  if (!selected)
    return (
      <Card title="Inventory & lots">
        <p>No lots are available.</p>
      </Card>
    );
  const selectedLot = lot(data, selected.lot_id)!;
  const selectedProduct = product(data, selected.product_id)!;
  const selectedLocation = location(data, selected.location_id)!;
  const submit = (event: FormEvent) => {
    event.preventDefault();
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
    decimalCompare(selected.available_units, "0") === 0 ||
    selectedLot.status !== "active";
  return (
    <div className="inventory-stack">
      <div className="inventory-metrics">
        <Metric
          label="On hand"
          value={number(
            decimalSum(data.balances.map((item) => item.on_hand_units)),
          )}
          detail="All locations"
        />
        <Metric
          label="Available"
          value={number(
            decimalSum(data.balances.map((item) => item.available_units)),
          )}
          detail="After safety holds"
        />
        <Metric
          label="Held"
          value={number(
            decimalSum(data.balances.map((item) => item.held_units)),
          )}
          detail="Safety holds"
          tone="warning"
        />
        <Metric
          label="As of"
          value={inventoryDate(data.as_of, data.timezone)}
          detail={data.timezone}
        />
      </div>
      <Card title="Lot balances">
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
                    className={balance.id === selected.id ? "selected" : ""}
                    onClick={() => setSelectedId(balance.id)}
                  >
                    <td>
                      <strong>{item.name}</strong>
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
      <div className="inventory-two-col wide-left">
        <Card title={`${selectedProduct.name} · Lot ${selectedLot.lot_number}`}>
          <div className="inventory-data-grid four">
            <DataPoint label="Location" value={selectedLocation.name} />
            <DataPoint
              label="On hand"
              value={`${number(selected.on_hand_units)} ${selectedProduct.base_unit}s`}
            />
            <DataPoint
              label="Held"
              value={`${number(selected.held_units)} ${selectedProduct.base_unit}s`}
              tone="warning"
            />
            <DataPoint
              label="Expires"
              value={inventoryDate(selectedLot.expiration_date, data.timezone)}
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
    </div>
  );
}

function ActivityScreen({ data }: { data: InventoryData }) {
  const [filter, setFilter] = useState("");
  const normalizedFilter = filter.trim().toLowerCase();
  const rows = data.movements.filter((item) =>
    `${item.type} ${item.reason ?? ""} ${item.source_id}`
      .toLowerCase()
      .includes(normalizedFilter),
  );
  const viewState = inventoryMovementViewState(
    data.movements.length,
    rows.length,
    filter,
  );
  return (
    <div className="inventory-stack">
      <Card title="Activity ledger">
        <div className="inventory-card-heading inventory-ledger-toolbar">
          <Field label="Filter ledger">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Type, reason, source"
            />
          </Field>
          <div className="inventory-ledger-summary">
            <p className="inventory-results-count" role="status">
              {normalizedFilter
                ? `Showing ${rows.length} of ${data.movements.length} movements.`
                : `${data.movements.length} movement${data.movements.length === 1 ? "" : "s"} recorded.`}
            </p>
            {normalizedFilter && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<ClearRoundedIcon />}
                type="button"
                onClick={() => setFilter("")}
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
                      <strong>Lot {lot(data, item.lot_id)?.lot_number}</strong>
                      <small>{location(data, item.location_id)?.name}</small>
                    </td>
                    <td className="numeric">
                      {item.direction === "out" ? "−" : "+"}
                      {number(item.quantity_units)}
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
                ? `No movements match “${filter.trim()}”.`
                : "No movements recorded"}
            </strong>
            <p>
              {viewState === "filtered_empty"
                ? "Clear the filter to review the full movement ledger."
                : "Recorded stock receipts, transfers, adjustments, and counts will appear here with their source."}
            </p>
          </div>
        )}
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
