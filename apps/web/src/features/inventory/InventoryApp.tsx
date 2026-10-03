import {
  links,
  screenDescriptions,
  screenForPath,
  screenTitle,
} from "./inventoryNavigation";
import {
  inventoryMutationAttempt,
  inventoryOutcomeUnconfirmed,
  inventoryMutationResponseOwned,
  inventoryUsesAcknowledgement,
  type PendingInventoryMutation,
} from "./inventoryMutationRecovery";
import {
  facilityCanReceivePurchaseOrder,
  mergePurchaseCartDraft,
  money,
  nonNegative,
  purchaseOrderFacilities,
  purchaseOrderGroups,
  purchaseOrderGroupStatus,
  purchaseOrderGroupTotal,
  purchaseOrderStatusTone,
  validDecimal,
  type PurchaseCartDraft,
} from "./inventoryPurchasing";
export {
  inventoryMutationAttempt,
  inventoryOutcomeUnconfirmed,
  type PendingInventoryMutation,
} from "./inventoryMutationRecovery";
export {
  benchmarkPackagePrice,
  mergePurchaseCartDraft,
  purchaseOrderGroups,
  type InventoryPurchaseOrderGroup,
  type PurchaseCartDraft,
} from "./inventoryPurchasing";
import { CarrierTrackingPreparation } from "./CarrierTrackingPreparation";
import { OrderDeliveryPreparation } from "./OrderDeliveryPreparation";
import { quoteFeeEvidenceLabel } from "./quoteFeeEvidence";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import MoveToInboxOutlinedIcon from "@mui/icons-material/MoveToInboxOutlined";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Button,
  Chip,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
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
  InventorySupplierData,
  InventorySupplierRead,
  InventoryLocationData,
  InventoryLocationRead,
  InventoryLocation,
  InventoryExceptionData,
  InventoryExceptionRead,
  InventoryException,
  InventoryRecallData,
  InventoryRecallRead,
  InventoryCountData,
  InventoryCountRead,
  InventoryControlledData,
  InventoryControlledRead,
  InventoryStockData,
  InventoryStockRead,
  InventoryOrderData,
  InventoryOrderRead,
  InventoryDeliveryData,
  InventoryDeliveryRead,
  InventoryShipmentIntakeData,
  InventoryShipmentIntakeRead,
  InventoryReceivingDetail,
  InventoryReceivingLotLookup,
  InventoryProduct,
  InventoryRecall,
  InventoryCategory,
  Decimal,
  InventoryPurchaseCart,
  NadacBenchmark,
  GudidResult,
  NdcResult,
} from "./inventoryContracts";
import {
  decimalAdd,
  decimalCompare,
  decimalDisplay,
  decimalMultiply,
  decimalSubtract,
  decimalSum,
} from "./inventoryContracts";
import { SupplierPricingScreen } from "./SupplierPricing";
import { CycleCountsScreen } from "./CycleCountsScreen";
import { ControlledScreen } from "./ControlledScreen";
import { InventoryScanInput } from "./InventoryScanInput";
import { OrderReconciliation } from "./OrderReconciliation";
import "./inventory.css";

type Notice = {
  tone: "success" | "error";
  title: string;
  detail: string;
} | null;
type InventoryAdjustmentReceipt = {
  id: string;
  delta_units: Decimal;
  reason: string;
  product_name: string;
  lot_number: string;
  location_name: string;
  resulting_on_hand_units: Decimal;
  stock_unit: string;
};
type InventoryMutationResult = {
  id?: number | string;
  adjustment?: InventoryAdjustmentReceipt;
};
export function inventoryMovementViewState(
  total: number,
  visible: number,
  filter: string,
): "empty" | "filtered_empty" | "results" {
  if (total === 0) return "empty";
  if (visible === 0 && filter.trim()) return "filtered_empty";
  return "results";
}

function readableEventLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

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
  return (
    inventoryCategories.find((option) => option.value === category)?.label ??
    "Other"
  );
}

const inventoryConfigurationReasons = [
  { value: "initial_setup", label: "Initial clinic inventory setup" },
  { value: "enable_operations", label: "Enable purchasing and receiving" },
  { value: "resume_operations", label: "Resume inventory operations" },
  { value: "approved_change", label: "Approved operating change" },
  { value: "other", label: "Other" },
] as const;

function number(value: number | string) {
  return decimalDisplay(String(value));
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
function packageFor(data: Pick<InventoryData, "packages">, packageId?: string) {
  return data.packages.find((item) => item.id === packageId);
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
function product<T extends { id: string }>(
  data: { products: T[] },
  id: string,
) {
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
  onOpen,
  onCancel,
  tone = "primary",
  confirmationTitle = "Confirm this inventory action?",
  confirmationContent,
  confirmLabel = "Confirm action",
  confirmDisabled = false,
}: {
  children: ReactNode;
  disabled?: boolean;
  onConfirm: () => void;
  onOpen?: () => void;
  onCancel?: () => void;
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
            onClick={() => {
              onCancel?.();
              setConfirming(false);
            }}
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
      onClick={() => {
        onOpen?.();
        setConfirming(true);
      }}
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
  successDetail: string | ((payload: InventoryMutationResult) => string),
  afterSuccess?: (payload: InventoryMutationResult) => void,
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
      else
        setDeviceError(
          "No FDA device record matched that identifier. You can enter the item manually.",
        );
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
              <strong>Use FDA package data (optional)</strong>
              <p>
                Search by a medication name or the NDC printed on the package.
                Choose the exact package to prefill its verified label data,
                then complete the clinic-owned purchasing fields below.
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
                        Effective{" "}
                        {nadacBenchmark.effective_date ?? "date unavailable"} ·
                        CMS NADAC ·{" "}
                        <a
                          href={nadacBenchmark.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
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
                replace your clinic’s SKU, stock unit, reorder point, or
                receiving setup.
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
                    onChange={(event) =>
                      setDeviceIdentifier(event.target.value)
                    }
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
              {deviceError && (
                <p className="inventory-danger-text">{deviceError}</p>
              )}
              {deviceLookupResult && (
                <div className="inventory-stack compact">
                  <p className="inventory-success-line">
                    {deviceLookupResult.brand_name || "FDA device record"} ·{" "}
                    {deviceLookupResult.device_identifier}
                    {deviceLookupResult.company_name
                      ? ` · ${deviceLookupResult.company_name}`
                      : ""}
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
                    Selected {deviceResult.brand_name || "FDA device record"} ·{" "}
                    {deviceResult.device_identifier}
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
            <Typography
              component="h3"
              variant="body1"
              sx={{
                gridColumn: "1 / -1",
                fontWeight: "var(--clinic-heading-weight, 650)",
                lineHeight: "var(--clinic-section-line-height, 1.25)",
              }}
            >
              Product identity
            </Typography>
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
            <Typography
              component="h3"
              variant="body1"
              sx={{
                gridColumn: "1 / -1",
                fontWeight: "var(--clinic-heading-weight, 650)",
                lineHeight: "var(--clinic-section-line-height, 1.25)",
              }}
            >
              Package and stock units
            </Typography>
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
            <Field
              label="Stock unit"
              hint="Unit used to track on-hand and available stock."
            >
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
              hint="Stock units in one purchased package. Use 1 when each package is one stock unit."
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

function InventoryLocationsScreen({
  data,
  loading,
  error: readError,
  readBlocked,
  onRead,
}: {
  data: InventoryLocationData;
  loading: boolean;
  error: string;
  readBlocked: boolean;
  onRead: (read: InventoryLocationRead) => Promise<void>;
}) {
  const params = new URLSearchParams(window.location.search);
  const requestedReturnTo = params.get("return_to") ?? "/clinic/inventory";
  const returnTo = requestedReturnTo.startsWith("/clinic/inventory")
    ? requestedReturnTo
    : "/clinic/inventory";
  const page = data.location_page;
  const applied: InventoryLocationRead = {
    q: page.query,
    location_status: page.status,
    page: page.page,
  };
  const [query, setQuery] = useState(page.query);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<
    "storage" | "quarantine" | "returns" | "controlled"
  >("storage");
  const [siteId, setSiteId] = useState("");
  const [parentId, setParentId] = useState("");
  const [status, setStatus] = useState<"active" | "retired">("active");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("US");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const canConfigure = capability(data, "inventory.configure");
  const writeBlocked = loading || readBlocked || Boolean(readError);
  const readDisabled = loading || readBlocked || Boolean(busy);

  useEffect(() => setQuery(page.query), [page.query]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setKind("storage");
    setSiteId("");
    setParentId("");
    setStatus("active");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setState("");
    setPostalCode("");
    setCountry("US");
  };
  const editLocation = (record: InventoryLocation) => {
    setEditingId(record.id);
    setName(record.name);
    setKind(record.kind ?? "storage");
    setSiteId(record.site_id ?? "");
    setParentId(record.parent_location_id ?? "");
    setStatus(record.status);
    setAddressLine1(record.address_line1 ?? "");
    setAddressLine2(record.address_line2 ?? "");
    setCity(record.city ?? "");
    setState(record.state ?? "");
    setPostalCode(record.postal_code ?? "");
    setCountry(record.country ?? "US");
    setActionError("");
    setNotice("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || writeBlocked || busy || !canConfigure) return;
    setBusy("save");
    setActionError("");
    setNotice("");
    try {
      const endpoint = editingId
        ? `/api/clinic/inventory/locations/${editingId}`
        : "/api/clinic/inventory/locations";
      const payload = await api<{ acknowledged?: boolean }>(
        `${endpoint}?response=ack`,
        {
          method: editingId ? "PATCH" : "POST",
          body: {
            location: {
              name: name.trim(),
              kind,
              site_id: siteId || null,
              parent_location_id: parentId || null,
              status,
              address_line1: addressLine1.trim() || null,
              address_line2: addressLine2.trim() || null,
              city: city.trim() || null,
              state: state.trim() || null,
              postal_code: postalCode.trim() || null,
              country: country.trim() || null,
            },
          },
        },
      );
      if (payload.acknowledged !== true)
        throw new Error("The location update could not be confirmed.");
      await onRead(applied);
      setNotice(editingId ? "Location updated." : "Location created.");
      resetForm();
    } catch (reason) {
      await onRead(applied);
      setActionError(
        `${reason instanceof Error ? reason.message : "The location action could not be completed."} A location refresh was requested; reload if the hierarchy is still unclear.`,
      );
    } finally {
      setBusy("");
    }
  };
  const setLocationStatus = async (
    record: InventoryLocation,
    nextStatus: "active" | "retired",
  ) => {
    if (writeBlocked || busy || !canConfigure) return;
    setBusy(`status:${record.id}`);
    setActionError("");
    setNotice("");
    try {
      const payload = await api<{ acknowledged?: boolean }>(
        `/api/clinic/inventory/locations/${record.id}?response=ack`,
        {
          method: "PATCH",
          body: { location: { status: nextStatus } },
        },
      );
      if (payload.acknowledged !== true)
        throw new Error("The location status could not be confirmed.");
      await onRead(applied);
      setNotice(
        nextStatus === "retired" ? "Location retired." : "Location restored.",
      );
      if (editingId === record.id) resetForm();
    } catch (reason) {
      await onRead(applied);
      setActionError(
        `${reason instanceof Error ? reason.message : "The location status could not be updated."} A location refresh was requested; reload if the hierarchy is still unclear.`,
      );
    } finally {
      setBusy("");
    }
  };
  const parentOptions = data.location_options.filter(
    (record) =>
      record.id !== editingId &&
      (record.site_id ?? "") === siteId &&
      (record.status === "active" || record.id === parentId),
  );
  return (
    <div className="inventory-stack">
      <a className="inventory-back-link" href={returnTo}>
        ← Back
      </a>
      <Card title="Review storage locations">
        <p className="inventory-lead">
          Organize stock destinations under a facility and parent location.
          Legacy area labels remain receipt history; use child locations for new
          room, cabinet, shelf, and bin structure.
        </p>
        <form
          className="inventory-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (!readDisabled)
              void onRead({ ...applied, q: query.trim(), page: 1 });
          }}
        >
          <TextField
            size="small"
            label="Search locations"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, path, facility, or address"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            size="small"
            label="Status"
            value={page.status}
            disabled={readDisabled}
            onChange={(event) =>
              void onRead({
                ...applied,
                location_status: event.target.value as typeof page.status,
                page: 1,
              })
            }
          >
            <MenuItem value="all">All locations</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="retired">Retired</MenuItem>
          </TextField>
          <Button type="submit" variant="outlined" disabled={readDisabled}>
            Search locations
          </Button>
        </form>
        <p className="inventory-results-count" role="status">
          {loading
            ? "Loading locations…"
            : `Showing ${page.filtered_count === 0 ? 0 : (page.page - 1) * page.page_size + 1}–${Math.min(page.page * page.page_size, page.filtered_count)} of ${page.filtered_count} matching locations (${page.total_count} total).`}
        </p>
        {readError && (
          <Alert severity="error">
            {readError} The previous location page remains visible.
          </Alert>
        )}
        {actionError && <Alert severity="error">{actionError}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {data.locations.length > 0 && (
          <div className="inventory-stack compact">
            {data.locations.map((record) => {
              const site = data.sites?.find(
                (candidate) => String(candidate.id) === record.site_id,
              );
              return (
                <div className="inventory-muted-panel" key={record.id}>
                  <div className="inventory-panel-heading">
                    <div>
                      <strong>{record.path}</strong>
                      <p>
                        {record.kind?.replace("_", " ") || "Storage"} ·{" "}
                        {record.status} · {site?.name ?? "No facility link"}
                      </p>
                      <small>
                        {record.stock_destination
                          ? "Eligible stock destination"
                          : record.child_count > 0
                            ? `${record.child_count} child locations; choose a leaf for stock`
                            : "Not eligible for stock"}
                      </small>
                    </div>
                    <div className="inventory-form-actions">
                      <Button
                        type="button"
                        variant="outlined"
                        size="small"
                        disabled={
                          writeBlocked || Boolean(busy) || !canConfigure
                        }
                        onClick={() => editLocation(record)}
                      >
                        Edit location
                      </Button>
                      <Button
                        type="button"
                        variant="outlined"
                        size="small"
                        color={
                          record.status === "active" ? "warning" : "primary"
                        }
                        disabled={
                          writeBlocked || Boolean(busy) || !canConfigure
                        }
                        onClick={() =>
                          void setLocationStatus(
                            record,
                            record.status === "active" ? "retired" : "active",
                          )
                        }
                      >
                        {busy === `status:${record.id}`
                          ? "Saving…"
                          : record.status === "active"
                            ? "Retire"
                            : "Restore"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {!data.locations.length && (
          <p className="inventory-empty" role="status">
            No locations match this view.
          </p>
        )}
        {page.page_count > 1 && (
          <nav
            className="inventory-pagination"
            aria-label="Location pagination"
          >
            <Button
              variant="outlined"
              disabled={readDisabled || page.page === 1}
              onClick={() => void onRead({ ...applied, page: page.page - 1 })}
            >
              Previous
            </Button>
            <span>
              Page {page.page} of {page.page_count}
            </span>
            <Button
              variant="outlined"
              disabled={readDisabled || page.page === page.page_count}
              onClick={() => void onRead({ ...applied, page: page.page + 1 })}
            >
              Next
            </Button>
          </nav>
        )}
      </Card>
      <Card
        title={editingId ? "Edit storage location" : "Add storage location"}
      >
        <form className="inventory-form-grid" onSubmit={save}>
          <TextField
            size="small"
            label="Location name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Main cabinet or Bin A-01"
            slotProps={{ htmlInput: { maxLength: 100 } }}
            required
          />
          <TextField
            select
            size="small"
            label="Location type"
            value={kind}
            onChange={(event) => setKind(event.target.value as typeof kind)}
          >
            <MenuItem value="storage">Storage</MenuItem>
            <MenuItem value="controlled">Controlled storage</MenuItem>
            <MenuItem value="quarantine">Quarantine</MenuItem>
            <MenuItem value="returns">Returns</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Facility"
            value={siteId}
            onChange={(event) => {
              setSiteId(event.target.value);
              setParentId("");
            }}
            helperText="Optional for existing standalone storage."
          >
            <MenuItem value="">No facility link</MenuItem>
            {(data.sites ?? []).map((site) => (
              <MenuItem key={site.id} value={String(site.id)}>
                {site.name} · {site.status}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Parent location"
            value={parentId}
            onChange={(event) => {
              const nextParent = data.location_options.find(
                (record) => record.id === event.target.value,
              );
              setParentId(event.target.value);
              if (
                nextParent?.kind === "quarantine" ||
                nextParent?.kind === "returns" ||
                nextParent?.kind === "controlled"
              )
                setKind(nextParent.kind);
            }}
          >
            <MenuItem value="">Top-level location</MenuItem>
            {parentOptions.map((record) => (
              <MenuItem key={record.id} value={record.id}>
                {record.path}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
          >
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="retired">Retired</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Address line 1"
            value={addressLine1}
            onChange={(event) => setAddressLine1(event.target.value)}
          />
          <TextField
            size="small"
            label="Address line 2"
            value={addressLine2}
            onChange={(event) => setAddressLine2(event.target.value)}
          />
          <TextField
            size="small"
            label="City"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
          <TextField
            size="small"
            label="State"
            value={state}
            onChange={(event) => setState(event.target.value)}
          />
          <TextField
            size="small"
            label="Postal code"
            value={postalCode}
            onChange={(event) => setPostalCode(event.target.value)}
          />
          <TextField
            size="small"
            label="Country"
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          />
          <div className="inventory-form-actions">
            <PermissionNote
              allowed={canConfigure}
              permission="inventory.configure"
            />
            {editingId && (
              <Button type="button" variant="outlined" onClick={resetForm}>
                Cancel editing
              </Button>
            )}
            <Button
              type="submit"
              variant="contained"
              disabled={
                writeBlocked || Boolean(busy) || !canConfigure || !name.trim()
              }
            >
              {busy === "save"
                ? "Saving…"
                : editingId
                  ? "Save location"
                  : "Add location"}
            </Button>
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
    | InventorySupplierData
    | InventoryLocationData
    | InventoryExceptionData
    | InventoryRecallData
    | InventoryCountData
    | InventoryControlledData
    | InventoryStockData
    | InventoryOrderData
    | InventoryDeliveryData
    | InventoryShipmentIntakeData
  >();
  const readVersion = useRef(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uncertainMutation, setUncertainMutation] =
    useState<PendingInventoryMutation | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [reconciliationPending, setReconciliationPending] = useState(false);
  const needsPurchaseOrderFacility =
    screen === "purchase_order_new" || screen === "replenishment";
  const routeScope =
    typeof window === "undefined" ? "" : window.location.search;
  const mutationOwner = useRef({ mounted: true, scope: path + routeScope });
  const busyRunOwner = useRef(0);
  mutationOwner.current.scope = path + routeScope;

  useEffect(() => {
    mutationOwner.current.mounted = true;
    return () => {
      mutationOwner.current.mounted = false;
    };
  }, []);

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
      "supplier_page" in data ||
      "location_page" in data ||
      "exception_page" in data ||
      "recall_page" in data ||
      "count_page" in data ||
      "controlled_page" in data ||
      "stock_page" in data ||
      "order_page" in data ||
      "delivery_page" in data ||
      "intake_page" in data ||
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
      InventorySupplierRead &
      InventoryLocationRead &
      InventoryExceptionRead &
      InventoryRecallRead &
      InventoryCountRead &
      InventoryControlledRead &
      InventoryStockRead &
      InventoryOrderRead &
      InventoryDeliveryRead &
      InventoryShipmentIntakeRead & { before?: string | null },
  ) => {
    const read: InventoryCatalogRead &
      InventoryPlanRead &
      InventorySupplierRead &
      InventoryLocationRead &
      InventoryExceptionRead &
      InventoryRecallRead &
      InventoryCountRead &
      InventoryControlledRead &
      InventoryStockRead &
      InventoryOrderRead &
      InventoryDeliveryRead &
      InventoryShipmentIntakeRead & { before?: string | null } = {
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
            : screen === "locations" && data && "location_page" in data
              ? {
                  q: data.location_page.query,
                  location_status: data.location_page.status,
                  page: data.location_page.page,
                }
              : screen === "exceptions" && data && "exception_page" in data
                ? {
                    q: data.exception_page.query,
                    exception_status: data.exception_page.status,
                    category: data.exception_page.category,
                    page: data.exception_page.page,
                  }
                : screen === "recalls" && data && "recall_page" in data
                  ? {
                      q: data.recall_page.query,
                      recall_status: data.recall_page.status,
                      page: data.recall_page.page,
                      recall_id: data.recall_page.selected_id ?? undefined,
                      position_page: data.position_page.page,
                      history_page: data.history_page.page,
                      lot_q: data.lot_page.query,
                      lot_page: data.lot_page.page,
                      product_id: data.lot_page.product_id ?? undefined,
                    }
                  : screen === "counts" && data && "count_page" in data
                    ? {
                        q: data.count_page.query,
                        count_status: data.count_page.status,
                        page: data.count_page.page,
                        session_id: data.count_page.selected_id ?? undefined,
                        line_page: data.line_page.page,
                        history_page: data.history_page.page,
                      }
                    : screen === "controlled" &&
                        data &&
                        "controlled_page" in data
                      ? {
                          q: data.controlled_page.query,
                          control_status: data.controlled_page.status,
                          page: data.controlled_page.page,
                        }
                      : screen === "supplier_pricing" &&
                          data &&
                          "supplier_page" in data
                        ? {
                            q: data.supplier_page.query,
                            supplier_id:
                              data.supplier_page.supplier_id ?? undefined,
                            page: data.supplier_page.page,
                            quote_request_page: data.quote_request_page?.page,
                            quote_request_status:
                              data.quote_request_page?.status,
                          }
                        : screen === "purchasing" &&
                            data &&
                            "order_page" in data
                          ? {
                              q: data.order_page.query,
                              order_status: data.order_page.status,
                              page: data.order_page.page,
                              purchase_order_id:
                                new URLSearchParams(window.location.search).get(
                                  "purchase_order_id",
                                ) ?? undefined,
                            }
                          : screen === "receiving" &&
                              data &&
                              "delivery_page" in data
                            ? {
                                q: data.delivery_page.query,
                                delivery_status: data.delivery_page.status,
                                page: data.delivery_page.page,
                                shipment_id:
                                  data.delivery_page.selected_shipment_id,
                              }
                            : screen === "shipment_new" &&
                                data &&
                                "intake_page" in data
                              ? {
                                  q: data.intake_page.query,
                                  page: data.intake_page.page,
                                  purchase_order_id:
                                    data.intake_page.selected_order_id,
                                }
                              : needsPurchaseOrderFacility &&
                                  data &&
                                  "plan_page" in data
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
        if (screen === "shipment_new") query.set("view", "intake");
        if (screen === "supplier_pricing") query.set("view", "table");
        if (screen === "locations") query.set("view", "tree");
        if (screen === "exceptions") query.set("view", "queue");
        if (screen === "recalls") query.set("view", "cases");
        if (screen === "counts") query.set("view", "program");
        if (screen === "controlled") query.set("view", "queue");
        if (needsPurchaseOrderFacility) query.set("view", "plan");
        const routeQuery = new URLSearchParams(window.location.search);
        if (
          screen === "supplier_pricing" &&
          !read.supplier_id &&
          routeQuery.get("supplier_id")
        )
          query.set("supplier_id", routeQuery.get("supplier_id")!);
        if (
          screen === "receiving" &&
          (read.delivery_status || routeQuery.get("delivery_status"))
        )
          query.set(
            "delivery_status",
            read.delivery_status || routeQuery.get("delivery_status")!,
          );
        if (read.order_status) query.set("order_status", read.order_status);
        if (read.supplier_id) query.set("supplier_id", read.supplier_id);
        if (read.quote_request_page)
          query.set("quote_request_page", String(read.quote_request_page));
        if (read.quote_request_status)
          query.set("quote_request_status", read.quote_request_status);
        if (read.location_status)
          query.set("location_status", read.location_status);
        if (read.exception_status)
          query.set("exception_status", read.exception_status);
        if (read.category) query.set("category", read.category);
        if (read.recall_status) query.set("recall_status", read.recall_status);
        if (read.recall_id) query.set("recall_id", read.recall_id);
        if (read.count_status) query.set("count_status", read.count_status);
        if (read.session_id) query.set("session_id", read.session_id);
        if (read.line_page) query.set("line_page", String(read.line_page));
        if (read.control_status)
          query.set("control_status", read.control_status);
        if (read.position_page)
          query.set("position_page", String(read.position_page));
        if (read.history_page)
          query.set("history_page", String(read.history_page));
        if (read.lot_q) query.set("lot_q", read.lot_q);
        if (read.lot_page) query.set("lot_page", String(read.lot_page));
        if (read.product_id) query.set("product_id", read.product_id);
        const shipmentId =
          read.shipment_id === undefined
            ? routeQuery.get("shipment_id")
            : read.shipment_id;
        if (screen === "receiving" && shipmentId)
          query.set("shipment_id", shipmentId);
        const purchaseOrderId =
          read.purchase_order_id === undefined
            ? routeQuery.get("purchase_order_id")
            : read.purchase_order_id;
        if (["shipment_new", "purchasing"].includes(screen) && purchaseOrderId)
          query.set("purchase_order_id", purchaseOrderId);
        if (screen === "lots" && routeQuery.get("product_id"))
          query.set("product_id", routeQuery.get("product_id")!);
        if (screen === "activity" && routeQuery.get("lot_id"))
          query.set("lot_id", routeQuery.get("lot_id")!);
        if (
          screen === "activity" &&
          read.q === undefined &&
          routeQuery.get("q")
        )
          query.set("q", routeQuery.get("q")!);
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
                : screen === "locations"
                  ? `/api/clinic/inventory/locations?${query}`
                  : screen === "exceptions"
                    ? `/api/clinic/inventory/exceptions?${query}`
                    : screen === "recalls"
                      ? `/api/clinic/inventory/recalls?${query}`
                      : screen === "counts"
                        ? `/api/clinic/inventory/count-sessions?${query}`
                        : screen === "controlled"
                          ? `/api/clinic/inventory/controlled?${query}`
                          : screen === "purchasing"
                            ? `/api/clinic/inventory/purchase-orders?${query}`
                            : screen === "supplier_pricing"
                              ? `/api/clinic/inventory/supplier-pricing?${query}`
                              : screen === "receiving"
                                ? `/api/clinic/inventory/receiving?${query}`
                                : screen === "shipment_new"
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
            | InventorySupplierData
            | InventoryLocationData
            | InventoryExceptionData
            | InventoryRecallData
            | InventoryCountData
            | InventoryControlledData
            | InventoryStockData
            | InventoryOrderData
            | InventoryDeliveryData
            | InventoryShipmentIntakeData;
        }>(endpoint, { signal: controller.signal });
        if (version !== readVersion.current) return;
        if (
          !payload.data ||
          (screen === "activity") !== "activity_page" in payload.data ||
          (screen === "catalog") !== "catalog_page" in payload.data ||
          (screen === "supplier_pricing") !== "supplier_page" in payload.data ||
          (screen === "locations") !== "location_page" in payload.data ||
          (screen === "exceptions") !== "exception_page" in payload.data ||
          (screen === "recalls") !== "recall_page" in payload.data ||
          (screen === "counts") !== "count_page" in payload.data ||
          (screen === "controlled") !== "controlled_page" in payload.data ||
          needsPurchaseOrderFacility !== "plan_page" in payload.data ||
          (screen === "lots") !== "stock_page" in payload.data ||
          (screen === "purchasing") !== "order_page" in payload.data ||
          (screen === "receiving") !== "delivery_page" in payload.data ||
          (screen === "shipment_new") !== "intake_page" in payload.data
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
    successDetail: string | ((payload: InventoryMutationResult) => string),
    afterSuccess?: (payload: InventoryMutationResult) => void,
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
    const requestScope = mutationOwner.current.scope;
    const requestRun = ++busyRunOwner.current;
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
      const payload = await api<
        {
          data?: InventoryData;
          acknowledged?: boolean;
        } & InventoryMutationResult
      >(
        inventoryUsesAcknowledgement(screen)
          ? `${endpoint}?response=ack`
          : endpoint,
        {
          method: "POST",
          body: requestBody,
        },
      );
      if (!inventoryMutationResponseOwned(mutationOwner.current, requestScope))
        return;
      if (inventoryUsesAcknowledgement(screen)) {
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
        detail:
          typeof successDetail === "function"
            ? successDetail(payload)
            : successDetail,
      });
      afterSuccess?.(payload);
      if (inventoryUsesAcknowledgement(screen)) await load();
    } catch (reason) {
      if (!inventoryMutationResponseOwned(mutationOwner.current, requestScope))
        return;
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
      if (mutationOwner.current.mounted && busyRunOwner.current === requestRun)
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
    !("supplier_page" in data) &&
    !("location_page" in data) &&
    !("exception_page" in data) &&
    !("recall_page" in data) &&
    !("count_page" in data) &&
    !("controlled_page" in data) &&
    !("stock_page" in data) &&
    !("order_page" in data) &&
    !("delivery_page" in data) &&
    !("intake_page" in data) &&
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
                label={
                  data.configuration?.status === "configured"
                    ? "Configured"
                    : "Setup required"
                }
                color={
                  data.configuration?.status === "configured"
                    ? "success"
                    : "warning"
                }
                size="small"
                variant="outlined"
                aria-label="Inventory configuration status"
              />
              <span className="inventory-header-meta">
                Updated {inventoryDateTime(data.as_of, data.timezone)} ·{" "}
                {data.timezone}
              </span>
              <Button
                variant="outlined"
                size="medium"
                startIcon={<RefreshRoundedIcon />}
                type="button"
                disabled={loading || reconciliationPending}
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
                            (link.screen === "supplier_pricing"
                              ? data.capabilities.supplier_pricing === true
                              : link.screen === "replenishment" ||
                                  link.screen === "purchasing"
                                ? data.capabilities["procurement.read"] === true
                                : link.screen === "recalls"
                                  ? data.capabilities["recall.read"] === true
                                  : link.screen === "controlled"
                                    ? data.capabilities["controlled.read"] ===
                                      true
                                    : true),
                        )
                        .map((link) => (
                          <Button
                            key={link.screen}
                            variant="text"
                            href={link.href}
                            title={link.label}
                            aria-current={
                              screen === link.screen ? "page" : undefined
                            }
                          >
                            {link.short}
                          </Button>
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
                busy={busy}
                pendingMutation={uncertainMutation}
                run={run}
              />
            ) : "catalog_page" in data ? (
              <CatalogScreen
                data={data}
                loading={loading}
                error={error}
                onRead={load}
              />
            ) : "supplier_page" in data ? (
              <SupplierPricingScreen
                data={data}
                loading={loading}
                error={error}
                readBlocked={Boolean(uncertainMutation)}
                onRead={load}
              />
            ) : "location_page" in data ? (
              <InventoryLocationsScreen
                data={data}
                loading={loading}
                error={error}
                readBlocked={Boolean(uncertainMutation)}
                onRead={load}
              />
            ) : "exception_page" in data ? (
              <InventoryExceptionsScreen
                data={data}
                loading={loading}
                error={error}
                busy={busy}
                pendingMutation={uncertainMutation}
                onRead={load}
                run={run}
              />
            ) : "recall_page" in data ? (
              <RecallScreen
                data={data}
                loading={loading}
                error={error}
                busy={busy}
                pendingMutation={uncertainMutation}
                onRead={load}
                run={run}
              />
            ) : "count_page" in data ? (
              <CycleCountsScreen
                data={data}
                loading={loading}
                error={error}
                busy={busy}
                pendingMutation={uncertainMutation}
                onRead={load}
                run={run}
              />
            ) : "controlled_page" in data ? (
              <ControlledScreen
                data={data}
                loading={loading}
                error={error}
                busy={busy}
                pendingMutation={uncertainMutation}
                onRead={load}
                run={run}
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
                onReconciliationBlocked={setReconciliationPending}
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
            ) : "intake_page" in data ? (
              <ShipmentCreateScreen
                data={data}
                busy={busy}
                readBlocked={Boolean(uncertainMutation)}
                loading={loading}
                error={error}
                run={run}
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
        {data.configuration?.status === "configured" && (
          <InventoryFirstRunWizard data={data} />
        )}
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
      {data.configuration?.status === "configured" &&
        !inventoryFirstRunComplete(data.first_run) && (
          <InventoryFirstRunWizard data={data} />
        )}
      <Card className="inventory-catalog">
        <div className="inventory-catalog-topline">
          <div>
            <h2>Catalog and lot traceability</h2>
            <p className="inventory-flow-note">
              Quantities are shown in base units unless a package unit is named.
            </p>
          </div>
          <div className="inventory-catalog-actions">
            {capability(data, "inventory.catalog") && (
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
            )}
            {capability(data, "inventory.receive") && (
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
            )}
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
          <div
            className="inventory-empty-state inventory-empty-state--compact"
            role="status"
          >
            <strong>No products match this view</strong>
            <p>
              Change the search or clear the filters to review recorded products.
            </p>
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
                Clear catalog filters
              </Button>
            )}
          </div>
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
                    {number(item.on_hand_units)} {item.base_unit}
                  </td>
                  <td data-label="Reorder point" className="numeric">
                    {number(item.reorder_point_units)} {item.base_unit}
                  </td>
                  <td data-label="Status">
                    <Badge tone={item.low_stock ? "warning" : "success"}>
                      {decimalCompare(item.available_units, "0") === 0 &&
                      decimalCompare(item.reorder_point_units, "0") === 0
                        ? "Out of stock"
                        : decimalCompare(
                              item.available_units,
                              item.reorder_point_units,
                            ) < 0
                          ? "Below reorder point"
                          : item.low_stock
                            ? "At reorder point"
                            : "In range"}
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

function inventoryFirstRunComplete(
  firstRun: InventoryCatalogData["first_run"],
) {
  return [
    firstRun.supplier,
    firstRun.product,
    firstRun.offer,
    firstRun.purchase_order,
    firstRun.received,
    firstRun.binned,
  ].every(Boolean);
}

function InventoryFirstRunWizard({ data }: { data: InventoryCatalogData }) {
  const firstRun = data.first_run;
  const canSetUpSuppliers =
    data.capabilities.supplier_pricing === true &&
    capability(data, "inventory.catalog");
  const productQuery = firstRun.product_id
    ? `?product_id=${encodeURIComponent(firstRun.product_id)}&wizard=1`
    : "?wizard=1";
  const offerParams = new URLSearchParams({ wizard: "offer" });
  if (firstRun.supplier_id)
    offerParams.set("supplier_id", firstRun.supplier_id);
  if (firstRun.product_name)
    offerParams.set("product_name", firstRun.product_name);
  const purchaseOrderQuery = firstRun.purchase_order_id
    ? `?purchase_order_id=${encodeURIComponent(firstRun.purchase_order_id)}&wizard=1`
    : "?wizard=1";
  const shipmentQuery = firstRun.shipment_id
    ? `?shipment_id=${encodeURIComponent(firstRun.shipment_id)}&delivery_status=all&wizard=1`
    : purchaseOrderQuery;
  const receivingHref = firstRun.shipment_id
    ? `/clinic/inventory/receiving${shipmentQuery}`
    : `/clinic/inventory/shipments/new${purchaseOrderQuery}`;
  const purchaseOrderReady = [
    "sent",
    "partially_received",
    "complete",
  ].includes(firstRun.purchase_order_status ?? "");
  const steps = [
    {
      title: "Add a supplier",
      detail: "Create the vendor that will appear on purchase orders.",
      href: "/clinic/inventory/suppliers?wizard=1",
      requiresSupplierSetup: true,
      action: "Open suppliers",
      complete: firstRun.supplier,
    },
    {
      title: "Add the catalog item",
      detail: "Define the product and its package before recording an offer.",
      href: "/clinic/inventory/catalog/new?wizard=1",
      action: "Add catalog item",
      complete: firstRun.product,
    },
    {
      title: "Record the supplier offer",
      detail: "Save the supplier SKU, package, price, and currency.",
      href: `/clinic/inventory/suppliers?${offerParams}`,
      requiresSupplierSetup: true,
      action: "Record offer",
      complete: firstRun.offer,
    },
    {
      title: "Create the purchase order",
      detail: "Choose the supplier offer, quantity, and receiving facility.",
      href:
        firstRun.purchase_order && !purchaseOrderReady
          ? `/clinic/inventory/purchasing?purchase_order_id=${encodeURIComponent(firstRun.purchase_order_id ?? "")}&wizard=review`
          : `/clinic/inventory/purchasing/new${productQuery}`,
      action: "Create order",
      complete: firstRun.purchase_order && purchaseOrderReady,
    },
    {
      title: "Receive the delivery",
      detail: firstRun.shipment_id
        ? "Verify the delivery, lot, expiration, and received packages."
        : "Record the delivered shipment before receiving its lots.",
      href: receivingHref,
      action: firstRun.shipment_id ? "Open receiving" : "Record delivery",
      complete: firstRun.received,
    },
    {
      title: "Put stock in a bin",
      detail: "Choose the storage location while receiving each lot.",
      href: receivingHref,
      action: "Open receiving",
      complete: firstRun.binned,
    },
  ];
  const nextStepIndex = steps.findIndex((step) => !step.complete);
  const remainingSteps = steps.filter((step) => !step.complete).length;
  const nextStep = nextStepIndex >= 0 ? steps[nextStepIndex] : null;
  return (
    <Accordion
      className="inventory-first-run"
      disableGutters
      elevation={0}
      defaultExpanded={false}
      square
      sx={{
        mb: 2,
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        bgcolor: "background.paper",
        overflow: "hidden",
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary
        id="inventory-first-run-heading"
        aria-controls="inventory-first-run-panel"
        expandIcon={<ExpandMoreRoundedIcon />}
        sx={{
          minHeight: 52,
          px: 2,
          "&.Mui-expanded": { minHeight: 52 },
          "& .MuiAccordionSummary-content, & .MuiAccordionSummary-content.Mui-expanded": {
            my: 1,
          },
        }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          useFlexGap
          sx={{ alignItems: "center", flexWrap: "wrap", minWidth: 0 }}
        >
          <Typography component="span" sx={{ fontWeight: 650 }}>
            First inventory run
          </Typography>
          <Typography component="span" variant="body2" color="text.secondary">
            {remainingSteps} step{remainingSteps === 1 ? "" : "s"} remaining
          </Typography>
          <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
            {nextStep ? `Next: ${nextStep.title}` : "All steps complete"}
          </Typography>
          {nextStep?.requiresSupplierSetup && !canSetUpSuppliers && (
            <Typography component="span" variant="body2" color="text.secondary">
              Supplier setup access required
            </Typography>
          )}
        </Stack>
      </AccordionSummary>
      <AccordionDetails
        id="inventory-first-run-panel"
        aria-labelledby="inventory-first-run-heading"
        sx={{ borderTop: 1, borderColor: "divider", px: 2, py: 1.5 }}
      >
        <section aria-labelledby="inventory-first-run-title">
          <h2 id="inventory-first-run-title">First inventory run</h2>
          <p className="inventory-lead">
            Follow the saved workflow from supplier setup through stock stored
            in a bin. Each step opens the existing inventory action for that
            record.
          </p>
          <ol>
            {steps.map((step, index) => (
              <li key={step.title}>
                <strong>
                  {step.complete
                    ? "Complete"
                    : index === nextStepIndex
                      ? "Next"
                      : "Not started"}
                  : {step.title}
                </strong>{" "}
                — {step.detail}{" "}
                {!step.complete &&
                  (step.requiresSupplierSetup && !canSetUpSuppliers ? (
                    <PermissionNote
                      allowed={false}
                      permission="Supplier setup access"
                    />
                  ) : (
                    <a href={step.href}>Continue to {step.title} →</a>
                  ))}
              </li>
            ))}
          </ol>
        </section>
      </AccordionDetails>
    </Accordion>
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

