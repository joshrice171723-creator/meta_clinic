import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import VideoCallOutlinedIcon from "@mui/icons-material/VideoCallOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import type { Clinician } from "../../api/contracts";
import { useResource } from "../../shared/ui";
import { useClinic } from "../clinic/Workspace";
import type { BookingOptions } from "../clinic/TelehealthBookingFormat";
import { ApiError, loginDestination } from "../../api/client";
import { useVisiblePolling } from "./useVisiblePolling";
import { loadTelehealthQueue } from "./api";
import type {
  TelehealthEnvelope,
  TelehealthQueueData,
  TelehealthQueueRow,
} from "./types";
import { VisitPreparationDrawer } from "./VisitPreparationDrawer";

const readinessLabels: Record<TelehealthQueueRow["readiness"], string> = {
  preparation_needed: "Preparation needed",
  consent_needed: "Consent needed",
  waiting: "Waiting",
  admitted: "Admitted",
  connected: "Connected",
  disconnected: "Disconnected",
  ended: "Ended",
};

function dateTime(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Time unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(date);
}

function waitingLabel(value: string | null | undefined) {
  if (!value) return "—";
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).valueOf()) / 1000),
  );
  if (!Number.isFinite(seconds)) return "Unavailable";
  const minutes = Math.floor(seconds / 60);
  return minutes < 1 ? "Less than a minute" : `${minutes} min`;
}

export function telehealthDate(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function QueueBookingAction() {
  const options = useResource<BookingOptions>(
    "/api/clinic/telehealth/booking_options",
  );
  const available =
    options.data?.data.enabled &&
    options.data.data.allowed_modalities.includes("video");
  return (
    <Stack spacing={0.5} sx={{ maxWidth: 300 }}>
      <Button
        variant="contained"
        startIcon={<VideoCallOutlinedIcon />}
        disabled={!available}
        href={available ? "/clinic/schedule?visit_modality=video" : undefined}
      >
        Book video visit
      </Button>
      {!available && (
        <Typography variant="caption" color="text.secondary">
          {options.error
            ? "Booking availability could not be checked."
            : options.data
              ? "Video booking needs clinic configuration."
              : "Checking booking availability…"}
        </Typography>
      )}
    </Stack>
  );
}

export function TelehealthQueue() {
  const clinic = useClinic();
  const clinicians = useResource<{ clinicians: Clinician[] }>(
    "/api/clinic/clinicians?per_page=100",
  );
  const [date, setDate] = useState(() =>
    telehealthDate(clinic.practice.timezone),
  );
  const [siteId, setSiteId] = useState(
    clinic.current_site?.id?.toString() || "",
  );
  const [clinicianId, setClinicianId] = useState("");
  const [status, setStatus] = useState("");
  const [cachedResponse, setResponse] =
    useState<TelehealthEnvelope<TelehealthQueueData> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerVisitId, setDrawerVisitId] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const responseScopeRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const query = useMemo(() => {
    const params = new URLSearchParams({ date, limit: "100" });
    if (siteId) params.set("site_id", siteId);
    if (clinicianId) params.set("clinician_membership_id", clinicianId);
    if (status) params.set("status", status);
    return params;
  }, [clinicianId, date, siteId, status]);
  const requestScope = `${clinic.user_id}:${clinic.membership_id}:${clinic.practice.id}:${query.toString()}`;
  const response =
    responseScopeRef.current === requestScope ? cachedResponse : null;

  const refresh = useCallback(async () => {
    const generation = ++generationRef.current;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const next = await loadTelehealthQueue(query, controller.signal);
      if (generation !== generationRef.current) return;
      responseScopeRef.current = requestScope;
      setResponse(next);
      setError(null);
    } catch (reason) {
      if (generation !== generationRef.current) return;
      if (
        reason instanceof ApiError &&
        [401, 403, 404].includes(reason.status)
      ) {
        setResponse(null);
        setDrawerVisitId(null);
        if (reason.status === 401) {
          window.location.replace(
            `/login?next=${encodeURIComponent(loginDestination(window.location.pathname))}`,
          );
          return;
        }
      }
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load the virtual waiting room.",
      );
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [query, requestScope]);

  useEffect(() => {
    setResponse(null);
    setError(null);
    setDrawerVisitId(null);
    void refresh();
    return () => {
      generationRef.current += 1;
      requestRef.current?.abort();
    };
  }, [refresh]);

  useVisiblePolling(refresh, true, error ? 15_000 : 5_000);

  const clinicianLabel = (
    membershipId: number | null,
    displayName?: string | null,
  ) => {
    if (displayName) return displayName;
    if (!membershipId) return "Not assigned";
    const clinician = clinicians.data?.clinicians.find(
      (item) => item.membership_id === membershipId,
    );
    return clinician?.reference || "Clinician name unavailable";
  };
  const visits = response?.data.visits || [];
  return (
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{
          alignItems: { md: "flex-start" },
          justifyContent: "space-between",
        }}
      >
        <Box>
          <Typography variant="h4" component="h1">
            Virtual waiting room
          </Typography>
          <Typography color="text.secondary">
            See who is preparing, waiting, or connected, then open the next
            visit.
          </Typography>
          {response && (
            <Typography
              variant="caption"
              color={error ? "warning.main" : "text.secondary"}
            >
              Updated {dateTime(response.as_of, clinic.practice.timezone)}
              {" · Updates automatically"}
              {error ? " · Showing the last available result" : ""}
            </Typography>
          )}
        </Box>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: "wrap", alignItems: "flex-start" }}
        >
          {clinic.capabilities.appointments_book && <QueueBookingAction />}
          {clinic.capabilities.telehealth_configure && (
            <Button
              startIcon={<SettingsOutlinedIcon />}
              href="/clinic/settings/telehealth"
            >
              Settings
            </Button>
          )}
          <Button
            startIcon={<RefreshOutlinedIcon />}
            disabled={loading}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
        </Stack>
      </Stack>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          useFlexGap
          sx={{ flexWrap: "wrap" }}
        >
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            helperText={`Appointments in ${clinic.practice.timezone}`}
          />
          <FormControl sx={{ minWidth: 190 }}>
            <InputLabel id="telehealth-site-filter">Site</InputLabel>
            <Select
              labelId="telehealth-site-filter"
              label="Site"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
            >
              <MenuItem value="">All authorized sites</MenuItem>
              {clinic.sites.map((site) => (
                <MenuItem key={site.id} value={String(site.id)}>
                  {site.name || site.code}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 210 }}>
            <InputLabel id="telehealth-clinician-filter">Clinician</InputLabel>
            <Select
              labelId="telehealth-clinician-filter"
              label="Clinician"
              value={clinicianId}
              onChange={(event) => setClinicianId(event.target.value)}
            >
              <MenuItem value="">All clinicians</MenuItem>
              {(clinicians.data?.clinicians || []).map((clinician) => (
                <MenuItem
                  key={clinician.membership_id}
                  value={String(clinician.membership_id)}
                >
                  {clinician.reference || "Clinician name unavailable"}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl sx={{ minWidth: 180 }}>
            <InputLabel id="telehealth-status-filter">Status</InputLabel>
            <Select
              labelId="telehealth-status-filter"
              label="Status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <MenuItem value="">All statuses</MenuItem>
              {[
                "scheduled",
                "in_progress",
                "ending",
                "ended",
                "cancelled",
                "no_show",
              ].map((item) => (
                <MenuItem key={item} value={item}>
                  {
                    (
                      {
                        scheduled: "Scheduled",
                        in_progress: "In progress",
                        ending: "Ending",
                        ended: "Ended",
                        cancelled: "Cancelled",
                        no_show: "Missed appointment",
                      } as Record<string, string>
                    )[item]
                  }
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>
      {error && (
        <Alert
          severity={response ? "warning" : "error"}
          action={<Button onClick={() => void refresh()}>Try again</Button>}
        >
          {error}
        </Alert>
      )}
      {loading && !response && (
        <Typography role="status">Loading video visits…</Typography>
      )}
      {response && visits.length === 0 && (
        <Paper
          variant="outlined"
          sx={{ p: { xs: 3, md: 5 }, textAlign: "center" }}
        >
          <Typography variant="h6" component="h2">
            No video visits match these filters
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
            Scheduled video appointments will appear here as patients prepare
            and check in.
          </Typography>
          <Button
            variant="outlined"
            onClick={() => {
              setDate(telehealthDate(clinic.practice.timezone));
              setSiteId(clinic.current_site?.id?.toString() || "");
              setClinicianId("");
              setStatus("");
            }}
          >
            Show today’s visits
          </Button>
        </Paper>
      )}
      {visits.length > 0 && (
        <TableContainer component={Paper} variant="outlined">
          <Table aria-label="Virtual waiting room">
            <TableHead>
              <TableRow>
                <TableCell>Appointment</TableCell>
                <TableCell>Patient</TableCell>
                <TableCell>Clinician</TableCell>
                <TableCell>Readiness</TableCell>
                <TableCell>Waiting</TableCell>
                <TableCell>Connection</TableCell>
                <TableCell align="right">Next action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visits.map((visit) => {
                const canStart = visit.allowed_actions.includes(
                  "telehealth.start_encounter",
                );
                const canOpen =
                  visit.allowed_actions.includes("telehealth.join") ||
                  Boolean(visit.encounter_id);
                return (
                  <TableRow key={visit.public_id} hover>
                    <TableCell sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {dateTime(
                        visit.appointment.starts_at,
                        visit.appointment.timezone,
                      )}
                    </TableCell>
                    <TableCell>
                      {visit.appointment.patient.display_name}
                    </TableCell>
                    <TableCell>
                      {clinicianLabel(
                        visit.appointment.clinician_membership_id,
                        visit.appointment.clinician?.display_name,
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={readinessLabels[visit.readiness]}
                      />
                    </TableCell>
                    <TableCell>{waitingLabel(visit.waiting_since)}</TableCell>
                    <TableCell>
                      {visit.connection.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell align="right">
                      {canStart || canOpen ? (
                        <Button
                          size="small"
                          variant="contained"
                          href={`/clinic/telehealth/${visit.public_id}`}
                        >
                          {canStart ? "Review and start" : "Open video visit"}
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          onClick={() => setDrawerVisitId(visit.public_id)}
                        >
                          View preparation
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {response?.data.next_cursor && (
        <Alert severity="info">
          More visits are available. Narrow the filters to view them.
        </Alert>
      )}
      <VisitPreparationDrawer
        visitId={drawerVisitId}
        open={Boolean(drawerVisitId)}
        onClose={() => setDrawerVisitId(null)}
      />
    </Stack>
  );
}
