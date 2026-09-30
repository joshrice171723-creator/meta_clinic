import { Stack, TextField, Typography } from "@mui/material";

export type LabResultProvenance = {
  performing_organization?: string | null;
  issuing_organization?: string | null;
  method?: string | null;
  received_at?: string | null;
  resulted_at?: string | null;
};
export function labResultProvenancePayload(row: LabResultProvenance) {
  return {
    performing_organization: row.performing_organization?.trim() || null,
    issuing_organization: row.issuing_organization?.trim() || null,
    method: row.method?.trim() || null,
    resulted_at: row.resulted_at?.trim() || null,
    received_at: row.received_at?.trim() || null,
  };
}
export function LabResultProvenanceFields({
  row,
  onChange,
}: {
  row: LabResultProvenance;
  onChange: (changes: LabResultProvenance) => void;
}) {
  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        Optional provenance supplied by the source. Leave absent metadata blank;
        collection, report issue and staff recording times remain separate.
      </Typography>
      <TextField
        label="Source performing organization"
        value={row.performing_organization ?? ""}
        onChange={(event) =>
          onChange({ performing_organization: event.target.value || null })
        }
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      <TextField
        label="Source issuing organization"
        value={row.issuing_organization ?? ""}
        onChange={(event) =>
          onChange({ issuing_organization: event.target.value || null })
        }
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      <TextField
        label="Source method"
        value={row.method ?? ""}
        onChange={(event) => onChange({ method: event.target.value || null })}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      <TextField
        label="Source result time"
        value={row.resulted_at ?? ""}
        onChange={(event) =>
          onChange({ resulted_at: event.target.value || null })
        }
        helperText="Use the source ISO 8601 time and offset, for example 2026-09-30T10:15:00-05:00. No time is inferred."
        slotProps={{ htmlInput: { maxLength: 80 } }}
      />
      <TextField
        label="Source received time"
        value={row.received_at ?? ""}
        onChange={(event) =>
          onChange({ received_at: event.target.value || null })
        }
        helperText="Use the source ISO 8601 time and offset, for example 2026-09-30T10:15:00-05:00. No time is inferred."
        slotProps={{ htmlInput: { maxLength: 80 } }}
      />
    </Stack>
  );
}
export function LabResultProvenanceView({ row }: { row: LabResultProvenance }) {
  const values = [
    ["Source performing organization", row.performing_organization],
    ["Source issuing organization", row.issuing_organization],
    ["Source method", row.method],
    ["Source result time", row.resulted_at],
    ["Source received time", row.received_at],
  ];
  if (!values.some(([, value]) => value)) return null;
  return (
    <Stack spacing={0.25}>
      {values
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <Typography key={label} variant="caption" color="text.secondary">
            {label}: {value}
          </Typography>
        ))}
    </Stack>
  );
}
