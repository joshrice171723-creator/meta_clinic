import type {
  ProductDetails,
  Batch,
  Product as ProductData,
} from "../../api/contracts";
import {
  Card,
  Field,
  Form,
  LoadState,
  Pager,
  useResource,
} from "../../shared/ui";
import { useClinicOverview } from "../clinic/Workspace";

function Lot({
  batch: b,
  product: p,
  refresh,
}: {
  batch: Batch;
  product: ProductData;
  refresh: () => void;
}) {
  const actions = useClinicOverview().inventory_actions;
  return (
    <article className="clinic-card" id={"lot-" + b.id}>
      <div className="pharmacy-section-heading">
        <h2>
          Lot {b.lot_number} · {b.location}
        </h2>
        <span
          className={
            "pharmacy-badge " + (b.available ? "" : "pharmacy-warning")
          }
        >
          {b.status}
        </span>
      </div>
      <p>
        <strong>
          {b.quantity} {p.stock_unit} on hand
        </strong>{" "}
        · Expires {b.expires_on}
      </p>
      {actions.adjust && (
        <details className="pharmacy-details">
          <summary>Record a stock movement</summary>
          <Form
            endpoint={"/api/clinic/pharmacy_batches/" + b.id + "/movement"}
            submit="Record movement"
            onSuccess={refresh}
            retryKey
          >
            <Field
              name="kind"
              label="Movement"
              options={[
                "adjustment_in",
                "adjustment_out",
                "damaged",
                "expired",
                "return_to_supplier",
              ]}
            />
            <Field
              name="amount"
              label={"Base stock units (" + p.stock_unit + ")"}
              type="number"
              min={0.000001}
              max={1000000}
              step={0.000001}
            />
            <Field name="reason" label="Reason" />
          </Form>
        </details>
      )}
      {(actions.hold || actions.release) && (
        <details className="pharmacy-details">
          <summary>Quarantine, recall or release this lot</summary>
          <p>
            Holds can overlap. Release only the reviewed hold; all others
            continue to block availability. This is not regulatory or clinical
            clearance.
          </p>
          <Form
            endpoint={"/api/clinic/pharmacy_batches/" + b.id + "/status"}
            submit="Record status review"
            onSuccess={refresh}
            retryKey
          >
            <Field
              name="status"
              label="Reviewed state"
              options={[
                ...(actions.hold
                  ? ["quarantined", "recalled", "temperature", "damaged"]
                  : []),
                ...(actions.release
                  ? [["active", "Release selected hold"] as [string, string]]
                  : []),
              ]}
            />
            <Field
              name="hold_id"
              label="Specific hold to release"
              required={false}
              options={[
                ["", "Select when releasing"],
                ...b.holds.map(
                  (h) =>
                    [String(h.id), h.kind + ": " + h.reason] as [
                      string,
                      string,
                    ],
                ),
              ]}
            />
            <Field name="reason" label="Review reason" />
          </Form>
        </details>
      )}
      <details className="pharmacy-details">
        <summary>Count and reconcile</summary>
        {actions.count && (
          <Form
            endpoint={"/api/clinic/pharmacy_batches/" + b.id + "/count"}
            submit="Record count observation"
            onSuccess={refresh}
            retryKey
          >
            <Field
              name="observed_quantity"
              label={"Observed " + p.stock_unit}
              type="number"
              min={0}
              max={1000000}
              step={0.000001}
            />
            <Field name="reason" label="Count reason" />
          </Form>
        )}
        {b.counts.map((c) => (
          <div key={c.id}>
            <p>
              Expected {c.expected_quantity}; observed {c.observed_quantity} ·{" "}
              {c.reason}
            </p>
            {c.approved_by ? (
              <p>Reconciled by account {c.approved_by}.</p>
            ) : (
              actions.adjust && (
                <Form
                  endpoint={"/api/clinic/inventory_counts/" + c.id + "/approve"}
                  submit="Approve count reconciliation"
                  onSuccess={refresh}
                />
              )
            )}
          </div>
        ))}
      </details>
      <details className="pharmacy-details">
        <summary>Receipt evidence (latest 20)</summary>
        {b.receipts.map((r) => (
          <p key={r.id}>
            {r.received_at} (UTC) · {r.input_quantity} {r.input_unit} ×{" "}
            {r.conversion_factor} = {r.quantity} {r.stock_unit} · Supplier:{" "}
            {r.supplier || "Unknown"} · Cost:{" "}
            {r.unit_cost === null
              ? "Unknown"
              : r.unit_cost + " " + r.currency + " per " + r.input_unit}{" "}
            · {r.invoice_reference}
          </p>
        ))}
      </details>
      <details className="pharmacy-details">
        <summary>
          Append-only history (latest 30 movements and 30 reviews)
        </summary>
        <div className="clinic-table-wrap">
          <table>
            <thead>
              <tr>
                <th>UTC</th>
                <th>Event</th>
                <th>{p.stock_unit}</th>
                <th>Reason</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              {b.histories.map((h) => (
                <tr key={h.kind + h.id}>
                  <td>{h.created_at}</td>
                  <td>{h.kind}</td>
                  <td>{h.quantity ?? "Unchanged"}</td>
                  <td>{h.reason}</td>
                  <td>{h.actor_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </article>
  );
}
export function Product({ id }: { id: string }) {
  const page = new URLSearchParams(window.location.search).get("page") || "1";
  const { data, error, refresh } = useResource<ProductDetails>(
    "/api/clinic/pharmacy/" + id + "?page=" + encodeURIComponent(page),
  );
  const actions = useClinicOverview().inventory_actions;
  if (!data) return <LoadState error={error} />;
  const p = data.product;
  return (
    <>
      <a href="/clinic/pharmacy">← Pharmacy inventory</a>
      <div className="pharmacy-heading">
        <div>
          <p className="eyebrow">PACKAGE CATALOG · {p.sku}</p>
          <h1>{p.name}</h1>
          <p>
            {[p.generic_name, p.dosage_form, p.route]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="pharmacy-badge">
          {p.active ? "Active catalog product" : "Inactive product"}
        </span>
      </div>
      <Card title="Package reference">
        <p>{p.package_description || "No package description supplied."}</p>
        <p>{p.ingredients}</p>
        {p.source === "openfda" ? (
          <>
            <p>
              NDC {p.ndc} · Product NDC {p.product_ndc} · Labeler: {p.labeler} ·
              Imported {p.imported_at} (UTC)
            </p>
            <p>
              Public FDA listing reference; not verification or approval.
              Confirm the physical package before receiving.
            </p>
          </>
        ) : (
          <p>Manual reference. No FDA lookup or NDC verification is implied.</p>
        )}
        {actions.catalog && (
          <details className="pharmacy-details">
            <summary>Edit reorder point &amp; catalog state</summary>
            <Form
              endpoint={"/api/clinic/pharmacy/" + id}
              method="PATCH"
              submit="Save settings"
              onSuccess={refresh}
            >
              <Field
                name="clinic_pharmacy_product[reorder_point]"
                label="Reorder point (base stock units)"
                value={p.reorder_point}
                type="number"
                min={0}
                max={1000000}
                step={1}
              />
              <Field
                name="clinic_pharmacy_product[active]"
                label="Catalog state"
                value={String(p.active)}
                options={[
                  ["true", "Active"],
                  ["false", "Inactive — retain history"],
                ]}
              />
            </Form>
          </details>
        )}
      </Card>
      <div className="pharmacy-summary">
        <div className="pharmacy-summary-item">
          <span>Available</span>
          <strong>{p.available_quantity}</strong>
          <small>{p.stock_unit}</small>
        </div>
        <div className="pharmacy-summary-item">
          <span>On hand</span>
          <strong>{p.on_hand_quantity}</strong>
          <small>Includes held and expired stock</small>
        </div>
        <div className="pharmacy-summary-item">
          <span>Lots / locations</span>
          <strong>{data.batch_count}</strong>
          <small>Each receipt is traceable</small>
        </div>
      </div>
      {actions.receive && p.active && (
        <Card title="Receive a lot">
          <p>
            Each delivery retains its supplier and optional cost, even when a
            manufacturing lot repeats. Cost is per entered unit. Blank
            cost/currency means unknown.
          </p>
          <Form
            endpoint={"/api/clinic/pharmacy/" + id + "/receive"}
            submit="Record receipt"
            onSuccess={refresh}
            retryKey
          >
            <Field
              name="batch[lot_number]"
              label="Lot number"
              maxLength={100}
            />
            <Field name="batch[expires_on]" label="Expiry date" type="date" />
            <Field
              name="batch[location]"
              label="Storage location"
              maxLength={100}
            />
            <Field
              name="batch[supplier]"
              label="Supplier (optional)"
              required={false}
              maxLength={120}
            />
            <Field
              name="amount"
              label="Quantity received"
              type="number"
              min={0.000001}
              max={1000000}
              step={0.000001}
            />
            <Field
              name="input_unit"
              label="Receipt unit"
              options={Array.from(new Set(["package", p.stock_unit]))}
            />
            <Field
              name="unit_cost"
              label="Cost per entered unit (optional)"
              type="number"
              min={0}
              step={0.000001}
              required={false}
            />
            <Field
              name="currency"
              label="Currency with cost (e.g. USD)"
              maxLength={3}
              required={false}
            />
            <Field
              name="invoice_reference"
              label="Invoice reference (optional)"
              maxLength={160}
              required={false}
            />
            <Field
              name="reason"
              label="Receipt reason / non-patient reference"
            />
          </Form>
        </Card>
      )}
      <h2>Lots, expiry &amp; history</h2>
      <p>
        Expired, quarantined, recalled and inactive stock is excluded from
        availability. Expiry uses the clinic timezone ({data.timezone}) and is
        flagged after the recorded date. Histories show UTC.
      </p>
      {data.batch_count === 0 && <p>No lots received yet.</p>}
      {data.batches.map((b) => (
        <Lot key={b.id} batch={b} product={p} refresh={refresh} />
      ))}
      <Pager
        page={data.batch_page}
        total={data.batch_count}
        size={10}
        path={"/clinic/pharmacy/" + id}
      />
    </>
  );
}
