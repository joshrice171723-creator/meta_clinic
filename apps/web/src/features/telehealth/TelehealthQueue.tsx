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
import { useClinicRealtimeTopic } from "../clinic/ClinicRealtime";
import { loadTelehealthQueue } from "./api";
import type {
  TelehealthEnvelope,
  TelehealthQueueData,
  TelehealthQueueRow,
} from "./types";
import { VisitPreparationDrawer } from "./VisitPreparationDrawer";
import { isDemoFrame } from "../demo/frame";

const readinessLabels: Record<TelehealthQueueRow["readiness"], string> = {
  preparation_needed: "Preparation needed",
  consent_needed: "Consent needed",
  waiting: "Waiting",
  admitted: "Admitted",
  connected: "Connected",
  disconnected: "Disconnected",
  ended: "Ended",
};

function visitCount(value: number, singular: string, plural: string) {
  return `${value} ${value === 1 ? singular : plural}`;
}

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

function QueueBookingAction({ canConfigure }: { canConfigure: boolean }) {
  const clinic = useClinic();
  const options = useResource<BookingOptions>(
    `/api/clinic/telehealth/booking_options?site_id=${clinic.current_site?.id ?? ""}`,
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
        <Stack spacing={0.5}>
          <Typography variant="caption" color="text.secondary">
            {options.error
              ? "Booking availability could not be checked. Refresh this page before relying on the result."
              : options.data
                ? "Video booking is disabled or not ready. The clinic needs a connected provider, a published policy, a successful provider health check, and at least one eligible visit type."
                : "Checking booking availability…"}
          </Typography>
          {canConfigure && options.data && (
            <Button
              href="/clinic/settings/telehealth"
              size="small"
              sx={{ alignSelf: "flex-start" }}
            >
              Open video setup
            </Button>
          )}
          {!canConfigure && options.data && (
            <Typography variant="caption" color="text.secondary">
              Ask a clinic administrator to review the video setup.
            </Typography>
          )}
        </Stack>
      )}
    </Stack>
  );
}

export function TelehealthQueue() {
  const clinic = useClinic();
  const clinicians = useResource<{ clinicians: Clinician[] }>(
    "/api/clinic/clinicians?per_page=100",
  );
  const [date, setDate] = useState(() => {
    const requested = isDemoFrame()
      ? new URLSearchParams(window.location.search).get("date")
      : null;
    return requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
      ? requested
      : telehealthDate(clinic.practice.timezone);
  });
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
  const requestRef = useRef<{
    scope: string;
    refresh: () => Promise<void>;
  } | null>(null);
  const responseScopeRef = useRef<string | null>(null);
  const query = useMemo(() => {
    const params = new URLSearchParams({ date, limit: "100" });
    if (siteId) params.set("site_id", siteId);
    if (clinicianId) params.set("clinician_membership_id", clinicianId);
    if (status) params.set("status", status);
    return params;
  }, [clinicianId, date, siteId, status]);
  const requestScope = `${clinic.user_id}:${clinic.membership_id}:${clinic.practice.id}:${query.toString()}`;
  const latestScopeRef = useRef(requestScope);
  latestScopeRef.current = requestScope;
  const response =
    responseScopeRef.current === requestScope ? cachedResponse : null;

  const refresh = useCallback(async () => {
    const request = requestRef.current;
    if (
      request?.scope === requestScope &&
      latestScopeRef.current === requestScope
    ) {
      await request.refresh();
    }
  }, [requestScope]);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let pendingRefresh = false;
    const isCurrent = () =>
      active && latestScopeRef.current === requestScope;
    const runRefresh = async () => {
      if (!isCurrent()) return;
      if (controller) {
        pendingRefresh = true;
        return;
      }
      controller = new AbortController();
      setLoading(true);
      let succeeded = false;
      try {
        const next = await loadTelehealthQueue(query, controller.signal);
        if (!isCurrent()) return;
        responseScopeRef.current = requestScope;
        setResponse(next);
        setError(null);
        succeeded = true;
      } catch (reason) {
        if (!isCurrent()) return;
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
        controller = null;
        if (isCurrent()) {
          const runTrailingRefresh = succeeded && pendingRefresh;
          pendingRefresh = false;
          if (runTrailingRefresh) void runRefresh();
          else setLoading(false);
        }
      }
    };
    const request = { scope: requestScope, refresh: runRefresh };
    requestRef.current = request;
    setResponse(null);
    setError(null);
    setDrawerVisitId(null);
    void runRefresh();
    return () => {
      active = false;
      pendingRefresh = false;
      controller?.abort();
      if (requestRef.current === request) requestRef.current = null;
    };
  }, [query, requestScope]);

  useClinicRealtimeTopic("telehealth_queue", refresh, {
    fallbackIntervalMs: error ? 15_000 : 5_000,
    freshnessIntervalMs: 60_000,
  });

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
  const readinessSummary = useMemo(
    () =>
      visits.reduce(
        (summary, visit) => {
          summary[visit.readiness] += 1;
          return summary;
        },
        {
          preparation_needed: 0,
          consent_needed: 0,
          waiting: 0,
          admitted: 0,
          connected: 0,
          disconnected: 0,
          ended: 0,
        } as Record<TelehealthQueueRow["readiness"], number>,
      ),
    [visits],
  );
  return (
    <Stack spacing={1.5}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={1.5}
        sx={{
          alignItems: { md: "flex-start" },
          justifyContent: "space-between",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" component="h1">
            Virtual waiting room
          </Typography>
          <Typography variant="body2" color="text.secondary">
            See who is preparing, waiting, or connected, then open the next
            visit.
          </Typography>
          {response && (
            <Typography
              variant="body2"
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
          {clinic.capabilities.appointments_book && (
            <QueueBookingAction
              canConfigure={clinic.capabilities.telehealth_configure === true}
            />
          )}
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
      {response && (
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ flexWrap: "wrap" }}
          aria-label="Virtual waiting room summary"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <Chip
            label={`${visits.length}${response.data.next_cursor ? " shown" : ""} ${visits.length === 1 ? "visit" : "visits"}`}
            color={visits.length > 0 ? "primary" : "default"}
            size="small"
          />
          <Chip
            label={visitCount(
              readinessSummary.waiting,
              "waiting visit",
              "waiting visits",
            )}
            color={readinessSummary.waiting > 0 ? "warning" : "default"}
            size="small"
            variant="outlined"
          />
          <Chip
            label={visitCount(
              readinessSummary.connected,
              "connected visit",
              "connected visits",
            )}
            color={readinessSummary.connected > 0 ? "success" : "default"}
            size="small"
            variant="outlined"
          />
          <Chip
            label={visitCount(
              readinessSummary.preparation_needed +
                readinessSummary.consent_needed,
              "visit needs preparation",
              "visits need preparation",
            )}
            color={
              readinessSummary.preparation_needed +
                readinessSummary.consent_needed >
              0
                ? "warning"
                : "default"
            }
            size="small"
            variant="outlined"
          />
        </Stack>
      )}
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            alignItems: "start",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              lg: "repeat(4, minmax(0, 1fr))",
            },
          }}
        >
          <TextField
            label="Date"
            size="small"
            fullWidth
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            helperText={`Appointments in ${clinic.practice.timezone}`}
          />
          <FormControl size="small" fullWidth sx={{ minWidth: 0 }}>
            <InputLabel id="telehealth-site-filter" shrink>
              Location
            </InputLabel>
            <Select
              labelId="telehealth-site-filter"
              label="Location"
              displayEmpty
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
            >
              <MenuItem value="">All authorized locations</MenuItem>
              {clinic.sites.map((site) => (
                <MenuItem key={site.id} value={String(site.id)}>
                  {site.name || site.code}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth sx={{ minWidth: 0 }}>
            <InputLabel id="telehealth-clinician-filter" shrink>
              Clinician
            </InputLabel>
            <Select
              labelId="telehealth-clinician-filter"
              label="Clinician"
              displayEmpty
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
          <FormControl size="small" fullWidth sx={{ minWidth: 0 }}>
            <InputLabel id="telehealth-status-filter" shrink>
              Status
            </InputLabel>
            <Select
              labelId="telehealth-status-filter"
              label="Status"
              displayEmpty
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
        </Box>
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
        <TableContainer
          component={Paper}
          variant="outlined"
          className="clinic-table-wrap"
          role="region"
          aria-label="Video visit list"
          tabIndex={0}
        >
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
