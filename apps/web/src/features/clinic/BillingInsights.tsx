import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import type {
  BillingCollectionNextAction,
  BillingCollectionStatus,
  BillingDashboard,
  BillingCurrencyMetrics,
  BillingInvoiceSummary,
  Pagination,
} from "../../api/contracts";
import { useResource, LoadState } from "../../shared/ui";

export type BillingPayment = {
  id: number;
  patient_id: number;
  currency: string;
  amount: string;
  refunded: string;
  net_amount: string;
  created_at: string;
  method: string;
  allocations: { invoice_id: number; amount: string }[];
  receipts: { id: number; kind: string; amount: string; issued_at: string }[];
};

type IncomeOutlook = {
  history_start: string;
  history_end: string;
  start_month: string;
  months: number;
  currencies: {
    currency: string;
    outstanding: string;
    history_invoice_count: number;
    estimated_monthly_revenue: string | null;
    history: {
      month: string;
      invoice_count: number;
      net_charges: string;
      received: string;
      refunded: string;
      net_collected: string;
    }[];
    forecast: {
      month: string;
      expected_existing_collections: string;
      estimated_new_revenue: string | null;
    }[];
  }[];
};

export type BillingWorkspaceData = Omit<
  BillingDashboard,
  "metrics" | "recent_invoices"
> & {
  metrics: Omit<BillingDashboard["metrics"], "currencies"> & {
    currencies: (BillingCurrencyMetrics & {
      monthly_received: string;
      monthly_refunded: string;
      monthly_net_collected: string;
    })[];
  };
  recent_invoices: (BillingInvoiceSummary & {
    age_days: number;
    age_bucket: string;
    credited: string;
  })[];
  invoice_pagination: Pagination;
  payment_activity: BillingPayment[];
  payment_count: number;
  card_collection: { available: boolean; reason: string };
  income_outlook: IncomeOutlook;
};

export function billingMoney(value: string, currency: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

const collectionStatusLabels: Record<BillingCollectionStatus, string> = {
  requested: "Requested",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  needs_reconciliation: "Needs reconciliation",
  canceled: "Canceled",
};

const collectionActionLabels: Record<BillingCollectionNextAction, string> = {
  continue_checkout:
    "Continue the hosted checkout or confirm its processor status.",
  refresh_status: "Refresh processor status before recording another payment.",
  review_receipt: "Review the posted allocation and receipt.",
  review_failure:
    "Review the failure before starting a new collection request.",
  reconcile:
    "Review processor evidence and reconcile before taking another payment.",
  review_balance:
    "Confirm the remaining invoice balance before starting again.",
};

export function BillingCollectionWorklist({
  data,
  onOpenInvoice,
}: {
  data: BillingWorkspaceData;
  onOpenInvoice: (invoiceId: number) => void;
}) {
  const worklist = data.collection_worklist;
  const statusCounts = worklist.items.reduce(
    (counts, item) => {
      counts[item.status] += 1;
      return counts;
    },
    {
      requested: 0,
      processing: 0,
      paid: 0,
      failed: 0,
      needs_reconciliation: 0,
      canceled: 0,
    } as Record<BillingCollectionStatus, number>,
  );
  return (
    <section className="clinic-card billing-ledger-card">
      <div className="billing-section-heading billing-ledger-heading">
        <div>
          <h2>Collections & reconciliation</h2>
          <p className="billing-subtitle">
            Review recent payment requests and resolve uncertain processor
            outcomes before taking another payment.
          </p>
        </div>
        <strong>{worklist.total_count} collection records</strong>
      </div>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ mb: 2, flexWrap: "wrap" }}
        aria-label="Collection status summary"
      >
        <Chip
          label={`${statusCounts.needs_reconciliation} need reconciliation`}
          color={statusCounts.needs_reconciliation > 0 ? "warning" : "success"}
          size="small"
        />
        <Chip
          label={`${statusCounts.failed} failed`}
          color={statusCounts.failed > 0 ? "error" : "default"}
          size="small"
          variant="outlined"
        />
        <Chip
          label={`${statusCounts.paid} paid`}
          color="success"
          size="small"
          variant="outlined"
        />
        <Chip
          label="Next action: resolve uncertain outcomes before recollecting"
          size="small"
          variant="outlined"
        />
      </Stack>
      {!worklist.items.length ? (
        <p className="billing-clear-state">No collection activity yet.</p>
      ) : (
        <>
          <TableContainer className="billing-table-wrap">
            <Table
              size="small"
              aria-label="Collections and reconciliation worklist"
            >
              <TableHead>
                <TableRow>
                  <TableCell>Invoice</TableCell>
                  <TableCell>Patient</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Last updated</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Next action</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {worklist.items.map((item) => (
                  <TableRow key={item.id} hover>
                    <TableCell component="th" scope="row">
                      Invoice #{item.invoice_id}
                    </TableCell>
                    <TableCell>
                      {item.patient?.display_name ?? "Identity unavailable"}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant={
                          item.status === "needs_reconciliation"
                            ? "filled"
                            : "outlined"
                        }
                        color={
                          item.status === "paid"
                            ? "success"
                            : item.status === "failed"
                              ? "error"
                              : item.status === "needs_reconciliation"
                                ? "warning"
                                : "default"
                        }
                        label={collectionStatusLabels[item.status]}
                      />
                    </TableCell>
                    <TableCell>
                      {paymentDate(item.updated_at, data.practice.timezone)}
                    </TableCell>
                    <TableCell align="right">
                      {billingMoney(item.amount, item.currency)}
                    </TableCell>
                    <TableCell>
                      {collectionActionLabels[item.next_action]}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        onClick={() => onOpenInvoice(item.invoice_id)}
                      >
                        Open invoice
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <p className="billing-subtitle">
            Showing the latest {worklist.items.length} of {worklist.total_count}
            , limited to {worklist.limit} records.
          </p>
        </>
      )}
    </section>
  );
}

function monthLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 7)}-15T12:00:00Z`));
}

function paymentDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function BillingPayments({
  data,
  canOpenPatient,
}: {
  data: BillingWorkspaceData;
  canOpenPatient: boolean;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = data.payment_activity.find(
    (payment) => payment.id === selectedId,
  );
  return (
    <section className="clinic-card billing-payments-workspace">
      <div className="billing-section-heading">
        <div>
          <h2>Payments & receipts</h2>
          <p className="billing-subtitle">
            Open a payment to review its invoices, refunds and printable
            receipts. Amounts after refunds do not subtract Stripe processing or
            Meta Clinic application fees.
          </p>
        </div>
        {canOpenPatient && (
          <Button variant="outlined" href="/clinic/billing/patients">
            Find a patient payment
          </Button>
        )}
      </div>
      {!data.payment_activity.length ? (
        <div className="billing-empty-state">
          <h3>No recorded payments yet</h3>
          <p>
            Payments will appear here once they are recorded in the patient
            ledger.
          </p>
        </div>
      ) : (
        <>
          <TableContainer>
            <Table size="small" aria-label="Recorded payments">
              <TableHead>
                <TableRow>
                  <TableCell>Payment</TableCell>
                  <TableCell>Received</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Refunded</TableCell>
                  <TableCell align="right">After refunds</TableCell>
                  <TableCell>Receipt</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.payment_activity.map((payment) => {
                  const receipt = payment.receipts.find((item) =>
                    item.kind.endsWith("_payment"),
                  );
                  return (
                    <TableRow key={payment.id} hover>
                      <TableCell>
                        <Button onClick={() => setSelectedId(payment.id)}>
                          Payment #{payment.id}
                        </Button>
                      </TableCell>
                      <TableCell>
                        {paymentDate(
                          payment.created_at,
                          data.practice.timezone,
                        )}
                      </TableCell>
                      <TableCell>{payment.method}</TableCell>
                      <TableCell align="right">
                        {billingMoney(payment.amount, payment.currency)}
                      </TableCell>
                      <TableCell align="right">
                        {billingMoney(payment.refunded, payment.currency)}
                      </TableCell>
                      <TableCell align="right">
                        <strong>
                          {billingMoney(payment.net_amount, payment.currency)}
                        </strong>
                      </TableCell>
                      <TableCell>
                        {receipt ? (
                          <Button
                            startIcon={<PrintOutlinedIcon />}
                            href={`/api/clinic/payment_events/${payment.id}/receipt?receipt_id=${receipt.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Print receipt
                          </Button>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Not issued
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <p className="billing-subtitle">
            Latest {data.payment_activity.length} of {data.payment_count}{" "}
            payments. Each payment appears once, even when applied to multiple
            invoices.
            {data.payment_count > data.payment_activity.length
              ? " Older payments are available in the patient ledger."
              : ""}
          </p>
        </>
      )}
      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="billing-payment-title"
      >
        {selected && (
          <>
            <DialogTitle id="billing-payment-title">
              Payment #{selected.id}
            </DialogTitle>
            <DialogContent dividers>
              <Stack spacing={2.5}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Received ·{" "}
                    {paymentDate(selected.created_at, data.practice.timezone)}
                  </Typography>
                  <Typography variant="h4" component="p">
                    {billingMoney(selected.amount, selected.currency)}
                  </Typography>
                  <Typography variant="body2">{selected.method}</Typography>
                </Box>
                <Typography>
                  Refunded {billingMoney(selected.refunded, selected.currency)}{" "}
                  · After verified refunds{" "}
                  {billingMoney(selected.net_amount, selected.currency)}
                </Typography>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>
                    Applied to invoices
                  </Typography>
                  {selected.allocations.length ? (
                    selected.allocations.map((allocation, index) => (
                      <Typography
                        key={`${allocation.invoice_id}-${index}`}
                        variant="body2"
                      >
                        Invoice #{allocation.invoice_id} ·{" "}
                        {billingMoney(allocation.amount, selected.currency)}
                      </Typography>
                    ))
                  ) : (
                    <Typography variant="body2">
                      This payment has not been allocated to an invoice.
                    </Typography>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>Receipts</Typography>
                  {selected.receipts.length ? (
                    selected.receipts.map((receipt) => (
                      <Stack
                        key={receipt.id}
                        direction="row"
                        spacing={2}
                        sx={{
                          justifyContent: "space-between",
                          alignItems: "center",
                          py: 1,
                        }}
                      >
                        <Typography variant="body2">
                          {receipt.kind.endsWith("refund")
                            ? "Refund"
                            : "Payment"}{" "}
                          #{receipt.id} ·{" "}
                          {billingMoney(receipt.amount, selected.currency)}
                        </Typography>
                        <Button
                          startIcon={<PrintOutlinedIcon />}
                          href={`/api/clinic/payment_events/${selected.id}/receipt?receipt_id=${receipt.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Print receipt
                        </Button>
                      </Stack>
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No receipt was issued for this recorded payment.
                    </Typography>
                  )}
                </Box>
              </Stack>
            </DialogContent>
            <DialogActions>
              {canOpenPatient && (
                <Button
                  href={`/clinic/billing/patients?patient_id=${selected.patient_id}`}
                >
                  Open patient ledger
                </Button>
              )}
              <Button onClick={() => setSelectedId(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </section>
  );
}

export function BillingIncomeOutlook({ initial }: { initial: IncomeOutlook }) {
  const [start, setStart] = useState(initial.start_month.slice(0, 7));
  const [months, setMonths] = useState(initial.months);
  const [currency, setCurrency] = useState(
    initial.currencies[0]?.currency ?? "",
  );
  const [request, setRequest] = useState("");
  const resource = useResource<BillingWorkspaceData>(
    `/api/clinic/billing${request}`,
  );
  const outlook = resource.data?.income_outlook;
  const selected =
    outlook?.currencies.find((item) => item.currency === currency) ??
    outlook?.currencies[0];
  return (
    <section className="clinic-card billing-outlook">
      <div className="billing-section-heading">
        <div>
          <h2>Income outlook</h2>
          <p className="billing-subtitle">
            See the money already owed to you alongside an estimate of future
            business.
          </p>
        </div>
        <Chip label="Planning estimate" variant="outlined" />
      </div>
      <Box
        component="form"
        className="billing-outlook-controls"
        onSubmit={(event) => {
          event.preventDefault();
          setRequest(
            `?${new URLSearchParams({ outlook_start: start, outlook_months: String(months) })}`,
          );
        }}
      >
        <TextField
          type="month"
          label="Starting month"
          size="small"
          value={start}
          onChange={(event) => setStart(event.target.value)}
          required
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: initial.start_month.slice(0, 7) },
          }}
        />
        <TextField
          select
          label="Look ahead"
          size="small"
          value={months}
          onChange={(event) => setMonths(Number(event.target.value))}
        >
          {[3, 6, 12].map((value) => (
            <MenuItem key={value} value={value}>
              {value} months
            </MenuItem>
          ))}
        </TextField>
        {initial.currencies.length > 1 && (
          <TextField
            select
            label="Currency"
            size="small"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            {initial.currencies.map((item) => (
              <MenuItem key={item.currency} value={item.currency}>
                {item.currency}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Button type="submit" variant="contained">
          Update outlook
        </Button>
      </Box>
      {!outlook ? (
        <LoadState error={resource.error} />
      ) : !selected ? (
        <div className="billing-empty-state">
          <h3>Your outlook starts with your ledger</h3>
          <p>
            There are no posted invoices or payments to use yet. Record billing
            activity to see balances and historical trends here.
          </p>
        </div>
      ) : (
        <>
          <div className="billing-outlook-summary">
            <div>
              <span>Existing receivables</span>
              <strong>
                {billingMoney(selected.outstanding, selected.currency)}
              </strong>
              <small>Today's unpaid posted invoices, after credits</small>
            </div>
            <div>
              <span>Estimated new revenue / month</span>
              <strong>
                {selected.estimated_monthly_revenue === null
                  ? "Not enough history"
                  : billingMoney(
                      selected.estimated_monthly_revenue,
                      selected.currency,
                    )}
              </strong>
              <small>
                Average net charges across the last 3 completed months
              </small>
            </div>
          </div>
          <Alert severity="info" sx={{ my: 2 }}>
            Existing balances are assumed to be collected evenly across{" "}
            {outlook.months} months, starting {monthLabel(outlook.start_month)}.
            This assumes full recovery; invoice due dates and payment
            commitments are not available.
          </Alert>
          {selected.estimated_monthly_revenue === null ? (
            <Alert severity="warning" sx={{ mb: 2 }}>
              No posted invoices in the three completed baseline months. Future
              revenue is unavailable; this month's activity is not extrapolated.
            </Alert>
          ) : (
            selected.history.filter((month) => month.invoice_count > 0).length <
              3 && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Limited history: some baseline months have no recorded invoices
                and contribute zero to the average. Missing historical records
                can understate this estimate.
              </Alert>
            )
          )}
          <TableContainer>
            <Table aria-label="Monthly income outlook">
              <TableHead>
                <TableRow>
                  <TableCell>Month</TableCell>
                  <TableCell align="right">
                    Expected collections
                    <br />
                    <Typography variant="caption">
                      From existing balances
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    Estimated new revenue
                    <br />
                    <Typography variant="caption">
                      Future charges, not cash received
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selected.forecast.map((month) => (
                  <TableRow key={month.month}>
                    <TableCell component="th" scope="row">
                      {monthLabel(month.month)}
                    </TableCell>
                    <TableCell align="right">
                      {billingMoney(
                        month.expected_existing_collections,
                        selected.currency,
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {month.estimated_new_revenue === null
                        ? "Unavailable"
                        : billingMoney(
                            month.estimated_new_revenue,
                            selected.currency,
                          )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <p className="billing-subtitle">
            These columns measure different things and are not added together.
            No future receipts have been recorded. Existing receivables are
            spread once across the entire selected period.
          </p>
          <Accordion
            disableGutters
            elevation={0}
            variant="outlined"
            sx={{ mt: 3 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography sx={{ fontWeight: 600 }}>
                Forecast assumptions & historical basis
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Baseline: {monthLabel(outlook.history_start)} through{" "}
                {monthLabel(
                  selected.history[selected.history.length - 1].month,
                )}{" "}
                · {selected.history_invoice_count} posted invoices. New revenue
                uses charges on invoices created in these months, less their
                recorded credits, divided by three (including months with zero
                activity). Invoice creation dates are used because a separate
                posting date is unavailable. This is a flat scenario with no
                growth or seasonality assumption. Drafts, void invoices,
                unpriced appointments and automatic subscription renewals are
                excluded. Existing subscription invoices are already in the
                ledger and are not added again. Estimates are not profit or
                guaranteed collections. Collected amounts are before Stripe
                processing and Meta Clinic application fees.
              </Typography>
              <TableContainer>
                <Table size="small" aria-label="Recorded baseline history">
                  <TableHead>
                    <TableRow>
                      <TableCell>Completed month</TableCell>
                      <TableCell align="right">Net charges</TableCell>
                      <TableCell align="right">Received</TableCell>
                      <TableCell align="right">Refunded</TableCell>
                      <TableCell align="right">
                        Collected after refunds
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selected.history.map((month) => (
                      <TableRow key={month.month}>
                        <TableCell>{monthLabel(month.month)}</TableCell>
                        <TableCell align="right">
                          {billingMoney(month.net_charges, selected.currency)}
                        </TableCell>
                        <TableCell align="right">
                          {billingMoney(month.received, selected.currency)}
                        </TableCell>
                        <TableCell align="right">
                          {billingMoney(month.refunded, selected.currency)}
                        </TableCell>
                        <TableCell align="right">
                          {billingMoney(month.net_collected, selected.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        </>
      )}
    </section>
  );
}
