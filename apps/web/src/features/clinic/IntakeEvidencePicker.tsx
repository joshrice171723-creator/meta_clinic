import { useMemo } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { IntakeEvidenceOption } from "../../api/contracts";

export function IntakeEvidencePicker({
  options,
  selected,
  disabled,
  onChange,
}: {
  options: IntakeEvidenceOption[];
  selected: string[];
  disabled: boolean;
  onChange: (keys: string[]) => void;
}) {
  const missing = selected.filter(
    (key) => !options.some((option) => option.key === key),
  );
  const selectedOptions = useMemo(
    () => options.filter((option) => selected.includes(option.key)),
    [options, selected],
  );
  return (
    <Stack spacing={1.5}>
      <Typography component="h4" variant="subtitle1">
        Linked evidence
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Link existing records. Recording a link does not review a result, sign a
        consent, or authorize payment.
      </Typography>
      {missing.length > 0 && (
        <Alert severity="warning">
          {missing.length} saved reference(s) are no longer in your available
          list. They remain in the previous revision.
        </Alert>
      )}
      <Autocomplete
        multiple
        options={options}
        value={selectedOptions}
        getOptionKey={(option) => option.key}
        disabled={disabled}
        getOptionLabel={(option) =>
          option.label + " · " + option.kind.replaceAll("_", " ")
        }
        isOptionEqualToValue={(option, value) => option.key === value.key}
        onChange={(_event, values) =>
          onChange(values.map((value) => value.key))
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label="Search existing evidence"
            helperText="Documents, laboratory results, telehealth permissions and financial agreements appear only when your role can read them."
          />
        )}
      />
      {options
        .filter((option) => selected.includes(option.key))
        .map((option) => (
          <Stack spacing={0.5} key={option.key}>
            <Typography variant="subtitle2">{option.label}</Typography>
            <Typography variant="body2">
              {option.source} · Version {option.version ?? "Not recorded"} ·{" "}
              {option.status} · Recorded {option.recorded_at}
            </Typography>
            {option.collected_at && (
              <Typography variant="body2">
                Collected {option.collected_at}
              </Typography>
            )}
            {option.results?.map((result, index) => (
              <Typography variant="body2" key={index}>
                {result.name}: {result.value} {result.unit} · Reference range:{" "}
                {result.reference_range || "Not supplied"}
              </Typography>
            ))}
            {option.href && (
              <Button
                href={option.href}
                size="small"
                sx={{ alignSelf: "start" }}
              >
                Open owning record
              </Button>
            )}
          </Stack>
        ))}
      {!options.length && (
        <Typography color="text.secondary">
          No accessible records are available to link. Other intake work remains
          available.
        </Typography>
      )}
    </Stack>
  );
}
