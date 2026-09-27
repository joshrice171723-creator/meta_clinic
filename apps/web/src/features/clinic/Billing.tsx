import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SearchIcon from "@mui/icons-material/Search";
import {
  Alert,
  Accordion,
  AccordionDetails,
  AccordionSummary,
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
import { GuidedCheckout } from "./GuidedCheckout";
import { InvoiceCheckoutControls } from "./InvoiceCheckoutControls";
import { useWorkingDraft } from "./useWorkingDraft";
import { useClinic } from "./Workspace";
import { CashPayEstimates } from "./CashPayEstimates";

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

function decimalNotGreaterThan(value: string, limit: string) {
  const scale = (decimal: string) => {
    const [whole, fraction = ""] = decimal.split(".");
    return BigInt(`${whole}${fraction.padEnd(6, "0").slice(0, 6)}`);
  };
  return scale(value) <= scale(limit);
}

type CashRefundAttempt = {
  patientId: number;
  paymentId: number;
  amount: string;
  reason: string;
  requestKey: string;
};

type CashRefundScope = Pick<
  ClinicWorkspaceContext,
  "practice" | "user_id" | "membership_id"
>;

type ChargeAdjustmentAttempt = {
  action: "credit" | "void";
  amount?: string;
  invoiceId: number;
  reason: string;
  requestKey: string;
};

// Keep an uncertain refund available across in-app navigation without writing
// patient financial data to browser storage.
const pendingCashRefundAttempts = new Map<string, CashRefundAttempt>();
const pendingChargeAdjustmentAttempts = new Map<
  string,
  ChargeAdjustmentAttempt
>();
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

function chargeAdjustmentScopeKey(scope: CashRefundScope, invoiceId: number) {
  return `${cashRefundScopeKey(scope)}:invoice:${invoiceId}`;
}

function persistChargeAdjustmentAttempt(
  scope: CashRefundScope,
  invoiceId: number,
  attempt: ChargeAdjustmentAttempt | null,
) {
  const key = chargeAdjustmentScopeKey(scope, invoiceId);
  if (attempt) pendingChargeAdjustmentAttempts.set(key, attempt);
  else pendingChargeAdjustmentAttempts.delete(key);
}

function queryId(name: string) {
  const value = new URLSearchParams(window.location.search).get(name);
  return value &&
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value))
    ? Number(value)
    : null;
}

function positiveSafeInteger(value: string | number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function PatientDirectory({
  selectedPatientId,
  onSelect,
}: {
  selectedPatientId: number | null;
  onSelect: (patientId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const patients = useResource<{ patients?: Patient[] }>(
    `/api/clinic/patients/lookup${query ? `?q=${encodeURIComponent(query)}` : ""}`,
  );
  const matches = useMemo(
    () =>
      (patients.data?.patients ?? []).filter((patient) =>
        `${patient.display_name} ${patient.reference}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [patients.data, query],
  );

  return (
    <Paper component="section" variant="outlined" sx={{ alignSelf: "start" }}>
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
              onClick={() => onSelect(patient.id)}
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
  );
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
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(
    () => queryId("patient_id"),
  );
  const [checkoutEncounterId] = useState<number | null>(() =>
    queryId("encounter_id"),
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(
    () => queryId("invoice_id"),
  );
  const [reloadLedger, setReloadLedger] = useState(0);
  const [estimateOutcomeUnknown, setEstimateOutcomeUnknown] = useState(false);
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
    const controller = new AbortController();
    setLedger((current) =>
      current.data?.patient.id === selectedPatientId ? current : {},
    );
    api<BillingPatientLedger>(
      `/api/clinic/patients/${selectedPatientId}/billing_ledger`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (active && !controller.signal.aborted) {
          setLedger({ data });
          setSelectedInvoiceId((current) => {
            if (
              current &&
              data.invoices.some((invoice) => invoice.id === current)
            )
              return current;
            return selectedPatientId === queryId("patient_id") &&
              queryId("invoice_id")
              ? null
              : (data.invoices[0]?.id ?? null);
          });
        }
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted)
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
      controller.abort();
    };
  }, [reloadLedger, selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId || !checkoutEncounterId) {
      setCheckoutInvoice({});
      return;
    }
    let active = true;
    const controller = new AbortController();
    setCheckoutInvoice({ checking: true });
    api<{
      invoices: Pick<BillingInvoiceDetail, "id" | "encounter_id" | "status">[];
    }>(
      `/api/clinic/patients/${selectedPatientId}/invoices?encounter_id=${checkoutEncounterId}`,
      { signal: controller.signal },
    )
      .then(({ invoices }) => {
        if (!active || controller.signal.aborted) return;
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
        if (active && !controller.signal.aborted)
          setCheckoutInvoice({
            error:
              error instanceof Error
                ? error.message
                : "Unable to verify this encounter's checkout invoice.",
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [checkoutEncounterId, reloadLedger, selectedPatientId]);

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
          gridTemplateColumns: checkoutEncounterId
            ? "minmax(0, 1fr)"
            : { lg: "minmax(260px, 0.75fr) minmax(0, 2fr)" },
        }}
      >
        {checkoutEncounterId ? (
          <Paper component="section" variant="outlined" sx={{ p: 2 }}>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={0.75}
              sx={{
                alignItems: { sm: "center" },
                justifyContent: "space-between",
              }}
            >
              <Box>
                <Typography component="h2" variant="subtitle2">
                  Checkout patient
                </Typography>
                <Typography sx={{ fontWeight: 700 }}>
                  {ledger.data?.patient.display_name ?? "Loading patient…"}
                </Typography>
                {ledger.data &&
                  patientReferenceLabel(ledger.data.patient.reference) && (
                    <Typography color="text.secondary" variant="body2">
                      Clinic reference ·{" "}
                      {patientReferenceLabel(ledger.data.patient.reference)}
                    </Typography>
                  )}
              </Box>
              <Chip
                label={`Encounter #${checkoutEncounterId}`}
                variant="outlined"
              />
            </Stack>
          </Paper>
        ) : (
          <PatientDirectory
            selectedPatientId={selectedPatientId}
            onSelect={(id) => {
              if (!estimateOutcomeUnknown) setSelectedPatientId(id);
            }}
          />
        )}
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
              {estimateOutcomeUnknown && (
                <Alert severity="warning">
                  Resolve the estimate action before switching patients. Retry
                  the exact request or refresh the estimate list here.
                </Alert>
              )}
              <LedgerDetails
                ledger={ledger.data}
                selectedInvoice={selectedInvoice}
                selectInvoice={setSelectedInvoiceId}
                selectPatient={setSelectedPatientId}
                canDraft={capabilities.billing_invoice_draft === true}
                canPost={capabilities.billing_invoice_post === true}
                canAdjust={capabilities.billing_invoice_post === true}
                onEstimateUnknownOutcomeChange={setEstimateOutcomeUnknown}
                checkoutEncounterId={checkoutEncounterId}
                checkoutInvoice={checkoutInvoice}
                financialRevision={reloadLedger}
                focusPaymentId={
                  selectedPatientId === queryId("patient_id")
                    ? queryId("payment_id")
                    : null
                }
                focusRefundId={
                  selectedPatientId === queryId("patient_id")
                    ? queryId("refund_id")
                    : null
                }
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
  canAdjust,
  onEstimateUnknownOutcomeChange,
  checkoutEncounterId,
  checkoutInvoice,
  financialRevision,
  focusPaymentId,
  focusRefundId,
  onFinancialChange,
}: {
  ledger: BillingPatientLedger;
  selectedInvoice?: BillingPatientLedger["invoices"][number];
  selectInvoice: (id: number) => void;
  selectPatient: (id: number) => void;
  canDraft: boolean;
  canPost: boolean;
  canAdjust: boolean;
  onEstimateUnknownOutcomeChange: (unknown: boolean) => void;
  checkoutEncounterId: number | null;
  checkoutInvoice: {
    active?: Pick<BillingInvoiceDetail, "id" | "encounter_id" | "status">;
    voided?: Pick<BillingInvoiceDetail, "id" | "encounter_id" | "status">;
    error?: string;
    checking?: boolean;
  };
  financialRevision: number;
  focusPaymentId: number | null;
  focusRefundId: number | null;
  onFinancialChange: (invoiceId?: number) => void;
}) {
  const referenceLabel = patientReferenceLabel(ledger.patient.reference);
  const actionableInvoice =
    checkoutEncounterId && checkoutInvoice.active?.id !== selectedInvoice?.id
      ? undefined
      : selectedInvoice;
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
      <CashPayEstimates
        key={ledger.patient.id}
        patientId={ledger.patient.id}
        patientName={ledger.patient.display_name}
        canDraft={canDraft}
        onUnknownOutcomeChange={onEstimateUnknownOutcomeChange}
      />
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
      {ledger.patient.id === queryId("patient_id") &&
        queryId("invoice_id") &&
        !ledger.invoices.some(
          (invoice) => invoice.id === queryId("invoice_id"),
        ) && (
          <Alert severity="warning">
            The linked invoice is unavailable in this patient ledger.
          </Alert>
        )}
      {selectedInvoice &&
        ledger.patient.id === queryId("patient_id") &&
        selectedInvoice.id === queryId("invoice_id") &&
        queryId("collection_intent_id") && (
          <Alert
            severity={
              selectedInvoice.online_payment.collection_intent_id ===
                queryId("collection_intent_id") &&
              selectedInvoice.online_payment.state === "needs_reconciliation"
                ? "warning"
                : "info"
            }
          >
            {selectedInvoice.online_payment.collection_intent_id ===
              queryId("collection_intent_id") &&
            selectedInvoice.online_payment.state === "needs_reconciliation"
              ? `Collection intent #${queryId("collection_intent_id")} currently needs reconciliation. Review the recorded payment state before another collection.`
              : `Collection intent #${queryId("collection_intent_id")} is no longer recorded as needing reconciliation for invoice #${selectedInvoice.id}. Check its current state before another collection.`}
          </Alert>
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
      {checkoutEncounterId && !checkoutInvoice.checking && (
        <GuidedCheckout
          key={`${checkoutEncounterId}:${financialRevision}`}
          patientId={ledger.patient.id}
          encounterId={checkoutEncounterId}
          invoiceId={checkoutInvoice.active?.id}
          ledger={ledger}
        />
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
      {selectedInvoice && (
        <Accordion
          key={selectedInvoice.id}
          defaultExpanded={selectedInvoice.id === queryId("invoice_id")}
          disableGutters
          variant="outlined"
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box>
              <Typography
                component="h2"
                variant="subtitle1"
                sx={{ fontWeight: 700 }}
              >
                Invoice #{selectedInvoice.id} details
              </Typography>
              <Typography color="text.secondary" variant="body2">
                {invoiceState(selectedInvoice)} ·{" "}
                {money(
                  selectedInvoice.balance_amount,
                  selectedInvoice.currency,
                )}{" "}
                balance
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <InvoiceDetail invoice={selectedInvoice} />
          </AccordionDetails>
        </Accordion>
      )}
      {checkoutEncounterId &&
        checkoutInvoice.active &&
        selectedInvoice &&
        !actionableInvoice && (
          <Alert severity="info">
            Invoice #{selectedInvoice.id} is historical for this patient. Return
            to invoice #{checkoutInvoice.active?.id} to continue this
            encounter's checkout.
          </Alert>
        )}
      {actionableInvoice && (
        <ChargeAdjustmentDialog
          canAdjust={canAdjust}
          invoice={actionableInvoice}
          onFinancialChange={onFinancialChange}
        />
      )}
      {actionableInvoice?.status === "draft" && canDraft && (
        <DraftInvoiceEditor
          key={actionableInvoice.id}
          invoice={actionableInvoice}
          patientId={ledger.patient.id}
          encounterId={checkoutEncounterId}
          onSaved={onFinancialChange}
        />
      )}
      <Box id="checkout-invoice-actions" sx={{ scrollMarginTop: 24 }}>
        <CheckoutSettlement
          invoice={actionableInvoice}
          patientId={ledger.patient.id}
          encounterId={checkoutEncounterId}
          canPost={canPost}
          financialRevision={financialRevision}
          onFinancialChange={onFinancialChange}
        />
      </Box>
      <PaymentHistory
        patientId={ledger.patient.id}
        patientName={ledger.patient.display_name}
        payments={ledger.payments}
        invoices={ledger.invoices}
        focusPaymentId={focusPaymentId}
        focusRefundId={focusRefundId}
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
  patientId,
  encounterId,
  canPost,
  financialRevision,
  onFinancialChange,
}: {
  invoice?: BillingPatientLedger["invoices"][number];
  patientId: number;
  encounterId: number | null;
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
  const postDraft = useWorkingDraft<{
    action: "post";
    invoiceId: number;
    requestKey: string;
    updatedAt: string;
  }>({
    kind: "checkout",
    scope: "invoice_post",
    patientId,
    encounterId: encounterId ?? undefined,
    recordId: invoice?.id,
  });

  useEffect(() => {
    if (!postDraft.ready || postAttempt || !postDraft.restored) return;
    if (
      postDraft.restored.action === "post" &&
      postDraft.restored.invoiceId === invoice?.id
    ) {
      setPostAttempt(postDraft.restored);
      setError(
        "This invoice has an unconfirmed posting attempt. Refresh the ledger, then retry the same posting only if it is still a draft.",
      );
    }
  }, [invoice?.id, postAttempt, postDraft.ready, postDraft.restored]);

  const postInvoice = async () => {
    if (!canPost || busy || (!confirmation && !postAttempt)) return;
    const attempt = postAttempt ?? {
      invoiceId: confirmation!.invoiceId,
      requestKey: crypto.randomUUID(),
      updatedAt: confirmation!.updatedAt,
    };
    if (!(await postDraft.save({ action: "post", ...attempt }))) {
      setError(
        postDraft.error ||
          "The posting attempt could not be saved for recovery. Try again before posting.",
      );
      return;
    }
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
      if (!(await postDraft.clear())) {
        setError(
          postDraft.error ||
            "Invoice posting succeeded, but its saved recovery details could not be cleared. Refresh the ledger before taking another action.",
        );
      }
      setConfirmation(null);
      setPostedInvoiceId(attempt.invoiceId);
      setNotice(
        `Invoice #${attempt.invoiceId} posted. Choose how to collect the remaining balance.`,
      );
      onFinancialChange(attempt.invoiceId);
    } catch (reason) {
      if (deterministicPostError(reason)) {
        setPostAttempt(null);
        setConfirmation(null);
        await postDraft.clear();
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
    invoice &&
    ((invoice.status === "posted" && !isZero(invoice.balance_amount)) ||
      (invoice.status === "draft" &&
        invoice.id === postedInvoiceId &&
        !isZero(invoice.total_amount)))
      ? { ...billingInvoiceSummary(invoice), status: "posted" as const }
      : null;
  const onlinePaymentPending =
    invoice?.status === "posted" &&
    ["processing", "needs_reconciliation"].includes(
      invoice.online_payment.state,
    );
  const cashRecoveryInvoiceId = useRef<number | undefined>(undefined);
  if (
    collectionInvoice?.id &&
    (!cashPending || cashRecoveryInvoiceId.current === undefined)
  ) {
    cashRecoveryInvoiceId.current = collectionInvoice.id;
  }
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
                    pending confirmation. The original submission remains locked
                    to this invoice.
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
      {invoice?.status === "posted" && collectionInvoice && !postingPending && (
        <Paper component="section" variant="outlined" sx={{ p: 2.5 }}>
          <InvoiceCheckoutControls
            key={invoice.id}
            onlinePayment={invoice.online_payment}
            endpoint={`/api/clinic/invoices/${invoice.id}/online_payment`}
            patientId={patientId}
            encounterId={encounterId ?? undefined}
            invoiceId={invoice.id}
            actionLabel="Collect online"
            actionsEnabled={
              !cashPending &&
              clinic.capabilities.billing_payment_record === true
            }
            allowPaidRefresh
            onChanged={() => onFinancialChange(invoice.id)}
          />
          {onlinePaymentPending && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Refresh or cancel the online checkout before recording a different
              payment method.
            </Alert>
          )}
        </Paper>
      )}
      {(clinic.capabilities.billing_payment_record === true ||
        clinic.capabilities.billing_cash_reconcile === true) &&
        (collectionInvoice || cashPending) &&
        !postingPending && (
          <CashDrawerOperations
            invoice={onlinePaymentPending ? null : collectionInvoice}
            patientId={patientId}
            encounterId={encounterId ?? undefined}
            recoveryInvoiceId={cashRecoveryInvoiceId.current}
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
  const recovery = useWorkingDraft<{
    action: "create";
    patientId: number;
    encounterId: number | null;
    requestKey: string;
    currency: string;
    lines: InvoiceLineDraft[];
  }>({
    kind: "checkout",
    patientId,
    encounterId: encounterId ?? undefined,
  });

  useEffect(() => {
    if (!recovery.ready || !recovery.restored || requestKeyRef.current) return;
    const restored = recovery.restored;
    if (
      restored.action !== "create" ||
      restored.patientId !== patientId ||
      restored.encounterId !== encounterId
    )
      return;
    setCurrency(restored.currency);
    setLines(restored.lines);
    requestKeyRef.current = restored.requestKey;
    setRetryPending(true);
    setError(
      "A saved checkout draft attempt was restored. Retry the same draft to reconcile its outcome.",
    );
  }, [encounterId, patientId, recovery.ready, recovery.restored]);

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
    if (
      !(await recovery.save({
        action: "create",
        patientId,
        encounterId,
        requestKey: retryKey,
        currency,
        lines,
      }))
    ) {
      setBusy(false);
      setError(
        recovery.error || "The checkout draft could not be saved for recovery.",
      );
      return;
    }
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
      if (!(await recovery.clear())) {
        setError(
          recovery.error ||
            "The draft was created, but its saved recovery details could not be cleared. Refresh the ledger before another action.",
        );
      }
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
        await recovery.clear();
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
  patientId,
  encounterId,
  onSaved,
}: {
  invoice: BillingPatientLedger["invoices"][number];
  patientId: number;
  encounterId: number | null;
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
  const requestKeyRef = useRef<string | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const recovery = useWorkingDraft<{
    action: "update";
    invoiceId: number;
    requestKey: string;
    expectedUpdatedAt: string;
    currency: string;
    lines: InvoiceLineDraft[];
  }>({
    kind: "checkout",
    scope: "invoice_edit",
    patientId,
    encounterId: encounterId ?? undefined,
    recordId: invoice.id,
  });

  useEffect(() => {
    if (!recovery.ready || !recovery.restored || requestKeyRef.current) return;
    const restored = recovery.restored;
    if (restored.action !== "update" || restored.invoiceId !== invoice.id)
      return;
    setCurrency(restored.currency);
    setLines(restored.lines);
    requestKeyRef.current = restored.requestKey;
    setRetryPending(true);
    setError(
      "A saved edit attempt was restored for this invoice. Retry the same edit or refresh the ledger to reconcile it.",
    );
  }, [invoice.id, recovery.ready, recovery.restored]);
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
    const requestKey = requestKeyRef.current ?? crypto.randomUUID();
    const attempt = {
      action: "update" as const,
      invoiceId: invoice.id,
      requestKey,
      expectedUpdatedAt: invoice.updated_at,
      currency,
      lines,
    };
    if (!(await recovery.save(attempt))) {
      setBusy(false);
      setError(
        recovery.error || "The invoice edit could not be saved for recovery.",
      );
      return;
    }
    requestKeyRef.current = requestKey;
    setRetryPending(true);
    try {
      const result = await api<{ invoice: BillingInvoiceDetail }>(
        `/api/clinic/invoices/${invoice.id}/draft`,
        {
          method: "PATCH",
          body: {
            invoice: {
              currency,
              request_key: requestKey,
              expected_updated_at: invoice.updated_at,
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
        },
      );
      if (
        result.invoice.id !== invoice.id ||
        result.invoice.patient_id !== patientId
      ) {
        throw new Error(
          "The saved invoice did not match this checkout context.",
        );
      }
      requestKeyRef.current = null;
      setRetryPending(false);
      if (!(await recovery.clear())) {
        setError(
          recovery.error ||
            "The invoice was saved, but its saved recovery details could not be cleared. Refresh before editing again.",
        );
      }
      onSaved();
    } catch (reason) {
      if (
        deterministicPostError(reason) ||
        (reason instanceof ApiError && reason.status === 409)
      ) {
        requestKeyRef.current = null;
        setRetryPending(false);
        await recovery.clear();
      }
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
          {busy ? "Saving…" : retryPending ? "Retry same edit" : "Save draft"}
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

function ChargeAdjustmentDialog({
  canAdjust,
  invoice,
  onFinancialChange,
}: {
  canAdjust: boolean;
  invoice: BillingPatientLedger["invoices"][number];
  onFinancialChange: (invoiceId?: number) => void;
}) {
  const clinic = useClinic();
  const attemptKey = chargeAdjustmentScopeKey(clinic, invoice.id);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState<ChargeAdjustmentAttempt | null>(
    () => pendingChargeAdjustmentAttempts.get(attemptKey) ?? null,
  );
  const [action, setAction] = useState<"credit" | "void">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const limits = invoice.adjustment_limits;
  const creditAvailable = limits.credit_available_amount;
  const canCredit = !isZero(creditAvailable);
  const canVoid = limits.void_eligible;
  const retryPending = attempt !== null;

  useEffect(() => {
    const retained = pendingChargeAdjustmentAttempts.get(attemptKey) ?? null;
    setAttempt(retained);
    if (retained) {
      setAction(retained.action);
      setAmount(retained.amount ?? "");
      setReason(retained.reason);
      setError(
        "This charge adjustment has an unconfirmed outcome. Refresh the ledger, then retry the exact retained request only if it is still missing.",
      );
    } else {
      setAmount("");
      setReason("");
      setError("");
      setAction(canCredit ? "credit" : "void");
    }
    setOpen(false);
  }, [attemptKey, canCredit]);

  const close = () => {
    if (!busy && !retryPending) setOpen(false);
  };

  const submit = async () => {
    if (!canAdjust || busy || (!canCredit && !canVoid)) return;
    if (!retryPending && reason.trim().length === 0) {
      setError("Enter a reason for this charge adjustment.");
      return;
    }
    if (
      !retryPending &&
      action === "credit" &&
      (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount) ||
        isZero(amount) ||
        !decimalNotGreaterThan(amount, creditAvailable))
    ) {
      setError(
        `Enter a positive credit up to ${money(creditAvailable, invoice.currency)} with up to six decimal places.`,
      );
      return;
    }
    const nextAttempt = attempt ?? {
      action,
      ...(action === "credit" ? { amount: amount.trim() } : {}),
      invoiceId: invoice.id,
      reason: reason.trim(),
      requestKey: crypto.randomUUID(),
    };
    persistChargeAdjustmentAttempt(clinic, invoice.id, nextAttempt);
    setAttempt(nextAttempt);
    setBusy(true);
    setError("");
    try {
      if (nextAttempt.action === "credit") {
        await api(`/api/clinic/invoices/${nextAttempt.invoiceId}/credits`, {
          method: "POST",
          body: {
            credit: {
              amount: nextAttempt.amount,
              reason: nextAttempt.reason,
              request_key: nextAttempt.requestKey,
            },
          },
        });
      } else {
        await api(`/api/clinic/invoices/${nextAttempt.invoiceId}/void`, {
          method: "POST",
          body: {
            invoice_void: {
              reason: nextAttempt.reason,
              request_key: nextAttempt.requestKey,
            },
          },
        });
      }
      persistChargeAdjustmentAttempt(clinic, invoice.id, null);
      setAttempt(null);
      setOpen(false);
      onFinancialChange(invoice.id);
    } catch (reason) {
      const deterministic =
        deterministicPostError(reason) ||
        (reason instanceof ApiError &&
          reason.status === 409 &&
          reason.code !== "outcome_unconfirmed");
      if (deterministic) {
        persistChargeAdjustmentAttempt(clinic, invoice.id, null);
        setAttempt(null);
      } else {
        onFinancialChange(invoice.id);
      }
      setError(
        deterministic
          ? reason instanceof Error
            ? reason.message
            : "The charge adjustment could not be recorded."
          : `${reason instanceof Error ? reason.message : "The charge adjustment outcome could not be confirmed."} The action and values are locked so a retry cannot create a different adjustment.`,
      );
    } finally {
      setBusy(false);
    }
  };

  if (!canAdjust) return null;
  return (
    <>
      <Button
        disabled={!canCredit && !canVoid}
        onClick={() => setOpen(true)}
        variant="outlined"
      >
        Adjust charges
      </Button>
      <Dialog fullWidth maxWidth="sm" onClose={close} open={open}>
        <DialogTitle>Adjust invoice charges</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography color="text.secondary">
              Invoice #{invoice.id} ·{" "}
              {money(invoice.total_amount, invoice.currency)}
            </Typography>
            {retryPending ? (
              <Alert severity="warning">
                Retry uses the exact retained action, amount, and reason.
              </Alert>
            ) : (
              <Alert severity="info">
                A credit reduces recorded charges. It does not return money. Use
                the separate cash refund workflow when money is returned.
              </Alert>
            )}
            {canCredit && (
              <Button
                disabled={retryPending}
                onClick={() => setAction("credit")}
                variant={action === "credit" ? "contained" : "outlined"}
              >
                Credit charges · available{" "}
                {money(creditAvailable, invoice.currency)}
              </Button>
            )}
            {canVoid && (
              <Button
                color="warning"
                disabled={retryPending}
                onClick={() => setAction("void")}
                variant={action === "void" ? "contained" : "outlined"}
              >
                Void untouched unpaid invoice
              </Button>
            )}
            {action === "credit" && (
              <TextField
                autoFocus={!retryPending}
                disabled={retryPending}
                inputMode="decimal"
                label="Credit amount"
                onChange={(event) => setAmount(event.target.value)}
                value={amount}
              />
            )}
            <TextField
              disabled={retryPending}
              label="Reason"
              multiline
              onChange={(event) => setReason(event.target.value)}
              required
              slotProps={{ htmlInput: { maxLength: 500 } }}
              value={reason}
            />
            {action === "void" && (
              <Typography color="text.secondary" variant="body2">
                Voiding is available only while this invoice has no allocations,
                credits, or active collection work. The server verifies that
                state again when you submit.
              </Typography>
            )}
            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy || retryPending} onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={() => void submit()}
            variant="contained"
          >
            {busy
              ? "Recording…"
              : retryPending
                ? "Retry exact adjustment"
                : action === "credit"
                  ? "Record credit"
                  : "Void invoice"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
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
      {invoice.status === "void" && (
        <Alert severity="info" sx={{ mx: 2.5, mb: 2.5 }}>
          {invoice.void_reason
            ? `Void reason: ${invoice.void_reason}`
            : "This invoice was voided."}
          {invoice.voided_at
            ? ` Recorded ${date(invoice.voided_at, true)}.`
            : ""}
          {invoice.voided_by ? ` Voided by ${invoice.voided_by}.` : ""}
        </Alert>
      )}
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
  entries: {
    id: number;
    amount: string;
    created_at: string;
    reason?: string | null;
    issued_at?: string | null;
    issued_by?: string | null;
  }[];
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
          <Box key={entry.id}>
            <Typography color="text.secondary" variant="body2">
              {money(entry.amount, currency)} ·{" "}
              {date(entry.issued_at ?? entry.created_at, true)}
            </Typography>
            {entry.reason && (
              <Typography color="text.secondary" variant="body2">
                Reason: {entry.reason}
              </Typography>
            )}
            {entry.issued_by && (
              <Typography color="text.secondary" variant="body2">
                Recorded by {entry.issued_by}
              </Typography>
            )}
          </Box>
        ))
      )}
    </Box>
  );
}

function PaymentHistory({
  patientId,
  patientName,
  payments,
  invoices,
  focusPaymentId,
  focusRefundId,
  onFinancialChange,
  onSelectPatient,
}: {
  patientId: number;
  patientName: string;
  payments: BillingPatientLedger["payments"];
  invoices: BillingPatientLedger["invoices"];
  focusPaymentId: number | null;
  focusRefundId: number | null;
  onFinancialChange: () => void;
  onSelectPatient?: (id: number) => void;
}) {
  const clinic = useClinic();
  const { capabilities } = clinic;
  const refundScope = cashRefundScopeKey(clinic);
  const initialRefundAttempt =
    pendingCashRefundAttempts.get(refundScope) ?? null;
  const [refundAttempt, setRefundAttempt] = useState<CashRefundAttempt | null>(
    initialRefundAttempt,
  );
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
  const [refundReason, setRefundReason] = useState(
    initialRefundAttempt?.patientId === patientId
      ? initialRefundAttempt.reason
      : "",
  );
  const [refundError, setRefundError] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundConfirmationPaymentId, setRefundConfirmationPaymentId] =
    useState<number | null>(null);
  const [allocationPaymentId, setAllocationPaymentId] = useState<number | null>(
    null,
  );
  const [allocationInvoiceId, setAllocationInvoiceId] = useState("");
  const [allocationAmount, setAllocationAmount] = useState("");
  const [allocationRequestKey, setAllocationRequestKey] = useState("");
  const [allocationError, setAllocationError] = useState("");
  const [allocationBusy, setAllocationBusy] = useState(false);
  const refundRetryPending = refundAttempt !== null;
  const refundConfirmationPayment = payments.find(
    (payment) => payment.id === refundConfirmationPaymentId,
  );
  const refundConfirmationAmount =
    refundAttempt?.paymentId === refundConfirmationPaymentId
      ? refundAttempt.amount
      : refundAmount.trim();
  const refundConfirmationReason =
    refundAttempt?.paymentId === refundConfirmationPaymentId
      ? refundAttempt.reason
      : refundReason.trim();
  useEffect(() => {
    const targetId = focusRefundId
      ? `billing-refund-${focusRefundId}`
      : focusPaymentId
        ? `billing-payment-${focusPaymentId}`
        : null;
    if (!targetId) return;
    const target = document.getElementById(targetId);
    target?.scrollIntoView({ block: "center" });
    target?.focus();
  }, [focusPaymentId, focusRefundId, payments]);

  useEffect(() => {
    const retained = pendingCashRefundAttempts.get(refundScope) ?? null;
    setRefundAttempt(retained);
    if (retained?.patientId === patientId) {
      setRefundPaymentId(retained.paymentId);
      setRefundAmount(retained.amount);
      setRefundReason(retained.reason);
      setRefundError(
        "This refund has an unconfirmed outcome. Review the refund history, then retry the exact retained request if it is still missing.",
      );
    } else {
      setRefundPaymentId(null);
      setRefundAmount("");
      setRefundReason("");
      setRefundError("");
      setRefundConfirmationPaymentId(null);
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
    const targetInvoiceId = positiveSafeInteger(allocationInvoiceId);
    const payment = payments.find((candidate) => candidate.id === paymentId);
    if (
      !payment ||
      targetInvoiceId === null ||
      !eligibleInvoices(payment).some(
        (invoice) => invoice.id === targetInvoiceId,
      ) ||
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
            invoice_id: targetInvoiceId,
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

  const reviewRefund = (payment: BillingPatientLedger["payments"][number]) => {
    if (
      !refundAttempt &&
      (!payment.cash_refund_available ||
        !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(refundAmount) ||
        isZero(refundAmount) ||
        !refundReason.trim())
    ) {
      setRefundError(
        payment.cash_refund_unavailable_reason === "cash_drawer_closed"
          ? "This payment cannot be refunded because its cash drawer is closed."
          : payment.cash_refund_unavailable_reason === "payment_fully_refunded"
            ? "This payment has already been fully refunded."
            : "Enter a positive cash refund amount and a reason.",
      );
      return;
    }
    setRefundError("");
    setRefundConfirmationPaymentId(payment.id);
  };

  const refundCash = async (paymentId: number) => {
    if (positiveSafeInteger(paymentId) === null) {
      setRefundError("Choose a valid payment before recording a refund.");
      setRefundConfirmationPaymentId(null);
      return;
    }
    const attempt = refundAttempt ?? {
      patientId,
      paymentId,
      amount: refundAmount.trim(),
      reason: refundReason.trim(),
      requestKey: crypto.randomUUID(),
    };
    persistCashRefundAttempt(clinic, attempt);
    setRefundAttempt(attempt);
    setRefundBusy(true);
    setRefundError("");
    try {
      await api(
        `/api/clinic/payment_events/${attempt.paymentId}/cash_refunds`,
        {
          method: "POST",
          body: {
            cash_refund: {
              amount: attempt.amount,
              reason: attempt.reason,
              request_key: attempt.requestKey,
            },
          },
        },
      );
      persistCashRefundAttempt(clinic, null);
      setRefundAttempt(null);
      setRefundAmount("");
      setRefundReason("");
      setRefundPaymentId(null);
      setRefundConfirmationPaymentId(null);
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
      setRefundConfirmationPaymentId(null);
    }
  };

  return (
    <>
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
            action={
              onSelectPatient ? (
                <Button
                  color="inherit"
                  onClick={() => onSelectPatient(refundAttempt.patientId)}
                  size="small"
                >
                  Open retained ledger
                </Button>
              ) : undefined
            }
            sx={{ m: 2.5 }}
          >
            A cash refund has an unconfirmed outcome for payment #
            {refundAttempt.paymentId}. Reopen that patient ledger before
            recording another refund.
          </Alert>
        )}
        {focusPaymentId &&
          !payments.some((payment) => payment.id === focusPaymentId) && (
            <Alert severity="warning" sx={{ m: 2.5 }}>
              The linked payment is unavailable in this patient ledger.
            </Alert>
          )}
        {focusRefundId &&
          !payments.some((payment) =>
            payment.refunds.some((refund) => refund.id === focusRefundId),
          ) && (
            <Alert severity="warning" sx={{ m: 2.5 }}>
              The linked refund is unavailable in this patient ledger.
            </Alert>
          )}
        {payments.length === 0 ? (
          <Typography color="text.secondary" sx={{ p: 2.5 }}>
            No payments were returned for this patient.
          </Typography>
        ) : (
          <List disablePadding>
            {payments.map((payment) => (
              <Box
                component="li"
                key={payment.id}
                id={`billing-payment-${payment.id}`}
                tabIndex={payment.id === focusPaymentId ? -1 : undefined}
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
                  <Typography
                    color="warning.main"
                    variant="body2"
                    sx={{ mt: 1 }}
                  >
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
                          direction={{ xs: "column", md: "row" }}
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
                                {money(
                                  invoice.balance_amount,
                                  invoice.currency,
                                )}{" "}
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
                      {allocationError &&
                        allocationPaymentId === payment.id && (
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
                    {capabilities.billing_payment_record === true &&
                      payment.cash_refund_available &&
                      !refundRetryPending && (
                        <Button
                          disabled={refundBusy}
                          onClick={() => {
                            setRefundError("");
                            setRefundPaymentId(payment.id);
                            setRefundAmount("");
                            setRefundReason("");
                          }}
                          variant="outlined"
                        >
                          Refund cash
                        </Button>
                      )}
                    {payment.cash_refund_unavailable_reason ===
                      "cash_drawer_closed" && (
                      <Typography color="text.secondary" variant="body2">
                        Refund unavailable: the cash drawer used for this
                        payment is closed.
                      </Typography>
                    )}
                    {payment.cash_refund_unavailable_reason ===
                      "payment_fully_refunded" && (
                      <Typography color="text.secondary" variant="body2">
                        This payment has already been fully refunded.
                      </Typography>
                    )}
                  </Stack>
                )}
                {refundPaymentId === payment.id && (
                  <Stack
                    component="form"
                    direction={{ xs: "column", md: "row" }}
                    spacing={1}
                    sx={{ mt: 1.5 }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      reviewRefund(payment);
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
                    <TextField
                      label="Refund reason"
                      value={refundReason}
                      required
                      multiline
                      minRows={2}
                      slotProps={{ htmlInput: { maxLength: 200 } }}
                      onChange={(event) => setRefundReason(event.target.value)}
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
                          ? "Review same refund"
                          : "Review refund"}
                    </Button>
                    <Button
                      disabled={refundBusy || refundRetryPending}
                      onClick={() => {
                        setRefundPaymentId(null);
                        setRefundAmount("");
                        setRefundReason("");
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
                    Refund history is shown separately from invoice balances.
                    {payment.refunds.map((refund) => (
                      <Typography
                        id={`billing-refund-${refund.id}`}
                        key={refund.id}
                        tabIndex={refund.id === focusRefundId ? -1 : undefined}
                        variant="body2"
                      >
                        Refund #{refund.id} ·{" "}
                        {money(refund.amount, payment.currency)} on{" "}
                        {date(refund.created_at, true)} · {refund.reason}
                      </Typography>
                    ))}
                  </Alert>
                )}
              </Box>
            ))}
          </List>
        )}
      </Paper>
      <Dialog
        fullWidth
        maxWidth="sm"
        open={refundConfirmationPayment !== undefined}
        onClose={
          refundBusy ? undefined : () => setRefundConfirmationPaymentId(null)
        }
      >
        <DialogTitle>Confirm cash refund</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Typography>
              Review the details before recording this refund.
            </Typography>
            <Paper variant="outlined" sx={{ p: 1.5 }}>
              <Stack spacing={0.75}>
                <Typography>
                  <strong>Patient:</strong> {patientName}
                </Typography>
                <Typography>
                  <strong>Payment:</strong> #{refundConfirmationPayment?.id}
                </Typography>
                <Typography>
                  <strong>Amount:</strong>{" "}
                  {money(
                    refundConfirmationAmount || "0",
                    refundConfirmationPayment?.currency ?? "USD",
                  )}
                </Typography>
                <Typography>
                  <strong>Reason:</strong> {refundConfirmationReason}
                </Typography>
              </Stack>
            </Paper>
            {refundRetryPending && (
              <Alert severity="warning">
                This retry uses the exact retained refund details.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={refundBusy}
            onClick={() => setRefundConfirmationPaymentId(null)}
          >
            Go back
          </Button>
          <Button
            disabled={refundBusy || refundConfirmationPayment === undefined}
            onClick={() => {
              if (refundConfirmationPayment) {
                void refundCash(refundConfirmationPayment.id);
              }
            }}
            variant="contained"
          >
            {refundBusy
              ? "Recording…"
              : refundRetryPending
                ? "Retry same refund"
                : "Confirm refund"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
