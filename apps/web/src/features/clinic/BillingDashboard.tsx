import { useMemo, useState } from "react";
import type {
  BillingDashboard as BillingDashboardData,
  BillingInvoiceSummary,
} from "../../api/contracts";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";

export type BillingInvoiceFilter = "all" | "draft" | "open";
function isZero(value: string) {
  return /^-?0(?:\.0*)?$/.test(value.trim());
}

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

export function invoicePaymentState(invoice: BillingInvoiceSummary) {
  if (invoice.status === "void") return "void";
  if (invoice.status === "draft") return "draft";
  if (isZero(invoice.balance)) return "paid";
  if (!isZero(invoice.allocated)) return "partial";
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
      (invoice) => invoice.status === "posted" && !isZero(invoice.balance),
    );
  return invoices;
}

function statusLabel(invoice: BillingInvoiceSummary) {
  const state = invoicePaymentState(invoice);
  return state === "partial" ? "Partially paid" : state;
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

export function BillingDashboard() {
  const context = useClinic();
  const { data, error } = useResource<BillingDashboardData>(
    "/api/clinic/billing",
  );
  const [filter, setFilter] = useState<BillingInvoiceFilter>("all");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(
    null,
  );
  const visibleInvoices = useMemo(
    () => (data ? filteredInvoices(data.recent_invoices, filter) : []),
    [data, filter],
  );

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

  const primaryCurrency = data.metrics.currencies[0];
  const primaryOpenInvoiceCount = primaryCurrency?.open_invoice_count ?? 0;
  const openQueueCount = totalOpenInvoiceCount(data.metrics.currencies);
  const selectedInvoice =
    visibleInvoices.find((invoice) => invoice.id === selectedInvoiceId) ??
    data.recent_invoices.find((invoice) => invoice.id === selectedInvoiceId) ??
    visibleInvoices.find(
      (invoice) => invoicePaymentState(invoice) !== "void",
    ) ??
    data.recent_invoices.find(
      (invoice) => invoicePaymentState(invoice) !== "void",
    );
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
        <div className="billing-period" aria-label="Reporting period">
          <span>Current period</span>
          <strong>
            {periodLabel(data.period.start, data.practice.timezone)}
          </strong>
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
                onClick={() => setFilter(item.filter)}
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
            <h2>Recent billing activity</h2>
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
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

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
                      <td>
                        <span className={`billing-badge billing-${state}`}>
                          {statusLabel(invoice)}
                        </span>
                      </td>
                      <td>
                        {date(invoice.created_at, data.practice.timezone)}
                      </td>
                      <td>{money(invoice.total, invoice.currency)}</td>
                      <td>{money(invoice.allocated, invoice.currency)}</td>
                      <td>{money(invoice.balance, invoice.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
    </div>
  );
}
