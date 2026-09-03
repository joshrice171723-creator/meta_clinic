import { Field, Form, useResource } from "../../shared/ui";
import type { PatientPortalContext } from "../../api/contracts";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";

export function PatientPortal() {
  const resource = useResource<PatientPortalContext>(
    "/api/patient_portal/context",
  );
  const context = resource.data;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setMinutes(0, 0, 0);
  const localInput = (value: Date) => {
    const offset = value.getTimezoneOffset();
    return new Date(value.getTime() - offset * 60_000).toISOString().slice(0, 16);
  };

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
          sx={{ mb: 5, gap: 2, justifyContent: "space-between", alignItems: "center" }}
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
              Your care, in one place.
            </Typography>
          </Box>
          <Form endpoint="/api/session" method="DELETE" submit="Sign out" className="patient-portal-signout" onSuccess={() => window.location.replace("/login")} />
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
                  label="Private session"
                  color="success"
                  variant="outlined"
                  sx={{ alignSelf: "flex-start" }}
                />
              </Stack>
            </Paper>

            {context.notices.map((notice) => (
              <Alert key={notice} severity="info">
                {notice}
              </Alert>
            ))}

            <Paper elevation={0} sx={{ p: 3, border: "1px solid #d6e1dd", borderRadius: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Intake &amp; care preferences</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Profile: {context.intake.status.replaceAll("_", " ")} · Emergency contacts on file: {context.intake.emergency_contact_count} · Consent: {context.intake.consent_status.replaceAll("_", " ")}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Intake forms and consent capture are staged for the next enabled clinic workflow.
              </Typography>
            </Paper>

            {context.capabilities.appointment_requests_write && (
              <Paper elevation={0} sx={{ p: 3, border: "1px solid #d6e1dd", borderRadius: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Request an appointment</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>Choose a preferred two-hour window. The care team confirms availability before anything is booked.</Typography>
                <Form endpoint="/api/patient_portal/appointment_requests" submit="Send appointment request" retryKey onSuccess={resource.refresh} transform={(values) => ({
                  ...values,
                  starts_at: new Date(String(values.starts_at)).toISOString(),
                  ends_at: new Date(String(values.ends_at)).toISOString(),
                })}>
                  <Field name="starts_at" label="Preferred start" type="datetime-local" value={localInput(tomorrow)} />
                  <Field name="ends_at" label="Preferred end" type="datetime-local" value={localInput(new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000))} />
                </Form>
                {context.appointment_requests.length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    Latest request: {context.appointment_requests[0].status} for {new Date(context.appointment_requests[0].starts_at).toLocaleString()}.
                  </Typography>
                )}
              </Paper>
            )}

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 3,
              }}
            >
              <Paper
                elevation={0}
                sx={{ p: 3, border: "1px solid #d6e1dd", borderRadius: 3 }}
              >
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{ mb: 2, alignItems: "center" }}
                >
                  <EventAvailableOutlinedIcon color="primary" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Upcoming appointments
                  </Typography>
                </Stack>
                {context.upcoming_appointments.length === 0 ? (
                  <Typography color="text.secondary">
                    No upcoming appointments are recorded.
                  </Typography>
                ) : (
                  context.upcoming_appointments.map((appointment) => (
                    <Box
                      key={appointment.id}
                      sx={{ py: 1.5, borderTop: "1px solid #e7eeeb" }}
                    >
                      <Typography>
                        {new Date(appointment.starts_at).toLocaleString()}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {appointment.visit_type || "Visit"} · {appointment.status}
                      </Typography>
                    </Box>
                  ))
                )}
              </Paper>
              <Paper
                elevation={0}
                sx={{ p: 3, border: "1px solid #d6e1dd", borderRadius: 3 }}
              >
                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{ mb: 2, alignItems: "center" }}
                >
                  <AccountBalanceWalletOutlinedIcon color="primary" />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    Open balance
                  </Typography>
                </Stack>
                {context.balances.length === 0 ? (
                  <Typography color="text.secondary">
                    No posted balance is recorded.
                  </Typography>
                ) : (
                  context.balances.map((balance) => (
                    <Typography
                      key={balance.currency}
                      variant="h4"
                      sx={{ fontWeight: 700 }}
                    >
                      {balance.currency} {balance.balance_amount}
                    </Typography>
                  ))
                )}
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Payment collection is not enabled in this development build.
                </Typography>
              </Paper>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
              <Paper elevation={0} sx={{ p: 3, border: "1px solid #d6e1dd", borderRadius: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Visit summaries</Typography>
                {context.visit_summaries.length === 0 ? (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>No signed visit summary is available yet.</Typography>
                ) : context.visit_summaries.map((summary) => (
                  <Box key={summary.id} sx={{ mt: 2, pt: 2, borderTop: "1px solid #e7eeeb" }}>
                    <Typography variant="body2" color="text.secondary">Signed {summary.signed_at ? new Date(summary.signed_at).toLocaleString() : ""}</Typography>
                    {summary.assessment && <Typography sx={{ mt: 1 }}>{summary.assessment}</Typography>}
                    {summary.plan && <Typography color="text.secondary" sx={{ mt: 1 }}>{summary.plan}</Typography>}
                  </Box>
                ))}
              </Paper>
              <Paper elevation={0} sx={{ p: 3, border: "1px solid #d6e1dd", borderRadius: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Results</Typography>
                {context.results.length === 0 ? (
                  <Typography color="text.secondary" sx={{ mt: 1 }}>No lab or test results are available yet.</Typography>
                ) : context.results.map((result) => (
                  <Box key={result.id} sx={{ mt: 2, pt: 2, borderTop: "1px solid #e7eeeb" }}>
                    <Typography>{result.code}</Typography>
                    <Typography color="text.secondary">
                      {result.numeric_value ?? result.text_value ?? result.coded_value ?? "Not recorded"}{result.unit_code ? ` ${result.unit_code}` : ""}
                    </Typography>
                  </Box>
                ))}
              </Paper>
            </Box>

            <Paper elevation={0} sx={{ p: 3, border: "1px solid #d6e1dd", borderRadius: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Medication regimen</Typography>
              {context.medications.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 1 }}>No active medications are recorded.</Typography>
              ) : context.medications.map((medication) => (
                <Box key={medication.id} sx={{ mt: 2, pt: 2, borderTop: "1px solid #e7eeeb" }}>
                  <Typography>{medication.medication || "Medication"}</Typography>
                  <Typography color="text.secondary">{[medication.dose, medication.route, medication.frequency].filter(Boolean).join(" · ") || "Details not recorded"}</Typography>
                </Box>
              ))}
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Refill requests will be enabled after provider messaging is connected.</Typography>
            </Paper>

            <Paper elevation={0} sx={{ p: 3, border: "1px solid #d6e1dd", borderRadius: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>Billing history</Typography>
              {context.billing.invoices.length === 0 ? (
                <Typography color="text.secondary" sx={{ mt: 1 }}>No invoices are posted.</Typography>
              ) : context.billing.invoices.map((invoice) => (
                <Box key={invoice.id} sx={{ mt: 2, pt: 2, borderTop: "1px solid #e7eeeb", display: "flex", flexDirection: { xs: "column", sm: "row" }, justifyContent: "space-between", gap: 2 }}>
                  <Box><Typography>Invoice #{invoice.id}</Typography><Typography variant="body2" color="text.secondary">{invoice.status} · {new Date(invoice.created_at).toLocaleDateString()}</Typography></Box>
                  <Typography sx={{ fontWeight: 700 }}>{invoice.currency} {invoice.balance_amount} due</Typography>
                </Box>
              ))}
            </Paper>
          </Stack>
        )}
      </Box>
    </Box>
  );
}
