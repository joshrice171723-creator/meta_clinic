import { useState, type FormEvent } from "react";
import HowToRegOutlinedIcon from "@mui/icons-material/HowToRegOutlined";
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

function invitationToken() {
  if (typeof window === "undefined") return "";

  const token =
    new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search,
  );
  return token;
}

export function OwnerActivationPage() {
  const [token] = useState(invitationToken);
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
        "/api/owner_activation",
        {
          method: "POST",
          body: {
            owner_activation: {
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
          : "Unable to create the owner account.",
      );
    } finally {
      setPassword("");
      setConfirmation("");
      setSaving(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 } }}>
      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
        <Stack component="form" spacing={2.5} onSubmit={submit}>
          <Stack spacing={0.75}>
            <Typography variant="overline" color="text.secondary">
              OWNER ACCOUNT
            </Typography>
            <Typography variant="h1">Create your password</Typography>
            <Typography color="text.secondary">
              Finish setting up your Meta Clinic platform-owner account.
            </Typography>
          </Stack>
          {!token && (
            <Alert severity="error">
              This invitation link is incomplete. Open the private link from
              your email or{" "}
              <Link href="/login?next=%2Fowner">return to owner sign in</Link>.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
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
            {saving ? "Creating account…" : "Create owner account"}
          </Button>
          <Typography variant="body2" color="text.secondary">
            This private invitation can be used once. Your password is never
            sent by email.
          </Typography>
        </Stack>
      </Paper>
    </Container>
  );
}
