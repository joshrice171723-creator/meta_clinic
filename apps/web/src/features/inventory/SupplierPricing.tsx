import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from "@mui/material";
import type {
  InventorySupplierData,
  InventorySupplierProduct,
  InventorySupplierQuoteRequest,
  InventorySupplierRead,
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
  currency: string;
  ordering_unit: string;
  contract_status: string;
  available: boolean | null;
  lead_time_days: number | null;
  eligible: boolean;
  eligibility_reason: string | null;
};
type PreviewError = { line: number; message: string };
type PricePreview = {
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  page: number;
  page_count: number;
  rows: PreviewRow[];
  errors: PreviewError[];
  unmatched_ndcs: string[];
};
type CatalogOfferProduct = {
  id: string;
  name: string;
  ndc: string;
  package_quantity: string;
  stock_unit: string;
};

function price(value: string, currency = "USD") {
  if (currency === "UNK")
    return `${decimalMoney(value)} (currency unconfirmed)`;
  return `${currency} ${decimalMoney(value)}`;
}

function friendlyError(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "The supplier pricing action could not be completed.";
}

export function SupplierPricingScreen({
  data,
  loading,
  error: readError,
  readBlocked,
  onRead,
}: {
  data: InventorySupplierData;
  loading: boolean;
  error: string;
  readBlocked: boolean;
  onRead: (read: InventorySupplierRead) => Promise<void>;
}) {
  const canAccess = data.capabilities.supplier_pricing === true;
  const canManage =
    canAccess && data.capabilities["inventory.catalog"] === true;
  const page = data.supplier_page;
  const [supplierId, setSupplierId] = useState(page.supplier_id ?? "");
  const [supplierName, setSupplierName] = useState("");
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(
    null,
  );
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<PricePreview | null>(null);
  const [selectedLines, setSelectedLines] = useState<number[]>([]);
  const [productQuery, setProductQuery] = useState(page.query);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [quoteOffer, setQuoteOffer] = useState<InventorySupplierProduct | null>(
    null,
  );
  const [quoteReference, setQuoteReference] = useState("");
  const [quotedOn, setQuotedOn] = useState("");
  const [quotePrice, setQuotePrice] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("");
  const [quoteForRequest, setQuoteForRequest] =
    useState<InventorySupplierQuoteRequest | null>(null);
  const [requestOffer, setRequestOffer] =
    useState<InventorySupplierProduct | null>(null);
  const [requestPackages, setRequestPackages] = useState("1");
  const [requestNote, setRequestNote] = useState("");
  const [requestKey, setRequestKey] = useState("");
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [manualOfferOpen, setManualOfferOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<CatalogOfferProduct[]>(
    [],
  );
  const [catalogProduct, setCatalogProduct] =
    useState<CatalogOfferProduct | null>(null);
  const [manualOfferError, setManualOfferError] = useState("");
  const [offerSku, setOfferSku] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [offerPackageQuantity, setOfferPackageQuantity] = useState("");
  const [offerQuoteReference, setOfferQuoteReference] = useState("");
  const [offerQuotedOn, setOfferQuotedOn] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerCurrency, setOfferCurrency] = useState("");
  const [offerContractStatus, setOfferContractStatus] = useState("unknown");
  const [offerAvailability, setOfferAvailability] = useState("unknown");
  const [offerLeadTime, setOfferLeadTime] = useState("");
  const writeBlocked = loading || Boolean(readError) || readBlocked;

  useEffect(() => {
    setSupplierId(page.supplier_id ?? "");
  }, [page.supplier_id]);

  useEffect(() => setProductQuery(page.query), [page.query]);

  const selectedSupplier = data.suppliers.find(
    (supplier) => supplier.id === supplierId,
  );
  const recordedRequest = data.quote_requests.find(
    (request) => request.request_key === requestKey,
  );
  const applied: InventorySupplierRead = {
    q: page.query,
    supplier_id: page.supplier_id ?? undefined,
    page: page.page,
  };
  const refresh = (read: InventorySupplierRead = applied) => onRead(read);

  const requireAck = (payload: { acknowledged?: boolean }) => {
    if (payload.acknowledged !== true)
      throw new Error("The supplier pricing response could not be confirmed.");
  };

  const saveQuote = async (event: FormEvent) => {
    event.preventDefault();
    if (!quoteOffer || writeBlocked || busy) return;
    setBusy("quote");
    setError("");
    setNotice("");
    try {
      const response = await api<{ acknowledged?: boolean }>(
        `/api/clinic/inventory/supplier-products/${quoteOffer.id}/manual-quote?response=ack`,
        {
          method: "PATCH",
          body: {
            quote: {
              reference: quoteReference,
              quoted_on: quotedOn,
              wholesale_unit_cost: quotePrice,
              currency: quoteCurrency,
              expected_updated_at: quoteOffer.updated_at,
              ...(quoteForRequest
                ? { quote_request_id: quoteForRequest.id }
                : {}),
            },
          },
        },
      );
      requireAck(response);
      await refresh();
      setQuoteOffer(null);
      setQuoteForRequest(null);
      setNotice(
        "Dated supplier quote saved. Review availability and contract status before ordering.",
      );
    } catch (reason) {
      await refresh();
      setQuoteOffer(null);
      setQuoteForRequest(null);
      setError(
        `${friendlyError(reason)} Review the refreshed offer before retrying.`,
      );
    } finally {
      setBusy("");
    }
  };

  const saveQuoteRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!requestOffer || writeBlocked || busy) return;
    if (recordedRequest) return;
    setRequestSubmitted(true);
    setBusy("quote-request");
    setError("");
    setNotice("");
    try {
      const response = await api<{ acknowledged?: boolean }>(
        "/api/clinic/inventory/supplier-quote-requests?response=ack",
        {
          method: "POST",
          body: {
            quote_request: {
              supplier_product_id: requestOffer.id,
              requested_packages: requestPackages,
              note: requestNote.trim(),
              request_key: requestKey,
            },
          },
        },
      );
      requireAck(response);
      setRequestOffer(null);
      setRequestKey("");
      setRequestSubmitted(false);
      await refresh();
      setNotice(
        "Quote request recorded locally. No message was sent to the supplier.",
      );
    } catch (reason) {
      await refresh().catch(() => undefined);
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        ![408, 409].includes(reason.status)
      )
        setRequestSubmitted(false);
      setError(
        `${friendlyError(reason)} Check the request list before retrying the retained action.`,
      );
    } finally {
      setBusy("");
    }
  };

  const searchCatalogProducts = async () => {
    if (writeBlocked || busy) return;
    setBusy("catalog-products");
    setManualOfferError("");
    try {
      const query = new URLSearchParams({ q: catalogQuery.trim() });
      const response = await api<{ products: CatalogOfferProduct[] }>(
        `/api/clinic/inventory/supplier-catalog-products?${query}`,
      );
      setCatalogProducts(response.products);
      setCatalogProduct(null);
      setOfferDescription("");
      setOfferPackageQuantity("");
    } catch (reason) {
      setManualOfferError(friendlyError(reason));
    } finally {
      setBusy("");
    }
  };

  const openManualOffer = () => {
    setCatalogQuery("");
    setCatalogProducts([]);
    setCatalogProduct(null);
    setManualOfferError("");
    setOfferSku("");
    setOfferDescription("");
    setOfferPackageQuantity("");
    setOfferQuoteReference("");
    setOfferQuotedOn("");
    setOfferPrice("");
    setOfferCurrency("");
    setOfferContractStatus("unknown");
    setOfferAvailability("unknown");
    setOfferLeadTime("");
    setManualOfferOpen(true);
  };

  const saveManualOffer = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSupplier || !catalogProduct || writeBlocked || busy) return;
    setBusy("manual-offer");
    setManualOfferError("");
    setNotice("");
    try {
      const response = await api<{ acknowledged?: boolean; id?: string }>(
        "/api/clinic/inventory/supplier-products/manual-quote?response=ack",
        {
          method: "POST",
          body: {
            offer: {
              supplier_id: selectedSupplier.id,
              product_id: catalogProduct.id,
              supplier_sku: offerSku,
              description: offerDescription,
              package_quantity: offerPackageQuantity,
              quote_reference: offerQuoteReference,
              quoted_on: offerQuotedOn,
              wholesale_unit_cost: offerPrice,
              currency: offerCurrency,
              contract_status: offerContractStatus,
              available: offerAvailability,
              lead_time_days: offerLeadTime,
            },
          },
        },
      );
      requireAck(response);
      if (!response.id)
        throw new Error(
          "The saved offer could not be identified. Reload supplier pricing before retrying.",
        );
      await refresh();
      setManualOfferOpen(false);
      setNotice(
        "Dated quote saved on the supplier offer. Review its eligibility before ordering.",
      );
    } catch (reason) {
      await refresh();
      setManualOfferError(
        `${friendlyError(reason)} Close this form and check the refreshed offer list before retrying.`,
      );
    } finally {
      setBusy("");
    }
  };

  const saveSupplier = async (event: FormEvent) => {
    event.preventDefault();
    const name = supplierName.trim();
    if (!name || writeBlocked || busy) return;
    setBusy("supplier");
    setError("");
    setNotice("");
    try {
      const endpoint = editingSupplierId
        ? `/api/clinic/inventory/suppliers/${editingSupplierId}`
        : "/api/clinic/inventory/suppliers";
      const response = await api<{
        acknowledged?: boolean;
        id?: string | number;
      }>(`${endpoint}?response=ack`, {
        method: editingSupplierId ? "PATCH" : "POST",
        body: { supplier: { name } },
      });
      requireAck(response);
      const nextSupplierId =
        response.id == null ? supplierId : String(response.id);
      if (response.id != null) setSupplierId(String(response.id));
      await refresh({
        ...applied,
        supplier_id: nextSupplierId || undefined,
        page: 1,
      });
      setSupplierName("");
      setEditingSupplierId(null);
      setNotice(editingSupplierId ? "Supplier updated." : "Supplier created.");
    } catch (reason) {
      await refresh();
      setError(
        `${friendlyError(reason)} A supplier-list refresh was requested; reload if its current state is still unclear.`,
      );
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

  const previewFile = async (pageNumber = 1) => {
    if (!supplierId || !csv || writeBlocked || busy) return;
    setBusy("preview");
    setError("");
    setNotice("");
    try {
      const response = await api<{ preview: PricePreview }>(
        "/api/clinic/inventory/suppliers/preview",
        {
          method: "POST",
          body: { supplier_id: supplierId, csv, page: pageNumber },
        },
      );
      setPreview(response.preview);
      const eligibleLines = response.preview.rows
        .filter((row) => row.matched && row.eligible)
        .map((row) => row.line);
      setSelectedLines((current) => [
        ...new Set([...current, ...eligibleLines]),
      ]);
      setNotice("Preview page ready. Review each page before importing.");
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy("");
    }
  };

  const importRows = async () => {
    if (!supplierId || !csv || !selectedLines.length || writeBlocked || busy)
      return;
    setBusy("import");
    setError("");
    setNotice("");
    try {
      const response = await api<{
        acknowledged?: boolean;
        imported: number;
      }>("/api/clinic/inventory/suppliers/import?response=ack", {
        method: "POST",
        body: { supplier_id: supplierId, csv, include_lines: selectedLines },
      });
      requireAck(response);
      await refresh();
      setPreview(null);
      setSelectedLines([]);
      setNotice(
        `${response.imported} price ${response.imported === 1 ? "row" : "rows"} imported for ${selectedSupplier?.name ?? "this supplier"}.`,
      );
    } catch (reason) {
      await refresh();
      setError(
        `${friendlyError(reason)} An offer refresh was requested; reload if the current supplier terms are still unclear.`,
      );
    } finally {
      setBusy("");
    }
  };

  const setPreferredSupplier = async (
    productId: string,
    nextSupplierId: string,
  ) => {
    if (writeBlocked || busy) return;
    setBusy(`preferred-${productId}`);
    setError("");
    setNotice("");
    try {
      const response = await api<{ acknowledged?: boolean }>(
        `/api/clinic/inventory/products/${productId}/preferred-supplier?response=ack`,
        { method: "PATCH", body: { supplier_id: nextSupplierId || null } },
      );
      requireAck(response);
      await refresh();
      setNotice("Preferred supplier updated.");
    } catch (reason) {
      await refresh();
      setError(
        `${friendlyError(reason)} A preference refresh was requested; reload if the current selection is still unclear.`,
      );
    } finally {
      setBusy("");
    }
  };

  if (!canAccess) {
    return (
      <div className="inventory-warning strong" role="alert">
        <strong>Supplier pricing is restricted.</strong>
        <p>
          Only Admin, Omni Admin, and Inventory Coordinator roles can manage
          suppliers and pricing.
        </p>
      </div>
    );
  }

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
      {(notice || error || readError) && (
        <div
          className={
            error || readError
              ? "supplier-pricing-message error"
              : "supplier-pricing-message"
          }
          role={error || readError ? "alert" : "status"}
        >
          {error || readError || notice}
        </div>
      )}
      <div className="supplier-pricing-intro">
        <h2>Supplier catalog</h2>
        <div
          className="supplier-pricing-summary"
          aria-label="Supplier pricing summary"
        >
          <span>
            <strong>{data.suppliers.length}</strong> suppliers
          </span>
          <span>
            <strong>{page.total_count}</strong> price offers
          </span>
          <span>
            <strong>
              {
                data.products.filter((product) => product.preferred_supplier_id)
                  .length
              }
            </strong>{" "}
            preferred links on this page
          </span>
        </div>
      </div>
      {canManage && selectedSupplier && (
        <Button
          variant="contained"
          type="button"
          disabled={writeBlocked || Boolean(busy)}
          onClick={openManualOffer}
        >
          Record a quote for a catalog item
        </Button>
      )}
      <section className="inventory-card" aria-label="Local quote requests">
        <h2>Quote requests</h2>
        <p>These are staff records. No request is sent to a supplier.</p>
        {data.quote_requests.length === 0 ? (
          <p>No quote requests recorded for this view.</p>
        ) : (
          <Stack spacing={1}>
            {data.quote_requests.map((request) => {
              const offer = data.supplier_products.find(
                (item) => item.id === request.supplier_product_id,
              );
              return (
                <div key={request.id}>
                  <strong>
                    {request.supplier_name ??
                      offer?.supplier_name ??
                      "Supplier"}{" "}
                    ·{" "}
                    {request.product_name ??
                      offer?.description ??
                      `Offer ${request.supplier_product_id}`}
                  </strong>
                  <p>
                    {request.requested_packages} packages ·{" "}
                    {request.package_quantity_at_request
                      ? `Recorded package size: ${request.package_quantity_at_request} ${request.stock_unit_at_request ?? "units"} per package`
                      : "Package size not recorded"}{" "}
                    ·{" "}
                    {request.status === "open"
                      ? "Awaiting a recorded response"
                      : `Quote ${request.quote_reference ?? "recorded"}`}
                    {request.quoted_on ? ` · ${request.quoted_on}` : ""}
                  </p>
                  <p>{request.note}</p>
                  {request.status === "open" && offer && canManage && (
                    <Button
                      variant="outlined"
                      size="small"
                      disabled={writeBlocked || Boolean(busy)}
                      onClick={() => {
                        setQuoteForRequest(request);
                        setQuoteOffer(offer);
                        setQuoteReference("");
                        setQuotedOn("");
                        setQuotePrice(offer.wholesale_unit_cost);
                        setQuoteCurrency(
                          offer.currency === "UNK" ? "" : offer.currency,
                        );
                      }}
                    >
                      Record response
                    </Button>
                  )}
                  {request.status === "open" && !offer && (
                    <p>
                      Find this offer in the catalog to record its response.
                    </p>
                  )}
                </div>
              );
            })}
          </Stack>
        )}
        {data.quote_requests_capped && <p>Showing the latest 25 requests.</p>}
      </section>
      <div className="supplier-pricing-workbench">
        <section className="inventory-card supplier-directory">
          <div className="supplier-panel-heading">
            <div>
              <h2>Suppliers</h2>
            </div>
            <span className="supplier-panel-count">
              {data.suppliers.length}
            </span>
          </div>
          <div className="supplier-list">
            <div
              className={`supplier-list-row${page.supplier_id ? "" : " selected"}`}
            >
              <button
                type="button"
                className="supplier-select"
                disabled={loading}
                onClick={() => {
                  setSupplierId("");
                  setPreview(null);
                  void onRead({ ...applied, supplier_id: undefined, page: 1 });
                }}
              >
                <strong>All suppliers</strong>
                <small>
                  {page.supplier_id
                    ? "View every imported offer"
                    : "Showing every supplier"}
                </small>
              </button>
            </div>
            {data.suppliers.map((supplier) => {
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
                      void onRead({
                        ...applied,
                        supplier_id: supplier.id,
                        page: 1,
                      });
                    }}
                  >
                    <strong>{supplier.name}</strong>
                    <small>
                      {supplier.id === page.supplier_id
                        ? "Showing this supplier"
                        : "View imported offers"}
                    </small>
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      className="supplier-edit"
                      disabled={writeBlocked || busy !== ""}
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
                  disabled={writeBlocked || busy !== ""}
                  required
                />
                <button
                  className="inventory-button primary"
                  type="submit"
                  disabled={writeBlocked || busy !== ""}
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
                  void onRead({
                    ...applied,
                    supplier_id: event.target.value || undefined,
                    page: 1,
                  });
                }}
                disabled={!canManage || loading}
              >
                <option value="">Select a supplier</option>
                {data.suppliers.map((supplier) => (
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
                disabled={!canManage || writeBlocked}
              />
            </label>
          </div>
          <div className="supplier-import-actions">
            <span>{fileName || "No CSV selected"}</span>
            <button
              className="inventory-button outline"
              type="button"
              onClick={() => void previewFile()}
              disabled={
                !canManage || writeBlocked || !supplierId || !csv || busy !== ""
              }
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
                  <strong>{preview.valid_count}</strong> valid
                </span>
                <span className={preview.invalid_count ? "has-issue" : ""}>
                  <strong>{preview.invalid_count}</strong> invalid
                </span>
                <span
                  className={preview.unmatched_ndcs.length ? "has-issue" : ""}
                >
                  <strong>{preview.unmatched_ndcs.length}</strong> unmatched
                  NDCs
                </span>
              </div>
              <p className="inventory-results-count" role="status">
                Showing data rows {(preview.page - 1) * 200 + 1}–
                {Math.min(preview.page * 200, preview.total_rows)} of{" "}
                {preview.total_rows}. Invalid-row details below apply to this
                page.
              </p>
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
                      <th>Terms</th>
                      <th>Eligibility</th>
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
                            aria-label={`Import CSV line ${row.line}`}
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
                        <td>{price(row.wholesale_unit_cost, row.currency)}</td>
                        <td>
                          {row.ordering_unit} · {row.contract_status}
                          {row.lead_time_days == null
                            ? ""
                            : ` · ${row.lead_time_days} day lead`}
                        </td>
                        <td>
                          {row.matched && row.eligible ? (
                            <span className="supplier-match">
                              Eligible catalog match
                            </span>
                          ) : (
                            <span className="supplier-unmatched">
                              {row.eligibility_reason ??
                                (row.matched
                                  ? "Not eligible"
                                  : "Unmatched NDC")}
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
                  disabled={
                    !canManage ||
                    writeBlocked ||
                    !selectedLines.length ||
                    busy !== ""
                  }
                >
                  {busy === "import" ? "Importing…" : "Import selected rows"}
                </button>
              </div>
              {preview.page_count > 1 && (
                <nav
                  className="inventory-pagination"
                  aria-label="Supplier preview pagination"
                >
                  <Button
                    variant="outlined"
                    type="button"
                    disabled={busy !== "" || preview.page === 1}
                    onClick={() => void previewFile(preview.page - 1)}
                  >
                    Previous rows
                  </Button>
                  <span aria-live="polite">
                    Page {preview.page} of {preview.page_count}
                  </span>
                  <Button
                    variant="outlined"
                    type="button"
                    disabled={
                      busy !== "" || preview.page === preview.page_count
                    }
                    onClick={() => void previewFile(preview.page + 1)}
                  >
                    Next rows
                  </Button>
                </nav>
              )}
            </div>
          )}
        </section>
      </div>
      <section className="inventory-card supplier-defaults-panel">
        <div className="supplier-panel-heading supplier-defaults-heading">
          <div>
            <h2>Imported offers and preferred suppliers</h2>
          </div>
          <form
            className="supplier-search"
            onSubmit={(event) => {
              event.preventDefault();
              if (!loading)
                void onRead({
                  ...applied,
                  q: productQuery.trim(),
                  page: 1,
                });
            }}
          >
            <label htmlFor="supplier-offer-search" className="sr-only">
              Search supplier offers
            </label>
            <input
              id="supplier-offer-search"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Product, NDC, supplier, or SKU"
              maxLength={100}
            />
            <Button variant="outlined" type="submit" disabled={loading}>
              Search offers
            </Button>
          </form>
        </div>
        <p className="inventory-results-count" role="status">
          {loading
            ? "Loading supplier offers…"
            : `Showing ${page.filtered_count === 0 ? 0 : (page.page - 1) * page.page_size + 1}–${Math.min(page.page * page.page_size, page.filtered_count)} of ${page.filtered_count} matching offers (${page.total_count} total).`}
        </p>
        <div className="supplier-defaults-table-wrap">
          <table className="supplier-defaults-table">
            <caption className="sr-only">
              Imported supplier offers and preferred supplier settings
            </caption>
            <thead>
              <tr>
                <th>Catalog item</th>
                <th>Supplier offer</th>
                <th>Terms</th>
                <th>Eligibility</th>
                <th>Preference</th>
              </tr>
            </thead>
            <tbody>
              {data.supplier_products.map((offer) => {
                const product = data.products.find(
                  (candidate) => candidate.id === offer.product_id,
                );
                const preferred =
                  product?.preferred_supplier_id === offer.supplier_id;
                return (
                  <tr key={offer.id}>
                    <td>
                      <strong>{product?.name ?? offer.description}</strong>
                      <small className="mono">
                        {product?.ndc || offer.ndc || "NDC not recorded"}
                      </small>
                    </td>
                    <td>
                      <strong>{offer.supplier_name}</strong>
                      <small className="mono">{offer.supplier_sku}</small>
                    </td>
                    <td>
                      {price(offer.wholesale_unit_cost, offer.currency)} per{" "}
                      {offer.ordering_unit}
                      <small>
                        {offer.package_quantity} units ·{" "}
                        {offer.lead_time_days == null
                          ? "Lead time not recorded"
                          : `${offer.lead_time_days} day lead`}
                      </small>
                      {offer.price_source === "manual_quote" && (
                        <small>
                          Quote {offer.quote_reference} · {offer.quoted_on}
                        </small>
                      )}
                    </td>
                    <td>
                      {offer.eligible ? (
                        <span className="supplier-match">Eligible</span>
                      ) : (
                        <span className="supplier-unmatched">
                          {offer.eligibility_reason ?? "Not eligible"}
                        </span>
                      )}
                    </td>
                    <td>
                      <Button
                        variant="outlined"
                        size="small"
                        type="button"
                        disabled={
                          !canManage ||
                          !offer.product_id ||
                          writeBlocked ||
                          Boolean(busy)
                        }
                        onClick={() => {
                          setQuoteForRequest(null);
                          setQuoteOffer(offer);
                          setQuoteReference(offer.quote_reference || "");
                          setQuotedOn(offer.quoted_on || "");
                          setQuotePrice(offer.wholesale_unit_cost);
                          setQuoteCurrency(
                            offer.currency === "UNK" ? "" : offer.currency,
                          );
                        }}
                      >
                        Record quote
                      </Button>
                      {canManage && offer.product_id && (
                        <Button
                          variant="outlined"
                          size="small"
                          type="button"
                          disabled={writeBlocked || Boolean(busy)}
                          onClick={() => {
                            setError("");
                            setRequestOffer(offer);
                            setRequestPackages("1");
                            setRequestNote("");
                            setRequestKey(crypto.randomUUID());
                            setRequestSubmitted(false);
                          }}
                        >
                          Request quote
                        </Button>
                      )}
                      {product && (
                        <Button
                          variant="outlined"
                          size="small"
                          type="button"
                          disabled={
                            !canManage ||
                            writeBlocked ||
                            (!offer.eligible && !preferred) ||
                            busy === `preferred-${product.id}`
                          }
                          onClick={() =>
                            void setPreferredSupplier(
                              product.id,
                              preferred ? "" : offer.supplier_id,
                            )
                          }
                        >
                          {busy === `preferred-${product.id}`
                            ? "Saving…"
                            : preferred
                              ? "Clear preferred"
                              : "Make preferred"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!data.supplier_products.length && (
            <p className="supplier-empty">
              No supplier offers match this view.
            </p>
          )}
        </div>
        {page.page_count > 1 && (
          <nav
            className="inventory-pagination"
            aria-label="Supplier offer pagination"
          >
            <Button
              variant="outlined"
              type="button"
              disabled={loading || page.page === 1}
              onClick={() => void onRead({ ...applied, page: page.page - 1 })}
            >
              Previous
            </Button>
            <span aria-live="polite">
              Page {page.page} of {page.page_count}
            </span>
            <Button
              variant="outlined"
              type="button"
              disabled={loading || page.page === page.page_count}
              onClick={() => void onRead({ ...applied, page: page.page + 1 })}
            >
              Next
            </Button>
          </nav>
        )}
      </section>
      <Dialog
        open={Boolean(requestOffer)}
        onClose={() => {
          if (!busy) setRequestOffer(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <form onSubmit={(event) => void saveQuoteRequest(event)}>
          <DialogTitle>Record a quote request</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <p>
                {requestOffer?.supplier_name} · {requestOffer?.description}
              </p>
              <p>
                This records staff follow-up only. No supplier message is sent.
              </p>
              {error && <p role="alert">{error}</p>}
              {recordedRequest && (
                <p role="status">
                  This request is already recorded. Close this form to review it
                  above.
                </p>
              )}
              <TextField
                label="Requested packages"
                type="number"
                value={requestPackages}
                onChange={(event) => setRequestPackages(event.target.value)}
                required
                disabled={requestSubmitted}
                slotProps={{ htmlInput: { min: 1, step: 1 } }}
              />
              <TextField
                label="Request note"
                value={requestNote}
                onChange={(event) => setRequestNote(event.target.value)}
                required
                disabled={requestSubmitted}
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 1000 } }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setRequestOffer(null)}
              disabled={Boolean(busy)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                Boolean(busy) || writeBlocked || Boolean(recordedRequest)
              }
            >
              Record request
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={manualOfferOpen}
        onClose={() => {
          if (!busy) setManualOfferOpen(false);
        }}
        fullWidth
        maxWidth="md"
      >
        <form onSubmit={(event) => void saveManualOffer(event)}>
          <DialogTitle>
            Record quote · {selectedSupplier?.name ?? "supplier"}
          </DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {manualOfferError && (
                <p role="alert" className="supplier-pricing-message error">
                  {manualOfferError}
                </p>
              )}
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  label="Search active catalog items"
                  value={catalogQuery}
                  onChange={(event) => setCatalogQuery(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                  fullWidth
                />
                <Button
                  variant="outlined"
                  type="button"
                  disabled={Boolean(busy) || writeBlocked}
                  onClick={() => void searchCatalogProducts()}
                >
                  {busy === "catalog-products" ? "Searching…" : "Search"}
                </Button>
              </Stack>
              <TextField
                select
                label="Matched clinic catalog item"
                value={catalogProduct?.id ?? ""}
                onChange={(event) => {
                  const selected = catalogProducts.find(
                    (item) => item.id === event.target.value,
                  );
                  setCatalogProduct(selected ?? null);
                  setOfferDescription(selected?.name ?? "");
                  setOfferPackageQuantity(selected?.package_quantity ?? "");
                }}
                required
                disabled={!catalogProducts.length || Boolean(busy)}
                helperText="Only active clinic items with a valid National Drug Code can have supplier offers."
              >
                <MenuItem value="" disabled>
                  Search and choose a catalog item
                </MenuItem>
                {catalogProducts.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name} · {item.ndc}
                  </MenuItem>
                ))}
              </TextField>
              {catalogProduct && (
                <p>
                  Offer NDC {catalogProduct.ndc}; catalog stock unit{" "}
                  {catalogProduct.stock_unit}.
                </p>
              )}
              <TextField
                label="Supplier SKU"
                value={offerSku}
                onChange={(event) => setOfferSku(event.target.value)}
                required
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
              <TextField
                label="Supplier item description"
                value={offerDescription}
                onChange={(event) => setOfferDescription(event.target.value)}
                required
                slotProps={{ htmlInput: { maxLength: 400 } }}
              />
              <TextField
                label="Units per supplier package"
                value={offerPackageQuantity}
                onChange={(event) =>
                  setOfferPackageQuantity(event.target.value)
                }
                required
                inputMode="decimal"
              />
              <TextField
                label="Quoted package price"
                value={offerPrice}
                onChange={(event) => setOfferPrice(event.target.value)}
                required
                inputMode="decimal"
              />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Currency"
                  value={offerCurrency}
                  onChange={(event) =>
                    setOfferCurrency(event.target.value.toUpperCase())
                  }
                  required
                  slotProps={{ htmlInput: { maxLength: 3 } }}
                  fullWidth
                />
                <TextField
                  label="Quote reference"
                  value={offerQuoteReference}
                  onChange={(event) =>
                    setOfferQuoteReference(event.target.value)
                  }
                  required
                  slotProps={{ htmlInput: { maxLength: 120 } }}
                  fullWidth
                />
                <TextField
                  label="Quoted on"
                  type="date"
                  value={offerQuotedOn}
                  onChange={(event) => setOfferQuotedOn(event.target.value)}
                  required
                  slotProps={{ inputLabel: { shrink: true } }}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  select
                  label="Supplier contract status"
                  value={offerContractStatus}
                  onChange={(event) =>
                    setOfferContractStatus(event.target.value)
                  }
                  fullWidth
                >
                  <MenuItem value="unknown">Unknown</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </TextField>
                <TextField
                  select
                  label="Availability"
                  value={offerAvailability}
                  onChange={(event) => setOfferAvailability(event.target.value)}
                  fullWidth
                >
                  <MenuItem value="unknown">Unknown</MenuItem>
                  <MenuItem value="true">Confirmed available</MenuItem>
                  <MenuItem value="false">Unavailable</MenuItem>
                </TextField>
                <TextField
                  label="Lead time in days (optional)"
                  value={offerLeadTime}
                  onChange={(event) => setOfferLeadTime(event.target.value)}
                  inputMode="numeric"
                  fullWidth
                />
              </Stack>
              <p>
                Ordering is enabled only when an active contract and
                availability are confirmed. Saving records this quote locally;
                it does not contact the supplier.
              </p>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setManualOfferOpen(false)}
              disabled={Boolean(busy)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={
                Boolean(busy) ||
                writeBlocked ||
                !selectedSupplier ||
                !catalogProduct
              }
            >
              {busy === "manual-offer" ? "Saving…" : "Save dated quote"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      <Dialog
        open={Boolean(quoteOffer)}
        onClose={() => {
          if (!busy) setQuoteOffer(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <form onSubmit={(event) => void saveQuote(event)}>
          <DialogTitle>Record supplier quote</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                label="Supplier offer"
                value={
                  quoteOffer
                    ? `${quoteOffer.supplier_name} · ${quoteOffer.supplier_sku}`
                    : ""
                }
                slotProps={{ input: { readOnly: true } }}
              />
              <TextField
                label="Quote reference"
                value={quoteReference}
                onChange={(event) => setQuoteReference(event.target.value)}
                required
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
              <TextField
                label="Quoted on"
                type="date"
                value={quotedOn}
                onChange={(event) => setQuotedOn(event.target.value)}
                required
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Package price"
                value={quotePrice}
                onChange={(event) => setQuotePrice(event.target.value)}
                required
                inputMode="decimal"
              />
              <TextField
                label="Currency"
                value={quoteCurrency}
                onChange={(event) =>
                  setQuoteCurrency(event.target.value.toUpperCase())
                }
                required
                slotProps={{ htmlInput: { maxLength: 3 } }}
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => setQuoteOffer(null)}
              disabled={Boolean(busy)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={Boolean(busy) || writeBlocked}
            >
              Save quote
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </div>
  );
}
