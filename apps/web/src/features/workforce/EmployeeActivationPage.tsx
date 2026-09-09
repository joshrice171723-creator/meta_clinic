import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import HowToRegOutlinedIcon from "@mui/icons-material/HowToRegOutlined";
import { api } from "../../api/client";

const activationTokenFromLocation = (() => {
  if (typeof window === "undefined") return "";

  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  if (window.location.search)
    window.history.replaceState(window.history.state, "", "/workforce/activate");
  return token;
})();

export function EmployeeActivationPage() {
  const [token, setToken] = useState(activationTokenFromLocation);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
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
        "/api/employee_activation",
        {
          method: "POST",
          body: {
            employee_activation: {
              token,
              password,
              password_confirmation: confirmation,
            },
          },
        },
      );
      window.location.assign(result.redirect_to);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to activate this employee account.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 } }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
        <Stack component="form" spacing={2.5} onSubmit={submit}>
          <Stack spacing={0.75}>
            <Typography variant="overline" color="text.secondary">
              EMPLOYEE ACCOUNT
            </Typography>
            <Typography variant="h1">Activate your clinic account</Typography>
            <Typography color="text.secondary">
              Enter the token your manager shared with you, then choose a
              password for your staff login.
            </Typography>
          </Stack>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Activation token"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
            autoComplete="one-time-code"
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="new-password"
            helperText="Use 12 to 72 characters. Password-manager paste is supported."
            slotProps={{ htmlInput: { minLength: 12, maxLength: 72 } }}
          />
          <TextField
            label="Confirm password"
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            autoComplete="new-password"
            slotProps={{ htmlInput: { minLength: 12, maxLength: 72 } }}
          />
          <Button
            type="submit"
            variant="contained"
            size="large"
            startIcon={<HowToRegOutlinedIcon />}
            disabled={
              saving ||
              !token ||
              password.length < 12 ||
              confirmation.length < 12
            }
          >
            {saving ? "Activating…" : "Activate account"}
          </Button>
          <Typography variant="body2" color="text.secondary">
            This creates a staff account only. It does not use patient portal
            credentials or expose your password to your manager.
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}
