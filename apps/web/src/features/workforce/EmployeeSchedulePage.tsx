import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { LoadState, useResource } from "../../shared/ui";
import { displayInterval, type SchedulePublication } from "./scheduleTypes";

export function EmployeeSchedulePage() {
  const { data, error, refresh } = useResource<{
    publications: SchedulePublication[];
  }>("/api/clinic/workforce/my-schedule");
  if (!data) return <LoadState error={error} onRetry={refresh} />;
  const shifts = data.publications
    .flatMap((publication) =>
      publication.shifts.map((shift) => ({ publication, shift })),
    )
    .sort((left, right) =>
      left.shift.starts_at.localeCompare(right.shift.starts_at),
    );
  return (
    <Stack spacing={3}>
      <div>
        <Typography variant="overline" color="text.secondary">
          WORKFORCE / MY SCHEDULE
        </Typography>
        <Typography variant="h1">Assigned shifts</Typography>
        <Typography color="text.secondary">
          Only your currently published shifts are shown. Draft schedules are
          never visible here.
        </Typography>
      </div>
      <Button onClick={refresh} sx={{ alignSelf: "flex-start" }}>
        Refresh published shifts
      </Button>
      {shifts.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <CalendarMonthIcon color="disabled" sx={{ fontSize: 42 }} />
          <Typography variant="h2">No published shifts</Typography>
          <Typography color="text.secondary">
            There are no assigned shifts in the current schedule window.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {shifts.map(({ publication, shift }) => (
            <Paper
              variant="outlined"
              sx={{ p: 2 }}
              key={`${publication.id}-${shift.id}`}
            >
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                sx={{
                  justifyContent: "space-between",
                  alignItems: { sm: "center" },
                }}
              >
                <div>
                  <Typography variant="h3">
                    {displayInterval(
                      shift.starts_at,
                      shift.ends_at,
                      shift.timezone,
                    )}
                  </Typography>
                  <Typography color="text.secondary">
                    {publication.site_name} ·{" "}
                    {shift.role_name || "Assigned shift"} ·{" "}
                    {shift.break_minutes} min planned break · {shift.timezone}
                  </Typography>
                </div>
                <Chip
                  label={`Published v${publication.version}`}
                  variant="outlined"
                />
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
