import {
  useEffect,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { api, ApiError } from "../../api/client";
import { LoadState } from "../../shared/ui";
import type { InventoryData } from "./inventoryContracts";
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
  const value = path.split(/[?#]/)[0].replace(/\/$/, "");
  return links.find((link) => link.href === value)?.screen ?? "catalog";
}

function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
function money(value: number) {
  return `$${value.toFixed(2)}`;
}
function date(value?: string) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(value))
    : "—";
}
function dateTime(value?: string) {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
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
function statusLabel(value: string) {
  return value.replaceAll("_", " ");
}
function movementLabel(value: string) {
  return (
    {
      receipt: "Received",
      opening_balance: "Opening balance",
      adjustment_in: "Stock added",
      adjustment_out: "Stock adjusted",
      damaged: "Damaged",
      expired: "Expired",
      return_to_supplier: "Returned to supplier",
      count_correction: "Count correction",
    }[value] ?? statusLabel(value)
  );
}
function signedUnits(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
  const unit = Math.abs(value) === 1 ? "tablet" : "tablets";
  return `${prefix}${number(Math.abs(value))} ${unit}`;
}
function sourceLabel(value: string) {
  if (value.startsWith("receipt_")) return "Receipt record";
  if (value.includes("transfer")) return "Transfer record";
  if (value.includes("count")) return "Cycle-count record";
  return "Inventory adjustment";
}
function balanceFor(data: InventoryData, balanceId?: string) {
  return (
    data.balances.find((item) => item.id === balanceId) ??
    data.balances.find((item) => item.available_units > 0) ??
    data.balances[0]
  );
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
function RecordPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  if (options.length < 2) return null;
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
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
          <p>The record will be appended to the audit trail.</p>
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
function PermissionNote({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <span className="inventory-permission ok">Available to your account</span>
  ) : (
    <span className="inventory-permission">
      View only · your account cannot perform this action.
    </span>
  );
}

export function InventoryApp({ path }: { path: string }) {
  const [activePath, setActivePath] = useState(path);
  const screen = screenForPath(activePath);
  const [data, setData] = useState<InventoryData>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    const onPopState = () =>
      setActivePath(`${window.location.pathname}${window.location.search}`);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleInventoryNavigation = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || (anchor.target && anchor.target !== "_self")) return;
    const url = new URL(anchor.href, window.location.href);
    if (
      url.origin !== window.location.origin ||
      !url.pathname.startsWith("/clinic/inventory")
    )
      return;
    event.preventDefault();
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setActivePath(`${url.pathname}${url.search}${url.hash}`);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await api<{ data: InventoryData }>(
        "/api/clinic/inventory/bootstrap",
      );
      setData(payload.data);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to load inventory.",
      );
    } finally {
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
    setBusy(true);
    setNotice(null);
    try {
      const requestKey = crypto.randomUUID();
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
      setNotice({
        tone: "success",
        title: successTitle,
        detail: successDetail,
      });
    } catch (reason) {
      setNotice({
        tone: "error",
        title:
          reason instanceof ApiError && reason.status === 403
            ? "Permission denied"
            : "Action blocked",
        detail:
          reason instanceof Error
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

  const activeUser =
    data.users.find((item) => item.id === data.current_user_id) ??
    data.users[0];

  return (
    <div className="inventory-app" onClick={handleInventoryNavigation}>
      <div className="inventory-layout">
        <div className="inventory-main">
          <header className="inventory-header">
            <div>
              <p className="inventory-eyebrow">
                {links
                  .find((link) => link.screen === screen)
                  ?.label.toUpperCase()}
              </p>
              <h1>
                {screen === "catalog"
                  ? "Medication inventory"
                  : links.find((link) => link.screen === screen)?.label}
              </h1>
            </div>
            <div className="inventory-header-meta">
              <span>
                {activeUser?.name} · {activeUser?.role}
              </span>
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
                onDemo={() =>
                  void run(
                    "/api/clinic/inventory/demo",
                    {},
                    "Example inventory loaded",
                    "Two example products, a partial shipment, a recalled lot, activity, and a controlled count are now available for review.",
                  )
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
  onDemo,
}: {
  data: InventoryData;
  onDemo: () => void;
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
        <p className="inventory-lead">
          The authenticated APPly clinic has no inventory records yet.
        </p>
        <button
          className="inventory-button primary"
          type="button"
          onClick={onDemo}
        >
          Load example inventory
        </button>
        <p className="inventory-caption">
          Adds example clinic inventory for local review. No patient records are
          created.
        </p>
      </Card>
    );
  return (
    <div className="inventory-stack">
      <Card title="Catalog and lot traceability">
        <div className="inventory-card-heading">
          <div>
            <p className="inventory-lead">
              Search products, packages, NDCs, suppliers, and stock records.
            </p>
          </div>
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
                <th scope="col">Product / package</th>
                <th scope="col">NDC</th>
                <th scope="col">Available</th>
                <th scope="col">On hand</th>
                <th scope="col">Reorder point</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.name}</strong>
                    <small>
                      {item.preferred_supplier} · {item.units_per_package}{" "}
                      {item.base_unit}s / bottle
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
                  <td>
                    <a href={`/clinic/inventory/lots?product_id=${item.id}`}>
                      View lots
                    </a>
                    {item.low_stock && (
                      <a
                        href={`/clinic/inventory/replenishment?product_id=${item.id}`}
                      >
                        Start replenishment
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {products.length === 0 && (
          <div className="inventory-muted-panel" role="status">
            <strong>No matching products</strong>
            <p>Try a different search or clear the catalog filter.</p>
            <button
              className="inventory-button outline"
              type="button"
              onClick={() => setQuery("")}
            >
              Clear search
            </button>
          </div>
        )}
      </Card>
      <div className="inventory-two-col">
        <Card title="Attention queue">
          <ul className="inventory-list">
            {data.lots
              .filter((item) => item.status !== "active")
              .map((item) => (
                <li key={item.id}>
                  <Badge tone="danger">{statusLabel(item.status)}</Badge>
                  <div>
                    <strong>Lot {item.lot_number}</strong>
                    <small>
                      {product(data, item.product_id)?.name} · expires{" "}
                      {date(item.expiration_date)}
                    </small>
                  </div>
                </li>
              ))}
            {data.lots.every((item) => item.status === "active") && (
              <li>No held or recalled lots.</li>
            )}
          </ul>
        </Card>
        <Card title="Inventory boundaries">
          <p className="inventory-lead">
            Inventory records belong to this clinic and stay separate from
            patient records.
          </p>
        </Card>
      </div>
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
  const item =
    data.products.find((candidate) => candidate.id === requestedProductId) ??
    data.products[0];
  const [quantity, setQuantity] = useState(5);
  const [reason, setReason] = useState("");
  if (!item)
    return (
      <Card title="Replenishment suggestions">
        <p>No product catalog is available.</p>
      </Card>
    );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(
      "/api/clinic/inventory/purchase-orders",
      {
        purchase_order: {
          number: `PO-DRAFT-${Date.now()}`,
          destination: "Main Pharmacy",
          reason: reason.trim(),
          lines: [
            {
              product_id: item.id,
              quantity,
              input_unit: "package",
              conversion_factor: item.units_per_package,
              unit_price: 2.4,
              currency: "USD",
            },
          ],
          request_key: crypto.randomUUID(),
        },
      },
      "Draft created",
      `${quantity} bottles (${quantity * item.units_per_package} tablets) were added to the purchase order draft.`,
    );
  };
  return (
    <div className="inventory-two-col wide-left">
      <Card title="Replenishment suggestion" eyebrow="PROCUREMENT">
        <div className="inventory-panel-heading">
          <div>
            <h3>{item.name}</h3>
            <p className="inventory-lead">
              NDC {item.ndc} · Bottle of {item.units_per_package} tablets
            </p>
          </div>
        </div>
        <div className="inventory-data-grid four">
          <DataPoint
            label="Available"
            value={`${number(item.available_units)} tablets`}
          />
          <DataPoint
            label="Held"
            value={`${number(data.balances.filter((balance) => balance.product_id === item.id).reduce((sum, balance) => sum + balance.held_units, 0))} tablets`}
            tone="warning"
          />
          <DataPoint
            label="On order"
            value={`${number(data.purchase_orders.reduce((sum, order) => sum + (order.status === "cancelled" ? 0 : order.lines.filter((line) => line.product_id === item.id).reduce((lineSum, line) => lineSum + (line.ordered_units - line.received_units), 0)), 0))} tablets`}
          />
          <DataPoint
            label="Reorder point"
            value={`${number(item.reorder_point_units)} tablets`}
          />
        </div>
        <div className="inventory-muted-panel">
          <strong>Demand and lead time</strong>
          <p>
            Demand and lead time are not configured. Enter the whole-bottle
            quantity you want to order.
          </p>
        </div>
        <form className="inventory-form-grid" onSubmit={submit}>
          <Field
            label="Order quantity (bottles)"
            hint={`${quantity * item.units_per_package} tablets · package multiple ${item.units_per_package}`}
          >
            <input
              type="number"
              min={1}
              step={1}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </Field>
          <Field label="Supplier">
            <input value={item.preferred_supplier} readOnly />
          </Field>
          <Field label="Destination">
            <input value="Main Pharmacy" readOnly />
          </Field>
          <Field
            label="Reason for order"
            hint="Required so the purchase decision can be reviewed later."
          >
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: below reorder point"
              required
            />
          </Field>
          <div className="inventory-form-actions">
            <PermissionNote allowed={capability(data, "procurement.create")} />
            <ConfirmButton
              disabled={
                busy ||
                !capability(data, "procurement.create") ||
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
          <DataPoint label="Package quantity" value={`${quantity} bottles`} />
          <DataPoint
            label="Base-unit quantity"
            value={`${number(quantity * item.units_per_package)} tablets`}
          />
          <p className="inventory-info">
            Each bottle is exactly {item.units_per_package} tablets. Posted
            inventory balances and movements use tablets.
          </p>
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
  const requestedOrderId = new URLSearchParams(window.location.search).get(
    "order_id",
  );
  const [selectedOrderId, setSelectedOrderId] = useState(
    requestedOrderId ?? data.purchase_orders[0]?.id ?? "",
  );
  const order =
    data.purchase_orders.find((item) => item.id === selectedOrderId) ??
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
  const line = order.lines[0];
  const item = product(data, line.product_id);
  const remaining = Math.max(
    0,
    line.ordered_packages -
      line.received_packages -
      (order.cancelled_remaining_units
        ? Math.ceil(order.cancelled_remaining_units / line.units_per_package)
        : 0),
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
      `${order.number} is now ${next[0].replaceAll("_", " ")}. The transition is recorded in the immutable order event trail.`,
    );
  const cancel = () =>
    void run(
      `/api/clinic/inventory/purchase-orders/${order.id}/cancel-remainder`,
      {
        status: "cancelled",
        reason: "User cancelled outstanding remainder",
        request_key: crypto.randomUUID(),
      },
      "Remainder cancelled",
      "The outstanding quantity was closed; received history remains unchanged.",
    );
  return (
    <div className="inventory-stack">
      <Card>
        <div className="inventory-panel-heading">
          <div>
            <div className="inventory-title-row">
              <h2>{order.number}</h2>
              <Badge tone="blue">{statusLabel(order.status)}</Badge>
            </div>
            <p className="inventory-lead">
              {order.supplier} → {order.destination} · ordered{" "}
              {dateTime(order.ordered_at)}
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
                  remaining === 0 ||
                  !capability(data, "procurement.submit")
                }
                onConfirm={cancel}
              >
                Cancel {remaining}-bottle remainder
              </ConfirmButton>
            )}
          </div>
        </div>
        <RecordPicker
          label="Purchase order"
          value={order.id}
          options={data.purchase_orders.map((candidate) => ({
            value: candidate.id,
            label: `${candidate.number} · ${statusLabel(candidate.status)}`,
          }))}
          onChange={setSelectedOrderId}
        />
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
        <Card title="Purchase order lines">
          <div className="inventory-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Product / package</th>
                  <th scope="col">Ordered</th>
                  <th scope="col">Received</th>
                  <th scope="col">Remaining</th>
                  <th scope="col">Price</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>{item?.name}</strong>
                    <small>
                      {item && `${item.units_per_package} tablets / bottle`} ·
                      NDC {item?.ndc}
                    </small>
                  </td>
                  <td className="numeric">
                    <strong>{line.ordered_packages} bottles</strong>
                    <small>{number(line.ordered_units)} tablets</small>
                  </td>
                  <td className="numeric">
                    <strong>{line.received_packages} bottles</strong>
                    <small>{number(line.received_units)} tablets</small>
                  </td>
                  <td className="numeric">
                    <strong>{remaining} bottles</strong>
                    <small>
                      {number(remaining * line.units_per_package)} tablets
                    </small>
                  </td>
                  <td className="numeric">
                    {money(line.package_price)} / bottle
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <PermissionNote allowed={capability(data, "procurement.approve")} />
        </Card>
        <Card title="Order summary">
          <div className="inventory-stack compact">
            <DataPoint
              label={`${line.ordered_packages} bottles × ${money(line.package_price)}`}
              value={money(order.subtotal)}
            />
            {order.tax > 0 && (
              <DataPoint label="Tax" value={money(order.tax)} />
            )}
            {order.shipping > 0 && (
              <DataPoint label="Shipping" value={money(order.shipping)} />
            )}
            <DataPoint label="Total" value={money(order.total)} />
            {line.received_packages > 0 &&
              line.ordered_packages > line.received_packages && (
                <p className="inventory-info">
                  {line.received_packages} of {line.ordered_packages} bottles
                  have been received. {remaining} remain open.
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
  const requestedShipmentId = new URLSearchParams(window.location.search).get(
    "shipment_id",
  );
  const [selectedShipmentId, setSelectedShipmentId] = useState(
    requestedShipmentId ?? data.shipments[0]?.id ?? "",
  );
  const shipment =
    data.shipments.find((item) => item.id === selectedShipmentId) ??
    data.shipments[0];
  const order = data.purchase_orders.find(
    (item) => item.id === shipment?.po_id,
  );
  const line = order?.lines[0];
  const item = line && product(data, line.product_id);
  const receipt =
    shipment && data.receipts.find((item) => item.shipment_id === shipment.id);
  const receiptLine = receipt?.lines[0];
  const recalledLot =
    data.lots.find((item) => item.lot_number === "250601A") ??
    data.lots.find((item) => item.status === "recalled");
  const [packages, setPackages] = useState(shipment?.package_count ?? 1);
  const [temperature, setTemperature] = useState("20.1");
  useEffect(() => {
    setPackages(shipment?.package_count ?? 1);
  }, [shipment?.id, shipment?.package_count]);
  if (!shipment || !order || !line || !item || !recalledLot)
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
          lot_number: recalledLot.lot_number,
          expiration_date: recalledLot.expiration_date,
          quantity_packages: packages,
          destination_location: "Quarantine",
          area_id: "quarantine_bin_1",
          temperature_c: temperature,
          exception: "recall_match",
          disposition: "quarantine_recall",
          status: "quarantined",
          reason: "Partial shipment received into quarantine",
        },
      },
      "Receipt safely quarantined",
      "The receipt is represented by one immutable movement. Replaying the workflow cannot create a duplicate and availability remains zero.",
    );
  return (
    <div className="inventory-two-col wide-left">
      <Card>
        <div className="inventory-panel-heading">
          <div>
            <h2>Shipment {shipment.supplier_reference}</h2>
            <p className="inventory-lead">
              {order.number} · delivered {dateTime(shipment.delivered_at)}
            </p>
          </div>
          <Badge tone={receipt?.status === "quarantined" ? "warning" : "blue"}>
            {statusLabel(receipt?.status ?? shipment.status)}
          </Badge>
        </div>
        <RecordPicker
          label="Shipment"
          value={shipment.id}
          options={data.shipments.map((candidate) => ({
            value: candidate.id,
            label: `${candidate.supplier_reference} · ${statusLabel(candidate.status)}`,
          }))}
          onChange={setSelectedShipmentId}
        />
        <div className="inventory-warning" role="alert">
          <strong>Blocking recall match: lot {recalledLot.lot_number}</strong>
          <p>
            Recall FDA-ACET-2026-08 requires quarantine. Main Pharmacy put-away
            is disabled and no override is available to receiving staff.
          </p>
        </div>
        <div className="inventory-data-grid two">
          <Field label="Product / package">
            <input
              value={`${item.name} · Bottle of ${item.units_per_package} tablets`}
              readOnly
            />
          </Field>
          <Field label="Lot number">
            <input value={recalledLot.lot_number} readOnly />
          </Field>
          <Field label="Expiration">
            <input value={recalledLot.expiration_date} readOnly />
          </Field>
          <Field
            label="Quantity (bottles)"
            hint={`${packages * item.units_per_package} tablets · 1 bottle = ${item.units_per_package} tablets`}
          >
            <input
              type="number"
              min={1}
              value={packages}
              onChange={(event) => setPackages(Number(event.target.value))}
            />
          </Field>
          <Field label="Temperature (°C)">
            <input
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
            />
          </Field>
          <Field label="Destination">
            <select value="Quarantine" disabled>
              <option>Quarantine · quarantine_bin_1</option>
              <option disabled>Main Pharmacy — blocked by recall</option>
            </select>
          </Field>
        </div>
        <div className="inventory-form-actions">
          {receipt ? (
            <p className="inventory-success-line" role="status">
              Receipt recorded. This delivery cannot be posted twice.
            </p>
          ) : (
            <>
              <PermissionNote allowed={capability(data, "inventory.receive")} />
              <ConfirmButton
                disabled={
                  busy ||
                  !capability(data, "inventory.receive") ||
                  packages !== shipment.package_count
                }
                onConfirm={confirm}
              >
                Confirm quarantined receipt
              </ConfirmButton>
            </>
          )}
        </div>
        {receiptLine && (
          <p className="inventory-success-line">
            Recorded: {receiptLine.quantity_packages} bottles /{" "}
            {number(receiptLine.quantity_units)} tablets at{" "}
            {receiptLine.area_id}.
          </p>
        )}
      </Card>
      <Card title="Receipt reconciliation">
        <div className="inventory-stack compact">
          <DataPoint
            label="PO ordered"
            value={`${line.ordered_packages} bottles · ${number(line.ordered_units)} tablets`}
          />
          <DataPoint
            label="Shipment delivered"
            value={`${shipment.package_count} bottles · ${number(shipment.expected_units)} tablets`}
          />
          <DataPoint
            label="This receipt"
            value={`${packages} bottles · ${number(packages * item.units_per_package)} tablets`}
          />
          <DataPoint
            label="PO remaining"
            value={`${Math.max(0, line.ordered_packages - line.received_packages)} bottles · ${number(Math.max(0, line.ordered_units - line.received_units))} tablets`}
          />
          <p className="inventory-info">
            <strong>Disposition:</strong> Quarantine — recall hold
            <br />
            <strong>Available after receipt:</strong> 0 tablets
          </p>
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
  const requestedProductId = new URLSearchParams(window.location.search).get(
    "product_id",
  );
  const [selectedId, setSelectedId] = useState(
    () =>
      data.balances.find((item) => item.product_id === requestedProductId)
        ?.id ??
      balanceFor(data)?.id ??
      "",
  );
  const [action, setAction] = useState<"transfer" | "adjust" | "count">(
    "transfer",
  );
  const [quantity, setQuantity] = useState(100);
  const [destination, setDestination] = useState(
    data.locations.find((item) => item.name === "Returns Holding")?.id ??
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
        `${number(quantity)} tablets were posted as an equal out/in pair.`,
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
        "A new immutable movement was appended; prior ledger entries were not edited.",
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
        "The count and signed variance are now in the server snapshot.",
      );
  };
  const blocked =
    selected.available_units === 0 || selectedLot.status !== "active";
  return (
    <div className="inventory-stack">
      <Card title="Lot balances">
        <div className="inventory-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Product / lot</th>
                <th scope="col">Location</th>
                <th scope="col">On hand</th>
                <th scope="col">Available</th>
                <th scope="col">Status</th>
                <th scope="col">Trace</th>
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
                    tabIndex={0}
                    aria-selected={balance.id === selected.id}
                    onClick={() => setSelectedId(balance.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedId(balance.id);
                      }
                    }}
                  >
                    <td>
                      <strong>{item.name}</strong>
                      <small>
                        Lot {lotItem.lot_number} · expires{" "}
                        {date(lotItem.expiration_date)}
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
                        {statusLabel(lotItem.status)}
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
              value={date(selectedLot.expiration_date)}
            />
          </div>
          <div className="inventory-muted-panel">
            <strong>Available stock is server-derived.</strong>
            <p>
              Held, recalled, blocked, expired, and inactive product records
              cannot be used as available inventory.
            </p>
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
                  : "Quantity / delta (tablets)"
              }
            >
              <input
                type="number"
                min={action === "count" ? 0 : 1}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
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
              />
              <ConfirmButton
                disabled={
                  busy ||
                  (action === "transfer" && blocked) ||
                  (action !== "count" && quantity <= 0)
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
              value={`${number(selected.available_units)} tablets`}
            />
            <p
              className={
                blocked ? "inventory-danger-text" : "inventory-success-line"
              }
            >
              {blocked
                ? "Action blocked: held, recalled, or unavailable stock cannot transfer."
                : "This lot is eligible for an available-stock operation."}
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
          <p className="inventory-lead">
            Immutable inventory entries, receipt sources, and server-recorded
            operators.
          </p>
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
                <th scope="col">Occurred</th>
                <th scope="col">Type</th>
                <th scope="col">Lot / location</th>
                <th scope="col">Quantity</th>
                <th scope="col">Reason / source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{dateTime(item.occurred_at)}</td>
                  <td>
                    <Badge tone={item.direction === "out" ? "warning" : "blue"}>
                      {movementLabel(item.type)}
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
                    <details className="inventory-source-details">
                      <summary>{sourceLabel(item.source_id)}</summary>
                      <small className="mono">{item.source_id}</small>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="inventory-muted-panel" role="status">
            <strong>No matching activity</strong>
            <p>Try a different filter or clear the ledger search.</p>
            <button
              className="inventory-button outline"
              type="button"
              onClick={() => setFilter("")}
            >
              Clear search
            </button>
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
  const requestedRecallId = new URLSearchParams(window.location.search).get(
    "recall_id",
  );
  const [selectedRecallId, setSelectedRecallId] = useState(
    requestedRecallId ?? data.recalls[0]?.id ?? "",
  );
  const recall =
    data.recalls.find((item) => item.id === selectedRecallId) ??
    data.recalls[0];
  const item = recall && product(data, recall.product_id);
  const recalledLot =
    recall &&
    data.lots.find((lotItem) =>
      recall.lot_numbers.includes(lotItem.lot_number),
    );
  const batch =
    recalledLot &&
    data.balances.find((balance) => balance.lot_id === recalledLot.id);
  const [quantity, setQuantity] = useState(recall?.held_units ?? 0);
  const [evidence, setEvidence] = useState("");
  useEffect(() => {
    setQuantity(recall?.held_units ?? 0);
    setEvidence("");
  }, [recall?.id, recall?.held_units]);
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
          method: "return_to_supplier",
          evidence_reference: evidence,
          reason: "Approved recall disposition",
        },
      },
      "Disposition recorded",
      `${number(quantity)} tablets were returned to the supplier and the evidence reference was appended.`,
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
        <RecordPicker
          label="Recall"
          value={recall.id}
          options={data.recalls.map((candidate) => ({
            value: candidate.id,
            label: `${candidate.reference} · ${statusLabel(candidate.status)}`,
          }))}
          onChange={setSelectedRecallId}
        />
        <Card className="recall-card">
          <div className="inventory-panel-heading">
            <div>
              <Badge tone={recall.held_units === 0 ? "success" : "danger"}>
                {statusLabel(recall.status)}
              </Badge>
              <h2>{recall.reference}</h2>
              <p className="inventory-lead">
                {item.name} · lot {recalledLot.lot_number}
              </p>
            </div>
            <div className="inventory-date">
              <small>Effective</small>
              <strong>{dateTime(recall.effective_at)}</strong>
            </div>
          </div>
          <div className="inventory-data-grid four">
            <DataPoint
              label="Affected"
              value={`${number(recall.affected_units)} tablets`}
            />
            <DataPoint
              label="Held now"
              value={`${number(recall.held_units)} tablets`}
              tone="warning"
            />
            <DataPoint label="Location" value="Quarantine" />
            <DataPoint label="Available" value="0 tablets" tone="danger" />
          </div>
          <p className="inventory-info">
            <strong>Required disposition:</strong> Return to supplier
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
                  index <= (recall.held_units === 0 ? 5 : 4) ? "done" : ""
                }
              >
                <span>{index + 1}</span>
                {stage}
              </div>
            ))}
          </div>
          <p className="inventory-caption">
            Ordinary receiving staff cannot release a recall hold.
          </p>
        </Card>
      </div>
      <Card title="Record disposition">
        <p className="inventory-lead">
          Pharmacist approval, exact quantity, and evidence are required.
        </p>
        {recall.held_units === 0 ? (
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
            <Field label="Quantity (tablets)">
              <input
                type="number"
                min={1}
                max={recall.held_units}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
              />
            </Field>
            <Field label="Evidence / return reference">
              <textarea
                value={evidence}
                onChange={(event) => setEvidence(event.target.value)}
                placeholder="Required supplier RMA or evidence reference"
              />
            </Field>
            <PermissionNote allowed={capability(data, "recall.dispose")} />
            <ConfirmButton
              tone="danger"
              disabled={
                busy ||
                !capability(data, "recall.dispose") ||
                !evidence.trim() ||
                quantity <= 0 ||
                quantity > recall.held_units
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
  const requestedReconciliationId = new URLSearchParams(
    window.location.search,
  ).get("reconciliation_id");
  const [selectedReconciliationId, setSelectedReconciliationId] = useState(
    requestedReconciliationId ?? data.controlled_reconciliations[0]?.id ?? "",
  );
  const reconciliation =
    data.controlled_reconciliations.find(
      (item) => item.id === selectedReconciliationId,
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
    reconciliation.status !== "certified" && !reconciliation.investigation_note;
  const investigate = () =>
    void run(
      `/api/clinic/inventory/controlled/${reconciliation.count_id}/investigate`,
      { review: { reason: note } },
      "Variance resolved",
      "The authorized correction and investigation record were appended. A separate authenticated reviewer must certify.",
    );
  const certify = () =>
    void run(
      `/api/clinic/inventory/controlled/${reconciliation.count_id}/certify`,
      { review: { reason: "Pharmacist-in-Charge certification" } },
      "Reconciliation certified",
      "The final controlled-substance certification was appended to the audit trail.",
    );
  return (
    <div className="inventory-two-col wide-left">
      <div className="inventory-stack">
        <RecordPicker
          label="Controlled count"
          value={reconciliation.id}
          options={data.controlled_reconciliations.map((candidate) => ({
            value: candidate.id,
            label: `${product(data, candidate.product_id)?.name ?? "Product"} · ${date(candidate.counted_at)}`,
          }))}
          onChange={setSelectedReconciliationId}
        />
        <Card>
          <div className="inventory-panel-heading">
            <div>
              <div className="inventory-title-row">
                <Badge tone="danger">Schedule II</Badge>
                <Badge tone="blue">{statusLabel(reconciliation.status)}</Badge>
              </div>
              <h2>{item.name}</h2>
              <p className="inventory-lead">
                NDC {item.ndc} · lot {selectedLot.lot_number} ·{" "}
                {selectedLocation.name}
              </p>
            </div>
            <div className="inventory-date">
              <small>Counted</small>
              <strong>{dateTime(reconciliation.counted_at)}</strong>
            </div>
          </div>
          <div className="inventory-data-grid three">
            <DataPoint
              label="Expected"
              value={`${number(reconciliation.expected_units)} tablets`}
            />
            <DataPoint
              label="Counted"
              value={`${number(reconciliation.counted_units)} tablets`}
            />
            <DataPoint
              label="Variance"
              value={signedUnits(reconciliation.variance_units)}
              tone={reconciliation.variance_units === 0 ? "success" : "danger"}
            />
          </div>
          <div className="inventory-data-grid two">
            <DataPoint
              label="Recorded by"
              value={
                data.users.find((user) => user.id === reconciliation.counter_id)
                  ?.name ?? "Clinic inventory member"
              }
            />
            <DataPoint
              label="Review"
              value={
                reconciliation.certified_at
                  ? "Certified by a separate reviewer"
                  : "Separate reviewer required"
              }
            />
          </div>
        </Card>
        {unresolved ? (
          <div className="inventory-warning strong" role="alert">
            <strong>
              Certification blocked: unresolved{" "}
              {signedUnits(reconciliation.variance_units)} variance
            </strong>
            <p>
              An Inventory Manager must investigate and post an authorized
              adjustment. Only then may a Pharmacist-in-Charge certify.
            </p>
          </div>
        ) : (
          <div className="inventory-success-box">
            <strong>Count reviewed</strong>
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
                {number(reconciliation.counted_units)} tablets counted by the
                clinic inventory member.
              </span>
            </li>
            <li className={reconciliation.investigation_note ? "done" : ""}>
              <strong>Investigation recorded</strong>
              <span>
                {reconciliation.investigation_note ??
                  "Pending an authorized investigation before certification."}
              </span>
            </li>
            <li className={reconciliation.status === "certified" ? "done" : ""}>
              <strong>Pharmacist certification</strong>
              <span>
                {reconciliation.certified_at
                  ? `Certified ${dateTime(reconciliation.certified_at)}.`
                  : "Blocked until review is recorded and a separate reviewer certifies."}
              </span>
            </li>
          </ol>
        </Card>
      </div>
      <Card title={unresolved ? "Investigate count" : "Certify count"}>
        {unresolved ? (
          <div className="inventory-stack compact">
            <Field label="Investigation findings">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Required count/research findings"
              />
            </Field>
            <PermissionNote allowed={capability(data, "inventory.adjust")} />
            <p className="inventory-info">
              Resolution posts a {signedUnits(reconciliation.variance_units)}
              adjustment so the authoritative balance matches the physical
              count.
            </p>
            <ConfirmButton
              disabled={
                busy || !capability(data, "inventory.adjust") || !note.trim()
              }
              onConfirm={investigate}
            >
              Post variance resolution
            </ConfirmButton>
          </div>
        ) : reconciliation.status === "certified" ? (
          <div className="inventory-success-box">
            <strong>Certification complete</strong>
            <p>
              This count was certified by a separate authorized reviewer
              {reconciliation.certified_at
                ? ` on ${dateTime(reconciliation.certified_at)}.`
                : "."}
            </p>
          </div>
        ) : (
          <div className="inventory-stack compact">
            <DataPoint
              label="Resolved expected"
              value={`${number(reconciliation.counted_units)} tablets`}
            />
            <PermissionNote allowed={capability(data, "controlled.certify")} />
            <ConfirmButton
              disabled={busy || !capability(data, "controlled.certify")}
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
