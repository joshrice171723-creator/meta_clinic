import {
  Autocomplete,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

export type IntakeAnswer =
  | string
  | {
      state: string;
      value: string;
      unit?: string;
      measured_at?: string;
      source?: string;
      entries?: IntakeHistoryEntry[];
    };
export type IntakeAnswers = Record<string, IntakeAnswer>;
export type IntakeHistoryEntry = {
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
};
export type IntakeField = {
  id: string;
  label: string;
  reusable: boolean;
  units?: string[];
  choices?: string[];
  history_kind?: "treatment" | "procedure";
};

const DEFAULT_ANSWER_STATES = [
  "unanswered",
  "answered",
  "not_asked",
  "unknown",
  "declined",
  "not_applicable",
  "negative",
] as const;

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
    kind: kind === "procedure" ? "procedure" : "diet_program",
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
  };
}

function historyEntries(
  answer: IntakeAnswer | undefined,
  kind: IntakeField["history_kind"],
) {
  if (typeof answer === "object" && answer.entries?.length) {
    return answer.entries;
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
  answers,
  disabled,
  onChange,
  medicationOptions = [],
  answerStates = [...DEFAULT_ANSWER_STATES],
}: {
  fields: IntakeField[];
  answers: IntakeAnswers;
  disabled: boolean;
  onChange: (answers: IntakeAnswers) => void;
  medicationOptions?: string[];
  answerStates?: string[];
}) {
  const set = (id: string, change: Exclude<IntakeAnswer, string>) =>
    onChange({ ...answers, [id]: change });
  return (
    <Stack spacing={2}>
      {fields.map((field) => {
        const answer = answers[field.id];
        const detail =
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
        return (
          <Stack key={field.id} spacing={1}>
            {repeatable && (
              <Typography variant="subtitle2">{field.label}</Typography>
            )}
            <TextField
              select
              label={`${field.label} status`}
              value={state}
              disabled={disabled}
              onChange={(event) => {
                const nextState = event.target.value;
                set(
                  field.id,
                  nextState === "answered"
                    ? { ...detail, state: nextState, value: detail.value ?? "" }
                    : { state: nextState, value: "" },
                );
              }}
              helperText="Choose Unknown, Declined, or Not applicable when an answer is not available."
            >
              {answerStates.map((option) => (
                <MenuItem key={option} value={option}>
                  {stateLabel(option)}
                </MenuItem>
              ))}
            </TextField>
            {state === "answered" && field.choices ? (
              <TextField
                select
                label={field.label}
                value={answerValue(answer)}
                disabled={disabled}
                onChange={(event) =>
                  set(field.id, {
                    state: event.target.value ? "answered" : "unanswered",
                    value: event.target.value,
                  })
                }
              >
                <MenuItem value="">Choose an answer</MenuItem>
                {field.choices.map((choice) => (
                  <MenuItem key={choice} value={choice}>
                    {choice}
                  </MenuItem>
                ))}
              </TextField>
            ) : state === "answered" && field.history_kind ? (
              <HistoryEntryEditor
                kind={field.history_kind}
                entries={historyEntries(answer, field.history_kind)}
                medicationOptions={medicationOptions}
                disabled={disabled}
                onChange={(entries) =>
                  set(field.id, { state: "answered", value: "", entries })
                }
              />
            ) : state === "answered" && repeatable ? (
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
                            ? [...medicationOptions, "Other — enter manually"]
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
                              state: text.trim() ? "answered" : "unanswered",
                              value: text,
                            });
                        }}
                        onInputChange={(_event, value, reason) => {
                          if (reason !== "input" || field.id === "medications")
                            return;
                          const next = [...entries];
                          next[index] = value.replaceAll("\n", " ");
                          const text = next.join("\n");
                          if (text.length <= 600)
                            set(field.id, {
                              state: text.trim() ? "answered" : "unanswered",
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
                          (entry && !medicationOptions.includes(entry))) && (
                          <TextField
                            label="Other medicine or supplement"
                            value={entry.replace(/^Other:\s*/, "")}
                            disabled={disabled}
                            onChange={(event) => {
                              const next = [...entries];
                              next[index] = `Other: ${event.target.value}`;
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
            ) : state === "answered" ? (
              <TextField
                label={field.label}
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
                  },
                }}
                onChange={(event) =>
                  set(field.id, {
                    ...detail,
                    state: event.target.value ? "answered" : "unanswered",
                    value: event.target.value,
                  })
                }
              />
            ) : null}
            {field.units &&
              state === "answered" &&
              ["unit", "measured_at", "source"].map((key) => {
                const options =
                  key === "unit"
                    ? field.units
                    : key === "source"
                      ? ["patient_reported", "clinic_measured"]
                      : undefined;
                return (
                  <TextField
                    key={key}
                    label={`${field.label} ${key.replaceAll("_", " ")}`}
                    value={
                      detail[key as "unit" | "measured_at" | "source"] ?? ""
                    }
                    select={Boolean(options)}
                    type={key === "measured_at" ? "date" : "text"}
                    disabled={disabled}
                    slotProps={{ inputLabel: { shrink: true } }}
                    onChange={(event) =>
                      set(field.id, { ...detail, [key]: event.target.value })
                    }
                  >
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
          </Stack>
        );
      })}
    </Stack>
  );
}

function HistoryEntryEditor({
  kind,
  entries,
  medicationOptions,
  disabled,
  onChange,
}: {
  kind: "treatment" | "procedure";
  entries: IntakeHistoryEntry[];
  medicationOptions: string[];
  disabled: boolean;
  onChange: (entries: IntakeHistoryEntry[]) => void;
}) {
  const update = (index: number, change: Partial<IntakeHistoryEntry>) =>
    onChange(
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...change } : entry,
      ),
    );

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Add one record for each previous treatment or procedure. Choose Unknown
        when the detail is not available; this is history, not a prescribing or
        clinical approval decision.
      </Typography>
      {entries.map((entry, index) => (
        <Stack
          key={index}
          spacing={1.25}
          sx={{ pl: 1.5, borderLeft: 2, borderColor: "divider" }}
        >
          <Typography variant="subtitle2">
            History record {index + 1}
          </Typography>
          <TextField
            select
            label={kind === "treatment" ? "Record type" : "Record type"}
            value={entry.kind}
            disabled={disabled}
            onChange={(event) => update(index, { kind: event.target.value })}
          >
            {(kind === "treatment"
              ? ["diet_program", "medication", "other"]
              : ["procedure", "surgery", "hospitalization", "other"]
            ).map((option) => (
              <MenuItem key={option} value={option}>
                {stateLabel(option)}
              </MenuItem>
            ))}
          </TextField>
          {kind === "treatment" && entry.kind === "medication" ? (
            <>
              <Autocomplete
                options={[...medicationOptions, "Other — enter manually"]}
                value={
                  medicationOptions.includes(entry.name)
                    ? entry.name
                    : entry.name
                      ? "Other — enter manually"
                      : null
                }
                disabled={disabled}
                onChange={(_event, value) =>
                  update(index, {
                    name:
                      value === "Other — enter manually" ? "" : (value ?? ""),
                  })
                }
                renderInput={(params) => (
                  <TextField {...params} label="Previous medicine" />
                )}
              />
              {!medicationOptions.includes(entry.name) && (
                <TextField
                  label="Other medicine name"
                  value={entry.name}
                  disabled={disabled}
                  onChange={(event) =>
                    update(index, { name: event.target.value })
                  }
                />
              )}
            </>
          ) : (
            <TextField
              label={
                kind === "treatment"
                  ? "Program or treatment name"
                  : "Procedure or hospitalization name"
              }
              value={entry.name}
              disabled={disabled}
              onChange={(event) => update(index, { name: event.target.value })}
            />
          )}
          <TextField
            select
            label="Date certainty"
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
          {entry.date_precision !== "unknown" && (
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
          ) : (
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
          )}
          {entries.length > 1 && (
            <Button
              disabled={disabled}
              onClick={() =>
                onChange(entries.filter((_entry, row) => row !== index))
              }
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
