import {
  Autocomplete,
  Box,
  Button,
  FormHelperText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useId, useState } from "react";
import {
  IntakeFieldFrame,
  IntakeValueControl,
  RecordEntryEditor,
  RecordFields,
  dependencyMatches,
  hasOtherChoice,
  useIntakeEntryKeys,
} from "./StructuredIntakeFields";

// Optional properties support the existing history records; new record values
// are strings or string arrays and are sent without numeric coercion.
export type IntakeRecordEntry = Record<string, string | string[] | undefined>;

export type IntakeAnswer =
  | string
  | {
      state: string;
      value: string;
      unit?: string;
      measured_at?: string;
      source?: string;
      verification?: string;
      other_detail?: string;
      values?: string[];
      entries?: IntakeRecordEntry[];
    };
export type IntakeAnswers = Record<string, IntakeAnswer>;
export type IntakeHistoryEntry = IntakeRecordEntry & {
  kind: string;
  name: string;
  date_precision: string;
  date_value: string;
  duration: string;
  outcome: string;
  maintenance: string;
  stop_reason: string;
  adverse_effects: string;
  adverse_effect_details: string;
  complication_state: string;
  complication_details: string;
  current_status?: string;
  review_route?: string;
  managing_clinician?: string;
  details?: string;
  certainty?: string;
  actual_use?: string;
  dose_value?: string;
  dose_unit?: string;
  dose_certainty?: string;
  frequency?: string;
  source?: string;
  severity?: string;
};
export type IntakeField = {
  id: string;
  label: string;
  reusable?: boolean;
  input_type?:
    | "text"
    | "number"
    | "date"
    | "datetime-local"
    | "time"
    | "month"
    | "multiselect";
  min?: number | string;
  max?: number | string;
  requiredness?: "core" | "conditional" | "extended" | "clinician";
  purpose?: string;
  sensitive?: boolean;
  chunk_id?: string;
  record_fields?: IntakeField[];
  units?: string[];
  source_choices?: string[];
  verification_choices?: string[];
  choices?: string[];
  depends_on?: string;
  depends_values?: string[];
  history_kind?:
    | "treatment"
    | "procedure"
    | "condition"
    | "symptom"
    | "family"
    | "medication"
    | "allergy";
  reference_kind?: "clinic_medication_catalog";
};

export function intakeFieldVisible(
  field: IntakeField,
  answers: IntakeAnswers,
  definitions: IntakeField[] = [],
  visited: string[] = [],
) {
  if (!field.depends_on) return true;
  if (visited.includes(field.id)) return false;
  const parent = definitions.find(
    (candidate) => candidate.id === field.depends_on,
  );
  if (
    parent &&
    !intakeFieldVisible(parent, answers, definitions, [...visited, field.id])
  )
    return false;
  const dependency = answers[field.depends_on];
  const state = answerState(dependency);
  if (state !== "answered") {
    return (field.depends_values ?? []).some(
      (value) => value === state || (state === "negative" && value === "no"),
    );
  }
  return dependencyMatches(
    field,
    typeof dependency === "object" && dependency.values
      ? dependency.values
      : answerValue(dependency),
  );
}

const DEFAULT_ANSWER_STATES = [
  "unanswered",
  "answered",
  "not_asked",
  "unknown",
  "declined",
  "not_applicable",
  "negative",
] as const;

const EXCEPTION_ANSWER_STATES = new Set(["not_asked", "unknown", "declined"]);

export function exceptionAnswerStates(answerStates: string[]) {
  return answerStates.filter((state) => EXCEPTION_ANSWER_STATES.has(state));
}

function stateLabel(value: string) {
  return value === "negative"
    ? "No / negative"
    : value
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase());
}

function emptyHistoryEntry(
  kind: IntakeField["history_kind"],
): IntakeHistoryEntry {
  return {
    kind:
      kind === "procedure"
        ? "procedure"
        : kind === "condition"
          ? "metabolic"
          : kind === "symptom"
            ? "abdominal_pain"
            : kind === "family"
              ? "parent"
              : kind === "medication"
                ? "prescribed"
                : kind === "allergy"
                  ? "allergy"
                  : "diet_program",
    name: "",
    date_precision: "unknown",
    date_value: "",
    duration: "unknown",
    outcome: "unknown",
    maintenance: "unknown",
    stop_reason: "unknown",
    adverse_effects: "unknown",
    adverse_effect_details: "",
    complication_state: "unknown",
    complication_details: "",
    current_status: "unknown",
    review_route: "unknown",
    managing_clinician: "",
    details: "",
    certainty: "unknown",
    actual_use: "unknown",
    dose_value: "",
    dose_unit: "unknown",
    dose_certainty: "unknown",
    frequency: "unknown",
    source: "unknown",
    severity: "unknown",
  };
}

function historyEntryAction(kind: IntakeField["history_kind"]) {
  return kind === "symptom"
    ? "Add symptom"
    : kind === "medication"
      ? "Add medicine or supplement"
      : kind === "allergy"
        ? "Add allergy or reaction"
        : kind === "condition"
          ? "Add health condition"
          : kind === "family"
            ? "Add family history"
            : kind === "procedure"
              ? "Add procedure or hospitalization"
              : "Add treatment history";
}

function historyEntries(
  answer: IntakeAnswer | undefined,
  kind: IntakeField["history_kind"],
) {
  if (typeof answer === "object" && answer.entries?.length) {
    return answer.entries.map((entry) => {
      const result = emptyHistoryEntry(kind);
      // Preserve typed extras while keeping legacy string controls compatible.
      Object.assign(result, entry);
      for (const [key, fallback] of Object.entries(emptyHistoryEntry(kind))) {
        if (typeof entry[key] !== "string") result[key] = fallback;
      }
      return result;
    });
  }
  const legacyEntries = answerValue(answer)
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
  return legacyEntries.length
    ? legacyEntries.map((name) => ({ ...emptyHistoryEntry(kind), name }))
    : [emptyHistoryEntry(kind)];
}

export function answerValue(answer: IntakeAnswer | undefined) {
  return typeof answer === "string" ? answer : (answer?.value ?? "");
}
export function answerState(answer: IntakeAnswer | undefined) {
  return typeof answer === "string"
    ? answer.trim()
      ? "answered"
      : "unanswered"
    : (answer?.state ?? "unanswered");
}

export function IntakeQuestions({
  fields,
  definitions = fields,
  layout = "grid",
  answers,
  disabled,
  onChange,
  medicationOptions = [],
  medicationReferences = [],
  answerStates = [...DEFAULT_ANSWER_STATES],
  questionErrors = {},
}: {
  fields: IntakeField[];
  definitions?: IntakeField[];
  layout?: "grid" | "stack";
  answers: IntakeAnswers;
  disabled: boolean;
  onChange: (answers: IntakeAnswers) => void;
  medicationOptions?: string[];
  medicationReferences?: Array<{ id: string; name: string }>;
  answerStates?: string[];
  questionErrors?: Record<string, string>;
}) {
  const feedbackId = useId();
  const [editingAnswers, setEditingAnswers] = useState<string[]>([]);
  const set = (id: string, change: Exclude<IntakeAnswer, string>) => {
    setEditingAnswers((current) => current.filter((fieldId) => fieldId !== id));
    onChange({ ...answers, [id]: change });
  };
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        "& .MuiFormLabel-root": {
          whiteSpace: "normal",
          lineHeight: 1.25,
          maxWidth: "100%",
          overflowWrap: "anywhere",
        },
        "& .MuiFormControlLabel-label": {
          whiteSpace: "normal",
          overflowWrap: "anywhere",
        },
        gridTemplateColumns: {
          xs: "minmax(0, 1fr)",
          md:
            layout === "stack" ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))",
        },
      }}
    >
      {fields
        .filter((field) => intakeFieldVisible(field, answers, definitions))
        .map((field) => {
          const answer = answers[field.id];
          const detail: Exclude<IntakeAnswer, string> =
            typeof answer === "object"
              ? answer
              : { state: answerState(answer), value: answerValue(answer) };
          const state = answerState(answer);
          const repeatable = [
            "medications",
            "allergies",
            "prior_approaches",
            "procedures",
          ].includes(field.id);
          const canEnterAnswer =
            ["answered", "unanswered"].includes(state) ||
            editingAnswers.includes(field.id);
          const saveAnswer = (value: string | string[]) =>
            set(field.id, {
              ...detail,
              state: (
                Array.isArray(value) ? value.length > 0 : value.trim() !== ""
              )
                ? "answered"
                : "unanswered",
              value: Array.isArray(value) ? "" : value,
              ...(Array.isArray(value) ? { values: value } : {}),
              ...(detail.other_detail !== undefined && !hasOtherChoice(value)
                ? { other_detail: "" }
                : {}),
            });
          return (
            <Box
              key={field.id}
              component="section"
              aria-label={`${field.label} question`}
              data-intake-question={field.id}
              tabIndex={questionErrors[field.id] ? -1 : undefined}
              aria-describedby={
                questionErrors[field.id]
                  ? `${feedbackId}-${field.id}-error`
                  : undefined
              }
              sx={{
                alignSelf: "start",
                minWidth: 0,
                scrollMarginBlock: 16,
                "&:focus": {
                  outline: "2px solid currentColor",
                  outlineOffset: 4,
                },
                gridColumn:
                  field.history_kind || field.record_fields || repeatable
                    ? { md: "1 / -1" }
                    : undefined,
              }}
            >
              <Stack spacing={1.5}>
                {questionErrors[field.id] && (
                  <FormHelperText id={`${feedbackId}-${field.id}-error`} error>
                    {questionErrors[field.id]}
                  </FormHelperText>
                )}
                {(field.history_kind ||
                  field.record_fields ||
                  repeatable ||
                  !canEnterAnswer) && (
                  <Typography
                    component="h3"
                    variant="subtitle1"
                    sx={{ overflowWrap: "anywhere" }}
                  >
                    {field.label}
                  </Typography>
                )}
                <IntakeFieldFrame field={field} compact={layout === "stack"}>
                  {canEnterAnswer && field.history_kind ? (
                    state === "answered" ? (
                      <HistoryEntryEditor
                        kind={field.history_kind}
                        recordFields={field.record_fields ?? []}
                        answers={answers}
                        entries={historyEntries(answer, field.history_kind)}
                        medicationOptions={medicationOptions}
                        medicationReferences={medicationReferences}
                        disabled={disabled}
                        onChange={(entries) =>
                          set(field.id, {
                            state: entries.length ? "answered" : "unanswered",
                            value: "",
                            ...(entries.length ? { entries } : {}),
                          })
                        }
                      />
                    ) : (
                      <Button
                        variant="outlined"
                        disabled={disabled}
                        onClick={() =>
                          set(field.id, {
                            state: "answered",
                            value: "",
                            entries: [emptyHistoryEntry(field.history_kind)],
                          })
                        }
                      >
                        {historyEntryAction(field.history_kind)}
                      </Button>
                    )
                  ) : canEnterAnswer && field.record_fields ? (
                    state === "answered" ? (
                      <RecordEntryEditor
                        field={field}
                        answers={answers}
                        entries={detail.entries ?? []}
                        medicationReferences={medicationReferences}
                        disabled={disabled}
                        onChange={(entries) =>
                          set(field.id, {
                            state: entries.length ? "answered" : "unanswered",
                            value: "",
                            ...(entries.length ? { entries } : {}),
                          })
                        }
                      />
                    ) : (
                      <Button
                        variant="outlined"
                        disabled={disabled}
                        onClick={() =>
                          set(field.id, {
                            state: "answered",
                            value: "",
                            entries: [{}],
                          })
                        }
                      >
                        Add details
                      </Button>
                    )
                  ) : canEnterAnswer && (field.choices || field.input_type) ? (
                    <IntakeValueControl
                      field={field}
                      value={
                        field.input_type === "multiselect"
                          ? (detail.values ?? [])
                          : detail.value
                      }
                      otherDetail={detail.other_detail ?? ""}
                      disabled={disabled}
                      onChange={saveAnswer}
                      onOtherDetailChange={
                        fields.some(
                          (item) => item.id === `${field.id}_other_detail`,
                        )
                          ? undefined
                          : (other_detail) =>
                              set(field.id, {
                                ...detail,
                                state: "answered",
                                other_detail,
                              })
                      }
                    />
                  ) : canEnterAnswer && repeatable ? (
                    <>
                      {answerValue(answer)
                        .split("\n")
                        .map((entry, index, entries) => (
                          <Stack
                            key={index}
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                          >
                            <Autocomplete
                              freeSolo={field.id !== "medications"}
                              options={
                                field.id === "medications"
                                  ? [
                                      ...medicationOptions,
                                      "Other — enter manually",
                                    ]
                                  : []
                              }
                              value={
                                field.id === "medications" &&
                                entry &&
                                !medicationOptions.includes(entry) &&
                                !entry.startsWith("Other: ")
                                  ? "Other — enter manually"
                                  : field.id === "medications" &&
                                      entry.startsWith("Other: ")
                                    ? "Other — enter manually"
                                    : entry
                              }
                              inputValue={
                                field.id === "medications" &&
                                (entry.startsWith("Other: ") ||
                                  (entry && !medicationOptions.includes(entry)))
                                  ? "Other — enter manually"
                                  : entry
                              }
                              disabled={disabled}
                              fullWidth
                              onChange={(_event, value) => {
                                if (
                                  field.id !== "medications" ||
                                  typeof value !== "string"
                                )
                                  return;
                                const next = [...entries];
                                next[index] =
                                  value === "Other — enter manually"
                                    ? "Other: "
                                    : value;
                                const text = next.join("\n");
                                if (text.length <= 600)
                                  set(field.id, {
                                    state: text.trim()
                                      ? "answered"
                                      : "unanswered",
                                    value: text,
                                  });
                              }}
                              onInputChange={(_event, value, reason) => {
                                if (
                                  reason !== "input" ||
                                  field.id === "medications"
                                )
                                  return;
                                const next = [...entries];
                                next[index] = value.replaceAll("\n", " ");
                                const text = next.join("\n");
                                if (text.length <= 600)
                                  set(field.id, {
                                    state: text.trim()
                                      ? "answered"
                                      : "unanswered",
                                    value: text,
                                  });
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label={`${field.label} ${index + 1}`}
                                  helperText={
                                    field.id === "allergies"
                                      ? "Substance and reaction, if known."
                                      : field.id === "medications"
                                        ? "Search the clinic list or enter an unmatched medicine, supplement or product."
                                        : "Enter one approach or procedure."
                                  }
                                />
                              )}
                            />
                            {field.id === "medications" &&
                              (entry.startsWith("Other: ") ||
                                (entry &&
                                  !medicationOptions.includes(entry))) && (
                                <TextField
                                  label="Other medicine or supplement"
                                  value={entry.replace(/^Other:\s*/, "")}
                                  disabled={disabled}
                                  onChange={(event) => {
                                    const next = [...entries];
                                    next[index] =
                                      `Other: ${event.target.value}`;
                                    const text = next.join("\n");
                                    if (text.length <= 600)
                                      set(field.id, {
                                        state: text.trim()
                                          ? "answered"
                                          : "unanswered",
                                        value: text,
                                      });
                                  }}
                                />
                              )}
                            {entries.length > 1 && (
                              <Button
                                disabled={disabled}
                                aria-label={`Remove ${field.label} ${index + 1}`}
                                onClick={() =>
                                  set(field.id, {
                                    state: "answered",
                                    value: entries
                                      .filter((_value, row) => row !== index)
                                      .join("\n"),
                                  })
                                }
                              >
                                Remove
                              </Button>
                            )}
                          </Stack>
                        ))}
                      <Button
                        disabled={disabled || answerValue(answer).length >= 599}
                        aria-label={`Add another ${field.label}`}
                        onClick={() =>
                          set(field.id, {
                            state: "answered",
                            value: `${answerValue(answer)}\n`,
                          })
                        }
                      >
                        Add another
                      </Button>
                    </>
                  ) : canEnterAnswer ? (
                    <TextField
                      label={field.label}
                      type={field.units ? "number" : "text"}
                      value={answerValue(answer)}
                      disabled={disabled}
                      multiline={!field.units}
                      fullWidth
                      size={field.units ? "small" : "medium"}
                      sx={field.units ? { maxWidth: { sm: 360 } } : undefined}
                      slotProps={{
                        htmlInput: {
                          maxLength: 600,
                          inputMode: field.units ? "decimal" : "text",
                          step: field.units ? "any" : undefined,
                          min: field.min,
                          max: field.max,
                        },
                      }}
                      onChange={(event) => saveAnswer(event.target.value)}
                    />
                  ) : null}
                  <AnswerStateMenu
                    state={state}
                    questionLabel={field.label}
                    answerStates={answerStates}
                    disabled={disabled}
                    editing={editingAnswers.includes(field.id)}
                    onEnterAnswer={() =>
                      setEditingAnswers((current) =>
                        current.includes(field.id)
                          ? current.filter((id) => id !== field.id)
                          : [...current, field.id],
                      )
                    }
                    onChange={(nextState) =>
                      set(
                        field.id,
                        nextState === "unanswered"
                          ? { ...detail, state: nextState, value: "" }
                          : { state: nextState, value: "" },
                      )
                    }
                  />
                  {field.units &&
                    state === "answered" &&
                    !field.record_fields &&
                    !field.history_kind &&
                    [
                      "unit",
                      "measured_at",
                      "source",
                      ...(field.verification_choices ? ["verification"] : []),
                    ].map((key) => {
                      const options =
                        key === "unit"
                          ? field.units
                          : key === "source"
                            ? (field.source_choices ?? [
                                "patient_reported",
                                "clinic_measured",
                              ])
                            : key === "verification"
                              ? field.verification_choices
                              : undefined;
                      return (
                        <TextField
                          key={key}
                          label={`${field.label} ${key.replaceAll("_", " ")}`}
                          value={
                            detail[
                              key as
                                | "unit"
                                | "measured_at"
                                | "source"
                                | "verification"
                            ] ?? ""
                          }
                          select={Boolean(options)}
                          type={key === "measured_at" ? "date" : "text"}
                          disabled={disabled}
                          slotProps={{ inputLabel: { shrink: true } }}
                          onChange={(event) =>
                            set(field.id, {
                              ...detail,
                              [key]: event.target.value,
                            })
                          }
                        >
                          {options && (
                            <MenuItem value="">Not recorded</MenuItem>
                          )}
                          {options?.map((option) => (
                            <MenuItem key={option} value={option}>
                              {option === "[in_i]"
                                ? "inches"
                                : option === "[lb_av]"
                                  ? "pounds"
                                  : option.replaceAll("_", " ")}
                            </MenuItem>
                          ))}
                        </TextField>
                      );
                    })}
                </IntakeFieldFrame>
              </Stack>
            </Box>
          );
        })}
    </Box>
  );
}

function AnswerStateMenu({
  state,
  questionLabel,
  answerStates,
  disabled,
  editing,
  onEnterAnswer,
  onChange,
}: {
  state: string;
  questionLabel: string;
  answerStates: string[];
  disabled: boolean;
  editing: boolean;
  onEnterAnswer: () => void;
  onChange: (state: string) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const alternativeStates = exceptionAnswerStates(answerStates);
  const hasAlternativeAnswer = !["answered", "unanswered"].includes(state);
  if (alternativeStates.length === 0) return null;

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      {hasAlternativeAnswer ? (
        <>
          <Typography variant="body2" color="text.secondary" role="status">
            {`Recorded as ${stateLabel(state)}`}
          </Typography>
          <Button size="small" disabled={disabled} onClick={onEnterAnswer}>
            {editing ? "Keep recorded answer" : "Enter an answer"}
          </Button>
        </>
      ) : (
        <Button
          size="small"
          disabled={disabled}
          aria-label={`Choose a response for ${questionLabel}`}
          aria-haspopup="menu"
          aria-expanded={Boolean(anchorEl)}
          onClick={(event) => setAnchorEl(event.currentTarget)}
        >
          Choose a response
        </Button>
      )}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        {alternativeStates.map((option) => (
          <MenuItem
            key={option}
            onClick={() => {
              onChange(option);
              setAnchorEl(null);
            }}
          >
            {stateLabel(option)}
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  );
}

function HistoryEntryEditor({
  kind,
  recordFields,
  answers,
  entries,
  medicationOptions,
  medicationReferences,
  disabled,
  onChange,
}: {
  kind:
    | "treatment"
    | "procedure"
    | "condition"
    | "symptom"
    | "family"
    | "medication"
    | "allergy";
  entries: IntakeHistoryEntry[];
  recordFields: IntakeField[];
  answers: IntakeAnswers;
  medicationOptions: string[];
  medicationReferences: Array<{ id: string; name: string }>;
  disabled: boolean;
  onChange: (entries: IntakeHistoryEntry[]) => void;
}) {
  const entryKeys = useIntakeEntryKeys(entries.length);
  const update = (index: number, change: Partial<IntakeHistoryEntry>) =>
    onChange(
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...change } : entry,
      ),
    );
  const typeOptions =
    kind === "treatment"
      ? ["diet_program", "medication", "other"]
      : kind === "procedure"
        ? ["procedure", "surgery", "hospitalization", "other"]
        : kind === "condition"
          ? [
              "metabolic",
              "cardiovascular",
              "endocrine",
              "gastrointestinal",
              "kidney",
              "respiratory",
              "neurological",
              "pain",
              "other",
            ]
          : kind === "symptom"
            ? [
                "abdominal_pain",
                "vomiting",
                "bowel_changes",
                "dizziness_fainting",
                "palpitations",
                "breathing_difficulty",
                "vision_changes",
                "other",
              ]
            : kind === "family"
              ? [
                  "parent",
                  "sibling",
                  "child",
                  "grandparent",
                  "other",
                  "unknown",
                ]
              : kind === "medication"
                ? ["prescribed", "over_the_counter", "supplement", "other"]
                : ["allergy", "intolerance", "adverse_effect", "other"];
  const typeLabel =
    kind === "condition"
      ? "Condition domain"
      : kind === "symptom"
        ? "Symptom type"
        : kind === "family"
          ? "Affected relative"
          : kind === "medication"
            ? "Medication source"
            : kind === "allergy"
              ? "Reaction type"
              : "Record type";
  const historyLabel =
    kind === "condition"
      ? "condition"
      : kind === "symptom"
        ? "current symptom"
        : kind === "family"
          ? "family-history item"
          : kind === "medication"
            ? "current medicine or supplement"
            : kind === "allergy"
              ? "allergy or intolerance"
              : kind === "procedure"
                ? "procedure"
                : "treatment";
  const existingFields = new Set([
    "kind",
    "name",
    ...(kind === "family" ? [] : ["date_precision", "date_value"]),
    ...(kind === "treatment"
      ? [
          "duration",
          "outcome",
          "maintenance",
          "stop_reason",
          "adverse_effects",
          "adverse_effect_details",
        ]
      : kind === "procedure"
        ? ["outcome", "complication_state", "complication_details"]
        : kind === "medication"
          ? [
              "actual_use",
              "dose_certainty",
              "dose_value",
              "dose_unit",
              "frequency",
              "source",
              "details",
            ]
          : kind === "allergy"
            ? ["certainty", "severity", "details"]
            : kind === "condition"
              ? [
                  "current_status",
                  "review_route",
                  "managing_clinician",
                  "details",
                ]
              : kind === "symptom"
                ? ["review_route", "details"]
                : ["certainty", "details"]),
  ]);
  const extraFields = recordFields.filter(
    (field) => !existingFields.has(field.id) && field.id !== "product_id",
  );

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Add one record for each {historyLabel}. Choose Unknown when the detail
        is not available; this is history, not a prescribing or clinical
        approval decision.
      </Typography>
      {entries.map((entry, index) => (
        <Stack
          key={entryKeys.keys[index]}
          spacing={1.25}
          sx={{ pl: 1.5, borderLeft: 2, borderColor: "divider" }}
        >
          <Typography variant="subtitle2">
            History record {index + 1}
          </Typography>
          <TextField
            select
            label={typeLabel}
            value={entry.kind}
            disabled={disabled}
            onChange={(event) => update(index, { kind: event.target.value })}
          >
            {typeOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {stateLabel(option)}
              </MenuItem>
            ))}
          </TextField>
          {(kind === "treatment" && entry.kind === "medication") ||
          kind === "medication" ? (
            <>
              <Autocomplete
                options={[
                  ...medicationReferences.map((product) => ({
                    ...product,
                    label: product.name,
                  })),
                  ...(!medicationReferences.length
                    ? medicationOptions.map((name) => ({
                        id: "",
                        name,
                        label: name,
                      }))
                    : []),
                  { id: "other", name: "", label: "Other — enter manually" },
                ]}
                getOptionLabel={(option) => option.label}
                getOptionKey={(option) => option.id || option.name}
                isOptionEqualToValue={(option, value) =>
                  option.id === value.id && option.name === value.name
                }
                value={
                  medicationReferences.find(
                    (product) => product.id === entry.product_id,
                  )
                    ? {
                        ...medicationReferences.find(
                          (product) => product.id === entry.product_id,
                        )!,
                        label: entry.name,
                      }
                    : entry.name
                      ? {
                          id: "other",
                          name: "",
                          label: "Other — enter manually",
                        }
                      : null
                }
                disabled={disabled}
                onChange={(_event, value) =>
                  update(index, {
                    name: value?.name ?? "",
                    ...(recordFields.some((field) => field.id === "product_id")
                      ? {
                          product_id:
                            value?.id === "other" ? "" : (value?.id ?? ""),
                        }
                      : {}),
                  })
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={
                      kind === "medication"
                        ? "Medicine or supplement"
                        : "Previous medicine"
                    }
                  />
                )}
              />
              {!medicationReferences.some(
                (product) => product.id === entry.product_id,
              ) && (
                <TextField
                  label={
                    kind === "medication"
                      ? "Other medicine or supplement"
                      : "Other medicine name"
                  }
                  value={entry.name}
                  disabled={disabled}
                  onChange={(event) =>
                    update(index, { name: event.target.value })
                  }
                />
              )}
            </>
          ) : kind === "allergy" ? (
            <Autocomplete
              freeSolo
              options={[
                ...new Set([
                  ...medicationReferences.map((product) => product.name),
                  ...medicationOptions,
                ]),
              ]}
              value={entry.name || null}
              inputValue={entry.name}
              disabled={disabled}
              onChange={(_event, value) => update(index, { name: value ?? "" })}
              onInputChange={(_event, value, reason) => {
                if (reason === "input" || reason === "clear") {
                  update(index, { name: value });
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Substance or product"
                  helperText="Search clinic medicine names or enter another substance. This records the reported name only."
                />
              )}
            />
          ) : (
            <TextField
              label={
                kind === "treatment"
                  ? "Program or treatment name"
                  : kind === "condition"
                    ? "Condition name"
                    : kind === "symptom"
                      ? "Symptom detail"
                      : kind === "family"
                        ? "Family condition"
                        : "Procedure or hospitalization name"
              }
              value={entry.name}
              disabled={disabled}
              onChange={(event) => update(index, { name: event.target.value })}
            />
          )}
          {kind !== "family" && (
            <TextField
              select
              label={
                kind === "symptom"
                  ? "Onset certainty"
                  : kind === "medication"
                    ? "Last-use certainty"
                    : kind === "allergy"
                      ? "Reaction date certainty"
                      : "Date certainty"
              }
              value={entry.date_precision}
              disabled={disabled}
              onChange={(event) =>
                update(index, {
                  date_precision: event.target.value,
                  date_value: "",
                })
              }
            >
              {[
                ["exact", "Exact date"],
                ["approximate", "Approximate year"],
                ["unknown", "Unknown date"],
              ].map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          )}
          {kind !== "family" && entry.date_precision !== "unknown" && (
            <TextField
              label={
                entry.date_precision === "exact" ? "Date" : "Approximate year"
              }
              type={entry.date_precision === "exact" ? "date" : "number"}
              value={entry.date_value}
              disabled={disabled}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput:
                  entry.date_precision === "approximate"
                    ? { min: 1900, max: new Date().getFullYear() }
                    : undefined,
              }}
              onChange={(event) =>
                update(index, { date_value: event.target.value })
              }
            />
          )}
          {kind === "treatment" ? (
            <>
              <HistoryChoice
                label="How long was it tried?"
                value={entry.duration}
                options={[
                  ["less_than_month", "Less than 1 month"],
                  ["one_to_three_months", "1–3 months"],
                  ["three_to_six_months", "3–6 months"],
                  ["six_to_twelve_months", "6–12 months"],
                  ["more_than_year", "More than 1 year"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { duration: value })}
              />
              <HistoryChoice
                label="Outcome"
                value={entry.outcome}
                options={[
                  ["no_benefit", "No benefit"],
                  ["some_benefit", "Some benefit"],
                  [
                    "meaningful_benefit_not_maintained",
                    "Benefit not maintained",
                  ],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { outcome: value })}
              />
              <HistoryChoice
                label="Was the benefit maintained?"
                value={entry.maintenance}
                options={[
                  ["yes", "Yes"],
                  ["no", "No"],
                  ["unknown", "Unknown"],
                  ["not_applicable", "Not applicable"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { maintenance: value })}
              />
              <HistoryChoice
                label="Reason it ended"
                value={entry.stop_reason}
                options={[
                  ["completed", "Completed"],
                  ["no_benefit", "No benefit"],
                  ["adverse_effect", "Adverse effect"],
                  ["cost_or_access", "Cost or access"],
                  ["preference", "Patient preference"],
                  ["clinician_advice", "Clinician advice"],
                  ["ongoing", "Still ongoing"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { stop_reason: value })}
              />
              <HistoryChoice
                label="Adverse effects"
                value={entry.adverse_effects}
                options={[
                  ["none_reported", "None reported"],
                  ["reported", "Reported"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { adverse_effects: value })}
              />
              {entry.adverse_effects === "reported" && (
                <TextField
                  label="Adverse-effect details (optional)"
                  value={entry.adverse_effect_details}
                  disabled={disabled}
                  multiline
                  onChange={(event) =>
                    update(index, {
                      adverse_effect_details: event.target.value,
                    })
                  }
                />
              )}
            </>
          ) : kind === "procedure" ? (
            <>
              <HistoryChoice
                label="Outcome"
                value={entry.outcome}
                options={[
                  ["helpful", "Helpful"],
                  ["not_helpful", "Not helpful"],
                  ["mixed", "Mixed"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { outcome: value })}
              />
              <HistoryChoice
                label="Complications"
                value={entry.complication_state}
                options={[
                  ["none_reported", "None reported"],
                  ["known", "Known"],
                  ["unknown", "Unknown"],
                  ["not_applicable", "Not applicable"],
                ]}
                disabled={disabled}
                onChange={(value) =>
                  update(index, { complication_state: value })
                }
              />
              {entry.complication_state === "known" && (
                <TextField
                  label="Complication details"
                  value={entry.complication_details}
                  disabled={disabled}
                  multiline
                  onChange={(event) =>
                    update(index, { complication_details: event.target.value })
                  }
                />
              )}
            </>
          ) : kind === "medication" ? (
            <>
              <HistoryChoice
                label="Actual use"
                value={entry.actual_use ?? "unknown"}
                options={[
                  ["taking", "Taking"],
                  ["not_taking", "Not taking"],
                  ["as_needed", "As needed"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { actual_use: value })}
              />
              <HistoryChoice
                label="Dose certainty"
                value={entry.dose_certainty ?? "unknown"}
                options={[
                  ["known", "Known"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) =>
                  update(index, {
                    dose_certainty: value,
                    dose_value: value === "known" ? entry.dose_value : "",
                  })
                }
              />
              {entry.dose_certainty === "known" && (
                <>
                  <TextField
                    label="Actual dose amount"
                    type="number"
                    value={entry.dose_value ?? ""}
                    disabled={disabled}
                    slotProps={{
                      htmlInput: { inputMode: "decimal", step: "any" },
                    }}
                    onChange={(event) =>
                      update(index, { dose_value: event.target.value })
                    }
                  />
                  <HistoryChoice
                    label="Actual dose unit"
                    value={entry.dose_unit ?? "unknown"}
                    options={[
                      ["mg", "mg"],
                      ["mcg", "mcg"],
                      ["g", "g"],
                      ["mL", "mL"],
                      ["syringe_units", "Syringe units"],
                      ["tablet", "Tablet"],
                      ["capsule", "Capsule"],
                      ["patch", "Patch"],
                      ["other", "Other"],
                      ["unknown", "Unknown"],
                    ]}
                    disabled={disabled}
                    onChange={(value) => update(index, { dose_unit: value })}
                  />
                </>
              )}
              <HistoryChoice
                label="Frequency"
                value={entry.frequency ?? "unknown"}
                options={[
                  ["once_daily", "Once daily"],
                  ["twice_daily", "Twice daily"],
                  ["three_times_daily", "Three times daily"],
                  ["weekly", "Weekly"],
                  ["monthly", "Monthly"],
                  ["as_needed", "As needed"],
                  ["other", "Other"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { frequency: value })}
              />
              <HistoryChoice
                label="Record source"
                value={entry.source ?? "unknown"}
                options={[
                  ["patient_reported", "Patient reported"],
                  ["medication_list", "Medication list"],
                  ["prescription_record", "Prescription record"],
                  ["supplement_label", "Supplement label"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { source: value })}
              />
              <TextField
                label="Medication details (optional)"
                value={entry.details ?? ""}
                disabled={disabled}
                multiline
                onChange={(event) =>
                  update(index, { details: event.target.value })
                }
              />
            </>
          ) : kind === "allergy" ? (
            <>
              <HistoryChoice
                label="Certainty"
                value={entry.certainty ?? "unknown"}
                options={[
                  ["reported", "Reported"],
                  ["uncertain", "Uncertain"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { certainty: value })}
              />
              <HistoryChoice
                label="Reaction severity"
                value={entry.severity ?? "unknown"}
                options={[
                  ["mild", "Mild"],
                  ["moderate", "Moderate"],
                  ["severe", "Severe"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { severity: value })}
              />
              <TextField
                label="Reaction details (optional)"
                value={entry.details ?? ""}
                disabled={disabled}
                multiline
                onChange={(event) =>
                  update(index, { details: event.target.value })
                }
              />
            </>
          ) : kind === "condition" ? (
            <>
              <HistoryChoice
                label="Current status"
                value={entry.current_status ?? "unknown"}
                options={[
                  ["current", "Current"],
                  ["past", "Past"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { current_status: value })}
              />
              <HistoryChoice
                label="Review route"
                value={entry.review_route ?? "unknown"}
                options={[
                  ["routine_review", "Routine review"],
                  ["clinical_review", "Clinical review"],
                  ["urgent_review", "Urgent review"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { review_route: value })}
              />
              <TextField
                label="Managing clinician (optional)"
                value={entry.managing_clinician ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { managing_clinician: event.target.value })
                }
              />
              <TextField
                label="Condition details (optional)"
                value={entry.details ?? ""}
                disabled={disabled}
                multiline
                onChange={(event) =>
                  update(index, { details: event.target.value })
                }
              />
            </>
          ) : kind === "symptom" ? (
            <>
              <HistoryChoice
                label="Review route"
                value={entry.review_route ?? "unknown"}
                options={[
                  ["routine_review", "Routine review"],
                  ["clinical_review", "Clinical review"],
                  ["urgent_review", "Urgent review"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { review_route: value })}
              />
              <TextField
                label="Symptom details (optional)"
                value={entry.details ?? ""}
                disabled={disabled}
                multiline
                onChange={(event) =>
                  update(index, { details: event.target.value })
                }
              />
            </>
          ) : (
            <>
              <HistoryChoice
                label="Family-history certainty"
                value={entry.certainty ?? "unknown"}
                options={[
                  ["reported", "Reported"],
                  ["uncertain", "Uncertain"],
                  ["unknown", "Unknown"],
                ]}
                disabled={disabled}
                onChange={(value) => update(index, { certainty: value })}
              />
              <TextField
                label="Family-history details (optional)"
                value={entry.details ?? ""}
                disabled={disabled}
                multiline
                onChange={(event) =>
                  update(index, { details: event.target.value })
                }
              />
            </>
          )}
          {!!extraFields.length && (
            <RecordFields
              fields={extraFields}
              entry={entry}
              answers={answers}
              disabled={disabled}
              onChange={(change) => update(index, change)}
            />
          )}
          {entries.length > 0 && (
            <Button
              type="button"
              disabled={disabled}
              aria-label={`Remove ${historyLabel} record ${index + 1}`}
              onClick={() => {
                entryKeys.remove(index);
                onChange(entries.filter((_entry, row) => row !== index));
              }}
            >
              Remove record
            </Button>
          )}
        </Stack>
      ))}
      <Button
        disabled={disabled || entries.length >= 20}
        onClick={() => onChange([...entries, emptyHistoryEntry(kind)])}
      >
        Add another history record
      </Button>
    </Stack>
  );
}

function HistoryChoice({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      select
      label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(([option, optionLabel]) => (
        <MenuItem key={option} value={option}>
          {optionLabel}
        </MenuItem>
      ))}
    </TextField>
  );
}
