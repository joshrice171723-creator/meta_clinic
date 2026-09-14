import { useEffect, useState } from "react";
import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material";
import { api } from "../../api/client";
import { useResource } from "../../shared/ui";
import { subscriptionMoney } from "../clinic/subscriptions/contracts";

type Enrollment = {
  clinic_name: string;
  package_name: string;
  amount: string;
  currency: string;
  renewal: string;
  stage: string;
  can_pay: boolean;
  redirect_to: string | null;
  local_simulator: {
    enabled: boolean;
    source?: "local_membership_payment_simulator";
    vendor_confirmed?: false;
    evidence?: "server_signed_local_event";
    checkout_started?: boolean;
    payment_verified?: boolean;
    recurring?: boolean;
    renewal_status?: string | null;
    renewal_invoice_status?: string | null;
    renewal_amount_due?: string | null;
    cancel_at_period_end?: boolean;
  };
};

export function MembershipAccount() {
  const resource = useResource<{ enrollment: Enrollment }>(
    "/api/public/membership_accounts/current",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const enrollment = resource.data?.enrollment;
  const localMode =
    new URLSearchParams(window.location.search).get("payment") === "local";

  useEffect(() => {
    if (enrollment?.redirect_to && !localMode)
      window.location.replace(enrollment.redirect_to);
  }, [enrollment?.redirect_to, localMode]);

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ checkout: { url: string } }>(
        "/api/public/membership_accounts/checkout",
        { method: "POST" },
      );
      window.location.assign(result.checkout.url);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Payment could not be opened. Please try again.",
      );
      setBusy(false);
    }
  }

  async function simulate(
    outcome: "paid" | "renewal_failed" | "cancel_at_period_end",
  ) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/public/membership_accounts/local_payment", {
        method: "POST",
        body: {
          payment: { outcome, request_key: crypto.randomUUID() },
        },
      });
      setNotice(
        outcome === "paid"
          ? "The signed local payment event was verified and reconciled."
          : outcome === "renewal_failed"
            ? "The signed local renewal-failure event was verified and reconciled."
            : "The signed local cancellation event was verified. Future renewals are canceled after the paid period.",
      );
      resource.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The local payment event could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await api("/api/session", { method: "DELETE" });
      window.location.replace("/login?next=%2Fmemberships%2Faccount");
    } catch {
      setError("Sign out could not be confirmed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Box
      component="main"
      id="main"
      sx={{
        minHeight: "100vh",
        bgcolor: "background.default",
        px: 2,
        py: { xs: 3, md: 8 },
      }}
    >
      <Paper
        variant="outlined"
        sx={{ maxWidth: 600, mx: "auto", p: { xs: 3, md: 5 } }}
      >
        <Stack spacing={2.5}>
          <Typography variant="overline">Membership account</Typography>
          <Typography component="h1" variant="h4">
            {localMode ? "Local payment simulator" : "Finish your membership"}
          </Typography>
          {resource.error && <Alert severity="error">{resource.error}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {notice && (
            <Alert severity="success" role="status">
              {notice}
            </Alert>
          )}
          {!enrollment && !resource.error && (
            <Typography role="status">Loading your enrollment…</Typography>
          )}
          {enrollment && (
            <>
              <Box>
                <Typography color="text.secondary">
                  {enrollment.clinic_name}
                </Typography>
                <Typography component="h2" variant="h6">
                  {enrollment.package_name}
                </Typography>
                <Typography>
                  {subscriptionMoney(enrollment.amount, enrollment.currency)}
                  {enrollment.renewal === "automatic" ? " per month" : ""}
                </Typography>
              </Box>
              <Alert severity="success">
                Your account is created and your email is verified.
              </Alert>
              {localMode ? (
                <Alert severity="warning">
                  This simulator records server-verified local payment events
                  for this clinic. It does not contact Stripe, process a card,
                  or move money. These results are not vendor-confirmed.
                </Alert>
              ) : (
                <Typography color="text.secondary">
                  Complete payment to start your membership and patient
                  onboarding. If you leave before paying, your account and
                  membership selection are saved, and the clinic can contact you
                  to help. You’ll use this same login for your patient portal.
                </Typography>
              )}
              {!enrollment.can_pay && !enrollment.redirect_to && (
                <Alert severity="info">
                  {enrollment.stage === "closed"
                    ? "The clinic has closed this enrollment. Contact them to continue."
                    : "The clinic is processing your enrollment. Check the status below or contact them for help."}
                </Alert>
              )}
              {enrollment.can_pay && !localMode && (
                <Button
                  variant="contained"
                  size="large"
                  disabled={busy}
                  onClick={() => void pay()}
                >
                  {busy
                    ? "Opening payment…"
                    : enrollment.local_simulator.enabled
                      ? "Continue to local payment"
                      : "Continue to secure payment"}
                </Button>
              )}
              {localMode && !enrollment.local_simulator.enabled && (
                <Alert severity="error">
                  The local simulator is not enabled for this clinic. Return to
                  the membership account or contact the clinic.
                </Alert>
              )}
              {localMode &&
                enrollment.local_simulator.enabled &&
                enrollment.local_simulator.checkout_started &&
                !enrollment.local_simulator.payment_verified && (
                  <Button
                    variant="contained"
                    size="large"
                    disabled={busy}
                    onClick={() => void simulate("paid")}
                  >
                    {busy ? "Verifying local event…" : "Complete local payment"}
                  </Button>
                )}
              {localMode && enrollment.local_simulator.payment_verified && (
                <>
                  <Alert severity="success">
                    Payment is verified in the local ledger. The membership,
                    receipt, patient account, and onboarding work now come from
                    the existing owning records.
                  </Alert>
                  {enrollment.local_simulator.recurring &&
                    enrollment.local_simulator.renewal_invoice_status ===
                      "open" && (
                      <Alert severity="warning">
                        The simulated monthly renewal needs payment
                        {enrollment.local_simulator.renewal_amount_due
                          ? `: ${subscriptionMoney(
                              enrollment.local_simulator.renewal_amount_due,
                              enrollment.currency,
                            )}`
                          : ""}
                        . The current paid-period evidence remains unchanged.
                      </Alert>
                    )}
                  {enrollment.local_simulator.recurring &&
                    enrollment.local_simulator.cancel_at_period_end && (
                      <Alert severity="info">
                        Future renewals are canceled after the current verified
                        paid period.
                      </Alert>
                    )}
                  {enrollment.local_simulator.recurring &&
                    !enrollment.local_simulator.cancel_at_period_end && (
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                      >
                        <Button
                          variant="outlined"
                          disabled={busy}
                          onClick={() => void simulate("renewal_failed")}
                        >
                          {busy ? "Recording…" : "Record renewal failure"}
                        </Button>
                        <Button
                          color="error"
                          variant="outlined"
                          disabled={busy}
                          onClick={() => void simulate("cancel_at_period_end")}
                        >
                          {busy ? "Recording…" : "Cancel future renewals"}
                        </Button>
                      </Stack>
                    )}
                  {enrollment.redirect_to && (
                    <Button variant="contained" href={enrollment.redirect_to}>
                      Continue to patient portal
                    </Button>
                  )}
                </>
              )}
            </>
          )}
          <Stack direction="row" spacing={1}>
            <Button disabled={busy} onClick={() => resource.refresh()}>
              Check payment status
            </Button>
            <Button disabled={busy} onClick={() => void signOut()}>
              Sign out
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
