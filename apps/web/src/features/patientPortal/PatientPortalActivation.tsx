import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";

const TERMS_VERSION = "patient-portal-terms-v1";

export function PatientPortalActivation() {
  const [{ token, purpose }] = useState(() => {
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const value = parameters.get("token") || "";
    const requestedPurpose = parameters.get("purpose");
    window.history.replaceState(
      {},
      "",
      window.location.pathname + window.location.search,
    );
    return {
      token: value,
      purpose: requestedPurpose === "recovery" ? "recovery" : "activation",
    } as const;
  });
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("The password confirmation does not match.");
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ activated: true; redirect_to: string }>(
        "/api/patient_portal/invitation/activate",
        {
          method: "POST",
          body: {
            patient_portal_activation: {
              token,
              password,
              password_confirmation: confirmation,
              accepted_terms: acceptedTerms,
              terms_version: TERMS_VERSION,
            },
          },
        },
      );
      window.location.assign(result.redirect_to);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to activate this patient portal account.",
      );
    } finally {
      setPassword("");
      setConfirmation("");
      setSaving(false);
    }
  };

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
            {purpose === "recovery"
              ? "Reset your portal password"
              : "Activate your portal access"}
          </Typography>
          <Typography color="text.secondary">
            This one-time {purpose} link connects you to the patient record
            selected by your care team. It expires after 30 minutes and cannot
            be reused.
          </Typography>
          {!token && (
            <Alert severity="error">
              This invitation is missing or invalid. Contact the clinic support
              team for a new invitation.
            </Alert>
          )}
          {token && (
            <Stack component="form" spacing={2} onSubmit={submit}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                autoComplete="new-password"
                helperText="Use 12 to 72 characters. Password-manager paste is supported."
                label={purpose === "recovery" ? "New password" : "Create password"}
                onChange={(event) => setPassword(event.target.value)}
                required
                slotProps={{ htmlInput: { minLength: 12, maxLength: 72 } }}
                type="password"
                value={password}
              />
              <TextField
                autoComplete="new-password"
                label="Confirm password"
                onChange={(event) => setConfirmation(event.target.value)}
                required
                slotProps={{ htmlInput: { minLength: 12, maxLength: 72 } }}
                type="password"
                value={confirmation}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                    required
                  />
                }
                label="I agree to the patient portal terms for this account."
              />
              <Button
                disabled={
                  saving ||
                  !acceptedTerms ||
                  password.length < 12 ||
                  confirmation.length < 12
                }
                size="large"
                type="submit"
                variant="contained"
              >
                {saving
                  ? purpose === "recovery"
                    ? "Resetting…"
                    : "Activating…"
                  : purpose === "recovery"
                    ? "Reset password"
                    : "Activate portal"}
              </Button>
            </Stack>
          )}
          <Typography variant="body2" color="text.secondary">
            Step-up authentication and self-service recovery are not enabled.
            The clinic support team can issue a new one-time link if you lose
            access. Do not use the portal for emergencies.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
