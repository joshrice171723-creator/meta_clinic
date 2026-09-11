import { useState, type FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";

export function PatientPortalRecovery() {
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [recoveryPath, setRecoveryPath] = useState<string | null>(null);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setRecoveryPath(null);
    try {
      const result = await api<{
        message: string;
        recovery_path: string | null;
      }>("/api/patient_portal/recovery", {
        method: "POST",
        body: { patient_portal_recovery: { contact } },
      });
      setMessage(result.message);
      setRecoveryPath(result.recovery_path);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The recovery request could not be completed.",
      );
    } finally {
      setBusy(false);
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
        <Stack component="form" spacing={2} onSubmit={submit}>
          <Typography component="h1" variant="h4">
            Reset your password
          </Typography>
          <Typography color="text.secondary">
            Enter the email address associated with your patient portal account.
            If the account and a mobile number on file match, we will text a
            secure recovery link.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {message && <Alert severity="info">{message}</Alert>}
          <TextField
            autoComplete="email"
            label="Email address"
            onChange={(event) => setContact(event.target.value)}
            required
            slotProps={{ htmlInput: { maxLength: 254 } }}
            type="email"
            value={contact}
          />
          <Button
            disabled={busy || !contact.trim()}
            type="submit"
            variant="contained"
          >
            {busy ? "Requesting recovery…" : "Text recovery link"}
          </Button>
          {recoveryPath && (
            <Button href={recoveryPath} variant="outlined">
              Continue with secure local reset
            </Button>
          )}
          <Button href="/login?next=%2Fpatient-portal" variant="text">
            Return to patient sign in
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
