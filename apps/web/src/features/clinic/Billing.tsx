import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SearchIcon from "@mui/icons-material/Search";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Paper,
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
import { useEffect, useMemo, useState } from "react";
import type { BillingPatientLedger, Patient } from "../../api/contracts";
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";

function money(value: string, currency: string) {
  const [whole, fraction = ""] = value.split(".");
  return `${currency} ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}

function date(value: string, includeTime = false) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(new Date(value));
}

function isZero(value: string) {
  return /^0+(?:\.0+)?$/.test(value);
}

function invoiceState(invoice: BillingPatientLedger["invoices"][number]) {
  if (invoice.status === "void") return "Void";
  if (invoice.status === "draft") return "Draft";
  if (isZero(invoice.balance_amount)) return "Paid";
  if (isZero(invoice.allocated_amount) && isZero(invoice.credit_amount))
    return "Open";
  return "Partially settled";
}

function stateColor(state: ReturnType<typeof invoiceState>) {
  if (state === "Paid") return "success" as const;
  if (state === "Open" || state === "Partially settled")
    return "warning" as const;
  return "default" as const;
}

export function Billing() {
  const { capabilities } = useClinic();
  const [query, setQuery] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(
    null,
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(
    null,
  );
  const patients = useResource<{ patients?: Patient[] }>(
    `/api/clinic/patients/lookup${query ? `?q=${encodeURIComponent(query)}` : ""}`,
  );
  const [ledger, setLedger] = useState<{
    data?: BillingPatientLedger;
    error?: string;
  }>({});

  useEffect(() => {
    if (!selectedPatientId) {
      setLedger({});
      setSelectedInvoiceId(null);
      return;
    }
    let active = true;
    setLedger({});
    api<BillingPatientLedger>(
      `/api/clinic/patients/${selectedPatientId}/billing_ledger`,
    )
      .then((data) => {
        if (active) {
          setLedger({ data });
          setSelectedInvoiceId(data.invoices[0]?.id ?? null);
        }
      })
      .catch((error: unknown) => {
        if (active)
          setLedger({
            error:
              error instanceof Error
                ? error.message
                : "Unable to load this patient ledger.",
          });
      });
    return () => {
      active = false;
    };
  }, [selectedPatientId]);

  const matches = useMemo(
    () =>
      (patients.data?.patients ?? []).filter((patient) =>
        `${patient.display_name} ${patient.reference}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [patients.data, query],
  );
  const selectedInvoice = ledger.data?.invoices.find(
    (invoice) => invoice.id === selectedInvoiceId,
  );
  if (capabilities.billing_read !== true)
    return <LoadState error="Billing is unavailable for this account." />;

  return (
    <Box sx={{ display: "grid", gap: 3 }}>
      <Box>
        <Typography variant="h1">Patient balances</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: "72ch", mt: 1 }}>
          Review the recorded invoice, allocation, credit, and refund history
          for one patient. This is a read-only view of the existing ledger.
        </Typography>
      </Box>
      <Box
        sx={{
          display: "grid",
          gap: 3,
          gridTemplateColumns: { lg: "minmax(260px, 0.75fr) minmax(0, 2fr)" },
        }}
      >
        <Paper
          component="section"
          variant="outlined"
          sx={{ alignSelf: "start" }}
        >
          <Box sx={{ p: 2.5 }}>
            <Typography component="h2" variant="h2">
              Find a patient
            </Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
              Search by the clinic reference or recorded name.
            </Typography>
            <TextField
              fullWidth
              label="Search patients"
              margin="normal"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Reference or name"
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
              }}
              value={query}
            />
          </Box>
          <Divider />
          {!patients.data ? (
            <Box sx={{ display: "grid", placeItems: "center", minHeight: 120 }}>
              {patients.error ? (
                <Alert severity="error">{patients.error}</Alert>
              ) : (
                <CircularProgress aria-label="Loading patients" size={28} />
              )}
            </Box>
          ) : matches.length === 0 ? (
            <Typography color="text.secondary" sx={{ p: 2.5 }}>
              No matching patients were returned.
            </Typography>
          ) : (
            <List aria-label="Matching patients" disablePadding>
              {matches.map((patient) => (
                <ListItemButton
                  key={patient.id}
                  onClick={() => setSelectedPatientId(patient.id)}
                  selected={selectedPatientId === patient.id}
                  sx={{ alignItems: "flex-start", px: 2.5, py: 1.5 }}
                >
                  <ListItemText
                    primary={patient.display_name}
                    secondary={patient.reference}
                    slotProps={{
                      primary: { sx: { fontWeight: 650 } },
                      secondary: { sx: { fontVariantNumeric: "tabular-nums" } },
                    }}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Paper>
        <Box component="section" aria-live="polite">
          {!selectedPatientId ? (
            <Paper
              variant="outlined"
              sx={{
                display: "grid",
                gap: 1.5,
                minHeight: 280,
                placeContent: "center",
                p: 4,
                textAlign: "center",
              }}
            >
              <AccountBalanceWalletOutlinedIcon
                color="primary"
                sx={{ fontSize: 34, justifySelf: "center" }}
              />
              <Typography component="h2" variant="h2">
                Choose a patient ledger
              </Typography>
              <Typography color="text.secondary">
                Balances and payment history stay scoped to the selected
                patient.
              </Typography>
            </Paper>
          ) : ledger.error ? (
            <Alert severity="error">{ledger.error}</Alert>
          ) : !ledger.data ? (
            <Paper
              variant="outlined"
              sx={{ display: "grid", minHeight: 280, placeItems: "center" }}
            >
              <CircularProgress aria-label="Loading patient ledger" />
            </Paper>
          ) : (
            <LedgerDetails
              ledger={ledger.data}
              selectedInvoice={selectedInvoice}
              selectInvoice={setSelectedInvoiceId}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

function LedgerDetails({
  ledger,
  selectedInvoice,
  selectInvoice,
}: {
  ledger: BillingPatientLedger;
  selectedInvoice?: BillingPatientLedger["invoices"][number];
  selectInvoice: (id: number) => void;
}) {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h2" variant="h2">
          {ledger.patient.display_name}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          Clinic reference · {ledger.patient.reference}
        </Typography>
      </Box>
      {ledger.currencies.length === 0 ? (
        <Alert severity="info">
          No invoice or payment activity has been recorded for this patient.
        </Alert>
      ) : (
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: {
              sm: "repeat(2, minmax(0, 1fr))",
              xl: "repeat(3, minmax(0, 1fr))",
            },
          }}
        >
          {ledger.currencies.map((currency) => (
            <Paper key={currency.currency} variant="outlined" sx={{ p: 2 }}>
              <Typography color="text.secondary" variant="body2">
                {currency.currency} outstanding
              </Typography>
              <Typography
                sx={{
                  fontVariantNumeric: "tabular-nums",
                  fontWeight: 700,
                  mt: 0.5,
                }}
                variant="h2"
              >
                {money(currency.balance_amount, currency.currency)}
              </Typography>
              <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>
                Allocated {money(currency.allocated_amount, currency.currency)}{" "}
                · Credits {money(currency.credited_amount, currency.currency)}
              </Typography>
            </Paper>
          ))}
        </Box>
      )}
      <Paper variant="outlined">
        <Box sx={{ p: 2.5 }}>
          <Typography component="h2" variant="h2">
            Invoice ledger
          </Typography>
          <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
            Select an invoice to inspect its recorded line items and settlement
            entries.
          </Typography>
        </Box>
        {ledger.invoices.length === 0 ? (
          <Typography color="text.secondary" sx={{ px: 2.5, pb: 2.5 }}>
            No invoices were returned for this patient.
          </Typography>
        ) : (
          <TableContainer sx={{ maxWidth: "100%" }}>
            <Table
              aria-label="Patient invoice ledger"
              size="small"
              sx={{
                minWidth: 690,
                "& .MuiTableCell-root": { fontVariantNumeric: "tabular-nums" },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>Invoice</TableCell>
                  <TableCell>State</TableCell>
                  <TableCell>Recorded</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Settled</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ledger.invoices.map((invoice) => {
                  const state = invoiceState(invoice);
                  return (
                    <TableRow
                      hover
                      key={invoice.id}
                      selected={selectedInvoice?.id === invoice.id}
                      sx={{ cursor: "pointer" }}
                      onClick={() => selectInvoice(invoice.id)}
                    >
                      <TableCell component="th" scope="row">
                        <Typography color="primary" sx={{ fontWeight: 700 }}>
                          #{invoice.id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          color={stateColor(state)}
                          label={state}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{date(invoice.created_at)}</TableCell>
                      <TableCell align="right">
                        {money(invoice.total_amount, invoice.currency)}
                      </TableCell>
                      <TableCell align="right">
                        {money(invoice.allocated_amount, invoice.currency)}
                      </TableCell>
                      <TableCell align="right">
                        {money(invoice.balance_amount, invoice.currency)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      {selectedInvoice && <InvoiceDetail invoice={selectedInvoice} />}
      <PaymentHistory payments={ledger.payments} />
    </Stack>
  );
}

function InvoiceDetail({
  invoice,
}: {
  invoice: BillingPatientLedger["invoices"][number];
}) {
  return (
    <Paper component="section" variant="outlined">
      <Box
        sx={{
          alignItems: { sm: "center" },
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          gap: 1.5,
          justifyContent: "space-between",
          p: 2.5,
        }}
      >
        <Box>
          <Typography component="h2" variant="h2">
            Invoice #{invoice.id}
          </Typography>
          <Typography color="text.secondary" variant="body2">
            Recorded {date(invoice.created_at, true)}
          </Typography>
        </Box>
        <Chip
          color={stateColor(invoiceState(invoice))}
          label={invoiceState(invoice)}
          variant="outlined"
        />
      </Box>
      <Divider />
      <Box
        sx={{
          display: "grid",
          gap: 3,
          gridTemplateColumns: { md: "minmax(0, 1.2fr) minmax(250px, 0.8fr)" },
          p: 2.5,
        }}
      >
        <Box>
          <Typography sx={{ fontWeight: 700 }} variant="body1">
            Recorded line items
          </Typography>
          <List disablePadding sx={{ mt: 1 }}>
            {invoice.lines.map((line) => (
              <Box
                component="li"
                key={line.id}
                sx={{
                  display: "flex",
                  gap: 2,
                  justifyContent: "space-between",
                  listStyle: "none",
                  py: 1,
                }}
              >
                <Typography>
                  {line.description}{" "}
                  <Typography
                    color="text.secondary"
                    component="span"
                    variant="body2"
                  >
                    · Qty {line.quantity}
                  </Typography>
                </Typography>
                <Typography
                  sx={{
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {money(line.posted_amount, invoice.currency)}
                </Typography>
              </Box>
            ))}
          </List>
        </Box>
        <Stack divider={<Divider flexItem />} spacing={1.5}>
          <LedgerAmount
            label="Payments allocated"
            value={invoice.allocated_amount}
            currency={invoice.currency}
            entries={invoice.allocations}
          />
          <LedgerAmount
            label="Credits"
            value={invoice.credit_amount}
            currency={invoice.currency}
            entries={invoice.credits}
          />
          <Box>
            <Typography color="text.secondary" variant="body2">
              Remaining balance
            </Typography>
            <Typography
              sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}
            >
              {money(invoice.balance_amount, invoice.currency)}
            </Typography>
          </Box>
        </Stack>
      </Box>
    </Paper>
  );
}

function LedgerAmount({
  label,
  value,
  currency,
  entries,
}: {
  label: string;
  value: string;
  currency: string;
  entries: { id: number; amount: string; created_at: string }[];
}) {
  return (
    <Box>
      <Typography color="text.secondary" variant="body2">
        {label}
      </Typography>
      <Typography sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
        {money(value, currency)}
      </Typography>
      {entries.length === 0 ? (
        <Typography color="text.secondary" variant="body2">
          None recorded.
        </Typography>
      ) : (
        entries.map((entry) => (
          <Typography key={entry.id} color="text.secondary" variant="body2">
            {money(entry.amount, currency)} · {date(entry.created_at, true)}
          </Typography>
        ))
      )}
    </Box>
  );
}

function PaymentHistory({
  payments,
}: {
  payments: BillingPatientLedger["payments"];
}) {
  return (
    <Paper component="section" variant="outlined">
      <Box sx={{ alignItems: "center", display: "flex", gap: 1, p: 2.5 }}>
        <ReceiptLongOutlinedIcon color="primary" />
        <Typography component="h2" variant="h2">
          Payment and refund history
        </Typography>
      </Box>
      <Divider />
      {payments.length === 0 ? (
        <Typography color="text.secondary" sx={{ p: 2.5 }}>
          No payment events were returned for this patient.
        </Typography>
      ) : (
        <List disablePadding>
          {payments.map((payment) => (
            <Box
              component="li"
              key={payment.id}
              sx={{ listStyle: "none", p: 2.5 }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                sx={{ justifyContent: "space-between" }}
              >
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>
                    {money(payment.amount, payment.currency)}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Recorded {date(payment.created_at, true)}
                  </Typography>
                </Box>
                <Typography color="text.secondary" variant="body2">
                  {payment.allocations.length} allocation
                  {payment.allocations.length === 1 ? "" : "s"}
                </Typography>
              </Stack>
              {payment.refunds.length > 0 && (
                <Alert severity="info" sx={{ mt: 1.5 }}>
                  Refund history:{" "}
                  {payment.refunds
                    .map(
                      (refund) =>
                        `${money(refund.amount, payment.currency)} on ${date(refund.created_at, true)}`,
                    )
                    .join("; ")}
                  . Refunds are payment-level history and do not alter invoice
                  balances in this ledger view.
                </Alert>
              )}
            </Box>
          ))}
        </List>
      )}
    </Paper>
  );
}
