import { MenuItem, Stack, TextField } from "@mui/material";
import type { ClinicWorkspaceContext } from "../../api/contracts";

export function ClinicScopeSelector({
  context,
  disabled = false,
  onPracticeChange,
  onLocationChange,
}: {
  context: ClinicWorkspaceContext;
  disabled?: boolean;
  onPracticeChange: (practiceId: number) => void;
  onLocationChange?: (siteId: number) => void;
}) {
  const practices = context.practices ?? [
    { ...context.practice, organization: null },
  ];
  const current = practices.find(
    (practice) => practice.id === context.practice.id,
  );
  const organizationKey = String(current?.organization?.id ?? "independent");
  const organizations = [
    ...new Map(
      practices.map((practice) => [
        String(practice.organization?.id ?? "independent"),
        practice.organization?.name ?? "Independent clinics",
      ]),
    ).entries(),
  ];
  const clinics = practices.filter(
    (practice) =>
      String(practice.organization?.id ?? "independent") === organizationKey,
  );
  return (
    <Stack
      spacing={1.5}
      sx={{
        minWidth: 0,
        width: "100%",
        mt: 1,
        p: 1.25,
        borderRadius: 1,
        bgcolor: "background.paper",
        color: "text.primary",
      }}
    >
      <TextField
        select
        id="clinic-organization"
        label="Organization"
        size="small"
        fullWidth
        value={organizationKey}
        disabled={disabled || organizations.length < 2}
        onChange={(event) => {
          const practice = practices.find(
            (item) =>
              String(item.organization?.id ?? "independent") ===
              event.target.value,
          );
          if (practice) onPracticeChange(practice.id);
        }}
      >
        {organizations.map(([id, name]) => (
          <MenuItem key={id} value={id}>
            {name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        id="clinic-practice"
        label="Clinic"
        size="small"
        fullWidth
        value={context.practice.id}
        disabled={disabled || clinics.length < 2}
        onChange={(event) => onPracticeChange(Number(event.target.value))}
      >
        {clinics.map((practice) => (
          <MenuItem key={practice.id} value={practice.id}>
            {practice.name}
          </MenuItem>
        ))}
      </TextField>
      {onLocationChange && (
        <TextField
          select
          id="clinic-location"
          label="Location"
          size="small"
          fullWidth
          value={context.current_site?.id ?? ""}
          disabled={disabled || context.sites.length < 2}
          slotProps={{
            inputLabel: { shrink: true },
            select: { displayEmpty: true },
          }}
          onChange={(event) => onLocationChange(Number(event.target.value))}
        >
          <MenuItem value="" disabled>
            {context.sites.length
              ? "Choose a location"
              : "No accessible locations"}
          </MenuItem>
          {context.sites.map((site) => (
            <MenuItem key={site.id} value={site.id}>
              {site.name || site.code}
            </MenuItem>
          ))}
        </TextField>
      )}
    </Stack>
  );
}
