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
};

export function MembershipAccount() {
  const resource = useResource<{ enrollment: Enrollment }>(
    "/api/public/membership_accounts/current",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enrollment = resource.data?.enrollment;

  useEffect(() => {
    if (enrollment?.redirect_to)
      window.location.replace(enrollment.redirect_to);
  }, [enrollment?.redirect_to]);

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError("");
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
            Finish your membership
          </Typography>
          {resource.error && <Alert severity="error">{resource.error}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
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
              <Typography color="text.secondary">
                Complete payment to start your membership and patient
                onboarding. If you leave before paying, your account and
                membership selection are saved, and the clinic can contact you
                to help. You’ll use this same login for your patient portal.
              </Typography>
              {!enrollment.can_pay && !enrollment.redirect_to && (
                <Alert severity="info">
                  {enrollment.stage === "closed"
                    ? "The clinic has closed this enrollment. Contact them to continue."
                    : "The clinic is processing your enrollment. Check the status below or contact them for help."}
                </Alert>
              )}
              {enrollment.can_pay && (
                <Button
                  variant="contained"
                  size="large"
                  disabled={busy}
                  onClick={() => void pay()}
                >
                  {busy
                    ? "Opening secure payment…"
                    : "Continue to secure payment"}
                </Button>
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
