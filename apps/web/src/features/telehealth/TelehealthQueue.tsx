import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import VideoCallOutlinedIcon from "@mui/icons-material/VideoCallOutlined";
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

export function TelehealthQueue() {
  const clinic = useClinic();
  const clinicians = useResource<{ clinicians: Clinician[] }>(
    "/api/clinic/clinicians?per_page=100",
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [siteId, setSiteId] = useState(
    clinic.current_site?.id?.toString() || "",
  );
  const [clinicianId, setClinicianId] = useState("");
  const [status, setStatus] = useState("");
  const [response, setResponse] =
    useState<TelehealthEnvelope<TelehealthQueueData> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerVisitId, setDrawerVisitId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const query = useMemo(() => {
    const params = new URLSearchParams({ date, limit: "100" });
    if (siteId) params.set("site_id", siteId);
    if (clinicianId) params.set("clinician_membership_id", clinicianId);
    if (status) params.set("status", status);
    return params;
  }, [clinicianId, date, siteId, status]);

  const refresh = useCallback(async () => {
    const generation = ++generationRef.current;
    setLoading(true);
    try {
      const next = await loadTelehealthQueue(query);
      if (generation !== generationRef.current) return;
      setResponse(next);
      setError(null);
    } catch (reason) {
      if (generation !== generationRef.current) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to load the virtual waiting room.",
      );
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void refresh();
    return () => {
      generationRef.current += 1;
    };
  }, [refresh]);

  useEffect(() => {
    if (document.visibilityState !== "visible") return;
    timerRef.current = window.setTimeout(
      () => void refresh(),
      error ? 15_000 : 5_000,
    );
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [error, refresh, response]);

  const clinicianLabel = (membershipId: number | null) => {
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
            Review recorded preparation and connection state for video visits.
            Queue order does not indicate clinical priority.
          </Typography>
          {response && (
            <Typography
              variant="caption"
              color={error ? "warning.main" : "text.secondary"}
            >
              Updated {dateTime(response.as_of, clinic.practice.timezone)}
              {error ? " · Showing the last available result" : ""}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<VideoCallOutlinedIcon />}
            href="/clinic/schedule?visit_modality=video"
          >
            Book video visit
          </Button>
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
                  {item.replaceAll("_", " ")}
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
        <Alert severity="info">No video visits match these filters.</Alert>
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
