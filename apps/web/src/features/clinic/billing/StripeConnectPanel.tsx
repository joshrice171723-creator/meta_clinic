import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Chip, Stack, Typography } from "@mui/material";
import { api } from "../../../api/client";
import { LoadState, useResource } from "../../../shared/ui";
import { subscriptionDate } from "../subscriptions/contracts";

export type StripeConnectionStatus = {
  configured: boolean;
  connected: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  application_fee_percent: string;
  mode: "test";
  can_manage: boolean;
  last_synced_at?: string | null;
};

export type StripeSetupReturnMarker = "return" | "refresh" | null;

export function stripeSetupReturnMarker(): StripeSetupReturnMarker {
  if (typeof window === "undefined") return null;
  const marker = new URLSearchParams(window.location.search).get(
    "stripe_setup",
  );
  return marker === "return" || marker === "refresh" ? marker : null;
}

function clearStripeSetupReturnMarker() {
  const url = new URL(window.location.href);
  url.searchParams.delete("stripe_setup");
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function StripeConnectPanel() {
  const resource = useResource<StripeConnectionStatus>(
    "/api/clinic/stripe_connect",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [returnMarker, setReturnMarker] = useState<StripeSetupReturnMarker>(
    stripeSetupReturnMarker,
  );
  const returnCheckStarted = useRef(false);
  const data = resource.data;
  const act = async (
    action: "onboard" | "refresh",
    clearReturnMarker = false,
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url?: string }>(
        `/api/clinic/stripe_connect/${action}`,
        { method: "POST", body: {} },
      );
      if (result.url) {
        const url = new URL(result.url);
        if (
          url.protocol !== "https:" ||
          url.hostname !== "connect.stripe.com" ||
          url.username ||
          url.password ||
          url.port
        ) {
          throw new Error("Stripe returned an invalid onboarding link.");
        }
        window.location.assign(url.href);
      } else {
        if (clearReturnMarker) {
          clearStripeSetupReturnMarker();
          setReturnMarker(null);
        }
        resource.refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Stripe connection could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!data || !returnMarker || returnCheckStarted.current) return;
    returnCheckStarted.current = true;
    void act("refresh", true);
  }, [data, returnMarker]);

  const retryReturnCheck = () => {
    returnCheckStarted.current = true;
    void act("refresh", true);
  };

  if (!data) return <LoadState error={resource.error} />;
  const paymentsReady = data.charges_enabled;
  const setupComplete = paymentsReady && data.payouts_enabled;
  return (
    <Stack spacing={2.5}>
      {(error || resource.error) && (
        <Alert severity="error">{error || resource.error}</Alert>
      )}
      <Alert
        severity={
          setupComplete ? "success" : data.connected ? "warning" : "info"
        }
      >
        {!data.configured
          ? "Platform sandbox configuration is required before clinic setup can begin."
          : setupComplete
            ? "Stripe sandbox is ready to collect eligible invoice and membership payments for this clinic."
            : paymentsReady
              ? "Card payments are available for eligible invoice and membership payments. Payout setup is still incomplete in Stripe."
              : data.connected
                ? "Clinic onboarding is incomplete. Finish setup in Stripe, then check the connection again."
                : "Connect this clinic to Stripe before collecting eligible invoice or membership payments."}
      </Alert>
      {returnMarker && busy && (
        <Alert severity="info">Checking the clinic’s Stripe connection…</Alert>
      )}
      {returnMarker && error && (
        <Button
          variant="outlined"
          disabled={busy}
          onClick={retryReturnCheck}
          sx={{ alignSelf: "flex-start" }}
        >
          Retry connection check
        </Button>
      )}
      <Box
        className="billing-stripe-status"
        aria-label="Stripe connection status"
      >
        <div>
          <span>Environment</span>
          <Chip size="small" label="Sandbox only" />
        </div>
        <div>
          <span>Card payments</span>
          <strong>{data.charges_enabled ? "Enabled" : "Not enabled"}</strong>
        </div>
        <div>
          <span>Payouts</span>
          <strong>{data.payouts_enabled ? "Enabled" : "Not enabled"}</strong>
        </div>
        <div>
          <span>APPly application fee</span>
          <strong>{data.application_fee_percent}% per payment</strong>
        </div>
      </Box>
      <Stack spacing={0.75}>
        <Typography>
          Eligible invoice payments, membership payments, and monthly renewals
          are direct charges on the clinic’s connected account. Stripe
          processing fees and payouts belong to the clinic.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Stripe collects bank and business details on its own website. APPly
          never collects card details here, and live collection remains
          disabled.
        </Typography>
        {data.last_synced_at && (
          <Typography variant="body2" color="text.secondary">
            Connection last checked{" "}
            {subscriptionDate(data.last_synced_at, true)}.
          </Typography>
        )}
      </Stack>
      {!data.configured && (
        <Typography variant="body2">
          An APPly administrator must securely configure the Stripe sandbox API
          key and Connect webhook outside the browser before clinic onboarding
          can begin.
        </Typography>
      )}
      {data.can_manage ? (
        <Stack direction="row" sx={{ gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            disabled={busy || !data.configured}
            onClick={() => void act("onboard")}
          >
            {busy
              ? "Opening Stripe…"
              : data.connected
                ? "Continue setup in Stripe"
                : "Connect clinic with Stripe"}
          </Button>
          {data.connected && (
            <Button
              variant="outlined"
              disabled={busy || !data.configured}
              onClick={() => void act("refresh")}
            >
              {busy ? "Checking…" : "Check connection"}
            </Button>
          )}
        </Stack>
      ) : (
        <Typography variant="body2">
          You can review this status. A clinic administrator with membership
          publishing and payment permissions must manage the Stripe connection.
        </Typography>
      )}
    </Stack>
  );
}
