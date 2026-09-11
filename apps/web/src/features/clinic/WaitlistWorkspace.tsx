import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api, ApiError } from "../../api/client";
import type { Patient } from "../../api/contracts";
import { useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";

type Option = { id: number; name: string };
export type WaitlistItem = {
  id: number;
  patient_id: number;
  patient_name: string;
  site_id: number;
  site_name: string;
  clinician_id: number;
  clinician_name: string;
  visit_type_id: number;
  visit_type_name: string;
  earliest_at: string;
  latest_at: string;
  duration_minutes: number;
  state: string;
  version: number;
  reason?: string;
  offer_starts_at: string | null;
  offer_ends_at: string | null;
  offer_expires_at: string | null;
  appointment_id: number | null;
};
type Queue = {
  entries: WaitlistItem[];
  total: number;
  ranking: string;
  sites: Option[];
  clinicians: Option[];
  visit_types: Option[];
  cancellations: {
    id: number;
    site_id: number;
    clinician_id: number;
    starts_at: string;
    ends_at: string;
  }[];
};
type Rule = {
  id: number;
  site_id: number;
  clinician_id: number;
  kind: string;
  weekday: number | null;
  start_minute: number | null;
  end_minute: number | null;
  starts_at: string | null;
  ends_at: string | null;
  reason: string;
  version: number;
};
type Attempt = { path: string; body: unknown };
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function localInput(value: string) {
  const date = new Date(value);
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
function clock(value: number | null) {
  return value === null
    ? ""
    : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function WaitlistWorkspace() {
  const { capabilities } = useClinic();
  const queue = useResource<Queue>("/api/clinic/waitlist");
  const capacity = useResource<{ rules: Rule[]; timezone: string }>(
    "/api/clinic/capacity",
  );
  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [site, setSite] = useState("");
  const [clinician, setClinician] = useState("");
  const [visitType, setVisitType] = useState("");
  const [earliest, setEarliest] = useState("");
  const [latest, setLatest] = useState("");
  const [duration, setDuration] = useState("30");
  const [reason, setReason] = useState("");
  const [offer, setOffer] = useState<{
    entry: WaitlistItem;
    starts: string;
    expires: string;
  } | null>(null);
  const [kind, setKind] = useState("weekly");
  const [weekday, setWeekday] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [capacityReason, setCapacityReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const canBook =
    capabilities.appointments_book === true ||
    capabilities.appointments === true;
  const disabled = busy || uncertain;

  useEffect(() => {
    let active = true;
    if (patientQuery.trim().length < 2) {
      setPatients([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void api<{ patients: Patient[] }>(
        `/api/clinic/patients/lookup?q=${encodeURIComponent(patientQuery.trim())}&per_page=20`,
      )
        .then((value) => {
          if (active) setPatients(value.patients);
        })
        .catch((value) => {
          if (active) {
            setPatients([]);
            setError(
              value instanceof Error ? value.message : "Patient search failed.",
            );
          }
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [patientQuery]);

  async function submit(next: Attempt) {
    if (busy) return;
    const current = attempt.current ?? next;
    attempt.current = current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(current.path, { method: "POST", body: current.body });
      attempt.current = null;
      setUncertain(false);
      setOffer(null);
      setNotice("Saved. The queue is refreshing from the clinic records.");
      queue.refresh();
      capacity.refresh();
    } catch (value) {
      const unknown =
        !(value instanceof ApiError) ||
        value.status >= 500 ||
        value.code === "outcome_unconfirmed";
      setUncertain(unknown);
      if (!unknown) attempt.current = null;
      setError(
        value instanceof Error ? value.message : "The save outcome is unknown.",
      );
    } finally {
      setBusy(false);
    }
  }
  function transition(entry: WaitlistItem, action: string, extra = {}) {
    return submit({
      path: `/api/clinic/waitlist/${entry.id}/transition`,
      body: {
        waitlist: {
          action,
          expected_version: entry.version,
          request_key: crypto.randomUUID(),
          ...extra,
        },
      },
    });
  }
  function createEntry() {
    if (!patient || !earliest || !latest) return;
    void submit({
      path: "/api/clinic/waitlist",
      body: {
        waitlist: {
          patient_id: patient.id,
          site_id: site,
          clinician_id: clinician,
          visit_type_id: visitType,
          earliest_at: new Date(earliest).toISOString(),
          latest_at: new Date(latest).toISOString(),
          duration_minutes: duration,
          reason,
          request_key: crypto.randomUUID(),
        },
      },
    });
  }
  function createRule() {
    const minutes = (value: string) => {
      const [hours, minute] = value.split(":").map(Number);
      return hours * 60 + minute;
    };
    const values =
      kind === "weekly"
        ? {
            weekday,
            start_minute: minutes(startTime),
            end_minute: minutes(endTime),
          }
        : {
            starts_at: new Date(blockStart).toISOString(),
            ends_at: new Date(blockEnd).toISOString(),
          };
    void submit({
      path: "/api/clinic/capacity",
      body: {
        capacity: {
          site_id: site,
          clinician_id: clinician,
          kind,
          ...values,
          reason: capacityReason,
          request_key: crypto.randomUUID(),
        },
      },
    });
  }
  function chooseOffer(entry: WaitlistItem, starts = "") {
    const expiration = starts
      ? Math.min(new Date(starts).valueOf(), Date.now() + 4 * 3_600_000)
      : Date.now() + 4 * 3_600_000;
    setOffer({
      entry,
      starts: starts ? localInput(starts) : "",
      expires: localInput(new Date(expiration).toISOString()),
    });
  }
  const selector = (
    label: string,
    value: string,
    change: (value: string) => void,
    options: Option[],
  ) => (
    <TextField
      select
      label={label}
      value={value}
      onChange={(event) => change(event.target.value)}
      disabled={disabled}
      sx={{ minWidth: 190 }}
    >
      {options.map((option) => (
        <MenuItem key={option.id} value={String(option.id)}>
          {option.name}
        </MenuItem>
      ))}
    </TextField>
  );
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Capacity and waitlist
      </Typography>
      <Typography color="text.secondary">
        Offer an opening to a waiting patient, hold it until the deadline, then
        book or release it. Expired offers stop holding capacity automatically.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}
      {uncertain && (
        <Alert
          severity="warning"
          action={
            <Button
              disabled={busy}
              onClick={() => attempt.current && void submit(attempt.current)}
            >
              Retry same request
            </Button>
          }
        >
          The outcome is unconfirmed. Retry the same request before making
          another change.
        </Alert>
      )}
      {queue.error && (
        <Alert
          severity="error"
          action={<Button onClick={queue.refresh}>Retry</Button>}
        >
          {queue.error}
        </Alert>
      )}
      {!queue.data && !queue.error && (
        <Typography role="status">Loading waitlist…</Typography>
      )}
      {queue.data && (
        <>
          {queue.data.total > queue.data.entries.length && (
            <Alert severity="info">
              Showing the first {queue.data.entries.length} of{" "}
              {queue.data.total} entries.
            </Alert>
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Typography variant="h6" component="h2">
                Site and clinician
              </Typography>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                {selector("Site", site, setSite, queue.data.sites)}
                {selector(
                  "Clinician",
                  clinician,
                  setClinician,
                  queue.data.clinicians,
                )}
              </Stack>
              {canBook && (
                <>
                  <Typography variant="h6" component="h2">
                    Add a patient to the waitlist
                  </Typography>
                  <Autocomplete
                    options={patients}
                    value={patient}
                    onChange={(_, value) => setPatient(value)}
                    onInputChange={(_, value) => setPatientQuery(value)}
                    getOptionLabel={(item) =>
                      `${item.display_name} · ${item.reference}`
                    }
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    disabled={disabled}
                    renderInput={(params) => (
                      <TextField {...params} label="Find patient" />
                    )}
                  />
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    {selector(
                      "Visit type",
                      visitType,
                      setVisitType,
                      queue.data.visit_types,
                    )}
                    <TextField
                      label="Duration (minutes)"
                      type="number"
                      value={duration}
                      disabled={disabled}
                      onChange={(event) => setDuration(event.target.value)}
                      slotProps={{ htmlInput: { min: 5, max: 240 } }}
                    />
                    <TextField
                      label="Earliest time"
                      type="datetime-local"
                      value={earliest}
                      disabled={disabled}
                      onChange={(event) => setEarliest(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                    <TextField
                      label="Latest end"
                      type="datetime-local"
                      value={latest}
                      disabled={disabled}
                      onChange={(event) => setLatest(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Stack>
                  <TextField
                    label="Scheduling reason or preferences"
                    value={reason}
                    disabled={disabled}
                    onChange={(event) => setReason(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 500 } }}
                  />
                  <Button
                    variant="contained"
                    disabled={
                      disabled ||
                      !patient ||
                      !site ||
                      !clinician ||
                      !visitType ||
                      !earliest ||
                      !latest
                    }
                    onClick={createEntry}
                  >
                    Add to waitlist
                  </Button>
                </>
              )}
            </Stack>
          </Paper>
          <Typography variant="h6" component="h2">
            Waiting patients
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {queue.data.ranking}
          </Typography>
          {queue.data.entries.length === 0 && (
            <Alert severity="info">No waiting patients.</Alert>
          )}
          {queue.data.entries.map((entry, rank) => (
            <Paper key={entry.id} variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1}>
                  <Typography sx={{ flex: 1, fontWeight: 600 }}>
                    {rank + 1}. {entry.patient_name}
                  </Typography>
                  <Chip label={entry.state} size="small" />
                </Stack>
                <Typography>
                  {entry.site_name} · {entry.clinician_name} ·{" "}
                  {entry.visit_type_name} · {entry.duration_minutes} min
                </Typography>
                <Typography variant="body2">
                  Requested {new Date(entry.earliest_at).toLocaleString()} –{" "}
                  {new Date(entry.latest_at).toLocaleString()}
                </Typography>
                {entry.offer_starts_at && (
                  <Typography variant="body2">
                    Offer: {new Date(entry.offer_starts_at).toLocaleString()} ·
                    expires{" "}
                    {entry.offer_expires_at &&
                      new Date(entry.offer_expires_at).toLocaleString()}
                  </Typography>
                )}
                {canBook && (
                  <Stack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    sx={{ flexWrap: "wrap" }}
                  >
                    {["waiting", "expired"].includes(entry.state) && (
                      <Button
                        disabled={disabled}
                        onClick={() => chooseOffer(entry)}
                      >
                        Offer a time
                      </Button>
                    )}
                    {entry.state === "offered" && (
                      <>
                        <Button
                          disabled={disabled}
                          onClick={() =>
                            void transition(entry, "accept", {
                              patient_accepted: true,
                            })
                          }
                        >
                          Record patient acceptance and book
                        </Button>
                        <Button
                          disabled={disabled}
                          onClick={() => void transition(entry, "release")}
                        >
                          Release offer
                        </Button>
                      </>
                    )}
                    {entry.state === "expired" && (
                      <Button
                        disabled={disabled}
                        onClick={() => void transition(entry, "requeue")}
                      >
                        Return to waiting
                      </Button>
                    )}
                    <Button
                      disabled={disabled}
                      color="error"
                      onClick={() => void transition(entry, "cancel")}
                    >
                      Remove from waitlist
                    </Button>
                  </Stack>
                )}
                {canBook &&
                  ["waiting", "expired"].includes(entry.state) &&
                  queue.data?.cancellations
                    .filter(
                      (slot) =>
                        slot.site_id === entry.site_id &&
                        slot.clinician_id === entry.clinician_id &&
                        new Date(slot.starts_at) >=
                          new Date(entry.earliest_at) &&
                        new Date(slot.starts_at).valueOf() +
                          entry.duration_minutes * 60_000 <=
                          Math.min(
                            new Date(slot.ends_at).valueOf(),
                            new Date(entry.latest_at).valueOf(),
                          ),
                    )
                    .map((slot) => (
                      <Button
                        key={slot.id}
                        disabled={disabled}
                        onClick={() => chooseOffer(entry, slot.starts_at)}
                      >
                        Use cancelled opening:{" "}
                        {new Date(slot.starts_at).toLocaleString()}
                      </Button>
                    ))}
              </Stack>
            </Paper>
          ))}
          {offer && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="h6">
                  Offer to {offer.entry.patient_name}
                </Typography>
                <TextField
                  type="datetime-local"
                  label="Offer starts"
                  value={offer.starts}
                  disabled={disabled}
                  onChange={(event) =>
                    setOffer({ ...offer, starts: event.target.value })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  type="datetime-local"
                  label="Accept before"
                  value={offer.expires}
                  disabled={disabled}
                  onChange={(event) =>
                    setOffer({ ...offer, expires: event.target.value })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <Typography variant="body2">
                  The offer appears in the patient's portal. Staff can also
                  record the patient's acceptance. No email or text is sent by
                  this action.
                </Typography>
                <Button
                  variant="contained"
                  disabled={disabled || !offer.starts || !offer.expires}
                  onClick={() =>
                    void transition(offer.entry, "offer", {
                      starts_at: new Date(offer.starts).toISOString(),
                      expires_at: new Date(offer.expires).toISOString(),
                    })
                  }
                >
                  Hold time and publish offer
                </Button>
                <Button disabled={disabled} onClick={() => setOffer(null)}>
                  Cancel
                </Button>
              </Stack>
            </Paper>
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Typography variant="h6" component="h2">
                Provider capacity
              </Typography>
              {capacity.error && (
                <Alert severity="error">{capacity.error}</Alert>
              )}
              <Typography variant="body2">
                Weekly hours use {capacity.data?.timezone ?? "clinic time"}.
                Templates constrain new bookings; existing bookings stay
                scheduled. Blocks apply to the clinician across sites.
              </Typography>
              {capacity.data?.rules.map((rule) => (
                <Box key={rule.id}>
                  <Typography>
                    {
                      queue.data?.clinicians.find(
                        (item) => item.id === rule.clinician_id,
                      )?.name
                    }{" "}
                    ·{" "}
                    {
                      queue.data?.sites.find((item) => item.id === rule.site_id)
                        ?.name
                    }
                    :{" "}
                    {rule.kind === "weekly"
                      ? `${days[rule.weekday ?? 0]} ${clock(rule.start_minute)}–${clock(rule.end_minute)}`
                      : `${new Date(rule.starts_at!).toLocaleString()} – ${new Date(rule.ends_at!).toLocaleString()}`}{" "}
                    {rule.reason}
                  </Typography>
                  {capabilities.facilities_write && (
                    <Button
                      disabled={disabled}
                      onClick={() =>
                        void submit({
                          path: `/api/clinic/capacity/${rule.id}/deactivate`,
                          body: {
                            capacity: { expected_version: rule.version },
                          },
                        })
                      }
                    >
                      Deactivate rule
                    </Button>
                  )}
                </Box>
              ))}
              {capabilities.facilities_write && (
                <>
                  <TextField
                    select
                    label="Rule type"
                    value={kind}
                    disabled={disabled}
                    onChange={(event) => setKind(event.target.value)}
                  >
                    <MenuItem value="weekly">Weekly hours</MenuItem>
                    <MenuItem value="block">Blocked time</MenuItem>
                  </TextField>
                  {kind === "weekly" ? (
                    <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                      <TextField
                        select
                        label="Day"
                        value={weekday}
                        disabled={disabled}
                        onChange={(event) => setWeekday(event.target.value)}
                      >
                        {days.map((day, index) => (
                          <MenuItem key={day} value={String(index)}>
                            {day}
                          </MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        type="time"
                        label="Start"
                        value={startTime}
                        disabled={disabled}
                        onChange={(event) => setStartTime(event.target.value)}
                      />
                      <TextField
                        type="time"
                        label="End"
                        value={endTime}
                        disabled={disabled}
                        onChange={(event) => setEndTime(event.target.value)}
                      />
                    </Stack>
                  ) : (
                    <Stack spacing={2}>
                      <TextField
                        type="datetime-local"
                        label="Block starts"
                        value={blockStart}
                        disabled={disabled}
                        onChange={(event) => setBlockStart(event.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <TextField
                        type="datetime-local"
                        label="Block ends"
                        value={blockEnd}
                        disabled={disabled}
                        onChange={(event) => setBlockEnd(event.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                    </Stack>
                  )}
                  <TextField
                    label="Capacity reason"
                    value={capacityReason}
                    disabled={disabled}
                    onChange={(event) => setCapacityReason(event.target.value)}
                    slotProps={{ htmlInput: { maxLength: 500 } }}
                  />
                  <Button
                    disabled={
                      disabled ||
                      !site ||
                      !clinician ||
                      (kind === "block" &&
                        (!blockStart || !blockEnd || !capacityReason.trim()))
                    }
                    onClick={createRule}
                  >
                    Save capacity rule
                  </Button>
                </>
              )}
            </Stack>
          </Paper>
        </>
      )}
    </Stack>
  );
}
