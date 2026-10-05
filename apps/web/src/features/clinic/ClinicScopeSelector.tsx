import { Alert, Button, MenuItem, Stack, TextField } from "@mui/material";
import type { ClinicWorkspaceContext } from "../../api/contracts";

const scopeSelectSx = {
  "& .MuiInputLabel-root.Mui-disabled": { color: "text.secondary" },
  "& .MuiOutlinedInput-root": {
    bgcolor: "background.paper",
    "& fieldset": { borderColor: "divider" },
    "&.Mui-disabled .MuiSelect-select": {
      WebkitTextFillColor: "inherit",
      color: "text.secondary",
    },
  },
};

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
  const setupIncompleteSites = context.setup_incomplete_sites ?? [];
  return (
    <Stack
      className="clinic-scope-selector"
      spacing={1}
      sx={{
        minWidth: 0,
        width: "100%",
        mt: 0.5,
        p: 0.75,
        borderRadius: 1,
        bgcolor: "background.default",
        color: "text.primary",
        border: 1,
        borderColor: "divider",
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
        sx={scopeSelectSx}
        slotProps={{
          select: {
            title: current?.organization?.name ?? "Independent clinics",
          },
        }}
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
        sx={scopeSelectSx}
        slotProps={{
          select: { title: context.practice.name },
        }}
        onChange={(event) => onPracticeChange(Number(event.target.value))}
      >
        {clinics.map((practice) => (
          <MenuItem key={practice.id} value={practice.id}>
            {practice.name}
          </MenuItem>
        ))}
      </TextField>
      {onLocationChange && (
        <>
          <TextField
            select
            id="clinic-location"
            label="Location"
            size="small"
            fullWidth
            value={context.current_site?.id ?? ""}
            disabled={disabled || context.sites.length < 2}
            sx={scopeSelectSx}
            slotProps={{
              inputLabel: { shrink: true },
              select: {
                displayEmpty: true,
                title:
                  context.current_site?.name ||
                  context.current_site?.code ||
                  "No location selected",
              },
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
                {site.finalized === false ? " — Setup incomplete" : ""}
              </MenuItem>
            ))}
          </TextField>
          {(context.sites.length === 0 ||
            setupIncompleteSites.some(
              (site) => site.id === context.current_site?.id,
            )) &&
            setupIncompleteSites.length > 0 &&
            context.capabilities.clinic_setup_write === true && (
              <Alert
                severity="warning"
                action={
                  <Button color="inherit" href="/clinic/setup">
                    Complete clinic setup
                  </Button>
                }
              >
                {setupIncompleteSites
                  .map((site) => site.name || site.code)
                  .join(", ")}{" "}
                {setupIncompleteSites.length === 1 ? "isn't" : "aren't"}{" "}
                finalized yet — complete clinic setup to open{" "}
                {setupIncompleteSites.length === 1 ? "its" : "their"}{" "}
                workspaces.
              </Alert>
            )}
        </>
      )}
    </Stack>
  );
}
