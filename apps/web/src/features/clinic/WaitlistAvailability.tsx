import { useState } from "react";
import { Alert, Button, Stack, TextField, Typography } from "@mui/material";
import type { CalendarResponse } from "../../api/contracts";
import { businessTimeAfter } from "../../shared/businessDate";
import { useResource } from "../../shared/ui";
import type { WaitlistItem } from "./WaitlistWorkspace";

export function WaitlistAvailability({
  entry,
  disabled,
  onChoose,
}: {
  entry: WaitlistItem;
  disabled: boolean;
  onChoose: (starts: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(entry.earliest_at.slice(0, 7));
  const validMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const calendar = useResource<CalendarResponse>(
    `/api/clinic/calendar?site_id=${entry.site_id}&date=${month}-01`,
    { enabled: open && validMonth },
  );
  const data =
    calendar.data?.site_id === entry.site_id && calendar.data.month === month
      ? calendar.data
      : undefined;
  // Only individual, authoritative slots are eligible. Never join or invent slots.
  const slots =
    data?.days
      .flatMap((day) => day.slots)
      .filter((slot) => {
        const starts = new Date(slot.starts_at).valueOf();
        const ends = starts + entry.duration_minutes * 60_000;
        return (
          slot.clinician_id === entry.clinician_id &&
          starts > businessTimeAfter(0).valueOf() &&
          starts >= new Date(entry.earliest_at).valueOf() &&
          ends <= new Date(entry.latest_at).valueOf() &&
          ends <= new Date(slot.ends_at).valueOf()
        );
      })
      .sort(
        (a, b) =>
          new Date(a.starts_at).valueOf() - new Date(b.starts_at).valueOf(),
      )
      .slice(0, 3) ?? [];

  return (
    <Stack spacing={1}>
      <Button
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? "Hide available times" : "Find available times"}
      </Button>
      {open && (
        <>
          <Stack direction="row" spacing={1} alignItems="center">
            <TextField
              type="month"
              label="Search month"
              value={month}
              disabled={disabled}
              onChange={(event) => setMonth(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <Button
              disabled={disabled || !validMonth}
              onClick={calendar.refresh}
            >
              Refresh availability
            </Button>
          </Stack>
          {!validMonth && (
            <Alert severity="info">Choose a month to check.</Alert>
          )}
          {calendar.error && (
            <Alert severity="error">
              Availability could not be loaded: {calendar.error}
            </Alert>
          )}
          {validMonth && !data && !calendar.error && (
            <Typography role="status">Checking availability…</Typography>
          )}
          {data && (
            <>
              <Typography variant="body2" color="text.secondary">
                Next returned times in {month} · {entry.site_name} ·{" "}
                {entry.clinician_name} · {data.timezone}
                {data.as_of &&
                  ` · Checked ${new Date(data.as_of).toLocaleString(undefined, { timeZone: data.timezone })}`}
              </Typography>
              {!data.capacity_configured ? (
                <Alert severity="info">
                  Provider capacity is not configured; availability is unknown.
                </Alert>
              ) : slots.length === 0 ? (
                <Typography variant="body2">
                  No returned slot fits this request in this month.
                </Typography>
              ) : (
                slots.map((slot) => (
                  <Button
                    key={`${slot.clinician_id}:${slot.starts_at}`}
                    disabled={disabled}
                    onClick={() => onChoose(slot.starts_at)}
                  >
                    Draft offer:{" "}
                    {new Date(slot.starts_at).toLocaleString(undefined, {
                      timeZone: data.timezone,
                    })}{" "}
                    ({data.timezone})
                  </Button>
                ))
              )}
              {entry.duration_minutes > data.slot_minutes && (
                <Typography variant="body2">
                  The calendar returns {data.slot_minutes}-minute slots. Longer
                  visits need manual schedule review; these slots are not
                  combined.
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Choosing a time only fills the offer draft. Nothing is reserved
                until you publish; the server rechecks availability and
                conflicts then.
              </Typography>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
