import { useEffect, useId, useRef, useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { ApiError, api } from "../../api/client";
import type { InvoiceOnlinePayment } from "../../api/contracts";
import { useWorkingDraft } from "./useWorkingDraft";
import { subscriptionMoney } from "./subscriptions/contracts";

type Outcome = "succeeded" | "failed";
type Attempt = { request_key: string; amount: string; outcome: Outcome };
type SavedAttempt = { invoiceId: number; endpoint: string; attempt: Attempt };

export function InvoicePaymentSimulator({
  payment,
  endpoint,
  actionsEnabled,
  patientId,
  encounterId,
  invoiceId,
  onPendingChange,
  onChanged,
}: {
  payment: InvoiceOnlinePayment;
  endpoint: string;
  actionsEnabled: boolean;
  patientId?: number;
  encounterId?: number;
  invoiceId?: number;
  onPendingChange?: (pending: boolean) => void;
  onChanged: () => void;
}) {
  const titleId = useId();
  const [confirmation, setConfirmation] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Attempt | null>(null);
  const [restoredReady, setRestoredReady] = useState(false);
  const [invalidRecovery, setInvalidRecovery] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const contextAvailable = patientId !== undefined && invoiceId !== undefined;
  const recovery = useWorkingDraft<SavedAttempt>({
    kind: "checkout",
    scope: "synthetic_payment",
    patientId,
    encounterId,
    recordId: invoiceId,
    enabled: contextAvailable && payment.synthetic_collection?.enabled === true,
  });
  const owner = useRef({ mounted: true });
  const inFlight = useRef(false);
  useEffect(() => {
    const current = { mounted: true };
    owner.current = current;
    inFlight.current = false;
    setPending(null);
    setUnconfirmed(false);
    setInvalidRecovery(false);
    setRestoredReady(false);
    return () => {
      current.mounted = false;
    };
  }, [endpoint, patientId, encounterId, invoiceId]);
  useEffect(() => {
    if (!recovery.ready) return;
    if (!recovery.restored) {
      setRestoredReady(true);
      return;
    }
    const saved = recovery.restored;
    const attempt = saved.attempt;
    if (
      saved.invoiceId !== invoiceId ||
      saved.endpoint !== endpoint ||
      !attempt ||
      typeof attempt.request_key !== "string" ||
      !attempt.request_key ||
      typeof attempt.amount !== "string" ||
      !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(attempt.amount) ||
      !["succeeded", "failed"].includes(attempt.outcome)
    ) {
      setInvalidRecovery(true);
      setError(
        "The saved payment attempt cannot be verified. Reconcile this invoice before recording another payment.",
      );
      return;
    }
    setPending(attempt);
    setUnconfirmed(true);
    setRestoredReady(true);
  }, [recovery.ready, recovery.restored, endpoint, invoiceId]);
  const ready =
    contextAvailable && recovery.ready && restoredReady && !invalidRecovery;
  useEffect(() => {
    onPendingChange?.(
      payment.synthetic_collection?.enabled === true &&
        (!ready || pending !== null),
    );
  }, [onPendingChange, payment.synthetic_collection?.enabled, ready, pending]);
  const collect = async (outcome: Outcome) => {
    if (
      busy ||
      inFlight.current ||
      !ready ||
      !actionsEnabled ||
      invoiceId === undefined
    )
      return;
    inFlight.current = true;
    const current = owner.current;
    const owned = () => current.mounted && owner.current === current;
    const attempt = pending ?? {
      request_key: crypto.randomUUID(),
      amount: payment.amount,
      outcome,
    };
    setPending(attempt);
    setBusy(true);
    setError("");
    setNotice("");
    setConfirmation(null);
    try {
      if (!(await recovery.save({ invoiceId, endpoint, attempt }))) {
        if (owned())
          setError(
            "The payment attempt could not be saved for recovery. No payment request was sent. Reconnect and retry the same attempt.",
          );
        return;
      }
      if (!owned()) return;
      setUnconfirmed(true);
      const result = await api<{
        simulation: { state: Outcome; collection_intent_id: number };
      }>(`${endpoint}/simulate`, {
        method: "POST",
        body: { online_payment: attempt },
      });
      if (!owned()) return;
      if (
        !["succeeded", "failed"].includes(result.simulation?.state) ||
        !Number.isInteger(result.simulation?.collection_intent_id) ||
        result.simulation.collection_intent_id <= 0
      )
        throw new Error(
          "The simulated payment outcome could not be confirmed.",
        );
      if (!(await recovery.clear())) {
        if (owned())
          setError(
            "The payment response arrived, but its recovery record could not be cleared. Retry the same attempt to reconcile before recording another payment.",
          );
        return;
      }
      if (!owned()) return;
      setPending(null);
      setUnconfirmed(false);
      setNotice(
        result.simulation.state === "succeeded"
          ? `Simulated card payment recorded. Collection #${result.simulation.collection_intent_id}; the invoice balance and receipt are saved.`
          : `Simulated card declined. Collection #${result.simulation.collection_intent_id}; no payment was allocated.`,
      );
      onChanged();
    } catch (reason) {
      if (!owned()) return;
      const definite =
        reason instanceof ApiError &&
        [400, 403, 404, 409, 422].includes(reason.status) &&
        reason.code !== "outcome_unconfirmed" &&
        !/outcome is unconfirmed/i.test(reason.message);
      if (definite && (await recovery.clear())) {
        if (!owned()) return;
        setPending(null);
        setUnconfirmed(false);
        onChanged();
      }
      if (owned())
        setError(
          reason instanceof Error
            ? reason.message
            : "The simulated payment could not be recorded.",
        );
    } finally {
      if (owned()) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  if (!payment.synthetic_collection?.enabled) return null;
  return (
    <Stack spacing={1.25} sx={{ mt: 2 }}>
      <Typography variant="subtitle2">Card payment simulator</Typography>
      <Typography variant="body2" color="text.secondary">
        Records a test collection, allocation, and receipt. No card details or
        external charge are used.
      </Typography>
      {unconfirmed && (
        <Alert severity="warning">
          This payment attempt has an unconfirmed outcome. Retry the same saved
          attempt to reconcile; do not start another payment.
        </Alert>
      )}
      {!ready && (
        <Alert severity="info">
          {recovery.error ||
            "Payment recovery must be available before recording a simulated outcome."}
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="info">{notice}</Alert>}
      {actionsEnabled && (payment.synthetic_collection.eligible || pending) && (
        <Stack direction="row" spacing={1}>
          {pending ? (
            <Button
              disabled={busy || !ready}
              onClick={() => void collect(pending!.outcome)}
            >
              {busy ? "Recording…" : "Retry same payment attempt"}
            </Button>
          ) : (
            <>
              <Button
                variant="contained"
                disabled={busy || !ready}
                onClick={() => setConfirmation("succeeded")}
              >
                Simulate approved card
              </Button>
              <Button
                variant="outlined"
                disabled={busy || !ready}
                onClick={() => setConfirmation("failed")}
              >
                Simulate declined card
              </Button>
            </>
          )}
        </Stack>
      )}
      <Dialog
        open={confirmation !== null}
        onClose={() => !busy && setConfirmation(null)}
        fullWidth
        maxWidth="sm"
        aria-labelledby={titleId}
      >
        <DialogTitle id={titleId}>Review simulated card payment</DialogTitle>
        <DialogContent>
          <Typography>
            {subscriptionMoney(payment.amount, payment.currency)} ·{" "}
            {confirmation === "succeeded" ? "Approved" : "Declined"}
          </Typography>
          <Typography sx={{ mt: 1 }}>
            An approved result saves a payment and receipt against this invoice.
            A declined result saves the attempt without changing the balance.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmation(null)}
            disabled={busy || !ready}
          >
            Go back
          </Button>
          <Button
            variant="contained"
            disabled={busy || !ready || confirmation === null}
            onClick={() => confirmation && void collect(confirmation)}
          >
            Record simulated outcome
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
