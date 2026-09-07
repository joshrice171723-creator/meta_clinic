import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import { api, ApiError } from "../../api/client";

export type ConfirmableAppointment = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  updated_at: string;
  site: { id: number; code: string; name: string } | null;
  room: { id: number; code: string } | null;
  clinician: { id: number; display_name: string } | null;
  visit_type: { id: number; code: string } | null;
  can_confirm: boolean;
  confirmation_version: string | null;
};

type Attempt = { body: { confirmation: { version: string | null } } };

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function dateTimeRange(start: string, end: string) {
  const startsAt = new Date(start);
  const endsAt = new Date(end);
  if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf())) {
    return `${dateTime(start)} – ${dateTime(end)}`;
  }

  const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
  if (startsAt.toDateString() === endsAt.toDateString()) {
    return `${day.format(startsAt)} · ${time.format(startsAt)} – ${time.format(endsAt)}`;
  }
  return `${dateTime(start)} – ${dateTime(end)}`;
}

export function PatientAppointmentConfirmation({
  appointment,
  onClose,
  onConfirmed,
  onReload,
}: {
  appointment: ConfirmableAppointment;
  onClose: () => void;
  onConfirmed: (appointment: ConfirmableAppointment) => void;
  onReload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [error, setError] = useState("");
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const confirm = async () => {
    if (busy) return;
    if (!attempt.current && appointment.confirmation_version === null) {
      setReloadNeeded(true);
      setError(
        "This appointment needs the latest confirmation details. Reload appointments before trying again.",
      );
      return;
    }
    const current =
      attempt.current ??
      ({
        body: { confirmation: { version: appointment.confirmation_version } },
      } satisfies Attempt);
    attempt.current = current;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ appointment: ConfirmableAppointment }>(
        `/api/patient_portal/appointments/${appointment.id}/confirmation`,
        { method: "PUT", body: current.body },
      );
      if (result.appointment.id !== appointment.id)
        throw new Error("The confirmed appointment did not match this visit.");
      if (result.appointment.status !== "confirmed") {
        attempt.current = null;
        setOutcomeUnknown(false);
        setReloadNeeded(true);
        setError(
          "The appointment was not confirmed. Reload appointments before trying again.",
        );
        return;
      }
      onConfirmed(result.appointment);
    } catch (reason) {
      if (
        !(reason instanceof ApiError) ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed"
      ) {
        setOutcomeUnknown(true);
        setError(
          "The confirmation outcome is unknown. Retry this exact confirmation before closing it.",
        );
      } else {
        attempt.current = null;
        setOutcomeUnknown(false);
        setReloadNeeded(reason.status === 409 || reason.status === 422);
        setError(reason.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy || outcomeUnknown) return;
    onClose();
  };

  return (
    <Dialog
      open
      onClose={close}
      fullWidth
      maxWidth="sm"
      aria-labelledby={`appointment-confirmation-${appointment.id}-title`}
    >
      <DialogTitle id={`appointment-confirmation-${appointment.id}-title`}>
        Confirm appointment
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography color="text.secondary">
            This confirms attendance for this existing booked visit. It does not
            book a new time.
          </Typography>
          <Typography>
            <strong>Date and time:</strong>{" "}
            {dateTimeRange(appointment.starts_at, appointment.ends_at)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Times are shown in your device's local time ({timezone}).
          </Typography>
          <Typography>
            <strong>Clinic:</strong>{" "}
            {appointment.site?.name ||
              appointment.site?.code ||
              "Location not recorded"}
          </Typography>
          {appointment.room && (
            <Typography>
              <strong>Room:</strong> {appointment.room.code}
            </Typography>
          )}
          {appointment.clinician && (
            <Typography>
              <strong>Provider:</strong> {appointment.clinician.display_name}
            </Typography>
          )}
          {appointment.visit_type && (
            <Typography>
              <strong>Visit type:</strong> {appointment.visit_type.code}
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy || outcomeUnknown} onClick={close}>
          Dismiss
        </Button>
        {reloadNeeded && !outcomeUnknown && (
          <Button
            onClick={() => {
              onReload();
              onClose();
            }}
          >
            Reload appointments
          </Button>
        )}
        <Button
          variant="contained"
          disabled={busy || reloadNeeded}
          onClick={() => void confirm()}
        >
          {busy
            ? "Confirming…"
            : outcomeUnknown
              ? "Retry same confirmation"
              : "Confirm appointment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
