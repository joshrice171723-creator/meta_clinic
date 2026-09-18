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
    };
export type IntakeAnswers = Record<string, IntakeAnswer>;
export type IntakeField = {
  id: string;
  label: string;
  reusable: boolean;
  units?: string[];
  choices?: string[];
};

const DEFAULT_ANSWER_STATES = [
  "unanswered",
  "answered",
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
