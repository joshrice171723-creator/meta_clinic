import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SearchIcon from "@mui/icons-material/Search";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  BillingInvoiceSummary,
  BillingPatientLedger,
  ClinicWorkspaceContext,
  Patient,
} from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import {
  CashDrawerOperations,
  hasPendingCashAttempt,
} from "./CashDrawerOperations";
import {
  customInvoiceLine,
  invoiceLineIsValid,
  InvoiceLineEditor,
  type InvoiceLineDraft,
} from "./InvoiceLineEditor";
import { patientReferenceLabel } from "./patientReference";
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

type CashRefundAttempt = {
  patientId: number;
  paymentId: number;
  amount: string;
  requestKey: string;
};

type CashRefundScope = Pick<
  ClinicWorkspaceContext,
  "practice" | "user_id" | "membership_id"
>;

// Keep an uncertain refund available across in-app navigation without writing
// patient financial data to browser storage.
const pendingCashRefundAttempts = new Map<string, CashRefundAttempt>();
function cashRefundScopeKey(scope: CashRefundScope) {
  return `${scope.practice.id}:${scope.user_id}:${scope.membership_id}`;
}
function persistCashRefundAttempt(
  scope: CashRefundScope,
  attempt: CashRefundAttempt | null,
) {
  const key = cashRefundScopeKey(scope);
  if (attempt) pendingCashRefundAttempts.set(key, attempt);
  else pendingCashRefundAttempts.delete(key);
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
    setLedger((current) =>
      current.data?.patient.id === selectedPatientId ? current : {},
    );
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
          setLedger((current) => ({
            ...(current.data?.patient.id === selectedPatientId
              ? { data: current.data }
              : {}),
            error:
              error instanceof Error
                ? error.message
                : "Unable to load this patient ledger.",
          }));
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
                    secondary={
                      patientReferenceLabel(patient.reference) ?? undefined
                    }
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
          ) : ledger.error && !ledger.data ? (
            <Alert severity="error">{ledger.error}</Alert>
          ) : !ledger.data ? (
            <Paper
              variant="outlined"
              sx={{ display: "grid", minHeight: 280, placeItems: "center" }}
            >
              <CircularProgress aria-label="Loading patient ledger" />
            </Paper>
          ) : (
            <Stack spacing={2}>
              {ledger.error && <Alert severity="error">{ledger.error}</Alert>}
              <LedgerDetails
                ledger={ledger.data}
                selectedInvoice={selectedInvoice}
                selectInvoice={setSelectedInvoiceId}
                selectPatient={setSelectedPatientId}
                canDraft={capabilities.billing_invoice_draft === true}
                canPost={capabilities.billing_invoice_post === true}
                checkoutEncounterId={checkoutEncounterId}
                checkoutInvoice={checkoutInvoice}
                financialRevision={reloadLedger}
                onFinancialChange={(invoiceId) => {
                  if (invoiceId) setSelectedInvoiceId(invoiceId);
                  setReloadLedger((version) => version + 1);
                }}
              />
            </Stack>
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
  selectPatient,
  canDraft,
  canPost,
  checkoutEncounterId,
  checkoutInvoice,
  financialRevision,
  onFinancialChange,
}: {
  ledger: BillingPatientLedger;
  selectedInvoice?: BillingPatientLedger["invoices"][number];
  selectInvoice: (id: number) => void;
  selectPatient: (id: number) => void;
  canDraft: boolean;
  canPost: boolean;
  checkoutEncounterId: number | null;
  checkoutInvoice: {
    active?: Pick<BillingInvoiceDetail, "id" | "encounter_id" | "status">;
    voided?: Pick<BillingInvoiceDetail, "id" | "encounter_id" | "status">;
    error?: string;
    checking?: boolean;
  };
  financialRevision: number;
  onFinancialChange: (invoiceId?: number) => void;
}) {
  const referenceLabel = patientReferenceLabel(ledger.patient.reference);
  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h2" variant="h2">
          {ledger.patient.display_name}
        </Typography>
        {referenceLabel && (
          <Typography color="text.secondary" variant="body2">
            Clinic reference · {referenceLabel}
          </Typography>
        )}
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
      <CheckoutSettlement
        invoice={selectedInvoice}
        canPost={canPost}
        financialRevision={financialRevision}
        onFinancialChange={onFinancialChange}
      />
      <PaymentHistory
        patientId={ledger.patient.id}
        payments={ledger.payments}
        invoices={ledger.invoices}
        onFinancialChange={onFinancialChange}
        onSelectPatient={checkoutEncounterId ? undefined : selectPatient}
      />
    </Stack>
  );
}

function billingInvoiceSummary(
  invoice: BillingPatientLedger["invoices"][number],
): BillingInvoiceSummary {
  return {
    id: invoice.id,
    status: invoice.status,
    currency: invoice.currency,
    total: invoice.total_amount,
    allocated: invoice.allocated_amount,
    balance: invoice.balance_amount,
    created_at: invoice.created_at,
  };
}

function deterministicPostError(reason: unknown) {
  return (
    reason instanceof ApiError &&
    (reason.status === 400 || reason.status === 404 || reason.status === 422)
  );
}

function CheckoutSettlement({
  invoice,
  canPost,
  financialRevision,
  onFinancialChange,
}: {
  invoice?: BillingPatientLedger["invoices"][number];
  canPost: boolean;
  financialRevision: number;
  onFinancialChange: (invoiceId?: number) => void;
}) {
  const clinic = useClinic();
  const [confirmation, setConfirmation] = useState<{
    invoiceId: number;
    total: string;
    currency: string;
    updatedAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cashPending, setCashPending] = useState(() =>
    hasPendingCashAttempt(clinic),
  );
  const [postedInvoiceId, setPostedInvoiceId] = useState<number | null>(null);
  const [postAttempt, setPostAttempt] = useState<{
    invoiceId: number;
    requestKey: string;
    updatedAt: string;
  } | null>(null);

  const postInvoice = async () => {
    if (!canPost || busy || (!confirmation && !postAttempt)) return;
    const attempt = postAttempt ?? {
      invoiceId: confirmation!.invoiceId,
      requestKey: crypto.randomUUID(),
      updatedAt: confirmation!.updatedAt,
    };
    setPostAttempt(attempt);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/clinic/invoices/${attempt.invoiceId}/post`, {
        method: "POST",
        body: {
          invoice_post: {
            request_key: attempt.requestKey,
            expected_updated_at: attempt.updatedAt,
          },
        },
      });
      setPostAttempt(null);
      setConfirmation(null);
      setPostedInvoiceId(attempt.invoiceId);
      setNotice(
        `Invoice #${attempt.invoiceId} posted. Enter the cash actually received before recording payment.`,
      );
      onFinancialChange(attempt.invoiceId);
    } catch (reason) {
      if (deterministicPostError(reason)) {
        setPostAttempt(null);
        setConfirmation(null);
      }
      setError(
        deterministicPostError(reason)
          ? reason instanceof Error
            ? reason.message
            : "The invoice could not be posted."
          : `${reason instanceof Error ? reason.message : "The posting outcome could not be confirmed."} Refresh the ledger, then retry only this same posting if the invoice is still a draft.`,
      );
      onFinancialChange(attempt.invoiceId);
    } finally {
      setBusy(false);
    }
  };

  const postingPending = postAttempt !== null;
  const selectedDraft =
    invoice?.status === "draft" &&
    invoice.id !== postedInvoiceId &&
    !cashPending;
  const collectionInvoice =
    invoice && (invoice.status === "posted" || invoice.id === postedInvoiceId)
      ? { ...billingInvoiceSummary(invoice), status: "posted" as const }
      : null;
  return (
    <>
      {(selectedDraft || postingPending) && (
        <Paper component="section" variant="outlined" sx={{ p: 2.5 }}>
          <Stack spacing={1.5}>
            <Box>
              <Typography component="h2" variant="h2">
                Post invoice
              </Typography>
              <Typography
                color="text.secondary"
                variant="body2"
                sx={{ mt: 0.5 }}
              >
                Posting locks the recorded lines and makes the balance eligible
                for collection.
              </Typography>
            </Box>
            {error && (
              <Alert severity={postingPending ? "warning" : "error"}>
                {error}
              </Alert>
            )}
            {!canPost ? (
              <Alert severity="info">
                This account can edit the draft but cannot post it to the
                ledger.
              </Alert>
            ) : postingPending ? (
              <Alert severity="warning">
                <Stack spacing={1.25}>
                  <Typography variant="body2">
                    Posting outcome for invoice #{postAttempt.invoiceId} is
                    pending confirmation. The same request key remains locked to
                    this invoice.
                  </Typography>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button
                      disabled={busy}
                      onClick={() => void postInvoice()}
                      variant="contained"
                    >
                      {busy ? "Posting…" : "Retry same posting"}
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => onFinancialChange(postAttempt.invoiceId)}
                    >
                      Refresh ledger
                    </Button>
                  </Stack>
                </Stack>
              </Alert>
            ) : (
              <Button
                onClick={() => {
                  setError("");
                  setConfirmation({
                    invoiceId: invoice!.id,
                    total: invoice!.total_amount,
                    currency: invoice!.currency,
                    updatedAt: invoice!.updated_at,
                  });
                }}
                sx={{ alignSelf: "flex-start" }}
                variant="contained"
              >
                Review and post invoice #{invoice?.id}
              </Button>
            )}
          </Stack>
        </Paper>
      )}
      {notice && <Alert severity="success">{notice}</Alert>}
      {(collectionInvoice || cashPending) && !postingPending && (
        <CashDrawerOperations
          invoice={collectionInvoice}
          refreshVersion={financialRevision}
          onPendingChange={setCashPending}
          onRecorded={onFinancialChange}
        />
      )}
      <Dialog
        fullWidth
        maxWidth="sm"
        open={confirmation !== null && !postingPending}
        onClose={busy ? undefined : () => setConfirmation(null)}
      >
        <DialogTitle>Post invoice #{confirmation?.invoiceId}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography>
              Confirm the recorded total of{" "}
              {money(
                confirmation?.total ?? "0",
                confirmation?.currency ?? "USD",
              )}
              .
            </Typography>
            <Alert severity="warning">
              Posting locks the current line items and makes this balance
              eligible for collection.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setConfirmation(null)}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => void postInvoice()}
            variant="contained"
          >
            {busy ? "Posting…" : "Confirm and post"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
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
  const [lines, setLines] = useState<InvoiceLineDraft[]>([customInvoiceLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestKeyRef = useRef<string | null>(null);
  const [retryPending, setRetryPending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!/^[A-Z]{3}$/.test(currency)) {
      setError("Use a three-letter uppercase currency code.");
      return;
    }
    if (!lines.length || !lines.every(invoiceLineIsValid)) {
      setError(
        "Complete each invoice line with a positive quantity and its required charge details.",
      );
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
            lines: lines.map((line) =>
              line.kind === "catalog"
                ? {
                    billing_service_id: line.billing_service_id,
                    service_lock_version: line.service_lock_version,
                    quantity: line.quantity.trim(),
                  }
                : {
                    quantity: line.quantity.trim(),
                    unit_amount: line.unit_amount.trim(),
                    description_snapshot: line.description_snapshot.trim(),
                  },
            ),
          },
        },
      });
      if (encounterId && result.invoice.encounter_id !== encounterId) {
        throw new Error(
          "The saved invoice did not match this encounter. Review the billing ledger before trying again.",
        );
      }
      setLines([customInvoiceLine()]);
      requestKeyRef.current = null;
      setRetryPending(false);
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
      if (
        deterministicPostError(reason) ||
        (reason instanceof ApiError && reason.status === 409)
      ) {
        requestKeyRef.current = null;
        setRetryPending(false);
      } else {
        setRetryPending(true);
      }
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
        Choose services or enter a custom charge. Review the invoice before
        posting it for payment.
      </Typography>
      <Box
        component="form"
        onSubmit={(event) => void submit(event)}
        sx={{ mt: 2 }}
      >
        <Box
          component="fieldset"
          disabled={busy || retryPending}
          sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
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
            sx={{ mb: 1.5, maxWidth: 220 }}
          />
          <InvoiceLineEditor
            currency={currency}
            lines={lines}
            onChange={setLines}
          />
        </Box>
        <Button
          disabled={busy}
          type="submit"
          variant="contained"
          sx={{ mt: 2 }}
        >
          {busy
            ? "Creating…"
            : retryPending
              ? "Retry same draft"
              : encounterId
                ? "Create checkout draft"
                : "Create draft"}
        </Button>
      </Box>
      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
          {retryPending &&
            " The save outcome is unknown. Retry this same draft to confirm whether it was recorded."}
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
  const [lines, setLines] = useState<InvoiceLineDraft[]>(() =>
    invoice.lines.length
      ? invoice.lines.map((line) =>
          line.billing_service_id
            ? {
                kind: "recorded" as const,
                invoice_line_id: line.id,
                quantity: line.quantity,
                unit_amount: line.unit_amount,
                description_snapshot: line.description,
                currency: invoice.currency,
              }
            : {
                kind: "custom" as const,
                quantity: line.quantity,
                unit_amount: line.unit_amount,
                description_snapshot: line.description,
              },
        )
      : [customInvoiceLine()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !/^[A-Z]{3}$/.test(currency) ||
      !lines.length ||
      !lines.every(invoiceLineIsValid)
    ) {
      setError(
        "Complete each invoice line with a positive quantity and its required charge details.",
      );
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
            lines: lines.map((line) =>
              line.kind === "recorded"
                ? {
                    invoice_line_id: line.invoice_line_id,
                    quantity: line.quantity.trim(),
                  }
                : line.kind === "catalog"
                  ? {
                      billing_service_id: line.billing_service_id,
                      service_lock_version: line.service_lock_version,
                      quantity: line.quantity.trim(),
                    }
                  : {
                      quantity: line.quantity.trim(),
                      unit_amount: line.unit_amount.trim(),
                      description_snapshot: line.description_snapshot.trim(),
                    },
            ),
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
        sx={{ mt: 2 }}
      >
        <TextField
          label="Currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          sx={{ mb: 1.5, maxWidth: 220 }}
        />
        <InvoiceLineEditor
          currency={currency}
          lines={lines}
          onChange={setLines}
        />
        <Button
          disabled={busy}
          type="submit"
          variant="contained"
          sx={{ mt: 2 }}
        >
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
  patientId,
  payments,
  invoices,
  onFinancialChange,
  onSelectPatient,
}: {
  patientId: number;
  payments: BillingPatientLedger["payments"];
  invoices: BillingPatientLedger["invoices"];
  onFinancialChange: () => void;
  onSelectPatient?: (id: number) => void;
}) {
  const clinic = useClinic();
  const { capabilities } = clinic;
  const refundScope = cashRefundScopeKey(clinic);
  const initialRefundAttempt = pendingCashRefundAttempts.get(refundScope) ?? null;
  const [refundAttempt, setRefundAttempt] =
    useState<CashRefundAttempt | null>(initialRefundAttempt);
  const [refundPaymentId, setRefundPaymentId] = useState<number | null>(
    initialRefundAttempt?.patientId === patientId
      ? initialRefundAttempt.paymentId
      : null,
  );
  const [refundAmount, setRefundAmount] = useState(
    initialRefundAttempt?.patientId === patientId
      ? initialRefundAttempt.amount
      : "",
  );
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
  const refundRetryPending = refundAttempt !== null;

  useEffect(() => {
    const retained = pendingCashRefundAttempts.get(refundScope) ?? null;
    setRefundAttempt(retained);
    if (retained?.patientId === patientId) {
      setRefundPaymentId(retained.paymentId);
      setRefundAmount(retained.amount);
      setRefundError(
        "This refund has an unconfirmed outcome. Review the refund history, then retry the exact retained request if it is still missing.",
      );
    } else {
      setRefundPaymentId(null);
      setRefundAmount("");
      setRefundError("");
    }
  }, [patientId, refundScope]);

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
      !refundAttempt &&
      (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(refundAmount) ||
        isZero(refundAmount))
    ) {
      setRefundError(
        "Enter a positive cash refund amount with up to six decimal places.",
      );
      return;
    }
    const attempt = refundAttempt ?? {
      patientId,
      paymentId,
      amount: refundAmount.trim(),
      requestKey: crypto.randomUUID(),
    };
    persistCashRefundAttempt(clinic, attempt);
    setRefundAttempt(attempt);
    setRefundBusy(true);
    setRefundError("");
    try {
      await api(`/api/clinic/payment_events/${attempt.paymentId}/cash_refunds`, {
        method: "POST",
        body: {
          cash_refund: {
            amount: attempt.amount,
            request_key: attempt.requestKey,
          },
        },
      });
      persistCashRefundAttempt(clinic, null);
      setRefundAttempt(null);
      setRefundAmount("");
      setRefundPaymentId(null);
      onFinancialChange();
    } catch (reason) {
      const deterministic =
        deterministicPostError(reason) ||
        (reason instanceof ApiError && reason.code === "idempotency_conflict");
      if (deterministic) {
        persistCashRefundAttempt(clinic, null);
        setRefundAttempt(null);
      } else {
        onFinancialChange();
      }
      setRefundError(
        deterministic
          ? reason instanceof Error
            ? reason.message
            : "The cash refund could not be recorded."
          : `${reason instanceof Error ? reason.message : "The cash refund outcome could not be confirmed."} Review the refreshed refund history, then retry only this same refund if it is still missing.`,
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
      {refundAttempt && refundAttempt.patientId !== patientId && (
        <Alert
          severity="warning"
          action={onSelectPatient ? (
            <Button
              color="inherit"
              onClick={() => onSelectPatient(refundAttempt.patientId)}
              size="small"
            >
              Open retained ledger
            </Button>
          ) : undefined}
          sx={{ m: 2.5 }}
        >
          A cash refund has an unconfirmed outcome for payment #
          {refundAttempt.paymentId}. Reopen that patient ledger before recording
          another refund.
        </Alert>
      )}
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
                      disabled={refundBusy || refundRetryPending}
                      onClick={() => {
                        setRefundError("");
                        setRefundPaymentId(payment.id);
                        setRefundAmount("");
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
                    disabled={refundBusy || refundRetryPending}
                  />
                  <Button
                    disabled={refundBusy}
                    type="submit"
                    variant="contained"
                  >
                    {refundBusy
                      ? "Recording…"
                      : refundRetryPending
                        ? "Retry same refund"
                        : "Record refund"}
                  </Button>
                  <Button
                    disabled={refundBusy || refundRetryPending}
                    onClick={() => {
                      setRefundPaymentId(null);
                      setRefundAmount("");
                      setRefundError("");
                    }}
                    type="button"
                  >
                    Cancel
                  </Button>
                </Stack>
              )}
              {refundPaymentId === payment.id && refundError && (
                <Alert severity="error" sx={{ mt: 1.5 }}>
                  {refundError}
                  {refundRetryPending &&
                    " The amount is locked so a retry cannot create a different refund."}
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
