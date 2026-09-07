import { useEffect, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  ThemeProvider,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type {
  DevelopmentAccount,
  PatientPortalContext,
  RuntimeEnvironment,
  User,
} from "../../api/contracts";
import { api } from "../../api/client";
import { useResource } from "../../shared/ui";
import { membershipTheme } from "../clinic/subscriptions/membershipTheme";
import { PatientSubscriptions } from "./PatientSubscriptions";
import { PatientAppointmentRequests } from "./PatientAppointmentRequests";
import { patientPortalLabel } from "./patientPortalLabels";
import { subscriptionMoney } from "../clinic/subscriptions/contracts";
import { DevelopmentToolbar } from "../identity/DevelopmentAccountSwitcher";
import {
  clearInvoicePaymentReturnMarker,
  InvoiceCheckoutControls,
  invoicePaymentReturnMarker,
} from "../clinic/InvoiceCheckoutControls";

export function PatientPortal({
  user,
  developmentAccounts = [],
  environment = "unknown",
  businessDate = "",
}: {
  user?: User;
  developmentAccounts?: DevelopmentAccount[];
  environment?: RuntimeEnvironment;
  businessDate?: string;
}) {
  const resource = useResource<PatientPortalContext>(
    "/api/patient_portal/context",
  );
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  const [checkoutReturn, setCheckoutReturn] = useState(() =>
    invoicePaymentReturnMarker(),
  );
  const [checkoutReturnError, setCheckoutReturnError] = useState("");
  const [checkoutReturnNotice, setCheckoutReturnNotice] = useState("");
  const [checkingCheckoutReturn, setCheckingCheckoutReturn] = useState(false);
  const [checkoutReturnRetry, setCheckoutReturnRetry] = useState(0);
  const checkoutReturnHandled = useRef(false);
  const context = resource.data;

  useEffect(() => {
    if (!checkoutReturn || !context || checkoutReturnHandled.current) return;
    checkoutReturnHandled.current = true;
    const pending = context.billing.invoices.filter((invoice) =>
      ["processing", "needs_reconciliation"].includes(
        invoice.online_payment.state,
      ),
    );
    setCheckingCheckoutReturn(true);
    setCheckoutReturnError("");
    Promise.allSettled(
      pending.map((invoice) =>
        api(`/api/patient_portal/invoices/${invoice.id}/online_payment/reconcile`, {
          method: "POST",
        }),
      ),
    )
      .then((results) => {
        if (results.some((result) => result.status === "rejected")) {
          setCheckoutReturnError(
            "Payment status could not be refreshed. Retry before choosing another payment method.",
          );
          return;
        }
        resource.refresh();
        setCheckoutReturnNotice(
          checkoutReturn === "cancel"
            ? "You returned from checkout. Review the refreshed invoice status before continuing or cancelling."
            : "Payment status was refreshed. A return from Stripe does not confirm payment by itself.",
        );
        clearInvoicePaymentReturnMarker();
        setCheckoutReturn(null);
      })
      .finally(() => setCheckingCheckoutReturn(false));
  }, [checkoutReturn, checkoutReturnRetry, context]);

  const retryCheckoutReturn = () => {
    checkoutReturnHandled.current = false;
    setCheckoutReturnRetry((value) => value + 1);
  };

  return (
    <ThemeProvider theme={membershipTheme}>
      {user?.development_demo && (
        <DevelopmentToolbar
          accounts={developmentAccounts}
          activeId={user.development_account_id}
          businessDate={businessDate}
          environment={environment}
        />
      )}
      <Box
        component="main"
        id="main"
        sx={{
          minHeight: "100vh",
          bgcolor: "background.default",
          color: "text.primary",
          p: { xs: 2, md: 4 },
          "& a:focus-visible, & button:focus-visible": {
            outline: "3px solid #9b5b24",
            outlineOffset: 3,
          },
        }}
      >
        <Stack spacing={3} sx={{ maxWidth: 1200, mx: "auto" }}>
          <Stack
            direction="row"
            component="header"
            sx={{ justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}
          >
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 20 }}>
                {context?.practice.name || "Your clinic"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Your membership. Your wellbeing.
              </Typography>
            </Box>
            <Stack
              component="nav"
              aria-label="Patient portal"
              direction="row"
              sx={{ gap: { xs: 0.5, sm: 2 }, flexWrap: "wrap" }}
            >
              <Button href="#memberships">Explore plans</Button>
              <Button href="#appointments">Request appointment</Button>
              <Button href="#my-memberships">My memberships</Button>
              <Button href="#billing">Billing</Button>
              {!user?.development_demo && (
                <Button
                  onClick={async () => {
                    try {
                      await api("/api/session", { method: "DELETE" });
                      window.location.assign("/login");
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Unable to sign out.",
                      );
                    }
                  }}
                >
                  Sign out
                </Button>
              )}
            </Stack>
          </Stack>
          {!context && !resource.error && (
            <CircularProgress aria-label="Loading patient portal" />
          )}
          {(resource.error || error) && (
            <Alert severity="error">{resource.error || error}</Alert>
          )}
          {checkingCheckoutReturn && (
            <Alert severity="info" role="status">
              Checking payment status… A return from Stripe does not confirm
              that a payment was completed.
            </Alert>
          )}
          {checkoutReturnError && (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={retryCheckoutReturn}
                >
                  Retry
                </Button>
              }
            >
              {checkoutReturnError}
            </Alert>
          )}
          {checkoutReturnNotice && (
            <Alert severity="info">{checkoutReturnNotice}</Alert>
          )}
          {context && (
            <>
              <Box
                component="section"
                sx={{
                  bgcolor: "#203f34",
                  color: "#f6f7ed",
                  borderRadius: 3,
                  px: { xs: 3, md: 6 },
                  py: { xs: 4, md: 5.5 },
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "1.25fr 0.75fr" },
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Box>
                  <Typography
                    component="h1"
                    sx={{
                      fontFamily: "Georgia, serif",
                      fontSize: { xs: 42, sm: 56, md: 64 },
                      lineHeight: 1.05,
                      letterSpacing: "-0.045em",
                      maxWidth: 600,
                    }}
                  >
                    A little more care.
                    <br />
                    <Box component="span" sx={{ color: "#d9e6b8" }}>
                      A lot more you.
                    </Box>
                  </Typography>
                </Box>
                <Box>
                  <Typography
                    sx={{
                      color: "#e0e8de",
                      fontSize: 18,
                      lineHeight: 1.65,
                      maxWidth: 380,
                    }}
                  >
                    Make room for your wellbeing with a membership built around
                    the services that matter to you.
                  </Typography>
                  <Button
                    href="#memberships"
                    variant="contained"
                    size="large"
                    sx={{
                      mt: 3,
                      bgcolor: "#d9e6b8",
                      color: "#203f34",
                      "&:hover": { bgcolor: "#e7efd1" },
                    }}
                  >
                    Find my membership
                  </Button>
                  <Typography
                    variant="body2"
                    sx={{ mt: 1.5, color: "#e0e8de" }}
                  >
                    Clear inclusions. Your choice of plan.
                  </Typography>
                </Box>
              </Box>
              <Box
                sx={{
                  py: 1,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  sx={{
                    gap: 2,
                    alignItems: { sm: "center" },
                    justifyContent: "space-between",
                  }}
                >
                  <Box>
                    <Typography sx={{ fontWeight: 600 }}>
                      {patientPortalLabel(context.patient.display_name)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Patient reference ·{" "}
                      {patientPortalLabel(context.patient.reference)}
                    </Typography>
                  </Box>
                  {context.development_preview && (
                    <TextField
                      select
                      size="small"
                      sx={{ minWidth: { sm: 300 }, maxWidth: "100%" }}
                      label="Patient view"
                      disabled={switching}
                      value={context.development_preview.selected_patient_id}
                      onChange={async (e) => {
                        setSwitching(true);
                        setError("");
                        try {
                          await api("/api/patient_portal/development_patient", {
                            method: "PATCH",
                            body: { patient_id: Number(e.target.value) },
                          });
                          resource.refresh();
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Unable to switch patient.",
                          );
                        } finally {
                          setSwitching(false);
                        }
                      }}
                    >
                      {context.development_preview.patients.map((p) => (
                        <MenuItem key={p.id} value={p.id}>
                          {patientPortalLabel(p.display_name)} ·{" "}
                          {patientPortalLabel(p.reference)}
                        </MenuItem>
                      ))}
                    </TextField>
                  )}
                </Stack>
              </Box>
              {!switching && (
                <PatientSubscriptions
                  key={context.patient.id}
                  onChanged={resource.refresh}
                />
              )}
              {!switching && <PatientAppointmentRequests key={context.patient.id} />}
              <Paper
                id="billing"
                variant="outlined"
                sx={{ p: 3, scrollMarginTop: 24 }}
              >
                <Stack spacing={2}>
                  <Typography variant="h5" component="h2">
                    Your billing
                  </Typography>
                  {!context.balances.length && (
                    <Typography>No billing activity yet.</Typography>
                  )}
                  {context.balances.map((b) => (
                    <Box key={b.currency}>
                      <Typography variant="h6">
                        {subscriptionMoney(b.balance_amount, b.currency)}{" "}
                        outstanding
                      </Typography>
                      <Typography variant="body2">
                        Paid {subscriptionMoney(b.allocated_amount, b.currency)}{" "}
                        · Refunded{" "}
                        {subscriptionMoney(b.refunded_amount, b.currency)}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </Paper>
              <Paper variant="outlined" sx={{ p: 3 }}>
                <Stack spacing={2}>
                  <Typography variant="h5" component="h2">
                    Billing history
                  </Typography>
                  {!context.billing.invoices.length && (
                    <Typography>No invoices yet.</Typography>
                  )}
                  {context.billing.invoices.map((invoice) => (
                    <Accordion
                      key={invoice.id}
                      variant="outlined"
                      disableGutters
                    >
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography>
                          Invoice #{invoice.id} · {invoice.status} ·{" "}
                          {subscriptionMoney(
                            invoice.balance_amount,
                            invoice.currency,
                          )}{" "}
                          due
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Stack spacing={1}>
                          {invoice.lines.map((line) => (
                            <Typography key={line.id}>
                              {line.description} ·{" "}
                              {subscriptionMoney(
                                line.posted_amount,
                                invoice.currency,
                              )}
                            </Typography>
                          ))}
                          <Typography>
                            Total{" "}
                            {subscriptionMoney(
                              invoice.total_amount,
                              invoice.currency,
                            )}{" "}
                            · Allocated{" "}
                            {subscriptionMoney(
                              invoice.allocated_amount,
                              invoice.currency,
                            )}{" "}
                            · Credits{" "}
                            {subscriptionMoney(
                              invoice.credit_amount,
                              invoice.currency,
                            )}
                          </Typography>
                          <InvoiceCheckoutControls
                            key={invoice.id}
                            onlinePayment={invoice.online_payment}
                            endpoint={`/api/patient_portal/invoices/${invoice.id}/online_payment`}
                            actionLabel="Pay securely"
                            actionsEnabled={context.capabilities.payment_collection}
                            onChanged={resource.refresh}
                          />
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  ))}
                  <Typography variant="h6" component="h3">
                    Payments and refunds
                  </Typography>
                  {!context.billing.payments.length && (
                    <Typography>No payments recorded.</Typography>
                  )}
                  {context.billing.payments.map((payment) => (
                    <Box key={payment.id}>
                      <Typography>
                        Payment #{payment.id} ·{" "}
                        {subscriptionMoney(payment.amount, payment.currency)} ·{" "}
                        {new Date(payment.created_at).toLocaleDateString()}
                      </Typography>
                      {payment.refunds.map((refund) => (
                        <Typography key={refund.id} variant="body2">
                          Refund #{refund.id} ·{" "}
                          {subscriptionMoney(refund.amount, payment.currency)} ·{" "}
                          {new Date(refund.created_at).toLocaleDateString()}
                        </Typography>
                      ))}
                    </Box>
                  ))}
                </Stack>
              </Paper>
            </>
          )}
        </Stack>
      </Box>
    </ThemeProvider>
  );
}
