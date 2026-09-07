import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRef, useState } from "react";
import { api, ApiError } from "../../api/client";

type Note = {
  id: number;
  version_number: number;
  text: string;
  submitted_at: string;
};
type Response = {
  appointment_id: number;
  note: Note | null;
  can_edit: boolean;
};
type Attempt = {
  body: {
    previsit_note: {
      text: string;
      expected_version: number;
      request_key: string;
    };
  };
};

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date not recorded"
    : date.toLocaleString();
}

export function PatientPrevisitNote({
  appointmentId,
  appointmentLabel,
}: {
  appointmentId: number;
  appointmentLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Response | null>(null);
  const [text, setText] = useState("");
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latestReady, setLatestReady] = useState(false);
  const [latestRefreshFailed, setLatestRefreshFailed] = useState(false);
  const attempt = useRef<Attempt | null>(null);

  const load = async (preserveDraft = false) => {
    setLoading(true);
    if (!preserveDraft) setError("");
    if (preserveDraft) {
      setLatestReady(false);
      setLatestRefreshFailed(false);
    }
    try {
      const result = await api<Response>(
        `/api/patient_portal/appointments/${appointmentId}/previsit_note`,
      );
      if (result.appointment_id !== appointmentId)
        throw new Error("The saved visit note did not match this appointment.");
      setData(result);
      if (!preserveDraft || data === null) {
        const saved = result.note?.text ?? "";
        setText(saved);
        setBaseline(saved);
        setConflict(false);
      } else {
        setLatestReady(true);
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Your visit note could not be loaded.",
      );
      if (preserveDraft) setLatestRefreshFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const openEditor = () => {
    setOpen(true);
    setNotice("");
    setError("");
    setConflict(false);
    setLatestReady(false);
    setLatestRefreshFailed(false);
    void load();
  };
  const close = () => {
    if (busy || outcomeUnknown) return;
    setOpen(false);
    setError("");
    setNotice("");
    setConflict(false);
    setLatestReady(false);
    setLatestRefreshFailed(false);
  };
  const useLatestSaved = () => {
    const saved = data?.note?.text ?? "";
    setText(saved);
    setBaseline(saved);
    setConflict(false);
    setError("");
    setLatestReady(false);
    setLatestRefreshFailed(false);
  };
  const keepDraft = () => {
    setBaseline(data?.note?.text ?? "");
    setConflict(false);
    setError("");
    setLatestReady(false);
    setLatestRefreshFailed(false);
  };
  const save = async () => {
    const normalizedText = text.trim() ? text : "";
    if (
      !data ||
      busy ||
      conflict ||
      normalizedText === baseline ||
      (normalizedText === "" && !data.note)
    )
      return;
    const current = attempt.current ?? {
      body: {
        previsit_note: {
          text: normalizedText,
          expected_version: data.note?.version_number ?? 0,
          request_key: crypto.randomUUID(),
        },
      },
    };
    attempt.current = current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<Response>(
        `/api/patient_portal/appointments/${appointmentId}/previsit_note`,
        { method: "POST", body: current.body },
      );
      if (result.appointment_id !== appointmentId)
        throw new Error("The saved visit note did not match this appointment.");
      const saved = result.note?.text ?? "";
      setData(result);
      setText(saved);
      setBaseline(saved);
      setNotice(
        saved ? "Your visit note was saved." : "Your visit note was cleared.",
      );
      attempt.current = null;
      setOutcomeUnknown(false);
      setConflict(false);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        attempt.current = null;
        setOutcomeUnknown(false);
        setConflict(true);
        setLatestReady(false);
        setLatestRefreshFailed(false);
        setError(
          "This visit note changed elsewhere. The latest saved note was refreshed; your draft is still here until you choose which version to use.",
        );
        void load(true);
      } else if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        reason.code !== "outcome_unconfirmed"
      ) {
        attempt.current = null;
        setOutcomeUnknown(false);
        setError(reason.message);
      } else {
        setOutcomeUnknown(true);
        setError(
          "The save outcome is unknown. Retry this exact visit note request before editing or closing it.",
        );
      }
    } finally {
      setBusy(false);
    }
  };
  const canSave =
    data?.can_edit === true &&
    !loading &&
    !busy &&
    !conflict &&
    (text.trim() ? text : "") !== baseline &&
    (text.trim() !== "" || data.note !== null);
  const conflictChoiceDisabled =
    busy || outcomeUnknown || loading || !latestReady || latestRefreshFailed;

  return (
    <>
      <Button size="small" variant="outlined" onClick={openEditor}>
        What would you like the clinic to know?
      </Button>
      <Dialog
        open={open}
        onClose={close}
        fullWidth
        maxWidth="sm"
        aria-labelledby={`previsit-note-${appointmentId}-title`}
      >
        <DialogTitle id={`previsit-note-${appointmentId}-title`}>
          Visit note for the clinic
          <Typography component="div" variant="body2" color="text.secondary">
            {appointmentLabel}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Your clinic can review this note when preparing for your visit.
            </Typography>
            {loading && (
              <Typography role="status">Loading your visit note…</Typography>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            {notice && <Alert severity="success">{notice}</Alert>}
            {conflict && (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  variant="outlined"
                  disabled={conflictChoiceDisabled}
                  onClick={useLatestSaved}
                >
                  Use latest saved note
                </Button>
                <Button
                  variant="outlined"
                  disabled={conflictChoiceDisabled}
                  onClick={keepDraft}
                >
                  Keep my draft
                </Button>
              </Stack>
            )}
            {data?.note && (
              <Box>
                <Typography variant="subtitle2">Saved note</Typography>
                <Typography variant="body2" color="text.secondary">
                  Submitted {dateLabel(data.note.submitted_at)}
                </Typography>
                <Typography
                  sx={{
                    mt: 0.5,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  {data.note.text || "No current visit note."}
                </Typography>
              </Box>
            )}
            {data && !data.can_edit && (
              <Alert severity="info">
                This appointment is no longer available for visit note changes.
              </Alert>
            )}
            {data?.can_edit && (
              <TextField
                label="What would you like the clinic to know?"
                value={text}
                onChange={(event) => setText(event.target.value)}
                multiline
                minRows={5}
                fullWidth
                disabled={busy || outcomeUnknown || conflict}
                slotProps={{ htmlInput: { maxLength: 5_000 } }}
                helperText="Optional. You can clear a saved note before the visit starts."
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy || outcomeUnknown} onClick={close}>
            Close
          </Button>
          {data?.can_edit && data.note && !outcomeUnknown && (
            <Button
              color="error"
              disabled={busy || conflict || text.trim() === ""}
              onClick={() => setText("")}
            >
              Clear note
            </Button>
          )}
          {error && !outcomeUnknown && (
            <Button disabled={busy || loading} onClick={() => void load(true)}>
              Retry loading note
            </Button>
          )}
          {data && (
            <Button
              variant="contained"
              disabled={busy || (!canSave && !outcomeUnknown)}
              onClick={() => void save()}
            >
              {busy
                ? "Saving…"
                : outcomeUnknown
                  ? "Retry same request"
                  : text.trim() === "" && data.note
                    ? "Save cleared note"
                    : "Save visit note"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
