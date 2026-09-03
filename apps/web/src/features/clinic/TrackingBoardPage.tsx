import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentPasteSearchIcon from "@mui/icons-material/ContentPasteSearch";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import NoteAltIcon from "@mui/icons-material/NoteAlt";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import PersonPinCircleOutlinedIcon from "@mui/icons-material/PersonPinCircleOutlined";
import { useClinic } from "./Workspace";
import type { ClinicTrackingBoard } from "../../api/contracts";
import { api, ApiError } from "../../api/client";
import { LoadState } from "../../shared/ui";
import {
  CareIndicators,
  CareSummaryTrigger,
  careIndicatorGroups,
  usePatientCareSummaries,
  type CareSummaryLoadState,
} from "./CareIndicators";
import { openSoapHref, previousChartHref } from "./chartNavigation";
import { EXAMPLE_CARE_SUMMARIES } from "./trackingBoardCareFixtures";
import {
  EXAMPLE_CLOCK,
  EXAMPLE_CLINICIANS,
  EXAMPLE_VISITS,
  VISIT_STAGES,
  clinicianLabel,
  cliniciansForLocation,
  durationLabel,
  elapsedMinutes,
  filterVisits,
  patientLabel,
  waitingMinutes,
  type BoardVisit,
  type ExampleClinician,
  type ExampleVitalStatus,
} from "./trackingBoardData";
import {
  assignBoardProvider,
  providerAssignmentRequestKey,
  trackingBoardVisitToBoardVisit,
} from "./trackingBoardApi";

const EMPTY_BOARD_VISITS: BoardVisit[] = [];

function fallbackCareSummaryState(visit: BoardVisit): CareSummaryLoadState {
  return visit.encounterId == null
    ? { status: "not_applicable" }
    : { status: "unlinked" };
}

function useTrackingBoard(active = true) {
  const [state, setState] = useState<{
    data?: ClinicTrackingBoard;
    error?: string;
    stale: boolean;
  }>({ stale: false });

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      setState((current) => ({
        ...current,
        error: undefined,
        stale: Boolean(current.data),
      }));
      void api<ClinicTrackingBoard>("/api/clinic/tracking_board", {
        signal: requestController.signal,
      })
        .then((data) => {
          if (!mounted) return;
          setState({ data, stale: false });
        })
        .catch((error: unknown) => {
          if (!mounted || requestController.signal.aborted) return;
          if (error instanceof ApiError && error.status === 401) {
            window.location.replace("/login");
            return;
          }
          setState((current) => ({
            ...current,
            error:
              error instanceof Error
                ? error.message
                : "Unable to refresh the tracking board.",
            stale: Boolean(current.data),
          }));
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      mounted = false;
      controller?.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [active]);

  return state;
}

function patientTableLabel(visit: BoardVisit) {
  const last = visit.lastName.trim() || "Unknown";
  const firstInitial = visit.firstName.trim().charAt(0);
  const identity =
    visit.patientDisplayName?.trim() ||
    `${last}, ${firstInitial ? `${firstInitial}.` : "—"}`;
  const demographics = [
    visit.age === null ? null : `${visit.age} yr`,
    visit.gender === "F"
      ? "Female"
      : visit.gender === "M"
        ? "Male"
        : visit.gender === "X"
          ? "Intersex"
          : null,
  ].filter(Boolean);
  return {
    identity,
    demographics: demographics.length
      ? demographics.join(" · ")
      : "Demographics not recorded",
  };
}

function vitalReadings(visit: BoardVisit) {
  const recorded = visit.triage?.readings;
  if (recorded) {
    const display = (reading: { value: string; unit: string | null } | null) =>
      reading
        ? `${reading.value}${reading.unit ? ` ${reading.unit}` : ""}`
        : "—";
    return {
      bp: {
        value: display(recorded.bp),
        status: recorded.bp
          ? (visit.triage?.vitalStatuses?.bp ?? "unassessed")
          : "unassessed",
      },
      hr: {
        value: display(recorded.hr),
        status: recorded.hr
          ? (visit.triage?.vitalStatuses?.hr ?? "unassessed")
          : "unassessed",
      },
      weight: {
        value: display(recorded.weight),
        status: recorded.weight
          ? (visit.triage?.vitalStatuses?.weight ?? "unassessed")
          : "unassessed",
      },
    };
  }
  const summary = visit.triage?.vitalsSummary;
  if (!summary) return null;
  const statuses = visit.triage?.vitalStatuses;
  const bp = summary.match(/BP\s+([0-9]+\/[0-9]+)/i)?.[1] ?? null;
  const hr = summary.match(/HR\s+([0-9]+)/i)?.[1] ?? null;
  const weight = summary.match(/([0-9]+(?:\.[0-9]+)?)\s*kg/i)?.[1] ?? null;
  return {
    bp: {
      value: bp ?? "—",
      status: bp ? (statuses?.bp ?? "unassessed") : "unassessed",
    },
    hr: {
      value: hr ? `${hr} bpm` : "—",
      status: hr ? (statuses?.hr ?? "unassessed") : "unassessed",
    },
    weight: {
      value: weight ? `${weight} kg` : "—",
      status: weight ? (statuses?.weight ?? "unassessed") : "unassessed",
    },
  };
}

export function formatClockTime(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Scheduled";
  try {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    });
  } catch {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });
  }
}

type ProviderAssignmentAttempt = {
  clinicianId: string | null;
  expectedToken: string | null;
  requestKey: string;
};

export function providerAssignmentAttempt(
  current: ProviderAssignmentAttempt | null,
  clinicianId: string | null,
  expectedToken: string | null,
  requestKey: () => string = providerAssignmentRequestKey,
) {
  return current?.clinicianId === clinicianId &&
    current.expectedToken === expectedToken
    ? current
    : { clinicianId, expectedToken, requestKey: requestKey() };
}

export function providerAssignmentFailure(error: unknown): {
  outcomeUnknown: boolean;
  reloadRequired: boolean;
  message: string;
} {
  if (error instanceof ApiError) {
    if (error.code === "outcome_unconfirmed" || error.status >= 500) {
      return {
        outcomeUnknown: true,
        reloadRequired: false,
        message:
          "Outcome not confirmed. Retry to reconcile this request, or reload the board.",
      };
    }
    if (error.status === 409) {
      return {
        outcomeUnknown: false,
        reloadRequired: true,
        message: "Assignment changed. Reload the board before trying again.",
      };
    }
    return {
      outcomeUnknown: false,
      reloadRequired: false,
      message: error.message,
    };
  }
  return {
    outcomeUnknown: true,
    reloadRequired: false,
    message:
      "Outcome not confirmed. Retry to reconcile this request, or reload the board.",
  };
}

function operationalTiming(visit: BoardVisit, now: string, timezone: string) {
  if (visit.appointmentStartsAt) {
    const startsAt = Date.parse(visit.appointmentStartsAt);
    const current = Date.parse(now);
    const offset =
      Number.isFinite(startsAt) && Number.isFinite(current)
        ? Math.floor((startsAt - current) / 60_000)
        : null;
    if (visit.operationalState === "upcoming")
      return {
        value: formatClockTime(visit.appointmentStartsAt, timezone),
        detail: offset === null ? "Scheduled" : `in ${durationLabel(offset)}`,
      };
    if (
      visit.operationalState === "on_time" ||
      visit.operationalState === "late"
    )
      return {
        value: formatClockTime(visit.appointmentStartsAt, timezone),
        detail:
          offset === null
            ? "Not checked in"
            : offset < 0
              ? `${durationLabel(Math.abs(offset))} ago`
              : "Due now",
      };
    if (visit.operationalState === "waiting_room") {
      const waiting = waitingMinutes(visit, now);
      return {
        value: formatClockTime(visit.appointmentStartsAt, timezone),
        detail:
          waiting === null ? "Checked in" : `${durationLabel(waiting)} wait`,
      };
    }
  }
  if (visit.operationalState === "upcoming")
    return {
      value: "Scheduled",
      detail: "Expected",
    };
  if (visit.operationalState === "waiting_room")
    return { value: "Checked in", detail: "Waiting room" };
  return null;
}

function operationalStatusLabel(visit: BoardVisit, now: string) {
  if (visit.operationalState === "upcoming") return "Expected";
  if (visit.operationalState === "on_time") return "Due now";
  if (visit.operationalState === "late") {
    const minutes = elapsedMinutes(visit.appointmentStartsAt ?? null, now);
    return minutes === null ? "Late" : `${durationLabel(minutes)} late`;
  }
  if (visit.operationalState === "waiting_room") return "Waiting room";
  return (
    VISIT_STAGES.find((stage) => stage.id === visit.stage)?.label ??
    "Not recorded"
  );
}

function operationalStatusClass(visit: BoardVisit) {
  if (visit.operationalState === "late") return "late";
  if (visit.operationalState === "waiting_room") return "waiting";
  if (
    visit.operationalState === "upcoming" ||
    visit.operationalState === "on_time"
  )
    return "scheduled";
  return visit.stage;
}

function statusIcon(visit: BoardVisit) {
  if (visit.operationalState === "late") return AccessTimeOutlinedIcon;
  if (
    visit.operationalState === "upcoming" ||
    visit.operationalState === "on_time"
  )
    return EventAvailableOutlinedIcon;
  if (visit.operationalState === "waiting_room")
    return PersonPinCircleOutlinedIcon;
  if (visit.stage === "unrecorded") return PendingActionsOutlinedIcon;
  return FactCheckOutlinedIcon;
}

function operationalSortMinutes(visit: BoardVisit, now: string) {
  const waiting = waitingMinutes(visit, now);
  if (waiting !== null) return waiting;
  if (!visit.appointmentStartsAt) return Number.NEGATIVE_INFINITY;
  const starts = Date.parse(visit.appointmentStartsAt);
  const current = Date.parse(now);
  if (!Number.isFinite(starts) || !Number.isFinite(current))
    return Number.NEGATIVE_INFINITY;
  const minutesFromStart = Math.floor((current - starts) / 60_000);
  return visit.operationalState === "upcoming"
    ? Math.min(-1, minutesFromStart)
    : Math.max(0, minutesFromStart);
}

const vitalStatusPresentation: Record<ExampleVitalStatus, { label: string }> = {
  above: { label: "Above normal limits" },
  within: { label: "Within normal limits" },
  below: { label: "Below normal limits" },
  unassessed: { label: "Not assessed" },
};

const membershipLabels = {
  member: "Member",
  nonmember: "Non-member",
  unknown: "Not verified",
};
type ColumnKey =
  | "patient"
  | "stage"
  | "wait"
  | "location"
  | "provider"
  | "reason"
  | "care"
  | "triage"
  | "action";
const initialColumns: ColumnKey[] = [
  "patient",
  "stage",
  "wait",
  "location",
  "provider",
  "reason",
  "care",
  "triage",
  "action",
];
const initialColumnWidths: Record<ColumnKey, number> = {
  patient: 240,
  stage: 175,
  wait: 130,
  location: 120,
  provider: 140,
  reason: 160,
  care: 180,
  triage: 150,
  action: 120,
};
const columnMinimumWidths: Record<ColumnKey, number> = {
  patient: 240,
  stage: 175,
  wait: 130,
  location: 120,
  provider: 140,
  reason: 150,
  care: 180,
  triage: 145,
  action: 120,
};
const columnLabels: Record<ColumnKey, string> = {
  patient: "Patient",
  stage: "Status",
  wait: "Timing",
  location: "Room",
  provider: "Provider",
  reason: "Reason",
  care: "Care",
  triage: "Vitals",
  action: "Action",
};
function ExampleVisitRow({
  visit,
  now,
  columns,
  striped,
  assignedClinicianId,
  providerAssignmentToken,
  careSummaryState,
  timezone,
  clinicians,
  onAssignClinician,
  onPersistProvider,
}: {
  visit: BoardVisit;
  now: string;
  columns: ColumnKey[];
  striped: boolean;
  assignedClinicianId: string | null;
  providerAssignmentToken: string | null;
  careSummaryState: CareSummaryLoadState;
  timezone: string;
  clinicians: readonly ExampleClinician[];
  onAssignClinician: (
    clinicianId: string | null,
    assignmentToken: string | null,
  ) => void;
  onPersistProvider?: (
    clinicianId: string | null,
    expectedToken: string | null,
    requestKey: string,
  ) => Promise<{ token: string | null }>;
}) {
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [assignmentPending, setAssignmentPending] = useState(false);
  const [assignmentReloadRequired, setAssignmentReloadRequired] =
    useState(false);
  const assignmentPendingRef = useRef(false);
  const [assignmentAttempt, setAssignmentAttempt] =
    useState<ProviderAssignmentAttempt | null>(null);
  const [draftClinicianId, setDraftClinicianId] = useState(
    assignedClinicianId ?? "",
  );
  const stage = VISIT_STAGES.find((s) => s.id === visit.stage)!;
  const label =
    visit.patientDisplayName || patientLabel(visit.firstName, visit.lastName);
  const tableLabel = patientTableLabel(visit);
  const availableClinicians = cliniciansForLocation(
    visit.locationId,
    clinicians,
  );
  const assignedClinician = clinicians.find(
    (clinician) => clinician.id === assignedClinicianId,
  );
  const assignedProviderLabel = assignedClinician
    ? clinicianLabel(assignedClinician)
    : assignedClinicianId
      ? visit.assignedProviderName
      : null;
  const providerEditable =
    visit.isSynthetic !== false || visit.providerAssignmentAvailable === true;
  const assignmentOutcomeUnknown =
    assignmentAttempt !== null && assignmentError !== null;
  const readings = vitalReadings(visit);
  const timing = operationalTiming(visit, now, timezone);
  const hasEncounter = visit.patientId != null && visit.encounterId != null;
  const hasPatient = visit.patientId != null;
  const primaryHref = hasEncounter
    ? openSoapHref(visit)
    : hasPatient
      ? `/clinic/patients/${visit.patientId}`
      : openSoapHref(visit);
  const primaryAction = hasEncounter
    ? "Open chart"
    : hasPatient
      ? "View patient"
      : "Select chart";
  const openProviderEditor = () => {
    if (!providerEditable) return;
    setAssignmentError(
      assignmentReloadRequired
        ? "Assignment changed. Reload the board before trying again."
        : null,
    );
    setAssignmentAttempt(null);
    setDraftClinicianId(assignedClinicianId ?? "");
    setProviderEditorOpen(true);
  };
  useEffect(() => {
    setAssignmentReloadRequired(false);
    setAssignmentAttempt(null);
  }, [assignedClinicianId, providerAssignmentToken]);
  return (
    <TableRow
      hover
      className={`tracking-visit${striped ? " tracking-visit-alt" : ""}`}
      data-stage={visit.stage}
    >
      {columns.map((column) =>
        column === "patient" ? (
          <TableCell
            key={column}
            component="th"
            scope="row"
            data-label={columnLabels[column]}
          >
            <div className="tracking-patient">
              <Tooltip title={membershipLabels[visit.membership]}>
                <Chip
                  size="small"
                  label={
                    visit.membership === "member"
                      ? "M"
                      : visit.membership === "nonmember"
                        ? "N"
                        : "?"
                  }
                  className={`tracking-membership-mark tracking-membership-${visit.membership}`}
                  aria-label={membershipLabels[visit.membership]}
                />
              </Tooltip>
              <div className="tracking-patient-details">
                <strong>{tableLabel.identity}</strong>
                {tableLabel.demographics && (
                  <Typography
                    variant="caption"
                    className="tracking-patient-demographics"
                    color="text.secondary"
                  >
                    {tableLabel.demographics}
                  </Typography>
                )}
              </div>
            </div>
          </TableCell>
        ) : column === "care" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            <CareIndicators
              state={careSummaryState}
              patientLabel={label}
              timezone={timezone}
            />
          </TableCell>
        ) : column === "stage" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            <Typography
              variant="body2"
              className={`tracking-status-label tracking-status-${operationalStatusClass(visit)}`}
              sx={{ fontWeight: 650 }}
            >
              {(() => {
                const Icon = statusIcon(visit);
                return <Icon fontSize="small" aria-hidden="true" />;
              })()}
              <span className="tracking-status-copy">
                <span>{operationalStatusLabel(visit, now)}</span>
                {(visit.operationalState === "on_time" ||
                  visit.operationalState === "late") && (
                  <small>Not checked in</small>
                )}
              </span>
            </Typography>
          </TableCell>
        ) : column === "wait" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            {timing ? (
              <>
                <Typography
                  variant="body2"
                  className="tracking-wait tracking-operational-timing"
                  sx={{ fontWeight: 650 }}
                >
                  {timing.value}
                </Typography>
                <Typography
                  variant="caption"
                  className="tracking-flow-stage"
                  color="text.secondary"
                >
                  {timing.detail}
                </Typography>
              </>
            ) : (
              <Typography
                variant="body2"
                className="tracking-wait"
                sx={{ fontWeight: 600 }}
              >
                {stage.id === "unrecorded"
                  ? "—"
                  : stage.waiting
                    ? durationLabel(waitingMinutes(visit, now))
                    : "In care"}
              </Typography>
            )}
            {!timing && (
              <Typography
                variant="caption"
                className="tracking-flow-stage"
                color="text.secondary"
              >
                {stage.action}
              </Typography>
            )}
          </TableCell>
        ) : column === "location" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            <Typography variant="body2" className="tracking-location-value">
              {visit.room ?? "Room not recorded"}
            </Typography>
          </TableCell>
        ) : column === "provider" ? (
          <Fragment key={column}>
            <TableCell
              className="tracking-provider-cell"
              data-label={columnLabels[column]}
              onDoubleClick={providerEditable ? openProviderEditor : undefined}
              title={
                providerEditable
                  ? "Double-click or select to assign"
                  : undefined
              }
            >
              {assignedProviderLabel ? (
                providerEditable ? (
                  <Tooltip title={assignedProviderLabel}>
                    <button
                      type="button"
                      className="tracking-provider-value"
                      onClick={openProviderEditor}
                      aria-label={`Assigned provider: ${assignedProviderLabel}. Change assignment.`}
                    >
                      {assignedProviderLabel}
                    </button>
                  </Tooltip>
                ) : (
                  <Typography
                    variant="body2"
                    className="tracking-provider-readonly"
                  >
                    {assignedProviderLabel}
                  </Typography>
                )
              ) : !providerEditable ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  aria-label="Provider not recorded"
                >
                  —
                </Typography>
              ) : (
                <button
                  type="button"
                  className="tracking-provider-empty"
                  onClick={openProviderEditor}
                >
                  Assign
                </button>
              )}
            </TableCell>
            {providerEditable && (
              <Dialog
                className="tracking-provider-dialog"
                open={providerEditorOpen}
                onClose={() => {
                  if (
                    !assignmentPendingRef.current &&
                    !assignmentOutcomeUnknown
                  )
                    setProviderEditorOpen(false);
                }}
                maxWidth="xs"
                fullWidth
                aria-labelledby={`provider-dialog-title-${visit.id}`}
              >
                <DialogTitle id={`provider-dialog-title-${visit.id}`}>
                  Assign provider
                </DialogTitle>
                <DialogContent
                  sx={{ display: "grid", gap: 2, pt: "8px !important" }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {tableLabel.identity} · {visit.room ?? "Room unassigned"}
                  </Typography>
                  <Box
                    component="label"
                    htmlFor={`provider-dialog-select-${visit.id}`}
                    sx={{ fontSize: 13, fontWeight: 600, mb: -1 }}
                  >
                    Provider
                  </Box>
                  <Box
                    component="select"
                    id={`provider-dialog-select-${visit.id}`}
                    autoFocus
                    value={draftClinicianId}
                    onChange={(event) => {
                      setDraftClinicianId(event.target.value);
                      setAssignmentAttempt(null);
                      setAssignmentError(null);
                    }}
                    disabled={
                      assignmentPending ||
                      assignmentOutcomeUnknown ||
                      assignmentReloadRequired
                    }
                    sx={{
                      width: "100%",
                      p: 1.25,
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 1,
                      bgcolor: "background.paper",
                      color: "text.primary",
                      font: "inherit",
                    }}
                  >
                    <option value="">Unassigned</option>
                    {assignedClinicianId &&
                      assignedProviderLabel &&
                      !availableClinicians.some(
                        (clinician) => clinician.id === assignedClinicianId,
                      ) && (
                        <option value={assignedClinicianId} disabled>
                          {assignedProviderLabel} (current)
                        </option>
                      )}
                    {availableClinicians.map((clinician) => (
                      <option key={clinician.id} value={clinician.id}>
                        {clinicianLabel(clinician)}
                      </option>
                    ))}
                  </Box>
                  {assignmentError && (
                    <Typography color="error" variant="body2" role="alert">
                      {assignmentError}
                    </Typography>
                  )}
                </DialogContent>
                <DialogActions>
                  <Button
                    disabled={assignmentPending || assignmentOutcomeUnknown}
                    onClick={() => {
                      setAssignmentAttempt(null);
                      setProviderEditorOpen(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="contained"
                    disabled={assignmentPending || assignmentReloadRequired}
                    onClick={() => {
                      if (assignmentPendingRef.current) return;
                      const clinicianId = draftClinicianId || null;
                      const attempt = providerAssignmentAttempt(
                        assignmentAttempt,
                        clinicianId,
                        providerAssignmentToken,
                      );
                      assignmentPendingRef.current = true;
                      setAssignmentPending(true);
                      setAssignmentAttempt(attempt);
                      setAssignmentError(null);
                      const save = onPersistProvider
                        ? onPersistProvider(
                            clinicianId,
                            providerAssignmentToken,
                            attempt.requestKey,
                          )
                        : Promise.resolve({
                            token: providerAssignmentToken,
                          });
                      void save
                        .then(({ token }) => {
                          onAssignClinician(clinicianId, token);
                          setAssignmentAttempt(null);
                          setProviderEditorOpen(false);
                        })
                        .catch((error: unknown) => {
                          const failure = providerAssignmentFailure(error);
                          if (!failure.outcomeUnknown) {
                            setAssignmentAttempt(null);
                          }
                          setAssignmentReloadRequired(failure.reloadRequired);
                          setAssignmentError(failure.message);
                        })
                        .finally(() => {
                          assignmentPendingRef.current = false;
                          setAssignmentPending(false);
                        });
                    }}
                  >
                    {assignmentPending
                      ? "Assigning…"
                      : assignmentOutcomeUnknown
                        ? "Retry assignment"
                        : "Assign provider"}
                  </Button>
                </DialogActions>
              </Dialog>
            )}
          </Fragment>
        ) : column === "reason" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            <div className="tracking-reason">
              <div>
                {visit.appointmentType !== "Recorded visit" &&
                  visit.chiefComplaint !== visit.reason && (
                    <Typography variant="caption" color="text.secondary">
                      {visit.appointmentType}
                    </Typography>
                  )}
                <Typography
                  variant="body2"
                  aria-label={
                    visit.chiefComplaint === "Reason not recorded"
                      ? "Reason not recorded"
                      : undefined
                  }
                >
                  {visit.chiefComplaint === "Reason not recorded"
                    ? "—"
                    : visit.chiefComplaint}
                </Typography>
              </div>
              {visit.appointmentType === "Follow-up" && (
                <Tooltip title="Open most recent signed chart">
                  <a
                    href={previousChartHref(visit)}
                    className="tracking-context-link"
                    aria-label={`Open most recent signed chart for ${label}`}
                  >
                    <ContentPasteSearchIcon
                      fontSize="medium"
                      aria-hidden="true"
                    />
                  </a>
                </Tooltip>
              )}
            </div>
          </TableCell>
        ) : column === "triage" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            {readings ? (
              <Box className="tracking-vitals" aria-label="Vital signs">
                {Object.entries(readings).map(([key, reading]) => {
                  const name =
                    key === "bp"
                      ? "Blood pressure"
                      : key === "hr"
                        ? "Heart rate"
                        : "Weight";
                  const presentation = vitalStatusPresentation[reading.status];
                  return (
                    <Box
                      key={key}
                      className={`tracking-vital tracking-vital-${reading.status}`}
                      aria-label={`${name}: ${reading.value}. ${presentation.label}.`}
                      title={presentation.label}
                    >
                      <Typography variant="caption" component="span">
                        {key === "bp" ? "BP" : key === "hr" ? "HR" : "Wt"}
                      </Typography>
                      <Typography
                        variant="body2"
                        component="span"
                        className="tracking-vital-value"
                      >
                        {reading.value}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            ) : (
              <Typography variant="body2" aria-label="Vitals not recorded">
                —
              </Typography>
            )}
          </TableCell>
        ) : column === "action" ? (
          <TableCell key={column} data-label={columnLabels[column]}>
            <CareSummaryTrigger
              state={careSummaryState}
              patientLabel={label}
              timezone={timezone}
              href={primaryHref}
              actionLabel={`${primaryAction} for ${label}`}
            >
              <NoteAltIcon fontSize="inherit" aria-hidden="true" />
              <span className="tracking-chart-action-label">
                {primaryAction}
              </span>
            </CareSummaryTrigger>
          </TableCell>
        ) : (
          <TableCell key={column} data-label={columnLabels[column]}>
            <Typography variant="body2">{stage.action}</Typography>
          </TableCell>
        ),
      )}
    </TableRow>
  );
}
export function TrackingBoardView({
  visits = EXAMPLE_VISITS,
  now = EXAMPLE_CLOCK,
  timezone = "UTC",
  synthetic = true,
  truncated = false,
  stale = false,
  refreshError,
  careSummaryStates,
  onPersistProvider,
  clinicians = EXAMPLE_CLINICIANS,
}: {
  visits?: readonly BoardVisit[];
  now?: string;
  timezone?: string;
  synthetic?: boolean;
  truncated?: boolean;
  stale?: boolean;
  refreshError?: string;
  careSummaryStates?: Record<string, CareSummaryLoadState>;
  onPersistProvider?: (
    visit: BoardVisit,
    clinicianId: string | null,
    expectedToken: string | null,
    requestKey: string,
  ) => Promise<{ token: string | null }>;
  clinicians?: readonly ExampleClinician[];
}) {
  const [stage, setStage] = useState("all");
  const [columns, setColumns] = useState<ColumnKey[]>(initialColumns);
  const [sortBy, setSortBy] = useState<ColumnKey>("wait");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [columnWidths, setColumnWidths] =
    useState<Record<ColumnKey, number>>(initialColumnWidths);
  const [providerAssignments, setProviderAssignments] = useState<
    Record<string, { clinicianId: string | null; token: string | null }>
  >(() =>
    Object.fromEntries(
      visits.map((visit) => [
        visit.id,
        {
          clinicianId: visit.assignedClinicianId,
          token: visit.providerAssignmentToken ?? null,
        },
      ]),
    ),
  );
  useEffect(() => {
    setProviderAssignments(
      Object.fromEntries(
        visits.map((visit) => [
          visit.id,
          {
            clinicianId: visit.assignedClinicianId,
            token: visit.providerAssignmentToken ?? null,
          },
        ]),
      ),
    );
  }, [visits]);
  const [resizingColumn, setResizingColumn] = useState<ColumnKey | null>(null);
  const syntheticCareSummaryStates = usePatientCareSummaries(
    synthetic ? visits : EMPTY_BOARD_VISITS,
    EXAMPLE_CARE_SUMMARIES,
  );
  const resolvedCareSummaryStates =
    careSummaryStates ?? syntheticCareSummaryStates;
  const resizeState = useRef<{
    column: ColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const filtered = filterVisits(visits, stage, "", "arrival", now);
  const sorted = [...filtered].sort((left, right) => {
    const value = (visit: BoardVisit) => {
      if (sortBy === "patient")
        return patientLabel(visit.firstName, visit.lastName);
      if (sortBy === "care")
        return careIndicatorGroups(
          resolvedCareSummaryStates[visit.id] ??
            fallbackCareSummaryState(visit),
        ).length;
      if (sortBy === "stage") return visit.stage;
      if (sortBy === "location") return visit.room ?? "Room not recorded";
      if (sortBy === "provider") {
        const clinician = clinicians.find(
          (item) => item.id === providerAssignments[visit.id]?.clinicianId,
        );
        return clinician
          ? clinicianLabel(clinician)
          : visit.assignedProviderName || "Unassigned";
      }
      if (sortBy === "reason") return visit.chiefComplaint;
      if (sortBy === "triage") return visit.triage?.summary ?? "Not recorded";
      if (sortBy === "action")
        return visit.encounterId == null ? "View patient" : "Open chart";
      if (sortBy === "wait") return operationalSortMinutes(visit, now);
      return "";
    };
    const comparison =
      typeof value(left) === "number" && typeof value(right) === "number"
        ? (value(left) as number) - (value(right) as number)
        : String(value(left)).localeCompare(String(value(right)));
    return (
      (sortDirection === "asc" ? comparison : -comparison) ||
      left.id.localeCompare(right.id)
    );
  });
  const hasVitalReadings = sorted.some(
    (visit) => vitalReadings(visit) !== null,
  );
  const hasClassifiedVitalReadings = sorted.some((visit) => {
    const readings = vitalReadings(visit);
    return (
      readings !== null &&
      Object.values(readings).some((reading) => reading.status !== "unassessed")
    );
  });
  const sortColumn = (column: ColumnKey) => {
    if (sortBy === column)
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortBy(column);
      setSortDirection("asc");
    }
  };
  const moveColumn = (from: ColumnKey, to: ColumnKey) => {
    if (from === to) return;
    setColumns((current) => {
      const next = [...current];
      const fromIndex = next.indexOf(from);
      const toIndex = next.indexOf(to);
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, from);
      return next;
    });
  };
  const toggleColumn = (column: ColumnKey) => {
    setColumns((current) => {
      if (current.includes(column))
        return current.length === 1
          ? current
          : current.filter((item) => item !== column);
      return initialColumns.filter(
        (item) => current.includes(item) || item === column,
      );
    });
  };
  const resizeColumnFromPointer = (
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    const current = resizeState.current;
    if (!current) return;
    const nextWidth = Math.max(
      columnMinimumWidths[current.column],
      Math.min(600, current.startWidth + event.clientX - current.startX),
    );
    setColumnWidths((widths) => ({
      ...widths,
      [current.column]: nextWidth,
    }));
  };
  const finishColumnResize = () => {
    resizeState.current = null;
    setResizingColumn(null);
  };
  const resizeColumnWithKeyboard = (column: ColumnKey, delta: number) => {
    setColumnWidths((widths) => ({
      ...widths,
      [column]: Math.max(
        columnMinimumWidths[column],
        Math.min(600, widths[column] + delta),
      ),
    }));
  };
  const tableWidth = columns.reduce(
    (total, column) => total + columnWidths[column],
    0,
  );
  const stageOptions = [{ id: "all", label: "All visits" }, ...VISIT_STAGES];
  return (
    <section className="tracking-board" aria-label="Tracking Board">
      <header className="tracking-board-header">
        <div>
          <h1>Today’s patient flow</h1>
        </div>
        <div className="tracking-freshness" role="status">
          <span className="tracking-freshness-dot" aria-hidden="true" />
          {stale
            ? "Last confirmed snapshot"
            : `Updated ${formatClockTime(now, timezone)}`}
        </div>
      </header>
      {!synthetic && truncated && (
        <p className="tracking-data-warning" role="alert">
          Incomplete result: this projection is capped at 200 rows. Additional
          appointments or encounters are not shown.
        </p>
      )}
      {!synthetic && stale && (
        <p className="tracking-data-warning" role="status">
          Showing the last confirmed snapshot; wait times are frozen until a
          refresh succeeds.
        </p>
      )}
      {!synthetic && refreshError && (
        <p className="tracking-data-warning" role="alert">
          Board refresh failed: {refreshError} The last confirmed snapshot is
          still shown.
        </p>
      )}
      <div
        className="tracking-stage-filters"
        aria-label="Filter visits by stage"
      >
        {stageOptions.map((s) => (
          <button
            type="button"
            key={s.id}
            aria-pressed={stage === s.id}
            onClick={() => setStage(s.id)}
          >
            <span>{s.label}</span>
            <strong>
              {s.id === "all"
                ? visits.length
                : visits.filter((v) => v.stage === s.id).length}
            </strong>
          </button>
        ))}
      </div>
      <div className="tracking-tools">
        <div className="tracking-stage-select">
          <label htmlFor="board-stage">Visit stage</label>
          <select
            id="board-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            {stageOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} (
                {s.id === "all"
                  ? visits.length
                  : visits.filter((v) => v.stage === s.id).length}
                )
              </option>
            ))}
          </select>
        </div>
        <details className="tracking-column-selector">
          <summary>Columns</summary>
          <div role="group" aria-label="Choose tracking board columns">
            {initialColumns.map((column) => (
              <label key={column}>
                <input
                  type="checkbox"
                  checked={columns.includes(column)}
                  disabled={columns.length === 1 && columns[0] === column}
                  onChange={() => toggleColumn(column)}
                />
                {columnLabels[column]}
              </label>
            ))}
          </div>
        </details>
      </div>
      <TableContainer
        component={Paper}
        variant="outlined"
        className="tracking-table-container"
      >
        <Table
          stickyHeader
          aria-label="Clinic patient tracking board"
          className="tracking-table"
          style={{
            width: tableWidth,
            minWidth: tableWidth,
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            {columns.map((column) => (
              <col key={column} style={{ width: columnWidths[column] }} />
            ))}
          </colgroup>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (draggedColumn) moveColumn(draggedColumn, column);
                    setDraggedColumn(null);
                  }}
                >
                  <div className="tracking-column-heading">
                    <TableSortLabel
                      active={sortBy === column}
                      direction={sortBy === column ? sortDirection : "asc"}
                      onClick={() => sortColumn(column)}
                    >
                      {columnLabels[column]}
                    </TableSortLabel>
                    <span
                      className="tracking-column-move"
                      draggable
                      role="button"
                      tabIndex={0}
                      aria-label={`Move ${columnLabels[column]} column`}
                      title={`Drag to move ${columnLabels[column]}`}
                      onDragStart={() => setDraggedColumn(column)}
                      onDragEnd={() => setDraggedColumn(null)}
                      onKeyDown={(event) => {
                        if (
                          event.key === "ArrowLeft" ||
                          event.key === "ArrowRight"
                        ) {
                          event.preventDefault();
                          const index = columns.indexOf(column);
                          const target =
                            event.key === "ArrowLeft"
                              ? columns[index - 1]
                              : columns[index + 1];
                          if (target) moveColumn(column, target);
                        }
                      }}
                    >
                      <DragIndicatorIcon fontSize="small" aria-hidden="true" />
                    </span>
                  </div>
                  <span
                    className={`tracking-column-resize${resizingColumn === column ? " is-resizing" : ""}`}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${columnLabels[column]} column`}
                    aria-valuemin={columnMinimumWidths[column]}
                    aria-valuemax={600}
                    aria-valuenow={columnWidths[column]}
                    tabIndex={0}
                    draggable={false}
                    onPointerDown={(
                      event: ReactPointerEvent<HTMLSpanElement>,
                    ) => {
                      event.preventDefault();
                      event.stopPropagation();
                      resizeState.current = {
                        column,
                        startX: event.clientX,
                        startWidth: columnWidths[column],
                      };
                      setResizingColumn(column);
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                    }}
                    onPointerMove={resizeColumnFromPointer}
                    onPointerUp={finishColumnResize}
                    onPointerCancel={finishColumnResize}
                    onKeyDown={(event) => {
                      if (
                        event.key === "ArrowLeft" ||
                        event.key === "ArrowRight"
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        resizeColumnWithKeyboard(
                          column,
                          event.key === "ArrowLeft" ? -10 : 10,
                        );
                      }
                    }}
                  />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((visit, index) => (
              <ExampleVisitRow
                key={visit.id}
                visit={visit}
                now={now}
                columns={columns}
                striped={index % 2 === 1}
                assignedClinicianId={
                  providerAssignments[visit.id]?.clinicianId ?? null
                }
                providerAssignmentToken={
                  providerAssignments[visit.id]?.token ?? null
                }
                careSummaryState={
                  resolvedCareSummaryStates[visit.id] ??
                  fallbackCareSummaryState(visit)
                }
                timezone={timezone}
                clinicians={clinicians}
                onAssignClinician={(clinicianId, token) =>
                  setProviderAssignments((current) => ({
                    ...current,
                    [visit.id]: { clinicianId, token },
                  }))
                }
                onPersistProvider={
                  onPersistProvider
                    ? (clinicianId, expectedToken, requestKey) =>
                        onPersistProvider(
                          visit,
                          clinicianId,
                          expectedToken,
                          requestKey,
                        )
                    : undefined
                }
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {columns.includes("triage") &&
        hasVitalReadings &&
        hasClassifiedVitalReadings && (
          <div
            className="tracking-vitals-legend"
            aria-label="Vital status legend"
          >
            {(["above", "within", "below"] as const).map((status) => (
              <span key={status} className={`tracking-legend-${status}`}>
                <i
                  className="tracking-vitals-legend-swatch"
                  aria-hidden="true"
                />
                {vitalStatusPresentation[status].label}
              </span>
            ))}
          </div>
        )}
      {filtered.length === 0 && (
        <div className="tracking-empty">
          <h2>
            {visits.length
              ? "No visits match these filters"
              : synthetic
                ? "No visits"
                : "No current visits"}
          </h2>
          <p>
            {visits.length
              ? "Try another stage or clear the stage filter."
              : "No visits are currently shown."}
          </p>
          {visits.length > 0 && (
            <button
              className="button"
              type="button"
              onClick={() => setStage("all")}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </section>
  );
}
export function OverviewView({
  patientAccess,
  timezone = "UTC",
}: {
  patientAccess: boolean;
  timezone?: string;
}) {
  if (!patientAccess)
    return (
      <section>
        <h1>Clinic overview</h1>
        <p>
          Patient tracking is available to assigned patient-workspace users.
        </p>
        <a href="/clinic/operations" className="text-link">
          Open Operations →
        </a>
      </section>
    );
  return <TrackingBoardView timezone={timezone} />;
}
export function Overview({ active = true }: { active?: boolean }) {
  const clinic = useClinic();
  if (!clinic.capabilities.patients)
    return (
      <OverviewView patientAccess={false} timezone={clinic.practice.timezone} />
    );
  return <TrackingBoardPage active={active} />;
}

export function TrackingBoardPage({ active = true }: { active?: boolean }) {
  const clinic = useClinic();
  const { data, error, stale } = useTrackingBoard(active);
  const eligibleClinicians = useMemo<ExampleClinician[]>(
    () =>
      (data?.eligible_providers ?? []).map((provider) => {
        return {
          id: `api-provider-${provider.clinician_profile_id}`,
          firstName: "",
          lastName: "",
          credentials: "",
          displayName: provider.display_name,
          locationIds: provider.site_ids.map((id) => `api-site-${id}`),
        };
      }),
    [data?.eligible_providers],
  );
  const visits = useMemo(
    () =>
      data?.visits.map((visit) => ({
        ...trackingBoardVisitToBoardVisit(visit),
        providerAssignmentAvailable:
          clinic.capabilities.encounters_assign_provider === true &&
          visit.provider_assignment_available === true,
      })) ?? [],
    [clinic.capabilities.encounters_assign_provider, data?.visits],
  );
  const careSummaryStates = useMemo<Record<string, CareSummaryLoadState>>(
    () =>
      Object.fromEntries(
        (data?.visits ?? []).map((visit) => [
          `${visit.row_type}-${visit.id}`,
          visit.care_summary
            ? { status: "ready", summary: visit.care_summary }
            : visit.row_type === "appointment"
              ? { status: "not_applicable" }
              : { status: "unlinked" },
        ]),
      ),
    [data?.visits],
  );
  if (!data) return <LoadState error={error} />;
  return (
    <TrackingBoardView
      visits={visits}
      now={data.as_of}
      timezone={clinic.practice.timezone}
      synthetic={false}
      truncated={data.truncated}
      stale={stale}
      refreshError={error}
      careSummaryStates={careSummaryStates}
      clinicians={eligibleClinicians}
      onPersistProvider={async (
        visit,
        clinicianId,
        expectedToken,
        requestKey,
      ) => {
        if (!visit.encounterId || !visit.patientId)
          throw new Error("Provider assignment is unavailable for this row.");
        const response = await assignBoardProvider(
          visit.encounterId,
          visit.patientId,
          clinicianId ? clinicianId.replace("api-provider-", "") : null,
          expectedToken,
          requestKey,
        );
        return { token: response.assignment.token };
      }}
    />
  );
}
