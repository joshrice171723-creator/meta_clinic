import { useMemo, useState } from "react";
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
import { api } from "../../api/client";
import { LoadState, useResource } from "../../shared/ui";
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
  type ReviewTopic,
} from "./clinicalHistory";

type FormValue = string | boolean;
type Editor = { kind: HistoryKind; record?: HistoryRecord };
type RecordMutation = {
  record: HistoryRecord;
  patient_id: number;
  encounter_id: number;
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

function displayTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not reviewed";
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
}: {
  patientId: number;
  encounterId?: number;
}) {
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
    const next = { kind, record };
    setEditor(next);
    setForm(initialRecordForm(next));
    setMutationKey(requestKey());
    setMutationError("");
  }

  function changeField(name: string, value: FormValue) {
    setForm((current) => ({ ...current, [name]: value }));
    if (mutationError) {
      setMutationKey(requestKey());
      setMutationError("");
    }
  }

  async function saveRecord() {
    if (!editor || !encounterId) return;
    setSubmitting(true);
    setMutationError("");
    try {
      const endpoint = `${path.split("?")[0]}/${editor.kind}${editor.record ? `/${editor.record.id}` : ""}`;
      const result = await api<RecordMutation>(endpoint, {
        method: editor.record ? "PATCH" : "POST",
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
      });
      if (
        result.patient_id !== patientId ||
        result.encounter_id !== encounterId ||
        (editor.record && result.record.id !== editor.record.id)
      ) {
        throw new Error(
          "The saved history record did not match this patient encounter.",
        );
      }
      setEditor(null);
      setNotice(`${singularLabels[editor.kind]} record saved.`);
      history.refresh();
    } catch (error) {
      setMutationError(
        error instanceof Error
          ? error.message
          : "Unable to save this history record.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function openReview(topic: ReviewTopic) {
    setReviewTopic(topic);
    setReview({ outcome: "", information_source: "", notes: "" });
    setReviewKey(requestKey());
    setReviewError("");
  }

  function changeReview(name: keyof typeof review, value: string) {
    setReview((current) => ({ ...current, [name]: value }));
    if (reviewError) {
      setReviewKey(requestKey());
      setReviewError("");
    }
  }

  async function saveReview() {
    if (!reviewTopic || !encounterId) return;
    setSubmitting(true);
    setReviewError("");
    try {
      const result = await api<{ patient_id: number; encounter_id: number }>(
        `${path.split("?")[0]}/reviews`,
        {
          method: "POST",
          body: {
            review: {
              encounter_id: encounterId,
              request_key: reviewKey,
              topic: reviewTopic,
              ...review,
            },
          },
        },
      );
      if (
        result.patient_id !== patientId ||
        result.encounter_id !== encounterId
      )
        throw new Error("The review did not match this patient encounter.");
      setReviewTopic(null);
      setNotice(
        `${HISTORY_LABELS[reviewTopic as HistoryKind] || humanize(reviewTopic)} review recorded.`,
      );
      history.refresh();
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? error.message
          : "Unable to record this history review.",
      );
    } finally {
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

  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 } }}>
      <Stack spacing={1.5}>
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
            const reviewItem =
              kind === "conditions" ? undefined : data.reviews[kind];
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
                {kind !== "conditions" && (
                  <>
                    <Divider />
                    <Stack spacing={0.5} sx={{ p: 1.25 }}>
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
                )}
              </Paper>
            );
          })}
        </Box>
      </Stack>

      <Dialog
        open={Boolean(editor)}
        onClose={submitting ? undefined : () => setEditor(null)}
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
            <RecordFields
              kind={editor.kind}
              form={form}
              changeField={changeField}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={submitting} onClick={() => setEditor(null)}>
            Cancel
          </Button>
          <Button
            disabled={submitting}
            variant="contained"
            onClick={saveRecord}
          >
            {submitting ? "Saving…" : mutationError ? "Retry" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(reviewTopic)}
        onClose={submitting ? undefined : () => setReviewTopic(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Review {reviewTopic ? humanize(reviewTopic) : "history"}
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
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
          <Button disabled={submitting} onClick={() => setReviewTopic(null)}>
            Cancel
          </Button>
          <Button
            disabled={
              submitting || !review.outcome || !review.information_source
            }
            variant="contained"
            onClick={saveReview}
          >
            {submitting
              ? "Recording…"
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
