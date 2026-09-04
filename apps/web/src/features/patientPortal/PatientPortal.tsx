import { useState } from "react";
import type { PatientPortalContext } from "../../api/contracts";
import { api } from "../../api/client";
import { Form, useResource } from "../../shared/ui";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

function money(currency: string, amount: string) {
  return `${currency} ${amount}`;
}

export function PatientPortal() {
  const resource = useResource<PatientPortalContext>(
    "/api/patient_portal/context",
  );
  const context = resource.data;
  const [previewError, setPreviewError] = useState("");
  const [switchingPatient, setSwitchingPatient] = useState(false);

  async function switchPreviewPatient(patientId: number) {
    if (
      switchingPatient ||
      patientId === context?.development_preview?.selected_patient_id
    )
      return;
    setSwitchingPatient(true);
    setPreviewError("");
    try {
      await api("/api/patient_portal/development_patient", {
        method: "PATCH",
        body: { patient_id: patientId },
      });
      resource.refresh();
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : "The development patient could not be changed.",
      );
    } finally {
      setSwitchingPatient(false);
    }
  }

  return (
    <Box
      component="main"
      id="main"
      sx={{
        minHeight: "100vh",
        bgcolor: "#f5f7f6",
        color: "#17352f",
        px: { xs: 2, sm: 4 },
        py: { xs: 2, md: 5 },
      }}
    >
      <Box sx={{ maxWidth: 1120, mx: "auto" }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{
            mb: 5,
            gap: 2,
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box>
            <Typography
              component="p"
              variant="overline"
              sx={{ letterSpacing: "0.12em", color: "#58756e" }}
            >
              APPly · Patient portal
            </Typography>
            <Typography
              component="h1"
              variant="h3"
              sx={{ fontWeight: 700, letterSpacing: "-0.03em" }}
            >
              Billing at a glance.
            </Typography>
          </Box>
          <Form
            endpoint="/api/session"
            method="DELETE"
            submit="Sign out"
            className="patient-portal-signout"
            onSuccess={() => window.location.replace("/login")}
          />
        </Stack>

        {!context && !resource.error && (
          <CircularProgress aria-label="Loading patient portal" />
        )}
        {resource.error && <Alert severity="error">{resource.error}</Alert>}
        {context && (
          <Stack spacing={3}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2.5, md: 4 },
                border: "1px solid #d6e1dd",
                borderRadius: 3,
              }}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                sx={{ gap: 2, justifyContent: "space-between" }}
              >
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Signed in as
                  </Typography>
                  <Typography variant="h4" sx={{ mt: 0.5, fontWeight: 700 }}>
                    {context.patient.display_name}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mt: 0.5 }}
                  >
                    Patient reference · {context.patient.reference}
                  </Typography>
                </Box>
                <Chip
                  icon={<LockOutlinedIcon />}
                  label="Private read-only session"
                  color="success"
                  variant="outlined"
                  sx={{ alignSelf: "flex-start" }}
                />
              </Stack>
            </Paper>

            {context.development_preview && (
              <Paper
                elevation={0}
                sx={{
                  p: 3,
                  border: "1px solid #d6e1dd",
                  borderRadius: 3,
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Development patient preview
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  Omni can inspect each development patient&apos;s billing view.
                  This selector is session-scoped and read-only.
                </Typography>
                <Select
                  fullWidth
                  value={context.development_preview.selected_patient_id}
                  onChange={(event) =>
                    void switchPreviewPatient(Number(event.target.value))
                  }
                  disabled={switchingPatient}
                  inputProps={{ "aria-label": "Development patient" }}
                  sx={{ mt: 2, maxWidth: 520 }}
                >
                  {context.development_preview.patients.map((patient) => (
                    <MenuItem key={patient.id} value={patient.id}>
                      {patient.display_name} · {patient.reference}
                    </MenuItem>
                  ))}
                </Select>
                {switchingPatient && (
                  <Typography role="status" sx={{ mt: 1 }}>
                    Loading selected patient…
                  </Typography>
                )}
                {previewError && (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    {previewError}
                  </Alert>
                )}
              </Paper>
            )}

            {context.notices.map((notice) => (
              <Alert key={notice} severity="info">
                {notice}
              </Alert>
            ))}

            <Paper
              elevation={0}
              sx={{
                p: { xs: 2.5, md: 4 },
                border: "1px solid #d6e1dd",
                borderRadius: 3,
              }}
            >
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <AccountBalanceWalletOutlinedIcon color="primary" />
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    Current balance
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Posted invoice activity for this patient
                  </Typography>
                </Box>
              </Stack>
              {context.balances.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 3 }}>
                  No invoice or payment activity is recorded.
                </Typography>
              ) : (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
                    gap: 2,
                    mt: 3,
                  }}
                >
                  {context.balances.map((balance) => (
                    <Box key={balance.currency}>
                      <Typography variant="overline" color="text.secondary">
                        {balance.currency} balance
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        {money(balance.currency, balance.balance_amount)}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        Invoiced {balance.invoiced_amount} · Paid {balance.allocated_amount} · Credits {balance.credited_amount}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Paper>

            <Paper
              elevation={0}
              sx={{
                p: { xs: 2.5, md: 4 },
                border: "1px solid #d6e1dd",
                borderRadius: 3,
              }}
            >
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Invoices
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Invoice lines and balances are shown exactly as recorded. No
                payment action is available here.
              </Typography>
              {context.billing.invoices.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 3 }}>
                  No invoices are recorded.
                </Typography>
              ) : (
                <Stack divider={<Divider flexItem />} spacing={2} sx={{ mt: 3 }}>
                  {context.billing.invoices.map((invoice) => (
                    <Box key={invoice.id}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        sx={{ gap: 1, justifyContent: "space-between" }}
                      >
                        <Typography sx={{ fontWeight: 700 }}>
                          Invoice {invoice.id} · {invoice.status}
                        </Typography>
                        <Typography sx={{ fontWeight: 700 }}>
                          {money(invoice.currency, invoice.balance_amount)} due
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        Total {invoice.total_amount} · Allocated {invoice.allocated_amount} · Credits {invoice.credit_amount}
                      </Typography>
                      <Stack spacing={0.5} sx={{ mt: 1 }}>
                        {invoice.lines.map((line) => (
                          <Typography key={line.id} variant="body2">
                            {line.description} · {line.quantity} × {line.posted_amount}
                          </Typography>
                        ))}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>

            <Paper
              elevation={0}
              sx={{
                p: { xs: 2.5, md: 4 },
                border: "1px solid #d6e1dd",
                borderRadius: 3,
              }}
            >
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Payment history
              </Typography>
              {context.billing.payments.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 2 }}>
                  No payments are recorded.
                </Typography>
              ) : (
                <Stack divider={<Divider flexItem />} spacing={2} sx={{ mt: 3 }}>
                  {context.billing.payments.map((payment) => (
                    <Box key={payment.id}>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        sx={{ gap: 1, justifyContent: "space-between" }}
                      >
                        <Typography sx={{ fontWeight: 700 }}>
                          {money(payment.currency, payment.amount)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {new Date(payment.created_at).toLocaleString()}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5 }}
                      >
                        Allocated {payment.allocated_amount} · Unapplied {payment.unapplied_amount}
                        {payment.cash_payment ? " · Cash payment" : ""}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
