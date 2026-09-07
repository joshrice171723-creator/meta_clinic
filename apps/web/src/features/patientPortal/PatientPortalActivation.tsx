import { useState } from "react";
import { Alert, Box, Paper, Stack, Typography } from "@mui/material";
import { Field, Form } from "../../shared/ui";

const TERMS_VERSION = "patient-portal-terms-v1";

export function PatientPortalActivation() {
  const [token] = useState(() => {
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    window.history.replaceState(
      {},
      "",
      window.location.pathname + window.location.search,
    );
    return value;
  });

  return (
    <Box
      component="main"
      id="main"
      sx={{
        minHeight: "100vh",
        bgcolor: "#f5f7f6",
        px: { xs: 2, sm: 4 },
        py: { xs: 3, md: 8 },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: 560,
          mx: "auto",
          p: { xs: 3, md: 5 },
          border: "1px solid #d6e1dd",
          borderRadius: 3,
        }}
      >
        <Stack spacing={2}>
          <Typography
            variant="overline"
            sx={{ letterSpacing: "0.12em", color: "#58756e" }}
          >
            APPly · Patient portal
          </Typography>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
            Activate your portal access
          </Typography>
          <Typography color="text.secondary">
            This one-time invitation connects you to the patient record selected
            by your care team. It expires after 30 minutes and cannot be reused.
          </Typography>
          {!token && (
            <Alert severity="error">
              This invitation is missing or invalid. Contact the clinic support
              team for a new invitation.
            </Alert>
          )}
          {token && (
            <Form
              endpoint="/api/patient_portal/invitation/activate"
              submit="Activate portal"
              values={{ token, terms_version: TERMS_VERSION }}
              transform={(values) => ({
                accepted_terms: values.consent === true,
              })}
              onSuccess={() => window.location.assign("/patient-portal")}
            >
              <Field
                name="consent"
                label="I agree to the patient portal terms for this account."
                type="checkbox"
              />
            </Form>
          )}
          <Typography variant="body2" color="text.secondary">
            Step-up authentication and self-service recovery are not enabled in
            this patient portal. Contact the clinic support team if you lose
            access. Do not use the portal for emergencies.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
