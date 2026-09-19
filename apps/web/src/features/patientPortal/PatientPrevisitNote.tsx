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
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { IntakeQuestions } from "./IntakeQuestions";

type Answer =
  | string
  | {
      state: string;
      value: string;
      unit?: string;
      measured_at?: string;
      source?: string;
    };
type Answers = Record<string, Answer>;
function answerState(answer: Answer | undefined) {
  return typeof answer === "string"
    ? answer.trim()
      ? "answered"
      : "unanswered"
    : (answer?.state ?? "unanswered");
}
function hasAnswers(answers: Answers) {
  return Object.values(answers).some(
    (answer) => answerState(answer) !== "unanswered",
  );
}

type Note = {
  id: number;
  version_number: number;
  text: string;
  additional_text?: string;
  intake_answers?: Answers;
  status?: "draft" | "submitted";
  inherited_from?: { note_id: number } | null;
  attestation?: { id: string; version: string; accepted: true } | null;
  submitted_at: string;
};
type Response = {
  appointment_id: number;
  note: Note | null;
  can_edit: boolean;
  intake_form?: {
    id: string;
    fields: {
      id: string;
      label: string;
      reusable: boolean;
      units?: string[];
    }[];
    answer_states?: string[];
    medication_options?: string[];
    medication_references?: Array<{ id: string; name: string }>;
    max_answer_length: number;
    attestation: { id: string; version: string; label: string };
  };
  reusable_answers?: {
    source_note_id: number;
    submitted_at: string;
    answers: Answers;
  } | null;
};
type Attempt = {
  body: {
    previsit_note: {
      text: string;
      intake_answers: Answers;
      status: "draft" | "submitted";
      reused_note_id: number | null;
      attestation: boolean;
      expected_version: number;
      request_key: string;
      form_id?: string;
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

function draftKey(text: string, answers: Answers) {
  return JSON.stringify([
    text.trim(),
    Object.entries(answers)
      .map(([key, value]) => [
        key,
        typeof value === "string" ? value.trim() : JSON.stringify(value),
      ])
      .filter(([, value]) => value !== "")
      .sort(([left], [right]) => left.localeCompare(right)),
  ]);
}

export function hasUnsavedPrevisitDraft(
  text: string,
  answers: Answers,
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
  const [answers, setAnswers] = useState<Answers>({});
  const [attested, setAttested] = useState(false);
  const [reusedNoteId, setReusedNoteId] = useState<number | null>(null);
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
  useEffect(() => {
    loadSequenceRef.current += 1;
    setOpen(false);
    setData(null);
    setText("");
    setAnswers({});
    setAttested(false);
    setReusedNoteId(null);
    setBaseline("");
    setOutcomeUnknown(false);
    setBusy(false);
    attempt.current = null;
  }, [appointmentId]);

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
        setReusedNoteId(result.note?.inherited_from?.note_id ?? null);
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
    setReusedNoteId(data?.note?.inherited_from?.note_id ?? null);
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
  const save = async (status: "draft" | "submitted" = "submitted") => {
    const normalizedText = text.trim() ? text : "";
    const hasContent = normalizedText !== "" || hasAnswers(answers);
    if (
      !data ||
      data.appointment_id !== appointmentId ||
      busy ||
      conflict ||
      (!outcomeUnknown &&
        draftKey(normalizedText, answers) === baseline &&
        !(data.note?.status === "draft" && status === "submitted")) ||
      (normalizedText === "" && !hasAnswers(answers) && !data.note)
    )
      return;
    if (status === "submitted" && hasContent && !attested) {
      setError(
        "Confirm the intake is current and may be shared with your care team before saving.",
      );
      return;
    }
    const current = attempt.current ?? {
      body: {
        previsit_note: {
          form_id: data.intake_form?.id,
          text: normalizedText,
          intake_answers: answers,
          status,
          reused_note_id: reusedNoteId,
          attestation: attested,
          expected_version: data.note?.version_number ?? 0,
          request_key: crypto.randomUUID(),
        },
      },
    };
    attempt.current = current;
    const requestAppointmentId = appointmentId;
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
      if (appointmentIdRef.current !== requestAppointmentId) return;
      const saved = savedText(result.note);
      const savedAnswers = result.note?.intake_answers ?? {};
      setData(result);
      setText(saved);
      setAnswers(savedAnswers);
      setAttested(false);
      setBaseline(draftKey(saved, savedAnswers));
      setNotice(
        result.note?.status === "draft"
          ? "Saved as a draft. Confirm when you are ready to send it."
          : result.note?.text
            ? "Your intake and visit note were saved."
            : "Your intake and visit note were cleared.",
      );
      attempt.current = null;
      setOutcomeUnknown(false);
      setConflict(false);
    } catch (reason) {
      if (appointmentIdRef.current !== requestAppointmentId) return;
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
      if (appointmentIdRef.current === requestAppointmentId) setBusy(false);
    }
  };
  const canSave =
    data?.can_edit === true &&
    !loading &&
    !busy &&
    !conflict &&
    (draftKey(text, answers) !== baseline || data.note?.status === "draft") &&
    ((!text.trim() && !hasAnswers(answers)) || attested) &&
    (text.trim() !== "" || hasAnswers(answers) || data.note !== null);
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
                  {data.note.status === "draft" ? "Draft saved" : "Submitted"}{" "}
                  {dateLabel(data.note.submitted_at)}
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
                        setReusedNoteId(
                          data.reusable_answers?.source_note_id ?? null,
                        );
                        setAnswers((current) => {
                          const next = { ...current };
                          for (const [key, value] of Object.entries(previous)) {
                            if (answerState(next[key]) === "unanswered")
                              next[key] = value;
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
                {data.intake_form && (
                  <IntakeQuestions
                    fields={data.intake_form.fields}
                    answers={answers}
                    medicationOptions={data.intake_form.medication_options}
                    medicationReferences={
                      data.intake_form.medication_references
                    }
                    disabled={loading || busy || outcomeUnknown || conflict}
                    onChange={(next) => {
                      setAnswers(next);
                      setAttested(false);
                    }}
                  />
                )}
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
                  (text.trim() !== "" || hasAnswers(answers)) && (
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
                (!text.trim() && !hasAnswers(answers))
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
              disabled={
                !data.can_edit ||
                loading ||
                busy ||
                conflict ||
                outcomeUnknown ||
                draftKey(text, answers) === baseline
              }
              onClick={() => void save("draft")}
            >
              Save draft
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
                  : !text.trim() && !hasAnswers(answers) && data.note
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
