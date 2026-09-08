import {
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useEffect, useRef, useState } from "react";
import type { ClinicCapabilities, Pagination } from "../../api/contracts";
import { api } from "../../api/client";
import { PatientRegistrationForm } from "../clinic/Patients";
import { patientReferenceLabel } from "../clinic/patientReference";
import { useClinic } from "../clinic/Workspace";

export type PatientOption = {
  id: number;
  reference: string;
  display_name: string;
};

export type ScribePatientPickerProps = {
  value: PatientOption | null;
  onChange: (patient: PatientOption | null) => void;
  disabled?: boolean;
  scopeKey: string;
};

type LookupResponse = {
  patients: PatientOption[];
  pagination: Pagination;
};

type CreateResponse = {
  id: number;
  patient: PatientOption;
};

export function patientPickerAccess(
  capabilities: Pick<
    ClinicCapabilities,
    "patient_identity_read" | "patients" | "patients_write"
  >,
) {
  return {
    canReadIdentity:
      capabilities.patient_identity_read === true ||
      capabilities.patients === true,
    canCreate: capabilities.patients_write === true,
  };
}

export function patientFromCreateResponse(
  raw: Record<string, unknown> | undefined,
  expectedScope: number | null,
  currentScope: number,
): PatientOption | null {
  const result = raw as CreateResponse | undefined;
  const patient = result?.patient;
  if (
    expectedScope !== currentScope ||
    !patient ||
    typeof patient.id !== "number" ||
    typeof patient.reference !== "string" ||
    typeof patient.display_name !== "string" ||
    result.id !== patient.id
  )
    return null;
  return patient;
}

export function ScribePatientPicker({
  value,
  onChange,
  disabled = false,
  scopeKey,
}: ScribePatientPickerProps) {
  const { capabilities } = useClinic();
  const { canReadIdentity, canCreate } = patientPickerAccess(capabilities);
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<PatientOption[]>(value ? [value] : []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const requestSequence = useRef(0);
  const scopeGeneration = useRef(0);
  const creationScope = useRef<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scopeGeneration.current += 1;
    requestSequence.current += 1;
    setInputValue("");
    setOptions(value ? [value] : []);
    setPage(1);
    setTotalPages(0);
    setError("");
    setCreateOpen(false);
    creationScope.current = null;
  }, [scopeKey]);

  useEffect(() => {
    if (!canReadIdentity) {
      setLoading(false);
      setError("");
      return;
    }

    const query = inputValue.trim();
    if (query.length === 1) {
      setLoading(false);
      setError("");
      setOptions(value ? [value] : []);
      setPage(1);
      setTotalPages(0);
      return;
    }

    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    const requestedScope = scopeGeneration.current;
    const requestedPage = page;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await api<LookupResponse>(
          `/api/clinic/patients/lookup?q=${encodeURIComponent(query.slice(0, 100))}&page=${requestedPage}`,
          { signal: controller.signal },
        );
        if (
          controller.signal.aborted ||
          sequence !== requestSequence.current ||
          requestedScope !== scopeGeneration.current
        )
          return;
        setOptions((current) => {
          const next = requestedPage === 1 ? [] : current;
          return Array.from(
            new Map(
              [...next, ...result.patients].map((patient) => [
                patient.id,
                patient,
              ]),
            ).values(),
          );
        });
        setTotalPages(result.pagination.total_pages);
      } catch (requestError) {
        if (controller.signal.aborted || sequence !== requestSequence.current)
          return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Patient search could not be completed.",
        );
      } finally {
        if (
          !controller.signal.aborted &&
          sequence === requestSequence.current &&
          requestedScope === scopeGeneration.current
        )
          setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canReadIdentity, inputValue, page, scopeKey]);

  const handleCreated = (raw: Record<string, unknown> | undefined) => {
    const patient = patientFromCreateResponse(
      raw,
      creationScope.current,
      scopeGeneration.current,
    );
    if (!patient) return;
    setOptions([patient]);
    setInputValue(patient.display_name);
    onChange(patient);
    creationScope.current = null;
    setCreateOpen(false);
  };

  return (
    <Stack ref={pickerRef} spacing={1.5}>
      <Autocomplete
        value={value}
        inputValue={inputValue}
        options={options}
        disabled={disabled || !canReadIdentity}
        loading={loading}
        openOnFocus
        filterOptions={(available) => available}
        isOptionEqualToValue={(option, selected) => option.id === selected.id}
        getOptionLabel={(option) => option.display_name}
        getOptionKey={(option) => option.id}
        noOptionsText={
          inputValue.trim().length === 1
            ? "Enter at least 2 characters"
            : inputValue.trim().length === 0
              ? "No patients available"
              : "No matching patients"
        }
        onChange={(_event, patient) => onChange(patient)}
        onInputChange={(_event, next) => {
          setInputValue(next.slice(0, 100));
          setPage(1);
        }}
        renderOption={(props, option) => {
          const reference = patientReferenceLabel(option.reference);
          return (
            <li {...props} key={option.id}>
              <Stack>
                <Typography>{option.display_name}</Typography>
                {reference && (
                  <Typography variant="body2" color="text.secondary">
                    Reference {reference}
                  </Typography>
                )}
              </Stack>
            </li>
          );
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Patient"
            placeholder="Search by name or clinic reference"
            error={Boolean(error)}
            helperText={
              error ||
              (!canReadIdentity
                ? "You do not have permission to search patient identity records."
                : "Select the matching name and clinic reference.")
            }
            slotProps={{
              ...params.slotProps,
              htmlInput: { ...params.slotProps.htmlInput, maxLength: 100 },
            }}
          />
        )}
      />
      {page < totalPages && (
        <Button
          variant="text"
          onClick={() => setPage((current) => current + 1)}
          disabled={loading || disabled}
          sx={{ alignSelf: "flex-start" }}
        >
          Load more matches
        </Button>
      )}
      {canCreate && (
        <Button
          variant="outlined"
          onClick={() => {
            creationScope.current = scopeGeneration.current;
            setCreateOpen(true);
          }}
          disabled={disabled}
          sx={{ alignSelf: "flex-start" }}
        >
          Create new patient
        </Button>
      )}
      <Dialog
        open={createOpen}
        onClose={() => {
          creationScope.current = null;
          setCreateOpen(false);
        }}
        fullWidth
        maxWidth="md"
        aria-labelledby="scribe-create-patient-title"
        slotProps={{
          transition: {
            onExited: () =>
              pickerRef.current
                ?.querySelector<HTMLInputElement>("input")
                ?.focus(),
          },
        }}
      >
        <DialogTitle id="scribe-create-patient-title">
          Create new patient
        </DialogTitle>
        <DialogContent dividers>
          <PatientRegistrationForm onSuccess={handleCreated} />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              creationScope.current = null;
              setCreateOpen(false);
            }}
          >
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
