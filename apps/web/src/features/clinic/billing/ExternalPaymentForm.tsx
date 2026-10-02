import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type {
  BillingInvoiceSummary,
  ClinicWorkspaceContext,
} from "../../../api/contracts";
import { api, ApiError } from "../../../api/client";
import { useClinicNavigation } from "../clinicNavigation";
import {
  externalPaymentAmounts,
  externalPaymentMoney,
  externalPaymentResponse,
  type ExternalPaymentAttempt,
} from "./externalPayment";

// Retain the exact event identity through in-app refresh/navigation, never in
// browser storage. A different invoice cannot replace an uncertain payment.
const pendingAttempts = new Map<string, ExternalPaymentAttempt>();
const drafts = new Map<
  string,
  {
    reference: string;
    received: string;
    allocationOverride: string | null;
  }
>();

function paymentScope(
  clinic: Pick<
    ClinicWorkspaceContext,
    "practice" | "user_id" | "membership_id"
  >,
) {
  return `${clinic.practice.id}:${clinic.user_id}:${clinic.membership_id}`;
}

export function pendingExternalPaymentInvoiceId(
  clinic: Pick<
    ClinicWorkspaceContext,
    "practice" | "user_id" | "membership_id"
  >,
) {
  return pendingAttempts.get(paymentScope(clinic))?.invoiceId ?? null;
}

export function ExternalPaymentForm({
  clinic,
  invoice,
  patientId,
  patientLabel,
  disabled = false,
  onPendingChange,
  onRecorded,
}: {
  clinic: Pick<
    ClinicWorkspaceContext,
    "practice" | "user_id" | "membership_id"
  >;
  invoice: BillingInvoiceSummary;
  patientId: number;
  patientLabel: string;
  disabled?: boolean;
  onPendingChange: (pending: boolean) => void;
  onRecorded: (message: string) => void;
}) {
  const scope = paymentScope(clinic);
  const draftScope = `${scope}:${invoice.id}:${patientId}`;
  const restored = drafts.get(draftScope);
  const { registerBlocker } = useClinicNavigation();
  const [reference, setReference] = useState(restored?.reference ?? "");
  const [received, setReceived] = useState(
    restored?.received ?? invoice.balance,
  );
  const [allocationOverride, setAllocationOverride] = useState<string | null>(
    restored?.allocationOverride ?? null,
  );
  const [attempt, setAttempt] = useState<ExternalPaymentAttempt | null>(
    () => pendingAttempts.get(scope) ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const pendingChanged = useRef(onPendingChange);
  pendingChanged.current = onPendingChange;
  const sameInvoice =
    !attempt ||
    (attempt.invoiceId === invoice.id && attempt.patientId === patientId);
  const total = attempt?.received ?? received;
  const eventReference = attempt?.reference ?? reference;
  const amounts = externalPaymentAmounts(
    total,
    attempt?.allocation ?? invoice.balance,
    attempt?.allocation ?? allocationOverride,
  );
  const locked = disabled || busy || attempt !== null;
  const dirty =
    reference !== "" ||
    received !== invoice.balance ||
    allocationOverride !== null;

  useEffect(() => {
    if (dirty)
      drafts.set(draftScope, { reference, received, allocationOverride });
    else drafts.delete(draftScope);
  }, [draftScope, reference, received, allocationOverride, dirty]);

  useEffect(() => {
    pendingChanged.current(attempt !== null && sameInvoice);
  }, [attempt, sameInvoice]);

  useEffect(() => {
    if (!attempt && !dirty) return;
    const warning = attempt
      ? "The payment outcome is unconfirmed. Review payment activity and retry only the same event reference. Reloading or leaving this app discards the exact retry details."
      : "Leave this invoice and discard the unsaved payment entry?";
    const unregister = registerBlocker(() => warning);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [attempt, dirty, registerBlocker]);

  const record = async () => {
    if (disabled || inFlight.current || !sameInvoice) return;
    const trimmedReference = reference.trim();
    if (
      !attempt &&
      (!trimmedReference || trimmedReference.length > 255 || amounts.error)
    ) {
      setError(
        !trimmedReference
          ? "Enter the processor or bank event reference for money already received."
          : trimmedReference.length > 255
            ? "Payment references must be 255 characters or fewer."
            : amounts.error,
      );
      return;
    }
    const captured = attempt ?? {
      invoiceId: invoice.id,
      patientId,
      currency: invoice.currency,
      reference: trimmedReference,
      received: received.trim(),
      allocation: amounts.allocation!,
    };
    const wasPending = attempt !== null;
    inFlight.current = true;
    setBusy(true);
    setError("");
    pendingAttempts.set(scope, captured);
    setAttempt(captured);
    pendingChanged.current(true);
    try {
      const response = await api(
        `/api/clinic/invoices/${captured.invoiceId}/payment_allocations`,
        {
          method: "POST",
          body: {
            payment: {
              external_event_reference: captured.reference,
              currency: captured.currency,
              amount: captured.allocation,
              payment_amount: captured.received,
            },
          },
        },
      );
      const result = externalPaymentResponse(response, captured);
      if (!result)
        throw new Error(
          "The payment acknowledgment did not match this invoice, patient and amount.",
        );
      pendingAttempts.delete(scope);
      drafts.delete(draftScope);
      setAttempt(null);
      pendingChanged.current(false);
      setReference("");
      setReceived(invoice.balance);
      setAllocationOverride(null);
      onRecorded(
        `Payment recorded on invoice #${captured.invoiceId}: ${externalPaymentMoney(captured.allocation, captured.currency)} applied. Remaining unapplied payment: ${externalPaymentMoney(result.unapplied, captured.currency)}.`,
      );
    } catch (reason) {
      // A rejection after a lost response cannot disprove an earlier commit.
      const rejected =
        !wasPending &&
        reason instanceof ApiError &&
        reason.code !== "outcome_unconfirmed" &&
        [400, 404, 422].includes(reason.status);
      if (rejected) {
        pendingAttempts.delete(scope);
        setAttempt(null);
        pendingChanged.current(false);
      }
      setError(
        `${reason instanceof Error ? reason.message : "The payment outcome could not be confirmed."}${rejected ? "" : " Review payment activity before retrying this same payment. Do not enter a different event reference."}`,
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  if (!sameInvoice)
    return (
      <Alert severity="warning">
        Payment for invoice #{attempt?.invoiceId} is pending confirmation.
        Return to that invoice before recording another payment.
      </Alert>
    );

  return (
    <Box
      component="form"
      className="billing-payment-form"
      onSubmit={(event) => {
        event.preventDefault();
        void record();
      }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography component="h3" variant="h3">
            Record received payment
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {patientLabel} · Patient #{patientId} · Invoice #{invoice.id} ·{" "}
            {invoice.currency}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Only record money already received. This does not charge a card.
            Check the actual received amount and event reference before
            recording.
          </Typography>
        </Box>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            label="Event reference"
            size="small"
            fullWidth
            disabled={locked}
            value={eventReference}
            onChange={(event) => setReference(event.target.value)}
            helperText="Processor or bank evidence of money received"
            slotProps={{ htmlInput: { maxLength: 255 } }}
            required
          />
          <TextField
            label={`Money received (${invoice.currency})`}
            size="small"
            fullWidth
            disabled={locked}
            value={total}
            onChange={(event) => setReceived(event.target.value)}
            helperText="Defaults to the outstanding balance; change for a partial or larger payment"
            slotProps={{
              htmlInput: {
                inputMode: "decimal",
                pattern: "(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?",
              },
            }}
            required
          />
        </Stack>
        {allocationOverride !== null && (
          <TextField
            label={`Apply to this invoice (${invoice.currency})`}
            size="small"
            disabled={locked}
            value={attempt?.allocation ?? allocationOverride}
            onChange={(event) => setAllocationOverride(event.target.value)}
            helperText="Apply less to retain the rest for other invoices"
            slotProps={{
              htmlInput: {
                inputMode: "decimal",
                pattern: "(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?",
              },
            }}
            required
          />
        )}
        <Box aria-label="Payment allocation summary">
          {amounts.error ? (
            <Alert severity="error">{amounts.error}</Alert>
          ) : (
            <>
              <Typography variant="body2">
                Apply to invoice #{attempt?.invoiceId ?? invoice.id}:{" "}
                {externalPaymentMoney(
                  amounts.allocation!,
                  attempt?.currency ?? invoice.currency,
                )}
              </Typography>
              <Typography variant="body2">
                Money not applied here:{" "}
                {externalPaymentMoney(
                  amounts.notAppliedHere!,
                  attempt?.currency ?? invoice.currency,
                )}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                The server checks existing allocations and refunds for this
                event reference.
              </Typography>
            </>
          )}
          {!attempt && (
            <Button
              type="button"
              disabled={locked}
              onClick={() =>
                setAllocationOverride(
                  allocationOverride === null
                    ? (amounts.allocation ?? "")
                    : null,
                )
              }
            >
              {allocationOverride === null
                ? "Adjust allocation"
                : "Use automatic allocation"}
            </Button>
          )}
        </Box>
        {error && (
          <Alert severity={attempt ? "warning" : "error"}>{error}</Alert>
        )}
        {attempt && sameInvoice && (
          <Alert severity="warning">
            {busy
              ? "Recording this payment…"
              : "Outcome pending confirmation. The original event reference and amounts stay locked for an exact retry."}
          </Alert>
        )}
        <Stack direction="row" spacing={1}>
          <Button
            type="submit"
            variant="contained"
            onClick={(event) => {
              if (event.detail > 1) event.preventDefault();
            }}
            disabled={
              disabled ||
              busy ||
              !sameInvoice ||
              (!attempt && (Boolean(amounts.error) || !reference.trim()))
            }
          >
            {busy
              ? "Recording…"
              : attempt
                ? "Retry same payment"
                : "Record received payment"}
          </Button>
          <Button
            type="button"
            disabled={locked}
            onClick={() => {
              setReference("");
              setReceived(invoice.balance);
              setAllocationOverride(null);
              setError("");
            }}
          >
            Cancel payment
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
