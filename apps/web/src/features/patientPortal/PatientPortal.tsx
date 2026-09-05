import { useState } from "react";
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
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type { PatientPortalContext } from "../../api/contracts";
import { api } from "../../api/client";
import { useResource } from "../../shared/ui";
import { PatientSubscriptions } from "./PatientSubscriptions";
import { subscriptionMoney } from "../clinic/subscriptions/contracts";

export function PatientPortal() {
  const resource = useResource<PatientPortalContext>(
    "/api/patient_portal/context",
  );
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  const context = resource.data;
  return (
    <Box
      component="main"
      id="main"
      sx={{
        minHeight: "100vh",
        bgcolor: "#f5f7f6",
        color: "#17352f",
        p: { xs: 2, md: 4 },
      }}
    >
      <Stack spacing={3} sx={{ maxWidth: 1120, mx: "auto" }}>
        <Stack
          direction="row"
          sx={{ justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}
        >
          <Typography variant="h4" component="h1">
            Patient portal
          </Typography>
          <Button
            onClick={async () => {
              await api("/api/session", { method: "DELETE" });
              window.location.assign("/login");
            }}
          >
            Sign out
          </Button>
        </Stack>
        {!context && !resource.error && (
          <CircularProgress aria-label="Loading patient portal" />
        )}
        {(resource.error || error) && (
          <Alert severity="error">{resource.error || error}</Alert>
        )}
        {context && (
          <>
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="overline">
                  {context.practice.name}
                </Typography>
                <Typography variant="h5" component="h2">
                  {context.patient.display_name}
                </Typography>
                <Typography color="text.secondary">
                  Patient reference · {context.patient.reference}
                </Typography>
                {context.development_preview && (
                  <TextField
                    select
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
                        {p.display_name} · {p.reference}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              </Stack>
            </Paper>
            {!switching && (
              <PatientSubscriptions
                key={context.patient.id}
                onChanged={resource.refresh}
              />
            )}
            <Paper variant="outlined" sx={{ p: 3 }}>
              <Stack spacing={2}>
                <Typography variant="h5" component="h2">
                  Balances
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
                      Paid {subscriptionMoney(b.allocated_amount, b.currency)} ·
                      Refunded{" "}
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
                  <Accordion key={invoice.id} variant="outlined" disableGutters>
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
  );
}
