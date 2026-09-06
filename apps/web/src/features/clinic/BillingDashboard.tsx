import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import CreditCardOutlinedIcon from "@mui/icons-material/CreditCardOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import {
  BillingIncomeOutlook,
  BillingPayments,
  type BillingWorkspaceData,
} from "./BillingInsights";
import type {
  BillingInvoiceDetail,
  BillingInvoiceSummary,
} from "../../api/contracts";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { CashDrawerOperations } from "./CashDrawerOperations";
import { SubscriptionBilling } from "./subscriptions/SubscriptionBilling";

export type BillingInvoiceFilter =
  | "all"
  | "draft"
  | "open"
  | "paid"
  | "void"
  | "age_0_30"
  | "age_31_60"
  | "age_61_90"
  | "age_91_plus";
export type BillingInvoiceSort =
  "recent" | "oldest" | "balance_desc" | "total_desc";

type AuditedBillingInvoiceDetail = BillingInvoiceDetail & {
  audit_timeline: {
    id: number;
    event: string;
    actor_reference: string | null;
    changed_fields: string[];
    occurred_at: string;
  }[];
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

function statusLabel(invoice: BillingInvoiceSummary & { credited?: string }) {
  const state = invoicePaymentState(invoice);
  if (state === "paid" && invoice.credited && !isZeroDecimal(invoice.credited))
    return "Settled";
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

function InvoiceAuditTimeline({
  detail,
}: {
  detail: AuditedBillingInvoiceDetail;
}) {
  return (
    <div className="billing-audit-timeline">
      <h3>Invoice history</h3>
      {detail.audit_timeline.length === 0 ? (
        <p className="billing-clear-state">No invoice events are available.</p>
      ) : (
        <ol>
          {detail.audit_timeline.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.event}</strong>
              <span>
                {date(entry.occurred_at, "UTC", true)} ·{" "}
                {entry.actor_reference ?? "System"}
              </span>
              {entry.changed_fields.length > 0 && (
                <small>Changed: {entry.changed_fields.join(", ")}</small>
              )}
            </li>
          ))}
        </ol>
      )}
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
        <Button
          className="billing-secondary-button"
          type="button"
          onClick={onCancel}
        >
          Go back
        </Button>
        <Button
          className="billing-primary-button"
          type="button"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Saving…" : isPost ? "Post invoice" : "Record payment"}
        </Button>
      </div>
    </div>
  );
}

export function BillingDashboard() {
  const context = useClinic();
  const [activeTab, setActiveTab] = useState("invoices");
  const [cardsOpen, setCardsOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [currency, setCurrency] = useState("");
  const [invoicePage, setInvoicePage] = useState(1);
  const [filter, setFilter] = useState<BillingInvoiceFilter>("all");
  const [query, setQuery] = useState("");
  const [searchText, setSearchText] = useState("");
  const [sort, setSort] = useState<BillingInvoiceSort>("recent");
  const { data, error, refresh } = useResource<BillingWorkspaceData>(
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
  const detailResource = useResource<{ invoice: AuditedBillingInvoiceDetail }>(
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
    data.metrics.currencies.find((item) => item.currency === currency) ??
    data.metrics.currencies[0] ??
    null;
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
          <h1>Billing</h1>
          <p className="billing-subtitle">
            Your collections, outstanding balances and next steps.
          </p>
        </div>
        <div className="billing-header-actions">
          <Button
            variant="outlined"
            startIcon={<CreditCardOutlinedIcon />}
            onClick={() => setCardsOpen(true)}
          >
            Cards & Stripe
          </Button>
          <Button
            variant="outlined"
            startIcon={<PrintOutlinedIcon />}
            onClick={() => setActiveTab("payments")}
          >
            Print a receipt
          </Button>
          {context.capabilities.patient_identity_read === true && (
            <Button variant="contained" href="/clinic/billing/patients">
              Patient payments
            </Button>
          )}
        </div>
      </header>
      <section className="billing-overview" aria-label="Financial summary">
        <div className="billing-overview-heading">
          <div>
            <strong>
              {periodLabel(data.period.start, data.practice.timezone)}
            </strong>
            <span>Collections this month · balances as of today</span>
          </div>
          <div className="billing-header-actions">
            {data.metrics.currencies.length > 1 && (
              <TextField
                select
                label="Summary currency"
                size="small"
                value={primaryCurrency?.currency ?? ""}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {data.metrics.currencies.map((item) => (
                  <MenuItem value={item.currency} key={item.currency}>
                    {item.currency}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Button size="small" startIcon={<RefreshIcon />} onClick={refresh}>
              Refresh
            </Button>
          </div>
        </div>
        <div className="billing-metrics" aria-label="Revenue cycle summary">
          <Metric
            label="Net collected"
            value={
              primaryCurrency
                ? money(
                    primaryCurrency.monthly_net_collected,
                    primaryCurrency.currency,
                  )
                : "—"
            }
            detail="Received this month, less refunds this month"
            tone="positive"
          />
          <Metric
            label="Payments received"
            value={
              primaryCurrency
                ? money(
                    primaryCurrency.monthly_received,
                    primaryCurrency.currency,
                  )
                : "—"
            }
            detail={
              primaryCurrency
                ? `${money(primaryCurrency.monthly_refunded, primaryCurrency.currency)} refunded this month`
                : "No recorded payments"
            }
          />
          <Metric
            label="Outstanding"
            value={
              primaryCurrency
                ? money(primaryCurrency.outstanding, primaryCurrency.currency)
                : "—"
            }
            detail={`${primaryOpenInvoiceCount} open invoices · credits deducted`}
            tone="attention"
          />
          <Metric
            label="Charges this month"
            value={
              primaryCurrency
                ? money(
                    primaryCurrency.monthly_invoiced,
                    primaryCurrency.currency,
                  )
                : "—"
            }
            detail="Posted invoices created this month"
          />
        </div>
        <div className="billing-attention-strip">
          <strong>Follow up</strong>
          {queueItems.map((item) => (
            <Button
              key={item.filter}
              size="small"
              onClick={() => {
                setFilter(item.filter);
                setInvoicePage(1);
                setActiveTab("invoices");
              }}
            >
              {item.count}{" "}
              {item.filter === "draft" ? "drafts to review" : "open invoices"}
            </Button>
          ))}
          <Button
            className="billing-outlook-link"
            endIcon={<ArrowForwardIcon />}
            onClick={() => setActiveTab("outlook")}
          >
            Look ahead at income
          </Button>
        </div>
      </section>
      <Tabs
        className="billing-workspace-tabs"
        value={activeTab}
        onChange={(_event, value: string) => setActiveTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        aria-label="Billing workspace"
      >
        {[
          ["invoices", "Invoices"],
          ["payments", "Payments & receipts"],
          ["outlook", "Income outlook"],
          ["subscriptions", "Subscriptions"],
          ["cash", "Cash drawer"],
        ].map(([value, label]) => (
          <Tab
            key={value}
            value={value}
            label={label}
            id={`billing-tab-${value}`}
            aria-controls={`billing-panel-${value}`}
          />
        ))}
      </Tabs>
      <div
        className="billing-panel"
        role="tabpanel"
        id="billing-panel-invoices"
        aria-labelledby="billing-tab-invoices"
        hidden={activeTab !== "invoices"}
      >
        <section className="clinic-card billing-ledger-card">
          <div className="billing-section-heading billing-ledger-heading">
            <div>
              <h2>Invoice ledger</h2>
              <p className="billing-subtitle">
                Choose an invoice to review charges, record a payment or open
                the patient ledger.
              </p>
            </div>
          </div>
          <div className="billing-ledger-toolbar">
            <form
              className="billing-search-form"
              onSubmit={(event) => {
                event.preventDefault();
                setQuery(searchText.trim());
                setInvoicePage(1);
              }}
            >
              <TextField
                label="Search invoices"
                size="small"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Invoice number, status or currency"
                fullWidth
              />
              <Button type="submit" variant="outlined">
                Search
              </Button>
            </form>
            <TextField
              select
              label="Invoice status or age"
              size="small"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as BillingInvoiceFilter);
                setInvoicePage(1);
              }}
            >
              {(
                [
                  ["all", "All invoices"],
                  ["draft", "Drafts"],
                  ["open", "Open balances"],
                  ["paid", "Settled"],
                  ["void", "Void"],
                  ["age_0_30", "Created 0–30 days ago"],
                  ["age_31_60", "Created 31–60 days ago"],
                  ["age_61_90", "Created 61–90 days ago"],
                  ["age_91_plus", "Created 91+ days ago"],
                ] as const
              ).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Sort by"
              size="small"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as BillingInvoiceSort);
                setInvoicePage(1);
              }}
            >
              <MenuItem value="recent">Most recent</MenuItem>
              <MenuItem value="oldest">Oldest first</MenuItem>
              <MenuItem value="balance_desc">Largest balance</MenuItem>
              <MenuItem value="total_desc">Largest total</MenuItem>
            </TextField>
          </div>
          <div className="billing-results-row">
            <p className="billing-results-count" role="status">
              Showing {visibleInvoices.length} of{" "}
              {data.invoice_pagination.total} matching invoices
              {query ? ` for “${query}”` : ""}.
            </p>
            {(query || filter !== "all" || sort !== "recent") && (
              <Button
                size="small"
                onClick={() => {
                  setQuery("");
                  setSearchText("");
                  setFilter("all");
                  setSort("recent");
                  setInvoicePage(1);
                }}
              >
                Reset filters
              </Button>
            )}
          </div>
          {visibleInvoices.length === 0 ? (
            <p className="billing-clear-state">
              No invoices match this view. Choose another filter to review the
              rest of the ledger.
            </p>
          ) : (
            <TableContainer className="billing-table-wrap">
              <Table
                className="billing-ledger-table"
                size="small"
                aria-label="Invoice ledger"
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Invoice</TableCell>
                    <TableCell>State</TableCell>
                    <TableCell>Created</TableCell>
                    <TableCell>Age</TableCell>
                    <TableCell>Total</TableCell>
                    <TableCell>Paid</TableCell>
                    <TableCell>Balance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleInvoices.map((invoice) => {
                    const state = invoicePaymentState(invoice);
                    const selected = selectedInvoice?.id === invoice.id;
                    return (
                      <TableRow
                        key={invoice.id}
                        data-selected={selected || undefined}
                      >
                        <TableCell component="th" scope="row">
                          <Button
                            type="button"
                            className="billing-invoice-button"
                            onClick={() => {
                              setSelectedInvoiceId(invoice.id);
                              setInvoiceOpen(true);
                              clearActionState();
                              setPaymentReference("");
                              setPaymentAmount("");
                              setPaymentEventAmount("");
                              setActionMessage("");
                            }}
                            aria-pressed={selected}
                          >
                            #{invoice.id}
                          </Button>
                        </TableCell>
                        <TableCell data-label="State">
                          <span className={`billing-badge billing-${state}`}>
                            {statusLabel(invoice)}
                          </span>
                        </TableCell>
                        <TableCell data-label="Created">
                          {date(invoice.created_at, data.practice.timezone)}
                        </TableCell>
                        <TableCell data-label="Age">
                          <span title={invoice.age_bucket}>
                            {invoice.age_days}d
                          </span>
                        </TableCell>
                        <TableCell data-label="Total">
                          {money(invoice.total, invoice.currency)}
                        </TableCell>
                        <TableCell data-label="Paid">
                          {money(invoice.allocated, invoice.currency)}
                        </TableCell>
                        <TableCell data-label="Balance">
                          {money(invoice.balance, invoice.currency)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {data.invoice_pagination.total_pages > 1 && (
            <div className="billing-pagination" aria-label="Invoice pages">
              <Button
                className="billing-secondary-button"
                type="button"
                disabled={invoicePage <= 1}
                onClick={() => {
                  setInvoicePage((page) => Math.max(1, page - 1));
                  setSelectedInvoiceId(null);
                }}
              >
                Previous page
              </Button>
              <span role="status">
                Page {data.invoice_pagination.page} of{" "}
                {data.invoice_pagination.total_pages}
              </span>
              <Button
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
              </Button>
            </div>
          )}
        </section>
      </div>
      <Dialog
        disablePortal
        open={invoiceOpen && Boolean(selectedInvoice)}
        onClose={() => {
          if (!busyAction) setInvoiceOpen(false);
        }}
        fullWidth
        maxWidth="md"
        slotProps={{ paper: { className: "billing-invoice-dialog" } }}
        aria-labelledby="billing-invoice-dialog-title"
      >
        <DialogTitle id="billing-invoice-dialog-title">
          Invoice details
        </DialogTitle>
        <DialogContent dividers>
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
                      {money(
                        selectedInvoice.allocated,
                        selectedInvoice.currency,
                      )}
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
                  <>
                    <DetailLineItems detail={selectedDetail} />
                    <InvoiceAuditTimeline detail={selectedDetail} />
                  </>
                ) : (
                  <p className="billing-loading-detail" role="status">
                    Loading invoice detail…
                  </p>
                )}
                {selectedInvoice.status === "draft" &&
                  (context.capabilities.billing_invoice_post === true ||
                    context.capabilities.billing) && (
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
                        <Button
                          className="billing-primary-button"
                          type="button"
                          onClick={() => {
                            setActionError("");
                            setConfirmAction("post");
                          }}
                        >
                          Post invoice to ledger
                        </Button>
                      )}
                    </div>
                  )}
                {selectedInvoice.status === "posted" &&
                  !isZeroDecimal(selectedInvoice.balance) &&
                  (context.capabilities.billing_payment_record === true ||
                    context.capabilities.billing) && (
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
                          total to retain as unapplied balance. Only record
                          money already received; this does not charge a card.
                        </p>
                      </div>
                      <div className="billing-payment-fields">
                        <TextField
                          label="Event reference"
                          size="small"
                          value={paymentReference}
                          onChange={(event) =>
                            setPaymentReference(event.target.value)
                          }
                          slotProps={{ htmlInput: { maxLength: 255 } }}
                          required
                        />
                        <TextField
                          label={`Apply now (${selectedInvoice.currency})`}
                          size="small"
                          value={paymentAmount}
                          onChange={(event) =>
                            setPaymentAmount(event.target.value)
                          }
                          slotProps={{
                            htmlInput: {
                              inputMode: "decimal",
                              pattern: "(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?",
                            },
                          }}
                          required
                        />
                        <TextField
                          label={`Payment total (${selectedInvoice.currency})`}
                          size="small"
                          value={paymentEventAmount}
                          onChange={(event) =>
                            setPaymentEventAmount(event.target.value)
                          }
                          slotProps={{
                            htmlInput: {
                              inputMode: "decimal",
                              pattern: "(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?",
                            },
                          }}
                          placeholder="Same as amount applied"
                        />
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
                        <Button
                          className="billing-secondary-button"
                          type="submit"
                        >
                          Review payment
                        </Button>
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
        </DialogContent>
        <DialogActions>
          {selectedDetail &&
            context.capabilities.patient_identity_read === true && (
              <Button
                href={`/clinic/billing/patients?patient_id=${selectedDetail.patient_id}`}
              >
                Open patient ledger
              </Button>
            )}
          {selectedInvoice?.status === "posted" &&
            !isZeroDecimal(selectedInvoice.balance) &&
            context.capabilities.billing_payment_record === true && (
              <Button
                onClick={() => {
                  setInvoiceOpen(false);
                  setActiveTab("cash");
                }}
              >
                Record cash payment
              </Button>
            )}
          <Button
            disabled={Boolean(busyAction)}
            onClick={() => setInvoiceOpen(false)}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
      <div
        className="billing-panel"
        role="tabpanel"
        id="billing-panel-payments"
        aria-labelledby="billing-tab-payments"
        hidden={activeTab !== "payments"}
      >
        {activeTab === "payments" && (
          <BillingPayments
            data={data}
            canOpenPatient={context.capabilities.patient_identity_read === true}
          />
        )}
      </div>
      <div
        className="billing-panel"
        role="tabpanel"
        id="billing-panel-outlook"
        aria-labelledby="billing-tab-outlook"
        hidden={activeTab !== "outlook"}
      >
        {activeTab === "outlook" && (
          <BillingIncomeOutlook initial={data.income_outlook} />
        )}
      </div>
      <div
        className="billing-panel"
        role="tabpanel"
        id="billing-panel-subscriptions"
        aria-labelledby="billing-tab-subscriptions"
        hidden={activeTab !== "subscriptions"}
      >
        <SubscriptionBilling
          onChanged={() => {
            refresh();
            detailResource.refresh();
          }}
        />
      </div>
      <div
        className="billing-panel"
        role="tabpanel"
        id="billing-panel-cash"
        aria-labelledby="billing-tab-cash"
        hidden={activeTab !== "cash"}
      >
        <div className="billing-cash-context">
          <Typography>
            {selectedInvoice
              ? `Selected invoice #${selectedInvoice.id} · balance ${money(selectedInvoice.balance, selectedInvoice.currency)}`
              : "Choose a posted invoice from the invoice ledger to record cash."}
          </Typography>
          <Button onClick={() => setActiveTab("invoices")}>
            Choose invoice
          </Button>
        </div>
        <CashDrawerOperations
          invoice={selectedInvoice ?? null}
          onRecorded={() => {
            refresh();
            detailResource.refresh();
          }}
        />
      </div>
      <Dialog
        open={cardsOpen}
        onClose={() => setCardsOpen(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="billing-cards-title"
      >
        <DialogTitle id="billing-cards-title">Cards & Stripe</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            Connection required
          </Alert>
          <Typography sx={{ mb: 2 }}>{data.card_collection.reason}</Typography>
          <Typography variant="body2" color="text.secondary">
            There is currently no connected Stripe page to enter a card or
            manage saved cards. Card entry will need a Stripe-hosted or embedded
            payment flow. No card information is collected here.
          </Typography>
          <Typography variant="body2" sx={{ mt: 2 }}>
            Clinic patient payments and clinic service subscriptions belong to
            this billing workspace. This is separate from paying for the APPly
            software.
          </Typography>
        </DialogContent>
        <DialogActions>
          {context.capabilities.patient_identity_read === true && (
            <Button href="/clinic/billing/patients">
              Open patient payments
            </Button>
          )}
          <Button onClick={() => setCardsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
