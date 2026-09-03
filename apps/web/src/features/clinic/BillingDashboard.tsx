import { useState } from "react";
import type {
  BillingDashboard as BillingDashboardData,
  BillingInvoiceDetail,
  BillingInvoiceSummary,
  Pagination,
} from "../../api/contracts";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { CashDrawerOperations } from "./CashDrawerOperations";

export type BillingInvoiceFilter = "all" | "draft" | "open" | "paid" | "void";
export type BillingInvoiceSort =
  "recent" | "oldest" | "balance_desc" | "total_desc";

type AgedBillingInvoice = BillingInvoiceSummary & {
  age_days: number;
  age_bucket: string;
};

function money(value: string, currency: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function date(value: string, timeZone: string, includeTime = false) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone,
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(new Date(value));
}

export function periodLabel(start: string, timeZone: string) {
  const calendarDate = /^(\d{4})-(\d{2})-\d{2}$/.exec(start);
  const instant = calendarDate
    ? new Date(
        Date.UTC(Number(calendarDate[1]), Number(calendarDate[2]) - 1, 15),
      )
    : new Date(start);
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: calendarDate ? "UTC" : timeZone,
  }).format(instant);
}

export function totalOpenInvoiceCount(
  currencies: { open_invoice_count: number }[],
) {
  return currencies.reduce(
    (count, currency) => count + currency.open_invoice_count,
    0,
  );
}

function isZeroDecimal(value: string) {
  return /^0+(?:\.0+)?$/.test(value.trim());
}

function compareDecimal(left: string, right: string) {
  const normalize = (value: string) => {
    const [whole = "0", fraction = ""] = value.trim().split(".");
    return {
      whole: whole.replace(/^0+(?=\d)/, "") || "0",
      fraction: fraction.replace(/0+$/, ""),
    };
  };
  const a = normalize(left);
  const b = normalize(right);
  if (a.whole.length !== b.whole.length) return a.whole.length - b.whole.length;
  const wholeComparison = a.whole.localeCompare(b.whole);
  if (wholeComparison) return wholeComparison;
  const width = Math.max(a.fraction.length, b.fraction.length);
  return a.fraction
    .padEnd(width, "0")
    .localeCompare(b.fraction.padEnd(width, "0"));
}

export function invoicePaymentState(invoice: BillingInvoiceSummary) {
  if (invoice.status === "void") return "void";
  if (invoice.status === "draft") return "draft";
  if (isZeroDecimal(invoice.balance)) return "paid";
  if (!isZeroDecimal(invoice.allocated)) return "partial";
  return "open";
}

export function filteredInvoices(
  invoices: BillingInvoiceSummary[],
  filter: BillingInvoiceFilter,
) {
  if (filter === "draft")
    return invoices.filter((invoice) => invoice.status === "draft");
  if (filter === "open")
    return invoices.filter(
      (invoice) =>
        invoice.status === "posted" && !isZeroDecimal(invoice.balance),
    );
  if (filter === "paid")
    return invoices.filter(
      (invoice) =>
        invoice.status === "posted" && isZeroDecimal(invoice.balance),
    );
  if (filter === "void")
    return invoices.filter((invoice) => invoice.status === "void");
  return invoices;
}

export function sortedInvoices(
  invoices: BillingInvoiceSummary[],
  sort: BillingInvoiceSort,
) {
  if (sort === "recent") return invoices;
  return [...invoices].sort((left, right) => {
    if (sort === "oldest")
      return left.created_at.localeCompare(right.created_at);
    if (sort === "balance_desc")
      return compareDecimal(right.balance, left.balance);
    return compareDecimal(right.total, left.total);
  });
}

function statusLabel(invoice: BillingInvoiceSummary) {
  const state = invoicePaymentState(invoice);
  return state === "partial"
    ? "Partially paid"
    : state.charAt(0).toUpperCase() + state.slice(1);
}

function Metric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "positive" | "attention";
}) {
  return (
    <section className={`billing-metric billing-metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </section>
  );
}

function DetailLineItems({ detail }: { detail: BillingInvoiceDetail }) {
  return (
    <div className="billing-line-items">
      <div className="billing-line-items-header">
        <span>Description</span>
        <span>Qty</span>
        <span>Amount</span>
      </div>
      {detail.lines.map((line) => (
        <div className="billing-line-item" key={line.id}>
          <span>
            <strong>{line.description}</strong>
            <small>
              {line.quantity} × {money(line.unit_amount, detail.currency)}
            </small>
          </span>
          <span>{line.quantity}</span>
          <strong>{money(line.posted_amount, detail.currency)}</strong>
        </div>
      ))}
    </div>
  );
}

function BillingConfirm({
  action,
  invoice,
  onCancel,
  onConfirm,
  busy,
}: {
  action: "post" | "payment";
  invoice: BillingInvoiceSummary;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const isPost = action === "post";
  return (
    <div
      className="billing-confirm"
      role="dialog"
      aria-label="Review billing action"
    >
      <div>
        <strong>
          {isPost
            ? `Post invoice #${invoice.id}?`
            : `Record payment on invoice #${invoice.id}?`}
        </strong>
        <p>
          {isPost
            ? "Posting locks the current line items and moves this invoice into the ledger."
            : "This records the entered external payment event and reduces the invoice balance."}
        </p>
      </div>
      <div className="billing-confirm-actions">
        <button
          className="billing-secondary-button"
          type="button"
          onClick={onCancel}
        >
          Go back
        </button>
        <button
          className="billing-primary-button"
          type="button"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Saving…" : isPost ? "Post invoice" : "Record payment"}
        </button>
      </div>
    </div>
  );
}

export function BillingDashboard() {
  const context = useClinic();
  const [invoicePage, setInvoicePage] = useState(1);
  const [filter, setFilter] = useState<BillingInvoiceFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<BillingInvoiceSort>("recent");
  const { data, error, refresh } = useResource<
    Omit<BillingDashboardData, "recent_invoices"> & {
      recent_invoices: AgedBillingInvoice[];
      invoice_pagination: Pagination;
    }
  >(
    `/api/clinic/billing?page=${invoicePage}&per_page=25&filter=${filter}&sort=${sort}&q=${encodeURIComponent(query)}`,
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(
    null,
  );
  const [confirmAction, setConfirmAction] = useState<"post" | "payment" | null>(
    null,
  );
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentEventAmount, setPaymentEventAmount] = useState("");
  const [busyAction, setBusyAction] = useState<"post" | "payment" | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const visibleInvoices = data?.recent_invoices ?? [];
  const selectedInvoice =
    visibleInvoices.find((invoice) => invoice.id === selectedInvoiceId) ??
    visibleInvoices.find(
      (invoice) => invoicePaymentState(invoice) !== "void",
    ) ??
    visibleInvoices[0];
  const detailResource = useResource<{ invoice: BillingInvoiceDetail }>(
    selectedInvoice
      ? `/api/clinic/invoices/${selectedInvoice.id}`
      : "/api/clinic/billing",
  );
  const selectedDetail = detailResource.data?.invoice;

  if (context.capabilities.billing_read !== true)
    return (
      <>
        <h1>Billing</h1>
        <p role="alert">Billing access is not enabled for this account.</p>
      </>
    );
  if (!data) return <LoadState error={error} />;
  if (data.schema_version !== "clinic-billing-v1")
    return (
      <LoadState error="Unable to verify the billing response. Reload and try again." />
    );

  const primaryCurrency =
    data.metrics.currencies.length === 1 ? data.metrics.currencies[0] : null;
  const primaryOpenInvoiceCount = primaryCurrency?.open_invoice_count ?? 0;
  const openQueueCount = totalOpenInvoiceCount(data.metrics.currencies);
  const clearActionState = () => {
    setConfirmAction(null);
    setActionError("");
  };

  const postInvoice = async () => {
    if (!selectedInvoice || busyAction) return;
    setBusyAction("post");
    setActionError("");
    try {
      await api(`/api/clinic/invoices/${selectedInvoice.id}/post`, {
        method: "POST",
      });
      setActionMessage(
        `Invoice #${selectedInvoice.id} was posted to the ledger.`,
      );
      clearActionState();
      refresh();
      detailResource.refresh();
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "The invoice could not be posted. Review its state and try again.",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const validatePayment = () => {
    const reference = paymentReference.trim();
    const allocationAmount = paymentAmount.trim();
    const eventAmount = paymentEventAmount.trim() || allocationAmount;
    if (!reference) return "Enter the external payment event reference.";
    if (reference.length > 255)
      return "Payment references must be 255 characters or fewer.";
    if (
      !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(allocationAmount) ||
      /^0+(?:\.0+)?$/.test(allocationAmount)
    )
      return "Enter a positive amount with up to six decimal places.";
    if (
      !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(eventAmount) ||
      /^0+(?:\.0+)?$/.test(eventAmount)
    )
      return "Enter a positive payment total with up to six decimal places.";
    if (compareDecimal(allocationAmount, eventAmount) > 0)
      return "The amount applied now cannot exceed the total payment event.";
    return "";
  };

  const recordPayment = async () => {
    if (!selectedInvoice || busyAction) return;
    const validation = validatePayment();
    if (validation) {
      setActionError(validation);
      setConfirmAction(null);
      return;
    }
    setBusyAction("payment");
    setActionError("");
    try {
      await api(
        `/api/clinic/invoices/${selectedInvoice.id}/payment_allocations`,
        {
          method: "POST",
          body: {
            payment: {
              external_event_reference: paymentReference.trim(),
              currency: selectedInvoice.currency,
              amount: paymentAmount.trim(),
              payment_amount: paymentEventAmount.trim() || paymentAmount.trim(),
            },
          },
        },
      );
      setActionMessage(
        `Payment recorded against invoice #${selectedInvoice.id}.`,
      );
      setPaymentReference("");
      setPaymentAmount("");
      setPaymentEventAmount("");
      clearActionState();
      refresh();
      detailResource.refresh();
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "The payment could not be recorded. Check the event reference and try again.",
      );
    } finally {
      setBusyAction(null);
    }
  };
  const queueItems: {
    filter: BillingInvoiceFilter;
    label: string;
    count: number;
    tone: "attention" | "neutral";
  }[] = [
    {
      filter: "draft",
      label: "Review draft invoices",
      count: data.metrics.draft_count,
      tone: "attention",
    },
    {
      filter: "open",
      label: "Reconcile open balances",
      count: openQueueCount,
      tone: "neutral",
    },
  ];

  return (
    <div className="billing-page">
      <header className="billing-header">
        <div>
          <h1>Billing workspace</h1>
          {context.capabilities.patient_identity_read === true && (
            <a href="/clinic/billing/patients">Patient balances</a>
          )}
        </div>
        <div className="billing-header-actions">
          <div className="billing-period" aria-label="Reporting period">
            <span>Current period</span>
            <strong>
              {periodLabel(data.period.start, data.practice.timezone)}
            </strong>
          </div>
          <button
            className="billing-secondary-button"
            type="button"
            onClick={refresh}
          >
            Refresh ledger
          </button>
        </div>
      </header>

      <div className="billing-metrics" aria-label="Revenue cycle summary">
        <Metric
          label="Charges posted"
          value={
            primaryCurrency
              ? money(
                  primaryCurrency.monthly_invoiced,
                  primaryCurrency.currency,
                )
              : "—"
          }
        />
        <Metric
          label="Payments received"
          value={
            primaryCurrency
              ? money(
                  primaryCurrency.monthly_collected,
                  primaryCurrency.currency,
                )
              : "—"
          }
          tone="positive"
        />
        <Metric
          label="Open balance"
          value={
            primaryCurrency
              ? money(primaryCurrency.outstanding, primaryCurrency.currency)
              : "—"
          }
          detail={`${primaryOpenInvoiceCount} posted invoice${primaryOpenInvoiceCount === 1 ? "" : "s"} with a balance`}
          tone="attention"
        />
        <Metric
          label="Invoices in review"
          value={String(data.metrics.draft_count)}
          detail={`${data.metrics.void_count} void invoice${data.metrics.void_count === 1 ? "" : "s"} excluded from totals`}
        />
      </div>

      <div className="billing-workspace-grid">
        <section className="clinic-card billing-queue-card">
          <div className="billing-section-heading">
            <div>
              <h2>What needs attention</h2>
            </div>
            <button
              type="button"
              className="billing-text-button"
              onClick={() => setFilter("all")}
            >
              View all ledger entries
            </button>
          </div>
          <div className="billing-queue-list">
            {queueItems.map((item) => (
              <button
                className={`billing-queue-item billing-queue-${item.tone}`}
                type="button"
                key={item.filter}
                aria-pressed={filter === item.filter}
                onClick={() => {
                  setFilter(item.filter);
                  setInvoicePage(1);
                }}
              >
                <span className="billing-queue-count">{item.count}</span>
                <span className="billing-queue-copy">
                  <strong>{item.label}</strong>
                </span>
                <span className="billing-queue-arrow" aria-hidden="true">
                  →
                </span>
              </button>
            ))}
          </div>
          {queueItems.every((item) => item.count === 0) && (
            <p className="billing-clear-state">
              No draft invoices or posted balances require follow-up in this
              ledger.
            </p>
          )}
        </section>

        <section className="clinic-card billing-currency-card">
          <div className="billing-section-heading">
            <div>
              <h2>Currency totals</h2>
            </div>
          </div>
          {data.metrics.currencies.length === 0 ? (
            <p className="billing-clear-state">No ledger activity yet.</p>
          ) : (
            <div className="billing-currency-list">
              {data.metrics.currencies.map((currency) => (
                <div className="billing-currency" key={currency.currency}>
                  <strong>{currency.currency}</strong>
                  <span>
                    <small>Posted this period</small>
                    {money(currency.monthly_invoiced, currency.currency)}
                  </span>
                  <span>
                    <small>Open balance</small>
                    {money(currency.outstanding, currency.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="clinic-card billing-ledger-card">
        <div className="billing-section-heading billing-ledger-heading">
          <div>
            <h2>Recent invoice activity</h2>
          </div>
          <small className="billing-ledger-count">
            Showing {visibleInvoices.length} of {data.metrics.invoice_count}
          </small>
          <div className="billing-filter-group" aria-label="Invoice filter">
            {(
              [
                ["all", "All"],
                ["draft", "Drafts"],
                ["open", "Open balances"],
                ["paid", "Paid"],
                ["void", "Void"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  setInvoicePage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="billing-ledger-toolbar">
          <label className="billing-search-field">
            <span>Search invoices</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setInvoicePage(1);
              }}
              placeholder="Invoice number, status, currency on this page"
            />
          </label>
          <label className="billing-sort-field">
            <span>Sort by</span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as BillingInvoiceSort);
                setInvoicePage(1);
              }}
            >
              <option value="recent">Most recent</option>
              <option value="oldest">Oldest first</option>
              <option value="balance_desc">Largest balance</option>
              <option value="total_desc">Largest total</option>
            </select>
          </label>
          {(query || filter !== "all" || sort !== "recent") && (
            <button
              className="billing-text-button"
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
                setSort("recent");
                setInvoicePage(1);
              }}
            >
              Reset view
            </button>
          )}
        </div>
        <p className="billing-results-count" role="status">
          Showing {visibleInvoices.length} of {data.metrics.invoice_count}{" "}
          invoices
          {query ? ` matching “${query}”` : ""}.
        </p>

        {visibleInvoices.length === 0 ? (
          <p className="billing-clear-state">
            No invoices match this view. Choose another filter to review the
            rest of the ledger.
          </p>
        ) : (
          <div className="billing-table-wrap">
            <table className="billing-ledger-table">
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">State</th>
                  <th scope="col">Created</th>
                  <th scope="col">Age</th>
                  <th scope="col">Total</th>
                  <th scope="col">Paid</th>
                  <th scope="col">Balance</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.map((invoice) => {
                  const state = invoicePaymentState(invoice);
                  const selected = selectedInvoice?.id === invoice.id;
                  return (
                    <tr key={invoice.id} data-selected={selected || undefined}>
                      <th scope="row">
                        <button
                          type="button"
                          className="billing-invoice-button"
                          onClick={() => setSelectedInvoiceId(invoice.id)}
                          aria-pressed={selected}
                        >
                          #{invoice.id}
                        </button>
                      </th>
                      <td data-label="State">
                        <span className={`billing-badge billing-${state}`}>
                          {statusLabel(invoice)}
                        </span>
                      </td>
                      <td data-label="Created">
                        {date(invoice.created_at, data.practice.timezone)}
                      </td>
                      <td data-label="Age">
                        <span title={invoice.age_bucket}>
                          {invoice.age_days}d
                        </span>
                      </td>
                      <td data-label="Total">
                        {money(invoice.total, invoice.currency)}
                      </td>
                      <td data-label="Paid">
                        {money(invoice.allocated, invoice.currency)}
                      </td>
                      <td data-label="Balance">
                        {money(invoice.balance, invoice.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data.invoice_pagination.total_pages > 1 && (
          <div className="billing-pagination" aria-label="Invoice pages">
            <button
              className="billing-secondary-button"
              type="button"
              disabled={invoicePage <= 1}
              onClick={() => {
                setInvoicePage((page) => Math.max(1, page - 1));
                setSelectedInvoiceId(null);
              }}
            >
              Previous page
            </button>
            <span role="status">
              Page {data.invoice_pagination.page} of{" "}
              {data.invoice_pagination.total_pages}
            </span>
            <button
              className="billing-secondary-button"
              type="button"
              disabled={invoicePage >= data.invoice_pagination.total_pages}
              onClick={() => {
                setInvoicePage((page) =>
                  Math.min(data.invoice_pagination.total_pages, page + 1),
                );
                setSelectedInvoiceId(null);
              }}
            >
              Next page
            </button>
          </div>
        )}
      </section>

      <div className="billing-detail-grid">
        <section className="clinic-card billing-invoice-detail">
          <div className="billing-section-heading">
            <div>
              <h2>
                {selectedInvoice
                  ? `Invoice #${selectedInvoice.id}`
                  : "Choose an invoice"}
              </h2>
            </div>
            {selectedInvoice && (
              <span
                className={`billing-badge billing-${invoicePaymentState(selectedInvoice)}`}
              >
                {statusLabel(selectedInvoice)}
              </span>
            )}
          </div>
          {selectedInvoice ? (
            <>
              <div className="billing-detail-meta">
                <span>
                  Linked patient record · #{selectedDetail?.patient_id ?? "—"}
                </span>
                <span>
                  Created{" "}
                  {date(selectedInvoice.created_at, data.practice.timezone)}
                </span>
              </div>
              <div className="billing-invoice-detail-values">
                <div>
                  <span>Total</span>
                  <strong>
                    {money(selectedInvoice.total, selectedInvoice.currency)}
                  </strong>
                </div>
                <div>
                  <span>Payments allocated</span>
                  <strong>
                    {money(selectedInvoice.allocated, selectedInvoice.currency)}
                  </strong>
                </div>
                <div>
                  <span>Remaining balance</span>
                  <strong>
                    {money(selectedInvoice.balance, selectedInvoice.currency)}
                  </strong>
                </div>
              </div>
              {detailResource.error ? (
                <p className="billing-inline-error" role="alert">
                  Invoice line detail is unavailable for this account. The
                  ledger summary remains available.
                </p>
              ) : selectedDetail ? (
                <DetailLineItems detail={selectedDetail} />
              ) : (
                <p className="billing-loading-detail" role="status">
                  Loading invoice detail…
                </p>
              )}
              {selectedInvoice.status === "draft" &&
                context.capabilities.billing && (
                  <div className="billing-action-row">
                    {confirmAction === "post" ? (
                      <BillingConfirm
                        action="post"
                        invoice={selectedInvoice}
                        onCancel={clearActionState}
                        onConfirm={() => void postInvoice()}
                        busy={busyAction === "post"}
                      />
                    ) : (
                      <button
                        className="billing-primary-button"
                        type="button"
                        onClick={() => {
                          setActionError("");
                          setConfirmAction("post");
                        }}
                      >
                        Post invoice to ledger
                      </button>
                    )}
                  </div>
                )}
              {selectedInvoice.status === "posted" &&
                !isZeroDecimal(selectedInvoice.balance) && (
                  <form
                    className="billing-payment-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const validation = validatePayment();
                      if (validation) {
                        setActionError(validation);
                        setConfirmAction(null);
                      } else {
                        setActionError("");
                        setConfirmAction("payment");
                      }
                    }}
                  >
                    <div>
                      <h3>Record an external payment</h3>
                      <p>
                        Use the processor or bank event reference. Enter the
                        amount to apply now and, when needed, a larger payment
                        total to retain as unapplied balance. The server
                        validates currency, balance, and replay safety.
                      </p>
                    </div>
                    <div className="billing-payment-fields">
                      <label>
                        <span>Event reference</span>
                        <input
                          value={paymentReference}
                          onChange={(event) =>
                            setPaymentReference(event.target.value)
                          }
                          maxLength={255}
                          required
                        />
                      </label>
                      <label>
                        <span>Apply now ({selectedInvoice.currency})</span>
                        <input
                          value={paymentAmount}
                          onChange={(event) =>
                            setPaymentAmount(event.target.value)
                          }
                          inputMode="decimal"
                          pattern="(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?"
                          required
                        />
                      </label>
                      <label>
                        <span>Payment total ({selectedInvoice.currency})</span>
                        <input
                          value={paymentEventAmount}
                          onChange={(event) =>
                            setPaymentEventAmount(event.target.value)
                          }
                          inputMode="decimal"
                          pattern="(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?"
                          placeholder="Same as amount applied"
                        />
                      </label>
                    </div>
                    {confirmAction === "payment" && (
                      <BillingConfirm
                        action="payment"
                        invoice={selectedInvoice}
                        onCancel={clearActionState}
                        onConfirm={() => void recordPayment()}
                        busy={busyAction === "payment"}
                      />
                    )}
                    {!confirmAction && (
                      <button
                        className="billing-secondary-button"
                        type="submit"
                      >
                        Review payment
                      </button>
                    )}
                  </form>
                )}
              {actionError && (
                <p className="billing-inline-error" role="alert">
                  {actionError}
                </p>
              )}
              {actionMessage && (
                <p className="billing-inline-success" role="status">
                  {actionMessage}
                </p>
              )}
            </>
          ) : (
            <p className="billing-clear-state">
              Invoice detail will appear when the ledger has activity.
            </p>
          )}
        </section>

        <section className="clinic-card billing-payments-card">
          <div className="billing-section-heading">
            <div>
              <h2>Recent allocations</h2>
            </div>
          </div>
          {data.recent_payments.length === 0 ? (
            <p className="billing-clear-state">
              No payments have been allocated in the ledger yet.
            </p>
          ) : (
            <ul className="billing-payment-list">
              {data.recent_payments.map((payment) => (
                <li key={`${payment.invoice_id}-${payment.created_at}`}>
                  <span>
                    <strong>Invoice #{payment.invoice_id}</strong>
                    <small>
                      {date(payment.created_at, data.practice.timezone, true)}
                    </small>
                  </span>
                  <strong>{money(payment.amount, payment.currency)}</strong>
                </li>
              ))}
            </ul>
          )}
          <p className="billing-fine-print">
            Payment collection is not configured in this local workspace.
          </p>
        </section>
      </div>
      <CashDrawerOperations
        invoice={selectedInvoice ?? null}
        onRecorded={() => {
          refresh();
          detailResource.refresh();
        }}
      />
    </div>
  );
}
