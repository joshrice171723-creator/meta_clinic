import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { api, ApiError } from "../../api/client";
import type {
  InventoryData,
  InventorySupplierProduct,
} from "./inventoryContracts";
import { decimalMoney } from "./inventoryContracts";
import "./supplierPricing.css";

type PreviewRow = {
  line: number;
  product_id: string | null;
  matched: boolean;
  ndc: string;
  supplier_sku: string;
  description: string;
  package_quantity: string;
  wholesale_unit_cost: string;
  effective_date: string;
};
type PreviewError = { line: number; message: string };
type PricePreview = {
  total_rows: number;
  rows: PreviewRow[];
  errors: PreviewError[];
  unmatched_ndcs: string[];
};

function supplierOffersFor(
  data: InventoryData,
  productId: string,
): InventorySupplierProduct[] {
  return (data.supplier_products ?? []).filter(
    (offer) => offer.product_id === productId && offer.available !== false,
  );
}

function price(value: string, currency = "USD") {
  return `${currency} ${decimalMoney(value)}`;
}

function friendlyError(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "The supplier pricing action could not be completed.";
}

export function SupplierPricingScreen({
  data,
  onData,
}: {
  data: InventoryData;
  onData: (next: InventoryData) => void;
}) {
  const canManage = data.capabilities["inventory.catalog"] === true;
  const [supplierId, setSupplierId] = useState(data.suppliers?.[0]?.id ?? "");
  const [supplierName, setSupplierName] = useState("");
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(
    null,
  );
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<PricePreview | null>(null);
  const [selectedLines, setSelectedLines] = useState<number[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (
      supplierId &&
      data.suppliers?.some((supplier) => supplier.id === supplierId)
    )
      return;
    setSupplierId(data.suppliers?.[0]?.id ?? "");
  }, [data.suppliers, supplierId]);

  const selectedSupplier = data.suppliers?.find(
    (supplier) => supplier.id === supplierId,
  );
  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    return data.products.filter(
      (product) =>
        !query ||
        `${product.name} ${product.ndc}`.toLowerCase().includes(query),
    );
  }, [data.products, productQuery]);

  const saveSupplier = async (event: FormEvent) => {
    event.preventDefault();
    const name = supplierName.trim();
    if (!name) return;
    setBusy("supplier");
    setError("");
    setNotice("");
    try {
      const endpoint = editingSupplierId
        ? `/api/clinic/inventory/suppliers/${editingSupplierId}`
        : "/api/clinic/inventory/suppliers";
      const response = await api<{ data: InventoryData }>(endpoint, {
        method: editingSupplierId ? "PATCH" : "POST",
        body: { supplier: { name } },
      });
      onData(response.data);
      const saved = response.data.suppliers?.find(
        (supplier) => supplier.name === name,
      );
      if (saved) setSupplierId(saved.id);
      setSupplierName("");
      setEditingSupplierId(null);
      setNotice(editingSupplierId ? "Supplier updated." : "Supplier created.");
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy("");
    }
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPreview(null);
    setSelectedLines([]);
    setError("");
    setNotice("");
    if (!file) {
      setFileName("");
      setCsv("");
      return;
    }
    setFileName(file.name);
    try {
      setCsv(await file.text());
    } catch {
      setCsv("");
      setError("The selected CSV could not be read. Choose the file again.");
    }
  };

  const previewFile = async () => {
    if (!supplierId || !csv) return;
    setBusy("preview");
    setError("");
    setNotice("");
    try {
      const response = await api<{ preview: PricePreview }>(
        "/api/clinic/inventory/suppliers/preview",
        { method: "POST", body: { supplier_id: supplierId, csv } },
      );
      setPreview(response.preview);
      setSelectedLines(
        response.preview.rows
          .filter((row) => row.matched)
          .map((row) => row.line),
      );
      setNotice("Preview ready. Review the rows before importing.");
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy("");
    }
  };

  const importRows = async () => {
    if (!supplierId || !csv || !selectedLines.length) return;
    setBusy("import");
    setError("");
    setNotice("");
    try {
      const response = await api<{
        data: InventoryData;
        imported: number;
      }>("/api/clinic/inventory/suppliers/import", {
        method: "POST",
        body: { supplier_id: supplierId, csv, include_lines: selectedLines },
      });
      onData(response.data);
      setPreview(null);
      setSelectedLines([]);
      setNotice(
        `${response.imported} price ${response.imported === 1 ? "row" : "rows"} imported for ${selectedSupplier?.name ?? "this supplier"}.`,
      );
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy("");
    }
  };

  const setPreferredSupplier = async (
    productId: string,
    nextSupplierId: string,
  ) => {
    setBusy(`preferred-${productId}`);
    setError("");
    setNotice("");
    try {
      const response = await api<{ data: InventoryData }>(
        `/api/clinic/inventory/products/${productId}/preferred-supplier`,
        { method: "PATCH", body: { supplier_id: nextSupplierId || null } },
      );
      onData(response.data);
      setNotice("Preferred supplier updated.");
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="supplier-pricing-page">
      {!canManage && (
        <div className="inventory-warning" role="status">
          <strong>Supplier pricing is read-only for this account.</strong>
          <p>
            Ask a clinic inventory administrator to update suppliers or import
            pricing.
          </p>
        </div>
      )}
      {(notice || error) && (
        <div
          className={
            error
              ? "supplier-pricing-message error"
              : "supplier-pricing-message"
          }
          role={error ? "alert" : "status"}
        >
          {error || notice}
        </div>
      )}
      <div className="supplier-pricing-intro">
        <div>
          <h2>Supplier catalog</h2>
          <p className="inventory-lead">
            Keep clinic supplier offers separate from national benchmarks and
            preserve the exact quote used on each purchase order.
          </p>
        </div>
        <div
          className="supplier-pricing-summary"
          aria-label="Supplier pricing summary"
        >
          <span>
            <strong>{data.suppliers?.length ?? 0}</strong> suppliers
          </span>
          <span>
            <strong>{data.supplier_products?.length ?? 0}</strong> price offers
          </span>
          <span>
            <strong>
              {
                data.products.filter((product) => product.preferred_supplier_id)
                  .length
              }
            </strong>{" "}
            preferred links
          </span>
        </div>
      </div>
      <div className="supplier-pricing-workbench">
        <section className="inventory-card supplier-directory">
          <div className="supplier-panel-heading">
            <div>
              <h2>Suppliers</h2>
              <p className="inventory-lead">
                The vendors your clinic can order from.
              </p>
            </div>
            <span className="supplier-panel-count">
              {data.suppliers?.length ?? 0}
            </span>
          </div>
          <div className="supplier-list">
            {(data.suppliers ?? []).map((supplier) => {
              const count = (data.supplier_products ?? []).filter(
                (offer) => offer.supplier_id === supplier.id,
              ).length;
              return (
                <div
                  className={`supplier-list-row${supplier.id === supplierId ? " selected" : ""}`}
                  key={supplier.id}
                >
                  <button
                    type="button"
                    className="supplier-select"
                    onClick={() => {
                      setSupplierId(supplier.id);
                      setPreview(null);
                    }}
                  >
                    <strong>{supplier.name}</strong>
                    <small>
                      {count} imported {count === 1 ? "offer" : "offers"}
                    </small>
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      className="supplier-edit"
                      onClick={() => {
                        setEditingSupplierId(supplier.id);
                        setSupplierName(supplier.name);
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              );
            })}
            {!data.suppliers?.length && (
              <p className="supplier-empty">No suppliers are configured yet.</p>
            )}
          </div>
          {canManage && (
            <form className="supplier-create-form" onSubmit={saveSupplier}>
              <label htmlFor="supplier-name">
                {editingSupplierId ? "Edit supplier" : "Add supplier"}
              </label>
              <div className="supplier-create-controls">
                <input
                  id="supplier-name"
                  value={supplierName}
                  onChange={(event) => setSupplierName(event.target.value)}
                  placeholder="Supplier name"
                  maxLength={120}
                  required
                />
                <button
                  className="inventory-button primary"
                  type="submit"
                  disabled={busy === "supplier"}
                >
                  {busy === "supplier"
                    ? "Saving…"
                    : editingSupplierId
                      ? "Save"
                      : "Add"}
                </button>
              </div>
              {editingSupplierId && (
                <button
                  type="button"
                  className="supplier-cancel"
                  onClick={() => {
                    setEditingSupplierId(null);
                    setSupplierName("");
                  }}
                >
                  Cancel editing
                </button>
              )}
            </form>
          )}
        </section>
        <section className="inventory-card supplier-import-panel">
          <div className="supplier-panel-heading">
            <div>
              <h2>Import price sheet</h2>
              <p className="inventory-lead">
                Preview first. Nothing is saved until you import selected rows.
              </p>
            </div>
            <span className="supplier-contract-tag">Per package</span>
          </div>
          <div className="supplier-import-controls">
            <label>
              <span>Supplier</span>
              <select
                value={supplierId}
                onChange={(event) => {
                  setSupplierId(event.target.value);
                  setPreview(null);
                }}
                disabled={!canManage}
              >
                <option value="">Select a supplier</option>
                {(data.suppliers ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void chooseFile(event)}
                disabled={!canManage}
              />
            </label>
          </div>
          <div className="supplier-contract-note">
            <strong>Required columns</strong>
            <code>
              ndc, vendor_sku, description, package_qty, wholesale_cost,
              effective_date
            </code>
            <p>
              <strong>wholesale_cost</strong> means the supplier’s price for one
              ordering package in USD.
            </p>
          </div>
          <div className="supplier-import-actions">
            <span>{fileName || "No CSV selected"}</span>
            <button
              className="inventory-button outline"
              type="button"
              onClick={() => void previewFile()}
              disabled={!canManage || !supplierId || !csv || busy !== ""}
            >
              {busy === "preview" ? "Checking…" : "Preview file"}
            </button>
          </div>
          {preview && (
            <div
              className="supplier-preview"
              aria-label="Supplier price preview"
            >
              <div className="supplier-preview-summary">
                <span>
                  <strong>{preview.rows.length}</strong> valid
                </span>
                <span className={preview.errors.length ? "has-issue" : ""}>
                  <strong>{preview.errors.length}</strong> invalid
                </span>
                <span
                  className={preview.unmatched_ndcs.length ? "has-issue" : ""}
                >
                  <strong>{preview.unmatched_ndcs.length}</strong> unmatched
                  NDCs
                </span>
              </div>
              {preview.errors.length > 0 && (
                <div className="supplier-preview-issues">
                  <strong>Rows needing correction</strong>
                  <ul>
                    {preview.errors.map((item) => (
                      <li key={item.line}>
                        Line {item.line}: {item.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="supplier-preview-table-wrap">
                <table className="supplier-preview-table">
                  <caption className="sr-only">
                    Valid supplier price rows
                  </caption>
                  <thead>
                    <tr>
                      <th>Import</th>
                      <th>NDC</th>
                      <th>Supplier SKU</th>
                      <th>Package</th>
                      <th>Package cost</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr
                        key={row.line}
                        className={!row.matched ? "unmatched" : undefined}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedLines.includes(row.line)}
                            onChange={(event) =>
                              setSelectedLines((current) =>
                                event.target.checked
                                  ? [...current, row.line]
                                  : current.filter((line) => line !== row.line),
                              )
                            }
                          />
                        </td>
                        <td className="mono">{row.ndc}</td>
                        <td>{row.supplier_sku}</td>
                        <td>{row.package_quantity}</td>
                        <td>{price(row.wholesale_unit_cost)}</td>
                        <td>
                          {row.matched ? (
                            <span className="supplier-match">
                              Catalog match
                            </span>
                          ) : (
                            <span className="supplier-unmatched">
                              Unmatched
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="supplier-import-footer">
                <span>{selectedLines.length} selected for import</span>
                <button
                  className="inventory-button primary"
                  type="button"
                  onClick={() => void importRows()}
                  disabled={!canManage || !selectedLines.length || busy !== ""}
                >
                  {busy === "import" ? "Importing…" : "Import selected rows"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      <section className="inventory-card supplier-defaults-panel">
        <div className="supplier-panel-heading supplier-defaults-heading">
          <div>
            <h2>Preferred supplier by catalog item</h2>
            <p className="inventory-lead">
              Only offers with a valid imported price can be selected. New POs
              use this as their default.
            </p>
          </div>
          <label className="supplier-search">
            <span className="sr-only">Search catalog</span>
            <input
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Search product or NDC"
            />
          </label>
        </div>
        <div className="supplier-defaults-table-wrap">
          <table className="supplier-defaults-table">
            <caption className="sr-only">
              Preferred supplier settings for inventory catalog
            </caption>
            <thead>
              <tr>
                <th>Catalog item</th>
                <th>NDC</th>
                <th>Preferred supplier</th>
                <th>Package cost</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const offers = supplierOffersFor(data, product.id);
                const preferred = offers.find(
                  (offer) =>
                    offer.supplier_id === product.preferred_supplier_id,
                );
                const optionSuppliers = (data.suppliers ?? []).filter(
                  (supplier) =>
                    offers.some((offer) => offer.supplier_id === supplier.id),
                );
                return (
                  <tr key={product.id}>
                    <td>
                      <strong>{product.name}</strong>
                      <small>
                        {product.units_per_package} {product.base_unit} per
                        package
                      </small>
                    </td>
                    <td className="mono">{product.ndc || "Not recorded"}</td>
                    <td>
                      <select
                        value={product.preferred_supplier_id ?? ""}
                        onChange={(event) =>
                          void setPreferredSupplier(
                            product.id,
                            event.target.value,
                          )
                        }
                        disabled={
                          !canManage ||
                          busy === `preferred-${product.id}` ||
                          !optionSuppliers.length
                        }
                      >
                        <option value="">No preferred supplier</option>
                        {optionSuppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {preferred
                        ? price(
                            preferred.wholesale_unit_cost,
                            preferred.currency,
                          )
                        : "Not set"}
                    </td>
                    <td>
                      {preferred ? (
                        <span className="supplier-match">Imported offer</span>
                      ) : (
                        <span className="supplier-unmatched">
                          Needs pricing
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filteredProducts.length && (
            <p className="supplier-empty">
              No catalog items match this search.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
