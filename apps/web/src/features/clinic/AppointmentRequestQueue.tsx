import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { api, ApiError } from "../../api/client";
import type {
  Clinician,
  FacilityRoom,
  FacilitySite,
  VisitType,
} from "../../api/contracts";
import { useResource } from "../../shared/ui";
import { patientReferenceLabel } from "./patientReference";

type AppointmentRequest = {
  requested_modality?: "in_person" | "video";
  id: number;
  request_key: string;
  request_kind: "new_booking" | "reschedule" | "cancel";
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  site: { id: number; code: string; name: string } | null;
  visit_type: { id: number; code: string } | null;
  requested_at: string;
  source_appointment: {
    id: number;
    starts_at: string;
    ends_at: string;
    status: string;
    updated_at: string;
    site: { id: number; code: string; name: string } | null;
  } | null;
  patient: { id: number; display_name: string; reference: string };
};

function inputTime(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return Number.isNaN(date.valueOf())
    ? ""
    : new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function dateTimeRange(start: string, end: string) {
  const startsAt = new Date(start);
  const endsAt = new Date(end);
  if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf())) {
    return `${dateTime(start)} – ${dateTime(end)}`;
  }

  const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
  if (startsAt.toDateString() === endsAt.toDateString()) {
    return `${day.format(startsAt)} · ${time.format(startsAt)} – ${time.format(endsAt)}`;
  }
  return `${dateTime(start)} – ${dateTime(end)}`;
}

export function AppointmentRequestQueue({
  currentSiteId,
  onAppointmentBooked,
}: {
  currentSiteId: number | null;
  onAppointmentBooked: () => void;
}) {
  const params = new URLSearchParams({ status: "pending" });
  if (currentSiteId) params.set("site_id", String(currentSiteId));
  const requests = useResource<{ appointment_requests: AppointmentRequest[] }>(
    `/api/clinic/appointment_requests?${params}`,
  );
  const [selected, setSelected] = useState<AppointmentRequest | null>(null);

  return (
    <Paper
      component="section"
      variant="outlined"
      sx={{ p: { xs: 2, md: 3 }, mt: 3 }}
    >
      <Stack spacing={2}>
        <Box>
          <Typography component="h2" variant="h5">
            Appointment requests
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Review new bookings, reschedule requests, and cancellations.
            Appointments change only after approval.
          </Typography>
        </Box>
        {!requests.data && !requests.error && (
          <Typography role="status">Loading appointment requests…</Typography>
        )}
        {requests.error && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={requests.refresh}>
                Retry
              </Button>
            }
          >
            {requests.error}
          </Alert>
        )}
        {requests.data?.appointment_requests.length === 0 && (
          <Typography color="text.secondary">
            No pending appointment requests.
          </Typography>
        )}
        {requests.data?.appointment_requests.map((request) => (
          <Box
            key={request.id}
            sx={{
              borderTop: "1px solid",
              borderColor: "divider",
              pt: 1.5,
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) auto" },
              gap: 1.5,
              alignItems: "center",
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 700 }}>
                {request.patient.display_name}
                {patientReferenceLabel(request.patient.reference) &&
                  ` · ${patientReferenceLabel(request.patient.reference)}`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {request.request_kind === "cancel"
                  ? "Cancellation requested"
                  : `Requested ${dateTimeRange(request.starts_at || "", request.ends_at || "")}`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {request.source_appointment
                  ? `Current appointment: ${dateTime(request.source_appointment.starts_at)} at ${request.source_appointment.site?.name || request.source_appointment.site?.code || "Location not recorded"}`
                  : `${request.site?.name || request.site?.code || "No requested site"} · ${request.visit_type?.code || "No requested visit type"}`}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={() => setSelected(request)}>
                {request.request_kind === "new_booking"
                  ? "Review and book"
                  : "Review change"}
              </Button>
            </Stack>
          </Box>
        ))}
      </Stack>
      {selected && (
        <ReviewDialog
          request={selected}
          onClose={() => setSelected(null)}
          onChanged={(booked) => {
            setSelected(null);
            requests.refresh();
            if (booked) onAppointmentBooked();
          }}
        />
      )}
    </Paper>
  );
}

function ReviewDialog({
  request,
  onClose,
  onChanged,
}: {
  request: AppointmentRequest;
  onClose: () => void;
  onChanged: (booked: boolean) => void;
}) {
  const isNewBooking = request.request_kind === "new_booking";
  const isCancellation = request.request_kind === "cancel";
  const [startsAt, setStartsAt] = useState(
    inputTime(request.starts_at || request.source_appointment?.starts_at || ""),
  );
  const [endsAt, setEndsAt] = useState(
    inputTime(request.ends_at || request.source_appointment?.ends_at || ""),
  );
  const [siteId, setSiteId] = useState(
    request.site ? String(request.site.id) : "",
  );
  const [roomId, setRoomId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [visitTypeId, setVisitTypeId] = useState(
    request.visit_type ? String(request.visit_type.id) : "",
  );
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reviewKey, setReviewKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(false);
  const sites = useResource<{ sites: FacilitySite[] }>(
    "/api/clinic/facilities?type=sites&per_page=100",
  );
  const rooms = useResource<{ rooms: FacilityRoom[] }>(
    "/api/clinic/facilities?type=rooms&per_page=100",
  );
  const clinicians = useResource<{ clinicians: Clinician[] }>(
    "/api/clinic/clinicians?per_page=100",
  );
  const visitTypes = useResource<{ visit_types: VisitType[] }>(
    "/api/clinic/facilities?type=visit_types&per_page=100",
  );
  const availableRooms = useMemo(
    () =>
      rooms.data?.rooms.filter((room) => room.site_id === Number(siteId)) || [],
    [rooms.data, siteId],
  );
  const schedulingError = sites.error || visitTypes.error;
  const optionalOptionsError = rooms.error || clinicians.error;
  const ready = sites.data && visitTypes.data;
  const intervalValid =
    isCancellation || new Date(endsAt).valueOf() > new Date(startsAt).valueOf();

  async function approve() {
    if (
      isNewBooking &&
      request.requested_modality === "video" &&
      (!clinicianId || !visitTypeId)
    ) {
      setError(
        "Choose a clinician and eligible visit type for this video request.",
      );
      return;
    }
    if (
      (!isCancellation && (!startsAt || !endsAt || !intervalValid)) ||
      (isNewBooking && !siteId)
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/clinic/appointment_requests/${request.id}/approve`, {
        method: "POST",
        body: {
          review: isNewBooking
            ? {
                request_key: reviewKey,
                starts_at: new Date(startsAt).toISOString(),
                ends_at: new Date(endsAt).toISOString(),
                site_id: Number(siteId),
                room_id:
                  request.requested_modality === "video"
                    ? undefined
                    : roomId
                      ? Number(roomId)
                      : undefined,
                booked_clinician_id: clinicianId
                  ? Number(clinicianId)
                  : undefined,
                visit_type_id: visitTypeId ? Number(visitTypeId) : undefined,
              }
            : isCancellation
              ? { request_key: reviewKey }
              : {
                  request_key: reviewKey,
                  starts_at: new Date(startsAt).toISOString(),
                  ends_at: new Date(endsAt).toISOString(),
                },
        },
      });
      onChanged(true);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "outcome_unconfirmed") {
        setError(reason.message);
        setOutcomeUnconfirmed(true);
        return;
      }
      if (reason instanceof ApiError && reason.status === 409) {
        setError(
          `${reason.message} Refresh the queue before reviewing this request again.`,
        );
        return;
      }
      setError(
        reason instanceof Error
          ? reason.message
          : "The appointment request could not be approved.",
      );
      setOutcomeUnconfirmed(
        !(reason instanceof ApiError) || reason.status >= 500,
      );
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/clinic/appointment_requests/${request.id}/decline`, {
        method: "POST",
        body: { review: { request_key: reviewKey } },
      });
      onChanged(false);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "outcome_unconfirmed") {
        setError(reason.message);
        setOutcomeUnconfirmed(true);
        return;
      }
      if (reason instanceof ApiError && reason.status === 409) {
        onChanged(false);
        return;
      }
      setError(
        reason instanceof Error
          ? reason.message
          : "The appointment request could not be declined.",
      );
      setOutcomeUnconfirmed(
        !(reason instanceof ApiError) || reason.status >= 500,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={busy || outcomeUnconfirmed ? undefined : onClose}
      fullWidth
      maxWidth="md"
    >
      <DialogTitle>
        {declining
          ? "Decline appointment request"
          : isNewBooking
            ? "Review and book appointment"
            : isCancellation
              ? "Review cancellation request"
              : "Review reschedule request"}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {isNewBooking && request.requested_modality === "video" && (
            <Alert severity="info">
              Requested format: video visit. This booking will use the patient
              portal and virtual waiting room.
            </Alert>
          )}
          <Alert severity="info">
            {isNewBooking
              ? `${request.patient.display_name} requested ${dateTimeRange(request.starts_at || "", request.ends_at || "")}. Confirm the actual booking details below.`
              : isCancellation
                ? `${request.patient.display_name} requested cancellation of the current appointment. Review the appointment below before approving.`
                : `${request.patient.display_name} requested ${dateTimeRange(request.starts_at || "", request.ends_at || "")}. Review the current appointment and preferred replacement time below.`}
          </Alert>
          {!isNewBooking && request.source_appointment && (
            <Typography variant="body2" color="text.secondary">
              Current appointment:{" "}
              {dateTimeRange(
                request.source_appointment.starts_at,
                request.source_appointment.ends_at,
              )}{" "}
              at{" "}
              {request.source_appointment.site?.name ||
                request.source_appointment.site?.code ||
                "Location not recorded"}
              .
            </Typography>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {isNewBooking && schedulingError && (
            <Alert
              severity="error"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    sites.refresh();
                    visitTypes.refresh();
                    rooms.refresh();
                    clinicians.refresh();
                  }}
                >
                  Retry
                </Button>
              }
            >
              Scheduling options could not be loaded. {schedulingError}
            </Alert>
          )}
          {isNewBooking && optionalOptionsError && (
            <Alert
              severity="info"
              action={
                <Button
                  color="inherit"
                  size="small"
                  onClick={() => {
                    rooms.refresh();
                    clinicians.refresh();
                  }}
                >
                  Retry
                </Button>
              }
            >
              Room or clinician options are unavailable. You can still book
              without either assignment.
            </Alert>
          )}
          {isNewBooking && !ready && (
            <Typography role="status">Loading scheduling options…</Typography>
          )}
          {isNewBooking && ready && !declining && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 2,
              }}
            >
              <TextField
                disabled={busy || outcomeUnconfirmed}
                label="Actual start (your local time)"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => {
                  setStartsAt(event.target.value);
                  setReviewKey(crypto.randomUUID());
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                disabled={busy || outcomeUnconfirmed}
                label="Actual end (your local time)"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => {
                  setEndsAt(event.target.value);
                  setReviewKey(crypto.randomUUID());
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                disabled={busy || outcomeUnconfirmed}
                select
                required
                label="Site"
                value={siteId}
                onChange={(event) => {
                  setSiteId(event.target.value);
                  setRoomId("");
                  setReviewKey(crypto.randomUUID());
                }}
              >
                <MenuItem value="" disabled>
                  Select a site
                </MenuItem>
                {(sites.data?.sites || []).map((site) => (
                  <MenuItem key={site.id} value={String(site.id)}>
                    {site.name || site.code}
                  </MenuItem>
                ))}
              </TextField>
              {request.requested_modality !== "video" && (
                <TextField
                  select
                  label="Room"
                  value={roomId}
                  disabled={!siteId || busy || outcomeUnconfirmed}
                  onChange={(event) => {
                    setRoomId(event.target.value);
                    setReviewKey(crypto.randomUUID());
                  }}
                >
                  <MenuItem value="">Not assigned</MenuItem>
                  {availableRooms.map((room) => (
                    <MenuItem key={room.id} value={String(room.id)}>
                      {room.code}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <TextField
                disabled={busy || outcomeUnconfirmed}
                select
                label="Booked clinician"
                value={clinicianId}
                onChange={(event) => {
                  setClinicianId(event.target.value);
                  setReviewKey(crypto.randomUUID());
                }}
              >
                <MenuItem value="">Not assigned</MenuItem>
                {(clinicians.data?.clinicians || []).map((clinician) => (
                  <MenuItem key={clinician.id} value={String(clinician.id)}>
                    {clinician.display_name?.trim() ||
                      clinician.reference ||
                      `Clinician profile #${clinician.id}`}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                disabled={busy || outcomeUnconfirmed}
                select
                label="Visit type (optional)"
                value={visitTypeId}
                helperText="Leave blank when the visit type is not specified."
                onChange={(event) => {
                  setVisitTypeId(event.target.value);
                  setReviewKey(crypto.randomUUID());
                }}
              >
                <MenuItem value="">Not specified</MenuItem>
                {(visitTypes.data?.visit_types || [])
                  .filter((type) => !type.retired_at)
                  .map((type) => (
                    <MenuItem key={type.id} value={String(type.id)}>
                      {type.code}
                    </MenuItem>
                  ))}
              </TextField>
            </Box>
          )}
          {!isNewBooking && !isCancellation && !declining && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                gap: 2,
              }}
            >
              <TextField
                disabled={busy || outcomeUnconfirmed}
                label="Preferred start (your local time)"
                type="datetime-local"
                value={startsAt}
                onChange={(event) => {
                  setStartsAt(event.target.value);
                  setReviewKey(crypto.randomUUID());
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                disabled={busy || outcomeUnconfirmed}
                label="Preferred end (your local time)"
                type="datetime-local"
                value={endsAt}
                onChange={(event) => {
                  setEndsAt(event.target.value);
                  setReviewKey(crypto.randomUUID());
                }}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Box>
          )}
          {!isNewBooking && isCancellation && !declining && (
            <Typography color="text.secondary">
              Approving cancels the displayed appointment. It does not create a
              replacement booking.
            </Typography>
          )}
          {(!isNewBooking || ready) && declining && (
            <Typography color="text.secondary">
              This marks the request declined. It does not cancel or change an
              existing appointment.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy || outcomeUnconfirmed} onClick={onClose}>
          Cancel
        </Button>
        {!declining && (
          <Button
            disabled={busy || outcomeUnconfirmed}
            color="inherit"
            onClick={() => {
              setDeclining(true);
              setReviewKey(crypto.randomUUID());
            }}
          >
            Decline request
          </Button>
        )}
        {declining ? (
          <Button disabled={busy} color="error" onClick={() => void decline()}>
            {busy
              ? "Declining…"
              : outcomeUnconfirmed
                ? "Retry same decline"
                : "Confirm decline"}
          </Button>
        ) : (
          <Button
            disabled={
              busy ||
              (isNewBooking && (!ready || !siteId)) ||
              (!isCancellation && (!startsAt || !endsAt || !intervalValid))
            }
            variant="contained"
            onClick={() => void approve()}
          >
            {busy
              ? isCancellation
                ? "Cancelling…"
                : isNewBooking
                  ? "Booking…"
                  : "Rescheduling…"
              : outcomeUnconfirmed
                ? "Retry same approval"
                : isCancellation
                  ? "Approve cancellation"
                  : isNewBooking
                    ? "Approve and book"
                    : "Approve reschedule"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
