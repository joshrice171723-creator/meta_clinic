import { useId, useRef, useState, type ReactNode } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Autocomplete,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import type {
  IntakeAnswers,
  IntakeField,
  IntakeRecordEntry,
} from "./IntakeQuestions";

function choiceLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function hasOtherChoice(value: string | string[]) {
  return (Array.isArray(value) ? value : [value]).some(
    (choice) => choice.toLowerCase() === "other",
  );
}

export function dependencyMatches(
  field: IntakeField,
  value: string | string[] | undefined,
) {
  const values = Array.isArray(value) ? value : [value];
  return values.some(
    (choice) =>
      choice !== undefined && field.depends_values?.includes(choice) === true,
  );
}

export function IntakeFieldFrame({
  field,
  children,
}: {
  field: IntakeField;
  children: ReactNode;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const content = (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      {field.requiredness && (
        <Typography variant="body2" color="text.secondary">
          {field.requiredness === "extended"
            ? "Optional detail"
            : field.requiredness === "clinician"
              ? "For clinician review"
              : field.requiredness === "conditional"
                ? "Applies to your answers"
                : "Core question"}
        </Typography>
      )}
      {field.purpose && (
        <Typography variant="body2" color="text.secondary">
          {field.purpose}
        </Typography>
      )}
      {children}
    </Stack>
  );
  if (!field.sensitive) return content;
  return (
    <Accordion
      expanded={expanded}
      onChange={(_event, open) => setExpanded(open)}
      disableGutters
      elevation={0}
      sx={{
        border: 1,
        borderColor: "divider",
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary
        id={`${id}-heading`}
        aria-controls={`${id}-content`}
        expandIcon={<ExpandMoreIcon />}
      >
        <Stack spacing={0.5}>
          <Typography>{field.label}</Typography>
          <Typography variant="body2" color="text.secondary">
            {expanded
              ? "Hide sensitive questions and answers"
              : "Open sensitive questions when you have privacy"}
          </Typography>
        </Stack>
      </AccordionSummary>
      <AccordionDetails>
        {/* Deliberate opening is required even when an answer already exists. */}
        {expanded && (
          <Stack spacing={1}>
            <Typography variant="body2" color="text.secondary">
              You can choose Declined. Closing this section hides the answers on
              this screen; it does not remove saved information.
            </Typography>
            {content}
          </Stack>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export function IntakeValueControl({
  field,
  value,
  disabled,
  onChange,
  otherDetail = "",
  onOtherDetailChange,
  unitChoices = false,
}: {
  field: IntakeField;
  value: string | string[];
  disabled: boolean;
  onChange: (value: string | string[]) => void;
  otherDetail?: string;
  onOtherDetailChange?: (value: string) => void;
  unitChoices?: boolean;
}) {
  const id = useId();
  const multiple = field.input_type === "multiselect";
  const bounded = multiple || field.choices !== undefined;
  const choices = field.choices ?? [];
  const selected = multiple
    ? Array.isArray(value)
      ? value
      : value
        ? [value]
        : []
    : typeof value === "string"
      ? value
      : "";
  const savedValues = Array.isArray(selected)
    ? selected
    : selected
      ? [selected]
      : [];
  const unavailable = savedValues.filter((choice) => !choices.includes(choice));
  const type =
    field.input_type === "multiselect"
      ? "text"
      : (field.input_type ?? (field.units?.length ? "number" : "text"));
  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      <TextField
        id={id}
        label={field.label}
        select={bounded}
        type={type}
        value={selected}
        disabled={disabled}
        fullWidth
        helperText={
          unavailable.length && bounded
            ? "A saved choice is no longer offered. Review it before changing this answer."
            : undefined
        }
        slotProps={{
          inputLabel: { shrink: true },
          htmlInput: {
            min: field.min,
            max: field.max,
            step: type === "number" ? "any" : undefined,
            maxLength: type === "text" ? 600 : undefined,
          },
          select: multiple
            ? {
                multiple: true,
                renderValue: (selection) =>
                  (selection as string[]).map(choiceLabel).join(", "),
              }
            : undefined,
        }}
        onChange={(event) => {
          const next: string | string[] = event.target.value;
          // Native autofill may provide a comma-separated value for a multiple select.
          onChange(
            multiple
              ? Array.isArray(next)
                ? next
                : next.split(",").filter(Boolean)
              : next,
          );
        }}
      >
        {bounded && !multiple && <MenuItem value="">Choose an answer</MenuItem>}
        {bounded &&
          unavailable.map((choice) => (
            <MenuItem key={choice} value={choice} disabled>
              {unitChoices ? choice : choiceLabel(choice)} (saved)
            </MenuItem>
          ))}
        {bounded &&
          choices.map((choice) => (
            <MenuItem key={choice} value={choice}>
              {unitChoices ? choice : choiceLabel(choice)}
            </MenuItem>
          ))}
      </TextField>
      {hasOtherChoice(selected) && onOtherDetailChange && (
        <TextField
          label={`${field.label} — Other detail (optional)`}
          value={otherDetail}
          disabled={disabled}
          fullWidth
          slotProps={{ htmlInput: { maxLength: 600 } }}
          onChange={(event) => onOtherDetailChange(event.target.value)}
        />
      )}
    </Stack>
  );
}

export function RecordFields({
  fields,
  entry,
  answers,
  disabled,
  onChange,
  medicationReferences = [],
}: {
  fields: IntakeField[];
  entry: IntakeRecordEntry;
  answers: IntakeAnswers;
  disabled: boolean;
  onChange: (change: IntakeRecordEntry) => void;
  medicationReferences?: Array<{ id: string; name: string }>;
}) {
  const ids = new Set(fields.map((field) => field.id));
  return (
    <Stack spacing={1.5}>
      {fields
        .filter((field) => {
          if (!field.depends_on) return true;
          // Record-local dependencies take precedence over top-level answers.
          if (
            ids.has(field.depends_on) ||
            Object.hasOwn(entry, field.depends_on)
          ) {
            return dependencyMatches(field, entry[field.depends_on]);
          }
          const answer = answers[field.depends_on];
          return typeof answer === "string"
            ? dependencyMatches(field, answer)
            : answer?.state === "answered" &&
                dependencyMatches(field, answer.values ?? answer.value);
        })
        .map((field) => {
          const otherKey = `${field.id}_other_detail`;
          const unitKey = `${field.id}_unit`;
          const isMedicationReference =
            field.reference_kind === "clinic_medication_catalog";
          const selectedMedication = medicationReferences.find(
            (product) => product.id === entry[field.id],
          );
          return (
            <IntakeFieldFrame key={field.id} field={field}>
              {isMedicationReference ? (
                <>
                  <Autocomplete
                    options={[
                      ...medicationReferences,
                      { id: "other", name: "Other — enter manually" },
                    ]}
                    getOptionLabel={(option) => option.name}
                    getOptionKey={(option) => option.id}
                    isOptionEqualToValue={(option, value) =>
                      option.id === value.id
                    }
                    value={
                      selectedMedication ??
                      (entry.name
                        ? { id: "other", name: "Other — enter manually" }
                        : null)
                    }
                    disabled={disabled}
                    onChange={(_event, value) =>
                      onChange({
                        [field.id]:
                          value?.id === "other" ? "" : (value?.id ?? ""),
                        name: value && value.id !== "other" ? value.name : "",
                      })
                    }
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={field.label}
                        helperText="Choose a clinic catalog medicine or enter Other manually."
                      />
                    )}
                  />
                  {!selectedMedication && (
                    <TextField
                      label="Other medicine name"
                      value={entry.name ?? ""}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({ [field.id]: "", name: event.target.value })
                      }
                    />
                  )}
                </>
              ) : (
                <IntakeValueControl
                  field={field}
                  value={
                    entry[field.id] ??
                    (field.input_type === "multiselect" ? [] : "")
                  }
                  disabled={disabled}
                  onChange={(value) =>
                    onChange({
                      [field.id]: value,
                      ...(!hasOtherChoice(value) &&
                      entry[otherKey] !== undefined
                        ? { [otherKey]: "" }
                        : {}),
                    })
                  }
                  otherDetail={
                    typeof entry[otherKey] === "string" ? entry[otherKey] : ""
                  }
                  onOtherDetailChange={
                    ids.has(otherKey)
                      ? undefined
                      : (value) => onChange({ [otherKey]: value })
                  }
                />
              )}
              {!!field.units?.length && !ids.has(unitKey) && (
                <IntakeValueControl
                  field={{
                    id: unitKey,
                    label: `${field.label} unit`,
                    reusable: false,
                    choices: field.units,
                  }}
                  value={entry[unitKey] ?? ""}
                  disabled={disabled}
                  unitChoices
                  onChange={(value) => onChange({ [unitKey]: value })}
                />
              )}
            </IntakeFieldFrame>
          );
        })}
    </Stack>
  );
}

export function useIntakeEntryKeys(count: number) {
  const keys = useRef<number[]>([]);
  const nextKey = useRef(0);
  while (keys.current.length < count) keys.current.push(nextKey.current++);
  keys.current.length = count;
  return {
    keys: keys.current,
    remove: (index: number) => {
      keys.current.splice(index, 1);
    },
  };
}

export function RecordEntryEditor({
  field,
  entries,
  answers,
  disabled,
  onChange,
  medicationReferences,
}: {
  field: IntakeField;
  entries: IntakeRecordEntry[];
  answers: IntakeAnswers;
  disabled: boolean;
  onChange: (entries: IntakeRecordEntry[]) => void;
  medicationReferences?: Array<{ id: string; name: string }>;
}) {
  const entryKeys = useIntakeEntryKeys(entries.length);
  return (
    <Stack spacing={2}>
      <Typography variant="subtitle2">{field.label}</Typography>
      {!entries.length && (
        <Typography variant="body2" color="text.secondary">
          No records added. An empty list does not mean None.
        </Typography>
      )}
      {entries.map((entry, index) => (
        <Stack
          key={entryKeys.keys[index]}
          spacing={1.5}
          sx={{ pl: 1.5, borderLeft: 2, borderColor: "divider", minWidth: 0 }}
        >
          <Typography variant="subtitle2">
            {field.label} — record {index + 1}
          </Typography>
          <RecordFields
            fields={field.record_fields ?? []}
            entry={entry}
            answers={answers}
            medicationReferences={medicationReferences}
            disabled={disabled}
            onChange={(change) =>
              onChange(
                entries.map((current, row) =>
                  row === index ? { ...current, ...change } : current,
                ),
              )
            }
          />
          <Button
            type="button"
            disabled={disabled}
            aria-label={`Remove ${field.label} record ${index + 1}`}
            sx={{ alignSelf: "flex-start" }}
            onClick={() => {
              entryKeys.remove(index);
              onChange(entries.filter((_entry, row) => row !== index));
            }}
          >
            Remove record
          </Button>
        </Stack>
      ))}
      <Button
        type="button"
        disabled={disabled || entries.length >= 20}
        sx={{ alignSelf: "flex-start" }}
        onClick={() => onChange([...entries, {}])}
      >
        Add {field.label} record
      </Button>
    </Stack>
  );
}
