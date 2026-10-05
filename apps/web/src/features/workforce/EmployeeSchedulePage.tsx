import { useEffect, useState } from "react";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { LoadState, useResource } from "../../shared/ui";
import { formatDisplayDate } from "../../shared/dateTime";
import { useClinicNavigation } from "../clinic/clinicNavigation";
import {
  displayInterval,
  mondayIso,
  type SchedulePublication,
} from "./scheduleTypes";

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function EmployeeSchedulePage() {
  const { navigate } = useClinicNavigation();
  const [weekStart, setWeekStart] = useState(() => mondayIso());
  const [siteId, setSiteId] = useState("");
  const weekEnd = shiftDate(weekStart, 6);
  const { data, error, refresh } = useResource<{
    publications: SchedulePublication[];
  }>(`/api/clinic/workforce/my-schedule?from=${weekStart}&to=${weekEnd}`);
  const publications = data?.publications ?? [];
  useEffect(() => {
    if (
      data &&
      siteId &&
      !data.publications.some((publication) => publication.site_id === siteId)
    )
      setSiteId("");
  }, [data, siteId]);
  const locations = [
    ...new Map(
      publications.map(
        (publication) => [publication.site_id, publication.site_name] as const,
      ),
    ).entries(),
  ];
  const shifts = publications
    .filter((publication) => !siteId || publication.site_id === siteId)
    .flatMap((publication) =>
      publication.shifts.map((shift) => ({ publication, shift })),
    )
    .sort((left, right) =>
      left.shift.starts_at.localeCompare(right.shift.starts_at),
    );
  function selectWeek(value: string) {
    setWeekStart(value);
    setSiteId("");
  }
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
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h2">
            {formatDisplayDate(weekStart)} – {formatDisplayDate(weekEnd)}
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button onClick={() => selectWeek(shiftDate(weekStart, -7))}>
              Previous week
            </Button>
            <Button
              onClick={() => selectWeek(mondayIso())}
              disabled={weekStart === mondayIso()}
            >
              Current week
            </Button>
            <Button onClick={() => selectWeek(shiftDate(weekStart, 7))}>
              Next week
            </Button>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Week containing"
              type="date"
              value={weekStart}
              onChange={(event) => {
                const value = event.target.value;
                if (/^\d{4}-\d{2}-\d{2}$/.test(value))
                  selectWeek(mondayIso(new Date(`${value}T12:00:00`)));
              }}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Choose any date to view its Monday–Sunday schedule."
            />
            <TextField
              select
              label="Location"
              slotProps={{
                select: { displayEmpty: true },
                inputLabel: { shrink: true },
              }}
              value={locations.some(([id]) => id === siteId) ? siteId : ""}
              disabled={!data}
              onChange={(event) => setSiteId(event.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">All locations</MenuItem>
              {locations.map(([id, name]) => (
                <MenuItem key={id} value={id}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <Button onClick={refresh}>Refresh published shifts</Button>
            <Button onClick={() => navigate("/clinic/workforce/my-requests")}>
              Manage time off and shift requests
            </Button>
          </Stack>
        </Stack>
      </Paper>
      {!data ? (
        <LoadState error={error} onRetry={refresh} />
      ) : shifts.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center" }}>
          <CalendarMonthIcon color="disabled" sx={{ fontSize: 42 }} />
          <Typography variant="h2">No assigned published shifts</Typography>
          <Typography color="text.secondary">
            There are no assigned published shifts for this week
            {siteId ? " at this location" : ""}. Check another week or refresh
            after your manager publishes changes.
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
                  {shift.time_off_conflict && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      Approved time off overlaps this published shift. Your
                      manager must update the schedule separately.
                    </Alert>
                  )}
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
