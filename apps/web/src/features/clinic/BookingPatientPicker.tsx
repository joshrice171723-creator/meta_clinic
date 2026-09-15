import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { Patient } from "../../api/contracts";

export function BookingPatientPicker({
  patient,
  editing,
  query,
  results,
  loading,
  error,
  disabled,
  canReviewPatient,
  onEditingChange,
  onQueryChange,
  onSelect,
}: {
  patient?: Patient;
  editing: boolean;
  query: string;
  results: Patient[];
  loading: boolean;
  error?: string;
  disabled: boolean;
  canReviewPatient: boolean;
  onEditingChange: (editing: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelect: (patient: Patient) => void;
}) {
  return (
    <Stack spacing={1.5}>
      {patient && (
        <Stack
          direction="row"
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              Patient
            </Typography>
            <Typography variant="h6" sx={{ overflowWrap: "anywhere" }}>
              {patient.display_name.trim() || "Name not recorded"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Clinic reference: {patient.reference || "Not recorded"} · Date of
              birth: {patient.date_of_birth || "Not recorded"}
            </Typography>
            {canReviewPatient && (
              <Link
                href={`/clinic/patients/${patient.id}`}
                target="_blank"
                rel="noopener noreferrer"
                variant="body2"
              >
                Review patient details (new tab)
              </Link>
            )}
          </Box>
          {!editing && (
            <Button
              disabled={disabled}
              onClick={() => onEditingChange(true)}
              sx={{ flexShrink: 0 }}
            >
              Change patient
            </Button>
          )}
        </Stack>
      )}
      {(!patient || editing) && (
        <Stack spacing={1}>
          <Autocomplete<Patient>
            options={results}
            value={null}
            inputValue={query}
            disabled={disabled}
            loading={loading}
            filterOptions={(options) => options}
            getOptionKey={(option) => option.id}
            getOptionLabel={(option) =>
              `${option.display_name} · ${option.reference}${option.date_of_birth ? ` · DOB ${option.date_of_birth}` : ""}`
            }
            isOptionEqualToValue={(option, value) => option.id === value.id}
            onInputChange={(_, value, reason) => {
              if (reason === "input" || reason === "clear")
                onQueryChange(value);
            }}
            onChange={(_, selected) => {
              if (selected) {
                onSelect(selected);
                onEditingChange(false);
                onQueryChange("");
              }
            }}
            noOptionsText={
              query.trim()
                ? "No matching patients."
                : "Enter a name or clinic reference."
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Find patient"
                autoFocus
                helperText={
                  patient
                    ? "Select a replacement, or keep the current patient."
                    : "Search by name or clinic reference, then select a patient."
                }
              />
            )}
          />
          {error && (
            <Alert severity="error">Patient search failed. {error}</Alert>
          )}
          {patient && (
            <Button
              disabled={disabled}
              onClick={() => {
                onEditingChange(false);
                onQueryChange("");
              }}
              sx={{ alignSelf: "flex-start" }}
            >
              Keep current patient
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}
