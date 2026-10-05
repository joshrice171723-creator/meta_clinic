import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type {
  WorkflowField,
  WorkflowInput,
  WorkflowInputs,
  WorkflowOperation,
  WorkflowOption,
} from "./workflowTypes";

const optionValue = (option: WorkflowOption) =>
  "selection_id" in option ? option.selection_id : option.value;
const isRecordOption = (
  option: WorkflowOption,
): option is { selection_id: string; label: string } =>
  "selection_id" in option;

function isMissingRequiredValue(value: WorkflowInput) {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function RecordField({
  field,
  value,
  options,
  loading,
  disabled,
  onChange,
  onSearch,
}: {
  field: WorkflowField;
  value: WorkflowInputs[string];
  options: Array<{ selection_id: string; label: string }>;
  loading: boolean;
  disabled: boolean;
  onChange: (value: WorkflowInputs[string]) => void;
  onSearch: (field: string, query: string) => void;
}) {
  const [query, setQuery] = useState("");
  const search = useCallback(
    (value: string) => onSearch(field.key, value),
    [field.key, onSearch],
  );
  useEffect(() => {
    if (query.trim().length < 1) return;
    const timer = window.setTimeout(() => search(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query, search]);
  const selected =
    options.find((option) => option.selection_id === value) ?? null;
  return (
    <Autocomplete
      options={options}
      value={selected}
      inputValue={query || selected?.label || ""}
      loading={loading}
      filterOptions={(items) => items}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, current) =>
        option.selection_id === current.selection_id
      }
      onInputChange={(_, next, reason) => {
        if (reason === "input" || reason === "clear") {
          setQuery(next);
          onChange(null);
        }
      }}
      onChange={(_, option) => {
        onChange(option?.selection_id ?? null);
        setQuery("");
      }}
      noOptionsText={query ? "No matching options." : "Type to search."}
      disabled={disabled}
      renderInput={(params) => (
        <TextField
          {...params}
          label={field.label}
          required={field.required}
          slotProps={{ inputLabel: { shrink: selected ? true : undefined } }}
          helperText="Choose a named record from the clinic."
        />
      )}
    />
  );
}

export function WorkflowForm({
  operation,
  values,
  optionsByField,
  loadingOptions,
  disabled,
  onChange,
  onSearchOption,
  onSubmit,
}: {
  operation: WorkflowOperation;
  values: WorkflowInputs;
  optionsByField: Record<string, WorkflowOption[]>;
  loadingOptions: Record<string, boolean>;
  disabled: boolean;
  onChange: (key: string, value: WorkflowInputs[string]) => void;
  onSearchOption: (field: string, query: string) => void;
  onSubmit: () => void;
}) {
  const unsupported = operation.fields.filter(
    (field) =>
      (field.type === "array" &&
        (!field.items ||
          ![
            "text",
            "number",
            "decimal",
            "boolean",
            "date",
            "datetime",
            "select",
          ].includes(field.items.type) ||
          (field.items.type === "select" && !field.items.options?.length))) ||
      (field.type === "select" && !field.options?.length) ||
      ![
        "text",
        "number",
        "decimal",
        "boolean",
        "date",
        "datetime",
        "select",
        "record",
        "array",
      ].includes(field.type),
  );

  const missingFields = operation.fields.filter(
    (field) => field.required && isMissingRequiredValue(values[field.key]),
  );

  return (
    <Stack
      spacing={2}
      component="form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {operation.fields.map((field) => {
        const value = values[field.key] ?? null;
        const namedOptions = field.options ?? optionsByField[field.key] ?? [];
        if (field.type === "record") {
          return (
            <RecordField
              key={field.key}
              field={field}
              value={value}
              options={namedOptions.filter(isRecordOption)}
              loading={loadingOptions[field.key] === true}
              disabled={disabled}
              onChange={(next) => onChange(field.key, next)}
              onSearch={onSearchOption}
            />
          );
        }
        if (field.type === "select" || (field.options?.length ?? 0) > 0) {
          return (
            <TextField
              key={field.key}
              select
              label={field.label}
              required={field.required}
              value={
                typeof value === "string" || typeof value === "number"
                  ? String(value)
                  : ""
              }
              onChange={(event) => {
                const selected = namedOptions.find(
                  (option) =>
                    String(optionValue(option)) === event.target.value,
                );
                onChange(
                  field.key,
                  selected && "value" in selected ? selected.value : null,
                );
              }}
              disabled={disabled}
              fullWidth
              slotProps={{
                inputLabel: {
                  shrink: value !== null && value !== "" ? true : undefined,
                },
              }}
            >
              <MenuItem value="">
                <em>Choose an option</em>
              </MenuItem>
              {namedOptions.map((option) => (
                <MenuItem
                  key={String(optionValue(option))}
                  value={String(optionValue(option))}
                >
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          );
        }
        if (field.type === "boolean") {
          return (
            <TextField
              key={field.key}
              select
              label={field.label}
              required={field.required}
              value={typeof value === "boolean" ? String(value) : ""}
              onChange={(event) =>
                onChange(
                  field.key,
                  event.target.value === ""
                    ? null
                    : event.target.value === "true",
                )
              }
              disabled={disabled}
              fullWidth
              slotProps={{
                inputLabel: {
                  shrink: typeof value === "boolean" ? true : undefined,
                },
              }}
            >
              <MenuItem value="">
                <em>Choose an option</em>
              </MenuItem>
              <MenuItem value="true">Yes</MenuItem>
              <MenuItem value="false">No</MenuItem>
            </TextField>
          );
        }
        if (field.type === "array" && field.items) {
          const values: Array<string | number | boolean> = Array.isArray(value)
            ? (value as Array<string | number | boolean>)
            : [];
          if (field.items.type === "select") {
            const options = field.items.options ?? [];
            return (
              <Autocomplete
                key={field.key}
                multiple
                options={options}
                value={options.filter((option) =>
                  values.some((item) => String(item) === String(option.value)),
                )}
                getOptionLabel={(option) => option.label}
                isOptionEqualToValue={(option, selected) =>
                  option.value === selected.value
                }
                onChange={(_, selected) =>
                  onChange(
                    field.key,
                    selected.map((option) => option.value) as WorkflowInput,
                  )
                }
                disabled={disabled}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={field.label}
                    required={field.required}
                    slotProps={{ inputLabel: { shrink: values.length > 0 } }}
                    helperText="Choose one or more named options."
                  />
                )}
              />
            );
          }
          if (field.items.type === "boolean") {
            const options = [false, true];
            return (
              <Autocomplete
                key={field.key}
                multiple
                options={options}
                value={options.filter((option) => values.includes(option))}
                getOptionLabel={(option) => (option ? "Yes" : "No")}
                onChange={(_, selected) => onChange(field.key, selected)}
                disabled={disabled}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={field.label}
                    required={field.required}
                    slotProps={{ inputLabel: { shrink: values.length > 0 } }}
                  />
                )}
              />
            );
          }
          return (
            <Autocomplete
              key={field.key}
              multiple
              freeSolo
              options={[]}
              value={values.map(String)}
              onChange={(_, selected) =>
                onChange(
                  field.key,
                  selected
                    .slice(0, field.max_items ?? 40)
                    .map((item) =>
                      field.items?.type === "number" ? Number(item) : item,
                    ) as WorkflowInput,
                )
              }
              disabled={disabled}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={field.label}
                  required={field.required}
                  slotProps={{ inputLabel: { shrink: values.length > 0 } }}
                  helperText={`Enter each value and press Enter.${field.max_items ? ` Up to ${field.max_items} values.` : ""}`}
                />
              )}
            />
          );
        }
        if (
          !["text", "number", "decimal", "date", "datetime"].includes(
            field.type,
          )
        ) {
          return (
            <Alert severity="warning" key={field.key}>
              {field.label} has no supported assistant input control.
            </Alert>
          );
        }
        return (
          <TextField
            key={field.key}
            label={field.label}
            type={
              field.type === "date"
                ? "date"
                : field.type === "datetime"
                  ? "datetime-local"
                  : field.type === "number"
                    ? "number"
                    : "text"
            }
            value={
              typeof value === "string" || typeof value === "number"
                ? value
                : ""
            }
            onChange={(event) => {
              const raw = event.target.value;
              onChange(
                field.key,
                field.type === "number"
                  ? raw === ""
                    ? null
                    : Number(raw)
                  : raw || null,
              );
            }}
            required={field.required}
            disabled={disabled}
            fullWidth
            slotProps={{
              inputLabel: {
                shrink:
                  field.type === "date" ||
                  field.type === "datetime" ||
                  (value !== null && value !== "")
                    ? true
                    : undefined,
              },
              htmlInput: {
                step: field.type === "number" ? 1 : undefined,
                inputMode: field.type === "decimal" ? "decimal" : undefined,
              },
            }}
            helperText={
              field.type === "datetime"
                ? "Enter the appointment date and time in the current clinic location."
                : field.type === "decimal"
                  ? "Enter the exact amount or quantity."
                  : undefined
            }
          />
        );
      })}
      {unsupported.length > 0 && (
        <Alert severity="warning">
          One or more fields need named choices that this clinic has not
          provided. This request cannot be submitted safely.
        </Alert>
      )}
      {missingFields.length > 0 && (
        <Typography variant="body2" color="text.secondary" role="status">
          Still needed: {missingFields.map((field) => field.label).join(", ")}.
        </Typography>
      )}
      <Button
        type="submit"
        variant="contained"
        disabled={
          disabled || unsupported.length > 0 || missingFields.length > 0
        }
      >
        {operation.kind === "read" ? "Show results" : "Prepare for review"}
      </Button>
    </Stack>
  );
}
