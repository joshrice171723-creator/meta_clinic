import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { InvoiceOnlinePayment } from "../../api/contracts";
import { useWorkingDraft } from "./useWorkingDraft";

type CheckoutEnvelope = {
  online_payment: InvoiceOnlinePayment;
};
type CheckoutAction = "start" | "reconcile" | "cancel";
type CheckoutConfirmation = "start" | "cancel";

function openHostedStripeCheckout(checkoutUrl: string) {
  const url = new URL(checkoutUrl);
  if (
    url.protocol !== "https:" ||
    !["checkout.stripe.com", "invoice.stripe.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error("Stripe returned an invalid Checkout address.");
  }
  window.location.assign(url.href);
}

function unavailableMessage(reason: InvoiceOnlinePayment["reason"]) {
  const messages: Record<
    NonNullable<InvoiceOnlinePayment["reason"]>,
    string
  > = {
    membership_managed: "This invoice is managed through membership billing.",
    invoice_not_posted:
      "Post this invoice before collecting an online payment.",
    no_balance: "This invoice has no remaining balance to collect online.",
    unsupported_currency:
      "Hosted online payment is currently available for USD invoices only.",
    stripe_unavailable:
      "Hosted online payment is unavailable for this clinic right now.",
    checkout_active: "An online checkout is already active for this invoice.",
    provider_reconciliation_required:
      "Refresh payment status before choosing another payment method.",
  };
  return reason
    ? messages[reason]
    : "Hosted online payment is unavailable for this invoice.";
}

export function invoicePaymentReturnMarker(): "return" | "cancel" | null {
  const value = new URLSearchParams(window.location.search).get(
    "invoice_payment",
  );
  return value === "return" || value === "cancel" ? value : null;
}

export function clearInvoicePaymentReturnMarker() {
  const url = new URL(window.location.href);
  url.searchParams.delete("invoice_payment");
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function InvoiceCheckoutControls({
  onlinePayment,
  endpoint,
  actionLabel,
  actionsEnabled = true,
  allowPaidRefresh = false,
  patientId,
  encounterId,
  invoiceId,
  onChanged,
}: {
  onlinePayment: InvoiceOnlinePayment;
  endpoint: string;
  actionLabel: "Pay securely" | "Collect online";
  actionsEnabled?: boolean;
  allowPaidRefresh?: boolean;
  patientId?: number;
  encounterId?: number;
  invoiceId?: number;
  onChanged: () => void;
}) {
  const [payment, setPayment] = useState(onlinePayment);
  const [busy, setBusy] = useState<CheckoutAction | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<CheckoutConfirmation | null>(
    null,
  );
  const startKey = useRef<string | undefined>(undefined);
  const cancelKey = useRef<string | undefined>(undefined);
  const recovery = useWorkingDraft<{
    action: "start" | "cancel";
    invoiceId: number;
    requestKey: string;
  }>({
    kind: "checkout",
    scope: "online_payment",
    patientId,
    encounterId,
    recordId: invoiceId,
    enabled: patientId !== undefined && invoiceId !== undefined,
  });

  useEffect(() => {
    const restored = recovery.restored;
    if (!recovery.ready || !restored || restored.invoiceId !== invoiceId)
      return;
    if (["available", "paid", "unavailable"].includes(onlinePayment.state)) {
      void recovery.clear();
      return;
    }
    if (restored.action === "start") startKey.current = restored.requestKey;
    else cancelKey.current = restored.requestKey;
    setError(
      `A saved online payment ${restored.action} attempt was restored. Refresh payment status before retrying the same action.`,
    );
  }, [
    invoiceId,
    onlinePayment.state,
    recovery.clear,
    recovery.ready,
    recovery.restored,
  ]);

  useEffect(() => {
    setPayment(onlinePayment);
    if (["available", "paid", "unavailable"].includes(onlinePayment.state)) {
      startKey.current = undefined;
    }
    if (!onlinePayment.can_cancel) cancelKey.current = undefined;
  }, [onlinePayment]);

  useEffect(() => {
    setPayment(onlinePayment);
    setError("");
    setNotice("");
    startKey.current = undefined;
    cancelKey.current = undefined;
  }, [endpoint]);

  const run = async (action: CheckoutAction) => {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      const requestKey =
        action === "start"
          ? (startKey.current ??= crypto.randomUUID())
          : action === "cancel"
            ? (cancelKey.current ??= crypto.randomUUID())
            : undefined;
      const durableAction =
        action === "start" || action === "cancel" ? action : null;
      if (
        requestKey &&
        durableAction &&
        invoiceId !== undefined &&
        !(await recovery.save({ action: durableAction, invoiceId, requestKey }))
      ) {
        setError(
          recovery.error ||
            "The payment attempt could not be saved for recovery. Try again before continuing.",
        );
        return;
      }
      const result = await api<CheckoutEnvelope>(`${endpoint}/${action}`, {
        method: "POST",
        ...(requestKey
          ? { body: { online_payment: { request_key: requestKey } } }
          : {}),
      });
      setPayment(result.online_payment);
      if (
        ["available", "paid", "unavailable"].includes(
          result.online_payment.state,
        )
      ) {
        startKey.current = undefined;
      }
      if (!result.online_payment.can_cancel) cancelKey.current = undefined;
      if (requestKey && !(await recovery.clear())) {
        setError(
          recovery.error ||
            "The payment status changed, but the recovery record could not be cleared. Refresh payment status before another action.",
        );
        return;
      }
      onChanged();
      if (action === "start" && result.online_payment.checkout_url) {
        openHostedStripeCheckout(result.online_payment.checkout_url);
        return;
      }
      if (action === "cancel") {
        setNotice(
          result.online_payment.can_cancel
            ? "Checkout cancellation is still being confirmed. Refresh payment status before recording another payment."
            : "Checkout status was updated.",
        );
      } else {
        setNotice(
          action === "reconcile"
            ? "Payment status refreshed from Stripe."
            : "Checkout is ready to continue.",
        );
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Online payment could not be updated.",
      );
    } finally {
      setBusy(null);
    }
  };

  const pending = ["processing", "needs_reconciliation"].includes(
    payment.state,
  );
  const canStart =
    actionsEnabled && payment.state === "available" && payment.eligible;
  const canRefreshPaid =
    allowPaidRefresh && actionsEnabled && payment.state === "paid";
  const closeConfirmation = () => {
    if (!busy) setConfirmation(null);
  };
  const confirmAction = () => {
    if (!confirmation) return;
    const action = confirmation;
    setConfirmation(null);
    void run(action);
  };
  return (
    <>
      <Stack spacing={1.25} sx={{ mt: 2 }}>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ alignItems: "center", flexWrap: "wrap" }}
        >
          <Typography variant="subtitle2">Hosted online payment</Typography>
          <Chip size="small" variant="outlined" label="Test mode" />
        </Stack>
        {invoiceId !== undefined && (
          <Typography variant="body2" color="text.secondary">
            Invoice #{invoiceId}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary">
          Online payment amount: {payment.currency} {payment.amount}
        </Typography>
        {payment.state === "unavailable" && (
          <Typography variant="body2" color="text.secondary">
            {unavailableMessage(payment.reason)}
          </Typography>
        )}
        {payment.state === "paid" && (
          <Typography variant="body2" color="text.secondary">
            This invoice has no remaining balance.
          </Typography>
        )}
        {pending && !actionsEnabled && (
          <Typography variant="body2" color="text.secondary">
            Online payment status is being updated.
          </Typography>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="info">{notice}</Alert>}
        {(canStart || (pending && actionsEnabled) || canRefreshPaid) && (
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ flexWrap: "wrap" }}
          >
            {(canStart || payment.state === "processing") && (
              <Button
                variant="contained"
                disabled={busy !== null}
                onClick={() => setConfirmation("start")}
              >
                {busy === "start"
                  ? "Opening Stripe…"
                  : payment.state === "processing"
                    ? "Continue payment"
                    : actionLabel}
              </Button>
            )}
            {pending && (
              <Button
                variant="outlined"
                disabled={busy !== null}
                onClick={() => void run("reconcile")}
              >
                {busy === "reconcile" ? "Checking…" : "Refresh payment status"}
              </Button>
            )}
            {canRefreshPaid && (
              <Button
                variant="outlined"
                disabled={busy !== null}
                onClick={() => void run("reconcile")}
                sx={{ minHeight: 44 }}
              >
                {busy === "reconcile" ? "Checking…" : "Refresh Stripe payment"}
              </Button>
            )}
            {pending && payment.can_cancel && (
              <Button
                color="error"
                disabled={busy !== null}
                onClick={() => setConfirmation("cancel")}
              >
                {busy === "cancel" ? "Cancelling…" : "Cancel online payment"}
              </Button>
            )}
          </Stack>
        )}
      </Stack>
      <Dialog
        fullWidth
        maxWidth="sm"
        open={confirmation !== null}
        onClose={closeConfirmation}
        aria-labelledby="invoice-checkout-confirmation-title"
      >
        <DialogTitle id="invoice-checkout-confirmation-title">
          {confirmation === "cancel"
            ? "Cancel online payment?"
            : "Review online payment"}
        </DialogTitle>
        <DialogContent dividers>
          {invoiceId !== undefined && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Invoice #{invoiceId}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Online payment amount: {payment.currency} {payment.amount}
          </Typography>
          <Typography>
            {confirmation === "cancel"
              ? "This ends the active hosted checkout for this invoice. No payment will be collected, and the status will be refreshed before another method is used."
              : "This opens the secure hosted checkout for the invoice. Review the invoice balance before continuing to Stripe."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy !== null} onClick={closeConfirmation}>
            Go back
          </Button>
          <Button
            color={confirmation === "cancel" ? "error" : "primary"}
            disabled={busy !== null}
            onClick={confirmAction}
            variant="contained"
          >
            {confirmation === "cancel"
              ? "Cancel online payment"
              : "Continue to Stripe"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
