import {
  Accordion,
  AccordionActions,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  LinearProgress,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../api/client";
import { IntakeQuestions, intakeFieldVisible } from "./IntakeQuestions";
import { useDemoNavigationBlocker } from "../demo/navigationBlockers";

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
  request_key?: string;
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
      chunk_id?: string;
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
  appointment_id: number;
  uncertain: boolean;
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

const INTAKE_SECTION_TITLES: Record<string, string> = {
  general_health_visit: "Your health and visit",
  past_care_measurements: "Past care, height and weight",
  today_visit: "Today’s concerns and functioning",
  patient_coordination: "Support and care needs",
  safety_history: "Relevant history",
  prior_approaches: "Previous approaches",
  measurements: "Measurements",
  reproductive_product_safety: "Reproductive and product safety",
  nutrition_support: "Nutrition and support",
  activity_sleep_barriers: "Activity, sleep, and access",
  records_consent_admin: "Records and visit details",
  confirmation_clinician_review: "Confirmation and care-team review",
  follow_up_change: "Changes and follow-up",
};

function intakeSectionTitle(
  chunkId: string | undefined,
  fields: { label: string }[],
) {
  if (chunkId && INTAKE_SECTION_TITLES[chunkId]) {
    return INTAKE_SECTION_TITLES[chunkId];
  }
  return fields[0]?.label ?? "Health questions";
}

export function isUncertainPrevisitSave(reason: unknown) {
  return (
    !(reason instanceof ApiError) ||
    reason.status === 408 ||
    reason.status >= 500 ||
    reason.code === "outcome_unconfirmed" ||
    reason.code === "session_changed"
  );
}

export function matchesPrevisitSave(
  result: Pick<Response, "appointment_id" | "note">,
  current: Attempt,
) {
  const note = result.note;
  return (
    result.appointment_id === current.appointment_id &&
    note !== null &&
    Number.isSafeInteger(note.id) &&
    note.id > 0 &&
    note.request_key === current.body.previsit_note.request_key &&
    note.version_number === current.body.previsit_note.expected_version + 1 &&
    note.status === current.body.previsit_note.status
  );
}

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
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"), {
    noSsr: true,
  });
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
  const [expandedPart, setExpandedPart] = useState<number | false>(0);
  const pendingPartFocus = useRef<number | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const inFlight = useRef<Attempt | null>(null);
  const appointmentIdRef = useRef(appointmentId);
  const loadSequenceRef = useRef(0);
  appointmentIdRef.current = appointmentId;
  useDemoNavigationBlocker(() => ({
    blocked: Boolean(
      busy || outcomeUnknown || inFlight.current || attempt.current?.uncertain,
    ),
    message:
      open && data && hasUnsavedPrevisitDraft(text, answers, baseline)
        ? "Discard your unsaved patient intake and visit note?"
        : null,
  }));
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
    inFlight.current = null;
  }, [appointmentId]);

  const acceptSaved = (result: Response) => {
    const saved = savedText(result.note);
    const savedAnswers = result.note?.intake_answers ?? {};
    setData(result);
    setText(saved);
    setAnswers(savedAnswers);
    setReusedNoteId(result.note?.inherited_from?.note_id ?? null);
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
    setError("");
  };

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
      if (attempt.current?.uncertain) {
        if (matchesPrevisitSave(result, attempt.current)) acceptSaved(result);
        else {
          setData(result);
          setError(
            "The latest saved note does not acknowledge the original request. Its outcome remains unknown; retry the same request.",
          );
        }
        return;
      }
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
    if (inFlight.current || attempt.current?.uncertain) return;
    setOpen(true);
    setExpandedPart(0);
    pendingPartFocus.current = null;
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
    if (
      busy ||
      outcomeUnknown ||
      inFlight.current ||
      attempt.current?.uncertain
    )
      return;
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
    if (
      busy ||
      outcomeUnknown ||
      inFlight.current ||
      attempt.current?.uncertain
    )
      return;
    if (data && hasUnsavedPrevisitDraft(text, answers, baseline)) {
      setConfirmDiscard(true);
      return;
    }
    closeEditor();
  };
  const useLatestSaved = () => {
    if (inFlight.current || attempt.current?.uncertain) return;
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
    if (inFlight.current || attempt.current?.uncertain) return;
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
    if (inFlight.current) return;
    const retrying = attempt.current?.uncertain === true;
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
      (!retrying && normalizedText === "" && !hasAnswers(answers) && !data.note)
    )
      return;
    if (!retrying && status === "submitted" && hasContent && !attested) {
      setError(
        "Confirm the intake is current and may be shared with your care team before saving.",
      );
      return;
    }
    const current = attempt.current ?? {
      appointment_id: appointmentId,
      uncertain: false,
      body: {
        previsit_note: {
          form_id: data.intake_form?.id,
          text: normalizedText,
          intake_answers: structuredClone(answers),
          status,
          reused_note_id: reusedNoteId,
          attestation: attested,
          expected_version: data.note?.version_number ?? 0,
          request_key: crypto.randomUUID(),
        },
      },
    };
    attempt.current = current;
    inFlight.current = current;
    const requestAppointmentId = appointmentId;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<Response>(
        `/api/patient_portal/appointments/${appointmentId}/previsit_note`,
        { method: "POST", body: current.body },
      );
      if (!matchesPrevisitSave(result, current)) {
        throw new ApiError(
          502,
          "The saved note did not acknowledge this exact request.",
          "outcome_unconfirmed",
        );
      }
      if (
        appointmentIdRef.current !== requestAppointmentId ||
        attempt.current !== current
      )
        return;
      acceptSaved(result);
    } catch (reason) {
      if (
        appointmentIdRef.current !== requestAppointmentId ||
        attempt.current !== current
      )
        return;
      if (current.uncertain || isUncertainPrevisitSave(reason)) {
        current.uncertain = true;
        setOutcomeUnknown(true);
        setError(
          "The original save outcome is still unknown. Retry this exact request or check its saved revision before editing or closing it.",
        );
      } else if (
        reason instanceof ApiError &&
        reason.status === 409 &&
        reason.code === "stale_record"
      ) {
        attempt.current = null;
        setOutcomeUnknown(false);
        setConflict(true);
        setLatestReady(false);
        setLatestRefreshFailed(false);
        setError(
          "This visit note changed elsewhere. The latest saved note was refreshed; your draft is still here until you choose which version to use.",
        );
        void load(true);
      } else {
        attempt.current = null;
        setOutcomeUnknown(false);
        setError(
          reason instanceof Error
            ? reason.message
            : "Your visit note could not be saved.",
        );
      }
    } finally {
      if (inFlight.current === current) {
        inFlight.current = null;
        if (appointmentIdRef.current === requestAppointmentId) setBusy(false);
      }
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
  const intakeFields = data?.intake_form?.fields;
  const visibleQuestions = intakeFields?.filter((field) =>
    intakeFieldVisible(field, answers, intakeFields),
  );
  const answeredQuestionCount =
    visibleQuestions?.filter(
      (field) => answerState(answers[field.id]) !== "unanswered",
    ).length ?? 0;
  const questionProgress = visibleQuestions?.length
    ? Math.round((answeredQuestionCount / visibleQuestions.length) * 100)
    : 0;
  // Group by the backend-owned chunk identifier while retaining the supplied field order.
  // Older forms without chunks keep the prior, bounded eight-question presentation.
  const questionParts = (intakeFields ?? [])
    .reduce<
      Array<{
        index: number;
        chunkId?: string;
        fields: NonNullable<typeof intakeFields>;
      }>
    >((parts, field) => {
      const previous = parts[parts.length - 1];
      const ungrouped = !field.chunk_id;
      if (
        previous &&
        previous.chunkId === field.chunk_id &&
        (!ungrouped || previous.fields.length < 8)
      ) {
        previous.fields.push(field);
      } else {
        parts.push({
          index: parts.length,
          chunkId: field.chunk_id,
          fields: [field],
        });
      }
      return parts;
    }, [])
    .filter((part) =>
      part.fields.some((field) =>
        intakeFieldVisible(field, answers, intakeFields),
      ),
    );
  const visiblePartIndexes = questionParts.map((part) => part.index).join(",");
  const firstVisiblePart = questionParts[0]?.index ?? false;
  const hasVisibleParts = questionParts.length > 0;
  useEffect(() => {
    if (!hasVisibleParts) return;
    setExpandedPart((current) =>
      current !== false &&
      !visiblePartIndexes.split(",").includes(String(current))
        ? firstVisiblePart
        : current,
    );
  }, [firstVisiblePart, hasVisibleParts, visiblePartIndexes]);

  return (
    <>
      <Button
        size="small"
        variant="outlined"
        disabled={busy || outcomeUnknown}
        onClick={openEditor}
      >
        Complete intake / visit note
      </Button>
      <Dialog
        open={open}
        onClose={requestClose}
        fullWidth
        fullScreen={fullScreen}
        maxWidth="lg"
        sx={{
          "& .MuiDialog-paper": {
            overflow: "hidden",
            maxHeight: fullScreen ? "100%" : "calc(100% - 48px)",
          },
        }}
        aria-labelledby={`previsit-note-${appointmentId}-title`}
      >
        <DialogTitle
          id={`previsit-note-${appointmentId}-title`}
          sx={{ flexShrink: 0, pb: 1.5 }}
        >
          <Stack spacing={0.5}>
            <Typography component="span" variant="h5">
              Prepare for your visit
            </Typography>
            <Typography component="span" variant="body2" color="text.secondary">
              {appointmentLabel}
            </Typography>
            {visibleQuestions && (
              <Stack spacing={0.5} sx={{ pt: 1 }}>
                <Typography
                  id={`previsit-note-${appointmentId}-progress`}
                  variant="body2"
                  color="text.secondary"
                  aria-live="polite"
                >
                  {answeredQuestionCount} of {visibleQuestions.length} shown
                  questions responded to
                  {questionParts.length > 1 &&
                    ` · ${questionParts.length} sections`}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={questionProgress}
                  aria-labelledby={`previsit-note-${appointmentId}-progress`}
                />
              </Stack>
            )}
          </Stack>
        </DialogTitle>
        <DialogContent
          dividers
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            px: { xs: 2, sm: 3 },
            pb: { xs: 3, sm: 4 },
          }}
        >
          <Stack spacing={2}>
            <Typography color="text.secondary" variant="body2">
              Review what applies and save a draft whenever you need to pause.
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
                {data.intake_form &&
                  questionParts.map((part, position) => {
                    const form = data.intake_form!;
                    const shown = part.fields.filter((field) =>
                      intakeFieldVisible(field, answers, form.fields),
                    );
                    const responded = shown.filter(
                      (field) =>
                        answerState(answers[field.id]) !== "unanswered",
                    ).length;
                    const title = intakeSectionTitle(part.chunkId, part.fields);
                    const nextPart = questionParts[position + 1];
                    return (
                      <Accordion
                        key={part.index}
                        expanded={expandedPart === part.index}
                        onChange={(_, expanded) => {
                          pendingPartFocus.current = null;
                          setExpandedPart(expanded ? part.index : false);
                        }}
                        slotProps={{
                          transition: {
                            onEntered: () => {
                              if (pendingPartFocus.current !== part.index)
                                return;
                              pendingPartFocus.current = null;
                              const heading = document.getElementById(
                                `previsit-note-${appointmentId}-part-${part.index}`,
                              );
                              heading?.focus({ preventScroll: true });
                              heading?.scrollIntoView({ block: "start" });
                            },
                          },
                        }}
                        disableGutters
                        variant="outlined"
                        sx={{ "&:before": { display: "none" } }}
                      >
                        <AccordionSummary
                          expandIcon={<ExpandMoreRoundedIcon />}
                          id={`previsit-note-${appointmentId}-part-${part.index}`}
                          aria-controls={`previsit-note-${appointmentId}-part-${part.index}-content`}
                        >
                          <Stack spacing={0.25}>
                            <Typography
                              component="span"
                              sx={{ fontWeight: 600 }}
                            >
                              {title}
                            </Typography>
                            <Typography
                              component="span"
                              variant="body2"
                              color="text.secondary"
                            >
                              Section {position + 1} of {questionParts.length}
                              {" · "}
                              {responded} of {shown.length} responded to
                            </Typography>
                          </Stack>
                        </AccordionSummary>
                        <AccordionDetails>
                          <IntakeQuestions
                            fields={part.fields}
                            definitions={form.fields}
                            answers={answers}
                            medicationOptions={form.medication_options}
                            medicationReferences={form.medication_references}
                            disabled={
                              loading || busy || outcomeUnknown || conflict
                            }
                            onChange={(next) => {
                              setAnswers(next);
                              setAttested(false);
                            }}
                          />
                        </AccordionDetails>
                        <AccordionActions sx={{ px: 2, pb: 2 }}>
                          {nextPart ? (
                            <Button
                              variant="outlined"
                              onClick={() => {
                                pendingPartFocus.current = nextPart.index;
                                setExpandedPart(nextPart.index);
                              }}
                              aria-label={`Next section: ${intakeSectionTitle(nextPart.chunkId, nextPart.fields)}`}
                            >
                              Next section
                            </Button>
                          ) : (
                            <Button
                              variant="outlined"
                              onClick={() => {
                                const heading = document.getElementById(
                                  `previsit-note-${appointmentId}-additional`,
                                );
                                heading?.focus({ preventScroll: true });
                                heading?.scrollIntoView({ block: "start" });
                              }}
                            >
                              Review additional note
                            </Button>
                          )}
                        </AccordionActions>
                      </Accordion>
                    );
                  })}
                <Box
                  component="section"
                  aria-labelledby={`previsit-note-${appointmentId}-additional`}
                >
                  <Typography
                    id={`previsit-note-${appointmentId}-additional`}
                    tabIndex={-1}
                    component="h3"
                    variant="h6"
                    sx={{ mb: 1.5 }}
                  >
                    Anything else the clinic should know?
                  </Typography>
                  <TextField
                    label="Additional note (optional)"
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      setAttested(false);
                    }}
                    multiline
                    minRows={4}
                    fullWidth
                    disabled={loading || busy || outcomeUnknown || conflict}
                    slotProps={{ htmlInput: { maxLength: 5_000 } }}
                    helperText="You can clear a saved note before the visit starts."
                  />
                </Box>
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
        <DialogActions
          sx={{
            flexShrink: 0,
            gap: 0.5,
            flexWrap: "wrap",
            p: { xs: 1.5, sm: 2 },
          }}
        >
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
          {outcomeUnknown && (
            <Button disabled={busy || loading} onClick={() => void load(true)}>
              Check saved intake
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
              disabled={busy || loading || (!canSave && !outcomeUnknown)}
              onClick={() => void save()}
            >
              {busy
                ? "Saving…"
                : outcomeUnknown
                  ? "Retry same request"
                  : !text.trim() && !hasAnswers(answers) && data.note
                    ? "Save cleared intake"
                    : "Submit intake and note"}
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
