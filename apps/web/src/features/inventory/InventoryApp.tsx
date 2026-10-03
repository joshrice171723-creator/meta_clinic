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
  InventorySetupData,
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
  data: InventorySetupData;
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
      if (inventoryUsesAcknowledgement(screen) && payload.acknowledged !== true)
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
      if (inventoryUsesAcknowledgement(screen) && payload.acknowledged !== true)
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
  data: InventorySetupData;
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
    | InventorySetupData
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
      "setup_page" in data ||
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
                                    : "/api/clinic/inventory/bootstrap?view=setup";
        const payload = await api<{
          data:
            | InventoryData
            | InventorySetupData
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
          ["catalog_new", "configure"].includes(screen) !==
            "setup_page" in payload.data ||
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
        { acknowledged?: boolean } & InventoryMutationResult
      >(endpoint, {
        method: "POST",
        body: requestBody,
      });
      if (!inventoryMutationResponseOwned(mutationOwner.current, requestScope))
        return;
      if (inventoryUsesAcknowledgement(screen) && payload.acknowledged !== true)
        throw new Error(
          "The inventory action response could not be confirmed.",
        );
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
      await load();
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
    !("setup_page" in data) &&
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
                {screen === "catalog_new" && "setup_page" in data && (
                  <CatalogCreateScreen data={data} busy={busy} run={run} />
                )}
                {screen === "configure" && "setup_page" in data && (
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
              Change the search or clear the filters to review recorded
              products.
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
          "& .MuiAccordionSummary-content, & .MuiAccordionSummary-content.Mui-expanded":
            {
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
  const syncedCart = useRef<InventoryPurchaseCart | null | undefined>(
    data.purchase_cart,
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
    const previousCart = syncedCart.current;
    setReason(
      (current) =>
        mergePurchaseCartDraft(previousCart, cart, {
          reason: current,
          destinationId,
          lineQuantities,
        }).reason,
    );
    setDestinationId(
      (current) =>
        mergePurchaseCartDraft(previousCart, cart, {
          reason,
          destinationId: current,
          lineQuantities,
        }).destinationId,
    );
    setLineQuantities(
      (current) =>
        mergePurchaseCartDraft(previousCart, cart, {
          reason,
          destinationId,
          lineQuantities: current,
        }).lineQuantities,
    );
    syncedCart.current = cart;
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
      if (inventoryUsesAcknowledgement(screen) && payload.acknowledged !== true)
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
  const updateItem = (id: string, currentQuantity: string) => {
    const requestedPackages =
      lineQuantities[id] === undefined
        ? currentQuantity
        : lineQuantities[id].trim();
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
  const subtotals = Object.entries(
    (cart?.items ?? []).reduce<Record<string, Decimal>>((totals, item) => {
      totals[item.currency] = decimalAdd(
        totals[item.currency] ?? "0",
        item.extended_cost,
      );
      return totals;
    }, {}),
  ).sort(([left], [right]) => left.localeCompare(right));
  const mixedCurrencies = subtotals.length > 1;
  const supplierCount = new Set(
    (cart?.items ?? []).map((item) => item.supplier_id).filter(Boolean),
  ).size;
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
      if (inventoryUsesAcknowledgement(screen) && payload.acknowledged !== true)
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
        title={directEntry ? "Choose items for purchase" : "Plan replenishment"}
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
            className="purchase-catalog-search"
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
                    ? money(offer.total_cost, offer.currency)
                    : "No eligible offer"}
                  <small>
                    {offer
                      ? `${offer.supplier_name} · ${number(offer.supplier_packages)} supplier packages · ${number(offer.overage_units)} ${product.base_unit} over requested${offer.lead_time_days == null ? "" : ` · ${offer.lead_time_days} day lead`}`
                      : (explanation?.offer_error ??
                        "Supplier terms unavailable")}
                  </small>
                  {!offer &&
                    data.capabilities.supplier_pricing === true &&
                    capability(data, "inventory.catalog") && (
                      <Button
                        component="a"
                        href={`/clinic/inventory/suppliers?${new URLSearchParams({ wizard: "offer", product_name: product.name })}`}
                        size="small"
                      >
                        Record supplier offer
                      </Button>
                    )}
                  {offer && (
                    <small>
                      {money(offer.unit_price, offer.currency)} per supplier
                      package · {number(offer.desired_units)}{" "}
                      {product.base_unit} requested
                    </small>
                  )}
                </div>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={
                    busy ||
                    writeBlocked ||
                    Boolean(cartAction) ||
                    !offer ||
                    !canProcure ||
                    alreadyInCart ||
                    hasUnitMismatch
                  }
                  onClick={() => addItem(product)}
                >
                  {alreadyInCart ? "In cart" : "Add to cart"}
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
      <Card title="Review purchase cart" className="purchase-cart-panel">
        <PermissionNote allowed={canProcure} permission="procurement.create" />
        <div className="inventory-form-grid compact purchase-cart-details">
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
        {mixedCurrencies && (
          <Alert severity="warning">
            This draft contains multiple currencies. Review or remove lines
            until one currency remains before checkout.
          </Alert>
        )}
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
                    updateItem(item.id, item.requested_packages);
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
                        !canProcure
                      }
                    >
                      {cartAction === `update:${item.id}`
                        ? "Refreshing…"
                        : unchanged
                          ? "Refresh offer"
                          : "Save quantity"}
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
            {subtotals.length
              ? subtotals
                  .map(([currency, total]) => money(total, currency))
                  .join(" · ")
              : "0.00"}
          </strong>
        </div>
        <Button
          variant="contained"
          disabled={
            busy ||
            writeBlocked ||
            Boolean(cartAction) ||
            hasUnsavedLineChanges ||
            mixedCurrencies ||
            !cart?.items.length ||
            !destinationId ||
            !reason.trim() ||
            !canProcure
          }
          onClick={() => void checkout()}
        >
          {cartAction === "checkout"
            ? "Creating purchase orders…"
            : "Create purchase orders"}
        </Button>
      </Card>
    </div>
  );
}

function ShipmentCreateScreen({
  data,
  busy,
  readBlocked,
  loading,
  error,
  run,
  onRead,
}: {
  data: InventoryShipmentIntakeData;
  busy: boolean;
  readBlocked: boolean;
  loading: boolean;
  error: string;
  run: InventoryRun;
  onRead: (read: InventoryShipmentIntakeRead) => Promise<void>;
}) {
  const result = data.intake_page;
  const order = data.selected_order;
  const [query, setQuery] = useState(result.query);
  const [lineId, setLineId] = useState("");
  const [packages, setPackages] = useState("");
  const [reference, setReference] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [carrier, setCarrier] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  useEffect(() => setQuery(result.query), [result.query]);
  useEffect(() => {
    const firstAvailable = order?.lines.find(
      (candidate) => decimalCompare(candidate.available_packages, "0") > 0,
    );
    setLineId(firstAvailable?.id ?? order?.lines[0]?.id ?? "");
    setPackages("");
  }, [order?.id]);
  const line = order?.lines.find((record) => record.id === lineId) ?? null;
  const availablePackages = line?.available_packages ?? "0";
  const writeDisabled = busy || loading || readBlocked;
  const hasWholePositivePackages =
    /^\d+$/.test(packages) && decimalCompare(packages, "0") > 0;
  const canSubmit =
    !writeDisabled &&
    Boolean(order) &&
    Boolean(line) &&
    capability(data, "inventory.receive") &&
    hasWholePositivePackages &&
    decimalCompare(packages, availablePackages) <= 0 &&
    Boolean(reference.trim()) &&
    Boolean(supplierReference.trim());
  const selectedOption = order
    ? {
        id: order.id,
        number: order.number,
        status: order.status,
        supplier: order.supplier,
        destination: order.destination,
      }
    : null;
  const orderOptions =
    selectedOption &&
    !data.order_options.some((option) => option.id === selectedOption.id)
      ? [selectedOption, ...data.order_options]
      : data.order_options;
  const selectOrder = (purchaseOrderId: string) =>
    void onRead({
      q: result.query,
      page: result.page,
      purchase_order_id: purchaseOrderId,
    });
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    void onRead({
      q: query.trim(),
      page: 1,
      purchase_order_id: result.selected_order_id,
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !order || !line) return;
    void run(
      "/api/clinic/inventory/shipments",
      {
        shipment: {
          purchase_order_id: order.id,
          purchase_order_line_id: line.id,
          reference: reference.trim(),
          supplier_reference: supplierReference.trim(),
          carrier: carrier.trim(),
          tracking_number: trackingNumber.trim(),
          package_count: packages,
        },
      },
      "Shipment registered",
      `${number(packages)} packages are reserved for this purchase order. No inventory is added until receiving.`,
      (payload) => {
        const shipmentId = payload.id;
        window.location.assign(
          `/clinic/inventory/purchasing?purchase_order_id=${encodeURIComponent(order.id)}${shipmentId ? `#shipment-${encodeURIComponent(String(shipmentId))}` : ""}`,
        );
      },
    );
  };
  return (
    <div className="inventory-stack">
      <a className="inventory-back-link" href="/clinic/inventory/purchasing">
        ← Back to orders & delivery
      </a>
      <div className="inventory-two-col wide-left">
        <Card title="Register shipment">
          <p className="inventory-lead">
            Record a supplier shipment and track staff-entered status updates.
            No carrier is contacted and inventory is not added until Receiving
            confirms the lot and put-away details.
          </p>
          <form className="inventory-toolbar" onSubmit={submitSearch}>
            <TextField
              size="small"
              label="Search open purchase orders"
              placeholder="Order number, supplier, or destination"
              value={query}
              disabled={writeDisabled}
              onChange={(event) => setQuery(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            <Button type="submit" variant="outlined" disabled={writeDisabled}>
              Search orders
            </Button>
          </form>
          <p className="inventory-results-count" role="status">
            {loading
              ? "Loading open purchase orders…"
              : `Showing ${result.filtered_count === 0 ? 0 : (result.page - 1) * result.page_size + 1}–${Math.min(result.page * result.page_size, result.filtered_count)} of ${result.filtered_count} open purchase orders.`}
          </p>
          {error && (
            <Alert severity="error">
              {error} The previous selection remains available.
            </Alert>
          )}
          <form className="inventory-form-grid" onSubmit={submit}>
            <TextField
              select
              label="Purchase order"
              value={order?.id ?? ""}
              disabled={writeDisabled || orderOptions.length === 0}
              onChange={(event) => selectOrder(event.target.value)}
              helperText="Sent and partially received orders only."
            >
              {orderOptions.length === 0 ? (
                <MenuItem value="">No open purchase orders found</MenuItem>
              ) : (
                orderOptions.map((record) => (
                  <MenuItem key={record.id} value={record.id}>
                    {record.number} · {record.status.replaceAll("_", " ")}
                    {record.supplier ? ` · ${record.supplier}` : ""}
                  </MenuItem>
                ))
              )}
            </TextField>
            {result.page_count > 1 && (
              <div className="inventory-form-actions">
                <Button
                  type="button"
                  variant="outlined"
                  disabled={writeDisabled || result.page === 1}
                  onClick={() =>
                    void onRead({
                      q: result.query,
                      page: result.page - 1,
                      purchase_order_id: result.selected_order_id,
                    })
                  }
                >
                  Previous page
                </Button>
                <span aria-live="polite">
                  Page {result.page} of {result.page_count}
                </span>
                <Button
                  type="button"
                  variant="outlined"
                  disabled={writeDisabled || result.page === result.page_count}
                  onClick={() =>
                    void onRead({
                      q: result.query,
                      page: result.page + 1,
                      purchase_order_id: result.selected_order_id,
                    })
                  }
                >
                  Next page
                </Button>
              </div>
            )}
            {order && line && (
              <>
                <TextField
                  select
                  label="Order line"
                  value={line.id}
                  disabled={writeDisabled}
                  onChange={(event) => {
                    setLineId(event.target.value);
                    setPackages("");
                  }}
                >
                  {order.lines.map((record) => (
                    <MenuItem key={record.id} value={record.id}>
                      {record.product_name} ·{" "}
                      {number(record.available_packages)} packages available
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Packages in shipment"
                  type="number"
                  value={packages}
                  disabled={
                    writeDisabled || decimalCompare(availablePackages, "0") <= 0
                  }
                  onChange={(event) => setPackages(event.target.value)}
                  slotProps={{
                    htmlInput: {
                      min: 1,
                      max: Number(availablePackages),
                      step: 1,
                    },
                  }}
                  helperText={`${number(line.ordered_packages)} ordered · ${number(line.received_packages)} received · ${number(line.allocated_packages)} allocated · ${number(availablePackages)} available`}
                  required
                />
                {decimalCompare(availablePackages, "0") <= 0 && (
                  <Alert severity="info">
                    This line is fully allocated to open deliveries. Select
                    another line or wait for receiving to reconcile an existing
                    delivery.
                  </Alert>
                )}
                <TextField
                  label="Internal shipment reference"
                  value={reference}
                  disabled={writeDisabled}
                  onChange={(event) => setReference(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 80 } }}
                  helperText="A unique receiving record, such as SHIP-2026-001."
                  required
                />
                <TextField
                  label="Supplier delivery reference"
                  value={supplierReference}
                  disabled={writeDisabled}
                  onChange={(event) => setSupplierReference(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 120 } }}
                  helperText="Use the packing slip, tracking, or delivery number."
                  required
                />
                <TextField
                  label="Carrier (optional)"
                  value={carrier}
                  disabled={writeDisabled}
                  onChange={(event) => setCarrier(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 80 } }}
                />
                <TextField
                  label="Tracking number (optional)"
                  value={trackingNumber}
                  disabled={writeDisabled}
                  onChange={(event) => setTrackingNumber(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 120 } }}
                />
              </>
            )}
            {!order && (
              <Alert severity="info">
                No matching open purchase orders. Search again or create and
                send a purchase order before recording delivery.
              </Alert>
            )}
            <div className="inventory-form-actions">
              <PermissionNote
                allowed={capability(data, "inventory.receive")}
                permission="inventory.receive"
              />
              <ConfirmButton
                disabled={!canSubmit}
                onConfirm={() => {
                  const fake = new Event("submit") as unknown as FormEvent;
                  submit(fake);
                }}
              >
                Register shipment
              </ConfirmButton>
            </div>
          </form>
        </Card>
        <Card title="Delivery handoff">
          <div className="inventory-stack compact">
            <DataPoint
              label="PO status"
              value={order?.status.replaceAll("_", " ") ?? "Not selected"}
              detail={order?.destination ?? "Select an open purchase order"}
              tone="blue"
            />
            <DataPoint
              label="This shipment"
              value={`${number(packages)} packages`}
              detail={
                line
                  ? `${number(decimalMultiply(packages || "0", line.units_per_package))} ${line.stock_unit}`
                  : "Choose a purchase-order line"
              }
            />
            <DataPoint
              label="Next screen"
              value="Manual tracking"
              detail="Record status changes; receive only after arrival"
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
  readBlocked,
  loading,
  error,
  onRead,
  run,
  onReconciliationBlocked,
}: {
  data: InventoryOrderData;
  busy: boolean;
  readBlocked: boolean;
  loading: boolean;
  error: string;
  onRead: (read: InventoryOrderRead) => Promise<void>;
  onReconciliationBlocked: (blocked: boolean) => void;
  run: InventoryRun;
}) {
  const page = data.order_page;
  const [query, setQuery] = useState(page.query);
  useEffect(() => setQuery(page.query), [page.query]);
  const applied = { q: page.query, order_status: page.status, page: page.page };
  const [reconciliationBlocked, setReconciliationBlocked] = useState(false);
  useEffect(() => {
    onReconciliationBlocked(reconciliationBlocked);
    return () => onReconciliationBlocked(false);
  }, [reconciliationBlocked, onReconciliationBlocked]);
  const disabled = loading || busy || readBlocked || reconciliationBlocked;
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
          busy={busy || reconciliationBlocked}
          run={run}
          onChanged={() => void onRead(applied)}
          onBlockedChange={setReconciliationBlocked}
          preparationBusy={busy || loading || readBlocked}
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
  preparationBusy,
  data,
  busy,
  run,
  onChanged,
  onBlockedChange,
}: {
  preparationBusy: boolean;
  data: InventoryOrderData;
  busy: boolean;
  onChanged: () => void;
  onBlockedChange: (blocked: boolean) => void;
  run: InventoryRun;
}) {
  const [deliveryBlocked, setDeliveryBlocked] = useState(false);
  const [financeBlocked, setFinanceBlocked] = useState(false);
  const [carrierBlocks, setCarrierBlocks] = useState<Record<string, boolean>>(
    {},
  );
  const carrierBlocked = Object.values(carrierBlocks).some(Boolean);
  const setCarrierBlocked = useCallback(
    (shipmentId: string, blocked: boolean) => {
      setCarrierBlocks((current) => {
        if (Boolean(current[shipmentId]) === blocked) return current;
        const next = { ...current };
        if (blocked) next[shipmentId] = true;
        else delete next[shipmentId];
        return next;
      });
    },
    [],
  );
  useEffect(() => {
    onBlockedChange(deliveryBlocked || financeBlocked || carrierBlocked);
    return () => onBlockedChange(false);
  }, [deliveryBlocked, financeBlocked, carrierBlocked, onBlockedChange]);
  const orderGroups = useMemo(
    () => purchaseOrderGroups(data.purchase_orders),
    [data.purchase_orders],
  );
  const requestedOrderId = new URLSearchParams(window.location.search).get(
    "purchase_order_id",
  );
  const [orderId, setOrderId] = useState(
    data.purchase_orders.some((record) => record.id === requestedOrderId)
      ? requestedOrderId!
      : (data.purchase_orders[0]?.id ?? ""),
  );
  const [expandedGroupId, setExpandedGroupId] = useState(
    orderGroups[0]?.id ?? "",
  );
  const [actionReason, setActionReason] = useState("");
  const [confirmationAction, setConfirmationAction] = useState<
    "transition" | "cancel" | null
  >(null);
  const [shipmentEventDrafts, setShipmentEventDrafts] = useState<
    Record<string, { status: string; note: string }>
  >({});
  const canSelectOrder =
    !busy &&
    !preparationBusy &&
    !deliveryBlocked &&
    !financeBlocked &&
    !carrierBlocked &&
    !actionReason.trim() &&
    confirmationAction === null &&
    Object.keys(shipmentEventDrafts).length === 0;
  const selectOrder = (nextOrderId: string) => {
    if (canSelectOrder) setOrderId(nextOrderId);
  };
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
  const orderShipments = data.shipments.filter(
    (record) => record.po_id === order.id,
  );
  const updateShipmentDraft = (
    shipmentId: string,
    patch: Partial<{ status: string; note: string }>,
  ) =>
    setShipmentEventDrafts((current) => ({
      ...current,
      [shipmentId]: {
        status:
          patch.status ??
          current[shipmentId]?.status ??
          orderShipments.find((shipment) => shipment.id === shipmentId)
            ?.allowed_next_statuses?.[0] ??
          "",
        note: patch.note ?? current[shipmentId]?.note ?? "",
      },
    }));
  const allocatedPackages = (lineId: string) =>
    decimalSum(
      orderShipments
        .filter(
          (shipment) =>
            !["received", "reconciled_with_discrepancy"].includes(
              shipment.status,
            ),
        )
        .flatMap((shipment) => shipment.allocations ?? [])
        .filter((allocation) => allocation.purchase_order_line_id === lineId)
        .map((allocation) => allocation.expected_packages),
    );
  const hasAvailable = order.lines.some(
    (line) =>
      decimalCompare(
        decimalSubtract(
          decimalSubtract(line.ordered_packages, line.received_packages),
          allocatedPackages(line.id),
        ),
        "0",
      ) > 0,
  );
  const hasRemaining = order.lines.some(
    (record) =>
      decimalCompare(
        decimalSubtract(record.ordered_packages, record.received_packages),
        "0",
      ) > 0,
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
      <Card title="Review purchase batches">
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
                  disabled={busy}
                  aria-expanded={expanded}
                  onClick={() => {
                    const willExpand = !expanded;
                    setExpandedGroupId(willExpand ? group.id : "");
                    if (willExpand && group.orders.length === 1)
                      selectOrder(group.orders[0].id);
                  }}
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
                        disabled={!canSelectOrder}
                        aria-current={
                          record.id === order.id ? "true" : undefined
                        }
                        onClick={() => selectOrder(record.id)}
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
              {order.supplier ?? "Supplier not recorded"} → {order.destination}{" "}
              · created {inventoryDateTime(order.created_at, data.timezone)}
            </p>
            {order.destination_address && (
              <p className="inventory-lead">
                Deliver to: {order.destination_address}
              </p>
            )}
          </div>
        </div>
      </Card>
      <Card title="Review order lines">
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
                const baseUnit =
                  line.stock_unit ?? item?.base_unit ?? "unavailable unit";
                const remaining = nonNegative(
                  decimalSubtract(
                    line.ordered_packages,
                    line.received_packages,
                  ),
                );
                const allocated = allocatedPackages(line.id);
                const available = nonNegative(
                  decimalSubtract(remaining, allocated),
                );
                return (
                  <tr key={line.id}>
                    <td>
                      <strong>{line.product_name ?? item?.name}</strong>
                      <small>
                        {`${number(line.units_per_package)} ${baseUnit} / ${packageUnit}`}{" "}
                        · NDC {item?.ndc}
                      </small>
                    </td>
                    <td className="numeric">
                      <strong>
                        {number(line.ordered_packages)} {packageUnit} ordered
                      </strong>
                      <small>
                        {number(line.received_packages)} received ·{" "}
                        {number(remaining)} remaining
                      </small>
                      <small>
                        {number(allocated)} awaiting receiving ·{" "}
                        {number(available)} available to record
                      </small>
                      <small>
                        {number(line.ordered_units)} {baseUnit} total
                      </small>
                    </td>
                    <td className="numeric">
                      {money(line.package_price, line.currency)} / {packageUnit}
                      {line.quote_reference && (
                        <small>
                          Quote {line.quote_reference} · {line.quoted_on}
                          <br />
                          {quoteFeeEvidenceLabel(line)}
                        </small>
                      )}
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
              hasAvailable && (
                <a
                  className="inventory-button outline"
                  href={`/clinic/inventory/shipments/new?purchase_order_id=${order.id}`}
                >
                  Record delivery
                </a>
              )}
            {next && (
              <ConfirmButton
                key={`transition-${order.id}-${next[0]}`}
                tone="primary"
                disabled={
                  busy ||
                  confirmationAction !== null ||
                  !capability(data, next[2])
                }
                onOpen={() => {
                  setActionReason("");
                  setConfirmationAction("transition");
                }}
                onCancel={() => {
                  setActionReason("");
                  setConfirmationAction(null);
                }}
                confirmationTitle={`${next[1]}?`}
                confirmationContent={actionReasonField}
                confirmDisabled={actionConfirmDisabled(next[2])}
                confirmLabel={next[1]}
                onConfirm={() => {
                  setConfirmationAction(null);
                  transition();
                }}
              >
                {next[1]}
              </ConfirmButton>
            )}
            {order.status !== "complete" && order.status !== "cancelled" && (
              <div className="inventory-order-cancel">
                <ConfirmButton
                  key={`cancel-${order.id}`}
                  tone="outline"
                  disabled={
                    busy ||
                    confirmationAction !== null ||
                    !hasRemaining ||
                    !capability(data, "procurement.submit")
                  }
                  onOpen={() => {
                    setActionReason("");
                    setConfirmationAction("cancel");
                  }}
                  onCancel={() => {
                    setActionReason("");
                    setConfirmationAction(null);
                  }}
                  confirmationTitle="Cancel remaining quantities?"
                  confirmationContent={actionReasonField}
                  confirmDisabled={actionConfirmDisabled("procurement.submit")}
                  confirmLabel="Cancel remainder"
                  onConfirm={() => {
                    setConfirmationAction(null);
                    cancel();
                  }}
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
        {orderShipments.length > 0 && (
          <div className="inventory-stack" aria-label="Recorded deliveries">
            {orderShipments.map((shipment) => {
              const events = shipment.events ?? [];
              const allowedStatuses = capability(data, "inventory.receive")
                ? (shipment.allowed_next_statuses ?? [])
                : [];
              const draft = shipmentEventDrafts[shipment.id] ?? {
                status: allowedStatuses[0] ?? "",
                note: "",
              };
              const canOpenReceiving = [
                "delivered",
                "exception",
                "received",
                "reconciled_with_discrepancy",
              ].includes(shipment.status);
              return (
                <section
                  className="inventory-stack compact"
                  id={`shipment-${shipment.id}`}
                  key={shipment.id}
                  aria-label={`Shipment ${shipment.supplier_reference}`}
                >
                  <Typography component="h3" variant="subtitle2">
                    Shipment {shipment.supplier_reference} ·{" "}
                    {shipment.status.replaceAll("_", " ")}
                  </Typography>
                  <Typography variant="body2">
                    {shipment.carrier || "Carrier not recorded"}
                    {shipment.tracking_number
                      ? ` · Tracking ${shipment.tracking_number}`
                      : " · Tracking number not recorded"}
                    {shipment.delivered_at
                      ? ` · Delivered ${new Date(shipment.delivered_at).toLocaleString()}`
                      : ""}
                  </Typography>
                  <CarrierTrackingPreparation
                    key={`${data.practice.id}:${data.current_user_id}:${shipment.id}`}
                    shipmentId={shipment.id}
                    canPrepare={capability(data, "inventory.receive")}
                    externalBusy={
                      preparationBusy ||
                      financeBlocked ||
                      deliveryBlocked ||
                      (carrierBlocked && !carrierBlocks[shipment.id])
                    }
                    onBlockedChange={setCarrierBlocked}
                  />
                  {events.length > 0 ? (
                    events.map((event) => (
                      <Typography variant="body2" key={event.id}>
                        {event.status.replaceAll("_", " ")} ·{" "}
                        {new Date(event.recorded_at).toLocaleString()} · Staff #
                        {event.recorded_by_membership_id} · {event.note}
                      </Typography>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No manual status updates yet.
                    </Typography>
                  )}
                  {allowedStatuses.length > 0 && (
                    <form
                      className="inventory-form-grid"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!draft.status || !draft.note.trim()) return;
                        void run(
                          `/api/clinic/inventory/shipments/${shipment.id}/events`,
                          {
                            shipment_event: {
                              status: draft.status,
                              note: draft.note.trim(),
                            },
                          },
                          "Shipment update recorded",
                          `${shipment.supplier_reference} is now ${draft.status.replaceAll("_", " ")}.`,
                          () =>
                            setShipmentEventDrafts((current) => {
                              const next = { ...current };
                              delete next[shipment.id];
                              return next;
                            }),
                        );
                      }}
                    >
                      <TextField
                        select
                        label={`Next status for shipment ${shipment.supplier_reference}`}
                        value={draft.status}
                        disabled={busy}
                        onChange={(event) =>
                          updateShipmentDraft(shipment.id, {
                            status: event.target.value,
                          })
                        }
                      >
                        {allowedStatuses.map((status) => (
                          <MenuItem value={status} key={status}>
                            {status.replaceAll("_", " ")}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        label="Status update note"
                        value={draft.note}
                        required
                        multiline
                        minRows={2}
                        disabled={busy}
                        onChange={(event) =>
                          updateShipmentDraft(shipment.id, {
                            note: event.target.value,
                          })
                        }
                        slotProps={{ htmlInput: { maxLength: 1000 } }}
                      />
                      <Button
                        type="submit"
                        variant="outlined"
                        disabled={busy || !draft.status || !draft.note.trim()}
                      >
                        Record status update
                      </Button>
                      <Button
                        type="button"
                        disabled={
                          busy ||
                          preparationBusy ||
                          deliveryBlocked ||
                          financeBlocked ||
                          carrierBlocked ||
                          !shipmentEventDrafts[shipment.id]
                        }
                        onClick={() => {
                          if (
                            busy ||
                            preparationBusy ||
                            deliveryBlocked ||
                            financeBlocked ||
                            carrierBlocked ||
                            !shipmentEventDrafts[shipment.id] ||
                            !window.confirm(
                              "Discard this unsaved shipment status draft?",
                            )
                          )
                            return;
                          setShipmentEventDrafts((current) => {
                            const next = { ...current };
                            delete next[shipment.id];
                            return next;
                          });
                        }}
                      >
                        Discard status draft
                      </Button>
                    </form>
                  )}
                  {canOpenReceiving ? (
                    <a
                      className="inventory-info"
                      href={`/clinic/inventory/receiving?shipment_id=${shipment.id}&delivery_status=all`}
                    >
                      Open receiving record
                    </a>
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      Receiving opens after the shipment is marked delivered or
                      exception.
                    </Typography>
                  )}
                </section>
              );
            })}
          </div>
        )}
        <PermissionNote
          allowed={capability(data, "procurement.approve")}
          permission="procurement.approve"
        />
        <OrderDeliveryPreparation
          key={`${data.practice.id}:${data.current_user_id}:${order.id}`}
          orderId={order.id}
          canSubmit={capability(data, "procurement.submit")}
          externalBusy={preparationBusy || financeBlocked || carrierBlocked}
          onBlockedChange={setDeliveryBlocked}
        />
        <fieldset
          disabled={deliveryBlocked || carrierBlocked || preparationBusy}
          style={{ border: 0, padding: 0, minWidth: 0 }}
        >
          <OrderReconciliation
            key={order.id}
            order={order}
            capabilities={data.capabilities}
            onChanged={onChanged}
            onBlockedChange={setFinanceBlocked}
          />
        </fieldset>
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
      <Card title="Find a delivery">
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
            : `${data.delivery_options.length} shown · ${page.filtered_count} matching · ${page.total_count} total deliveries.`}
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
            label="Delivery to review"
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
          scanDisabled={disabled || Boolean(error)}
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
  scanDisabled = false,
  run,
  lookupLot = false,
}: {
  data: InventoryReceivingDetail;
  lookupLot?: boolean;
  busy: boolean;
  scanDisabled?: boolean;
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
  const matchingRecalls = [
    ...(lookupMatches ? (lotLookup?.data.recalls ?? []) : []),
    ...data.recalls,
  ]
    .filter(
      (record) =>
        record.product_id === item?.id &&
        record.lot_numbers.includes(displayedLot.trim()),
    )
    .filter(
      (record, index, records) =>
        records.findIndex((candidate) => candidate.id === record.id) === index,
    );
  const recall = matchingRecalls[0];
  const stockDestinations = data.locations.filter(
    (record) => record.status === "active" && record.stock_destination,
  );
  const eligibleLocations = recall
    ? stockDestinations.filter((record) => record.kind === "quarantine")
    : stockDestinations;
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
  const effectiveAreaId = destination?.areas.includes(areaId)
    ? areaId
    : (destination?.areas[0] ?? "");
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
    const nextStockDestinations = data.locations.filter(
      (record) => record.status === "active" && record.stock_destination,
    );
    const nextLocations = nextRecall
      ? nextStockDestinations.filter((record) => record.kind === "quarantine")
      : nextStockDestinations;
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
              data.locations.find(
                (location) =>
                  location.kind === "quarantine" &&
                  location.status === "active" &&
                  location.stock_destination,
              )?.id ?? "",
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
          destination_location_id: destination?.id,
          ...(effectiveAreaId ? { area_id: effectiveAreaId } : {}),
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
      `${number(packages)} ${packageUnit} accepted${accepted ? ` into ${destination?.path ?? destination?.name}` : ""}.`,
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
            <h2>Review shipment {shipment.supplier_reference}</h2>
            <p className="inventory-lead">
              {order.number} · {shipment.status.replaceAll("_", " ")}
              {shipment.delivered_at
                ? ` · ${inventoryDateTime(shipment.delivered_at, data.timezone)}`
                : ""}
            </p>
          </div>
          <Badge tone={receipt?.status === "quarantined" ? "warning" : "blue"}>
            {shipment.reconciliation
              ? "Reconciled with discrepancy"
              : (receipt?.status ?? shipment.status)}
          </Badge>
        </div>
        {!!shipment.events?.length && (
          <div
            className="inventory-stack compact"
            aria-label="Shipment status history"
          >
            {shipment.events.map((event) => (
              <Typography variant="body2" key={event.id}>
                {event.status.replaceAll("_", " ")} ·{" "}
                {inventoryDateTime(event.recorded_at, data.timezone)} ·{" "}
                {event.note}
              </Typography>
            ))}
          </div>
        )}
        {receipt ? (
          <div
            className="inventory-stack compact"
            aria-label="Recorded receipt details"
          >
            <Alert severity="info">
              This receipt is recorded. The details below are read-only; they do
              not use the defaults for a new delivery.
            </Alert>
            <DataPoint
              label="Receipt started"
              value={inventoryDateTime(receipt.started_at, data.timezone)}
            />
            {receipt.lines.length === 0 && (
              <Typography variant="body2">
                Recorded line details are unavailable.
              </Typography>
            )}
            {receipt.lines.map((recordedLine) => {
              const recordedLot = data.lots.find(
                (record) => record.id === recordedLine.lot_id,
              );
              const recordedProduct = recordedLot
                ? data.products.find(
                    (record) => record.id === recordedLot.product_id,
                  )
                : undefined;
              const recordedLocation = data.locations.find(
                (record) => record.id === recordedLine.location_id,
              );
              return (
                <div key={recordedLine.id} className="inventory-data-grid two">
                  <DataPoint
                    label="Product"
                    value={
                      recordedProduct?.name ?? "Product details unavailable"
                    }
                  />
                  <DataPoint
                    label="Recorded lot"
                    value={recordedLot?.lot_number ?? "Lot details unavailable"}
                  />
                  <DataPoint
                    label="Lot expiration"
                    value={
                      recordedLot
                        ? inventoryDate(
                            recordedLot.expiration_date,
                            data.timezone,
                          )
                        : "Not available"
                    }
                  />
                  <DataPoint
                    label="Accepted packages"
                    value={number(recordedLine.quantity_packages)}
                  />
                  <DataPoint
                    label="Accepted stock units"
                    value={number(recordedLine.quantity_units)}
                  />
                  <DataPoint
                    label="Recorded destination"
                    value={
                      recordedLocation?.path ??
                      recordedLocation?.name ??
                      "Location details unavailable"
                    }
                    detail={`Location reference: ${recordedLine.location_id}`}
                  />
                  <DataPoint
                    label="Recorded area"
                    value={recordedLine.area_id || "Not recorded"}
                  />
                  <DataPoint
                    label="Recorded temperature (°C)"
                    value={recordedLine.temperature_c ?? "Not recorded"}
                  />
                  <DataPoint
                    label="Disposition"
                    value={
                      recordedLine.disposition?.replaceAll("_", " ") ||
                      "Not recorded"
                    }
                  />
                  <DataPoint
                    label="Exception"
                    value={
                      recordedLine.exception?.replaceAll("_", " ") ||
                      "Not recorded"
                    }
                  />
                </div>
              );
            })}
            {shipment.reconciliation && (
              <Typography variant="body2">
                Reconciliation: {shipment.reconciliation.reason}
              </Typography>
            )}
          </div>
        ) : (
          <>
            <InventoryScanInput
              context="receiving"
              productId={item.id}
              disabled={scanDisabled || busy}
              label="Scan selected purchase-order product"
              manualFallback="Select the purchase-order line manually and verify the product label."
              onMatch={() => undefined}
            />
            {shipment.reconciliation && (
              <Alert severity="info">
                {number(shipment.reconciliation.accepted_packages)} accepted,{" "}
                {number(shipment.reconciliation.missing_packages)} missing,{" "}
                {number(shipment.reconciliation.rejected_packages)} rejected and{" "}
                {number(shipment.reconciliation.excess_packages)} excess
                packages refused. {shipment.reconciliation.reason}
              </Alert>
            )}
            {recall && accepted && (
              <div className="inventory-warning" role="alert">
                <strong>
                  Recall {matchingRecalls.length === 1 ? "match" : "matches"}:{" "}
                  {matchingRecalls.map((record) => record.reference).join(", ")}
                </strong>
                <p>
                  This lot matches {matchingRecalls.length} open recall{" "}
                  {matchingRecalls.length === 1 ? "case" : "cases"} and must be
                  received into a quarantine location.
                </p>
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
                    ? `Stock-unit equivalent: ${number(decimalMultiply(packages, line.units_per_package))} ${baseUnit}`
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
                      {record.path}
                    </option>
                  ))}
                </select>
              </Field>
              {eligibleLocations.length === 0 && (
                <Alert severity="warning">
                  {recall
                    ? "Create an active quarantine leaf location before receiving this recalled lot."
                    : "Create an active leaf location before receiving stock."}
                  <Button
                    href="/clinic/inventory/locations?return_to=/clinic/inventory/receiving"
                    color="inherit"
                    sx={{ ml: 1 }}
                  >
                    Manage storage locations
                  </Button>
                </Alert>
              )}
              {destination && destination.areas.length > 0 && (
                <Field label="Area">
                  <select
                    value={effectiveAreaId}
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
                {number(allocation?.expected_packages ?? "0")} expected
                packages.
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
                    {number(packages)} packages accepted;{" "}
                    {number(missingPackages)} missing;{" "}
                    {number(rejectedPackages)} rejected;{" "}
                    {number(excessPackages)} excess refused. Only accepted
                    packages enter inventory. Missing and rejected packages
                    remain outstanding on the PO.
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
          </>
        )}
        {receiptLine && (
          <p className="inventory-success-line">
            Recorded: {number(receiptLine.quantity_packages)} {packageUnit} /{" "}
            {number(receiptLine.quantity_units)} {baseUnit}
            {receiptLine.area_id ? ` at ${receiptLine.area_id}` : ""}.
          </p>
        )}
      </Card>
      <Card title="Receipt and PO quantities">
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
              receipt
                ? "See recorded receipt lines"
                : countsValid
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
              label="Open recall cases"
              value={matchingRecalls
                .map(
                  (record) =>
                    `${record.reference}: ${record.required_disposition.replaceAll("_", " ")}`,
                )
                .join(" · ")}
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
  run: InventoryRun;
}) {
  const page = data.stock_page;
  const [query, setQuery] = useState(page.query);
  const applied = { q: page.query, stock_status: page.status, page: page.page };
  const scanScoped =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("scan") === "1";
  const [selectedId, setSelectedId] = useState(() =>
    scanScoped ? "" : (balanceFor(data)?.id ?? ""),
  );
  const [action, setAction] = useState<"transfer" | "adjust" | "count">(
    "transfer",
  );
  const [quantity, setQuantity] = useState<Decimal>("1");
  const [destination, setDestination] = useState(
    data.locations.find(
      (item) =>
        item.kind === "returns" &&
        item.status === "active" &&
        item.stock_destination,
    )?.id ??
      data.locations.find(
        (item) => item.status === "active" && item.stock_destination,
      )?.id ??
      "",
  );
  const [reason, setReason] = useState("");
  const selected = selectedId
    ? (data.balances.find((record) => record.id === selectedId) ??
      (scanScoped ? undefined : balanceFor(data)))
    : scanScoped
      ? undefined
      : balanceFor(data);
  const selectedLot = selected ? lot(data, selected.lot_id) : undefined;
  const selectedProduct = selected
    ? product(data, selected.product_id)
    : undefined;
  const selectedLocation = selected
    ? location(data, selected.location_id)
    : undefined;
  const transferDestinations = data.locations.filter(
    (item) =>
      item.id !== selected?.location_id &&
      item.status === "active" &&
      item.stock_destination,
  );
  const effectiveDestination = transferDestinations.some(
    (item) => item.id === destination,
  )
    ? destination
    : (transferDestinations[0]?.id ?? "");
  const blocked =
    !selected ||
    !selectedLot ||
    !selected.transferable ||
    decimalCompare(selected.on_hand_units, "0") === 0;
  const chooseAction = (nextAction: "transfer" | "adjust" | "count") => {
    if (nextAction === action) return;
    setAction(nextAction);
    setQuantity("1");
    setReason("");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !selectedProduct) return;
    if (action === "transfer" && (blocked || !effectiveDestination)) return;
    if (action === "transfer")
      void run(
        `/api/clinic/inventory/lots/${selected.lot_id}/transfer`,
        {
          transfer: {
            source_batch_id: selected.id.replace("bal_", ""),
            destination_location_id: effectiveDestination,
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
        (payload) => {
          const adjustment = payload.adjustment;
          if (!adjustment) return "Inventory adjusted.";
          return `${adjustment.delta_units.startsWith("-") ? "" : "+"}${number(adjustment.delta_units)} ${adjustment.stock_unit} for ${adjustment.product_name}, lot ${adjustment.lot_number}, at ${adjustment.location_name}. Reason: ${adjustment.reason}. Resulting balance: ${number(adjustment.resulting_on_hand_units)} ${adjustment.stock_unit}.`;
        },
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
  return (
    <div className="inventory-stack" aria-busy={loading}>
      <Card className="inventory-stock-controls">
        <details className="inventory-stock-scan">
          <summary>Scan a product</summary>
          <InventoryScanInput
            context="transfer"
            disabled={loading || busy || readBlocked || Boolean(error)}
            label="Scan a product for transfer"
            manualFallback="Search for the product below, then select the exact lot and location."
            onMatch={(match) =>
              window.location.assign(
                `/clinic/inventory/lots?product_id=${encodeURIComponent(match.product_id)}&scan=1`,
              )
            }
            onClear={() => {
              setSelectedId("");
              setQuantity("");
              setReason("");
            }}
          />
        </details>
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
      <div
        className="inventory-stock-totals"
        role="group"
        aria-label="Matching stock totals"
      >
        {data.unit_totals.map((total) => (
          <div key={total.stock_unit}>
            <strong>
              {number(total.available_units)} {total.stock_unit} available
            </strong>
            <span>
              {number(total.on_hand_units)} {total.stock_unit} on hand ·{" "}
              {number(total.unavailable_units)} {total.stock_unit} unavailable
            </span>
          </div>
        ))}
      </div>
      <Card title="Stock by lot and location">
        {data.balances.length === 0 && (
          <div
            className="inventory-empty-state inventory-empty-state--compact"
            role="status"
          >
            <strong>
              {page.total_count > 0 && page.filtered_count === 0
                ? "No stock positions match these filters"
                : "No stock positions are recorded"}
            </strong>
            <p>
              {page.total_count > 0
                ? "Clear or change the filters to review recorded stock."
                : "Received stock appears here after its lot and storage location are recorded."}
            </p>
            {page.total_count > 0 && (page.query || page.status !== "all") ? (
              <Button
                variant="outlined"
                disabled={loading || busy || readBlocked}
                onClick={() =>
                  void onRead({ q: "", stock_status: "all", page: 1 })
                }
              >
                Clear stock filters
              </Button>
            ) : page.total_count === 0 &&
              capability(data, "inventory.receive") ? (
              <Button variant="outlined" href="/clinic/inventory/receiving">
                Open receiving
              </Button>
            ) : null}
          </div>
        )}
        {data.balances.length > 0 && (
          <div className="inventory-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product / lot</th>
                  <th>Location</th>
                  <th>On hand (stock units)</th>
                  <th>Available (stock units)</th>
                  <th>Status</th>
                  <th>Lot history</th>
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
                            setQuantity(scanScoped ? "" : "1");
                            setReason("");
                          }}
                        >
                          {item.name}
                        </Button>
                        <small>
                          Lot {lotItem.lot_number} · expires{" "}
                          {inventoryDate(
                            lotItem.expiration_date,
                            data.timezone,
                          )}
                        </small>
                      </td>
                      <td>
                        {loc.name}
                        <small>{loc.areas[0]}</small>
                      </td>
                      <td className="numeric">
                        {number(balance.on_hand_units)} {item.base_unit}
                      </td>
                      <td className="numeric">
                        {number(balance.available_units)} {item.base_unit}
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
                          View lot ledger
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
        <div>
          <Card
            title={`${selectedProduct.name} · Lot ${selectedLot.lot_number}`}
          >
            <div className="inventory-data-grid four inventory-stock-summary">
              <DataPoint label="Location" value={selectedLocation.name} />
              <DataPoint
                label="On hand"
                value={`${number(selected.on_hand_units)} ${selectedProduct.base_unit}`}
              />
              <DataPoint
                label="Held"
                value={`${number(selected.held_units)} ${selectedProduct.base_unit}`}
                tone={
                  decimalCompare(selected.held_units, "0") > 0
                    ? "warning"
                    : undefined
                }
              />
              <DataPoint
                label="Expires"
                value={inventoryDate(
                  selectedLot.expiration_date,
                  data.timezone,
                )}
              />
            </div>
            <Tabs
              value={action}
              onChange={(_, value: "transfer" | "adjust" | "count") =>
                chooseAction(value)
              }
              aria-label="Stock action"
              variant="fullWidth"
              sx={{ mt: 2, mb: 3, borderBottom: 1, borderColor: "divider" }}
            >
              <Tab
                id="stock-tab-transfer"
                aria-controls="stock-action-panel"
                value="transfer"
                label="Transfer"
              />
              <Tab
                id="stock-tab-adjust"
                aria-controls="stock-action-panel"
                value="adjust"
                label="Adjust"
              />
              <Tab
                id="stock-tab-count"
                aria-controls="stock-action-panel"
                value="count"
                label="Cycle count"
              />
            </Tabs>
            <form
              className="inventory-form-grid inventory-stock-action"
              id="stock-action-panel"
              role="tabpanel"
              aria-labelledby={`stock-tab-${action}`}
              onSubmit={submit}
            >
              <TextField
                size="small"
                type="number"
                required
                label={
                  action === "count"
                    ? `Counted units (${selectedProduct.base_unit})`
                    : action === "adjust"
                      ? `Signed adjustment (${selectedProduct.base_unit})`
                      : `Transfer quantity (${selectedProduct.base_unit})`
                }
                helperText={
                  action === "adjust"
                    ? "Use a positive value to add stock or a negative value to remove stock."
                    : undefined
                }
                slotProps={{
                  htmlInput: {
                    min:
                      action === "count"
                        ? 0
                        : action === "adjust"
                          ? undefined
                          : 1,
                    step: "any",
                  },
                }}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
              {action === "transfer" && (
                <TextField
                  select
                  size="small"
                  label="Destination"
                  required
                  value={effectiveDestination}
                  onChange={(event) => setDestination(event.target.value)}
                >
                  {transferDestinations.map((item) => (
                    <MenuItem value={item.id} key={item.id}>
                      {item.path}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {action === "transfer" && blocked && (
                <Alert severity="warning" sx={{ gridColumn: "1 / -1" }}>
                  This balance is not eligible for transfer.
                </Alert>
              )}
              {action === "transfer" && transferDestinations.length === 0 && (
                <Alert severity="warning">
                  Create another active leaf location before transferring stock.
                </Alert>
              )}
              <TextField
                size="small"
                required
                multiline
                minRows={2}
                label={action === "adjust" ? "Adjustment reason" : "Reason"}
                sx={
                  action === "transfer" ? { gridColumn: "1 / -1" } : undefined
                }
                slotProps={{ htmlInput: { maxLength: 200 } }}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
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
                  key={`lot-action-${selected.id}-${action}`}
                  disabled={
                    busy ||
                    (action === "transfer" &&
                      (blocked || !effectiveDestination)) ||
                    (action === "transfer" &&
                      decimalCompare(quantity || "0", "0") <= 0) ||
                    (action === "adjust" &&
                      decimalCompare(quantity || "0", "0") === 0) ||
                    (action === "count" &&
                      decimalCompare(quantity || "0", "0") < 0) ||
                    !reason.trim() ||
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
                  confirmationTitle={
                    action === "adjust"
                      ? "Confirm signed inventory adjustment"
                      : undefined
                  }
                  confirmationContent={
                    action === "adjust" ? (
                      <p>
                        {selectedProduct.name}, lot {selectedLot.lot_number}, at{" "}
                        {selectedLocation.name}:{" "}
                        {decimalCompare(quantity || "0", "0") > 0 ? "+" : ""}
                        {number(quantity || "0")} {selectedProduct.base_unit}.
                        Reason: {reason.trim()}.
                      </p>
                    ) : undefined
                  }
                  confirmLabel={
                    action === "adjust" ? "Post adjustment" : undefined
                  }
                >
                  {action === "adjust"
                    ? "Post adjustment"
                    : action === "count"
                      ? "Record count"
                      : "Post transfer"}
                </ConfirmButton>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

function InventoryExceptionsScreen({
  data,
  loading,
  error,
  busy,
  pendingMutation,
  onRead,
  run,
}: {
  data: InventoryExceptionData;
  loading: boolean;
  error: string;
  busy: boolean;
  pendingMutation: PendingInventoryMutation | null;
  onRead: (read: InventoryExceptionRead) => Promise<void>;
  run: InventoryRun;
}) {
  const page = data.exception_page;
  const applied: InventoryExceptionRead = {
    q: page.query,
    exception_status: page.status,
    category: page.category,
    page: page.page,
  };
  const [query, setQuery] = useState(page.query);
  const [selectedId, setSelectedId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [reviewState, setReviewState] = useState<"open" | "reviewed">("open");
  const [reason, setReason] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const selected = data.exceptions.find((entry) => entry.id === selectedId);
  const reviewerName = selected?.reviewed_by
    ? data.users.find((user) => user.id === selected.reviewed_by)?.name
    : undefined;
  const canConfigure = capability(data, "inventory.configure");
  const readBlocked = Boolean(pendingMutation);
  const readDisabled = loading || busy || readBlocked;
  const endpoint = "/api/clinic/inventory/exceptions/reviews";
  const reviewBody = selected
    ? {
        review: {
          source_kind: selected.source_kind,
          source_id: selected.source_id,
          category: selected.category,
          assignee_id: assigneeId || null,
          state: reviewState,
          reason: reason.trim(),
          evidence_reference: evidenceReference.trim() || null,
        },
      }
    : null;
  const retryingSame = Boolean(
    reviewBody &&
    pendingMutation?.endpoint === endpoint &&
    pendingMutation.intent === JSON.stringify({ endpoint, body: reviewBody }),
  );
  const formLocked = loading || busy || Boolean(error) || readBlocked;
  const mutationBlocked =
    loading ||
    busy ||
    Boolean(error) ||
    (!retryingSame && readBlocked) ||
    !canConfigure ||
    !selected ||
    !reason.trim();

  useEffect(() => setQuery(page.query), [page.query]);

  const selectException = (entry: InventoryException) => {
    if (readBlocked || busy) return;
    setSelectedId(entry.id);
    setAssigneeId(
      data.assignees.some((assignee) => assignee.id === entry.assignee_id)
        ? (entry.assignee_id ?? "")
        : "",
    );
    setReviewState(entry.state);
    setReason(entry.reason ?? "");
    setEvidenceReference(entry.evidence_reference ?? "");
  };
  const sourceHref = (entry: InventoryException) => {
    if (entry.source_kind === "reconciliation")
      return entry.shipment_id
        ? `/clinic/inventory/receiving?shipment_id=${entry.shipment_id}&delivery_status=all`
        : "/clinic/inventory/receiving";
    return entry.product_id
      ? `/clinic/inventory/lots?product_id=${entry.product_id}`
      : "/clinic/inventory/lots";
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!reviewBody || mutationBlocked) return;
    void run(
      endpoint,
      reviewBody,
      reviewState === "reviewed" ? "Exception reviewed" : "Exception updated",
      reviewState === "reviewed"
        ? "The review record was saved. Operational correction, hold release, or stock adjustment remains separate."
        : "The exception remains open with its updated assignment and review note.",
      () => setSelectedId(""),
    );
  };

  return (
    <div className="inventory-stack" aria-busy={loading}>
      <Card title="Review inventory exceptions">
        <p className="inventory-lead">
          Review each active hazard in its source context. Queue totals are
          record counts; quantities are not combined across products or units.
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
            label="Search exceptions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Product, lot, location, or detail"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            size="small"
            label="Review status"
            value={page.status}
            disabled={readDisabled}
            onChange={(event) =>
              void onRead({
                ...applied,
                exception_status: event.target.value as typeof page.status,
                page: 1,
              })
            }
          >
            <MenuItem value="all">All review states</MenuItem>
            <MenuItem value="unreviewed">Unreviewed</MenuItem>
            <MenuItem value="reviewed">Reviewed</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Category"
            value={page.category}
            disabled={readDisabled}
            onChange={(event) =>
              void onRead({
                ...applied,
                category: event.target.value as typeof page.category,
                page: 1,
              })
            }
          >
            <MenuItem value="all">All categories</MenuItem>
            <MenuItem value="expiring">Expiring</MenuItem>
            <MenuItem value="expired">Expired</MenuItem>
            <MenuItem value="inactive_product">Inactive product</MenuItem>
            <MenuItem value="inactive_location">Inactive location</MenuItem>
            <MenuItem value="hold">Active hold</MenuItem>
            <MenuItem value="delivery_discrepancy">
              Delivery discrepancy
            </MenuItem>
          </TextField>
          <Button type="submit" variant="outlined" disabled={readDisabled}>
            Search exceptions
          </Button>
        </form>
        <p className="inventory-results-count" role="status">
          {loading
            ? "Loading exceptions…"
            : `Showing ${page.filtered_count === 0 ? 0 : (page.page - 1) * page.page_size + 1}–${Math.min(page.page * page.page_size, page.filtered_count)} of ${page.filtered_count} matching exceptions (${page.total_count} active hazards).`}
        </p>
        {error && (
          <Alert severity="error">
            {error} The previous exception page remains visible and review
            actions are paused.
          </Alert>
        )}
        <div className="inventory-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Exception</th>
                <th>Source</th>
                <th>Review</th>
                <th>Assignee</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.exceptions.map((entry) => {
                const assignee = data.assignees.find(
                  (candidate) => candidate.id === entry.assignee_id,
                );
                return (
                  <tr
                    key={entry.id}
                    className={entry.id === selectedId ? "selected" : ""}
                  >
                    <td>
                      <strong>{entry.title}</strong>
                      <small>{entry.details}</small>
                    </td>
                    <td>
                      <a href={sourceHref(entry)}>
                        {entry.product_name ??
                          (entry.source_kind === "reconciliation"
                            ? "Delivery record"
                            : "Stock record")}
                      </a>
                      <small>
                        {[
                          entry.lot_number ? `Lot ${entry.lot_number}` : null,
                          entry.location_path,
                          entry.expires_on
                            ? `Expires ${inventoryDate(entry.expires_on, data.timezone)}`
                            : null,
                          entry.quantity_units && entry.stock_unit
                            ? `${number(entry.quantity_units)} ${entry.stock_unit}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </td>
                    <td>
                      <Badge
                        tone={
                          entry.state === "reviewed" ? "success" : "warning"
                        }
                      >
                        {entry.state === "reviewed" ? "Reviewed" : "Unreviewed"}
                      </Badge>
                      <small>{entry.category.replaceAll("_", " ")}</small>
                    </td>
                    <td>
                      {assignee?.name ??
                        (entry.assignee_id ? "Inactive member" : "Unassigned")}
                    </td>
                    <td>
                      <Button
                        type="button"
                        size="small"
                        variant="outlined"
                        disabled={readBlocked || busy || loading}
                        onClick={() => selectException(entry)}
                      >
                        {entry.state === "reviewed"
                          ? "Update review"
                          : "Review exception"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!data.exceptions.length && (
          <div
            className="inventory-empty-state inventory-empty-state--compact"
            role="status"
          >
            <strong>
              {page.filtered_count === 0 && page.total_count > 0
                ? "No active hazards match these filters"
                : "No active hazards are recorded"}
            </strong>
            <p>
              {page.filtered_count === 0 && page.total_count > 0
                ? "Clear or change the filters to review active hazards."
                : "There are no active inventory exceptions to review."}
            </p>
            {page.total_count > 0 &&
              (page.query ||
                page.status !== "all" ||
                page.category !== "all") && (
                <Button
                  variant="outlined"
                  disabled={readDisabled}
                  onClick={() => {
                    setQuery("");
                    void onRead({
                      q: "",
                      exception_status: "all",
                      category: "all",
                      page: 1,
                    });
                  }}
                >
                  Clear exception filters
                </Button>
              )}
          </div>
        )}
        {page.page_count > 1 && (
          <nav
            className="inventory-pagination"
            aria-label="Exception pagination"
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
      {selected && (
        <Card title="Review selected exception">
          <div className="inventory-data-grid four">
            <DataPoint label="Exception" value={selected.title} />
            <DataPoint
              label="Category"
              value={selected.category.replaceAll("_", " ")}
            />
            <DataPoint
              label="Source"
              value={
                selected.source_kind === "batch"
                  ? "Inventory stock position"
                  : selected.source_kind === "hold"
                    ? "Inventory hold"
                    : "Delivery reconciliation"
              }
            />
            <DataPoint
              label="Product / lot"
              value={
                [
                  selected.product_name,
                  selected.lot_number && `Lot ${selected.lot_number}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Not product-specific"
              }
            />
            <DataPoint
              label="Location"
              value={selected.location_path ?? "Not location-specific"}
            />
            <DataPoint
              label="Reviewed"
              value={
                selected.reviewed_at
                  ? `${inventoryDateTime(selected.reviewed_at, data.timezone)}${reviewerName ? ` by ${reviewerName}` : ""}`
                  : "Not reviewed"
              }
            />
          </div>
          <p className="inventory-flow-note">{selected.details}</p>
          <Alert severity="info">
            Saving a review records ownership and acknowledgement only. It does
            not release a hold, adjust stock, reactivate a product or location,
            or resolve a delivery discrepancy.
          </Alert>
          <form className="inventory-form-grid" onSubmit={submit}>
            <TextField
              select
              size="small"
              label="Assignee"
              value={assigneeId}
              disabled={formLocked}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {data.assignees.map((assignee) => (
                <MenuItem key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Review state"
              value={reviewState}
              disabled={formLocked}
              onChange={(event) =>
                setReviewState(event.target.value as typeof reviewState)
              }
            >
              <MenuItem value="open">Keep open</MenuItem>
              <MenuItem value="reviewed">Mark reviewed</MenuItem>
            </TextField>
            <TextField
              size="small"
              label="Review reason"
              value={reason}
              disabled={formLocked}
              required
              multiline
              minRows={2}
              onChange={(event) => setReason(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <TextField
              size="small"
              label="Evidence reference"
              value={evidenceReference}
              disabled={formLocked}
              onChange={(event) => setEvidenceReference(event.target.value)}
              placeholder="Ticket, document, or inspection reference"
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <div className="inventory-form-actions">
              <PermissionNote
                allowed={canConfigure}
                permission="inventory.configure"
              />
              <Button
                type="button"
                variant="outlined"
                disabled={busy || readBlocked}
                onClick={() => setSelectedId("")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={mutationBlocked}
              >
                {busy
                  ? "Saving…"
                  : retryingSame
                    ? "Retry review"
                    : "Save review"}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

export function ActivityScreen({
  data,
  loading = false,
  error = "",
  onRead,
  busy = false,
  pendingMutation = null,
  run,
}: {
  data: InventoryActivityData;
  loading?: boolean;
  error?: string;
  onRead: (query: { q?: string; before?: string | null }) => Promise<void>;
  busy?: boolean;
  pendingMutation?: PendingInventoryMutation | null;
  run?: (
    endpoint: string,
    body: Record<string, unknown>,
    title: string,
    detail: string,
    afterSuccess?: () => void,
  ) => Promise<void>;
}) {
  const page = data.activity_page;
  const [filter, setFilter] = useState(page.query);
  useEffect(() => setFilter(page.query), [page.query]);
  const normalizedFilter = page.query;
  const rows = data.movements;
  const [reversalTarget, setReversalTarget] = useState<
    (typeof rows)[number] | null
  >(null);
  const [reversalReason, setReversalReason] = useState("");
  const reversalEndpoint = reversalTarget
    ? `/api/clinic/inventory/lots/${reversalTarget.lot_id}/adjust`
    : "";
  const reversalBody = reversalTarget
    ? {
        adjustment: {
          lot_id: reversalTarget.lot_id,
          location_id: reversalTarget.location_id,
          reverses_entry_id: reversalTarget.id,
          reason: reversalReason.trim(),
        },
      }
    : null;
  const exactRetry =
    pendingMutation &&
    reversalBody &&
    pendingMutation.endpoint === reversalEndpoint &&
    pendingMutation.intent ===
      JSON.stringify({ endpoint: reversalEndpoint, body: reversalBody });
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
      <Card title="Review stock movements">
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
              sx={{ minHeight: 44, textTransform: "none" }}
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
                : `${rows.length} shown · ${page.filtered_count} matching · ${page.total_count} total recorded movements.`}
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
                  minHeight: 44,
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
                  <th>Quantity (stock units)</th>
                  <th>Reason / source</th>
                  <th>Recorded by</th>
                  <th>Action</th>
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
                        {readableEventLabel(item.type)}
                      </Badge>
                    </td>
                    <td>
                      <strong>
                        <a
                          href={`/clinic/inventory/lots?product_id=${encodeURIComponent(item.product_id)}`}
                        >
                          Lot {item.lot_number}
                        </a>
                      </strong>
                      <small>{item.location_name}</small>
                    </td>
                    <td className="numeric">
                      {item.direction === "out" ? "−" : "+"}
                      {number(item.quantity_units)} {item.stock_unit}
                    </td>
                    <td>
                      <span>{item.reason}</span>
                      {item.source?.href ? (
                        <small>
                          <a href={item.source.href}>{item.source.label}</a>
                        </small>
                      ) : (
                        <small>
                          {item.source?.label ?? "Recorded inventory event"}
                        </small>
                      )}
                    </td>
                    <td>{item.actor_name ?? "System record"}</td>
                    <td>
                      {item.can_reverse && run && (
                        <Button
                          size="small"
                          disabled={busy || Boolean(pendingMutation)}
                          onClick={() => {
                            setReversalTarget(item);
                            setReversalReason("");
                          }}
                        >
                          Reverse stock removal
                        </Button>
                      )}
                      {item.reverses_entry_id && (
                        <span>Reverses entry #{item.reverses_entry_id}</span>
                      )}
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
        {reversalTarget && run && (
          <form
            className="inventory-form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !reversalBody ||
                !reversalReason.trim() ||
                busy ||
                (pendingMutation && !exactRetry)
              )
                return;
              void run(
                reversalEndpoint,
                reversalBody,
                "Stock use reversed",
                `Entry #${reversalTarget.id} was reversed once. The original movement remains in the ledger.`,
                () => {
                  setReversalTarget(null);
                  setReversalReason("");
                },
              );
            }}
          >
            <Alert severity="warning" sx={{ gridColumn: "1 / -1" }}>
              Reverse entry #{reversalTarget.id}: restore exactly{" "}
              {number(reversalTarget.quantity_units)}{" "}
              {reversalTarget.stock_unit} to lot {reversalTarget.lot_number} at{" "}
              {reversalTarget.location_name}. Review the physical stock and
              reason before posting.
            </Alert>
            <TextField
              label="Reversal reason"
              required
              multiline
              minRows={2}
              value={reversalReason}
              onChange={(event) => setReversalReason(event.target.value)}
              disabled={busy || Boolean(pendingMutation)}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <div className="inventory-form-actions">
              <Button
                type="button"
                variant="outlined"
                disabled={busy || Boolean(pendingMutation)}
                onClick={() => setReversalTarget(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={
                  busy ||
                  !reversalReason.trim() ||
                  Boolean(pendingMutation && !exactRetry)
                }
              >
                {exactRetry ? "Retry exact reversal" : "Post reversal"}
              </Button>
            </div>
          </form>
        )}
        <div className="inventory-form-actions">
          <Button
            sx={{ minHeight: 44, textTransform: "none" }}
            variant="outlined"
            disabled={loading || !page.before_cursor}
            onClick={() => void onRead({ q: page.query })}
          >
            Newest movements
          </Button>
          <Button
            sx={{ minHeight: 44, textTransform: "none" }}
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
  loading,
  error,
  busy,
  pendingMutation,
  onRead,
  run,
}: {
  data: InventoryRecallData;
  loading: boolean;
  error: string;
  busy: boolean;
  pendingMutation: PendingInventoryMutation | null;
  onRead: (read: InventoryRecallRead) => Promise<void>;
  run: InventoryRun;
}) {
  const queue = data.recall_page;
  const selectedRecall = data.selected_recall;
  const applied: InventoryRecallRead = {
    q: queue.query,
    recall_status: queue.status,
    page: queue.page,
    recall_id: queue.selected_id ?? undefined,
    position_page: data.position_page.page,
    history_page: data.history_page.page,
    lot_q: data.lot_page.query,
    lot_page: data.lot_page.page,
    product_id: data.lot_page.product_id ?? undefined,
  };
  const [query, setQuery] = useState(queue.query);
  const [lotQuery, setLotQuery] = useState(data.lot_page.query);
  const [selectedLots, setSelectedLots] = useState<
    InventoryRecallData["lot_options"]
  >([]);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [selectedProductName, setSelectedProductName] = useState("");
  const [reference, setReference] = useState("");
  const [createReason, setCreateReason] = useState("");
  const [positionId, setPositionId] = useState("");
  const [quantity, setQuantity] = useState<Decimal>("0");
  const [dispositionEvidence, setDispositionEvidence] = useState("");
  const [dispositionReason, setDispositionReason] = useState("");
  const [containReason, setContainReason] = useState("");
  const [closureReason, setClosureReason] = useState("");
  const [closureEvidence, setClosureEvidence] = useState("");
  const selectedLotIds = selectedLots.map((lot) => lot.id);
  const canLock = capability(data, "recall.lock");
  const canDispose = capability(data, "recall.dispose");
  const closureActor = selectedRecall?.closure
    ? data.users.find((user) => user.id === selectedRecall.closure?.actor_id)
        ?.name
    : undefined;
  const readBlocked = Boolean(pendingMutation);
  const readDisabled = loading || busy || readBlocked;
  const formLocked = loading || busy || Boolean(error) || readBlocked;
  const selectedPosition =
    data.positions.find((position) => position.batch_id === positionId) ??
    data.positions.find(
      (position) =>
        position.held_for_case &&
        decimalCompare(position.on_hand_units, "0") > 0,
    );

  useEffect(() => setQuery(queue.query), [queue.query]);
  useEffect(() => setLotQuery(data.lot_page.query), [data.lot_page.query]);
  useEffect(() => {
    const first = data.positions.find(
      (position) =>
        position.held_for_case &&
        decimalCompare(position.on_hand_units, "0") > 0,
    );
    setPositionId(first?.batch_id ?? "");
    setQuantity(first?.on_hand_units ?? "0");
    setDispositionEvidence("");
    setDispositionReason("");
    setContainReason("");
    setClosureReason("");
    setClosureEvidence("");
  }, [selectedRecall?.id, data.position_page.page]);

  const isSamePending = (endpoint: string, body: Record<string, unknown>) =>
    pendingMutation?.endpoint === endpoint &&
    pendingMutation.intent === JSON.stringify({ endpoint, body });
  const mutationDisabled = (
    endpoint: string,
    body: Record<string, unknown>,
    invalid: boolean,
    allowed: boolean,
  ) =>
    loading ||
    busy ||
    Boolean(error) ||
    invalid ||
    !allowed ||
    (readBlocked && !isSamePending(endpoint, body));

  const createEndpoint = "/api/clinic/inventory/recalls";
  const createBody = {
    recall: {
      lot_ids: [...selectedLotIds].sort(),
      reference: reference.trim(),
      reason: createReason.trim(),
      required_disposition: "return_to_supplier",
    },
  };
  const createInvalid =
    selectedLotIds.length < 1 ||
    selectedLotIds.length > 100 ||
    !selectedProductId ||
    !reference.trim() ||
    !createReason.trim();

  const dispositionEndpoint = selectedRecall
    ? `/api/clinic/inventory/recalls/${selectedRecall.id}/disposition`
    : "/api/clinic/inventory/recalls/missing/disposition";
  const dispositionBody = {
    disposition: {
      batch_id: selectedPosition?.batch_id ?? "",
      quantity_units: quantity,
      method: selectedRecall?.required_disposition ?? "return_to_supplier",
      evidence_reference: dispositionEvidence.trim(),
      reason: dispositionReason.trim(),
    },
  };
  const dispositionInvalid =
    !selectedRecall ||
    selectedRecall.status === "closed" ||
    !selectedPosition?.held_for_case ||
    !dispositionEvidence.trim() ||
    !dispositionReason.trim() ||
    decimalCompare(quantity || "0", "0") <= 0 ||
    decimalCompare(quantity || "0", selectedPosition?.on_hand_units ?? "0") > 0;

  const containEndpoint = selectedRecall
    ? `/api/clinic/inventory/recalls/${selectedRecall.id}/contain`
    : "/api/clinic/inventory/recalls/missing/contain";
  const containBody = { containment: { reason: containReason.trim() } };
  const containInvalid =
    !selectedRecall ||
    selectedRecall.status === "closed" ||
    decimalCompare(selectedRecall.uncontained_units, "0") <= 0 ||
    !containReason.trim();

  const closeEndpoint = selectedRecall
    ? `/api/clinic/inventory/recalls/${selectedRecall.id}/close`
    : "/api/clinic/inventory/recalls/missing/close";
  const closeBody = {
    closure: {
      reason: closureReason.trim(),
      evidence_reference: closureEvidence.trim(),
    },
  };
  const closeInvalid =
    !selectedRecall ||
    selectedRecall.status === "closed" ||
    decimalCompare(selectedRecall.remaining_units, "0") !== 0 ||
    !closureReason.trim() ||
    !closureEvidence.trim();

  const resetCreate = () => {
    setSelectedLots([]);
    setSelectedProductId(null);
    setSelectedProductName("");
    setReference("");
    setCreateReason("");
  };
  const toggleLot = (option: InventoryRecallData["lot_options"][number]) => {
    if (formLocked) return;
    const selected = selectedLotIds.includes(option.id);
    if (selected) {
      const next = selectedLots.filter((lot) => lot.id !== option.id);
      setSelectedLots(next);
      if (next.length === 0) {
        setSelectedProductId(null);
        setSelectedProductName("");
        void onRead({ ...applied, product_id: undefined, lot_page: 1 });
      }
      return;
    }
    if (
      selectedLotIds.length >= 100 ||
      (selectedProductId && selectedProductId !== option.product_id)
    )
      return;
    setSelectedLots([...selectedLots, option]);
    if (!selectedProductId) {
      setSelectedProductId(option.product_id);
      setSelectedProductName(option.product_name);
      void onRead({ ...applied, product_id: option.product_id, lot_page: 1 });
    }
  };
  return (
    <div className="inventory-stack" aria-busy={loading}>
      <Card title="Review recall cases">
        <form
          className="inventory-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (!readDisabled)
              void onRead({
                ...applied,
                q: query.trim(),
                recall_id: undefined,
                page: 1,
                position_page: 1,
                history_page: 1,
              });
          }}
        >
          <TextField
            size="small"
            label="Search recall cases"
            value={query}
            disabled={readDisabled}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Reference, product, or lot"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            select
            size="small"
            label="Case status"
            value={queue.status}
            disabled={readDisabled}
            onChange={(event) =>
              void onRead({
                ...applied,
                recall_status: event.target.value as typeof queue.status,
                recall_id: undefined,
                page: 1,
                position_page: 1,
                history_page: 1,
              })
            }
          >
            <MenuItem value="open">Open cases</MenuItem>
            <MenuItem value="closed">Closed cases</MenuItem>
            <MenuItem value="all">All cases</MenuItem>
          </TextField>
          <Button type="submit" variant="outlined" disabled={readDisabled}>
            Search cases
          </Button>
        </form>
        <p className="inventory-results-count" role="status">
          {loading
            ? "Loading recall cases…"
            : `Showing ${queue.filtered_count === 0 ? 0 : (queue.page - 1) * queue.page_size + 1}–${Math.min(queue.page * queue.page_size, queue.filtered_count)} of ${queue.filtered_count} matching cases (${queue.total_count} total).`}
        </p>
        {error && (
          <Alert severity="error">
            {error} The previous recall view remains visible and case actions
            are paused.
          </Alert>
        )}
        <div className="inventory-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Product</th>
                <th>Case totals</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.recalls.map((recall) => (
                <tr
                  key={recall.id}
                  className={recall.id === queue.selected_id ? "selected" : ""}
                >
                  <td>
                    <strong>{recall.reference}</strong>
                    <small>
                      Effective{" "}
                      {inventoryDate(recall.effective_at, data.timezone)}
                    </small>
                  </td>
                  <td>
                    {recall.product_name}
                    <small>
                      {recall.lot_count}{" "}
                      {recall.lot_count === 1 ? "lot" : "lots"}
                    </small>
                  </td>
                  <td>
                    {number(recall.remaining_units)} {recall.stock_unit}{" "}
                    remaining
                    <small>
                      {number(recall.held_units)} held ·{" "}
                      {number(recall.uncontained_units)} uncontained
                    </small>
                  </td>
                  <td>
                    <Badge
                      tone={recall.status === "closed" ? "success" : "danger"}
                    >
                      {recall.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      disabled={readDisabled}
                      onClick={() =>
                        void onRead({
                          ...applied,
                          recall_id: recall.id,
                          position_page: 1,
                          history_page: 1,
                        })
                      }
                    >
                      Open case
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.recalls.length && <p>No recall cases match this view.</p>}
        {queue.page_count > 1 && (
          <nav className="inventory-pagination" aria-label="Recall pagination">
            <Button
              variant="outlined"
              disabled={readDisabled || queue.page === 1}
              onClick={() => void onRead({ ...applied, page: queue.page - 1 })}
            >
              Previous
            </Button>
            <span>
              Page {queue.page} of {queue.page_count}
            </span>
            <Button
              variant="outlined"
              disabled={readDisabled || queue.page === queue.page_count}
              onClick={() => void onRead({ ...applied, page: queue.page + 1 })}
            >
              Next
            </Button>
          </nav>
        )}
      </Card>
      {selectedRecall && (
        <>
          <Card title={`Recall ${selectedRecall.reference}`}>
            <div className="inventory-data-grid four">
              <DataPoint label="Product" value={selectedRecall.product_name} />
              <DataPoint
                label="Stock when case opened"
                value={`${number(selectedRecall.affected_units)} ${selectedRecall.stock_unit}`}
              />
              <DataPoint
                label="Remaining"
                value={`${number(selectedRecall.remaining_units)} ${selectedRecall.stock_unit}`}
                tone={
                  decimalCompare(selectedRecall.remaining_units, "0") === 0
                    ? ""
                    : "danger"
                }
              />
              <DataPoint
                label="Held"
                value={`${number(selectedRecall.held_units)} ${selectedRecall.stock_unit}`}
                tone="warning"
              />
              <DataPoint
                label="Uncontained"
                value={`${number(selectedRecall.uncontained_units)} ${selectedRecall.stock_unit}`}
                tone={
                  decimalCompare(selectedRecall.uncontained_units, "0") > 0
                    ? "danger"
                    : ""
                }
              />
              <DataPoint
                label="Recorded under this case"
                value={`${number(selectedRecall.disposition_units)} ${selectedRecall.stock_unit}`}
              />
              <DataPoint
                label="Lots"
                value={String(selectedRecall.lot_count)}
              />
              <DataPoint
                label="Required disposition"
                value={selectedRecall.required_disposition.replaceAll("_", " ")}
              />
            </div>
            <p className="inventory-info">{selectedRecall.reason}</p>
            {selectedRecall.closure && (
              <Alert severity="success">
                Closed{" "}
                {inventoryDateTime(
                  selectedRecall.closure.created_at,
                  data.timezone,
                )}
                {closureActor ? ` by ${closureActor}` : ""}.{" "}
                {selectedRecall.closure.reason} Evidence:{" "}
                {selectedRecall.closure.evidence_reference}. Closing preserves
                recall history; later receipts of these lots require a new case.
              </Alert>
            )}
          </Card>
          <div className="inventory-two-col wide-left">
            <Card title="Case stock positions">
              <div className="inventory-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Lot</th>
                      <th>Location</th>
                      <th>On hand</th>
                      <th>Containment</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.positions.map((position) => (
                      <tr
                        key={position.batch_id}
                        className={
                          position.batch_id === selectedPosition?.batch_id
                            ? "selected"
                            : ""
                        }
                      >
                        <td>
                          {position.lot_number}
                          <small>
                            Expires{" "}
                            {inventoryDate(position.expires_on, data.timezone)}
                          </small>
                        </td>
                        <td>{position.location_path}</td>
                        <td>
                          {number(position.on_hand_units)}{" "}
                          {selectedRecall.stock_unit}
                        </td>
                        <td>
                          <Badge
                            tone={position.held_for_case ? "warning" : "danger"}
                          >
                            {position.held_for_case
                              ? "Held for case"
                              : "Not held"}
                          </Badge>
                        </td>
                        <td>
                          <Button
                            type="button"
                            size="small"
                            variant="outlined"
                            disabled={
                              formLocked ||
                              !position.held_for_case ||
                              decimalCompare(position.on_hand_units, "0") <= 0
                            }
                            onClick={() => {
                              setPositionId(position.batch_id);
                              setQuantity(position.on_hand_units);
                            }}
                          >
                            Use position
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.positions.length && (
                <p>No stock positions are recorded for this case.</p>
              )}
              {data.position_page.page_count > 1 && (
                <nav
                  className="inventory-pagination"
                  aria-label="Recall position pagination"
                >
                  <Button
                    variant="outlined"
                    disabled={readDisabled || data.position_page.page === 1}
                    onClick={() =>
                      void onRead({
                        ...applied,
                        position_page: data.position_page.page - 1,
                      })
                    }
                  >
                    Previous
                  </Button>
                  <span>
                    Page {data.position_page.page} of{" "}
                    {data.position_page.page_count}
                  </span>
                  <Button
                    variant="outlined"
                    disabled={
                      readDisabled ||
                      data.position_page.page === data.position_page.page_count
                    }
                    onClick={() =>
                      void onRead({
                        ...applied,
                        position_page: data.position_page.page + 1,
                      })
                    }
                  >
                    Next
                  </Button>
                </nav>
              )}
            </Card>
            <Card title="Record stock disposition">
              <p>
                Only positions held for this case with stock on hand are
                eligible. The quantity cannot exceed the selected position’s
                stock on hand. Case totals above come from the full case; this
                page is not used to calculate completion.
              </p>
              <form
                onSubmit={(event) => event.preventDefault()}
                className="inventory-form-grid"
              >
                <TextField
                  size="small"
                  label="Selected stock position"
                  value={
                    selectedPosition
                      ? `${selectedPosition.lot_number} · ${selectedPosition.location_path}`
                      : "No eligible held position on this page"
                  }
                  disabled
                />
                <TextField
                  size="small"
                  type="number"
                  label={`Disposition quantity (${selectedRecall.stock_unit})`}
                  value={quantity}
                  disabled={formLocked || !selectedPosition}
                  slotProps={{
                    htmlInput: {
                      min: 1,
                      max: selectedPosition?.on_hand_units,
                      step: "any",
                    },
                  }}
                  onChange={(event) => setQuantity(event.target.value)}
                />
                <TextField
                  size="small"
                  label="Evidence / return reference"
                  value={dispositionEvidence}
                  disabled={formLocked}
                  required
                  onChange={(event) =>
                    setDispositionEvidence(event.target.value)
                  }
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                />
                <TextField
                  size="small"
                  label="Disposition reason"
                  value={dispositionReason}
                  disabled={formLocked}
                  required
                  multiline
                  minRows={2}
                  onChange={(event) => setDispositionReason(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                />
                <PermissionNote
                  allowed={canDispose}
                  permission="recall.dispose"
                />
                <ConfirmButton
                  tone="danger"
                  disabled={mutationDisabled(
                    dispositionEndpoint,
                    dispositionBody,
                    dispositionInvalid,
                    canDispose,
                  )}
                  onConfirm={() =>
                    void run(
                      dispositionEndpoint,
                      dispositionBody,
                      "Disposition recorded",
                      `${number(quantity)} ${selectedRecall.stock_unit} recorded for ${selectedRecall.reference}.`,
                      () => {
                        setDispositionEvidence("");
                        setDispositionReason("");
                      },
                    )
                  }
                  confirmationTitle="Record this disposition?"
                  confirmationContent={
                    <p>
                      This removes the entered quantity from the selected held
                      stock position and records the supplied evidence.
                    </p>
                  }
                >
                  {isSamePending(dispositionEndpoint, dispositionBody)
                    ? "Retry disposition"
                    : "Approve and record disposition"}
                </ConfirmButton>
              </form>
            </Card>
          </div>
          {decimalCompare(selectedRecall.uncontained_units, "0") > 0 &&
            selectedRecall.status !== "closed" && (
              <Card title="Contain legacy case stock">
                <Alert severity="warning">
                  {number(selectedRecall.uncontained_units)}{" "}
                  {selectedRecall.stock_unit} remain outside this case hold.
                  Containment adds the missing case holds; it does not backfill
                  or alter receipt history.
                </Alert>
                <form
                  onSubmit={(event) => event.preventDefault()}
                  className="inventory-form-grid"
                >
                  <TextField
                    size="small"
                    label="Containment reason"
                    value={containReason}
                    disabled={formLocked}
                    required
                    multiline
                    minRows={2}
                    onChange={(event) => setContainReason(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 200 } }}
                  />
                  <PermissionNote allowed={canLock} permission="recall.lock" />
                  <ConfirmButton
                    tone="danger"
                    disabled={mutationDisabled(
                      containEndpoint,
                      containBody,
                      containInvalid,
                      canLock,
                    )}
                    onConfirm={() =>
                      void run(
                        containEndpoint,
                        containBody,
                        "Recall stock contained",
                        `Missing case holds were created for ${selectedRecall.reference}.`,
                        () => setContainReason(""),
                      )
                    }
                    confirmationTitle="Contain all remaining case stock?"
                    confirmationContent={
                      <p>
                        This creates missing recall-case holds for current
                        on-hand positions. It does not change inventory
                        quantities.
                      </p>
                    }
                  >
                    {isSamePending(containEndpoint, containBody)
                      ? "Retry containment"
                      : "Contain remaining stock"}
                  </ConfirmButton>
                </form>
              </Card>
            )}
          <Card title="Disposition history">
            <div className="inventory-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Recorded</th>
                    <th>Batch</th>
                    <th>Quantity</th>
                    <th>Method</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dispositions.map((record) => {
                    const actor = data.users.find(
                      (user) => user.id === record.actor_id,
                    );
                    return (
                      <tr key={record.id}>
                        <td>
                          {inventoryDateTime(record.created_at, data.timezone)}
                          <small>{actor?.name ?? "Clinic user"}</small>
                        </td>
                        <td>{record.batch_id}</td>
                        <td>
                          {number(record.quantity_units)}{" "}
                          {selectedRecall.stock_unit}
                        </td>
                        <td>
                          {record.method.replaceAll("_", " ")}
                          <small>{record.reason}</small>
                        </td>
                        <td>{record.evidence_reference}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!data.dispositions.length && (
              <p>No dispositions have been recorded.</p>
            )}
            {data.history_page.page_count > 1 && (
              <nav
                className="inventory-pagination"
                aria-label="Disposition history pagination"
              >
                <Button
                  variant="outlined"
                  disabled={readDisabled || data.history_page.page === 1}
                  onClick={() =>
                    void onRead({
                      ...applied,
                      history_page: data.history_page.page - 1,
                    })
                  }
                >
                  Previous
                </Button>
                <span>
                  Page {data.history_page.page} of{" "}
                  {data.history_page.page_count}
                </span>
                <Button
                  variant="outlined"
                  disabled={
                    readDisabled ||
                    data.history_page.page === data.history_page.page_count
                  }
                  onClick={() =>
                    void onRead({
                      ...applied,
                      history_page: data.history_page.page + 1,
                    })
                  }
                >
                  Next
                </Button>
              </nav>
            )}
          </Card>
          {selectedRecall.status !== "closed" && (
            <Card title="Close recall case">
              <Alert
                severity={
                  decimalCompare(selectedRecall.remaining_units, "0") === 0
                    ? "info"
                    : "warning"
                }
              >
                {decimalCompare(selectedRecall.remaining_units, "0") === 0
                  ? "The server reports zero remaining units. Closing records final review evidence; it does not release holds."
                  : `${number(selectedRecall.remaining_units)} ${selectedRecall.stock_unit} remain. Complete disposition before closing this case.`}
              </Alert>
              <form
                onSubmit={(event) => event.preventDefault()}
                className="inventory-form-grid"
              >
                <TextField
                  size="small"
                  label="Closure reason"
                  value={closureReason}
                  disabled={formLocked}
                  required
                  multiline
                  minRows={2}
                  onChange={(event) => setClosureReason(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                />
                <TextField
                  size="small"
                  label="Closure evidence"
                  value={closureEvidence}
                  disabled={formLocked}
                  required
                  onChange={(event) => setClosureEvidence(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 200 } }}
                />
                <PermissionNote
                  allowed={canDispose}
                  permission="recall.dispose"
                />
                <ConfirmButton
                  tone="danger"
                  disabled={mutationDisabled(
                    closeEndpoint,
                    closeBody,
                    closeInvalid,
                    canDispose,
                  )}
                  onConfirm={() =>
                    void run(
                      closeEndpoint,
                      closeBody,
                      "Recall case closed",
                      `${selectedRecall.reference} was closed with final evidence.`,
                      () => {
                        setClosureReason("");
                        setClosureEvidence("");
                      },
                    )
                  }
                  confirmationTitle="Close this recall case?"
                  confirmationContent={
                    <p>
                      The server must confirm that no affected units remain.
                      Closing does not release any hold.
                    </p>
                  }
                >
                  {isSamePending(closeEndpoint, closeBody)
                    ? "Retry closure"
                    : "Close recall case"}
                </ConfirmButton>
              </form>
            </Card>
          )}
        </>
      )}
      <Card title="Create recall case">
        <p>
          Select 1–100 exact lots for one product. Creating the case places all
          current stock for those lots on a case-specific recall hold.
        </p>
        <form
          className="inventory-form-grid"
          onSubmit={(event) => event.preventDefault()}
        >
          <TextField
            size="small"
            label="Recall reference"
            value={reference}
            disabled={formLocked}
            required
            onChange={(event) => setReference(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <TextField
            size="small"
            label="Recall reason"
            value={createReason}
            disabled={formLocked}
            required
            multiline
            minRows={2}
            onChange={(event) => setCreateReason(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <TextField
            size="small"
            label="Required disposition (fixed)"
            value="Return to supplier"
            helperText="Cases created here require return to supplier; this disposition cannot be changed."
            disabled
          />
        </form>
        <form
          className="inventory-toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (!readDisabled)
              void onRead({
                ...applied,
                lot_q: lotQuery.trim(),
                lot_page: 1,
                product_id: selectedProductId ?? undefined,
              });
          }}
        >
          <TextField
            size="small"
            label="Find lots"
            value={lotQuery}
            disabled={readDisabled}
            onChange={(event) => setLotQuery(event.target.value)}
            placeholder="Product or lot number"
            slotProps={{ htmlInput: { maxLength: 100 } }}
          />
          <Button type="submit" variant="outlined" disabled={readDisabled}>
            Search lots
          </Button>
          {selectedLotIds.length > 0 && (
            <Button
              type="button"
              variant="outlined"
              disabled={formLocked}
              onClick={() => {
                setSelectedLots([]);
                setSelectedProductId(null);
                setSelectedProductName("");
                void onRead({ ...applied, product_id: undefined, lot_page: 1 });
              }}
            >
              Clear selected lots
            </Button>
          )}
        </form>
        <p role="status">
          {selectedLotIds.length} of 100 lots selected
          {selectedProductName ? ` for ${selectedProductName}` : ""}.
        </p>
        {selectedLots.length > 0 && (
          <div
            className="inventory-form-actions"
            aria-label="Selected recall lots"
          >
            {selectedLots.map((lot) => (
              <Chip
                key={lot.id}
                label={`${lot.product_name} · lot ${lot.lot_number}`}
                variant="outlined"
                onDelete={formLocked ? undefined : () => toggleLot(lot)}
              />
            ))}
          </div>
        )}
        <div className="inventory-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Product</th>
                <th>Lot</th>
                <th>Expires</th>
              </tr>
            </thead>
            <tbody>
              {data.lot_options.map((option) => {
                const checked = selectedLotIds.includes(option.id);
                const incompatible = Boolean(
                  selectedProductId && selectedProductId !== option.product_id,
                );
                return (
                  <tr key={option.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={
                          formLocked ||
                          incompatible ||
                          (!checked && selectedLotIds.length >= 100)
                        }
                        onChange={() => toggleLot(option)}
                        aria-label={`Select lot ${option.lot_number}`}
                      />
                    </td>
                    <td>
                      {option.product_name}
                      <small>{option.stock_unit}</small>
                    </td>
                    <td>{option.lot_number}</td>
                    <td>{inventoryDate(option.expires_on, data.timezone)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!data.lot_options.length && <p>No lots match this picker.</p>}
        {data.lot_page.page_count > 1 && (
          <nav
            className="inventory-pagination"
            aria-label="Recall lot picker pagination"
          >
            <Button
              variant="outlined"
              disabled={readDisabled || data.lot_page.page === 1}
              onClick={() =>
                void onRead({
                  ...applied,
                  lot_page: data.lot_page.page - 1,
                  product_id: selectedProductId ?? undefined,
                })
              }
            >
              Previous
            </Button>
            <span>
              Page {data.lot_page.page} of {data.lot_page.page_count}
            </span>
            <Button
              variant="outlined"
              disabled={
                readDisabled || data.lot_page.page === data.lot_page.page_count
              }
              onClick={() =>
                void onRead({
                  ...applied,
                  lot_page: data.lot_page.page + 1,
                  product_id: selectedProductId ?? undefined,
                })
              }
            >
              Next
            </Button>
          </nav>
        )}
        <div className="inventory-form-actions">
          <PermissionNote allowed={canLock} permission="recall.lock" />
          <ConfirmButton
            tone="danger"
            disabled={mutationDisabled(
              createEndpoint,
              createBody,
              createInvalid,
              canLock,
            )}
            onConfirm={() =>
              void run(
                createEndpoint,
                createBody,
                "Recall case created",
                `${selectedLotIds.length} exact ${selectedLotIds.length === 1 ? "lot was" : "lots were"} added to the case; current stock was placed under case hold.`,
                resetCreate,
              )
            }
            confirmationTitle="Create this recall case?"
            confirmationContent={
              <p>
                This places current stock for the selected exact lots on a
                recall hold. All lots must belong to the same product.
              </p>
            }
          >
            {isSamePending(createEndpoint, createBody)
              ? "Retry recall creation"
              : "Create and contain recall"}
          </ConfirmButton>
        </div>
      </Card>
    </div>
  );
}
