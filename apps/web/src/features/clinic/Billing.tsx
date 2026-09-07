import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SearchIcon from "@mui/icons-material/Search";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
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
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BillingInvoiceDetail,
  BillingPatientLedger,
  Patient,
} from "../../api/contracts";
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

function queryId(name: string) {
  const value = new URLSearchParams(window.location.search).get(name);
  return value &&
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
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
    () => queryId("patient_id"),
  );
  const [checkoutEncounterId] = useState<number | null>(() =>
    queryId("encounter_id"),
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(
    null,
  );
  const [reloadLedger, setReloadLedger] = useState(0);
  const patients = useResource<{ patients?: Patient[] }>(
    `/api/clinic/patients/lookup${query ? `?q=${encodeURIComponent(query)}` : ""}`,
  );
  const [ledger, setLedger] = useState<{
    data?: BillingPatientLedger;
    error?: string;
  }>({});
  const [checkoutInvoice, setCheckoutInvoice] = useState<{
    active?: Pick<BillingInvoiceDetail, "id" | "encounter_id" | "status">;
    voided?: Pick<BillingInvoiceDetail, "id" | "encounter_id" | "status">;
    error?: string;
    checking?: boolean;
  }>(() => ({ checking: checkoutEncounterId !== null }));

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
          setSelectedInvoiceId((current) =>
            current && data.invoices.some((invoice) => invoice.id === current)
              ? current
              : (data.invoices[0]?.id ?? null),
          );
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
  }, [reloadLedger, selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId || !checkoutEncounterId) {
      setCheckoutInvoice({});
      return;
    }
    let active = true;
    setCheckoutInvoice({ checking: true });
    api<{
      invoices: Pick<BillingInvoiceDetail, "id" | "encounter_id" | "status">[];
    }>(
      `/api/clinic/patients/${selectedPatientId}/invoices?encounter_id=${checkoutEncounterId}`,
    )
      .then(({ invoices }) => {
        if (!active) return;
        const linked = invoices.filter(
          (invoice) => invoice.encounter_id === checkoutEncounterId,
        );
        const activeInvoice = linked.find(
          (invoice) => invoice.status !== "void",
        );
        setCheckoutInvoice({
          active: activeInvoice,
          voided: linked.find((invoice) => invoice.status === "void"),
        });
        if (activeInvoice) setSelectedInvoiceId(activeInvoice.id);
      })
      .catch((error: unknown) => {
        if (active)
          setCheckoutInvoice({
            error:
              error instanceof Error
                ? error.message
                : "Unable to verify this encounter's checkout invoice.",
          });
      });
    return () => {
      active = false;
    };
  }, [checkoutEncounterId, reloadLedger, selectedPatientId]);

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
          for one patient. Authorized billing staff can also start a draft
          invoice from this ledger.
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
              {checkoutEncounterId
                ? "Patient selection is fixed to this completed encounter."
                : "Search by the clinic reference or recorded name."}
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
                  disabled={
                    checkoutEncounterId !== null &&
                    patient.id !== selectedPatientId
                  }
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
              canDraft={capabilities.billing_invoice_draft === true}
              checkoutEncounterId={checkoutEncounterId}
              checkoutInvoice={checkoutInvoice}
              onFinancialChange={(invoiceId) => {
                if (invoiceId) setSelectedInvoiceId(invoiceId);
                setReloadLedger((version) => version + 1);
              }}
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
  canDraft,
  checkoutEncounterId,
  checkoutInvoice,
  onFinancialChange,
}: {
  ledger: BillingPatientLedger;
  selectedInvoice?: BillingPatientLedger["invoices"][number];
  selectInvoice: (id: number) => void;
  canDraft: boolean;
  checkoutEncounterId: number | null;
  checkoutInvoice: {
    active?: Pick<BillingInvoiceDetail, "id" | "encounter_id" | "status">;
    voided?: Pick<BillingInvoiceDetail, "id" | "encounter_id" | "status">;
    error?: string;
    checking?: boolean;
  };
  onFinancialChange: (invoiceId?: number) => void;
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
      {checkoutEncounterId && checkoutInvoice.error && (
        <Alert severity="error">{checkoutInvoice.error}</Alert>
      )}
      {checkoutEncounterId && checkoutInvoice.checking && (
        <Alert severity="info">
          Verifying this encounter's checkout invoice…
        </Alert>
      )}
      {checkoutEncounterId && checkoutInvoice.active && (
        <Alert severity="info">
          Encounter #{checkoutEncounterId} is linked to active invoice #
          {checkoutInvoice.active.id}. Review or continue that invoice below.
        </Alert>
      )}
      {checkoutEncounterId &&
        checkoutInvoice.voided &&
        !checkoutInvoice.active && (
          <Alert severity="info">
            The prior checkout invoice for encounter #{checkoutEncounterId} was
            voided. A new draft will be recorded as its replacement.
          </Alert>
        )}
      {checkoutEncounterId &&
        !canDraft &&
        !checkoutInvoice.active &&
        !checkoutInvoice.error &&
        !checkoutInvoice.checking && (
          <Alert severity="warning">
            This account can review billing but cannot create a checkout draft.
          </Alert>
        )}
      {canDraft &&
        !checkoutInvoice.active &&
        !checkoutInvoice.error &&
        !checkoutInvoice.checking && (
          <DraftInvoiceForm
            patientId={ledger.patient.id}
            encounterId={checkoutEncounterId}
            onCreated={onFinancialChange}
          />
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
      {selectedInvoice?.status === "draft" && canDraft && (
        <DraftInvoiceEditor
          invoice={selectedInvoice}
          onSaved={onFinancialChange}
        />
      )}
      <PaymentHistory
        payments={ledger.payments}
        invoices={ledger.invoices}
        onFinancialChange={onFinancialChange}
      />
    </Stack>
  );
}

function DraftInvoiceForm({
  patientId,
  encounterId,
  onCreated,
}: {
  patientId: number;
  encounterId: number | null;
  onCreated: (invoiceId: number) => void;
}) {
  const [currency, setCurrency] = useState("USD");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitAmount, setUnitAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestKeyRef = useRef<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const decimal = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/;
    if (!/^[A-Z]{3}$/.test(currency)) {
      setError("Use a three-letter uppercase currency code.");
      return;
    }
    if (!decimal.test(quantity) || Number(quantity) <= 0) {
      setError("Enter a positive quantity with up to six decimal places.");
      return;
    }
    if (!decimal.test(unitAmount) || Number(unitAmount) < 0) {
      setError(
        "Enter a non-negative unit amount with up to six decimal places.",
      );
      return;
    }
    if (!description.trim()) {
      setError("Enter a line-item description.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const retryKey = requestKeyRef.current || crypto.randomUUID();
    requestKeyRef.current = retryKey;
    try {
      const result = await api<{
        invoice: Pick<BillingInvoiceDetail, "id" | "encounter_id">;
        replayed: boolean;
      }>(`/api/clinic/patients/${patientId}/invoices`, {
        method: "POST",
        body: {
          invoice: {
            currency,
            ...(encounterId ? { encounter_id: encounterId } : {}),
            request_key: retryKey,
            lines: [
              {
                quantity: quantity.trim(),
                unit_amount: unitAmount.trim(),
                description_snapshot: description.trim(),
              },
            ],
          },
        },
      });
      if (encounterId && result.invoice.encounter_id !== encounterId) {
        throw new Error(
          "The saved invoice did not match this encounter. Review the billing ledger before trying again.",
        );
      }
      setDescription("");
      setQuantity("1");
      setUnitAmount("");
      requestKeyRef.current = null;
      setNotice(
        result.replayed
          ? `Checkout invoice #${result.invoice.id} was already recorded and has been reopened.`
          : `${encounterId ? "Checkout draft" : "Draft invoice"} #${result.invoice.id} created.`,
      );
      onCreated(result.invoice.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The draft invoice could not be created.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper component="section" variant="outlined" sx={{ p: 2.5 }}>
      <Typography component="h2" variant="h2">
        {encounterId
          ? `Start checkout for encounter #${encounterId}`
          : "Start a draft invoice"}
      </Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
        Enter the confirmed billable lines. The clinic does not infer prices
        from the visit record. Posting remains a separate protected action.
      </Typography>
      <Box
        component="form"
        onSubmit={(event) => void submit(event)}
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr 2fr auto" },
          mt: 2,
        }}
      >
        <TextField
          label="Currency"
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          slotProps={{
            htmlInput: {
              maxLength: 3,
              style: { textTransform: "uppercase" },
            },
          }}
          value={currency}
        />
        <TextField
          label="Quantity"
          inputMode="decimal"
          onChange={(event) => setQuantity(event.target.value)}
          value={quantity}
        />
        <TextField
          label="Unit amount"
          inputMode="decimal"
          onChange={(event) => setUnitAmount(event.target.value)}
          value={unitAmount}
        />
        <TextField
          label="Line description"
          onChange={(event) => setDescription(event.target.value)}
          value={description}
        />
        <Button disabled={busy} type="submit" variant="contained">
          {busy
            ? "Creating…"
            : encounterId
              ? "Create checkout draft"
              : "Create draft"}
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mt: 1.5 }}>
          {notice}
        </Alert>
      )}
    </Paper>
  );
}

function DraftInvoiceEditor({
  invoice,
  onSaved,
}: {
  invoice: BillingPatientLedger["invoices"][number];
  onSaved: () => void;
}) {
  const [currency, setCurrency] = useState(invoice.currency);
  const [quantity, setQuantity] = useState(invoice.lines[0]?.quantity ?? "1");
  const [unitAmount, setUnitAmount] = useState(
    invoice.lines[0]?.posted_amount ?? "",
  );
  const [description, setDescription] = useState(
    invoice.lines[0]?.description ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !/^[A-Z]{3}$/.test(currency) ||
      !quantity ||
      !unitAmount ||
      !description.trim()
    ) {
      setError("Enter a currency, quantity, unit amount, and description.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/api/clinic/invoices/${invoice.id}/draft`, {
        method: "PATCH",
        body: {
          invoice: {
            currency,
            lines: [
              {
                quantity,
                unit_amount: unitAmount,
                description_snapshot: description.trim(),
              },
            ],
          },
        },
      });
      onSaved();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The draft could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper component="section" variant="outlined" sx={{ p: 2.5 }}>
      <Typography component="h2" variant="h2">
        Edit draft invoice #{invoice.id}
      </Typography>
      <Box
        component="form"
        onSubmit={(event) => void submit(event)}
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr 2fr auto" },
          mt: 2,
        }}
      >
        <TextField
          label="Currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
        />
        <TextField
          label="Quantity"
          inputMode="decimal"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <TextField
          label="Unit amount"
          inputMode="decimal"
          value={unitAmount}
          onChange={(event) => setUnitAmount(event.target.value)}
        />
        <TextField
          label="Line description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button disabled={busy} type="submit" variant="contained">
          {busy ? "Saving…" : "Save draft"}
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}
    </Paper>
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
  invoices,
  onFinancialChange,
}: {
  payments: BillingPatientLedger["payments"];
  invoices: BillingPatientLedger["invoices"];
  onFinancialChange: () => void;
}) {
  const { capabilities } = useClinic();
  const [refundPaymentId, setRefundPaymentId] = useState<number | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundError, setRefundError] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [allocationPaymentId, setAllocationPaymentId] = useState<number | null>(
    null,
  );
  const [allocationInvoiceId, setAllocationInvoiceId] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const [allocationRequestKey, setAllocationRequestKey] = useState("");
  const [allocationError, setAllocationError] = useState("");
  const [allocationBusy, setAllocationBusy] = useState(false);

  const eligibleInvoices = (
    payment: BillingPatientLedger["payments"][number],
  ) =>
    invoices.filter(
      (invoice) =>
        invoice.status === "posted" &&
        invoice.currency === payment.currency &&
        !isZero(invoice.balance_amount),
    );

  const allocatePayment = async (paymentId: number) => {
    if (
      !allocationInvoiceId ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(allocationAmount) ||
      isZero(allocationAmount)
    ) {
      setAllocationError(
        "Choose an invoice and enter a positive amount with up to six decimal places.",
      );
      return;
    }
    setAllocationBusy(true);
    setAllocationError("");
    const requestKey = allocationRequestKey || crypto.randomUUID();
    setAllocationRequestKey(requestKey);
    try {
      await api(`/api/clinic/payment_events/${paymentId}/allocations`, {
        method: "POST",
        body: {
          allocation: {
            invoice_id: Number(allocationInvoiceId),
            amount: allocationAmount.trim(),
            request_key: requestKey,
          },
        },
      });
      setAllocationPaymentId(null);
      setAllocationInvoiceId("");
      setAllocationAmount("");
      setAllocationRequestKey("");
      onFinancialChange();
    } catch (reason) {
      setAllocationError(
        reason instanceof Error
          ? reason.message
          : "The payment remainder could not be allocated.",
      );
    } finally {
      setAllocationBusy(false);
    }
  };

  const refundCash = async (paymentId: number) => {
    if (
      !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(refundAmount) ||
      isZero(refundAmount)
    ) {
      setRefundError(
        "Enter a positive cash refund amount with up to six decimal places.",
      );
      return;
    }
    setRefundBusy(true);
    setRefundError("");
    try {
      await api(`/api/clinic/payment_events/${paymentId}/cash_refunds`, {
        method: "POST",
        body: { cash_refund: { amount: refundAmount } },
      });
      setRefundAmount("");
      setRefundPaymentId(null);
      onFinancialChange();
    } catch (reason) {
      setRefundError(
        reason instanceof Error
          ? reason.message
          : "The cash refund could not be recorded.",
      );
    } finally {
      setRefundBusy(false);
    }
  };

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
                  {` · Unapplied ${money(payment.unapplied_amount, payment.currency)}`}
                </Typography>
              </Stack>
              {!isZero(payment.unapplied_amount) && (
                <Typography color="warning.main" variant="body2" sx={{ mt: 1 }}>
                  Unapplied remainder:{" "}
                  {money(payment.unapplied_amount, payment.currency)}
                </Typography>
              )}
              {!isZero(payment.unapplied_amount) &&
                capabilities.billing_payment_record === true &&
                eligibleInvoices(payment).length > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    {allocationPaymentId === payment.id ? (
                      <Stack
                        component="form"
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void allocatePayment(payment.id);
                        }}
                      >
                        <TextField
                          select
                          label="Apply to invoice"
                          value={allocationInvoiceId}
                          onChange={(event) => {
                            setAllocationInvoiceId(event.target.value);
                            setAllocationRequestKey("");
                          }}
                          sx={{ minWidth: 190 }}
                        >
                          {eligibleInvoices(payment).map((invoice) => (
                            <MenuItem key={invoice.id} value={invoice.id}>
                              #{invoice.id} ·{" "}
                              {money(invoice.balance_amount, invoice.currency)}{" "}
                              due
                            </MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          label="Amount"
                          inputMode="decimal"
                          value={allocationAmount}
                          onChange={(event) => {
                            setAllocationAmount(event.target.value);
                            setAllocationRequestKey("");
                          }}
                        />
                        <Button
                          disabled={allocationBusy}
                          type="submit"
                          variant="contained"
                        >
                          {allocationBusy ? "Allocating…" : "Allocate"}
                        </Button>
                        <Button
                          disabled={allocationBusy}
                          onClick={() => {
                            setAllocationPaymentId(null);
                            setAllocationError("");
                          }}
                        >
                          Cancel
                        </Button>
                      </Stack>
                    ) : (
                      <Button
                        onClick={() => {
                          setAllocationError("");
                          setAllocationPaymentId(payment.id);
                          setAllocationInvoiceId(
                            String(eligibleInvoices(payment)[0].id),
                          );
                          setAllocationAmount(payment.unapplied_amount);
                          setAllocationRequestKey("");
                        }}
                        variant="outlined"
                      >
                        Allocate remainder
                      </Button>
                    )}
                    {allocationError && allocationPaymentId === payment.id && (
                      <Alert severity="error" sx={{ mt: 1 }}>
                        {allocationError}
                      </Alert>
                    )}
                  </Box>
                )}
              {payment.cash_payment && (
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{ mt: 1.5 }}
                >
                  {payment.receipt_available && (
                    <Button
                      component="a"
                      href={`/api/clinic/payment_events/${payment.id}/receipt`}
                      rel="noopener"
                      target="_blank"
                      variant="outlined"
                    >
                      Print receipt
                    </Button>
                  )}
                  {capabilities.billing_payment_record === true && (
                    <Button
                      onClick={() => {
                        setRefundError("");
                        setRefundPaymentId(payment.id);
                      }}
                      variant="outlined"
                    >
                      Refund cash
                    </Button>
                  )}
                </Stack>
              )}
              {refundPaymentId === payment.id && (
                <Stack
                  component="form"
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{ mt: 1.5 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void refundCash(payment.id);
                  }}
                >
                  <TextField
                    autoFocus
                    label="Cash refund amount"
                    inputMode="decimal"
                    onChange={(event) => setRefundAmount(event.target.value)}
                    value={refundAmount}
                  />
                  <Button
                    disabled={refundBusy}
                    type="submit"
                    variant="contained"
                  >
                    {refundBusy ? "Recording…" : "Record refund"}
                  </Button>
                  <Button
                    onClick={() => setRefundPaymentId(null)}
                    type="button"
                  >
                    Cancel
                  </Button>
                </Stack>
              )}
              {refundPaymentId === payment.id && refundError && (
                <Alert severity="error" sx={{ mt: 1.5 }}>
                  {refundError}
                </Alert>
              )}
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
