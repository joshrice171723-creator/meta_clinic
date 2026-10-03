import type {
  Appointment,
  ClinicWorkspaceContext,
  EncounterCompletionResponse,
  EncounterCompletionReview,
  EncounterDetail,
  FacilityRoom,
  NurseWorkspace,
  Observation,
  Pagination as PageInfo,
  PatientCareSummary,
  Patient,
} from "../../api/contracts";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, currentLoginDestination } from "../../api/client";
import { type VisitModality } from "./TelehealthBookingFormat";
import {
  Alert,
  Box,
  Button,
  Card as MuiCard,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Link,
  MenuItem,
  Pagination as MuiPagination,
  Paper,
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
import { Card, ErrorMessage, LoadState, useResource } from "../../shared/ui";
import { useClinic } from "./Workspace";
import {
  CareIndicators,
  careIndicatorGroups,
  type CareSummaryLoadState,
} from "./CareIndicators";
import { VisitInstructionHandout } from "../../shared/VisitInstructionHandout";
import { PatientClinicalHistory } from "./PatientClinicalHistory";
import { patientReferenceLabel } from "./patientReference";
import { PatientLabReports } from "./PatientLabReports";
import { MedicationAdministrations } from "./MedicationAdministrations";
import { EncounterFollowUpPanel } from "./EncounterFollowUp";
import { PsychotherapyNotePanel } from "./PsychotherapyNotePanel";
import {
  NurseEncounterWorkspace,
  NurseEncounterWorkspaceContent,
  type FacilityRoomsResource,
  type NurseWorkspaceResource,
} from "./NurseEncounterWorkspace";
import { PatientEducationPanel } from "./PatientEducationPanel";
import { ClinicalPlanWorkspace } from "./ClinicalPlanWorkspace";
import { ClinicSchedule } from "./ClinicSchedule";
import { BookedSchedulingResources } from "./SchedulingResourceAvailability";
import {
  patientDisplayLabel,
  encounterDetailPath,
  operationReceiptPath,
  closeRequestKey,
  closeRequestBody,
  closeFailureState,
  receiptResolution,
  encounterCloseMatches,
  encounterHasSignedSoapNote,
  type OperationReceipt,
  clinicDateTime,
  siteLabel,
  statusLabel,
  chartStateLabel,
  patientAge,
  patientSexLabel,
  observationByLabel,
  bloodPressureValue,
  statusColor,
  bookingAvailability,
  observationValue,
  observationLabel,
} from "./careFlowState";
import { BookingForm } from "./CareBookingForm";
import { SoapNoteWorkspace } from "./CareSoapNoteWorkspace";

export {
  encounterDetailPath,
  type BookingServiceOffering,
  offeringEligibilityIssue,
  appointmentDraftRecoveryMessage,
  bindBookingPatient,
  bookingDraftHasChanges,
  operationReceiptPath,
  closeRequestKey,
  noteSaveRequestKey,
  noteSaveRequestBody,
  closeRequestBody,
  closeFailureState,
  receiptResolution,
  encounterCloseMatches,
  noteSaveMatches,
  encounterNoteRefreshMatches,
  encounterHasSignedSoapNote,
  noteReceiptMatches,
  noteReconciliationMatches,
  clinicDateTime,
  appointmentDefaults,
  appointmentIntervalError,
  bookingDurationMinutes,
  bookingEndTime,
  bookingAvailability,
  bookingContextDefaults,
  voidChartValidation,
  hasSoapContent,
  noteSaveAllowsMutation,
  noteSaveFailureState,
  templateWouldOverwrite,
  applySoapTemplate,
} from "./careFlowState";
export { SoapNoteForm } from "./CareSoapNoteWorkspace";
export { PatientSupport } from "./CarePatientHistory";

export function ScheduleView({
  context,
  appointments,
  pagination,
  onAppointmentCreated,
  onPageChange,
  initialPatientId,
  initialVisitModality = "in_person",
}: {
  context: ClinicWorkspaceContext;
  appointments: Appointment[];
  pagination: PageInfo;
  onAppointmentCreated?: (appointment: Appointment) => void;
  onPageChange?: (page: number) => void;
  initialPatientId?: number;
  initialVisitModality?: VisitModality;
}) {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography color="text.secondary" variant="overline">
          PATIENT FLOW · SCHEDULED
        </Typography>
        <Stack
          direction="row"
          sx={{
            justifyContent: "space-between",
            alignItems: "center",
            gap: 2,
            flexWrap: "wrap",
          }}
        >
          <Typography component="h1" variant="h3">
            Schedule
          </Typography>
          <Link href="/clinic" data-clinic-view="tracking">
            Tracking board ↗
          </Link>
        </Stack>
      </Box>
      <Alert severity="info">
        Scheduled visits appear here after the clinic records them. A scheduled
        time is not an arrival or a place in the tracking-board queue.
      </Alert>
      {bookingAvailability(context.capabilities).visible && (
        <BookingForm
          key={`${initialPatientId ?? "new"}:${initialVisitModality}`}
          timezone={context.practice.timezone}
          identityLookup={
            bookingAvailability(context.capabilities).identityLookup
          }
          initialPatientId={initialPatientId}
          initialVisitModality={initialVisitModality}
          onCreated={onAppointmentCreated}
        />
      )}
      <MuiCard variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            sx={{ justifyContent: "space-between", gap: 1, mb: 2 }}
          >
            <Box>
              <Typography component="h2" variant="h5" sx={{ fontWeight: 700 }}>
                Scheduled visits
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ordered by start time · {context.practice.timezone}
              </Typography>
            </Box>
            <Chip
              label={`${pagination.total} ${pagination.total === 1 ? "visit" : "visits"}`}
              variant="outlined"
            />
          </Stack>
          {appointments.length === 0 ? (
            <Alert severity="info">
              <strong>No scheduled visits were returned.</strong> This is not
              evidence that the clinic has no active visits.
            </Alert>
          ) : (
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ maxWidth: "100%" }}
            >
              <Table aria-label="Scheduled visits" sx={{ minWidth: 760 }}>
                <TableHead>
                  <TableRow
                    sx={{
                      "& th": {
                        fontWeight: 700,
                        bgcolor: "background.default",
                      },
                    }}
                  >
                    <TableCell>When</TableCell>
                    <TableCell>Patient</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Record</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {appointments.map((appointment) => (
                    <TableRow key={appointment.id}>
                      <TableCell>
                        <Typography sx={{ fontWeight: 600 }}>
                          {clinicDateTime(
                            appointment.starts_at,
                            context.practice.timezone,
                          )}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Ends{" "}
                          {clinicDateTime(
                            appointment.ends_at,
                            context.practice.timezone,
                          )}
                        </Typography>
                        {appointment.service_offering_snapshot?.name && (
                          <Typography variant="body2" color="text.secondary">
                            Service:{" "}
                            {appointment.service_offering_snapshot.name}
                          </Typography>
                        )}
                        <BookedSchedulingResources
                          snapshot={
                            appointment.service_offering_snapshot
                              ?.resource_compatibility
                          }
                        />
                      </TableCell>
                      <TableCell>
                        {context.capabilities.patients ? (
                          <Link
                            href={`/clinic/patients/${appointment.patient_id}`}
                          >
                            {patientDisplayLabel(appointment.patient)}
                          </Link>
                        ) : (
                          <Typography color="text.secondary">
                            {patientDisplayLabel(appointment.patient)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography>
                          {siteLabel(context, appointment.site_id)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {appointment.visit_modality === "video"
                            ? "Video visit"
                            : appointment.room_id === null
                              ? "Room not assigned"
                              : `Room record #${appointment.room_id}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={statusLabel(appointment.status)}
                          color={statusColor(appointment.status)}
                          variant="outlined"
                          sx={{ textTransform: "capitalize" }}
                        />
                      </TableCell>
                      <TableCell>
                        {appointment.telehealth?.clinic_href && (
                          <Button
                            size="small"
                            href={appointment.telehealth.clinic_href}
                          >
                            Open video visit
                          </Button>
                        )}
                        {appointment.encounter_id === null ? (
                          <Typography color="text.secondary">
                            No encounter yet
                          </Typography>
                        ) : context.capabilities.patients ? (
                          <Link
                            href={`/clinic/patients/${appointment.patient_id}/encounters/${appointment.encounter_id}`}
                          >
                            Open encounter →
                          </Link>
                        ) : (
                          <Typography color="text.secondary">
                            Encounter record unavailable
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {pagination.total_pages > 1 && (
            <MuiPagination
              sx={{ mt: 2, display: "flex", justifyContent: "center" }}
              count={pagination.total_pages}
              page={pagination.page}
              onChange={(_, page) => onPageChange?.(page)}
              color="primary"
              aria-label="Scheduled visits pages"
            />
          )}
        </CardContent>
      </MuiCard>
    </Stack>
  );
}

export function Schedule({
  search = window.location.search,
  active = true,
}: { search?: string; active?: boolean } = {}) {
  const context = useClinic();
  const replacementPatientId = Number(
    new URLSearchParams(search).get("patient_id"),
  );
  const initialPatientId =
    Number.isSafeInteger(replacementPatientId) && replacementPatientId > 0
      ? replacementPatientId
      : undefined;
  return (
    <ClinicSchedule
      key={initialPatientId ?? "schedule"}
      active={active}
      initialPatientId={initialPatientId}
      canBook={bookingAvailability(context.capabilities).visible}
      renderBooking={(
        slot,
        onCreated,
        onHoldChanged,
        onChooseNewSlot,
        onClose,
      ) => (
        <BookingForm
          timezone={context.practice.timezone}
          initialPatientId={slot?.hold?.patient_id ?? initialPatientId}
          initialSlot={slot}
          onHoldChanged={onHoldChanged}
          onChooseNewSlot={onChooseNewSlot}
          onClose={onClose}
          initialVisitModality={
            !slot?.hold &&
            new URLSearchParams(search).get("visit_modality") === "video"
              ? "video"
              : "in_person"
          }
          onCreated={onCreated}
        />
      )}
    />
  );
}

export function ChartQuickJump() {
  const links = [
    ["Education", "#patient-education"],
    ["History", "#clinical-history"],
    ["Labs", "#chart-labs"],
    ["Medication", "#medication-administration"],
    ["Orders & plans", "#clinical-plan-workspace"],
    ["HPI", "#chart-hpi"],
    ["ROS", "#chart-ros"],
    ["SOAP assessment", "#chart-assessment"],
    ["Plan", "#chart-plan"],
    ["Signing", "#chart-signing"],
  ] as const;

  return (
    <Paper
      component="nav"
      variant="outlined"
      className="chart-quick-jump"
      aria-label="Chart quick navigation"
    >
      <Typography variant="subtitle2" component="h2">
        Sections in chart
      </Typography>
      <Stack direction="row" className="chart-quick-jump-links">
        {links.map(([label, href]) => (
          <Button
            key={href}
            href={href}
            variant="text"
            size="small"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              document.querySelector(href)?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
              window.history.replaceState(null, "", href);
            }}
          >
            {label}
          </Button>
        ))}
      </Stack>
    </Paper>
  );
}

export function EncounterSectionRail({
  chartConfirmed,
}: {
  chartConfirmed: boolean;
}) {
  const links = useMemo<Array<[string, string]>>(
    () => [
      ["Summary", "#chart-patient"],
      ["Intake", "#nurse-workspace"],
      ["Chart", "#chart-access"],
      ...(chartConfirmed
        ? [
            ["Documentation", "#chart-documentation"] as [string, string],
            ["Completion", "#chart-completion"] as [string, string],
          ]
        : []),
    ],
    [chartConfirmed],
  );
  const [activeHref, setActiveHref] = useState(links[0][1]);

  useEffect(() => {
    let frame = 0;
    const updateActiveSection = () => {
      frame = 0;
      const sections = links
        .map(([, href]) => ({
          href,
          element: document.getElementById(href.slice(1)),
        }))
        .filter(
          (section): section is typeof section & { element: HTMLElement } =>
            section.element instanceof HTMLElement,
        );
      if (sections.length === 0) return;

      const activationLine = Math.min(160, window.innerHeight * 0.28);
      const current = sections
        .filter(({ element }) => {
          const rect = element.getBoundingClientRect();
          return rect.top <= activationLine && rect.bottom > activationLine;
        })
        .sort(
          (left, right) =>
            right.element.getBoundingClientRect().top -
            left.element.getBoundingClientRect().top,
        )[0];
      if (current) {
        setActiveHref(current.href);
        return;
      }

      const next = sections
        .filter(
          ({ element }) => element.getBoundingClientRect().top > activationLine,
        )
        .sort(
          (left, right) =>
            left.element.getBoundingClientRect().top -
            right.element.getBoundingClientRect().top,
        )[0];
      setActiveHref(next?.href ?? sections[sections.length - 1].href);
    };
    const scheduleUpdate = () => {
      if (frame === 0) frame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("hashchange", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("hashchange", scheduleUpdate);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [links]);

  return (
    <Paper
      component="nav"
      variant="outlined"
      className="encounter-section-rail"
      aria-label="Encounter sections"
    >
      <Typography variant="subtitle2" component="h2">
        Encounter
      </Typography>
      <Stack direction="row" className="encounter-section-links">
        {links.map(([label, href]) => (
          <Button
            key={href}
            href={href}
            variant={activeHref === href ? "outlined" : "text"}
            size="small"
            aria-current={activeHref === href ? "location" : undefined}
            onClick={(event) => {
              if (
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              document.querySelector(href)?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              });
              window.history.replaceState(window.history.state, "", href);
            }}
          >
            {label}
          </Button>
        ))}
      </Stack>
    </Paper>
  );
}

export function ProviderEncounterWorkflow({
  patient,
  encounter,
  observations: initialObservations,
  timezone,
  noteWorkspace,
  careSummaryState = { status: "unlinked" },
  onCareSummaryRefresh,
  onEncounterRefresh,
  nurseWorkspaceResource,
  facilityRoomsResource,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  observations: Observation[];
  timezone: string;
  noteWorkspace: ReactNode;
  careSummaryState?: CareSummaryLoadState;
  onCareSummaryRefresh?: () => void;
  onEncounterRefresh?: () => void;
  nurseWorkspaceResource?: NurseWorkspaceResource;
  facilityRoomsResource?: FacilityRoomsResource;
}) {
  const { capabilities, membership_id } = useClinic();
  const [recordedObservations, setRecordedObservations] = useState<
    Observation[]
  >([]);
  const [handoutOpen, setHandoutOpen] = useState(false);
  const [orderRevision, setOrderRevision] = useState(0);
  const observations = Array.from(
    new Map(
      [...initialObservations, ...recordedObservations].map((observation) => [
        observation.id,
        observation,
      ]),
    ).values(),
  ).sort(
    (left, right) =>
      Date.parse(right.observed_at) - Date.parse(left.observed_at) ||
      right.id - left.id,
  );
  const displayedObservations = observations.filter(
    (observation) => observation.value_kind !== "group",
  );
  const [chartConfirmed, setChartConfirmed] = useState(
    () =>
      encounter.status === "completed" &&
      !encounterHasSignedSoapNote(encounter),
  );
  const signedChart = encounterHasSignedSoapNote(encounter);
  const currentPhones = (patient.contacts ?? []).filter(
    (contact) => contact.contact_type === "phone" && !contact.effective_until,
  );
  const existingChart = encounter.notes.some(
    (note) => note.note_kind === "soap",
  );
  const workspaceHeading = useRef<HTMLHeadingElement | null>(null);
  const observationTimes = new Set(
    displayedObservations.map((observation) => observation.observed_at),
  );
  const sharedObservationTime =
    observationTimes.size === 1
      ? clinicDateTime(displayedObservations[0]?.observed_at ?? null, timezone)
      : null;
  const reviewNeededTopics =
    careSummaryState.status === "ready"
      ? (careSummaryState.summary.review_needed_topics ?? []).filter(
          (topic): topic is "allergies" | "medications" =>
            topic === "allergies" || topic === "medications",
        )
      : [];
  const focusReview = (topic: "allergies" | "medications") => {
    const href = `#clinical-history-${topic}-review`;
    const target = document.getElementById(href.slice(1));
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus();
  };

  useEffect(() => {
    const requestedFocus = new URLSearchParams(window.location.search).get(
      "focus",
    );
    if (requestedFocus === "nurse-workspace") {
      const timer = window.setTimeout(() => {
        const target = document.getElementById(requestedFocus);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        target?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (!chartConfirmed) return;
    if (!requestedFocus) {
      workspaceHeading.current?.focus();
      return;
    }
    const timer = window.setTimeout(() => {
      const target = document.getElementById(requestedFocus);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [chartConfirmed]);

  return (
    <Stack spacing={2} className="provider-encounter-workflow">
      {encounter.visit_modality === "video" && !encounter.telehealth && (
        <Alert severity="info">
          Video visit requested. The clinic's video connection or visit
          eligibility is not ready. Clinic setup staff must resolve video access
          before joining. Intake, manual charting, orders and follow-up remain
          available; no video session has started.
        </Alert>
      )}
      <Paper
        id="chart-patient"
        variant="outlined"
        sx={{ p: 2 }}
        className="chart-anchor encounter-summary-header"
      >
        <Stack spacing={1}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            sx={{
              alignItems: { sm: "flex-start" },
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
                {patient.display_name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Encounter #{encounter.id} · Patient and visit summary
              </Typography>
            </Box>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{ alignItems: { sm: "center" }, flexWrap: "wrap" }}
            >
              <Chip
                label={`Visit ${statusLabel(encounter.status)}`}
                variant="outlined"
              />
              <Chip
                label={`Chart ${chartStateLabel(
                  signedChart,
                  chartConfirmed,
                  existingChart,
                )}`}
                variant="outlined"
              />
              {chartConfirmed &&
                encounter.telehealth?.clinic_href &&
                capabilities.telehealth_read && (
                  <Button
                    size="small"
                    variant="contained"
                    href={encounter.telehealth.clinic_href}
                  >
                    Open video visit &amp; Scribe
                  </Button>
                )}
              {chartConfirmed &&
                capabilities.scribe_read === true &&
                capabilities.scribe_write === true &&
                capabilities.notes_write === true && (
                  <Button
                    size="small"
                    variant="outlined"
                    href={`/clinic/scribe?patient_id=${patient.id}&clinical_encounter_id=${encounter.id}`}
                  >
                    Open Scribe
                  </Button>
                )}
            </Stack>
          </Stack>
          <TableContainer>
            <Table size="small" className="patient-demographics-table">
              <TableBody>
                <TableRow>
                  <TableCell component="th">MRN</TableCell>
                  <TableCell>
                    {patientReferenceLabel(patient.reference) || "Not recorded"}
                  </TableCell>
                  <TableCell component="th">Date of Visit</TableCell>
                  <TableCell>
                    {clinicDateTime(encounter.started_at, timezone)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th">Patient</TableCell>
                  <TableCell>
                    {patient.display_name || "Not recorded"}
                  </TableCell>
                  <TableCell component="th">Age</TableCell>
                  <TableCell>
                    {patientAge(
                      patient.demographics?.date_of_birth,
                      encounter.started_at,
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th">Sex</TableCell>
                  <TableCell>
                    {patientSexLabel(patient.demographics?.sex)}
                  </TableCell>
                  <TableCell component="th">Phone</TableCell>
                  <TableCell>
                    {currentPhones.find((contact) => contact.preferred)
                      ?.contact_value ||
                      currentPhones[0]?.contact_value ||
                      "Not recorded"}
                  </TableCell>
                  <TableCell component="th">Birthdate</TableCell>
                  <TableCell>
                    {patient.demographics?.date_of_birth || "Not recorded"}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell component="th">Heart Rate</TableCell>
                  <TableCell>
                    {observationByLabel(observations, /heart\s*rate/i)}
                  </TableCell>
                  <TableCell component="th">Blood Pressure</TableCell>
                  <TableCell>{bloodPressureValue(observations)}</TableCell>
                  <TableCell component="th">Weight</TableCell>
                  <TableCell>
                    {observationByLabel(observations, /weight/i)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          {encounter.status === "completed" &&
            capabilities.notes_read === true && (
              <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setHandoutOpen(true)}
                >
                  Patient handout
                </Button>
              </Box>
            )}
          {handoutOpen && (
            <VisitInstructionHandout
              key={`${patient.id}:${encounter.id}`}
              endpoint={`/api/clinic/patients/${patient.id}/encounters/${encounter.id}/visit_instructions`}
              onClose={() => setHandoutOpen(false)}
            />
          )}
        </Stack>
      </Paper>

      <Box className="encounter-workspace-layout">
        <EncounterSectionRail chartConfirmed={chartConfirmed} />
        <Stack spacing={2} className="encounter-workspace-primary">
          {nurseWorkspaceResource && facilityRoomsResource ? (
            <NurseEncounterWorkspaceContent
              patient={patient}
              encounter={encounter}
              observations={observations}
              onObservationsRecorded={(saved) =>
                setRecordedObservations((current) => [
                  ...current,
                  ...saved.filter(
                    (observation) =>
                      observation.patient_id === patient.id &&
                      observation.encounter_id === encounter.id,
                  ),
                ])
              }
              careSummary={
                careSummaryState.status === "ready"
                  ? careSummaryState.summary
                  : null
              }
              resource={nurseWorkspaceResource}
              roomsResource={facilityRoomsResource}
            />
          ) : (
            <NurseEncounterWorkspace
              patient={patient}
              encounter={encounter}
              observations={observations}
              onObservationsRecorded={(saved) =>
                setRecordedObservations((current) => [
                  ...current,
                  ...saved.filter(
                    (observation) =>
                      observation.patient_id === patient.id &&
                      observation.encounter_id === encounter.id,
                  ),
                ])
              }
              careSummary={
                careSummaryState.status === "ready"
                  ? careSummaryState.summary
                  : null
              }
            />
          )}

          {!chartConfirmed && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Typography component="h2" variant="subtitle1">
                  Read-only chart summary
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Recorded care details are available for review. Confirm the
                  patient and encounter below before opening clinical
                  documentation.
                </Typography>
                {careSummaryState.status === "ready" &&
                careSummaryState.summary.patient_id === patient.id &&
                careSummaryState.summary.encounter_id === encounter.id ? (
                  <Stack spacing={1}>
                    <Typography variant="body2">
                      Allergies:{" "}
                      {careSummaryState.summary.allergies.state.replaceAll(
                        "_",
                        " ",
                      )}
                      {" · "}Medications:{" "}
                      {careSummaryState.summary.medications.state.replaceAll(
                        "_",
                        " ",
                      )}
                      {" · "}Care needs:{" "}
                      {careSummaryState.summary.care_needs.state.replaceAll(
                        "_",
                        " ",
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Recorded as of{" "}
                      {clinicDateTime(careSummaryState.summary.as_of, timezone)}
                      .
                    </Typography>
                    {careIndicatorGroups(careSummaryState, timezone).map(
                      (group) => (
                        <Box key={group.key}>
                          <Typography variant="subtitle2">
                            {group.label}
                          </Typography>
                          {group.details.map((detail, index) => (
                            <Box key={index}>
                              <Typography variant="body2">
                                {detail.primary}
                              </Typography>
                              {detail.secondary && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {detail.secondary}
                                </Typography>
                              )}
                            </Box>
                          ))}
                        </Box>
                      ),
                    )}
                  </Stack>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    role="status"
                  >
                    {careSummaryState.status === "loading"
                      ? "Loading recorded care details."
                      : "Recorded care details are unavailable for this patient and encounter. No clinical state is inferred."}
                  </Typography>
                )}
              </Stack>
            </Paper>
          )}

          <Paper id="chart-access" variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.25}>
              <Box>
                <Typography component="h2" variant="subtitle1">
                  Clinician chart
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Confirm the patient and encounter before opening the chart.
                  This confirmation does not accept a handoff or assign a
                  provider.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Chip
                  label={chartStateLabel(
                    signedChart,
                    chartConfirmed,
                    existingChart,
                  )}
                  variant="outlined"
                />
                {chartConfirmed && (
                  <Button href="/clinic" variant="text" size="small">
                    Close chart
                  </Button>
                )}
              </Stack>
              {!chartConfirmed && (
                <Alert severity="info">
                  {signedChart
                    ? "Confirm this patient reference and encounter before viewing the signed chart."
                    : encounter.status === "completed"
                      ? "This encounter is complete. Confirm the patient reference and encounter before reviewing the chart."
                      : existingChart
                        ? "This encounter has an in-progress chart. Confirm the patient reference and encounter before opening it."
                        : "Complete the available nurse preparation, then confirm this patient reference and encounter before opening the chart."}
                </Alert>
              )}
              {!chartConfirmed && (
                <Button
                  variant="contained"
                  onClick={() => setChartConfirmed(true)}
                  sx={{ alignSelf: "flex-start" }}
                >
                  {signedChart
                    ? "Confirm and view signed chart"
                    : encounter.status === "completed"
                      ? "Confirm and review chart"
                      : existingChart
                        ? "Confirm and open chart"
                        : "Confirm and begin charting"}
                </Button>
              )}
            </Stack>
          </Paper>

          {chartConfirmed && (
            <Stack spacing={2}>
              <Paper id="chart-context" variant="outlined" sx={{ p: 2 }}>
                <Stack spacing={1.5}>
                  <Typography
                    ref={workspaceHeading}
                    tabIndex={-1}
                    variant="subtitle2"
                    component="h2"
                  >
                    Encounter context
                  </Typography>
                  <Box>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      Recorded care details
                    </Typography>
                    {careSummaryState.status === "loading" ? (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        role="status"
                      >
                        Loading recorded care details…
                      </Typography>
                    ) : careSummaryState.status === "error" ? (
                      <Typography variant="body2" color="text.secondary">
                        Recorded care details could not be loaded.
                      </Typography>
                    ) : (
                      <CareIndicators
                        state={careSummaryState}
                        patientLabel={patient.display_name}
                        timezone={timezone}
                      />
                    )}
                  </Box>
                  {reviewNeededTopics.length > 0 && (
                    <Box>
                      <Typography variant="subtitle2">Review needed</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Use the existing review controls to record the outcome
                        for this encounter.
                      </Typography>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        sx={{ mt: 1 }}
                      >
                        {reviewNeededTopics.map((topic) => (
                          <Button
                            key={topic}
                            size="small"
                            variant="outlined"
                            href={`#clinical-history-${topic}-review`}
                            onClick={(event) => {
                              event.preventDefault();
                              focusReview(topic);
                            }}
                          >
                            Review {topic.replaceAll("_", " ")}
                          </Button>
                        ))}
                      </Stack>
                    </Box>
                  )}
                  <Divider />
                  <Box>
                    <Typography variant="subtitle2">Vital signs</Typography>
                    {displayedObservations.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        No recorded observations are available for this
                        encounter.
                      </Typography>
                    ) : (
                      <>
                        {sharedObservationTime && (
                          <Typography variant="caption" color="text.secondary">
                            Observed {sharedObservationTime}
                          </Typography>
                        )}
                        <Box className="provider-vitals-grid">
                          {displayedObservations.map((observation) => (
                            <Box key={observation.id}>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                {observation.display_label ||
                                  observationLabel(observation.code)}
                              </Typography>
                              <Typography
                                variant="body2"
                                sx={{ fontWeight: 600 }}
                              >
                                {observationValue(observation)}
                              </Typography>
                              {!sharedObservationTime && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {clinicDateTime(
                                    observation.observed_at,
                                    timezone,
                                  )}
                                </Typography>
                              )}
                            </Box>
                          ))}
                        </Box>
                      </>
                    )}
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    Values are displayed as recorded. No review status is
                    inferred or stored here.
                  </Typography>
                </Stack>
              </Paper>
              <Box className="provider-chart-layout">
                <ChartQuickJump />
                <Stack spacing={2} className="provider-chart-content">
                  <PatientEducationPanel
                    patient={patient}
                    encounter={encounter}
                  />
                  <PatientClinicalHistory
                    patientId={patient.id}
                    encounterId={encounter.id}
                    onChanged={onCareSummaryRefresh}
                  />
                  <Box id="chart-labs">
                    <PatientLabReports
                      patientId={patient.id}
                      patientName={patient.display_name}
                      encounterId={encounter.id}
                      orderRevision={orderRevision}
                    />
                  </Box>
                  <MedicationAdministrations
                    encounter={encounter}
                    patient={patient}
                    timezone={timezone}
                    onChanged={onCareSummaryRefresh}
                  />
                  <ClinicalPlanWorkspace
                    patient={patient}
                    encounter={encounter}
                    onChanged={() =>
                      setOrderRevision((revision) => revision + 1)
                    }
                  />
                  <Box id="chart-documentation" sx={{ scrollMarginTop: 16 }}>
                    {noteWorkspace}
                  </Box>
                  {encounter.individual_therapy_visit &&
                    capabilities.psychotherapy_notes && (
                      <PsychotherapyNotePanel
                        key={`${membership_id}:${patient.id}:${encounter.id}`}
                        encounter={encounter}
                      />
                    )}
                  <VisitWrapUp
                    patient={patient}
                    encounter={encounter}
                    timezone={timezone}
                    onEncounterRefresh={onEncounterRefresh}
                  />
                </Stack>
              </Box>
            </Stack>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}

type CloseState =
  | "idle"
  | "closing"
  | "reconciling"
  | "outcome_unconfirmed"
  | "not_found"
  | "rejected"
  | "committed";

const COMPLETION_DISPOSITION_LABELS: Record<
  EncounterCompletionReview["disposition_code"],
  string
> = {
  completed_as_planned: "Completed as planned",
  left_before_completion: "Patient left before completion",
  transferred_to_higher_level_of_care: "Transferred to a higher level of care",
  emergency_services: "Emergency services involved",
  other: "Other recorded outcome",
};

const COMPLETION_INSTRUCTION_LABELS: Record<
  EncounterCompletionReview["instructions_status"],
  string
> = {
  provided: "Signed written instructions provided",
  not_required: "Written instructions not required",
  unable_to_complete: "Unable to provide written instructions",
};

const COMPLETION_EDUCATION_LABELS: Record<
  EncounterCompletionReview["education_status"],
  string
> = {
  recorded: "Education and teach-back recorded",
  not_required: "Education not required for this visit",
  unable_to_complete: "Unable to complete education",
};

export function VisitWrapUp({
  patient,
  encounter,
  timezone,
  onEncounterRefresh,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  timezone: string;
  onEncounterRefresh?: () => void;
}) {
  const context = useClinic();
  const completionPath = `/api/clinic/encounters/${encounter.id}/completion?patient_id=${patient.id}`;
  const completionResource = useResource<EncounterCompletionResponse>(
    completionPath,
    { retainDataOnRefresh: true },
  );
  const [completed, setCompleted] = useState<EncounterDetail | null>(null);
  const [savedReview, setSavedReview] =
    useState<EncounterCompletionReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [closeState, setCloseState] = useState<CloseState>("idle");
  const [confirmation, setConfirmation] = useState<"close" | "reset" | null>(
    null,
  );
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const requestKeyRef = useRef<string | null>(null);
  const initializedEncounterRef = useRef<number | null>(null);
  const [disposition, setDisposition] = useState<
    EncounterCompletionReview["disposition_code"] | ""
  >("");
  const [instructionsStatus, setInstructionsStatus] = useState<
    EncounterCompletionReview["instructions_status"] | ""
  >("");
  const [educationStatus, setEducationStatus] = useState<
    EncounterCompletionReview["education_status"] | ""
  >("");
  const [exceptionNote, setExceptionNote] = useState("");
  const [openWorkReviewed, setOpenWorkReviewed] = useState(false);
  const current = completed ?? encounter;
  const completion = completionResource.data;
  const evidence = completion?.evidence;
  const review = savedReview ?? completion?.completion_review ?? null;
  const formLocked = busy || closeState !== "idle";
  const exceptionRequired =
    Boolean(disposition && instructionsStatus && educationStatus) &&
    (disposition !== "completed_as_planned" ||
      instructionsStatus === "unable_to_complete" ||
      educationStatus === "unable_to_complete");

  useEffect(() => {
    if (!completion || initializedEncounterRef.current === encounter.id) return;
    initializedEncounterRef.current = encounter.id;
  }, [completion, encounter.id]);

  const redirectIfUnauthorized = (caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 401) {
      window.location.replace(
        `/login?next=${encodeURIComponent(currentLoginDestination())}`,
      );
      return true;
    }
    return false;
  };

  const reconcileCommittedClose = async () => {
    setCloseState("reconciling");
    const [encounterResult, completionResult] = await Promise.all([
      api<{ encounter: EncounterDetail }>(
        encounterDetailPath(patient.id, encounter.id),
      ),
      api<EncounterCompletionResponse>(completionPath),
    ]);
    if (
      !encounterCloseMatches(
        encounterResult.encounter,
        patient.id,
        encounter.id,
      )
    ) {
      throw new Error(
        "The refreshed encounter did not match this patient, encounter, and completed status.",
      );
    }
    if (
      !completionResult.completion_review ||
      completionResult.patient_id !== patient.id ||
      completionResult.encounter_id !== encounter.id
    ) {
      throw new Error(
        "The encounter ended, but its completion review could not be confirmed.",
      );
    }
    setCompleted(encounterResult.encounter);
    setSavedReview(completionResult.completion_review);
    setCloseState("committed");
    requestKeyRef.current = null;
    setRequestKey(null);
    completionResource.refresh();
    onEncounterRefresh?.();
  };

  const endVisit = async () => {
    if (busy || closeState !== "idle" || !completion || !evidence) return;
    if (!evidence.follow_up) {
      setError(
        "Save the encounter follow-up disposition before completing this visit.",
      );
      return;
    }
    if (!disposition || !instructionsStatus || !educationStatus) {
      setError(
        "Choose the visit outcome, written-instruction status, and education status.",
      );
      return;
    }
    if (!openWorkReviewed) {
      setError(
        "Review the unfinished work and its current owner before completing this visit.",
      );
      return;
    }
    if (instructionsStatus === "provided" && !evidence.signed_instruction) {
      setError(
        "No signed patient-instruction revision is available. Refresh the checklist or choose another status.",
      );
      return;
    }
    if (
      educationStatus === "recorded" &&
      evidence.education_events.length === 0
    ) {
      setError(
        "No patient education event is available. Refresh the checklist or choose another status.",
      );
      return;
    }
    if (exceptionRequired && !exceptionNote.trim()) {
      setError("Record what happened for this completion exception.");
      return;
    }
    setConfirmation(null);
    const key = closeRequestKey(requestKeyRef.current);
    requestKeyRef.current = key;
    setRequestKey(key);
    const body = closeRequestBody(patient.id, key, {
      disposition_code: disposition,
      instructions_status: instructionsStatus,
      education_status: educationStatus,
      follow_up_id: evidence.follow_up.id,
      follow_up_version: evidence.follow_up.version,
      expected_follow_up_state: evidence.follow_up.status,
      instruction_note_revision_id:
        instructionsStatus === "provided"
          ? (evidence.signed_instruction?.revision_id ?? null)
          : null,
      expected_education_event_ids: evidence.education_events.map(
        (event) => event.id,
      ),
      expected_open_task_versions: evidence.open_tasks.map(
        (task) => `${task.id}:${task.version}`,
      ),
      open_work_reviewed: openWorkReviewed,
      exception_note: exceptionNote.trim() || null,
    });
    setBusy(true);
    setError("");
    setCloseState("closing");
    try {
      const result = await api<{
        encounter: EncounterDetail;
        completion_review: EncounterCompletionReview;
      }>(`/api/clinic/encounters/${encounter.id}/close`, {
        method: "POST",
        body,
      });
      if (
        result.completion_review.patient_id !== patient.id ||
        result.completion_review.encounter_id !== encounter.id
      ) {
        throw new Error(
          "The saved completion review did not match this patient encounter.",
        );
      }
      setSavedReview(result.completion_review);
      await reconcileCommittedClose();
    } catch (caught) {
      if (redirectIfUnauthorized(caught)) return;
      if (
        closeFailureState(
          caught instanceof ApiError ? caught.status : undefined,
          caught instanceof ApiError ? caught.message : "",
          caught instanceof ApiError ? caught.code : undefined,
        ) === "rejected"
      ) {
        setCloseState("rejected");
        setError(
          caught instanceof Error
            ? caught.message
            : "The close request was rejected.",
        );
      } else {
        setCloseState("outcome_unconfirmed");
        setError(
          "The visit close could not be confirmed. No automatic retry was made. Check the current encounter status.",
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const checkCloseStatus = async () => {
    const key = requestKeyRef.current;
    if (busy || !key) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ receipt: OperationReceipt }>(
        operationReceiptPath(key),
      );
      if (
        result.receipt.operation_code !== "encounters.close" ||
        result.receipt.resource_id !== encounter.id
      ) {
        throw new Error(
          "The saved close status did not match this encounter. The outcome remains unconfirmed.",
        );
      }
      if (receiptResolution(200, result.receipt.outcome) === "committed") {
        await reconcileCommittedClose();
      } else {
        setCloseState("outcome_unconfirmed");
        setError(
          "The visit close is still unconfirmed. No automatic retry was made.",
        );
      }
    } catch (caught) {
      if (redirectIfUnauthorized(caught)) return;
      if (caught instanceof ApiError && caught.status === 404) {
        setCloseState("not_found");
        setError(
          "No saved result was found for this close attempt. The outcome remains unconfirmed and no automatic retry was made.",
        );
      } else if (
        closeFailureState(
          caught instanceof ApiError ? caught.status : undefined,
          caught instanceof ApiError ? caught.message : "",
          caught instanceof ApiError ? caught.code : undefined,
        ) === "rejected"
      ) {
        setCloseState("rejected");
        setError(
          caught instanceof Error
            ? caught.message
            : "The close status request was rejected.",
        );
      } else if (caught instanceof Error) {
        setCloseState("outcome_unconfirmed");
        setError(caught.message);
      } else {
        setCloseState("outcome_unconfirmed");
        setError("The close outcome remains unconfirmed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const resetCloseAttempt = () => {
    if (busy || !requestKeyRef.current) return;
    setConfirmation(null);
    requestKeyRef.current = null;
    setRequestKey(null);
    setCloseState("idle");
    setError("");
  };

  return (
    <Stack spacing={2}>
      <EncounterFollowUpPanel
        patient={patient}
        encounter={current}
        timezone={timezone}
        onChanged={completionResource.refresh}
      />
      <Paper
        id="chart-completion"
        variant="outlined"
        sx={{ p: 2, scrollMarginTop: 16 }}
      >
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle2">Visit completion review</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Confirm the recorded outcome, follow-up, patient information, and
              ownership of unfinished work before ending the encounter. This is
              not clinical discharge authorization.
            </Typography>
          </Box>
          {completionResource.error && (
            <Alert
              severity="error"
              action={
                <Button onClick={completionResource.refresh}>Retry</Button>
              }
            >
              The completion checklist could not be loaded.{" "}
              {completionResource.error}
            </Alert>
          )}
          {!completion && !completionResource.error && <LoadState />}
          {current.status === "completed" && review ? (
            <>
              <Alert severity="success" role="status" aria-live="polite">
                Completion review recorded and encounter ended{" "}
                {clinicDateTime(current.ended_at, timezone)}.
              </Alert>
              <Stack spacing={0.5} component="dl" sx={{ m: 0 }}>
                <Typography
                  component="dt"
                  variant="caption"
                  color="text.secondary"
                >
                  Recorded outcome
                </Typography>
                <Typography component="dd" sx={{ m: 0 }}>
                  {COMPLETION_DISPOSITION_LABELS[review.disposition_code]}
                </Typography>
                <Typography
                  component="dt"
                  variant="caption"
                  color="text.secondary"
                >
                  Follow-up
                </Typography>
                <Typography component="dd" sx={{ m: 0 }}>
                  {statusLabel(review.follow_up_state)}
                </Typography>
                <Typography
                  component="dt"
                  variant="caption"
                  color="text.secondary"
                >
                  Patient information
                </Typography>
                <Typography component="dd" sx={{ m: 0 }}>
                  {COMPLETION_INSTRUCTION_LABELS[review.instructions_status]} ·{" "}
                  {COMPLETION_EDUCATION_LABELS[review.education_status]}
                </Typography>
                <Typography
                  component="dt"
                  variant="caption"
                  color="text.secondary"
                >
                  Unfinished work retained
                </Typography>
                <Typography component="dd" sx={{ m: 0 }}>
                  {review.open_work_snapshot.length} open task
                  {review.open_work_snapshot.length === 1 ? "" : "s"}
                </Typography>
              </Stack>
            </>
          ) : current.status === "completed" ? (
            <Alert severity="warning">
              This encounter is closed without a linked completion review.
              Follow-up, instructions, education, and unfinished-work evidence
              must be reviewed separately.
            </Alert>
          ) : completion ? (
            <>
              {!completion.evidence.follow_up && (
                <Alert severity="warning">
                  Save the encounter follow-up disposition above before
                  completing the visit.
                </Alert>
              )}
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  select
                  fullWidth
                  label="Recorded visit outcome"
                  value={disposition}
                  onChange={(event) =>
                    setDisposition(
                      event.target
                        .value as EncounterCompletionReview["disposition_code"],
                    )
                  }
                  disabled={formLocked}
                >
                  <MenuItem value="" disabled>
                    Choose an outcome
                  </MenuItem>
                  {completion.options.disposition_codes.map((value) => (
                    <MenuItem key={value} value={value}>
                      {COMPLETION_DISPOSITION_LABELS[value]}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  fullWidth
                  label="Written instructions"
                  value={instructionsStatus}
                  onChange={(event) =>
                    setInstructionsStatus(
                      event.target
                        .value as EncounterCompletionReview["instructions_status"],
                    )
                  }
                  disabled={formLocked}
                >
                  <MenuItem value="" disabled>
                    Choose an instruction status
                  </MenuItem>
                  {completion.options.instructions_statuses.map((value) => (
                    <MenuItem key={value} value={value}>
                      {COMPLETION_INSTRUCTION_LABELS[value]}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  fullWidth
                  label="Education and teach-back"
                  value={educationStatus}
                  onChange={(event) =>
                    setEducationStatus(
                      event.target
                        .value as EncounterCompletionReview["education_status"],
                    )
                  }
                  disabled={formLocked}
                >
                  <MenuItem value="" disabled>
                    Choose an education status
                  </MenuItem>
                  {completion.options.education_statuses.map((value) => (
                    <MenuItem key={value} value={value}>
                      {COMPLETION_EDUCATION_LABELS[value]}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              <Alert
                severity={
                  completion.evidence.signed_instruction ||
                  instructionsStatus === "not_required"
                    ? "info"
                    : "warning"
                }
              >
                {completion.evidence.signed_instruction
                  ? `Signed written instructions are available from note revision ${completion.evidence.signed_instruction.revision_no}.`
                  : instructionsStatus === "not_required"
                    ? "Written instructions are not required for this visit."
                    : "No signed note revision with written patient instructions is available."}
              </Alert>
              <Alert
                severity={
                  completion.evidence.education_events.length ||
                  educationStatus === "not_required"
                    ? "info"
                    : "warning"
                }
              >
                {completion.evidence.education_events.length
                  ? `${completion.evidence.education_events.length} education record${completion.evidence.education_events.length === 1 ? "" : "s"} will be linked to this completion review.`
                  : educationStatus === "not_required"
                    ? "Education and teach-back are not required for this visit."
                    : "No education or teach-back record is available for this encounter."}
              </Alert>
              <Box>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={1}
                  sx={{
                    alignItems: { sm: "center" },
                    justifyContent: "space-between",
                  }}
                >
                  <Typography variant="subtitle2">
                    Unfinished work ownership
                  </Typography>
                  <Button
                    size="small"
                    onClick={completionResource.refresh}
                    disabled={formLocked}
                  >
                    Refresh checklist
                  </Button>
                </Stack>
                {completion.evidence.open_tasks.length ? (
                  <Stack component="ul" spacing={0.5} sx={{ pl: 3, mb: 1 }}>
                    {completion.evidence.open_tasks.map((task) => (
                      <Typography component="li" variant="body2" key={task.id}>
                        {statusLabel(task.task_kind)} ·{" "}
                        {statusLabel(task.state)} ·{" "}
                        {task.assigned_to_membership_id
                          ? "Assigned staff member"
                          : `${statusLabel(task.pool_code)} pool`}
                      </Typography>
                    ))}
                  </Stack>
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ my: 1 }}
                  >
                    No open encounter tasks are recorded.
                  </Typography>
                )}
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={openWorkReviewed}
                      onChange={(event) =>
                        setOpenWorkReviewed(event.target.checked)
                      }
                      disabled={formLocked}
                    />
                  }
                  label="I reviewed the current owner or pool for every unfinished item. These tasks remain open after encounter completion."
                />
              </Box>
              {exceptionRequired && (
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  label="Completion exception note"
                  value={exceptionNote}
                  onChange={(event) => setExceptionNote(event.target.value)}
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                  required
                  disabled={formLocked}
                  helperText="Record what happened and the immediate operational handoff. Do not copy the clinical note."
                />
              )}
            </>
          ) : null}
          {error && <ErrorMessage message={error} />}
          {closeState === "reconciling" && (
            <Box role="status" aria-live="polite" aria-atomic="true">
              Verifying the committed completion review against this patient and
              encounter…
            </Box>
          )}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            {current.status === "open" &&
              context.capabilities.encounters &&
              completion?.can_complete && (
                <Button
                  variant="contained"
                  color="warning"
                  onClick={() => {
                    setError("");
                    setConfirmation("close");
                  }}
                  disabled={formLocked || !completion.evidence.follow_up}
                >
                  {busy ? "Completing encounter…" : "Complete encounter"}
                </Button>
              )}
            {requestKey && closeState !== "committed" && (
              <Button
                variant="outlined"
                onClick={() => void checkCloseStatus()}
                disabled={busy}
              >
                {busy && closeState !== "closing"
                  ? "Checking completion status…"
                  : "Check completion status"}
              </Button>
            )}
            {requestKey && closeState !== "committed" && !busy && (
              <Button variant="text" onClick={() => setConfirmation("reset")}>
                Reset completion attempt
              </Button>
            )}
            <Button
              variant="outlined"
              onClick={() => window.location.assign("/clinic")}
            >
              Return to tracking board
            </Button>
            {current.status === "completed" &&
              context.capabilities.billing_read === true && (
                <Button
                  href={`/clinic/billing/patients?patient_id=${patient.id}&encounter_id=${current.id}`}
                  variant="contained"
                >
                  Continue to checkout
                </Button>
              )}
          </Stack>
        </Stack>
      </Paper>
      <Dialog
        open={confirmation !== null}
        onClose={() => !busy && setConfirmation(null)}
        maxWidth="sm"
        fullWidth
        aria-labelledby="encounter-close-title"
      >
        <DialogTitle id="encounter-close-title">
          {confirmation === "reset"
            ? "Reset completion attempt?"
            : "Complete encounter?"}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>
            {patient.display_name} · Encounter #{encounter.id}
          </Typography>
          <Typography color="text.secondary">
            {confirmation === "reset"
              ? "Resetting clears this local attempt. Verify the encounter and completion-review status before trying again."
              : "This records the completion review, ends the encounter, completes the linked appointment when applicable, and makes the visit eligible for checkout. Open tasks remain open with their recorded owner or pool."}
          </Typography>
          {confirmation === "close" && error && (
            <ErrorMessage message={error} />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmation(null)} disabled={busy}>
            Go back
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={busy}
            onClick={() =>
              confirmation === "reset" ? resetCloseAttempt() : void endVisit()
            }
          >
            {confirmation === "reset" ? "Reset attempt" : "Confirm completion"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function EncounterView({
  patient,
  encounter,
  observations,
  timezone,
  noteWorkspace,
}: {
  patient: Patient;
  encounter: EncounterDetail;
  observations: Observation[];
  timezone: string;
  noteWorkspace?: ReactNode;
}) {
  const reference = patientReferenceLabel(patient.reference);
  return (
    <>
      <a href={`/clinic/patients/${patient.id}`}>← {patient.display_name}</a>
      {noteWorkspace ? (
        <div className="care-encounter-workspace">{noteWorkspace}</div>
      ) : (
        <>
          <div className="care-heading">
            <div>
              <p className="eyebrow">ENCOUNTER #{encounter.id}</p>
              <h1>{patient.display_name}</h1>
              {reference && (
                <p className="clinic-lead">Reference: {reference}</p>
              )}
            </div>
            <span className="care-status care-status-large">
              {statusLabel(encounter.status)}
            </span>
          </div>
          <div className="care-summary">
            <div>
              <span>Started</span>
              <strong>{clinicDateTime(encounter.started_at, timezone)}</strong>
            </div>
            <div>
              <span>Ended</span>
              <strong>{clinicDateTime(encounter.ended_at, timezone)}</strong>
            </div>
            <div>
              <span>Participants</span>
              <strong>{encounter.participants.length}</strong>
            </div>
            <div>
              <span>Documents</span>
              <strong>{encounter.document_count}</strong>
            </div>
          </div>
          <div className="care-grid">
            <Card title="Recorded observations">
              {observations.length === 0 ? (
                <p>No observations are associated with this encounter.</p>
              ) : (
                <dl className="care-observations">
                  {observations.map((observation) => (
                    <div key={observation.id}>
                      <dt>{observationLabel(observation.code)}</dt>
                      <dd>
                        <strong>{observationValue(observation)}</strong>
                        <span>
                          {clinicDateTime(observation.observed_at, timezone)} ·{" "}
                          {observation.code_system}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="clinic-fine-print">
                Values are displayed as recorded. This interface does not infer
                normal ranges, readiness or clinical priority.
              </p>
            </Card>
            <Card title="Clinical note">
              <div className="care-blocked">
                <strong>Editor unavailable</strong>
                <span>The protected note workspace was not loaded.</span>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

export function EncounterPage({
  patientId,
  encounterId,
}: {
  patientId: string;
  encounterId: string;
}) {
  const context = useClinic();
  const patient = useResource<{ patient: Patient }>(
    `/api/clinic/patients/${patientId}?encounter_id=${encounterId}`,
  );
  const encounter = useResource<{ encounter: EncounterDetail }>(
    encounterDetailPath(patientId, encounterId),
    { retainDataOnRefresh: true },
  );
  const observations = useResource<{
    observations: Observation[];
    pagination: PageInfo;
  }>(
    `/api/clinic/patients/${patientId}/observations?encounter_id=${encounterId}`,
  );
  const careSummary = useResource<PatientCareSummary>(
    `/api/clinic/patients/${patientId}/care_summary?encounter_id=${encounterId}`,
  );
  const nurseWorkspace = useResource<NurseWorkspace>(
    `/api/clinic/patients/${patientId}/encounters/${encounterId}/nurse_workspace`,
    { retainDataOnRefresh: true },
  );
  const facilityRooms = useResource<{ rooms: FacilityRoom[] }>(
    "/api/clinic/facilities?type=rooms&per_page=100",
    { retainDataOnRefresh: true },
  );
  const error = patient.error || encounter.error || observations.error;
  if (!patient.data || !encounter.data || !observations.data)
    return <LoadState error={error} />;
  if (encounter.data.encounter.patient_id !== patient.data.patient.id)
    return (
      <ErrorMessage message="This encounter does not belong to the selected patient." />
    );
  return (
    <EncounterView
      patient={patient.data.patient}
      encounter={encounter.data.encounter}
      observations={observations.data.observations}
      timezone={context.practice.timezone}
      noteWorkspace={
        <ProviderEncounterWorkflow
          key={`${patientId}:${encounterId}`}
          patient={patient.data.patient}
          encounter={encounter.data.encounter}
          observations={observations.data.observations}
          timezone={context.practice.timezone}
          careSummaryState={
            careSummary.data
              ? { status: "ready", summary: careSummary.data }
              : careSummary.error
                ? { status: "error" }
                : { status: "loading" }
          }
          onEncounterRefresh={encounter.refresh}
          onCareSummaryRefresh={careSummary.refresh}
          nurseWorkspaceResource={nurseWorkspace}
          facilityRoomsResource={facilityRooms}
          noteWorkspace={
            <Box id="chart-signing" sx={{ scrollMarginTop: 16 }}>
              <SoapNoteWorkspace
                encounter={encounter.data.encounter}
                patientName={patient.data.patient.display_name}
                onChanged={encounter.refresh}
              />
            </Box>
          }
        />
      }
    />
  );
}
