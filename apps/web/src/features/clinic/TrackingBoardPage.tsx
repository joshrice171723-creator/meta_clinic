import {
  Fragment,
  memo,
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
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import FactCheckOutlinedIcon from "@mui/icons-material/FactCheckOutlined";
import MeetingRoomOutlinedIcon from "@mui/icons-material/MeetingRoomOutlined";
import NoteAltIcon from "@mui/icons-material/NoteAlt";
import PendingActionsOutlinedIcon from "@mui/icons-material/PendingActionsOutlined";
import { useClinic } from "./Workspace";
import { useClinicRealtimeTopic } from "./ClinicRealtime";
import type { ClinicTrackingBoard } from "../../api/contracts";
import { api, ApiError, currentLoginDestination } from "../../api/client";
import { LoadState } from "../../shared/ui";
import {
  CareIndicators,
  CareSummaryTrigger,
  careIndicatorGroups,
  type CareSummaryLoadState,
} from "./CareIndicators";
import { openSoapHref, previousChartHref } from "./chartNavigation";
import { WaitingPolicyStatus } from "./WaitingPolicyStatus";
import {
  VISIT_STAGES,
  clinicianLabel,
  cliniciansForLocation,
  durationLabel,
  elapsedMinutes,
  filterVisits,
  patientLabel,
  waitingMinutes,
  type BoardClinician,
  type BoardVisit,
  type BoardChartStatus,
  type BoardVitalStatus,
} from "./trackingBoardData";
import {
  assignBoardProvider,
  claimBoardIntake,
  intakeOwnershipRequestKey,
  providerAssignmentRequestKey,
  releaseBoardIntake,
  trackingBoardOperationMetadata,
  trackingBoardVisitToBoardVisit,
  type BoardOperationMetadata,
} from "./trackingBoardApi";

const EMPTY_CARE_SUMMARY_STATES: Record<string, CareSummaryLoadState> = {};

type ChartActionTone = BoardChartStatus;
type OperationalBoardVisit = BoardVisit & {
  operations?: BoardOperationMetadata;
};
const EMPTY_OPERATION_METADATA: BoardOperationMetadata = {
  intakeOwnership: null,
  canClaimIntake: false,
  exceptions: [],
};

export function chartActionPresentation(
  status: BoardChartStatus,
  fallback: "open" | "patient" | "select",
): { label: string; tone: ChartActionTone } {
  if (status === "unopened") return { label: "Start new Chart", tone: status };
  if (status === "draft") return { label: "Open Draft", tone: status };
  if (status === "signed") return { label: "Open Chart", tone: status };

  return {
    label:
      fallback === "open"
        ? "Open chart"
        : fallback === "patient"
          ? "View patient"
          : "Select chart",
    tone: status,
  };
}

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
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const reload = () => setRefreshRevision((revision) => revision + 1);
  useClinicRealtimeTopic("tracking_board", reload, {
    enabled: active,
    fallbackIntervalMs: 45_000,
    freshnessIntervalMs: 45_000,
  });

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const requestController = new AbortController();
      controller = requestController;
      setRefreshing(true);
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
            window.location.replace(
              `/login?next=${encodeURIComponent(currentLoginDestination())}`,
            );
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
        })
        .finally(() => {
          if (mounted && !requestController.signal.aborted)
            setRefreshing(false);
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      mounted = false;
      controller?.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [active, refreshRevision]);

  return { ...state, reload, refreshing };
}

function patientTableLabel(visit: BoardVisit) {
  const identity =
    visit.patientDisplayName?.trim() ||
    [visit.firstName.trim(), visit.lastName.trim()].filter(Boolean).join(" ") ||
    "Patient name not recorded";
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

export function formatBoardDate(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  };
  try {
    return new Intl.DateTimeFormat("en-US", options).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: "UTC",
    }).format(date);
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
    return EventOutlinedIcon;
  if (visit.operationalState === "waiting_room") return MeetingRoomOutlinedIcon;
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

const vitalStatusPresentation: Record<BoardVitalStatus, { label: string }> = {
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
const allColumns: ColumnKey[] = [
  "location",
  "patient",
  "reason",
  "care",
  "triage",
  "provider",
  "wait",
  "stage",
  "action",
];
const initialColumns: ColumnKey[] = [
  "location",
  "patient",
  "action",
  "reason",
  "triage",
  "care",
  "provider",
  "wait",
];
const trackingBoardColumnsStorageKey = "apply.tracking-board.columns.v2";

export function filterVisitsForClinician(
  visits: readonly BoardVisit[],
  clinicianId: string | null | undefined,
) {
  return clinicianId
    ? visits.filter((visit) => visit.assignedClinicianId === clinicianId)
    : [];
}

type TrackingBoardFilterState = {
  patientFilter: "all" | "mine";
  stage: string;
};

export function trackingBoardFilterSelection(
  current: TrackingBoardFilterState,
  selection: string,
): TrackingBoardFilterState {
  if (selection === "mine") {
    return {
      ...current,
      patientFilter: current.patientFilter === "mine" ? "all" : "mine",
    };
  }
  if (selection === "all") return { patientFilter: "all", stage: "all" };
  return { ...current, stage: selection };
}

function storedTrackingBoardColumns(): ColumnKey[] {
  if (typeof window === "undefined") return initialColumns;
  try {
    const value = JSON.parse(
      window.localStorage.getItem(trackingBoardColumnsStorageKey) ?? "null",
    );
    if (!Array.isArray(value)) return initialColumns;
    const valid = value.filter((column): column is ColumnKey =>
      allColumns.includes(column),
    );
    if (!valid.length) return initialColumns;
    return valid.includes("action") ? valid : [...valid, "action"];
  } catch {
    return initialColumns;
  }
}
const initialColumnWidths: Record<ColumnKey, number> = {
  patient: 180,
  stage: 175,
  wait: 130,
  location: 120,
  provider: 140,
  reason: 160,
  care: 180,
  triage: 204,
  action: 120,
};
const columnLabels: Record<ColumnKey, string> = {
  patient: "Patient",
  stage: "Status",
  wait: "Timing",
  location: "Room",
  provider: "Provider",
  reason: "Visit reason",
  care: "Care",
  triage: "Vitals",
  action: "Action",
};
function TrackingBoardRow({
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
  onClaimIntake,
  onReleaseIntake,
}: {
  visit: OperationalBoardVisit;
  now: string;
  columns: ColumnKey[];
  striped: boolean;
  assignedClinicianId: string | null;
  providerAssignmentToken: string | null;
  careSummaryState: CareSummaryLoadState;
  timezone: string;
  clinicians: readonly BoardClinician[];
  onAssignClinician: (
    clinicianId: string | null,
    assignmentToken: string | null,
  ) => void;
  onPersistProvider?: (
    clinicianId: string | null,
    expectedToken: string | null,
    requestKey: string,
  ) => Promise<{ token: string | null }>;
  onClaimIntake?: (
    visit: OperationalBoardVisit,
    expectedToken: string | null,
    requestKey: string,
  ) => Promise<void>;
  onReleaseIntake?: (
    visit: OperationalBoardVisit,
    expectedToken: string,
    requestKey: string,
  ) => Promise<void>;
}) {
  const [providerEditorOpen, setProviderEditorOpen] = useState(false);
  const [waitingDetailsOpen, setWaitingDetailsOpen] = useState(false);
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
  const [intakeAction, setIntakeAction] = useState<"claim" | "release" | null>(
    null,
  );
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const operations = visit.operations ?? EMPTY_OPERATION_METADATA;
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
  const providerEditable = visit.providerAssignmentAvailable === true;
  const assignmentOutcomeUnknown =
    assignmentAttempt !== null && assignmentError !== null;
  const assignmentUnchanged = draftClinicianId === (assignedClinicianId ?? "");
  const readings = vitalReadings(visit);
  const timing = operationalTiming(visit, now, timezone);
  const hasEncounter = visit.patientId != null && visit.encounterId != null;
  const hasPatient = visit.patientId != null;
  const intakeClaimed = operations.intakeOwnership?.state === "claimed";
  const primaryHref = hasEncounter
    ? `${openSoapHref(visit)}${intakeClaimed ? "?focus=nurse-workspace" : ""}`
    : hasPatient
      ? `/clinic/patients/${visit.patientId}`
      : openSoapHref(visit);
  const chartAction = chartActionPresentation(
    visit.chartStatus,
    hasEncounter ? "open" : hasPatient ? "patient" : "select",
  );
  const primaryAction = intakeClaimed ? "Continue intake" : chartAction.label;
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
            className="tracking-patient-cell"
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
                <Typography
                  variant="caption"
                  className="tracking-patient-visit-context"
                  color="text.secondary"
                >
                  {visit.visitType} · {stage.label} ·{" "}
                  {visit.owner ?? "Owner unassigned"}
                </Typography>
                {tableLabel.demographics && (
                  <Typography
                    variant="caption"
                    className="tracking-patient-demographics"
                    color="text.secondary"
                  >
                    {tableLabel.demographics}
                    {visit.patientReference &&
                      ` · Patient reference: ${visit.patientReference}`}{" "}
                    · Visit reference: {visit.id}
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
            <Tooltip title={operationalStatusLabel(visit, now)}>
              <Box
                component="span"
                className={`tracking-status-label tracking-status-${operationalStatusClass(visit)}`}
                role="img"
                tabIndex={0}
                aria-label={operationalStatusLabel(visit, now)}
              >
                {(() => {
                  const Icon = statusIcon(visit);
                  return <Icon fontSize="small" aria-hidden="true" />;
                })()}
                <span>{operationalStatusLabel(visit, now)}</span>
              </Box>
            </Tooltip>
            {visit.waitingPolicy &&
              visit.waitingPolicy.state !== "not_applicable" && (
                <>
                  <Button
                    size="small"
                    onClick={() => setWaitingDetailsOpen(true)}
                    aria-label={`Waiting review details for ${label}`}
                  >
                    Waiting review
                  </Button>
                  <Dialog
                    open={waitingDetailsOpen}
                    onClose={() => setWaitingDetailsOpen(false)}
                    aria-labelledby={`waiting-policy-title-${visit.id}`}
                    maxWidth="sm"
                    fullWidth
                  >
                    <DialogTitle id={`waiting-policy-title-${visit.id}`}>
                      Waiting review · {label}
                    </DialogTitle>
                    <DialogContent>
                      <WaitingPolicyStatus projection={visit.waitingPolicy} />
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={() => setWaitingDetailsOpen(false)}>
                        Close
                      </Button>
                    </DialogActions>
                  </Dialog>
                </>
              )}
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
                    <Button
                      type="button"
                      variant="text"
                      className="tracking-provider-value"
                      onClick={openProviderEditor}
                      aria-label={`Assigned provider: ${assignedProviderLabel}. Change assignment.`}
                    >
                      {assignedProviderLabel}
                    </Button>
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
                  Provider not recorded
                </Typography>
              ) : (
                <Button
                  type="button"
                  variant="outlined"
                  className="tracking-provider-empty"
                  onClick={openProviderEditor}
                  aria-label={`Assign provider for ${label}`}
                >
                  Assign
                </Button>
              )}
              {(operations.intakeOwnership ||
                operations.exceptions.length > 0 ||
                operations.canClaimIntake) && (
                <Box className="tracking-intake-ownership">
                  {operations.intakeOwnership && (
                    <Typography variant="caption" color="text.secondary">
                      Intake: {operations.intakeOwnership.ownerName}
                      {operations.intakeOwnership.state === "stale"
                        ? " · lease expired"
                        : " · claimed"}
                    </Typography>
                  )}
                  {operations.exceptions.map((exception) => (
                    <Typography
                      key={exception.code}
                      variant="caption"
                      color="error"
                    >
                      {exception.message}
                    </Typography>
                  ))}
                  {operations.intakeOwnership?.canRelease &&
                    onReleaseIntake && (
                      <Button
                        size="small"
                        disabled={intakeAction !== null}
                        onClick={() => {
                          const ownership = operations.intakeOwnership;
                          if (!ownership) return;
                          setIntakeAction("release");
                          setIntakeError(null);
                          void onReleaseIntake(
                            visit,
                            ownership.token,
                            intakeOwnershipRequestKey(),
                          )
                            .catch((error: unknown) =>
                              setIntakeError(
                                error instanceof Error
                                  ? error.message
                                  : "Unable to release intake work.",
                              ),
                            )
                            .finally(() => setIntakeAction(null));
                        }}
                      >
                        {intakeAction === "release"
                          ? "Releasing…"
                          : "Release intake"}
                      </Button>
                    )}
                  {operations.canClaimIntake && onClaimIntake && (
                    <Button
                      size="small"
                      disabled={intakeAction !== null}
                      onClick={() => {
                        setIntakeAction("claim");
                        setIntakeError(null);
                        void onClaimIntake(
                          visit,
                          operations.intakeOwnership?.token ?? null,
                          intakeOwnershipRequestKey(),
                        )
                          .catch((error: unknown) =>
                            setIntakeError(
                              error instanceof Error
                                ? error.message
                                : "Unable to claim intake work.",
                            ),
                          )
                          .finally(() => setIntakeAction(null));
                      }}
                    >
                      {intakeAction === "claim" ? "Claiming…" : "Claim intake"}
                    </Button>
                  )}
                  {intakeError && (
                    <Typography variant="caption" color="error" role="alert">
                      {intakeError}
                    </Typography>
                  )}
                </Box>
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
                    {tableLabel.identity} · Visit reference: {visit.id} ·{" "}
                    {visit.room ?? "Room unassigned"}
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
                  {assignmentUnchanged && !assignmentError && (
                    <Typography variant="caption" color="text.secondary">
                      Choose a different provider to save changes.
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
                    disabled={
                      assignmentPending ||
                      assignmentReloadRequired ||
                      assignmentUnchanged
                    }
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
              <Typography variant="body2">
                {visit.reason === "Visit reason not recorded"
                  ? "—"
                  : visit.reason}
              </Typography>
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
                      <span className="tracking-vital-state" aria-hidden="true">
                        {reading.status === "above"
                          ? "↑"
                          : reading.status === "below"
                            ? "↓"
                            : reading.status === "within"
                              ? "✓"
                              : "·"}
                      </span>
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
            <Tooltip title={primaryAction} placement="top">
              <CareSummaryTrigger
                state={careSummaryState}
                patientLabel={label}
                timezone={timezone}
                href={primaryHref}
                actionLabel={`${primaryAction} for ${label}`}
              >
                <NoteAltIcon
                  fontSize="inherit"
                  className={`tracking-chart-action-icon tracking-chart-action-icon-${chartAction.tone}`}
                  aria-hidden="true"
                />
              </CareSummaryTrigger>
            </Tooltip>
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
  visits,
  now,
  timezone,
  myClinicianId = null,
  truncated = false,
  stale = false,
  refreshError,
  onReload,
  reloading = false,
  careSummaryStates,
  onPersistProvider,
  onClaimIntake,
  onReleaseIntake,
  clinicians = [],
}: {
  visits: readonly OperationalBoardVisit[];
  now: string;
  timezone: string;
  myClinicianId?: string | null;
  truncated?: boolean;
  stale?: boolean;
  refreshError?: string;
  onReload?: () => void;
  reloading?: boolean;
  careSummaryStates?: Record<string, CareSummaryLoadState>;
  onPersistProvider?: (
    visit: OperationalBoardVisit,
    clinicianId: string | null,
    expectedToken: string | null,
    requestKey: string,
  ) => Promise<{ token: string | null }>;
  onClaimIntake?: (
    visit: OperationalBoardVisit,
    expectedToken: string | null,
    requestKey: string,
  ) => Promise<void>;
  onReleaseIntake?: (
    visit: OperationalBoardVisit,
    expectedToken: string,
    requestKey: string,
  ) => Promise<void>;
  clinicians?: readonly BoardClinician[];
}) {
  const boardParams = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  const requestedStage = boardParams.get("stage") || "all";
  const initialStage =
    requestedStage === "all" ||
    VISIT_STAGES.some((item) => item.id === requestedStage)
      ? requestedStage
      : "all";
  const [stage, setStage] = useState(initialStage);
  const [patientFilter, setPatientFilter] = useState<"all" | "mine">(
    boardParams.get("patient") === "mine" ? "mine" : "all",
  );
  const routeInitialized = useRef(false);
  const [columns, setColumns] = useState<ColumnKey[]>(
    storedTrackingBoardColumns,
  );
  const [sortBy, setSortBy] = useState<ColumnKey>("wait");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [draggedColumn, setDraggedColumn] = useState<ColumnKey | null>(null);
  const [columnWidths, setColumnWidths] =
    useState<Record<ColumnKey, number>>(initialColumnWidths);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (stage === "all") params.delete("stage");
    else params.set("stage", stage);
    if (patientFilter === "all") params.delete("patient");
    else params.set("patient", patientFilter);
    const nextSearch = params.toString() ? `?${params}` : "";
    if (nextSearch === window.location.search) {
      routeInitialized.current = true;
      return;
    }
    const nextUrl = `${window.location.pathname}${nextSearch}`;
    if (routeInitialized.current) {
      window.history.pushState(window.history.state, "", nextUrl);
    } else {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
    routeInitialized.current = true;
  }, [patientFilter, stage]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const restoreFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("stage") || "all";
      setStage(
        requested === "all" ||
          VISIT_STAGES.some((item) => item.id === requested)
          ? requested
          : "all",
      );
      setPatientFilter(params.get("patient") === "mine" ? "mine" : "all");
    };
    window.addEventListener("popstate", restoreFromUrl);
    return () => window.removeEventListener("popstate", restoreFromUrl);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        trackingBoardColumnsStorageKey,
        JSON.stringify(columns),
      );
    } catch {
      // Preferences are best effort.
    }
  }, [columns]);
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
  const resolvedCareSummaryStates =
    careSummaryStates ?? EMPTY_CARE_SUMMARY_STATES;
  const resizeState = useRef<{
    column: ColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);
  const myPatients = useMemo(
    () => filterVisitsForClinician(visits, myClinicianId),
    [visits, myClinicianId],
  );
  const patientFilteredVisits = useMemo(
    () => (patientFilter === "mine" ? myPatients : visits),
    [patientFilter, myPatients, visits],
  );
  const stageCounts = useMemo(
    () =>
      patientFilteredVisits.reduce<Record<string, number>>(
        (counts, visit) => {
          counts[visit.stage] = (counts[visit.stage] ?? 0) + 1;
          return counts;
        },
        { all: patientFilteredVisits.length },
      ),
    [patientFilteredVisits],
  );
  const filtered = useMemo(
    () => filterVisits(patientFilteredVisits, stage, "", "arrival", now),
    [patientFilteredVisits, stage, now],
  );
  const clinicianLabels = useMemo(
    () =>
      new Map(
        clinicians.map((clinician) => [
          clinician.id,
          clinicianLabel(clinician),
        ]),
      ),
    [clinicians],
  );
  const sorted = useMemo(() => {
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
      if (sortBy === "provider")
        return (
          clinicianLabels.get(
            providerAssignments[visit.id]?.clinicianId ?? "",
          ) ??
          visit.assignedProviderName ??
          "Unassigned"
        );
      if (sortBy === "reason") return visit.chiefComplaint;
      if (sortBy === "triage") return visit.triage?.summary ?? "Not recorded";
      if (sortBy === "action")
        return visit.encounterId == null ? "View patient" : "Open chart";
      if (sortBy === "wait") return operationalSortMinutes(visit, now);
      return "";
    };
    return [...filtered].sort((left, right) => {
      const leftValue = value(left);
      const rightValue = value(right);
      const comparison =
        typeof leftValue === "number" && typeof rightValue === "number"
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue));
      return (
        (sortDirection === "asc" ? comparison : -comparison) ||
        left.id.localeCompare(right.id)
      );
    });
  }, [
    clinicianLabels,
    filtered,
    now,
    providerAssignments,
    resolvedCareSummaryStates,
    sortBy,
    sortDirection,
  ]);
  const vitalReadingPresence = useMemo(
    () =>
      sorted.reduce(
        (presence, visit) => {
          const readings = vitalReadings(visit);
          if (!readings) return presence;

          presence.hasReadings = true;
          presence.hasClassifiedReadings ||= Object.values(readings).some(
            (reading) => reading.status !== "unassessed",
          );
          return presence;
        },
        { hasReadings: false, hasClassifiedReadings: false },
      ),
    [sorted],
  );
  const {
    hasReadings: hasVitalReadings,
    hasClassifiedReadings: hasClassifiedVitalReadings,
  } = vitalReadingPresence;
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
      return allColumns.filter(
        (item) => current.includes(item) || item === column,
      );
    });
  };
  const resizeColumnFromPointer = (
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    const current = resizeState.current;
    if (!current) return;
    const nextWidth = Math.min(
      600,
      current.startWidth + event.clientX - current.startX,
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
      [column]: Math.min(600, Math.max(0, widths[column] + delta)),
    }));
  };
  const tableWidth = columns.reduce(
    (total, column) => total + columnWidths[column],
    0,
  );
  const stageOptions = [{ id: "all", label: "All visits" }, ...VISIT_STAGES];
  const selectDesktopFilter = (selection: string) => {
    const next = trackingBoardFilterSelection(
      { patientFilter, stage },
      selection,
    );
    setPatientFilter(next.patientFilter);
    setStage(next.stage);
  };
  const boardDate = formatBoardDate(now, timezone);
  return (
    <section className="tracking-board" aria-label="Tracking Board">
      <header className="tracking-board-header">
        <div>
          <h1>Tracking Board</h1>
          {boardDate && <p className="tracking-board-date">{boardDate}</p>}
          <Typography variant="caption" color="text.secondary">
            All times shown in {timezone}
          </Typography>
        </div>
        <div className="tracking-header-actions">
          <div className="tracking-freshness" role="status">
            <span className="tracking-freshness-dot" aria-hidden="true" />
            {stale
              ? "Last confirmed snapshot"
              : `Updated ${formatClockTime(now, timezone)}`}
          </div>
          {onReload && (
            <Button
              variant="outlined"
              size="small"
              disabled={reloading}
              onClick={onReload}
            >
              {reloading ? "Reloading board…" : "Reload board"}
            </Button>
          )}
        </div>
      </header>
      {truncated && (
        <p className="tracking-data-warning" role="alert">
          Incomplete result: this projection is capped at 200 rows. Additional
          appointments or encounters are not shown.
        </p>
      )}
      {stale && (
        <p className="tracking-data-warning" role="status">
          Showing the last confirmed snapshot; wait times are frozen until a
          refresh succeeds.
        </p>
      )}
      {refreshError && (
        <p className="tracking-data-warning" role="alert">
          Board refresh failed: {refreshError} The last confirmed snapshot is
          still shown.
        </p>
      )}
      <div className="tracking-stage-filters" aria-label="Filter visits">
        <Button
          type="button"
          variant="outlined"
          aria-pressed={patientFilter === "mine"}
          onClick={() => selectDesktopFilter("mine")}
        >
          <span>My patients</span>
          <strong>{myPatients.length}</strong>
        </Button>
        {stageOptions.map((s) => (
          <Button
            type="button"
            variant="outlined"
            key={s.id}
            aria-pressed={
              stage === s.id && (s.id !== "all" || patientFilter === "all")
            }
            onClick={() => selectDesktopFilter(s.id)}
          >
            <span>{s.label}</span>
            <strong>
              {s.id === "all" ? visits.length : (stageCounts[s.id] ?? 0)}
            </strong>
          </Button>
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
                {s.id === "all" ? stageCounts.all : (stageCounts[s.id] ?? 0)})
              </option>
            ))}
          </select>
        </div>
        <div className="tracking-patient-select">
          <label htmlFor="board-patient-filter">Patient view</label>
          <select
            id="board-patient-filter"
            value={patientFilter}
            onChange={(event) =>
              setPatientFilter(event.target.value as "all" | "mine")
            }
          >
            <option value="all">All patients ({visits.length})</option>
            <option value="mine">My patients ({myPatients.length})</option>
          </select>
        </div>
        <details
          className="tracking-column-selector"
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !event.currentTarget.open) return;

            event.preventDefault();
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }}
        >
          <summary>Columns</summary>
          <div role="group" aria-label="Choose tracking board columns">
            {allColumns.map((column) => (
              <label key={column} htmlFor={`tracking-column-${column}`}>
                <input
                  id={`tracking-column-${column}`}
                  aria-label={`Show ${columnLabels[column]} column`}
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
        role="region"
        aria-label="Scrollable tracking board"
        onFocusCapture={(event) => {
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            event.currentTarget.contains(target)
          ) {
            target.scrollIntoView({ block: "nearest", inline: "end" });
          }
        }}
      >
        <Table
          stickyHeader
          aria-label="Clinic patient tracking board"
          className="tracking-table"
          style={{
            width: "100%",
            minWidth: tableWidth,
            tableLayout: "auto",
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
                  className={
                    column === "patient" ? "tracking-patient-cell" : undefined
                  }
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
              <TrackingBoardRow
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
                onAssignClinician={() => undefined}
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
                onClaimIntake={onClaimIntake}
                onReleaseIntake={onReleaseIntake}
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
              : "No current visits"}
          </h2>
          <p>
            {visits.length
              ? "Try another stage or show all patients."
              : "No visits are currently shown."}
          </p>
          {visits.length > 0 && (
            <Button
              variant="outlined"
              type="button"
              onClick={() => selectDesktopFilter("all")}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
export function OverviewView() {
  return (
    <section>
      <h1>Clinic overview</h1>
      <p>Patient tracking is available to assigned patient-workspace users.</p>
      <a href="/clinic/operations" className="text-link">
        Open Operations →
      </a>
    </section>
  );
}
export const Overview = memo(function Overview({
  active = true,
}: {
  active?: boolean;
}) {
  const clinic = useClinic();
  if (!clinic.capabilities.patients) return <OverviewView />;
  return <TrackingBoardPage active={active} />;
});

export function TrackingBoardPage({ active = true }: { active?: boolean }) {
  const clinic = useClinic();
  const { data, error, stale, reload, refreshing } = useTrackingBoard(active);
  const eligibleClinicians = useMemo<BoardClinician[]>(
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
        operations: trackingBoardOperationMetadata(visit),
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
  if (!data) return <LoadState error={error} onRetry={reload} />;
  return (
    <TrackingBoardView
      visits={visits}
      now={data.as_of}
      timezone={clinic.practice.timezone}
      myClinicianId={
        clinic.current_clinician_profile_id
          ? `api-provider-${clinic.current_clinician_profile_id}`
          : null
      }
      truncated={data.truncated}
      stale={stale}
      refreshError={error}
      onReload={reload}
      reloading={refreshing}
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
        reload();
        return { token: response.assignment.token };
      }}
      onClaimIntake={async (visit, expectedToken, requestKey) => {
        if (!visit.encounterId)
          throw new Error("Intake ownership is unavailable for this row.");
        await claimBoardIntake(visit.encounterId, expectedToken, requestKey);
        reload();
      }}
      onReleaseIntake={async (visit, expectedToken, requestKey) => {
        if (!visit.encounterId)
          throw new Error("Intake ownership is unavailable for this row.");
        await releaseBoardIntake(visit.encounterId, expectedToken, requestKey);
        reload();
      }}
    />
  );
}
