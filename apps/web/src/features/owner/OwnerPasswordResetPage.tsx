import { useEffect, useState, type FormEvent } from "react";
import LockResetOutlinedIcon from "@mui/icons-material/LockResetOutlined";
import {
  Alert,
  Button,
  Container,
  Link,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";

function resetToken() {
  if (typeof window === "undefined") return "";

  const token =
    new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
  return token;
}

export function OwnerPasswordResetPage() {
  const [token] = useState(resetToken);
  useEffect(() => {
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
  }, []);
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const requestReset = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await api<{ message: string }>(
        "/api/owner_password_reset_requests",
        {
          method: "POST",
          body: {
            owner_password_reset_request: { email_address: emailAddress },
          },
        },
      );
      setMessage(result.message);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to request a password reset.",
      );
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("The password confirmation does not match.");
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ reset: true; redirect_to: string }>(
        "/api/owner_password_reset",
        {
          method: "POST",
          body: {
            owner_password_reset: {
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
          : "Unable to reset the owner password.",
      );
    } finally {
      setPassword("");
      setConfirmation("");
      setSaving(false);
    }
  };

  const completingReset = Boolean(token);
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 } }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
        <Stack
          component="form"
          spacing={2.5}
          onSubmit={completingReset ? resetPassword : requestReset}
        >
          <Stack spacing={0.75}>
            <Typography variant="overline" color="text.secondary">
              OWNER ACCOUNT
            </Typography>
            <Typography variant="h1">
              {completingReset ? "Set a new password" : "Reset your password"}
            </Typography>
            <Typography color="text.secondary">
              {completingReset
                ? "Choose a new password for your Meta Clinic platform-owner account."
                : "Enter your owner email and we’ll send a private password-reset link if it matches an active account."}
            </Typography>
          </Stack>
          {message && <Alert severity="success">{message}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
          {completingReset ? (
            <>
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
            </>
          ) : (
            <TextField
              label="Owner email address"
              type="email"
              value={emailAddress}
              onChange={(event) => setEmailAddress(event.target.value)}
              required
              autoComplete="username"
              slotProps={{ htmlInput: { maxLength: 254 } }}
            />
          )}
          <Button
            type="submit"
            variant="contained"
            size="large"
            startIcon={<LockResetOutlinedIcon />}
            disabled={
              saving ||
              (completingReset
                ? password.length < 12 || confirmation.length < 12
                : !emailAddress)
            }
          >
            {saving
              ? "Working…"
              : completingReset
                ? "Set new password"
                : "Send reset link"}
          </Button>
          <Typography variant="body2" color="text.secondary">
            <Link href="/login?next=%2Fowner">Return to owner sign in</Link>
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}
