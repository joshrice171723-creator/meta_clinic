import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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
  additional_text?: string;
  intake_answers?: Record<string, string>;
  attestation?: { id: string; version: string; accepted: true } | null;
  submitted_at: string;
};
type Response = {
  appointment_id: number;
  note: Note | null;
  can_edit: boolean;
  intake_form?: {
    id: string;
    fields: { id: string; label: string; reusable: boolean }[];
    max_answer_length: number;
    attestation: { id: string; version: string; label: string };
  };
  reusable_answers?: {
    submitted_at: string;
    answers: Record<string, string>;
  } | null;
};
type Attempt = {
  body: {
    previsit_note: {
      text: string;
      intake_answers: Record<string, string>;
      attestation: boolean;
      expected_version: number;
      request_key: string;
    };
  };
};

export function isCurrentPrevisitLoad(
  currentAppointmentId: number,
  currentSequence: number,
  requestAppointmentId: number,
  requestSequence: number,
) {
  return (
    currentAppointmentId === requestAppointmentId &&
    currentSequence === requestSequence
  );
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date not recorded"
    : date.toLocaleString();
}

function draftKey(text: string, answers: Record<string, string>) {
  return JSON.stringify([
    text.trim(),
    Object.entries(answers)
      .map(([key, value]) => [key, value.trim()])
      .filter(([, value]) => value !== "")
      .sort(([left], [right]) => left.localeCompare(right)),
  ]);
}

export function hasUnsavedPrevisitDraft(
  text: string,
  answers: Record<string, string>,
  baseline: string,
) {
  return draftKey(text, answers) !== baseline;
}

function savedText(note: Note | null | undefined) {
  return note?.additional_text ?? note?.text ?? "";
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
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [latestReady, setLatestReady] = useState(false);
  const [latestRefreshFailed, setLatestRefreshFailed] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const appointmentIdRef = useRef(appointmentId);
  const loadSequenceRef = useRef(0);
  appointmentIdRef.current = appointmentId;

  const load = async (preserveDraft = false) => {
    const requestAppointmentId = appointmentId;
    const requestSequence = ++loadSequenceRef.current;
    const requestIsCurrent = () =>
      isCurrentPrevisitLoad(
        appointmentIdRef.current,
        loadSequenceRef.current,
        requestAppointmentId,
        requestSequence,
      );
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
      if (!requestIsCurrent()) return;
      setData(result);
      if (!preserveDraft || data === null) {
        const saved = savedText(result.note);
        const savedAnswers = result.note?.intake_answers ?? {};
        setText(saved);
        setAnswers(savedAnswers);
        setAttested(false);
        setBaseline(draftKey(saved, savedAnswers));
        setConflict(false);
      } else {
        setLatestReady(true);
      }
    } catch (reason) {
      if (!requestIsCurrent()) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Your visit note could not be loaded.",
      );
      if (preserveDraft) setLatestRefreshFailed(true);
    } finally {
      if (requestIsCurrent()) setLoading(false);
    }
  };

  const openEditor = () => {
    setOpen(true);
    setNotice("");
    setError("");
    setConflict(false);
    setLatestReady(false);
    setLatestRefreshFailed(false);
    setConfirmDiscard(false);
    setAttested(false);
    void load();
  };
  const closeEditor = () => {
    if (busy || outcomeUnknown) return;
    loadSequenceRef.current += 1;
    setLoading(false);
    setOpen(false);
    setError("");
    setNotice("");
    setConflict(false);
    setLatestReady(false);
    setLatestRefreshFailed(false);
    setConfirmDiscard(false);
  };
  const requestClose = () => {
    if (busy || outcomeUnknown) return;
    if (data && hasUnsavedPrevisitDraft(text, answers, baseline)) {
      setConfirmDiscard(true);
      return;
    }
    closeEditor();
  };
  const useLatestSaved = () => {
    const saved = savedText(data?.note);
    const savedAnswers = data?.note?.intake_answers ?? {};
    setText(saved);
    setAnswers(savedAnswers);
    setAttested(false);
    setBaseline(draftKey(saved, savedAnswers));
    setConflict(false);
    setError("");
    setLatestReady(false);
    setLatestRefreshFailed(false);
  };
  const keepDraft = () => {
    setBaseline(
      draftKey(savedText(data?.note), data?.note?.intake_answers ?? {}),
    );
    setAttested(false);
    setConflict(false);
    setError("");
    setLatestReady(false);
    setLatestRefreshFailed(false);
  };
  const save = async () => {
    const normalizedText = text.trim() ? text : "";
    const hasContent =
      normalizedText !== "" ||
      Object.values(answers).some((value) => value.trim());
    if (
      !data ||
      busy ||
      conflict ||
      (!outcomeUnknown && draftKey(normalizedText, answers) === baseline) ||
      (normalizedText === "" &&
        !Object.values(answers).some((value) => value.trim()) &&
        !data.note)
    )
      return;
    if (hasContent && !attested) {
      setError(
        "Confirm the intake is current and may be shared with your care team before saving.",
      );
      return;
    }
    const current = attempt.current ?? {
      body: {
        previsit_note: {
          text: normalizedText,
          intake_answers: answers,
          attestation: attested,
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
      const saved = savedText(result.note);
      const savedAnswers = result.note?.intake_answers ?? {};
      setData(result);
      setText(saved);
      setAnswers(savedAnswers);
      setAttested(false);
      setBaseline(draftKey(saved, savedAnswers));
      setNotice(
        result.note?.text
          ? "Your intake and visit note were saved."
          : "Your intake and visit note were cleared.",
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
    draftKey(text, answers) !== baseline &&
    ((!text.trim() && !Object.values(answers).some((value) => value.trim())) ||
      attested) &&
    (text.trim() !== "" ||
      Object.values(answers).some((value) => value.trim()) ||
      data.note !== null);
  const conflictChoiceDisabled =
    busy || outcomeUnknown || loading || !latestReady || latestRefreshFailed;

  return (
    <>
      <Button size="small" variant="outlined" onClick={openEditor}>
        Complete intake / visit note
      </Button>
      <Dialog
        open={open}
        onClose={requestClose}
        fullWidth
        maxWidth="sm"
        aria-labelledby={`previsit-note-${appointmentId}-title`}
      >
        <DialogTitle id={`previsit-note-${appointmentId}-title`}>
          Prepare for your visit
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
              <Stack spacing={2}>
                {data.reusable_answers && (
                  <Box>
                    <Typography variant="body2" color="text.secondary">
                      Previous answers from{" "}
                      {dateLabel(data.reusable_answers.submitted_at)}. Review
                      each answer for changes before saving.
                    </Typography>
                    <Button
                      disabled={loading || busy || outcomeUnknown || conflict}
                      onClick={() => {
                        const previous = data.reusable_answers?.answers ?? {};
                        setAnswers((current) => {
                          const next = { ...current };
                          for (const [key, value] of Object.entries(previous)) {
                            if (!next[key]?.trim()) next[key] = value;
                          }
                          return next;
                        });
                        setAttested(false);
                        setNotice(
                          "Previous health answers added to empty fields. Confirm they are still current before saving.",
                        );
                      }}
                    >
                      Reuse previous health answers
                    </Button>
                  </Box>
                )}
                {data.intake_form?.fields.map((field) => (
                  <TextField
                    key={field.id}
                    label={field.label}
                    value={answers[field.id] ?? ""}
                    onChange={(event) => {
                      setAnswers((current) => ({
                        ...current,
                        [field.id]: event.target.value,
                      }));
                      setAttested(false);
                    }}
                    multiline
                    minRows={2}
                    fullWidth
                    disabled={loading || busy || outcomeUnknown || conflict}
                    slotProps={{
                      htmlInput: {
                        maxLength: data.intake_form?.max_answer_length ?? 600,
                      },
                    }}
                    helperText="Optional. Leave blank if unknown; write ‘none’ only when you mean none."
                  />
                ))}
                <TextField
                  label="Anything else the clinic should know?"
                  value={text}
                  onChange={(event) => {
                    setText(event.target.value);
                    setAttested(false);
                  }}
                  multiline
                  minRows={5}
                  fullWidth
                  disabled={loading || busy || outcomeUnknown || conflict}
                  slotProps={{ htmlInput: { maxLength: 5_000 } }}
                  helperText="Optional. You can clear a saved note before the visit starts."
                />
                {data.intake_form?.attestation &&
                  (text.trim() !== "" ||
                    Object.values(answers).some((value) => value.trim())) && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={attested}
                          onChange={(event) =>
                            setAttested(event.target.checked)
                          }
                          disabled={
                            loading || busy || outcomeUnknown || conflict
                          }
                        />
                      }
                      label={data.intake_form.attestation.label}
                    />
                  )}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy || outcomeUnknown} onClick={requestClose}>
            Close
          </Button>
          {data?.can_edit && data.note && !outcomeUnknown && (
            <Button
              color="error"
              disabled={
                loading ||
                busy ||
                conflict ||
                (!text.trim() &&
                  !Object.values(answers).some((value) => value.trim()))
              }
              onClick={() => {
                setText("");
                setAnswers({});
                setAttested(false);
              }}
            >
              Clear intake and note
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
                  : !text.trim() &&
                      !Object.values(answers).some((value) => value.trim()) &&
                      data.note
                    ? "Save cleared intake"
                    : "Save intake and note"}
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        aria-labelledby={`previsit-note-${appointmentId}-discard-title`}
      >
        <DialogTitle id={`previsit-note-${appointmentId}-discard-title`}>
          Discard unsaved intake?
        </DialogTitle>
        <DialogContent>
          <Typography>
            Your unsaved intake answers and visit note will be lost.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
          <Button color="error" variant="contained" onClick={closeEditor}>
            Discard changes
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
