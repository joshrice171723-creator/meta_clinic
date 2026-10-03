import type {
  Appointment,
  CalendarHold,
  FacilityRoom,
  FacilitySite,
  Patient,
  VisitType,
} from "../../api/contracts";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import CloseIcon from "@mui/icons-material/Close";
import { api, ApiError } from "../../api/client";
import { businessNow } from "../../shared/businessDate";
import {
  TelehealthBookingFormat,
  type VisitModality,
} from "./TelehealthBookingFormat";
import {
  Alert,
  Box,
  Button,
  Card as MuiCard,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  Link,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import { useClinicNavigation } from "./clinicNavigation";
import { useWorkingDraft } from "./useWorkingDraft";
import { type CalendarBooking } from "./ClinicSchedule";
import { BookingPatientPicker } from "./BookingPatientPicker";
import {
  SchedulingResourceAvailability,
  useSchedulingResourceAvailability,
} from "./SchedulingResourceAvailability";
import {
  type BookingDraft,
  type SeriesResolution,
  type SeriesPreviewRow,
  type SeriesAttempt,
  type BookingClinician,
  type BookingServiceOffering,
  offeringEligibilityIssue,
  type BookingAttempt,
  type HoldAttempt,
  FIRST_AVAILABLE_CLINICIAN,
  type AppointmentWorkingDraft,
  appointmentDraftRecoveryMessage,
  bindBookingPatient,
  bookingDraftHasChanges,
  clinicDateTime,
  localDateTimeValue,
  bookingTimePreview,
  clinicDateForBooking,
  appointmentDefaults,
  appointmentIntervalError,
  bookingDurationMinutes,
  bookingEndTime,
  bookingContextDefaults,
} from "./careFlowState";

export function BookingForm({
  timezone,
  onCreated,
  initialPatientId,
  initialVisitModality = "in_person",
  initialSlot,
  onHoldChanged,
  onChooseNewSlot,
  onClose,
}: {
  timezone: string;
  onCreated?: (appointment: Appointment) => void;
  identityLookup?: boolean;
  initialPatientId?: number;
  initialVisitModality?: VisitModality;
  initialSlot?: CalendarBooking;
  onHoldChanged?: () => void;
  onChooseNewSlot?: () => void;
  onClose?: () => void;
}) {
  const clinic = useClinic();
  const workingDraft = useWorkingDraft<AppointmentWorkingDraft>({
    kind: "appointment",
    patientId: initialPatientId,
    siteId: clinic.current_site?.id,
  });
  const preserved = useRef<AppointmentWorkingDraft | null | undefined>(
    undefined,
  );
  if (!workingDraft.ready && !workingDraft.error) return <LoadState />;
  return (
    <Stack spacing={1.5}>
      {workingDraft.error && (
        <Alert
          severity="warning"
          action={<Button onClick={workingDraft.reload}>Retry recovery</Button>}
        >
          Saved scheduling draft could not be loaded. You can continue with a
          new appointment.
        </Alert>
      )}
      <BookingFormEditor
        timezone={timezone}
        onCreated={onCreated}
        initialPatientId={initialPatientId}
        initialVisitModality={initialVisitModality}
        initialSlot={initialSlot}
        onHoldChanged={onHoldChanged}
        onChooseNewSlot={onChooseNewSlot}
        onClose={onClose}
        initialDraft={
          preserved.current ??
          (workingDraft.ready ? workingDraft.restored : null)
        }
        workingDraft={workingDraft}
        onReloadDraft={(snapshot) => {
          preserved.current = snapshot;
          workingDraft.reload();
        }}
      />
    </Stack>
  );
}

function BookingFormEditor({
  timezone,
  onCreated,
  initialPatientId,
  initialVisitModality = "in_person",
  initialSlot,
  onHoldChanged,
  onChooseNewSlot,
  onClose,
  initialDraft,
  workingDraft,
  onReloadDraft,
}: {
  timezone: string;
  onCreated?: (appointment: Appointment) => void;
  initialPatientId?: number;
  initialVisitModality?: VisitModality;
  initialSlot?: CalendarBooking;
  onHoldChanged?: () => void;
  onChooseNewSlot?: () => void;
  onClose?: () => void;
  initialDraft: AppointmentWorkingDraft | null;
  workingDraft: ReturnType<typeof useWorkingDraft<AppointmentWorkingDraft>>;
  onReloadDraft: (snapshot: AppointmentWorkingDraft) => void;
}) {
  const { registerBlocker } = useClinicNavigation();
  const clinic = useClinic();
  const defaultDraft = useMemo<BookingDraft>(() => {
    const defaults = appointmentDefaults();
    const slotStart = initialSlot?.starts_at;
    const useSlotTime = !!slotStart && Date.parse(slotStart) > Date.now();
    const startsAt = useSlotTime
      ? localDateTimeValue(new Date(slotStart))
      : defaults.startsAt;
    const endsAt =
      useSlotTime && initialSlot?.ends_at
        ? localDateTimeValue(new Date(initialSlot.ends_at))
        : defaults.endsAt;
    return {
      patientId: initialPatientId ? String(initialPatientId) : "",
      startsAt,
      endsAt,
      durationMinutes: bookingDurationMinutes(startsAt, endsAt),
      endTimeEdited: false,
      siteId: String(initialSlot?.site_id ?? clinic.current_site?.id ?? ""),
      roomId: initialSlot?.room_id ? String(initialSlot.room_id) : "",
      clinicianId: initialSlot?.clinician_id
        ? String(initialSlot.clinician_id)
        : "",
      visitTypeId: "",
      serviceOfferingId: "",
      reason: "",
      overbookReason: "",
      walkInReason: "",
      walkInRequested: false,
      repeat: "none",
      repeatIntervalWeeks: 1,
      repeatCount: 2,
      seriesResolutions: [],
      visitModality: initialVisitModality,
    };
  }, [
    initialPatientId,
    initialVisitModality,
    initialSlot,
    clinic.current_site?.id,
  ]);
  const restoredDraft = initialDraft?.draft ?? defaultDraft;
  const initialHold = initialSlot?.hold ?? null;
  const initialHoldDeferred = Boolean(
    initialHold &&
    initialDraft &&
    ((initialDraft.attempt &&
      initialDraft.attempt.body.appointment.schedule_hold_id !==
        initialHold.id) ||
      initialDraft.draft.patientId !== String(initialHold.patient_id) ||
      initialDraft.draft.siteId !== String(initialSlot?.site_id ?? "") ||
      initialDraft.draft.clinicianId !== String(initialHold.clinician_id) ||
      initialDraft.draft.roomId !== String(initialHold.room_id ?? "") ||
      initialDraft.draft.startsAt !== defaultDraft.startsAt ||
      initialDraft.draft.endsAt !== defaultDraft.endsAt),
  );
  const boundBooking = bindBookingPatient(
    restoredDraft,
    initialDraft?.attempt ?? null,
    Boolean(initialDraft?.attempt),
    initialPatientId,
  );
  const resumedAttempt = boundBooking.attempt?.body.appointment;
  const resumedAttemptDiffersFromSlot = Boolean(
    initialSlot?.starts_at &&
    resumedAttempt &&
    (Date.parse(initialSlot.starts_at) !==
      Date.parse(resumedAttempt.starts_at) ||
      (initialSlot.ends_at &&
        Date.parse(initialSlot.ends_at) !==
          Date.parse(resumedAttempt.ends_at)) ||
      initialSlot.site_id !== Number(resumedAttempt.site_id)),
  );
  const effectiveDraft = boundBooking.draft;
  // The draft hook retains its recovered snapshot after clearing. Dismiss its
  // notices only after a confirmed reset, including after a successful booking.
  const [recoveryDismissed, setRecoveryDismissed] = useState(false);
  const draftRecoveryMessage = appointmentDraftRecoveryMessage(
    recoveryDismissed ? null : initialDraft,
    workingDraft.updatedAt,
  );
  const recoveredDraftDiffersFromSlot = Boolean(
    draftRecoveryMessage &&
    initialDraft &&
    initialSlot?.starts_at &&
    (Date.parse(initialDraft.draft.startsAt) !==
      Date.parse(initialSlot.starts_at) ||
      (initialSlot.ends_at &&
        Date.parse(initialDraft.draft.endsAt) !==
          Date.parse(initialSlot.ends_at))),
  );
  const [baseline, setBaseline] = useState<BookingDraft>(defaultDraft);
  const [patientId, setPatientId] = useState(effectiveDraft.patientId);
  const [replacementPatientId, setReplacementPatientId] = useState<
    number | undefined
  >(effectiveDraft.patientId ? Number(effectiveDraft.patientId) : undefined);
  const [replacementPatient, setReplacementPatient] = useState<Patient>();
  const [replacementPatientError, setReplacementPatientError] = useState("");
  const [replacementPatientLoading, setReplacementPatientLoading] = useState(
    Boolean(effectiveDraft.patientId),
  );
  const [startsAt, setStartsAt] = useState(restoredDraft.startsAt);
  const [endsAt, setEndsAt] = useState(restoredDraft.endsAt);
  const [durationMinutes, setDurationMinutes] = useState(() =>
    bookingDurationMinutes(
      restoredDraft.startsAt,
      restoredDraft.endsAt,
      restoredDraft.durationMinutes,
    ),
  );
  const [endTimeEdited, setEndTimeEdited] = useState(
    restoredDraft.endTimeEdited ?? Boolean(initialDraft),
  );
  const [siteId, setSiteId] = useState(restoredDraft.siteId);
  const [roomId, setRoomId] = useState(restoredDraft.roomId);
  const [clinicianId, setClinicianId] = useState(restoredDraft.clinicianId);
  const firstAvailable = clinicianId === FIRST_AVAILABLE_CLINICIAN;
  const [visitTypeId, setVisitTypeId] = useState(restoredDraft.visitTypeId);
  const [serviceOfferingId, setServiceOfferingId] = useState(
    restoredDraft.serviceOfferingId ?? "",
  );
  const [reason, setReason] = useState(restoredDraft.reason ?? "");
  const [overbookReason, setOverbookReason] = useState(
    restoredDraft.walkInRequested || restoredDraft.walkInReason
      ? ""
      : (restoredDraft.overbookReason ?? ""),
  );
  const [overbookRequested, setOverbookRequested] = useState(
    !Boolean(restoredDraft.walkInRequested || restoredDraft.walkInReason) &&
      Boolean(
        restoredDraft.overbookRequested ||
        restoredDraft.overbookReason ||
        initialSlot?.overbook,
      ),
  );
  const [walkInReason, setWalkInReason] = useState(
    restoredDraft.walkInReason ?? "",
  );
  const [walkInRequested, setWalkInRequested] = useState(
    Boolean(restoredDraft.walkInRequested || restoredDraft.walkInReason),
  );
  const [repeat, setRepeat] = useState<"none" | "weekly">(
    restoredDraft.walkInRequested || restoredDraft.walkInReason
      ? "none"
      : (restoredDraft.repeat ?? "none"),
  );
  const [repeatIntervalWeeks, setRepeatIntervalWeeks] = useState(
    restoredDraft.repeatIntervalWeeks ?? 1,
  );
  const [repeatCount, setRepeatCount] = useState(
    restoredDraft.repeatCount ?? 2,
  );
  const [seriesResolutions, setSeriesResolutions] = useState<
    SeriesResolution[]
  >(restoredDraft.seriesResolutions ?? []);
  const [seriesPreview, setSeriesPreview] = useState<SeriesPreviewRow[] | null>(
    null,
  );
  const [seriesPreviewPayload, setSeriesPreviewPayload] = useState<
    string | null
  >(null);
  const [seriesAttempt, setSeriesAttempt] = useState<SeriesAttempt | null>(
    initialPatientId &&
      initialDraft?.seriesAttempt?.body.series.patient_id !==
        String(initialPatientId)
      ? null
      : (initialDraft?.seriesAttempt ?? null),
  );
  const [seriesOutcomeUnconfirmed, setSeriesOutcomeUnconfirmed] = useState(
    Boolean(
      initialDraft?.seriesAttempt &&
      (!initialPatientId ||
        initialDraft.seriesAttempt.body.series.patient_id ===
          String(initialPatientId)),
    ),
  );
  const [visitModality, setVisitModality] = useState<VisitModality>(
    restoredDraft.visitModality ?? initialVisitModality,
  );
  const [busy, setBusy] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [bookingAttempt, setBookingAttempt] = useState<BookingAttempt | null>(
    boundBooking.attempt,
  );
  const [heldSlot, setHeldSlot] = useState<CalendarHold | null>(
    initialHoldDeferred ? null : initialHold,
  );
  const [holdAttempt, setHoldAttempt] = useState<HoldAttempt | null>(
    initialPatientId &&
      initialDraft?.holdAttempt?.body.hold.patient_id !==
        String(initialPatientId)
      ? null
      : (initialDraft?.holdAttempt ?? null),
  );
  const [holdOutcomeUnconfirmed, setHoldOutcomeUnconfirmed] = useState(
    Boolean(
      initialDraft?.holdAttempt &&
      (!initialPatientId ||
        initialDraft.holdAttempt?.body.hold.patient_id ===
          String(initialPatientId)),
    ),
  );
  const [holdExpired, setHoldExpired] = useState(
    Boolean(
      !initialHoldDeferred &&
      initialHold &&
      Date.parse(initialHold.expires_at) <= businessNow().getTime(),
    ),
  );
  const [holdError, setHoldError] = useState("");
  const [outcomeUnconfirmed, setOutcomeUnconfirmed] = useState(
    boundBooking.outcomeUnconfirmed,
  );
  const [hasWorkingDraft, setHasWorkingDraft] = useState(Boolean(initialDraft));
  const autosaveTimer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  const lastWorkingDraft = useRef<AppointmentWorkingDraft>(
    initialDraft
      ? {
          draft: effectiveDraft,
          attempt: boundBooking.attempt,
          outcomeUnconfirmed: boundBooking.outcomeUnconfirmed,
          seriesAttempt:
            initialPatientId &&
            initialDraft.seriesAttempt?.body.series.patient_id !==
              String(initialPatientId)
              ? null
              : (initialDraft.seriesAttempt ?? null),
          seriesOutcomeUnconfirmed: Boolean(initialDraft.seriesAttempt),
        }
      : {
          draft: effectiveDraft,
          attempt: null,
          outcomeUnconfirmed: false,
        },
  );
  const [patientQuery, setPatientQuery] = useState("");
  const [changingPatient, setChangingPatient] = useState(false);
  const deferredPatientQuery = useDeferredValue(patientQuery);
  const [submitError, setSubmitError] = useState("");
  const [draftCloseFailed, setDraftCloseFailed] = useState(false);
  const [assignmentNotice, setAssignmentNotice] = useState("");
  const [siteAssignmentBusy, setSiteAssignmentBusy] = useState(false);
  const [created, setCreated] = useState<Appointment>();
  const onHoldChangedRef = useRef(onHoldChanged);
  onHoldChangedRef.current = onHoldChanged;
  useEffect(() => {
    if (!heldSlot) {
      setHoldExpired(false);
      return;
    }
    const remaining = Date.parse(heldSlot.expires_at) - businessNow().getTime();
    if (remaining <= 0) {
      setHoldExpired(true);
      onHoldChangedRef.current?.();
      return;
    }
    const timer = window.setTimeout(() => {
      setHoldExpired(true);
      onHoldChangedRef.current?.();
    }, remaining + 100);
    return () => window.clearTimeout(timer);
  }, [heldSlot]);
  const resourceDate =
    clinicDateForBooking(startsAt, timezone) ??
    clinicDateForBooking(businessNow().toISOString(), timezone) ??
    "1970-01-01";
  const scheduledResourceParams = new URLSearchParams({
    date: resourceDate,
    per_page: "100",
  });
  if (siteId) scheduledResourceParams.set("site_id", siteId);
  if (clinicianId && !firstAvailable)
    scheduledResourceParams.set("booked_clinician_id", clinicianId);
  const currentDraft = useMemo<BookingDraft>(
    () => ({
      patientId,
      startsAt,
      endsAt,
      durationMinutes,
      endTimeEdited,
      siteId,
      roomId,
      clinicianId,
      visitTypeId,
      serviceOfferingId,
      reason,
      overbookReason,
      overbookRequested,
      walkInReason,
      walkInRequested,
      repeat,
      repeatIntervalWeeks,
      repeatCount,
      seriesResolutions,
      visitModality,
    }),
    [
      patientId,
      startsAt,
      endsAt,
      durationMinutes,
      endTimeEdited,
      siteId,
      roomId,
      clinicianId,
      visitTypeId,
      serviceOfferingId,
      reason,
      overbookReason,
      overbookRequested,
      walkInReason,
      walkInRequested,
      repeat,
      repeatIntervalWeeks,
      repeatCount,
      seriesResolutions,
      visitModality,
    ],
  );
  const draftChanged = bookingDraftHasChanges(currentDraft, baseline);
  const dirty = hasWorkingDraft || draftChanged;
  const patients = useResource<{ patients: Patient[] }>(
    `/api/clinic/patients/lookup?q=${encodeURIComponent(deferredPatientQuery.trim())}&per_page=25`,
    {
      enabled: deferredPatientQuery.trim().length > 0,
    },
  );
  const facilities = useResource<{ sites: FacilitySite[] }>(
    "/api/clinic/facilities?type=sites",
  );
  const rooms = useResource<{ rooms: FacilityRoom[] }>(
    "/api/clinic/facilities?type=rooms&per_page=100",
  );
  const clinicians = useResource<{ clinicians: BookingClinician[] }>(
    "/api/clinic/clinicians?per_page=100",
  );
  const noClinicians = clinicians.data?.clinicians.length === 0;
  useEffect(() => {
    if (noClinicians && !clinicianId) {
      setClinicianId(FIRST_AVAILABLE_CLINICIAN);
    } else if (!noClinicians && firstAvailable) {
      setClinicianId("");
    }
  }, [clinicianId, firstAvailable, noClinicians]);
  const visitTypes = useResource<{ visit_types: VisitType[] }>(
    `/api/clinic/facilities?type=visit_types&per_page=100&available_only=true&site_id=${siteId}`,
  );
  const configuredDefaultsApplied = useRef(Boolean(initialDraft));
  useEffect(() => {
    if (
      configuredDefaultsApplied.current ||
      !facilities.data ||
      !visitTypes.data
    )
      return;
    configuredDefaultsApplied.current = true;
    const defaults = bookingContextDefaults(
      facilities.data.sites,
      visitTypes.data.visit_types,
      clinic.current_site?.id,
    );
    const applied: Partial<BookingDraft> = {};
    if (!siteId && defaults.siteId) {
      applied.siteId = defaults.siteId;
      setSiteId(defaults.siteId);
    }
    if (!visitTypeId && defaults.visitTypeId) {
      applied.visitTypeId = defaults.visitTypeId;
      setVisitTypeId(defaults.visitTypeId);
    }
    if (Object.keys(applied).length > 0)
      setBaseline((current) => ({ ...current, ...applied }));
  }, [
    baseline,
    clinic.current_site?.id,
    facilities.data,
    siteId,
    visitTypeId,
    visitTypes.data,
  ]);
  const serviceOfferings = useResource<{
    service_offerings: BookingServiceOffering[];
  }>("/api/clinic/service_offerings?status=published");
  const schedulingPolicy = useResource<{
    policy: import("../../api/contracts").SiteSchedulingPolicy;
    can_overbook: boolean;
    can_capacity_override: boolean;
  }>(`/api/clinic/facilities/${siteId}/scheduling_policy`, {
    enabled: Boolean(siteId),
  });
  const resourceAvailability = useSchedulingResourceAvailability({
    siteId,
    serviceOfferingId,
    roomId,
    startsAt,
    endsAt,
  });
  const availableOfferings =
    serviceOfferings.data?.service_offerings.filter((offering) =>
      offering.available_site_ids?.includes(Number(siteId)),
    ) ?? [];
  const selectedOffering = availableOfferings.find(
    (offering) => String(offering.id) === serviceOfferingId,
  );
  const visitTypeIssue =
    visitTypes.data &&
    !visitTypes.data.visit_types.some(
      (type) => String(type.id) === visitTypeId && !type.retired_at,
    )
      ? "Choose an available visit type for this location. Complete its setup if no visit types are available."
      : null;
  const offeringIssue = serviceOfferingId
    ? selectedOffering
      ? offeringEligibilityIssue(
          selectedOffering,
          siteId,
          firstAvailable ? "" : clinicianId,
          visitTypeId,
          visitModality,
          roomId,
          startsAt,
          endsAt,
        )
      : serviceOfferings.error
        ? "The selected service offering could not be verified. Retry loading it or use visit-type booking."
        : serviceOfferings.data
          ? "This service offering is no longer published. Choose another offering or use visit-type booking."
          : "Checking the selected service offering…"
    : null;
  const scheduledResources = useResource<{ appointments: Appointment[] }>(
    `/api/clinic/appointments?${scheduledResourceParams.toString()}`,
    { retainDataOnRefresh: true },
  );
  useEffect(() => {
    if (draftChanged) setHasWorkingDraft(true);
  }, [draftChanged]);
  useEffect(() => {
    if (!replacementPatientId) {
      setReplacementPatientError("");
      setReplacementPatientLoading(false);
      return;
    }
    const controller = new AbortController();
    setReplacementPatient(undefined);
    setReplacementPatientError("");
    setReplacementPatientLoading(true);
    api<{ patients: Patient[] }>(
      `/api/clinic/patients/lookup?id=${encodeURIComponent(String(replacementPatientId))}`,
      { signal: controller.signal },
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        const patient = result.patients.find(
          (candidate) => candidate.id === replacementPatientId,
        );
        if (!patient) {
          setReplacementPatientError(
            "The selected patient could not be verified. Choose a patient before scheduling.",
          );
          return;
        }
        setReplacementPatient(patient);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setReplacementPatientError(
          reason instanceof Error
            ? reason.message
            : "The selected patient could not be loaded.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setReplacementPatientLoading(false);
      });
    return () => controller.abort();
  }, [replacementPatientId]);
  useEffect(() => {
    if (
      !dirty ||
      bookingAttempt ||
      seriesAttempt ||
      seriesOutcomeUnconfirmed ||
      outcomeUnconfirmed ||
      holdAttempt ||
      holdOutcomeUnconfirmed ||
      busy
    )
      return;
    const snapshot: AppointmentWorkingDraft = {
      draft: currentDraft,
      attempt: null,
      outcomeUnconfirmed: false,
    };
    lastWorkingDraft.current = snapshot;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      autosaveTimer.current = undefined;
      void workingDraft.save(snapshot);
    }, 500);
    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = undefined;
      }
    };
  }, [
    bookingAttempt,
    seriesAttempt,
    seriesOutcomeUnconfirmed,
    holdAttempt,
    holdOutcomeUnconfirmed,
    busy,
    currentDraft,
    dirty,
    outcomeUnconfirmed,
    workingDraft.save,
  ]);
  useEffect(() => {
    if (
      (!dirty &&
        !outcomeUnconfirmed &&
        !holdOutcomeUnconfirmed &&
        !seriesOutcomeUnconfirmed) ||
      typeof window === "undefined"
    )
      return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [
    dirty,
    outcomeUnconfirmed,
    holdOutcomeUnconfirmed,
    seriesOutcomeUnconfirmed,
  ]);
  useEffect(
    () =>
      registerBlocker(
        outcomeUnconfirmed || holdOutcomeUnconfirmed || seriesOutcomeUnconfirmed
          ? () =>
              "A scheduling request outcome is unknown. Retry the exact request before leaving scheduling."
          : dirty
            ? () =>
                "This appointment draft has unsaved changes. Leave scheduling and discard them?"
            : null,
      ),
    [
      dirty,
      outcomeUnconfirmed,
      holdOutcomeUnconfirmed,
      seriesOutcomeUnconfirmed,
      registerBlocker,
    ],
  );
  useEffect(() => {
    setAssignmentNotice("");
  }, [startsAt, endsAt, siteId, clinicianId, visitTypeId]);
  const resourceError =
    facilities.error || rooms.error || clinicians.error || visitTypes.error;
  if (!facilities.data || !rooms.data || !clinicians.data || !visitTypes.data)
    return <LoadState error={resourceError} />;
  const clearReplacementPatient = () => {
    setPatientId("");
    setReplacementPatientId(undefined);
    setReplacementPatient(undefined);
  };
  if (replacementPatientId && replacementPatientLoading) return <LoadState />;
  if (replacementPatientId && replacementPatientError)
    return (
      <Stack spacing={1.5}>
        <Alert severity="error">{replacementPatientError}</Alert>
        <Button
          onClick={clearReplacementPatient}
          sx={{ alignSelf: "flex-start" }}
        >
          Clear selected patient
        </Button>
      </Stack>
    );
  const selectablePatients = replacementPatient
    ? [
        replacementPatient,
        ...(patients.data?.patients ?? []).filter(
          (patient) => patient.id !== replacementPatient.id,
        ),
      ]
    : (patients.data?.patients ?? []);
  const selectedPatient = selectablePatients.find(
    (patient) => String(patient.id) === patientId,
  );
  const selectedClinician = clinicians.data.clinicians.find(
    (clinician) => String(clinician.id) === clinicianId,
  );
  const selectedSite = facilities.data.sites.find(
    (site) => String(site.id) === siteId,
  );
  const clinicianSiteWarning =
    /not assigned to this site for the selected time/i.test(submitError);
  const bookingTimezone = selectedSite?.timezone_override || timezone;
  const createdTimezone =
    facilities.data.sites.find((site) => site.id === created?.site_id)
      ?.timezone_override || timezone;
  const timePreview = bookingTimePreview(startsAt, bookingTimezone);
  const assignClinicianToSlot = async () => {
    if (siteAssignmentBusy || !selectedClinician || !selectedSite) return;
    if (
      repeat === "weekly" &&
      (!seriesPreview || seriesPreviewPayload !== seriesPreviewKey())
    )
      return;
    setSiteAssignmentBusy(true);
    setSubmitError("");
    setAssignmentNotice("");
    const seriesAppointments =
      repeat === "weekly"
        ? (seriesPreview ?? []).filter(
            (row) => row.state === "booked" && row.starts_at && row.ends_at,
          )
        : [];
    const assignmentStartsAt =
      seriesAppointments[0]?.starts_at ?? new Date(startsAt).toISOString();
    const assignmentEndsAt =
      seriesAppointments[seriesAppointments.length - 1]?.ends_at ??
      new Date(endsAt).toISOString();
    try {
      await api(`/api/clinic/clinicians/${selectedClinician.id}/assign_site`, {
        method: "POST",
        body: {
          assignment: {
            site_id: siteId,
            starts_at: assignmentStartsAt,
            ends_at: assignmentEndsAt,
          },
        },
      });
      setAssignmentNotice(
        `${selectedClinician.display_name || "Clinician"} is assigned to ${selectedSite.code} ${repeat === "weekly" ? "for this series period. Preview again before scheduling." : "for this slot. Retry booking."} Capacity templates and site hours still apply.`,
      );
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to assign this clinician to the selected slot.",
      );
    } finally {
      setSiteAssignmentBusy(false);
    }
  };
  const availableRooms = siteId
    ? rooms.data.rooms.filter(
        (room) => room.site_id === Number(siteId) && room.kind === "physical",
      )
    : [];
  const scheduledResourceAppointments =
    scheduledResources.data?.appointments.filter((appointment) => {
      if (!roomId && !clinicianId) return false;
      if (!["scheduled", "confirmed"].includes(appointment.status))
        return false;
      return (
        appointment.room_id === Number(roomId) ||
        appointment.booked_clinician_id === Number(clinicianId)
      );
    }) ?? [];
  const intervalError = appointmentIntervalError(startsAt, endsAt);
  const setDuration = (minutes: number) => {
    setDurationMinutes(minutes);
    setEndTimeEdited(false);
    const end = bookingEndTime(startsAt, minutes);
    if (end) setEndsAt(end);
  };
  const reset = () => {
    configuredDefaultsApplied.current = false;
    setRecoveryDismissed(true);
    setSubmitError("");
    setDraftCloseFailed(false);
    setAssignmentNotice("");
    setBaseline(defaultDraft);
    setPatientId(defaultDraft.patientId);
    setReplacementPatientId(
      defaultDraft.patientId ? Number(defaultDraft.patientId) : undefined,
    );
    setStartsAt(defaultDraft.startsAt);
    setReplacementPatient(undefined);
    setChangingPatient(false);
    setEndsAt(defaultDraft.endsAt);
    setDurationMinutes(
      bookingDurationMinutes(defaultDraft.startsAt, defaultDraft.endsAt),
    );
    setEndTimeEdited(false);
    setSiteId(defaultDraft.siteId);
    setRoomId(defaultDraft.roomId);
    setClinicianId(defaultDraft.clinicianId);
    setVisitTypeId("");
    setServiceOfferingId("");
    setReason("");
    setOverbookReason("");
    setOverbookRequested(Boolean(initialSlot?.overbook));
    setWalkInReason("");
    setWalkInRequested(false);
    setRepeat("none");
    setRepeatIntervalWeeks(1);
    setRepeatCount(2);
    setSeriesResolutions([]);
    setSeriesPreview(null);
    setSeriesPreviewPayload(null);
    setSeriesAttempt(null);
    setSeriesOutcomeUnconfirmed(false);
    setVisitModality(defaultDraft.visitModality ?? "in_person");
    setBookingAttempt(null);
    setOutcomeUnconfirmed(false);
    setHeldSlot(initialSlot?.hold ?? null);
    setHoldAttempt(null);
    setHoldOutcomeUnconfirmed(false);
    setHoldExpired(
      Boolean(
        initialSlot?.hold &&
        Date.parse(initialSlot.hold.expires_at) <= businessNow().getTime(),
      ),
    );
    setHoldError("");
    setHasWorkingDraft(false);
    setPatientQuery("");
  };
  const discard = async () => {
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = undefined;
    }
    if (!(await workingDraft.clear())) {
      setSubmitError(
        "The saved working copy could not be cleared. Retry before starting another appointment.",
      );
      return;
    }
    reset();
  };
  const saveAndClose = async (saveBlankDraft = false) => {
    if (
      !onClose ||
      inFlight.current ||
      busy ||
      outcomeUnconfirmed ||
      holdOutcomeUnconfirmed ||
      seriesOutcomeUnconfirmed ||
      bookingAttempt ||
      seriesAttempt ||
      holdAttempt
    )
      return;
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = undefined;
    }
    setDraftCloseFailed(false);
    if (!dirty && !saveBlankDraft) {
      onClose();
      return;
    }
    const snapshot: AppointmentWorkingDraft = {
      draft: currentDraft,
      attempt: null,
      outcomeUnconfirmed: false,
    };
    inFlight.current = true;
    setDraftSaving(true);
    setBusy(true);
    setSubmitError("");
    try {
      if (!(await workingDraft.save(snapshot))) {
        setDraftCloseFailed(true);
        setSubmitError(
          "The draft could not be saved. Retry, or discard the unsaved changes and close.",
        );
        return;
      }
      lastWorkingDraft.current = snapshot;
      setHasWorkingDraft(true);
      onClose();
    } catch {
      setDraftCloseFailed(true);
      setSubmitError(
        "The draft could not be saved. Retry, or discard the unsaved changes and close.",
      );
    } finally {
      inFlight.current = false;
      setDraftSaving(false);
      setBusy(false);
    }
  };
  const discardUnsavedDraftAndClose = () => {
    if (
      !draftCloseFailed ||
      !onClose ||
      inFlight.current ||
      busy ||
      outcomeUnconfirmed ||
      holdOutcomeUnconfirmed ||
      seriesOutcomeUnconfirmed ||
      bookingAttempt ||
      seriesAttempt ||
      holdAttempt
    )
      return;
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = undefined;
    }
    setDraftCloseFailed(false);
    onClose();
  };
  const createHold = async () => {
    if (
      inFlight.current ||
      busy ||
      bookingAttempt ||
      (heldSlot && !holdAttempt)
    )
      return;
    setHoldError("");
    if (
      !holdAttempt &&
      (!selectedPatient ||
        changingPatient ||
        !siteId ||
        !clinicianId ||
        intervalError)
    ) {
      setHoldError(
        "Choose a patient, site, clinician, and valid interval before holding this slot.",
      );
      return;
    }
    if (!holdAttempt && visitModality !== "in_person") {
      setHoldError(
        "Slot holds are available for in-person visits. Schedule video visits directly.",
      );
      return;
    }
    const starts = new Date(startsAt).getTime();
    const now = businessNow().getTime();
    if (!holdAttempt && (!Number.isFinite(starts) || starts <= now + 60_000)) {
      setHoldError(
        "Choose a slot at least one minute in the future before placing a hold.",
      );
      return;
    }
    const attempt =
      holdAttempt ??
      ({
        body: {
          hold: {
            request_key: crypto.randomUUID(),
            patient_id: patientId,
            site_id: siteId,
            clinician_id: clinicianId,
            room_id: visitModality === "video" ? "" : roomId,
            starts_at: new Date(startsAt).toISOString(),
            ends_at: new Date(endsAt).toISOString(),
            expires_at: new Date(
              Math.min(starts, now + 10 * 60_000),
            ).toISOString(),
          },
        },
      } satisfies HoldAttempt);
    const pending: AppointmentWorkingDraft = {
      draft: currentDraft,
      attempt: null,
      outcomeUnconfirmed: false,
      holdAttempt: attempt,
      holdOutcomeUnconfirmed,
    };
    inFlight.current = true;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    if (!(await workingDraft.save(pending))) {
      inFlight.current = false;
      setHoldError(
        "The working copy could not be saved. Keep this page open and retry before placing a hold.",
      );
      return;
    }
    lastWorkingDraft.current = pending;
    setHoldAttempt(attempt);
    setBusy(true);
    try {
      const result = await api<{ hold: CalendarHold & { state: string } }>(
        "/api/clinic/schedule_holds",
        { method: "POST", body: attempt.body },
      );
      const hold = result.hold;
      if (
        hold.patient_id !== Number(attempt.body.hold.patient_id) ||
        hold.site_id !== Number(attempt.body.hold.site_id) ||
        hold.clinician_id !== Number(attempt.body.hold.clinician_id) ||
        hold.room_id !==
          (attempt.body.hold.room_id
            ? Number(attempt.body.hold.room_id)
            : null) ||
        Date.parse(hold.starts_at) !==
          Date.parse(attempt.body.hold.starts_at) ||
        Date.parse(hold.ends_at) !== Date.parse(attempt.body.hold.ends_at)
      )
        throw new Error(
          "The hold response did not match this booking. Refresh the schedule before retrying.",
        );
      if (
        hold.state !== "active" ||
        Date.parse(hold.expires_at) <= businessNow().getTime()
      ) {
        const cleared: AppointmentWorkingDraft = {
          ...pending,
          holdAttempt: null,
          holdOutcomeUnconfirmed: false,
        };
        lastWorkingDraft.current = cleared;
        await workingDraft.save(cleared);
        setHoldAttempt(null);
        setHoldOutcomeUnconfirmed(false);
        setHoldError(
          "This hold expired or was used. Close this form and choose a currently available slot.",
        );
        onHoldChangedRef.current?.();
        return;
      }
      setHeldSlot(hold);
      setHoldExpired(Date.parse(hold.expires_at) <= businessNow().getTime());
      onHoldChangedRef.current?.();
      const cleared: AppointmentWorkingDraft = {
        ...pending,
        holdAttempt: null,
        holdOutcomeUnconfirmed: false,
      };
      lastWorkingDraft.current = cleared;
      if (await workingDraft.save(cleared)) {
        setHoldAttempt(null);
        setHoldOutcomeUnconfirmed(false);
      } else {
        setHoldOutcomeUnconfirmed(true);
        setHoldError(
          "The hold was created, but its saved retry state could not be updated. Retry the same request before booking.",
        );
      }
    } catch (reason) {
      const unknown =
        pending.holdOutcomeUnconfirmed ||
        !(reason instanceof ApiError) ||
        reason.status === 408 ||
        reason.status >= 500 ||
        reason.code === "outcome_unconfirmed";
      const snapshot: AppointmentWorkingDraft = {
        ...pending,
        holdAttempt: unknown ? attempt : null,
        holdOutcomeUnconfirmed: unknown,
      };
      lastWorkingDraft.current = snapshot;
      await workingDraft.save(snapshot);
      setHoldAttempt(unknown ? attempt : null);
      setHoldOutcomeUnconfirmed(unknown);
      setHoldError(
        unknown
          ? "The hold outcome is unknown. Retry this exact hold request before booking or editing."
          : reason instanceof Error
            ? reason.message
            : "The slot could not be held.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const seriesBody = (requestKey: string): SeriesAttempt => ({
    body: {
      series: {
        patient_id: patientId,
        site_id: siteId,
        room_id: visitModality === "video" ? "" : roomId,
        booked_clinician_id: clinicianId,
        visit_type_id: visitTypeId,
        ...(serviceOfferingId
          ? { service_offering_id: serviceOfferingId }
          : {}),
        starts_at: new Date(startsAt).toISOString(),
        ends_at: new Date(endsAt).toISOString(),
        visit_modality: visitModality,
        interval_weeks: repeatIntervalWeeks,
        occurrence_count: repeatCount,
        expected_policy_revision: schedulingPolicy.data?.policy.revision ?? 0,
        resolutions: seriesResolutions,
        reason,
        request_key: requestKey,
      },
    },
  });
  const seriesPreviewKey = () =>
    JSON.stringify(seriesBody("preview").body.series);
  const seriesPreviewIsCurrent =
    Boolean(seriesPreview) && seriesPreviewPayload === seriesPreviewKey();
  const previewSeries = async () => {
    if (firstAvailable || !selectedClinician) {
      setSubmitError(
        "First available can schedule one appointment only. Choose a configured clinician before creating a recurring series.",
      );
      return;
    }
    if (
      !patientId ||
      !siteId ||
      !clinicianId ||
      !visitTypeId ||
      intervalError ||
      visitTypeIssue ||
      offeringIssue
    ) {
      setSubmitError(
        "Complete the patient, site, clinician, visit type, and valid time before previewing visits.",
      );
      return;
    }
    if (!schedulingPolicy.data?.policy.recurrence_enabled) {
      setSubmitError("Recurring appointments are unavailable at this site.");
      return;
    }
    setBusy(true);
    setSubmitError("");
    setAssignmentNotice("");
    try {
      const attempt = seriesBody("preview");
      const result = await api<{ occurrences: SeriesPreviewRow[] }>(
        "/api/clinic/appointment_series/preview",
        { method: "POST", body: attempt.body },
      );
      setSeriesPreview(result.occurrences);
      setSeriesPreviewPayload(JSON.stringify(attempt.body.series));
      const assignmentConflict = result.occurrences.find((row) =>
        /not assigned to this site for the selected time/i.test(
          row.conflict ?? "",
        ),
      );
      if (assignmentConflict?.conflict)
        setSubmitError(assignmentConflict.conflict);
    } catch (error) {
      setSeriesPreview(null);
      setSeriesPreviewPayload(null);
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Unable to preview recurring visits.",
      );
    } finally {
      setBusy(false);
    }
  };
  const updateSeriesResolution = (
    sequence: number,
    changes: Partial<SeriesResolution>,
  ) => {
    setSeriesResolutions((current) => {
      const previous = current.find((row) => row.sequence === sequence);
      return [
        ...current.filter((row) => row.sequence !== sequence),
        { sequence, ...previous, ...changes },
      ].sort((left, right) => left.sequence - right.sequence);
    });
  };
  const scheduleSeries = async () => {
    if (inFlight.current || busy) return;
    if (!seriesAttempt && (firstAvailable || !selectedClinician)) {
      setSubmitError(
        "First available can schedule one appointment only. Choose a configured clinician before creating a recurring series.",
      );
      return;
    }
    if (
      !seriesAttempt &&
      (!seriesPreview ||
        seriesPreview.some((row) => row.conflict) ||
        seriesPreviewPayload !== seriesPreviewKey())
    ) {
      setSubmitError(
        "Preview and resolve every occurrence before scheduling the series.",
      );
      return;
    }
    const attempt = seriesAttempt ?? seriesBody(crypto.randomUUID());
    const pending: AppointmentWorkingDraft = {
      draft: currentDraft,
      attempt: null,
      outcomeUnconfirmed: false,
      seriesAttempt: attempt,
      seriesOutcomeUnconfirmed,
    };
    inFlight.current = true;
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    if (!(await workingDraft.save(pending))) {
      inFlight.current = false;
      setSubmitError(
        "The working copy could not be saved. Retry before scheduling this series.",
      );
      return;
    }
    lastWorkingDraft.current = pending;
    setSeriesAttempt(attempt);
    setBusy(true);
    setSubmitError("");
    try {
      const result = await api<{
        series: {
          id: number;
          site_id: number;
          patient_id: number;
          occurrences: unknown[];
        };
      }>("/api/clinic/appointment_series", {
        method: "POST",
        body: attempt.body,
      });
      if (
        result.series.patient_id !== Number(attempt.body.series.patient_id) ||
        result.series.site_id !== Number(attempt.body.series.site_id) ||
        result.series.occurrences.length !==
          attempt.body.series.occurrence_count
      )
        throw new Error(
          "The saved series did not match this request. Retry the exact request to reconcile it.",
        );
      if (!(await workingDraft.clear())) {
        setSeriesOutcomeUnconfirmed(true);
        setSubmitError(
          "The series was saved, but its working copy could not be cleared. Retry the same request to reconcile it.",
        );
        return;
      }
      setSeriesAttempt(null);
      setSeriesOutcomeUnconfirmed(false);
      setSeriesPreview(null);
      onHoldChanged?.();
      onClose?.();
    } catch (error) {
      const unknown =
        pending.seriesOutcomeUnconfirmed ||
        !(error instanceof ApiError) ||
        error.status === 408 ||
        error.status >= 500 ||
        error.code === "outcome_unconfirmed";
      const snapshot = {
        ...pending,
        seriesAttempt: unknown ? attempt : null,
        seriesOutcomeUnconfirmed: unknown,
      };
      lastWorkingDraft.current = snapshot;
      await workingDraft.save(snapshot);
      setSeriesAttempt(unknown ? attempt : null);
      setSeriesOutcomeUnconfirmed(unknown);
      setSubmitError(
        unknown
          ? "The series outcome is unknown. Retry the same request before editing or leaving."
          : error instanceof Error
            ? error.message
            : "Unable to schedule this series.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <MuiCard
      variant="outlined"
      sx={{ overflow: "visible" }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented && onClose) {
          event.stopPropagation();
          void saveAndClose();
        }
      }}
    >
      <CardContent
        sx={{ p: { xs: 2, sm: 3 }, "&:last-child": { pb: { xs: 2, sm: 3 } } }}
      >
        <Stack
          direction={{ xs: "column", sm: "row" }}
          sx={{ justifyContent: "space-between", gap: 1, mb: 3 }}
        >
          <Box>
            <Typography
              id={onClose ? "schedule-appointment-title" : undefined}
              component="h2"
              variant="h5"
              sx={{ fontWeight: 700 }}
            >
              Schedule an appointment
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Chip label="Schedule only" size="small" variant="outlined" />
            {onClose && (
              <IconButton
                aria-label="Close booking dialog"
                onClick={() => void saveAndClose()}
                disabled={
                  busy ||
                  outcomeUnconfirmed ||
                  holdOutcomeUnconfirmed ||
                  seriesOutcomeUnconfirmed ||
                  Boolean(bookingAttempt) ||
                  Boolean(seriesAttempt) ||
                  Boolean(holdAttempt)
                }
              >
                <CloseIcon fontSize="small" aria-hidden="true" />
              </IconButton>
            )}
          </Stack>
        </Stack>
        {noClinicians && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No clinicians are configured for this clinic. First available will
            save this appointment without an assigned clinician. Add and assign
            a clinician before confirming the appointment.
          </Alert>
        )}
        {draftRecoveryMessage && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => void discard()}
                disabled={busy}
              >
                Start new appointment
              </Button>
            }
          >
            {recoveredDraftDiffersFromSlot
              ? "This saved draft's time differs from the slot you selected. Start a new appointment to clear it, then confirm the displayed time before scheduling."
              : draftRecoveryMessage}
          </Alert>
        )}
        {!recoveryDismissed &&
          resumedAttemptDiffersFromSlot &&
          resumedAttempt && (
            <Alert severity="warning">
              This form is resuming a saved request for{" "}
              {clinicDateTime(resumedAttempt.starts_at, bookingTimezone)}, not
              the slot you selected. Retry the exact saved request to reconcile
              it, then select the new slot again.
            </Alert>
          )}
        {!recoveryDismissed && initialHoldDeferred && hasWorkingDraft && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            A saved appointment draft is open. Resolve its pending request or
            clear that draft before booking the selected hold.
          </Alert>
        )}
        {heldSlot && (
          <Alert
            severity={holdExpired ? "warning" : "info"}
            sx={{ mb: 2 }}
            action={
              holdExpired && onChooseNewSlot ? (
                <Button color="inherit" onClick={onChooseNewSlot}>
                  Choose new slot
                </Button>
              ) : undefined
            }
          >
            {holdExpired
              ? "This hold expired. Choose a currently available slot before booking."
              : `This slot is held until ${new Date(heldSlot.expires_at).toLocaleString("en-US", { timeZone: timezone })}. Book before it expires or close this form to release it from the calendar.`}
          </Alert>
        )}
        {holdOutcomeUnconfirmed && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              holdAttempt ? (
                <Button color="inherit" onClick={() => void createHold()}>
                  Retry same hold request
                </Button>
              ) : undefined
            }
          >
            The hold outcome is unknown. Retry the same request before editing
            or booking.
          </Alert>
        )}
        {created && (
          <Alert
            severity="success"
            sx={{ mb: 3 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => setCreated(undefined)}
              >
                Dismiss
              </Button>
            }
          >
            Appointment #{created.id} scheduled for{" "}
            {clinicDateTime(created.starts_at, createdTimezone)}.
            {created.service_offering_snapshot?.name &&
              ` Service: ${created.service_offering_snapshot.name}.`}
            {created.telehealth?.clinic_href && (
              <Button size="small" href={created.telehealth.clinic_href}>
                Open video visit
              </Button>
            )}
          </Alert>
        )}
        <Box
          component="form"
          noValidate
          onChange={() => {
            if (!outcomeUnconfirmed && !seriesOutcomeUnconfirmed)
              setSubmitError("");
          }}
          onSubmit={async (event) => {
            event.preventDefault();
            if (inFlight.current) return;
            setSubmitError("");
            setAssignmentNotice("");
            if (repeat === "weekly" || seriesAttempt) {
              if (firstAvailable && !seriesAttempt) {
                setSubmitError(
                  "First available can schedule one appointment only. Add a clinician before creating a recurring series.",
                );
                return;
              }
              void scheduleSeries();
              return;
            }
            if (!bookingAttempt && (holdAttempt || holdOutcomeUnconfirmed))
              return setSubmitError(
                "Resolve the pending hold request before booking.",
              );
            if (
              !bookingAttempt &&
              heldSlot &&
              (holdExpired ||
                Date.parse(heldSlot.expires_at) <= businessNow().getTime())
            ) {
              onHoldChangedRef.current?.();
              return setSubmitError(
                "The hold expired. Close this form and choose a currently available slot.",
              );
            }
            if (!bookingAttempt && changingPatient)
              return setSubmitError(
                "Choose a replacement patient or keep the current patient before scheduling.",
              );
            if (!bookingAttempt && !patientId)
              return setSubmitError("Select a patient before scheduling.");
            if (!bookingAttempt && intervalError)
              return setSubmitError(intervalError);
            if (!bookingAttempt && (!siteId || !clinicianId || !visitTypeId))
              return setSubmitError(
                "Choose a site, clinician, and visit type before scheduling.",
              );
            if (!bookingAttempt && offeringIssue)
              return setSubmitError(offeringIssue);
            if (!bookingAttempt && visitTypeIssue)
              return setSubmitError(visitTypeIssue);
            if (!bookingAttempt && resourceAvailability.issue)
              return setSubmitError(resourceAvailability.issue);
            if (!bookingAttempt && firstAvailable && serviceOfferingId)
              return setSubmitError(
                "First available cannot use a service offering. Add a clinician or choose visit-type booking.",
              );
            if (!bookingAttempt && overbookRequested) {
              if (
                !schedulingPolicy.data?.policy.overbook_enabled ||
                !schedulingPolicy.data.can_overbook
              )
                return setSubmitError(
                  "Overbooking is unavailable to this account at this site.",
                );
              if (
                !schedulingPolicy.data.policy.eligible_visit_type_ids.includes(
                  Number(visitTypeId),
                )
              )
                return setSubmitError(
                  "Choose a visit type eligible for overbooking.",
                );
              if (!overbookReason.trim())
                return setSubmitError(
                  "Enter a reason for this clinician exception.",
                );
            }
            if (!bookingAttempt && walkInRequested) {
              if (!schedulingPolicy.data?.can_capacity_override)
                return setSubmitError(
                  "Walk-in capacity exceptions are unavailable to this account at this site.",
                );
              if (firstAvailable || visitModality !== "in_person")
                return setSubmitError(
                  "Choose a clinician and in-person visit format for a walk-in appointment.",
                );
              if (heldSlot)
                return setSubmitError(
                  "A walk-in cannot use a held appointment slot.",
                );
              if (!walkInReason.trim())
                return setSubmitError(
                  "Enter a reason for this walk-in capacity exception.",
                );
            }
            inFlight.current = true;
            if (autosaveTimer.current) {
              window.clearTimeout(autosaveTimer.current);
              autosaveTimer.current = undefined;
            }
            const attempt =
              bookingAttempt ??
              ({
                body: {
                  appointment: {
                    patient_id: patientId,
                    starts_at: new Date(startsAt).toISOString(),
                    ends_at: new Date(endsAt).toISOString(),
                    site_id: siteId,
                    room_id: roomId,
                    booked_clinician_id: firstAvailable ? null : clinicianId,
                    ...(firstAvailable ? { first_available: true } : {}),
                    visit_type_id: visitTypeId,
                    ...(serviceOfferingId
                      ? {
                          service_offering_id: serviceOfferingId,
                          expected_resource_revision:
                            resourceAvailability.data?.revision,
                        }
                      : {}),
                    ...(heldSlot ? { schedule_hold_id: heldSlot.id } : {}),
                    reason,
                    ...(overbookRequested
                      ? {
                          overbook_reason: overbookReason.trim(),
                          expected_policy_revision:
                            schedulingPolicy.data?.policy.revision,
                        }
                      : {}),
                    ...(walkInRequested
                      ? {
                          walk_in: true,
                          capacity_override_reason: walkInReason.trim(),
                        }
                      : {}),
                    visit_modality: visitModality,
                    request_key: crypto.randomUUID(),
                  },
                },
              } satisfies BookingAttempt);
            const pendingDraft: AppointmentWorkingDraft = {
              draft: currentDraft,
              attempt,
              outcomeUnconfirmed,
            };
            lastWorkingDraft.current = pendingDraft;
            if (!(await workingDraft.save(pendingDraft))) {
              inFlight.current = false;
              setSubmitError(
                "The working copy could not be saved. Keep this page open and retry before scheduling.",
              );
              return;
            }
            setBookingAttempt(attempt);
            setBusy(true);
            try {
              const result = await api<{ appointment: Appointment }>(
                "/api/clinic/appointments",
                {
                  method: "POST",
                  body: attempt.body,
                },
              );
              const requested = attempt.body.appointment;
              if (
                result.appointment.patient_id !==
                  Number(requested.patient_id) ||
                result.appointment.site_id !== Number(requested.site_id) ||
                Date.parse(result.appointment.starts_at) !==
                  Date.parse(requested.starts_at) ||
                Date.parse(result.appointment.ends_at) !==
                  Date.parse(requested.ends_at)
              )
                throw new Error(
                  "The saved appointment did not match the submitted patient, site, or time. Its outcome is unconfirmed; retry the exact request before leaving scheduling.",
                );
              if (
                attempt.body.appointment.schedule_hold_id &&
                (result.appointment.schedule_hold_id !==
                  attempt.body.appointment.schedule_hold_id ||
                  result.appointment.patient_id !==
                    Number(attempt.body.appointment.patient_id) ||
                  result.appointment.site_id !==
                    Number(attempt.body.appointment.site_id))
              )
                throw new Error(
                  "The booked appointment did not match the held slot. Refresh before retrying the exact request.",
                );
              if (!(await workingDraft.clear())) {
                setOutcomeUnconfirmed(true);
                setSubmitError(
                  "The appointment was scheduled, but its working copy could not be cleared. Retry the same request to finish recovery.",
                );
                return;
              }
              setCreated(result.appointment);
              reset();
              onCreated?.(result.appointment);
            } catch (reason) {
              const unknown =
                pendingDraft.outcomeUnconfirmed ||
                !(reason instanceof ApiError) ||
                reason.status === 408 ||
                reason.status >= 500 ||
                reason.code === "outcome_unconfirmed";
              setOutcomeUnconfirmed(unknown);
              if (unknown) {
                const unresolved = {
                  ...pendingDraft,
                  outcomeUnconfirmed: true,
                };
                lastWorkingDraft.current = unresolved;
                await workingDraft.save(unresolved);
              } else {
                if (serviceOfferingId) serviceOfferings.refresh();
                resourceAvailability.refresh();
                if (
                  heldSlot &&
                  reason instanceof ApiError &&
                  [409, 422].includes(reason.status)
                ) {
                  setHoldExpired(true);
                  onHoldChangedRef.current?.();
                }
                setBookingAttempt(null);
                const editable = {
                  draft: currentDraft,
                  attempt: null,
                  outcomeUnconfirmed: false,
                };
                lastWorkingDraft.current = editable;
                await workingDraft.save(editable);
              }
              setSubmitError(
                unknown
                  ? "The scheduling outcome is unknown. Retry this exact request before editing or leaving scheduling."
                  : reason instanceof Error
                    ? reason.message
                    : "The appointment could not be scheduled.",
              );
            } finally {
              inFlight.current = false;
              setBusy(false);
            }
          }}
        >
          <Stack spacing={2.5}>
            <BookingPatientPicker
              patient={selectedPatient}
              editing={changingPatient}
              query={patientQuery}
              results={patients.data?.patients ?? []}
              loading={Boolean(
                deferredPatientQuery.trim() &&
                !patients.data &&
                !patients.error,
              )}
              error={patients.error}
              disabled={
                busy ||
                outcomeUnconfirmed ||
                holdOutcomeUnconfirmed ||
                seriesOutcomeUnconfirmed ||
                Boolean(heldSlot)
              }
              onEditingChange={setChangingPatient}
              canReviewPatient={clinic.capabilities.patients === true}
              onQueryChange={setPatientQuery}
              onSelect={(selected) => {
                setPatientId(String(selected.id));
                setReplacementPatient(selected);
                setReplacementPatientId(undefined);
              }}
            />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 2,
              }}
            >
              <TextField
                label="Starts"
                type="datetime-local"
                required
                disabled={
                  busy ||
                  outcomeUnconfirmed ||
                  holdOutcomeUnconfirmed ||
                  seriesOutcomeUnconfirmed ||
                  Boolean(heldSlot)
                }
                value={startsAt}
                onChange={(event) => {
                  const value = event.target.value;
                  setStartsAt(value);
                  if (!endTimeEdited) {
                    const end = bookingEndTime(value, durationMinutes);
                    if (end) setEndsAt(end);
                  }
                }}
                helperText="Use your device's time zone. Review clinic time below."
                slotProps={{
                  inputLabel: { shrink: true },
                }}
              />
              <TextField
                label="Ends"
                type="datetime-local"
                required
                disabled={
                  busy ||
                  outcomeUnconfirmed ||
                  holdOutcomeUnconfirmed ||
                  seriesOutcomeUnconfirmed ||
                  Boolean(heldSlot)
                }
                value={endsAt}
                error={Boolean(intervalError)}
                helperText={
                  intervalError ||
                  (endTimeEdited
                    ? "Edited end stays fixed. Choose a duration to calculate it again."
                    : "Calculated from duration. Edit to set a specific end.")
                }
                onChange={(event) => {
                  setEndsAt(event.target.value);
                  setEndTimeEdited(true);
                }}
                slotProps={{
                  inputLabel: { shrink: true },
                }}
              />
            </Box>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}
            >
              <Typography variant="body2" color="text.secondary">
                Duration:
              </Typography>
              {[30, 45, 60].map((minutes) => (
                <Button
                  key={minutes}
                  size="small"
                  variant={
                    !endTimeEdited && durationMinutes === minutes
                      ? "contained"
                      : "outlined"
                  }
                  disabled={
                    busy ||
                    outcomeUnconfirmed ||
                    holdOutcomeUnconfirmed ||
                    seriesOutcomeUnconfirmed ||
                    Boolean(heldSlot)
                  }
                  onClick={() => setDuration(minutes)}
                >
                  {minutes} min
                </Button>
              ))}
            </Stack>
            {timePreview && (
              <Alert severity="info" variant="outlined">
                {timePreview} — look right?
              </Alert>
            )}
            <TelehealthBookingFormat
              siteId={siteId}
              visitTypeId={visitTypeId}
              value={visitModality}
              disabled={
                busy ||
                outcomeUnconfirmed ||
                holdOutcomeUnconfirmed ||
                seriesOutcomeUnconfirmed ||
                Boolean(heldSlot)
              }
              canConfigure={clinic.capabilities.telehealth_configure === true}
              onChange={(format) => {
                setVisitModality(format);
                if (format === "video") {
                  setRoomId("");
                  setWalkInRequested(false);
                  setWalkInReason("");
                }
              }}
            />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                gap: 2,
              }}
            >
              <FormControl
                fullWidth
                required
                disabled={
                  busy ||
                  outcomeUnconfirmed ||
                  holdOutcomeUnconfirmed ||
                  seriesOutcomeUnconfirmed ||
                  Boolean(heldSlot)
                }
              >
                <InputLabel id="site-label">Site</InputLabel>
                <Select
                  labelId="site-label"
                  label="Site"
                  value={siteId}
                  onChange={(event) => {
                    setSiteId(event.target.value);
                    setRoomId("");
                    setVisitTypeId("");
                    setServiceOfferingId("");
                    setSeriesPreview(null);
                    setSeriesPreviewPayload(null);
                  }}
                >
                  <MenuItem value="" disabled>
                    Select a site
                  </MenuItem>
                  {facilities.data.sites.map((site) => (
                    <MenuItem key={site.id} value={site.id.toString()}>
                      {site.name || site.code}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {visitModality !== "video" && (
                <FormControl
                  fullWidth
                  disabled={
                    !siteId ||
                    busy ||
                    outcomeUnconfirmed ||
                    holdOutcomeUnconfirmed ||
                    seriesOutcomeUnconfirmed ||
                    Boolean(heldSlot)
                  }
                >
                  <InputLabel id="room-label">Room</InputLabel>
                  <Select
                    labelId="room-label"
                    label="Room"
                    value={roomId}
                    onChange={(event) => setRoomId(event.target.value)}
                  >
                    <MenuItem value="">No room yet</MenuItem>
                    {availableRooms.map((room) => (
                      <MenuItem key={room.id} value={room.id.toString()}>
                        {room.code}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <FormControl
                fullWidth
                required
                disabled={
                  busy ||
                  outcomeUnconfirmed ||
                  holdOutcomeUnconfirmed ||
                  seriesOutcomeUnconfirmed ||
                  Boolean(heldSlot)
                }
              >
                <InputLabel id="clinician-label">Booked clinician</InputLabel>
                <Select
                  labelId="clinician-label"
                  label="Booked clinician"
                  aria-describedby="booked-clinician-setup-help"
                  value={clinicianId}
                  onChange={(event) => setClinicianId(event.target.value)}
                >
                  <MenuItem value="" disabled>
                    Select a clinician
                  </MenuItem>
                  {noClinicians && (
                    <MenuItem value={FIRST_AVAILABLE_CLINICIAN}>
                      First available
                    </MenuItem>
                  )}
                  {clinicians.data.clinicians.map((clinician) => (
                    <MenuItem
                      key={clinician.id}
                      value={clinician.id.toString()}
                    >
                      {clinician.display_name?.trim() ||
                        `Clinician profile #${clinician.id}`}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText id="booked-clinician-setup-help">
                  Missing a clinician? Activated accounts need a clinician
                  scheduling profile and location assignment.{" "}
                  {clinic.capabilities.clinic_setup_write === true ? (
                    <Link href="/clinic/setup">Set up clinicians</Link>
                  ) : (
                    "Ask a clinic administrator to complete scheduling setup."
                  )}
                </FormHelperText>
              </FormControl>
              <FormControl
                fullWidth
                required
                disabled={busy || outcomeUnconfirmed}
              >
                <InputLabel id="visit-type-label">Visit type</InputLabel>
                <Select
                  labelId="visit-type-label"
                  label="Visit type"
                  value={visitTypeId}
                  onChange={(event) => setVisitTypeId(event.target.value)}
                >
                  <MenuItem value="" disabled>
                    Select a visit type
                  </MenuItem>
                  {visitTypeId && visitTypeIssue && (
                    <MenuItem value={visitTypeId} disabled>
                      Previously selected visit type is unavailable
                    </MenuItem>
                  )}
                  {visitTypes.data.visit_types
                    .filter((type) => !type.retired_at)
                    .map((type) => (
                      <MenuItem key={type.id} value={type.id.toString()}>
                        {type.code}
                      </MenuItem>
                    ))}
                </Select>
                {visitTypeIssue && (
                  <FormHelperText error>{visitTypeIssue}</FormHelperText>
                )}
              </FormControl>
              <Box sx={{ gridColumn: { md: "1 / -1" } }}>
                <FormControl
                  fullWidth
                  disabled={
                    busy ||
                    outcomeUnconfirmed ||
                    holdOutcomeUnconfirmed ||
                    seriesOutcomeUnconfirmed ||
                    Boolean(heldSlot)
                  }
                >
                  <InputLabel id="service-offering-label">
                    Service offering
                  </InputLabel>
                  <Select
                    labelId="service-offering-label"
                    label="Service offering"
                    value={serviceOfferingId}
                    onChange={(event) => {
                      const value = event.target.value;
                      setServiceOfferingId(value);
                      const offering = availableOfferings.find(
                        (item) => String(item.id) === value,
                      );
                      if (offering?.visit_type_id)
                        setVisitTypeId(String(offering.visit_type_id));
                      if (offering?.duration_minutes)
                        setDuration(offering.duration_minutes);
                    }}
                  >
                    <MenuItem value="">
                      Visit type only (no service offering)
                    </MenuItem>
                    {serviceOfferingId && !selectedOffering && (
                      <MenuItem value={serviceOfferingId} disabled>
                        Previously selected offering is unavailable
                      </MenuItem>
                    )}
                    {availableOfferings.map((offering) => (
                      <MenuItem key={offering.id} value={String(offering.id)}>
                        {offering.name}
                        {offering.code ? ` · ${offering.code}` : ""}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {serviceOfferings.error && (
                  <Alert
                    severity="warning"
                    sx={{ mt: 1 }}
                    action={
                      <Button
                        color="inherit"
                        size="small"
                        onClick={serviceOfferings.refresh}
                      >
                        Retry
                      </Button>
                    }
                  >
                    Service offerings could not be loaded. Visit-type booking
                    remains available.
                  </Alert>
                )}
                {offeringIssue && (
                  <Alert severity="warning" sx={{ mt: 1 }}>
                    {offeringIssue}
                  </Alert>
                )}
                <SchedulingResourceAvailability
                  resource={resourceAvailability}
                />
              </Box>
              <TextField
                fullWidth
                label="Visit reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy || outcomeUnconfirmed}
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 500 } }}
                helperText="Optional scheduler-facing reason. It is saved with the appointment."
                sx={{ gridColumn: { md: "1 / -1" } }}
              />
              {schedulingPolicy.data?.policy.overbook_enabled &&
                schedulingPolicy.data.can_overbook && (
                  <FormControlLabel
                    sx={{ gridColumn: { md: "1 / -1" } }}
                    control={
                      <Checkbox
                        checked={overbookRequested}
                        disabled={busy || Boolean(bookingAttempt)}
                        onChange={(event) => {
                          const requested = event.target.checked;
                          setOverbookRequested(requested);
                          if (!event.target.checked) setOverbookReason("");
                          if (event.target.checked) {
                            setWalkInRequested(false);
                            setWalkInReason("");
                            setRepeat("none");
                            setSeriesPreview(null);
                            setSeriesPreviewPayload(null);
                          }
                        }}
                      />
                    }
                    label="Request a clinician overbook exception"
                  />
                )}
              {overbookRequested && (
                <Stack spacing={1} sx={{ gridColumn: { md: "1 / -1" } }}>
                  <Alert severity="warning">
                    This clinician already has a visit at this time. Review
                    another free time before requesting an exception. A second
                    patient needs a separate free physical room.
                  </Alert>
                  <TextField
                    fullWidth
                    required
                    label="Overbook reason"
                    value={overbookReason}
                    onChange={(event) => setOverbookReason(event.target.value)}
                    disabled={busy || outcomeUnconfirmed}
                    slotProps={{ htmlInput: { maxLength: 500 } }}
                    helperText="An authorized staff exception applies to this one appointment."
                  />
                </Stack>
              )}
              {schedulingPolicy.data?.can_capacity_override && (
                <Stack spacing={1} sx={{ gridColumn: { md: "1 / -1" } }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={walkInRequested}
                        disabled={
                          busy ||
                          Boolean(bookingAttempt) ||
                          Boolean(seriesAttempt) ||
                          Boolean(holdAttempt) ||
                          Boolean(heldSlot) ||
                          firstAvailable ||
                          visitModality === "video"
                        }
                        onChange={(event) => {
                          const requested = event.target.checked;
                          setWalkInRequested(requested);
                          setWalkInReason("");
                          if (requested) {
                            setOverbookRequested(false);
                            setOverbookReason("");
                            setRepeat("none");
                            setSeriesPreview(null);
                            setSeriesPreviewPayload(null);
                            const start = businessNow();
                            start.setSeconds(0, 0);
                            setDurationMinutes(
                              selectedOffering?.duration_minutes ?? 30,
                            );
                            setEndTimeEdited(false);
                            setStartsAt(localDateTimeValue(start));
                            setEndsAt(
                              localDateTimeValue(
                                new Date(
                                  start.getTime() +
                                    (selectedOffering?.duration_minutes ?? 30) *
                                      60_000,
                                ),
                              ),
                            );
                          }
                        }}
                      />
                    }
                    label="Book as a walk-in"
                  />
                  {walkInRequested && (
                    <>
                      <Alert severity="warning">
                        This walk-in may bypass the clinician's weekly capacity
                        template. Site hours, clinician assignment, blocked
                        time, patient and room conflicts, and active holds are
                        still checked.
                      </Alert>
                      <TextField
                        fullWidth
                        required
                        label="Walk-in reason"
                        value={walkInReason}
                        onChange={(event) =>
                          setWalkInReason(event.target.value)
                        }
                        disabled={busy || outcomeUnconfirmed}
                        slotProps={{ htmlInput: { maxLength: 500 } }}
                        helperText="Saved with the appointment and the authorizing staff member."
                      />
                    </>
                  )}
                </Stack>
              )}
              <Stack spacing={1.5} sx={{ gridColumn: { md: "1 / -1" } }}>
                <TextField
                  select
                  label="Repeat"
                  value={repeat}
                  onChange={(event) => {
                    setRepeat(event.target.value as "none" | "weekly");
                    if (event.target.value === "weekly") {
                      setOverbookRequested(false);
                      setOverbookReason("");
                      setWalkInRequested(false);
                      setWalkInReason("");
                    }
                    setSeriesPreview(null);
                    setSeriesPreviewPayload(null);
                  }}
                  disabled={
                    walkInRequested ||
                    busy ||
                    Boolean(bookingAttempt) ||
                    Boolean(seriesAttempt)
                  }
                >
                  <MenuItem value="none">Does not repeat</MenuItem>
                  <MenuItem
                    value="weekly"
                    disabled={!schedulingPolicy.data?.policy.recurrence_enabled}
                  >
                    Weekly
                  </MenuItem>
                </TextField>
                {repeat === "weekly" && (
                  <>
                    {!schedulingPolicy.data?.policy.recurrence_enabled && (
                      <Alert severity="warning">
                        Recurring visits are off for this site. Ask an
                        authorized clinic setup staff member to enable them.
                      </Alert>
                    )}
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1.5}
                    >
                      <TextField
                        type="number"
                        label="Every (weeks)"
                        sx={{ flex: 1, minWidth: 140 }}
                        value={repeatIntervalWeeks}
                        onChange={(event) =>
                          setRepeatIntervalWeeks(Number(event.target.value))
                        }
                        slotProps={{ htmlInput: { min: 1, max: 4, step: 1 } }}
                        disabled={busy || Boolean(seriesAttempt)}
                      />
                      <TextField
                        type="number"
                        label="Number of visits"
                        sx={{ flex: 1, minWidth: 140 }}
                        value={repeatCount}
                        onChange={(event) =>
                          setRepeatCount(Number(event.target.value))
                        }
                        slotProps={{ htmlInput: { min: 2, max: 12, step: 1 } }}
                        disabled={busy || Boolean(seriesAttempt)}
                      />
                      <Button
                        type="button"
                        variant="outlined"
                        onClick={() => void previewSeries()}
                        disabled={
                          busy ||
                          Boolean(seriesAttempt) ||
                          !schedulingPolicy.data?.policy.recurrence_enabled
                        }
                      >
                        Preview visits
                      </Button>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Each visit is booked separately. Review every date before
                      scheduling; conflicts require a new time or a skip reason.
                    </Typography>
                    {seriesPreview && (
                      <Stack spacing={1}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {
                            seriesPreview.filter(
                              (row) => row.state === "booked",
                            ).length
                          }{" "}
                          to book ·{" "}
                          {
                            seriesPreview.filter(
                              (row) => row.state === "skipped",
                            ).length
                          }{" "}
                          skipped
                        </Typography>
                        {seriesPreview.map((row) => {
                          const resolution = seriesResolutions.find(
                            (item) => item.sequence === row.sequence,
                          );
                          return (
                            <Paper
                              key={row.sequence}
                              variant="outlined"
                              sx={{ p: 1.5 }}
                            >
                              <Stack spacing={1}>
                                <Typography
                                  variant="body2"
                                  sx={{ fontWeight: 650 }}
                                >
                                  Visit {row.sequence} · {row.original_date} ·{" "}
                                  {row.state === "skipped"
                                    ? "Skipped"
                                    : row.starts_at
                                      ? clinicDateTime(row.starts_at, timezone)
                                      : "Time needs review"}
                                </Typography>
                                {row.conflict && (
                                  <Alert severity="warning">
                                    {row.conflict}
                                  </Alert>
                                )}
                                <TextField
                                  type="datetime-local"
                                  label="Change this visit start"
                                  value={
                                    resolution?.starts_at
                                      ? localDateTimeValue(
                                          new Date(resolution.starts_at),
                                        )
                                      : ""
                                  }
                                  onChange={(event) =>
                                    updateSeriesResolution(row.sequence, {
                                      starts_at: event.target.value
                                        ? new Date(
                                            event.target.value,
                                          ).toISOString()
                                        : "",
                                    })
                                  }
                                  disabled={busy || Boolean(seriesAttempt)}
                                  slotProps={{ inputLabel: { shrink: true } }}
                                  helperText={`Uses this device's timezone (${Intl.DateTimeFormat().resolvedOptions().timeZone}). Leave blank to keep the weekly time.`}
                                />
                                <TextField
                                  select
                                  label="Room for this visit"
                                  value={resolution?.room_id ?? ""}
                                  onChange={(event) =>
                                    updateSeriesResolution(row.sequence, {
                                      room_id: event.target.value
                                        ? Number(event.target.value)
                                        : undefined,
                                    })
                                  }
                                  disabled={
                                    busy ||
                                    Boolean(seriesAttempt) ||
                                    visitModality === "video"
                                  }
                                >
                                  <MenuItem value="">Use series room</MenuItem>
                                  {availableRooms.map((room) => (
                                    <MenuItem key={room.id} value={room.id}>
                                      {room.code}
                                    </MenuItem>
                                  ))}
                                </TextField>
                                <TextField
                                  label="Reason for changing this visit"
                                  value={resolution?.change_reason ?? ""}
                                  onChange={(event) =>
                                    updateSeriesResolution(row.sequence, {
                                      change_reason: event.target.value,
                                    })
                                  }
                                  disabled={
                                    busy ||
                                    Boolean(seriesAttempt) ||
                                    !(
                                      resolution?.starts_at ||
                                      resolution?.room_id
                                    )
                                  }
                                  slotProps={{ htmlInput: { maxLength: 500 } }}
                                />
                                <TextField
                                  label="Skip this visit (reason required)"
                                  value={resolution?.skip_reason ?? ""}
                                  onChange={(event) =>
                                    updateSeriesResolution(row.sequence, {
                                      skip_reason: event.target.value,
                                    })
                                  }
                                  disabled={busy || Boolean(seriesAttempt)}
                                  slotProps={{ htmlInput: { maxLength: 500 } }}
                                />
                              </Stack>
                            </Paper>
                          );
                        })}
                        {seriesPreviewPayload !== seriesPreviewKey() && (
                          <Alert severity="info">
                            Visit choices changed. Preview again before
                            scheduling.
                          </Alert>
                        )}
                      </Stack>
                    )}
                    {seriesOutcomeUnconfirmed && (
                      <Alert severity="warning">
                        The series result is uncertain. Retry the exact request
                        below.
                      </Alert>
                    )}
                  </>
                )}
              </Stack>
              {(roomId || clinicianId) && (
                <Box sx={{ gridColumn: { md: "1 / -1" } }}>
                  {scheduledResources.error ? (
                    <Alert severity="warning">
                      Scheduled resource activity could not be loaded. The
                      booking check will still prevent a conflicting
                      appointment.
                    </Alert>
                  ) : !scheduledResources.data ? (
                    <Typography color="text.secondary" role="status">
                      Checking scheduled resource activity…
                    </Typography>
                  ) : scheduledResourceAppointments.length === 0 ? (
                    <Alert severity="info" variant="outlined">
                      No scheduled appointments use the selected resource on{" "}
                      {resourceDate}. Clinician assignment, capacity templates,
                      and site hours are checked when you schedule.
                    </Alert>
                  ) : (
                    <Alert severity="info" variant="outlined">
                      <Typography component="div" variant="body2">
                        The selected resource has other appointments on{" "}
                        {resourceDate}:
                      </Typography>
                      <Stack
                        component="ul"
                        spacing={0.25}
                        sx={{ m: 0, pl: 2.5 }}
                      >
                        {scheduledResourceAppointments.map((appointment) => (
                          <Typography
                            component="li"
                            key={appointment.id}
                            variant="body2"
                          >
                            {clinicDateTime(appointment.starts_at, timezone)}
                            {appointment.room_id === Number(roomId)
                              ? " · selected room"
                              : " · selected clinician"}
                          </Typography>
                        ))}
                      </Stack>
                      <Typography
                        component="div"
                        variant="body2"
                        sx={{ mt: 0.5 }}
                      >
                        Scheduling checks whether the appointment times overlap.
                      </Typography>
                    </Alert>
                  )}
                </Box>
              )}
            </Box>
            {assignmentNotice && (
              <Alert severity="success" role="status">
                {assignmentNotice}
              </Alert>
            )}
            {submitError && (
              <Alert
                severity={clinicianSiteWarning ? "warning" : "error"}
                role="alert"
                action={
                  (draftCloseFailed && onClose) ||
                  (clinicianSiteWarning &&
                    (repeat !== "weekly" || seriesPreviewIsCurrent) &&
                    clinic.capabilities.clinic_setup_write === true &&
                    selectedClinician &&
                    selectedSite) ? (
                    <Stack direction="row" spacing={1}>
                      {draftCloseFailed && onClose && (
                        <Button
                          color="inherit"
                          size="small"
                          onClick={discardUnsavedDraftAndClose}
                        >
                          Discard and close
                        </Button>
                      )}
                      {clinicianSiteWarning &&
                        (repeat !== "weekly" || seriesPreviewIsCurrent) &&
                        clinic.capabilities.clinic_setup_write === true &&
                        selectedClinician &&
                        selectedSite && (
                          <Button
                            color="inherit"
                            size="small"
                            onClick={() => void assignClinicianToSlot()}
                            disabled={siteAssignmentBusy}
                          >
                            {siteAssignmentBusy
                              ? "Assigning…"
                              : `Assign ${selectedClinician.display_name || "clinician"} to ${selectedSite.code} ${repeat === "weekly" ? "for this series period" : "for this slot"}`}
                          </Button>
                        )}
                    </Stack>
                  ) : undefined
                }
              >
                {submitError}
              </Alert>
            )}
            {holdError && (
              <Alert severity="error" role="alert">
                {holdError}
              </Alert>
            )}
            {workingDraft.status === "saving" && (
              <Typography role="status">Saving working copy…</Typography>
            )}
            {workingDraft.status === "saved" && dirty && (
              <Typography color="text.secondary" role="status">
                Working copy saved.
              </Typography>
            )}
            {(workingDraft.status === "error" ||
              workingDraft.status === "conflict") && (
              <Alert
                severity="error"
                action={
                  workingDraft.status === "error" ? (
                    <Button
                      color="inherit"
                      onClick={() =>
                        void workingDraft.save(lastWorkingDraft.current)
                      }
                    >
                      Retry working-copy save
                    </Button>
                  ) : (
                    <Button
                      color="inherit"
                      onClick={() => onReloadDraft(lastWorkingDraft.current)}
                    >
                      Reload version and keep my edits
                    </Button>
                  )
                }
              >
                {workingDraft.error}
              </Alert>
            )}
            {!onClose && <Divider />}
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{
                justifyContent: "space-between",
                alignItems: { sm: "center" },
                ...(onClose && {
                  position: "sticky",
                  bottom: 0,
                  zIndex: 2,
                  bgcolor: "background.paper",
                  borderTop: 1,
                  borderColor: "divider",
                  px: 2,
                  py: 1.5,
                  mx: -2,
                  mb: -2,
                }),
              }}
            >
              {onClose ? (
                <Button
                  type="button"
                  color="inherit"
                  onClick={() => void saveAndClose()}
                  disabled={
                    busy ||
                    Boolean(bookingAttempt) ||
                    Boolean(seriesAttempt) ||
                    outcomeUnconfirmed ||
                    holdOutcomeUnconfirmed ||
                    seriesOutcomeUnconfirmed ||
                    Boolean(holdAttempt)
                  }
                >
                  Close
                </Button>
              ) : (
                <Button
                  type="button"
                  color="inherit"
                  onClick={() => void discard()}
                  disabled={
                    busy ||
                    outcomeUnconfirmed ||
                    holdOutcomeUnconfirmed ||
                    seriesOutcomeUnconfirmed ||
                    Boolean(seriesAttempt) ||
                    Boolean(heldSlot)
                  }
                >
                  {draftRecoveryMessage ? "Clear recovered draft" : "Clear"}
                </Button>
              )}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.5}
                sx={{ ml: { sm: "auto" } }}
              >
                {onClose && (
                  <Button
                    type="button"
                    variant="outlined"
                    onClick={() => void saveAndClose(true)}
                    disabled={
                      busy ||
                      outcomeUnconfirmed ||
                      holdOutcomeUnconfirmed ||
                      seriesOutcomeUnconfirmed ||
                      Boolean(bookingAttempt) ||
                      Boolean(seriesAttempt) ||
                      Boolean(holdAttempt)
                    }
                  >
                    {draftSaving ? "Saving draft…" : "Save as draft"}
                  </Button>
                )}
                <Button
                  type={repeat === "weekly" ? "button" : "submit"}
                  onClick={
                    repeat === "weekly"
                      ? () => void scheduleSeries()
                      : undefined
                  }
                  variant="contained"
                  disabled={
                    busy ||
                    (!outcomeUnconfirmed &&
                      !seriesOutcomeUnconfirmed &&
                      Boolean(submitError)) ||
                    (repeat === "weekly" &&
                      !seriesAttempt &&
                      (!seriesPreview ||
                        seriesPreview.some((row) => Boolean(row.conflict)) ||
                        seriesPreviewPayload !== seriesPreviewKey())) ||
                    (Boolean(holdAttempt) && !bookingAttempt) ||
                    (holdOutcomeUnconfirmed && !bookingAttempt) ||
                    (holdExpired && !bookingAttempt) ||
                    (!outcomeUnconfirmed &&
                      (!selectedPatient || changingPatient))
                  }
                  startIcon={
                    busy && !draftSaving ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : undefined
                  }
                >
                  {busy && !draftSaving
                    ? "Scheduling…"
                    : outcomeUnconfirmed || seriesOutcomeUnconfirmed
                      ? "Retry same request"
                      : repeat === "weekly"
                        ? "Schedule series"
                        : walkInRequested
                          ? "Schedule walk-in"
                          : overbookRequested
                            ? "Schedule overbooked appointment"
                            : "Schedule appointment"}
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </Box>
      </CardContent>
    </MuiCard>
  );
}
