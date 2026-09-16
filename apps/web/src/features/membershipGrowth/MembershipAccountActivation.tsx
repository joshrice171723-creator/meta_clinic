import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";

const TERMS_VERSION = "patient-portal-terms-v1";

export function MembershipAccountActivation() {
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
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("The password confirmation does not match.");
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ account: { redirect_to: string } }>(
        "/api/public/membership_accounts/activate",
        {
          method: "POST",
          body: {
            membership_account: {
              token,
              password,
              password_confirmation: confirmation,
              accepted_terms: acceptedTerms,
              terms_version: TERMS_VERSION,
            },
          },
        },
      );
      window.location.assign(result.account.redirect_to);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "We could not create this membership account.",
      );
    } finally {
      setPassword("");
      setConfirmation("");
      setSaving(false);
    }
  }

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
            Meta Clinic · Membership account
          </Typography>
          <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
            Create your password
          </Typography>
          <Typography color="text.secondary">
            This email link verifies your address when you finish creating your
            password. You’ll use this same account for payment and your patient
            portal.
          </Typography>
          {token && (
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: "wrap" }}
              aria-label="Membership account lifecycle"
            >
              <Chip label="Invitation received" color="success" size="small" />
              <Chip
                label="Verify identity"
                color="primary"
                size="small"
                variant="outlined"
              />
              <Chip label="Account active" size="small" variant="outlined" />
              <Chip
                label="Patient link after payment"
                size="small"
                variant="outlined"
              />
            </Stack>
          )}
          {!token && (
            <Alert severity="error">
              This setup link is missing or invalid. Return to the membership
              page to start again.
            </Alert>
          )}
          {token && (
            <Stack component="form" spacing={2} onSubmit={submit}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                autoComplete="new-password"
                helperText="Use 12 to 72 characters."
                label="Create password"
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
                  ? "Verifying your account…"
                  : "Continue to secure payment"}
              </Button>
            </Stack>
          )}
          <Typography variant="body2" color="text.secondary">
            This one-time link expires after 30 minutes. No payment is taken
            until the secure checkout page confirms it.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
