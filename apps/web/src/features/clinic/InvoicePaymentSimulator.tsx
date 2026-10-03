import { useId, useRef, useState } from "react";
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
import { subscriptionMoney } from "./subscriptions/contracts";

type Outcome = "succeeded" | "failed";
type Attempt = { request_key: string; amount: string; outcome: Outcome };

export function InvoicePaymentSimulator({
  payment,
  endpoint,
  actionsEnabled,
  onChanged,
}: {
  payment: InvoiceOnlinePayment;
  endpoint: string;
  actionsEnabled: boolean;
  onChanged: () => void;
}) {
  const titleId = useId();
  const [confirmation, setConfirmation] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pending = useRef<Attempt | null>(null);
  const collect = async (outcome: Outcome) => {
    if (busy) return;
    const attempt = pending.current ?? {
      request_key: crypto.randomUUID(),
      amount: payment.amount,
      outcome,
    };
    pending.current = attempt;
    setBusy(true);
    setError("");
    setNotice("");
    setConfirmation(null);
    try {
      const result = await api<{
        simulation: { state: Outcome; collection_intent_id: number };
      }>(`${endpoint}/simulate`, {
        method: "POST",
        body: { online_payment: attempt },
      });
      pending.current = null;
      setNotice(
        result.simulation.state === "succeeded"
          ? `Simulated card payment recorded. Collection #${result.simulation.collection_intent_id}; the invoice balance and receipt are saved.`
          : `Simulated card declined. Collection #${result.simulation.collection_intent_id}; no payment was allocated.`,
      );
      onChanged();
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        [400, 403, 404, 409, 422].includes(reason.status)
      ) {
        pending.current = null;
        onChanged();
      }
      setError(
        reason instanceof Error
          ? reason.message
          : "The simulated payment could not be recorded.",
      );
    } finally {
      setBusy(false);
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
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="info">{notice}</Alert>}
      {actionsEnabled &&
        (payment.synthetic_collection.eligible || pending.current) && (
          <Stack direction="row" spacing={1}>
            {pending.current ? (
              <Button
                disabled={busy}
                onClick={() => void collect(pending.current!.outcome)}
              >
                {busy ? "Recording…" : "Retry same payment attempt"}
              </Button>
            ) : (
              <>
                <Button
                  variant="contained"
                  disabled={busy}
                  onClick={() => setConfirmation("succeeded")}
                >
                  Simulate approved card
                </Button>
                <Button
                  variant="outlined"
                  disabled={busy}
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
          <Button onClick={() => setConfirmation(null)} disabled={busy}>
            Go back
          </Button>
          <Button
            variant="contained"
            disabled={busy || confirmation === null}
            onClick={() => confirmation && void collect(confirmation)}
          >
            Record simulated outcome
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
