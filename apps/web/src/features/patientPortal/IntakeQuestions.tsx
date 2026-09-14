import { Autocomplete, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";

export type IntakeAnswer = string | { state: string; value: string; unit?: string; measured_at?: string; source?: string };
export type IntakeAnswers = Record<string, IntakeAnswer>;
export type IntakeField = { id: string; label: string; reusable: boolean; units?: string[] };
export function answerValue(answer: IntakeAnswer | undefined) { return typeof answer === "string" ? answer : answer?.value ?? ""; }
export function answerState(answer: IntakeAnswer | undefined) { return typeof answer === "string" ? (answer.trim() ? "answered" : "unanswered") : answer?.state ?? "unanswered"; }

export function IntakeQuestions({ fields, answers, states, disabled, onChange, medicationOptions = [] }: {
  fields: IntakeField[]; answers: IntakeAnswers; states: string[]; disabled: boolean;
  onChange: (answers: IntakeAnswers) => void; medicationOptions?: string[];
}) {
  const set = (id: string, change: Exclude<IntakeAnswer, string>) => onChange({ ...answers, [id]: change });
  return <Stack spacing={2}>{fields.map((field) => {
    const answer = answers[field.id];
    const detail = typeof answer === "object" ? answer : { state: answerState(answer), value: answerValue(answer) };
    const repeatable = ["medications", "allergies", "prior_approaches", "procedures"].includes(field.id);
    return <Stack key={field.id} spacing={1}>
      <Typography variant="subtitle2">{field.label}</Typography>
      <TextField select label={`${field.label} — answer status`} value={answerState(answer)} disabled={disabled}
        onChange={(event) => set(field.id, { state: event.target.value, value: "" })}>
        {states.map((state) => <MenuItem key={state} value={state}>{state === "negative" ? (field.id === "allergies" ? "No known allergies" : "None / No") : state.replaceAll("_", " ")}</MenuItem>)}
      </TextField>
      {repeatable ? <>
        {answerValue(answer).split("\n").map((entry, index, entries) => <Stack key={index} direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Autocomplete freeSolo options={field.id === "medications" ? medicationOptions : []} value={entry} inputValue={entry} disabled={disabled} fullWidth
            onInputChange={(_event, value) => { const next = [...entries]; next[index] = value.replaceAll("\n", " "); const text = next.join("\n"); if (text.length <= 600) set(field.id, { state: text.trim() ? "answered" : "unanswered", value: text }); }}
            renderInput={(params) => <TextField {...params} label={`${field.label} ${index + 1}`} helperText={field.id === "allergies" ? "Substance and reaction, if known." : field.id === "medications" ? "Search the clinic list or enter an unmatched medicine, supplement or product." : "Enter one approach or procedure."} />} />
          {entries.length > 1 && <Button disabled={disabled} onClick={() => set(field.id, { state: "answered", value: entries.filter((_value, row) => row !== index).join("\n") })}>Remove</Button>}
        </Stack>)}
        <Button disabled={disabled || answerValue(answer).length >= 599} onClick={() => set(field.id, { state: "answered", value: `${answerValue(answer)}\n` })}>Add another</Button>
      </> : <TextField label={field.label} value={answerValue(answer)} disabled={disabled} multiline={!field.units} fullWidth
        slotProps={{ htmlInput: { maxLength: 600, inputMode: field.units ? "decimal" : "text" } }}
        onChange={(event) => set(field.id, { ...detail, state: event.target.value ? "answered" : "unanswered", value: event.target.value })} />}
      {field.units && answerState(answer) === "answered" && ["unit", "measured_at", "source"].map((key) => {
        const options = key === "unit" ? field.units : key === "source" ? ["patient_reported", "clinic_measured"] : undefined;
        return <TextField key={key} label={`${field.label} ${key.replaceAll("_", " ")}`} value={detail[key as "unit" | "measured_at" | "source"] ?? ""}
          select={Boolean(options)} type={key === "measured_at" ? "date" : "text"} disabled={disabled} slotProps={{ inputLabel: { shrink: true } }}
          onChange={(event) => set(field.id, { ...detail, [key]: event.target.value })}>
          {options?.map((option) => <MenuItem key={option} value={option}>{option === "[in_i]" ? "inches" : option === "[lb_av]" ? "pounds" : option.replaceAll("_", " ")}</MenuItem>)}
        </TextField>;
      })}
    </Stack>;
  })}</Stack>;
}
