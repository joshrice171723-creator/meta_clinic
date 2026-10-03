import { useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";

export function PatientPortalPassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const [edited, setEdited] = useState(false);
  const dirty = edited && Boolean(currentPassword || password || confirmation);
  useDemoNavigationBlocker(() => ({
    blocked: busy,
    message: busy
      ? "A password change was submitted and may still complete."
      : dirty
        ? "Discard your unsaved password changes?"
        : null,
  }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setChanged(false);
    if (password !== confirmation) {
      setError("The new password confirmation does not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/patient_portal/account/password", {
        method: "PATCH",
        body: {
          patient_portal_password: {
            current_password: currentPassword,
            password,
            password_confirmation: confirmation,
          },
        },
      });
      setCurrentPassword("");
      setPassword("");
      setConfirmation("");
      setEdited(false);
      setChanged(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to change your password.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{ p: { xs: 2.5, sm: 3.5 } }}
    >
      <Stack
        component="form"
        aria-labelledby="patient-portal-password-heading"
        spacing={2}
        onSubmit={submit}
        onKeyDown={(event) => {
          if (
            event.target instanceof HTMLInputElement &&
            ((event.key.length === 1 &&
              !event.ctrlKey &&
              !event.metaKey &&
              !event.altKey) ||
              event.key === "Backspace" ||
              event.key === "Delete")
          )
            setEdited(true);
        }}
        onPaste={() => setEdited(true)}
        onCut={() => setEdited(true)}
        onBeforeInput={(event) => {
          const input = event.nativeEvent as InputEvent;
          if (
            input.isTrusted &&
            input.inputType &&
            input.inputType !== "insertReplacementText"
          )
            setEdited(true);
        }}
      >
        <Typography
          id="patient-portal-password-heading"
          variant="h2"
          component="h2"
        >
          Password
        </Typography>
        <Typography color="text.secondary">
          Changing your password signs out every other portal session and keeps
          this device signed in.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {changed && (
          <Alert severity="success">Your password was changed.</Alert>
        )}
        <TextField
          autoComplete="current-password"
          label="Current password"
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
          slotProps={{ htmlInput: { maxLength: 72 } }}
          type="password"
          value={currentPassword}
        />
        <TextField
          autoComplete="new-password"
          helperText="Use 12 to 72 characters. Password-manager paste is supported."
          label="New password"
          onChange={(event) => setPassword(event.target.value)}
          required
          slotProps={{ htmlInput: { minLength: 12, maxLength: 72 } }}
          type="password"
          value={password}
        />
        <TextField
          autoComplete="new-password"
          label="Confirm new password"
          onChange={(event) => setConfirmation(event.target.value)}
          required
          slotProps={{ htmlInput: { minLength: 12, maxLength: 72 } }}
          type="password"
          value={confirmation}
        />
        <Button
          disabled={
            busy ||
            currentPassword.length === 0 ||
            password.length < 12 ||
            confirmation.length < 12
          }
          sx={{ alignSelf: "flex-start" }}
          type="submit"
          variant="contained"
        >
          {busy ? "Changing…" : "Change password"}
        </Button>
      </Stack>
    </Paper>
  );
}
