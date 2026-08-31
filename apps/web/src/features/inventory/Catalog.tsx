import type { Catalog as CatalogData } from "../../api/contracts";
import {
  Card,
  Field,
  Form,
  LoadState,
  Pager,
  useResource,
} from "../../shared/ui";
import { useClinic } from "../clinic/Workspace";

export function Catalog() {
  const search = new URLSearchParams(window.location.search);
  const query = new URLSearchParams({
    q: search.get("q") || "",
    filter: search.get("filter") || "all",
    page: search.get("page") || "1",
  }).toString();
  const { data, error, refresh } = useResource<CatalogData>(
    "/api/clinic/pharmacy?" + query,
  );
  const clinic = useClinic(),
    actions = clinic.inventory_actions;
  if (!data) return <LoadState error={error} />;
  return (
    <>
      <div className="pharmacy-heading">
        <div>
          <p className="eyebrow">EHR · PHARMACY OPERATIONS</p>
          <h1>Pharmacy inventory.</h1>
          <p>Manage your clinic’s products, lots and stock movements.</p>
        </div>
        {actions.catalog && (
          <a href="/clinic/pharmacy/new" className="primary-link">
            ＋ Add product
          </a>
        )}
      </div>
      <div className="pharmacy-summary">
        <div className="pharmacy-summary-item">
          <span>Active products</span>
          <strong>{data.active_count}</strong>
          <small>In your clinic catalog</small>
        </div>
        <div className="pharmacy-summary-item">
          <span>Available stock by unit</span>
          <strong>
            {data.unit_totals
              .map((t) => t.available + " " + t.unit)
              .join(" · ") || "0"}
          </strong>
          <small>Excludes expired, held and inactive stock</small>
        </div>
        <div className="pharmacy-summary-item">
          <span>Low stock</span>
          <strong>{data.low_count}</strong>
          <small>At or below reorder point</small>
        </div>
        <div className="pharmacy-summary-item">
          <span>Unavailable stock by unit</span>
          <strong>
            {data.unit_totals
              .map((t) => t.unavailable + " " + t.unit)
              .join(" · ") || "0"}
          </strong>
          <small>Review expiry and batch status</small>
        </div>
      </div>
      <Card title="Stock on hand">
        <form method="get" className="pharmacy-search">
          <Field
            name="q"
            label="Search your local catalog"
            required={false}
            value={data.query}
            maxLength={100}
          />
          <Field
            name="filter"
            label="Stock view"
            value={data.filter}
            options={[
              "all",
              ["low_stock", "Low stock"],
              ["expiring", "Expiring in 30 days"],
              ["held", "Held / expired"],
            ]}
          />
          <button className="button">Filter catalog</button>
          <a href="/clinic/pharmacy">Reset</a>
        </form>
        {data.product_count === 0 ? (
          <div className="pharmacy-empty">
            <h3>Your pharmacy catalog starts here.</h3>
            <p>Add a product, then receive a fictional lot to add stock.</p>
            {actions.catalog && (
              <a href="/clinic/pharmacy/new">Add your first product ↗</a>
            )}
            {clinic.development_demo && actions.receive && (
              <Form
                endpoint="/api/clinic/pharmacy/demo"
                submit="Load fictional pharmacy examples"
                onSuccess={refresh}
              />
            )}
          </div>
        ) : data.products.length === 0 ? (
          <p>No products match these filters.</p>
        ) : (
          <>
            <p className="pharmacy-caption">
              Showing {data.products.length} of {data.filtered_count} products ·
              explicit stock units; no dose inference
            </p>
            <div
              className="clinic-table-wrap"
              tabIndex={0}
              role="region"
              aria-label="Pharmacy products"
            >
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU / NDC</th>
                    <th>Available</th>
                    <th>Location</th>
                    <th>Next available expiry</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.products.map((p, i) => (
                    <tr key={p.id}>
                      <td>
                        <div className="pharmacy-product-cell">
                          <span
                            className={
                              "pharmacy-product-avatar tone-" + (i % 4)
                            }
                          >
                            {p.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div>
                            <a
                              className="pharmacy-product-name"
                              href={"/clinic/pharmacy/" + p.id}
                            >
                              {p.name}
                            </a>
                            <small>
                              {p.generic_name ||
                                p.package_description ||
                                "Manual product"}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <code>{p.sku}</code>
                        <small>{p.ndc || "Manual / synthetic"}</small>
                      </td>
                      <td>
                        <strong className={p.low_stock ? "stock-low" : ""}>
                          {p.available_quantity} {p.stock_unit}
                        </strong>
                        <small>
                          {p.on_hand_quantity} on hand · reorder at{" "}
                          {p.reorder_point}
                        </small>
                      </td>
                      <td>{p.locations.join(" · ") || "—"}</td>
                      <td>{p.next_expiry || "—"}</td>
                      <td>
                        <span className="pharmacy-badge">
                          {!p.active
                            ? "Inactive"
                            : p.low_stock
                              ? "Low stock"
                              : "In stock"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <Pager
          page={data.page}
          size={25}
          total={data.filtered_count}
          path={"/clinic/pharmacy?" + query}
        />
      </Card>
      <div className="clinic-grid">
        <Card title="Needs attention">
          <p>
            Up to 20 products and 20 lot/location exceptions, calculated from
            current stock and dates.
          </p>
          <ul className="stock-alerts">
            {data.low_stock.map((p) => (
              <li key={"p" + p.id}>
                <strong>
                  <a href={"/clinic/pharmacy/" + p.id}>{p.name}</a> · Low stock
                </strong>
                <span>
                  {p.available_quantity} {p.stock_unit} available · reorder
                  point {p.reorder_point}
                </span>
              </li>
            ))}
            {data.attention.map((b) => (
              <li key={"b" + b.id}>
                <strong>
                  <a href={"/clinic/pharmacy/" + b.product_id}>
                    {b.product_name}
                  </a>{" "}
                  · {b.expiring ? "Expiring within 30 days" : b.status}
                </strong>
                <span>
                  Lot {b.lot_number} · {b.location} · {b.quantity}{" "}
                  {b.stock_unit} · expiry {b.expires_on}
                </span>
              </li>
            ))}
          </ul>
          {!data.low_stock.length && !data.attention.length && (
            <p>No current stock exceptions.</p>
          )}
          <p>
            No automated recall feed or supplier orders. This is an inventory
            aid, not a clinical safety check.
          </p>
        </Card>
        <Card title="Recent movements">
          <p>Latest 30 entries · timestamps in UTC · explicit stock units</p>
          {data.movements.length === 0 && <p>No movements yet.</p>}
          {data.movements.map((m) => (
            <article className="pharmacy-movement" key={m.id}>
              <div>
                <strong>
                  <a href={"/clinic/pharmacy/" + m.product_id}>
                    {m.product_name}
                  </a>
                </strong>
                <small>
                  {m.kind} · lot {m.lot_number} · {m.location}
                </small>
                <small>{m.reason}</small>
                <small>
                  Account {m.actor_id} · {m.created_at} (UTC)
                </small>
              </div>
              <b>
                {m.quantity} {m.stock_unit}
              </b>
            </article>
          ))}
        </Card>
      </div>
      <details className="clinic-card">
        <summary>
          Inventory configuration · version{" "}
          {data.profile?.version ?? "unconfigured"} · {data.profile?.status}
        </summary>
        <p>
          Dispensing, administration, controlled-drug, compounding and other
          clinical capabilities remain unavailable. Suspending posting preserves
          history.
        </p>
        {actions.configure && (
          <Form
            endpoint="/api/clinic/inventory_configuration"
            submit="Record new configuration version"
            onSuccess={refresh}
          >
            <Field
              name="status"
              label="Inventory state"
              value={data.profile?.status}
              options={["draft", "synthetic", "suspended", "retired"]}
            />
            <Field
              name="operator_reference"
              label="Non-sensitive operator reference (optional)"
              required={false}
              maxLength={120}
            />
            <Field name="reason" label="Reason for configuration change" />
          </Form>
        )}
      </details>
    </>
  );
}
