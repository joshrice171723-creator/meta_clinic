import { useCallback, useEffect, useState } from "react";
import {
  Autocomplete,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { WorkflowContext, WorkflowOption } from "./workflowTypes";

function SearchBinding({
  label,
  options,
  disabled,
  onSearch,
  onSelect,
}: {
  label: string;
  options: WorkflowOption[];
  disabled: boolean;
  onSearch: (query: string) => void;
  onSelect: (selectionId: string) => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = window.setTimeout(() => onSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [onSearch, query]);
  return (
    <Autocomplete
      options={options.filter(
        (option): option is { selection_id: string; label: string } =>
          "selection_id" in option,
      )}
      value={null}
      inputValue={query}
      filterOptions={(items) => items}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, selected) =>
        option.selection_id === selected.selection_id
      }
      onInputChange={(_, value, reason) => {
        if (reason === "input" || reason === "clear") setQuery(value);
      }}
      onChange={(_, option) => {
        if (option) onSelect(option.selection_id);
        setQuery("");
      }}
      noOptionsText={
        query.length < 2
          ? "Type at least two characters."
          : "No matching records."
      }
      disabled={disabled}
      renderInput={(params) => (
        <TextField {...params} label={label} size="small" />
      )}
    />
  );
}

export function WorkflowContextPicker({
  context,
  patientOptions,
  encounterOptions,
  disabled,
  onSearch,
  onSelectPatient,
  onSelectEncounter,
  onClearPatient,
}: {
  context: WorkflowContext;
  patientOptions: WorkflowOption[];
  encounterOptions: WorkflowOption[];
  disabled: boolean;
  onSearch: (field: "patient" | "encounter", query: string) => void;
  onSelectPatient: (selectionId: string) => void;
  onSelectEncounter: (selectionId: string) => void;
  onClearPatient: () => void;
}) {
  const [changingPatient, setChangingPatient] = useState(false);
  const searchPatient = useCallback(
    (query: string) => onSearch("patient", query),
    [onSearch],
  );
  const searchEncounter = useCallback(
    (query: string) => onSearch("encounter", query),
    [onSearch],
  );
  return (
    <Stack spacing={1.25} className="clinic-assistant__workflow-context">
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Typography
          variant="body2"
          sx={{ alignSelf: "center", minWidth: 0, flex: 1 }}
        >
          Patient context:{" "}
          {context.patient?.name ||
            "None selected; workspace tasks remain available."}
        </Typography>
        {context.patient && (
          <>
            <Button
              size="small"
              disabled={disabled}
              onClick={() => setChangingPatient((value) => !value)}
            >
              {changingPatient ? "Cancel" : "Change patient"}
            </Button>
            <Button size="small" disabled={disabled} onClick={onClearPatient}>
              Clear
            </Button>
          </>
        )}
      </Stack>
      {(!context.patient || changingPatient) && (
        <SearchBinding
          label={
            context.patient
              ? "Choose a different patient"
              : "Add patient context"
          }
          options={patientOptions}
          disabled={disabled}
          onSearch={searchPatient}
          onSelect={(selectionId) => {
            onSelectPatient(selectionId);
            setChangingPatient(false);
          }}
        />
      )}
      {context.patient && (
        <Stack spacing={0.5}>
          {context.encounter?.label && (
            <Typography variant="caption" color="text.secondary">
              Encounter context: {context.encounter.label}
            </Typography>
          )}
          <SearchBinding
            label="Select encounter (optional)"
            options={encounterOptions}
            disabled={disabled}
            onSearch={searchEncounter}
            onSelect={onSelectEncounter}
          />
        </Stack>
      )}
    </Stack>
  );
}
