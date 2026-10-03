import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  List,
  ListItem,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api, ApiError } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
import { useClinicNavigation } from "./clinicNavigation";
import { PatientCareGaps } from "./RecallWorklist";
import {
  HISTORY_LABELS,
  humanize,
  recordDetail,
  recordTitle,
  type AllergyRecord,
  type ClinicalHistoryResponse,
  type ConditionRecord,
  type HistoryKind,
  type HistoryRecord,
  type MedicationRecord,
  type ReportedIntakeHistory,
  type ReviewTopic,
} from "./clinicalHistory";

type FormValue = string | boolean;
type Editor = { kind: HistoryKind; record?: HistoryRecord };
type RecordMutation = {
  record: HistoryRecord;
  patient_id: number;
  encounter_id: number;
};

type RecordSaveAttempt = {
  endpoint: string;
  method: "POST" | "PATCH";
  patientId: number;
  encounterId: number;
  kind: HistoryKind;
  recordId?: number;
  body: { clinical_history: Record<string, FormValue | number> };
  outcomeUnknown: boolean;
};
type ReviewSaveAttempt = {
  endpoint: string;
  patientId: number;
  encounterId: number;
  topic: ReviewTopic;
  body: {
    review: {
      encounter_id: number;
      request_key: string;
      topic: ReviewTopic;
      outcome: string;
      information_source: string;
      notes: string;
    };
  };
  outcomeUnknown: boolean;
};

const kinds: HistoryKind[] = ["allergies", "medications", "conditions"];
const singularLabels: Record<HistoryKind, string> = {
  allergies: "Allergy",
  medications: "Medication",
  conditions: "Condition",
};

const selectOptions = {
  allergyCategory: [
    "food",
    "medication",
    "environment",
    "biologic",
    "other",
    "unknown",
  ],
  allergyStatus: [
    "active",
    "inactive",
    "resolved",
    "unknown",
    "entered_in_error",
  ],
  allergyVerification: [
    "unconfirmed",
    "presumed",
    "confirmed",
    "refuted",
    "entered_in_error",
  ],
  criticality: ["low", "high", "unable_to_assess"],
  severity: ["mild", "moderate", "severe", "unknown"],
  medicationStatus: [
    "active",
    "completed",
    "on_hold",
    "stopped",
    "not_taken",
    "unknown",
    "entered_in_error",
  ],
  informationSource: [
    "patient",
    "caregiver",
    "clinician",
    "external_record",
    "other",
    "unknown",
  ],
  conditionVerification: [
    "unconfirmed",
    "provisional",
    "confirmed",
    "refuted",
    "entered_in_error",
  ],
  reviewOutcome: [
    "current_list_confirmed",
    "none_reported",
    "follow_up_needed",
    "unable_to_obtain",
  ],
  reviewSource: [
    "patient",
    "caregiver",
    "clinician",
    "external_record",
    "other",
  ],
};

function requestKey() {
  return crypto.randomUUID();
}

export function clinicalHistoryOutcomeIsUnknown(reason: unknown) {
  return (
    !(reason instanceof ApiError) ||
    reason.status === 408 ||
    reason.status >= 500 ||
    reason.code === "outcome_unconfirmed"
  );
}

function displayTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not reviewed";
}

function ReportedIntakeRows({
  questions,
}: {
  questions: ReportedIntakeHistory["questions"];
}) {
  const labels = {
    allergy: "Allergies",
    medication: "Medications",
    condition: "Conditions",
  };
  return (
    <Stack spacing={1}>
      {questions.map((question) => (
        <Stack key={question.id} spacing={0.5}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {labels[question.kind]} · {question.label} ·{" "}
            {humanize(question.answer_state)}
            {question.source
              ? ` · ${humanize(question.source)}`
              : " · source unavailable"}
          </Typography>
          {question.entries.length ? (
            question.entries.map((entry, index) => (
              <Box key={`${question.id}-${index}`} sx={{ pl: 1 }}>
                <Typography variant="body2">
                  {entry.name || `Entry ${index + 1}`}
                </Typography>
                {Object.entries(entry)
                  .filter(([key, value]) => key !== "name" && value)
                  .map(([key, value]) => (
                    <Typography
                      key={key}
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: "block" }}
                    >
                      {humanize(key)}: {value}
                    </Typography>
                  ))}
              </Box>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              No individual entries recorded. This does not establish that the
              patient has none.
            </Typography>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

function initialRecordForm(editor: Editor): Record<string, FormValue> {
  if (editor.kind === "allergies") {
    const record = editor.record as AllergyRecord | undefined;
    return {
      allergen_name: record?.allergen_name || "",
      reaction: record?.reaction || "",
      category: record?.category || "unknown",
      clinical_status: record?.clinical_status || "active",
      verification_status: record?.verification_status || "unconfirmed",
      criticality: record?.criticality || "unable_to_assess",
      severity: record?.severity || "unknown",
      onset_at: record?.onset_at || "",
    };
  }
  if (editor.kind === "medications") {
    const record = editor.record as MedicationRecord | undefined;
    return {
      medication_name: record?.medication_name || "",
      dose_text: record?.dose_text || "",
      route_text: record?.route_text || "",
      frequency_text: record?.frequency_text || "",
      purpose: record?.purpose || "",
      status: record?.status || "active",
      information_source: record?.information_source || "patient",
      effective_from: record?.effective_from || "",
      effective_until: record?.effective_until || "",
      asserted_at: record?.asserted_at || "",
    };
  }
  const record = editor.record as ConditionRecord | undefined;
  return {
    condition_name: record?.condition_name || "",
    care_instruction: record?.care_instruction || "",
    clinical_status: record?.clinical_status || "active",
    verification_status: record?.verification_status || "unconfirmed",
    affects_current_care: record?.affects_current_care || false,
    onset_at: record?.onset_at || "",
    resolved_at: record?.resolved_at || "",
  };
}

function SelectField({
  label,
  value,
  options,
  onChange,
  emptyLabel = "Choose an option",
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  emptyLabel?: string;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <MenuItem key={option || "blank"} value={option}>
          {option ? humanize(option) : emptyLabel}
        </MenuItem>
      ))}
    </TextField>
  );
}

function RecordChips({
  kind,
  record,
}: {
  kind: HistoryKind;
  record: HistoryRecord;
}) {
  const values =
    kind === "medications"
      ? [
          (record as MedicationRecord).status,
          (record as MedicationRecord).information_source,
        ]
      : kind === "allergies"
        ? [
            (record as AllergyRecord).clinical_status,
            (record as AllergyRecord).verification_status,
            (record as AllergyRecord).severity,
            (record as AllergyRecord).criticality,
          ]
        : [
            (record as ConditionRecord).clinical_status,
            (record as ConditionRecord).verification_status,
            (record as ConditionRecord).affects_current_care
              ? "affects current care"
              : "does not affect current care",
          ];
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }} useFlexGap>
      {values.map((value) => (
        <Chip
          key={value}
          label={humanize(value)}
          size="small"
          variant="outlined"
        />
      ))}
    </Stack>
  );
}

export function PatientClinicalHistory({
  patientId,
  encounterId,
  onChanged,
}: {
  patientId: number;
  encounterId?: number;
  onChanged?: () => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const path = `/api/clinic/patients/${encodeURIComponent(String(patientId))}/clinical_history${
    encounterId
      ? `?encounter_id=${encodeURIComponent(String(encounterId))}`
      : ""
  }`;
  const history = useResource<ClinicalHistoryResponse>(path);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [form, setForm] = useState<Record<string, FormValue>>({});
  const [mutationKey, setMutationKey] = useState("");
  const [mutationError, setMutationError] = useState("");
  const [mutationOutcomeUnknown, setMutationOutcomeUnknown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviewTopic, setReviewTopic] = useState<ReviewTopic | null>(null);
  const [review, setReview] = useState({
    outcome: "",
    information_source: "",
    notes: "",
  });
  const [reviewKey, setReviewKey] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewOutcomeUnknown, setReviewOutcomeUnknown] = useState(false);
  const mutationAttemptRef = useRef<RecordSaveAttempt | null>(null);
  const reviewAttemptRef = useRef<ReviewSaveAttempt | null>(null);
  const submittingRef = useRef(false);
  const outcomeUnknown = mutationOutcomeUnknown || reviewOutcomeUnknown;

  useEffect(() => {
    if (!outcomeUnknown) return;
    const warning =
      "A clinical history save outcome is unknown. Retry the exact request before leaving this chart.";
    const unregister = registerBlocker(() => warning);
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = warning;
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [outcomeUnknown, registerBlocker]);

  const lists = useMemo<Record<HistoryKind, HistoryRecord[]> | undefined>(
    () =>
      history.data && {
        allergies: history.data.allergies,
        medications: history.data.medications,
        conditions: history.data.conditions,
      },
    [history.data],
  );

  function openEditor(kind: HistoryKind, record?: HistoryRecord) {
    if (
      submittingRef.current ||
      mutationAttemptRef.current?.outcomeUnknown ||
      reviewAttemptRef.current?.outcomeUnknown
    )
      return;
    mutationAttemptRef.current = null;
    const next = { kind, record };
    setEditor(next);
    setForm(initialRecordForm(next));
    setMutationKey(requestKey());
    setMutationError("");
    setMutationOutcomeUnknown(false);
  }

  function changeField(name: string, value: FormValue) {
    if (submittingRef.current || mutationAttemptRef.current?.outcomeUnknown)
      return;
    setForm((current) => ({ ...current, [name]: value }));
    if (mutationError && !mutationOutcomeUnknown) {
      setMutationKey(requestKey());
      setMutationError("");
    }
  }

  async function saveRecord() {
    if (
      !editor ||
      !encounterId ||
      submittingRef.current ||
      reviewAttemptRef.current?.outcomeUnknown
    )
      return;
    const attempt: RecordSaveAttempt = mutationAttemptRef.current ?? {
      endpoint: `${path.split("?")[0]}/${editor.kind}${editor.record ? `/${editor.record.id}` : ""}`,
      method: editor.record ? "PATCH" : "POST",
      patientId,
      encounterId,
      kind: editor.kind,
      recordId: editor.record?.id,
      body: {
        clinical_history: {
          encounter_id: encounterId,
          request_key: mutationKey,
          ...(editor.record
            ? { lock_version: editor.record.lock_version }
            : {}),
          ...form,
        },
      },
      outcomeUnknown: false,
    };
    mutationAttemptRef.current = attempt;
    submittingRef.current = true;
    setSubmitting(true);
    setMutationError("");
    try {
      const result = await api<RecordMutation>(attempt.endpoint, {
        method: attempt.method,
        body: attempt.body,
      });
      if (
        result.patient_id !== attempt.patientId ||
        result.encounter_id !== attempt.encounterId ||
        (attempt.recordId !== undefined &&
          result.record.id !== attempt.recordId)
      ) {
        throw new Error(
          "The saved history record did not match this patient encounter.",
        );
      }
      mutationAttemptRef.current = null;
      setEditor(null);
      setMutationOutcomeUnknown(false);
      setNotice(`${singularLabels[attempt.kind]} record saved.`);
      history.refresh();
      onChanged?.();
    } catch (error) {
      const unknown =
        attempt.outcomeUnknown || clinicalHistoryOutcomeIsUnknown(error);
      attempt.outcomeUnknown = unknown;
      if (!unknown) mutationAttemptRef.current = null;
      setMutationOutcomeUnknown(unknown);
      setMutationError(
        unknown
          ? "The save outcome is unknown. Retry this exact unchanged request before editing or leaving the chart."
          : error instanceof Error
            ? error.message
            : "Unable to save this history record.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function openReview(topic: ReviewTopic) {
    if (
      submittingRef.current ||
      mutationAttemptRef.current?.outcomeUnknown ||
      reviewAttemptRef.current?.outcomeUnknown
    )
      return;
    reviewAttemptRef.current = null;
    setReviewTopic(topic);
    setReview({ outcome: "", information_source: "", notes: "" });
    setReviewKey(requestKey());
    setReviewError("");
    setReviewOutcomeUnknown(false);
  }

  function changeReview(name: keyof typeof review, value: string) {
    if (submittingRef.current || reviewAttemptRef.current?.outcomeUnknown)
      return;
    setReview((current) => ({ ...current, [name]: value }));
    if (reviewError && !reviewOutcomeUnknown) {
      setReviewKey(requestKey());
      setReviewError("");
    }
  }

  async function saveReview() {
    if (
      !reviewTopic ||
      !encounterId ||
      submittingRef.current ||
      mutationAttemptRef.current?.outcomeUnknown
    )
      return;
    const attempt: ReviewSaveAttempt = reviewAttemptRef.current ?? {
      endpoint: `${path.split("?")[0]}/reviews`,
      patientId,
      encounterId,
      topic: reviewTopic,
      body: {
        review: {
          encounter_id: encounterId,
          request_key: reviewKey,
          topic: reviewTopic,
          ...review,
        },
      },
      outcomeUnknown: false,
    };
    reviewAttemptRef.current = attempt;
    submittingRef.current = true;
    setSubmitting(true);
    setReviewError("");
    try {
      const result = await api<{ patient_id: number; encounter_id: number }>(
        attempt.endpoint,
        { method: "POST", body: attempt.body },
      );
      if (
        result.patient_id !== attempt.patientId ||
        result.encounter_id !== attempt.encounterId
      )
        throw new Error("The review did not match this patient encounter.");
      reviewAttemptRef.current = null;
      setReviewTopic(null);
      setReviewOutcomeUnknown(false);
      setNotice(
        `${HISTORY_LABELS[attempt.topic as HistoryKind] || humanize(attempt.topic)} review recorded.`,
      );
      history.refresh();
      onChanged?.();
    } catch (error) {
      const unknown =
        attempt.outcomeUnknown || clinicalHistoryOutcomeIsUnknown(error);
      attempt.outcomeUnknown = unknown;
      if (!unknown) reviewAttemptRef.current = null;
      setReviewOutcomeUnknown(unknown);
      setReviewError(
        unknown
          ? "The review outcome is unknown. Retry this exact unchanged request before editing or leaving the chart."
          : error instanceof Error
            ? error.message
            : "Unable to record this history review.",
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (!history.data) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6">Clinical history</Typography>
        <LoadState error={history.error} />
        {history.error && (
          <Button size="small" onClick={history.refresh}>
            Retry
          </Button>
        )}
      </Paper>
    );
  }
  const data = history.data;
  const activeReview = reviewTopic ? data.reviews[reviewTopic] : undefined;
  const activeReportedKind =
    reviewTopic === "allergies"
      ? "allergy"
      : reviewTopic === "medications"
        ? "medication"
        : reviewTopic === "conditions"
          ? "condition"
          : null;
  const activeReportedQuestions = (
    data.reported_intake_history?.questions ?? []
  ).filter((question) => question.kind === activeReportedKind);

  return (
    <Paper
      id="clinical-history"
      variant="outlined"
      sx={{ p: { xs: 1.5, md: 2 } }}
    >
      <Stack spacing={1.5}>
        <PatientCareGaps key={patientId} patientId={patientId} />
        <Box>
          <Typography variant="h6">Clinical history</Typography>
          <Typography variant="body2" color="text.secondary">
            Current recorded allergies, medications, and conditions. Empty lists
            do not mean none reported.
          </Typography>
        </Box>
        {!encounterId && (
          <Alert severity="info">
            Open an active encounter to add, edit, or review clinical history.
          </Alert>
        )}
        {encounterId && !data.can_write && (
          <Alert severity="info">
            Clinical history is read only for this encounter.
          </Alert>
        )}
        {notice && (
          <Alert severity="success" onClose={() => setNotice("")}>
            {notice}
          </Alert>
        )}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "repeat(3, minmax(0, 1fr))" },
            gap: 1.5,
          }}
        >
          {kinds.map((kind) => {
            const records = lists?.[kind] || [];
            const reviewItem = data.reviews[kind];
            return (
              <Paper
                key={kind}
                variant="outlined"
                component="section"
                sx={{ minWidth: 0 }}
              >
                <Stack
                  direction="row"
                  sx={{
                    alignItems: "center",
                    justifyContent: "space-between",
                    p: 1.25,
                  }}
                >
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      {HISTORY_LABELS[kind]}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {records.length} recorded
                    </Typography>
                  </Box>
                  {data.can_write && (
                    <Button size="small" onClick={() => openEditor(kind)}>
                      Add
                    </Button>
                  )}
                </Stack>
                <Divider />
                {records.length === 0 ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ p: 1.25 }}
                  >
                    No recorded entries. No absence has been inferred.
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {records.map((record, index) => (
                      <ListItem
                        key={record.id}
                        divider={index < records.length - 1}
                        sx={{ alignItems: "flex-start", py: 1.25 }}
                      >
                        <Stack
                          spacing={0.75}
                          sx={{ width: "100%", minWidth: 0 }}
                        >
                          <Stack
                            direction="row"
                            spacing={1}
                            sx={{
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                            }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 700 }}
                              >
                                {recordTitle(kind, record)}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {recordDetail(kind, record)}
                              </Typography>
                            </Box>
                            {data.can_write && (
                              <Button
                                size="small"
                                onClick={() => openEditor(kind, record)}
                              >
                                Edit
                              </Button>
                            )}
                          </Stack>
                          <RecordChips kind={kind} record={record} />
                          <Typography variant="caption" color="text.secondary">
                            Last reviewed:{" "}
                            {displayTime(record.last_reviewed_at)}
                          </Typography>
                        </Stack>
                      </ListItem>
                    ))}
                  </List>
                )}
                <>
                  <Divider />
                  <Stack
                    id={`clinical-history-${kind}-review`}
                    tabIndex={-1}
                    spacing={0.5}
                    sx={{ p: 1.25 }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {reviewItem
                        ? `${humanize(reviewItem.outcome)} · ${displayTime(reviewItem.reviewed_at)}`
                        : "Not reviewed in this encounter"}
                    </Typography>
                    {data.can_write && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => openReview(kind)}
                      >
                        Review list
                      </Button>
                    )}
                  </Stack>
                </>
              </Paper>
            );
          })}
        </Box>
        <Paper component="section" variant="outlined" sx={{ p: 1.25 }}>
          <Stack spacing={1}>
            <Typography variant="subtitle1">
              Patient-reported allergies, medications, and conditions
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Intake answers remain patient-reported source information. Review
              them with the patient and record reconciled chart items
              separately; this view never creates or verifies clinical records.
            </Typography>
            {data.reported_intake_history?.state === "restricted" ? (
              <Typography>
                Intake history is unavailable with your current access.
              </Typography>
            ) : data.reported_intake_history?.source ? (
              <>
                <Typography variant="caption" color="text.secondary">
                  Encounter #{data.reported_intake_history.source.encounter_id}{" "}
                  · Intake revision{" "}
                  {data.reported_intake_history.source.version} ·{" "}
                  {displayTime(data.reported_intake_history.source.recorded_at)}
                  {data.reported_intake_history.source.recorder
                    ? ` · Recorded by ${humanize(data.reported_intake_history.source.recorder)}`
                    : " · Recorder unavailable"}
                </Typography>
                <ReportedIntakeRows
                  questions={data.reported_intake_history.questions}
                />
                <Button
                  size="small"
                  sx={{ alignSelf: "flex-start" }}
                  href={`/clinic/patients/${patientId}/encounters/${data.reported_intake_history.source.encounter_id}?focus=nurse-workspace`}
                >
                  Open source intake
                </Button>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No saved intake history source is available. No absence has been
                inferred.
              </Typography>
            )}
          </Stack>
        </Paper>
        <Paper component="section" variant="outlined">
          <Stack
            id="clinical-history-care_needs-review"
            tabIndex={-1}
            spacing={0.5}
            sx={{ p: 1.25 }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Care needs
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Review communication, accessibility and other care needs shown in
              the patient care summary.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {data.reviews.care_needs
                ? `${humanize(data.reviews.care_needs.outcome)} · ${displayTime(data.reviews.care_needs.reviewed_at)}`
                : "Not reviewed in this encounter"}
            </Typography>
            {data.can_write && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => openReview("care_needs")}
              >
                Review care needs
              </Button>
            )}
          </Stack>
        </Paper>
      </Stack>

      <Dialog
        open={Boolean(editor)}
        onClose={
          submitting || mutationOutcomeUnknown
            ? undefined
            : () => setEditor(null)
        }
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {editor?.record ? "Edit" : "Add"}{" "}
          {editor ? singularLabels[editor.kind].toLowerCase() : "history"}
        </DialogTitle>
        <DialogContent dividers>
          {mutationError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {mutationError}
            </Alert>
          )}
          {editor && (
            <Box
              component="fieldset"
              disabled={submitting || mutationOutcomeUnknown}
              sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
            >
              <RecordFields
                kind={editor.kind}
                form={form}
                changeField={changeField}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={submitting || mutationOutcomeUnknown}
            onClick={() => setEditor(null)}
          >
            Cancel
          </Button>
          <Button
            disabled={submitting}
            variant="contained"
            onClick={saveRecord}
          >
            {submitting
              ? "Saving…"
              : mutationOutcomeUnknown
                ? "Retry same save"
                : mutationError
                  ? "Retry"
                  : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(reviewTopic)}
        onClose={
          submitting || reviewOutcomeUnknown
            ? undefined
            : () => setReviewTopic(null)
        }
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Review {reviewTopic ? humanize(reviewTopic) : "history"}
        </DialogTitle>
        <DialogContent dividers>
          <Stack
            component="fieldset"
            disabled={submitting || reviewOutcomeUnknown}
            spacing={2}
            sx={{ border: 0, p: 0, m: 0, minWidth: 0 }}
          >
            {reviewTopic && reviewTopic !== "care_needs" && (
              <>
                <Typography variant="body2">
                  Current encounter review status:{" "}
                  {activeReview
                    ? `${humanize(activeReview.outcome)} · ${displayTime(activeReview.reviewed_at)}`
                    : "Not reviewed in this encounter"}
                </Typography>
                <Alert severity="info">
                  This review records the status of the chart list.
                  Patient-reported intake stays separate until a clinician
                  explicitly reconciles it into the chart.
                </Alert>
                {data.reported_intake_history?.state === "restricted" ? (
                  <Typography variant="body2">
                    Patient-reported intake details are unavailable with your
                    current access.
                  </Typography>
                ) : (
                  <ReportedIntakeRows questions={activeReportedQuestions} />
                )}
              </>
            )}
            <Alert severity="info">
              Choose the outcome explicitly. An empty list does not
              automatically mean none reported.
            </Alert>
            {reviewError && <Alert severity="error">{reviewError}</Alert>}
            <SelectField
              label="Review outcome"
              value={review.outcome}
              options={["", ...selectOptions.reviewOutcome]}
              onChange={(value) => changeReview("outcome", value)}
              emptyLabel="Choose an outcome"
            />
            <SelectField
              label="Information source"
              value={review.information_source}
              options={["", ...selectOptions.reviewSource]}
              onChange={(value) => changeReview("information_source", value)}
              emptyLabel="Choose a source"
            />
            <TextField
              label="Review notes"
              multiline
              minRows={3}
              value={review.notes}
              onChange={(event) => changeReview("notes", event.target.value)}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            disabled={submitting || reviewOutcomeUnknown}
            onClick={() => setReviewTopic(null)}
          >
            Cancel
          </Button>
          <Button
            disabled={
              submitting ||
              (!reviewOutcomeUnknown &&
                (!review.outcome || !review.information_source))
            }
            variant="contained"
            onClick={saveReview}
          >
            {submitting
              ? "Recording…"
              : reviewOutcomeUnknown
                ? "Retry same review"
                : reviewError
                  ? "Retry"
                  : "Record review"}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

function RecordFields({
  kind,
  form,
  changeField,
}: {
  kind: HistoryKind;
  form: Record<string, FormValue>;
  changeField: (name: string, value: FormValue) => void;
}) {
  const text = (name: string) => String(form[name] || "");
  if (kind === "allergies")
    return (
      <Stack spacing={2}>
        <TextField
          required
          label="Allergen"
          value={text("allergen_name")}
          onChange={(event) => changeField("allergen_name", event.target.value)}
          slotProps={{ htmlInput: { maxLength: 400 } }}
        />
        <TextField
          label="Reaction"
          multiline
          minRows={2}
          value={text("reaction")}
          onChange={(event) => changeField("reaction", event.target.value)}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
        />
        <SelectField
          label="Category"
          value={text("category")}
          options={selectOptions.allergyCategory}
          onChange={(value) => changeField("category", value)}
        />
        <SelectField
          label="Clinical status"
          value={text("clinical_status")}
          options={selectOptions.allergyStatus}
          onChange={(value) => changeField("clinical_status", value)}
        />
        <SelectField
          label="Verification"
          value={text("verification_status")}
          options={selectOptions.allergyVerification}
          onChange={(value) => changeField("verification_status", value)}
        />
        <SelectField
          label="Criticality"
          value={text("criticality")}
          options={selectOptions.criticality}
          onChange={(value) => changeField("criticality", value)}
        />
        <SelectField
          label="Severity"
          value={text("severity")}
          options={selectOptions.severity}
          onChange={(value) => changeField("severity", value)}
        />
      </Stack>
    );
  if (kind === "medications")
    return (
      <Stack spacing={2}>
        <Alert severity="info">
          Record what was reported or verified. This does not prescribe or
          administer medication.
        </Alert>
        <TextField
          required
          label="Medication"
          value={text("medication_name")}
          onChange={(event) =>
            changeField("medication_name", event.target.value)
          }
          slotProps={{ htmlInput: { maxLength: 400 } }}
        />
        <TextField
          label="Dose as reported"
          value={text("dose_text")}
          onChange={(event) => changeField("dose_text", event.target.value)}
          slotProps={{ htmlInput: { maxLength: 400 } }}
        />
        <TextField
          label="Route as reported"
          value={text("route_text")}
          onChange={(event) => changeField("route_text", event.target.value)}
          slotProps={{ htmlInput: { maxLength: 400 } }}
        />
        <TextField
          label="Frequency as reported"
          value={text("frequency_text")}
          onChange={(event) =>
            changeField("frequency_text", event.target.value)
          }
          slotProps={{ htmlInput: { maxLength: 400 } }}
        />
        <TextField
          label="Purpose"
          multiline
          minRows={2}
          value={text("purpose")}
          onChange={(event) => changeField("purpose", event.target.value)}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
        />
        <SelectField
          label="Status"
          value={text("status")}
          options={selectOptions.medicationStatus}
          onChange={(value) => changeField("status", value)}
        />
        <SelectField
          label="Information source"
          value={text("information_source")}
          options={selectOptions.informationSource}
          onChange={(value) => changeField("information_source", value)}
        />
      </Stack>
    );
  return (
    <Stack spacing={2}>
      <TextField
        required
        label="Condition"
        value={text("condition_name")}
        onChange={(event) => changeField("condition_name", event.target.value)}
        slotProps={{ htmlInput: { maxLength: 400 } }}
      />
      <TextField
        label="Care instruction"
        multiline
        minRows={3}
        value={text("care_instruction")}
        onChange={(event) =>
          changeField("care_instruction", event.target.value)
        }
        slotProps={{ htmlInput: { maxLength: 2000 } }}
      />
      <SelectField
        label="Clinical status"
        value={text("clinical_status")}
        options={selectOptions.allergyStatus}
        onChange={(value) => changeField("clinical_status", value)}
      />
      <SelectField
        label="Verification"
        value={text("verification_status")}
        options={selectOptions.conditionVerification}
        onChange={(value) => changeField("verification_status", value)}
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={Boolean(form.affects_current_care)}
            onChange={(event) =>
              changeField("affects_current_care", event.target.checked)
            }
          />
        }
        label="Affects current care"
      />
    </Stack>
  );
}
