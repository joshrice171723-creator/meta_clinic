import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { api, ApiError } from "../../api/client";
import { useResource } from "../../shared/ui";

type Site = { id: number; code: string; name: string };
type VisitType = { id: number; code: string };
type AppointmentRequest = {
  id: number;
  request_key: string;
  starts_at: string;
  ends_at: string;
  status: string;
  site: Site | null;
  visit_type: VisitType | null;
  requested_at: string;
  reviewed_at: string | null;
  appointment: {
    id: number;
    starts_at: string;
    ends_at: string;
    status: string;
    site: Site;
    room: { id: number; code: string } | null;
    clinician: { id: number; display_name: string } | null;
    visit_type: VisitType;
  } | null;
};
type AppointmentRequestResponse = {
  appointment_requests: AppointmentRequest[];
  options: { sites: Site[]; visit_types: VisitType[] };
};

function localDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.valueOf() - offset).toISOString().slice(0, 16);
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

export function PatientAppointmentRequests() {
  const resource = useResource<AppointmentRequestResponse>(
    "/api/patient_portal/appointment_requests",
  );
  const [startsAt, setStartsAt] = useState(() => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    value.setHours(9, 0, 0, 0);
    return localDateTime(value);
  });
  const [endsAt, setEndsAt] = useState(() => {
    const value = new Date();
    value.setDate(value.getDate() + 1);
    value.setHours(10, 0, 0, 0);
    return localDateTime(value);
  });
  const [siteId, setSiteId] = useState("");
  const [visitTypeId, setVisitTypeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const minimum = useMemo(() => localDateTime(new Date()), []);
  const intervalValid = new Date(endsAt).valueOf() > new Date(startsAt).valueOf();

  async function submit() {
    if (!siteId || !visitTypeId || !intervalValid) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/patient_portal/appointment_requests", {
        method: "POST",
        body: {
          appointment_request: {
            request_key: requestKey,
            starts_at: new Date(startsAt).toISOString(),
            ends_at: new Date(endsAt).toISOString(),
            site_id: Number(siteId),
            visit_type_id: Number(visitTypeId),
          },
        },
      });
      setNotice("Your preferred window was sent to the clinic for review. It is not a confirmed appointment.");
      setRequestKey(crypto.randomUUID());
      setOutcomeUnconfirmed(false);
      resource.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your appointment request could not be sent.");
      setOutcomeUnconfirmed(
        !(reason instanceof ApiError) ||
          reason.status >= 500 ||
          reason.code === "outcome_unconfirmed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Paper id="appointments" variant="outlined" sx={{ p: { xs: 2, md: 3 }, scrollMarginTop: 24 }}>
      <Stack spacing={2.5}>
        <Box>
          <Typography variant="h5" component="h2">Request an appointment</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Choose a preferred window, location, and visit type. The clinic will review it before any appointment is booked.
          </Typography>
        </Box>
        {!resource.data && !resource.error && <Typography role="status">Loading appointment request options…</Typography>}
        {resource.error && <Alert severity="error">{resource.error}</Alert>}
        {resource.data && (
          <>
            {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}
            {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
              <TextField disabled={busy || outcomeUnconfirmed} label="Preferred start (your local time)" type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); setRequestKey(crypto.randomUUID()); }} slotProps={{ htmlInput: { min: minimum }, inputLabel: { shrink: true } }} />
              <TextField disabled={busy || outcomeUnconfirmed} label="Preferred end (your local time)" type="datetime-local" value={endsAt} error={!intervalValid} helperText={intervalValid ? "Choose a window up to four hours." : "End time must be after the start time."} onChange={(event) => { setEndsAt(event.target.value); setRequestKey(crypto.randomUUID()); }} slotProps={{ htmlInput: { min: minimum }, inputLabel: { shrink: true } }} />
              <TextField disabled={busy || outcomeUnconfirmed} select required label="Preferred clinic location" value={siteId} onChange={(event) => { setSiteId(event.target.value); setRequestKey(crypto.randomUUID()); }}>
                <MenuItem value="" disabled>Choose a clinic location</MenuItem>
                {resource.data.options.sites.map((site) => <MenuItem key={site.id} value={String(site.id)}>{site.name || site.code}</MenuItem>)}
              </TextField>
              <TextField disabled={busy || outcomeUnconfirmed} select required label="Visit type" value={visitTypeId} onChange={(event) => { setVisitTypeId(event.target.value); setRequestKey(crypto.randomUUID()); }}>
                <MenuItem value="" disabled>Choose a visit type</MenuItem>
                {resource.data.options.visit_types.map((type) => <MenuItem key={type.id} value={String(type.id)}>{type.code}</MenuItem>)}
              </TextField>
            </Box>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
              <Typography variant="body2" color="text.secondary">The clinic may offer a different available time. No clinician is selected by this request.</Typography>
              <Button variant="contained" disabled={busy || !siteId || !visitTypeId || !intervalValid} onClick={() => void submit()} startIcon={<EventAvailableOutlinedIcon />}>
                {busy ? "Sending…" : outcomeUnconfirmed ? "Retry same request" : "Send request"}
              </Button>
            </Stack>
            <Stack spacing={1.25}>
              <Typography variant="h6" component="h3">Your requests</Typography>
              {resource.data.appointment_requests.length === 0 && <Typography color="text.secondary">You have not requested an appointment yet.</Typography>}
              {resource.data.appointment_requests.map((request) => (
                <Box key={request.id} sx={{ borderTop: "1px solid", borderColor: "divider", pt: 1.5 }}>
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between" }}>
                    <Box>
                      <Typography sx={{ fontWeight: 700 }}>{dateTime(request.starts_at)} – {dateTime(request.ends_at)}</Typography>
                      <Typography variant="body2" color="text.secondary">{request.site?.name || request.site?.code || "Location not specified"} · {request.visit_type?.code || "Visit type not specified"}</Typography>
                    </Box>
                    <Chip size="small" label={request.status.replaceAll("_", " ")} color={request.status === "approved" ? "success" : request.status === "declined" ? "default" : "info"} />
                  </Stack>
                  {request.appointment && <Alert severity={request.appointment.status === "confirmed" || request.appointment.status === "scheduled" ? "success" : "info"} icon={false} sx={{ mt: 1 }}>Booking status: {request.appointment.status.replaceAll("_", " ")} · {dateTime(request.appointment.starts_at)} at {request.appointment.site.name || request.appointment.site.code}{request.appointment.room ? ` · Room ${request.appointment.room.code}` : ""}{request.appointment.clinician ? ` · ${request.appointment.clinician.display_name}` : ""}.</Alert>}
                </Box>
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  );
}
