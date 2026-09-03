import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api, ApiError } from "../../api/client";
import { LoadState } from "../../shared/ui";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import type { InventoryData, Decimal } from "./inventoryContracts";
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
  | "replenishment"
  | "purchasing"
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

const links: { screen: Screen; href: string; label: string; short: string }[] =
  [
    {
      screen: "catalog",
      href: "/clinic/inventory",
      label: "Product catalog",
      short: "Catalog",
    },
    {
      screen: "replenishment",
      href: "/clinic/inventory/replenishment",
      label: "Replenishment",
      short: "Replenish",
    },
    {
      screen: "purchasing",
      href: "/clinic/inventory/purchasing",
      label: "Purchasing",
      short: "Purchase",
    },
    {
      screen: "receiving",
      href: "/clinic/inventory/receiving",
      label: "Receiving",
      short: "Receive",
    },
    {
      screen: "lots",
      href: "/clinic/inventory/lots",
      label: "Inventory & lots",
      short: "Lots",
    },
    {
      screen: "activity",
      href: "/clinic/inventory/activity",
      label: "Activity",
      short: "Activity",
    },
    {
      screen: "recalls",
      href: "/clinic/inventory/recalls",
      label: "Recalls",
      short: "Recalls",
    },
    {
      screen: "controlled",
      href: "/clinic/inventory/controlled",
      label: "Controlled",
      short: "Controlled",
    },
  ];

function screenForPath(path: string): Screen {
  const value = path.replace(/\/$/, "");
  return links.find((link) => link.href === value)?.screen ?? "catalog";
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
function unitLabel(data: InventoryData, productId: string) {
  return product(data, productId)?.base_unit ?? "unit";
}
function packageFor(data: InventoryData, packageId?: string) {
  return data.packages.find((item) => item.id === packageId);
}
function money(value: Decimal) {
  return `$${decimalMoney(value)}`;
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
  tone = "",
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`inventory-datapoint ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
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
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const payload = await api<{ data: InventoryData }>(
        "/api/clinic/inventory/bootstrap",
        { signal: controller.signal },
      );
      setData(payload.data);
    } catch (reason) {
      setError(
        reason instanceof DOMException && reason.name === "AbortError"
          ? "Inventory took too long to respond. Check your clinic session and try again."
          : reason instanceof Error
            ? reason.message
            : "Unable to load inventory.",
      );
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const run = async (
    endpoint: string,
    body: Record<string, unknown>,
    successTitle: string,
    successDetail: string,
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
      const payload = await api<{ data: InventoryData }>(endpoint, {
        method: "POST",
        body: requestBody,
      });
      setData(payload.data);
      setUncertainMutation(null);
      setNotice({
        tone: "success",
        title: successTitle,
        detail: successDetail,
      });
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
              <h1>
                {screen === "catalog"
                  ? "Medication inventory"
                  : links.find((link) => link.screen === screen)?.label}
              </h1>
            </div>
          </header>
          <div className="inventory-content">
            <div className="inventory-subnav">
              {links.map((link) => (
                <a
                  key={link.screen}
                  href={link.href}
                  aria-current={screen === link.screen ? "page" : undefined}
                >
                  {link.short}
                </a>
              ))}
            </div>
            <Notice notice={notice} onClose={() => setNotice(null)} />
            {screen === "catalog" && (
              <CatalogScreen
                data={data}
                available={available}
                held={held}
                onDemo={
                  [
                    "inventory.receive",
                    "inventory.hold",
                    "inventory.count",
                  ].every((permission) => capability(data, permission))
                    ? () =>
                        void run(
                          "/api/clinic/inventory/demo",
                          {},
                          "Inventory scenario loaded",
                          "Products, shipments, lots, ledger entries, and controlled counts are ready.",
                        )
                    : undefined
                }
              />
            )}
            {screen === "replenishment" && (
              <ReplenishmentScreen data={data} busy={busy} run={run} />
            )}
            {screen === "purchasing" && (
              <PurchasingScreen data={data} busy={busy} run={run} />
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
  onDemo,
}: {
  data: InventoryData;
  available: Decimal;
  held: Decimal;
  onDemo?: () => void;
}) {
  const [query, setQuery] = useState("");
  const products = data.products.filter((item) =>
    `${item.name} ${item.ndc} ${item.preferred_supplier}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  if (data.products.length === 0)
    return (
      <Card title="Product catalog">
        <p className="inventory-lead">No inventory records.</p>
        {onDemo && (
          <button
            className="inventory-button primary"
            type="button"
            onClick={onDemo}
          >
            Load inventory scenario
          </button>
        )}
      </Card>
    );
  return (
    <div className="inventory-stack">
      <div className="inventory-metrics">
        <Metric
          label="Available stock"
          value={number(available)}
          detail="Active, unheld units only"
        />
        <Metric
          label="Safety held"
          value={number(held)}
          detail="Excluded from availability"
          tone="warning"
        />
        <Metric
          label="Catalog coverage"
          value={`${data.products.length} products`}
          detail={`${data.lots.length} traceable lots`}
        />
      </div>
      <Card title="Catalog and lot traceability">
        <div className="inventory-card-heading">
          <Field label="Search catalog">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name, NDC, supplier"
            />
          </Field>
        </div>
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
                  <td>
                    <strong>{item.name}</strong>
                    <small>
                      {item.preferred_supplier ?? "Supplier not recorded"} ·{" "}
                      {packageFor(data, item.package_id)?.description ??
                        "Package metadata not recorded"}
                    </small>
                  </td>
                  <td className="mono">{item.ndc}</td>
                  <td className="numeric">
                    {number(item.available_units)} {item.base_unit}s
                  </td>
                  <td className="numeric">{number(item.on_hand_units)}</td>
                  <td className="numeric">
                    {number(item.reorder_point_units)}
                  </td>
                  <td>
                    <Badge tone={item.low_stock ? "warning" : "success"}>
                      {item.low_stock ? "Reorder" : "In range"}
                    </Badge>
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
              input_unit: packageInfo?.package_unit ?? "package",
              conversion_factor: item.units_per_package,
              unit_price: unitPrice,
              currency: "USD",
            },
          ],
        },
      },
      "Draft created",
      `${number(quantity)} ${packageInfo?.package_unit ?? "package"} (${number(decimalMultiply(quantity, item.units_per_package))} ${item.base_unit}) added.`,
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
                `${number(item.units_per_package)} ${item.base_unit} per ${packageInfo?.package_unit ?? "package"}`}
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
            label={`Order quantity (${packageInfo?.package_unit ?? "package"})`}
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
            value={`${number(quantity || "0")} ${packageInfo?.package_unit ?? "package"}`}
          />
          <DataPoint
            label="Base-unit quantity"
            value={`${number(decimalMultiply(quantity || "0", item.units_per_package))} ${item.base_unit}`}
          />
          {validDecimal(unitPrice, true) && (
            <DataPoint
              label="Estimated subtotal"
              value={money(decimalMultiply(quantity || "0", unitPrice))}
            />
          )}
        </div>
      </Card>
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
  const packageUnit = packageInfo?.package_unit ?? "package";
  const baseUnit = item?.base_unit ?? "unit";
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
        reason: `User advanced purchase order to ${next[0]}.`,
      },
      "Purchase order updated",
      `${order.number} is now ${next[0].replaceAll("_", " ")}.`,
    );
  const cancel = () =>
    void run(
      `/api/clinic/inventory/purchase-orders/${order.id}/cancel-remainder`,
      {
        status: "cancelled",
        reason: "User cancelled outstanding remainder",
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
          <div className="inventory-form-actions">
            {next && (
              <ConfirmButton
                tone="outline"
                disabled={busy || !capability(data, next[2])}
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
                  !capability(data, "procurement.submit")
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
                    {money(line.package_price)} / {packageUnit}
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
              label={`${number(line.ordered_packages)} ${packageUnit} × ${money(line.package_price)}`}
              value={money(order.subtotal)}
            />
            <DataPoint label="Tax" value={money(order.tax)} />
            <DataPoint label="Shipping" value={money(order.shipping)} />
            <DataPoint label="Total" value={money(order.total)} />
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
  const packageUnit = packageInfo?.package_unit ?? "package";
  const baseUnit = item?.base_unit ?? "unit";
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
  const [reason, setReason] = useState("Shipment receipt");
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
  const [reason, setReason] = useState("Documented inventory correction");
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
  const rows = data.movements.filter((item) =>
    `${item.type} ${item.reason ?? ""} ${item.source_id}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  return (
    <div className="inventory-stack">
      <Card title="Activity ledger">
        <div className="inventory-card-heading">
          <Field label="Filter ledger">
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Type, reason, source"
            />
          </Field>
        </div>
        <div className="inventory-table-wrap">
          <table>
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
                  <td>{inventoryDateTime(item.occurred_at, data.timezone)}</td>
                  <td>
                    <Badge tone={item.direction === "out" ? "warning" : "blue"}>
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
  const recallBalances = data.balances.filter((record) =>
    recallLotIds.includes(record.lot_id),
  );
  const [balanceId, setBalanceId] = useState("");
  const batch =
    recallBalances.find((record) => record.id === balanceId) ??
    recallBalances[0];
  const recalledLot = batch && lot(data, batch.lot_id);
  const batchLocation = batch && location(data, batch.location_id);
  const [quantity, setQuantity] = useState<Decimal>(batch?.held_units ?? "0");
  const [evidence, setEvidence] = useState("");
  if (!recall || !item || !recalledLot || !batch)
    return (
      <Card title="Recalls and disposition">
        <p>No recall records are available.</p>
      </Card>
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(
      `/api/clinic/inventory/recalls/${recall.id}/disposition`,
      {
        disposition: {
          batch_id: batch.id.replace("bal_", ""),
          quantity_units: quantity,
          method: recall.required_disposition,
          evidence_reference: evidence,
          reason: "Approved recall disposition",
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
                    const selectedBalance = data.balances.find((record) =>
                      lotIds.includes(record.lot_id),
                    );
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
              <Badge
                tone={
                  decimalCompare(recall.held_units, "0") === 0
                    ? "success"
                    : "danger"
                }
              >
                {recall.status.replaceAll("_", " ")}
              </Badge>
              <h2>{recall.reference}</h2>
              <p className="inventory-lead">
                {item.name} · lot {recalledLot.lot_number}
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
              value={`${number(recall.held_units)} ${item.base_unit}`}
              tone="warning"
            />
            <DataPoint
              label="Location"
              value={batchLocation?.name ?? "Location not recorded"}
            />
            <DataPoint
              label="Available"
              value={`${number(batch.available_units)} ${item.base_unit}`}
              tone="danger"
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
                className={
                  index <=
                  (decimalCompare(recall.held_units, "0") === 0 ? 5 : 4)
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
      </div>
      <Card title="Record disposition">
        {decimalCompare(recall.held_units, "0") === 0 ? (
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
      { review: { reason: "Authorized certification" } },
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
              <strong>Authorized certification</strong>
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
